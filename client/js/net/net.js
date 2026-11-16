// Соединение с сервером и обработка сообщений
import { $, BR, LEVELS } from '../core/util.js';
import { FL, S, UP, keypad, me } from '../core/state.js';
import { scene } from '../render/scene.js';
import { addObj, addObstacleNet, buildWorld, curLevel, map, objs, removeObj, setCellLocal, setWater } from '../world/world.js';
import { refreshObj } from '../world/objects.js';
import { remotes, setPlayers } from '../entities/avatars.js';
import { ensureMob, ensureMobs, mobEnts } from '../entities/mobs.js';
import { sfx, tone } from '../audio/audio.js';
import { closeKeypad, hideBanner, renderGoals, setStatus, showBanner, showLevelTitle, showNote, toast, updateKeypad } from '../ui/hud.js';
import { beginPlay } from '../ui/menu.js';
import { placeMe } from '../game/player.js';
import { onSocialNet, social } from '../game/social.js';
import { onSpectatorNet, spec } from '../game/spectator.js';
import { applyWorld, onWorldNet } from '../game/worldfx.js';
import { adminToken, onAdminNet, setAdminPlayers } from '../ui/admin.js';
import { closeBigMap } from '../ui/maps.js';

/* ============================== Сеть ============================== */
let ws = null;
const MOB_TYPES = BR.MOB_TYPES; // общий список с сервером (shared/core.js)
export function connect(name) {
  if (location.protocol === 'file:') {
    setStatus('Откройте игру через сервер: запустите start.bat (адрес http://localhost:3000)');
    return;
  }
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, token: adminToken() || undefined }));
  ws.onmessage = (e) => onNet(JSON.parse(e.data));
  ws.onclose = () => {
    S.joined = false;
    showBanner('Соединение с сервером потеряно.<br><small>Обновите страницу (F5)</small>');
    document.exitPointerLock();
  };
  ws.onerror = () => setStatus('Не удалось подключиться к серверу');
}
export const sendNet = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };



