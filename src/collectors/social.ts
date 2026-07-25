import { env, loadSources } from '../config.js';
import { logger, type RunErrors } from '../logger.js';
import { fetchText, isAllowedByRobots } from './http.js';
import { stripHtml, truncate, sanitizeUrl } from '../security/sanitize.js';
import { parseDate } from '../normalizers/date.js';
import type { RawItem, SourceHealth } from '../types.js';

/* ============================================================
 * Social listening
 *
 * ผลการตรวจ robots.txt จริง (2026-07-21) เป็นตัวกำหนดวิธีเข้าถึงแต่ละแพลตฟอร์ม:
 *
 *   Pantip    robots.txt อนุญาตทุกเส้นทางยกเว้น /ads.php
 *             → ดึงได้โดยตรง อ่านจาก __NEXT_DATA__ ที่เซิร์ฟเวอร์ส่งมากับหน้าเว็บ
 *             → ไม่ต้องใช้ credential ใด ๆ  ✅ ใช้งานได้ทันที
 *
 *   Facebook  robots.txt ระบุ "User-agent: *  Disallow: /"
 *             → ห้าม crawl ทุกกรณี ระบบนี้จึงไม่ scrape เด็ดขาด
 *             → ทางเดียวที่ถูกต้องคือ Graph API ด้วย Page Access Token
 *               ซึ่งเข้าถึงได้เฉพาะเพจที่บริษัทเป็นเจ้าของ/ดูแลเท่านั้น
 *
 *   TikTok    robots.txt อนุญาต /tag แต่บล็อก bot ของ AI หลายตัว
 *             และเนื้อหาถูก render ด้วย JS + ToS จำกัดการ scrape
 *             → ใช้ทางการผ่าน Display API token เท่านั้น
 *
 * ทุก adapter ที่ต้องใช้ credential จะถูกข้ามอย่างเงียบ ๆ เมื่อไม่ได้ตั้งค่า
 * และรายงานใน Source Health ว่าต้องตั้งค่าอะไรจึงจะเปิดใช้ได้
 * ========================================================== */

export interface SocialSourceConfig {
  id: string;
  name: string;
  platform: 'pantip' | 'facebook' | 'tiktok';
  enabled: boolean;
  /** Pantip: ชื่อแท็กที่ติดตาม (ต้องเป็นแท็กที่มีอยู่จริง มิฉะนั้นจะได้ 404) */
  tags?: string[];
  /** Pantip: คำค้นหา — ยืดหยุ่นกว่าแท็ก ใช้กับหัวข้อเฉพาะของ Air4 */
  searches?: string[];
  /** Facebook: page id ที่บริษัทดูแล */
  pageIds?: string[];
  /** TikTok: hashtag ที่ติดตาม */
  hashtags?: string[];
  max_items?: number;
}

const skipped = (
  id: string,
  name: string,
  reason: string,
  started: number,
  configured = true,
): SourceHealth => ({
  sourceId: id,
  sourceName: name,
  ok: false,
  itemCount: 0,
  durationMs: Date.now() - started,
  error: reason,
  configured,
});

/* ------------------------------------------------------------
 * Pantip — ใช้งานได้ทันที ไม่ต้องมี credential
 * ---------------------------------------------------------- */

interface PantipTopic {
  id?: number | string;
  topic_id?: number | string;
  title?: string;
  /** เนื้อหากระทู้ — หน้าค้นหาส่งมาด้วย ใช้เป็น snippet จริง */
  detail?: string;
  /** ความเห็นที่ตรงกับคำค้น — มักมีข้อมูลตลาดที่มีค่า */
  comment?: string;
  url?: string;
  /** ISO string (หน้าแท็ก) หรือ Unix epoch เป็นวินาที (หน้าค้นหา) */
  created_time?: string | number;
  last_reply_time?: string | number;
  tags?: unknown[];
}

/**
 * Pantip ส่งเวลามา 2 รูปแบบ: ISO string (หน้าแท็ก) และ Unix epoch วินาที (หน้าค้นหา)
 * ถ้าอ่าน epoch ไม่ออก กระทู้จะกลายเป็น "ไม่มีวันที่" ทั้งหมด
 * ทำให้ตัวกรองความสดของข่าวใช้งานไม่ได้
 */
