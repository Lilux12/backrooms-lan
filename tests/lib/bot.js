'use strict';
// Простой бот-игрок для тестов: держит соединение, шлёт позицию, ждёт сообщений
const BR = require('../../shared/map.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Bot {
  constructor(port, name) { this.port = port; this.name = name; this.inbox = []; this.waiters = []; this.all = []; }
  async connect() {
    this.ws = new WebSocket(`ws://localhost:${this.port}`);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      this.all.push(m);
      if (m.t === 's') { this.snap = m; return; }
      if (m.t === 'init') { this.init = m; this.pos = Object.assign({}, m.spawn); }
      if (m.t === 'secret') this.word = m.word;
      if (m.t === 'items') this.items = m.items;
      if (m.t === 'players') this.players = m.list;
      if (m.t === 'rtt') this.send({ t: 'rtt', k: m.k });
      this.inbox.push(m);
      this.waiters = this.waiters.filter((w) => !(w.pred(m) && (w.res(m), true)));
    };
    this.send({ t: 'join', name: this.name });
    await this.wait((m) => m.t === 'init');
    this.id = this.init.id;
    this.r = 0; this.fl = 0; this.moving = true;
    this.timer = setInterval(() => {
      if (!this.moving) return;
      this.send({ t: 'p', x: this.pos.x, y: this.pos.y, z: this.pos.z, r: this.r, f: this.fl, st: 0.8, bt: 0.6 });
    }, 50);
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  wait(pred, ms = 8000) {
    return new Promise((res, rej) => {
      const hit = this.inbox.find(pred);
      if (hit) { this.inbox.splice(this.inbox.indexOf(hit), 1); return res(hit); }
      const w = { pred, res: (m) => { clearTimeout(w.t); this.inbox.splice(this.inbox.indexOf(m), 1); res(m); } };
      w.t = setTimeout(() => rej(new Error(`${this.name}: не дождались сообщения`)), ms);
      this.waiters.push(w);
    });
  }
  close() { clearInterval(this.timer); try { this.ws.close(); } catch (e) { /* уже закрыт */ } }
}

// Свободная точка рядом с p, откуда p видно (по общей карте)
function spotNear(map, p, d) {
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    if (BR.blocked(map, x, p.y, z, BR.PHYS.R, BR.PHYS.H, BR.PHYS.STEP)) continue;
    if (Math.abs(BR.groundAt(map, x, p.y + 0.3, z, BR.PHYS.R, BR.PHYS.STEP) - p.y) > 0.3) continue;
    if (!BR.los3(map, x, p.y + 1.5, z, p.x, p.y + 1.5, p.z)) continue;
    return { x, y: p.y, z };
  }
  return { x: p.x, y: p.y, z: p.z };
}

module.exports = { Bot, spotNear, sleep };
