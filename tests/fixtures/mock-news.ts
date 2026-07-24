import type { RawItem } from '../../src/types.js';

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();

/**
 * ชุดข่าวจำลองสำหรับทดสอบและ Preview
 * ครอบคลุม: positive 3, neutral 3, negative 3, ข่าวซ้ำ 2,
 * ไทย/อังกฤษ, EV ที่มีผลสองทาง, และ Wizard ที่ไม่เกี่ยวกับรถ (False Positive)
 */
export const MOCK_NEWS: RawItem[] = [
  /* ---------- POSITIVE ---------- */
  {
    title: 'โตโยต้าประกาศขยายศูนย์บริการในไทยเพิ่ม 45 แห่งภายในปี 2569',
    link: 'https://example-news.co.th/toyota-expands-service-network?utm_source=rss',
    snippet:
      'บริษัท โตโยต้า มอเตอร์ ประเทศไทย เปิดเผยแผนขยายเครือข่ายศูนย์บริการมาตรฐานเพิ่มอีก 45 แห่งทั่วประเทศ เพื่อรองรับปริมาณรถยนต์เข้าศูนย์ที่เพิ่มขึ้นต่อเนื่อง โดยเน้นบริการหลังการขายและการดูแลรักษาเชิงป้องกัน',
    publishedAt: hoursAgo(6),
    sourceId: 'prachachat',
    sourceName: 'ประชาชาติธุรกิจ',
    sourceTier: 2,
    sourceCountry: 'TH',
    language: 'th',
    unverified: false,
  },
  {
    title: 'ค่าฝุ่น PM2.5 กรุงเทพฯ พุ่งสูง กรมอนามัยเตือนดูแลระบบแอร์รถยนต์และคุณภาพอากาศในห้องโดยสาร',
    link: 'https://example-gov.go.th/pm25-cabin-air-warning',
    snippet:
      'กรมอนามัยแนะประชาชนที่ใช้รถยนต์ควรทำความสะอาดระบบปรับอากาศและเปลี่ยนไส้กรองอากาศอย่างสม่ำเสมอ เนื่องจากฝุ่นละอองขนาดเล็กสะสมในคอยล์เย็นอาจก่อให้เกิดเชื้อราและแบคทีเรีย ส่งผลต่อสุขภาพผู้ขับขี่และผู้โดยสาร',
    publishedAt: hoursAgo(10),
    sourceId: 'pcd-air4thai',
    sourceName: 'กรมควบคุมมลพิษ',
    sourceTier: 1,
    sourceCountry: 'TH',
    language: 'th',
    unverified: false,
  },
  {
    title: 'Vietnam automotive aftermarket to grow 9% as vehicle fleet ages',
    link: 'https://example-intl.com/vietnam-aftermarket-growth',
    snippet:
      'The automotive aftermarket in Vietnam is projected to expand by nine percent this year, driven by an aging vehicle fleet and rising demand for car care and maintenance services at independent workshops and garages across major cities.',
    publishedAt: hoursAgo(20),
    sourceId: 'just-auto',
    sourceName: 'Just Auto',
    sourceTier: 2,
    sourceCountry: 'VN',
    language: 'en',
    unverified: false,
  },

  /* ---------- NEUTRAL ---------- */
  {
    title: 'ยอดผลิตรถยนต์เดือนล่าสุดทรงตัว ผู้ผลิตรอดูทิศทางนโยบายภาครัฐ',
    link: 'https://example-news.co.th/production-flat',
    snippet:
      'สภาอุตสาหกรรมแห่งประเทศไทยรายงานยอดผลิตรถยนต์เดือนล่าสุดใกล้เคียงกับช่วงเดียวกันของปีก่อน โดยผู้ผลิตส่วนใหญ่ยังรอความชัดเจนของนโยบายภาครัฐเกี่ยวกับอุตสาหกรรมยานยนต์และมาตรการสนับสนุน',
    publishedAt: hoursAgo(14),
    sourceId: 'thansettakij',
    sourceName: 'ฐานเศรษฐกิจ',
    sourceTier: 2,
    sourceCountry: 'TH',
    language: 'th',
    unverified: false,
  },
  {
    title: 'Singapore reviews vehicle inspection standards for commercial fleets',
    link: 'https://example-intl.com/singapore-inspection-review',
    snippet:
      'Authorities in Singapore have begun a consultation on updating vehicle inspection standards for commercial fleets. The review covers emissions testing procedures and maintenance record requirements, with no decision expected before the next fiscal year.',
    publishedAt: hoursAgo(26),
    sourceId: 'google-news:en-SG',
    sourceName: 'Business Times',
    sourceTier: 2,
    sourceCountry: 'SG',
    language: 'en',
    unverified: false,
  },
  {
    title: 'รีวิวจากกลุ่มผู้ใช้รถ: เทคนิคดูแลแอร์รถยนต์ให้เย็นนานขึ้น',
    link: 'https://example-social.com/car-ac-tips-thread',
    snippet:
      'สมาชิกกลุ่มผู้ใช้รถแชร์ประสบการณ์การดูแลระบบปรับอากาศรถยนต์ ทั้งการเปลี่ยนไส้กรอง การล้างคอยล์เย็น และความถี่ที่เหมาะสม ยังไม่มีข้อสรุปที่ชัดเจนและเป็นความเห็นส่วนบุคคล',
    publishedAt: hoursAgo(8),
    sourceId: 'yt-thai-carcare',
    sourceName: 'YouTube — กลุ่มผู้ใช้รถ',
    sourceTier: 3,
    sourceCountry: 'TH',
    language: 'th',
    unverified: true,
  },

  /* ---------- NEGATIVE ---------- */
  {
    title: 'Wizard เปิดตัวบริการล้างแอร์รถยนต์พร้อมช่างถึงที่ ลดราคา 40% ทั่วประเทศ',
    link: 'https://example-news.co.th/wizard-price-cut-car-ac',
    snippet:
      'ผู้ให้บริการล้างแอร์รถยนต์รายใหญ่ประกาศแคมเปญลดราคาบริการล้างแอร์รถยนต์ลง 40% พร้อมส่งช่างถึงที่ และเพิ่มค่าคอมมิชชันให้ร้านคาร์แคร์พันธมิตร หวังชิงส่วนแบ่งตลาดจากคู่แข่งในกลุ่มศูนย์บริการและอู่ซ่อมรถ',
    publishedAt: hoursAgo(5),
    sourceId: 'prachachat',
    sourceName: 'ประชาชาติธุรกิจ',
    sourceTier: 2,
    sourceCountry: 'TH',
    language: 'th',
    unverified: false,
  },
  {
    title: 'หนี้ครัวเรือนพุ่ง สถาบันการเงินเข้มสินเชื่อรถยนต์ ยอดขายรถกระบะหดตัวต่อเนื่อง',
    link: 'https://example-news.co.th/auto-loan-tightening',
    snippet:
      'ภาวะหนี้ครัวเรือนที่อยู่ในระดับสูงทำให้สถาบันการเงินเพิ่มความเข้มงวดในการปล่อยสินเชื่อรถยนต์ ส่งผลให้ยอดขายรถกระบะและรถเชิงพาณิชย์หดตัวลงต่อเนื่อง กระทบกำลังซื้อของผู้บริโภคในภาพรวม',
    publishedAt: hoursAgo(12),
    sourceId: 'thansettakij',
    sourceName: 'ฐานเศรษฐกิจ',
    sourceTier: 2,
    sourceCountry: 'TH',
    language: 'th',
    unverified: false,
  },
  {
    title: 'New emission rules raise compliance cost for automotive chemical suppliers',
    link: 'https://example-intl.com/emission-rules-chemical-cost',
    snippet:
      'Upcoming environmental regulations will require automotive chemical suppliers to reformulate several cleaning products, raising compliance and certification costs across the industry. Smaller manufacturers are expected to face the greatest cost increase.',
    publishedAt: hoursAgo(30),
    sourceId: 'aftermarket-news',
    sourceName: 'AftermarketNews',
    sourceTier: 2,
    sourceCountry: 'GLOBAL',
    language: 'en',
    unverified: false,
  },

  /* ---------- EV: บวกต่อ AC_CLEANING แต่ลบต่อ POWER_FLOW ---------- */
  {
    title: 'ยอดขายรถยนต์ไฟฟ้าในไทยโต 38% ค่ายรถ EV เร่งขยายศูนย์บริการรองรับ',
    link: 'https://example-news.co.th/ev-sales-growth-service-network',
    snippet:
      'ยอดจดทะเบียนรถยนต์ไฟฟ้าในประเทศไทยเติบโต 38% เทียบปีก่อน ผู้ผลิต EV หลายรายเร่งขยายศูนย์บริการและเพิ่มบริการดูแลรักษา โดยเจ้าของรถ EV ให้ความสำคัญกับคุณภาพอากาศในห้องโดยสารและระบบปรับอากาศแบบฮีทปั๊มมากขึ้น ขณะที่รถเครื่องยนต์สันดาปมีสัดส่วนลดลงต่อเนื่อง',
    publishedAt: hoursAgo(9),
    sourceId: 'autolifethailand',
    sourceName: 'AutoLife Thailand',
    sourceTier: 2,
    sourceCountry: 'TH',
    language: 'th',
    unverified: false,
  },

  /* ---------- FALSE POSITIVE: Wizard ที่ไม่เกี่ยวกับรถยนต์ ---------- */
  {
    title: 'Wizard of Oz musical returns to London stage after twenty years',
    link: 'https://example-culture.com/wizard-of-oz-london',
    snippet:
      'The beloved Wizard of Oz musical is returning to the London stage this winter, with a new cast and an updated score. Tickets for the anime-inspired production go on sale next week for the general public.',
    publishedAt: hoursAgo(4),
    sourceId: 'google-news:en-US',
    sourceName: 'Culture Daily',
    sourceTier: 2,
    sourceCountry: 'GLOBAL',
    language: 'en',
    unverified: false,
  },
  {
    title: 'Wise ประกาศค่าธรรมเนียมโอนเงินระหว่างประเทศแบบใหม่',
    link: 'https://example-fintech.com/wise-transfer-fees',
    snippet:
      'ผู้ให้บริการโอนเงินระหว่างประเทศ Wise ประกาศโครงสร้างค่าธรรมเนียมใหม่สำหรับการโอนเงินและแลกเงิน โดยมีผลกับลูกค้ารายย่อยตั้งแต่เดือนหน้าเป็นต้นไป',
    publishedAt: hoursAgo(7),
    sourceId: 'google-news:th-TH',
    sourceName: 'Fintech News',
    sourceTier: 2,
    sourceCountry: 'TH',
    language: 'th',
    unverified: false,
  },

  /* ---------- ข่าวซ้ำ 2 รายการ (เหตุการณ์เดียวกัน คนละสำนักข่าว/คนละ URL) ---------- */
  {
    title: 'โตโยต้าประกาศขยายศูนย์บริการในไทยเพิ่ม 45 แห่งภายในปี 2569',
    link: 'https://example-news.co.th/toyota-expands-service-network?fbclid=abc123',
    snippet:
      'บริษัท โตโยต้า มอเตอร์ ประเทศไทย เปิดเผยแผนขยายเครือข่ายศูนย์บริการมาตรฐานเพิ่มอีก 45 แห่งทั่วประเทศ เพื่อรองรับปริมาณรถยนต์เข้าศูนย์ที่เพิ่มขึ้นต่อเนื่อง โดยเน้นบริการหลังการขายและการดูแลรักษาเชิงป้องกัน',
    publishedAt: hoursAgo(6),
    sourceId: 'google-news:th-TH',
    sourceName: 'ประชาชาติธุรกิจ',
    sourceTier: 2,
    sourceCountry: 'TH',
    language: 'th',
    unverified: false,
  },
  {
    title: 'โตโยต้า เตรียมขยายศูนย์บริการในประเทศไทยอีก 45 สาขา ภายในปี 2569',
    link: 'https://another-outlet.co.th/toyota-service-centre-expansion-2569',
    snippet:
      'ค่ายรถยนต์รายใหญ่เตรียมเพิ่มศูนย์บริการมาตรฐานในประเทศไทยอีก 45 สาขา ภายในปี 2569 เพื่อรองรับจำนวนรถยนต์ที่เข้ารับบริการเพิ่มขึ้น พร้อมยกระดับมาตรฐานงานบริการหลังการขาย',
    publishedAt: hoursAgo(5),
    sourceId: 'mgr-motoring',
    sourceName: 'MGR Online',
    sourceTier: 2,
    sourceCountry: 'TH',
    language: 'th',
    unverified: false,
  },
];
