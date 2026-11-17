/* BaPi 일본어 학습지 → 인쇄용 PDF
   사용법: node worksheet/print/build.js  → worksheet/print/out/일본어학습지_초급.pdf
   - 데이터: ../data.js
   - 용지: B5 (182×257mm). A4 프린터에서는 "용지에 맞춤"으로 출력하세요.
   - 폰트: fonts/ (Klee One = 교과서체 느낌, Noto Sans KR/JP) */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname, OUT = path.join(ROOT, 'out'), FONTS = path.join(ROOT, 'fonts');
fs.mkdirSync(OUT, { recursive: true });
const src = fs.readFileSync(path.join(ROOT, '..', 'data.js'), 'utf8');
const src2 = fs.readFileSync(path.join(ROOT, '..', 'data2.js'), 'utf8');
const src3 = fs.readFileSync(path.join(ROOT, '..', 'data3.js'), 'utf8');
const VOL = Number(process.argv[2] || 1); // 권 (1 · 2 · 3)
const ALL = new Function(src + '\n' + src2 + '\n' + src3 + ';return {WS_STEPS, WS_LEVELS};')();
const WS_STEPS = ALL.WS_STEPS.filter((s) => (s.vol || 1) === VOL);
const WS_LEVELS = ALL.WS_LEVELS.filter((l) => (l.vol || 1) === VOL);

/* ── 유틸 ── */
const RUBY_RE = /\{([^|{}]+)\|([^|{}]+)\}/g;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ruby = (s) => esc(s).replace(RUBY_RE, '<ruby>$1<rt>$2</rt></ruby>');
const rubyHtml = (s) => String(s ?? '').replace(RUBY_RE, '<ruby>$1<rt>$2</rt></ruby>');
const kanji = (s) => String(s ?? '').replace(RUBY_RE, '$1');
const fontUrl = (f) => 'file://' + path.join(FONTS, f);
const dataUri = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
const FOOTER = () => `<style>@font-face{font-family:'Inter';src:url(data:font/ttf;base64,${fs.readFileSync(path.join(FONTS, 'Inter-900.ttf')).toString('base64')});font-weight:900}</style>
  <div style="width:100%;box-sizing:border-box;padding:0 ${M_SIDE}mm ${BLEED + 5}mm;display:flex;justify-content:space-between;align-items:flex-end;font-family:'Inter',sans-serif;font-weight:900;color:#8a8a8a;">
    <span style="font-size:10px;letter-spacing:-0.3px">BaPi</span><span class="pageNumber" style="font-size:7px;font-family:sans-serif;font-weight:400;color:#9a9a9a"></span></div>`; // about:blank 에서는 file:// 이미지가 막혀서 인라인

/* 페이지 치수 (px, 96dpi) */
const MM = 96 / 25.4;
/* 출력 모드: screen(화면·집 인쇄용, 기본) | wireless(무선제본 인쇄소용) | spring(스프링제본 인쇄소용)
   인쇄소용은 재단 여백(BLEED 3mm) + 제본 쪽 여백(GUTTER)을 홀짝 페이지에 번갈아 넣고, 표지·내지를 따로 냄 */
const MODE = process.argv[3] || 'screen';
const BLEED = MODE === 'screen' ? 0 : 3;
const GUTTER = MODE === 'wireless' ? 6 : MODE === 'spring' ? 10 : 0;
const SPINE = Number(process.argv[4] || (VOL > 1 ? 4.5 : 4)); // 책등 두께 mm (무선제본, 3권도 4.5)
const PAGE_W = 182 + 2 * BLEED, PAGE_H = 257 + 2 * BLEED, M_TOP = 11 + BLEED, M_BOT = 11 + BLEED, M_SIDE = 13 + BLEED;
const CONTENT_H = Math.floor((PAGE_H - M_TOP - M_BOT) * MM);

