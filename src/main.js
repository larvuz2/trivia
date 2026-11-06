import * as THREE from 'three';
import { World } from './world.js';
import { Character, defaultSticker, roundRect } from './characters.js';
import { Confetti, Splash, makeCategoryProp } from './fx.js';
import { CameraRig } from './camera.js';
import { sfx, unlockAudio, startMusic, setAudioEnabled, setMusicState } from './audio.js';
import { IntroDirector } from './intro.js';
import { ExploreMode } from './explore.js';
import { loadConfig, saveConfig, loadGame, saveGame, clearGame, mediaURL, loadCloudConfig } from './storage.js';
import * as G from './game.js';
import { POINTS, builtinModel } from './data.js';
import { openAdmin } from './admin.js';
import { loadSeaOfCortez } from './environment.js';

// ------------------------------------------------------------------
// Renderer & world
// ------------------------------------------------------------------
const canvas = document.getElementById('scene');
const ui = document.getElementById('ui');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 7000);
camera.position.set(120, 60, -140);
const world = new World(renderer);
const scene = world.scene;
const rig = new CameraRig(camera);
const confetti = new Confetti(scene);
const splash = new Splash(scene);

let config = loadConfig();
let game = G.newGame();
const savedGame = loadGame();
let stickers = {}; // character id -> url
let characters = [];
let props = [];
let env = null; // Sea of Cortez scenery (Blender assets)
let startLabel = null;
let guests = []; // boys popped in next to the player (subject / ask the boys)
let dj = null; // DJ (not a player) — spins at the booth from the cinematic onwards
let director = null; // opening cinematic + character introductions
let explore = null; // walk around the yacht with physics

// Team 0 is shown on the left. From the stern camera, screen-left is +X in stage space.
const SIDE = [1, -1];

const sw = (x, y, z) => world.stage.localToWorld(new THREE.Vector3(x, y, z));
const spots = () => world.layout.spots;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const wide = () => window.innerWidth >= 900;

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
  setLoad(0.05, 'Chilling the champagne…');
  try {
    await Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('20px "Fredoka"')]);
  } catch { /* fonts optional */ }
  // shared setup (questions, photos, characters) saved on Netlify — falls back to this device's copy
  const cloudCfg = await loadCloudConfig();
  if (cloudCfg) config = cloudCfg;
  setLoad(0.1, 'Sailing the party yacht into La Paz…');
  try {
    await world.loadYacht('models/yacht.glb', (p) => setLoad(0.1 + p * 0.6));
  } catch (e) {
    console.warn('Yacht model failed to load, using fallback', e);
    world.buildFallbackYacht();
  }
  setLoad(0.75, 'Painting the Sea of Cortez…');
  try {
    env = await loadSeaOfCortez(world, (p) => setLoad(0.75 + p * 0.15));
    env.addHullFoam(world.yachtModel);
  } catch (e) {
    console.warn('Sea of Cortez scenery failed to load, using simple islands', e);
    world.buildBaja();
  }
  setLoad(0.92, 'Turning on the dance floor…');
  buildCharacters();
  buildStartLabel();
  explore = new ExploreMode({
    world,
    rig,
    camera,
    canvas,
    splash,
    characters: () => characters,
    onExit: () => showMenu(),
  });
  director = new IntroDirector({
    world,
    env: () => env,
    rig,
    camera,
    confetti,
    characters: () => characters,
    dj: () => dj,
    sticker: (ch) => stickers[ch.data.id],
    onFinished: () => { characters.forEach((c) => c.pop(true)); world.setParty(0.3); showTeams(); },
  });
  await refreshStickers();
  applySettings();
  setLoad(1, 'All aboard!');
  document.getElementById('loading').classList.add('done');
  setTimeout(() => document.getElementById('loading')?.remove(), 900);
  showMenu(true);
}

function buildCharacters() {
  for (const c of characters) world.stage.remove(c.root);
  characters = config.characters.map((d, i) => {
    const ch = new Character(d, i);
    world.stage.add(ch.root);
    return ch;
  });
  hangOut(true);
  buildDJ();
  characters.forEach(async (ch) => {
    if (!ch.data.model) ch.builtinSrc = builtinModel(ch.data.name);
    const url = ch.data.model ? await mediaURL(ch.data.model) : ch.builtinSrc;
    if (url) {
      try { await ch.loadModel(url); } catch (e) { console.warn('model load failed', e); }
    }
  });
}

function buildDJ() {
  if (dj) world.stage.remove(dj.root);
  dj = new Character({ id: 'dj', name: 'DJ Marea', role: 'boy', couple: -1, color: '#2a2f4a' }, 8);
  // headphones
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.49, 0.045, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: '#1b1d26', roughness: 0.4 }));
  band.position.y = 0.05;
  dj.head.add(band);
  for (const sgn of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 16), new THREE.MeshStandardMaterial({ color: '#ff4fb0', emissive: '#ff4fb0', emissiveIntensity: 0.6 }));
    cup.rotation.z = Math.PI / 2;
    cup.position.set(sgn * 0.48, 0.02, 0);
    dj.head.add(cup);
  }
  world.stage.add(dj.root);
  const d = spots().dj[0];
  dj.place(d[0], d[1], Math.PI, 'dj');
  dj.root.position.y = 0.42; // on a little riser so he shows over the decks
  dj.pop(false, true);
}

async function refreshStickers() {
  stickers = {};
  await Promise.all(config.characters.map(async (c, i) => {
    stickers[c.id] = (c.sticker && (await mediaURL(c.sticker))) || defaultSticker(c, i);
  }));
}

