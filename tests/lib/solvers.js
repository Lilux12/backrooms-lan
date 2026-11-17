'use strict';
// Решатели головоломок для бота (tests/bot-playthrough.js). Бот ходит телепортом (сервер в режиме TEST_HOOKS),
// но всё остальное делает как игрок: подбирает предметы касанием, жмёт E, вводит код, держит переключатели.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RIDDLES = ['цвет тревоги', 'цвет воды', 'цвет таблички', 'цвет стен']; // по номерам цветов рычагов

function makeBotApi(ws) {
  let inbox = [], waiters = [], objs = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 's') return;
    if (m.t === 'rtt') { ws.send(JSON.stringify({ t: 'rtt', k: m.k })); return; }
    if (m.t === 'add') objs.push(m.o);
    if (m.t === 'obj') { const o = objs.find((q) => q.id === m.id); if (o) Object.assign(o, m.p); }
    inbox.push(m);
    waiters = waiters.filter((w) => !(w.pred(m) && (w.res(m), true)));
  };
  const api = {
    pos: { x: 0, y: 0, z: 0 },
    send: (o) => ws.send(JSON.stringify(o)),
    waitFor: (pred, ms = 8000) => new Promise((res, rej) => {
      const hit = inbox.find(pred);
      if (hit) { inbox.splice(inbox.indexOf(hit), 1); return res(hit); }
      const w = { pred, res: (m) => { clearTimeout(w.t); inbox.splice(inbox.indexOf(m), 1); res(m); } };
      w.t = setTimeout(() => rej(new Error('не дождались сообщения')), ms);
      waiters.push(w);
    }),
    // встать в точку (fl — включённый фонарик); сервер обработает касание в ближайший тик
    async goTo(x, y, z, o = {}) {
      api.pos = { x, y, z };
      api.send({ t: 'p', x, y, z, r: o.r || 0, f: o.fl ? 1 : 0 });
      await sleep(o.ms || 140);
    },
    setInit(init) { inbox = []; objs = init.objs.map((o) => Object.assign({}, o)); },
    of: (kind) => objs.filter((o) => o.kind === kind),
    switches: (group) => objs.filter((o) => o.kind === 'switch' && o.group === group),
    async use(o, wait) {
      api.send({ t: 'use', id: o.id });
      if (wait) return api.waitFor(wait);
      await sleep(120);
      return null;
    },
  };
  return api;
}

// Встать рядом с настенным объектом (цифра, записка) — с той стороны, где комната
const front = (o, k = 1.5) => [o.x + (o.nx || 0) * k, o.y, o.z + (o.nz || 0) * k];

