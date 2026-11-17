'use strict';
// «Режиссёр» игры: следит за напряжением команды и подстраивает темп.
//  - напряжение растёт от существ в погоне и рядом, погибших, севших фонарей; плавно спадает;
//  - долго спокойно → событие: шёпот за спиной, шаги, мигание света, далёкий рёв, лицо в обоях, звонок,
//    существо «слышит» что-то рядом с командой (но не видит её) — не чаще раза в scareGap секунд;
//  - напряжение долго на пике → передышка: преследователи теряют след и уходят;
//  - сложность и число игроков меняют скорость существ, частоту событий и правила смерти.
const BR = require('../shared/map.js');
const { broadcast } = require('./clients');

// Сложности: speed — скорость существ, catchKills — поимка убивает (иначе — телепорт), revive — работают аптечки и алтарь,
// calm/scareGap — через сколько спокойных секунд и не чаще какого интервала события, peak — сколько терпеть пик
const DIFFICULTY = {
  easy: { label: 'Лёгкая', speed: 0.85, catchKills: false, revive: true, calm: 70, scareGap: 70, peak: 18 },
  normal: { label: 'Нормальная', speed: 1, catchKills: true, revive: true, calm: 50, scareGap: 50, peak: 28 },
  hard: { label: 'Хардкор', speed: 1.12, catchKills: true, revive: false, calm: 35, scareGap: 35, peak: 45 },
};
const SCARES = ['whisper', 'steps', 'flicker', 'roar', 'face', 'phone', 'nudge'];

// Множитель скорости существ от числа игроков: вчетвером существа быстрее, чем вдвоём
const crowd = (n) => 1 + 0.04 * Math.max(0, n - 2);

function newDirector() { return { tension: 0, calm: 0, peak: 0, cool: 25, events: 0, last: '' }; }

function tension(G, players) {
  let t = 0;
  for (const m of G.mobs) {
    if (m.hidden || m.stun > 0) continue;
    let d = 1e9;
    for (const p of players) d = Math.min(d, Math.hypot(m.x - p.x, m.z - p.z) + Math.abs(m.y - p.y) * 2);
    if (m.mode === 'chase') t += 0.5;
    if (d < 14) t += (14 - d) / 14 * 0.7;
  }
  for (const p of players) if ((p.bat || 1) < 0.15) t += 0.1;
  return t;
}

// Событие для случайного живого игрока (часть видна всем, часть — только ему)
function scare(G, players, rnd = Math.random) {
  const p = players[Math.floor(rnd() * players.length)];
  if (!p) return null;
  const k = SCARES[Math.floor(rnd() * SCARES.length)];
  const back = { x: p.x + Math.sin(p.r || 0) * 6, y: p.y, z: p.z + Math.cos(p.r || 0) * 6 }; // за спиной
  switch (k) {
    case 'whisper': p.send({ t: 'event', k: 'whisper', x: back.x, y: back.y + 1.5, z: back.z }); break;
    case 'steps': p.send({ t: 'event', k: 'steps', x: back.x, y: back.y, z: back.z }); break;
    case 'flicker': broadcast({ t: 'event', k: 'flicker', dur: 3 }); break;
    case 'face': p.send({ t: 'event', k: 'face' }); break;
    case 'phone': broadcast({ t: 'event', k: 'phone', x: p.x + (rnd() - 0.5) * 30, y: p.y, z: p.z + (rnd() - 0.5) * 30 }); break;
    case 'roar': {
      const m = G.mobs.find((q) => !q.hidden) || null;
      if (m) broadcast({ t: 'sfx', name: 'roar', x: m.x, y: m.y, z: m.z });
      break;
    }
    case 'nudge': {
      // существо идёт «на звук» в 20–30 м от игрока: команда слышит, что оно приближается, но её не видят
      const sp = G.map.spots.filter((n) => { const q = BR.nodePos(G.map, n); const d = Math.hypot(q.x - p.x, q.z - p.z); return d > 20 && d < 30 && Math.abs(q.y - p.y) < 2; });
      const m = G.mobs.find((q) => q.type !== 'drowner' && !q.hidden && q.mode !== 'chase');
      if (sp.length && m) m.alert = { node: sp[Math.floor(rnd() * sp.length)], t: 12 };
      break;
    }
  }
  return k;
}

// Передышка: преследователи теряют след и уходят бродить
function relax(G) {
  for (const m of G.mobs) {
    if (m.mode !== 'chase' || m.type === 'drowner') continue;
    m.mode = 'wander'; m.target = null; m.lost = 0; m.alert = null; m.wp = -1;
    m.stun = Math.max(m.stun, 2);
  }
}

function tickDirector(G, players, dt) {
  if (!players.length || G.cfg.chase || G.state !== 'play') return;
  const D = G.dir || (G.dir = newDirector());
  const diff = DIFFICULTY[G.difficulty] || DIFFICULTY.normal;
  const t = tension(G, players);
  D.tension += (t - D.tension) * Math.min(1, dt * 0.6);
  D.cool -= dt;
  D.calm = D.tension < 0.15 ? D.calm + dt : 0;
  if (D.calm > diff.calm && D.cool <= 0) {
    D.last = scare(G, players) || '';
    D.events++; D.cool = diff.scareGap; D.calm = 0;
  }
  D.peak = D.tension > 1.1 ? D.peak + dt : 0;
  if (D.peak > diff.peak) { relax(G); D.peak = 0; D.cool = Math.max(D.cool, 15); }
}

module.exports = { DIFFICULTY, tickDirector, scare, relax, tension, crowd, SCARES };
