// Игрок: фонарик, движение (общая физика из shared/world.js), кислород, падения, камера
import { $, BR, LEVELS, clamp } from '../core/util.js';
import { settings } from '../core/settings.js';
import { FL, S, keypad, keys, me } from '../core/state.js';
import { camera } from '../render/scene.js';
import { curLevel, map } from '../world/world.js';
import { sfx } from '../audio/audio.js';
import { toast } from '../ui/hud.js';
import { sendNet } from '../net/net.js';
import { social } from './social.js';
import { W, myMods, padUnder } from './worldfx.js';

const WALK = 3.6, RUN = 6.2;
const O2_TIME = 25;           // секунд под водой до потери сознания
const O2_REFILL = 6;          // секунд, чтобы полностью отдышаться
const HARD_FALL = 4.5;        // с такой высоты приземление оглушает
const EYE = 1.6, EYE_CROUCH = 0.8;

export function toggleTorch() {
  if (myMods().notorch) { toast('Хост забрал у вас фонарик', 1800); FL.on = false; return; }
  if (!FL.on && FL.bat < 0.04) { toast('Батарея села — подождите', 1800); return; }
  FL.on = !FL.on; sfx.fl();
}

// Поставить игрока в точку (старт, телепорт)
export function placeMe(x, y, z) {
  me.body = BR.makeBody(x, y, z);
  me.x = x; me.y = y; me.z = z;
  me.o2 = 1; me.drowning = false; me.stunned = 0;
}

// Вытолкнуть из круглых препятствий (мебель на уровне «Беги!»)
function pushOutObstacles(b) {
  for (const o of map.obst || []) {
    const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz), min = o.r + BR.PHYS.R;
    if (d < min && d > 0.001 && Math.abs(b.y - map.spawn.y) < 1.5) { b.x = o.x + (dx / d) * min; b.z = o.z + (dz / d) * min; }
  }
}

