// Placeholder chibi characters with a small procedural animation library.
// A real .glb can replace the placeholder body at any time (Setup → Characters).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * How rigged GLB characters are lit. Tuned in the Joe lookdev page so the skin reads like the
 * reference art even under the flybridge roof (where the sun is blocked).
 */
export const CHARACTER_LOOK = {
  env: 0.55, // ambient fill from the environment map (reaches under the roof)
  self: 0.1, // show a bit of the painted texture unlit
  rough: 1.3, // matte the skin (multiplies the model's roughness)
  albedo: 1.05, // texture brightness
  sat: 1.12, // texture saturation
};
let charEnv = null;
export function setCharacterEnv(tex) { charEnv = tex; }

function applyLook(model) {
  const L = CHARACTER_LOOK;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    m.envMap = charEnv;
    m.envMapIntensity = L.env;
    m.roughness = Math.min(1, (m.roughness ?? 1) * L.rough);
    if (m.map && L.self > 0) {
      m.emissiveMap = m.map;
      m.emissive = new THREE.Color('#ffffff');
      m.emissiveIntensity = L.self;
    }
    const grade = '{ float l = dot(C.rgb, vec3(0.2126, 0.7152, 0.0722)); C.rgb = max(vec3(0.0), mix(vec3(l), C.rgb, SAT)) * ALB; }'
      .replace(/SAT/g, L.sat.toFixed(3)).replace(/ALB/g, L.albedo.toFixed(3));
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>\n${grade.replace(/C\./g, 'diffuseColor.').replace(/C\.rgb/g, 'diffuseColor.rgb')}`)
        .replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP\n vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );\n ${grade.replace(/C\./g, 'emissiveColor.')}\n totalEmissiveRadiance *= emissiveColor.rgb;\n#endif`);
    };
    m.customProgramCacheKey = () => `charlook-${L.sat}-${L.albedo}`;
    m.needsUpdate = true;
  });
}

const SKIN = ['#f1c7a5', '#e0ac85', '#c98e68', '#f5d3b8', '#d9a07a', '#b97c5a', '#eebf9a', '#f0c9a8'];
const HAIR = ['#3b2a20', '#1f1a17', '#6b4423', '#2c2220', '#8a5a2b', '#1b1b1b', '#a0522d', '#4a3020'];

const EMOTE_CHARS = { sleep: '💤', sad: '😭', laugh: '😂', surprise: '❗', cheer: '🎉', love: '❤️', point: '👉', think: '🤔', dizzy: '💫' };

