// 표지 시안용 스튜디오 제품사진 톤 이미지 (OpenAI gpt-image-1.5)
const fs = require('fs');
const STYLE = 'Minimalist studio product photograph for a design magazine cover: a single object on a seamless light warm-gray paper backdrop, soft diffused window light from the upper left, one gentle shadow, muted desaturated colors, photorealistic, extremely clean, large empty space above and around the object for a masthead. No text, no letters, no logos.';
const OBJ = {
  c1_pencil: 'one sharpened dark green wooden pencil lying diagonally in the lower half of the frame',
  c2_eraser: 'one plain white block eraser with a blank paper sleeve, placed slightly below center, a few soft eraser crumbs beside it',
  c3_book: 'one closed thick workbook with a plain cream cover and rounded corners, placed flat and slightly angled in the lower half of the frame',
};
async function gen(name, obj) {
  const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer proxy-injected' },
    body: JSON.stringify({ model: 'gpt-image-1.5', prompt: `${STYLE} Object: ${obj}. Portrait composition.`, size: '1024x1536', quality: 'medium', n: 1 }) });
  const j = await r.json();
  if (!r.ok) { console.error(name, r.status, JSON.stringify(j).slice(0, 200)); return; }
  fs.writeFileSync(`cover/${name}.png`, Buffer.from(j.data[0].b64_json, 'base64')); console.log(name, 'ok');
}
(async () => { await Promise.all(Object.entries(OBJ).map(([n, o]) => gen(n, o))); })();
