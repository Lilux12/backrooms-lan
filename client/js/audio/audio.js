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
  // Реверберация помещения: свёртка с синтезированным откликом (длина — по стилю уровня)
  const verb = ctx.createConvolver(), wet = ctx.createGain(); wet.gain.value = 0.22;
  master.connect(verb); verb.connect(wet); wet.connect(under);
  // Слой напряжения: низкий пульсирующий гул, громче, когда за вами гонятся
  const tens = ctx.createOscillator(); tens.type = 'sawtooth'; tens.frequency.value = 55;
  const tlp = ctx.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 220;
  const tgate = ctx.createGain(); tgate.gain.value = 0;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 1.6; const lfoG = ctx.createGain(); lfoG.gain.value = 0;
  lfo.connect(lfoG); lfoG.connect(tgate.gain);
  const tvol = ctx.createGain(); tvol.gain.value = 0;
  tens.connect(tlp); tlp.connect(tgate); tgate.connect(tvol); tvol.connect(master); tens.start(); lfo.start();
  A = { ctx, master, under, hum, humOsc, dread: dg, nb, amb: null, verb, wet, tension: { vol: tvol, lfo, lfoG, osc: tens }, dest: null };
  if (curStyle) setAmbience(curStyle);
}
// Длина реверберации по стилю уровня (секунды) и сила «мокрого» сигнала
const VERB = { yellow: [0.9, 0.15], concrete: [2.4, 0.3], tunnel: [2.0, 0.3], pool: [3.2, 0.35], run: [1.1, 0.2], office: [0.8, 0.12],
  hotel: [1.0, 0.15], mall: [2.8, 0.32], lab: [1.0, 0.18], school: [1.7, 0.25], factory: [2.6, 0.32] };