function emoteTexture(ch) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'white';
  g.beginPath();
  g.arc(64, 58, 50, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(44, 100);
  g.lineTo(64, 124);
  g.lineTo(78, 98);
  g.fill();
  g.font = '62px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, 64, 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const emoteCache = {};
function getEmote(name) {
  if (!emoteCache[name]) emoteCache[name] = emoteTexture(EMOTE_CHARS[name] || name);
  return emoteCache[name];
}

function nameTexture(name, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '64px "Lilita One", sans-serif';
  const w = Math.min(500, g.measureText(name).width + 70);
  const x = (512 - w) / 2;
  g.fillStyle = color;
  roundRect(g, x, 14, w, 100, 50);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = 'white';
  g.stroke();
  g.fillStyle = 'white';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export class Character {
  constructor(data, index) {
    this.data = data;
    this.index = index;
    this.root = new THREE.Group(); // position/facing on deck
    this.root.name = data.id;
    this.body = new THREE.Group(); // procedural bounce/lean
    this.root.add(this.body);
    this.state = 'idle';
    this.baseState = 'idle'; // what they go back to after a reaction (idle, sit, dance, dj)
    this.seatY = 0.95;
    this.popScale = 1;
    this.popTarget = 1;
    this.stateTime = 0;
    this.target = null;
    this.facing = 0;
    this.targetFacing = 0;
    this.speed = 4.2;
    this.phase = Math.random() * 10;
    this.blinkT = 2 + Math.random() * 3;
    this.mixer = null;
    this.buildPlaceholder();
    this.buildLabels();
  }

  buildPlaceholder() {
    const d = this.data;
    const isGirl = d.role === 'girl';
    const skin = new THREE.MeshStandardMaterial({ color: SKIN[this.index % SKIN.length], roughness: 0.65 });
    const outfit = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.6 });
    const outfit2 = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color).multiplyScalar(0.7), roughness: 0.6 });
    const hairMat = new THREE.MeshStandardMaterial({ color: HAIR[this.index % HAIR.length], roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1d1a24', roughness: 0.4 });
    const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const blush = new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0.6 });
    this.mats = { skin, outfit, hairMat };

    const v = new THREE.Group();
    this.placeholder = v;
    this.body.add(v);

    // legs / feet
    this.feet = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(0.17 * s, 0.42, 0);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 4, 8), isGirl ? skin : outfit2);
      shin.position.y = -0.18;
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), dark);
      foot.scale.set(1, 0.6, 1.35);
      foot.position.set(0, -0.36, 0.05);
      leg.add(shin, foot);
      v.add(leg);
      this.feet.push(leg);
    }
    // torso
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.35, 6, 16), outfit);
    torso.position.y = 0.78;
    torso.scale.set(1, 1, 0.85);
    v.add(torso);
    if (isGirl) {
      const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.4, 16, 1, true), outfit);
      skirt.position.y = 0.52;
      v.add(skirt);
    } else {
      // shirt stripe / collar
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 16), white);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 1.1;
      v.add(collar);
    }
    // arms (pivot at shoulder)
    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(0.38 * s, 0.98, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.3, 4, 8), outfit);
      upper.position.y = -0.2;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), skin);
      hand.position.y = -0.42;
      arm.add(upper, hand);
      arm.rotation.z = 0.25 * s;
      v.add(arm);
      this.arms.push(arm);
    }
    // head
    const head = new THREE.Group();
    head.position.y = 1.52;
    this.head = head;
    v.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 18), skin);
    skull.scale.set(1, 0.95, 0.95);
    head.add(skull);
    // eyes
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), dark);
      ball.scale.set(1, 1.3, 0.6);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), white);
      shine.position.set(0.02, 0.03, 0.035);
      eye.add(ball, shine);
      eye.position.set(0.15 * s, 0.03, 0.41);
      head.add(eye);
      this.eyes.push(eye);
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), blush);
      b.position.set(0.25 * s, -0.09, 0.385);
      b.rotation.y = 0.45 * s;
      head.add(b);
    }
    // mouth
    const mouthShape = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 12, Math.PI), dark);
    mouthShape.rotation.z = Math.PI;
    mouthShape.position.set(0, -0.12, 0.42);
    head.add(mouthShape);
    this.mouth = mouthShape;
    // hair
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.49, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    cap.position.y = 0.04;
    cap.rotation.x = -0.25;
    head.add(cap);
    if (isGirl) {
      const style = this.index % 3;
      if (style === 0) {
        const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.45, 4, 8), hairMat);
        tail.position.set(0, -0.15, -0.48);
        tail.rotation.x = 0.4;
        head.add(tail);
      } else if (style === 1) {
        for (const s of [-1, 1]) {
          const bun = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), hairMat);
          bun.position.set(0.34 * s, 0.32, -0.1);
          head.add(bun);
        }
      } else {
        const back = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), hairMat);
        back.scale.set(1.02, 1.1, 0.7);
        back.position.set(0, -0.2, -0.2);
        head.add(back);
      }
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: '#ff5d8f' }));
      flower.position.set(0.3, 0.3, 0.25);
      head.add(flower);
    } else {
      const style = this.index % 4;
      if (style === 0) {
        // sunglasses
        const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.11, 0.04), dark);
        glasses.position.set(0, 0.05, 0.44);
        head.add(glasses);
      } else if (style === 2) {
        // captain hat
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.22, 16), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
        hat.position.y = 0.42;
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16, 1, false, -Math.PI / 2, Math.PI), dark);
        brim.position.set(0, 0.33, 0.2);
        const badge = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffd166' }));
        badge.position.set(0, 0.42, 0.37);
        head.add(hat, brim, badge);
      } else if (style === 3) {
        // bucket hat
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.55, 0.3, 16), new THREE.MeshStandardMaterial({ color: '#f6d365' }));
        hat.position.y = 0.38;
        head.add(hat);
      }
    }

    v.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    // contact shadow blob
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    this.root.add(blob);
    this.blob = blob;
  }

  buildLabels() {
    const mat = new THREE.SpriteMaterial({ map: nameTexture(this.data.name, this.data.color), depthTest: false, transparent: true });
    this.label = new THREE.Sprite(mat);
    this.label.scale.set(1.8, 0.45, 1);
    this.label.position.y = 2.45;
    this.label.renderOrder = 20;
    this.label.visible = false;
    this.root.add(this.label);

    this.emote = new THREE.Sprite(new THREE.SpriteMaterial({ map: getEmote('cheer'), depthTest: false, transparent: true }));
    this.emote.scale.set(0.8, 0.8, 1);
    this.emote.position.set(0.55, 2.35, 0);
    this.emote.renderOrder = 21;
    this.emote.visible = false;
    this.root.add(this.emote);
  }

  refreshLabel() {
    this.label.material.map?.dispose();
    this.label.material.map = nameTexture(this.data.name, this.data.color);
    this.label.material.needsUpdate = true;
  }

  showName(v) { this.label.visible = v; }

  showEmote(name, dur = 2) {
    if (this.noEmotes) return;
    this.emote.material.map = getEmote(name);
    this.emote.material.needsUpdate = true;
    this.emote.visible = true;
    this.emoteT = dur;
  }

  async loadModel(url) {
    if (!url) {
      this.clearModel();
      return;
    }
    const gltf = await new GLTFLoader().loadAsync(url);
    this.clearModel();
    const model = SkeletonUtils.clone(gltf.scene);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const s = 2.0 / (size.y || 1);
    model.scale.setScalar(s);
    box.setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= box.min.y;
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    applyLook(model);
    this.model = model;
    this.body.add(model);
    this.placeholder.visible = false;
    if (gltf.animations?.length) {
      this.mixer = new THREE.AnimationMixer(model);
      this.clips = {};
      for (const clip of gltf.animations) this.clips[clip.name.toLowerCase()] = clip;
      this.currentAction = null;
      this.setState(this.state, this.stateDur); // models load async: pick up whatever they're doing now
    }
  }

  clearModel() {
    if (this.model) this.body.remove(this.model);
    this.model = null;
    this.mixer = null;
    this.clips = null;
    this.placeholder.visible = true;
  }

  /**
   * Play the GLB clip for a state. Returns true when a dedicated clip drives the body;
   * otherwise the idle clip plays and the procedural body motion does the acting.
   */
  playClip(state) {
    if (!this.mixer || !this.clips) return false;
    const aliases = {
      idle: ['idle', 'stand'], walk: ['walk', 'run'], move: ['walk', 'run'],
      intro: ['intro', 'pose', 'showoff', 'wave'], air: ['jump', 'fall', 'excited'], sit: ['sit'], dj: ['dj', 'dance'],
      wave: ['wave', 'hello'], cheer: ['cheer', 'excited', 'jump', 'victory'], sad: ['sad', 'disappointed', 'defeat'],
      laugh: ['laugh'], dance: ['dance'], surprise: ['surprise', 'surprised'], sleep: ['sleep'], point: ['point', 'wave'],
      stumble: ['fall', 'trip', 'stumble'],
    };
    const names = aliases[state] || [state];
    const keys = Object.keys(this.clips);
    let key = null;
    for (const n of names) {
      key = keys.find((k) => k === n) || keys.find((k) => k.startsWith(n));
      if (key) break;
    }
    const driven = !!key;
    if (!key) key = keys.find((k) => k === 'idle') || keys[0];
    this.clipDriven = driven;
    this.clipKey = key;
    const action = this.mixer.clipAction(this.clips[key]);
    if (this.currentAction === action) return driven;
    action.reset().setEffectiveTimeScale(1).fadeIn(0.25).play();
    this.currentAction?.fadeOut(0.25);
    this.currentAction = action;
    return driven;
  }

  // ---- behaviour API ----
  setState(state, dur = null) {
    this.state = state;
    this.stateTime = 0;
    this.stateDur = dur;
    const seated = this.baseState === 'sit' && state !== 'walk' && state !== 'stumble';
    if (seated && state !== 'sit' && this.clips) {
      this.playClip('sit'); // react from the seat: keep the sitting clip, the body bounces procedurally
      this.clipDriven = false;
    } else this.playClip(state);
    if (state === 'sleep') this.showEmote('sleep', dur ?? 6);
    if (state === 'sad') this.showEmote('sad', 2.4);
    if (state === 'laugh') this.showEmote('laugh', 2.2);
    if (state === 'surprise') this.showEmote('surprise', 1.6);
    if (state === 'cheer' && !this.noEmotes && Math.random() < 0.5) this.showEmote('cheer', 1.8);
  }

  react(state, dur = 2.4) {
    if (this.target) return; // don't interrupt someone who's walking somewhere
    this.setState(state, dur);
  }

  /** Hang out: 'idle' | 'sit' | 'dance' | 'dj'. */
  hangOut(pose, seatY = 0.95) {
    this.baseState = pose;
    this.seatY = seatY;
    this.setState(pose);
  }

  /** Pop in / out of view with a little bounce. */
  pop(visible, instant = false) {
    this.popTarget = visible ? 1 : 0;
    if (instant) {
      this.popScale = this.popTarget;
      this.root.visible = visible;
      this.root.scale.setScalar(Math.max(0.001, this.popScale));
    } else if (visible) {
      this.root.visible = true;
      this.popScale = Math.min(this.popScale, 0.01);
    }
  }

  moveTo(x, z, { face = 0, stumble = false, delay = 0, speed = 4.2, then = 'idle', seatY = 0.95 } = {}) {
    this.target = new THREE.Vector3(x, 0, z);
    this.baseState = then;
    this.seatY = seatY;
    this.arriveFacing = face;
    this.willStumble = stumble;
    this.speed = speed;
    this.moveDelay = delay;
    this.setState('walk');
    this.stumbled = false;
    this.startDist = this.root.position.distanceTo(this.target);
  }

  faceTowards(x, z) {
    this.targetFacing = Math.atan2(x - this.root.position.x, z - this.root.position.z);
  }

  place(x, z, face = 0, pose = 'idle', seatY = 0.95) {
    this.root.position.set(x, 0, z);
    this.facing = this.targetFacing = face;
    this.root.rotation.y = face;
    this.target = null;
    this.hangOut(pose, seatY);
  }

  update(dt) {
    this.stateTime += dt;
    const t = this.stateTime;
    const T = performance.now() / 1000 + this.phase;
    if (this.mixer) this.mixer.update(dt);

    // reset pose
    const b = this.body;
    b.position.set(0, 0, 0);
    b.rotation.set(0, 0, 0);
    let armL = 0.25;
    let armR = -0.25;
    let armLx = 0;
    let armRx = 0;
    let headTilt = 0;
    let headTurn = 0;
    let footA = 0;

    if (this.emote.visible) {
      this.emoteT -= dt;
      this.emote.position.y = 2.35 + Math.sin(T * 4) * 0.05;
      if (this.emoteT <= 0) this.emote.visible = false;
    }

    switch (this.state) {
      case 'idle': {
        // standing loop: switch between the two idles and now and then throw in a wave / dance / cheer
        // (each character on its own random timer so nobody looks like a clone)
        this.idleSwap = (this.idleSwap ?? 3 + Math.random() * 6) - dt;
        if (this.idleSwap < 0 && this.baseState === 'idle' && !this.target && !this.directed) {
          this.idleSwap = 5 + Math.random() * 6;
          if (Math.random() < 0.4) {
            const extra = ['wave', 'dance', 'cheer', 'dance'][Math.floor(Math.random() * 4)];
            this.setState(extra, extra === 'dance' ? 3.2 : 2.0);
            break;
          }
          if (this.clips) this.playClip(this.clipKey === 'idle' && this.clips.idle2 ? 'idle2' : 'idle');
        }
        b.position.y = Math.abs(Math.sin(T * 1.6)) * 0.03;
        b.rotation.z = Math.sin(T * 0.8) * 0.03;
        headTurn = Math.sin(T * 0.37) * 0.35;
        armL = 0.25 + Math.sin(T * 1.6) * 0.04;
        armR = -armL;
        break;
      }
      case 'walk': {
        if (this.moveDelay > 0) {
          this.moveDelay -= dt;
          b.position.y = Math.abs(Math.sin(T * 8)) * 0.06; // anticipation hop
          break;
        }
        if (!this.target) { this.setState('idle'); break; }
        const p = this.root.position;
        const dx = this.target.x - p.x;
        const dz = this.target.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (this.willStumble && !this.stumbled && dist < this.startDist * 0.55) {
          this.stumbled = true;
          this.setState('stumble', 1.3);
          this.resumeTarget = true;
          break;
        }
        if (dist < 0.05) {
          p.set(this.target.x, 0, this.target.z);
          this.target = null;
          this.targetFacing = this.arriveFacing;
          this.setState(this.baseState || 'idle');
          break;
        }
        const step = Math.min(dist, this.speed * dt);
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        this.targetFacing = Math.atan2(dx, dz);
        // stroll vs run: cadence, bounce and lean scale with speed
        const run = Math.min(1, Math.max(0, (this.speed - 2.2) / 2.5));
        const cyc = T * (7 + run * 7);
        b.position.y = Math.abs(Math.sin(cyc)) * (0.07 + run * 0.11);
        b.rotation.x = 0.04 + run * 0.14;
        b.rotation.z = Math.sin(cyc) * 0.05 * (1 - run);
        footA = Math.sin(cyc) * (0.45 + run * 0.25);
        armLx = -Math.sin(cyc) * (0.5 + run * 0.4);
        armRx = Math.sin(cyc) * (0.5 + run * 0.4);
        this.currentAction?.setEffectiveTimeScale(Math.min(2.4, 0.6 + this.speed * 0.4));
        break;
      }
      case 'stumble': {
        // trip, faceplant, pop back up
        const k = Math.min(1, t / 0.35);
        if (t < 0.35) {
          b.rotation.x = k * 1.45;
          b.position.y = Math.sin(k * Math.PI) * 0.3;
          armL = 1.2; armR = -1.2;
          armLx = armRx = -1.4;
        } else if (t < 0.95) {
          b.rotation.x = 1.45;
          b.position.y = 0;
          armLx = armRx = -2.6;
          if (!this.saidDizzy) { this.showEmote('dizzy', 1.2); this.saidDizzy = true; }
        } else {
          const u = Math.min(1, (t - 0.95) / 0.35);
          b.rotation.x = 1.45 * (1 - u);
          b.position.y = Math.sin(u * Math.PI) * 0.4;
        }
        if (t >= 1.3) {
          this.saidDizzy = false;
          if (this.resumeTarget && this.target) { this.resumeTarget = false; this.state = 'walk'; this.stateTime = 0; this.moveDelay = 0; this.playClip('walk'); }
          else this.setState(this.baseState && this.baseState !== 'sit' ? this.baseState : 'idle');
        }
        break;
      }
      case 'cheer': {
        const j = Math.abs(Math.sin(t * 7));
        b.position.y = j * 0.55;
        armL = 2.6 + Math.sin(t * 14) * 0.25;
        armR = -armL;
        b.rotation.y = Math.sin(t * 3) * 0.2;
        break;
      }
      case 'sad': {
        b.rotation.x = 0.25;
        headTilt = 0.45;
        armL = 0.08; armR = -0.08;
        b.position.y = -0.05;
        b.rotation.z = Math.sin(t * 9) * 0.03;
        break;
      }
      case 'laugh': {
        b.rotation.x = -0.25 + Math.sin(t * 22) * 0.05;
        b.position.y = Math.abs(Math.sin(t * 11)) * 0.08;
        armLx = armRx = -0.6;
        armL = 0.6; armR = -0.6;
        headTilt = -0.3;
        break;
      }
      case 'dance': {
        const beat = t * 6;
        b.position.y = Math.abs(Math.sin(beat)) * 0.25;
        b.rotation.y = Math.sin(t * 2.2) * 1.2;
        b.rotation.z = Math.sin(beat) * 0.15;
        armL = 1.6 + Math.sin(beat) * 1.0;
        armR = -1.6 + Math.sin(beat + Math.PI) * 1.0;
        footA = Math.sin(beat) * 0.4;
        headTilt = Math.sin(beat) * 0.2;
        break;
      }
      case 'surprise': {
        const k = Math.min(1, t / 0.2);
        b.position.y = Math.sin(Math.min(1, t / 0.4) * Math.PI) * 0.45;
        b.rotation.x = -0.25 * k;
        armL = 2.2; armR = -2.2;
        break;
      }
      case 'sleep': {
        headTilt = 0.5;
        b.rotation.z = 0.12 + Math.sin(t * 1.2) * 0.04;
        b.position.y = Math.sin(t * 1.2) * 0.02;
        armL = 0.1; armR = -0.1;
        break;
      }
      case 'sit': {
        b.position.y = this.seatY - 0.44;
        b.rotation.x = -0.05;
        footA = 0;
        this.sitLegs = true;
        armL = 0.35; armR = -0.35;
        armLx = armRx = -0.5;
        headTurn = Math.sin(T * 0.45) * 0.45;
        headTilt = Math.sin(T * 0.3) * 0.08;
        break;
      }
      case 'dj': {
        const beat = T * 7.5;
        b.position.y = Math.abs(Math.sin(beat)) * 0.08;
        headTilt = Math.abs(Math.sin(beat)) * 0.25;
        armR = -0.5;
        armRx = -1.2 + Math.sin(beat) * 0.15;
        armL = Math.sin(T * 0.9) > 0.6 ? 2.6 : 0.6;
        armLx = Math.sin(T * 0.9) > 0.6 ? 0 : -1.1;
        break;
      }
      case 'move': {
        // animation only — position is driven from outside (explore mode / physics)
        const sp = this.moveSpeed || 0;
        const run = Math.min(1, Math.max(0, (sp - 2.2) / 3));
        const cyc = T * (7 + run * 8);
        const amt = Math.min(1, sp / 1.5);
        b.position.y = Math.abs(Math.sin(cyc)) * (0.07 + run * 0.12) * amt;
        b.rotation.x = (0.04 + run * 0.16) * amt;
        footA = Math.sin(cyc) * (0.45 + run * 0.3) * amt;
        armLx = -Math.sin(cyc) * (0.5 + run * 0.5) * amt;
        armRx = Math.sin(cyc) * (0.5 + run * 0.5) * amt;
        if (amt < 0.05) { headTurn = Math.sin(T * 0.4) * 0.3; b.position.y = Math.abs(Math.sin(T * 1.6)) * 0.03; }
        if (this.clips) {
          this.playClip(sp < 0.3 ? 'idle' : 'walk');
          if (sp >= 0.3) this.currentAction?.setEffectiveTimeScale(Math.min(2.6, 0.6 + sp * 0.4));
        }
        break;
      }
      case 'air': {
        armL = 2.3; armR = -2.3;
        footA = 0.6;
        b.rotation.x = -0.1;
        break;
      }
      case 'intro': {
        if (this.clips) {
          const seq = ['wave', 'dance', 'excited', 'dance'];
          this.playClip(seq[Math.floor(t / 2.4) % seq.length]);
        }
        // placeholder "showing off" loop until the real rigged animation arrives (clip: intro / pose / showoff)
        const beat = T * 4.2;
        const phase = Math.floor(T / 2.6) % 3;
        b.position.y = Math.abs(Math.sin(beat)) * 0.06;
        b.rotation.z = Math.sin(beat / 2) * 0.06;
        headTilt = Math.sin(beat / 2) * 0.12;
        if (phase === 0) { armR = -2.6 + Math.sin(T * 10) * 0.35; armL = 0.9; armLx = 0.6; }
        else if (phase === 1) { armL = 2.4 + Math.sin(beat) * 0.3; armR = -2.4 - Math.sin(beat) * 0.3; b.rotation.y = Math.sin(beat / 2) * 0.4; }
        else { armL = 1.1; armR = -1.1; armLx = armRx = 0.7; b.rotation.y = Math.sin(T * 1.5) * 0.25; }
        break;
      }
      case 'wave': {
        armR = -2.6 + Math.sin(t * 10) * 0.35;
        b.position.y = Math.abs(Math.sin(t * 4)) * 0.05;
        break;
      }
      case 'point': {
        armR = -1.45;
        armRx = -1.3;
        b.position.y = Math.abs(Math.sin(t * 5)) * 0.06;
        headTilt = -0.1;
        break;
      }
      default:
        break;
    }

    if (this.model && this.clipDriven) {
      // the GLB clip already animates hips/bob/arms; keep only a forward lean when running
      const lean = this.state === 'walk' || this.state === 'move' ? b.rotation.x * 0.6 : 0;
      b.position.set(0, this.state === 'sit' ? this.seatY - 0.5 : 0, 0);
      b.rotation.set(lean, 0, 0);
    } else if (this.model && this.baseState === 'sit' && this.state !== 'walk' && this.state !== 'stumble') {
      // reacting from a seat: a small bounce, not the placeholder's full jump
      b.position.y *= 0.25;
      b.rotation.x *= 0.4;
      b.rotation.z *= 0.4;
    }

    if (this.stateDur != null && this.state !== 'walk' && this.state !== 'stumble' && this.stateTime > this.stateDur) {
      this.setState(this.baseState || 'idle');
    }
    // sitting reactions stay seated
    if (this.baseState === 'sit' && this.state !== 'sit' && this.state !== 'walk' && this.state !== 'stumble') {
      b.position.y += this.seatY - (this.model ? 0.5 : 0.44);
    }
    // movie mode: a scene can take over the body (lie down, barrel roll, tumble over the rail…)
    if (this.bodyOverride) this.bodyOverride(b, dt);
    // pop in/out
    if (this.popScale !== this.popTarget) {
      this.popScale += (this.popTarget - this.popScale) * Math.min(1, dt * 10);
      if (Math.abs(this.popScale - this.popTarget) < 0.01) this.popScale = this.popTarget;
      const over = this.popTarget === 1 ? 1 + Math.sin(this.popScale * Math.PI) * 0.15 : 1;
      this.root.scale.setScalar(Math.max(0.001, this.popScale * over));
      if (this.popScale === 0) this.root.visible = false;
    }

    // face direction smoothing
    let dF = this.targetFacing - this.facing;
    dF = Math.atan2(Math.sin(dF), Math.cos(dF));
    this.facing += dF * Math.min(1, dt * 8);
    this.root.rotation.y = this.facing;

    // apply limbs (placeholder rig)
    if (this.placeholder.visible) {
      this.arms[0].rotation.set(armLx, 0, -armL);
      this.arms[1].rotation.set(armRx, 0, -armR);
      const seated = this.baseState === 'sit' && this.state !== 'walk' && this.state !== 'stumble';
      this.feet[0].rotation.x = seated ? -1.45 : footA;
      this.feet[1].rotation.x = seated ? -1.45 : -footA;
      this.head.rotation.set(headTilt, headTurn, 0);
      // blink
      this.blinkT -= dt;
      const closed = this.state === 'sleep' || this.state === 'laugh' || (this.blinkT < 0.12 && this.blinkT > 0);
      for (const e of this.eyes) e.scale.y = closed ? 0.15 : 1;
      if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
      const open = this.state === 'surprise' || this.state === 'cheer' || this.state === 'laugh';
      this.mouth.scale.set(open ? 1.3 : 1, open ? 2.2 : 1, 1);
      this.mouth.rotation.z = this.state === 'sad' ? 0 : Math.PI;
      this.mouth.position.y = this.state === 'sad' ? -0.16 : -0.12;
    }
    this.blob.scale.setScalar(1 - Math.min(0.5, b.position.y));
  }
}

