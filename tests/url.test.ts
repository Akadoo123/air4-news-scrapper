import { describe, it, expect } from 'vitest';
import { canonicalizeUrl, contentHash, domainOf, idFromUrl } from '../src/normalizers/url.js';

describe('canonicalizeUrl', () => {
  it('forces https and lowercases the host', () => {
    expect(canonicalizeUrl('HTTP://Example.COM/News')).toBe('https://example.com/News');
  });

  it('strips the www prefix', () => {
    expect(canonicalizeUrl('https://www.example.com/a')).toBe('https://example.com/a');
  });

  it('removes tracking parameters but keeps meaningful ones', () => {
    expect(canonicalizeUrl('https://example.com/a?utm_source=rss&id=7&fbclid=x'))
      .toBe('https://example.com/a?id=7');
  });

  it('sorts query parameters so order does not create duplicates', () => {
    const a = canonicalizeUrl('https://example.com/a?b=2&a=1');
    const b = canonicalizeUrl('https://example.com/a?a=1&b=2');
    expect(a).toBe(b);
  });

  it('drops the fragment', () => {
    expect(canonicalizeUrl('https://example.com/a#section')).toBe('https://example.com/a');
  });

  it('drops a single trailing slash', () => {
    expect(canonicalizeUrl('https://example.com/news/')).toBe('https://example.com/news');
  });

  it('unwraps the legacy Google News url parameter', () => {
    expect(canonicalizeUrl('https://news.google.com/articles/x?url=https://real.co.th/story'))
      .toBe('https://real.co.th/story');
  });

  it('rejects dangerous protocols', () => {
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalizeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(canonicalizeUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(canonicalizeUrl('')).toBeNull();
    expect(canonicalizeUrl(null)).toBeNull();
    expect(canonicalizeUrl('not a url')).toBeNull();
  });

  it('treats two tracking-only variants as the same canonical URL', () => {
    const a = canonicalizeUrl('https://example.co.th/toyota?utm_source=rss');
    const b = canonicalizeUrl('https://www.example.co.th/toyota?fbclid=abc123');
    expect(a).toBe(b);
  });
});

describe('domainOf / idFromUrl / contentHash', () => {
  it('extracts the bare domain', () => {
    expect(domainOf('https://www.prachachat.net/motoring/news-1')).toBe('prachachat.net');
    expect(domainOf('garbage')).toBe('');
  });

  it('produces a stable id for the same URL', () => {
    const u = 'https://example.com/a';
    expect(idFromUrl(u)).toBe(idFromUrl(u));
    expect(idFromUrl(u)).toHaveLength(16);
  });

  it('ignores punctuation and case when hashing content', () => {
    expect(contentHash('ยอดขายรถยนต์ เพิ่มขึ้น!', 'abc'))
      .toBe(contentHash('ยอดขายรถยนต์เพิ่มขึ้น', 'abc'));
  });

  it('differs for genuinely different content', () => {
    expect(contentHash('ข่าว ก', 'x')).not.toBe(contentHash('ข่าว ข', 'y'));
  });
});
