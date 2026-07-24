import type { NormalizedItem } from '../types.js';

/* ============================================================
 * Multi-signal deduplication
 *   1) canonical URL
 *   2) content hash (title + snippet)
 *   3) title similarity      (token Jaccard + char trigram)
 *   4) summary similarity
 * เหตุการณ์เดียวกันจากหลายสำนักข่าว -> เลือก Tier ที่ดีที่สุดเป็นข่าวหลัก
 *   ที่เหลือกลายเป็น relatedCoverage และไม่ถูกนับซ้ำใน KPI
 * ========================================================== */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'at', 'by', 'from', 'as', 'be', 'it', 'that', 'this', 'new', 'says', 'said',
  'ที่', 'และ', 'ของ', 'ใน', 'กับ', 'เป็น', 'ได้', 'ให้', 'จาก', 'มี', 'ไม่', 'จะ',
]);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Character trigrams — needed because Thai text has no spaces to tokenize on. */
export function trigrams(s: string): Set<string> {
  const clean = s.toLowerCase().replace(/\s+/g, '');
  const out = new Set<string>();
  for (let i = 0; i + 3 <= clean.length; i++) out.add(clean.slice(i, i + 3));
  return out;
}

/** Combined similarity in [0,1]: max of token Jaccard and trigram Jaccard. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tok = jaccard(new Set(tokenize(a)), new Set(tokenize(b)));
  const tri = jaccard(trigrams(a), trigrams(b));
  return Math.max(tok, tri);
}

/**
 * เกณฑ์ที่ปรับจากการวัดจริงกับพาดหัวภาษาไทย:
 *   ข่าวเดียวกันคนละสำนัก  ~0.40–0.50
 *   ข่าวคนละเรื่อง          ~0.00–0.22
 * ช่วง 0.33–0.55 ถือว่า "น่าจะซ้ำ" จึงต้องมีวันที่เผยแพร่ใกล้กันประกอบ
 * เพื่อกันการรวมพาดหัวที่ขึ้นต้นเหมือนกันแต่คนละเหตุการณ์
 */
export const DEDUPE_DEFAULTS = {
  titleThreshold: 0.33,
  strongTitleThreshold: 0.55,
  summaryThreshold: 0.65,
  /** ระยะห่างของวันที่เผยแพร่ที่ยังถือว่าเป็นเหตุการณ์เดียวกัน */
  sameEventWindowHours: 72,
} as const;

export interface DedupeOptions {
  titleThreshold?: number;
  strongTitleThreshold?: number;
  summaryThreshold?: number;
  sameEventWindowHours?: number;
}

/** ข่าวสองชิ้นเผยแพร่ใกล้กันพอที่จะเป็นเหตุการณ์เดียวกันหรือไม่ */
function publishedCloseTogether(
  a: NormalizedItem,
  b: NormalizedItem,
  windowHours: number,
): boolean {
  // ถ้าฝั่งใดไม่มีวันที่ ให้ผ่าน (ฟีดจำนวนมากไม่ส่งวันที่มา)
  if (!a.publishedAt || !b.publishedAt) return true;
  const ta = Date.parse(a.publishedAt);
  const tb = Date.parse(b.publishedAt);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return true;
  return Math.abs(ta - tb) <= windowHours * 3600 * 1000;
}

export interface DedupeResult {
  items: NormalizedItem[];
  duplicatesRemoved: number;
  groups: number;
}

/** Prefer Tier 1, then a real publish date, then the longer snippet. */
function isBetterPrimary(candidate: NormalizedItem, current: NormalizedItem): boolean {
  if (candidate.sourceTier !== current.sourceTier) return candidate.sourceTier < current.sourceTier;
  const cHas = candidate.publishedAt ? 1 : 0;
  const uHas = current.publishedAt ? 1 : 0;
  if (cHas !== uHas) return cHas > uHas;
  if (candidate.unverified !== current.unverified) return !candidate.unverified;
  return candidate.snippet.length > current.snippet.length;
}