// --------- 2D face stickers ---------
const stickerCache = new Map();
export function defaultSticker(char, index) {
  const key = `${char.id}|${char.color}|${char.name}`;
  if (stickerCache.has(key)) return stickerCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  // sticker border
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = char.color;
  g.beginPath();
  g.arc(128, 128, 110, 0, Math.PI * 2);
  g.fill();
  // face
  g.fillStyle = SKIN[index % SKIN.length];
  g.beginPath();
  g.ellipse(128, 142, 74, 70, 0, 0, Math.PI * 2);
  g.fill();
  // hair
  g.fillStyle = HAIR[index % HAIR.length];
  g.beginPath();
  g.ellipse(128, 104, 80, 50, 0, Math.PI, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(128, 100, 78, 34, 0, 0, Math.PI);
  g.fill();
  if (char.role === 'girl') {
    g.beginPath();
    g.ellipse(58, 150, 22, 48, 0.1, 0, Math.PI * 2);
    g.ellipse(198, 150, 22, 48, -0.1, 0, Math.PI * 2);
    g.fill();
  }
  // eyes
  g.fillStyle = '#1d1a24';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(128 + 26 * s, 146, 8, 11, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#fff';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(130 + 26 * s, 142, 3, 0, Math.PI * 2);
    g.fill();
  }
  // blush & smile
  g.fillStyle = 'rgba(255,120,150,0.5)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(128 + 46 * s, 168, 12, 7, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#1d1a24';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(128, 170, 16, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  const url = c.toDataURL();
  stickerCache.set(key, url);
  return url;
}
