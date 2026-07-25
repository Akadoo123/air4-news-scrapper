/* ============================================================
   Air4 — ระบบสองภาษา (ไทย / อังกฤษ)

   ครอบคลุมเฉพาะ "ส่วนติดต่อผู้ใช้" เท่านั้น
   เนื้อหาบทวิเคราะห์ (สรุปข่าว/เหตุผล/ข้อเสนอแนะ) ถูกสร้างเป็นภาษาไทยโดย AI
   จึงยังคงเป็นภาษาไทยแม้สลับเป็น EN — มีป้ายบอกผู้ใช้ไว้ชัดเจน
   ส่วนหัวข้อข่าวจะสลับไปใช้ "หัวข้อต้นฉบับ" เมื่ออยู่ในโหมด EN
   ============================================================ */
(function (root) {
  'use strict';

  var DICT = {
    th: {
      'brand.sub': 'ข่าวกรองธุรกิจยานยนต์ประจำวัน · แอร์โฟร์อินเตอร์เนชั่นแนล',
      'doc.title': 'Air4 ข่าวกรองธุรกิจยานยนต์ประจำวัน',

      'range.k': 'ช่วงวันที่',
      'range.aria': 'เลือกช่วงวันที่ของรายงาน',
      'range.latest': 'วันล่าสุด',
      'range.7': '7 วันล่าสุด',
      'range.14': '14 วันล่าสุด',
      'range.30': '30 วันล่าสุด',
      'range.custom': 'กำหนดเอง…',
      'range.from': 'ตั้งแต่',
      'range.to': 'ถึง',
      'range.fromAria': 'วันที่เริ่มต้น',
      'range.toAria': 'วันที่สิ้นสุด',
      'range.days': '{n} วัน',

      'meta.showing': 'กำลังแสดง',
      'meta.updated': 'อัปเดตล่าสุด',
      'meta.funnel': 'ตรวจสอบ / ผ่านคัดกรอง',
      'btn.refresh': 'โหลดข้อมูลใหม่',

      'theme.aria': 'สลับธีมสว่าง/มืด',
      'theme.auto': 'ตามระบบ',
      'theme.light': 'สว่าง',
      'theme.dark': 'มืด',
      'lang.aria': 'เปลี่ยนภาษา',
      'lang.note': 'บทวิเคราะห์สร้างเป็นภาษาไทย',

      'status.ok': 'ระบบทำงานปกติ',
      'status.degraded': 'ทำงานได้บางส่วน',
      'status.failed': 'ระบบล้มเหลว',
      'state.loading': 'กำลังโหลดรายงาน…',
      'state.merging': 'กำลังรวมรายงาน {n} วัน…',
      'state.noData': 'ยังไม่มีข้อมูลรายงาน',
      'state.needServer':
        'หน้านี้ต้องเปิดผ่านเว็บเซิร์ฟเวอร์ ไม่ใช่เปิดไฟล์โดยตรง — รันคำสั่ง npm run serve แล้วเปิด http://localhost:4173',
      'state.runDaily': 'รันคำสั่ง npm run daily เพื่อสร้างรายงาน แล้วโหลดหน้านี้ใหม่ ({err})',

      'sec.kpi': 'ตัวชี้วัดสำคัญ',
      'sec.brief': 'บทสรุปสำหรับผู้บริหาร',
      'sec.okr': 'ผลกระทบต่อเป้าหมายองค์กร (OKRs)',
      'sec.actions': 'สิ่งที่ควรลงมือทำ',
      'sec.charts': 'ภาพรวมเชิงตัวเลข',
      'sec.news': 'ข่าวที่ผ่านการคัดกรอง',
      'sec.newsNote': 'เรียงตามระดับผลกระทบต่อธุรกิจ',
      'sec.system': 'สถานะระบบและแหล่งข่าว',

      'brief.today': 'สถานการณ์วันนี้',
      'brief.ruler': 'คะแนนผลกระทบสุทธิต่อธุรกิจ',
      'brief.scaleNeg': '−5 เชิงลบ',
      'brief.scalePos': '+5 เชิงบวก',
      'brief.opp': 'โอกาสสำคัญ',
      'brief.risk': 'ความเสี่ยงที่ต้องเฝ้าระวัง',
      'brief.oppEmpty': 'ยังไม่พบสัญญาณโอกาสที่ชัดเจนในวันนี้',
      'brief.riskEmpty': 'ยังไม่พบสัญญาณความเสี่ยงที่ชัดเจนในวันนี้',
      'brief.byAi': 'วิเคราะห์โดย AI ({model}) · {n} ข่าว',
      'brief.byRule': 'วิเคราะห์โดยระบบกฎอัตโนมัติ (ไม่ได้ใช้ AI)',
      'brief.scopeNote': 'เฉพาะรายงานวันที่ {date} — ไม่ได้รวมทั้งช่วง',
      'urgency.low': 'ระดับความเร่งด่วน: ต่ำ — ติดตามตามปกติ',
      'urgency.medium': 'ระดับความเร่งด่วน: ปานกลาง — ควรทบทวนภายในสัปดาห์นี้',
      'urgency.high': 'ระดับความเร่งด่วน: สูง — ควรพิจารณาวันนี้',

      'act.note': 'แบ่งตามกรอบเวลาและแผนกที่รับผิดชอบ',
      'act.today': 'ทำวันนี้',
      'act.7days': 'ภายใน 7 วัน',
      'act.monitor': 'ติดตามต่อ',
      'act.empty': 'ไม่มีรายการ',

      'kpi.total': 'ข่าวทั้งหมด',
      'kpi.totalToday': 'ข่าวทั้งหมดวันนี้',
      'kpi.totalFoot': 'จาก {n} รายการที่ตรวจสอบ',
      'kpi.rangeFoot': 'รวม {n} วัน (ตัดข่าวซ้ำข้ามวันแล้ว)',
      'kpi.positive': 'เชิงบวก',
      'kpi.positiveFoot': 'โอกาสทางธุรกิจ',
      'kpi.neutral': 'เป็นกลาง',
      'kpi.neutralFoot': 'ควรจับตา',
      'kpi.negative': 'เชิงลบ',
      'kpi.negativeFoot': 'ต้องเฝ้าระวัง',
      'kpi.highImpact': 'ผลกระทบสูง',
      'kpi.highImpactFoot': '|คะแนน| ≥ 3',
      'kpi.competitor': 'สัญญาณคู่แข่ง',
      'kpi.competitorFoot': 'ความเคลื่อนไหวที่ตรวจพบ',
      'kpi.ev': 'ข่าว EV',
      'kpi.evFoot': 'ผลกระทบสองทาง',
      'kpi.intl': 'ข่าวต่างประเทศ',
      'kpi.intlFoot': 'ตลาด OEM ต่างประเทศ',
      'kpi.b2b': 'โอกาส B2B',
      'kpi.b2bFoot': 'ศูนย์ / อู่ / คาร์แคร์',
      'kpi.o2': 'สัญญาณหนุน O2',
      'kpi.o2Foot': 'ลดการพึ่งพา Toyota OEM',
      'kpi.social': 'เสียงจากโซเชียล',
      'kpi.socialFoot': 'Pantip / โซเชียล — ยังไม่ยืนยัน',
      'kpi.signal': 'สัญญาณอุปสงค์',
      'kpi.signalFoot': 'อากาศร้อน / ฝุ่น PM2.5',

      'filter.aria': 'กรองตามประเภทผลกระทบ',
      'filter.all': 'ทั้งหมด',
      'filter.saved': 'ที่บันทึกไว้',
      'filter.search': 'ค้นหาชื่อข่าวหรือคำสำคัญ…',
      'filter.searchAria': 'ค้นหาข่าว',
      'filter.allCountries': 'ทุกประเทศ',
      'filter.allSources': 'ทุกแหล่งข่าว',
      'filter.allTiers': 'ทุกระดับแหล่งข่าว',
      'filter.tier1': 'Tier 1 — ทางการ',
      'filter.tier2': 'Tier 2 — สำนักข่าว',
      'filter.tier3': 'Tier 3 — ยังไม่ยืนยัน',
      'filter.allCategories': 'ทุกหมวดข่าว',
      'filter.allChannels': 'ทุกช่องทาง',
      'filter.allProducts': 'ทุกผลิตภัณฑ์',
      'filter.impactAll': 'ผลกระทบทุกระดับ',
      'filter.impact2': '|ผลกระทบ| ≥ 2',
      'filter.impact3': '|ผลกระทบ| ≥ 3 (สูง)',
      'filter.impact4': '|ผลกระทบ| ≥ 4 (สูงมาก)',
      'filter.competitorOnly': 'เฉพาะข่าวคู่แข่ง',
      'filter.reset': 'ล้างตัวกรอง',
      'filter.count': 'แสดง {shown} จาก {total} ข่าว',
      'filter.emptyTitle': 'ไม่พบข่าวที่ตรงกับตัวกรอง',
      'filter.emptyHint': 'ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา',
      'filter.savedEmptyTitle': 'ยังไม่มีข่าวที่บันทึกไว้',
      'filter.savedEmptyHint': 'กดไอคอนบุ๊กมาร์กบนการ์ดข่าวเพื่อเก็บไว้อ่านภายหลัง',

      'card.impact': 'ผลกระทบ',
      'card.impactTitle': 'คะแนนผลกระทบ (−5 ถึง +5)',
      'card.confidence': 'ความเชื่อมั่น',
      'card.why': 'ทำไมจึงเกี่ยวข้องกับ Air4',
      'card.details': 'ดูรายละเอียด',
      'card.openSource': 'เปิดข่าวต้นฉบับ',
      'card.save': 'บันทึกข่าวนี้',
      'card.unsave': 'เอาออกจากรายการที่บันทึก',
      'card.share': 'แชร์ลิงก์ข่าวต้นฉบับ',
      'card.shareCopied': 'คัดลอกลิงก์แล้ว',
      'card.shareFailed': 'คัดลอกลิงก์ไม่สำเร็จ',
      'card.competitorTag': 'คู่แข่ง: ',

      'flag.unverified': 'ยังไม่ยืนยัน',
      'flag.social': 'โซเชียล',
      'flag.signal': 'สัญญาณอุปสงค์',
      'flag.multiDay': 'พบ {n} วัน',
      'flag.pressRelease': 'ข่าวประชาสัมพันธ์',
      'flag.sponsored': 'เนื้อหาโฆษณา',
      'flag.ruleBased': 'วิเคราะห์ด้วยกฎ',

      'saved.title': 'ข่าวที่บันทึกไว้',
      'saved.count': 'บันทึกไว้ {n} ข่าว',
      'saved.export': 'ดาวน์โหลดเป็นไฟล์',
      'saved.copyLinks': 'คัดลอกลิงก์ทั้งหมด',
      'saved.clear': 'ล้างรายการที่บันทึก',
      'saved.clearConfirm': 'ลบข่าวที่บันทึกไว้ทั้งหมด?',
      'saved.copied': 'คัดลอก {n} ลิงก์แล้ว',
      'saved.exported': 'ดาวน์โหลดไฟล์แล้ว',

      'drawer.title': 'รายละเอียดข่าว',
      'drawer.close': 'ปิดรายละเอียด',
      'drawer.positives': 'ผลดีที่อาจเกิดขึ้น',
      'drawer.negatives': 'ผลเสียที่อาจเกิดขึ้น',
      'drawer.interpretation': 'การตีความเชิงธุรกิจ',
      'drawer.actions': 'สิ่งที่ควรทำ',
      'drawer.horizon': 'ระยะเวลาผลกระทบ',
      'drawer.credibility': 'ความน่าเชื่อถือของแหล่งข่าว',
      'drawer.related': 'แหล่งข่าวอื่นที่รายงานเรื่องเดียวกัน',

      'verdict.positive': 'เชิงบวก',
      'verdict.neutral': 'เป็นกลาง',
      'verdict.negative': 'เชิงลบ',
      'horizon.immediate': 'ทันที',
      'horizon.1-3 months': '1–3 เดือน',
      'horizon.3-12 months': '3–12 เดือน',
      'horizon.long-term': 'ระยะยาว',
      'cat.AUTO_MARKET': 'ตลาดรถยนต์',
      'cat.EV': 'รถยนต์ไฟฟ้า',
      'cat.AC_CLEANING': 'ล้างแอร์รถยนต์',
      'cat.INJECTOR': 'ล้างหัวฉีด',
      'cat.TRADING': 'สินค้า Trading',
      'cat.COMPETITOR': 'คู่แข่ง',
      'cat.OEM_BRANDS': 'แบรนด์รถ/ศูนย์บริการ',
      'cat.INTERNATIONAL': 'ต่างประเทศ',
      'cat.OTHER': 'อื่น ๆ',
      'prod.AC_CLEANING': 'ล้างแอร์รถยนต์',
      'prod.POWER_FLOW': 'Power Flow',
      'prod.TRADING': 'น้ำยา Trading',
      'prodFilter.AC_CLEANING': 'ล้างแอร์รถยนต์',
      'prodFilter.POWER_FLOW': 'Power Flow (ล้างหัวฉีด)',
      'prodFilter.TRADING': 'น้ำยา Trading',
      'okr.positive': 'สนับสนุน',
      'okr.neutral': 'เป็นกลาง',
      'okr.negative': 'ขัดขวาง',
      'deadline.today': 'วันนี้',
      'deadline.within_7_days': 'ภายใน 7 วัน',
      'deadline.monitor': 'ติดตามต่อ',
      'okrBox.O1': 'O1 — รายได้รวม +15% YoY',
      'okrBox.O2': 'O2 — รายได้นอก Toyota OEM > 20%',
      'okrBox.benefit': 'ช่องทางที่ได้ประโยชน์',
      'okrBox.atRisk': 'ช่องทางที่มีความเสี่ยง',

      'tier.1': 'แหล่งข้อมูลทางการ',
      'tier.2': 'สำนักข่าว',
      'tier.3': 'โซเชียล/ตลาด — ยังต้องตรวจสอบ',
      'source.label': 'แหล่งข่าว: {name} (Tier {tier})',

      'okrBox.questions': 'คำถามเชิงกลยุทธ์สำหรับผู้บริหาร',
      'act.emptyFrame': 'ไม่มีรายการในกรอบเวลานี้',
      'act.priority': 'ความสำคัญ',
      'act.sourceNews': 'ข่าวต้นทาง',
      'priority.high': 'สูง',
      'priority.medium': 'กลาง',
      'priority.low': 'ต่ำ',
      'chart.empty': 'ไม่มีข้อมูล',
      'chart.trend': 'แนวโน้มคะแนนผลกระทบสุทธิ (7 วันล่าสุด)',
      'chart.trendNeed': 'ต้องมีข้อมูลอย่างน้อย 2 วันจึงแสดงแนวโน้มได้',
      'brief.overall': 'ภาพรวม',
      'drawer.type': 'ประเภท',
      'drawer.score': 'คะแนนผลกระทบ',
      'drawer.confidence': 'ความเชื่อมั่น',
      'drawer.relevance': 'ความเกี่ยวข้อง',
      'drawer.category': 'หมวดข่าว',
      'drawer.o1': 'O1 — รายได้รวม',
      'drawer.o2': 'O2 — ลดพึ่งพา Toyota',
      'sys.failed': 'ล้มเหลว',
      'sys.notConfigured': 'ยังไม่ตั้งค่า',
      'sys.errors': 'ข้อผิดพลาดที่ระบบข้ามไป ({n} รายการ)',
      'sys.aiOn': 'AI: {model} · โทเคน {tokens} · ค่าใช้จ่ายโดยประมาณ ${cost}',
      'sys.aiOff': 'AI ปิดใช้งาน — ใช้การวิเคราะห์ด้วยกฎอัตโนมัติ',

      'footnote':
        'รายงานนี้สร้างอัตโนมัติจากแหล่งข่าวสาธารณะ (RSS/API) โดยเก็บเฉพาะหัวข้อข่าว ข้อมูลประกอบ และลิงก์ต้นฉบับ ' +
        'ไม่คัดลอกบทความฉบับเต็มและไม่ข้าม Paywall · บทวิเคราะห์เป็นการตีความเชิงธุรกิจ ไม่ใช่ข้อเท็จจริงจากข่าว ' +
        'โปรดตรวจสอบข่าวต้นฉบับก่อนตัดสินใจ',
    },

    en: {
      'brand.sub': 'Daily automotive business intelligence · Air4 International',
      'doc.title': 'Air4 Daily Automotive Intelligence',

      'range.k': 'Date range',
      'range.aria': 'Select the report date range',
      'range.latest': 'Latest day',
      'range.7': 'Last 7 days',
      'range.14': 'Last 14 days',
      'range.30': 'Last 30 days',
      'range.custom': 'Custom…',
      'range.from': 'From',
      'range.to': 'To',
      'range.fromAria': 'Start date',
      'range.toAria': 'End date',
      'range.days': '{n} days',

      'meta.showing': 'Showing',
      'meta.updated': 'Last updated',
      'meta.funnel': 'Screened / passed',
      'btn.refresh': 'Reload data',

      'theme.aria': 'Toggle light/dark theme',
      'theme.auto': 'System',
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'lang.aria': 'Change language',
      'lang.note': 'Analysis text is written in Thai',

      'status.ok': 'Operating normally',
      'status.degraded': 'Partially degraded',
      'status.failed': 'Run failed',
      'state.loading': 'Loading report…',
      'state.merging': 'Merging {n} days…',
      'state.noData': 'No report data yet',
      'state.needServer':
        'This page must be served over HTTP, not opened as a file — run "npm run serve" and open http://localhost:4173',
      'state.runDaily': 'Run "npm run daily" to generate a report, then reload ({err})',

      'sec.kpi': 'Key indicators',
      'sec.brief': 'Executive briefing',
      'sec.okr': 'Impact on company OKRs',
      'sec.actions': 'Recommended actions',
      'sec.charts': 'By the numbers',
      'sec.news': 'Screened news',
      'sec.newsNote': 'Sorted by business impact',
      'sec.system': 'System and source status',

      'brief.today': "Today's situation",
      'brief.ruler': 'Net business impact score',
      'brief.scaleNeg': '−5 negative',
      'brief.scalePos': '+5 positive',
      'brief.opp': 'Key opportunities',
      'brief.risk': 'Risks to watch',
      'brief.oppEmpty': 'No clear opportunity signals today',
      'brief.riskEmpty': 'No clear risk signals today',
      'brief.byAi': 'Analysed by AI ({model}) · {n} items',
      'brief.byRule': 'Analysed by rule-based fallback (no AI)',
      'brief.scopeNote': 'From the {date} report only — not the whole range',
      'urgency.low': 'Urgency: low — monitor as usual',
      'urgency.medium': 'Urgency: medium — review this week',
      'urgency.high': 'Urgency: high — consider today',

      'act.note': 'Grouped by timeframe and owning department',
      'act.today': 'Today',
      'act.7days': 'Within 7 days',
      'act.monitor': 'Keep watching',
      'act.empty': 'Nothing listed',

      'kpi.total': 'Total news',
      'kpi.totalToday': 'News today',
      'kpi.totalFoot': 'from {n} items screened',
      'kpi.rangeFoot': '{n} days combined (cross-day duplicates removed)',
      'kpi.positive': 'Positive',
      'kpi.positiveFoot': 'Business opportunities',
      'kpi.neutral': 'Neutral',
      'kpi.neutralFoot': 'Worth watching',
      'kpi.negative': 'Negative',
      'kpi.negativeFoot': 'Needs attention',
      'kpi.highImpact': 'High impact',
      'kpi.highImpactFoot': '|score| ≥ 3',
      'kpi.competitor': 'Competitor signals',
      'kpi.competitorFoot': 'Movements detected',
      'kpi.ev': 'EV news',
      'kpi.evFoot': 'Dual impact',
      'kpi.intl': 'International',
      'kpi.intlFoot': 'Overseas OEM markets',
      'kpi.b2b': 'B2B opportunities',
      'kpi.b2bFoot': 'Dealers / workshops / car care',
      'kpi.o2': 'O2 supporting',
      'kpi.o2Foot': 'Reduce Toyota OEM dependence',
      'kpi.social': 'Social mentions',
      'kpi.socialFoot': 'Pantip / social — unverified',
      'kpi.signal': 'Demand signals',
      'kpi.signalFoot': 'Heat / PM2.5',

      'filter.aria': 'Filter by impact type',
      'filter.all': 'All',
      'filter.saved': 'Saved',
      'filter.search': 'Search headlines or keywords…',
      'filter.searchAria': 'Search news',
      'filter.allCountries': 'All countries',
      'filter.allSources': 'All sources',
      'filter.allTiers': 'All source tiers',
      'filter.tier1': 'Tier 1 — official',
      'filter.tier2': 'Tier 2 — news media',
      'filter.tier3': 'Tier 3 — unverified',
      'filter.allCategories': 'All categories',
      'filter.allChannels': 'All channels',
      'filter.allProducts': 'All products',
      'filter.impactAll': 'Any impact level',
      'filter.impact2': '|impact| ≥ 2',
      'filter.impact3': '|impact| ≥ 3 (high)',
      'filter.impact4': '|impact| ≥ 4 (very high)',
      'filter.competitorOnly': 'Competitor news only',
      'filter.reset': 'Clear filters',
      'filter.count': 'Showing {shown} of {total}',
      'filter.emptyTitle': 'No news matches these filters',
      'filter.emptyHint': 'Try clearing the filters or changing your search',
      'filter.savedEmptyTitle': 'No saved news yet',
      'filter.savedEmptyHint': 'Tap the bookmark icon on a card to keep it for later',

      'card.impact': 'Impact',
      'card.impactTitle': 'Business impact score (−5 to +5)',
      'card.confidence': 'Confidence',
      'card.why': 'Why this matters to Air4',
      'card.details': 'View details',
      'card.openSource': 'Open source article',
      'card.save': 'Save this item',
      'card.unsave': 'Remove from saved',
      'card.share': 'Share the source link',
      'card.shareCopied': 'Link copied',
      'card.shareFailed': 'Could not copy the link',
      'card.competitorTag': 'Competitor: ',

      'flag.unverified': 'Unverified',
      'flag.social': 'Social',
      'flag.signal': 'Demand signal',
      'flag.multiDay': 'Seen on {n} days',
      'flag.pressRelease': 'Press release',
      'flag.sponsored': 'Sponsored',
      'flag.ruleBased': 'Rule-based',

      'saved.title': 'Saved news',
      'saved.count': '{n} saved',
      'saved.export': 'Download as file',
      'saved.copyLinks': 'Copy all links',
      'saved.clear': 'Clear saved list',
      'saved.clearConfirm': 'Remove all saved news?',
      'saved.copied': 'Copied {n} links',
      'saved.exported': 'File downloaded',

      'drawer.title': 'News detail',
      'drawer.close': 'Close detail',
      'drawer.positives': 'Potential upsides',
      'drawer.negatives': 'Potential downsides',
      'drawer.interpretation': 'Business interpretation',
      'drawer.actions': 'Recommended actions',
      'drawer.horizon': 'Impact horizon',
      'drawer.credibility': 'Source credibility',
      'drawer.related': 'Other sources covering this',

      'verdict.positive': 'Positive',
      'verdict.neutral': 'Neutral',
      'verdict.negative': 'Negative',
      'horizon.immediate': 'Immediate',
      'horizon.1-3 months': '1–3 months',
      'horizon.3-12 months': '3–12 months',
      'horizon.long-term': 'Long term',
      'cat.AUTO_MARKET': 'Auto market',
      'cat.EV': 'Electric vehicles',
      'cat.AC_CLEANING': 'Car AC cleaning',
      'cat.INJECTOR': 'Injector cleaning',
      'cat.TRADING': 'Trading products',
      'cat.COMPETITOR': 'Competitors',
      'cat.OEM_BRANDS': 'Brands / dealers',
      'cat.INTERNATIONAL': 'International',
      'cat.OTHER': 'Other',
      'prod.AC_CLEANING': 'Car AC cleaning',
      'prod.POWER_FLOW': 'Power Flow',
      'prod.TRADING': 'Trading chemicals',
      'prodFilter.AC_CLEANING': 'Car AC cleaning',
      'prodFilter.POWER_FLOW': 'Power Flow (injector)',
      'prodFilter.TRADING': 'Trading chemicals',
      'okr.positive': 'Supports',
      'okr.neutral': 'Neutral',
      'okr.negative': 'Hinders',
      'deadline.today': 'Today',
      'deadline.within_7_days': 'Within 7 days',
      'deadline.monitor': 'Monitor',
      'okrBox.O1': 'O1 — total revenue +15% YoY',
      'okrBox.O2': 'O2 — non-Toyota-OEM revenue > 20%',
      'okrBox.benefit': 'Channels that benefit',
      'okrBox.atRisk': 'Channels at risk',

      'tier.1': 'official source',
      'tier.2': 'news media',
      'tier.3': 'social / market — needs verification',
      'source.label': 'Source: {name} (Tier {tier})',

      'okrBox.questions': 'Strategic questions for leadership',
      'act.emptyFrame': 'Nothing in this timeframe',
      'act.priority': 'Priority',
      'act.sourceNews': 'Source item',
      'priority.high': 'High',
      'priority.medium': 'Medium',
      'priority.low': 'Low',
      'chart.empty': 'No data',
      'chart.trend': 'Net impact trend (last 7 days)',
      'chart.trendNeed': 'At least 2 days of data are needed to show a trend',
      'brief.overall': 'Overall',
      'drawer.type': 'Type',
      'drawer.score': 'Impact score',
      'drawer.confidence': 'Confidence',
      'drawer.relevance': 'Relevance',
      'drawer.category': 'Category',
      'drawer.o1': 'O1 — total revenue',
      'drawer.o2': 'O2 — Toyota dependence',
      'sys.failed': 'failed',
      'sys.notConfigured': 'not set up',
      'sys.errors': 'Errors the system skipped ({n})',
      'sys.aiOn': 'AI: {model} · {tokens} tokens · est. cost ${cost}',
      'sys.aiOff': 'AI disabled — using rule-based analysis',

      'footnote':
        'This report is generated automatically from public sources (RSS/API), storing only headlines, metadata and source links. ' +
        'Full articles are not copied and paywalls are not bypassed · The analysis is a business interpretation, not fact from the article. ' +
        'Please check the original source before deciding.',
    },
  };

  var LANGS = ['th', 'en'];
  var STORE_KEY = 'air4.lang';

  var current = 'th';
  try {
    var saved = localStorage.getItem(STORE_KEY);
    if (saved && LANGS.indexOf(saved) !== -1) current = saved;
  } catch (_) { /* localStorage อาจถูกปิด */ }

  /** แทนที่ตัวแปรในรูปแบบ {name} */
  function interpolate(template, vars) {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, function (m, key) {
      return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m;
    });
  }

  function t(key, vars) {
    var table = DICT[current] || DICT.th;
    var value = table[key];
    if (value === undefined) value = DICT.th[key];
    if (value === undefined) return key; // แสดง key ให้เห็นว่าแปลตกหล่น
    return interpolate(value, vars);
  }

  function getLang() { return current; }

  function setLang(lang) {
    if (LANGS.indexOf(lang) === -1) return current;
    current = lang;
    try { localStorage.setItem(STORE_KEY, lang); } catch (_) { /* ignore */ }
    document.documentElement.setAttribute('lang', lang);
    return current;
  }

  /**
   * แปลข้อความคงที่ใน HTML
   *   data-i18n="key"            → textContent
   *   data-i18n-attr="attr:key"  → attribute (คั่นหลายตัวด้วย ,)
   */
  function applyStatic(scope) {
    var rootEl = scope || document;
    var nodes = rootEl.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    var attrNodes = rootEl.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrNodes.length; j++) {
      var spec = attrNodes[j].getAttribute('data-i18n-attr').split(',');
      for (var k = 0; k < spec.length; k++) {
        var parts = spec[k].split(':');
        if (parts.length === 2) {
          attrNodes[j].setAttribute(parts[0].trim(), t(parts[1].trim()));
        }
      }
    }
  }

  root.Air4I18n = {
    t: t,
    getLang: getLang,
    setLang: setLang,
    applyStatic: applyStatic,
    languages: LANGS,
    dict: DICT,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
