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
import { searchMany } from '../lib/search.mjs';
import { buildTripPlans, DEFAULTS, DEFAULT_DEST_CODES, DESTINATIONS, PATTERNS, CABINS, ORIGIN } from '../lib/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', process.env.OUT || 'data/prices.json');

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
  trips: results,
  errors: [...errors, ...cabinErrors].slice(0, 20),
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(payload) + '\n', 'utf8');
console.log(`[collect] 저장: ${OUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KB)`);
