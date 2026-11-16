'use strict';
// Двойник глазами игрока в браузере: клетка, чат из клетки, освобождение, проверка жестом, разоблачение.
const assert = require('assert');
const BR = require('../shared/map.js');
const { startServer } = require('./lib/server');
const { findChrome, launchChrome, openGame, sleep } = require('./lib/browser');

const PORT = 3906;

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('SKIP browser-stealer: Chromium не найден'); return; }
  const srv = await startServer(PORT, { START_LEVEL: '0', SKIN_FAST: '1', TEST_HOOKS: '1' });
  const br = await launchChrome(chrome);
  let bot;
  try {
    const g = await openGame(br.port, `http://localhost:${PORT}/`);
    await g.ev(`window.__br.S.locked = true`);
    // бот-напарник
    bot = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((r) => { bot.onopen = r; });
    const inbox = [];
    let init = null;
    bot.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'init') init = m; if (m.t !== 's') inbox.push(m); };
    const send = (o) => bot.send(JSON.stringify(o));
    send({ t: 'join', name: 'Бот' });
    while (!init) await sleep(50);
    let pos = Object.assign({}, init.spawn);
    const tick = setInterval(() => send({ t: 'p', x: pos.x, y: pos.y, z: pos.z, r: 0 }), 50);
    const waitBot = async (pred, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { const i = inbox.findIndex(pred); if (i >= 0) return inbox.splice(i, 1)[0]; await sleep(50); } throw new Error('бот не дождался'); };
    send({ t: 'dbg', cmd: 'freeze-mobs' });
    const myId = await g.ev(`window.__br.S.myId`);
    // бот уходит, браузерный игрок один — двойник крадёт его облик
    const map = BR.generate(init.seed, 0);
    const far = BR.nodePos(map, map.spots.reduce((a, n) => (map.dist[n] > map.dist[a] ? n : a), map.spots[0]));
    pos = { x: far.x, y: far.y, z: far.z };
    await sleep(500);
    send({ t: 'dbg', cmd: 'ss-victim', id: myId });
    await sleep(1500);
    assert(await g.ev(`getComputedStyle(document.getElementById('cagedBox')).display === 'flex'`), 'экран клетки не показан');
    send({ t: 'dbg', cmd: 'ss-unmask' });
    // чат из клетки
    await g.page.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter' });
    await g.page.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter' });
    await sleep(300);
    await g.ev(`(() => { const i = document.getElementById('chatInput'); i.value = 'я в клетке!'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); })()`);
    const chat = await waitBot((m) => m.t === 'chat' && m.text === 'я в клетке!');
    assert.strictEqual(chat.id, myId, 'чат не от того игрока');
    // бот находит клетку с пленником и открывает
    let freed = false;
    for (const cg of init.objs.filter((o) => o.kind === 'cage')) {
      pos = { x: cg.x + 1.5, y: cg.y, z: cg.z };
      await sleep(400);
      send({ t: 'use', id: cg.id });
      await sleep(700);
      if (await g.ev(`getComputedStyle(document.getElementById('cagedBox')).display === 'none'`)) { freed = true; break; }
    }
    assert(freed, 'игрока не освободили');
    await waitBot((m) => m.t === 'exposed');
    await sleep(500);
    // проверка жестом: бот рядом, браузер отвечает клавишей G
    const me = await g.ev(`[window.__br.me.x, window.__br.me.y, window.__br.me.z]`);
    const p0 = { x: me[0], y: me[1], z: me[2] };
    for (let k = 0; k < 64; k++) { // свободное место рядом, откуда игрока видно
      const a = (k / 64) * Math.PI * 2, x = p0.x + Math.cos(a) * 2, z = p0.z + Math.sin(a) * 2;
      if (BR.blocked(map, x, p0.y, z, BR.PHYS.R, BR.PHYS.H, BR.PHYS.STEP) || !BR.los3(map, x, p0.y + 1.5, z, p0.x, p0.y + 1.5, p0.z)) continue;
      pos = { x, y: p0.y, z }; break;
    }
    await sleep(500);
    send({ t: 'ping', id: myId });
    let shown = false;
    for (let k = 0; k < 30 && !shown; k++) { await sleep(100); shown = await g.ev(`document.getElementById('pinged').style.display === 'block'`); }
    assert(shown, 'не показан запрос проверки');
    await g.page.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyG', key: 'g' });
    await g.page.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyG', key: 'g' });
    await waitBot((m) => m.t === 'gesture' && m.id === myId, 3000);
    await g.shot(require('path').join(require('os').tmpdir(), 'backrooms-shots', 'stealer.png'));
    clearInterval(tick);
    const bad = g.realErrors();
    assert.deepStrictEqual(bad, [], 'ошибки JS:\n' + bad.join('\n'));
    console.log('OK browser-stealer: клетка, чат, освобождение, разоблачение, жест — без ошибок');
  } finally {
    if (bot) bot.close();
    await br.close(); srv.proc.kill();
  }
}
main().catch((e) => { console.error('FAIL browser-stealer:', e.message); process.exit(1); });
