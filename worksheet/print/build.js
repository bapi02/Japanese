/* 일본어 학습지 → 인쇄용 PDF 생성기 (구몬 스타일)
   사용법: node worksheet/print/build.js        → worksheet/print/out/일본어학습지_초급.pdf 생성
   - 학습지 데이터는 ../data.js 를 그대로 사용
   - 폰트: fonts/ 폴더의 Noto Sans JP/KR, Zen Kurenaido (없으면 README 참고) */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const FONTS = path.join(ROOT, 'fonts');
fs.mkdirSync(OUT, { recursive: true });

const src = fs.readFileSync(path.join(ROOT, '..', 'data.js'), 'utf8');
const { WS_STEPS, WS_LEVELS } = new Function(src + ';return {WS_STEPS, WS_LEVELS};')();

/* ── 유틸 ── */
const RUBY_RE = /\{([^|{}]+)\|([^|{}]+)\}/g;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ruby = (s) => esc(s).replace(RUBY_RE, '<ruby>$1<rt>$2</rt></ruby>');
const rubyHtml = (s) => String(s ?? '').replace(RUBY_RE, '<ruby>$1<rt>$2</rt></ruby>'); // 설명문(<b> 포함)용
const kanji = (s) => String(s ?? '').replace(RUBY_RE, '$1');
const nn = (n) => String(n).padStart(2, '0');
const fontUrl = (f) => 'file://' + path.join(FONTS, f);
const levelName = (id) => (WS_LEVELS.find((l) => l.id === id) || {}).name || '';

