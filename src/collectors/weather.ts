import { env, loadSources } from '../config.js';
import { logger, type RunErrors } from '../logger.js';
import { fetchText } from './http.js';
import type { RawItem, SourceHealth } from '../types.js';

/* ============================================================
 * Weather / Air-quality demand signals
 *
 * ไม่ใช่ "ข่าว" แต่เป็นสัญญาณอุปสงค์ (demand signal) ที่มีผลโดยตรงกับ Air4:
 *   - อากาศร้อนจัด    → คนใช้แอร์หนัก → ระบบแอร์สกปรกเร็ว → ความต้องการล้างแอร์เพิ่ม
 *   - PM2.5 สูง       → คนใส่ใจอากาศในห้องโดยสาร → ความต้องการล้างแอร์/ฟิลเตอร์เพิ่ม
 *
 * ใช้ Open-Meteo: ฟรี ไม่ต้องใช้ API key ไม่จำกัดสำหรับการใช้งานทั่วไป
 * ตัวเลขทั้งหมดเป็นข้อเท็จจริงจาก API ส่วนการตีความทางธุรกิจถูกระบุแยกให้ชัด
 * ========================================================== */

export interface WeatherCity {
  id: string;
  name_th: string;
  lat: number;
  lon: number;
  /** ความสำคัญเชิงธุรกิจ — ใช้ถ่วงน้ำหนักค่าเฉลี่ย (ศูนย์บริการหนาแน่นกว่า = สำคัญกว่า) */
  weight: number;
}

interface DailyForecast {
  date: string;
  tempMax: number;
  feelsLikeMax: number;
}

interface CityForecast {
  city: WeatherCity;
  days: DailyForecast[];
  pm25Max: number | null;
}

const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const AIR_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/** เกณฑ์ตีความ — ปรับได้ใน config/sources.yaml */
export interface WeatherThresholds {
  heat_strong: number;
  heat_moderate: number;
  pm25_unhealthy: number;
  pm25_moderate: number;
  forecast_days: number;
}

export const DEFAULT_THRESHOLDS: WeatherThresholds = {
  heat_strong: 40,
  heat_moderate: 36,
  pm25_unhealthy: 50,
  pm25_moderate: 37.5,
  forecast_days: 7,
};

async function fetchCity(
  city: WeatherCity,
  thresholds: WeatherThresholds,
): Promise<CityForecast> {
  const fUrl = new URL(FORECAST_API);
  fUrl.searchParams.set('latitude', String(city.lat));
  fUrl.searchParams.set('longitude', String(city.lon));
  fUrl.searchParams.set('daily', 'temperature_2m_max,apparent_temperature_max');
  fUrl.searchParams.set('timezone', env.timezone);
  fUrl.searchParams.set('forecast_days', String(thresholds.forecast_days));

  const raw = await fetchText(fUrl.toString(), { accept: 'application/json' });
  const json = JSON.parse(raw) as {
    daily?: { time?: string[]; temperature_2m_max?: number[]; apparent_temperature_max?: number[] };
  };

  const time = json.daily?.time ?? [];
  const tmax = json.daily?.temperature_2m_max ?? [];
  const feels = json.daily?.apparent_temperature_max ?? [];

  const days: DailyForecast[] = time.map((d, i) => ({
    date: d,
    tempMax: Number(tmax[i]),
    feelsLikeMax: Number(feels[i] ?? tmax[i]),
  })).filter((d) => Number.isFinite(d.tempMax));

  // PM2.5 เป็นข้อมูลเสริม — ถ้าดึงไม่ได้ก็ยังใช้สัญญาณความร้อนต่อได้
  let pm25Max: number | null = null;
  try {
    const aUrl = new URL(AIR_API);
    aUrl.searchParams.set('latitude', String(city.lat));
    aUrl.searchParams.set('longitude', String(city.lon));
    aUrl.searchParams.set('hourly', 'pm2_5');
    aUrl.searchParams.set('timezone', env.timezone);
    aUrl.searchParams.set('forecast_days', '3');
    const aRaw = await fetchText(aUrl.toString(), { accept: 'application/json' });
    const aJson = JSON.parse(aRaw) as { hourly?: { pm2_5?: (number | null)[] } };
    const values = (aJson.hourly?.pm2_5 ?? []).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    );
    if (values.length) pm25Max = Math.max(...values);
  } catch (err) {
    logger.debug({ city: city.id, err: String(err) }, 'air quality fetch failed');
  }

  return { city, days, pm25Max };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function weightedAvg(pairs: Array<{ value: number; weight: number }>): number {
  const totalW = pairs.reduce((s, p) => s + p.weight, 0);
  if (totalW === 0) return 0;
  return pairs.reduce((s, p) => s + p.value * p.weight, 0) / totalW;
}

