'use strict';
// Общие помощники головоломок: изменение объектов и клеток по сети, вода, сирена,
// «удерживаемые» переключатели и шлюзы, которые открываются, пока переключатель держат.
const BR = require('../../shared/map.js');
const { broadcast } = require('../clients');

const PICK_DIST = 2.0;       // дистанция автоподбора предметов
const PRESS_DIST = 1.5;      // стоять «на» плите / у рубильника
const USE_DIST = 3.6;        // дальность E (как в game.js)

// Рядом ли игрок с объектом: по горизонтали ближе r и на том же уровне по высоте
const near = (o, p, r) => Math.hypot(o.x - p.x, o.z - p.z) < r && Math.abs((o.y || 0) - p.y) < 1.8;

// Изменить объект и разослать изменение всем
function patch(o, p) { Object.assign(o, p); broadcast({ t: 'obj', id: o.id, p }); }

function removeObj(G, o) {
  const i = G.objs.indexOf(o);
  if (i >= 0) G.objs.splice(i, 1);
}

// Изменение геометрии во время игры: меняем клетку у себя и рассылаем клиентам
function setCellNet(G, f, i, type, aux = 0) {
  BR.setCell(G.map, f, i, type, aux);
  broadcast({ t: 'cell', f, i, type, aux });
  // журнал изменений: тот, кто подключится позже, получит их в init (шлюзы, проломы, обрушения)
  const log = G.cellLog || (G.cellLog = []);
  const k = log.findIndex((e) => e.f === f && e.i === i);
  if (k >= 0) log.splice(k, 1);
  log.push({ f, i, type, aux });
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

// Сирена: все существа идут к точке шума
function alarm(G, x, y, z) {
  const node = BR.nodeAt(G.map, x, y, z);
  if (node < 0) return;
  for (const m of G.mobs) { m.alert = { node, t: 15 }; if (m.stun > 1) m.stun = 1; }
  broadcast({ t: 'alarm' });
}

// Событие для клиентов (свет гаснет, тряска, шёпот…): клиент сам решает, как его показать
function event(G, k, extra = {}) { broadcast(Object.assign({ t: 'event', k }, extra)); }

/* ------------------------ Удерживаемые переключатели ------------------------
  Объект kind 'switch' { group, latch, on, pressed }: включён, пока на нём стоят (или держат E),
  и ещё latch секунд после этого. Так задачу «один держит — другой проходит» можно решить и одному:
  нажать и успеть добежать. Клиенту уходят on/pressed/left — он рисует обратный отсчёт. */
function addSwitch(add, pos, group, latch, label, extra = {}) {
  return add('switch', Object.assign({ x: pos.x, y: pos.y, z: pos.z, group, latch, label, on: false, pressed: false, hold: 0 }, extra));
}
function useSwitch(G, c, o) {
  if (o.kind !== 'switch' || o.disabled) return false;
  o.hold = o.latch; o.usedT = 0.6; // E — как короткое нажатие
  return true;
}
function tickSwitches(G, players, dt) {
  let changed = false;
  for (const o of G.objs) {
    if (o.kind !== 'switch') continue;
    if (o.usedT > 0) o.usedT -= dt;
    const pressed = !o.disabled && (o.usedT > 0 || players.some((p) => near(o, p, PRESS_DIST)));
    o.hold = pressed ? o.latch : Math.max(0, o.hold - dt);
    const on = o.hold > 0;
    if (on !== o.on || pressed !== o.pressed) {
      patch(o, { on, pressed, left: +o.hold.toFixed(1) });
      changed = true;
    }
  }
  return changed;
}
const switches = (G, group) => G.objs.filter((o) => o.kind === 'switch' && o.group === group);
const groupOn = (G, group) => { const s = switches(G, group); return s.length > 0 && s.every((o) => o.on); };
const anyOn = (G, group) => switches(G, group).some((o) => o.on);

/* ------------------------------- Шлюзы -------------------------------
  Шлюз — клетки-стены, которые становятся полом, пока открыты. Не захлопывается на игроке или существе. */
function gateBlockedBy(G, gate, bodies) {
  for (const { f, i } of gate.cells) {
    const cx = BR.centerX(i), cz = BR.centerZ(i), y = f * G.map.FH;
    if (bodies.some((p) => Math.abs(p.x - cx) < 2.4 && Math.abs(p.z - cz) < 2.4 && Math.abs(p.y - y) < 2)) return true;
  }
  return false;
}
// Открыть/закрыть шлюз (want — желаемое состояние). Возвращает true, если состояние изменилось.
function setGate(G, gate, want, bodies) {
  if (gate.open === want) return false;
  if (!want && gateBlockedBy(G, gate, bodies)) return false;
  gate.open = want;
  for (const { f, i } of gate.cells) setCellNet(G, f, i, want ? BR.T.FLOOR : BR.T.WALL);
  const c = gate.cells[0];
  broadcast({ t: 'sfx', name: want ? 'door' : 'clang', x: BR.centerX(c.i), y: c.f * G.map.FH, z: BR.centerZ(c.i) });
  return true;
}
const bodiesOf = (G, players) => players.concat(G.mobs.map((m) => ({ x: m.x, y: m.y, z: m.z })));

// Точка в узле графа n (для расстановки объектов)
const at = (G, n) => BR.spotOf(G.map, n);
// Узел «рядом» с узлом a: на графе от dMin до dMax шагов; prefer — фильтр
function nodeNear(G, rnd, a, dMin, dMax, prefer = () => true) {
  const map = G.map;
  const d = BR.bfsNav(BR.ensureNav(map), a);
  let cand = map.spots.filter((n) => d[n] >= dMin && d[n] <= dMax && prefer(n));
  if (!cand.length) cand = map.spots.filter((n) => d[n] >= Math.max(1, dMin - 3) && d[n] <= dMax + 6);
  if (!cand.length) cand = map.spots.filter((n) => d[n] >= 0 && n !== a);
  return cand[Math.floor(rnd() * cand.length)];
}

// Хуки, которые задаёт index.js (иначе получились бы циклические require)
const hooks = { sendGoals: () => {}, checkSolved: () => {}, teleport: () => {}, kill: () => {}, finish: () => {}, addObj: () => {} };
const sendGoals = (G) => hooks.sendGoals(G);
const checkSolved = (G) => hooks.checkSolved(G);

module.exports = {
  BR, PICK_DIST, PRESS_DIST, USE_DIST, near, patch, removeObj, setCellNet, animateWater, tickWater, alarm, event,
  addSwitch, useSwitch, tickSwitches, switches, groupOn, anyOn, setGate, gateBlockedBy, bodiesOf, at, nodeNear,
  hooks, sendGoals, checkSolved, broadcast,
};
