'use strict';
// ИИ существ: блуждание, погоня по графу навигации (лестницы, провалы, этажи), реакция на сирену.
// Существа двигаются той же физикой, что и игроки (shared/world.js), поэтому не проходят сквозь стены
// и не застревают на лестницах.
const BR = require('../shared/map.js');

const BASE_SPEED = 4.2;      // скорость погони, умножается на mobSpeed уровня
const WANDER_SPEED = 2.1;
const SEE_NEAR = 9;          // на таком расстоянии замечает всегда (слышит)
const SEE_FAR = 28;          // дальность зрения по прямой видимости
const SEE_FAR_TORCH = 38;    // дальность, если у игрока включён фонарик
const LOSE_DIST = 45, LOSE_TIME = 6;
const REPATH = 0.3;          // как часто пересчитывать поле расстояний, с
const EYE = 2.2;             // высота глаз существа

function newMob(map, x, y, z, stun, type = 'stalker') {
  return { type, x, y, z, r: 0, body: BR.makeBody(x, y, z), mode: 'wander', stun, lost: 0, wp: -1, repath: 0, field: null, fieldGoal: -1, alert: null, node: BR.nodeAt(map, x, y + 0.1, z) };
}

/* --------------------------- Утопленник --------------------------- */
// Живёт только в глубокой воде: двигается по графу узлов, где глубина больше DROWN_DEPTH.
// Чувствует тех, кто плывёт или идёт по воде; на сушу не выходит. Нет воды — затаивается.
const DROWN_DEPTH = 1.0, DROWN_SPEED = 3.4, DROWN_RAGE = 4.6, DROWN_SENSE = 26;

function waterGraph(G) {
  const map = G.map;
  BR.ensureNav(map);
  const ver = `${map.navStamp}:${map.waterVer || 0}`;
  if (G.wg && G.wg.ver === ver) return G.wg;
  const ok = new Uint8Array(map.nav.total);
  for (let n = 0; n < map.nav.total; n++) {
    if (!map.nav.out[n]) continue;
    const f = Math.floor(n / BR.NN), i = n % BR.NN;
    if (map.wz[i] >= 0 && BR.waterDepth(map, f, i) > DROWN_DEPTH) ok[n] = 1;
  }
  const out = new Array(map.nav.total), inn = new Array(map.nav.total);
  for (let n = 0; n < map.nav.total; n++) {
    if (!ok[n]) continue;
    out[n] = map.nav.out[n].filter((m) => ok[m]);
    for (const m of out[n]) (inn[m] || (inn[m] = [])).push(n);
  }
  G.wg = { ver, ok, nav: { out, inn, total: map.nav.total } };
  return G.wg;
}

// Игрок в воде (плывёт или идёт по ней)
function inWater(G, p) { return BR.waterAt(G.map, p.x, p.z, p.y) > p.y + 0.3; }

function updateDrowner(G, m, dt, players) {
  const wg = waterGraph(G);
  const map = G.map;
  if (m.node < 0 || !wg.ok[m.node]) {
    // вода ушла — затаиться в ближайшей глубокой воде (или исчезнуть до возвращения воды)
    let any = -1;
    for (let n = 0; n < wg.ok.length; n++) if (wg.ok[n]) { any = n; break; }
    if (any < 0) { m.hidden = true; return; }
    const p = BR.nodePos(map, any);
    m.node = any; m.x = p.x; m.z = p.z;
  }
  m.hidden = false;
  if (m.stun > 0) { m.stun -= dt; return; }
  // цель: ближайший игрок в воде, которого можно «почувствовать»
  let target = null, bd = DROWN_SENSE;
  for (const p of players) {
    if (!inWater(G, p)) continue;
    const d = Math.hypot(p.x - m.x, p.z - m.z, (p.y - m.y) * 0.5);
    if (d < bd) { bd = d; target = p; }
  }
  let goal = -1;
  if (target) {
    m.mode = 'chase';
    const tn = BR.nodeAt(map, target.x, target.y + 0.1, target.z);
    goal = tn >= 0 && wg.ok[tn] ? tn : -1;
  } else m.mode = 'wander';
  if (goal < 0) {
    if (m.wp < 0 || !wg.ok[m.wp] || m.wp === m.node) {
      const cand = [];
      for (const n of wg.nav.out[m.node] || []) cand.push(n);
      let n = m.node;
      for (let k = 0; k < 6 && wg.nav.out[n] && wg.nav.out[n].length; k++) n = wg.nav.out[n][Math.floor(Math.random() * wg.nav.out[n].length)];
      m.wp = n;
    }
    goal = m.wp;
  }
  if (!m.field || m.fieldGoal !== goal || m.fieldVer !== wg.ver || (m.repath -= dt) <= 0) {
    m.field = BR.bfsNav(wg.nav, goal, true); m.fieldGoal = goal; m.fieldVer = wg.ver; m.repath = REPATH;
  }
  let next = m.node;
  if (m.node !== goal && m.field[m.node] > 0) {
    let bdist = m.field[m.node];
    for (const n of wg.nav.out[m.node]) if (m.field[n] >= 0 && m.field[n] < bdist) { bdist = m.field[n]; next = n; }
  }
  const p = next === goal && target ? target : BR.nodePos(map, next);
  const speed = (m.rage ? DROWN_RAGE : DROWN_SPEED) * (target ? 1 : 0.5);
  const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
  if (d > 0.05) { const s = Math.min(d, speed * dt); m.x += (dx / d) * s; m.z += (dz / d) * s; m.r = Math.atan2(dx, dz); }
  const here = BR.nodeAt(map, m.x, m.y + 0.5, m.z);
  if (here >= 0 && wg.ok[here]) m.node = here;
  // держится под поверхностью; рядом с жертвой — всплывает
  const wl = BR.waterAt(map, m.x, m.z, BR.nodePos(map, m.node).y);
  const ty = wl - (target && bd < 6 ? 1.2 : 2.2);
  m.y += (ty - m.y) * Math.min(1, dt * 3);
}

