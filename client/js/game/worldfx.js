// Правила мира от хоста: свет, туман, гравитация, время, дискотека, фильтры, инверсия, лава, догонялки,
// модификаторы игроков (скорость, прыжок, полёт, сквозь стены, размер, облик, заморозка) и забавные эффекты.
import * as THREE from 'three';
import { $, BR } from '../core/util.js';
import { S, me, FL } from '../core/state.js';
import { settings } from '../core/settings.js';
import { camera, scene, renderer, applyQuality } from '../render/scene.js';
import { glowTexture } from '../render/textures.js';
import { remotes } from '../entities/avatars.js';
import { mobEnts } from '../entities/mobs.js';
import { makeSkin } from '../entities/skins.js';
import { objs, map } from '../world/world.js';
import { sfx } from '../audio/audio.js';
import { toast, showBanner, hideBanner } from '../ui/hud.js';

export const W = { light: 1, lights: true, flicker: false, fog: 1, gravity: 1, timescale: 1, disco: false, invert: false, fov: 0, filter: 'none', freecam: false, mobskin: 'default', lava: false, tag: 0 };
export const mods = new Map(); // id → модификаторы
export const myMods = () => mods.get(S.myId) || { speed: 1, jump: 1, fly: false, noclip: false, size: 1, skin: 'human', color: -1, frozen: false, notorch: false, possessed: false };

/* ------------------------- Применение правил ------------------------- */
export function applyWorld(msg) {
  Object.assign(W, msg.w);
  mods.clear();
  for (const [id, m] of Object.entries(msg.mods || {})) mods.set(+id, m);
  // фильтр картинки
  const game = $('game');
  const css = { none: '', bw: 'grayscale(1) contrast(1.15)', night: 'sepia(1) hue-rotate(65deg) saturate(3.5) brightness(1.7) contrast(1.2)', vhs: 'saturate(1.6) contrast(1.15) blur(0.4px)', '8bit': 'saturate(1.5) contrast(1.2)' }[W.filter] || '';
  game.style.filter = `brightness(${settings.br}) ${css}`;
  game.classList.toggle('pix', W.filter === '8bit');
  $('vhsfx').style.display = W.filter === 'vhs' ? 'block' : 'none';
  applyQuality(W.filter === '8bit' ? 0.22 : null);
  if (myMods().notorch) FL.on = false;
  // облики игроков
  for (const [id, r] of remotes) restyleAvatar(r, mods.get(id));
  for (const mo of mobEnts) restyleMob(mo);
  $('tagBox').style.display = W.tag === S.myId ? 'block' : 'none';
  $('lavaBox').style.display = W.lava ? 'block' : 'none';
}

// Облик, цвет, размер и «одержимость» аватара другого игрока
export function restyleAvatar(r, m) {
  if (!r) return;
  m = m || {};
  const want = m.possessed ? 'possessed' : (m.skin || 'human');
  if (r.skinKind !== want) {
    if (r.skinModel) { r.mesh.remove(r.skinModel); r.skinModel = null; }
    for (const ch of r.mesh.children) if (ch !== r.nameTag) ch.visible = want === 'human';
    if (want !== 'human') {
      r.skinModel = want === 'possessed' ? makeSkin('cube', 0x111111) : makeSkin(want, m.color >= 0 ? m.color : 0x6aa0ff);
      r.mesh.add(r.skinModel);
    }
    r.skinKind = want;
  }
  r.mesh.scale.setScalar(m.size || 1);
  if (r.parts.shirt && m.color >= 0) r.parts.shirt.color.setHex(m.color);
  r.tagged = W.tag === r.id;
}
function restyleMob(mo) {
  const want = W.mobskin || 'default';
  if (mo.skinKind === want) return;
  if (mo.skinModel) { mo.group.remove(mo.skinModel); mo.skinModel = null; }
  for (const ch of mo.group.children) ch.visible = want === 'default';
  if (want !== 'default') { mo.skinModel = makeSkin(want, 0xff4040); mo.skinModel.scale.setScalar(1.4); mo.group.add(mo.skinModel); }
  mo.skinKind = want;
}

