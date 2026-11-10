// Persistence.
// - On Netlify: the game setup (characters, categories, questions, settings) and uploaded media live in
//   Netlify Blobs via two small functions (/api/content, /api/media). Everyone who opens the site gets them.
//   Writes need the host password (ADMIN_PASSWORD on the Netlify site).
// - Offline / local dev: setup in localStorage, media in IndexedDB (device only).
// - The in-progress game always stays in this browser's localStorage.
import { defaultConfig, CONFIG_VERSION } from './data.js';

const CONFIG_KEY = 'yct.config.v1';
const GAME_KEY = 'yct.game.v1';

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, val); return true; } catch { return false; }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export function loadConfig() {
  const raw = safeGet(CONFIG_KEY);
  if (!raw) return defaultConfig();
  try { return normalize(JSON.parse(raw)); } catch { return defaultConfig(); }
}

function normalize(cfg) {
  const def = defaultConfig();
  try {
    if (!cfg || cfg.version !== CONFIG_VERSION) return def;
    // Fill anything missing from defaults (forward compatible).
    cfg.settings = { ...def.settings, ...cfg.settings };
    // the old default team names become the new, simpler defaults (custom names are kept)
    const oldNames = ['TEAM SUNSET', 'TEAM TIDAL WAVE'];
    cfg.settings.teamNames = (cfg.settings.teamNames || def.settings.teamNames).map((n, i) => (n === oldNames[i] ? def.settings.teamNames[i] : n));
    cfg.final = { ...def.final, ...cfg.final };
    // keep the saved people; anyone new in the defaults (e.g. the 5th couple) is added
    if (!Array.isArray(cfg.characters) || !cfg.characters.length) cfg.characters = def.characters;
    else for (const d of def.characters) if (!cfg.characters.some((c) => c.id === d.id)) cfg.characters.push(d);
    // placeholder names from older saves pick up the new default names (e.g. "Guy 1" -> "Joe")
    for (const c of cfg.characters) {
      const d = def.characters.find((x) => x.id === c.id);
      if (d && /^(Guy|Girl) \d$/.test(c.name || '') && c.name !== d.name) c.name = d.name;
    }
    cfg.categories = cfg.categories?.length === 5 ? cfg.categories : def.categories;
    cfg.questions = cfg.questions?.length === 5 ? cfg.questions : def.questions;
    return cfg;
  } catch {
    return def;
  }
}

export function saveConfig(cfg) {
  const ok = safeSet(CONFIG_KEY, JSON.stringify(cfg));
  if (cloud.available && getAdminKey()) schedulePush(cfg);
  return ok;
}

// ---------- Netlify cloud (Blobs) ----------
export const cloud = { available: false, status: 'local', savedAt: null, error: null };
const listeners = new Set();
function setCloud(patch) {
  Object.assign(cloud, patch);
  listeners.forEach((f) => f(cloud));
}
export function onCloudChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const ADMIN_KEY = 'yct.adminKey';
export function getAdminKey() { return safeGet(ADMIN_KEY) || ''; }
export function setAdminKey(k) { if (k) safeSet(ADMIN_KEY, k); else safeRemove(ADMIN_KEY); }

/** Ask Netlify for the shared setup. Returns it (normalized) or null (not on Netlify / nothing saved yet). */
export async function loadCloudConfig() {
  try {
    const r = await fetch('/api/content', { cache: 'no-store' });
    const isJSON = (r.headers.get('content-type') || '').includes('json');
    if (r.status === 404 && isJSON) { setCloud({ available: true, status: 'empty' }); return null; }
    if (!r.ok || !isJSON) throw new Error('no cloud');
    const data = await r.json();
    const cfg = normalize(data);
    safeSet(CONFIG_KEY, JSON.stringify(cfg));
    setCloud({ available: true, status: 'synced', savedAt: data.savedAt || null, error: null });
    return cfg;
  } catch {
    setCloud({ available: false, status: 'local' });
    return null;
  }
}

let pushTimer = null;
function schedulePush(cfg) {
  clearTimeout(pushTimer);
  setCloud({ status: 'saving' });
  const snapshot = JSON.stringify(cfg);
  pushTimer = setTimeout(() => pushCloud(JSON.parse(snapshot)), 900);
}

