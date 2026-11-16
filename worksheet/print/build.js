/* 일본어 학습지 → 인쇄용 PDF (실제 구몬 학습지 레이아웃을 따라 만듦)
   사용법: node worksheet/print/build.js  → worksheet/print/out/일본어학습지_초급.pdf
   - 데이터: ../data.js
   - 용지: B5 (182×257mm) — 구몬 학습지와 같은 크기. A4 프린터에서는 "용지에 맞춤"으로 출력하세요.
   - 폰트: fonts/ (Klee One = 교과서체 느낌, Noto Sans KR/JP) */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname, OUT = path.join(ROOT, 'out'), FONTS = path.join(ROOT, 'fonts');
fs.mkdirSync(OUT, { recursive: true });
const src = fs.readFileSync(path.join(ROOT, '..', 'data.js'), 'utf8');
const src2 = fs.readFileSync(path.join(ROOT, '..', 'data2.js'), 'utf8');
const VOL = Number(process.argv[2] || 1); // 권 (1 또는 2)
const ALL = new Function(src + src2 + ';return {WS_STEPS, WS_LEVELS};')();
const WS_STEPS = ALL.WS_STEPS.filter((s) => (s.vol || 1) === VOL);
const WS_LEVELS = ALL.WS_LEVELS.filter((l) => (l.vol || 1) === VOL);

/* ── 유틸 ── */
const RUBY_RE = /\{([^|{}]+)\|([^|{}]+)\}/g;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ruby = (s) => esc(s).replace(RUBY_RE, '<ruby>$1<rt>$2</rt></ruby>');
const rubyHtml = (s) => String(s ?? '').replace(RUBY_RE, '<ruby>$1<rt>$2</rt></ruby>');
const kanji = (s) => String(s ?? '').replace(RUBY_RE, '$1');
const fontUrl = (f) => 'file://' + path.join(FONTS, f);
const dataUri = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64'); // about:blank 에서는 file:// 이미지가 막혀서 인라인
const LETTER = { intro: 'A', basic: 'B', use: 'C', ext: 'D', plain: 'E', adv: 'F' };
const codeOf = (s) => { const n = WS_STEPS.filter((x) => x.level === s.level && x.id <= s.id).length; return { letter: LETTER[s.level], n }; };

/* 페이지 치수 (px, 96dpi) */
const MM = 96 / 25.4;
/* 출력 모드: screen(화면·집 인쇄용, 기본) | wireless(무선제본 인쇄소용) | spring(스프링제본 인쇄소용)
   인쇄소용은 재단 여백(BLEED 3mm) + 제본 쪽 여백(GUTTER)을 홀짝 페이지에 번갈아 넣고, 표지·내지를 따로 냄 */
const MODE = process.argv[3] || 'screen';
const BLEED = MODE === 'screen' ? 0 : 3;
const GUTTER = MODE === 'wireless' ? 6 : MODE === 'spring' ? 10 : 0;
const SPINE = Number(process.argv[4] || (VOL > 1 ? 4.5 : 4)); // 책등 두께 mm (무선제본)
const PAGE_W = 182 + 2 * BLEED, PAGE_H = 257 + 2 * BLEED, M_TOP = 11 + BLEED, M_BOT = 11 + BLEED, M_SIDE = 13 + BLEED;
const CONTENT_H = Math.floor((PAGE_H - M_TOP - M_BOT) * MM);

