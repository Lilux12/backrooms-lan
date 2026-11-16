import * as THREE from './three.module.min.js';

const BR = window.BR;
const { TILE, N, LEVELS } = BR;
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function lerpAngle(a, b, k) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * k;
}

const settings = Object.assign({ sens: 1, fov: 75, vol: 0.85, br: 1, q: 1 }, (() => { try { return JSON.parse(localStorage.getItem('br_set') || '{}'); } catch (e) { return {}; } })());
const saveSettings = () => { try { localStorage.setItem('br_set', JSON.stringify(settings)); } catch (e) { /* ok */ } };

/* =============================== Сцена =============================== */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
function applyQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio * settings.q, 2.2));
  renderer.setSize(innerWidth, innerHeight);
}
applyQuality();
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.03);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 120);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(0.6, 1, 0.3);
const lamp = new THREE.PointLight(0xffffff, 4.6, 36, 1); // «фонарь» чуть позади камеры
lamp.position.set(0, 0.1, 1.0);
camera.add(lamp);
scene.add(hemi, sun);

// Фонарик (F): конус света из руки
const torch = new THREE.SpotLight(0xfff1cc, 0, 70, 0.4, 0.7, 1.1);
torch.position.set(0.14, -0.14, 0.15);
camera.add(torch, torch.target);
torch.target.position.set(0.05, -0.12, -10);
const FL = { on: false, bat: 1, k: 0 };

