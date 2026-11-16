// Модели других игроков
import * as THREE from 'three';
import { $, clamp, lerpAngle } from '../core/util.js';
import { S } from '../core/state.js';
import { scene } from '../render/scene.js';
import { glowSprite, lam } from '../render/textures.js';

/* ============================ Персонажи ============================ */
function nameSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px Courier New'; g.textAlign = 'center';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(text, 128, 42);
  g.fillStyle = '#fff6b8'; g.fillText(text, 128, 42);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  s.scale.set(1.8, 0.45, 1); s.position.y = 2.2;
  return s;
}

const pivot = (x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); return p; };
export const limb = (len, rt, rb, mat, x, y, z, seg = 8) => {
  const p = pivot(x, y, z);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, seg), mat); m.position.y = -len / 2;
  p.add(m); return p;
};

const beamGeo = (() => { const g = new THREE.ConeGeometry(1.0, 6, 16, 1, true); g.translate(0, -3, 0); g.rotateX(-Math.PI / 2); return g; })();

export const remotes = new Map();
function makeAvatar(id, name) {
  const g = new THREE.Group(), parts = {};
  const col = new THREE.Color().setHSL((id * 0.37) % 1, 0.55, 0.46);
  const shirt = lam(col), pants = lam(0x2b2d3a), skin = lam(0xe8c8a0), hair = lam(0x2a1d14), shoe = lam(0x161616);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.66, 12), shirt); torso.position.y = 1.2;
  const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.25, 0.22, 12), pants); hip.position.y = 0.82;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skin); neck.position.y = 1.58;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 14), skin); head.position.y = 1.72;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); cap.position.y = 1.74; cap.rotation.x = -0.25;
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.02), lam(0x111111)); eyes.position.set(0, 1.74, 0.16);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.16), lam(0x4a5a3a)); pack.position.set(0, 1.2, -0.25);
  parts.armL = limb(0.62, 0.055, 0.045, shirt, -0.33, 1.46, 0); parts.armR = limb(0.62, 0.055, 0.045, shirt, 0.33, 1.46, 0);
  for (const a of [parts.armL, parts.armR]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skin); h.position.y = -0.64; a.add(h); }
  parts.legL = limb(0.76, 0.095, 0.075, pants, -0.12, 0.78, 0); parts.legR = limb(0.76, 0.095, 0.075, pants, 0.12, 0.78, 0);
  for (const l of [parts.legL, parts.legR]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.26), shoe); f.position.set(0, -0.76, 0.05); l.add(f); }
  // фонарик в правой руке + луч
  const torch = new THREE.Group();
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.2, 8), lam(0x222222)); tb.rotation.x = Math.PI / 2;
  const th = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.07, 8), lam(0x888888)); th.rotation.x = Math.PI / 2; th.position.z = 0.12;
  torch.add(tb, th); torch.position.set(0.35, 1.0, 0.18);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(0.35, 1.0, 0.25);
  const beamGlow = glowSprite(0xfff1c0, 0.9, 0.8); beamGlow.position.set(0.35, 1.0, 0.3);
  torch.visible = beam.visible = beamGlow.visible = false;
  parts.torch = torch; parts.beam = beam; parts.beamGlow = beamGlow;
  const tag = nameSprite(name);
  g.add(torso, hip, neck, head, cap, eyes, pack, parts.armL, parts.armR, parts.legL, parts.legR, torch, beam, beamGlow, tag);
  g.userData.nameTag = tag;
  g.userData.parts = parts;
  return g;
}

export function setPlayers(list) {
  const ids = new Set(list.map((p) => p.id));
  for (const p of list) {
    if (p.id === S.myId) continue;
    const r = remotes.get(p.id);
    if (r) {
      if (r.name !== p.name) { // ник сменился — перерисовать табличку
        r.mesh.remove(r.nameTag); r.nameTag.material.map.dispose(); r.nameTag.material.dispose();
        r.nameTag = nameSprite(p.name); r.mesh.add(r.nameTag);
      }
      r.name = p.name;
    }
    else {
      const mesh = makeAvatar(p.id, p.name);
      mesh.visible = false; scene.add(mesh);
      remotes.set(p.id, { mesh, parts: mesh.userData.parts, nameTag: mesh.userData.nameTag, x: 0, y: 0, z: 0, r: 0, tx: 0, ty: 0, tz: 0, tr: 0, crouch: false, name: p.name, seen: false, fl: false, walk: 0, wave: 0 });
    }
  }
  for (const [id, r] of remotes) if (!ids.has(id)) { scene.remove(r.mesh); remotes.delete(id); }
  $('players').innerHTML = list.map((p) => `<div><i style="background:hsl(${((p.id * 0.37) % 1) * 360},55%,52%)"></i>${p.id === S.myId ? p.name + ' <small>(вы)</small>' : p.name}</div>`).join('');
}

// Плавное движение и анимация ходьбы других игроков
export function updateRemotes(dt) {
  const k = 1 - Math.exp(-12 * dt);
  for (const r of remotes.values()) {
    r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; r.z += (r.tz - r.z) * k; r.r = lerpAngle(r.r, r.tr, k);
    const spd = Math.hypot(r.tx - r.x, r.tz - r.z) * k / Math.max(dt, 0.001);
    r.walk += dt * clamp(spd, 0, 7) * 2.1;
    const am = clamp(spd / 3.5, 0, 1), swg = Math.sin(r.walk) * 0.7 * am;
    r.parts.armL.rotation.x = swg; r.parts.armR.rotation.x = -swg * 0.4 - 0.9 * (r.fl ? 1 : 0);
    // жест-ответ на проверку: машет левой рукой; «сбой» — рука дёргается невпопад
    if (r.wave > 0) { r.wave -= dt; r.parts.armL.rotation.x = -2.6; r.parts.armL.rotation.z = Math.sin(r.wave * 14) * 0.5; }
    else if (r.wave < 0) { r.wave += dt; r.parts.armL.rotation.x = Math.random() * 3 - 1.5; r.parts.armL.rotation.z = Math.random() - 0.5; r.mesh.rotation.y += (Math.random() - 0.5) * 0.4; }
    else r.parts.armL.rotation.z = 0;
    r.parts.legL.rotation.x = -swg; r.parts.legR.rotation.x = swg;
    r.parts.torch.visible = r.parts.beam.visible = r.parts.beamGlow.visible = r.fl;
    r.mesh.position.set(r.x, r.y + Math.abs(Math.sin(r.walk)) * 0.04 * am, r.z);
    r.mesh.scale.y += ((r.crouch ? 0.6 : 1) - r.mesh.scale.y) * k; // присед
    r.mesh.rotation.y = r.r + Math.PI;
  }
}
