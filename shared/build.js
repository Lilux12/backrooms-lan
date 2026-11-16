// Сборка многоэтажного уровня: этажи из 2D-генераторов + вертикальные связи
// (лестницы, вертикальные лестницы, провалы, атриумы), вода, лазы, низкие потолки
// и финальный «ремонт»: из любой достижимой точки обязан быть путь обратно к старту.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('./world.js') : root.BR;
  const { N, NN, D4, T, inner, cellX, cellZ } = BR;

  const isFlat = (t) => t === T.FLOOR || t === T.LOW;
  const idx = (x, z) => x + z * N;
  const step = (i, d, k = 1) => {
    const x = cellX(i) + D4[d][0] * k, z = cellZ(i) + D4[d][1] * k;
    return inner(x, z) ? idx(x, z) : -1;
  };

  // Записать 2D-сетку (1 — стена) в этаж f
  function layerFromGrid(map, f, g) {
    for (let i = 0; i < NN; i++) map.t[f][i] = g[i] ? T.WALL : T.FLOOR;
  }

  // Прорубить проход от клетки i этажа f к ближайшему полу (кроме клеток из avoid)
  function carveConnect(map, f, i, avoid = new Set()) {
    const L = map.t[f];
    if (L[i] === T.WALL) L[i] = T.FLOOR;
    for (let d = 0; d < 4; d++) {
      const j = step(i, d);
      if (j >= 0 && isFlat(L[j]) && !avoid.has(j)) return true;
    }
    const prev = new Int32Array(NN).fill(-2);
    prev[i] = -1;
    const q = [i];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      for (let d = 0; d < 4; d++) {
        const j = step(c, d);
        if (j < 0 || prev[j] !== -2) continue;
        if (isFlat(L[j]) && !avoid.has(j) && c !== i) {
          for (let p = c; p !== i && p >= 0; p = prev[p]) if (L[p] === T.WALL) L[p] = T.FLOOR;
          return true;
        }
        if (L[j] !== T.WALL) continue;
        prev[j] = c; q.push(j);
      }
    }
    return false;
  }

  const reserved = (map, i) => !!(map.reserved && map.reserved.has(i));
  const farFrom = (list, i, sep) => list.every((j) => Math.max(Math.abs(cellX(j) - cellX(i)), Math.abs(cellZ(j) - cellZ(i))) >= sep);

  // Лестницы с этажа f на f+1: 2 клетки ската + площадка наверху
  function addStairs(map, rnd, f, count, used = []) {
    if (f + 1 >= map.F) return 0;
    const L = map.t[f], U = map.t[f + 1];
    const cands = [];
    for (let k = 0; k < 600; k++) {
      const cb = Math.floor(rnd() * NN), d = Math.floor(rnd() * 4);
      if (!inner(cellX(cb), cellZ(cb)) || !isFlat(L[cb])) continue;
      const c0 = step(cb, d), c1 = step(cb, d, 2), c2 = step(cb, d, 3);
      if (c0 < 0 || c1 < 0 || c2 < 0) continue;
      if (![c0, c1].every((c) => L[c] === T.FLOOR || L[c] === T.WALL || L[c] === T.LOW)) continue;
      if (![c0, c1].every((c) => U[c] === T.FLOOR || U[c] === T.WALL || U[c] === T.LOW)) continue;
      if (!(U[c2] === T.FLOOR || U[c2] === T.WALL || U[c2] === T.LOW)) continue;
      if (!farFrom(used, c0, 4) || [cb, c0, c1, c2].some((c) => reserved(map, c))) continue;
      // чем меньше прорубать, тем лучше: лестница встраивается в существующие проходы
      const score = (isFlat(L[c0]) ? 1 : 0) + (isFlat(L[c1]) ? 1 : 0) + (isFlat(U[c2]) ? 2 : 0) + rnd() * 0.5;
      cands.push({ cb, d, c0, c1, c2, score });
    }
    cands.sort((a, b) => b.score - a.score);
    let n = 0;
    for (const c of cands) {
      if (n >= count) break;
      if (!farFrom(used, c.c0, 4)) continue;
      L[c.c0] = T.STAIR; map.a[f][c.c0] = c.d;
      L[c.c1] = T.STAIR; map.a[f][c.c1] = c.d | 4;
      U[c.c0] = T.HOLE; U[c.c1] = T.HOLE;
      if (U[c.c2] === T.WALL) U[c.c2] = T.FLOOR;
      carveConnect(map, f + 1, c.c2, new Set([c.c0, c.c1]));
      used.push(c.c0, c.c1);
      n++;
    }
    return n;
  }

  // Вертикальные лестницы у стены с этажа f на f+1
  function addLadders(map, rnd, f, count, used = []) {
    if (f + 1 >= map.F) return 0;
    const L = map.t[f], U = map.t[f + 1];
    let n = 0;
    for (let k = 0; k < 800 && n < count; k++) {
      const c = Math.floor(rnd() * NN), d = Math.floor(rnd() * 4);
      if (!inner(cellX(c), cellZ(c)) || L[c] !== T.FLOOR) continue;
      const w = step(c, d);
      if (w < 0 || L[w] !== T.WALL || reserved(map, c) || reserved(map, w)) continue;
      if (!(U[c] === T.FLOOR || U[c] === T.WALL)) continue;
      if (!(U[w] === T.FLOOR || U[w] === T.WALL || U[w] === T.LOW)) continue;
      if (!farFrom(used, c, 5)) continue;
      L[c] = T.LADDER; map.a[f][c] = d;
      U[c] = T.HOLE;
      if (U[w] !== T.FLOOR) U[w] = T.FLOOR;
      carveConnect(map, f + 1, w, new Set([c]));
      used.push(c); n++;
    }
    return n;
  }

  // Провалы в полу этажа f (f ≥ 1): падение на этаж ниже
  function addHoles(map, rnd, f, count, maxSize = 2) {
    if (f < 1) return 0;
    const L = map.t[f], D = map.t[f - 1];
    let n = 0;
    for (let k = 0; k < 600 && n < count; k++) {
      const c = Math.floor(rnd() * NN);
      const w = 1 + Math.floor(rnd() * maxSize), h = 1 + Math.floor(rnd() * maxSize);
      const x0 = cellX(c), z0 = cellZ(c);
      const cells = [];
      let ok = true;
      for (let z = z0; z < z0 + h && ok; z++) for (let x = x0; x < x0 + w; x++) {
        if (!inner(x, z)) { ok = false; break; }
        const i = idx(x, z);
        if (L[i] !== T.FLOOR || D[i] !== T.FLOOR || reserved(map, i)) { ok = false; break; }
        cells.push(i);
      }
      if (!ok) continue;
      for (const i of cells) L[i] = T.HOLE;
      n++;
    }
    return n;
  }

  // Атриум: прямоугольник, открытый с этажа fFrom до верха; вокруг на верхних этажах — балкон
  function addAtrium(map, rnd, fFrom, size) {
    const s = size;
    for (let k = 0; k < 200; k++) {
      const x0 = 3 + Math.floor(rnd() * (N - s - 6)), z0 = 3 + Math.floor(rnd() * (N - s - 6));
      const cells = [];
      for (let z = z0; z < z0 + s; z++) for (let x = x0; x < x0 + s; x++) cells.push(idx(x, z));
      if (cells.some((i) => map.t.some((L) => L[i] === T.STAIR || L[i] === T.LADDER))) continue;
      const ring = [];
      for (let z = z0 - 1; z <= z0 + s; z++) for (let x = x0 - 1; x <= x0 + s; x++) {
        if (x >= x0 && x < x0 + s && z >= z0 && z < z0 + s) continue;
        ring.push(idx(x, z));
      }
      if (ring.some((i) => map.t.some((L) => L[i] === T.STAIR || L[i] === T.LADDER))) continue;
      for (const i of cells) if (map.t[fFrom][i] === T.WALL || map.t[fFrom][i] === T.LOW) map.t[fFrom][i] = T.FLOOR;
      for (const i of ring) if (map.t[fFrom][i] === T.WALL) map.t[fFrom][i] = T.FLOOR;
      for (let f = fFrom + 1; f < map.F; f++) {
        for (const i of cells) map.t[f][i] = T.HOLE;
        for (const i of ring) if (map.t[f][i] !== T.HOLE) map.t[f][i] = T.FLOOR;
        carveConnect(map, f, ring[Math.floor(rnd() * ring.length)], new Set(cells));
      }
      carveConnect(map, fFrom, ring[0], new Set(cells));
      return { x0, z0, s, cells };
    }
    return null;
  }

  // Новая зона воды с уровнем поверхности level
  // bottom — дно зоны: ниже него в этих колонках воды нет (этажи под бассейном сухие)
  function addWaterZone(map, cells, level, bottom) {
    const zone = map.wl.length;
    map.wl.push(level);
    map.wb.push(bottom);
    for (const i of cells) map.wz[i] = zone;
    return zone;
  }

  // Бассейны на этаже f: прямоугольники внутри комнат, вокруг — бортик
  function addPools(map, rnd, f, count, o = {}) {
    const L = map.t[f], b = f * map.FH;
    const minS = o.min || 2, maxS = o.max || 4, depth = o.depth || 2.5;
    const pools = [];
    for (let k = 0; k < 800 && pools.length < count; k++) {
      const w = minS + Math.floor(rnd() * (maxS - minS + 1)), h = minS + Math.floor(rnd() * (maxS - minS + 1));
      const x0 = 2 + Math.floor(rnd() * (N - w - 4)), z0 = 2 + Math.floor(rnd() * (N - h - 4));
      let ok = true;
      for (let z = z0 - 1; z <= z0 + h && ok; z++) for (let x = x0 - 1; x <= x0 + w; x++) {
        const t = L[idx(x, z)];
        if (t !== T.FLOOR || (f > 0 && map.t[f - 1][idx(x, z)] !== T.WALL)) { ok = false; break; }
        if (f + 1 < map.F && map.t[f + 1][idx(x, z)] === T.STAIR) { ok = false; break; }
      }
      if (!ok) continue;
      const cells = [];
      for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) {
        const i = idx(x, z);
        L[i] = T.POOL; map.a[f][i] = Math.round(depth * 4); cells.push(i);
      }
      addWaterZone(map, cells, b - 0.3, b - depth);
      pools.push({ x0, z0, w, h, cells });
    }
    return pools;
  }

  // Затопленный участок (вода поверх пола): связная область вокруг случайной клетки
  function addFlood(map, rnd, f, size, level) {
    const L = map.t[f], b = f * map.FH;
    for (let k = 0; k < 100; k++) {
      const s = Math.floor(rnd() * NN);
      if (L[s] !== T.FLOOR || map.wz[s] >= 0) continue;
      const cells = [s], seen = new Set(cells);
      for (let h = 0; h < cells.length && cells.length < size; h++) {
        for (let d = 0; d < 4; d++) {
          const j = step(cells[h], d);
          if (j < 0 || seen.has(j) || L[j] !== T.FLOOR || map.wz[j] >= 0) continue;
          seen.add(j); cells.push(j);
        }
      }
      if (cells.length < size / 2) continue;
      return addWaterZone(map, cells, b + level, b);
    }
    return -1;
  }

  // Вентиляционные лазы сквозь стены (1–2 клетки)
  function addVents(map, rnd, f, count) {
    const L = map.t[f];
    let n = 0;
    for (let k = 0; k < 900 && n < count; k++) {
      const w = Math.floor(rnd() * NN), d = Math.floor(rnd() * 4);
      if (!inner(cellX(w), cellZ(w)) || L[w] !== T.WALL || reserved(map, w)) continue;
      const a = step(w, d ^ 1), b1 = step(w, d), b2 = step(w, d, 2);
      if (a < 0 || b1 < 0 || !isFlat(L[a])) continue;
      if (L[b1] === T.FLOOR) { L[w] = T.VENT; n++; continue; }
      if (b2 >= 0 && L[b1] === T.WALL && L[b2] === T.FLOOR && !reserved(map, b1)) { L[w] = T.VENT; L[b1] = T.VENT; n++; } // сквозь «знаковую» стену лаз не ведём
    }
    return n;
  }

  // Низкие душные участки коридоров
  function addLow(map, rnd, f, count, len = 4) {
    const L = map.t[f];
    let n = 0;
    for (let k = 0; k < 500 && n < count; k++) {
      let c = Math.floor(rnd() * NN);
      if (L[c] !== T.FLOOR) continue;
      for (let s = 0; s < len; s++) {
        if (L[c] !== T.FLOOR || reserved(map, c)) break;
        if (f + 1 < map.F && map.t[f + 1][c] === T.HOLE) break;
        L[c] = T.LOW;
        const nb = [0, 1, 2, 3].map((d) => step(c, d)).filter((j) => j >= 0 && L[j] === T.FLOOR);
        if (!nb.length) break;
        c = nb[Math.floor(rnd() * nb.length)];
      }
      n++;
    }
    return n;
  }

  // Проверка лестниц: пара сегментов и площадка наверху, иначе разбираем
  function fixStairs(map) {
    for (let f = 0; f < map.F; f++) {
      for (let i = 0; i < NN; i++) {
        if (map.t[f][i] !== T.STAIR) continue;
        const d = BR.stairDir(map.a[f][i]), s = BR.stairSeg(map.a[f][i]);
        const other = step(i, s ? d ^ 1 : d);
        const top = s ? step(i, d) : step(i, d, 2);
        const pairOk = other >= 0 && map.t[f][other] === T.STAIR && BR.stairDir(map.a[f][other]) === d && BR.stairSeg(map.a[f][other]) !== s;
        const topOk = top >= 0 && f + 1 < map.F && BR.WALKABLE[map.t[f + 1][top]] && map.t[f + 1][i] === T.HOLE;
        if (!pairOk || !topOk) {
          map.t[f][i] = T.FLOOR; map.a[f][i] = 0;
          if (f + 1 < map.F && map.t[f + 1][i] === T.HOLE) map.t[f + 1][i] = T.FLOOR;
        }
      }
    }
  }

  // Соединить все связные куски пола этажа f с самым большим: коридоры сквозь стены в обход зарезервированных клеток
  function connectFloor(map, f) {
    const L = map.t[f];
    const walk = (i) => isFlat(L[i]) || L[i] === T.LADDER;
    const skipped = new Set(); // клетки кусков, к которым не пробиться (например, чаша бассейна) — их не трогаем
    for (let guard = 0; guard < 80; guard++) {
      const comp = new Int32Array(NN).fill(-1), sizes = [], skip = [];
      for (let i = 0; i < NN; i++) {
        if (!walk(i) || comp[i] >= 0) continue;
        const id = sizes.length, q = [i];
        comp[i] = id;
        for (let h = 0; h < q.length; h++) for (let d = 0; d < 4; d++) {
          const j = step(q[h], d);
          if (j >= 0 && walk(j) && comp[j] < 0) { comp[j] = id; q.push(j); }
        }
        sizes.push(q.length);
        skip.push(q.some((c) => skipped.has(c)));
      }
      const main = sizes.indexOf(Math.max(...sizes));
      let small = -1;
      for (let c = 0; c < sizes.length; c++) if (c !== main && !skip[c] && (small < 0 || sizes[c] < sizes[small])) small = c;
      if (small < 0) return;
      // BFS от куска сквозь стены до любого другого куска
      const prev = new Int32Array(NN).fill(-2), q = [];
      for (let i = 0; i < NN; i++) if (comp[i] === small) { prev[i] = -1; q.push(i); }
      let hit = -1;
      for (let h = 0; h < q.length && hit < 0; h++) {
        for (let d = 0; d < 4; d++) {
          const j = step(q[h], d);
          if (j < 0 || prev[j] !== -2) continue;
          if (comp[j] >= 0 && comp[j] !== small) { prev[j] = q[h]; hit = j; break; }
          if (L[j] !== T.WALL || reserved(map, j)) continue;
          prev[j] = q[h]; q.push(j);
        }
      }
      if (hit < 0) { for (let i = 0; i < NN; i++) if (comp[i] === small) skipped.add(i); continue; }
      for (let p = prev[hit]; p >= 0 && prev[p] !== -1; p = prev[p]) if (L[p] === T.WALL) L[p] = T.FLOOR;
    }
  }

  // Мост между зоной «ловушки» и зоной, откуда можно вернуться к старту, на одном этаже:
  // кратчайший коридор сквозь стены. Возвращает true, если что-то прорублено.
  function bridgeFloor(map, f, reach, back) {
    const L = map.t[f];
    const good = (i) => back[f * NN + i] >= 0 && isFlat(L[i]);
    const trap = (i) => reach[f * NN + i] >= 0 && back[f * NN + i] < 0 && isFlat(L[i]);
    const prev = new Int32Array(NN).fill(-2);
    const q = [];
    let anyTrap = false;
    for (let i = 0; i < NN; i++) { if (good(i)) { prev[i] = -1; q.push(i); } else if (trap(i)) anyTrap = true; }
    if (!q.length || !anyTrap) return false;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      for (let d = 0; d < 4; d++) {
        const j = step(c, d);
        if (j < 0 || prev[j] !== -2) continue;
        if (trap(j)) {
          for (let p = c; p >= 0 && prev[p] !== -1; p = prev[p]) if (L[p] === T.WALL) L[p] = T.FLOOR;
          return true;
        }
        if (L[j] !== T.WALL || reserved(map, j)) continue; // «знаковую» архитектуру (шлюзы, отсеки) не трогаем
        prev[j] = c; q.push(j);
      }
    }
    return false;
  }

  // Аварийная вертикальная лестница из зоны-ловушки на этаже f на этаж выше, в «хорошую» зону
  function escapeLadder(map, f, reach, back) {
    if (f + 1 >= map.F) return false;
    const L = map.t[f], U = map.t[f + 1];
    for (const preferWall of [true, false]) {
      for (let i = 0; i < NN; i++) {
        if (L[i] !== T.FLOOR || !(reach[f * NN + i] >= 0 && back[f * NN + i] < 0) || reserved(map, i)) continue;
        if (preferWall ? U[i] !== T.WALL : !(U[i] === T.WALL || U[i] === T.FLOOR)) continue;
        for (let d = 0; d < 4; d++) {
          const w = step(i, d);
          if (w < 0 || L[w] !== T.WALL || !isFlat(U[w]) || back[(f + 1) * NN + w] < 0) continue;
          L[i] = T.LADDER; map.a[f][i] = d; U[i] = T.HOLE;
          return true;
        }
      }
    }
    return false;
  }

  // Этаж f, на который нельзя попасть: ставим вертикальную лестницу с достижимой клетки этажа f-1
  function linkUp(map, f, reach) {
    const L = map.t[f - 1], U = map.t[f];
    for (const strict of [true, false]) {
      for (let i = 0; i < NN; i++) {
        if (L[i] !== T.FLOOR || reach[(f - 1) * NN + i] < 0 || (strict && reserved(map, i))) continue;
        if (!(U[i] === T.WALL || U[i] === T.FLOOR)) continue;
        for (let d = 0; d < 4; d++) {
          const w = step(i, d);
          if (w < 0 || L[w] !== T.WALL) continue;
          if (strict && !isFlat(U[w])) continue;
          L[i] = T.LADDER; map.a[f - 1][i] = d; U[i] = T.HOLE;
          if (!isFlat(U[w])) { U[w] = T.FLOOR; carveConnect(map, f, w, new Set([i])); }
          return true;
        }
      }
    }
    return false;
  }

  // Ремонт: провалы над стенами/на нижнем этаже → пол; из ловушек (откуда не вернуться к старту)
  // прокладываем выход; недостижимое превращаем в стены. Повторяем, пока карта не станет «честной».
  function finalize(map, spawnNode) {
    let reach = null, back = null;
    for (let iter = 0; iter < 40; iter++) {
      fixStairs(map);
      for (let i = 0; i < NN; i++) {
        if (map.t[0][i] === T.HOLE) map.t[0][i] = T.FLOOR;
        for (let f = 1; f < map.F; f++) {
          if (map.t[f][i] !== T.HOLE) continue;
          let g = f - 1;
          while (g > 0 && map.t[g][i] === T.HOLE) g--;
          if (map.t[g][i] === T.WALL || map.t[g][i] === T.BLOCK) map.t[f][i] = T.FLOOR; // над стеной и препятствием провала не бывает
        }
      }
      const sf = Math.floor(spawnNode / NN), si = spawnNode % NN;
      if (!BR.WALKABLE[map.t[sf][si]]) map.t[sf][si] = T.FLOOR;
      map.navDirty = true;
      const nav = BR.buildNav(map);
      reach = BR.bfsNav(nav, spawnNode);
      back = BR.bfsNav(nav, spawnNode, true);
      let traps = 0;
      for (let n = 0; n < nav.total; n++) if (reach[n] >= 0 && back[n] < 0) traps++;
      if (traps) {
        // 1) мост на том же этаже; 2) лестница наверх; 3) закрыть провалы, ведущие в ловушку
        let fixed = false;
        for (let f = 0; f < map.F && !fixed; f++) fixed = bridgeFloor(map, f, reach, back);
        for (let f = map.F - 2; f >= 0 && !fixed; f--) fixed = escapeLadder(map, f, reach, back);
        if (!fixed) {
          for (let f = 1; f < map.F; f++) {
            for (let i = 0; i < NN; i++) {
              if (map.t[f][i] !== T.HOLE) continue;
              let g = f - 1;
              while (g > 0 && map.t[g][i] === T.HOLE) g--;
              const land = g * NN + i, tl = map.t[g][i];
              if (tl === T.STAIR || tl === T.LADDER) continue; // проём над лестницей — не провал
              if (reach[land] >= 0 && back[land] < 0) { map.t[f][i] = T.FLOOR; fixed = true; }
            }
          }
          for (let n = 0; n < nav.total; n++) {
            const f = Math.floor(n / NN), i = n % NN;
            if (reach[n] >= 0 && back[n] < 0 && map.t[f][i] === T.POOL) { map.t[f][i] = T.FLOOR; map.a[f][i] = 0; map.wz[i] = -1; fixed = true; }
          }
        }
        if (fixed) continue;
      }
      // этажи без единой достижимой клетки подключаем снизу
      let linked = false;
      for (let f = 1; f < map.F && !linked; f++) {
        let any = false;
        for (let i = 0; i < NN && !any; i++) if (reach[f * NN + i] >= 0) any = true;
        if (!any) linked = linkUp(map, f, reach);
      }
      if (linked) continue;
      // недостижимые клетки с полом → стены (только когда ловушек нет: иначе зоны ещё могут соединиться)
      let walled = 0;
      for (let f = 0; f < map.F; f++) {
        for (let i = 0; i < NN; i++) {
          if (!BR.WALKABLE[map.t[f][i]] || reach[f * NN + i] >= 0) continue;
          if (map.t[f][i] === T.STAIR) continue; // лестницы разберёт fixStairs, если они сломаны
          if (map.t[f][i] === T.POOL) map.wz[i] = -1;
          map.t[f][i] = T.WALL; map.a[f][i] = 0;
          walled++;
        }
      }
      if (!walled) break;
    }
    map.navDirty = true;
    BR.buildColumns(map);
    BR.ensureNav(map);
    return { reach, back };
  }

  /* ------------------- Фиксированная архитектура («знаковые места») ------------------- */
  const reserveCell = (map, i) => { (map.reserved || (map.reserved = new Set())).add(i); };

  // Прямоугольник клеток этажа f одного типа (x0..x1, z0..z1 включительно, только внутренние клетки)
  function fillRect(map, f, x0, z0, x1, z1, type, aux = 0, reserve = false) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!inner(x, z)) continue;
      const i = idx(x, z);
      map.t[f][i] = type; map.a[f][i] = aux;
      if (reserve) reserveCell(map, i);
    }
  }
  function reserveRect(map, x0, z0, x1, z1) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (inner(x, z)) reserveCell(map, idx(x, z));
  }
  // Комната: стены по периметру, пол внутри; двери — список [x, z] клеток периметра
  function room(map, f, x0, z0, x1, z1, doors = [], reserve = true) {
    fillRect(map, f, x0, z0, x1, z1, T.WALL, 0, reserve);
    fillRect(map, f, x0 + 1, z0 + 1, x1 - 1, z1 - 1, T.FLOOR);
    for (const [x, z] of doors) { map.t[f][idx(x, z)] = T.FLOOR; carveConnect(map, f, idx(x, z), roomCells(x0, z0, x1, z1)); }
  }
  const roomCells = (x0, z0, x1, z1) => { const s = new Set(); for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) s.add(idx(x, z)); return s; };

  // Лестница в заданном месте: подъём с клетки (x, z) в направлении d; 2 клетки ската + площадка наверху
  function placeStair(map, f, x, z, d, used = []) {
    const c0 = idx(x, z), c1 = step(c0, d), c2 = step(c0, d, 2), cb = step(c0, d ^ 1);
    if ([c0, c1, c2, cb].some((c) => c < 0) || f + 1 >= map.F) return false;
    const L = map.t[f], U = map.t[f + 1];
    L[c0] = T.STAIR; map.a[f][c0] = d;
    L[c1] = T.STAIR; map.a[f][c1] = d | 4;
    U[c0] = T.HOLE; U[c1] = T.HOLE;
    if (!isFlat(U[c2])) U[c2] = T.FLOOR;
    if (!isFlat(L[cb])) L[cb] = T.FLOOR;
    carveConnect(map, f, cb, new Set([c0, c1]));
    carveConnect(map, f + 1, c2, new Set([c0, c1]));
    for (const c of [c0, c1, c2, cb]) reserveCell(map, c);
    used.push(c0, c1);
    return true;
  }

  // Вертикальная лестница в клетке (x, z) этажа f у стены в направлении d; наверху — площадка
  function placeLadder(map, f, x, z, d, used = []) {
    const c = idx(x, z), w = step(c, d), back = step(c, d ^ 1);
    if (c < 0 || w < 0 || back < 0 || f + 1 >= map.F) return false;
    const L = map.t[f], U = map.t[f + 1];
    L[c] = T.LADDER; map.a[f][c] = d;
    L[w] = T.WALL;
    if (!isFlat(L[back])) L[back] = T.FLOOR;
    U[c] = T.HOLE;
    if (!isFlat(U[w])) U[w] = T.FLOOR;
    carveConnect(map, f, back, new Set([c, w]));
    carveConnect(map, f + 1, w, new Set([c]));
    for (const k of [c, w, back]) reserveCell(map, k);
    used.push(c);
    return true;
  }

  // Низкие препятствия (машины, столы, кровати): ряды по len клеток вдоль оси.
  // Ставятся только туда, где вокруг ряда сплошной пол — поэтому они никогда не перекрывают проход.
  function addBlocks(map, rnd, f, count, o = {}) {
    const L = map.t[f], lenMin = o.min || 1, lenMax = o.max || 2, aux = o.aux || 0;
    let n = 0;
    for (let k = 0; k < count * 40 && n < count; k++) {
      const len = lenMin + Math.floor(rnd() * (lenMax - lenMin + 1));
      const horiz = rnd() < 0.5, x0 = 1 + Math.floor(rnd() * (N - 2)), z0 = 1 + Math.floor(rnd() * (N - 2));
      const x1 = horiz ? x0 + len - 1 : x0, z1 = horiz ? z0 : z0 + len - 1;
      if (o.area && !(x0 >= o.area[0] && z0 >= o.area[1] && x1 <= o.area[2] && z1 <= o.area[3])) continue;
      let ok = true;
      for (let z = z0 - 1; z <= z1 + 1 && ok; z++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (!inner(x, z)) { ok = false; break; }
        const i = idx(x, z);
        if (L[i] !== T.FLOOR || reserved(map, i) || map.wz[i] >= 0 && !o.water) { ok = false; break; }
        if (f + 1 < map.F && map.t[f + 1][i] === T.HOLE) { ok = false; break; }
      }
      if (!ok) continue;
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { L[idx(x, z)] = T.BLOCK; map.a[f][idx(x, z)] = aux; }
      n++;
    }
    return n;
  }

  // Лифт: кабина в одной и той же клетке на этажах floors (клетка — пол в нише). Связь — объект 'lift' на сервере.
  function addLift(map, x, z, floors, d = 0) {
    const c = idx(x, z), back = step(c, d);
    for (const f of floors) {
      map.t[f][c] = T.FLOOR; reserveCell(map, c);
      if (back >= 0 && !isFlat(map.t[f][back])) map.t[f][back] = T.FLOOR;
      if (back >= 0) carveConnect(map, f, back, new Set([c]));
    }
    (map.lifts || (map.lifts = [])).push({ x, z, floors, d });
  }

  // Лестничная клетка с этажа f0 до f1: марши зигзагом в колонках x и x+1 (2 клетки на этаж),
  // площадки в рядах z-1 и z+2, вдоль клетки — коридор в колонке x-2 (колонка x-1 — стена-перила).
  // Занимает x-2..x+1, z-1..z+2; выход — из коридора на север (x-2, z-2), дальше carveConnect.
  function stairwell(map, x, z, f0, f1) {
    for (let f = f0; f <= f1; f++) {
      fillRect(map, f, x - 3, z - 2, x + 2, z + 3, T.WALL, 0, true);
      fillRect(map, f, x - 2, z - 1, x - 2, z + 2, T.FLOOR);           // коридор вдоль клетки
      const k = f - f0, even = k % 2 === 0;
      const hasUp = f < f1, cameUp = f > f0;
      // площадки: на чётных этажах — ряд z-1, на нечётных — ряд z+2
      const row = even ? z - 1 : z + 2;
      fillRect(map, f, x - 1, row, x + 1, row, T.FLOOR);
      if (cameUp) { // проём над маршем снизу
        const px = even ? x + 1 : x;
        map.t[f][idx(px, z)] = T.HOLE; map.t[f][idx(px, z + 1)] = T.HOLE;
      }
      if (hasUp) {
        const sx = even ? x : x + 1, d = even ? 2 : 3;
        const c0 = even ? idx(sx, z) : idx(sx, z + 1), c1 = even ? idx(sx, z + 1) : idx(sx, z);
        map.t[f][c0] = T.STAIR; map.a[f][c0] = d;
        map.t[f][c1] = T.STAIR; map.a[f][c1] = d | 4;
      }
    }
    for (let f = f0; f <= f1; f++) {
      map.t[f][idx(x - 2, z - 2)] = T.FLOOR;
      carveConnect(map, f, idx(x - 2, z - 3), roomCells(x - 3, z - 2, x + 2, z + 3));
      map.t[f][idx(x - 2, z - 3)] = map.t[f][idx(x - 2, z - 3)] === T.WALL ? T.FLOOR : map.t[f][idx(x - 2, z - 3)];
    }
  }

  Object.assign(BR, {
    stairwell, fillRect, reserveRect, room, placeStair, placeLadder, addBlocks, addLift, reserveCell,
    layerFromGrid, carveConnect, addStairs, addLadders, addHoles, addAtrium, addPools, addFlood, addWaterZone,
    addVents, addLow, fixStairs, finalize, isFlat, cellStep: step, connectFloor,
  });
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
