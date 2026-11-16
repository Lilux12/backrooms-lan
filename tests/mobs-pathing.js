'use strict';
// Существа находят путь по этажам (лестницы, провалы, стремянки) и не застревают:
// для каждого уровня и нескольких seed существо гонится за неподвижной целью на другом этаже.
const assert = require('assert');
const BR = require('../shared/map.js');
const { buildLevel } = require('../server/level.js');
const { mobMove } = require('../server/mobs.js');

const SEEDS = +process.argv[2] || 8;
const DT = 0.05, LIMIT = 600; // в длинных лабиринтах путь занимает несколько минут // секунд симуляции на одну погоню
let total = 0, sumTime = 0;

for (let lv = 0; lv < BR.LEVELS.length; lv++) {
  if (BR.LEVELS[lv].chase) continue;
  for (let s = 0; s < SEEDS; s++) {
    const seed = (s * 40503 + 17) >>> 0;
    const G = buildLevel(lv, seed, {});
    const map = G.map;
    BR.ensureNav(map);
    const rnd = BR.mulberry32(seed);
    // цель — достижимая для существ клетка, по возможности на другом этаже
    const reachMob = BR.bfsNav(map.navMob, G.mobs[0] ? BR.nodeAt(map, G.mobs[0].x, G.mobs[0].y + 0.1, G.mobs[0].z) : map.spawnNode);
    const startF = Math.floor(BR.nodeAt(map, G.mobs[0].x, G.mobs[0].y + 0.1, G.mobs[0].z) / BR.NN);
    let cands = map.spots.filter((n) => reachMob[n] >= 0 && Math.floor(n / BR.NN) !== startF);
    if (!cands.length) cands = map.spots.filter((n) => reachMob[n] >= 10);
    const goal = cands[Math.floor(rnd() * cands.length)];
    const p = BR.nodePos(map, goal);
    const player = { x: p.x, y: p.y, z: p.z, node: goal, fl: false };
    const m = G.mobs[0];
    m.stun = 0;
    let t = 0, caught = false;
    for (; t < LIMIT; t += DT) {
      mobMove(G, m, DT, goal, 4.2, player);
      if (Math.hypot(m.x - player.x, m.z - player.z) < 1.3 && Math.abs(m.y - player.y) < 1.4) { caught = true; break; }
    }
    assert(caught, `уровень ${lv}, seed ${seed}: существо не добралось до цели за ${LIMIT} с (застряло на ${m.x.toFixed(1)},${m.y.toFixed(1)},${m.z.toFixed(1)})`);
    total++; sumTime += t;
  }
}
console.log(`OK mobs-pathing: ${total} погонь по этажам, в среднем ${(sumTime / total).toFixed(1)} с`);
