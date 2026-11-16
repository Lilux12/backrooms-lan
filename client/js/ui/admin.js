// Админ-панель хоста (F1 или ~). Формы строятся из общей спецификации shared/admin.js.
// Клиент только отправляет запросы — права и аргументы проверяет сервер.
import { $, BR, LEVELS } from '../core/util.js';
import { S } from '../core/state.js';
import { renderer } from '../render/scene.js';
import { remotes } from '../entities/avatars.js';
import { sendNet } from '../net/net.js';
import { toast } from './hud.js';

const { COMMANDS } = BR.ADMIN;
const TABS = [['players', 'Игроки'], ['world', 'Мир'], ['mobs', 'Существа'], ['fun', 'Развлечения']];
let tab = 'players';
let playersList = [];

// Токен из ссылки вида http://host:3000/#admin=ТОКЕН запоминается и сразу убирается из адресной строки
export function adminToken() {
  const m = location.hash.match(/admin=([\w-]+)/);
  if (m) { try { localStorage.setItem('br_admin', m[1]); } catch (e) { /* без хранилища — только эта сессия */ } history.replaceState(null, '', location.pathname); return m[1]; }
  try { return localStorage.getItem('br_admin') || ''; } catch (e) { return ''; }
}

export function setAdminPlayers(list) { playersList = list; if (S.adminOpen) render(); }

function input(a) {
  const id = `a_${a.n}`;
  switch (a.t) {
    case 'player':
      return `<select data-n="${a.n}"><option value="me">я</option><option value="all">все</option>` +
        playersList.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') + '</select>';
    case 'num': return `<input data-n="${a.n}" type="number" value="${a.def != null ? a.def : a.min}" min="${a.min}" max="${a.max}" step="${a.max - a.min > 20 ? 1 : 0.1}" title="${a.label}">`;
    case 'int': return `<input data-n="${a.n}" type="number" value="1" step="1" title="${a.label}">`;
    case 'bool': return `<label><input data-n="${a.n}" type="checkbox" checked> ${a.label}</label>`;
    case 'select': return `<select data-n="${a.n}">${a.options.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>`;
    case 'text': return `<input data-n="${a.n}" type="text" maxlength="140" placeholder="${a.label}">`;
    case 'color': return `<input data-n="${a.n}" type="color" value="#ff8800">`;
    case 'level': return `<select data-n="${a.n}">${LEVELS.map((L, i) => `<option value="${i}">${i}. ${L.name}</option>`).join('')}</select>`;
  }
  void id;
  return '';
}
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

function render() {
  const box = $('admin');
  $('aTabs').innerHTML = TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('');
  $('aLogin').style.display = S.admin ? 'none' : 'flex';
  $('aBody').style.display = S.admin ? 'block' : 'none';
  $('aBody').innerHTML = (tab === 'world' ? '<div class="arow"><span>Телепорт кликом по карте</span><span></span><button id="aMapTp">открыть карту</button></div>' : '') +
    COMMANDS.filter((c) => c.tab === tab && !c.hidden).map((c) =>
      `<div class="arow" data-cmd="${c.cmd}"><span>${c.label}</span><span class="aargs">${c.args.map(input).join(' ')}</span><button class="ago">▶</button></div>`).join('');
  box.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
  box.querySelectorAll('.ago').forEach((b) => b.addEventListener('click', () => {
    const row = b.closest('.arow'), args = {};
    row.querySelectorAll('[data-n]').forEach((el) => { args[el.dataset.n] = el.type === 'checkbox' ? (el.checked ? 'on' : 'off') : el.value; });
    sendNet({ t: 'adm', cmd: row.dataset.cmd, args });
  }));
  const mt = $('aMapTp');
  if (mt) mt.addEventListener('click', () => { S.adminClick = true; closeAdmin(); import('./maps.js').then((m) => m.toggleBigMap()); toast('Кликните по карте, куда телепортироваться', 2500); });
}

export function openAdmin() {
  S.adminOpen = true;
  $('admin').style.display = 'flex';
  document.exitPointerLock();
  render();
}
export function closeAdmin() {
  S.adminOpen = false;
  $('admin').style.display = 'none';
  renderer.domElement.requestPointerLock();
}
export const toggleAdmin = () => (S.adminOpen ? closeAdmin() : openAdmin());

export function onAdminNet(m) {
  if (m.t === 'auth') {
    S.admin = !!m.ok;
    $('aResult').textContent = m.ok ? 'Вы вошли как хост' : m.error;
    $('aResult').className = m.ok ? 'ok' : 'bad';
    if (S.adminOpen) render();
    return true;
  }
  if (m.t === 'adm') {
    $('aResult').textContent = m.ok ? (m.info || `✔ ${m.cmd || ''}`) : `✘ ${m.error}`;
    $('aResult').className = m.ok ? 'ok' : 'bad';
    if (!S.adminOpen && !m.ok) toast(m.error, 2500);
    if (!S.adminOpen && m.info) toast(m.info, 9000);
    return true;
  }
  return false;
}

// Разметка панели
$('admin').innerHTML = `<div class="apanel">
  <div class="ahead">АДМИН-ПАНЕЛЬ ХОСТА <small>F1 / ~ — закрыть</small><button id="aClose">✕</button></div>
  <div id="aLogin"><span>Токен хоста (из окна сервера):</span><input id="aToken" type="text" autocomplete="off"><button id="aLoginBtn">Войти</button></div>
  <div id="aTabs"></div>
  <div id="aBody"></div>
  <div id="aConsole"><input id="aCmd" type="text" placeholder="/команда … (/help — список)" autocomplete="off"></div>
  <div id="aResult"></div>
</div>`;
$('aClose').addEventListener('click', closeAdmin);
$('aLoginBtn').addEventListener('click', () => {
  const t = $('aToken').value.trim();
  try { localStorage.setItem('br_admin', t); } catch (e) { /* только сессия */ }
  sendNet({ t: 'auth', token: t });
});
$('admin').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape' || e.code === 'F1') { e.preventDefault(); closeAdmin(); }
});
$('aCmd').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const v = $('aCmd').value.trim();
  if (v) sendNet({ t: 'adm', line: v.startsWith('/') ? v : '/' + v });
  $('aCmd').value = '';
});
void remotes;
