'use strict';
// «Заброшенная лаборатория»:
//  1) три допуска: синий (вход) → считыватель синего шлюза → жёлтый сектор → жёлтый допуск → красный сектор →
//     красный допуск → считыватель красного шлюза в реакторный зал;
//  2) охладитель: три реагента в станции смешивания — в порядке из журнала эксперимента (ошибка — газ и сирена);
//  3) два ключа аварийного сброса у ядра реактора, на разных мостах, повернуть одновременно.
// Образец мутирует: с жёлтым допуском быстрее, с красным — лезет в вентиляцию. Красный допуск включает карантин:
// все шлюзы закрываются на 25 секунд — команда может оказаться по разные стороны. После сброса — обратный
// отсчёт: 100 секунд, чтобы по мосткам подняться к аварийному люку.
const U = require('./util');
const { BR, broadcast, patch, removeObj, near, PICK_DIST, sendGoals, checkSolved, alarm, event } = U;

const COLORS = ['blue', 'yellow', 'red'];
const COLOR_RU = { blue: 'синий', yellow: 'жёлтый', red: 'красный' };
const REAGENTS = ['СИНИЙ', 'ЗЕЛЁНЫЙ', 'ЯНТАРНЫЙ'];
const FAST = !!process.env.FAST_EVENTS; // для автотестов: события короче
const KEY_LATCH = 16, QUARANTINE = FAST ? 3 : 25, COUNTDOWN = FAST ? 8 : 100;

// Узлы этажа floor, достижимые от старта, если открыть клетки opens
function reachable(G, opens, floor) {
  const map = G.map;
  for (const [f, i] of opens) BR.setCell(map, f, i, BR.T.FLOOR);
  const d = BR.bfsNav(BR.ensureNav(map), map.spawnNode);
  for (const [f, i] of opens) BR.setCell(map, f, i, BR.T.WALL);
  BR.ensureNav(map);
  const out = [];
  for (let i = 0; i < BR.NN; i++) {
    const n = floor * BR.NN + i, t = map.t[floor][i];
    if (d[n] >= 0 && (t === BR.T.FLOOR || t === BR.T.LOW) && !(map.reserved && map.reserved.has(i))) out.push(n);
  }
  return out;
}
const pickFar = (G, rnd, list) => { const s = list.slice().sort((a, b) => b - a); return list[Math.floor(rnd() * list.length)] || s[0]; };

