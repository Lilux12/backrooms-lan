'use strict';
// ИИ существ. Все существа двигаются той же физикой, что и игроки (shared/world.js), по графу навигации
// (лестницы, провалы, этажи), поэтому не проходят сквозь стены и не застревают на лестницах.
//
// У каждого типа — свои чувства (таблица DEF): зрение (дальность, конус, нужен ли свет), слух шагов и бега,
// «тепло» фонаря, вибрация. Особые типы:
//   drowner  — живёт только в глубокой воде;
//   worm     — сидит в трубах (невидим), вылезает, когда кто-то бежит;
//   headlights — стоит спиной, видит только перед собой, идёт на сигнализацию;
//   bellhop / mannequin / doll — «статуи»: замирают, когда на них смотрят (или светят), двигаются за спиной;
//   teacher  — слышит громкие звуки, засыпает под музыкальную шкатулку;
//   specimen — мутирует по фазам (быстрее, лезет в вентиляцию, идёт на тепло фонаря);
//   overseer — босс: слышит бег по металлу и проламывает стены;
//   runner   — стая на уровне-погоне: окружает (часть стаи режет путь вперёд), со временем быстрее.
const BR = require('../shared/map.js');
const { setCellNet, event } = require('./puzzles/util');

const BASE_SPEED = 4.2;      // скорость погони, умножается на mobSpeed уровня и множитель типа
const WANDER_SPEED = 2.1;
const RUN_SPD = 4.6;         // игрок быстрее этого — «бежит» (слышно)
const REPATH = 0.3;          // как часто пересчитывать поле расстояний, с
const EYE = 2.2;             // высота глаз существа
const VIEW_COS = 0.55;       // «в поле зрения» игрока: косинус угла от направления взгляда (~57°)
const BEAM_COS = 0.86;       // в луче фонаря (~30°)
const SMASH_GAP = 7;         // Надсмотрщик ломает стену не чаще, чем раз в столько секунд

// Чувства и характер. near — слышит шаги рядом всегда; see/seeTorch — дальность зрения (без/с фонарём игрока)
// и cone — косинус половины угла обзора (нет — видит во все стороны); runHear — слышит бег; heat — чует фонарь сквозь стены;
// crawl — ходит через вентиляцию; lose — сколько секунд помнит цель, которую потерял.
const DEF = {
  stalker: { speed: 1.0, wander: 1.0, near: 9, see: 28, seeTorch: 38, lose: 6 },
  runner: { speed: 1.0, wander: 1.0, near: 9, see: 28, seeTorch: 38, lose: 6 },
  skinstealer: { speed: 1.05, wander: 1.0, near: 9, see: 28, seeTorch: 38, lose: 6 },
  worm: { speed: 1.05, wander: 0.8, near: 4.5, runHear: 34, crawl: true, hideIdle: true, lose: 4 },
  crawler: { speed: 1.25, wander: 1.3, near: 6, see: 12, seeTorch: 20, runHear: 22, crawl: true, lose: 4 },
  headlights: { speed: 1.25, wander: 0.7, near: 2.5, see: 30, seeTorch: 40, cone: 0.8, idle: true, lose: 5 },
  bellhop: { speed: 1.45, wander: 0.9, near: 0, runHear: 26, statue: 'look', patrol: true, lose: 6 },
  mannequin: { speed: 1.5, wander: 0.9, near: 0, statue: 'light', hunt: 30, lose: 99 },
  doll: { speed: 1.35, wander: 1.2, near: 0, statue: 'dark', hunt: 18, lose: 99 },
  specimen: { speed: 1.0, wander: 1.0, near: 6, runHear: 20, heat: 30, lose: 5 },
  teacher: { speed: 1.05, wander: 0.8, near: 8, runHear: 30, music: true, lose: 4 },
  overseer: { speed: 0.95, wander: 0.8, near: 10, see: 26, seeTorch: 30, runHear: 40, smash: true, boss: true, lose: 8 },
};

