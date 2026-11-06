// Sea of Cortez scenery built in Blender (tools/blender/*.py): the bay, the Sierra de la Giganta,
// hero rocks (Los Arcos, El Hongo), scattered desert plants and the living details on the water.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = 'models/env/';

function prepMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const old = o.material;
    o.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.92,
      metalness: 0,
      color: old?.color ?? 0xffffff,
    });
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return root;
}

export async function loadSeaOfCortez(world, onProgress) {
  // bay + sierra are meshopt-compressed (npm run compress:env); props stay plain so they can be cloned freely
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const texLoader = new THREE.TextureLoader();
  let done = 0;
  const step = () => onProgress?.(++done / 5);
  const [bay, sierra, props, places, depthTex] = await Promise.all([
    loader.loadAsync(BASE + 'bay.glb').then((g) => (step(), g)),
    loader.loadAsync(BASE + 'sierra.glb').then((g) => (step(), g)),
    loader.loadAsync(BASE + 'props.glb').then((g) => (step(), g)),
    fetch(BASE + 'bay-places.json').then((r) => r.json()).then((j) => (step(), j)),
    texLoader.loadAsync(BASE + 'bay-depth.png').then((t) => (step(), t)),
  ]);
  return new SeaOfCortez(world, { bay, sierra, props, places, depthTex });
}

class SeaOfCortez {
  constructor(world, { bay, sierra, props, places, depthTex }) {
    this.world = world;
    this.scene = world.scene;
    this.group = new THREE.Group();
    this.group.name = 'sea-of-cortez';
    this.scene.add(this.group);
    this.time = 0;
    world.setDepthMap(depthTex, places.depthMax);

    this.bay = prepMaterials(bay.scene);
    this.group.add(this.bay);
    this.bayMeshes = [];
    this.bay.traverse((o) => o.isMesh && this.bayMeshes.push(o));
    this.group.add(prepMaterials(sierra.scene));

    // props library: name -> object
    prepMaterials(props.scene);
    this.lib = {};
    props.scene.children.forEach((c) => { this.lib[c.name] = c; });

    this.raycaster = new THREE.Raycaster();
    this.scatter(places);
    this.placeHeroes();
    this.buildLife();
    this.foam = new FoamPool(this.scene, 360);
  }

  groundAt(x, z) {
    this.raycaster.set(new THREE.Vector3(x, 300, z), new THREE.Vector3(0, -1, 0));
    const hit = this.raycaster.intersectObjects(this.bayMeshes, false)[0];
    return hit ? hit.point.y : -6;
  }

  clone(name) {
    const src = this.lib[name];
    const c = src.clone(true);
    c.position.set(0, 0, 0);
    c.rotation.set(0, 0, 0);
    return c;
  }

