# Air4 Daily Automotive Intelligence

ระบบข่าวกรองธุรกิจยานยนต์อัตโนมัติ สำหรับ **บริษัท แอร์โฟร์อินเตอร์เนชั่นแนล จำกัด**
(Air4 International Co., Ltd.)

ทุกวันเวลา 08:00 น. (Asia/Bangkok) ระบบจะ ดึง → คัดกรอง → วิเคราะห์ → สรุปข่าวยานยนต์
ที่เกี่ยวข้องกับธุรกิจ แล้วอัปเดต **Executive Dashboard ภาษาไทยแบบหน้าเดียว**

---

## 1. ระบบนี้ทำอะไร

| ขั้นตอน | รายละเอียด |
|---|---|
| **ดึงข่าว** | RSS/Atom 18 แหล่ง + Google News RSS 5 ภูมิภาค (+ NewsAPI ถ้ามี key) |
| **คัดกรอง** | ให้คะแนนความเกี่ยวข้องด้วยกฎ ก่อนส่งเข้า AI (คุมต้นทุน + กัน False Positive) |
| **ตัดข่าวซ้ำ** | 4 สัญญาณ: canonical URL, content hash, ความคล้ายชื่อข่าว, ความคล้ายเนื้อหา |
| **วิเคราะห์** | AI ให้คะแนนผลกระทบต่อธุรกิจ (−5 ถึง +5), ความเชื่อมั่น, ช่องทาง/ผลิตภัณฑ์ที่กระทบ, OKR |
| **สรุปรายวัน** | บทสรุปผู้บริหาร, โอกาส, ความเสี่ยง, สิ่งที่ควรทำ, คำถามเชิงกลยุทธ์ |
| **แสดงผล** | Dashboard ภาษาไทย พร้อม Filter, Search, Drawer รายละเอียด, กราฟ, ข้อมูลย้อนหลัง |

**จุดสำคัญ:** ระบบจัดประเภทข่าวตาม **ผลกระทบต่อธุรกิจ Air4** ไม่ใช่ตามน้ำเสียงของข่าว
เช่น ข่าว "ยอดขาย EV โต" เป็น **บวก** ต่อบริการล้างแอร์ แต่ **ลบ** ต่อ Power Flow (ล้างหัวฉีด)
ระบบจะประเมินผลกระทบสุทธิก่อนตัดสิน

---

## 2. Architecture

```
config/*.yaml ──────────────► ปรับแต่งได้โดยไม่ต้องแก้โค้ด
                              (แหล่งข่าว / คีย์เวิร์ด / คู่แข่ง / บริบทธุรกิจ)
      │
      ▼
┌─────────────┐   ┌──────────────┐   ┌───────────────┐   ┌──────────────┐
│ Collectors  │──►│ Normalize +  │──►│ Deduplication │──►│  Prefilter   │
│ RSS / Search│   │  Sanitize    │   │  (4 สัญญาณ)   │   │ (ประตูคุมทุน)│
└─────────────┘   └──────────────┘   └───────────────┘   └──────┬───────┘
                                                                 │
                          ┌──────────────────────────────────────┘
                          ▼
                 ┌──────────────────┐   ล้มเหลว   ┌──────────────────┐
                 │  AI Analysis     │───────────►│ Rule-based       │
                 │  (Zod-validated) │            │ Fallback         │
                 └────────┬─────────┘            └────────┬─────────┘
                          └──────────────┬────────────────┘
                                         ▼
                              ┌──────────────────┐
                              │ Daily Executive  │
                              │    Analysis      │
                              └────────┬─────────┘
                                       ▼
                          public/data/*.json ──► Dashboard (static)
```

**หลักการออกแบบ:** ทุกขั้นตอน degrade ได้ — แหล่งข่าวล่ม / AI ล่ม / ไม่มี API key
ระบบยังคงผลิตรายงานออกมาได้เสมอ ไม่ล้มทั้ง Pipeline

---

## 3. Skill / MCP / เครื่องมือที่เลือกใช้

ตรวจสอบเครื่องมือที่ติดตั้งในสภาพแวดล้อมแล้ว และเลือกใช้ดังนี้:

