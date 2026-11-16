'use strict';
// «Фабрика» — финал:
//  1) разжечь четыре печи на дне шахты по возрастанию температуры (таблички на печах); ошибка — выброс пара;
//  2) перекинуть паропроводы: три вентиля в трубной (ярус 2) по схеме;
//  3) синхронизировать два конвейера: оба рубильника одновременно;
//  4) три консоли Надсмотрщика наверху одновременно (каждая держится 15 секунд).
// После этого фабрика рушится: мосты третьего яруса обваливаются, Надсмотрщик в ярости.
// Две концовки: выйти к чёрному небу — разрушить фабрику; сесть в кресло Надсмотрщика — остаться.
const U = require('./util');
const { BR, broadcast, patch, near, sendGoals, checkSolved, alarm, event, setCellNet } = U;

const CONVEYOR_LATCH = 10, CONSOLE_LATCH = 15, COLLAPSE_EVERY = 4, HOT_KILL = 2.5;
const PIPE_POS = ['◄', '▲', '►'];

module.exports = {
  factory: {
    init: () => ({ lit: [], furnaces: false, pipes: false, conveyors: false, solved: false, target: [], collapseT: 0, heat: {} }),
    setup(G, add, rnd) {
      const map = G.map, lv = map.lv, pz = G.pz.factory;
      // печи: разные температуры
      const temps = BR.shuffle(rnd, [480, 620, 760, 890, 1040, 1180]).slice(0, 4);
      lv.furnaces.forEach((n, k) => add('furnace', Object.assign({ k, temp: temps[k], lit: false }, U.at(G, n))));
      pz.order = temps.map((t, k) => [t, k]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
      // паропроводы: схема
      pz.target = [0, 1, 2].map(() => Math.floor(rnd() * 3));
      lv.pipes.forEach((n, k) => add('pipevalve', Object.assign({ k, val: 0 }, U.at(G, n))));
      add('paper', Object.assign({ title: 'Схема паропроводов', text: `Перекинуть паропроводы на верхние ярусы.\nПоложение задвижек (слева направо):\n\n  ${pz.target.map((v) => PIPE_POS[v]).join('   ')}\n\n◄ — на запад, ▲ — вверх, ► — на восток.\nСначала разжечь печи — без пара задвижки не сдвинуть.` }, U.at(G, lv.scheme)));
      // конвейеры: два рубильника в разных цехах
      const a = BR.pickSpots(map, rnd, 1, { floor: 1, minDist: 0.3 * map.maxDist })[0];
      const b = U.nodeNear(G, rnd, a.node, 7, 13, (n) => Math.floor(n / BR.NN) === 1);
      for (const p of [a, U.at(G, b)]) U.addSwitch(add, p, 'conveyor', CONVEYOR_LATCH, 'Рубильник конвейера', { style: 'breaker', disabled: true });
      lv.consoles.forEach((n, k) => U.addSwitch(add, U.at(G, n), 'console', CONSOLE_LATCH, `Консоль ${k + 1}`, { style: 'console', disabled: true }));
      add('ending', Object.assign({ active: false }, U.at(G, lv.throne)));
    },
    goal(G) {
      const pz = G.pz.factory;
      if (!pz.furnaces) return `Печи: ${pz.lit.length}/4 — разжигать по возрастанию температуры`;
      if (!pz.pipes) return 'Печи горят ✔ — перекиньте паропроводы по схеме (трубная, ярус 3)';
      if (!pz.conveyors) return 'Пар идёт ✔ — включите оба конвейера одновременно';
      if (!pz.solved) return 'Конвейеры ✔ — три консоли Надсмотрщика наверху: все разом';
      return 'Фабрика рушится! Выход к небу — или кресло Надсмотрщика…';
    },
    hint(G) {
      const pz = G.pz.factory;
      if (!pz.furnaces) return G.objs.find((o) => o.kind === 'furnace' && !o.lit);
      if (!pz.pipes) return G.objs.find((o) => o.kind === 'pipevalve');
      if (!pz.conveyors) return U.switches(G, 'conveyor').find((o) => !o.on);
      return U.switches(G, 'console').find((o) => !o.on);
    },
    use(G, c, o) {
      const pz = G.pz.factory;
      if (o.kind === 'furnace') {
        if (pz.furnaces || o.lit) return true;
        if (pz.order[pz.lit.length] === o.k) {
          pz.lit.push(o.k); patch(o, { lit: true });
          broadcast({ t: 'sfx', name: 'roar', x: o.x, y: o.y, z: o.z });
          broadcast({ t: 'ev', text: `${c.name} разжёг печь (${o.temp}°) — ${pz.lit.length}/4` });
          if (pz.lit.length === 4) { pz.furnaces = true; broadcast({ t: 'ev', text: 'Все печи горят. По трубам пошёл пар.' }); event(G, 'steam'); }
        } else {
          for (const f of G.objs.filter((q) => q.kind === 'furnace' && q.lit)) patch(f, { lit: false });
          pz.lit = [];
          broadcast({ t: 'ev', text: `${c.name} разжёг не ту печь — выброс пара! Печи погасли.` });
          event(G, 'steam'); alarm(G, c.x, c.y, c.z);
        }
        sendGoals(G);
        return true;
      }
      if (o.kind === 'pipevalve') {
        if (!pz.furnaces) { c.send({ t: 'ev', text: 'Задвижка не двигается: в трубах нет пара. Сначала печи.' }); return true; }
        if (pz.pipes) return true;
        patch(o, { val: (o.val + 1) % 3 });
        broadcast({ t: 'sfx', name: 'valve', x: o.x, y: o.y, z: o.z });
        const vs = G.objs.filter((q) => q.kind === 'pipevalve').sort((a, b) => a.k - b.k);
        if (vs.every((v, k) => v.val === pz.target[k])) {
          pz.pipes = true;
          for (const s of U.switches(G, 'conveyor')) { s.disabled = false; patch(s, { disabled: false }); }
          broadcast({ t: 'ev', text: 'Пар ушёл на верхние ярусы. Конвейеры ожили — их надо синхронизировать.' });
          sendGoals(G);
        }
        return true;
      }
      if (o.kind === 'ending') {
        if (!pz.solved) { c.send({ t: 'ev', text: 'Кресло Надсмотрщика. Пока пульт не запущен, оно холодное.' }); return true; }
        broadcast({ t: 'ev', text: `${c.name} сел в кресло Надсмотрщика…` });
        U.hooks.finish(G, 'stay', c.name);
        return true;
      }
      return false;
    },
    tick(G, players, dt) {
      const pz = G.pz.factory, map = G.map;
      let changed = false;
      // раскалённый пол у горящих печей
      if (pz.lit.length) {
        const hot = new Set(map.lv.hot);
        for (const p of players) {
          const i = BR.cellAt(p.x, p.z);
          const on = i >= 0 && p.y < 1 && hot.has(i);
          pz.heat[p.id] = on ? (pz.heat[p.id] || 0) + dt : 0;
          if (on && pz.heat[p.id] > HOT_KILL && !p.god) { pz.heat[p.id] = 0; U.hooks.kill(G, p, 'Раскалённый пол', 'сгорел на раскалённом полу'); }
        }
      }
      if (pz.pipes && !pz.conveyors && U.groupOn(G, 'conveyor')) {
        pz.conveyors = true; changed = true;
        for (const s of U.switches(G, 'console')) { s.disabled = false; patch(s, { disabled: false }); }
        broadcast({ t: 'ev', text: 'Конвейеры идут в такт. Наверху загорелись консоли Надсмотрщика.' });
        event(G, 'conveyor');
      }
      if (pz.conveyors && !pz.solved && U.groupOn(G, 'console')) {
        pz.solved = true; changed = true;
        const ch = G.objs.find((o) => o.kind === 'ending');
        if (ch) patch(ch, { active: true });
        broadcast({ t: 'ev', text: 'ФАБРИКА ОСТАНОВЛЕНА. Она рушится! Выход — к чёрному небу. Или… кресло Надсмотрщика свободно.' });
        event(G, 'quake', { dur: 3 });
        for (const m of G.mobs) if (m.type === 'overseer') { m.stun = 0; m.boss = true; }
        checkSolved(G);
      }
      // обрушение мостов третьего яруса
      if (pz.solved && map.lv.collapse.length) {
        pz.collapseT -= dt;
        if (pz.collapseT <= 0) {
          pz.collapseT = COLLAPSE_EVERY;
          const bodies = U.bodiesOf(G, players);
          const k = map.lv.collapse.findIndex((c) => !bodies.some((b) => Math.abs(b.x - BR.centerX(c.i)) < 2.2 && Math.abs(b.z - BR.centerZ(c.i)) < 2.2 && Math.abs(b.y - c.f * map.FH) < 1.5));
          if (k >= 0) {
            const c = map.lv.collapse.splice(k, 1)[0];
            setCellNet(G, c.f, c.i, BR.T.HOLE);
            event(G, 'smash', { x: BR.centerX(c.i), y: c.f * map.FH, z: BR.centerZ(c.i) });
          }
        }
      }
      return changed;
    },
  },
};
