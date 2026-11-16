// Уровень «Бассейны»: заброшенный аквапарк-санаторий.
//  этаж 0 (−1) — технические тоннели, насосная с вентилями, затопленный лаз, чаша атриума и запечатанный отсек;
//  этаж 1 — палуба атриума с бассейном, «ленивая река» с течением, детский бассейн;
//  этаж 2 — раздевалки, душевые и сауны (пар), балкон над атриумом с вышками;
//  этаж 3 — тренерские и склады, зал колонн в воде по колено; стеклянная крыша над атриумом; выход.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('../build.js') : root.BR;
  const { N, NN, T } = BR;
  const idx = (x, z) => x + z * N;
  const rect = (x0, z0, x1, z1, fn) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) fn(idx(x, z), x, z); };

  // Ключевые места (одинаковы для всех seed — это «знаковая» архитектура уровня)
  const A0 = 17, A1 = 27;          // атриум (провал на этажах 2–3)
  const P0 = 18, P1 = 26;          // чаша бассейна (этаж 0, под провалом этажа 1)
  const GATE = idx(22, 27);        // шлюз в стене чаши (этаж 0)
  const HATCH = idx(24, 33);       // люк над лестницей из отсека (этаж 1)
  const KEY = idx(21, 32);         // ключ-карта в отсеке
  const PLATE = idx(22, 21);       // задвижка шлюза — плита на дне бассейна
  const PUMP = idx(22, 17);        // пульт насоса на палубе
  const PUMPROOM = [36, 36, 41, 41]; // насосная (этаж 0)
  const COLUMNS = [[16, 16], [28, 16], [16, 28], [28, 28], [22, 16], [22, 28], [16, 22], [28, 22]];

  function build(map, rnd, used) {
    const FH = map.FH;
    // планировки этажей
    BR.layerFromGrid(map, 0, BR.gen2d(rnd, { gen: 'maze', p: { straight: 0.8, rooms: 5, roomMin: 3, roomMax: 4, loops: 40, pillars: false } }));
    BR.layerFromGrid(map, 1, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 16, doorW: 2, pillar: 0, cubicle: 0 } }));
    BR.layerFromGrid(map, 2, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 12, doorW: 1, pillar: 0, cubicle: 0.6 } }));
    BR.layerFromGrid(map, 3, BR.gen2d(rnd, { gen: 'rooms', p: { extra: 12, doorW: 1, pillar: 0.4, cubicle: 0 } }));
    const res = map.reserved = new Set();
    const L0 = map.t[0], L1 = map.t[1], L2 = map.t[2], L3 = map.t[3];

    // --- Атриум ---
    rect(14, 14, 30, 30, (i) => { L0[i] = T.WALL; res.add(i); });          // под атриумом — монолит
    rect(P0, P0, P1, P1, (i) => { L0[i] = T.FLOOR; });                      // дно чаши
    rect(A0 - 1, A0 - 1, A1 + 1, A1 + 1, (i, x, z) => {
      res.add(i);
      const inPool = x >= P0 && x <= P1 && z >= P0 && z <= P1;
      L1[i] = inPool ? T.HOLE : T.FLOOR;                                   // палуба в 2 клетки вокруг бассейна
      const inAtr = x >= A0 && x <= A1 && z >= A0 && z <= A1;
      L2[i] = L3[i] = inAtr ? T.HOLE : T.FLOOR;                            // балконы над атриумом
      if (inAtr) map.glass[i] = 1;
    });
    for (const [x, z] of COLUMNS) { const i = idx(x, z); L1[i] = L2[i] = L3[i] = T.WALL; }
    // лесенки из бассейна на палубу
    L0[idx(P0, 22)] = T.LADDER; map.a[0][idx(P0, 22)] = 1;
    L0[idx(P1, 22)] = T.LADDER; map.a[0][idx(P1, 22)] = 0;
    const atrCells = [];
    rect(A0, A0, A1, A1, (i) => atrCells.push(i));
    map.pools = { atrZone: BR.addWaterZone(map, atrCells, 0, 0) }; // при генерации чаша пуста; полной её делает after()

    // --- Запечатанный отсек за шлюзом и люк наверх ---
    rect(18, 28, 26, 35, (i) => { L0[i] = T.WALL; res.add(i); });
    L0[GATE] = T.FLOOR;                                                     // при генерации шлюз открыт
    rect(22, 28, 22, 30, (i) => { L0[i] = T.FLOOR; });
    rect(20, 31, 24, 33, (i) => { L0[i] = T.FLOOR; });
    L0[HATCH] = T.LADDER; map.a[0][HATCH] = 0;                              // стена — справа (x+1)
    L1[HATCH] = T.HOLE; L1[HATCH + 1] = T.FLOOR; res.add(HATCH); res.add(HATCH + 1);
    BR.carveConnect(map, 1, HATCH + 1, new Set([HATCH]));

    // --- Палуба: проходы в комнаты вокруг ---
    for (const i of [idx(A0 - 1, 19), idx(A1 + 1, 25), idx(19, A0 - 1), idx(25, A1 + 1)]) BR.carveConnect(map, 1, i, new Set(atrCells));
    for (const f of [2, 3]) for (const i of [idx(A0 - 1, 25), idx(A1 + 1, 19), idx(19, A1 + 1)]) BR.carveConnect(map, f, i, new Set(atrCells));

    // --- Ленивая река (этаж 1): кольцо с течением по часовой стрелке ---
    rect(2, 28, 14, 40, (i) => { L0[i] = T.WALL; res.add(i); });
    rect(3, 29, 13, 39, (i) => { L1[i] = T.FLOOR; });
    rect(5, 31, 11, 37, (i) => { L1[i] = T.WALL; });
    const river = [];
    rect(4, 30, 12, 38, (i, x, z) => {
      if (x > 4 && x < 12 && z > 30 && z < 38) return;
      L1[i] = T.POOL; map.a[1][i] = 7; river.push(i); // 1,75 м: плыть, выбраться — вплавь
      map.wcur[i] = z === 30 && x < 12 ? 1 : x === 12 && z < 38 ? 3 : z === 38 && x > 4 ? 2 : 4;
    });
    BR.addWaterZone(map, river, FH - 0.25, FH - 1.75);
    BR.carveConnect(map, 1, idx(3, 29));
    BR.carveConnect(map, 1, idx(13, 39));
    map.fx.push({ k: 'river', x0: 4, z0: 30, x1: 12, z1: 38, y: FH });

    // --- Детский бассейн (этаж 1) ---
    rect(30, 3, 39, 10, (i) => { L0[i] = T.WALL; res.add(i); L1[i] = T.FLOOR; });
    const kids = [];
    rect(32, 5, 37, 8, (i) => { L1[i] = T.POOL; map.a[1][i] = 2; kids.push(i); }); // 0,5 м: перешагнуть бортик
    BR.addWaterZone(map, kids, FH - 0.1, FH - 0.5);
    BR.carveConnect(map, 1, idx(30, 3));
    map.fx.push({ k: 'slide', x: 37.5 * 4, y: FH, z: 4.5 * 4 });

    // --- Насосная (этаж 0) ---
    const [px0, pz0, px1, pz1] = PUMPROOM;
    rect(px0, pz0, px1, pz1, (i) => { L0[i] = T.FLOOR; res.add(i); });
    BR.carveConnect(map, 0, idx(px0, pz0));
    map.pools.pumpRoom = [];
    rect(px0, pz0, px1, pz1, (i) => map.pools.pumpRoom.push(i));
    map.pools.prZone = BR.addWaterZone(map, map.pools.pumpRoom, -1, 0); // сухо; при ошибке с вентилями — затопление
    // гарантированный подъём из насосной на этаж 1 (стремянка у западной стены)
    const lad = idx(px0, 38), wall = idx(px0 - 1, 38);
    L0[lad] = T.LADDER; map.a[0][lad] = 1; L0[wall] = T.WALL; res.add(wall);
    L1[lad] = T.HOLE; L1[wall] = T.FLOOR; res.add(lad);
    BR.carveConnect(map, 1, wall, new Set([lad]));

    // --- Зал колонн в воде по колено (этаж 3) ---
    const hall = [];
    rect(2, 2, 13, 13, (i, x, z) => { L3[i] = (x % 3 === 1 && z % 3 === 1) ? T.WALL : T.FLOOR; if (L3[i] === T.FLOOR) hall.push(i); res.add(i); });
    BR.addWaterZone(map, hall, 3 * FH + 0.35, 3 * FH);
    BR.carveConnect(map, 3, idx(14, 7));

    // вырезанные зоны могли разорвать планировку — сшиваем каждый этаж
    for (let f = 0; f < map.F; f++) BR.connectFloor(map, f);

    // --- Связи этажей ---
    BR.addStairs(map, rnd, 0, 2, used);
    BR.addStairs(map, rnd, 1, 3, used);
    BR.addStairs(map, rnd, 2, 3, used);
    BR.addLadders(map, rnd, 0, 1, used);
    BR.addLadders(map, rnd, 2, 1, used);
    BR.addVents(map, rnd, 0, 4);
    BR.addFlood(map, rnd, 0, 70, 0.3);

    // --- Затопленный лаз (этаж 0): короткий участок, где вода выше потолка — только нырнуть ---
    for (let k = 0; k < 400; k++) {
      const i = Math.floor(rnd() * NN), x = i % N, z = (i / N) | 0;
      if (res.has(i) || x < 2 || z < 2 || x > N - 7 || z > N - 7) continue;
      const horiz = rnd() < 0.5, cells = [];
      for (let s = 0; s < 4; s++) cells.push(horiz ? i + s : i + s * N);
      if (!cells.every((c) => L0[c] === T.FLOOR && map.wz[c] < 0 && !res.has(c))) continue;
      BR.addWaterZone(map, cells, FH - 0.1, 0);
      cells.forEach((c) => res.add(c));
      break;
    }

    // --- Декор: сауны с паром, вышки, буйки, фонтан, шезлонги ---
    let saunas = 0;
    for (let k = 0; k < 300 && saunas < 4; k++) {
      const i = Math.floor(rnd() * NN);
      if (L2[i] !== T.FLOOR || res.has(i)) continue;
      map.fx.push({ k: 'steam', x: BR.centerX(i), y: 2 * FH, z: BR.centerZ(i) });
      saunas++;
    }
    for (const z of [20, 22, 24]) map.fx.push({ k: 'buoys', x0: P0 * 4, x1: (P1 + 1) * 4, z: z * 4 + 2, zone: map.pools.atrZone });
    map.fx.push({ k: 'fountain', x: 22.5 * 4, y: 0, z: 22.5 * 4 });
    map.fx.push({ k: 'board', x: (A0 - 1) * 4 + 2, y: 2 * FH, z: 19.5 * 4, dir: 0 });
    map.fx.push({ k: 'board', x: (A1 + 1) * 4 + 2, y: 3 * FH, z: 25.5 * 4, dir: 1 });
    for (let k = 0; k < 8; k++) {
      const x = A0 - 1 + Math.floor(rnd() * 2) * (A1 - A0 + 2), z = P0 + Math.floor(rnd() * 9);
      map.fx.push({ k: 'lounger', x: x * 4 + 2, y: FH, z: z * 4 + 2, rot: Math.PI / 2 });
    }
  }

  // Начальное состояние: шлюз закрыт, люк закрыт, бассейн полный
  function after(map) {
    const P = map.pools;
    P.full = map.FH - 0.3; P.low = 0; P.high = 3 * map.FH - 0.3;
    P.gate = GATE; P.hatch = HATCH; P.key = KEY; P.plate = PLATE; P.pump = PUMP;
    map.t[0][GATE] = T.WALL;
    map.t[1][HATCH] = T.FLOOR;
    map.wl[P.atrZone] = P.full;
  }

  // Состояния для проверки проходимости (tests/verify-levels.js): что должно быть достижимо на каждом шаге
  function states(map) {
    const P = map.pools;
    const set = (f, i, t) => BR.setCell(map, f, i, t);
    return [
      { name: 'старт', apply() {}, need: ['valve', 'drain', 'paper'] },
      { name: 'вода слита, шлюз держат', apply() { map.wl[P.atrZone] = P.low; set(0, P.gate, T.FLOOR); }, need: ['gateplate', 'keycard'] },
      { name: 'карта взята: люк открыт, шлюз закрыт', apply() { set(0, P.gate, T.WALL); set(1, P.hatch, T.HOLE); }, need: ['pump'] },
      { name: 'насос: вода в атриуме до верха', apply() { map.wl[P.atrZone] = P.high; }, need: [], exit: true },
    ];
  }

  BR.LEVEL_GENS = BR.LEVEL_GENS || {};
  BR.LEVEL_GENS.pools = { build, after, states };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
