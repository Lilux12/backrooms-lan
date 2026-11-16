// Общий код карт и уровней: работает и в браузере (window.BR), и на сервере (require).
// Уровень целиком определяется парой (seed, номер уровня), поэтому у всех игроков карта одинаковая.
(function (root) {
  'use strict';

  const TILE = 4;     // размер клетки в метрах
  const N = 45;       // карта N x N клеток
  const WALL_H = 3.2; // высота стен по умолчанию
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // Описание кампании. Головоломки: fuses (предохранители), code (код), plates (две плиты), levers (рычаги).
  const LEVELS = [
    {
      name: 'Жёлтые комнаты', style: 'yellow', gen: 'maze', wallH: 3.2, mobs: 1, mobType: 'stalker', mobSpeed: 1.0, water: 4, mapChance: 0.7,
      p: { straight: 0, rooms: 16, roomMin: 3, roomMax: 8, loops: 140, pillars: true },
      puzzles: ['fuses'], fuses: 3,
      intro: 'Электричество отключено. Найдите 3 предохранителя и вставьте их в щиток — дверь выхода оживёт. Где-то здесь может валяться улучшенная карта.',
    },
    {
      name: 'Подземная парковка', style: 'concrete', gen: 'halls', wallH: 3.6, mobs: 1, mobType: 'stalker', mobSpeed: 1.05, water: 3, mapChance: 0.35,
      p: { walls: 14, blocks: 26 },
      puzzles: ['code'],
      intro: 'Код от шлагбаума нацарапан на стенах. Найдите все 4 цифры и введите код на терминале у выхода. Включите фонарь (F) — здесь темно.',
    },
    {
      name: 'Технические тоннели', style: 'tunnel', gen: 'maze', wallH: 2.7, mobs: 1, mobType: 'stalker', mobSpeed: 1.1, water: 3,
      p: { straight: 0.82, rooms: 4, roomMin: 3, roomMax: 4, loops: 22, pillars: false },
      puzzles: ['plates'],
      intro: 'Дверь откроется, только когда нажаты ОБЕ плиты. Каждая держится около 20 секунд — успейте добежать до второй.',
    },
    {
      name: 'Бассейны', style: 'pool', gen: 'rooms', wallH: 3.8, mobs: 1, mobType: 'stalker', mobSpeed: 1.15, water: 3,
      p: { extra: 14, doorW: 2, pillar: 0.5, cubicle: 0 },
      puzzles: ['levers'],
      intro: 'Найдите записку с подсказкой и потяните 4 рычага в правильном порядке. Ошибка включит сирену!',
    },
    {
      name: 'Беги!', tag: 'LEVEL !', style: 'run', gen: 'run', wallH: 3.4, mobs: 3, mobType: 'runner', mobSpeed: 1.35, water: 0,
      chase: true, infStamina: true, p: {}, puzzles: [],
      intro: 'Дверь в конце коридора уже открыта. Как только вы выйдете из укрытия, за вами бросится стая. Бегите, огибайте мебель, не останавливайтесь. Выносливость здесь не кончается.',
    },
    {
      name: 'Офисы', style: 'office', gen: 'rooms', wallH: 3.0, mobs: 2, mobType: 'stalker', mobSpeed: 1.1, water: 4,
      p: { extra: 10, doorW: 1, pillar: 0, cubicle: 0.7 },
      puzzles: ['fuses', 'code'], fuses: 2,
      intro: 'Последний этаж. Верните питание лифту (2 предохранителя) и введите код. Здесь вас двое преследователей.',
    },
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Расстояния (в клетках) от клетки (sx, sy); -1 = недостижимо
  function bfs(g, sx, sy) {
    const dist = new Int16Array(N * N).fill(-1);
    const q = [sx + sy * N];
    dist[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], cx = c % N, cy = (c / N) | 0, d = dist[c];
      for (const [dx, dy] of D4) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ni = nx + ny * N;
        if (g[ni] || dist[ni] >= 0) continue;
        dist[ni] = d + 1;
        q.push(ni);
      }
    }
    return dist;
  }

  /* ------------------------------ Генераторы ------------------------------ */
  const at = (g, x, y) => g[y * N + x];
  const set = (g, x, y, v) => { if (x > 0 && y > 0 && x < N - 1 && y < N - 1) g[y * N + x] = v; };

  function carveRect(g, x, y, w, h) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) set(g, x + xx, y + yy, 0);
  }

  // Лабиринт: recursive backtracker (+ комнаты, петли, колонны)
  function genMaze(rnd, g, p) {
    const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    const stack = [[1, 1, -1]];
    set(g, 1, 1, 0);
    while (stack.length) {
      const [cx, cy, ld] = stack[stack.length - 1];
      const opts = [];
      for (let k = 0; k < 4; k++) {
        const nx = cx + dirs[k][0], ny = cy + dirs[k][1];
        if (nx > 0 && ny > 0 && nx < N - 1 && ny < N - 1 && at(g, nx, ny) === 1) opts.push(k);
      }
      if (!opts.length) { stack.pop(); continue; }
      const k = (ld >= 0 && opts.includes(ld) && rnd() < p.straight) ? ld : opts[Math.floor(rnd() * opts.length)];
      const [dx, dy] = dirs[k];
      set(g, cx + dx / 2, cy + dy / 2, 0);
      set(g, cx + dx, cy + dy, 0);
      stack.push([cx + dx, cy + dy, k]);
    }
    const rooms = [];
    for (let i = 0; i < p.rooms; i++) {
      const w = p.roomMin + Math.floor(rnd() * (p.roomMax - p.roomMin + 1));
      const h = p.roomMin + Math.floor(rnd() * (p.roomMax - p.roomMin + 1));
      const x = 1 + Math.floor(rnd() * (N - 2 - w)), y = 1 + Math.floor(rnd() * (N - 2 - h));
      carveRect(g, x, y, w, h);
      rooms.push({ x, y, w, h });
    }
    for (let i = 0; i < p.loops; i++) {
      const x = 1 + Math.floor(rnd() * (N - 2)), y = 1 + Math.floor(rnd() * (N - 2));
      if (at(g, x, y) !== 1) continue;
      if ((at(g, x - 1, y) === 0 && at(g, x + 1, y) === 0) || (at(g, x, y - 1) === 0 && at(g, x, y + 1) === 0)) set(g, x, y, 0);
    }
    if (p.pillars) {
      for (const r of rooms) {
        if (r.w < 5 || r.h < 5) continue;
        for (let yy = 1; yy < r.h - 1; yy++) for (let xx = 1; xx < r.w - 1; xx++) {
          const x = r.x + xx, y = r.y + yy;
          if (x % 2 || y % 2) continue;
          let ok = true;
          for (let oy = -1; oy <= 1 && ok; oy++) for (let ox = -1; ox <= 1; ox++) {
            if ((ox || oy) && at(g, x + ox, y + oy) !== 0) { ok = false; break; }
          }
          if (ok) set(g, x, y, 1);
        }
      }
    }
  }

  // Парковка: большой зал с колоннами, перегородками и «машинами»
  function genHalls(rnd, g, p) {
    carveRect(g, 1, 1, N - 2, N - 2);
    for (let y = 4; y < N - 1; y += 4) for (let x = 4; x < N - 1; x += 4) set(g, x, y, 1);
    for (let i = 0; i < p.walls; i++) {
      const horiz = rnd() < 0.5, len = 5 + Math.floor(rnd() * 8);
      const x = 3 + Math.floor(rnd() * (N - 6)), y = 3 + Math.floor(rnd() * (N - 6));
      if (x < 8 && y < 8) continue;
      const gap = 1 + Math.floor(rnd() * (len - 2));
      for (let k = 0; k < len; k++) {
        if (k === gap || k === gap + 1) continue;
        set(g, horiz ? x + k : x, horiz ? y : y + k, 1);
      }
    }
    for (let i = 0; i < p.blocks; i++) {
      const x = 3 + Math.floor(rnd() * (N - 6)), y = 3 + Math.floor(rnd() * (N - 6));
      if (x < 8 && y < 8) continue;
      set(g, x, y, 1); set(g, x + 1, y, 1);
    }
  }

  // Комнатные уровни (бассейны/офисы): сетка комнат 5x5 с дверями
  function genRooms(rnd, g, p) {
    const C = 6, R = 7;
    const rx = (i) => 1 + C * i;
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) carveRect(g, rx(i), rx(j), 5, 5);
    const door = (i, j, horiz) => { // horiz: дверь между (i,j) и (i+1,j)
      const off = 1 + Math.floor(rnd() * 3);
      for (let w = 0; w < p.doorW; w++) {
        if (horiz) set(g, rx(i) + 5, rx(j) + off + w - (p.doorW > 1 && off > 2 ? 1 : 0), 0);
        else set(g, rx(i) + off + w - (p.doorW > 1 && off > 2 ? 1 : 0), rx(j) + 5, 0);
      }
    };
    const seen = new Set(['0,0']);
    const st = [[0, 0]];
    while (st.length) {
      const [i, j] = st[st.length - 1];
      const nb = [];
      for (const [dx, dy] of D4) {
        const ni = i + dx, nj = j + dy;
        if (ni >= 0 && nj >= 0 && ni < R && nj < R && !seen.has(ni + ',' + nj)) nb.push([ni, nj]);
      }
      if (!nb.length) { st.pop(); continue; }
      const [ni, nj] = nb[Math.floor(rnd() * nb.length)];
      seen.add(ni + ',' + nj);
      if (ni !== i) door(Math.min(i, ni), j, true); else door(i, Math.min(j, nj), false);
      st.push([ni, nj]);
    }
    for (let k = 0; k < p.extra; k++) {
      const i = Math.floor(rnd() * R), j = Math.floor(rnd() * R);
      if (rnd() < 0.5 && i < R - 1) door(i, j, true); else if (j < R - 1) door(i, j, false);
    }
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      if (p.pillar && rnd() < p.pillar) set(g, rx(i) + 2, rx(j) + 2, 1);
      if (p.cubicle && rnd() < p.cubicle && (i || j)) {
        // перегородка-«кубикл» от стены комнаты; откатываем, если она отрезает хоть одну клетку пола
        const cells = [];
        if (rnd() < 0.5) { for (let k = 0; k < 3; k++) cells.push([rx(i) + k, rx(j) + 2]); }
        else { for (let k = 0; k < 3; k++) cells.push([rx(i) + 2, rx(j) + 2 + k]); }
        const was = cells.map(([x, y]) => at(g, x, y));
        for (const [x, y] of cells) set(g, x, y, 1);
        const d = bfs(g, 1, 1);
        let lost = false;
        for (let t = 0; t < N * N; t++) if (!g[t] && d[t] < 0) { lost = true; break; }
        if (lost) cells.forEach(([x, y], n) => set(g, x, y, was[n]));
      }
    }
  }


  // Больничный коридор-змейка: 9 широких (2 клетки) коридоров, на каждом мебель-препятствия
  function genRun(rnd, g) {
    const L = 31, count = 9;
    for (let k = 0; k < count; k++) {
      const y = 1 + 3 * k;
      carveRect(g, 1, y, L, 2);
      if (k < count - 1) carveRect(g, k % 2 === 0 ? L - 1 : 1, y + 2, 2, 1);
    }
  }

  // Препятствия (круги столкновения): стулья, шкафы, матрасы, каталки... Проход всегда остаётся.
  function genObstacles(rnd) {
    const L = 31, kinds = [['chair', 0.5], ['cabinet', 0.95], ['mattress', 1.1], ['gurney', 1.05], ['cart', 0.8], ['table', 1.0]];
    const out = [];
    for (let k = 0; k < 9; k++) {
      const z0 = (1 + 3 * k) * TILE;
      let x = k === 0 ? 10 : 5;
      while (x < L - 3) {
        const lane = rnd() < 0.5 ? 2.0 : 6.0;
        const [kind, r] = kinds[Math.floor(rnd() * kinds.length)];
        out.push({ kind, x: (x + 0.5) * TILE, z: z0 + lane, r, rot: rnd() * Math.PI });
        if (rnd() < 0.3) {
          const [k2, r2] = kinds[Math.floor(rnd() * kinds.length)];
          out.push({ kind: k2, x: (x + 0.5) * TILE + rnd() * 1.5, z: z0 + (lane < 4 ? 6.0 : 2.0), r: r2, rot: rnd() * Math.PI });
        }
        x += 5 + Math.floor(rnd() * 4);
      }
    }
    return out;
  }

  const GENS = { maze: genMaze, halls: genHalls, rooms: genRooms, run: genRun };

  /* ------------------------------ Уровень ------------------------------ */
  function generate(seed, levelIdx = 0) {
    const L = LEVELS[levelIdx];
    const rnd = mulberry32(((seed >>> 0) + levelIdx * 977) >>> 0);
    const g = new Uint8Array(N * N).fill(1);
    GENS[L.gen](rnd, g, L.p);
    set(g, 1, 1, 0);

    // Недостижимые участки закрываем стенами
    let dist = bfs(g, 1, 1);
    for (let i = 0; i < N * N; i++) if (!g[i] && dist[i] < 0) g[i] = 1;

    const floors = [];
    let maxDist = 0;
    for (let i = 0; i < N * N; i++) if (!g[i]) { floors.push(i); if (dist[i] > maxDist) maxDist = dist[i]; }
    const center = (i) => ({ x: ((i % N) + 0.5) * TILE, z: (((i / N) | 0) + 0.5) * TILE });

    // Выход: стена с ровно одним соседним полом, как можно дальше от старта
    const cands = [];
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      if (!g[y * N + x]) continue;
      let cnt = 0, f = -1, fdx = 0, fdy = 0;
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        if (!g[ny * N + nx]) { cnt++; f = ny * N + nx; fdx = dx; fdy = dy; }
      }
      if (cnt === 1) cands.push({ x, y, f, d: dist[f], fdx, fdy });
    }
    cands.sort((a, b) => b.d - a.d);
    let ex = cands[Math.floor(rnd() * Math.min(5, cands.length))];
    if (!ex) { // запасной вариант: пробиваем нишу у самого дальнего пола
      const far = floors.reduce((a, b) => (dist[b] > dist[a] ? b : a), floors[0]);
      const fx = far % N, fy = (far / N) | 0;
      for (const [dx, dy] of D4) {
        const x = fx + dx, y = fy + dy;
        if (x > 0 && y > 0 && x < N - 1 && y < N - 1 && g[y * N + x]) { ex = { x, y, f: far, d: dist[far], fdx: dx, fdy: dy }; break; }
      }
    }
    const fc = center(ex.f);
    const exit = {
      tx: ex.x, ty: ex.y,
      wx: (ex.x + 0.5) * TILE, wz: (ex.y + 0.5) * TILE, // центр двери
      fx: fc.x, fz: fc.z,                                // пол перед дверью
      dx: -ex.fdx, dz: -ex.fdy,                          // направление от пола к двери
    };

    const obst = L.gen === 'run' ? genObstacles(rnd) : [];
    return { seed, level: levelIdx, g, floors, dist, maxDist, wallH: L.wallH, spawn: center(1 + N), exit, obst };
  }

  function setDoor(map, open) { map.g[map.exit.ty * N + map.exit.tx] = open ? 0 : 1; }

  /* --------------------------- Расстановка объектов --------------------------- */
  function shuffle(rnd, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // n случайных клеток пола с ограничениями по расстоянию от старта и друг от друга
  function pickSpots(map, rnd, n, o = {}) {
    const minDist = o.minDist || 0, maxDist = o.maxDist == null ? 1e9 : o.maxDist;
    const order = shuffle(rnd, map.floors);
    const taken = [];
    const attempts = [[minDist, o.minSep || 0], [minDist, Math.floor((o.minSep || 0) / 2)], [0, 0]];
    for (const [md, sep] of attempts) {
      for (const i of order) {
        if (taken.length >= n) break;
        const d = map.dist[i];
        if (d < md || d > maxDist || taken.includes(i)) continue;
        const cx = i % N, cy = (i / N) | 0;
        if (taken.every((j) => Math.max(Math.abs((j % N) - cx), Math.abs(((j / N) | 0) - cy)) >= sep)) taken.push(i);
      }
      if (taken.length >= n) break;
    }
    return taken.map((i) => ({ x: ((i % N) + 0.5) * TILE, z: (((i / N) | 0) + 0.5) * TILE, tile: i }));
  }

  // То же, но точки на стенах (нужны для цифр и записок). nx,nz — нормаль в сторону комнаты.
  function pickWallSpots(map, rnd, n, o = {}) {
    const minDist = o.minDist || 0, maxDist = o.maxDist == null ? 1e9 : o.maxDist, sep = o.minSep || 0;
    const order = shuffle(rnd, map.floors);
    const out = [], used = [];
    for (const relax of [1, 0.5, 0]) {
      for (const i of order) {
        if (out.length >= n) break;
        const d = map.dist[i];
        if (d < minDist * relax || d > maxDist || used.includes(i)) continue;
        const cx = i % N, cy = (i / N) | 0;
        if (!used.every((j) => Math.max(Math.abs((j % N) - cx), Math.abs(((j / N) | 0) - cy)) >= sep * relax)) continue;
        const walls = D4.filter(([dx, dy]) => {
          const x = cx + dx, y = cy + dy;
          return map.g[y * N + x] && !(x === map.exit.tx && y === map.exit.ty);
        });
        if (!walls.length) continue;
        const [dx, dy] = walls[Math.floor(rnd() * walls.length)];
        used.push(i);
        out.push({ x: (cx + 0.5) * TILE + dx * (TILE / 2 - 0.04), z: (cy + 0.5) * TILE + dy * (TILE / 2 - 0.04), nx: -dx, nz: -dy, tile: i });
      }
      if (out.length >= n) break;
    }
    return out;
  }

  const tileOf = (x, z) => [Math.floor(x / TILE), Math.floor(z / TILE)];

  function isWall(map, x, z) {
    const tx = Math.floor(x / TILE), ty = Math.floor(z / TILE);
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return true;
    return map.g[ty * N + tx] === 1;
  }

  function collide(map, x, z, r) {
    if (isWall(map, x - r, z - r) || isWall(map, x + r, z - r) ||
        isWall(map, x - r, z + r) || isWall(map, x + r, z + r)) return true;
    if (map.obst) for (const o of map.obst) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return true;
    return false;
  }

  // Движение с раздельной проверкой по осям (скольжение вдоль стен)
  function move(map, x, z, dx, dz, r) {
    if (!collide(map, x + dx, z, r)) x += dx;
    if (!collide(map, x, z + dz, r)) z += dz;
    return { x, z };
  }

  // Прямая видимость между двумя точками
  function los(map, x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(d / 0.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (isWall(map, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  // Кратчайший маршрут от старта до клетки перед дверью (индексы клеток)
  function route(map) {
    const d = bfs(map.g, Math.floor(map.exit.fx / TILE), Math.floor(map.exit.fz / TILE));
    let x = 1, y = 1, guard = 0;
    const out = [x + y * N];
    while (d[x + y * N] > 0 && guard++ < 4000) {
      let best = null, bd = d[x + y * N];
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const v = d[nx + ny * N];
        if (v >= 0 && v < bd) { bd = v; best = [nx, ny]; }
      }
      if (!best) break;
      [x, y] = best; out.push(x + y * N);
    }
    return out;
  }

  const api = {
    TILE, N, WALL_H, D4, LEVELS, mulberry32, generate, setDoor, bfs, pickSpots, pickWallSpots,
    tileOf, isWall, collide, move, los, route,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BR = api;
})(typeof window !== 'undefined' ? window : globalThis);
