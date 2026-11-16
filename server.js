'use strict';
// Сервер игры: раздаёт файлы, держит WebSocket (без внешних библиотек),
// управляет уровнями, головоломками, существами и переходами между уровнями.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const BR = require('./map.js');

const PORT = +process.env.PORT || 3000;
const START_LEVEL = Math.max(0, Math.min(BR.LEVELS.length - 1, +process.env.START_LEVEL || 0));
const { TILE, N, LEVELS } = BR;

/* ------------------------------ HTTP ------------------------------ */
const STATIC = {
  '/': 'index.html', '/index.html': 'index.html',
  '/game.js': 'game.js', '/map.js': 'map.js', '/three.module.min.js': 'three.module.min.js',
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const file = STATIC[req.url.split('?')[0]];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, file), (err, data) => {
    if (err) { res.writeHead(500); res.end('Read error'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)], 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

/* ---------------------------- WebSocket ---------------------------- */
function makeFrame(op, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

let nextClientId = 1;
const clients = new Map();

class Client {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.id = nextClientId++;
    this.joined = false;
    this.name = 'Игрок';
    this.x = 0; this.z = 0; this.r = 0;
    this.invuln = 0;
    this.codeTries = 0;
    socket.setNoDelay(true);
    socket.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    socket.on('close', () => this.dispose());
    socket.on('error', () => this.dispose());
  }
  parse() {
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const op = b0 & 15, masked = !!(b1 & 128);
      let len = b1 & 127, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > (1 << 20)) { this.socket.destroy(); return; }
      const total = off + (masked ? 4 : 0) + len;
      if (this.buf.length < total) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), total);
      if (masked) {
        const mask = this.buf.subarray(off, off + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      this.buf = this.buf.subarray(total);
      if (op === 8) { this.socket.end(makeFrame(8, Buffer.alloc(0))); return; }
      if (op === 9) { this.write(makeFrame(10, payload)); continue; }
      if (op === 1) {
        try { onMessage(this, JSON.parse(payload.toString('utf8'))); } catch (e) { console.error('msg error:', e.message); }
      }
    }
  }
  write(buf) { if (!this.socket.destroyed) this.socket.write(buf); }
  send(obj) { this.write(makeFrame(1, Buffer.from(JSON.stringify(obj)))); }
  dispose() {
    if (!clients.has(this.id)) return;
    clients.delete(this.id);
    if (this.joined) { broadcast({ t: 'ev', text: `${this.name} вышел из игры` }); sendPlayers(); }
    log(`отключился: ${this.name} (онлайн: ${joinedCount()})`);
  }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const c = new Client(socket);
  clients.set(c.id, c);
});

const joinedList = () => [...clients.values()].filter((c) => c.joined);
const joinedCount = () => joinedList().length;
const log = (s) => console.log(`[${new Date().toLocaleTimeString()}] ${s}`);
function broadcast(obj) {
  const f = makeFrame(1, Buffer.from(JSON.stringify(obj)));
  for (const c of clients.values()) if (c.joined) c.write(f);
}
function sendPlayers() {
  broadcast({ t: 'players', list: joinedList().map((c) => ({ id: c.id, name: c.name })) });
}

/* ------------------------------ Игра ------------------------------ */
const LATCH = 22; // сколько секунд держится нажатая плита
const LEVER_COLORS = [
  { name: 'КРАСНЫЙ', riddle: 'цвет тревоги и аварийной сирены' },
  { name: 'СИНИЙ', riddle: 'цвет воды, в которой вы тонете' },
  { name: 'ЗЕЛЁНЫЙ', riddle: 'цвет таблички «ВЫХОД»' },
  { name: 'ЖЁЛТЫЙ', riddle: 'цвет стен, с которых всё началось' },
];
let G = null;
const TEAM = { map: false }; // улучшения команды, сохраняются между уровнями

