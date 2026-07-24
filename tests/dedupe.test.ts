import { describe, it, expect } from 'vitest';
import {
  deduplicate, similarity, tokenize, trigrams, jaccard, DEDUPE_DEFAULTS,
} from '../src/deduplication/dedupe.js';
import { normalizeItems } from '../src/normalizers/item.js';
import { MOCK_NEWS } from './fixtures/mock-news.js';
import type { RawItem } from '../src/types.js';

function raw(over: Partial<RawItem>): RawItem {
  return {
    title: 'ข่าวทดสอบ',
    link: 'https://example.com/a',
    snippet: '',
    publishedAt: new Date().toISOString(),
    sourceId: 's',
    sourceName: 'Source',
    sourceTier: 2,
    sourceCountry: 'TH',
    language: 'th',
    unverified: false,
    ...over,
  };
}

describe('similarity helpers', () => {
  it('tokenizes and drops stopwords', () => {
    expect(tokenize('The quick brown fox')).toEqual(['quick', 'brown', 'fox']);
  });

  it('builds character trigrams (needed for Thai, which has no spaces)', () => {
    expect(trigrams('abcd')).toEqual(new Set(['abc', 'bcd']));
  });

  it('computes jaccard overlap', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });

  // Measured on real Thai headline pairs: same-event ~0.40–0.50, unrelated ~0.00–0.22.
  it('scores same-event Thai headlines above the merge threshold', () => {
    const s = similarity(
      'โตโยต้าประกาศขยายศูนย์บริการในไทยเพิ่ม 45 แห่ง',
      'โตโยต้า เตรียมขยายศูนย์บริการในไทยอีก 45 แห่ง',
    );
    expect(s).toBeGreaterThanOrEqual(DEDUPE_DEFAULTS.titleThreshold);
  });

  it('scores unrelated headlines below the merge threshold', () => {
    expect(similarity('ยอดขายรถยนต์เพิ่มขึ้น', 'ราคาทองคำวันนี้ปรับตัวลง'))
      .toBeLessThan(DEDUPE_DEFAULTS.titleThreshold);
    // Worst realistic case: two different stories sharing a common Thai prefix.
    expect(similarity('ยอดขายรถยนต์ไฟฟ้าในไทยโต 38%', 'ยอดขายรถยนต์เดือนนี้เพิ่มขึ้น 12%'))
      .toBeLessThan(DEDUPE_DEFAULTS.titleThreshold);
  });
});

describe('deduplicate', () => {
  it('merges identical canonical URLs', () => {
    const items = normalizeItems([
      raw({ link: 'https://example.com/story?utm_source=a', sourceName: 'A' }),
      raw({ link: 'https://www.example.com/story?fbclid=b', sourceName: 'B' }),
    ]);
    const res = deduplicate(items);
    expect(res.items).toHaveLength(1);
    expect(res.duplicatesRemoved).toBe(1);
  });

  it('merges the same story published at different URLs', () => {
    const items = normalizeItems([
      raw({
        link: 'https://a.com/1',
        title: 'โตโยต้าประกาศขยายศูนย์บริการในไทยเพิ่ม 45 แห่งภายในปี 2569',
        sourceName: 'A',
      }),
      raw({
        link: 'https://b.com/2',
        title: 'โตโยต้า เตรียมขยายศูนย์บริการในประเทศไทยอีก 45 สาขา ภายในปี 2569',
        sourceName: 'B',
      }),
    ]);
    const res = deduplicate(items);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].relatedCoverage.length).toBe(1);
  });

  it('keeps the more credible source as the primary story', () => {
    const items = normalizeItems([
      raw({ link: 'https://a.com/1', title: 'ข่าวเดียวกันเรื่องศูนย์บริการรถยนต์', sourceTier: 3, sourceName: 'Blog' }),
      raw({ link: 'https://b.com/2', title: 'ข่าวเดียวกันเรื่องศูนย์บริการรถยนต์', sourceTier: 1, sourceName: 'ทางการ' }),
    ]);
    const res = deduplicate(items);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].sourceTier).toBe(1);
    expect(res.items[0].sourceName).toBe('ทางการ');
  });

  it('does not merge similar headlines published weeks apart', () => {
    const items = normalizeItems([
      raw({
        link: 'https://a.com/1',
        title: 'โตโยต้าประกาศขยายศูนย์บริการในไทยเพิ่ม 45 แห่ง',
        publishedAt: new Date('2025-07-15T00:00:00Z').toISOString(),
      }),
      raw({
        link: 'https://b.com/2',
        title: 'โตโยต้า เตรียมขยายศูนย์บริการในไทยอีก 45 แห่ง',
        publishedAt: new Date('2025-06-01T00:00:00Z').toISOString(),
      }),
    ]);
    // Same wording, 6 weeks apart — that is a re-announcement, not one event.
    expect(deduplicate(items).items).toHaveLength(2);
  });

  it('does not merge genuinely different stories', () => {
    const items = normalizeItems([
      raw({ link: 'https://a.com/1', title: 'ยอดขายรถยนต์เดือนนี้เพิ่มขึ้น 12%' }),
      raw({ link: 'https://b.com/2', title: 'กรมควบคุมมลพิษเตือนค่าฝุ่น PM2.5 สูง' }),
    ]);
    expect(deduplicate(items).items).toHaveLength(2);
  });

  it('collapses the duplicate pair in the mock fixture', () => {
    const normalized = normalizeItems(MOCK_NEWS);
    const res = deduplicate(normalized);
    expect(res.items.length).toBeLessThan(normalized.length);
    expect(res.duplicatesRemoved).toBeGreaterThanOrEqual(2);
  });

  it('never counts a duplicate twice in the surviving set', () => {
    const res = deduplicate(normalizeItems(MOCK_NEWS));
    const ids = res.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('handles an empty input', () => {
    expect(deduplicate([]).items).toEqual([]);
  });
});
