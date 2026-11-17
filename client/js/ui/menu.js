// Главное меню, пауза, настройки
import { $, LEVELS, clamp, rand } from '../core/util.js';
import { DEFAULT_KEYS, applyPreset, saveSettings, settings, shadowSize } from '../core/settings.js';
import { S, me } from '../core/state.js';
import { applyQuality, applyShadows, camera, renderer } from '../render/scene.js';
import { refreshGraphics } from '../world/world.js';
import { A, initAudio } from '../audio/audio.js';
import { connect, sendNet } from '../net/net.js';
import { social } from '../game/social.js';
import { setStatus } from './hud.js';
import { closeBigMap } from './maps.js';

const nameInput = $('name');
nameInput.value = localStorage.getItem('br_name') || `Игрок${Math.floor(rand(10, 99))}`;

export function beginPlay() { S.started = true; setStatus(''); $('menu').style.display = 'none'; $('hud').style.display = 'block'; }
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
  if (!S.locked && !S.ghostCursor) closeBigMap();
  if (social.chatOpen || social.asked || S.ghostCursor || S.adminOpen) return; // курсор нужен для чата/карты/панели — это не пауза
  if (S.started && S.joined && !S.locked) {
    $('subtitle').textContent = 'ПАУЗА · СУЩЕСТВО НЕ ЖДЁТ';
    $('playTitle').textContent = 'ПАУЗА';
    $('lobbyBox').style.display = 'none';
    $('playHint').textContent = 'Игра для остальных продолжается.';
    $('play').textContent = 'ПРОДОЛЖИТЬ';
    $('navPlay').textContent = 'ПРОДОЛЖИТЬ';
    $('navPlay').classList.add('primary');
    $('stuck').style.display = 'block';
    showScreen('play');
    $('menu').style.display = 'flex';
  }
});

// Пункты меню слева: показать раздел справа. «Продолжить» в паузе сразу возвращает в игру.
function showScreen(name) {
  for (const el of document.querySelectorAll('#menu [data-scr]')) el.classList.toggle('on', el.dataset.scr === name);
}
for (const b of document.querySelectorAll('#mmNav button')) {
  b.addEventListener('click', () => { if (b.id === 'navPlay' && S.started) $('play').click(); else showScreen(b.dataset.scr); });
}
document.addEventListener('mousemove', (e) => {
  if (!S.locked) return;
  me.yaw -= e.movementX * 0.0022 * settings.sens;
  me.pitch = clamp(me.pitch - e.movementY * 0.0022 * settings.sens, -1.45, 1.45);
});

