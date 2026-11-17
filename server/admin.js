'use strict';
// Админ-панель хоста. Все права проверяются ТОЛЬКО здесь, на сервере.
// Токен печатается в консоли при старте; без него ни одна команда не выполнится, даже если подделать сообщение.
// Каждое действие пишется в консоль и показывается игрокам уведомлением.
const crypto = require('crypto');
const BR = require('../shared/map.js');
require('../shared/admin.js');
const state = require('./state');
const { clients, joinedList, broadcast, log } = require('./clients');
const { newMob, randomFloorFar } = require('./mobs');
const { animateWater, checkSolved, sendGoals, patch, near } = require('./puzzles');
const SS = require('./skinstealer');

const { validate, parseChat, BY_CMD, HELP } = BR.ADMIN;
const TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(9).toString('base64url');
const RATE = 10;            // не больше 10 команд в секунду
const AUTH_TRIES = 5;       // после 5 неверных токенов — пауза
const AUTH_LOCK = 60;       // секунд
const banned = new Set();   // ники и адреса, забаненные до перезапуска сервера

// Глобальные «правила мира» (переживают смену уровня) — клиенты получают их в сообщении world
const WORLD = state.WORLD = {
  light: 1, lights: true, flicker: false, fog: 1, gravity: 1, timescale: 1, disco: false, invert: false, fov: 0,
  filter: 'none', freecam: false, mobskin: 'default', lava: false, mobspeed: 1, friendly: false, aioff: false, tag: 0,
};

const defMods = () => ({ speed: 1, jump: 1, fly: false, noclip: false, size: 1, skin: 'human', color: -1, frozen: false, god: false, invis: false, notorch: false, possessed: false });

function worldMsg() {
  const mods = {};
  for (const c of joinedList()) mods[c.id] = c.mods || defMods();
  return { t: 'world', w: WORLD, mods };
}
const sendWorld = () => broadcast(worldMsg());

function auth(c, token) {
  const now = Date.now() / 1000;
  if (c.authLock > now) return c.send({ t: 'auth', ok: false, error: 'Слишком много попыток, подождите' });
  const a = Buffer.from(String(token || '')), b = Buffer.from(TOKEN);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (ok) {
    c.admin = true;
    c.send({ t: 'auth', ok: true });
    log(`[ADMIN] ${c.name} вошёл как хост`);
    return;
  }
  c.authFails = (c.authFails || 0) + 1;
  if (c.authFails >= AUTH_TRIES) { c.authLock = now + AUTH_LOCK; c.authFails = 0; }
  log(`[ADMIN] неверный токен от ${c.name}`);
  c.send({ t: 'auth', ok: false, error: 'Неверный токен' });
}

// Ограничение частоты команд
function rateOk(c) {
  const now = Date.now();
  c.admT = (c.admT || []).filter((t) => now - t < 1000);
  if (c.admT.length >= RATE) return false;
  c.admT.push(now);
  return true;
}

// Сообщение 'adm': { cmd, args } или { line: '/команда …' } (из чата)
function onAdmin(G, c, msg, api) {
  if (!c.admin) {
    log(`[ADMIN] ${c.name} попытался выполнить команду без прав`);
    return c.send({ t: 'adm', ok: false, error: 'Нет прав хоста' });
  }
  if (!rateOk(c)) return c.send({ t: 'adm', ok: false, error: 'Слишком часто' });
  let cmd = msg.cmd, raw = msg.args;
  if (typeof msg.line === 'string') {
    const pc = parseChat(msg.line, joinedList());
    if (pc.help) return c.send({ t: 'adm', ok: true, info: HELP });
    if (pc.error) return c.send({ t: 'adm', ok: false, error: pc.error });
    cmd = pc.cmd; raw = pc.args;
  }
  if (typeof cmd !== 'string' || !BY_CMD[cmd]) return c.send({ t: 'adm', ok: false, error: 'Неизвестная команда' });
  const v = validate(cmd, raw, { players: joinedList().map((p) => p.id), levels: BR.LEVELS.length });
  if (!v.ok) return c.send({ t: 'adm', ok: false, error: v.error });
  try {
    const res = HANDLERS[cmd](G, c, v.args, api) || {};
    if (res.error) return c.send({ t: 'adm', ok: false, error: res.error });
    log(`[ADMIN] ${c.name}: ${cmd} ${JSON.stringify(v.args)}`);
    const n = notice(cmd, v.args, c);
    if (n) broadcast({ t: 'ev', text: n, admin: true });
    c.send({ t: 'adm', ok: true, cmd });
  } catch (e) {
    log(`[ADMIN] ошибка в команде ${cmd}: ${e.stack || e.message}`);
    c.send({ t: 'adm', ok: false, error: 'Ошибка выполнения' });
  }
}