// Движение игрока по клавишам и выносливость. Возвращает, идёт ли игрок и бежит ли.
export function updateMovement(dt) {
  let moving = false, sprint = false;
  if (!(S.joined && map && me.body)) return { moving, sprint };
  const b = me.body;
  const md = myMods();
  const active = S.locked && !keypad.open && !S.bigOn && !social.caged && !md.frozen && !S.adminOpen;
  let ix = 0, iz = 0;
  if (active) {
    if (keys.KeyW || keys.ArrowUp) iz += 1;
    if (keys.KeyS || keys.ArrowDown) iz -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (W.invert) { ix = -ix; iz = -iz; } // хост перевернул управление
  }
  moving = !!(ix || iz);
  const len = Math.hypot(ix, iz) || 1; ix /= len; iz /= len;
  const crouch = active && !!keys.KeyC;
  sprint = moving && active && (keys.ShiftLeft || keys.ShiftRight) && !me.exhausted && me.stamina > 0 && !crouch && !b.swim;
  let spd = (sprint ? RUN : WALK) * (md.speed || 1);
  if (me.stunned > 0) { me.stunned -= dt; spd *= 0.45; }
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
  const onLadder = b.ladder >= 0;
  const inp = {
    vx: (fx * iz + rx * ix) * spd, vz: (fz * iz + rz * ix) * spd,
    jump: active && !!keys.Space,
    // на лестнице W/S — вверх/вниз; в воде Пробел/C — всплыть/нырнуть
    up: active && (onLadder ? (keys.KeyW || keys.ArrowUp || keys.Space) : keys.Space),
    down: active && (onLadder ? (keys.KeyS || keys.ArrowDown || keys.KeyC) : (b.swim && keys.KeyC)),
    crouch: crouch && !b.swim && !onLadder,
  };
  if (me.knock && me.knock.t > 0) { inp.vx += me.knock.vx; inp.vz += me.knock.vz; me.knock.t -= dt; } // отбросило взрывом
  inp.jumpMul = md.jump || 1; inp.grav = W.gravity;
  let res = { landed: 0 };
  if (md.fly || md.noclip) {
    // полёт: Пробел — вверх, C — вниз; сквозь стены — без столкновений
    const vy = active ? ((keys.Space ? 1 : 0) - (keys.KeyC ? 1 : 0)) * spd : 0;
    const nx = b.x + inp.vx * dt, ny = b.y + vy * dt, nz = b.z + inp.vz * dt;
    const free = (x, y, z) => md.noclip || !BR.blocked(map, x, y, z, BR.PHYS.R, BR.PHYS.H, 0.05);
    if (free(nx, b.y, b.z)) b.x = nx;
    if (free(b.x, b.y, nz)) b.z = nz;
    if (free(b.x, ny, b.z)) b.y = ny;
    b.vy = 0; b.onGround = false; b.fallTop = b.y;
  } else {
    res = BR.moveBody(map, b, inp, dt);
    if (b.onGround && padUnder(b.x, b.y, b.z)) { b.vy = 14; b.onGround = false; sfx.boing(); } // батут
  }
  pushOutObstacles(b);
  me.x = b.x; me.y = b.y; me.z = b.z;
  if (res.landed > 1.2) sendNet({ t: 'fall', h: +res.landed.toFixed(2) }); // сервер решит, смертельно ли
  if (res.landed > HARD_FALL) {
    me.stunned = 1.2; me.shake = 0.5;
    sfx.thump(1.2); sfx.caught();
    toast('Тяжёлое приземление!', 1500);
  } else if (res.landed > 1.2) { sfx.thump(0.6); me.shake = 0.2; }

  // Кислород под водой
  if (b.underwater) {
    me.o2 = Math.max(0, me.o2 - dt / O2_TIME);
    if (me.o2 <= 0 && !me.drowning) { me.drowning = true; sendNet({ t: 'drown' }); }
  } else {
    me.o2 = Math.min(1, me.o2 + dt / O2_REFILL);
    me.drowning = false;
  }

  if (LEVELS[curLevel].infStamina) { me.stamina = 1; me.exhausted = false; }
  else if (sprint) { me.stamina -= dt / 4.5; if (me.stamina <= 0) { me.stamina = 0; me.exhausted = true; } }
  else { me.stamina = Math.min(1, me.stamina + dt / (moving ? 7 : 4)); if (me.exhausted && me.stamina > 0.3) me.exhausted = false; }

  if (moving && (b.onGround || b.swim || onLadder)) {
    me.bob += dt * (sprint ? 12 : b.crouch ? 5 : 8);
    const phase = Math.floor(me.bob / Math.PI);
    if (phase !== me.stepPhase) { me.stepPhase = phase; if (!b.swim) sfx.step(sprint); }
  }
  $('underwater').style.opacity = b.underwater ? '1' : '0';
  return { moving, sprint };
}

// Камера от первого лица: покачивание при ходьбе, расширение FOV при беге, тряска при падении
let eye = EYE;
export function updateCamera(dt, moving, sprint) {
  const b = me.body;
  const bobY = moving ? Math.sin(me.bob) * (sprint ? 0.075 : 0.045) : 0;
  const bobX = moving ? Math.cos(me.bob * 0.5) * 0.03 : 0;
  eye += ((b && b.crouch ? EYE_CROUCH : EYE) * (myMods().size || 1) - eye) * Math.min(1, dt * 10);
  me.shake = Math.max(0, (me.shake || 0) - dt);
  const sh = me.shake * 0.3;
  camera.position.set(me.x + bobX + (Math.random() - 0.5) * sh, me.y + eye + bobY + (Math.random() - 0.5) * sh, me.z);
  camera.rotation.set(me.pitch, me.yaw, 0);
  const baseFov = W.fov || settings.fov; // хост может задать угол обзора всем
  me.fov += ((sprint ? baseFov + 7 : baseFov) - me.fov) * Math.min(1, dt * 8);
  if (Math.abs(camera.fov - me.fov) > 0.05) { camera.fov = me.fov; camera.updateProjectionMatrix(); }
}

// Батарея фонарика: садится при работе, сама восстанавливается
export function updateBattery(dt) {
  if (FL.on) { FL.bat -= dt / 200; if (FL.bat <= 0) { FL.bat = 0; FL.on = false; sfx.fl(); toast('Батарея фонарика села — подождите, она восстановится', 3000); } }
  else FL.bat = Math.min(1, FL.bat + dt / 150);
}

export const oxygen = () => clamp(me.o2 == null ? 1 : me.o2, 0, 1);
