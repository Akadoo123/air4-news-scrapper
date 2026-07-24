import { loadKeywords } from '../config.js';
import { truncate } from '../security/sanitize.js';
import type {
  Analysis,
  Channel,
  Classification,
  DailyAnalysis,
  NewsCategory,
  NormalizedItem,
  ProductId,
  TimeHorizon,
  AnalyzedItem,
} from '../types.js';

/* ============================================================
 * Rule-based Fallback
 * ใช้เมื่อ: ไม่มี API Key / AI ล้มเหลว / JSON ไม่ผ่าน Validation / เกินงบประมาณ
 * เป้าหมาย: ระบบต้องเดินต่อได้เสมอ ไม่ล้มทั้ง Pipeline
 * ========================================================== */

const POSITIVE_SIGNALS: Array<{ re: RegExp; weight: number; th: string }> = [
  { re: /เปิดศูนย์|ศูนย์บริการใหม่|new service (centre|center)|ขยายเครือข่าย|expansion/i, weight: 2, th: 'มีการขยายเครือข่ายศูนย์บริการ = ฐานลูกค้า B2B เพิ่ม' },
  { re: /ยอดขายรถ.*เพิ่ม|เติบโต|โต\s*\d|growth|increase|rise|surge|up \d+%/i, weight: 2, th: 'ตลาดรถยนต์เติบโต = ปริมาณรถเข้าศูนย์เพิ่ม' },
  { re: /PM ?2\.?5|ฝุ่น|คุณภาพอากาศ|air quality|cabin air|มลพิษ/i, weight: 2, th: 'ประเด็นคุณภาพอากาศหนุนความต้องการล้างแอร์' },
  { re: /เชื้อรา|กลิ่นอับ|แบคทีเรีย|mold|bacteria|odor/i, weight: 3, th: 'ปัญหากลิ่น/เชื้อราในรถ = ความต้องการบริการหลักของ Air4' },
  { re: /ล้างแอร์|evaporator clean|hvac clean|cabin air clean/i, weight: 3, th: 'เกี่ยวข้องกับบริการหลักโดยตรง' },
  { re: /อายุเฉลี่ยรถ|รถเก่า|aging vehicle|average vehicle age/i, weight: 2, th: 'รถเก่ามากขึ้น = ความต้องการบำรุงรักษาสูงขึ้น' },
];

const NEGATIVE_SIGNALS: Array<{ re: RegExp; weight: number; th: string }> = [
  { re: /ยอดขาย.*ลด|หดตัว|ชะลอ|decline|drop|fall|slump|down \d+%/i, weight: 2, th: 'ตลาดหดตัว = ปริมาณรถเข้าศูนย์ลดลง' },
  { re: /ปิดศูนย์|เลิกกิจการ|ปิดโรงงาน|close|shut down|layoff|ปลดพนักงาน/i, weight: 2, th: 'การปิดตัว = ฐานลูกค้าลดลง' },
  { re: /สงครามราคา|ลดราคา|ตัดราคา|price war|discount war/i, weight: 3, th: 'แรงกดดันด้านราคา กระทบมาร์จิ้น' },
  { re: /ต้นทุน.*เพิ่ม|ค่าเงิน|ภาษี.*เพิ่ม|cost increase|tariff|inflation/i, weight: 2, th: 'ต้นทุนเพิ่ม กระทบกำไร' },
  { re: /หนี้ครัวเรือน|ปฏิเสธสินเชื่อ|reject.*loan|credit tighten/i, weight: 2, th: 'กำลังซื้ออ่อนแอ' },
];

const EV_RE = /\bEV\b|รถยนต์ไฟฟ้า|electric vehicle|battery electric|BEV|ปลั๊กอิน|plug-?in/i;
const ICE_RE = /หัวฉีด|injector|สันดาป|combustion|น้ำมันเชื้อเพลิง|fuel system|carbon clean/i;

function detectChannels(text: string, item: NormalizedItem): Channel[] {
  const out = new Set<Channel>();
  if (/OEM|โตโยต้า|toyota|isuzu|อีซูซุ|ค่ายรถ|ผู้ผลิตรถ/i.test(text)) out.add('OEM');
  if (/ศูนย์บริการ|อู่|คาร์แคร์|workshop|garage|dealer|service cent/i.test(text)) out.add('B2B');
  if (/เจ้าของรถ|ผู้บริโภค|consumer|car owner|ลูกค้าทั่วไป/i.test(text)) out.add('B2C');
  if (out.size === 0 && item.matchedBrands.length > 0) out.add('OEM');
  return [...out];
}

