import { env, loadSources, type FeedSource } from '../config.js';
import { logger, type RunErrors } from '../logger.js';
import { fetchText, isAllowedByRobots } from './http.js';
import { parseFeed } from '../parsers/feed.js';
import { buildAllQueries, googleNewsUrl } from './queries.js';
import { collectSocial } from './social.js';
import { collectYouTube } from './youtube.js';
import { collectWeatherSignals } from './weather.js';
import { truncate, stripHtml } from '../security/sanitize.js';
import type { RawItem, SourceHealth } from '../types.js';

export interface CollectResult {
  items: RawItem[];
  health: SourceHealth[];
}

/**
 * Collect from every configured source.
 * A failing source is recorded in `health` and skipped — it never aborts the run.
 */
export async function collectAll(errors: RunErrors): Promise<CollectResult> {
  const sources = loadSources();
  const items: RawItem[] = [];
  const health: SourceHealth[] = [];

  // ---- 1) Direct RSS/Atom feeds ----
  const feeds = sources.feeds.filter((f) => f.enabled);
  const feedResults = await Promise.allSettled(
    feeds.map((f) => collectFeed(f, sources.policy.max_snippet_chars)),
  );

  feedResults.forEach((res, i) => {
    const feed = feeds[i];
    if (res.status === 'fulfilled') {
      items.push(...res.value.items);
      health.push(res.value.health);
    } else {
      const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
      errors.capture(`feed:${feed.id}`, msg);
      health.push({
        sourceId: feed.id,
        sourceName: feed.name,
        ok: false,
        itemCount: 0,
        durationMs: 0,
        error: msg,
      });
    }
  });

  // ---- 2) Google News RSS search ----
  if (sources.google_news.enabled) {
    const gn = await collectGoogleNews(errors);
    items.push(...gn.items);
    health.push(...gn.health);
  }

  // ---- 3) Social listening (Pantip ใช้ได้ทันที / FB,TikTok ต้องมี credential) ----
  try {
    const social = await collectSocial(errors);
    items.push(...social.items);
    health.push(...social.health);
  } catch (err) {
    errors.capture('social', err);
  }

  // ---- 3.5) YouTube (Data API v3 — ต้องมี YOUTUBE_API_KEY) ----
  try {
    const yt = await collectYouTube(errors);
    items.push(...yt.items);
    health.push(...yt.health);
  } catch (err) {
    errors.capture('youtube', err);
  }

  // ---- 4) Weather / air-quality demand signals ----
  try {
    const weather = await collectWeatherSignals(errors);
    items.push(...weather.items);
    health.push(...weather.health);
  } catch (err) {
    errors.capture('weather', err);
  }

  // ---- 5) NewsAPI (only when a key is present) ----
  if (sources.newsapi.enabled_if_key && env.newsApiKey) {
    try {
      const na = await collectNewsApi(errors);
      items.push(...na.items);
      health.push(...na.health);
    } catch (err) {
      errors.capture('newsapi', err);
    }
  }

  logger.info({ collected: items.length, sources: health.length }, 'collection finished');
  return { items, health };
}

/* ---------------- Direct feeds ---------------- */

async function collectFeed(
  feed: FeedSource,
  maxSnippet: number,
): Promise<{ items: RawItem[]; health: SourceHealth }> {
  const started = Date.now();
  const allowed = await isAllowedByRobots(feed.url).catch(() => true);
  if (!allowed) {
    return {
      items: [],
      health: {
        sourceId: feed.id,
        sourceName: feed.name,
        ok: false,
        itemCount: 0,
        durationMs: Date.now() - started,
        error: 'blocked by robots.txt',
      },
    };
  }

  const xml = await fetchText(feed.url);
  const entries = parseFeed(xml, maxSnippet).slice(0, env.maxNewsPerSource);

  const items: RawItem[] = entries.map((e) => ({
    title: e.title,
    link: e.link,
    snippet: e.snippet,
    publishedAt: e.publishedAt,
    sourceId: feed.id,
    sourceName: e.publisherName ? `${feed.name} / ${e.publisherName}` : feed.name,
    sourceTier: feed.tier,
    sourceCountry: feed.country,
    language: feed.language,
    unverified: feed.unverified ?? false,
  }));

  return {
    items,
    health: {
      sourceId: feed.id,
      sourceName: feed.name,
      ok: true,
      itemCount: items.length,
      durationMs: Date.now() - started,
    },
  };
}

