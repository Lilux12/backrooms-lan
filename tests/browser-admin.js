'use strict';
// Админ-панель в браузере: вход по ссылке с токеном, F1, вкладки, команды кнопками и из консоли,
// эффекты мира (дискотека, фильтры, облики, фейерверк, взрыв, батут) — без ошибок JS. Гость видит только вход.
const assert = require('assert');
const path = require('path');
const os = require('os');
const { startServer } = require('./lib/server');
const { findChrome, launchChrome, openGame, sleep } = require('./lib/browser');
const { Bot } = require('./lib/bot');

const PORT = 3910;
async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('SKIP browser-admin: Chromium не найден'); return; }
  const srv = await startServer(PORT, { START_LEVEL: '1', TEST_HOOKS: '1' });
  let mt = null;
  for (let k = 0; k < 40 && !mt; k++) { mt = srv.log().match(/#admin=([\w-]+)/); if (!mt) await sleep(50); }
  const br = await launchChrome(chrome);
  const bot = new Bot(PORT, 'Бот');
  try {
    await bot.connect();
    bot.send({ t: 'dbg', cmd: 'freeze-mobs' });
    // гость: панель без прав показывает только вход
    const guest = await openGame(br.port, `http://localhost:${PORT}/`);
    await guest.ev(`window.__br.S.locked = true`);
    await guest.page.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'F1', key: 'F1' });
    await sleep(500);
    assert(await guest.ev(`getComputedStyle(document.getElementById('aLogin')).display === 'flex' && getComputedStyle(document.getElementById('aBody')).display === 'none'`), 'гостю показаны команды');
    await guest.ev(`(() => { const i = document.getElementById('aCmd'); i.value = '/disco on'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); })()`);
    await sleep(600);
    assert(/прав/.test(await guest.ev(`document.getElementById('aResult').textContent`)), 'гость выполнил команду');
    guest.page.close(); await guest.page.closeTab();

    // хост
    const g = await openGame(br.port, `http://localhost:${PORT}/#admin=${mt[1]}`);
    await g.ev(`window.__br.S.locked = true`);
    await sleep(500);
    assert(await g.ev(`window.__br.S.admin === true`), 'хост не получил права по ссылке');
    assert(!(await g.ev(`location.hash`)), 'токен остался в адресной строке');
    await g.page.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'F1', key: 'F1' });
    await sleep(400);
    assert(await g.ev(`document.getElementById('admin').style.display === 'flex'`), 'панель не открылась');
    const run = async (cmd, set = '') => {
      await g.ev(`(() => { const row = document.querySelector('[data-cmd="${cmd}"]'); ${set}; row.querySelector('.ago').click(); })()`);
      for (let k = 0; k < 20; k++) { await sleep(100); const t = await g.ev(`document.getElementById('aResult').textContent`); if (t.includes(cmd)) return t; }
      throw new Error(`нет ответа на ${cmd}: ` + await g.ev(`document.getElementById('aResult').textContent`));
    };
    const tab = async (k) => { await g.ev(`document.querySelector('[data-tab="${k}"]').click()`); await sleep(100); };
    const botId = bot.id;
    await tab('players');
    await run('skin', `row.querySelector('[data-n=id]').value = '${botId}'; row.querySelector('[data-n=v]').value = 'duck'`);
    await run('size', `row.querySelector('[data-n=id]').value = '${botId}'; row.querySelector('[data-n=v]').value = '2'`);
    await run('speed', `row.querySelector('[data-n=v]').value = '2'`);
    await tab('world');
    await run('disco');
    await run('filter', `row.querySelector('[data-n=v]').value = 'night'`);
    await run('fog', `row.querySelector('[data-n=v]').value = '0.5'`);
    await tab('mobs');
    await run('mobskin', `row.querySelector('[data-n=v]').value = 'banana'`);
    await tab('fun');
    await run('fireworks'); await run('confetti'); await run('boom'); await run('trampoline');
    await sleep(800);
    assert(await g.ev(`window.__br.S.adminOpen`), 'панель закрылась сама');
    const st = await g.ev(`({ disco: document.getElementById('game').style.filter.includes('hue-rotate'), duck: [...document.querySelectorAll('#players div')].length })`);
    assert(st.disco, 'фильтр «ночное зрение» не применился');
    // консоль
    await g.ev(`(() => { const i = document.getElementById('aCmd'); i.value = '/filter vhs'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); })()`);
    await sleep(600);
    assert(await g.ev(`document.getElementById('vhsfx').style.display === 'block'`), 'команда из консоли не сработала');
    await g.ev(`document.getElementById('aClose').click()`);
    await g.ev(`window.__br.S.locked = true`);
    await sleep(1500);
    await g.shot(path.join(os.tmpdir(), 'backrooms-shots', 'admin.png'));
    const bad = g.realErrors();
    assert.deepStrictEqual(bad, [], 'ошибки JS:\n' + bad.join('\n'));
    console.log('OK browser-admin: гость без прав, хост по ссылке, вкладки, команды и эффекты без ошибок');
  } finally { bot.close(); await br.close(); srv.proc.kill(); }
}
main().catch((e) => { console.error('FAIL browser-admin:', e.message); process.exit(1); });