function notice(cmd, a, c) {
  const spec = BY_CMD[cmd];
  if (!spec.notice) return null;
  const nameOf = (id) => (id === 'all' ? 'всем' : id === 'me' ? c.name : (clients.get(id) || {}).name || '?');
  const label = (argName, v) => {
    const s = spec.args.find((x) => x.n === argName);
    if (s && s.options) { const o = s.options.find(([k]) => k === v); return o ? o[1] : v; }
    return v;
  };
  return spec.notice
    .replace(/\{on:([^:}]*):([^}]*)\}/g, (_, yes, no) => (a.on ? yes : no))
    .replace('{name}', nameOf(a.id)).replace('{on}', a.on ? 'вкл' : 'выкл')
    .replace('{v}', label('v', a.v)).replace('{item}', label('item', a.item)).replace('{type}', label('type', a.type));
}

// Цели команды: id → список игроков
function targets(c, id) {
  if (id === 'all') return joinedList();
  if (id === 'me') return [c];
  const p = clients.get(id);
  return p && p.joined ? [p] : [];
}
const mods = (p) => p.mods || (p.mods = defMods());
function setMod(c, id, key, val) { for (const p of targets(c, id)) mods(p)[key] = val; sendWorld(); }
function setWorld(key, val) { WORLD[key] = val; sendWorld(); }

// Точка в паре метров перед игроком (не в стене)
function ahead(G, c, d = 2.5) {
  const fx = -Math.sin(c.r), fz = -Math.cos(c.r);
  let best = { x: c.x, y: c.y, z: c.z };
  for (let s = 0.5; s <= d; s += 0.25) {
    const x = c.x + fx * s, z = c.z + fz * s;
    if (BR.blocked(G.map, x, c.y, z, 0.4, 1.7, 0.6)) break;
    best = { x, y: c.y, z };
  }
  return best;
}

const ITEM_KEYS = { detector: 'detector', noise: 'noise', medkit: 'medkit' };

