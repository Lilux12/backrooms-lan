'use strict';
// «Бесконечный отель»:
//  1) книга регистрации у стойки: 4 записи-загадки «этаж + сумма цифр номера = …» → 4 ключа в номерах;
//  2) ключи — в ключницу у стойки;
//  3) кнопки служебного лифта на 1 и 4 этажах нужно нажать одновременно (кнопка держится 10 с):
//     лифт и служебная лестница открывают путь на пентхаус и к выходу на крышу.
// Пока игроки едут в лифте первый раз, «этажи переставляются» — лифт привозит не туда.
const U = require('./util');
const { BR, broadcast, patch, removeObj, near, PICK_DIST, sendGoals, checkSolved, event } = U;

const BTN_LATCH = 10;
const GUESTS = ['Г-н Воронов', 'Г-жа Мельникова', 'Г-н Штерн', 'Семья Лаптевых', 'Г-н Б. (без фамилии)', 'Г-жа Озерова', 'Г-н Каин'];

// Загадка, однозначно указывающая на номер room среди номеров его этажа
function clueFor(room, rooms) {
  const floor = room.f, same = rooms.filter((r) => r.f === floor);
  const ds = String(room.num).split('').map(Number), sum = ds.reduce((a, b) => a + b, 0);
  const tests = [
    [`этаж + сумма цифр номера = ${floor + sum}`, (r) => String(r.num).split('').map(Number).reduce((a, b) => a + b, 0) === sum],
    [`номер ${room.num % 2 ? 'нечётный' : 'чётный'}`, (r) => r.num % 2 === room.num % 2],
    [`последняя цифра — ${room.num % 10}`, (r) => r.num % 10 === room.num % 10],
    [`номер ${room.num > floor * 100 + 28 ? 'больше' : 'не больше'} ${floor * 100 + 28}`, (r) => (r.num > floor * 100 + 28) === (room.num > floor * 100 + 28)],
  ];
  const parts = [`этаж ${floor}`];
  let cand = same;
  for (const [text, ok] of tests) {
    if (cand.length <= 1) break;
    parts.push(text);
    cand = cand.filter(ok);
  }
  return parts.join('; ');
}

module.exports = {
  hotel: {
    init: () => ({ keys: 0, inserted: 0, powered: false, solved: false, gate: null, prank: false }),
    setup(G, add, rnd) {
      const map = G.map, lv = map.lv, pz = G.pz.hotel;
      pz.gate = { cells: [{ f: 4, i: lv.svcGate }], open: false };
      // по ключу на каждом из этажей 2–4 и ещё один на случайном
      const pick = [];
      for (const f of [2, 3, 4, 2 + Math.floor(rnd() * 3)]) {
        const opts = lv.rooms.filter((r) => r.f === f && !pick.includes(r) && map.dist[f * BR.NN + r.cells[4]] >= 0);
        pick.push(opts[Math.floor(rnd() * opts.length)]);
      }
      const lines = pick.map((r, k) => {
        const c = r.cells[4];
        add('key', { x: BR.centerX(c), y: r.f * map.FH, z: BR.centerZ(c), room: r.num });
        return `${k + 1}) ${GUESTS[(k * 3 + pick[0].num) % GUESTS.length]} — ${clueFor(r, lv.rooms)}. Ключ не сдан.`;
      });
      const rc = U.at(G, lv.reception);
      add('paper', { x: rc.x - 2.2, y: rc.y, z: rc.z, title: 'Книга регистрации', text: 'КНИГА РЕГИСТРАЦИИ ГОСТЕЙ\n(половина страниц вырвана)\n\n' + lines.join('\n') +
        '\n\nНа полях от руки: «Ключи вернуть в ключницу. Служебный лифт — только вдвоём: кнопки на 1 и 4 этажах жать одновременно».' });
      add('keyslot', { x: rc.x + 2.2, y: rc.y, z: rc.z });
      for (const f of [1, 4]) U.addSwitch(add, U.at(G, lv.liftDoor[f]), 'liftbtn', BTN_LATCH, `Вызов служебного лифта (этаж ${f})`, { style: 'button' });
      // телефоны в номерах и холле
      BR.pickSpots(map, rnd, 3, { minDist: 0.15 * map.maxDist, minSep: 8 }).forEach((p) => add('phone', { x: p.x, y: p.y, z: p.z }));
    },
    goal(G) {
      const pz = G.pz.hotel;
      if (pz.powered) return 'Лифт и служебная лестница работают — на пентхаус и к выходу на крышу!';
      if (pz.inserted < 4) return `Ключи: ${pz.inserted + pz.keys}/4 (книга регистрации — у стойки)` + (pz.keys ? ` · в руках: ${pz.keys}, верните в ключницу` : '');
      return 'Ключница ✔ — нажмите кнопки служебного лифта на 1 и 4 этажах одновременно';
    },
    hint(G) {
      const pz = G.pz.hotel;
      if (pz.inserted + pz.keys < 4) return G.objs.find((o) => o.kind === 'key');
      if (pz.inserted < 4) return G.objs.find((o) => o.kind === 'keyslot');
      return U.switches(G, 'liftbtn').find((o) => !o.on);
    },
    touch(G, p, o) {
      if (o.kind !== 'key' || !near(o, p, PICK_DIST)) return false;
      removeObj(G, o);
      G.pz.hotel.keys++;
      broadcast({ t: 'pick', id: o.id, kind: 'key', by: p.name });
      broadcast({ t: 'ev', text: `${p.name} нашёл ключ от номера ${o.room}` });
      return true;
    },
    use(G, c, o) {
      const pz = G.pz.hotel;
      if (o.kind !== 'keyslot') return false;
      if (!pz.keys) { c.send({ t: 'ev', text: pz.inserted >= 4 ? 'Все ключи на месте.' : `В ключнице ${pz.inserted}/4 ключей. Найдите номера по книге регистрации.` }); return true; }
      pz.inserted += pz.keys; pz.keys = 0;
      broadcast({ t: 'ev', text: `${c.name} повесил ключи в ключницу (${pz.inserted}/4)` });
      broadcast({ t: 'sfx', name: 'click', x: o.x, y: o.y, z: o.z });
      if (pz.inserted >= 4) broadcast({ t: 'ev', text: 'Где-то в шахте ожил служебный лифт. Кнопки вызова — на 1 и 4 этажах. Нужно нажать обе разом.' });
      sendGoals(G);
      return true;
    },
    tick(G, players) {
      const pz = G.pz.hotel;
      if (pz.powered || pz.inserted < 4 || !U.groupOn(G, 'liftbtn')) return false;
      pz.powered = true; pz.solved = true; pz.prank = true;
      U.setGate(G, pz.gate, true, []);
      for (const o of G.objs) if (o.kind === 'lift' && o.broken) patch(o, { broken: false });
      broadcast({ t: 'ev', text: 'Служебный лифт приехал. Служебная лестница на 4 этаже открыта. Наверху — выход на крышу.' });
      broadcast({ t: 'sfx', name: 'lift' });
      event(G, 'quake', { dur: 1.2 });
      checkSolved(G);
      return true;
    },
  },
};
