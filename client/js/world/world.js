// Построение геометрии уровня из карты
import * as THREE from 'three';
import { BR, FULL, LEVELS, N, TILE } from '../core/util.js';
import { scene } from '../render/scene.js';
import { applyStyle, mats, panelMat } from '../render/lighting.js';
import { createObj } from './objects.js';
import { addDecor, addObstacle } from './props.js';

/* ============================== Мир ============================== */
export let map = null, world = null, H = 3.2, curLevel = 0;
export const objs = new Map(); // id -> {o, group, parts}

function disposeWorld() {
  if (!world) return;
  scene.remove(world);
  world.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  world = null;
  objs.clear();
}

export const G = { doorObj: null }; // служебные данные текущего уровня

export function buildWorld(level, seed, objList) {
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
