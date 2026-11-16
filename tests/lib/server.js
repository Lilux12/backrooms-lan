'use strict';
// Запуск игрового сервера в отдельном процессе для тестов
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ENTRY = require(path.join(ROOT, 'package.json')).main;

function startServer(port, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(ROOT, ENTRY)], {
      env: Object.assign({}, process.env, { PORT: String(port) }, env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const timer = setTimeout(() => reject(new Error('сервер не запустился:\n' + out)), 8000);
    const onData = (d) => {
      out += d;
      if (out.includes('Сервер запущен')) { clearTimeout(timer); resolve({ proc, log: () => out }); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (d) => { out += d; });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`сервер завершился (${code}):\n${out}`)); });
  });
}

module.exports = { startServer, ROOT };
