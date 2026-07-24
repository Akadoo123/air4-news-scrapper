import { describe, it, expect } from 'vitest';
import { prefilter } from '../src/analysis/prefilter.js';

const T2 = { sourceTier: 2 as const, sourceCountry: 'TH' };

describe('prefilter — relevance scoring', () => {
  it('scores a core-service story highly', () => {
    const r = prefilter(
      'เปิดบริการล้างแอร์รถยนต์แบบไม่ถอดตู้ที่ศูนย์บริการทั่วประเทศ',
      'ผู้ให้บริการขยายบริการล้างแอร์รถยนต์และล้างคอยล์เย็นรถยนต์',
      T2,
    );
    expect(r.score).toBeGreaterThan(20);
    expect(r.categories).toContain('AC_CLEANING');
    expect(r.hasAutomotiveContext).toBe(true);
  });

  it('scores an unrelated story near zero', () => {
    const r = prefilter('ราคาทองคำวันนี้ปรับตัวขึ้น 50 บาท', 'ตลาดทองคำในประเทศ', T2);
    expect(r.score).toBeLessThan(12);
    expect(r.hasAutomotiveContext).toBe(false);
  });

  it('drops hard-excluded noise entirely', () => {
    const r = prefilter('เลขเด็ดงวดนี้ หวยออกอะไร', 'ดูดวงประจำวัน', T2);
    expect(r.hardExcluded).toBe(true);
    expect(r.score).toBe(0);
  });

  it('boosts official Tier 1 sources', () => {
    const t1 = prefilter('ยอดขายรถยนต์เพิ่มขึ้น', '', { sourceTier: 1, sourceCountry: 'TH' });
    const t2 = prefilter('ยอดขายรถยนต์เพิ่มขึ้น', '', T2);
    expect(t1.score).toBeGreaterThan(t2.score);
  });

  it('penalises unverified Tier 3 sources', () => {
    const t3 = prefilter('ยอดขายรถยนต์เพิ่มขึ้น', '', { sourceTier: 3, sourceCountry: 'TH' });
    const t2 = prefilter('ยอดขายรถยนต์เพิ่มขึ้น', '', T2);
    expect(t3.score).toBeLessThan(t2.score);
  });

  it('flags press releases and sponsored content', () => {
    expect(prefilter('ข่าวประชาสัมพันธ์: เปิดตัวรถยนต์รุ่นใหม่', '', T2).isPressRelease).toBe(true);
    expect(prefilter('[Advertorial] รถยนต์รุ่นใหม่น่าสนใจ', '', T2).isSponsored).toBe(true);
  });
});

describe('prefilter — competitor false-positive guard', () => {
  it('detects a competitor when automotive context is present', () => {
    const r = prefilter(
      'Wizard เปิดตัวบริการล้างแอร์รถยนต์ราคาพิเศษ',
      'ผู้ให้บริการล้างแอร์รถยนต์ประกาศลดราคาสำหรับศูนย์บริการและอู่ซ่อมรถ',
      T2,
    );
    expect(r.competitors).toContain('Wizard');
    expect(r.categories).toContain('COMPETITOR');
  });

  it('ignores "Wizard" with no automotive context at all', () => {
    const r = prefilter(
      'Wizard of Oz musical returns to London stage',
      'The beloved musical returns this winter with a new cast.',
      T2,
    );
    expect(r.competitors).toEqual([]);
  });

  it('ignores "Wise" when the story is about money transfer', () => {
    const r = prefilter(
      'Wise ประกาศค่าธรรมเนียมโอนเงินระหว่างประเทศแบบใหม่',
      'ผู้ให้บริการโอนเงินระหว่างประเทศประกาศโครงสร้างค่าธรรมเนียมใหม่ แลกเงิน',
      T2,
    );
    expect(r.competitors).toEqual([]);
  });

  it('ignores "Fresh Air" used as a generic phrase', () => {
    const r = prefilter(
      'Fresh air improves office productivity, study finds',
      'A new study links fresh air ventilation to better focus in office workers.',
      T2,
    );
    expect(r.competitors).toEqual([]);
  });

  it('does not match a competitor name inside a longer word', () => {
    const r = prefilter('Otherwise the market remained flat for cars', 'automotive market', T2);
    expect(r.competitors).toEqual([]);
  });
});

describe('prefilter — brands and categories', () => {
  it('recognises priority brands', () => {
    const r = prefilter('Toyota เปิดศูนย์บริการใหม่ 45 แห่ง', 'ศูนย์บริการรถยนต์', T2);
    expect(r.brands).toContain('Toyota');
    expect(r.categories).toContain('OEM_BRANDS');
  });

  // Thai outlets write brand names in Thai script; matching only the Latin name
  // means brand detection never fires on Thai-language articles.
  it('recognises brand names written in Thai', () => {
    expect(prefilter('โตโยต้าขยายศูนย์บริการรถยนต์', '', T2).brands).toContain('Toyota');
    expect(prefilter('อีซูซุเปิดตัวรถกระบะรุ่นใหม่', '', T2).brands).toContain('Isuzu');
    expect(prefilter('ฮอนด้าปรับมาตรฐานศูนย์บริการรถยนต์', '', T2).brands).toContain('Honda');
  });

  it('matches short Thai forms that outlets actually use', () => {
    // Real headlines say "ดูแลแอร์รถยนต์" / "ล้างคอยล์เย็น", not the full phrase.
    expect(prefilter('เทคนิคดูแลแอร์รถยนต์ให้เย็นนานขึ้น', '', T2).categories).toContain('AC_CLEANING');
    expect(prefilter('วิธีล้างคอยล์เย็นในรถ', '', T2).categories).toContain('AC_CLEANING');
  });

  it('tags EV stories', () => {
    const r = prefilter('ยอดขายรถยนต์ไฟฟ้าโต 38%', 'ศูนย์บริการรถ EV ขยายตัว', T2);
    expect(r.categories).toContain('EV');
  });

  it('tags injector-cleaning stories', () => {
    const r = prefilter('บริการล้างหัวฉีดรถยนต์', 'fuel injector cleaning สำหรับรถยนต์', T2);
    expect(r.categories).toContain('INJECTOR');
  });
});