| ความต้องการ | เลือกใช้ | เหตุผล |
|---|---|---|
| RSS / News Feed | **เขียนเอง** (`fast-xml-parser`) | ไม่มี MCP สำหรับ RSS; parser เองรองรับทั้ง RSS 2.0 / RDF / Atom และเทสต์ได้ |
| Web Search | **Google News RSS** | ไม่ต้องใช้ API key ไม่มีค่าใช้จ่าย ครอบคลุมหลายภาษา/ประเทศ |
| Browser Automation | **Claude Browser (MCP)** | ใช้ตอนพัฒนาเพื่อทดสอบ Dashboard จริง (ไม่ใช่ runtime dependency) |
| Web Scraping / Playwright | **ปิดไว้** | ทุกแหล่งที่ใช้มี RSS อยู่แล้ว — ไม่สร้าง dependency ที่ไม่จำเป็น |
| AI Classification | **Anthropic Official SDK** + Structured Outputs | ได้ JSON ที่ validate ผ่านเสมอ ลดโค้ด parsing |
| Schema Validation | **Zod v4** | ใช้ schema เดียวกันทั้งฝั่ง AI และฝั่งเก็บข้อมูล |
| Frontend / Dashboard | **`frontend-design` skill** + Vanilla JS | ไม่มี build step ไม่มี dependency ทำให้ deploy และดูแลง่ายที่สุด |
| Data Visualization | **SVG เขียนเอง** | กราฟ 6 แบบไม่คุ้มกับการเพิ่ม chart library |
| API Reference | **`claude-api` skill** | ยืนยัน model ID, พารามิเตอร์, และราคาปัจจุบัน |
| Scheduling | **GitHub Actions** (+ Windows Task Scheduler สำรอง) | ฟรี ไม่ต้องดูแลเซิร์ฟเวอร์ |
| Deployment | **GitHub Pages** | ฟรี, HTTPS, URL คงที่, deploy อัตโนมัติ |
| Testing | **Vitest** | เร็ว รองรับ TypeScript/ESM โดยตรง |

> MCP servers อีกจำนวนหนึ่ง (Notion, Slack, HubSpot, Figma ฯลฯ) ปรากฏในสภาพแวดล้อม
> แต่ยังไม่ได้ authorize และไม่จำเป็นต่อระบบนี้ จึงไม่ได้นำมาใช้

---

## 4. วิธีติดตั้ง

```bash
# 1) ติดตั้ง dependencies (ต้องมี Node.js 20 ขึ้นไป)
npm install

# 2) สร้างไฟล์ตั้งค่า
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env

# 3) ทดสอบว่าระบบทำงาน (ใช้ข้อมูลจำลอง ไม่แตะเครือข่าย)
npm run mock

# 4) เปิดดู Dashboard
npm run serve             # → http://localhost:4173
```

### Environment Variables

แก้ไขในไฟล์ `.env` (ดูค่าเริ่มต้นทั้งหมดใน `.env.example`)

| ตัวแปร | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ไม่ | — | **ถ้าไม่ใส่ ระบบจะใช้การวิเคราะห์ด้วยกฎอัตโนมัติแทน** |
| `AI_MODEL` | ไม่ | `claude-opus-4-8` | เปลี่ยนเป็น `claude-sonnet-5` เพื่อลดต้นทุน |
| `AI_EFFORT_ITEM` | ไม่ | `low` | ระดับการคิดสำหรับวิเคราะห์รายข่าว |
| `AI_EFFORT_DAILY` | ไม่ | `high` | ระดับการคิดสำหรับสรุปรายวัน |
| `AI_DAILY_BUDGET_USD` | ไม่ | `2.00` | เกินงบแล้วสลับไปใช้กฎอัตโนมัติทันที |
| `MAX_AI_ITEMS_PER_RUN` | ไม่ | `60` | จำกัดจำนวนข่าวที่ส่งเข้า AI ต่อรอบ |
| `LOOKBACK_HOURS` | ไม่ | `48` | ช่วงเวลาย้อนหลังที่รับข่าว |
| `MIN_RELEVANCE_SCORE` | ไม่ | `40` | ต่ำกว่านี้ไม่แสดงบน Dashboard |
| `PREFILTER_MIN_SCORE` | ไม่ | `8` | ต่ำกว่านี้ไม่ส่งเข้า AI (ประตูคุมต้นทุน) |
| `NEWS_API_KEY` | ไม่ | — | เสริมเท่านั้น ระบบทำงานได้โดยไม่ต้องมี |
| `TIMEZONE` | ไม่ | `Asia/Bangkok` | เขตเวลาของรายงาน |

**ระบบทำงานได้ครบทุกฟังก์ชันโดยไม่ต้องมี API key ใด ๆ** — จะใช้การวิเคราะห์ด้วยกฎแทน
คุณภาพบทวิเคราะห์จะต่ำกว่า และ `confidence` จะไม่เกิน 75%

---

## 5. วิธีปรับแต่ง

