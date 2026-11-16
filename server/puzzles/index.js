'use strict';
// Головоломки. Каждая описана объектом с хуками:
//   init(cfg)                   — начальное состояние G.pz[имя]
//   setup(G, add, rnd)          — расставить объекты на карте
//   goal(G)                     — строка цели для HUD
//   touch(G, player, obj)       — игрок подошёл к объекту (вернуть true, если объект обработан)
//   use(G, client, obj)         — игрок нажал E на объекте (вернуть true, если обработан)
//   tick(G, players, dt)        — вызывается каждый тик (вернуть true, если цели изменились)
//   hint(G)                     — куда подсветить путь застрявшим (объект с x, y, z) — необязательно
// Чтобы добавить головоломку: опишите её в одном из файлов этой папки, подключите ниже
// и укажите имя в LEVELS[i].puzzles (shared/map.js).
const U = require('./util');
const { BR, broadcast, near, patch, alarm, event } = U;
const { log } = require('../clients');

const PUZZLES = Object.assign({},
  require('./classic'), require('./parking'), require('./pools'), require('./tunnels'), require('./hospital'), require('./offices'),
  require('./hotel'), require('./mall'));

const FINALE_MUL = 1.15;     // после открытия выхода существа быстрее
const HINT_AFTER = 300;      // через столько секунд без прогресса — подсказка
const HINT_AGAIN = 120;

function goalLines(G) {
  const L = G.cfg.puzzles.map((p) => PUZZLES[p].goal(G)).filter(Boolean);
  L.push(G.doorOpen ? 'ВЫХОД ОТКРЫТ — бегом к двери!' : 'Выход: заблокирован');
  return L;
}
function sendGoals(G) {
  G.progressT = 0; // прогресс есть — подсказка откладывается
  broadcast({ t: 'goal', lines: goalLines(G), held: G.pz.fuses.held });
}

// Все головоломки решены → открыть выход и начать финальный побег
function checkSolved(G) {
  if (G.doorOpen) return;
  if (!G.cfg.puzzles.every((p) => G.pz[p].solved)) return;
  G.doorOpen = true;
  BR.setDoor(G.map, true);
  patch(G.door, { open: true });
  broadcast({ t: 'ev', text: 'Дверь выхода открыта!' });
  log('дверь выхода открыта');
  if (!G.cfg.chase) {
    // финал: существа чуют, что вы уходите, и бросаются к двери
    G.finaleMul = FINALE_MUL;
    const node = G.map.exit.frontNode;
    for (const m of G.mobs) if (m.type !== 'drowner') { m.alert = { node, t: 20 }; if (m.stun > 1) m.stun = 1; }
    event(G, 'finale');
  }
}
U.hooks.sendGoals = sendGoals;
U.hooks.checkSolved = checkSolved;

