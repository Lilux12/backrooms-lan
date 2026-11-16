// Взаимодействие с объектами (клавиша E)
import { BR } from '../core/util.js';
import { S, keypad, me } from '../core/state.js';
import { map, objs } from '../world/world.js';
import { sfx } from '../audio/audio.js';
import { sendNet } from '../net/net.js';
import { openKeypad } from '../ui/hud.js';

/* ---------- Взаимодействие ---------- */
const INTERACTIVE = ['box', 'lever', 'note', 'keypad'];
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
  }
  return '';
}
export function useNearest() {
  const o = nearestUsable();
  if (!o) return;
  if (o.kind === 'keypad') { openKeypad(); return; }
  sendNet({ t: 'use', id: o.id });
  if (o.kind === 'lever') sfx.click();
}
