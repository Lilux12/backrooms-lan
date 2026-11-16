// Уровень «Детская» (заброшенная школа). Всё здесь в два раза больше: потолки под пять метров,
// парты выше головы — вы как ребёнок.
//  этаж 0 — подвал-котельная;
//  этаж 1 — классы с гигантскими партами, лабиринт из картонных коробок в игровой, актовый зал со сценой
//           (выход — за сценой), спортзал;
//  этаж 2 — коридоры, кабинеты, БИБЛИОТЕКА со стеллажами-коридорами (заперта, пока не собрана картина-пазл).
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('../build.js') : root.BR;
  const { N, NN, T } = BR;
  const idx = (x, z) => x + z * N;
  const CRATES = 6, SHELF = 7, DESK = 9;

  const LIB_GATE = idx(12, 16);

  // Лабиринт из коробок: стены лабиринта — низкие препятствия (через них видно, но не пройти)
  function boxMaze(map, rnd, f, x0, z0, w, h) {
    const g = new Uint8Array(w * h).fill(1);
    const at = (x, z) => g[x + z * w];
    const st = [[1, 1]]; g[1 + w] = 0;
    while (st.length) {
      const [cx, cz] = st[st.length - 1];
      const opts = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dz]) => cx + dx > 0 && cz + dz > 0 && cx + dx < w - 1 && cz + dz < h - 1 && at(cx + dx, cz + dz));
      if (!opts.length) { st.pop(); continue; }
      const [dx, dz] = opts[Math.floor(rnd() * opts.length)];
      g[(cx + dx / 2) + (cz + dz / 2) * w] = 0; g[(cx + dx) + (cz + dz) * w] = 0;
      st.push([cx + dx, cz + dz]);
    }
    // петли — чтобы были развилки
    for (let k = 0; k < 10; k++) { const x = 1 + Math.floor(rnd() * (w - 2)), z = 1 + Math.floor(rnd() * (h - 2)); if ((x + z) % 2) g[x + z * w] = 0; }
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const i = idx(x0 + x, z0 + z);
      if (at(x, z) && x > 0 && z > 0 && x < w - 1 && z < h - 1) { map.t[f][i] = T.BLOCK; map.a[f][i] = CRATES; }
      else map.t[f][i] = T.FLOOR;
    }
  }

  function build(map, rnd, used) {
    map.reserved = new Set();
    map.lv = {};
    BR.layerFromGrid(map, 0, BR.gen2d(rnd, { gen: 'maze', p: { straight: 0.6, rooms: 5, roomMin: 3, roomMax: 4, loops: 50, pillars: false } }));
    BR.layerFromGrid(map, 1, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 12, doorW: 2, pillar: 0, cubicle: 0 } }));
    BR.layerFromGrid(map, 2, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 10, doorW: 1, pillar: 0, cubicle: 0 } }));

    // --- Актовый зал (этаж 1): сцена, выход за сценой ---
    BR.room(map, 1, 26, 26, 43, 43, [[26, 33], [26, 34], [33, 26], [34, 26]]);
    BR.fillRect(map, 1, 29, 41, 40, 42, T.BLOCK, CRATES);           // сцена
    for (const z of [31, 34, 37]) { BR.fillRect(map, 1, 28, z, 32, z, T.BLOCK, DESK); BR.fillRect(map, 1, 36, z, 41, z, T.BLOCK, DESK); } // ряды стульев
    map.exitFixed = { f: 1, wall: idx(43, 39), floor: idx(42, 39) };
    map.lv.board = 1 * NN + idx(28, 28);
    map.fx.push({ k: 'stage', x: 34.5 * 4, z: 42 * 4, f: 1 });

    // --- Игровая: лабиринт из картонных коробок ---
    BR.room(map, 1, 1, 27, 17, 43, [[17, 34], [9, 27]]);
    boxMaze(map, rnd, 1, 2, 28, 15, 15);
    map.fx.push({ k: 'playroom', x: 9.5 * 4, z: 35.5 * 4, f: 1 });

    // --- Гигантские парты в классах ---
    BR.addBlocks(map, rnd, 1, 18, { min: 1, max: 2, aux: DESK, area: [1, 1, 25, 25] });
    BR.addBlocks(map, rnd, 2, 12, { min: 1, max: 2, aux: DESK });

    // --- Библиотека (этаж 2): стеллажи-коридоры, дверь заперта ---
    BR.room(map, 2, 4, 4, 20, 16, []);
    for (const z of [7, 10, 13]) { BR.fillRect(map, 2, 6, z, 10, z, T.BLOCK, SHELF); BR.fillRect(map, 2, 14, z, 18, z, T.BLOCK, SHELF); }
    map.t[2][LIB_GATE] = T.FLOOR;
    BR.fillRect(map, 2, 12, 17, 12, 17, T.FLOOR, 0, true);
    BR.carveConnect(map, 2, idx(12, 17), new Set([LIB_GATE]));
    map.lv.libGate = LIB_GATE;
    map.lv.shelves = [2 * NN + idx(6, 5), 2 * NN + idx(12, 5), 2 * NN + idx(18, 5)];
    map.lv.rhyme = 2 * NN + idx(12, 12);
    map.fx.push({ k: 'library', x: 12.5 * 4, z: 10.5 * 4, f: 2 });

    // --- Связи этажей ---
    BR.addStairs(map, rnd, 0, 1, used);
    BR.addStairs(map, rnd, 1, 2, used);
    BR.addLadders(map, rnd, 1, 1, used);
    // детские рисунки на стенах (оживают по ходу уровня)
    for (let k = 0, n = 0; k < 400 && n < 14; k++) {
      const f = 1 + Math.floor(rnd() * 2), i = Math.floor(rnd() * NN);
      if (map.t[f][i] !== T.FLOOR) continue;
      map.fx.push({ k: 'drawing', x: BR.centerX(i), z: BR.centerZ(i), f, n: k }); n++;
    }
    map.fx.push({ k: 'boilerroom', x: 22 * 4, z: 22 * 4, f: 0 });
    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f);
  }

  // Начальное состояние: библиотека заперта
  function after(map) { map.t[2][LIB_GATE] = T.WALL; }

  function states(map) {
    return [
      { name: 'старт', apply() {}, need: ['puzzlepiece', 'puzzleboard', 'toy', 'musicbox', 'switch:swing'] },
      { name: 'библиотека открыта', apply() { BR.setCell(map, 2, LIB_GATE, T.FLOOR); }, need: ['shelf', 'paper'], exit: true },
    ];
  }

  BR.LEVEL_GENS = BR.LEVEL_GENS || {};
  BR.LEVEL_GENS.school = { build, after, states };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