const CSS = `
@font-face { font-family: 'Klee'; src: url('${fontUrl('KleeOne-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'Klee'; src: url('${fontUrl('KleeOne-600.ttf')}'); font-weight: 600; }
@font-face { font-family: 'NSJP'; src: url('${fontUrl('NotoSansJP-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'NSJP'; src: url('${fontUrl('NotoSansJP-700.ttf')}'); font-weight: 700; }
@font-face { font-family: 'NSKR'; src: url('${fontUrl('NotoSansKR-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'NSKR'; src: url('${fontUrl('NotoSansKR-700.ttf')}'); font-weight: 700; }
:root { --mint: #cfe9e3; --mint-d: #8fcdc0; --mint-bg: #e8f5f2; --teal: #4aaa9a; --ink: #222; --gray: #777; --lgray: #b5b5b5; --line: #2b2b2b; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: var(--ink); font-family: 'NSKR', 'NSJP', sans-serif; font-size: 10.5pt; line-height: 1.5; }
.jp { font-family: 'Klee', 'NSJP', serif; }
ruby { ruby-position: over; }
rt { font-size: 0.42em; color: #333; letter-spacing: 0; font-family: 'Klee', 'NSJP'; font-weight: 400; line-height: 1; }
.page { width: ${(PAGE_W - 2 * M_SIDE - GUTTER) * MM}px; height: ${CONTENT_H}px; overflow: hidden; break-after: page; position: relative; }
.page.recto { margin-left: ${GUTTER * MM}px; }
.page.key { margin-left: ${GUTTER / 2 * MM}px; }
.page:last-child { break-after: auto; }
.measure .page { height: auto; overflow: visible; break-after: auto; }

/* ── 머리글 ── */
.hdr { display: flex; justify-content: space-between; align-items: flex-start; height: 44px; margin-bottom: 6px; }
.hdr .lg { display: flex; align-items: flex-end; gap: 10px; }
.hdr .mark { width: 36px; height: 36px; border: 1.5px solid #999; border-radius: 3px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #666; }
.hdr .mark .m1 { font-size: 15px; font-family: 'Klee'; line-height: 1; }
.hdr .mark .m2 { font-size: 6px; letter-spacing: 1.5px; margin-top: 2px; }
.hdr .code { font-size: 24px; color: #8a8a8a; letter-spacing: 1px; line-height: 1; padding-bottom: 2px; font-family: 'NSKR'; }
.hdr .code b { font-weight: 400; font-size: 26px; margin-right: 6px; }
.hdr .ser { font-size: 10pt; color: #666; padding-top: 4px; letter-spacing: 0.5px; }
.hdr.sub .mark, .hdr.sub .ser { visibility: hidden; }

/* ── 제목 박스 + 날짜/이름 ── */
.tbar { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 8px; }
.tbox { width: 350px; border: 1.5px solid var(--mint-d); border-radius: 4px; overflow: hidden; }
.tbox .t1 { background: var(--mint); padding: 3px 10px; font-size: 11.5pt; font-weight: 700; color: #2a4a44; display: flex; justify-content: space-between; align-items: center; }
.tbox .t1 svg { width: 22px; height: 22px; }
.tbox .t2 { padding: 6px 10px 3px; font-size: 14.5pt; line-height: 1.75; background: #fff; letter-spacing: 1px; }
.meta { flex: 1; padding-top: 2px; color: #555; font-size: 10pt; }
.meta .r { display: flex; align-items: flex-end; gap: 6px; border-bottom: 1px solid #777; height: 24px; margin-bottom: 6px; letter-spacing: 3px; white-space: nowrap; }
.meta .r.nm { letter-spacing: 1px; }
.meta .r .lab { color: #777; font-size: 9.5pt; letter-spacing: 1px; margin-right: 2px; }

/* ── 포인트 (작게) ── */
.pt { font-size: 8.8pt; color: #555; line-height: 1.55; margin: 0 0 10px 2px; padding-left: 8px; border-left: 2px solid var(--mint-d); }
.pt b { color: #2a4a44; }
.pt .rules { display: grid; grid-template-columns: repeat(2, 1fr); column-gap: 14px; margin: 2px 0 1px; }
.pt .rules div { color: #666; }
.pt .rules .jp { font-size: 9.5pt; color: #222; margin-right: 4px; }
.pt .tip { color: #666; }

/* ── 섹션 ── */
.sec { display: flex; align-items: center; gap: 7px; margin: 8px 0 6px; font-size: 10.5pt; break-after: avoid; }
.sec .n { font-size: 19pt; font-weight: 700; color: var(--teal); line-height: 1; min-width: 16px; }
.sec .ic { width: 16px; height: 16px; }
.sec .tag { font-size: 8pt; color: #555; border: 1px solid #888; border-radius: 2px; padding: 0 4px; line-height: 1.4; }
.sec .hb { display: inline-block; width: 26px; height: 13px; background: #d9d9d9; border-radius: 2px; vertical-align: middle; }

/* ── 본문 박스 ── */
.pbox { border: 2px solid var(--mint-d); border-radius: 10px; padding: 10px 16px 8px; position: relative; margin-bottom: 10px; }
.pbox .ptag { position: absolute; top: -9px; right: 14px; background: #fff; padding: 0 5px; font-size: 8pt; color: #555; display: flex; align-items: center; gap: 4px; }
.pbox .ptag span { border: 1px solid #888; border-radius: 2px; padding: 0 4px; }
.pbox .pl { font-size: 16pt; line-height: 2.05; letter-spacing: 2px; }
.pbox .pimg { display: block; width: 340px; height: 230px; object-fit: cover; border-radius: 10px; margin: 4px auto 10px; }
.pbox .pk { clear: none; }
.pbox .pk { margin-top: 6px; font-size: 9.5pt; color: #333; line-height: 1.6; }
.pbox .pk div { white-space: nowrap; }

/* ── 답 쓰는 줄 ── */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 26px; row-gap: 4px; }
.q { font-size: 10.5pt; line-height: 1.5; }
.ln { border-bottom: 1.3px solid var(--line); height: 38px; }
.ln.s { height: 30px; }
.blk { break-inside: avoid; display: flow-root; }

/* 문제 유형별 */
.it { margin-bottom: 8px; }
.it .q { display: flex; gap: 6px; align-items: baseline; }
.it .no { font-size: 10.5pt; min-width: 22px; }
.jq { font-size: 14pt; letter-spacing: 1px; line-height: 1.9; }
.jq .bl { display: inline-block; min-width: 96px; border-bottom: 1.3px solid var(--line); height: 1.3em; vertical-align: bottom; margin: 0 4px; }
.jq .bl.w { min-width: 220px; }
.kq { font-size: 10.5pt; color: #222; }
.ko { font-size: 8.8pt; color: #666; margin-left: 28px; }
.trace { margin: 2px 0 0 28px; }
.trace .g { font-size: 15pt; letter-spacing: 2px; color: #c9c9c9; line-height: 1.5; border-bottom: 1.3px solid var(--line); padding: 1px 4px 0; }
.trace .g rt { color: #d0d0d0; }
.trace .ln { margin-top: 2px; }
.opts { margin-left: 28px; font-size: 13pt; }
.opts span { display: inline-block; margin: 0 6px; }
.opts .sep { color: #888; margin: 0; }
.hint { display: inline-flex; align-items: center; background: #e3e3e3; border-radius: 3px; padding: 2px 10px; font-size: 13pt; margin-left: 14px; letter-spacing: 1px; line-height: 1.7; }
.hint i { font-style: normal; display: inline-block; width: 1px; height: 1.2em; background: #999; margin: 0 10px; }
.cq { display: flex; align-items: center; margin-bottom: 2px; }
.cq .no { min-width: 22px; }
.cline { margin: 0 0 0 28px; font-size: 14pt; letter-spacing: 1px; line-height: 1.9; }
.cline .bl { display: inline-block; min-width: 300px; border-bottom: 1.3px solid var(--line); height: 1.3em; vertical-align: bottom; }
.tr { display: flex; align-items: baseline; gap: 8px; margin: 0 0 0 28px; }
.tr .arrow { color: #666; }
.tr .bl { display: inline-block; width: 200px; border-bottom: 1.3px solid var(--line); height: 1.4em; vertical-align: bottom; }
.tr .inst { font-size: 8.5pt; color: #555; border: 1px solid #aaa; border-radius: 2px; padding: 0 5px; }

/* ── 표지 / 정답 ── */
.cover { padding-top: 120px; text-align: center; }
.cover .lg { display: inline-flex; flex-direction: column; align-items: center; border: 2px solid #999; border-radius: 6px; width: 90px; height: 90px; justify-content: center; color: #666; margin-bottom: 20px; }
.cover .lg .m1 { font-size: 40px; font-family: 'Klee'; line-height: 1; }
.cover .lg .m2 { font-size: 10px; letter-spacing: 3px; margin-top: 4px; }
.cover h1 { font-size: 26pt; font-weight: 700; margin-bottom: 4px; }
.cover .s { font-size: 11pt; color: #666; margin-bottom: 26px; }
.cover .toc { display: inline-block; text-align: left; font-size: 10pt; line-height: 1.85; column-count: 2; column-gap: 34px; }
.cover .toc .lv { font-weight: 700; color: #2a4a44; background: var(--mint); padding: 0 8px; border-radius: 3px; margin: 8px 0 2px; break-after: avoid; }
.cover .toc .lv:first-child { margin-top: 0; }
.cover .toc .cd { display: inline-block; width: 34px; color: #888; }
.cover .how { margin-top: 30px; font-size: 9pt; color: #666; line-height: 1.8; }
.key h1 { font-size: 15pt; margin-bottom: 2px; }
.key .lead { font-size: 9pt; color: #666; margin-bottom: 8px; }
.ks { break-inside: avoid; margin-bottom: 8px; border-top: 1.5px solid var(--mint-d); padding-top: 4px; }
.ks h2 { font-size: 10.5pt; color: #2a4a44; margin-bottom: 2px; }
.ks h2 small { color: #888; font-weight: 400; margin-left: 6px; font-size: 8.5pt; }
.ks ol { columns: 2; column-gap: 18px; list-style: none; font-size: 9.5pt; }
.ks li { break-inside: avoid; line-height: 1.75; }
.ks li .kn { color: #888; font-size: 8pt; margin-right: 4px; }
.ks li .alt { color: #888; font-size: 8pt; }
`;