function detectProducts(text: string): ProductId[] {
  const out = new Set<ProductId>();
  if (/ล้างแอร์|แอร์รถ|evaporator|condenser|hvac|cabin air|กลิ่น|เชื้อรา|air condition/i.test(text)) {
    out.add('AC_CLEANING');
  }
  if (ICE_RE.test(text)) out.add('POWER_FLOW');
  if (/น้ำยา|เคลือบ|coating|detailing|brake clean|car care|ห้องเครื่อง|หนู/i.test(text)) {
    out.add('TRADING');
  }
  return [...out];
}

function pickCategory(item: NormalizedItem, text: string): NewsCategory {
  if (item.matchedCompetitors.length > 0) return 'COMPETITOR';
  if (EV_RE.test(text)) return 'EV';
  const order: NewsCategory[] = ['AC_CLEANING', 'INJECTOR', 'TRADING', 'OEM_BRANDS', 'AUTO_MARKET', 'INTERNATIONAL'];
  for (const c of order) if (item.matchedCategories.includes(c)) return c;
  return item.matchedCategories[0] ?? 'OTHER';
}

/**
 * ให้คะแนนผลกระทบสุทธิแบบ Rule-based
 * กฎ EV: บวกต่อ AC_CLEANING แต่ลบต่อ POWER_FLOW → ต้องหักลบกันก่อน
 */
export function fallbackAnalyze(item: NormalizedItem): Analysis {
  const text = `${item.title} ${item.snippet}`;
  const positives: string[] = [];
  const negatives: string[] = [];
  const reasons: string[] = [];

  let score = 0;

  for (const s of POSITIVE_SIGNALS) {
    if (s.re.test(text)) {
      score += s.weight;
      positives.push(s.th);
    }
  }
  for (const s of NEGATIVE_SIGNALS) {
    if (s.re.test(text)) {
      score -= s.weight;
      negatives.push(s.th);
    }
  }

  // --- คู่แข่ง: ข่าวคู่แข่งเชิงรุกเป็นลบต่อ Air4 ---
  if (item.matchedCompetitors.length > 0) {
    if (/ปัญหา|ร้องเรียน|ถอน|ยกเลิก|recall|complaint|lawsuit/i.test(text)) {
      score += 2;
      positives.push('คู่แข่งมีปัญหา = โอกาสของ Air4');
    } else {
      score -= 3;
      negatives.push(`คู่แข่ง (${item.matchedCompetitors.join(', ')}) เคลื่อนไหวในตลาด`);
    }
    reasons.push(`ตรวจพบคู่แข่ง: ${item.matchedCompetitors.join(', ')}`);
  }

  // --- กฎ EV: ประเมินแยกรายผลิตภัณฑ์แล้วหาผลสุทธิ ---
  const isEv = EV_RE.test(text);
  if (isEv) {
    score += 2; // บวกต่อ AC_CLEANING (EV ยังต้องล้างแอร์ + ใส่ใจ Cabin Air Quality)
    positives.push('รถ EV ยังต้องล้างแอร์ และเจ้าของ EV ใส่ใจคุณภาพอากาศในห้องโดยสารสูง');
    score -= 2; // ลบต่อ POWER_FLOW (ไม่มีหัวฉีดน้ำมัน)
    negatives.push('EV ไม่มีหัวฉีดน้ำมัน = ความต้องการ Power Flow ลดลงในระยะยาว');
    reasons.push('ข่าว EV: ผลบวกต่อ AC_CLEANING หักลบผลลบต่อ POWER_FLOW → ประเมินผลสุทธิ');
  }

  // --- ปรับด้วยความน่าเชื่อถือของแหล่งข่าว ---
  if (item.sourceTier === 3 || item.unverified) {
    score = Math.trunc(score * 0.6);
    reasons.push('แหล่งข่าว Tier 3 — ข้อมูลยังต้องตรวจสอบ');
  }

  const impactScore = Math.max(-5, Math.min(5, score));
  const classification: Classification =
    impactScore >= 2 ? 'positive' : impactScore <= -2 ? 'negative' : 'neutral';

  // --- Relevance จาก prefilter score ---
  // ปรับเทียบจากคะแนนจริง: pf 0 → 12, pf 8 → 44, pf 14 → 60, pf 26 → 92
  // (ค่า 40 คือเส้นแบ่ง MIN_RELEVANCE_SCORE จึงต้องให้ pf ราว 7 ขึ้นไปผ่าน)
  const relevanceScore = item.prefilterScore === 0
    ? 0
    : Math.max(0, Math.min(100, Math.round(12 + item.prefilterScore * 3.1)));

  // --- Confidence: fallback มั่นใจต่ำกว่า AI เสมอ ---
  let confidence = 45;
  if (item.publishedAt) confidence += 8;
  if (item.sourceTier === 1) confidence += 10;
  if (item.sourceTier === 3) confidence -= 12;
  if (item.snippet.length > 120) confidence += 5;
  if (isEv) confidence -= 5; // ผลกระทบสองทาง ต้องให้คนตัดสิน
  confidence = Math.max(10, Math.min(75, confidence));

  const channels = detectChannels(text, item);
  const products = detectProducts(text);

  const timeHorizon: TimeHorizon = isEv
    ? 'long-term'
    : item.matchedCompetitors.length > 0
      ? 'immediate'
      : '1-3 months';

  const okrDir = classification;

  return {
    titleTh: item.language === 'th' ? item.title : `[EN] ${item.title}`,
    shortSummaryTh: truncate(
      item.snippet || item.title,
      300,
    ) || item.title,
    classification,
    impactScore,
    confidence,
    relevanceScore,
    newsCategory: pickCategory(item, text),
    affectedChannels: channels,
    affectedProducts: products,
    affectedCountries: [item.sourceCountry === 'GLOBAL' ? 'Global' : item.sourceCountry],
    affectedCompetitors: item.matchedCompetitors,
    okrImpact: {
      O1: okrDir,
      O2: channels.includes('B2B') || channels.includes('B2C') ? okrDir : 'neutral',
    },
    positiveImpacts: positives.slice(0, 5),
    negativeImpacts: negatives.slice(0, 5),
    reasoningSummary: (reasons.length ? reasons : ['วิเคราะห์ด้วยกฎอัตโนมัติ (ไม่ได้ใช้ AI)']).slice(0, 3),
    businessInterpretation:
      'วิเคราะห์โดยระบบกฎอัตโนมัติ (Rule-based) เนื่องจากไม่สามารถเรียกใช้ AI ได้ — ควรให้ผู้เชี่ยวชาญตรวจสอบก่อนตัดสินใจ',
    recommendedActions: [
      {
        action: 'ตรวจสอบรายละเอียดข่าวต้นฉบับและประเมินผลกระทบเชิงลึก',
        owner: 'Business Intelligence',
        priority: Math.abs(impactScore) >= 3 ? ('high' as const) : ('medium' as const),
        deadline: Math.abs(impactScore) >= 3 ? ('today' as const) : ('monitor' as const),
      },
    ],
    timeHorizon,
  };
}

