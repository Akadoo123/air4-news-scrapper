import { XMLParser } from 'fast-xml-parser';
import { stripHtml, truncate, sanitizeUrl } from '../security/sanitize.js';
import { parseDate } from '../normalizers/date.js';

export interface ParsedEntry {
  title: string;
  link: string;
  snippet: string;
  publishedAt: string | null;
  /** Publisher name when the feed exposes it (Google News puts it in <source>). */
  publisherName?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
  // Keep <title> etc. as strings even when they contain only digits.
  isArray: (name) => ['item', 'entry'].includes(name),
});

const asText = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return asText(v[0]);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('#text' in o) return asText(o['#text']);
  }
  return '';
};

/** Atom <link> can be an array of typed links; prefer rel="alternate". */
function atomLink(entry: Record<string, unknown>): string {
  const raw = entry.link;
  const pick = (l: unknown): string => {
    if (typeof l === 'string') return l;
    if (l && typeof l === 'object') {
      const o = l as Record<string, unknown>;
      return asText(o['@_href'] ?? o['#text']);
    }
    return '';
  };
  if (Array.isArray(raw)) {
    const alt = raw.find(
      (l) => l && typeof l === 'object' && (l as Record<string, unknown>)['@_rel'] === 'alternate',
    );
    return pick(alt ?? raw[0]);
  }
  return pick(raw);
}

/**
 * Parse an RSS 2.0 / RDF / Atom document into normalized entries.
 * Malformed XML throws; missing optional fields degrade gracefully.
 */
export function parseFeed(xml: string, maxSnippetChars = 600): ParsedEntry[] {
  if (!xml || !xml.trim()) throw new Error('empty feed body');

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`malformed XML: ${err instanceof Error ? err.message : String(err)}`);
  }

  const rss = doc.rss as Record<string, unknown> | undefined;
  const rdf = (doc['rdf:RDF'] ?? doc.RDF) as Record<string, unknown> | undefined;
  const feed = doc.feed as Record<string, unknown> | undefined;

  let rawEntries: Record<string, unknown>[] = [];

  if (rss?.channel) {
    const channel = rss.channel as Record<string, unknown>;
    rawEntries = (channel.item as Record<string, unknown>[] | undefined) ?? [];
  } else if (rdf) {
    rawEntries = (rdf.item as Record<string, unknown>[] | undefined) ?? [];
  } else if (feed) {
    rawEntries = (feed.entry as Record<string, unknown>[] | undefined) ?? [];
  } else {
    throw new Error('unrecognised feed format (no rss/rdf/atom root)');
  }

  const out: ParsedEntry[] = [];
  for (const e of rawEntries) {
    const title = stripHtml(asText(e.title));
    const rawLink = e.link !== undefined ? atomLink(e) : asText(e.guid);
    const link = sanitizeUrl(rawLink);
    if (!title || !link) continue;

    const descRaw =
      asText(e.description) ||
      asText(e.summary) ||
      asText(e['content:encoded']) ||
      asText(e.content) ||
      asText((e['media:group'] as Record<string, unknown>)?.['media:description']);

    const dateRaw =
      asText(e.pubDate) ||
      asText(e.published) ||
      asText(e.updated) ||
      asText(e['dc:date']) ||
      asText(e['dcterms:date']);

    let publisherName: string | undefined;
    const src = e.source;
    if (src) {
      const name = stripHtml(asText(src));
      if (name) publisherName = name;
    }

    out.push({
      title: truncate(title, 300),
      link,
      snippet: truncate(stripHtml(descRaw), maxSnippetChars),
      publishedAt: parseDate(dateRaw),
      publisherName,
    });
  }
  return out;
}
