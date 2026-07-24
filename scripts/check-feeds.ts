#!/usr/bin/env tsx
/**
 * ตรวจสุขภาพ URL ของฟีด — ใช้เมื่อสงสัยว่าแหล่งข่าวย้าย URL หรือปิดให้บริการ
 *
 *   npx tsx scripts/check-feeds.ts                    ตรวจฟีดใน sources.yaml
 *   npx tsx scripts/check-feeds.ts <url> [<url>...]   ตรวจ URL ที่ระบุ
 */
import { fetchText } from '../src/collectors/http.js';
import { parseFeed } from '../src/parsers/feed.js';
import { loadSources } from '../src/config.js';

const args = process.argv.slice(2);

const targets: Array<{ name: string; url: string }> = args.length
  ? args.map((u) => ({ name: u, url: u }))
  : loadSources().feeds.filter((f) => f.enabled).map((f) => ({ name: f.name, url: f.url }));

interface CheckResult {
  name: string;
  url: string;
  ok: boolean;
  count: number;
  sample: string;
  error: string;
}

const results: CheckResult[] = await Promise.all(
  targets.map(async (t): Promise<CheckResult> => {
    try {
      const xml = await fetchText(t.url, { maxRetries: 0, timeoutMs: 12000 });
      const items = parseFeed(xml);
      return { ...t, ok: true, count: items.length, sample: items[0]?.title ?? '', error: '' };
    } catch (err) {
      return {
        ...t,
        ok: false,
        count: 0,
        sample: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }),
);

for (const r of results.sort((a, b) => Number(a.ok) - Number(b.ok))) {
  console.log(`${r.ok ? `OK  ${String(r.count).padStart(3)}` : 'FAIL   '}  ${r.name}`);
  console.log(`        ${r.url}`);
  if (r.ok && r.sample) console.log(`        ตัวอย่าง: ${r.sample.slice(0, 70)}`);
  if (!r.ok) console.log(`        ${r.error}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\nสรุป: ใช้งานได้ ${results.length - failed}/${results.length} แหล่ง\n`);
