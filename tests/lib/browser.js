'use strict';
// Headless Chromium через Chrome DevTools Protocol (без Playwright)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Запустить Chromium; вернуть { port, close }
async function launchChrome(chrome) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'br-chrome-'));
  const br = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required', 'about:blank'],
  { stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try { port = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { /* ждём */ }
  }
  if (!port) throw new Error('Chromium не открыл порт отладки');
  return {
    port,
    async close() {
      br.kill(); await sleep(300);
      try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* не страшно */ }
    },
  };
}

// Открыть страницу игры и нажать «Играть»; вернуть { page, ev, errors }
// Настройки графики для теста: функциональным тестам хватает «Низкого» (программный рендер в headless медленный),
// скриншоты — на «Высоком», как увидит игрок
const PRESET = {
  low: { preset: 'low', q: 0.6, post: false, bloom: false, shadows: false, pbr: false, fxLights: false, dynres: false, tips: false },
  high: { preset: 'high', q: 1, post: true, bloom: true, shadows: true, pbr: true, fxLights: true, dynres: false, tips: false },
};
const presetScript = (name) => `try { localStorage.setItem('br_set', ${JSON.stringify(JSON.stringify(PRESET[name] || PRESET.low))}); } catch (e) {}`;

async function openGame(cdpPort, url, opts = {}) {
  // каждая игра — в новой вкладке, чтобы состояние прошлой страницы не мешало
  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })).json();
  const page = await cdpConnect(target.webSocketDebuggerUrl);
  page.targetId = target.id;
  page.closeTab = () => fetch(`http://127.0.0.1:${cdpPort}/json/close/${target.id}`).catch(() => {});
  const errors = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
  await page.send('Runtime.enable'); await page.send('Log.enable'); await page.send('Page.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: presetScript(opts.preset || 'low') });
  await page.send('Page.navigate', { url });
  await sleep(2000);
  const ev = async (expr) => (await page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  await ev(`document.getElementById('play').click()`);
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    await sleep(250);
    ok = await ev(`!!(window.__br && document.getElementById('hud').style.display === 'block' && window.__br.me.x > 0)`);
  }
  if (!ok) throw new Error('игра не стартовала (HUD не показан)\n' + errors.join('\n'));
  const shot = async (file) => { const r = await page.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); };
  const realErrors = () => errors.filter((e) => !/pointer ?lock|AudioContext/i.test(e));
  return { page, ev, errors, realErrors, shot };
}

module.exports = { findChrome, cdpConnect, launchChrome, openGame, sleep, presetScript };