module.exports = {
  lab: {
    init: () => ({ cards: {}, used: {}, gates: {}, mix: [], mixed: false, solved: false, countdown: -1, quarantine: 0, order: [] }),
    setup(G, add, rnd) {
      const map = G.map, lv = map.lv, pz = G.pz.lab;
      const gate = { blue: [3, idx(6, 35)], yellow: [2, idx(38, 9)], red: [1, idx(14, 22)] };
      for (const c of COLORS) pz.gates[c] = { cells: [{ f: gate[c][0], i: gate[c][1] }], open: false };
      G.specimenPhase = 1;
      // допуски: синий — в синем секторе, жёлтый — за синим шлюзом, красный — за жёлтым
      const blue = BR.pickSpots(map, rnd, 1, { floor: 3, minDist: 0.35 * map.maxDist })[0];
      add('labcard', { x: blue.x, y: blue.y, z: blue.z, group: 'blue' });
      const yl = reachable(G, [gate.blue], 2), rd = reachable(G, [gate.blue, gate.yellow], 1);
      const yc = U.at(G, pickFar(G, rnd, yl)), rc = U.at(G, pickFar(G, rnd, rd.filter((n) => n !== lv.mixer && !lv.reagents.includes(n))));
      add('labcard', { x: yc.x, y: yc.y, z: yc.z, group: 'yellow' });
      add('labcard', { x: rc.x, y: rc.y, z: rc.z, group: 'red' });
      // считыватели у шлюзов (снаружи)
      for (const [c, f, x, z] of [['blue', 3, 6, 34], ['yellow', 2, 38, 10], ['red', 1, 13, 22]]) {
        add('cardreader', { x: BR.centerX(idx(x, z)) + 1.2, y: f * map.FH, z: BR.centerZ(idx(x, z)), group: c });
      }
      // рецепт охладителя в журнале (жёлтый сектор) и станция смешивания (красный сектор)
      pz.order = BR.shuffle(rnd, [0, 1, 2]);
      const jn = U.at(G, pickFar(G, rnd, yl));
      add('paper', { x: jn.x, y: jn.y, z: jn.z, title: 'Журнал эксперимента №7',
        text: `День 41. Образец перестал реагировать на холод. Охладитель реактора готовить строго в порядке:\n\n1) ${REAGENTS[pz.order[0]]}\n2) ${REAGENTS[pz.order[1]]}\n3) ${REAGENTS[pz.order[2]]}\n\nДругой порядок даёт газ. Мы потеряли так Сомова.\n\nДень 42. Он тянется к тёплому. К фонарям. К нам.` });
      add('mixer', U.at(G, lv.mixer));
      lv.reagents.forEach((n, k) => add('reagent', Object.assign({ col: k, name: REAGENTS[k] }, U.at(G, n))));
      // ключи аварийного сброса: заблокированы, пока нет охладителя
      lv.keys.forEach((n, k) => U.addSwitch(add, U.at(G, n), 'reactorkey', KEY_LATCH, `Ключ сброса ${k + 1}`, { style: 'key', disabled: true }));
      add('phone', U.at(G, BR.pickSpots(map, rnd, 1, { floor: 3, minDist: 0.1 * map.maxDist })[0].node));
    },
    goal(G) {
      const pz = G.pz.lab;
      if (pz.countdown >= 0) return `АВАРИЙНЫЙ СБРОС: ${Math.ceil(pz.countdown)} с — к люку наверху реакторного зала!`;
      const have = COLORS.filter((c) => pz.used[c]).map((c) => COLOR_RU[c]);
      let s = `Шлюзы: ${have.length}/3` + (have.length ? ` (${have.join(', ')})` : '') + (pz.quarantine > 0 ? ` · КАРАНТИН ${Math.ceil(pz.quarantine)} с` : '');
      if (pz.used.red) s += pz.mixed ? ' · охладитель ✔ — поверните оба ключа у ядра одновременно' : ` · охладитель: ${pz.mix.length}/3 (рецепт — в журнале)`;
      return s;
    },
    hint(G) {
      const pz = G.pz.lab;
      for (const c of COLORS) {
        if (!pz.cards[c]) return G.objs.find((o) => o.kind === 'labcard' && o.group === c);
        if (!pz.used[c]) return G.objs.find((o) => o.kind === 'cardreader' && o.group === c);
      }
      return pz.mixed ? U.switches(G, 'reactorkey')[0] : G.objs.find((o) => o.kind === 'mixer');
    },
    touch(G, p, o) {
      if (o.kind !== 'labcard' || !near(o, p, PICK_DIST)) return false;
      const pz = G.pz.lab;
      removeObj(G, o);
      pz.cards[o.group] = true;
      broadcast({ t: 'pick', id: o.id, kind: 'labcard', by: p.name });
      broadcast({ t: 'ev', text: `${p.name} нашёл ${COLOR_RU[o.group]} допуск` });
      if (o.group === 'yellow') { G.specimenPhase = 2; broadcast({ t: 'ev', text: 'Где-то в вентиляции что-то сменило кожу…' }); broadcast({ t: 'sfx', name: 'shriek' }); }
      if (o.group === 'red') {
        G.specimenPhase = 3;
        pz.quarantine = QUARANTINE;
        event(G, 'quarantine', { dur: QUARANTINE });
        broadcast({ t: 'ev', text: `КАРАНТИН! Все шлюзы закрыты на ${QUARANTINE} секунд. Образец вырвался в вентиляцию.` });
        alarm(G, p.x, p.y, p.z);
      }
      return true;
    },
    use(G, c, o) {
      const pz = G.pz.lab;
      if (o.kind === 'cardreader') {
        if (pz.used[o.group]) { c.send({ t: 'ev', text: 'Шлюз уже открыт.' }); return true; }
        if (!pz.cards[o.group]) { c.send({ t: 'ev', text: `Считыватель мигает: нужен ${COLOR_RU[o.group]} допуск.` }); return true; }
        if (pz.quarantine > 0) { c.send({ t: 'ev', text: 'Карантин: считыватели заблокированы.' }); return true; }
        pz.used[o.group] = true;
        U.setGate(G, pz.gates[o.group], true, []);
        broadcast({ t: 'ev', text: `${c.name} открыл ${COLOR_RU[o.group]} шлюз` });
        sendGoals(G);
        return true;
      }
      if (o.kind === 'mixer') {
        c.send({ t: 'ev', text: pz.mixed ? 'Охладитель готов. Ключи у ядра разблокированы.' : `Станция смешивания: добавлено ${pz.mix.length}/3. Порядок — в журнале эксперимента.` });
        return true;
      }
      if (o.kind === 'reagent') {
        if (pz.mixed) return true;
        if (pz.order[pz.mix.length] === o.col) {
          pz.mix.push(o.col);
          broadcast({ t: 'sfx', name: 'valve', x: o.x, y: o.y, z: o.z });
          broadcast({ t: 'ev', text: `${c.name} добавил реагент «${o.name}» (${pz.mix.length}/3)` });
          if (pz.mix.length === 3) {
            pz.mixed = true;
            for (const k of U.switches(G, 'reactorkey')) { k.disabled = false; patch(k, { disabled: false }); }
            broadcast({ t: 'ev', text: 'Охладитель готов! Ключи аварийного сброса у ядра разблокированы — повернуть оба разом.' });
          }
        } else {
          pz.mix = [];
          broadcast({ t: 'ev', text: `${c.name} перепутал реагенты — ядовитый газ! СИРЕНА!` });
          event(G, 'gas', { dur: 8 });
          alarm(G, c.x, c.y, c.z);
        }
        sendGoals(G);
        return true;
      }
      return false;
    },
    tick(G, players, dt) {
      const pz = G.pz.lab;
      let changed = false;
      // карантин: открытые шлюзы закрываются, потом открываются снова
      if (pz.quarantine > 0) {
        const bodies = U.bodiesOf(G, players);
        for (const c of COLORS) if (pz.used[c]) U.setGate(G, pz.gates[c], false, bodies);
        pz.quarantine -= dt;
        if (Math.ceil(pz.quarantine) !== Math.ceil(pz.quarantine + dt)) changed = Math.ceil(pz.quarantine) % 5 === 0;
        if (pz.quarantine <= 0) {
          for (const c of COLORS) if (pz.used[c]) U.setGate(G, pz.gates[c], true, []);
          broadcast({ t: 'ev', text: 'Карантин снят. Шлюзы открыты.' });
          changed = true;
        }
      }
      // аварийный сброс
      if (!pz.solved && pz.mixed && U.groupOn(G, 'reactorkey')) {
        pz.solved = true; pz.countdown = COUNTDOWN;
        broadcast({ t: 'ev', text: `АВАРИЙНЫЙ СБРОС РЕАКТОРА! ${COUNTDOWN} секунд — бегите к люку наверху зала!` });
        event(G, 'countdown', { left: COUNTDOWN });
        alarm(G, players[0] ? players[0].x : 0, players[0] ? players[0].y : 0, players[0] ? players[0].z : 0);
        checkSolved(G);
        changed = true;
      }
      if (pz.countdown > 0 && G.state === 'play') {
        const was = Math.ceil(pz.countdown);
        pz.countdown -= dt;
        const now = Math.ceil(pz.countdown);
        if (now !== was && (now % 10 === 0 || now <= 10)) { event(G, 'countdown', { left: Math.max(0, now) }); changed = true; }
        if (pz.countdown <= 0) {
          broadcast({ t: 'ev', text: 'Реактор вспыхнул…' });
          event(G, 'flash');
          for (const p of players) U.hooks.kill(G, p, 'Реактор вспыхнул', 'не успел к люку');
        }
      }
      return changed;
    },
  },
};
const idx = (x, z) => x + z * BR.N;
