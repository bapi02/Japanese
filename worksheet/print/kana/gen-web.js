/* 0권(문자편) 웹용 데이터 생성 — 인쇄용과 같은 단원 정의(units.js)에서 글자·낱말·비교 쌍을 뽑아
   웹 전용 4단계(배우기 → 고르기 → 낱말 조립 → 타임어택) 데이터로 바꿔 ../../data0.js 로 저장.
   웹은 타이핑 없이 탭으로만 풀고, 뜻은 반드시 먼저 보여 준 뒤에 묻는다.
   node worksheet/print/kana/gen-web.js */
const fs = require('fs'); const path = require('path');
const { D, UNITS, SCRIPT, RO, KO, k2h, roma } = require('./units.js');
const STROKES = JSON.parse(fs.readFileSync(path.join(__dirname, 'strokes.json'), 'utf8'));
const romaOf = (c) => RO[k2h(c)];                                   // 가나 한 글자(또는 요음)의 로마자
const even = (list, n, off = 0) => (list.length <= n ? list.slice() : Array.from({ length: n }, (_, i) => list[(Math.floor(i * list.length / n) + off) % list.length]));
const uniq = (a) => [...new Set(a)];
const near = (list, x) => { const i = list.indexOf(x); return list.map((y, j) => [y, Math.abs(j - i)]).filter(([y]) => y !== x).sort((a, b) => a[1] - b[1]).map(([y]) => y); };  // 가까운 글자부터 (같은 행이 먼저 오답 보기로)
const romaWord = (jp) => { const t = roma(jp).split('·'); return jp.includes('っ') ? t.map((x, i) => (x === 'っ' ? (t[i + 1] || '')[0] || '' : x)).join('') : t.join(' '); };
const INS = { snd: '소리에 맞는 글자를 고르세요.', hread: '이 글자의 소리는?', khira: '같은 소리의 히라가나는?', kkata: '같은 소리의 가타카나는?', spell: '소리와 뜻에 맞게 쓴 것을 고르세요.', part: '빈칸에 들어갈 조사는?', guess: '소리 내어 읽어 보세요. 무엇일까요?' };

