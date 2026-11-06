// Persistence: game config + in-progress game live in localStorage,
// uploaded media (photos, stickers, .glb models) live in IndexedDB.
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
  const def = defaultConfig();
  if (!raw) return def;
  try {
    const cfg = JSON.parse(raw);
    if (!cfg || cfg.version !== CONFIG_VERSION) return def;
    // Fill anything missing from defaults (forward compatible).
    cfg.settings = { ...def.settings, ...cfg.settings };
    cfg.final = { ...def.final, ...cfg.final };
    cfg.characters = cfg.characters?.length === 8 ? cfg.characters : def.characters;
    cfg.categories = cfg.categories?.length === 5 ? cfg.categories : def.categories;
    cfg.questions = cfg.questions?.length === 5 ? cfg.questions : def.questions;
    return cfg;
  } catch {
    return def;
  }
}

export function saveConfig(cfg) {
  return safeSet(CONFIG_KEY, JSON.stringify(cfg));
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

export async function putMedia(blob) {
  const key = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await tx('readwrite', (s) => s.put(blob, key));
  return `idb:${key}`;
}

export async function deleteMedia(ref) {
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
  for (const col of out.questions) for (const q of col) q.image = await fn(q.image);
  out.final.image = await fn(out.final.image);
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
  if (!parsed?.questions || !parsed?.characters) throw new Error('Not a Yacht Club Trivia file');
  parsed.version = CONFIG_VERSION;
  return mapRefs(parsed, async (ref) => {
    if (!ref?.startsWith('data:')) return ref;
    const blob = await (await fetch(ref)).blob();
    return putMedia(blob);
  });
}
