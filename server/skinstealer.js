'use strict';
// Skin Stealer — существо-двойник. Машина состояний на сервере:
//   HIDDEN → STALK → STEAL → IMPERSONATE → HUNT → EXPOSED → HIDDEN …
// Принцип приватности: пока двойник «в маске», клиенты не получают о нём НИКАКИХ флагов.
// Он занимает id жертвы (жертва сидит в клетке и пропадает из снапшотов), и его позиция уходит
// в том же формате, что и у игрока. В списке существ он появляется только после разоблачения.
// В одиночной игре двойник «заходит в игру» как новый игрок с обычным ником.
const BR = require('../shared/map.js');
const { broadcast, log, allocVirtual, freeVirtual, sendPlayers, joinedList } = require('./clients');
const { newMob, mobMove, randomFloorFar } = require('./mobs');

const FAST = !!process.env.SKIN_FAST; // для тестов: всё быстрее
const T = {
  grace: FAST ? 2 : 45,          // сколько прячется в начале уровня
  stalk: FAST ? 20 : 40,         // сколько выслеживает жертву
  impersonate: FAST ? [4, 6] : [50, 80],
  hunt: FAST ? 30 : 45,
  flee: FAST ? 4 : 12,
  cooldown: FAST ? 5 : 60,       // после разоблачения — пауза перед новой охотой
};
const ALONE = 18;                // «одиночка»: никого из своих ближе, чем на столько метров
const STALK_KEEP = 12;           // держится на таком расстоянии, выслеживая
const LIGHT_TIME = 2;            // столько секунд в луче фонарика — и маска слетает
const LIGHT_DIST = 16, LIGHT_ANGLE = 0.32;
const PONG_TIMEOUT = 6;
const NICKS = ['Игрок', 'Player', 'Гость'];
const FAKE_CHAT = ['сюда', 'я что-то нашёл', 'идите ко мне', 'тут дверь', 'не отставайте', 'вы где?', 'кажется, здесь', '...'];

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a, b) => a + Math.random() * (b - a);

function createStealer(G) {
  const far = randomFloorFar(G, G.map.spawn);
  G.ss = {
    state: 'HIDDEN', t: T.grace, m: newMob(G.map, far.x, far.y, far.z, 0, 'skinstealer'),
    victim: null, disguise: null, target: null, lightT: 0, anomaly: 0, fl: false, glitchName: 0, pending: [],
  };
}

// Игроки «на свободе» (не в клетке)
const free = (players) => players.filter((p) => !p.caged);

function isAlone(p, players, G) {
  return players.every((q) => q === p || q.caged || dist2(p, q) > ALONE ||
    !BR.los3(G.map, p.x, p.y + 1.5, p.z, q.x, q.y + 1.5, q.z));
}

function setState(G, s, t) { G.ss.state = s; G.ss.t = t; }

/* ---------------------------- Маскировка ---------------------------- */
function wearMask(G, id, name, from) {
  const ss = G.ss;
  ss.disguise = { id, name, fake: !from };
  ss.fl = from ? !!from.fl : false;
  ss.anomaly = 0;
  setState(G, 'IMPERSONATE', rand(...T.impersonate));
  log(`двойник надел маску «${name}» (id ${id})`);
}

// Сорвать маску: двойник становится видимым существом
function expose(G, why) {
  const ss = G.ss;
  if (!ss || !ss.disguise) return;
  const d = ss.disguise;
  ss.disguise = null;
  if (d.fake) { freeVirtual(d.id); broadcast({ t: 'ev', text: `${d.name} вышел из игры` }); sendPlayers(); }
  broadcast({ t: 'exposed', id: d.id, x: ss.m.x, y: ss.m.y, z: ss.m.z });
  broadcast({ t: 'ev', text: `Это был не ${d.name}! ДВОЙНИК! (${why})` });
  broadcast({ t: 'sfx', name: 'shriek' });
  setState(G, 'EXPOSED', T.flee);
  log(`двойник разоблачён: ${why}`);
}

