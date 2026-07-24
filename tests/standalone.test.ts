import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../src/config.js';

/**
 * Regression guard for the standalone (single-file) build.
 *
 * `String.prototype.replace` treats `$'` in a *string* replacement as
 * "the portion after the match". `public/assets/app.js` contains
 *
 *     ' · ค่าใช้จ่ายโดยประมาณ $' + r.ai.estimatedCostUsd
 *
 * where the USD sign sits immediately before the closing quote — so inlining the
 * script with a string replacement spliced the tail of the HTML document into
 * the middle of the JavaScript. The page still looked correct (HTML and CSS were
 * untouched) but the script failed to parse and nothing rendered.
 *
 * The build must therefore always use a function replacer.
 */
describe('standalone build — literal inlining', () => {
  const app = readFileSync(resolve(ROOT, 'public/assets/app.js'), 'utf8');
  const aggregate = readFileSync(resolve(ROOT, 'public/assets/aggregate.js'), 'utf8');
  const i18n = readFileSync(resolve(ROOT, 'public/assets/i18n.js'), 'utf8');
  const html = readFileSync(resolve(ROOT, 'public/index.html'), 'utf8');
  const needle = '<script src="assets/app.js"></script>';
  const payload = `<script>\n${app}\n</script>`;

  /* หมายเหตุ: ครั้งหนึ่ง app.js เคยมี `$'` จากสัญลักษณ์เงินดอลลาร์
     ต่อมาบรรทัดนั้นถูกแทนที่ด้วยระบบแปลภาษา ทำให้สายอักขระนั้นหายไป
     เทสต์นี้จึงยืนยัน "คุณสมบัติที่ต้องเป็นจริงเสมอ" แทนการอิงข้อความที่บังเอิญมีอยู่
     เพราะอันตรายยังอยู่กับทุก `$'`, `$&`, `` $` `` ที่อาจถูกเพิ่มเข้ามาในอนาคต */
  it('string replacement ยังคงอันตรายเมื่อโค้ดมี $-substitution', () => {
    const risky = `const price = 'ราคาโดยประมาณ $' + total;`;
    const host = 'HEAD<!--SLOT-->TAIL';
    const broken = host.replace('<!--SLOT-->', risky);
    const safe = host.replace('<!--SLOT-->', () => risky);
    expect(broken).not.toBe(safe);
    expect(broken).toContain('TAIL + total'); // ท้ายเอกสารถูกยัดเข้ามากลางโค้ด
    expect(safe).toBe(`HEAD${risky}TAIL`);
  });

  it('ไฟล์จริงทุกไฟล์ที่ถูกฝังต้องผ่าน new Function ได้', () => {
    for (const src of [app, aggregate, i18n]) {
      expect(() => new Function(src)).not.toThrow();
    }
  });

  it('a function replacer inlines the script byte-for-byte', () => {
    const safe = html.replace(needle, () => payload);
    const embedded = safe.match(/<script>\n([\s\S]*?)\n<\/script>/)?.[1] ?? '';
    expect(embedded).toBe(app);
    expect(embedded.length).toBe(app.length);
    expect(() => new Function(embedded)).not.toThrow();
  });

  it('the inlined script is syntactically valid on its own', () => {
    expect(() => new Function(app)).not.toThrow();
  });
});
