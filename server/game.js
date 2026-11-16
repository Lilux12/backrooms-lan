'use strict';
// Игровой процесс на сервере: запуск уровней, тик мира, сообщения игроков.
const BR = require('../shared/map.js');
const { TILE, N, LEVELS } = BR;
const config = require('./config');
const state = require('./state');
const { joinedList, joinedCount, broadcast, sendPlayers, log } = require('./clients');
const { newMob, updateMob, randomFloorFar } = require('./mobs');
const { PUZZLES, patch, removeObj, goalLines, sendGoals, enterCode, PICK_DIST } = require('./puzzles');

const CATCH_DIST = 1.3;       // существо ловит на таком расстоянии
const INVULN = 4;             // неуязвимость после появления, с
const USE_DIST = 3.6;         // дальность взаимодействия (E)
const EXIT_DIST = 2.6;        // радиус «у двери»
const EXIT_WAIT = 8;          // сколько ждём остальных, когда кто-то у двери
const CHASE_WAKE_DIST = 9;    // «Беги!»: стая просыпается, когда игрок отошёл от старта

function placeAtSpawn(c) {
  const G = state.G, s = G.map.spawn;
  c.x = s.x + (c.id % 2 ? 0.8 : -0.8);
  c.z = s.z + ((c.id >> 1) % 2 ? 0.8 : -0.8);
  c.invuln = INVULN;
  const near = config.TEST_NEAR && G.objs.find((o) => o.kind === config.TEST_NEAR);
  if (near) { // только для отладки: появиться рядом с объектом
    const tries = near.nx !== undefined ? [[near.nx, near.nz]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of tries) {
      if (!BR.isWall(G.map, near.x + dx * 2.2, near.z + dz * 2.2)) { c.x = near.x + dx * 2.2; c.z = near.z + dz * 2.2; break; }
    }
  }
}

// Стая на уровне-погоне стоит у старта
function chasePackPos(G, m, i) {
  m.x = G.map.spawn.x + (i % 2 ? 1 : -1) * 0.5;
  m.z = G.map.spawn.z + (i > 1 ? 0.8 : -0.4);
}

function startLevel(idx) {
  const cfg = LEVELS[idx];
  const seed = (Math.random() * 0x7fffffff) >>> 0;
  const map = BR.generate(seed, idx);
  const rnd = BR.mulberry32(seed ^ 0x5bd1e995);
  const maxD = map.maxDist;
  if (idx === 0) state.TEAM.map = false;
  const pz = {};
  for (const [name, P] of Object.entries(PUZZLES)) pz[name] = P.init(cfg);
  const G = state.G = {
    idx, cfg, seed, map, rnd, objs: [], mobs: [], state: 'play', timer: 0, exitArmed: false, exitTimer: 0,
    nextId: 1, doorOpen: false, pz,
  };
  const add = (kind, props) => { const o = Object.assign({ id: G.nextId++, kind }, props); G.objs.push(o); return o; };

  BR.pickSpots(map, rnd, cfg.water, { minDist: 8, minSep: 5 }).forEach((p) => add('water', { x: p.x, z: p.z }));
  if (!state.TEAM.map && ((config.FORCE_MAP && cfg.mapChance) || rnd() < (cfg.mapChance || 0))) {
    const mp = BR.pickSpots(map, rnd, 1, { minDist: 0.2 * maxD })[0];
    add('mapitem', { x: mp.x, z: mp.z });
  }
  if (cfg.chase) { // стрелки на полу вдоль маршрута к двери
    const rt = BR.route(map);
    for (let i = 4; i + 3 < rt.length; i += 7) {
      const a = rt[i], b = rt[i + 3];
      const dx = (b % N) - (a % N), dz = ((b / N) | 0) - ((a / N) | 0);
      const len = Math.hypot(dx, dz) || 1;
      add('arrow', { x: ((a % N) + 0.5) * TILE, z: (((a / N) | 0) + 0.5) * TILE, dx: dx / len, dz: dz / len });
    }
  }
  // Порядок вызовов setup важен: он расходует общий rnd, а значит определяет расстановку
  for (const p of ['fuses', 'code', 'plates', 'levers']) if (cfg.puzzles.includes(p)) PUZZLES[p].setup(G, add, rnd);

  const e = map.exit;
  G.door = add('door', { x: e.wx, z: e.wz, fx: e.fx, fz: e.fz, dx: e.dx, dz: e.dz, open: false });

  if (cfg.chase) {
    G.chaseState = 'idle';
    for (let i = 0; i < cfg.mobs; i++) { const m = newMob(0, 0, 9999); chasePackPos(G, m, i); G.mobs.push(m); }
  } else {
    BR.pickSpots(map, rnd, cfg.mobs, { minDist: 0.55 * maxD, minSep: 8 }).forEach((p) => G.mobs.push(newMob(p.x, p.z, 5)));
  }
  if (!cfg.puzzles.length) { G.doorOpen = true; BR.setDoor(map, true); G.door.open = true; } // уровни без головоломки

  for (const c of joinedList()) { placeAtSpawn(c); c.codeTries = 0; c.send(initMsg(c)); }
  log(`УРОВЕНЬ ${idx} «${cfg.name}», seed ${seed}`);
}

