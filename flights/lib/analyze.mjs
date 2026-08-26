// "왜 이 가격인가" 분석 — 구글의 시세 판정(price_insights), 달력(연휴·성수기),
// 같은 노선 중앙값 대비 편차, 여행 패턴 프리미엄, 이코노미↔비즈니스 격차를 근거로 배지를 만든다.

import { calendarContext } from './holidays.mjs';
import { PATTERNS, CABINS } from './config.mjs';

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

export const priceOf = (trip, cabinKey) => trip?.[cabinKey]?.price ?? null;
export const offersOf = (trip, cabinKey) => trip?.[cabinKey]?.offers || [];

function pct(value, base) {
  if (!base) return 0;
  return Math.round(((value - base) / base) * 100);
}

function baselineFor(trips, cabinKey) {
  const byDest = new Map();
  const byDestWeekPattern = new Map();
  for (const t of trips) {
    const p = priceOf(t, cabinKey);
    if (typeof p !== 'number') continue;
    if (!byDest.has(t.dest)) byDest.set(t.dest, []);
    byDest.get(t.dest).push(p);
    byDestWeekPattern.set(`${t.dest}|${t.weekOf}|${t.pattern}`, p);
  }
  const all = [...byDest.values()].flat();
  return {
    destMedian: new Map([...byDest].map(([k, v]) => [k, median(v)])),
    destWeekPattern: byDestWeekPattern,
    all: {
      min: all.length ? Math.min(...all) : null,
      median: median(all),
      p25: quantile(all, 0.25), p50: quantile(all, 0.5),
      p75: quantile(all, 0.75), p90: quantile(all, 0.9),
    },
  };
}

/** 좌석등급별 비교 기준 + 노선별 '비즈니스 ÷ 이코노미' 배수의 평소 수준. */
export function buildBaselines(trips) {
  const out = {};
  for (const c of CABINS) out[c.key] = baselineFor(trips, c.key);

  const ratios = new Map();
  for (const t of trips) {
    const y = priceOf(t, 'economy'), c = priceOf(t, 'business');
    if (typeof y !== 'number' || typeof c !== 'number' || !y) continue;
    if (!ratios.has(t.dest)) ratios.set(t.dest, []);
    ratios.get(t.dest).push(c / y);
  }
  out.ratioByDest = new Map([...ratios].map(([k, v]) => {
    const m = median(v.map(x => Math.round(x * 100)));
    return [k, m ? m / 100 : null];
  }));
  return out;
}

/**
 * 한 조합 · 한 좌석등급의 가격 근거 배지 목록.
 * @param cabinKey 'economy' | 'business'
 */
