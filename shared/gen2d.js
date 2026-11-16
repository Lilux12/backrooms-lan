// Генераторы планировки одного этажа (2D-сетка: 1 — стена, 0 — пол).
// Каждый этаж уровня строится одним из них, потом build.js соединяет этажи.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('./core.js') : root.BR;
  const { TILE, N, D4 } = BR;

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


  // Пустой зал (для атриумов и крупных залов): всё пол, кроме рамки
  function genOpen(rnd, g) { carveRect(g, 1, 1, N - 2, N - 2); }

  // Зал с колоннами по сетке step
  function genPillars(rnd, g, p) {
    carveRect(g, 1, 1, N - 2, N - 2);
    const step = p.step || 3;
    for (let y = 2; y < N - 2; y += step) for (let x = 2; x < N - 2; x += step) if (rnd() < (p.density || 1)) set(g, x, y, 1);
  }

  const GENS2D = { maze: genMaze, halls: genHalls, rooms: genRooms, run: genRun, open: genOpen, pillars: genPillars };

  // Построить сетку этажа: spec = { gen, p }
  function gen2d(rnd, spec) {
    const g = new Uint8Array(N * N).fill(1);
    GENS2D[spec.gen](rnd, g, spec.p || {});
    return g;
  }

  Object.assign(BR, { bfs, gen2d, GENS2D, genObstacles, carveRect2d: carveRect });
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
