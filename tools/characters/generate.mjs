// Generate a character with Meshy v6 (image-to-3D on fal.ai) from a T-pose picture.
//   FAL_KEY=... node tools/characters/generate.mjs tools/characters/<name>_ref.jpg <name> [options]
// Writes tools/characters/<name>_src.glb, then run: tools/characters/build.sh <name>
// Options: --texture meshy-7|meshy-n1 (meshy-7 matched faces best in a side-by-side test)   --polycount 70000
//          --classic  (the settings used for Joe, Ray, Gabriel, Gus, Baby, Pau: picture as-is, T-pose, 40k,
//                      symmetry auto, PBR, Meshy's default texture model)
//          --pose exact|t-pose (exact = keep the picture's pose, e.g. a head tilt)   --out <file.glb>   --dry
// The picture is first cropped tight around the character (crop_ref.py) so Meshy sees the face at full res.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [src, name] = args;
const flag = args.includes('--dry') ? '--dry' : null;
if (!src || !name) { console.error('usage: node tools/characters/generate.mjs <image> <name> [--texture meshy-n1] [--polycount 70000] [--out f.glb] [--dry]'); process.exit(1); }
const classic = args.includes('--classic');
const textureModel = opt('--texture', classic ? null : 'meshy-7');
const polycount = Number(opt('--polycount', classic ? 40000 : 70000));
const pose = opt('--pose', 't-pose') === 'exact' ? '' : 't-pose';
const img = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'char-')), `${name}_crop.png`);
if (classic) fs.copyFileSync(src, img);
else execFileSync('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'crop_ref.py'), src, img], { stdio: 'inherit' });
const KEY = process.env.FAL_KEY;
if (!KEY) { console.error('FAL_KEY is not set'); process.exit(1); }
const auth = { Authorization: `Key ${KEY}` };

// 1. upload the picture to fal storage (Meshy needs a URL)
const type = classic && !src.endsWith('.png') ? 'image/jpeg' : 'image/png';
const init = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
  method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ content_type: type, file_name: path.basename(img) }),
}).then((r) => r.json());
const put = await fetch(init.upload_url, { method: 'PUT', headers: { 'Content-Type': type }, body: fs.readFileSync(img) });
if (!put.ok) throw new Error(`upload failed: ${put.status}`);
console.log('uploaded', init.file_url);
if (flag === '--dry') process.exit(0);

// 2. Meshy v6: T-pose, ~70k triangles, no forced symmetry (faces aren't symmetric), texture painted from
//    the picture. meshy-n1 textures from the reference image only (closest likeness, no PBR maps).
const input = {
  image_url: init.file_url, texture_image_url: init.file_url, pose_mode: pose,
  target_polycount: polycount, should_remesh: true, topology: 'triangle', symmetry_mode: classic ? 'auto' : 'off',
  enable_pbr: textureModel !== 'meshy-n1',
};
if (textureModel) input.texture_model = textureModel;
console.log('meshy input', JSON.stringify({ ...input, image_url: '…', texture_image_url: '…' }));
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
const out = opt('--out', `tools/characters/${name}_src.glb`);
fs.writeFileSync(out, Buffer.from(glb));
console.log('\nsaved', out, `(${(glb.byteLength / 1e6).toFixed(1)} MB) — next: tools/characters/build.sh ${name}`);
