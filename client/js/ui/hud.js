// HUD: уведомления, баннеры, записки, терминал, цели
import { $, LEVELS, clamp } from '../core/util.js';
import { FL, S, keypad, me } from '../core/state.js';
import { curLevel, map } from '../world/world.js';
import { sfx } from '../audio/audio.js';
import { nearestUsable, promptFor } from '../game/interact.js';
import { drawBigMap, drawMinimap } from './maps.js';

export function setStatus(t) { $('status').textContent = t; }

/* ============================== Интерфейс ============================== */
let toastTimer = 0;
export function toast(text, ms = 2500) {
  const t = $('toast');
  t.textContent = text; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
export function showBanner(html) { const b = $('banner'); b.innerHTML = html; b.style.display = 'flex'; }
export function hideBanner() { $('banner').style.display = 'none'; }

let noteTimer = 0;
export function showNote(text, title) {
  const n = $('note');
  n.innerHTML = '';
  if (title) { const h = document.createElement('b'); h.textContent = title; h.style.display = 'block'; h.style.marginBottom = '10px'; n.append(h); }
  n.append(document.createTextNode(text));
  const s = document.createElement('small'); s.textContent = 'E — убрать записку';
  n.append(s);
  n.style.display = 'block';
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { n.style.display = 'none'; }, 40000);
}

export function updateKeypad() {
  $('kpDisp').textContent = (keypad.buf + '----').slice(0, 4);
}
export function openKeypad() { keypad.open = true; keypad.buf = ''; updateKeypad(); $('keypad').style.display = 'block'; sfx.beep(); }
export function closeKeypad() { keypad.open = false; $('keypad').style.display = 'none'; }

export function renderGoals() {
  const L = LEVELS[curLevel];
  let dots = '';
  for (let i = 0; i < LEVELS.length; i++) dots += `<i class="${i < curLevel ? 'on' : i === curLevel ? 'cur' : ''}"></i>`;
  $('goals').innerHTML = `<div class="tag">${L.tag || 'LEVEL ' + curLevel}</div><div class="lv">${L.name.toUpperCase()}</div>` +
    S.goalLines.map((l) => `<div class="${l.includes('✔') || l.includes('ОТКРЫТ') ? 'ok' : l.includes('заблок') ? 'bad' : ''}">${l}</div>`).join('') +
    `<div id="prog">${dots}</div>`;
}

export function showLevelTitle(level) {
  const el = $('lvl');
  el.querySelector('.n').textContent = LEVELS[level].tag || `УРОВЕНЬ ${level}`;
  el.querySelector('.t').textContent = LEVELS[level].name.toUpperCase();
  el.querySelector('.i').textContent = LEVELS[level].intro;
  el.classList.add('on');
  clearTimeout(showLevelTitle.t);
  showLevelTitle.t = setTimeout(() => el.classList.remove('on'), 9000);
}

// Обновление HUD каждый кадр: подсказка действия, красная виньетка, полоски, миникарта, часы
const t0 = performance.now();
let hudTimer = 0;
export function updateHud(dt, prox) {
  const pr = $('prompt');
  const u = S.joined && map && !keypad.open ? nearestUsable() : null;
  if (u) { pr.innerHTML = promptFor(u); pr.classList.add('on'); } else pr.classList.remove('on');

  $('danger').style.opacity = String(clamp(prox * 1.3 - 0.25, 0, 0.9) * (0.7 + 0.3 * Math.sin(S.time * 6)));
  $('stamina').style.width = `${me.stamina * 100}%`;
  $('stamina').style.background = me.exhausted ? '#c0503a' : '#e8dc86';
  $('stTxt').textContent = LEVELS[curLevel].infStamina ? '∞' : '';
  $('bat').style.width = `${FL.bat * 100}%`;
  $('bat').style.background = FL.bat < 0.15 ? '#e0603a' : '#8fd0ff';
  $('batTxt').textContent = `${FL.on ? 'ВКЛ ' : ''}${Math.round(FL.bat * 100)}%`;
  const o2 = me.o2 == null ? 1 : me.o2;
  $('o2row').style.display = o2 < 0.999 ? 'block' : 'none';
  $('o2').style.width = `${o2 * 100}%`;
  $('o2').style.background = o2 < 0.25 ? '#e0603a' : '#9fe6ff';
  $('o2Txt').textContent = `${Math.round(o2 * 100)}%`;
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.05;
    drawMinimap();
    if (S.bigOn) drawBigMap();
    const sec = Math.floor((performance.now() - t0) / 1000);
    $('clock').textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }
}
