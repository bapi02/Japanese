// 화면 로직 — 저장된 시세(JSON)를 즉시 그리고, 프록시가 설정돼 있으면 라이브로 덮어쓴다.

import { PATTERNS, DESTINATIONS, CABINS, CARRIER_NAMES } from './lib/config.mjs';
import { buildBaselines, explain, quantile, priceOf, offersOf } from './lib/analyze.mjs';
import { calendarContext, HOLIDAY_DATA_END } from './lib/holidays.mjs';

const $ = (id) => document.getElementById(id);
const CFG_KEY = 'oz-jp-fare-cfg';
const DEFAULT_CFG = {
  proxy: '', adults: 1, limit: 12, autoRefresh: true,
  depFrom: '06:00', depTo: '09:00', retFrom: '18:00', retTo: '21:00',
};

const state = {
  data: null,
  baselines: null,
  dest: 'ALL',
  pattern: 'ALL',
  cabin: 'BOTH',      // 'BOTH' | 'economy' | 'business'
  view: 'grid',
  cfg: { ...DEFAULT_CFG },
  live: new Set(),    // `${tripId}::${cabinKey}` — 좌석등급 단위로 기록한다
  lastLiveAt: null,
  busy: false,
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const won = (n) => n.toLocaleString('ko-KR');
const manwon = (n) => `${(n / 10000).toFixed(1)}만`;
/** 지난 수집 대비 델타 뱃지 (±5% 이상일 때만) */
function deltaBadge(trip, key) {
  const slot = trip?.[key];
  if (typeof slot?.prevPrice !== 'number' || typeof slot?.price !== 'number' || !slot.prevPrice) return '';
  const d = Math.round(((slot.price - slot.prevPrice) / slot.prevPrice) * 100);
  if (Math.abs(d) < 5) return '';
  return d > 0
    ? `<span class="delta up">▲${d}%</span>`
    : `<span class="delta down">▼${-d}%</span>`;
}
const md = (iso) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
const mdd = (iso) => `${md(iso)}(${DOW[new Date(iso + 'T00:00:00Z').getUTCDay()]})`;
const shortWin = (w) => w ? `${+w[0].slice(0, 2)}–${+w[1].slice(0, 2)}시` : '';
const destInfo = (code) => DESTINATIONS.find(d => d.code === code) || { code, ko: code, city: code };
const cabinMeta = (key) => CABINS.find(c => c.key === key);
/** 정렬·히트맵 기준이 되는 좌석등급 */
const primaryCabin = () => state.cabin === 'business' ? 'business' : 'economy';
const otherCabin = (key) => key === 'economy' ? 'business' : 'economy';
const isLive = (trip, key) => state.live.has(`${trip.id}::${key}`);
const liveTripCount = () => new Set([...state.live].map(k => k.split('::')[0])).size;

/* ── 라이브 캐시 ───────────────────────── */
// 온디맨드로 조회한 등급 슬롯을 기기에 보존한다. 새로고침해도 무료 한도를 다시 쓰지 않게.
const LIVE_CACHE_KEY = 'oz-jp-live-cache';
const LIVE_CACHE_TTL = 6 * 60 * 60 * 1000;   // 6시간

function readLiveCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(LIVE_CACHE_KEY) || '{}');
    const now = Date.now();
    const fresh = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v?.at && now - new Date(v.at) < LIVE_CACHE_TTL) fresh[k] = v;
    }
    return fresh;
  } catch { return {}; }
}

function saveLiveCache(tripId, cabinKey, slot) {
  try {
    const cache = readLiveCache();
    cache[`${tripId}::${cabinKey}`] = { at: new Date().toISOString(), slot };
    const entries = Object.entries(cache);
    // 오래된 것부터 버려 200개로 제한
    if (entries.length > 200) {
      entries.sort((a, b) => a[1].at.localeCompare(b[1].at));
      for (const [k] of entries.slice(0, entries.length - 200)) delete cache[k];
    }
    localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

/** 저장 시세보다 새로운 캐시 항목을 데이터에 덮어쓴다. */
function applyLiveCache(data) {
  const cache = readLiveCache();
  let applied = 0;
  const generatedAt = new Date(data.generatedAt || 0);
  const byId = new Map(data.trips.map(t => [t.id, t]));
  for (const [k, v] of Object.entries(cache)) {
    const [tripId, cabinKey] = k.split('::');
    const trip = byId.get(tripId);
    if (!trip || !v.slot) continue;
    if (new Date(v.at) <= generatedAt) continue;   // 그 사이 새 수집이 돌았으면 수집분 우선
    trip[cabinKey] = { ...v.slot, cachedAt: v.at };
    applied++;
  }
  return applied;
}

/* ── 설정 ─────────────────────────────── */
function loadCfg() {
  try { Object.assign(state.cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch {}
}
function saveCfg() {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(state.cfg)); } catch {}
}

/* ── 토스트 / 시트 ─────────────────────── */
let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), ms);
}
function openSheet(id) {
  $('scrim').classList.add('on');
  $(id).classList.add('on');
  document.body.style.overflow = 'hidden';
}
function closeSheets() {
  $('scrim').classList.remove('on');
  document.querySelectorAll('.sheet').forEach(s => s.classList.remove('on'));
  document.body.style.overflow = '';
}

