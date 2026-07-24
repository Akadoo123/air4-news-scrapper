# CLAUDE.md — คู่มือสำหรับ AI Agent ที่ทำงานกับ Repository นี้

## ระบบนี้คืออะไร

Air4 Daily Automotive Intelligence — ระบบอัตโนมัติที่ดึงข่าวยานยนต์จากแหล่งสาธารณะทุกวัน
คัดกรอง วิเคราะห์ผลกระทบต่อธุรกิจ แล้วสร้าง Executive Dashboard ภาษาไทย
สำหรับ บริษัท แอร์โฟร์อินเตอร์เนชั่นแนล จำกัด (ผู้ผลิตเครื่องล้างแอร์รถยนต์และน้ำยา)

## กฎสำคัญที่ห้ามละเมิด

1. **จัดประเภทข่าวตามผลกระทบต่อธุรกิจ ไม่ใช่ตามอารมณ์ของข่าว**
   ข่าวที่เขียนในเชิงบวกอาจเป็นลบต่อ Air4 และกลับกัน

2. **กฎ EV — ห้ามตัดสินอัตโนมัติ**
   EV เติบโต = บวกต่อ `AC_CLEANING` (รถ EV ยังต้องล้างแอร์) แต่ = ลบต่อ `POWER_FLOW` (ไม่มีหัวฉีด)
   ต้องประเมินผลกระทบสุทธิเสมอ ถ้าสมดุลให้เป็น `neutral`
   มีเทสต์คุมกฎนี้ที่ `tests/analysis.test.ts` → `describe('EV dual-impact rule')`

3. **False Positive ของชื่อคู่แข่ง**
   `Wizard`, `Wise`, `Fresh Air` เป็นคำทั่วไป ต้องมีบริบทยานยนต์ประกอบเสมอ
   มีเทสต์คุมที่ `tests/prefilter.test.ts` และ `tests/separation.test.ts`
   **ห้ามปรับน้ำหนักคะแนนโดยไม่รัน `tests/separation.test.ts`**

4. **ระบบต้องไม่ล้มทั้งหมดเมื่อบางแหล่งข่าวใช้ไม่ได้**
   ทุก collector ต้อง `try/catch` แล้วบันทึกลง `RunErrors` เสมอ
   สถานะ `degraded` เป็นเรื่องปกติ ไม่ใช่ความล้มเหลว

5. **ความปลอดภัยของข้อความจากภายนอก**
   - ทุกข้อความต้องผ่าน `src/security/sanitize.ts` ก่อนเก็บและก่อนแสดง
   - Dashboard สร้าง DOM ด้วย `createElement`/`textContent` เท่านั้น **ห้ามใช้ `innerHTML`**
   - ลิงก์ภายนอกต้องผ่าน `safeLink()` (บังคับ http/https + `noopener noreferrer`)

6. **ห้าม commit secret** — API key อยู่ใน `.env` (ถูก gitignore) หรือ GitHub Secrets เท่านั้น

## สถาปัตยกรรม (ลำดับการไหลของข้อมูล)

```
collectors/  ดึง RSS/Atom + Google News + NewsAPI (ถ้ามี key)
    ↓
normalizers/ sanitize → canonical URL → content hash → prefilter scoring
    ↓
deduplication/ รวมข่าวซ้ำ 4 สัญญาณ (URL / hash / title / summary + วันที่ใกล้กัน)
    ↓
analysis/prefilter  ประตูคุมต้นทุน AI + กัน False Positive  ← ข่าวที่ต่ำกว่าเกณฑ์ไม่เข้า AI
    ↓
ai/classify     วิเคราะห์รายข่าว (Structured Output + Zod)
ai/dailyAnalysis สรุปภาพรวมรายวัน (adaptive thinking)
    ↓  ถ้าล้มเหลว → analysis/fallback.ts (rule-based, ทำงานได้โดยไม่ต้องมี API key)
storage/store   JSON แยกตามวันที่ + แคชผลวิเคราะห์
    ↓
public/         Dashboard แบบ static (vanilla JS)
```

จุดเข้าหลัก: `src/index.ts` → `runPipeline()`

## คำสั่งที่ใช้บ่อย

