// Мебель и декор (не влияют на игровую логику, кроме препятствий)
import * as THREE from 'three';
import { BR, N, TILE } from '../core/util.js';
import { H, map } from './world.js';

/* ============================ Мебель и детали ============================ */
const PM = {};
const pm = (name, color, emissive = 0x000000) => PM[name] || (PM[name] = new THREE.MeshLambertMaterial({ color, emissive }));
export const bx = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
export const cy = (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); return m; };

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
    case 'luggage': { g.add(bx(0.5, 0.65, 0.25, pm('lug', 0x5a3a24), 0, 0.33, 0), bx(0.2, 0.04, 0.04, pm('lugh', 0x222222), 0, 0.7, 0)); break; }
    case 'vase': { g.add(cy(0.12, 0.2, 0.7, pm('vase', 0x2a4a6a), 0, 0.35, 0, 12), cy(0.05, 0.05, 0.4, pm('stem', 0x3a5a2a), 0, 0.9, 0, 5)); break; }
    case 'planter': { g.add(bx(0.8, 0.5, 0.8, pm('plant', 0x6a6a64), 0, 0.25, 0), cy(0.05, 0.05, 1.0, pm('stem', 0x3a5a2a), 0, 0.9, 0, 5), new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), pm('leaf', 0x2a4a22))); g.children[2].position.y = 1.5; break; }
    case 'shopcart': { const ch = pm('chromium', 0x9aa0a4); g.add(bx(0.55, 0.45, 0.85, pm('cartw', 0x8a9094), 0, 0.7, 0), cy(0.06, 0.06, 0.04, ch, -0.22, 0.06, 0.3, 8), cy(0.06, 0.06, 0.04, ch, 0.22, 0.06, -0.3, 8), bx(0.55, 0.04, 0.04, pm('carth', 0xc02020), 0, 1.0, -0.45)); break; }
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
  hotel:    { props: ['luggage', 'vase', 'luggage', 'chair'], pipes: 'rail', decal: [0x1a0404, 0.45] },
  mall:     { props: ['shopcart', 'planter', 'bin', 'wetsign'], decal: [0x30404a, 0.4] },
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

export function addObstacle(o) {
  const g = buildProp(o.kind);
  g.position.set(o.x, o.y || 0, o.z); g.rotation.y = o.rot;
  return g;
}

export function addDecor(grpWorld, styleName, seed) {
  const D = DECOR[styleName];
  if (!D) return;
  const rnd = propRng(seed * 31 + 7);
  const ex = map.exit, sp = map.spawn;
  const walls = []; // [cx, cz, dx, dz, y пола]
  const floors = []; // [tx, tz, y пола]
  for (let f = 0; f < map.F; f++) {
    const L = map.t[f], b = f * map.FH;
    for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
      if (L[ty * N + tx] !== BR.T.FLOOR) continue;
      floors.push([tx, ty, b]);
      for (const [dx, dz] of BR.D4) {
        const nx = tx + dx, ny = ty + dz;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        if (f === ex.f && nx === ex.tx && ny === ex.ty) continue;
        if (L[ny * N + nx] === BR.T.WALL) walls.push([(tx + 0.5) * TILE, (ty + 0.5) * TILE, dx, dz, b]);
      }
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
      ax.forEach((w, i) => { m4.setPosition(w[0] + w[2] * (TILE / 2 - r - 0.04), w[4] + y, w[1] + w[3] * (TILE / 2 - r - 0.04)); iX.setMatrixAt(i, m4); });
      az.forEach((w, i) => { m4.setPosition(w[0] + w[2] * (TILE / 2 - r - 0.04), w[4] + y, w[1] + w[3] * (TILE / 2 - r - 0.04)); iZ.setMatrixAt(i, m4); });
      iX.frustumCulled = iZ.frustumCulled = false;
      grpWorld.add(iX, iZ);
    }
  }
  // Потёки/лужи на полу
  const nd = 48 * map.F, dm = new THREE.MeshBasicMaterial({ map: getDecalTex(), color: D.decal[0], transparent: true, opacity: D.decal[1], depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const dg = new THREE.PlaneGeometry(1, 1); dg.rotateX(-Math.PI / 2);
  const dec = new THREE.InstancedMesh(dg, dm, nd);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < nd; i++) {
    const [tx, ty, fy] = floors[Math.floor(rnd() * floors.length)];
    const s = 0.8 + rnd() * 2.6;
    q.setFromAxisAngle(up, rnd() * 6.28); sc.set(s, 1, s * (0.6 + rnd() * 0.6));
    ps.set((tx + 0.5) * TILE + (rnd() - 0.5) * 3, fy + 0.012 + (i % 5) * 0.001, (ty + 0.5) * TILE + (rnd() - 0.5) * 3);
    m4.compose(ps, q, sc); dec.setMatrixAt(i, m4);
  }
  dec.frustumCulled = false; grpWorld.add(dec);
  // Мелкие предметы у стен (не на пути: прижаты к стене)
  const near = (x, y, z, p) => Math.hypot(x - p.x, z - p.z) < 7 && Math.abs(y - p.y) < 2;
  let placed = 0;
  for (let tries = 0; tries < 900 * map.F && placed < 46 * map.F; tries++) {
    const w = walls[Math.floor(rnd() * walls.length)];
    if (!w || rnd() > 0.35) continue;
    const t = (rnd() - 0.5) * 2.2;
    const x = w[0] + w[2] * 1.5 + (w[3] !== 0 ? t : 0), z = w[1] + w[3] * 1.5 + (w[2] !== 0 ? t : 0);
    if (near(x, w[4], z, sp) || near(x, w[4], z, { x: ex.wx, y: ex.y, z: ex.wz })) continue;
    const kind = D.props[Math.floor(rnd() * D.props.length)];
    const pr = buildProp(kind);
    pr.position.set(x, w[4], z); pr.rotation.y = rnd() * 6.28;
    grpWorld.add(pr); placed++;
  }
}