/* ------------------------------ Клетки ------------------------------ */
// Клетки стоят на уровне с самого начала; кто внутри, видно только вблизи (без утечек по сети)
function placeCages(G, add, rnd) {
  BR.pickSpots(G.map, rnd, 3, { minDist: 0.4 * G.map.maxDist, minSep: 10 })
    .forEach((p) => add('cage', { x: p.x, y: p.y, z: p.z }));
}

function capture(G, victim) {
  const ss = G.ss;
  const cages = G.objs.filter((o) => o.kind === 'cage' && !o.prisoner);
  if (!cages.length) return false;
  const cage = cages.reduce((a, b) => (dist2(b, victim) > dist2(a, victim) ? b : a));
  cage.prisoner = victim.id;
  const pos = { x: victim.x, y: victim.y, z: victim.z, r: victim.r };
  victim.caged = cage.id;
  victim.x = cage.x; victim.y = cage.y; victim.z = cage.z;
  victim.send({ t: 'caged', x: cage.x, y: cage.y, z: cage.z, cage: cage.id });
  Object.assign(ss.m.body, { x: pos.x, y: pos.y, z: pos.z, vy: 0 });
  Object.assign(ss.m, { x: pos.x, y: pos.y, z: pos.z, r: pos.r });
  wearMask(G, victim.id, victim.name, victim);
  log(`двойник украл облик игрока ${victim.name}`);
  return true;
}

// Игрок открыл клетку
function freeCage(G, c, cage) {
  if (!cage.prisoner) { c.send({ t: 'ev', text: 'Клетка пуста. Пока что.' }); return; }
  const victim = joinedList().find((p) => p.id === cage.prisoner);
  cage.prisoner = 0;
  if (!victim) return;
  victim.caged = 0;
  const spot = freeSpotNear(G, cage, 1.8);
  victim.x = spot.x; victim.y = spot.y; victim.z = spot.z; victim.invuln = 4;
  victim.send({ t: 'freed', x: victim.x, y: victim.y, z: victim.z });
  broadcast({ t: 'ev', text: `${c.name} освободил ${victim.name} из клетки!` });
  if (G.ss && G.ss.disguise && G.ss.disguise.id === victim.id) expose(G, `настоящий ${victim.name} на свободе`);
}

// Свободное место рядом с точкой (не в стене, на том же полу)
function freeSpotNear(G, p, d) {
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (BR.blocked(G.map, x, p.y, z, BR.PHYS.R, BR.PHYS.H, BR.PHYS.STEP)) continue;
    if (Math.abs(BR.groundAt(G.map, x, p.y + 0.3, z, BR.PHYS.R, BR.PHYS.STEP) - p.y) > 0.3) continue;
    return { x, y: p.y, z };
  }
  return { x: p.x, y: p.y, z: p.z };
}

