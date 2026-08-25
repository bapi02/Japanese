// SerpApi Google Flights 응답을 앱이 쓰는 형태로 정규화하고,
// 시간대 · 항공사 · 직항 조건을 한 번 더 확인한다.
// (요청 단계에서 stops=1 / include_airlines / outbound_times 로 이미 좁히지만,
//  outbound_times 는 '시' 단위라 09:00 초과분이 섞여 들어올 수 있어 정확히 다시 거른다.)

import { DEFAULTS, ORIGIN, CABINS, cabinOf } from './config.mjs';

/** "2026-09-04 08:20" → { at: "2026-09-04T08:20:00", date: "2026-09-04", time: "08:20" } */
export function parseWhen(raw) {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(raw.trim());
  if (!m) return null;
  return { at: `${m[1]}T${m[2]}:00`, date: m[1], time: m[2] };
}

/** "OZ 132" → { carrier: "OZ", number: "OZ132" } */
export function parseFlightNumber(raw) {
  const m = /^([A-Z0-9]{2})\s*(\d+)/.exec(String(raw || '').trim().toUpperCase());
  return m ? { carrier: m[1], number: `${m[1]}${m[2]}` } : { carrier: null, number: raw || null };
}

const inWindow = (time, [from, to]) => time >= from && time <= to;

function legFrom(flight) {
  const dep = parseWhen(flight.departure_airport?.time);
  const arr = parseWhen(flight.arrival_airport?.time);
  const { carrier, number } = parseFlightNumber(flight.flight_number);
  return {
    carrier,
    carrierName: flight.airline || carrier,
    operating: carrier,
    number,
    from: flight.departure_airport?.id || null,
    to: flight.arrival_airport?.id || null,
    depAt: dep?.at || null,
    arrAt: arr?.at || null,
    depTime: dep?.time || null,
    arrTime: arr?.time || null,
    minutes: typeof flight.duration === 'number' ? flight.duration : null,
    aircraft: flight.airplane || null,
    cabin: flight.travel_class || null,
    legroom: flight.legroom || null,
    oftenDelayed: flight.often_delayed_by_over_30_min === true,
  };
}

/** price_insights 를 저장 가능한 크기로 정리 */
function insightsFrom(body) {
  const pi = body?.price_insights;
  if (!pi) return null;
  const range = Array.isArray(pi.typical_price_range) ? pi.typical_price_range : [];
  return {
    level: pi.price_level || null,          // "low" | "typical" | "high"
    lowest: typeof pi.lowest_price === 'number' ? pi.lowest_price : null,
    typicalLow: typeof range[0] === 'number' ? range[0] : null,
    typicalHigh: typeof range[1] === 'number' ? range[1] : null,
  };
}

/**
 * 1단계 응답 → 가는편 기준 왕복 후보.
 * SerpApi 왕복 검색의 price 는 '왕복 총액'이다.
 */
export function normalizeOutbound(body, opts = {}) {
  const {
    carriers = DEFAULTS.carriers,
    depWindow = DEFAULTS.depWindow,
    nonStop = true,
  } = opts;

  const out = [];
  for (const item of [...(body?.best_flights || []), ...(body?.other_flights || [])]) {
    const legs = item.flights || [];
    if (nonStop && legs.length !== 1) continue;      // 직항만
    const leg = legFrom(legs[0]);
    if (carriers.length && !carriers.includes(leg.carrier)) continue;
    if (!leg.depTime || !inWindow(leg.depTime, depWindow)) continue;

    out.push({
      price: typeof item.price === 'number' ? Math.round(item.price) : null,
      currency: opts.currency || DEFAULTS.currency,
      seats: null,                                    // Google Flights 는 잔여석을 주지 않는다
      out: leg,
      ret: null,                                      // departure_token 2차 조회 전까지 미상
      departureToken: item.departure_token || null,
      totalMinutes: typeof item.total_duration === 'number' ? item.total_duration : null,
    });
  }
  out.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return out;
}

