import { env, loadSources } from '../config.js';
import { logger, type RunErrors } from '../logger.js';
import { fetchText } from './http.js';
import { stripHtml, truncate, sanitizeUrl } from '../security/sanitize.js';
import { parseDate } from '../normalizers/date.js';
import type { RawItem, SourceHealth } from '../types.js';

/* ============================================================
 * YouTube — ผ่าน YouTube Data API v3 (ทางการ ถูกกฎหมาย)
 *
 * ต่างจาก Facebook/TikTok ตรงที่ YouTube มี API เปิดให้ใช้ได้ตรง ๆ
 * โควตาฟรี 10,000 หน่วย/วัน ไม่ต้องเปิด billing
 *   - search.list = 100 หน่วย/ครั้ง (แพงสุด → จำกัดจำนวนคำค้น)
 *   - videos.list = 1 หน่วย/ครั้ง (ดึงยอดวิวแบบ batch ได้ถึง 50 คลิป)
 *
 * ถ้าไม่มี YOUTUBE_API_KEY จะถูกข้ามและขึ้นสถานะ "ยังไม่ตั้งค่า" (configured:false)
 * เหมือน Facebook/TikTok — ไม่ทำให้ระบบล้ม
 * ========================================================== */

export interface YouTubeConfig {
  enabled: boolean;
  region?: string;
  language?: string;
  lookback_days?: number;
  max_results_per_query?: number;
  searches: string[];
}

const API = 'https://www.googleapis.com/youtube/v3';

interface SearchHit {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string | null;
}

/**
 * ดึงข้อความ error ที่อ่านรู้เรื่องจาก response ของ Google API
 * (เช่น quotaExceeded, keyInvalid) เพื่อบันทึกลง health ให้ผู้ใช้เข้าใจ
 */
export function apiErrorReason(body: string): string | null {
  try {
    const json = JSON.parse(body) as { error?: { message?: string; errors?: Array<{ reason?: string }> } };
    if (json.error) {
      const reason = json.error.errors?.[0]?.reason;
      return reason ? `${reason}: ${json.error.message ?? ''}`.trim() : json.error.message ?? 'error';
    }
  } catch {
    /* ไม่ใช่ JSON */
  }
  return null;
}

/**
 * สร้าง snippet จากคำบรรยายคลิป + ช่อง + ยอดวิว
 *
 * ห้ามใส่คำค้นของเราเองลงไป เพราะ prefilter ให้คะแนนจาก title+snippet
 * ถ้าใส่ "ล้างแอร์รถยนต์" ทุกคลิปจะได้คะแนนเต็มอัตโนมัติ แม้เป็นคลิปแอร์บ้าน
 * (บทเรียนเดียวกับ Pantip — มีเทสต์คุมที่ tests/youtube.test.ts)
 */
export function buildVideoSnippet(
  description: string,
  channelTitle: string,
  viewCount?: number,
): string {
  const viewNote =
    viewCount !== undefined ? ` · ยอดวิว ${viewCount.toLocaleString('th-TH')} ครั้ง` : '';
  const channel = channelTitle ? ` (ช่อง: ${channelTitle})` : '';
  return truncate(`${description}${channel}${viewNote}`.trim(), 400);
}

async function searchVideos(
  query: string,
  cfg: YouTubeConfig,
  publishedAfter: string,
): Promise<SearchHit[]> {
  const u = new URL(`${API}/search`);
  u.searchParams.set('key', env.youtubeApiKey);
  u.searchParams.set('part', 'snippet');
  u.searchParams.set('q', query);
  u.searchParams.set('type', 'video');
  u.searchParams.set('order', 'date'); // ล่าสุดก่อน — เหมาะกับรายงานรายวัน
  u.searchParams.set('publishedAfter', publishedAfter);
  u.searchParams.set('maxResults', String(cfg.max_results_per_query ?? 10));
  if (cfg.region) u.searchParams.set('regionCode', cfg.region);
  if (cfg.language) u.searchParams.set('relevanceLanguage', cfg.language);

  const body = await fetchText(u.toString(), { accept: 'application/json' });
  const reason = apiErrorReason(body);
  if (reason) throw new Error(reason);

  const json = JSON.parse(body) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string };
    }>;
  };

  const hits: SearchHit[] = [];
  for (const item of json.items ?? []) {
    const videoId = item.id?.videoId;
    if (!videoId) continue;
    hits.push({
      videoId,
      title: stripHtml(item.snippet?.title ?? ''),
      description: stripHtml(item.snippet?.description ?? ''),
      channelTitle: stripHtml(item.snippet?.channelTitle ?? ''),
      publishedAt: parseDate(item.snippet?.publishedAt ?? null),
    });
  }
  return hits;
}

