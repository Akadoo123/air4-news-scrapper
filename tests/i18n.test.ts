import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../src/config.js';

/**
 * ทดสอบ public/assets/i18n.js ตัวจริงที่ส่งไปให้เบราว์เซอร์
 * จุดสำคัญคือ "คีย์ต้องครบทั้งสองภาษา" — ถ้าขาด ผู้ใช้จะเห็นคีย์ดิบบนหน้าจอ
 */
interface I18n {
  t: (key: string, vars?: Record<string, unknown>) => string;
  getLang: () => string;
  setLang: (l: string) => string;
  languages: string[];
  dict: Record<string, Record<string, string>>;
}

let I18N: I18n;

beforeAll(() => {
  const src = readFileSync(resolve(ROOT, 'public/assets/i18n.js'), 'utf8');
  const sandbox: Record<string, unknown> = {};
  // จำลอง DOM เท่าที่ i18n.js ต้องใช้ตอนโหลด
  const stubDoc = { documentElement: { setAttribute: () => {} } };
  new Function('globalThis', 'localStorage', 'document', src)(
    sandbox,
    { getItem: () => null, setItem: () => {} },
    stubDoc,
  );
  I18N = sandbox.Air4I18n as I18n;
});

describe('i18n — ความครบถ้วนของคำแปล', () => {
  it('มีทั้งภาษาไทยและอังกฤษ', () => {
    expect(I18N.languages).toEqual(['th', 'en']);
  });

  it('ทุกคีย์ในภาษาไทยต้องมีคำแปลอังกฤษ', () => {
    const missing = Object.keys(I18N.dict.th).filter((k) => I18N.dict.en[k] === undefined);
    expect(missing).toEqual([]);
  });

  it('ทุกคีย์ในภาษาอังกฤษต้องมีคำแปลไทย', () => {
    const missing = Object.keys(I18N.dict.en).filter((k) => I18N.dict.th[k] === undefined);
    expect(missing).toEqual([]);
  });

  it('ไม่มีคำแปลที่เป็นค่าว่าง', () => {
    for (const lang of ['th', 'en'] as const) {
      const empty = Object.entries(I18N.dict[lang])
        .filter(([, v]) => !String(v).trim())
        .map(([k]) => `${lang}:${k}`);
      expect(empty).toEqual([]);
    }
  });

  it('ตัวแปร {…} ในสองภาษาต้องตรงกัน มิฉะนั้นค่าจะหายตอนสลับภาษา', () => {
    const vars = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',');
    const mismatched = Object.keys(I18N.dict.th)
      .filter((k) => vars(I18N.dict.th[k]) !== vars(I18N.dict.en[k]))
      .map((k) => `${k}: th(${vars(I18N.dict.th[k])}) vs en(${vars(I18N.dict.en[k])})`);
    expect(mismatched).toEqual([]);
  });
});

describe('i18n — การแปลค่า', () => {
  it('แทนที่ตัวแปรได้', () => {
    I18N.setLang('th');
    expect(I18N.t('flag.multiDay', { n: 3 })).toBe('พบ 3 วัน');
    I18N.setLang('en');
    expect(I18N.t('flag.multiDay', { n: 3 })).toBe('Seen on 3 days');
  });

  it('คืนคีย์เดิมเมื่อไม่มีคำแปล (ให้เห็นว่าตกหล่น ไม่ใช่ค่าว่าง)', () => {
    expect(I18N.t('ไม่มีคีย์นี้')).toBe('ไม่มีคีย์นี้');
  });

  it('ตกกลับไปใช้ภาษาไทยเมื่อคีย์ขาดในภาษาที่เลือก', () => {
    I18N.dict.th['test.only'] = 'มีเฉพาะไทย';
    I18N.setLang('en');
    expect(I18N.t('test.only')).toBe('มีเฉพาะไทย');
    delete I18N.dict.th['test.only'];
  });

  it('ไม่รับภาษาที่ไม่รู้จัก', () => {
    I18N.setLang('th');
    I18N.setLang('fr');
    expect(I18N.getLang()).toBe('th');
  });
});

describe('i18n — คีย์ที่โค้ดเรียกใช้ต้องมีอยู่จริง', () => {
  it('ทุกคีย์ที่ app.js เรียกผ่าน t(...) ต้องมีใน dictionary', () => {
    const app = readFileSync(resolve(ROOT, 'public/assets/app.js'), 'utf8');
    const used = new Set<string>();
    for (const m of app.matchAll(/\bt\(\s*'([a-zA-Z][\w.-]*)'/g)) {
      // ข้ามคีย์ที่ต่อท้ายด้วยตัวแปรตอนรัน เช่น t('cat.' + x) — ตรวจแยกในเทสต์สุดท้าย
      if (!m[1].endsWith('.')) used.add(m[1]);
    }
    const missing = [...used].filter((k) => I18N.dict.th[k] === undefined);
    expect(missing).toEqual([]);
  });

  it('ทุกคีย์ที่ index.html อ้างผ่าน data-i18n ต้องมีใน dictionary', () => {
    const html = readFileSync(resolve(ROOT, 'public/index.html'), 'utf8');
    const used = new Set<string>();
    for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of m[1].split(',')) {
        const key = pair.split(':')[1];
        if (key) used.add(key.trim());
      }
    }
    const missing = [...used].filter((k) => I18N.dict.th[k] === undefined);
    expect(missing).toEqual([]);
  });

  it('คีย์ที่ประกอบขึ้นตอนรัน (verdict/cat/prod/okr/…) ต้องครบทุกค่า', () => {
    const groups: Record<string, string[]> = {
      verdict: ['positive', 'neutral', 'negative'],
      okr: ['positive', 'neutral', 'negative'],
      status: ['ok', 'degraded', 'failed'],
      urgency: ['low', 'medium', 'high'],
      priority: ['high', 'medium', 'low'],
      deadline: ['today', 'within_7_days', 'monitor'],
      horizon: ['immediate', '1-3 months', '3-12 months', 'long-term'],
      cat: ['AUTO_MARKET', 'EV', 'AC_CLEANING', 'INJECTOR', 'TRADING', 'COMPETITOR', 'OEM_BRANDS', 'INTERNATIONAL', 'OTHER'],
      prod: ['AC_CLEANING', 'POWER_FLOW', 'TRADING'],
    };
    const missing: string[] = [];
    for (const [prefix, values] of Object.entries(groups)) {
      for (const v of values) {
        const key = `${prefix}.${v}`;
        if (I18N.dict.th[key] === undefined) missing.push(`th:${key}`);
        if (I18N.dict.en[key] === undefined) missing.push(`en:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