const CSS = `
@font-face { font-family: 'Klee'; src: url('${fontUrl('KleeOne-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'Klee'; src: url('${fontUrl('KleeOne-600.ttf')}'); font-weight: 600; }
@font-face { font-family: 'NSJP'; src: url('${fontUrl('NotoSansJP-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'NSJP'; src: url('${fontUrl('NotoSansJP-700.ttf')}'); font-weight: 700; }
@font-face { font-family: 'NSKR'; src: url('${fontUrl('NotoSansKR-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'Inter'; src: url('${fontUrl('Inter-900.ttf')}'); font-weight: 900; }
@font-face { font-family: 'NSKR'; src: url('${fontUrl('NotoSansKR-700.ttf')}'); font-weight: 700; }
:root { --paper: #f4f0e9; --rule: #d9d2c5; --ac: #b9502f; --ink: #1d1d1b; --gray: #777; --lgray: #b5b5b5; --line: #2b2b2b; }
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

/* ── 머리글: UNIT 번호 + 쪽 / 권 정보, 아래 굵은 선 ── */
.hdr { display: flex; justify-content: space-between; align-items: flex-end; height: 40px; padding-bottom: 7px; border-bottom: 2px solid var(--ink); margin-bottom: 14px; }
.hdr .u { display: flex; align-items: baseline; gap: 7px; font-family: 'Inter', 'NSKR'; font-weight: 900; color: var(--ink); line-height: 1; }
.hdr .u .lab { font-size: 8px; letter-spacing: 2.5px; }
.hdr .u .num { font-size: 27px; letter-spacing: -1px; }
.hdr .u .pg { font-size: 9px; letter-spacing: 1px; color: #8a8a8a; margin-left: 4px; }
.hdr .ser { font-family: 'Inter', 'NSKR'; font-weight: 900; font-size: 8px; letter-spacing: 2.5px; color: #8a8a8a; }

/* ── 제목 + 학습 기록 줄 ── */
.ttl { display: flex; align-items: baseline; gap: 12px; margin-bottom: 2px; }
.ttl .tj { font-size: 19pt; font-weight: 600; letter-spacing: 1px; line-height: 1.5; }
.ttl .tk { font-size: 10pt; color: #666; }
.ttl .sc { margin-left: auto; display: flex; align-items: flex-end; gap: 5px; font-size: 9pt; color: #555; white-space: nowrap; }
.ttl .sc .lb { font-family: 'Inter', 'NSKR'; font-weight: 900; font-size: 8px; letter-spacing: 1.5px; color: #777; margin-right: 2px; padding-bottom: 2px; }
.ttl .sc i { display: inline-block; width: 44px; height: 22px; border-bottom: 1.1px solid #555; }
.key { font-size: 13pt; letter-spacing: 1px; line-height: 1.8; margin-bottom: 8px; }
.key .kl { font-family: 'Inter'; font-weight: 900; font-size: 7.5px; letter-spacing: 2px; color: var(--ac); margin-right: 10px; vertical-align: 2px; }
.log { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; background: var(--paper); border-radius: 6px; padding: 0 12px 8px; height: 44px; margin-bottom: 12px; font-size: 9pt; color: #555; white-space: nowrap; }
.log .g { display: flex; align-items: flex-end; gap: 5px; }
.log .lb { font-family: 'Inter', 'NSKR'; font-weight: 900; font-size: 8px; letter-spacing: 1.5px; color: #777; margin-right: 4px; padding-bottom: 2px; }
.log i { display: inline-block; border-bottom: 1.1px solid #555; height: 24px; }
.log i.y { width: 68px; } .log i.m { width: 52px; } .log i.t { width: 48px; }

/* ── 포인트 (작게) ── */
.pbx { border-radius: 6px; padding: 11px 16px 9px; margin: 0 0 10px; background: var(--paper); }
.pbx .ph, .vbx .ph { font-size: 9pt; font-weight: 700; color: var(--ink); margin-bottom: 5px; }
.ph em { font-style: normal; font-family: 'Inter'; font-weight: 900; font-size: 7.5px; letter-spacing: 2px; color: var(--ac); margin-right: 8px; vertical-align: 1px; }
.vbx { border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: 10px 2px 12px; margin: 0 0 14px; }
.vbx .ph span { font-weight: 400; color: #888; letter-spacing: 0; margin-left: 8px; font-size: 8.3pt; }
.vtab { display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: column; grid-template-rows: repeat(5, auto); column-gap: 26px; }
.vr { display: flex; align-items: flex-end; gap: 6px; height: 33px; }
.vr .vn { font-size: 7.5pt; color: #aaa; width: 12px; padding-bottom: 3px; }
.vr .w { font-size: 12.5pt; white-space: nowrap; line-height: 1.2; }
.vr .k { font-size: 8.3pt; color: #666; white-space: nowrap; padding-bottom: 2px; }
.vr .wl { flex: 1; min-width: 60px; border-bottom: 1.1px solid #555; height: 100%; }
.pt { font-size: 9.2pt; color: #444; line-height: 1.6; margin: 0; }
.pt b { color: var(--ink); }
.pt .rules { display: grid; grid-template-columns: repeat(2, 1fr); column-gap: 14px; margin: 2px 0 1px; }
.pt .rules div { color: #666; }
.pt .rules .jp { font-size: 10.5pt; color: #222; margin-right: 4px; }
.pt .tip { color: #666; }
.vocab { display: flex; flex-wrap: wrap; gap: 3px 18px; border: 1px solid #ddd; border-radius: 4px; padding: 5px 10px 4px; margin: -4px 0 10px; font-size: 8.3pt; color: #444; }
.vocab .vh { flex-basis: 100%; font-size: 7.5pt; color: var(--ac); letter-spacing: 1px; font-weight: 700; margin-bottom: 1px; }
.vocab .vw { white-space: nowrap; }
.vocab .vw .jp { font-size: 10pt; color: #222; margin-right: 4px; }

/* ── 섹션 ── */
.sec { display: flex; align-items: center; gap: 9px; margin: 14px 0 10px; font-size: 10.5pt; break-after: avoid; }
.blk:first-of-type > .sec, .hdr + .blk > .sec { margin-top: 2px; }
.sec .n { display: inline-flex; align-items: center; justify-content: center; width: 19px; height: 19px; border-radius: 4px; background: var(--ink); color: #fff; font-family: 'Inter'; font-weight: 900; font-size: 9.5pt; line-height: 1; flex-shrink: 0; }
.sec .ic { width: 16px; height: 16px; }
.sec .tag { font-size: 8pt; color: #555; border: 1px solid #888; border-radius: 2px; padding: 0 4px; line-height: 1.4; }
.sec .hb { display: inline-block; width: 26px; height: 13px; background: #d9d9d9; border-radius: 2px; vertical-align: middle; }

/* ── 본문 박스 ── */
.pbox { padding: 0 4px; position: relative; margin-bottom: 6px; }
.pbox .ptag { position: absolute; top: -9px; right: 14px; background: #fff; padding: 0 5px; font-size: 8pt; color: #555; display: flex; align-items: center; gap: 4px; }
.pbox .ptag span { border: 1px solid #888; border-radius: 2px; padding: 0 4px; }
.pbox .pl { font-size: 16pt; line-height: 2.05; letter-spacing: 2px; }
.pbox .pimg { position: relative; width: 100%; height: 300px; margin: 0 auto 8px; overflow: hidden; }
.pbox .pimg img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pbox .pk { clear: none; }
.pbox .pk { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--rule); font-size: 8.8pt; color: #555; line-height: 1.5; }
.pbox .pk div { white-space: nowrap; }

/* ── 답 쓰는 줄 ── */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 26px; row-gap: 4px; }
.grid2.exrow { column-gap: 34px; margin: 0 4px 8px; }
.grid2.exrow .q { font-size: 10.5pt; }
.grid2.exrow .ln { height: 38px; }
.grid2.exrow.roomy { margin-bottom: 16px; }
.grid2.exrow.roomy .ln { height: 46px; }
.sec.tight { margin: 8px 0 6px; }
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
.hint { display: inline-flex; align-items: baseline; font-size: 12.5pt; margin-left: 16px; letter-spacing: 1px; line-height: 1.7; border-bottom: 1px dotted #999; }
.hint em { font-style: normal; font-family: 'Inter', 'NSKR'; font-weight: 900; font-size: 7px; letter-spacing: 1.5px; color: var(--ac); margin-right: 8px; }
.hint i { font-style: normal; color: #aaa; margin: 0 8px; }
.cq { display: flex; align-items: center; margin-bottom: 2px; }
.cq .no { min-width: 22px; }
.cline { margin: 0 0 0 28px; font-size: 14pt; letter-spacing: 1px; line-height: 1.9; }
.cline .bl { display: inline-block; min-width: 300px; border-bottom: 1.3px solid var(--line); height: 1.3em; vertical-align: bottom; }
.tr { display: flex; align-items: baseline; gap: 8px; margin: 0 0 0 28px; }
.tr .arrow { color: #666; }
.tr .bl { display: inline-block; width: 200px; border-bottom: 1.3px solid var(--line); height: 1.4em; vertical-align: bottom; }
.tr .inst { font-size: 8.5pt; color: var(--ac); }
.tr .inst::before { content: '▸ '; }

/* ── 표지 / 정답 ── */
.cover { padding-top: 120px; text-align: center; }
.cover .lg { display: inline-flex; flex-direction: column; align-items: center; border: 2px solid #999; border-radius: 6px; width: 90px; height: 90px; justify-content: center; color: #666; margin-bottom: 20px; }
.cover .lg .m1 { font-size: 40px; font-family: 'Klee'; line-height: 1; }
.cover .lg .m2 { font-size: 10px; letter-spacing: 3px; margin-top: 4px; }
.cover h1 { font-size: 26pt; font-weight: 700; margin-bottom: 4px; }
.cover .s { font-size: 11pt; color: #666; margin-bottom: 26px; }
.cover .toc { display: inline-block; text-align: left; font-size: 10pt; line-height: 1.85; column-count: 2; column-gap: 34px; }
.cover .toc .lv { font-weight: 700; color: var(--ink); background: var(--paper); padding: 0 8px; border-radius: 3px; margin: 8px 0 2px; break-after: avoid; }
.cover .toc .lv:first-child { margin-top: 0; }
.cover .toc .cd { display: inline-block; width: 26px; color: var(--ac); font-family: 'Inter'; font-weight: 900; font-size: 8.5pt; }
.cover .how { margin-top: 30px; font-size: 9pt; color: #666; line-height: 1.8; }
.key h1 { font-size: 15pt; margin-bottom: 2px; }
.key .lead { font-size: 9pt; color: #666; margin-bottom: 8px; }
.ks { break-inside: avoid; margin-bottom: 8px; border-top: 1.5px solid var(--ink); padding-top: 4px; }
.ks h2 { font-size: 10.5pt; color: var(--ink); margin-bottom: 2px; }
.ks h2 small { color: #888; font-weight: 400; margin-left: 6px; font-size: 8.5pt; }
.ks ol { columns: 2; column-gap: 18px; list-style: none; font-size: 9.5pt; }
.ks li { break-inside: avoid; line-height: 1.75; }
.ks li .kn { color: #888; font-size: 8pt; margin-right: 4px; }
.ks li .alt { color: #888; font-size: 8pt; }
`;

