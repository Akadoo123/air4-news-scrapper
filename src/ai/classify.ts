import { env } from '../config.js';
import { logger, type RunErrors } from '../logger.js';
import { AiProvider, BudgetExceededError, buildSystemPrompt } from './provider.js';
import { fallbackAnalyze } from '../analysis/fallback.js';
import { truncate } from '../security/sanitize.js';
import { AnalysisSchema, type AnalyzedItem, type NormalizedItem } from '../types.js';

/* ============================================================
 * วิเคราะห์ข่าวรายข่าว
 * Cost control:
 *   - รับเฉพาะข่าวที่ผ่าน prefilter แล้ว (ชั้นบนคัดมาให้)
 *   - จำกัดจำนวนข่าวต่อรอบ (MAX_AI_ITEMS_PER_RUN)
 *   - จำกัดความยาว content (AI_MAX_INPUT_CHARS)
 *   - แคชผลตาม contentHash — ไม่วิเคราะห์ URL/เนื้อหาเดิมซ้ำ
 *   - effort = low (ปรับได้) และไม่เปิด thinking สำหรับงานจัดประเภท
 * ========================================================== */

export interface AnalysisCache {
  get(hash: string): AnalyzedItem | undefined;
  set(hash: string, item: AnalyzedItem): void;
}

function buildUserContent(item: NormalizedItem): string {
  const parts = [
    `หัวข้อข่าว: ${item.title}`,
    `สำนักข่าว: ${item.sourceName} (Tier ${item.sourceTier}${item.unverified ? ', ยังไม่ยืนยัน' : ''})`,
    `ประเทศ: ${item.sourceCountry}`,
    `ภาษา: ${item.language}`,
    `วันที่เผยแพร่: ${item.publishedAt ?? 'ไม่ระบุ'}`,
    item.isPressRelease ? 'ประเภท: ข่าวประชาสัมพันธ์ (Press Release)' : '',
    item.isSponsored ? 'ประเภท: เนื้อหาโฆษณา (Sponsored)' : '',
    `เนื้อหาย่อ: ${truncate(item.snippet, env.aiMaxInputChars)}`,
    item.matchedCompetitors.length ? `คู่แข่งที่ระบบตรวจพบ: ${item.matchedCompetitors.join(', ')}` : '',
    item.matchedBrands.length ? `แบรนด์ที่ระบบตรวจพบ: ${item.matchedBrands.join(', ')}` : '',
    item.relatedCoverage.length ? `รายงานจากแหล่งอื่น: ${item.relatedCoverage.length} แหล่ง` : '',
  ];
  return parts.filter(Boolean).join('\n');
}

function toAnalyzedItem(
  item: NormalizedItem,
  analysis: ReturnType<typeof fallbackAnalyze>,
  by: 'ai' | 'fallback',
  model?: string,
): AnalyzedItem {
  return {
    ...item,
    ...analysis,
    analyzedBy: by,
    analysisModel: model,
    sourceUrl: item.canonicalUrl,
    titleOriginal: item.title,
    originalSnippet: item.snippet,
  };
}

export async function analyzeItems(
  items: NormalizedItem[],
  provider: AiProvider,
  errors: RunErrors,
  cache?: AnalysisCache,
): Promise<{ analyzed: AnalyzedItem[]; aiCount: number; fallbackCount: number }> {
  const system = buildSystemPrompt('impact-classifier.md');
  const analyzed: AnalyzedItem[] = [];
  let aiCount = 0;
  let fallbackCount = 0;
  let budgetStopped = false;

  // ข่าวที่ prefilter คะแนนสูงสุดได้สิทธิ์ใช้ AI ก่อน
  const ordered = [...items].sort((a, b) => b.prefilterScore - a.prefilterScore);

  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];

    // 1) cache hit — ไม่เสียค่า AI ซ้ำ
    const cached = cache?.get(item.contentHash);
    if (cached) {
      analyzed.push({ ...cached, ...item, analyzedBy: cached.analyzedBy, ...extractAnalysis(cached) });
      if (cached.analyzedBy === 'ai') aiCount++;
      else fallbackCount++;
      continue;
    }

    const overLimit = i >= env.maxAiItemsPerRun;
    if (!provider.enabled || budgetStopped || overLimit) {
      const fb = toAnalyzedItem(item, fallbackAnalyze(item), 'fallback');
      analyzed.push(fb);
      cache?.set(item.contentHash, fb);
      fallbackCount++;
      continue;
    }

    try {
      const analysis = await provider.generate({
        system,
        userContent: buildUserContent(item),
        schema: AnalysisSchema,
        effort: env.aiEffortItem as 'low',
        thinking: false,
        maxTokens: 2500,
        cacheSystem: true,
      });
      const out = toAnalyzedItem(item, analysis, 'ai', provider.model);
      analyzed.push(out);
      cache?.set(item.contentHash, out);
      aiCount++;
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        budgetStopped = true;
        errors.capture('ai:budget', err);
        logger.warn('AI budget exhausted — remaining items use rule-based fallback');
      } else {
        errors.capture(`ai:classify:${item.id}`, err);
      }
      const fb = toAnalyzedItem(item, fallbackAnalyze(item), 'fallback');
      analyzed.push(fb);
      cache?.set(item.contentHash, fb);
      fallbackCount++;
    }
  }

  logger.info({ aiCount, fallbackCount }, 'per-item analysis finished');
  return { analyzed, aiCount, fallbackCount };
}

/** ดึงเฉพาะฟิลด์ผลวิเคราะห์จากรายการที่แคชไว้ */
function extractAnalysis(a: AnalyzedItem) {
  const {
    titleTh, shortSummaryTh, classification, impactScore, confidence, relevanceScore,
    newsCategory, affectedChannels, affectedProducts, affectedCountries, affectedCompetitors,
    okrImpact, positiveImpacts, negativeImpacts, reasoningSummary, businessInterpretation,
    recommendedActions, timeHorizon, analysisModel, sourceUrl, titleOriginal, originalSnippet,
  } = a;
  return {
    titleTh, shortSummaryTh, classification, impactScore, confidence, relevanceScore,
    newsCategory, affectedChannels, affectedProducts, affectedCountries, affectedCompetitors,
    okrImpact, positiveImpacts, negativeImpacts, reasoningSummary, businessInterpretation,
    recommendedActions, timeHorizon, analysisModel, sourceUrl, titleOriginal, originalSnippet,
  };
}
