/* 0권(문자편) 가타카나 단원 시안 — 한 단원 2쪽을 BaPi 스타일로 렌더 */
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'); const FONTS = path.join(ROOT, 'fonts'); const OUT = path.join(ROOT, 'out');
const fu = (f) => 'file://' + path.join(FONTS, f);
const UNIT = {
  no: 'K01', title: 'ア イ ウ エ オ', sub: '가타카나 ア행',
  chars: [['ア', 'あ', 'a', '아'], ['イ', 'い', 'i', '이'], ['ウ', 'う', 'u', '우'], ['エ', 'え', 'e', '에'], ['オ', 'お', 'o', '오']],
  tip: '가타카나는 <b>외래어·외국 이름·의성어</b>를 쓸 때 쓰는 글자예요. 소리는 히라가나와 똑같고 모양만 달라요. 긴 소리는 「ー」로 늘여요 (コーヒー = 코-히-).',
  words: [['アイス', 'あいす', '아이스(크림)'], ['エアコン', 'えあこん', '에어컨'], ['オイル', 'おいる', '오일'], ['ウイルス', 'ういるす', '바이러스'], ['イギリス', 'いぎりす', '영국'], ['オレンジ', 'おれんじ', '오렌지']],
  h2k: ['あい', 'うえ', 'いえ', 'あおい', 'おい', 'えあ'],
  pick: [['ア', 'マ', 'ヤ'], ['ウ', 'ワ', 'ク'], ['エ', 'ユ', 'コ'], ['オ', 'ホ', 'ネ'], ['イ', 'ト', 'ノ']],
  pickAsk: ['あ', 'う', 'え', 'お', 'い'],
};
const hi = (w, learned) => [...w].map((c) => learned.includes(c) ? `<b>${c}</b>` : c).join('');
const learned = UNIT.chars.map((c) => c[0]);
const CSS = `
@font-face { font-family: 'Klee'; src: url('${fu('KleeOne-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'Klee'; src: url('${fu('KleeOne-600.ttf')}'); font-weight: 600; }
@font-face { font-family: 'NSKR'; src: url('${fu('NotoSansKR-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'NSKR'; src: url('${fu('NotoSansKR-700.ttf')}'); font-weight: 700; }
@font-face { font-family: 'Inter'; src: url('${fu('Inter-900.ttf')}'); font-weight: 900; }
:root { --paper: #f4f0e9; --rule: #d9d2c5; --ac: #b9502f; --ink: #1d1d1b; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'NSKR', sans-serif; font-size: 10.5pt; color: var(--ink); line-height: 1.5; }
.jp { font-family: 'Klee', serif; }
.page { width: 590px; height: 888px; position: relative; break-after: page; overflow: hidden; }
.hdr { display: flex; justify-content: space-between; align-items: flex-end; height: 40px; padding-bottom: 7px; border-bottom: 2px solid var(--ink); margin-bottom: 14px; }
.hdr .u { display: flex; align-items: baseline; gap: 7px; font-family: 'Inter'; font-weight: 900; line-height: 1; }
.hdr .lab { font-size: 8px; letter-spacing: 2.5px; } .hdr .num { font-size: 27px; letter-spacing: -1px; } .hdr .pg { font-size: 9px; letter-spacing: 1px; color: #8a8a8a; margin-left: 4px; }
.hdr .ser { font-family: 'Inter', 'NSKR'; font-weight: 900; font-size: 8px; letter-spacing: 2.5px; color: #8a8a8a; }
.ttl { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; } .ttl .tj { font-size: 21pt; font-weight: 600; letter-spacing: 6px; } .ttl .tk { font-size: 10pt; color: #666; }
.stamp { margin-left: auto; width: 42px; height: 42px; align-self: center; transform: rotate(-9deg); }
.log { display: flex; align-items: flex-end; justify-content: space-between; background: var(--paper); border-radius: 6px; padding: 0 12px 8px; height: 42px; margin-bottom: 12px; font-size: 9pt; color: #555; white-space: nowrap; }
.log .g { display: flex; align-items: flex-end; gap: 5px; } .log .lb { font-family: 'Inter'; font-weight: 900; font-size: 8px; letter-spacing: 1.5px; color: #777; margin-right: 4px; padding-bottom: 2px; }
.log i { display: inline-block; border-bottom: 1.1px solid #555; height: 24px; width: 46px; } .log i.y { width: 62px; } .log i.n { width: 250px; }
.log { border-radius: 6px 6px 0 0; margin-bottom: 0; } .log.two { border-radius: 0 0 6px 6px; margin-bottom: 12px; height: 38px; }
.sec { display: flex; align-items: center; gap: 9px; margin: 14px 0 10px; font-size: 10.5pt; }
.sec .n { display: inline-flex; align-items: center; justify-content: center; width: 19px; height: 19px; border-radius: 4px; background: var(--ink); color: #fff; font-family: 'Inter'; font-weight: 900; font-size: 9.5pt; }
.cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.card { background: var(--paper); border-radius: 8px; text-align: center; padding: 8px 0 8px; }
.card .k { font-size: 44pt; font-weight: 600; line-height: 1.15; } .card .h { font-size: 13pt; color: #555; } .card .h small { font-family: 'Inter'; font-weight: 900; font-size: 7px; letter-spacing: 1.5px; color: var(--ac); margin-right: 5px; vertical-align: 2px; }
.card .r { font-size: 8.5pt; color: #888; margin-top: 1px; }
.tip { font-size: 9pt; color: #555; line-height: 1.6; margin-top: 8px; } .tip b { color: var(--ink); }
.wrow { display: flex; align-items: center; gap: 0; margin-bottom: 7px; }
.box { width: 53px; height: 53px; border: 1px solid #999; border-left: none; position: relative; display: flex; align-items: center; justify-content: center; font-size: 30pt; font-weight: 600; line-height: 1; }
.box:first-child { border-left: 1px solid #999; }
.box::before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; border-left: 1px dashed #d5d0c6; } .box::after { content: ''; position: absolute; top: 50%; left: 0; right: 0; border-top: 1px dashed #d5d0c6; }
.box span { position: relative; z-index: 1; } .box.m span { color: var(--ink); } .box.g span { color: #cfcfcf; }
.box.m { background: var(--paper); }
.words { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px 16px; }
.pic { height: 92px; border: 1.2px dashed #b9b2a6; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-family: 'Inter', 'NSKR'; font-weight: 900; font-size: 7.5px; letter-spacing: 2px; color: #b9b2a6; margin-bottom: 6px; }
.wd { display: flex; align-items: flex-end; gap: 8px; height: 40px; } .wd .n { font-size: 9pt; color: #999; width: 20px; padding-bottom: 4px; } .wd .w { font-size: 14.5pt; letter-spacing: 1px; line-height: 1; white-space: nowrap; } .wd .w b { color: var(--ac); font-weight: 600; }
.wd ruby rt { font-size: 7pt; color: #777; letter-spacing: 0; font-family: 'Klee'; } .wd .l { flex: 1; border-bottom: 1.2px solid #2b2b2b; height: 100%; } .wd .ko { font-size: 9pt; color: #777; padding-bottom: 4px; }
.h2k { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px 22px; } .hk { display: flex; align-items: flex-end; gap: 8px; height: 40px; } .hk .a { font-size: 15pt; white-space: nowrap; } .hk .ar { color: #999; padding-bottom: 3px; } .hk .l { flex: 1; border-bottom: 1.2px solid #2b2b2b; height: 100%; }
.pick { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; } .pk { text-align: center; border-top: 1px solid var(--rule); padding-top: 6px; } .pk .q { font-size: 15pt; color: #555; } .pk .o { font-size: 17pt; letter-spacing: 7px; margin-top: 2px; padding-left: 7px; white-space: nowrap; }
.note { margin-top: 12px; } .note .nh { font-size: 9pt; font-weight: 700; margin-bottom: 2px; } .note .nh em { font-style: normal; font-family: 'Inter'; font-weight: 900; font-size: 7.5px; letter-spacing: 2px; color: var(--ac); margin-right: 8px; } .note .nl { height: 34px; border-bottom: 1px solid var(--rule); }
.foot { position: absolute; left: 0; right: 0; bottom: -2px; display: flex; justify-content: space-between; font-family: 'Inter'; font-weight: 900; font-size: 10px; color: #8a8a8a; } .foot span:last-child { font-size: 7px; font-weight: 400; font-family: sans-serif; }
`;
const STAMP = `<svg class="stamp" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17.5" fill="none" stroke="#b9502f" stroke-width="2.2"/><circle cx="20" cy="20" r="14.2" fill="none" stroke="#b9502f" stroke-width="0.7"/><text x="20" y="18.6" text-anchor="middle" font-family="Klee" font-weight="600" font-size="12.5" fill="#b9502f">バ</text><text x="20" y="31" text-anchor="middle" font-family="Klee" font-weight="600" font-size="12.5" fill="#b9502f">ピ</text></svg>`;
const hdr = (pi) => `<div class="hdr"><div class="u"><span class="lab">UNIT</span><span class="num">${UNIT.no}</span><span class="pg">${pi} / 2</span></div><div class="ser">BaPi NIHONGO · VOL. 0 · 가타카나</div></div>`;
const sec = (n, t) => `<div class="sec"><span class="n">${n}</span>${t}</div>`;
const row = (c) => `<div class="wrow">${`<div class="box m"><span class="jp">${c}</span></div>` + `<div class="box g"><span class="jp">${c}</span></div>`.repeat(3) + '<div class="box"></div>'.repeat(7)}</div>`;
const p1 = `<div class="page">${hdr(1)}
  <div class="ttl"><span class="tj jp">${UNIT.title}</span><span class="tk">${UNIT.sub}</span>${STAMP}</div>
  <div class="log"><span class="g"><span class="lb">DATE</span><i class="y"></i>년 <i></i>월 <i></i>일</span><span class="g"><span class="lb">TIME</span><i></i>:<i></i> ~ <i></i>:<i></i></span></div>
  <div class="log two"><span class="g"><span class="lb">NAME</span><i class="n"></i></span><span class="g"><span class="lb">SCORE</span><i></i>/ 17</span></div>
  ${sec(1, '오늘의 글자. 히라가나와 짝지어 소리 내어 읽어 보세요.')}
  <div class="cards">${UNIT.chars.map(([k, h, r, ko]) => `<div class="card"><div class="k jp">${k}</div><div class="h jp"><small>ひらがな</small>${h}</div><div class="r">${r} · ${ko}</div></div>`).join('')}</div>
  <div class="tip">※ ${UNIT.tip}</div>
  ${sec(2, '진한 글자를 보고, 연한 글자 위에 따라 쓴 뒤 빈칸에 써 보세요.')}
  ${UNIT.chars.map(([k]) => row(k)).join('')}
  <div class="foot"><span>BaPi</span><span>1</span></div></div>`;