```bash
npm test                  # เทสต์ทั้งหมด (ต้องผ่าน 100% ก่อน commit)
npm run typecheck         # ตรวจ TypeScript
npm run mock              # รันด้วยข้อมูลจำลอง ไม่แตะเครือข่าย ไม่เสียค่า AI
npm run collect           # ดึงข่าวจริง + ตรวจสุขภาพแหล่งข่าว (ไม่วิเคราะห์)
npm run daily             # รันเต็มระบบ
npm run daily -- --no-ai  # รันเต็มระบบแบบไม่ใช้ AI
npm run serve             # เปิด Dashboard ที่ http://localhost:4173
npx tsx scripts/check-feeds.ts   # ตรวจว่าฟีดไหนตายแล้ว
```

## เมื่อจะแก้ไขสิ่งเหล่านี้ ให้ระวัง

| แก้ไขอะไร | ต้องทำอะไรเพิ่ม |
|---|---|
| น้ำหนักคะแนนใน `config/keywords.yaml` | รัน `tests/separation.test.ts` — ต้องยังแยก signal/noise ได้ |
| เกณฑ์ dedup ใน `dedupe.ts` | ค่าปัจจุบันปรับจากการวัดจริง (ข่าวซ้ำ 0.40–0.50, ข่าวต่างกัน ≤0.22) |
| Zod schema ใน `types.ts` | ข้อมูลเก่าใน `public/data/` อาจไม่ผ่าน schema — พิจารณา migration |
| เพิ่มแหล่งข่าว | ตรวจด้วย `check-feeds.ts` ก่อนเสมอ อย่าเดา URL |
| Prompt ใน `prompts/` | ต้องคง JSON schema เดิม ไม่งั้น validation ล้มแล้วตกไป fallback |

## หมายเหตุเฉพาะทาง

- **ภาษาไทยไม่มีช่องว่างระหว่างคำ** — การจับคู่ข้อความจึงใช้ตัวอักษร trigram ไม่ใช่ token
  และการเทียบคำต้องใช้ `includes()` ไม่ใช่ `\b` (ดู `contains()` ใน `prefilter.ts`)
- **ชื่อแบรนด์รถต้องมี alias ภาษาไทย** (โตโยต้า/อีซูซุ) ไม่งั้นจะตรวจไม่เจอในข่าวไทยเลย
- **GitHub Actions ไม่มีคีย์ `timezone`** — cron เป็น UTC เท่านั้น
  `0 1 * * *` UTC = 08:00 น. ไทย (ไทยไม่มี DST จึงตรงทั้งปี)
- **Windows Task Scheduler มีกับดัก 3 อย่าง** (เจอจริงตอนติดตั้ง)
  1. `New-ScheduledTaskSettingsSet` ตั้งค่าเริ่มต้นเป็น **ห้ามรันบนแบตเตอรี่**
     งานจะค้างสถานะ `Queued` แล้วไม่รันเลยแบบเงียบ ๆ
     ต้องใส่ `-AllowStartIfOnBatteries -DontStopIfGoingOnBatteries`
  2. อย่าส่งคำสั่งยาวเข้า `powershell.exe -Command "..."` เพราะพาธโปรเจกต์มีช่องว่าง
     เครื่องหมายคำพูดจะซ้อนกันแล้วพังทันที — ใช้ `scripts/run-daily.cmd` แทน
  3. ไฟล์ `.ps1` ที่มีภาษาไทย **ต้องมี UTF-8 BOM** ไม่งั้น Windows PowerShell 5.1
     จะอ่านเป็น ANSI แล้ว parse error
  ตรวจว่างานทำงานจริงด้วย `-Status` และดู `logs/daily.log` — อย่าเชื่อแค่ว่า register สำเร็จ
- **การฝังไฟล์ต้องใช้ function replacer เสมอ** — `str.replace(needle, payload)` แบบส่ง string
  จะตีความ `$'` เป็นสัญลักษณ์พิเศษ และ `app.js` มี `'…ประมาณ $'` (สัญลักษณ์เงินดอลลาร์)
  ทำให้ JS ที่ฝังเสียหายแบบเงียบ ๆ ใช้ `str.replace(needle, () => payload)` แทน
  (มีเทสต์คุมที่ `tests/standalone.test.ts`)
- **แหล่งข่าวโซเชียลถูกกำหนดโดย robots.txt จริง ไม่ใช่ความสะดวก**
  Pantip อนุญาต (ห้ามเฉพาะ `/ads.php`) → ดึงตรงจาก `__NEXT_DATA__` ได้
  Facebook ระบุ `User-agent: *` + `Disallow: /` → **ห้าม scrape** ใช้ Graph API เท่านั้น
  TikTok บล็อก AI bot + เนื้อหา render ด้วย JS → ใช้ Display API เท่านั้น
