'use strict';
// Браузерный smoke-тест через Chrome DevTools Protocol (без Playwright):
// открывает игру в headless Chromium, нажимает «Играть», проверяет, что нет ошибок JS,
// мир построен и HUD показан, сохраняет скриншот.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { startServer } = require('./lib/server');

const PORT = 3902;
const OUT = process.env.SHOT_DIR || path.join(os.tmpdir(), 'backrooms-shots');

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try { return execSync(`command -v ${c}`).toString().trim(); } catch (e) { /* дальше */ }
  }
  return null;
}

async function cdpConnect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map(), handlers = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else handlers.forEach((h) => h(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, on: (h) => handlers.push(h), close: () => ws.close() };
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log('SKIP smoke-browser: Chromium не найден (переменная CHROME)'); return; }
  fs.mkdirSync(OUT, { recursive: true });
  const levels = process.env.START_LEVEL ? [+process.env.START_LEVEL] : require('../shared/map.js').LEVELS.map((_, i) => i);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'br-chrome-'));
  const br = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required', 'about:blank'],
  { stdio: 'ignore' });
  try {
    let port = null;
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(100);
      try { port = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* ждём */ }
    }
    assert(port, 'Chromium не открыл порт отладки');
    for (const level of levels) await runLevel(port, level);
  } finally {
    br.kill();
    await sleep(300);
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* Chromium ещё держит файлы — не страшно */ }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Второй игрок: бот ходит туда-сюда, чтобы на клиенте отрисовывался чужой аватар
async function startBot(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let spawn = null, t = 0;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'init') spawn = m.spawn; };
  ws.send(JSON.stringify({ t: 'join', name: 'Бот' }));
  const timer = setInterval(() => {
    if (!spawn) return;
    t += 0.05;
    ws.send(JSON.stringify({ t: 'p', x: spawn.x + Math.sin(t) * 0.5, y: spawn.y, z: spawn.z, r: t, f: 1 }));
  }, 50);
  return () => { clearInterval(timer); ws.close(); };
}

async function runLevel(cdpPort, level) {
  const srv = await startServer(PORT, { START_LEVEL: String(level) });
  const stopBot = await startBot(PORT);
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
  const page = await cdpConnect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  try {
    const errors = [];
    page.on((m) => {
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
    });
    await page.send('Runtime.enable'); await page.send('Log.enable'); await page.send('Page.enable');
    await page.send('Page.navigate', { url: `http://localhost:${PORT}/` });
    await sleep(2000);
    const ev = async (expr) => (await page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
    await ev(`document.getElementById('play').click()`);
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) {
      await sleep(250);
      ok = await ev(`!!(window.__br && document.getElementById('hud').style.display === 'block' && window.__br.me.x > 0)`);
    }
    assert(ok, `уровень ${level}: игра не стартовала (HUD не показан или нет позиции игрока)\n` + errors.join('\n'));

    // Без настоящего захвата мыши в headless включаем флаг вручную и жмём клавиши
    await ev(`window.__br.S.locked = true`);
    const key = async (code, ms = 60) => {
      const k = code.replace('Key', '');
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k.toLowerCase() });
      await sleep(ms);
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k.toLowerCase() });
    };
    const before = await ev(`[window.__br.me.x, window.__br.me.z]`);
    // headless рисует медленно: держим клавиши, пока игрок не сдвинется (у старта часть направлений упирается в стену)
    let after = before;
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      await key(c, 1500);
      after = await ev(`[window.__br.me.x, window.__br.me.z]`);
      if (Math.hypot(after[0] - before[0], after[1] - before[1]) > 0.5) break;
    }
    assert(Math.hypot(after[0] - before[0], after[1] - before[1]) > 0.5, `уровень ${level}: игрок не двигается: ${before} → ${after}`);
    await key('KeyF');
    assert(await ev(`window.__br.FL.on`), `уровень ${level}: фонарик не включился`);
    await key('KeyH'); await key('KeyH'); await key('KeyM'); await key('KeyE');
    await sleep(1200);
    const remote = await ev(`window.__br.remotes()`);
    assert(remote >= 1, `уровень ${level}: не виден второй игрок`);
    const info = await ev(`document.getElementById('goals').textContent.slice(0, 70)`);
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, `level${level}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    const bad = errors.filter((e) => !/pointer ?lock|AudioContext/i.test(e));
    assert.deepStrictEqual(bad, [], `уровень ${level}: ошибки в консоли браузера:\n` + bad.join('\n'));
    console.log(`OK smoke-browser уровень ${level}: ${info} → ${file}`);
  } finally {
    page.close(); stopBot(); srv.proc.kill();
    await sleep(200);
  }
}
main().catch((e) => { console.error('FAIL smoke-browser:', e.message); process.exit(1); });
