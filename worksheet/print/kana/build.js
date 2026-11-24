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

const { UNITS, H_COUNT, SCRIPT, SMALL, k2h, h2k } = require('./units.js');
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