const dist3 = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 1.5, a.z - b.z);

// Случайная достижимая точка, по возможности подальше от (x, y, z)
function randomFloorFar(G, from, samples = 40) {
  const sp = G.map.spots;
  let best = null, bd = -1;
  for (let i = 0; i < samples; i++) {
    const p = BR.nodePos(G.map, sp[Math.floor(Math.random() * sp.length)]);
    const d = dist3(p, from);
    if (d > bd) { bd = d; best = p; }
  }
  return best;
}

// Узел для блуждания: склоняемся к случайному игроку, чтобы существо не уходило в пустые углы
function pickWander(G, players) {
  const sp = G.map.spots;
  const target = players.length ? players[Math.floor(Math.random() * players.length)] : null;
  let best = -1, bd = 1e9;
  for (let i = 0; i < 8; i++) {
    const n = sp[Math.floor(Math.random() * sp.length)];
    const d = target ? dist3(BR.nodePos(G.map, n), target) : Math.random();
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

// Шаг к узлу goal по полю расстояний графа существ
function mobMove(G, m, dt, goal, speed, exact) {
  const map = G.map;
  BR.ensureNav(map);
  const nav = map.navMob;
  m.repath -= dt;
  if (!m.field || m.fieldGoal !== goal || m.repath <= 0 || map.navStamp !== m.navStamp) {
    m.field = BR.bfsNav(nav, goal, true);
    m.fieldGoal = goal; m.repath = REPATH; m.navStamp = map.navStamp;
  }
  const cur = BR.nodeAt(map, m.body.x, m.body.y, m.body.z);
  if (cur >= 0 && nav.out[cur]) m.node = cur;
  let next = -1;
  if (m.node === goal) next = goal;
  else if (m.node >= 0 && m.field[m.node] > 0) {
    let bd = m.field[m.node];
    for (const n of nav.out[m.node]) if (m.field[n] >= 0 && m.field[n] < bd) { bd = m.field[n]; next = n; }
  }
  let inp;
  if (next < 0) inp = { vx: 0, vz: 0 };
  else if (next === goal && exact && m.node === goal) {
    const dx = exact.x - m.body.x, dz = exact.z - m.body.z, d = Math.hypot(dx, dz);
    inp = d > 0.05 ? { vx: (dx / d) * Math.min(speed, d * 6), vz: (dz / d) * Math.min(speed, d * 6) } : { vx: 0, vz: 0 };
  } else inp = BR.steerInput(map, m.body, next, speed);
  const b = m.body;
  if (!b.onGround && b.ladder < 0 && !b.swim && m.lastInp) inp = m.lastInp; // в полёте не развернуться
  m.lastInp = inp;
  BR.moveBody(map, b, inp, dt);
  if (Math.hypot(inp.vx, inp.vz) > 0.1) m.r = Math.atan2(inp.vx, inp.vz);
  m.x = m.body.x; m.y = m.body.y; m.z = m.body.z;
}

function canSee(G, m, p) {
  return BR.los3(G.map, m.x, m.y + EYE, m.z, p.x, p.y + 1.5, p.z);
}

function updateMob(G, m, dt, players) {
  if (m.type === 'drowner') { updateDrowner(G, m, dt, players); return; }
  if (m.stun > 0) { m.stun -= dt; return; }
  const speed = BASE_SPEED * G.cfg.mobSpeed * (G.mobMul || 1) * (m.boss ? 1.5 : 1);
  let best = null, bd = 1e9;
  for (const p of players) {
    if (p.node < 0) continue;
    const d = dist3(p, m);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) {
    const sees = G.cfg.chase || bd < SEE_NEAR || (bd < (best.fl ? SEE_FAR_TORCH : SEE_FAR) && canSee(G, m, best));
    if (sees) { m.mode = 'chase'; m.lost = 0; m.alert = null; }
    else if (m.mode === 'chase') {
      m.lost += dt;
      if (bd > LOSE_DIST || m.lost > LOSE_TIME) { m.mode = 'wander'; m.wp = -1; }
    }
  } else m.mode = 'wander';

  if (m.mode === 'chase' && best) { mobMove(G, m, dt, best.node, speed, best); return; }
  if (m.alert) {
    m.alert.t -= dt;
    if (m.alert.t <= 0 || m.node === m.alert.node) m.alert = null;
    else { mobMove(G, m, dt, m.alert.node, speed * 0.95); return; }
  }
  if (m.wp < 0 || m.node === m.wp) m.wp = pickWander(G, players);
  mobMove(G, m, dt, m.wp, WANDER_SPEED);
}

module.exports = { newMob, updateMob, mobMove, randomFloorFar, dist3, inWater };