const SOLVERS = {
  // Предохранители: собрать все (в т.ч. за провалом), вставить, при необходимости — рубильник
  async fuses(api, cfg) {
    for (const f of api.of('fuse')) await api.goTo(f.x, f.y, f.z);
    const box = api.of('box')[0];
    await api.goTo(box.x + 0.5, box.y, box.z);
    await api.use(box, (m) => m.t === 'ev' && /вставил предохранители/.test(m.text));
    if (cfg.breaker) {
      const br = api.switches('breaker')[0];
      await api.goTo(br.x, br.y, br.z);                       // встал — рубильник держится ещё ~14 с
      await api.goTo(box.x + 0.5, box.y, box.z);
      await api.use(box, (m) => m.t === 'ev' && /Питание восстановлено/.test(m.text));
    }
  },

  // Код: обойти цифры (с фонарём — краска видна только в его свете), открыть доступ к терминалу, ввести код
  async code(api, cfg) {
    let digits = api.of('digit').sort((a, b) => a.idx - b.idx);
    for (const d of digits) await api.goTo(...front(d), { fl: true });
    if (cfg.codeTapes) {
      // код на кассетах: посмотреть обе и собрать цифры из «7 3 _ _» и «_ _ 1 9»
      const code = ['_', '_', '_', '_'];
      for (const t of api.of('paper').filter((q) => q.tape != null)) {
        await api.goTo(t.x, t.y, t.z);
        const note = await api.use(t, (m) => m.t === 'note');
        const line = note.text.split('\n').find((l) => /^[\d_ ]+$/.test(l.trim()) && l.trim().length >= 7);
        line.trim().split(' ').forEach((ch, k) => { if (ch !== '_') code[k] = ch; });
      }
      digits = code.map((d, k) => ({ digit: +d, idx: k }));
    }
    if (cfg.keypadPoi && api.switches('reception').length) {
      const rc = api.switches('reception')[0];
      await api.goTo(rc.x, rc.y, rc.z);
      await api.waitFor((m) => m.t === 'cell' && m.type === 0, 4000); // дверь переговорной открылась
    }
    const kp = api.of('keypad')[0];
    if (cfg.codePower) {
      await api.goTo(kp.x, kp.y, kp.z);
      api.send({ t: 'code', v: '1111' });
      const off = await api.waitFor((m) => m.t === 'codebad');
      if (!off.off) throw new Error('терминал работает без генератора');
      const gen = api.switches('gen')[0];
      await api.goTo(gen.x, gen.y, gen.z);
    }
    await api.goTo(kp.x, kp.y, kp.z);
    api.send({ t: 'code', v: '0000' });
    const bad = await api.waitFor((m) => m.t === 'codebad');   // неверный код → отказ
    if (bad.off) throw new Error('терминал обесточен в момент ввода');
    api.send({ t: 'code', v: digits.map((d) => d.digit).join('') });
    await api.waitFor((m) => m.t === 'codeok');
  },

  // Плиты: встать на одну, потом на другую (первая держится 22 с)
  async plates(api) {
    for (const p of api.of('plate')) await api.goTo(p.x, p.y, p.z);
  },

  // Рычаги: прочитать записку и тянуть по порядку
  async levers(api) {
    for (const n of api.of('note')) {
      await api.goTo(...front(n));
      const note = await api.use(n, (m) => m.t === 'note');
      const order = note.text.split('\n').filter((l) => /^\d\)/.test(l)).map((l) => RIDDLES.findIndex((r) => l.includes(r)));
      if (order.length !== 4) throw new Error('не разобрана записка');
      for (const col of order) {
        const lv = api.of('lever').find((l) => l.col === col);
        await api.goTo(lv.x + 0.5, lv.y, lv.z); await api.use(lv);
      }
    }
  },

  // Бассейны: таблица давления → вентили → слив → задвижка шлюза → ключ-карта → насос
  async pools(api) {
    const paper = api.of('paper')[0];
    await api.goTo(paper.x, paper.y, paper.z);
    const note = await api.use(paper, (m) => m.t === 'note');
    const targets = ['КРАСНЫЙ', 'СИНИЙ', 'ЖЁЛТЫЙ'].map((c) => (note.text.split('\n').find((l) => l.startsWith(c)).match(/●/g) || []).length);
    for (const v of api.of('valve')) {
      await api.goTo(v.x, v.y, v.z);
      for (let k = 0; k < targets[v.col]; k++) await api.use(v, (m) => m.t === 'obj' && m.id === v.id);
    }
    const dr = api.of('drain')[0];
    await api.goTo(dr.x, dr.y, dr.z);
    await api.use(dr, (m) => m.t === 'ev' && m.text.includes('Вода уходит'));
    await sleep(15000); // вода уходит ~14 с
    const gp = api.of('gateplate')[0], kc = api.of('keycard')[0];
    await api.goTo(gp.x, gp.y, gp.z);
    await api.waitFor((m) => m.t === 'cell' && m.type === 0, 3000); // шлюз открылся
    await api.goTo(kc.x, kc.y, kc.z);
    await api.waitFor((m) => m.t === 'pick' && m.kind === 'keycard');
    const pump = api.of('pump')[0];
    await api.goTo(pump.x, pump.y, pump.z); await api.use(pump);
  },

  // Тоннели: вентиль пара → плита А → плита Б → шлюз открыт
  async steam(api) {
    const v = api.of('steamvalve')[0];
    await api.goTo(v.x + 0.6, v.y, v.z);
    await api.use(v, (m) => m.t === 'ev' && /вентиль/.test(m.text));
    const [a, b] = api.switches('plates');
    await api.goTo(a.x, a.y, a.z);
    await api.goTo(b.x, b.y, b.z);
    await api.waitFor((m) => m.t === 'cell' && m.type === 0, 4000);
  },

  // Отель: ключи по номерам → ключница → две кнопки лифта одновременно
  async hotel(api) {
    for (const k of api.of('key')) { await api.goTo(k.x, k.y, k.z); }
    await api.waitFor((m) => m.t === 'goal' && m.lines.some((l) => /Ключи: 4\/4|в руках: 4/.test(l)), 4000).catch(() => {});
    const ks = api.of('keyslot')[0];
    await api.goTo(ks.x + 0.8, ks.y, ks.z);
    await api.use(ks, (m) => m.t === 'ev' && /повесил ключи/.test(m.text));
    const [a, b] = api.switches('liftbtn');
    await api.goTo(a.x, a.y, a.z);
    await api.goTo(b.x, b.y, b.z);
    await api.waitFor((m) => m.t === 'ev' && /Служебный лифт приехал/.test(m.text), 5000);
  },

  // ТЦ: канистра и предохранитель → насос + генератор (дальше код на кассетах — решатель кода)
  async mall(api) {
    for (const k of ['fuelcan', 'mallfuse']) { const o = api.of(k)[0]; await api.goTo(o.x, o.y, o.z); await api.waitFor((m) => m.t === 'pick' && m.kind === k, 3000); }
    const gen = api.of('genroof')[0], pump = api.switches('fuelpump')[0];
    await api.goTo(gen.x + 1.5, gen.y, gen.z);
    await api.use(gen, (m) => m.t === 'ev' && /топливо не идёт/.test(m.text)); // без насоса не заводится
    await api.goTo(pump.x, pump.y, pump.z);
    await api.goTo(gen.x + 1.5, gen.y, gen.z);
    await api.use(gen, (m) => m.t === 'ev' && /завёл генератор/.test(m.text));
  },

  // Лаборатория: допуск → считыватель (×3), рецепт → реагенты, два ключа сброса
  async lab(api) {
    for (const c of ['blue', 'yellow', 'red']) {
      const card = api.of('labcard').find((o) => o.group === c);
      await api.goTo(card.x, card.y, card.z);
      await api.waitFor((m) => m.t === 'pick' && m.kind === 'labcard', 3000);
      if (c === 'red') await api.waitFor((m) => m.t === 'ev' && /Карантин снят/.test(m.text), 15000);
      const rd = api.of('cardreader').find((o) => o.group === c);
      await api.goTo(rd.x + 0.5, rd.y, rd.z);
      await api.use(rd, (m) => m.t === 'ev' && new RegExp(`открыл .* шлюз`).test(m.text));
      if (c === 'yellow') {
        const jn = api.of('paper').find((o) => /Журнал/.test(o.title || ''));
        await api.goTo(jn.x, jn.y, jn.z);
        api.recipe = (await api.use(jn, (m) => m.t === 'note')).text;
      }
    }
    const names = ['СИНИЙ', 'ЗЕЛЁНЫЙ', 'ЯНТАРНЫЙ'];
    const order = api.recipe.split('\n').filter((l) => /^\d\)/.test(l)).map((l) => names.findIndex((n) => l.includes(n)));
    for (const col of order) {
      const r = api.of('reagent').find((o) => o.col === col);
      await api.goTo(r.x + 0.5, r.y, r.z);
      await api.use(r, (m) => m.t === 'ev' && /добавил реагент/.test(m.text));
    }
    await api.waitFor((m) => m.t === 'ev' && /Охладитель готов/.test(m.text), 3000);
    const [a, b] = api.switches('reactorkey');
    await api.goTo(a.x, a.y, a.z);
    await api.goTo(b.x, b.y, b.z);
    await api.waitFor((m) => m.t === 'ev' && /АВАРИЙНЫЙ СБРОС/.test(m.text), 5000);
  },

  // Школа: 6 кусочков → доска; считалочка → игрушки на полки; две качели разом
  async school(api) {
    for (const p of api.of('puzzlepiece')) { await api.goTo(p.x, p.y, p.z); }
    const board = api.of('puzzleboard')[0];
    await api.goTo(board.x + 0.6, board.y, board.z);
    await api.use(board, (m) => m.t === 'ev' && /Картина сложилась/.test(m.text));
    const rh = api.of('paper').find((o) => /Считалочка/.test(o.title || ''));
    await api.goTo(rh.x, rh.y, rh.z);
    const text = (await api.use(rh, (m) => m.t === 'note')).text;
    const toyOf = { bear: 'Мишка', bunny: 'Зайка', duck: 'Утёнок' }, colorOf = { 'пожарной': 'red', 'травы': 'green', 'неба': 'blue' };
    for (const toy of api.of('toy')) {
      const line = text.split('\n').find((l) => l.startsWith(toyOf[toy.toy]));
      const color = Object.entries(colorOf).find(([w]) => line.includes(w))[1];
      await api.goTo(toy.x, toy.y, toy.z);
      await api.waitFor((m) => m.t === 'pick' && m.kind === 'toy', 3000);
      const shelf = api.of('shelf').find((o) => o.color === color);
      await api.goTo(shelf.x + 0.6, shelf.y, shelf.z);
      await api.use(shelf, (m) => m.t === 'obj' && m.id === shelf.id);
    }
    await api.waitFor((m) => m.t === 'ev' && /Игрушки на своих местах/.test(m.text), 3000);
    const [a, b] = api.switches('swing');
    await api.goTo(a.x, a.y, a.z);
    await api.goTo(b.x, b.y, b.z);
    await api.waitFor((m) => m.t === 'ev' && /Качели взлетели/.test(m.text), 5000);
  },

  // Фабрика: печи по возрастанию → задвижки по схеме → конвейеры → три консоли
  async factory(api, cfg, o = {}) {
    for (const f of api.of('furnace').sort((a, b) => a.temp - b.temp)) {
      await api.goTo(f.x, f.y, f.z);
      await api.use(f, (m) => m.t === 'ev' && /разжёг печь/.test(m.text));
    }
    const sc = api.of('paper').find((q) => /Схема/.test(q.title || ''));
    await api.goTo(sc.x, sc.y, sc.z);
    const line = (await api.use(sc, (m) => m.t === 'note')).text.split('\n').find((l) => /[◄▲►]/.test(l) && !/—/.test(l));
    const target = line.trim().split(/\s+/).map((ch) => ['◄', '▲', '►'].indexOf(ch));
    for (const v of api.of('pipevalve').sort((a, b) => a.k - b.k)) {
      await api.goTo(v.x + 0.5, v.y, v.z);
      while (v.val !== target[v.k]) await api.use(v, (m) => m.t === 'obj' && m.id === v.id);
    }
    await api.waitFor((m) => m.t === 'ev' && /Конвейеры ожили/.test(m.text), 3000);
    for (const s of api.switches('conveyor')) await api.goTo(s.x, s.y, s.z);
    await api.waitFor((m) => m.t === 'ev' && /Конвейеры идут в такт/.test(m.text), 5000);
    for (const s of api.switches('console')) await api.goTo(s.x, s.y, s.z);
    await api.waitFor((m) => m.t === 'ev' && /ФАБРИКА ОСТАНОВЛЕНА/.test(m.text), 5000);
    if (o.stay) { // вторая концовка: сесть в кресло Надсмотрщика
      const ch = api.of('ending')[0];
      await api.goTo(ch.x + 0.6, ch.y, ch.z);
      await api.use(ch);
    }
  },

  // Механика уровня без отдельной цели
  async parking() {},
  async hospital() {},
  async offices() {}, // переговорную открывает решатель кода
};

module.exports = { SOLVERS, makeBotApi, sleep };
