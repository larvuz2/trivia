// Remove all text from the "guess the movie" posters with GPT Image 2 (fal), keeping everything else as is.
//   FAL_KEY=... node tools/movies/notext.mjs [names...]   in: tools/movies/<name>_src.jpg   out: tools/movies/<name>_notext.png
import fs from 'node:fs';

const BASE = `Remove ALL text from this image: titles, director credits, quotes, taglines, signatures, logos, numbers,
small print and captions. Keep everything else exactly as it is — the same minimal artwork, shapes, colours,
composition and paper texture. Fill the places where the text was with the surrounding background so nothing
looks erased. Do not add anything new.`;
const EXTRA = {
  dragon: '',
  leon: 'Show only the orange poster artwork itself, filling the frame: no white border, no wall, no binder clips.',
  parasite: '',
  freddy: 'Show only the photo itself, filling the frame: no white margin, no red border, no caption underneath.',
  monsters: 'Show only the black poster area with the two circles, filling the frame: no white band, no rules, no text block.',
};
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
async function run(name) {
  const url = await upload(`tools/movies/${name}_src.jpg`);
  const size = name === 'freddy' ? 'square_hd' : 'portrait_4_3';
  const job = await fetch('https://queue.fal.run/fal-ai/gpt-image-2/edit', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: `${BASE}\n${EXTRA[name]}`, image_urls: [url], image_size: size, quality: 'high', output_format: 'png' }),
  }).then((r) => r.json());
  if (!job.status_url) throw new Error(`${name}: ${JSON.stringify(job).slice(0, 300)}`);
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fetch(job.status_url, { headers: auth }).then((r) => r.json());
    if (st.status === 'COMPLETED') break;
    if (st.status !== 'IN_QUEUE' && st.status !== 'IN_PROGRESS') throw new Error(`${name}: ${JSON.stringify(st).slice(0, 300)}`);
  }
  const res = await fetch(job.response_url, { headers: auth }).then((r) => r.json());
  if (!res.images?.[0]) throw new Error(JSON.stringify(res).slice(0, 400));
  fs.writeFileSync(`tools/movies/${name}_notext.png`, Buffer.from(await fetch(res.images[0].url).then((r) => r.arrayBuffer())));
  console.log('done', name);
}
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(EXTRA);
const r = await Promise.allSettled(names.map(run));
r.forEach((x, i) => { if (x.status === 'rejected') console.error('FAILED', names[i], x.reason.message); });