/** สรุปภาพรวมรายวันแบบ Rule-based */
export function fallbackDaily(items: AnalyzedItem[]): DailyAnalysis {
  const kw = loadKeywords();
  void kw;

  const pos = items.filter((i) => i.classification === 'positive');
  const neg = items.filter((i) => i.classification === 'negative');
  const neu = items.filter((i) => i.classification === 'neutral');
  const net = items.reduce((s, i) => s + i.impactScore * (i.confidence / 100), 0);

  const topPos = [...pos].sort((a, b) => b.impactScore - a.impactScore).slice(0, 3);
  const topNeg = [...neg].sort((a, b) => a.impactScore - b.impactScore).slice(0, 3);
  const competitorItems = items.filter((i) => i.affectedCompetitors.length > 0);

  const overall: Classification = net >= 3 ? 'positive' : net <= -3 ? 'negative' : 'neutral';

  const summary =
    items.length === 0
      ? 'วันนี้ไม่พบข่าวที่เกี่ยวข้องกับธุรกิจ Air4 ผ่านเกณฑ์คัดกรอง อาจเป็นวันที่ตลาดเงียบ หรือแหล่งข่าวบางแห่งไม่สามารถเข้าถึงได้ แนะนำให้ตรวจสอบสถานะแหล่งข่าวในส่วน System Status'
      : [
          `วันนี้ระบบคัดกรองข่าวที่เกี่ยวข้องกับ Air4 ได้ ${items.length} ข่าว`,
          `แบ่งเป็นเชิงบวก ${pos.length} ข่าว เป็นกลาง ${neu.length} ข่าว และเชิงลบ ${neg.length} ข่าว`,
          `คะแนนผลกระทบสุทธิอยู่ที่ ${net.toFixed(1)} ซึ่งจัดอยู่ในระดับ${
            overall === 'positive' ? 'บวก' : overall === 'negative' ? 'ลบ' : 'เป็นกลาง'
          }ต่อธุรกิจ`,
          topPos[0] ? `ข่าวเชิงบวกที่สำคัญที่สุดคือ "${topPos[0].titleTh}"` : '',
          topNeg[0] ? `ข่าวที่ต้องเฝ้าระวังมากที่สุดคือ "${topNeg[0].titleTh}"` : '',
          competitorItems.length
            ? `พบความเคลื่อนไหวของคู่แข่ง ${competitorItems.length} รายการ ควรติดตามใกล้ชิด`
            : 'ยังไม่พบความเคลื่อนไหวสำคัญของคู่แข่งในวันนี้',
          'หมายเหตุ: บทวิเคราะห์นี้สร้างโดยระบบกฎอัตโนมัติเนื่องจากไม่สามารถเรียกใช้ AI ได้',
        ]
          .filter(Boolean)
          .join(' ');

  return {
    executiveSummaryTh: summary,
    overallSentiment: overall,
    netImpactScore: Number(net.toFixed(2)),
    urgencyLevel: Math.abs(net) >= 6 || competitorItems.length >= 3 ? 'high' : Math.abs(net) >= 3 ? 'medium' : 'low',
    opportunitySignals: topPos.map((i) => ({
      title: i.titleTh,
      detail: i.positiveImpacts[0] ?? i.shortSummaryTh,
      relatedNewsIds: [i.id],
    })),
    riskSignals: topNeg.map((i) => ({
      title: i.titleTh,
      detail: i.negativeImpacts[0] ?? i.shortSummaryTh,
      relatedNewsIds: [i.id],
    })),
    actionsToday: topNeg.slice(0, 2).map((i) => ({
      action: `ประเมินผลกระทบจากข่าว: ${i.titleTh}`,
      reason: i.negativeImpacts[0] ?? 'ข่าวเชิงลบที่มีผลกระทบสูง',
      owner: 'Business Intelligence' as const,
      priority: 'high' as const,
      deadline: 'today' as const,
      relatedNewsIds: [i.id],
    })),
    actionsWithin7Days: topPos.slice(0, 2).map((i) => ({
      action: `ต่อยอดโอกาสจากข่าว: ${i.titleTh}`,
      reason: i.positiveImpacts[0] ?? 'ข่าวเชิงบวกที่สร้างโอกาสทางธุรกิจ',
      owner: 'B2B Sales & Marketing' as const,
      priority: 'medium' as const,
      deadline: 'within_7_days' as const,
      relatedNewsIds: [i.id],
    })),
    actionsToMonitor: competitorItems.slice(0, 2).map((i) => ({
      action: `ติดตามความเคลื่อนไหวของ ${i.affectedCompetitors.join(', ')}`,
      reason: 'ความเคลื่อนไหวของคู่แข่งอาจกระทบส่วนแบ่งตลาด',
      owner: 'Business Development' as const,
      priority: 'medium' as const,
      deadline: 'monitor' as const,
      relatedNewsIds: [i.id],
    })),
    okrAssessment: {
      O1: `สัญญาณวันนี้${overall === 'positive' ? 'สนับสนุน' : overall === 'negative' ? 'กดดัน' : 'ยังไม่ชี้ชัดต่อ'}เป้าหมายรายได้รวม +15% YoY`,
      O2: `ข่าวที่เกี่ยวกับช่องทางนอก Toyota OEM มี ${
        items.filter((i) => i.affectedChannels.includes('B2B') || i.affectedChannels.includes('B2C')).length
      } รายการ`,
      benefitingChannels: [...new Set(pos.flatMap((i) => i.affectedChannels))],
      atRiskChannels: [...new Set(neg.flatMap((i) => i.affectedChannels))],
      prioritisationNote: 'ควรตรวจสอบด้วย AI Analysis เพื่อความแม่นยำ',
    },
    ceoQuestions: [
      'ข่าววันนี้มีรายการใดที่ควรเปลี่ยนลำดับความสำคัญของแผนการขายหรือไม่',
      'มีลูกค้ารายใดที่ควรเข้าไปติดต่อทันทีจากสัญญาณที่พบ',
    ],
  };
}
