'use strict';
// Режим зрителя в браузере: после смерти камера у глаз живого игрока, переключение между тремя живыми
// и обратно без разрывов, уход наблюдаемого не ломает камеру, воскрешение возвращает управление.
const assert = require('assert');
const path = require('path');
const os = require('os');
const BR = require('../shared/map.js');
const { startServer } = require('./lib/server');
const { findChrome, launchChrome, openGame, sleep } = require('./lib/browser');
const { Bot, spotNear } = require('./lib/bot');

const PORT = 3908;
async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('SKIP browser-spectator: Chromium не найден'); return; }
  const srv = await startServer(PORT, { START_LEVEL: '1', TEST_HOOKS: '1' });
  const br = await launchChrome(chrome);
  const bots = [];
  try {
    const g = await openGame(br.port, `http://localhost:${PORT}/`);
    await g.ev(`window.__br.S.locked = true`);
    for (const n of ['Аня', 'Борис', 'Вика']) { const b = new Bot(PORT, n); await b.connect(); bots.push(b); }
    bots[0].send({ t: 'dbg', cmd: 'freeze-mobs' });
    const map = BR.generate(bots[0].init.seed, 1);
    // боты стоят в разных местах и медленно поворачиваются
    const spots = BR.pickSpots(map, BR.mulberry32(7), 3, { minSep: 6 });
    bots.forEach((b, i) => { Object.assign(b.pos, { x: spots[i].x, y: spots[i].y, z: spots[i].z }); });
    const spin = setInterval(() => bots.forEach((b, i) => { b.r += 0.05 * (i + 1); }), 50);
    await sleep(800);
    const myId = await g.ev(`window.__br.S.myId`);
    bots[0].send({ t: 'dbg', cmd: 'kill', id: myId });
    await sleep(1500);
    assert(await g.ev(`document.getElementById('specBox').style.display === 'block'`), 'нет HUD зрителя');
    const watchInfo = async () => g.ev(`(() => { const t = document.querySelector('#specBox b'); const c = window.__br.cam(); return { name: t && t.textContent, x: c.x, y: c.y, z: c.z }; })()`);
    const seen = [];
    // ждём, пока камера плавно «доедет» до глаз наблюдаемого (в headless кадров мало)
    const settle = async () => {
      let w, b;
      for (let k = 0; k < 60; k++) {
        w = await watchInfo();
        b = bots.find((q) => q.name === w.name);
        if (b && Math.hypot(w.x - b.pos.x, w.z - b.pos.z) < 0.6 && Math.abs(w.y - (b.pos.y + 1.6)) < 0.5) return w;
        await sleep(200);
      }
      throw new Error(`камера не у глаз игрока ${w && w.name}: ${JSON.stringify(w)} vs ${JSON.stringify(b && b.pos)}`);
    };
    for (let k = 0; k < 4; k++) { // три живых и обратно к первому
      const w = await settle();
      seen.push(w.name);
      await g.page.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ArrowRight', key: 'ArrowRight' });
      await g.page.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowRight', key: 'ArrowRight' });
      await sleep(300);
    }
    assert.strictEqual(new Set(seen.slice(0, 3)).size, 3, 'не удалось переключиться между тремя живыми');
    assert.strictEqual(seen[3], seen[0], 'после трёх переключений не вернулись к первому');
    await g.shot(path.join(os.tmpdir(), 'backrooms-shots', 'spectator.png'));
    // наблюдаемый выходит из игры
    const w = await settle();
    const leaving = bots.find((q) => q.name === w.name);
    leaving.close(); bots.splice(bots.indexOf(leaving), 1);
    await sleep(1500);
    const w2 = await settle();
    assert(w2.name && w2.name !== w.name && bots.some((q) => q.name === w2.name), 'после ухода наблюдаемого камера не переключилась');
    // воскрешение аптечкой
    const med = bots[0].init.objs.find((o) => o.kind === 'medkit');
    Object.assign(bots[0].pos, { x: med.x, y: med.y, z: med.z });
    await bots[0].wait((m) => m.t === 'items' && m.items.medkit === 1);
    bots[0].send({ t: 'revive' });
    let back = false;
    for (let k = 0; k < 40 && !back; k++) { await sleep(200); back = await g.ev(`document.getElementById('specBox').style.display === 'none' && !!window.__br.me.body`); }
    assert(back, 'после воскрешения остался HUD зрителя');
    clearInterval(spin);
    const bad = g.realErrors();
    assert.deepStrictEqual(bad, [], 'ошибки JS:\n' + bad.join('\n'));
    console.log(`OK browser-spectator: ${seen.join(' → ')}; уход наблюдаемого → ${w2.name}; воскрешение`);
  } finally {
    bots.forEach((b) => b.close());
    await br.close(); srv.proc.kill();
  }
}
main().catch((e) => { console.error('FAIL browser-spectator:', e.message); process.exit(1); });