/* ------------------------------ Тик ------------------------------ */
function tickStealer(G, dt, players) {
  const ss = G.ss;
  if (!ss) return;
  const live = free(players);
  if (!live.length) return;
  const m = ss.m;
  ss.t -= dt;
  flushPending(G, dt);

  switch (ss.state) {
    case 'HIDDEN': {
      if (ss.t > 0) { if (Math.random() < dt * 0.004) falseAlarm(live); return; }
      if (live.length === 1 && players.length === 1) { // соло: «новый игрок» заходит в игру
        const id = allocVirtual(`${NICKS[Math.floor(Math.random() * NICKS.length)]}${10 + Math.floor(Math.random() * 90)}`);
        const p0 = live[0];
        const pos = randomNear(G, p0, 25, 45);
        Object.assign(m.body, { x: pos.x, y: pos.y, z: pos.z, vy: 0 }); Object.assign(m, pos);
        broadcast({ t: 'ev', text: `${id.name} зашёл в игру` });
        sendPlayers();
        wearMask(G, id.id, id.name, null);
        return;
      }
      const alone = live.filter((p) => isAlone(p, live, G));
      if (!alone.length) { ss.t = 3; return; }
      ss.victim = alone[Math.floor(Math.random() * alone.length)].id;
      setState(G, 'STALK', T.stalk);
      return;
    }
    case 'STALK': case 'STEAL': {
      const v = live.find((p) => p.id === ss.victim);
      if (!v || ss.t <= 0) { setState(G, 'HIDDEN', T.cooldown / 2); return; }
      const d = dist2(v, m);
      const alone = isAlone(v, live, G);
      if (ss.state === 'STALK') {
        if (alone && d < 16) setState(G, 'STEAL', 15);
        else if (d > STALK_KEEP + 3) mobMove(G, m, dt, v.node, 3.2);
        else if (BR.los3(G.map, v.x, v.y + 1.6, v.z, m.x, m.y + 1.6, m.z)) mobMove(G, m, dt, farNodeFrom(G, v), 3.6); // заметили — отходит
      } else {
        if (!alone) { setState(G, 'STALK', ss.t); return; }
        mobMove(G, m, dt, v.node, 5.6, v);
        if (d < 1.4 && Math.abs(v.y - m.y) < 1.4 && !capture(G, v)) setState(G, 'HIDDEN', T.cooldown);
      }
      return;
    }
    case 'IMPERSONATE': {
      ss.anomaly = Math.min(1, ss.anomaly + dt / 60);
      // держится рядом с ближайшим «товарищем», как обычный игрок
      const others = live.filter((p) => !ss.disguise || p.id !== ss.disguise.id);
      const buddy = others.reduce((a, b) => (!a || dist2(b, m) < dist2(a, m) ? b : a), null);
      if (buddy && dist2(buddy, m) > 5 && buddy.node >= 0) mobMove(G, m, dt, buddy.node, 3.6, buddy);
      anomalies(G, dt, live);
      checkLight(G, dt, live);
      if (ss.t <= 0 && ss.disguise) {
        ss.target = (others.find((p) => isAlone(p, live, G)) || others[0] || {}).id;
        setState(G, 'HUNT', T.hunt);
      }
      return;
    }
    case 'HUNT': {
      const tg = live.find((p) => p.id === ss.target);
      checkLight(G, dt, live);
      if (!tg || ss.t <= 0) { setState(G, 'IMPERSONATE', rand(...T.impersonate) / 2); return; }
      anomalies(G, dt, live);
      if (tg.node >= 0) mobMove(G, m, dt, tg.node, 4.4, tg);
      if (dist2(tg, m) < 1.3 && Math.abs(tg.y - m.y) < 1.4 && tg.invuln <= 0) {
        G.catchHook(tg, m);
        expose(G, `напал на ${tg.name}`);
      }
      return;
    }
    case 'EXPOSED': {
      checkLight(G, dt, live);
      if (ss.stunned > 0) { ss.stunned -= dt; return; }
      if (ss.t > 0) mobMove(G, m, dt, farNodeFrom(G, nearest(live, m)), 5.0);
      else setState(G, 'HIDDEN', T.cooldown);
      return;
    }
  }
}

function nearest(list, m) { return list.reduce((a, b) => (!a || dist2(b, m) < dist2(a, m) ? b : a), null); }

function farNodeFrom(G, p) {
  const f = randomFloorFar(G, p, 12);
  return BR.nodeAt(G.map, f.x, f.y + 0.1, f.z);
}

function randomNear(G, p, dmin, dmax) {
  for (let k = 0; k < 60; k++) {
    const n = G.map.spots[Math.floor(Math.random() * G.map.spots.length)];
    const q = BR.nodePos(G.map, n);
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d >= dmin && d <= dmax) return q;
  }
  return randomFloorFar(G, p);
}

