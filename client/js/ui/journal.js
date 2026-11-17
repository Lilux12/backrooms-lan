// Дневник (J): прочитанные записки и кассеты, найденные цифры кода, подсказки — по уровням
import { $, LEVELS } from '../core/util.js';
import { S } from '../core/state.js';
import { curLevel } from '../world/world.js';

const entries = []; // { level, title, text }
export function addJournal(title, text) {
  if (entries.some((e) => e.level === curLevel && e.title === title && e.text === text)) return;
  entries.push({ level: curLevel, title, text });
  if (S.journalOpen) renderJournal();
}
export function toggleJournal() {
  S.journalOpen = !S.journalOpen;
  $('journal').style.display = S.journalOpen ? 'block' : 'none';
  if (S.journalOpen) renderJournal();
}
function renderJournal() {
  const box = $('jList'); box.innerHTML = '';
  // текущие цели — сверху (там же найденные цифры и прогресс)
  const goals = document.createElement('div'); goals.className = 'je';
  goals.innerHTML = '<b>Сейчас</b>'; goals.append(document.createTextNode(S.goalLines.join('\n')));
  box.append(goals);
  let lv = -1;
  for (const e of entries.slice().reverse()) {
    if (e.level !== lv) { lv = e.level; const h = document.createElement('div'); h.className = 'lvh'; h.textContent = (LEVELS[lv].tag || 'LEVEL ' + lv) + ' · ' + LEVELS[lv].name; box.append(h); }
    const d = document.createElement('div'); d.className = 'je';
    const b = document.createElement('b'); b.textContent = e.title;
    d.append(b, document.createTextNode(e.text));
    box.append(d);
  }
  if (!entries.length) { const d = document.createElement('div'); d.className = 'je'; d.textContent = 'Пока пусто. Читайте записки (E), слушайте рации и телефоны.'; box.append(d); }
}
