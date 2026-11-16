// Точка входа клиента: игровой цикл
import { clamp } from './core/util.js';
import { FL, S, UP, keys, me } from './core/state.js';
import { applyQuality, camera, dyn, renderer, scene, updateDust } from './render/scene.js';
import { renderFrame } from './render/post.js';
import { settings } from './core/settings.js';
import { updateLight } from './render/lighting.js';
import * as THREE from 'three';
import { H, fx, map, objs, plates } from './world/world.js';
import { animateWater } from './world/geometry.js';
import { animateObjects } from './world/objects.js';
import { remotes, updateRemotes } from './entities/avatars.js';
import { mobEnts, updateMobs } from './entities/mobs.js';
import { updateAudio, updateListener } from './audio/audio.js';
import { updateHud } from './ui/hud.js';
import { initMenu } from './ui/menu.js';
import { placeMe, updateBattery, updateCamera, updateMovement } from './game/player.js';

// Модуль ввода вешает обработчики клавиш при загрузке.
import { pollGamepad } from './game/input.js';
import { updateTips } from './ui/tips.js';
import { fadeChat, tickExpose } from './game/social.js';
import { tickMarks, updateSpectator } from './game/spectator.js';
import { W } from './game/worldfx.js';

let last = performance.now();
const _fwd = new THREE.Vector3();

// доступ для отладки и тестов: состояние, карта, телепорт камеры
window.__br = {
  me, FL, UP, S, keys: () => keys, remotes: () => remotes.size, map: () => map,
  cam: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
  tp(x, y, z, yaw = me.yaw, pitch = 0) { placeMe(x, y, z); me.yaw = yaw; me.pitch = pitch; },
};

function update(dt) {
  dt *= W.timescale; // хост может замедлить/ускорить время
  S.time += dt;
  pollGamepad(dt, me);
  let moving = false, sprint = false;
  if (!updateSpectator(dt)) ({ moving, sprint } = updateMovement(dt), updateCamera(dt, moving, sprint));
  updateRemotes(dt);
  const mobDist = updateMobs(dt);
  animateObjects(dt);
  animateWater(dt);
  if (fx) fx.update(dt);
  if (plates) { // таблички номеров отеля меняются за спиной
    camera.getWorldDirection(_fwd);
    const keys = new Set();
    for (const rec of objs.values()) if (rec.o.kind === 'key') keys.add(Math.floor(rec.o.y / map.FH + 0.01) + ':' + (Math.floor(rec.o.x / 4) + Math.floor(rec.o.z / 4) * 45));
    plates.update(dt, camera.position, _fwd, keys);
  }
  updateBattery(dt);
  updateDust(dt, H);
  updateLight(dt);
  const prox = clamp(1 - mobDist / 34, 0, 1); // 0 — существ рядом нет, 1 — вплотную
  S.prox = prox;
  camera.getWorldDirection(_fwd);
  updateListener(camera.position, _fwd);
  const chasing = mobEnts.filter((m) => m.seen && m.chase && !m.stun && Math.hypot(m.x - camera.position.x, m.z - camera.position.z) < 40).length;
  updateAudio(dt, prox, !!(me.body && me.body.underwater), chasing, !!S.finale);
  updateHud(dt, prox);
  tickExpose(dt);
  tickMarks(dt);
  fadeChat();
  updateTips(dt);
}

// Динамическое разрешение и отладочный оверлей F3
const perf = { acc: 0, n: 0, t: 0, fps: 0, ms: 0, showT: 0 };
function trackPerf(rawDt) {
  perf.acc += rawDt; perf.n++;
  if (perf.acc < 1) return;
  perf.fps = perf.n / perf.acc; perf.ms = (perf.acc / perf.n) * 1000;
  perf.acc = 0; perf.n = 0;
  if (settings.dynres && S.started) {
    // цель — 55+ кадров: медленно — уменьшаем разрешение, быстро — возвращаем
    const was = dyn.scale;
    if (perf.fps < 45) dyn.scale = Math.max(0.5, dyn.scale - 0.1);
    else if (perf.fps > 58) dyn.scale = Math.min(1, dyn.scale + 0.05);
    if (dyn.scale !== was) applyQuality();
  }
}
function drawPerf() {
  const el = document.getElementById('perf');
  if (!S.perfOn) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
  el.style.display = 'block';
  const i = renderer.info, mem = performance.memory ? ` · JS ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} МБ` : '';
  el.textContent = `${perf.fps.toFixed(0)} FPS · ${perf.ms.toFixed(1)} мс\nвызовов ${i.render.calls} · треуг. ${(i.render.triangles / 1000).toFixed(0)}k\nгеометрий ${i.memory.geometries} · текстур ${i.memory.textures} · программ ${(i.programs || []).length}\n` +
    `разрешение ×${renderer.getPixelRatio().toFixed(2)}${settings.dynres ? ` (дин. ${dyn.scale.toFixed(2)})` : ''} · ${settings.preset}${mem}\nсуществ ${mobEnts.filter((m) => m.seen).length} · игроков ${remotes.size + 1}`;
}

function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  update(dt);
  renderer.info.autoReset = false; renderer.info.reset();
  renderFrame(dt, S.prox || 0, W.filter === 'vhs');
  trackPerf(Math.min(1, raw));
  perf.showT -= raw;
  if (perf.showT <= 0) { perf.showT = 0.5; drawPerf(); }
}

initMenu();
requestAnimationFrame(frame);
