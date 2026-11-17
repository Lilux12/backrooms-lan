// Соединение с сервером и обработка сообщений
import { $, BR, LEVELS } from '../core/util.js';
import { FL, S, UP, keypad, me } from '../core/state.js';
import { scene } from '../render/scene.js';
import { addObj, addObstacleNet, buildWorld, curLevel, map, objs, removeObj, setCellLocal, setWater } from '../world/world.js';
import { refreshObj } from '../world/objects.js';
import { remotes, setPlayers } from '../entities/avatars.js';
import { ensureMob, ensureMobs, mobEnts } from '../entities/mobs.js';
import { playAt, sfx, tone } from '../audio/audio.js';
import { caption, closeKeypad, hideBanner, renderGoals, setStatus, showBanner, showLevelTitle, showNote, toast, updateKeypad } from '../ui/hud.js';
import { beginPlay, noteProgress } from '../ui/menu.js';
import { addJournal } from '../ui/journal.js';
import { checkReader, onAch, onDirectorEvent, onEmote, onHide, onUnhide, unlock } from '../game/extras.js';
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
  myName = name;
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => {
    tries = 0;
    const color = parseInt((localStorage.getItem('br_color') || '#6aa0ff').slice(1), 16);
    ws.send(JSON.stringify({ t: 'join', name, token: adminToken() || undefined, role: localStorage.getItem('br_role') || '', color }));
  };
  ws.onmessage = (e) => onNet(JSON.parse(e.data));
  ws.onclose = () => {
    const was = S.joined;
    S.joined = false;
    if (S.kicked) return;
    // переподключение: сервер помнит игрока по нику ~2 минуты и вернёт на то же место
    if (tries < 20 && (was || tries > 0)) {
      tries++;
      showBanner(`Соединение потеряно. Переподключение… (${tries})<br><small>Если сервер выключен — запустите start.bat и обновите страницу (F5)</small>`);
      setTimeout(() => connect(myName), 2000);
    } else {
      showBanner('Соединение с сервером потеряно.<br><small>Обновите страницу (F5)</small>');
      document.exitPointerLock();
    }
  };
  ws.onerror = () => setStatus('Не удалось подключиться к серверу. Проверьте адрес и что сервер запущен.');
}
let myName = '', tries = 0;
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
      noteProgress(m.level);
      me.stamina = 1; me.exhausted = false;
      S.goalLines = m.goals; S.heldFuses = m.held;
      closeKeypad(); $('note').style.display = 'none';
      setPlayers(m.players); setAdminPlayers(m.players);
      // изменения уровня, случившиеся до нашего подключения: открытые шлюзы, проломы, упавшие каталки
      if (m.cells && m.cells.length) for (const c of m.cells) setCellLocal(c.f, c.i, c.type, c.aux);
      for (const o of m.obst || []) addObstacleNet(o);
      S.cctvUntil = 0; S.blackoutUntil = 0; S.finale = false; S.powered = !!m.powered;
      S.countdownEnd = 0; S.drumUntil = 0; S.drawingsAlive = false; $('countdown').classList.remove('on');
      S.modifier = m.modifier || ''; S.difficulty = m.difficulty || 'normal'; S.role = m.role || ''; S.myDeaths = 0; S.hiding = null;
      $('lockerfx').classList.remove('on');
      $('game').classList.remove('drawings', 'quarantine'); $('gasfx').classList.remove('on');
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
    case 'note': {
      showNote(m.text, m.title); addJournal(m.title || 'Записка', m.text);
      for (const rec of objs.values()) if (rec.o.kind === 'lore' && rec.o.title === m.title) { rec.o._read = true; if (rec.o.egg) unlock('egg'); }
      checkReader();
      break;
    }
    case 'hide': onHide(m); break;
    case 'unhide': onUnhide(m); break;
    case 'emote': onEmote(m); break;
    case 'ach': onAch(m); break;
    case 'cell': setCellLocal(m.f, m.i, m.type, m.aux); break;
    case 'correct': placeMe(m.x, m.y, m.z); break; // сервер не принял перемещение (античит/рассинхрон)
    case 'codeok': closeKeypad(); sfx.beep(); break;
    case 'codebad': keypad.buf = ''; updateKeypad(); tone(m.off ? 90 : 150, 0.5, 0.3, 'sawtooth'); break;
    case 'alarm': S.alarmUntil = performance.now() / 1000 + 6; sfx.alarm(); toast('СИРЕНА! Существа идут на шум!', 3500); break;
    case 'sfx': {
      if (!sfx[m.name]) break;
      // звук с точкой: 3D (направление и затухание), дальше 70 м не слышно
      if (m.x != null) {
        const d = Math.hypot(m.x - me.x, (m.y - me.y) * 1.5, m.z - me.z);
        if (d > 70) break;
        playAt(m.x, m.y + 1, m.z, () => sfx[m.name](1));
        caption(m.name, m.x, m.z);
      } else { sfx[m.name](); caption(m.name); }
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
    case 'done': {
      sfx.win();
      S.countdownEnd = 0; S.drumUntil = 0; $('countdown').classList.remove('on');
      const st = m.stats || {};
      const stats = `<span class="endstats">время ${Math.floor((st.time || 0) / 60)}:${String((st.time || 0) % 60).padStart(2, '0')} · смертей ${st.deaths || 0} · записок ${st.notes || 0}` + (st.exposed ? ` · двойников разоблачено ${st.exposed}` : '') + '</span>';
      // достижения за уровень
      unlock('first');
      if (!S.myDeaths) unlock('nodeath');
      if ((st.time || 999) < 180) unlock('speed');
      if (m.last) unlock(m.ending === 'stay' ? 'stay' : 'escape');
      let html;
      if (!m.last) html = `УРОВЕНЬ ПРОЙДЕН<br><small>Дальше: ${m.next}</small>${stats}`;
      else if (m.ending === 'stay') html = `${m.by || 'Кто-то'} ОСТАЛСЯ НАДСМОТРЩИКОМ<br><small>Кресло тёплое. Пульт гудит. Где-то загорелись жёлтые лампы, и новые люди проснулись на мокром ковре.<br>Фабрика будет работать вечно — теперь её строите вы.<br>Игра начнётся заново.</small>${stats}`;
      else html = `ФАБРИКА РАЗРУШЕНА<br><small>Вы вышли под чёрное небо, и Закулисье рассыпалось за спиной, как старые обои.<br>Солнечный свет. Шум машин. Ваш дом…<br>…но в коридоре гудит лампа. Игра начнётся заново.</small>${stats}`;
      showBanner(html);
      break;
    }
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
  if (onDirectorEvent(m)) return; // шёпот, шаги, лицо в обоях, звонок, мигание
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
    case 'power': S.powered = true; sfx.zap(); break;
    case 'glitch': {
      me.shake = Math.max(me.shake || 0, 0.5); sfx.glitch(); sfx.whisper();
      const fl = $('flash'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 120);
      break;
    }
    case 'quarantine': {
      S.quarantineUntil = now + (m.dur || 25); sfx.alarm(); $('game').classList.add('quarantine');
      setTimeout(() => $('game').classList.remove('quarantine'), (m.dur || 25) * 1000);
      break;
    }
    case 'gas': $('gasfx').classList.add('on'); sfx.cough(); setTimeout(() => sfx.cough(), 1500); setTimeout(() => $('gasfx').classList.remove('on'), (m.dur || 8) * 1000); break;
    case 'countdown': {
      S.countdownEnd = now + m.left;
      $('countdown').classList.add('on');
      if (m.left <= 10) sfx.tick();
      break;
    }
    case 'flash': { const fl = $('flash'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 900); sfx.boom(1); break; }
    case 'drawings': S.drawingsAlive = true; $('game').classList.add('drawings'); sfx.giggle(); break;
    case 'drum': S.drumUntil = now + 9999; break;
    case 'conveyor': sfx.clang(); setTimeout(() => sfx.clang(), 300); break;
    case 'caralarms': for (let k = 0; k < 3; k++) setTimeout(() => sfx.caralarm(0.7), k * 400); toast('Генератор взревел — по всей парковке воют сигнализации!', 3500); break;
  }
}

setInterval(() => {
  if (S.joined && !spec.dead) sendNet({ t: 'p', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), r: +me.yaw.toFixed(3), pi: +me.pitch.toFixed(2), f: FL.on ? 1 : 0, c: me.body && me.body.crouch ? 1 : 0, st: +me.stamina.toFixed(2), bt: +FL.bat.toFixed(2) });
}, 50);