ปรับได้จากไฟล์ YAML โดยไม่ต้องแก้โค้ด แล้วรัน `npm test` เพื่อยืนยัน

### เพิ่ม / ลบแหล่งข่าว → `config/sources.yaml`

```yaml
feeds:
  - id: my-source
    name: ชื่อที่จะแสดงบน Dashboard
    url: https://example.com/feed
    tier: 2          # 1=ทางการ  2=สำนักข่าว  3=โซเชียล (ติดป้าย "ยังไม่ยืนยัน")
    country: TH
    language: th
    enabled: true
```

**ตรวจ URL ก่อนเพิ่มเสมอ** (อย่าเดา — ฟีดจำนวนมากถูกยกเลิกไปแล้ว):

```bash
npx tsx scripts/check-feeds.ts https://example.com/feed
npx tsx scripts/check-feeds.ts        # ตรวจทุกแหล่งที่ตั้งค่าไว้
```

### เพิ่ม Keyword → `config/keywords.yaml`

```yaml
categories:
  - id: AC_CLEANING
    weight: 14                      # ยิ่งสูง ยิ่งมีโอกาสผ่านการคัดกรอง
    terms:
      th:
        - { t: ล้างแอร์รถยนต์, query: true }   # query: true = ใช้ค้นหาใน Google News ด้วย
        - { t: คอยล์เย็น }                     # ไม่มี query = ใช้ให้คะแนนอย่างเดียว
```

> ใช้ **คำสั้น** ดีกว่าวลียาว — สื่อไทยเขียน "ดูแลแอร์รถยนต์" ไม่ใช่ "ล้างแอร์รถยนต์" เสมอไป

### เพิ่มคู่แข่ง → `config/competitors.yaml`

```yaml
competitors:
  - id: newcomp
    name: ชื่อคู่แข่ง
    aliases: [ชื่อไทย, English Name]
    ambiguous: true      # true ถ้าชื่อเป็นคำทั่วไป → บังคับต้องมีบริบทยานยนต์
    country: TH
```

### เพิ่มแบรนด์รถ → `config/keywords.yaml` → `brands`

ต้องใส่ **ชื่อภาษาไทย** ใน `aliases` ด้วย ไม่งั้นจะตรวจไม่เจอในข่าวไทย

---

## 6. วิธีรันด้วยมือ

```bash
npm run daily              # รันเต็มระบบ (ดึง + วิเคราะห์ + บันทึก)
npm run daily -- --no-ai   # รันโดยไม่ใช้ AI (ไม่มีค่าใช้จ่าย)
npm run daily -- --dry-run # รันโดยไม่บันทึกลงดิสก์
npm run collect            # ดึงข่าว + ตรวจสุขภาพแหล่งข่าว (ไม่วิเคราะห์)
npm run mock               # รันด้วยข้อมูลจำลอง
npm run build:dashboard    # ตรวจความพร้อมก่อน deploy
npm run check:feeds        # ตรวจว่าแหล่งข่าวไหนยังใช้งานได้
```

### ตั้งเวลารันอัตโนมัติทุกวัน 08:00 น.

**ติดตั้งแล้วบนเครื่องนี้** — Windows Task Scheduler ชื่องาน `Air4DailyIntelligence`

```powershell
.\scripts\windows-task-scheduler.ps1 -Install     # ติดตั้ง (ไม่ต้องใช้สิทธิ์ Administrator)
.\scripts\windows-task-scheduler.ps1 -Status      # ดูสถานะ / เวลารันครั้งถัดไป
.\scripts\windows-task-scheduler.ps1 -RunNow      # สั่งรันทันทีเพื่อทดสอบ
.\scripts\windows-task-scheduler.ps1 -Uninstall   # ถอนการติดตั้ง
```

Log อยู่ที่ `logs\daily.log` (หมุนไฟล์อัตโนมัติเมื่อเกิน 5 MB)

**ข้อควรรู้**

- งานเป็น **ระดับผู้ใช้** จึงรันเมื่อผู้ใช้ล็อกอินค้างไว้ ถ้าต้องการให้รันแม้ไม่ได้ล็อกอิน
  ใช้ `-Install -Elevated` (ต้อง Run as Administrator)
- **เครื่อง sleep/hibernate** → ตั้ง `-WakeToRun` ให้ตื่นมารันเองตอน 08:00
  ต้องเปิด "Allow wake timers" ในแผนพลังงานด้วย (สคริปต์ติดตั้งไม่ได้แตะค่านี้ ตั้งด้วยคำสั่ง:
  `powercfg /setdcvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1` แล้ว `powercfg /setactive SCHEME_CURRENT`)