// Странности двойника: нарастают со временем и выглядят как обычные данные (лаг, мигание фонаря, сбой ника)
function anomalies(G, dt, live) {
  const ss = G.ss, a = ss.anomaly;
  if (!ss.disguise) return;
  if (Math.random() < dt * a * 0.08) { // «подёргивание кадра»
    ss.m.x += rand(-0.5, 0.5); ss.m.z += rand(-0.5, 0.5);
  }
  if (Math.random() < dt * (0.02 + a * 0.06)) ss.fl = !ss.fl; // фонарь включается невпопад
  if (Math.random() < dt * a * 0.02 && !ss.glitchName) { // ник на мгновение «сбоит»
    ss.glitchName = 0.4;
    sendPlayers({ [ss.disguise.id]: glitch(ss.disguise.name) });
  }
  if (ss.glitchName > 0) { ss.glitchName -= dt; if (ss.glitchName <= 0) { ss.glitchName = 0; sendPlayers(); } }
  if (Math.random() < dt * (0.004 + a * 0.01)) { // реплика в чат от имени жертвы
    broadcast({ t: 'chat', id: ss.disguise.id, name: ss.disguise.name, text: FAKE_CHAT[Math.floor(Math.random() * FAKE_CHAT.length)] });
  }
  for (const p of live) if (dist2(p, ss.m) < 12 && Math.random() < dt * 0.03) p.send({ t: 'sfx', name: 'whisper' });
}

function glitch(name) {
  const map = { о: '0', е: '3', а: '@', и: 'u', l: '1', a: '4', e: '3', o: '0' };
  return name.split('').map((ch) => (Math.random() < 0.5 && map[ch.toLowerCase()] ? map[ch.toLowerCase()] : ch)).join('');
}

// Ложная тревога: шёпот у случайного игрока, даже если двойника рядом нет
function falseAlarm(live) { live[Math.floor(Math.random() * live.length)].send({ t: 'sfx', name: 'whisper' }); }

// Световой тест: двойник не выдерживает прямого луча фонарика
function checkLight(G, dt, live) {
  const ss = G.ss, m = ss.m;
  let lit = false;
  for (const p of live) {
    if (!p.fl || (ss.disguise && p.id === ss.disguise.id)) continue;
    const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
    if (d > LIGHT_DIST || d < 0.3) continue;
    // направление взгляда игрока: yaw r, вперёд = (-sin r, -cos r)
    const fx = -Math.sin(p.r), fz = -Math.cos(p.r);
    const cos = (dx * fx + dz * fz) / d;
    if (cos < Math.cos(LIGHT_ANGLE)) continue;
    if (!BR.los3(G.map, p.x, p.y + 1.5, p.z, m.x, m.y + 1.4, m.z)) continue;
    lit = true; break;
  }
  ss.lightT = lit ? ss.lightT + dt : Math.max(0, ss.lightT - dt * 2);
  if (ss.lightT < LIGHT_TIME) return;
  ss.lightT = 0;
  if (ss.disguise) expose(G, 'не выдержал света фонаря');
  else if (ss.state === 'EXPOSED' || ss.state === 'HUNT') {
    ss.stunned = 3;
    broadcast({ t: 'ev', text: 'Двойник ослеплён светом и отступает!' });
    setState(G, 'EXPOSED', T.flee);
  }
}

/* --------------------------- Проверки игроков --------------------------- */
// Отложенные «ответы» двойника (он реагирует с опозданием)
function later(G, delay, fn) { G.ss.pending.push({ t: delay, fn }); }
function flushPending(G, dt) {
  const ss = G.ss;
  for (const p of ss.pending) p.t -= dt;
  const due = ss.pending.filter((p) => p.t <= 0);
  ss.pending = ss.pending.filter((p) => p.t > 0);
  for (const p of due) p.fn();
}

const isMask = (G, id) => !!(G.ss && G.ss.disguise && G.ss.disguise.id === id);

