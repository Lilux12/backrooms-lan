// Взаимодействие с объектами (клавиша E)
import { BR } from '../core/util.js';
import { S, keypad, me } from '../core/state.js';
import { map, objs } from '../world/world.js';
import { sfx } from '../audio/audio.js';
import { sendNet } from '../net/net.js';
import { openKeypad } from '../ui/hud.js';

/* ---------- Взаимодействие ---------- */
const INTERACTIVE = ['box', 'lever', 'note', 'keypad', 'valve', 'drain', 'paper', 'lore', 'pump', 'cage', 'altar',
  'switch', 'steamvalve', 'radio', 'monitor', 'lift', 'musicbox', 'furnace', 'mixer', 'ending', 'phone', 'shelf', 'genroof', 'reagent', 'keyslot', 'cardreader', 'puzzleboard', 'pipevalve'];
export function nearestUsable() {
  let best = null, bd = 3.2;
  for (const rec of objs.values()) {
    const o = rec.o;
    if (!INTERACTIVE.includes(o.kind) || (o.kind === 'lever' && o.on)) continue;
    const d = Math.hypot(o.x - me.x, o.z - me.z);
    if (Math.abs((o.y || 0) - me.y) > 1.8) continue;
    // точка проверки чуть отодвинута от стены, иначе настенный объект «внутри» стены
    const ox = o.nx !== undefined ? o.x + o.nx * 0.3 : o.x, oz = o.nz !== undefined ? o.z + o.nz * 0.3 : o.z;
    if (d < bd && BR.los3(map, me.x, me.y + 1.5, me.z, ox, (o.y || 0) + 1.0, oz)) { bd = d; best = o; }
  }
  return best;
}
export function promptFor(o) {
  switch (o.kind) {
    case 'box': return S.heldFuses > 0 ? `<b>E</b> Вставить предохранители (${S.heldFuses})` : 'Щиток обесточен — нужны предохранители';
    case 'lever': return '<b>E</b> Дёрнуть рычаг';
    case 'note': return '<b>E</b> Прочитать записку';
    case 'keypad': return '<b>E</b> Ввести код';
    case 'valve': return `<b>E</b> Повернуть ${['красный', 'синий', 'жёлтый'][o.col]} вентиль (давление ${'●'.repeat(o.val)}${'○'.repeat(3 - o.val)})`;
    case 'drain': return '<b>E</b> Дёрнуть рычаг СЛИВА';
    case 'paper': return '<b>E</b> Прочитать: ' + (o.title || 'таблица');
    case 'lore': return '<b>E</b> ' + (/плёнк|касс/i.test(o.title || '') ? 'Посмотреть: ' : 'Прочитать: ') + (o.title || 'записка');
    case 'pump': return '<b>E</b> Пульт насоса';
    case 'cage': return '<b>E</b> Открыть клетку';
    case 'altar': return '<b>E</b> Алтарь: вернуть погибших';
    case 'switch': return o.on ? `${o.label || 'Переключатель'}: <b style="color:#5f5">ВКЛ</b>${o.pressed ? '' : ` (ещё ${Math.max(0, Math.ceil(switchLeft(o)))} с)`} · <b>E</b> — продлить`
      : `<b>E</b> ${o.label || 'Нажать'}${o.style === 'plate' ? ' (или встаньте на плиту)' : ''}`;
    case 'steamvalve': return o.on ? 'Давление пара: норма' : '<b>E</b> Открыть вентиль пара';
    case 'radio': return '<b>E</b> Послушать рацию';
    case 'monitor': return '<b>E</b> Камеры наблюдения';
    case 'lift': return o.broken ? 'Лифт обесточен' : '<b>E</b> Лифт: следующий этаж';
    case 'keyslot': return '<b>E</b> Ключница: повесить ключи';
    case 'phone': return '<b>E</b> Снять трубку';
    case 'genroof': return '<b>E</b> Завести генератор';
    case 'cardreader': return `<b>E</b> Считыватель: ${{ blue: 'синий', yellow: 'жёлтый', red: 'красный' }[o.group]} допуск`;
    case 'mixer': return '<b>E</b> Станция смешивания';
    case 'reagent': return `<b>E</b> Добавить реагент «${o.name}»`;
    case 'puzzleboard': return '<b>E</b> Приложить кусочки картины';
    case 'shelf': return `<b>E</b> Полка (${{ red: 'красная', green: 'зелёная', blue: 'синяя' }[o.color]})${o.toy ? ' — занята' : ': посадить игрушку'}`;
    case 'musicbox': return o.playing ? 'Шкатулка играет…' : '<b>E</b> Завести музыкальную шкатулку';
    case 'furnace': return o.lit ? `Печь горит (${o.temp}°)` : `<b>E</b> Разжечь печь (${o.temp}°)`;
    case 'pipevalve': return '<b>E</b> Повернуть задвижку паропровода';
    case 'ending': return o.active ? '<b>E</b> Сесть в кресло Надсмотрщика… (концовка)' : 'Кресло Надсмотрщика';
  }
  return '';
}
// Сколько ещё продержится отпущенный переключатель (сервер присылает остаток при отпускании)
export const switchLeft = (o) => (o.pressed ? o.latch : Math.max(0, (o.left || 0) - (performance.now() - (o._t || 0)) / 1000));
export function useNearest() {
  const o = nearestUsable();
  if (!o) return;
  if (o.kind === 'keypad') { openKeypad(); return; }
  sendNet({ t: 'use', id: o.id });
  if (['lever', 'valve', 'drain', 'switch', 'steamvalve', 'monitor'].includes(o.kind)) sfx.click();
}
