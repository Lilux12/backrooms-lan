// Уровень «Технические тоннели»: три яруса узких тоннелей, трубы и пар.
//  ШАХТА в центре — колодец через два яруса, над пропастью — мостки (упасть = два этажа вниз);
//  КОТЕЛЬНАЯ (ярус 2) — вентиль давления пара;
//  ПАРОВОЙ ШЛЮЗ (ярус 1) — отсек с выходом: шлюз открыт, пока нажаты обе плиты (на разных ярусах) или кнопка изнутри.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('../build.js') : root.BR;
  const { N, NN, T } = BR;
  const idx = (x, z) => x + z * N;

  const GATE = idx(38, 38), INNER = idx(39, 39), PLATE_B = idx(35, 38);
  const EXIT_WALL = idx(43, 38), EXIT_FLOOR = idx(42, 38);

  function build(map, rnd, used) {
    BR.layerFromGrid(map, 0, BR.gen2d(rnd, { gen: 'maze', p: { straight: 0.82, rooms: 4, roomMin: 3, roomMax: 4, loops: 26, pillars: false } }));
    BR.layerFromGrid(map, 1, BR.gen2d(rnd, { gen: 'maze', p: { straight: 0.85, rooms: 3, roomMin: 3, roomMax: 4, loops: 22, pillars: false } }));
    BR.layerFromGrid(map, 2, BR.gen2d(rnd, { gen: 'maze', p: { straight: 0.8, rooms: 4, roomMin: 3, roomMax: 4, loops: 26, pillars: false } }));
    map.reserved = new Set();
    map.lv = {};

    // --- Паровой шлюз и отсек выхода (ярус 1) ---
    BR.room(map, 0, 38, 36, 43, 41, []);
    BR.fillRect(map, 0, 34, 38, 37, 38, T.FLOOR, 0, true);   // подход к шлюзу
    BR.carveConnect(map, 0, idx(34, 38));
    BR.carveConnect(map, 0, idx(36, 38));
    map.t[0][GATE] = T.FLOOR;                                 // при генерации шлюз открыт
    map.lv.gate = GATE; map.lv.inner = INNER; map.lv.plateB = PLATE_B;
    map.exitFixed = { f: 0, wall: EXIT_WALL, floor: EXIT_FLOOR };
    map.fx.push({ k: 'steamgate', x: 38.5 * 4, z: 38.5 * 4, f: 0 });

    // --- Шахта с мостками ---
    const sx = 18 + Math.floor(rnd() * 5), sz = 17 + Math.floor(rnd() * 5);
    BR.fillRect(map, 2, sx - 1, sz - 1, sx + 3, sz + 3, T.FLOOR, 0, true);
    BR.fillRect(map, 1, sx - 1, sz - 1, sx + 3, sz + 3, T.FLOOR, 0, true);
    BR.fillRect(map, 0, sx - 1, sz - 1, sx + 3, sz + 3, T.FLOOR, 0, true);
    BR.fillRect(map, 2, sx, sz, sx + 2, sz + 2, T.HOLE);
    BR.fillRect(map, 1, sx, sz, sx + 2, sz + 2, T.HOLE);
    BR.fillRect(map, 2, sx - 1, sz + 1, sx + 3, sz + 1, T.FLOOR);  // мостки над пропастью
    for (let f = 0; f < 3; f++) for (const [x, z] of [[sx + 1, sz - 2], [sx + 1, sz + 4], [sx - 2, sz + 1], [sx + 4, sz + 1]]) BR.carveConnect(map, f, idx(x, z));
    BR.placeLadder(map, 0, sx - 1, sz + 3, 3, used);              // со дна шахты — наверх
    map.fx.push({ k: 'shaft', x0: sx, z0: sz, x1: sx + 2, z1: sz + 2 });
    map.lv.shaft = { x: sx, z: sz };

    // --- Котельная (ярус 2) ---
    for (let k = 0; k < 80; k++) {
      const bx = 4 + Math.floor(rnd() * (N - 12)), bz = 4 + Math.floor(rnd() * (N - 12));
      if (Math.abs(bx + 2 - (sx + 1)) < 9 && Math.abs(bz + 2 - (sz + 1)) < 9) continue;
      if (bx > 30 && bz > 30) continue;
      BR.room(map, 1, bx, bz, bx + 4, bz + 4, [[bx + 2, bz], [bx + 4, bz + 2]]);
      map.lv.valve = 1 * NN + idx(bx + 2, bz + 2);
      map.fx.push({ k: 'boiler', x: (bx + 2.5) * 4, z: (bz + 2.5) * 4, f: 1 });
      break;
    }

    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f); // вырезанные зоны могли разорвать этаж — сшиваем
    // --- Связи ярусов, лазы, провалы ---
    for (let f = 0; f < 2; f++) { BR.addLadders(map, rnd, f, 4, used); BR.addStairs(map, rnd, f, 1, used); }
    for (let f = 0; f < 3; f++) BR.addVents(map, rnd, f, 8);
    BR.addHoles(map, rnd, 2, 3, 1);
    BR.addHoles(map, rnd, 1, 2, 1);
    // пар из труб в коридорах
    for (let k = 0, n = 0; k < 200 && n < 10; k++) {
      const f = Math.floor(rnd() * 3), i = Math.floor(rnd() * NN);
      if (map.t[f][i] !== T.FLOOR) continue;
      map.fx.push({ k: 'steam', x: BR.centerX(i), y: f * map.FH, z: BR.centerZ(i), small: true });
      n++;
    }
    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f); // лестницы могли перегородить коридоры — сшиваем ещё раз
  }

  // Начальное состояние: шлюз закрыт
  function after(map) { map.t[0][GATE] = T.WALL; }

  // Шаги для проверки проходимости
  function states(map) {
    return [
      { name: 'старт', apply() {}, need: ['steamvalve', 'switch:plates'], noExit: true },
      { name: 'шлюз открыт', apply() { BR.setCell(map, 0, GATE, T.FLOOR); }, need: ['switch:gate'], exit: true },
    ];
  }

  BR.LEVEL_GENS = BR.LEVEL_GENS || {};
  BR.LEVEL_GENS.tunnels = { build, after, states };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