function initMsg(c) {
  const G = state.G;
  return {
    t: 'init', id: c.id, level: G.idx, levels: LEVELS.length, seed: G.seed,
    objs: G.objs, goals: goalLines(G), held: G.pz.fuses.held, upgrades: { map: state.TEAM.map },
    spawn: { x: c.x, z: c.z },
    players: joinedList().map((p) => ({ id: p.id, name: p.name })),
  };
}

function finishLevel(G) {
  G.state = 'done';
  const last = G.idx === LEVELS.length - 1;
  G.timer = last ? 14 : 6;
  broadcast({ t: 'done', last, next: last ? '' : LEVELS[G.idx + 1].name });
  log(last ? 'ИГРА ПРОЙДЕНА' : `уровень ${G.idx} пройден`);
}

// Подбор предметов при касании
function touchObjects(G, p) {
  let changed = false;
  for (const o of G.objs.slice().reverse()) {
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (o.kind === 'mapitem' && d < PICK_DIST) {
      removeObj(G, o); state.TEAM.map = true;
      broadcast({ t: 'pick', id: o.id, kind: 'mapitem', by: p.name });
      broadcast({ t: 'upgrade', what: 'map', by: p.name });
      log(`${p.name} нашёл улучшенную карту`);
    } else if (o.kind === 'water' && d < PICK_DIST) {
      removeObj(G, o);
      broadcast({ t: 'pick', id: o.id, kind: 'water', by: p.name });
      p.send({ t: 'stamina' });
    } else {
      for (const name of G.cfg.puzzles) if (PUZZLES[name].touch && PUZZLES[name].touch(G, p, o)) { changed = true; break; }
    }
  }
  return changed;
}

// Существо поймало игрока: телепорт (или рестарт забега на уровне-погоне)
function catchPlayer(G, p, m0) {
  const respawn = G.cfg.chase ? { x: G.map.spawn.x, z: G.map.spawn.z } : randomFloorFar(G, m0.x, m0.z);
  p.x = respawn.x; p.z = respawn.z; p.invuln = INVULN;
  p.send({ t: 'caught', x: respawn.x, z: respawn.z });
  broadcast({ t: 'ev', text: `Существо поймало игрока ${p.name}!` });
  if (G.cfg.chase) { // забег начинается заново: стая возвращается к старту
    G.mobs.forEach((m, i) => { chasePackPos(G, m, i); m.stun = 3.5 + i * 0.6; m.mode = 'chase'; });
  } else {
    const away = randomFloorFar(G, p.x, p.z);
    m0.x = away.x; m0.z = away.z; m0.stun = 4; m0.mode = 'wander'; m0.wp = null; m0.alert = null;
  }
}

