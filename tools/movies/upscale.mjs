// Upscale the small reveal posters 4x with ESRGAN on fal.   node tools/movies/upscale.mjs <in> <out.png>
import fs from 'node:fs';
const [src, out] = process.argv.slice(2);
const auth = { Authorization: `Key ${process.env.FAL_KEY}` };
const type = src.endsWith('png') ? 'image/png' : 'image/jpeg';
const init = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ content_type: type, file_name: 'p' }) }).then((r) => r.json());
await fetch(init.upload_url, { method: 'PUT', headers: { 'Content-Type': type }, body: fs.readFileSync(src) });
const res = await fetch('https://fal.run/fal-ai/esrgan', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ image_url: init.file_url, scale: 4, model: 'RealESRGAN_x4plus' }) }).then((r) => r.json());
if (!res.image?.url) throw new Error(JSON.stringify(res).slice(0, 300));
fs.writeFileSync(out, Buffer.from(await fetch(res.image.url).then((r) => r.arrayBuffer())));
console.log('upscaled', out);
