/* 0권(문자편) 웹용 데이터 생성 — 인쇄용과 같은 단원 정의(units.js)를 웹 학습지 문제 형식으로 바꿔 ../../data0.js 로 저장
   node worksheet/print/kana/gen-web.js */
const fs = require('fs'); const path = require('path');
const { D, UNITS, SCRIPT, k2h } = require('./units.js');
const STROKES = JSON.parse(fs.readFileSync(path.join(__dirname, 'strokes.json'), 'utf8'));
const isKo = (s) => /[가-힣]/.test(s);
const rot = (arr, p) => { const o = arr.slice(); [o[0], o[p % o.length]] = [o[p % o.length], o[0]]; return o; };
const even = (list, n) => (list.length <= n ? list : Array.from({ length: n }, (_, i) => list[Math.floor(i * list.length / n)]));
const meaningChoice = (list, u) => list.map(([w, ko], i) => ({ type: 'choice', q: w, ko: '이 낱말의 뜻은?', opts: rot([ko, list[(i + 1) % list.length][1], list[(i + 2) % list.length][1]], u.idx + i), a: ko, say: w,
  note: /[ァ-ヶ]/.test(w) && !/[ぁ-ん]/.test(w) ? `읽기: ${k2h(w)}` : undefined }));

const out = UNITS.map((u) => {
  const w = { id: 1001 + u.idx, no: u.no, vol: 0, sc: u.sc, level: u.sc === 'h' ? 'kana-h' : 'kana-k', title: u.title, sub: u.sub, cards: [], cardStyle: 'big', rules: [], items: [] };
  const words = {}; const hasCards = [...u.p1, ...u.p2].some((s) => s.t === 'cards' || s.t === 'minis' || (s.t === 'gridN' && s.wide));
  [...u.p1, ...u.p2].forEach((s) => { if (s.t === 'words') s.items.forEach(([jp, ko]) => { words[jp] = ko; }); });
  const trace = (jp, ko) => w.items.push({ type: 'trace', jp, ko, strict: true, pad: true });
  [...u.p1, ...u.p2].forEach((s) => {
    switch (s.t) {
      case 'cards': w.cards = s.chars.map((x) => ({ c: x.c, h: u.sc === 'k' ? x.h : undefined, r: x.r, ko: x.ko, s: 1 }));
        s.chars.forEach((x) => trace(x.c, `${x.r} · ${x.ko}`)); break;
      case 'minis': w.cardStyle = 'mini'; w.cards = s.chars.map((x) => ({ c: x.c, r: x.r, ko: x.ko, from: `${x.from} + ${x.mark}` }));
        even(s.chars, 5).forEach((x) => trace(x.c, `${x.r} · ${x.ko}`)); break;
      case 'gridN': if (s.wide) { w.cardStyle = 'mini'; w.cards = s.items.map(([c, r]) => ({ c, r })); even(s.items, 4).forEach(([c, r]) => trace(c, r)); } break;
      case 'tip': w.tip = s.html.replace(' 글자가 적은 날이라 두 줄씩 넉넉히 써 봐요.', ''); break;
      case 'explain': { // 종이 전용 지시(○표, □ 표시)는 웹에 맞게 바꿈
        const title = s.title.replace(' 조사에 ○표 하고 소리 내어 읽어 보세요.', '').replace(/세 번 읽고 □에 표시하세요\./, '세 번 소리 내어 읽어 보세요.').replace(/막힘없이 읽힐 때까지 /, '');
        const rd = s.html.match(/<p class="jp rd">(.*?)<\/p>/);
        w.rules.push({ head: title, html: s.html, say: rd ? rd[1].replace(/<br>/g, '').replace(/ /g, '') : undefined }); break; }
      case 'pairs': w.rules.push({ head: s.title }); s.items.forEach(([a, ak, b, bk]) => w.rules.push([`${a}　${b}`, `${ak} · ${bk}`])); break;
      case 'confuse': w.rules.push({ head: '닮은 글자를 여기서 끝내요. 차이를 소리 내어 읽어 보세요.' }); s.items.forEach(([cs, hint]) => w.rules.push([[...cs].join('　'), hint])); break;
      case 'table': w.chart = s.sc; break;
      case 'words': w.items.push(...meaningChoice(s.items, u)); break;
      case 'menu': w.items.push(...meaningChoice(s.items.map(([jp, , ko]) => [jp, ko]), u)); break;
      case 'conv': {
        if (isKo(s.items[0][1])) { w.items.push(...meaningChoice(s.items, u)); break; }
        const inst = /가타카나로/.test(s.title) ? '가타카나로 쓰세요' : '히라가나로 쓰세요';
        (hasCards ? s.items.slice(0, 4) : s.items).forEach(([q, a]) => w.items.push({ type: 'transform', q, inst, a: [a], strict: true })); break; }
      case 'pick': s.items.forEach((it, i) => w.items.push({ type: 'choice', q: it.ask, ko: '같은 소리의 글자를 고르세요', opts: rot(it.opts, u.idx + i), a: it.ans })); break;
      case 'choose': s.items.forEach(([ko, o], i) => w.items.push({ type: 'choice', q: ko, ko: '바르게 쓴 것을 고르세요', opts: rot(o, u.idx + i), a: o[0] })); break;
      case 'wordwrite': if (!hasCards) s.words.forEach((x) => trace(x, words[x] || '')); break;
      case 'lines2':
        if (s.ans) s.items.forEach(([jp, ko], i) => { const [head, ...rest] = jp.split(' '); const p = s.ans[i]; const alt = { は: 'わ', へ: 'え', を: 'お' }[p];
          w.items.push({ type: 'choice', q: `${head.slice(0, -1)}＿ ${rest.join(' ')}`, ko, opts: rot([p, alt], i), a: p, note: `조사 ${p}는 「${alt}」로 읽어요.` }); });
        else s.items.forEach(([jp, ko]) => trace(jp, ko)); break;
    }
  });
  if (!w.rules.length) delete w.rules; if (!w.cards.length) delete w.cards;
  return w;
});
const strokes = {}; Object.keys(STROKES).forEach((c) => { strokes[c] = STROKES[c].d; });
const chart = { basic: D.BASIC.map((r) => [r[0], r[1], r[2]]), daku: D.DAKU.map((r) => [r[0], r[1], r[2]]) };
const js = `/* 0권(문자편) 웹 데이터 — worksheet/print/kana/gen-web.js 가 만든 파일. 직접 고치지 말고 kana/data.js · units.js 를 고친 뒤 다시 생성.
   획순 데이터: KanjiVG © Ulrich Apel, CC BY-SA 3.0 */
const WS_KANA = ${JSON.stringify(out)};
const WS_KANA_PARTS = ${JSON.stringify([{ id: 'kana-h', name: `PART 1 · ${SCRIPT.h.jp} 히라가나`, desc: '기본 46자 · 탁음 · 요음 · 촉음' }, { id: 'kana-k', name: `PART 2 · ${SCRIPT.k.jp} 가타카나`, desc: '기본 46자 · 외래어 표기 · 닮은 글자' }])};
const WS_KANA_CHART = ${JSON.stringify(chart)};
const WS_STROKES = ${JSON.stringify(strokes)};
`;
const f = path.join(__dirname, '..', '..', 'data0.js'); fs.writeFileSync(f, js);
console.log('done', f, Math.round(js.length / 1024) + 'KB', '| units', out.length, '| items', out.map((x) => x.items.length).join(' '));
