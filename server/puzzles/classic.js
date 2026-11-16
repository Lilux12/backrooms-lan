'use strict';
// Классические головоломки: предохранители (+ рубильник, который нужно держать), код из 4 цифр
// (+ цифры, видимые только в свете фонаря, + генератор, без которого терминал мёртв), нажимные плиты, рычаги.
const U = require('./util');
const { BR, broadcast, near, patch, removeObj, PICK_DIST, sendGoals, checkSolved, alarm, event } = U;

const LATCH = 22;            // сколько секунд держится нажатая плита
const DIGIT_DIST = 3.6;      // с какого расстояния «читается» цифра на стене
const UV_DIST = 7;           // УФ-цифру видно только в луче фонаря с такого расстояния
const LEVER_COLORS = [
  { name: 'КРАСНЫЙ', riddle: 'цвет тревоги и аварийной сирены' },
  { name: 'СИНИЙ', riddle: 'цвет воды, в которой вы тонете' },
  { name: 'ЗЕЛЁНЫЙ', riddle: 'цвет таблички «ВЫХОД»' },
  { name: 'ЖЁЛТЫЙ', riddle: 'цвет стен, с которых всё началось' },
];

module.exports = {
  // Предохранители: собрать и вставить в щиток. Опции уровня:
  //   fuseFloors: [f…] — на этих этажах обязательно лежит по предохранителю (например, за провалом внизу);
  //   breaker: { latch } — щиток включается, только пока держат рубильник (кооператив; одному — успеть добежать).
  fuses: {
    init: (cfg) => ({ need: cfg.fuses || 0, inserted: 0, held: 0, solved: false }),
    setup(G, add, rnd) {
      const map = G.map, maxD = map.maxDist, cfg = G.cfg;
      const spots = [];
      for (const f of cfg.fuseFloors || []) {
        const s = BR.pickSpots(map, rnd, 1, { floor: f, minDist: 0.15 * maxD })[0];
        if (s) spots.push(s);
      }
      const rest = BR.pickSpots(map, rnd, cfg.fuses + 2, { minDist: 0.25 * maxD, minSep: 6 })
        .filter((p) => !spots.some((q) => q.node === p.node));
      while (spots.length < cfg.fuses && rest.length) spots.push(rest.shift());
      spots.forEach((p) => add('fuse', { x: p.x, y: p.y, z: p.z }));
      const b = BR.pickSpots(map, rnd, 1, { minDist: 0.15 * maxD, maxDist: 0.65 * maxD })[0];
      G.pz.fuses.box = add('box', { x: b.x, y: b.y, z: b.z });
      if (cfg.breaker) {
        // рубильник в 5–9 шагах от щитка: один игрок успевает включить его и добежать
        const n = U.nodeNear(G, rnd, b.node, 5, 9, (m) => Math.floor(m / BR.NN) === b.f);
        U.addSwitch(add, U.at(G, n), 'breaker', cfg.breaker.latch || 14, 'Рубильник', { style: 'breaker' });
      }
    },
    goal: (G) => {
      const f = G.pz.fuses;
      if (f.solved) return `Предохранители: ${f.inserted}/${f.need} · питание ✔`;
      let s = `Предохранители: ${f.inserted}/${f.need}` + (f.held ? ` (в руках: ${f.held})` : '');
      if (G.cfg.breaker && f.inserted >= f.need) s += ' · держите рубильник и включите щиток (E)';
      return s;
    },
    touch(G, p, o) {
      if (o.kind !== 'fuse' || !near(o, p, PICK_DIST)) return false;
      removeObj(G, o);
      G.pz.fuses.held++;
      broadcast({ t: 'pick', id: o.id, kind: 'fuse', by: p.name });
      return true;
    },
    use(G, c, o) {
      if (o.kind !== 'box') return false;
      const f = G.pz.fuses;
      if (f.solved) return true;
      if (f.held) {
        f.inserted += f.held; f.held = 0;
        broadcast({ t: 'ev', text: `${c.name} вставил предохранители (${f.inserted}/${f.need})` });
        broadcast({ t: 'sfx', name: 'zap' });
      } else if (f.inserted < f.need) { c.send({ t: 'ev', text: 'Щиток обесточен. Нужны предохранители.' }); return true; }
      if (f.inserted >= f.need) {
        if (G.cfg.breaker && !U.anyOn(G, 'breaker')) {
          broadcast({ t: 'ev', text: 'Все предохранители на месте, но рубильник выключен. Пусть кто-то держит рубильник — или включите его и бегом сюда!' });
        } else {
          f.solved = true;
          broadcast({ t: 'ev', text: 'Питание восстановлено!' });
          if (G.cfg.breaker) { event(G, 'blackout', { dur: 3.5 }); alarm(G, o.x, o.y, o.z); } // перегрузка: свет гаснет, существа идут на гул
        }
      }
      sendGoals(G); checkSolved(G);
      return true;
    },
  },

  // Код из 4 цифр на стенах, вводится на терминале. Опции уровня:
  //   codeFloors: [f0, f1, f2, f3] — этаж для каждой цифры; uvDigits — цифры видны только в свете фонаря;
  //   codePower: { latch } — терминал работает, пока держат генератор; codeNeedsFuses — сначала питание щитка;
  //   keypadPoi — терминал стоит в map.lv.keypad (иначе — у двери выхода).
  code: {
    init: () => ({ digits: [], found: [null, null, null, null], solved: false }),
    setup(G, add, rnd) {
      const map = G.map, cfg = G.cfg, maxD = map.maxDist;
      const digits = [];
      for (let i = 0; i < 4; i++) digits.push(1 + Math.floor(rnd() * 9));
      G.pz.code.digits = digits;
      if (cfg.codeTapes) {
        // код на двух кассетах камер наблюдения: на каждой видно по две цифры
        const tapes = (map.lv && map.lv.tapes) || BR.pickSpots(map, rnd, 2, { minDist: 0.2 * maxD, minSep: 8 }).map((p) => p.node);
        tapes.slice(0, 2).forEach((n, k) => {
          const p = U.at(G, n), a = digits[k * 2], b = digits[k * 2 + 1];
          const shown = k === 0 ? `${a} ${b} _ _` : `_ _ ${a} ${b}`;
          add('paper', { x: p.x, y: p.y, z: p.z, tape: k, title: `Кассета камеры №${k + 3}`,
            text: `На записи охранник подходит к решётке кинотеатра и набирает код. Видно только часть кнопок:\n\n${shown}\n\n(${k === 0 ? 'первые две цифры' : 'последние две цифры'})` });
        });
      }
      let spots = [];
      if (cfg.codeTapes) { /* цифр на стенах нет */ } else if (cfg.codeFloors) {
        spots = cfg.codeFloors.map((f, i) => {
          const s = BR.pickWallSpots(map, rnd, 4, { minDist: 0.15 * maxD, minSep: 6 })
            .concat(BR.pickWallSpots(map, rnd, 30, { minDist: 0.1 * maxD }));
          return s.find((p) => p.f === f) || s[i];
        });
      } else spots = BR.pickWallSpots(map, rnd, 4, { minDist: 0.2 * maxD, minSep: 7 });
      spots.forEach((p, i) => add('digit', { x: p.x, y: p.y, z: p.z, nx: p.nx, nz: p.nz, idx: i, digit: digits[i], uv: !!cfg.uvDigits }));
      let kp;
      if (cfg.keypadPoi && map.lv && map.lv.keypad != null) kp = U.at(G, map.lv.keypad);
      else kp = { x: map.exit.fx, y: map.exit.y, z: map.exit.fz, node: map.exit.frontNode };
      G.pz.code.keypad = add('keypad', { x: kp.x, y: kp.y, z: kp.z, free: !!cfg.keypadPoi });
      if (cfg.codePower) {
        const n = U.nodeNear(G, rnd, kp.node, 6, 11, (m) => Math.floor(m / BR.NN) === Math.floor(kp.node / BR.NN));
        U.addSwitch(add, U.at(G, n), 'gen', cfg.codePower.latch || 18, 'Генератор', { style: 'generator' });
      }
    },
    goal: (G) => {
      const c = G.pz.code;
      let s = 'Код: ' + c.found.map((d) => (d == null ? '_' : d)).join(' ') + (c.solved ? ' ✔' : '');
      if (!c.solved && G.cfg.uvDigits) s += ' · цифры видно только в свете фонаря';
      if (!c.solved && G.cfg.codeTapes) s += ' · цифры — на кассетах камер';
      if (!c.solved && G.cfg.codePower) s += ' · терминалу нужен генератор';
      return s;
    },
    // прочитали кассету — её цифры найдены
    read(G, c, o) {
      if (o.tape == null) return;
      const f = G.pz.code.found, d = G.pz.code.digits, k = o.tape * 2;
      if (f[k] != null) return;
      f[k] = d[k]; f[k + 1] = d[k + 1];
      broadcast({ t: 'ev', text: `${c.name} посмотрел кассету: цифры ${d[k]} и ${d[k + 1]} (позиции ${k + 1}–${k + 2})` });
      sendGoals(G);
    },
    touch(G, p, o) {
      if (o.kind !== 'digit' || G.pz.code.found[o.idx] != null) return false;
      if (o.uv ? !(p.fl && near(o, p, UV_DIST)) : !near(o, p, DIGIT_DIST)) return false;
      G.pz.code.found[o.idx] = o.digit;
      broadcast({ t: 'ev', text: `${p.name} нашёл цифру: ${o.digit} (позиция ${o.idx + 1})` });
      return true;
    },
  },

  // Две нажимные плиты; каждая держится LATCH секунд после того, как с неё сошли
  plates: {
    init: () => ({ solved: false }),
    setup(G, add, rnd) {
      const map = G.map;
      // вторая плита — в 9–16 шагах по графу от первой: один игрок успевает добежать за LATCH секунд
      const a = BR.pickSpots(map, rnd, 1, { minDist: 0.3 * map.maxDist })[0];
      const da = BR.bfsNav(BR.ensureNav(map), a.node);
      let cand = map.spots.filter((n) => da[n] >= 9 && da[n] <= 16 && map.dist[n] >= 0.2 * map.maxDist);
      if (!cand.length) cand = map.spots.filter((n) => da[n] >= 6 && da[n] <= 18 && n !== a.node);
      const b = BR.spotOf(map, cand[Math.floor(rnd() * cand.length)]);
      add('plate', { x: a.x, y: a.y, z: a.z, on: false, hold: 0 });
      add('plate', { x: b.x, y: b.y, z: b.z, on: false, hold: 0 });
    },
    goal: (G) => `Плиты нажаты: ${G.objs.filter((o) => o.kind === 'plate' && o.on).length}/2` + (G.pz.plates.solved ? ' ✔' : ''),
    tick(G, players, dt) {
      if (G.pz.plates.solved) return false;
      let changed = false;
      const plates = G.objs.filter((o) => o.kind === 'plate');
      for (const pl of plates) {
        const pressed = players.some((p) => near(pl, p, 1.5));
        const was = pl.on;
        pl.hold = pressed ? LATCH : Math.max(0, pl.hold - dt);
        const on = pl.hold > 0;
        if (on !== was) { patch(pl, { on }); changed = true; }
      }
      if (plates.length && plates.every((pl) => pl.on)) {
        G.pz.plates.solved = true; changed = true;
        broadcast({ t: 'ev', text: 'Обе плиты нажаты — механизм сработал!' });
        checkSolved(G);
      }
      return changed;
    },
  },

  // Записка-загадка и 4 рычага в правильном порядке; ошибка включает сирену
  levers: {
    init: () => ({ order: [], progress: 0, solved: false, text: '' }),
    setup(G, add, rnd) {
      const order = [0, 1, 2, 3];
      for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const lv = G.pz.levers;
      lv.order = order;
      lv.text = 'Порядок смены давления:\n' + order.map((c, i) => `${i + 1}) ${LEVER_COLORS[c].riddle}`).join('\n') +
        '\n\nОшибёшься — включится сирена.';
      const maxD = G.map.maxDist;
      BR.pickSpots(G.map, rnd, 4, { minDist: 0.25 * maxD, minSep: 7 }).forEach((p, i) => add('lever', { x: p.x, y: p.y, z: p.z, col: i, on: false }));
      const n = BR.pickWallSpots(G.map, rnd, 1, { minDist: 0.1 * maxD, maxDist: 0.5 * maxD })[0];
      add('note', { x: n.x, y: n.y, z: n.z, nx: n.nx, nz: n.nz });
    },
    goal: (G) => `Рычаги: ${G.pz.levers.progress}/4` + (G.pz.levers.solved ? ' ✔' : ''),
    use(G, c, o) {
      const lv = G.pz.levers;
      if (o.kind === 'note') { c.send({ t: 'note', text: lv.text }); return true; }
      if (o.kind !== 'lever') return false;
      if (lv.solved || o.on) return true;
      if (lv.order[lv.progress] === o.col) {
        lv.progress++;
        patch(o, { on: true });
        broadcast({ t: 'sfx', name: 'click' });
        if (lv.progress >= 4) { lv.solved = true; broadcast({ t: 'ev', text: 'Давление стабилизировано!' }); }
      } else {
        lv.progress = 0;
        for (const l of G.objs.filter((q) => q.kind === 'lever' && q.on)) patch(l, { on: false });
        broadcast({ t: 'ev', text: `${c.name} ошибся с рычагом — СИРЕНА!` });
        alarm(G, c.x, c.y, c.z);
      }
      sendGoals(G); checkSolved(G);
      return true;
    },
  },
};
