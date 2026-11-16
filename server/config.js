'use strict';
// Настройки сервера. Значения можно переопределить переменными окружения.
const BR = require('../shared/map.js');

const env = process.env;
module.exports = {
  PORT: +env.PORT || 3000,
  START_LEVEL: Math.max(0, Math.min(BR.LEVELS.length - 1, +env.START_LEVEL || 0)),
  TICK_MS: 50,              // период серверного тика (20 Гц)
  MAX_MESSAGE: 1 << 20,     // максимальный размер WebSocket-сообщения, байт
  // Отладка: появиться рядом с объектом этого типа; карта всегда выпадает
  TEST_NEAR: env.TEST_NEAR || '',
  FORCE_MAP: !!env.FORCE_MAP,
  TEST_HOOKS: !!env.TEST_HOOKS, // отладочные команды для автотестов — в игре не включать
};
