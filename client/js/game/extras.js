// Дополнительные механики клиента:
//  шкафчики (спрятаться), голосовые реплики 1–4, камера ночного видения (N), фоторежим (P), шумомер,
//  достижения, события «режиссёра» (шёпот, шаги за спиной, лицо в обоях, звонок, мигание света),
//  модификаторы раунда, стук из коробок в «Детской».
import * as THREE from 'three';
import { $, LEVELS, clamp } from '../core/util.js';
import { FL, S, keys, me } from '../core/state.js';
import { settings } from '../core/settings.js';
import { camera, renderer, scene } from '../render/scene.js';
import { playAt, sfx, tone } from '../audio/audio.js';
import { toast } from '../ui/hud.js';
import { curLevel, map, objs } from '../world/world.js';
import { remotes } from '../entities/avatars.js';
import { placeMe } from './player.js';
import { sendNet } from '../net/net.js';

/* ------------------------------ Достижения ------------------------------ */
export const ACHIEVEMENTS = {
  first: ['Первый выход', 'Пройти любой уровень'],
  nodeath: ['Ни царапины', 'Пройти уровень, ни разу не погибнув'],
  speed: ['Спидраннер', 'Пройти уровень быстрее трёх минут'],
  exposer: ['Разоблачитель', 'Сорвать маску со Skin Stealer'],
  hider: ['Не дыши', 'Существо прошло рядом со шкафчиком, где вы прятались'],
  swimmer: ['Ихтиандр', 'Провести под водой 10 секунд подряд'],
  reader: ['Архивариус', 'Прочитать все записки уровня'],
  nv: ['Оператор', '30 секунд снимать на камеру ночного видения'],
  photo: ['Фотограф', 'Сохранить снимок в фоторежиме'],
  emote: ['Голос в темноте', 'Использовать все четыре реплики'],
  egg: ['Пасхальное яйцо', 'Найти то, чего здесь быть не должно'],
  hardcore: ['Без права на ошибку', 'Пройти уровень на хардкоре'],
  escape: ['Под чёрным небом', 'Разрушить фабрику'],
  stay: ['Новый Надсмотрщик', 'Остаться в кресле'],
};
let got = (() => { try { return JSON.parse(localStorage.getItem('br_ach') || '{}'); } catch (e) { return {}; } })();
export function unlock(id) {
  if (got[id] || !ACHIEVEMENTS[id]) return;
  got[id] = Date.now();
  try { localStorage.setItem('br_ach', JSON.stringify(got)); } catch (e) { /* без хранилища */ }
  sfx.win();
  toast(`🏆 Достижение: ${ACHIEVEMENTS[id][0]} — ${ACHIEVEMENTS[id][1]}`, 4500);
  renderAchievements();
}
export function renderAchievements() {
  const box = $('achList');
  if (!box) return;
  box.innerHTML = '';
  for (const [id, [name, desc]] of Object.entries(ACHIEVEMENTS)) {
    const d = document.createElement('div'); d.className = 'ach' + (got[id] ? ' on' : '');
    d.innerHTML = `<b>${got[id] ? '🏆' : '·'} ${name}</b><span>${desc}</span>`;
    box.append(d);
  }
}

/* --------------------- Реплики 1–4 (голос синтезом) --------------------- */
const EMOTE_FORMANTS = [[520, 1500], [700, 1100], [400, 2200], [300, 900]];
const usedEmotes = new Set();
export function sendEmote(k) { sendNet({ t: 'emote', k }); usedEmotes.add(k); if (usedEmotes.size === 4) unlock('emote'); }
export function onEmote(m) {
  // «голос»: две форманты с огибающей — похоже на выкрик, звучит из точки игрока
  const [f1, f2] = EMOTE_FORMANTS[m.k] || EMOTE_FORMANTS[0];
  playAt(m.x, m.y + 1.6, m.z, () => { tone(f1 * 0.5, 0.45, 0.16, 'sawtooth', f1 * 0.42); tone(f2 * 0.5, 0.35, 0.06, 'triangle', f2 * 0.45, 0.02); });
  const r = remotes.get(m.id);
  if (r && r.mesh) bubble(r.mesh, m.text);
}
function bubble(mesh, text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,10,10,.75)'; g.fillRect(0, 8, 256, 48);
  g.fillStyle = '#fff6c0'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set(1.6, 0.4, 1); sp.position.y = 2.5;
  mesh.add(sp);
  setTimeout(() => { mesh.remove(sp); t.dispose(); sp.material.dispose(); }, 2200);
}

