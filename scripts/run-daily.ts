#!/usr/bin/env tsx
/**
 * รันระบบครบวงจร: ดึงข่าว → วิเคราะห์ → บันทึก → พร้อม Deploy
 * ใช้โดย GitHub Actions และการรันด้วยมือ
 *
 * Exit codes:
 *   0 = สำเร็จ (รวมถึงกรณี degraded — บาง source ล้มแต่ระบบยังทำงาน)
 *   1 = ล้มเหลวทั้งหมด
 */
import { runPipeline } from '../src/index.js';
import { logger } from '../src/logger.js';

const args = new Set(process.argv.slice(2));

async function main() {
  const report = await runPipeline({
    dryRun: args.has('--dry-run'),
    disableAi: args.has('--no-ai'),
  });

  console.log('\n─────────── สรุปผลการทำงาน ───────────');
  console.log(`วันที่รายงาน        : ${report.date} (${report.timezone})`);
  console.log(`สถานะ              : ${report.status}`);
  console.log(`ข่าวที่เก็บได้       : ${report.kpi.totalCollected}`);
  console.log(`หลังตัดข่าวซ้ำ      : ${report.kpi.afterDedup}`);
  console.log(`ผ่าน Prefilter      : ${report.kpi.afterPrefilter}`);
  console.log(`แสดงบน Dashboard   : ${report.kpi.published}`);
  console.log(`  เชิงบวก / กลาง / ลบ: ${report.kpi.positive} / ${report.kpi.neutral} / ${report.kpi.negative}`);
  console.log(`  ผลกระทบสูง        : ${report.kpi.highImpact}`);
  console.log(`  สัญญาณคู่แข่ง      : ${report.kpi.competitorAlerts}`);
  console.log(`AI                 : ${report.ai.enabled ? report.ai.model : 'ปิดใช้งาน (rule-based)'}`);
  console.log(`  วิเคราะห์โดย AI    : ${report.ai.itemsAnalyzedByAi}`);
  console.log(`  วิเคราะห์โดยกฎ     : ${report.ai.itemsAnalyzedByFallback}`);
  console.log(`  ค่าใช้จ่ายประมาณ   : $${report.ai.estimatedCostUsd.toFixed(4)}`);
  const configured = report.sourceHealth.filter((h) => h.configured !== false);
  const notConfigured = report.sourceHealth.length - configured.length;
  console.log(
    `แหล่งข่าวที่ล้มเหลว  : ${configured.filter((h) => !h.ok).length}/${configured.length}` +
      (notConfigured > 0 ? ` (ยังไม่ตั้งค่าอีก ${notConfigured})` : ''),
  );
  console.log(`ข้อผิดพลาดที่ข้ามไป  : ${report.errors.length}`);
  console.log('──────────────────────────────────────\n');

  if (report.status === 'failed') {
    logger.error('all sources failed — pipeline unsuccessful');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.stack : String(err) }, 'fatal error');
  process.exit(1);
});