const POOL = { h: [], k: [] }; const EXTRA = { h: new Set(['っ']), k: new Set(['ー']) };      // 타임어택·오답 보기용: 배운 순서대로 [글자, 보기 글]
const out = UNITS.map((u) => {
  const sc = u.sc; const all = [...u.p1, ...u.p2]; const sec = (t) => all.filter((s) => s.t === t);
  const w = { id: 1001 + u.idx, no: u.no, vol: 0, sc, level: sc === 'h' ? 'kana-h' : 'kana-k', title: u.title, sub: u.sub };
  const seen = POOL[sc];
  const text = (c) => (sc === 'h' ? (KO[c] ? `${KO[c]} · ${RO[c]}` : RO[c]) : k2h(c));        // 히라가나 → 「아 · a」, 가타카나 → 히라가나
  const snd = (x) => (x.ko ? `${x.ko} · ${x.r}` : x.r);

  /* ── 배우기: 글자 카드 + 설명 ── */
  let cards = [];
  sec('cards').forEach((s) => { w.cardStyle = 'big'; cards = s.chars.map((x) => ({ c: x.c, h: sc === 'k' ? x.h : undefined, r: x.r, ko: x.ko, s: 1 })); });
  sec('minis').forEach((s) => { w.cardStyle = 'mini'; cards = s.chars.map((x) => ({ c: x.c, r: x.r, ko: x.ko, from: `${x.from} + ${x.mark}` })); });
  sec('gridN').filter((s) => s.wide).forEach((s) => { w.cardStyle = 'mini'; cards = s.items.map(([c, r]) => ({ c, r, ko: KO[k2h(c)] })); });
  if (cards.length) w.cards = cards;
  sec('tip').forEach((s) => { w.tip = s.html.replace(' 글자가 적은 날이라 두 줄씩 넉넉히 써 봐요.', '').replace(/ 탁점은 맨 마지막에 찍어요\./, ''); });
  const rules = [];
  all.forEach((s) => {
    if (s.t === 'pairs') { rules.push({ head: s.title }); s.items.forEach(([a, ak, b, bk]) => rules.push([`${a}　${b}`, `${ak} · ${bk}`])); }
    if (s.t === 'confuse') { rules.push({ head: '닮은 글자를 여기서 끝내요. 차이를 소리 내어 읽어 보세요.' }); s.items.forEach(([cs, hint]) => rules.push([[...cs].join('　'), hint])); }
    if (s.t === 'explain' && !/내 이름을/.test(s.title)) {
      const title = s.title.replace(' 조사에 ○표 하고 소리 내어 읽어 보세요.', '').replace(/세 번 읽고 □에 표시하세요\./, '세 번 소리 내어 읽어 보세요.').replace(/막힘없이 읽힐 때까지 /, '');
      const rd = s.html.match(/<p class="jp rd">(.*?)<\/p>/);
      rules.push({ head: title, html: s.html.replace(/작은 글자는 칸의 왼쪽 아래에 절반 크기로 써요\. ?/, ''), say: rd ? rd[1].replace(/<br>/g, '').replace(/ /g, '') : undefined });
    }
  });
  if (rules.length) w.rules = rules;
  if (sec('table').length) w.chart = sc;

  /* ── 고르기 ── */
  const conf = {}; sec('pick').forEach((s) => s.items.forEach((it) => { conf[it.ans] = it.opts.slice(1); }));
  const kanaWrong = (x, mates) => { const o = []; const add = (c) => { if (c !== x.c && !o.includes(c) && romaOf(c) !== x.r) o.push(c); };
    (conf[x.c] || []).forEach(add); near(mates, x).forEach((y) => add(y.c)); seen.slice().reverse().forEach(([c]) => { if ([...c].length === [...x.c].length) add(c); }); return o.slice(0, 3); };
  const letterQuiz = (list, nA, nB, full) => {
    const q = []; full = full || list;
    even(list, nA).forEach((x) => q.push({ ins: INS.snd, p: snd(x), pk: 'snd', say: x.c, opts: [x.c, ...kanaWrong(x, full)] }));
    even(list, nB, 1).forEach((x) => {
      if (sc === 'h') q.push({ ins: INS.hread, p: x.c, pk: 'kana', after: x.c, opts: uniq([snd(x), ...near(full, x).filter((y) => y.r !== x.r).map(snd), ...seen.map(([, t]) => t).reverse()]).slice(0, 4) });
      else q.push({ ins: INS.khira, p: x.c, pk: 'kana', after: x.c, opts: uniq([k2h(x.c), ...kanaWrong(x, full).map((c) => k2h(c))]).slice(0, 4) });
    });
    return q;
  };
  let quiz = [];
  if (cards.length) quiz = cards.length <= 5 ? letterQuiz(cards, 5, 5) : letterQuiz(cards, 6, 6);
  /* 배운 글자를 풀에 넣는다 (이 단원 글자가 뒤 단원의 오답 보기·타임어택에 쓰임) */
  cards.forEach((x) => { if (!seen.some(([c]) => c === x.c)) seen.push([x.c, text(x.c) || x.r]); });
  w.own = cards.map((x) => x.c); w.pool = seen.length;
  if (!cards.length) {  // 특별 단원
    const basic = seen.filter(([c]) => [...c].length === 1).map(([c]) => ({ c, r: romaOf(c), ko: KO[k2h(c)] }));
    if (w.chart) quiz = letterQuiz(even(basic, 12, 3), 6, 6, basic);
    let pi = 0;
    sec('pairs').forEach((s) => s.items.forEach(([a, ak, b, bk]) => { const useB = pi++ % 2 === 0; quiz.push({ ins: INS.spell, p: useB ? bk : ak, pk: 'ko', say: useB ? b : a, opts: useB ? [b, a] : [a, b] }); }));
    sec('pick').forEach((s) => s.items.forEach((it) => quiz.push({ ins: sc === 'h' ? INS.snd : INS.kkata, p: it.ask, pk: 'kana', after: it.ans, opts: it.opts.slice() })));
    sec('lines2').filter((s) => s.ans).forEach((s) => s.items.forEach(([jp, ko], i) => { const [head, ...rest] = jp.split(' '); const p = s.ans[i]; const alt = { は: 'わ', へ: 'え', を: 'お' }[p];
      quiz.push({ ins: INS.part, p: `${head.slice(0, -1)}＿ ${rest.join(' ')}`, sub: ko, pk: 'sent', after: jp.replace(/ /g, ''), opts: [p, alt] }); }));
    sec('conv').filter((s) => /[가-힣]/.test(s.items[0][1])).forEach((s) => s.items.slice(0, 4).forEach(([jp, ko], i) => quiz.push({ ins: INS.guess, p: jp, pk: 'word', after: jp, opts: [ko, s.items[(i + 1) % 6][1], s.items[(i + 2) % 6][1], s.items[(i + 3) % 6][1]] })));
  }
  sec('choose').forEach((s) => s.items.slice(0, cards.length ? 3 : 5).forEach(([ko, o]) => quiz.push({ ins: INS.spell, p: ko, pk: 'ko', say: o[0], opts: o.slice() })));
  quiz.forEach((q) => { if (q.opts.length < 2 || new Set(q.opts).size !== q.opts.length) throw new Error(`${u.no} bad options: ${JSON.stringify(q)}`); });
  w.quiz = quiz;

  /* ── 낱말 조립: 뜻과 소리를 먼저 보여 주고 글자 타일로 완성. 아직 안 배운 글자는 미리 채워 둠 ── */
  u.learned.forEach((c) => EXTRA[sc].add(c));
  const known = new Set([...seen.flatMap(([c]) => [...c]), ...EXTRA[sc]]);
  let src = sec('words').flatMap((s) => s.items);
  if (!src.length) src = sec('lines2').filter((s) => !s.ans).flatMap((s) => [1, 2, 4, 5].map((i) => s.items[i])).concat(sec('menu').flatMap((s) => [0, 1, 4, 6].map((i) => [s.items[i][0], s.items[i][2]])));
  const words = src.map(([jp, ko]) => { const fill = [...jp].map((c) => (known.has(c) ? 1 : 0));
    return { jp, ko, read: sc === 'k' ? k2h(jp) : (/[はへ]$/.test(jp) || jp.length > 6 ? undefined : romaWord(jp)), fill }; })
    .map((x, i) => ({ x, i, n: x.fill.reduce((a, b) => a + b, 0) })).filter((y) => y.n > 0).sort((a, b) => (b.n >= 2) - (a.n >= 2) || a.i - b.i).slice(0, 4).sort((a, b) => a.i - b.i).map((y) => y.x);
  if (words.length < 3) throw new Error(`${u.no}: 낱말이 부족해요 (${words.length})`);
  w.words = words;
  return w;
});
const strokes = {}; Object.keys(STROKES).forEach((c) => { strokes[c] = STROKES[c].d; });
const chart = { basic: D.BASIC.map((r) => [r[0], r[1], r[2]]), daku: D.DAKU.map((r) => [r[0], r[1], r[2]]) };
const js = `/* 0권(문자편) 웹 데이터 — worksheet/print/kana/gen-web.js 가 만든 파일. 직접 고치지 말고 kana/data.js · units.js 를 고친 뒤 다시 생성.
   획순 데이터: KanjiVG © Ulrich Apel, CC BY-SA 3.0 */
const WS_KANA = ${JSON.stringify(out)};
const WS_KANA_PARTS = ${JSON.stringify([{ id: 'kana-h', name: `PART 1 · ${SCRIPT.h.jp} 히라가나`, desc: '기본 46자 · 탁음 · 요음 · 촉음' }, { id: 'kana-k', name: `PART 2 · ${SCRIPT.k.jp} 가타카나`, desc: '기본 46자 · 외래어 표기 · 닮은 글자' }])};
const WS_KANA_POOL = ${JSON.stringify(POOL)};
const WS_KANA_CHART = ${JSON.stringify(chart)};
const WS_STROKES = ${JSON.stringify(strokes)};
`;
const f = path.join(__dirname, '..', '..', 'data0.js'); fs.writeFileSync(f, js);
console.log('done', f, Math.round(js.length / 1024) + 'KB', '| units', out.length, '| quiz', out.map((x) => x.quiz.length).join(' '), '| words', out.map((x) => x.words.length).join(''));
if (process.env.WS_STATS) ['H01', 'K01', 'K02', 'H12', 'H13', 'H15', 'K17', 'H16', 'K18'].forEach((n) => { const x = out.find((y) => y.no === n);
  console.log('\n' + n, x.title, '| cards', (x.cards || []).length, '| pool', x.pool); x.quiz.forEach((q) => console.log('  ', q.pk, q.p, '→', q.opts.join(' / '), q.say ? `(🔊${q.say})` : ''));
  x.words.forEach((v) => console.log('   W', v.jp, v.ko, '|', v.read, '|', v.fill.join(''))); });