const CSS = `
@font-face { font-family: 'NSJP'; src: url('${fontUrl('NotoSansJP-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'NSJP'; src: url('${fontUrl('NotoSansJP-700.ttf')}'); font-weight: 700; }
@font-face { font-family: 'NSKR'; src: url('${fontUrl('NotoSansKR-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'NSKR'; src: url('${fontUrl('NotoSansKR-700.ttf')}'); font-weight: 700; }
@font-face { font-family: 'Pen'; src: url('${fontUrl('ZenKurenaido.ttf')}'); }
:root { --teal: #2f9c8f; --teal-bg: #e3f3f0; --ink: #1c1c1c; --dim: #555; --line: #333; --soft: #bdbdbd; --box: #ececec; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: var(--ink); font-family: 'NSKR', 'NSJP', sans-serif; font-size: 10.5pt; line-height: 1.5; }
.jp { font-family: 'NSJP', 'NSKR', sans-serif; }
.pen { font-family: 'Pen', 'NSJP', sans-serif; }
ruby { ruby-position: over; }
rt { font-size: 0.45em; color: #444; letter-spacing: 0; font-family: 'NSJP', sans-serif; font-weight: 400; }
b { font-weight: 700; }

/* 머리글 */
.top { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 6px; }
.logo { display: flex; align-items: center; gap: 8px; }
.logo .mark { width: 30px; height: 30px; border: 2px solid var(--teal); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: var(--teal); font-family: 'NSJP'; }
.logo .code { font-size: 20px; font-weight: 700; letter-spacing: 1px; color: #444; }
.logo .code small { font-size: 11px; color: #777; font-weight: 400; margin-left: 6px; }
.top .series { font-size: 11px; color: #666; text-align: right; }
.top .series b { font-size: 12px; color: #333; }
.titlebar { display: flex; gap: 10px; align-items: stretch; margin-bottom: 10px; }
.titlebox { flex: 1; border: 1.5px solid var(--teal); border-radius: 6px; overflow: hidden; }
.titlebox .t1 { background: var(--teal-bg); color: #1f5f57; font-weight: 700; padding: 4px 10px; font-size: 11.5pt; border-bottom: 1px solid var(--teal); }
.titlebox .t2 { padding: 5px 10px 4px; font-size: 15pt; line-height: 1.6; }
.meta { width: 230px; white-space: nowrap; display: flex; flex-direction: column; justify-content: space-between; font-size: 10pt; color: #444; }
.meta .row { display: flex; align-items: flex-end; gap: 4px; border-bottom: 1px solid #999; padding-bottom: 3px; }
.meta .row span { flex: 1; text-align: right; letter-spacing: 0.5px; font-size: 9.5pt; }
.meta .row em { font-style: normal; color: #888; }

/* 포인트 */
.point { border: 1px solid #ccc; border-radius: 6px; padding: 7px 10px; margin-bottom: 10px; background: #fafafa; }
.point .ph { font-size: 9.5pt; font-weight: 700; color: var(--teal); letter-spacing: 1px; margin-bottom: 3px; }
.point .pt { font-size: 10pt; line-height: 1.6; }
.point .pt b { color: #b4530a; }
.rules { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; margin-top: 5px; }
.rule { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; border-bottom: 1px dotted #ccc; padding: 2px 0; }
.rule .rj { font-size: 11.5pt; line-height: 1.8; }
.rule .rk { font-size: 8.5pt; color: var(--dim); text-align: right; white-space: nowrap; }
.tip { margin-top: 6px; font-size: 9pt; color: #444; background: #fff7df; border-left: 3px solid #e5b84b; padding: 3px 8px; border-radius: 3px; }
.tip b { color: #b4530a; }

/* 섹션 */
.sec { display: flex; align-items: center; gap: 8px; margin: 10px 0 6px; font-size: 10.5pt; font-weight: 700; break-after: avoid; }
.sec .n { font-size: 15pt; color: var(--teal); font-weight: 700; min-width: 16px; }
.sec .tag { font-size: 8.5pt; border: 1px solid #999; border-radius: 3px; padding: 0 5px; color: #555; font-weight: 400; }

/* 본문 */
.passage { border: 1.5px solid var(--teal); border-radius: 8px; padding: 8px 14px 6px; margin-bottom: 8px; break-inside: avoid; }
.passage .pl { font-size: 15pt; line-height: 2.05; letter-spacing: 1px; }
.passage .pk { border-top: 1px dashed #bbb; margin-top: 4px; padding-top: 4px; font-size: 9pt; color: #444; line-height: 1.55; }
.ex2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-bottom: 4px; }
.ex { break-inside: avoid; }
.ex .q { font-size: 10.5pt; }
.line { border-bottom: 1.2px solid var(--line); height: 34px; }
.line.dbl { height: 36px; }

/* 연습 문제 */
.items { display: flex; flex-direction: column; gap: 7px; }
.item { break-inside: avoid; display: flex; gap: 8px; padding: 2px 0 2px; }
.item .no { font-size: 11pt; font-weight: 700; color: #333; min-width: 22px; padding-top: 2px; }
.item .body { flex: 1; }
.item .q { font-size: 13.5pt; line-height: 1.9; }
.item .q .blank { display: inline-block; min-width: 90px; border-bottom: 1.2px solid var(--line); height: 1.2em; vertical-align: bottom; margin: 0 3px; }
.item .ko { font-size: 9pt; color: var(--dim); margin-top: 1px; }
.item .inst { display: inline-block; font-size: 8.5pt; color: #1f5f57; background: var(--teal-bg); border-radius: 3px; padding: 0 6px; margin-left: 6px; vertical-align: middle; }
.item .type { font-size: 8pt; color: #888; border: 1px solid #ccc; border-radius: 3px; padding: 0 4px; margin-left: 4px; vertical-align: middle; font-weight: 400; }
.trace { position: relative; margin-top: 4px; }
.trace .ghost { font-size: 15pt; letter-spacing: 2px; color: #c4c4c4; line-height: 1.5; padding: 2px 6px 0; border-bottom: 1.2px solid var(--line); }
.trace .ghost rt { color: #d0d0d0; }
.wl { margin-top: 6px; }
.opts { font-size: 12pt; margin-top: 2px; }
.opts span { display: inline-block; margin-right: 6px; }
.opts .o { border: 1px solid #999; border-radius: 50%; padding: 0 9px; }
.hint { display: inline-block; background: var(--box); border-radius: 4px; padding: 2px 10px; font-size: 12pt; margin-top: 3px; }
.hint small { font-size: 7.5pt; color: #666; margin-right: 6px; font-family: 'NSKR'; }

/* 정답 */
.key h1 { font-size: 16pt; margin-bottom: 4px; }
.key .lead { font-size: 9.5pt; color: var(--dim); margin-bottom: 10px; }
.kstep { break-inside: avoid; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px; padding: 6px 10px; }
.kstep h2 { font-size: 11pt; color: #1f5f57; margin-bottom: 3px; }
.kstep h2 small { color: #888; font-weight: 400; margin-left: 6px; font-size: 9pt; }
.kstep ol { columns: 2; column-gap: 20px; list-style: none; font-size: 10pt; }
.kstep li { break-inside: avoid; line-height: 1.7; }
.kstep li .kn { color: #888; font-size: 8.5pt; margin-right: 4px; }
.kstep li .alt { color: #888; font-size: 8.5pt; }
.sheet { break-before: page; }
.cover { text-align: center; padding-top: 150px; }
.cover h1 { font-size: 30pt; margin-bottom: 8px; }
.cover .s { font-size: 13pt; color: var(--dim); margin-bottom: 30px; }
.cover .toc { text-align: left; display: inline-block; font-size: 10.5pt; line-height: 1.9; column-count: 2; column-gap: 40px; }
.cover .toc .lv { font-weight: 700; color: var(--teal); margin-top: 6px; break-after: avoid; }
.cover .toc .lv:first-child { margin-top: 0; }
.cover .howto { margin-top: 36px; font-size: 9.5pt; color: var(--dim); line-height: 1.8; }
`;

