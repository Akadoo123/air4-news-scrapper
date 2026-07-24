import { loadKeywords, loadCompetitors, loadCountries } from '../config.js';
import type { NewsCategory, RawItem } from '../types.js';

export interface PrefilterResult {
  score: number;
  categories: NewsCategory[];
  competitors: string[];
  brands: string[];
  hasAutomotiveContext: boolean;
  isPressRelease: boolean;
  isSponsored: boolean;
  hardExcluded: boolean;
  reasons: string[];
}

const lower = (s: string) => s.toLowerCase();

/** Thai has no word boundaries, so `\b` only works for Latin script. */
function contains(haystackLower: string, needle: string): boolean {
  const n = lower(needle).trim();
  if (!n) return false;
  if (/^[\x20-\x7e]+$/.test(n)) {
    // Latin: require word-ish boundaries to avoid "wise" matching "otherwise".
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystackLower);
  }
  return haystackLower.includes(n);
}

/**
 * Cheap, deterministic relevance gate that runs BEFORE any AI call.
 *
 * Two jobs:
 *  1) Cost control — only items scoring >= PREFILTER_MIN_SCORE reach the model.
 *  2) False-positive control — an ambiguous competitor name ("Wizard", "Wise",
 *     "Fresh Air") only counts when the text also carries automotive context
 *     and carries no disqualifying context ("money transfer", "Harry Potter"...).
 */
export function prefilter(
  title: string,
  snippet: string,
  source?: Pick<RawItem, 'sourceTier' | 'sourceCountry'>,
): PrefilterResult {
  const kw = loadKeywords();
  const comp = loadCompetitors();
  const countries = loadCountries();

  const text = `${title} ${snippet}`;
  const hay = lower(text);

  const reasons: string[] = [];

  // ---- Hard exclusions ----
  if (kw.hard_exclude.some((t) => contains(hay, t))) {
    return {
      score: 0,
      categories: [],
      competitors: [],
      brands: [],
      hasAutomotiveContext: false,
      isPressRelease: false,
      isSponsored: false,
      hardExcluded: true,
      reasons: ['hard_exclude keyword matched'],
    };
  }

  // ---- Automotive context gate ----
  const autoTerms = [...kw.automotive_context.th, ...kw.automotive_context.en];
  const hasAutomotiveContext = autoTerms.some((t) => contains(hay, t));

  let score = 0;
  const categories = new Set<NewsCategory>();

  // ---- Category keyword scoring ----
  for (const cat of kw.categories) {
    const terms = [...(cat.terms.th ?? []), ...(cat.terms.en ?? [])];
    let hits = 0;
    for (const term of terms) {
      if (contains(hay, term.t)) hits++;
    }
    if (hits > 0) {
      categories.add(cat.id as NewsCategory);
      // Diminishing returns: first hit full weight, extra hits half.
      const catScore = cat.weight + (hits - 1) * Math.ceil(cat.weight / 2);
      score += Math.min(catScore, cat.weight * 3);
      reasons.push(`category ${cat.id} x${hits}`);
    }
  }

  // ---- Brand mentions (ตรวจทั้งชื่ออังกฤษและชื่อไทย) ----
  const brands: string[] = [];
  for (const brand of kw.brands.all) {
    const names = [brand, ...(kw.brands.aliases?.[brand] ?? [])];
    if (names.some((n) => contains(hay, n))) {
      brands.push(brand);
      score += kw.brands.priority.includes(brand) ? 5 : 3;
    }
  }
  if (brands.length) {
    categories.add('OEM_BRANDS');
    reasons.push(`brands: ${brands.join(', ')}`);
  }

  // ---- Competitor detection (guarded) ----
  const competitors: string[] = [];
  const hasNegativeContext = comp.negative_context_terms.some((t) => contains(hay, t));

  for (const c of comp.competitors) {
    const named = c.aliases.some((a) => contains(hay, a));
    if (!named) continue;

    if (c.ambiguous || comp.require_automotive_context) {
      if (!hasAutomotiveContext) {
        reasons.push(`competitor "${c.name}" ignored: no automotive context`);
        continue;
      }
      if (hasNegativeContext) {
        reasons.push(`competitor "${c.name}" ignored: disqualifying context`);
        continue;
      }
    }
    competitors.push(c.name);
    score += 12;
    categories.add('COMPETITOR');
    reasons.push(`competitor: ${c.name}`);
  }

  // ---- Country relevance ----
  const targetCodes = new Set([
    countries.home.code,
    ...countries.oem_markets.map((m) => m.code),
  ]);
  const targetNames = [
    countries.home.name_en,
    countries.home.name_th,
    ...countries.oem_markets.flatMap((m) => [m.name_en, m.name_th]),
  ];
  if (targetNames.some((n) => contains(hay, n))) {
    score += 4;
    categories.add('INTERNATIONAL');
    reasons.push('target country mentioned');
  }
  if (source && targetCodes.has(source.sourceCountry) && source.sourceCountry !== 'TH') {
    score += 3;
    categories.add('INTERNATIONAL');
  }

  // ---- Source tier weighting ----
  if (source) {
    if (source.sourceTier === 1) score += 4;
    else if (source.sourceTier === 3) score -= 3; // social needs stronger keyword evidence
  }

  // ---- No automotive context at all => almost certainly irrelevant ----
  if (!hasAutomotiveContext) {
    score = Math.floor(score * 0.35);
    reasons.push('penalty: no automotive context');
  }

  const isPressRelease = kw.press_release_markers.some((m) => contains(hay, m));
  const isSponsored = kw.sponsored_markers.some((m) => contains(hay, m));
  if (isSponsored) {
    score -= 4;
    reasons.push('penalty: sponsored content');
  }

  return {
    score: Math.max(0, score),
    categories: [...categories],
    competitors,
    brands,
    hasAutomotiveContext,
    isPressRelease,
    isSponsored,
    hardExcluded: false,
    reasons,
  };
}