function applySettings() {
  setAudioEnabled({ sound: config.settings.sound, music: config.settings.music });
}

// floating "START GAME" sign above the pedestal
function buildStartLabel() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 200;
  const g = c.getContext('2d');
  g.fillStyle = '#ff7a45';
  roundRect(g, 10, 20, 620, 150, 75);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = '#fff4e0';
  g.stroke();
  g.font = '92px "Lilita One", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillText('START GAME', 324, 104);
  g.fillStyle = '#fff';
  g.fillText('START GAME', 320, 98);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  startLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  startLabel.scale.set(2.9, 0.9, 1);
  startLabel.renderOrder = 30;
  const [x, z] = spots().start;
  startLabel.position.set(x, 2.15, z);
  startLabel.userData.base = startLabel.position.y;
  world.stage.add(startLabel);
}

// ------------------------------------------------------------------
// Characters on deck
// ------------------------------------------------------------------
const coupleOf = (i) => characters.filter((c) => c.data.couple === i);
const girlOf = (couple) => characters.find((c) => c.data.couple === couple && c.data.role === 'girl');
const boyOf = (couple) => characters.find((c) => c.data.couple === couple && c.data.role === 'boy');
const teamChars = (t) => game.teams[t].flatMap((cp) => coupleOf(cp));
const teamName = (t) => config.settings.teamNames[t];
const teamColor = (t) => config.settings.teamColors[t];
const activeGirl = (t) => girlOf(G.activeCouple(game, t)) || teamChars(t)[0];

/** Everyone hanging out on deck: standing in an arc around center stage, all facing it. */
function hangOutPlan() {
  const [sx, sz] = spots().start;
  const R = 3.2;
  // couples side by side, alternating around the arc behind the pedestal (so they face the game camera)
  const order = [0, 1, 2, 3].flatMap((cp) => [girlOf(cp), boyOf(cp)]);
  return order.map((ch, i) => {
    const th = ((i - 3.5) / 3.5) * 1.3; // -75deg .. +75deg, all behind the pedestal (+z)
    const x = sx + Math.sin(th) * R;
    const z = sz + Math.cos(th) * R;
    return [ch, x, z, Math.atan2(sx - x, sz - z), 'idle'];
  }).filter((p) => p[0]);
}

function hangOut(instant = false) {
  for (const [ch, x, z, f, pose, seat] of hangOutPlan()) {
    ch.pop(true, instant);
    if (instant) ch.place(x, z, f, pose, seat);
    else ch.moveTo(x, z, { face: f, then: pose, seatY: seat, delay: Math.random() * 0.4, speed: 4.5 });
  }
}

function teamSpot(team, k, role) {
  const list = spots().team[team];
  return list[(role === 'girl' ? 0 : 2) + k];
}

function placeTeams({ instant = false, stumbles = 0 } = {}) {
  const runners = [];
  game.teams.forEach((couples, t) => {
    couples.forEach((cp, k) => {
      for (const ch of coupleOf(cp)) {
        const [x, z] = teamSpot(t, k, ch.data.role);
        const f = Math.PI + SIDE[t] * 0.25;
        ch.pop(true, instant);
        if (instant) ch.place(x, z, f);
        else runners.push([ch, x, z, f]);
      }
    });
  });
  const stumblers = new Set();
  while (stumblers.size < Math.min(stumbles, runners.length)) stumblers.add(Math.floor(Math.random() * runners.length));
  runners.forEach(([ch, x, z, f], i) => ch.moveTo(x, z, { face: f, stumble: stumblers.has(i), delay: Math.random() * 0.35, speed: 5 + Math.random() * 1.5 }));
}

function showOnly(list) {
  const keep = new Set(list);
  for (const c of characters) c.pop(keep.has(c));
}

function showAll() { characters.forEach((c) => c.pop(true)); }

// ------------------------------------------------------------------
// Camera shots (stage space)
// ------------------------------------------------------------------
const shots = {
  team: () => [sw(0, 6.6, -14.5), sw(0, 1.0, -2.6)],
  reveal: () => [sw(0, 9, -17.5), sw(0, 1.2, -2.6)],
};

function menuOrbit() {
  rig.setShift(0);
  rig.startOrbit(sw(0, 1.2, -1.0), 19, 8.5, 0.22, Math.PI + 0.5, new THREE.Vector3(0, 0.6, 0), 0.75);
}

