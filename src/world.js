// The continuous 3D world: sky, Sea of Cortez water, Baja scenery, the yacht, lights and props.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Time of day keyframes: clear Baja afternoon -> golden hour -> party night.
// The game drives this with `party` (0 at the start of the board, 1 when it's cleared).
const C = (h) => new THREE.Color(h);
const SKY_KEYS = [
  { at: 0.0, top: C('#1659c9'), mid: C('#4a9ce6'), horizon: C('#cfeaf6'), sun: C('#fff6dc'), sunDir: new THREE.Vector3(0.45, 0.72, -0.53), sunCol: C('#fff3df'), sunI: 3.0, hemiSky: C('#cfe8ff'), hemiGround: C('#5fc9c0'), hemiI: 1.35 },
  { at: 0.55, top: C('#3a63b8'), mid: C('#e7a98c'), horizon: C('#ffc68f'), sun: C('#ffd9a0'), sunDir: new THREE.Vector3(-0.84, 0.2, 0.5), sunCol: C('#ffc28a'), sunI: 2.5, hemiSky: C('#ffe0c4'), hemiGround: C('#4fb3b8'), hemiI: 1.15 },
  { at: 1.0, top: C('#1d2160'), mid: C('#7c4590'), horizon: C('#f27a6c'), sun: C('#ffae74'), sunDir: new THREE.Vector3(-0.86, 0.06, 0.5), sunCol: C('#ff8f6b'), sunI: 1.0, hemiSky: C('#9a8cd8'), hemiGround: C('#2a6f8a'), hemiI: 0.85 },
];
SKY_KEYS.forEach((k) => k.sunDir.normalize());

function skyAt(p, out) {
  const a = p < SKY_KEYS[1].at ? SKY_KEYS[0] : SKY_KEYS[1];
  const b = p < SKY_KEYS[1].at ? SKY_KEYS[1] : SKY_KEYS[2];
  const t = THREE.MathUtils.smoothstep(p, a.at, b.at);
  for (const k of ['top', 'mid', 'horizon', 'sun', 'sunCol', 'hemiSky', 'hemiGround']) out[k].copy(a[k]).lerp(b[k], t);
  out.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
  out.sunI = a.sunI + (b.sunI - a.sunI) * t;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;
  out.golden = 1 - Math.abs(p - 0.55) / 0.45;
  out.night = THREE.MathUtils.smoothstep(p, 0.55, 1.0);
  return out;
}

