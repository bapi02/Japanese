#!/usr/bin/env node
// 화면 확인용 샘플 데이터 생성기. 실제 시세가 아니며 payload.source = 'sample' 로 표시된다.
// 실데이터는 collect.mjs(Actions) 또는 Worker 라이브 조회가 채운다.
//   node flights/scripts/make-sample.mjs [기준일 YYYY-MM-DD] [--cabins=ECONOMY,BUSINESS]

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTripPlans, DEFAULTS, DEFAULT_DEST_CODES, DESTINATIONS, PATTERNS, CABINS, ORIGIN } from '../lib/config.mjs';
import { calendarContext } from '../lib/holidays.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'data/prices.json');
const args = process.argv.slice(2);
const dateArg = args.find(a => /^\d{4}-\d\d-\d\d$/.test(a));
const cabinArg = args.find(a => a.startsWith('--cabins='));
const today = dateArg ? new Date(dateArg + 'T00:00:00Z') : new Date();
const collectCabins = cabinArg ? cabinArg.slice(9).split(',') : DEFAULTS.collectCabins;

// 노선별 대략적인 왕복 기본가(원)와 편명·소요시간 — 샘플용 근사치.
const ROUTE = {
  NRT: { base: 330000, out: ['OZ102', '07:55'], min: 140 },
  HND: { base: 360000, out: ['OZ1045', '08:05'], min: 135 },
  KIX: { base: 285000, out: ['OZ112', '08:00'], min: 105 },
  FUK: { base: 245000, out: ['OZ132', '08:20'], min: 75 },
  NGO: { base: 300000, out: ['OZ122', '08:30'], min: 110 },
  CTS: { base: 420000, out: ['OZ172', '08:10'], min: 170 },
  OKA: { base: 395000, out: ['OZ170', '07:40'], min: 140 },
};
const DEST_CODES = DEFAULT_DEST_CODES.filter(c => ROUTE[c]);
const BIZ_RATIO = { NRT: 3.2, HND: 3.0, KIX: 3.4, FUK: 3.6, NGO: 3.3, CTS: 2.9, OKA: 3.1 };

