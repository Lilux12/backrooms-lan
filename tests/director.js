'use strict';
// «Режиссёр», сложность и свои механики:
//  - долго спокойно → событие; долго на пике → передышка (преследователи теряют след);
//  - сложность и число игроков меняют скорость существ; на лёгкой поимка не убивает; хардкор — без аптечек и алтаря;
//  - модификаторы раунда, ежедневный сид, рекорды на диске, шкафчики, реплики, роли, цвет, пасхалка «Номер 237».
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BR = require('../shared/map.js');
const { startServer } = require('./lib/server');
const { sleep } = require('./lib/solvers');

class Bot {
  constructor(port, name) { this.port = port; this.name = name; this.inbox = []; }
  async connect(extra = {}) {
    this.ws = new WebSocket(`ws://localhost:${this.port}`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 's') this.snap = m; else this.inbox.push(m); };
    this.send(Object.assign({ t: 'join', name: this.name }, extra));
    for (let i = 0; i < 60 && !this.init; i++) { await sleep(50); this.init = this.inbox.find((m) => m.t === 'init'); }
    this.id = this.init.id;
    return this.init;
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  async wait(pred, ms = 4000) { for (let t = 0; t < ms; t += 50) { const m = this.inbox.find(pred); if (m) return m; await sleep(50); } throw new Error(`${this.name}: не дождались`); }
  close() { this.ws.close(); }
}

async function unit() {
  // «режиссёр» без сети: события и передышка
  const DIR = require('../server/director.js');
  const map = BR.generate(5, 0); BR.ensureNav(map);
  const sent = [];
  const p = { x: map.spawn.x, y: map.spawn.y, z: map.spawn.z, r: 0, send: (m) => sent.push(m), bat: 1 };
  const G = { map, cfg: BR.LEVELS[0], mobs: [], state: 'play', difficulty: 'normal' };
  for (let t = 0; t < 120; t += 0.5) DIR.tickDirector(G, [p], 0.5);
  assert(G.dir.events >= 1, 'долго спокойно, а события нет');
  console.log(`  режиссёр: за 2 минуты затишья — ${G.dir.events} событ., последнее «${G.dir.last}»`);
  const { newMob } = require('../server/mobs.js');
  const m = newMob(map, p.x + 1, p.y, p.z, 0, 'stalker'); m.mode = 'chase'; m.target = p;
  G.mobs = [m];
  for (let t = 0; t < 40; t += 0.5) { m.mode = m.mode === 'chase' ? 'chase' : m.mode; DIR.tickDirector(G, [p], 0.5); if (m.mode !== 'chase') break; }
  assert.strictEqual(m.mode, 'wander', 'на долгом пике нет передышки');
  console.log('  режиссёр: долгий пик напряжения → преследователь теряет след');
  assert(DIR.crowd(4) > DIR.crowd(2) && DIR.crowd(1) === 1, 'число игроков не влияет на скорость');
  assert(DIR.DIFFICULTY.hard.speed > DIR.DIFFICULTY.normal.speed && DIR.DIFFICULTY.easy.speed < 1, 'сложность не влияет на скорость');

  // уровень на хардкоре: без аптечек и алтаря; засуха — без воды; большая команда — лишнее существо
  const { buildLevel } = require('../server/level.js');
  const normal = buildLevel(0, 77, {}, {}), hard = buildLevel(0, 77, {}, { revive: false, dry: true, players: 4 });
  assert(normal.objs.some((o) => o.kind === 'medkit') && normal.objs.some((o) => o.kind === 'altar'), 'на обычной нет аптечек');
  assert(!hard.objs.some((o) => o.kind === 'medkit' || o.kind === 'altar'), 'на хардкоре есть аптечки или алтарь');
  assert(!hard.objs.some((o) => o.kind === 'water') && normal.objs.some((o) => o.kind === 'water'), 'засуха не убрала воду');
  assert(hard.mobs.length === normal.mobs.length + 1, 'вчетвером не добавилось существо');
  assert(normal.objs.filter((o) => o.kind === 'locker').length >= 3, 'нет шкафчиков');
  console.log('  хардкор без воскрешения, засуха без воды, вчетвером +1 существо, шкафчики на месте');
  // пасхалка: «Номер 237» в отеле
  const hotel = buildLevel(6, 123, {}, {});
  assert(hotel.objs.some((o) => o.kind === 'lore' && o.egg === 'shining'), 'нет пасхалки «Номер 237»');
  console.log('  пасхалка «Номер 237» в отеле');
}