// Пинг-проверка: настоящий игрок отвечает жестом, двойник — поздно или «не так»
function ping(G, from, targetId, clientById) {
  broadcast({ t: 'ev', text: `${from.name} проверяет ${nameOf(G, targetId, clientById)}…` });
  if (isMask(G, targetId)) {
    const d = G.ss.disguise;
    if (Math.random() < 0.2) later(G, PONG_TIMEOUT, () => broadcast({ t: 'ev', text: `${d.name} не ответил на проверку` }));
    else later(G, rand(2.4, 4.8), () => broadcast({ t: 'gesture', id: d.id, kind: Math.random() < 0.55 ? 'wave' : 'glitch' }));
    return;
  }
  const t = clientById(targetId);
  if (!t || t.caged) return;
  t.pingBy = from.id; t.pingT = PONG_TIMEOUT;
  t.send({ t: 'pinged', by: from.name });
}
function pong(G, c) {
  if (!c.pingT) return;
  c.pingT = 0;
  broadcast({ t: 'gesture', id: c.id, kind: 'wave' });
}
function tickPings(G, dt, players) {
  for (const p of players) {
    if (!p.pingT) continue;
    p.pingT -= dt;
    if (p.pingT <= 0) { p.pingT = 0; broadcast({ t: 'ev', text: `${p.name} не ответил на проверку` }); }
  }
}

// Кодовое слово: у каждого своё; двойник его не знает
function ask(G, from, targetId, clientById) {
  if (isMask(G, targetId)) {
    const d = G.ss.disguise;
    later(G, rand(3, 6), () => broadcast({ t: 'ev', text: `${d.name} назвал кодовое слово: ✘ НЕВЕРНО` }));
    broadcast({ t: 'ev', text: `${from.name} спрашивает у ${d.name} кодовое слово` });
    return;
  }
  const t = clientById(targetId);
  if (!t || t.caged) return;
  t.askBy = from.id;
  t.send({ t: 'ask', by: from.name });
  broadcast({ t: 'ev', text: `${from.name} спрашивает у ${t.name} кодовое слово` });
}
function answer(G, c, word) {
  if (!c.askBy) return;
  c.askBy = 0;
  const ok = String(word || '').trim().toUpperCase() === c.word;
  broadcast({ t: 'ev', text: `${c.name} назвал кодовое слово: ${ok ? '✔ верно' : '✘ НЕВЕРНО'}` });
}

// Детектор: сканирует игрока перед собой
function scan(G, from, targetId, clientById) {
  if (!from.items || !from.items.detector) { from.send({ t: 'ev', text: 'У вас нет детектора' }); return; }
  if (isMask(G, targetId)) { expose(G, `детектор ${from.name}`); return; }
  const t = clientById(targetId);
  if (t) broadcast({ t: 'ev', text: `Детектор ${from.name}: ${t.name} — чисто` });
}
// Детектор пищит владельцу, если двойник ближе 10 м
function detectorBeeps(G, players, dt) {
  const ss = G.ss;
  if (!ss || !ss.disguise) return;
  for (const p of players) {
    if (!p.items || !p.items.detector || p.caged) continue;
    const d = dist2(p, ss.m);
    if (d > 10) continue;
    p.beepT = (p.beepT || 0) - dt;
    if (p.beepT <= 0) { p.beepT = 0.25 + d / 10; p.send({ t: 'sfx', name: 'detector' }); }
  }
}

const nameOf = (G, id, clientById) => (isMask(G, id) ? G.ss.disguise.name : (clientById(id) || {}).name || '?');

/* --------------------------- Для снапшотов --------------------------- */
// Запись «игрока»-двойника — тот же формат, что и у настоящих игроков
function maskEntry(G, f) {
  const ss = G.ss;
  if (!ss || !ss.disguise) return null;
  return [ss.disguise.id, f(ss.m.x), f(ss.m.y), f(ss.m.z), f(ss.m.r + Math.PI), ss.fl ? 1 : 0, 0];
}
// Видимое существо (только после разоблачения)
function monsterEntry(G, f, typeIdx) {
  const ss = G.ss;
  if (!ss || ss.disguise || ss.state !== 'EXPOSED') return null;
  return [f(ss.m.x), f(ss.m.y), f(ss.m.z), f(ss.m.r), 1, ss.stunned > 0 ? 1 : 0, typeIdx];
}

module.exports = {
  createStealer, placeCages, tickStealer, freeCage, expose, ping, pong, tickPings, ask, answer, scan,
  detectorBeeps, maskEntry, monsterEntry, isMask, T,
};
