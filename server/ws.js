'use strict';
// Минимальная реализация WebSocket (RFC 6455) без внешних библиотек: только текстовые кадры.
const crypto = require('crypto');
const { MAX_MESSAGE } = require('./config');

function makeFrame(op, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}
const textFrame = (obj) => makeFrame(1, Buffer.from(JSON.stringify(obj)));

// Соединение: разбирает входящие кадры и вызывает onMessage(obj) для каждого JSON-сообщения.
class WsConn {
  constructor(socket, onMessage, onClose) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.closed = false;
    socket.setNoDelay(true);
    socket.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    socket.on('close', () => this.close());
    socket.on('error', () => this.close());
  }
  parse() {
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const op = b0 & 15, masked = !!(b1 & 128);
      let len = b1 & 127, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_MESSAGE) { this.socket.destroy(); return; }
      const total = off + (masked ? 4 : 0) + len;
      if (this.buf.length < total) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), total);
      if (masked) {
        const mask = this.buf.subarray(off, off + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      this.buf = this.buf.subarray(total);
      if (op === 8) { this.socket.end(makeFrame(8, Buffer.alloc(0))); return; }
      if (op === 9) { this.write(makeFrame(10, payload)); continue; }
      if (op === 1) {
        let msg;
        try { msg = JSON.parse(payload.toString('utf8')); } catch (e) { continue; } // мусор молча игнорируем
        try { this.onMessage(msg); } catch (e) { console.error('ошибка обработки сообщения:', e.stack || e.message); }
      }
    }
  }
  write(buf) { if (!this.socket.destroyed) this.socket.write(buf); }
  send(obj) { this.write(textFrame(obj)); }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }
}

// Подключает WebSocket к HTTP-серверу. onConnect(socket) должен вернуть {onMessage, onClose}.
function attachWebSocket(server, onConnect) {
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    onConnect(socket);
  });
}

module.exports = { WsConn, attachWebSocket, textFrame };
