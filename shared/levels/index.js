// Подключение генераторов уровней в Node (в браузере они грузятся тегами <script> из index.html)
'use strict';
for (const name of ['yellow', 'parking', 'tunnels', 'pools', 'hospital', 'offices', 'hotel', 'mall', 'lab', 'school', 'factory']) require('./' + name + '.js');
module.exports = require('../build.js');