let lastTick = process.hrtime.bigint();
function tick() {
  const now = process.hrtime.bigint();
  const dt = Math.min(0.2, Number(now - lastTick) / 1e9);
  lastTick = now;
  const G = state.G;
  const players = joinedList();
  if (!players.length) return;

  if (G.state === 'done') {
    G.timer -= dt;
    if (G.timer <= 0) startLevel(G.idx === LEVELS.length - 1 ? 0 : G.idx + 1);
    return;
  }

  for (const m of G.mobs) updateMob(G, m, dt, players);

  let goalsChanged = false;
  for (const p of players) {
    if (p.invuln > 0) p.invuln -= dt;
    if (touchObjects(G, p)) goalsChanged = true;
    const m0 = G.mobs.find((m) => m.stun <= 0 && p.invuln <= 0 && Math.hypot(m.x - p.x, m.z - p.z) < CATCH_DIST);
    if (m0) catchPlayer(G, p, m0);
  }

  // Погоня: стая просыпается, когда кто-то отошёл от укрытия
  if (G.cfg.chase && G.chaseState === 'idle') {
    const sp = G.map.spawn;
    if (players.some((p) => Math.hypot(p.x - sp.x, p.z - sp.z) > CHASE_WAKE_DIST)) {
      G.chaseState = 'run';
      G.mobs.forEach((m, i) => { m.stun = 2.2 + i * 0.7; m.mode = 'chase'; });
      broadcast({ t: 'ev', text: 'БЕГИТЕ! Они проснулись!' });
      broadcast({ t: 'sfx', name: 'roar' });
    }
  }

  for (const name of G.cfg.puzzles) if (PUZZLES[name].tick && PUZZLES[name].tick(G, players, dt)) goalsChanged = true;
  if (goalsChanged) sendGoals(G);

  // Выход: все у двери — уровень пройден; кто-то у двери — остальным EXIT_WAIT секунд
  if (G.doorOpen) {
    const inside = players.filter((p) => Math.hypot(p.x - G.door.x, p.z - G.door.z) < EXIT_DIST);
    if (inside.length === players.length) finishLevel(G);
    else if (inside.length) {
      if (!G.exitArmed) { G.exitArmed = true; G.exitTimer = EXIT_WAIT; broadcast({ t: 'ev', text: `Кто-то уже у двери — остальные, скорее! (${EXIT_WAIT} с)` }); }
      G.exitTimer -= dt;
      if (G.exitTimer <= 0) finishLevel(G);
    } else { G.exitArmed = false; }
  }

  const f = (v) => +v.toFixed(2);
  broadcast({
    t: 's',
    p: players.map((c) => [c.id, f(c.x), f(c.z), f(c.r), c.fl ? 1 : 0]),
    m: G.mobs.map((m) => [f(m.x), f(m.z), f(m.r), m.mode === 'chase' ? 1 : 0, m.stun > 0 ? 1 : 0]),
  });
}

function onJoin(c, msg) {
  c.name = String(msg.name || 'Игрок').replace(/[<>&]/g, '').trim().slice(0, 16) || 'Игрок';
  c.joined = true;
  placeAtSpawn(c);
  c.send(initMsg(c));
  broadcast({ t: 'ev', text: `${c.name} зашёл в игру` });
  sendPlayers();
  log(`подключился: ${c.name} (онлайн: ${joinedCount()})`);
}

function onLeave(c) {
  if (c.joined) { broadcast({ t: 'ev', text: `${c.name} вышел из игры` }); sendPlayers(); }
  log(`отключился: ${c.name} (онлайн: ${joinedCount()})`);
}

function onMessage(c, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'join') { if (!c.joined) onJoin(c, msg); return; }
  const G = state.G;
  if (!c.joined || G.state !== 'play') return;

  if (msg.t === 'p') {
    const x = +msg.x, z = +msg.z, r = +msg.r;
    if (Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(r)) {
      c.x = Math.min(N * TILE, Math.max(0, x));
      c.z = Math.min(N * TILE, Math.max(0, z));
      c.r = r;
      c.fl = !!msg.f;
    }
  } else if (msg.t === 'use') {
    const o = G.objs.find((q) => q.id === msg.id);
    if (!o || Math.hypot(o.x - c.x, o.z - c.z) > USE_DIST) return;
    for (const name of G.cfg.puzzles) if (PUZZLES[name].use && PUZZLES[name].use(G, c, o)) return;
  } else if (msg.t === 'code') {
    if (G.cfg.puzzles.includes('code')) enterCode(G, c, msg.v);
  }
}

module.exports = { startLevel, tick, onMessage, onLeave };
