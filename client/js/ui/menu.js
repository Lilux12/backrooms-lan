// Главное меню, пауза, настройки
import { $, LEVELS, clamp, rand } from '../core/util.js';
import { saveSettings, settings } from '../core/settings.js';
import { S, me } from '../core/state.js';
import { applyQuality, camera, renderer } from '../render/scene.js';
import { A, initAudio } from '../audio/audio.js';
import { connect } from '../net/net.js';
import { setStatus } from './hud.js';
import { closeBigMap } from './maps.js';

const nameInput = $('name');
nameInput.value = localStorage.getItem('br_name') || `Игрок${Math.floor(rand(10, 99))}`;

export function beginPlay() { S.started = true; $('menu').style.display = 'none'; $('hud').style.display = 'block'; }
function lockPointer() { renderer.domElement.requestPointerLock(); }

$('play').addEventListener('click', () => {
  if (S.started) { $('menu').style.display = 'none'; lockPointer(); return; }
  const name = nameInput.value.trim() || 'Игрок';
  localStorage.setItem('br_name', name);
  initAudio();
  setStatus('Подключение…');
  connect(name);
  lockPointer();
});
nameInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('play').click(); });

document.addEventListener('pointerlockchange', () => {
  S.locked = document.pointerLockElement === renderer.domElement;
  if (!S.locked) closeBigMap();
  if (S.started && S.joined && !S.locked) {
    $('subtitle').textContent = 'ПАУЗА · КЛИК, ЧТОБЫ ПРОДОЛЖИТЬ (существо не ждёт!)';
    $('play').textContent = 'ПРОДОЛЖИТЬ';
    $('menu').style.display = 'flex';
  }
});
document.addEventListener('mousemove', (e) => {
  if (!S.locked) return;
  me.yaw -= e.movementX * 0.0022 * settings.sens;
  me.pitch = clamp(me.pitch - e.movementY * 0.0022 * settings.sens, -1.45, 1.45);
});

/* ======================= Меню, настройки, плёнка ======================= */
export function initMenu() {
  const list = $('lvlList');
  const hints = ['предохранители', 'код на стенах', 'нажимные плиты', 'рычаги', 'бегство', 'всё сразу'];
  LEVELS.forEach((L, i) => {
    const d = document.createElement('div'); d.className = 'lv-row'; d.id = 'lvrow' + i;
    d.innerHTML = `<b>${(L.tag || 'LEVEL ' + i)}</b>${L.name}<span>${hints[i] || ''}</span>`;
    list.append(d);
  });
  const host = location.host || '';
  $('addr').textContent = /^(localhost|127\.)/.test(location.hostname) ? `http://<IP хоста>:${location.port || 3000} (он написан в окне сервера)` : location.origin;

  const bind = (id, out, key, fmt, apply) => {
    const el = $(id); el.value = settings[key]; $(out).textContent = fmt(settings[key]);
    el.addEventListener('input', () => { settings[key] = parseFloat(el.value); $(out).textContent = fmt(settings[key]); saveSettings(); apply && apply(); });
  };
  const brightness = () => { $('game').style.filter = `brightness(${settings.br})`; };
  bind('sSens', 'oSens', 'sens', (v) => v.toFixed(2) + '×');
  bind('sFov', 'oFov', 'fov', (v) => String(Math.round(v)));
  bind('sVol', 'oVol', 'vol', (v) => Math.round(v * 100) + '%', () => { if (A) A.master.gain.value = settings.vol; });
  bind('sBr', 'oBr', 'br', (v) => v.toFixed(2), brightness);
  $('sQ').value = String(settings.q);
  $('sQ').addEventListener('change', () => { settings.q = parseFloat($('sQ').value); saveSettings(); applyQuality(); });
  brightness();
  camera.fov = settings.fov; me.fov = settings.fov; camera.updateProjectionMatrix();

  // зернистость плёнки
  const gc = $('grain'), gx = gc.getContext('2d'), im = gx.createImageData(gc.width, gc.height);
  setInterval(() => {
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    gx.putImageData(im, 0, 0);
  }, 90);
}
