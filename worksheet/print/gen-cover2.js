const fs = require('fs');
const STYLE = 'Minimalist studio product photograph for a design magazine cover: a single object on a seamless light warm-gray paper backdrop, soft diffused window light from the upper left, one gentle shadow, muted desaturated colors, photorealistic, extremely clean, the object placed exactly in the center of the frame with generous empty space on all sides. No text, no letters, no logos.';
const OBJ = {
  n1_center_angled: 'one closed thick notebook with a plain cream cover and rounded corners, lying flat, rotated about 15 degrees, seen from a slightly elevated angle, exactly centered',
  n2_center_topdown: 'one closed thick notebook with a plain cream cover and rounded corners, lying flat and perfectly straight, photographed from directly above, exactly centered',
};
async function gen(name, obj) {
  const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer proxy-injected' },
    body: JSON.stringify({ model: 'gpt-image-1.5', prompt: `${STYLE} Object: ${obj}. Portrait composition.`, size: '1024x1536', quality: 'medium', n: 1 }) });
  const j = await r.json();
  if (!r.ok) { console.error(name, r.status, JSON.stringify(j).slice(0, 200)); return; }
  fs.writeFileSync(`cover/${name}.png`, Buffer.from(j.data[0].b64_json, 'base64')); console.log(name, 'ok');
}
(async () => { await Promise.all(Object.entries(OBJ).map(([n, o]) => gen(n, o))); })();
