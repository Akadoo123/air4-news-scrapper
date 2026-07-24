import { describe, it, expect } from 'vitest';
import { runPipeline } from '../src/index.js';
import { DailyReportSchema } from '../src/types.js';
import { MOCK_NEWS } from './fixtures/mock-news.js';
import { normalizeItems, filterByRecency } from '../src/normalizers/item.js';
import type { RawItem } from '../src/types.js';

describe('pipeline (mock data, no AI, no disk writes)', () => {
  it('runs end to end and produces a valid report', async () => {
    const report = await runPipeline({ mockItems: MOCK_NEWS, dryRun: true, disableAi: true });
    const res = DailyReportSchema.safeParse(report);
    if (!res.success) console.error(res.error.issues.slice(0, 5));
    expect(res.success).toBe(true);
  });

  it('deduplicates before publishing', async () => {
    const report = await runPipeline({ mockItems: MOCK_NEWS, dryRun: true, disableAi: true });
    expect(report.kpi.afterDedup).toBeLessThan(MOCK_NEWS.length);
  });

  it('filters out irrelevant stories', async () => {
    const report = await runPipeline({ mockItems: MOCK_NEWS, dryRun: true, disableAi: true });
    const titles = report.items.map((i) => i.titleOriginal).join(' ');
    expect(titles).not.toMatch(/Wizard of Oz/);
    expect(titles).not.toMatch(/ค่าธรรมเนียมโอนเงิน/);
  });

  it('keeps the core automotive stories', async () => {
    const report = await runPipeline({ mockItems: MOCK_NEWS, dryRun: true, disableAi: true });
    const titles = report.items.map((i) => i.titleOriginal).join(' ');
    expect(titles).toMatch(/ศูนย์บริการ|PM2\.5|ล้างแอร์/);
  });

  it('reports every classification bucket', async () => {
    const report = await runPipeline({ mockItems: MOCK_NEWS, dryRun: true, disableAi: true });
    expect(report.kpi.positive + report.kpi.neutral + report.kpi.negative).toBe(report.items.length);
  });

  it('records that AI was not used', async () => {
    const report = await runPipeline({ mockItems: MOCK_NEWS, dryRun: true, disableAi: true });
    expect(report.ai.enabled).toBe(false);
    expect(report.ai.estimatedCostUsd).toBe(0);
    expect(report.ai.itemsAnalyzedByAi).toBe(0);
  });

  it('survives an empty input rather than throwing', async () => {
    const report = await runPipeline({ mockItems: [], dryRun: true, disableAi: true });
    expect(report.items).toEqual([]);
    expect(report.kpi.published).toBe(0);
    expect(DailyReportSchema.safeParse(report).success).toBe(true);
  });

  it('survives malformed input items', async () => {
    const junk: RawItem[] = [
      {
        title: '', link: 'not-a-url', snippet: '', publishedAt: 'garbage',
        sourceId: 'x', sourceName: 'X', sourceTier: 2, sourceCountry: 'TH',
        language: 'th', unverified: false,
      },
      {
        title: 'ok', link: 'javascript:alert(1)', snippet: '', publishedAt: null,
        sourceId: 'x', sourceName: 'X', sourceTier: 2, sourceCountry: 'TH',
        language: 'th', unverified: false,
      },
    ];
    const report = await runPipeline({ mockItems: junk, dryRun: true, disableAi: true });
    expect(report.items).toEqual([]);
  });

  it('sorts published items by significance', async () => {
    const report = await runPipeline({ mockItems: MOCK_NEWS, dryRun: true, disableAi: true });
    const weight = (i: { impactScore: number; confidence: number; relevanceScore: number }) =>
      Math.abs(i.impactScore) * (i.confidence / 100) + i.relevanceScore / 100;
    for (let n = 1; n < report.items.length; n++) {
      expect(weight(report.items[n - 1])).toBeGreaterThanOrEqual(weight(report.items[n]) - 1e-9);
    }
  });
});

describe('recency filtering', () => {
  const base: RawItem = {
    title: 'ยอดขายรถยนต์เพิ่มขึ้น', link: 'https://example.com/a', snippet: '',
    publishedAt: null, sourceId: 's', sourceName: 'S', sourceTier: 2,
    sourceCountry: 'TH', language: 'th', unverified: false,
  };

  it('drops stories older than the lookback window', () => {
    const old = { ...base, link: 'https://example.com/old', publishedAt: '2020-01-01T00:00:00Z' };
    const res = filterByRecency(normalizeItems([old]), 48);
    expect(res.kept).toHaveLength(0);
    expect(res.droppedStale).toBe(1);
  });

  it('keeps undated stories but counts them', () => {
    const res = filterByRecency(normalizeItems([base]), 48);
    expect(res.kept).toHaveLength(1);
    expect(res.undated).toBe(1);
  });

  it('keeps recent stories', () => {
    const fresh = { ...base, publishedAt: new Date(Date.now() - 3600 * 1000).toISOString() };
    expect(filterByRecency(normalizeItems([fresh]), 48).kept).toHaveLength(1);
  });
});
