// Synthesized sound kit + an adaptive, FMOD-style music system (no audio files).
//
// Music: a beat-synced step sequencer with layers (pad, arp, bass, kick, hat, clap, shaker).
// Each "state" sets target volumes per layer + a master low-pass filter; switching states
// crossfades layers in time with the beat. Stingers (risers, impacts, airhorn, crowd cheers)
// are one-shots layered on top.
let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let musicFilter = null;
let enabled = { sound: true, music: true };

const LAYERS = ['pad', 'arp', 'bass', 'kick', 'hat', 'clap', 'shaker'];
const layerGain = {};

const STATES = {
  menu: { pad: 0.7, arp: 0.65, bass: 0, kick: 0, hat: 0, clap: 0, shaker: 0.25, cutoff: 5200 },
  cinematic: { pad: 0.9, arp: 0.35, bass: 0.25, kick: 0, hat: 0.3, clap: 0, shaker: 0.3, cutoff: 1400 },
  party: { pad: 0.55, arp: 0.6, bass: 0.9, kick: 1, hat: 0.8, clap: 0.7, shaker: 0.5, cutoff: 9000 },
  duck: { pad: 0.6, arp: 0.4, bass: 0.8, kick: 0.9, hat: 0.3, clap: 0.3, shaker: 0.2, cutoff: 700 },
  game: { pad: 0.6, arp: 0.6, bass: 0.55, kick: 0.45, hat: 0.4, clap: 0.2, shaker: 0.4, cutoff: 6000 },
  question: { pad: 0.7, arp: 0.25, bass: 0.35, kick: 0, hat: 0.35, clap: 0, shaker: 0.3, cutoff: 2600 },
  silence: { pad: 0, arp: 0, bass: 0, kick: 0, hat: 0, clap: 0, shaker: 0, cutoff: 9000 },
};
let musicState = 'menu';

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.6;
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicFilter = ctx.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 5200;
  musicFilter.Q.value = 0.8;
  musicFilter.connect(musicGain).connect(master);
  for (const l of LAYERS) {
    layerGain[l] = ctx.createGain();
    layerGain[l].gain.value = STATES.menu[l] || 0;
    layerGain[l].connect(musicFilter);
  }
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function setAudioEnabled({ sound, music }) {
  enabled.sound = sound;
  enabled.music = music;
  if (!ctx) return;
  musicGain.gain.setTargetAtTime(music ? 0.32 : 0, ctx.currentTime, 0.3);
}

// ------------------------------------------------------------------ voices
function tone(freq, start, dur, { type = 'sine', vol = 0.3, slide = 0, out = sfxGain, attack = 0.01 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + dur + 0.05);
  return o;
}

let noiseBuf = null;
function noiseBuffer() {
  if (noiseBuf) return noiseBuf;
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function noise(start, dur, { vol = 0.2, freq = 1200, q = 0.8, type = 'bandpass', out = sfxGain, attack = 0.005, sweepTo = null } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer();
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, start);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, start + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(out);
  src.start(start, Math.random());
  src.stop(start + dur + 0.05);
}

