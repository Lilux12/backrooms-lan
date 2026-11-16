// Точка входа клиента: игровой цикл
import { clamp } from './core/util.js';
import { FL, S, UP, keys, me } from './core/state.js';
import { camera, renderer, scene, updateDust } from './render/scene.js';
import { updateLight } from './render/lighting.js';
import { H, fx, map } from './world/world.js';
import { animateWater } from './world/geometry.js';
import { animateObjects } from './world/objects.js';
import { remotes, updateRemotes } from './entities/avatars.js';
import { updateMobs } from './entities/mobs.js';
import { updateAudio } from './audio/audio.js';
import { updateHud } from './ui/hud.js';
import { initMenu } from './ui/menu.js';
import { placeMe, updateBattery, updateCamera, updateMovement } from './game/player.js';

// Модуль ввода вешает обработчики клавиш при загрузке.
import './game/input.js';

let last = performance.now();

// доступ для отладки и тестов: состояние, карта, телепорт камеры
window.__br = {
  me, FL, UP, S, keys: () => keys, remotes: () => remotes.size, map: () => map,
  tp(x, y, z, yaw = me.yaw, pitch = 0) { placeMe(x, y, z); me.yaw = yaw; me.pitch = pitch; },
};

function update(dt) {
  S.time += dt;
  const { moving, sprint } = updateMovement(dt);
  updateCamera(dt, moving, sprint);
  updateRemotes(dt);
  const mobDist = updateMobs(dt);
  animateObjects(dt);
  animateWater(dt);
  if (fx) fx.update(dt);
  updateBattery(dt);
  updateDust(dt, H);
  updateLight(dt);
  const prox = clamp(1 - mobDist / 34, 0, 1); // 0 — существ рядом нет, 1 — вплотную
  updateAudio(dt, prox, !!(me.body && me.body.underwater));
  updateHud(dt, prox);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
}

initMenu();
requestAnimationFrame(frame);