/* ------------------------------ Шкафчики ------------------------------ */
export function onHide(m) {
  S.hiding = m; placeMe(m.x, m.y, m.z);
  me.yaw = Math.atan2(-(m.nx || 0), -(m.nz || 0)) + Math.PI; // смотрим из шкафчика в комнату
  $('lockerfx').classList.add('on');
  toast(m.seen ? 'Оно видело, как вы спрятались…' : 'Вы в шкафчике. Не шумите. E — выйти', 3000);
}
export function onUnhide(m) { S.hiding = null; placeMe(m.x, m.y, m.z); $('lockerfx').classList.remove('on'); }

/* --------------------- Камера ночного видения (N) --------------------- */
export const NV = { on: false, bat: 1, t: 0 };
export function toggleNV() {
  if (!NV.on && NV.bat < 0.05) { toast('Камера разряжена — подождите', 1800); return; }
  NV.on = !NV.on; sfx.fl();
  $('game').classList.toggle('nv', NV.on && !settings.post);
}

/* ------------------------------ Фоторежим (P) ------------------------------ */
export function togglePhoto() {
  S.photo = !S.photo;
  $('hud').style.visibility = S.photo ? 'hidden' : 'visible';
  $('photofx').classList.toggle('on', S.photo);
  if (S.photo) $('photoCap').textContent = `${(LEVELS[curLevel].tag || 'LEVEL ' + curLevel)} · ${LEVELS[curLevel].name} · ${new Date().toLocaleString('ru-RU')}`;
}
// Снимок делается сразу после отрисовки кадра (буфер ещё не очищен)
export function capturePhoto() {
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `backrooms-${Date.now()}.png`;
  a.click();
  unlock('photo');
  toast('Снимок сохранён', 1500);
}

/* ------------------------------ Шумомер ------------------------------ */
function noiseLevel(dt) {
  const b = me.body;
  if (!b) return 0;
  const moving = keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD;
  let n = 0;
  if (moving) n = b.crouch ? 0.15 : (keys[settings.keys.sprint] || keys.ShiftRight) ? 1 : 0.45;
  if (b.wade || b.swim) n = Math.min(1, n + 0.25);
  if (FL.on) n = Math.max(n, 0.35); // свет тоже «шум» для тех, кто видит
  return n;
}