const CAT = `<svg viewBox="0 0 24 24" fill="none" stroke="#2a4a44" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"><path d="M4 10 L4 4 L8.5 7.5 M20 10 L20 4 L15.5 7.5"/><path d="M4 10 C4 17 7 20 12 20 C17 20 20 17 20 10 C20 7 17 6 12 6 C7 6 4 7 4 10 Z"/><circle cx="9" cy="12" r="0.9" fill="#2a4a44"/><circle cx="15" cy="12" r="0.9" fill="#2a4a44"/><path d="M11 15 L12 16 L13 15 M2 12 L6 13 M2 15 L6 14.5 M22 12 L18 13 M22 15 L18 14.5"/></svg>`;
const FACE = `<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="#4aaa9a" stroke-width="1.2"><circle cx="8" cy="8" r="6.5"/><circle cx="6" cy="7" r="0.7" fill="#4aaa9a"/><circle cx="10" cy="7" r="0.7" fill="#4aaa9a"/><path d="M5.5 10 Q8 12 10.5 10"/></svg>`;
const MARK = `<div class="mark"><div class="m1">日</div><div class="m2">NIHONGO</div></div>`;

const measure = (pg) => pg.evaluate(() => ({
  ha: document.getElementById('ha').offsetHeight, hb: document.getElementById('hb').offsetHeight,
  h: (() => { const b = [...document.querySelectorAll('.blk')]; const pg = document.querySelector('.page'); return b.map((e, i) => (i + 1 < b.length ? b[i + 1].offsetTop : pg.scrollHeight) - e.offsetTop + 2); })(),
}));

