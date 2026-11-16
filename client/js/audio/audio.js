// Процедурный звук (WebAudio): гул, тревога, эффекты
import { rand } from '../core/util.js';
import { settings } from '../core/settings.js';
import { curStyle } from '../render/lighting.js';

/* ============================== Звук ============================== */
export let A = null;
export function initAudio() {
  if (A) { A.ctx.resume(); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain(); master.gain.value = settings.vol;
  const under = ctx.createBiquadFilter(); under.type = 'lowpass'; under.frequency.value = 20000; // «подводный» фильтр
  master.connect(under); under.connect(ctx.destination);
  const hum = ctx.createGain(); hum.gain.value = 0.05;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
  const humOsc = [];
  [['sawtooth', 0.5], ['sine', 0.7], ['triangle', 0.25], ['sine', 0.12]].forEach(([t, gv], i) => {
    const o = ctx.createOscillator(); o.type = t; o.frequency.value = [60, 120, 180, 240][i];
    const og = ctx.createGain(); og.gain.value = gv;
    o.connect(og); og.connect(lp); o.start(); humOsc.push(o);
  });
  lp.connect(hum); hum.connect(master);
  const dread = ctx.createOscillator(); dread.type = 'sawtooth'; dread.frequency.value = 41;
  const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 150;
  const dg = ctx.createGain(); dg.gain.value = 0;
  dread.connect(dlp); dlp.connect(dg); dg.connect(master); dread.start();
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  A = { ctx, master, under, hum, humOsc, dread: dg, nb, amb: null };
  if (curStyle) setAmbience(curStyle);
}
export function setAmbience(st) {
  if (!A) return;
  st.hum.forEach((f, i) => A.humOsc[i].frequency.setTargetAtTime(f, A.ctx.currentTime, 0.3));
  A.amb = st.amb;
}
function noiseBurst(freq, dur, vol, type = 'lowpass') {
  if (!A) return;
  const s = A.ctx.createBufferSource(); s.buffer = A.nb;
  const f = A.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = A.ctx.createGain(); const t = A.ctx.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(A.master); s.start(t); s.stop(t + dur + 0.05);
}
export function tone(freq, dur, vol, type = 'sine', slideTo = null, delay = 0) {
  if (!A) return;
  const o = A.ctx.createOscillator(); o.type = type;
  const g = A.ctx.createGain(); const t = A.ctx.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + 0.05);
}
export const sfx = {
  step: (run) => noiseBurst((run ? 1.4 : 1) * ((curStyle && curStyle.step) || 300), 0.11, run ? 0.32 : 0.2),
  thump: (v) => tone(58, 0.2, 0.5 * v, 'sine', 32),
  pickup: () => { tone(880, 0.35, 0.25); tone(1320, 0.5, 0.2, 'sine', null, 0.12); },
  fuse: () => { tone(660, 0.2, 0.25, 'square'); tone(990, 0.3, 0.18, 'square', null, 0.1); },
  caught: () => { noiseBurst(2500, 0.9, 0.9, 'highpass'); tone(90, 1.1, 0.5, 'sawtooth', 30); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.7, 0.22, 'triangle', null, i * 0.16)),
  click: () => { noiseBurst(1800, 0.06, 0.4, 'highpass'); tone(220, 0.15, 0.3, 'square', 110); },
  zap: () => { noiseBurst(3000, 0.5, 0.5, 'highpass'); tone(120, 0.5, 0.3, 'sawtooth', 600); },
  beep: () => { tone(1200, 0.12, 0.2, 'square'); tone(1600, 0.2, 0.2, 'square', null, 0.14); },
  key: () => tone(900, 0.06, 0.12, 'square'),
  door: () => { tone(70, 1.2, 0.5, 'sawtooth', 40); noiseBurst(400, 1.0, 0.4); },
  alarm: () => { for (let i = 0; i < 6; i++) { tone(700, 0.4, 0.22, 'sawtooth', 1100, i * 0.5); tone(1100, 0.1, 0.0001, 'sine', null, i * 0.5 + 0.4); } },
  drip: () => { const f = rand(1200, 2600); tone(f, 0.12, 0.07, 'sine', f * 0.6); tone(f * 0.5, 0.25, 0.03, 'sine', null, 0.12); },
  clang: () => { tone(rand(150, 260), 0.7, 0.14, 'sawtooth', 90); noiseBurst(900, 0.3, 0.15); },
  rumble: () => noiseBurst(120, 1.5, 0.22),
  fl: () => { noiseBurst(2600, 0.04, 0.35, 'highpass'); tone(320, 0.07, 0.2, 'square', 150); },
  roar: () => { tone(130, 1.7, 0.55, 'sawtooth', 42); tone(260, 1.4, 0.3, 'square', 70, 0.05); noiseBurst(900, 1.5, 0.5, 'bandpass'); tone(1400, 0.9, 0.12, 'sawtooth', 300, 0.1); },
  crackle: () => { noiseBurst(5000, 0.12, 0.08, 'highpass'); noiseBurst(4000, 0.08, 0.06, 'highpass'); },
  valve: () => { tone(90, 0.5, 0.25, 'sawtooth', 60); noiseBurst(700, 0.35, 0.18, 'bandpass'); },
  drain: () => { noiseBurst(220, 5.0, 0.45); tone(48, 5, 0.3, 'sine', 30); },
  pump: () => { for (let i = 0; i < 4; i++) tone(55 + i * 6, 2.5, 0.25, 'sawtooth', 70, i * 0.6); noiseBurst(300, 6, 0.35); },
  splash: () => { noiseBurst(1400, 0.5, 0.35, 'bandpass'); noiseBurst(500, 0.8, 0.25); },
  whisper: () => { for (let i = 0; i < 3; i++) noiseBurst(rand(2500, 4500), rand(0.3, 0.6), 0.06, 'bandpass'); tone(rand(180, 260), 0.8, 0.02, 'sine', rand(120, 200), 0.2); },
  detector: () => tone(1800, 0.05, 0.12, 'square'),
  shriek: () => { tone(900, 1.2, 0.35, 'sawtooth', 2400); tone(1300, 1.0, 0.25, 'square', 600, 0.05); noiseBurst(3000, 1.2, 0.5, 'highpass'); },
  noise: () => { for (let i = 0; i < 8; i++) tone(rand(600, 1400), 0.12, 0.15, 'square', null, i * 0.15); },
  boom: (v = 1) => { noiseBurst(180, 1.6, 0.8 * v); tone(60, 1.2, 0.6 * v, 'sine', 25); noiseBurst(1200, 0.4, 0.4 * v, 'bandpass'); },
  boing: () => tone(180, 0.35, 0.3, 'sine', 620),
  revive: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.6, 0.18, 'sine', null, i * 0.09)),
  bubble: () => { const f = rand(300, 700); tone(f, 0.08, 0.08, 'sine', f * 1.8); },
};

// Звуки близости существа (гул страха, сердцебиение) и случайные звуки окружения
let heartT = 0, ambT = 0;
let bubbleT = 0;
export function updateAudio(dt, prox, underwater = false) {
  if (!A) return;
  A.under.frequency.setTargetAtTime(underwater ? 420 : 20000, A.ctx.currentTime, 0.08);
  if (underwater) { bubbleT -= dt; if (bubbleT <= 0) { sfx.bubble(); bubbleT = rand(0.3, 1.2); } }
  A.dread.gain.value += (prox * prox * 0.28 - A.dread.gain.value) * Math.min(1, dt * 4);
  if (prox > 0.08) {
    heartT -= dt;
    if (heartT <= 0) { sfx.thump(0.3 + prox); heartT = 1.05 - prox * 0.65; setTimeout(() => sfx.thump(0.2 + prox * 0.6), 160); }
  }
  if (A.amb) {
    const rate = { drip: 0.45, clang: 0.1, rumble: 0.08, crackle: 0.3 }[A.amb];
    ambT += dt;
    if (ambT > 0.25) { if (Math.random() < rate * ambT) sfx[A.amb](); ambT = 0; }
  }
}
