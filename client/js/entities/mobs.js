// Модели существ
import * as THREE from 'three';
import { clamp, lerpAngle } from '../core/util.js';
import { S, me } from '../core/state.js';
import { scene } from '../render/scene.js';
import { glowSprite, lam } from '../render/textures.js';
import { limb } from './avatars.js';

// Существа
export const mobEnts = [];
let mobType = 'stalker';
function faceTexture(kind) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  if (kind === 'runner') {
    g.fillStyle = '#060606'; g.fillRect(0, 0, 512, 256);
    const cx = 128, cy = 128;
    // светящиеся глаза и широкая зубастая улыбка
    for (const ex of [-30, 30]) {
      const gr = g.createRadialGradient(cx + ex, cy - 22, 1, cx + ex, cy - 22, 20);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, '#e8ffd8'); gr.addColorStop(1, 'rgba(200,255,180,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(cx + ex, cy - 22, 15, 20, 0, 0, 7); g.fill();
    }
    g.fillStyle = '#f4f0dc'; g.beginPath(); g.moveTo(cx - 52, cy + 14); g.quadraticCurveTo(cx, cy + 74, cx + 52, cy + 14); g.quadraticCurveTo(cx, cy + 34, cx - 52, cy + 14); g.fill();
    g.fillStyle = '#060606'; for (let i = -4; i <= 4; i++) g.fillRect(cx + i * 11 - 1, cy + 14, 2.5, 46);
  } else {
    g.fillStyle = '#d9d4bd'; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,80,50,${Math.random() * 0.12})`; g.fillRect(Math.random() * 512, Math.random() * 256, 30, 3); }
    const cx = 128, cy = 118;
    g.fillStyle = '#0b0b0b';
    g.beginPath(); g.ellipse(cx - 24, cy - 12, 9, 17, 0.1, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx + 24, cy - 12, 9, 17, -0.1, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx, cy + 40, 12, 24, 0, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const faceTex = {};

function makeMob(type) {
  const g = new THREE.Group(), parts = {};
  const body = new THREE.Group(); parts.body = body;
  if (type === 'runner') {
    const dark = lam(0x0c0c0c, 0x050505), cloth = lam(0x1d2420, 0x050806);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.1, 10), cloth); torso.position.y = 1.35;
    const coat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 10, 1, true), cloth); coat.position.y = 0.95; coat.rotation.x = Math.PI;
    coat.material = cloth.clone(); coat.material.side = THREE.DoubleSide;
    faceTex.runner = faceTex.runner || faceTexture('runner');
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), new THREE.MeshBasicMaterial({ map: faceTex.runner }));
    head.scale.set(1, 1.15, 1); head.position.set(0, 2.05, 0.12);
    const glow = glowSprite(0xd8ffc8, 1.5, 0.4); glow.position.set(0, 2.05, 0.4);
    parts.armL = limb(1.5, 0.06, 0.04, dark, -0.34, 1.78, 0); parts.armR = limb(1.5, 0.06, 0.04, dark, 0.34, 1.78, 0);
    for (const a of [parts.armL, parts.armR]) for (let f = -1; f <= 1; f++) { const fi = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.28, 4), dark); fi.position.set(f * 0.03, -1.58, 0); a.add(fi); }
    parts.legL = limb(1.0, 0.08, 0.05, dark, -0.15, 0.95, 0); parts.legR = limb(1.0, 0.08, 0.05, dark, 0.15, 0.95, 0);
    body.add(torso, coat, head, glow, parts.armL, parts.armR);
    body.position.y = 0; body.rotation.x = 0.45; body.position.z = 0.15;
    g.add(body, parts.legL, parts.legR);
  } else {
    const black = lam(0x090909, 0x030303);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.25, 10), black); torso.position.y = 1.75;
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.14, 0.24), black); shoulders.position.y = 2.32;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8), black); neck.position.y = 2.5;
    faceTex.stalker = faceTex.stalker || faceTexture('stalker');
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 14), new THREE.MeshLambertMaterial({ map: faceTex.stalker, emissive: 0x1a1810 }));
    head.scale.set(0.85, 1.3, 0.9); head.position.y = 2.82;
    parts.armL = limb(1.95, 0.05, 0.03, black, -0.36, 2.28, 0); parts.armR = limb(1.95, 0.05, 0.03, black, 0.36, 2.28, 0);
    for (const a of [parts.armL, parts.armR]) for (let f = -1; f <= 1; f++) { const fi = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.005, 0.34, 4), black); fi.position.set(f * 0.035, -2.1, 0); a.add(fi); }
    parts.legL = limb(1.25, 0.075, 0.045, black, -0.13, 1.2, 0); parts.legR = limb(1.25, 0.075, 0.045, black, 0.13, 1.2, 0);
    body.add(torso, shoulders, neck, head, parts.armL, parts.armR);
    g.add(body, parts.legL, parts.legR);
  }
  g.visible = false; scene.add(g);
  return { group: g, parts, type, x: 0, y: 0, z: 0, r: 0, tx: 0, ty: 0, tz: 0, tr: 0, chase: false, stun: false, seen: false, walk: 0 };
}
export function ensureMobs(n, type) {
  if (type && type !== mobType) { while (mobEnts.length) scene.remove(mobEnts.pop().group); mobType = type; }
  while (mobEnts.length < n) mobEnts.push(makeMob(mobType));
  while (mobEnts.length > n) scene.remove(mobEnts.pop().group);
}

// Интерполяция и анимация существ. Возвращает расстояние до ближайшего активного существа.
export function updateMobs(dt) {
  const k = 1 - Math.exp(-12 * dt);
  let mobDist = 999;
  for (const mo of mobEnts) {
    if (!mo.seen) continue;
    const dx = mo.tx - mo.x, dz = mo.tz - mo.z;
    const sp = Math.hypot(dx, dz) / Math.max(dt, 0.001);
    mo.x += dx * k; mo.y += (mo.ty - mo.y) * k; mo.z += dz * k;
    mo.r = lerpAngle(mo.r, mo.tr, 1 - Math.exp(-8 * dt));
    const run = mo.type === 'runner';
    mo.walk += dt * clamp(sp, 0, 7) * (run ? 1.9 : 1.4);
    mo.group.position.set(mo.x, mo.y, mo.z);
    mo.group.rotation.y = mo.r;
    const amp = clamp(sp / 3, 0.15, 1);
    const sw = Math.sin(mo.walk) * (run ? 1.0 : 0.55) * amp;
    if (run) {
      mo.group.rotation.z = 0;
      mo.parts.body.rotation.x = 0.35 + 0.25 * amp + Math.sin(mo.walk * 2) * 0.05;
      mo.parts.body.position.y = Math.abs(Math.sin(mo.walk)) * 0.12 * amp;
      mo.parts.armL.rotation.x = -sw * 1.1 - 0.5; mo.parts.armR.rotation.x = sw * 1.1 - 0.5;
    } else {
      mo.group.rotation.z = Math.sin(S.time * 1.3) * 0.03;
      mo.parts.armL.rotation.x = sw; mo.parts.armR.rotation.x = -sw;
    }
    mo.parts.legL.rotation.x = -sw * 0.8; mo.parts.legR.rotation.x = sw * 0.8;
    mo.group.visible = !mo.stun;
    if (!mo.stun) mobDist = Math.min(mobDist, Math.hypot(mo.x - me.x, (mo.y - me.y) * 2, mo.z - me.z));
  }
  return mobDist;
}
