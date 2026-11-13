// OpenAI gpt-image-1 스타일 샘플 (키는 프록시가 주입하므로 placeholder)
const fs = require('fs');
const SCENE = 'A quiet Japanese student room: a simple wooden desk with one book and a small laptop on it, a cat sitting on the floor beside the desk. No people, no text, no letters.';
const STYLES = {
  A_lineart_lavender: 'Japanese school textbook cut illustration (教科書の挿絵) style: clean thin black ink outlines, a single very pale lavender-blue wash tint on a few areas only, lots of white space, flat, no shading gradients, no background clutter, printed-worksheet look.',
  B_watercolor_pastel: 'Soft gentle watercolor illustration for a children\'s language workbook: muted pastel colors, light hand-drawn pencil outlines, airy, warm, simple shapes, white background.',
  C_flat_mint: 'Minimal flat vector illustration in two tones only, mint green (#8fcdc0) and warm gray, thin rounded outlines, very simple geometric shapes, white background, icon-like worksheet spot illustration.',
};
async function gen(name, style) {
  const body = { model: 'gpt-image-1.5', prompt: `${style} Scene: ${SCENE} Square composition, centered, generous white margins.`, size: '1024x1024', quality: 'low', n: 1 };
  const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer proxy-injected' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error(name, r.status, JSON.stringify(j).slice(0, 300)); return; }
  fs.writeFileSync(`samples/${name}.png`, Buffer.from(j.data[0].b64_json, 'base64'));
  console.log(name, 'ok', j.usage ? JSON.stringify(j.usage) : '');
}
(async () => { await Promise.all(Object.entries(STYLES).map(([n, s]) => gen(n, s))); })();