const unitNo = (s) => String(s.id).padStart(2, '0'); // 단원 번호 = STEP 번호 (권이 바뀌어도 이어짐)

const measure = (pg) => pg.evaluate(() => ({
  ha: document.getElementById('ha').offsetHeight, hb: document.getElementById('hb').offsetHeight,
  h: (() => { const b = [...document.querySelectorAll('.blk')]; const pg = document.querySelector('.page'); return b.map((e, i) => (i + 1 < b.length ? b[i + 1].offsetTop : pg.scrollHeight) - e.offsetTop + 2); })(),
}));

/* ── 블록 생성 (한 장 = 블록 목록, 나중에 페이지에 나눠 담음) ── */
// 삽화: 표시 크기에 맞춰 자르고 가장자리 번짐을 픽셀에 구운 JPEG (PDF 투명 마스크 미사용 → 모든 뷰어·프린터에서 보임)
const BAKED = path.join(OUT, '.baked');
function bakedUri(stepId, w, h, fade) {
  fs.mkdirSync(BAKED, { recursive: true });
  const id = String(stepId).padStart(2, '0');
  const png = path.join(ROOT, 'img', `step_${id}.png`), jpg = path.join(ROOT, 'img', `step_${id}.jpg`);
  const srcImg = fs.existsSync(png) ? png : jpg;
  const dst = path.join(BAKED, `step_${id}_${w}x${h}_${fade}.jpg`);
  if (!fs.existsSync(dst)) require('child_process').execFileSync('python3', [path.join(ROOT, 'bake-img.py'), srcImg, dst, String(w), String(h), String(fade)]);
  return dataUri(dst);
}