export const OCEAN_DOMAIN = 800; // matches tools/blender/bay.py

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.clock = 0;
    this.party = 0; // 0 = afternoon, 0.55 = golden hour, 1 = party night
    this.partyTarget = 0;
    this.updatables = [];
    this.sky_ = { top: C('#000'), mid: C('#000'), horizon: C('#000'), sun: C('#000'), sunCol: C('#000'), hemiSky: C('#000'), hemiGround: C('#000'), sunDir: new THREE.Vector3(), sunI: 1, hemiI: 1, golden: 0, night: 0 };
    skyAt(0, this.sky_);
    this.sunDir = this.sky_.sunDir;

    this.buildSky();
    this.buildLights();
    this.buildOcean();
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
    const geo = new THREE.SphereGeometry(3000, 48, 24);
    const k = this.sky_;
    this.skyUniforms = {
      uTop: { value: k.top },
      uMid: { value: k.mid },
      uHorizon: { value: k.horizon },
      uSun: { value: k.sun },
      uSunDir: { value: k.sunDir },
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
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.16, h));
          col = mix(col, uTop, smoothstep(0.12, 0.62, h));
          col = mix(col, uHorizon, smoothstep(0.0, -0.1, h));
          float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
          col += uSun * pow(s, 6.0) * 0.28;
          col += uSun * pow(s, 48.0) * 0.5;
          col = mix(col, vec3(1.0, 0.98, 0.92) * 1.6, smoothstep(0.9975, 0.9988, s));
          vec3 g = floor(vDir * 260.0);
          float st = step(0.9972, hash(g)) * smoothstep(0.12, 0.45, h);
          col += st * smoothstep(0.6, 1.0, uParty) * (0.7 + 0.3 * sin(uTime * 3.0 + hash(g) * 30.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(k.horizon.clone(), 380, 1900);
  }

  // ---------------- Lights ----------------
  buildLights() {
    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#5fc9c0', 1.35);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#fff3df', 3.0);
    this.sun.position.copy(this.sunDir).multiplyScalar(80);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // a big soft "landscape sun" (no shadows) so far islands and mountains get directional light too
    this.farSun = new THREE.DirectionalLight('#fff3df', 1.2);
    this.scene.add(this.farSun);

    this.fill = new THREE.DirectionalLight('#b9d8ff', 0.5);
    this.fill.position.set(30, 25, -40);
    this.scene.add(this.fill);
  }

  // ---------------- Sea of Cortez water ----------------
  buildOcean() {
    // depth map baked from the Blender bay (tools/blender/bay.py); until it loads, everything is "deep"
    const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    blank.needsUpdate = true;
    this.oceanUniforms = {
      uTime: { value: 0 },
      uDepth: { value: blank },
      uDomain: { value: OCEAN_DOMAIN },
      uDepthMax: { value: 40 },
      uSand: { value: C('#f3ead0') },
      uAqua0: { value: C('#b5f5e6') },
      uAqua1: { value: C('#5fe3d6') },
      uTurq: { value: C('#16c3c6') },
      uTeal: { value: C('#0d9cc0') },
      uBlue: { value: C('#0b68b8') },
      uDeep: { value: C('#0a3f8f') },
      uFoam: { value: C('#ffffff') },
      uSkyHorizon: { value: this.sky_.horizon },
      uSkyTop: { value: this.sky_.mid },
      uSunDir: { value: this.sky_.sunDir },
      uSunCol: { value: this.sky_.sun },
      uGolden: { value: 0 },
      uNight: { value: 0 },
      uFogColor: { value: this.scene.fog.color },
      uFogNear: { value: this.scene.fog.near },
      uFogFar: { value: this.scene.fog.far },
    };
    const vertexShader = /* glsl */ `
      uniform float uTime, uDomain, uDepthMax;
      uniform sampler2D uDepth;
      varying vec3 vWorld;
      varying float vH;
      varying float vDepth;
      float depthAt(vec2 xz){
        vec2 uv = xz / (2.0 * uDomain) + 0.5;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return uDepthMax;
        return texture2D(uDepth, uv).r * uDepthMax;
      }
      float wave(vec2 p, vec2 d, float f, float s, float a){ return sin(dot(p, d) * f + uTime * s) * a; }
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        float d = depthAt(w.xz);
        float r = length(w.xz);
        float amp = smoothstep(0.3, 6.0, d) * (1.0 - smoothstep(380.0, 560.0, r)) * (0.4 + 0.6 * (1.0 - smoothstep(40.0, 300.0, r)));
        float h = wave(w.xz, normalize(vec2(1.0, 0.4)), 0.11, 1.1, 0.42)
                + wave(w.xz, normalize(vec2(-0.3, 1.0)), 0.17, 1.6, 0.22)
                + wave(w.xz, normalize(vec2(0.7, -0.8)), 0.29, 2.1, 0.1);
        w.y += h * amp;
        vH = h * amp;
        vDepth = d;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`;
    const fragmentShader = /* glsl */ `
      uniform float uTime, uDomain, uDepthMax, uGolden, uNight, uFogNear, uFogFar;
      uniform sampler2D uDepth;
      uniform vec3 uSand, uAqua0, uAqua1, uTurq, uTeal, uBlue, uDeep, uFoam, uSkyHorizon, uSkyTop, uSunDir, uSunCol, uFogColor;
      varying vec3 vWorld;
      varying float vH;
      varying float vDepth;
      vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3))); return -1.0 + 2.0*fract(sin(p)*43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(dot(hash2(i), f), dot(hash2(i+vec2(1,0)), f-vec2(1,0)), u.x),
                   mix(dot(hash2(i+vec2(0,1)), f-vec2(0,1)), dot(hash2(i+vec2(1,1)), f-vec2(1,1)), u.x), u.y);
      }
      float fbm(vec2 p){ return noise(p) * 0.6 + noise(p * 2.1 + 3.1) * 0.3 + noise(p * 4.3 - 1.7) * 0.1; }
      float depthAt(vec2 xz){
        vec2 uv = xz / (2.0 * uDomain) + 0.5;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return uDepthMax;
        return texture2D(uDepth, uv).r * uDepthMax;
      }
      // stylized caustics: thin bright web that drifts
      float caustics(vec2 p, float t){
        float c = 0.0;
        vec2 q = p + vec2(noise(p * 0.5 + t * 0.1), noise(p * 0.5 - t * 0.1)) * 1.5;
        float a = abs(noise(q + t * 0.25));
        float b = abs(noise(q * 1.7 - t * 0.2 + 5.0));
        c = pow(1.0 - smoothstep(0.0, 0.08, a), 2.0) + pow(1.0 - smoothstep(0.0, 0.06, b), 2.0) * 0.6;
        return c;
      }
      void main(){
        float d = depthAt(vWorld.xz) + noise(vWorld.xz * 0.05) * 0.6;
        float dist = length(vWorld.xz - cameraPosition.xz);
        // --- colour by depth: sand -> pale aqua -> turquoise -> teal -> blue -> deep navy ---
        vec3 col = mix(uSand, uAqua0, smoothstep(0.0, 0.9, d));
        col = mix(col, uAqua1, smoothstep(0.7, 3.2, d));
        col = mix(col, uTurq, smoothstep(2.8, 8.5, d));
        col = mix(col, uTeal, smoothstep(8.0, 16.0, d));
        col = mix(col, uBlue, smoothstep(14.0, 26.0, d));
        col = mix(col, uDeep, smoothstep(24.0, 40.0, d));
        // seabed: dark rock / seagrass patches and sand ripples seen through clear water
        float patchN = fbm(vWorld.xz * 0.03 + 7.0);
        float patches = smoothstep(0.12, 0.38, patchN) * smoothstep(1.2, 3.5, d) * (1.0 - smoothstep(9.0, 17.0, d));
        col = mix(col, col * vec3(0.55, 0.72, 0.78), patches * 0.55);
        float ripple = sin(vWorld.x * 0.9 + noise(vWorld.xz * 0.2) * 6.0) * 0.5 + 0.5;
        col += vec3(0.06, 0.07, 0.05) * ripple * (1.0 - smoothstep(0.5, 4.0, d)) * (1.0 - smoothstep(60.0, 180.0, dist));
        float caus = caustics(vWorld.xz * 0.22, uTime) * (1.0 - smoothstep(3.0, 13.0, d)) * (1.0 - smoothstep(70.0, 260.0, dist));
        col += vec3(0.75, 1.0, 0.95) * caus * 0.22 * (1.0 - uNight);
        // ripples normal for lighting
        vec2 e = vec2(0.6, 0.0);
        vec2 rp = vWorld.xz * 0.35 + vec2(uTime * 0.35, uTime * 0.22);
        float n0 = noise(rp);
        vec3 nrm = normalize(vec3((noise(rp + e.xy) - n0) * -2.2, 1.0, (noise(rp + e.yx) - n0) * -2.2) + vec3(0.0, 0.0, 0.0));
        vec3 v = normalize(cameraPosition - vWorld);
        // sky reflection at grazing angles (keeps the horizon soft and hazy)
        float fres = pow(1.0 - max(dot(v, nrm), 0.0), 5.0);
        col = mix(col, mix(uSkyTop, uSkyHorizon, 0.35), fres * 0.22 * smoothstep(6.0, 20.0, d));
        // deep-water stylized foam squiggles (like the concept art)
        vec2 q = vWorld.xz * 0.075;
        float fn = noise(q + vec2(uTime * 0.05, uTime * 0.03)) + 0.5 * noise(q * 2.3 - uTime * 0.04);
        float band = abs(fract(fn * 3.0) - 0.5);
        float squig = smoothstep(0.03, 0.0, band) * smoothstep(-0.1, 0.5, fn) * smoothstep(5.0, 12.0, d) * (1.0 - smoothstep(90.0, 300.0, dist));
        col = mix(col, uFoam, squig * 0.45);
        // shoreline foam: bright rim + bands rolling in
        float rim = 1.0 - smoothstep(0.0, 0.45, d);
        float bands = smoothstep(0.82, 0.97, sin(d * 6.5 - uTime * 2.0 + noise(vWorld.xz * 0.15) * 4.0)) * (1.0 - smoothstep(0.3, 1.8, d));
        float shore = max(rim, bands * 0.75) * (0.75 + 0.25 * noise(vWorld.xz * 0.6 + uTime));
        col = mix(col, uFoam, clamp(shore, 0.0, 1.0));
        // sun glint + sparkles
        vec3 rf = reflect(-normalize(uSunDir), nrm);
        float sd = max(dot(rf, v), 0.0);
        col += uSunCol * pow(sd, 90.0) * 0.9;
        float sparkle = step(0.82, noise(vWorld.xz * 1.3 + uTime * 0.8)) * pow(sd, 6.0) * (1.0 - smoothstep(60.0, 400.0, dist));
        col += vec3(1.0) * sparkle * 0.9;
        // golden hour warmth, night darkness
        col = mix(col, col * vec3(1.12, 0.93, 0.78) + vec3(0.06, 0.02, 0.0), uGolden * 0.45);
        col = mix(col, col * vec3(0.24, 0.3, 0.52) + vec3(0.02, 0.0, 0.05), uNight * 0.85);
        // horizon haze (matches scene fog)
        col = mix(col, uFogColor, smoothstep(uFogNear * 1.8, uFogFar * 1.5, dist) * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`;
    const mat = new THREE.ShaderMaterial({ uniforms: this.oceanUniforms, vertexShader, fragmentShader });
    this.oceanMat = mat;
    // dense square around the bay + a flat frame out to the horizon
    const inner = new THREE.PlaneGeometry(1200, 1200, 300, 300);
    inner.rotateX(-Math.PI / 2);
    const shape = new THREE.Shape([new THREE.Vector2(-5000, -5000), new THREE.Vector2(5000, -5000), new THREE.Vector2(5000, 5000), new THREE.Vector2(-5000, 5000)]);
    shape.holes.push(new THREE.Path([new THREE.Vector2(-600, -600), new THREE.Vector2(-600, 600), new THREE.Vector2(600, 600), new THREE.Vector2(600, -600)]));
    const outer = new THREE.ShapeGeometry(shape);
    outer.rotateX(-Math.PI / 2);
    this.ocean = new THREE.Group();
    this.ocean.add(new THREE.Mesh(inner, mat), new THREE.Mesh(outer, mat));
    this.ocean.children.forEach((m) => { m.frustumCulled = false; });
    this.scene.add(this.ocean);
  }

  setDepthMap(tex, depthMax) {
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.oceanUniforms.uDepth.value = tex;
    this.oceanUniforms.uDepthMax.value = depthMax;
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

  // ---------------- The party yacht (built in Blender: tools/blender/yacht.py) ----------------
  async loadYacht(url, onProgress) {
    const loader = new GLTFLoader();
    const [gltf, layout] = await Promise.all([
      new Promise((resolve, reject) => loader.load(url, resolve, (e) => onProgress?.(e.total ? e.loaded / e.total : 0), reject)),
      fetch(url.replace(/yacht\.glb$/, 'yacht-layout.json')).then((r) => r.json()),
    ]);
    this.layout = layout;
    const model = gltf.scene;
    // chrome, glass and glossy gelcoat need something to reflect
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.yachtMats = {};
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.envMap = this.envMap;
        m.envMapIntensity = m.metalness > 0.5 ? 1.0 : 0.55;
        this.yachtMats[m.name] = m;
        if (m.transparent) o.castShadow = false;
      }
    });
    this.yacht.add(model);
    this.yachtModel = model;
    this.deckY = layout.deck;
    this.stage.position.set(...layout.stage);

    // named interactive / animated pieces
    const get = (n) => model.getObjectByName(n);
    this.startPedestal = get('start_pedestal');
    this.startButton = get('start_button');
    this.discoBall = get('disco_ball');
    this.tubWater = get('hot_tub_water');
    this.floats = ['flamingo', 'donut'].map(get).filter(Boolean);
    // floats live on the water, not on the (bobbing) yacht
    model.updateMatrixWorld(true);
    this.floats = this.floats.map((f) => {
      // pivot at the float's centre so it can bob and spin in place
      const c = new THREE.Box3().setFromObject(f).getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(c);
      this.scene.add(pivot);
      pivot.updateMatrixWorld(true);
      pivot.attach(f);
      pivot.userData.base = c.clone();
      pivot.userData.phase = Math.random() * 6;
      f.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      return pivot;
    });
    const dance = this.yachtMats.dance;
    if (dance?.map) {
      for (const t of [dance.map, dance.emissiveMap]) {
        if (!t) continue;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.needsUpdate = true;
      }
    }
    if (this.startButton) {
      this.startButton.material = this.startButton.material.clone();
      this.startButton.userData.baseScale = this.startButton.scale.clone();
    }
    this.buildPartyLights();
    return model;
  }

  buildPartyLights() {
    this.partyLights = [];
    const pl = [['#ff4fb0', 3.5, 2.3, 4.6], ['#3ce6ff', -3.5, 2.3, 4.6], ['#ffd36b', 0, 3.4, -3], ['#ff7eb6', 0, 2.4, -7]];
    for (const [c, x, y, z] of pl) {
      const l = new THREE.PointLight(c, 0, 16, 1.6);
      l.position.set(x, y, z);
      this.stage.add(l);
      this.partyLights.push(l);
    }
    // spotlight for "your turn" moments
    this.spot = new THREE.SpotLight('#fff1d6', 0, 22, 0.42, 0.55, 1.2);
    this.spot.position.set(0, 7, 0);
    this.stage.add(this.spot);
    this.stage.add(this.spot.target);
    this.spotOn = 0;
  }

  /** Point the spotlight at a stage-local position (or null to switch it off). */
  setSpotlight(pos) {
    this.spotTargetOn = pos ? 1 : 0;
    if (pos) {
      this.spot.target.position.copy(pos);
      this.spot.position.set(pos.x + 2.5, 7.5, pos.z + 3.5);
    }
  }

  /** A simple stand-in yacht if the GLB can't be loaded. */
  buildFallbackYacht() {
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(7, 36, 6, 16), new THREE.MeshStandardMaterial({ color: '#f3e3cc', roughness: 0.7 }));
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(1, 1, 0.45);
    hull.position.y = 1;
    this.yacht.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 46), new THREE.MeshStandardMaterial({ color: '#d99a5b' }));
    deck.position.y = 2.8;
    deck.receiveShadow = true;
    this.yacht.add(deck);
    this.deckY = 3.0;
    this.layout = {
      stage: [0, 3, -15], deck: 3,
      spots: {
        start: [0, -2], stools: [[2.4, 3.7, 0.95], [3.6, 3.7, 0.95], [4.8, 3.7, 0.95]], bar_lean: [[5.6, 3.6]],
        sofa: [[5.5, -4.3, -1, 0.6], [5.5, -2.6, -1, 0.6]], dj: [[-3.8, 5.6]], dance: [[-1.2, -3.2], [1.2, -3.4]],
        team: [[[2.9, -5], [4.4, -5], [3.2, -3.9], [4.7, -3.9]], [[-2.9, -5], [-4.4, -5], [-3.2, -3.9], [-4.7, -3.9]]],
        turn: [-2.6, -5.2],
      },
    };
    this.stage.position.set(0, 3, -15);
    this.buildPartyLights();
  }

  setParty(t) { this.partyTarget = THREE.MathUtils.clamp(t, 0, 1); }

  update(dt) {
    this.clock += dt;
    const t = this.clock;
    this.party += (this.partyTarget - this.party) * Math.min(1, dt * 0.8);
    const p = this.party;

    // time of day: afternoon -> golden hour -> party night
    const k = skyAt(p, this.sky_);
    const u = this.skyUniforms;
    u.uTime.value = t;
    u.uParty.value = p;
    this.scene.fog.color.copy(k.horizon);
    const ou = this.oceanUniforms;
    ou.uTime.value = t;
    ou.uGolden.value = Math.max(0, k.golden);
    ou.uNight.value = k.night;
    this.sun.intensity = k.sunI;
    this.sun.color.copy(k.sunCol);
    this.farSun.color.copy(k.sunCol);
    this.farSun.intensity = k.sunI * 0.45;
    this.farSun.position.copy(k.sunDir).multiplyScalar(500);
    this.hemi.intensity = k.hemiI;
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    if (this.cloudMat) this.cloudMat.emissive.set('#fff4ea').lerp(_gold.set('#ffb48a'), Math.max(0, k.golden)).lerp(_night.set('#7a4f9a'), k.night);

    // yacht bobbing
    this.yacht.position.y = Math.sin(t * 0.8) * 0.18;
    this.yacht.rotation.z = Math.sin(t * 0.55) * 0.012;
    this.yacht.rotation.x = Math.sin(t * 0.4 + 1) * 0.006;

    // shadow camera follows the yacht
    if (this.stage) {
      const sp = this.stage.getWorldPosition(_v);
      sp.z += 12;
      this.sun.target.position.copy(sp);
      this.sun.position.copy(sp).addScaledVector(this.sunDir, 80);
    }

    // party yacht lighting: everything glows brighter as the night goes on
    const night = k.night;
    const m = this.yachtMats;
    if (m) {
      const beat = (Math.sin(t * 7.5) + 1) / 2;
      if (m.bulb) m.bulb.emissiveIntensity = 1.2 + night * 3.5 + Math.sin(t * 2.3) * 0.2;
      if (m.led_pink) m.led_pink.emissiveIntensity = 1.6 + night * 4 + beat * night;
      if (m.led_cyan) m.led_cyan.emissiveIntensity = 1.6 + night * 4 + (1 - beat) * night;
      if (m.neon) m.neon.emissiveIntensity = 1.8 + night * 2.2 + (Math.random() < 0.02 ? -1.2 : 0);
      if (m.tub_water) {
        m.tub_water.emissiveIntensity = 0.9 + night * 1.6;
        if (m.tub_water.map) m.tub_water.map.offset.set(Math.sin(t * 0.3) * 0.1, t * 0.03);
      }
      if (m.dance) {
        m.dance.emissiveIntensity = 1.1 + night * 1.6 + beat * 0.5;
        this.danceT = (this.danceT || 0) + dt;
        if (this.danceT > 0.47) {
          this.danceT = 0;
          this.danceStep = ((this.danceStep || 0) + 1) % 6;
          if (m.dance.map) m.dance.map.offset.set(this.danceStep / 6, (this.danceStep % 2) / 6);
        }
      }
      if (m.screen) m.screen.emissiveIntensity = 1 + beat * 0.6;
    }
    if (this.discoBall) this.discoBall.rotation.y += dt * 0.9;
    if (this.startButton) {
      const pulse = (Math.sin(t * 4) + 1) / 2;
      this.startButton.material.emissiveIntensity = 1.2 + pulse * 1.6 + (this.startHover ? 2 : 0);
      const s = 1 + (this.startHover ? 0.12 : 0) + pulse * 0.04;
      this.startButton.scale.copy(this.startButton.userData.baseScale).multiplyScalar(s);
    }
    for (const f of this.floats || []) {
      const d = f.userData;
      f.position.set(d.base.x + Math.sin(t * 0.12 + d.phase) * 2.5, d.base.y + Math.sin(t * 1.3 + d.phase) * 0.15, d.base.z + Math.cos(t * 0.1 + d.phase) * 2);
      f.rotation.y = Math.sin(t * 0.15 + d.phase) * 1.2;
      f.rotation.z = Math.sin(t * 1.1 + d.phase) * 0.05;
    }
    if (this.partyLights) {
      this.partyLights.forEach((l, i) => { l.intensity = (0.15 + night * 0.85) * (16 + Math.sin(t * 2 + i * 2) * 5); });
      this.spotOn += ((this.spotTargetOn || 0) - this.spotOn) * Math.min(1, dt * 4);
      this.spot.intensity = this.spotOn * (60 + night * 60);
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
const _gold = new THREE.Color();
const _night = new THREE.Color();

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
