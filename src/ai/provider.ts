import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { ROOT, env, aiAvailable, loadBusinessContext } from '../config.js';
import { logger } from '../logger.js';

/* ============================================================
 * AI Provider Adapter
 *  - ผู้ให้บริการเดียว ณ ตอนนี้คือ Anthropic (Official SDK)
 *  - ออกแบบเป็น interface เพื่อเปลี่ยน provider ได้ภายหลัง
 *  - ใช้ Structured Outputs (output_config.format) ให้ได้ JSON ที่ Validate ผ่านเสมอ
 * ========================================================== */

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  requests: number;
  estimatedCostUsd: number;
}

/** ราคา (USD ต่อ 1M tokens) แยกตาม model — ใช้คำนวณค่าใช้จ่ายโดยประมาณ */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

export class BudgetExceededError extends Error {
  constructor(spent: number, budget: number) {
    super(`AI daily budget exceeded: $${spent.toFixed(4)} > $${budget.toFixed(2)}`);
    this.name = 'BudgetExceededError';
  }
}

export interface GenerateOptions<T extends z.ZodType> {
  system: string;
  userContent: string;
  schema: T;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** เปิด adaptive thinking (ใช้กับงานวิเคราะห์เชิงลึกเท่านั้น เพื่อคุมต้นทุน) */
  thinking?: boolean;
  maxTokens?: number;
  /** แคช system prefix ที่คงที่ (business context) เพื่อลดค่าใช้จ่าย */
  cacheSystem?: boolean;
}

export class AiProvider {
  private readonly client: Anthropic | null;
  readonly model: string;
  readonly usage: UsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    requests: 0,
    estimatedCostUsd: 0,
  };

  constructor(options: { disabled?: boolean } = {}) {
    this.model = env.aiModel;
    this.client =
      !options.disabled && aiAvailable() ? new Anthropic({ apiKey: env.anthropicApiKey }) : null;
    if (!this.client) {
      logger.warn('AI provider unavailable (no API key or disabled) — using rule-based fallback');
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** เหลืองบประมาณหรือไม่ */
  get withinBudget(): boolean {
    return this.usage.estimatedCostUsd < env.aiDailyBudgetUsd;
  }

  private track(usage: Anthropic.Beta.BetaUsage | undefined): void {
    if (!usage) return;
    // จับคู่แบบ prefix เพื่อรองรับ model ID ที่มีวันที่ต่อท้าย
    // (เช่น 'claude-haiku-4-5-20251001' ให้ตรงกับราคาของ 'claude-haiku-4-5')
    const price =
      PRICING[this.model] ??
      Object.entries(PRICING).find(([id]) => this.model.startsWith(id))?.[1] ??
      { input: 5, output: 25 };
    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;

    this.usage.inputTokens += input;
    this.usage.outputTokens += output;
    this.usage.cacheReadTokens += cacheRead;
    this.usage.cacheWriteTokens += cacheWrite;
    this.usage.requests += 1;
    this.usage.estimatedCostUsd +=
      (input / 1e6) * price.input +
      (cacheWrite / 1e6) * price.input * 1.25 +
      (cacheRead / 1e6) * price.input * 0.1 +
      (output / 1e6) * price.output;
  }

  /**
   * เรียก AI แล้วบังคับให้ผลลัพธ์ตรง Schema
   * Retry ไม่เกิน 2 ครั้งเมื่อ Validation ไม่ผ่าน — ถ้ายังไม่ผ่านให้ throw
   * ให้ชั้นบนไปใช้ Rule-based Fallback
   */
  async generate<T extends z.ZodType>(opts: GenerateOptions<T>): Promise<z.infer<T>> {
    if (!this.client) throw new Error('AI provider not configured');
    if (!this.withinBudget) {
      throw new BudgetExceededError(this.usage.estimatedCostUsd, env.aiDailyBudgetUsd);
    }

    const maxTokens = opts.maxTokens ?? 4000;
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      {
        type: 'text',
        text: opts.system,
        ...(opts.cacheSystem ? { cache_control: { type: 'ephemeral' as const } } : {}),
      },
    ];

    let lastErr: unknown;
    for (let attempt = 0; attempt <= 2; attempt++) {
      const userContent =
        attempt === 0
          ? opts.userContent
          : `${opts.userContent}\n\nคำเตือน: คำตอบครั้งก่อนไม่ผ่าน schema validation (${
              lastErr instanceof Error ? lastErr.message.slice(0, 300) : ''
            }) — ตอบใหม่ให้ตรง schema ทุกฟิลด์`;

      try {
        const res = await this.client.beta.messages.parse({
          model: this.model,
          max_tokens: maxTokens,
          system,
          ...(opts.thinking ? { thinking: { type: 'adaptive' as const } } : {}),
          output_config: {
            effort: opts.effort,
            format: betaZodOutputFormat(opts.schema),
          },
          messages: [{ role: 'user', content: userContent }],
        });

        this.track(res.usage);

        if (res.stop_reason === 'refusal') {
          throw new Error('model refused the request');
        }
        if (res.parsed_output == null) {
          throw new Error('structured output missing (possibly truncated)');
        }
        // Validate ซ้ำด้วย schema ของเราเอง กัน edge case
        return opts.schema.parse(res.parsed_output) as z.infer<T>;
      } catch (err) {
        lastErr = err;
        if (err instanceof Anthropic.RateLimitError) {
          logger.warn({ attempt }, 'AI rate limited — backing off');
          await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
          continue;
        }
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          throw err; // ไม่ต้อง retry
        }
        logger.warn(
          { attempt, err: err instanceof Error ? err.message : String(err) },
          'AI call failed — retrying',
        );
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

/* ---------------- Prompt loading ---------------- */

const promptCache = new Map<string, string>();

export function loadPrompt(name: string): string {
  const cached = promptCache.get(name);
  if (cached) return cached;
  const text = readFileSync(resolve(ROOT, 'prompts', name), 'utf8');
  promptCache.set(name, text);
  return text;
}

/** แทนที่ตัวแปรใน prompt template */
export function renderPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => vars[key] ?? m);
}

/** สร้าง system prompt พร้อม business context (ส่วนนี้คงที่ → แคชได้) */
export function buildSystemPrompt(promptFile: string): string {
  const bc = loadBusinessContext();
  return renderPrompt(loadPrompt(promptFile), {
    COMPANY_NAME: 'บริษัท แอร์โฟร์อินเตอร์เนชั่นแนล จำกัด (Air4 International Co., Ltd.)',
    BUSINESS_CONTEXT: JSON.stringify(bc, null, 1),
    DEPARTMENTS: bc.departments.join(', '),
  });
}
