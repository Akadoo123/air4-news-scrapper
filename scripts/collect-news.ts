#!/usr/bin/env tsx
/** ขั้นตอนเดียว: ดึงข่าวและตรวจสุขภาพแหล่งข่าว (ไม่วิเคราะห์ ไม่เสียค่า AI) */
import { collectAll } from '../src/collectors/index.js';
import { normalizeItems, filterByRecency } from '../src/normalizers/item.js';
import { deduplicate } from '../src/deduplication/dedupe.js';
import { RunErrors, logger } from '../src/logger.js';
import { env } from '../src/config.js';

async function main() {
  const errors = new RunErrors();
  const { items, health } = await collectAll(errors);
  const normalized = normalizeItems(items);
  const recent = filterByRecency(normalized);
  const dedup = deduplicate(recent.kept);
  const candidates = dedup.items.filter((i) => i.prefilterScore >= env.prefilterMinScore);

  console.log('\n─────── ผลการดึงข่าว ───────');
  console.log(`ดึงมาได้            : ${items.length}`);
  console.log(`หลัง normalize      : ${normalized.length}`);
  console.log(`อยู่ในช่วงเวลา       : ${recent.kept.length} (ตัดข่าวเก่า ${recent.droppedStale})`);
  console.log(`หลังตัดข่าวซ้ำ      : ${dedup.items.length} (ซ้ำ ${dedup.duplicatesRemoved})`);
  console.log(`ผ่าน Prefilter      : ${candidates.length}\n`);

  console.log('สถานะแหล่งข่าว:');
  for (const h of health.sort((a, b) => Number(a.ok) - Number(b.ok))) {
    console.log(
      `  ${h.ok ? 'OK  ' : 'FAIL'} ${h.sourceName.padEnd(38)} ${String(h.itemCount).padStart(3)} ข่าว` +
      (h.error ? `  — ${h.error.slice(0, 70)}` : ''),
    );
  }

  console.log('\nตัวอย่างข่าวที่ผ่านเกณฑ์ (10 อันดับแรก):');
  for (const i of candidates.sort((a, b) => b.prefilterScore - a.prefilterScore).slice(0, 10)) {
    console.log(`  [${String(i.prefilterScore).padStart(3)}] ${i.title.slice(0, 76)}`);
  }
  console.log();
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.stack : String(err) }, 'collection failed');
  process.exit(1);
});
