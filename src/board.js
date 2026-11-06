// The physical Jeopardy-style board installed on the yacht + the two team scoreboards.
import * as THREE from 'three';
import { roundRect } from './characters.js';
import { POINTS } from './data.js';

const FONT = '"Lilita One", "Fredoka", sans-serif';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function fitText(g, text, maxW, size) {
  let s = size;
  g.font = `${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > 10) {
    s -= 2;
    g.font = `${s}px ${FONT}`;
  }
  return s;
}

function wrapLines(g, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (g.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function tileTexture(points) {
  return canvasTex(256, 144, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2f6fe0');
    grad.addColorStop(1, '#1d47a8');
    g.fillStyle = grad;
    roundRect(g, 4, 4, w - 8, h - 8, 22);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(g, 14, 10, w - 28, h * 0.38, 16);
    g.fill();
    g.font = `84px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#0e2a66';
    g.fillText(points, w / 2 + 3, h / 2 + 8);
    g.fillStyle = '#ffd34d';
    g.fillText(points, w / 2, h / 2 + 3);
  });
}

function headerTexture(cat) {
  return canvasTex(256, 176, (g, w, h) => {
    g.fillStyle = cat.color;
    roundRect(g, 4, 4, w - 8, h - 8, 24);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(g, 14, 10, w - 28, h * 0.32, 16);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.fillText(cat.icon || '⭐', w / 2, 52);
    g.font = `40px ${FONT}`;
    const lines = wrapLines(g, cat.name.toUpperCase(), w - 30);
    const size = lines.length > 2 ? 28 : lines.length === 2 ? 34 : fitText(g, lines[0], w - 30, 40);
    g.font = `${size}px ${FONT}`;
    const ls = lines.length > 2 ? lines.slice(0, 3) : lines;
    ls.forEach((l, i) => {
      const y = 122 + (i - (ls.length - 1) / 2) * (size + 2);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillText(l, w / 2 + 2, y + 3);
      g.fillStyle = '#fff';
      g.fillText(l, w / 2, y);
    });
  });
}

