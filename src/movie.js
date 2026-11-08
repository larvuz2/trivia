// 🎬 Movie mode (main menu): little ~10 s scenes with the gang, looping until you exit.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sfx, setMusicState } from './audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y_AXIS = V(0, 1, 0);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
class Cut extends Error {}

// The cast by name (falls back to the default slot if someone was renamed in Setup)
const SLOT = { joe: 'boy1', ray: 'boy2', gabriel: 'boy3', gus: 'boy4', jp: 'boy5', karla: 'girl1', pau: 'girl2', baby: 'girl3', caro: 'girl4' };

// Stage space: the party deck is y = 0; the sea is y = -3; the flybridge deck is y = 2.95.
const WATER = -3;
const FLY = 2.95;

export class MovieMode {
  /**
   * world, rig, confetti, splash, characters (getter), dj (getter), onExit
   */
  constructor(o) {
    Object.assign(this, o);
    this.active = false;
    this.token = 0;
    this.holders = [];
    this.extras = [];
    this.tick = null;
    this.time = 0;
    this.lastTitle = '';
  }

  sw(x, y, z) { return this.world.stage.localToWorld(V(x, y, z)); }
  who(name) {
    const cs = this.characters();
    return cs.find((c) => c.data.name.trim().toLowerCase() === name) || cs.find((c) => c.data.id === SLOT[name]);
  }
  /** everyone, couples side by side (girl then her guy) — works for any number of couples */
  get all() {
    const cs = this.characters();
    const ids = [...new Set(cs.map((c) => c.data.couple))].sort((a, b) => a - b);
    return ids.flatMap((cp) => ['girl', 'boy'].map((r) => cs.find((c) => c.data.couple === cp && c.data.role === r))).filter(Boolean);
  }
  /** everyone not already used by a scene */
  rest(used) { const u = new Set(used.filter(Boolean)); return this.all.filter((c) => !u.has(c)); }

  // ------------------------------------------------------------------ lifecycle
  async enter() {
    if (this.active) return;
    this.active = true;
    this.buildUI();
    if (!this.lib) {
      try {
        const gltf = await new GLTFLoader().loadAsync('models/movie_props.glb');
        this.lib = {};
        gltf.scene.traverse((o) => { if (o.isMesh || (o.children.length && o.parent === gltf.scene)) this.lib[o.name] = o; });
        for (const k of Object.keys(this.lib)) this.lib[k].traverse((m) => { if (m.isMesh) m.castShadow = true; });
      } catch (e) {
        console.warn('movie props failed to load', e);
        this.lib = {};
      }
    }
    this.savedFloats = (this.world.floats || []).map((f) => f.position.clone());
    setMusicState('party', 0.8);
    this.loop();
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.token++;
    this.cleanup();
    (this.world.floats || []).forEach((f, i) => this.savedFloats?.[i] && f.position.copy(this.savedFloats[i]));
    this.ui?.remove();
    this.ui = null;
    this.onExit?.();
  }

  next() { this.skipTo = true; this.token++; }

  onKey(k) {
    if (!this.active) return false;
    if (k === 'escape') this.exit();
    else if (k === 'arrowright' || k === 'n') this.next();
    return true;
  }

  buildUI() {
    this.ui = document.createElement('div');
    this.ui.className = 'movie-ui';
    this.ui.innerHTML = `
      <div class="mv-bar top"></div><div class="mv-bar bottom"></div>
      <div class="mv-fade"></div>
      <div class="mv-title"><span class="mv-num"></span><span class="mv-name"></span></div>
      <div class="mv-phone hidden"><div class="mv-rec">● REC</div><div class="mv-frame"></div></div>
      <div class="mv-buttons"><button data-mv="exit">✕ Exit</button><button data-mv="next">Next ⏭</button></div>`;
    document.body.appendChild(this.ui);
    this.ui.addEventListener('click', (e) => {
      const a = e.target.closest('[data-mv]')?.dataset.mv;
      if (a === 'exit') this.exit();
      if (a === 'next') this.next();
    });
    this.fader = this.ui.querySelector('.mv-fade');
  }

