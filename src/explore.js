// Explore mode: walk a character around the yacht with real physics.
// Rapier (WASM) is loaded only when you first enter. The simulation runs in the yacht's own space,
// so the gentle bobbing is purely visual. Static scenery = one trimesh of the whole yacht;
// stools, tables, bottles, glasses, the bucket, fruit bowl and bean bags are dynamic bodies
// (tagged in Blender via glTF extras: { dyn: 'cylinder' | 'ball', mass }).
import * as THREE from 'three';
import { sfx, setMusicState, getMusicState } from './audio.js';
import { mediaURL } from './storage.js';

const STEP = 1 / 60;
const GRAVITY = -20;
const WALK = 4.2;
const RUN = 7.5;
const JUMP = 8.6;
const CAP_HALF = 0.6;   // capsule half-height (cylinder part)
const CAP_R = 0.38;
const FOOT = CAP_HALF + CAP_R; // body centre -> feet

// the shipping box on the deck that plays the host's video (Setup → Settings → Deck box video)
const BOX_AT = { x: 3.4, z: -3.2 };   // relative to the stage centre, yacht space
const BOX_SIZE = 0.8;
const BOX_REACH = 1.9;

function cardboardTexture(letter) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#b8864f';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {           // fibres
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,60,30' : '230,190,140'},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1);
  }
  g.fillStyle = 'rgba(200,170,110,0.85)';    // packing tape
  g.fillRect(104, 0, 48, 256);
  if (letter) {
    g.fillStyle = '#1c1c1c';
    g.beginPath(); g.arc(128, 128, 62, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 84px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letter, 128, 134);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SOUND = { bottle: 'clink', glass: 'clink', stool: 'clank', bucket: 'clank', table: 'knock', bowl: 'knock', beanbag: null };

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export class ExploreMode {
  /** o: { world, rig, camera, canvas, characters: () => Character[], splash, onExit } */
  constructor(o) {
    Object.assign(this, o);
    this.active = false;
    this.keys = new Set();
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.dist = 5.8;
    this.acc = 0;
    this.vy = 0;
    this.grounded = false;
    this.jumpQueued = false;
    this.raycaster = new THREE.Raycaster();
    this.lastSound = 0;
  }

  // ------------------------------------------------------------------ physics world
  async ensurePhysics() {
    if (this.R) return;
    const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
    await RAPIER.init();
    this.R = RAPIER;
    const w = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.pw = w;
    const model = this.world.yachtModel;
    const yacht = this.world.yacht;
    // freeze the bob while we read geometry so everything is in clean yacht space
    const saved = { p: yacht.position.clone(), r: yacht.rotation.clone() };
    yacht.position.set(0, 0, 0);
    yacht.rotation.set(0, 0, 0);
    yacht.updateMatrixWorld(true);

    // --- static scenery: one trimesh ---
    const positions = [];
    const indices = [];
    const v = new THREE.Vector3();
    const addMesh = (mesh) => {
      const g = mesh.geometry;
      const pos = g.attributes.position;
      if (!pos) return;
      const base = positions.length / 3;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        positions.push(v.x, v.y, v.z);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) indices.push(base + g.index.getX(i));
      else for (let i = 0; i < pos.count; i++) indices.push(base + i);
    };
    this.props = [];
    const visit = (node) => {
      if (node.userData?.batch) return;   // the merged display copy of the bottles (world.batchBottles)
      if (node.userData?.dyn) { this.addProp(node); return; }
      // thin overhead decorations (string-light wires, bulbs) aren't solid
      const matName = node.material?.name;
      if (node.isMesh && node.name !== 'hot_tub_water' && matName !== 'bulb' && matName !== 'dark') addMesh(node);
      node.children.forEach(visit);
    };
    model.children.forEach(visit);
    w.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(positions), new Uint32Array(indices)).setFriction(0.8));
    yacht.position.copy(saved.p);
    yacht.rotation.copy(saved.r);
    yacht.updateMatrixWorld(true);

    // --- the player: kinematic capsule + character controller ---
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, -20));
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(CAP_HALF, CAP_R).setFriction(0.2), this.body);
    const kcc = w.createCharacterController(0.03);
    kcc.setUp({ x: 0, y: 1, z: 0 });
    kcc.enableAutostep(0.42, 0.2, true);
    kcc.enableSnapToGround(0.35);
    kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    kcc.setApplyImpulsesToDynamicBodies(true);
    if (kcc.setCharacterMass) kcc.setCharacterMass(75);
    this.kcc = kcc;
  }

  addProp(node) {
    const R = this.R;
    const mass = node.userData.mass || 1;
    const kind = (node.name.match(/^dyn_([a-z]+)/) || [])[1] || 'prop';
    // collider from the prop's own bounding box (origin was centred in Blender)
    node.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    const box = new THREE.Box3();
    node.traverse((m) => {
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      box.union(b);
    });
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    let cd;
    if (node.userData.dyn === 'ball') {
      const r = Math.min(size.x, size.z) / 2;
      const hh = Math.max(0.01, size.y / 2 - 0.18);
      cd = R.ColliderDesc.roundCylinder(hh, Math.max(0.05, r - 0.18), 0.18);
    } else {
      cd = R.ColliderDesc.cylinder(size.y / 2, Math.max(size.x, size.z) / 2 * 0.96);
    }
    cd.setTranslation(c.x, c.y, c.z).setMass(mass).setFriction(kind === 'beanbag' ? 1.0 : 0.6).setRestitution(kind === 'bottle' || kind === 'glass' ? 0.12 : 0.18);
    const p = node.position;
    const q = node.quaternion;
    const bd = R.RigidBodyDesc.dynamic()
      .setTranslation(p.x, p.y + 0.01, p.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.15)
      .setAngularDamping(0.35)
      .setCanSleep(true)
      .setCcdEnabled(mass < 1.5);
    const body = this.pw.createRigidBody(bd);
    this.pw.createCollider(cd, body);
    body.sleep();
    const prop = { node, body, kind, mass, home: { p: p.clone(), q: q.clone() }, lastV: 0, lastSound: 0, wet: false };
    node.userData.prop = prop;
    this.props.push(prop);
  }

  // ------------------------------------------------------------------ enter / exit
  async enter(index = 0) {
    this.showLoading(true);
    await this.ensurePhysics();
    this.showLoading(false);
    this.buildBox();
    this.prepVideo();
    this.active = true;
    this.world.setPropBatching?.(false);   // the real physics bottles
    this.chars = this.characters();
    this.setPlayer(index);
    this.spawn();
    this.buildHUD();
    this.rig.setShift(0);
    this.rig.fovTarget = 55;
    this.rig.sway = 0;
    this.rig.follow((dt) => this.cameraFrame(dt));
    this.camPos = null;
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.keys.clear();
    this.resetProps();
    this.world.setPropBatching?.(true);    // back to the merged display copy
    this.closeVideo();
    this.hud?.remove();
    this.hud = null;
    if (this.box) this.box.visible = false;
    this.rig.fovTarget = 42;
    this.rig.sway = 1;
    if (this.player) {
      this.player.baseState = 'idle';
      this.player.setState('idle');
      this.player.pop(false, true);
    }
    this.onExit?.();
  }

  setPlayer(index) {
    this.index = (index + this.chars.length) % this.chars.length;
    for (const c of this.chars) { c.pop(false, true); c.showName(false); c.target = null; }
    this.player = this.chars[this.index];
    this.player.pop(true);
    this.player.baseState = 'move';
    this.player.setState('move');
    this.player.root.position.y = 0;
    const n = this.hud?.querySelector('[data-who]');
    if (n) n.textContent = this.player.data.name;
  }

  spawn() {
    const s = this.world.stage.position;
    this.body.setTranslation({ x: s.x, y: s.y + FOOT + 0.05, z: s.z - 5 }, true);
    this.body.setNextKinematicTranslation({ x: s.x, y: s.y + FOOT + 0.05, z: s.z - 5 });
    this.vy = 0;
    this.yaw = Math.PI;
  }

  resetProps() {
    for (const pr of this.props || []) {
      pr.body.setTranslation({ x: pr.home.p.x, y: pr.home.p.y + 0.01, z: pr.home.p.z }, false);
      pr.body.setRotation({ x: pr.home.q.x, y: pr.home.q.y, z: pr.home.q.z, w: pr.home.q.w }, false);
      pr.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      pr.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      pr.body.sleep();
      pr.node.position.copy(pr.home.p);
      pr.node.quaternion.copy(pr.home.q);
      pr.wet = false;
    }
  }

  // ------------------------------------------------------------------ HUD
  showLoading(on) {
    if (on) {
      this.loadEl = el('<div class="explore-loading">Loading physics…</div>');
      document.body.appendChild(this.loadEl);
    } else this.loadEl?.remove();
  }

  buildHUD() {
    this.hud?.remove();
    this.hud = el(`<div class="explore-hud">
      <div class="xh-top">
        <button class="btn btn-ghost" data-x="exit">✕ Exit</button>
        <div class="xh-who">🕹️ <span data-who>${this.player.data.name}</span></div>
        <button class="btn btn-ghost" data-x="switch" title="Switch character (Tab)">👤 Switch</button>
        <button class="btn btn-ghost" data-x="reset" title="Put everything back (R)">↺ Reset props</button>
      </div>
      <div class="xh-help">
        <b>WASD / ←↑↓→</b> walk · <b>Shift</b> run · <b>Space</b> jump · <b>E</b> shove (or 📦 video) · <b>Click</b> poke · <b>Drag</b> look · <b>Scroll</b> zoom
      </div>
    </div>`);
    this.hud.addEventListener('click', (e) => {
      const a = e.target.closest('[data-x]')?.dataset.x;
      if (a === 'exit') this.exit();
      if (a === 'switch') this.switchPlayer();
      if (a === 'reset') { this.resetProps(); sfx('pop'); }
    });
    document.body.appendChild(this.hud);
  }

  switchPlayer() {
    const t = this.body.translation();
    this.setPlayer(this.index + 1);
    this.body.setNextKinematicTranslation(t);
    sfx('pop');
  }

  // ------------------------------------------------------------------ input
  onKeyDown(e) {
    if (!this.active) return false;
    const k = e.key.toLowerCase();
    if (this.videoEl) { if (k === 'escape' || k === 'x') this.closeVideo(); return true; }
    if (k === 'escape') { this.exit(); return true; }
    if (k === 'tab') { e.preventDefault(); this.switchPlayer(); return true; }
    if (k === ' ') { e.preventDefault(); if (!e.repeat) this.jumpQueued = true; return true; }
    if (k === 'e' && !e.repeat) { if (this.nearBox) this.playVideo(); else this.shove(); return true; }
    if (k === 'r' && !e.repeat) { this.resetProps(); sfx('pop'); return true; }
    this.keys.add(k);
    if (k.startsWith('arrow')) e.preventDefault();
    return true;
  }

  onKeyUp(e) {
    if (!this.active) return false;
    this.keys.delete(e.key.toLowerCase());
    return true;
  }

  onPointerDown(e) {
    if (!this.active) return false;
    if (this.videoEl) return true;
    if (e.button !== 0) return false;
    this.drag = { x: e.clientX, y: e.clientY, moved: 0 };
    return true;
  }

  onPointerMove(e) {
    if (!this.active) return false;
    if (this.drag) {
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.yaw -= dx * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, -0.15, 1.2);
    }
    return true;
  }

  onPointerUp(e) {
    if (!this.active) return false;
    if (this.drag && this.drag.moved < 6) this.poke(e);
    this.drag = null;
    return true;
  }

  onWheel(e) {
    if (!this.active) return false;
    this.dist = THREE.MathUtils.clamp(this.dist + Math.sign(e.deltaY) * 0.6, 2.5, 11);
    return true;
  }

  // ------------------------------------------------------------------ interactions
  toLocal(v) { return this.world.yacht.worldToLocal(v.clone()); }

  /** Click on a prop: give it a flick in the direction you're looking. */
  poke(e) {
    const p = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const hit = this.raycaster.intersectObjects(this.props.map((x) => x.node), true)[0];
    if (!hit) return;
    let n = hit.object;
    while (n && !n.userData.prop) n = n.parent;
    const pr = n?.userData.prop;
    if (!pr) return;
    const dir = this.raycaster.ray.direction.clone();
    dir.applyQuaternion(this.world.yacht.quaternion.clone().invert());
    const pt = this.toLocal(hit.point);
    const small = pr.kind === 'bottle' || pr.kind === 'glass';
    if (small) {
      // swat it off the shelf toward you (otherwise it would just hit the wall behind it)
      dir.set(-dir.x, 0, -dir.z).normalize().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, 0));
    }
    const s = pr.mass * (small ? 3.2 : 6);
    pr.body.applyImpulseAtPoint({ x: dir.x * s, y: dir.y * s + pr.mass * (small ? 2.2 : 2.5), z: dir.z * s }, { x: pt.x, y: pt.y, z: pt.z }, true);
    sfx('pop');
  }

  /** Jumping next to the bar: your hands knock the bottles and glasses within reach off the shelf. */
  airSwipe() {
    const t = this.body.translation();
    const feet = t.y - FOOT;
    for (const pr of this.props) {
      if (pr.kind !== 'bottle' && pr.kind !== 'glass') continue;
      if (pr.swiped === this.jumpId) continue;
      const b = pr.body.translation();
      const dx = b.x - t.x;
      const dz = b.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.05 || b.y < feet + 0.6 || b.y > feet + 2.9) continue;
      pr.swiped = this.jumpId;
      // fling it sideways/back toward the deck with a spin (shelves sit against walls)
      const side = Math.sign(dx) || 1;
      pr.body.applyImpulse({ x: (side * 0.8 + (Math.random() - 0.5)) * pr.mass * 2.2, y: pr.mass * (2.2 + Math.random()), z: -Math.sign(dz || 1) * pr.mass * 2.4 }, true);
      pr.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 0.06, y: (Math.random() - 0.5) * 0.06, z: (Math.random() - 0.5) * 0.06 }, true);
    }
  }

  /** E: shove everything in front of you. */
  shove() {
    const t = this.body.translation();
    const f = new THREE.Vector3(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
    let any = false;
    for (const pr of this.props) {
      const b = pr.body.translation();
      const d = new THREE.Vector3(b.x - t.x, 0, b.z - t.z);
      const dist = d.length();
      if (dist > 1.9 || Math.abs(b.y - t.y) > 1.9) continue;
      d.normalize();
      if (d.dot(f) < 0.15) continue;
      const small = pr.kind === 'bottle' || pr.kind === 'glass';
      const s = pr.mass * (6.5 - dist * 2) * (small ? 0.6 : 1);
      // small things against a wall pop up and tumble sideways so they come off the shelf
      const sx = small ? (Math.random() - 0.5) * pr.mass * 4 : 0;
      pr.body.applyImpulse({ x: d.x * s + sx, y: pr.mass * (small ? 3.2 : 2.2), z: d.z * s * (small ? -0.6 : 1) }, true);
      pr.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * pr.mass * 0.4, y: (Math.random() - 0.5) * pr.mass * 0.4, z: (Math.random() - 0.5) * pr.mass * 0.4 }, true);
      any = true;
    }
    this.player.react('point', 0.4);
    this.player.baseState = 'move';
    sfx(any ? 'swoosh' : 'whoosh');
  }

  // ------------------------------------------------------------------ video box
  buildBox() {
    if (this.box) { this.box.visible = true; return; }
    const s = this.world.stage.position;
    const x = s.x + BOX_AT.x;
    const z = s.z + BOX_AT.z;
    // sit it on whatever deck is below
    const top = s.y + 3;
    const hit = this.pw.castRay(new this.R.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, undefined, this.collider);
    const y = hit ? top - (hit.toi ?? hit.timeOfImpact) : s.y;
    const side = new THREE.MeshStandardMaterial({ map: cardboardTexture('E'), roughness: 0.9 });
    const lid = new THREE.MeshStandardMaterial({ map: cardboardTexture(''), roughness: 0.9 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE * 0.8, BOX_SIZE), [side, side, lid, lid, side, side]);
    box.position.set(x, y + BOX_SIZE * 0.4, z);
    box.rotation.y = 0.35;
    box.castShadow = box.receiveShadow = true;
    // floating "E" key above it
    const kc = document.createElement('canvas');
    kc.width = kc.height = 128;
    const g = kc.getContext('2d');
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(10, 10, 108, 108, 24); g.fill();
    g.fillStyle = '#1a2449'; g.font = 'bold 74px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('E', 64, 70);
    const kt = new THREE.CanvasTexture(kc);
    kt.colorSpace = THREE.SRGBColorSpace;
    this.boxKey = new THREE.Sprite(new THREE.SpriteMaterial({ map: kt, depthTest: false, transparent: true }));
    this.boxKey.scale.setScalar(0.42);
    this.boxKey.renderOrder = 10;
    box.add(this.boxKey);
    this.boxKeyY = BOX_SIZE * 0.4 + 0.45;
    this.boxKey.position.y = this.boxKeyY;
    this.world.yacht.add(box);
    this.box = box;
    const R = this.R;
    this.pw.createCollider(R.ColliderDesc.cuboid(BOX_SIZE / 2, BOX_SIZE * 0.4, BOX_SIZE / 2)
      .setTranslation(x, y + BOX_SIZE * 0.4, z)
      .setRotation({ x: 0, y: Math.sin(0.175), z: 0, w: Math.cos(0.175) }));
  }

  updateBox(t) {
    if (!this.box) return;
    const b = this.box.position;
    const d = Math.hypot(b.x - t.x, b.z - t.z);
    this.nearBox = d < BOX_REACH && Math.abs(b.y - (t.y - FOOT)) < 1.5;
    const time = performance.now() / 1000;
    this.boxKey.position.y = this.boxKeyY + Math.sin(time * 3) * 0.06;
    this.boxKey.scale.setScalar(this.nearBox ? 0.5 + Math.sin(time * 6) * 0.03 : 0.36);
    if (this.hud) {
      let p = this.hud.querySelector('.xh-prompt');
      if (this.nearBox && !p) {
        p = el('<div class="xh-prompt"><kbd>E</kbd> Play video</div>');
        this.hud.appendChild(p);
      } else if (!this.nearBox && p) p.remove();
    }
  }

  /** Start loading the video as soon as explore opens, so it's ready by the time you reach the box. */
  async prepVideo() {
    const ref = this.boxVideo?.() || null;
    if (ref === this.videoRef) return;
    this.videoRef = ref;
    this.videoSrc = null;
    if (this.preload) { this.preload.removeAttribute('src'); this.preload.load(); }
    this.preload = null;
    if (!ref) return;
    try {
      const url = await mediaURL(ref);
      if (this.videoRef !== ref) return;
      this.videoSrc = url;
      const v = document.createElement('video');
      v.preload = 'auto';
      v.playsInline = true;
      v.src = url;
      v.load();
      this.preload = v;
    } catch { this.videoRef = null; }
  }

  async playVideo() {
    if (this.videoEl) return;
    this.keys.clear();
    sfx('pop');
    const ov = el(`<div class="box-video">
      <button class="bv-close" title="Close (Esc)">✕</button>
      <div class="bv-loading"><div class="bv-spin"></div><span>Loading video…</span></div>
    </div>`);
    ov.querySelector('.bv-close').onclick = () => this.closeVideo();
    document.body.appendChild(ov);
    this.videoEl = ov;
    this.musicBefore = getMusicState();
    setMusicState('duck', 0.4);
    const loading = ov.querySelector('.bv-loading');
    if (!this.videoSrc) await this.prepVideo();
    if (this.videoEl !== ov) return;
    if (!this.videoSrc) {
      loading.innerHTML = '<span>📦 No video yet — add one in <b>Setup → Settings → Deck box video</b>.</span>';
      return;
    }
    const v = this.preload || document.createElement('video');
    if (!v.src) v.src = this.videoSrc;
    v.controls = true;
    v.playsInline = true;
    v.currentTime = 0;
    v.className = 'bv-player';
    ov.insertBefore(v, loading);
    const ready = () => loading.remove();
    if (v.readyState >= 3) ready();
    else v.addEventListener('canplay', ready, { once: true });
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }

  closeVideo() {
    if (!this.videoEl) return;
    const v = this.videoEl.querySelector('video');
    if (v) { v.pause(); v.remove(); v.controls = false; }
    this.videoEl.remove();
    this.videoEl = null;
    setMusicState(this.musicBefore && this.musicBefore !== 'duck' ? this.musicBefore : 'menu', 0.8);
  }

  // ------------------------------------------------------------------ simulation
  step(h) {
    const k = this.videoEl ? new Set() : this.keys;
    let ix = 0;
    let iz = 0;
    if (k.has('w') || k.has('arrowup')) iz += 1;
    if (k.has('s') || k.has('arrowdown')) iz -= 1;
    if (k.has('a') || k.has('arrowleft')) ix += 1;
    if (k.has('d') || k.has('arrowright')) ix -= 1;
    const run = k.has('shift');
    // camera-relative directions (camera sits at yaw, looking back at the player)
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const left = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const move = fwd.multiplyScalar(iz).add(left.multiplyScalar(ix));
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(run ? RUN : WALK);
    this.vy += GRAVITY * h;
    if (this.grounded && this.vy < 0) this.vy = -1;
    if (this.jumpQueued && this.grounded) {
      this.vy = JUMP;
      this.jumpId = (this.jumpId || 0) + 1;
      sfx('jump');
    }
    this.jumpQueued = false;
    const desired = { x: move.x * h, y: this.vy * h, z: move.z * h };
    this.kcc.computeColliderMovement(this.collider, desired);
    const mv = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
    if (mv.y < desired.y * 0.5 && this.vy > 0) this.vy = 0; // bumped the ceiling
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    this.moveVec = move;
    if (!this.grounded && this.jumpId) this.airSwipe();
    this.pw.timestep = h;
    this.pw.step();

    // fell overboard? splash and climb back aboard
    const pt = this.body.translation();
    if (pt.y < 0.6) {
      this.splashAt(pt);
      sfx('splash');
      this.spawn();
    }
    // props: water, impact sounds
    const now = performance.now();
    for (const pr of this.props) {
      if (pr.body.isSleeping()) continue;
      const b = pr.body.translation();
      if (b.y < 0.25) {
        const depth = 0.25 - b.y;
        pr.body.applyImpulse({ x: 0, y: pr.mass * (22 + depth * 40) * h, z: 0 }, true);
        pr.body.setLinearDamping(2.5);
        pr.body.setAngularDamping(2.0);
        if (!pr.wet) { pr.wet = true; this.splashAt(b); sfx('plop'); }
      }
      const lv = pr.body.linvel();
      const speed = Math.hypot(lv.x, lv.y, lv.z);
      const dv = pr.lastV - speed;
      pr.lastV = speed;
      if (dv > 1.6 && now - pr.lastSound > 140 && now - this.lastSound > 35 && SOUND[pr.kind]) {
        pr.lastSound = now;
        this.lastSound = now;
        sfx(dv > 7 && (pr.kind === 'bottle' || pr.kind === 'glass') ? 'shatter' : SOUND[pr.kind]);
      }
    }
  }

  splashAt(p) {
    const w = this.world.yacht.localToWorld(new THREE.Vector3(p.x, 0.2, p.z));
    w.y = 0.2;
    this.splash?.burst(w, 40);
  }

  update(dt) {
    if (!this.active || !this.pw) return;
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= STEP && n < 6) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
    }
    // sync visuals (yacht space -> node transforms)
    for (const pr of this.props) {
      if (pr.body.isSleeping()) continue;
      const t = pr.body.translation();
      const q = pr.body.rotation();
      pr.node.position.set(t.x, t.y, t.z);
      pr.node.quaternion.set(q.x, q.y, q.z, q.w);
    }
    const t = this.body.translation();
    const s = this.world.stage.position;
    const ch = this.player;
    ch.root.position.set(t.x - s.x, t.y - FOOT - s.y, t.z - s.z);
    const sp = this.moveVec ? Math.hypot(this.moveVec.x, this.moveVec.z) : 0;
    if (sp > 0.1) ch.targetFacing = Math.atan2(this.moveVec.x, this.moveVec.z);
    ch.moveSpeed = sp;
    this.updateBox(t);
    const want = this.grounded ? 'move' : 'air';
    if (ch.state !== want && (ch.state === 'move' || ch.state === 'air' || ch.state === 'idle')) ch.setState(want);
  }

  cameraFrame(dt) {
    const yacht = this.world.yacht;
    const t = this.body.translation();
    const targetLocal = new THREE.Vector3(t.x, t.y + 0.55, t.z);
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // keep the camera out of walls and ceilings
    let d = this.dist;
    const ray = new this.R.Ray(targetLocal, off);
    const hit = this.pw.castRay(ray, d, true, undefined, undefined, this.collider);
    if (hit) d = Math.max(1.6, (hit.toi ?? hit.timeOfImpact) - 0.3);
    // ease in/out instead of snapping when something passes between camera and player
    this.camDist = this.camDist == null ? d : this.camDist + (d - this.camDist) * Math.min(1, dt * (d < this.camDist ? 12 : 3));
    d = this.camDist;
    const camLocal = targetLocal.clone().addScaledVector(off, d);
    const pos = yacht.localToWorld(camLocal);
    this.camPos = this.camPos ? this.camPos.lerp(pos, Math.min(1, dt * 10)) : pos;
    return { pos: this.camPos.clone(), look: yacht.localToWorld(targetLocal.clone()) };
  }
}
