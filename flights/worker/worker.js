// Cloudflare Worker — 브라우저 대신 SerpApi Google Flights 를 호출하는 얇은 프록시.
// API 키는 Worker 시크릿에만 두고, 브라우저에는 절대 내려가지 않는다.
//
// 배포:  cd flights/worker && npx wrangler deploy
// 시크릿: npx wrangler secret put SERPAPI_KEY
//
// 엔드포인트
//   GET /api/health                     설정 상태 · 노선/패턴/좌석등급 메타
//   GET /api/trip?dest&dep&ret&cabins   조합 1건 조회 (좌석등급당 SerpApi 1회)
//   GET /api/return?...&token           고른 가는편에 붙는 오는편 (SerpApi 1회)

import { createClient } from '../lib/serpapi.mjs';
import { searchTrip, searchReturnLegs } from '../lib/search.mjs';
import { DEFAULTS, ORIGIN, DESTINATIONS, PATTERNS, CABINS } from '../lib/config.mjs';

const CACHE_SECONDS = 600; // 10분 — 같은 조합을 연달아 새로고침해도 무료 한도를 태우지 않는다.

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

const json = (data, env, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(env), ...extra },
  });

function parseWindow(raw, fallback) {
  if (!raw) return fallback;
  const [a, b] = raw.split('-').map(s => s.trim());
  return /^\d\d:\d\d$/.test(a) && /^\d\d:\d\d$/.test(b) ? [a, b] : fallback;
}

/** 공통 쿼리 파싱 + 검증. 문제가 있으면 Response 를 돌려준다. */
function readPlan(url, env) {
  const dest = (url.searchParams.get('dest') || '').toUpperCase();
  const dep = url.searchParams.get('dep') || '';
  const ret = url.searchParams.get('ret') || '';
  if (!/^[A-Z]{3}$/.test(dest)) return { error: json({ error: 'dest 는 3글자 IATA 코드여야 합니다.' }, env, 400) };
  if (!/^\d{4}-\d\d-\d\d$/.test(dep) || !/^\d{4}-\d\d-\d\d$/.test(ret)) {
    return { error: json({ error: 'dep / ret 은 YYYY-MM-DD 형식이어야 합니다.' }, env, 400) };
  }
  if (ret < dep) return { error: json({ error: '귀국일이 출발일보다 빠릅니다.' }, env, 400) };

  const cabins = (url.searchParams.get('cabins') || '').split(',')
    .map(s => s.trim().toUpperCase()).filter(c => CABINS.some(x => x.id === c));

  return {
    plan: {
      id: `${dest}|${dep}|${ret}`,
      dest, depDate: dep, retDate: ret,
      weekOf: url.searchParams.get('weekOf') || dep,
      pattern: url.searchParams.get('pattern') || null,
    },
    opts: {
      ...DEFAULTS,
      origin: url.searchParams.get('origin') || ORIGIN,
      adults: Math.min(9, Math.max(1, Number(url.searchParams.get('adults') || DEFAULTS.adults))),
      depWindow: parseWindow(url.searchParams.get('depWindow'), DEFAULTS.depWindow),
      retWindow: parseWindow(url.searchParams.get('retWindow'), DEFAULTS.retWindow),
      cabins: cabins.length ? cabins : DEFAULTS.cabins,
    },
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });

    if (url.pathname === '/api/health' || url.pathname === '/') {
      return json({
        ok: true,
        service: 'asiana-japan-fare-proxy',
        provider: 'serpapi-google-flights',
        configured: Boolean(env.SERPAPI_KEY),
        destinations: DESTINATIONS,
        patterns: PATTERNS,
        cabins: CABINS,
        defaults: DEFAULTS,
      }, env);
    }

    if (!['/api/trip', '/api/return'].includes(url.pathname)) {
      return json({ error: 'not found' }, env, 404);
    }
    if (!env.SERPAPI_KEY) {
      return json({ error: 'Worker 에 SERPAPI_KEY 시크릿이 설정되지 않았습니다.' }, env, 503);
    }

    const parsed = readPlan(url, env);
    if (parsed.error) return parsed.error;
    const { plan, opts } = parsed;

    const fresh = url.searchParams.get('fresh') === '1';
    const cache = caches.default;
    const cacheKey = new Request(url.toString().replace(/[?&]fresh=1/, ''), request);
    if (!fresh) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const cloned = new Response(hit.body, hit);
        cloned.headers.set('X-Fare-Cache', 'HIT');
        return cloned;
      }
    }

    const client = createClient({ apiKey: env.SERPAPI_KEY });

    try {
      let payload;
      if (url.pathname === '/api/trip') {
        payload = { ...(await searchTrip(client, plan, opts)), fetchedAt: new Date().toISOString(), source: 'live' };
      } else {
        const token = url.searchParams.get('token');
        const cabin = (url.searchParams.get('cabin') || 'ECONOMY').toUpperCase();
        if (!token) return json({ error: 'token(departure_token) 이 필요합니다.' }, env, 400);
        if (!CABINS.some(c => c.id === cabin)) return json({ error: '알 수 없는 좌석등급입니다.' }, env, 400);
        payload = {
          id: plan.id, cabin,
          returns: await searchReturnLegs(client, plan, cabin, token, opts),
          fetchedAt: new Date().toISOString(),
        };
      }
      const res = json(payload, env, 200, {
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        'X-Fare-Cache': 'MISS',
      });
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    } catch (err) {
      return json({ error: err.message, status: err.status ?? null, plan: plan.id }, env,
        err.status === 429 ? 429 : 502);
    }
  },
};
