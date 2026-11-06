import * as THREE from 'three';
import { World } from './world.js';
import { Character, defaultSticker } from './characters.js';
import { Board, Scoreboard } from './board.js';
import { Confetti, Splash, makeCategoryProp } from './fx.js';
import { CameraRig } from './camera.js';
import { sfx, unlockAudio, startMusic, setAudioEnabled } from './audio.js';
import { loadConfig, saveConfig, loadGame, saveGame, clearGame, mediaURL } from './storage.js';
import * as G from './game.js';
import { openAdmin } from './admin.js';

// ------------------------------------------------------------------
// Renderer & world
// ------------------------------------------------------------------
const canvas = document.getElementById('scene');
const ui = document.getElementById('ui');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(60, 30, -60);
const world = new World(renderer);
const scene = world.scene;
const rig = new CameraRig(camera);
const confetti = new Confetti(scene);
const splash = new Splash(scene);

let config = loadConfig();
let game = G.newGame();
const savedGame = loadGame();
let stickers = {}; // character id -> url

const BOARD_Z = 5.3;
const board = new Board();
const scoreboards = [new Scoreboard(0), new Scoreboard(1)];
let characters = [];
let props = [];
let gloomClouds = [];

// Team 0 stands on screen-left. The camera looks toward +Z from the stern,
// so screen-left is +X in stage space.
const SIDE = [1, -1];

function sw(x, y, z) {
  return world.stage.localToWorld(new THREE.Vector3(x, y, z));
}

// ------------------------------------------------------------------
// Loading
// ------------------------------------------------------------------
const loadFill = document.getElementById('loading-fill');
const loadText = document.getElementById('loading-text');
function setLoad(p, txt) {
  loadFill.style.width = `${Math.round(p * 100)}%`;
  if (txt) loadText.textContent = txt;
}

async function init() {
  setLoad(0.05, 'Inflating the beach balls…');
  try {
    await Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('20px "Fredoka"')]);
  } catch { /* fonts optional */ }
  setLoad(0.1, 'Sailing the yacht into La Paz…');
  try {
    await world.loadYacht('models/yacht.glb', (p) => setLoad(0.1 + p * 0.75));
  } catch (e) {
    console.warn('Yacht model failed to load, using fallback', e);
    world.buildFallbackYacht();
  }
  setLoad(0.9, 'Hanging the string lights…');

  world.stage.add(board.group);
  board.group.position.set(0, 0, BOARD_Z);
  board.group.rotation.y = Math.PI;
  board.setCategories(config.categories);

  scoreboards.forEach((sb, i) => {
    world.stage.add(sb.group);
    sb.group.position.set(SIDE[i] * 6.45, 5.3, BOARD_Z - 0.3);
    sb.group.rotation.y = Math.PI;
    sb.setPole(5.3);
  });

  buildCharacters();
  await refreshStickers();
  applySettings();

  world.updatables.push((dt) => {
    board.update(dt, world.party);
    scoreboards.forEach((s) => s.update(dt));
  });

  setLoad(1, 'All aboard!');
  document.getElementById('loading').classList.add('done');
  setTimeout(() => document.getElementById('loading')?.remove(), 900);
  showMenu();
}

function buildCharacters() {
  for (const c of characters) world.stage.remove(c.root);
  characters = config.characters.map((d, i) => {
    const ch = new Character(d, i);
    world.stage.add(ch.root);
    return ch;
  });
  placeCenter(true);
  characters.forEach(async (ch) => {
    if (ch.data.model) {
      try { await ch.loadModel(await mediaURL(ch.data.model)); } catch (e) { console.warn('model load failed', e); }
    }
  });
}

async function refreshStickers() {
  stickers = {};
  await Promise.all(config.characters.map(async (c, i) => {
    stickers[c.id] = (c.sticker && (await mediaURL(c.sticker))) || defaultSticker(c, i);
  }));
  updateScoreboards(true);
}

function applySettings() {
  setAudioEnabled({ sound: config.settings.sound, music: config.settings.music });
}

// ------------------------------------------------------------------
// Character layout helpers
// ------------------------------------------------------------------
const coupleOf = (i) => characters.filter((c) => c.data.couple === i);
const girlOf = (couple) => characters.find((c) => c.data.couple === couple && c.data.role === 'girl');
const boyOf = (couple) => characters.find((c) => c.data.couple === couple && c.data.role === 'boy');
const teamChars = (t) => game.teams[t].flatMap((cp) => coupleOf(cp));
const teamName = (t) => config.settings.teamNames[t];
const teamColor = (t) => config.settings.teamColors[t];

function centerSpot(couple) {
  const x = (1.5 - couple) * 2.3;
  return [[x + 0.45, -0.8], [x - 0.45, -0.8]]; // girl, boy
}

function placeCenter(instant = false) {
  for (let cp = 0; cp < 4; cp++) {
    const [gs, bs] = centerSpot(cp);
    const g = girlOf(cp);
    const b = boyOf(cp);
    if (instant) {
      g?.place(gs[0], gs[1], Math.PI);
      b?.place(bs[0], bs[1], Math.PI);
    } else {
      g?.moveTo(gs[0], gs[1], { face: Math.PI, delay: Math.random() * 0.3 });
      b?.moveTo(bs[0], bs[1], { face: Math.PI, delay: Math.random() * 0.3 });
    }
  }
}

function teamSpot(team, k, role) {
  const s = SIDE[team];
  const x = s * (k === 0 ? 2.9 : 5.9);
  return role === 'girl' ? [x, -0.9] : [x + s * 0.45, 0.6];
}

function placeTeams({ instant = false, stumbles = 0 } = {}) {
  const runners = [];
  game.teams.forEach((couples, t) => {
    couples.forEach((cp, k) => {
      for (const ch of coupleOf(cp)) {
        const [x, z] = teamSpot(t, k, ch.data.role);
        const face = Math.PI + SIDE[t] * 0.35;
        if (instant) ch.place(x, z, face);
        else runners.push([ch, x, z, face]);
      }
    });
  });
  const stumblers = new Set();
  while (stumblers.size < Math.min(stumbles, runners.length)) stumblers.add(Math.floor(Math.random() * runners.length));
  runners.forEach(([ch, x, z, face], i) => {
    ch.moveTo(x, z, { face, stumble: stumblers.has(i), delay: Math.random() * 0.35, speed: 5 + Math.random() * 1.5 });
  });
}

