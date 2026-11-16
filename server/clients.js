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
    this.caged = 0;      // id клетки, если игрока утащил двойник
    this.items = { detector: 0, noise: 0 };
    this.word = '';      // кодовое слово (знает только сам игрок и сервер)
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

// «Виртуальные» игроки — их нет в сети, но в списке они как настоящие (двойник в одиночной игре)
const virtuals = new Map();
function allocVirtual(name) { const v = { id: nextClientId++, name }; virtuals.set(v.id, v); return v; }
function freeVirtual(id) { virtuals.delete(id); }
function clearVirtuals() { virtuals.clear(); }
// Список игроков для клиентов; override — временная подмена ников (сбой ника у двойника)
function playerList(override = {}) {
  return [...joinedList(), ...virtuals.values()]
    .sort((a, b) => a.id - b.id)
    .map((c) => ({ id: c.id, name: override[c.id] || c.name }));
}
const joinedCount = () => joinedList().length;

function broadcast(obj) {
  const f = textFrame(obj);
  for (const c of clients.values()) if (c.joined) c.write(f);
}
function sendPlayers(override) {
  broadcast({ t: 'players', list: playerList(override) });
}
const log = (s) => console.log(`[${new Date().toLocaleTimeString()}] ${s}`);

module.exports = { Client, clients, joinedList, joinedCount, broadcast, sendPlayers, playerList, allocVirtual, freeVirtual, clearVirtuals, log };
