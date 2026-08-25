// "왜 이 가격인가" 분석 — 달력(연휴·성수기), 좌석 잔여, 예약클래스,
// 같은 노선 중앙값 대비 편차, 여행 패턴 프리미엄을 근거로 배지를 만든다.

import { calendarContext } from './holidays.mjs';
import { PATTERNS } from './config.mjs';

export function median(nums) {
  const a = nums.filter(n => typeof n === 'number' && isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

export function quantile(nums, q) {
  const a = nums.filter(n => typeof n === 'number' && isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? a[lo] : Math.round(a[lo] + (a[hi] - a[lo]) * (pos - lo));
}

// 이코노미 예약클래스 대략적 등급 (항공사 공통 관행 기준, 정확한 운임규정은 항공사 공지 우선)
const CLASS_TIERS = {
  Y: ['정규 운임', 3], B: ['상위 운임', 3], M: ['상위 운임', 3],
  H: ['중간 운임', 2], K: ['중간 운임', 2], L: ['중간 운임', 2],
  S: ['할인 운임', 0], V: ['할인 운임', 0], Q: ['할인 운임', 0],
  N: ['할인 운임', 0], T: ['특가 운임', 0], E: ['특가 운임', 0],
  G: ['특가 운임', 0], W: ['할인 운임', 0], U: ['할인 운임', 0],
};

function pct(value, base) {
  if (!base) return 0;
  return Math.round(((value - base) / base) * 100);
}

/** 데이터셋 전체에서 비교 기준(노선별·패턴별 중앙값)을 미리 계산한다. */
export function buildBaselines(trips) {
  const byDest = new Map();
  const byDestPattern = new Map();
  const byDestWeekPattern = new Map();
  for (const t of trips) {
    if (typeof t.price !== 'number') continue;
    (byDest.get(t.dest) ?? byDest.set(t.dest, []).get(t.dest)).push(t.price);
    const dp = `${t.dest}|${t.pattern}`;
    (byDestPattern.get(dp) ?? byDestPattern.set(dp, []).get(dp)).push(t.price);
    byDestWeekPattern.set(`${t.dest}|${t.weekOf}|${t.pattern}`, t.price);
  }
  const all = trips.map(t => t.price).filter(p => typeof p === 'number');
  return {
    destMedian: new Map([...byDest].map(([k, v]) => [k, median(v)])),
    destPatternMedian: new Map([...byDestPattern].map(([k, v]) => [k, median(v)])),
    destWeekPattern: byDestWeekPattern,
    all: {
      min: all.length ? Math.min(...all) : null,
      median: median(all),
      p25: quantile(all, 0.25),
      p50: quantile(all, 0.5),
      p75: quantile(all, 0.75),
      p90: quantile(all, 0.9),
    },
  };
}

/**
 * 한 조합의 가격 근거 배지 목록.
 * @param trip 정규화된 조합 결과 (price, offers, depDate, retDate, dest, pattern, weekOf)
 * @param baselines buildBaselines() 결과
 * @param today 기준일 (D-day 계산)
 */
export function explain(trip, baselines, today = new Date()) {
  const reasons = [];
  if (typeof trip.price !== 'number') {
    return [{ key: 'none', tone: 'info', label: '해당 시간대 운항 없음',
      detail: '지정한 출발·귀국 시간대에 아시아나 직항 왕복 조합이 없습니다.' }];
  }

  const destMed = baselines.destMedian.get(trip.dest);
  const diff = pct(trip.price, destMed);
  if (destMed && Math.abs(diff) >= 8) {
    reasons.push(diff > 0
      ? { key: 'vs-route', tone: 'up', weight: Math.min(4, Math.round(diff / 12)),
          label: `이 노선 평균 대비 +${diff}%`,
          detail: `${trip.dest} 노선 수집 구간 중앙값 ${destMed.toLocaleString('ko-KR')}원보다 비쌉니다.` }
      : { key: 'vs-route', tone: 'down', weight: 0,
          label: `이 노선 평균 대비 ${diff}%`,
          detail: `${trip.dest} 노선 중앙값 ${destMed.toLocaleString('ko-KR')}원보다 쌉니다.` });
  }

  const cal = calendarContext(trip.depDate, trip.retDate);
  if (cal.kr.length) {
    reasons.push({ key: 'kr-holiday', tone: 'up', weight: 4,
      label: `한국 공휴일 · ${cal.kr.map(h => h.name).join(', ')}`,
      detail: '연휴에는 한국발 수요가 몰려 좌석이 빨리 팔리고 저가 운임 클래스가 먼저 닫힙니다.' });
  }
  if (cal.jp.length) {
    reasons.push({ key: 'jp-holiday', tone: 'up', weight: 2,
      label: `일본 공휴일 · ${cal.jp.map(h => h.name).join(', ')}`,
      detail: '일본 내 이동 수요가 겹쳐 귀국편 좌석이 특히 비싸집니다.' });
  }
  for (const s of cal.seasons) {
    reasons.push({ key: 'season', tone: 'up', weight: s.weight,
      label: `성수기 · ${s.name}`,
      detail: '해마다 수요가 몰리는 시즌이라 기본 운임대 자체가 높게 잡힙니다.' });
  }

  const best = trip.offers?.[0];
  if (best) {
    if (typeof best.seats === 'number' && best.seats <= 4) {
      reasons.push({ key: 'seats', tone: 'up', weight: 3,
        label: `잔여석 ${best.seats}석`,
        detail: '해당 운임으로 남은 좌석이 얼마 없어 다음 조회 때 가격이 오를 수 있습니다.' });
    }
    const cls = best.out?.bookingClass;
    const tier = cls ? CLASS_TIERS[cls] : null;
    if (tier && tier[1] >= 2) {
      reasons.push({ key: 'class', tone: 'up', weight: tier[1],
        label: `예약클래스 ${cls} · ${tier[0]}`,
        detail: '더 싼 할인 운임 클래스가 이미 마감되어 상위 클래스만 남은 상태입니다.' });
    } else if (tier && tier[1] === 0) {
      reasons.push({ key: 'class', tone: 'down', weight: 0,
        label: `예약클래스 ${cls} · ${tier[0]}`,
        detail: '할인 운임 클래스가 아직 열려 있습니다.' });
    }
    if (best.out?.operating && best.out.operating !== best.out.carrier) {
      reasons.push({ key: 'codeshare', tone: 'info', weight: 0,
        label: `공동운항 (운항 ${best.out.operating})`,
        detail: '아시아나 편명이지만 실제 운항사는 다릅니다.' });
    }
  }

  // 같은 노선·같은 주에서 가장 짧은 일정(토·일) 대비 프리미엄
  const baseKey = `${trip.dest}|${trip.weekOf}|SAT_SUN`;
  const basePrice = baselines.destWeekPattern.get(baseKey);
  if (basePrice && trip.pattern !== 'SAT_SUN') {
    const p = pct(trip.price, basePrice);
    if (p >= 10) {
      const label = PATTERNS.find(x => x.id === trip.pattern)?.label || trip.pattern;
      reasons.push({ key: 'pattern', tone: 'up', weight: 1,
        label: `${label} 일정 프리미엄 +${p}%`,
        detail: `같은 주 토·일(1박2일) ${basePrice.toLocaleString('ko-KR')}원 대비 더 비쌉니다.` });
    }
  }

  const dday = Math.round((new Date(trip.depDate + 'T00:00:00Z') - new Date(today.toISOString().slice(0, 10) + 'T00:00:00Z')) / 86400000);
  if (dday >= 0 && dday <= 21) {
    reasons.push({ key: 'dday', tone: 'up', weight: 2,
      label: `출발 임박 D-${dday}`,
      detail: '출발 3주 이내에는 남은 저가 클래스가 거의 소진되어 운임이 올라갑니다.' });
  }

  if (baselines.all.min && trip.price === baselines.all.min) {
    reasons.unshift({ key: 'cheapest', tone: 'down', weight: 0,
      label: '수집 구간 전체 최저가',
      detail: '지금 데이터 안에서 가장 싼 조합입니다.' });
  }

  reasons.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  return reasons;
}

/** p25/p50/p75/p90 기준 히트맵 등급 (0=아주쌈 … 4=아주비쌈) */
export function heatLevel(price, all) {
  if (typeof price !== 'number' || !all?.p50) return null;
  if (price <= all.p25) return 0;
  if (price <= all.p50) return 1;
  if (price <= all.p75) return 2;
  if (price <= all.p90) return 3;
  return 4;
}