/* ── 한 장(step) 렌더링 ── */
function typeLabel(t) { return { extract: '본문', trace: '따라쓰기', fill: '빈칸', choice: '고르기', transform: '바꿔쓰기', compose: '작문' }[t]; }

function renderItem(it, no) {
  let body = '';
  if (it.type === 'trace') {
    body = `<div class="q jp">${ruby(it.jp)}</div><div class="ko">${esc(it.ko)}</div>
      <div class="trace"><div class="ghost jp pen">${ruby(it.jp)}</div></div><div class="line wl"></div>`;
  } else if (it.type === 'fill') {
    body = `<div class="q jp">${ruby(it.q).replace(/_{2,}/g, '<span class="blank"></span>')}</div><div class="ko">${esc(it.ko)}</div>`;
  } else if (it.type === 'choice') {
    body = `<div class="q jp">${ruby(it.q).replace(/＿/g, '<span class="blank"></span>')}</div><div class="ko">${esc(it.ko)}</div>
      <div class="opts jp">${it.opts.map((o) => `<span class="o">${ruby(o)}</span>`).join('')}<span style="font-size:8.5pt;color:#888">← 알맞은 것에 ○</span></div>`;
  } else if (it.type === 'transform') {
    body = `<div class="q jp">${ruby(it.q)} <span class="inst">→ ${esc(it.inst)}</span></div><div class="line"></div>`;
  } else if (it.type === 'compose') {
    body = `<div class="q" style="font-size:11.5pt">${esc(it.ko)}</div>${it.hint ? `<div class="hint jp"><small>힌트</small>${ruby(it.hint)}</div>` : ''}<div class="line dbl"></div>`;
  }
  return `<div class="item"><div class="no">${no}.</div><div class="body">${body}</div></div>`;
}

