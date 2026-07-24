#!/usr/bin/env tsx
/**
 * วิเคราะห์ข่าวใหม่และบันทึกรายงาน (เหมือน run-daily แต่ไม่พิมพ์สรุปยาว)
 * มีไว้เพื่อให้แยกขั้นตอนใน CI ได้ตามต้องการ
 */
import { runPipeline } from '../src/index.js';
import { logger } from '../src/logger.js';

runPipeline({ disableAi: process.argv.includes('--no-ai') })
  .then((r) => {
    console.log(`วิเคราะห์เสร็จสิ้น: ${r.kpi.published} ข่าว (สถานะ ${r.status})`);
    if (r.status === 'failed') process.exit(1);
  })
  .catch((err) => {
    logger.error({ err: err instanceof Error ? err.stack : String(err) }, 'analysis failed');
    process.exit(1);
  });
