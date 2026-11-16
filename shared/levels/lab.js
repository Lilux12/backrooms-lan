// Уровень «Заброшенная лаборатория».
//  этаж 3 — СИНИЙ сектор (вход): кабинеты, синий допуск; шлюз вниз открывает синий допуск;
//  этаж 2 — ЖЁЛТЫЙ сектор: камеры с «образцами», серверная, журнал с рецептом; шлюз вниз — жёлтый допуск;
//  этаж 1 — КРАСНЫЙ сектор (карантин): станция смешивания реагентов; красный шлюз — в реакторный зал;
//  реакторный зал — колодец через все этажи: ядро в центре, кольцевые мостки и радиальные мосты над бездной,
//  спиральные трапы наверх к аварийному люку (выход), внизу — основание реактора и лестницы со дна.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('../build.js') : root.BR;
  const { N, NN, T } = BR;
  const idx = (x, z) => x + z * N;
  const RACK = 4;

  const H0 = 15, H1 = 29;                      // реакторный зал (внутри), стены — 14 и 30
  const BLUE_GATE = idx(6, 35), YELLOW_GATE = idx(38, 9), RED_GATE = idx(14, 22);
  const EXIT_WALL = idx(30, 26), EXIT_FLOOR = idx(29, 26);

  function build(map, rnd, used) {
    map.reserved = new Set();
    map.lv = {};
    BR.layerFromGrid(map, 0, BR.gen2d(rnd, { gen: 'maze', p: { straight: 0.7, rooms: 3, roomMin: 3, roomMax: 4, loops: 30, pillars: false } }));
    BR.layerFromGrid(map, 1, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 12, doorW: 1, pillar: 0, cubicle: 0 } }));
    BR.layerFromGrid(map, 2, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 12, doorW: 1, pillar: 0, cubicle: 0.4 } }));
    BR.layerFromGrid(map, 3, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 14, doorW: 1, pillar: 0, cubicle: 0.5 } }));

    // --- Реакторный зал ---
    for (let f = 0; f < 4; f++) {
      BR.fillRect(map, f, H0 - 1, H0 - 1, H1 + 1, H1 + 1, T.WALL, 0, true);
      BR.fillRect(map, f, H0, H0, H1, H1, f === 0 ? T.FLOOR : T.HOLE);
      if (f > 0) {
        // кольцевые мостки и радиальные мосты к ядру
        BR.fillRect(map, f, H0, H0, H1, H0, T.FLOOR); BR.fillRect(map, f, H0, H1, H1, H1, T.FLOOR);
        BR.fillRect(map, f, H0, H0, H0, H1, T.FLOOR); BR.fillRect(map, f, H1, H0, H1, H1, T.FLOOR);
        BR.fillRect(map, f, 22, H0, 22, 20, T.FLOOR); BR.fillRect(map, f, 22, 24, 22, H1, T.FLOOR);
        BR.fillRect(map, f, H0, 22, 20, 22, T.FLOOR); BR.fillRect(map, f, 24, 22, H1, 22, T.FLOOR);
      }
      BR.fillRect(map, f, 21, 21, 23, 23, T.WALL);    // ядро реактора
    }
    // на дне: охлаждающая вода вокруг ядра и опоры со стремянками на мостки
    const cool = [];
    for (let z = 19; z <= 25; z++) for (let x = 19; x <= 25; x++) {
      if (x >= 21 && x <= 23 && z >= 21 && z <= 23) continue;
      map.t[0][idx(x, z)] = T.POOL; map.a[0][idx(x, z)] = 4; cool.push(idx(x, z));
    }
    BR.addWaterZone(map, cool, -0.2, -1.2);
    map.t[0][idx(H0, 21)] = T.WALL; BR.placeLadder(map, 0, H0 + 1, 21, 1, used);
    map.t[0][idx(H1, 23)] = T.WALL; BR.placeLadder(map, 0, H1 - 1, 23, 0, used);
    // спиральные трапы: 1 → 2 по западным мосткам, 2 → 3 по восточным
    BR.placeStair(map, 1, H0, 26, 3, used);
    BR.placeStair(map, 2, H1, 18, 2, used);
    map.lv.keys = [1 * NN + idx(20, 22), 1 * NN + idx(22, 20)]; // ключи аварийного сброса — у ядра, на разных мостах
    map.fx.push({ k: 'reactor', x: 22.5 * 4, z: 22.5 * 4, F: map.F });
    // аварийный люк (выход) на 3 этаже зала; снаружи — глухая стена
    BR.fillRect(map, 3, 31, 24, 33, 28, T.WALL, 0, true);
    map.exitFixed = { f: 3, wall: EXIT_WALL, floor: EXIT_FLOOR };

    // --- Красный шлюз: из карантина (этаж 1) в реакторный зал ---
    map.t[1][RED_GATE] = T.FLOOR;
    BR.fillRect(map, 1, 10, 22, 13, 22, T.FLOOR, 0, true);
    BR.carveConnect(map, 1, idx(10, 22));
    map.fx.push({ k: 'airlock', x: 14.5 * 4, z: 22.5 * 4, f: 1, col: 'red' });

    // --- Синий шлюз (этаж 3) и лестница вниз в жёлтый сектор ---
    BR.fillRect(map, 3, 5, 34, 7, 40, T.WALL, 0, true);
    BR.fillRect(map, 2, 5, 34, 7, 40, T.WALL, 0, true);
    // проходы — до лестницы, чтобы она не прорубила себе обход шлюза
    map.t[3][BLUE_GATE] = T.FLOOR; map.t[3][idx(6, 34)] = T.FLOOR;
    map.t[2][idx(6, 39)] = T.FLOOR; map.t[2][idx(6, 40)] = T.FLOOR;
    BR.carveConnect(map, 3, idx(6, 34), new Set([BLUE_GATE]));
    BR.carveConnect(map, 2, idx(6, 40));
    BR.placeStair(map, 2, 6, 38, 3, used);           // подъём с этажа 2 на 3: площадка (6,36) на этаже 3
    map.fx.push({ k: 'airlock', x: 6.5 * 4, z: 35.5 * 4, f: 3, col: 'blue' });

    // --- Жёлтый шлюз (этаж 2) и лестница вниз в красный сектор ---
    BR.fillRect(map, 2, 37, 4, 39, 10, T.WALL, 0, true);
    BR.fillRect(map, 1, 37, 4, 39, 10, T.WALL, 0, true);
    map.t[2][YELLOW_GATE] = T.FLOOR; map.t[2][idx(38, 10)] = T.FLOOR;
    map.t[1][idx(38, 5)] = T.FLOOR; map.t[1][idx(38, 4)] = T.FLOOR;
    BR.carveConnect(map, 2, idx(38, 10), new Set([YELLOW_GATE]));
    BR.carveConnect(map, 1, idx(38, 4));
    BR.placeStair(map, 1, 38, 6, 2, used);           // подъём с этажа 1 на 2: площадка (38,8) на этаже 2
    map.fx.push({ k: 'airlock', x: 38.5 * 4, z: 9.5 * 4, f: 2, col: 'yellow' });

    // --- Содержимое секторов ---
    // камеры с «образцами» (этаж 2): стеклянные кубы, серверные стойки
    BR.addBlocks(map, rnd, 2, 10, { min: 2, max: 3, aux: RACK });
    for (let k = 0, n = 0; k < 300 && n < 6; k++) {
      const i = Math.floor(rnd() * NN);
      if (map.t[2][i] !== T.FLOOR || map.reserved.has(i)) continue;
      map.fx.push({ k: 'specimen', x: BR.centerX(i), z: BR.centerZ(i), f: 2 }); n++;
    }
    // станция смешивания (этаж 1, карантин)
    for (let k = 0; k < 300; k++) {
      const x = 4 + Math.floor(rnd() * 8), z = 4 + Math.floor(rnd() * 8);
      if (map.reserved.has(idx(x, z))) continue;
      BR.room(map, 1, x, z, x + 4, z + 4, [[x + 2, z + 4], [x + 4, z + 2]]);
      map.lv.mixer = 1 * NN + idx(x + 2, z + 2);
      map.lv.reagents = [1 * NN + idx(x + 1, z + 1), 1 * NN + idx(x + 3, z + 1), 1 * NN + idx(x + 1, z + 3)];
      map.fx.push({ k: 'quarantine', x: (x + 2.5) * 4, z: (z + 2.5) * 4, f: 1 });
      break;
    }
    for (let f = 1; f <= 3; f++) BR.addVents(map, rnd, f, 5);
    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f);
  }

  // Начальное состояние: все шлюзы закрыты
  function after(map) {
    map.t[3][BLUE_GATE] = T.WALL; map.t[2][YELLOW_GATE] = T.WALL; map.t[1][RED_GATE] = T.WALL;
  }

  function states(map) {
    const open = (f, i) => BR.setCell(map, f, i, T.FLOOR);
    return [
      { name: 'старт (синий сектор)', apply() {}, need: ['labcard:blue'], noExit: true },
      { name: 'синий шлюз открыт', apply() { open(3, BLUE_GATE); }, need: ['labcard:yellow', 'paper'], noExit: true },
      { name: 'жёлтый шлюз открыт', apply() { open(2, YELLOW_GATE); }, need: ['labcard:red', 'reagent', 'mixer'], noExit: true },
      { name: 'красный шлюз открыт', apply() { open(1, RED_GATE); }, need: ['switch:reactorkey'], exit: true },
    ];
  }

  BR.LEVEL_GENS = BR.LEVEL_GENS || {};
  BR.LEVEL_GENS.lab = { build, after, states };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
