'use strict';
// Реестр подключённых игроков и рассылка сообщений.
const { WsConn, textFrame } = require('./ws');

let nextClientId = 1;
const clients = new Map();

class Client {
  constructor(socket, onMessage, onLeave) {
    this.id = nextClientId++;
    this.joined = false;
    this.name = 'Игрок';
    this.x = 0; this.y = 0; this.z = 0; this.r = 0;
    this.node = -1;      // последний узел графа навигации, где стоял игрок
    this.crouch = false;
    this.fl = false;
    this.invuln = 0;
    this.codeTries = 0;
    this.conn = new WsConn(socket, (msg) => onMessage(this, msg), () => {
      clients.delete(this.id);
      onLeave(this);
    });
    clients.set(this.id, this);
  }
  write(buf) { this.conn.write(buf); }
  send(obj) { this.conn.send(obj); }
}

const joinedList = () => [...clients.values()].filter((c) => c.joined);
const joinedCount = () => joinedList().length;

function broadcast(obj) {
  const f = textFrame(obj);
  for (const c of clients.values()) if (c.joined) c.write(f);
}
function sendPlayers() {
  broadcast({ t: 'players', list: joinedList().map((c) => ({ id: c.id, name: c.name })) });
}
const log = (s) => console.log(`[${new Date().toLocaleTimeString()}] ${s}`);

module.exports = { Client, clients, joinedList, joinedCount, broadcast, sendPlayers, log };