/** Frame the player standing on the turn spot. mode: 'close' (centered) or 'board' (left third, panel on the right). */
function turnShot(ch, mode = 'close', dur = 1.4) {
  const p = ch.root.position;
  const dir = new THREE.Vector3(-0.9, 0, 4.4).normalize();
  const dist = mode === 'close' ? 4.4 : 6.2;
  const camLocal = p.clone().addScaledVector(dir, dist).add(new THREE.Vector3(0, mode === 'close' ? 1.7 : 2.0, 0));
  rig.setShift(mode === 'board' && wide() ? 0.33 : 0);
  ch.faceTowards(camLocal.x, camLocal.z);
  return rig.shot(sw(camLocal.x, camLocal.y, camLocal.z), sw(p.x, mode === 'close' ? 1.25 : 1.15, p.z), dur);
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
    <button class="icon-btn ${s.music ? '' : 'off'}" data-act="music" title="Music">🎵</button>
    <button class="icon-btn" data-act="fs" title="Fullscreen (F)">⛶</button>
    <button class="icon-btn" data-act="help" title="Host shortcuts (?)">?</button>
  </div>`);
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
      <tr><td><kbd>Enter</kbd></td><td>Start the game (main menu)</td></tr>
      <tr><td><kbd>Space</kbd></td><td>Reveal / hide answer · skip the "turn" intro</td></tr>
      <tr><td><kbd>C</kbd></td><td>Correct — award points</td></tr>
      <tr><td><kbd>X</kbd></td><td>Wrong (opens a steal if enabled)</td></tr>
      <tr><td><kbd>N</kbd></td><td>No answer — skip question</td></tr>
      <tr><td><kbd>B</kbd></td><td>Ask the Boys (once per team)</td></tr>
      <tr><td><kbd>P</kbd></td><td>Pause / resume the timer</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Back to the board (tile not used)</td></tr>
      <tr><td><kbd>Z</kbd></td><td>Undo the last question (on the board)</td></tr>
      <tr><td><kbd>F</kbd></td><td>Fullscreen</td></tr>
      <tr><td><kbd>H</kbd></td><td>Hide / show the host bar</td></tr>
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
  if (['menu', 'intro', 'shuffle', 'results'].includes(game.phase)) return;
  saveGame(game);
}

let hostBarHidden = false;
function hostBar(buttons) {
  return `<div class="host-bar ${hostBarHidden ? 'hidden' : ''}">${buttons.map(([act, label, key, cls = '']) => `<button class="hb ${cls}" data-act="${act}">${label}${key ? `<kbd>${key}</kbd>` : ''}</button>`).join('')}</div>`;
}

function teamChip(t, { compact = false } = {}) {
  const active = game.current ? game.current.answering === t : game.turn === t;
  return `<div class="team-chip2 ${active ? 'active' : ''} ${compact ? 'compact' : ''}" style="--team:${teamColor(t)}" data-team="${t}">
    <div class="tc-name">${esc(teamName(t))}</div>
    <div class="tc-score" data-score="${t}">${game.scores[t]}</div>
    <div class="tc-stickers">${teamChars(t).map((c) => stickerImg(c, 'xs')).join('')}</div>
    ${config.settings.askTheBoys && !compact ? `<div class="tc-ask ${game.askUsed[t] ? 'used' : ''}">🎤 ${game.askUsed[t] ? 'hint used' : 'hint ready'}</div>` : ''}
  </div>`;
}

function playerPlate(ch, team, label) {
  return `<div class="player-plate" style="--team:${teamColor(team)}">
    ${stickerImg(ch, 'md')}
    <div><div class="pp-name">${esc(ch.data.name)}</div><div class="pp-team">${esc(teamName(team))} · ${label}</div></div>
  </div>`;
}

// ------------------------------------------------------------------
// 1. MAIN MENU — everyone hanging out; click the glowing button on deck
// ------------------------------------------------------------------
let menuActive = false;

function showMenu(intro = false) {
  game.phase = 'menu';
  menuActive = true;
  world.setParty(0);
  world.setSpotlight(null);
  clearGuests();
  // the menu is just the yacht and the sea: nobody's on deck yet
  hangOut(true);
  characters.forEach((c) => { c.showName(false); c.pop(false, true); });
  dj?.pop(false, true);
  world.setIntroMode(false);
  world.setDoors(false);
  if (world.startPedestal) world.startPedestal.visible = true;
  if (world.startButton) world.startButton.visible = true;
  if (startLabel) startLabel.visible = true;
  setMusicState('menu', 1.5);
  if (intro) {
    rig.setShift(0);
    rig.cut(sw(70, 40, -110), sw(0, 2, 0));
    rig.shot(sw(0, 8.5, -19), sw(0, 1.8, -1), 4.5, 'inOut').then(() => { if (game.phase === 'menu' && menuActive) menuOrbit(); });
  } else menuOrbit();
  const canContinue = savedGame && ['board', 'question', 'final'].includes(savedGame.phase);
  const n = setScreen(`
    <div class="menu">
      <div class="logo">
        <div class="logo-top">⚓ WELCOME ABOARD ⚓</div>
        <h1><span>COMPITAS</span><span class="logo-trivia">TRIVIA</span></h1>
        <div class="logo-sub">La Paz 2026</div>
      </div>
      <div class="menu-corner">
        ${canContinue ? '<button class="btn btn-secondary" data-act="continue">↻ Continue saved game</button>' : ''}
        <div class="menu-icons">
          <button class="icon-btn setup-btn" data-act="setup" title="Game Setup" aria-label="Game Setup">⚙</button>
          <button class="icon-btn setup-btn" data-act="explore" title="Explore the yacht — walk around, push stools, knock bottles!" aria-label="Explore the yacht">🕹️</button>
        </div>
      </div>
    </div>`, 'screen-menu');
  n.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (!a) return;
    unlockAudio();
    startMusic();
    sfx('click');
    if (a === 'continue') continueGame();
    if (a === 'setup') openSetup();
    if (a === 'explore') startExplore();
  });
}

function startGame() {
  if (!menuActive) return;
  menuActive = false;
  world.startHover = false;
  canvas.style.cursor = 'default';
  unlockAudio();
  startMusic();
  sfx('boing');
  setTimeout(() => sfx('fanfare'), 200);
  const [x, z] = spots().start;
  confetti.burst(sw(x, 1.5, z), 200, { up: 10 });
  rig.shake(0.3);
  clearGame();
  game = G.newGame();
  game.phase = 'intro';
  if (startLabel) startLabel.visible = false;
  ui.innerHTML = '';
  // opening cinematic, then the gang is introduced one by one; the TV on deck starts the game
  setTimeout(async () => {
    await director.playCinematic();
    await director.startIntros();
  }, 450);
}

function continueGame() {
  menuActive = false;
  if (startLabel) startLabel.visible = false;
  game = Object.assign(G.newGame(), savedGame);
  if (game.phase === 'question') G.cancelQuestion(game);
  setMusicState('game');
  placeTeams({ instant: true });
  if (game.phase === 'final') { game.final = null; showFinalIntro(); } else startTurn();
}

async function startExplore() {
  if (!menuActive) return;
  menuActive = false;
  game.phase = 'explore';
  world.startHover = false;
  if (startLabel) startLabel.visible = false;
  ui.innerHTML = '';
  ui.appendChild(globalButtons());
  const first = characters.findIndex((c) => c.data.role === 'girl');
  await explore.enter(Math.max(0, first));
}

function openSetup() {
  menuActive = false;
  openAdmin({
    config,
    onChange: async (newCfg, what) => {
      config = newCfg;
      saveConfig(config);
      applySettings();
      if (what === 'characters' || what === 'all') {
        characters.forEach((ch, i) => { ch.data = config.characters[i]; ch.refreshLabel(); });
        await refreshStickers();
        // renaming someone to/from a built-in character (e.g. "Joe") swaps their 3D model
        if (what === 'characters' && characters.some((ch) => !ch.data.model && (builtinModel(ch.data.name) || null) !== (ch.builtinSrc || null))) buildCharacters();
      }
      if (what === 'model' || what === 'all') buildCharacters();
    },
    onClose: () => showMenu(),
    previewCharacter: (id) => {
      const ch = characters.find((c) => c.data.id === id);
      if (ch) {
        ch.pop(true);
        ch.react(['cheer', 'dance', 'laugh', 'surprise', 'wave'][Math.floor(Math.random() * 5)], 2);
        clearTimeout(ch.previewT);
        ch.previewT = setTimeout(() => { if (game.phase === 'menu') ch.pop(false); }, 3000);
      }
    },
  });
}

// ------------------------------------------------------------------
// 2. CHOOSE TEAMS — the shuffle, right there on deck
// ------------------------------------------------------------------
function showTeams() {
  game.phase = 'shuffle';
  showAll();
  dj?.pop(true);
  setMusicState('game', 1.5);
  characters.forEach((c) => c.showName(true));
  rig.setShift(0);
  rig.shot(...shots.team(), 2.2);
  const n = setScreen(`
    <div class="top-title"><div class="kicker">STEP 1</div><h2>CHOOSE YOUR TEAMS</h2><p>Four couples. Two teams. Couples always stay together.</p></div>
    <div class="shuffle-result" id="shuffle-result"></div>
    <div class="bottom-actions">
      <button class="btn btn-play" data-act="shuffle">🎲 SHUFFLE COUPLES</button>
      <button class="btn btn-secondary hidden" data-act="lock">🔒 LOCK TEAMS</button>
    </div>
    <div class="shuffle-count" id="shuffle-count">Six possible pairings</div>
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
      sfx('drumroll');
      characters.forEach((c) => c.react('surprise', 0.8));
      await wait(1700);
      G.shuffleTeams(game);
      placeTeams({ stumbles: 1 + Math.floor(Math.random() * 2) });
      sfx('whoosh');
      await wait(2600);
      sfx('fanfare');
      confetti.burst(sw(SIDE[0] * 3.8, 2.5, -4.5), 140);
      confetti.burst(sw(SIDE[1] * 3.8, 2.5, -4.5), 140);
      characters.forEach((c) => c.react('cheer', 1.8));
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

function showReveal() {
  game.phase = 'reveal';
  G.startBoard(game, config.settings);
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
    <div class="bottom-actions"><button class="btn btn-play" data-act="go">🎯 LET'S PLAY!</button></div>
    <div class="reveal-sub">The rivalry begins…</div>
  `, 'screen-reveal');
  sfx('fanfare');
  setTimeout(() => confetti.rain(sw(0, 2, -4), 16, 260), 600);
  n.querySelector('[data-act=go]').addEventListener('click', () => {
    sfx('click');
    characters.forEach((c) => c.showName(false));
    persist();
    startTurn();
  });
}

// ------------------------------------------------------------------
// 3. "NAME'S TURN" — only that character on deck, in the spotlight
// ------------------------------------------------------------------
let turnSkip = null;
let player = null; // the character currently on screen

function putOnSpot(ch, instant = false) {
  const [x, z] = spots().turn;
  ch.target = null;
  ch.place(x, z, 0.5, 'idle');
  ch.pop(true, instant);
  world.setSpotlight(new THREE.Vector3(x, 0, z));
  player = ch;
}

async function startTurn(splashIntro = true) {
  game.phase = 'board';
  game.current = null;
  persist();
  clearGuests();
  if (G.remaining(game) === 0) return config.settings.finalSplash ? showFinalIntro() : showResults();
  world.setParty((25 - G.remaining(game)) / 25);
  setMusicState('game', 1.2);
  const team = game.turn;
  const ch = activeGirl(team);
  showOnly([ch]);
  dj?.pop(false);
  putOnSpot(ch);
  characters.forEach((c) => c.showName(false));
  if (!splashIntro) {
    turnShot(ch, 'board', 0.8);
    return showBoardPanel();
  }
  turnShot(ch, 'close', 1.6);
  setTimeout(() => { ch.react('cheer', 2.0); confetti.burst(sw(ch.root.position.x, 2.2, ch.root.position.z), 90, { up: 7 }); }, 500);
  sfx('fanfare');
  const name = ch.data.name.toUpperCase();
  const n = setScreen(`
    <div class="turn-scores">${teamChip(0, { compact: true })}${teamChip(1, { compact: true })}</div>
    <div class="turn-splash" style="--team:${teamColor(team)}">
      <div class="ts-kicker">${esc(teamName(team))}</div>
      <div class="ts-name">${esc(name)}’S</div>
      <div class="ts-turn">TURN!</div>
      <div class="ts-sub">${G.remaining(game)} questions left · tap to continue</div>
    </div>
  `, 'screen-turn');
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    turnSkip = null;
    turnShot(ch, 'board', 1.2);
    showBoardPanel();
  };
  turnSkip = go;
  n.addEventListener('click', go);
  await wait(2600);
  go();
}

// ------------------------------------------------------------------
// 4. THE TRIVIA BOARD — a glass panel over the yacht
// ------------------------------------------------------------------
let boardScreen = null;

function showBoardPanel() {
  game.phase = 'board';
  const team = game.turn;
  const ch = player || activeGirl(team);
  const s = config.settings;
  const cats = config.categories;
  const left = G.remaining(game);
  boardScreen = setScreen(`
    ${playerPlate(ch, team, 'your pick!')}
    <div class="trivia-panel">
      <div class="tp-header">
        ${teamChip(0)}
        <div class="tp-center">
          <div class="tp-picks" style="--team:${teamColor(team)}">${stickerImg(ch, 'sm')} ${esc(ch.data.name.toUpperCase())} PICKS</div>
          <div class="tp-left">${left} question${left === 1 ? '' : 's'} left</div>
        </div>
        ${teamChip(1)}
      </div>
      <div class="tp-grid">
        ${cats.map((c, ci) => `<div class="tp-cat" style="--cat:${c.color}"><span class="tp-cat-icon">${esc(c.icon)}</span><span class="tp-cat-name">${esc(c.name)}</span></div>`).join('')}
        ${POINTS.map((p, r) => cats.map((c, ci) => {
          const key = `${ci}-${r}`;
          const used = game.used[key];
          const dbl = s.doubleTrouble && key === game.doubleKey && !used;
          return `<button class="tile ${used ? 'used' : ''} ${dbl ? 'sparkle' : ''}" style="--cat:${c.color}; --i:${r * 5 + ci}" data-c="${ci}" data-r="${r}" ${used ? 'disabled' : ''}>${used ? '' : p}</button>`;
        }).join('')).join('')}
      </div>
    </div>
    ${hostBar([['undo', '↶ Undo', 'Z'], ['adj', '± Adjust scores', ''], ['final', s.finalSplash ? '🌊 Final Splash' : '🏆 End game', ''], ['menu', '⌂ Menu', '']])}
  `, 'screen-board');
  boardScreen.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile:not(.used)');
    if (tile) return chooseTile(+tile.dataset.c, +tile.dataset.r, tile);
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (!a) return;
    sfx('click');
    if (a === 'undo') doUndo();
    if (a === 'final') config.settings.finalSplash ? showFinalIntro() : showResults();
    if (a === 'menu') { persist(); showMenu(); }
    if (a === 'adj') showAdjust();
  });
  boardScreen.querySelectorAll('.tile:not(.used)').forEach((t) => t.addEventListener('mouseenter', () => sfx('hover')));
  ch.react('wave', 1.6);
  persist();
}

function doUndo() {
  if (game.phase !== 'board') return;
  if (G.undo(game)) { toast('↶ Undone!', 'small'); startTurn(false); } else toast('Nothing to undo', 'small');
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
      persist();
      sfx('pop');
    }
    if (e.target === n || e.target.dataset.close !== undefined) { n.remove(); showBoardPanel(); }
  });
  document.body.appendChild(n);
}

// ------------------------------------------------------------------
// 5. QUESTION REVEAL — tile flip, category moment, card flies in
// ------------------------------------------------------------------
async function chooseTile(c, r, tileEl) {
  if (game.phase !== 'board' || game.current) return;
  const cur = G.pickTile(game, c, r);
  if (!cur) return;
  persist();
  sfx('pop');
  tileEl.classList.add('picked');
  boardScreen?.querySelectorAll('.tile').forEach((t) => { if (t !== tileEl) t.classList.add('dim'); });
  await wait(750);
  const cat = config.categories[c];
  const q = config.questions[c][r];
  if (config.settings.animations) {
    boardScreen?.querySelector('.trivia-panel')?.classList.add('leaving');
    boardScreen?.querySelector('.player-plate')?.classList.add('leaving');
    sfx('whoosh');
    await characterMoment(cat, q, player);
  }
  if (cur.double) await doubleTrouble();
  showQuestion();
}

async function characterMoment(cat, q, ch) {
  const p = ch.root.position;
  if (cat.transition === 'dive') {
    const water = sw(9.5, 0, -4);
    water.y = 0.3;
    rig.setShift(0);
    rig.cut(water.clone().add(new THREE.Vector3(6, 7, -8)), water);
    await rig.shot(water.clone().add(new THREE.Vector3(1.5, 0.4, -2)), water, 0.6, 'in');
    sfx('splash');
    splash.burst(water.clone(), 140);
    const prop = makeCategoryProp('dive');
    prop.group.position.copy(water).add(new THREE.Vector3(0, 0.05, 0));
    addProp(prop);
    rig.shake(0.5);
    await wait(350);
    turnShot(ch, 'close', 0.6);
    ch.react('surprise', 1.4);
    await wait(700);
    return;
  }
  await turnShot(ch, 'close', 0.7);
  const toCam = rig.pos.clone().sub(ch.root.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
  const side = new THREE.Vector3(-toCam.z, 0, toCam.x);
  const prop = makeCategoryProp(cat.transition, cat.color);
  const propPos = ch.root.getWorldPosition(new THREE.Vector3()).addScaledVector(toCam, 1.3).addScaledVector(side, 1.0).add(new THREE.Vector3(0, 1.3, 0));
  prop.group.position.copy(propPos);
  prop.group.lookAt(rig.pos.x, propPos.y, rig.pos.z);
  prop.group.scale.setScalar(0.55);
  addProp(prop);
  sfx({ album: 'page', chest: 'chest', heart: 'heart', wheel: 'wheel' }[cat.transition] || 'pop');
  ch.react(q.funny ? 'laugh' : ['surprise', 'cheer', 'point'][Math.floor(Math.random() * 3)], 1.8);
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
  player?.react('surprise', 1);
  if (player) confetti.burst(sw(player.root.position.x, 2.5, player.root.position.z), 160, { up: 6 });
  await wait(2300);
  n.classList.add('out');
  setTimeout(() => n.remove(), 500);
}

// ------------------------------------------------------------------
// 6. QUESTION + host scoring
// ------------------------------------------------------------------
let timer = null;
let qScreen = null;

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
        player?.react('surprise', 1.2);
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

/** A boy pops onto deck next to the player (question about him, or Ask the Boys). */
function addGuest(boy, slot = 0, pose = 'point', emote = null) {
  if (!boy || guests.includes(boy)) return;
  const [x, z] = spots().turn;
  boy.target = null;
  boy.place(x + 1.4 + slot * 1.1, z + 0.4 - slot * 0.6, 0, 'idle');
  boy.faceTowards(rig.pos.x, rig.pos.z);
  boy.pop(true);
  boy.react(pose, 3);
  if (emote) boy.showEmote(emote, 3);
  guests.push(boy);
}
function clearGuests() {
  for (const g of guests) if (g !== player) g.pop(false);
  guests = [];
}

async function showQuestion() {
  const cur = game.current;
  const cat = config.categories[cur.c];
  const q = config.questions[cur.c][cur.r];
  const imgURL = q.image ? await mediaURL(q.image) : null;
  const format = imgURL ? q.format || 'image' : 'text';
  const subject = q.subject ? characters.find((c) => c.data.id === q.subject) : null;
  turnShot(player, 'board', 1.0);
  setMusicState('question', 1.5);
  qScreen = setScreen(`
    ${playerPlate(player, cur.answering, 'answering')}
    <div class="trivia-panel question-mode">
      <div class="q-card in-panel fmt-${format} ${cur.double ? 'is-double' : ''}" style="--cat:${cat.color}">
        <div class="q-head">
          <span class="q-chip">${esc(cat.icon)} ${esc(cat.name)}</span>
          <span class="q-chip q-points">${cur.points} POINTS${cur.double ? ' · ×2' : ''}</span>
          <span class="q-timer"><span class="q-timer-num">00:${String(config.settings.timer).padStart(2, '0')}</span></span>
        </div>
        ${imgURL ? `<div class="q-image"><img src="${imgURL}" alt=""></div>` : ''}
        ${format !== 'imageOnly' || !imgURL ? `<h1 class="q-title">${esc(q.title)}</h1>` : ''}
        ${subject ? `<div class="q-subject">${stickerImg(subject, 'sm')} This one's about <b>${esc(subject.data.name)}</b></div>` : ''}
        <div class="q-answering" style="--team:${teamColor(cur.answering)}"><span>${esc(player.data.name)}</span> answers for ${esc(teamName(cur.answering))}!</div>
        <div class="q-answer hidden"><div class="q-answer-label">ANSWER</div><div class="q-answer-text">${esc(q.answer)}</div>${q.explanation ? `<div class="q-explain">${esc(q.explanation)}</div>` : ''}</div>
        <div class="q-scores">${teamChip(0, { compact: true })}${teamChip(1, { compact: true })}</div>
      </div>
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
  // the boy the question is about pops in and reacts
  if (subject) {
    setTimeout(() => { addGuest(subject, 0, q.funny ? 'laugh' : 'point', 'surprise'); sfx('boing'); }, 700);
  }
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
    clearGuests();
    return startTurn(false);
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
      await wait(1300);
      // swap the player on deck for the other team's girl
      const thief = activeGirl(cur.answering);
      player.pop(false);
      clearGuests();
      putOnSpot(thief);
      thief.react('cheer', 1.4);
      turnShot(thief, 'board', 0.8);
      const plate = qScreen.querySelector('.player-plate');
      plate?.replaceWith(el(playerPlate(thief, cur.answering, 'stealing!')));
      const q = qScreen.querySelector('.q-answering');
      q.style.setProperty('--team', teamColor(cur.answering));
      q.innerHTML = `<span>${esc(thief.data.name)}</span> can STEAL for ${esc(teamName(cur.answering))}!`;
      q.classList.add('steal');
      refreshScores();
      startTimer(Math.max(10, Math.round(config.settings.timer / 2)));
      resolving = false;
      return;
    }
    stopTimer();
    revealAnswer(true);
    refreshScores();
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
    player?.react('sad', 1.5);
    await wait(2200);
    resolving = false;
    return endQuestion();
  }
}

