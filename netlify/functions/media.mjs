// POST   /api/media        -> upload an image / .glb (raw body, host password required) -> { url }
// GET    /api/media/:key   -> serve it (cached forever; keys are never reused)
// DELETE /api/media/:key   -> remove it (host password required)
import { getStore } from '@netlify/blobs';
import { json, checkAdmin } from '../lib/auth.mjs';

const store = () => getStore({ name: 'yacht-media', consistency: 'strong' });
const MAX = 5.5 * 1024 * 1024; // Netlify functions accept ~6 MB request bodies

export default async (req) => {
  const url = new URL(req.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/api\/media\/?/, ''));
  if (req.method === 'GET') {
    if (!key) return json({ error: 'Missing key' }, 400);
    const res = await store().getWithMetadata(key, { type: 'arrayBuffer' });
    if (!res) return new Response('Not found', { status: 404 });
    return new Response(res.data, {
      headers: { 'content-type': res.metadata?.type || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' },
    });
  }
  if (req.method === 'POST') {
    const denied = checkAdmin(req);
    if (denied) return denied;
    const body = await req.arrayBuffer();
    if (!body.byteLength) return json({ error: 'Empty upload' }, 400);
    if (body.byteLength > MAX) return json({ error: 'File too big (max ~5 MB)' }, 413);
    const type = req.headers.get('content-type') || 'application/octet-stream';
    const ext = (req.headers.get('x-file-name') || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
    const newKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext ? `.${ext}` : ''}`;
    await store().set(newKey, body, { metadata: { type, size: body.byteLength, uploadedAt: new Date().toISOString() } });
    return json({ url: `/api/media/${newKey}` });
  }
  if (req.method === 'DELETE') {
    const denied = checkAdmin(req);
    if (denied) return denied;
    if (key) await store().delete(key);
    return json({ ok: true });
  }
  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: ['/api/media', '/api/media/*'] };
