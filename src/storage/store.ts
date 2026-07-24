import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ROOT, env } from '../config.js';
import { logger } from '../logger.js';
import { DailyReportSchema, type AnalyzedItem, type DailyReport } from '../types.js';
import type { AnalysisCache } from '../ai/classify.js';

/* ============================================================
 * Storage — JSON แยกตามวันที่ (เหมาะกับ Static Deployment)
 * โครงสร้าง:
 *   public/data/index.json          รายการวันที่ + สรุป KPI ย้อนหลัง
 *   public/data/reports/YYYY-MM-DD.json  รายงานเต็มของวันนั้น
 *   public/data/cache/analysis.json  แคชผลวิเคราะห์ (กันวิเคราะห์ซ้ำ)
 *
 * ทุกอย่างอยู่หลัง interface เดียว เพื่อย้ายไป SQLite/Postgres ได้ภายหลัง
 * ========================================================== */

const DATA_DIR = resolve(ROOT, 'public', 'data');
const REPORTS_DIR = join(DATA_DIR, 'reports');
const CACHE_DIR = join(DATA_DIR, 'cache');
const INDEX_FILE = join(DATA_DIR, 'index.json');
const CACHE_FILE = join(CACHE_DIR, 'analysis.json');
const LATEST_FILE = join(DATA_DIR, 'latest.json');

export interface IndexEntry {
  date: string;
  generatedAt: string;
  status: DailyReport['status'];
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  netImpactScore: number;
  overallSentiment: string;
  competitorAlerts: number;
}

export interface IndexFile {
  updatedAt: string;
  timezone: string;
  days: IndexEntry[];
}

function ensureDirs(): void {
  for (const d of [DATA_DIR, REPORTS_DIR, CACHE_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

function readJson<T>(file: string): T | null {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch (err) {
    logger.warn({ file, err: String(err) }, 'failed to read json');
    return null;
  }
}

function writeJson(file: string, data: unknown): void {
  ensureDirs();
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/* ---------------- Reports ---------------- */

export function saveReport(report: DailyReport): void {
  ensureDirs();
  const parsed = DailyReportSchema.parse(report);
  writeJson(join(REPORTS_DIR, `${parsed.date}.json`), parsed);
  writeJson(LATEST_FILE, parsed);
  updateIndex(parsed);
  pruneOldReports();
  logger.info({ date: parsed.date, items: parsed.items.length }, 'report saved');
}

export function loadReport(date: string): DailyReport | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null; // กัน path traversal
  return readJson<DailyReport>(join(REPORTS_DIR, `${date}.json`));
}

export function loadLatestReport(): DailyReport | null {
  return readJson<DailyReport>(LATEST_FILE);
}

export function loadIndex(): IndexFile {
  return (
    readJson<IndexFile>(INDEX_FILE) ?? {
      updatedAt: new Date().toISOString(),
      timezone: env.timezone,
      days: [],
    }
  );
}

function updateIndex(report: DailyReport): void {
  const index = loadIndex();
  const entry: IndexEntry = {
    date: report.date,
    generatedAt: report.generatedAt,
    status: report.status,
    total: report.kpi.published,
    positive: report.kpi.positive,
    neutral: report.kpi.neutral,
    negative: report.kpi.negative,
    netImpactScore: report.daily.netImpactScore,
    overallSentiment: report.daily.overallSentiment,
    competitorAlerts: report.kpi.competitorAlerts,
  };

  const days = index.days.filter((d) => d.date !== report.date);
  days.push(entry);
  days.sort((a, b) => (a.date < b.date ? 1 : -1)); // ใหม่สุดก่อน

  writeJson(INDEX_FILE, {
    updatedAt: new Date().toISOString(),
    timezone: env.timezone,
    days: days.slice(0, env.retentionDays),
  });
}

/** ลบรายงานที่เก่ากว่า RETENTION_DAYS เพื่อไม่ให้ repo โต */
function pruneOldReports(): void {
  const index = loadIndex();
  const keep = new Set(index.days.map((d) => d.date));
  try {
    for (const f of readdirSync(REPORTS_DIR)) {
      const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (m && !keep.has(m[1])) {
        unlinkSync(join(REPORTS_DIR, f));
        logger.debug({ file: f }, 'pruned old report');
      }
    }
  } catch (err) {
    logger.warn({ err: String(err) }, 'prune failed');
  }
}

/* ---------------- Analysis cache ---------------- */

interface CacheRecord {
  savedAt: string;
  item: AnalyzedItem;
}

/**
 * แคชผลวิเคราะห์ตาม contentHash — ข่าวเดิมที่ปรากฏซ้ำในวันถัดไป
 * จะไม่ถูกส่งเข้า AI อีก (ประหยัดค่าใช้จ่ายอย่างมีนัยสำคัญ)
 */
export class FileAnalysisCache implements AnalysisCache {
  private readonly data: Map<string, CacheRecord>;
  private dirty = false;

  constructor() {
    const raw = readJson<Record<string, CacheRecord>>(CACHE_FILE) ?? {};
    this.data = new Map(Object.entries(raw));
    this.evictExpired();
  }

  private evictExpired(): void {
    const cutoff = Date.now() - 14 * 24 * 3600 * 1000; // เก็บ 14 วัน
    for (const [k, v] of this.data) {
      if (Date.parse(v.savedAt) < cutoff) {
        this.data.delete(k);
        this.dirty = true;
      }
    }
  }

  get(hash: string): AnalyzedItem | undefined {
    return this.data.get(hash)?.item;
  }

  set(hash: string, item: AnalyzedItem): void {
    this.data.set(hash, { savedAt: new Date().toISOString(), item });
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    writeJson(CACHE_FILE, Object.fromEntries(this.data));
    this.dirty = false;
  }

  get size(): number {
    return this.data.size;
  }
}

/** ใช้ตรวจว่ามีข้อมูลใหม่จริงก่อน commit (สำหรับ GitHub Actions) */
export function hasNewData(report: DailyReport): boolean {
  const existing = loadReport(report.date);
  if (!existing) return true;
  const oldIds = new Set(existing.items.map((i) => i.id));
  return report.items.some((i) => !oldIds.has(i.id));
}