export function parsePantipTime(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (/^\d{9,11}$/.test(raw)) {
    const ms = Number(raw) * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return parseDate(raw);
}

/**
 * ดึง __NEXT_DATA__ ออกจากหน้า HTML ของ Pantip
 * แยกเป็นฟังก์ชันเพื่อให้ทดสอบได้โดยไม่ต้องต่อเครือข่าย
 */
/**
 * ผลการค้นหาของ Pantip ใส่เครื่องหมายไฮไลต์ {{em}}…{{eem}} รอบคำที่ตรงกับคำค้น
 * ต้องถอดออกก่อน มิฉะนั้นหัวข้อข่าวจะมีสัญลักษณ์แปลกปลอมไปแสดงบน Dashboard
 */
export function stripPantipHighlight(title: string): string {
  return title.replace(/\{\{\/?e?em\}\}/g, '');
}

export function extractPantipTopics(html: string): PantipTopic[] {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m) return [];

  let json: unknown;
  try {
    json = JSON.parse(m[1]);
  } catch {
    return [];
  }

  // โครงสร้าง JSON ของ Pantip เปลี่ยนได้ จึงค้นหาอาเรย์ที่หน้าตาเหมือนรายการกระทู้
  const walk = (node: unknown, depth = 0): PantipTopic[] | null => {
    if (depth > 8 || node === null || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      const first = node[0];
      if (
        node.length > 0 &&
        first &&
        typeof first === 'object' &&
        'title' in (first as object) &&
        ('id' in (first as object) || 'topic_id' in (first as object))
      ) {
        return node as PantipTopic[];
      }
      for (const child of node) {
        const found = walk(child, depth + 1);
        if (found) return found;
      }
      return null;
    }
    for (const value of Object.values(node as Record<string, unknown>)) {
      const found = walk(value, depth + 1);
      if (found) return found;
    }
    return null;
  };

  return walk(json) ?? [];
}

async function collectPantip(
  src: SocialSourceConfig,
  errors: RunErrors,
): Promise<{ items: RawItem[]; health: SourceHealth }> {
  const started = Date.now();
  const items: RawItem[] = [];
  const maxItems = src.max_items ?? 15;
  let ok = 0;

  /** ดึงกระทู้จาก URL เดียว (หน้าแท็กหรือหน้าค้นหา ใช้โครงสร้าง __NEXT_DATA__ เหมือนกัน) */
  const harvest = async (url: string, label: string, kind: 'แท็ก' | 'คำค้น') => {
    try {
      // เคารพ robots.txt เสมอ แม้จะตรวจแล้วว่าอนุญาต
      if (!(await isAllowedByRobots(url))) {
        errors.capture(`pantip:${label}`, 'robots.txt ไม่อนุญาต');
        return;
      }
      const html = await fetchText(url, { accept: 'text/html' });
      const topics = extractPantipTopics(html).slice(0, maxItems);

      for (const t of topics) {
        const id = t.id ?? t.topic_id;
        const title = stripHtml(stripPantipHighlight(t.title ?? ''));
        if (!id || !title) continue;
        const link = sanitizeUrl(t.url ?? `https://pantip.com/topic/${id}`);
        if (!link) continue;

        /* ใช้เนื้อหากระทู้จริงเป็น snippet — สำคัญ 2 อย่าง:
           1) prefilter ให้คะแนนจาก title + snippet ถ้าใส่คำค้นของเราเองลงไป
              ทุกกระทู้จะได้คะแนนเต็มอัตโนมัติ แม้จะเป็นเรื่องแอร์บ้าน
           2) ถ้าใส่ข้อความ boilerplate เหมือนกันทุกกระทู้ ตัวตัดข่าวซ้ำจะมองว่า
              summary เหมือนกันหมดแล้วยุบทุกกระทู้เหลือชิ้นเดียว
           ที่มา (แท็ก/คำค้น) จึงเก็บไว้ใน sourceName แทน */
        const body = stripHtml(stripPantipHighlight(t.detail ?? t.comment ?? ''));

        items.push({
          title,
          link,
          snippet: truncate(body, 400),
          publishedAt: parsePantipTime(t.created_time ?? t.last_reply_time ?? null),
          sourceId: `pantip:${label}`,
          sourceName: `Pantip (${kind} ${label})`,
          sourceTier: 3,
          sourceCountry: 'TH',
          language: 'th',
          unverified: true,
          itemKind: 'social',
        });
      }
      ok++;
    } catch (err) {
      errors.capture(`pantip:${label}`, err);
    }
  };

  for (const tag of src.tags ?? []) {
    await harvest(`https://pantip.com/tag/${encodeURIComponent(tag)}`, tag, 'แท็ก');
  }
  // คำค้นหาครอบคลุมหัวข้อที่ไม่มีแท็กรองรับ เช่น "ล้างแอร์รถยนต์"
  for (const q of src.searches ?? []) {
    await harvest(`https://pantip.com/search?q=${encodeURIComponent(q)}`, q, 'คำค้น');
  }

  return {
    items,
    health: {
      sourceId: src.id,
      sourceName: src.name,
      ok: ok > 0,
      itemCount: items.length,
      durationMs: Date.now() - started,
      error: ok === 0 ? 'ดึงข้อมูลไม่สำเร็จทุกแท็ก' : undefined,
    },
  };
}

/* ------------------------------------------------------------
 * Facebook — Graph API เท่านั้น (robots.txt ห้าม crawl)
 * ---------------------------------------------------------- */

