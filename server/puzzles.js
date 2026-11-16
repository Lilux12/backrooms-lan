'use strict';
// Головоломки. Каждая описана объектом с хуками:
//   init()                      — начальное состояние G.pz[имя]
//   setup(G, add, rnd)          — расставить объекты на карте
//   goal(G)                     — строка цели для HUD
//   touch(G, player, obj)       — игрок подошёл к объекту (вернуть true, если объект обработан)
//   use(G, client, obj)         — игрок нажал E на объекте (вернуть true, если обработан)
//   tick(G, players, dt)        — вызывается каждый тик (вернуть true, если цели изменились)
// Чтобы добавить головоломку: опишите её здесь и укажите имя в LEVELS[i].puzzles (shared/map.js).
const BR = require('../shared/map.js');
const { TILE, N } = BR;
const { broadcast, log } = require('./clients');

const LATCH = 22;            // сколько секунд держится нажатая плита
const PICK_DIST = 2.0;       // дистанция автоподбора предметов
const DIGIT_DIST = 3.6;      // с какого расстояния «читается» цифра на стене
const LEVER_COLORS = [
  { name: 'КРАСНЫЙ', riddle: 'цвет тревоги и аварийной сирены' },
  { name: 'СИНИЙ', riddle: 'цвет воды, в которой вы тонете' },
  { name: 'ЗЕЛЁНЫЙ', riddle: 'цвет таблички «ВЫХОД»' },
  { name: 'ЖЁЛТЫЙ', riddle: 'цвет стен, с которых всё началось' },
];

// Изменить объект и разослать изменение всем
function patch(o, p) { Object.assign(o, p); broadcast({ t: 'obj', id: o.id, p }); }

const PUZZLES = {
  // Предохранители: собрать и вставить в щиток
  fuses: {
    init: (cfg) => ({ need: cfg.fuses || 0, inserted: 0, held: 0, solved: false }),
    setup(G, add, rnd) {
      const maxD = G.map.maxDist;
      BR.pickSpots(G.map, rnd, G.cfg.fuses, { minDist: 0.25 * maxD, minSep: 6 }).forEach((p) => add('fuse', { x: p.x, z: p.z }));
      const b = BR.pickSpots(G.map, rnd, 1, { minDist: 0.15 * maxD, maxDist: 0.65 * maxD })[0];
      add('box', { x: b.x, z: b.z });
    },
    goal: (G) => {
      const f = G.pz.fuses;
      return `Предохранители: ${f.inserted}/${f.need}` + (f.held ? ` (в руках: ${f.held})` : '') + (f.solved ? ' ✔' : '');
    },
    touch(G, p, o) {
      if (o.kind !== 'fuse' || Math.hypot(o.x - p.x, o.z - p.z) >= PICK_DIST) return false;
      removeObj(G, o);
      G.pz.fuses.held++;
      broadcast({ t: 'pick', id: o.id, kind: 'fuse', by: p.name });
      return true;
    },
    use(G, c, o) {
      if (o.kind !== 'box') return false;
      const f = G.pz.fuses;
      if (f.solved) return true;
      if (!f.held) { c.send({ t: 'ev', text: 'Щиток обесточен. Нужны предохранители.' }); return true; }
      f.inserted += f.held; f.held = 0;
      broadcast({ t: 'ev', text: `${c.name} вставил предохранители (${f.inserted}/${f.need})` });
      broadcast({ t: 'sfx', name: 'zap' });
      if (f.inserted >= f.need) { f.solved = true; broadcast({ t: 'ev', text: 'Питание восстановлено!' }); }
      sendGoals(G); checkSolved(G);
      return true;
    },
  },

  // Код из 4 цифр на стенах, вводится на терминале у выхода
  code: {
    init: () => ({ digits: [], found: [null, null, null, null], solved: false }),
    setup(G, add, rnd) {
      const digits = [];
      for (let i = 0; i < 4; i++) digits.push(1 + Math.floor(rnd() * 9));
      G.pz.code.digits = digits;
      BR.pickWallSpots(G.map, rnd, 4, { minDist: 0.2 * G.map.maxDist, minSep: 7 })
        .forEach((p, i) => add('digit', { x: p.x, z: p.z, nx: p.nx, nz: p.nz, idx: i, digit: digits[i] }));
      add('keypad', { x: G.map.exit.fx, z: G.map.exit.fz });
    },
    goal: (G) => 'Код: ' + G.pz.code.found.map((d) => (d == null ? '_' : d)).join(' ') + (G.pz.code.solved ? ' ✔' : ''),
    touch(G, p, o) {
      if (o.kind !== 'digit' || G.pz.code.found[o.idx] != null || Math.hypot(o.x - p.x, o.z - p.z) >= DIGIT_DIST) return false;
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
      const a = BR.pickSpots(map, rnd, 1, { minDist: 0.3 * map.maxDist })[0];
      const da = BR.bfs(map.g, a.tile % N, (a.tile / N) | 0);
      let cand = map.floors.filter((i) => da[i] >= 9 && da[i] <= 16 && map.dist[i] >= 0.2 * map.maxDist);
      if (!cand.length) cand = map.floors.filter((i) => da[i] >= 6 && da[i] <= 18);
      const bi = cand[Math.floor(rnd() * cand.length)];
      add('plate', { x: a.x, z: a.z, on: false, hold: 0 });
      add('plate', { x: ((bi % N) + 0.5) * TILE, z: (((bi / N) | 0) + 0.5) * TILE, on: false, hold: 0 });
    },
    goal: (G) => `Плиты нажаты: ${G.objs.filter((o) => o.kind === 'plate' && o.on).length}/2` + (G.pz.plates.solved ? ' ✔' : ''),
    tick(G, players, dt) {
      if (G.pz.plates.solved) return false;
      let changed = false;
      const plates = G.objs.filter((o) => o.kind === 'plate');
      for (const pl of plates) {
        const pressed = players.some((p) => Math.hypot(pl.x - p.x, pl.z - p.z) < 1.5);
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
      BR.pickSpots(G.map, rnd, 4, { minDist: 0.25 * maxD, minSep: 7 }).forEach((p, i) => add('lever', { x: p.x, z: p.z, col: i, on: false }));
      const n = BR.pickWallSpots(G.map, rnd, 1, { minDist: 0.1 * maxD, maxDist: 0.5 * maxD })[0];
      add('note', { x: n.x, z: n.z, nx: n.nx, nz: n.nz });
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
        alarm(G, c.x, c.z);
      }
      sendGoals(G); checkSolved(G);
      return true;
    },
  },
};