// Ввод кода на терминале (отдельное сообщение 'code')
function enterCode(G, c, value) {
  const kp = G.objs.find((q) => q.kind === 'keypad');
  if (!kp || G.pz.code.solved || !near(kp, c, 4.5)) return;
  if (G.cfg.codeNeeds && !G.pz[G.cfg.codeNeeds].powered) { c.send({ t: 'codebad', off: true }); c.send({ t: 'ev', text: 'Терминал обесточен: сначала запустите генератор.' }); return; }
  if (G.cfg.codeNeedsFuses && !G.pz.fuses.solved) { c.send({ t: 'codebad', off: true }); c.send({ t: 'ev', text: 'Терминал обесточен: сначала верните питание щитку.' }); return; }
  if (G.cfg.codePower && !U.anyOn(G, 'gen')) { c.send({ t: 'codebad', off: true }); c.send({ t: 'ev', text: 'Терминал обесточен: запустите генератор (держите его или бегом сюда, пока он работает).' }); return; }
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

/* ----------------- Общие объекты, которые есть на разных уровнях ----------------- */
const CCTV_TIME = 15;
const hooks = { teleport: null };

function useCommon(G, c, o) {
  if (o.kind === 'switch') return U.useSwitch(G, c, o);
  if (o.kind === 'lift') {
    // лифт: следующий этаж вверх (с верхнего — на нижний)
    const cab = G.objs.filter((q) => q.kind === 'lift' && q.shaft === o.shaft).sort((a, b) => a.f - b.f);
    if (o.broken) { c.send({ t: 'ev', text: 'Лифт не работает: кнопки не горят.' }); return true; }
    let next = cab.find((q) => q.f > o.f && !q.broken) || cab.find((q) => !q.broken && q !== o);
    if (!next) return true;
    // «Бесконечный отель»: в первую поездку этажи переставляются — лифт привозит не туда
    if (G.pz.hotel && G.pz.hotel.prank) {
      G.pz.hotel.prank = false;
      const wrong = cab.filter((q) => q !== o && q !== next);
      if (wrong.length) {
        next = wrong[Math.floor(Math.random() * wrong.length)];
        c.send({ t: 'event', k: 'glitch', dur: 2 });
        broadcast({ t: 'ev', text: `${c.name} уехал на лифте… но лифт остановился не там. Этажи переставились.` });
      }
    }
    broadcast({ t: 'sfx', name: 'lift', x: o.x, y: o.y, z: o.z });
    hooks.teleport(G, c, { x: next.x, y: next.y, z: next.z }, 'lift');
    c.send({ t: 'ev', text: `Лифт: ${(G.cfg.floorNames && G.cfg.floorNames[next.f]) || 'этаж ' + (next.f + 1)}` });
    return true;
  }
  if (o.kind === 'radio') {
    const lines = G.cfg.radio || ['…шшш…'];
    G.radioK = ((G.radioK == null ? -1 : G.radioK) + 1) % lines.length;
    c.send({ t: 'note', title: 'Рация охраны', text: lines[G.radioK], radio: true });
    broadcast({ t: 'sfx', name: 'radio', x: o.x, y: o.y, z: o.z });
    return true;
  }
  if (o.kind === 'monitor') {
    // камеры наблюдения: этот игрок видит существ на миникарте; на парковке камера ещё и «ловит» одну цифру
    c.send({ t: 'cctv', dur: CCTV_TIME });
    c.send({ t: 'ev', text: `Камеры наблюдения: существа видны на миникарте ${CCTV_TIME} с` });
    if (G.cfg.cctvDigits && G.pz.code && !G.pz.code.solved) {
      const d = G.objs.find((q) => q.kind === 'digit' && G.pz.code.found[q.idx] == null);
      if (d) broadcast({ t: 'mark', x: d.x + d.nx, y: d.y, z: d.z + d.nz, by: 'Камера', kind: 'item' });
    }
    return true;
  }
  return false;
}

function tickCommon(G, players, dt) {
  const changed = U.tickSwitches(G, players, dt);
  // подсказка застрявшим: долго нет прогресса — подсветить место следующего шага
  if (G.cfg.puzzles.length && !G.doorOpen) {
    G.progressT = (G.progressT || 0) + dt;
    if (G.progressT > HINT_AFTER) {
      G.progressT = HINT_AFTER - HINT_AGAIN;
      const pos = hintPos(G);
      if (pos) { broadcast({ t: 'mark', x: pos.x, y: pos.y, z: pos.z, by: 'Закулисье', kind: 'hint' }); broadcast({ t: 'ev', text: 'Вам что-то подсказывает… (метка на карте)' }); }
    }
  }
  return changed;
}
function hintPos(G) {
  for (const name of G.cfg.puzzles) {
    const P = PUZZLES[name];
    if (G.pz[name].solved) continue;
    if (P.hint) { const h = P.hint(G); if (h) return h; }
  }
  const kinds = ['fuse', 'box', 'digit', 'keypad', 'switch', 'plate', 'valve', 'steamvalve'];
  return G.objs.find((o) => kinds.includes(o.kind) && !(o.kind === 'digit' && G.pz.code.found[o.idx] != null)) || null;
}

module.exports = {
  PUZZLES, goalLines, sendGoals, checkSolved, enterCode, useCommon, tickCommon, hooks,
  alarm, patch: U.patch, removeObj: U.removeObj, near, tickWater: U.tickWater, setCellNet: U.setCellNet,
  animateWater: U.animateWater, PICK_DIST: U.PICK_DIST, event,
};