/** Check a host password without changing anything. Resolves to { ok, error }. */
export async function checkAdminKey(key) {
  try {
    const r = await fetch('/api/content?check=1', { method: 'POST', headers: { 'x-admin-key': key } });
    const res = await r.json().catch(() => ({}));
    return { ok: r.ok, error: res.error };
  } catch {
    return { ok: false, error: 'Could not reach Netlify' };
  }
}

/** Save the setup to Netlify now. Resolves to true on success. */
export async function pushCloud(cfg) {
  if (!cloud.available) return false;
  setCloud({ status: 'saving' });
  try {
    const r = await fetch('/api/content', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-admin-key': getAdminKey() },
      body: JSON.stringify(cfg),
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) {
      setCloud({ status: r.status === 401 ? 'locked' : 'error', error: res.error || `Error ${r.status}` });
      return false;
    }
    setCloud({ status: 'synced', savedAt: res.savedAt, error: null });
    return true;
  } catch (e) {
    setCloud({ status: 'error', error: 'Could not reach Netlify' });
    return false;
  }
}

/** Shrink big photos before upload (keeps PNG transparency for stickers). */
async function prepareUpload(blob) {
  const type = blob.type || '';
  if (!/^image\/(jpeg|png|webp)$/.test(type) || typeof createImageBitmap !== 'function') return blob;
  try {
    const bmp = await createImageBitmap(blob);
    const max = 1600;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && blob.size < 900 * 1024) return blob;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const outType = type === 'image/png' ? 'image/png' : 'image/jpeg';
    const out = await new Promise((res) => c.toBlob(res, outType, 0.86));
    return out && out.size < blob.size ? out : blob;
  } catch {
    return blob;
  }
}

const PART = 4 * 1024 * 1024;   // one upload request (Netlify functions take ~6 MB bodies)
export const MAX_VIDEO = 50 * 1024 * 1024;

