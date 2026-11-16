// Уровень «Офисы»: три этажа бизнес-центра.
//  этаж 1 — кабинеты и кубиклы, атриум на три этажа;
//  этаж 2 — open space: ряды столов, перегородки; СЕРВЕРНАЯ со стойками и камерами наблюдения;
//  этаж 3 — кабинеты; стеклянная ПЕРЕГОВОРНАЯ с терминалом (дверь открывается с ресепшена или изнутри).
// Лифтовая шахта связывает все этажи.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('../build.js') : root.BR;
  const { N, NN, T } = BR;
  const idx = (x, z) => x + z * N;
  const DESK = 1, TABLE = 3, RACK = 4;

  function free(map, x0, z0, x1, z1) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!BR.inner(x, z)) return false;
      const i = idx(x, z);
      if (map.reserved.has(i)) return false;
      for (let f = 0; f < map.F; f++) { const t = map.t[f][i]; if (t === T.HOLE || t === T.STAIR || t === T.LADDER) return false; }
    }
    return true;
  }

  function build(map, rnd, used) {
    BR.layerFromGrid(map, 0, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 10, doorW: 1, pillar: 0, cubicle: 0.7 } }));
    BR.layerFromGrid(map, 1, BR.gen2d(rnd, { gen: 'halls', p: { walls: 8, blocks: 0 } }));
    BR.layerFromGrid(map, 2, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 12, doorW: 1, pillar: 0, cubicle: 0.6 } }));
    map.reserved = new Set();
    map.lv = {};
    const atr = BR.addAtrium(map, rnd, 0, 4);
    if (atr) BR.reserveRect(map, atr.x0 - 1, atr.z0 - 1, atr.x0 + atr.s, atr.z0 + atr.s);

    // --- Переговорная (этаж 3): стол, терминал, стеклянная дверь ---
    for (let k = 0; k < 200; k++) {
      const cx = 3 + Math.floor(rnd() * (N - 11)), cz = 3 + Math.floor(rnd() * (N - 10));
      if (cx < 8 && cz < 8) continue;
      if (!free(map, cx - 1, cz - 1, cx + 7, cz + 6)) continue;
      BR.room(map, 2, cx, cz, cx + 6, cz + 4, []);
      BR.fillRect(map, 2, cx + 2, cz + 2, cx + 4, cz + 2, T.BLOCK, TABLE);
      const gate = idx(cx + 3, cz + 4);
      map.t[2][gate] = T.FLOOR;                             // при генерации дверь открыта
      BR.fillRect(map, 2, cx + 3, cz + 5, cx + 3, cz + 5, T.FLOOR, 0, true);
      BR.carveConnect(map, 2, idx(cx + 3, cz + 5), new Set([gate]));
      map.lv.gate = gate; map.lv.outside = 2 * NN + idx(cx + 3, cz + 5);
      map.lv.keypad = 2 * NN + idx(cx + 1, cz + 1);
      map.lv.inner = 2 * NN + idx(cx + 5, cz + 3);
      map.fx.push({ k: 'glassroom', x0: cx, z0: cz, x1: cx + 6, z1: cz + 4, f: 2 });
      break;
    }

    // --- Серверная (этаж 2): стойки, камеры ---
    for (let k = 0; k < 200; k++) {
      const rx = 3 + Math.floor(rnd() * (N - 10)), rz = 3 + Math.floor(rnd() * (N - 10));
      if (!free(map, rx - 1, rz - 1, rx + 7, rz + 7)) continue;
      BR.room(map, 1, rx, rz, rx + 6, rz + 6, [[rx + 3, rz], [rx + 6, rz + 4]]);
      for (const z of [rz + 2, rz + 4]) BR.fillRect(map, 1, rx + 1, z, rx + 4, z, T.BLOCK, RACK);
      map.lv.cctv = 1 * NN + idx(rx + 5, rz + 1);
      map.fx.push({ k: 'serverroom', x0: rx, z0: rz, x1: rx + 6, z1: rz + 6, f: 1 });
      break;
    }

    // --- Лифтовая шахта ---
    for (let k = 0; k < 200; k++) {
      const lx = 4 + Math.floor(rnd() * (N - 8)), lz = 4 + Math.floor(rnd() * (N - 8));
      if (lx < 7 && lz < 7) continue;
      if (!free(map, lx - 1, lz - 1, lx + 1, lz + 2)) continue;
      for (let f = 0; f < 3; f++) BR.room(map, f, lx - 1, lz - 1, lx + 1, lz + 1, [[lx, lz + 1]]);
      BR.addLift(map, lx, lz, [0, 1, 2], 2);
      break;
    }

    // --- Столы open space ---
    BR.addBlocks(map, rnd, 1, 34, { min: 1, max: 3, aux: DESK });
    BR.addBlocks(map, rnd, 0, 8, { min: 1, max: 2, aux: DESK });
    BR.addBlocks(map, rnd, 2, 8, { min: 1, max: 2, aux: DESK });

    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f); // вырезанные зоны могли разорвать этаж — сшиваем
    for (let f = 0; f < 2; f++) { BR.addStairs(map, rnd, f, 2, used); BR.addLadders(map, rnd, f, 1, used); }
    BR.addLow(map, rnd, 1, 4, 4);
    for (let f = 0; f < 3; f++) BR.addVents(map, rnd, f, 3);
    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f); // лестницы могли перегородить коридоры — сшиваем ещё раз
  }

  // Начальное состояние: дверь переговорной закрыта
  function after(map) { if (map.lv.gate != null) map.t[2][map.lv.gate] = T.WALL; }

  function states(map) {
    return [
      { name: 'старт', apply() {}, need: ['fuse', 'box', 'digit', 'switch:reception', 'monitor'] },
      { name: 'переговорная открыта', apply() { BR.setCell(map, 2, map.lv.gate, T.FLOOR); }, need: ['keypad', 'switch:inner'], exit: true },
    ];
  }

  BR.LEVEL_GENS = BR.LEVEL_GENS || {};
  BR.LEVEL_GENS.offices = { build, after, states };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