async function collectFacebook(
  src: SocialSourceConfig,
  errors: RunErrors,
): Promise<{ items: RawItem[]; health: SourceHealth }> {
  const started = Date.now();

  if (!env.facebookPageToken) {
    return {
      items: [],
      health: skipped(
        src.id,
        src.name,
        'ยังไม่ได้ตั้งค่า FACEBOOK_PAGE_TOKEN — robots.txt ของ Facebook ห้าม crawl ' +
          'จึงต้องใช้ Graph API เท่านั้น (เข้าถึงได้เฉพาะเพจที่บริษัทดูแล)',
        started,
        false,
      ),
    };
  }

  const items: RawItem[] = [];
  let ok = 0;

  for (const pageId of src.pageIds ?? []) {
    const u = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/posts`);
    u.searchParams.set('fields', 'id,message,created_time,permalink_url');
    u.searchParams.set('limit', String(src.max_items ?? 15));
    u.searchParams.set('access_token', env.facebookPageToken);

    try {
      const body = await fetchText(u.toString(), { accept: 'application/json' });
      const json = JSON.parse(body) as {
        data?: Array<{ id: string; message?: string; created_time?: string; permalink_url?: string }>;
        error?: { message?: string };
      };
      if (json.error) throw new Error(json.error.message ?? 'Graph API error');

      for (const post of json.data ?? []) {
        const text = stripHtml(post.message ?? '');
        const link = sanitizeUrl(post.permalink_url ?? `https://www.facebook.com/${post.id}`);
        if (!text || !link) continue;
        items.push({
          title: truncate(text, 160),
          link,
          snippet: truncate(text, 400),
          publishedAt: parseDate(post.created_time ?? null),
          sourceId: `facebook:${pageId}`,
          sourceName: `Facebook (${pageId})`,
          sourceTier: 3,
          sourceCountry: 'TH',
          language: 'th',
          unverified: true,
          itemKind: 'social',
        });
      }
      ok++;
    } catch (err) {
      errors.capture(`facebook:${pageId}`, err);
    }
  }

  return {
    items,
    health: {
      sourceId: src.id,
      sourceName: src.name,
      ok: ok > 0,
      itemCount: items.length,
      durationMs: Date.now() - started,
      error: ok === 0 ? 'เรียก Graph API ไม่สำเร็จ' : undefined,
    },
  };
}

/* ------------------------------------------------------------
 * TikTok — Display API เท่านั้น
 * ---------------------------------------------------------- */

async function collectTikTok(
  src: SocialSourceConfig,
  errors: RunErrors,
): Promise<{ items: RawItem[]; health: SourceHealth }> {
  const started = Date.now();

  if (!env.tiktokAccessToken) {
    return {
      items: [],
      health: skipped(
        src.id,
        src.name,
        'ยังไม่ได้ตั้งค่า TIKTOK_ACCESS_TOKEN — เนื้อหา TikTok ถูก render ด้วย JS ' +
          'และ ToS จำกัดการ scrape จึงต้องใช้ Display API เท่านั้น',
        started,
        false,
      ),
    };
  }

  const items: RawItem[] = [];
  let ok = 0;

  for (const hashtag of src.hashtags ?? []) {
    try {
      const body = await fetchText(
        `https://open.tiktokapis.com/v2/research/video/query/?fields=id,video_description,create_time`,
        { accept: 'application/json' },
      );
      const json = JSON.parse(body) as {
        data?: { videos?: Array<{ id: string; video_description?: string; create_time?: number }> };
      };
      for (const v of json.data?.videos ?? []) {
        const text = stripHtml(v.video_description ?? '');
        if (!text) continue;
        const link = sanitizeUrl(`https://www.tiktok.com/video/${v.id}`);
        if (!link) continue;
        items.push({
          title: truncate(text, 160),
          link,
          snippet: truncate(text, 400),
          publishedAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
          sourceId: `tiktok:${hashtag}`,
          sourceName: `TikTok (#${hashtag})`,
          sourceTier: 3,
          sourceCountry: 'TH',
          language: 'th',
          unverified: true,
          itemKind: 'social',
        });
      }
      ok++;
    } catch (err) {
      errors.capture(`tiktok:${hashtag}`, err);
    }
  }

  return {
    items,
    health: {
      sourceId: src.id,
      sourceName: src.name,
      ok: ok > 0,
      itemCount: items.length,
      durationMs: Date.now() - started,
      error: ok === 0 ? 'เรียก TikTok API ไม่สำเร็จ' : undefined,
    },
  };
}

/* ------------------------------------------------------------ */

export async function collectSocial(
  errors: RunErrors,
): Promise<{ items: RawItem[]; health: SourceHealth[] }> {
  const cfg = loadSources().social;
  if (!cfg?.enabled) return { items: [], health: [] };

  const items: RawItem[] = [];
  const health: SourceHealth[] = [];

  for (const src of cfg.sources.filter((s) => s.enabled)) {
    try {
      const handler =
        src.platform === 'pantip'
          ? collectPantip
          : src.platform === 'facebook'
            ? collectFacebook
            : collectTikTok;
      const res = await handler(src, errors);
      items.push(...res.items);
      health.push(res.health);
    } catch (err) {
      errors.capture(`social:${src.id}`, err);
      health.push(skipped(src.id, src.name, String(err), Date.now()));
    }
  }

  logger.info({ items: items.length, sources: health.length }, 'social collection finished');
  return { items, health };
}
