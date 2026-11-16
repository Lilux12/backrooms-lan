// Игрок: фонарик, движение, камера
import { BR, LEVELS } from '../core/util.js';
import { settings } from '../core/settings.js';
import { FL, S, keypad, keys, me } from '../core/state.js';
import { camera } from '../render/scene.js';
import { curLevel, map } from '../world/world.js';
import { sfx } from '../audio/audio.js';
import { toast } from '../ui/hud.js';

export function toggleTorch() {
  if (!FL.on && FL.bat < 0.04) { toast('Батарея села — подождите', 1800); return; }
  FL.on = !FL.on; sfx.fl();
}

// Движение игрока по клавишам и выносливость. Возвращает, идёт ли игрок и бежит ли.
export function updateMovement(dt) {
  let moving = false, sprint = false;
  const frozen = keypad.open || S.bigOn;
  if (!(S.joined && map && S.locked && !frozen)) return { moving, sprint };
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1;
  if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  moving = !!(ix || iz);
  const len = Math.hypot(ix, iz) || 1; ix /= len; iz /= len;
  sprint = moving && (keys.ShiftLeft || keys.ShiftRight) && !me.exhausted && me.stamina > 0;
  const spd = sprint ? 6.2 : 3.6;
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
  const p = BR.move(map, me.x, me.z, (fx * iz + rx * ix) * spd * dt, (fz * iz + rz * ix) * spd * dt, 0.38);
  me.x = p.x; me.z = p.z;

  if (LEVELS[curLevel].infStamina) { me.stamina = 1; me.exhausted = false; }
  else if (sprint) { me.stamina -= dt / 4.5; if (me.stamina <= 0) { me.stamina = 0; me.exhausted = true; } }
  else { me.stamina = Math.min(1, me.stamina + dt / (moving ? 7 : 4)); if (me.exhausted && me.stamina > 0.3) me.exhausted = false; }

  if (moving) {
    me.bob += dt * (sprint ? 12 : 8);
    const phase = Math.floor(me.bob / Math.PI);
    if (phase !== me.stepPhase) { me.stepPhase = phase; sfx.step(sprint); }
  }
  return { moving, sprint };
}

// Камера от первого лица: покачивание при ходьбе, расширение FOV при беге
export function updateCamera(dt, moving, sprint) {
  const bobY = moving ? Math.sin(me.bob) * (sprint ? 0.075 : 0.045) : 0;
  const bobX = moving ? Math.cos(me.bob * 0.5) * 0.03 : 0;
  camera.position.set(me.x + bobX, 1.7 + bobY, me.z);
  camera.rotation.set(me.pitch, me.yaw, 0);
  me.fov += ((sprint ? settings.fov + 7 : settings.fov) - me.fov) * Math.min(1, dt * 8);
  if (Math.abs(camera.fov - me.fov) > 0.05) { camera.fov = me.fov; camera.updateProjectionMatrix(); }
}

// Батарея фонарика: садится при работе, сама восстанавливается
export function updateBattery(dt) {
  if (FL.on) { FL.bat -= dt / 200; if (FL.bat <= 0) { FL.bat = 0; FL.on = false; sfx.fl(); toast('Батарея фонарика села — подождите, она восстановится', 3000); } }
  else FL.bat = Math.min(1, FL.bat + dt / 150);
}
