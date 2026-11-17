'use strict';
// Админ-панель: без токена ни одна команда не выполняется (даже поддельная), неверные аргументы не роняют
// сервер, есть лимит частоты и блокировка перебора токена; с токеном все команды работают.
const assert = require('assert');
const BR = require('../shared/map.js');
require('../shared/admin.js');
const { startServer } = require('./lib/server');
const { Bot, sleep } = require('./lib/bot');

const PORT = 3909;
const { COMMANDS } = BR.ADMIN;

// Правдоподобные аргументы для команды
function goodArgs(spec, ids) {
  const a = {};
  for (const x of spec.args) {
    if (x.t === 'player') a[x.n] = ids[1];
    else if (x.t === 'num') a[x.n] = x.def != null ? x.def : (x.min + x.max) / 2;
    else if (x.t === 'int') a[x.n] = 12345;
    else if (x.t === 'bool') a[x.n] = 'on';
    else if (x.t === 'select') a[x.n] = x.options[0][0];
    else if (x.t === 'text') a[x.n] = 'проверка';
    else if (x.t === 'color') a[x.n] = '#ff8800';
    else if (x.t === 'level') a[x.n] = 1;
  }
  return a;
}
const GARBAGE = [null, undefined, NaN, -1e308, 1e308, 'all', 'me', '', '<script>', [], {}, { a: 1 }, true, '9'.repeat(400), -5, 3.7, '#zzzzzz'];

async function main() {
  const srv = await startServer(PORT, { START_LEVEL: '1', TEST_HOOKS: '1' });
  let mt = null;
  for (let k = 0; k < 40 && !mt; k++) { mt = srv.log().match(/#admin=([\w-]+)/); if (!mt) await sleep(50); }
  const token = mt[1];
  const H = new Bot(PORT, 'Хост'), U = new Bot(PORT, 'Гость');
  try {
    await H.connect(); await U.connect();
    H.send({ t: 'dbg', cmd: 'freeze-mobs' });
    const ids = [H.id, U.id];
    const denied = () => U.wait((m) => m.t === 'adm' && !m.ok && /прав/.test(m.error), 2000);

    // 1) без прав: каждая команда отклоняется, ничего не меняется
    for (const spec of COMMANDS) {
      U.send({ t: 'adm', cmd: spec.cmd, args: goodArgs(spec, [U.id, H.id]), admin: true, token: 'x', ok: true });
      await denied();
    }
    U.send({ t: 'chat', text: '/kill Хост' });
    await denied();
    await sleep(300);
    assert(!H.inbox.some((m) => m.t === 'dead' || (m.t === 'chat' && m.text.startsWith('/'))), 'команда без прав подействовала или ушла в чат');
    assert(!U.inbox.some((m) => m.t === 'init' && m !== U.init), 'уровень сменился по команде гостя');
    console.log(`  без прав: отклонены все ${COMMANDS.length} команд и чат-команда`);

    // 2) перебор токена блокируется
    for (let k = 0; k < 6; k++) U.send({ t: 'auth', token: 'неверно' + k });
    U.send({ t: 'auth', token });
    const fails = [];
    for (let k = 0; k < 7; k++) fails.push(await U.wait((m) => m.t === 'auth', 2000));
    assert(fails.every((m) => !m.ok) && fails[6].error.includes('попыток'), 'после перебора верный токен принят');
    console.log('  перебор токена: заблокирован');

    // 3) хост входит
    H.send({ t: 'auth', token });
    assert((await H.wait((m) => m.t === 'auth')).ok, 'верный токен не принят');

    // 4) мусорные аргументы для каждой команды — сервер жив
    let answered = 0;
    for (const spec of COMMANDS) {
      if (['kick', 'ban', 'level', 'seed', 'restart', 'skip'].includes(spec.cmd)) continue;
      for (const g of GARBAGE) {
        const args = {};
        for (const x of spec.args) args[x.n] = g;
        H.send({ t: 'adm', cmd: spec.cmd, args });
        await sleep(60); // не упираться в лимит частоты
      }
      H.send({ t: 'adm', cmd: spec.cmd, args: 'строка вместо объекта' });
      await sleep(60);
    }
    H.send({ t: 'adm', cmd: '__proto__', args: {} }); H.send({ t: 'adm', cmd: 'constructor' }); H.send({ t: 'adm' });
    await sleep(500);
    answered = H.inbox.filter((m) => m.t === 'adm').length;
    assert(srv.proc.exitCode === null, 'сервер упал от мусорных аргументов');
    assert(answered > COMMANDS.length * 5, 'сервер перестал отвечать на команды');
    console.log(`  мусорные аргументы: ${answered} ответов, сервер жив`);
    H.inbox.length = 0;

    // 5) лимит частоты
    for (let k = 0; k < 30; k++) H.send({ t: 'adm', cmd: 'light', args: { v: 1 } });
    await sleep(500);
    assert(H.inbox.some((m) => m.t === 'adm' && m.error === 'Слишком часто'), 'нет лимита частоты\n' + srv.log().split('\n').slice(-15).join('\n'));
    console.log('  лимит частоты: работает');
    await sleep(1200); H.inbox.length = 0;

    // 6) с правами каждая команда выполняется
    const okList = [], errList = [];
    for (const spec of COMMANDS) {
      if (['kick', 'ban', 'level', 'seed', 'restart', 'skip', 'kill'].includes(spec.cmd)) continue; // проверяем отдельно ниже
      H.send({ t: 'adm', cmd: spec.cmd, args: goodArgs(spec, ids) });
      const r = await H.wait((m) => m.t === 'adm', 2000);
      (r.ok ? okList : errList).push(spec.cmd + (r.ok ? '' : `(${r.error})`));
      await sleep(120);
    }
    assert(errList.every((e) => /^(spawn|flood|boss)\(/.test(e)), 'команды завершились ошибкой: ' + errList.join(', '));
    console.log(`  с правами выполнено ${okList.length} команд` + (errList.length ? `; ожидаемые отказы: ${errList.join(', ')}` : ''));
    // чат-команды
    await sleep(500); // ответы на прошлые команды могут ещё идти
    H.send({ t: 'chat', text: '/help' });
    assert((await H.wait((m) => m.t === 'adm' && m.info)).info.includes('/tp'), 'нет /help');
    H.send({ t: 'chat', text: '/god Гость on' });
    await H.wait((m) => m.t === 'adm' && m.ok && m.cmd === 'god');
    H.send({ t: 'chat', text: '/kill Гость' });
    await H.wait((m) => m.t === 'adm' && m.ok);
    await U.wait((m) => m.t === 'dead');
    H.send({ t: 'adm', cmd: 'revive', args: { id: U.id } });
    await U.wait((m) => m.t === 'revived');
    // смена уровня и кик
    H.send({ t: 'adm', cmd: 'level', args: { v: 2 } });
    assert.strictEqual((await U.wait((m) => m.t === 'init' && m.level === 2, 6000)).level, 2, 'уровень не сменился');
    H.send({ t: 'adm', cmd: 'kick', args: { id: U.id } });
    await U.wait((m) => m.t === 'kicked');
    // уведомления игрокам
    assert(U.all.some((m) => m.t === 'ev' && m.admin), 'игроки не видят уведомлений о действиях хоста');
    console.log('OK admin: права только у хоста, сервер устойчив к мусору, лимиты и команды работают');
  } finally { H.close(); U.close(); srv.proc.kill(); }
}
main().catch((e) => { console.error('FAIL admin:', e.message); process.exit(1); });