/* ── 블록 생성 (한 장 = 블록 목록, 나중에 페이지에 나눠 담음) ── */
function blocksOf(s, imgH = 230) {
  const g = s.grammar;
  const ex = s.items.filter((it) => it.type === 'extract');
  const trace = s.items.filter((it) => it.type === 'trace');
  const fills = s.items.filter((it) => it.type === 'fill' || it.type === 'choice');
  const trans = s.items.filter((it) => it.type === 'transform');
  const comp = s.items.filter((it) => it.type === 'compose');
  const { letter, n } = codeOf(s);
  const B = [];
  let secNo = 0;
  const sec = (html) => B.push({ head: true, html: `<div class="sec"><span class="n">${++secNo}</span>${html}</div>` });

  // 제목 박스 + 날짜/이름 + 포인트
  B.push({ html: `
    <div class="tbar">
      <div class="tbox"><div class="t1"><span>${rubyHtml(s.title)} · ${esc(s.sub)}</span>${CAT}</div><div class="t2 jp">${ruby(g.rules[0][0])}</div></div>
      <div class="meta">
        <div class="r"><span>월</span><span>일</span><span>시</span><span>분~</span><span>시</span><span>분</span></div>
        <div class="r nm"><span class="lab">이름</span></div>
      </div>
    </div>
    <div class="pt">${rubyHtml(g.point)}${g.rules.length > 1 ? `<div class="rules">${g.rules.slice(1).map(([jp, ko]) => `<div><span class="jp">${ruby(jp)}</span>${esc(ko)}</div>`).join('')}</div>` : ''}${g.tip ? `<div class="tip">※ ${rubyHtml(g.tip)}</div>` : ''}</div>` });

  // 1. 본문
  if (s.passage) {
    sec(`${FACE}<span class="tag">1-${ex.length}</span> 다음 글을 소리 내어 읽고, 빈칸에 알맞은 일본어를 쓰세요.`);
    const img = path.join(ROOT, 'img', `step_${String(s.id).padStart(2, '0')}.jpg`);
    B.push({ html: `<div class="pbox"><div class="ptag">${FACE}<span>${n}a</span></div>
      ${fs.existsSync(img) ? `<img class="pimg" style="height:${imgH}px;width:${Math.round(imgH * 340 / 230)}px" src="${dataUri(img)}">` : ''}
      ${s.passage.jp.map((l) => `<div class="pl jp">${ruby(l)}</div>`).join('')}
      <div class="pk">${s.passage.ko.map((k) => `<div>${esc(k)}</div>`).join('')}</div></div>` });
    for (let i = 0; i < ex.length; i += 2) {
      const pair = ex.slice(i, i + 2);
      B.push({ html: `<div class="grid2">${pair.map((it, j) => `<div><div class="q">(${i + j + 1}) ${esc(it.ko)}</div><div class="ln"></div></div>`).join('')}</div>` });
    }
  }

  // 2. 따라쓰기
  if (trace.length) {
    sec(`다음 문장을 소리 내어 읽고, 연한 글씨를 따라 쓴 다음 아래 줄에 한 번 더 쓰세요.`);
    trace.forEach((it, i) => B.push({ html: `<div class="it"><div class="q"><span class="no">(${i + 1})</span><span class="jq jp">${ruby(it.jp)}</span></div><div class="ko">${esc(it.ko)}</div>
      <div class="trace"><div class="g jp">${ruby(it.jp)}</div><div class="ln s"></div></div></div>` }));
  }

  // 3. 빈칸 · 고르기
  if (fills.length) {
    sec(`우리말을 참고하여, 빈칸에 알맞은 말을 쓰세요. (　)는 알맞은 것에 ○ 하세요.`);
    fills.forEach((it, i) => {
      if (it.type === 'fill') {
        B.push({ html: `<div class="it"><div class="q"><span class="no">(${i + 1})</span><span class="jq jp">${ruby(it.q).replace(/_{2,}/g, '<span class="bl"></span>')}</span></div><div class="ko">${esc(it.ko)}</div></div>` });
      } else {
        B.push({ html: `<div class="it"><div class="q"><span class="no">(${i + 1})</span><span class="jq jp">${ruby(it.q).replace(/＿/g, '<span class="bl"></span>')}</span></div><div class="ko">${esc(it.ko)}</div>
          <div class="opts jp">(${it.opts.map((o) => `<span>${ruby(o)}</span>`).join('<span class="sep">・</span>')})</div></div>` });
      }
    });
  }

  // 4. 바꿔쓰기
  if (trans.length) {
    sec(`다음 말을 지시대로 바꿔 쓰세요.`);
    for (let i = 0; i < trans.length; i += 2) {
      const pair = trans.slice(i, i + 2);
      B.push({ html: `<div class="grid2">${pair.map((it, j) => `<div class="it"><div class="q"><span class="no">(${i + j + 1})</span><span class="jq jp">${ruby(it.q)}</span><span class="tr" style="margin:0"><span class="inst">${esc(it.inst)}</span></span></div><div class="tr"><span class="arrow">→</span><span class="bl"></span></div></div>`).join('')}</div>` });
    }
  }

  // 5. 작문
  if (comp.length) {
    sec(`<span class="hb"></span>를 참고하여, 다음 우리말에 맞게 일본어를 쓰세요.`);
    comp.forEach((it, i) => B.push({ html: `<div class="it"><div class="cq"><span class="no">(${i + 1})</span><span class="kq">${esc(it.ko)}</span>${it.hint ? `<span class="hint jp">${ruby(it.hint).replace(/　/g, '<i></i>')}</span>` : ''}</div>
      <div class="cline jp"><span class="bl"></span>。</div></div>` }));
  }
  // 여백 채우기: 남는 공간만큼 본문 문장 따라쓰기 (페이지를 새로 만들지는 않음)
  const F = [];
  if (s.passage) {
    F.push({ head: true, html: `<div class="sec"><span class="n">${secNo + 1}</span> 본문과 예문을 따라 쓰고, 아래 줄에 보지 않고 한 번 더 쓰세요.</div>` });
    const lines = [...s.passage.jp];
    for (const [jp] of s.grammar.rules) if (!jp.includes('→') && !lines.includes(jp) && !lines.includes(jp + '。')) lines.push(jp.endsWith('。') || jp.endsWith('？') ? jp : jp + '。');
    lines.forEach((l, i) => F.push({ html: `<div class="it"><div class="q"><span class="no">(${i + 1})</span></div><div class="trace" style="margin-top:-18px"><div class="g jp">${ruby(l)}</div><div class="ln s"></div></div></div>` }));
  }
  B.fillers = F;
  return B;
}