// Пылинки в воздухе
const DUST_N = 320, DUST_R = 10;
const dustPos = new Float32Array(DUST_N * 3), dustVel = [];
for (let i = 0; i < DUST_N; i++) {
  dustPos[i * 3] = rand(-DUST_R, DUST_R); dustPos[i * 3 + 1] = rand(0, 3.4); dustPos[i * 3 + 2] = rand(-DUST_R, DUST_R);
  dustVel.push([rand(-0.05, 0.05), rand(-0.03, 0.04), rand(-0.05, 0.05)]);
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.05, color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
dust.frustumCulled = false;
scene.add(dust);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ============================== Текстуры ============================== */
const TEXRES = 512;
function makeTex(size, draw, rx = 1, ry = 1) {
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
function grain(g, s, amt) {
  const W = g.canvas.width;
  const im = g.getImageData(0, 0, W, W), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8;
  }
  g.putImageData(im, 0, 0);
}
function stains(g, s, n, col, rmax = 60) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 10 + Math.random() * rmax;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
function gridLines(g, s, step, col, w) {
  g.strokeStyle = col; g.lineWidth = w;
  for (let p = 0; p <= s; p += step) {
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
  }
}

const FULL = N * TILE;
// Стили уровней: цвет тумана, свет, форма ламп, текстуры, звуковая атмосфера
const STYLES = {
  yellow: {
    fog: 0x6e6226, fogD: 0.03, hemi: [0xfff0b0, 0x6b5a20, 1.7], sun: [0xfff4c8, 1.2], lamp: [0xffefb0, 4.6],
    panel: { c: [1, 0.96, 0.78], size: 1.5, test: (x, y, h) => (x + y) % 2 === 0 && h > 0.12 },
    flick: [5, 16], hum: [60, 120, 180, 240], amb: null, fr: FULL / 3, cr: FULL / 2,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#c9b85a'; g.fillRect(0, 0, s, s);
        for (let x = 0; x < s; x += 16) { g.fillStyle = 'rgba(120,100,25,.35)'; g.fillRect(x, 0, 6, s); }
        stains(g, s, 6, 'rgba(90,70,15,.25)');
        g.fillStyle = 'rgba(70,55,15,.55)'; g.fillRect(0, s - 34, s, 34);
        g.fillStyle = 'rgba(40,30,8,.7)'; g.fillRect(0, s - 36, s, 3);
        grain(g, s, 22);
      }),
      floor: makeTex(256, (g, s) => {
        g.fillStyle = '#8b7a35'; g.fillRect(0, 0, s, s);
        for (let i = 0; i < 1800; i++) {
          g.fillStyle = `rgba(${60 + Math.random() * 60},${50 + Math.random() * 50},15,.35)`;
          g.fillRect(Math.random() * s, Math.random() * s, 2, 2 + Math.random() * 3);
        }
        stains(g, s, 5, 'rgba(50,35,5,.3)'); grain(g, s, 40);
      }, FULL / 3, FULL / 3),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#b9af88'; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(70,62,35,.8)'; g.lineWidth = 4;
        g.strokeRect(0, 0, s, s); g.strokeRect(s / 2, 0, 0, s); g.strokeRect(0, s / 2, s, 0);
        stains(g, s, 3, 'rgba(90,70,20,.22)'); grain(g, s, 18);
      }, FULL / 2, FULL / 2),
    }),
  },
  concrete: {
    fog: 0x1b1e22, fogD: 0.042, hemi: [0x9fb0c4, 0x2d3036, 1.2], sun: [0xdfe6f0, 0.55], lamp: [0xcfe0ff, 5.2],
    panel: { c: [0.82, 0.92, 1], size: 1.3, test: (x, y, h) => x % 4 === 2 && y % 4 === 2 && h > 0.28 },
    flick: [2.5, 8], hum: [50, 100, 150, 50], amb: 'rumble', fr: FULL / 4, cr: FULL / 4,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#6e7176'; g.fillRect(0, 0, s, s);
        for (let x = 0; x < s; x += 64) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 3, s); }
        stains(g, s, 9, 'rgba(15,15,15,.3)');
        g.fillStyle = '#b8a02a'; g.fillRect(0, s - 34, s, 16);
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, s - 18, s, 18);
        grain(g, s, 30);
      }),
      floor: makeTex(256, (g, s) => {
        g.fillStyle = '#4b4d51'; g.fillRect(0, 0, s, s);
        g.fillStyle = 'rgba(210,200,90,.5)'; g.fillRect(0, 0, s, 7);
        stains(g, s, 6, 'rgba(10,10,10,.4)', 40);
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          g.beginPath(); let x = Math.random() * s, y = Math.random() * s; g.moveTo(x, y);
          for (let k = 0; k < 6; k++) { x += rand(-25, 25); y += rand(-25, 25); g.lineTo(x, y); }
          g.stroke();
        }
        grain(g, s, 36);
      }, FULL / 4, FULL / 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#3a3c40'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#2a2c2f'; g.fillRect(0, 0, s, 26);
        g.fillStyle = '#5c6065'; g.fillRect(0, 100, s, 10);
        stains(g, s, 5, 'rgba(0,0,0,.35)'); grain(g, s, 20);
      }, FULL / 4, FULL / 4),
    }),
  },
  tunnel: {
    fog: 0x1a0b08, fogD: 0.045, hemi: [0xff6a4a, 0x3a1710, 1.6], sun: [0xff8060, 0.8], lamp: [0xff9070, 5.6],
    panel: { c: [1, 0.12, 0.06], size: 0.7, test: (x, y, h) => (x + y) % 3 === 0 && h > 0.2 },
    flick: [3, 9], pulse: true, hum: [40, 80, 160, 120], amb: 'clang', fr: FULL / 3, cr: FULL / 3,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#4e4036'; g.fillRect(0, 0, s, s);
        stains(g, s, 8, 'rgba(150,70,20,.32)');
        for (const [y0, y1] of [[56, 100], [150, 178]]) {
          const gr = g.createLinearGradient(0, y0, 0, y1);
          gr.addColorStop(0, '#2c2c2c'); gr.addColorStop(0.5, '#8a8a86'); gr.addColorStop(1, '#2c2c2c');
          g.fillStyle = gr; g.fillRect(0, y0, s, y1 - y0);
        }
        g.fillStyle = '#1c1c1c';
        for (let x = 8; x < s; x += 16) { g.beginPath(); g.arc(x, 122, 2.5, 0, 7); g.fill(); }
        grain(g, s, 26);
      }),
      floor: makeTex(256, (g, s) => {
        g.fillStyle = '#262626'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 32, 'rgba(130,130,130,.5)', 3);
        stains(g, s, 5, 'rgba(120,60,20,.25)', 40); grain(g, s, 30);
      }, FULL / 3, FULL / 3),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#1e1e1e'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#2d2d2d'; g.fillRect(0, 0, s, 30); g.fillRect(0, 128, s, 14);
        grain(g, s, 18);
      }, FULL / 3, FULL / 3),
    }),
  },
  pool: {
    fog: 0x6fb7c4, fogD: 0.028, hemi: [0xe6ffff, 0x4a9aa8, 1.9], sun: [0xffffff, 1.0], lamp: [0xe0ffff, 3.6],
    panel: { c: [0.85, 1, 1], size: 1.6, test: (x, y) => (x + y) % 2 === 0 },
    flick: [22, 40], hum: [55, 110, 220, 330], amb: 'drip', fr: FULL / 4, cr: FULL / 4,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#d6ecee'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#3f9eb0'; g.fillRect(0, s * 0.66, s, s * 0.34);
        gridLines(g, s, 32, 'rgba(100,150,160,.7)', 2);
        stains(g, s, 4, 'rgba(60,120,130,.2)'); grain(g, s, 14);
      }),
      floor: makeTex(256, (g, s) => {
        g.fillStyle = '#3aa3b2'; g.fillRect(0, 0, s, s);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; g.fillRect(Math.floor(Math.random() * 8) * 32, Math.floor(Math.random() * 8) * 32, 32, 32); }
        gridLines(g, s, 32, 'rgba(205,239,242,.9)', 3); grain(g, s, 16);
      }, FULL / 4, FULL / 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#e2f1f3'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 64, 'rgba(150,185,190,.9)', 3); grain(g, s, 12);
      }, FULL / 4, FULL / 4),
    }),
  },
  run: {
    fog: 0x4a615a, fogD: 0.036, hemi: [0xd8f4ea, 0x35453f, 1.55], sun: [0xe6fff4, 0.7], lamp: [0xd6ffee, 4.8],
    panel: { c: [0.8, 1, 0.92], size: 1.4, test: (x, y, h) => (x + 2 * y) % 3 === 0 && h > 0.05 },
    flick: [1.2, 4.5], pulse: true, hum: [50, 100, 150, 300], amb: 'crackle', step: 520, fr: FULL / 3, cr: FULL / 3,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#d4dad1'; g.fillRect(0, 0, s, s);
        stains(g, s, 6, 'rgba(90,100,70,.22)');
        g.fillStyle = '#4f8a78'; g.fillRect(0, s * 0.46, s, s * 0.54);
        gridLines(g, s, 32, 'rgba(20,50,40,.45)', 1.5);
        g.fillStyle = '#e9efe6'; g.fillRect(0, s * 0.46 - 6, s, 8);
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, s * 0.46 + 2, s, 3);
        // скол плитки, подтёки и следы
        for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(Math.random() * s, s * 0.5 + Math.random() * s * 0.45, 8 + Math.random() * 18, 4 + Math.random() * 8); }
        g.strokeStyle = 'rgba(110,8,8,.55)'; g.lineCap = 'round';
        for (let i = 0; i < 3; i++) { const x = Math.random() * s; g.lineWidth = 2 + Math.random() * 4; g.beginPath(); g.moveTo(x, 30 + Math.random() * 60); g.lineTo(x + rand(-6, 6), 120 + Math.random() * 120); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,.38)'; g.fillRect(0, s - 14, s, 14);
        grain(g, s, 20);
      }),
      floor: makeTex(256, (g, s) => {
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#b4bbae' : '#c6ccc0'; g.fillRect(x * 64, y * 64, 64, 64); }
        gridLines(g, s, 64, 'rgba(40,50,40,.55)', 2);
        stains(g, s, 7, 'rgba(30,36,26,.28)', 50);
        stains(g, s, 2, 'rgba(110,10,8,.45)', 28);
        g.strokeStyle = 'rgba(30,30,30,.25)'; g.lineWidth = 3;
        for (let i = 0; i < 6; i++) { g.beginPath(); const x = Math.random() * s, y = Math.random() * s; g.moveTo(x, y); g.quadraticCurveTo(x + rand(-40, 40), y + rand(-40, 40), x + rand(-60, 60), y + rand(-60, 60)); g.stroke(); }
        grain(g, s, 26);
      }, FULL / 4, FULL / 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#c9cec5'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 128, 'rgba(60,66,58,.7)', 4);
        for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(60,66,58,.35)'; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
        stains(g, s, 4, 'rgba(120,100,40,.22)'); grain(g, s, 14);
      }, FULL / 4, FULL / 4),
    }),
  },
  office: {
    fog: 0x3f4637, fogD: 0.036, hemi: [0xe0ecd0, 0x40483a, 1.5], sun: [0xeaf0dc, 0.9], lamp: [0xf0f4d8, 4.4],
    panel: { c: [0.9, 1, 0.85], size: 1.2, test: (x, y, h) => x % 2 === 0 && y % 2 === 0 && h > 0.2 },
    flick: [2, 7], hum: [60, 120, 180, 360], amb: 'crackle', fr: FULL / 4, cr: FULL / 4,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#bdb7a0'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#8b856f'; g.fillRect(0, s - 64, s, 64);
        g.fillStyle = 'rgba(40,36,24,.6)'; g.fillRect(0, s - 66, s, 3);
        stains(g, s, 5, 'rgba(80,70,40,.18)'); grain(g, s, 20);
      }),
      floor: makeTex(256, (g, s) => {
        g.fillStyle = '#59604f'; g.fillRect(0, 0, s, s);
        for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() * 60},${Math.random() * 70},${Math.random() * 40},.3)`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
        gridLines(g, s, 64, 'rgba(0,0,0,.2)', 2); stains(g, s, 4, 'rgba(20,20,10,.3)', 40); grain(g, s, 30);
      }, FULL / 4, FULL / 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#cfcbbc'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 128, 'rgba(80,75,60,.7)', 4); stains(g, s, 3, 'rgba(100,90,40,.2)'); grain(g, s, 14);
      }, FULL / 4, FULL / 4),
    }),
  },
};

const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
const LIGHT = { fogD: 0.03, hemi: 1.7, sun: 1.2, lamp: 4.6, fog: new THREE.Color(0x000000), flick: [5, 16], pulse: false, panel: [1, 1, 1] };
let curStyle = null, mats = null;

function applyStyle(name) {
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

/* ============================== Мир ============================== */
let map = null, world = null, H = 3.2, curLevel = 0;
const objs = new Map(); // id -> {o, group, parts}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const glowTex = glowTexture();
const glowSprite = (color, scale, opacity = 0.55) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity }));
  s.scale.set(scale, scale, 1);
  return s;
};
const lam = (color, emissive = 0x000000) => new THREE.MeshLambertMaterial({ color, emissive });
const basic = (color) => new THREE.MeshBasicMaterial({ color });

function textPlane(draw, size = 1.3, transparent = true) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  draw(c.getContext('2d'), 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, transparent, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  return m;
}

let arrowMat = null;
function getArrowMat() {
  if (arrowMat) return arrowMat;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(70,255,140,.95)';
  g.beginPath(); g.moveTo(64, 6); g.lineTo(118, 62); g.lineTo(86, 62); g.lineTo(86, 120); g.lineTo(42, 120); g.lineTo(42, 62); g.lineTo(10, 62); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,70,30,.9)'; g.lineWidth = 5; g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (arrowMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
}
const LEVER_COL = [0xd43a2f, 0x2f6fd4, 0x2fb34a, 0xe8c02a];

function createObj(o) {
  const grp = new THREE.Group();
  const rec = { o, group: grp, parts: {} };
  switch (o.kind) {
    case 'water': {
      const glass = new THREE.MeshLambertMaterial({ color: 0xbfefff, emissive: 0x2a7c8c, transparent: true, opacity: 0.9 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 12), glass);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 0.1, 12), glass); neck.position.y = 0.22;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), lam(0xffffff, 0x888888)); cap.position.y = 0.3;
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.103, 0.103, 0.12, 12), lam(0xffd36a, 0x6a4a10)); label.position.y = -0.02;
      grp.add(body, neck, cap, label, glowSprite(0x80e0ff, 1.3, 0.5));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'fuse': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 10), lam(0xe8e0d0, 0x403828));
      const capA = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10), lam(0xc0a060, 0x604818)); capA.position.y = 0.17;
      const capB = capA.clone(); capB.position.y = -0.17;
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), basic(0xff8a30));
      grp.add(body, capA, capB, wire, glowSprite(0xffa030, 1.6, 0.6));
      grp.rotation.z = Math.PI / 2;
      grp.position.set(o.x, 0.9, o.z); rec.bob = true;
      break;
    }
    case 'box': {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.5), lam(0x4a5058));
      cab.position.y = 0.9;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      screen.position.set(0, 1.4, 0.26);
      const slots = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.05), lam(0x23272b)); slots.position.set(0, 0.9, 0.26);
      grp.add(cab, screen, slots);
      grp.position.set(o.x, 0, o.z);
      rec.parts.screen = screen; rec.face = true;
      break;
    }
    case 'digit': {
      const m = textPlane((g, s) => {
        g.clearRect(0, 0, s, s);
        g.fillStyle = 'rgba(180,15,10,.92)'; g.font = 'bold 190px "Courier New"'; g.textAlign = 'center';
        g.fillText(String(o.digit), 128, 175);
        g.fillRect(100, 188, 8, 28); g.fillRect(150, 192, 6, 40); // потёки
        g.font = 'bold 30px "Courier New"'; g.fillStyle = 'rgba(180,15,10,.8)';
        g.fillText(`${o.idx + 1} / 4`, 128, 240);
      });
      m.position.set(o.x, 1.6, o.z);
      m.rotation.y = Math.atan2(o.nx, o.nz);
      m.rotation.z = rand(-0.08, 0.08);
      grp.add(m);
      break;
    }
    case 'note': {
      const m = textPlane((g, s) => {
        g.save(); g.translate(128, 128); g.rotate(0.05);
        g.fillStyle = '#e9e2c6'; g.fillRect(-90, -110, 180, 220);
        g.fillStyle = 'rgba(40,34,18,.7)';
        for (let i = 0; i < 9; i++) g.fillRect(-70, -85 + i * 22, 100 + ((i * 37) % 40), 4);
        g.fillStyle = '#b83a2a'; g.fillRect(-60, 100 - 12, 40, 4);
        g.restore();
      }, 0.9);
      m.position.set(o.x, 1.5, o.z);
      m.rotation.y = Math.atan2(o.nx, o.nz);
      grp.add(m, glowSprite(0xfff0b0, 1.3, 0.25));
      grp.children[1].position.set(o.x, 1.5, o.z);
      break;
    }
    case 'keypad': {
      const door = G.doorObj || { dx: 0, dz: 1 };
      const px = -door.dz, pz = door.dx; // сбоку от прохода
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.25, 0.35), lam(0x2a2f35));
      stand.position.y = 0.62;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      screen.position.set(0, 1.0, 0.18);
      grp.add(stand, screen);
      grp.position.set(o.x + px * 1.35, 0, o.z + pz * 1.35);
      grp.rotation.y = Math.atan2(-px, -pz);
      rec.parts.screen = screen;
      break;
    }
    case 'plate': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 1.9), lam(0x3a3d42));
      base.position.y = 0.05;
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.5), new THREE.MeshLambertMaterial({ color: 0x884422, emissive: 0x331100 }));
      top.position.y = 0.07;
      grp.add(base, top);
      grp.position.set(o.x, 0, o.z);
      rec.parts.top = top;
      rec.glow = glowSprite(0x40ff70, 3.4, 0.0); rec.glow.position.y = 0.4; grp.add(rec.glow);
      break;
    }
    case 'lever': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.5), lam(0x4a4f55)); base.position.y = 0.45;
      const arm = new THREE.Group(); arm.position.set(0, 0.95, 0);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), lam(0xb0b4b8)); stick.position.y = 0.4;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), lam(LEVER_COL[o.col], LEVER_COL[o.col] & 0x555555)); knob.position.y = 0.82;
      arm.add(stick, knob); arm.rotation.z = 0.9;
      const lampM = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0x661010 }));
      lampM.position.set(0, 0.75, 0.26);
      grp.add(base, arm, lampM, glowSprite(LEVER_COL[o.col], 1.4, 0.35));
      grp.children[3].position.y = 1.6;
      grp.position.set(o.x, 0, o.z);
      rec.parts.arm = arm; rec.parts.lampM = lampM; rec.face = true;
      break;
    }
    case 'mapitem': {
      const paper = new THREE.Group();
      const sheet = bx(0.56, 0.03, 0.42, lam(0xe6dcb8, 0x4a4228));
      const face = textPlane((g, s) => {
        g.fillStyle = '#e6dcb8'; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(40,90,150,.8)'; g.lineWidth = 3;
        for (let p = 16; p < s; p += 32) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); }
        g.strokeStyle = '#1b2a40'; g.lineWidth = 9; g.beginPath(); g.moveTo(30, 200); g.lineTo(30, 70); g.lineTo(130, 70); g.lineTo(130, 150); g.lineTo(220, 150); g.stroke();
        g.fillStyle = '#c52a1e'; g.font = 'bold 70px "Courier New"'; g.fillText('X', 168, 112);
      }, 0.5, false);
      face.rotation.x = -Math.PI / 2; face.position.y = 0.02; face.scale.y = 0.75;
      paper.add(sheet, face); paper.rotation.x = 0.35;
      grp.add(paper, glowSprite(0x7fc0ff, 2.4, 0.5), glowSprite(0xffe090, 1.2, 0.5));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'arrow': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), getArrowMat());
      m.rotation.x = -Math.PI / 2;
      grp.add(m);
      grp.position.set(o.x, 0.03, o.z);
      grp.rotation.y = Math.atan2(-o.dx, -o.dz);
      break;
    }
    case 'door': {
      G.doorObj = o;
      const alongX = o.dx !== 0;
      const slabH = Math.min(H - 0.25, 3.0);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.4 : 3.4, slabH, alongX ? 3.4 : 0.4), lam(0x30343a));
      slab.position.set(-o.dx * (TILE / 2 - 0.25), slabH / 2, -o.dz * (TILE / 2 - 0.25));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.45 : 3.0, 0.2, alongX ? 3.0 : 0.45), lam(0xb8a02a));
      stripe.position.copy(slab.position); stripe.position.y = slabH * 0.55;
      const sign = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.1 : 1.3, 0.28, alongX ? 1.3 : 0.1), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
      sign.position.set(-o.dx * (TILE / 2 - 0.5), Math.min(H - 0.15, 3.2), -o.dz * (TILE / 2 - 0.5));
      const portal = textPlane((g, s) => {
        const gr = g.createRadialGradient(128, 128, 10, 128, 128, 140);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(190,255,215,.9)'); gr.addColorStop(1, 'rgba(120,255,170,.6)');
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
      }, TILE - 0.2, false);
      portal.material.fog = false; portal.scale.y = H / (TILE - 0.2);
      portal.position.set(o.dx * (TILE / 2 - 0.05), H / 2, o.dz * (TILE / 2 - 0.05));
      portal.rotation.y = Math.atan2(-o.dx, -o.dz);
      portal.visible = false;
      const plight = new THREE.PointLight(0xbfffd0, 0, 24, 1.2); plight.position.set(-o.dx * 0.5, 1.6, -o.dz * 0.5);
      grp.add(slab, stripe, sign, portal, plight);
      grp.position.set(o.x, 0, o.z);
      rec.parts = { slab, stripe, sign, portal, plight };
      break;
    }
  }
  if (rec.face) grp.rotation.y = rec.o.kind === 'box' ? Math.atan2(G.spawnDirX || 1, G.spawnDirZ || 0) : 0;
  refreshObj(rec);
  return rec;
}

function refreshObj(rec) {
  const o = rec.o, p = rec.parts;
  if (o.kind === 'plate') {
    p.top.material.color.setHex(o.on ? 0x30d060 : 0x884422);
    p.top.material.emissive.setHex(o.on ? 0x106020 : 0x331100);
    rec.glow.material.opacity = o.on ? 0.55 : 0;
    p.top.position.y = o.on ? 0.03 : 0.07;
  } else if (o.kind === 'lever') {
    p.arm.rotation.z = o.on ? -0.9 : 0.9;
    p.lampM.material.color.setHex(o.on ? 0x30ff60 : 0x661010);
  } else if (o.kind === 'door') {
    p.slab.visible = p.stripe.visible = !o.open;
    p.portal.visible = !!o.open;
    p.sign.material.color.setHex(o.open ? 0x20ff60 : 0xff2010);
    p.plight.intensity = o.open ? 7 : 0;
    if (map) BR.setDoor(map, !!o.open);
  }
}

/* ============================ Мебель и детали ============================ */
const PM = {};
const pm = (name, color, emissive = 0x000000) => PM[name] || (PM[name] = new THREE.MeshLambertMaterial({ color, emissive }));
const bx = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cy = (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); return m; };

function buildProp(kind) {
  const g = new THREE.Group();
  switch (kind) {
    case 'chair': {
      const pl = pm('chair', 0x3d6479), mt = pm('chromium', 0x9aa0a4);
      g.add(bx(0.46, 0.05, 0.46, pl, 0, 0.46, 0), bx(0.46, 0.46, 0.05, pl, 0, 0.74, -0.2));
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.add(cy(0.018, 0.018, 0.46, mt, x, 0.23, z, 6));
      g.rotation.z = 0.04;
      break;
    }
    case 'cabinet': {
      const body = pm('cab', 0xb4bdb9), dk = pm('cabdark', 0x2a302f), rust = pm('cabrust', 0x6b5a48);
      g.add(bx(1.5, 1.7, 0.6, body, 0, 0.85, 0), bx(1.54, 0.05, 0.64, dk, 0, 1.72, 0));
      g.add(bx(0.02, 1.5, 0.02, dk, 0, 0.85, 0.31));
      for (const sx of [-0.7, 0.7]) g.add(bx(0.06, 0.4, 0.04, rust, sx * 0.5, 1.0, 0.32));
      for (let i = 0; i < 4; i++) g.add(bx(0.66, 0.02, 0.01, dk, -0.37, 0.35 + i * 0.4, 0.305), bx(0.66, 0.02, 0.01, dk, 0.37, 0.35 + i * 0.4, 0.305));
      g.add(bx(0.3, 0.02, 0.4, pm('paper', 0xe8e4d0), 0.3, 1.74, 0.05));
      break;
    }
    case 'mattress': {
      const m = pm('mattress', 0xb9b49a), st = pm('mstain', 0x6d5a3a), fr = pm('mframe', 0x3b3f42);
      g.add(bx(1.9, 0.14, 0.86, fr, 0, 0.18, 0), bx(1.9, 0.2, 0.9, m, 0, 0.35, 0));
      g.add(bx(0.5, 0.215, 0.5, st, 0.35, 0.352, 0.02), bx(0.3, 0.215, 0.3, pm('mstain2', 0x501a14), -0.4, 0.352, -0.1));
      g.add(cy(0.03, 0.03, 0.2, fr, -0.9, 0.1, -0.35, 6), cy(0.03, 0.03, 0.2, fr, 0.9, 0.1, 0.35, 6), cy(0.03, 0.03, 0.2, fr, -0.9, 0.1, 0.35, 6), cy(0.03, 0.03, 0.2, fr, 0.9, 0.1, -0.35, 6));
      g.rotation.z = 0.03;
      break;
    }
    case 'gurney': {
      const w = pm('gwhite', 0xd8dcd6), gr = pm('ggreen', 0x7aa595), ch = pm('chromium', 0x9aa0a4), bl = pm('gblood', 0x6e0f0c);
      g.add(bx(1.9, 0.07, 0.72, w, 0, 0.88, 0), bx(1.8, 0.1, 0.66, gr, 0, 0.97, 0));
      g.add(bx(0.5, 0.101, 0.4, bl, 0.2, 0.972, 0.05));
      g.add(bx(1.5, 0.05, 0.05, ch, 0, 0.45, 0.25), bx(1.5, 0.05, 0.05, ch, 0, 0.45, -0.25));
      for (const sx of [-0.8, 0.8]) { g.add(cy(0.03, 0.03, 0.82, ch, sx, 0.45, 0.28, 6), cy(0.03, 0.03, 0.82, ch, sx, 0.45, -0.28, 6)); }
      for (const sx of [-0.8, 0.8]) for (const sz of [-0.28, 0.28]) { const wh = cy(0.07, 0.07, 0.05, pm('wheel', 0x1c1c1c), sx, 0.07, sz, 10); wh.rotation.x = Math.PI / 2; g.add(wh); }
      g.add(bx(1.7, 0.03, 0.03, ch, 0, 1.15, 0.36), bx(1.7, 0.03, 0.03, ch, 0, 1.15, -0.36));
      const sheet = bx(0.9, 0.12, 0.62, pm('sheet', 0xcfd3c3), -0.25, 1.05, 0); sheet.rotation.z = 0.04; g.add(sheet);
      break;
    }
    case 'cart': {
      const mt = pm('cartm', 0x8d9794), dk = pm('cartd', 0x2c3331);
      for (const y of [0.28, 0.66, 1.04]) g.add(bx(1.1, 0.04, 0.62, mt, 0, y, 0));
      for (const [x, z] of [[-0.52, -0.28], [0.52, -0.28], [-0.52, 0.28], [0.52, 0.28]]) { g.add(cy(0.02, 0.02, 1.0, dk, x, 0.54, z, 6)); const wh = cy(0.06, 0.06, 0.05, pm('wheel', 0x1c1c1c), x, 0.06, z, 8); wh.rotation.x = Math.PI / 2; g.add(wh); }
      const cols = [0xb24a3a, 0x3a77b2, 0xe0d9b0, 0x4a9a58];
      for (let i = 0; i < 5; i++) g.add(bx(0.18 + (i % 3) * 0.06, 0.14, 0.2, pm('item' + i, cols[i % 4]), -0.4 + i * 0.2, 0.37 + (i % 2) * 0.38, (i % 2 ? 0.1 : -0.1)));
      g.add(bx(0.6, 0.03, 0.03, dk, 0, 1.12, -0.33));
      break;
    }
    case 'table': {
      const t = pm('tbl', 0x9a8f7a), l = pm('chromium', 0x9aa0a4);
      g.add(bx(1.7, 0.06, 0.9, t, 0, 0.74, 0));
      for (const [x, z] of [[-0.75, -0.38], [0.75, -0.38], [-0.75, 0.38], [0.75, 0.38]]) g.add(cy(0.03, 0.03, 0.72, l, x, 0.36, z, 6));
      g.add(bx(0.3, 0.2, 0.25, pm('mon', 0x32383a), -0.4, 0.87, 0), bx(0.2, 0.01, 0.15, pm('scr', 0x1a2a22, 0x0a2a1a), -0.4, 0.97, 0.12));
      g.add(bx(0.4, 0.02, 0.3, pm('paper', 0xe8e4d0), 0.4, 0.78, 0.1));
      break;
    }
    // --- мелкие предметы вдоль стен ---
    case 'crate': { g.add(bx(0.62, 0.5, 0.5, pm('card', 0x9c7b4a), 0, 0.25, 0), bx(0.64, 0.04, 0.2, pm('tape', 0xc9b27c), 0, 0.5, 0)); if (Math.random() < 0.6) g.add(bx(0.5, 0.4, 0.45, pm('card2', 0x8a6c40), 0.08, 0.7, 0)); break; }
    case 'barrel': { g.add(cy(0.3, 0.3, 0.9, pm('barrel', 0x2f4b63), 0, 0.45, 0, 14), cy(0.31, 0.31, 0.05, pm('barrelrim', 0x1f3345), 0, 0.2, 0, 14), cy(0.31, 0.31, 0.05, pm('barrelrim', 0x1f3345), 0, 0.7, 0, 14)); break; }
    case 'rustbarrel': { g.add(cy(0.3, 0.3, 0.9, pm('rustbarrel', 0x6b3a1f), 0, 0.45, 0, 14), cy(0.31, 0.31, 0.05, pm('rustrim', 0x40220f), 0, 0.25, 0, 14), cy(0.31, 0.31, 0.05, pm('rustrim', 0x40220f), 0, 0.65, 0, 14)); break; }
    case 'cone': { g.add(cy(0.03, 0.17, 0.62, pm('cone', 0xe2631a), 0, 0.31, 0, 12), cy(0.1, 0.1, 0.07, pm('conew', 0xeeeeee), 0, 0.34, 0, 12), bx(0.4, 0.03, 0.4, pm('conebase', 0x20201e), 0, 0.015, 0)); break; }
    case 'wetsign': { const a = bx(0.4, 0.55, 0.02, pm('wet', 0xe8c82a), 0, 0.3, 0.12); a.rotation.x = -0.22; const b = a.clone(); b.rotation.x = 0.22; b.position.z = -0.12; g.add(a, b); break; }
    case 'bin': { g.add(cy(0.24, 0.2, 0.62, pm('bin', 0x4b5256), 0, 0.31, 0, 12), bx(0.2, 0.02, 0.15, pm('paper', 0xe8e4d0), 0.04, 0.63, 0.02)); break; }
    case 'biobox': { g.add(bx(0.5, 0.6, 0.4, pm('bio', 0xb02a22), 0, 0.3, 0), bx(0.52, 0.06, 0.42, pm('biolid', 0x701510), 0, 0.62, 0), bx(0.18, 0.18, 0.01, pm('biosign', 0xf2d12a), 0, 0.36, 0.205)); break; }
    case 'ivstand': { const ch = pm('chromium', 0x9aa0a4); g.add(cy(0.02, 0.02, 1.8, ch, 0, 0.9, 0, 6), cy(0.22, 0.22, 0.03, ch, 0, 0.03, 0, 10), bx(0.1, 0.3, 0.05, pm('ivbag', 0xcfe3d8), 0, 1.65, 0)); break; }
  }
  return g;
}

function propRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const DECOR = {
  yellow:   { props: ['crate', 'crate', 'bin'], decal: [0x2a2005, 0.55] },
  concrete: { props: ['barrel', 'cone', 'cone', 'crate'], pipes: 'duct', decal: [0x050505, 0.6] },
  tunnel:   { props: ['rustbarrel', 'rustbarrel', 'crate'], pipes: 'pipes', decal: [0x3a1a08, 0.55] },
  pool:     { props: ['wetsign', 'cone', 'bin'], decal: [0xaee6f0, 0.4] },
  office:   { props: ['bin', 'crate', 'bin'], decal: [0x1a1a10, 0.5] },
  run:      { props: ['biobox', 'ivstand', 'bin'], pipes: 'rail', decal: [0x5a0808, 0.6] },
};

let decalTex = null;
function getDecalTex() {
  if (decalTex) return decalTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath();
  for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = 46 + Math.random() * 16; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.closePath(); g.fill();
  return (decalTex = new THREE.CanvasTexture(c));
}

function addObstacle(o) {
  const g = buildProp(o.kind);
  g.position.set(o.x, 0, o.z); g.rotation.y = o.rot;
  return g;
}

function addDecor(grpWorld, styleName, seed) {
  const D = DECOR[styleName];
  if (!D) return;
  const rnd = propRng(seed * 31 + 7);
  const ex = map.exit, sp = map.spawn;
  const walls = []; // [cx, cz, dx, dz]
  const floors = [];
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    if (map.g[ty * N + tx]) continue;
    floors.push([tx, ty]);
    for (const [dx, dz] of BR.D4) {
      const nx = tx + dx, ny = ty + dz;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      if (nx === ex.tx && ny === ex.ty) continue;
      if (map.g[ny * N + nx]) walls.push([(tx + 0.5) * TILE, (ty + 0.5) * TILE, dx, dz]);
    }
  }
  // Трубы / воздуховоды / поручни вдоль стен
  if (D.pipes) {
    const specs = D.pipes === 'pipes' ? [[H - 0.4, 0.09, 0x6a4a3a], [H - 0.85, 0.06, 0x3c4a54]]
      : D.pipes === 'duct' ? [[H - 0.35, 0.22, 0x4a4e52]] : [[0.95, 0.035, 0xdfe4dd]];
    for (const [y, r, col] of specs) {
      const geoX = D.pipes === 'duct' ? new THREE.BoxGeometry(TILE, r * 1.4, r * 2) : new THREE.CylinderGeometry(r, r, TILE, 8);
      const geoZ = geoX.clone();
      if (D.pipes !== 'duct') { geoX.rotateZ(Math.PI / 2); geoZ.rotateX(Math.PI / 2); } else geoZ.rotateY(Math.PI / 2);
      const mat = new THREE.MeshLambertMaterial({ color: col });
      const ax = walls.filter((w) => w[3] !== 0), az = walls.filter((w) => w[2] !== 0);
      const iX = new THREE.InstancedMesh(geoX, mat, ax.length), iZ = new THREE.InstancedMesh(geoZ, mat, az.length);
      const m4 = new THREE.Matrix4();
      ax.forEach((w, i) => { m4.setPosition(w[0] + w[2] * (TILE / 2 - r - 0.04), y, w[1] + w[3] * (TILE / 2 - r - 0.04)); iX.setMatrixAt(i, m4); });
      az.forEach((w, i) => { m4.setPosition(w[0] + w[2] * (TILE / 2 - r - 0.04), y, w[1] + w[3] * (TILE / 2 - r - 0.04)); iZ.setMatrixAt(i, m4); });
      iX.frustumCulled = iZ.frustumCulled = false;
      grpWorld.add(iX, iZ);
    }
  }
  // Потёки/лужи на полу
  const nd = 48, dm = new THREE.MeshBasicMaterial({ map: getDecalTex(), color: D.decal[0], transparent: true, opacity: D.decal[1], depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const dg = new THREE.PlaneGeometry(1, 1); dg.rotateX(-Math.PI / 2);
  const dec = new THREE.InstancedMesh(dg, dm, nd);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < nd; i++) {
    const [tx, ty] = floors[Math.floor(rnd() * floors.length)];
    const s = 0.8 + rnd() * 2.6;
    q.setFromAxisAngle(up, rnd() * 6.28); sc.set(s, 1, s * (0.6 + rnd() * 0.6));
    ps.set((tx + 0.5) * TILE + (rnd() - 0.5) * 3, 0.012 + (i % 5) * 0.001, (ty + 0.5) * TILE + (rnd() - 0.5) * 3);
    m4.compose(ps, q, sc); dec.setMatrixAt(i, m4);
  }
  dec.frustumCulled = false; grpWorld.add(dec);
  // Мелкие предметы у стен (не на пути: прижаты к стене)
  const near = (x, z, p) => Math.hypot(x - p.x, z - p.z) < 7;
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < 46; tries++) {
    const w = walls[Math.floor(rnd() * walls.length)];
    if (!w || rnd() > 0.35) continue;
    const t = (rnd() - 0.5) * 2.2;
    const x = w[0] + w[2] * 1.5 + (w[3] !== 0 ? t : 0), z = w[1] + w[3] * 1.5 + (w[2] !== 0 ? t : 0);
    if (near(x, z, sp) || near(x, z, { x: (ex.tx + 0.5) * TILE, z: (ex.ty + 0.5) * TILE })) continue;
    const kind = D.props[Math.floor(rnd() * D.props.length)];
    const pr = buildProp(kind);
    pr.position.set(x, 0, z); pr.rotation.y = rnd() * 6.28;
    grpWorld.add(pr); placed++;
  }
}

function disposeWorld() {
  if (!world) return;
  scene.remove(world);
  world.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  world = null;
  objs.clear();
}

const G = { doorObj: null }; // служебные данные текущего уровня

function buildWorld(level, seed, objList) {
  disposeWorld();
  curLevel = level;
  const st = applyStyle(LEVELS[level].style);
  map = BR.generate(seed, level);
  H = map.wallH;
  G.doorObj = null;
  world = new THREE.Group();
  const ex = map.exit;

  // Стены (только граничащие с полом; клетка двери считается проходом)
  const g2 = map.g.slice();
  g2[ex.ty * N + ex.tx] = 0;
  const wallPos = [];
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    if (!map.g[ty * N + tx] || (tx === ex.tx && ty === ex.ty)) continue;
    for (const [dx, dy] of BR.D4) {
      const nx = tx + dx, ny = ty + dy;
      if (nx >= 0 && ny >= 0 && nx < N && ny < N && !g2[ny * N + nx]) { wallPos.push([tx, ty]); break; }
    }
  }
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, H, TILE), mats.wall, wallPos.length);
  const m4 = new THREE.Matrix4();
  wallPos.forEach(([tx, ty], i) => { m4.setPosition((tx + 0.5) * TILE, H / 2, (ty + 0.5) * TILE); walls.setMatrixAt(i, m4); });
  walls.instanceMatrix.needsUpdate = true; walls.frustumCulled = false;
  world.add(walls);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(N * TILE, N * TILE), mats.floor);
  floor.rotation.x = -Math.PI / 2; floor.position.set(FULL / 2, 0, FULL / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(N * TILE, N * TILE), mats.ceil);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(FULL / 2, H, FULL / 2);
  world.add(floor, ceil);

  // Потолочные лампы
  const panels = [];
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    if (map.g[ty * N + tx]) continue;
    const h = Math.sin(tx * 12.9898 + ty * 78.233 + seed) * 43758.5453;
    if (st.panel.test(tx, ty, h - Math.floor(h))) panels.push([tx, ty]);
  }
  const panelGeo = new THREE.PlaneGeometry(st.panel.size, st.panel.size);
  panelGeo.rotateX(Math.PI / 2);
  const lights = new THREE.InstancedMesh(panelGeo, panelMat, panels.length);
  panels.forEach(([tx, ty], i) => { m4.setPosition((tx + 0.5) * TILE, H - 0.02, (ty + 0.5) * TILE); lights.setMatrixAt(i, m4); });
  lights.instanceMatrix.needsUpdate = true; lights.frustumCulled = false;
  world.add(lights);

  // Объекты (дверь первой, чтобы терминал знал её направление)
  const sorted = objList.slice().sort((a, b) => (a.kind === 'door' ? -1 : 0) - (b.kind === 'door' ? -1 : 0));
  for (const o of sorted) addObj(o);
  addDecor(world, LEVELS[level].style, seed);
  for (const o of map.obst || []) world.add(addObstacle(o));
  scene.add(world);
}

function addObj(o) {
  const rec = createObj(o);
  world.add(rec.group);
  objs.set(o.id, rec);
}

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
const limb = (len, rt, rb, mat, x, y, z, seg = 8) => {
  const p = pivot(x, y, z);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, len, seg), mat); m.position.y = -len / 2;
  p.add(m); return p;
};

const beamGeo = (() => { const g = new THREE.ConeGeometry(1.0, 6, 16, 1, true); g.translate(0, -3, 0); g.rotateX(-Math.PI / 2); return g; })();

const remotes = new Map();
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
  g.add(torso, hip, neck, head, cap, eyes, pack, parts.armL, parts.armR, parts.legL, parts.legR, torch, beam, beamGlow, nameSprite(name));
  g.userData.parts = parts;
  return g;
}

function setPlayers(list) {
  const ids = new Set(list.map((p) => p.id));
  for (const p of list) {
    if (p.id === myId) continue;
    const r = remotes.get(p.id);
    if (r) r.name = p.name;
    else {
      const mesh = makeAvatar(p.id, p.name);
      mesh.visible = false; scene.add(mesh);
      remotes.set(p.id, { mesh, parts: mesh.userData.parts, x: 0, z: 0, r: 0, tx: 0, tz: 0, tr: 0, name: p.name, seen: false, fl: false, walk: 0 });
    }
  }
  for (const [id, r] of remotes) if (!ids.has(id)) { scene.remove(r.mesh); remotes.delete(id); }
  $('players').innerHTML = list.map((p) => `<div><i style="background:hsl(${((p.id * 0.37) % 1) * 360},55%,52%)"></i>${p.id === myId ? p.name + ' <small>(вы)</small>' : p.name}</div>`).join('');
}

// Существа
const mobEnts = [];
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
  return { group: g, parts, type, x: 0, z: 0, r: 0, tx: 0, tz: 0, tr: 0, chase: false, stun: false, seen: false, walk: 0 };
}
function ensureMobs(n, type) {
  if (type && type !== mobType) { while (mobEnts.length) scene.remove(mobEnts.pop().group); mobType = type; }
  while (mobEnts.length < n) mobEnts.push(makeMob(mobType));
  while (mobEnts.length > n) scene.remove(mobEnts.pop().group);
}

/* ============================== Звук ============================== */
let A = null;
function initAudio() {
  if (A) { A.ctx.resume(); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain(); master.gain.value = settings.vol; master.connect(ctx.destination);
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
  A = { ctx, master, hum, humOsc, dread: dg, nb, amb: null };
  if (curStyle) setAmbience(curStyle);
}
function setAmbience(st) {
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
function tone(freq, dur, vol, type = 'sine', slideTo = null, delay = 0) {
  if (!A) return;
  const o = A.ctx.createOscillator(); o.type = type;
  const g = A.ctx.createGain(); const t = A.ctx.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
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
};

/* ============================== Сеть ============================== */
let ws = null, myId = 0, started = false, joined = false, goalLines = [], heldFuses = 0;
const me = { x: 0, z: 0, yaw: 0, pitch: 0, stamina: 1, exhausted: false, bob: 0, stepPhase: 0, fov: 75 };
const keypad = { open: false, buf: '' };
const UP = { map: false };
window.__br = { me, FL, UP, keys: () => keys };
let bigOn = false;
let alarmUntil = 0;

function setStatus(t) { $('status').textContent = t; }

function connect(name) {
  if (location.protocol === 'file:') {
    setStatus('Откройте игру через сервер: запустите start.bat (адрес http://localhost:3000)');
    return;
  }
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
  ws.onmessage = (e) => onNet(JSON.parse(e.data));
  ws.onclose = () => {
    joined = false;
    showBanner('Соединение с сервером потеряно.<br><small>Обновите страницу (F5)</small>');
    document.exitPointerLock();
  };
  ws.onerror = () => setStatus('Не удалось подключиться к серверу');
}
const sendNet = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

function renderGoals() {
  const L = LEVELS[curLevel];
  let dots = '';
  for (let i = 0; i < LEVELS.length; i++) dots += `<i class="${i < curLevel ? 'on' : i === curLevel ? 'cur' : ''}"></i>`;
  $('goals').innerHTML = `<div class="tag">${L.tag || 'LEVEL ' + curLevel}</div><div class="lv">${L.name.toUpperCase()}</div>` +
    goalLines.map((l) => `<div class="${l.includes('✔') || l.includes('ОТКРЫТ') ? 'ok' : l.includes('заблок') ? 'bad' : ''}">${l}</div>`).join('') +
    `<div id="prog">${dots}</div>`;
}

function showLevelTitle(level) {
  const el = $('lvl');
  el.querySelector('.n').textContent = LEVELS[level].tag || `УРОВЕНЬ ${level}`;
  el.querySelector('.t').textContent = LEVELS[level].name.toUpperCase();
  el.querySelector('.i').textContent = LEVELS[level].intro;
  el.classList.add('on');
  clearTimeout(showLevelTitle.t);
  showLevelTitle.t = setTimeout(() => el.classList.remove('on'), 9000);
}

function onNet(m) {
  switch (m.t) {
    case 'init': {
      myId = m.id;
      buildWorld(m.level, m.seed, m.objs);
      for (const r of remotes.values()) scene.remove(r.mesh);
      remotes.clear();
      ensureMobs(0, LEVELS[m.level].mobType);
      UP.map = !!(m.upgrades && m.upgrades.map);
      closeBigMap();
      if (LEVELS[m.level].chase) FL.on = false;
      me.x = m.spawn.x; me.z = m.spawn.z; me.yaw = Math.PI * 0.5; me.pitch = 0;
      me.stamina = 1; me.exhausted = false;
      goalLines = m.goals; heldFuses = m.held;
      closeKeypad(); $('note').style.display = 'none';
      setPlayers(m.players);
      hideBanner(); renderGoals();
      showLevelTitle(m.level);
      joined = true;
      if (!started) beginPlay();
      break;
    }
    case 'players': setPlayers(m.list); break;
    case 's': {
      for (const [id, x, z, r, fl] of m.p) {
        const rem = remotes.get(id);
        if (!rem) continue;
        rem.tx = x; rem.tz = z; rem.tr = r; rem.fl = !!fl;
        if (!rem.seen) { rem.x = x; rem.z = z; rem.r = r; rem.seen = true; rem.mesh.visible = true; }
      }
      ensureMobs(m.m.length, LEVELS[curLevel].mobType);
      m.m.forEach(([x, z, r, chase, stun], i) => {
        const mo = mobEnts[i];
        mo.tx = x; mo.tz = z; mo.tr = r; mo.chase = !!chase; mo.stun = !!stun;
        if (!mo.seen) { mo.x = x; mo.z = z; mo.r = r; mo.seen = true; mo.group.visible = true; }
      });
      break;
    }
    case 'obj': {
      const rec = objs.get(m.id);
      if (!rec) break;
      const wasOpen = rec.o.open;
      Object.assign(rec.o, m.p);
      refreshObj(rec);
      if (rec.o.kind === 'door' && rec.o.open && !wasOpen) sfx.door();
      if (rec.o.kind === 'plate') sfx.click();
      break;
    }
    case 'pick': {
      const rec = objs.get(m.id);
      if (rec) { world.remove(rec.group); objs.delete(m.id); }
      m.kind === 'fuse' ? sfx.fuse() : sfx.pickup();
      if (m.kind !== 'mapitem') toast(m.kind === 'fuse' ? `${m.by} нашёл предохранитель` : `${m.by} нашёл воду`, 2000);
      break;
    }
    case 'upgrade':
      UP.map = true; sfx.win();
      toast(`${m.by} нашёл УЛУЧШЕННУЮ КАРТУ! M — карта на весь экран, существа видны на ней`, 6000);
      break;
    case 'stamina': me.stamina = 1; me.exhausted = false; toast('Вода: выносливость восстановлена', 2000); break;
    case 'goal': {
      goalLines = m.lines; heldFuses = m.held; renderGoals();
      for (const rec of objs.values()) {
        if (rec.o.kind === 'box') rec.parts.screen.material.color.setHex(goalLines.some((l) => l.startsWith('Предохранители') && l.includes('✔')) ? 0x30ff60 : 0xff3020);
        if (rec.o.kind === 'keypad') rec.parts.screen.material.color.setHex(goalLines.some((l) => l.startsWith('Код') && l.includes('✔')) ? 0x30ff60 : 0xff3020);
      }
      break;
    }
    case 'note': showNote(m.text); break;
    case 'codeok': closeKeypad(); sfx.beep(); break;
    case 'codebad': keypad.buf = ''; updateKeypad(); tone(150, 0.5, 0.3, 'sawtooth'); break;
    case 'alarm': alarmUntil = performance.now() / 1000 + 6; sfx.alarm(); toast('СИРЕНА! Существа идут на шум!', 3500); break;
    case 'sfx': if (sfx[m.name]) sfx[m.name](); break;
    case 'caught': {
      me.x = m.x; me.z = m.z;
      sfx.caught();
      const fl = $('flash'); fl.classList.add('on');
      setTimeout(() => fl.classList.remove('on'), 80);
      toast('Существо поймало вас! Вы очнулись в другом месте…', 3500);
      break;
    }
    case 'done':
      sfx.win();
      showBanner(m.last
        ? 'ВЫ ВЫБРАЛИСЬ ИЗ ЗАКУЛИСЬЯ<br><small>Но стены так похожи на те, с которых вы начинали…<br>Игра начнётся заново.</small>'
        : `УРОВЕНЬ ПРОЙДЕН<br><small>Дальше: ${m.next}</small>`);
      break;
    case 'ev': toast(m.text, 3000); break;
  }
}

setInterval(() => {
  if (joined) sendNet({ t: 'p', x: +me.x.toFixed(2), z: +me.z.toFixed(2), r: +me.yaw.toFixed(3), f: FL.on ? 1 : 0 });
}, 50);

/* ============================== Интерфейс ============================== */
let toastTimer = 0;
function toast(text, ms = 2500) {
  const t = $('toast');
  t.textContent = text; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
function showBanner(html) { const b = $('banner'); b.innerHTML = html; b.style.display = 'flex'; }
function hideBanner() { $('banner').style.display = 'none'; }

let noteTimer = 0;
function showNote(text) {
  const n = $('note');
  n.innerHTML = '';
  n.append(document.createTextNode(text));
  const s = document.createElement('small'); s.textContent = 'E — убрать записку';
  n.append(s);
  n.style.display = 'block';
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { n.style.display = 'none'; }, 40000);
}

function updateKeypad() {
  $('kpDisp').textContent = (keypad.buf + '----').slice(0, 4);
}
function openKeypad() { keypad.open = true; keypad.buf = ''; updateKeypad(); $('keypad').style.display = 'block'; sfx.beep(); }
function closeKeypad() { keypad.open = false; $('keypad').style.display = 'none'; }

const nameInput = $('name');
nameInput.value = localStorage.getItem('br_name') || `Игрок${Math.floor(rand(10, 99))}`;

function beginPlay() { started = true; $('menu').style.display = 'none'; $('hud').style.display = 'block'; }
function lockPointer() { renderer.domElement.requestPointerLock(); }

$('play').addEventListener('click', () => {
  if (started) { $('menu').style.display = 'none'; lockPointer(); return; }
  const name = nameInput.value.trim() || 'Игрок';
  localStorage.setItem('br_name', name);
  initAudio();
  setStatus('Подключение…');
  connect(name);
  lockPointer();
});
nameInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('play').click(); });

let locked = false;
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (!locked) closeBigMap();
  if (started && joined && !locked) {
    $('subtitle').textContent = 'ПАУЗА · КЛИК, ЧТОБЫ ПРОДОЛЖИТЬ (существо не ждёт!)';
    $('play').textContent = 'ПРОДОЛЖИТЬ';
    $('menu').style.display = 'flex';
  }
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  me.yaw -= e.movementX * 0.0022 * settings.sens;
  me.pitch = clamp(me.pitch - e.movementY * 0.0022 * settings.sens, -1.45, 1.45);
});

/* ---------- Взаимодействие ---------- */
const INTERACTIVE = ['box', 'lever', 'note', 'keypad'];
function nearestUsable() {
  let best = null, bd = 3.2;
  for (const rec of objs.values()) {
    const o = rec.o;
    if (!INTERACTIVE.includes(o.kind) || (o.kind === 'lever' && o.on)) continue;
    const d = Math.hypot(o.x - me.x, o.z - me.z);
    if (d < bd && BR.los(map, me.x, me.z, o.x, o.z)) { bd = d; best = o; }
  }
  return best;
}
function promptFor(o) {
  switch (o.kind) {
    case 'box': return heldFuses > 0 ? `<b>E</b> Вставить предохранители (${heldFuses})` : 'Щиток обесточен — нужны предохранители';
    case 'lever': return '<b>E</b> Дёрнуть рычаг';
    case 'note': return '<b>E</b> Прочитать записку';
    case 'keypad': return '<b>E</b> Ввести код';
  }
  return '';
}
function useNearest() {
  const o = nearestUsable();
  if (!o) return;
  if (o.kind === 'keypad') { openKeypad(); return; }
  sendNet({ t: 'use', id: o.id });
  if (o.kind === 'lever') sfx.click();
}

const keys = {};
let mmOn = true;
addEventListener('keydown', (e) => {
  if (keypad.open) {
    e.preventDefault();
    if (/^Digit\d$/.test(e.code) || /^Numpad\d$/.test(e.code)) {
      if (keypad.buf.length < 4) { keypad.buf += e.code.slice(-1); sfx.key(); updateKeypad(); }
    } else if (e.code === 'Backspace') { keypad.buf = keypad.buf.slice(0, -1); updateKeypad(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (keypad.buf.length === 4) sendNet({ t: 'code', v: keypad.buf }); else tone(150, 0.2, 0.2, 'sawtooth');
    } else if (e.code === 'KeyQ' || e.code === 'KeyE') closeKeypad();
    return;
  }
  keys[e.code] = true;
  if (e.code === 'KeyH') { mmOn = !mmOn; $('minimapWrap').style.display = mmOn ? 'block' : 'none'; }
  if (e.code === 'KeyF' && joined && locked && !e.repeat) toggleTorch();
  if (e.code === 'KeyM' && joined && locked && !e.repeat) toggleBigMap();
  if (e.code === 'KeyE' && joined && locked) {
    if ($('note').style.display === 'block') $('note').style.display = 'none'; else useNearest();
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* ============================ Карты ============================ */
const mm = $('minimap'), mg = mm.getContext('2d');
const bigc = $('bigcanvas'), bg = bigc.getContext('2d');
const MAPPAL = {
  yellow: ['#8d7d38', '#2b2610', '#0d0b03'], concrete: ['#7b7f86', '#24262a', '#0a0b0c'], tunnel: ['#8a5a44', '#2a1710', '#0d0605'],
  pool: ['#58bccb', '#1b4e57', '#04161a'], run: ['#a9c4b6', '#22332c', '#06100c'], office: ['#98a081', '#2a2e22', '#0a0b08'],
};
const OBJ_DOT = { water: '#7fe8ff', fuse: '#ffb030', box: '#ffffff', keypad: '#ffffff', note: '#f0e8b0' };

function toggleTorch() {
  if (!FL.on && FL.bat < 0.04) { toast('Батарея села — подождите', 1800); return; }
  FL.on = !FL.on; sfx.fl();
}
function toggleBigMap() {
  if (!UP.map) { toast('У вас нет улучшенной карты. Она может лежать где-то на 1 уровне.', 3200); return; }
  bigOn ? closeBigMap() : openBigMap();
}
function openBigMap() {
  bigOn = true; $('bigmap').style.display = 'flex'; $('bigLv').textContent = LEVELS[curLevel].name.toUpperCase();
  const sz = Math.floor(Math.min(innerWidth * 0.92, innerHeight * 0.78));
  bigc.width = bigc.height = sz; sfx.click(); drawBigMap();
}
function closeBigMap() { if (bigOn) { bigOn = false; $('bigmap').style.display = 'none'; } }

function mobDots(ctx, X, Y, rad, pulse) {
  for (const mo of mobEnts) {
    if (!mo.seen) continue;
    const idle = mo.stun && !mo.chase;
    ctx.fillStyle = idle ? 'rgba(255,90,70,.4)' : '#ff3b30';
    ctx.beginPath(); ctx.arc(X(mo.x), Y(mo.z), rad, 0, 7); ctx.fill();
    if (!idle) {
      const ph = (time * 1.6) % 1;
      ctx.strokeStyle = `rgba(255,59,48,${0.7 * (1 - ph)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(mo.x), Y(mo.z), rad + ph * rad * 3.2 * pulse, 0, 7); ctx.stroke();
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(mo.x), Y(mo.z)); ctx.lineTo(X(mo.x + Math.sin(mo.r) * 2.4), Y(mo.z + Math.cos(mo.r) * 2.4)); ctx.stroke();
  }
}
function objDots(ctx, X, Y, rad, sqs) {
  for (const { o } of objs.values()) {
    let col = OBJ_DOT[o.kind], sq = false, r = rad;
    if (o.kind === 'door') { col = o.open ? '#30ff60' : '#ff3020'; sq = true; r = sqs; }
    else if (o.kind === 'plate') col = o.on ? '#30ff60' : '#ff9030';
    else if (o.kind === 'lever') col = o.on ? '#30ff60' : '#' + LEVER_COL[o.col].toString(16).padStart(6, '0');
    else if (o.kind === 'arrow') { col = 'rgba(70,255,140,.65)'; r = rad * 0.55; }
    else if (o.kind === 'digit' || o.kind === 'mapitem') continue;
    if (!col) continue;
    ctx.fillStyle = col;
    if (sq) ctx.fillRect(X(o.x) - r, Y(o.z) - r, r * 2, r * 2);
    else { ctx.beginPath(); ctx.arc(X(o.x), Y(o.z), r, 0, 7); ctx.fill(); }
  }
}

