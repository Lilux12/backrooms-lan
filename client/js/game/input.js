// Клавиатура
import { $ } from '../core/util.js';
import { S, keypad, keys } from '../core/state.js';
import { sfx, tone } from '../audio/audio.js';
import { sendNet } from '../net/net.js';
import { closeKeypad, updateKeypad } from '../ui/hud.js';
import { useNearest } from './interact.js';
import { toggleBigMap } from '../ui/maps.js';
import { toggleTorch } from './player.js';

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
  keys[e.code] = true;
  if (e.code === 'KeyH') { S.mmOn = !S.mmOn; $('minimapWrap').style.display = S.mmOn ? 'block' : 'none'; }
  if (e.code === 'KeyF' && S.joined && S.locked && !e.repeat) toggleTorch();
  if (e.code === 'KeyM' && S.joined && S.locked && !e.repeat) toggleBigMap();
  if (e.code === 'KeyE' && S.joined && S.locked) {
    if ($('note').style.display === 'block') $('note').style.display = 'none'; else useNearest();
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
