// Построение уровня на клиенте: карта из общего генератора, геометрия этажей, объекты, декор
import * as THREE from 'three';
import { BR, LEVELS } from '../core/util.js';
import { scene } from '../render/scene.js';
import { applyStyle, curStyle, mats, panelMat } from '../render/lighting.js';
import { settings } from '../core/settings.js';
import { createObj } from './objects.js';
import { addDecor, addObstacle } from './props.js';
import { buildLevelGeometry } from './geometry.js';
import { buildDoorPlates, buildFx } from './fx.js';

/* ============================== Мир ============================== */
export let map = null, world = null, H = 3.2, curLevel = 0, water = null, fx = null, plates = null;
let geoGroup = null, curSeed = 0;
export const objs = new Map(); // id -> {o, group, parts, baseY}
let extraMats = [];

// Освободить геометрию, материалы и текстуры (кроме общих материалов стиля)
const SHARED = new Set();
function disposeWorld() {
  if (!world) return;
  scene.remove(world);
  world.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      if (!m || SHARED.has(m) || m === panelMat || Object.values(mats || {}).includes(m)) continue;
      if (m.map && !m.map.userData.shared) m.map.dispose();
      m.dispose();
    }
  });
  for (const m of extraMats) { if (m.map) m.map.dispose(); m.dispose(); }
  extraMats = [];
  geoGroup = null; fx = null;
  world = null;
  objs.clear();
}

export const G = { doorObj: null }; // служебные данные текущего уровня

// wl — текущие уровни воды с сервера (могут отличаться от начальных)
export function buildWorld(level, seed, objList, wl) {
  disposeWorld();
  curLevel = level;
  const st = applyStyle(LEVELS[level].style);
  map = BR.generate(seed, level);
  if (wl) wl.forEach((v, i) => { map.wl[i] = v; });
  H = map.FH;
  G.doorObj = null;
  world = new THREE.Group();
  curSeed = seed;
  buildGeo();
  fx = buildFx(map);
  // декоративный свет помечаем: на «Низком» он выключен (каждый источник дорог для шейдеров)
  fx.group.traverse((o) => { if (o.isPointLight || o.isSpotLight) { o.userData.fx = true; o.visible = !!settings.fxLights; } });
  world.add(fx.group);
  if (plates) plates.dispose();
  plates = buildDoorPlates(map);
  if (plates) world.add(plates.mesh);

  // Объекты (дверь первой, чтобы терминал знал её направление)
  const sorted = objList.slice().sort((a, b) => (a.kind === 'door' ? -1 : 0) - (b.kind === 'door' ? -1 : 0));
  for (const o of sorted) addObj(o);
  addDecor(world, LEVELS[level].style, seed);
  for (const o of map.obst || []) world.add(addObstacle(o));
  scene.add(world);
  return map;
}

export function addObj(o) {
  const rec = createObj(o);
  rec.baseY = o.y || 0;
  rec.group.position.y += rec.baseY;
  world.add(rec.group);
  objs.set(o.id, rec);
}

export function removeObj(id) {
  const rec = objs.get(id);
  if (rec) { world.remove(rec.group); objs.delete(id); }
}

// Сервер изменил уровень воды
export function setWater(levels) {
  if (!map) return;
  levels.forEach((v, i) => { map.wl[i] = v; });
  map.navDirty = true;
  if (water) water.update();
}

// Геометрия уровня (пересобирается целиком, когда сервер меняет клетки: шлюзы, люки, обрушения)
function buildGeo() {
  if (geoGroup) {
    world.remove(geoGroup);
    geoGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of extraMats) { if (m.map) m.map.dispose(); m.dispose(); }
  }
  const geo = buildLevelGeometry(map, mats, LEVEL_STYLE(), curSeed, panelMat);
  geoGroup = geo.group;
  world.add(geoGroup);
  water = geo.water;
  extraMats = geo.tileMats;
}
const LEVEL_STYLE = () => curStyle;

// Сменились настройки графики (PBR, тени): пересобрать материалы и геометрию текущего уровня
export function refreshGraphics() {
  if (!map || !world) return;
  applyStyle(LEVELS[curLevel].style);
  buildGeo();
  if (fx) world.traverse((o) => { if ((o.isPointLight || o.isSpotLight) && o.userData.fx) o.visible = !!settings.fxLights; });
}

// Сервер изменил клетку карты (геометрию пересобираем не чаще раза в кадр)
let geoPending = false;
export function setCellLocal(f, i, type, aux) {
  if (!map) return;
  BR.setCell(map, f, i, type, aux);
  if (geoPending) return;
  geoPending = true;
  queueMicrotask(() => { geoPending = false; if (map) buildGeo(); });
}

// Сервер добавил препятствие (упавшая каталка)
export function addObstacleNet(o) {
  if (!map || !world) return;
  map.obst = map.obst || [];
  if (!map.obst.includes(o)) map.obst.push(o);
  const mesh = addObstacle(o);
  if (o.fell) mesh.rotation.z = 0.25;
  world.add(mesh);
}
