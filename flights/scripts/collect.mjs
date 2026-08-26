#!/usr/bin/env node
// GitHub Actions 용 시세 수집기: SerpApi Google Flights 를 돌면서
// flights/data/prices.json 을 갱신한다.
//
// 필수 환경변수: SERPAPI_KEY
// 선택: DESTS(쉼표구분), WEEKS, PATTERNS, ADULTS, CABINS(기본 ECONOMY),
//       DEP_WINDOW("06:00-09:00"), RET_WINDOW("18:00-21:00"), DEEP_SEARCH,
//       CONCURRENCY, OUT(파일 경로)

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '../lib/serpapi.mjs';
import { searchMany, searchReturnLegs } from '../lib/search.mjs';
import { buildTripPlans, DEFAULTS, DEFAULT_DEST_CODES, DESTINATIONS, PATTERNS, CABINS, ORIGIN } from '../lib/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', process.env.OUT || 'data/prices.json');
const HISTORY = resolve(here, '..', process.env.HISTORY_OUT || 'data/history.json');
const HISTORY_MAX = 30;   // 주 1회 수집 기준 약 7개월치

// 지난 수집분 — 이번 결과에 '지난 수집 대비' 가격을 심는 데 쓴다. 샘플 데이터는 비교하지 않는다.
const prevData = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => null);
const prevReal = prevData && prevData.source !== 'sample' ? prevData : null;

const win = (raw, fallback) => {
  if (!raw) return fallback;
  const [a, b] = raw.split('-').map(s => s.trim());
  return a && b ? [a, b] : fallback;
};
const list = (raw) => raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : null;

const opts = {
  ...DEFAULTS,
  adults: Number(process.env.ADULTS || DEFAULTS.adults),
  depWindow: win(process.env.DEP_WINDOW, DEFAULTS.depWindow),
  retWindow: win(process.env.RET_WINDOW, DEFAULTS.retWindow),
  cabins: list(process.env.CABINS) || DEFAULTS.collectCabins,
  deepSearch: process.env.DEEP_SEARCH === 'true',
  origin: ORIGIN,
};

const destCodes = list(process.env.DESTS) || DEFAULT_DEST_CODES;
const patternIds = list(process.env.PATTERNS) || PATTERNS.map(p => p.id);
const weeks = Number(process.env.WEEKS || DEFAULTS.weeks);
const concurrency = Number(process.env.CONCURRENCY || 4);

const plans = buildTripPlans({ destCodes, weeks, patternIds });

console.log(`[collect] ${destCodes.length}개 노선 × ${weeks}주 × ${patternIds.length}패턴 = ${plans.length}조합`);
console.log(`[collect] 좌석등급 ${opts.cabins.join(', ')} → SerpApi 호출 ${plans.length * opts.cabins.length}회`);
{
  const { HOLIDAY_DATA_END } = await import('../lib/holidays.mjs');
  const beyond = plans.filter(p => p.retDate > HOLIDAY_DATA_END).length;
  if (beyond) console.warn(`[collect] ⚠ ${beyond}개 조합이 공휴일 표 범위(${HOLIDAY_DATA_END})를 벗어났습니다. lib/holidays.mjs 에 다음 해 공휴일을 추가하세요 — 그 전까지 해당 조합의 연휴 근거가 비어 나옵니다.`);
}
console.log(`[collect] 출발 ${opts.depWindow.join('~')} / 귀국 ${opts.retWindow.join('~')} · ${opts.carriers.join(',')} 직항만`);

if (!process.env.SERPAPI_KEY) {
  console.error('[collect] SERPAPI_KEY 가 없습니다. 저장소 Secrets 에 등록하세요.');
  process.exit(1);
}
const client = createClient({ apiKey: process.env.SERPAPI_KEY });

const started = Date.now();
const { results, errors } = await searchMany(client, plans, opts, {
  concurrency,
  onProgress: (done, total) => {
    if (done % 10 === 0 || done === total) console.log(`[collect] ${done}/${total}`);
  },
});

const hasPrice = (r) => CABINS.some(c => typeof r[c.key]?.price === 'number');
const found = results.filter(hasPrice);
const activeCabins = CABINS.filter(c => opts.cabins.includes(c.id));
const perCabin = activeCabins
  .map(c => `${c.ko} ${results.filter(r => typeof r[c.key]?.price === 'number').length}`).join(' / ');
// 좌석등급 하나만 실패한 경우는 조합 자체가 실패로 잡히지 않으므로 따로 센다.
const cabinErrors = [];
for (const r of results) {
  for (const c of activeCabins) {
    if (r[c.key]?.error) cabinErrors.push({ plan: r.id, cabin: c.id, message: r[c.key].error });
  }
}
console.log(`[collect] 완료 ${((Date.now() - started) / 1000).toFixed(1)}s · 가격 확보 ${found.length}/${results.length}건 (${perCabin}) · 조합 실패 ${errors.length} · 등급별 실패 ${cabinErrors.length}`);
if (cabinErrors.length) console.log('[collect] 등급별 실패 예시:', JSON.stringify(cabinErrors.slice(0, 3)));
if (errors.length) console.log('[collect] 오류 예시:', JSON.stringify(errors.slice(0, 3), null, 2));

