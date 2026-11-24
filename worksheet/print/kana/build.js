/* 0권(문자편) 빌드 — 히라가나 16단원 + 가타카나 18단원, 단원마다 2쪽(왼쪽 익히기 / 오른쪽 문제)
   node worksheet/print/kana/build.js [screen|wireless]
   screen   : B5 182×257, 표지 포함 한 파일 (집 인쇄용)
   wireless : 재단 여백 3mm + 제본 쪽 여백을 홀짝으로 번갈아 넣은 내지 (188×263)
   획순 그림은 KanjiVG(CC BY-SA 3.0, © Ulrich Apel) 데이터를 씀 → strokes.json */
const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const { chromium } = require('playwright');
const D = require('./data.js');
const STROKES = JSON.parse(fs.readFileSync(path.join(__dirname, 'strokes.json'), 'utf8'));
const ROOT = path.join(__dirname, '..'); const FONTS = path.join(ROOT, 'fonts'); const OUT = path.join(ROOT, 'out');
const MODE = process.argv[2] || 'screen';
const BLEED = MODE === 'wireless' ? 3 : 0;
const PAGE_W = 182 + 2 * BLEED, PAGE_H = 257 + 2 * BLEED;
const CW = 590, CH = 888, MM = 96 / 25.4;
const OUTER = 13 + BLEED, INNER = MODE === 'wireless' ? 13 + BLEED + 6 : 13;
const SCALE = (PAGE_W - OUTER - INNER) * MM / CW;
const TOP = 11 + BLEED + (CH * (1 - SCALE)) / MM / 2;
const fu = (f) => 'file://' + path.join(FONTS, f);

