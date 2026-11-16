// 3권 표지 사진: 흰 지우개, 정중앙 (1·2권과 같은 톤)
const fs = require('fs');
const STYLE = 'Minimalist studio product photograph for a design magazine cover: a single object on a seamless light warm-gray paper backdrop, soft diffused window light from the upper left, one gentle shadow, muted desaturated colors, photorealistic, extremely clean, the object placed exactly in the center of the frame with generous empty space on all sides. No text, no letters, no logos.';
const OBJ = 'one plain white block eraser with a blank paper sleeve, lying flat, rotated about 20 degrees, seen from a slightly elevated angle, a few tiny eraser crumbs beside it, exactly centered';
(async () => {
  const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer proxy-injected' },
    body: JSON.stringify({ model: 'gpt-image-1.5', prompt: `${STYLE} Object: ${OBJ}. Portrait composition.`, size: '1024x1536', quality: 'medium', n: 1 }) });
  const j = await r.json();
  if (!r.ok) { console.error(r.status, JSON.stringify(j).slice(0, 200)); process.exit(1); }
  fs.writeFileSync('cover/cover3_src.png', Buffer.from(j.data[0].b64_json, 'base64')); console.log('cover3 ok');
})();
