// Спецификация админ-команд хоста: по ней клиент рисует панель, а сервер проверяет аргументы.
// Типы аргументов: player (id игрока или 'all'/'me'), num (min..max), bool, select (options), text, level, int.
(function (root) {
  'use strict';
  const BR = (typeof module === 'object' && module.exports) ? require('./core.js') : root.BR;

  const ITEMS = [['detector', 'детектор'], ['noise', 'шумелка'], ['medkit', 'аптечка'], ['fuse', 'предохранитель'], ['map', 'улучшенная карта']];
  const SKINS = [['human', 'человек'], ['duck', 'утка'], ['cube', 'куб'], ['banana', 'банан']];
  const MOBS = [['stalker', 'Сталкер'], ['runner', 'Улыбающийся'], ['drowner', 'Утопленник'], ['skinstealer', 'Skin Stealer']];
  const FILTERS = [['none', 'нет'], ['8bit', '8-бит'], ['bw', 'ч/б'], ['night', 'ночное зрение'], ['vhs', 'VHS']];
  const RAIN = [['water', 'вода'], ['medkit', 'аптечки'], ['noisemaker', 'шумелки'], ['fuse', 'предохранители']];

  const P = { n: 'id', t: 'player', label: 'игрок' };
  const ON = { n: 'on', t: 'bool', label: 'вкл' };
  const num = (n, label, min, max, def) => ({ n, t: 'num', label, min, max, def });
  const sel = (n, label, options) => ({ n, t: 'select', label, options });

  // tab: players | world | mobs | fun; notice — что увидят игроки ({name} — имя игрока, {v} — значение)
  const COMMANDS = [
    // ---- Игроки ----
    { cmd: 'bring', tab: 'players', label: 'Телепорт игрока ко мне', args: [P], notice: 'Хост призвал {name}' },
    { cmd: 'goto', tab: 'players', label: 'Телепорт к игроку', args: [P], notice: 'Хост телепортировался к {name}' },
    { cmd: 'kick', tab: 'players', label: 'Кик', args: [P], notice: 'Хост выгнал {name}' },
    { cmd: 'ban', tab: 'players', label: 'Бан (до перезапуска сервера)', args: [P], notice: 'Хост забанил {name}' },
    { cmd: 'revive', tab: 'players', label: 'Оживить', args: [P], notice: 'Хост оживил {name}' },
    { cmd: 'kill', tab: 'players', label: 'Убить', args: [P], notice: 'Хост убил {name}' },
    { cmd: 'god', tab: 'players', label: 'Бессмертие', args: [P, ON], notice: 'Бессмертие {name}: {on}' },
    { cmd: 'invis', tab: 'players', label: 'Невидим для существ', args: [P, ON], notice: 'Существа не видят {name}: {on}' },
    { cmd: 'speed', tab: 'players', label: 'Скорость', args: [P, num('v', '×', 0.2, 5, 1)], notice: 'Скорость {name} ×{v}' },
    { cmd: 'jump', tab: 'players', label: 'Прыжок', args: [P, num('v', '×', 0.2, 5, 1)], notice: 'Прыжок {name} ×{v}' },
    { cmd: 'fly', tab: 'players', label: 'Полёт', args: [P, ON], notice: 'Полёт {name}: {on}' },
    { cmd: 'noclip', tab: 'players', label: 'Сквозь стены', args: [P, ON], notice: 'Noclip {name}: {on}' },
    { cmd: 'size', tab: 'players', label: 'Размер', args: [P, num('v', '×', 0.3, 3, 1)], notice: 'Размер {name} ×{v}' },
    { cmd: 'skin', tab: 'players', label: 'Облик', args: [P, sel('v', 'облик', SKINS)], notice: '{name} теперь — {v}' },
    { cmd: 'color', tab: 'players', label: 'Цвет', args: [P, { n: 'v', t: 'color', label: 'цвет' }], notice: 'Хост перекрасил {name}' },
    { cmd: 'give', tab: 'players', label: 'Выдать предмет', args: [P, sel('item', 'предмет', ITEMS)], notice: 'Хост выдал {name}: {item}' },
    { cmd: 'take', tab: 'players', label: 'Забрать предмет', args: [P, sel('item', 'предмет', ITEMS)], notice: 'Хост забрал у {name}: {item}' },
    { cmd: 'torch', tab: 'players', label: 'Фонарик', args: [P, ON], notice: 'Фонарик {name}: {on}' },
    { cmd: 'freeze', tab: 'players', label: 'Заморозить', args: [P, ON], notice: 'Заморозка {name}: {on}' },
    { cmd: 'say', tab: 'players', label: 'Сообщение всем', args: [{ n: 'text', t: 'text', label: 'текст' }], notice: null },
    // ---- Мир ----
    { cmd: 'level', tab: 'world', label: 'Уровень', args: [{ n: 'v', t: 'level', label: 'уровень' }], notice: 'Хост запустил уровень {v}' },
    { cmd: 'seed', tab: 'world', label: 'Перезапуск с seed', args: [{ n: 'v', t: 'int', label: 'seed', min: 0, max: 2147483647 }], notice: 'Хост перезапустил уровень (seed {v})' },
    { cmd: 'restart', tab: 'world', label: 'Перезапустить уровень', args: [], notice: 'Хост перезапустил уровень' },
    { cmd: 'skip', tab: 'world', label: 'Пропустить уровень', args: [], notice: 'Хост пропустил уровень' },
    { cmd: 'open', tab: 'world', label: 'Открыть выход', args: [], notice: 'Хост открыл выход' },
    { cmd: 'solve', tab: 'world', label: 'Решить головоломку', args: [], notice: 'Хост решил головоломку' },
    { cmd: 'tpxy', tab: 'world', label: 'Телепорт по карте (клик)', args: [num('x', 'x', 0, 180, 6), num('z', 'z', 0, 180, 6), num('f', 'этаж', 0, 8, 0)], notice: null, hidden: true },
    { cmd: 'light', tab: 'world', label: 'Яркость света', args: [num('v', '×', 0, 3, 1)], notice: 'Хост изменил свет: ×{v}' },
    { cmd: 'lights', tab: 'world', label: 'Свет на уровне', args: [ON], notice: 'Хост {on:включил:выключил} свет' },
    { cmd: 'flicker', tab: 'world', label: 'Мерцание ламп', args: [ON], notice: 'Мерцание: {on}' },
    { cmd: 'siren', tab: 'world', label: 'Сирена', args: [], notice: 'Хост включил сирену!' },
    { cmd: 'fog', tab: 'world', label: 'Туман', args: [num('v', '×', 0, 4, 1)], notice: 'Туман ×{v}' },
    { cmd: 'gravity', tab: 'world', label: 'Гравитация', args: [num('v', '×', 0.1, 3, 1)], notice: 'Гравитация ×{v}' },
    { cmd: 'timescale', tab: 'world', label: 'Скорость времени', args: [num('v', '×', 0.25, 3, 1)], notice: 'Время ×{v}' },
    { cmd: 'rain', tab: 'world', label: 'Дождь из предметов', args: [sel('item', 'что', RAIN)], notice: 'С потолка посыпалось: {item}!' },
    { cmd: 'flood', tab: 'world', label: 'Затопление (+м)', args: [num('v', 'м', -3, 6, 1)], notice: 'Хост поднял воду на {v} м' },
    { cmd: 'disco', tab: 'world', label: 'Дискотека', args: [ON], notice: 'Хост {on:включил:выключил} дискотеку' },
    { cmd: 'invert', tab: 'world', label: 'Инверсия управления', args: [ON], notice: 'Управление {on:перевёрнуто:вернулось}' },
    { cmd: 'fov', tab: 'world', label: 'Угол обзора всем', args: [num('v', '°', 30, 140, 75)], notice: 'Угол обзора: {v}°' },
    { cmd: 'filter', tab: 'world', label: 'Фильтр картинки', args: [sel('v', 'фильтр', FILTERS)], notice: 'Фильтр: {v}' },
    { cmd: 'freecam', tab: 'world', label: 'Свободная камера призракам', args: [ON], notice: 'Свободная камера призраков: {on}' },
    // ---- Существа ----
    { cmd: 'spawn', tab: 'mobs', label: 'Призвать существо рядом со мной', args: [sel('type', 'кого', MOBS)], notice: 'Хост призвал: {type}' },
    { cmd: 'killall', tab: 'mobs', label: 'Убрать всех существ', args: [], notice: 'Хост убрал всех существ' },
    { cmd: 'mobspeed', tab: 'mobs', label: 'Скорость существ', args: [num('v', '×', 0.1, 4, 1)], notice: 'Существа ×{v}' },
    { cmd: 'aggro', tab: 'mobs', label: 'Все в погоню', args: [], notice: 'Хост натравил существ!' },
    { cmd: 'stun', tab: 'mobs', label: 'Оглушить всех', args: [num('v', 'с', 1, 60, 10)], notice: 'Существа оглушены на {v} с' },
    { cmd: 'friendly', tab: 'mobs', label: 'Дружелюбные', args: [ON], notice: 'Существа дружелюбны: {on}' },
    { cmd: 'clone', tab: 'mobs', label: 'Клонировать существ', args: [], notice: 'Существ стало вдвое больше!' },
    { cmd: 'boss', tab: 'mobs', label: 'Сделать босса', args: [], notice: 'Одно из существ стало БОССОМ' },
    { cmd: 'aioff', tab: 'mobs', label: 'Отключить ИИ', args: [ON], notice: 'ИИ существ отключён: {on}' },
    { cmd: 'mobskin', tab: 'mobs', label: 'Облик существ', args: [sel('v', 'облик', [['default', 'обычный'], ...SKINS.slice(1)])], notice: 'Существа теперь — {v}' },
    { cmd: 'possess', tab: 'mobs', label: 'Сделать игрока существом', args: [P, ON], notice: '{name} стал существом: {on}' },
    // ---- Развлечения ----
    { cmd: 'fireworks', tab: 'fun', label: 'Фейерверк', args: [], notice: 'Фейерверк!' },
    { cmd: 'boom', tab: 'fun', label: 'Взрыв рядом со мной', args: [], notice: 'БАБАХ!' },
    { cmd: 'trampoline', tab: 'fun', label: 'Батут под ногами', args: [], notice: 'Хост поставил батут' },
    { cmd: 'trap', tab: 'fun', label: 'Телепорт-ловушка', args: [], notice: null },
    { cmd: 'lava', tab: 'fun', label: '«Пол — это лава»', args: [ON], notice: '{on:ПОЛ — ЭТО ЛАВА! Не стойте на нижнем этаже!:Лава остыла}' },
    { cmd: 'tag', tab: 'fun', label: 'Догонялки', args: [ON], notice: '{on:Догонялки! Кто «водит» — подсвечен красным:Догонялки окончены}' },
    { cmd: 'hide', tab: 'fun', label: 'Прятки от существ (30 с)', args: [], notice: 'ПРЯТКИ! 30 секунд — и существа выходят искать' },
    { cmd: 'confetti', tab: 'fun', label: 'Конфетти', args: [], notice: 'Конфетти!' },
    { cmd: 'rules', tab: 'fun', label: 'Свои правила раунда', args: [{ n: 'text', t: 'text', label: 'правила' }], notice: null },
  ];
  const BY_CMD = Object.fromEntries(COMMANDS.map((c) => [c.cmd, c]));

  // Короткие команды чата: /команда аргументы
  const CHAT = {
    tp: 'bring', goto: 'goto', give: 'give', spawn: 'spawn', kill: 'kill', god: 'god', time: 'light', level: 'level', seed: 'seed',
    speed: 'speed', noclip: 'noclip', say: 'say', fly: 'fly', size: 'size', skin: 'skin', freeze: 'freeze', gravity: 'gravity',
    weather: 'fog', lights: 'lights', revive: 'revive', kick: 'kick', ban: 'ban', disco: 'disco', lava: 'lava',
  };

  // Проверка и приведение аргументов. Возвращает { ok, args, error }.
  function validate(cmd, raw, ctx = {}) {
    const spec = BY_CMD[cmd];
    if (!spec) return { ok: false, error: 'неизвестная команда' };
    const out = {};
    raw = raw && typeof raw === 'object' ? raw : {};
    for (const a of spec.args) {
      const v = raw[a.n];
      switch (a.t) {
        case 'player':
          if (v === 'all' || v === 'me') { out[a.n] = v; break; }
          if (!Number.isInteger(+v) || !(ctx.players || []).includes(+v)) return { ok: false, error: `нет такого игрока: ${v}` };
          out[a.n] = +v; break;
        case 'num': {
          const n = +v;
          if (!Number.isFinite(n)) return { ok: false, error: `${a.label}: нужно число` };
          out[a.n] = Math.min(a.max, Math.max(a.min, n)); break;
        }
        case 'int': {
          const n = Math.floor(+v);
          if (!Number.isFinite(n)) return { ok: false, error: `${a.label}: нужно целое число` };
          out[a.n] = Math.min(a.max, Math.max(a.min, n)); break;
        }
        case 'bool': out[a.n] = v === true || v === 1 || v === '1' || v === 'on' || v === 'вкл' || v === 'true'; break;
        case 'select':
          if (!a.options.some(([k]) => k === v)) return { ok: false, error: `${a.label}: допустимо ${a.options.map(([k]) => k).join(', ')}` };
          out[a.n] = v; break;
        case 'text': out[a.n] = String(v == null ? '' : v).replace(/[<>&]/g, '').trim().slice(0, 140); if (!out[a.n]) return { ok: false, error: 'пустой текст' }; break;
        case 'color': if (!/^#?[0-9a-fA-F]{6}$/.test(String(v))) return { ok: false, error: 'цвет вида #ff8800' }; out[a.n] = parseInt(String(v).replace('#', ''), 16); break;
        case 'level': { const n = Math.floor(+v); if (!(n >= 0 && n < (ctx.levels || 1))) return { ok: false, error: 'нет такого уровня' }; out[a.n] = n; break; }
        default: return { ok: false, error: 'плохая спецификация' };
      }
    }
    return { ok: true, args: out };
  }

  // Разбор строки чата «/give Аня medkit» → { cmd, args } (игрок ищется по началу ника)
  function parseChat(line, players) {
    const parts = String(line).trim().replace(/^\//, '').split(/\s+/);
    const word = (parts.shift() || '').toLowerCase();
    if (word === 'help') return { help: true };
    const cmd = CHAT[word] || (BY_CMD[word] ? word : null);
    if (!cmd) return { error: `неизвестная команда /${word} (см. /help)` };
    const spec = BY_CMD[cmd], args = {};
    for (const a of spec.args) {
      if (a.t === 'text') { args[a.n] = parts.join(' '); parts.length = 0; break; }
      let v = parts.shift();
      if (v == null) { if (a.t === 'bool') v = 'on'; else if (a.def != null) v = a.def; else if (a.t === 'player') v = 'me'; }
      if (a.t === 'player' && v !== 'all' && v !== 'me') {
        const p = players.find((q) => q.name.toLowerCase().startsWith(String(v).toLowerCase()));
        v = p ? p.id : v;
      }
      if (a.t === 'bool' && v != null) v = /^(on|1|вкл|true|да)$/i.test(v) ? 'on' : 'off';
      args[a.n] = v;
    }
    return { cmd, args };
  }

  const HELP = '/tp ник · /goto ник · /give ник предмет · /spawn тип · /kill ник · /god ник on|off · /time яркость · /level N · /seed N · ' +
    '/speed ник x · /noclip ник on|off · /fly ник on|off · /size ник x · /skin ник duck|cube|banana · /freeze ник on|off · ' +
    '/gravity x · /weather туман · /lights on|off · /disco on|off · /lava on|off · /revive ник · /kick ник · /ban ник · /say текст';

  BR.ADMIN = { COMMANDS, BY_CMD, CHAT, validate, parseChat, HELP, ITEMS, SKINS, MOBS, FILTERS };
  if (typeof module === 'object' && module.exports) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