// ------------------------------------------------------------------ sfx & stingers
const SFX = {
  click(t) { tone(880, t, 0.08, { type: 'triangle', vol: 0.25 }); },
  pop(t) { tone(520, t, 0.12, { type: 'sine', vol: 0.35, slide: 500 }); },
  hover(t) { tone(1200, t, 0.05, { type: 'sine', vol: 0.08 }); },
  whoosh(t) { noise(t, 0.7, { vol: 0.45, freq: 300, q: 0.7, sweepTo: 3000, attack: 0.25 }); },
  swoosh(t) { noise(t, 0.5, { vol: 0.35, freq: 2500, q: 0.8, sweepTo: 400, attack: 0.05 }); },
  splash(t) { noise(t, 0.9, { vol: 0.6, freq: 900, q: 0.4, type: 'lowpass' }); },
  drumroll(t) {
    for (let i = 0; i < 28; i++) noise(t + i * 0.055, 0.06, { vol: 0.25 + i * 0.01, freq: 300, q: 1.5 });
    noise(t + 1.6, 0.5, { vol: 0.6, freq: 2500, q: 0.3 });
    tone(130, t + 1.6, 0.4, { type: 'sine', vol: 0.5, slide: -60 });
  },
  correct(t) { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.35, { type: 'triangle', vol: 0.3 })); },
  wrong(t) {
    tone(220, t, 0.35, { type: 'sawtooth', vol: 0.15, slide: -60 });
    tone(165, t + 0.3, 0.5, { type: 'sawtooth', vol: 0.15, slide: -50 });
  },
  tick(t) { tone(1500, t, 0.03, { type: 'square', vol: 0.06 }); },
  timesup(t) { [880, 660, 440].forEach((f, i) => tone(f, t + i * 0.18, 0.25, { type: 'square', vol: 0.12 })); },
  sparkle(t) { [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, t + i * 0.06, 0.3, { vol: 0.12 })); },
  fanfare(t) {
    const n = [392, 523, 659, 784, 659, 784, 1047];
    n.forEach((f, i) => tone(f, t + i * 0.13, i === n.length - 1 ? 0.9 : 0.2, { type: 'triangle', vol: 0.3 }));
    n.forEach((f, i) => tone(f / 2, t + i * 0.13, 0.2, { type: 'sine', vol: 0.15 }));
  },
  boing(t) { tone(200, t, 0.35, { type: 'sine', vol: 0.4, slide: 400 }); },
  thud(t) { tone(90, t, 0.25, { type: 'sine', vol: 0.5, slide: -40 }); noise(t, 0.15, { vol: 0.2, freq: 200 }); },
  chest(t) { tone(150, t, 0.3, { type: 'square', vol: 0.08, slide: 50 }); SFX.sparkle(t + 0.25); },
  wheel(t) { for (let i = 0; i < 18; i++) tone(1000, t + i * 0.05 * (1 + i * 0.06), 0.03, { type: 'square', vol: 0.06 }); },
  heart(t) { tone(330, t, 0.15, { vol: 0.3 }); tone(330, t + 0.22, 0.2, { vol: 0.3 }); SFX.sparkle(t + 0.4); },
  page(t) { noise(t, 0.25, { vol: 0.3, freq: 3000, q: 0.5 }); },
  double(t) { SFX.fanfare(t); SFX.sparkle(t + 0.8); },
  // --- cinematic / intro stingers ---
  riser(t) {
    noise(t, 2.0, { vol: 0.35, freq: 250, q: 1.2, sweepTo: 7000, attack: 1.8 });
    tone(110, t, 2.0, { type: 'sawtooth', vol: 0.06, slide: 770, attack: 1.8 });
  },
  impact(t) {
    tone(95, t, 1.4, { type: 'sine', vol: 0.9, slide: -55 });
    tone(48, t, 1.8, { type: 'sine', vol: 0.6 });
    noise(t, 1.6, { vol: 0.5, freq: 5000, q: 0.3, type: 'highpass' });
    noise(t, 0.4, { vol: 0.6, freq: 400, q: 0.6 });
  },
  airhorn(t) {
    const burst = (s, d) => [440, 554, 659].forEach((f) => tone(f, s, d, { type: 'sawtooth', vol: 0.09, slide: -18, attack: 0.02 }));
    burst(t, 0.18);
    burst(t + 0.22, 0.18);
    burst(t + 0.44, 0.7);
  },
  cheer(t) {
    // crowd: many filtered-noise voices swelling + "woo!" glides + applause
    for (let i = 0; i < 22; i++) {
      const s = t + Math.random() * 0.4;
      noise(s, 1.6 + Math.random() * 1.2, { vol: 0.05 + Math.random() * 0.04, freq: 450 + Math.random() * 1300, q: 4, attack: 0.25 });
    }
    for (let i = 0; i < 6; i++) {
      const s = t + 0.1 + Math.random() * 0.8;
      const f0 = 320 + Math.random() * 260;
      const o = tone(f0, s, 0.7, { type: 'triangle', vol: 0.045, attack: 0.08 });
      o.frequency.linearRampToValueAtTime(f0 * 1.9, s + 0.25);
      o.frequency.linearRampToValueAtTime(f0 * 1.4, s + 0.7);
    }
    for (let i = 0; i < 90; i++) noise(t + 0.15 + Math.random() * 2.4, 0.04, { vol: 0.05 + Math.random() * 0.05, freq: 1800 + Math.random() * 1500, q: 1.5 });
  },
  cannon(t) {
    tone(140, t, 0.25, { type: 'sine', vol: 0.6, slide: -80 });
    noise(t, 0.35, { vol: 0.5, freq: 1800, q: 0.5 });
    SFX.sparkle(t + 0.15);
  },
  door(t) { noise(t, 0.6, { vol: 0.18, freq: 900, q: 2, sweepTo: 500, attack: 0.1 }); tone(80, t + 0.5, 0.15, { vol: 0.2 }); },
  gull(t) {
    [0, 0.28, 0.5].forEach((d) => {
      const o = tone(1500, t + d, 0.22, { type: 'sawtooth', vol: 0.04, attack: 0.02 });
      o.frequency.linearRampToValueAtTime(2100, t + d + 0.06);
      o.frequency.linearRampToValueAtTime(1300, t + d + 0.22);
    });
  },
  clink(t) {
    const f = 2400 + Math.random() * 1600;
    tone(f, t, 0.25, { type: 'sine', vol: 0.12, attack: 0.002 });
    tone(f * 1.52, t, 0.18, { type: 'sine', vol: 0.06, attack: 0.002 });
    noise(t, 0.05, { vol: 0.08, freq: 6000, q: 1 });
  },
  shatter(t) {
    for (let i = 0; i < 9; i++) tone(2000 + Math.random() * 3500, t + Math.random() * 0.12, 0.12 + Math.random() * 0.15, { type: 'sine', vol: 0.07, attack: 0.002 });
    noise(t, 0.35, { vol: 0.25, freq: 5000, q: 0.6, type: 'highpass' });
  },
  knock(t) { tone(150 + Math.random() * 60, t, 0.14, { type: 'triangle', vol: 0.35, slide: -50 }); noise(t, 0.06, { vol: 0.2, freq: 900, q: 1.2 }); },
  clank(t) { tone(520 + Math.random() * 200, t, 0.3, { type: 'square', vol: 0.05, attack: 0.002 }); tone(1300, t, 0.2, { type: 'sine', vol: 0.08 }); noise(t, 0.05, { vol: 0.15, freq: 2500, q: 1 }); },
  plop(t) { tone(260, t, 0.18, { type: 'sine', vol: 0.3, slide: 380 }); noise(t, 0.3, { vol: 0.25, freq: 700, q: 0.5, type: 'lowpass' }); },
  jump(t) { tone(330, t, 0.16, { type: 'sine', vol: 0.18, slide: 300 }); },
  scratch(t) { noise(t, 0.18, { vol: 0.3, freq: 600, q: 3, sweepTo: 2400 }); noise(t + 0.2, 0.15, { vol: 0.3, freq: 2400, q: 3, sweepTo: 500 }); },
};

