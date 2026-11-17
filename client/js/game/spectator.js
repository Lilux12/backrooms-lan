// Смерть и режим зрителя: камера от первого лица выбранного живого игрока, переключение, свободная камера,
// метки-подсказки призраков (и живых), экран поражения, воскрешение.
import * as THREE from 'three';
import { $, BR, clamp, lerpAngle } from '../core/util.js';
import { S, me, FL, keys } from '../core/state.js';
import { camera, scene } from '../render/scene.js';
import { glowSprite } from '../render/textures.js';
import { map } from '../world/world.js';
import { remotes } from '../entities/avatars.js';
import { sfx } from '../audio/audio.js';
import { toast, showBanner, hideBanner } from '../ui/hud.js';
import { sendNet } from '../net/net.js';
import { placeMe } from './player.js';
import { addChat } from './social.js';

export const spec = { dead: false, watch: null, free: false, freeAllowed: false, deadIds: new Set(), stats: new Map(), cam: null, blend: 0 };

const alive = () => [...remotes.entries()].filter(([id, r]) => r.seen && !spec.deadIds.has(id)).map(([id]) => id).sort((a, b) => a - b);

function setWatch(id) {
  if (spec.watch === id) return;
  const prev = remotes.get(spec.watch);
  if (prev) prev.mesh.visible = prev.seen;
  spec.watch = id;
  spec.blend = 0; // плавный переход камеры
  if (id != null) sendNet({ t: 'watch', id });
}
function cycle(dir) {
  const list = alive();
  if (!list.length) { setWatch(null); return; }
  const i = list.indexOf(spec.watch);
  setWatch(list[((i < 0 ? 0 : i + dir) % list.length + list.length) % list.length]);
}

/* ---------------------------- Сообщения ---------------------------- */
export function onSpectatorNet(m) {
  if (m.t === 'dead') S.myDeaths = (S.myDeaths || 0) + 1;
  switch (m.t) {
    case 'dead':
      spec.dead = true; spec.free = false;
      FL.on = false;
      sfx.caught();
      $('flash').classList.add('on'); setTimeout(() => $('flash').classList.remove('on'), 200);
      showBanner(`ВЫ ПОГИБЛИ<br><small>${m.reason}.<br>Теперь вы призрак: смотрите глазами живых, пишите в чат, ставьте метки на карте (M).<br>Друзья могут вернуть вас аптечкой или на алтаре.</small>`);
      setTimeout(() => { if (spec.dead) hideBanner(); }, 4500);
      spec.cam = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: me.yaw, pitch: me.pitch };
      setTimeout(() => cycle(0), 600);
      return true;
    case 'revived':
      spec.dead = false; spec.free = false;
      setWatch(null);
      placeMe(m.x, m.y, m.z);
      hideBanner();
      sfx.win();
      toast(`${m.by} вернул вас к жизни!`, 3500);
      return true;
    case 'deadlist':
      spec.deadIds = new Set(m.ids);
      if (spec.dead && spec.deadIds.has(spec.watch)) cycle(1);
      return true;
    case 'pstats':
      spec.stats = new Map(m.list.map((e) => [e[0], e]));
      spec.freeAllowed = !!m.free;
      return true;
    case 'rtt': sendNet({ t: 'rtt', k: m.k }); return true;
    case 'defeat': {
      const st = m.stats;
      const mm = String(Math.floor(st.time / 60)).padStart(2, '0'), ss = String(st.time % 60).padStart(2, '0');
      showBanner(`ВСЕ ПОГИБЛИ<br><small>Время на уровне: ${mm}:${ss} · смертей: ${st.deaths} · записок найдено: ${st.notes} · двойников разоблачено: ${st.exposed}<br>` +
        st.players.map((p) => `${p.name}: смертей ${p.deaths}`).join(' · ') + '<br><br>Уровень начнётся заново…</small>');
      sfx.caught();
      return true;
    }
    case 'mark': addMark(m); return true;
  }
  return false;
}

/* ------------------------------ Клавиши ------------------------------ */
export function onSpectatorKey(code) {
  if (!spec.dead) return false;
  if (code === 'ArrowLeft' || code === 'KeyQ') { cycle(-1); return true; }
  if (code === 'ArrowRight' || code === 'KeyE') { cycle(1); return true; }
  if (code === 'Space') {
    if (!spec.freeAllowed) { toast('Свободную камеру для призраков может включить хост', 2000); return true; }
    spec.free = !spec.free;
    if (spec.free) spec.cam = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: me.yaw, pitch: me.pitch };
    return true;
  }
  return false;
}
addEventListener('mousedown', (e) => {
  if (!spec.dead || !S.locked) return;
  if (e.button === 0) cycle(1); else if (e.button === 2) cycle(-1);
});
addEventListener('contextmenu', (e) => { if (S.locked) e.preventDefault(); });