/* ======================= Меню, настройки, плёнка ======================= */
export function initMenu() {
  $('stuck').addEventListener('click', () => { sendNet({ t: 'stuck' }); $('play').click(); });
  renderLevelList();
  // роль и цвет — для следующего подключения
  $('role').value = localStorage.getItem('br_role') || '';
  $('color').value = localStorage.getItem('br_color') || '#6aa0ff';
  $('role').addEventListener('change', () => localStorage.setItem('br_role', $('role').value));
  $('color').addEventListener('input', () => localStorage.setItem('br_color', $('color').value));
  loadRecords();
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
  // пресет качества и отдельные эффекты
  $('sPreset').value = settings.preset;
  $('sPreset').addEventListener('change', () => { applyPreset($('sPreset').value); renderChecks(); applyGraphics(); });
  renderChecks();
  renderBinds();
  applyGraphics();
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

/* ---------------------------- Графика ---------------------------- */
const CHECKS = [
  ['post', 'Постобработка'], ['bloom', 'Свечение ламп (bloom)'], ['shadows', 'Тени фонаря'], ['pbr', 'PBR-материалы (блики)'],
  ['vign', 'Виньетка'], ['ca', 'Хроматическая аберрация'], ['grain', 'Зерно плёнки'], ['vhs', 'VHS-помехи'],
  ['fxLights', 'Декоративный свет'], ['dynres', 'Динамическое разрешение'], ['subs', 'Субтитры звуков'], ['tips', 'Подсказки новичку'],
];
function renderChecks() {
  const box = $('checks'); box.innerHTML = '';
  for (const [k, label] of CHECKS) {
    const l = document.createElement('label'), c = document.createElement('input');
    c.type = 'checkbox'; c.checked = !!settings[k];
    c.addEventListener('change', () => { settings[k] = c.checked; saveSettings(); applyGraphics(k); });
    l.append(c, document.createTextNode(label)); box.append(l);
  }
}
// Применить графические настройки (часть требует пересборки материалов уровня)
export function applyGraphics(changed) {
  applyQuality();
  applyShadows(shadowSize());
  // CSS-зерно и виньетка не нужны, если их рисует постобработка
  $('grain').parentElement.style.display = settings.post && settings.grain ? 'none' : '';
  $('vignette').style.display = settings.post && settings.vign ? 'none' : '';
  if (!changed || ['pbr', 'shadows', 'fxLights'].includes(changed)) refreshGraphics();
}

/* -------------------------- Клавиши -------------------------- */
const ACTIONS = { use: 'Действие', torch: 'Фонарик', sprint: 'Бег', crouch: 'Присесть / ползти', jump: 'Прыжок / всплыть', map: 'Карта', journal: 'Дневник' };
const keyName = (code) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ControlLeft', 'Ctrl').replace('Space', 'Пробел');
function renderBinds() {
  const box = $('binds'); box.innerHTML = '';
  for (const [a, label] of Object.entries(ACTIONS)) {
    const b = document.createElement('button');
    b.textContent = keyName(settings.keys[a]);
    b.addEventListener('click', () => {
      b.textContent = '…нажмите'; b.classList.add('wait');
      const h = (e) => {
        e.preventDefault(); e.stopPropagation();
        removeEventListener('keydown', h, true);
        if (e.code !== 'Escape') settings.keys[a] = e.code;
        saveSettings(); renderBinds();
      };
      addEventListener('keydown', h, true);
    });
    box.append(document.createTextNode(label), b);
  }
  const reset = document.createElement('button'); reset.textContent = 'по умолчанию';
  reset.addEventListener('click', () => { settings.keys = Object.assign({}, DEFAULT_KEYS); saveSettings(); renderBinds(); });
  box.append(document.createTextNode(''), reset);
}

/* -------------------- Этапы кампании и прогресс -------------------- */
const HINTS = ['предохранители и рубильник', 'УФ-код и генератор', 'пар и две плиты', 'вентили, шлюз, насос', 'погоня', 'питание и переговорная',
  'ключи и лифт', 'генератор и кассеты', 'допуски и реактор', 'пазл, игрушки, качели', 'печи, пар, консоли'];
export const progress = () => { try { return +(localStorage.getItem('br_maxlv') || 0); } catch (e) { return 0; } };
export function noteProgress(level) {
  try { if (level > progress()) localStorage.setItem('br_maxlv', String(level)); } catch (e) { /* без хранилища — без прогресса */ }
  renderLevelList();
}
export function renderLevelList() {
  const list = $('lvlList'); list.innerHTML = '';
  const max = progress();
  LEVELS.forEach((L, i) => {
    const d = document.createElement('div');
    const open = i <= max;
    d.className = 'lv-row' + (open ? '' : ' locked') + (open && S.admin ? ' pick' : '');
    d.innerHTML = `<b>${(L.tag || 'LEVEL ' + i)}</b>${L.name}<span>${open ? HINTS[i] || '' : '🔒 ещё не пройден'}</span>`;
    // хост может запустить любой уровень, до которого дошёл
    if (open && S.admin) d.addEventListener('click', () => { sendNet({ t: 'adm', cmd: 'level', args: { v: i } }); $('play').click(); });
    list.append(d);
  });
}

/* ---------------------------- Рекорды сервера ---------------------------- */
const fmt = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
export async function loadRecords() {
  const box = $('records');
  try {
    const db = await (await fetch('/records.json')).json();
    box.innerHTML = '';
    const camp = db.campaign && db.campaign[0];
    if (camp) box.insertAdjacentHTML('beforeend', `<div class="r"><b>Вся кампания</b><span>${fmt(camp.time)} · ${camp.names.join(', ')} · ${camp.ending === 'stay' ? 'остались' : 'вышли'}</span></div>`);
    LEVELS.forEach((L, i) => {
      const best = (db.levels[String(i)] || [])[0];
      if (best) box.insertAdjacentHTML('beforeend', `<div class="r"><span>${L.name}</span><span>${fmt(best.time)} · ${best.names.join(', ')}</span></div>`);
    });
    if (!box.children.length) box.textContent = 'Рекордов пока нет — пройдите уровень первыми.';
  } catch (e) { box.textContent = 'Рекорды недоступны (откройте игру через сервер).'; }
}
