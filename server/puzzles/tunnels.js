'use strict';
// «Технические тоннели»: 1) вентиль в котельной даёт давление пара; 2) две плиты на разных ярусах;
// 3) паровой шлюз открыт, пока обе плиты держат (или нажата кнопка изнутри) — кто-то держит, другой проходит.
const U = require('./util');
const { BR, broadcast, patch, sendGoals, checkSolved, event } = U;

const PLATE_LATCH = 28;      // плита держится столько секунд после того, как с неё сошли
const INNER_LATCH = 6;

module.exports = {
  steam: {
    init: () => ({ pressure: false, solved: false, gate: null }),
    setup(G, add, rnd) {
      const lv = G.map.lv, map = G.map, pz = G.pz.steam;
      pz.gate = { cells: [{ f: 0, i: lv.gate }], open: false };
      add('steamvalve', Object.assign({ on: false }, U.at(G, lv.valve)));
      const bNode = lv.plateB; // плита Б — у шлюза; плита А — на другом ярусе, но не дальше 22 шагов
      const d = BR.bfsNav(BR.ensureNav(map), bNode);
      let cand = map.spots.filter((n) => Math.floor(n / BR.NN) !== 0 && d[n] >= 10 && d[n] <= 22);
      if (!cand.length) cand = map.spots.filter((n) => d[n] >= 8 && d[n] <= 26 && n !== bNode);
      const aNode = cand[Math.floor(rnd() * cand.length)];
      U.addSwitch(add, U.at(G, aNode), 'plates', PLATE_LATCH, 'Плита А', { style: 'plate' });
      U.addSwitch(add, U.at(G, bNode), 'plates', PLATE_LATCH, 'Плита Б', { style: 'plate' });
      U.addSwitch(add, U.at(G, lv.inner), 'gate', INNER_LATCH, 'Аварийная кнопка шлюза', { style: 'button' });
    },
    goal(G) {
      const pz = G.pz.steam;
      if (pz.solved) return 'Шлюз пройден ✔';
      if (!pz.pressure) return 'Котельная: дайте давление пара (вентиль, E)';
      const on = U.switches(G, 'plates').filter((o) => o.on).length;
      return `Плиты: ${on}/2 — шлюз открыт, пока нажаты обе` + (pz.gate.open ? ' · ШЛЮЗ ОТКРЫТ' : '');
    },
    hint(G) { return G.pz.steam.pressure ? U.switches(G, 'plates').find((o) => !o.on) : G.objs.find((o) => o.kind === 'steamvalve'); },
    use(G, c, o) {
      if (o.kind !== 'steamvalve') return false;
      const pz = G.pz.steam;
      if (pz.pressure) return true;
      pz.pressure = true;
      patch(o, { on: true });
      broadcast({ t: 'ev', text: `${c.name} открыл вентиль — в трубах пошёл пар!` });
      broadcast({ t: 'sfx', name: 'valve', x: o.x, y: o.y, z: o.z });
      event(G, 'steam');
      // трубы загудели — Червь чует вибрацию
      const node = BR.nodeAt(G.map, o.x, o.y + 0.1, o.z);
      if (node >= 0) for (const m of G.mobs) m.alert = { node, t: 10 };
      sendGoals(G);
      return true;
    },
    tick(G, players, dt) {
      const pz = G.pz.steam;
      const want = (pz.pressure && U.groupOn(G, 'plates')) || U.anyOn(G, 'gate');
      let changed = false;
      if (U.setGate(G, pz.gate, want, U.bodiesOf(G, players))) {
        changed = true;
        if (want && !pz.solved) { pz.solved = true; broadcast({ t: 'ev', text: 'Шлюз открыт! Внутри — выход. Он закроется, как только плиты отпустят.' }); checkSolved(G); }
      }
      // плиты нажали/отпустили — обновить строку цели
      const on = U.switches(G, 'plates').filter((o) => o.on).length;
      if (on !== pz.lastOn) { pz.lastOn = on; changed = true; }
      return changed;
    },
  },
};