function drawMinimap() {
  if (!mmOn || !map) return;
  const pal = MAPPAL[LEVELS[curLevel].style] || MAPPAL.yellow;
  const R = UP.map ? 16 : 9, s = mm.width, cell = s / (R * 2 + 1);
  const px = me.x / TILE, pz = me.z / TILE;
  const X = (wx) => (wx / TILE - px) * cell + s / 2, Y = (wz) => (wz / TILE - pz) * cell + s / 2;
  mg.fillStyle = pal[2]; mg.fillRect(0, 0, s, s);
  for (let ty = Math.floor(pz) - R - 1; ty <= Math.floor(pz) + R + 1; ty++) {
    for (let tx = Math.floor(px) - R - 1; tx <= Math.floor(px) + R + 1; tx++) {
      const wall = tx < 0 || ty < 0 || tx >= N || ty >= N || map.g[ty * N + tx];
      mg.fillStyle = wall ? pal[1] : pal[0];
      mg.fillRect((tx - px) * cell + s / 2, (ty - pz) * cell + s / 2, cell + 0.5, cell + 0.5);
    }
  }
  objDots(mg, X, Y, UP.map ? 2.8 : 3.6, UP.map ? 4 : 5);
  if (UP.map) mobDots(mg, X, Y, 3.4, 0.9);
  for (const r of remotes.values()) {
    if (!r.seen) continue;
    mg.fillStyle = '#6fa8ff'; mg.beginPath(); mg.arc(X(r.x), Y(r.z), 3.8, 0, 7); mg.fill();
  }
  mg.save(); mg.translate(s / 2, s / 2); mg.rotate(-me.yaw);
  if (FL.on) { mg.fillStyle = 'rgba(255,240,170,.16)'; mg.beginPath(); mg.moveTo(0, 0); mg.arc(0, 0, s * 0.45, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); mg.closePath(); mg.fill(); }
  mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(5, 6); mg.lineTo(-5, 6); mg.closePath(); mg.fill();
  mg.restore();
  $('mmMode').textContent = UP.map ? 'КАРТА+ · РАДИУС 16' : 'РАДИУС 9';
  $('mmMode').className = UP.map ? 'up' : '';
}

