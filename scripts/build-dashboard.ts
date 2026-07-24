#!/usr/bin/env tsx
/**
 * ตรวจสอบความพร้อมของ Dashboard ก่อน Deploy
 * Dashboard เป็น static ไม่ต้อง build — สคริปต์นี้ทำหน้าที่ตรวจสอบว่า
 * ไฟล์ครบและข้อมูลถูกต้องตาม Schema
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../src/config.js';
import { DailyReportSchema } from '../src/types.js';
import { loadIndex } from '../src/storage/store.js';

const REQUIRED = [
  'public/index.html',
  'public/assets/styles.css',
  'public/assets/app.js',
  'public/data/latest.json',
  'public/data/index.json',
];

let failed = false;

console.log('\n─────── ตรวจสอบ Dashboard ───────');

for (const rel of REQUIRED) {
  const ok = existsSync(resolve(ROOT, rel));
  console.log(`  ${ok ? 'OK  ' : 'MISS'} ${rel}`);
  if (!ok) failed = true;
}

if (!failed) {
  try {
    const raw = JSON.parse(readFileSync(resolve(ROOT, 'public/data/latest.json'), 'utf8'));
    const report = DailyReportSchema.parse(raw);
    console.log(`  OK   latest.json ผ่าน schema (${report.items.length} ข่าว, วันที่ ${report.date})`);

    const index = loadIndex();
    console.log(`  OK   index.json มีข้อมูลย้อนหลัง ${index.days.length} วัน`);

    // ตรวจว่าไม่มี secret หลุดลงไฟล์ข้อมูล
    const text = JSON.stringify(report);
    if (/sk-ant-|api[_-]?key["':\s]+[A-Za-z0-9_-]{20,}/i.test(text)) {
      console.error('  FAIL พบสิ่งที่อาจเป็น secret ในไฟล์ข้อมูล');
      failed = true;
    } else {
      console.log('  OK   ไม่พบ secret ในไฟล์ข้อมูล');
    }
  } catch (err) {
    console.error(`  FAIL ข้อมูลไม่ผ่าน schema: ${err instanceof Error ? err.message : String(err)}`);
    failed = true;
  }
}

console.log('──────────────────────────────────\n');

if (failed) {
  console.error('Dashboard ยังไม่พร้อม Deploy — รัน `npm run mock` หรือ `npm run daily` ก่อน\n');
  process.exit(1);
}
console.log('Dashboard พร้อม Deploy\n');