function header(s, side) {
  const { letter, n } = codeOf(s);
  return `<div class="hdr ${side === 'a' ? 'a' : 'sub'}"><div class="lg">${MARK}<div class="code"><b>${letter}</b>${n}${side}</div></div><div class="ser">일본어 학습지 ${VOL} · ${letter} ${n}</div></div>`;
}

function renderCover() {
  const toc = WS_LEVELS.map((lv) => `<div class="lv">${esc(lv.name)} · ${esc(lv.desc)}</div>` +
    WS_STEPS.filter((s) => s.level === lv.id).map((s) => { const c = codeOf(s); return `<div><span class="cd">${c.letter} ${c.n}</span><span class="jp">${ruby(s.title)}</span> · ${esc(s.sub)}</div>`; }).join('')).join('');
  return `<div class="page"><div class="cover"><h1>목차</h1><div class="s">${VOL === 1 ? 'A 입문 · B 기초 · C 활용' : 'D 확장 · E 보통형 · F 응용'} — 20장 (앞면 a · 뒷면 b) + 정답</div>
    <div class="toc">${toc}</div>
    <div class="how">하루 3장. 시작·끝 시각과 이름을 적고 풀어요.<br>연한 글씨는 따라 쓰고, 그 아래 줄에는 보지 않고 한 번 더 써요.<br>다 풀면 맨 뒤 정답으로 채점하고, 틀린 문제는 한 번 더 써 보세요.</div></div></div>`;
}

