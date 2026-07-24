import { describe, it, expect } from 'vitest';
import { parseFeed } from '../src/parsers/feed.js';
import { parseDate, isWithinLookback, dateKey } from '../src/normalizers/date.js';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Test Feed</title>
  <item>
    <title>ยอดขายรถยนต์เพิ่มขึ้น 12%</title>
    <link>https://example.com/a</link>
    <description><![CDATA[<p>เนื้อหา <b>ข่าว</b></p>]]></description>
    <pubDate>Tue, 15 Jul 2025 09:30:00 +0700</pubDate>
  </item>
  <item>
    <title>Second story</title>
    <link>https://example.com/b</link>
    <description>Plain text</description>
    <pubDate>Tue, 15 Jul 2025 08:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom entry title</title>
    <link rel="alternate" href="https://example.com/atom-1"/>
    <summary>Atom summary text</summary>
    <published>2025-07-15T09:30:00Z</published>
  </entry>
</feed>`;

const GOOGLE_NEWS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Toyota expands service network</title>
    <link>https://news.google.com/rss/articles/abc123</link>
    <description>&lt;a href="https://real.co.th/x"&gt;Toyota expands&lt;/a&gt;</description>
    <pubDate>Tue, 15 Jul 2025 09:30:00 GMT</pubDate>
    <source url="https://prachachat.net">ประชาชาติธุรกิจ</source>
  </item>
</channel></rss>`;

describe('parseFeed', () => {
  it('parses RSS 2.0 items', () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('ยอดขายรถยนต์เพิ่มขึ้น 12%');
    expect(items[0].link).toBe('https://example.com/a');
    expect(items[0].publishedAt).not.toBeNull();
  });

  it('strips HTML out of descriptions', () => {
    expect(parseFeed(RSS)[0].snippet).toBe('เนื้อหา ข่าว');
  });

  it('parses Atom entries and picks the alternate link', () => {
    const items = parseFeed(ATOM);
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe('https://example.com/atom-1');
    expect(items[0].snippet).toBe('Atom summary text');
  });

  it('extracts the publisher name from a Google News <source>', () => {
    expect(parseFeed(GOOGLE_NEWS)[0].publisherName).toBe('ประชาชาติธุรกิจ');
  });

  it('throws a clear error on an empty body', () => {
    expect(() => parseFeed('')).toThrow(/empty feed/);
  });

  it('throws on a document that is not a feed', () => {
    expect(() => parseFeed('<html><body>Not a feed</body></html>')).toThrow(/unrecognised feed/);
  });

  it('returns an empty array for a feed with no items', () => {
    expect(parseFeed('<rss version="2.0"><channel><title>x</title></channel></rss>')).toEqual([]);
  });

  it('skips items missing a title or a usable link', () => {
    const feed = `<rss version="2.0"><channel>
      <item><title>No link here</title></item>
      <item><link>https://example.com/ok</link></item>
      <item><title>Bad protocol</title><link>javascript:alert(1)</link></item>
      <item><title>Good</title><link>https://example.com/good</link></item>
    </channel></rss>`;
    const items = parseFeed(feed);
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe('https://example.com/good');
  });
});

describe('parseDate', () => {
  it('parses RFC-822', () => {
    expect(parseDate('Tue, 15 Jul 2025 09:30:00 +0700')).toBe('2025-07-15T02:30:00.000Z');
  });

  it('parses ISO-8601', () => {
    expect(parseDate('2025-07-15T09:30:00Z')).toBe('2025-07-15T09:30:00.000Z');
  });

  it('parses Thai dates in the Buddhist era', () => {
    const iso = parseDate('15 กรกฎาคม 2568');
    expect(iso).not.toBeNull();
    expect(iso!.startsWith('2025-07-1')).toBe(true);
  });

  it('parses abbreviated Thai months', () => {
    const iso = parseDate('15 ก.ค. 2568');
    expect(iso).not.toBeNull();
    expect(iso!.startsWith('2025-07-1')).toBe(true);
  });

  it('parses Thai numerals', () => {
    expect(parseDate('๑๕ ก.ค. ๒๕๖๘')).not.toBeNull();
  });

  it('parses day-first numeric dates', () => {
    const iso = parseDate('15/07/2025');
    expect(iso).not.toBeNull();
    expect(iso!.startsWith('2025-07-1')).toBe(true);
  });

  it('returns null rather than guessing', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('ไม่ทราบวันที่')).toBeNull();
  });

  it('rejects absurd dates', () => {
    expect(parseDate('1899-01-01T00:00:00Z')).toBeNull();
    expect(parseDate('2999-01-01T00:00:00Z')).toBeNull();
  });
});

describe('isWithinLookback / dateKey', () => {
  const now = Date.parse('2025-07-15T12:00:00Z');

  it('accepts a recent article', () => {
    expect(isWithinLookback('2025-07-14T12:00:00Z', 48, now)).toBe(true);
  });

  it('rejects an article older than the window', () => {
    expect(isWithinLookback('2025-07-01T12:00:00Z', 48, now)).toBe(false);
  });

  it('rejects a null date', () => {
    expect(isWithinLookback(null, 48, now)).toBe(false);
  });

  it('formats the report date key in Bangkok time', () => {
    // 23:30 UTC is already the next day in Bangkok (UTC+7)
    expect(dateKey(new Date('2025-07-15T23:30:00Z'), 'Asia/Bangkok')).toBe('2025-07-16');
  });
});
