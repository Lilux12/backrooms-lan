'use strict';
// Утопленник: догоняет того, кто плывёт в бассейне, но никогда не выходит из воды
// и не трогает тех, кто стоит на палубе; когда воду слили — затаивается.
const assert = require('assert');
const BR = require('../shared/map.js');
const { buildLevel } = require('../server/level.js');
const { updateMob, inWater } = require('../server/mobs.js');

const LV = BR.LEVELS.findIndex((l) => l.custom === 'pools');
for (let s = 0; s < 6; s++) {
  const G = buildLevel(LV, s * 7777 + 1, {});
  const map = G.map, P = map.pools;
  const m = G.mobs.find((q) => q.type === 'drowner');
  assert(m, 'на уровне нет утопленника');
  m.stun = 0;
  // 1) пловец в атриуме
  const sw = { x: 20.5 * 4, y: P.full - BR.PHYS.FLOAT, z: 24.5 * 4, node: -1 };
  sw.node = BR.nodeAt(map, sw.x, sw.y + 0.1, sw.z);
  assert(inWater(G, sw), 'пловец не в воде');
  let t = 0;
  for (; t < 90; t += 0.05) { updateMob(G, m, 0.05, [sw]); if (Math.hypot(m.x - sw.x, m.z - sw.z) < 1.3) break; }
  assert(t < 90, `seed ${s}: утопленник не догнал пловца`);
  // 2) человек на палубе — существо остаётся в воде
  const deck = { x: 16.5 * 4, y: map.FH, z: 22.5 * 4 };
  deck.node = BR.nodeAt(map, deck.x, deck.y + 0.1, deck.z);
  for (let k = 0; k < 600; k++) {
    updateMob(G, m, 0.05, [deck]);
    assert(BR.waterAt(map, m.x, m.z, BR.nodePos(map, m.node).y) > -Infinity, `seed ${s}: утопленник вышел из воды`);
  }
  // 3) воду слили — затаился
  map.wl[P.atrZone] = P.low; map.navDirty = true; map.waterVer = (map.waterVer || 0) + 1;
  for (let k = 0; k < 20; k++) updateMob(G, m, 0.05, [deck]);
  assert(m.hidden || BR.waterDepth(map, Math.floor(m.node / BR.NN), m.node % BR.NN) > 1, `seed ${s}: утопленник остался на сухом дне`);
}
console.log('OK drowner: ловит пловцов, не выходит на сушу, прячется без воды');
