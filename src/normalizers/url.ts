import { createHash } from 'node:crypto';
import { sanitizeUrl } from '../security/sanitize.js';

/** Tracking parameters removed during canonicalization. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^dclid$/i,
  /^msclkid$/i,
  /^igshid$/i,
  /^mc_cid$/i,
  /^mc_eid$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^referrer$/i,
  /^source$/i,
  /^cmpid$/i,
  /^campaign_id$/i,
  /^spm$/i,
  /^_ga$/i,
  /^yclid$/i,
  /^oc$/i, // google news
];

const isTracking = (key: string): boolean => TRACKING_PARAMS.some((re) => re.test(key));

/**
 * Google News wraps publisher links. Where the real URL is recoverable
 * (?url=… on the older format) we unwrap it; the newer opaque
 * /rss/articles/<base64> form is left as-is and resolved at read time.
 */
export function unwrapAggregator(u: URL): URL {
  const host = u.hostname.toLowerCase();
  if (host.endsWith('news.google.com') || host.endsWith('news.url.google.com')) {
    const target = u.searchParams.get('url');
    if (target) {
      const clean = sanitizeUrl(target);
      if (clean) return new URL(clean);
    }
  }
  return u;
}

/**
 * Canonical form used for deduplication:
 * https + lowercase host + no www + no tracking params + sorted params + no hash + no trailing slash.
 * Returns null for unsafe or unparseable URLs.
 */
export function canonicalizeUrl(raw: string | null | undefined): string | null {
  const safe = sanitizeUrl(raw);
  if (!safe) return null;

  let u: URL;
  try {
    u = new URL(safe);
  } catch {
    return null;
  }

  u = unwrapAggregator(u);

  u.protocol = 'https:';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  u.hash = '';
  if ((u.port === '80' || u.port === '443')) u.port = '';

  const keep: Array<[string, string]> = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (!isTracking(k)) keep.push([k, v]);
  }
  keep.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const qs = new URLSearchParams();
  for (const [k, v] of keep) qs.append(k, v);
  u.search = qs.toString() ? `?${qs.toString()}` : '';

  let out = u.toString();
  // Drop a single trailing slash on the path (but keep bare-origin "https://host/").
  out = out.replace(/([^/])\/(\?|$)/, '$1$2');
  return out;
}

export function domainOf(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Stable short id derived from the canonical URL. */
export function idFromUrl(canonical: string): string {
  return sha256(canonical).slice(0, 16);
}

/**
 * Hash of the semantic content (title + snippet), used to catch the same story
 * republished under a different URL.
 */
export function contentHash(title: string, snippet: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return sha256(`${norm(title)}|${norm(snippet).slice(0, 300)}`).slice(0, 24);
}
