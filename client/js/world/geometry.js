// Геометрия многоэтажного уровня. Всё повторяющееся рисуется через InstancedMesh:
// стены, плиты пола и потолка, края провалов, лестницы, бассейны, вода, лазы, вертикальные лестницы, лампы.
import * as THREE from 'three';
import { BR, N, TILE } from '../core/util.js';

const { T, NN, SLAB, VENT_H, LOW_H } = BR;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Набор матриц → InstancedMesh
function instanced(geo, mat, list) {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((mx, i) => mesh.setMatrixAt(i, mx));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}
const mtx = (x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1) => {
  q.setFromAxisAngle(UP, rotY); v.set(x, y, z); sc.set(sx, sy, sz);
  return new THREE.Matrix4().compose(v, q, sc);
};

// Материал с повтором текстуры под клетку 4×4 м
function tileMat(base, perTile) {
  const m = base.clone();
  for (const key of ['map', 'bumpMap']) {
    if (!m[key]) continue;
    m[key] = m[key].clone();
    m[key].repeat.set(perTile, perTile);
    m[key].needsUpdate = true;
  }
  return m;
}

// Вертикальная клетка-«стремянка»: две стойки и перекладины, у стены
function ladderGeo(h) {
  const parts = [];
  for (const sx of [-0.45, 0.45]) { const g = new THREE.BoxGeometry(0.07, h, 0.07); g.translate(sx, h / 2, 0); parts.push(g); }
  for (let y = 0.3; y < h; y += 0.32) { const g = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6); g.rotateZ(Math.PI / 2); g.translate(0, y, 0); parts.push(g); }
  return mergeGeos(parts);
}

// Сегмент лестницы: 8 ступеней на клетку, подъём FH/2, направление подъёма — +z (поворачивается матрицей)
function stairGeo(FH) {
  const parts = [], n = 8, rise = FH / 2 / n, run = TILE / n;
  for (let k = 0; k < n; k++) {
    const h = rise * (k + 1);
    const g = new THREE.BoxGeometry(TILE, h, run);
    g.translate(0, h / 2, -TILE / 2 + run * (k + 0.5));
    parts.push(g);
  }
  return mergeGeos(parts);
}

// Простое слияние BufferGeometry (позиции, нормали, uv) без зависимостей
function mergeGeos(geos) {
  let count = 0;
  const parts = geos.map((g) => { const ng = g.index ? g.toNonIndexed() : g; count += ng.attributes.position.count; return ng; });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

// Анимированная вода (общий материал, сдвиг текстуры — в animateWater)
let waterTex = null;
function getWaterMat() {
  if (!waterTex) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#2f8fa0'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(200,255,255,.35)'; g.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 6 + Math.random() * 22;
      g.beginPath(); g.ellipse(x, y, r, r * 0.45, Math.random() * 3, 0, Math.PI * 1.3); g.stroke();
    }
    waterTex = new THREE.CanvasTexture(c);
    waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshPhongMaterial({ map: waterTex, color: 0x9fe6ee, transparent: true, opacity: 0.62, shininess: 120, specular: 0x88bbcc, depthWrite: false, side: THREE.DoubleSide });
}
export function animateWater(dt) { if (waterTex) { waterTex.offset.x += dt * 0.02; waterTex.offset.y += dt * 0.013; } }

