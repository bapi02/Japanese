/* 5권(독해편) 단원 시안 — 왼쪽: 긴 본문 / 오른쪽: 내용 이해 문제. 그림 자리는 빈 상자 */
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'); const FONTS = path.join(ROOT, 'fonts'); const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const fu = (f) => 'file://' + path.join(FONTS, f);
const RUBY = /\{([^|{}]+)\|([^|{}]+)\}/g;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const rb = (s) => esc(s).replace(RUBY, '<ruby>$1<rt>$2</rt></ruby>').replace(/\[\[(.+?)\]\]/g, '<u>$1</u>');

const UNITS = [{
  no: 'R01', title: 'コンビニのアルバイト', sub: '편의점 아르바이트', level: 'N4', chars: 230, genre: '생활문', goal: '3분', pic: 118,
  // 문단별 문장. [[ ]] = 밑줄(문제에서 물어보는 부분)
  paras: [
    ['わたしは{先月|せんげつ}から、{駅前|えきまえ}のコンビニでアルバイトをしています。', '{週|しゅう}に{三回|さんかい}、{夕方|ゆうがた}の{五時|ごじ}から{九時|くじ}まで{働|はたら}いています。'],
    ['はじめは、レジの{使|つか}い{方|かた}がわからなくて、{何度|なんど}も{店長|てんちょう}に{聞|き}きました。', 'お{客|きゃく}さんに「{遅|おそ}い」と{言|い}われて、{泣|な}きそうになったこともあります。'],
    ['でも、{今|いま}は{一人|ひとり}でレジができるようになりました。', 'いつも{来|く}るおばあさんが「いつもありがとう」と{言|い}ってくれました。', '[[そのとき]]、とてもうれしかったです。'],
    ['アルバイトは{大変|たいへん}ですが、{日本語|にほんご}を{話|はな}す{練習|れんしゅう}になるので、{続|つづ}けるつもりです。', '{来月|らいげつ}の{給料|きゅうりょう}で、{母|はは}にプレゼントを{買|か}おうと{思|おも}っています。'],
  ],
  words: [['アルバイト', '아르바이트'], ['{夕方|ゆうがた}', '저녁 무렵'], ['レジ', '계산대'], ['{使|つか}い{方|かた}', '사용법'], ['{店長|てんちょう}', '점장'], ['お{客|きゃく}さん', '손님'], ['{続|つづ}ける', '계속하다'], ['{給料|きゅうりょう}', '급여']],
  tf: ['この{人|ひと}は{毎日|まいにち}コンビニで{働|はたら}いています。', 'はじめは、レジが{上手|じょうず}に{使|つか}えませんでした。', 'お{客|きゃく}さんに{怒|おこ}られて、アルバイトをやめました。', '{来月|らいげつ}、お{母|かあ}さんにプレゼントを{買|か}うつもりです。'],
  qa: ['この{人|ひと}は、いつからアルバイトをしていますか。', 'はじめは、どうして{店長|てんちょう}に{何度|なんど}も{聞|き}きましたか。', 'どうしてアルバイトを{続|つづ}けるつもりですか。'],
  ref: { q: '「そのとき」は、いつのことですか。', opts: ['お{客|きゃく}さんに「{遅|おそ}い」と{言|い}われたとき', 'おばあさんが「いつもありがとう」と{言|い}ってくれたとき', '{店長|てんちょう}にレジの{使|つか}い{方|かた}を{聞|き}いたとき'] },
  order: ['{一人|ひとり}でレジができるようになった。', 'コンビニでアルバイトを{始|はじ}めた。', 'おばあさんに「ありがとう」と{言|い}われた。', 'お{客|きゃく}さんに「{遅|おそ}い」と{言|い}われた。'],
  write: 'あなたはアルバイトをしたことがありますか。どんな{仕事|しごと}をしてみたいですか。',
}, {
  no: 'R02', title: '{消|き}えたプリン', sub: '사라진 푸딩', level: 'N4', chars: 290, genre: '이야기', goal: '4분', pic: 136,
  paras: [
    ['{昨日|きのう}の{夜|よる}、わたしは{冷蔵庫|れいぞうこ}にプリンを{入|い}れておきました。', '{今日|きょう}、{学校|がっこう}から{帰|かえ}ったら{食|た}べるつもりでした。'],
    ['ところが、{家|いえ}に{帰|かえ}って{冷蔵庫|れいぞうこ}を{開|あ}けると、プリンがありません。', '{弟|おとうと}に{聞|き}くと、「{知|し}らないよ」と{言|い}いました。', 'でも、{弟|おとうと}の{口|くち}のまわりに{何|なに}かついています。'],
    ['「{食|た}べたでしょう」と{言|い}うと、{弟|おとうと}は{泣|な}きそうな{顔|かお}で「ごめんなさい」と{言|い}いました。', 'わたしは{少|すこ}し{怒|おこ}っていましたが、[[それ]]を{見|み}て、{何|なに}も{言|い}えなくなりました。'],
    ['{夜|よる}、{弟|おとうと}がコンビニでプリンを{二|ふた}つ{買|か}ってきてくれました。', '{一|ひと}つは{母|はは}に{食|た}べられてしまいましたが、とてもおいしかったです。'],
  ],
  words: [['{冷蔵庫|れいぞうこ}', '냉장고'], ['ところが', '그런데'], ['{口|くち}のまわり', '입 주위'], ['つく', '묻다'], ['{怒|おこ}る', '화내다'], ['{顔|かお}', '얼굴']],
  tf: ['わたしは{昨日|きのう}の{夜|よる}、プリンを{食|た}べました。', '{弟|おとうと}ははじめ、「{知|し}らない」と{言|い}いました。', '{弟|おとうと}はプリンを{一|ひと}つだけ{買|か}ってきました。', 'お{母|かあ}さんもプリンを{食|た}べました。'],
  qa: ['わたしは、いつプリンを{食|た}べるつもりでしたか。', 'どうして{弟|おとうと}が{食|た}べたとわかりましたか。', '{夜|よる}、{弟|おとうと}は{何|なに}をしてくれましたか。'],
  ref: { q: '「それ」は{何|なん}ですか。', opts: ['{弟|おとうと}の{泣|な}きそうな{顔|かお}', '{冷蔵庫|れいぞうこ}の{中|なか}', 'コンビニのプリン'] },
  order: ['{弟|おとうと}が「ごめんなさい」と{言|い}った。', 'プリンを{冷蔵庫|れいぞうこ}に{入|い}れた。', '{弟|おとうと}がプリンを{買|か}ってきてくれた。', '{冷蔵庫|れいぞうこ}を{開|あ}けたら、プリンがなかった。'],
  write: 'あなたも{食|た}べ{物|もの}をだれかに{食|た}べられたことがありますか。そのとき、どうしましたか。',
}];
const CSS = `
@font-face { font-family: 'Klee'; src: url('${fu('KleeOne-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'Klee'; src: url('${fu('KleeOne-600.ttf')}'); font-weight: 600; }
@font-face { font-family: 'NSKR'; src: url('${fu('NotoSansKR-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'NSKR'; src: url('${fu('NotoSansKR-700.ttf')}'); font-weight: 700; }
@font-face { font-family: 'Inter'; src: url('${fu('Inter-900.ttf')}'); font-weight: 900; }
:root { --paper: #f4f0e9; --rule: #d9d2c5; --ac: #b9502f; --ink: #1d1d1b; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'NSKR', sans-serif; font-size: 10.5pt; color: var(--ink); line-height: 1.5; }
.jp { font-family: 'Klee', serif; } ruby rt { font-size: 0.42em; color: #333; font-family: 'Klee'; letter-spacing: 0; }
u { text-decoration: none; border-bottom: 2px solid var(--ac); padding-bottom: 1px; }
.page { width: 590px; height: 888px; position: relative; break-after: page; overflow: hidden; }
.hdr { display: flex; justify-content: space-between; align-items: flex-end; height: 40px; padding-bottom: 7px; border-bottom: 2px solid var(--ink); margin-bottom: 14px; }
.hdr .u { display: flex; align-items: baseline; gap: 7px; font-family: 'Inter'; font-weight: 900; line-height: 1; }
.hdr .lab { font-size: 8px; letter-spacing: 2.5px; } .hdr .num { font-size: 27px; letter-spacing: -1px; } .hdr .pg { font-size: 9px; letter-spacing: 1px; color: #8a8a8a; margin-left: 4px; }
.hdr .ser { font-family: 'Inter', 'NSKR'; font-weight: 900; font-size: 8px; letter-spacing: 2.5px; color: #8a8a8a; }
.ttl { display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px; } .ttl .tj { font-size: 18pt; font-weight: 600; letter-spacing: 1px; } .ttl .tk { font-size: 10pt; color: #666; }
.stamp { margin-left: auto; width: 42px; height: 42px; align-self: center; transform: rotate(-9deg); }
.badges { display: flex; gap: 8px; margin-bottom: 10px; } .badges span { font-family: 'Inter', 'NSKR'; font-weight: 900; font-size: 7.5px; letter-spacing: 1.5px; color: var(--ac); border: 1px solid var(--ac); border-radius: 10px; padding: 2px 8px; }
.log { display: flex; align-items: flex-end; justify-content: space-between; background: var(--paper); border-radius: 6px; padding: 0 12px 8px; height: 40px; margin-bottom: 12px; font-size: 9pt; color: #555; white-space: nowrap; }
.log .g { display: flex; align-items: flex-end; gap: 5px; } .log .lb { font-family: 'Inter', 'NSKR'; font-weight: 900; font-size: 8px; letter-spacing: 1.5px; color: #777; margin-right: 4px; padding-bottom: 2px; }
.log i { display: inline-block; border-bottom: 1.1px solid #555; height: 22px; width: 40px; } .log i.y { width: 56px; }
.sec { display: flex; align-items: center; gap: 9px; margin: 10px 0 6px; font-size: 10.5pt; }
.sec .n { display: inline-flex; align-items: center; justify-content: center; width: 19px; height: 19px; border-radius: 4px; background: var(--ink); color: #fff; font-family: 'Inter'; font-weight: 900; font-size: 9.5pt; flex-shrink: 0; }
.pic { height: 118px; border: 1.2px dashed #b9b2a6; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-family: 'Inter'; font-weight: 900; font-size: 8px; letter-spacing: 2px; color: #b9b2a6; margin-bottom: 10px; }
.text { counter-reset: para; }
.para { display: flex; gap: 10px; margin-bottom: 4px; } .para .pn { font-family: 'Inter'; font-weight: 900; font-size: 8px; color: #b0a89a; width: 12px; padding-top: 13px; flex-shrink: 0; }
.para .pt { font-size: 14pt; line-height: 1.98; letter-spacing: 0.8px; text-indent: 1em; }
.words { margin-top: 8px; border-top: 1px solid var(--rule); padding-top: 7px; display: flex; flex-wrap: wrap; gap: 2px 16px; font-size: 8.3pt; color: #666; }
.words .wh { flex-basis: 100%; font-family: 'Inter', 'NSKR'; font-weight: 900; font-size: 7.5px; letter-spacing: 2px; color: var(--ac); margin-bottom: 1px; } .words .jp { font-size: 10.5pt; color: #222; margin-right: 4px; }
.tf { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; } .tf .no { font-size: 9.5pt; width: 22px; flex-shrink: 0; } .tf .s { flex: 1; font-size: 11.5pt; line-height: 1.72; } .tf .ox { font-size: 11pt; color: #888; letter-spacing: 3px; white-space: nowrap; }
.qa { margin-bottom: 4px; } .qa .q { display: flex; gap: 8px; align-items: baseline; font-size: 11.5pt; line-height: 1.72; } .qa .no { font-size: 9.5pt; width: 22px; flex-shrink: 0; }
.ln { border-bottom: 1.2px solid #2b2b2b; height: 25px; margin-left: 30px; }
.ref .q { font-size: 11.5pt; line-height: 1.72; margin-left: 2px; } .ref .o { display: flex; gap: 8px; align-items: baseline; font-size: 11pt; line-height: 1.7; margin-left: 8px; } .ref .o .c { font-family: 'Inter'; font-weight: 900; font-size: 9pt; color: #888; }
.ord { display: flex; align-items: baseline; gap: 8px; font-size: 11pt; line-height: 1.78; margin-left: 2px; } .ord .bx { display: inline-block; width: 24px; height: 22px; border: 1.1px solid #555; border-radius: 3px; flex-shrink: 0; transform: translateY(5px); }
.wq { font-size: 11.5pt; line-height: 1.72; margin-left: 2px; } .wl { border-bottom: 1px solid var(--rule); height: 29px; }
.foot { position: absolute; left: 0; right: 0; bottom: -2px; display: flex; justify-content: space-between; font-family: 'Inter'; font-weight: 900; font-size: 10px; color: #8a8a8a; } .foot span:last-child { font-size: 7px; font-weight: 400; font-family: sans-serif; }
`;
const STAMP = `<svg class="stamp" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17.5" fill="none" stroke="#b9502f" stroke-width="2.2"/><circle cx="20" cy="20" r="14.2" fill="none" stroke="#b9502f" stroke-width="0.7"/><text x="20" y="18.6" text-anchor="middle" font-family="Klee" font-weight="600" font-size="12.5" fill="#b9502f">バ</text><text x="20" y="31" text-anchor="middle" font-family="Klee" font-weight="600" font-size="12.5" fill="#b9502f">ピ</text></svg>`;
function render(UNIT) {
const hdr = (pi) => `<div class="hdr"><div class="u"><span class="lab">UNIT</span><span class="num">${UNIT.no}</span><span class="pg">${pi} / 2</span></div><div class="ser">BaPi NIHONGO · VOL. 5 · 독해</div></div>`;
const sec = (n, t) => `<div class="sec"><span class="n">${n}</span>${t}</div>`;
const p1 = `<div class="page">${hdr(1)}
  <div class="ttl"><span class="tj jp">${rb(UNIT.title)}</span><span class="tk">${UNIT.sub}</span>${STAMP}</div>
  <div class="badges"><span>${UNIT.genre}</span><span>LEVEL ${UNIT.level}</span><span>약 ${UNIT.chars}자</span><span>목표 ${UNIT.goal}</span></div>
  <div class="log"><span class="g"><span class="lb">DATE</span><i class="y"></i>년 <i></i>월 <i></i>일</span><span class="g"><span class="lb">읽은 시간</span><i></i>분 <i></i>초</span><span class="g"><span class="lb">SCORE</span><i></i>/ 12</span></div>
  ${sec(1, '먼저 끝까지 한 번 읽고, 시간을 적어 보세요. 그다음 소리 내어 한 번 더 읽어요.')}
  <div class="pic" style="height:${UNIT.pic}px">IMAGE</div>
  <div class="text">${UNIT.paras.map((p, i) => `<div class="para"><span class="pn">${i + 1}</span><div class="pt jp">${p.map(rb).join('')}</div></div>`).join('')}</div>
  <div class="words"><div class="wh">WORDS</div>${UNIT.words.map(([w, k]) => `<span><span class="jp">${rb(w)}</span>${k}</span>`).join('')}</div>
  <div class="foot"><span>BaPi</span><span>1</span></div></div>`;
const p2 = `<div class="page">${hdr(2)}
  ${sec(2, '본문 내용과 맞으면 ○, 다르면 ×에 표시하세요.')}
  ${UNIT.tf.map((t, i) => `<div class="tf"><span class="no">(${i + 1})</span><span class="s jp">${rb(t)}</span><span class="ox">○ ・ ×</span></div>`).join('')}
  ${sec(3, '질문에 일본어로 답하세요. 답은 본문 안에 있어요.')}
  ${UNIT.qa.map((q, i) => `<div class="qa"><div class="q"><span class="no">(${i + 1})</span><span class="jp">${rb(q)}</span></div><div class="ln"></div></div>`).join('')}
  ${sec(4, '밑줄 친 말이 가리키는 것을 고르세요.')}
  <div class="ref"><div class="q jp">${rb(UNIT.ref.q)}</div>${UNIT.ref.opts.map((o, i) => `<div class="o"><span class="c">${'ABC'[i]}</span><span class="jp">${rb(o)}</span></div>`).join('')}</div>
  ${sec(5, '일어난 순서대로 1~4 번호를 쓰세요.')}
  ${UNIT.order.map((o) => `<div class="ord"><span class="bx"></span><span class="jp">${rb(o)}</span></div>`).join('')}
  ${sec(6, '내 이야기를 두세 문장으로 써 보세요.')}
  <div class="wq jp">${rb(UNIT.write)}</div><div class="wl"></div><div class="wl"></div>
  <div class="foot"><span>BaPi</span><span>2</span></div></div>`;
return p1 + p2;
}
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${UNITS.map(render).join('')}</body></html>`, { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  const over = await pg.evaluate(() => [...document.querySelectorAll('.page')].map((p) => { const f = p.querySelector('.foot'); const kids = [...p.children].filter((c) => c !== f); return Math.round(Math.max(...kids.map((c) => c.offsetTop + c.offsetHeight))); }));
  console.log('content bottoms (page height 888, footer at ~872):', over);
  const f = path.join(OUT, 'reading_sample.pdf');
  await pg.pdf({ path: f, width: '182mm', height: '257mm', printBackground: true, margin: { top: '11mm', bottom: '11mm', left: '13mm', right: '13mm' } });
  await b.close(); console.log('done', f);
})();