/* ── 데이터 ───────────────────────────── */
async function loadData() {
  let data;
  if (globalThis.__PRICES__) {
    // 단일 파일 빌드(미리보기)에서는 데이터가 인라인으로 들어온다
    data = globalThis.__PRICES__;
  } else {
    const res = await fetch('./data/prices.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error(`prices.json 을 불러오지 못했습니다 (${res.status})`);
    data = await res.json();
  }
  for (const t of data.trips) {
    t.patternLabel ||= PATTERNS.find(p => p.id === t.pattern)?.label || t.pattern;
    for (const c of CABINS) t[c.key] ||= { price: null, offerCount: 0, offers: [], notQueried: true };
  }
  applyLiveCache(data);
  state.data = data;
  state.baselines = buildBaselines(data.trips);
}

function visibleTrips() {
  return state.data.trips.filter(t =>
    (state.dest === 'ALL' || t.dest === state.dest) &&
    (state.pattern === 'ALL' || t.pattern === state.pattern));
}

/** 주차 × 패턴 셀. 목적지가 '전체'면 기준 좌석등급 최저가로 대표시킨다. */
function cellsByWeek() {
  const key = primaryCabin();
  const weeks = new Map();
  for (const t of visibleTrips()) {
    if (!weeks.has(t.weekOf)) weeks.set(t.weekOf, new Map());
    const byPat = weeks.get(t.weekOf);
    const cur = byPat.get(t.pattern);
    if (!cur) {
      byPat.set(t.pattern, { best: t, all: [t] });
      continue;
    }
    cur.all.push(t);
    const p = priceOf(t, key), q = priceOf(cur.best, key);
    if (typeof p === 'number' && (typeof q !== 'number' || p < q)) cur.best = t;
  }
  return [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/* ── 렌더 ─────────────────────────────── */
function mkChip(label, sub, active, onClick) {
  const b = document.createElement('button');
  b.className = 'chip' + (active ? ' on' : '');
  b.innerHTML = label + (sub ? `<span class="sub">${sub}</span>` : '');
  b.onclick = onClick;
  return b;
}

function renderChips() {
  const key = primaryCabin();
  const cheapest = new Map();
  for (const t of state.data.trips) {
    const p = priceOf(t, key);
    if (typeof p !== 'number') continue;
    const m = cheapest.get(t.dest);
    if (!m || p < m) cheapest.set(t.dest, p);
  }
  const destsInData = state.data.destinations?.map(d => d.code)
    ?? [...new Set(state.data.trips.map(t => t.dest))];

  const cc = $('cabin-chips');
  cc.innerHTML = '';
  cc.appendChild(mkChip('이코노미 + 비즈니스', '', state.cabin === 'BOTH',
    () => { state.cabin = 'BOTH'; render(); }));
  for (const c of CABINS) {
    const n = state.data.trips.filter(t => typeof priceOf(t, c.key) === 'number').length;
    cc.appendChild(mkChip(c.ko, `${n}`, state.cabin === c.key,
      () => { state.cabin = c.key; render(); }));
  }

  const dc = $('dest-chips');
  dc.innerHTML = '';
  dc.appendChild(mkChip('전체', '', state.dest === 'ALL', () => { state.dest = 'ALL'; render(); }));
  for (const code of destsInData) {
    const min = cheapest.get(code);
    dc.appendChild(mkChip(destInfo(code).ko, min ? `${Math.round(min / 10000)}만~` : '—',
      state.dest === code, () => { state.dest = code; render(); }));
  }

  const pc = $('pat-chips');
  pc.innerHTML = '';
  pc.appendChild(mkChip('모든 일정', '', state.pattern === 'ALL', () => { state.pattern = 'ALL'; render(); }));
  for (const p of PATTERNS) {
    pc.appendChild(mkChip(p.label, `${p.nights}박`, state.pattern === p.id,
      () => { state.pattern = p.id; render(); }));
  }
}

function renderHeader() {
  const d = state.data;
  const badge = $('src-badge');
  const isSample = d.source === 'sample';
  const liveN = liveTripCount();
  badge.className = 'badge ' + (isSample && !liveN ? 'sample' : liveN ? 'live' : '');
  badge.textContent = isSample && !liveN ? '샘플 데이터'
    : liveN ? '실시간 조회' : '저장된 시세';

  const ago = (iso) => {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    if (mins < 1440) return `${Math.floor(mins / 60)}시간 전`;
    return `${Math.floor(mins / 1440)}일 전`;
  };
  const p = d.params || {};
  const when = state.lastLiveAt
    ? `실시간 ${liveN}건 ${ago(state.lastLiveAt)} · 나머지 ${ago(d.generatedAt)} 수집분`
    : `${ago(d.generatedAt)} 갱신`;
  $('updated').textContent =
    `${when} · ${shortWin(p.depWindow)} 출발 / ${shortWin(p.retWindow)} 귀국 · ${(p.carriers || ['OZ']).map(c => CARRIER_NAMES[c] || c).join('/')} 직항`;

  $('refresh-btn').className = 'refresh-btn' + (state.cfg.proxy ? '' : ' ghost');
  $('view-btn').textContent = state.view === 'grid' ? '▦' : '☰';
}

function renderNotice() {
  const slot = $('notice-slot');
  slot.innerHTML = '';
  const msgs = [];
  if (globalThis.__PREVIEW__) {
    const snap = state.data.generatedAt ? new Date(state.data.generatedAt) : null;
    const when = snap ? `${snap.getMonth() + 1}/${snap.getDate()} ${String(snap.getHours()).padStart(2, '0')}:${String(snap.getMinutes()).padStart(2, '0')}` : '';
    msgs.push(`이 페이지는 <b>미리보기</b>입니다 — ${state.data.source === 'sample' ? '예시 데이터' : `${when} 수집 시세의 스냅샷`}이고, 실시간 조회는 배포본(GitHub Pages + Worker)에서 동작합니다.`);
  }
  if (globalThis.__PREVIEW__) {
    // 미리보기에서는 키 안내가 무의미하므로 아래 분기들을 건너뛴다
  } else if (state.data.source === 'sample' && state.live.size) {
    msgs.push(`<b>● 실시간</b> 표시가 붙은 값만 실제 조회 결과이고, 나머지는 화면 확인용 예시입니다.`);
  } else if (state.data.source === 'sample') {
    msgs.push('지금 보이는 값은 <b>화면 확인용 예시</b>입니다. 실제 시세를 보려면 SerpApi 키를 등록하세요 — 자동 수집은 저장소 시크릿, 실시간 조회는 ⚙ 설정의 프록시 주소.');
  } else if (!state.cfg.proxy) {
    msgs.push('프록시 주소가 없어 <b>자동 수집된 저장 시세</b>만 보고 있습니다. ⚙ 설정에 Worker 주소를 넣으면 새로고침할 때마다 현시점 시세를 조회합니다.');
  }
  if (visibleTrips().some(t => t.retDate > HOLIDAY_DATA_END)) {
    msgs.push(`공휴일 정보는 <b>${HOLIDAY_DATA_END.slice(0, 4)}년까지</b>만 들어 있습니다. 그 이후 날짜의 연휴·성수기 근거는 비어 있을 수 있습니다.`);
  }
  for (const m of msgs) {
    const div = document.createElement('div');
    div.className = 'notice';
    div.innerHTML = m;
    slot.appendChild(div);
  }
}

function heatOf(price, qs) {
  if (typeof price !== 'number' || !qs) return null;
  if (price <= qs[0]) return 0;
  if (price <= qs[1]) return 1;
  if (price <= qs[2]) return 2;
  if (price <= qs[3]) return 3;
  return 4;
}

/** 셀 안의 보조 좌석등급 한 줄 */
function subCabinLine(trip, subKey) {
  const meta = cabinMeta(subKey);
  const p = priceOf(trip, subKey);
  const main = priceOf(trip, primaryCabin());
  if (typeof p !== 'number') {
    return trip[subKey]?.notQueried
      ? `<span class="subcabin ask"><b>${meta.short}</b> 탭해서 조회</span>`
      : `<span class="subcabin none">${meta.short} 해당 시간대 없음</span>`;
  }
  const ratio = typeof main === 'number' && main > 0
    ? (subKey === 'business' ? (p / main) : (main / p)) : null;
  return `<span class="subcabin"><b>${meta.short}</b> ${won(p)}원${
    ratio ? `<span class="x">×${ratio.toFixed(1)}</span>` : ''}${
    isLive(trip, subKey) ? '<span class="x" style="color:var(--green)">●</span>' : ''}</span>`;
}

function renderGrid() {
  const main = $('main');
  main.innerHTML = '';
  const key = primaryCabin();
  const weeks = cellsByWeek();
  const prices = visibleTrips().map(t => priceOf(t, key)).filter(p => typeof p === 'number');
  if (!prices.length) {
    const allUnqueried = visibleTrips().every(t => t[key]?.notQueried);
    main.innerHTML = allUnqueried
      ? `<div class="empty-state">${cabinMeta(key).ko}는 자동 수집하지 않습니다.<br>
         <span style="font-size:11.5px">무료 조회 한도를 아끼려고, 보고 싶은 칸을 열었을 때만 조회합니다.<br>
         위에서 <b>이코노미 + 비즈니스</b>를 고른 뒤 칸을 눌러보세요.</span></div>`
      : '<div class="empty-state">조건에 맞는 항공편이 없습니다.<br>필터를 바꿔보세요.</div>';
    $('stat-line').textContent = '';
    return;
  }
  const qs = [quantile(prices, .2), quantile(prices, .4), quantile(prices, .6), quantile(prices, .85)];
  $('stat-line').textContent =
    `${cabinMeta(key).ko} 최저 ${manwon(Math.min(...prices))} · 중앙 ${manwon(quantile(prices, .5))}`;

  for (const [weekOf, byPat] of weeks) {
    const card = document.createElement('div');
    card.className = 'week';
    const lastRet = [...byPat.values()].reduce((a, c) => c.best.retDate > a ? c.best.retDate : a, weekOf);
    const cal = calendarContext(weekOf, lastRet);
    const holidayTag = cal.kr[0]?.name || cal.seasons[0]?.name || cal.jp[0]?.name || '';
    const nth = Math.ceil(+weekOf.slice(8, 10) / 7);
    card.innerHTML = `
      <div class="week-head">
        <span class="wk">${+weekOf.slice(5, 7)}월 ${nth}주</span>
        <span class="rng">${mdd(weekOf)} – ${mdd(lastRet)}</span>
        ${holidayTag ? `<span class="tag">${holidayTag}</span>` : ''}
      </div>`;

    const cells = document.createElement('div');
    cells.className = 'cells';
    for (const p of PATTERNS) {
      if (state.pattern !== 'ALL' && state.pattern !== p.id) continue;
      const entry = byPat.get(p.id);
      const btn = document.createElement('button');
      btn.className = 'cell';
      const t = entry?.best;
      const price = t ? priceOf(t, key) : null;

      if (typeof price !== 'number') {
        btn.classList.add('empty');
        btn.innerHTML = `
          <span class="pat">${p.label}</span>
          <span class="dates">${t ? `${md(t.depDate)} → ${md(t.retDate)}` : ''}</span>
          <span class="price">해당 시간대 없음</span>`;
        if (t) btn.onclick = () => openDetail(entry);
      } else {
        const h = heatOf(price, qs);
        btn.classList.add(`hb${h}`);
        const topUp = explain(t, state.baselines, key).find(r => r.tone === 'up');
        btn.innerHTML = `
          <i class="bar b${h}"></i>
          <span class="pat">${p.label}</span>
          <span class="dates">${md(t.depDate)} → ${md(t.retDate)} · ${p.nights}박</span>
          <span class="price h${h}">${won(price)}<span class="won">원</span>${deltaBadge(t, key)}</span>
          ${state.cabin === 'BOTH' ? subCabinLine(t, otherCabin(key)) : ''}
          <span class="meta">
            ${state.dest === 'ALL' ? `<span class="dest-tag">${destInfo(t.dest).city}</span>` : ''}
            ${isLive(t, key) ? '<span style="color:var(--green)">● 실시간</span>' : ''}
          </span>
          ${topUp ? `<span class="why">↑ ${topUp.label}</span>` : ''}`;
        btn.onclick = () => openDetail(entry);
      }
      cells.appendChild(btn);
    }
    card.appendChild(cells);
    main.appendChild(card);
  }
}

function renderList() {
  const main = $('main');
  main.innerHTML = '';
  const key = primaryCabin();
  const trips = visibleTrips()
    .filter(t => typeof priceOf(t, key) === 'number')
    .sort((a, b) => priceOf(a, key) - priceOf(b, key));
  if (!trips.length) {
    main.innerHTML = '<div class="empty-state">조건에 맞는 항공편이 없습니다.</div>';
    $('stat-line').textContent = '';
    return;
  }
  const prices = trips.map(t => priceOf(t, key));
  const qs = [quantile(prices, .2), quantile(prices, .4), quantile(prices, .6), quantile(prices, .85)];
  $('stat-line').textContent = `${cabinMeta(key).ko} ${trips.length}건 · 최저 ${manwon(prices[0])}`;

  trips.slice(0, 60).forEach((t, i) => {
    const price = priceOf(t, key);
    const h = heatOf(price, qs);
    const top = explain(t, state.baselines, key).find(r => r.tone === 'up');
    const b = document.createElement('button');
    b.className = 'list-item';
    b.innerHTML = `
      <span class="rank">${i + 1}</span>
      <span class="li-main">
        <span class="li-top">${destInfo(t.dest).ko}
          <span class="badge">${t.patternLabel}</span></span>
        <span class="li-sub">${mdd(t.depDate)} → ${mdd(t.retDate)} · ${t.nights ?? ''}박${top ? ` · ${top.label}` : ''}</span>
        ${state.cabin === 'BOTH' ? `<span class="li-sub">${subCabinLine(t, otherCabin(key))}</span>` : ''}
      </span>
      <span class="li-price h${h}">${won(price)}<span class="won" style="font-size:11px">원</span></span>`;
    b.onclick = () => openDetail({ best: t, all: [t] });
    main.appendChild(b);
  });
}

function render() {
  renderChips();
  renderHeader();
  renderNotice();
  state.view === 'grid' ? renderGrid() : renderList();
}

/* ── 상세 시트 ─────────────────────────── */
function legHtml(dir, leg) {
  return `
    <div class="leg">
      <span class="dir">${dir}</span>
      <span class="legmain">
        <span class="times">${leg.depTime}<span class="mid">→</span>${leg.arrTime}</span>
        <span class="route">${leg.from} → ${leg.to}${leg.minutes ? ` · ${Math.floor(leg.minutes / 60)}시간 ${leg.minutes % 60}분` : ''}${leg.aircraft ? ` · ${leg.aircraft}` : ''}</span>
      </span>
      <span class="fno">${leg.number}${leg.bookingClass ? `<br><span class="cls">${leg.bookingClass}</span>` : ''}</span>
    </div>`;
}

function openDetail(entry, cabinKey = primaryCabin()) {
  const t = entry.best;
  const info = destInfo(t.dest);
  const price = priceOf(t, cabinKey);
  const meta = cabinMeta(cabinKey);
  const reasons = explain(t, state.baselines, cabinKey);

  $('detail-head').innerHTML = `
    <div class="st">${info.ko} <span style="color:var(--text-muted);font-weight:600;font-size:13px">${t.dest}</span></div>
    <div class="ss">${mdd(t.depDate)} → ${mdd(t.retDate)} · ${t.patternLabel} (${t.nights ?? ''}박${(t.nights ?? 0) + 1}일)</div>
    <div class="cabin-seg">
      ${CABINS.map(c => {
        const p = priceOf(t, c.key);
        const label = typeof p === 'number' ? won(p) + '원'
          : t[c.key]?.notQueried ? '조회하기' : '없음';
        return `<button class="${c.key === cabinKey ? 'on' : ''}${t[c.key]?.notQueried ? ' ask' : ''}" data-cabin="${c.key}">
          ${c.ko}${isLive(t, c.key) ? ' ●' : ''}<span>${label}</span></button>`;
      }).join('')}
    </div>
    ${typeof price === 'number'
      ? `<div class="sp">${won(price)}<span class="won">원</span>
           <span style="font-size:11px;color:var(--text-muted);font-weight:600;margin-left:6px">${meta.ko} · 성인 ${state.cfg.adults}인 · 총액${
             t[cabinKey]?.cachedAt && !isLive(t, cabinKey)
               ? ` · ${Math.max(1, Math.round((Date.now() - new Date(t[cabinKey].cachedAt)) / 60000))}분 전 조회` : ''}</span></div>`
      : t[cabinKey]?.notQueried
        ? `<div class="sp" style="font-size:15px;color:var(--text-dim)">${meta.ko}는 아직 조회하지 않았습니다</div>`
        : `<div class="sp" style="font-size:16px;color:var(--text-dim)">${meta.ko}는 이 시간대에 운항/좌석이 없습니다</div>`}`;

  const others = (entry.all || []).filter(x => x.dest !== t.dest && typeof priceOf(x, cabinKey) === 'number')
    .sort((a, b) => priceOf(a, cabinKey) - priceOf(b, cabinKey));
  const offers = offersOf(t, cabinKey);

  const ins = t[cabinKey]?.insights;
  $('detail-body').innerHTML = `
    ${ins?.typicalLow && ins?.typicalHigh ? `
      <div class="insight ${ins.level || 'typical'}">
        <span class="ilevel">${({ low: '평소보다 쌈', typical: '평소 수준', high: '평소보다 비쌈' })[ins.level] || '평소 수준'}</span>
        <span class="irange">통상 ${won(ins.typicalLow)}~${won(ins.typicalHigh)}원</span>
      </div>` : ''}
    <div class="sec-t">가격 근거</div>
    ${reasons.map(r => `
      <div class="reason ${r.tone}">
        <span class="dot"></span>
        <span class="rtext"><span class="rl">${r.label}</span><span class="rd">${r.detail}</span></span>
      </div>`).join('') || '<div class="reason"><span class="dot"></span><span class="rtext"><span class="rl">특이사항 없음</span><span class="rd">평균 수준의 가격입니다.</span></span></div>'}

    ${offers.length ? `
      <div class="sec-t">${meta.ko} 항공편 ${offers.length}개</div>
      ${offers.map((o, i) => `
        <div class="flight">
          <div class="fh">
            <span class="fp">${won(o.price)}원</span>
            <span class="fseat">왕복 총액</span>
          </div>
          ${legHtml('출국', o.out)}
          ${o.ret ? legHtml('귀국', o.ret)
            : o.returns?.length
              ? `<div class="ret-note">귀국편 후보 ${o.returns.length}개</div>` + o.returns.map(r => legHtml('귀국', r.leg)).join('')
              : `<div class="ret-ask">
                   <span>귀국편은 ${state.cfg.retFrom}–${state.cfg.retTo} 조건으로 값이 계산됐습니다. 실제 편명·시각은 따로 조회합니다.</span>
                   <button class="ret-btn" data-ret="${i}"${o.departureToken ? '' : ' disabled'}>귀국편 후보 보기</button>
                 </div>`}
        </div>`).join('')}` : ''}

    ${others.length ? `
      <div class="sec-t">같은 날짜 다른 목적지 · ${meta.ko}</div>
      ${others.map(o => `
        <button class="list-item" data-trip="${o.id}" style="margin-bottom:6px">
          <span class="li-main"><span class="li-top">${destInfo(o.dest).ko}</span>
            <span class="li-sub">${o[cabinKey].offerCount}편 · ${o.dest}</span></span>
          <span class="li-price">${won(priceOf(o, cabinKey))}<span class="won" style="font-size:11px">원</span></span>
        </button>`).join('')}` : ''}

    <div class="link-row">
      <a class="link-btn" target="_blank" rel="noopener"
         href="https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ICN to ${t.dest} on ${t.depDate} through ${t.retDate} nonstop Asiana ${cabinKey === 'business' ? 'business class' : 'economy'}`)}">구글 항공권에서 비교</a>
      <a class="link-btn primary" target="_blank" rel="noopener" href="https://flyasiana.com">아시아나 예매</a>
    </div>
    ${state.cfg.proxy ? `<button class="link-btn" id="reload-one" style="width:100%;margin-top:8px">이 조합만 지금 다시 조회</button>` : ''}`;

  $('detail-head').querySelectorAll('[data-cabin]').forEach(b => {
    b.onclick = async () => {
      const key = b.dataset.cabin;
      if (t[key]?.notQueried) {
        if (!state.cfg.proxy) { openSheet('cfg-sheet'); toast('프록시 주소를 먼저 등록하세요'); return; }
        b.querySelector('span').textContent = '조회 중…';
        const ok = await fetchLive(t, [key]);
        state.baselines = buildBaselines(state.data.trips);
        render();
        const fresh = state.data.trips.find(x => x.id === t.id) || t;
        openDetail({ best: fresh, all: entry.all }, key);
        if (!ok) toast(`조회 실패 — ${state.lastError || '프록시 응답 없음'}`);
        return;
      }
      openDetail(entry, key);
    };
  });

  $('detail-body').querySelectorAll('[data-ret]').forEach(b => {
    b.onclick = async () => {
      if (!state.cfg.proxy) { openSheet('cfg-sheet'); toast('프록시 주소를 먼저 등록하세요'); return; }
      const offer = offers[Number(b.dataset.ret)];
      b.textContent = '조회 중…';
      b.disabled = true;
      const returns = await fetchReturns(t, cabinKey, offer);
      if (returns) { offer.returns = returns; openDetail(entry, cabinKey); }
      else { b.textContent = '조회 실패 — 다시 시도'; b.disabled = false; }
    };
  });
  $('detail-body').querySelectorAll('[data-trip]').forEach(b => {
    b.onclick = () => {
      const next = state.data.trips.find(x => x.id === b.dataset.trip);
      if (next) openDetail({ best: next, all: entry.all }, cabinKey);
    };
  });
  const one = $('reload-one');
  if (one) one.onclick = async () => {
    one.textContent = '조회 중…';
    const ok = await fetchLive(t, [cabinKey]);
    state.baselines = buildBaselines(state.data.trips);
    render();
    if (ok) {
      const fresh = state.data.trips.find(x => x.id === t.id);
      openDetail({ best: fresh, all: entry.all }, cabinKey);
    } else one.textContent = '조회 실패 — 다시 시도';
  };

  openSheet('detail-sheet');
}

/* ── 라이브 조회 ───────────────────────── */

/** 갱신 대상 선정: (날짜+패턴) 셀 단위로 묶고, 한도를 넘기면 셀 경계에서 끊는다.
 *  한 셀 안의 목적지 일부만 갱신돼 비교 기준이 섞이는 걸 막는다. */
function refreshTargets(limit) {
  const cells = new Map();
  for (const t of visibleTrips()) {
    const key = `${t.depDate}|${t.retDate}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(t);
  }
  const ordered = [...cells.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const out = [];
  for (const [, group] of ordered) {
    if (out.length && out.length + group.length > limit) break;
    out.push(...group);
    if (out.length >= limit) break;
  }
  return out.length ? out : (ordered[0]?.[1] || []).slice(0, limit);
}

function proxyUrl(trip, cabinKeys) {
  const base = state.cfg.proxy.replace(/\/+$/, '');
  const keys = cabinKeys?.length ? cabinKeys
    : state.cabin === 'BOTH' ? CABINS.map(c => c.key) : [state.cabin];
  const cabins = keys.map(k => CABINS.find(c => c.key === k)?.id).filter(Boolean);
  const q = new URLSearchParams({
    dest: trip.dest, dep: trip.depDate, ret: trip.retDate,
    adults: String(state.cfg.adults),
    cabins: cabins.join(','),
    depWindow: `${state.cfg.depFrom}-${state.cfg.depTo}`,
    retWindow: `${state.cfg.retFrom}-${state.cfg.retTo}`,
    pattern: trip.pattern || '', weekOf: trip.weekOf || '',
  });
  return `${base}/api/trip?${q}`;
}

async function fetchLive(trip, cabinKeys) {
  try {
    const res = await fetch(proxyUrl(trip, cabinKeys), { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    const idx = state.data.trips.findIndex(x => x.id === trip.id);
    if (idx >= 0) {
      const next = { ...state.data.trips[idx], fetchedAt: body.fetchedAt };
      for (const c of CABINS) {
        if (!body[c.key]) continue;
        next[c.key] = body[c.key];
        state.live.add(`${trip.id}::${c.key}`);
        saveLiveCache(trip.id, c.key, body[c.key]);
      }
      state.data.trips[idx] = next;
    }
    return true;
  } catch (err) {
    console.warn('[live]', trip.id, err.message);
    state.lastError = err.message;
    return false;
  }
}

/** 고른 가는편에 붙는 오는편 후보를 조회한다 (SerpApi 호출 1회). */
async function fetchReturns(trip, cabinKey, offer) {
  try {
    const base = state.cfg.proxy.replace(/\/+$/, '');
    const q = new URLSearchParams({
      dest: trip.dest, dep: trip.depDate, ret: trip.retDate,
      adults: String(state.cfg.adults),
      cabin: CABINS.find(c => c.key === cabinKey)?.id || 'ECONOMY',
      token: offer.departureToken || '',
      retWindow: `${state.cfg.retFrom}-${state.cfg.retTo}`,
    });
    const res = await fetch(`${base}/api/return?${q}`, { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body.returns || [];
  } catch (err) {
    console.warn('[return]', err.message);
    state.lastError = err.message;
    return null;
  }
}

async function refreshLive({ silent = false } = {}) {
  if (state.busy) return;
  if (!state.cfg.proxy) {
    openSheet('cfg-sheet');
    toast('먼저 프록시 주소를 등록하세요');
    return;
  }
  const targets = refreshTargets(state.cfg.limit);
  if (!targets.length) return;

  state.busy = true;
  state.lastError = null;
  const btn = $('refresh-btn');
  btn.disabled = true;
  const bar = $('progress');
  bar.classList.add('on');
  let done = 0, ok = 0;

  const tick = () => {
    bar.firstElementChild.style.width = `${Math.round((done / targets.length) * 100)}%`;
    btn.textContent = `조회 중 ${done}/${targets.length}`;
  };
  tick();

  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      // 일괄 갱신은 기준 등급만 부른다. 비즈니스는 셀을 열 때 온디맨드로 조회한다.
      if (await fetchLive(targets[cursor++], [primaryCabin()])) ok++;
      done++; tick();
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker));

  if (ok) state.lastLiveAt = new Date().toISOString();
  state.baselines = buildBaselines(state.data.trips);
  state.busy = false;
  btn.disabled = false;
  btn.textContent = '↻ 지금 시세';
  bar.classList.remove('on');
  bar.firstElementChild.style.width = '0';
  render();

  if (!silent || !ok) {
    toast(ok ? `${ok}건 갱신 완료` : `조회 실패 — ${state.lastError || '프록시 응답 없음'}`);
  }
}

/* ── 설정 UI ──────────────────────────── */
function fillCfgForm() {
  $('cfg-proxy').value = state.cfg.proxy;
  $('cfg-adults').value = String(state.cfg.adults);
  $('cfg-limit').value = String(state.cfg.limit);
  $('cfg-dep-from').value = state.cfg.depFrom;
  $('cfg-dep-to').value = state.cfg.depTo;
  $('cfg-ret-from').value = state.cfg.retFrom;
  $('cfg-ret-to').value = state.cfg.retTo;
  $('cfg-auto').classList.toggle('on', state.cfg.autoRefresh);
}

function wire() {
  $('scrim').onclick = closeSheets;
  document.querySelectorAll('.grab').forEach(g => { g.onclick = closeSheets; });
  $('cfg-btn').onclick = () => { fillCfgForm(); openSheet('cfg-sheet'); };
  $('refresh-btn').onclick = () => refreshLive();
  $('view-btn').onclick = () => { state.view = state.view === 'grid' ? 'list' : 'grid'; render(); };
  $('cfg-auto').onclick = (e) => e.currentTarget.classList.toggle('on');
  $('cfg-reset').onclick = () => { state.cfg = { ...DEFAULT_CFG }; fillCfgForm(); };
  $('cfg-save').onclick = () => {
    const raw = $('cfg-proxy').value.trim();
    if (raw && !/^https?:\/\//.test(raw)) { toast('프록시 주소는 http(s):// 로 시작해야 합니다'); return; }
    Object.assign(state.cfg, {
      proxy: raw.replace(/\/+$/, ''),
      adults: Number($('cfg-adults').value),
      limit: Number($('cfg-limit').value),
      depFrom: $('cfg-dep-from').value || DEFAULT_CFG.depFrom,
      depTo: $('cfg-dep-to').value || DEFAULT_CFG.depTo,
      retFrom: $('cfg-ret-from').value || DEFAULT_CFG.retFrom,
      retTo: $('cfg-ret-to').value || DEFAULT_CFG.retTo,
      autoRefresh: $('cfg-auto').classList.contains('on'),
    });
    saveCfg();
    closeSheets();
    render();
    toast(state.cfg.proxy ? '저장했습니다 · 지금 시세를 조회합니다' : '저장했습니다');
    if (state.cfg.proxy) refreshLive();
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });
}

/* ── 시작 ─────────────────────────────── */
(async function init() {
  loadCfg();
  wire();
  try {
    await loadData();
  } catch (err) {
    $('main').innerHTML = `<div class="empty-state">데이터를 불러오지 못했습니다.<br><span style="font-size:11px">${err.message}</span></div>`;
    $('src-badge').textContent = '오류';
    return;
  }
  render();
  if (state.cfg.proxy && state.cfg.autoRefresh) refreshLive({ silent: true });
})();