// ------------------------------------------------------------------
// Camera shots (stage space)
// ------------------------------------------------------------------
const shots = {
  boardWide: () => [sw(0, 12.2, -15.5), sw(0, 5.2, 3.2)],
  shuffle: () => [sw(0, 8.5, -11.5), sw(0, 1.4, 0)],
  reveal: () => [sw(0, 13.5, -19.5), sw(0, 2.6, 1.5)],
};

function menuOrbit() {
  // wide establishing shot: whole yacht low in frame, sky and Baja mountains behind
  const c = new THREE.Vector3(0, 2, -4);
  rig.startOrbit(c, 66, 17, 0.035, -2.3, new THREE.Vector3(0, 9, 0));
}

// ------------------------------------------------------------------
// UI helpers
// ------------------------------------------------------------------
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function setScreen(html, cls = '') {
  ui.innerHTML = '';
  const node = el(`<div class="screen ${cls}">${html}</div>`);
  ui.appendChild(node);
  ui.appendChild(globalButtons());
  return node;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function stickerImg(ch, cls = '') {
  return `<img class="sticker ${cls}" data-char="${ch.data.id}" src="${stickers[ch.data.id]}" alt="${esc(ch.data.name)}" title="${esc(ch.data.name)}">`;
}
function globalButtons() {
  const s = config.settings;
  const n = el(`<div class="global-btns">
    <button class="icon-btn" data-act="sound" title="Sound">${s.sound ? '🔊' : '🔇'}</button>
    <button class="icon-btn" data-act="music" title="Music">${s.music ? '🎵' : '🎶'}</button>
    <button class="icon-btn" data-act="fs" title="Fullscreen (F)">⛶</button>
    <button class="icon-btn" data-act="help" title="Host shortcuts (?)">?</button>
  </div>`);
  n.querySelector('[data-act=music]').classList.toggle('off', !s.music);
  n.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.act;
    if (!a) return;
    unlockAudio();
    if (a === 'sound') { s.sound = !s.sound; saveConfig(config); applySettings(); e.target.closest('button').textContent = s.sound ? '🔊' : '🔇'; }
    if (a === 'music') { s.music = !s.music; saveConfig(config); applySettings(); startMusic(); e.target.closest('button').classList.toggle('off', !s.music); }
    if (a === 'fs') toggleFullscreen();
    if (a === 'help') toggleHelp();
  });
  return n;
}
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}
function toggleHelp() {
  const ex = document.getElementById('help');
  if (ex) { ex.remove(); return; }
  const n = el(`<div id="help" class="modal-wrap"><div class="modal help">
    <h2>Host shortcuts</h2>
    <table>
      <tr><td><kbd>Space</kbd></td><td>Reveal / hide answer</td></tr>
      <tr><td><kbd>C</kbd></td><td>Correct — award points</td></tr>
      <tr><td><kbd>X</kbd></td><td>Wrong (opens a steal if enabled)</td></tr>
      <tr><td><kbd>N</kbd></td><td>No answer — skip question</td></tr>
      <tr><td><kbd>B</kbd></td><td>Ask the Boys (once per team)</td></tr>
      <tr><td><kbd>P</kbd></td><td>Pause / resume timer</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Back to board (tile not used)</td></tr>
      <tr><td><kbd>Z</kbd></td><td>Undo last question (on the board)</td></tr>
      <tr><td><kbd>F</kbd></td><td>Fullscreen</td></tr>
      <tr><td><kbd>H</kbd></td><td>Hide / show host bar</td></tr>
    </table>
    <button class="btn" data-close>Got it!</button>
  </div></div>`);
  n.addEventListener('click', (e) => { if (e.target === n || e.target.dataset.close !== undefined) n.remove(); });
  document.body.appendChild(n);
}

function toast(html, cls = '', dur = 1800) {
  const n = el(`<div class="toast ${cls}">${html}</div>`);
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('out'), dur);
  setTimeout(() => n.remove(), dur + 600);
}

function persist() {
  if (game.phase === 'menu') return;
  saveGame(game);
}

// ------------------------------------------------------------------
// 1. MAIN MENU
// ------------------------------------------------------------------
function showMenu() {
  game.phase = 'menu';
  world.setParty(0);
  board.setUsed({}, true);
  board.setDouble(null);
  board.clearSelection();
  placeCenter(rig.pos.distanceTo(sw(0, 0, 0)) > 50);
  characters.forEach((c) => c.showName(false));
  menuOrbit();
  const canContinue = savedGame && ['board', 'question', 'final'].includes(savedGame.phase);
  const n = setScreen(`
    <div class="menu">
      <div class="logo">
        <div class="logo-top">⚓ WELCOME ABOARD ⚓</div>
        <h1><span>YACHT CLUB</span><span class="logo-trivia">TRIVIA</span></h1>
        <div class="logo-sub">La Paz · The Couples Edition</div>
      </div>
      <div class="menu-actions">
        <button class="btn btn-play" data-act="play">▶ PLAY GAME</button>
        ${canContinue ? '<button class="btn btn-secondary" data-act="continue">↻ Continue saved game</button>' : ''}
        <button class="btn btn-ghost" data-act="setup">⚙ Game Setup</button>
      </div>
      <div class="menu-foot">The four guys have been friends forever. Now the girls have to prove how well they know them.</div>
    </div>`, 'screen-menu');
  n.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (!a) return;
    unlockAudio();
    startMusic();
    sfx('click');
    if (a === 'play') { clearGame(); game = G.newGame(); showShuffle(); }
    if (a === 'continue') continueGame();
    if (a === 'setup') openSetup();
  });
}

function continueGame() {
  game = Object.assign(G.newGame(), savedGame);
  if (game.phase === 'question') G.cancelQuestion(game);
  board.setUsed(game.used, true);
  board.setDouble(game.doubleKey);
  placeTeams({ instant: true });
  updateScoreboards(true);
  if (game.phase === 'final') {
    game.final = null;
    showFinalIntro();
  } else showBoard();
}

function openSetup() {
  rig.shot(...shots.boardWide(), 2);
  openAdmin({
    config,
    onChange: async (newCfg, what) => {
      config = newCfg;
      saveConfig(config);
      applySettings();
      board.setCategories(config.categories);
      if (what === 'characters' || what === 'all') {
        characters.forEach((ch, i) => { ch.data = config.characters[i]; ch.refreshLabel(); });
        await refreshStickers();
      }
      if (what === 'model' || what === 'all') buildCharacters();
    },
    onClose: () => showMenu(),
    previewCharacter: (id) => {
      const ch = characters.find((c) => c.data.id === id);
      if (ch) { ch.react(['cheer', 'dance', 'laugh', 'surprise'][Math.floor(Math.random() * 4)], 2); }
    },
  });
}

