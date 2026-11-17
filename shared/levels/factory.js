// Уровень «Фабрика» — финал кампании. Бесконечная вертикальная фабрика.
//  ярус 0 (дно) — печной цех: четыре печи вокруг шахты, раскалённый пол у печей;
//  ярусы 1–3 — цеха с конвейерами, трубы и паропроводы (вентили — ярус 2), мостки вокруг шахты;
//  ярус 4 (верх) — пульт Надсмотрщика: три консоли, его кресло, выход к чёрному небу.
// Шахта в центре открыта с яруса 1 до верха: кольцевые мостки, радиальные мосты (часть рушится в финале),
// спиральные лестницы по сторонам шахты. Гигантские шестерни на стенах шахты.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('../build.js') : root.BR;
  const { N, NN, T } = BR;
  const idx = (x, z) => x + z * N;
  const CONVEYOR = 10, CRATES = 6;
  const S0 = 15, S1 = 29;                          // шахта (внутри)

  function build(map, rnd, used) {
    map.reserved = new Set();
    map.lv = { hot: [], collapse: [] };
    BR.layerFromGrid(map, 0, BR.gen2d(rnd, { gen: 'halls', p: { walls: 10, blocks: 0 } }));
    for (let f = 1; f <= 3; f++) BR.layerFromGrid(map, f, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 14, doorW: 2, pillar: 0.3, cubicle: 0 } }));
    BR.layerFromGrid(map, 4, BR.gen2d(rnd, { gen: 'maze', p: { straight: 0.5, rooms: 6, roomMin: 3, roomMax: 5, loops: 60, pillars: false } }));

    // --- Шахта ---
    for (let f = 0; f < 5; f++) {
      BR.fillRect(map, f, S0 - 1, S0 - 1, S1 + 1, S1 + 1, T.WALL, 0, true);
      BR.fillRect(map, f, S0, S0, S1, S1, f === 0 ? T.FLOOR : T.HOLE);
      if (f > 0) {
        BR.fillRect(map, f, S0, S0, S1, S0, T.FLOOR); BR.fillRect(map, f, S0, S1, S1, S1, T.FLOOR);
        BR.fillRect(map, f, S0, S0, S0, S1, T.FLOOR); BR.fillRect(map, f, S1, S0, S1, S1, T.FLOOR);
        BR.fillRect(map, f, 22, S0, 22, S1, T.FLOOR); BR.fillRect(map, f, S0, 22, S1, 22, T.FLOOR); // мосты крест-накрест
        if (f === 3) { // мосты третьего яруса рушатся в финале (кольцо остаётся)
          for (let k = S0 + 1; k < S1; k++) { map.lv.collapse.push({ f, i: idx(22, k) }); if (k !== 22) map.lv.collapse.push({ f, i: idx(k, 22) }); }
        }
      }
      // входы в шахту с каждой стороны (кроме дна — там печной цех открыт)
      for (const [x, z] of [[22, S0 - 1], [22, S1 + 1], [S0 - 1, 22], [S1 + 1, 22]]) {
        const door = idx(x, z), out = idx(x + Math.sign(x - 22), z + Math.sign(z - 22));
        map.t[f][door] = T.FLOOR;
        BR.carveConnect(map, f, out, new Set([door])); // наружу — к цехам, а не обратно в шахту
      }
    }
    BR.fillRect(map, 0, 21, 21, 23, 23, T.BLOCK, CRATES); // основание шахты — гора шлака
    // печи по углам дна и раскалённый пол перед ними
    map.lv.furnaces = [];
    for (const [x, z] of [[S0 + 2, S0 + 2], [S1 - 2, S0 + 2], [S0 + 2, S1 - 2], [S1 - 2, S1 - 2]]) {
      map.t[0][idx(x, z)] = T.WALL;
      const fx = x + (x < 22 ? 1 : -1), fz = z + (z < 22 ? 1 : -1);
      map.lv.furnaces.push(0 * NN + idx(fx, fz));
      for (const [hx, hz] of [[x + (x < 22 ? 1 : -1), z], [x, z + (z < 22 ? 1 : -1)]]) map.lv.hot.push(idx(hx, hz));
      map.fx.push({ k: 'furnace', x: (x + 0.5) * 4, z: (z + 0.5) * 4, f: 0 });
    }
    // спиральные лестницы по кольцу шахты: 0→1 запад, 1→2 север, 2→3 восток, 3→4 юг
    BR.placeStair(map, 0, S0, 27, 3, used);
    BR.placeStair(map, 1, 18, S0, 0, used);
    BR.placeStair(map, 2, S1, 17, 2, used);
    BR.placeStair(map, 3, 26, S1, 1, used);
    map.fx.push({ k: 'gears', x0: S0, z0: S0, x1: S1, z1: S1, F: map.F });

    // --- Цеха: конвейеры, ящики ---
    for (const f of [1, 2]) BR.addBlocks(map, rnd, f, 10, { min: 2, max: 3, aux: CONVEYOR });
    BR.addBlocks(map, rnd, 0, 10, { min: 1, max: 2, aux: CRATES });
    BR.addBlocks(map, rnd, 3, 8, { min: 1, max: 2, aux: CRATES });

    // --- Пульт Надсмотрщика (ярус 4): три консоли, кресло, выход к чёрному небу ---
    BR.room(map, 4, 32, 30, 43, 42, [[32, 34], [37, 30]]);
    map.lv.consoles = [4 * NN + idx(35, 33), 4 * NN + idx(40, 33), 4 * NN + idx(37, 38)];
    map.lv.throne = 4 * NN + idx(37, 41);
    map.exitFixed = { f: 4, wall: idx(43, 36), floor: idx(42, 36) };
    BR.fillRect(map, 4, 33, 36, 34, 36, T.FLOOR);
    map.fx.push({ k: 'control', x: 37.5 * 4, z: 36.5 * 4, f: 4 });
    // вентили паропроводов (ярус 2)
    for (let k = 0; k < 400; k++) {
      const x = 3 + Math.floor(rnd() * 8), z = 3 + Math.floor(rnd() * 8);
      if (map.reserved.has(idx(x, z))) continue;
      BR.room(map, 2, x, z, x + 5, z + 4, [[x + 2, z + 4], [x + 5, z + 2]]);
      map.lv.pipes = [2 * NN + idx(x + 1, z + 1), 2 * NN + idx(x + 3, z + 1), 2 * NN + idx(x + 1, z + 3)];
      map.lv.scheme = 2 * NN + idx(x + 4, z + 3);
      map.fx.push({ k: 'piperoom', x: (x + 3) * 4, z: (z + 2.5) * 4, f: 2 });
      break;
    }
    BR.addLadders(map, rnd, 1, 1, used);
    BR.addLadders(map, rnd, 2, 1, used);
    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f);
    map.sky = true; // над верхним ярусом — чёрное небо вместо крыши
  }

  function states(map) {
    return [
      { name: 'старт', apply() {}, need: ['furnace', 'pipevalve', 'paper', 'switch:conveyor', 'switch:console', 'ending'] },
      { name: 'мосты третьего яруса обрушились', apply() { for (const c of map.lv.collapse) BR.setCell(map, c.f, c.i, T.HOLE); }, need: ['switch:console', 'ending'], exit: true },
    ];
  }

  BR.LEVEL_GENS = BR.LEVEL_GENS || {};
  BR.LEVEL_GENS.factory = { build, states };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
