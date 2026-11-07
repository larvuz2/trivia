// Generate a character with Meshy v6 (image-to-3D on fal.ai) from a T-pose picture.
//   FAL_KEY=... node tools/characters/generate.mjs tools/characters/<name>_ref.jpg <name>
// Writes tools/characters/<name>_src.glb, then run: tools/characters/build.sh <name>
import fs from 'node:fs';
import path from 'node:path';

const [img, name, flag] = process.argv.slice(2);
if (!img || !name) { console.error('usage: node tools/characters/generate.mjs <image> <name> [--dry]'); process.exit(1); }
const KEY = process.env.FAL_KEY;
if (!KEY) { console.error('FAL_KEY is not set'); process.exit(1); }
const auth = { Authorization: `Key ${KEY}` };

// 1. upload the picture to fal storage (Meshy needs a URL)
const type = img.endsWith('.png') ? 'image/png' : 'image/jpeg';
const init = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
  method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ content_type: type, file_name: path.basename(img) }),
}).then((r) => r.json());
const put = await fetch(init.upload_url, { method: 'PUT', headers: { 'Content-Type': type }, body: fs.readFileSync(img) });
if (!put.ok) throw new Error(`upload failed: ${put.status}`);
console.log('uploaded', init.file_url);
if (flag === '--dry') process.exit(0);

// 2. Meshy v6: T-pose, ~40k triangles, PBR maps, the picture also guides the texture
const input = {
  image_url: init.file_url, texture_image_url: init.file_url, pose_mode: 't-pose',
  target_polycount: 40000, enable_pbr: true, should_remesh: true, topology: 'triangle', symmetry_mode: 'auto',
};
const job = await fetch('https://queue.fal.run/fal-ai/meshy/v6/image-to-3d', {
  method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
}).then((r) => r.json());
console.log('queued', job.request_id, '(Meshy takes ~5-15 min)');
for (;;) {
  await new Promise((r) => setTimeout(r, 15000));
  const st = await fetch(job.status_url, { headers: auth }).then((r) => r.json());
  if (st.status === 'COMPLETED') break;
  if (st.status !== 'IN_QUEUE' && st.status !== 'IN_PROGRESS') throw new Error(JSON.stringify(st));
  process.stdout.write('.');
}
const res = await fetch(job.response_url, { headers: auth }).then((r) => r.json());
const glb = await fetch(res.model_glb.url).then((r) => r.arrayBuffer());
const out = `tools/characters/${name}_src.glb`;
fs.writeFileSync(out, Buffer.from(glb));
console.log('\nsaved', out, `(${(glb.byteLength / 1e6).toFixed(1)} MB) — next: tools/characters/build.sh ${name}`);