function newMob(map, x, y, z, stun, type = 'stalker') {
  const def = DEF[type] || DEF.stalker;
  return {
    type, x, y, z, r: Math.random() * Math.PI * 2, body: BR.makeBody(x, y, z), mode: 'wander', stun, lost: 0, wp: -1, repath: 0,
    field: null, fieldGoal: -1, alert: null, node: BR.nodeAt(map, x, y + 0.1, z), boss: !!def.boss, frozen: false,
    hidden: !!def.hideIdle, lastNode: -1, turnT: 0,
  };
}

/* --------------------------- Утопленник --------------------------- */
// Живёт только в глубокой воде: двигается по графу узлов, где глубина больше DROWN_DEPTH.
// Чувствует тех, кто плывёт или идёт по воде; на сушу не выходит. Нет воды — затаивается.
const DROWN_DEPTH = 1.0, DROWN_SPEED = 3.4, DROWN_RAGE = 4.6, DROWN_SENSE = 26;

function waterGraph(G) {
  const map = G.map;
  BR.ensureNav(map);
  const ver = `${map.navStamp}:${map.waterVer || 0}`;
  if (G.wg && G.wg.ver === ver) return G.wg;
  const ok = new Uint8Array(map.nav.total);
  for (let n = 0; n < map.nav.total; n++) {
    if (!map.nav.out[n]) continue;
    const f = Math.floor(n / BR.NN), i = n % BR.NN;
    if (map.wz[i] >= 0 && BR.waterDepth(map, f, i) > DROWN_DEPTH) ok[n] = 1;
  }
  const out = new Array(map.nav.total), inn = new Array(map.nav.total);
  for (let n = 0; n < map.nav.total; n++) {
    if (!ok[n]) continue;
    out[n] = map.nav.out[n].filter((m) => ok[m]);
    for (const m of out[n]) (inn[m] || (inn[m] = [])).push(n);
  }
  G.wg = { ver, ok, nav: { out, inn, total: map.nav.total } };
  return G.wg;
}

// Игрок в воде (плывёт или идёт по ней)
function inWater(G, p) { return BR.waterAt(G.map, p.x, p.z, p.y) > p.y + 0.3; }

function updateDrowner(G, m, dt, players) {
  const wg = waterGraph(G);
  const map = G.map;
  if (m.node < 0 || !wg.ok[m.node]) {
    // вода ушла — затаиться в ближайшей глубокой воде (или исчезнуть до возвращения воды)
    let any = -1;
    for (let n = 0; n < wg.ok.length; n++) if (wg.ok[n]) { any = n; break; }
    if (any < 0) { m.hidden = true; return; }
    const p = BR.nodePos(map, any);
    m.node = any; m.x = p.x; m.z = p.z;
  }
  m.hidden = false;
  if (m.stun > 0) { m.stun -= dt; return; }
  // цель: ближайший игрок в воде, которого можно «почувствовать»
  let target = null, bd = DROWN_SENSE;
  for (const p of players) {
    if (!inWater(G, p)) continue;
    const d = Math.hypot(p.x - m.x, p.z - m.z, (p.y - m.y) * 0.5);
    if (d < bd) { bd = d; target = p; }
  }
  let goal = -1;
  if (target) {
    m.mode = 'chase';
    const tn = BR.nodeAt(map, target.x, target.y + 0.1, target.z);
    goal = tn >= 0 && wg.ok[tn] ? tn : -1;
  } else m.mode = 'wander';
  if (goal < 0) {
    if (m.wp < 0 || !wg.ok[m.wp] || m.wp === m.node) {
      let n = m.node;
      for (let k = 0; k < 6 && wg.nav.out[n] && wg.nav.out[n].length; k++) n = wg.nav.out[n][Math.floor(Math.random() * wg.nav.out[n].length)];
      m.wp = n;
    }
    goal = m.wp;
  }
  if (!m.field || m.fieldGoal !== goal || m.fieldVer !== wg.ver || (m.repath -= dt) <= 0) {
    m.field = BR.bfsNav(wg.nav, goal, true); m.fieldGoal = goal; m.fieldVer = wg.ver; m.repath = REPATH;
  }
  let next = m.node;
  if (m.node !== goal && m.field[m.node] > 0) {
    let bdist = m.field[m.node];
    for (const n of wg.nav.out[m.node]) if (m.field[n] >= 0 && m.field[n] < bdist) { bdist = m.field[n]; next = n; }
  }
  const p = next === goal && target ? target : BR.nodePos(map, next);
  const speed = (m.rage ? DROWN_RAGE : DROWN_SPEED) * (target ? 1 : 0.5) * (G.mobMul || 1);
  const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
  if (d > 0.05) { const s = Math.min(d, speed * dt); m.x += (dx / d) * s; m.z += (dz / d) * s; m.r = Math.atan2(dx, dz); }
  const here = BR.nodeAt(map, m.x, m.y + 0.5, m.z);
  if (here >= 0 && wg.ok[here]) m.node = here;
  // держится под поверхностью; рядом с жертвой — всплывает
  const wl = BR.waterAt(map, m.x, m.z, BR.nodePos(map, m.node).y);
  const ty = wl - (target && bd < 6 ? 1.2 : 2.2);
  m.y += (ty - m.y) * Math.min(1, dt * 3);
}

