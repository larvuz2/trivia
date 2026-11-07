// Concept art for the sea creatures in the same glossy 3D toy style as the characters (GPT Image 2 on fal).
//   FAL_KEY=... node tools/creatures/concept.mjs [names...]   -> tools/creatures/<name>_ref.png
import fs from 'node:fs';

const STYLE = `Match the art style of the reference image exactly: a glossy stylized 3D animated-movie render, chunky
toy-like proportions, soft rounded shapes, smooth clean materials, warm soft studio lighting, saturated but natural colours.
Use ONLY the style of the reference, not its subject. A single creature, fully visible and centred with margin around it,
on a plain flat dark purple studio background like the reference. No text, no props, no ground shadow, no water.`;

export const CREATURES = {
  seagull: `A cheerful yellow-footed gull (the Sea of Cortez gull) in flight, seen straight from the front at eye level,
facing the camera, wings fully spread out flat and horizontal to both sides like a letter T, perfectly symmetric.
White head and body, slate-grey wings with black wing tips, yellow beak with a red spot, big friendly cartoon eyes.`,
  gull: `A very quirky, funny cartoon seagull standing upright, facing the camera, perfectly symmetric front view.
Enormous round googly eyes with big black pupils, a big yellow beak with a red spot, chubby round white body,
grey folded wings tight against the body, short orange legs and webbed feet, a slightly derpy happy expression.`,
  dorado: `A dorado (mahi-mahi) fish in perfect side profile facing LEFT, straight and level, mouth closed. Blunt rounded
forehead, long tall dorsal fin running along the whole back, forked tail, bright green-gold body with a yellow belly
and small blue speckles, a big friendly cartoon eye.`,
  marlin: `A blue marlin in perfect side profile facing LEFT, straight and level. Long pointed bill, tall sail-like dorsal
fin, crescent tail, deep blue back fading to a silver-white belly with pale vertical stripes, a big friendly cartoon eye.`,
  dolphin: `A friendly bottlenose dolphin in perfect side profile facing LEFT, straight and level, smiling. Grey-blue back,
lighter belly, curved dorsal fin, flippers and tail flukes, a big friendly cartoon eye.`,
};

const KEY = process.env.FAL_KEY;
if (!KEY) { console.error('FAL_KEY is not set'); process.exit(1); }
const auth = { Authorization: `Key ${KEY}` };

async function upload(file, type) {
  const init = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: type, file_name: file.split('/').pop() }),
  }).then((r) => r.json());
  const put = await fetch(init.upload_url, { method: 'PUT', headers: { 'Content-Type': type }, body: fs.readFileSync(file) });
  if (!put.ok) throw new Error(`upload failed ${put.status}`);
  return init.file_url;
}

async function concept(name, styleUrl) {
  const job = await fetch('https://queue.fal.run/fal-ai/gpt-image-2/edit', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: `${CREATURES[name]}\n\n${STYLE}`, image_urls: [styleUrl], image_size: 'square_hd', quality: 'high', output_format: 'png' }),
  }).then((r) => r.json());
  if (!job.status_url) throw new Error(`${name}: ${JSON.stringify(job).slice(0, 300)}`);
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fetch(job.status_url, { headers: auth }).then((r) => r.json());
    if (st.status === 'COMPLETED') break;
    if (st.status !== 'IN_QUEUE' && st.status !== 'IN_PROGRESS') throw new Error(`${name}: ${JSON.stringify(st).slice(0, 300)}`);
  }
  const res = await fetch(job.response_url, { headers: auth }).then((r) => r.json());
  const out = `tools/creatures/${name}_ref.png`;
  fs.writeFileSync(out, Buffer.from(await fetch(res.images[0].url).then((r) => r.arrayBuffer())));
  console.log('concept', name, '->', out);
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CREATURES);
const styleUrl = await upload('tools/characters/joe_ref.jpg', 'image/jpeg');
const res = await Promise.allSettled(names.map((n) => concept(n, styleUrl)));
res.forEach((r, i) => { if (r.status === 'rejected') console.error('FAILED', names[i], r.reason.message); });