export function sfx(name) {
  if (!enabled.sound) return;
  const c = ensure();
  if (!c || !SFX[name]) return;
  SFX[name](c.currentTime + 0.01);
}

// ------------------------------------------------------------------ music sequencer
const BPM = 118;
const STEP = 60 / BPM / 4; // 16th note
// tropical house progression: Am - F - C - G
const CHORDS = [
  [220.0, 261.6, 329.6, 392.0],
  [174.6, 220.0, 261.6, 349.2],
  [130.8, 196.0, 261.6, 329.6],
  [196.0, 246.9, 293.7, 392.0],
];
const ARP = [0, 2, 1, 3, 2, 1, 3, 2, 0, 3, 1, 2, 3, 1, 2, 0];
let seq = null;

function scheduleStep(step, t) {
  const bar = Math.floor(step / 16);
  const s = step % 16;
  const ch = CHORDS[bar % 4];
  const L = layerGain;
  if (s === 0) {
    ch.forEach((f) => tone(f, t, STEP * 15.5, { type: 'triangle', vol: 0.07, out: L.pad, attack: 0.35 }));
    ch.forEach((f) => tone(f * 1.003, t, STEP * 15.5, { type: 'sine', vol: 0.05, out: L.pad, attack: 0.5 }));
  }
  // marimba-ish arpeggio (skips a few notes for groove)
  if (!(s === 7 || s === 15) || Math.random() < 0.4) {
    const f = ch[ARP[s] % 4] * 2;
    tone(f, t, 0.22, { type: 'triangle', vol: 0.16, out: L.arp, attack: 0.004 });
    tone(f * 2, t, 0.08, { type: 'sine', vol: 0.04, out: L.arp, attack: 0.002 });
  }
  // offbeat bass
  if (s % 4 === 2) tone(ch[0] / 2, t, STEP * 1.8, { type: 'sawtooth', vol: 0.12, out: L.bass, attack: 0.01 });
  if (s % 4 === 2) tone(ch[0] / 4, t, STEP * 1.8, { type: 'sine', vol: 0.25, out: L.bass, attack: 0.01 });
  // four on the floor
  if (s % 4 === 0) {
    tone(150, t, 0.32, { type: 'sine', vol: 0.9, slide: -105, out: L.kick, attack: 0.002 });
    noise(t, 0.03, { vol: 0.15, freq: 3000, q: 0.5, out: L.kick });
  }
  if (s % 4 === 2) noise(t, 0.06, { vol: 0.22, freq: 9000, q: 0.6, type: 'highpass', out: L.hat });
  else if (s % 2 === 1) noise(t, 0.025, { vol: 0.08, freq: 10000, q: 0.6, type: 'highpass', out: L.hat });
  if (s === 4 || s === 12) noise(t, 0.16, { vol: 0.35, freq: 1500, q: 0.9, out: L.clap });
  if (s % 2 === 0) noise(t + STEP * 0.05, 0.05, { vol: 0.06 + (s % 4 === 0 ? 0 : 0.04), freq: 6000, q: 1, out: L.shaker });
}