- **Pantip: ใช้ `tags` ไม่ใช่ `searches`** — หน้าค้นหาเรียงตามความเกี่ยวข้อง
  ไม่ใช่ตามเวลา และไม่มีพารามิเตอร์ให้เรียงตามวันที่ ผลที่ได้จึงเป็นกระทู้อายุ 200–350 วัน
- **snippet ของ social ต้องเป็นเนื้อหาจริง ห้ามใส่ boilerplate เหมือนกันทุกชิ้น**
  prefilter ให้คะแนนจาก `title + snippet` → ถ้าใส่คำค้นลงไป ทุกกระทู้ได้คะแนนเต็ม
  และ dedupe เทียบ summary similarity → ถ้าเหมือนกันหมดจะยุบเหลือชิ้นเดียว
  (เคยเกิดทั้งสองกรณีจริง มีเทสต์คุมที่ `tests/social.test.ts`)
- **Pantip ส่งเวลามา 2 รูปแบบ** — ISO (หน้าแท็ก) และ Unix epoch วินาที (หน้าค้นหา)
  ใช้ `parsePantipTime()` ไม่ใช่ `parseDate()` ตรง ๆ
- **โซเชียลมีหน้าต่างเวลาของตัวเอง** `SOCIAL_LOOKBACK_HOURS` (720 ชม.)
  เพราะกระทู้เก่ายังสะท้อนความต้องการลูกค้าได้ ต่างจากข่าวที่ตกไปใน 2 วัน
- **สัญญาณอุปสงค์จากอากาศ (`itemKind: 'signal'`)** ไม่ใช่ข่าว — ต้องแยกข้อเท็จจริง
  (ตัวเลขจาก Open-Meteo) ออกจากการตีความด้วยป้าย `[การตีความของระบบ]` เสมอ
- **Dashboard รองรับช่วงวันที่** — รวมข่าวข้ามวันและตัดข่าวซ้ำใน `public/assets/aggregate.js`
  แต่บทวิเคราะห์รายวัน (สรุปผู้บริหาร/แผนงาน) ยังคงใช้ของ **วันล่าสุดวันเดียว** เสมอ
  เพราะเขียนขึ้นสำหรับวันเดียว ถ้านำมาเฉลี่ยจะทำให้ข้อเสนอแนะเพี้ยน
- **ข้อความบน UI ต้องผ่าน `t()` เสมอ ห้าม hardcode ภาษาไทยใน `app.js`**
  คีย์อยู่ใน `public/assets/i18n.js` และต้องมีครบทั้ง `th` และ `en`
  มีเทสต์คุมที่ `tests/i18n.test.ts` — ตรวจทั้งคีย์ที่ขาด คีย์ที่ไม่ได้ใช้ และตัวแปร `{…}` ที่ไม่ตรงกัน
  ข้อความคงที่ใน HTML ใช้ `data-i18n="key"` / `data-i18n-attr="attr:key"`
- **บทวิเคราะห์เป็นภาษาไทยภาษาเดียว** (AI สร้างเป็นไทย) โหมด EN จะสลับไปใช้ `titleOriginal`
  ห้ามแปลบทวิเคราะห์ฝั่ง client เพราะจะกลายเป็นการแต่งเนื้อหาที่ AI ไม่ได้เขียน
- **รายการที่บันทึกไว้เก็บสำเนาข่าวเต็ม ไม่ใช่แค่ id** — ข้อมูลเก่ากว่า 31 วันถูกลบตาม
  `RETENTION_DAYS` ถ้าเก็บแค่ id รายการที่ผู้ใช้บันทึกจะหายไปเอง
- **Dashboard รองรับทั้งธีมสว่างและมืด** ผ่าน CSS custom properties
  สีของกราฟอยู่ใน CSS (`.trend__*`) ไม่ใช่ใน JS เพื่อให้เปลี่ยนตามธีมได้
- Model เริ่มต้นคือ `claude-haiku-4-5` (เลือกเพื่อคุมต้นทุน ~$2-3/เดือน) ใช้ `effort: low`
  สำหรับรายข่าว และ `effort: high` + adaptive thinking สำหรับสรุปรายวัน
  เปลี่ยน model ได้ที่ `AI_MODEL` (env/Secret) หรือแก้ default ใน `config.ts`
  ถ้าใส่ model ใหม่ อย่าลืมเพิ่มราคาใน `PRICING` (`src/ai/provider.ts`) ไม่งั้นจะคิดเป็นราคา opus
