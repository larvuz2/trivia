// Confetti, splashes and the reusable category cinematic props.
import * as THREE from 'three';
import { roundRect } from './characters.js';

const CONFETTI_COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#f78c6b', '#c77dff', '#ff8fab', '#ffffff'];

export class Confetti {
  constructor(scene, max = 900) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(0.16, 0.26);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.parts = [];
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      this.parts.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 });
      c.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
      this.mesh.setColorAt(i, c);
    }
    this.cursor = 0;
    this.dummy = new THREE.Object3D();
    this.hideAll();
    scene.add(this.mesh);
  }

  hideAll() {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  burst(pos, count = 200, { spread = 4, up = 9, radius = 0.5 } = {}) {
    for (let k = 0; k < count; k++) {
      const p = this.parts[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      p.alive = true;
      p.life = 3.5 + Math.random() * 2;
      p.p.set(pos.x + (Math.random() - 0.5) * radius, pos.y, pos.z + (Math.random() - 0.5) * radius);
      p.v.set((Math.random() - 0.5) * spread, up * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * spread);
      p.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    }
  }

  rain(center, width = 16, count = 300) {
    for (let k = 0; k < count; k++) {
      const p = this.parts[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      p.alive = true;
      p.life = 5 + Math.random() * 3;
      p.p.set(center.x + (Math.random() - 0.5) * width, center.y + 8 + Math.random() * 6, center.z + (Math.random() - 0.5) * width * 0.6);
      p.v.set((Math.random() - 0.5) * 1, -1 - Math.random(), (Math.random() - 0.5) * 1);
      p.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.w.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    }
  }

  update(dt) {
    const d = this.dummy;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.parts[i];
      if (!p.alive) continue;
      any = true;
      p.life -= dt;
      p.v.y -= 9 * dt;
      p.v.multiplyScalar(1 - Math.min(1, dt * 2.2));
      if (p.v.y < -2.2) p.v.y = -2.2;
      p.p.addScaledVector(p.v, dt);
      p.p.x += Math.sin(p.life * 3 + i) * dt * 0.6;
      p.r.x += p.w.x * dt;
      p.r.y += p.w.y * dt;
      p.r.z += p.w.z * dt;
      d.position.copy(p.p);
      d.rotation.copy(p.r);
      d.scale.setScalar(p.life > 0 ? Math.min(1, p.life) : 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      if (p.life <= 0) p.alive = false;
    }
    if (any || this.wasAny) this.mesh.instanceMatrix.needsUpdate = true;
    this.wasAny = any;
  }
}

export class Splash {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.SphereGeometry(0.18, 6, 5);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#e9fffb', roughness: 0.3 }), 200);
    this.mesh.frustumCulled = false;
    this.parts = Array.from({ length: 200 }, () => ({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
    this.d = new THREE.Object3D();
    this.d.scale.setScalar(0);
    this.d.updateMatrix();
    for (let i = 0; i < 200; i++) this.mesh.setMatrixAt(i, this.d.matrix);
    scene.add(this.mesh);
  }

  burst(pos, n = 120) {
    let k = 0;
    for (const p of this.parts) {
      if (k >= n) break;
      if (p.alive) continue;
      p.alive = true;
      p.life = 1.2 + Math.random() * 0.6;
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 5;
      p.p.copy(pos);
      p.v.set(Math.cos(a) * s, 6 + Math.random() * 8, Math.sin(a) * s);
      k++;
    }
  }

  update(dt) {
    const d = this.d;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (!p.alive) continue;
      p.life -= dt;
      p.v.y -= 18 * dt;
      p.p.addScaledVector(p.v, dt);
      d.position.copy(p.p);
      d.scale.setScalar(p.life > 0 ? Math.min(1, p.life * 1.5) * (1 + Math.random() * 0.2) : 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      if (p.life <= 0) p.alive = false;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- Category cinematic props ----------------
function glowSprite(color = '#fff2b0') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, color);
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
}

const easeOutBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Builds a short-lived prop; returns { group, update(t) -> boolean alive } */
export function makeCategoryProp(kind, color = '#ff5a7a') {
  const group = new THREE.Group();
  let update = () => true;

  if (kind === 'album') {
    const coverMat = new THREE.MeshStandardMaterial({ color: '#c0563f', roughness: 0.6 });
    const pageMat = new THREE.MeshStandardMaterial({ color: '#fff7e6', roughness: 0.9 });
    const book = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.2), coverMat);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.1), pageMat);
    pages.position.y = 0.09;
    const hinge = new THREE.Group();
    hinge.position.set(-0.8, 0.18, 0);
    const front = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.2), coverMat);
    front.position.x = 0.8;
    hinge.add(front);
    // photos on the right page
    const photoCols = ['#4cc9f0', '#ffd166', '#06d6a0', '#ff8fab'];
    photoCols.forEach((c, i) => {
      const ph = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 0.38), new THREE.MeshStandardMaterial({ color: c }));
      ph.position.set(-0.35 + (i % 2) * 0.7, 0.16, -0.22 + Math.floor(i / 2) * 0.46);
      ph.rotation.y = (Math.random() - 0.5) * 0.3;
      book.add(ph);
    });
    book.add(back, pages, hinge);
    book.rotation.x = -1.0;
    group.add(book);
    update = (t) => {
      const drop = Math.min(1, t / 0.6);
      book.position.y = 4 * (1 - easeOutBack(drop));
      book.rotation.z = (1 - drop) * 0.8;
      const open = Math.min(1, Math.max(0, (t - 0.7) / 0.6));
      hinge.rotation.z = open * Math.PI * 0.98;
      group.rotation.y = Math.sin(t * 1.5) * 0.15;
      return t < 3.2;
    };
  } else if (kind === 'chest') {
    const wood = new THREE.MeshStandardMaterial({ color: '#9a5b2e', roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.6, roughness: 0.3, emissive: '#a07000', emissiveIntensity: 0.3 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.1), wood);
    base.position.y = 0.5;
    const band1 = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 1.15), gold);
    band1.position.y = 0.8;
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 1.0, -0.55);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.8, 16, 1, false, 0, Math.PI), wood);
    lid.rotation.z = Math.PI / 2;
    lid.rotation.y = Math.PI / 2;
    lid.position.z = 0.55;
    lidPivot.add(lid);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.08), gold);
    lock.position.set(0, 0.8, 0.58);
    const coins = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12), gold);
      coin.position.set((Math.random() - 0.5) * 1.2, 1.0, (Math.random() - 0.5) * 0.6);
      coin.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.2) * 2);
      coins.add(coin);
    }
    coins.visible = false;
    const glow = glowSprite('#fff0a0');
    glow.position.y = 1.4;
    glow.scale.setScalar(0);
    group.add(base, band1, lidPivot, lock, coins, glow);
    update = (t, dt) => {
      const s = easeOutBack(Math.min(1, t / 0.5));
      group.scale.setScalar(Math.max(0.001, s));
      const shake = t > 0.5 && t < 1.1 ? Math.sin(t * 60) * 0.05 : 0;
      group.rotation.z = shake;
      const open = Math.min(1, Math.max(0, (t - 1.1) / 0.4));
      lidPivot.rotation.x = -open * 1.9;
      glow.scale.setScalar(open * 4);
      if (open > 0) {
        coins.visible = true;
        coins.children.forEach((c) => {
          c.userData.v.y -= 9 * dt;
          c.position.addScaledVector(c.userData.v, dt);
          c.rotation.x += dt * 8;
        });
      }
      return t < 3.2;
    };
  } else if (kind === 'heart') {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.9);
    shape.bezierCurveTo(-1.6, 0.1, -1.0, 1.3, 0, 0.55);
    shape.bezierCurveTo(1.0, 1.3, 1.6, 0.1, 0, -0.9);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 4 });
    geo.center();
    const heart = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: color, emissiveIntensity: 0.25 }));
    group.add(heart);
    const glow = glowSprite('#ffb3c7');
    glow.scale.setScalar(4);
    glow.position.z = -0.3;
    group.add(glow);
    update = (t) => {
      const s = easeOutBack(Math.min(1, t / 0.6));
      const beat = 1 + Math.max(0, Math.sin(t * 9)) * 0.12 * Math.min(1, t);
      heart.scale.setScalar(Math.max(0.001, s * beat));
      heart.rotation.y = (1 - Math.min(1, t / 1.2)) * Math.PI * 4;
      group.position.y = Math.sin(t * 2) * 0.1;
      return t < 3.2;
    };
  } else if (kind === 'wheel') {
    const segs = 8;
    const cols = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#c77dff', '#ff9f43', '#ff8fab', '#7bdff2'];
    const wheel = new THREE.Group();
    for (let i = 0; i < segs; i++) {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, 0.2, 16, 1, false, (i / segs) * Math.PI * 2, (Math.PI * 2) / segs),
        new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.5 }),
      );
      seg.rotation.x = Math.PI / 2;
      wheel.add(seg);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.35, 16), new THREE.MeshStandardMaterial({ color: '#fff4e0' }));
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.08, 8, 40), new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 0.5, roughness: 0.3 }));
    wheel.add(rim);
    const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 3), new THREE.MeshStandardMaterial({ color: '#23305e' }));
    pointer.position.y = 1.65;
    pointer.rotation.z = Math.PI;
    group.add(wheel, pointer);
    let speed = 28;
    update = (t, dt) => {
      const s = easeOutBack(Math.min(1, t / 0.5));
      group.scale.setScalar(Math.max(0.001, s));
      speed *= Math.pow(0.35, dt);
      wheel.rotation.z += speed * dt;
      pointer.rotation.z = Math.PI + Math.sin(wheel.rotation.z * 4) * 0.25 * Math.min(1, speed / 5);
      return t < 3.2;
    };
  } else {
    // 'dive' handled mostly by the camera; a ring ripple marks the spot
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    update = (t) => {
      ring.scale.setScalar(1 + t * 4);
      ring.material.opacity = Math.max(0, 1 - t / 2);
      return t < 2.5;
    };
  }
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, update };
}