/** ดึงยอดวิวแบบ batch (สูงสุด 50 id ต่อครั้ง = 1 หน่วยโควตา) */
async function fetchViewCounts(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const u = new URL(`${API}/videos`);
    u.searchParams.set('key', env.youtubeApiKey);
    u.searchParams.set('part', 'statistics');
    u.searchParams.set('id', batch.join(','));
    const body = await fetchText(u.toString(), { accept: 'application/json' });
    if (apiErrorReason(body)) return out; // ยอดวิวเป็นข้อมูลเสริม — ล้มเหลวก็ปล่อยผ่าน
    const json = JSON.parse(body) as {
      items?: Array<{ id?: string; statistics?: { viewCount?: string } }>;
    };
    for (const item of json.items ?? []) {
      if (item.id && item.statistics?.viewCount) {
        out.set(item.id, Number(item.statistics.viewCount) || 0);
      }
    }
  }
  return out;
}

export async function collectYouTube(
  errors: RunErrors,
): Promise<{ items: RawItem[]; health: SourceHealth[] }> {
  const cfg = loadSources().youtube;
  const started = Date.now();

  if (!cfg?.enabled) return { items: [], health: [] };

  // ยังไม่ตั้งค่า key → ข้ามแบบเดียวกับ FB/TikTok (สถานะ "ยังไม่ตั้งค่า" สีเทา)
  if (!env.youtubeApiKey) {
    return {
      items: [],
      health: [
        {
          sourceId: 'youtube',
          sourceName: 'YouTube (คำค้นที่ติดตาม)',
          ok: false,
          itemCount: 0,
          durationMs: Date.now() - started,
          error:
            'ยังไม่ได้ตั้งค่า YOUTUBE_API_KEY — ขอ key ฟรีที่ Google Cloud Console ' +
            '(เปิดใช้ YouTube Data API v3) ไม่ต้องผูกบัตร',
          configured: false,
        },
      ],
    };
  }

  const lookbackDays = cfg.lookback_days ?? 30;
  const publishedAfter = new Date(Date.now() - lookbackDays * 86400_000).toISOString();

  // เก็บผลทั้งหมดไว้ก่อน แล้วค่อยดึงยอดวิวทีเดียวแบบ batch (ประหยัดโควตา)
  const collected: Array<{ hit: SearchHit; query: string }> = [];
  let ok = 0;
  let lastError: string | undefined;

  for (const query of cfg.searches ?? []) {
    try {
      const hits = await searchVideos(query, cfg, publishedAfter);
      for (const hit of hits) collected.push({ hit, query });
      ok++;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      errors.capture(`youtube:${query}`, err);
      // quotaExceeded/keyInvalid = หยุดยิงต่อ ไม่ให้เปลืองเปล่า
      if (/quota|keyInvalid|forbidden/i.test(lastError)) break;
    }
  }

  let views = new Map<string, number>();
  try {
    views = await fetchViewCounts([...new Set(collected.map((c) => c.hit.videoId))]);
  } catch (err) {
    logger.debug({ err: String(err) }, 'youtube view-count fetch failed');
  }

  const items: RawItem[] = [];
  const seen = new Set<string>();
  for (const { hit } of collected) {
    if (seen.has(hit.videoId)) continue; // คลิปเดียวกันอาจโผล่หลายคำค้น
    seen.add(hit.videoId);

    const link = sanitizeUrl(`https://www.youtube.com/watch?v=${hit.videoId}`);
    if (!link || !hit.title) continue;

    const snippet = buildVideoSnippet(hit.description, hit.channelTitle, views.get(hit.videoId));

    items.push({
      title: truncate(hit.title, 300),
      link,
      snippet,
      publishedAt: hit.publishedAt,
      sourceId: 'youtube',
      sourceName: `YouTube · ${hit.channelTitle || 'ไม่ทราบช่อง'}`,
      sourceTier: 3,
      sourceCountry: 'TH',
      language: 'th',
      unverified: true,
      itemKind: 'social',
    });
  }

  logger.info({ queries: ok, videos: items.length }, 'youtube collection finished');

  return {
    items,
    health: [
      {
        sourceId: 'youtube',
        sourceName: 'YouTube (คำค้นที่ติดตาม)',
        ok: ok > 0,
        itemCount: items.length,
        durationMs: Date.now() - started,
        error: ok === 0 ? `เรียก YouTube API ไม่สำเร็จ (${lastError ?? 'ไม่ทราบสาเหตุ'})` : undefined,
        configured: true,
      },
    ],
  };
}
