// SerpApi Google Flights 클라이언트.
// Node 18+ 와 Cloudflare Worker 양쪽에서 전역 fetch 로 동작한다.
//
// 왕복 검색은 2단계다:
//  1) 검색 → 가는편 후보 + 왕복 총액 + price_insights (+ 후보마다 departure_token)
//  2) departure_token 재조회 → 그 가는편에 붙는 오는편 후보
// 그리드는 1)만 쓰고, 2)는 상세를 열 때만 부른다. (무료 250회/월을 아끼기 위해)

const ENDPOINT = 'https://serpapi.com/search.json';

export class SerpApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'SerpApiError';
    this.status = status;
    this.body = body;
  }
}

/** travel_class 코드: 1 이코노미 · 2 프리미엄이코노미 · 3 비즈니스 · 4 퍼스트 */
export const TRAVEL_CLASS = { ECONOMY: 1, PREMIUM_ECONOMY: 2, BUSINESS: 3, FIRST: 4 };

/** "06:00" → 6 (SerpApi 는 시(hour) 단위 정수만 받는다) */
export const hourOf = (hhmm) => Number(String(hhmm).slice(0, 2));

export function createClient({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('SerpApi apiKey 가 필요합니다.');

  async function call(params) {
    const qs = new URLSearchParams({ engine: 'google_flights', api_key: apiKey });
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      qs.set(k, String(v));
    }
    const res = await fetchImpl(`${ENDPOINT}?${qs}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      throw new SerpApiError(body.error || `조회 실패 (HTTP ${res.status})`, res.status, body);
    }
    return body;
  }

  /** 1단계 — 가는편 후보와 왕복 총액 */
  function searchOutbound({
    origin, dest, depDate, retDate, cabin, adults = 1,
    depWindow, retWindow, nonStop = true, carriers = [], currency = 'KRW',
    deepSearch = false,
  }) {
    return call({
      departure_id: origin,
      arrival_id: dest,
      outbound_date: depDate,
      return_date: retDate,
      type: 1,                                   // 왕복
      travel_class: TRAVEL_CLASS[cabin] ?? 1,
      adults,
      stops: nonStop ? 1 : 0,                    // 1 = 직항만
      include_airlines: carriers.join(',') || undefined,
      outbound_times: depWindow ? `${hourOf(depWindow[0])},${hourOf(depWindow[1])}` : undefined,
      return_times: retWindow ? `${hourOf(retWindow[0])},${hourOf(retWindow[1])}` : undefined,
      currency,
      hl: 'ko',
      gl: 'kr',
      deep_search: deepSearch ? 'true' : undefined,
    });
  }

  /** 2단계 — 특정 가는편에 붙는 오는편 후보 */
  function searchReturn({ departureToken, ...rest }) {
    return call({
      departure_id: rest.origin,
      arrival_id: rest.dest,
      outbound_date: rest.depDate,
      return_date: rest.retDate,
      type: 1,
      travel_class: TRAVEL_CLASS[rest.cabin] ?? 1,
      adults: rest.adults ?? 1,
      stops: rest.nonStop === false ? 0 : 1,
      include_airlines: (rest.carriers || []).join(',') || undefined,
      return_times: rest.retWindow ? `${hourOf(rest.retWindow[0])},${hourOf(rest.retWindow[1])}` : undefined,
      currency: rest.currency || 'KRW',
      hl: 'ko',
      gl: 'kr',
      departure_token: departureToken,
    });
  }

  return { searchOutbound, searchReturn, call };
}
