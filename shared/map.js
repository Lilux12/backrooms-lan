// Уровни кампании и генерация карты по (seed, номер уровня).
// Уровень целиком определяется этой парой, поэтому у всех игроков и у сервера карта одинаковая
// (это проверяется хэшем при подключении).
(function (root) {
  'use strict';
  const isNode = typeof module === 'object' && module.exports;
  const BR = isNode ? (require('./core.js'), require('./world.js'), require('./gen2d.js'), require('./build.js'), require('./levels/index.js')) : root.BR;
  const { TILE, N, NN, T, D4, mulberry32, shuffle, cellX, cellZ, inner } = BR;

  /* ------------------------------ Кампания ------------------------------
   Поля уровня:
     F, FH          — число этажей и высота этажа (м)
     floors[]       — планировка каждого этажа: { gen, p } (см. gen2d.js)
     spawnF, exitF  — этаж старта и этаж выхода
     build(map, rnd, reserve) — вертикальные связи и особенности (build.js)
     mobs, mobType, mobSpeed, water (бутылки), mapChance, puzzles[], chase, infStamina
  */
  const LEVELS = [
    {
      name: 'Жёлтые комнаты', style: 'yellow', custom: 'yellow', F: 2, FH: 3.4, spawnF: 1, exitF: 1,
      mobs: 1, mobType: 'stalker', mobSpeed: 1.0, water: 4, mapChance: 0.7,
      skinstealer: true, items: { detector: 1, noisemaker: 2 },
      puzzles: ['fuses'], fuses: 3, fuseFloors: [0], breaker: { latch: 14 },
      intro: 'Электричество отключено. Найдите 3 предохранителя (один — внизу, в мокрых коридорах под провалом) и вставьте их в щиток. Щиток включится, только пока кто-то держит рубильник. И не доверяйте никому: здесь бродит существо, которое крадёт облик. Проверяйте друг друга (G — жест, Y — кодовое слово, луч фонаря, детектор).',
      lore: [
        { title: 'Записка на обоях', text: 'Я считал лампы. 4 812. Потом начал заново и насчитал 4 813. Одна лишняя. Она не гудит.' },
        { title: 'Список, приколотый к колонне', text: 'Нас было пятеро:\nКатя — ушла за водой\nМиша — ушёл за Катей\nКатя — вернулась\nКатя — вернулась\nНе верьте Кате.' },
        { title: 'Мокрый листок (нижний этаж)', text: 'Коридор внизу не кончается. Я шёл шесть часов и вернулся к той же двери. На ней моя записка. Эта.' },
        { title: 'Инструкция электрика', text: 'Щиток Б-7. Перед подачей питания ДЕРЖАТЬ РУБИЛЬНИК. Одному не справиться — пусть второй держит. Если второго нет, у вас секунд пятнадцать.' },
      ],
    },
    {
      name: 'Подземная парковка', style: 'concrete', custom: 'parking', F: 3, FH: 3.6, spawnF: 2, exitF: 0,
      mobList: [{ type: 'headlights', count: 2 }], mobSpeed: 1.0, water: 3, mapChance: 0.35,
      puzzles: ['code', 'parking'], codeFloors: [2, 1, 0, 0], uvDigits: true, codePower: { latch: 20 }, cctvDigits: true,
      intro: 'Три яруса бетона. Цифры кода написаны краской, которая видна только в свете фонаря (F). Терминал у шлагбаума внизу обесточен — рядом генератор. В будке охраны есть рация и камеры. Не бегайте у машин: сигнализация зовёт «Фары».',
      radio: [
        '…кх… Кто здесь? Я охранник третьего яруса. Слушайте: цифры на стенах — люминесцентная краска. Без фонаря их не видно. Светите на стены.',
        '…шшш… По цифре на каждом ярусе, последние две — внизу, в воде. Терминал у шлагбаума на нижнем ярусе.',
        '…Терминал без питания мёртв. Генератор рядом. Запустите его и сразу вводите код — он долго не протянет. Вдвоём проще: один держит, другой вводит.',
        '…И не бегите возле машин. Сигнализация сработает, и ОНИ придут на звук. Фары. Они всегда стоят спиной… пока не услышат.',
        '…Монитор в будке показывает камеры. На записи иногда видно, где написана цифра. И где стоят Они.',
        '…кх… …я всё ещё здесь… …двенадцать лет на смене… …кто-нибудь, выключите свет в будке…',
      ],
      lore: [
        { title: 'Парковочный талон', text: 'Въезд: 23:58. Выезд: —\nМесто: Б-ххх\n«Сохраняйте талон до выезда».\nНа обороте карандашом: «я не могу найти машину уже три дня».' },
        { title: 'Журнал охраны', text: '02:10 — на ярусе 2 сработала сигнализация, никого.\n02:14 — снова.\n02:15 — у машины стоит человек с фарами вместо глаз. Стоит спиной.\n02:16 — он повернулся.' },
        { title: 'Объявление', text: 'ВНИМАНИЕ! Нижний ярус подтоплен. Генератор аварийного питания — у шлагбаума. Не оставляйте его без присмотра.' },
      ],
    },
    {
      name: 'Технические тоннели', style: 'tunnel', custom: 'tunnels', F: 3, FH: 2.9, spawnF: 2, exitF: 0,
      mobList: [{ type: 'worm', count: 1 }], mobSpeed: 1.0, water: 3,
      puzzles: ['steam'],
      intro: 'Выход за паровым шлюзом на нижнем ярусе. Дайте давление вентилем в котельной, потом нажмите ОБЕ плиты — они на разных ярусах. Шлюз открыт, пока плиты держат. В трубах живёт Червь: он чувствует, когда вы бежите. Идите шагом — или ползите (C).',
      lore: [
        { title: 'Журнал обходчика', text: 'Трубы стучат, когда я бегу. Когда я иду — молчат. Когда я стою — стучат всё равно. Ближе.' },
        { title: 'Схема шлюза', text: 'Шлюз ПШ-1 открывается при давлении пара в контуре и замкнутых датчиках А и Б (плиты на разных ярусах). Держатся ~25 с. Изнутри — аварийная кнопка.' },
        { title: 'Записка на мостках', text: 'Не смотри вниз. Там дно. На дне — лестница. Если упал — лезь, не жди, пока застучит.' },
      ],
    },
    {
      name: 'Бассейны', style: 'pool', custom: 'pools', F: 4, FH: 4.0, spawnF: 1, exitF: 3,
      mobList: [{ type: 'stalker', count: 1 }, { type: 'drowner', count: 1 }], mobSpeed: 1.1, water: 4,
      puzzles: ['pools'],
      intro: 'Заброшенный аквапарк. Слейте воду из атриума вентилями в насосной (этажом ниже), откройте шлюз на дне бассейна, найдите ключ-карту и запустите насос — вода поднимет вас к выходу под стеклянной крышей. В воде что-то живёт.',
      lore: [
        { title: 'Записка тренера', text: 'Дорожки больше не держат воду. Вчера на 3-й кто-то плыл до самого утра — я слышал удары о бортик. Утром бассейн был пуст. И мокрые следы вели ВНИЗ, в насосную.' },
        { title: 'Расписание «последних заплывов»', text: '07:00 — разминка\n08:00 — группа «Дельфин»\n09:00 — группа «Дельфин» (повторно)\n09:00 — группа «Дельфин»\n??:?? — НЕ ВХОДИТЬ В ВОДУ ПОСЛЕ ГУДКА' },
        { title: 'Плёнка камеры №4', text: 'Кассета подписана «бассейн, ночь». На записи — пустая чаша, свет мигает. На 03:14 на дне появляется фигура, лежащая лицом вверх. Она не двигается. Вода прибывает. Фигура — уже у самой поверхности, и смотрит в камеру.' },
        { title: 'Памятка насосной', text: 'Слив атриума выполнять ТОЛЬКО при верном давлении на всех трёх вентилях. Неверное давление — аварийный выброс в насосную. Ключ-карта насоса хранится в сухом отсеке за шлюзом.' },
      ],
    },
    {
      name: 'Беги!', tag: 'LEVEL !', style: 'run', custom: 'hospital', F: 2, FH: 3.4, spawnF: 0, exitF: 1,
      mobs: 3, mobType: 'runner', mobSpeed: 1.25, water: 0,
      chase: true, infStamina: true, puzzles: ['hospital'],
      intro: 'Больница. Дверь на втором этаже уже открыта. Как только вы выйдете из ниши, стая бросится следом — и с каждой минутой она быстрее. Палаты срезают путь, но двери в них захлопываются. Не врезайтесь в мебель: споткнётесь.',
    },
    {
      name: 'Офисы', style: 'office', custom: 'offices', F: 3, FH: 3.2, spawnF: 0, exitF: 2,
      mobList: [{ type: 'stalker', count: 1 }, { type: 'crawler', count: 1 }], mobSpeed: 1.1, water: 4,
      puzzles: ['fuses', 'code', 'offices'], fuses: 2, codeNeedsFuses: true, keypadPoi: true,
      intro: 'Бизнес-центр. Верните питание (2 предохранителя в щиток), найдите 4 цифры кода и введите его на терминале в стеклянной переговорной наверху. Дверь переговорной открывается кнопкой на ресепшене. Камеры в серверной показывают, где существа. Их двое: Сталкер ходит по этажам, Ползун — по вентиляции.',
      lore: [
        { title: 'Служебная записка', text: 'Коллеги! Напоминаем: переговорная Б бронируется через ресепшен. Дверь открывается только с ресепшена. Изнутри — красная кнопка. Пожалуйста, не оставляйте людей внутри на выходные.' },
        { title: 'Распечатка из принтера', text: 'ОТЧЁТ ЗА КВАРТАЛ\nСотрудников: 48\nСотрудников: 47\nСотрудников: 47\nСотрудников: 46\nСотрудников: 4\nСотрудников: ' },
        { title: 'Стикер на мониторе', text: 'В вентиляции кто-то ползает. Сисадмин говорит — крысы. Крысы не говорят «привет».' },
      ],
    },
    {
      name: 'Бесконечный отель', style: 'hotel', custom: 'hotel', F: 6, FH: 3.2, spawnF: 1, exitF: 5,
      floorNames: ['Подвал', 'Холл (1 этаж)', '2 этаж', '3 этаж', '4 этаж', 'Пентхаус'],
      mobList: [{ type: 'bellhop', count: 2 }], mobSpeed: 1.0, water: 4,
      puzzles: ['hotel'],
      intro: 'Мраморный холл, бесконечные коридоры с одинаковыми дверями. Книга регистрации у стойки подскажет, в каких номерах остались 4 ключа. Верните ключи в ключницу и вызовите служебный лифт: кнопки на 1 и 4 этажах нужно нажать одновременно. Коридорный замирает, когда на него смотрят. Не отворачивайтесь — и не бегайте: он слышит.',
      phone: [
        '…Алло? Это ресепшен. Ваш номер готов. Он всегда был готов. Мы ждали вас.',
        '…(тяжёлое дыхание)… …не оборачивайтесь в коридоре… он стоит за спиной, пока вы смотрите на дверь…',
        '…Говорит горничная. Номера меняются, когда на них не смотрят. Запоминайте не двери, а дорогу.',
        '…Служебный лифт поднимает только тех, кто вызвал его вдвоём. Одному — не успеть. Почти.',
      ],
      lore: [
        { title: 'Записка горничной', text: 'Убрала 214. Убрала 214. Убрала 214. В 214 всё время кто-то спит. Кровать заправлена. Я убрала 214.' },
        { title: 'Вырванная страница', text: '«…гостей просят не покидать номер после 23:00. Коридорный обходит этажи по расписанию. Если вы встретили его в коридоре — смотрите на него, пока он не уйдёт. Не моргайте».' },
        { title: 'Меню столовой', text: 'ЗАВТРАК: 07:00–10:00\nОБЕД: 13:00–15:00\nУЖИН: 19:00–21:00\nУЖИН: 19:00–21:00\nУЖИН: всегда' },
        { title: 'Табличка на ключнице', text: 'Ключи сдавать сюда. Служебный лифт работает, когда все ключи на месте.' },
      ],
    },
    {
      name: 'Затопленный торговый центр', style: 'mall', custom: 'mall', F: 4, FH: 4.0, spawnF: 1, exitF: 3,
      floorNames: ['Парковка', '1 этаж (затоплен)', '2 этаж', '3 этаж: фудкорт и кино'],
      mobList: [{ type: 'mannequin', count: 5 }, { type: 'stalker', count: 1 }], mobSpeed: 1.0, water: 4,
      puzzles: ['mall', 'code'], codeTapes: true, keypadPoi: true, codeNeeds: 'mall', unpowered: true,
      intro: 'Торговый центр без света, первый этаж затоплен. Найдите канистру на парковке и предохранитель в комнате охраны, запустите генератор на крыше (кто-то должен качать топливо). Код от решётки кинотеатра — на кассетах камер наблюдения. Манекены стоят, пока на них светят. Берегите батарею.',
      radio: [
        '«Уважаемые покупатели! Торговый центр закрывается. Просим вас пройти к выходу». (повторяется) (повторяется) (повторяется)',
        '«…Охрана, третий этаж. Решётку кино закрыл, код у меня на кассете. Генератор на крыше без солярки не заведётся — канистры внизу, на парковке».',
        '«Вниманию посетителей: в связи с подтоплением эскалаторы не работают. И не смотрите на манекены».',
      ],
      lore: [
        { title: 'Чек', text: 'ТЦ «ГОРИЗОНТ»\nМанекен женский — 1 шт.\nМанекен женский — 1 шт.\nМанекен женский — 1 шт.\nИТОГО: 0,00\nСпасибо за покупку! Мы всегда рядом.' },
        { title: 'Журнал охраны', text: '23:10 — обход, 2 этаж: манекены в «Моде» стоят не так, как вечером.\n23:40 — повернули головы.\n00:15 — я выключил свет в зале. Когда включил — один стоял у двери.\nСВЕТ НЕ ВЫКЛЮЧАТЬ.' },
        { title: 'Рекламный плакат', text: '«ГОРИЗОНТ» — ВСЁ ДЛЯ ВАС! Кинотеатр на 3 этаже: последний сеанс — каждый день, без конца.' },
      ],
    },
  ];

  /* ------------------------------ Генерация ------------------------------ */
  function generate(seed, levelIdx = 0) {
    const L = LEVELS[levelIdx];
    const rnd = mulberry32(((seed >>> 0) + levelIdx * 977) >>> 0);
    const map = BR.newMap(L.F, L.FH);
    const spawnCell = 1 + N;
    const spawnNode = L.spawnF * NN + spawnCell;
    const used = [spawnCell, spawnCell + 1, spawnCell + N]; // у старта ничего не строим
    if (L.custom) {
      // собственный генератор уровня (shared/levels/*.js): строит всё сам
      BR.LEVEL_GENS[L.custom].build(map, rnd, used);
    } else {
      L.floors.forEach((spec, f) => BR.layerFromGrid(map, f, BR.gen2d(rnd, spec)));
      if (L.build) L.build(map, rnd, used);
    }
    if (map.t[L.spawnF][spawnCell] !== T.FLOOR) map.t[L.spawnF][spawnCell] = T.FLOOR;
    // ремонт идёт в «открытом» состоянии (все двери и люки открыты), потом закрываем то, что закрыто в начале
    BR.finalize(map, spawnNode);
    if (L.custom && BR.LEVEL_GENS[L.custom].after) { BR.LEVEL_GENS[L.custom].after(map); BR.buildColumns(map); map.navDirty = true; BR.ensureNav(map); }

    map.seed = seed; map.level = levelIdx;
    map.spawnNode = spawnNode;
    const sp = BR.nodePos(map, spawnNode);
    map.spawn = { x: sp.x, y: sp.y, z: sp.z, f: sp.f };
    map.dist = BR.bfsNav(map.nav, spawnNode);
    map.maxDist = 0;
    map.spots = []; // достижимые клетки с ровным полом — для предметов, респавна, блуждания
    for (let n = 0; n < map.nav.total; n++) {
      if (map.dist[n] < 0) continue;
      if (map.dist[n] > map.maxDist) map.maxDist = map.dist[n];
      const t = map.t[Math.floor(n / NN)][n % NN];
      if (t === T.FLOOR || t === T.LOW) map.spots.push(n);
    }
    map.exit = map.exitFixed ? fixedExit(map, map.exitFixed) : pickExit(map, rnd, L.exitF);
    map.obst = map.obst || (L.floors && L.floors[0].gen === 'run' ? BR.genObstacles(rnd) : []);
    map.hash = BR.mapHash(map);
    return map;
  }

  // Выход: стена-ниша с ровно одним соседним полом, подальше от старта
  function pickExit(map, rnd, f) {
    const Lt = map.t[f];
    const cands = [];
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      const i = x + z * N;
      if (Lt[i] !== T.WALL) continue;
      let cnt = 0, fl = -1, fd = 0, bad = false;
      for (let d = 0; d < 4; d++) {
        const j = (x + D4[d][0]) + (z + D4[d][1]) * N, t = Lt[j];
        if (t === T.FLOOR && map.dist[f * NN + j] >= 0) { cnt++; fl = j; fd = d; }
        else if (t !== T.WALL) bad = true;
      }
      if (cnt === 1 && !bad && (f + 1 >= map.F || map.t[f + 1][i] !== T.HOLE)) cands.push({ i, fl, fd, d: map.dist[f * NN + fl] });
    }
    cands.sort((a, b) => b.d - a.d);
    let ex = cands[Math.floor(rnd() * Math.min(5, cands.length))];
    if (!ex) { // запасной вариант: ниша у самого дальнего пола этажа, у которого есть стена рядом
      const onF = map.spots.filter((n) => Math.floor(n / NN) === f).sort((a, b) => map.dist[b] - map.dist[a]);
      if (!onF.length) return pickExit(map, rnd, f > 0 ? f - 1 : map.F - 1); // этаж недостижим — берём другой
      for (const far of onF) {
        const fi = far % NN;
        for (let d = 0; d < 4 && !ex; d++) {
          const x = cellX(fi) + D4[d][0], z = cellZ(fi) + D4[d][1];
          if (inner(x, z) && Lt[x + z * N] === T.WALL) ex = { i: x + z * N, fl: fi, fd: d ^ 1, d: map.dist[far] };
        }
        if (ex) break;
      }
    }
    const y = f * map.FH;
    return {
      f, y, cell: ex.i, tx: cellX(ex.i), ty: cellZ(ex.i),
      wx: BR.centerX(ex.i), wz: BR.centerZ(ex.i),   // центр двери
      fx: BR.centerX(ex.fl), fz: BR.centerZ(ex.fl), // пол перед дверью
      dx: -D4[ex.fd][0], dz: -D4[ex.fd][1],          // направление от пола к двери
      frontNode: f * NN + ex.fl,
    };
  }

  // Выход, заданный генератором уровня: { f, wall — клетка-стена двери, floor — клетка пола перед ней }
  function fixedExit(map, e) {
    const fd = D4.findIndex(([dx, dz]) => cellX(e.floor) + dx === cellX(e.wall) && cellZ(e.floor) + dz === cellZ(e.wall));
    map.t[e.f][e.wall] = T.WALL;
    const y = e.f * map.FH;
    return {
      f: e.f, y, cell: e.wall, tx: cellX(e.wall), ty: cellZ(e.wall),
      wx: BR.centerX(e.wall), wz: BR.centerZ(e.wall), fx: BR.centerX(e.floor), fz: BR.centerZ(e.floor),
      dx: D4[fd][0], dz: D4[fd][1], frontNode: e.f * NN + e.floor, // направление от пола к двери
    };
  }

  function setDoor(map, open) { BR.setCell(map, map.exit.f, map.exit.cell, open ? T.FLOOR : T.WALL); }

  /* --------------------------- Расстановка объектов --------------------------- */
  const sameFloorSep = (a, b) => (Math.floor(a / NN) !== Math.floor(b / NN) ? 1e9
    : Math.max(Math.abs(cellX(a % NN) - cellX(b % NN)), Math.abs(cellZ(a % NN) - cellZ(b % NN))));

  function spotOf(map, n) {
    const p = BR.nodePos(map, n);
    return { x: p.x, y: p.y, z: p.z, f: p.f, node: n, tile: p.i };
  }

  // n точек на ровном полу с ограничениями: minDist/maxDist — по графу от старта, minSep — в клетках на одном этаже,
  // floor — только этот этаж
  function pickSpots(map, rnd, n, o = {}) {
    const minDist = o.minDist || 0, maxDist = o.maxDist == null ? 1e9 : o.maxDist;
    let order = shuffle(rnd, map.spots);
    if (o.floor != null) order = order.filter((m) => Math.floor(m / NN) === o.floor);
    const taken = [];
    for (const [md, sep] of [[minDist, o.minSep || 0], [minDist, Math.floor((o.minSep || 0) / 2)], [0, 0]]) {
      for (const m of order) {
        if (taken.length >= n) break;
        const d = map.dist[m];
        if (d < md || d > maxDist || taken.includes(m)) continue;
        if (taken.every((t) => sameFloorSep(t, m) >= sep)) taken.push(m);
      }
      if (taken.length >= n) break;
    }
    return taken.map((m) => spotOf(map, m));
  }

  // Точки на стенах (цифры, записки). nx,nz — нормаль в сторону комнаты.
  function pickWallSpots(map, rnd, n, o = {}) {
    const minDist = o.minDist || 0, maxDist = o.maxDist == null ? 1e9 : o.maxDist, sep = o.minSep || 0;
    const order = shuffle(rnd, map.spots).filter((m) => map.t[Math.floor(m / NN)][m % NN] === T.FLOOR);
    const out = [], used = [];
    for (const relax of [1, 0.5, 0]) {
      for (const m of order) {
        if (out.length >= n) break;
        const d = map.dist[m];
        if (d < minDist * relax || d > maxDist || used.includes(m)) continue;
        if (!used.every((u) => sameFloorSep(u, m) >= sep * relax)) continue;
        const f = Math.floor(m / NN), i = m % NN, cx = cellX(i), cz = cellZ(i);
        const walls = D4.filter(([dx, dz]) => {
          const j = (cx + dx) + (cz + dz) * N;
          return map.t[f][j] === T.WALL && !(f === map.exit.f && j === map.exit.cell);
        });
        if (!walls.length) continue;
        const [dx, dz] = walls[Math.floor(rnd() * walls.length)];
        used.push(m);
        out.push({ x: (cx + 0.5) * TILE + dx * (TILE / 2 - 0.04), y: f * map.FH, z: (cz + 0.5) * TILE + dz * (TILE / 2 - 0.04), f, nx: -dx, nz: -dz, tile: i, node: m });
      }
      if (out.length >= n) break;
    }
    return out;
  }

  // Кратчайший путь (узлы) от старта до клетки перед дверью
  function route(map) {
    const nav = BR.ensureNav(map);
    const d = BR.bfsNav(nav, map.exit.frontNode, true);
    let n = map.spawnNode;
    const out = [n];
    for (let guard = 0; d[n] > 0 && guard < 5000; guard++) {
      let best = -1;
      for (const m of nav.out[n] || []) if (d[m] >= 0 && d[m] < d[n] && (best < 0 || d[m] < d[best])) best = m;
      if (best < 0) break;
      n = best; out.push(n);
    }
    return out;
  }

  Object.assign(BR, { LEVELS, generate, setDoor, pickSpots, pickWallSpots, route, spotOf });
  if (isNode) module.exports = BR;
})(typeof window !== 'undefined' ? window : globalThis);
