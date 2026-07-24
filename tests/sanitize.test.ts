import { describe, it, expect } from 'vitest';
import {
  stripHtml, sanitizeUrl, escapeHtml, truncate, decodeEntities,
  removeControlChars, hasControlOrSpace, escapeJsonForScript,
} from '../src/security/sanitize.js';

describe('stripHtml', () => {
  it('removes tags and keeps readable text', () => {
    expect(stripHtml('<p>สวัสดี <b>ครับ</b></p>')).toBe('สวัสดี ครับ');
  });

  it('removes the entire script body, not just the tags', () => {
    const out = stripHtml('ก่อน<script>alert("xss")</script>หลัง');
    expect(out).not.toContain('alert');
    expect(out).toContain('ก่อน');
    expect(out).toContain('หลัง');
  });

  it('removes style and iframe bodies', () => {
    expect(stripHtml('<style>body{color:red}</style>ข้อความ')).toBe('ข้อความ');
    expect(stripHtml('<iframe src="evil"></iframe>ok')).toBe('ok');
  });

  it('handles an unclosed script tag', () => {
    expect(stripHtml('ok<script>alert(1)')).not.toContain('alert');
  });

  it('decodes entities', () => {
    expect(stripHtml('a &amp; b &lt;c&gt; &quot;d&quot;')).toBe('a & b <c> "d"');
    expect(decodeEntities('&#x0e01;')).toBe('ก');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  a \n\n  b  ')).toBe('a b');
  });

  it('returns empty string for nullish input', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});

describe('sanitizeUrl', () => {
  it('accepts http and https', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects script-bearing protocols', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('JavaScript:alert(1)')).toBeNull();
    expect(sanitizeUrl('data:text/html,<script>')).toBeNull();
    expect(sanitizeUrl('vbscript:msgbox')).toBeNull();
  });

  it('rejects urls containing whitespace or control characters', () => {
    expect(sanitizeUrl('java\nscript:alert(1)')).toBeNull();
    expect(sanitizeUrl('https://exa mple.com')).toBeNull();
  });
});

describe('escapeHtml / escapeJsonForScript', () => {
  it('escapes every html-significant character', () => {
    expect(escapeHtml('<a href="x">&\'</a>'))
      .toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  it('neutralises a closing script tag inside json', () => {
    expect(escapeJsonForScript('{"a":"</script>"}')).not.toContain('</script>');
  });
});

describe('control characters', () => {
  it('replaces control characters with spaces', () => {
    expect(removeControlChars(`a${String.fromCharCode(0)}b`)).toBe('a b');
    expect(removeControlChars(`a${String.fromCharCode(31)}b`)).toBe('a b');
  });

  it('leaves ordinary text alone', () => {
    expect(removeControlChars('ปกติ ok')).toBe('ปกติ ok');
  });

  it('detects control characters and spaces', () => {
    expect(hasControlOrSpace('a b')).toBe(true);
    expect(hasControlOrSpace(`a${String.fromCharCode(9)}b`)).toBe(true);
    expect(hasControlOrSpace('https://ok.com/a')).toBe(false);
  });
});

describe('truncate', () => {
  it('leaves short strings untouched', () => {
    expect(truncate('สั้น', 100)).toBe('สั้น');
  });

  it('adds an ellipsis when cutting', () => {
    const out = truncate('abcdefghij', 5);
    expect(out).toHaveLength(5);
    expect(out.endsWith('…')).toBe(true);
  });
});
