// Cloudflare Worker — 브라우저 대신 Amadeus 를 호출하는 얇은 프록시.
// API 키는 Worker 시크릿에만 두고, 브라우저에는 절대 내려가지 않는다.
//
// 배포:  cd flights/worker && npx wrangler deploy
// 시크릿: npx wrangler secret put AMADEUS_CLIENT_ID
//         npx wrangler secret put AMADEUS_CLIENT_SECRET

import { createClient } from '../lib/amadeus.mjs';
import { searchTrip } from '../lib/search.mjs';
import { DEFAULTS, ORIGIN, DESTINATIONS, PATTERNS, CABINS } from '../lib/config.mjs';

const CACHE_SECONDS = 600; // 10분 — 같은 조합을 연달아 새로고침해도 쿼터를 태우지 않는다.

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });

    if (url.pathname === '/api/health' || url.pathname === '/') {
      return json({
        ok: true,
        service: 'asiana-japan-fare-proxy',
        configured: Boolean(env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET),
        amadeusEnv: env.AMADEUS_ENV || 'production',
        destinations: DESTINATIONS,
        patterns: PATTERNS,
        cabins: CABINS,
        defaults: DEFAULTS,
      }, env);
    }

    if (url.pathname !== '/api/trip') return json({ error: 'not found' }, env, 404);

    const dest = (url.searchParams.get('dest') || '').toUpperCase();
    const dep = url.searchParams.get('dep') || '';
    const ret = url.searchParams.get('ret') || '';
    if (!/^[A-Z]{3}$/.test(dest)) return json({ error: 'dest 는 3글자 IATA 코드여야 합니다.' }, env, 400);
    if (!/^\d{4}-\d\d-\d\d$/.test(dep) || !/^\d{4}-\d\d-\d\d$/.test(ret)) {
      return json({ error: 'dep / ret 은 YYYY-MM-DD 형식이어야 합니다.' }, env, 400);
    }
    if (ret < dep) return json({ error: '귀국일이 출발일보다 빠릅니다.' }, env, 400);

    if (!env.AMADEUS_CLIENT_ID || !env.AMADEUS_CLIENT_SECRET) {
      return json({ error: 'Worker 에 AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET 시크릿이 설정되지 않았습니다.' }, env, 503);
    }

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

    const opts = {
      ...DEFAULTS,
      origin: url.searchParams.get('origin') || ORIGIN,
      adults: Math.min(9, Math.max(1, Number(url.searchParams.get('adults') || DEFAULTS.adults))),
      depWindow: parseWindow(url.searchParams.get('depWindow'), DEFAULTS.depWindow),
      retWindow: parseWindow(url.searchParams.get('retWindow'), DEFAULTS.retWindow),
      cabins: (url.searchParams.get('cabins') || '').split(',').map(s => s.trim().toUpperCase())
        .filter(c => CABINS.some(x => x.id === c)),
    };
    if (!opts.cabins.length) opts.cabins = DEFAULTS.cabins;

    const client = createClient({
      clientId: env.AMADEUS_CLIENT_ID,
      clientSecret: env.AMADEUS_CLIENT_SECRET,
      env: env.AMADEUS_ENV || 'production',
    });

    const plan = {
      id: `${dest}|${dep}|${ret}`,
      dest, depDate: dep, retDate: ret,
      weekOf: url.searchParams.get('weekOf') || dep,
      pattern: url.searchParams.get('pattern') || null,
    };

    try {
      const result = await searchTrip(client, plan, opts);
      const res = json({ ...result, fetchedAt: new Date().toISOString(), source: 'live' }, env, 200, {
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