- **เครื่องปิดสนิท** → ตื่นเองไม่ได้ แต่จะรันให้ทันทีที่เปิดเครื่อง (`StartWhenAvailable`)
  จึงอาจได้ข่าวช้ากว่า 08:00 ในวันที่เปิดเครื่องสาย
- ตั้งค่าให้ **รันได้แม้ใช้แบตเตอรี่** — ค่าเริ่มต้นของ Windows คือห้ามรันบนแบตเตอรี่
  ซึ่งจะทำให้งานค้างสถานะ `Queued` แล้วไม่รันเลยแบบเงียบ ๆ
- ตัวเรียกใช้คือ `scripts\run-daily.cmd` ไม่ใช่คำสั่ง PowerShell ยาว ๆ
  เพราะพาธโปรเจกต์มีช่องว่าง (`Air4 News Scrap`) ทำให้เครื่องหมายคำพูดซ้อนกันแล้วพัง

**ทางเลือก GitHub Actions** — ไฟล์ `.github/workflows/daily-intelligence.yml` พร้อมแล้ว
(cron `0 1 * * *` UTC = 08:00 น. ไทย) แต่โฟลเดอร์นี้**ยังไม่เป็น git repo** จึงยังใช้ไม่ได้
ถ้าจะย้ายไปรันบนคลาวด์: `git init` → push ขึ้น GitHub → ใส่ `ANTHROPIC_API_KEY` ใน Secrets
ข้อดีคือไม่ต้องเปิดเครื่องทิ้งไว้

### ธีมและภาษา

- **ธีม**: ตามระบบ / สว่าง / มืด — จำค่าไว้ใน `localStorage` (`air4.theme`)
- **ภาษา**: ไทย / EN — จำค่าไว้ใน `localStorage` (`air4.lang`)

ส่วนติดต่อผู้ใช้แปลครบทั้งสองภาษา (`public/assets/i18n.js`)
**บทวิเคราะห์ยังเป็นภาษาไทย** เพราะ AI สร้างเป็นไทยภาษาเดียว — ในโหมด EN
หัวข้อข่าวจะสลับไปแสดง *หัวข้อต้นฉบับ* ให้อัตโนมัติ
หากต้องการบทวิเคราะห์ภาษาอังกฤษด้วย ต้องเพิ่มฟิลด์ในสคีมาและ prompt ซึ่งจะเพิ่มต้นทุน AI ราวเท่าตัว

เทสต์ `tests/i18n.test.ts` บังคับว่าคีย์ต้องครบทั้งสองภาษา และตัวแปร `{…}` ต้องตรงกัน
ถ้าเพิ่มข้อความใหม่แล้วลืมแปล เทสต์จะไม่ผ่าน

### บันทึกและแชร์ข่าว

- ไอคอน **บุ๊กมาร์ก** บนการ์ดข่าว → เก็บไว้อ่านภายหลัง ดูได้ที่ชิป "ที่บันทึกไว้"
- ไอคอน **แชร์** → ใช้ Web Share API บนมือถือ ถ้าไม่รองรับจะคัดลอกลิงก์ต้นทางให้
- ในมุมมองที่บันทึกไว้: **ดาวน์โหลดเป็นไฟล์** (JSON) และ **คัดลอกลิงก์ทั้งหมด** สำหรับส่งต่อให้คนอื่น

เก็บใน `localStorage` (`air4.saved`) แบบ**สำเนาเต็มของข่าว** ไม่ใช่แค่ id
เพื่อให้รายการที่บันทึกไว้ยังเปิดดูได้แม้ข่าวนั้นจะพ้นอายุข้อมูล 31 วันไปแล้ว
ข้อจำกัด: ผูกกับเบราว์เซอร์เครื่องนั้น ไม่ซิงก์ข้ามอุปกรณ์ (ระบบเป็น static ไม่มีฐานข้อมูลผู้ใช้)

### ช่วงวันที่บน Dashboard

เลือกได้จากหัวรายงาน: วันล่าสุด / 7 / 14 / 30 วัน หรือกำหนดเอง

- **ข่าว, KPI, กราฟ และตัวกรอง** จะรวมทั้งช่วง และ**ตัดข่าวซ้ำข้ามวัน**
  (ข่าวเดียวกันที่ปรากฏหลายวันนับเป็นชิ้นเดียว และติดป้าย "พบ N วัน")
- **บทสรุปผู้บริหารและแผนงาน** ยังคงแสดงของ **วันล่าสุดวันเดียว** พร้อมป้ายกำกับ
  เพราะบทวิเคราะห์เขียนขึ้นสำหรับวันเดียว การนำมาเฉลี่ยจะทำให้ข้อเสนอแนะเพี้ยน