function placeAtSpawn(c) {
  const s = G.map.spawn;
  c.x = s.x + (c.id % 2 ? 0.8 : -0.8);
  c.z = s.z + ((c.id >> 1) % 2 ? 0.8 : -0.8);
  c.invuln = 4;
  const near = process.env.TEST_NEAR && G.objs.find((o) => o.kind === process.env.TEST_NEAR);
  if (near) { // только для отладки: появиться рядом с объектом
    const tries = near.nx !== undefined ? [[near.nx, near.nz]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of tries) {
      if (!BR.isWall(G.map, near.x + dx * 2.2, near.z + dz * 2.2)) { c.x = near.x + dx * 2.2; c.z = near.z + dz * 2.2; break; }
    }
  }
}

function startLevel(idx) {
  const cfg = LEVELS[idx];
  const seed = (Math.random() * 0x7fffffff) >>> 0;
  const map = BR.generate(seed, idx);
  const rnd = BR.mulberry32(seed ^ 0x5bd1e995);
  const maxD = map.maxDist;
  if (idx === 0) TEAM.map = false;
  G = {
    idx, cfg, seed, map, rnd, objs: [], mobs: [], state: 'play', timer: 0, exitArmed: false, exitTimer: 0,
    nextId: 1, doorOpen: false,
    pz: {
      fuses: { need: cfg.fuses || 0, inserted: 0, held: 0, solved: false },
      code: { digits: [], found: [null, null, null, null], solved: false },
      plates: { solved: false },
      levers: { order: [], progress: 0, solved: false, text: '' },
    },
  };
  const add = (kind, props) => { const o = Object.assign({ id: G.nextId++, kind }, props); G.objs.push(o); return o; };

  BR.pickSpots(map, rnd, cfg.water, { minDist: 8, minSep: 5 }).forEach((p) => add('water', { x: p.x, z: p.z }));
  if (!TEAM.map && ((process.env.FORCE_MAP && cfg.mapChance) || rnd() < (cfg.mapChance || 0))) {
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

  if (cfg.puzzles.includes('fuses')) {
    BR.pickSpots(map, rnd, cfg.fuses, { minDist: 0.25 * maxD, minSep: 6 }).forEach((p) => add('fuse', { x: p.x, z: p.z }));
    const b = BR.pickSpots(map, rnd, 1, { minDist: 0.15 * maxD, maxDist: 0.65 * maxD })[0];
    add('box', { x: b.x, z: b.z });
  }
  if (cfg.puzzles.includes('code')) {
    const digits = [];
    for (let i = 0; i < 4; i++) digits.push(1 + Math.floor(rnd() * 9));
    G.pz.code.digits = digits;
    BR.pickWallSpots(map, rnd, 4, { minDist: 0.2 * maxD, minSep: 7 })
      .forEach((p, i) => add('digit', { x: p.x, z: p.z, nx: p.nx, nz: p.nz, idx: i, digit: digits[i] }));
    add('keypad', { x: map.exit.fx, z: map.exit.fz });
  }
  if (cfg.puzzles.includes('plates')) {
    const a = BR.pickSpots(map, rnd, 1, { minDist: 0.3 * maxD })[0];
    const da = BR.bfs(map.g, a.tile % N, (a.tile / N) | 0);
    let cand = map.floors.filter((i) => da[i] >= 9 && da[i] <= 16 && map.dist[i] >= 0.2 * maxD);
    if (!cand.length) cand = map.floors.filter((i) => da[i] >= 6 && da[i] <= 18);
    const bi = cand[Math.floor(rnd() * cand.length)];
    add('plate', { x: a.x, z: a.z, on: false, hold: 0 });
    add('plate', { x: ((bi % N) + 0.5) * TILE, z: (((bi / N) | 0) + 0.5) * TILE, on: false, hold: 0 });
  }
  if (cfg.puzzles.includes('levers')) {
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    G.pz.levers.order = order;
    G.pz.levers.text = 'Порядок смены давления:\n' + order.map((c, i) => `${i + 1}) ${LEVER_COLORS[c].riddle}`).join('\n') +
      '\n\nОшибёшься — включится сирена.';
    BR.pickSpots(map, rnd, 4, { minDist: 0.25 * maxD, minSep: 7 }).forEach((p, i) => add('lever', { x: p.x, z: p.z, col: i, on: false }));
    const n = BR.pickWallSpots(map, rnd, 1, { minDist: 0.1 * maxD, maxDist: 0.5 * maxD })[0];
    add('note', { x: n.x, z: n.z, nx: n.nx, nz: n.nz });
  }
  const e = map.exit;
  G.door = add('door', { x: e.wx, z: e.wz, fx: e.fx, fz: e.fz, dx: e.dx, dz: e.dz, open: false });

  const newMob = (x, z, stun) => ({ x, z, r: 0, mode: 'wander', stun, lost: 0, wp: null, repath: 0, field: null, fieldGoal: -1, alert: null });
  if (cfg.chase) { // стая ждёт у старта и просыпается, когда игроки выйдут из укрытия
    G.chaseState = 'idle';
    for (let i = 0; i < cfg.mobs; i++) G.mobs.push(newMob(map.spawn.x + (i % 2 ? 1 : -1) * 0.5, map.spawn.z + (i > 1 ? 0.8 : -0.4), 9999));
  } else {
    BR.pickSpots(map, rnd, cfg.mobs, { minDist: 0.55 * maxD, minSep: 8 }).forEach((p) => G.mobs.push(newMob(p.x, p.z, 5)));
  }
  if (!cfg.puzzles.length) { G.doorOpen = true; BR.setDoor(map, true); G.door.open = true; } // уровни без головоломки

  for (const c of joinedList()) { placeAtSpawn(c); c.codeTries = 0; c.send(initMsg(c)); }
  log(`УРОВЕНЬ ${idx} «${cfg.name}», seed ${seed}`);
}

function goalLines() {
  const L = [];
  const pz = G.pz;
  for (const p of G.cfg.puzzles) {
    if (p === 'fuses') L.push(`Предохранители: ${pz.fuses.inserted}/${pz.fuses.need}` + (pz.fuses.held ? ` (в руках: ${pz.fuses.held})` : '') + (pz.fuses.solved ? ' ✔' : ''));
    if (p === 'code') L.push('Код: ' + pz.code.found.map((d) => (d == null ? '_' : d)).join(' ') + (pz.code.solved ? ' ✔' : ''));
    if (p === 'plates') {
      const n = G.objs.filter((o) => o.kind === 'plate' && o.on).length;
      L.push(`Плиты нажаты: ${n}/2` + (pz.plates.solved ? ' ✔' : ''));
    }
    if (p === 'levers') L.push(`Рычаги: ${pz.levers.progress}/4` + (pz.levers.solved ? ' ✔' : ''));
  }
  L.push(G.doorOpen ? 'ВЫХОД ОТКРЫТ — бегом к двери!' : 'Выход: заблокирован');
  return L;
}
const sendGoals = () => broadcast({ t: 'goal', lines: goalLines(), held: G.pz.fuses.held });

function initMsg(c) {
  return {
    t: 'init', id: c.id, level: G.idx, levels: LEVELS.length, seed: G.seed,
    objs: G.objs, goals: goalLines(), held: G.pz.fuses.held, upgrades: { map: TEAM.map },
    spawn: { x: c.x, z: c.z },
    players: joinedList().map((p) => ({ id: p.id, name: p.name })),
  };
}

function patch(o, p) { Object.assign(o, p); broadcast({ t: 'obj', id: o.id, p }); }

function checkSolved() {
  if (G.doorOpen) return;
  if (!G.cfg.puzzles.every((p) => G.pz[p].solved)) return;
  G.doorOpen = true;
  BR.setDoor(G.map, true);
  patch(G.door, { open: true });
  broadcast({ t: 'ev', text: 'Дверь выхода открыта!' });
  log('дверь выхода открыта');
}

function alarm(x, z) {
  for (const m of G.mobs) { m.alert = { x, z, t: 15 }; if (m.stun > 1) m.stun = 1; }
  broadcast({ t: 'alarm' });
}

/* ------------------------------ Существа ------------------------------ */
function randomFloorFar(fromX, fromZ, samples = 40) {
  const fl = G.map.floors;
  let best = null, bd = -1;
  for (let i = 0; i < samples; i++) {
    const idx = fl[Math.floor(Math.random() * fl.length)];
    const x = ((idx % N) + 0.5) * TILE, z = (((idx / N) | 0) + 0.5) * TILE;
    const d = Math.hypot(x - fromX, z - fromZ);
    if (d > bd) { bd = d; best = { x, z }; }
  }
  return best;
}

function pickWander(players) {
  const fl = G.map.floors;
  const target = players.length ? players[Math.floor(Math.random() * players.length)] : null;
  let best = null, bd = 1e9;
  for (let i = 0; i < 8; i++) {
    const idx = fl[Math.floor(Math.random() * fl.length)];
    const x = ((idx % N) + 0.5) * TILE, z = (((idx / N) | 0) + 0.5) * TILE;
    const d = target ? Math.hypot(x - target.x, z - target.z) : Math.random();
    if (d < bd) { bd = d; best = { x, z }; }
  }
  return best;
}

function mobMove(m, dt, gx, gz, speed) {
  const gtx = Math.min(N - 1, Math.max(0, Math.floor(gx / TILE)));
  const gty = Math.min(N - 1, Math.max(0, Math.floor(gz / TILE)));
  const gi = gtx + gty * N;
  m.repath -= dt;
  if (!m.field || m.fieldGoal !== gi || m.repath <= 0) {
    m.field = BR.bfs(G.map.g, gtx, gty);
    m.fieldGoal = gi;
    m.repath = 0.3;
  }
  const mtx = Math.floor(m.x / TILE), mty = Math.floor(m.z / TILE);
  let tx, tz;
  if (mtx === gtx && mty === gty) { tx = gx; tz = gz; }
  else {
    let best = m.field[mtx + mty * N], bx = -1, by = -1;
    if (best < 0) return;
    for (const [dx, dy] of BR.D4) {
      const nx = mtx + dx, ny = mty + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const d = m.field[nx + ny * N];
      if (d >= 0 && d < best) { best = d; bx = nx; by = ny; }
    }
    if (bx < 0) return;
    tx = (bx + 0.5) * TILE; tz = (by + 0.5) * TILE;
  }
  const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
  if (d > 0.001) {
    const s = Math.min(d, speed * dt);
    m.x += (dx / d) * s; m.z += (dz / d) * s;
    m.r = Math.atan2(dx, dz);
  }
}

function updateMob(m, dt, players) {
  if (m.stun > 0) { m.stun -= dt; return; }
  const speed = 4.2 * G.cfg.mobSpeed;
  let best = null, bd = 1e9;
  for (const p of players) {
    const d = Math.hypot(p.x - m.x, p.z - m.z);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) {
    const sees = G.cfg.chase || bd < 9 || (bd < (best.fl ? 38 : 28) && BR.los(G.map, m.x, m.z, best.x, best.z));
    if (sees) { m.mode = 'chase'; m.lost = 0; m.alert = null; }
    else if (m.mode === 'chase') {
      m.lost += dt;
      if (bd > 45 || m.lost > 6) { m.mode = 'wander'; m.wp = null; }
    }
  } else m.mode = 'wander';

  if (m.mode === 'chase' && best) { mobMove(m, dt, best.x, best.z, speed); return; }
  if (m.alert) {
    m.alert.t -= dt;
    if (m.alert.t <= 0 || Math.hypot(m.alert.x - m.x, m.alert.z - m.z) < 2) m.alert = null;
    else { mobMove(m, dt, m.alert.x, m.alert.z, speed * 0.95); return; }
  }
  if (!m.wp || Math.hypot(m.wp.x - m.x, m.wp.z - m.z) < 1.5) m.wp = pickWander(players);
  mobMove(m, dt, m.wp.x, m.wp.z, 2.1);
}

/* ------------------------------ Цикл ------------------------------ */
function finishLevel() {
  G.state = 'done';
  const last = G.idx === LEVELS.length - 1;
  G.timer = last ? 14 : 6;
  broadcast({ t: 'done', last, next: last ? '' : LEVELS[G.idx + 1].name });
  log(last ? 'ИГРА ПРОЙДЕНА' : `уровень ${G.idx} пройден`);
}

let lastTick = process.hrtime.bigint();
function tick() {
  const now = process.hrtime.bigint();
  const dt = Math.min(0.2, Number(now - lastTick) / 1e9);
  lastTick = now;
  const players = joinedList();
  if (!players.length) return;

  if (G.state === 'done') {
    G.timer -= dt;
    if (G.timer <= 0) startLevel(G.idx === LEVELS.length - 1 ? 0 : G.idx + 1);
    return;
  }

  for (const m of G.mobs) updateMob(m, dt, players);

  let goalsChanged = false;
  for (const p of players) {
    if (p.invuln > 0) p.invuln -= dt;
    for (let i = G.objs.length - 1; i >= 0; i--) {
      const o = G.objs[i];
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (o.kind === 'fuse' && d < 2.0) {
        G.objs.splice(i, 1); G.pz.fuses.held++; goalsChanged = true;
        broadcast({ t: 'pick', id: o.id, kind: 'fuse', by: p.name });
      } else if (o.kind === 'mapitem' && d < 2.0) {
        G.objs.splice(i, 1); TEAM.map = true;
        broadcast({ t: 'pick', id: o.id, kind: 'mapitem', by: p.name });
        broadcast({ t: 'upgrade', what: 'map', by: p.name });
        log(`${p.name} нашёл улучшенную карту`);
      } else if (o.kind === 'water' && d < 2.0) {
        G.objs.splice(i, 1);
        broadcast({ t: 'pick', id: o.id, kind: 'water', by: p.name });
        p.send({ t: 'stamina' });
      } else if (o.kind === 'digit' && d < 3.6 && G.pz.code.found[o.idx] == null) {
        G.pz.code.found[o.idx] = o.digit; goalsChanged = true;
        broadcast({ t: 'ev', text: `${p.name} нашёл цифру: ${o.digit} (позиция ${o.idx + 1})` });
      }
    }
    const m0 = G.mobs.find((m) => m.stun <= 0 && p.invuln <= 0 && Math.hypot(m.x - p.x, m.z - p.z) < 1.3);
    if (m0) {
      const respawn = G.cfg.chase ? { x: G.map.spawn.x, z: G.map.spawn.z } : randomFloorFar(m0.x, m0.z);
      p.x = respawn.x; p.z = respawn.z; p.invuln = 4;
      p.send({ t: 'caught', x: respawn.x, z: respawn.z });
      broadcast({ t: 'ev', text: `Существо поймало игрока ${p.name}!` });
      if (G.cfg.chase) { // забег начинается заново: стая возвращается к старту
        G.mobs.forEach((m, i) => { m.x = G.map.spawn.x + (i % 2 ? 1 : -1) * 0.5; m.z = G.map.spawn.z + (i > 1 ? 0.8 : -0.4); m.stun = 3.5 + i * 0.6; m.mode = 'chase'; });
      } else {
        const away = randomFloorFar(p.x, p.z);
        m0.x = away.x; m0.z = away.z; m0.stun = 4; m0.mode = 'wander'; m0.wp = null; m0.alert = null;
      }
    }
  }

  // Погоня: стая просыпается, когда кто-то отошёл от укрытия
  if (G.cfg.chase && G.chaseState === 'idle') {
    const sp = G.map.spawn;
    if (players.some((p) => Math.hypot(p.x - sp.x, p.z - sp.z) > 9)) {
      G.chaseState = 'run';
      G.mobs.forEach((m, i) => { m.stun = 2.2 + i * 0.7; m.mode = 'chase'; });
      broadcast({ t: 'ev', text: 'БЕГИТЕ! Они проснулись!' });
      broadcast({ t: 'sfx', name: 'roar' });
    }
  }

  // Плиты
  if (G.cfg.puzzles.includes('plates') && !G.pz.plates.solved) {
    const plates = G.objs.filter((o) => o.kind === 'plate');
    for (const pl of plates) {
      const pressed = players.some((p) => Math.hypot(pl.x - p.x, pl.z - p.z) < 1.5);
      const was = pl.on;
      pl.hold = pressed ? LATCH : Math.max(0, pl.hold - dt);
      const on = pl.hold > 0;
      if (on !== was) { patch(pl, { on }); goalsChanged = true; }
    }
    if (plates.length && plates.every((pl) => pl.on)) {
      G.pz.plates.solved = true; goalsChanged = true;
      broadcast({ t: 'ev', text: 'Обе плиты нажаты — механизм сработал!' });
      checkSolved();
    }
  }

  if (goalsChanged) sendGoals();

  // Выход
  if (G.doorOpen) {
    const inside = players.filter((p) => Math.hypot(p.x - G.door.x, p.z - G.door.z) < 2.6);
    if (inside.length === players.length) finishLevel();
    else if (inside.length) {
      if (!G.exitArmed) { G.exitArmed = true; G.exitTimer = 8; broadcast({ t: 'ev', text: 'Кто-то уже у двери — остальные, скорее! (8 с)' }); }
      G.exitTimer -= dt;
      if (G.exitTimer <= 0) finishLevel();
    } else { G.exitArmed = false; }
  }

  const f = (v) => +v.toFixed(2);
  broadcast({
    t: 's',
    p: players.map((c) => [c.id, f(c.x), f(c.z), f(c.r), c.fl ? 1 : 0]),
    m: G.mobs.map((m) => [f(m.x), f(m.z), f(m.r), m.mode === 'chase' ? 1 : 0, m.stun > 0 ? 1 : 0]),
  });
}

function onMessage(c, msg) {
  if (msg.t === 'join') {
    c.name = String(msg.name || 'Игрок').replace(/[<>&]/g, '').trim().slice(0, 16) || 'Игрок';
    c.joined = true;
    placeAtSpawn(c);
    c.send(initMsg(c));
    broadcast({ t: 'ev', text: `${c.name} зашёл в игру` });
    sendPlayers();
    log(`подключился: ${c.name} (онлайн: ${joinedCount()})`);
    return;
  }
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
    if (!o || Math.hypot(o.x - c.x, o.z - c.z) > 3.6) return;
    if (o.kind === 'box') {
      const f = G.pz.fuses;
      if (f.solved) return;
      if (!f.held) { c.send({ t: 'ev', text: 'Щиток обесточен. Нужны предохранители.' }); return; }
      f.inserted += f.held; f.held = 0;
      broadcast({ t: 'ev', text: `${c.name} вставил предохранители (${f.inserted}/${f.need})` });
      broadcast({ t: 'sfx', name: 'zap' });
      if (f.inserted >= f.need) { f.solved = true; broadcast({ t: 'ev', text: 'Питание восстановлено!' }); }
      sendGoals(); checkSolved();
    } else if (o.kind === 'note') {
      c.send({ t: 'note', text: G.pz.levers.text });
    } else if (o.kind === 'lever') {
      const lv = G.pz.levers;
      if (lv.solved || o.on) return;
      if (G.pz.levers.order[lv.progress] === o.col) {
        lv.progress++;
        patch(o, { on: true });
        broadcast({ t: 'sfx', name: 'click' });
        if (lv.progress >= 4) { lv.solved = true; broadcast({ t: 'ev', text: 'Давление стабилизировано!' }); }
        sendGoals(); checkSolved();
      } else {
        lv.progress = 0;
        for (const l of G.objs.filter((q) => q.kind === 'lever' && q.on)) patch(l, { on: false });
        broadcast({ t: 'ev', text: `${c.name} ошибся с рычагом — СИРЕНА!` });
        alarm(c.x, c.z);
        sendGoals();
      }
    }
  } else if (msg.t === 'code') {
    const kp = G.objs.find((q) => q.kind === 'keypad');
    if (!kp || G.pz.code.solved || Math.hypot(kp.x - c.x, kp.z - c.z) > 4.5) return;
    const v = String(msg.v || '');
    if (v === G.pz.code.digits.join('')) {
      G.pz.code.solved = true;
      c.send({ t: 'codeok' });
      broadcast({ t: 'ev', text: `${c.name} ввёл верный код!` });
      broadcast({ t: 'sfx', name: 'beep' });
      sendGoals(); checkSolved();
    } else {
      c.send({ t: 'codebad' });
      broadcast({ t: 'ev', text: `Неверный код! Сработала сигнализация (${c.name})` });
      alarm(c.x, c.z);
    }
  }
}

startLevel(START_LEVEL);
setInterval(tick, 50);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n=== BACKROOMS: побег из Закулисья ===\n');
  console.log('Сервер запущен. Играйте по адресам:');
  console.log(`  Вы (на этом компьютере):  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  Друг (по локальной сети): http://${i.address}:${PORT}`);
    }
  }
  console.log('\nЧтобы остановить сервер — закройте окно или нажмите Ctrl+C.\n');
});
