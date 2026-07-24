#!/usr/bin/env tsx
/**
 * สร้าง Dashboard แบบไฟล์เดียว (standalone)
 *
 * รวม HTML + CSS + JS + ข้อมูล ไว้ในไฟล์ .html เดียว เปิดได้โดยไม่ต้องมีเซิร์ฟเวอร์
 * เหมาะกับการส่งรายงานให้ผู้บริหารทางอีเมล หรือเก็บเป็นสำเนาถาวรของวันนั้น
 *
 *   npx tsx scripts/build-standalone.ts                  ใช้รายงานล่าสุด
 *   npx tsx scripts/build-standalone.ts 2026-07-21       ระบุวันที่
 *   npx tsx scripts/build-standalone.ts --demo           ติดป้ายว่าเป็นข้อมูลตัวอย่าง
 *   npx tsx scripts/build-standalone.ts --out report.html
 *   npx tsx scripts/build-standalone.ts --fragment       เอาเฉพาะเนื้อหาใน <body>
 *                                                        (สำหรับฝังในหน้าอื่นหรือ Artifact
 *                                                         ที่มีโครง HTML ให้อยู่แล้ว)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { ROOT } from '../src/config.js';
import { loadReport, loadLatestReport, loadIndex } from '../src/storage/store.js';
import { escapeJsonForScript, escapeHtml } from '../src/security/sanitize.js';
import type { DailyReport } from '../src/types.js';

const args = process.argv.slice(2);
const isDemo = args.includes('--demo');
const asFragment = args.includes('--fragment');
const outFlag = args.indexOf('--out');
const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

const report: DailyReport | null = dateArg ? loadReport(dateArg) : loadLatestReport();
if (!report) {
  console.error(
    dateArg
      ? `ไม่พบรายงานของวันที่ ${dateArg}`
      : 'ยังไม่มีรายงาน — รัน `npm run daily` หรือ `npm run mock` ก่อน',
  );
  process.exit(1);
}

const outPath = resolve(
  ROOT,
  outFlag >= 0 && args[outFlag + 1] ? args[outFlag + 1] : `dist/air4-report-${report.date}.html`,
);

const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const html = read('public/index.html');
const css = read('public/assets/styles.css');
const i18nJs = read('public/assets/i18n.js');
const aggregateJs = read('public/assets/aggregate.js');
const js = read('public/assets/app.js');

const inline = (id: string, data: unknown) =>
  `<script type="application/json" id="${id}">${escapeJsonForScript(JSON.stringify(data))}</script>`;

const demoBanner = isDemo
  ? `<div class="demo-banner" role="note">
      <strong>ข้อมูลตัวอย่างสำหรับสาธิตระบบ</strong>
      ข่าวและบทวิเคราะห์ในหน้านี้ถูกสร้างขึ้นเพื่อแสดงการทำงานของ Dashboard เท่านั้น
      <b>ไม่ใช่ข่าวจริง</b> และลิงก์ข่าวต้นฉบับไม่สามารถเปิดได้
    </div>`
  : '';

const demoCss = isDemo
  ? `
.demo-banner {
  max-width: var(--maxw);
  margin: 16px auto 0;
  padding: 12px 16px;
  background: var(--neu-soft);
  border: 1px solid var(--neu-edge);
  border-radius: var(--radius);
  color: var(--ink-2);
  font-size: 13.5px;
  line-height: 1.6;
}
.demo-banner strong { display: block; color: var(--neu); font-size: 14px; margin-bottom: 2px; }
.demo-banner b { color: var(--neu); }
@media (max-width: 560px) { .demo-banner { margin: 12px 14px 0; } }
`
  : '';

const generatedNote = `รายงานวันที่ ${report.date} · สร้างเมื่อ ${report.generatedAt}`;

/**
 * แทนที่ข้อความแบบตรงตัว
 *
 * ต้องใช้ replacer แบบฟังก์ชันเสมอ — ถ้าส่ง replacement เป็น string
 * JavaScript จะตีความ `$'`, `$&`, `` $` `` เป็นสัญลักษณ์พิเศษ
 * ซึ่ง app.js เต็มไปด้วย `$('elementId')` จะทำให้ไฟล์ที่ได้เสียหาย
 */
function replaceOnce(haystack: string, needle: string, replacement: string): string {
  if (!haystack.includes(needle)) {
    throw new Error(`build-standalone: ไม่พบข้อความที่ต้องแทนที่ — ${needle.slice(0, 60)}`);
  }
  return haystack.replace(needle, () => replacement);
}