- **Schedule ยังคงทำงานวันละครั้ง** และสร้างรายงานของวันล่าสุดวันเดียวเช่นเดิม
  การเลือกช่วงเป็นการรวมข้อมูลตอนแสดงผลเท่านั้น
- เก็บข้อมูลย้อนหลัง **31 วัน** (`RETENTION_DAYS`) รายงานที่เก่ากว่านั้นจะถูกลบอัตโนมัติ

### แหล่งข่าวโซเชียล

| แพลตฟอร์ม | สถานะ | เหตุผล |
|---|---|---|
| **Pantip** | ✅ ใช้งานได้ทันที | `robots.txt` อนุญาต (ห้ามเฉพาะ `/ads.php`) อ่านจาก `__NEXT_DATA__` |
| **Facebook** | ⚙️ ต้องตั้งค่า `FACEBOOK_PAGE_TOKEN` | `robots.txt` ระบุ `Disallow: /` — ห้าม crawl จึงใช้ Graph API เท่านั้น และเข้าถึงได้เฉพาะเพจที่บริษัทดูแล |
| **TikTok** | ⚙️ ต้องตั้งค่า `TIKTOK_ACCESS_TOKEN` | เนื้อหา render ด้วย JS + ToS จำกัดการ scrape จึงใช้ Display API เท่านั้น |

ทั้งสามแหล่งเป็น Tier 3 ติดป้าย "ยังไม่ยืนยัน" และ "โซเชียล" เสมอ
ระบบจะข้ามแหล่งที่ยังไม่ได้ตั้งค่าโดยไม่ทำให้ทั้ง Pipeline ล้ม

### สัญญาณอุปสงค์จากสภาพอากาศ

ใช้ **Open-Meteo** (ฟรี ไม่ต้องมี API key) ดึงพยากรณ์ 6 จังหวัดหลัก ถ่วงน้ำหนักตามความหนาแน่นของศูนย์บริการ

- **อากาศร้อน** → ใช้แอร์หนัก → คอยล์สกปรกเร็ว → ความต้องการล้างแอร์เพิ่ม
- **PM2.5 สูง** → ใส่ใจอากาศในห้องโดยสาร → ความต้องการล้างแอร์/ฟิลเตอร์เพิ่ม

ปรับเกณฑ์ได้ที่ `config/sources.yaml` → `weather.thresholds`
รายการเหล่านี้ติดป้าย "สัญญาณอุปสงค์" แยกจากข่าว และแยกตัวเลขจริงออกจากการตีความด้วย `[การตีความของระบบ]`

### ส่งรายงานเป็นไฟล์เดียว

รวม HTML + CSS + JS + ข้อมูล ไว้ในไฟล์ `.html` ไฟล์เดียว เปิดได้โดยไม่ต้องมีเซิร์ฟเวอร์
เหมาะกับการส่งให้ผู้บริหารทางอีเมล หรือเก็บเป็นสำเนาถาวรของวันนั้น (~110 KB)

```bash
npm run build:standalone                        # รายงานล่าสุด → dist/
npm run build:standalone -- 2026-07-21          # ระบุวันที่
npm run build:standalone -- --demo              # ติดแบนเนอร์ว่าเป็นข้อมูลตัวอย่าง
npm run build:standalone -- --fragment          # เอาเฉพาะเนื้อหาใน <body> (สำหรับฝังในหน้าอื่น)
```

ไฟล์ที่ได้ไม่เรียกไฟล์ภายนอกเลย และตัวสคริปต์จะตรวจไวยากรณ์ JS กับความถูกต้องของ JSON
ที่ฝังไปให้ก่อนเขียนไฟล์เสมอ

## 7. วิธีทดสอบ

```bash
npm test           # เทสต์ทั้งหมด (120 เทสต์)
npm run test:watch # โหมดติดตามการแก้ไข
npm run typecheck  # ตรวจ TypeScript
```

ครอบคลุม: URL normalization, deduplication, relevance scoring, schema validation,
date parsing (รวมปีพุทธศักราช), RSS/Atom parsing, source tier, HTML sanitization,
impact scoring, filter, empty state, API failure, invalid AI JSON, กฎ EV สองทาง
และ False Positive ของชื่อคู่แข่ง

---

## 8. วิธี Deploy

### GitHub Pages (แนะนำ)