/** Big files go up in parts; the ref is /api/media/<key>?parts=N and mediaURL() puts them back together. */
async function uploadInParts(blob, name) {
  const n = Math.ceil(blob.size / PART);
  let key = '';
  for (let i = 0; i < n; i++) {
    const r = await fetch('/api/media', {
      method: 'POST',
      headers: { 'content-type': blob.type || 'application/octet-stream', 'x-admin-key': getAdminKey(), 'x-file-name': name, 'x-part': String(i), ...(key ? { 'x-upload-key': key } : {}) },
      body: blob.slice(i * PART, (i + 1) * PART),
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(res.error || `Upload failed (${r.status})`);
    key = res.key;
  }
  return `/api/media/${key}?parts=${n}`;
}

async function uploadToCloud(blob, name = '') {
  if (blob.size > PART) return uploadInParts(blob, name);
  const body = await prepareUpload(blob);
  const r = await fetch('/api/media', {
    method: 'POST',
    headers: { 'content-type': body.type || 'application/octet-stream', 'x-admin-key': getAdminKey(), 'x-file-name': name },
    body,
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(res.error || `Upload failed (${r.status})`);
  return res.url;
}

/** Count media that only exist on this device (uploaded while offline / before the password was entered). */
export function deviceOnlyMedia(cfg) {
  let n = 0;
  const check = (ref) => { if (ref?.startsWith('idb:')) n++; };
  cfg.characters.forEach((c) => { check(c.sticker); check(c.model); });
  cfg.questions.forEach((col) => col.forEach((q) => { check(q.image); check(q.answerImage); check(q.answerVideo); }));
  check(cfg.final?.image);
  check(cfg.settings?.boxVideo);
  return n;
}

/** Upload every device-only file to Netlify and save the setup. Returns the updated setup. */
export async function publishAll(cfg) {
  const out = await mapRefs(cfg, async (ref) => {
    if (!ref?.startsWith('idb:')) return ref;
    const blob = await getBlob(ref);
    return blob ? uploadToCloud(blob) : null;
  });
  const ok = await pushCloud(out);
  if (!ok) throw new Error(cloud.error || 'Could not save to Netlify');
  safeSet(CONFIG_KEY, JSON.stringify(out));
  return out;
}

export function loadGame() {
  const raw = safeGet(GAME_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export function saveGame(game) { safeSet(GAME_KEY, JSON.stringify(game)); }
export function clearGame() { safeRemove(GAME_KEY); }

// ---------- IndexedDB media store ----------
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('yct-media', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('media');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null);
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve, reject) => {
    const t = d.transaction('media', mode);
    const store = t.objectStore('media');
    const req = fn(store);
    t.oncomplete = () => resolve(req?.result ?? null);
    t.onerror = () => reject(t.error);
  });
}

const urlCache = new Map();

/** Store an uploaded file. On Netlify (with the host password) it goes to the cloud; otherwise to this device. */
export async function putMedia(blob) {
  if (cloud.available && getAdminKey()) {
    try {
      return await uploadToCloud(blob, blob.name || '');
    } catch (e) {
      setCloud({ status: 'error', error: `${e.message} — kept on this device instead` });
    }
  }
  const key = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await tx('readwrite', (s) => s.put(blob, key));
  return `idb:${key}`;
}

export async function deleteMedia(ref) {
  if (ref?.startsWith('/api/media/') && cloud.available && getAdminKey()) {
    const [base, q] = ref.split('?parts=');
    const urls = q ? Array.from({ length: +q }, (_, i) => `${base}.p${i}`) : [ref];
    for (const u of urls) fetch(u, { method: 'DELETE', headers: { 'x-admin-key': getAdminKey() } }).catch(() => {});
    return;
  }
  if (!ref?.startsWith('idb:')) return;
  const key = ref.slice(4);
  urlCache.delete(ref);
  await tx('readwrite', (s) => s.delete(key));
}

async function getBlob(ref) {
  if (!ref?.startsWith('idb:')) return null;
  return tx('readonly', (s) => s.get(ref.slice(4)));
}

/** Resolve a media ref (idb:key, url or data url) to something an <img> or loader can use. */
export async function mediaURL(ref) {
  if (!ref) return null;
  if (ref.includes('?parts=')) {
    // a big file uploaded in parts: fetch them all and play it from memory
    if (urlCache.has(ref)) return urlCache.get(ref);
    const [base, n] = ref.split('?parts=');
    const p = Promise.all(Array.from({ length: +n }, (_, i) => fetch(`${base}.p${i}`).then((r) => {
      if (!r.ok) throw new Error(`missing part ${i}`);
      return r.blob();
    }))).then((parts) => URL.createObjectURL(new Blob(parts, { type: parts[0]?.type || 'video/mp4' })));
    urlCache.set(ref, p);
    p.catch(() => urlCache.delete(ref));
    return p;
  }
  if (!ref.startsWith('idb:')) return ref;
  if (urlCache.has(ref)) return urlCache.get(ref);
  const blob = await getBlob(ref);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(ref, url);
  return url;
}

// ---------- Export / import (media embedded as data URLs) ----------
function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

async function mapRefs(cfg, fn) {
  const out = structuredClone(cfg);
  for (const c of out.characters) {
    c.sticker = await fn(c.sticker);
    c.model = await fn(c.model);
  }
  for (const col of out.questions) for (const q of col) { q.image = await fn(q.image); q.answerImage = await fn(q.answerImage ?? null); q.answerVideo = await fn(q.answerVideo ?? null); }
  out.final.image = await fn(out.final.image);
  if (out.settings) out.settings.boxVideo = await fn(out.settings.boxVideo ?? null);
  return out;
}

export async function exportConfig(cfg) {
  const out = await mapRefs(cfg, async (ref) => {
    if (!ref?.startsWith('idb:')) return ref;
    const blob = await getBlob(ref);
    return blob ? blobToDataURL(blob) : null;
  });
  return new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
}

export async function importConfig(text) {
  const parsed = JSON.parse(text);
  if (!parsed?.questions || !parsed?.characters) throw new Error('Not a Compitas Trivia file');
  parsed.version = CONFIG_VERSION;
  return mapRefs(parsed, async (ref) => {
    if (!ref?.startsWith('data:')) return ref;
    const blob = await (await fetch(ref)).blob();
    return putMedia(blob);
  });
}
