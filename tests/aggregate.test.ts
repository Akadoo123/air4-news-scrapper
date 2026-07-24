import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../src/config.js';

/**
 * ทดสอบ public/assets/aggregate.js ตัวจริงที่ถูกส่งไปให้เบราว์เซอร์
 * โหลดไฟล์แล้วรันใน sandbox เพื่อไม่ให้ตรรกะที่ทดสอบกับตรรกะที่ deploy แยกจากกัน
 */
interface Agg {
  datesInRange: (days: Array<{ date: string }>, from: string, to: string) => string[];
  mergeItems: (reports: unknown[]) => Array<Record<string, unknown>>;
  aggregate: (reports: unknown[]) => Record<string, unknown> | null;
}

let Air4Aggregate: Agg;

beforeAll(() => {
  const src = readFileSync(resolve(ROOT, 'public/assets/aggregate.js'), 'utf8');
  const sandbox: Record<string, unknown> = {};
  new Function('globalThis', src)(sandbox);
  Air4Aggregate = sandbox.Air4Aggregate as Agg;
});

const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  contentHash: 'h1',
  canonicalUrl: 'https://a.test/1',
  classification: 'positive',
  impactScore: 3,
  sourceTier: 2,
  sourceCountry: 'TH',
  newsCategory: 'AC_CLEANING',
  affectedChannels: ['B2B'],
  affectedCompetitors: [],
  okrImpact: { O1: 'positive', O2: 'neutral' },
  itemKind: 'news',
  ...over,
});

const report = (date: string, items: unknown[], over: Record<string, unknown> = {}) => ({
  date,
  generatedAt: `${date}T01:00:00.000Z`,
  status: 'ok',
  kpi: { totalCollected: 100, afterDedup: 50, afterPrefilter: 20, published: items.length },
  daily: {
    executiveSummaryTh: `สรุปของ ${date}`,
    netImpactScore: 1,
    overallSentiment: 'neutral',
    actionsToday: [{ action: `ทำ ${date}` }],
  },
  items,
  sourceHealth: [],
  errors: [],
  ...over,
});

describe('aggregate — single day', () => {
  it('ไม่เปลี่ยนรูปรายงานเมื่อมีวันเดียว', () => {
    const r = Air4Aggregate.aggregate([report('2026-07-21', [item()])]);
    expect(r?.isRange).toBe(false);
    expect(r?.rangeDays).toBe(1);
    expect((r?.items as unknown[]).length).toBe(1);
  });

  it('คืน null เมื่อไม่มีรายงาน', () => {
    expect(Air4Aggregate.aggregate([])).toBeNull();
  });
});

describe('aggregate — date range', () => {
  const reports = [
    report('2026-07-21', [
      item({ id: 'a', contentHash: 'ha', canonicalUrl: 'https://x.test/a' }),
      item({ id: 'dup', contentHash: 'hd', canonicalUrl: 'https://x.test/d', sourceTier: 2 }),
    ]),
    report('2026-07-20', [
      item({ id: 'b', contentHash: 'hb', canonicalUrl: 'https://x.test/b', classification: 'negative', impactScore: -4 }),
      // ข่าวเดียวกับ 'dup' แต่มาจากแหล่งที่น่าเชื่อถือกว่า (tier 1)
      item({ id: 'dup2', contentHash: 'hd', canonicalUrl: 'https://x.test/d2', sourceTier: 1 }),
    ]),
    report('2026-07-19', [
      item({ id: 'c', contentHash: 'hc', canonicalUrl: 'https://x.test/c', classification: 'neutral', impactScore: 0 }),
    ]),
  ];

  it('รวมข่าวทุกวันและตัดข่าวซ้ำข้ามวัน', () => {
    const r = Air4Aggregate.aggregate(reports)!;
    expect(r.isRange).toBe(true);
    expect(r.rangeDays).toBe(3);
    expect(r.rangeFrom).toBe('2026-07-19');
    expect(r.rangeTo).toBe('2026-07-21');
    // 5 ชิ้น - 1 ชิ้นที่ซ้ำ = 4
    expect((r.items as unknown[]).length).toBe(4);
  });

  it('เลือกแหล่งที่น่าเชื่อถือกว่าเมื่อข่าวซ้ำ และจำว่าพบกี่วัน', () => {
    const r = Air4Aggregate.aggregate(reports)!;
    const merged = (r.items as Array<Record<string, unknown>>).find((i) => i.contentHash === 'hd')!;
    expect(merged.sourceTier).toBe(1);
    expect(merged.reportDates).toEqual(['2026-07-21', '2026-07-20']);
  });

  it('คำนวณ KPI ใหม่จากข่าวที่ตัดซ้ำแล้ว ไม่ใช่บวก KPI รายวัน', () => {
    const r = Air4Aggregate.aggregate(reports)!;
    const kpi = r.kpi as Record<string, number>;
    expect(kpi.published).toBe(4);
    expect(kpi.positive).toBe(2);
    expect(kpi.negative).toBe(1);
    expect(kpi.neutral).toBe(1);
    // ปริมาณงานที่ระบบทำสะสมได้ตรง ๆ
    expect(kpi.totalCollected).toBe(300);
  });

  it('คงบทวิเคราะห์ของวันล่าสุดไว้ ไม่นำมารวมกัน', () => {
    const r = Air4Aggregate.aggregate(reports)!;
    const daily = r.daily as Record<string, unknown>;
    expect(daily.executiveSummaryTh).toBe('สรุปของ 2026-07-21');
    expect(daily.actionsToday).toEqual([{ action: 'ทำ 2026-07-21' }]);
    expect(r.narrativeFromDate).toBe('2026-07-21');
  });

  it('คำนวณคะแนนผลกระทบสุทธิใหม่เป็นค่าเฉลี่ยของช่วง', () => {
    const r = Air4Aggregate.aggregate(reports)!;
    // (3 + 3 + -4 + 0) / 4 = 0.5
    expect((r.daily as Record<string, number>).netImpactScore).toBe(0.5);
  });

  it('ทั้งช่วงเป็น degraded ถ้ามีวันใดวันหนึ่ง degraded', () => {
    const withBad = [reports[0], { ...reports[1], status: 'degraded' }, reports[2]];
    expect(Air4Aggregate.aggregate(withBad)!.status).toBe('degraded');
  });
});

describe('datesInRange', () => {
  const days = [{ date: '2026-07-21' }, { date: '2026-07-20' }, { date: '2026-07-19' }];

  it('เลือกเฉพาะวันที่อยู่ในช่วง รวมปลายทั้งสองข้าง', () => {
    expect(Air4Aggregate.datesInRange(days, '2026-07-19', '2026-07-20')).toEqual([
      '2026-07-20',
      '2026-07-19',
    ]);
  });

  it('คืนอาเรย์ว่างเมื่อไม่มีวันใดอยู่ในช่วง', () => {
    expect(Air4Aggregate.datesInRange(days, '2026-01-01', '2026-01-05')).toEqual([]);
  });
});