/* ----------------------------- Общее ----------------------------- */
const dist3 = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 1.5, a.z - b.z);

// Случайная достижимая точка, по возможности подальше от (x, y, z)
function randomFloorFar(G, from, samples = 40) {
  const sp = G.map.spots;
  let best = null, bd = -1;
  for (let i = 0; i < samples; i++) {
    const p = BR.nodePos(G.map, sp[Math.floor(Math.random() * sp.length)]);
    const d = dist3(p, from);
    if (d > bd) { bd = d; best = p; }
  }
  return best;
}

// Узел для блуждания: склоняемся к случайному игроку, чтобы существо не уходило в пустые углы
function pickWander(G, players) {
  const sp = G.map.spots;
  const target = players.length ? players[Math.floor(Math.random() * players.length)] : null;
  let best = -1, bd = 1e9;
  for (let i = 0; i < 8; i++) {
    const n = sp[Math.floor(Math.random() * sp.length)];
    const d = target ? dist3(BR.nodePos(G.map, n), target) : Math.random();
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

const navOf = (G, m) => ((DEF[m.type] || DEF.stalker).crawl || (m.type === 'specimen' && (G.specimenPhase || 1) >= 3) ? BR.navCrawl(G.map) : (BR.ensureNav(G.map), G.map.navMob));

// Шаг к узлу goal по полю расстояний графа существ
function mobMove(G, m, dt, goal, speed, exact) {
  const map = G.map;
  const nav = navOf(G, m);
  m.repath -= dt;
  if (!m.field || m.fieldGoal !== goal || m.repath <= 0 || map.navStamp !== m.navStamp || m.fieldNav !== nav) {
    m.field = BR.bfsNav(nav, goal, true);
    m.fieldGoal = goal; m.repath = REPATH; m.navStamp = map.navStamp; m.fieldNav = nav;
  }
  const cur = BR.nodeAt(map, m.body.x, m.body.y, m.body.z);
  if (cur >= 0 && nav.out[cur]) m.node = cur;
  let next = -1;
  if (m.node === goal) next = goal;
  else if (m.node >= 0 && m.field[m.node] > 0) {
    let bd = m.field[m.node];
    for (const n of nav.out[m.node]) if (m.field[n] >= 0 && m.field[n] < bd) { bd = m.field[n]; next = n; }
  }
  let inp;
  if (next < 0) inp = { vx: 0, vz: 0 };
  else if (next === goal && exact && m.node === goal) {
    const dx = exact.x - m.body.x, dz = exact.z - m.body.z, d = Math.hypot(dx, dz);
    inp = d > 0.05 ? { vx: (dx / d) * Math.min(speed, d * 6), vz: (dz / d) * Math.min(speed, d * 6) } : { vx: 0, vz: 0 };
  } else inp = BR.steerInput(map, m.body, next, speed);
  const b = m.body;
  if (!b.onGround && b.ladder < 0 && !b.swim && m.lastInp) inp = m.lastInp; // в полёте не развернуться
  m.lastInp = inp;
  BR.moveBody(map, b, inp, dt);
  if (Math.hypot(inp.vx, inp.vz) > 0.1) m.r = Math.atan2(inp.vx, inp.vz);
  m.x = m.body.x; m.y = m.body.y; m.z = m.body.z;
  return next;
}

function canSee(G, m, p) {
  return BR.los3(G.map, m.x, m.y + EYE, m.z, p.x, p.y + 1.5, p.z);
}

// Направление взгляда игрока (по горизонтали): у клиента вперёд — (-sin yaw, -cos yaw)
function viewCos(p, x, z) {
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1;
  return (dx * -Math.sin(p.r || 0) + dz * -Math.cos(p.r || 0)) / d;
}

// Скорость погони с учётом уровня, хоста, финала, босса и типа
function chaseSpeed(G, m, def) {
  let k = BASE_SPEED * G.cfg.mobSpeed * (G.mobMul || 1) * (G.finaleMul || 1) * def.speed * (m.boss && m.type !== 'overseer' ? 1.5 : 1);
  if (m.type === 'specimen') k *= [0.75, 0.75, 1.05, 1.35][G.specimenPhase || 1];
  if (G.cfg.chase && G.chaseT) k *= 1 + Math.min(0.18, G.chaseT / 150); // стая разгоняется — до скорости бега игрока
  return k;
}

// Кого существо замечает: ближайший игрок, которого слышно, видно или «чуется»
function perceive(G, m, def, players) {
  let best = null, bd = 1e9;
  const heatK = m.type === 'specimen' ? [1, 1, 1.15, 1.45][G.specimenPhase || 1] : 1;
  for (const p of players) {
    if (p.node < 0) continue;
    const d = dist3(p, m);
    const running = (p.spd || 0) > RUN_SPD;
    const hear = G.hearMul || 1;
    let ok = d < (p.crouch ? def.near * 0.4 : def.near) * hear;
    if (!ok && def.runHear && running && d < def.runHear * hear) ok = true;
    if (!ok && def.heat && p.fl && d < def.heat * heatK) ok = true;
    if (!ok && def.see) {
      const range = p.fl ? def.seeTorch : def.see;
      if (d < range && (!def.cone || Math.cos(Math.atan2(p.x - m.x, p.z - m.z) - m.r) > def.cone) && canSee(G, m, p)) ok = true;
    }
    if (ok && d < bd) { bd = d; best = p; }
  }
  return best;
}

/* ------------------------------ Статуи ------------------------------ */
// Смотрит ли кто-то на статую так, что она не может двигаться
function observed(G, m, def, players) {
  for (const p of players) {
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    if (d > 45 || Math.abs(m.y - p.y) > 3.5) continue;
    const c = viewCos(p, m.x, m.z);
    if (c < VIEW_COS) continue;
    let ok;
    if (def.statue === 'look') ok = true;
    else if (def.statue === 'light') ok = (p.fl && d < 26 && c > BEAM_COS) || d < 6;
    else if (def.statue === 'beam') ok = p.fl && d < 26 && c > BEAM_COS; // в полной темноте — только луч
    else ok = (p.fl && d < 22 && c > BEAM_COS) || d < 9; // кукла: видно только вблизи или в луче
    if (ok && BR.los3(G.map, p.x, p.y + 1.6, p.z, m.x, m.y + 1.3, m.z)) return true;
  }
  return false;
}

function updateStatue(G, m, def, dt, players) {
  // в темноте (свет погас) манекены видно только в луче фонаря
  m.frozen = observed(G, m, G.statueBoost > 0 && def.statue === 'light' ? Object.assign({}, def, { statue: 'beam' }) : def, players);
  if (m.frozen) { m.mode = 'frozen'; return; }
  const speed = chaseSpeed(G, m, def);
  // цель: кто бежит (Коридорный слышит бег) или кто ближе hunt метров
  let target = null, bd = 1e9;
  for (const p of players) {
    if (p.node < 0) continue;
    const d = dist3(p, m);
    const heard = def.runHear && (p.spd || 0) > RUN_SPD && d < def.runHear;
    const hunt = def.hunt ? def.hunt * (G.statueBoost > 0 ? 2.2 : 1) * (G.doorOpen ? 2 : 1) : 0;
    if ((heard || (hunt && d < hunt) || d < 10) && d < bd) { bd = d; target = p; }
  }
  if (target) { m.mode = 'chase'; m.lastNode = target.node; mobMove(G, m, dt, target.node, speed, target); return; }
  if (m.alert) {
    m.alert.t -= dt;
    if (m.alert.t <= 0 || m.node === m.alert.node) m.alert = null;
    else { m.mode = 'chase'; mobMove(G, m, dt, m.alert.node, speed); return; }
  }
  m.mode = 'wander';
  if (def.patrol) { patrol(G, m, def, dt); return; }
  if (m.wp < 0 || m.node === m.wp) m.wp = pickWander(G, players);
  mobMove(G, m, dt, m.wp, WANDER_SPEED * def.wander);
}

// Коридорный ходит «по расписанию»: обходит свои точки по кругу, у каждой стоит несколько секунд
function patrol(G, m, def, dt) {
  if (!m.route || !m.route.length) {
    m.route = [];
    for (let k = 0; k < 6; k++) m.route.push(G.map.spots[Math.floor(Math.random() * G.map.spots.length)]);
    m.routeK = 0; m.wait = 0;
  }
  if (m.wait > 0) { m.wait -= dt; return; }
  const goal = m.route[m.routeK];
  if (m.node === goal) { m.routeK = (m.routeK + 1) % m.route.length; m.wait = 4; return; }
  mobMove(G, m, dt, goal, WANDER_SPEED * def.wander);
}

/* ------------------------------ Особые ------------------------------ */
// Фары: стоят и смотрят в одну сторону, изредка поворачиваются
function idleHeadlights(G, m, dt) {
  m.turnT -= dt;
  if (m.turnT <= 0) { m.turnT = 6 + Math.random() * 8; m.faceTo = Math.random() * Math.PI * 2; }
  if (m.faceTo != null) {
    const d = ((m.faceTo - m.r + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    m.r += Math.sign(d) * Math.min(Math.abs(d), dt * 0.8);
  }
}

// Стая на уровне-погоне: первый бежит прямо за целью, остальные пытаются перерезать путь впереди
function packGoal(G, m, idx, target) {
  if (idx === 0 || !G.map.exit) return target.node;
  const map = G.map;
  BR.ensureNav(map);
  if (!G.exitField || G.exitFieldStamp !== map.navStamp) { G.exitField = BR.bfsNav(map.navMob, map.exit.frontNode, true); G.exitFieldStamp = map.navStamp; }
  const ef = G.exitField;
  // узел на 5–8 шагов впереди цели по пути к выходу
  let n = target.node;
  for (let k = 0; k < 4 + idx * 2 && ef[n] > 0; k++) {
    let nx = -1;
    for (const q of map.navMob.out[n] || []) if (ef[q] >= 0 && ef[q] < ef[n]) { nx = q; break; }
    if (nx < 0) break;
    n = nx;
  }
  // режем путь, только если существо успеет туда раньше цели (через палату-срезку)
  m.cutT = (m.cutT || 0) - 0.05;
  if (m.cutT <= 0) {
    m.cutT = 0.6;
    const df = BR.bfsNav(map.navMob, n, true);
    m.cut = df[m.node] >= 0 && df[target.node] >= 0 && df[m.node] + 2 < df[target.node] ? n : -1;
  }
  return m.cut >= 0 ? m.cut : target.node;
}

// Надсмотрщик проламывает стену между собой и целью (только обычную стену между двумя достижимыми клетками)
function trySmash(G, m, target) {
  if ((m.smashT = (m.smashT || 0) - 0.05) > 0) return;
  const map = G.map;
  if (Math.abs(target.y - m.y) > 1.5) return;
  const dx = target.x - m.x, dz = target.z - m.z, d = Math.hypot(dx, dz);
  if (d > 16 || d < 2 || canSee(G, m, target)) return;
  const f = Math.max(0, Math.min(map.F - 1, Math.floor((m.y + 0.6) / map.FH)));
  for (let s = 1; s < d; s += 0.7) {
    const x = m.x + (dx / d) * s, z = m.z + (dz / d) * s, i = BR.cellAt(x, z);
    if (i < 0 || map.t[f][i] !== BR.T.WALL) continue;
    const cx = BR.cellX(i), cz = BR.cellZ(i);
    if (!BR.inner(cx, cz) || (map.reserved && map.reserved.has(i)) || (map.exit && map.exit.f === f && map.exit.cell === i)) return;
    // по обе стороны — пол, куда и так можно попасть
    const sx = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0, sz = sx ? 0 : Math.sign(dz);
    const a = BR.cellAt(x - sx * 4, z - sz * 4), b = BR.cellAt(x + sx * 4, z + sz * 4);
    if (a < 0 || b < 0 || map.dist[f * BR.NN + a] < 0 || map.dist[f * BR.NN + b] < 0) return;
    setCellNet(G, f, i, BR.T.FLOOR);
    event(G, 'smash', { x: BR.centerX(i), y: f * map.FH, z: BR.centerZ(i) });
    m.smashT = SMASH_GAP;
    return;
  }
}

/* ------------------------------ Главный цикл ------------------------------ */
function updateMob(G, m, dt, players, idx = 0) {
  if (m.type === 'drowner') { updateDrowner(G, m, dt, players); return; }
  if (m.stun > 0) { m.stun -= dt; return; }
  const def = DEF[m.type] || DEF.stalker;
  m.frozen = false;
  if (def.statue) { updateStatue(G, m, def, dt, players); return; }
  // Воспитательница засыпает, пока играет шкатулка
  if (def.music && G.musicT > 0) { m.frozen = true; m.mode = 'sleep'; m.alert = null; return; }
  const speed = chaseSpeed(G, m, def);
  const best = G.cfg.chase ? nearest(m, players) : perceive(G, m, def, players);
  if (best) { m.mode = 'chase'; m.lost = 0; m.alert = null; m.lastNode = best.node; m.target = best; }
  else if (m.mode === 'chase') {
    m.lost += dt;
    if (m.lost > def.lose) { m.mode = 'wander'; m.wp = m.lastNode; m.target = null; }
  }
  if (def.hideIdle) m.hidden = m.mode !== 'chase'; // Червь показывается только в погоне

  if (m.mode === 'chase') {
    const t = best || m.target;
    if (t && t.node >= 0) {
      const goal = G.cfg.chase && m.type === 'runner' ? packGoal(G, m, idx, t) : best ? t.node : m.lastNode;
      if (def.smash && best) trySmash(G, m, best);
      mobMove(G, m, dt, goal, speed, goal === t.node && best ? t : null);
      return;
    }
  }
  if (m.alert) {
    m.alert.t -= dt;
    if (m.alert.t <= 0 || m.node === m.alert.node) { m.alert = null; if (def.idle) m.turnT = 0; }
    else { mobMove(G, m, dt, m.alert.node, speed * (def.idle ? 1.05 : 0.95)); return; }
  }
  if (def.idle) { idleHeadlights(G, m, dt); return; }
  if (m.wp < 0 || m.node === m.wp) m.wp = pickWander(G, players);
  mobMove(G, m, dt, m.wp, WANDER_SPEED * def.wander);
}

function nearest(m, players) {
  let best = null, bd = 1e9;
  for (const p of players) { if (p.node < 0) continue; const d = dist3(p, m); if (d < bd) { bd = d; best = p; } }
  return best;
}

module.exports = { newMob, updateMob, mobMove, randomFloorFar, dist3, inWater, DEF, RUN_SPD, viewCos };