function removeObj(G, o) {
  const i = G.objs.indexOf(o);
  if (i >= 0) G.objs.splice(i, 1);
}

function goalLines(G) {
  const L = G.cfg.puzzles.map((p) => PUZZLES[p].goal(G));
  L.push(G.doorOpen ? 'ВЫХОД ОТКРЫТ — бегом к двери!' : 'Выход: заблокирован');
  return L;
}
const sendGoals = (G) => broadcast({ t: 'goal', lines: goalLines(G), held: G.pz.fuses.held });

// Все головоломки решены → открыть выход
function checkSolved(G) {
  if (G.doorOpen) return;
  if (!G.cfg.puzzles.every((p) => G.pz[p].solved)) return;
  G.doorOpen = true;
  BR.setDoor(G.map, true);
  patch(G.door, { open: true });
  broadcast({ t: 'ev', text: 'Дверь выхода открыта!' });
  log('дверь выхода открыта');
}

// Сирена: все существа идут к точке шума
function alarm(G, x, z) {
  for (const m of G.mobs) { m.alert = { x, z, t: 15 }; if (m.stun > 1) m.stun = 1; }
  broadcast({ t: 'alarm' });
}

// Ввод кода на терминале (отдельное сообщение 'code')
function enterCode(G, c, value) {
  const kp = G.objs.find((q) => q.kind === 'keypad');
  if (!kp || G.pz.code.solved || Math.hypot(kp.x - c.x, kp.z - c.z) > 4.5) return;
  if (String(value || '') === G.pz.code.digits.join('')) {
    G.pz.code.solved = true;
    c.send({ t: 'codeok' });
    broadcast({ t: 'ev', text: `${c.name} ввёл верный код!` });
    broadcast({ t: 'sfx', name: 'beep' });
    sendGoals(G); checkSolved(G);
  } else {
    c.send({ t: 'codebad' });
    broadcast({ t: 'ev', text: `Неверный код! Сработала сигнализация (${c.name})` });
    alarm(G, c.x, c.z);
  }
}

module.exports = { PUZZLES, patch, removeObj, goalLines, sendGoals, checkSolved, enterCode, PICK_DIST };
