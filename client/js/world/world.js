// Построение уровня на клиенте: карта из общего генератора, геометрия этажей, объекты, декор
import * as THREE from 'three';
import { BR, LEVELS } from '../core/util.js';
import { scene } from '../render/scene.js';
import { applyStyle, mats, panelMat } from '../render/lighting.js';
import { createObj } from './objects.js';
import { addDecor, addObstacle } from './props.js';
import { buildLevelGeometry } from './geometry.js';

/* ============================== Мир ============================== */
export let map = null, world = null, H = 3.2, curLevel = 0, water = null;
export const objs = new Map(); // id -> {o, group, parts, baseY}
let extraMats = [];

function disposeWorld() {
  if (!world) return;
  scene.remove(world);
  world.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  for (const m of extraMats) { if (m.map) m.map.dispose(); m.dispose(); }
  extraMats = [];
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
  const geo = buildLevelGeometry(map, mats, st, seed, panelMat);
  world.add(geo.group);
  water = geo.water;
  extraMats = geo.tileMats;

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