/* --------------------------- Кадр за кадром --------------------------- */
let discoT = 0;
export function updateWorldFx(dt, LIGHT, lights) {
  // дискотека: свет переливается
  if (W.disco) {
    discoT += dt;
    const c = new THREE.Color().setHSL((discoT * 0.4) % 1, 1, 0.55);
    lights.hemi.color.copy(c); lights.lamp.color.copy(c);
    lights.panelMat.color.setHSL((discoT * 0.4 + 0.5) % 1, 1, 0.6);
  }
  for (const mo of mobEnts) { restyleMob(mo); mo.group.scale.setScalar(mo.scale || 1); }
  for (const [id, r] of remotes) {
    if (r.skinKind === undefined) restyleAvatar(r, mods.get(id));
    if (r.skinModel) r.skinModel.rotation.y = Math.sin(performance.now() / 300) * 0.1;
  }
  tickParticles(dt);
}

// Множители света и тумана для освещения (render/lighting.js)
export const lightMul = () => (W.lights ? W.light : 0.08);
export const fogMul = () => W.fog;

/* ----------------------------- Эффекты ----------------------------- */
const parts = [];
function burst(x, y, z, n, colors, speed, life, size = 0.25, gravity = 6) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, s = speed * (0.4 + Math.random() * 0.6);
    vel.push([Math.cos(a) * Math.cos(b) * s, Math.abs(Math.sin(b)) * s + speed * 0.3, Math.sin(a) * Math.cos(b) * s]);
    const c = new THREE.Color(colors[i % colors.length]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size, vertexColors: true, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  scene.add(pts);
  parts.push({ pts, vel, t: 0, life, gravity });
}
function tickParticles(dt) {
  for (const p of parts) {
    p.t += dt;
    const a = p.pts.geometry.attributes.position.array;
    p.vel.forEach((v, i) => { v[1] -= p.gravity * dt; a[i * 3] += v[0] * dt; a[i * 3 + 1] += v[1] * dt; a[i * 3 + 2] += v[2] * dt; });
    p.pts.geometry.attributes.position.needsUpdate = true;
    p.pts.material.opacity = Math.max(0, 1 - p.t / p.life);
  }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t > parts[i].life) { scene.remove(parts[i].pts); parts[i].pts.geometry.dispose(); parts[i].pts.material.dispose(); parts.splice(i, 1); }
}

export function onWorldNet(m) {
  switch (m.t) {
    case 'world': applyWorld(m); return true;
    case 'fx':
      if (m.kind === 'fireworks') {
        for (let k = 0; k < 5; k++) setTimeout(() => { burst(m.x + (Math.random() - 0.5) * 6, m.y + 3 + Math.random() * 2, m.z + (Math.random() - 0.5) * 6, 120, [0xff3a3a, 0x3aff7a, 0x3a8aff, 0xffe03a, 0xff3aff], 9, 2.2, 0.35, 5); sfx.boom(0.4); }, k * 350);
      } else if (m.kind === 'confetti') burst(m.x, m.y + 2.5, m.z, 300, [0xff5050, 0x50ff80, 0x5080ff, 0xffe050, 0xff50ff, 0xffffff], 6, 4, 0.18, 3);
      else if (m.kind === 'boom') { burst(m.x, m.y + 0.8, m.z, 260, [0xffa030, 0xff5010, 0xffe080, 0x555555], 14, 1.4, 0.6, 9); sfx.boom(1); me.shake = 0.8; }
      return true;
    case 'knock':
      if (me.body) { me.body.vy = m.vy; me.body.onGround = false; me.knock = { vx: m.vx, vz: m.vz, t: 0.6 }; }
      return true;
    case 'say': showBanner(`${m.text}<br><small>— ${m.by}</small>`); setTimeout(hideBanner, 5000); sfx.beep(); return true;
    case 'rules': showBanner(`ПРАВИЛА РАУНДА<br><small>${m.text}</small>`); setTimeout(hideBanner, 9000); sfx.beep(); return true;
    case 'kicked': showBanner(`${m.text}`); S.kicked = true; return true;
  }
  return false;
}

// Батуты подбрасывают; используется физикой игрока
export function padUnder(x, y, z) {
  for (const rec of objs.values()) if (rec.o.kind === 'pad' && Math.hypot(rec.o.x - x, rec.o.z - z) < 1.2 && Math.abs(rec.o.y - y) < 0.4) return true;
  return false;
}
void map; void BR; void camera; void renderer;
