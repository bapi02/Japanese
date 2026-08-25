// 검색 파라미터 기본값 — 수집기(Node) · 라이브 프록시(Worker) · 웹이 공유한다.

export const ORIGIN = 'ICN';

/** 인천 출발 일본 노선 후보. 실제 운항 여부는 API 응답이 결정한다(없으면 빈 결과). */
export const DESTINATIONS = [
  { code: 'NRT', city: '도쿄',   ko: '도쿄 나리타',     region: '간토' },
  { code: 'HND', city: '도쿄',   ko: '도쿄 하네다',     region: '간토' },
  { code: 'KIX', city: '오사카', ko: '오사카 간사이',   region: '간사이' },
  { code: 'FUK', city: '후쿠오카', ko: '후쿠오카',      region: '규슈' },
  { code: 'NGO', city: '나고야', ko: '나고야 주부',     region: '주부' },
  { code: 'CTS', city: '삿포로', ko: '삿포로 신치토세', region: '홋카이도' },
  { code: 'OKA', city: '오키나와', ko: '오키나와 나하', region: '오키나와' },
  { code: 'SDJ', city: '센다이', ko: '센다이',          region: '도호쿠' },
  { code: 'HIJ', city: '히로시마', ko: '히로시마',      region: '주고쿠' },
  { code: 'KMJ', city: '구마모토', ko: '구마모토',      region: '규슈' },
];

/** 기본 수집 대상 (호출 수를 아끼려고 주요 노선만). 나머지는 DESTS 환경변수로 켠다. */
export const DEFAULT_DEST_CODES = ['NRT', 'HND', 'KIX', 'FUK', 'NGO', 'CTS', 'OKA'];

/**
 * 주말 여행 패턴. dep/ret 은 요일 번호(0=일 … 6=토).
 * 기준 주의 금요일을 앵커로 잡고 offset(일)만큼 더해 날짜를 만든다.
 */
export const PATTERNS = [
  { id: 'SAT_SUN',     label: '토·일',      short: '토일',   depOffset: 1, retOffset: 2, nights: 1 },
  { id: 'FRI_SUN',     label: '금·토·일',   short: '금토일', depOffset: 0, retOffset: 2, nights: 2 },
  { id: 'SAT_MON',     label: '토·일·월',   short: '토일월', depOffset: 1, retOffset: 3, nights: 2 },
  { id: 'FRI_MON',     label: '금·토·일·월', short: '금토일월', depOffset: 0, retOffset: 3, nights: 3 },
];

export const DEFAULTS = {
  carriers: ['OZ'],        // Only 아시아나
  nonStop: true,           // 직항만
  adults: 1,
  currency: 'KRW',
  travelClass: 'ECONOMY',
  depWindow: ['06:00', '09:00'],  // 인천 출발 시각 (현지)
  retWindow: ['18:00', '21:00'],  // 일본 출발 시각 (현지)
  weeks: 10,               // 앞으로 몇 주치 주말을 볼지
  maxOffersPerTrip: 30,
};

export const CARRIER_NAMES = {
  OZ: '아시아나항공',
  RS: '에어서울',
  BX: '에어부산',
  KE: '대한항공',
};

/** 오늘 이후 n개 주말의 '금요일' 날짜 목록 (YYYY-MM-DD). */
export function upcomingFridays(weeks, today = new Date()) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dow = d.getUTCDay();            // 0=일
  const delta = (5 - dow + 7) % 7;      // 다음(또는 오늘) 금요일까지
  d.setUTCDate(d.getUTCDate() + delta);
  const out = [];
  for (let i = 0; i < weeks; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** (목적지 × 주말 × 패턴) 조합 목록을 만든다. */
export function buildTripPlans({ destCodes, weeks, today, patternIds } = {}) {
  const dests = destCodes?.length ? destCodes : DEFAULT_DEST_CODES;
  const pats = patternIds?.length ? PATTERNS.filter(p => patternIds.includes(p.id)) : PATTERNS;
  const fridays = upcomingFridays(weeks ?? DEFAULTS.weeks, today);
  const plans = [];
  for (const friday of fridays) {
    for (const p of pats) {
      const depDate = addDays(friday, p.depOffset);
      const retDate = addDays(friday, p.retOffset);
      for (const dest of dests) {
        plans.push({
          id: `${dest}|${depDate}|${retDate}`,
          dest, depDate, retDate, weekOf: friday,
          pattern: p.id, patternLabel: p.label, nights: p.nights,
        });
      }
    }
  }
  return plans;
}