function blocksOf(s, imgH = 380, pFont = 16, exAfter = false, bake = false) {
  const g = s.grammar;
  const ex = s.items.filter((it) => it.type === 'extract');
  const trace = s.items.filter((it) => it.type === 'trace');
  const fills = s.items.filter((it) => it.type === 'fill' || it.type === 'choice');
  const trans = s.items.filter((it) => it.type === 'transform');
  const comp = s.items.filter((it) => it.type === 'compose');
  const B = [];
  let secNo = 0;
  const sec = (html) => B.push({ head: true, html: `<div class="sec"><span class="n">${++secNo}</span>${html}</div>` });

  // 제목 박스 + 날짜/이름 (포인트·단어는 본문 뒤로 → 앞면은 큰 삽화 + 본문)
  B.push({ html: `
    <div class="ttl"><span class="tj jp">${ruby(s.title)}</span><span class="tk">${esc(s.sub)}</span><span class="sc"><span class="lb">SCORE</span><i></i>/ ${s.items.length}</span></div>
    <div class="key jp"><span class="kl">KEY SENTENCE</span>${ruby(g.rules[0][0])}</div>
    <div class="log">
      <span class="g"><span class="lb">DATE</span><i class="y"></i>년 <i class="m"></i>월 <i class="m"></i>일</span>
      <span class="g"><span class="lb">TIME</span><i class="t"></i>:<i class="t"></i> ~ <i class="t"></i>:<i class="t"></i></span>
    </div>` });

  // 1. 본문
  if (s.passage) {
    sec(`그림을 보면서 본문을 소리 내어 읽어 보세요.`);
    const img = path.join(ROOT, 'img', `step_${String(s.id).padStart(2, '0')}.jpg`);
    B.push({ html: `<div class="pbox">
      ${fs.existsSync(img) ? `<div class="pimg" style="height:${imgH}px;width:${Math.min(556, Math.round(imgH * 1.75))}px"><img src="${bake ? bakedUri(s.id, Math.min(556, Math.round(imgH * 1.75)), imgH, Math.round(Math.min(24, imgH * 0.055))) : dataUri(img)}"></div>` : ''}
      ${s.passage.jp.map((l) => `<div class="pl jp" style="font-size:${pFont}pt">${ruby(l)}</div>`).join('')}
      <div class="pk">${s.passage.ko.map((k) => `<div>${esc(k)}</div>`).join('')}</div></div>` });
  }
  const pushExtracts = () => {
    if (!ex.length) return;
    sec(`${exAfter ? '앞 쪽' : '위'} 본문에서 찾아 일본어로 써 보세요.`);
    if (!exAfter) B[B.length - 1].html = B[B.length - 1].html.replace('class="sec"', 'class="sec tight"');
    for (let i = 0; i < ex.length; i += 2) {
      const pair = ex.slice(i, i + 2);
      B.push({ html: `<div class="grid2 exrow${exAfter ? ' roomy' : ''}">${pair.map((it, j) => `<div><div class="q">(${i + j + 1}) ${esc(it.ko)}</div><div class="ln"></div></div>`).join('')}</div>` });
    }
  };
  if (!exAfter) pushExtracts();

  // 오늘의 포인트 + 단어: 항상 뒷면(b) 맨 위에 고정
    B.push({ point: true, breakBefore: true, html: `<div class="pbx"><div class="ph"><em>POINT</em>오늘의 포인트</div>
    <div class="pt">${rubyHtml(g.point)}${g.rules.length > 1 ? `<div class="rules">${g.rules.slice(1).map(([jp, ko]) => `<div><span class="jp">${ruby(jp)}</span>${esc(ko)}</div>`).join('')}</div>` : ''}${g.tip ? `<div class="tip">※ ${rubyHtml(g.tip)}</div>` : ''}</div>
</div>` });
  // 오늘의 단어: 포인트 박스 바로 아래, 단어 + 뜻 + 한 번 써 보는 줄
  if (s.vocab) B.push({ html: `<div class="vbx"><div class="ph"><em>WORDS</em>오늘의 단어 <span>읽고 나서 옆 줄에 한 번씩 써 보세요.</span></div>
    <div class="vtab">${s.vocab.map(([w, k], i) => `<div class="vr"><span class="vn">${i + 1}</span><span class="w jp">${ruby(w)}</span><span class="k">${esc(k)}</span><span class="wl"></span></div>`).join('')}</div></div>` });
  if (exAfter) pushExtracts();

  // 2. 따라쓰기
  if (trace.length) {
    sec(`문장을 읽고 연한 글씨 위에 따라 쓴 뒤, 빈 줄에 한 번 더 써 보세요.`);
    trace.forEach((it, i) => B.push({ html: `<div class="it"><div class="q"><span class="no">(${i + 1})</span><span class="jq jp">${ruby(it.jp)}</span></div><div class="ko">${esc(it.ko)}</div>
      <div class="trace"><div class="g jp">${ruby(it.jp)}</div><div class="ln s"></div></div></div>` }));
  }

  // 3. 빈칸 · 고르기
  if (fills.length) {
    sec(`빈칸을 채워 보세요. 보기가 있으면 맞는 것에 ○표.`);
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
    sec(`화살표 옆 지시에 맞게 바꿔 써 보세요.`);
    for (let i = 0; i < trans.length; i += 2) {
      const pair = trans.slice(i, i + 2);
      B.push({ html: `<div class="grid2">${pair.map((it, j) => `<div class="it"><div class="q"><span class="no">(${i + j + 1})</span><span class="jq jp">${ruby(it.q)}</span><span class="tr" style="margin:0"><span class="inst">${esc(it.inst)}</span></span></div><div class="tr"><span class="arrow">→</span><span class="bl"></span></div></div>`).join('')}</div>` });
    }
  }

  // 5. 작문
  if (comp.length) {
    sec(`우리말을 일본어 문장으로 써 보세요.${comp.some((it) => it.hint) ? ' HINT 단어를 써도 좋아요.' : ''}`);
    comp.forEach((it, i) => B.push({ html: `<div class="it"><div class="cq"><span class="no">(${i + 1})</span><span class="kq">${esc(it.ko)}</span>${it.hint ? `<span class="hint jp"><em>HINT</em>${ruby(it.hint).replace(/　/g, '<i>/</i>')}</span>` : ''}</div>
      <div class="cline jp"><span class="bl"></span>。</div></div>` }));
  }
  // 여백 채우기: 남는 공간만큼 본문 문장 따라쓰기 (페이지를 새로 만들지는 않음)
  const F = [];
  if (s.passage) {
    F.push({ head: true, html: `<div class="sec"><span class="n">${secNo + 1}</span> 남는 시간에: 본문과 예문을 따라 쓰고, 빈 줄에 한 번 더 써 보세요.</div>` });
    const lines = [...s.passage.jp];
    for (const [jp] of s.grammar.rules) if (!jp.includes('→') && !lines.includes(jp) && !lines.includes(jp + '。')) lines.push(jp.endsWith('。') || jp.endsWith('？') ? jp : jp + '。');
    lines.forEach((l, i) => F.push({ html: `<div class="it"><div class="q"><span class="no">(${i + 1})</span></div><div class="trace" style="margin-top:-18px"><div class="g jp">${ruby(l)}</div><div class="ln s"></div></div></div>` }));
  }
  B.fillers = F;
  return B;
}