// ------------------------------------------------------------------
// 2. TEAM SHUFFLE
// ------------------------------------------------------------------
function showShuffle() {
  game.phase = 'shuffle';
  placeCenter();
  characters.forEach((c) => c.showName(true));
  rig.shot(...shots.shuffle(), 2.4);
  const n = setScreen(`
    <div class="top-title"><div class="kicker">STEP 1</div><h2>THE SHUFFLE</h2><p>Four couples. Two teams. Couples always stay together.</p></div>
    <div class="shuffle-result" id="shuffle-result"></div>
    <div class="bottom-actions">
      <button class="btn btn-play" data-act="shuffle">🎲 SHUFFLE COUPLES</button>
      <button class="btn btn-secondary hidden" data-act="lock">🔒 LOCK TEAMS</button>
    </div>
    <div class="shuffle-count" id="shuffle-count">Shuffle #${game.shuffleCount} · Six possible pairings</div>
    <button class="btn btn-ghost corner-left" data-act="menu">← Menu</button>
  `, 'screen-shuffle');
  let busy = false;
  n.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (!a || busy) return;
    sfx('click');
    if (a === 'menu') return showMenu();
    if (a === 'lock') return showReveal();
    if (a === 'shuffle') {
      busy = true;
      n.querySelector('[data-act=shuffle]').disabled = true;
      n.querySelector('[data-act=lock]').classList.add('hidden');
      n.querySelector('#shuffle-result').innerHTML = '';
      // gather in the middle, drumroll, then dash
      if (game.shuffleCount > 0) { placeCenter(); await wait(1100); }
      sfx('drumroll');
      characters.forEach((c) => c.react('surprise', 0.6));
      await wait(1700);
      G.shuffleTeams(game);
      placeTeams({ stumbles: 1 + Math.floor(Math.random() * 2) });
      sfx('whoosh');
      await wait(2300);
      sfx('fanfare');
      confetti.burst(sw(SIDE[0] * 4.4, 2.5, 0), 140);
      confetti.burst(sw(SIDE[1] * 4.4, 2.5, 0), 140);
      teamChars(0).concat(teamChars(1)).forEach((c) => c.react('cheer', 1.8));
      n.querySelector('#shuffle-result').innerHTML = [0, 1].map((t) => `
        <div class="team-chip team-${t}" style="--team:${teamColor(t)}">
          <div class="team-chip-name">${esc(teamName(t))}</div>
          <div class="team-chip-couples">${game.teams[t].map((cp) => `<span>${coupleOf(cp).map((c) => stickerImg(c, 'sm')).join('')}${esc(girlOf(cp)?.data.name)} &amp; ${esc(boyOf(cp)?.data.name)}</span>`).join('')}</div>
        </div>`).join('<div class="vs">VS</div>');
      n.querySelector('#shuffle-count').textContent = `Shuffle #${game.shuffleCount} · Six possible pairings · Couples always stay together`;
      n.querySelector('[data-act=shuffle]').innerHTML = '🎲 SHUFFLE AGAIN';
      n.querySelector('[data-act=shuffle]').disabled = false;
      n.querySelector('[data-act=lock]').classList.remove('hidden');
      busy = false;
    }
  });
}

// ------------------------------------------------------------------
// 3. TEAM REVEAL
// ------------------------------------------------------------------
async function showReveal() {
  game.phase = 'reveal';
  G.startBoard(game, config.settings);
  board.setUsed(game.used, true);
  board.setDouble(game.doubleKey);
  updateScoreboards(true);
  placeTeams({ instant: false });
  rig.shot(...shots.reveal(), 2.2);
  const n = setScreen(`
    <div class="reveal">
      ${[0, 1].map((t) => `
      <div class="reveal-team team-${t}" style="--team:${teamColor(t)}">
        <div class="reveal-name">${esc(teamName(t))}</div>
        <div class="reveal-stickers">${teamChars(t).map((c) => `<div class="reveal-person">${stickerImg(c)}<span>${esc(c.data.name)}</span></div>`).join('')}</div>
        <div class="reveal-score">0</div>
      </div>`).join('<div class="reveal-vs">VS</div>')}
    </div>
    <div class="bottom-actions"><button class="btn btn-play" data-act="go">🎯 TO THE BOARD!</button></div>
    <div class="reveal-sub">The rivalry begins…</div>
  `, 'screen-reveal');
  sfx('fanfare');
  setTimeout(() => confetti.rain(sw(0, 2, -1), 18, 260), 600);
  n.querySelector('[data-act=go]').addEventListener('click', () => {
    sfx('click');
    characters.forEach((c) => c.showName(false));
    persist();
    showBoard();
  });
}

// ------------------------------------------------------------------
// 4. BOARD
// ------------------------------------------------------------------
let boardActive = false;
let hostBarHidden = false;

function updateScoreboards(instant = false) {
  if (!characters.length) return;
  [0, 1].forEach((t) => {
    scoreboards[t].setTeam(teamName(t), teamColor(t), teamChars(t).map((c) => stickers[c.data.id]));
    scoreboards[t].setScore(game.scores[t], instant);
    scoreboards[t].setActive(game.phase === 'board' && game.turn === t);
  });
}

function teamPanel(t) {
  const canAsk = config.settings.askTheBoys;
  return `<div class="team-panel team-${t} ${game.turn === t && game.phase === 'board' ? 'active' : ''}" style="--team:${teamColor(t)}" data-team="${t}">
    <div class="tp-name">${esc(teamName(t))}</div>
    <div class="tp-score" data-score="${t}">${game.scores[t]}</div>
    <div class="tp-stickers">${teamChars(t).map((c) => stickerImg(c, 'xs')).join('')}</div>
    ${canAsk ? `<div class="tp-ask ${game.askUsed[t] ? 'used' : ''}" title="Ask the Boys">🎤 ${game.askUsed[t] ? 'hint used' : 'hint ready'}</div>` : ''}
  </div>`;
}

function hostBar(buttons) {
  return `<div class="host-bar ${hostBarHidden ? 'hidden' : ''}">${buttons.map(([act, label, key, cls = '']) => `<button class="hb ${cls}" data-act="${act}">${label}${key ? `<kbd>${key}</kbd>` : ''}</button>`).join('')}</div>`;
}

