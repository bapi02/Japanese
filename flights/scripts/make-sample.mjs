#!/usr/bin/env node
// 화면 확인용 샘플 데이터 생성기. 실제 시세가 아니며 payload.source = 'sample' 로 표시된다.
// 실데이터는 collect.mjs(Actions) 또는 Worker 라이브 조회가 채운다.
//   node flights/scripts/make-sample.mjs [기준일 YYYY-MM-DD]

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTripPlans, DEFAULTS, DESTINATIONS, PATTERNS, CABINS, ORIGIN } from '../lib/config.mjs';
import { calendarContext } from '../lib/holidays.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'data/prices.json');
const today = process.argv[2] ? new Date(process.argv[2] + 'T00:00:00Z') : new Date();

// 노선별 대략적인 왕복 기본가(원)와 편명·소요시간 — 샘플용 근사치.
const ROUTE = {
  NRT: { base: 330000, out: ['OZ102', '07:55'], ret: ['OZ103', '19:20'], min: 140 },
  HND: { base: 360000, out: ['OZ1045', '08:05'], ret: ['OZ1046', '18:45'], min: 135 },
  KIX: { base: 285000, out: ['OZ112', '08:00'], ret: ['OZ113', '19:05'], min: 105 },
  FUK: { base: 245000, out: ['OZ132', '08:20'], ret: ['OZ133', '18:30'], min: 75 },
  NGO: { base: 300000, out: ['OZ122', '08:30'], ret: ['OZ123', '18:55'], min: 110 },
  CTS: { base: 420000, out: ['OZ172', '08:10'], ret: ['OZ173', '18:20'], min: 170 },
  OKA: { base: 395000, out: ['OZ170', '07:40'], ret: ['OZ171', '19:40'], min: 140 },
};
const DEST_CODES = Object.keys(ROUTE);
const Y_CLASSES = ['T', 'E', 'S', 'V', 'Q', 'N', 'L', 'K', 'H', 'M', 'B', 'Y'];
const C_CLASSES = ['Z', 'I', 'D', 'C', 'J'];
// 노선별 비즈니스 배수 (이코노미 대비) — 단거리 일본 노선 근사치
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

  // 아주 가끔은 그 시간대 조합이 아예 없다고 둔다.
  if (rand() < 0.07) {
    const blank = { ...plan, currency: 'KRW' };
    for (const c of CABINS) blank[c.key] = { price: null, offerCount: 0, offers: [] };
    trips.push(blank);
    continue;
  }

  const seats = mult > 1.45 ? 1 + Math.floor(rand() * 3) : 3 + Math.floor(rand() * 7);
  const trip = { ...plan, currency: 'KRW' };

  const mkLeg = (num, from, to, date, depHHMM, cls) => ({
    carrier: 'OZ', carrierName: '아시아나항공', operating: 'OZ',
    number: num, from, to,
    depAt: `${date}T${depHHMM}:00`,
    arrAt: `${date}T${addMinutes(depHHMM, r.min)}:00`,
    depTime: depHHMM, arrTime: addMinutes(depHHMM, r.min), minutes: r.min,
    aircraft: 'AIRBUS A321NEO', cabin: cls.cabin, bookingClass: cls.code, brandedFare: null,
  });

  for (const cabin of CABINS) {
    const isBiz = cabin.id === 'BUSINESS';
    // 비즈니스는 좌석 수 자체가 적어 그 시간대에 아예 안 남는 경우가 잦다.
    if (isBiz && rand() < 0.22) {
      trip[cabin.key] = { price: null, offerCount: 0, offers: [] };
      continue;
    }
    // 성수기·연휴에는 비즈니스 배수가 더 벌어진다.
    const ratio = isBiz ? BIZ_RATIO[plan.dest] * (0.88 + rand() * 0.34) * (mult > 1.35 ? 1.12 : 1) : 1;
    const pool = isBiz ? C_CLASSES : Y_CLASSES;
    const tier = Math.min(pool.length - 1, Math.floor((mult - 0.85) * (isBiz ? 3.5 : 9)));
    const seatBase = isBiz ? Math.max(1, Math.round(seats / 3)) : seats;
    const count = isBiz ? 1 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3);

    const offers = [];
    for (let i = 0; i < count; i++) {
      const price = Math.round((r.base * mult * ratio * (1 + i * 0.14)) / 100) * 100;
      const outDep = i === 0 ? r.out[1] : addMinutes(r.out[1], -35 + i * 25);
      const retDep = i === 0 ? r.ret[1] : addMinutes(r.ret[1], 20 * i);
      const cls = { cabin: cabin.id, code: pool[Math.min(pool.length - 1, tier + i)] };
      offers.push({
        price, currency: 'KRW',
        seats: Math.max(1, seatBase - i),
        out: mkLeg(r.out[0], ORIGIN, plan.dest, plan.depDate, outDep, cls),
        ret: mkLeg(r.ret[0], plan.dest, ORIGIN, plan.retDate, retDep, cls),
      });
    }
    offers.sort((a, b) => a.price - b.price);
    trip[cabin.key] = { price: offers[0].price, offerCount: offers.length, offers };
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
    adults: 1, cabins: DEFAULTS.cabins,
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
console.log(`샘플 생성: ${trips.length}조합 (${per}) -> ${OUT}`);