// 결정적 난수 (파일이 매번 흔들리지 않게)
function rng(seed) {
  let h = 2166136261;
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

const addMinutes = (hhmm, min) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

const notQueried = () => ({ price: null, offerCount: 0, offers: [], notQueried: true });

const plans = buildTripPlans({ destCodes: DEST_CODES, weeks: DEFAULTS.weeks, today });
const trips = [];

for (const plan of plans) {
  const r = ROUTE[plan.dest];
  const rand = rng(plan.id);
  const cal = calendarContext(plan.depDate, plan.retDate);

  let mult = 1;
  mult += ({ SAT_SUN: 0, FRI_SUN: 0.10, SAT_MON: 0.07, FRI_MON: 0.18 })[plan.pattern];
  mult += cal.kr.length ? 0.28 + 0.06 * cal.kr.length : 0;
  mult += cal.jp.length ? 0.10 : 0;
  mult += cal.seasons.reduce((s, x) => s + x.weight * 0.055, 0);
  const dday = Math.round((new Date(plan.depDate + 'T00:00:00Z') - today) / 86400000);
  if (dday <= 21) mult += (21 - dday) * 0.012;
  mult *= 0.88 + rand() * 0.3;

  const trip = { ...plan, currency: 'KRW' };
  // 조회하지 않은 좌석등급은 '없음'이 아니라 '아직 안 봄'으로 남긴다.
  for (const c of CABINS) if (!collectCabins.includes(c.id)) trip[c.key] = notQueried();

  // 그 시간대에 조합이 아예 없는 경우
  if (rand() < 0.10) {
    for (const c of CABINS) {
      if (collectCabins.includes(c.id)) trip[c.key] = { price: null, offerCount: 0, offers: [], insights: null };
    }
    trips.push(trip);
    continue;
  }

  for (const cabin of CABINS) {
    if (!collectCabins.includes(cabin.id)) continue;
    const isBiz = cabin.id === 'BUSINESS';
    if (isBiz && rand() < 0.22) {
      trip[cabin.key] = { price: null, offerCount: 0, offers: [], insights: null };
      continue;
    }
    const ratio = isBiz ? BIZ_RATIO[plan.dest] * (0.88 + rand() * 0.34) * (mult > 1.35 ? 1.12 : 1) : 1;
    const count = isBiz ? 1 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3);

    const offers = [];
    for (let i = 0; i < count; i++) {
      const price = Math.round((r.base * mult * ratio * (1 + i * 0.14)) / 100) * 100;
      const depTime = i === 0 ? r.out[1] : addMinutes(r.out[1], -35 + i * 25);
      offers.push({
        price, currency: 'KRW', seats: null,
        out: {
          carrier: 'OZ', carrierName: '아시아나항공', operating: 'OZ',
          number: r.out[0], from: ORIGIN, to: plan.dest,
          depAt: `${plan.depDate}T${depTime}:00`,
          arrAt: `${plan.depDate}T${addMinutes(depTime, r.min)}:00`,
          depTime, arrTime: addMinutes(depTime, r.min), minutes: r.min,
          aircraft: 'Airbus A321neo', cabin: isBiz ? 'Business' : 'Economy',
          legroom: isBiz ? '107 cm' : '79 cm',
          oftenDelayed: rand() < 0.08,
        },
        ret: null,
        departureToken: `sample-${plan.id}-${cabin.id}-${i}`,
        totalMinutes: r.min * 2,
      });
    }
    offers.sort((a, b) => a.price - b.price);
    const base = r.base * ratio;
    // 지난 수집 대비 미리보기: 약 절반의 조합에 ±5~18% 변화를 심는다
    const drift = rand();
    const prevPrice = drift < 0.55
      ? Math.round(offers[0].price / (1 + (drift - 0.27) * 0.6) / 100) * 100
      : null;
    const prevAt = new Date(today);
    prevAt.setUTCDate(prevAt.getUTCDate() - 7);
    trip[cabin.key] = {
      price: offers[0].price,
      offerCount: offers.length,
      offers,
      ...(prevPrice && Math.abs(offers[0].price - prevPrice) / prevPrice >= 0.04
        ? { prevPrice, prevAt: prevAt.toISOString() } : {}),
      insights: {
        level: mult > 1.45 ? 'high' : mult < 1.05 ? 'low' : 'typical',
        lowest: offers[0].price,
        typicalLow: Math.round(base * 0.95 / 1000) * 1000,
        typicalHigh: Math.round(base * 1.55 / 1000) * 1000,
      },
    };
  }
  trips.push(trip);
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: 'sample',
  note: '화면 확인용 예시 데이터입니다. 실제 판매가가 아닙니다.',
  currency: 'KRW',
  params: {
    origin: ORIGIN, carriers: DEFAULTS.carriers, nonStop: true,
    adults: 1, cabins: collectCabins, viewableCabins: DEFAULTS.cabins,
    provider: 'serpapi-google-flights',
    depWindow: DEFAULTS.depWindow, retWindow: DEFAULTS.retWindow,
    weeks: DEFAULTS.weeks, patterns: PATTERNS.map(p => p.id),
  },
  destinations: DESTINATIONS.filter(d => DEST_CODES.includes(d.code)),
  patterns: PATTERNS,
  cabinsMeta: CABINS,
  trips,
  errors: [],
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(payload) + '\n', 'utf8');
const per = CABINS.map(c => `${c.ko} ${trips.filter(t => t[c.key]?.price).length}`).join(' / ');
console.log(`샘플 생성: ${trips.length}조합 (${per}) · 수집등급 ${collectCabins.join(',')} -> ${OUT}`);