function renderKey() {
  const steps = WS_STEPS.map((s) => {
    const c = codeOf(s);
    const groups = [['본문', s.items.filter((it) => it.type === 'extract')], ['따라쓰기', s.items.filter((it) => it.type === 'trace')], ['빈칸·고르기', s.items.filter((it) => it.type === 'fill' || it.type === 'choice')], ['바꿔쓰기', s.items.filter((it) => it.type === 'transform')], ['작문', s.items.filter((it) => it.type === 'compose')]].filter((g) => g[1].length);
    const li = (it, lab) => { const a = it.type === 'trace' ? [it.jp] : it.type === 'choice' ? [it.a] : it.a; const alt = a.length > 1 ? ` <span class="alt">(${a.slice(1).map(kanji).join(' / ')})</span>` : ''; return `<li><span class="kn">${lab}</span><span class="jp">${ruby(a[0])}</span>${alt}</li>`; };
    return `<div class="ks"><h2>${c.letter} ${c.n} ${ruby(s.title)}<small>${esc(s.sub)}</small></h2>${groups.map(([name, its]) => `<ol>${its.map((it, i) => li(it, `${name}(${i + 1})`)).join('')}</ol>`).join('')}</div>`;
  }).join('');
  return `<div class="key"><h1>정답</h1><div class="lead">괄호 안은 함께 인정되는 다른 표현. 한자는 히라가나로 써도 정답.</div>${steps}</div>`;
}