function onNet(m) {
  if (onSocialNet(m) || onSpectatorNet(m) || onWorldNet(m) || onAdminNet(m)) return;
  switch (m.t) {
    case 'init': {
      S.myId = m.id;
      const built = buildWorld(m.level, m.seed, m.objs, m.wl);
      sendNet({ t: 'hash', level: m.level, hash: built.hash }); // сервер сверит геометрию
      for (const r of remotes.values()) scene.remove(r.mesh);
      remotes.clear();
      ensureMobs(0);
      UP.map = !!(m.upgrades && m.upgrades.map);
      closeBigMap();
      if (LEVELS[m.level].chase) FL.on = false;
      placeMe(m.spawn.x, m.spawn.y, m.spawn.z); me.yaw = Math.PI * 0.5; me.pitch = 0;
      social.caged = 0; $('cagedBox').style.display = 'none';
      spec.dead = false; spec.free = false; spec.watch = null; spec.deadIds = new Set(m.dead || []);
      if (m.world) applyWorld(m.world);
      S.admin = !!m.admin;
      me.stamina = 1; me.exhausted = false;
      S.goalLines = m.goals; S.heldFuses = m.held;
      closeKeypad(); $('note').style.display = 'none';
      setPlayers(m.players); setAdminPlayers(m.players);
      // изменения уровня, случившиеся до нашего подключения: открытые шлюзы, проломы, упавшие каталки
      if (m.cells && m.cells.length) for (const c of m.cells) setCellLocal(c.f, c.i, c.type, c.aux);
      for (const o of m.obst || []) addObstacleNet(o);
      S.cctvUntil = 0; S.blackoutUntil = 0; S.finale = false;
      hideBanner(); renderGoals();
      showLevelTitle(m.level);
      S.joined = true;
      if (!S.started) beginPlay();
      break;
    }
    case 'players': setPlayers(m.list); setAdminPlayers(m.list); break;
    case 's': {
      for (const [id, x, y, z, r, fl, cr, pi] of m.p) {
        const rem = remotes.get(id);
        if (!rem) continue;
        rem.tx = x; rem.ty = y; rem.tz = z; rem.tr = r; rem.fl = !!fl; rem.crouch = !!cr; rem.pitch = pi || 0;
        if (!rem.seen) { rem.x = x; rem.y = y; rem.z = z; rem.r = r; rem.seen = true; rem.mesh.visible = true; }
        rem.snapT = performance.now();
      }
      // кого нет в снапшоте (например, сидит в клетке) — не рисуем
      for (const rem of remotes.values()) if (rem.seen && performance.now() - (rem.snapT || 0) > 400) { rem.seen = false; rem.mesh.visible = false; }
      m.m.forEach(([x, y, z, r, chase, stun, type, scale], i) => {
        const mo = ensureMob(i, MOB_TYPES[type] || 'stalker');
        mo.scale = scale || 1;
        mo.tx = x; mo.ty = y; mo.tz = z; mo.tr = r; mo.chase = !!chase; mo.stun = !!stun;
        if (!mo.seen) { mo.x = x; mo.y = y; mo.z = z; mo.r = r; mo.seen = true; mo.group.visible = true; }
      });
      break;
    }
    case 'obj': {
      const rec = objs.get(m.id);
      if (!rec) break;
      const wasOpen = rec.o.open;
      Object.assign(rec.o, m.p);
      refreshObj(rec);
      if (rec.o.kind === 'door' && rec.o.open && !wasOpen) sfx.door();
      if (rec.o.kind === 'plate') sfx.click();
      break;
    }
    case 'pick': {
      removeObj(m.id);
      m.kind === 'fuse' ? sfx.fuse() : sfx.pickup();
      if (m.kind === 'fuse' || m.kind === 'water') toast(m.kind === 'fuse' ? `${m.by} нашёл предохранитель` : `${m.by} нашёл воду`, 2000);
      break;
    }
    case 'upgrade':
      if (m.what === 'nomap') { UP.map = false; closeBigMap(); break; }
      UP.map = true; sfx.win();
      toast(`${m.by} нашёл УЛУЧШЕННУЮ КАРТУ! M — карта на весь экран, существа видны на ней`, 6000);
      break;
    case 'stamina': me.stamina = 1; me.exhausted = false; toast('Вода: выносливость восстановлена', 2000); break;
    case 'goal': {
      S.goalLines = m.lines; S.heldFuses = m.held; renderGoals();
      for (const rec of objs.values()) {
        if (rec.o.kind === 'box') rec.parts.screen.material.color.setHex(S.goalLines.some((l) => l.startsWith('Предохранители') && l.includes('✔')) ? 0x30ff60 : 0xff3020);
        if (rec.o.kind === 'keypad') rec.parts.screen.material.color.setHex(S.goalLines.some((l) => l.startsWith('Код') && l.includes('✔')) ? 0x30ff60 : 0xff3020);
      }
      break;
    }
    case 'note': showNote(m.text, m.title); break;
    case 'cell': setCellLocal(m.f, m.i, m.type, m.aux); break;
    case 'codeok': closeKeypad(); sfx.beep(); break;
    case 'codebad': keypad.buf = ''; updateKeypad(); tone(m.off ? 90 : 150, 0.5, 0.3, 'sawtooth'); break;
    case 'alarm': S.alarmUntil = performance.now() / 1000 + 6; sfx.alarm(); toast('СИРЕНА! Существа идут на шум!', 3500); break;
    case 'sfx': {
      if (!sfx[m.name]) break;
      // звук с точкой: дальше 60 м не слышно, ближе — громкость по расстоянию
      if (m.x != null) {
        const d = Math.hypot(m.x - me.x, (m.y - me.y) * 1.5, m.z - me.z);
        if (d > 60) break;
        sfx[m.name](Math.max(0.15, 1 - d / 60));
      } else sfx[m.name]();
      break;
    }
    case 'event': onEvent(m); break;
    case 'cctv': S.cctvUntil = performance.now() / 1000 + m.dur; sfx.beep(); break;
    case 'obst': addObstacleNet(m.o); if (Math.hypot(m.o.x - me.x, m.o.z - me.z) < 30) sfx.crash(); break;
    case 'caught': {
      placeMe(m.x, m.y, m.z);
      sfx.caught();
      const fl = $('flash'); fl.classList.add('on');
      setTimeout(() => fl.classList.remove('on'), 80);
      if (m.reason === 'lift' || m.reason === 'admin') { sfx.lift(); break; }
      toast({ drown: 'Вы захлебнулись и очнулись в другом месте…', stuck: 'Вы вернулись к началу уровня', caught: 'Существо поймало вас! Вы очнулись в другом месте…' }[m.reason] || 'Вы очнулись в другом месте…', 3500);
      break;
    }
    case 'done':
      sfx.win();
      showBanner(m.last
        ? 'ВЫ ВЫБРАЛИСЬ ИЗ ЗАКУЛИСЬЯ<br><small>Но стены так похожи на те, с которых вы начинали…<br>Игра начнётся заново.</small>'
        : `УРОВЕНЬ ПРОЙДЕН<br><small>Дальше: ${m.next}</small>`);
      break;
    case 'ev': toast(m.text, 3000); break;
    case 'water': setWater(m.wl); break;
    case 'add': addObj(m.o); break;
    case 'cageview': {
      const rec = objs.get(m.id);
      if (rec && rec.parts.setPrisoner) rec.parts.setPrisoner(m.name);
      break;
    }
  }
}

// События уровня от сервера: свет гаснет, тряска, пар, пролом, финальный побег
function onEvent(m) {
  const now = performance.now() / 1000;
  switch (m.k) {
    case 'blackout': S.blackoutUntil = now + (m.dur || 3); sfx.zap(); toast('Перегрузка! Свет погас…', 2500); break;
    case 'quake': me.shake = Math.max(me.shake || 0, 0.4 * (m.dur || 1)); sfx.rumble(); break;
    case 'steam': sfx.steam(); toast('Трубы зашипели — пошёл пар', 2500); break;
    case 'smash': {
      const d = Math.hypot(m.x - me.x, m.z - me.z);
      sfx.boom(Math.max(0.2, 1 - d / 50)); if (d < 20) me.shake = Math.max(me.shake || 0, 0.6 * (1 - d / 20));
      break;
    }
    case 'finale': S.finale = true; sfx.roar(); toast('Они почуяли, что вы уходите! БЕГИТЕ К ВЫХОДУ!', 4000); break;
    case 'caralarms': for (let k = 0; k < 3; k++) setTimeout(() => sfx.caralarm(0.7), k * 400); toast('Генератор взревел — по всей парковке воют сигнализации!', 3500); break;
  }
}

setInterval(() => {
  if (S.joined && !spec.dead) sendNet({ t: 'p', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), r: +me.yaw.toFixed(3), pi: +me.pitch.toFixed(2), f: FL.on ? 1 : 0, c: me.body && me.body.crouch ? 1 : 0, st: +me.stamina.toFixed(2), bt: +FL.bat.toFixed(2) });
}, 50);