function header(s, pi, total) {
  const lv = (WS_LEVELS.find((l) => l.id === s.level) || {}).name || '';
  return `<div class="hdr"><div class="u"><span class="lab">UNIT</span><span class="num">${unitNo(s)}</span><span class="pg">${pi + 1} / ${total}</span></div><div class="ser">BaPi NIHONGO · VOL. ${VOL} · ${esc(lv.replace(/\s*·\s*/g, ' '))}</div></div>`;
}

function renderCover() {
  const toc = WS_LEVELS.map((lv) => `<div class="lv">${esc(lv.name)} · ${esc(lv.desc)}</div>` +
    WS_STEPS.filter((s) => s.level === lv.id).map((s) => `<div><span class="cd">${unitNo(s)}</span><span class="jp">${ruby(s.title)}</span> · ${esc(s.sub)}</div>`).join('')).join('');
  return `<div class="page"><div class="cover"><h1>목차</h1><div class="s">VOL. ${VOL} · UNIT ${unitNo(WS_STEPS[0])} – ${unitNo(WS_STEPS[WS_STEPS.length - 1])} · ${WS_STEPS.length}단원 + 정답</div>
    <div class="toc">${toc}</div>
    <div class="how">하루에 단원 두세 개. 날짜와 시작·끝 시각을 적고 시작해요.<br>첫 쪽은 그림과 본문 읽기, 다음 쪽부터 포인트·단어·연습이에요.<br>다 풀면 맨 뒤 정답으로 채점하고 점수를 적어 두세요.</div></div></div>`;
}

