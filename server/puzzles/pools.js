'use strict';
// «Бассейны»: 1) вентили + слив атриума; 2) задвижка шлюза на дне → ключ-карта; 3) насос поднимает воду к выходу.
const U = require('./util');
const { BR, broadcast, near, patch, removeObj, PICK_DIST, sendGoals, checkSolved, alarm, setCellNet, animateWater, event } = U;

const GATE_LATCH = 7;        // шлюз держится открытым после того, как с задвижки сошли

module.exports = {
  // «Бассейны»: 1) вентили + слив атриума; 2) задвижка шлюза на дне → ключ-карта; 3) насос поднимает воду к выходу
  pools: {
    init: () => ({ stage: 0, card: false, solved: false, targets: [], gateHold: 0, gateOpen: false, prFlood: 0 }),
    setup(G, add, rnd) {
      const map = G.map, P = map.pools, pz = G.pz.pools, FH = map.FH;
      const cell = (f, i, extra = {}) => Object.assign({ x: BR.centerX(i), y: f * FH, z: BR.centerZ(i) }, extra);
      pz.targets = [0, 1, 2].map(() => 1 + Math.floor(rnd() * 3));
      const room = P.pumpRoom, w = 6; // насосная 6×6
      [1, 3, 5].forEach((cx, k) => add('valve', cell(0, room[w + cx], { col: k, val: 0 })));
      add('drain', cell(0, room[4 * w + 2]));
      const dots = (n) => '●'.repeat(n) + '○'.repeat(3 - n);
      add('paper', cell(0, room[4 * w + 4], {
        title: 'Таблица давления (насосная)',
        text: `Слив атриума. Выставить давление:\n\nКРАСНЫЙ  ${dots(pz.targets[0])}\nСИНИЙ    ${dots(pz.targets[1])}\nЖЁЛТЫЙ   ${dots(pz.targets[2])}\n\nПотом — рычаг слива. Каждый поворот вентиля = +1 деление (после третьего — сброс на ноль).`,
      }));
      add('gateplate', cell(0, P.plate, { on: false }));
      add('keycard', cell(0, P.key));
      add('pump', cell(1, P.pump));
    },
    goal(G) {
      const pz = G.pz.pools;
      if (pz.stage === 0) return 'Насосная (этаж −1): выставьте вентили по таблице и дёрните слив';
      if (pz.stage === 1) return 'Шлюз на дне бассейна: держите задвижку, найдите ключ-карту' + (pz.gateOpen ? ' · ШЛЮЗ ОТКРЫТ' : '');
      if (pz.stage === 2) return 'Ключ-карта ✔ — запустите насос на палубе атриума';
      return 'Насос запущен ✔ — вода поднимается, плывите к выходу наверх!';
    },
    touch(G, p, o) {
      if (o.kind !== 'keycard' || !near(o, p, PICK_DIST)) return false;
      const pz = G.pz.pools;
      removeObj(G, o);
      pz.card = true; pz.stage = Math.max(pz.stage, 2);
      broadcast({ t: 'pick', id: o.id, kind: 'keycard', by: p.name });
      broadcast({ t: 'ev', text: `${p.name} нашёл ключ-карту! Люк в отсеке открылся.` });
      setCellNet(G, 1, G.map.pools.hatch, BR.T.HOLE);
      return true;
    },
    use(G, c, o) {
      const pz = G.pz.pools, P = G.map.pools;
      if (o.kind === 'valve') {
        if (pz.stage > 0) return true;
        patch(o, { val: (o.val + 1) % 4 });
        broadcast({ t: 'sfx', name: 'valve' });
        return true;
      }
      if (o.kind === 'drain') {
        if (pz.stage > 0) return true;
        const valves = G.objs.filter((q) => q.kind === 'valve').sort((a, b) => a.col - b.col);
        if (valves.every((v, k) => v.val === pz.targets[k])) {
          pz.stage = 1;
          animateWater(G, P.atrZone, P.low, 14);
          broadcast({ t: 'ev', text: `${c.name} открыл слив. Вода уходит из атриума…` });
          broadcast({ t: 'sfx', name: 'drain' });
        } else {
          broadcast({ t: 'ev', text: 'Неверное давление! Аварийный выброс в насосную — СИРЕНА!' });
          animateWater(G, P.prZone, 0.9, 3);
          pz.prFlood = 20;
          alarm(G, c.x, c.y, c.z);
        }
        sendGoals(G);
        return true;
      }
      if (o.kind === 'pump') {
        if (pz.stage < 2) { c.send({ t: 'ev', text: 'Пульт насоса заблокирован. Нужна ключ-карта.' }); return true; }
        if (pz.stage >= 3) return true;
        pz.stage = 3; pz.solved = true;
        animateWater(G, P.atrZone, P.high, 45);
        event(G, 'quake', { dur: 2.5 });
        broadcast({ t: 'ev', text: `${c.name} запустил насос! Вода поднимается — к выходу наверх!` });
        broadcast({ t: 'sfx', name: 'pump' });
        alarm(G, o.x, o.y, o.z);
        for (const m of G.mobs) if (m.type === 'drowner') { m.stun = 0; m.rage = true; }
        sendGoals(G); checkSolved(G);
        return true;
      }
      return false;
    },
    tick(G, players, dt) {
      const pz = G.pz.pools, P = G.map.pools, map = G.map;
      let changed = false;
      // затопление насосной после ошибки уходит само
      if (pz.prFlood > 0) { pz.prFlood -= dt; if (pz.prFlood <= 0) animateWater(G, P.prZone, -1, 6); }
      // задвижка шлюза: держится, пока на плите стоят, и ещё GATE_LATCH секунд
      if (pz.stage >= 1 && map.wl[P.atrZone] < 0.5) {
        const plate = G.objs.find((o) => o.kind === 'gateplate');
        const pressed = players.some((p) => near(plate, p, 1.5));
        pz.gateHold = pressed ? GATE_LATCH : Math.max(0, pz.gateHold - dt);
        if (pressed !== plate.on) patch(plate, { on: pressed });
        const gx = BR.centerX(P.gate), gz = BR.centerZ(P.gate);
        const inGate = players.some((p) => Math.abs(p.x - gx) < 2.4 && Math.abs(p.z - gz) < 2.4 && p.y < 2);
        const open = pz.gateHold > 0 || (pz.gateOpen && inGate); // не захлопываем на игроке
        if (open !== pz.gateOpen) {
          pz.gateOpen = open; changed = true;
          setCellNet(G, 0, P.gate, open ? BR.T.FLOOR : BR.T.WALL);
          broadcast({ t: 'sfx', name: open ? 'door' : 'clang' });
        }
      }
      return changed;
    },
  },
};
