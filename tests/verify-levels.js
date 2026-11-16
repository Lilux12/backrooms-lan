'use strict';
// Проверка проходимости уровней на множестве seed:
//  - выход достижим от старта (с открытой дверью);
//  - все ключевые объекты (предметы, щитки, рычаги, цифры, плиты) достижимы;
//  - нет ловушек: из любой достижимой точки можно вернуться к старту (в т.ч. после падения в любой провал);
//  - генерация детерминирована, и браузерная сборка общего кода даёт тот же хэш, что и Node;
//  - физика согласована с графом: тело реально проходит выборку рёбер (лестницы, провалы, лазы, вода).
// Запуск: node tests/verify-levels.js [seeds=300] [уровень]
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BR = require('../shared/map.js');
const { buildLevel } = require('../server/level.js');

const SEEDS = +process.argv[2] || 300;
const ONLY = process.argv[3] != null ? +process.argv[3] : null;
const { NN, T } = BR;

// Общий код так, как его грузит браузер: файлы по очереди в одном контексте с window
function browserBR() {
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'index.html'), 'utf8');
  for (const m of html.matchAll(/<script src="(shared\/[^"]+)"><\/script>/g)) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', m[1]), 'utf8'), ctx, { filename: m[1] });
  }
  return ctx.BR;
}

// Довести тело от центра узла a до узла b, управляя как существо. true — дошли.
function simulateEdge(map, a, b) {
  const p = BR.nodePos(map, a);
  const body = BR.makeBody(p.x, p.y, p.z);
  const g = BR.groundAt(map, p.x, p.y + 0.3, p.z, BR.PHYS.R, BR.PHYS.STEP);
  if (g > -Infinity) body.y = g;
  const dt = 1 / 30;
  for (let k = 0; k < 30 * 8; k++) {
    BR.moveBody(map, body, BR.steerInput(map, body, b, 3.6), dt);
    if (BR.nodeAt(map, body.x, body.y, body.z) === b) return true;
  }
  return false;
}

function edgeKind(map, a, b) {
  const fa = Math.floor(a / NN), fb = Math.floor(b / NN);
  const ta = map.t[fa][a % NN], tb = map.t[fb][b % NN];
  if (fb < fa) return ta === T.STAIR || tb === T.STAIR ? 'stair' : tb === T.LADDER ? 'ladder' : 'drop';
  if (fb > fa) return ta === T.LADDER ? 'ladder' : 'stair';
  if (ta === T.STAIR || tb === T.STAIR) return 'stair';
  if (ta === T.VENT || tb === T.VENT) return 'vent';
  if (ta === T.POOL || tb === T.POOL) return 'pool';
  return 'flat';
}

