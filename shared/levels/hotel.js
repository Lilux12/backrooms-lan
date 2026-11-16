// Уровень «Бесконечный отель».
//  этаж 0 — подвал: служебные коридоры, прачечная, котельная;
//  этаж 1 — мраморный холл с колоннами и люстрами, стойка регистрации, столовая и кухня;
//  этажи 2–4 — кольцевой коридор с перекрёстком и одинаковыми дверями номеров (56 номеров на этаж);
//  этаж 5 — пентхаус, выход на крышу к пожарной лестнице.
// Две лестничные клетки ведут с подвала до 4 этажа. На пентхаус — служебная лестница за запертой дверью
// и служебный лифт: оба открываются, когда в ключнице 4 ключа и двое одновременно жмут кнопки лифта.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('../build.js') : root.BR;
  const { N, NN, T } = BR;
  const idx = (x, z) => x + z * N;
  const COUNTER = 5, TABLE = 3, CRATES = 6;

  const SVC_GATE = idx(30, 10);             // дверь служебной лестницы (этаж 4)
  const LIFT = [14, 30];                    // кабина служебного лифта
  const QUADS = [[7, 7], [23, 7], [7, 23], [23, 23]];

  // Этаж с номерами: кольцо коридоров + перекрёсток, номера 3×3 по внешним полосам и в четвертях
  function guestFloor(map, f) {
    const rooms = map.lv.rooms;
    BR.fillRect(map, f, 1, 1, N - 2, N - 2, T.WALL);
    for (const [x0, z0, x1, z1] of [[6, 6, 38, 6], [6, 38, 38, 38], [6, 6, 6, 38], [38, 6, 38, 38], [22, 6, 22, 38], [6, 22, 38, 22]]) BR.fillRect(map, f, x0, z0, x1, z1, T.FLOOR);
    let n = 0;
    const room = (x0, z0, dx, dz) => {
      BR.fillRect(map, f, x0, z0, x0 + 2, z0 + 2, T.FLOOR);
      const door = idx(dx, dz);
      map.t[f][door] = T.FLOOR;
      const cells = [];
      for (let z = z0; z <= z0 + 2; z++) for (let x = x0; x <= x0 + 2; x++) cells.push(idx(x, z));
      // направление от двери в коридор (для таблички с номером)
      const cx = x0 + 1, cz = z0 + 1;
      rooms.push({ f, num: f * 100 + (++n), door, cells, nx: Math.sign(dx - cx), nz: Math.sign(dz - cz) });
    };
    for (let k = 1; k <= 8; k++) {
      const z0 = 2 + 4 * k;
      room(2, z0, 5, z0 + 1); room(40, z0, 39, z0 + 1);
    }
    for (let k = 0; k <= 7; k++) {
      const x0 = 6 + 4 * k;
      room(x0, 2, x0 + 1, 5); room(x0, 40, x0 + 1, 39);
    }
    for (const [qx, qz] of QUADS) {
      for (const z0 of [qz + 1, qz + 5, qz + 9]) { room(qx + 1, z0, qx, z0 + 1); room(qx + 11, z0, qx + 14, z0 + 1); }
    }
    // одна «неправильная» комната на этаж: мебель на потолке
    const odd = rooms.filter((r) => r.f === f);
    const r = odd[(f * 17) % odd.length];
    map.fx.push({ k: 'upside', x: BR.centerX(r.cells[4]), z: BR.centerZ(r.cells[4]), f });
  }

  function build(map, rnd, used) {
    map.reserved = new Set();
    map.lv = { rooms: [], liftDoor: {} };
    // подвал и пентхаус
    BR.layerFromGrid(map, 0, BR.gen2d(rnd, { gen: 'maze', p: { straight: 0.6, rooms: 7, roomMin: 3, roomMax: 5, loops: 70, pillars: false } }));
    BR.layerFromGrid(map, 5, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 16, doorW: 2, pillar: 0.2, cubicle: 0 } }));
    // холл: комнаты + большой мраморный зал с колоннами
    BR.layerFromGrid(map, 1, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 14, doorW: 2, pillar: 0, cubicle: 0 } }));
    BR.fillRect(map, 1, 12, 12, 32, 32, T.FLOOR, 0, true);
    for (let z = 12; z <= 32; z++) for (let x = 12; x <= 32; x++) if ((x - 12) % 5 === 2 && (z - 12) % 5 === 2) map.t[1][idx(x, z)] = T.WALL;
    for (const [x, z] of [[17, 17], [27, 17], [17, 27], [27, 27], [22, 22]]) map.fx.push({ k: 'chandelier', x: x * 4 + 2, z: z * 4 + 2, f: 1 });
    BR.fillRect(map, 1, 18, 14, 26, 14, T.BLOCK, COUNTER);            // стойка регистрации
    map.lv.reception = 1 * NN + idx(22, 15);
    for (const [x, z] of [[12, 22], [32, 22], [22, 12], [22, 32]]) BR.carveConnect(map, 1, idx(x, z));
    BR.addBlocks(map, rnd, 1, 10, { min: 1, max: 2, aux: TABLE, area: [1, 1, 43, 10] });   // столовая
    BR.addBlocks(map, rnd, 1, 8, { min: 1, max: 3, aux: COUNTER, area: [1, 34, 43, 43] }); // кухня
    BR.addBlocks(map, rnd, 0, 12, { min: 1, max: 2, aux: CRATES });                        // прачечная, кладовые
    // этажи с номерами
    for (let f = 2; f <= 4; f++) guestFloor(map, f);

    // лестничные клетки (подвал → 4 этаж) в служебных блоках северо-западной и юго-восточной четвертей
    for (const [x, z] of [[14, 11], [30, 27]]) {
      BR.stairwell(map, x, z, 0, 4);
      for (let f = 2; f <= 4; f++) BR.fillRect(map, f, x - 2, z - 4, x - 2, z - 3, T.FLOOR); // выход прямо в коридор
      map.fx.push({ k: 'stairsign', x: (x - 1.5) * 4, z: (z - 2) * 4, f0: 0, f1: 4 });
    }
    // служебная лестница на пентхаус (этаж 4 → 5), за запертой дверью
    BR.fillRect(map, 4, 29, 8, 31, 14, T.WALL, 0, true);
    BR.fillRect(map, 4, 30, 7, 30, 11, T.FLOOR); // проход к лестнице — до неё, чтобы лестница не прорубила обход двери
    BR.placeStair(map, 4, 30, 12, 2, used);
    map.t[5][idx(30, 14)] = T.FLOOR;
    BR.carveConnect(map, 5, idx(30, 14), new Set([idx(30, 12), idx(30, 13)]));
    map.lv.svcGate = SVC_GATE;
    map.fx.push({ k: 'svcdoor', x: 30.5 * 4, z: 10.5 * 4, f: 4 });

    // служебный лифт (холл → пентхаус): шахта в юго-западном служебном блоке
    const [lx, lz] = LIFT;
    for (let f = 1; f <= 5; f++) {
      BR.room(map, f, lx - 1, lz - 1, lx + 1, lz + 1, [[lx, lz - 1]]);
      if (f >= 2 && f <= 4) BR.fillRect(map, f, lx, 23, lx, lz - 2, T.FLOOR);
      map.lv.liftDoor[f] = f * NN + idx(lx, lz - 2);
    }
    BR.addLift(map, lx, lz, [1, 2, 3, 4, 5], 3);
    map.lifts[map.lifts.length - 1].broken = true; // работает, только когда дали питание

    // выход на крышу: коридор к пожарной лестнице
    BR.fillRect(map, 5, 34, 20, 42, 20, T.FLOOR, 0, true);
    BR.carveConnect(map, 5, idx(34, 20));
    map.exitFixed = { f: 5, wall: idx(43, 20), floor: idx(42, 20) };
    map.fx.push({ k: 'roofsign', x: 41.5 * 4, z: 20.5 * 4, f: 5 });

    // дополнительный спуск в подвал из холла и вентиляция в подвале
    BR.addStairs(map, rnd, 0, 1, used);
    BR.addVents(map, rnd, 0, 4);
    for (const f of [0, 1, 5]) BR.connectFloor(map, f);
    for (let f = 2; f <= 4; f++) BR.connectFloor(map, f);
  }

  // Начальное состояние: служебная дверь заперта
  function after(map) { map.t[4][SVC_GATE] = T.WALL; }

  function states(map) {
    return [
      { name: 'старт', apply() {}, need: ['key', 'keyslot', 'paper', 'switch:liftbtn'], noExit: true },
      { name: 'служебная лестница открыта', apply() { BR.setCell(map, 4, SVC_GATE, T.FLOOR); }, need: [], exit: true },
    ];
  }

  BR.LEVEL_GENS = BR.LEVEL_GENS || {};
  BR.LEVEL_GENS.hotel = { build, after, states };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
