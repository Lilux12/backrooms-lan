'use strict';
// Бот проходит всю кампанию через WebSocket: решает головоломки каждого уровня и доходит до выхода.
// Сервер пока не проверяет скорость, поэтому бот «телепортируется» к нужным объектам.
const assert = require('assert');
const { startServer } = require('./lib/server');

const PORT = 3903;
const LEVEL_TIMEOUT = 40000;
const RIDDLES = ['цвет тревоги', 'цвет воды', 'цвет таблички', 'цвет стен']; // по номерам цветов рычагов
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const FIRST = +(process.env.START_LEVEL || 0);
  const srv = await startServer(PORT, { START_LEVEL: String(FIRST) });
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
  const goTo = async (x, y, z) => { send({ t: 'p', x, y, z, r: 0 }); await sleep(120); };

  try {
    send({ t: 'join', name: 'Бот' });
    let init = await waitFor((m) => m.t === 'init');
    for (let level = FIRST; level < 6; level++) {
      assert.strictEqual(init.level, level, 'неверный порядок уровней');
      const objs = init.objs, t0 = Date.now();
      const of = (k) => objs.filter((o) => o.kind === k);
      // Предохранители
      for (const f of of('fuse')) await goTo(f.x, f.y, f.z);
      for (const b of of('box')) { await goTo(b.x + 0.5, b.y, b.z); send({ t: 'use', id: b.id }); await sleep(100); }
      // Код: обойти цифры, затем ввести на терминале
      const digits = of('digit');
      for (const d of digits) await goTo(d.x + d.nx * 1.5, d.y, d.z + d.nz * 1.5);
      for (const k of of('keypad')) {
        await goTo(k.x, k.y, k.z);
        send({ t: 'code', v: '0000' }); await waitFor((m) => m.t === 'codebad'); // неверный код → отказ
        send({ t: 'code', v: digits.sort((a, b) => a.idx - b.idx).map((d) => d.digit).join('') });
        await waitFor((m) => m.t === 'codeok');
      }
      // Плиты: встать на одну, потом на другую (первая держится 22 с)
      for (const p of of('plate')) await goTo(p.x, p.y, p.z);
      // Рычаги: прочитать записку и тянуть по порядку
      for (const n of of('note')) {
        await goTo(n.x + n.nx * 1.5, n.y, n.z + n.nz * 1.5);
        send({ t: 'use', id: n.id });
        const note = await waitFor((m) => m.t === 'note');
        const order = note.text.split('\n').filter((l) => /^\d\)/.test(l)).map((l) => RIDDLES.findIndex((r) => l.includes(r)));
        assert.strictEqual(order.length, 4, 'не разобрана записка');
        for (const col of order) {
          const lv = of('lever').find((l) => l.col === col);
          await goTo(lv.x + 0.5, lv.y, lv.z); send({ t: 'use', id: lv.id }); await sleep(100);
        }
      }
      // Бассейны: таблица давления → вентили → слив → задвижка шлюза → ключ-карта → насос
      const paper = of('paper')[0];
      if (paper) {
        await goTo(paper.x, paper.y, paper.z);
        send({ t: 'use', id: paper.id });
        const note = await waitFor((m) => m.t === 'note');
        const targets = ['КРАСНЫЙ', 'СИНИЙ', 'ЖЁЛТЫЙ'].map((c) => (note.text.split('\n').find((l) => l.startsWith(c)).match(/●/g) || []).length);
        for (const v of of('valve')) {
          await goTo(v.x, v.y, v.z);
          for (let k = 0; k < targets[v.col]; k++) { send({ t: 'use', id: v.id }); await waitFor((m) => m.t === 'obj' && m.id === v.id); }
        }
        const dr = of('drain')[0];
        await goTo(dr.x, dr.y, dr.z); send({ t: 'use', id: dr.id });
        await waitFor((m) => m.t === 'ev' && m.text.includes('Вода уходит'));
        await sleep(15000); // вода уходит ~14 с
        const gp = of('gateplate')[0], kc = of('keycard')[0];
        await goTo(gp.x, gp.y, gp.z);
        await waitFor((m) => m.t === 'cell' && m.type === 0, 3000); // шлюз открылся
        await goTo(kc.x, kc.y, kc.z);
        await waitFor((m) => m.t === 'pick' && m.kind === 'keycard');
        const pump = of('pump')[0];
        await goTo(pump.x, pump.y, pump.z); send({ t: 'use', id: pump.id });
      }
      // Ждём открытия двери и идём к ней
      const door = of('door')[0];
      if (!door.open) await waitFor((m) => m.t === 'obj' && m.id === door.id && m.p.open, LEVEL_TIMEOUT);
      await goTo(door.x, door.y, door.z);
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