async function server() {
  const recFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'br-rec-')), 'records.json');
  let srv = await startServer(3915, { START_LEVEL: '1', TEST_HOOKS: '1', DIFFICULTY: 'easy', DAILY: '1', RECORDS_FILE: recFile, FAST_EVENTS: '1' });
  try {
    const A = new Bot(3915, 'Аня'), B = new Bot(3915, 'Борис');
    const ia = await A.connect({ role: 'medic', color: 0xff0000 });
    const ib = await B.connect({ role: 'scout' });
    assert.strictEqual(ia.difficulty, 'easy', 'сложность не передана клиенту');
    assert(ia.daily, 'ежедневный сид не включён');
    const items = A.inbox.filter((m) => m.t === 'items').pop();
    assert.strictEqual(items.items.medkit, 1, 'медик без аптечки');
    const w = ib.world;
    assert.strictEqual(w.mods[ia.id].color, 0xff0000, 'цвет не применился');
    assert.strictEqual(w.mods[ib.id].speed, 1.08, 'разведчик не быстрее');
    console.log('  роли и цвет: медик с аптечкой, разведчик быстрее, цвет у всех');
    A.send({ t: 'dbg', cmd: 'freeze-mobs' });
    // реплики: все слышат, частота ограничена
    A.send({ t: 'emote', k: 0 }); A.send({ t: 'emote', k: 1 });
    await sleep(300);
    assert.strictEqual(B.inbox.filter((m) => m.t === 'emote').length, 1, 'реплики без ограничения частоты');
    console.log('  реплики: доходят до всех, не чаще раза в 1,5 с');
    // шкафчик: спрятался — позиция в шкафчике, вышел — перед ним
    const lk = ia.objs.find((o) => o.kind === 'locker');
    A.send({ t: 'p', x: lk.x + lk.nx, y: lk.y, z: lk.z + lk.nz, r: 0 }); await sleep(150);
    A.send({ t: 'use', id: lk.id });
    const h = await A.wait((m) => m.t === 'hide');
    assert(Math.hypot(h.x - lk.x, h.z - lk.z) < 0.1 && !h.seen, 'не спрятался');
    assert(await B.wait((m) => m.t === 'obj' && m.id === lk.id && m.p.who === ia.id), 'шкафчик не занят');
    A.send({ t: 'unhide' });
    await A.wait((m) => m.t === 'unhide');
    console.log('  шкафчик: спрятаться и выйти');
    A.close(); B.close();
    // ежедневный сид: другой сервер в тот же день строит ту же карту
    const srv2 = await startServer(3917, { START_LEVEL: '1', TEST_HOOKS: '1', DAILY: '1', RECORDS_FILE: recFile });
    try {
      const C = new Bot(3917, 'Вика');
      const ic = await C.connect();
      assert.strictEqual(ic.seed, ia.seed, 'ежедневный сид разный на двух серверах');
      C.close();
    } finally { srv2.proc.kill(); }
    console.log('  ежедневный сид: у двух серверов одна и та же карта');
  } finally { srv.proc.kill(); }
  // рекорды: модуль пишет файл, сервер отдаёт /records.json
  process.env.RECORDS_FILE = recFile;
  delete require.cache[require.resolve('../server/records.js')];
  const R = require('../server/records.js');
  assert.strictEqual(R.levelDone(2, 95, ['Аня'], 0, ''), 0, 'первый результат — не рекорд');
  assert.strictEqual(R.levelDone(2, 80, ['Борис'], 1, ''), 0, 'лучшее время — не рекорд');
  assert.strictEqual(R.levelDone(2, 120, ['Вика'], 0, ''), 2, 'медленное время — не на своём месте');
  const disk = JSON.parse(fs.readFileSync(recFile, 'utf8'));
  assert.strictEqual(disk.levels['2'][0].names[0], 'Борис', 'рекорды не записаны на диск');
  srv = await startServer(3916, { RECORDS_FILE: recFile });
  try {
    const web = await (await fetch('http://localhost:3916/records.json')).json();
    assert.strictEqual(web.levels['2'][0].time, 80, 'сервер не отдаёт рекорды');
  } finally { srv.proc.kill(); }
  console.log('  рекорды: таблица на диске, сервер отдаёт /records.json');
}

(async () => {
  await unit();
  await server();
  console.log('OK director: режиссёр, сложность, модификаторы, сид дня, рекорды, шкафчики, реплики, роли, пасхалки');
})().catch((e) => { console.error('FAIL director:', e.message); process.exit(1); });
