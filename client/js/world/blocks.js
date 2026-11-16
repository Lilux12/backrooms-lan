// Низкие препятствия (клетки BLOCK): машины, столы, кровати, стойки, прилавки, стеллажи, ящики.
// Каждый вариант — несколько частей с общим набором матриц (InstancedMesh на часть), цвет машин — через instanceColor.
import * as THREE from 'three';
import { TILE } from '../core/util.js';

const lam = (color, emissive = 0) => new THREE.MeshLambertMaterial({ color, emissive });
const box = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const cyl = (r, h, x, y, z, rotX = 0, rotZ = 0, seg = 12) => {
  const g = new THREE.CylinderGeometry(r, r, h, seg); if (rotX) g.rotateX(rotX); if (rotZ) g.rotateZ(rotZ); g.translate(x, y, z); return g;
};

// Варианты: [геометрия, материал, раскрашивать?]. Ось модели — вдоль z (поворачивается матрицей).
let PARTS = null;
function parts() {
  if (PARTS) return PARTS;
  const wheels = [];
  for (const sx of [-0.85, 0.85]) for (const sz of [-1.3, 1.3]) wheels.push(cyl(0.34, 0.24, sx, 0.34, sz, 0, Math.PI / 2, 14));
  PARTS = {
    0: [ // машина
      [box(1.8, 0.7, 4.2, 0, 0.62, 0), lam(0xffffff), true],
      [box(1.6, 0.55, 2.2, 0, 1.22, -0.2), lam(0x1a2228, 0x05080a), false],
      [merge(wheels), lam(0x111111), false],
      [merge([box(0.3, 0.12, 0.05, -0.6, 0.75, 2.11), box(0.3, 0.12, 0.05, 0.6, 0.75, 2.11)]), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }), false],
    ],
    1: [ // стол с перегородкой (офис)
      [box(3.4, 0.06, 1.5, 0, 0.75, 0.2), lam(0x8c7a5a), false],
      [merge([box(0.06, 0.75, 1.3, -1.6, 0.37, 0.2), box(0.06, 0.75, 1.3, 1.6, 0.37, 0.2)]), lam(0x3a3a3a), false],
      [box(3.6, 1.3, 0.08, 0, 0.65, -0.65), lam(0x5d6b6e), false],
      [merge([box(0.55, 0.38, 0.05, -0.7, 1.0, -0.3), box(0.55, 0.38, 0.05, 0.8, 1.0, -0.3)]), lam(0x1a1a1a, 0x0a1a20), false],
    ],
    2: [ // больничная кровать
      [box(1.2, 0.18, 2.4, 0, 0.62, 0), lam(0xd8dcd6), false],
      [merge([box(1.25, 0.06, 2.45, 0, 0.5, 0), box(0.05, 0.5, 0.05, -0.55, 0.25, -1.1), box(0.05, 0.5, 0.05, 0.55, 0.25, -1.1), box(0.05, 0.5, 0.05, -0.55, 0.25, 1.1), box(0.05, 0.5, 0.05, 0.55, 0.25, 1.1)]), lam(0x9aa0a4), false],
      [box(1.25, 1.3, 0.08, 0, 0.65, -1.22), lam(0x8a948e), false],
      [box(1.1, 0.06, 1.6, 0, 0.73, 0.3), lam(0xb0c4bc), false],
    ],
    3: [ // длинный стол переговорной
      [box(3.9, 0.08, 1.9, 0, 0.78, 0), lam(0x3a2a1c), false],
      [merge([box(0.1, 0.78, 1.4, -1.6, 0.39, 0), box(0.1, 0.78, 1.4, 1.6, 0.39, 0)]), lam(0x222222), false],
      [box(0.4, 0.04, 0.3, 0.6, 0.84, 0.2), lam(0xe8e4d0), false],
    ],
    4: [ // серверная стойка
      [box(3.8, 1.3, 1.1, 0, 0.65, 0), lam(0x1c1e22), false],
      [merge([0, 1, 2, 3, 4, 5].map((k) => box(3.6, 0.06, 0.02, 0, 0.2 + k * 0.18, 0.56))), new THREE.MeshBasicMaterial({ color: 0x30ff70 }), false],
    ],
    5: [ // прилавок / стойка кассы
      [box(3.8, 1.1, 1.2, 0, 0.55, 0), lam(0xc8c0b0), false],
      [box(3.9, 0.08, 1.3, 0, 1.14, 0), lam(0x3a3632), false],
      [box(0.5, 0.35, 0.4, 1.2, 1.35, 0), lam(0x202020), false],
    ],
    6: [ // штабель ящиков
      [merge([box(1.4, 1.0, 1.4, -0.9, 0.5, 0.6), box(1.2, 0.9, 1.2, 0.8, 0.45, -0.7), box(1.0, 0.7, 1.0, -0.6, 1.35, 0.5)]), lam(0x8a6a40), false],
    ],
    8: [ // ряд кресел кинотеатра
      [merge([-1.5, -0.5, 0.5, 1.5].map((x) => box(0.85, 0.45, 0.8, x, 0.45, 0.1))), lam(0x8a1420, 0x140204), false],
      [merge([-1.5, -0.5, 0.5, 1.5].map((x) => box(0.85, 0.85, 0.15, x, 0.85, -0.35))), lam(0x7a1018, 0x120204), false],
      [merge([-2, -1, 0, 1, 2].map((x) => box(0.12, 0.7, 0.8, x, 0.35, 0.05))), lam(0x1a1a1a), false],
    ],
    7: [ // низкий стеллаж с книгами/игрушками
      [box(3.8, 1.3, 0.8, 0, 0.65, 0), lam(0x6b4a2c), false],
      [merge([0.35, 0.8].map((y) => box(3.6, 0.36, 0.05, 0, y, 0.41))), lam(0x8c3a2a), true],
    ],
  };
  return PARTS;
}