let out = html;
// ฝัง CSS แทนการอ้างอิงไฟล์ภายนอก
out = replaceOnce(
  out,
  '<link rel="stylesheet" href="assets/styles.css">',
  `<style>\n${css}\n${demoCss}</style>`,
);
// ฝังข้อมูลและ JS
out = replaceOnce(out, '<script src="assets/i18n.js"></script>', `<script>\n${i18nJs}\n</script>`);
out = replaceOnce(out, '<script src="assets/aggregate.js"></script>', `<script>\n${aggregateJs}\n</script>`);
out = replaceOnce(
  out,
  '<script src="assets/app.js"></script>',
  `${inline('inlineReport', report)}\n${inline('inlineIndex', loadIndex())}\n<script>\n${js}\n</script>`,
);
// แบนเนอร์แจ้งว่าเป็นข้อมูลตัวอย่าง (ถ้ามี)
if (demoBanner) {
  out = replaceOnce(out, '<main class="shell" id="app">', `${demoBanner}\n<main class="shell" id="app">`);
}
out = replaceOnce(
  out,
  '</title>',
  `</title>\n  <meta name="generator" content="${escapeHtml(generatedNote)}">`,
);

// โหมด fragment: เอาเฉพาะเนื้อหาภายใน <body> พร้อม <style> ที่ฝังไว้
// (ใช้กับ Artifact หรือ CMS ที่มีโครง <html>/<head> ให้อยู่แล้ว)
if (asFragment) {
  const styleBlock = out.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';
  const bodyInner = out.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  out = `${styleBlock}\n${bodyInner.trim()}\n`;
}

// ตรวจว่าไม่มีการอ้างอิงไฟล์ภายนอกหลงเหลือ
const leftovers = [...out.matchAll(/(?:src|href)="(?!data:|#|https?:)([^"]+)"/g)].map((m) => m[1]);
if (leftovers.length) {
  console.error(`ยังมีการอ้างอิงไฟล์ภายนอก: ${leftovers.join(', ')}`);
  process.exit(1);
}

/* ---- ตรวจความถูกต้องของผลลัพธ์ก่อนเขียนไฟล์ ----
   ครั้งหนึ่งเคยมีบั๊กที่ String.replace ตีความ `$'` ใน app.js เป็นสัญลักษณ์พิเศษ
   ทำให้ JS ที่ฝังไปเสียหายทั้งไฟล์แบบเงียบ ๆ — ด่านตรวจนี้กันไม่ให้เกิดซ้ำ */
const embedded = [...out.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map((m) => m[1]);
for (const [label, source] of [
  ['i18n.js', i18nJs],
  ['aggregate.js', aggregateJs],
  ['app.js', js],
] as const) {
  const found = embedded.find((e) => Math.abs(e.length - source.length) <= source.length * 0.02);
  if (!found) {
    console.error(
      `JS ที่ฝัง (${label}) มีขนาดผิดปกติ — น่าจะถูกแทนที่ผิดพลาด ` +
        `(ต้นฉบับ ${source.length} ตัวอักษร, พบ ${embedded.map((e) => e.length).join('/')})`,
    );
    process.exit(1);
  }
  try {
    // ตรวจไวยากรณ์โดยไม่รันโค้ด
    new Function(found);
  } catch (err) {
    console.error(
      `JS ที่ฝัง (${label}) มีไวยากรณ์ผิดพลาด: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
for (const [id, payload] of [
  ['inlineReport', report],
  ['inlineIndex', loadIndex()],
] as const) {
  const raw = out.match(new RegExp(`id="${id}">([\\s\\S]*?)</script>`))?.[1] ?? '';
  try {
    JSON.parse(raw);
  } catch {
    console.error(`ข้อมูล ${id} ที่ฝังไม่ใช่ JSON ที่ถูกต้อง`);
    process.exit(1);
  }
  void payload;
}

if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out, 'utf8');

const sizeKb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(0);
console.log(`\nสร้างไฟล์เดียวเรียบร้อย`);
console.log(`  ไฟล์   : ${outPath}`);
console.log(`  ขนาด   : ${sizeKb} KB`);
console.log(`  ข่าว   : ${report.items.length} รายการ (วันที่ ${report.date})`);
console.log(`  โหมด   : ${isDemo ? 'ข้อมูลตัวอย่าง (มีแบนเนอร์แจ้งเตือน)' : 'ข้อมูลจริง'}`);
console.log(
  asFragment
    ? `\nเป็น fragment (ไม่มี <html>/<head>) สำหรับฝังในหน้าอื่น\n`
    : `\nเปิดไฟล์นี้ได้โดยตรงในเบราว์เซอร์ ไม่ต้องมีเซิร์ฟเวอร์\n`,
);