function impulse(sec) {
  const n = Math.floor(A.ctx.sampleRate * sec), buf = A.ctx.createBuffer(2, n, A.ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
  return buf;
}
export function setAmbience(st) {
  if (!A) return;
  st.hum.forEach((f, i) => A.humOsc[i].frequency.setTargetAtTime(f, A.ctx.currentTime, 0.3));
  A.amb = st.amb;
  const name = Object.keys(VERB).find((k) => STYLE_OF(k) === st) || 'yellow';
  const [sec, w] = VERB[name];
  A.verb.buffer = impulse(sec); A.wet.gain.value = w;
  A.stepKind = STEP_KIND[name] || 'concrete';
}
// Какая это поверхность под ногами (по стилю уровня)
const STEP_KIND = { yellow: 'carpet', hotel: 'carpet', office: 'carpet', concrete: 'concrete', parking: 'concrete', tunnel: 'metal', factory: 'metal',
  pool: 'tile', mall: 'tile', lab: 'tile', run: 'tile', school: 'wood' };
let STYLE_OF = () => null;
export function bindStyles(fn) { STYLE_OF = fn; }

// Звук в точке мира: всё, что сыграет fn, идёт через панораму (HRTF) от источника к слушателю-камере
export function playAt(x, y, z, fn) {
  if (!A) return;
  const p = A.ctx.createPanner();
  p.panningModel = settings.preset === 'low' ? 'equalpower' : 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 3; p.rolloffFactor = 1.1; p.maxDistance = 80;
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  p.connect(A.master);
  A.dest = p;
  try { fn(); } finally { A.dest = null; }
  setTimeout(() => p.disconnect(), 6000);
}
// Слушатель — камера (положение и направление)
export function updateListener(cam, fwd) {
  if (!A) return;
  const L = A.ctx.listener, t = A.ctx.currentTime;
  if (L.positionX) {
    L.positionX.setTargetAtTime(cam.x, t, 0.02); L.positionY.setTargetAtTime(cam.y, t, 0.02); L.positionZ.setTargetAtTime(cam.z, t, 0.02);
    L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  } else { L.setPosition(cam.x, cam.y, cam.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
}
function noiseBurst(freq, dur, vol, type = 'lowpass') {
  if (!A) return;
  const s = A.ctx.createBufferSource(); s.buffer = A.nb;
  const f = A.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = A.ctx.createGain(); const t = A.ctx.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(A.dest || A.master); s.start(t); s.stop(t + dur + 0.05);
}
export function tone(freq, dur, vol, type = 'sine', slideTo = null, delay = 0) {
  if (!A) return;
  const o = A.ctx.createOscillator(); o.type = type;
  const g = A.ctx.createGain(); const t = A.ctx.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(A.dest || A.master); o.start(t); o.stop(t + dur + 0.05);
}
export const sfx = {
  step: (run, wet) => {
    const k = run ? 1.4 : 1, v = run ? 0.32 : 0.2;
    if (wet) { noiseBurst(900 * k, 0.22, v * 1.1, 'bandpass'); noiseBurst(300, 0.18, v * 0.6); return; } // шлёп по воде
    switch (A && A.stepKind) {
      case 'carpet': noiseBurst(220 * k, 0.09, v * 0.7); break;
      case 'metal': noiseBurst(1200 * k, 0.07, v * 0.8, 'bandpass'); tone(rand(180, 240), 0.12, v * 0.25, 'triangle', 120); break;
      case 'tile': noiseBurst(2400 * k, 0.05, v * 0.7, 'highpass'); noiseBurst(400, 0.06, v * 0.5); break;
      case 'wood': noiseBurst(500 * k, 0.08, v * 0.8, 'bandpass'); if (Math.random() < 0.15) tone(rand(120, 160), 0.3, 0.04, 'sawtooth', 100); break;
      default: noiseBurst(k * ((curStyle && curStyle.step) || 300), 0.11, v);
    }
  },
  // шаги и голоса существ (играются через playAt — с направлением)
  mobStep: (type, v = 1) => {
    switch (type) {
      case 'worm': noiseBurst(400, 0.4, 0.25 * v, 'bandpass'); break;
      case 'headlights': tone(70, 0.3, 0.12 * v, 'sawtooth', 60); noiseBurst(300, 0.1, 0.2 * v); break;
      case 'mannequin': case 'doll': noiseBurst(3000, 0.05, 0.2 * v, 'highpass'); tone(rand(500, 700), 0.06, 0.05 * v, 'square'); break;
      case 'overseer': tone(48, 0.4, 0.5 * v, 'sine', 30); noiseBurst(800, 0.2, 0.35 * v, 'bandpass'); break;
      case 'crawler': case 'specimen': noiseBurst(2000, 0.04, 0.18 * v, 'bandpass'); noiseBurst(2600, 0.04, 0.14 * v, 'bandpass'); break;
      case 'drowner': noiseBurst(600, 0.3, 0.2 * v, 'bandpass'); break;
      default: noiseBurst(260, 0.12, 0.3 * v); noiseBurst(1400, 0.04, 0.12 * v, 'bandpass');
    }
  },
  mobVoice: (type, v = 1) => {
    switch (type) {
      case 'runner': tone(rand(300, 420), 0.5, 0.12 * v, 'sawtooth', rand(500, 700)); break; // смешок
      case 'bellhop': tone(1760, 0.6, 0.05 * v, 'sine'); tone(2349, 0.8, 0.04 * v, 'sine', null, 0.1); break; // звонок портье
      case 'teacher': tone(392, 0.4, 0.06 * v, 'triangle', 330); break; // «тш-ш»
      case 'specimen': tone(rand(90, 140), 1.0, 0.15 * v, 'sawtooth', 60); noiseBurst(1500, 0.6, 0.1 * v, 'bandpass'); break;
      case 'overseer': tone(55, 1.4, 0.35 * v, 'sawtooth', 40); break;
      default: tone(rand(110, 160), 1.0, 0.14 * v, 'sawtooth', rand(60, 90)); noiseBurst(700, 0.8, 0.12 * v, 'bandpass');
    }
  },
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
  // звуки уровней (v — громкость по расстоянию до источника)
  caralarm: (v = 1) => { for (let i = 0; i < 8; i++) tone(i % 2 ? 760 : 980, 0.22, 0.13 * v, 'square', null, i * 0.24); },
  slam: (v = 1) => { tone(70, 0.4, 0.5 * v, 'sine', 35); noiseBurst(600, 0.3, 0.4 * v); },
  radio: (v = 1) => { noiseBurst(3000, 0.6, 0.12 * v, 'bandpass'); tone(1000, 0.08, 0.06 * v, 'square', null, 0.5); },
  lift: (v = 1) => { tone(880, 0.5, 0.15 * v, 'sine'); tone(660, 0.7, 0.12 * v, 'sine', null, 0.25); noiseBurst(200, 0.8, 0.15 * v); },
  crash: (v = 1) => { noiseBurst(1800, 0.5, 0.45 * v, 'bandpass'); tone(160, 0.4, 0.3 * v, 'sawtooth', 60); },
  steam: (v = 1) => noiseBurst(5000, 2.5, 0.25 * v, 'highpass'),
  creak: () => { const f = rand(90, 160); tone(f, 1.2, 0.05, 'sawtooth', f * 1.3); if (Math.random() < 0.3) tone(1320, 1.4, 0.03, 'sine', null, 0.6); }, // скрип пола и далёкий звонок лифта
  muzak: () => { const base = [262, 330, 392, 349][Math.floor(Math.random() * 4)]; [0, 0.4, 0.8].forEach((d, i) => tone(base * [1, 1.25, 0.94][i], 0.5, 0.025, 'triangle', base * 0.97, d)); }, // обрывки музыки из колонок
  beep: () => { tone(rand(1800, 2400), 0.07, 0.04, 'square'); if (Math.random() < 0.4) tone(rand(900, 1200), 0.07, 0.03, 'square', null, 0.25); }, // приборы лаборатории
  giggle: () => { const f = rand(500, 700); for (let i = 0; i < 4; i++) tone(f * (1 + i * 0.04), 0.09, 0.025, 'sine', f * 1.3, i * 0.11); }, // далёкий детский смех
  musicbox: (v = 1) => { const mel = [784, 659, 698, 587, 659, 523, 587, 494, 523, 659, 784, 659]; mel.forEach((f, i) => tone(f, 0.5, 0.09 * v, 'sine', null, i * 0.42)); },
  drum: (v = 1) => { tone(70, 0.35, 0.5 * v, 'sine', 45); noiseBurst(300, 0.15, 0.3 * v); },
  cough: () => { noiseBurst(900, 0.25, 0.3, 'bandpass'); noiseBurst(700, 0.2, 0.25, 'bandpass'); },
  tick: () => tone(1400, 0.05, 0.12, 'square'),
  glitch: () => { noiseBurst(4000, 0.4, 0.3, 'bandpass'); tone(60, 0.6, 0.3, 'square', 30); },
};

// Звуки близости существа (гул страха, сердцебиение) и случайные звуки окружения
let heartT = 0, ambT = 0;
let bubbleT = 0;
export function updateAudio(dt, prox, underwater = false, chasing = 0, finale = false) {
  if (!A) return;
  // напряжение: гонятся — громче и чаще пульс; в финале — ещё быстрее
  const tv = Math.min(1, chasing * 0.45 + (finale ? 0.35 : 0) + prox * 0.3);
  A.tension.vol.gain.value += (tv * 0.11 - A.tension.vol.gain.value) * Math.min(1, dt * 2);
  A.tension.lfoG.gain.value = 0.5; A.tension.lfo.frequency.value = 1.2 + tv * 3.5 + (finale ? 1.5 : 0);
  A.under.frequency.setTargetAtTime(underwater ? 420 : 20000, A.ctx.currentTime, 0.08);
  if (underwater) { bubbleT -= dt; if (bubbleT <= 0) { sfx.bubble(); bubbleT = rand(0.3, 1.2); } }
  A.dread.gain.value += (prox * prox * 0.28 - A.dread.gain.value) * Math.min(1, dt * 4);
  if (prox > 0.08) {
    heartT -= dt;
    if (heartT <= 0) { sfx.thump(0.3 + prox); heartT = 1.05 - prox * 0.65; setTimeout(() => sfx.thump(0.2 + prox * 0.6), 160); }
  }
  if (A.amb) {
    const rate = { drip: 0.45, clang: 0.1, rumble: 0.08, crackle: 0.3, creak: 0.07, muzak: 0.05, beep: 0.06, giggle: 0.03 }[A.amb] || 0.1;
    ambT += dt;
    if (ambT > 0.25) { if (Math.random() < rate * ambT) sfx[A.amb](); ambT = 0; }
  }
}