function showBoard() {
  game.phase = 'board';
  boardActive = true;
  board.clearSelection();
  board.setUsed(game.used);
  world.setParty((25 - G.remaining(game)) / 25);
  updateScoreboards();
  rig.shot(...shots.boardWide(), 1.8);
  characters.forEach((c) => { if (c.state === 'sleep') c.setState('idle'); });
  updateGloom();
  const left = G.remaining(game);
  const done = left === 0;
  const n = setScreen(`
    <div class="hud-top">
      ${teamPanel(0)}
      <div class="hud-center">
        <div class="round-chip">${done ? 'BOARD CLEARED!' : 'ROUND 1'}</div>
        <div class="turn-banner" style="--team:${teamColor(game.turn)}">${done ? '🌊 Time for the Final Splash' : `${esc(teamName(game.turn).replace(/^TEAM\s+/i, ''))} PICKS`}</div>
        <div class="remaining">${left} question${left === 1 ? '' : 's'} remaining</div>
      </div>
      ${teamPanel(1)}
    </div>
    ${done ? `<div class="bottom-actions"><button class="btn btn-play" data-act="final">${config.settings.finalSplash ? '🌊 THE FINAL SPLASH' : '🏆 SEE RESULTS'}</button></div>` : '<div class="board-hint">Click a tile to choose a question</div>'}
    ${hostBar([
      ['undo', '↶ Undo', 'Z'],
      ['adj', '± Adjust scores', ''],
      ['final', config.settings.finalSplash ? '🌊 Final Splash' : '🏆 End game', ''],
      ['menu', '⌂ Menu', ''],
    ])}
  `, 'screen-board');
  n.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (!a) return;
    sfx('click');
    if (a === 'undo') doUndo();
    if (a === 'final') { boardActive = false; config.settings.finalSplash ? showFinalIntro() : showResults(); }
    if (a === 'menu') { boardActive = false; persist(); showMenu(); }
    if (a === 'adj') showAdjust();
  });
  persist();
}

function doUndo() {
  if (game.phase !== 'board') return;
  if (G.undo(game)) {
    toast('↶ Undone!', 'small');
    board.setUsed(game.used);
    updateScoreboards();
    showBoard();
  } else toast('Nothing to undo', 'small');
}

function showAdjust() {
  const n = el(`<div class="modal-wrap"><div class="modal adjust">
    <h2>Adjust scores</h2>
    ${[0, 1].map((t) => `<div class="adj-row" style="--team:${teamColor(t)}"><span class="adj-name">${esc(teamName(t))}</span>
      <button class="btn-mini" data-t="${t}" data-d="-100">−100</button><span class="adj-score" data-s="${t}">${game.scores[t]}</span><button class="btn-mini" data-t="${t}" data-d="100">+100</button></div>`).join('')}
    <button class="btn" data-close>Done</button></div></div>`);
  n.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (b) {
      G.adjustScore(game, +b.dataset.t, +b.dataset.d);
      n.querySelector(`[data-s="${b.dataset.t}"]`).textContent = game.scores[b.dataset.t];
      updateScoreboards();
      persist();
      sfx('pop');
    }
    if (e.target === n || e.target.dataset.close !== undefined) { n.remove(); showBoard(); }
  });
  document.body.appendChild(n);
}

// pointer picking on the 3D board
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerMoved = 0;
canvas.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  if (!boardActive || game.phase !== 'board' || board.selected) return;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(board.tileMeshes(), false)[0];
  const tile = hit?.object || null;
  if (tile !== board.hovered && tile) sfx('hover');
  board.hover(tile);
  canvas.style.cursor = tile ? 'pointer' : 'default';
});
canvas.addEventListener('click', (e) => {
  if (!boardActive || game.phase !== 'board' || board.selected) return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(board.tileMeshes(), false)[0];
  if (hit) chooseTile(hit.object);
});

// ------------------------------------------------------------------
// 5. QUESTION REVEAL — five-second cinematic
// ------------------------------------------------------------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function chooseTile(tile) {
  const { c, r } = tile.userData;
  const cur = G.pickTile(game, c, r);
  if (!cur) return;
  boardActive = false;
  canvas.style.cursor = 'default';
  board.hover(null);
  board.select(tile);
  persist();
  ui.innerHTML = '';
  ui.appendChild(globalButtons());
  const cat = config.categories[c];
  const q = config.questions[c][r];
  const anim = config.settings.animations;

  // 0–1s: tile lights up, neighbours dim
  sfx('pop');
  const tileWorld = tile.getWorldPosition(new THREE.Vector3());
  const boardFwd = sw(0, 0, -1).sub(sw(0, 0, 0)).normalize();
  if (anim) rig.shot(tileWorld.clone().addScaledVector(boardFwd, 9).add(new THREE.Vector3(0, 0.6, 0)), tileWorld, 1.0, 'out');
  await wait(anim ? 1000 : 300);

  // 1–2s: camera launches into the board
  if (anim) {
    sfx('whoosh');
    await rig.shot(tileWorld.clone().addScaledVector(boardFwd, 0.6), tileWorld, 0.9, 'in');
  }

  // 2–3.5s: character moment with the category prop
  if (anim) {
    await characterMoment(cat, q, cur);
  }

  // 3.5–5s: the question card flies in
  rig.shot(...shots.boardWide(), 1.4);
  if (cur.double) await doubleTrouble();
  showQuestion();
}

