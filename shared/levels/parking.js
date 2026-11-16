// Уровень «Подземная парковка»: три яруса бетона.
//  ярус 3 (этаж 2) — въезд, будка охраны с рацией и мониторами камер;
//  ярус 2 (этаж 1) — колонны, машины, шлагбаумы;
//  ярус 1 (этаж 0) — затоплен по колено, терминал и генератор у шлагбаума выхода.
// Ярусы связаны двойными пандусами, закрученными спиралью (запад → восток), и лифтовой шахтой в центре.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('../build.js') : root.BR;
  const { N, NN, T } = BR;
  const idx = (x, z) => x + z * N;

  function build(map, rnd, used) {
    for (let f = 0; f < 3; f++) BR.layerFromGrid(map, f, BR.gen2d(rnd, { gen: 'halls', p: { walls: 9 + f * 2, blocks: 0 } }));
    map.reserved = new Set();
    map.lv = {};

    // --- Спиральные пандусы (по две полосы) ---
    const wz = 16 + Math.floor(rnd() * 8), ez = 18 + Math.floor(rnd() * 8);
    BR.placeStair(map, 1, 6, wz, 2, used); BR.placeStair(map, 1, 7, wz, 2, used);        // ярус 2 → 3, запад
    BR.placeStair(map, 0, 37, ez, 3, used); BR.placeStair(map, 0, 38, ez, 3, used);      // ярус 1 → 2, восток
    map.fx.push({ k: 'barrier', x: 6.5 * 4 + 2, z: (wz - 1) * 4 + 2, f: 1, rot: 0 });
    map.fx.push({ k: 'barrier', x: 37.5 * 4 + 2, z: (ez + 1) * 4 + 2, f: 0, rot: 0 });
    map.fx.push({ k: 'rampsign', x: 6.5 * 4 + 2, z: (wz + 3) * 4 + 2, f: 2, text: 'ВЫЕЗД ↓' });

    // --- Будка охраны (ярус 3) ---
    BR.room(map, 2, 15, 2, 21, 7, [[18, 7], [21, 4]]);
    map.lv.radio = 2 * NN + idx(16, 3);
    map.lv.monitor = 2 * NN + idx(20, 3);
    map.fx.push({ k: 'booth', x0: 15, z0: 2, x1: 21, z1: 7, f: 2 });

    // --- Лифтовая шахта в центре: кабина на каждом ярусе ---
    for (let f = 0; f < 3; f++) BR.room(map, f, 21, 21, 23, 23, [[22, 23]]);
    BR.addLift(map, 22, 22, [0, 1, 2], 2);

    // --- Машины: низкие препятствия (через них видно, но не пройти) ---
    for (let f = 0; f < 3; f++) BR.addBlocks(map, rnd, f, 26, { min: 1, max: 2, aux: 0 });

    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f); // вырезанные зоны могли разорвать этаж — сшиваем
    // --- Дополнительные связи ---
    BR.addStairs(map, rnd, 1, 1, used);
    BR.addLadders(map, rnd, 0, 1, used);
    BR.addLadders(map, rnd, 1, 1, used);

    // --- Нижний ярус затоплен по колено ---
    const wet = [];
    for (let i = 0; i < NN; i++) if (map.t[0][i] !== T.WALL) wet.push(i);
    BR.addWaterZone(map, wet, 0.5, 0);
    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f); // лестницы могли перегородить коридоры — сшиваем ещё раз
  }

  BR.LEVEL_GENS = BR.LEVEL_GENS || {};
  BR.LEVEL_GENS.parking = { build };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
