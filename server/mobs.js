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

function newMob(map, x, y, z, stun) {
  return { x, y, z, r: 0, body: BR.makeBody(x, y, z), mode: 'wander', stun, lost: 0, wp: -1, repath: 0, field: null, fieldGoal: -1, alert: null, node: -1 };
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
  if (m.stun > 0) { m.stun -= dt; return; }
  const speed = BASE_SPEED * G.cfg.mobSpeed;
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

module.exports = { newMob, updateMob, mobMove, randomFloorFar, dist3 };
