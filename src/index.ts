import { env } from './config.js';
import { logger, RunErrors } from './logger.js';
import { collectAll } from './collectors/index.js';
import { normalizeItems, filterByRecency } from './normalizers/item.js';
import { deduplicate } from './deduplication/dedupe.js';
import { AiProvider } from './ai/provider.js';
import { analyzeItems } from './ai/classify.js';
import { analyzeDaily } from './ai/dailyAnalysis.js';
import { computeKpi } from './analysis/kpi.js';
import { FileAnalysisCache, saveReport } from './storage/store.js';
import { dateKey } from './normalizers/date.js';
import type { DailyReport, RawItem, SourceHealth } from './types.js';

export interface RunOptions {
  /** ใช้ข้อมูลจำลองแทนการดึงข่าวจริง (สำหรับทดสอบ) */
  mockItems?: RawItem[];
  /** ไม่บันทึกลงดิสก์ */
  dryRun?: boolean;
  /** ปิด AI บังคับ (ใช้ rule-based) */
  disableAi?: boolean;
}

/**
 * Pipeline หลัก — collect → normalize → dedupe → prefilter → AI → daily → save
 * ทุกขั้นตอนออกแบบให้ degrade ได้ ไม่ล้มทั้งระบบเมื่อบางส่วนพัง
 */
export async function runPipeline(opts: RunOptions = {}): Promise<DailyReport> {
  const started = Date.now();
  const errors = new RunErrors();
  const date = dateKey(new Date(), env.timezone);

  logger.info({ date, timezone: env.timezone }, 'pipeline started');

  /* ---- 1) Collect ---- */
  let raw: RawItem[] = [];
  let health: SourceHealth[] = [];

  if (opts.mockItems) {
    raw = opts.mockItems;
    health = [
      { sourceId: 'mock', sourceName: 'Mock Data', ok: true, itemCount: raw.length, durationMs: 0 },
    ];
    logger.info({ count: raw.length }, 'using mock items');
  } else {
    try {
      const res = await collectAll(errors);
      raw = res.items;
      health = res.health;
    } catch (err) {
      errors.capture('collect', err);
    }
  }

  /* ---- 2) Normalize + prefilter scoring ---- */
  const normalized = normalizeItems(raw);
  const recency = filterByRecency(normalized);
  logger.info(
    { normalized: normalized.length, kept: recency.kept.length, stale: recency.droppedStale, undated: recency.undated },
    'normalization finished',
  );

  /* ---- 3) Deduplicate ---- */
  const dedup = deduplicate(recency.kept);
  logger.info({ unique: dedup.items.length, removed: dedup.duplicatesRemoved, groups: dedup.groups }, 'dedup finished');

  /* ---- 4) Rule-based gate (คุมต้นทุน AI) ---- */
  const candidates = dedup.items.filter((i) => i.prefilterScore >= env.prefilterMinScore);
  logger.info(
    { candidates: candidates.length, rejected: dedup.items.length - candidates.length, threshold: env.prefilterMinScore },
    'prefilter finished',
  );

  /* ---- 5) AI per-item analysis ---- */
  const provider = new AiProvider({ disabled: opts.disableAi });
  const cache = opts.dryRun ? undefined : new FileAnalysisCache();
  const useAi = provider.enabled;

  const { analyzed, aiCount, fallbackCount } = await analyzeItems(candidates, provider, errors, cache);

  /* ---- 6) Relevance cut ---- */
  const published = analyzed
    .filter((i) => i.relevanceScore >= env.minRelevanceScore)
    .sort((a, b) => {
      const sa = Math.abs(a.impactScore) * (a.confidence / 100) + a.relevanceScore / 100;
      const sb = Math.abs(b.impactScore) * (b.confidence / 100) + b.relevanceScore / 100;
      return sb - sa;
    });

  logger.info(
    { published: published.length, cutBelow: env.minRelevanceScore },
    'relevance filter finished',
  );

  /* ---- 7) Daily executive analysis ---- */
  const { daily } = await analyzeDaily(published, provider, errors);

  /* ---- 8) Assemble report ---- */
  const kpi = computeKpi(published, {
    totalCollected: raw.length,
    afterDedup: dedup.items.length,
    afterPrefilter: candidates.length,
  });

  // แหล่งที่ "ยังไม่ตั้งค่า" (เช่น FB/TikTok ขาด token) ไม่นับเป็นความล้มเหลว
  // เพราะเป็นสถานะปกติที่ผู้ใช้ตั้งใจ ไม่ควรทำให้ระบบขึ้นสถานะ degraded
  const configuredSources = health.filter((h) => h.configured !== false);
  const failedSources = configuredSources.filter((h) => !h.ok).length;
  const status: DailyReport['status'] =
    configuredSources.length > 0 && failedSources === configuredSources.length
      ? 'failed'
      : failedSources > 0 || errors.count > 0
        ? 'degraded'
        : 'ok';

  const report: DailyReport = {
    date,
    generatedAt: new Date().toISOString(),
    timezone: env.timezone,
    status,
    kpi,
    daily,
    items: published,
    sourceHealth: health,
    errors: errors.list().slice(0, 60),
    ai: {
      enabled: useAi,
      model: useAi ? provider.model : null,
      itemsAnalyzedByAi: aiCount,
      itemsAnalyzedByFallback: fallbackCount,
      inputTokens: provider.usage.inputTokens,
      outputTokens: provider.usage.outputTokens,
      estimatedCostUsd: Number(provider.usage.estimatedCostUsd.toFixed(4)),
    },
  };

  /* ---- 9) Persist ---- */
  if (!opts.dryRun) {
    saveReport(report);
    cache?.flush();
  }

  logger.info(
    {
      durationMs: Date.now() - started,
      status,
      published: published.length,
      errors: errors.count,
      costUsd: report.ai.estimatedCostUsd,
    },
    'pipeline finished',
  );

  return report;
}
