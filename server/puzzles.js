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
const { broadcast, log } = require('./clients');

const LATCH = 22;            // сколько секунд держится нажатая плита
const PICK_DIST = 2.0;       // дистанция автоподбора предметов
const DIGIT_DIST = 3.6;      // с какого расстояния «читается» цифра на стене
const GATE_LATCH = 7;        // шлюз держится открытым после того, как с задвижки сошли
const LEVER_COLORS = [
  { name: 'КРАСНЫЙ', riddle: 'цвет тревоги и аварийной сирены' },
  { name: 'СИНИЙ', riddle: 'цвет воды, в которой вы тонете' },
  { name: 'ЗЕЛЁНЫЙ', riddle: 'цвет таблички «ВЫХОД»' },
  { name: 'ЖЁЛТЫЙ', riddle: 'цвет стен, с которых всё началось' },
];

// Рядом ли игрок с объектом: по горизонтали ближе r и на том же уровне по высоте
const near = (o, p, r) => Math.hypot(o.x - p.x, o.z - p.z) < r && Math.abs((o.y || 0) - p.y) < 1.8;

// Изменить объект и разослать изменение всем
function patch(o, p) { Object.assign(o, p); broadcast({ t: 'obj', id: o.id, p }); }

const PUZZLES = {
  // Предохранители: собрать и вставить в щиток
  fuses: {
    init: (cfg) => ({ need: cfg.fuses || 0, inserted: 0, held: 0, solved: false }),
    setup(G, add, rnd) {
      const maxD = G.map.maxDist;
      BR.pickSpots(G.map, rnd, G.cfg.fuses, { minDist: 0.25 * maxD, minSep: 6 }).forEach((p) => add('fuse', { x: p.x, y: p.y, z: p.z }));
      const b = BR.pickSpots(G.map, rnd, 1, { minDist: 0.15 * maxD, maxDist: 0.65 * maxD })[0];
      add('box', { x: b.x, y: b.y, z: b.z });
    },
    goal: (G) => {
      const f = G.pz.fuses;
      return `Предохранители: ${f.inserted}/${f.need}` + (f.held ? ` (в руках: ${f.held})` : '') + (f.solved ? ' ✔' : '');
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
        .forEach((p, i) => add('digit', { x: p.x, y: p.y, z: p.z, nx: p.nx, nz: p.nz, idx: i, digit: digits[i] }));
      add('keypad', { x: G.map.exit.fx, y: G.map.exit.y, z: G.map.exit.fz });
    },
    goal: (G) => 'Код: ' + G.pz.code.found.map((d) => (d == null ? '_' : d)).join(' ') + (G.pz.code.solved ? ' ✔' : ''),
    touch(G, p, o) {
      if (o.kind !== 'digit' || G.pz.code.found[o.idx] != null || !near(o, p, DIGIT_DIST)) return false;
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

  // «Бассейны»: 1) вентили + слив атриума; 2) задвижка шлюза на дне → ключ-карта; 3) насос поднимает воду к выходу
  pools: {
    init: () => ({ stage: 0, card: false, solved: false, targets: [], gateHold: 0, gateOpen: false, prFlood: 0 }),
    setup(G, add, rnd) {
      const map = G.map, P = map.pools, pz = G.pz.pools, FH = map.FH;
      const cell = (f, i, extra = {}) => Object.assign({ x: BR.centerX(i), y: f * FH, z: BR.centerZ(i) }, extra);
      pz.targets = [0, 1, 2].map(() => 1 + Math.floor(rnd() * 3));
      const room = P.pumpRoom, w = 6; // насосная 6×6
      [1, 3, 5].forEach((cx, k) => add('valve', cell(0, room[w + cx], { col: k, val: 0 })));
      add('drain', cell(0, room[4 * w + 2]));
      const dots = (n) => '●'.repeat(n) + '○'.repeat(3 - n);
      add('paper', cell(0, room[4 * w + 4], {
        title: 'Таблица давления (насосная)',
        text: `Слив атриума. Выставить давление:\n\nКРАСНЫЙ  ${dots(pz.targets[0])}\nСИНИЙ    ${dots(pz.targets[1])}\nЖЁЛТЫЙ   ${dots(pz.targets[2])}\n\nПотом — рычаг слива. Каждый поворот вентиля = +1 деление (после третьего — сброс на ноль).`,
      }));
      add('gateplate', cell(0, P.plate, { on: false }));
      add('keycard', cell(0, P.key));
      add('pump', cell(1, P.pump));
    },
    goal(G) {
      const pz = G.pz.pools;
      if (pz.stage === 0) return 'Насосная (этаж −1): выставьте вентили по таблице и дёрните слив';
      if (pz.stage === 1) return 'Шлюз на дне бассейна: держите задвижку, найдите ключ-карту' + (pz.gateOpen ? ' · ШЛЮЗ ОТКРЫТ' : '');
      if (pz.stage === 2) return 'Ключ-карта ✔ — запустите насос на палубе атриума';
      return 'Насос запущен ✔ — вода поднимается, плывите к выходу наверх!';
    },
    touch(G, p, o) {
      if (o.kind !== 'keycard' || !near(o, p, PICK_DIST)) return false;
      const pz = G.pz.pools;
      removeObj(G, o);
      pz.card = true; pz.stage = Math.max(pz.stage, 2);
      broadcast({ t: 'pick', id: o.id, kind: 'keycard', by: p.name });
      broadcast({ t: 'ev', text: `${p.name} нашёл ключ-карту! Люк в отсеке открылся.` });
      setCellNet(G, 1, G.map.pools.hatch, BR.T.HOLE);
      return true;
    },
    use(G, c, o) {
      const pz = G.pz.pools, P = G.map.pools;
      if (o.kind === 'valve') {
        if (pz.stage > 0) return true;
        patch(o, { val: (o.val + 1) % 4 });
        broadcast({ t: 'sfx', name: 'valve' });
        return true;
      }
      if (o.kind === 'drain') {
        if (pz.stage > 0) return true;
        const valves = G.objs.filter((q) => q.kind === 'valve').sort((a, b) => a.col - b.col);
        if (valves.every((v, k) => v.val === pz.targets[k])) {
          pz.stage = 1;
          animateWater(G, P.atrZone, P.low, 14);
          broadcast({ t: 'ev', text: `${c.name} открыл слив. Вода уходит из атриума…` });
          broadcast({ t: 'sfx', name: 'drain' });
        } else {
          broadcast({ t: 'ev', text: 'Неверное давление! Аварийный выброс в насосную — СИРЕНА!' });
          animateWater(G, P.prZone, 0.9, 3);
          pz.prFlood = 20;
          alarm(G, c.x, c.y, c.z);
        }
        sendGoals(G);
        return true;
      }
      if (o.kind === 'pump') {
        if (pz.stage < 2) { c.send({ t: 'ev', text: 'Пульт насоса заблокирован. Нужна ключ-карта.' }); return true; }
        if (pz.stage >= 3) return true;
        pz.stage = 3; pz.solved = true;
        animateWater(G, P.atrZone, P.high, 45);
        broadcast({ t: 'ev', text: `${c.name} запустил насос! Вода поднимается — к выходу наверх!` });
        broadcast({ t: 'sfx', name: 'pump' });
        alarm(G, o.x, o.y, o.z);
        for (const m of G.mobs) if (m.type === 'drowner') { m.stun = 0; m.rage = true; }
        sendGoals(G); checkSolved(G);
        return true;
      }
      return false;
    },
    tick(G, players, dt) {
      const pz = G.pz.pools, P = G.map.pools, map = G.map;
      let changed = false;
      // затопление насосной после ошибки уходит само
      if (pz.prFlood > 0) { pz.prFlood -= dt; if (pz.prFlood <= 0) animateWater(G, P.prZone, -1, 6); }
      // задвижка шлюза: держится, пока на плите стоят, и ещё GATE_LATCH секунд
      if (pz.stage >= 1 && map.wl[P.atrZone] < 0.5) {
        const plate = G.objs.find((o) => o.kind === 'gateplate');
        const pressed = players.some((p) => near(plate, p, 1.5));
        pz.gateHold = pressed ? GATE_LATCH : Math.max(0, pz.gateHold - dt);
        if (pressed !== plate.on) patch(plate, { on: pressed });
        const gx = BR.centerX(P.gate), gz = BR.centerZ(P.gate);
        const inGate = players.some((p) => Math.abs(p.x - gx) < 2.4 && Math.abs(p.z - gz) < 2.4 && p.y < 2);
        const open = pz.gateHold > 0 || (pz.gateOpen && inGate); // не захлопываем на игроке
        if (open !== pz.gateOpen) {
          pz.gateOpen = open; changed = true;
          setCellNet(G, 0, P.gate, open ? BR.T.FLOOR : BR.T.WALL);
          broadcast({ t: 'sfx', name: open ? 'door' : 'clang' });
        }
      }
      return changed;
    },
  },
};

// Изменение геометрии во время игры: меняем клетку у себя и рассылаем клиентам
function setCellNet(G, f, i, type, aux = 0) {
  BR.setCell(G.map, f, i, type, aux);
  broadcast({ t: 'cell', f, i, type, aux });
}

// Плавное изменение уровня воды зоны (тикает в tickWater)
function animateWater(G, zone, to, dur) {
  G.wanim = (G.wanim || []).filter((a) => a.zone !== zone);
  G.wanim.push({ zone, from: G.map.wl[zone], to, t: 0, dur });
}
function tickWater(G, dt) {
  if (!G.wanim || !G.wanim.length) return;
  for (const a of G.wanim) {
    a.t = Math.min(a.dur, a.t + dt);
    const k = a.t / a.dur, e = k * k * (3 - 2 * k);
    G.map.wl[a.zone] = a.from + (a.to - a.from) * e;
  }
  G.wanim = G.wanim.filter((a) => a.t < a.dur);
  G.waterSend = (G.waterSend || 0) - dt;
  if (G.waterSend <= 0 || !G.wanim.length) {
    G.waterSend = 0.2;
    broadcast({ t: 'water', wl: G.map.wl.map((v) => +v.toFixed(3)) });
  }
  G.navWater = (G.navWater || 0) - dt;
  if (G.navWater <= 0 || !G.wanim.length) { G.navWater = 1; G.map.navDirty = true; G.map.waterVer = (G.map.waterVer || 0) + 1; }
}

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
function alarm(G, x, y, z) {
  const node = BR.nodeAt(G.map, x, y, z);
  if (node < 0) return;
  for (const m of G.mobs) { m.alert = { node, t: 15 }; if (m.stun > 1) m.stun = 1; }
  broadcast({ t: 'alarm' });
}

// Ввод кода на терминале (отдельное сообщение 'code')
function enterCode(G, c, value) {
  const kp = G.objs.find((q) => q.kind === 'keypad');
  if (!kp || G.pz.code.solved || !near(kp, c, 4.5)) return;
  if (String(value || '') === G.pz.code.digits.join('')) {
    G.pz.code.solved = true;
    c.send({ t: 'codeok' });
    broadcast({ t: 'ev', text: `${c.name} ввёл верный код!` });
    broadcast({ t: 'sfx', name: 'beep' });
    sendGoals(G); checkSolved(G);
  } else {
    c.send({ t: 'codebad' });
    broadcast({ t: 'ev', text: `Неверный код! Сработала сигнализация (${c.name})` });
    alarm(G, c.x, c.y, c.z);
  }
}

module.exports = { alarm, PUZZLES, patch, removeObj, goalLines, sendGoals, checkSolved, enterCode, near, tickWater, setCellNet, animateWater, PICK_DIST };
