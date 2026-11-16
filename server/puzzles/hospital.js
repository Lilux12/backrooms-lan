'use strict';
// «Беги!»: ловушки больницы. Головоломки нет (дверь открыта сразу), зато:
//  - двери палат-срезок захлопываются на пару секунд перед лидером забега;
//  - на ходу падают каталки, перегораживая полосу, в которой бежит игрок;
//  - стая разгоняется со временем (G.chaseT — учитывает server/mobs.js).
const U = require('./util');
const { BR, broadcast, setCellNet } = U;

const SLAM_EVERY = [7, 12];  // как часто захлопывается дверь, с
const SLAM_TIME = 3;
const TRAP_DIST = 3.2;       // проходя у такой точки, игрок роняет каталку впереди

module.exports = {
  hospital: {
    init: () => ({ solved: true, slamT: 8, slammed: [], traps: [] }),
    setup(G, add, rnd) {
      const map = G.map, pz = G.pz.hospital;
      // точки-ловушки вдоль коридоров: каждые ~12 клеток, каталка падает в 7 м впереди по ходу
      (map.lv.corr || []).forEach(([f, z], k) => {
        const east = k % 2 === 0, y = f * map.FH;
        for (let x = 8; x < 36; x += 10 + Math.floor(rnd() * 5)) {
          const tx = (x + 0.5) * 4, dir = east ? 1 : -1;
          pz.traps.push({ x: tx, y, z: (z + 1) * 4, dropX: tx + dir * 7, lanes: [(z + 0.5) * 4, (z + 1.5) * 4], used: false });
        }
      });
    },
    goal: () => 'Бегите к двери на втором этаже!',
    tick(G, players, dt) {
      const pz = G.pz.hospital, map = G.map;
      if (G.chaseState !== 'run') return false;
      G.chaseT = (G.chaseT || 0) + dt;
      // каталки
      for (const tr of pz.traps) {
        if (tr.used) continue;
        const p = players.find((q) => Math.abs(q.x - tr.x) < TRAP_DIST && Math.abs(q.z - tr.z) < 5 && Math.abs(q.y - tr.y) < 1.5);
        if (!p) continue;
        tr.used = true;
        const lane = Math.abs(p.z - tr.lanes[0]) < Math.abs(p.z - tr.lanes[1]) ? tr.lanes[0] : tr.lanes[1];
        const o = { kind: 'gurney', x: tr.dropX, y: tr.y, z: lane, r: 1.05, rot: Math.random() * 3, fell: true };
        const i = BR.cellAt(o.x, o.z);
        if (i < 0 || map.t[Math.round(tr.y / map.FH)][i] !== BR.T.FLOOR) continue;
        map.obst.push(o);
        (G.extraObst || (G.extraObst = [])).push(o);
        broadcast({ t: 'obst', o });
      }
      // двери палат
      for (const s of pz.slammed) s.t -= dt;
      for (const s of pz.slammed.filter((q) => q.t <= 0)) setCellNet(G, s.f, s.i, BR.T.FLOOR);
      pz.slammed = pz.slammed.filter((q) => q.t > 0);
      pz.slamT -= dt;
      if (pz.slamT <= 0 && players.length) {
        pz.slamT = SLAM_EVERY[0] + Math.random() * (SLAM_EVERY[1] - SLAM_EVERY[0]);
        const bodies = U.bodiesOf(G, players);
        // ближайшая к кому-нибудь дверь палаты впереди (в 6–22 м), на которой никто не стоит
        const doors = [];
        for (const w of map.lv.wards || []) for (const i of w.doors) doors.push({ f: w.f, i });
        const cand = doors.filter(({ f, i }) => {
          const x = BR.centerX(i), z = BR.centerZ(i), y = f * map.FH;
          return players.some((p) => Math.abs(p.y - y) < 1.5 && Math.hypot(p.x - x, p.z - z) > 6 && Math.hypot(p.x - x, p.z - z) < 22) &&
            !bodies.some((b) => Math.abs(b.x - x) < 2.6 && Math.abs(b.z - z) < 2.6 && Math.abs(b.y - y) < 2) &&
            !pz.slammed.some((s) => s.i === i && s.f === f);
        });
        if (cand.length) {
          const d = cand[Math.floor(Math.random() * cand.length)];
          setCellNet(G, d.f, d.i, BR.T.WALL);
          pz.slammed.push({ f: d.f, i: d.i, t: SLAM_TIME });
          broadcast({ t: 'sfx', name: 'slam', x: BR.centerX(d.i), y: d.f * map.FH, z: BR.centerZ(d.i) });
        }
      }
      return false;
    },
  },
};