async function characterMoment(cat, q, cur) {
  // Who reacts? The boy the question is about, otherwise someone from the picking team.
  let star = q.subject ? characters.find((c) => c.data.id === q.subject) : null;
  if (!star) {
    const pool = teamChars(cur.picker);
    star = cat.id === 'boys' || cat.id === 'lore' ? pool.find((c) => c.data.role === 'boy') : pool[Math.floor(Math.random() * pool.length)];
  }
  star = star || characters[0];
  const p = star.root.getWorldPosition(new THREE.Vector3());
  // Shoot from the open middle of the deck toward the character, who turns to camera.
  const local = star.root.position;
  const dir = new THREE.Vector3(-local.x * 0.8, 0, -2.4 - local.z).normalize();
  const camLocal = local.clone().addScaledVector(dir, 3.3).add(new THREE.Vector3(0, 1.75, 0));
  const camPos = sw(camLocal.x, camLocal.y, camLocal.z);
  const look = p.clone().add(new THREE.Vector3(0, 1.3, 0));
  const toCam = camPos.clone().sub(p).setY(0).normalize();
  const prevFacing = star.targetFacing;
  star.faceTowards(camLocal.x, camLocal.z);
  setTimeout(() => { if (star.state !== 'walk') star.targetFacing = prevFacing; }, 3200);

  if (cat.transition === 'dive') {
    // camera dives to the water beside the hull and pops back up
    const water = sw(9, 0, -6);
    water.y = 0.3;
    rig.cut(water.clone().add(new THREE.Vector3(6, 7, -8)), water);
    sfx('whoosh');
    await rig.shot(water.clone().add(new THREE.Vector3(1.5, 0.4, -2)), water, 0.6, 'in');
    sfx('splash');
    splash.burst(water.clone(), 140);
    const prop = makeCategoryProp('dive');
    prop.group.position.copy(water).add(new THREE.Vector3(0, 0.05, 0));
    addProp(prop);
    rig.shake(0.5);
    await wait(300);
    rig.shot(camPos, look, 0.6, 'out');
    star.react(q.subject ? 'point' : 'surprise', 1.6);
    await wait(650);
    return;
  }

  rig.cut(camPos.clone().add(new THREE.Vector3(0, 0.6, 0)).addScaledVector(toCam, 1.5), look);
  rig.shot(camPos, look, 1.4, 'out');
  const prop = makeCategoryProp(cat.transition, cat.color);
  const side = new THREE.Vector3(-toCam.z, 0, toCam.x).multiplyScalar(local.x > 0 ? -1 : 1);
  const propPos = p.clone().addScaledVector(toCam, 1.4).addScaledVector(side, 1.0).add(new THREE.Vector3(0, 1.3, 0));
  prop.group.position.copy(propPos);
  prop.group.lookAt(camPos.x, propPos.y, camPos.z);
  prop.group.scale.setScalar(0.6);
  addProp(prop);
  const soundFor = { album: 'page', chest: 'chest', heart: 'heart', wheel: 'wheel' };
  sfx(soundFor[cat.transition] || 'pop');
  const reaction = q.subject ? 'point' : q.funny ? 'laugh' : ['surprise', 'cheer', 'point'][Math.floor(Math.random() * 3)];
  star.react(reaction, 1.8);
  if (q.subject) star.showEmote('point', 1.5);
  await wait(1500);
}

function addProp(prop) {
  prop.t = 0;
  scene.add(prop.group);
  props.push(prop);
}

async function doubleTrouble() {
  sfx('double');
  rig.shake(0.35);
  const n = el(`<div class="double-trouble"><div class="dt-inner"><div class="dt-small">✨ SURPRISE ✨</div><div class="dt-big">DOUBLE TROUBLE!</div><div class="dt-small">This question is worth DOUBLE points</div></div></div>`);
  document.body.appendChild(n);
  characters.forEach((c) => c.react('surprise', 1));
  confetti.burst(sw(0, 7, 4), 160, { up: 6 });
  await wait(2300);
  n.classList.add('out');
  setTimeout(() => n.remove(), 500);
}

// ------------------------------------------------------------------
// 6. QUESTION SCREEN + host scoring
// ------------------------------------------------------------------
let timer = null;
let qScreen = null;
let sleepyTimeout = null;

function startTimer(seconds) {
  stopTimer();
  timer = { left: seconds, total: seconds, paused: false, last: performance.now(), lastTick: Math.ceil(seconds) };
  const tick = () => {
    if (!timer) return;
    const now = performance.now();
    if (!timer.paused) timer.left = Math.max(0, timer.left - (now - timer.last) / 1000);
    timer.last = now;
    renderTimer();
    const whole = Math.ceil(timer.left);
    if (whole !== timer.lastTick) {
      timer.lastTick = whole;
      if (whole <= 5 && whole > 0) sfx('tick');
      if (whole === 0) {
        sfx('timesup');
        qScreen?.querySelector('.q-timer')?.classList.add('done');
        toast("⏰ TIME'S UP!", 'warn', 1400);
      }
    }
    if (timer.left > 0 || timer.paused) timer.raf = requestAnimationFrame(tick);
  };
  timer.raf = requestAnimationFrame(tick);
}
function stopTimer() {
  if (timer?.raf) cancelAnimationFrame(timer.raf);
  timer = null;
}
function renderTimer() {
  const t = qScreen?.querySelector('.q-timer');
  if (!t || !timer) return;
  const s = Math.ceil(timer.left);
  t.querySelector('.q-timer-num').textContent = `00:${String(s).padStart(2, '0')}`.slice(-5);
  t.style.setProperty('--p', timer.left / timer.total);
  t.classList.toggle('urgent', s <= 5);
  t.classList.toggle('paused', timer.paused);
}