export function explain(trip, baselines, cabinKey = 'economy', today = new Date()) {
  const reasons = [];
  const price = priceOf(trip, cabinKey);
  const base = baselines[cabinKey];
  const cabinKo = CABINS.find(c => c.key === cabinKey)?.ko || cabinKey;

  if (typeof price !== 'number') {
    return [{ key: 'none', tone: 'info', label: `${cabinKo} 해당 시간대 없음`,
      detail: '지정한 출발·귀국 시간대에 아시아나 직항 왕복 조합이 없습니다.' }];
  }

  const destMed = base.destMedian.get(trip.dest);
  const diff = pct(price, destMed);
  if (destMed && Math.abs(diff) >= 8) {
    reasons.push(diff > 0
      ? { key: 'vs-route', tone: 'up', weight: Math.min(4, Math.round(diff / 12)),
          label: `이 노선 ${cabinKo} 평균 대비 +${diff}%`,
          detail: `${trip.dest} 노선 수집 구간 중앙값 ${destMed.toLocaleString('ko-KR')}원보다 비쌉니다.` }
      : { key: 'vs-route', tone: 'down', weight: 0,
          label: `이 노선 ${cabinKo} 평균 대비 ${diff}%`,
          detail: `${trip.dest} 노선 중앙값 ${destMed.toLocaleString('ko-KR')}원보다 쌉니다.` });
  }

  // ── 이코노미↔비즈니스 격차 ──────────────────────────
  const yPrice = priceOf(trip, 'economy');
  const cPrice = priceOf(trip, 'business');
  if (typeof yPrice === 'number' && typeof cPrice === 'number' && yPrice > 0) {
    const ratio = cPrice / yPrice;
    const usual = baselines.ratioByDest?.get(trip.dest);
    const gap = cPrice - yPrice;
    const cheapForBiz = usual && ratio <= usual * 0.85;

    if (cabinKey === 'business') {
      reasons.push({
        key: 'biz-ratio', tone: cheapForBiz ? 'down' : 'info', weight: cheapForBiz ? 0 : 1,
        label: cheapForBiz
          ? `비즈니스 가성비 · 이코노미의 ${ratio.toFixed(1)}배`
          : `이코노미의 ${ratio.toFixed(1)}배`,
        detail: usual
          ? `${trip.dest} 노선은 보통 ${usual.toFixed(1)}배입니다. 차액은 ${gap.toLocaleString('ko-KR')}원.`
          : `이코노미와의 차액은 ${gap.toLocaleString('ko-KR')}원입니다.`,
      });
    } else if (cheapForBiz) {
      reasons.push({
        key: 'biz-hint', tone: 'info', weight: 1,
        label: `+${gap.toLocaleString('ko-KR')}원이면 비즈니스`,
        detail: `${trip.dest} 노선 평소 배수(${usual.toFixed(1)}배)보다 격차가 좁습니다. 비즈니스 탭에서 확인해보세요.`,
      });
    }
  }

  // 지난 수집 대비 변화 — 우리가 직접 지켜본 그 조합의 가격 변화
  const slot = trip?.[cabinKey];
  if (typeof slot?.prevPrice === 'number' && slot.prevPrice > 0) {
    const d = pct(price, slot.prevPrice);
    const when = slot.prevAt ? `${+slot.prevAt.slice(5, 7)}/${+slot.prevAt.slice(8, 10)} 수집` : '지난 수집';
    if (d >= 5) {
      reasons.push({ key: 'trend', tone: 'up', weight: Math.min(4, Math.round(d / 8)),
        label: `지난 수집 대비 +${d}%`,
        detail: `${when} 때 ${slot.prevPrice.toLocaleString('ko-KR')}원이었습니다. 오르는 추세면 미루지 않는 편이 낫습니다.` });
    } else if (d <= -5) {
      reasons.push({ key: 'trend', tone: 'down', weight: 0,
        label: `지난 수집 대비 ${d}%`,
        detail: `${when} 때 ${slot.prevPrice.toLocaleString('ko-KR')}원에서 내려왔습니다.` });
    }
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

  // Google Flights 가 직접 주는 시세 판정 (평소 가격대 대비)
  const ins = trip?.[cabinKey]?.insights;
  if (ins?.level === 'high') {
    reasons.push({ key: 'insight', tone: 'up', weight: 4,
      label: '구글 기준 · 평소보다 비쌈',
      detail: ins.typicalLow && ins.typicalHigh
        ? `이 노선·기간의 통상 가격대는 ${ins.typicalLow.toLocaleString('ko-KR')}~${ins.typicalHigh.toLocaleString('ko-KR')}원입니다.`
        : '구글이 같은 노선의 과거 가격과 비교해 높은 편으로 판정했습니다.' });
  } else if (ins?.level === 'low') {
    reasons.push({ key: 'insight', tone: 'down', weight: 0,
      label: '구글 기준 · 평소보다 쌈',
      detail: ins.typicalLow && ins.typicalHigh
        ? `통상 가격대 ${ins.typicalLow.toLocaleString('ko-KR')}~${ins.typicalHigh.toLocaleString('ko-KR')}원보다 낮습니다.`
        : '구글이 같은 노선의 과거 가격과 비교해 낮은 편으로 판정했습니다.' });
  } else if (ins?.typicalHigh && price > ins.typicalHigh) {
    reasons.push({ key: 'insight', tone: 'up', weight: 3,
      label: `통상 가격대 상단 초과`,
      detail: `평소 ${ins.typicalLow?.toLocaleString('ko-KR') ?? '?'}~${ins.typicalHigh.toLocaleString('ko-KR')}원 구간을 넘었습니다.` });
  }

  const best = offersOf(trip, cabinKey)[0];
  if (best?.out?.oftenDelayed) {
    reasons.push({ key: 'delay', tone: 'info', weight: 0,
      label: '지연 잦은 편',
      detail: '구글이 이 편을 30분 이상 지연이 잦은 항공편으로 표시했습니다.' });
  }

  // 같은 노선·같은 주에서 가장 짧은 일정(토·일) 대비 프리미엄
  const basePrice = base.destWeekPattern.get(`${trip.dest}|${trip.weekOf}|SAT_SUN`);
  if (basePrice && trip.pattern !== 'SAT_SUN') {
    const p = pct(price, basePrice);
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

  if (base.all.min && price === base.all.min) {
    reasons.unshift({ key: 'cheapest', tone: 'down', weight: 0,
      label: `수집 구간 ${cabinKo} 최저가`,
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
