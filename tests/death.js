'use strict';
// Смерть, зрители и воскрешение (сервер): мёртвый исчезает из снапшотов и получает статистику живых,
// аптечка и алтарь воскрешают, призрак ставит метки и не трогает предметы, все погибли — поражение и рестарт.
const assert = require('assert');
const { startServer } = require('./lib/server');
const { Bot, sleep } = require('./lib/bot');

const PORT = 3907;
async function main() {
  const srv = await startServer(PORT, { START_LEVEL: '1', TEST_HOOKS: '1' });
  const A = new Bot(PORT, 'Аня'), B = new Bot(PORT, 'Борис');
  try {
    await A.connect(); await B.connect();
    A.send({ t: 'dbg', cmd: 'freeze-mobs' });
    await sleep(300);
    // смерть
    A.send({ t: 'dbg', cmd: 'kill', id: B.id });
    await B.wait((m) => m.t === 'dead');
    await A.wait((m) => m.t === 'deadlist' && m.ids.includes(B.id));
    await sleep(300);
    assert(!A.snap.p.some((e) => e[0] === B.id), 'мёртвый виден в снапшоте');
    const ps = await B.wait((m) => m.t === 'pstats', 3000);
    const st = ps.list.find((e) => e[0] === A.id);
    assert(st && st[1] === 0.8 && st[2] === 0.6 && st[3] >= 0, 'зритель не получил выносливость/батарею/пинг живого');
    // призрак не может пользоваться объектами, но ставит метки
    const box = A.init.objs.find((o) => o.kind === 'keypad');
    B.send({ t: 'use', id: box.id });
    B.send({ t: 'mark', x: 10, y: 0, z: 10 });
    const mk = await A.wait((m) => m.t === 'mark');
    assert(mk.ghost && mk.by === 'Борис', 'метка призрака не дошла');
    // аптечка
    const med = A.init.objs.find((o) => o.kind === 'medkit');
    Object.assign(A.pos, { x: med.x, y: med.y, z: med.z });
    await A.wait((m) => m.t === 'items' && m.items.medkit === 1);
    A.send({ t: 'revive' });
    const rv = await B.wait((m) => m.t === 'revived');
    assert(Math.hypot(rv.x - med.x, rv.z - med.z) < 2, 'воскрешён не рядом с напарником');
    console.log('  аптечка: воскрешение у напарника');
    // алтарь
    A.send({ t: 'dbg', cmd: 'kill', id: B.id });
    await B.wait((m) => m.t === 'dead');
    const altar = A.init.objs.find((o) => o.kind === 'altar');
    Object.assign(A.pos, { x: altar.x + 1, y: altar.y, z: altar.z });
    await sleep(300);
    A.send({ t: 'use', id: altar.id });
    await B.wait((m) => m.t === 'revived');
    console.log('  алтарь: воскрешение');
    // все погибли — поражение и тот же уровень заново
    A.send({ t: 'dbg', cmd: 'kill', id: B.id });
    await B.wait((m) => m.t === 'dead');
    A.send({ t: 'dbg', cmd: 'kill', id: A.id });
    const df = await A.wait((m) => m.t === 'defeat');
    assert(df.stats.deaths >= 4 && df.stats.players.length === 2, 'неполная статистика поражения');
    const again = await A.wait((m) => m.t === 'init', 15000);
    assert.strictEqual(again.level, 1, 'после поражения запущен не тот уровень');
    assert(!again.dead.length, 'после рестарта кто-то остался мёртвым');
    console.log('OK death: смерть, статистика для зрителей, метки призраков, аптечка, алтарь, поражение и рестарт');
  } finally { A.close(); B.close(); srv.proc.kill(); }
}
main().catch((e) => { console.error('FAIL death:', e.message); process.exit(1); });