/* --------------------------- Камера зрителя --------------------------- */
const EYE = 1.6;
export function updateSpectator(dt) {
  if (!spec.dead) { $('specBox').style.display = 'none'; return false; }
  const r = remotes.get(spec.watch);
  if (!spec.free && (!r || !r.seen || spec.deadIds.has(spec.watch))) cycle(1);
  const cam = spec.cam || (spec.cam = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: me.yaw, pitch: me.pitch });
  if (spec.free) {
    // свободный полёт сквозь стены
    const sp = (keys.ShiftLeft ? 14 : 6) * dt;
    const fx = -Math.sin(me.yaw) * Math.cos(me.pitch), fy = Math.sin(me.pitch), fz = -Math.cos(me.yaw) * Math.cos(me.pitch);
    const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    const iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    cam.x += (fx * iz + rx * ix) * sp; cam.y += fy * iz * sp; cam.z += (fz * iz + rz * ix) * sp;
    cam.yaw = me.yaw; cam.pitch = me.pitch;
  } else if (r) {
    r.mesh.visible = false; // мы «внутри» него
    spec.blend = Math.min(1, spec.blend + dt * 2.5);
    const k = spec.blend < 1 ? 1 - Math.exp(-10 * dt) : 1;
    const bob = Math.sin(r.walk) * 0.04;
    cam.x += (r.x - cam.x) * k; cam.y += (r.y + (r.crouch ? 0.8 : EYE) + bob - cam.y) * k; cam.z += (r.z - cam.z) * k;
    cam.yaw = lerpAngle(cam.yaw, r.r, k); cam.pitch += ((r.pitch || 0) - cam.pitch) * k;
    FL.on = r.fl; // его фонарик
  }
  camera.position.set(cam.x, cam.y, cam.z);
  camera.rotation.set(cam.pitch, cam.yaw, 0);
  me.x = cam.x; me.y = cam.y - EYE; me.z = cam.z; // карта и миникарта следуют за камерой
  // HUD зрителя
  const box = $('specBox');
  box.style.display = 'block';
  if (spec.free) box.innerHTML = 'ПРИЗРАК · свободная камера<br><small><kbd>WASD</kbd> лететь · <kbd>Пробел</kbd> вернуться к игроку · <kbd>M</kbd> метка на карте · <kbd>Enter</kbd> чат</small>';
  else if (r) {
    const st = spec.stats.get(spec.watch);
    const info = st ? ` · выносливость ${Math.round(st[1] * 100)}% · фонарь ${Math.round(st[2] * 100)}% · пинг ${st[3]} мс` : '';
    box.innerHTML = `ВЫ НАБЛЮДАЕТЕ: <b>${r.name}</b>${info}<br><small><kbd>←</kbd>/<kbd>→</kbd>, <kbd>Q</kbd>/<kbd>E</kbd>, ЛКМ/ПКМ — другой игрок · <kbd>M</kbd> метка-подсказка · <kbd>Enter</kbd> чат</small>`;
  } else box.innerHTML = 'ПРИЗРАК · живых не осталось';
  return true;
}

/* ------------------------------ Метки ------------------------------ */
const marks = [];
function addMark(m) {
  const col = m.ghost ? 0xb090ff : m.kind === 'danger' ? 0xff4030 : m.kind === 'item' ? 0xffd040 : 0x60c0ff;
  const s = glowSprite(col, 1.6, 0.9);
  s.position.set(m.x, m.y + 1.2, m.z);
  s.material.depthTest = false; s.renderOrder = 10;
  scene.add(s);
  marks.push({ s, t: 0, ghost: !!m.ghost, x: m.x, z: m.z, y: m.y, col });
  if (m.ghost) addChat('', `${m.by} (призрак) оставил метку`, true); else toast(`${m.by}: ${m.kind === 'danger' ? 'опасность!' : m.kind === 'item' ? 'предмет' : 'сюда'}`, 1800);
  sfx.beep();
}
export function tickMarks(dt) {
  for (const k of marks) {
    k.t += dt;
    k.s.material.opacity = (k.ghost ? 0.5 + 0.5 * Math.sin(k.t * 9) * Math.sin(k.t * 3.1) : 0.9) * clamp(1 - (k.t - 20) / 5, 0, 1);
    k.s.scale.setScalar(1.4 + Math.sin(k.t * 4) * 0.2);
  }
  for (let i = marks.length - 1; i >= 0; i--) if (marks[i].t > 25) { scene.remove(marks[i].s); marks[i].s.material.dispose(); marks.splice(i, 1); }
}
export const activeMarks = () => marks;

// Метка там, куда смотрит игрок (Z — «сюда», X — «опасность»)
export function placeMarkAhead(kind) {
  const fx = -Math.sin(me.yaw) * Math.cos(me.pitch), fy = Math.sin(me.pitch), fz = -Math.cos(me.yaw) * Math.cos(me.pitch);
  const o = camera.position;
  let d = 0.5;
  for (; d < 40; d += 0.4) if (BR.solidAt(map, o.x + fx * d, o.y + fy * d, o.z + fz * d)) break;
  d = Math.max(0.5, d - 0.5);
  const x = o.x + fx * d, z = o.z + fz * d;
  const g = BR.groundAt(map, x, o.y + fy * d, z, 0.1, 0.5);
  sendNet({ t: 'mark', x, y: Number.isFinite(g) && g > -1e6 ? g : o.y - 1.6, z, kind });
}
