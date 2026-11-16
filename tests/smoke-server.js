'use strict';
// Smoke-тест сервера: статика отдаётся, WebSocket принимает игрока, приходят init и снапшоты.
const assert = require('assert');
const { startServer } = require('./lib/server');

const PORT = 3901;

async function main() {
  const srv = await startServer(PORT);
  try {
    const html = await (await fetch(`http://localhost:${PORT}/`)).text();
    assert(html.includes('BACKROOMS'), 'главная страница не отдаётся');
    // Все локальные скрипты и стили, на которые ссылается страница, должны отдаваться
    const refs = [...html.matchAll(/(?:(?:src|href)=|"three": )"([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
    assert(refs.some((r) => r.includes('three.module')), 'не найден импорт three');
    for (const r of refs) {
      const res = await fetch(new URL(r, `http://localhost:${PORT}/`));
      assert.strictEqual(res.status, 200, `не отдаётся ${r}`);
    }
    for (const bad of ['/%2e%2e/package.json', '/%2e%2e/server/index.js', '/shared/%2e%2e/package.json', '/js/%2e%2e%2f%2e%2e/package.json']) {
      assert.strictEqual((await fetch(`http://localhost:${PORT}${bad}`)).status, 404, `выход за пределы папки: ${bad}`);
    }

    const msgs = [];
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
    ws.send(JSON.stringify({ t: 'join', name: 'Бот' }));
    await new Promise((r) => setTimeout(r, 600));
    const init = msgs.find((m) => m.t === 'init');
    assert(init, 'нет сообщения init');
    assert(Number.isInteger(init.seed) && init.objs.length > 0, 'init без карты/объектов');
    assert(msgs.some((m) => m.t === 's'), 'нет снапшотов');
    ws.send('мусор{');
    ws.send(JSON.stringify({ t: 'p', x: 'NaN', z: {}, r: null }));
    await new Promise((r) => setTimeout(r, 200));
    assert(srv.proc.exitCode === null, 'сервер упал от мусора');
    ws.close();
    console.log(`OK smoke-server: ${refs.length} файлов, ${msgs.length} сообщений, уровень ${init.level}, seed ${init.seed}`);
  } finally {
    srv.proc.kill();
  }
}
main().catch((e) => { console.error('FAIL smoke-server:', e.message); process.exit(1); });
