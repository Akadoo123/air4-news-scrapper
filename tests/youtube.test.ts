import { describe, it, expect } from 'vitest';
import { buildVideoSnippet, apiErrorReason, collectYouTube } from '../src/collectors/youtube.js';
import { RunErrors } from '../src/logger.js';
import { normalizeItems } from '../src/normalizers/item.js';
import { prefilter } from '../src/analysis/prefilter.js';
import type { RawItem } from '../src/types.js';

describe('YouTube — snippet', () => {
  it('รวมคำบรรยาย ช่อง และยอดวิว', () => {
    const s = buildVideoSnippet('รีวิวการล้างแอร์รถยนต์แบบไม่ถอดตู้', 'ช่างโอ๋', 12000);
    expect(s).toContain('รีวิวการล้างแอร์รถยนต์');
    expect(s).toContain('ช่อง: ช่างโอ๋');
    expect(s).toContain('ยอดวิว 12,000 ครั้ง');
  });

  it('ไม่ใส่ยอดวิวเมื่อไม่มีข้อมูล', () => {
    expect(buildVideoSnippet('เนื้อหา', 'ช่อง')).not.toContain('ยอดวิว');
  });

  /**
   * บทเรียนจาก Pantip: snippet ต้องไม่มีคำค้นของเราเอง
   * มิฉะนั้น prefilter จะให้คะแนนเต็มทุกคลิป แม้ไม่เกี่ยวกับรถยนต์
   */
  it('คลิปที่ไม่เกี่ยวกับรถยนต์ต้องไม่ผ่าน prefilter แม้มาจากคำค้นเรื่องรถ', () => {
    const item: RawItem = {
      title: 'รีวิวเครื่องฟอกอากาศในบ้าน Xiaomi',
      link: 'https://www.youtube.com/watch?v=abc123',
      snippet: buildVideoSnippet('แกะกล่องเครื่องฟอกอากาศในห้องนอน', 'ช่องรีวิวของใช้'),
      publishedAt: '2026-07-25T00:00:00Z',
      sourceId: 'youtube',
      sourceName: 'YouTube · ช่องรีวิวของใช้',
      sourceTier: 3,
      sourceCountry: 'TH',
      language: 'th',
      unverified: true,
      itemKind: 'social',
    };
    const pf = prefilter(item.title, item.snippet ?? '', item);
    expect(pf.score).toBeLessThan(8);
  });

  it('คลิปล้างแอร์รถยนต์จริงต้องผ่าน prefilter', () => {
    const item: RawItem = {
      title: 'ล้างแอร์รถยนต์แบบไม่ถอดตู้ ทำเองได้ที่บ้าน',
      link: 'https://www.youtube.com/watch?v=xyz789',
      snippet: buildVideoSnippet('สอนล้างคอยล์เย็นรถยนต์ กำจัดกลิ่นอับ', 'ช่างรถ'),
      publishedAt: '2026-07-25T00:00:00Z',
      sourceId: 'youtube',
      sourceName: 'YouTube · ช่างรถ',
      sourceTier: 3,
      sourceCountry: 'TH',
      language: 'th',
      unverified: true,
      itemKind: 'social',
    };
    const [n] = normalizeItems([item]);
    expect(n.prefilterScore).toBeGreaterThanOrEqual(8);
    expect(n.matchedCategories).toContain('AC_CLEANING');
    expect(n.itemKind).toBe('social');
    expect(n.sourceTier).toBe(3);
  });
});

describe('YouTube — error parsing', () => {
  it('อ่านเหตุผล error จาก response ของ Google', () => {
    const body = JSON.stringify({
      error: { message: 'quota exceeded', errors: [{ reason: 'quotaExceeded' }] },
    });
    expect(apiErrorReason(body)).toContain('quotaExceeded');
  });

  it('คืน null เมื่อ response ปกติ (ไม่มี error)', () => {
    expect(apiErrorReason(JSON.stringify({ items: [] }))).toBeNull();
  });

  it('คืน null เมื่อไม่ใช่ JSON', () => {
    expect(apiErrorReason('<html>error</html>')).toBeNull();
  });
});

describe('YouTube — ยังไม่ตั้งค่า key', () => {
  it('ข้ามและขึ้นสถานะ configured:false (ไม่ทำให้ระบบล้ม)', async () => {
    // ไม่มี YOUTUBE_API_KEY ใน env ระหว่างเทสต์
    const errors = new RunErrors();
    const res = await collectYouTube(errors);
    expect(res.items).toEqual([]);
    expect(res.health).toHaveLength(1);
    expect(res.health[0].ok).toBe(false);
    expect(res.health[0].configured).toBe(false);
    expect(res.health[0].error).toContain('YOUTUBE_API_KEY');
  });
});
