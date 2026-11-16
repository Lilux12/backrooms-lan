'use strict';
// Skin Stealer с тремя ботами: подмена правдоподобна, пакеты не выдают двойника,
// каждый способ разоблачения работает (пинг, кодовое слово, луч фонаря, детектор, спасение из клетки).
const assert = require('assert');
const BR = require('../shared/map.js');
const { startServer } = require('./lib/server');

const PORT = 3905;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Bot {
  constructor(name) { this.name = name; this.inbox = []; this.waiters = []; this.all = []; }
  async connect() {
    this.ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      this.all.push(m);
      if (m.t === 's') { this.snap = m; return; }
      if (m.t === 'init') this.init = m;
      if (m.t === 'secret') this.word = m.word;
      if (m.t === 'players') this.players = m.list;
      this.inbox.push(m);
      this.waiters = this.waiters.filter((w) => !(w.pred(m) && (w.res(m), true)));
    };
    this.send({ t: 'join', name: this.name });
    await this.wait((m) => m.t === 'init');
    this.id = this.init.id;
    this.pos = Object.assign({}, this.init.spawn);
    this.r = 0; this.fl = 0;
    this.timer = setInterval(() => this.send({ t: 'p', x: this.pos.x, y: this.pos.y, z: this.pos.z, r: this.r, f: this.fl }), 50);
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  wait(pred, ms = 8000) {
    return new Promise((res, rej) => {
      const hit = this.inbox.find(pred);
      if (hit) { this.inbox.splice(this.inbox.indexOf(hit), 1); return res(hit); }
      const w = { pred, res: (m) => { clearTimeout(w.t); this.inbox.splice(this.inbox.indexOf(m), 1); res(m); } };
      w.t = setTimeout(() => rej(new Error(`${this.name}: не дождались сообщения`)), ms);
      this.waiters.push(w);
    });
  }
  close() { clearInterval(this.timer); this.ws.close(); }
}

// Свободная точка рядом с p, откуда p видно (по общей карте)
function spotNear(map, p, d0) {
  for (const d of [d0, d0 - 1, d0 + 1, 2, d0 + 2, 1.5]) for (let k = 0; k < 64; k++) { // в узком коридоре — ближе или дальше
    const a = (k / 64) * Math.PI * 2, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (BR.blocked(map, x, p.y, z, BR.PHYS.R, BR.PHYS.H, BR.PHYS.STEP)) continue;
    if (Math.abs(BR.groundAt(map, x, p.y + 0.3, z, BR.PHYS.R, BR.PHYS.STEP) - p.y) > 0.3) continue;
    if (!BR.los3(map, x, p.y + 1.5, z, p.x, p.y + 1.5, p.z)) continue;
    return { x, y: p.y, z };
  }
  throw new Error('нет места рядом');
}
const posOf = (bot, id) => { const e = bot.snap.p.find((q) => q[0] === id); return e && { x: e[1], y: e[2], z: e[3] }; };
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

