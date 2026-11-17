'use strict';
// Таблица рекордов: лучшее время каждого уровня и всей кампании (обычной и «ежедневной»).
// Хранится в data/records.json рядом с игрой и переживает перезапуск сервера. Меню берёт её по адресу /records.json.
const fs = require('fs');
const path = require('path');

const FILE = process.env.RECORDS_FILE || path.join(__dirname, '..', 'data', 'records.json');
let db = { levels: {}, campaign: [], daily: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) { /* файла ещё нет */ }

function save() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db, null, 1)); } catch (e) { /* без записи — рекорды только в памяти */ }
}
const top = (list, entry, n = 5) => { list.push(entry); list.sort((a, b) => a.time - b.time); list.length = Math.min(list.length, n); return list.indexOf(entry); };

// Уровень пройден: время (с), команда, смерти. Возвращает место в таблице (0 — новый рекорд) или -1.
function levelDone(idx, time, names, deaths, daily) {
  const key = daily ? `daily:${daily}:${idx}` : String(idx);
  const list = db.levels[key] || (db.levels[key] = []);
  const place = top(list, { time, names, deaths, date: new Date().toISOString().slice(0, 10) });
  save();
  return place;
}
function campaignDone(time, names, ending) {
  const place = top(db.campaign, { time, names, ending, date: new Date().toISOString().slice(0, 10) });
  save();
  return place;
}
const table = () => db;

module.exports = { levelDone, campaignDone, table, FILE };