/* ── 가나 도구 ── */
const k2h = (s) => [...s].map((c) => { const o = c.charCodeAt(0); return o >= 0x30a1 && o <= 0x30f6 ? String.fromCharCode(o - 0x60) : c; }).join('');
const h2k = (s) => [...s].map((c) => { const o = c.charCodeAt(0); return o >= 0x3041 && o <= 0x3096 ? String.fromCharCode(o + 0x60) : c; }).join('');
const RO = {}; const KO = {};
[...D.BASIC, ...D.DAKU].forEach(([h, , r, k]) => { const rs = r.split(' '), ks = k.split(' '); [...h].forEach((c, i) => { RO[c] = rs[i]; KO[c] = ks[i]; }); });
const SMALL = ['ゃ', 'ゅ', 'ょ'];
D.YOON.forEach(([b, r, k]) => { const rs = r.split(' '), ks = k.split(' '); SMALL.forEach((s, i) => { RO[b + s] = rs[i]; KO[b + s] = ks[i]; }); });
const roma = (s) => { const cs = [...s], out = []; for (let i = 0; i < cs.length; i++) { const two = cs[i] + (cs[i + 1] || ''); if (RO[two]) { out.push(RO[two]); i++; } else out.push(RO[cs[i]] || cs[i]); } return out.join('·'); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* ── 획순 그림 ── */
const startOf = (d) => { const m = d.match(/M\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/); return [parseFloat(m[1]), parseFloat(m[2])]; };
function stepSvg(ch, k, size) {
  const s = STROKES[ch]; if (!s) return '';
  const order = s.d.map((d, i) => [d, i]).sort((a, b) => (a[1] > k ? -1 : a[1] === k ? 1 : 0) - (b[1] > k ? -1 : b[1] === k ? 1 : 0));
  const [x, y] = startOf(s.d[k]);
  return `<svg viewBox="0 0 109 109" width="${size}" height="${size}"><g fill="none" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round">${order.map(([d, i]) => `<path d="${d}" stroke="${i < k ? '#1d1d1b' : i === k ? '#b9502f' : '#e4ded2'}"/>`).join('')}</g><circle cx="${x}" cy="${y}" r="7.5" fill="#b9502f"/></svg>`;
}
const steps = (ch, size) => `<div class="so">${STROKES[ch].d.map((_, k) => `<span>${stepSvg(ch, k, size)}<i>${k + 1}</i></span>`).join('')}</div>`;
function dirSvg(ch, size) { // 모든 획 + 시작점(●), 끝의 화살촉은 브라우저에서 붙임
  const s = STROKES[ch];
  return `<svg class="dir" viewBox="0 0 109 109" width="${size}" height="${size}"><g fill="none" stroke="#1d1d1b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${s.d.map((d) => `<path d="${d}"/>`).join('')}</g>${s.d.map((d) => { const [x, y] = startOf(d); return `<circle cx="${x}" cy="${y}" r="6.5" fill="#b9502f"/>`; }).join('')}</svg>`;
}

/* ── 단원 정의 ── */
const UNITS = [];
const SCRIPT = { h: { name: '히라가나', jp: 'ひらがな', col: 0 }, k: { name: '가타카나', jp: 'カタカナ', col: 1 } };
const charInfo = (sc, row, table) => [...row[SCRIPT[sc].col]].map((c, i) => ({ c, h: [...row[0]][i], r: row[2].split(' ')[i], ko: row[3].split(' ')[i] }));
const pickItems = (sc, list) => list.map(([a, o]) => ({ ask: sc === 'h' ? roma(a).replace(/·/g, '') : k2h(a), opts: [a, ...(Array.isArray(o) ? o : [...o])], ans: a }));
const wordSec = (sc, words) => ({ t: 'words', items: words });
const convSec = (sc, list) => sc === 'h'
  ? { t: 'conv', title: '로마자를 보고 히라가나로 써 보세요.', items: list.map((k) => [roma(k), k]), cls: 'ro' }
  : { t: 'conv', title: '히라가나를 가타카나로 바꿔 써 보세요.', items: list.map((h) => [h, h2k(h)]), cls: 'jp' };
const pickTitle = (sc) => sc === 'h' ? '같은 소리의 히라가나에 ○표 하세요.' : '같은 소리의 가타카나에 ○표 하세요. (비슷하게 생긴 글자 조심!)';
const stdP2 = (sc, d) => [wordSec(sc, d.words), convSec(sc, d.conv), { t: 'pick', title: pickTitle(sc), items: pickItems(sc, d.pick) }, { t: 'wordwrite', words: d.words.slice(0, 2).map((w) => w[0]) }, { t: 'note' }];

function addRows(sc) {
  const rows = sc === 'h' ? D.H_ROWS : D.K_ROWS;
  rows.forEach((d, i) => {
    const info = charInfo(sc, D.BASIC[i]); const nm = SCRIPT[sc].name;
    UNITS.push({ sc, title: info.map((x) => x.c).join(' '), sub: `${nm} ${sc === 'h' ? D.ROW_NAME[i] : h2k(D.ROW_NAME[i])}행${i === 9 ? ' · ' + (sc === 'h' ? 'ん' : 'ン') : ''}`, learned: info.map((x) => x.c),
      p1: [{ t: 'cards', chars: info }, { t: 'tip', html: d.tip }, { t: 'grid1', chars: info.map((x) => x.c) }], p2: stdP2(sc, d) });
  });
}
function addDaku(sc, key, idx, label) {
  const d = (sc === 'h' ? D.H_SPECIAL : D.K_SPECIAL)[key]; const rows = idx.map((i) => D.DAKU[i]);
  const info = rows.flatMap((r) => charInfo(sc, r).map((x, j) => ({ ...x, from: sc === 'h' ? [...r[4]][j] : h2k([...r[4]][j]), mark: r[0][0] === 'ぱ' ? '゜' : '゛' })));
  UNITS.push({ sc, title: rows.map((r) => r[SCRIPT[sc].col][0]).join(' ・ '), sub: `${SCRIPT[sc].name} ${label}`, learned: info.map((x) => x.c),
    p1: [{ t: 'minis', chars: info }, { t: 'tip', html: d.tip }, { t: 'gridN', items: [0, 1, 2, 3, 4].flatMap((j) => idx.map((_, r) => [info[r * 5 + j].c])), per: idx.length === 2 ? 2 : 3 }], p2: stdP2(sc, d) });
}
function addYoon(sc, key, from, to, label) {
  const d = (sc === 'h' ? D.H_SPECIAL : D.K_SPECIAL)[key]; const rows = D.YOON.slice(from, to);
  const items = rows.flatMap(([b, r, k]) => SMALL.map((s, i) => { const h = b + s; return [sc === 'h' ? h : h2k(h), r.split(' ')[i]]; }));
  const p1 = [{ t: 'explain', title: '작은 글자가 붙으면 한 박자가 돼요. 소리 내어 읽어 보세요.', html: `<div class="yo jp">${rows.slice(0, 3).map(([b, r]) => { const c = sc === 'h' ? b : h2k(b); const s = sc === 'h' ? 'ゃ' : 'ャ'; return `<span>${c} <em>+</em> <small>${s}</small> <em>=</em> <b>${c}${s}</b><i>${r.split(' ')[0]}</i></span>`; }).join('')}</div><p>${d.tip}</p>` },
    { t: 'gridN', items, per: 3, wide: true }];
  if (d.pairs) p1.push({ t: 'pairs', title: '작은 글자와 큰 글자는 다른 말이에요. 소리 내어 비교해 보세요.', items: d.pairs });
  if (d.read) p1.push({ t: 'conv', title: '가타카나를 읽고 히라가나로 써 보세요.', items: d.read, cls: 'jp' });
  UNITS.push({ sc, title: items.slice(0, 3).map((x) => x[0]).join(' '), sub: `${SCRIPT[sc].name} ${label}`, learned: [...new Set(items.flatMap((x) => [...x[0]]))].filter((c) => 'ゃゅょャュョ'.includes(c)),
    p1, p2: stdP2(sc, d) });
}

/* 히라가나 */
addRows('h');
addDaku('h', 'd1', [0, 1], '탁음 1 (が행 · ざ행)');
addDaku('h', 'd2', [2, 3, 4], '탁음 2 (だ행 · ば행 · ぱ행)');
addYoon('h', 'y1', 0, 7, '요음 1');
addYoon('h', 'y2', 7, 11, '요음 2');
UNITS.push({ sc: 'h', title: 'っ ・ おかあさん', sub: '히라가나 촉음 · 긴 소리', learned: ['っ'],
  p1: [
    { t: 'pairs', title: '<b>작은 っ(촉음)</b>: 뒤 글자를 소리 낼 준비를 한 채 한 박자 멈춰요. 비교해 읽어 보세요.', items: [['きて', '와 줘', 'きって', '우표'], ['かこ', '과거', 'かっこ', '괄호'], ['さか', '언덕', 'さっか', '작가'], ['おと', '소리', 'おっと', '남편']] },
    { t: 'explain', title: '<b>긴 소리(장음)</b>: 모음 글자를 하나 더 붙여서 한 박자 길게 끌어요.', html: `<table class="lv jp"><tr><td>あ단 + <b>あ</b></td><td>おか<b>あ</b>さん <i>어머니</i></td><td>い단 + <b>い</b></td><td>おに<b>い</b>さん <i>형·오빠</i></td></tr><tr><td>う단 + <b>う</b></td><td>く<b>う</b>き <i>공기</i></td><td>え단 + <b>い</b></td><td>せんせ<b>い</b> <i>선생님 (「에-」로 읽음)</i></td></tr><tr><td>お단 + <b>う</b></td><td>おと<b>う</b>さん <i>아버지 (「오-」로 읽음)</i></td><td>예외</td><td>おね<b>え</b>さん · お<b>お</b>きい</td></tr></table>` },
    { t: 'pairs', title: '길게 끌면 다른 말이 돼요. 비교해 읽어 보세요.', items: [['おばさん', '아주머니', 'おばあさん', '할머니'], ['おじさん', '아저씨', 'おじいさん', '할아버지'], ['ゆき', '눈(겨울)', 'ゆうき', '용기'], ['ここ', '여기', 'こうこう', '고등학교']] },
    { t: 'gridN', title: '큰 つ와 작은 っ를 구별해서 써 보세요. 작은 っ는 칸의 왼쪽 아래에 써요.', items: [['つ'], ['っ']], per: 2 },
    { t: 'wordwrite', title: '촉음이 든 낱말을 써 보세요.', words: ['きって', 'がっこう'] },
  ],
  p2: [
    { t: 'words', items: [['きって', '우표'], ['きっぷ', '표'], ['がっこう', '학교'], ['ざっし', '잡지'], ['おかあさん', '어머니'], ['こうえん', '공원']] },
    { t: 'conv', title: '로마자를 보고 히라가나로 써 보세요. (같은 자음 두 번 = 작은 っ)', items: [['matte', 'まって'], ['issho', 'いっしょ'], ['kekkon', 'けっこん'], ['otousan', 'おとうさん'], ['oneesan', 'おねえさん'], ['tokei', 'とけい']], cls: 'ro' },
    { t: 'choose', title: '바르게 쓴 것에 ○표 하세요.', items: [['학교', ['がっこう', 'がこう', 'がっこ']], ['우표', ['きって', 'きて', 'きっと']], ['어머니', ['おかあさん', 'おかさん', 'おかんさん']], ['선생님', ['せんせい', 'せんせ', 'せえせい']], ['공원', ['こうえん', 'こえん', 'こおえん']]] },
    { t: 'note' },
  ] });
UNITS.push({ sc: 'h', title: 'ひらがな まとめ', sub: '히라가나 총정리', learned: [],
  p1: [{ t: 'table', sc: 'h', title: '빈칸에 알맞은 히라가나를 채워 오십음도를 완성하세요.' }],
  p2: [
    { t: 'lines2', title: '인사말이에요. 소리 내어 읽고 한 번씩 따라 써 보세요.', items: [['おはようございます', '안녕하세요 (아침)'], ['こんにちは', '안녕하세요 (낮)'], ['こんばんは', '안녕하세요 (저녁)'], ['ありがとうございます', '감사합니다'], ['すみません', '죄송합니다 · 저기요'], ['さようなら', '안녕히 가세요']] },
    { t: 'conv', title: '로마자를 보고 히라가나로 써 보세요.', items: [['o·ha·yo·u', 'おはよう'], ['a·ri·ga·to·u', 'ありがとう'], ['ni·ho·n·go', 'にほんご'], ['to·mo·da·chi', 'ともだち'], ['be·n·kyo·u', 'べんきょう'], ['o·i·shi·i', 'おいしい']], cls: 'ro' },
    { t: 'explain', title: '조사로 쓰일 때는 소리가 달라져요. 조사에 ○표 하고 소리 내어 읽어 보세요.', html: `<p><b class="jp">は</b> → 「와(wa)」 ~은/는 &nbsp;·&nbsp; <b class="jp">へ</b> → 「에(e)」 ~에/로 &nbsp;·&nbsp; <b class="jp">を</b> → 「오(o)」 ~을/를 &nbsp;·&nbsp; こんにち<b class="jp">は</b>의 は도 「와」로 읽어요.</p>`, score: 4 },
    { t: 'lines2', plain: true, items: [['わたしは がくせいです。', '나는 학생입니다.'], ['これは ほんです。', '이것은 책입니다.'], ['がっこうへ いきます。', '학교에 갑니다.'], ['みずを のみます。', '물을 마십니다.']], ans: ['は', 'は', 'へ', 'を'] },
    { t: 'explain', title: '읽기 도전! 첫 자기소개예요. 막힘없이 읽힐 때까지 세 번 읽고 □에 표시하세요.', html: '<p class="jp rd">はじめまして。わたしは ゆいです。<br>にほんごを べんきょうして います。<br>どうぞ よろしく おねがいします。</p><p class="rk">처음 뵙겠습니다. 저는 유이입니다. 일본어를 공부하고 있습니다. 잘 부탁드립니다. <span class="cb">□ □ □</span></p>' },
    { t: 'note' },
  ] });
const H_COUNT = UNITS.length;

/* 가타카나 */
addRows('k');
addDaku('k', 'd1', [0, 1], '탁음 1 (ガ행 · ザ행)');
addDaku('k', 'd2', [2, 3, 4], '탁음 2 (ダ행 · バ행 · パ행)');
addYoon('k', 'y1', 0, 7, '요음 1');
addYoon('k', 'y2', 7, 11, '요음 2');
UNITS.push({ sc: 'k', title: 'ー ・ ッ', sub: '가타카나 긴 소리 · 촉음', learned: ['ー', 'ッ'],
  p1: [
    { t: 'explain', title: '<b>긴 소리 ー</b>: 가타카나는 긴 소리를 줄표 하나로 써요.', html: '<p>히라가나는 おか<b>あ</b>さん처럼 모음 글자를 덧붙였지만, 가타카나는 어떤 소리든 <b class="jp">ー</b> 하나면 돼요. 가로로 쓸 때는 가로줄, 세로로 쓸 때는 세로줄이에요.</p>' },
    { t: 'pairs', title: '길게 끌면 다른 말이 돼요. 비교해 읽어 보세요.', items: [['ビル', '빌딩', 'ビール', '맥주'], ['セル', '셀', 'セール', '세일'], ['ハト', '비둘기', 'ハート', '하트'], ['カブ', '순무', 'カーブ', '커브']] },
    { t: 'pairs', title: '<b>작은 ッ(촉음)</b>: 한 박자 멈춰요. 비교해 읽어 보세요.', items: [['バター', '버터', 'バッター', '타자'], ['カート', '카트', 'カット', '커트'], ['ヒート', '열', 'ヒット', '안타'], ['ショート', '짧은', 'ショット', '숏']] },
    { t: 'gridN', title: '큰 ツ, 작은 ッ, 긴 소리 ー를 써 보세요.', items: [['ツ'], ['ッ'], ['ー'], ['ッ']], per: 2 },
    { t: 'wordwrite', title: '긴 소리와 촉음이 든 낱말을 써 보세요.', words: ['コーヒー', 'サッカー'] },
  ],
  p2: [
    { t: 'words', items: [['コーヒー', '커피'], ['スーパー', '슈퍼마켓'], ['カード', '카드'], ['コップ', '컵'], ['チケット', '티켓'], ['ロケット', '로켓']] },
    { t: 'conv', title: '히라가나를 가타카나로 바꿔 써 보세요.', items: ['ぷーる', 'すぽーつ', 'ぽけっと', 'くっきー', 'ねっと', 'びーる'].map((h) => [h, h2k(h)]), cls: 'jp' },
    { t: 'choose', title: '바르게 쓴 것에 ○표 하세요.', items: [['케이크', ['ケーキ', 'ケキ', 'ケイキ']], ['축구', ['サッカー', 'サカー', 'サツカー']], ['택시', ['タクシー', 'タクシ', 'タークシ']], ['침대', ['ベッド', 'ベド', 'ベツド']], ['슈퍼마켓', ['スーパー', 'スパー', 'スッパ']]] },
    { t: 'note' },
  ] });
const SP = [['ファ', 'fa'], ['フィ', 'fi'], ['フェ', 'fe'], ['フォ', 'fo'], ['ティ', 'ti'], ['ディ', 'di'], ['ウィ', 'wi'], ['ウェ', 'we'], ['ウォ', 'wo'], ['シェ', 'she'], ['ジェ', 'je'], ['チェ', 'che'], ['デュ', 'dyu'], ['トゥ', 'tu'], ['ヴァ', 'va']];
UNITS.push({ sc: 'k', title: 'ファ ティ ウェ', sub: '가타카나 외래어 특수음', learned: ['ァ', 'ィ', 'ゥ', 'ェ', 'ォ'],
  p1: [
    { t: 'explain', title: '외래어 소리를 원래 발음에 가깝게 적으려고 만든 조합이에요.', html: `<div class="yo jp"><span>フ <em>+</em> <small>ァ</small> <em>=</em> <b>ファ</b><i>fa</i></span><span>テ <em>+</em> <small>ィ</small> <em>=</em> <b>ティ</b><i>ti</i></span><span>ウ <em>+</em> <small>ェ</small> <em>=</em> <b>ウェ</b><i>we</i></span></div><p>큰 글자 뒤에 <b>작은 ァ·ィ·ゥ·ェ·ォ</b>를 붙여 한 박자로 읽어요. 히라가나에는 없는 가타카나만의 표기예요. トゥ와 ヴァ는 드물게 나와요.</p><p class="jp ex">ファイル 파일 · フィルム 필름 · ウェブ 웹 · ディスク 디스크 · ジェット 제트 · ウォーター 워터</p>` },
    { t: 'gridN', items: SP, per: 3, wide: true },
  ],
  p2: [
    { t: 'words', items: [['カフェ', '카페'], ['フォーク', '포크'], ['パーティー', '파티'], ['ソファー', '소파'], ['チェック', '체크'], ['シェフ', '셰프']] },
    { t: 'conv', title: '히라가나를 가타카나로 바꿔 써 보세요.', items: ['ふぁいる', 'ふぃるむ', 'うぇぶ', 'じぇっと', 'でぃすく', 'ふぉんと'].map((h) => [h, h2k(h)]), cls: 'jp' },
    { t: 'choose', title: '바르게 쓴 것에 ○표 하세요.', items: [['파티', ['パーティー', 'パーチー', 'パーテイー']], ['소파', ['ソファー', 'ソフアー', 'ソハー']], ['체크', ['チェック', 'チエック', 'チェク']], ['카페', ['カフェ', 'カフエ', 'カヘ']], ['포크', ['フォーク', 'フオーク', 'ホーク']]] },
    { t: 'note' },
  ] });
UNITS.push({ sc: 'k', title: 'シ ツ ・ ソ ン', sub: '가타카나 헷갈리는 글자 특훈', learned: [],
  p1: [
    { t: 'confuse', title: '닮은 글자를 여기서 끝내요. ●에서 시작해서 ▶ 쪽으로 그어요.', items: [
      ['シツ', 'シ는 옆에서 밀어 올리고, ツ는 위에서 내려요.'], ['ンソ', 'ン은 아래에서 위로, ソ는 위에서 아래로.'],
      ['クケタ', 'ケ는 가로획이 길고, タ는 안에 점이 있어요.'], ['ウワフ', 'ウ에만 꼭지가 있어요. フ는 한 획.'],
      ['コユヨ', 'ユ는 아랫줄이 길고, ヨ는 가로줄이 세 개.'], ['アマム', 'マ는 위가 넓고, ム는 아래가 넓어요.'],
      ['スヌメ', 'ヌ는 ス에 한 획 더, メ는 엑스 모양.'], ['チテナ', 'チ는 위가 비스듬하고, テ는 두 줄이 나란해요.']] },
    { t: 'gridN', items: [['シ'], ['ツ'], ['ン'], ['ソ'], ['ク'], ['ケ']], per: 2 },
  ],
  p2: [
    { t: 'words', items: [['シーツ', '시트'], ['ツナ', '참치'], ['マラソン', '마라톤'], ['ソウル', '서울'], ['クラス', '반·클래스'], ['ワクチン', '백신']] },
    { t: 'conv', title: '가타카나를 읽고 히라가나로 써 보세요.', items: ['ツアー', 'シーソー', 'ソロ', 'リンス', 'スマホ', 'ナイス'].map((k) => [k, k2h(k)]), cls: 'jp' },
    { t: 'pick', title: pickTitle('k'), items: pickItems('k', [['シ', 'ツン'], ['ツ', 'シソ'], ['ソ', 'ンリ'], ['ン', 'ソシ'], ['ク', 'ケタ'], ['ワ', 'ウフ'], ['ユ', 'コヨ'], ['マ', 'アム'], ['ヌ', 'スメ'], ['チ', 'テナ']]) },
    { t: 'gridN', title: '한 번 더 써 보세요.', items: [['ウ'], ['ワ'], ['コ'], ['ユ']], per: 2 },
    { t: 'note' },
  ] });
UNITS.push({ sc: 'k', title: 'カタカナ まとめ', sub: '가타카나 총정리', learned: [],
  p1: [{ t: 'table', sc: 'k', title: '빈칸에 알맞은 가타카나를 채워 오십음도를 완성하세요.' }],
  p2: [
    { t: 'menu', title: '카페 메뉴판이에요. 읽고 무엇인지 우리말로 써 보세요.', items: [['コーヒー', 400, '커피'], ['カフェラテ', 480, '카페라테'], ['ミルクティー', 450, '밀크티'], ['オレンジジュース', 500, '오렌지 주스'], ['サンドイッチ', 600, '샌드위치'], ['チーズケーキ', 550, '치즈케이크'], ['アイスクリーム', 380, '아이스크림'], ['ホットドッグ', 520, '핫도그']] },
    { t: 'conv', title: '나라 이름이에요. 읽고 우리말로 써 보세요.', items: [['カナダ', '캐나다'], ['フランス', '프랑스'], ['ドイツ', '독일'], ['イタリア', '이탈리아'], ['スペイン', '스페인'], ['ブラジル', '브라질']], cls: 'jp' },
    { t: 'explain', title: '내 이름을 가타카나로 써 보세요.', html: '<p>한국 이름은 소리 나는 대로 가타카나로 적어요. 성과 이름 사이에는 가운뎃점(・)을 찍어요.</p><p class="jp ex nm"><span>김민수 → キム・ミンス</span><span>이지은 → イ・ジウン</span><span>박서준 → パク・ソジュン</span><span>최유나 → チェ・ユナ</span></p>' },
    { t: 'blank', rows: 1 },
    { t: 'explain', title: '읽기 도전! 히라가나와 가타카나가 섞인 자기소개예요. 세 번 읽고 □에 표시하세요.', html: '<p class="jp rd">はじめまして。わたしは キム・ミンスです。<br>かんこくの ソウルから きました。<br>コーヒーと ラーメンが すきです。どうぞ よろしく。</p><p class="rk">처음 뵙겠습니다. 김민수입니다. 한국 서울에서 왔습니다. 커피와 라멘을 좋아해요. 잘 부탁해요. <span class="cb">□ □ □</span></p>' },
    { t: 'note' },
  ] });
UNITS.forEach((u, i) => { u.no = (u.sc === 'h' ? 'H' : 'K') + String(u.sc === 'h' ? i + 1 : i + 1 - H_COUNT).padStart(2, '0'); u.idx = i; });

/* ── 섹션 렌더 ── */
const box = (c, cls = '', cap = '') => `<div class="box ${cls}"><span class="jp">${c || ''}</span>${cap ? `<em>${cap}</em>` : ''}</div>`;
const small = (c) => ('っッ'.includes(c) ? `<s>${c}</s>` : c);
function tableHtml(sc, fill, ctx) {
  const col = SCRIPT[sc].col; let n = 0;
  const cell = (c, r, key) => { if (!c) return '<td class="x"></td>'; const show = !fill || (key * 7 + 3) % 3 === 0; if (!show) n++; return `<td><i>${r}</i>${show ? `<span class="jp">${c}</span>` : ''}</td>`; };
  const head = (labs) => `<tr><th></th>${labs.map((l) => `<th>${l}</th>`).join('')}</tr>`;
  const basic = D.BASIC.map((row, ri) => { const cs = [...row[col]], rs = row[2].split(' ');
    const cells = ri === 7 ? [cs[0], null, cs[1], null, cs[2]] : ri === 9 ? [cs[0], null, null, null, cs[1]] : cs; const rr = ri === 7 ? [rs[0], , rs[1], , rs[2]] : ri === 9 ? [rs[0], , , , rs[1]] : rs;
    return `<tr><th class="jp">${sc === 'h' ? D.ROW_NAME[ri] : h2k(D.ROW_NAME[ri])}행</th>${cells.map((c, ci) => cell(c, rr[ci], ri * 5 + ci + ri)).join('')}</tr>`; }).join('') +
    `<tr><th></th>${cell(sc === 'h' ? 'ん' : 'ン', 'n', 0)}<td class="x" colspan="4"></td></tr>`;
  const daku = D.DAKU.map((row, ri) => `<tr><th class="jp">${row[col][0]}행</th>${[...row[col]].map((c, ci) => cell(c, row[2].split(' ')[ci], ri * 5 + ci + ri + 1)).join('')}</tr>`).join('');
  const yoon = D.YOON.filter((_, i) => [0, 1, 2, 4, 6, 8].includes(i)).map(([b, r], ri) => `<tr><th class="jp">${sc === 'h' ? b : h2k(b)}</th>${SMALL.map((s, ci) => cell(sc === 'h' ? b + s : h2k(b + s), r.split(' ')[ci], ri * 3 + ci + 1)).join('')}</tr>`).join('');
  if (ctx) ctx.score += n;
  return `<div class="tbl2"><div><div class="th2">기본 46자</div><table class="kt">${head(['a', 'i', 'u', 'e', 'o'])}${basic}</table></div>
    <div><div class="th2">탁음 · 반탁음</div><table class="kt">${head(['a', 'i', 'u', 'e', 'o'])}${daku}</table><div class="th2" style="margin-top:12px">요음</div><table class="kt y">${head(['ya', 'yu', 'yo'])}${yoon}</table></div></div>`;
}
function renderSec(ctx, s) {
  const u = ctx.u; const sc = u.sc; let title = s.title, body = '', score = 0;
  const ans = (label, list) => ctx.ans.push([label, list]);
  switch (s.t) {
    case 'cards': title = `오늘의 글자예요. ${sc === 'k' ? '히라가나와 짝지어 ' : ''}획순을 보며 소리 내어 읽어 보세요.`;
      body = `<div class="cards n${s.chars.length}">${s.chars.map((x) => `<div class="card"><div class="k jp">${x.c}</div>${steps(x.c, 38)}${sc === 'k' ? `<div class="h jp"><small>ひらがな</small>${x.h}</div>` : ''}<div class="r">${x.r} · ${x.ko}</div></div>`).join('')}</div>`; break;
    case 'minis': title = `${sc === 'k' ? '가타카나' : '히라가나'}에 점을 찍어 만드는 글자예요. 소리 내어 읽어 보세요.`;
      body = `<div class="minis">${s.chars.map((x) => `<div class="mini"><span class="b jp">${x.c}</span><span class="d"><span class="jp">${x.from} + ${x.mark}</span><span class="r">${x.r} · ${x.ko}</span></span></div>`).join('')}</div>`; break;
    case 'tip': return `<div class="tip">※ ${s.html}</div>`;
    case 'grid1': title = '진한 글자를 보고, 연한 글자 위에 따라 쓴 뒤 빈칸에 써 보세요.';
      body = s.chars.map((c) => `<div class="wrow">${box(c, 'm') + box(c, 'g').repeat(3) + box().repeat(7)}</div>` + (s.chars.length <= 3 ? `<div class="wrow">${box(c, 'g') + box().repeat(10)}</div>` : '')).join(''); break;
    case 'gridN': { title = title || '진한 글자를 보고, 연한 글자 위에 따라 쓴 뒤 빈칸에 써 보세요.'; const rows = []; const nb = s.per === 2 ? 3 : 1;
      for (let i = 0; i < s.items.length; i += s.per) rows.push(`<div class="wrow sp${s.wide ? ' wide' : ''}">${s.items.slice(i, i + s.per).map(([c, cap]) => `<div class="grp">${box(small(c), 'm', cap) + box(small(c), 'g') + box().repeat(nb)}</div>`).join('')}</div>`);
      body = rows.join(''); break; }
    case 'explain': body = `<div class="exp">${s.html}</div>`; score = s.score || 0; break;
    case 'pairs': body = `<div class="pairs">${s.items.map(([a, ak, b, bk]) => `<div class="pr"><span class="jp">${a}</span><small>${ak}</small><span class="vs"></span><span class="jp"><b>${b}</b></span><small>${bk}</small></div>`).join('')}</div>`; break;
    case 'confuse': body = `<div class="cf">${s.items.map(([cs, hint]) => `<div class="cfi"><div class="cfc">${[...cs].map((c) => `<span>${dirSvg(c, 46)}<i class="jp">${k2h(c)}</i></span>`).join('')}</div><div class="cfh">${hint}</div></div>`).join('')}</div>`; break;
    case 'words': title = sc === 'k' ? '아는 말이에요. 소리 내어 읽고 뜻을 우리말로 써 보세요. (색 글자 = 오늘 배운 글자)' : '낱말을 소리 내어 읽고 아래 줄에 한 번 따라 써 보세요.';
      body = `<div class="words">${s.items.map(([w, ko], i) => { const hl = sc === 'k' ? [...w].map((c) => (u.learned.includes(c) ? `<b>${c}</b>` : c)).join('') : w;
        return `<div><div class="pic">IMAGE${sc === 'h' ? `<span>${ko}</span>` : ''}</div><div class="wd"><span class="n">(${i + 1})</span><span class="w jp">${sc === 'k' ? `<ruby>${hl}<rt>${k2h(w)}</rt></ruby>` : hl}</span></div><div class="wl"></div></div>`; }).join('')}</div>`;
      score = s.items.length; if (sc === 'k') ans('', s.items.map((x) => x[1])); break;
    case 'conv': body = `<div class="h2k">${s.items.map(([q]) => `<div class="hk"><span class="a ${s.cls}">${q}</span><span class="l"></span></div>`).join('')}</div>`; score = s.items.length; ans('', s.items.map((x) => x[1])); break;
    case 'pick': body = `<div class="pick">${s.items.map((it, i) => { const o = it.opts.slice(); const p = (u.idx + i) % 3; [o[0], o[p]] = [o[p], o[0]]; const str = typeof it.opts[0] === 'string' && it.opts[0].length > 1;
        return `<div class="pk"><div class="q ${sc === 'h' ? 'ro' : 'jp'}">${it.ask}</div><div class="o jp${str ? ' s' : ''}">${o.map((x) => `<span>${x}</span>`).join('')}</div></div>`; }).join('')}</div>`;
      score = s.items.length; ans('', s.items.map((x) => x.ans)); break;
    case 'choose': body = `<div class="chs">${s.items.map(([ko, o], i) => { const q = o.slice(); const p = (u.idx + i) % 3; [q[0], q[p]] = [q[p], q[0]];
        return `<div class="ch"><span class="n">(${i + 1})</span><span class="ko">${ko}</span>${q.map((x) => `<span class="jp op">${x}</span>`).join('')}</div>`; }).join('')}</div>`;
      score = s.items.length; ans('', s.items.map((x) => x[1][0])); break;
    case 'wordwrite': title = title || '위에서 읽은 낱말을 한 글자씩 칸에 써 보세요.';
      body = s.words.map((w) => `<div class="wrow"><div class="box m wm" style="font-size:${[...w].length > 5 ? 11 : 14}pt"><span class="jp">${w}</span></div>${box().repeat(9)}</div>`).join(''); break;
    case 'blank': return `<div class="wrow" style="margin-top:8px">${box().repeat(11)}</div>`.repeat(s.rows);
    case 'table': body = tableHtml(s.sc, true, ctx) + `<div class="tip">※ 막히는 칸은 비워 두고 끝까지 간 다음, 3쪽 오십음도를 보고 채워요. 틀린 글자는 NOTE에 옮겨 적어 두세요.</div>`; break;
    case 'lines2': body = `<div class="ln2">${s.items.map(([j, ko]) => `<div><div class="lj"><span class="jp">${j}</span><small>${ko}</small></div><div class="wl"></div></div>`).join('')}</div>`;
      if (s.ans) ans(s.plain ? ctx.n : '', s.ans); if (s.plain) return `<div style="margin-top:10px">${body}</div>`; break;
    case 'menu': body = `<div class="menu"><div class="mh">BaPi CAFE <span>MENU</span></div><div class="mg">${s.items.map(([w, p], i) => `<div class="mi"><span class="n">(${i + 1})</span><span class="jp">${w}</span><span class="dots"></span><span class="pr">¥${p}</span><span class="l"></span></div>`).join('')}</div></div>`;
      score = s.items.length; ans('', s.items.map((x) => x[2])); break;
    case 'note': return '<div class="note" data-auto="1"><div class="nh"><em>NOTE</em>헷갈린 글자를 적어 두세요.</div></div>';
  }
  ctx.n++; ctx.score += score; if (ctx.ans.length && ctx.ans[ctx.ans.length - 1][0] === '') ctx.ans[ctx.ans.length - 1][0] = ctx.n;
  return `<div class="sec"><span class="n">${ctx.n}</span><span>${title}</span></div>${body}`;
}

/* ── 페이지 ── */
const STAMP = `<svg class="stamp" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17.5" fill="none" stroke="#b9502f" stroke-width="2.2"/><circle cx="20" cy="20" r="14.2" fill="none" stroke="#b9502f" stroke-width="0.7"/><text x="20" y="18.6" text-anchor="middle" font-family="Klee" font-weight="600" font-size="12.5" fill="#b9502f">バ</text><text x="20" y="31" text-anchor="middle" font-family="Klee" font-weight="600" font-size="12.5" fill="#b9502f">ピ</text></svg>`;
const hdr = (lab, num, pg, right) => `<div class="hdr"><div class="u"><span class="lab">${lab}</span><span class="num">${num}</span>${pg ? `<span class="pg">${pg}</span>` : ''}</div><div class="ser">BaPi NIHONGO · VOL. 0 · ${right}</div></div>`;
const pages = []; const ANSWERS = [];
const push = (html) => pages.push(html);
function unitPages(u) {
  const ctx = { u, n: 0, score: 0, ans: [] };
  const b1 = u.p1.map((s) => renderSec(ctx, s)).join(''); const b2 = u.p2.map((s) => renderSec(ctx, s)).join('');
  ANSWERS.push([u, ctx.ans]);
  const nm = SCRIPT[u.sc].name;
  push(`${hdr('UNIT', u.no, '1 / 2', nm)}<div class="ttl"><span class="tj jp">${u.title}</span><span class="tk">${u.sub}</span>${STAMP}</div>
    <div class="log"><span class="g"><span class="lb">DATE</span><i class="y"></i>년 <i></i>월 <i></i>일</span><span class="g"><span class="lb">TIME</span><i></i>:<i></i> ~ <i></i>:<i></i></span></div>
    <div class="log two"><span class="g"><span class="lb">NAME</span><i class="n"></i></span><span class="g"><span class="lb">SCORE</span><i></i>/ ${ctx.score}</span></div>${b1}`);
  push(`${hdr('UNIT', u.no, '2 / 2', nm)}${b2}`);
}
// 1쪽: 목차
const tocCol = (sc, label) => `<div class="tc"><div class="tp"><em>${label}</em><span class="jp">${SCRIPT[sc].jp}</span> ${SCRIPT[sc].name}</div>${UNITS.filter((u) => u.sc === sc).map((u) => `<div class="tr"><span class="cd">${u.no}</span><span class="jp tt">${u.title}</span><span class="ts">${u.sub.replace(/^(히라가나|가타카나) /, '')}</span><span class="pn">${4 + u.idx * 2}</span></div>`).join('')}</div>`;
const lastUnitPage = 3 + UNITS.length * 2;
push(`<div class="toc"><h1>목차</h1><div class="s">VOL. 0 · 문자편 · 히라가나 ${H_COUNT}단원 + 가타카나 ${UNITS.length - H_COUNT}단원</div>
  <div class="tg">${tocCol('h', 'PART 1')}${tocCol('k', 'PART 2')}</div>
  <div class="tx"><span>시작하기 전에 · 오십음도 <b>2</b></span><span>정답 <b>${lastUnitPage + 1}</b></span><span>완주 기록표 <b>${lastUnitPage + 3}</b></span></div></div>`);
// 2쪽: 시작하기 전에
push(`${hdr('GUIDE', '00', '', '시작하기 전에')}<div class="ttl"><span class="tj jp" style="letter-spacing:2px">일본어 글자, 세 가지</span>${STAMP}</div>
  <div class="g3"><div><b class="jp">ひらがな</b><em>히라가나</em><p>가장 기본이 되는 글자. 조사와 어미, 한자로 쓰지 않는 말을 적어요. 46자.</p></div><div><b class="jp">カタカナ</b><em>가타카나</em><p>외래어, 외국 이름, 의성어를 적어요. 소리는 히라가나와 똑같고 모양만 달라요. 46자.</p></div><div><b class="jp">漢字</b><em>한자</em><p>뜻을 가진 말의 몸통을 적어요. 1권부터 읽는 법을 달아 조금씩 익혀요.</p></div></div>
  <div class="mix jp"><span class="kj">私</span><span class="hr">は</span> <span class="kt2">コーヒー</span><span class="hr">を</span> <span class="kj">飲</span><span class="hr">みます。</span><small>나는 커피를 마십니다. &nbsp; <i class="kj">■</i> 한자 &nbsp; <i class="hr">■</i> 히라가나 &nbsp; <i class="kt2">■</i> 가타카나</small></div>
  <div class="sec"><span class="n">1</span><span>이 책은 이렇게 써요.</span></div>
  <ol class="how"><li><b>하루 한 단원, 두 쪽.</b> 왼쪽에서 글자를 익히고 오른쪽에서 문제를 풀어요. 한 단원에 15분쯤 걸려요.</li><li><b>소리 내어 읽으면서 써요.</b> 손과 입이 같이 움직여야 빨리 외워져요.</li><li><b>히라가나를 이미 읽을 수 있다면</b> PART 1은 총정리(H16)만 풀어 보고 PART 2 가타카나부터 시작해도 돼요.</li><li><b>헷갈린 글자는 NOTE에 적어요.</b> 다음 날 시작하기 전에 NOTE만 한 번 훑어보세요.</li></ol>
  <div class="sec"><span class="n">2</span><span>획순 그림 보는 법</span></div>
  <div class="soex"><div class="sob">${steps('あ', 44)}</div><div class="sot"><p><b style="color:#b9502f">색 선</b>이 지금 긋는 획이고 <b style="color:#b9502f">● 점</b>이 붓을 대는 시작점이에요. 검은 선은 이미 쓴 획, 연한 선은 아직 남은 획이에요.</p><p>큰 원칙은 두 가지예요. <b>위에서 아래로, 왼쪽에서 오른쪽으로.</b></p></div></div>
  <div class="sec"><span class="n">3</span><span>획의 끝 모양 세 가지</span></div>
  <div class="g3 end"><div><b class="jp">とめ</b><em>멈춤</em><p>끝에서 딱 멈춰요.<br><span class="jp">예) い의 둘째 획</span></p></div><div><b class="jp">はね</b><em>삐침</em><p>끝에서 살짝 튕겨 올려요.<br><span class="jp">예) い·け의 첫 획</span></p></div><div><b class="jp">はらい</b><em>흘림</em><p>힘을 빼며 가늘게 빼요.<br><span class="jp">예) の의 끝, ア의 둘째 획</span></p></div></div>
  <div class="sec"><span class="n">4</span><span>칸에 쓰는 법</span></div>
  <ol class="how"><li>칸의 점선 십자를 기준으로 글자 중심을 맞춰요. 진한 글자가 본보기, 연한 글자는 그 위에 덧쓰는 글자예요.</li><li>작은 글자(っ ゃ ゅ ょ)는 칸의 <b>왼쪽 아래</b>에 절반 크기로 써요.</li></ol>`);
// 3쪽: 오십음도
const chartCell = (h, k, r) => (h ? `<td><span class="jp">${h}</span><span class="jp k">${k}</span><i>${r}</i></td>` : '<td class="x"></td>');
const chartRows = (rows, basic) => rows.map((row, ri) => { const hs = [...row[0]], ks = [...row[1]], rs = row[2].split(' '); let cells = hs.map((h, i) => [h, ks[i], rs[i]]);
  if (basic && ri === 7) cells = [cells[0], [], cells[1], [], cells[2]]; if (basic && ri === 9) cells = [cells[0], [], [], [], cells[1]];
  return `<tr><th class="jp">${row[0][0]}행</th>${cells.map((c) => chartCell(...c)).join('')}</tr>`; }).join('');
push(`${hdr('GUIDE', '00', '', '오십음도')}<div class="ttl" style="margin-bottom:4px"><span class="tj jp" style="letter-spacing:2px">오십음도</span><span class="tk">왼쪽 히라가나 · 오른쪽 가타카나 · 아래 로마자</span></div>
  <table class="chart"><tr><th></th><th>a 단</th><th>i 단</th><th>u 단</th><th>e 단</th><th>o 단</th></tr>${chartRows(D.BASIC, true)}<tr><th></th>${chartCell('ん', 'ン', 'n')}<td class="x" colspan="4"></td></tr></table>
  <div class="th2" style="margin-top:12px">탁음 · 반탁음</div><table class="chart d">${chartRows(D.DAKU, false)}</table>
  <div class="tip">※ 가로줄은 「행」, 세로줄은 「단」이라고 불러요. あ행은 あ い う え お, あ단은 あ か さ た な…예요. 모르는 글자가 나오면 언제든 이 쪽으로 돌아오세요.</div>`);
UNITS.forEach(unitPages);
// 정답 2쪽
const ansHtml = (list) => list.map(([u, a]) => `<div class="au"><span class="cd">${u.no}</span>${a.map(([n, l]) => `<span class="an"><b>${n}</b> ${l.map((x) => `<span class="jp">${esc(x)}</span>`).join(' · ')}</span>`).join('')}</div>`).join('');
const A_SPLIT = H_COUNT + 6;
push(`${hdr('ANSWER', '정답', '1 / 2', '정답')}<div class="ansn">낱말 따라 쓰기와 칸 쓰기는 정답이 따로 없어요. 검은 네모 숫자는 문제 번호예요. 오십음도 빈칸(H16 · K18)은 3쪽을 보고 확인하세요.</div><div class="ans">${ansHtml(ANSWERS.slice(0, A_SPLIT))}</div>`);
push(`${hdr('ANSWER', '정답', '2 / 2', '정답')}<div class="ans">${ansHtml(ANSWERS.slice(A_SPLIT))}</div>`);
// 완주 기록표
push(`${hdr('RECORD', '완주', '', '기록표')}<div class="ttl"><span class="tj jp" style="letter-spacing:2px">완주 기록표</span><span class="tk">끝낸 단원에 날짜와 점수를 적어요.</span>${STAMP}</div>
  <div class="rec">${['h', 'k'].map((sc) => `<div>${UNITS.filter((u) => u.sc === sc).map((u) => `<div class="rc"><span class="cd">${u.no}</span><span class="jp tt">${u.title}</span><span class="dt"><i></i>월 <i></i>일</span><span class="sc"><i></i>점</span></div>`).join('')}</div>`).join('')}</div>
  <div class="fin"><b>文字、おつかれさまでした。</b><span>글자를 다 익혔어요. 이제 1권에서 첫 문장을 만나요.</span></div>
  <div class="cred">획순 그림: KanjiVG © Ulrich Apel, CC BY-SA 3.0 (kanjivg.tagaini.net)</div>`);

const CSS = `
@font-face { font-family: 'Klee'; src: url('${fu('KleeOne-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'Klee'; src: url('${fu('KleeOne-600.ttf')}'); font-weight: 600; }
@font-face { font-family: 'NSKR'; src: url('${fu('NotoSansKR-400.ttf')}'); font-weight: 400; }
@font-face { font-family: 'NSKR'; src: url('${fu('NotoSansKR-700.ttf')}'); font-weight: 700; }
@font-face { font-family: 'Inter'; src: url('${fu('Inter-900.ttf')}'); font-weight: 900; }
:root { --paper: #f4f0e9; --rule: #d9d2c5; --ac: #b9502f; --ink: #1d1d1b; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'NSKR', 'Klee', sans-serif; font-size: 10.5pt; color: var(--ink); line-height: 1.5; }
.jp { font-family: 'Klee', 'NSKR', serif; } .ro { font-family: 'NSKR', 'Klee', sans-serif; letter-spacing: 0.5px; }
.sheet { width: ${PAGE_W}mm; height: ${PAGE_H}mm; position: relative; overflow: hidden; break-after: page; }
.page { width: ${CW}px; height: ${CH}px; position: absolute; top: ${TOP}mm; transform-origin: top left; transform: scale(${SCALE}); }
.sheet.odd .page { left: ${INNER}mm; } .sheet.even .page { left: ${OUTER}mm; }
.hdr { display: flex; justify-content: space-between; align-items: flex-end; height: 40px; padding-bottom: 7px; border-bottom: 2px solid var(--ink); margin-bottom: 14px; }
.hdr .u { display: flex; align-items: baseline; gap: 7px; font-family: 'Inter', 'NSKR', 'Klee'; font-weight: 900; line-height: 1; }
.hdr .lab { font-size: 8px; letter-spacing: 2.5px; } .hdr .num { font-size: 27px; letter-spacing: -1px; } .hdr .pg { font-size: 9px; letter-spacing: 1px; color: #8a8a8a; margin-left: 4px; }
.hdr .ser { font-family: 'Inter', 'NSKR', 'Klee'; font-weight: 900; font-size: 8px; letter-spacing: 2.5px; color: #8a8a8a; }
.ttl { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; min-height: 42px; } .ttl .tj { font-size: 21pt; font-weight: 600; letter-spacing: 6px; white-space: nowrap; } .ttl .tk { font-size: 10pt; color: #666; }
.stamp { margin-left: auto; width: 42px; height: 42px; align-self: center; transform: rotate(-9deg); flex: none; }
.log { display: flex; align-items: flex-end; justify-content: space-between; background: var(--paper); border-radius: 6px 6px 0 0; padding: 0 12px 8px; height: 42px; font-size: 9pt; color: #555; white-space: nowrap; }
.log .g { display: flex; align-items: flex-end; gap: 5px; } .log .lb { font-family: 'Inter'; font-weight: 900; font-size: 8px; letter-spacing: 1.5px; color: #777; margin-right: 4px; padding-bottom: 2px; }
.log i { display: inline-block; border-bottom: 1.1px solid #555; height: 24px; width: 46px; } .log i.y { width: 62px; } .log i.n { width: 250px; }
.log.two { border-radius: 0 0 6px 6px; margin-bottom: 12px; height: 38px; }
.sec { display: flex; align-items: flex-start; gap: 9px; margin: 14px 0 10px; font-size: 10.5pt; line-height: 19px; }
.sec .n { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 19px; height: 19px; border-radius: 4px; background: var(--ink); color: #fff; font-family: 'Inter'; font-weight: 900; font-size: 9.5pt; }
.cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; } .cards.n3 { grid-template-columns: repeat(3, 1fr); }
.card { background: var(--paper); border-radius: 8px; text-align: center; padding: 6px 0 7px; }
.card .k { font-size: 42pt; font-weight: 600; line-height: 1.12; } .card .h { font-size: 12pt; color: #555; line-height: 1.3; } .card .h small { font-family: 'Inter', 'Klee'; font-weight: 900; font-size: 7px; letter-spacing: 1.5px; color: var(--ac); margin-right: 5px; vertical-align: 2px; }
.card .r { font-size: 8.5pt; color: #888; }
.so { display: flex; flex-wrap: wrap; justify-content: center; align-content: center; gap: 3px; margin: 1px auto 4px; } .cards .so { width: 92px; height: 101px; } .cards.n3 .so { width: auto; height: 52px; } .so span { display: flex; flex-direction: column; align-items: center; background: #fff; border-radius: 4px; padding: 1px 2px 0; } .so svg { display: block; } .so i { font-style: normal; font-family: 'Inter'; font-weight: 900; font-size: 6.5px; color: #aaa; line-height: 9px; }
.minis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px 10px; } .mini { background: var(--paper); border-radius: 7px; display: flex; align-items: center; gap: 7px; padding: 5px 9px; height: 50px; }
.mini .b { font-size: 24pt; font-weight: 600; line-height: 1; } .mini .d { display: flex; flex-direction: column; font-size: 8.5pt; color: #666; line-height: 1.35; } .mini .r { font-size: 8pt; color: #888; white-space: nowrap; }
.tip { font-size: 9pt; color: #555; line-height: 1.6; margin-top: 8px; } .tip b { color: var(--ink); }
.wrow { display: flex; align-items: center; margin-bottom: 7px; } .wrow.sp { justify-content: space-between; } .grp { display: flex; }
.box { width: 53px; height: 53px; flex: none; border: 1px solid #999; border-left: none; position: relative; display: flex; align-items: center; justify-content: center; font-size: 30pt; font-weight: 600; line-height: 1; }
.box:first-child { border-left: 1px solid #999; }
.box::before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; border-left: 1px dashed #d5d0c6; } .box::after { content: ''; position: absolute; top: 50%; left: 0; right: 0; border-top: 1px dashed #d5d0c6; }
.box span { position: relative; z-index: 1; } .box.g span { color: #cfcfcf; } .box.m { background: var(--paper); }
.box s { text-decoration: none; font-size: 0.62em; position: relative; left: -9px; top: 9px; }
.box em { position: absolute; right: 3px; bottom: 2px; z-index: 2; font-style: normal; font-family: 'NSKR', 'Klee', sans-serif; font-size: 6.5pt; font-weight: 700; color: var(--ac); line-height: 1; }
.wrow.sp .box { width: 56px; height: 56px; } .wrow.wide .box { width: 63px; height: 52px; font-size: 21pt; }
.box.wm { width: 106px !important; }
.exp { background: var(--paper); border-radius: 8px; padding: 9px 14px; font-size: 9.5pt; line-height: 1.65; color: #444; } .exp b { color: var(--ink); } .exp .rd { font-size: 14pt; line-height: 1.75; color: var(--ink); } .exp .rk { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 8.5pt; color: #666; margin-top: 2px; } .exp .cb { flex: none; font-size: 13pt; letter-spacing: 3px; color: var(--ink); line-height: 1; } .exp .ex { color: #666; font-size: 10pt; margin-top: 3px; } .exp .nm { display: flex; justify-content: space-between; font-size: 9.5pt; white-space: nowrap; }
.yo { display: flex; justify-content: space-between; font-size: 16pt; margin-bottom: 5px; color: var(--ink); } .yo span { display: flex; align-items: baseline; gap: 6px; } .yo small { font-size: 11pt; } .yo em { font-style: normal; color: #aaa; font-size: 10pt; font-family: 'NSKR', 'Klee', sans-serif; } .yo b { color: var(--ac); font-weight: 600; } .yo i { font-style: normal; font-family: 'NSKR', 'Klee', sans-serif; font-size: 8.5pt; color: #888; }
table.lv { width: 100%; border-collapse: collapse; font-size: 11.5pt; color: var(--ink); } table.lv td { padding: 2px 4px; white-space: nowrap; } table.lv td:nth-child(odd) { font-family: 'NSKR', 'Klee', sans-serif; font-size: 8.5pt; color: #777; width: 62px; } table.lv b { color: var(--ac); font-weight: 600; } table.lv i { font-style: normal; font-family: 'NSKR', 'Klee', sans-serif; font-size: 8pt; color: #888; }
.pairs { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 26px; } .pairs > div { min-width: 0; } .pr { display: flex; align-items: baseline; gap: 6px; border-bottom: 1px solid var(--rule); padding: 3px 2px 5px; font-size: 13pt; white-space: nowrap; } .pr small { font-size: 8pt; color: #777; } .pr .vs { flex: 1; } .pr b { font-weight: 600; } .pr small:last-child { width: 50px; }
.cf { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; } .cfi { background: var(--paper); border-radius: 8px; padding: 5px 10px 4px; } .cfc { display: flex; gap: 14px; } .cfc span { display: flex; flex-direction: column; align-items: center; background: #fff; border-radius: 5px; padding: 2px 3px 0; } .cfc svg { display: block; } .cfc i { font-style: normal; font-size: 8pt; color: #999; line-height: 12px; } .cfh { font-size: 8.5pt; color: #555; margin-top: 2px; }
.words { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px 16px; }
.pic { height: 70px; border: 1.2px dashed #b9b2a6; border-radius: 8px; display: flex; align-items: center; justify-content: center; position: relative; font-family: 'Inter', 'NSKR', 'Klee'; font-weight: 900; font-size: 7.5px; letter-spacing: 2px; color: #b9b2a6; margin-bottom: 4px; }
.pic span { position: absolute; left: 8px; bottom: 5px; font-family: 'NSKR', 'Klee', sans-serif; font-weight: 700; font-size: 8.5pt; letter-spacing: 0; color: #666; }
.wd { display: flex; align-items: flex-end; gap: 6px; height: 34px; } .wd .n { font-size: 9pt; color: #999; padding-bottom: 3px; } .wd .w { font-size: 14.5pt; letter-spacing: 1px; line-height: 1; white-space: nowrap; padding-bottom: 2px; } .wd .w b { color: var(--ac); font-weight: 600; }
.wd ruby rt { font-size: 7pt; color: #777; letter-spacing: 0; font-family: 'Klee'; }
.wl { height: 27px; border-bottom: 1.2px solid #2b2b2b; }
.h2k { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 22px; } .hk { display: flex; align-items: flex-end; gap: 8px; height: 38px; } .hk .a { white-space: nowrap; } .hk .a.jp { font-size: 15pt; } .hk .a.ro { font-size: 11pt; padding-bottom: 3px; color: #333; } .hk .l { flex: 1; border-bottom: 1.2px solid #2b2b2b; height: 100%; min-width: 40px; }
.pick { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; } .pk { text-align: center; border-top: 1px solid var(--rule); padding-top: 5px; } .pk .q { color: #555; height: 26px; } .pk .q.jp { font-size: 15pt; } .pk .q.ro { font-size: 12pt; font-weight: 700; padding-top: 3px; }
.pk .o { display: flex; justify-content: center; gap: 9px; font-size: 17pt; white-space: nowrap; } .pk .o.s { font-size: 11.5pt; gap: 6px; }
.chs { display: grid; grid-template-columns: 1fr; } .ch { display: flex; align-items: baseline; gap: 10px; border-bottom: 1px solid var(--rule); height: 31px; padding-top: 3px; } .ch .n { font-size: 9pt; color: #999; } .ch .ko { width: 86px; font-size: 9.5pt; font-weight: 700; } .ch .op { font-size: 14pt; width: 138px; white-space: nowrap; }
.tbl2 { display: flex; justify-content: space-between; } .th2 { font-family: 'Inter', 'NSKR', 'Klee'; font-weight: 900; font-size: 8.5px; letter-spacing: 1.5px; color: var(--ac); margin-bottom: 4px; }
table.kt { border-collapse: collapse; } table.kt th { font-family: 'NSKR', 'Klee', sans-serif; font-weight: 400; font-size: 7.5pt; color: #999; width: 32px; height: 16px; text-align: center; } table.kt th.jp { font-family: 'Klee', 'NSKR'; font-size: 9pt; color: #777; }
table.kt td { width: 50px; height: 44px; border: 1px solid #aaa; position: relative; text-align: center; font-size: 20pt; line-height: 42px; } table.kt.y td { width: 83px; } table.kt td.x { border: none; background: none; }
table.kt td i { position: absolute; left: 3px; top: 2px; font-style: normal; font-family: 'NSKR', 'Klee', sans-serif; font-size: 6.5pt; color: #999; line-height: 1; } table.kt td span { color: #555; }
.ln2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; } .lj { display: flex; align-items: baseline; gap: 8px; white-space: nowrap; height: 26px; } .lj .jp { font-size: 13.5pt; } .lj small { font-size: 8.5pt; color: #777; }
.menu { border: 1.4px solid var(--ink); border-radius: 8px; padding: 10px 16px 12px; } .mh { font-family: 'Inter'; font-weight: 900; font-size: 11px; letter-spacing: 2px; border-bottom: 1px solid var(--ink); padding-bottom: 5px; margin-bottom: 4px; } .mh span { color: var(--ac); margin-left: 6px; }
.mg { display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; } .mi { min-width: 0; display: flex; align-items: flex-end; gap: 6px; height: 34px; white-space: nowrap; } .mi .n { font-size: 8.5pt; color: #999; padding-bottom: 2px; } .mi .jp { font-size: 12pt; } .mi .dots { flex: 1; border-bottom: 1px dotted #aaa; margin-bottom: 5px; min-width: 2px; } .mi .pr { font-size: 8.5pt; color: #777; padding-bottom: 2px; } .mi .l { width: 62px; flex: none; border-bottom: 1.2px solid #2b2b2b; height: 100%; }
.note { margin-top: 12px; } .note .nh { font-size: 9pt; font-weight: 700; margin-bottom: 2px; } .note .nh em { font-style: normal; font-family: 'Inter'; font-weight: 900; font-size: 7.5px; letter-spacing: 2px; color: var(--ac); margin-right: 8px; } .note .nl { height: 34px; border-bottom: 1px solid var(--rule); }
.foot { position: absolute; left: 0; right: 0; bottom: -2px; display: flex; justify-content: ${MODE === 'screen' ? 'space-between' : 'center'}; gap: 10px; align-items: baseline; font-family: 'Inter'; font-weight: 900; font-size: 10px; color: #8a8a8a; } .foot span:last-child { font-size: 7px; font-weight: 400; font-family: 'NSKR', sans-serif; }
.toc { padding-top: 46px; } .toc h1 { font-size: 22pt; font-weight: 700; letter-spacing: 8px; text-align: center; } .toc .s { text-align: center; font-family: 'Inter', 'NSKR', 'Klee'; font-weight: 900; font-size: 8.5px; letter-spacing: 2px; color: #8a8a8a; margin: 8px 0 34px; }
.tg { display: grid; grid-template-columns: 1fr 1fr; gap: 0 30px; } .tp { background: var(--paper); border-radius: 4px; padding: 5px 10px; font-size: 10pt; font-weight: 700; margin-bottom: 8px; } .tp em { font-style: normal; font-family: 'Inter'; font-weight: 900; font-size: 8px; letter-spacing: 2px; color: var(--ac); margin-right: 10px; } .tp .jp { font-weight: 600; margin-right: 4px; }
.tr { display: flex; align-items: baseline; gap: 8px; height: 31px; border-bottom: 1px solid var(--rule); white-space: nowrap; padding: 0 4px; } .cd { font-family: 'Inter'; font-weight: 900; font-size: 8.5pt; color: var(--ac); width: 30px; flex: none; } .tr .tt { font-size: 11.5pt; flex: none; } .tr .ts { font-size: 8pt; color: #888; flex: 1; overflow: hidden; text-overflow: clip; } .tr .pn { font-family: 'Inter'; font-weight: 900; font-size: 8pt; color: #8a8a8a; }
.tx { display: flex; justify-content: center; gap: 34px; margin-top: 30px; font-size: 9.5pt; color: #555; } .tx b { font-family: 'Inter'; font-weight: 900; font-size: 8.5pt; color: var(--ac); margin-left: 6px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; } .g3 > div { background: var(--paper); border-radius: 8px; padding: 8px 12px; } .g3 b { font-size: 17pt; font-weight: 600; display: block; line-height: 1.2; } .g3 em { font-style: normal; font-family: 'NSKR', 'Klee', sans-serif; font-weight: 700; font-size: 8.5pt; color: var(--ac); } .g3 p { font-size: 8.5pt; color: #555; line-height: 1.55; margin-top: 3px; } .g3.end b { font-size: 14pt; }
.mix { text-align: center; font-size: 19pt; margin: 9px 0 0; } .mix small { display: block; font-family: 'NSKR', 'Klee', sans-serif; font-size: 8.5pt; color: #666; margin-top: 2px; } .mix i { font-style: normal; font-size: 8pt; } .kj { color: var(--ink); } .hr { color: #8a8478; } .kt2 { color: var(--ac); }
.how { margin-left: 30px; font-size: 9.5pt; color: #444; line-height: 1.6; } .how b { color: var(--ink); }
.soex { display: flex; gap: 16px; align-items: center; } .sob { background: var(--paper); border-radius: 8px; padding: 8px 10px 4px; } .sot { font-size: 9.5pt; color: #444; line-height: 1.7; }
table.chart { width: 100%; border-collapse: collapse; } table.chart th { font-family: 'NSKR', 'Klee', sans-serif; font-weight: 400; font-size: 8pt; color: #999; height: 18px; width: 40px; } table.chart th.jp { font-family: 'Klee', 'NSKR'; font-size: 9.5pt; color: #777; }
table.chart td { border: 1px solid #bbb; height: 41px; text-align: center; font-size: 18pt; line-height: 1; position: relative; padding-bottom: 8px; } table.chart td .k { color: var(--ac); margin-left: 9px; } table.chart td i { position: absolute; left: 0; right: 0; bottom: 2px; font-style: normal; font-family: 'NSKR', 'Klee', sans-serif; font-size: 6.5pt; color: #999; } table.chart td.x { border: none; } table.chart.d td { height: 38px; font-size: 16pt; }
.ansn { font-size: 8.5pt; color: #666; margin-bottom: 8px; } .ans { font-size: 8pt; line-height: 1.5; } .au { display: flex; flex-wrap: wrap; gap: 0 10px; border-bottom: 1px solid var(--rule); padding: 4px 0; } .au .cd { font-size: 8pt; width: 26px; } .an { color: #333; } .an b { font-family: 'Inter'; font-weight: 900; font-size: 7pt; color: #fff; background: var(--ink); border-radius: 3px; padding: 0 3px; margin-right: 3px; } .an .jp { font-size: 9pt; }
.rec { display: grid; grid-template-columns: 1fr 1fr; gap: 0 28px; align-items: start; } .rc { display: flex; align-items: baseline; gap: 8px; height: 33px; border-bottom: 1px solid var(--rule); white-space: nowrap; padding: 0 2px; font-size: 8.5pt; color: #666; } .rc .tt { font-size: 10.5pt; color: var(--ink); flex: 1; overflow: hidden; } .rc i { display: inline-block; width: 22px; border-bottom: 1px solid #777; height: 18px; margin: 0 2px; }
.fin { text-align: center; margin-top: 24px; } .fin b { font-family: 'Klee'; font-weight: 600; font-size: 14pt; display: block; } .fin span { font-size: 9pt; color: #666; }
.cred { position: absolute; left: 0; right: 0; bottom: 22px; text-align: center; font-size: 7pt; color: #999; }
.cv { position: absolute; inset: 0; background: #d9d6d0; } .cv .t { position: absolute; font-family: 'Inter', 'Klee'; font-weight: 900; font-size: 11px; letter-spacing: 3.5px; color: var(--ink); } .cv .im { position: absolute; left: 21%; right: 21%; top: 30%; height: 34%; border: 1.4px dashed #8f8a80; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-family: 'Inter'; font-weight: 900; font-size: 9px; letter-spacing: 3px; color: #8f8a80; } .cv .rl { position: absolute; left: 48px; right: 48px; bottom: 86px; height: 1px; background: var(--ink); opacity: 0.35; }
`;
const sheet = (html, i) => `<div class="sheet ${(i + 1) % 2 ? 'odd' : 'even'}"><div class="page">${html}<div class="foot"><span>BaPi</span><span>${i + 1}</span></div></div></div>`;
const COVER = `<div class="sheet"><div class="cv"><div class="t" style="left:48px;top:44px">BaPi — NIHONGO WORKSHEET</div><div class="im">COVER IMAGE</div><div class="rl"></div><div class="t" style="left:48px;bottom:40px;line-height:1.9">VOL. 0<br><span style="font-family:Klee;font-weight:600;letter-spacing:2px">ひらがな · カタカナ</span></div><div class="t" style="right:48px;bottom:40px">2026</div></div></div>`;

(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  const body = (MODE === 'screen' ? COVER : '') + pages.map(sheet).join('');
  // about:blank(setContent)에서는 file:// 글꼴이 막혀 시스템 글꼴로 대체되므로, 임시 HTML 파일을 열어서 Klee·Noto가 실제로 실리게 함
  const tmp = path.join(OUT, '.kana_build.html');
  fs.writeFileSync(tmp, `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`);
  pg.on('requestfailed', (r) => console.log('FAILED', r.url().slice(-50)));
  await pg.goto('file://' + tmp, { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts.ready);
  const bad = await pg.evaluate(() => [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family));
  if (bad.length) console.log('FONT ERROR', bad);
  if (process.env.WS_STATS) console.log(await pg.evaluate(() => [...document.fonts].map((f) => f.family + ' ' + f.weight + ':' + f.status).join(' | ')));
  await pg.evaluate(() => document.querySelectorAll('svg.dir path').forEach((p) => {
    const L = p.getTotalLength(); const a = p.getPointAtLength(L), b = p.getPointAtLength(Math.max(0, L - 6));
    const t = Math.atan2(a.y - b.y, a.x - b.x), w = 9, h = 15; const c = Math.cos(t), sn = Math.sin(t);
    const pt = (dx, dy) => `${(a.x + dx * c - dy * sn).toFixed(1)},${(a.y + dx * sn + dy * c).toFixed(1)}`;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    g.setAttribute('points', [pt(h * 0.55, 0), pt(-h * 0.45, -w), pt(-h * 0.45, w)].join(' ')); g.setAttribute('fill', '#b9502f');
    p.ownerSVGElement.appendChild(g);
  }));
  const report = await pg.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => {
    const f = p.querySelector('.foot'); const bottomOf = () => Math.max(0, ...[...p.children].filter((c) => c !== f && !c.classList.contains('cred')).map((c) => c.offsetTop + c.offsetHeight));
    const note = p.querySelector('.note[data-auto]');
    if (note) { const n = Math.floor((856 - bottomOf() - 4) / 34); if (n < 1) note.remove(); else note.insertAdjacentHTML('beforeend', '<div class="nl"></div>'.repeat(Math.min(n, 9))); }
    return [i + 1, bottomOf()];
  }));
  const over = report.filter(([, h]) => h > 858);
  if (process.env.WS_STATS) console.log(report.map(([i, h]) => `${i}:${h}`).join(' '));
  console.log(over.length ? 'OVERFLOW ' + JSON.stringify(over) : 'no overflow', '| pages', pages.length);
  const name = MODE === 'screen' ? '일본어학습지_0권.pdf' : '일본어학습지_0권_wireless_내지.pdf';
  const f = path.join(OUT, name);
  await pg.pdf({ path: f, width: PAGE_W + 'mm', height: PAGE_H + 'mm', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await b.close();
  if (MODE !== 'screen') cp.execFileSync('python3', [path.join(ROOT, 'exact-size.py'), f, String(PAGE_W), String(PAGE_H)]);
  console.log('done', f);
})();