if (!found.length) {
  // 전부 실패했다면 기존 파일을 덮어써서 화면을 비우지 않는다.
  console.error('[collect] 가격을 하나도 얻지 못했습니다. 기존 데이터를 유지합니다.');
  const prev = await readFile(OUT, 'utf8').catch(() => null);
  if (prev) process.exit(0);
  process.exit(1);
}

// 저장 용량 절약 — 화면에 필요한 만큼만 남긴다 (라이브 조회는 전체를 그대로 씀).
const MAX_STORED_OFFERS = 3;
for (const r of results) {
  for (const c of CABINS) {
    // 이번에 돌지 않은 좌석등급은 '없음'이 아니라 '아직 안 봄'으로 남긴다.
    // 화면에서 그 칸을 열 때 온디맨드로 조회한다.
    if (!opts.cabins.includes(c.id)) {
      r[c.key] = { price: null, offerCount: 0, offers: [], notQueried: true };
      continue;
    }
    const slot = r[c.key];
    if (slot?.offers?.length > MAX_STORED_OFFERS) slot.offers = slot.offers.slice(0, MAX_STORED_OFFERS);
  }
}

// '지난 수집 대비' — 같은 조합·같은 등급의 직전 실수집 가격을 슬롯에 심는다.
if (prevReal) {
  const prevById = new Map(prevReal.trips.map(t => [t.id, t]));
  for (const r of results) {
    const before = prevById.get(r.id);
    if (!before) continue;
    for (const c of CABINS) {
      const now = r[c.key];
      const old = before[c.key];
      if (!now || now.notQueried || typeof old?.price !== 'number') continue;
      now.prevPrice = old.price;
      now.prevAt = prevReal.generatedAt;
    }
  }
}

// ── 귀국편 시간표 수집 ──────────────────────────────────────────
// 왕복 검색 1회로는 가는편 + 왕복 총액까지만 나온다(Google Flights 구조).
// 오는편 시각은 departure_token 재조회가 필요한데, 조합마다 부르면 호출이
// 두 배라 목적지 × 귀국요일별 대표 1건만 조회해 시간표로 공유한다.
// (같은 노선·같은 요일의 저녁 OZ 스케줄은 사실상 동일하다.)
const returnSchedules = {};
{
  const wanted = new Map();   // "DEST|dow" -> 대표 trip
  for (const r of results) {
    const best = r.economy?.offers?.[0];
    if (!best?.departureToken) continue;
    const dow = new Date(r.retDate + 'T00:00:00Z').getUTCDay();
    const key = `${r.dest}|${dow}`;
    if (!wanted.has(key)) wanted.set(key, r);
  }
  console.log(`[collect] 귀국편 시간표 ${wanted.size}건 추가 조회`);
  for (const [key, trip] of wanted) {
    try {
      const legs = await searchReturnLegs(client, trip, 'ECONOMY', trip.economy.offers[0].departureToken, opts);
      returnSchedules[key] = {
        sampledDate: trip.retDate,
        legs: legs.map(x => ({ price: x.price, leg: x.leg })),
      };
    } catch (err) {
      console.warn(`[collect] 귀국편 조회 실패 ${key}: ${err.message}`);
    }
  }
  const got = Object.values(returnSchedules).reduce((n, v) => n + v.legs.length, 0);
  console.log(`[collect] 귀국편 시간표 확보: ${Object.keys(returnSchedules).length}키 · ${got}편`);
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: 'github-actions',
  currency: opts.currency,
  params: {
    origin: ORIGIN,
    carriers: opts.carriers,
    nonStop: opts.nonStop,
    adults: opts.adults,
    cabins: opts.cabins,
    viewableCabins: DEFAULTS.cabins,
    provider: 'serpapi-google-flights',
    depWindow: opts.depWindow,
    retWindow: opts.retWindow,
    weeks,
    patterns: patternIds,
  },
  destinations: DESTINATIONS.filter(d => destCodes.includes(d.code)),
  patterns: PATTERNS.filter(p => patternIds.includes(p.id)),
  cabinsMeta: CABINS.filter(c => opts.cabins.includes(c.id)),
  returnSchedules,
  trips: results,
  errors: [...errors, ...cabinErrors].slice(0, 20),
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(payload) + '\n', 'utf8');

// 조합별 최저가만 요약해 이력에 쌓는다. 나중에 추이 그래프를 그릴 재료.
try {
  const history = await readFile(HISTORY, 'utf8').then(JSON.parse).catch(() => []);
  const snapshot = { at: payload.generatedAt, prices: {} };
  for (const r of results) {
    const entry = {};
    for (const c of CABINS) {
      if (typeof r[c.key]?.price === 'number') entry[c.short.toLowerCase()] = r[c.key].price;
    }
    if (Object.keys(entry).length) snapshot.prices[r.id] = entry;
  }
  history.push(snapshot);
  await writeFile(HISTORY, JSON.stringify(history.slice(-HISTORY_MAX)) + '\n', 'utf8');
  console.log(`[collect] 이력 저장: ${history.length <= HISTORY_MAX ? history.length : HISTORY_MAX}개 스냅샷`);
} catch (err) {
  console.warn('[collect] 이력 저장 실패(치명적 아님):', err.message);
}
console.log(`[collect] 저장: ${OUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KB)`);