/*
  Строит группу с геометрией уровня.
  mats: { wall, floor, ceil } — материалы стиля; st — стиль (лампы, повторы текстур); seed — для раскладки ламп.
  Возвращает { group, water } — water.update(map) перестраивает поверхности воды при смене уровня воды.
*/
export function buildLevelGeometry(map, mats, st, seed, panelMat) {
  const group = new THREE.Group();
  const { F, FH } = map;
  const FULL = N * TILE;
  const floorMat = tileMat(mats.floor, (st.fr ? FULL / st.fr : 3) * TILE / FULL);
  const ceilMat = tileMat(mats.ceil, (st.cr ? FULL / st.cr : 4) * TILE / FULL);
  const wallMat = mats.wall;
  const ex = map.exit;
  const isExit = (f, i) => f === ex.f && i === ex.cell;

  const walls = [], floors = [], ceils = [], edges = [], stairs = [], ladders = [], fills = [], panels = [];
  const poolFloors = [], poolSides = [];
  const flatTypes = new Set([T.FLOOR, T.LOW, T.LADDER, T.VENT]);

  for (let f = 0; f < F; f++) {
    const b = f * FH, L = map.t[f];
    for (let i = 0; i < NN; i++) {
      const x = BR.centerX(i), z = BR.centerZ(i), cx = BR.cellX(i), cz = BR.cellZ(i);
      const t = isExit(f, i) ? T.FLOOR : L[i];
      if (t === T.WALL) {
        // стена видна, если рядом на этом этаже не стена
        let vis = false;
        for (const [dx, dz] of BR.D4) {
          const nx = cx + dx, nz = cz + dz;
          if (BR.inside(nx, nz) && (L[nx + nz * N] !== T.WALL || isExit(f, nx + nz * N))) { vis = true; break; }
        }
        if (vis) walls.push(mtx(x, b + FH / 2, z));
        continue;
      }
      if (flatTypes.has(t)) floors.push(mtx(x, b, z));
      if (t === T.STAIR) {
        const d = BR.stairDir(map.a[f][i]), s = BR.stairSeg(map.a[f][i]);
        const rot = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][d]; // +z геометрии → направление подъёма
        stairs.push(mtx(x, b + s * FH / 2, z, rot));
        if (s === 1) fills.push(mtx(x, b + FH / 4, z, rot, 1, FH / 2 / FH, 1)); // опора под верхним сегментом
      }
      if (t === T.POOL) {
        const depth = map.a[f][i] * 0.25;
        poolFloors.push(mtx(x, b - depth, z));
        BR.D4.forEach(([dx, dz], d) => {
          const j = (cx + dx) + (cz + dz) * N;
          if (L[j] === T.POOL) return;
          const rot = [-Math.PI / 2, Math.PI / 2, Math.PI, 0][d];
          poolSides.push(mtx(x + dx * TILE / 2, b - depth / 2, z + dz * TILE / 2, rot, 1, depth, 1));
        });
      }
      if (t === T.LADDER) {
        const d = map.a[f][i] & 3, [dx, dz] = BR.D4[d];
        ladders.push(mtx(x + dx * (TILE / 2 - 0.08), b, z + dz * (TILE / 2 - 0.08), Math.atan2(dx, dz)));
      }
      // «потолок» у лаза и низкого коридора — заполненный блок
      if (t === T.VENT || t === T.LOW) {
        const h0 = b + (t === T.VENT ? VENT_H : LOW_H), h1 = b + FH;
        fills.push(mtx(x, (h0 + h1) / 2, z, 0, 1, (h1 - h0) / FH, 1));
      }
      // потолок: низ перекрытия верхнего этажа или крыша
      const up = f + 1 < F ? map.t[f + 1][i] : -1;
      if (t !== T.VENT && t !== T.LOW && up !== T.HOLE) {
        const cy = f + 1 < F ? b + FH - SLAB : b + FH;
        ceils.push(mtx(x, cy, z));
        const h = Math.sin(cx * 12.9898 + cz * 78.233 + seed + f * 7.1) * 43758.5453;
        if (t !== T.STAIR && st.panel.test(cx, cz, h - Math.floor(h))) panels.push(mtx(x, cy - 0.02, z));
      }
      // края провала: торец перекрытия
      if (t === T.HOLE) {
        BR.D4.forEach(([dx, dz], d) => {
          const nx = cx + dx, nz = cz + dz;
          if (!BR.inside(nx, nz)) return;
          const tj = L[nx + nz * N];
          if (tj === T.HOLE || tj === T.WALL) return;
          const rot = [-Math.PI / 2, Math.PI / 2, Math.PI, 0][d];
          edges.push(mtx(x + dx * TILE / 2, b - SLAB / 2, z + dz * TILE / 2, rot, 1, SLAB, 1));
        });
      }
    }
  }

  const add = (mesh) => { if (mesh) group.add(mesh); return mesh; };
  add(instanced(new THREE.BoxGeometry(TILE, FH, TILE), wallMat, walls));
  const fl = new THREE.PlaneGeometry(TILE, TILE); fl.rotateX(-Math.PI / 2);
  add(instanced(fl, floorMat, floors));
  add(instanced(fl.clone(), floorMat, poolFloors));
  const cl = new THREE.PlaneGeometry(TILE, TILE); cl.rotateX(Math.PI / 2);
  add(instanced(cl, ceilMat, ceils));
  // вертикальная грань единичной высоты, смотрит в +z (поворачивается матрицей)
  const face = new THREE.PlaneGeometry(TILE, 1);
  add(instanced(face, wallMat, edges));
  add(instanced(face.clone(), floorMat, poolSides));
  add(instanced(new THREE.BoxGeometry(TILE, FH, TILE), wallMat, fills));
  add(instanced(stairGeo(FH), floorMat, stairs));
  add(instanced(ladderGeo(FH + 1.1), new THREE.MeshLambertMaterial({ color: 0x8a8f94 }), ladders));
  const pg = new THREE.PlaneGeometry(st.panel.size, st.panel.size); pg.rotateX(Math.PI / 2);
  add(instanced(pg, panelMat, panels));

  // Вода: одна поверхность на клетку; уровень берётся из map.wl и может меняться
  const waterMat = getWaterMat();
  const waterCells = [];
  for (let i = 0; i < NN; i++) if (map.wz[i] >= 0) waterCells.push(i);
  let waterMesh = null;
  if (waterCells.length) {
    const wg = new THREE.PlaneGeometry(TILE, TILE); wg.rotateX(-Math.PI / 2);
    waterMesh = new THREE.InstancedMesh(wg, waterMat, waterCells.length);
    waterMesh.frustumCulled = false; waterMesh.renderOrder = 2;
    group.add(waterMesh);
  }
  const water = {
    update() {
      if (!waterMesh) return;
      waterCells.forEach((i, k) => {
        const lvl = map.wl[map.wz[i]];
        waterMesh.setMatrixAt(k, mtx(BR.centerX(i), lvl, BR.centerZ(i)));
      });
      waterMesh.instanceMatrix.needsUpdate = true;
    },
  };
  water.update();
  return { group, water, tileMats: [floorMat, ceilMat] };
}