function refreshScores() {
  document.querySelectorAll('.team-chip2').forEach((chip) => {
    const t = +chip.dataset.team;
    chip.replaceWith(el(teamChip(t, { compact: chip.classList.contains('compact') })));
  });
}

function askTheBoys() {
  const team = game.current.answering;
  if (!G.useAskTheBoys(game, team)) return toast(`${esc(teamName(team))} already used their hint!`, 'small');
  persist();
  sfx('fanfare');
  teamChars(team).filter((c) => c.data.role === 'boy').forEach((b, i) => addGuest(b, i, 'point', 'think'));
  toast(`🎤 ASK THE BOYS!<br><small>${esc(teamName(team))} may ask ONE boy for a cryptic clue (no giving it away!)</small>`, 'ask', 3500);
  if (timer) timer.left = Math.min(timer.total, timer.left + 10);
  refreshScores();
}

async function reactCorrect(team, delta, before) {
  sfx('correct');
  player?.react('cheer', 2.4);
  guests.forEach((g) => g.react('cheer', 2));
  if (player) confetti.burst(sw(player.root.position.x, 2.6, player.root.position.z), 240);
  toast(`<div class="pts" style="--team:${teamColor(team)}">+${delta}</div><div>${esc(teamName(team))}!</div>`, 'score', 1800);
  refreshScores();
  stickerMood(team, 'jump');
  checkSwing(before);
  await wait(2400);
}

