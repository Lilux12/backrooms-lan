'use strict';
// Чистая сборка уровня: карта + объекты + существа + состояние головоломок.
// Без сети и побочных эффектов — используется и сервером, и тестами (verify-levels).
const BR = require('../shared/map.js');
const { LEVELS, NN } = BR;
const { PUZZLES } = require('./puzzles');
const { newMob } = require('./mobs');
const SS = require('./skinstealer');

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

  if (!opts.dry) BR.pickSpots(map, rnd, cfg.water, { minDist: 8, minSep: 5 }).forEach((p) => add('water', { x: p.x, y: p.y, z: p.z }));
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

  // Лифты: кабина на каждом этаже шахты, E — поехать на следующий этаж
  (map.lifts || []).forEach((L, k) => {
    for (const f of L.floors) add('lift', { x: BR.centerX(L.x + L.z * BR.N), y: f * map.FH, z: BR.centerZ(L.x + L.z * BR.N), f, shaft: k, d: L.d, broken: !!L.broken });
  });

  const e = map.exit;
  G.door = add('door', { x: e.wx, y: e.y, z: e.wz, fx: e.fx, fz: e.fz, dx: e.dx, dz: e.dz, open: false });

  // Записки и кассеты с историей уровня (сюжет без слов)
  if (cfg.lore) {
    BR.pickWallSpots(map, rnd, cfg.lore.length, { minDist: 0.1 * maxD, minSep: 6 })
      .forEach((p, k) => add('lore', { x: p.x, y: p.y, z: p.z, nx: p.nx, nz: p.nz, title: cfg.lore[k].title, text: cfg.lore[k].text }));
  }

  // Предметы против двойника и клетки для его жертв
  if (cfg.items) {
    BR.pickSpots(map, rnd, cfg.items.detector || 0, { minDist: 0.2 * maxD }).forEach((p) => add('detector', { x: p.x, y: p.y, z: p.z }));
    BR.pickSpots(map, rnd, cfg.items.noisemaker || 0, { minDist: 0.1 * maxD, minSep: 6 }).forEach((p) => add('noisemaker', { x: p.x, y: p.y, z: p.z }));
  }
  if (cfg.skinstealer) SS.placeCages(G, add, rnd);
  // Шкафчики: можно спрятаться от существ (у стены, лицом в комнату)
  if (!cfg.chase) {
    BR.pickWallSpots(map, rnd, cfg.lockers == null ? 4 : cfg.lockers, { minDist: 0.1 * maxD, minSep: 8 })
      .forEach((p) => add('locker', { x: p.x + p.nx * 0.55, y: p.y, z: p.z + p.nz * 0.55, nx: p.nx, nz: p.nz, who: 0 }));
  }
  // Пасхалки: номер 237 в отеле, «4813-я лампа» в Жёлтых комнатах
  if (map.lv && map.lv.rooms) {
    const r = map.lv.rooms.find((q) => q.num === 237);
    if (r && !G.objs.some((o) => o.kind === 'key' && o.room === 237)) {
      add('lore', { x: BR.centerX(r.cells[2]), y: r.f * map.FH, z: BR.centerZ(r.cells[2]), title: 'Номер 237', egg: 'shining',
        text: 'В ванной номера 237 полная ванна тёплой воды. На зеркале губной помадой: «ВСЯ РАБОТА И НИКАКОЙ ИГРЫ…»\nДальше смыто. Пахнет старыми коврами и чем-то очень знакомым.' });
    }
  }
  if (idx === 0 && rnd() < 0.08) {
    const p = BR.pickSpots(map, rnd, 1, { minDist: 0.5 * maxD })[0];
    if (p) add('egg', { x: p.x, y: p.y, z: p.z, title: '4813-я лампа' });
  }
  // Воскрешение: аптечки и алтарь на каждом уровне (кроме погони и хардкора)
  if (!cfg.chase && opts.revive !== false) {
    BR.pickSpots(map, rnd, cfg.medkits == null ? 2 : cfg.medkits, { minDist: 0.25 * maxD, minSep: 10 }).forEach((p) => add('medkit', { x: p.x, y: p.y, z: p.z }));
    const al = BR.pickSpots(map, rnd, 1, { minDist: 0.45 * maxD })[0];
    if (al) add('altar', { x: al.x, y: al.y, z: al.z, used: false });
  }

  const list = cfg.mobList || [{ type: cfg.mobType, count: cfg.mobs }];
  if (cfg.chase) {
    G.chaseState = 'idle';
    for (let i = 0; i < cfg.mobs; i++) { const m = newMob(map, 0, 0, 0, 9999, cfg.mobType); chasePackPos(G, m, i); G.mobs.push(m); }
  } else {
    for (const { type, count } of list) {
      if (type === 'drowner') {
        // Утопленник появляется в самой большой зоне глубокой воды
        for (let k = 0; k < count; k++) {
          const n = deepestWaterNode(map, rnd);
          if (n >= 0) { const p = BR.nodePos(map, n); G.mobs.push(newMob(map, p.x, p.y, p.z, 8, 'drowner')); }
        }
        continue;
      }
      BR.pickSpots(map, rnd, count, { minDist: 0.55 * maxD, minSep: 8 }).forEach((p) => G.mobs.push(newMob(map, p.x, p.y, p.z, 5, type)));
    }
  }
  // большая команда — на одно существо больше (основного типа уровня)
  if (!cfg.chase && (opts.players || 0) >= 4) {
    const main = list.find((q) => q.type !== 'drowner');
    if (main) { const p = BR.pickSpots(map, rnd, 1, { minDist: 0.6 * maxD })[0]; if (p) G.mobs.push(newMob(map, p.x, p.y, p.z, 8, main.type)); }
  }
  if (cfg.puzzles.every((p) => pz[p].solved)) { G.doorOpen = true; BR.setDoor(map, true); G.door.open = true; } // уровни без головоломки
  if (cfg.skinstealer) SS.createStealer(G);
  return G;
}

// Узел в самой большой зоне глубокой воды (где можно плавать)
function deepestWaterNode(map, rnd) {
  const byZone = new Map();
  for (let f = 0; f < map.F; f++) for (let i = 0; i < BR.NN; i++) {
    if (!BR.WALKABLE[map.t[f][i]] || map.wz[i] < 0 || BR.waterDepth(map, f, i) <= 1.2) continue;
    const z = map.wz[i];
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z).push(f * BR.NN + i);
  }
  let best = [];
  for (const list of byZone.values()) if (list.length > best.length) best = list;
  return best.length ? best[Math.floor(rnd() * best.length)] : -1;
}

// Стая на уровне-погоне стоит у старта
function chasePackPos(G, m, i) {
  const s = G.map.spawn;
  m.body.x = m.x = s.x + (i % 2 ? 1 : -1) * 0.5;
  m.body.z = m.z = s.z + (i > 1 ? 0.8 : -0.4);
  m.body.y = m.y = s.y; m.body.vy = 0;
}

module.exports = { buildLevel, chasePackPos, NN };
