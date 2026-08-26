#!/usr/bin/env node
// 실키 스모크 테스트 — SerpApi 무료 한도에서 1회(옵션 시 2회)만 써서
// 실제 응답이 우리 정규화 코드와 맞는지 확인한다.
//
//   SERPAPI_KEY=... node flights/scripts/smoke.mjs [DEST] [--return] [--save=경로]
//
//   DEST      기본 NRT. 날짜는 다음다음 주 금~일로 자동 계산.
//   --return  가는편 1건의 departure_token 으로 오는편도 조회 (호출 +1)
//   --save=   원본 응답 JSON 저장 경로 (픽스처 갱신용)

import { writeFile } from 'node:fs/promises';
import { createClient } from '../lib/serpapi.mjs';
import { normalizeOutbound, normalizeReturn } from '../lib/search.mjs';
import { DEFAULTS, ORIGIN, upcomingFridays, addDays } from '../lib/config.mjs';

const key = process.env.SERPAPI_KEY;
if (!key) {
  console.error('SERPAPI_KEY 환경변수가 필요합니다.');
  process.exit(1);
}
const args = process.argv.slice(2);
const dest = (args.find(a => /^[A-Za-z]{3}$/.test(a)) || 'NRT').toUpperCase();
const doReturn = args.includes('--return');
const savePath = args.find(a => a.startsWith('--save='))?.slice(7) || null;

// 너무 임박하지 않게 다음다음 주 금~일
const friday = upcomingFridays(2)[1];
const depDate = friday;
const retDate = addDays(friday, 2);

const checks = [];
const check = (name, ok, note = '') => {
  checks.push({ name, ok, note });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${note ? ` — ${note}` : ''}`);
};

console.log(`[smoke] ${ORIGIN} → ${dest} · ${depDate} ~ ${retDate} · 이코노미 · 호출 ${doReturn ? 2 : 1}회`);
const client = createClient({ apiKey: key });

const body = await client.searchOutbound({
  origin: ORIGIN, dest, depDate, retDate,
  cabin: 'ECONOMY', adults: 1,
  depWindow: DEFAULTS.depWindow, retWindow: DEFAULTS.retWindow,
  nonStop: true, carriers: DEFAULTS.carriers, currency: 'KRW',
});

if (savePath) {
  await writeFile(savePath, JSON.stringify(body, null, 1), 'utf8');
  console.log(`[smoke] 원본 저장: ${savePath}`);
}

console.log('[smoke] 응답 구조 검사:');
check('search_metadata.status', body.search_metadata?.status === 'Success', body.search_metadata?.status);
const raw = [...(body.best_flights || []), ...(body.other_flights || [])];
check('항공편 목록 존재', raw.length > 0, `${raw.length}건 (best ${body.best_flights?.length || 0} / other ${body.other_flights?.length || 0})`);

if (raw.length) {
  const f = raw[0].flights?.[0];
  check('flights[].departure_airport.time 형식', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(f?.departure_airport?.time || ''), JSON.stringify(f?.departure_airport?.time));
  check('flights[].flight_number 파싱 가능', /^[A-Z0-9]{2}\s*\d+/.test(f?.flight_number || ''), JSON.stringify(f?.flight_number));
  check('price 숫자', typeof raw[0].price === 'number', String(raw[0].price));
  check('departure_token 존재', typeof raw[0].departure_token === 'string');
}
check('price_insights 존재', Boolean(body.price_insights),
  body.price_insights ? `level=${body.price_insights.price_level} range=${JSON.stringify(body.price_insights.typical_price_range)}` : '없음(치명적 아님 — 근거 배지 하나가 빠질 뿐)');

const offers = normalizeOutbound(body, { ...DEFAULTS, currency: 'KRW' });
check('정규화 후 OZ 오전 직항 존재', offers.length > 0,
  offers.length ? `${offers.length}건 · 최저 ${offers[0].price?.toLocaleString('ko-KR')}원 ${offers[0].out.number} ${offers[0].out.depTime}`
                : '0건 — 이 주말에 조건 맞는 편이 실제로 없을 수도 있으니 다른 노선/주로 재시도');

if (doReturn && offers[0]?.departureToken) {
  const rbody = await client.searchReturn({
    departureToken: offers[0].departureToken,
    origin: ORIGIN, dest, depDate, retDate,
    cabin: 'ECONOMY', adults: 1,
    retWindow: DEFAULTS.retWindow, nonStop: true,
    carriers: DEFAULTS.carriers, currency: 'KRW',
  });
  if (savePath) {
    const p = savePath.replace(/\.json$/, '') + '.return.json';
    await writeFile(p, JSON.stringify(rbody, null, 1), 'utf8');
    console.log(`[smoke] 오는편 원본 저장: ${p}`);
  }
  const rets = normalizeReturn(rbody, DEFAULTS);
  check('오는편 18-21시 직항 존재', rets.length > 0,
    rets.length ? `${rets.length}건 · ${rets[0].leg.number} ${rets[0].leg.depTime}` : '0건');
}

const failed = checks.filter(c => !c.ok && !c.name.includes('price_insights'));
console.log(failed.length
  ? `\n[smoke] 실패 ${failed.length}건 — lib/search.mjs 정규화가 실응답과 안 맞습니다. --save 로 원본을 저장해 확인하세요.`
  : '\n[smoke] 통과 — 실응답이 정규화 코드와 맞습니다. Actions/Worker 를 켜도 됩니다.');
process.exit(failed.length ? 1 : 0);
