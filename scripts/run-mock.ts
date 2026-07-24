#!/usr/bin/env tsx
/**
 * รันระบบด้วยข้อมูลจำลอง — ไม่แตะเครือข่าย ไม่เสียค่า AI
 * ใช้สำหรับ Preview Dashboard และตรวจสอบ Pipeline
 *
 *   npm run mock            ใช้ rule-based (ไม่เรียก AI)
 *   npm run mock -- --ai    เรียก AI จริง (ต้องมี ANTHROPIC_API_KEY)
 */
import { runPipeline } from '../src/index.js';
import { MOCK_NEWS } from '../tests/fixtures/mock-news.js';
import { logger } from '../src/logger.js';

const useAi = process.argv.includes('--ai');

runPipeline({ mockItems: MOCK_NEWS, disableAi: !useAi })
  .then((report) => {
    console.log('\n─────── Mock run สำเร็จ ───────');
    console.log(`ข่าวนำเข้า          : ${MOCK_NEWS.length}`);
    console.log(`หลังตัดข่าวซ้ำ      : ${report.kpi.afterDedup}`);
    console.log(`ผ่าน Prefilter      : ${report.kpi.afterPrefilter}`);
    console.log(`แสดงบน Dashboard   : ${report.kpi.published}`);
    console.log(`เชิงบวก/กลาง/ลบ    : ${report.kpi.positive}/${report.kpi.neutral}/${report.kpi.negative}`);
    console.log('\nข่าวที่แสดง:');
    for (const i of report.items) {
      console.log(
        `  [${i.classification.padEnd(8)}] ${String(i.impactScore).padStart(2)} ` +
        `(rel ${String(i.relevanceScore).padStart(3)}) ${i.titleTh.slice(0, 62)}`,
      );
    }
    console.log('\nเปิดดู Dashboard: npm run serve → http://localhost:4173\n');
  })
  .catch((err) => {
    logger.error({ err: err instanceof Error ? err.stack : String(err) }, 'mock run failed');
    process.exit(1);
  });