  instanced(name, list, { scaleMul = 1, yOff = 0 } = {}) {
    const src = this.lib[name];
    if (!src || !list.length) return;
    const mesh = new THREE.InstancedMesh(src.geometry, src.material, list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    list.forEach(([x, y, z, ry, s], i) => {
      q.setFromEuler(e.set(0, ry, 0));
      m.compose(new THREE.Vector3(x, y + yOff, z), q, new THREE.Vector3(s * scaleMul, s * scaleMul, s * scaleMul));
      mesh.setMatrixAt(i, m);
    });
    mesh.computeBoundingSphere();
    this.group.add(mesh);
    return mesh;
  }

  scatter(places) {
    const kinds = ['cardon_a', 'cardon_b', 'cardon_c'];
    const split = [[], [], []];
    const shrubs = [];
    places.cardon.forEach((p, i) => {
      split[i % 3].push(p);
      // a little desert scrub around every cactus
      shrubs.push([p[0] + 3 + (i % 5), p[1] - 0.2, p[2] - 2 + (i % 3), p[3], 0.9 + (i % 4) * 0.25]);
    });
    kinds.forEach((k, i) => this.instanced(k, split[i], { scaleMul: 0.9 }));
    this.instanced('shrub', shrubs);
    this.instanced('palm', places.palm, { scaleMul: 0.95 });
    this.instanced('palapa', places.palapa, { scaleMul: 1.3 });
    const b1 = places.boulder.filter((_, i) => i % 2 === 0);
    const b2 = places.boulder.filter((_, i) => i % 2 === 1);
    this.instanced('boulder_red', b1, { scaleMul: 1.6, yOff: -0.6 });
    this.instanced('boulder_gray', b2, { scaleMul: 1.4, yOff: -0.6 });
  }

  placeHeroes() {
    // Los Arcos — granite arch at the edge of its islet; the hole lines up with the yacht
    const arch = this.clone('arch');
    arch.position.set(104, -1.6, 146);
    arch.rotation.y = Math.atan2(104, 146) + 0.25;
    arch.scale.setScalar(1.25);
    this.group.add(arch);
    // El Hongo standing in Balandra's ankle-deep lagoon
    const hongo = this.clone('hongo');
    hongo.position.set(-126, -0.9, 104);
    hongo.rotation.y = 0.6;
    hongo.scale.setScalar(1.7);
    this.group.add(hongo);
    // palapas on Balandra beach facing the yacht
    for (const [x, z] of [[-168, 128], [-176, 140], [-158, 112]]) {
      const p = this.clone('palapa');
      p.position.set(x, Math.max(0.6, this.groundAt(x, z)), z);
      p.rotation.y = Math.random() * 6;
      p.scale.setScalar(1.3);
      this.group.add(p);
    }
    // sea lions lounging on Los Islotes and the arch islet
    this.sealions = [];
    const spots = [[-95, -240, 12], [-90, -235, 9], [-101, -244, 10], [175, -290, 14], [168, -284, 10], [130, 166, 9], [124, 160, 7]];
    spots.forEach(([cx, cz, r], i) => {
      for (let k = 0; k < 2; k++) {
        const a = (i * 2.3 + k * 2.1);
        const x = cx + Math.cos(a) * r * 0.5;
        const z = cz + Math.sin(a) * r * 0.5;
        const y = this.groundAt(x, z);
        if (y < 0.2) continue;
        const s = this.clone('sealion');
        s.position.set(x, y - 0.1, z);
        s.rotation.y = a + Math.PI;
        s.scale.setScalar(1.5);
        s.userData.phase = Math.random() * 6;
        this.group.add(s);
        this.sealions.push(s);
      }
    });
  }

  buildLife() {
    // pangas cruising around the bay
    this.pangas = [
      { c: [40, 118], r: 58, speed: 0.11, phase: 0 },
      { c: [-80, -112], r: 70, speed: -0.08, phase: 2 },
      { c: [185, 40], r: 46, speed: 0.13, phase: 4 },
      { c: [-30, 270], r: 75, speed: 0.07, phase: 1 },
    ].map((d) => {
      const o = this.clone('panga');
      o.scale.setScalar(1.35);
      this.group.add(o);
      return { ...d, o, wakeT: 0 };
    });
    // kayakers paddling lazily
    this.kayaks = [
      { a: [-96, 74], b: [-60, 40], t: 0 },
      { a: [56, 64], b: [82, 100], t: 0.4 },
      { a: [-36, -52], b: [-10, -78], t: 0.7 },
      { a: [118, 118], b: [96, 128], t: 0.2 },
    ].map((d) => {
      const o = this.clone('kayak');
      o.scale.setScalar(1.25);
      this.group.add(o);
      return { ...d, o, dir: 1 };
    });
    // pelicans: glide in circles and sometimes plunge-dive for fish
    this.pelicans = Array.from({ length: 6 }, (_, i) => {
      const o = this.clone('pelican');
      o.scale.setScalar(1.1);
      this.group.add(o);
      const wingL = o.getObjectByName('pelican_wingL');
      const wingR = o.getObjectByName('pelican_wingR');
      return {
        o, wingL, wingR,
        c: new THREE.Vector2([30, -60, 90, -20, 140, -140][i], [60, 40, -40, -110, 220, 160][i]),
        r: 30 + i * 9, h: 14 + (i % 3) * 6, speed: 0.22 + (i % 3) * 0.05, a: i * 1.3,
        state: 'glide', t: 0, nextDive: 6 + Math.random() * 14,
      };
    });
    // a pod of dolphins arcing across the bay ahead of the yacht
    this.dolphins = Array.from({ length: 4 }, (_, i) => {
      const o = this.clone('dolphin');
      o.scale.setScalar(1.25);
      this.group.add(o);
      return { o, off: i * 0.07, lane: (i - 1.5) * 4, phase: i * 1.7, wasUp: false };
    });
    // white wash around the yacht's hull
    this.hullFoam = null;
  }

  /** Foam ring hugging the yacht's waterline (called once the yacht is loaded). */
  addHullFoam(yachtModel) {
    if (!yachtModel) return;
    const meshes = [];
    yachtModel.traverse((o) => o.isMesh && meshes.push(o));
    yachtModel.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    const pts = [];
    const N = 96;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const from = dir.clone().multiplyScalar(60).setY(0.3);
      rc.set(from, dir.clone().negate());
      const hit = rc.intersectObjects(meshes, false)[0];
      pts.push(hit ? new THREE.Vector2(hit.point.x, hit.point.z) : new THREE.Vector2(dir.x * 8, dir.z * 26));
    }
    const pos = [];
    const uv = [];
    const idx = [];
    const W = 3.2;
    pts.forEach((p, i) => {
      const c = new THREE.Vector2(p.x, p.y);
      const out = c.clone().normalize();
      const inner = c.clone().addScaledVector(out, -0.4);
      const outer = c.clone().addScaledVector(out, W * (1 + 0.5 * Math.max(0, out.y)));
      pos.push(inner.x, 0.12, inner.y, outer.x, 0.12, outer.y);
      uv.push(i / N, 0, i / N, 1);
      const j = (i + 1) % N;
      idx.push(i * 2, i * 2 + 1, j * 2 + 1, i * 2, j * 2 + 1, j * 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uTime; varying vec2 vUv;
        float h(float n){ return fract(sin(n) * 43758.5453); }
        float n1(float x){ float i = floor(x); float f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
        void main(){
          float edge = n1(vUv.x * 60.0 + uTime * 1.5) * 0.45 + n1(vUv.x * 23.0 - uTime) * 0.35;
          float a = smoothstep(edge + 0.35, edge, vUv.y) * (0.75 + 0.25 * sin(uTime * 2.0 + vUv.x * 40.0));
          gl_FragColor = vec4(vec3(1.0), a * 0.85);
        }`,
    });
    this.hullFoam = new THREE.Mesh(g, mat);
    this.hullFoam.renderOrder = 2;
    this.scene.add(this.hullFoam);
  }

  update(dt, party) {
    this.time += dt;
    const t = this.time;
    const night = THREE.MathUtils.smoothstep(party, 0.6, 1.0);
    if (this.hullFoam) this.hullFoam.material.uniforms.uTime.value = t;

    // pangas
    for (const p of this.pangas) {
      const a = p.phase + t * p.speed;
      const x = p.c[0] + Math.cos(a) * p.r;
      const z = p.c[1] + Math.sin(a) * p.r;
      const dx = -Math.sin(a) * Math.sign(p.speed);
      const dz = Math.cos(a) * Math.sign(p.speed);
      p.o.position.set(x, 0.05 + Math.sin(t * 3 + p.phase) * 0.08, z);
      p.o.rotation.set(0.06 + Math.sin(t * 2.6 + p.phase) * 0.03, Math.atan2(dx, dz) + Math.PI, Math.sin(t * 1.9 + p.phase) * 0.04);
      p.wakeT -= dt;
      if (p.wakeT <= 0) {
        p.wakeT = 0.09;
        const back = 5.2;
        this.foam.spawn(x - dx * back + (Math.random() - 0.5), z - dz * back + (Math.random() - 0.5), 1.4, 2.8);
        this.foam.spawn(x + dx * 3 - dz * 1.2, z + dz * 3 + dx * 1.2, 0.6, 1.2);
        this.foam.spawn(x + dx * 3 + dz * 1.2, z + dz * 3 - dx * 1.2, 0.6, 1.2);
      }
    }
    // kayaks
    for (const k of this.kayaks) {
      k.t += dt * 0.012 * k.dir;
      if (k.t > 1 || k.t < 0) { k.dir *= -1; k.t = THREE.MathUtils.clamp(k.t, 0, 1); }
      const x = k.a[0] + (k.b[0] - k.a[0]) * k.t;
      const z = k.a[1] + (k.b[1] - k.a[1]) * k.t;
      const heading = Math.atan2((k.b[0] - k.a[0]) * k.dir, (k.b[1] - k.a[1]) * k.dir) + Math.PI;
      k.o.position.set(x, 0.05 + Math.sin(t * 2 + k.a[0]) * 0.06, z);
      k.o.rotation.set(0, heading + Math.sin(t * 2.4) * 0.12, Math.sin(t * 2.4) * 0.08);
      if (Math.random() < dt * 2) this.foam.spawn(x, z, 0.4, 1.1);
    }
    // pelicans
    for (const b of this.pelicans) this.updatePelican(b, dt, t);
    // dolphins: the pod swims a big loop in front of the yacht and porpoises
    const podA = t * 0.06;
    for (const d of this.dolphins) {
      const a = podA - d.off;
      const R = 115 + d.lane;
      const cx = 10;
      const cz = 70;
      const x = cx + Math.cos(a) * R;
      const z = cz + Math.sin(a) * R * 0.55;
      const tx = -Math.sin(a);
      const tz = Math.cos(a) * 0.55;
      const ph = t * 1.7 + d.phase;
      const arc = Math.sin(ph);
      const y = -2.2 + arc * 3.0;
      d.o.position.set(x, y, z);
      d.o.rotation.order = 'YXZ';
      d.o.rotation.y = Math.atan2(tx, tz) + Math.PI;
      d.o.rotation.x = Math.cos(ph) * 0.9;
      d.o.visible = y > -1.6;
      const up = y > 0;
      if (up !== d.wasUp) {
        for (let i = 0; i < 4; i++) this.foam.spawn(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2, 0.8, 1.6);
        d.wasUp = up;
      }
    }
    // sea lions lift their heads now and then
    for (const s of this.sealions) s.rotation.x = Math.max(0, Math.sin(t * 0.7 + s.userData.phase)) * -0.12;

    this.foam.update(dt, night);
  }

  updatePelican(b, dt, t) {
    b.t += dt;
    const o = b.o;
    if (b.state === 'glide') {
      b.a += dt * b.speed;
      const x = b.c.x + Math.cos(b.a) * b.r;
      const z = b.c.y + Math.sin(b.a) * b.r;
      o.position.set(x, b.h + Math.sin(t * 0.8 + b.r) * 1.2, z);
      o.rotation.set(0, Math.atan2(-Math.sin(b.a), Math.cos(b.a)) + Math.PI, 0.25);
      const flap = (Math.sin(t * 5 + b.r) > 0.6 ? Math.sin(t * 9 + b.r) * 0.5 : 0.05);
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
      if (b.t > b.nextDive) { b.state = 'dive'; b.t = 0; b.from = o.position.clone(); }
    } else if (b.state === 'dive') {
      const k = Math.min(1, b.t / 0.9);
      o.position.y = THREE.MathUtils.lerp(b.from.y, -0.3, k * k);
      o.rotation.x = -1.2 * k;
      b.wingL.rotation.z = 0.9 * k;
      b.wingR.rotation.z = -0.9 * k;
      if (k >= 1) {
        for (let i = 0; i < 8; i++) this.foam.spawn(o.position.x + (Math.random() - 0.5) * 2.5, o.position.z + (Math.random() - 0.5) * 2.5, 1, 2.2);
        b.state = 'float'; b.t = 0;
      }
    } else if (b.state === 'float') {
      o.position.y = 0.15 + Math.sin(t * 2) * 0.08;
      o.rotation.x = 0;
      b.wingL.rotation.z = 0;
      b.wingR.rotation.z = 0;
      if (b.t > 3) { b.state = 'climb'; b.t = 0; }
    } else {
      const k = Math.min(1, b.t / 2.5);
      b.a += dt * b.speed;
      o.position.x = b.c.x + Math.cos(b.a) * b.r;
      o.position.z = b.c.y + Math.sin(b.a) * b.r;
      o.position.y = THREE.MathUtils.lerp(0.2, b.h, k);
      o.rotation.x = 0.3 * (1 - k);
      const flap = Math.sin(t * 12) * 0.7;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
      if (k >= 1) { b.state = 'glide'; b.t = 0; b.nextDive = 10 + Math.random() * 18; }
    }
  }
}

/** Little foam puffs on the water (wakes, splashes). */
class FoamPool {
  constructor(scene, max) {
    const geo = new THREE.CircleGeometry(1, 10);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.items = Array.from({ length: max }, () => ({ life: 0, x: 0, z: 0, s0: 1, s1: 2, dur: 1 }));
    this.cursor = 0;
    this.m = new THREE.Matrix4();
    this.col = new THREE.Color();
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, this.col.setRGB(0, 0, 0));
    }
    scene.add(this.mesh);
  }

  spawn(x, z, s0, s1, dur = 2.2) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    Object.assign(it, { life: dur, dur, x, z, s0, s1 });
  }

  update(dt, night) {
    const bright = 1 - night * 0.6;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.life <= 0) continue;
      it.life -= dt;
      const k = 1 - Math.max(0, it.life) / it.dur;
      const s = it.s0 + (it.s1 - it.s0) * Math.sqrt(k);
      this.m.makeScale(s, 1, s).setPosition(it.x, 0.15, it.z);
      this.mesh.setMatrixAt(i, this.m);
      const a = (1 - k) * 0.7 * bright;
      this.mesh.setColorAt(i, this.col.setRGB(a, a, a));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
