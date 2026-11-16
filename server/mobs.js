'use strict';
// ИИ существ: блуждание, погоня по flow-field (BFS от цели), реакция на сирену.
const BR = require('../shared/map.js');
const { TILE, N } = BR;

const BASE_SPEED = 4.2;      // скорость погони, умножается на mobSpeed уровня
const WANDER_SPEED = 2.1;
const SEE_NEAR = 9;          // на таком расстоянии замечает всегда
const SEE_FAR = 28;          // дальность зрения по прямой видимости
const SEE_FAR_TORCH = 38;    // дальность, если у игрока включён фонарик
const LOSE_DIST = 45, LOSE_TIME = 6;

function newMob(x, z, stun) {
  return { x, z, r: 0, mode: 'wander', stun, lost: 0, wp: null, repath: 0, field: null, fieldGoal: -1, alert: null };
}

const tileCenter = (idx) => ({ x: ((idx % N) + 0.5) * TILE, z: (((idx / N) | 0) + 0.5) * TILE });

// Случайная клетка пола, по возможности подальше от точки
function randomFloorFar(G, fromX, fromZ, samples = 40) {
  const fl = G.map.floors;
  let best = null, bd = -1;
  for (let i = 0; i < samples; i++) {
    const p = tileCenter(fl[Math.floor(Math.random() * fl.length)]);
    const d = Math.hypot(p.x - fromX, p.z - fromZ);
    if (d > bd) { bd = d; best = p; }
  }
  return best;
}

// Точка блуждания: склоняемся к случайному игроку, чтобы существо не уходило в пустые углы
function pickWander(G, players) {
  const fl = G.map.floors;
  const target = players.length ? players[Math.floor(Math.random() * players.length)] : null;
  let best = null, bd = 1e9;
  for (let i = 0; i < 8; i++) {
    const p = tileCenter(fl[Math.floor(Math.random() * fl.length)]);
    const d = target ? Math.hypot(p.x - target.x, p.z - target.z) : Math.random();
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// Шаг к цели по полю расстояний (пересчитывается не чаще раза в 0.3 с)
function mobMove(G, m, dt, gx, gz, speed) {
  const gtx = Math.min(N - 1, Math.max(0, Math.floor(gx / TILE)));
  const gty = Math.min(N - 1, Math.max(0, Math.floor(gz / TILE)));
  const gi = gtx + gty * N;
  m.repath -= dt;
  if (!m.field || m.fieldGoal !== gi || m.repath <= 0) {
    m.field = BR.bfs(G.map.g, gtx, gty);
    m.fieldGoal = gi;
    m.repath = 0.3;
  }
  const mtx = Math.floor(m.x / TILE), mty = Math.floor(m.z / TILE);
  let tx, tz;
  if (mtx === gtx && mty === gty) { tx = gx; tz = gz; }
  else {
    let best = m.field[mtx + mty * N], bx = -1, by = -1;
    if (best < 0) return;
    for (const [dx, dy] of BR.D4) {
      const nx = mtx + dx, ny = mty + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const d = m.field[nx + ny * N];
      if (d >= 0 && d < best) { best = d; bx = nx; by = ny; }
    }
    if (bx < 0) return;
    tx = (bx + 0.5) * TILE; tz = (by + 0.5) * TILE;
  }
  const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
  if (d > 0.001) {
    const s = Math.min(d, speed * dt);
    m.x += (dx / d) * s; m.z += (dz / d) * s;
    m.r = Math.atan2(dx, dz);
  }
}

function updateMob(G, m, dt, players) {
  if (m.stun > 0) { m.stun -= dt; return; }
  const speed = BASE_SPEED * G.cfg.mobSpeed;
  let best = null, bd = 1e9;
  for (const p of players) {
    const d = Math.hypot(p.x - m.x, p.z - m.z);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) {
    const sees = G.cfg.chase || bd < SEE_NEAR || (bd < (best.fl ? SEE_FAR_TORCH : SEE_FAR) && BR.los(G.map, m.x, m.z, best.x, best.z));
    if (sees) { m.mode = 'chase'; m.lost = 0; m.alert = null; }
    else if (m.mode === 'chase') {
      m.lost += dt;
      if (bd > LOSE_DIST || m.lost > LOSE_TIME) { m.mode = 'wander'; m.wp = null; }
    }
  } else m.mode = 'wander';

  if (m.mode === 'chase' && best) { mobMove(G, m, dt, best.x, best.z, speed); return; }
  if (m.alert) {
    m.alert.t -= dt;
    if (m.alert.t <= 0 || Math.hypot(m.alert.x - m.x, m.alert.z - m.z) < 2) m.alert = null;
    else { mobMove(G, m, dt, m.alert.x, m.alert.z, speed * 0.95); return; }
  }
  if (!m.wp || Math.hypot(m.wp.x - m.x, m.wp.z - m.z) < 1.5) m.wp = pickWander(G, players);
  mobMove(G, m, dt, m.wp.x, m.wp.z, WANDER_SPEED);
}

module.exports = { newMob, updateMob, randomFloorFar };
