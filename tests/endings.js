'use strict';
// Финалы: вторая концовка (сесть в кресло Надсмотрщика) и провал по таймеру реактора в лаборатории.
const assert = require('assert');
const { startServer } = require('./lib/server');
const { SOLVERS, makeBotApi, sleep } = require('./lib/solvers');
const BR = require('../shared/map.js');

async function session(port, level) {
  const srv = await startServer(port, { START_LEVEL: String(level), TEST_HOOKS: '1', FAST_EVENTS: '1' });
  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const api = makeBotApi(ws);
  api.send({ t: 'join', name: 'Финалист' });
  const init = await api.waitFor((m) => m.t === 'init');
  api.setInit(init);
  api.send({ t: 'dbg', cmd: 'freeze-mobs' });
  return { srv, ws, api, init };
}

async function main() {
  // 1) Фабрика: кресло Надсмотрщика — концовка «остаться»
  let s = await session(3911, 10);
  try {
    await SOLVERS.factory(s.api, BR.LEVELS[10], { stay: true });
    const done = await s.api.waitFor((m) => m.t === 'done', 8000);
    assert(done.last, 'фабрика — не последний уровень');
    assert.strictEqual(done.ending, 'stay', 'кресло не дало вторую концовку');
    assert.strictEqual(done.by, 'Финалист', 'не указан тот, кто остался');
    console.log('  фабрика: кресло Надсмотрщика → концовка «остаться»');
    const again = await s.api.waitFor((m) => m.t === 'init', 30000);
    assert.strictEqual(again.level, 0, 'после финала кампания не началась заново');
    console.log('  после финала кампания начинается с первого уровня');
  } finally { s.ws.close(); s.srv.proc.kill(); }
  await sleep(300);

  // 2) Лаборатория: сброс реактора и не успеть к люку — вспышка, поражение, рестарт уровня
  s = await session(3912, 8);
  try {
    await SOLVERS.lab(s.api);
    const df = await s.api.waitFor((m) => m.t === 'defeat', 15000);
    assert(df.stats.deaths >= 1, 'вспышка реактора никого не убила');
    const again = await s.api.waitFor((m) => m.t === 'init', 20000);
    assert.strictEqual(again.level, 8, 'после вспышки уровень не перезапустился');
    console.log('  лаборатория: не успели к люку → вспышка, поражение, рестарт');
  } finally { s.ws.close(); s.srv.proc.kill(); }
  console.log('OK endings: обе концовки финала и провал по таймеру работают');
}
main().catch((e) => { console.error('FAIL endings:', e.message); process.exit(1); });
