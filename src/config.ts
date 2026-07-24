import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..');

dotenv.config({ path: resolve(ROOT, '.env'), quiet: true });

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return /^(1|true|yes|on)$/i.test(v);
}
function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const env = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  aiProvider: str('AI_PROVIDER', 'anthropic'),
  aiModel: str('AI_MODEL', 'claude-opus-4-8'),
  aiEnabled: bool('AI_ENABLED', true),
  aiEffortItem: str('AI_EFFORT_ITEM', 'low'),
  aiEffortDaily: str('AI_EFFORT_DAILY', 'high'),

  newsApiKey: process.env.NEWS_API_KEY ?? '',
  facebookPageToken: process.env.FACEBOOK_PAGE_TOKEN ?? '',
  tiktokAccessToken: process.env.TIKTOK_ACCESS_TOKEN ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  dashboardBaseUrl: process.env.DASHBOARD_BASE_URL ?? '',

  maxNewsPerSource: num('MAX_NEWS_PER_SOURCE', 20),
  lookbackHours: num('LOOKBACK_HOURS', 48),
  /** โซเชียล: กระทู้เก่ายังสะท้อนความต้องการลูกค้าได้ จึงใช้หน้าต่างกว้างกว่าข่าว */
  socialLookbackHours: num('SOCIAL_LOOKBACK_HOURS', 720),
  minRelevanceScore: num('MIN_RELEVANCE_SCORE', 40),
  prefilterMinScore: num('PREFILTER_MIN_SCORE', 8),
  maxAiItemsPerRun: num('MAX_AI_ITEMS_PER_RUN', 60),
  playwrightEnabled: bool('PLAYWRIGHT_ENABLED', false),
  timezone: str('TIMEZONE', 'Asia/Bangkok'),
  retentionDays: num('RETENTION_DAYS', 31),

  aiDailyBudgetUsd: num('AI_DAILY_BUDGET_USD', 2),
  aiMaxInputChars: num('AI_MAX_INPUT_CHARS', 1600),

  httpTimeoutMs: num('HTTP_TIMEOUT_MS', 15000),
  httpMaxRetries: num('HTTP_MAX_RETRIES', 2),
  perDomainDelayMs: num('PER_DOMAIN_DELAY_MS', 1200),
  userAgent: str(
    'USER_AGENT',
    'Air4IntelligenceBot/1.0 (+https://github.com/air4/air4-intelligence)',
  ),

  logLevel: str('LOG_LEVEL', 'info'),
} as const;

/** True when a real AI provider can be used. */
export const aiAvailable = (): boolean =>
  env.aiEnabled && env.aiProvider === 'anthropic' && env.anthropicApiKey.length > 10;

/* ---------------- YAML config loading ---------------- */

function loadYaml<T>(file: string): T {
  const p = resolve(ROOT, 'config', file);
  if (!existsSync(p)) throw new Error(`Missing config file: ${p}`);
  return parseYaml(readFileSync(p, 'utf8')) as T;
}

export interface BusinessContext {
  company: Record<string, unknown>;
  channels: Array<{ id: string; brand: string; detail: string; note?: string }>;
  products: Array<{ id: string; name_th: string; name_en: string; [k: string]: unknown }>;
  target_b2b_segments: unknown;
  okrs: { O1: { statement: string; lens: string }; O2: { statement: string; current_state: string; lens: string } };
  analysis_priorities: string[];
  departments: string[];
  classification_guidance: { ev_rule: string; tie_rule: string };
}

export interface KeywordTerm { t: string; query?: boolean }
export interface KeywordCategory {
  id: string;
  name_th: string;
  weight: number;
  core?: boolean;
  dual_impact?: boolean;
  ice_only?: boolean;
  terms: { th?: KeywordTerm[]; en?: KeywordTerm[] };
}
export interface KeywordsConfig {
  automotive_context: { th: string[]; en: string[] };
  categories: KeywordCategory[];
  brands: {
    priority: string[];
    all: string[];
    /** ชื่อแบรนด์ภาษาไทย — จำเป็นเพราะสื่อไทยไม่เขียนชื่อแบรนด์เป็นอังกฤษ */
    aliases?: Record<string, string[]>;
  };
  press_release_markers: string[];
  sponsored_markers: string[];
  hard_exclude: string[];
}

export interface CompetitorsConfig {
  require_automotive_context: boolean;
  competitors: Array<{
    id: string;
    name: string;
    aliases: string[];
    ambiguous: boolean;
    country: string;
    notes?: string;
  }>;
  negative_context_terms: string[];
  watch_signals: Array<{ id: string; th: string; severity: string }>;
}

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  tier: 1 | 2 | 3;
  country: string;
  language: string;
  enabled: boolean;
  unverified?: boolean;
}
import type { SocialSourceConfig } from './collectors/social.js';
import type { WeatherCity, WeatherThresholds } from './collectors/weather.js';

export interface SourcesConfig {
  defaults: { max_items: number; timeout_ms: number };
  google_news: {
    enabled: boolean;
    endpoint: string;
    tier: 1 | 2 | 3;
    locales: Array<{ id: string; hl: string; gl: string; ceid: string; country: string; language: string }>;
    max_queries_per_locale: number;
    max_items_per_query: number;
  };
  feeds: FeedSource[];
  social?: { enabled: boolean; sources: SocialSourceConfig[] };
  weather?: {
    enabled: boolean;
    thresholds?: Partial<WeatherThresholds>;
    cities: WeatherCity[];
  };
  newsapi: { enabled_if_key: boolean; endpoint: string; tier: 1 | 2 | 3; page_size: number; max_queries: number };
  scraping: { enabled: boolean; respect_robots_txt: boolean; playwright_only_for: string[] };
  policy: {
    per_domain_delay_ms: number;
    max_retries: number;
    backoff_base_ms: number;
    respect_robots_txt: boolean;
    store_full_article: boolean;
    max_snippet_chars: number;
  };
}

export interface CountriesConfig {
  home: { code: string; name_th: string; name_en: string };
  oem_markets: Array<{ code: string; name_th: string; name_en: string; lang: string }>;
  prospect_markets: Array<{ code: string; name_th: string; name_en: string; rationale_hint: string }>;
}

let cache: {
  business?: BusinessContext;
  keywords?: KeywordsConfig;
  competitors?: CompetitorsConfig;
  sources?: SourcesConfig;
  countries?: CountriesConfig;
} = {};

export const loadBusinessContext = (): BusinessContext =>
  (cache.business ??= loadYaml<BusinessContext>('business-context.yaml'));
export const loadKeywords = (): KeywordsConfig =>
  (cache.keywords ??= loadYaml<KeywordsConfig>('keywords.yaml'));
export const loadCompetitors = (): CompetitorsConfig =>
  (cache.competitors ??= loadYaml<CompetitorsConfig>('competitors.yaml'));
export const loadSources = (): SourcesConfig =>
  (cache.sources ??= loadYaml<SourcesConfig>('sources.yaml'));
export const loadCountries = (): CountriesConfig =>
  (cache.countries ??= loadYaml<CountriesConfig>('countries.yaml'));

/** For tests. */
export const __clearConfigCache = () => {
  cache = {};
};