/* ---------------- Google News ---------------- */

async function collectGoogleNews(errors: RunErrors): Promise<CollectResult> {
  const cfg = loadSources().google_news;
  const queries = buildAllQueries();
  const items: RawItem[] = [];
  const health: SourceHealth[] = [];

  for (const locale of cfg.locales) {
    const started = Date.now();
    // Match query language to the locale to avoid noise (Thai queries in a Thai locale).
    const pool = queries.filter((q) =>
      locale.language === 'th' ? q.language === 'th' : q.language === 'en',
    );
    const selected = pool.slice(0, cfg.max_queries_per_locale);

    let ok = 0;
    let failed = 0;
    let lastError: string | undefined;

    for (const query of selected) {
      const url = googleNewsUrl(cfg.endpoint, query.q, locale, env.lookbackHours);
      try {
        const xml = await fetchText(url);
        const entries = parseFeed(xml).slice(0, cfg.max_items_per_query);
        for (const e of entries) {
          items.push({
            title: e.title,
            link: e.link,
            // Google News descriptions are link markup; keep only readable text.
            snippet: truncate(stripHtml(e.snippet), 400),
            publishedAt: e.publishedAt,
            sourceId: `google-news:${locale.id}`,
            sourceName: e.publisherName ?? 'Google News',
            sourceTier: cfg.tier,
            sourceCountry: locale.country,
            language: locale.language,
            unverified: false,
          });
        }
        ok++;
      } catch (err) {
        failed++;
        lastError = err instanceof Error ? err.message : String(err);
        errors.capture(`google-news:${locale.id}:${query.q}`, err);
      }
    }

    health.push({
      sourceId: `google-news:${locale.id}`,
      sourceName: `Google News (${locale.id})`,
      ok: ok > 0,
      itemCount: items.filter((i) => i.sourceId === `google-news:${locale.id}`).length,
      durationMs: Date.now() - started,
      error: failed > 0 ? `${failed}/${selected.length} queries failed (last: ${lastError})` : undefined,
    });
  }

  return { items, health };
}

/* ---------------- NewsAPI (optional) ---------------- */

async function collectNewsApi(errors: RunErrors): Promise<CollectResult> {
  const cfg = loadSources().newsapi;
  const queries = buildAllQueries().slice(0, cfg.max_queries);
  const items: RawItem[] = [];
  const started = Date.now();
  let ok = 0;

  const from = new Date(Date.now() - env.lookbackHours * 3600 * 1000).toISOString();

  for (const query of queries) {
    const u = new URL(cfg.endpoint);
    u.searchParams.set('q', query.q);
    u.searchParams.set('from', from);
    u.searchParams.set('pageSize', String(cfg.page_size));
    u.searchParams.set('sortBy', 'publishedAt');
    u.searchParams.set('apiKey', env.newsApiKey);

    try {
      const body = await fetchText(u.toString(), { accept: 'application/json' });
      const json = JSON.parse(body) as {
        status?: string;
        articles?: Array<{
          title?: string;
          url?: string;
          description?: string;
          publishedAt?: string;
          source?: { name?: string };
        }>;
      };
      if (json.status !== 'ok' || !json.articles) continue;
      for (const a of json.articles) {
        if (!a.title || !a.url) continue;
        items.push({
          title: stripHtml(a.title),
          link: a.url,
          snippet: truncate(stripHtml(a.description ?? ''), 400),
          publishedAt: a.publishedAt ?? null,
          sourceId: 'newsapi',
          sourceName: a.source?.name ?? 'NewsAPI',
          sourceTier: cfg.tier,
          sourceCountry: 'GLOBAL',
          language: query.language,
          unverified: false,
        });
      }
      ok++;
    } catch (err) {
      errors.capture(`newsapi:${query.q}`, err);
    }
  }

  return {
    items,
    health: [
      {
        sourceId: 'newsapi',
        sourceName: 'NewsAPI',
        ok: ok > 0,
        itemCount: items.length,
        durationMs: Date.now() - started,
      },
    ],
  };
}
