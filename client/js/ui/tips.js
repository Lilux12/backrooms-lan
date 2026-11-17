// Подсказки новичку: показываются по одному разу (запоминаются в браузере), отключаются в настройках
import { $, LEVELS } from '../core/util.js';
import { S, me } from '../core/state.js';
import { settings } from '../core/settings.js';
import { curLevel, map, objs } from '../world/world.js';
import { mobEnts } from '../entities/mobs.js';
import { camera } from '../render/scene.js';

let shown = (() => { try { return JSON.parse(localStorage.getItem('br_tips') || '{}'); } catch (e) { return {}; } })();
let cur = null, curT = 0, checkT = 0;
function show(id, text) {
  if (shown[id] || cur) return;
  shown[id] = 1;
  try { localStorage.setItem('br_tips', JSON.stringify(shown)); } catch (e) { /* без хранилища — каждый раз */ }
  cur = id; curT = 7;
  $('tip').textContent = text; $('tip').classList.add('on');
}
const near = (kind, r) => [...objs.values()].some((rec) => rec.o.kind === kind && Math.hypot(rec.o.x - me.x, rec.o.z - me.z) < r && Math.abs((rec.o.y || 0) - me.y) < 2);

export function updateTips(dt) {
  if (cur) { curT -= dt; if (curT <= 0) { cur = null; $('tip').classList.remove('on'); } }
  if (!settings.tips || !S.joined || !map) return;
  checkT -= dt;
  if (checkT > 0) return;
  checkT = 0.5;
  if (S.time > 12) show('start', 'Подсказка: E — действие, F — фонарик, Shift — бег (тратит силы), J — дневник с записками. Держитесь вместе.');
  if (me.body && (me.body.wade || me.body.swim)) show('water', 'В воде медленнее. Глубоко — плывёте: Пробел — вверх, C — нырнуть. Под водой следите за воздухом.');
  if (near('switch', 6)) show('switch', 'Переключатель держится, пока на нём стоят, и ещё несколько секунд после. Вдвоём просто, одному — нажать и бегом.');
  if (mobEnts.some((m) => m.seen && !m.stun && Math.hypot(m.x - camera.position.x, m.z - camera.position.z) < 18))
    show('mob', 'Существо рядом! Бегите (Shift), уводите его, не прячьтесь в тупиках. У каждого существа свои слабости — читайте записки.');
  if (near('door', 8) && !S.goalLines.some((l) => /ОТКРЫТ/.test(l))) show('door', 'Дверь выхода откроется, когда решена головоломка уровня. Цели — слева сверху.');
  if (LEVELS[curLevel].chase) show('chase', 'Это погоня: не останавливайтесь. Палаты срезают путь, но двери в них захлопываются.');
}