const HANDLERS = {
  bring: (G, c, a, api) => { for (const p of targets(c, a.id)) if (p !== c) api.teleport(G, p, ahead(G, c), 'admin'); },
  goto: (G, c, a, api) => { const t = targets(c, a.id)[0]; if (t && t !== c) api.teleport(G, c, { x: t.x + 1, y: t.y, z: t.z }, 'admin'); },
  kick: (G, c, a) => { for (const p of targets(c, a.id)) if (p !== c) { p.send({ t: 'kicked', text: 'Хост выгнал вас из игры' }); setTimeout(() => p.conn.socket.destroy(), 200); } },
  ban: (G, c, a) => {
    for (const p of targets(c, a.id)) if (p !== c) {
      banned.add(p.name.toLowerCase()); banned.add(p.conn.socket.remoteAddress);
      p.send({ t: 'kicked', text: 'Хост забанил вас' }); setTimeout(() => p.conn.socket.destroy(), 200);
    }
  },
  revive: (G, c, a, api) => { for (const p of targets(c, a.id)) if (p.dead) api.revive(G, p, ahead(G, c), 'Хост'); },
  kill: (G, c, a, api) => { for (const p of targets(c, a.id)) api.kill(G, p, 'Хост решил иначе', 'так решил хост'); },
  god: (G, c, a) => { for (const p of targets(c, a.id)) p.god = a.on; setMod(c, a.id, 'god', a.on); },
  invis: (G, c, a) => setMod(c, a.id, 'invis', a.on),
  speed: (G, c, a) => setMod(c, a.id, 'speed', a.v),
  jump: (G, c, a) => setMod(c, a.id, 'jump', a.v),
  fly: (G, c, a) => setMod(c, a.id, 'fly', a.on),
  noclip: (G, c, a) => setMod(c, a.id, 'noclip', a.on),
  size: (G, c, a) => setMod(c, a.id, 'size', a.v),
  skin: (G, c, a) => setMod(c, a.id, 'skin', a.v),
  color: (G, c, a) => setMod(c, a.id, 'color', a.v),
  give: (G, c, a) => {
    for (const p of targets(c, a.id)) {
      if (ITEM_KEYS[a.item]) { p.items[ITEM_KEYS[a.item]] = (p.items[ITEM_KEYS[a.item]] || 0) + 1; if (a.item === 'detector') p.items.detector = 1; p.send({ t: 'items', items: p.items }); }
      if (a.item === 'fuse') { G.pz.fuses.held++; sendGoals(G); }
      if (a.item === 'map') { state.TEAM.map = true; broadcast({ t: 'upgrade', what: 'map', by: 'Хост' }); }
    }
  },
  take: (G, c, a) => {
    for (const p of targets(c, a.id)) {
      if (ITEM_KEYS[a.item]) { p.items[ITEM_KEYS[a.item]] = 0; p.send({ t: 'items', items: p.items }); }
      if (a.item === 'fuse') { G.pz.fuses.held = 0; sendGoals(G); }
      if (a.item === 'map') { state.TEAM.map = false; broadcast({ t: 'upgrade', what: 'nomap' }); }
    }
  },
  torch: (G, c, a) => setMod(c, a.id, 'notorch', !a.on),
  freeze: (G, c, a) => setMod(c, a.id, 'frozen', a.on),
  say: (G, c, a) => broadcast({ t: 'say', text: a.text, by: c.name }),

  level: (G, c, a, api) => api.startLevel(a.v),
  difficulty: (G, c, a) => { state.difficulty = a.v; G.difficulty = a.v; }, // скорость и правила — сразу, аптечки — со следующего уровня
  daily: (G, c, a) => { state.daily = !!a.on; },
  modifiers: (G, c, a) => { state.modsOn = !!a.on; },
  seed: (G, c, a, api) => api.startLevel(G.idx, a.v),
  restart: (G, c, a, api) => api.startLevel(G.idx),
  skip: (G, c, a, api) => api.startLevel(G.idx === BR.LEVELS.length - 1 ? 0 : G.idx + 1),
  open: (G) => { G.cfg.puzzles.forEach((p) => { G.pz[p].solved = true; }); checkSolved(G); sendGoals(G); },
  solve: (G) => {
    for (const p of G.cfg.puzzles) {
      G.pz[p].solved = true;
      if (p === 'fuses') G.pz.fuses.inserted = G.pz.fuses.need;
      if (p === 'code') G.pz.code.found = G.pz.code.digits.slice();
      if (p === 'levers') G.pz.levers.progress = 4;
      if (p === 'pools') { G.pz.pools.stage = 3; animateWater(G, G.map.pools.atrZone, G.map.pools.high, 20); }
    }
    checkSolved(G); sendGoals(G);
  },
  tpxy: (G, c, a, api) => {
    const f = Math.min(G.map.F - 1, Math.floor(a.f));
    const g = BR.groundAt(G.map, a.x, f * G.map.FH + 1, a.z, 0.3, 1.2);
    api.teleport(G, c, { x: a.x, y: Number.isFinite(g) && g > -1e6 ? g : f * G.map.FH, z: a.z }, 'admin');
  },
  light: (G, c, a) => setWorld('light', a.v),
  lights: (G, c, a) => setWorld('lights', a.on),
  flicker: (G, c, a) => setWorld('flicker', a.on),
  siren: (G, c, a, api) => api.alarm(G, c.x, c.y, c.z),
  fog: (G, c, a) => setWorld('fog', a.v),
  gravity: (G, c, a) => setWorld('gravity', a.v),
  timescale: (G, c, a) => setWorld('timescale', a.v),
  rain: (G, c, a, api) => {
    for (const p of joinedList().filter((q) => !q.dead)) {
      for (let k = 0; k < 4; k++) {
        const pos = ahead(G, { x: p.x, y: p.y, z: p.z, r: Math.random() * 6.28 }, 1 + Math.random() * 4);
        api.addObj(G, a.item, { x: pos.x, y: pos.y, z: pos.z });
      }
    }
  },
  flood: (G, c, a) => {
    if (!G.map.wl.length) return { error: 'На этом уровне нет воды' };
    G.map.wl.forEach((v, zone) => animateWater(G, zone, v + a.v, 5));
  },
  disco: (G, c, a) => setWorld('disco', a.on),
  invert: (G, c, a) => setWorld('invert', a.on),
  fov: (G, c, a) => setWorld('fov', a.v),
  filter: (G, c, a) => setWorld('filter', a.v),
  freecam: (G, c, a) => { G.freeCam = a.on; setWorld('freecam', a.on); },

  spawn: (G, c, a) => {
    const p = ahead(G, c, 4);
    if (a.type === 'skinstealer') {
      if (!G.ss) SS.createStealer(G);
      if (G.ss.disguise) SS.expose(G, 'вызван хостом');
      Object.assign(G.ss.m.body, { x: p.x, y: p.y, z: p.z, vy: 0 }); Object.assign(G.ss.m, p);
      G.ss.state = 'HIDDEN'; G.ss.t = 3;
      if (!G.objs.some((o) => o.kind === 'cage')) return { error: 'Skin Stealer призван, но клеток на уровне нет — красть не сможет' };
      return;
    }
    if (a.type === 'drowner') {
      if (BR.waterAt(G.map, p.x, p.z, p.y) < p.y + 1) return { error: 'Утопленнику нужна глубокая вода рядом с вами' };
    }
    G.mobs.push(newMob(G.map, p.x, p.y, p.z, 1.5, a.type));
  },
  killall: (G) => { G.mobs.length = 0; if (G.ss) { if (G.ss.disguise) SS.expose(G, 'убран хостом'); G.ss = null; } },
  mobspeed: (G, c, a) => { setWorld('mobspeed', a.v); },
  aggro: (G) => { for (const m of G.mobs) { m.stun = 0; m.mode = 'chase'; m.lost = 0; } },
  stun: (G, c, a) => { for (const m of G.mobs) m.stun = a.v; if (G.ss) G.ss.stunned = a.v; },
  friendly: (G, c, a) => setWorld('friendly', a.on),
  clone: (G) => { for (const m of G.mobs.slice()) G.mobs.push(newMob(G.map, m.x + 0.6, m.y, m.z, 1, m.type)); },
  boss: (G) => {
    const m = G.mobs.find((q) => !q.boss && q.type !== 'drowner');
    if (!m) return { error: 'Нет подходящего существа' };
    m.boss = true;
  },
  aioff: (G, c, a) => setWorld('aioff', a.on),
  mobskin: (G, c, a) => setWorld('mobskin', a.v),
  possess: (G, c, a) => setMod(c, a.id, 'possessed', a.on),

  fireworks: (G, c) => broadcast({ t: 'fx', kind: 'fireworks', x: c.x, y: c.y, z: c.z }),
  confetti: (G, c) => broadcast({ t: 'fx', kind: 'confetti', x: c.x, y: c.y, z: c.z }),
  boom: (G, c, a, api) => {
    const p = ahead(G, c, 3);
    broadcast({ t: 'fx', kind: 'boom', x: p.x, y: p.y, z: p.z });
    for (const q of joinedList()) {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < 7 && !q.dead) { api.grace(q, 2500); q.send({ t: 'knock', vx: (q.x - p.x) / (d || 1) * 9, vy: 7, vz: (q.z - p.z) / (d || 1) * 9 }); }
    }
    for (const m of G.mobs) if (Math.hypot(m.x - p.x, m.z - p.z) < 8) m.stun = 5;
  },
  trampoline: (G, c, a, api) => { api.addObj(G, 'pad', { x: c.x, y: c.y, z: c.z }); },
  trap: (G, c, a, api) => { const p = ahead(G, c, 3); api.addObj(G, 'trap', { x: p.x, y: p.y, z: p.z }); },
  lava: (G, c, a) => setWorld('lava', a.on),
  tag: (G, c, a) => {
    const live = joinedList().filter((p) => !p.dead);
    setWorld('tag', a.on && live.length ? live[Math.floor(Math.random() * live.length)].id : 0);
  },
  hide: (G) => {
    for (const m of G.mobs) {
      const far = randomFloorFar(G, G.map.spawn);
      Object.assign(m.body, { x: far.x, y: far.y, z: far.z, vy: 0 }); Object.assign(m, { x: far.x, y: far.y, z: far.z, stun: 30, mode: 'wander' });
    }
    G.hideT = 30;
  },
  rules: (G, c, a) => broadcast({ t: 'rules', text: a.text, by: c.name }),
};

