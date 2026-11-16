'use strict';
// Бот проходит всю кампанию через WebSocket: решает головоломки каждого уровня и доходит до выхода.
// Сервер пока не проверяет скорость, поэтому бот «телепортируется» к нужным объектам.
const assert = require('assert');
const { startServer } = require('./lib/server');

const PORT = 3903;
const LEVEL_TIMEOUT = 30000;
const RIDDLES = ['цвет тревоги', 'цвет воды', 'цвет таблички', 'цвет стен']; // по номерам цветов рычагов
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const srv = await startServer(PORT);
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const inbox = [];
  let waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 's') return;
    inbox.push(m);
    waiters = waiters.filter((w) => !(w.pred(m) && (w.res(m), true)));
  };
  const waitFor = (pred, ms = 5000) => new Promise((res, rej) => {
    const hit = inbox.find(pred);
    if (hit) { inbox.splice(inbox.indexOf(hit), 1); return res(hit); }
    const w = { pred, res: (m) => { clearTimeout(w.t); inbox.splice(inbox.indexOf(m), 1); res(m); } };
    w.t = setTimeout(() => rej(new Error('не дождались сообщения')), ms);
    waiters.push(w);
  });
  const send = (o) => ws.send(JSON.stringify(o));
  const goTo = async (x, z) => { send({ t: 'p', x, z, r: 0 }); await sleep(120); };

  try {
    send({ t: 'join', name: 'Бот' });
    let init = await waitFor((m) => m.t === 'init');
    for (let level = 0; level < 6; level++) {
      assert.strictEqual(init.level, level, 'неверный порядок уровней');
      const objs = init.objs, t0 = Date.now();
      const of = (k) => objs.filter((o) => o.kind === k);
      // Предохранители
      for (const f of of('fuse')) await goTo(f.x, f.z);
      for (const b of of('box')) { await goTo(b.x + 0.5, b.z); send({ t: 'use', id: b.id }); await sleep(100); }
      // Код: обойти цифры, затем ввести на терминале
      const digits = of('digit');
      for (const d of digits) await goTo(d.x + d.nx * 1.5, d.z + d.nz * 1.5);
      for (const k of of('keypad')) {
        await goTo(k.x, k.z);
        send({ t: 'code', v: '0000' }); await waitFor((m) => m.t === 'codebad'); // неверный код → отказ
        send({ t: 'code', v: digits.sort((a, b) => a.idx - b.idx).map((d) => d.digit).join('') });
        await waitFor((m) => m.t === 'codeok');
      }
      // Плиты: встать на одну, потом на другую (первая держится 22 с)
      for (const p of of('plate')) await goTo(p.x, p.z);
      // Рычаги: прочитать записку и тянуть по порядку
      for (const n of of('note')) {
        await goTo(n.x + n.nx * 1.5, n.z + n.nz * 1.5);
        send({ t: 'use', id: n.id });
        const note = await waitFor((m) => m.t === 'note');
        const order = note.text.split('\n').filter((l) => /^\d\)/.test(l)).map((l) => RIDDLES.findIndex((r) => l.includes(r)));
        assert.strictEqual(order.length, 4, 'не разобрана записка');
        for (const col of order) {
          const lv = of('lever').find((l) => l.col === col);
          await goTo(lv.x + 0.5, lv.z); send({ t: 'use', id: lv.id }); await sleep(100);
        }
      }
      // Ждём открытия двери и идём к ней
      const door = of('door')[0];
      if (!door.open) await waitFor((m) => m.t === 'obj' && m.id === door.id && m.p.open, LEVEL_TIMEOUT);
      await goTo(door.x, door.z);
      const done = await waitFor((m) => m.t === 'done', LEVEL_TIMEOUT);
      console.log(`  уровень ${level} пройден за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
      if (done.last) break;
      init = await waitFor((m) => m.t === 'init', 10000);
    }
    console.log('OK bot-playthrough: все 6 уровней пройдены');
  } finally {
    ws.close(); srv.proc.kill();
  }
}
main().catch((e) => { console.error('FAIL bot-playthrough:', e.message); process.exit(1); });
