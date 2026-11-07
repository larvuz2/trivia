// Face sticker from a character's original picture with GPT Image 2 (fal.ai). Same prompt for everyone.
//   FAL_KEY=... node tools/characters/sticker.mjs <name> [more names...]
// in:  tools/characters/<name>_ref.jpg     out: public/img/stickers/<name>.png  (raw: tools/characters/<name>_sticker_raw.png)
// GPT Image 2 has no transparent output, so it paints a flat green backdrop that chroma.py removes.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export const PROMPT = `Turn this character into a profile-picture sticker of ONLY their face.
Keep the head exactly as in the reference image: the same face, facial expression, eyes, eyebrows, nose, mouth,
skin tone, freckles, beard, hairstyle, hair colour, and anything worn on the head (sunglasses, earrings).
Do not change the identity, the expression or the art style (the same glossy 3D animated-movie render).
Show only the head and a hint of the neck, facing forward, centred and filling most of the square frame;
cut long hair off around the shoulders. No body, no arms, no clothing except a sliver of the collar.
Finish it as a die-cut sticker: a thick clean white outline following the silhouette of the head and hair,
on a perfectly flat, uniform pure green (#00FF00) background with no shadow, gradient or texture on it. No text.`;

const KEY = process.env.FAL_KEY;
if (!KEY) { console.error('FAL_KEY is not set'); process.exit(1); }
const auth = { Authorization: `Key ${KEY}` };

async function upload(file) {
  const init = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: 'image/jpeg', file_name: file.split('/').pop() }),
  }).then((r) => r.json());
  const put = await fetch(init.upload_url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: fs.readFileSync(file) });
  if (!put.ok) throw new Error(`upload failed ${put.status}`);
  return init.file_url;
}

async function sticker(name) {
  const url = await upload(`tools/characters/${name}_ref.jpg`);
  const job = await fetch('https://queue.fal.run/fal-ai/gpt-image-2/edit', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: PROMPT, image_urls: [url], image_size: 'square_hd', quality: 'high', background: 'opaque', output_format: 'png' }),
  }).then((r) => r.json());
  if (!job.status_url) throw new Error(`${name}: ${JSON.stringify(job).slice(0, 300)}`);
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fetch(job.status_url, { headers: auth }).then((r) => r.json());
    if (st.status === 'COMPLETED') break;
    if (st.status !== 'IN_QUEUE' && st.status !== 'IN_PROGRESS') throw new Error(`${name}: ${JSON.stringify(st).slice(0, 300)}`);
  }
  const res = await fetch(job.response_url, { headers: auth }).then((r) => r.json());
  if (!res.images?.[0]?.url) throw new Error(`${name}: ${JSON.stringify(res).slice(0, 300)}`);
  const raw = `tools/characters/${name}_sticker_raw.png`;
  fs.writeFileSync(raw, Buffer.from(await fetch(res.images[0].url).then((r) => r.arrayBuffer())));
  fs.mkdirSync('public/img/stickers', { recursive: true });
  // GPT Image 2 can't do transparency: key out the green backdrop, trim, 512px
  execFileSync('python3', ['tools/characters/chroma.py', raw, `public/img/stickers/${name}.png`, '512'], { stdio: 'inherit' });
  console.log('sticker', name, 'done');
}

const names = process.argv.slice(2);
const results = await Promise.allSettled(names.map(sticker));
results.forEach((r, i) => { if (r.status === 'rejected') console.error('FAILED', names[i], r.reason.message); });
