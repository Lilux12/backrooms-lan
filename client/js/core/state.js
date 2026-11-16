// Изменяемое состояние клиента, общее для всех модулей

// Флаги сессии. Меняются из разных модулей, поэтому лежат в одном объекте.
export const S = {
  myId: 0, started: false, joined: false, locked: false,
  goalLines: [], heldFuses: 0,
  bigOn: false, mmOn: true, alarmUntil: 0,
  time: 0, // игровое время в секундах (для анимаций)
};
export const me = { x: 0, z: 0, yaw: 0, pitch: 0, stamina: 1, exhausted: false, bob: 0, stepPhase: 0, fov: 75 };
export const keypad = { open: false, buf: '' };
export const UP = { map: false };
export const FL = { on: false, bat: 1, k: 0 };
export const keys = {};
