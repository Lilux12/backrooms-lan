'use strict';
// Точка входа сервера: HTTP + WebSocket, запуск первого уровня и игрового цикла.
const os = require('os');
const config = require('./config');
const { createHttpServer } = require('./http');
const { attachWebSocket } = require('./ws');
const { Client } = require('./clients');
const game = require('./game');

const server = createHttpServer();
attachWebSocket(server, (socket) => new Client(socket, game.onMessage, game.onLeave));

game.startLevel(config.START_LEVEL);
setInterval(game.tick, config.TICK_MS);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\nПорт ${config.PORT} занят. Закройте другой сервер или запустите с другим портом (PORT=4000).\n`);
  else console.error('Ошибка сервера:', e.message);
  process.exit(1);
});

server.listen(config.PORT, '0.0.0.0', () => {
  console.log('\n=== BACKROOMS: побег из Закулисья ===\n');
  console.log('Сервер запущен. Играйте по адресам:');
  console.log(`  Вы (на этом компьютере):  http://localhost:${config.PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  Друг (по локальной сети): http://${i.address}:${config.PORT}`);
    }
  }
  console.log('\nЧтобы остановить сервер — закройте окно или нажмите Ctrl+C.\n');
});
