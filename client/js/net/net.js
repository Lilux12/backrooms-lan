// Соединение с сервером и обработка сообщений
import { $, LEVELS } from '../core/util.js';
import { FL, S, UP, keypad, me } from '../core/state.js';
import { scene } from '../render/scene.js';
import { buildWorld, curLevel, objs, removeObj, setCellLocal, setWater } from '../world/world.js';
import { refreshObj } from '../world/objects.js';
import { remotes, setPlayers } from '../entities/avatars.js';
import { ensureMob, ensureMobs, mobEnts } from '../entities/mobs.js';
import { sfx, tone } from '../audio/audio.js';
import { closeKeypad, hideBanner, renderGoals, setStatus, showBanner, showLevelTitle, showNote, toast, updateKeypad } from '../ui/hud.js';
import { beginPlay } from '../ui/menu.js';
import { placeMe } from '../game/player.js';
import { onSocialNet, social } from '../game/social.js';
import { closeBigMap } from '../ui/maps.js';

/* ============================== Сеть ============================== */
let ws = null;
const MOB_TYPES = ['stalker', 'runner', 'drowner', 'skinstealer']; // как на сервере (server/game.js)
export function connect(name) {
  if (location.protocol === 'file:') {
    setStatus('Откройте игру через сервер: запустите start.bat (адрес http://localhost:3000)');
    return;
  }
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
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
  if (onSocialNet(m)) return;
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
      me.stamina = 1; me.exhausted = false;
      S.goalLines = m.goals; S.heldFuses = m.held;
      closeKeypad(); $('note').style.display = 'none';
      setPlayers(m.players);
      hideBanner(); renderGoals();
      showLevelTitle(m.level);
      S.joined = true;
      if (!S.started) beginPlay();
      break;
    }
    case 'players': setPlayers(m.list); break;
    case 's': {
      for (const [id, x, y, z, r, fl, cr] of m.p) {
        const rem = remotes.get(id);
        if (!rem) continue;
        rem.tx = x; rem.ty = y; rem.tz = z; rem.tr = r; rem.fl = !!fl; rem.crouch = !!cr;
        if (!rem.seen) { rem.x = x; rem.y = y; rem.z = z; rem.r = r; rem.seen = true; rem.mesh.visible = true; }
        rem.snapT = performance.now();
      }
      // кого нет в снапшоте (например, сидит в клетке) — не рисуем
      for (const rem of remotes.values()) if (rem.seen && performance.now() - (rem.snapT || 0) > 400) { rem.seen = false; rem.mesh.visible = false; }
      m.m.forEach(([x, y, z, r, chase, stun, type], i) => {
        const mo = ensureMob(i, MOB_TYPES[type] || 'stalker');
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
    case 'codebad': keypad.buf = ''; updateKeypad(); tone(150, 0.5, 0.3, 'sawtooth'); break;
    case 'alarm': S.alarmUntil = performance.now() / 1000 + 6; sfx.alarm(); toast('СИРЕНА! Существа идут на шум!', 3500); break;
    case 'sfx': if (sfx[m.name]) sfx[m.name](); break;
    case 'caught': {
      placeMe(m.x, m.y, m.z);
      sfx.caught();
      const fl = $('flash'); fl.classList.add('on');
      setTimeout(() => fl.classList.remove('on'), 80);
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
    case 'cageview': {
      const rec = objs.get(m.id);
      if (rec && rec.parts.setPrisoner) rec.parts.setPrisoner(m.name);
      break;
    }
  }
}

setInterval(() => {
  if (S.joined) sendNet({ t: 'p', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), r: +me.yaw.toFixed(3), f: FL.on ? 1 : 0, c: me.body && me.body.crouch ? 1 : 0 });
}, 50);
