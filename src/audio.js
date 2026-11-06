// Tiny synthesized sound kit: no audio files needed.
let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let musicTimer = null;
let enabled = { sound: true, music: true };

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.6;
  sfxGain.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.0;
  musicGain.connect(master);
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
  musicGain.gain.setTargetAtTime(music ? 0.16 : 0, ctx.currentTime, 0.3);
}

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
}

function noise(start, dur, { vol = 0.2, freq = 1200, q = 0.8, type = 'bandpass' } = {}) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(sfxGain);
  src.start(start);
}

const SFX = {
  click(t) { tone(880, t, 0.08, { type: 'triangle', vol: 0.25 }); },
  pop(t) { tone(520, t, 0.12, { type: 'sine', vol: 0.35, slide: 500 }); },
  hover(t) { tone(1200, t, 0.05, { type: 'sine', vol: 0.08 }); },
  whoosh(t) { noise(t, 0.6, { vol: 0.5, freq: 600, q: 0.6 }); },
  splash(t) { noise(t, 0.9, { vol: 0.6, freq: 900, q: 0.4, type: 'lowpass' }); },
  drumroll(t) {
    for (let i = 0; i < 28; i++) noise(t + i * 0.055, 0.06, { vol: 0.25 + i * 0.01, freq: 300, q: 1.5 });
    noise(t + 1.6, 0.5, { vol: 0.6, freq: 2500, q: 0.3 });
    tone(130, t + 1.6, 0.4, { type: 'sine', vol: 0.5, slide: -60 });
  },
  correct(t) {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.35, { type: 'triangle', vol: 0.3 }));
  },
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
};

export function sfx(name) {
  if (!enabled.sound) return;
  const c = ensure();
  if (!c || !SFX[name]) return;
  SFX[name](c.currentTime + 0.01);
}

// Gentle tropical loop: marimba-ish arpeggios over soft bass.
const CHORDS = [
  [261.6, 329.6, 392.0, 493.9], // Cmaj7
  [220.0, 261.6, 329.6, 392.0], // Am7
  [174.6, 220.0, 261.6, 329.6], // Fmaj7
  [196.0, 246.9, 293.7, 349.2], // G7
];

export function startMusic() {
  const c = ensure();
  if (!c || musicTimer) return;
  musicGain.gain.setTargetAtTime(enabled.music ? 0.16 : 0, c.currentTime, 0.5);
  let bar = 0;
  const beat = 0.3;
  const playBar = () => {
    const t0 = c.currentTime + 0.05;
    const ch = CHORDS[bar % CHORDS.length];
    tone(ch[0] / 2, t0, beat * 3.5, { type: 'sine', vol: 0.5, out: musicGain, attack: 0.03 });
    tone(ch[0] / 2, t0 + beat * 4, beat * 3.5, { type: 'sine', vol: 0.4, out: musicGain, attack: 0.03 });
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
    pattern.forEach((p, i) => {
      if ((i === 5 || i === 7) && Math.random() < 0.4) return;
      tone(ch[p] * 2, t0 + i * beat, 0.28, { type: 'triangle', vol: 0.22, out: musicGain, attack: 0.005 });
    });
    if (bar % 2 === 1) tone(ch[3] * 4, t0 + beat * 6.5, 0.4, { type: 'sine', vol: 0.06, out: musicGain });
    bar++;
  };
  playBar();
  musicTimer = setInterval(playBar, beat * 8 * 1000);
}