1. Push โค้ดขึ้น GitHub
2. ไปที่ **Settings → Pages → Source** เลือก **GitHub Actions**
3. ไปที่ **Settings → Secrets and variables → Actions** เพิ่ม `ANTHROPIC_API_KEY`
4. รัน workflow **Daily Intelligence** ด้วยมือหนึ่งครั้งเพื่อสร้างข้อมูลชุดแรก
5. Dashboard จะอยู่ที่ `https://<username>.github.io/<repo>/`

### ทางเลือกอื่น

- **Cloudflare Pages / Netlify / Vercel** — ตั้ง output directory เป็น `public` ไม่ต้องมี build command
- **เว็บเซิร์ฟเวอร์ภายในบริษัท** — คัดลอกโฟลเดอร์ `public/` ไปวางได้เลย

### การควบคุมการเข้าถึง

Dashboard มีข้อมูลเชิงกลยุทธ์ หน้าเว็บตั้ง `noindex, nofollow` ไว้แล้ว แต่ยังเข้าถึงได้แบบสาธารณะ
หากต้องการจำกัดการเข้าถึง แนะนำตามลำดับความง่าย:

1. **Cloudflare Access** (ฟรีสำหรับทีมเล็ก) — ล็อกอินด้วยอีเมลบริษัท ไม่ต้องแก้โค้ด
2. **Netlify** — ตั้ง Password protection ในหน้า Site settings
3. **GitHub Pages + repo แบบ private** — ต้องใช้แผน Enterprise
4. **เว็บเซิร์ฟเวอร์ภายใน** — ใช้ Basic Auth ของ nginx/IIS

---

## 9. วิธีตั้ง Schedule

### GitHub Actions (ค่าเริ่มต้น)

ตั้งไว้แล้วที่ `.github/workflows/daily-intelligence.yml`

```yaml
on:
  schedule:
    - cron: '0 1 * * *'   # 01:00 UTC = 08:00 น. ไทย
  workflow_dispatch:       # สั่งรันด้วยมือได้
```

> **หมายเหตุ:** GitHub Actions **ไม่รองรับคีย์ `timezone`** ใน cron — ใช้ UTC เท่านั้น
> ประเทศไทยไม่มี Daylight Saving Time จึงตรงกับ 08:00 น. ตลอดทั้งปี

Workflow มี: concurrency lock, timeout 30 นาที, cache dependencies,
ตรวจว่ามีข้อมูลใหม่จริงก่อน commit, retry ตอน push, และอัปโหลด log เมื่อล้มเหลว

### Windows Task Scheduler (สำรอง)

```powershell
# เปิด PowerShell แบบ Run as Administrator
.\scripts\windows-task-scheduler.ps1 -Install
.\scripts\windows-task-scheduler.ps1 -RunNow      # ทดสอบ
.\scripts\windows-task-scheduler.ps1 -Uninstall
```

### Linux Cron

```cron
0 8 * * *  cd /path/to/air4-intelligence && /usr/bin/npm run daily >> logs/daily.log 2>&1
```

---

## 10. วิธีแก้ปัญหา

### Workflow ไม่ทำงาน

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| Schedule ไม่ยิงเลย | GitHub ปิด schedule อัตโนมัติเมื่อ repo ไม่มีกิจกรรม 60 วัน — สั่ง `workflow_dispatch` หนึ่งครั้ง |
| ยิงช้ากว่าเวลาที่ตั้ง | ปกติของ GitHub Actions (ล่าช้าได้ 5–15 นาทีตอนมีคนใช้เยอะ) |
| Push ล้มเหลว | ตรวจว่า `permissions: contents: write` ยังอยู่ใน workflow |
| Deploy ล้มเหลว | ตรวจว่า Settings → Pages → Source ตั้งเป็น **GitHub Actions** |

### แหล่งข่าวใช้ไม่ได้

```bash
npx tsx scripts/check-feeds.ts     # ดูว่าแหล่งไหนตาย
```

สถานะ `degraded` เป็นเรื่องปกติ — ระบบออกแบบให้ทำงานต่อกับแหล่งที่เหลือ
แหล่งที่ตายแล้วถูกบันทึกไว้ใน `config/sources.yaml` → `disabled_feeds` พร้อมเหตุผล

### ดู Log

- **GitHub Actions:** แท็บ Actions → เลือก run → ดู log ของแต่ละ step
- **เมื่อล้มเหลว:** ดาวน์โหลด artifact ชื่อ `run-log-<run_id>`
- **บน Dashboard:** ส่วน "สถานะระบบและแหล่งข่าว" ด้านล่างสุด
- **ในเครื่อง:** `LOG_LEVEL=debug npm run daily`

### Dashboard ขึ้นว่า "ยังไม่มีข้อมูลรายงาน"

