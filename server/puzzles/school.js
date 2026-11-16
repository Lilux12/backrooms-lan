'use strict';
// «Детская» (школа):
//  1) шесть кусочков картины-пазла по всей школе → доска в актовом зале: картина показывает библиотеку,
//     её дверь отпирается, рисунки на стенах оживают (мир меняет цвет);
//  2) считалочка в библиотеке говорит, на какую полку какую игрушку: мишку, зайку, утёнка (каждый несёт одну);
//     ошибка — игрушки разлетаются, а Воспитательница слышит;
//  3) двое одновременно раскачивают качели (каждые держатся 10 секунд) — дверь за сценой открывается.
// Музыкальная шкатулка усыпляет Воспитательницу на 25 секунд; потом её надо заводить снова (40 секунд).
// Финал: побег через актовый зал под барабан Воспитательницы.
const U = require('./util');
const { BR, broadcast, patch, removeObj, near, PICK_DIST, sendGoals, checkSolved, alarm, event } = U;

const PIECES = 6, SWING_LATCH = 10, MUSIC_TIME = 25, MUSIC_COOLDOWN = 40;
const TOYS = [['bear', 'мишка', 'мишку'], ['bunny', 'зайка', 'зайку'], ['duck', 'утёнок', 'утёнка']];
const SHELVES = [['red', 'красная', 'где цвет пожарной машины'], ['green', 'зелёная', 'где цвет травы'], ['blue', 'синяя', 'где цвет неба']];

