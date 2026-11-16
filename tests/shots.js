'use strict';
// Скриншоты «вертикальных» мест каждого уровня: лестница, провал, бассейн, стремянка, лаз.
// Камера ставится рядом и смотрит на объект. Папка: SHOT_DIR (по умолчанию временная).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer } = require('./lib/server');
const { findChrome, launchChrome, openGame, sleep } = require('./lib/browser');

const PORT = 3904;
const OUT = process.env.SHOT_DIR || path.join(os.tmpdir(), 'backrooms-shots');
const LEVELS = process.env.LEVEL ? process.env.LEVEL.split(',').map(Number) : require('../shared/map.js').LEVELS.map((_, i) => i);
const KINDS = (process.env.KINDS || 'stair,hole,pool,ladder,vent,atrium,block,landmark').split(',');

// В браузере: найти клетку нужного типа и встать в соседнюю клетку, глядя на неё
const FIND = `(kind) => {
  const BR = window.BR, m = window.__br.map(), N = BR.N, T = BR.T;
  const want = { stair: T.STAIR, hole: T.HOLE, pool: T.POOL, ladder: T.LADDER, vent: T.VENT }[kind];
  for (let f = m.F - 1; f >= 0; f--) for (let i = 0; i < BR.NN; i++) {
    if (m.t[f][i] !== want) continue;
    if (kind === 'stair' && BR.stairSeg(m.a[f][i]) !== 0) continue;
    for (const [dx, dz] of BR.D4) {
      const j = i + dx + dz * N;
      if (m.t[f][j] !== T.FLOOR) continue;
      const x = BR.centerX(j) + dx * 1.2, z = BR.centerZ(j) + dz * 1.2;
      const yaw = Math.atan2(-(BR.centerX(i) - x), -(BR.centerZ(i) - z));
      window.__br.tp(x, f * m.FH, z, yaw, kind === 'hole' ? -0.6 : kind === 'pool' ? -0.35 : 0);
      return f;
    }
  }
  if (kind === 'atrium' && m.pools) { // вид на атриум с балкона 3-го этажа
    window.__br.tp(16.5 * 4, 2 * m.FH, 20 * 4, -Math.PI / 2 - 0.3, -0.45);
    return 2;
  }
  if (kind === 'block') { // низкое препятствие (машина, стол, кровать) — с трёх клеток
    for (let f = 0; f < m.F; f++) for (let i = 0; i < BR.NN; i++) {
      if (m.t[f][i] !== T.BLOCK) continue;
      for (const [dx, dz] of BR.D4) {
        const j1 = i + dx + dz * N, j2 = i + 2 * (dx + dz * N);
        if (m.t[f][j1] !== T.FLOOR || m.t[f][j2] !== T.FLOOR) continue;
        const x = BR.centerX(j2) + dx, z = BR.centerZ(j2) + dz;
        window.__br.tp(x, f * m.FH, z, Math.atan2(dx, dz), -0.25);
        return f;
      }
    }
  }
  if (kind === 'landmark') { // знаковое место уровня (по данным генератора)
    const order = ['hall', 'cinema', 'chandelier', 'upside', 'boiler', 'shaft', 'booth', 'surgery', 'morgue', 'glassroom', 'serverroom', 'roofgen', 'endless', 'fountain'];
    for (const k of order) {
      const e = m.fx.find((q) => q.k === k);
      if (!e) continue;
      const f = e.f || 0;
      let x = e.x, z = e.z;
      if (e.x0 != null) { x = (e.x0 + e.x1 + 1) / 2 * 4; z = ((e.z0 != null ? (e.z0 + e.z1 + 1) / 2 : e.z + 0.5)) * 4; }
      // ищем свободную точку в 6–10 м, откуда место видно
      for (let a = 0; a < 32; a++) {
        const ang = a / 32 * Math.PI * 2, d = 7 + (a % 3);
        const px = x + Math.cos(ang) * d, pz = z + Math.sin(ang) * d, y = f * m.FH;
        if (BR.blocked(m, px, y, pz, 0.35, 1.7, 0.5)) continue;
        if (!BR.los3(m, px, y + 1.6, pz, x, y + 1.6, z)) continue;
        window.__br.tp(px, y, pz, Math.atan2(-(x - px), -(z - pz)), k === 'chandelier' ? 0.35 : -0.1);
        return f;
      }
    }
  }
  return -1;
}`;

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('SKIP shots: Chromium не найден'); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const br = await launchChrome(chrome);
  try {
    for (const lv of LEVELS) {
      const srv = await startServer(PORT, { START_LEVEL: String(lv) });
      try {
        const g = await openGame(br.port, `http://localhost:${PORT}/`);
        await g.ev(`document.getElementById('lvl').classList.remove('on'); document.getElementById('hud').style.visibility = 'hidden'`);
        for (const kind of KINDS) {
          const f = await g.ev(`(${FIND})('${kind}')`);
          if (f < 0) continue;
          await sleep(1500);
          const file = path.join(OUT, `lv${lv}-${kind}.png`);
          await g.shot(file);
          console.log(`  уровень ${lv}: ${kind} (этаж ${f + 1}) → ${file}`);
        }
        const bad = g.realErrors();
        if (bad.length) throw new Error(`уровень ${lv}: ошибки JS:\n${bad.join('\n')}`);
        g.page.close(); await g.page.closeTab();
      } finally { srv.proc.kill(); await sleep(200); }
    }
    console.log('OK shots');
  } finally { await br.close(); }
}
main().catch((e) => { console.error('FAIL shots:', e.message); process.exit(1); });
