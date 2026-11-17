'use strict';
// Сеть: античит (телепорт и сверхскорость не принимаются, нормальный ход — да, после серверного телепорта — пауза),
// переподключение по нику с сохранением места и состояния, лимит игроков.
const assert = require('assert');
const { startServer } = require('./lib/server');
const { sleep } = require('./lib/solvers');

class Bot {
  constructor(port, name) { this.port = port; this.name = name; this.inbox = []; }
  async connect() {
    this.ws = new WebSocket(`ws://localhost:${this.port}`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 's') this.snap = m; else this.inbox.push(m); };
    this.send({ t: 'join', name: this.name });
    for (let i = 0; i < 50 && !this.init; i++) { await sleep(60); this.init = this.inbox.find((m) => m.t === 'init' || m.t === 'kicked'); }
    return this.init;
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  has(pred) { return this.inbox.find(pred); }
  close() { this.ws.close(); }
}
const posOf = (bot, id) => { const e = bot.snap && bot.snap.p.find((q) => q[0] === id); return e && { x: e[1], y: e[2], z: e[3] }; };

async function main() {
  // --- античит и лимит игроков (античит включён: TEST_HOOKS нет) ---
  let srv = await startServer(3913, { START_LEVEL: '1', MAX_PLAYERS: '2' });
  try {
    const A = new Bot(3913, 'Аня'), B = new Bot(3913, 'Борис');
    const ia = await A.connect(); await B.connect();
    const s = ia.spawn;
    await sleep(3200); // пауза после появления прошла
    // нормальный шаг принимается
    for (let k = 1; k <= 6; k++) { A.send({ t: 'p', x: s.x + k * 0.15, y: s.y, z: s.z, r: 0 }); await sleep(60); }
    await sleep(200);
    let p = posOf(B, ia.id);
    assert(p && Math.abs(p.x - (s.x + 0.9)) < 0.05, `нормальный ход не принят: ${JSON.stringify(p)}`);
    // телепорт через полкарты — нет: сервер возвращает и шлёт поправку
    A.send({ t: 'p', x: s.x + 60, y: s.y, z: s.z + 60, r: 0 });
    await sleep(300);
    assert(A.has((m) => m.t === 'correct'), 'нет поправки после телепорта');
    p = posOf(B, ia.id);
    assert(p && Math.hypot(p.x - s.x, p.z - s.z) < 2, 'телепорт принят сервером');
    console.log('  античит: обычный ход принят, телепорт отклонён с поправкой');
    // после серверного телепорта («Я застрял») — короткая пауза, новое место принимается
    A.send({ t: 'stuck' });
    await sleep(150);
    assert(A.has((m) => m.t === 'caught' && m.reason === 'stuck'), 'нет серверного телепорта');
    // лимит игроков
    const C = new Bot(3913, 'Вика');
    const ic = await C.connect();
    assert(ic && ic.t === 'kicked' && /заполнен/.test(ic.text), 'третьего игрока пустили при лимите 2');
    console.log('  лимит игроков: третьему — «Сервер заполнен»');
    A.close(); B.close(); C.close();
  } finally { srv.proc.kill(); }
  await sleep(300);

  // --- переподключение: место, предметы и состояние сохраняются ---
  srv = await startServer(3914, { START_LEVEL: '1', TEST_HOOKS: '1' });
  try {
    const A = new Bot(3914, 'Аня'), B = new Bot(3914, 'Борис');
    const ia = await A.connect(); await B.connect();
    A.send({ t: 'dbg', cmd: 'freeze-mobs' });
    const spot = { x: ia.spawn.x + 4, y: ia.spawn.y, z: ia.spawn.z };
    for (let k = 0; k < 6; k++) { A.send({ t: 'p', x: spot.x, y: spot.y, z: spot.z, r: 0 }); await sleep(60); }
    A.send({ t: 'dbg', cmd: 'give', item: 'detector' });
    await sleep(200);
    A.close();
    await sleep(500);
    const A2 = new Bot(3914, 'Аня');
    const back = await A2.connect();
    assert(back.t === 'init', 'переподключение не удалось');
    assert(Math.hypot(back.spawn.x - spot.x, back.spawn.z - spot.z) < 0.5, `не вернули на прежнее место: ${JSON.stringify(back.spawn)}`);
    await sleep(200);
    const items = A2.inbox.filter((m) => m.t === 'items').pop();
    assert(items && items.items.detector === 1, 'предметы не сохранились');
    assert(B.has((m) => m.t === 'ev' && /Аня вернулась|Аня вернулся/.test(m.text)), 'нет сообщения о возвращении');
    console.log('  переподключение: то же место и предметы');
    A2.close(); B.close();
  } finally { srv.proc.kill(); }
  console.log('OK network: античит, лимит игроков, переподключение');
}
main().catch((e) => { console.error('FAIL network:', e.message); process.exit(1); });