async function main() {
  const srv = await startServer(PORT, { START_LEVEL: '0', SKIN_FAST: '1', TEST_HOOKS: '1' });
  const A = new Bot('Аня'), B = new Bot('Борис'), C = new Bot('Вика');
  try {
    for (const b of [A, B, C]) await b.connect();
    await sleep(500);
    A.send({ t: 'dbg', cmd: 'freeze-mobs' });
    const map = BR.generate(A.init.seed, 0);
    const cages = A.init.objs.filter((o) => o.kind === 'cage');
    assert.strictEqual(cages.length, 3, 'нет клеток');
    assert(A.word && B.word && C.word && new Set([A.word, B.word, C.word]).size === 3, 'кодовые слова не выданы или совпадают');
    // C уходит далеко от A и B
    const far = BR.nodePos(map, map.spots.reduce((a, n) => (map.dist[n] > map.dist[a] ? n : a), map.spots[0]));
    Object.assign(C.pos, { x: far.x, y: far.y, z: far.z });
    await sleep(400);

    async function steal(tag) {
      // жертва должна быть одна: остальные — у старта
      Object.assign(A.pos, A.init.spawn); Object.assign(B.pos, B.init.spawn);
      await sleep(400);
      const before = JSON.stringify(A.players);
      const mark = A.all.length;
      A.send({ t: 'dbg', cmd: 'ss-victim', id: C.id });
      await C.wait((m) => m.t === 'caged', 6000);
      A.send({ t: 'dbg', cmd: 'ss-unmask' }); // не давать двойнику начать охоту во время теста
      await sleep(1500);
      // пакеты, полученные A после кражи: та же форма, жертва «на месте», никаких следов двойника
      const after = A.all.slice(mark);
      assert(!after.some((m) => ['caged', 'exposed'].includes(m.t)), `${tag}: A получил служебное сообщение о краже`);
      assert(!after.some((m) => m.t === 'ev' && /украл|двойник|клетк/i.test(m.text)), `${tag}: событие выдаёт кражу`);
      assert.strictEqual(JSON.stringify(A.players), before, `${tag}: список игроков изменился`);
      for (const m of after.filter((q) => q.t === 's')) {
        assert(m.p.some((e) => e[0] === C.id), `${tag}: жертва пропала из снапшота`);
        assert(m.p.every((e) => e.length === m.p[0].length && e.length === 8), `${tag}: формат записи игрока отличается`);
        assert(m.m.every((e) => e[6] !== 3), `${tag}: двойник виден в списке существ`);
      }
      return posOf(A, C.id);
    }
    async function rescue() {
      for (const cg of cages) {
        Object.assign(B.pos, { x: cg.x + 1.5, y: cg.y, z: cg.z });
        await sleep(300);
        B.send({ t: 'use', id: cg.id });
        try { await C.wait((m) => m.t === 'freed', 1200); return; } catch (e) { /* не та клетка */ }
      }
      throw new Error('жертву не удалось освободить');
    }
    const exposedSoon = () => A.wait((m) => m.t === 'exposed', 6000);

    // 1) пинг: настоящий отвечает сразу, двойник — поздно или «не так»
    let p = await steal('пинг');
    Object.assign(A.pos, spotNear(map, p, 3)); A.r = yawTo(A.pos, p);
    Object.assign(B.pos, spotNear(map, A.pos, 2));
    await sleep(400);
    A.send({ t: 'ping', id: B.id });
    await B.wait((m) => m.t === 'pinged');
    let t0 = Date.now(); B.send({ t: 'pong' });
    await A.wait((m) => m.t === 'gesture' && m.id === B.id);
    assert(Date.now() - t0 < 1000, 'жест настоящего игрока опоздал');
    p = posOf(A, C.id); Object.assign(A.pos, spotNear(map, p, 3)); A.r = yawTo(A.pos, p); await sleep(300);
    t0 = Date.now(); A.send({ t: 'ping', id: C.id });
    const reply = await A.wait((m) => (m.t === 'gesture' && m.id === C.id) || (m.t === 'ev' && m.text.includes('не ответил')), 9000);
    assert(Date.now() - t0 > 2000, 'двойник ответил на пинг слишком быстро');
    console.log(`  пинг: двойник ответил через ${((Date.now() - t0) / 1000).toFixed(1)} с (${reply.t === 'gesture' ? reply.kind : 'молчание'})`);

    // 2) кодовое слово (Борис подходит к Ане: спрашивать можно только того, кто рядом и на виду)
    Object.assign(B.pos, spotNear(map, A.pos, 2));
    await sleep(300);
    A.send({ t: 'ask', id: B.id });
    await B.wait((m) => m.t === 'ask');
    B.send({ t: 'answer', word: B.word });
    await A.wait((m) => m.t === 'ev' && m.text.startsWith('Борис назвал') && m.text.includes('верно'));
    p = posOf(A, C.id); Object.assign(A.pos, spotNear(map, p, 3)); await sleep(300);
    A.send({ t: 'ask', id: C.id });
    await A.wait((m) => m.t === 'ev' && m.text.startsWith('Вика назвал') && m.text.includes('НЕВЕРНО'), 9000);
    console.log('  кодовое слово: настоящий — верно, двойник — неверно');

    // 3) спасение из клетки разоблачает двойника
    await rescue();
    await exposedSoon();
    console.log('  спасение из клетки: двойник разоблачён');
    await sleep(1500);

    // 4) луч фонарика 2 секунды
    p = await steal('свет');
    Object.assign(A.pos, spotNear(map, p, 4)); A.r = yawTo(A.pos, p); A.fl = 1;
    const ev = await exposedSoon();
    A.fl = 0;
    assert(ev, 'свет не разоблачил');
    console.log('  луч фонаря: двойник разоблачён');
    await rescue(); await sleep(1500);

    // 5) детектор
    p = await steal('детектор');
    A.send({ t: 'dbg', cmd: 'give', item: 'detector' });
    Object.assign(A.pos, spotNear(map, p, 3)); A.r = yawTo(A.pos, p) + Math.PI / 2; // смотрит в сторону — свет не при чём
    await sleep(400);
    A.send({ t: 'scan', id: C.id });
    await exposedSoon();
    console.log('  детектор: двойник разоблачён');
    await rescue();

    // 6) обычный клиент не может «проверить» того, кто далеко или за стеной
    Object.assign(A.pos, far);
    await sleep(300);
    B.inbox.length = 0;
    A.send({ t: 'ping', id: B.id });
    await sleep(700);
    assert(!B.inbox.some((m) => m.t === 'pinged'), 'проверка сработала на большом расстоянии');
  } finally {
    for (const b of [A, B, C]) try { b.close(); } catch (e) { /* уже закрыт */ }
    srv.proc.kill();
  }
  // Соло: двойник «заходит в игру» как ещё один игрок
  await sleep(300);
  const srv2 = await startServer(PORT, { START_LEVEL: '0', SKIN_FAST: '1', TEST_HOOKS: '1' });
  const S = new Bot('Соло');
  try {
    await S.connect();
    S.send({ t: 'dbg', cmd: 'freeze-mobs' });
    const join = await S.wait((m) => m.t === 'ev' && m.text.endsWith('зашёл в игру') && !m.text.startsWith('Соло'), 8000);
    await S.wait((m) => m.t === 'players' && m.list.length === 2);
    await sleep(300);
    const fake = S.players.find((p) => p.id !== S.id);
    assert(join.text.startsWith(fake.name), 'имя «нового игрока» не совпадает');
    assert(S.snap.p.some((e) => e[0] === fake.id && e.length === 8), 'фальшивый игрок не в снапшоте');
    assert(S.snap.m.every((e) => e[6] !== 3), 'двойник виден как существо');
    console.log(`  соло: «${fake.name}» зашёл в игру — неотличим от игрока`);
  } finally { S.close(); srv2.proc.kill(); }
  console.log('OK skinstealer: подмена незаметна в пакетах, все способы разоблачения работают');
}
main().catch((e) => { console.error('FAIL skinstealer:', e.message); process.exit(1); });
