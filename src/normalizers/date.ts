/**
 * Date parsing/normalization.
 * ต้องใช้ "วันที่เผยแพร่จริง" ไม่ใช่วันที่ค้นพบ — ถ้าแปลงไม่ได้ ให้คืน null
 * แล้วให้ชั้นบนตัดสินใจ (ข่าวไม่มีวันที่จะถูกทำเครื่องหมายและลดคะแนนความเชื่อมั่น)
 */

const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 1, มกราคม: 1,
  'ก.พ.': 2, กุมภาพันธ์: 2,
  'มี.ค.': 3, มีนาคม: 3,
  'เม.ย.': 4, เมษายน: 4,
  'พ.ค.': 5, พฤษภาคม: 5,
  'มิ.ย.': 6, มิถุนายน: 6,
  'ก.ค.': 7, กรกฎาคม: 7,
  'ส.ค.': 8, สิงหาคม: 8,
  'ก.ย.': 9, กันยายน: 9,
  'ต.ค.': 10, ตุลาคม: 10,
  'พ.ย.': 11, พฤศจิกายน: 11,
  'ธ.ค.': 12, ธันวาคม: 12,
};

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
function thaiDigitsToArabic(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
}

/**
 * Parse a date from RSS/Atom/HTML into an ISO-8601 UTC string.
 * Supports RFC-822, ISO-8601 and Thai formats ("15 ม.ค. 2568", Buddhist era).
 */
export function parseDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // 1) Native parse handles RFC-822 and ISO-8601.
  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) return clampToIso(native);

  // 2) Thai textual date, e.g. "15 มกราคม 2568 10:30" (Buddhist era).
  const t = thaiDigitsToArabic(raw);
  const thMatch = t.match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (thMatch) {
    const day = Number(thMatch[1]);
    const monthName = thMatch[2];
    let year = Number(thMatch[3]);
    const hour = thMatch[4] ? Number(thMatch[4]) : 0;
    const minute = thMatch[5] ? Number(thMatch[5]) : 0;
    const month = THAI_MONTHS[monthName];
    if (month) {
      if (year > 2400) year -= 543; // Buddhist Era -> CE
      // Interpret as Asia/Bangkok (UTC+7).
      const d = new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
      if (!Number.isNaN(d.getTime())) return clampToIso(d);
    }
  }

  // 3) Numeric dd/mm/yyyy (Thai convention: day first).
  const numMatch = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numMatch) {
    const day = Number(numMatch[1]);
    const month = Number(numMatch[2]);
    let year = Number(numMatch[3]);
    if (year > 2400) year -= 543;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day, -7, 0));
      if (!Number.isNaN(d.getTime())) return clampToIso(d);
    }
  }

  return null;
}

/** Reject absurd dates (before 2000 or more than 2 days in the future). */
function clampToIso(d: Date): string | null {
  const ms = d.getTime();
  const min = Date.UTC(2000, 0, 1);
  const max = Date.now() + 2 * 24 * 3600 * 1000;
  if (ms < min || ms > max) return null;
  return new Date(ms).toISOString();
}

export function isWithinLookback(iso: string | null, lookbackHours: number, now = Date.now()): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return now - t <= lookbackHours * 3600 * 1000 && t <= now + 6 * 3600 * 1000;
}

/** Report date key (YYYY-MM-DD) in the given IANA timezone. */
export function dateKey(date: Date = new Date(), timeZone = 'Asia/Bangkok'): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

export function formatBangkok(iso: string, timeZone = 'Asia/Bangkok'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}
