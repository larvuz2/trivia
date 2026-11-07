// The opening: a ~15 s in-game cinematic, then "Introducing the gang" on deck.
//
// Cinematic: fade in from black -> low angle on the yacht cruising in -> a seagull flying alongside
// -> the DJ drops the beat, the deck lights up -> fade out.
// Introductions: fixed camera on deck, party lights sweeping. One by one the characters walk out of the
// salon to their mark (loop pose), the host clicks, they walk past the camera, a title card announces the
// next one... After the last one, the whole gang walks in and the TV on deck shows START GAME.
import * as THREE from 'three';
import { sfx, setMusicState } from './audio.js';
import { roundRect } from './characters.js';

const MARK = { x: -0.1, z: 2.5 };          // where each character stops (stage space); clear of the DJ speakers
const DOOR = { x: 0.0, z: 7.55 };           // just outside the salon's glass doors (centred)
const CAM = { pos: [0.95, 1.05, -1.5], look: [0.0, 1.55, 3.0], fov: 52 };
const EXIT = { x: -2.8, z: -5.8 };          // walks past the camera (screen right)
const TV_POS = { x: 3.0, z: 3.3 };
const GANG_X = -0.7;                       // centre of the finale line-up (leaves the START GAME TV clear)

const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class IntroDirector {
  /**
   * @param {object} o
   * world, env (getter), rig, confetti, camera, characters (getter), dj (getter), sticker (fn ch->url),
   * onFinished (called after the host clicks START GAME on the TV)
   */
  constructor(o) {
    Object.assign(this, o);
    this.active = false;
    this.mode = null;
    this.state = null;
    this.time = 0;
    this.cruise = null;
    this.gulls = [];
    this.raycaster = new THREE.Raycaster();
    this.buildOverlay();
    this.buildTV();
  }

  // ------------------------------------------------------------------ overlay (fader, letterbox, captions)
  buildOverlay() {
    this.fader = el('<div class="fader"></div>');
    this.bars = el('<div class="letterbox"><div class="lb-top"></div><div class="lb-bottom"></div></div>');
    this.caption = el('<div class="cine-caption"></div>');
    this.skipBtn = el('<button class="skip-btn">Skip intro ⏭</button>');
    this.skipBtn.addEventListener('click', () => this.skip());
    document.body.append(this.fader, this.bars, this.caption, this.skipBtn);
  }

  fade(to, ms) {
    this.fader.style.transitionDuration = `${ms}ms`;
    this.fader.style.opacity = String(to);
    return wait(ms);
  }

  setCaption(text, sub = '') {
    this.caption.innerHTML = text ? `<div class="cc-main">${esc(text)}</div>${sub ? `<div class="cc-sub">${esc(sub)}</div>` : ''}` : '';
    this.caption.classList.toggle('show', !!text);
  }

  sw(x, y, z) { return this.world.stage.localToWorld(new THREE.Vector3(x, y, z)); }

  // ------------------------------------------------------------------ the TV on deck (START GAME prop)
  buildTV() {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: '#15161d', roughness: 0.35, metalness: 0.4 });
    const chrome = new THREE.MeshStandardMaterial({ color: '#eceef2', metalness: 1, roughness: 0.18 });
    const W = 2.5;
    const H = 1.42;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.16, H + 0.16, 0.12), frameMat);
    frame.position.y = 1.75;
    g.add(frame);
    this.tvCanvas = document.createElement('canvas');
    this.tvCanvas.width = 1024;
    this.tvCanvas.height = 582;
    this.tvTex = new THREE.CanvasTexture(this.tvCanvas);
    this.tvTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false }));
    screen.position.set(0, 1.75, 0.065);
    g.add(screen);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 12), chrome);
    pole.position.y = 0.55;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.08, 24), chrome);
    base.position.y = 0.04;
    g.add(pole, base);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.2, H + 1.0), new THREE.MeshBasicMaterial({ color: '#ff4fb0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(0, 1.75, -0.08);
    g.add(halo);
    g.traverse((o) => { if (o.isMesh) o.castShadow = o !== halo && o !== screen; });
    this.tv = g;
    this.tvScreen = screen;
    this.tvHalo = halo;
    this.tvMode = 'logo';
    this.drawTV();
  }

  placeTV() {
    if (this.tv.parent) return;
    this.world.stage.add(this.tv);
    this.tv.position.set(TV_POS.x, 0, TV_POS.z);
    this.tv.rotation.y = Math.atan2(CAM.pos[0] - TV_POS.x, CAM.pos[2] - TV_POS.z);
  }

  setTV(mode, ch = null) {
    this.tvMode = mode;
    this.tvChar = ch;
    this.drawTV();
  }

  drawTV(pulse = 0) {
    const g = this.tvCanvas.getContext('2d');
    const w = 1024;
    const h = 582;
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#2b1055');
    grd.addColorStop(1, '#ff4f8b');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // scanlines + bokeh
    g.globalAlpha = 0.08;
    for (let y = 0; y < h; y += 6) { g.fillStyle = '#000'; g.fillRect(0, y, w, 2); }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const big = (text, y, size, color = '#fff') => {
      g.font = `${size}px "Lilita One", sans-serif`;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillText(text, w / 2 + 5, y + 6);
      g.fillStyle = color;
      g.fillText(text, w / 2, y);
    };
    if (this.tvMode === 'logo') {
      big('COMPITAS', 220, 120);
      big('TRIVIA', 340, 130, '#ffd34d');
    } else if (this.tvMode === 'welcome') {
      big('WELCOME ABOARD', 200, 92, '#9ff0ff');
      big('MEET THE GANG', 330, 110);
    } else if (this.tvMode === 'char' && this.tvChar) {
      big('NOW ARRIVING', 120, 64, '#9ff0ff');
      g.fillStyle = this.tvChar.data.color;
      g.beginPath();
      g.arc(w / 2, 290, 110, 0, Math.PI * 2);
      g.fill();
      if (this.tvSticker?.complete) g.drawImage(this.tvSticker, w / 2 - 100, 190, 200, 200);
      big(this.tvChar.data.name.toUpperCase(), 480, 96);
    } else if (this.tvMode === 'start') {
      const s = 1 + pulse * 0.06;
      g.save();
      g.translate(w / 2, h / 2);
      g.scale(s, s);
      g.fillStyle = '#ff7a45';
      roundRect(g, -380, -120, 760, 240, 120);
      g.fill();
      g.lineWidth = 14;
      g.strokeStyle = '#fff4e0';
      g.stroke();
      g.font = '130px "Lilita One", sans-serif';
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillText('▶ START GAME', 6, 10);
      g.fillStyle = '#fff';
      g.fillText('▶ START GAME', 0, 4);
      g.restore();
      big('click the TV when the gang is ready', 520, 40, '#ffe7f2');
    }
    this.tvTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ CINEMATIC
  async playCinematic() {
    this.active = true;
    this.mode = 'cinematic';
    this.skipped = false;
    this.fader.style.transitionDuration = '0ms';
    this.fader.style.opacity = '1';
    void this.fader.offsetWidth; // commit the black frame so the fade-in actually animates
    this.bars.classList.add('on');
    this.skipBtn.classList.add('show');
    const w = this.world;
    const env = this.env();
    const dj = this.dj();
    // golden-hour arrival
    w.party = w.partyTarget = 0.5;
    this.characters().forEach((c) => c.pop(false, true));
    dj?.pop(false, true);
    if (env?.hullFoam) env.hullFoam.visible = false;
    (w.floats || []).forEach((f) => { f.visible = false; });
    if (w.startPedestal) w.startPedestal.visible = false;
    if (w.startButton) w.startButton.visible = false;
    this.cruise = { t: 0, dur: 9.6, from: -115, wakeT: 0 };
    w.yacht.position.z = this.cruise.from;
    setMusicState('cinematic', 0.4);

    // ---- Shot A: low angle on the yacht cruising in (subject on the right third, horizon low) ----
    this.setupShotA();
    sfx('whoosh');
    this.fade(0, 1300);
    setTimeout(() => this.mode === 'cinematic' && this.setCaption('BAJA CALIFORNIA SUR', 'Mar de Cortés'), 900);
    if (await this.hold(4500)) return this.endCinematic();
    this.setCaption('');
    await this.fade(1, 320);

    // ---- Shot B: a seagull glides alongside (gull on the left third, yacht behind) ----
    this.setupShotB();
    sfx('gull');
    this.fade(0, 320);
    setTimeout(() => this.mode === 'cinematic' && this.setCaption('LA PAZ', 'golden hour'), 400);
    setTimeout(() => { if (this.mode === 'cinematic') sfx('gull'); }, 2200);
    if (await this.hold(2400)) return this.endCinematic();
    sfx('riser');
    if (await this.hold(2100)) return this.endCinematic();
    this.setCaption('');
    await this.fade(1, 260);

    // ---- Shot C: the DJ drops the beat and the deck lights up ----
    this.setupShotC();
    setMusicState('party', 0.1);
    sfx('impact');
    sfx('scratch');
    setTimeout(() => sfx('airhorn'), 250);
    this.fade(0, 220);
    this.confetti.burst(this.sw(-2.0, 2.4, 4.0), 160, { up: 6 });
    this.confetti.burst(this.sw(2.0, 2.4, 4.0), 160, { up: 6 });
    setTimeout(() => this.mode === 'cinematic' && this.setCaption('COMPITAS TRIVIA', 'La Paz 2026'), 700);
    if (await this.hold(4300)) return this.endCinematic();
    this.setCaption('');
    await this.fade(1, 800);
    return this.endCinematic(true);
  }

  setupShotA() {
    const w = this.world;
    const rig = this.rig;
    rig.fovTarget = 38;
    rig.setShift(-0.14);
    rig.follow(() => {
      const yz = w.yacht.position.z;
      return { pos: new THREE.Vector3(12.5, 0.55, -34 + this.cruise.t * 1.6), look: new THREE.Vector3(0, 6.2, yz + 14) };
    });
  }

  setupShotB() {
    this.clearGulls();
    this.spawnGulls();
    const lead = this.gulls[0];
    this.rig.setShift(0);
    this.rig.fovTarget = 44;
    this.rig.follow(() => {
      // side-on tracking shot: gull in profile on the left third, the yacht ahead of it on the right
      const p = lead.o.position;
      return { pos: p.clone().add(new THREE.Vector3(-9.5, 0.2, -2)), look: p.clone().add(new THREE.Vector3(0, -1.2, 5.2)) };
    });
  }

  setupShotC() {
    const w = this.world;
    const dj = this.dj();
    this.cruise.t = this.cruise.dur;
    w.yacht.position.z = 0;
    this.clearGulls();
    w.party = w.partyTarget = 0.95;
    w.setIntroMode(true);
    const s = this.layout().dj[0];
    if (dj) { dj.place(s[0], s[1], Math.PI, 'dj'); dj.root.position.y = 0.42; dj.pop(true, true); }
    const rig = this.rig;
    rig.setShift(-0.16);
    rig.fovTarget = 46;
    rig.cut(this.sw(s[0] + 0.6, 1.25, s[1] - 1.6), this.sw(s[0], 1.3, s[1] - 0.2));
    rig.shot(this.sw(0.8, 2.3, -1.6), this.sw(s[0] + 0.4, 1.4, s[1]), 5.2, 'inOut');
  }

  /** Stage one cinematic shot instantly (for previewing / testing the framing). shot: 'A' | 'B' | 'C'; t = seconds into the cruise. */
  debugShot(shot, t = 3) {
    const w = this.world;
    this.cruise = { t, dur: 9.6, from: -115, wakeT: 0 };
    w.party = w.partyTarget = shot === 'C' ? 0.95 : 0.5;
    this.characters().forEach((c) => c.pop(false, true));
    if (shot === 'A') this.setupShotA();
    if (shot === 'B') this.setupShotB();
    if (shot === 'C') { this.setupShotC(); this.rig.t = 0.6; }
    if (shot !== 'C') w.yacht.position.z = this.cruise.from * (1 - easeOutQuad(t / this.cruise.dur));
  }

  /** Waits, but returns true right away if the host skipped. */
  async hold(ms) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      if (this.skipped) return true;
      await wait(50);
    }
    return this.skipped;
  }

  skip() {
    if (this.mode === 'cinematic') this.skipped = true;
  }

  async endCinematic(alreadyBlack = false) {
    if (!alreadyBlack) await this.fade(1, 300);
    this.setCaption('');
    this.cruise = null;
    this.clearGulls();
    const w = this.world;
    w.yacht.position.z = 0;
    const env = this.env();
    if (env?.hullFoam) env.hullFoam.visible = true;
    (w.floats || []).forEach((f) => { f.visible = true; });
    this.bars.classList.remove('on');
    this.skipBtn.classList.remove('show');
    this.mode = null;
  }

  spawnGulls() {
    const env = this.env();
    const make = () => {
      if (env?.lib?.seagull) {
        const o = env.clone('seagull');
        return { o, wl: o.getObjectByName('seagull_wingL'), wr: o.getObjectByName('seagull_wingR') };
      }
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff' }));
      o.scale.set(0.8, 0.7, 1.8);
      return { o, wl: null, wr: null };
    };
    this.gulls = [0, 1, 2].map((i) => {
      const g = make();
      g.o.scale.setScalar(i === 0 ? 1.25 : 1.0);
      g.off = [new THREE.Vector3(-7, 9, -13), new THREE.Vector3(-12, 11.5, -2), new THREE.Vector3(-3, 13, -24)][i];
      g.phase = i * 1.7;
      this.world.scene.add(g.o);
      return g;
    });
  }

  clearGulls() {
    for (const g of this.gulls) g.o.parent?.remove(g.o);
    this.gulls = [];
  }

  // ------------------------------------------------------------------ INTRODUCTIONS
  layout() { return this.world.layout.spots; }

  async startIntros() {
    this.active = true;
    this.mode = 'intro';
    this.state = 'busy';
    const w = this.world;
    const chars = this.characters();
    // couple by couple: the girl, then her guy
    this.queue = [];
    for (let cp = 0; cp < 4; cp++) {
      for (const role of ['girl', 'boy']) {
        const c = chars.find((x) => x.data.couple === cp && x.data.role === role);
        if (c) this.queue.push(c);
      }
    }
    chars.forEach((c) => { c.pop(false, true); c.showName(false); c.target = null; });
    this.index = -1;
    w.party = w.partyTarget = 0.95;
    w.setIntroMode(true);
    w.setDoors(false);
    if (w.startPedestal) w.startPedestal.visible = false;
    if (w.startButton) w.startButton.visible = false;
    const dj = this.dj();
    if (dj) {
      const s = this.layout().dj[0];
      dj.place(s[0], s[1], Math.PI, 'dj');
      dj.root.position.y = 0.42;
      dj.pop(true, true);
    }
    this.placeTV();
    this.setTV('welcome');
    const rig = this.rig;
    rig.setShift(0);
    rig.fovTarget = CAM.fov;
    rig.cut(this.sw(...CAM.pos), this.sw(...CAM.look), CAM.fov);
    rig.sway = 0.4;
    setMusicState('party', 0.6);
    this.hint = el('<div class="intro-hint"><span class="ih-count"></span><span class="ih-text"></span></div>');
    document.body.appendChild(this.hint);
    this.updateHint();
    await this.fade(0, 900);
    await this.titleCard(this.queue[0]);
    this.arrive(0);
  }

  updateHint(text) {
    if (!this.hint) return;
    const n = this.queue.length;
    this.hint.querySelector('.ih-count').textContent = this.index >= 0 ? `${Math.min(this.index + 1, n)} / ${n}` : `0 / ${n}`;
    this.hint.querySelector('.ih-text').textContent = text || (this.state === 'waiting'
      ? (this.index === n - 1 ? 'Click or press Space to bring out the whole gang' : 'Click or press Space for the next guest')
      : this.state === 'final' ? 'Click the TV (or press Enter) to START GAME' : '…');
    this.hint.classList.toggle('ready', this.state === 'waiting' || this.state === 'final');
  }

  async arrive(i) {
    this.index = i;
    this.state = 'busy';
    this.updateHint();
    const ch = this.queue[i];
    const w = this.world;
    this.setTV('char', ch);
    this.tvSticker = new Image();
    this.tvSticker.onload = () => this.drawTV();
    this.tvSticker.src = this.sticker(ch);
    w.setDoors(true);
    sfx('door');
    await wait(450);
    ch.target = null;
    ch.place(DOOR.x, DOOR.z, Math.PI, 'idle');
    ch.pop(true, true);
    const face = Math.atan2(CAM.pos[0] - MARK.x, CAM.pos[2] - MARK.z);
    ch.moveTo(MARK.x, MARK.z, { face, speed: 2.3, then: 'intro' });
    await this.until(() => !ch.target, 6000);
    w.setDoors(false);
    w.setSpotlight(new THREE.Vector3(MARK.x, 0, MARK.z));
    // confetti cannons from both sides of the frame
    this.cannons(120);
    sfx('cannon');
    sfx('cheer');
    sfx('fanfare');
    ch.react('cheer', 1.6);
    this.showPlate(ch);
    this.state = 'waiting';
    this.updateHint();
  }

  async next() {
    if (this.mode !== 'intro') return;
    if (this.state === 'final') return this.finish();
    if (this.state !== 'waiting') return;
    this.state = 'busy';
    this.updateHint();
    this.hidePlate();
    const ch = this.queue[this.index];
    const last = this.index === this.queue.length - 1;
    if (last) return this.finale();
    sfx('swoosh');
    this.world.setSpotlight(null);
    ch.moveTo(EXIT.x, EXIT.z, { face: 0, speed: 2.6, then: 'idle' });
    await wait(1700);
    ch.pop(false);
    await this.titleCard(this.queue[this.index + 1]);
    this.arrive(this.index + 1);
  }

  async finale() {
    // everyone walks into frame and lines up around the last arrival
    const lineup = this.lineup();
    this.world.setSpotlight(new THREE.Vector3(GANG_X, 0, MARK.z + 0.3));
    const face = (x, z) => Math.atan2(CAM.pos[0] - x, CAM.pos[2] - z);
    this.queue.forEach((c, i) => {
      const [x, z] = lineup[i];
      if (i === this.queue.length - 1) {
        c.moveTo(x, z, { face: face(x, z), speed: 1.8, then: 'intro' });
        return;
      }
      const fromLeft = x > GANG_X;
      c.target = null;
      c.place(fromLeft ? 5.6 : -6.0, z - 2.5 - (i % 3) * 0.6, 0, 'idle');
      c.pop(true, true);
      c.moveTo(x, z, { face: face(x, z), speed: 3.2 + Math.random(), delay: 0.15 * i, then: 'intro' });
    });
    sfx('airhorn');
    setMusicState('party', 0.2);
    // pull back to reveal the whole gang
    this.rig.shot(this.sw(0.4, 1.7, -4.8), this.sw(-0.6, 1.35, 3.0), 2.6, 'inOut');
    await wait(2600);
    this.queue.forEach((c) => c.react('cheer', 1.8));
    for (let k = 0; k < 3; k++) {
      setTimeout(() => {
        this.cannons(150);
        this.confetti.rain(this.sw(GANG_X, 2.5, MARK.z), 8, 120);
        sfx('cannon');
      }, k * 600);
    }
    sfx('cheer');
    setTimeout(() => sfx('cheer'), 900);
    await this.titleCard(null, { kicker: 'TONIGHT’S CREW', name: 'THE GANG’S ALL HERE!', tagline: 'Four couples. Two teams. One yacht.', color: '#ff7a45' });
    this.setTV('start');
    this.state = 'final';
    this.updateHint();
  }

  /** Confetti cannons on both sides of the frame, behind the mark. */
  cannons(n) {
    this.confetti.burst(this.sw(MARK.x + 3.0, 0.3, MARK.z + 1.2), n, { up: 10, spread: 2.4, radius: 0.3 });
    this.confetti.burst(this.sw(MARK.x - 3.0, 0.3, MARK.z + 1.2), n, { up: 10, spread: 2.4, radius: 0.3 });
  }

  lineup() {
    // an arc of eight facing the camera, centred on the mark (couples next to each other)
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const u = (i - 3.5) / 3.5;
      pts.push([GANG_X + u * 2.35, MARK.z + 0.3 + Math.abs(u) * 0.25 + (i % 2) * 0.55]);
    }
    // the last one to arrive takes the centre slot; everyone else fills in left to right
    const centre = pts.splice(4, 1)[0];
    return [...pts, centre];
  }

  async finish() {
    if (this.state !== 'final') return;
    this.state = 'done';
    sfx('fanfare');
    this.hint?.remove();
    this.hint = null;
    await this.fade(1, 600);
    const w = this.world;
    w.setIntroMode(false);
    w.setSpotlight(null);
    w.setDoors(false);
    if (w.startPedestal) w.startPedestal.visible = true;
    if (w.startButton) w.startButton.visible = true;
    this.setTV('logo');
    this.rig.fovTarget = 42;
    this.rig.sway = 1;
    this.active = false;
    this.mode = null;
    setMusicState('game', 1.5);
    this.onFinished();
    await wait(150);
    this.fade(0, 700);
  }

  // ------------------------------------------------------------------ title card + lower third
  async titleCard(ch, custom = null) {
    const d = custom || {
      kicker: 'INTRODUCING',
      name: ch.data.name.toUpperCase(),
      tagline: ch.data.tagline || (ch.data.role === 'girl' ? 'Trivia player' : 'One of the boys'),
      color: ch.data.color,
    };
    const card = el(`<div class="title-card" style="--c:${d.color}">
      <div class="tcard-kicker">${esc(d.kicker)}</div>
      <div class="tcard-name">${esc(d.name)}</div>
      <div class="tcard-tag">${esc(d.tagline)}</div>
    </div>`);
    document.body.appendChild(card);
    setMusicState('duck', 0.35);
    sfx('impact');
    requestAnimationFrame(() => card.classList.add('show'));
    await wait(2550);
    card.classList.remove('show');
    card.classList.add('hide');
    setMusicState('party', 0.5);
    await wait(450);
    card.remove();
  }

  showPlate(ch) {
    this.hidePlate();
    this.plate = el(`<div class="intro-plate" style="--c:${ch.data.color}">
      <img class="sticker md" src="${this.sticker(ch)}" alt="">
      <div><div class="ip-name">${esc(ch.data.name)}</div><div class="ip-tag">${esc(ch.data.tagline || '')} · Couple ${ch.data.couple + 1}</div></div>
    </div>`);
    document.body.appendChild(this.plate);
  }

  hidePlate() {
    if (!this.plate) return;
    const p = this.plate;
    this.plate = null;
    p.classList.add('out');
    setTimeout(() => p.remove(), 400);
  }

  until(fn, timeout) {
    return new Promise((res) => {
      const t0 = performance.now();
      const tick = () => (fn() || performance.now() - t0 > timeout ? res() : setTimeout(tick, 60));
      tick();
    });
  }

  // ------------------------------------------------------------------ input + per-frame
  /** Canvas click while the intro is running. Returns true if it was handled. */
  onClick(e) {
    if (!this.active) return false;
    if (this.mode === 'cinematic') return true;
    if (this.state === 'final') {
      const p = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(p, this.camera);
      if (this.raycaster.intersectObject(this.tv, true).length) this.finish();
      return true;
    }
    this.next();
    return true;
  }

  onKey(k) {
    if (!this.active) return false;
    if (this.mode === 'cinematic') {
      if (k === 'escape' || k === 'enter') this.skip();
      return true;
    }
    if (k === ' ' || k === 'enter' || k === 'arrowright') { this.next(); return true; }
    return true;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    const w = this.world;
    if (this.cruise && this.cruise.t < this.cruise.dur) {
      const c = this.cruise;
      c.t = Math.min(c.dur, c.t + dt);
      const k = c.t / c.dur;
      const z = c.from * (1 - easeOutQuad(k));
      const speed = (-c.from * 2 * (1 - k)) / c.dur;
      w.yacht.position.z = z;
      w.yacht.rotation.x -= 0.012 * Math.min(1, speed / 20); // bow lifts when fast
      c.wakeT -= dt;
      const env = this.env();
      if (env && speed > 2 && c.wakeT <= 0) {
        c.wakeT = 0.05;
        for (const s of [-1, 1]) {
          env.foam.spawn(s * (5 + Math.random() * 2), z - 27 - Math.random() * 3, 1.4, 3.6, 2.6);
          env.foam.spawn(s * (2.2 + Math.random()), z + 21 + Math.random() * 2, 0.7, 2.0, 1.2);
          env.foam.spawn(s * (7.2 + Math.random()), z - 5 + Math.random() * 20, 0.5, 1.6, 1.4);
        }
        env.foam.spawn((Math.random() - 0.5) * 6, z - 29 - Math.random() * 6, 2, 4.5, 3);
      }
    }
    for (const g of this.gulls) {
      const yz = w.yacht.position.z;
      g.o.position.set(g.off.x + Math.sin(t * 0.6 + g.phase) * 1.2, g.off.y + Math.sin(t * 1.3 + g.phase) * 0.5, yz + g.off.z + Math.sin(t * 0.5 + g.phase) * 1.5);
      g.o.rotation.set(0, Math.PI + Math.sin(t * 0.4 + g.phase) * 0.12, Math.sin(t * 0.9 + g.phase) * 0.15);
      const glide = Math.sin(t * 1.1 + g.phase) > 0.2;
      const flap = glide ? 0.12 : Math.sin(t * 11 + g.phase) * 0.7;
      if (g.wl) g.wl.rotation.z = flap;
      if (g.wr) g.wr.rotation.z = -flap;
    }
    if (this.tv.parent && this.tvMode === 'start') {
      this.tvPulseT = (this.tvPulseT || 0) + dt;
      if (this.tvPulseT > 0.08) {
        this.tvPulseT = 0;
        this.drawTV((Math.sin(t * 5) + 1) / 2);
      }
      this.tvHalo.material.opacity = 0.25 + 0.2 * Math.sin(t * 5);
    } else if (this.tvHalo) this.tvHalo.material.opacity = 0;
  }
}

