// Уровень «Затопленный торговый центр».
//  этаж 0 — подземная парковка (канистра с топливом);
//  этаж 1 — затопленный по пояс первый этаж: атриум с фонтаном, магазины, стойка информации (кассета 2);
//  этаж 2 — магазины, комната охраны (предохранитель, кассета 1);
//  этаж 3 — фудкорт, генераторная на крыше, кинотеатр за решёткой: аварийный выход за экраном.
// Атриум открыт с первого этажа до стеклянной крыши, этажи соединяют эскалаторы.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('../build.js') : root.BR;
  const { N, NN, T } = BR;
  const idx = (x, z) => x + z * N;
  const TABLE = 3, COUNTER = 5, SEATS = 8;

  const SHUTTER = idx(22, 33);               // решётка кинотеатра (этаж 3)
  const EXIT_WALL = idx(31, 43), EXIT_FLOOR = idx(31, 42);

  // Магазины по периметру галереи: [x0, z0, x1, z1, дверь x, дверь z, вторая клетка двери]
  function shops() {
    const L = [];
    for (const z0 of [12, 18, 24]) {
      L.push([4, z0, 11, z0 + 6, 11, z0 + 3, [11, z0 + 4]]);   // запад
      L.push([33, z0, 40, z0 + 6, 33, z0 + 3, [33, z0 + 4]]);  // восток
    }
    for (const x0 of [12, 18, 24]) {
      L.push([x0, 4, x0 + 6, 11, x0 + 3, 11, [x0 + 4, 11]]);   // север
      L.push([x0, 33, x0 + 6, 40, x0 + 3, 33, [x0 + 4, 33]]);  // юг
    }
    return L;
  }

  function build(map, rnd, used) {
    map.reserved = new Set();
    map.lv = { tapes: [] };
    const FH = map.FH;
    BR.layerFromGrid(map, 0, BR.gen2d(rnd, { gen: 'halls', p: { walls: 8, blocks: 0 } }));
    for (let f = 1; f <= 3; f++) BR.layerFromGrid(map, f, BR.gen2d(rnd, { gen: 'maze', p: { straight: 0.7, rooms: 4, roomMin: 3, roomMax: 4, loops: 60, pillars: false } }));

    for (let f = 1; f <= 3; f++) {
      // галерея вокруг атриума
      BR.fillRect(map, f, 12, 12, 32, 32, T.FLOOR, 0, true);
      // магазины
      shops().forEach(([x0, z0, x1, z1, dx, dz, d2], k) => {
        if (f === 3 && (z0 === 33 || z0 === 4)) return; // на 3 этаже юг — кино, север — фудкорт
        if (f === 3 && x0 === 33 && z0 === 18) return;   // генераторная
        BR.room(map, f, x0, z0, x1, z1, [[dx, dz], d2]);
        if (f <= 2 && (k * 7 + f) % 3 === 0) map.fx.push({ k: 'dummy', x: (x0 + 3) * 4, z: (z0 + 3) * 4, f, rot: k }); // манекены в витринах
        map.fx.push({ k: 'shopsign', x: (dx + 0.5) * 4, z: (dz + 0.5) * 4, f, n: k + f * 5, horiz: dz === 11 || dz === 33 });
      });
    }
    // главный вход: от точки старта вдоль северной стены и между углами магазинов — в галерею
    BR.fillRect(map, 1, 1, 1, 11, 1, T.FLOOR, 0, true);
    BR.fillRect(map, 1, 11, 1, 11, 11, T.FLOOR, 0, true);
    map.t[1][idx(12, 11)] = T.FLOOR;
    map.fx.push({ k: 'entrance', x: 6 * 4, z: 1.5 * 4, f: 1 });
    // атриум: провал на этажах 2–3 под стеклянной крышей, балкон по краю
    for (let f = 2; f <= 3; f++) BR.fillRect(map, f, 17, 17, 27, 27, T.HOLE);
    for (let z = 17; z <= 27; z++) for (let x = 17; x <= 27; x++) map.glass[idx(x, z)] = 1;
    for (const [x, z] of [[16, 16], [28, 16], [16, 28], [28, 28]]) for (let f = 1; f <= 3; f++) map.t[f][idx(x, z)] = T.WALL; // колонны атриума
    // фонтан в центре (глубокая чаша)
    for (let z = 20; z <= 24; z++) for (let x = 20; x <= 24; x++) { map.t[1][idx(x, z)] = T.POOL; map.a[1][idx(x, z)] = 6; }
    BR.fillRect(map, 0, 19, 19, 25, 25, T.WALL, 0, true); // под чашей — монолит
    map.fx.push({ k: 'fountain', x: 22.5 * 4, y: FH - 1.5, z: 22.5 * 4 });

    // эскалаторы (по две ленты): парковка → 1, 1 → 2 (запад), 2 → 3 (восток)
    BR.placeStair(map, 0, 18, 13, 0, used); BR.placeStair(map, 0, 18, 14, 0, used);
    BR.placeStair(map, 1, 13, 18, 2, used); BR.placeStair(map, 1, 14, 18, 2, used);
    BR.placeStair(map, 2, 31, 26, 3, used); BR.placeStair(map, 2, 30, 26, 3, used);
    map.fx.push({ k: 'escalators' });

    // стойка информации (этаж 1) и кассета 2
    BR.fillRect(map, 1, 25, 13, 28, 13, T.BLOCK, COUNTER);
    map.lv.tapes.push(1 * NN + idx(26, 14));
    // комната охраны (этаж 2): предохранитель и кассета 1
    map.lv.security = 2 * NN + idx(6, 21);
    map.lv.tapes.push(2 * NN + idx(9, 19));
    map.fx.push({ k: 'secroom', x: 5.5 * 4, z: 19.5 * 4, f: 2 });
    // генераторная на крыше (этаж 3)
    BR.room(map, 3, 33, 18, 40, 24, [[33, 21]]);
    map.lv.gen = 3 * NN + idx(37, 21);
    map.fx.push({ k: 'roofgen', x: 37.5 * 4, z: 21.5 * 4, f: 3 });
    // фудкорт (этаж 3, север): открытый зал со стойками и столами
    BR.fillRect(map, 3, 12, 4, 32, 11, T.FLOOR, 0, true);
    BR.fillRect(map, 3, 13, 4, 31, 4, T.BLOCK, COUNTER);
    for (const x of [14, 18, 26, 30]) for (const z of [7, 9]) { map.t[3][idx(x, z)] = T.BLOCK; map.a[3][idx(x, z)] = TABLE; }
    // кинотеатр (этаж 3, юг): решётка с галереи, ряды кресел, экран, аварийный выход
    BR.room(map, 3, 12, 33, 32, 43, []);
    for (const z of [36, 38, 40]) { BR.fillRect(map, 3, 15, z, 21, z, T.BLOCK, SEATS); BR.fillRect(map, 3, 23, z, 29, z, T.BLOCK, SEATS); }
    map.t[3][SHUTTER] = T.FLOOR;                                 // при генерации решётка открыта
    map.lv.shutter = SHUTTER; map.lv.keypad = 3 * NN + idx(21, 31);
    map.exitFixed = { f: 3, wall: EXIT_WALL, floor: EXIT_FLOOR };
    map.fx.push({ k: 'cinema', x: 22.5 * 4, z: 42.9 * 4, f: 3 });

    // парковка: машины; первый этаж: вода по пояс, в фонтане — с головой
    BR.addBlocks(map, rnd, 0, 26, { min: 1, max: 2, aux: 0 });
    BR.addLadders(map, rnd, 0, 1, used);
    for (let f = 0; f <= 3; f++) BR.connectFloor(map, f);
    const wet = [];
    for (let i = 0; i < NN; i++) { const t = map.t[1][i]; if (t === T.FLOOR || t === T.POOL || t === T.BLOCK || t === T.LOW) wet.push(i); }
    BR.addWaterZone(map, wet, FH + 0.9, FH - 1.6);
  }

  // Начальное состояние: решётка кинотеатра опущена
  function after(map) { map.t[3][SHUTTER] = T.WALL; }

  function states(map) {
    return [
      { name: 'старт', apply() {}, need: ['fuelcan', 'mallfuse', 'genroof', 'switch:fuelpump', 'paper', 'keypad'], noExit: true },
      { name: 'кинотеатр открыт', apply() { BR.setCell(map, 3, SHUTTER, T.FLOOR); }, need: [], exit: true },
    ];
  }

  BR.LEVEL_GENS = BR.LEVEL_GENS || {};
  BR.LEVEL_GENS.mall = { build, after, states };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
