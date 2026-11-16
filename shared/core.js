// Ядро общего кода: константы, типы клеток, генератор случайных чисел.
// Работает и в браузере (window.BR), и в Node (require). Остальные файлы shared/ дополняют этот же объект BR.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? {} : (root.BR = root.BR || {});

  const TILE = 4;          // размер клетки в метрах
  const N = 45;            // карта N x N клеток на каждом этаже
  const NN = N * N;
  const SLAB = 0.3;        // толщина перекрытия между этажами, м
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // направления: 0:+x 1:-x 2:+z 3:-z

  // Типы клеток. Клетка — это кусок этажа 4×4 м высотой в один этаж.
  const T = {
    FLOOR: 0,   // пол
    WALL: 1,    // стена на всю высоту этажа
    HOLE: 2,    // провал: пола нет, видно и можно упасть на этаж ниже
    STAIR: 3,   // лестница/пандус: aux = направление подъёма (0..3) | сегмент << 2 (0 или 1); 2 клетки = 1 этаж
    POOL: 4,    // чаша бассейна: aux = глубина в четвертях метра; пол опущен на глубину
    VENT: 5,    // вентиляционный лаз: потолок на высоте VENT_H, пройти можно только ползком
    LADDER: 6,  // вертикальная лестница у стены: aux = направление на стену; над ней на этаже выше — HOLE
    LOW: 7,     // низкий потолок (душный коридор): потолок на высоте LOW_H
  };
  const VENT_H = 1.15;
  const LOW_H = 2.35;

  // Клетки, по которым можно ходить (у них есть пол)
  const WALKABLE = new Uint8Array(8);
  [T.FLOOR, T.STAIR, T.POOL, T.VENT, T.LADDER, T.LOW].forEach((t) => { WALKABLE[t] = 1; });

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(rnd, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Индексы и координаты
  const cellX = (i) => i % N;
  const cellZ = (i) => (i / N) | 0;
  const inside = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
  const inner = (x, z) => x > 0 && z > 0 && x < N - 1 && z < N - 1;
  const centerX = (i) => (cellX(i) + 0.5) * TILE;
  const centerZ = (i) => (cellZ(i) + 0.5) * TILE;
  const cellAt = (x, z) => {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    return inside(tx, tz) ? tx + tz * N : -1;
  };

  // FNV-1a по байтам массивов — для сравнения карт клиента и сервера
  function hashArrays(arrays) {
    let h = 0x811c9dc5;
    for (const a of arrays) {
      const u8 = a instanceof Uint8Array ? a : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  Object.assign(BR, {
    TILE, N, NN, SLAB, D4, T, WALKABLE, VENT_H, LOW_H,
    mulberry32, shuffle, cellX, cellZ, inside, inner, centerX, centerZ, cellAt, hashArrays,
  });
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