module.exports = {
  school: {
    init: () => ({ pieces: 0, placed: 0, libOpen: false, map: {}, toysDone: false, solved: false, gate: null, musicCd: 0 }),
    setup(G, add, rnd) {
      const map = G.map, lv = map.lv, pz = G.pz.school;
      pz.gate = { cells: [{ f: 2, i: lv.libGate }], open: false };
      BR.pickSpots(map, rnd, PIECES, { minDist: 0.15 * map.maxDist, minSep: 7 }).forEach((p, k) => add('puzzlepiece', { x: p.x, y: p.y, z: p.z, n: k }));
      add('puzzleboard', U.at(G, lv.board));
      // какая игрушка на какую полку — каждый раз по-новому
      const order = BR.shuffle(rnd, [0, 1, 2]);
      TOYS.forEach((t, k) => { pz.map[t[0]] = SHELVES[order[k]][0]; });
      BR.pickSpots(map, rnd, 3, { minDist: 0.2 * map.maxDist, minSep: 8 }).forEach((p, k) => add('toy', { x: p.x, y: p.y, z: p.z, toy: TOYS[k][0] }));
      lv.shelves.forEach((n, k) => add('shelf', Object.assign({ color: SHELVES[k][0], toy: null }, U.at(G, n))));
      const rhyme = TOYS.map((t) => { const s = SHELVES.find((q) => q[0] === pz.map[t[0]]); return `${t[1][0].toUpperCase() + t[1].slice(1)} спит на полке той, ${s[2]}.`; });
      add('paper', Object.assign({ title: 'Считалочка (книжка на столе)', text: `Раз-два-три-четыре-пять,\nвышли куклы погулять.\n${rhyme.join('\n')}\nКто положит не туда —\nтот останется всегда.` }, U.at(G, lv.rhyme)));
      const mb = BR.pickSpots(map, rnd, 1, { minDist: 0.1 * map.maxDist, maxDist: 0.4 * map.maxDist })[0];
      add('musicbox', { x: mb.x, y: mb.y, z: mb.z, playing: false });
      // качели: две, в 8–14 шагах друг от друга
      const a = BR.pickSpots(map, rnd, 1, { minDist: 0.3 * map.maxDist, floor: 1 })[0];
      const b = U.nodeNear(G, rnd, a.node, 8, 14, (n) => Math.floor(n / BR.NN) === 1);
      for (const p of [a, U.at(G, b)]) U.addSwitch(add, p, 'swing', SWING_LATCH, 'Качели: раскачать', { style: 'swing', disabled: true });
    },
    goal(G) {
      const pz = G.pz.school;
      if (!pz.libOpen) return `Кусочки картины: ${pz.pieces + pz.placed}/${PIECES}` + (pz.pieces ? ` (в руках ${pz.pieces} — к доске в актовом зале)` : '');
      if (!pz.toysDone) return `Библиотека открыта ✔ — разложите игрушки по полкам по считалочке (${G.objs.filter((o) => o.kind === 'shelf' && o.toy).length}/3)`;
      return pz.solved ? 'Дверь за сценой открыта — бегите!' : 'Игрушки на местах ✔ — раскачайте обе качели одновременно';
    },
    hint(G) {
      const pz = G.pz.school;
      if (!pz.libOpen) return pz.pieces + pz.placed >= PIECES ? G.objs.find((o) => o.kind === 'puzzleboard') : G.objs.find((o) => o.kind === 'puzzlepiece');
      if (!pz.toysDone) return G.objs.find((o) => o.kind === 'toy') || G.objs.find((o) => o.kind === 'shelf' && !o.toy);
      return U.switches(G, 'swing').find((o) => !o.on);
    },
    touch(G, p, o) {
      const pz = G.pz.school;
      if (o.kind === 'puzzlepiece' && near(o, p, PICK_DIST)) {
        removeObj(G, o); pz.pieces++;
        broadcast({ t: 'pick', id: o.id, kind: 'puzzlepiece', by: p.name });
        broadcast({ t: 'ev', text: `${p.name} нашёл кусочек картины (${pz.pieces + pz.placed}/${PIECES})` });
        return true;
      }
      if (o.kind === 'toy' && near(o, p, PICK_DIST) && !p.toy) {
        removeObj(G, o); p.toy = o.toy;
        broadcast({ t: 'pick', id: o.id, kind: 'toy', by: p.name });
        p.send({ t: 'ev', text: `Вы несёте: ${TOYS.find((t) => t[0] === o.toy)[1]}. Положите на полку в библиотеке (E).` });
        return true;
      }
      return false;
    },
    use(G, c, o) {
      const pz = G.pz.school;
      if (o.kind === 'puzzleboard') {
        if (pz.libOpen) { c.send({ t: 'ev', text: 'На картине — библиотека. Её дверь открыта.' }); return true; }
        if (!pz.pieces) { c.send({ t: 'ev', text: `На доске ${pz.placed}/${PIECES} кусочков. Остальные — по всей школе.` }); return true; }
        pz.placed += pz.pieces; pz.pieces = 0;
        patch(o, { placed: pz.placed });
        broadcast({ t: 'ev', text: `${c.name} приложил кусочки к картине (${pz.placed}/${PIECES})` });
        if (pz.placed >= PIECES) {
          pz.libOpen = true;
          U.setGate(G, pz.gate, true, []);
          broadcast({ t: 'ev', text: 'Картина сложилась: на ней — библиотека на втором этаже. Где-то щёлкнул замок. Рисунки на стенах… шевелятся.' });
          event(G, 'drawings');
        }
        sendGoals(G);
        return true;
      }
      if (o.kind === 'musicbox') {
        if (o.playing) { c.send({ t: 'ev', text: 'Шкатулка играет.' }); return true; }
        if (pz.musicCd > 0) { c.send({ t: 'ev', text: `Пружина ослабла. Завести можно через ${Math.ceil(pz.musicCd)} с.` }); return true; }
        G.musicT = MUSIC_TIME; pz.musicCd = MUSIC_COOLDOWN;
        patch(o, { playing: true });
        broadcast({ t: 'sfx', name: 'musicbox', x: o.x, y: o.y, z: o.z });
        broadcast({ t: 'ev', text: `${c.name} завёл музыкальную шкатулку. Воспитательница засыпает… (${MUSIC_TIME} с)` });
        return true;
      }
      if (o.kind === 'shelf') {
        if (o.toy) { c.send({ t: 'ev', text: 'На полке уже сидит игрушка.' }); return true; }
        if (!c.toy) { c.send({ t: 'ev', text: `Полка (${SHELVES.find((s) => s[0] === o.color)[1]}). Принесите игрушку.` }); return true; }
        patch(o, { toy: c.toy }); c.toy = null;
        broadcast({ t: 'sfx', name: 'click', x: o.x, y: o.y, z: o.z });
        const shelves = G.objs.filter((q) => q.kind === 'shelf');
        if (shelves.every((q) => q.toy)) {
          if (shelves.every((q) => pz.map[q.toy] === q.color)) {
            pz.toysDone = true;
            for (const s of U.switches(G, 'swing')) { s.disabled = false; patch(s, { disabled: false }); }
            broadcast({ t: 'ev', text: 'Игрушки на своих местах. Во дворе скрипнули качели…' });
          } else {
            // не туда — игрушки разлетаются по школе, Воспитательница слышит
            const spots = BR.pickSpots(G.map, G.rnd, 3, { minDist: 0.2 * G.map.maxDist, minSep: 8 });
            shelves.forEach((s, k) => { const p = spots[k] || spots[0]; U.hooks.addObj(G, 'toy', { x: p.x, y: p.y, z: p.z, toy: s.toy }); patch(s, { toy: null }); });
            broadcast({ t: 'ev', text: `«Кто положит не туда — тот останется всегда». Игрушки исчезли с полок! Воспитательница слышит…` });
            alarm(G, c.x, c.y, c.z);
          }
        }
        sendGoals(G);
        return true;
      }
      return false;
    },
    tick(G, players, dt) {
      const pz = G.pz.school;
      if (pz.musicCd > 0) pz.musicCd -= dt;
      if (G.musicT > 0) {
        G.musicT -= dt;
        if (G.musicT <= 0) {
          const box = G.objs.find((o) => o.kind === 'musicbox');
          if (box) { patch(box, { playing: false }); alarm(G, box.x, box.y, box.z); }
          broadcast({ t: 'ev', text: 'Шкатулка замолчала. Воспитательница проснулась.' });
        }
      }
      if (!pz.solved && pz.toysDone && U.groupOn(G, 'swing')) {
        pz.solved = true;
        broadcast({ t: 'ev', text: 'Качели взлетели разом — дверь за сценой актового зала открылась! Слышите барабан?' });
        event(G, 'drum');
        checkSolved(G);
        return true;
      }
      return false;
    },
  },
};