async function showQuestion() {
  const cur = game.current;
  const cat = config.categories[cur.c];
  const q = config.questions[cur.c][cur.r];
  const imgURL = q.image ? await mediaURL(q.image) : null;
  const format = imgURL ? q.format || 'image' : 'text';
  const subject = q.subject ? characters.find((c) => c.data.id === q.subject) : null;
  qScreen = setScreen(`
    <div class="q-backdrop"></div>
    <div class="hud-top slim">${teamPanel(0)}<div class="hud-center"></div>${teamPanel(1)}</div>
    <div class="q-card fmt-${format} ${cur.double ? 'is-double' : ''}" style="--cat:${cat.color}">
      <div class="q-head">
        <span class="q-chip">${esc(cat.icon)} ${esc(cat.name)}</span>
        <span class="q-chip q-points">${cur.points} POINTS${cur.double ? ' · ×2' : ''}</span>
        <span class="q-timer"><span class="q-timer-num">00:${String(config.settings.timer).padStart(2, '0')}</span></span>
      </div>
      ${imgURL ? `<div class="q-image"><img src="${imgURL}" alt=""></div>` : ''}
      ${format !== 'imageOnly' || !imgURL ? `<h1 class="q-title">${esc(q.title)}</h1>` : ''}
      ${subject ? `<div class="q-subject">${stickerImg(subject, 'sm')} This one's about <b>${esc(subject.data.name)}</b></div>` : ''}
      <div class="q-answering" style="--team:${teamColor(cur.answering)}"><span>${esc(teamName(cur.answering))}</span> answers!</div>
      <div class="q-answer hidden"><div class="q-answer-label">ANSWER</div><div class="q-answer-text">${esc(q.answer)}</div>${q.explanation ? `<div class="q-explain">${esc(q.explanation)}</div>` : ''}</div>
    </div>
    ${hostBar([
      ['reveal', '👁 Reveal answer', 'Space'],
      ['correct', '✔ Correct', 'C', 'good'],
      ['wrong', '✘ Wrong', 'X', 'bad'],
      ['skip', '⤼ No answer', 'N'],
      ...(config.settings.askTheBoys ? [['ask', '🎤 Ask the Boys', 'B']] : []),
      ['pause', '⏯ Pause', 'P'],
      ['back', '← Back', 'Esc'],
    ])}
  `, 'screen-question');
  qScreen.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a) questionAction(a);
  });
  startTimer(config.settings.timer);
  // boys react when a question about them appears
  if (subject) { subject.react('surprise', 1.2); setTimeout(() => subject.react(q.funny ? 'laugh' : 'point', 2), 1200); }
  if (q.funny) teamChars(1 - cur.answering).filter((c) => c !== subject).slice(0, 2).forEach((c) => setTimeout(() => c.react('laugh', 2), 600 + Math.random() * 800));
  // someone gets sleepy on a long question
  clearTimeout(sleepyTimeout);
  sleepyTimeout = setTimeout(() => {
    if (game.phase !== 'question') return;
    const pool = characters.filter((c) => c.state === 'idle' && c !== subject);
    const sleepy = pool[Math.floor(Math.random() * pool.length)];
    sleepy?.setState('sleep', 30);
  }, Math.max(8000, config.settings.timer * 1000 * 0.55));
}

function revealAnswer(force = null) {
  const a = qScreen?.querySelector('.q-answer');
  if (!a) return;
  const show = force ?? a.classList.contains('hidden');
  a.classList.toggle('hidden', !show);
  if (show) sfx('sparkle');
}

let resolving = false;
async function questionAction(a) {
  const cur = game.current;
  if (!cur || resolving) return;
  sfx('click');
  if (a === 'reveal') return revealAnswer();
  if (a === 'pause' && timer) { timer.paused = !timer.paused; if (!timer.paused) startTimer(timer.left); else renderTimer(); return; }
  if (a === 'ask') return askTheBoys();
  if (a === 'back') {
    if (cur.stolen) return toast('Score this one first!', 'small');
    stopTimer();
    G.cancelQuestion(game);
    clearTimeout(sleepyTimeout);
    return showBoard();
  }
  const before = [...game.scores];
  if (a === 'correct') {
    resolving = true;
    const res = G.markCorrect(game);
    stopTimer();
    revealAnswer(true);
    persist();
    await reactCorrect(res.team, res.delta, before);
    resolving = false;
    return endQuestion();
  }
  if (a === 'wrong') {
    resolving = true;
    const res = G.markWrong(game, config.settings);
    persist();
    reactWrong(res.team, res.delta);
    if (res.steal) {
      sfx('boing');
      toast(`🏴‍☠️ STEAL!<small>${esc(teamName(1 - res.team))} can answer!</small>`, 'steal', 2000);
      const q = qScreen.querySelector('.q-answering');
      q.style.setProperty('--team', teamColor(cur.answering));
      q.innerHTML = `<span>${esc(teamName(cur.answering))}</span> can STEAL!`;
      q.classList.add('steal');
      refreshTeamPanels();
      startTimer(Math.max(10, Math.round(config.settings.timer / 2)));
      resolving = false;
      return;
    }
    stopTimer();
    revealAnswer(true);
    refreshTeamPanels();
    await wait(2600);
    resolving = false;
    return endQuestion();
  }
  if (a === 'skip') {
    resolving = true;
    G.skipQuestion(game);
    stopTimer();
    revealAnswer(true);
    sfx('thud');
    characters.forEach((c) => Math.random() < 0.4 && c.react('sad', 1.5));
    await wait(2200);
    resolving = false;
    return endQuestion();
  }
}

function refreshTeamPanels() {
  if (!qScreen) return;
  [0, 1].forEach((t) => {
    const old = qScreen.querySelector(`.team-panel[data-team="${t}"]`);
    if (old) old.replaceWith(el(teamPanel(t)));
  });
  updateScoreboards();
}

function askTheBoys() {
  const team = game.current.answering;
  if (!G.useAskTheBoys(game, team)) return toast(`${esc(teamName(team))} already used their hint!`, 'small');
  persist();
  sfx('fanfare');
  const boys = teamChars(team).filter((c) => c.data.role === 'boy');
  boys.forEach((b) => { b.react('point', 3); b.showEmote('think', 3); });
  toast(`🎤 ASK THE BOYS!<br><small>${esc(teamName(team))} may ask ONE boy for a cryptic clue (no giving it away!)</small>`, 'ask', 3500);
  if (timer) { timer.left = Math.min(timer.total, timer.left + 10); }
  refreshTeamPanels();
}

async function reactCorrect(team, delta, before) {
  sfx('correct');
  const tc = teamChars(team);
  tc.forEach((c, i) => setTimeout(() => c.react('cheer', 2.2), i * 80));
  teamChars(1 - team).forEach((c) => Math.random() < 0.5 && c.react('sad', 1.6));
  confetti.burst(sw(SIDE[team] * 4.4, 2.8, 0), 220);
  toast(`<div class="pts" style="--team:${teamColor(team)}">+${delta}</div><div>${esc(teamName(team))}!</div>`, 'score', 1800);
  stickerMood(team, 'jump');
  refreshTeamPanels();
  checkSwing(before);
  await wait(2400);
}

function reactWrong(team, delta) {
  sfx('wrong');
  teamChars(team).forEach((c, i) => setTimeout(() => c.react(i % 3 === 0 ? 'surprise' : 'sad', 2), i * 90));
  teamChars(1 - team).filter((c) => c.data.role === 'boy').forEach((c) => Math.random() < 0.6 && c.react('laugh', 1.8));
  stickerMood(team, 'cry');
  if (delta) toast(`<div class="pts neg">${delta}</div><div>${esc(teamName(team))}</div>`, 'score', 1600);
}

function stickerMood(team, mood) {
  document.querySelectorAll(`.team-panel[data-team="${team}"] .sticker`).forEach((s, i) => {
    s.classList.remove('jump', 'cry');
    void s.offsetWidth;
    s.style.animationDelay = `${i * 0.07}s`;
    s.classList.add(mood);
  });
}

function checkSwing(before) {
  const leadBefore = Math.sign(before[0] - before[1]);
  const leadAfter = Math.sign(game.scores[0] - game.scores[1]);
  const swing = Math.abs((game.scores[0] - game.scores[1]) - (before[0] - before[1]));
  if ((leadBefore !== 0 && leadAfter !== 0 && leadBefore !== leadAfter) || swing >= 800) {
    setTimeout(() => {
      rig.shake(0.6);
      sfx('boing');
      characters.forEach((c) => c.state === 'idle' && c.react('surprise', 1.2));
      toast('😱 WHAT A SWING!', 'swing', 1600);
    }, 900);
  }
}

function endQuestion() {
  clearTimeout(sleepyTimeout);
  characters.forEach((c) => { if (c.state === 'sleep') { c.setState('surprise', 0.8); } });
  G.finishQuestion(game);
  persist();
  qScreen = null;
  showBoard();
}

// The trailing team gets a little rain cloud (Jackbox-style teasing)
function updateGloom() {
  const diff = game.scores[0] - game.scores[1];
  const loser = Math.abs(diff) >= 600 ? (diff > 0 ? 1 : 0) : -1;
  gloomClouds.forEach((g) => world.stage.remove(g));
  gloomClouds = [];
  if (loser < 0 || game.phase !== 'board') return;
  const cloud = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#7d7f96', roughness: 1 });
  [[0, 0, 0.55], [0.55, -0.05, 0.42], [-0.55, -0.05, 0.42], [0.25, 0.25, 0.4]].forEach(([x, y, r]) => {
    const p = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
    p.position.set(x, y, 0);
    cloud.add(p);
  });
  const drops = [];
  for (let i = 0; i < 10; i++) {
    const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.14, 2, 4), new THREE.MeshBasicMaterial({ color: '#7cc6ff' }));
    d.position.set((Math.random() - 0.5) * 1.2, -Math.random() * 1.5, (Math.random() - 0.5) * 0.4);
    cloud.add(d);
    drops.push(d);
  }
  cloud.userData.drops = drops;
  cloud.position.set(SIDE[loser] * 4.4, 2.9, -0.2);
  world.stage.add(cloud);
  gloomClouds.push(cloud);
}

// ------------------------------------------------------------------
// 8b. THE FINAL SPLASH
// ------------------------------------------------------------------
async function showFinalIntro() {
  boardActive = false;
  G.startFinal(game);
  persist();
  world.setParty(1);
  const water = sw(0, 0, -11);
  water.y = 0.3;
  rig.shot(water.clone().add(new THREE.Vector3(4, 2.5, -9)), water.clone().add(new THREE.Vector3(0, 2, 0)), 1.6);
  setTimeout(() => { sfx('splash'); splash.burst(water, 160); rig.shake(0.5); }, 1300);
  const n = setScreen(`
    <div class="final-intro">
      <div class="kicker">ONE LAST QUESTION</div>
      <h1 class="final-title">THE FINAL SPLASH</h1>
      <p>Both teams secretly wager points. Then everyone answers at the same time.</p>
    </div>
    <div class="bottom-actions"><button class="btn btn-play" data-act="wager">💰 PLACE WAGERS</button></div>
  `, 'screen-final');
  sfx('fanfare');
  n.querySelector('[data-act=wager]').addEventListener('click', () => { sfx('click'); showWagers(); });
}

function showWagers() {
  game.final.stage = 'wager';
  rig.shot(...shots.boardWide(), 1.5);
  const n = setScreen(`
    <div class="top-title"><h2>SECRET WAGERS</h2><p>Each team types a wager (up to their score) while the other team looks away 🙈</p></div>
    <div class="wagers">
      ${[0, 1].map((t) => `
      <div class="wager-card" style="--team:${teamColor(t)}" data-team="${t}">
        <div class="wc-name">${esc(teamName(t))}</div>
        <div class="wc-score">Score: ${game.scores[t]} · Max wager: ${G.maxWager(game, t)}</div>
        <input type="password" inputmode="numeric" class="wc-input" placeholder="0" maxlength="6">
        <button class="btn btn-secondary" data-lock="${t}">🔒 Lock wager</button>
        <div class="wc-locked hidden">🔒 LOCKED IN</div>
      </div>`).join('')}
    </div>
    <div class="bottom-actions"><button class="btn btn-play" data-act="go" disabled>🌊 SHOW THE QUESTION</button></div>
  `, 'screen-final');
  n.addEventListener('click', (e) => {
    const lock = e.target.closest('[data-lock]');
    if (lock) {
      const t = +lock.dataset.lock;
      const card = n.querySelector(`.wager-card[data-team="${t}"]`);
      G.setWager(game, t, parseInt(card.querySelector('input').value, 10));
      card.querySelector('input').disabled = true;
      lock.classList.add('hidden');
      card.querySelector('.wc-locked').classList.remove('hidden');
      card.classList.add('locked');
      sfx('pop');
      persist();
      if (game.final.wagers.every((w) => w !== null)) n.querySelector('[data-act=go]').disabled = false;
    }
    if (e.target.closest('[data-act=go]')) { sfx('click'); showFinalQuestion(); }
  });
}

async function showFinalQuestion() {
  game.final.stage = 'question';
  persist();
  const q = config.final;
  const imgURL = q.image ? await mediaURL(q.image) : null;
  sfx('whoosh');
  qScreen = setScreen(`
    <div class="q-backdrop"></div>
    <div class="q-card final fmt-${imgURL ? 'image' : 'text'}" style="--cat:#0ea5b7">
      <div class="q-head">
        <span class="q-chip">🌊 THE FINAL SPLASH</span>
        <span class="q-timer"><span class="q-timer-num">00:${String(config.settings.timer).padStart(2, '0')}</span></span>
      </div>
      ${imgURL ? `<div class="q-image"><img src="${imgURL}" alt=""></div>` : ''}
      <h1 class="q-title">${esc(q.title)}</h1>
      <div class="q-answering">Both teams write down an answer!</div>
      <div class="q-answer hidden"><div class="q-answer-label">ANSWER</div><div class="q-answer-text">${esc(q.answer)}</div></div>
      <div class="final-judge hidden">
        ${[0, 1].map((t) => `<div class="fj-row" style="--team:${teamColor(t)}" data-team="${t}"><span class="fj-name">${esc(teamName(t))}</span><span class="fj-wager">wagered ${game.final.wagers[t]}</span>
          <button class="btn-mini good" data-res="1" data-t="${t}">✔ Right</button><button class="btn-mini bad" data-res="0" data-t="${t}">✘ Wrong</button></div>`).join('')}
      </div>
    </div>
    ${hostBar([['freveal', '👁 Reveal answer', 'Space'], ['pause', '⏯ Pause', 'P']])}
  `, 'screen-question');
  startTimer(config.settings.timer);
  qScreen.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'freveal') finalReveal();
    if (a === 'pause' && timer) { timer.paused = !timer.paused; if (!timer.paused) startTimer(timer.left); }
    const r = e.target.closest('[data-res]');
    if (r) {
      const t = +r.dataset.t;
      const correct = r.dataset.res === '1';
      G.resolveFinal(game, t, correct);
      persist();
      const row = r.closest('.fj-row');
      row.innerHTML = `<span class="fj-name">${esc(teamName(t))}</span><span class="fj-result ${correct ? 'good' : 'bad'}">${correct ? '+' : '−'}${game.final.wagers[t]}</span>`;
      updateScoreboards();
      if (correct) reactCorrect(t, game.final.wagers[t], [...game.scores]); else reactWrong(t, -game.final.wagers[t]);
      if (game.final.results.every((x) => x !== null)) {
        await wait(2600);
        game.finalDone = true;
        showResults();
      }
    }
  });
}

function finalReveal() {
  stopTimer();
  revealAnswer(true);
  qScreen?.querySelector('.final-judge')?.classList.remove('hidden');
}

// ------------------------------------------------------------------
// 8. FINAL RESULTS — Yacht champions
// ------------------------------------------------------------------
function showResults() {
  stopTimer();
  game.phase = 'results';
  clearGame();
  world.setParty(1);
  gloomClouds.forEach((g) => world.stage.remove(g));
  gloomClouds = [];
  const w = G.winner(game);
  const winners = w >= 0 ? teamChars(w) : characters;
  const losers = w >= 0 ? teamChars(1 - w) : [];
  winners.forEach((c, i) => {
    const x = (i - (winners.length - 1) / 2) * 1.3;
    c.moveTo(x, -0.6, { face: Math.PI, delay: i * 0.1, speed: 5 });
  });
  losers.forEach((c, i) => {
    const s = i < 2 ? 1 : -1;
    c.moveTo(s * (6.0 + (i % 2) * 1.0), 0.9 - (i % 2) * 1.4, { face: Math.PI - s * 0.5, delay: 0.3 });
  });
  setTimeout(() => {
    winners.forEach((c) => c.react('dance', 999));
    losers.forEach((c) => c.react('sad', 999));
  }, 1700);
  sfx('fanfare');
  setTimeout(() => sfx('fanfare'), 1500);
  const rainFn = () => { if (game.phase === 'results') { confetti.rain(sw(0, 2, -0.5), 14, 120); confetti.burst(sw((Math.random() - 0.5) * 6, 1.5, -0.6), 90); setTimeout(rainFn, 1600); } };
  setTimeout(rainFn, 1200);
  rig.shot(sw(0, 4.4, -7.6), sw(0, 1.5, -0.6), 2);
  // gentle side-to-side swing in front of the dancers (a full orbit would pass through the board)
  setTimeout(() => { if (game.phase === 'results') rig.startOrbit(sw(0, 0, -0.6), 7, 4.4, 0.5, null, new THREE.Vector3(0, 1.5, 0), 0.6); }, 2100);
  const n = setScreen(`
    <div class="results">
      <div class="kicker">${w >= 0 ? '🏆 YACHT CHAMPIONS 🏆' : '🤝 IT’S A TIE! 🤝'}</div>
      <h1 class="champ" style="--team:${w >= 0 ? teamColor(w) : '#ffb020'}">${w >= 0 ? esc(teamName(w)) : 'EVERYBODY WINS'}</h1>
      <div class="champ-stickers">${winners.map((c) => stickerImg(c, 'lg dance')).join('')}</div>
      <div class="final-scores">${[0, 1].map((t) => `<div class="fs" style="--team:${teamColor(t)}"><span>${esc(teamName(t))}</span><b>${game.scores[t]}</b></div>`).join('')}</div>
    </div>
    <div class="bottom-actions">
      <button class="btn btn-play" data-act="again">🔁 PLAY AGAIN</button>
      <button class="btn btn-ghost" data-act="menu">⌂ Main menu</button>
    </div>
  `, 'screen-results');
  n.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (!a) return;
    sfx('click');
    characters.forEach((c) => c.setState('idle'));
    if (a === 'again') { game = G.newGame(); showShuffle(); }
    if (a === 'menu') { game = G.newGame(); showMenu(); }
  });
}

// ------------------------------------------------------------------
// Keyboard (host controls)
// ------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select') || document.querySelector('.admin')) return;
  const k = e.key.toLowerCase();
  if (k === 'f') toggleFullscreen();
  if (k === '?' || (k === '/' && e.shiftKey)) toggleHelp();
  if (k === 'h') {
    hostBarHidden = !hostBarHidden;
    document.querySelectorAll('.host-bar').forEach((b) => b.classList.toggle('hidden', hostBarHidden));
  }
  if (game.phase === 'board' && k === 'z') doUndo();
  if (game.phase === 'question' && qScreen) {
    const map = { ' ': 'reveal', c: 'correct', x: 'wrong', n: 'skip', b: 'ask', p: 'pause', escape: 'back' };
    if (map[k]) { e.preventDefault(); questionAction(map[k]); }
  }
  if (game.phase === 'final' && game.final?.stage === 'question' && qScreen) {
    if (k === ' ') { e.preventDefault(); finalReveal(); }
    if (k === 'p' && timer) { timer.paused = !timer.paused; if (!timer.paused) startTimer(timer.left); }
  }
});

// ------------------------------------------------------------------
// Main loop
// ------------------------------------------------------------------
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  world.update(dt);
  for (const c of characters) c.update(dt);
  props = props.filter((p) => {
    p.t += dt;
    const alive = p.update(p.t, dt);
    if (!alive) scene.remove(p.group);
    return alive;
  });
  gloomClouds.forEach((g) => {
    g.position.y = 2.9 + Math.sin(world.clock * 2) * 0.08;
    g.userData.drops.forEach((d) => { d.position.y -= dt * 3; if (d.position.y < -1.6) d.position.y = -0.2; });
  });
  confetti.update(dt);
  splash.update(dt);
  rig.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  // keep the board framed on portrait / narrow screens
  camera.fov = camera.aspect < 1.2 ? 60 : 42;
  rig.fovTarget = camera.fov;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.dispatchEvent(new Event('resize'));

// Debug handle for the host's console
window.yct = { THREE, world, rig, characters: () => characters, game: () => game, board };

loop();
init();
