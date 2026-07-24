import { describe, it, expect } from 'vitest';
import { normalizeItems } from '../src/normalizers/item.js';
import { fallbackAnalyze } from '../src/analysis/fallback.js';
import { MOCK_NEWS } from './fixtures/mock-news.js';
import { env } from '../src/config.js';

/**
 * Regression guard for the scoring calibration.
 *
 * The prefilter is the cost gate and the false-positive gate at once, so the two
 * populations must stay separated: anything genuinely about the automotive
 * business scores well above the threshold, and a competitor name appearing in a
 * non-automotive story scores zero. Retuning weights without re-running this is
 * how "Wizard of Oz" ends up in a CEO's morning briefing.
 */
describe('scoring separation', () => {
  const scored = normalizeItems(MOCK_NEWS).map((i) => ({
    item: i,
    analysis: fallbackAnalyze(i),
  }));

  const find = (fragment: string) => {
    const hit = scored.find((s) => s.item.title.includes(fragment));
    if (!hit) throw new Error(`fixture not found: ${fragment}`);
    return hit;
  };

  it('scores every false positive at exactly zero', () => {
    for (const fragment of ['Wizard of Oz', 'Wise ประกาศค่าธรรมเนียม']) {
      const { item, analysis } = find(fragment);
      expect(item.prefilterScore).toBe(0);
      expect(analysis.relevanceScore).toBe(0);
      expect(item.hasAutomotiveContext).toBe(false);
    }
  });

  it('puts every genuinely relevant story above the AI gate', () => {
    const relevant = [
      'โตโยต้าประกาศขยายศูนย์บริการ',
      'ค่าฝุ่น PM2.5',
      'Vietnam automotive aftermarket',
      'ยอดผลิตรถยนต์เดือนล่าสุด',
      'เทคนิคดูแลแอร์รถย',
      'Wizard เปิดตัวบริการล้างแอร์',
      'หนี้ครัวเรือนพุ่ง',
      'New emission rules',
      'ยอดขายรถยนต์ไฟฟ้าในไทยโต',
    ];
    for (const fragment of relevant) {
      const { item } = find(fragment);
      expect(
        item.prefilterScore,
        `"${fragment}" scored ${item.prefilterScore}, below the gate of ${env.prefilterMinScore}`,
      ).toBeGreaterThanOrEqual(env.prefilterMinScore);
    }
  });

  it('keeps a clear margin between the two populations', () => {
    const noise = scored.filter((s) => !s.item.hasAutomotiveContext);
    const signal = scored.filter((s) => s.item.hasAutomotiveContext);
    const worstSignal = Math.min(...signal.map((s) => s.item.prefilterScore));
    const bestNoise = Math.max(...noise.map((s) => s.item.prefilterScore));
    expect(bestNoise).toBeLessThan(worstSignal);
  });

  it('ranks the core-service competitor story among the highest', () => {
    const wizard = find('Wizard เปิดตัวบริการล้างแอร์');
    const median = [...scored].sort((a, b) => a.item.prefilterScore - b.item.prefilterScore)[
      Math.floor(scored.length / 2)
    ];
    expect(wizard.item.prefilterScore).toBeGreaterThan(median.item.prefilterScore);
  });
});
