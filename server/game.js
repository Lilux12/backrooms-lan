'use strict';
// Игровой процесс на сервере: запуск уровней, тик мира, сообщения игроков.
const BR = require('../shared/map.js');
const { TILE, N, LEVELS } = BR;
const config = require('./config');
const state = require('./state');
const { clients, joinedList, joinedCount, broadcast, sendPlayers, playerList, clearVirtuals, log } = require('./clients');
const SS = require('./skinstealer');
const ADM = require('./admin');
const { updateMob, randomFloorFar, inWater } = require('./mobs');
const PZ = require('./puzzles');
const { PUZZLES, removeObj, goalLines, sendGoals, enterCode, near, tickWater, patch, alarm, PICK_DIST, useCommon, tickCommon } = PZ;
const { buildLevel, chasePackPos } = require('./level');
const DIR = require('./director');
const records = require('./records');

// Модификаторы раунда: с шансом MOD_CHANCE уровень получает особое правило (объявляется на старте)
const MODIFIERS = {
  dark: 'Перебои с электричеством: свет вполсилы',
  fastmobs: 'Голодные: существа быстрее',
  nomap: 'Без миникарты',
  silent: 'Тугоухие: существа хуже слышат',
  drain: 'Старые батарейки: фонарь садится вдвое быстрее',
  fog: 'Сырость: густой туман',
  dry: 'Засуха: бутылок с водой нет',
};
const MOD_CHANCE = 0.4;
// Ежедневный сид: у всех в мире сегодня одни и те же карты (и отдельная таблица рекордов)
const today = () => new Date().toISOString().slice(0, 10);
function dailySeed(idx) {
  let h = 0x811c9dc5;
  for (const ch of `${today()}#${idx}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
state.difficulty = DIR.DIFFICULTY[process.env.DIFFICULTY] ? process.env.DIFFICULTY : 'normal';
state.daily = !!process.env.DAILY;
state.modsOn = process.env.MODIFIERS !== '0';

const CATCH_DIST = 1.3;       // существо ловит на таком расстоянии (по горизонтали)
const CATCH_DY = 1.4;         // …и на такой разнице высот
const INVULN = 4;             // неуязвимость после появления, с
const USE_DIST = 3.6;         // дальность взаимодействия (E)
const EXIT_DIST = 2.6;        // радиус «у двери»
const EXIT_WAIT = 8;          // сколько ждём остальных, когда кто-то у двери
const CHASE_WAKE_DIST = 9;    // «Беги!»: стая просыпается, когда игрок отошёл от старта
const { MOB_TYPES } = BR; // индекс типа уходит клиенту в снапшоте (список общий с клиентом: shared/core.js)
const FATAL_FALL = 10;        // падение с такой высоты смертельно
const CHECK_DIST = 14;        // проверять игрока (пинг, слово, детектор) можно с такого расстояния
const CHAT_GAP = 0.7;         // не чаще одного сообщения в чат за столько секунд
const NOISE_DIST = 9;         // шумелка падает на столько метров вперёд
const WORDS = ['ЛУНА', 'КОМПАС', 'ЯКОРЬ', 'ВОРОН', 'ЛАМПА', 'МАЯК', 'ТУМАН', 'КЛЮЧ', 'СОВА', 'КАМЕНЬ', 'ОКНО', 'ПЕСОК', 'ЗВЕЗДА', 'РЕКА'];

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

function startLevel(idx, forcedSeed) {
  const seed = forcedSeed != null ? forcedSeed >>> 0 : state.daily ? dailySeed(idx) : (Math.random() * 0x7fffffff) >>> 0;
  if (idx === 0) { state.TEAM.map = false; state.campaignStart = Date.now(); state.campaignDeaths = 0; }
  clearVirtuals();
  // модификатор раунда выбирается до сборки уровня (часть влияет на расстановку)
  const rnd = BR.mulberry32(seed ^ 0x9e3779b9);
  const modifier = state.modsOn && !LEVELS[idx].chase && rnd() < MOD_CHANCE ? Object.keys(MODIFIERS)[Math.floor(rnd() * Object.keys(MODIFIERS).length)] : '';
  const diff = DIR.DIFFICULTY[state.difficulty];
  const G = state.G = buildLevel(idx, seed, state.TEAM, { forceMap: config.FORCE_MAP, revive: diff.revive, dry: modifier === 'dry', players: joinedCount() });
  G.catchHook = (p, m) => catchPlayer(G, p, m);
  G.stats = { start: Date.now(), deaths: 0, notes: new Set(), exposed: 0 };
  G.difficulty = state.difficulty; G.modifier = modifier; G.daily = state.daily ? today() : '';
  if (modifier) setTimeout(() => { if (state.G === G) broadcast({ t: 'ev', text: `Модификатор раунда: ${MODIFIERS[modifier]}` }); }, 2500);
  for (const c of joinedList()) { resetPlayer(c); placeAtSpawn(c); grace(c, 3000); }
  for (const c of joinedList()) { c.send(initMsg(c)); sendSecret(c); }
  log(`УРОВЕНЬ ${idx} «${G.cfg.name}», seed ${seed}, хэш карты ${G.map.hash}`);
}

// Новый уровень: клетки, предметы, кодовое слово — заново
function resetPlayer(c) {
  c.codeTries = 0; c.caged = 0; c.pingT = 0; c.askBy = 0; c.dead = false; c.toy = null;
  c.items = { detector: 0, noise: 0, medkit: c.role === 'medic' && DIR.DIFFICULTY[state.difficulty].revive ? 1 : 0 };
  c.hiding = 0; c.hideSeen = false;
  const used = new Set(joinedList().filter((p) => p !== c).map((p) => p.word));
  const free = WORDS.filter((w) => !used.has(w));
  c.word = free[Math.floor(Math.random() * free.length)] || WORDS[0];
}
function sendSecret(c) { c.send({ t: 'secret', word: c.word }); c.send({ t: 'items', items: c.items }); }
const clientById = (id) => { const c = clients.get(id); return c && c.joined ? c : null; };

function initMsg(c) {
  const G = state.G;
  return {
    t: 'init', id: c.id, level: G.idx, levels: LEVELS.length, seed: G.seed,
    objs: G.objs, goals: goalLines(G), held: G.pz.fuses.held, upgrades: { map: state.TEAM.map },
    spawn: { x: c.x, y: c.y, z: c.z }, wl: G.map.wl, dead: deadIds(), world: ADM.worldMsg(), admin: !!c.admin,
    obst: G.extraObst || [], cells: G.cellLog || [], powered: !!(G.pz.mall && G.pz.mall.powered),
    modifier: G.modifier, difficulty: G.difficulty, daily: G.daily, role: c.role || '',
    players: playerList(),
  };
}

// ending — концовка финала: 'escape' (вышли к небу, фабрика разрушена) или 'stay' (кто-то остался Надсмотрщиком)
function finishLevel(G, ending, by) {
  if (G.state !== 'play') return;
  G.state = 'done';
  const last = G.idx === LEVELS.length - 1;
  G.timer = last ? 20 : 6;
  const st = G.stats;
  broadcast({
    t: 'done', last, next: last ? '' : LEVELS[G.idx + 1].name, ending: last ? (ending || 'escape') : null, by: by || '',
    stats: { time: Math.round((Date.now() - st.start) / 1000), deaths: st.deaths, notes: st.notes.size, exposed: st.exposed },
  });
  log(last ? `ИГРА ПРОЙДЕНА (концовка: ${ending || 'escape'})` : `уровень ${G.idx} пройден`);
  // рекорды: время уровня и (в финале) всей кампании
  const names = joinedList().map((p) => p.name);
  state.campaignDeaths = (state.campaignDeaths || 0) + st.deaths;
  const place = records.levelDone(G.idx, Math.round((Date.now() - st.start) / 1000), names, st.deaths, G.daily);
  if (place === 0) broadcast({ t: 'ev', text: `НОВЫЙ РЕКОРД уровня «${G.cfg.name}»!` });
  if (last && state.campaignStart) {
    const cp = records.campaignDone(Math.round((Date.now() - state.campaignStart) / 1000), names, ending || 'escape');
    if (cp === 0) broadcast({ t: 'ev', text: 'НОВЫЙ РЕКОРД ВСЕЙ КАМПАНИИ!' });
  }
  if (G.difficulty === 'hard') broadcast({ t: 'ach', id: 'hardcore' });
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
    } else if ((o.kind === 'detector' || o.kind === 'noisemaker' || o.kind === 'medkit') && near(o, p, PICK_DIST)) {
      removeObj(G, o);
      if (o.kind === 'detector') p.items.detector = 1; else if (o.kind === 'medkit') p.items.medkit++; else p.items.noise++;
      p.send({ t: 'items', items: p.items });
      broadcast({ t: 'pick', id: o.id, kind: o.kind, by: p.name });
    } else if (o.kind === 'egg' && near(o, p, PICK_DIST)) {
      removeObj(G, o);
      broadcast({ t: 'pick', id: o.id, kind: 'egg', by: p.name });
      broadcast({ t: 'ev', text: `${p.name} нашёл ${o.title}. Она не гудит.` });
      p.send({ t: 'ach', id: 'egg' });
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
  setPos(p, pos); grace(p);
  p.invuln = INVULN;
  p.send({ t: 'caught', x: pos.x, y: pos.y, z: pos.z, reason });
}

PZ.hooks.teleport = (G, p, pos, reason) => teleport(G, p, pos, reason);
PZ.hooks.kill = (G, p, reason, pub) => killPlayer(G, p, reason, pub);
PZ.hooks.finish = (G, ending, by) => finishLevel(G, ending, by);
PZ.hooks.addObj = (G, kind, props) => addObjNet(G, kind, props);

// Существо поймало игрока: телепорт (или рестарт забега на уровне-погоне)
function catchPlayer(G, p, m0) {
  const easy = !DIR.DIFFICULTY[G.difficulty].catchKills;
  if (G.cfg.chase || p.god || easy) teleport(G, p, G.cfg.chase ? G.map.spawn : randomFloorFar(G, m0), 'caught');
  else {
    const nm = BR.MOB_NAMES[m0.type] || 'существо';
    if (m0.type === 'drowner') killPlayer(G, p, 'Утопленник утащил вас под воду', 'его утащил под воду Утопленник');
    else killPlayer(G, p, `Вас поймал${m0.type === 'teacher' ? 'а' : ''} ${nm}`, `его поймал${m0.type === 'teacher' ? 'а' : ''} ${nm}`);
  }
  if (G.cfg.chase) { // забег начинается заново: стая возвращается к старту
    G.mobs.forEach((m, i) => { chasePackPos(G, m, i); m.stun = 3.5 + i * 0.6; m.mode = 'chase'; });
  } else if (m0.type === 'drowner') {
    m0.stun = 6; // утопленник уходит на дно
  } else {
    const away = randomFloorFar(G, p);
    Object.assign(m0.body, { x: away.x, y: away.y, z: away.z, vy: 0 });
    Object.assign(m0, { x: away.x, y: away.y, z: away.z, stun: 4, mode: 'wander', wp: -1, alert: null });
  }
}

/* ----------------------- Смерть, зрители, воскрешение ----------------------- */
function deadIds() { return joinedList().filter((p) => p.dead).map((p) => p.id); }

// reason — текст для погибшего («Вас поймало существо»), pub — для остальных («его поймало существо»)
// Что игрок нёс в руках (игрушку), падает на месте — иначе головоломку не решить
function dropCarried(G, p) {
  if (p.toy && G.state === 'play') { addObjNet(G, 'toy', { x: p.x, y: p.y, z: p.z, toy: p.toy }); p.toy = null; }
  if (p.hiding) { const o = G.objs.find((q) => q.id === p.hiding); if (o) patch(o, { who: 0 }); p.hiding = 0; }
}

function killPlayer(G, p, reason, pub) {
  if (p.dead || G.state !== 'play') return;
  dropCarried(G, p);
  p.dead = true; p.deadAt = Date.now();
  G.stats.deaths++;
  p.deaths = (p.deaths || 0) + 1;
  p.send({ t: 'dead', reason });
  broadcast({ t: 'ev', text: `${p.name} погиб: ${pub || 'неизвестная причина'}` });
  broadcast({ t: 'deadlist', ids: deadIds() });
  log(`${p.name} погиб (${pub || reason})`);
  checkDefeat(G);
}

// Все, кто в игре, мертвы (в том числе после выхода последнего живого) — поражение
function checkDefeat(G) {
  const list = joinedList();
  if (G.state === 'play' && list.length && list.every((q) => q.dead)) defeat(G);
}

function revive(G, p, pos, by) {
  if (!p.dead) return;
  p.dead = false; p.invuln = INVULN;
  setPos(p, pos); grace(p);
  p.send({ t: 'revived', x: pos.x, y: pos.y, z: pos.z, by });
  broadcast({ t: 'ev', text: `${by} вернул ${p.name} к жизни!` });
  broadcast({ t: 'deadlist', ids: deadIds() });
  broadcast({ t: 'sfx', name: 'revive' });
}

// Все погибли: экран поражения со статистикой, потом уровень заново (новый seed)
function defeat(G) {
  G.state = 'defeat'; G.timer = 9;
  const st = G.stats;
  broadcast({
    t: 'defeat',
    stats: {
      time: Math.round((Date.now() - st.start) / 1000), deaths: st.deaths, notes: st.notes.size, exposed: st.exposed,
      players: joinedList().map((p) => ({ name: p.name, deaths: p.deaths || 0 })),
    },
  });
  log('ВСЕ ПОГИБЛИ — перезапуск уровня');
}

// Зрителям — выносливость, батарея и пинг живых
function spectatorStats(G, dt, players) {
  G.specT = (G.specT || 0) - dt;
  if (G.specT > 0) return;
  G.specT = 0.5;
  const dead = players.filter((p) => p.dead);
  if (!dead.length) return;
  const list = players.filter((p) => !p.dead && !p.caged).map((p) => [p.id, +(p.st || 0).toFixed(2), +(p.bat || 0).toFixed(2), Math.round(p.rtt || 0)]);
  for (const d of dead) d.send({ t: 'pstats', list, free: !!G.freeCam });
}

// Замер пинга: раз в 2 секунды
function pingClients(G, dt, players) {
  G.rttT = (G.rttT || 0) - dt;
  if (G.rttT > 0) return;
  G.rttT = 2;
  const k = Date.now();
  for (const p of players) { p.rttK = k; p.send({ t: 'rtt', k }); }
}

// Кто сидит в клетке — видно только вблизи (сообщение уходит лишь тем, кто рядом)
function cageViews(G, dt, players) {
  G.cageT = (G.cageT || 0) - dt;
  if (G.cageT > 0) return;
  G.cageT = 0.5;
  for (const p of players) {
    for (const o of G.objs) {
      if (o.kind !== 'cage' || !near(o, p, 10)) continue;
      const pr = o.prisoner ? clientById(o.prisoner) : null;
      p.send({ t: 'cageview', id: o.id, name: pr ? pr.name : null });
    }
  }
}

// Цель проверки (пинг/слово/детектор): настоящий игрок или двойник, рядом и в прямой видимости
function checkTarget(G, c, id) {
  const pos = G.ss && SS.isMask(G, id) ? G.ss.m : clientById(id);
  if (!pos || pos === c || pos.caged) return false;
  return Math.hypot(pos.x - c.x, pos.z - c.z) < CHECK_DIST && Math.abs(pos.y - c.y) < 3 &&
    BR.los3(G.map, c.x, c.y + 1.5, c.z, pos.x, pos.y + 1.5, pos.z);
}

// Шумелка: падает впереди, существа идут на звук, разоблачённый двойник отвлекается
function throwNoise(G, c) {
  if (!c.items.noise) return;
  c.items.noise--;
  c.send({ t: 'items', items: c.items });
  const fx = -Math.sin(c.r), fz = -Math.cos(c.r);
  let x = c.x, z = c.z;
  for (let d = 0; d < NOISE_DIST; d += 0.5) {
    if (BR.solidAt(G.map, c.x + fx * d, c.y + 1.2, c.z + fz * d)) break;
    x = c.x + fx * d; z = c.z + fz * d;
  }
  const node = BR.nodeAt(G.map, x, c.y + 0.1, z);
  broadcast({ t: 'noise', x, y: c.y, z });
  if (node >= 0) for (const m of G.mobs) if (m.type !== 'drowner') { m.alert = { node, t: 12 }; m.mode = 'wander'; }
  if (G.ss && G.ss.state === 'EXPOSED') G.ss.stunned = 3;
}

// Что админ-команды могут делать с игрой
function addObjNet(G, kind, props) {
  const o = Object.assign({ id: G.nextId++, kind }, props);
  G.objs.push(o);
  broadcast({ t: 'add', o });
  return o;
}
const API = {
  teleport: (G, p, pos, reason) => teleport(G, p, pos, reason),
  revive: (G, p, pos, by) => revive(G, p, pos, by),
  kill: (G, p, reason, pub) => killPlayer(G, p, reason, pub),
  startLevel: (idx, seed) => startLevel(idx, seed),
  alarm: (G, x, y, z) => alarm(G, x, y, z),
  addObj: addObjNet,
  grace: (p, ms) => grace(p, ms),
  catchBy: (G, victim, by) => { if (victim.god) return; killPlayer(G, victim, `Вас поймал(а) ${by.name}`, `его поймал(а) ${by.name}`); },
};

let lastTick = process.hrtime.bigint();
function tick() {
  const now = process.hrtime.bigint();
  const dt = Math.min(0.2, Number(now - lastTick) / 1e9) * ADM.WORLD.timescale; // хост может замедлить/ускорить время
  lastTick = now;
  const G = state.G;
  const players = joinedList();
  if (!players.length) return;

  if (G.state === 'done' || G.state === 'defeat') {
    G.timer -= dt;
    if (G.timer <= 0) startLevel(G.state === 'defeat' ? G.idx : G.idx === LEVELS.length - 1 ? 0 : G.idx + 1);
    return;
  }
  pingClients(G, dt, players);
  spectatorStats(G, dt, players);

  tickWater(G, dt);
  const active = players.filter((p) => !p.caged && !p.dead); // в клетке и мёртвые — не участвуют
  const W = ADM.WORLD;
  G.mobMul = W.mobspeed * DIR.DIFFICULTY[G.difficulty].speed * DIR.crowd(players.length) * (G.modifier === 'fastmobs' ? 1.15 : 1);
  G.hearMul = G.modifier === 'silent' ? 0.6 : 1;
  // кого существа видят: не невидимых и не «одержимых»; при дружелюбных существах — никого;
  // спрятавшихся в шкафчике — тоже нет (если существо не видело, как вы туда залезли)
  const hunted = W.friendly ? [] : active.filter((p) => !(p.mods && (p.mods.invis || p.mods.possessed)) && !(p.hiding && !p.hideSeen));
  DIR.tickDirector(G, active, dt);
  tickHiding(G, active);
  if (!W.aioff) {
    if (!G.mobsFrozen) G.mobs.forEach((m, k) => updateMob(G, m, dt, hunted, k)); // заморозка существ (только автотесты) не трогает двойника
    if (G.ss) SS.tickStealer(G, dt, players.filter((p) => p.caged || hunted.includes(p)));
  }
  SS.tickPings(G, dt, players);
  if (G.ss) { SS.detectorBeeps(G, players, dt); cageViews(G, dt, players); }
  ADM.tickAdmin(G, dt, active, API);

  let goalsChanged = tickCommon(G, active, dt);
  for (const p of active) {
    if (p.invuln > 0) p.invuln -= dt;
    if (touchObjects(G, p)) goalsChanged = true;
    if (!hunted.includes(p) || W.aioff || (p.hiding && !p.hideSeen)) continue;
    const m0 = !G.mobsFrozen && G.mobs.find((m) => m.stun <= 0 && !m.hidden && !m.frozen && p.invuln <= 0 && Math.hypot(m.x - p.x, m.z - p.z) < CATCH_DIST * (m.boss ? 1.6 : 1) &&
      (m.type === 'drowner' ? inWater(G, p) && Math.abs(m.y - p.y) < 3 : Math.abs(m.y - p.y) < CATCH_DY));
    if (m0) catchPlayer(G, p, m0);
  }

  // Погоня: стая просыпается, когда кто-то отошёл от укрытия
  if (G.cfg.chase && G.chaseState === 'idle') {
    const sp = G.map.spawn;
    if (active.some((p) => Math.hypot(p.x - sp.x, p.z - sp.z) > CHASE_WAKE_DIST)) {
      G.chaseState = 'run';
      G.mobs.forEach((m, i) => { m.stun = 2.2 + i * 0.7; m.mode = 'chase'; });
      broadcast({ t: 'ev', text: 'БЕГИТЕ! Они проснулись!' });
      broadcast({ t: 'sfx', name: 'roar' });
    }
  }

  for (const name of G.cfg.puzzles) if (PUZZLES[name].tick && PUZZLES[name].tick(G, active, dt)) goalsChanged = true;
  if (goalsChanged) sendGoals(G);

  // Выход: все у двери — уровень пройден; кто-то у двери — остальным EXIT_WAIT секунд
  if (G.doorOpen) {
    const inside = active.filter((p) => near(G.door, p, EXIT_DIST));
    if (inside.length && inside.length === active.length) finishLevel(G);
    else if (inside.length) {
      if (!G.exitArmed) { G.exitArmed = true; G.exitTimer = EXIT_WAIT; broadcast({ t: 'ev', text: `Кто-то уже у двери — остальные, скорее! (${EXIT_WAIT} с)` }); }
      G.exitTimer -= dt;
      if (G.exitTimer <= 0) finishLevel(G);
    } else { G.exitArmed = false; }
  }

  // Снапшот: игроки в клетке не видны; двойник в маске — обычная запись игрока (тот же формат)
  const f = (v) => +v.toFixed(2);
  const ps = active.map((c) => [c.id, f(c.x), f(c.y), f(c.z), f(c.r), c.fl ? 1 : 0, c.crouch ? 1 : 0, f(c.pitch || 0)]);
  const mask = G.ss && SS.maskEntry(G, f);
  if (mask) ps.push(mask);
  ps.sort((a, b) => a[0] - b[0]);
  const ms = G.mobs.map((m) => [f(m.x), f(m.y), f(m.z), f(m.r), m.mode === 'chase' ? 1 : 0, m.stun > 0 || m.hidden ? 1 : 0, MOB_TYPES.indexOf(m.type), m.boss ? 2 : 1]);
  const monster = G.ss && SS.monsterEntry(G, f, MOB_TYPES.indexOf('skinstealer'));
  if (monster) ms.push(monster);
  broadcast({ t: 's', p: ps, m: ms });
}

/* ------------------------------ Античит ------------------------------ */
// Сервер принимает позицию, только если до неё можно было дойти: по горизонтали не быстрее бега
// (с запасом на лаг, течение, батут), вверх — не быстрее прыжка/лестницы. После телепорта сервером — пауза.
const RUN_MAX = 6.2, CLIMB_MAX = 9;
function movementOk(c, x, y, z) {
  if (!config.ANTICHEAT) return true;
  const now = Date.now();
  if (c.tpGrace > now || (c.mods && (c.mods.fly || c.mods.noclip))) return true;
  const dt = Math.min(2, Math.max(0.05, (now - (c.okT || now)) / 1000));
  const speed = RUN_MAX * ((c.mods && c.mods.speed) || 1) * 1.45 + 1.5;
  const dh = Math.hypot(x - c.x, z - c.z), up = y - c.y;
  const jump = (c.mods && c.mods.jump) || 1;
  if (dh <= speed * dt + 1.2 && up <= CLIMB_MAX * jump * dt + 1.6) { c.okT = now; c.cheatN = 0; return true; }
  c.cheatN = (c.cheatN || 0) + 1;
  if (c.cheatN === 1 || c.cheatN % 20 === 0) log(`античит: ${c.name} — слишком быстро (${dh.toFixed(1)} м за ${dt.toFixed(2)} с), возвращаем`);
  c.send({ t: 'correct', x: c.x, y: c.y, z: c.z });
  return false;
}
const grace = (c, ms = 1500) => { c.tpGrace = Date.now() + ms; };

/* ---------------- Переподключение: сервер помнит вышедших по нику ---------------- */
const keep = new Map(); // ник (в нижнем регистре) → { t, level, x, y, z, dead, items, word, deaths }
function remember(c) {
  if (!c.joined || !state.G) return;
  keep.set(c.name.toLowerCase(), { t: Date.now(), level: state.G.idx, seed: state.G.seed, x: c.x, y: c.y, z: c.z, dead: !!c.dead, items: c.items, word: c.word, deaths: c.deaths || 0 });
}
function restore(c) {
  const k = keep.get(c.name.toLowerCase());
  keep.delete(c.name.toLowerCase());
  const G = state.G;
  if (!k || Date.now() - k.t > config.KEEP_STATE * 1000 || k.level !== G.idx || k.seed !== G.seed) return false;
  setPos(c, { x: k.x, y: k.y, z: k.z });
  c.items = k.items; c.word = k.word; c.deaths = k.deaths; c.dead = k.dead;
  return true;
}

/* ------------------------------ Шкафчики ------------------------------ */
// Спрятаться (E): существа не видят и не ловят того, кто в шкафчике, — если не видели, как он туда залез.
// Если существо прошло совсем рядом с тем, кто прячется, — это достижение «Не дыши».
function hide(G, c, o) {
  if (c.hiding === o.id) { unhide(G, c); return; }
  if (c.hiding) return;
  if (o.who) { c.send({ t: 'ev', text: 'Шкафчик занят.' }); return; }
  c.hiding = o.id;
  // кто гнался за вами вблизи — видел, как вы спрятались
  c.hideSeen = G.mobs.some((m) => m.mode === 'chase' && m.target === c && Math.hypot(m.x - c.x, m.z - c.z) < 10);
  c.hideNear = false;
  patch(o, { who: c.id });
  setPos(c, { x: o.x, y: o.y, z: o.z }); grace(c);
  c.send({ t: 'hide', id: o.id, x: o.x, y: o.y, z: o.z, nx: o.nx, nz: o.nz, seen: c.hideSeen });
  broadcast({ t: 'sfx', name: 'clang', x: o.x, y: o.y, z: o.z });
}
function unhide(G, c) {
  const o = G.objs.find((q) => q.id === c.hiding);
  c.hiding = 0; c.hideSeen = false;
  if (!o) return;
  patch(o, { who: 0 });
  const out = { x: o.x + (o.nx || 0) * 1.4, y: o.y, z: o.z + (o.nz || 0) * 1.4 };
  setPos(c, out); grace(c);
  c.send({ t: 'unhide', x: out.x, y: out.y, z: out.z });
}
function tickHiding(G, players) {
  for (const p of players) {
    if (!p.hiding || p.hideNear) continue;
    if (G.mobs.some((m) => !m.hidden && m.stun <= 0 && Math.hypot(m.x - p.x, m.z - p.z) < 4 && Math.abs(m.y - p.y) < 2)) { p.hideNear = true; p.send({ t: 'ach', id: 'hider' }); }
  }
}

/* ---------------------- Быстрые голосовые реплики (1–4) ---------------------- */
const EMOTES = ['Сюда!', 'Бегите!', 'Помогите!', 'Тихо…'];
function emote(G, c, k) {
  if (!(k >= 0 && k < EMOTES.length)) return;
  const now = Date.now();
  if (now - (c.emoteT || 0) < 1500) return;
  c.emoteT = now;
  broadcast({ t: 'emote', id: c.id, name: c.name, k, text: EMOTES[k], x: c.x, y: c.y, z: c.z });
  // громкие реплики слышат и существа
  if (k === 0 || k === 2) {
    const node = BR.nodeAt(G.map, c.x, c.y + 0.1, c.z);
    if (node >= 0) for (const m of G.mobs) if (m.type !== 'drowner' && m.mode !== 'chase' && Math.hypot(m.x - c.x, m.z - c.z) < 25) m.alert = { node, t: 6 };
  }
}

const ROLES = ['scout', 'mechanic', 'medic'];
function onJoin(c, msg) {
  c.name = String(msg.name || 'Игрок').replace(/[<>&]/g, '').trim().slice(0, 16) || 'Игрок';
  if (ADM.isBanned(c)) { c.send({ t: 'kicked', text: 'Вы забанены хостом' }); setTimeout(() => c.conn.socket.destroy(), 200); return; }
  if (joinedCount() >= config.MAX_PLAYERS) { c.send({ t: 'kicked', text: `Сервер заполнен (${config.MAX_PLAYERS} игроков)` }); setTimeout(() => c.conn.socket.destroy(), 200); return; }
  c.mods = ADM.defMods();
  // роль (разведчик — чуть быстрее, механик — переключатели держатся дольше, медик — аптечка на каждом уровне) и цвет
  c.role = ROLES.includes(msg.role) ? msg.role : '';
  if (c.role === 'scout') c.mods.speed = 1.08;
  const col = +msg.color;
  if (Number.isInteger(col) && col >= 0 && col <= 0xffffff) c.mods.color = col;
  if (msg.token) ADM.auth(c, msg.token); // хост может войти сразу с токеном из ссылки
  c.joined = true;
  resetPlayer(c);
  placeAtSpawn(c);
  const back = restore(c); // вернулся тот же игрок — на то же место, с теми же предметами
  grace(c, 3000); c.okT = Date.now();
  c.send(initMsg(c));
  sendSecret(c);
  broadcast({ t: 'ev', text: back ? `${c.name} вернулся в игру` : `${c.name} зашёл в игру` });
  if (back && c.dead) { c.send({ t: 'dead', reason: 'Вы вернулись призраком' }); broadcast({ t: 'deadlist', ids: deadIds() }); }
  sendPlayers();
  log(`подключился: ${c.name} (онлайн: ${joinedCount()})`);
}

function onLeave(c) {
  const G = state.G;
  if (G && G.ss && SS.isMask(G, c.id)) SS.expose(G, `${c.name} покинул игру`); // жертва ушла — маска не держится
  if (G && c.caged) { const cage = G.objs.find((o) => o.id === c.caged); if (cage) cage.prisoner = 0; }
  if (G && c.joined) { dropCarried(G, c); remember(c); }
  if (c.joined) { broadcast({ t: 'ev', text: `${c.name} вышел из игры` }); sendPlayers(); }
  log(`отключился: ${c.name} (онлайн: ${joinedCount()})`);
  if (G && c.joined) { broadcast({ t: 'deadlist', ids: deadIds() }); checkDefeat(G); } // ушёл последний живой — не оставляем призраков одних
}

function onMessage(c, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'join') { if (!c.joined) onJoin(c, msg); return; }
  const G = state.G;
  if (!c.joined) return;
  // чат, вход хоста и его команды работают и на экранах победы/поражения; остальное — только во время игры
  if (msg.t === 'chat') {
    const now = Date.now() / 1000;
    const cmd = typeof msg.text === 'string' && msg.text.trim().startsWith('/');
    // у хоста свой лимит частоты команд; остальным — общий лимит чата (иначе можно засыпать консоль сервера)
    if (!(cmd && c.admin) && now - (c.chatT || 0) < CHAT_GAP) return;
    if (cmd) { if (!c.admin) c.chatT = now; ADM.onAdmin(state.G, c, { line: msg.text }, API); return; } // команды хоста
    c.chatT = now;
    const text = String(msg.text || '').replace(/[<>&]/g, '').trim().slice(0, 120);
    if (text) broadcast({ t: 'chat', id: c.id, name: c.name, text });
    return;
  }
  if (msg.t === 'rtt') { if (msg.k === c.rttK) c.rtt = Date.now() - c.rttK; return; }
  if (msg.t === 'auth') { ADM.auth(c, msg.token); return; }
  if (msg.t === 'adm') { ADM.onAdmin(G, c, msg, API); return; }
  if (G.state !== 'play') return;
  if (c.dead) { // призрак: смотрит за живыми, ставит метки, больше ничего
    if (msg.t === 'watch') c.watch = +msg.id;
    else if (msg.t === 'mark') {
      const now = Date.now() / 1000;
      if (now - (c.markT || 0) < 2.5) return;
      c.markT = now;
      const x = +msg.x, y = +msg.y, z = +msg.z;
      if ([x, y, z].every(Number.isFinite)) broadcast({ t: 'mark', x, y, z, by: c.name, ghost: true });
    }
    return;
  }
  if (msg.t === 'emote') { emote(G, c, +msg.k); return; }
  if (msg.t === 'p' && c.caged) { const r = +msg.r; if (Number.isFinite(r)) c.r = r; return; } // в клетке — только смотреть
  if (msg.t === 'p' && c.hiding) { const r = +msg.r; if (Number.isFinite(r)) c.r = r; return; } // в шкафчике — только смотреть
  if (msg.t === 'unhide' && c.hiding) { unhide(G, c); return; }
  if (c.caged) return;
  if (msg.t === 'p' && c.mods && c.mods.frozen) { const r = +msg.r; if (Number.isFinite(r)) c.r = r; return; } // заморожен хостом
  if (msg.t === 'p') {
    const x = +msg.x, y = +msg.y, z = +msg.z, r = +msg.r;
    if ([x, y, z, r].every(Number.isFinite)) {
      if (!movementOk(c, x, y, z)) return; // античит: слишком быстро — вернули игрока на место
      const node = BR.nodeAt(G.map, x, y + 0.1, z);
      // скорость по горизонтали (сглаженная): существа слышат бег
      const now = Date.now(), pdt = (now - (c.posT || now)) / 1000;
      if (pdt > 0.02) { const v = Math.min(12, Math.hypot(x - c.x, z - c.z) / pdt); c.spd = (c.spd || 0) * 0.5 + v * 0.5; }
      c.posT = now;
      c.x = Math.min(N * TILE, Math.max(0, x));
      c.y = Math.min(G.map.F * G.map.FH + 2, Math.max(-6, y));
      c.z = Math.min(N * TILE, Math.max(0, z));
      c.r = r;
      c.fl = !!msg.f;
      c.crouch = !!msg.c;
      c.pitch = Number.isFinite(+msg.pi) ? Math.max(-1.6, Math.min(1.6, +msg.pi)) : 0;
      c.st = Math.max(0, Math.min(1, +msg.st || 0)); c.bat = Math.max(0, Math.min(1, +msg.bt || 0));
      if (node >= 0) c.node = node; // в воздухе / на лестнице оставляем последний узел
    }
  } else if (msg.t === 'use') {
    const o = G.objs.find((q) => q.id === msg.id);
    if (!o || !near(o, c, USE_DIST)) return;
    if (o.text) { // записки, кассеты, таблицы
      c.send({ t: 'note', title: o.title, text: o.text });
      for (const name of G.cfg.puzzles) if (PUZZLES[name].read) PUZZLES[name].read(G, c, o);
      return;
    }
    if (o.kind === 'cage') { SS.freeCage(G, c, o); return; }
    if (o.kind === 'locker') { hide(G, c, o); return; }
    if (o.kind === 'altar') {
      if (!DIR.DIFFICULTY[G.difficulty].revive) { c.send({ t: 'ev', text: 'Хардкор: алтарь мёртв. Одна жизнь на уровень.' }); return; }
      if (o.used) { c.send({ t: 'ev', text: 'Алтарь уже погас' }); return; }
      const dead = joinedList().filter((p) => p.dead);
      if (!dead.length) { c.send({ t: 'ev', text: 'Алтарь тихо гудит. Сейчас некого возвращать.' }); return; }
      patch(o, { used: true });
      dead.forEach((p, k) => revive(G, p, { x: o.x + (k % 2 ? 1.2 : -1.2), y: o.y, z: o.z + 1.2 }, c.name));
      return;
    }
    if (o.kind === 'lore') G.stats.notes.add(o.id);
    for (const name of G.cfg.puzzles) if (PUZZLES[name].use && PUZZLES[name].use(G, c, o)) return;
    if (useCommon(G, c, o)) return; // лифты, рации, мониторы, переключатели
  } else if (msg.t === 'code') {
    if (G.cfg.puzzles.includes('code')) enterCode(G, c, msg.v);
  } else if (msg.t === 'ping' || msg.t === 'ask' || msg.t === 'scan') {
    const id = +msg.id;
    if (!checkTarget(G, c, id)) return;
    if (msg.t === 'ping') SS.ping(G, c, id, clientById);
    else if (msg.t === 'ask') SS.ask(G, c, id, clientById);
    else SS.scan(G, c, id, clientById);
  } else if (msg.t === 'pong') {
    SS.pong(G, c);
  } else if (msg.t === 'answer') {
    SS.answer(G, c, msg.word);
  } else if (msg.t === 'throw') {
    throwNoise(G, c);
  } else if (msg.t === 'dbg' && config.TEST_HOOKS) {
    // только для автотестов (TEST_HOOKS=1): ускорить двойника
    if (msg.cmd === 'ss-victim' && G.ss) {
      const v = clientById(+msg.id);
      G.ss.victim = +msg.id; G.ss.state = 'STEAL'; G.ss.t = 30; G.ss.disguise = null;
      if (v) { const m = G.ss.m; Object.assign(m.body, { x: v.x + 0.5, y: v.y, z: v.z, vy: 0 }); Object.assign(m, { x: v.x + 0.5, y: v.y, z: v.z }); }
    }
    if (msg.cmd === 'freeze-mobs') { G.mobsFrozen = true; for (const m of G.mobs) m.stun = 1e9; }
    if (msg.cmd === 'kill') { const v = clientById(+msg.id); if (v) killPlayer(G, v, 'Тест', 'тест'); }
    if (msg.cmd === 'give' && c.items[msg.item] !== undefined) { c.items[msg.item] = 1; c.send({ t: 'items', items: c.items }); }
    if (msg.cmd === 'ss-unmask' && G.ss && G.ss.state === 'IMPERSONATE') G.ss.t = 999;
  } else if (msg.t === 'hash') {
    // клиент построил карту — сверяем геометрию
    if (msg.level === G.idx && msg.hash !== G.map.hash) {
      log(`ВНИМАНИЕ: карта у ${c.name} отличается (хэш ${msg.hash}, на сервере ${G.map.hash})`);
      c.send({ t: 'ev', text: 'Карта не совпадает с сервером — обновите страницу (Ctrl+F5)' });
    }
  } else if (msg.t === 'drown') {
    if (G.cfg.chase || c.god) teleport(G, c, randomFloorFar(G, c), 'drown');
    else killPlayer(G, c, 'Вы захлебнулись', 'захлебнулся');
  } else if (msg.t === 'fall') {
    const h = +msg.h;
    if (Number.isFinite(h) && h > FATAL_FALL && !G.cfg.chase && !c.god) killPlayer(G, c, 'Падение с большой высоты', 'разбился при падении');
  } else if (msg.t === 'stuck') {
    teleport(G, c, G.map.spawn, 'stuck');
  } else if (msg.t === 'revive') {
    // аптечка: поднять того, кто погиб раньше всех
    if (!c.items.medkit) return;
    if (!DIR.DIFFICULTY[G.difficulty].revive) { c.send({ t: 'ev', text: 'Хардкор: воскрешения нет.' }); return; }
    const dead = joinedList().filter((p) => p.dead).sort((a, b) => a.deadAt - b.deadAt)[0];
    if (!dead) { c.send({ t: 'ev', text: 'Некого воскрешать' }); return; }
    c.items.medkit--; c.send({ t: 'items', items: c.items });
    revive(G, dead, { x: c.x, y: c.y, z: c.z }, c.name);
  } else if (msg.t === 'mark') {
    const now = Date.now() / 1000;
    if (now - (c.markT || 0) < 2.5) return;
    c.markT = now;
    const x = +msg.x, y = +msg.y, z = +msg.z, kind = ['here', 'danger', 'item'].includes(msg.kind) ? msg.kind : 'here';
    if ([x, y, z].every(Number.isFinite)) broadcast({ t: 'mark', x, y, z, by: c.name, kind });
  }
}

module.exports = { startLevel, tick, onMessage, onLeave };