const p2 = `<div class="page">${hdr(2)}
  ${sec(3, '아는 말이에요. 소리 내어 읽고 뜻을 우리말로 써 보세요. (색 글자 = 오늘 배운 글자)')}
  <div class="words">${UNIT.words.map(([w, h], i) => `<div><div class="pic">IMAGE</div><div class="wd"><span class="n">(${i + 1})</span><span class="w jp"><ruby>${hi(w, learned)}<rt>${h}</rt></ruby></span><span class="l"></span></div></div>`).join('')}</div>
  ${sec(4, '히라가나를 가타카나로 바꿔 써 보세요.')}
  <div class="h2k">${UNIT.h2k.map((h, i) => `<div class="hk"><span class="a jp">${h}</span><span class="ar">→</span><span class="l"></span></div>`).join('')}</div>
  ${sec(5, '같은 소리의 가타카나에 ○표 하세요. (비슷하게 생긴 글자 조심!)')}
  <div class="pick">${UNIT.pick.map((o, i) => `<div class="pk"><div class="q jp">${UNIT.pickAsk[i]}</div><div class="o jp">${o.join('')}</div></div>`).join('')}</div>
  ${sec(6, '3번의 낱말을 가타카나로 한 번씩 써 보세요.')}
  ${[0, 1].map((i) => `<div class="wrow">${`<div class="box m" style="width:106px;font-size:14pt;border-left:1px solid #999"><span class="jp">${UNIT.words[i][0]}</span></div>` + '<div class="box"></div>'.repeat(9)}</div>`).join('')}
  <div class="note"><div class="nh"><em>NOTE</em>헷갈린 글자를 적어 두세요.</div><div class="nl"></div></div>
  <div class="foot"><span>BaPi</span><span>2</span></div></div>`;
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${p1}${p2}</body></html>`, { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  const f = path.join(OUT, 'kana_sample.pdf');
  await pg.pdf({ path: f, width: '182mm', height: '257mm', printBackground: true, margin: { top: '11mm', bottom: '11mm', left: '13mm', right: '13mm' } });
  await b.close(); console.log('done', f);
})();