// Каждый тик: лава, догонялки, батуты-ловушки, конец пряток, «одержимые» игроки
function tickAdmin(G, dt, active, api) {
  if (G.hideT > 0) {
    G.hideT -= dt;
    if (G.hideT <= 0) { for (const m of G.mobs) { m.stun = 0; m.mode = 'chase'; } broadcast({ t: 'ev', text: 'Время вышло! Существа идут искать…' }); broadcast({ t: 'sfx', name: 'roar' }); }
  }
  for (const p of active) {
    // пол — это лава: на ровном полу дольше 2 секунд — смерть (лестницы, вода, лазы — безопасны)
    if (WORLD.lava && !p.god) {
      const t = p.node >= 0 ? G.map.t[Math.floor(p.node / BR.NN)][p.node % BR.NN] : -1;
      const onFloor = (t === BR.T.FLOOR || t === BR.T.LOW) && Math.abs(p.y - Math.floor(p.node / BR.NN) * G.map.FH) < 0.15;
      p.lavaT = onFloor ? (p.lavaT || 0) + dt : 0;
      if (p.lavaT > 2) { p.lavaT = 0; api.kill(G, p, 'Пол — это лава!', 'наступил на лаву'); }
    }
    // «одержимый» игрок ловит других, как существо
    if (p.mods && p.mods.possessed) {
      for (const q of active) if (q !== p && q.invuln <= 0 && Math.hypot(q.x - p.x, q.z - p.z) < 1.2 && Math.abs(q.y - p.y) < 1.4) api.catchBy(G, q, p);
    }
  }
  // догонялки: касание передаёт «вода»
  if (WORLD.tag) {
    const it = active.find((p) => p.id === WORLD.tag);
    G.tagCool = Math.max(0, (G.tagCool || 0) - dt);
    if (it && G.tagCool <= 0) {
      const q = active.find((o) => o !== it && Math.hypot(o.x - it.x, o.z - it.z) < 1.3 && Math.abs(o.y - it.y) < 1.4);
      if (q) { WORLD.tag = q.id; G.tagCool = 2; sendWorld(); broadcast({ t: 'ev', text: `${q.name} водит!` }); }
    }
  }
  // ловушки-телепорты
  for (const o of G.objs) {
    if (o.kind !== 'trap') continue;
    for (const p of active) if (near(o, p, 1.2)) api.teleport(G, p, randomFloorFar(G, p), 'trap');
  }
}

// Забанен ли подключающийся
const isBanned = (c) => banned.has(String(c.name).toLowerCase()) || banned.has(c.conn.socket.remoteAddress);

module.exports = { TOKEN, onAdmin, auth, tickAdmin, worldMsg, sendWorld, isBanned, WORLD, defMods };