function renderKey() {
  const steps = WS_STEPS.map((s) => {
    const groups = [['본문', s.items.filter((it) => it.type === 'extract')], ['따라쓰기', s.items.filter((it) => it.type === 'trace')], ['빈칸·고르기', s.items.filter((it) => it.type === 'fill' || it.type === 'choice')], ['바꿔쓰기', s.items.filter((it) => it.type === 'transform')], ['작문', s.items.filter((it) => it.type === 'compose')]].filter((g) => g[1].length);
    const li = (it, lab) => { const a = it.type === 'trace' ? [it.jp] : it.type === 'choice' ? [it.a] : it.a; const alt = a.length > 1 ? ` <span class="alt">(${a.slice(1).map(kanji).join(' / ')})</span>` : ''; return `<li><span class="kn">${lab}</span><span class="jp">${ruby(a[0])}</span>${alt}</li>`; };
    return `<div class="ks"><h2>UNIT ${unitNo(s)} · ${ruby(s.title)}<small>${esc(s.sub)}</small></h2>${groups.map(([name, its]) => `<ol>${its.map((it, i) => li(it, `${name}(${i + 1})`)).join('')}</ol>`).join('')}</div>`;
  }).join('');
  return `<div class="key"><h1>정답</h1><div class="lead">괄호 안은 함께 인정되는 다른 표현. 한자는 히라가나로 써도 정답.</div>${steps}</div>`;
}