export class Board {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'board';
    this.tiles = []; // [c][r]
    this.headers = [];
    this.bulbs = [];
    this.sparkles = [];
    this.hovered = null;
    this.selected = null;
    this.time = 0;
    this.W = 8.6;
    this.H = 5.7;
    this.build();
  }

  build() {
    const g = this.group;
    const { W, H } = this;
    const navy = new THREE.MeshStandardMaterial({ color: '#23305e', roughness: 0.55 });
    const cream = new THREE.MeshStandardMaterial({ color: '#f6e7cf', roughness: 0.6 });
    const wood = new THREE.MeshStandardMaterial({ color: '#c08550', roughness: 0.75 });
    const baseY = 2.2;
    this.baseY = baseY;

    // legs
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, baseY + 0.4, 0.5), wood);
      leg.position.set((W / 2 - 0.6) * s, (baseY + 0.4) / 2, 0);
      leg.castShadow = true;
      g.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 1.4), wood);
      foot.position.set((W / 2 - 0.6) * s, 0.09, 0);
      g.add(foot);
    }
    // frame
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, H + 0.5, 0.45), cream);
    frame.position.set(0, baseY + H / 2, -0.12);
    frame.castShadow = true;
    frame.receiveShadow = true;
    g.add(frame);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.4), navy);
    panel.position.set(0, baseY + H / 2, 0);
    g.add(panel);
    this.panel = panel;

    // marquee title
    const titleTex = canvasTex(1024, 220, (c, w, h) => {
      c.fillStyle = '#ff6b4a';
      roundRect(c, 8, 8, w - 16, h - 16, 70);
      c.fill();
      c.lineWidth = 12;
      c.strokeStyle = '#fff4e0';
      c.stroke();
      c.font = `120px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#9b2c1c';
      c.fillText('YACHT TRIVIA', w / 2 + 5, h / 2 + 12);
      c.fillStyle = '#fff4e0';
      c.fillText('YACHT TRIVIA', w / 2, h / 2 + 5);
    });
    const title = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.95), new THREE.MeshStandardMaterial({ map: titleTex, transparent: true, roughness: 0.5 }));
    title.position.set(0, baseY + H + 0.62, 0.15);
    g.add(title);
    this.title = title;

    // bulbs around the frame
    const bulbGeo = new THREE.SphereGeometry(0.08, 8, 6);
    const per = 2 * (W + H);
    const n = 64;
    for (let i = 0; i < n; i++) {
      let d = (i / n) * per;
      let x;
      let y;
      if (d < W) { x = -W / 2 + d; y = H / 2 + 0.13; } else if ((d -= W) < H) { x = W / 2 + 0.13; y = H / 2 - d; } else if ((d -= H) < W) { x = W / 2 - d; y = -H / 2 - 0.13; } else { d -= W; x = -W / 2 - 0.13; y = -H / 2 + d; }
      const m = new THREE.MeshStandardMaterial({ color: '#ffe7a3', emissive: '#ffcf5a', emissiveIntensity: 1 });
      const b = new THREE.Mesh(bulbGeo, m);
      b.position.set(x, baseY + H / 2 + y, 0.22);
      g.add(b);
      this.bulbs.push(b);
    }

    // grid
    const cols = 5;
    const rows = 6; // header + 5
    const pad = 0.12;
    const cw = (W - pad * (cols + 1)) / cols;
    const ch = (H - pad * (rows + 1)) / rows;
    this.cellW = cw;
    this.cellH = ch;
    const tileGeo = new THREE.BoxGeometry(cw, ch, 0.16);
    const side = new THREE.MeshStandardMaterial({ color: '#173a8a', roughness: 0.5 });
    for (let c = 0; c < cols; c++) {
      const x = -W / 2 + pad + cw / 2 + c * (cw + pad);
      const header = new THREE.Mesh(tileGeo, [side, side, side, side, new THREE.MeshStandardMaterial({ roughness: 0.5 }), side]);
      header.position.set(x, baseY + H - pad - ch / 2, 0.25);
      g.add(header);
      this.headers.push(header);
      this.tiles.push([]);
      for (let r = 0; r < 5; r++) {
        const y = baseY + H - pad - ch / 2 - (r + 1) * (ch + pad);
        const front = new THREE.MeshStandardMaterial({ map: tileTexture(POINTS[r]), roughness: 0.45, emissive: '#ffd34d', emissiveIntensity: 0 });
        const tile = new THREE.Mesh(tileGeo, [side, side, side, side, front, side]);
        tile.position.set(x, y, 0.25);
        tile.castShadow = true;
        tile.userData = { c, r, front, base: tile.position.clone(), used: false, scale: 1, targetScale: 1, pop: 0 };
        g.add(tile);
        this.tiles[c].push(tile);
      }
    }
  }

  setCategories(categories) {
    categories.forEach((cat, i) => {
      const m = this.headers[i].material[4];
      m.map?.dispose();
      m.map = headerTexture(cat);
      m.needsUpdate = true;
    });
  }

  setUsed(usedMap, instant = false) {
    for (const col of this.tiles) {
      for (const t of col) {
        const used = !!usedMap[`${t.userData.c}-${t.userData.r}`];
        t.userData.used = used;
        t.userData.targetScale = used ? 0 : 1;
        if (instant) {
          t.userData.scale = t.userData.targetScale;
          t.scale.setScalar(Math.max(0.0001, t.userData.scale));
          t.visible = !used;
        } else if (!used) t.visible = true;
      }
    }
  }

  setDouble(key) {
    this.doubleKey = key;
    for (const s of this.sparkles) this.group.remove(s);
    this.sparkles = [];
    if (!key) return;
    const [c, r] = key.split('-').map(Number);
    const tile = this.tiles[c]?.[r];
    if (!tile) return;
    const tex = canvasTex(64, 64, (g) => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.25, 'rgba(255,240,170,0.9)');
      grd.addColorStop(1, 'rgba(255,220,120,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(32, 0); g.lineTo(38, 26); g.lineTo(64, 32); g.lineTo(38, 38); g.lineTo(32, 64); g.lineTo(26, 38); g.lineTo(0, 32); g.lineTo(26, 26);
      g.closePath();
      g.fill();
    });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.userData = { tile, phase: i * 1.7 };
      this.group.add(s);
      this.sparkles.push(s);
    }
  }

  tileMeshes() {
    return this.tiles.flat().filter((t) => !t.userData.used && t.visible);
  }

  hover(tile) {
    this.hovered = tile;
  }

  select(tile) {
    this.selected = tile;
  }

  clearSelection() {
    this.selected = null;
  }

  update(dt, party = 0) {
    this.time += dt;
    const t = this.time;
    this.bulbs.forEach((b, i) => {
      const chase = (Math.sin(t * 5 - i * 0.6) + 1) / 2;
      b.material.emissiveIntensity = 0.4 + chase * (1.2 + party * 1.5);
    });
    for (const col of this.tiles) {
      for (const tile of col) {
        const u = tile.userData;
        u.scale += (u.targetScale - u.scale) * Math.min(1, dt * 7);
        if (u.targetScale === 0 && u.scale < 0.02) tile.visible = false;
        const isHover = this.hovered === tile && !this.selected;
        const isSel = this.selected === tile;
        u.pop += ((isHover || isSel ? 1 : 0) - u.pop) * Math.min(1, dt * 10);
        const pulse = isSel ? 1 + Math.sin(t * 14) * 0.04 : 1;
        tile.scale.setScalar(Math.max(0.0001, u.scale * (1 + u.pop * 0.08) * pulse));
        tile.position.z = u.base.z + u.pop * 0.25;
        u.front.emissiveIntensity = isSel ? 0.55 + Math.sin(t * 14) * 0.2 : isHover ? 0.18 : 0;
        const dim = this.selected && !isSel ? 0.35 : 1;
        u.front.color.setScalar(u.front.color.r + (dim - u.front.color.r) * Math.min(1, dt * 6));
      }
    }
    for (const s of this.sparkles) {
      const { tile, phase } = s.userData;
      if (!tile.visible || tile.userData.used) { s.visible = false; continue; }
      s.visible = true;
      const a = t * 1.6 + phase;
      s.position.set(tile.position.x + Math.cos(a) * this.cellW * 0.45, tile.position.y + Math.sin(a * 1.3) * this.cellH * 0.45, tile.position.z + 0.15);
      const k = (Math.sin(t * 6 + phase * 3) + 1) / 2;
      s.scale.setScalar(0.12 + k * 0.28);
      s.material.opacity = 0.3 + k * 0.7;
    }
  }
}

// ---------------- Scoreboards ----------------
export class Scoreboard {
  constructor(side) {
    this.side = side;
    this.group = new THREE.Group();
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 400;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const w = 3.0;
    const h = (w * 400) / 640;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false }));
    sign.position.y = 0;
    this.sign = sign;
    this.signHolder = new THREE.Group();
    this.signHolder.add(sign);
    const back = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, h * 0.92, 0.12), new THREE.MeshStandardMaterial({ color: '#23305e' }));
    back.position.z = -0.08;
    this.signHolder.add(back);
    this.group.add(this.signHolder);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1, 8), new THREE.MeshStandardMaterial({ color: '#c08550' }));
    pole.castShadow = true;
    this.pole = pole;
    this.signH = h;
    this.group.add(pole);
    this.setPole(3.3 + h / 2);
    this.score = 0;
    this.displayScore = 0;
    this.bump = 0;
    this.name = '';
    this.color = '#ff7a45';
    this.stickers = [];
    this.active = false;
    this.time = 0;
  }

  /** Stretch the pole from the sign down to the deck (height = sign centre above deck). */
  setPole(height) {
    const len = Math.max(0.1, height - this.signH / 2);
    this.pole.scale.y = len;
    this.pole.position.set(0, -this.signH / 2 - len / 2, -0.12);
  }

  async setTeam(name, color, stickerUrls) {
    this.name = name;
    this.color = color;
    this.stickers = await Promise.all(
      stickerUrls.map((u) => new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = u;
      })),
    );
    this.draw();
  }

  setScore(v, instant = false) {
    if (v !== this.score) this.bump = 1;
    this.score = v;
    if (instant) this.displayScore = v;
    this.draw();
  }

  setActive(a) {
    this.active = a;
    this.draw();
  }

  draw() {
    const g = this.canvas.getContext('2d');
    const w = this.canvas.width;
    const h = this.canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = this.color;
    roundRect(g, 6, 6, w - 12, h - 12, 46);
    g.fill();
    g.lineWidth = this.active ? 16 : 10;
    g.strokeStyle = this.active ? '#ffe066' : '#fff4e0';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(g, 24, 20, w - 48, 90, 30);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const s = fitText(g, this.name, w - 80, 64);
    g.font = `${s}px ${FONT}`;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillText(this.name, w / 2 + 3, 68);
    g.fillStyle = '#fff';
    g.fillText(this.name, w / 2, 64);
    const scoreTxt = Math.round(this.displayScore).toLocaleString();
    g.font = `150px ${FONT}`;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillText(scoreTxt, w / 2 + 5, 200);
    g.fillStyle = this.displayScore < 0 ? '#ffd0d0' : '#fffbe8';
    g.fillText(scoreTxt, w / 2, 194);
    const n = this.stickers.length;
    const size = 74;
    const gap = 12;
    const total = n * size + (n - 1) * gap;
    this.stickers.forEach((img, i) => {
      if (!img) return;
      const x = w / 2 - total / 2 + i * (size + gap);
      g.save();
      g.beginPath();
      g.arc(x + size / 2, 322 + size / 2 - 30, size / 2, 0, Math.PI * 2);
      g.clip();
      g.drawImage(img, x, 322 - 30, size, size);
      g.restore();
    });
    this.tex.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    if (Math.abs(this.displayScore - this.score) > 0.5) {
      this.displayScore += (this.score - this.displayScore) * Math.min(1, dt * 6);
      if (Math.abs(this.displayScore - this.score) < 1) this.displayScore = this.score;
      this.draw();
    }
    this.bump = Math.max(0, this.bump - dt * 2);
    const sc = 1 + Math.sin(this.bump * Math.PI) * 0.18;
    this.signHolder.scale.setScalar(sc);
    this.signHolder.position.y = Math.sin(this.time * 1.4 + (this.side ? 1.5 : 0)) * 0.06;
    this.signHolder.rotation.z = Math.sin(this.time * 1.1 + (this.side ? 2 : 0)) * 0.02 + Math.sin(this.bump * 12) * this.bump * 0.08;
  }
}
