// Процедурные текстуры и простые материалы
import * as THREE from 'three';
import { renderer } from './scene.js';

/* ============================== Текстуры ============================== */
const TEXRES = 512;
export function makeTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = TEXRES;
  const g = c.getContext('2d');
  g.scale(TEXRES / size, TEXRES / size);
  draw(g, size);
  g.setTransform(1, 0, 0, 1, 0, 0);
  // мелкая «пористость» поверх всего: даёт глубину в бамп-карте
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.05)';
    g.fillRect(Math.random() * TEXRES, Math.random() * TEXRES, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
export function grain(g, s, amt) {
  const W = g.canvas.width;
  const im = g.getImageData(0, 0, W, W), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8;
  }
  g.putImageData(im, 0, 0);
}
export function stains(g, s, n, col, rmax = 60) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 10 + Math.random() * rmax;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
export function gridLines(g, s, step, col, w) {
  g.strokeStyle = col; g.lineWidth = w;
  for (let p = 0; p <= s; p += step) {
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
  }
}

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const glowTex = glowTexture();
export const glowSprite = (color, scale, opacity = 0.55) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity }));
  s.scale.set(scale, scale, 1);
  return s;
};
export const lam = (color, emissive = 0x000000) => new THREE.MeshLambertMaterial({ color, emissive });
export const basic = (color) => new THREE.MeshBasicMaterial({ color });

export function textPlane(draw, size = 1.3, transparent = true) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  draw(c.getContext('2d'), 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, transparent, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  return m;
}
