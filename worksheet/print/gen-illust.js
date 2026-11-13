// 각 학습지 본문 삽화 생성 (OpenAI gpt-image-1.5, 수채 파스텔 스타일)
// 사용법: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node gen-illust.js [stepId ...]
const fs = require('fs');
const path = require('path');
const STYLE = "Soft gentle watercolor illustration for a children's language workbook: muted pastel colors, light hand-drawn pencil outlines, airy, warm, simple shapes, plain white background, no text, no letters, no signs with writing.";
const SCENES = {
  1: 'Two people meeting for the first time and bowing politely to each other at the entrance of a Japanese school, both smiling.',
  2: 'A friendly Japanese teacher standing by a small blackboard and a student holding a textbook, a company worker with a briefcase nearby.',
  3: 'A classroom scene: a student with a Korean flag pin on their bag chatting with a teacher, a doctor\'s white coat hanging on a hook in the corner.',
  4: 'A school desk with a book on it, a school bag on a chair, and a school building seen through the window.',
  5: 'A wooden desk with a book that has a small name tag, a folded umbrella leaning on the desk, and a Japanese textbook on a shelf.',
  6: 'A round wall clock showing eight o\'clock, with a small school building and a small bank building below it.',
  7: 'Tokyo cityscape on a clear sunny day: Tokyo Tower, many small buildings, a busy crossing with lots of people.',
  8: 'A quiet Kyoto street with a wooden temple gate, a small pagoda, blooming flowers, and a kind shopkeeper waving.',
  9: 'A quiet student room: a simple wooden desk with one book and a small laptop on it, a cat sitting on the floor beside the desk.',
  10: 'A morning breakfast table with a cup of coffee and an open Japanese textbook, a small television in the background turned off.',
  11: 'A morning routine: an alarm clock showing seven, a commuter train, and two friends studying together at a library table.',
  12: 'Two friends leaving a movie theater holding tickets, with grey rainy clouds in the sky above.',
  13: 'A person daydreaming with a thought bubble showing Tokyo Tower and a plate of sushi, a suitcase beside them.',
  14: 'Two coworkers happily eating bowls of ramen together at a small restaurant table at lunchtime.',
  15: 'A morning sequence in one scene: a sun rising over a house, a person washing their face at a sink, a breakfast tray, and a small school on a path.',
  16: 'A reception desk with a form and a pen, a receptionist waiting kindly, and in the background a man talking on the telephone.',
  17: 'A museum garden with a camera held up by a visitor, and simple pictogram signs: a crossed-out camera and a crossed-out cigarette, no words.',
  18: 'A night study desk with a lamp and textbooks, a bed with a pillow, a television switched off and a game controller put away in a box.',
  19: 'A person wearing headphones listening to music with eyes closed, a karaoke microphone on the table, a Japanese textbook open.',
  20: 'A comparison scene: Tokyo skyline on the left, Osaka castle on the right, a Kyoto temple with red autumn leaves in the middle, and a shiny red apple in front.',
};
async function gen(id) {
  const out = path.join('img', `step_${String(id).padStart(2, '0')}.png`);
  if (fs.existsSync(out)) { console.log(id, 'exists'); return; }
  const body = { model: 'gpt-image-1.5', prompt: `${STYLE} Scene: ${SCENES[id]} Centered composition with generous white margins around the scene.`, size: '1024x1024', quality: 'medium', n: 1 };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer proxy-injected' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { fs.writeFileSync(out, Buffer.from(j.data[0].b64_json, 'base64')); console.log(id, 'ok'); return; }
    console.error(id, 'attempt', attempt, r.status, JSON.stringify(j).slice(0, 200));
    await new Promise((res) => setTimeout(res, 3000 * attempt));
  }
}
(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : Object.keys(SCENES).map(Number);
  const queue = [...ids]; const workers = Array.from({ length: 4 }, async () => { while (queue.length) await gen(queue.shift()); });
  await Promise.all(workers);
})();
