// Модели существ
import * as THREE from 'three';
import { clamp, lerpAngle } from '../core/util.js';
import { S, me } from '../core/state.js';
import { camera, scene } from '../render/scene.js';
import { basic, glowSprite, lam } from '../render/textures.js';
import { limb } from './avatars.js';

// Существа
export const mobEnts = [];
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
  } else if (type === 'skinstealer') {
    // Двойник без маски: слишком длинное бледное тело, на плечах — обрывки чужой одежды, лицо «сползает»
    const skin = lam(0xd9c8b8, 0x1a1008), rag = lam(0x55607a), red = lam(0x7a1010, 0x200000);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 1.6, 10), skin); torso.position.y = 1.9;
    const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.7, 10, 1, true), rag); cloth.position.y = 2.25; cloth.material.side = THREE.DoubleSide;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), skin); head.scale.set(0.9, 1.5, 0.9); head.position.set(0, 3.0, 0.05);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.02), red); mouth.position.set(0, 2.85, 0.24);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.02), basic(0x050505)); eyes.position.set(0, 3.15, 0.22);
    parts.armL = limb(2.2, 0.045, 0.025, skin, -0.3, 2.6, 0); parts.armR = limb(2.2, 0.045, 0.025, skin, 0.3, 2.6, 0);
    parts.legL = limb(1.2, 0.06, 0.04, skin, -0.12, 1.15, 0); parts.legR = limb(1.2, 0.06, 0.04, skin, 0.12, 1.15, 0);
    body.add(torso, cloth, head, mouth, eyes, parts.armL, parts.armR);
    g.add(body, parts.legL, parts.legR);
  } else if (type === 'drowner') {
    // Утопленник: раздутое бледное тело, длинные руки тянутся вперёд, волосы-водоросли
    const skin = lam(0x8fa79c, 0x0c1a14), dark = lam(0x2a3a30, 0x050a08);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), skin); torso.scale.set(1, 1.35, 0.85); torso.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), skin); head.position.set(0, 1.95, 0.08);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.02), basic(0xe8f0d0)); eyes.position.set(0, 1.98, 0.3);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.02), basic(0x050505)); mouth.position.set(0, 1.82, 0.3);
    for (let k = 0; k < 9; k++) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.005, 0.9, 4), dark); h.position.set((k - 4) * 0.05, 1.7, -0.12 + Math.abs(k - 4) * 0.02); h.rotation.x = 0.2; body.add(h); }
    parts.armL = limb(1.7, 0.07, 0.04, skin, -0.42, 1.55, 0.1); parts.armR = limb(1.7, 0.07, 0.04, skin, 0.42, 1.55, 0.1);
    parts.legL = limb(0.9, 0.1, 0.06, skin, -0.16, 0.8, 0); parts.legR = limb(0.9, 0.1, 0.06, skin, 0.16, 0.8, 0);
    body.add(torso, head, eyes, mouth, parts.armL, parts.armR);
    g.add(body, parts.legL, parts.legR);
  } else if (type === 'worm') {
    // Червь: сегментированное тело из труб, кольцо зубов вместо головы
    const flesh = lam(0x6a3a30, 0x140604), ring = lam(0xd8c8a8, 0x201810);
    parts.segs = [];
    for (let k = 0; k < 9; k++) {
      const sg = new THREE.Mesh(new THREE.SphereGeometry(0.42 - k * 0.025, 12, 10), flesh);
      sg.position.y = 0.3 + k * 0.38; body.add(sg); parts.segs.push(sg);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 16), ring); mouth.position.y = 3.75; mouth.rotation.x = Math.PI / 2;
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const t = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 4), ring); t.position.set(Math.cos(a) * 0.26, 3.7, Math.sin(a) * 0.26); t.rotation.x = Math.PI; body.add(t); }
    const throat = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14), basic(0x050000)); throat.rotation.x = -Math.PI / 2; throat.position.y = 3.76;
    body.add(mouth, throat);
    parts.armL = new THREE.Group(); parts.armR = new THREE.Group(); parts.legL = new THREE.Group(); parts.legR = new THREE.Group();
    g.add(body);
  } else if (type === 'crawler') {
    // Ползун: длинное тело параллельно полу на четырёх паучьих конечностях
    const skin = lam(0x2a2622, 0x080604), pale = lam(0xb8aa98, 0x1a1410);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 1.5, 10), skin); torso.rotation.x = Math.PI / 2; torso.position.set(0, 0.75, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), pale); head.position.set(0, 0.85, 0.85); head.scale.set(1, 0.8, 1.3);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.02), basic(0xffffff)); eyes.position.set(0, 0.9, 1.1);
    parts.armL = limb(1.1, 0.04, 0.025, skin, -0.2, 0.85, 0.55); parts.armR = limb(1.1, 0.04, 0.025, skin, 0.2, 0.85, 0.55);
    parts.legL = limb(1.1, 0.045, 0.03, skin, -0.2, 0.8, -0.6); parts.legR = limb(1.1, 0.045, 0.03, skin, 0.2, 0.8, -0.6);
    for (const l of [parts.armL, parts.armR, parts.legL, parts.legR]) l.rotation.z = l.position.x < 0 ? -0.7 : 0.7;
    body.add(torso, head, eyes);
    g.add(body, parts.armL, parts.armR, parts.legL, parts.legR);
  } else if (type === 'headlights') {
    // Фары: высокая худая фигура, вместо глаз — две слепящие фары и конусы света
    const black = lam(0x0a0a0c, 0x020202);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.5, 10), black); torso.position.y = 1.95;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.4), black); head.position.y = 2.95;
    parts.eyes = [];
    for (const ex of [-0.14, 0.14]) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.08, 14), basic(0xfff6d0)); e.position.set(ex, 2.97, 0.205); body.add(e);
      const gl = glowSprite(0xfff2c0, 1.4, 0.85); gl.position.set(ex, 2.97, 0.3); body.add(gl); parts.eyes.push(gl);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      cone.rotation.x = -Math.PI / 2; cone.position.set(ex, 2.95, 4.7); body.add(cone);
    }
    parts.armL = limb(1.9, 0.04, 0.03, black, -0.3, 2.6, 0); parts.armR = limb(1.9, 0.04, 0.03, black, 0.3, 2.6, 0);
    parts.legL = limb(1.3, 0.06, 0.04, black, -0.12, 1.25, 0); parts.legR = limb(1.3, 0.06, 0.04, black, 0.12, 1.25, 0);
    body.add(torso, head, parts.armL, parts.armR);
    g.add(body, parts.legL, parts.legR);
  } else if (type === 'bellhop' || type === 'mannequin' || type === 'doll') {
    // «Статуи»: Коридорный (высокий, в униформе), Манекен (гладкий белый), Кукла (маленькая, большая голова)
    const k = type === 'doll' ? 0.45 : type === 'bellhop' ? 1.25 : 1;
    const skin = type === 'mannequin' ? lam(0xe8e2d8, 0x18160f) : type === 'doll' ? lam(0xf0d8c8, 0x1a120c) : lam(0x1a1414, 0x050303);
    const cloth = type === 'bellhop' ? lam(0x7a1414, 0x1a0303) : type === 'doll' ? lam(0x8a5a9a, 0x100818) : skin;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * k, 0.17 * k, 0.75 * k, 12), cloth); torso.position.y = 1.25 * k;
    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * k, 0.19 * k, 0.25 * k, 12), cloth); hips.position.y = 0.85 * k;
    const headR = type === 'doll' ? 0.2 : 0.13;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR * k * (type === 'doll' ? 1.6 : 1), 16, 12), type === 'bellhop' ? lam(0xd8d0c0, 0x100c08) : skin);
    head.position.y = (1.82 + (type === 'doll' ? 0.15 : 0)) * k; head.scale.set(0.9, 1.15, 0.95);
    body.add(torso, hips, head);
    if (type === 'bellhop') {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * k, 0.13 * k, 0.12 * k, 12), cloth); cap.position.y = 2.0 * k;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2 * k, 0.1 * k), basic(0x050505)); face.position.set(0, 1.84 * k, 0.12 * k);
      for (let b = 0; b < 4; b++) { const bt = new THREE.Mesh(new THREE.SphereGeometry(0.018 * k, 6, 4), lam(0xd8b040, 0x302008)); bt.position.set(0, (1.05 + b * 0.12) * k, 0.2 * k); body.add(bt); }
      body.add(cap, face);
    } else if (type === 'doll') {
      for (const ex of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06 * k * 1.6, 10, 8), basic(0x101010)); e.position.set(ex * k * 1.6, 2.0 * k, 0.27 * k); body.add(e); }
    }
    parts.armL = limb((type === 'bellhop' ? 0.95 : 0.7) * k, 0.045 * k, 0.035 * k, skin, -0.25 * k, 1.58 * k, 0);
    parts.armR = limb((type === 'bellhop' ? 0.95 : 0.7) * k, 0.045 * k, 0.035 * k, skin, 0.25 * k, 1.58 * k, 0);
    parts.legL = limb(0.8 * k, 0.07 * k, 0.05 * k, cloth, -0.1 * k, 0.8 * k, 0); parts.legR = limb(0.8 * k, 0.07 * k, 0.05 * k, cloth, 0.1 * k, 0.8 * k, 0);
    body.add(parts.armL, parts.armR);
    g.add(body, parts.legL, parts.legR);
  } else if (type === 'specimen') {
    // Образец: бледная раздутая масса с щупальцами и множеством глаз
    const flesh = lam(0xc8b8b0, 0x281410), vein = lam(0x8a2020, 0x200000);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), flesh); torso.position.y = 1.2; torso.scale.set(1, 1.2, 0.9);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), flesh); head.position.set(0, 2.1, 0.2);
    for (let k = 0; k < 7; k++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), basic(0xffe060)); e.position.set(Math.sin(k * 1.7) * 0.25, 2.1 + Math.cos(k * 2.3) * 0.15, 0.48); body.add(e); }
    parts.tent = [];
    for (let k = 0; k < 6; k++) { const t = limb(1.2, 0.06, 0.02, vein, Math.cos(k) * 0.5, 1.4, Math.sin(k) * 0.4); body.add(t); parts.tent.push(t); }
    parts.armL = limb(1.4, 0.08, 0.05, flesh, -0.55, 1.6, 0.1); parts.armR = limb(1.4, 0.08, 0.05, flesh, 0.55, 1.6, 0.1);
    parts.legL = limb(0.9, 0.12, 0.08, flesh, -0.25, 0.85, 0); parts.legR = limb(0.9, 0.12, 0.08, flesh, 0.25, 0.85, 0);
    body.add(torso, head, parts.armL, parts.armR);
    g.add(body, parts.legL, parts.legR);
  } else if (type === 'teacher') {
    // Воспитательница: очень высокая женщина в длинном платье, вытянутая шея, барабан на поясе
    const dress = lam(0x2a3a5a, 0x05080e), skin = lam(0xe8d0c0, 0x1a100c);
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.7, 14, 1, true), dress); skirt.position.y = 0.85; skirt.material.side = THREE.DoubleSide;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.9, 12), dress); torso.position.y = 2.1;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 8), skin); neck.position.y = 2.9;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), skin); head.position.y = 3.4; head.scale.set(0.9, 1.2, 0.95);
    const smile = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), basic(0x501010)); smile.position.set(0, 3.33, 0.16);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), lam(0x1a1210)); hair.position.y = 3.45;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 16), lam(0xc83030, 0x200404)); drum.position.set(0.4, 1.7, 0.2); drum.rotation.z = Math.PI / 2;
    parts.armL = limb(1.6, 0.04, 0.03, skin, -0.25, 2.5, 0); parts.armR = limb(1.6, 0.04, 0.03, skin, 0.25, 2.5, 0);
    parts.legL = new THREE.Group(); parts.legR = new THREE.Group();
    body.add(skirt, torso, neck, head, smile, hair, drum, parts.armL, parts.armR);
    g.add(body);
  } else if (type === 'overseer') {
    // Надсмотрщик: огромная фигура в фартуке и сварочной маске, светящаяся грудь-топка
    const iron = lam(0x2a2622, 0x080604), skin = lam(0x5a4034, 0x100804);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 0.8), skin); torso.position.y = 2.6;
    const apron = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.05), lam(0x3a2a1a)); apron.position.set(0, 2.2, 0.43);
    const furnace = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), basic(0xff7020)); furnace.position.set(0, 2.8, 0.46);
    const fglow = glowSprite(0xff8030, 2.6, 0.7); fglow.position.set(0, 2.8, 0.7);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.65, 0.55), iron); mask.position.y = 3.7;
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.02), basic(0xff9040)); slit.position.set(0, 3.75, 0.28);
    parts.armL = limb(1.9, 0.18, 0.14, skin, -0.8, 3.2, 0); parts.armR = limb(1.9, 0.18, 0.14, skin, 0.8, 3.2, 0);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.35), iron); hammer.position.set(0, -2.0, 0); parts.armR.add(hammer);
    parts.legL = limb(1.85, 0.22, 0.17, iron, -0.35, 1.85, 0); parts.legR = limb(1.85, 0.22, 0.17, iron, 0.35, 1.85, 0);
    parts.glow = fglow;
    body.add(torso, apron, furnace, fglow, mask, slit, parts.armL, parts.armR);
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
// Оставить только первые n существ
export function ensureMobs(n) {
  while (mobEnts.length > n) scene.remove(mobEnts.pop().group);
}
// Существо с номером i нужного типа (модель пересоздаётся, если тип сменился)
export function ensureMob(i, type) {
  while (mobEnts.length <= i) mobEnts.push(makeMob(type));
  if (mobEnts[i].type !== type) { scene.remove(mobEnts[i].group); mobEnts[i] = makeMob(type); }
  return mobEnts[i];
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
    if (mo.type === 'worm') {
      // извивается, «вырастая» из пола
      mo.parts.segs.forEach((sg, k) => { sg.position.x = Math.sin(S.time * 3 + k * 0.7) * 0.12 * k * 0.3; sg.position.z = Math.cos(S.time * 2.4 + k * 0.6) * 0.08 * k * 0.3; });
      mo.group.rotation.z = Math.sin(S.time * 1.7) * 0.06;
    } else if (mo.type === 'crawler') {
      const c = Math.sin(mo.walk * 2) * 0.5 * amp;
      mo.parts.armL.rotation.x = -1.1 + c; mo.parts.armR.rotation.x = -1.1 - c; mo.parts.legL.rotation.x = 1.1 - c; mo.parts.legR.rotation.x = 1.1 + c;
      mo.group.rotation.z = 0; mo.parts.body.position.y = Math.abs(Math.sin(mo.walk * 2)) * 0.05;
      continue_common(mo);
      continue;
    } else if (mo.type === 'headlights') {
      const fl = mo.chase ? 1 : 0.7 + Math.sin(S.time * 0.8) * 0.05;
      for (const e of mo.parts.eyes) e.material.opacity = fl;
      mo.parts.armL.rotation.x = sw * 0.4; mo.parts.armR.rotation.x = -sw * 0.4;
    } else if (mo.type === 'specimen') {
      mo.parts.tent.forEach((t, k) => { t.rotation.x = Math.sin(S.time * 2.5 + k) * 0.6; t.rotation.z = Math.cos(S.time * 2 + k * 1.3) * 0.6; });
      mo.parts.armL.rotation.x = sw - 0.4; mo.parts.armR.rotation.x = -sw - 0.4;
    } else if (mo.type === 'teacher') {
      mo.parts.armL.rotation.x = -0.2 + Math.sin(S.time * (mo.chase ? 9 : 1.5)) * (mo.chase ? 0.6 : 0.1); mo.parts.armR.rotation.x = -0.2 - Math.sin(S.time * (mo.chase ? 9 : 1.5)) * (mo.chase ? 0.6 : 0.1);
      mo.parts.body.position.y = Math.abs(Math.sin(mo.walk)) * 0.05;
    } else if (mo.type === 'overseer') {
      mo.parts.armL.rotation.x = sw * 0.5; mo.parts.armR.rotation.x = -sw * 0.5 - (mo.chase ? 0.6 : 0);
      mo.parts.glow.material.opacity = 0.55 + Math.sin(S.time * 5) * 0.15;
      mo.group.scale.setScalar(1.15);
    } else if (mo.type === 'drowner') {
      mo.parts.armL.rotation.x = -1.4 + Math.sin(S.time * 2.2) * 0.25; mo.parts.armR.rotation.x = -1.4 + Math.cos(S.time * 2.2) * 0.25;
      mo.parts.body.rotation.x = 0.5;
      mo.group.rotation.z = Math.sin(S.time * 1.1) * 0.08;
    } else if (run) {
      mo.group.rotation.z = 0;
      mo.parts.body.rotation.x = 0.35 + 0.25 * amp + Math.sin(mo.walk * 2) * 0.05;
      mo.parts.body.position.y = Math.abs(Math.sin(mo.walk)) * 0.12 * amp;
      mo.parts.armL.rotation.x = -sw * 1.1 - 0.5; mo.parts.armR.rotation.x = sw * 1.1 - 0.5;
    } else {
      mo.group.rotation.z = Math.sin(S.time * 1.3) * 0.03;
      mo.parts.armL.rotation.x = sw; mo.parts.armR.rotation.x = -sw;
    }
    mo.parts.legL.rotation.x = -sw * 0.8; mo.parts.legR.rotation.x = sw * 0.8;
    continue_common(mo);
  }
  for (const mo of mobEnts) if (mo.seen && !mo.stun) mobDist = Math.min(mobDist, Math.hypot(mo.x - camera.position.x, (mo.y + 1.6 - camera.position.y) * 2, mo.z - camera.position.z)); // слышно «ушами» камеры (и зрителю)
  return mobDist;
}
// Общее для всех: невидим, если оглушён или прячется (Червь в трубах, Утопленник без воды)
function continue_common(mo) { mo.group.visible = !mo.stun; }