function drawBigMap() {
  if (!map) return;
  const pal = MAPPAL[LEVELS[curLevel].style] || MAPPAL.yellow;
  const s = bigc.width, cell = s / N;
  const X = (wx) => wx / TILE * cell, Y = (wz) => wz / TILE * cell;
  bg.fillStyle = pal[2]; bg.fillRect(0, 0, s, s);
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    bg.fillStyle = map.g[ty * N + tx] ? pal[1] : pal[0];
    bg.fillRect(tx * cell, ty * cell, cell + 0.6, cell + 0.6);
  }
  // мебель на уровне «Беги!»
  bg.fillStyle = 'rgba(0,0,0,.35)';
  for (const o of map.obst || []) { bg.beginPath(); bg.arc(X(o.x), Y(o.z), o.r / TILE * cell * 0.8, 0, 7); bg.fill(); }
  objDots(bg, X, Y, Math.max(3, cell * 0.28), Math.max(5, cell * 0.4));
  mobDots(bg, X, Y, Math.max(4, cell * 0.3), 1.6);
  bg.font = `bold ${Math.max(11, cell * 0.38)}px "Courier New"`; bg.textAlign = 'center';
  for (const r of remotes.values()) {
    if (!r.seen) continue;
    bg.fillStyle = '#6fa8ff'; bg.beginPath(); bg.arc(X(r.x), Y(r.z), Math.max(4, cell * 0.3), 0, 7); bg.fill();
    bg.fillStyle = '#fff'; bg.fillText(r.name, X(r.x), Y(r.z) - cell * 0.5);
  }
  bg.save(); bg.translate(X(me.x), Y(me.z)); bg.rotate(-me.yaw);
  bg.fillStyle = '#fff'; bg.strokeStyle = '#000'; bg.lineWidth = 2;
  const a = Math.max(7, cell * 0.45);
  bg.beginPath(); bg.moveTo(0, -a); bg.lineTo(a * 0.7, a * 0.8); bg.lineTo(-a * 0.7, a * 0.8); bg.closePath(); bg.fill(); bg.stroke();
  bg.restore();
}

