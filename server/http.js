'use strict';
// Раздача статики: client/ — корень сайта, shared/ — общий с сервером код.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MOUNTS = [['/shared/', path.join(ROOT, 'shared')], ['/', path.join(ROOT, 'client')]];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2',
};

// URL → путь к файлу или null, если файл вне разрешённых папок
function resolve(url) {
  let p;
  try { p = decodeURIComponent(url.split('?')[0]); } catch (e) { return null; }
  if (p.includes('\0')) return null; // нулевой байт: fs бросает исключение синхронно и уронил бы сервер
  if (p.endsWith('/')) p += 'index.html';
  for (const [prefix, dir] of MOUNTS) {
    if (!p.startsWith(prefix)) continue;
    const file = path.join(dir, p.slice(prefix.length));
    return file.startsWith(dir + path.sep) ? file : null;
  }
  return null;
}

// routes: { '/путь': () => объект } — динамические JSON-ответы (например, таблица рекордов)
function createHttpServer(routes = {}) {
  return http.createServer((req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const route = routes[req.url.split('?')[0]];
    if (route) { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(JSON.stringify(route())); return; }
    const file = resolve(req.url);
    const type = file && MIME[path.extname(file)];
    if (!type) { res.writeHead(404); res.end('Not found'); return; }
    try {
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    } catch (e) { res.writeHead(400); res.end('Bad request'); } // любой странный путь — ответ, а не падение
  });
}

module.exports = { createHttpServer };
