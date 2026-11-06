// Host-only Setup panel. Everything is saved to the browser as you type.
import { POINTS, defaultConfig } from './data.js';
import { putMedia, deleteMedia, mediaURL, exportConfig, importConfig, clearGame, cloud, onCloudChange, getAdminKey, setAdminKey, checkAdminKey, publishAll, loadCloudConfig, deviceOnlyMedia, pushCloud } from './storage.js';
import { defaultSticker } from './characters.js';

const TRANSITIONS = [
  ['album', '📸 Photo album lands'],
  ['chest', '🧰 Treasure chest opens'],
  ['heart', '💖 Heart card spins'],
  ['dive', '🌊 Camera dives into the water'],
  ['wheel', '🎡 Spinning wheel'],
];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function openAdmin({ config, onChange, onClose, previewCharacter }) {
  const cfg = structuredClone(config);
  let tab = 'characters';
  let qCat = 0;
  let timer = null;
  const changed = (what = 'content', immediate = false) => {
    clearTimeout(timer);
    const fire = () => onChange(structuredClone(cfg), what);
    if (immediate) fire();
    else timer = setTimeout(fire, 350);
  };

  const root = document.createElement('div');
  root.className = 'admin';
  document.body.appendChild(root);

  const cloudText = () => {
    if (!cloud.available) return ['💻', 'Saved on this device only', 'local'];
    if (!getAdminKey()) return ['🔒', 'Netlify: enter host password to save', 'locked'];
    const map = { saving: ['⏳', 'Saving to Netlify…', 'saving'], synced: ['☁️', 'Saved to Netlify', 'ok'], locked: ['🔒', 'Wrong host password', 'error'], error: ['⚠️', cloud.error || 'Netlify error', 'error'], empty: ['☁️', 'Netlify ready (nothing saved yet)', 'ok'] };
    return map[cloud.status] || ['☁️', 'Netlify', 'ok'];
  };
  const paintCloud = () => {
    const chip = root.querySelector('[data-cloud]');
    if (!chip) return;
    const [icon, text, cls] = cloudText();
    chip.className = `cloud-chip ${cls}`;
    chip.textContent = `${icon} ${text}`;
  };
  const unsub = onCloudChange(paintCloud);

  const close = () => {
    unsub();
    clearTimeout(timer);
    onChange(structuredClone(cfg), 'all');
    root.remove();
    onClose?.();
  };

  async function render() {
    await renderInner();
    paintCloud();
  }

  async function renderInner() {
    root.innerHTML = `
      <div class="admin-panel">
        <div class="admin-head">
          <div><div class="admin-kicker">HOST ONLY</div><h2>⚙ Game Setup</h2></div>
          <div class="admin-head-right"><span class="cloud-chip" data-cloud></span><button class="btn" data-close>✔ Done</button></div>
        </div>
        ${cloud.available && !getAdminKey() ? `<div class="cloud-banner">🔒 This game is on Netlify. Enter the host password so your photos and questions are saved for everyone:
          <input type="password" data-keyinput placeholder="host password"> <button class="btn-mini good" data-unlock>Unlock</button> <span class="cloud-msg" data-cloudmsg></span></div>` : ''}
        <div class="admin-tabs">
          ${[['characters', '👫 Characters & Couples'], ['categories', '🗂 Categories'], ['questions', '❓ Questions'], ['final', '🌊 Final Splash'], ['settings', '🎛 Settings'], ['data', '💾 Save / Load']]
            .map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}
        </div>
        <div class="admin-body">${await body()}</div>
      </div>`;
  }

  async function body() {
    if (tab === 'characters') {
      const cards = await Promise.all(cfg.characters.map(async (c, i) => {
        const st = (c.sticker && (await mediaURL(c.sticker))) || defaultSticker(c, i);
        return `<div class="a-card char-card" data-i="${i}">
          <div class="char-top">
            <img class="sticker md" src="${st}">
            <div class="grow">
              <div class="row">
                <label class="grow">Name<input data-f="name" value="${esc(c.name)}"></label>
                <label class="grow">Intro tagline<input data-f="tagline" value="${esc(c.tagline || '')}" placeholder="The Captain"></label>
              </div>
              <div class="row">
                <label>Role<select data-f="role"><option value="girl" ${c.role === 'girl' ? 'selected' : ''}>Girl (player)</option><option value="boy" ${c.role === 'boy' ? 'selected' : ''}>Boy (subject)</option></select></label>
                <label>Couple<select data-f="couple">${[0, 1, 2, 3].map((k) => `<option value="${k}" ${c.couple === k ? 'selected' : ''}>Couple ${k + 1}</option>`).join('')}</select></label>
                <label>Color<input type="color" data-f="color" value="${c.color}"></label>
              </div>
            </div>
          </div>
          <div class="row files">
            <label class="file-btn">🖼 Face sticker<input type="file" accept="image/*" data-up="sticker"></label>
            ${c.sticker ? '<button class="btn-mini" data-clear="sticker">✕ sticker</button>' : ''}
            <label class="file-btn">🧍 3D model (.glb)<input type="file" accept=".glb,.gltf,model/gltf-binary" data-up="model"></label>
            ${c.model ? '<span class="tag">model ✓</span><button class="btn-mini" data-clear="model">✕ model</button>' : '<span class="tag dim">placeholder</span>'}
            <button class="btn-mini" data-preview="${c.id}">▶ wave</button>
          </div>
        </div>`;
      }));
      return `<p class="hint">Four couples, eight people. The <b>girls</b> are the players; the <b>boys</b> are the subjects of the questions (and the judges!). Upload a face sticker and, later, a rigged <b>.glb</b> model for each person. Animation clips named <i>idle, run, cheer, sad, laugh, dance, surprise</i> are used automatically.</p>
        <div class="grid2">${cards.join('')}</div>`;
    }
    if (tab === 'categories') {
      return `<p class="hint">Five columns on the board. Each category gets its own reusable 3D transition.</p>
        ${cfg.categories.map((c, i) => `<div class="a-card cat-card" data-ci="${i}">
          <div class="row">
            <label class="narrow">Icon<input data-cf="icon" value="${esc(c.icon)}" maxlength="4"></label>
            <label class="grow">Name<input data-cf="name" value="${esc(c.name)}"></label>
            <label class="narrow">Color<input type="color" data-cf="color" value="${c.color}"></label>
            <label>Transition<select data-cf="transition">${TRANSITIONS.map(([k, l]) => `<option value="${k}" ${c.transition === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>
          <label>Description<input data-cf="description" value="${esc(c.description)}"></label>
        </div>`).join('')}`;
    }
    if (tab === 'questions') {
      const qs = cfg.questions[qCat];
      const items = await Promise.all(qs.map(async (q, r) => {
        const img = q.image ? await mediaURL(q.image) : null;
        return `<div class="a-card q-edit" data-r="${r}">
          <div class="q-edit-pts" style="--cat:${cfg.categories[qCat].color}">${POINTS[r]}</div>
          <div class="grow">
            <label>Question title<textarea data-qf="title" rows="2">${esc(q.title)}</textarea></label>
            <div class="row">
              <label class="grow">Private answer (only shown on reveal)<input data-qf="answer" value="${esc(q.answer)}"></label>
              <label class="grow">Explanation (optional)<input data-qf="explanation" value="${esc(q.explanation)}"></label>
            </div>
            <div class="row">
              <label>Format<select data-qf="format">
                <option value="text" ${q.format === 'text' ? 'selected' : ''}>Text only</option>
                <option value="image" ${q.format === 'image' ? 'selected' : ''}>Image + question</option>
                <option value="imageOnly" ${q.format === 'imageOnly' ? 'selected' : ''}>Image only</option>
              </select></label>
              <label>About (he reacts!)<select data-qf="subject"><option value="">— nobody —</option>${cfg.characters.map((c) => `<option value="${c.id}" ${q.subject === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
              <label class="check"><input type="checkbox" data-qf="funny" ${q.funny ? 'checked' : ''}> Funny (people laugh)</label>
            </div>
            <div class="row files">
              <label class="file-btn">🖼 Upload image<input type="file" accept="image/*" data-qup="${r}"></label>
              ${img ? `<img class="q-thumb" src="${img}"><button class="btn-mini" data-qclear="${r}">✕ image</button>` : '<span class="tag dim">no image</span>'}
            </div>
          </div>
        </div>`;
      }));
      return `<div class="cat-switch">${cfg.categories.map((c, i) => `<button class="tab ${qCat === i ? 'on' : ''}" data-qcat="${i}" style="--cat:${c.color}">${esc(c.icon)} ${esc(c.name)}</button>`).join('')}</div>${items.join('')}`;
    }
    if (tab === 'final') {
      const f = cfg.final;
      const img = f.image ? await mediaURL(f.image) : null;
      return `<p class="hint">One final question after the board is cleared. Both teams secretly wager, then answer at the same time.</p>
        <div class="a-card final-edit">
          <label>Final question<textarea data-ff="title" rows="2">${esc(f.title)}</textarea></label>
          <label>Answer<input data-ff="answer" value="${esc(f.answer)}"></label>
          <div class="row files"><label class="file-btn">🖼 Upload image<input type="file" accept="image/*" data-fup></label>
          ${img ? `<img class="q-thumb" src="${img}"><button class="btn-mini" data-fclear>✕ image</button>` : ''}</div>
        </div>`;
    }
    if (tab === 'settings') {
      const s = cfg.settings;
      const tg = (k, l, d) => `<label class="toggle"><input type="checkbox" data-sf="${k}" ${s[k] ? 'checked' : ''}><span class="sw"></span><span><b>${l}</b><small>${d}</small></span></label>`;
      return `<div class="a-card">
          <div class="row">
            ${[0, 1].map((t) => `<label class="grow">Team ${t + 1} name<input data-team-name="${t}" value="${esc(s.teamNames[t])}"></label><label class="narrow">Color<input type="color" data-team-color="${t}" value="${s.teamColors[t]}"></label>`).join('')}
          </div>
          <label class="narrow2">Answer timer (seconds)<input type="number" min="5" max="180" data-sf="timer" value="${s.timer}"></label>
        </div>
        <div class="a-card toggles">
          ${tg('stealing', 'Stealing', 'If a team misses, the other team can answer')}
          ${tg('wrongPenalty', 'Wrong-answer penalty', 'Deduct the points for a wrong answer')}
          ${tg('doubleTrouble', 'Double Trouble', 'One hidden tile is worth double (sparkles on the board)')}
          ${tg('askTheBoys', 'Ask the Boys', 'Once per team, the girls may ask one boy for a cryptic hint')}
          ${tg('finalSplash', 'The Final Splash', 'A wager round after the board is cleared')}
          ${tg('animations', 'Cinematic transitions', 'The 5-second camera move before each question')}
          ${tg('sound', 'Sound effects', '')}
          ${tg('music', 'Music', '')}
        </div>`;
    }
    if (tab === 'data') {
      const local = deviceOnlyMedia(cfg);
      const cloudCard = cloud.available ? `<div class="a-card">
          <h3>☁️ Netlify cloud</h3>
          <p class="hint">Your setup and uploads are stored on this Netlify site (Netlify Blobs), so every device that opens the game gets the same questions and photos. Changes save automatically while you're unlocked.</p>
          ${getAdminKey()
            ? `<div class="row"><button class="btn" data-publish>☁️ Publish everything now</button><button class="btn btn-secondary" data-reloadcloud>↻ Reload from Netlify</button><button class="btn-mini" data-lockcloud>🔒 Lock this device</button></div>
               ${local ? `<p class="hint warn">⚠️ ${local} file${local === 1 ? '' : 's'} only on this device — press <b>Publish everything now</b> to upload ${local === 1 ? 'it' : 'them'}.</p>` : ''}`
            : `<div class="row"><input type="password" data-keyinput placeholder="host password"><button class="btn" data-unlock>Unlock</button></div>`}
          <div class="cloud-msg" data-cloudmsg>${cloud.savedAt ? `Last saved: ${new Date(cloud.savedAt).toLocaleString()}` : ''}</div>
        </div>` : `<div class="a-card"><h3>💻 Saved on this device</h3><p class="hint">Not running on Netlify (or offline), so the setup is stored in this browser. Deploy to Netlify to share it across devices.</p></div>`;
      return `${cloudCard}<div class="a-card">
          <h3>Backup & share</h3>
          <p class="hint">Download everything (characters, photos, models and questions) as one file. Load it on the party laptop before the trip.</p>
          <div class="row"><button class="btn" data-export>⬇ Download game file</button>
          <label class="btn btn-secondary file-btn">⬆ Load game file<input type="file" accept="application/json,.json" data-import></label></div>
        </div>
        <div class="a-card danger">
          <h3>Reset</h3>
          <div class="row"><button class="btn-mini" data-cleargame>Clear saved game progress</button>
          <button class="btn-mini bad" data-reset>Reset ALL setup to defaults</button></div>
        </div>`;
    }
    return '';
  }

  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-close]')) return close();
    const tb = t.closest('[data-tab]');
    if (tb) { tab = tb.dataset.tab; return render(); }
    const qc = t.closest('[data-qcat]');
    if (qc) { qCat = +qc.dataset.qcat; return render(); }
    const pv = t.closest('[data-preview]');
    if (pv) return previewCharacter?.(pv.dataset.preview);
    const cl = t.closest('[data-clear]');
    if (cl) {
      const i = +cl.closest('[data-i]').dataset.i;
      const f = cl.dataset.clear;
      await deleteMedia(cfg.characters[i][f]);
      cfg.characters[i][f] = null;
      changed(f === 'model' ? 'model' : 'characters', true);
      return render();
    }
    const qcl = t.closest('[data-qclear]');
    if (qcl) {
      const r = +qcl.dataset.qclear;
      await deleteMedia(cfg.questions[qCat][r].image);
      cfg.questions[qCat][r].image = null;
      changed('content', true);
      return render();
    }
    if (t.closest('[data-fclear]')) { await deleteMedia(cfg.final.image); cfg.final.image = null; changed('content', true); return render(); }
    if (t.closest('[data-export]')) {
      const blob = await exportConfig(cfg);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'yacht-club-trivia.json';
      a.click();
      return;
    }
    if (t.closest('[data-unlock]')) {
      const input = root.querySelector('[data-keyinput]');
      const msg = root.querySelector('[data-cloudmsg]');
      const key = input?.value.trim();
      if (!key) return;
      if (msg) msg.textContent = 'Checking…';
      const res = await checkAdminKey(key);
      if (!res.ok) { if (msg) msg.textContent = `❌ ${res.error || 'Wrong password'}`; return; }
      setAdminKey(key);
      if (cloud.status === 'empty') await pushCloud(cfg); // first save of this site's setup
      paintCloud();
      return render();
    }
    if (t.closest('[data-lockcloud]')) { setAdminKey(''); paintCloud(); return render(); }
    if (t.closest('[data-publish]')) {
      const msg = root.querySelector('[data-cloudmsg]');
      if (msg) msg.textContent = 'Uploading…';
      try {
        const out = await publishAll(cfg);
        Object.assign(cfg, out);
        changed('all', true);
        render();
      } catch (err) {
        if (msg) msg.textContent = `❌ ${err.message}`;
      }
      return;
    }
    if (t.closest('[data-reloadcloud]')) {
      const fresh = await loadCloudConfig();
      if (fresh) { Object.assign(cfg, fresh); changed('all', true); render(); }
      return;
    }
    if (t.closest('[data-cleargame]')) { clearGame(); t.textContent = 'Cleared ✓'; return; }
    if (t.closest('[data-reset]')) {
      if (!confirm('Reset all characters, categories, questions and settings to the defaults?')) return;
      Object.assign(cfg, defaultConfig());
      changed('all', true);
      return render();
    }
  });

  root.addEventListener('input', (e) => {
    const t = e.target;
    const ci = t.closest('[data-i]');
    if (ci && t.dataset.f) {
      const c = cfg.characters[+ci.dataset.i];
      c[t.dataset.f] = t.dataset.f === 'couple' ? +t.value : t.value;
      return changed('characters');
    }
    const cat = t.closest('[data-ci]');
    if (cat && t.dataset.cf) { cfg.categories[+cat.dataset.ci][t.dataset.cf] = t.value; return changed(); }
    const qe = t.closest('[data-r]');
    if (qe && t.dataset.qf) {
      const q = cfg.questions[qCat][+qe.dataset.r];
      q[t.dataset.qf] = t.type === 'checkbox' ? t.checked : t.dataset.qf === 'subject' ? t.value || null : t.value;
      return changed();
    }
    if (t.dataset.ff) { cfg.final[t.dataset.ff] = t.value; return changed(); }
    if (t.dataset.sf) {
      cfg.settings[t.dataset.sf] = t.type === 'checkbox' ? t.checked : Math.max(5, Math.min(180, +t.value || 30));
      return changed();
    }
    if (t.dataset.teamName) { cfg.settings.teamNames[+t.dataset.teamName] = t.value.toUpperCase(); return changed('characters'); }
    if (t.dataset.teamColor) { cfg.settings.teamColors[+t.dataset.teamColor] = t.value; return changed('characters'); }
  });

  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.type !== 'file' || !t.files?.[0]) return;
    const file = t.files[0];
    if (t.dataset.import !== undefined) {
      try {
        const imported = await importConfig(await file.text());
        Object.assign(cfg, imported);
        changed('all', true);
        render();
      } catch (err) {
        alert(`Could not load that file: ${err.message}`);
      }
      return;
    }
    const ref = await putMedia(file);
    if (t.dataset.up) {
      const i = +t.closest('[data-i]').dataset.i;
      await deleteMedia(cfg.characters[i][t.dataset.up]);
      cfg.characters[i][t.dataset.up] = ref;
      changed(t.dataset.up === 'model' ? 'model' : 'characters', true);
    } else if (t.dataset.qup !== undefined) {
      const q = cfg.questions[qCat][+t.dataset.qup];
      await deleteMedia(q.image);
      q.image = ref;
      if (q.format === 'text') q.format = 'image';
      changed('content', true);
    } else if (t.dataset.fup !== undefined) {
      await deleteMedia(cfg.final.image);
      cfg.final.image = ref;
      changed('content', true);
    }
    render();
  });

  render();
}
