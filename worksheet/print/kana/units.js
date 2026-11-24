/* 0권(문자편) 단원 정의 — 인쇄용 build.js 와 웹용 gen-web.js 가 같이 씀 */
const D = require('./data.js');

/* ── 가나 도구 ── */
const k2h = (s) => [...s].map((c) => { const o = c.charCodeAt(0); return o >= 0x30a1 && o <= 0x30f6 ? String.fromCharCode(o - 0x60) : c; }).join('');
const h2k = (s) => [...s].map((c) => { const o = c.charCodeAt(0); return o >= 0x3041 && o <= 0x3096 ? String.fromCharCode(o + 0x60) : c; }).join('');
const RO = {}; const KO = {};
[...D.BASIC, ...D.DAKU].forEach(([h, , r, k]) => { const rs = r.split(' '), ks = k.split(' '); [...h].forEach((c, i) => { RO[c] = rs[i]; KO[c] = ks[i]; }); });
const SMALL = ['ゃ', 'ゅ', 'ょ'];
D.YOON.forEach(([b, r, k]) => { const rs = r.split(' '), ks = k.split(' '); SMALL.forEach((s, i) => { RO[b + s] = rs[i]; KO[b + s] = ks[i]; }); });
const roma = (s) => { const cs = [...s], out = []; for (let i = 0; i < cs.length; i++) { const two = cs[i] + (cs[i + 1] || ''); if (RO[two]) { out.push(RO[two]); i++; } else out.push(RO[cs[i]] || cs[i]); } return out.join('·'); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

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

module.exports = { D, UNITS, H_COUNT, SCRIPT, SMALL, RO, KO, k2h, h2k, roma };
