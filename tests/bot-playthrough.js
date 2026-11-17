'use strict';
// Бот проходит всю кампанию через WebSocket: решает головоломки каждого уровня и доходит до выхода.
// Бот «телепортируется» к нужным объектам (режим TEST_HOOKS разрешает это серверу). Решатели головоломок
// лежат в tests/lib/solvers.js — по одному на головоломку.
const assert = require('assert');
const { startServer } = require('./lib/server');
const { SOLVERS, makeBotApi } = require('./lib/solvers');
const BR = require('../shared/map.js');

const PORT = 3903;
const LEVEL_TIMEOUT = 60000;

async function main() {
  const FIRST = +(process.env.START_LEVEL || 0);
  const srv = await startServer(PORT, { START_LEVEL: String(FIRST), TEST_HOOKS: '1', FAST_EVENTS: '1' });
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const api = makeBotApi(ws);
  try {
    api.send({ t: 'join', name: 'Бот' });
    let init = await api.waitFor((m) => m.t === 'init');
    api.send({ t: 'dbg', cmd: 'freeze-mobs' });
    for (let level = FIRST; level < BR.LEVELS.length; level++) {
      assert.strictEqual(init.level, level, 'неверный порядок уровней');
      api.setInit(init);
      api.send({ t: 'dbg', cmd: 'freeze-mobs' });
      const t0 = Date.now();
      const cfg = BR.LEVELS[level];
      // головоломки решаются в порядке, заданном уровнем
      for (const name of cfg.puzzles) {
        assert(SOLVERS[name], `нет решателя для головоломки ${name}`);
        await SOLVERS[name](api, cfg);
      }
      // ждём открытия двери и идём к ней
      const door = api.of('door')[0];
      if (!door.open) await api.waitFor((m) => m.t === 'obj' && m.id === door.id && m.p.open, LEVEL_TIMEOUT);
      await api.goTo(door.x, door.y, door.z);
      const done = await api.waitFor((m) => m.t === 'done', LEVEL_TIMEOUT);
      console.log(`  уровень ${level} «${cfg.name}» пройден за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
      if (done.last) {
        assert.strictEqual(level, BR.LEVELS.length - 1, 'кампания закончилась раньше последнего уровня');
        assert.strictEqual(done.ending, 'escape', 'выход через дверь — не та концовка');
        console.log(`  концовка: ${done.ending}, время ${done.stats.time} с`);
        break;
      }
      init = await api.waitFor((m) => m.t === 'init', 15000);
    }
    console.log(`OK bot-playthrough: все ${BR.LEVELS.length - FIRST} уровней пройдены`);
  } finally {
    ws.close(); srv.proc.kill();
  }
}
main().catch((e) => { console.error('FAIL bot-playthrough:', e.message); process.exit(1); });