/**
 * แปลงพยากรณ์อากาศเป็นสัญญาณอุปสงค์ 0–2 รายการ (ความร้อน / PM2.5)
 * แยกออกจาก fetch เพื่อให้ทดสอบได้โดยไม่ต้องต่อเครือข่าย
 */
export function buildWeatherSignals(
  forecasts: CityForecast[],
  thresholds: WeatherThresholds = DEFAULT_THRESHOLDS,
  now: Date = new Date(),
): RawItem[] {
  const items: RawItem[] = [];
  const usable = forecasts.filter((f) => f.days.length > 0);
  if (!usable.length) return items;

  /* ---------- 1) สัญญาณความร้อน ---------- */
  const cityPeaks = usable.map((f) => ({
    city: f.city,
    // ใช้ "อุณหภูมิที่รู้สึกได้" เพราะสะท้อนภาระการทำงานของระบบแอร์ได้ตรงกว่า
    peak: Math.max(...f.days.map((d) => d.feelsLikeMax)),
    avg: f.days.reduce((s, d) => s + d.feelsLikeMax, 0) / f.days.length,
  }));

  const avgFeels = weightedAvg(cityPeaks.map((c) => ({ value: c.avg, weight: c.city.weight })));
  const hottest = cityPeaks.reduce((a, b) => (b.peak > a.peak ? b : a));

  if (avgFeels >= thresholds.heat_moderate) {
    const strong = avgFeels >= thresholds.heat_strong;
    const cityList = cityPeaks
      .slice()
      .sort((a, b) => b.peak - a.peak)
      .slice(0, 4)
      .map((c) => `${c.city.name_th} ${round1(c.peak)}°C`)
      .join(' · ');

    items.push({
      title:
        `${strong ? 'อากาศร้อนจัด' : 'อากาศร้อน'}: อุณหภูมิที่รู้สึกได้สูงสุดเฉลี่ย ` +
        `${round1(avgFeels)}°C ใน ${thresholds.forecast_days} วันข้างหน้า — ` +
        `ปัจจัยหนุนความต้องการล้างแอร์รถยนต์`,
      link: 'https://open-meteo.com/',
      snippet:
        `ข้อมูลพยากรณ์: อุณหภูมิที่รู้สึกได้สูงสุดรายเมือง ${cityList}. ` +
        `ค่าเฉลี่ยถ่วงน้ำหนักตามความหนาแน่นของศูนย์บริการอยู่ที่ ${round1(avgFeels)}°C ` +
        `จุดสูงสุดอยู่ที่ ${hottest.city.name_th} ${round1(hottest.peak)}°C. ` +
        `[การตีความของระบบ] อากาศร้อนทำให้ผู้ใช้รถเปิดแอร์หนักและนานขึ้น ` +
        `คอยล์เย็นสะสมความชื้นและสิ่งสกปรกเร็วขึ้น มักตามมาด้วยอาการแอร์ไม่เย็นและกลิ่นอับ ` +
        `ซึ่งเป็นช่วงที่ความต้องการบริการล้างแอร์รถยนต์สูงขึ้นตามฤดูกาล`,
      publishedAt: now.toISOString(),
      sourceId: 'weather-signal',
      sourceName: 'Open-Meteo (พยากรณ์อากาศ)',
      sourceTier: 1,
      sourceCountry: 'TH',
      language: 'th',
      unverified: false,
      itemKind: 'signal',
    });
  }

  /* ---------- 2) สัญญาณ PM2.5 ---------- */
  const pmCities = usable.filter((f) => f.pm25Max !== null);
  if (pmCities.length) {
    const avgPm = weightedAvg(
      pmCities.map((f) => ({ value: f.pm25Max as number, weight: f.city.weight })),
    );
    const worst = pmCities.reduce((a, b) =>
      (b.pm25Max as number) > (a.pm25Max as number) ? b : a,
    );

    if (avgPm >= thresholds.pm25_moderate) {
      const unhealthy = avgPm >= thresholds.pm25_unhealthy;
      items.push({
        title:
          `ฝุ่น PM2.5 ${unhealthy ? 'สูงถึงระดับมีผลต่อสุขภาพ' : 'สูงกว่าเกณฑ์ปกติ'}: ` +
          `ค่าสูงสุดเฉลี่ย ${round1(avgPm)} µg/m³ — ` +
          `หนุนความต้องการดูแลคุณภาพอากาศในห้องโดยสารรถยนต์`,
        link: 'https://open-meteo.com/en/docs/air-quality-api',
        snippet:
          `ข้อมูลพยากรณ์คุณภาพอากาศ 3 วันข้างหน้า: ค่า PM2.5 สูงสุดเฉลี่ย ${round1(avgPm)} µg/m³ ` +
          `พื้นที่ที่สูงที่สุดคือ ${worst.city.name_th} ${round1(worst.pm25Max as number)} µg/m³. ` +
          `[การตีความของระบบ] ช่วงที่ฝุ่นสูง ผู้ใช้รถให้ความสำคัญกับอากาศในห้องโดยสารมากขึ้น ` +
          `เป็นจังหวะที่เหมาะกับการสื่อสารเรื่องการล้างแอร์รถยนต์และการเปลี่ยนฟิลเตอร์`,
        publishedAt: now.toISOString(),
        sourceId: 'weather-signal',
        sourceName: 'Open-Meteo (คุณภาพอากาศ)',
        sourceTier: 1,
        sourceCountry: 'TH',
        language: 'th',
        unverified: false,
        itemKind: 'signal',
      });
    }
  }

  return items;
}

