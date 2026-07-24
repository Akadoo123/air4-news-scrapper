/**
 * HTML / URL sanitization.
 * ทุกข้อความที่มาจากภายนอกต้องผ่านที่นี่ก่อนเก็บลง JSON และก่อนแสดงบน Dashboard
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
  // Strip control characters that could break JSON consumers / terminals.
  if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a) return '';
  try {
    return String.fromCodePoint(cp);
  } catch {
    return '';
  }
}

/**
 * Strip all markup and return plain text.
 * Script/style bodies are removed entirely (not just their tags).
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return '';
  let out = String(input);
  out = out.replace(/<!--[\s\S]*?-->/g, ' ');
  out = out.replace(/<(script|style|iframe|object|embed|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  // Unclosed dangerous tags: drop the opening tag and any trailing body.
  out = out.replace(/<(script|style|iframe|object|embed|svg)\b[\s\S]*$/gi, ' ');
  out = out.replace(/<br\s*\/?>/gi, ' ');
  out = out.replace(/<\/p>/gi, ' ');
  out = out.replace(/<[^>]*>/g, ' ');
  out = decodeEntities(out);
  out = removeControlChars(out);
  return collapseWhitespace(out);
}

export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Returns the URL only when it is a plain http(s) link.
 * Blocks javascript:, data:, vbscript:, file:, etc.
 */
export function sanitizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (hasControlOrSpace(trimmed)) return null;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  if (!SAFE_PROTOCOLS.has(u.protocol)) return null;
  if (!u.hostname) return null;
  return u.toString();
}

/** Escape for safe interpolation into an HTML document (used by the builder). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape a JSON string for safe embedding inside a <script> block. */
export function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(LINE_SEP)
    .join('\\u2028')
    .split(PARA_SEP)
    .join('\\u2029');
}

const SPACE = ' ';
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

/** Replace every C0/C1/DEL control character with a space. */
export function removeControlChars(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const isC0 = cp < 0x20;
    const isDel = cp === 0x7f;
    const isC1 = cp >= 0x80 && cp <= 0x9f;
    out += isC0 || isDel || isC1 ? SPACE : ch;
  }
  return out;
}

/** True when the string contains any control character or whitespace. */
export function hasControlOrSpace(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x20 || cp === 0x7f) return true;
  }
  return false;
}
