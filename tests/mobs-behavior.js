'use strict';
// Поведение существ без сети: у каждого — свои чувства и характер.
//  Червь прячется и слышит только бег; Фары видят только перед собой; статуи замирают под взглядом;
//  Воспитательница спит под шкатулку; Ползун лезет в вентиляцию; Надсмотрщик проламывает стену.
const assert = require('assert');
const BR = require('../shared/map.js');
const { newMob, updateMob } = require('../server/mobs.js');

const DT = 0.05;
function level(idx, seed = 7) {
  const map = BR.generate(seed, idx);
  BR.ensureNav(map);
  return { map, cfg: Object.assign({ mobSpeed: 1 }, BR.LEVELS[idx]), mobs: [], objs: [] };
}
// Игрок в узле n, смотрит в сторону (dx, dz)
function player(G, n, o = {}) {
  const p = BR.nodePos(G.map, n);
  const yaw = o.look ? Math.atan2(-(o.look.x - p.x), -(o.look.z - p.z)) : 0;
  return Object.assign({ x: p.x, y: p.y, z: p.z, r: yaw, node: n, fl: false, crouch: false, spd: 0 }, o.p || {});
}
// Пара узлов на одном этаже с прямой видимостью на расстоянии [d0, d1] метров
function visiblePair(G, d0, d1, rnd = Math.random) {
  const sp = G.map.spots;
  for (let k = 0; k < 20000; k++) {
    const a = sp[Math.floor(rnd() * sp.length)], b = sp[Math.floor(rnd() * sp.length)];
    const pa = BR.nodePos(G.map, a), pb = BR.nodePos(G.map, b);
    const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
    if (pa.f !== pb.f || d < d0 || d > d1) continue;
    if (BR.los3(G.map, pa.x, pa.y + 1.6, pa.z, pb.x, pb.y + 1.6, pb.z)) return [a, b, pa, pb];
  }
  throw new Error('нет пары узлов');
}
function spawn(G, type, n) { const p = BR.nodePos(G.map, n); const m = newMob(G.map, p.x, p.y, p.z, 0, type); G.mobs.push(m); return m; }
const run = (G, m, players, sec) => { for (let t = 0; t < sec; t += DT) updateMob(G, m, DT, players); };

// Червь: прячется, пока все идут; бег рядом — вылезает и гонится
{
  const G = level(2);
  const [a, b] = visiblePair(G, 14, 24);
  const m = spawn(G, 'worm', a);
  const walker = player(G, b, { p: { spd: 2.5 } });
  run(G, m, [walker], 1);
  assert(m.hidden && m.mode !== 'chase', 'Червь заметил идущего шагом');
  walker.spd = 6;
  run(G, m, [walker], 0.5);
  assert(!m.hidden && m.mode === 'chase', 'Червь не услышал бег');
  console.log('  Червь: шаг не слышит, на бег вылезает из труб');
}

// Фары: игрок за спиной не замечен, перед «лицом» — замечен
{
  const G = level(1);
  const [a, b, pa, pb] = visiblePair(G, 6, 14);
  const m = spawn(G, 'headlights', a);
  m.r = Math.atan2(pa.x - pb.x, pa.z - pb.z); // спиной к игроку
  m.turnT = 999;
  const p = player(G, b);
  run(G, m, [p], 0.5);
  assert(m.mode !== 'chase', 'Фары заметили игрока за спиной');
  m.r = Math.atan2(pb.x - pa.x, pb.z - pa.z); // лицом
  run(G, m, [p], 0.2);
  assert.strictEqual(m.mode, 'chase', 'Фары не заметили игрока перед собой');
  console.log('  Фары: за спиной — не видят, перед собой — бросаются');
}

// Статуи: под взглядом замирают, за спиной идут
for (const type of ['mannequin', 'bellhop']) {
  const G = level(0);
  const [a, b, pa] = visiblePair(G, 5, 8);
  const m = spawn(G, type, a);
  const p = player(G, b, { look: pa, p: { fl: true } });
  const x0 = m.x, z0 = m.z;
  run(G, m, [p], 1);
  assert(m.frozen && Math.hypot(m.x - x0, m.z - z0) < 0.01, `${type}: двигается под взглядом`);
  p.r += Math.PI; // отвернулся
  run(G, m, [p], 1);
  assert(!m.frozen && Math.hypot(m.x - x0, m.z - z0) > 0.5, `${type}: не двигается за спиной`);
  console.log(`  ${BR.MOB_NAMES[type]}: под взглядом замирает, за спиной — подкрадывается`);
}

// Воспитательница: под музыкальную шкатулку спит и не ловит
{
  const G = level(0);
  const [a, b] = visiblePair(G, 4, 7);
  const m = spawn(G, 'teacher', a);
  const p = player(G, b, { p: { spd: 6 } });
  G.musicT = 5;
  run(G, m, [p], 1);
  assert(m.frozen && m.mode === 'sleep', 'Воспитательница не уснула под шкатулку');
  G.musicT = 0;
  run(G, m, [p], 0.3);
  assert(!m.frozen && m.mode === 'chase', 'Воспитательница не проснулась');
  console.log('  Воспитательница: спит под шкатулку, просыпается в тишине');
}

// Ползун ходит через вентиляцию: в графе существ-ползунов есть лазы, которых нет у обычных
{
  const G = level(2);
  const crawl = BR.navCrawl(G.map), mob = G.map.navMob;
  let vents = 0, plain = 0;
  for (let n = 0; n < crawl.total; n++) if (crawl.out[n] && G.map.t[Math.floor(n / BR.NN)][n % BR.NN] === BR.T.VENT) { vents++; if (mob.out[n]) plain++; }
  assert(vents > 0 && plain === 0, 'граф ползунов не отличается от обычного');
  console.log(`  Ползун/Червь: ходят по ${vents} клеткам вентиляции, обычные существа — нет`);
}

// Надсмотрщик проламывает стену между собой и целью
{
  const G = level(0, 11);
  G.map.dist = G.map.dist || BR.bfsNav(G.map.nav, G.map.spawnNode);
  const { T, N, NN } = BR;
  let found = null;
  for (let i = 0; i < NN && !found; i++) {
    const x = BR.cellX(i), z = BR.cellZ(i);
    if (!BR.inner(x, z) || G.map.t[1][i] !== T.WALL || (G.map.reserved && G.map.reserved.has(i))) continue;
    const l = i - 1, r = i + 1;
    if (x < 2 || x > N - 3) continue;
    if (G.map.t[1][l] === T.FLOOR && G.map.t[1][r] === T.FLOOR && G.map.dist[NN + l] >= 0 && G.map.dist[NN + r] >= 0) found = { i, l, r };
  }
  assert(found, 'не нашлось тонкой стены');
  const m = spawn(G, 'overseer', NN + found.l);
  const p = player(G, NN + found.r, { p: { spd: 6 } });
  run(G, m, [p], 1);
  assert.strictEqual(G.map.t[1][found.i], T.FLOOR, 'Надсмотрщик не проломил стену');
  console.log('  Надсмотрщик: проламывает стену к цели');
}

console.log('OK mobs-behavior: у каждого существа свои чувства и характер');
