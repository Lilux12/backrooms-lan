// Освещение уровня: применение стиля, мерцание ламп, фонарик
import * as THREE from 'three';
import { $, rand } from '../core/util.js';
import { FL, S } from '../core/state.js';
import { dust, hemi, lamp, scene, sun, torch } from './scene.js';
import { STYLES } from './styles.js';
import { W, fogMul, lightMul, updateWorldFx } from '../game/worldfx.js';
import { A, bindStyles, setAmbience } from '../audio/audio.js';
import { settings } from '../core/settings.js';
import { setGrade } from './post.js';

export const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
const LIGHT = { fogD: 0.03, hemi: 1.7, sun: 1.2, lamp: 4.6, fog: new THREE.Color(0x000000), flick: [5, 16], pulse: false, panel: [1, 1, 1] };
export let curStyle = null, mats = null;

// Цветокоррекция каждого уровня (оттенок, насыщенность, контраст) — для постобработки
const GRADES = {
  yellow: { tint: [1.05, 1.0, 0.86], sat: 0.9, contrast: 1.06 }, concrete: { tint: [0.92, 0.98, 1.06], sat: 0.7, contrast: 1.1 },
  tunnel: { tint: [1.08, 0.92, 0.85], sat: 0.95, contrast: 1.12 }, pool: { tint: [0.93, 1.03, 1.05], sat: 0.85, contrast: 1.0 },
  run: { tint: [0.92, 1.04, 0.98], sat: 0.75, contrast: 1.12 }, office: { tint: [0.98, 1.02, 0.92], sat: 0.8, contrast: 1.05 },
  hotel: { tint: [1.08, 0.96, 0.86], sat: 0.95, contrast: 1.08 }, mall: { tint: [0.95, 0.98, 1.04], sat: 0.7, contrast: 1.06 },
  lab: { tint: [0.92, 1.02, 1.06], sat: 0.8, contrast: 1.1 }, school: { tint: [1.04, 1.0, 0.92], sat: 1.05, contrast: 1.0 },
  factory: { tint: [1.1, 0.92, 0.8], sat: 0.9, contrast: 1.15 },
};
// Шероховатость поверхностей для PBR (плитка и вода блестят, ковёр и бетон — нет)
const ROUGH = { pool: [0.6, 0.25, 0.8], mall: [0.7, 0.3, 0.9], lab: [0.6, 0.35, 0.9], run: [0.6, 0.4, 0.9], factory: [0.6, 0.55, 0.9], hotel: [0.9, 0.95, 0.9] };

function makeMats(st, name, pbr) {
  const r = ROUGH[name] || [0.9, 0.8, 0.95];
  const M = (tex, bump, rough) => (pbr
    ? new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: bump, roughness: rough, metalness: name === 'factory' ? 0.25 : 0 })
    : new THREE.MeshLambertMaterial({ map: tex, bumpMap: tex, bumpScale: bump }));
  return { wall: M(st._t.wall, 2.2, r[0]), floor: M(st._t.floor, 1.6, r[1]), ceil: M(st._t.ceil, 1.4, r[2]) };
}

export function applyStyle(name) {
  const st = STYLES[name];
  if (!st._t) st._t = st.tex();
  st._mm = st._mm || {};
  const tier = settings.pbr ? 'pbr' : 'lam';
  if (!st._mm[tier]) st._mm[tier] = makeMats(st, name, settings.pbr);
  curStyle = st; mats = st._mm[tier];
  setGrade(GRADES[name]);
  hemi.color.setHex(st.hemi[0]); hemi.groundColor.setHex(st.hemi[1]);
  sun.color.setHex(st.sun[0]); lamp.color.setHex(st.lamp[0]);
  LIGHT.hemi = st.hemi[2]; LIGHT.sun = st.sun[1]; LIGHT.lamp = st.lamp[1];
  LIGHT.fog.setHex(st.fog); LIGHT.flick = st.flick; LIGHT.pulse = !!st.pulse; LIGHT.panel = st.panel.c;
  LIGHT.fogD = st.fogD; scene.fog.density = st.fogD;
  dust.material.color.setHex(st.fog).lerp(new THREE.Color(0xffffff), 0.6);
  flick.next = rand(2, 5); flick.dur = 0;
  setAmbience(st);
  return st;
}

const flick = { next: rand(3, 8), dur: 0, k: 1 };
bindStyles((name) => STYLES[name]); // звук узнаёт стиль уровня (реверберация, шаги)

export function updateLight(dt) {
  flick.next -= dt;
  if (flick.next <= 0 && flick.dur <= 0) { flick.dur = rand(0.25, 1.0); flick.next = W.flicker ? rand(0.2, 1.2) : rand(LIGHT.flick[0], LIGHT.flick[1]); }
  let target = 1;
  if (flick.dur > 0) { flick.dur -= dt; target = Math.random() < 0.55 ? rand(0.2, 0.55) : 1; }
  flick.k += (target - flick.k) * Math.min(1, dt * 30);
  let k = flick.k * (0.97 + 0.03 * Math.sin(S.time * 90)) * lightMul(); // хост может менять свет
  if (LIGHT.pulse) k *= 0.78 + 0.22 * Math.sin(S.time * 3.2);
  if (performance.now() / 1000 < (S.blackoutUntil || 0)) k *= 0.04; // перегрузка: свет погас
  if (curStyle && curStyle.unpowered && !S.powered) k *= 0.22;       // здание обесточено, пока не запустят генератор
  const alarm = performance.now() / 1000 < S.alarmUntil;
  if (alarm) k *= 0.6 + 0.4 * Math.abs(Math.sin(S.time * 6));
  FL.k += ((FL.on ? 1 : 0) - FL.k) * Math.min(1, dt * 14);
  let tf = 1;
  if (FL.on && FL.bat < 0.15 && Math.random() < 0.25) tf = rand(0.1, 0.7);
  torch.intensity = 36 * FL.k * tf * (0.55 + 0.45 * Math.min(1, FL.bat * 6)) * (0.9 + 0.1 * k);
  scene.fog.density = LIGHT.fogD * (1 - 0.22 * FL.k) * fogMul();
  hemi.intensity = LIGHT.hemi * k; sun.intensity = LIGHT.sun * k; lamp.intensity = LIGHT.lamp * k;
  const p = LIGHT.panel;
  panelMat.color.setRGB(p[0] * k, p[1] * k, p[2] * k);
  scene.fog.color.copy(LIGHT.fog).multiplyScalar(0.55 + 0.45 * k);
  scene.background.copy(scene.fog.color);
  $('alarmfx').style.opacity = alarm ? String(0.25 + 0.25 * Math.sin(S.time * 9)) : '0';
  if (A) A.hum.gain.value = 0.05 * (0.6 + 0.4 * k);
  updateWorldFx(dt, LIGHT, { hemi, lamp, panelMat });
}