เกิดจากเปิดไฟล์ด้วย `file://` โดยตรง — Dashboard ใช้ `fetch()` จึงต้องเปิดผ่านเซิร์ฟเวอร์
ใช้ `npm run serve` แทน

---

## 11. วิธีเปลี่ยน AI Model และควบคุมค่าใช้จ่าย

### เปลี่ยน Model

แก้ `AI_MODEL` ใน `.env` — ถ้าเปลี่ยน model ควรอัปเดตตาราง `PRICING`
ใน `src/ai/provider.ts` ด้วยเพื่อให้ตัวเลขค่าใช้จ่ายยังถูกต้อง

| Model | ราคา (input/output ต่อ 1M tokens) | เหมาะกับ |
|---|---|---|
| `claude-opus-4-8` (ค่าเริ่มต้น) | $5 / $25 | คุณภาพบทวิเคราะห์สูงสุด |
| `claude-sonnet-5` | $3 / $15 | สมดุลคุณภาพกับต้นทุน |
| `claude-haiku-4-5` | $1 / $5 | ประหยัดที่สุด |

### กลไกควบคุมค่าใช้จ่าย (มีอยู่แล้วในระบบ)

1. **Rule-based Prefilter** — ข่าวที่ไม่เกี่ยวข้องไม่ถูกส่งเข้า AI เลย (จาก ~780 เหลือ ~16)
2. **Deduplicate ก่อนวิเคราะห์** — ตัดข่าวซ้ำได้ราว 40–45%
3. **แคชผลวิเคราะห์** — ข่าวเดิมที่โผล่ซ้ำวันถัดไปไม่เสียค่า AI อีก (เก็บ 14 วัน)
4. **Prompt Caching** — บริบทธุรกิจที่คงที่ถูกแคชไว้ จ่ายเพียง ~10% ของราคาปกติ
5. **จำกัดความยาว** — `AI_MAX_INPUT_CHARS` ตัด snippet ก่อนส่ง
6. **`effort: low`** สำหรับรายข่าว, `high` เฉพาะสรุปรายวันวันละครั้ง
7. **`MAX_AI_ITEMS_PER_RUN`** — เพดานจำนวนข่าวต่อรอบ
8. **`AI_DAILY_BUDGET_USD`** — เกินงบแล้วสลับไปใช้กฎอัตโนมัติทันที
9. **บันทึกโทเคนและค่าใช้จ่าย** ทุกรอบ ดูได้บน Dashboard

> ประเมินคร่าว ๆ: ~16 ข่าว/วัน ด้วย Opus 4.8 ≈ **$0.10–0.30 ต่อวัน**
> (ราว $3–9 ต่อเดือน) ลดได้อีกโดยเปลี่ยนเป็น Sonnet

---

## 12. วิธีสำรองข้อมูล

ข้อมูลทั้งหมดเป็นไฟล์ JSON ใน `public/data/` และถูก commit ลง Git อยู่แล้ว
ประวัติทั้งหมดจึงอยู่ใน Git history

```bash
# สำรองด้วยมือ
cp -r public/data backup-$(date +%F)

# กู้คืนรายงานของวันใดวันหนึ่ง
git checkout <commit> -- public/data/reports/2026-07-21.json
```

ระบบเก็บย้อนหลังตาม `RETENTION_DAYS` (ค่าเริ่มต้น 120 วัน) แล้วลบไฟล์เก่าอัตโนมัติ
เพื่อไม่ให้ repository โตเกินไป — แต่ประวัติยังคงอยู่ใน Git

---

## 13. ข้อจำกัดของระบบ

1. **คุณภาพขึ้นกับแหล่งข่าว** — ระบบเห็นเฉพาะหัวข้อและเนื้อหาย่อจาก RSS ไม่ใช่บทความเต็ม
2. **บทวิเคราะห์คือการตีความ ไม่ใช่ข้อเท็จจริง** — ต้องตรวจข่าวต้นฉบับก่อนตัดสินใจสำคัญ
3. **ตลาดล้างแอร์รถยนต์เป็นตลาดเฉพาะทางมาก** — ข่าวตรงประเด็นมีน้อยโดยธรรมชาติ
   ข่าวส่วนใหญ่จึงเป็นสัญญาณทางอ้อม (ตลาดรถ, ศูนย์บริการ, คุณภาพอากาศ)
4. **คู่แข่งส่วนใหญ่เป็นบริษัทเล็กที่ไม่ค่อยมีข่าว** — สัญญาณคู่แข่งอาจว่างหลายวัน
   ช่องทางที่ได้ผลจริงคือข้อมูลจากทีมขายหน้างาน