/* ========================= Игровой цикл ========================= */
const flick = { next: rand(3, 8), dur: 0, k: 1 };
const t0 = performance.now();
let time = 0, last = performance.now(), hudTimer = 0, heartT = 0, ambT = 0;

function updateLight(dt) {
  flick.next -= dt;
  if (flick.next <= 0 && flick.dur <= 0) { flick.dur = rand(0.25, 1.0); flick.next = rand(LIGHT.flick[0], LIGHT.flick[1]); }
  let target = 1;
  if (flick.dur > 0) { flick.dur -= dt; target = Math.random() < 0.55 ? rand(0.2, 0.55) : 1; }
  flick.k += (target - flick.k) * Math.min(1, dt * 30);
  let k = flick.k * (0.97 + 0.03 * Math.sin(time * 90));
  if (LIGHT.pulse) k *= 0.78 + 0.22 * Math.sin(time * 3.2);
  const alarm = performance.now() / 1000 < alarmUntil;
  if (alarm) k *= 0.6 + 0.4 * Math.abs(Math.sin(time * 6));
  FL.k += ((FL.on ? 1 : 0) - FL.k) * Math.min(1, dt * 14);
  let tf = 1;
  if (FL.on && FL.bat < 0.15 && Math.random() < 0.25) tf = rand(0.1, 0.7);
  torch.intensity = 36 * FL.k * tf * (0.55 + 0.45 * Math.min(1, FL.bat * 6)) * (0.9 + 0.1 * k);
  scene.fog.density = LIGHT.fogD * (1 - 0.22 * FL.k);
  hemi.intensity = LIGHT.hemi * k; sun.intensity = LIGHT.sun * k; lamp.intensity = LIGHT.lamp * k;
  const p = LIGHT.panel;
  panelMat.color.setRGB(p[0] * k, p[1] * k, p[2] * k);
  scene.fog.color.copy(LIGHT.fog).multiplyScalar(0.55 + 0.45 * k);
  scene.background.copy(scene.fog.color);
  $('alarmfx').style.opacity = alarm ? String(0.25 + 0.25 * Math.sin(time * 9)) : '0';
  if (A) A.hum.gain.value = 0.05 * (0.6 + 0.4 * k);
}

