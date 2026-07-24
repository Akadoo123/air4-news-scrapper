import { describe, it, expect } from 'vitest';
import { buildWeatherSignals, DEFAULT_THRESHOLDS, type WeatherCity } from '../src/collectors/weather.js';
import { normalizeItems } from '../src/normalizers/item.js';
import { prefilter } from '../src/analysis/prefilter.js';

const city = (id: string, weight = 1): WeatherCity => ({
  id,
  name_th: id,
  lat: 13.7,
  lon: 100.5,
  weight,
});

const forecast = (id: string, feels: number[], pm25: number | null = null, weight = 1) => ({
  city: city(id, weight),
  days: feels.map((f, i) => ({ date: `2026-07-${21 + i}`, tempMax: f - 2, feelsLikeMax: f })),
  pm25Max: pm25,
});

const NOW = new Date('2026-07-21T01:00:00.000Z');

describe('weather demand signals', () => {
  it('ไม่สร้างสัญญาณเมื่ออากาศไม่ร้อนและฝุ่นไม่สูง', () => {
    const items = buildWeatherSignals([forecast('bkk', [30, 31, 30], 10)], DEFAULT_THRESHOLDS, NOW);
    expect(items).toEqual([]);
  });

  it('สร้างสัญญาณความร้อนเมื่อเกินเกณฑ์', () => {
    const items = buildWeatherSignals([forecast('bkk', [38, 39, 37])], DEFAULT_THRESHOLDS, NOW);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('ล้างแอร์รถยนต์');
    expect(items[0].itemKind).toBe('signal');
    expect(items[0].sourceTier).toBe(1);
  });

  it('ระบุว่าร้อนจัดเมื่อถึงเกณฑ์สูง', () => {
    const mild = buildWeatherSignals([forecast('bkk', [37, 37, 37])], DEFAULT_THRESHOLDS, NOW);
    const harsh = buildWeatherSignals([forecast('bkk', [42, 42, 42])], DEFAULT_THRESHOLDS, NOW);
    expect(mild[0].title).toContain('อากาศร้อน:');
    expect(harsh[0].title).toContain('อากาศร้อนจัด');
  });

  it('ถ่วงน้ำหนักตามความสำคัญของเมือง', () => {
    // กรุงเทพฯ (weight 5) ร้อน แต่เมืองเล็ก (weight 1) เย็น -> ค่าเฉลี่ยควรเอนไปทางกรุงเทพฯ
    const items = buildWeatherSignals(
      [forecast('bkk', [40, 40, 40], null, 5), forecast('small', [28, 28, 28], null, 1)],
      DEFAULT_THRESHOLDS,
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('38'); // (40*5 + 28*1) / 6 = 38
  });

  it('สร้างสัญญาณ PM2.5 แยกจากสัญญาณความร้อน', () => {
    const items = buildWeatherSignals([forecast('bkk', [30, 30, 30], 60)], DEFAULT_THRESHOLDS, NOW);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('PM2.5');
    expect(items[0].title).toContain('ห้องโดยสาร');
  });

  it('สร้างได้ทั้งสองสัญญาณพร้อมกัน', () => {
    const items = buildWeatherSignals([forecast('bkk', [41, 41, 41], 70)], DEFAULT_THRESHOLDS, NOW);
    expect(items).toHaveLength(2);
  });

  it('ข้ามเมืองที่ไม่มีข้อมูล ไม่ล้ม', () => {
    const items = buildWeatherSignals(
      [forecast('bkk', [40, 40, 40]), { city: city('broken'), days: [], pm25Max: null }],
      DEFAULT_THRESHOLDS,
      NOW,
    );
    expect(items.length).toBeGreaterThan(0);
  });

  it('แยกข้อเท็จจริงออกจากการตีความอย่างชัดเจน', () => {
    const items = buildWeatherSignals([forecast('bkk', [41, 41, 41])], DEFAULT_THRESHOLDS, NOW);
    expect(items[0].snippet).toContain('[การตีความของระบบ]');
    expect(items[0].snippet).toContain('ข้อมูลพยากรณ์');
  });

  it('สัญญาณผ่าน prefilter ได้ (ไม่ถูกตัดทิ้งก่อนถึง AI)', () => {
    const items = buildWeatherSignals([forecast('bkk', [41, 41, 41], 70)], DEFAULT_THRESHOLDS, NOW);
    for (const it of items) {
      const pf = prefilter(it.title, it.snippet ?? '', it);
      expect(pf.hasAutomotiveContext).toBe(true);
      expect(pf.score).toBeGreaterThanOrEqual(8);
    }
  });

  it('ผ่าน normalizeItems และได้ itemKind = signal', () => {
    const items = buildWeatherSignals([forecast('bkk', [41, 41, 41])], DEFAULT_THRESHOLDS, NOW);
    const normalized = normalizeItems(items, NOW);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].itemKind).toBe('signal');
    expect(normalized[0].canonicalUrl).toContain('open-meteo.com');
  });
});
