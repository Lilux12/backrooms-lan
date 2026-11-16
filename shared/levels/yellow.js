// Уровень «Жёлтые комнаты»: классика, но разнообразная.
//  этаж 1 (верх) — жёлтый лабиринт комнат; ВЕЛИКИЙ ЗАЛ с колоннами и провалом в центре; «комната вверх дном»
//                  (мебель на потолке); низкие душные участки;
//  этаж 0 (низ)  — мокрый ковёр, затопленные коридоры и БЕСКОНЕЧНЫЙ КОРИДОР через всю карту.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('../build.js') : root.BR;
  const { N, T } = BR;
  const idx = (x, z) => x + z * N;

  function build(map, rnd, used) {
    BR.layerFromGrid(map, 0, BR.gen2d(rnd, { gen: 'maze', p: { straight: 0.55, rooms: 8, roomMin: 3, roomMax: 5, loops: 200, pillars: false } }));
    BR.layerFromGrid(map, 1, BR.gen2d(rnd, { gen: 'maze', p: { straight: 0, rooms: 14, roomMin: 3, roomMax: 7, loops: 140, pillars: true } }));
    map.reserved = new Set();
    map.lv = {};

    // --- Великий зал (этаж 1): 13×13, колонны 3×3 по сетке, в центре — провал на нижний этаж ---
    const S = 13;
    const corners = [[28, 4], [4, 28], [28, 28], [16, 28], [28, 16]];
    const [hx, hz] = corners[Math.floor(rnd() * corners.length)];
    BR.fillRect(map, 1, hx, hz, hx + S - 1, hz + S - 1, T.FLOOR, 0, true);
    for (let z = hz; z < hz + S; z++) for (let x = hx; x < hx + S; x++) {
      if ((x - hx) % 4 === 2 && (z - hz) % 4 === 2 && !(x - hx === 6 && z - hz === 6)) map.t[1][idx(x, z)] = T.WALL;
    }
    // провал 2×2 у центра; внизу — затопленная комната, из которой надо выбраться
    BR.fillRect(map, 1, hx + 5, hz + 5, hx + 6, hz + 6, T.HOLE);
    BR.fillRect(map, 0, hx + 3, hz + 3, hx + 8, hz + 8, T.FLOOR, 0, true);
    for (const [x, z] of [[hx + 3, hz + 2], [hx + 9, hz + 6], [hx + 6, hz + 9]]) BR.carveConnect(map, 0, idx(x, z));
    const landing = [];
    for (let z = hz + 3; z <= hz + 8; z++) for (let x = hx + 3; x <= hx + 8; x++) landing.push(idx(x, z));
    BR.addWaterZone(map, landing, 0.3, 0);
    for (const [x, z] of [[hx - 1, hz + 6], [hx + S, hz + 6], [hx + 6, hz - 1], [hx + 6, hz + S]]) BR.carveConnect(map, 1, idx(x, z));
    map.fx.push({ k: 'hall', x0: hx, z0: hz, x1: hx + S - 1, z1: hz + S - 1, f: 1 });
    map.lv.hall = { x: hx, z: hz, s: S };

    // --- Комната вверх дном (этаж 1): мебель на потолке ---
    for (let k = 0; k < 60; k++) {
      const x0 = 3 + Math.floor(rnd() * (N - 10)), z0 = 3 + Math.floor(rnd() * (N - 10));
      if (x0 + 6 >= hx - 1 && x0 <= hx + S && z0 + 6 >= hz - 1 && z0 <= hz + S) continue; // не на зале
      if (x0 < 6 && z0 < 6) continue; // не у старта
      BR.room(map, 1, x0, z0, x0 + 5, z0 + 5, [[x0 + 2, z0], [x0 + 5, z0 + 3]]);
      map.fx.push({ k: 'upside', x: (x0 + 3) * 4, z: (z0 + 3) * 4, f: 1 });
      break;
    }

    // --- Бесконечный коридор (этаж 0): прямой, через всю карту, с одинаковыми дверями ---
    const cz = 4 + Math.floor(rnd() * (N - 8));
    BR.fillRect(map, 0, 2, cz, N - 3, cz, T.FLOOR);
    map.fx.push({ k: 'endless', z: cz, x0: 2, x1: N - 3, f: 0 });

    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f); // вырезанные зоны могли разорвать этаж — сшиваем
    // --- Связи этажей и атмосфера ---
    BR.addStairs(map, rnd, 0, 3, used);
    BR.addLadders(map, rnd, 0, 3, used);
    BR.addHoles(map, rnd, 1, 6, 2);
    BR.addLow(map, rnd, 1, 7, 5);
    BR.addFlood(map, rnd, 0, 60, 0.25);
    BR.addFlood(map, rnd, 0, 40, 0.25);
    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f); // лестницы могли перегородить коридоры — сшиваем ещё раз
  }

  BR.LEVEL_GENS = BR.LEVEL_GENS || {};
  BR.LEVEL_GENS.yellow = { build };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
