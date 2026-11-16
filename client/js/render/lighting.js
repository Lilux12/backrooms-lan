// Освещение уровня: применение стиля, мерцание ламп, фонарик
import * as THREE from 'three';
import { $, rand } from '../core/util.js';
import { FL, S } from '../core/state.js';
import { dust, hemi, lamp, scene, sun, torch } from './scene.js';
import { STYLES } from './styles.js';
import { W, fogMul, lightMul, updateWorldFx } from '../game/worldfx.js';
import { A, setAmbience } from '../audio/audio.js';

export const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
const LIGHT = { fogD: 0.03, hemi: 1.7, sun: 1.2, lamp: 4.6, fog: new THREE.Color(0x000000), flick: [5, 16], pulse: false, panel: [1, 1, 1] };
export let curStyle = null, mats = null;

export function applyStyle(name) {
  const st = STYLES[name];
  if (!st._t) st._t = st.tex();
  if (!st._m) st._m = {
    wall: new THREE.MeshLambertMaterial({ map: st._t.wall, bumpMap: st._t.wall, bumpScale: 2.2 }),
    floor: new THREE.MeshLambertMaterial({ map: st._t.floor, bumpMap: st._t.floor, bumpScale: 1.6 }),
    ceil: new THREE.MeshLambertMaterial({ map: st._t.ceil, bumpMap: st._t.ceil, bumpScale: 1.4 }),
  };
  curStyle = st; mats = st._m;
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

export function updateLight(dt) {
  flick.next -= dt;
  if (flick.next <= 0 && flick.dur <= 0) { flick.dur = rand(0.25, 1.0); flick.next = W.flicker ? rand(0.2, 1.2) : rand(LIGHT.flick[0], LIGHT.flick[1]); }
  let target = 1;
  if (flick.dur > 0) { flick.dur -= dt; target = Math.random() < 0.55 ? rand(0.2, 0.55) : 1; }
  flick.k += (target - flick.k) * Math.min(1, dt * 30);
  let k = flick.k * (0.97 + 0.03 * Math.sin(S.time * 90)) * lightMul(); // хост может менять свет
  if (LIGHT.pulse) k *= 0.78 + 0.22 * Math.sin(S.time * 3.2);
  if (performance.now() / 1000 < (S.blackoutUntil || 0)) k *= 0.04; // перегрузка: свет погас
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