function update(dt) {
  time += dt;
  let moving = false, sprint = false;
  const frozen = keypad.open || bigOn;

  if (joined && map && locked && !frozen) {
    let ix = 0, iz = 0;
    if (keys.KeyW || keys.ArrowUp) iz += 1;
    if (keys.KeyS || keys.ArrowDown) iz -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    moving = !!(ix || iz);
    const len = Math.hypot(ix, iz) || 1; ix /= len; iz /= len;
    sprint = moving && (keys.ShiftLeft || keys.ShiftRight) && !me.exhausted && me.stamina > 0;
    const spd = sprint ? 6.2 : 3.6;
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    const p = BR.move(map, me.x, me.z, (fx * iz + rx * ix) * spd * dt, (fz * iz + rz * ix) * spd * dt, 0.38);
    me.x = p.x; me.z = p.z;

    if (LEVELS[curLevel].infStamina) { me.stamina = 1; me.exhausted = false; }
    else if (sprint) { me.stamina -= dt / 4.5; if (me.stamina <= 0) { me.stamina = 0; me.exhausted = true; } }
    else { me.stamina = Math.min(1, me.stamina + dt / (moving ? 7 : 4)); if (me.exhausted && me.stamina > 0.3) me.exhausted = false; }

    if (moving) {
      me.bob += dt * (sprint ? 12 : 8);
      const phase = Math.floor(me.bob / Math.PI);
      if (phase !== me.stepPhase) { me.stepPhase = phase; sfx.step(sprint); }
    }
  }

  const bobY = moving ? Math.sin(me.bob) * (sprint ? 0.075 : 0.045) : 0;
  const bobX = moving ? Math.cos(me.bob * 0.5) * 0.03 : 0;
  camera.position.set(me.x + bobX, 1.7 + bobY, me.z);
  camera.rotation.set(me.pitch, me.yaw, 0);
  me.fov += ((sprint ? settings.fov + 7 : settings.fov) - me.fov) * Math.min(1, dt * 8);
  if (Math.abs(camera.fov - me.fov) > 0.05) { camera.fov = me.fov; camera.updateProjectionMatrix(); }

  const k = 1 - Math.exp(-12 * dt);
  for (const r of remotes.values()) {
    r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.r = lerpAngle(r.r, r.tr, k);
    const spd = Math.hypot(r.tx - r.x, r.tz - r.z) * k / Math.max(dt, 0.001);
    r.walk += dt * clamp(spd, 0, 7) * 2.1;
    const am = clamp(spd / 3.5, 0, 1), swg = Math.sin(r.walk) * 0.7 * am;
    r.parts.armL.rotation.x = swg; r.parts.armR.rotation.x = -swg * 0.4 - 0.9 * (r.fl ? 1 : 0);
    r.parts.legL.rotation.x = -swg; r.parts.legR.rotation.x = swg;
    r.parts.torch.visible = r.parts.beam.visible = r.parts.beamGlow.visible = r.fl;
    r.mesh.position.set(r.x, Math.abs(Math.sin(r.walk)) * 0.04 * am, r.z);
    r.mesh.rotation.y = r.r + Math.PI;
  }

  // Существа
  let mobDist = 999;
  for (const mo of mobEnts) {
    if (!mo.seen) continue;
    const dx = mo.tx - mo.x, dz = mo.tz - mo.z;
    const sp = Math.hypot(dx, dz) / Math.max(dt, 0.001);
    mo.x += dx * k; mo.z += dz * k;
    mo.r = lerpAngle(mo.r, mo.tr, 1 - Math.exp(-8 * dt));
    const run = mo.type === 'runner';
    mo.walk += dt * clamp(sp, 0, 7) * (run ? 1.9 : 1.4);
    mo.group.position.set(mo.x, 0, mo.z);
    mo.group.rotation.y = mo.r;
    const amp = clamp(sp / 3, 0.15, 1);
    const sw = Math.sin(mo.walk) * (run ? 1.0 : 0.55) * amp;
    if (run) {
      mo.group.rotation.z = 0;
      mo.parts.body.rotation.x = 0.35 + 0.25 * amp + Math.sin(mo.walk * 2) * 0.05;
      mo.parts.body.position.y = Math.abs(Math.sin(mo.walk)) * 0.12 * amp;
      mo.parts.armL.rotation.x = -sw * 1.1 - 0.5; mo.parts.armR.rotation.x = sw * 1.1 - 0.5;
    } else {
      mo.group.rotation.z = Math.sin(time * 1.3) * 0.03;
      mo.parts.armL.rotation.x = sw; mo.parts.armR.rotation.x = -sw;
    }
    mo.parts.legL.rotation.x = -sw * 0.8; mo.parts.legR.rotation.x = sw * 0.8;
    mo.group.visible = !mo.stun;
    if (!mo.stun) mobDist = Math.min(mobDist, Math.hypot(mo.x - me.x, mo.z - me.z));
  }

  // Анимация предметов
  for (const rec of objs.values()) {
    if (rec.bob) { rec.group.position.y = (rec.o.kind === 'fuse' ? 0.9 : 1.0) + Math.sin(time * 2 + rec.o.x) * 0.1; rec.group.rotation.y += dt * 1.2; }
    if (rec.o.kind === 'keypad' && !goalLines.some((l) => l.startsWith('Код') && l.includes('✔'))) rec.parts.screen.visible = Math.sin(time * 4) > -0.3;
  }

  if (FL.on) { FL.bat -= dt / 200; if (FL.bat <= 0) { FL.bat = 0; FL.on = false; sfx.fl(); toast('Батарея фонарика села — подождите, она восстановится', 3000); } }
  else FL.bat = Math.min(1, FL.bat + dt / 150);
  {
    const dp = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST_N; i++) {
      const v = dustVel[i];
      dp[i * 3] += v[0] * dt; dp[i * 3 + 1] += v[1] * dt; dp[i * 3 + 2] += v[2] * dt;
      dp[i * 3] = camera.position.x + ((dp[i * 3] - camera.position.x + DUST_R * 3) % (DUST_R * 2)) - DUST_R;
      dp[i * 3 + 2] = camera.position.z + ((dp[i * 3 + 2] - camera.position.z + DUST_R * 3) % (DUST_R * 2)) - DUST_R;
      if (dp[i * 3 + 1] > H) dp[i * 3 + 1] = 0.1; else if (dp[i * 3 + 1] < 0) dp[i * 3 + 1] = H - 0.1;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }
  updateLight(dt);

  // Подсказка взаимодействия
  const pr = $('prompt');
  const u = joined && map && !keypad.open ? nearestUsable() : null;
  if (u) { pr.innerHTML = promptFor(u); pr.classList.add('on'); } else pr.classList.remove('on');

  // Звук
  const prox = clamp(1 - mobDist / 34, 0, 1);
  $('danger').style.opacity = String(clamp(prox * 1.3 - 0.25, 0, 0.9) * (0.7 + 0.3 * Math.sin(time * 6)));
  if (A) {
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

  $('stamina').style.width = `${me.stamina * 100}%`;
  $('stamina').style.background = me.exhausted ? '#c0503a' : '#e8dc86';
  $('stTxt').textContent = LEVELS[curLevel].infStamina ? '∞' : '';
  $('bat').style.width = `${FL.bat * 100}%`;
  $('bat').style.background = FL.bat < 0.15 ? '#e0603a' : '#8fd0ff';
  $('batTxt').textContent = `${FL.on ? 'ВКЛ ' : ''}${Math.round(FL.bat * 100)}%`;
  hudTimer -= dt;
  if (hudTimer <= 0) { hudTimer = 0.05; drawMinimap(); if (bigOn) drawBigMap(); const sec = Math.floor((performance.now() - t0) / 1000); $('clock').textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

/* ======================= Меню, настройки, плёнка ======================= */
(function initMenu() {
  const list = $('lvlList');
  const hints = ['предохранители', 'код на стенах', 'нажимные плиты', 'рычаги', 'бегство', 'всё сразу'];
  LEVELS.forEach((L, i) => {
    const d = document.createElement('div'); d.className = 'lv-row'; d.id = 'lvrow' + i;
    d.innerHTML = `<b>${(L.tag || 'LEVEL ' + i)}</b>${L.name}<span>${hints[i] || ''}</span>`;
    list.append(d);
  });
  const host = location.host || '';
  $('addr').textContent = /^(localhost|127\.)/.test(location.hostname) ? `http://<IP хоста>:${location.port || 3000} (он написан в окне сервера)` : location.origin;

  const bind = (id, out, key, fmt, apply) => {
    const el = $(id); el.value = settings[key]; $(out).textContent = fmt(settings[key]);
    el.addEventListener('input', () => { settings[key] = parseFloat(el.value); $(out).textContent = fmt(settings[key]); saveSettings(); apply && apply(); });
  };
  const brightness = () => { $('game').style.filter = `brightness(${settings.br})`; };
  bind('sSens', 'oSens', 'sens', (v) => v.toFixed(2) + '×');
  bind('sFov', 'oFov', 'fov', (v) => String(Math.round(v)));
  bind('sVol', 'oVol', 'vol', (v) => Math.round(v * 100) + '%', () => { if (A) A.master.gain.value = settings.vol; });
  bind('sBr', 'oBr', 'br', (v) => v.toFixed(2), brightness);
  $('sQ').value = String(settings.q);
  $('sQ').addEventListener('change', () => { settings.q = parseFloat($('sQ').value); saveSettings(); applyQuality(); });
  brightness();
  camera.fov = settings.fov; me.fov = settings.fov; camera.updateProjectionMatrix();

  // зернистость плёнки
  const gc = $('grain'), gx = gc.getContext('2d'), im = gx.createImageData(gc.width, gc.height);
  setInterval(() => {
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    gx.putImageData(im, 0, 0);
  }, 90);
})();