/** ดึงพยากรณ์อากาศทุกเมืองแล้วสร้างสัญญาณอุปสงค์ */
export async function collectWeatherSignals(
  errors: RunErrors,
): Promise<{ items: RawItem[]; health: SourceHealth[] }> {
  const cfg = loadSources().weather;
  const started = Date.now();

  if (!cfg?.enabled) {
    return { items: [], health: [] };
  }

  const thresholds: WeatherThresholds = { ...DEFAULT_THRESHOLDS, ...(cfg.thresholds ?? {}) };
  const results = await Promise.allSettled(
    cfg.cities.map((c) => fetchCity(c, thresholds)),
  );

  const forecasts: CityForecast[] = [];
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') forecasts.push(r.value);
    else {
      failed++;
      errors.capture(`weather:${cfg.cities[i].id}`, r.reason);
    }
  });

  const items = buildWeatherSignals(forecasts, thresholds);
  logger.info(
    { cities: forecasts.length, failed, signals: items.length },
    'weather signals built',
  );

  return {
    items,
    health: [
      {
        sourceId: 'weather-signal',
        sourceName: 'Open-Meteo (พยากรณ์อากาศ / คุณภาพอากาศ)',
        ok: forecasts.length > 0,
        itemCount: items.length,
        durationMs: Date.now() - started,
        error: failed > 0 ? `${failed}/${cfg.cities.length} เมืองดึงข้อมูลไม่สำเร็จ` : undefined,
      },
    ],
  };
}
