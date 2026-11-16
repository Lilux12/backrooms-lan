'use strict';
// «Подземная парковка»: рация охраны, мониторы камер и сигнализации машин.
// Головоломка с кодом — в classic.js (с опциями uvDigits / codePower); здесь — механика уровня.
const U = require('./util');
const { BR, broadcast, event } = U;

const ALARM_COOLDOWN = 25;   // одна машина не воет чаще, чем раз в столько секунд
const CAR_DIST = 2.6;        // бег ближе этого к машине включает сигнализацию

module.exports = {
  parking: {
    init: () => ({ solved: true, cool: {}, genWas: false }),
    setup(G, add) {
      const lv = G.map.lv;
      if (lv.radio != null) add('radio', Object.assign({}, U.at(G, lv.radio)));
      if (lv.monitor != null) add('monitor', Object.assign({}, U.at(G, lv.monitor)));
    },
    goal: () => null,
    tick(G, players, dt) {
      const pz = G.pz.parking, map = G.map;
      for (const k of Object.keys(pz.cool)) if ((pz.cool[k] -= dt) <= 0) delete pz.cool[k];
      for (const p of players) {
        if ((p.spd || 0) < 4.6) continue;
        const f = BR.floorOf(map, p.x, p.y, p.z), tx = Math.floor(p.x / 4), tz = Math.floor(p.z / 4);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx, z = tz + dz;
          if (!BR.inside(x, z)) continue;
          const i = x + z * BR.N;
          if (map.t[f][i] !== BR.T.BLOCK || map.a[f][i] !== 0) continue;
          const cx = BR.centerX(i), cz = BR.centerZ(i);
          if (Math.hypot(cx - p.x, cz - p.z) > CAR_DIST + 2 || pz.cool[`${f}:${i}`]) continue;
          carAlarm(G, f, i, p);
        }
      }
      // запуск генератора будит всю парковку: воют все машины рядом
      const gen = U.anyOn(G, 'gen');
      if (gen && !pz.genWas) {
        const sw = U.switches(G, 'gen')[0];
        event(G, 'caralarms', { x: sw.x, y: sw.y, z: sw.z });
        const node = BR.nodeAt(map, sw.x, sw.y + 0.1, sw.z);
        if (node >= 0) for (const m of G.mobs) { m.alert = { node, t: 10 }; }
      }
      pz.genWas = gen;
      return false;
    },
  },
};

function carAlarm(G, f, i, p) {
  const map = G.map;
  G.pz.parking.cool[`${f}:${i}`] = ALARM_COOLDOWN;
  const x = BR.centerX(i), y = f * map.FH, z = BR.centerZ(i);
  broadcast({ t: 'sfx', name: 'caralarm', x, y, z });
  broadcast({ t: 'ev', text: `${p.name} задел машину — сработала сигнализация!` });
  const node = BR.nodeAt(map, p.x, p.y + 0.1, p.z);
  if (node >= 0) for (const m of G.mobs) m.alert = { node, t: m.type === 'headlights' ? 14 : 8 };
}