export function deduplicate(items: NormalizedItem[], opts: DedupeOptions = {}): DedupeResult {
  const titleThreshold = opts.titleThreshold ?? DEDUPE_DEFAULTS.titleThreshold;
  const strongTitleThreshold = opts.strongTitleThreshold ?? DEDUPE_DEFAULTS.strongTitleThreshold;
  const summaryThreshold = opts.summaryThreshold ?? DEDUPE_DEFAULTS.summaryThreshold;
  const windowHours = opts.sameEventWindowHours ?? DEDUPE_DEFAULTS.sameEventWindowHours;

  const byUrl = new Map<string, number>();
  const byHash = new Map<string, number>();
  const primaries: NormalizedItem[] = [];
  let duplicatesRemoved = 0;

  const addRelated = (primaryIdx: number, dup: NormalizedItem) => {
    const p = primaries[primaryIdx];
    const already = p.relatedCoverage.some((r) => r.url === dup.canonicalUrl);
    const sameOutlet = p.sourceName === dup.sourceName;
    if (!already && !sameOutlet) {
      p.relatedCoverage.push({
        sourceName: dup.sourceName,
        url: dup.canonicalUrl,
        tier: dup.sourceTier,
      });
    }
    duplicatesRemoved++;
  };

  /** Swap in a better primary while keeping the accumulated related coverage. */
  const promote = (idx: number, better: NormalizedItem) => {
    const old = primaries[idx];
    better.duplicateGroupId = old.duplicateGroupId;
    better.relatedCoverage = old.relatedCoverage;
    if (old.sourceName !== better.sourceName) {
      better.relatedCoverage.push({
        sourceName: old.sourceName,
        url: old.canonicalUrl,
        tier: old.sourceTier,
      });
    }
    byUrl.set(better.canonicalUrl, idx);
    byHash.set(better.contentHash, idx);
    primaries[idx] = better;
  };

  for (const item of items) {
    // --- signal 1: exact canonical URL ---
    const urlHit = byUrl.get(item.canonicalUrl);
    if (urlHit !== undefined) {
      if (isBetterPrimary(item, primaries[urlHit])) promote(urlHit, item);
      else addRelated(urlHit, item);
      continue;
    }

    // --- signal 2: content hash ---
    const hashHit = byHash.get(item.contentHash);
    if (hashHit !== undefined) {
      if (isBetterPrimary(item, primaries[hashHit])) promote(hashHit, item);
      else addRelated(hashHit, item);
      continue;
    }

    // --- signals 3 & 4: fuzzy title / summary similarity ---
    let matchIdx = -1;
    for (let i = 0; i < primaries.length; i++) {
      const p = primaries[i];

      const titleSim = similarity(item.title, p.title);
      if (titleSim >= strongTitleThreshold) {
        matchIdx = i;
        break;
      }
      // ช่วงคลุมเครือ: ต้องมีวันที่เผยแพร่ใกล้กันจึงจะถือว่าเป็นเหตุการณ์เดียวกัน
      if (titleSim >= titleThreshold && publishedCloseTogether(item, p, windowHours)) {
        matchIdx = i;
        break;
      }
      if (
        item.snippet.length > 80 &&
        p.snippet.length > 80 &&
        similarity(item.snippet, p.snippet) >= summaryThreshold
      ) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx >= 0) {
      const p = primaries[matchIdx];
      p.duplicateGroupId ??= p.id;
      if (isBetterPrimary(item, p)) promote(matchIdx, item);
      else addRelated(matchIdx, item);
      continue;
    }

    // --- new primary ---
    const fresh: NormalizedItem = { ...item, relatedCoverage: [...item.relatedCoverage] };
    const idx = primaries.push(fresh) - 1;
    byUrl.set(fresh.canonicalUrl, idx);
    byHash.set(fresh.contentHash, idx);
  }

  const groups = primaries.filter((p) => p.relatedCoverage.length > 0).length;
  return { items: primaries, duplicatesRemoved, groups };
}
