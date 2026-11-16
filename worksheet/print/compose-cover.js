// 표지 합성: 제품사진 + 매거진B식 타이포 → cover/preview_*.png (B5 비율)
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = __dirname;
const dataUri = (f, t = 'image/png') => `data:${t};base64,` + fs.readFileSync(f).toString('base64');
const W = 688, H = 971; // B5 @96dpi
function coverHtml(img, { initials = 'MK', sub = 'NIHONGO WORKSHEET', vol = 'VOL. 1', theme = '入門 · 20 SHEETS', year = '2026', dark = '#1d1d1b' } = {}) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Inter'; src: url('file://${path.join(ROOT, 'fonts', 'Inter-900.ttf')}'); font-weight: 900; }
  @font-face { font-family: 'NSKR'; src: url('file://${path.join(ROOT, 'fonts', 'NotoSansKR-400.ttf')}'); font-weight: 400; }
  @font-face { font-family: 'NSJP'; src: url('file://${path.join(ROOT, 'fonts', 'NotoSansJP-400.ttf')}'); font-weight: 400; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  .cv { position: relative; width: ${W}px; height: ${H}px; background: #d8d6d0; overflow: hidden; }
  .cv img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .mast { position: absolute; left: 44px; top: 34px; color: ${dark}; font-family: 'Inter'; font-weight: 900; font-size: 150px; line-height: 0.86; letter-spacing: -8px; }
  .sub { position: absolute; left: 48px; top: 178px; color: ${dark}; font-family: 'Inter'; font-weight: 900; font-size: 11px; letter-spacing: 3.5px; }
  .vol { position: absolute; left: 48px; bottom: 40px; color: ${dark}; font-family: 'Inter'; font-weight: 900; font-size: 12px; letter-spacing: 2.5px; line-height: 1.9; }
  .vol .t { font-family: 'NSJP', 'NSKR'; font-weight: 400; letter-spacing: 2px; }
  .yr { position: absolute; right: 48px; bottom: 40px; color: ${dark}; font-family: 'Inter'; font-weight: 900; font-size: 12px; letter-spacing: 2.5px; }
  .rule { position: absolute; left: 48px; right: 48px; bottom: 86px; height: 1px; background: ${dark}; opacity: 0.35; }
  </style></head><body><div class="cv"><img src="${img}">
  ${initials ? `<div class="mast">${initials}</div>` : ''}<div class="sub" ${initials ? '' : 'style="top:44px"'}>${sub}</div>
  <div class="rule"></div>
  <div class="vol">${vol}<br><span class="t">${theme}</span></div><div class="yr">${year}</div></div></body></html>`;
}

/* 인쇄소용 표지 (mm 단위, 재단 여백 포함)
   back=true  → 뒤표지 + 책등 + 앞표지 펼침면 (무선제본)
   back=false → 앞표지 낱장 (스프링제본)                                */
function coverPrintHtml(img, { vol = 'VOL. 1', theme = '20 SHEETS', sub = 'NIHONGO WORKSHEET', year = '2026', dark = '#1d1d1b', bg = '#d9d4d1', bleed = 3, spine = 4, back = true } = {}) {
  const TW = 182, TH = 257;                       // 재단 크기
  const PW = TW + bleed, PH = TH + 2 * bleed;      // 패널(바깥쪽 여백 포함)
  const total = back ? PW * 2 + spine : TW + 2 * bleed;
  const fx = back ? PW + spine : bleed;            // 앞표지 재단선 x 시작
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Inter'; src: url('file://${path.join(ROOT, 'fonts', 'Inter-900.ttf')}'); font-weight: 900; }
  @font-face { font-family: 'NSJP'; src: url('file://${path.join(ROOT, 'fonts', 'NotoSansJP-400.ttf')}'); font-weight: 400; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${total}mm; height: ${PH}mm; overflow: hidden; background: ${bg}; }
  .wrap { position: relative; width: ${total}mm; height: ${PH}mm; background: ${bg}; overflow: hidden; }
  .front { position: absolute; left: ${back ? PW + spine : 0}mm; top: 0; width: ${TW + bleed}mm; height: ${PH}mm; overflow: hidden; }
  .front img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .t { position: absolute; color: ${dark}; font-family: 'Inter'; font-weight: 900; font-size: 8.3pt; letter-spacing: 0.9mm; }
  .sub { left: ${fx + 12.7}mm; top: ${bleed + 11.6}mm; }
  .rule { position: absolute; left: ${fx + 12.7}mm; width: ${TW - 25.4}mm; top: ${bleed + TH - 22.7}mm; height: 0.26mm; background: ${dark}; opacity: 0.35; }
  .vol { left: ${fx + 12.7}mm; top: ${bleed + TH - 19.5}mm; line-height: 1.9; }
  .vol .th { font-family: 'NSJP'; font-weight: 400; letter-spacing: 0.5mm; }
  .yr { left: ${fx + TW - 12.7 - 14}mm; width: 14mm; text-align: right; top: ${bleed + TH - 14.2}mm; }
  .spine { position: absolute; left: ${PW}mm; top: 0; width: ${spine}mm; height: ${PH}mm; }
  .spine .st { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(90deg); transform-origin: center; white-space: nowrap; color: ${dark}; font-family: 'Inter'; font-weight: 900; font-size: ${Math.min(7, spine * 1.4)}pt; letter-spacing: 0.8mm; }
  .back { position: absolute; left: 0; top: 0; width: ${PW}mm; height: ${PH}mm; }
  .back .bt { position: absolute; left: ${bleed + 12.7}mm; bottom: ${bleed + 10.6}mm; color: ${dark}; font-family: 'Inter'; font-weight: 900; font-size: 7pt; letter-spacing: 0.8mm; line-height: 1.9; opacity: 0.8; }
  .back .mark { position: absolute; left: ${bleed + 12.7}mm; top: ${bleed + 11.6}mm; font-family: 'Inter'; font-weight: 900; font-size: 14pt; letter-spacing: -0.3mm; color: ${dark}; opacity: 0.75; }
  .guide { position: absolute; top: 0; bottom: 0; width: 0; border-left: 0.1mm dashed rgba(0,0,0,0.0); }
  </style></head><body><div class="wrap">
  ${back ? `<div class="back"><div class="mark">BaPi</div><div class="bt">${sub}<br>${vol} · ${theme}</div></div>
  <div class="spine"><div class="st">${sub} &nbsp;·&nbsp; ${vol}</div></div>` : ''}
  <div class="front"><img src="${img}"></div>
  <div class="t sub">${sub}</div><div class="rule"></div>
  <div class="t vol">${vol}<br><span class="th">${theme}</span></div><div class="t yr">${year}</div>
  </div></body></html>`;
}
module.exports = { coverHtml, coverPrintHtml };
if (require.main === module) (async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const names = process.argv.slice(2).length ? process.argv.slice(2) : ['c1_pencil', 'c2_eraser', 'c3_book'];
  for (const n of names) {
    await pg.setContent(coverHtml(dataUri(path.join(ROOT, 'cover', n + '.png')), { initials: '', theme: '20 SHEETS' }), { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    await pg.screenshot({ path: path.join(ROOT, 'cover', `preview_${n}.png`) }); console.log('preview', n);
  }
  await b.close();
})();
