/* ============================================================
   Air4 — การรวมรายงานหลายวันเป็นช่วงวันที่ (date range)

   แยกไฟล์ออกมาเพราะเป็นตรรกะล้วน ๆ ไม่แตะ DOM จึงทดสอบได้ตรง ๆ
   (tests/aggregate.test.ts โหลดไฟล์นี้แล้วเรียกใช้จริง)

   หลักการ:
     - ข่าวชิ้นเดียวกันอาจปรากฏหลายวัน  → ต้องรวมเป็นชิ้นเดียว
     - KPI ต้องคำนวณใหม่จากข่าวที่รวมแล้ว ไม่ใช่บวก KPI รายวันตรง ๆ
     - Executive Summary และแผนงาน (actions) ใช้ของ "วันล่าสุด" เท่านั้น
       เพราะบทวิเคราะห์รายวันไม่ได้เขียนขึ้นสำหรับทั้งช่วง
   ============================================================ */
(function (root) {
  'use strict';

  /** วันที่ทั้งหมดในช่วง (รวมปลายทั้งสองข้าง) เรียงใหม่→เก่า */
  function datesInRange(days, from, to) {
    return days
      .filter((d) => d.date >= from && d.date <= to)
      .map((d) => d.date)
      .sort()
      .reverse();
  }

  /**
   * รวมข่าวจากหลายวัน ตัดข่าวซ้ำข้ามวัน
   * เกณฑ์ซ้ำ: contentHash เหมือนกัน หรือ canonicalUrl เหมือนกัน
   * เมื่อซ้ำ เลือกชิ้นที่ "น่าเชื่อถือกว่า" (tier ต่ำกว่า) แล้วจึงเลือกวันที่เผยแพร่เร็วกว่า
   */
  function mergeItems(reports) {
    const byKey = new Map();
    const order = [];

    for (const report of reports) {
      for (const item of report.items || []) {
        const keys = [];
        if (item.contentHash) keys.push('h:' + item.contentHash);
        if (item.canonicalUrl) keys.push('u:' + item.canonicalUrl);
        if (!keys.length) keys.push('i:' + item.id);

        const existingKey = keys.find((k) => byKey.has(k));
        if (existingKey) {
          const prev = byKey.get(existingKey);
          const better = pickBetter(prev.item, item);
          const merged = {
            ...better,
            reportDates: dedupe(prev.item.reportDates.concat([report.date])),
          };
          prev.item = merged;
          for (const k of keys) byKey.set(k, prev);
        } else {
          const holder = { item: { ...item, reportDates: [report.date] } };
          for (const k of keys) byKey.set(k, holder);
          order.push(holder);
        }
      }
    }

    return order.map((h) => h.item);
  }

  function dedupe(arr) {
    return Array.from(new Set(arr)).sort().reverse();
  }

  /** เลือกชิ้นที่ควรเก็บไว้เมื่อพบข่าวซ้ำ */
  function pickBetter(a, b) {
    const tierA = a.sourceTier || 9;
    const tierB = b.sourceTier || 9;
    if (tierA !== tierB) return tierA < tierB ? a : b;
    // คะแนนผลกระทบเด่นกว่า = มีข้อมูลวิเคราะห์ครบกว่า
    if (Math.abs(b.impactScore || 0) > Math.abs(a.impactScore || 0)) return b;
    return a;
  }

  /** คำนวณ KPI ใหม่จากข่าวที่รวมแล้ว */
  function computeKpi(items, reports) {
    const has = (i, c) => (i.affectedChannels || []).includes(c);
    const count = (fn) => items.filter(fn).length;
    const sum = (key) => reports.reduce((s, r) => s + ((r.kpi && r.kpi[key]) || 0), 0);

    return {
      // ตัวเลขต้นทางบวกสะสมได้ เพราะเป็นปริมาณงานที่ระบบทำจริงในแต่ละวัน
      totalCollected: sum('totalCollected'),
      afterDedup: sum('afterDedup'),
      afterPrefilter: sum('afterPrefilter'),
      // ส่วนที่เหลือคำนวณใหม่จากข่าวที่ตัดซ้ำข้ามวันแล้ว
      published: items.length,
      positive: count((i) => i.classification === 'positive'),
      neutral: count((i) => i.classification === 'neutral'),
      negative: count((i) => i.classification === 'negative'),
      highImpact: count((i) => Math.abs(i.impactScore || 0) >= 3),
      competitorAlerts: count((i) => (i.affectedCompetitors || []).length > 0),
      evRelated: count((i) => i.newsCategory === 'EV'),
      international: count((i) => i.sourceCountry !== 'TH'),
      oemOpportunities: count((i) => has(i, 'OEM') && i.classification === 'positive'),
      b2bOpportunities: count((i) => has(i, 'B2B') && i.classification === 'positive'),
      b2cOpportunities: count((i) => has(i, 'B2C') && i.classification === 'positive'),
      o1Supporting: count((i) => i.okrImpact && i.okrImpact.O1 === 'positive'),
      o2Supporting: count((i) => i.okrImpact && i.okrImpact.O2 === 'positive'),
      socialMentions: count((i) => i.itemKind === 'social'),
      demandSignals: count((i) => i.itemKind === 'signal'),
    };
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /**
   * รวมรายงานหลายวันเป็นรายงานเดียว
   * reports ต้องเรียงจากใหม่ → เก่า
   */
  function aggregate(reports) {
    if (!reports || !reports.length) return null;
    if (reports.length === 1) {
      return { ...reports[0], isRange: false, rangeDays: 1 };
    }

    const sorted = reports.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const latest = sorted[0];
    const oldest = sorted[sorted.length - 1];
    const items = mergeItems(sorted);

    // คะแนนผลกระทบสุทธิของช่วง = ค่าเฉลี่ยของข่าวที่รวมแล้ว
    const netImpactScore = items.length
      ? round2(items.reduce((s, i) => s + (i.impactScore || 0), 0) / items.length)
      : 0;

    const kpi = computeKpi(items, sorted);
    const sentiment =
      kpi.positive > kpi.negative ? 'positive' : kpi.negative > kpi.positive ? 'negative' : 'neutral';

    return {
      ...latest,
      isRange: true,
      rangeFrom: oldest.date,
      rangeTo: latest.date,
      rangeDays: sorted.length,
      // สถานะรวม: ถ้ามีวันไหน degraded ให้ทั้งช่วงเป็น degraded
      status: sorted.some((r) => r.status === 'failed')
        ? 'failed'
        : sorted.some((r) => r.status === 'degraded')
          ? 'degraded'
          : 'ok',
      kpi: kpi,
      items: items,
      /* บทวิเคราะห์รายวันเขียนขึ้นสำหรับ "วันเดียว" จึงคงของวันล่าสุดไว้
         ไม่นำมาเฉลี่ยหรือรวมกัน — ยกเว้นคะแนนสุทธิที่คำนวณใหม่ได้ */
      daily: {
        ...latest.daily,
        netImpactScore: netImpactScore,
        overallSentiment: sentiment,
      },
      /** ใช้บอกผู้ใช้ว่าส่วนไหนมาจากวันล่าสุดเท่านั้น */
      narrativeFromDate: latest.date,
      // รวมสถานะแหล่งข่าวของวันล่าสุด (สะท้อนสุขภาพระบบปัจจุบัน)
      sourceHealth: latest.sourceHealth,
      errors: sorted.flatMap((r) => r.errors || []),
    };
  }

  root.Air4Aggregate = {
    datesInRange: datesInRange,
    mergeItems: mergeItems,
    aggregate: aggregate,
    computeKpi: computeKpi,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
