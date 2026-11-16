'use strict';
// Чистая сборка уровня: карта + объекты + существа + состояние головоломок.
// Без сети и побочных эффектов — используется и сервером, и тестами (verify-levels).
const BR = require('../shared/map.js');
const { LEVELS, NN } = BR;
const { PUZZLES } = require('./puzzles');
const { newMob } = require('./mobs');

// team — улучшения команды (team.map — улучшенная карта уже найдена); opts.forceMap — для отладки
function buildLevel(idx, seed, team, opts = {}) {
  const cfg = LEVELS[idx];
  const map = BR.generate(seed, idx);
  const rnd = BR.mulberry32(seed ^ 0x5bd1e995);
  const maxD = map.maxDist;
  const pz = {};
  for (const [name, P] of Object.entries(PUZZLES)) pz[name] = P.init(cfg);
  const G = {
    idx, cfg, seed, map, rnd, objs: [], mobs: [], state: 'play', timer: 0, exitArmed: false, exitTimer: 0,
    nextId: 1, doorOpen: false, pz,
  };
  const add = (kind, props) => { const o = Object.assign({ id: G.nextId++, kind }, props); G.objs.push(o); return o; };

  BR.pickSpots(map, rnd, cfg.water, { minDist: 8, minSep: 5 }).forEach((p) => add('water', { x: p.x, y: p.y, z: p.z }));
  if (!team.map && ((opts.forceMap && cfg.mapChance) || rnd() < (cfg.mapChance || 0))) {
    const mp = BR.pickSpots(map, rnd, 1, { minDist: 0.2 * maxD })[0];
    add('mapitem', { x: mp.x, y: mp.y, z: mp.z });
  }
  if (cfg.chase) { // стрелки на полу вдоль маршрута к двери
    const rt = BR.route(map);
    for (let i = 4; i + 3 < rt.length; i += 7) {
      const a = BR.nodePos(map, rt[i]), b = BR.nodePos(map, rt[i + 3]);
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      add('arrow', { x: a.x, y: a.y, z: a.z, dx: dx / len, dz: dz / len });
    }
  }
  // Порядок вызовов setup важен: он расходует общий rnd, а значит определяет расстановку
  for (const p of Object.keys(PUZZLES)) if (cfg.puzzles.includes(p)) PUZZLES[p].setup(G, add, rnd);

  const e = map.exit;
  G.door = add('door', { x: e.wx, y: e.y, z: e.wz, fx: e.fx, fz: e.fz, dx: e.dx, dz: e.dz, open: false });

  if (cfg.chase) {
    G.chaseState = 'idle';
    for (let i = 0; i < cfg.mobs; i++) { const m = newMob(map, 0, 0, 0, 9999); chasePackPos(G, m, i); G.mobs.push(m); }
  } else {
    BR.pickSpots(map, rnd, cfg.mobs, { minDist: 0.55 * maxD, minSep: 8 }).forEach((p) => G.mobs.push(newMob(map, p.x, p.y, p.z, 5)));
  }
  if (!cfg.puzzles.length) { G.doorOpen = true; BR.setDoor(map, true); G.door.open = true; } // уровни без головоломки
  return G;
}

// Стая на уровне-погоне стоит у старта
function chasePackPos(G, m, i) {
  const s = G.map.spawn;
  m.body.x = m.x = s.x + (i % 2 ? 1 : -1) * 0.5;
  m.body.z = m.z = s.z + (i > 1 ? 0.8 : -0.4);
  m.body.y = m.y = s.y; m.body.vy = 0;
}

module.exports = { buildLevel, chasePackPos, NN };
