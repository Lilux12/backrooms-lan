// Общение и защита от двойника: чат, проверки игроков (жест, кодовое слово, детектор), шумелка,
// сидение в клетке, жесты аватаров, кодовое слово и предметы в HUD.
import * as THREE from 'three';
import { $, BR } from '../core/util.js';
import { S, me, FL } from '../core/state.js';
import { camera, renderer, scene } from '../render/scene.js';
import { glowSprite } from '../render/textures.js';
import { map } from '../world/world.js';
import { remotes } from '../entities/avatars.js';
import { sfx } from '../audio/audio.js';
import { toast } from '../ui/hud.js';
import { sendNet } from '../net/net.js';
import { placeMe } from './player.js';

export const social = { word: '', items: { detector: 0, noise: 0 }, caged: 0, pinged: 0, asked: false, chatOpen: false };

/* ------------------------------ Чат ------------------------------ */
const MAX_LINES = 7;
export function addChat(name, text, sys = false) {
  const log = $('chatLog');
  const row = document.createElement('div');
  if (sys) row.className = 'sys';
  const b = document.createElement('b'); b.textContent = name ? name + ': ' : '';
  row.append(b, document.createTextNode(text));
  log.append(row);
  while (log.children.length > MAX_LINES) log.firstChild.remove();
  row.dataset.t = String(performance.now());
}
export function fadeChat() {
  const now = performance.now();
  for (const row of $('chatLog').children) row.style.opacity = social.chatOpen ? '1' : String(Math.max(0, 1 - (now - +row.dataset.t - 12000) / 3000));
}
export function openChat() {
  social.chatOpen = true;
  const inp = $('chatInput');
  inp.style.display = 'block'; inp.value = '';
  document.exitPointerLock();
  setTimeout(() => inp.focus(), 0);
}
function closeChat(send) {
  const inp = $('chatInput');
  if (send && inp.value.trim()) sendNet({ t: 'chat', text: inp.value.trim() });
  inp.style.display = 'none'; inp.blur();
  social.chatOpen = false;
  renderer.domElement.requestPointerLock();
}
$('chatInput').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') closeChat(true);
  else if (e.key === 'Escape') closeChat(false);
});

/* -------------------------- Цель взглядом -------------------------- */
const fwd = new THREE.Vector3();
// Игрок, на которого смотрим (ближе 14 м, в прицеле, в прямой видимости)
export function lookedAtPlayer() {
  camera.getWorldDirection(fwd);
  let best = null, ba = 0.22;
  for (const [id, r] of remotes) {
    if (!r.seen || !r.mesh.visible) continue;
    const dx = r.x - camera.position.x, dy = r.y + 1.3 - camera.position.y, dz = r.z - camera.position.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 14 || d < 0.3) continue;
    const a = Math.acos(Math.min(1, (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d));
    if (a < ba && BR.los3(map, camera.position.x, camera.position.y, camera.position.z, r.x, r.y + 1.3, r.z)) { ba = a; best = id; }
  }
  return best;
}

function targetOrToast(what) {
  const id = lookedAtPlayer();
  if (id == null) { toast(`Посмотрите на игрока, чтобы ${what}`, 1800); return null; }
  return id;
}

/* ---------------------------- Клавиши ---------------------------- */
export function onSocialKey(code) {
  if (social.asked) return false;
  if (code === 'KeyT' || code === 'Enter') { openChat(); return true; }
  if (social.caged) return false;
  if (code === 'KeyG') {
    if (social.pinged) { sendNet({ t: 'pong' }); social.pinged = 0; $('pinged').style.display = 'none'; myGesture(); return true; }
    const id = targetOrToast('проверить его жестом'); if (id != null) { sendNet({ t: 'ping', id }); sfx.click(); }
    return true;
  }
  if (code === 'KeyY') { const id = targetOrToast('спросить кодовое слово'); if (id != null) sendNet({ t: 'ask', id }); return true; }
  if (code === 'KeyV') {
    if (!social.items.detector) { toast('Нужен детектор — он лежит где-то на уровне', 2000); return true; }
    const id = targetOrToast('просканировать его'); if (id != null) { sendNet({ t: 'scan', id }); sfx.beep(); }
    return true;
  }
  if (code === 'KeyB') {
    if (!social.items.noise) { toast('Нет шумелок', 1500); return true; }
    sendNet({ t: 'throw' });
    return true;
  }
  return false;
}

function myGesture() { me.wave = 1.2; sfx.click(); }

/* --------------------------- Сообщения --------------------------- */
export function onSocialNet(m) {
  switch (m.t) {
    case 'chat': addChat(m.name, m.text); sfx.key(); return true;
    case 'secret': social.word = m.word; renderSecret(); return true;
    case 'items': social.items = m.items; renderSecret(); return true;
    case 'pinged':
      social.pinged = performance.now();
      $('pinged').textContent = `${m.by} проверяет вас — нажмите G, чтобы ответить жестом`;
      $('pinged').style.display = 'block';
      sfx.beep();
      setTimeout(() => { if (social.pinged && performance.now() - social.pinged > 5800) { social.pinged = 0; $('pinged').style.display = 'none'; } }, 6000);
      return true;
    case 'ask':
      social.asked = true;
      $('askBox').style.display = 'block';
      $('askWho').textContent = m.by;
      $('askInput').value = '';
      document.exitPointerLock();
      setTimeout(() => $('askInput').focus(), 0);
      return true;
    case 'gesture': {
      const r = remotes.get(m.id);
      if (r) { r.wave = m.kind === 'glitch' ? -1.4 : 1.4; }
      return true;
    }
    case 'caged':
      social.caged = m.cage;
      placeMe(m.x, m.y, m.z);
      FL.on = false;
      $('cagedBox').style.display = 'flex';
      sfx.caught();
      addChat('', 'Вас утащили в клетку! Кто-то ходит среди ваших в вашем облике. Напишите им (Enter).', true);
      return true;
    case 'freed':
      social.caged = 0;
      placeMe(m.x, m.y, m.z);
      $('cagedBox').style.display = 'none';
      sfx.win();
      return true;
    case 'exposed': exposeFx(m); return true;
    case 'noise': sfx.noise(); return true;
  }
  return false;
}

$('askInput').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key !== 'Enter') return;
  sendNet({ t: 'answer', word: $('askInput').value });
  social.asked = false;
  $('askBox').style.display = 'none';
  renderer.domElement.requestPointerLock();
});

function renderSecret() {
  const it = social.items;
  $('secret').innerHTML = `Ваше кодовое слово: <b>${social.word}</b>` +
    (it.detector ? ' · <kbd>V</kbd> детектор' : '') + (it.noise ? ` · <kbd>B</kbd> шумелки: ${it.noise}` : '');
}

// Разоблачение: вспышка и «растворение» на месте двойника
let fxList = [];
function exposeFx(m) {
  sfx.shriek();
  const fl = $('flash'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 120);
  const s = glowSprite(0xff2a1a, 2, 0.9);
  s.position.set(m.x, m.y + 1.4, m.z);
  scene.add(s);
  fxList.push({ s, t: 0 });
}
export function tickExpose(dt) {
  for (const f of fxList) { f.t += dt; f.s.scale.setScalar(2 + f.t * 6); f.s.material.opacity = Math.max(0, 0.9 - f.t * 0.6); }
  fxList = fxList.filter((f) => { if (f.t < 1.5) return true; scene.remove(f.s); f.s.material.dispose(); return false; });
}