function renderStep(s) {
  const g = s.grammar;
  const ex = s.items.filter((it) => it.type === 'extract');
  const rest = s.items.filter((it) => it.type !== 'extract');
  const firstRule = g.rules[0][0];
  const head = `
    <div class="top">
      <div class="logo"><div class="mark">日</div><div class="code">${nn(s.id)}a <small>${esc(levelName(s.level))}</small></div></div>
      <div class="series"><b>일본어 학습지 · 초급</b><br>STEP ${nn(s.id)} / ${WS_STEPS.length}</div>
    </div>
    <div class="titlebar">
      <div class="titlebox">
        <div class="t1">${ruby(s.title)} · ${esc(s.sub)}</div>
        <div class="t2 jp pen">${ruby(firstRule)}</div>
      </div>
      <div class="meta">
        <div class="row"><em>날짜</em><span>월 &nbsp;&nbsp; 일 &nbsp;&nbsp; 시 &nbsp; 분 ~ &nbsp; 시 &nbsp; 분</span></div>
        <div class="row"><em>이름</em><span></span></div>
        <div class="row"><em>점수</em><span>&nbsp; / ${s.items.length}</span></div>
      </div>
    </div>
    <div class="point">
      <div class="ph">📖 오늘의 포인트</div>
      <div class="pt">${rubyHtml(g.point)}</div>
      <div class="rules">${g.rules.map(([jp, ko]) => `<div class="rule"><div class="rj jp">${ruby(jp)}</div><div class="rk">${esc(ko)}</div></div>`).join('')}</div>
      ${g.tip ? `<div class="tip">💡 ${rubyHtml(g.tip)}</div>` : ''}
    </div>`;
  const passage = s.passage ? `
    <div class="sec"><span class="n">1</span> 다음 글을 소리 내어 읽고, 빈칸에 알맞은 일본어를 쓰세요. <span class="tag">${nn(s.id)}a</span></div>
    <div class="passage">
      ${s.passage.jp.map((l) => `<div class="pl jp pen">${ruby(l)}</div>`).join('')}
      <div class="pk">${s.passage.ko.map(esc).join('<br>')}</div>
    </div>
    <div class="ex2">${ex.map((it, i) => `<div class="ex"><div class="q">(${i + 1}) ${esc(it.ko)}</div><div class="line"></div></div>`).join('')}</div>` : '';
  const items = `
    <div class="sec"><span class="n">${s.passage ? 2 : 1}</span> 오늘의 포인트를 참고하여, 알맞은 일본어를 쓰세요.</div>
    <div class="items">${rest.map((it, i) => renderItem(it, i + 1)).join('')}</div>`;
  return head + passage + items;
}

function renderKey() {
  const steps = WS_STEPS.map((s) => {
    const ex = s.items.filter((it) => it.type === 'extract');
    const rest = s.items.filter((it) => it.type !== 'extract');
    const li = (it, lab) => {
      const a = it.type === 'trace' ? [it.jp] : it.type === 'choice' ? [it.a] : it.a;
      const alt = a.length > 1 ? ` <span class="alt">(${a.slice(1).map(kanji).join(' / ')})</span>` : '';
      return `<li><span class="kn">${lab}</span><span class="jp">${ruby(a[0])}</span>${alt}</li>`;
    };
    return `<div class="kstep"><h2>STEP ${nn(s.id)} ${ruby(s.title)}<small>${esc(s.sub)}</small></h2>
      <ol>${ex.map((it, i) => li(it, `(${i + 1})`)).join('')}${rest.map((it, i) => li(it, `${i + 1}.`)).join('')}</ol></div>`;
  }).join('');
  return `<div class="key"><h1>정답</h1><div class="lead">괄호 안은 함께 인정되는 다른 표현이에요. 한자 부분은 히라가나로 써도 정답입니다.</div>${steps}</div>`;
}

function renderCover() {
  const toc = WS_LEVELS.map((lv) => `<div class="lv">${esc(lv.name)} — ${esc(lv.desc)}</div>` +
    WS_STEPS.filter((s) => s.level === lv.id).map((s) => `<div>${nn(s.id)}a &nbsp;<span class="jp">${ruby(s.title)}</span> · ${esc(s.sub)}</div>`).join('')).join('');
  return `<div class="cover"><h1>일본어 학습지 · 초급</h1><div class="s">본문 읽기 → 따라쓰기 → 빈칸 → 바꿔쓰기 → 작문 · 20장 + 정답</div>
    <div class="toc">${toc}</div>
    <div class="howto">하루 3장. 시작 시각과 끝난 시각을 적고, 다 푼 뒤 맨 뒤 정답으로 스스로 채점해 보세요.<br>연한 글씨는 따라 쓰고, 빈 줄에는 보지 않고 한 번 더 써 보세요.</div></div>`;
}

const page = (body) => `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage();
  const body = renderCover()
    + WS_STEPS.map((s) => `<div class="sheet">${renderStep(s)}</div>`).join('')
    + `<div class="sheet">${renderKey()}</div>`;
  await pg.setContent(page(body), { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  const file = path.join(OUT, '일본어학습지_초급.pdf');
  await pg.pdf({
    path: file, format: 'A4', printBackground: true,
    margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true, headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#888;padding:0 14mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>일본어 학습지 · 초급</span><span class="pageNumber"></span></div>',
  });
  await browser.close();
  console.log('done:', file);
})();
