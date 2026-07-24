import type { AnalyzedItem, Kpi } from '../types.js';

export interface PipelineCounts {
  totalCollected: number;
  afterDedup: number;
  afterPrefilter: number;
}

export function computeKpi(items: AnalyzedItem[], counts: PipelineCounts): Kpi {
  const has = (i: AnalyzedItem, c: 'OEM' | 'B2B' | 'B2C') => i.affectedChannels.includes(c);

  return {
    totalCollected: counts.totalCollected,
    afterDedup: counts.afterDedup,
    afterPrefilter: counts.afterPrefilter,
    published: items.length,
    positive: items.filter((i) => i.classification === 'positive').length,
    neutral: items.filter((i) => i.classification === 'neutral').length,
    negative: items.filter((i) => i.classification === 'negative').length,
    highImpact: items.filter((i) => Math.abs(i.impactScore) >= 3).length,
    competitorAlerts: items.filter((i) => i.affectedCompetitors.length > 0).length,
    evRelated: items.filter((i) => i.newsCategory === 'EV').length,
    international: items.filter(
      (i) => !i.affectedCountries.includes('Thailand') && i.sourceCountry !== 'TH',
    ).length,
    oemOpportunities: items.filter((i) => has(i, 'OEM') && i.classification === 'positive').length,
    b2bOpportunities: items.filter((i) => has(i, 'B2B') && i.classification === 'positive').length,
    b2cOpportunities: items.filter((i) => has(i, 'B2C') && i.classification === 'positive').length,
    o1Supporting: items.filter((i) => i.okrImpact.O1 === 'positive').length,
    o2Supporting: items.filter((i) => i.okrImpact.O2 === 'positive').length,
    socialMentions: items.filter((i) => i.itemKind === 'social').length,
    demandSignals: items.filter((i) => i.itemKind === 'signal').length,
  };
}
