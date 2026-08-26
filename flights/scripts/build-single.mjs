#!/usr/bin/env node
// 단일 파일 빌드 — lib + app + 데이터를 인라인해 정적 미리보기 HTML 하나를 만든다.
// (외부 요청이 막힌 환경 — 예: Claude 아티팩트 — 에서도 화면 전체가 동작한다.
//  라이브 조회만 배포본 전용이고, 미리보기에는 그렇게 안내가 뜬다.)
//
//   node flights/scripts/build-single.mjs [출력경로]   # 기본 flights/dist/preview.html

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const OUT = resolve(process.argv[2] || resolve(root, 'dist/preview.html'));

// app.js 가 의존하는 순서대로. serpapi/search 는 화면에서 안 쓴다.
const MODULES = ['lib/config.mjs', 'lib/holidays.mjs', 'lib/analyze.mjs', 'app.js'];

const stripModuleSyntax = (src) => src
  .replace(/^import .*$/gm, '')
  .replace(/^export (const|function|class|let) /gm, '$1 ');

let bundle = '';
for (const m of MODULES) {
  const src = await readFile(resolve(root, m), 'utf8');
  const stripped = stripModuleSyntax(src);
  const leftover = stripped.match(/^export /m);
  if (leftover) throw new Error(`${m}: 처리 못 한 export 구문이 있습니다 — 빌드 스크립트를 보강하세요.`);
  bundle += `\n/* ══════ ${m} ══════ */\n${stripped}`;
}

const html = await readFile(resolve(root, 'index.html'), 'utf8');
const prices = JSON.parse(await readFile(resolve(root, 'data/prices.json'), 'utf8'));

const marker = '<script type="module" src="./app.js"></script>';
if (!html.includes(marker)) throw new Error('index.html 에서 app.js 스크립트 태그를 찾지 못했습니다.');

const out = html.replace(marker, `<script>
window.__PREVIEW__ = true;
window.__PRICES__ = ${JSON.stringify(prices)};
</script>
<script type="module">${bundle}
</script>`);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, out, 'utf8');
console.log(`빌드 완료: ${OUT} (${(out.length / 1024).toFixed(0)} KB)`);
