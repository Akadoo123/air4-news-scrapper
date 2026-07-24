import { loadKeywords, loadCompetitors, type KeywordsConfig, type CompetitorsConfig } from '../config.js';

export interface SearchQuery {
  q: string;
  categoryId: string;
  language: 'th' | 'en';
}

/**
 * Build the Google News search queries from keywords.yaml.
 * Only terms flagged `query: true` become queries — the rest are scoring signals only.
 */
export function buildKeywordQueries(kw: KeywordsConfig = loadKeywords()): SearchQuery[] {
  const out: SearchQuery[] = [];
  for (const cat of kw.categories) {
    for (const lang of ['th', 'en'] as const) {
      for (const term of cat.terms[lang] ?? []) {
        if (term.query) out.push({ q: term.t, categoryId: cat.id, language: lang });
      }
    }
  }
  return out;
}

/**
 * Competitor queries always carry an automotive qualifier so that
 * "Wizard", "Wise" and "Fresh Air" cannot match unrelated stories.
 */
export function buildCompetitorQueries(
  comp: CompetitorsConfig = loadCompetitors(),
): SearchQuery[] {
  const qualifiers: Record<'th' | 'en', string[]> = {
    th: ['ล้างแอร์รถยนต์', 'คาร์แคร์', 'ศูนย์บริการรถยนต์'],
    en: ['car air cleaning', 'automotive air cleaning', 'car care'],
  };

  const out: SearchQuery[] = [];
  for (const c of comp.competitors) {
    for (const lang of ['th', 'en'] as const) {
      for (const qual of qualifiers[lang]) {
        out.push({
          q: `"${c.name}" ${qual}`,
          categoryId: 'COMPETITOR',
          language: lang,
        });
      }
    }
  }
  return out;
}

/** Brand + service-network queries for the OEM/dealer watch list. */
export function buildBrandQueries(kw: KeywordsConfig = loadKeywords()): SearchQuery[] {
  const out: SearchQuery[] = [];
  for (const brand of kw.brands.priority) {
    out.push({ q: `${brand} ศูนย์บริการ`, categoryId: 'OEM_BRANDS', language: 'th' });
    out.push({ q: `${brand} service network`, categoryId: 'OEM_BRANDS', language: 'en' });
  }
  return out;
}

export function buildAllQueries(): SearchQuery[] {
  const seen = new Set<string>();
  const all = [...buildKeywordQueries(), ...buildCompetitorQueries(), ...buildBrandQueries()];
  return all.filter((q) => {
    const key = `${q.language}:${q.q.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Google News RSS search endpoint for one query in one locale. */
export function googleNewsUrl(
  endpoint: string,
  q: string,
  locale: { hl: string; gl: string; ceid: string },
  lookbackHours: number,
): string {
  const days = Math.max(1, Math.ceil(lookbackHours / 24));
  const u = new URL(endpoint);
  u.searchParams.set('q', `${q} when:${days}d`);
  u.searchParams.set('hl', locale.hl);
  u.searchParams.set('gl', locale.gl);
  u.searchParams.set('ceid', locale.ceid);
  return u.toString();
}