5. **ไม่รองรับ Facebook/TikTok/LinkedIn** — แพลตฟอร์มเหล่านี้ไม่มี RSS สาธารณะ
   และต้องใช้ API ที่มีค่าใช้จ่าย
6. **ฟีดข่าวเปลี่ยน URL บ่อย** — ควรรัน `check-feeds.ts` เป็นระยะ
7. **การแปลชื่อข่าวเป็นไทย** ในโหมด rule-based จะไม่แปล (ใส่ `[EN]` นำหน้าแทน)
8. **ยังไม่มีระบบแจ้งเตือน** เมื่อ pipeline ล้มเหลว (นอกจากอีเมลของ GitHub Actions)

---

## 14. ลิขสิทธิ์ และ robots.txt

ระบบออกแบบให้เคารพสิทธิ์ของเจ้าของเนื้อหา:

- **เก็บเฉพาะ metadata** — หัวข้อข่าว, ชื่อสำนักข่าว, วันที่, URL และเนื้อหาย่อสั้น (≤600 ตัวอักษร)
  ที่ผู้เผยแพร่ตั้งใจเผยแพร่ผ่าน RSS อยู่แล้ว **ไม่เก็บบทความฉบับเต็ม**
- **บทสรุปเป็นข้อความที่สร้างใหม่** ไม่ใช่การคัดลอก
- **ไม่ข้าม Paywall** ทุกกรณี
- **เคารพ robots.txt** — ตรวจก่อนดึงทุกครั้ง (YouTube ถูกตัดออกเพราะ robots.txt ไม่อนุญาต)
- **จำกัดอัตราการเรียก** 1.2 วินาทีต่อโดเมน พร้อม timeout, retry และ exponential backoff
- **ระบุตัวตนชัดเจน** ผ่าน User-Agent ที่มีชื่อระบบและช่องทางติดต่อ
- **ลิงก์กลับต้นฉบับเสมอ** — Dashboard ส่งผู้อ่านไปยังสำนักข่าวเจ้าของข่าว

> การใช้งานภายในองค์กรเพื่อติดตามข่าวสาร (media monitoring) โดยเก็บเฉพาะ metadata
> และลิงก์กลับต้นทาง เป็นแนวปฏิบัติที่ยอมรับกันทั่วไป
> หากจะเผยแพร่ Dashboard สู่สาธารณะ ควรปรึกษาฝ่ายกฎหมายก่อน

---

## 15. โครงสร้างโปรเจกต์

```
air4-intelligence/
├── CLAUDE.md                    คู่มือสำหรับ AI agent
├── README.md
├── config/                      ปรับแต่งได้โดยไม่ต้องแก้โค้ด
│   ├── business-context.yaml    ข้อมูลบริษัท ผลิตภัณฑ์ ช่องทาง OKRs
│   ├── sources.yaml             แหล่งข่าว (+ รายการที่ตายแล้วพร้อมเหตุผล)
│   ├── keywords.yaml            คีย์เวิร์ด น้ำหนัก แบรนด์รถ
│   ├── competitors.yaml         คู่แข่งและกฎกัน False Positive
│   └── countries.yaml           ประเทศเป้าหมายและตลาดที่น่าสนใจ
├── prompts/                     Prompt ของ AI (แก้ได้โดยไม่ต้องแก้โค้ด)
├── src/
│   ├── collectors/              ดึงข่าว + HTTP client (retry/backoff/robots)
│   ├── parsers/                 RSS / Atom / RDF parser
│   ├── normalizers/             URL, วันที่ (รองรับ พ.ศ.), การทำให้เป็นมาตรฐาน
│   ├── deduplication/           ตัดข่าวซ้ำหลายสัญญาณ
│   ├── analysis/                prefilter, rule-based fallback, KPI
│   ├── ai/                      provider adapter, classifier, daily analysis
│   ├── storage/                 JSON storage + แคชผลวิเคราะห์
│   ├── security/                HTML/URL sanitization
│   └── index.ts                 Pipeline หลัก
├── public/                      Dashboard (static — deploy โฟลเดอร์นี้)
│   ├── index.html
│   ├── assets/{styles.css, app.js}
│   └── data/                    รายงาน JSON แยกตามวันที่
├── scripts/                     คำสั่งสำหรับผู้ดูแลระบบ
├── tests/                       120 เทสต์
└── .github/workflows/           Schedule + Deploy
```

---

## License

Internal use — บริษัท แอร์โฟร์อินเตอร์เนชั่นแนล จำกัด
