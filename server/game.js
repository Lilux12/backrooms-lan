'use strict';
// Игровой процесс на сервере: запуск уровней, тик мира, сообщения игроков.
const BR = require('../shared/map.js');
const { TILE, N, LEVELS } = BR;
const config = require('./config');
const state = require('./state');
const { joinedList, joinedCount, broadcast, sendPlayers, log } = require('./clients');
const { updateMob, randomFloorFar } = require('./mobs');
const { PUZZLES, removeObj, goalLines, sendGoals, enterCode, near, PICK_DIST } = require('./puzzles');
const { buildLevel, chasePackPos } = require('./level');

const CATCH_DIST = 1.3;       // существо ловит на таком расстоянии (по горизонтали)
const CATCH_DY = 1.4;         // …и на такой разнице высот
const INVULN = 4;             // неуязвимость после появления, с
const USE_DIST = 3.6;         // дальность взаимодействия (E)
const EXIT_DIST = 2.6;        // радиус «у двери»
const EXIT_WAIT = 8;          // сколько ждём остальных, когда кто-то у двери
const CHASE_WAKE_DIST = 9;    // «Беги!»: стая просыпается, когда игрок отошёл от старта

function setPos(c, p) {
  c.x = p.x; c.y = p.y; c.z = p.z;
  c.node = BR.nodeAt(state.G.map, c.x, c.y + 0.1, c.z);
}

function placeAtSpawn(c) {
  const G = state.G, s = G.map.spawn;
  setPos(c, { x: s.x + (c.id % 2 ? 0.8 : -0.8), y: s.y, z: s.z + ((c.id >> 1) % 2 ? 0.8 : -0.8) });
  c.invuln = INVULN;
  const nearObj = config.TEST_NEAR && G.objs.find((o) => o.kind === config.TEST_NEAR);
  if (nearObj) { // только для отладки: появиться рядом с объектом
    const tries = nearObj.nx !== undefined ? [[nearObj.nx, nearObj.nz]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of tries) {
      const x = nearObj.x + dx * 2.2, z = nearObj.z + dz * 2.2;
      if (!BR.blocked(G.map, x, nearObj.y, z, BR.PHYS.R, BR.PHYS.H, BR.PHYS.STEP)) { setPos(c, { x, y: nearObj.y, z }); break; }
    }
  }
}

function startLevel(idx) {
  const seed = (Math.random() * 0x7fffffff) >>> 0;
  if (idx === 0) state.TEAM.map = false;
  const G = state.G = buildLevel(idx, seed, state.TEAM, { forceMap: config.FORCE_MAP });
  for (const c of joinedList()) { placeAtSpawn(c); c.codeTries = 0; c.send(initMsg(c)); }
  log(`УРОВЕНЬ ${idx} «${G.cfg.name}», seed ${seed}, хэш карты ${G.map.hash}`);
}

function initMsg(c) {
  const G = state.G;
  return {
    t: 'init', id: c.id, level: G.idx, levels: LEVELS.length, seed: G.seed,
    objs: G.objs, goals: goalLines(G), held: G.pz.fuses.held, upgrades: { map: state.TEAM.map },
    spawn: { x: c.x, y: c.y, z: c.z }, wl: G.map.wl,
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
    if (o.kind === 'mapitem' && near(o, p, PICK_DIST)) {
      removeObj(G, o); state.TEAM.map = true;
      broadcast({ t: 'pick', id: o.id, kind: 'mapitem', by: p.name });
      broadcast({ t: 'upgrade', what: 'map', by: p.name });
      log(`${p.name} нашёл улучшенную карту`);
    } else if (o.kind === 'water' && near(o, p, PICK_DIST)) {
      removeObj(G, o);
      broadcast({ t: 'pick', id: o.id, kind: 'water', by: p.name });
      p.send({ t: 'stamina' });
    } else {
      for (const name of G.cfg.puzzles) if (PUZZLES[name].touch && PUZZLES[name].touch(G, p, o)) { changed = true; break; }
    }
  }
  return changed;
}