function verifyLevel(lv, BRB) {
  const stats = { seeds: 0, edges: {}, failEdges: 0 };
  for (let s = 0; s < SEEDS; s++) {
    const seed = (s * 2654435761) >>> 0;
    const map = BR.generate(seed, lv);
    const tag = `уровень ${lv}, seed ${seed}`;
    // детерминизм и совпадение с браузерной сборкой
    assert.strictEqual(BR.generate(seed, lv).hash, map.hash, `${tag}: генерация недетерминирована`);
    if (s < 20) assert.strictEqual(BRB.generate(seed, lv).hash, map.hash, `${tag}: хэш браузера и сервера различается`);

    const nav = BR.ensureNav(map);
    const reach = BR.bfsNav(nav, map.spawnNode), back = BR.bfsNav(nav, map.spawnNode, true);
    for (let n = 0; n < nav.total; n++) {
      if (reach[n] >= 0 && back[n] < 0) assert.fail(`${tag}: ловушка в узле ${n} (этаж ${Math.floor(n / NN)}) — оттуда не вернуться`);
    }
    // объекты уровня так, как их расставит сервер
    const G = buildLevel(lv, seed, {});
    const objNode = (o) => {
      // настенные объекты стоят на границе клетки — проверяем клетку перед стеной
      const px = o.nx !== undefined ? o.x + o.nx * 1.5 : o.x, pz = o.nz !== undefined ? o.z + o.nz * 1.5 : o.z;
      return BR.nodeAt(G.map, px, o.y + 0.1, pz);
    };
    const L = BR.LEVELS[lv];
    const gen = L.custom && BR.LEVEL_GENS[L.custom];
    if (gen && gen.states) {
      // пошаговая головоломка: на каждом шаге — свои обязательные объекты и отсутствие ловушек
      for (const st of gen.states(G.map)) {
        st.apply();
        G.map.navDirty = true;
        if (st.exit) BR.setDoor(G.map, true);
        const nv = BR.ensureNav(G.map);
        const r = BR.bfsNav(nv, G.map.spawnNode), bk = BR.bfsNav(nv, G.map.spawnNode, true);
        for (let n = 0; n < nv.total; n++) if (r[n] >= 0 && bk[n] < 0) assert.fail(`${tag}, шаг «${st.name}»: ловушка в узле ${n}`);
        for (const o of G.objs) {
          if (!st.need.includes(o.kind) && !st.need.includes(`${o.kind}:${o.group}`)) continue;
          const n = objNode(o);
          assert(n >= 0 && r[n] >= 0, `${tag}, шаг «${st.name}»: объект ${o.kind} недостижим`);
        }
        for (const k of st.need) assert(G.objs.some((o) => o.kind === k || `${o.kind}:${o.group}` === k), `${tag}, шаг «${st.name}»: нет объекта ${k}`);
        if (st.exit) assert(r[G.map.exit.frontNode] >= 0, `${tag}: выход недостижим`);
        // головоломку нельзя обойти: на этом шаге до двери выхода (даже открытой) добраться нельзя
        if (st.noExit) assert(r[G.map.exit.frontNode] < 0, `${tag}, шаг «${st.name}»: выход достижим в обход головоломки`);
      }
    } else {
      BR.setDoor(G.map, true);
      const nav2 = BR.ensureNav(G.map);
      const r2 = BR.bfsNav(nav2, G.map.spawnNode);
      assert(r2[G.map.exit.frontNode] >= 0, `${tag}: выход недостижим`);
      for (const o of G.objs) {
        if (o.kind === 'arrow' || o.kind === 'door' || o.kind === 'lift') continue;
        const n = objNode(o);
        assert(n >= 0 && r2[n] >= 0, `${tag}: объект ${o.kind} (${o.x.toFixed(1)}, ${o.y}, ${o.z.toFixed(1)}) недостижим`);
      }
    }
    // физика против графа: все «особые» рёбра на первых seed, выборка обычных
    if (s < 12) {
      const rnd = BR.mulberry32(seed ^ 0xabc);
      for (let n = 0; n < nav.total; n++) {
        if (reach[n] < 0 || !nav.out[n]) continue;
        for (const m of nav.out[n]) {
          const kind = edgeKind(map, n, m);
          if (kind === 'flat' && rnd() > 0.02) continue;
          stats.edges[kind] = (stats.edges[kind] || 0) + 1;
          if (!simulateEdge(map, n, m)) {
            stats.failEdges++;
            const a = BR.nodePos(map, n), b = BR.nodePos(map, m);
            assert.fail(`${tag}: физика не проходит ребро ${kind} (${a.f}:${a.i % 45},${Math.floor(a.i / 45)}) → (${b.f}:${b.i % 45},${Math.floor(b.i / 45)})`);
          }
        }
      }
    }
    stats.seeds++;
  }
  return stats;
}

const t0 = Date.now();
const BRB = browserBR();
for (let lv = 0; lv < BR.LEVELS.length; lv++) {
  if (ONLY != null && lv !== ONLY) continue;
  const t = Date.now();
  const st = verifyLevel(lv, BRB);
  console.log(`OK уровень ${lv} «${BR.LEVELS[lv].name}»: ${st.seeds} seed, рёбра проверены физикой: ` +
    Object.entries(st.edges).map(([k, v]) => `${k}=${v}`).join(' ') + ` (${((Date.now() - t) / 1000).toFixed(1)} с)`);
}
console.log(`OK verify-levels: всё проходимо (${((Date.now() - t0) / 1000).toFixed(1)} с)`);
