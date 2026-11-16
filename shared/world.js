// Многоэтажный мир: колонки твёрдых интервалов, физика тела, граф навигации, линия видимости, хэш.
//
// Карта — это F этажей сетки N×N. Этаж f начинается на высоте f*FH (FH — высота этажа).
// Из типов клеток всех этажей строится «колонка» для каждой клетки: список твёрдых интервалов
// по высоте [lo, top], где top может быть наклонным (лестницы). Физика, видимость и рендер
// работают только с колонками, поэтому любой новый тип клетки достаточно описать в buildColumn.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('./core.js') : root.BR;
  const { TILE, N, NN, SLAB, D4, T, WALKABLE, VENT_H, LOW_H, cellX, cellZ, inside, centerX, centerZ } = BR;

  /* ------------------------------ Карта ------------------------------ */
  // Пустая карта: все клетки всех этажей — стены
  function newMap(F, FH) {
    const t = [], a = [];
    for (let f = 0; f < F; f++) { t.push(new Uint8Array(NN).fill(T.WALL)); a.push(new Uint8Array(NN)); }
    return {
      F, FH, t, a,
      wz: new Int16Array(NN).fill(-1), // зона воды для каждой колонки (-1 — сухо)
      wcur: new Uint8Array(NN),        // течение: 0 — нет, 1..4 — направление D4[k-1]
      glass: new Uint8Array(NN),       // стеклянная крыша над клеткой (только вид)
      fx: [],                          // декор и эффекты уровня для клиента: пар, буйки, вышки…
      wl: [],                          // уровень поверхности воды каждой зоны (меняется во время игры)
      wb: [],                          // дно зоны: ниже воды нет
      cols: null, nav: null, navDirty: true,
    };
  }

  const opp = (d) => d ^ 1; // противоположное направление (0<->1, 2<->3)
  const stairDir = (aux) => aux & 3;
  const stairSeg = (aux) => (aux >> 2) & 1;
  const floorY = (map, f) => f * map.FH;

  /* ----------------------------- Колонки ----------------------------- */
  // Интервал: {lo, hi, sx, sz}; верх в точке клетки = hi + sx*fx + sz*fz, где fx,fz ∈ [0,1] — доля внутри клетки
  const box = (lo, hi) => ({ lo, hi, sx: 0, sz: 0 });

  function buildColumn(map, i) {
    const out = [];
    const { F, FH } = map;
    for (let f = 0; f < F; f++) {
      const b = f * FH, t = map.t[f][i], aux = map.a[f][i];
      const under = f === 0 ? -1 : b - SLAB; // нижняя граница перекрытия
      switch (t) {
        case T.WALL: out.push(box(under, b + FH)); break;
        case T.HOLE: break;
        case T.STAIR: {
          const d = stairDir(aux), s = stairSeg(aux), half = FH / 2;
          const iv = box(under, b + s * half);
          if (d === 0) iv.sx = half;
          else if (d === 1) { iv.hi += half; iv.sx = -half; }
          else if (d === 2) iv.sz = half;
          else { iv.hi += half; iv.sz = -half; }
          out.push(iv);
          break;
        }
        case T.POOL: {
          const depth = aux * 0.25;
          out.push(box(f === 0 ? -1 - depth : b - depth - SLAB, b - depth));
          break;
        }
        case T.VENT: out.push(box(under, b), box(b + VENT_H, b + FH)); break;
        case T.LOW: out.push(box(under, b), box(b + LOW_H, b + FH)); break;
        default: out.push(box(under, b)); // FLOOR, LADDER
      }
    }
    out.push(box(F * FH, F * FH + 2)); // крыша над верхним этажом
    return out;
  }

  function buildColumns(map) {
    map.cols = new Array(NN);
    for (let i = 0; i < NN; i++) map.cols[i] = buildColumn(map, i);
  }

  // Изменить клетку во время игры (дверь, обрушение…): пересобирает колонку и помечает граф устаревшим
  function setCell(map, f, i, type, aux = 0) {
    map.t[f][i] = type; map.a[f][i] = aux;
    if (map.cols) map.cols[i] = buildColumn(map, i);
    map.navDirty = true;
  }

  const topAt = (iv, fx, fz) => iv.hi + iv.sx * fx + iv.sz * fz;

  // Есть ли твёрдое вещество в точке (x, y, z)
  function solidAt(map, x, y, z) {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    if (!inside(tx, tz)) return true;
    const fx = x / TILE - tx, fz = z / TILE - tz;
    for (const iv of map.cols[tx + tz * N]) if (y > iv.lo && y < topAt(iv, fx, fz)) return true;
    return false;
  }

  /* ------------------------------ Вода ------------------------------ */
  // Уровень воды над точкой (x, z) для тела на высоте y (ниже дна зоны — сухо)
  function waterAt(map, x, z, y = Infinity) {
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
    if (!inside(tx, tz)) return -Infinity;
    const zone = map.wz[tx + tz * N];
    if (zone < 0 || y < map.wb[zone] - 1) return -Infinity;
    return map.wl[zone];
  }

  /* ------------------------------ Физика ------------------------------ */
  const PHYS = {
    R: 0.35,          // радиус тела
    H: 1.75,          // рост стоя
    H_CROUCH: 0.95,   // рост вприсядку / ползком
    STEP: 0.55,       // на какую высоту можно шагнуть без прыжка
    STEP_SWIM: 1.9,   // из воды можно выбраться на бортик такой высоты
    AIR_STEP: 0.12,   // в прыжке/падении — только на такую ступень
    CURRENT: 1.3,     // скорость течения, м/с
    GRAV: 22,
    JUMP: 6.2,        // начальная скорость прыжка (~0.9 м)
    CLIMB: 2.6,       // скорость лазания по лестнице
    SWIM_DEPTH: 1.25, // глубже — плавание
    WADE_DEPTH: 0.35, // глубже — идём медленнее
    FLOAT: 1.45,      // на сколько ниже поверхности держатся ноги на плаву
    SNAP_DOWN: 0.35,  // «прилипание» к полу при спуске по ступеням
  };

  // Точки опоры тела: центр и углы
  function samplePoints(x, z, r) {
    return [[x, z], [x - r, z - r], [x + r, z - r], [x - r, z + r], [x + r, z + r]];
  }

  // Упирается ли тело (ноги на y, рост h) во что-то твёрдое выше уровня шага
  function blocked(map, x, y, z, r, h, step) {
    for (const [px, pz] of samplePoints(x, z, r)) {
      const tx = Math.floor(px / TILE), tz = Math.floor(pz / TILE);
      if (!inside(tx, tz)) return true;
      const fx = px / TILE - tx, fz = pz / TILE - tz;
      for (const iv of map.cols[tx + tz * N]) {
        if (iv.lo < y + h && topAt(iv, fx, fz) > y + step) return true;
      }
    }
    return false;
  }

  // Есть ли низ перекрытия на высоте в [from, to) под телом — значит, подняться туда нельзя
  function ceilingBetween(map, x, z, r, from, to) {
    for (const [px, pz] of samplePoints(x, z, r)) {
      const tx = Math.floor(px / TILE), tz = Math.floor(pz / TILE);
      if (!inside(tx, tz)) return true;
      for (const iv of map.cols[tx + tz * N]) if (iv.lo >= from - 0.01 && iv.lo < to) return true;
    }
    return false;
  }

  // Высота опоры под телом: самый высокий верх интервала не выше y + step
  function groundAt(map, x, y, z, r, step) {
    let g = -Infinity;
    for (const [px, pz] of samplePoints(x, z, r * 0.6)) {
      const tx = Math.floor(px / TILE), tz = Math.floor(pz / TILE);
      if (!inside(tx, tz)) continue;
      const fx = px / TILE - tx, fz = pz / TILE - tz;
      for (const iv of map.cols[tx + tz * N]) {
        const top = topAt(iv, fx, fz);
        if (top <= y + step && top > g) g = top;
      }
    }
    return g;
  }

  // Этаж, на котором находится точка (по высоте ног), с учётом провалов
  function floorOf(map, x, y, z) {
    const i = BR.cellAt(x, z);
    let f = Math.max(0, Math.min(map.F - 1, Math.floor((y + 0.6) / map.FH)));
    if (i < 0) return f;
    while (f > 0 && map.t[f][i] === T.HOLE) f--;
    return f;
  }

  // Узел графа (этаж*NN + клетка) для точки или -1
  function nodeAt(map, x, y, z) {
    const i = BR.cellAt(x, z);
    if (i < 0) return -1;
    // стоим на кромке провала: ноги на уровне этажа, центр — над дырой → узел той клетки, что держит
    const fh = Math.max(0, Math.min(map.F - 1, Math.floor((y + 0.6) / map.FH)));
    if (fh > 0 && map.t[fh][i] === T.HOLE && y > fh * map.FH - 0.3) {
      const r = PHYS.R;
      for (const [px, pz] of [[x - r, z], [x + r, z], [x, z - r], [x, z + r]]) {
        const j = BR.cellAt(px, pz);
        if (j >= 0 && j !== i && WALKABLE[map.t[fh][j]] && map.t[fh][j] !== T.STAIR) return fh * NN + j;
      }
    }
    const f = floorOf(map, x, y, z);
    return WALKABLE[map.t[f][i]] ? f * NN + i : -1;
  }

  // Висит ли тело на вертикальной лестнице
  function ladderAt(map, x, y, z) {
    const i = BR.cellAt(x, z);
    if (i < 0) return -1;
    for (let f = 0; f < map.F; f++) {
      if (map.t[f][i] !== T.LADDER) continue;
      const b = f * map.FH;
      if (y >= b - 0.1 && y <= b + map.FH + 0.25) return f;
    }
    return -1;
  }

  function makeBody(x, y, z) {
    return { x, y, z, vy: 0, onGround: true, crouch: false, h: PHYS.H, swim: false, ladder: -1, wade: false, underwater: false, fallTop: y };
  }

  // Шаг физики тела.
  // inp: { vx, vz — желаемая горизонтальная скорость (м/с), jump, up, down, crouch }
  // Возвращает { landed: высота падения или 0 }
  function moveBody(map, b, inp, dt) {
    const P = PHYS, res = { landed: 0 };
    // Присед / ползком; встать можно, только если над головой есть место
    if (inp.crouch) { b.crouch = true; b.h = P.H_CROUCH; }
    else if (b.crouch && !blocked(map, b.x, b.y, b.z, P.R, P.H, P.STEP)) { b.crouch = false; b.h = P.H; }
    if (!b.crouch && blocked(map, b.x, b.y, b.z, P.R, P.H, P.STEP)) { b.crouch = true; b.h = P.H_CROUCH; }

    const wl = waterAt(map, b.x, b.z, b.y);
    const depth = wl - b.y;
    b.ladder = ladderAt(map, b.x, b.y, b.z);
    b.swim = b.ladder < 0 && depth > P.SWIM_DEPTH;
    b.wade = !b.swim && depth > P.WADE_DEPTH;
    b.underwater = wl > b.y + (b.crouch ? 0.8 : 1.6);
    // в воздухе за край не зацепиться: шаг почти нулевой
    const step = b.swim ? P.STEP_SWIM : (b.onGround || b.ladder >= 0) ? P.STEP : P.AIR_STEP;
    const scale = b.swim ? 0.6 : b.crouch ? 0.5 : b.wade ? 0.7 : 1;

    // Горизонталь: по осям раздельно (скольжение вдоль стен), мелкими шагами
    let dx = inp.vx * scale * dt, dz = inp.vz * scale * dt;
    // течение сносит плывущих и идущих по воде
    const ci = BR.cellAt(b.x, b.z);
    if ((b.swim || b.wade) && ci >= 0 && map.wcur[ci]) {
      const [cx, cz] = D4[map.wcur[ci] - 1];
      dx += cx * P.CURRENT * dt; dz += cz * P.CURRENT * dt;
    }
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.2));
    // можно ли сдвинуться: не упираемся, и если шагаем вверх — по пути голова не проходит сквозь перекрытие
    const canGo = (x, z) => {
      if (blocked(map, x, b.y, z, P.R, b.h, step)) return false;
      const g = groundAt(map, x, b.y, z, P.R, step);
      if (g <= b.y + 0.01) return true;
      return !ceilingBetween(map, b.x, b.z, P.R, b.y + b.h, g + b.h) && !ceilingBetween(map, x, z, P.R, b.y + b.h, g + b.h);
    };
    for (let k = 0; k < n; k++) {
      const sx = dx / n, sz = dz / n;
      if (sx && canGo(b.x + sx, b.z)) b.x += sx;
      if (sz && canGo(b.x, b.z + sz)) b.z += sz;
      // подъём на ступень сразу, чтобы следующий подшаг шёл от новой высоты
      const g = groundAt(map, b.x, b.y, b.z, P.R, step);
      if (g > b.y && (b.onGround || b.swim || b.ladder >= 0)) b.y = g;
    }

    // Вертикаль
    const wasGround = b.onGround;
    if (b.ladder >= 0) {
      b.vy = inp.up ? P.CLIMB : inp.down ? -P.CLIMB : 0;
      b.onGround = false;
      // при лазании тянемся к середине шахты, иначе голова цепляет перекрытие соседней клетки
      const top = (b.ladder + 1) * map.FH;
      if (b.vy !== 0 && b.y < top - 0.3) {
        const cx = (Math.floor(b.x / TILE) + 0.5) * TILE, cz = (Math.floor(b.z / TILE) + 0.5) * TILE;
        const pull = Math.min(1, 3 * dt);
        const nx = b.x + (cx - b.x) * pull, nz = b.z + (cz - b.z) * pull;
        if (!blocked(map, nx, b.y, nz, P.R, b.h, P.STEP)) { b.x = nx; b.z = nz; }
      }
    } else if (b.swim) {
      if (inp.up) b.vy = 2.4;
      else if (inp.down) b.vy = -2.4;
      else b.vy = Math.max(-1.5, Math.min(1.5, (wl - P.FLOAT - b.y) * 2.5));
      b.onGround = false;
    } else {
      if (inp.jump && b.onGround && !b.crouch) { b.vy = P.JUMP * (inp.jumpMul || 1); b.onGround = false; }
      b.vy -= P.GRAV * (inp.grav || 1) * dt; // хост может менять гравитацию
    }
    let ny = b.y + b.vy * dt;
    if (b.vy > 0 && blocked(map, b.x, ny, b.z, P.R, b.h, 0.02)) { ny = b.y; b.vy = 0; } // удар головой
    const g = groundAt(map, b.x, b.y, b.z, P.R, step);
    if (ny <= g) {
      if (!wasGround && !b.swim && b.ladder < 0) res.landed = Math.max(0, b.fallTop - g);
      ny = g; b.vy = 0; b.onGround = b.ladder < 0;
    } else if (wasGround && b.ladder < 0 && !b.swim && b.vy <= 0 && ny - g < P.SNAP_DOWN) {
      ny = g; b.vy = 0; b.onGround = true; // спуск по лестнице без «подпрыгивания»
    } else {
      b.onGround = false;
    }
    b.y = ny;
    if (b.onGround || b.swim || b.ladder >= 0) b.fallTop = b.y;
    else b.fallTop = Math.max(b.fallTop, b.y);
    return res;
  }

  /* --------------------------- Граф навигации --------------------------- */
  // Узел = f*NN + i. Рёбра однонаправленные: падение в дыру — только вниз.
  // opts.vent — можно ли ползать по лазам, opts.water — можно ли плавать.
  function buildNav(map, opts = {}) {
    const vent = opts.vent !== false, water = opts.water !== false;
    const { F, FH } = map;
    const total = F * NN;
    const out = new Array(total);
    const ok = (f, i) => {
      const t = map.t[f][i];
      if (!WALKABLE[t]) return false;
      if (t === T.VENT && !vent) return false;
      if (t === T.POOL && !water && waterDepth(map, f, i) > PHYS.SWIM_DEPTH) return false;
      return true;
    };
    const flat = (t) => t !== T.STAIR; // «плоская» клетка (не лестница)
    for (let f = 0; f < F; f++) {
      for (let i = 0; i < NN; i++) {
        if (!ok(f, i)) continue;
        const e = [];
        const t = map.t[f][i], aux = map.a[f][i];
        const x = cellX(i), z = cellZ(i);
        for (let k = 0; k < 4; k++) {
          const nx = x + D4[k][0], nz = z + D4[k][1];
          if (!inside(nx, nz)) continue;
          const j = nx + nz * N, tj = map.t[f][j];
          if (t === T.STAIR) {
            const d = stairDir(aux), s = stairSeg(aux);
            if (k === d) {
              if (s === 0) { if (tj === T.STAIR && stairDir(map.a[f][j]) === d && stairSeg(map.a[f][j]) === 1 && ok(f, j)) e.push(f * NN + j); }
              else if (f + 1 < F && ok(f + 1, j) && (flat(map.t[f + 1][j]) || (stairDir(map.a[f + 1][j]) === d && stairSeg(map.a[f + 1][j]) === 0))) e.push((f + 1) * NN + j);
            } else if (k === opp(d)) {
              if (s === 1) { if (tj === T.STAIR && stairDir(map.a[f][j]) === d && stairSeg(map.a[f][j]) === 0) e.push(f * NN + j); }
              else if (ok(f, j) && flat(tj)) e.push(f * NN + j);
              else if (f > 0 && tj === T.HOLE && map.t[f - 1][j] === T.STAIR && stairDir(map.a[f - 1][j]) === d && stairSeg(map.a[f - 1][j]) === 1) e.push((f - 1) * NN + j); // лестница продолжается вниз
            }
            continue;
          }
          if (ok(f, j)) {
            if (tj === T.STAIR) {
              // на лестницу — только снизу, с её начала
              if (stairDir(map.a[f][j]) === k && stairSeg(map.a[f][j]) === 0) e.push(f * NN + j);
            } else if (t === T.POOL && tj !== T.POOL) {
              // из бассейна на бортик: вплавь или если неглубоко
              const deep = waterDepth(map, f, i) > PHYS.SWIM_DEPTH;
              if (deep || map.a[f][i] * 0.25 <= PHYS.STEP) e.push(f * NN + j);
            } else e.push(f * NN + j);
          } else if (tj === T.HOLE) {
            // падение в провал: ищем, куда приземлимся
            for (let g = f - 1; g >= 0; g--) {
              const tg = map.t[g][j];
              if (tg === T.HOLE) continue;
              if (ok(g, j)) e.push(g * NN + j);
              break;
            }
          }
        }
        // Вертикальная лестница: вверх на площадку этажа выше
        if (t === T.LADDER && f + 1 < F && map.t[f + 1][i] === T.HOLE) {
          const d = aux & 3, lx = x + D4[d][0], lz = z + D4[d][1];
          if (inside(lx, lz) && ok(f + 1, lx + lz * N) && flat(map.t[f + 1][lx + lz * N])) e.push((f + 1) * NN + lx + lz * N);
        }
        out[f * NN + i] = e;
      }
    }
    // Обратный граф — для поля расстояний «до цели»
    const inn = new Array(total);
    for (let n = 0; n < total; n++) if (out[n]) for (const m of out[n]) (inn[m] || (inn[m] = [])).push(n);
    return { out, inn, total, F, FH };
  }

  // Глубина воды над полом клетки
  function waterDepth(map, f, i) {
    const zone = map.wz[i];
    if (zone < 0) return 0;
    const floorTop = f * map.FH - (map.t[f][i] === T.POOL ? map.a[f][i] * 0.25 : 0);
    if (floorTop < map.wb[zone] - 1) return 0;
    return Math.max(0, map.wl[zone] - floorTop);
  }

  // Граф для игроков и для обычных существ (без лазов и глубокой воды); пересобирается после изменений карты
  function ensureNav(map) {
    if (!map.navDirty && map.nav) return map.nav;
    map.nav = buildNav(map);
    map.navMob = buildNav(map, { vent: false, water: false });
    map.navDirty = false;
    map.navStamp = (map.navStamp || 0) + 1; // существа узнают, что граф изменился
    return map.nav;
  }

  // BFS: расстояния (в рёбрах) от узла start по рёбрам out (или к узлу start по inn при reverse)
  function bfsNav(nav, starts, reverse = false) {
    const dist = new Int32Array(nav.total).fill(-1);
    const q = Array.isArray(starts) ? starts.slice() : [starts];
    for (const s of q) dist[s] = 0;
    const adj = reverse ? nav.inn : nav.out;
    for (let h = 0; h < q.length; h++) {
      const n = q[h], d = dist[n];
      const list = adj[n];
      if (!list) continue;
      for (const m of list) if (dist[m] < 0) { dist[m] = d + 1; q.push(m); }
    }
    return dist;
  }

  // Центр узла в мире (ноги на полу клетки; для лестницы — середина ската)
  function nodePos(map, n) {
    const f = Math.floor(n / NN), i = n % NN;
    const x = centerX(i), z = centerZ(i);
    const t = map.t[f][i];
    let y = f * map.FH;
    if (t === T.STAIR) y += (stairSeg(map.a[f][i]) + 0.5) * map.FH / 2;
    else if (t === T.POOL) y -= map.a[f][i] * 0.25;
    return { x, y, z, f, i };
  }

  /* --------------------------- Видимость --------------------------- */
  function los3(map, x0, y0, z0, x1, y1, z1) {
    const d = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const steps = Math.ceil(d / 0.4);
    for (let k = 1; k < steps; k++) {
      const s = k / steps;
      if (solidAt(map, x0 + (x1 - x0) * s, y0 + (y1 - y0) * s, z0 + (z1 - z0) * s)) return false;
    }
    return true;
  }

  /* ----------------------------- Рулёжка ----------------------------- */
  // Ввод для тела, чтобы дойти до соседнего узла next (используют существа и тесты)
  function steerInput(map, b, next, speed) {
    const p = nodePos(map, next);
    const inp = { vx: 0, vz: 0, jump: false, up: false, down: false, crouch: false };
    const tn = map.t[p.f][p.i];
    if (tn === T.VENT) inp.crouch = true;
    if (b.ladder >= 0 && p.y > b.y + 0.3) {
      inp.up = true;
      if (b.y < p.y - 0.05) return inp; // лезем, пока не поднимемся на уровень площадки
    }
    if (b.swim && p.y > b.y + 0.2) inp.up = true;
    if (b.swim && (p.y < b.y - 0.3 || tn === T.VENT)) inp.down = true; // нырнуть в лаз или под воду
    if (b.ladder >= 0 && p.y < b.y - 0.5) inp.down = true;
    const dx = p.x - b.x, dz = p.z - b.z, dist = Math.hypot(dx, dz);
    if (dist > 0.05) {
      const v = Math.min(speed, dist * 6);
      inp.vx = (dx / dist) * v; inp.vz = (dz / dist) * v;
    }
    // залезть на вертикальную лестницу: зайти в клетку и тянуться вверх
    const here = nodeAt(map, b.x, b.y, b.z);
    if (here >= 0 && map.t[Math.floor(here / NN)][here % NN] === T.LADDER && p.f > Math.floor(here / NN)) inp.up = true;
    return inp;
  }

  /* ------------------------------ Хэш ------------------------------ */
  function mapHash(map) {
    return BR.hashArrays([...map.t, ...map.a, map.wz, map.wcur, new Float32Array(map.wl), new Float32Array(map.wb), new Float32Array([map.F, map.FH])]);
  }

  Object.assign(BR, {
    newMap, buildColumn, buildColumns, setCell, solidAt, waterAt, waterDepth, PHYS, blocked, groundAt, floorOf, nodeAt,
    ladderAt, makeBody, moveBody, buildNav, ensureNav, bfsNav, nodePos, los3, steerInput, mapHash,
    stairDir, stairSeg, floorY, opp,
  });
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