// Отправить игрока в точку (сервер решает: поймали, утонул, застрял)
function teleport(G, p, pos, reason) {
  setPos(p, pos);
  p.invuln = INVULN;
  p.send({ t: 'caught', x: pos.x, y: pos.y, z: pos.z, reason });
}

// Существо поймало игрока: телепорт (или рестарт забега на уровне-погоне)
function catchPlayer(G, p, m0) {
  teleport(G, p, G.cfg.chase ? G.map.spawn : randomFloorFar(G, m0), 'caught');
  broadcast({ t: 'ev', text: `Существо поймало игрока ${p.name}!` });
  if (G.cfg.chase) { // забег начинается заново: стая возвращается к старту
    G.mobs.forEach((m, i) => { chasePackPos(G, m, i); m.stun = 3.5 + i * 0.6; m.mode = 'chase'; });
  } else {
    const away = randomFloorFar(G, p);
    Object.assign(m0.body, { x: away.x, y: away.y, z: away.z, vy: 0 });
    Object.assign(m0, { x: away.x, y: away.y, z: away.z, stun: 4, mode: 'wander', wp: -1, alert: null });
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
    const m0 = G.mobs.find((m) => m.stun <= 0 && p.invuln <= 0 && Math.hypot(m.x - p.x, m.z - p.z) < CATCH_DIST && Math.abs(m.y - p.y) < CATCH_DY);
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
    const inside = players.filter((p) => near(G.door, p, EXIT_DIST));
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
    p: players.map((c) => [c.id, f(c.x), f(c.y), f(c.z), f(c.r), c.fl ? 1 : 0, c.crouch ? 1 : 0]),
    m: G.mobs.map((m) => [f(m.x), f(m.y), f(m.z), f(m.r), m.mode === 'chase' ? 1 : 0, m.stun > 0 ? 1 : 0]),
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
    const x = +msg.x, y = +msg.y, z = +msg.z, r = +msg.r;
    if ([x, y, z, r].every(Number.isFinite)) {
      const node = BR.nodeAt(G.map, x, y + 0.1, z);
      c.x = Math.min(N * TILE, Math.max(0, x));
      c.y = Math.min(G.map.F * G.map.FH + 2, Math.max(-6, y));
      c.z = Math.min(N * TILE, Math.max(0, z));
      c.r = r;
      c.fl = !!msg.f;
      c.crouch = !!msg.c;
      if (node >= 0) c.node = node; // в воздухе / на лестнице оставляем последний узел
    }
  } else if (msg.t === 'use') {
    const o = G.objs.find((q) => q.id === msg.id);
    if (!o || !near(o, c, USE_DIST)) return;
    for (const name of G.cfg.puzzles) if (PUZZLES[name].use && PUZZLES[name].use(G, c, o)) return;
  } else if (msg.t === 'code') {
    if (G.cfg.puzzles.includes('code')) enterCode(G, c, msg.v);
  } else if (msg.t === 'hash') {
    // клиент построил карту — сверяем геометрию
    if (msg.level === G.idx && msg.hash !== G.map.hash) {
      log(`ВНИМАНИЕ: карта у ${c.name} отличается (хэш ${msg.hash}, на сервере ${G.map.hash})`);
      c.send({ t: 'ev', text: 'Карта не совпадает с сервером — обновите страницу (Ctrl+F5)' });
    }
  } else if (msg.t === 'drown' || msg.t === 'stuck') {
    // утонул или застрял — безопасная точка
    const pos = msg.t === 'stuck' ? G.map.spawn : randomFloorFar(G, c);
    teleport(G, c, pos, msg.t);
    if (msg.t === 'drown') broadcast({ t: 'ev', text: `${c.name} захлебнулся и очнулся в другом месте` });
  }
}

module.exports = { startLevel, tick, onMessage, onLeave };
