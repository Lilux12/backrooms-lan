// Клавиатура
import { $ } from '../core/util.js';
import { S, keypad, keys } from '../core/state.js';
import { sfx, tone } from '../audio/audio.js';
import { sendNet } from '../net/net.js';
import { closeKeypad, toast, updateKeypad } from '../ui/hud.js';
import { useNearest } from './interact.js';
import { toggleBigMap } from '../ui/maps.js';
import { toggleTorch } from './player.js';
import { onSocialKey, social } from './social.js';
import { onSpectatorKey, placeMarkAhead, spec } from './spectator.js';
import { toggleAdmin } from '../ui/admin.js';
import { toggleJournal } from '../ui/journal.js';
import { key } from '../core/settings.js';

addEventListener('keydown', (e) => {
  if (keypad.open) {
    e.preventDefault();
    if (/^Digit\d$/.test(e.code) || /^Numpad\d$/.test(e.code)) {
      if (keypad.buf.length < 4) { keypad.buf += e.code.slice(-1); sfx.key(); updateKeypad(); }
    } else if (e.code === 'Backspace') { keypad.buf = keypad.buf.slice(0, -1); updateKeypad(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (keypad.buf.length === 4) sendNet({ t: 'code', v: keypad.buf }); else tone(150, 0.2, 0.2, 'sawtooth');
    } else if (e.code === 'KeyQ' || e.code === key('use') || e.code === 'Escape') closeKeypad();
    return;
  }
  if ((e.code === 'F1' || e.code === 'Backquote') && S.joined) { e.preventDefault(); toggleAdmin(); return; }
  if (social.chatOpen || social.asked || S.adminOpen) return;
  if (S.joined && S.locked && !e.repeat && onSpectatorKey(e.code)) { e.preventDefault(); return; }
  if (S.joined && (S.locked || social.caged || spec.dead) && !e.repeat && onSocialKey(e.code)) { e.preventDefault(); return; }
  if (S.joined && S.locked && !e.repeat && !spec.dead && !social.caged) {
    if (e.code === 'KeyZ') { placeMarkAhead('here'); return; }
    if (e.code === 'KeyX') { placeMarkAhead('danger'); return; }
    if (e.code === 'KeyR') { if (social.items.medkit) sendNet({ t: 'revive' }); else toast('Нужна аптечка — с ней можно вернуть погибшего', 2000); return; }
  }
  keys[e.code] = true;
  if (e.code === 'KeyH') { S.mmOn = !S.mmOn; $('minimapWrap').style.display = S.mmOn ? 'block' : 'none'; }
  if (e.code === 'F3') { e.preventDefault(); S.perfOn = !S.perfOn; return; }
  if (e.code === key('journal') && S.joined && !e.repeat) { toggleJournal(); return; }
  if (e.code === key('torch') && S.joined && S.locked && !e.repeat && !spec.dead) toggleTorch();
  if (e.code === key('map') && S.joined && S.locked && !e.repeat) toggleBigMap();
  if (e.code === key('use') && S.joined && S.locked && !spec.dead) {
    if ($('note').style.display === 'block') $('note').style.display = 'none'; else useNearest();
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/* ---------------------------- Геймпад ---------------------------- */
// Стики — ход и взгляд, A — прыжок, B — присесть, X — действие, Y — фонарь, RB/L3 — бег, Back — карта.
// Нажатия превращаются в те же «клавиши», что и с клавиатуры.
const padPrev = {}, padKeys = new Set();
export function pollGamepad(dt, me) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads && [...pads].find((q) => q && q.connected);
  if (!p) { if (S.padActive) { S.padActive = false; for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) keys[k] = false; } return; }
  const ax = (i) => (Math.abs(p.axes[i] || 0) > 0.18 ? p.axes[i] : 0);
  const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
  const any = p.axes.some((a) => Math.abs(a) > 0.3) || p.buttons.some((b) => b.pressed);
  if (any && !S.padActive && S.joined) { S.padActive = true; }
  if (!S.padActive || !S.joined || S.adminOpen || social.chatOpen) return;
  S.locked = $('menu').style.display === 'none'; // с геймпадом мышь не нужна
  // «нажимаем» клавиши только пока держим стик/кнопку — клавиатура при этом продолжает работать
  const set = (k, v) => { if (v) { keys[k] = true; padKeys.add(k); } else if (padKeys.has(k)) { keys[k] = false; padKeys.delete(k); } };
  set('KeyW', ax(1) < -0.3); set('KeyS', ax(1) > 0.3); set('KeyA', ax(0) < -0.3); set('KeyD', ax(0) > 0.3);
  me.yaw -= ax(2) * 2.6 * dt; me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - ax(3) * 2.0 * dt));
  set(key('jump'), btn(0)); set(key('crouch'), btn(1)); set(key('sprint'), btn(5) || btn(10));
  const edge = (i) => btn(i) && !padPrev[i];
  if (edge(2) && !spec.dead) { if ($('note').style.display === 'block') $('note').style.display = 'none'; else useNearest(); }
  if (edge(3) && !spec.dead) toggleTorch();
  if (edge(8)) toggleBigMap();
  for (let i = 0; i < p.buttons.length; i++) padPrev[i] = btn(i);
}
