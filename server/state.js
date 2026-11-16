'use strict';
// Общее изменяемое состояние сервера.
module.exports = {
  G: null,                // текущий уровень (создаётся в game.startLevel)
  TEAM: { map: false },   // улучшения команды, сохраняются между уровнями
};
