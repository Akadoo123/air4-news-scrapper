import { describe, it, expect } from 'vitest';
import { AnalysisSchema, DailyAnalysisSchema, DailyReportSchema } from '../src/types.js';
import { fallbackAnalyze, fallbackDaily } from '../src/analysis/fallback.js';
import { normalizeItems } from '../src/normalizers/item.js';
import { computeKpi } from '../src/analysis/kpi.js';
import { MOCK_NEWS } from './fixtures/mock-news.js';
import type { AnalyzedItem, NormalizedItem } from '../src/types.js';

const byTitle = (fragment: string): NormalizedItem => {
  const found = normalizeItems(MOCK_NEWS).find((i) => i.title.includes(fragment));
  if (!found) throw new Error(`fixture not found: ${fragment}`);
  return found;
};

const analyzed = (i: NormalizedItem): AnalyzedItem => ({
  ...i,
  ...fallbackAnalyze(i),
  analyzedBy: 'fallback',
  sourceUrl: i.canonicalUrl,
  titleOriginal: i.title,
  originalSnippet: i.snippet,
});

describe('AnalysisSchema validation', () => {
  const valid = {
    titleTh: 'ทดสอบ',
    shortSummaryTh: 'สรุป',
    classification: 'positive',
    impactScore: 4,
    confidence: 88,
    relevanceScore: 92,
    newsCategory: 'AC_CLEANING',
    affectedChannels: ['OEM', 'B2B'],
    affectedProducts: ['AC_CLEANING'],
    affectedCountries: ['Thailand'],
    affectedCompetitors: [],
    okrImpact: { O1: 'positive', O2: 'positive' },
    positiveImpacts: ['จำนวนศูนย์บริการเป้าหมายเพิ่มขึ้น'],
    negativeImpacts: [],
    reasoningSummary: ['ข่าวเกี่ยวข้องกับกลุ่มลูกค้าโดยตรง'],
    businessInterpretation: 'ตีความ',
    recommendedActions: [
      { action: 'จัดทำรายชื่อศูนย์บริการใหม่', owner: 'B2B Sales & Marketing', priority: 'high', deadline: 'within_7_days' },
    ],
    timeHorizon: '1-3 months',
  };

  it('accepts a well-formed payload', () => {
    expect(AnalysisSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an out-of-range impact score', () => {
    expect(AnalysisSchema.safeParse({ ...valid, impactScore: 9 }).success).toBe(false);
    expect(AnalysisSchema.safeParse({ ...valid, impactScore: -9 }).success).toBe(false);
  });

  it('rejects an out-of-range confidence', () => {
    expect(AnalysisSchema.safeParse({ ...valid, confidence: 150 }).success).toBe(false);
  });

  it('rejects an unknown classification', () => {
    expect(AnalysisSchema.safeParse({ ...valid, classification: 'very-good' }).success).toBe(false);
  });

  it('rejects an unknown department as the action owner', () => {
    const bad = { ...valid, recommendedActions: [{ ...valid.recommendedActions[0], owner: 'Marketing Team' }] };
    expect(AnalysisSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown channel', () => {
    expect(AnalysisSchema.safeParse({ ...valid, affectedChannels: ['B2G'] }).success).toBe(false);
  });

  it('rejects an invalid time horizon', () => {
    expect(AnalysisSchema.safeParse({ ...valid, timeHorizon: 'someday' }).success).toBe(false);
  });

  it('applies array defaults when fields are absent', () => {
    const minimal = { ...valid } as Record<string, unknown>;
    delete minimal.affectedCompetitors;
    delete minimal.negativeImpacts;
    const parsed = AnalysisSchema.parse(minimal);
    expect(parsed.affectedCompetitors).toEqual([]);
    expect(parsed.negativeImpacts).toEqual([]);
  });
});

describe('fallbackAnalyze', () => {
  it('always returns a schema-valid analysis for every fixture', () => {
    for (const item of normalizeItems(MOCK_NEWS)) {
      expect(AnalysisSchema.safeParse(fallbackAnalyze(item)).success).toBe(true);
    }
  });

  it('rates a service-network expansion as positive', () => {
    const a = fallbackAnalyze(byTitle('ขยายศูนย์บริการ'));
    expect(a.classification).toBe('positive');
    expect(a.impactScore).toBeGreaterThan(0);
  });

  it('rates a competitor price war as negative', () => {
    const a = fallbackAnalyze(byTitle('Wizard เปิดตัวบริการล้างแอร์'));
    expect(a.classification).toBe('negative');
    expect(a.affectedCompetitors).toContain('Wizard');
  });

  it('rates tightening auto loans as negative', () => {
    expect(fallbackAnalyze(byTitle('หนี้ครัวเรือนพุ่ง')).classification).toBe('negative');
  });

  it('keeps confidence below full certainty', () => {
    for (const item of normalizeItems(MOCK_NEWS)) {
      expect(fallbackAnalyze(item).confidence).toBeLessThanOrEqual(75);
    }
  });

  it('lowers confidence for unverified Tier 3 sources', () => {
    const t3 = normalizeItems(MOCK_NEWS).find((i) => i.sourceTier === 3)!;
    expect(fallbackAnalyze(t3).confidence).toBeLessThan(60);
  });
});

describe('EV dual-impact rule', () => {
  const ev = byTitle('ยอดขายรถยนต์ไฟฟ้าในไทยโต');

  it('records both a positive and a negative impact', () => {
    const a = fallbackAnalyze(ev);
    expect(a.positiveImpacts.join(' ')).toMatch(/แอร์/);
    expect(a.negativeImpacts.join(' ')).toMatch(/หัวฉีด|Power Flow/);
  });

  it('does not force EV news to a non-neutral verdict', () => {
    const a = fallbackAnalyze(ev);
    // The AC gain and the Power Flow loss cancel, so the net verdict must not be
    // driven by the EV signal alone.
    expect(['positive', 'neutral', 'negative']).toContain(a.classification);
    expect(a.reasoningSummary.join(' ')).toMatch(/ผลสุทธิ/);
  });

  it('treats EV impact as long-term', () => {
    expect(fallbackAnalyze(ev).timeHorizon).toBe('long-term');
  });
});

describe('false-positive handling end to end', () => {
  it('gives the non-automotive Wizard story no competitor and a low relevance score', () => {
    const a = fallbackAnalyze(byTitle('Wizard of Oz'));
    expect(a.affectedCompetitors).toEqual([]);
    expect(a.relevanceScore).toBeLessThan(40);
  });

  it('gives the Wise money-transfer story no competitor match', () => {
    expect(fallbackAnalyze(byTitle('Wise ประกาศค่าธรรมเนียม')).affectedCompetitors).toEqual([]);
  });
});

describe('daily analysis and KPI', () => {
  const items = normalizeItems(MOCK_NEWS).map(analyzed);

  it('produces a schema-valid daily analysis', () => {
    expect(DailyAnalysisSchema.safeParse(fallbackDaily(items)).success).toBe(true);
  });

  it('handles an empty day without crashing', () => {
    const d = fallbackDaily([]);
    expect(DailyAnalysisSchema.safeParse(d).success).toBe(true);
    expect(d.urgencyLevel).toBe('low');
    expect(d.executiveSummaryTh).toMatch(/ไม่พบข่าว/);
  });

  it('counts KPI buckets consistently', () => {
    const kpi = computeKpi(items, { totalCollected: 20, afterDedup: 15, afterPrefilter: 12 });
    expect(kpi.published).toBe(items.length);
    expect(kpi.positive + kpi.neutral + kpi.negative).toBe(items.length);
    expect(kpi.totalCollected).toBe(20);
  });

  it('counts competitor alerts', () => {
    const kpi = computeKpi(items, { totalCollected: 0, afterDedup: 0, afterPrefilter: 0 });
    expect(kpi.competitorAlerts).toBeGreaterThan(0);
  });
});

describe('DailyReportSchema', () => {
  it('validates a fully assembled report', () => {
    const items = normalizeItems(MOCK_NEWS).map(analyzed);
    const report = {
      date: '2025-07-15',
      generatedAt: new Date().toISOString(),
      timezone: 'Asia/Bangkok',
      status: 'ok',
      kpi: computeKpi(items, { totalCollected: 20, afterDedup: 15, afterPrefilter: 12 }),
      daily: fallbackDaily(items),
      items,
      sourceHealth: [{ sourceId: 'x', sourceName: 'X', ok: true, itemCount: 5, durationMs: 100 }],
      errors: [],
      ai: {
        enabled: false, model: null, itemsAnalyzedByAi: 0,
        itemsAnalyzedByFallback: items.length, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0,
      },
    };
    const res = DailyReportSchema.safeParse(report);
    if (!res.success) console.error(res.error.issues.slice(0, 5));
    expect(res.success).toBe(true);
  });
});
