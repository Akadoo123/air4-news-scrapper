import { env } from '../config.js';
import { logger } from '../logger.js';
import { domainOf } from '../normalizers/url.js';

/** Per-domain politeness: never issue two requests to a host back-to-back. */
const lastHit = new Map<string, number>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function politeDelay(url: string): Promise<void> {
  const host = domainOf(url);
  if (!host) return;
  const last = lastHit.get(host) ?? 0;
  const wait = env.perDomainDelayMs - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

export interface FetchTextOptions {
  timeoutMs?: number;
  maxRetries?: number;
  accept?: string;
}

/**
 * GET a URL as text with timeout, retries and exponential backoff.
 * Throws on final failure — callers are expected to catch and degrade.
 */
export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? env.httpTimeoutMs;
  const maxRetries = opts.maxRetries ?? env.httpMaxRetries;
  const accept = opts.accept ?? 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8';

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = 800 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      logger.debug({ url, attempt, backoff }, 'retrying fetch');
      await sleep(backoff);
    }
    await politeDelay(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': env.userAgent,
          Accept: accept,
          'Accept-Language': 'th,en;q=0.9',
        },
      });
      if (!res.ok) {
        // 4xx (except 429) will not improve on retry.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        lastErr = new Error(`HTTP ${res.status} ${res.statusText}`);
        continue;
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/HTTP 4\d\d/.test(msg)) break; // permanent
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/* ---------------- robots.txt ---------------- */

const robotsCache = new Map<string, string[]>();

/**
 * Minimal robots.txt check for our user-agent (and `*`).
 * Fails open on network errors — but we only ever request public feed URLs.
 */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  let origin: string;
  let path: string;
  try {
    const u = new URL(url);
    origin = u.origin;
    path = u.pathname + u.search;
  } catch {
    return false;
  }

  let disallows = robotsCache.get(origin);
  if (!disallows) {
    disallows = [];
    try {
      const txt = await fetchText(`${origin}/robots.txt`, { maxRetries: 0, timeoutMs: 8000, accept: 'text/plain' });
      let applies = false;
      for (const line of txt.split(/\r?\n/)) {
        const clean = line.split('#')[0].trim();
        if (!clean) continue;
        const [rawKey, ...rest] = clean.split(':');
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(':').trim();
        if (key === 'user-agent') {
          applies = value === '*' || env.userAgent.toLowerCase().includes(value.toLowerCase());
        } else if (key === 'disallow' && applies && value) {
          disallows.push(value);
        }
      }
    } catch {
      // No robots.txt or unreachable -> treat as allowed.
    }
    robotsCache.set(origin, disallows);
  }

  return !disallows.some((rule) => rule !== '/' ? path.startsWith(rule) : true);
}

/** For tests. */
export const __resetHttpState = () => {
  lastHit.clear();
  robotsCache.clear();
};
