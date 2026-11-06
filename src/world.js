// The continuous 3D world: sky, ocean, Baja mountains, the yacht, lights and props.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SKY_DAY = {
  top: new THREE.Color('#7fb8e8'),
  mid: new THREE.Color('#ffc9a3'),
  horizon: new THREE.Color('#ffb27a'),
  sun: new THREE.Color('#fff1c9'),
};
const SKY_PARTY = {
  top: new THREE.Color('#2b2a6b'),
  mid: new THREE.Color('#9a4f8f'),
  horizon: new THREE.Color('#ff7f6b'),
  sun: new THREE.Color('#ffb070'),
};

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.clock = 0;
    this.party = 0; // 0 = golden hour, 1 = party lights
    this.partyTarget = 0;
    this.updatables = [];

    this.sunDir = new THREE.Vector3(-0.55, 0.22, 0.8).normalize();

    this.buildSky();
    this.buildLights();
    this.buildOcean();
    this.buildBaja();
    this.buildClouds();
    this.buildBirds();

    this.yacht = new THREE.Group(); // bobs on the water; everything on deck is parented here
    this.yacht.name = 'yacht';
    this.scene.add(this.yacht);
    this.stage = new THREE.Group(); // origin = centre of the aft party deck
    this.yacht.add(this.stage);
  }

  // ---------------- Sky ----------------
  buildSky() {
    const geo = new THREE.SphereGeometry(1200, 48, 24);
    this.skyUniforms = {
      uTop: { value: SKY_DAY.top.clone() },
      uMid: { value: SKY_DAY.mid.clone() },
      uHorizon: { value: SKY_DAY.horizon.clone() },
      uSun: { value: SKY_DAY.sun.clone() },
      uSunDir: { value: this.sunDir },
      uParty: { value: 0 },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uHorizon, uSun, uSunDir;
        uniform float uParty, uTime;
        varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main() {
          float h = vDir.y;
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
          col = mix(col, uTop, smoothstep(0.15, 0.7, h));
          col = mix(col, uHorizon * 0.95, smoothstep(0.0, -0.2, h));
          float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
          col += uSun * pow(s, 8.0) * 0.35;
          col += uSun * pow(s, 64.0) * 0.6;
          col = mix(col, vec3(1.0, 0.97, 0.9), smoothstep(0.9965, 0.998, s));
          // stars when the party starts
          vec3 g = floor(vDir * 220.0);
          float st = step(0.9975, hash(g)) * smoothstep(0.15, 0.5, h);
          col += st * uParty * (0.6 + 0.4 * sin(uTime * 3.0 + hash(g) * 30.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(SKY_DAY.horizon.clone(), 220, 900);
  }

  // ---------------- Lights ----------------
  buildLights() {
    this.hemi = new THREE.HemisphereLight('#ffe7cf', '#4fb3b8', 1.25);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#ffd7a8', 2.6);
    this.sun.position.copy(this.sunDir).multiplyScalar(80);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight('#b9d8ff', 0.6);
    this.fill.position.set(30, 25, -40);
    this.scene.add(this.fill);
  }

  // ---------------- Ocean ----------------
  buildOcean() {
    const geo = new THREE.PlaneGeometry(2400, 2400, 220, 220);
    geo.rotateX(-Math.PI / 2);
    this.oceanUniforms = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#0aa3a8') },
      uShallow: { value: new THREE.Color('#34d4c8') },
      uFoam: { value: new THREE.Color('#f4fffb') },
      uHorizon: { value: SKY_DAY.horizon.clone() },
      uSunDir: { value: this.sunDir },
      uParty: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.oceanUniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorld;
        varying float vH;
        float wave(vec2 p, vec2 d, float f, float s, float a){ return sin(dot(p, d) * f + uTime * s) * a; }
        void main(){
          vec3 p = position;
          float fade = 1.0 - smoothstep(60.0, 500.0, length(p.xz));
          float h = wave(p.xz, normalize(vec2(1.0, 0.4)), 0.11, 1.1, 0.45)
                  + wave(p.xz, normalize(vec2(-0.3, 1.0)), 0.17, 1.6, 0.25)
                  + wave(p.xz, normalize(vec2(0.7, -0.8)), 0.29, 2.1, 0.12);
          p.y += h * (0.35 + 0.65 * fade);
          vH = h;
          vec4 w = modelMatrix * vec4(p, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uParty;
        uniform vec3 uDeep, uShallow, uFoam, uHorizon, uSunDir;
        varying vec3 vWorld;
        varying float vH;
        vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3))); return -1.0 + 2.0*fract(sin(p)*43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(dot(hash2(i), f), dot(hash2(i+vec2(1,0)), f-vec2(1,0)), u.x),
                     mix(dot(hash2(i+vec2(0,1)), f-vec2(0,1)), dot(hash2(i+vec2(1,1)), f-vec2(1,1)), u.x), u.y);
        }
        void main(){
          vec3 col = mix(uDeep, uShallow, smoothstep(-0.5, 0.6, vH));
          // stylized foam squiggles like the reference art
          vec2 q = vWorld.xz * 0.09;
          float n = noise(q + vec2(uTime * 0.05, uTime * 0.03)) + 0.5 * noise(q * 2.3 - uTime * 0.04);
          float band = abs(fract(n * 3.0) - 0.5);
          float foam = smoothstep(0.035, 0.0, band) * smoothstep(-0.2, 0.5, n);
          float dist = length(vWorld.xz - cameraPosition.xz);
          foam *= 1.0 - smoothstep(80.0, 260.0, dist);
          col = mix(col, uFoam, foam * 0.85);
          // sun glitter
          vec3 v = normalize(cameraPosition - vWorld);
          vec3 r = reflect(-normalize(uSunDir), vec3(0.0, 1.0, 0.0));
          float spec = pow(max(dot(r, v), 0.0), 60.0);
          col += vec3(1.0, 0.85, 0.6) * spec * 0.6 * (1.0 - uParty * 0.6);
          col *= 1.0 - uParty * 0.35;
          // fade to horizon
          col = mix(col, uHorizon, smoothstep(250.0, 1000.0, dist));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.ocean = new THREE.Mesh(geo, mat);
    this.ocean.position.y = 0;
    this.scene.add(this.ocean);
  }

  // ---------------- Baja California mountains & islands ----------------
  buildBaja() {
    const group = new THREE.Group();
    const palettes = [
      ['#c4663f', '#d98457', '#e9a370'],
      ['#b0563a', '#cf7a4f', '#e39a66'],
      ['#a8728f', '#c08aa0', '#d6a3a8'], // hazy far ridges
    ];
    const rand = mulberry32(7);
    const makeRidge = (width, height, depth, pal, seed) => {
      const segX = 28;
      const segZ = 6;
      const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const r = mulberry32(seed);
      const peaks = Array.from({ length: 5 }, () => ({ x: (r() - 0.5) * width * 0.8, h: 0.5 + r() * 0.5, w: width * (0.08 + r() * 0.12) }));
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const edge = 1 - Math.min(1, Math.abs(z) / (depth / 2));
        const ex = 1 - Math.pow(Math.abs(x) / (width / 2), 3);
        let h = 0;
        for (const p of peaks) h = Math.max(h, p.h * Math.exp(-Math.pow((x - p.x) / p.w, 2)));
        h = (h * 0.75 + 0.25) * height * edge * ex;
        h += (r() - 0.5) * height * 0.06 * edge;
        pos.setY(i, Math.max(-2, h - 2));
      }
      geo.computeVertexNormals();
      const nonIndexed = geo.toNonIndexed();
      // flat-shaded strata colouring
      const colors = [];
      const p2 = nonIndexed.attributes.position;
      const cA = new THREE.Color(pal[0]);
      const cB = new THREE.Color(pal[1]);
      const cC = new THREE.Color(pal[2]);
      for (let i = 0; i < p2.count; i += 3) {
        const y = (p2.getY(i) + p2.getY(i + 1) + p2.getY(i + 2)) / 3;
        const t = y / height;
        const c = t < 0.25 ? cC : t < 0.6 ? cB : cA;
        const j = 0.92 + r() * 0.12;
        for (let k = 0; k < 3; k++) colors.push(c.r * j, c.g * j, c.b * j);
      }
      nonIndexed.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      nonIndexed.computeVertexNormals();
      const mesh = new THREE.Mesh(nonIndexed, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
      return mesh;
    };

    // Ring of desert mountains around the bay, open toward the sunset.
    const ridges = [
      { a: 0.15, d: 330, w: 260, h: 70, dep: 90, pal: 0 },
      { a: 0.75, d: 380, w: 300, h: 95, dep: 110, pal: 1 },
      { a: 1.35, d: 340, w: 240, h: 60, dep: 90, pal: 0 },
      { a: 1.95, d: 420, w: 320, h: 110, dep: 120, pal: 2 },
      { a: 2.6, d: 400, w: 260, h: 80, dep: 100, pal: 2 },
      { a: 3.4, d: 460, w: 340, h: 120, dep: 120, pal: 2 },
      { a: 4.3, d: 380, w: 280, h: 85, dep: 100, pal: 1 },
      { a: 5.0, d: 330, w: 240, h: 65, dep: 90, pal: 0 },
      { a: 5.65, d: 360, w: 260, h: 90, dep: 100, pal: 1 },
    ];
    ridges.forEach((r, i) => {
      const m = makeRidge(r.w, r.h, r.dep, palettes[r.pal], 100 + i);
      m.position.set(Math.sin(r.a) * r.d, 0, Math.cos(r.a) * r.d);
      m.rotation.y = r.a;
      group.add(m);
    });

    // Islands (Espíritu Santo vibes): sandy rim + red cliffs + cacti
    const islandSpots = [
      [120, 150, 1.0], [-150, 170, 0.8], [190, -40, 0.7], [-200, -120, 0.9], [70, 230, 0.6], [-90, -210, 0.7],
    ];
    for (const [x, z, s] of islandSpots) group.add(this.makeIsland(x, z, s, rand));
    this.scene.add(group);
    this.baja = group;
  }

  makeIsland(x, z, s, rand) {
    const g = new THREE.Group();
    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(22 * s, 26 * s, 2, 16),
      new THREE.MeshStandardMaterial({ color: '#f4d9a6', roughness: 1, flatShading: true }),
    );
    sand.position.y = -0.4;
    g.add(sand);
    const rockMat = new THREE.MeshStandardMaterial({ color: '#c8653e', roughness: 1, flatShading: true });
    const rockMat2 = new THREE.MeshStandardMaterial({ color: '#dc8a58', roughness: 1, flatShading: true });
    for (let i = 0; i < 4; i++) {
      const h = (10 + rand() * 16) * s;
      const rock = new THREE.Mesh(new THREE.CylinderGeometry((5 + rand() * 4) * s, (9 + rand() * 6) * s, h, 7, 2), i % 2 ? rockMat : rockMat2);
      rock.position.set((rand() - 0.5) * 18 * s, h / 2, (rand() - 0.5) * 18 * s);
      rock.rotation.y = rand() * 6;
      g.add(rock);
    }
    const cactusMat = new THREE.MeshStandardMaterial({ color: '#4f9a5a', roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 3.5, 4, 8), cactusMat);
      trunk.position.y = 2;
      c.add(trunk);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.4, 4, 8), cactusMat);
      arm.position.set(0.9, 2.5, 0);
      c.add(arm);
      const a = rand() * Math.PI * 2;
      c.position.set(Math.cos(a) * 18 * s, 0.4, Math.sin(a) * 18 * s);
      c.scale.setScalar(s * 1.2);
      g.add(c);
    }
    g.position.set(x, 0, z);
    return g;
  }

  buildClouds() {
    const mat = new THREE.MeshStandardMaterial({ color: '#fff3ea', roughness: 1, emissive: '#ffcfb0', emissiveIntensity: 0.25 });
    this.cloudMat = mat;
    this.clouds = new THREE.Group();
    const rand = mulberry32(42);
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(rand() * 4);
      for (let j = 0; j < n; j++) {
        const s = 8 + rand() * 10;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 14, 10), mat);
        puff.position.set(j * 10 - n * 5, rand() * 4, (rand() - 0.5) * 8);
        puff.scale.y = 0.7;
        c.add(puff);
      }
      const a = rand() * Math.PI * 2;
      const d = 350 + rand() * 300;
      c.position.set(Math.sin(a) * d, 90 + rand() * 90, Math.cos(a) * d);
      c.lookAt(0, c.position.y, 0);
      c.userData.speed = 0.01 + rand() * 0.02;
      c.userData.angle = a;
      c.userData.dist = d;
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);
  }

  buildBirds() {
    this.birds = [];
    const mat = new THREE.MeshBasicMaterial({ color: '#3a3446', side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Group();
      const wingGeo = new THREE.BufferGeometry();
      wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.6, 0, -0.4, 0.2, 0, -0.9], 3));
      const l = new THREE.Mesh(wingGeo, mat);
      const r = new THREE.Mesh(wingGeo, mat);
      r.scale.x = -1;
      b.add(l, r);
      b.userData = { l, r, phase: Math.random() * 6, radius: 40 + i * 12, height: 28 + i * 5, speed: 0.08 + Math.random() * 0.05 };
      this.scene.add(b);
      this.birds.push(b);
    }
  }

  // ---------------- The yacht (Tripo-generated) ----------------
  async loadYacht(url, onProgress) {
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => loader.load(url, resolve, (e) => onProgress?.(e.total ? e.loaded / e.total : 0), reject));
    const model = gltf.scene;
    // Clip the tall clutter (lamp posts, flower pots) that the generated model put on the
    // aft deck, so the game-show set reads clearly. Only geometry inside BOTH half-spaces
    // (above head height AND behind the board line) is removed.
    this.clipAbove = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    this.clipBehind = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    model.traverse((o) => {
      if (o.isMesh) {
        o.material.clippingPlanes = [this.clipAbove, this.clipBehind];
        o.material.clipIntersection = true;
        o.material.clipShadows = true;
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.envMapIntensity = 0.6;
          if ('roughness' in o.material) o.material.roughness = Math.max(o.material.roughness ?? 0.6, 0.55);
          if ('metalness' in o.material) o.material.metalness = Math.min(o.material.metalness ?? 0, 0.15);
        }
      }
    });
    // Normalize: long axis = Z, length = 56 units, stern toward -Z.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const L = 56;
    const s = L / size.z;
    model.scale.setScalar(s);
    box.setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= box.min.y;
    model.position.y -= 3.4; // sit the hull in the water
    this.yacht.add(model);
    this.yachtModel = model;
    model.updateMatrixWorld(true);

    // Find the aft deck floor by raycasting down (ignoring the canopy & furniture).
    const box2 = new THREE.Box3().setFromObject(model);
    const H = box2.max.y - box2.min.y;
    const meshes = [];
    model.traverse((o) => o.isMesh && meshes.push(o));
    const rc = new THREE.Raycaster();
    const deckAt = (x, z) => {
      rc.set(new THREE.Vector3(x, box2.max.y + 5, z), new THREE.Vector3(0, -1, 0));
      const hits = rc.intersectObjects(meshes, false).filter((h) => h.point.y < box2.min.y + H * 0.53);
      return hits.length ? hits[0].point.y : null;
    };
    const sternZ = box2.min.z;
    const samples = [];
    for (let i = 0; i < 9; i++) {
      const y = deckAt((i - 4) * 0.4, sternZ + L * 0.16);
      if (y !== null) samples.push(y);
    }
    samples.sort((a, b) => a - b);
    const deckY = samples.length ? samples[Math.floor(samples.length / 2)] : box2.min.y + H * 0.49;
    this.deckY = deckY;
    this.deckAt = deckAt;
    this.stage.position.set(0, deckY, sternZ + L * 0.17);
    this.stageBounds = { halfWidth: 5.2, back: -4.5, front: 4.8 };
    this.buildDeckProps();
    return model;
  }

  /** A simple fallback yacht if the GLB can't be loaded. */
  buildFallbackYacht() {
    const hull = new THREE.Mesh(
      new THREE.CapsuleGeometry(8, 36, 6, 16),
      new THREE.MeshStandardMaterial({ color: '#f3e3cc', roughness: 0.7 }),
    );
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(1, 1, 0.55);
    hull.position.y = 1.5;
    hull.castShadow = hull.receiveShadow = true;
    this.yacht.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 44), new THREE.MeshStandardMaterial({ color: '#d99a5b' }));
    deck.position.y = 5.6;
    deck.receiveShadow = true;
    this.yacht.add(deck);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 18), new THREE.MeshStandardMaterial({ color: '#f6ead8' }));
    cabin.position.set(0, 8.3, 4);
    cabin.castShadow = true;
    this.yacht.add(cabin);
    this.deckY = 5.8;
    this.deckAt = () => this.deckY;
    this.stage.position.set(0, this.deckY, -15);
    this.stageBounds = { halfWidth: 5.2, back: -4.5, front: 4.8 };
    this.buildDeckProps();
  }

  buildDeckProps() {
    const st = this.stage;
    // Party string lights across the aft deck
    this.bulbs = [];
    const posts = [[-7.3, -1.6], [7.3, -1.6], [7.3, 4.6], [-7.3, 4.6]];
    const postMat = new THREE.MeshStandardMaterial({ color: '#c98b4f', roughness: 0.8 });
    const postH = 5.2;
    for (const [x, z] of posts) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, postH, 8), postMat);
      p.position.set(x, postH / 2, z);
      p.castShadow = true;
      st.add(p);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), postMat);
      cap.position.set(x, postH, z);
      st.add(cap);
    }
    const bulbColors = ['#ffd27a', '#ffb3c7', '#9ff0e6', '#ffe9a8', '#ffc08a'];
    const wire = (a, b, n, sag) => {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, postH - 0.1 - Math.sin(Math.PI * t) * sag, a[1] + (b[1] - a[1]) * t));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.025, 4), new THREE.MeshBasicMaterial({ color: '#4a3a30' }));
      st.add(tube);
      for (let i = 1; i < n; i++) {
        const p = curve.getPoint(i / n);
        const col = new THREE.Color(bulbColors[(i + this.bulbs.length) % bulbColors.length]);
        const m = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, roughness: 0.3 });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m);
        bulb.position.copy(p).add(new THREE.Vector3(0, -0.16, 0));
        st.add(bulb);
        this.bulbs.push(bulb);
      }
    };
    wire(posts[1], posts[2], 10, 0.7);
    wire(posts[3], posts[0], 10, 0.7);
    // diagonal bunting
    this.flags = [];
    const flagColors = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#f78c6b', '#c77dff'];
    const buntA = posts[0];
    const buntB = posts[1];
    for (let i = 1; i < 22; i++) {
      const t = i / 22;
      const x = buntA[0] + (buntB[0] - buntA[0]) * t;
      const z = buntA[1] + (buntB[1] - buntA[1]) * t;
      const y = postH - 0.2 - Math.sin(Math.PI * t) * 0.8;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.5, 0], 3));
      g.computeVertexNormals();
      const f = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: flagColors[i % flagColors.length], side: THREE.DoubleSide, roughness: 0.9 }));
      f.position.set(x, y, z);
      f.rotation.y = Math.atan2(buntB[0] - buntA[0], buntB[1] - buntA[1]) + Math.PI / 2;
      f.userData.phase = i * 0.7;
      st.add(f);
      this.flags.push(f);
    }

    // Party point lights (fade in as the night goes on)
    this.partyLights = [];
    const pl = [['#ff6fb5', -4, 3.5, 0], ['#4fe3ff', 4, 3.5, 0], ['#ffd36b', 0, 5, 3]];
    for (const [c, x, y, z] of pl) {
      const l = new THREE.PointLight(c, 0, 18, 1.6);
      l.position.set(x, y, z);
      st.add(l);
      this.partyLights.push(l);
    }

    // Balloons beside the board
    this.balloons = [];
    const bc = ['#ff6b8b', '#ffd166', '#4cc9f0', '#06d6a0', '#c77dff', '#ff9f43'];
    const clusters = [[-7.0, 0.4], [7.0, 0.4]];
    clusters.forEach(([cx, cz], ci) => {
      for (let i = 0; i < 3; i++) {
        const col = bc[(i + ci * 3) % bc.length];
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: col, roughness: 0.25, metalness: 0.05 }));
        b.scale.y = 1.18;
        const h = 3.6 + i * 0.55;
        const off = new THREE.Vector3((i - 1) * 0.45, h, (i % 2) * 0.3);
        b.position.set(cx + off.x, off.y, cz + off.z);
        b.castShadow = true;
        b.userData = { base: b.position.clone(), phase: i + ci * 2 };
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, h, 3), new THREE.MeshBasicMaterial({ color: '#fff' }));
        str.position.set(cx + off.x * 0.5, h / 2, cz + off.z * 0.5);
        st.add(b, str);
        this.balloons.push(b);
      }
      // little drinks table
      const table = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16), new THREE.MeshStandardMaterial({ color: '#b97a45' }));
      top.position.y = 1.0;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1, 8), new THREE.MeshStandardMaterial({ color: '#8d5a33' }));
      leg.position.y = 0.5;
      table.add(top, leg);
      const drinkCols = ['#ff9f43', '#4cc9f0', '#ff6b8b'];
      for (let d = 0; d < 3; d++) {
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.32, 10), new THREE.MeshStandardMaterial({ color: drinkCols[d], roughness: 0.2, transparent: true, opacity: 0.9 }));
        const a = (d / 3) * Math.PI * 2;
        glass.position.set(Math.cos(a) * 0.3, 1.21, Math.sin(a) * 0.3);
        const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), new THREE.MeshStandardMaterial({ color: '#fff' }));
        straw.position.set(glass.position.x + 0.04, 1.42, glass.position.z);
        straw.rotation.z = 0.25;
        const lime = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 12), new THREE.MeshStandardMaterial({ color: '#9be15d' }));
        lime.position.set(glass.position.x - 0.1, 1.36, glass.position.z);
        table.add(glass, straw, lime);
      }
      table.position.set(cx, 0, cz - 1.3);
      table.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      st.add(table);
    });

    // A big potted palm
    const palm = this.makePalm();
    palm.position.set(-7.0, 0, 5.4);
    st.add(palm);
    const palm2 = this.makePalm();
    palm2.position.set(7.0, 0, 5.4);
    palm2.scale.setScalar(0.85);
    st.add(palm2);
  }

  makePalm() {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 12), new THREE.MeshStandardMaterial({ color: '#f2e2c9', roughness: 0.8 }));
    pot.position.y = 0.35;
    g.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#3fa55b', roughness: 0.7, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), leafMat);
      leaf.scale.set(0.35, 0.12, 1.3);
      const a = (i / 7) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.55, 1.35 + (i % 2) * 0.2, Math.sin(a) * 0.55);
      leaf.rotation.y = -a + Math.PI / 2;
      leaf.rotation.x = 0.5;
      g.add(leaf);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.8, 6), new THREE.MeshStandardMaterial({ color: '#6b8f3a' }));
    stem.position.y = 0.95;
    g.add(stem);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  setParty(t) { this.partyTarget = THREE.MathUtils.clamp(t, 0, 1); }

  update(dt) {
    this.clock += dt;
    const t = this.clock;
    this.party += (this.partyTarget - this.party) * Math.min(1, dt * 0.8);
    const p = this.party;

    // sky & light blend: golden hour -> party night
    const u = this.skyUniforms;
    u.uTime.value = t;
    u.uParty.value = p;
    u.uTop.value.copy(SKY_DAY.top).lerp(SKY_PARTY.top, p);
    u.uMid.value.copy(SKY_DAY.mid).lerp(SKY_PARTY.mid, p);
    u.uHorizon.value.copy(SKY_DAY.horizon).lerp(SKY_PARTY.horizon, p);
    u.uSun.value.copy(SKY_DAY.sun).lerp(SKY_PARTY.sun, p);
    this.scene.fog.color.copy(u.uHorizon.value);
    this.oceanUniforms.uHorizon.value.copy(u.uHorizon.value);
    this.oceanUniforms.uTime.value = t;
    this.oceanUniforms.uParty.value = p;
    this.sun.intensity = 2.6 - p * 1.6;
    this.hemi.intensity = 1.25 - p * 0.45;
    this.sun.color.set('#ffd7a8').lerp(new THREE.Color('#ff9a6b'), p);
    if (this.cloudMat) this.cloudMat.emissive.set('#ffcfb0').lerp(new THREE.Color('#c86a9c'), p);

    // yacht bobbing
    this.yacht.position.y = Math.sin(t * 0.8) * 0.18;
    this.yacht.rotation.z = Math.sin(t * 0.55) * 0.012;
    this.yacht.rotation.x = Math.sin(t * 0.4 + 1) * 0.006;

    // shadow camera follows stage; clipping box follows the bobbing deck
    if (this.stage) {
      const sp = this.stage.getWorldPosition(_v);
      if (this.clipAbove) {
        this.clipAbove.constant = sp.y + 2.3;
        this.clipBehind.constant = -(sp.z + 6.6);
      }
      this.sun.target.position.copy(sp);
      this.sun.position.copy(sp).addScaledVector(this.sunDir, 80);
    }

    if (this.bulbs) {
      this.bulbs.forEach((b, i) => {
        b.material.emissiveIntensity = 0.5 + p * 2.2 + Math.sin(t * 3 + i * 0.9) * (0.15 + p * 0.5);
      });
      this.partyLights.forEach((l, i) => { l.intensity = p * (18 + Math.sin(t * 2 + i * 2) * 6); });
      this.flags.forEach((f) => { f.rotation.x = Math.sin(t * 2.4 + f.userData.phase) * 0.25; });
      this.balloons.forEach((b) => {
        const d = b.userData;
        b.position.x = d.base.x + Math.sin(t * 0.9 + d.phase) * 0.08;
        b.position.y = d.base.y + Math.sin(t * 1.3 + d.phase) * 0.1;
      });
    }

    this.clouds.children.forEach((c) => {
      c.userData.angle += c.userData.speed * dt * 0.05;
      c.position.x = Math.sin(c.userData.angle) * c.userData.dist;
      c.position.z = Math.cos(c.userData.angle) * c.userData.dist;
    });
    this.birds.forEach((b) => {
      const d = b.userData;
      const a = t * d.speed + d.phase;
      b.position.set(Math.cos(a) * d.radius + 10, d.height + Math.sin(t + d.phase) * 2, Math.sin(a) * d.radius - 20);
      b.rotation.y = -a;
      const flap = Math.sin(t * 6 + d.phase) * 0.5;
      d.l.rotation.z = flap;
      d.r.rotation.z = -flap;
    });

    for (const u2 of this.updatables) u2(dt, t);
  }
}

const _v = new THREE.Vector3();

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
