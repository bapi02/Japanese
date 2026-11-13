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
module.exports = { coverHtml };
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