export function startMusic() {
  const c = ensure();
  if (!c || seq) return;
  musicGain.gain.setTargetAtTime(enabled.music ? 0.32 : 0, c.currentTime, 0.5);
  seq = { step: 0, next: c.currentTime + 0.1 };
  const pump = () => {
    // fell behind (background tab throttles timers): skip the missed steps instead of firing them all at once
    if (seq.next < c.currentTime - 0.05) {
      const missed = Math.ceil((c.currentTime - seq.next) / STEP);
      seq.next += missed * STEP;
      seq.step += missed;
    }
    while (seq.next < c.currentTime + 0.15) {
      scheduleStep(seq.step, seq.next);
      seq.next += STEP;
      seq.step++;
    }
  };
  pump();
  seq.timer = setInterval(pump, 30);
}

/** Crossfade to a music state ('menu' | 'cinematic' | 'party' | 'duck' | 'game' | 'question' | 'silence'). */
export function setMusicState(name, fade = 1.2) {
  const c = ensure();
  if (!c || !STATES[name]) return;
  musicState = name;
  const st = STATES[name];
  const tc = Math.max(0.05, fade / 3);
  for (const l of LAYERS) layerGain[l].gain.setTargetAtTime(st[l] || 0, c.currentTime, tc);
  musicFilter.frequency.setTargetAtTime(st.cutoff, c.currentTime, tc);
}

export function getMusicState() { return musicState; }

/** Seconds until the next bar line (for landing a "drop" on the beat). */
export function timeToNextBar() {
  if (!ctx || !seq) return 0;
  const stepsLeft = 16 - (seq.step % 16);
  return Math.max(0, seq.next - ctx.currentTime + (stepsLeft - 1) * STEP);
}
