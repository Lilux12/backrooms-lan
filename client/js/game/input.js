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

addEventListener('keydown', (e) => {
  if (keypad.open) {
    e.preventDefault();
    if (/^Digit\d$/.test(e.code) || /^Numpad\d$/.test(e.code)) {
      if (keypad.buf.length < 4) { keypad.buf += e.code.slice(-1); sfx.key(); updateKeypad(); }
    } else if (e.code === 'Backspace') { keypad.buf = keypad.buf.slice(0, -1); updateKeypad(); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (keypad.buf.length === 4) sendNet({ t: 'code', v: keypad.buf }); else tone(150, 0.2, 0.2, 'sawtooth');
    } else if (e.code === 'KeyQ' || e.code === 'KeyE') closeKeypad();
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
  if (e.code === 'KeyF' && S.joined && S.locked && !e.repeat && !spec.dead) toggleTorch();
  if (e.code === 'KeyM' && S.joined && S.locked && !e.repeat) toggleBigMap();
  if (e.code === 'KeyE' && S.joined && S.locked && !spec.dead) {
    if ($('note').style.display === 'block') $('note').style.display = 'none'; else useNearest();
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