/** 2단계 응답 → 오는편 후보 */
export function normalizeReturn(body, opts = {}) {
  const {
    carriers = DEFAULTS.carriers,
    retWindow = DEFAULTS.retWindow,
    nonStop = true,
  } = opts;

  const out = [];
  for (const item of [...(body?.best_flights || []), ...(body?.other_flights || [])]) {
    const legs = item.flights || [];
    if (nonStop && legs.length !== 1) continue;
    const leg = legFrom(legs[0]);
    if (carriers.length && !carriers.includes(leg.carrier)) continue;
    if (!leg.depTime || !inWindow(leg.depTime, retWindow)) continue;
    out.push({
      price: typeof item.price === 'number' ? Math.round(item.price) : null,
      leg,
      bookingToken: item.booking_token || null,
    });
  }
  out.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return out;
}

/** 한 조합 × 한 좌석등급을 조회한다 (SerpApi 호출 1회). */
export async function searchCabin(client, plan, cabin, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const body = await client.searchOutbound({
    origin: o.origin || ORIGIN,
    dest: plan.dest,
    depDate: plan.depDate,
    retDate: plan.retDate,
    cabin,
    adults: o.adults,
    depWindow: o.depWindow,
    retWindow: o.retWindow,
    nonStop: o.nonStop,
    carriers: o.carriers,
    currency: o.currency,
    deepSearch: o.deepSearch,
  });
  const offers = normalizeOutbound(body, { ...o, cabin }).slice(0, o.maxOffersPerTrip);
  return {
    price: offers.length ? offers[0].price : null,
    offerCount: offers.length,
    rawCount: (body?.best_flights?.length || 0) + (body?.other_flights?.length || 0),
    offers,
    insights: insightsFrom(body),
  };
}

/** 한 조합을 좌석등급별로 조회해 하나의 trip 객체로 합친다. */
export async function searchTrip(client, plan, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const trip = { ...plan, currency: o.currency };
  const errors = [];
  for (const id of o.cabins) {
    const c = cabinOf(id);
    if (!c) continue;
    try {
      trip[c.key] = await searchCabin(client, plan, id, o);
    } catch (err) {
      trip[c.key] = { price: null, offerCount: 0, offers: [], error: err.message };
      errors.push(err);
    }
  }
  if (errors.length === o.cabins.length) throw errors[0];
  return trip;
}

/** 상세 화면용 — 고른 가는편에 붙는 오는편 후보 (SerpApi 호출 1회). */
export async function searchReturnLegs(client, plan, cabin, departureToken, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const body = await client.searchReturn({
    departureToken,
    origin: o.origin || ORIGIN,
    dest: plan.dest,
    depDate: plan.depDate,
    retDate: plan.retDate,
    cabin,
    adults: o.adults,
    retWindow: o.retWindow,
    nonStop: o.nonStop,
    carriers: o.carriers,
    currency: o.currency,
  });
  return normalizeReturn(body, o).slice(0, o.maxOffersPerTrip);
}

/** 동시 실행 수를 제한하며 여러 조합을 조회한다. */
export async function searchMany(client, plans, opts = {}, { concurrency = 3, onProgress } = {}) {
  const results = [];
  const errors = [];
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < plans.length) {
      const plan = plans[cursor++];
      try {
        results.push(await searchTrip(client, plan, opts));
      } catch (err) {
        errors.push({ plan: plan.id, message: err.message, status: err.status ?? null });
        const blank = { ...plan, currency: opts.currency || DEFAULTS.currency, error: err.message };
        for (const c of CABINS) blank[c.key] = { price: null, offerCount: 0, offers: [] };
        results.push(blank);
      }
      onProgress?.(++done, plans.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, plans.length) }, worker));
  results.sort((a, b) => a.depDate.localeCompare(b.depDate) || a.dest.localeCompare(b.dest));
  return { results, errors };
}