// Простое слияние геометрий (позиции, нормали, uv)
function merge(geos) {
  let count = 0;
  const ps = geos.map((g) => { const ng = g.index ? g.toNonIndexed() : g; count += ng.attributes.position.count; return ng; });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of ps) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

const CAR_COLORS = [0x8a1e1e, 0x1e3a6a, 0xb8b8b0, 0x2a2a2a, 0x3a5a3a, 0xc8a040, 0x6a6a72, 0xe8e8e0];

// list: [{ x, y, z, aux, rot, seed }] → массив InstancedMesh
export function buildBlocks(list) {
  const out = [];
  const byAux = new Map();
  for (const b of list) { const k = parts()[b.aux] ? b.aux : 6; if (!byAux.has(k)) byAux.set(k, []); byAux.get(k).push(b); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  for (const [aux, items] of byAux) {
    for (const [geo, mat, tint] of parts()[aux]) {
      const mesh = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((b, i) => {
        q.setFromAxisAngle(up, b.rot); v.set(b.x, b.y, b.z);
        mesh.setMatrixAt(i, m4.compose(v, q, sc));
        if (tint) mesh.setColorAt(i, col.setHex(aux === 0 ? CAR_COLORS[b.seed % CAR_COLORS.length] : [0x8c3a2a, 0x2a5a8c, 0xc8a040, 0x3a7a4a][b.seed % 4]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      out.push(mesh);
    }
  }
  return out;
}

// Пандус (вместо ступеней) — наклонная плита на сегмент лестницы, подъём FH/2 вдоль +z
export function rampGeo(FH) {
  const rise = FH / 2, len = Math.hypot(TILE, rise);
  const g = new THREE.BoxGeometry(TILE, 0.18, len);
  g.rotateX(-Math.atan2(rise, TILE));
  g.translate(0, rise / 2 - 0.09, 0);
  return g;
}

// Эскалатор: металлические ступени, по бокам — стеклянные балюстрады с поручнями (подъём FH/2 вдоль +z)
export function escalatorParts(FH) {
  const n = 10, rise = FH / 2 / n, run = TILE / n, steps = [], sides = [], rails = [];
  for (let k = 0; k < n; k++) { const h = rise * (k + 1); steps.push(box(TILE - 1.2, h, run, 0, h / 2, -TILE / 2 + run * (k + 0.5))); }
  const len = Math.hypot(TILE, FH / 2), ang = Math.atan2(FH / 2, TILE);
  for (const sx of [-(TILE / 2 - 0.45), TILE / 2 - 0.45]) {
    const side = new THREE.BoxGeometry(0.08, 1.0, len); side.rotateX(-ang); side.translate(sx, FH / 4 + 0.5, 0); sides.push(side);
    const rail = new THREE.BoxGeometry(0.14, 0.08, len); rail.rotateX(-ang); rail.translate(sx, FH / 4 + 1.04, 0); rails.push(rail);
    const skirt = new THREE.BoxGeometry(0.5, 0.5, len); skirt.rotateX(-ang); skirt.translate(sx > 0 ? sx + 0.2 : sx - 0.2, FH / 4 - 0.1, 0); steps.push(skirt);
  }
  return [
    [merge(steps), lam(0x8a9096)],
    [merge(sides), new THREE.MeshLambertMaterial({ color: 0x9fd8e8, transparent: true, opacity: 0.35, depthWrite: false })],
    [merge(rails), lam(0x111111)],
  ];
}