const doc = (body, cls = '') => `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}</style></head><body class="${cls}">${body}</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage();

  // 1) 측정: 각 장의 블록 높이를 재서 a/b 면에 나눠 담기
  const pages = [];
  for (const s of WS_STEPS) {
    // 본문(그림+글)이 앞면에 들어가도록 그림 높이를 단계적으로 줄여 가며 측정
    let blocks, m;
    for (const imgH of [230, 200, 170, 140]) {
      blocks = blocksOf(s, imgH);
      const html = `<div class="page"><div id="ha">${header(s, 'a')}</div><div id="hb">${header(s, 'b')}</div>${[...blocks, ...blocks.fillers].map((b, i) => `<div class="blk" data-i="${i}">${b.html}</div>`).join('')}</div>`;
      await pg.setContent(doc(html, 'measure'), { waitUntil: 'load' });
      await pg.evaluate(() => document.fonts.ready);
      m = await measure(pg);
      const pIdx = blocks.findIndex((b) => b.html.includes('class="pbox"'));
      if (pIdx < 0 || m.ha + m.h.slice(0, pIdx + 1).reduce((a, b) => a + b, 0) <= CONTENT_H - 8) break;
    }
    // 배분
    const out = [[]]; let used = m.ha; let cap = CONTENT_H - 8;
    for (let i = 0; i < blocks.length; i++) {
      let need = m.h[i];
      if (blocks[i].head && i + 1 < blocks.length) need += m.h[i + 1]; // 섹션 제목은 다음 블록과 함께
      if (used + need > cap && out[out.length - 1].length) { out.push([]); used = m.hb; }
      out[out.length - 1].push(i); used += m.h[i];
    }
    const fill = [];
    for (let j = 0; j < blocks.fillers.length; j++) {
      const k = blocks.length + j; let need = m.h[k];
      if (blocks.fillers[j].head) need += (m.h[k + 1] || 0) + 12;
      if (used + need > cap) break;
      fill.push(blocks.fillers[j].html); used += m.h[k];
    }
    if (fill.length > 1) out[out.length - 1].push(...fill.map((h) => ({ html: h })));
    out.forEach((idx, pi) => pages.push(`<div class="page">${header(s, 'abcdef'[pi] || 'z')}${idx.map((i) => `<div class="blk">${typeof i === 'number' ? blocks[i].html : i.html}</div>`).join('')}</div>`));
  }

  // 2) 본문 렌더
  const keyPages = `<div class="page key" style="height:auto;overflow:visible">${renderKey()}</div>`;
  const inner = [renderCover(), ...pages].map((h, i) => (i % 2 === 0 ? h.replace('<div class="page">', '<div class="page recto">') : h));
  await pg.setContent(doc(inner.join('') + keyPages), { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  const body = path.join(OUT, 'body.pdf');
  await pg.pdf({
    path: body, width: `${PAGE_W}mm`, height: `${PAGE_H}mm`, printBackground: true,
    margin: { top: `${M_TOP}mm`, bottom: `${M_BOT}mm`, left: `${M_SIDE}mm`, right: `${M_SIDE}mm` },
    displayHeaderFooter: false,
  });

  // 3) 표지
  const { coverHtml, coverPrintHtml } = require('./compose-cover.js');
  const coverImg = path.join(ROOT, 'cover', VOL > 1 ? `cover${VOL}.jpg` : 'cover.jpg');
  const imgUri = 'data:image/jpeg;base64,' + fs.readFileSync(coverImg).toString('base64');
  const BG = VOL > 1 ? '#dcd9d4' : '#d9d4d1'; // 사진 가장자리 평균색 (뒤표지·책등)
  const cover = path.join(OUT, 'cover.pdf');
  const name = `일본어학습지_초급${VOL > 1 ? VOL : ''}`;
  if (MODE === 'screen') {
    await pg.setViewportSize({ width: 688, height: 971 });
    await pg.setContent(coverHtml(imgUri, { initials: '', theme: '20 SHEETS', vol: `VOL. ${VOL}` }), { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    await pg.pdf({ path: cover, width: `${PAGE_W}mm`, height: `${PAGE_H}mm`, printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 }, pageRanges: '1' });
    await browser.close();
    const file = path.join(OUT, `${name}.pdf`);
    require('child_process').execFileSync('pdfunite', [cover, body, file]);
    fs.unlinkSync(cover); fs.unlinkSync(body);
    console.log('done:', file, 'sheet pages:', pages.length);
  } else {
    const back = MODE === 'wireless';
    const cw = back ? (182 + BLEED) * 2 + SPINE : PAGE_W;
    await pg.setContent(coverPrintHtml(imgUri, { vol: `VOL. ${VOL}`, theme: '20 SHEETS', bg: BG, bleed: BLEED, spine: SPINE, back }), { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    const coverFile = path.join(OUT, `${name}_${MODE}_표지${back ? '_펼침' : ''}.pdf`);
    await pg.pdf({ path: coverFile, width: `${cw}mm`, height: `${PAGE_H}mm`, printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 }, pageRanges: '1' });
    await browser.close();
    const bodyFile = path.join(OUT, `${name}_${MODE}_내지.pdf`);
    fs.renameSync(body, bodyFile);
    console.log('done:', coverFile, '+', bodyFile, 'sheet pages:', pages.length, `(cover ${cw}×${PAGE_H}mm, spine ${back ? SPINE : 0}mm, bleed ${BLEED}mm, gutter ${GUTTER}mm)`);
  }
})();
