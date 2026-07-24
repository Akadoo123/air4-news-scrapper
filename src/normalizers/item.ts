import { env, loadSources } from '../config.js';
import { canonicalizeUrl, contentHash, idFromUrl } from './url.js';
import { stripHtml, truncate } from '../security/sanitize.js';
import { prefilter } from '../analysis/prefilter.js';
import type { NormalizedItem, RawItem } from '../types.js';

/**
 * Raw -> Normalized: sanitize, canonicalize, hash, and run the rule-based prefilter.
 * Items whose URL cannot be canonicalized are dropped (unsafe or unparseable).
 */
export function normalizeItems(raw: RawItem[], now = new Date()): NormalizedItem[] {
  const maxSnippet = loadSources().policy.max_snippet_chars;
  const collectedAt = now.toISOString();
  const out: NormalizedItem[] = [];

  for (const r of raw) {
    const canonical = canonicalizeUrl(r.link);
    if (!canonical) continue;

    const title = truncate(stripHtml(r.title), 300);
    if (!title) continue;
    const snippet = truncate(stripHtml(r.snippet ?? ''), maxSnippet);

    const pf = prefilter(title, snippet, r);

    out.push({
      ...r,
      title,
      snippet,
      // ค่า default ของ schema — ใส่ที่นี่เพื่อให้ collector ไม่ต้องระบุทุกครั้ง
      unverified: r.unverified ?? false,
      itemKind: r.itemKind ?? 'news',
      id: idFromUrl(canonical),
      canonicalUrl: canonical,
      contentHash: contentHash(title, snippet),
      collectedAt,
      publishedAt: r.publishedAt,
      isPressRelease: pf.isPressRelease,
      isSponsored: pf.isSponsored,
      prefilterScore: pf.score,
      matchedCategories: pf.categories,
      matchedCompetitors: pf.competitors,
      matchedBrands: pf.brands,
      hasAutomotiveContext: pf.hasAutomotiveContext,
      relatedCoverage: [],
    });
  }

  return out;
}

/** Keep only items published inside the lookback window (undated items are kept but flagged). */
export function filterByRecency(
  items: NormalizedItem[],
  lookbackHours = env.lookbackHours,
  now = Date.now(),
  socialLookbackHours = env.socialLookbackHours,
): { kept: NormalizedItem[]; droppedStale: number; undated: number } {
  const kept: NormalizedItem[] = [];
  let droppedStale = 0;
  let undated = 0;

  /* ข่าวกับเสียงจากโซเชียลมีอายุการใช้งานต่างกัน
     ข่าวเก่า 3 วันคือข่าวตกไปแล้ว แต่กระทู้ "แอร์รถยนต์ไม่เย็น" เมื่อ 2 สัปดาห์ก่อน
     ยังสะท้อนความต้องการของลูกค้าในปัจจุบันอยู่ จึงให้หน้าต่างเวลากว้างกว่า */
  const windowFor = (it: NormalizedItem) =>
    it.itemKind === 'social' ? socialLookbackHours : lookbackHours;

  for (const it of items) {
    if (!it.publishedAt) {
      // No publish date: keep (feeds often omit it) but it will score lower on confidence.
      undated++;
      kept.push(it);
      continue;
    }
    const t = Date.parse(it.publishedAt);
    if (Number.isNaN(t)) {
      undated++;
      kept.push(it);
      continue;
    }
    if (now - t > windowFor(it) * 3600 * 1000) {
      droppedStale++;
      continue;
    }
    kept.push(it);
  }

  return { kept, droppedStale, undated };
}