const doc = (body, cls = '') => `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}</style></head><body class="${cls}">${body}</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage();

  // 1) 측정: 각 장의 블록 높이를 재서 a/b 면에 나눠 담기
  const pages = []; const STATS = [];
  for (const s of WS_STEPS) {
    // 앞면(a) = 삽화 + 본문 + 찾아쓰기, 뒷면(b) 맨 위 = 포인트 박스.
    // 앞면에 다 들어가는 가장 큰 그림 높이를 고르고, 최소 높이로도 안 되면 찾아쓰기를 포인트 뒤로 보냄
    let blocks, m, chosen = null;
    const cap = CONTENT_H - 8;
    const tryFit = async (imgH, pFont, exAfter) => {
      blocks = blocksOf(s, imgH, pFont, exAfter);
      const html = `<div class="page"><div id="ha">${header(s, 0, 1)}</div><div id="hb">${header(s, 1, 1)}</div>${[...blocks, ...blocks.fillers].map((b, i) => `<div class="blk" data-i="${i}">${b.html}</div>`).join('')}</div>`;
      await pg.setContent(doc(html, 'measure'), { waitUntil: 'load' });
      await pg.evaluate(() => document.fonts.ready);
      m = await measure(pg);
      const pt = blocks.findIndex((b) => b.point);
      return m.ha + m.h.slice(0, pt).reduce((a, b) => a + b, 0) <= cap;
    };
    const READ_ONLY_A = true; // 모든 권: 첫 쪽은 큰 삽화 + 본문만, 문제는 다음 쪽부터
    const BIG = Array.from({ length: 27 }, (_, i) => [470 - i * 10, 16]).filter(([h]) => h > 380 || h % 30 !== 20); // 470→210, 촘촘하게 맞춤
    const SIZES = [[380, 16], [350, 16], [320, 16], [300, 16], [280, 16], [260, 16], [240, 15.5], [220, 15.5], [200, 15], [180, 14.5], [165, 14.5], [150, 14], [135, 14]];
    if (!READ_ONLY_A) for (const [imgH, pFont] of SIZES) { if (await tryFit(imgH, pFont, false)) { chosen = { imgH, pFont, exAfter: false }; break; } }
    if (!chosen) for (const [imgH, pFont] of (READ_ONLY_A ? [...BIG, [200, 15], [180, 14.5]] : SIZES)) { if (await tryFit(imgH, pFont, true)) { chosen = { imgH, pFont, exAfter: true }; break; } }
    if (!chosen) { chosen = { imgH: 180, pFont: 14.5, exAfter: true }; await tryFit(180, 14.5, true); }
    blocks = blocksOf(s, chosen.imgH, chosen.pFont, chosen.exAfter, true); // 높이는 같고 그림만 구운 버전
    STATS.push({ id: s.id, code: `U${unitNo(s)}`, ...chosen });
    // 배분
    const out = [[]]; let used = m.ha;
    for (let i = 0; i < blocks.length; i++) {
      let need = m.h[i];
      if (blocks[i].head && i + 1 < blocks.length) need += m.h[i + 1]; // 섹션 제목은 다음 블록과 함께
      if ((blocks[i].breakBefore || used + need > cap) && out[out.length - 1].length) { out.push([]); used = m.hb; }
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
    out.forEach((idx, pi) => pages.push(`<div class="page">${header(s, pi, out.length)}${idx.map((i) => `<div class="blk">${typeof i === 'number' ? blocks[i].html : i.html}</div>`).join('')}</div>`));
  }

  if (process.env.WS_STATS) console.log('STATS ' + JSON.stringify(STATS));
  // 2) 본문 렌더
  const keyPages = `<div class="page key" style="height:auto;overflow:visible">${renderKey()}</div>`;
  const inner = [renderCover(), ...pages].map((h, i) => (i % 2 === 0 ? h.replace('<div class="page">', '<div class="page recto">') : h));
  await pg.setContent(doc(inner.join('') + keyPages), { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  const body = path.join(OUT, 'body.pdf');
  await pg.pdf({
    path: body, width: `${PAGE_W}mm`, height: `${PAGE_H}mm`, printBackground: true,
    margin: { top: `${M_TOP}mm`, bottom: `${M_BOT}mm`, left: `${M_SIDE}mm`, right: `${M_SIDE}mm` },
    displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: FOOTER(),
  });

  // 3) 표지
  const { coverHtml, coverPrintHtml } = require('./compose-cover.js');
  const coverImg = path.join(ROOT, 'cover', VOL > 1 ? `cover${VOL}.jpg` : 'cover.jpg');
  const imgUri = 'data:image/jpeg;base64,' + fs.readFileSync(coverImg).toString('base64');
  const BG = { 1: '#d9d4d1', 2: '#dcd9d4', 3: '#ddd9d6' }[VOL] || '#dad6d1'; // 사진 가장자리 평균색 (뒤표지·책등)
  const cover = path.join(OUT, 'cover.pdf');
  const name = `일본어학습지_초급${VOL > 1 ? VOL : ''}`;
  if (MODE === 'screen') {
    await pg.setViewportSize({ width: 688, height: 971 });
    await pg.setContent(coverHtml(imgUri, { initials: '', sub: 'BaPi — NIHONGO WORKSHEET', theme: `${WS_STEPS.length} SHEETS`, vol: `VOL. ${VOL}` }), { waitUntil: 'load' });
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
    await pg.setContent(coverPrintHtml(imgUri, { vol: `VOL. ${VOL}`, sub: 'BaPi — NIHONGO WORKSHEET', theme: `${WS_STEPS.length} SHEETS`, bg: BG, bleed: BLEED, spine: SPINE, back }), { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    const coverFile = path.join(OUT, `${name}_${MODE}_표지${back ? '_펼침' : ''}.pdf`);
    await pg.pdf({ path: coverFile, width: `${cw}mm`, height: `${PAGE_H}mm`, printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 }, pageRanges: '1' });
    await browser.close();
    const bodyFile = path.join(OUT, `${name}_${MODE}_내지.pdf`);
    fs.renameSync(body, bodyFile);
    if (back) { // 무선제본 내지는 짝수 쪽이어야 함 → 홀수면 빈 페이지 추가
      require('child_process').execFileSync('python3', ['-c', `
from pypdf import PdfReader, PdfWriter
import sys
p=sys.argv[1]; r=PdfReader(p)
if len(r.pages)%2==1:
    w=PdfWriter(); [w.add_page(pg) for pg in r.pages]; w.add_blank_page(); w.write(p); print('blank page added ->', len(r.pages)+1)
`, bodyFile], { stdio: 'inherit' });
    }
    console.log('done:', coverFile, '+', bodyFile, 'sheet pages:', pages.length, `(cover ${cw}×${PAGE_H}mm, spine ${back ? SPINE : 0}mm, bleed ${BLEED}mm, gutter ${GUTTER}mm)`);
  }
})();
