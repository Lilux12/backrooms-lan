// Уровни кампании и генерация карты по (seed, номер уровня).
// Уровень целиком определяется этой парой, поэтому у всех игроков и у сервера карта одинаковая
// (это проверяется хэшем при подключении).
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const BR = isNode ? (require('./core.js'), require('./world.js'), require('./gen2d.js'), require('./build.js'), require('./levels/pools.js')) : root.BR;
  const { TILE, N, NN, T, D4, mulberry32, shuffle, cellX, cellZ, inner } = BR;

  /* ------------------------------ Кампания ------------------------------
   Поля уровня:
     F, FH          — число этажей и высота этажа (м)
     floors[]       — планировка каждого этажа: { gen, p } (см. gen2d.js)
     spawnF, exitF  — этаж старта и этаж выхода
     build(map, rnd, reserve) — вертикальные связи и особенности (build.js)
     mobs, mobType, mobSpeed, water (бутылки), mapChance, puzzles[], chase, infStamina
  */
  const LEVELS = [
    {
      name: 'Жёлтые комнаты', style: 'yellow', F: 2, FH: 3.4, spawnF: 1, exitF: 1,
      floors: [
        { gen: 'maze', p: { straight: 0.55, rooms: 8, roomMin: 3, roomMax: 5, loops: 200, pillars: false } }, // нижний этаж: мокрый ковёр
        { gen: 'maze', p: { straight: 0, rooms: 16, roomMin: 3, roomMax: 8, loops: 140, pillars: true } },
      ],
      build(map, rnd, used) {
        BR.addStairs(map, rnd, 0, 3, used);
        BR.addLadders(map, rnd, 0, 3, used);
        BR.addHoles(map, rnd, 1, 7, 2);
        BR.addLow(map, rnd, 1, 7, 5);
        BR.addFlood(map, rnd, 0, 60, 0.25);
      },
      mobs: 1, mobType: 'stalker', mobSpeed: 1.0, water: 4, mapChance: 0.7,
      puzzles: ['fuses'], fuses: 3,
      intro: 'Электричество отключено. Найдите 3 предохранителя и вставьте их в щиток — дверь выхода оживёт. Осторожно: пол местами провален, внизу — мокрые коридоры.',
    },
    {
      name: 'Подземная парковка', style: 'concrete', F: 2, FH: 3.8, spawnF: 1, exitF: 0,
      floors: [{ gen: 'halls', p: { walls: 12, blocks: 30 } }, { gen: 'halls', p: { walls: 14, blocks: 26 } }],
      build(map, rnd, used) {
        BR.addStairs(map, rnd, 0, 4, used);
        BR.addLadders(map, rnd, 0, 1, used);
        BR.addFlood(map, rnd, 0, 140, 0.45);
      },
      mobs: 1, mobType: 'stalker', mobSpeed: 1.05, water: 3, mapChance: 0.35,
      puzzles: ['code'],
      intro: 'Код от шлагбаума нацарапан на стенах обоих ярусов. Найдите все 4 цифры и введите код на терминале у выхода на нижнем ярусе. Включите фонарь (F) — здесь темно.',
    },
    {
      name: 'Технические тоннели', style: 'tunnel', F: 3, FH: 2.9, spawnF: 2, exitF: 0,
      floors: [
        { gen: 'maze', p: { straight: 0.82, rooms: 4, roomMin: 3, roomMax: 4, loops: 22, pillars: false } },
        { gen: 'maze', p: { straight: 0.85, rooms: 3, roomMin: 3, roomMax: 4, loops: 18, pillars: false } },
        { gen: 'maze', p: { straight: 0.8, rooms: 4, roomMin: 3, roomMax: 4, loops: 22, pillars: false } },
      ],
      build(map, rnd, used) {
        for (let f = 0; f < 2; f++) { BR.addLadders(map, rnd, f, 4, used); BR.addStairs(map, rnd, f, 1, used); }
        for (let f = 0; f < 3; f++) BR.addVents(map, rnd, f, 8);
        BR.addHoles(map, rnd, 2, 3, 1);
        BR.addHoles(map, rnd, 1, 2, 1);
      },
      mobs: 1, mobType: 'stalker', mobSpeed: 1.1, water: 3,
      puzzles: ['plates'],
      intro: 'Дверь внизу откроется, только когда нажаты ОБЕ плиты. Каждая держится около 20 секунд. Тоннели связаны колодцами с лестницами, а через лазы (C — ползти) можно срезать путь.',
    },
    {
      name: 'Бассейны', style: 'pool', custom: 'pools', F: 4, FH: 4.0, spawnF: 1, exitF: 3,
      mobList: [{ type: 'stalker', count: 1 }, { type: 'drowner', count: 1 }], mobSpeed: 1.1, water: 4,
      puzzles: ['pools'],
      intro: 'Заброшенный аквапарк. Слейте воду из атриума вентилями в насосной (этажом ниже), откройте шлюз на дне бассейна, найдите ключ-карту и запустите насос — вода поднимет вас к выходу под стеклянной крышей. В воде что-то живёт.',
      lore: [
        { title: 'Записка тренера', text: 'Дорожки больше не держат воду. Вчера на 3-й кто-то плыл до самого утра — я слышал удары о бортик. Утром бассейн был пуст. И мокрые следы вели ВНИЗ, в насосную.' },
        { title: 'Расписание «последних заплывов»', text: '07:00 — разминка\n08:00 — группа «Дельфин»\n09:00 — группа «Дельфин» (повторно)\n09:00 — группа «Дельфин»\n??:?? — НЕ ВХОДИТЬ В ВОДУ ПОСЛЕ ГУДКА' },
        { title: 'Плёнка камеры №4', text: 'Кассета подписана «бассейн, ночь». На записи — пустая чаша, свет мигает. На 03:14 на дне появляется фигура, лежащая лицом вверх. Она не двигается. Вода прибывает. Фигура — уже у самой поверхности, и смотрит в камеру.' },
        { title: 'Памятка насосной', text: 'Слив атриума выполнять ТОЛЬКО при верном давлении на всех трёх вентилях. Неверное давление — аварийный выброс в насосную. Ключ-карта насоса хранится в сухом отсеке за шлюзом.' },
      ],
    },
    {
      name: 'Беги!', tag: 'LEVEL !', style: 'run', F: 1, FH: 3.4, spawnF: 0, exitF: 0,
      floors: [{ gen: 'run' }],
      mobs: 3, mobType: 'runner', mobSpeed: 1.35, water: 0,
      chase: true, infStamina: true, puzzles: [],
      intro: 'Дверь в конце коридора уже открыта. Как только вы выйдете из укрытия, за вами бросится стая. Бегите, огибайте мебель, не останавливайтесь. Выносливость здесь не кончается.',
    },
    {
      name: 'Офисы', style: 'office', F: 3, FH: 3.2, spawnF: 0, exitF: 2,
      floors: [
        { gen: 'rooms', p: { extra: 10, doorW: 1, pillar: 0, cubicle: 0.7 } },
        { gen: 'rooms', p: { extra: 12, doorW: 1, pillar: 0, cubicle: 0.6 } },
        { gen: 'rooms', p: { extra: 10, doorW: 1, pillar: 0, cubicle: 0.7 } },
      ],
      build(map, rnd, used) {
        BR.addAtrium(map, rnd, 0, 4);
        for (let f = 0; f < 2; f++) { BR.addStairs(map, rnd, f, 2, used); BR.addLadders(map, rnd, f, 1, used); }
        BR.addLow(map, rnd, 1, 4, 4);
      },
      mobs: 2, mobType: 'stalker', mobSpeed: 1.1, water: 4,
      puzzles: ['fuses', 'code'], fuses: 2,
      intro: 'Три этажа офиса. Верните питание лифту (2 предохранителя) и введите код на терминале наверху. Здесь вас двое преследователей.',
    },
  ];

  /* ------------------------------ Генерация ------------------------------ */
  function generate(seed, levelIdx = 0) {
    const L = LEVELS[levelIdx];
    const rnd = mulberry32(((seed >>> 0) + levelIdx * 977) >>> 0);
    const map = BR.newMap(L.F, L.FH);
    const spawnCell = 1 + N;
    const spawnNode = L.spawnF * NN + spawnCell;
    const used = [spawnCell, spawnCell + 1, spawnCell + N]; // у старта ничего не строим
    if (L.custom) {
      // собственный генератор уровня (shared/levels/*.js): строит всё сам
      BR.LEVEL_GENS[L.custom].build(map, rnd, used);
    } else {
      L.floors.forEach((spec, f) => BR.layerFromGrid(map, f, BR.gen2d(rnd, spec)));
      if (L.build) L.build(map, rnd, used);
    }
    if (map.t[L.spawnF][spawnCell] !== T.FLOOR) map.t[L.spawnF][spawnCell] = T.FLOOR;
    // ремонт идёт в «открытом» состоянии (все двери и люки открыты), потом закрываем то, что закрыто в начале
    BR.finalize(map, spawnNode);
    if (L.custom && BR.LEVEL_GENS[L.custom].after) { BR.LEVEL_GENS[L.custom].after(map); BR.buildColumns(map); map.navDirty = true; BR.ensureNav(map); }

    map.seed = seed; map.level = levelIdx;
    map.spawnNode = spawnNode;
    const sp = BR.nodePos(map, spawnNode);
    map.spawn = { x: sp.x, y: sp.y, z: sp.z, f: sp.f };
    map.dist = BR.bfsNav(map.nav, spawnNode);
    map.maxDist = 0;
    map.spots = []; // достижимые клетки с ровным полом — для предметов, респавна, блуждания
    for (let n = 0; n < map.nav.total; n++) {
      if (map.dist[n] < 0) continue;
      if (map.dist[n] > map.maxDist) map.maxDist = map.dist[n];
      const t = map.t[Math.floor(n / NN)][n % NN];
      if (t === T.FLOOR || t === T.LOW) map.spots.push(n);
    }
    map.exit = pickExit(map, rnd, L.exitF);
    map.obst = L.floors && L.floors[0].gen === 'run' ? BR.genObstacles(rnd) : [];
    map.hash = BR.mapHash(map);
    return map;
  }

  // Выход: стена-ниша с ровно одним соседним полом, подальше от старта
  function pickExit(map, rnd, f) {
    const Lt = map.t[f];
    const cands = [];
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      const i = x + z * N;
      if (Lt[i] !== T.WALL) continue;
      let cnt = 0, fl = -1, fd = 0, bad = false;
      for (let d = 0; d < 4; d++) {
        const j = (x + D4[d][0]) + (z + D4[d][1]) * N, t = Lt[j];
        if (t === T.FLOOR && map.dist[f * NN + j] >= 0) { cnt++; fl = j; fd = d; }
        else if (t !== T.WALL) bad = true;
      }
      if (cnt === 1 && !bad && (f + 1 >= map.F || map.t[f + 1][i] !== T.HOLE)) cands.push({ i, fl, fd, d: map.dist[f * NN + fl] });
    }
    cands.sort((a, b) => b.d - a.d);
    let ex = cands[Math.floor(rnd() * Math.min(5, cands.length))];
    if (!ex) { // запасной вариант: ниша у самого дальнего пола этажа, у которого есть стена рядом
      const onF = map.spots.filter((n) => Math.floor(n / NN) === f).sort((a, b) => map.dist[b] - map.dist[a]);
      if (!onF.length) return pickExit(map, rnd, f > 0 ? f - 1 : map.F - 1); // этаж недостижим — берём другой
      for (const far of onF) {
        const fi = far % NN;
        for (let d = 0; d < 4 && !ex; d++) {
          const x = cellX(fi) + D4[d][0], z = cellZ(fi) + D4[d][1];
          if (inner(x, z) && Lt[x + z * N] === T.WALL) ex = { i: x + z * N, fl: fi, fd: d ^ 1, d: map.dist[far] };
        }
        if (ex) break;
      }
    }
    const y = f * map.FH;
    return {
      f, y, cell: ex.i, tx: cellX(ex.i), ty: cellZ(ex.i),
      wx: BR.centerX(ex.i), wz: BR.centerZ(ex.i),   // центр двери
      fx: BR.centerX(ex.fl), fz: BR.centerZ(ex.fl), // пол перед дверью
      dx: -D4[ex.fd][0], dz: -D4[ex.fd][1],          // направление от пола к двери
      frontNode: f * NN + ex.fl,
    };
  }

  function setDoor(map, open) { BR.setCell(map, map.exit.f, map.exit.cell, open ? T.FLOOR : T.WALL); }

  /* --------------------------- Расстановка объектов --------------------------- */
  const sameFloorSep = (a, b) => (Math.floor(a / NN) !== Math.floor(b / NN) ? 1e9
    : Math.max(Math.abs(cellX(a % NN) - cellX(b % NN)), Math.abs(cellZ(a % NN) - cellZ(b % NN))));

  function spotOf(map, n) {
    const p = BR.nodePos(map, n);
    return { x: p.x, y: p.y, z: p.z, f: p.f, node: n, tile: p.i };
  }

  // n точек на ровном полу с ограничениями: minDist/maxDist — по графу от старта, minSep — в клетках на одном этаже,
  // floor — только этот этаж
  function pickSpots(map, rnd, n, o = {}) {
    const minDist = o.minDist || 0, maxDist = o.maxDist == null ? 1e9 : o.maxDist;
    let order = shuffle(rnd, map.spots);
    if (o.floor != null) order = order.filter((m) => Math.floor(m / NN) === o.floor);
    const taken = [];
    for (const [md, sep] of [[minDist, o.minSep || 0], [minDist, Math.floor((o.minSep || 0) / 2)], [0, 0]]) {
      for (const m of order) {
        if (taken.length >= n) break;
        const d = map.dist[m];
        if (d < md || d > maxDist || taken.includes(m)) continue;
        if (taken.every((t) => sameFloorSep(t, m) >= sep)) taken.push(m);
      }
      if (taken.length >= n) break;
    }
    return taken.map((m) => spotOf(map, m));
  }

  // Точки на стенах (цифры, записки). nx,nz — нормаль в сторону комнаты.
  function pickWallSpots(map, rnd, n, o = {}) {
    const minDist = o.minDist || 0, maxDist = o.maxDist == null ? 1e9 : o.maxDist, sep = o.minSep || 0;
    const order = shuffle(rnd, map.spots).filter((m) => map.t[Math.floor(m / NN)][m % NN] === T.FLOOR);
    const out = [], used = [];
    for (const relax of [1, 0.5, 0]) {
      for (const m of order) {
        if (out.length >= n) break;
        const d = map.dist[m];
        if (d < minDist * relax || d > maxDist || used.includes(m)) continue;
        if (!used.every((u) => sameFloorSep(u, m) >= sep * relax)) continue;
        const f = Math.floor(m / NN), i = m % NN, cx = cellX(i), cz = cellZ(i);
        const walls = D4.filter(([dx, dz]) => {
          const j = (cx + dx) + (cz + dz) * N;
          return map.t[f][j] === T.WALL && !(f === map.exit.f && j === map.exit.cell);
        });
        if (!walls.length) continue;
        const [dx, dz] = walls[Math.floor(rnd() * walls.length)];
        used.push(m);
        out.push({ x: (cx + 0.5) * TILE + dx * (TILE / 2 - 0.04), y: f * map.FH, z: (cz + 0.5) * TILE + dz * (TILE / 2 - 0.04), f, nx: -dx, nz: -dz, tile: i, node: m });
      }
      if (out.length >= n) break;
    }
    return out;
  }

  // Кратчайший путь (узлы) от старта до клетки перед дверью
  function route(map) {
    const nav = BR.ensureNav(map);
    const d = BR.bfsNav(nav, map.exit.frontNode, true);
    let n = map.spawnNode;
    const out = [n];
    for (let guard = 0; d[n] > 0 && guard < 5000; guard++) {
      let best = -1;
      for (const m of nav.out[n] || []) if (d[m] >= 0 && d[m] < d[n] && (best < 0 || d[m] < d[best])) best = m;
      if (best < 0) break;
      n = best; out.push(n);
    }
    return out;
  }

  Object.assign(BR, { LEVELS, generate, setDoor, pickSpots, pickWallSpots, route, spotOf });
  if (isNode) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