  fade(to, ms = 500) {
    this.fader.style.transitionDuration = `${ms}ms`;
    this.fader.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, ms));
  }

  setTitle(n, name) {
    const t = this.ui.querySelector('.mv-title');
    t.querySelector('.mv-num').textContent = `SCENE ${n}`;
    t.querySelector('.mv-name').textContent = name;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  /** await inside a scene: throws Cut when the scene was skipped or the movie exited */
  async wait(ms) {
    const tok = this.token;
    await new Promise((r) => setTimeout(r, ms));
    if (tok !== this.token || !this.active) throw new Cut();
  }

  async loop() {
    const scenes = this.scenes();
    let i = 0;
    await this.fade(1, 400);
    while (this.active) {
      const sc = scenes[(this.forced ?? i) % scenes.length];   // `forced`: debug, replay one scene
      this.token++;
      this.cleanup();
      this.time = 0;
      try {
        sc.setup.call(this);
        this.setTitle(((this.forced ?? i) % scenes.length) + 1, sc.name);
        await this.fade(0, 550);
        await sc.run.call(this);
        await this.fade(1, 450);
      } catch (e) {
        if (!(e instanceof Cut)) console.error('movie scene failed', sc.name, e);
        if (!this.active) return;
        await this.fade(1, 250);
      }
      i++;
    }
  }

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    this.tick?.(dt, this.time);
    for (const h of this.holders) h(dt, this.time);
  }

  // ------------------------------------------------------------------ helpers
  cleanup() {
    this.tick = null;
    this.holders = [];
    for (const o of this.extras) {
      o.parent?.remove(o);
      if (o.userData.own) o.traverse((n) => { n.geometry?.dispose?.(); n.material?.dispose?.(); });   // built per scene: free it
    }
    this.extras = [];
    this.ui?.querySelector('.mv-phone')?.classList.add('hidden');
    const w = this.world;
    w.setIntroMode(false);
    w.setSpotlight(null);
    w.setParty(0.6);
    if (w.startPedestal) w.startPedestal.visible = false;
    if (w.startButton) w.startButton.visible = false;
    this.dj()?.pop(false, true);
    for (const c of this.characters()) {
      c.bodyOverride = null;
      c.directed = true;
      c.noEmotes = true;
      c.emote.visible = false;
      c.blob.visible = true;
      c.target = null;
      c.showName(false);
      c.pop(false, true);
      c.root.position.y = 0;
    }
  }

  /** put someone somewhere doing something (stage space) */
  put(c, x, y, z, face, state = 'idle', phase = Math.random()) {
    if (!c) return c;
    c.target = null;
    c.place(x, z, face, 'idle');
    c.root.position.y = y;
    c.pop(true, true);
    this.act(c, state, phase);
    return c;
  }

  act(c, state, phase = Math.random()) {
    if (!c) return;
    c.baseState = state;
    c.stateDur = null;
    c.setState(state);
    const a = c.currentAction;
    if (a && phase != null) a.time = a.getClip().duration * phase;
  }

  faceTo(c, x, z) { const p = c.root.position; return Math.atan2(x - p.x, z - p.z); }

  prop(name, scale = 1) {
    const src = this.lib?.[name];
    if (!src) return null;
    const o = src.clone();
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.setScalar(scale);
    this.world.scene.add(o);
    this.extras.push(o);
    return o;
  }

  bone(c, name) { return c?.model?.getObjectByName(name) || null; }

  /** world position of a hand (a little past the wrist) */
  handPos(c, side = 'R', out = V(0, 0, 0)) {
    const b = this.bone(c, `hand${side}`);
    if (b) return b.localToWorld(out.set(0, 0.07, 0));
    return c.root.localToWorld(out.set(side === 'R' ? -0.35 : 0.35, 0.95, 0.3));
  }

  /** a drink that stays upright in someone's hand */
  hold(c, name, side = 'R', scale = 1) {
    const o = this.prop(name, scale);
    if (!o || !c) return o;
    const p = V(0, 0, 0);
    this.holders.push(() => {
      o.visible = c.root.visible;
      this.handPos(c, side, p);
      o.position.set(p.x, p.y - 0.06 * scale, p.z);
      o.rotation.set(0, c.root.rotation.y, 0);
    });
    return o;
  }

  /** headphones on the head bone */
  headphones(c) {
    const o = this.prop('headphones', 1.0);
    if (!o || !c) return o;
    const head = this.bone(c, 'head');
    if (head) {
      this.extras.splice(this.extras.indexOf(o), 1);
      head.add(o);
      this.extras.push(o);
      o.position.set(0, 0.42, 0.02);
    }
    return o;
  }

  confettiAt(x, y, z, n = 120, up = 8) { this.confetti.burst(this.sw(x, y, z), n, { up }); }

  cam(pos, look, fov = 45) { this.rig.cut(this.sw(...pos), this.sw(...look), fov); }
  move(pos, look, dur, fov = null, easing = 'inOut') { this.rig.shot(this.sw(...pos), this.sw(...look), dur, easing, fov); }

  // ------------------------------------------------------------------ the scenes
  scenes() {
    return [
      { name: 'CURTAIN CALL', setup: this.sternSetup, run: this.sternRun },
      { name: 'THE BAR', setup: this.barSetup, run: this.barRun },
      { name: 'SUN’S OUT', setup: this.sunSetup, run: this.sunRun },
      { name: 'HOT TUB TIME', setup: this.tubSetup, run: this.tubRun },
      { name: 'DANCE FLOOR', setup: this.danceSetup, run: this.danceRun },
      { name: 'SWIM CALL', setup: this.swimSetup, run: this.swimRun },
      { name: 'DJ JOE', setup: this.djSetup, run: this.djRun },
      { name: 'A FEW DRINKS LATER…', setup: this.rollSetup, run: this.rollRun },
      { name: 'GONE FISHING', setup: this.fishSetup, run: this.fishRun },
      { name: 'SELFIE FAIL', setup: this.selfieSetup, run: this.selfieRun },
      { name: 'CONGA!', setup: this.congaSetup, run: this.congaRun },
    ];
  }

  // 1 ── everyone on the swim platform under the yacht's name
  sternSetup() {
    this.world.setParty(1);
    const row = this.all;
    row.forEach((c, i) => {
      const x = (i - (row.length - 1) / 2) * Math.min(1.05, 9.0 / Math.max(1, row.length - 1));
      this.put(c, x, -2.2, -11.55 + (i % 2 ? 0.2 : -0.1), Math.PI + x * 0.03, 'idle');
    });
    this.cam([0, 2.1, -20.0], [0, -1.2, -9.4], 44);
    let acc = 0;
    this.tick = (dt) => {
      acc += dt;
      if (acc < 0.9) return;
      acc = 0;
      for (const c of row) if (c.state === 'idle' && Math.random() < 0.3) { c.stateDur = 1.6; c.setState('cheer', 1.4 + Math.random()); }
      if (Math.random() < 0.5) this.confettiAt((Math.random() < 0.5 ? -1 : 1) * (3.2 + Math.random() * 1.6), -1.0, -11.3, 60, 6);
    };
  }
  async sternRun() {
    this.move([0, 1.75, -18.6], [0, -1.2, -9.4], 5.5);
    this.all.forEach((c, i) => setTimeout(() => { c.stateDur = 2; c.setState('cheer', 2); }, 200 + i * 110));
    sfx('cheer');
    await this.wait(5600);
    this.cam([8.5, -1.6, -15.5], [0, -1.0, -11.4], 40);
    this.move([7.0, -1.2, -16.5], [-0.5, -0.9, -11.4], 4.2);
    await this.wait(4200);
  }

  // 2 ── the boys at the bar, toasting
  barSetup() {
    this.world.setParty(0.7);
    const boys = this.all.filter((c) => c.data.role === 'boy');
    const xs = boys.map((_, i) => 1.75 + i * (3.6 / Math.max(1, boys.length - 1)));
    const drinks = ['cup', 'margarita', 'beer', 'cup', 'beer', 'margarita'];
    boys.forEach((c, i) => {
      this.put(c, xs[i], 0, 3.5, (3.55 - xs[i]) * 0.18, 'cheers', 0);
      this.hold(c, drinks[i]);
    });
    this.boys = boys;
    this.cam([2.2, 1.55, 6.5], [3.0, 1.25, 3.5], 46);
    let last = 0;
    this.tick = (dt, t) => {
      const k = Math.floor((t - 0.8) / 3.0);
      if (t > 0.8 && k >= last) { last = k + 1; sfx('clink'); }
    };
  }
  async barRun() {
    this.move([4.9, 1.6, 6.4], [4.0, 1.25, 3.5], 4.2);
    await this.wait(4200);
    this.cam([3.55, 1.5, 5.75], [3.55, 1.5, 3.5], 32);
    this.move([3.55, 1.45, 5.55], [3.55, 1.45, 3.5], 3.0);
    await this.wait(3000);
    // from the end of the bar: their profiles toasting, the neon behind
    this.cam([0.5, 1.35, 2.6], [3.6, 1.4, 3.9], 42);
    this.move([0.7, 1.5, 2.2], [3.9, 1.45, 3.9], 3.2);
    await this.wait(3200);
  }

  // 3 ── the girls sunbathing on the flybridge pads
  sunSetup() {
    this.world.setParty(0);
    const top = FLY + 0.675;
    const lie = (c, x) => {
      this.put(c, x, top + 0.2, 4.45, Math.PI, 'sunbathe');
      const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2);
      c.bodyOverride = (b) => { b.position.set(0, 0, 0); b.quaternion.copy(q); };
      c.blob.visible = false;
    };
    lie(this.who('karla'), 3.85);
    lie(this.who('pau'), 4.95);
    lie(this.who('baby'), -3.85);
    lie(this.who('caro'), -4.95);
    // any other girls: on beach towels on the teak deck in front of the tub
    this.rest([this.who('karla'), this.who('pau'), this.who('baby'), this.who('caro')]).filter((c) => c.data.role === 'girl').forEach((c, i) => {
      this.put(c, (i % 2 ? 1 : -1) * 0.7 * (1 + Math.floor(i / 2)), FLY + 0.22, 1.7, Math.PI, 'sunbathe');
      const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2);
      c.bodyOverride = (b) => { b.position.set(0, 0, 0); b.quaternion.copy(q); };
      c.blob.visible = false;
    });
    this.cam([-1.5, 12.5, 2.2], [0, FLY, 5.2], 50);
  }
  async sunRun() {
    this.move([1.5, 12.0, 7.6], [0, FLY, 5.0], 5.0);
    await this.wait(5000);
    this.cam([4.4, FLY + 1.15, 2.2], [4.4, FLY + 0.8, 6.4], 40);
    this.move([4.4, FLY + 1.35, 2.9], [4.4, FLY + 0.75, 6.4], 5.0);
    await this.wait(5000);
  }

  // 4 ── all eight in the hot tub
  tubSetup() {
    this.world.setParty(0.8);
    const cx = 0;
    const cz = 4.8;
    const water = FLY + 0.66;
    const states = ['idle', 'cheers', 'laugh', 'idle2', 'cheers', 'idle', 'laugh', 'idle2'];
    const tubN = this.all.length;
    this.all.forEach((c, i) => {
      const a = (i / tubN) * Math.PI * 2 + 0.2;
      const rr = tubN > 8 ? 1.42 : 1.3;
      const x = cx + Math.sin(a) * rr;
      const z = cz + Math.cos(a) * rr;
      this.put(c, x, water - 0.95, z, Math.atan2(cx - x, cz - z), states[i % states.length]);
      c.blob.visible = false;
    });
    this.hold(this.who('ray'), 'margarita');
    this.hold(this.who('pau'), 'margarita');
    this.hold(this.who('gus'), 'beer');
    this.hold(this.who('caro'), 'cup');
    this.rig.cut(this.sw(0, water + 2.7, cz - 4.6), this.sw(cx, water + 0.4, cz), 45);
    this.rig.startOrbit(this.sw(cx, water, cz), 4.6, 2.7, 0.22, null, V(0, 0.4, 0));
  }
  async tubRun() {
    await this.wait(5500);
    const ray = this.who('ray');
    const pau = this.who('pau');
    if (ray && pau) {
      const m = ray.root.position.clone().add(pau.root.position).multiplyScalar(0.5);
      const out = m.clone().sub(V(0, 0, 4.8)).setY(0).normalize();
      this.cam([m.x + out.x * 2.4, FLY + 1.45, m.z + out.z * 2.4], [m.x, FLY + 1.05, m.z], 38);
      this.move([m.x + out.x * 2.0, FLY + 1.35, m.z + out.z * 2.0], [m.x, FLY + 1.05, m.z], 4.5);
      this.act(ray, 'cheers', 0);
      this.act(pau, 'cheers', 0);
      setTimeout(() => sfx('clink'), 800);
    }
    await this.wait(4500);
  }

  // 5 ── everybody on the LED dance floor
  danceSetup() {
    const w = this.world;
    w.setIntroMode(true);
    w.setParty(1);
    const dj = this.dj();
    if (dj) {
      const s = w.layout?.spots?.dj?.[0] || [-3.8, 5.65];
      dj.place(s[0], s[1], Math.PI, 'dj');
      dj.root.position.y = 0.42;
      dj.pop(true, true);
    }
    // a dance circle facing out, so the circling camera always sees faces
    const moves = ['dance', 'dance2', 'excited'];
    const circleN = this.all.length;
    const circleR = circleN > 8 ? 1.75 : 1.55;
    this.all.forEach((c, i) => {
      const a = (i / circleN) * Math.PI * 2;
      this.put(c, Math.sin(a) * circleR, 0, -2 + Math.cos(a) * circleR, a + (Math.random() - 0.5) * 0.4, moves[i % 3]);
    });
    let acc = 0;
    this.tick = (dt) => {
      acc += dt;
      if (acc < 2.4) return;
      acc = 0;
      for (const c of this.all) if (Math.random() < 0.45) this.act(c, moves[Math.floor(Math.random() * 3)]);
    };
    this.rig.cut(this.sw(-5.5, 1.0, -6.5), this.sw(0, 1.2, -2), 48);
    this.rig.startOrbit(this.sw(0, 0, -2), 5.6, 1.0, 0.32, null, V(0, 1.2, 0));
  }
  async danceRun() {
    await this.wait(5200);
    this.confettiAt(0, 3, -2, 220, 4);
    sfx('airhorn');
    this.cam([0, 6.4, -8.6], [0, 0.6, -2.0], 46);
    this.move([0, 4.6, -6.6], [0, 0.8, -2.0], 4.8);
    await this.wait(4800);
  }

  // 6 ── swimming behind the boat
  swimSetup() {
    this.world.setParty(0);
    const spots = [[-3.6, -14.0], [-2.3, -15.3], [-1.0, -13.7], [0.3, -15.6], [1.5, -13.9], [2.7, -15.2], [3.9, -14.1], [-0.4, -17.0], [-2.7, -17.3], [2.1, -17.2], [4.4, -16.4], [-4.6, -16.2]];
    this.all.forEach((c, i) => {
      const [x, z] = spots[i];
      this.put(c, x, WATER - 1.0, z, Math.atan2(-x * 0.3, -20 - z) + Math.PI * 0, 'swim');
      c.root.rotation.y = c.facing = c.targetFacing = Math.atan2(0 - x, -21 - z);
      c.blob.visible = false;
      const ph = Math.random() * 6;
      const base = c.root.position.y;
      this.holders.push((dt, t) => { c.root.position.y = base + Math.sin(t * 1.8 + ph) * 0.06; });
    });
    // move the inflatables in among them
    const fl = this.world.floats || [];
    const fpos = [[-5.2, -13.4], [5.0, -13.0]];   // off to the sides, out of the camera's way
    fl.slice(0, 2).forEach((f, i) => { const p = this.sw(fpos[i][0], WATER, fpos[i][1]); f.position.x = p.x; f.position.z = p.z; });
    // a beach ball going back and forth
    const ball = this.prop('beach_ball', 1.2);
    const a = this.who('karla');
    const b = this.who('ray');
    if (ball && a && b) {
      const pa = V(0, 0, 0);
      const pb = V(0, 0, 0);
      this.holders.push((dt, t) => {
        const k = (t % 2.6) / 2.6;
        const fwd = Math.floor(t / 2.6) % 2 === 0;
        this.handPos(a, 'R', pa);
        this.handPos(b, 'L', pb);
        const s = fwd ? k : 1 - k;
        ball.position.lerpVectors(pa, pb, s);
        ball.position.y += Math.sin(Math.PI * k) * 2.2 + 0.25;
        ball.rotation.x += dt * 3;
        ball.rotation.z += dt * 2;
      });
    }
    this.cam([-6.5, WATER + 0.35, -20.5], [0, WATER + 0.6, -14.5], 44);
  }
  async swimRun() {
    this.move([5.5, WATER + 0.4, -20.5], [0.5, WATER + 0.6, -14.5], 5.0);
    await this.wait(5000);
    this.cam([0.2, -1.3, -11.6], [0.2, WATER + 0.2, -17.5], 48);
    this.move([-0.6, -1.0, -11.4], [0.4, WATER + 0.3, -17.5], 5.0);
    await this.wait(5000);
  }

  // 7 ── Joe on the decks, everyone else dancing
  djSetup() {
    const w = this.world;
    w.setIntroMode(true);
    w.setParty(1);
    const s = w.layout?.spots?.dj?.[0] || [-3.8, 5.65];
    const joe = this.who('joe');
    this.put(joe, s[0], 0.42, s[1], Math.PI, 'dj');
    this.headphones(joe);
    const crowd = this.all.filter((c) => c !== joe);
    const spots = [[-5.2, 2.3], [-4.2, 2.0], [-3.1, 2.2], [-2.1, 2.5], [-4.7, 3.3], [-3.6, 3.15], [-2.6, 3.4], [-5.6, 3.6], [-1.6, 3.4], [-1.2, 2.2], [-5.9, 2.4]];
    const moves = ['dance', 'dance2', 'excited', 'dance2', 'dance', 'excited', 'dance2', 'dance', 'excited', 'dance2', 'dance'];
    crowd.forEach((c, i) => this.put(c, spots[i][0], 0, spots[i][1], this.faceTo({ root: { position: V(spots[i][0], 0, spots[i][1]) } }, s[0], s[1]), moves[i]));
    let acc = 0;
    this.tick = (dt) => {
      acc += dt;
      if (acc < 2.0) return;
      acc = 0;
      for (const c of crowd) if (Math.random() < 0.4) this.act(c, ['dance', 'dance2', 'excited'][Math.floor(Math.random() * 3)]);
    };
    this.cam([-3.5, 2.55, 7.4], [-3.8, 1.3, 2.4], 50);
  }
  async djRun() {
    this.move([-3.0, 2.4, 7.2], [-3.8, 1.3, 2.4], 3.6);
    await this.wait(3600);
    // from the back of the crowd, looking up at Joe over their heads
    this.cam([-3.2, 1.0, 0.4], [-3.8, 2.1, 5.6], 44);
    this.move([-3.6, 1.15, 1.0], [-3.8, 2.2, 5.6], 3.0);
    sfx('scratch');
    await this.wait(3000);
    this.cam([0.6, 1.7, 1.4], [-3.8, 1.5, 4.2], 44);
    this.move([0.2, 1.9, 2.2], [-3.9, 1.5, 4.4], 3.4);
    this.confettiAt(-3.8, 3, 3.2, 160, 3);
    await this.wait(3400);
  }

  // 8 ── Ray, a few drinks in, barrel-rolling across the deck
  rollSetup() {
    this.world.setParty(0.6);
    const ray = this.who('ray');
    const R = 0.3;
    const x0 = 4.6;
    this.put(ray, x0, 0, -1.4, 0, 'idle', 0);
    ray.blob.visible = false;
    const qLie = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2);
    const qRoll = new THREE.Quaternion();
    this.rollX = x0;
    ray.bodyOverride = (b) => {
      const t = this.time;
      const x = x0 - Math.min(t, 9.6) * 0.95;
      const roll = (x0 - x) / R;
      this.rollX = x;
      ray.root.position.x = x;
      qRoll.setFromAxisAngle(V(0, 0, 1), roll);
      b.quaternion.copy(qRoll).multiply(qLie);
      b.position.set(0, R, 0);
    };
    const fans = [['joe', -3.4, 0.6], ['karla', -2.2, 0.9], ['gabriel', -0.6, 1.0], ['baby', 0.7, 0.9], ['gus', 2.0, 0.8], ['caro', 3.2, 0.6], ['pau', 4.6, 0.3]];
    fans.forEach(([n, x, z], i) => {
      const c = this.who(n);
      this.put(c, x, 0, z, Math.PI, i % 3 === 1 ? 'cheers' : 'laugh');
      if (i % 3 === 1) this.hold(c, ['cup', 'margarita', 'beer'][i % 3]);
    });
    this.hold(this.who('pau'), 'margarita');
    this.rest([this.who('ray'), ...fans.map(([n]) => this.who(n))]).forEach((c, i) => this.put(c, -1.4 + i * 2.6, 0, 2.0, Math.PI, i % 2 ? 'laugh' : 'cheers'));
    this.cam([x0 + 0.6, 0.45, -4.6], [x0, 0.4, -1.4], 46);
    this.rig.follow(() => ({ pos: this.sw(this.rollX + 0.9, 0.75, -5.4), look: this.sw(this.rollX - 0.5, 0.55, -1.0) }));
  }
  async rollRun() {
    await this.wait(5800);
    this.cam([-5.2, 4.0, -5.8], [this.rollX, 0.3, -1.0], 44);
    this.rig.follow(() => ({ pos: this.sw(-5.4, 3.8, -5.6), look: this.sw(this.rollX, 0.4, -0.8) }));
    await this.wait(4200);
  }

  // 9 ── Gabriel fishing off the side deck; a dorado jumps
  fishSetup() {
    this.world.setParty(0);
    const gab = this.who('gabriel');
    this.put(gab, 5.45, 0, 14.5, Math.PI / 2, 'fish', 0);
    const rod = this.prop('rod', 1);
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshStandardMaterial({ color: '#ff3b3b', roughness: 0.4 }));
    bob.userData.own = true;
    this.world.scene.add(bob);
    this.extras.push(bob);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0)]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.8 }));
    line.userData.own = true;
    this.world.scene.add(line);
    this.extras.push(line);
    // the fal/Meshy dorado (nose turned to +x for the jump below), or the Blender one as a fallback
    let fish = null;
    const env = this.env?.();
    if (env?.lib?.dorado) {
      fish = new THREE.Group();
      const d = env.clone('dorado');
      d.rotation.y = -Math.PI / 2;
      d.scale.setScalar(1.15);
      fish.add(d);
      this.world.scene.add(fish);
      this.extras.push(fish);
    } else fish = this.prop('fish', 1.3);
    if (fish) fish.visible = false;
    this.fish = fish;
    const pL = V(0, 0, 0);
    const pR = V(0, 0, 0);
    const tip = V(0, 0, 0);
    const bobBase = this.sw(9.6, WATER + 0.02, 14.8);
    const fwd = V(0, 0, 0);
    this.holders.push((dt, t) => {
      if (!rod) return;
      this.handPos(gab, 'R', pR);
      this.handPos(gab, 'L', pL);
      rod.position.copy(pR).add(pL).multiplyScalar(0.5);
      // aim the rod out over the water, tipping up on the tug
      const tug = gab.currentAction ? Math.max(0, Math.sin(Math.PI * clamp01(((gab.currentAction.time / 3) % 1 - 0.62) / 0.18))) : 0;
      const yaw = gab.root.getWorldQuaternion(new THREE.Quaternion());
      fwd.set(0, 0.55 + 0.45 * tug, 1).normalize().applyQuaternion(yaw);
      rod.quaternion.setFromUnitVectors(Y_AXIS, fwd);
      tip.set(0, 2.25, 0);
      rod.localToWorld(tip);
      bob.position.copy(bobBase);
      bob.position.y += Math.sin(t * 2.2) * 0.04 - tug * 0.12;
      const pos = line.geometry.attributes.position;
      pos.setXYZ(0, tip.x, tip.y, tip.z);
      pos.setXYZ(1, bob.position.x, bob.position.y, bob.position.z);
      pos.needsUpdate = true;
    });
    this.cam([14.0, 3.1, 10.2], [6.0, 1.1, 14.5], 34);
  }
  async fishRun() {
    this.move([13.0, 2.7, 11.2], [6.2, 1.2, 14.6], 4.0, 32);
    await this.wait(4000);
    this.cam([4.2, 2.1, 13.4], [9.6, WATER + 0.3, 15.2], 46);
    await this.wait(900);
    // the dorado leaps
    const f = this.fish;
    const from = this.sw(9.0, WATER - 0.4, 16.2);
    const to = this.sw(10.8, WATER - 0.4, 13.4);
    if (f) {
      f.visible = true;
      sfx('splash');
      this.splash.burst(from.clone(), 60);
      const t0 = this.time;
      this.holders.push(() => {
        const k = (this.time - t0) / 1.25;
        if (k > 1) { if (f.visible) { f.visible = false; this.splash.burst(to.clone(), 80); sfx('splash'); } return; }
        f.position.lerpVectors(from, to, k);
        f.position.y += Math.sin(Math.PI * k) * 2.6;
        const dir = to.clone().sub(from).normalize();
        f.rotation.set(0, Math.atan2(-dir.z, dir.x), (0.5 - k) * 2.2);
      });
    }
    const gab = this.who('gabriel');
    await this.wait(1400);
    gab.stateDur = 2.2;
    gab.setState('excited', 2.2);
    gab.baseState = 'fish';
    this.cam([7.6, 1.55, 16.2], [5.5, 1.4, 14.5], 40);
    this.move([7.2, 1.6, 15.8], [5.5, 1.45, 14.5], 3.6);
    await this.wait(3700);
  }

  // 10 ── Gus takes a selfie… and goes overboard
  selfieSetup() {
    this.world.setParty(0.4);
    const gus = this.who('gus');
    const z0 = 1.25;
    this.put(gus, -5.0, 0, z0, Math.PI / 2, 'selfie', 0);
    // the photobombers squeeze in beside Gus, all facing his phone
    this.put(this.who('ray'), -4.9, 0, 0.35, Math.PI / 2 + 0.25, 'excited');
    this.put(this.who('pau'), -4.85, 0, 2.1, Math.PI / 2 - 0.25, 'dance2');
    this.put(this.who('gabriel'), -5.45, 0, 2.85, Math.PI / 2 - 0.4, 'wave');
    const phone = this.prop('phone', 1.4);
    const head = V(0, 0, 0);
    const p = V(0, 0, 0);
    if (phone) {
      this.holders.push(() => {
        this.handPos(gus, 'R', p);
        phone.position.copy(p);
        const hb = this.bone(gus, 'head');
        if (hb) hb.getWorldPosition(head); else head.copy(gus.root.position).add(V(0, 1.6, 0));
        phone.lookAt(head);
      });
    }
    this.gusFall = null;
    gus.bodyOverride = (b) => {
      const f = this.gusFall;
      if (!f) return;
      const k = clamp01((this.time - f.t0) / 1.3);
      // backwards over the rail (Gus faces +x, so backwards is -x) and down into the sea
      gus.root.position.x = lerp(f.x0, -8.2, smooth(k));
      gus.root.position.y = lerp(0, WATER - 1.0, k * k) + Math.sin(Math.PI * Math.min(1, k * 1.6)) * 0.9;
      b.rotation.x = -Math.min(1, k * 1.4) * 2.6;
      b.position.y = 0.6 * Math.sin(Math.PI * k);
    };
    // the selfie camera's point of view
    this.ui.querySelector('.mv-phone').classList.remove('hidden');
    this.cam([-2.5, 1.95, z0 + 0.35], [-5.0, 1.5, z0 + 0.5], 54);
  }
  async selfieRun() {
    const gus = this.who('gus');
    const z0 = 1.25;
    sfx('click');
    await this.wait(2600);
    this.ui.querySelector('.mv-phone').classList.add('hidden');
    // wide: he backs up for a better angle…
    this.cam([0.4, 1.6, -3.6], [-5.6, 1.1, 1.0], 46);
    const x0 = gus.root.position.x;
    const t0 = this.time;
    this.holders.push(() => { if (!this.gusFall) gus.root.position.x = x0 - Math.min(1, (this.time - t0) / 1.6) * 0.7; });
    await this.wait(1700);
    this.gusFall = { t0: this.time, x0: gus.root.position.x };
    gus.baseState = 'excited';
    gus.setState('excited');
    sfx('boing');
    for (const n of ['ray', 'gabriel', 'pau']) this.act(this.who(n), 'excited');
    await this.wait(1250);
    sfx('splash');
    this.splash.burst(this.sw(-8.2, WATER, z0), 180);
    this.rig.shake(0.4);
    // …and pops up, still filming
    gus.bodyOverride = null;
    gus.body.rotation.set(0, 0, 0);
    this.put(gus, -8.2, WATER - 1.0, z0, -Math.PI / 2 + Math.PI, 'swim');
    gus.blob.visible = false;
    for (const [n, z] of [['ray', 0.35], ['pau', 1.3], ['gabriel', 2.2]]) this.put(this.who(n), -5.55, 0, z, -Math.PI / 2, 'laugh');
    this.cam([-12.4, -1.9, -0.6], [-7.0, -1.3, 1.2], 44);
    this.move([-12.0, -1.7, 0.0], [-7.2, -1.2, 1.2], 4.0);
    await this.wait(1000);
    gus.setState('selfie');
    gus.baseState = 'selfie';
    await this.wait(3300);
  }

  // 11 ── the conga line… and the pile-up
  congaSetup() {
    const w = this.world;
    w.setIntroMode(true);
    w.setParty(1);
    const named = ['joe', 'karla', 'ray', 'pau', 'gabriel', 'baby', 'gus', 'caro'].map((n) => this.who(n)).filter(Boolean);
    const line = [...named, ...this.rest(named)];
    const C = V(0, 0, -1.8);
    const R = 2.7;
    const speed = 1.05;
    const gap = 0.78;
    this.conga = { line, C, R, stopAt: 6.4, stopped: false };
    line.forEach((c, i) => this.put(c, 0, 0, 0, 0, 'conga', (i * 0.37) % 1));
    const posAt = (s) => V(C.x + Math.sin(s / R) * R, 0, C.z + Math.cos(s / R) * R);
    this.tick = (dt, t) => {
      const cg = this.conga;
      const tt = Math.min(t, cg.stopAt);
      line.forEach((c, i) => {
        if (cg.stopped) return;
        const s = tt * speed - i * gap;
        const p = posAt(s);
        const q = posAt(s + 0.05);
        c.root.position.x = p.x;
        c.root.position.z = p.z;
        c.facing = c.targetFacing = Math.atan2(q.x - p.x, q.z - p.z);
      });
      if (t >= cg.stopAt && !cg.stopped) {
        cg.stopped = true;
        sfx('scratch');
        line.forEach((c, i) => setTimeout(() => {
          if (!this.active) return;
          c.baseState = 'laugh';
          c.stateDur = null;
          c.setState('stumble', 1.3);
          sfx(i % 2 ? 'thud' : 'boing');
        }, 120 + i * 140));
      }
    };
    this.rig.cut(this.sw(0, 2.6, -9.2), this.sw(0, 0.8, -1.8), 46);
    this.rig.startOrbit(this.sw(0, 0, -1.8), 7.2, 2.4, 0.18, null, V(0, 0.8, 0));
  }
  async congaRun() {
    await this.wait(6300);
    const lead = this.conga.line[0];
    const p = lead.root.position;
    const f = lead.facing;
    this.cam([p.x + Math.sin(f) * 3.4, 0.6, p.z + Math.cos(f) * 3.4], [p.x - Math.sin(f) * 1.5, 0.4, p.z - Math.cos(f) * 1.5], 46);
    await this.wait(3900);
  }
}