function reactWrong(team, delta) {
  sfx('wrong');
  player?.react('sad', 2);
  guests.forEach((g) => g.react('laugh', 1.8));
  stickerMood(team, 'cry');
  if (delta) toast(`<div class="pts neg">${delta}</div><div>${esc(teamName(team))}</div>`, 'score', 1600);
}

function stickerMood(team, mood) {
  document.querySelectorAll(`.team-chip2[data-team="${team}"] .sticker, .player-plate .sticker`).forEach((s, i) => {
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
      toast('😱 WHAT A SWING!', 'swing', 1600);
    }, 900);
  }
}

function endQuestion() {
  G.finishQuestion(game);
  persist();
  qScreen = null;
  player?.pop(false);
  clearGuests();
  setTimeout(() => startTurn(), 350);
}

// ------------------------------------------------------------------
// 7. THE FINAL SPLASH
// ------------------------------------------------------------------
async function showFinalIntro() {
  G.startFinal(game);
  persist();
  world.setParty(1);
  world.setSpotlight(null);
  clearGuests();
  placeTeams({ instant: true });
  showAll();
  dj?.pop(true);
  setMusicState('party', 1);
  rig.setShift(0);
  const water = sw(0, 0, -16);
  water.y = 0.3;
  rig.shot(water.clone().add(new THREE.Vector3(5, 3, -10)), water.clone().add(new THREE.Vector3(0, 2.5, 0)), 1.6);
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
  rig.shot(...shots.team(), 1.5);
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
  setMusicState('question', 1.2);
  persist();
  const q = config.final;
  const imgURL = q.image ? await mediaURL(q.image) : null;
  sfx('whoosh');
  qScreen = setScreen(`
    <div class="trivia-panel question-mode centered">
      <div class="q-card in-panel final fmt-${imgURL ? 'image' : 'text'}" style="--cat:#0ea5b7">
        <div class="q-head">
          <span class="q-chip">🌊 THE FINAL SPLASH</span>
          <span class="q-timer"><span class="q-timer-num">00:${String(config.settings.timer).padStart(2, '0')}</span></span>
        </div>
        ${imgURL ? `<div class="q-image"><img src="${imgURL}" alt=""></div>` : ''}
        <h1 class="q-title">${esc(q.title)}</h1>
        <div class="q-answering">Both teams write down an answer!</div>
        <div class="q-answer hidden"><div class="q-answer-label">ANSWER</div><div class="q-answer-text">${esc(q.answer)}</div></div>
        <div class="q-scores">${teamChip(0, { compact: true })}${teamChip(1, { compact: true })}</div>
        <div class="final-judge hidden">
          ${[0, 1].map((t) => `<div class="fj-row" style="--team:${teamColor(t)}" data-team="${t}"><span class="fj-name">${esc(teamName(t))}</span><span class="fj-wager">wagered ${game.final.wagers[t]}</span>
            <button class="btn-mini good" data-res="1" data-t="${t}">✔ Right</button><button class="btn-mini bad" data-res="0" data-t="${t}">✘ Wrong</button></div>`).join('')}
        </div>
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
      refreshScores();
      teamChars(t).forEach((c) => c.react(correct ? 'cheer' : 'sad', 2));
      sfx(correct ? 'correct' : 'wrong');
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
// 8. YACHT CHAMPIONS
// ------------------------------------------------------------------
function showResults() {
  stopTimer();
  game.phase = 'results';
  clearGame();
  world.setParty(1);
  world.setSpotlight(null);
  clearGuests();
  showAll();
  dj?.pop(true);
  setMusicState('party', 0.8);
  rig.setShift(0);
  const w = G.winner(game);
  const winners = w >= 0 ? teamChars(w) : characters;
  const losers = w >= 0 ? teamChars(1 - w) : [];
  const [sx, sz] = spots().start;
  winners.forEach((c, i) => {
    const a = (i / winners.length) * Math.PI * 2 + 0.4;
    c.moveTo(sx + Math.cos(a) * 1.5, sz + Math.sin(a) * 1.5, { face: Math.PI, delay: i * 0.1, speed: 5, then: 'dance' });
  });
  losers.forEach((c, i) => {
    const a = Math.PI * (0.25 + (i / Math.max(1, losers.length - 1)) * 0.5); // behind the winners, facing center stage
    const x = sx + Math.cos(a) * 3.6;
    const z = sz + Math.sin(a) * 3.6;
    c.moveTo(x, z, { face: Math.atan2(sx - x, sz - z), delay: 0.3, speed: 4 });
  });
  setTimeout(() => losers.forEach((c) => c.react('sad', 6)), 2600);
  sfx('fanfare');
  setTimeout(() => sfx('fanfare'), 1500);
  const rainFn = () => { if (game.phase === 'results') { confetti.rain(sw(0, 2, -2), 14, 120); confetti.burst(sw((Math.random() - 0.5) * 4, 1.5, -2), 90); setTimeout(rainFn, 1600); } };
  setTimeout(rainFn, 1200);
  rig.shot(sw(0, 5.2, -11), sw(0, 1.4, -2), 2);
  setTimeout(() => { if (game.phase === 'results') rig.startOrbit(sw(0, 0, -2), 9.5, 5, 0.4, Math.PI, new THREE.Vector3(0, 1.4, 0), 0.7); }, 2100);
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
    if (a === 'again') { game = G.newGame(); showTeams(); }
    if (a === 'menu') { game = G.newGame(); showMenu(); }
  });
}

// ------------------------------------------------------------------
// Pointer: the START button on deck
// ------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function hitStart(e) {
  if (!menuActive || !world.startPedestal) return false;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const targets = [world.startPedestal, world.startButton, startLabel].filter(Boolean);
  return raycaster.intersectObjects(targets, false).length > 0;
}
canvas.addEventListener('pointerdown', (e) => { explore?.onPointerDown(e); });
window.addEventListener('pointerup', (e) => { explore?.onPointerUp(e); });
canvas.addEventListener('wheel', (e) => { if (explore?.onWheel(e)) e.preventDefault(); }, { passive: false });
window.addEventListener('keyup', (e) => { explore?.onKeyUp(e); });
canvas.addEventListener('pointermove', (e) => {
  if (explore?.active) { explore.onPointerMove(e); canvas.style.cursor = explore.drag ? 'grabbing' : 'grab'; return; }
  if (director?.active) {
    const hover = director.state === 'final' && director.tv && (() => {
      raycaster.setFromCamera(new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1), camera);
      return raycaster.intersectObject(director.tv, true).length > 0;
    })();
    canvas.style.cursor = hover || director.state === 'waiting' ? 'pointer' : 'default';
    return;
  }
  const h = hitStart(e);
  if (h !== world.startHover) { world.startHover = h; if (h) sfx('hover'); }
  canvas.style.cursor = h ? 'pointer' : 'default';
});
canvas.addEventListener('click', (e) => {
  if (explore?.active) return;
  if (director?.onClick(e)) return;
  if (hitStart(e)) startGame();
});

// ------------------------------------------------------------------
// Keyboard (host controls)
// ------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select') || document.querySelector('.admin')) return;
  if (explore?.active) { if (e.key.toLowerCase() === 'f') toggleFullscreen(); explore.onKeyDown(e); return; }
  const k = e.key.toLowerCase();
  if (director?.active) {
    if (k === 'f') toggleFullscreen();
    if (director.onKey(k)) { e.preventDefault(); return; }
  }
  if (k === 'f') toggleFullscreen();
  if (k === '?' || (k === '/' && e.shiftKey)) toggleHelp();
  if (k === 'h') {
    hostBarHidden = !hostBarHidden;
    document.querySelectorAll('.host-bar').forEach((b) => b.classList.toggle('hidden', hostBarHidden));
  }
  if (game.phase === 'menu' && menuActive && (k === 'enter' || k === ' ')) { e.preventDefault(); startGame(); }
  if (turnSkip && (k === ' ' || k === 'enter')) { e.preventDefault(); turnSkip(); return; }
  if (game.phase === 'board' && !game.current && k === 'z') doUndo();
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
let maxDt = 0.05; // frame step cap (raised only by automated tests on very slow renderers)
function loop() {
  const dt = Math.min(clock.getDelta(), maxDt);
  world.update(dt);
  env?.update(dt, world.party);
  director?.update(dt);
  explore?.update(dt);
  dj?.update(dt);
  for (const c of characters) c.update(dt);
  if (startLabel?.visible) {
    startLabel.position.y = startLabel.userData.base + Math.sin(world.clock * 2.2) * 0.12;
    const s = world.startHover ? 1.12 : 1;
    startLabel.scale.set(2.9 * s, 0.9 * s, 1);
  }
  props = props.filter((p) => {
    p.t += dt;
    const alive = p.update(p.t, dt);
    if (!alive) scene.remove(p.group);
    return alive;
  });
  confetti.update(dt);
  splash.update(dt);
  rig.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = camera.aspect < 1.2 ? 60 : 42;
  rig.fovTarget = camera.fov;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.dispatchEvent(new Event('resize'));

// Debug handle for the host's console
window.yct = { THREE, world, rig, env: () => env, characters: () => characters, game: () => game, startGame, director: () => director, explore: () => explore, setMaxDt: (v) => { maxDt = v; } };

loop();
init();
