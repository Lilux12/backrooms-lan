'use strict';
// «Офисы»: стеклянная переговорная с терминалом. Дверь открыта, пока держат кнопку на ресепшене
// (или кнопку изнутри). Камеры наблюдения (мониторы) показывают, где существа.
// Предохранители и код — из classic.js (с опциями codeNeedsFuses, keypadPoi).
const U = require('./util');
const { BR, broadcast } = U;

const RECEPTION_LATCH = 12;
const INNER_LATCH = 5;

module.exports = {
  offices: {
    init: () => ({ solved: true, gate: null }),
    setup(G, add, rnd) {
      const lv = G.map.lv, pz = G.pz.offices;
      pz.gate = { cells: [{ f: 2, i: lv.gate }], open: false };
      // ресепшен — в 6–12 шагах от двери переговорной (один игрок успевает добежать)
      const n = U.nodeNear(G, rnd, lv.outside, 6, 12, (m) => Math.floor(m / BR.NN) === 2);
      U.addSwitch(add, U.at(G, n), 'reception', RECEPTION_LATCH, 'Ресепшен: дверь переговорной', { style: 'desk' });
      U.addSwitch(add, U.at(G, lv.inner), 'inner', INNER_LATCH, 'Открыть дверь изнутри', { style: 'button' });
      if (lv.cctv != null) add('monitor', U.at(G, lv.cctv));
      const m2 = BR.pickSpots(G.map, rnd, 1, { minDist: 0.2 * G.map.maxDist, floor: 0 })[0];
      if (m2) add('monitor', { x: m2.x, y: m2.y, z: m2.z });
    },
    goal: (G) => (G.pz.code.solved ? null : 'Переговорная (3 этаж): дверь открывается кнопкой на ресепшене' + (G.pz.offices.gate.open ? ' · ОТКРЫТО' : '')),
    hint(G) { return U.switches(G, 'reception')[0]; },
    tick(G, players) {
      const pz = G.pz.offices;
      const want = U.anyOn(G, 'reception') || U.anyOn(G, 'inner');
      if (U.setGate(G, pz.gate, want, U.bodiesOf(G, players))) {
        if (want) broadcast({ t: 'ev', text: 'Дверь переговорной открыта!' });
        return true;
      }
      return false;
    },
  },
};
