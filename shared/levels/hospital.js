// Уровень «Беги!» (LEVEL !): заброшенная больница на два этажа.
// Каждый этаж — четыре широких коридора змейкой. Между коридорами — палаты: одни сквозные (короткий путь
// мимо кроватей, но двери могут захлопнуться), другие — тупики (морг, операционная).
// Этажи соединяет лестничный пролёт. На втором этаже в коридоре обрушился пол — внизу подвал морга.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('../build.js') : root.BR;
  const { N, NN, T, TILE } = BR;
  const idx = (x, z) => x + z * N;
  const BED = 2; // вариант препятствия-блока: кровать

  // Коридоры: [этаж, z верхней полосы] (полоса — 2 клетки), направление чередуется
  const CORR = [[0, 1], [0, 7], [0, 13], [0, 19], [1, 23], [1, 29], [1, 35], [1, 41]];
  const X0 = 2, X1 = 41;

  function build(map, rnd, used) {
    map.reserved = new Set();
    map.lv = { wards: [], corr: CORR };
    // коридоры и повороты
    CORR.forEach(([f, z], k) => {
      BR.fillRect(map, f, X0, z, X1, z + 1, T.FLOOR);
      const next = CORR[k + 1];
      if (!next || next[0] !== f) return;
      const east = k % 2 === 0; // коридоры с чётным номером идут на восток
      BR.fillRect(map, f, east ? X1 - 1 : X0, z + 2, east ? X1 : X0 + 1, next[1] - 1, T.FLOOR);
    });
    BR.fillRect(map, 0, 1, 1, 1, 2, T.FLOOR); // стартовая ниша
    // лестничный пролёт: из конца четвёртого коридора (запад) на второй этаж
    BR.placeStair(map, 0, X0, 21, 2, used); BR.placeStair(map, 0, X0 + 1, 21, 2, used);
    map.fx.push({ k: 'stairwell', x: (X0 + 1) * TILE, z: 22 * TILE });

    // палаты между коридорами
    const slots = [7, 15, 23, 31];
    for (let k = 0; k + 1 < CORR.length; k++) {
      const [f, z] = CORR[k], [f2, z2] = CORR[k + 1];
      if (f !== f2) continue;
      const wz0 = z + 3, wz1 = z2 - 2;            // ряды палаты (между стенами)
      const order = BR.shuffle(rnd, slots);
      order.forEach((wx, n) => {
        const kind = n === 0 ? 'through' : n === 1 ? 'dead' : n === 2 && rnd() < 0.5 ? 'dead' : 'none';
        if (kind === 'none') return;
        BR.fillRect(map, f, wx, wz0, wx + 3, wz1, T.FLOOR);
        const top = idx(wx + 1, wz0 - 1), bot = idx(wx + 2, wz1 + 1);
        if (kind === 'through') {
          map.t[f][top] = T.FLOOR; map.t[f][bot] = T.FLOOR;
          // кровати по углам: путь через палату узкий
          for (const [x, zz] of [[wx, wz0], [wx + 3, wz1]]) { map.t[f][idx(x, zz)] = T.BLOCK; map.a[f][idx(x, zz)] = BED; }
          map.lv.wards.push({ f, doors: [top, bot] });
        } else {
          map.t[f][rnd() < 0.5 ? top : bot] = T.FLOOR;
          const morgue = rnd() < 0.5;
          map.fx.push({ k: morgue ? 'morgue' : 'surgery', x: (wx + 2) * TILE, z: (wz0 + 1) * TILE, f });
        }
      });
    }

    // обрушенный пол на втором этаже (верхняя полоса третьего коридора), внизу — подвал морга
    const cx = 14 + Math.floor(rnd() * 16), cz = CORR[6][1];
    BR.fillRect(map, 1, cx, cz, cx + 3, cz, T.HOLE);
    BR.fillRect(map, 0, cx - 2, cz - 2, cx + 5, cz + 2, T.FLOOR, 0, true);
    BR.placeLadder(map, 0, cx - 2, cz + 2, 1, used);  // из подвала — наверх в коридор
    map.fx.push({ k: 'collapse', x0: cx, x1: cx + 3, z: cz, f: 1 });

    // выход — в конце последнего коридора (запад)
    map.exitFixed = { f: 1, wall: idx(1, CORR[7][1]), floor: idx(X0, CORR[7][1]) };

    // мебель-препятствия по полосам (только для столкновений на клиенте); одна полоса всегда свободна
    const kinds = [['chair', 0.5], ['cabinet', 0.95], ['mattress', 1.1], ['gurney', 1.05], ['cart', 0.8], ['table', 1.0]];
    map.obst = [];
    CORR.forEach(([f, z], k) => {
      let x = k === 0 ? 9 : X0 + 4;
      while (x < X1 - 3) {
        const lane = rnd() < 0.5 ? 0 : 1;
        const [kind, r] = kinds[Math.floor(rnd() * kinds.length)];
        const wx = (x + 0.5) * TILE, wz = (z + lane + 0.5) * TILE;
        const i = idx(x, z + lane);
        if (map.t[f][i] === T.FLOOR && !(f === 1 && z === cz && x >= cx - 1 && x <= cx + 4)) {
          map.obst.push({ kind, x: wx, y: f * map.FH, z: wz, r, rot: rnd() * Math.PI });
        }
        x += 5 + Math.floor(rnd() * 4);
      }
    });
  }

  BR.LEVEL_GENS = BR.LEVEL_GENS || {};
  BR.LEVEL_GENS.hospital = { build };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
