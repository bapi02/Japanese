// Amadeus 응답을 앱이 쓰는 형태로 정규화하고, 시간대 · 항공사 · 직항 조건으로 거른다.

import { DEFAULTS, ORIGIN } from './config.mjs';

const hhmm = (isoLocal) => isoLocal.slice(11, 16);

function inWindow(isoLocal, [from, to]) {
  const t = hhmm(isoLocal);
  return t >= from && t <= to;
}

/** "PT2H15M" -> 135 (분) */
export function durationToMinutes(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(iso || '');
  if (!m) return null;
  return (Number(m[1] || 0)) * 60 + Number(m[2] || 0);
}

function legFrom(segment, fareDetail, dict) {
  return {
    carrier: segment.carrierCode,
    carrierName: dict?.carriers?.[segment.carrierCode] || segment.carrierCode,
    operating: segment.operating?.carrierCode || segment.carrierCode,
    number: `${segment.carrierCode}${segment.number}`,
    from: segment.departure.iataCode,
    to: segment.arrival.iataCode,
    depAt: segment.departure.at,
    arrAt: segment.arrival.at,
    depTime: hhmm(segment.departure.at),
    arrTime: hhmm(segment.arrival.at),
    minutes: durationToMinutes(segment.duration),
    aircraft: dict?.aircraft?.[segment.aircraft?.code] || segment.aircraft?.code || null,
    cabin: fareDetail?.cabin || null,
    bookingClass: fareDetail?.class || null,
    brandedFare: fareDetail?.brandedFareLabel || fareDetail?.brandedFare || null,
  };
}

/**
 * Amadeus flight-offers 응답 -> 정규화된 오퍼 배열.
 * 왕복(itineraries 2개) · 직항 · 지정 항공사 · 지정 시간대만 남긴다.
 */
export function normalizeOffers(body, opts = {}) {
  const {
    carriers = DEFAULTS.carriers,
    depWindow = DEFAULTS.depWindow,
    retWindow = DEFAULTS.retWindow,
  } = opts;
  const dict = body?.dictionaries || {};
  const out = [];

  for (const offer of body?.data || []) {
    const its = offer.itineraries || [];
    if (its.length !== 2) continue;
    const outSegs = its[0].segments || [];
    const retSegs = its[1].segments || [];
    if (outSegs.length !== 1 || retSegs.length !== 1) continue;   // 직항만

    const outSeg = outSegs[0];
    const retSeg = retSegs[0];
    if (!carriers.includes(outSeg.carrierCode) || !carriers.includes(retSeg.carrierCode)) continue;
    if (!inWindow(outSeg.departure.at, depWindow)) continue;
    if (!inWindow(retSeg.departure.at, retWindow)) continue;

    const fares = offer.travelerPricings?.[0]?.fareDetailsBySegment || [];
    const fareFor = (segId) => fares.find(f => f.segmentId === segId) || null;

    out.push({
      price: Math.round(Number(offer.price?.grandTotal ?? offer.price?.total ?? 0)),
      currency: offer.price?.currency || DEFAULTS.currency,
      seats: offer.numberOfBookableSeats ?? null,
      out: legFrom(outSeg, fareFor(outSeg.id), dict),
      ret: legFrom(retSeg, fareFor(retSeg.id), dict),
    });
  }

  out.sort((a, b) => a.price - b.price);
  return out;
}

/** 한 조합(목적지+날짜)에 대해 Amadeus 를 호출하고 정규화 결과를 돌려준다. */
export async function searchTrip(client, plan, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const body = await client.flightOffers({
    originLocationCode: opts.origin || ORIGIN,
    destinationLocationCode: plan.dest,
    departureDate: plan.depDate,
    returnDate: plan.retDate,
    adults: o.adults,
    nonStop: o.nonStop,
    currencyCode: o.currency,
    travelClass: o.travelClass,
    includedAirlineCodes: o.carriers.join(','),
    max: o.maxOffersPerTrip,
  });
  const offers = normalizeOffers(body, o);
  return {
    ...plan,
    price: offers.length ? offers[0].price : null,
    currency: o.currency,
    offerCount: offers.length,
    rawCount: body?.meta?.count ?? (body?.data?.length || 0),
    offers,
  };
}

/** 동시 실행 수를 제한하며 여러 조합을 조회한다. */
export async function searchMany(client, plans, opts = {}, { concurrency = 4, onProgress } = {}) {
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
        results.push({ ...plan, price: null, currency: opts.currency || DEFAULTS.currency, offerCount: 0, offers: [], error: err.message });
      }
      onProgress?.(++done, plans.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, plans.length) }, worker));
  results.sort((a, b) => a.depDate.localeCompare(b.depDate) || a.dest.localeCompare(b.dest));
  return { results, errors };
}
