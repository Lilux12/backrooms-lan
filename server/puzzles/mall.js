'use strict';
// «Затопленный торговый центр»:
//  1) канистра с топливом (парковка) и предохранитель (комната охраны);
//  2) генератор на крыше: заводится, только пока кто-то качает топливо (удерживаемый насос) — вдвоём просто,
//     одному — подкачать и бегом к стартеру; свет и эскалаторы оживают;
//  3) код решётки кинотеатра — на двух кассетах камер (classic.js, опция codeTapes) → терминал у решётки.
// Событие: через минуту после запуска свет гаснет на 20 секунд — манекены оживают и идут на вас.
// Финал: манекены наступают волной, пока вы бежите через зал кинотеатра к аварийному выходу.
const U = require('./util');
const { BR, broadcast, removeObj, near, PICK_DIST, sendGoals, checkSolved, event } = U;

const PUMP_LATCH = 12;
const BLACKOUT_AFTER = 55, BLACKOUT_TIME = 20;

module.exports = {
  mall: {
    init: () => ({ fuel: false, fuse: false, powered: false, solved: false, gate: null, blackT: -1 }),
    setup(G, add, rnd) {
      const map = G.map, lv = map.lv, pz = G.pz.mall;
      pz.gate = { cells: [{ f: 3, i: lv.shutter }], open: false };
      const fuel = BR.pickSpots(map, rnd, 1, { floor: 0, minDist: 0.25 * map.maxDist })[0] || BR.pickSpots(map, rnd, 1, {})[0];
      add('fuelcan', { x: fuel.x, y: fuel.y, z: fuel.z });
      add('mallfuse', U.at(G, lv.security));
      const gen = U.at(G, lv.gen);
      add('genroof', gen);
      const n = U.nodeNear(G, rnd, lv.gen, 5, 9, (m) => Math.floor(m / BR.NN) === 3);
      U.addSwitch(add, U.at(G, n), 'fuelpump', PUMP_LATCH, 'Ручной насос топлива', { style: 'pump' });
      add('radio', Object.assign({}, U.at(G, lv.tapes[0]), { x: U.at(G, lv.tapes[0]).x + 1.5 }));
    },
    goal(G) {
      const pz = G.pz.mall;
      if (!pz.powered) {
        const need = [pz.fuel ? 'канистра ✔' : 'канистра (парковка)', pz.fuse ? 'предохранитель ✔' : 'предохранитель (охрана, 2 этаж)'];
        return `Генератор на крыше: ${need.join(', ')}` + (pz.fuel && pz.fuse ? ' — качайте насос и заводите!' : '');
      }
      return G.pz.code.solved ? 'Решётка кинотеатра открыта — к аварийному выходу!' : 'Питание есть ✔ — код решётки кинотеатра на кассетах камер';
    },
    hint(G) {
      const pz = G.pz.mall;
      if (!pz.fuel) return G.objs.find((o) => o.kind === 'fuelcan');
      if (!pz.fuse) return G.objs.find((o) => o.kind === 'mallfuse');
      return G.objs.find((o) => o.kind === 'genroof');
    },
    touch(G, p, o) {
      if ((o.kind !== 'fuelcan' && o.kind !== 'mallfuse') || !near(o, p, PICK_DIST)) return false;
      const pz = G.pz.mall;
      removeObj(G, o);
      if (o.kind === 'fuelcan') pz.fuel = true; else pz.fuse = true;
      broadcast({ t: 'pick', id: o.id, kind: o.kind, by: p.name });
      broadcast({ t: 'ev', text: `${p.name} нашёл ${o.kind === 'fuelcan' ? 'канистру с топливом' : 'предохранитель генератора'}` });
      return true;
    },
    use(G, c, o) {
      if (o.kind !== 'genroof') return false;
      const pz = G.pz.mall;
      if (pz.powered) { c.send({ t: 'ev', text: 'Генератор гудит.' }); return true; }
      if (!pz.fuel || !pz.fuse) { c.send({ t: 'ev', text: `Генератору нужны ${!pz.fuel ? 'топливо' : ''}${!pz.fuel && !pz.fuse ? ' и ' : ''}${!pz.fuse ? 'предохранитель' : ''}.` }); return true; }
      if (!U.anyOn(G, 'fuelpump')) { c.send({ t: 'ev', text: 'Стартер крутит, но топливо не идёт. Кто-то должен качать насос — или подкачайте и бегом сюда!' }); broadcast({ t: 'sfx', name: 'clang', x: o.x, y: o.y, z: o.z }); return true; }
      pz.powered = true; pz.blackT = BLACKOUT_AFTER;
      broadcast({ t: 'ev', text: `${c.name} завёл генератор! В торговом центре загорается свет, эскалаторы поехали.` });
      broadcast({ t: 'sfx', name: 'pump', x: o.x, y: o.y, z: o.z });
      event(G, 'power');
      sendGoals(G);
      return true;
    },
    tick(G, players, dt) {
      const pz = G.pz.mall;
      let changed = false;
      if (pz.blackT > 0) {
        pz.blackT -= dt;
        if (pz.blackT <= 0) {
          event(G, 'blackout', { dur: BLACKOUT_TIME });
          broadcast({ t: 'ev', text: 'Генератор захлебнулся — свет погас! Манекены…' });
          G.statueBoost = BLACKOUT_TIME;
        }
      }
      if (G.statueBoost > 0) G.statueBoost -= dt;
      // код введён — решётка кинотеатра поднимается насовсем
      if (G.pz.code.solved && !pz.gate.open) {
        U.setGate(G, pz.gate, true, []);
        pz.solved = true; changed = true;
        broadcast({ t: 'ev', text: 'Решётка кинотеатра поднялась. Аварийный выход — за экраном!' });
        checkSolved(G);
      }
      return changed;
    },
  },
};