/* -------------------- События «режиссёра» и модификаторы -------------------- */
let face = null;
export function onDirectorEvent(m) {
  switch (m.k) {
    case 'whisper': playAt(m.x, m.y, m.z, () => sfx.whisper()); return true;
    case 'steps': for (let k = 0; k < 5; k++) setTimeout(() => playAt(m.x + (me.x - m.x) * k * 0.12, m.y, m.z + (me.z - m.z) * k * 0.12, () => sfx.mobStep('stalker', 0.8)), k * 420); return true;
    case 'flicker': S.flickerUntil = performance.now() / 1000 + (m.dur || 3); return true;
    case 'phone': for (let k = 0; k < 3; k++) setTimeout(() => playAt(m.x, m.y + 1, m.z, () => { tone(440, 0.4, 0.12, 'square'); tone(480, 0.4, 0.12, 'square'); }), k * 1600); return true;
    case 'face': showFace(); return true;
  }
  return false;
}
// Лицо в обоях: на ближайшей стене перед игроком на мгновение проступает лицо
function showFace() {
  if (!map || face) return;
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  for (let d = 1; d < 12; d += 0.5) {
    const x = me.x + fx * d, z = me.z + fz * d;
    if (!window.BR.solidAt(map, x, me.y + 1.5, z)) continue;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(40,30,10,.55)';
    g.beginPath(); g.ellipse(44, 52, 10, 14, 0, 0, 7); g.ellipse(84, 52, 10, 14, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(64, 96, 16, 8, 0, 0, Math.PI); g.fill();
    const t = new THREE.CanvasTexture(c);
    face = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false }));
    face.position.set(x - fx * 0.55, me.y + 1.6, z - fz * 0.55); face.rotation.y = Math.atan2(-fx, -fz);
    scene.add(face);
    const t0 = performance.now();
    const fade = () => {
      const k = (performance.now() - t0) / 1000;
      face.material.opacity = k < 0.8 ? k / 0.8 * 0.85 : Math.max(0, 0.85 - (k - 1.6) * 1.5);
      if (k < 2.3) requestAnimationFrame(fade); else { scene.remove(face); t.dispose(); face.material.dispose(); face.geometry.dispose(); face = null; }
    };
    fade();
    return;
  }
}

export function onAch(m) { unlock(m.id); }

/* ------------------------------ Каждый кадр ------------------------------ */
let underT = 0, nvT = 0, knockT = 0, noiseShow = 0;
export function updateExtras(dt) {
  // ночное видение: своя батарея, не привлекает существ (в отличие от фонаря)
  if (NV.on) { NV.bat -= dt / 45; nvT += dt; if (nvT > 30) unlock('nv'); if (NV.bat <= 0) { NV.bat = 0; toggleNV(); toast('Камера разряжена', 1500); } }
  else { NV.bat = Math.min(1, NV.bat + dt / 70); nvT = 0; }
  // шумомер
  const n = noiseLevel(dt);
  noiseShow += (n - noiseShow) * Math.min(1, dt * 6);
  const el = $('noise');
  if (el) {
    el.style.width = `${noiseShow * 100}%`;
    el.style.background = noiseShow > 0.7 ? '#e05030' : noiseShow > 0.3 ? '#e0c050' : '#70c080';
    $('noiseTxt').textContent = noiseShow > 0.7 ? 'ГРОМКО' : noiseShow > 0.3 ? 'слышно' : 'тихо';
    $('nvRow').style.display = NV.on || NV.bat < 1 ? 'flex' : 'none';
    $('nvTxt').textContent = `${NV.on ? 'ЗАПИСЬ ' : ''}${Math.round(NV.bat * 100)}%`;
  }
  // под водой 10 секунд
  if (me.body && me.body.underwater) { underT += dt; if (underT > 10) unlock('swimmer'); } else underT = 0;
  // в шкафчике любое движение — выход
  if (S.hiding && (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD)) { sendNet({ t: 'unhide' }); S.hiding = null; }
  // «Детская»: из коробок кто-то стучит
  if (map && LEVELS[curLevel].custom === 'school') {
    knockT -= dt;
    const pr = map.fx.find((e) => e.k === 'playroom');
    if (knockT <= 0 && pr && Math.hypot(pr.x - me.x, pr.z - me.z) < 30) {
      knockT = 9 + Math.random() * 14;
      for (let k = 0; k < 3; k++) setTimeout(() => playAt(pr.x + (Math.random() - 0.5) * 20, FH() + 0.5, pr.z + (Math.random() - 0.5) * 20, () => tone(140, 0.12, 0.25, 'sine', 80)), k * 260);
    }
  }
}
const FH = () => (map ? map.FH : 3);

// Прочитаны все записки уровня → достижение
export function checkReader() {
  const lore = [...objs.values()].filter((r) => r.o.kind === 'lore');
  if (lore.length && lore.every((r) => r.o._read)) unlock('reader');
}
export const clampNV = () => clamp(NV.bat, 0, 1);
