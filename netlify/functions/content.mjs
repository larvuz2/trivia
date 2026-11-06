// GET  /api/content  -> the saved game setup (characters, categories, questions, settings) or 404
// PUT  /api/content  -> save it (host password required)
import { getStore } from '@netlify/blobs';
import { json, checkAdmin } from '../lib/auth.mjs';

const store = () => getStore({ name: 'yacht-trivia', consistency: 'strong' });

export default async (req) => {
  if (req.method === 'GET') {
    const data = await store().get('config', { type: 'json' });
    return data ? json(data) : json({ error: 'No saved setup yet' }, 404);
  }
  if (req.method === 'POST' && new URL(req.url).searchParams.has('check')) {
    // just verify the host password (used by the Setup panel's "Unlock")
    return checkAdmin(req) || json({ ok: true });
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    const denied = checkAdmin(req);
    if (denied) return denied;
    let cfg;
    try { cfg = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!cfg || !Array.isArray(cfg.questions) || !Array.isArray(cfg.characters)) return json({ error: 'Not a Yacht Club Trivia setup' }, 400);
    cfg.savedAt = new Date().toISOString();
    await store().setJSON('config', cfg);
    return json({ ok: true, savedAt: cfg.savedAt });
  }
  if (req.method === 'HEAD') return new Response(null, { status: 200 });
  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/content' };
