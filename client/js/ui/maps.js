// Миникарта и карта на весь экран
import { $, BR, LEVELS, N, TILE } from '../core/util.js';
import { FL, S, UP, me } from '../core/state.js';
import { curLevel, map, objs } from '../world/world.js';
import { LEVER_COL } from '../world/objects.js';
import { remotes } from '../entities/avatars.js';
import { mobEnts } from '../entities/mobs.js';
import { sfx } from '../audio/audio.js';
import { toast } from './hud.js';
import { activeMarks, spec } from '../game/spectator.js';
import { sendNet } from '../net/net.js';
import { renderer } from '../render/scene.js';

/* ============================ Карты ============================ */
const mm = $('minimap'), mg = mm.getContext('2d');
const bigc = $('bigcanvas'), bg = bigc.getContext('2d');
const MAPPAL = {
  yellow: ['#8d7d38', '#2b2610', '#0d0b03'], concrete: ['#7b7f86', '#24262a', '#0a0b0c'], tunnel: ['#8a5a44', '#2a1710', '#0d0605'],
  pool: ['#58bccb', '#1b4e57', '#04161a'], run: ['#a9c4b6', '#22332c', '#06100c'], office: ['#98a081', '#2a2e22', '#0a0b08'],
  hotel: ['#a8604a', '#2e1610', '#0c0604'], mall: ['#b8bcc0', '#2a2e32', '#0a0c0e'],
  lab: ['#8ab8c0', '#1e3438', '#060e10'], school: ['#c8a878', '#3a2c18', '#0e0a04'], factory: ['#a0603a', '#2a160a', '#0c0602'],
};
const OBJ_DOT = { water: '#7fe8ff', fuse: '#ffb030', box: '#ffffff', keypad: '#ffffff', note: '#f0e8b0' };


export function toggleBigMap() {
  if (!UP.map && !spec.dead && !S.admin) { toast('У вас нет улучшенной карты. Её можно найти на «Жёлтых комнатах» или на парковке.', 3200); return; }
  S.bigOn ? closeBigMap() : openBigMap();
  // призраку (и хосту для телепорта) нужен курсор, чтобы кликать по карте
  if ((spec.dead || S.adminClick) && S.bigOn) { S.ghostCursor = true; document.exitPointerLock(); }
}
// Клик по карте призраком — метка-подсказка для живых
bigc.addEventListener('click', (e) => {
  if ((!spec.dead && !S.adminClick) || !S.bigOn || !map) return;
  const rect = bigc.getBoundingClientRect();
  const cell = bigc.width / N;
  const x = (e.clientX - rect.left) / rect.width * bigc.width / cell * TILE, z = (e.clientY - rect.top) / rect.height * bigc.height / cell * TILE;
  const f = myFloor();
  if (S.adminClick) { sendNet({ t: 'adm', cmd: 'tpxy', args: { x, z, f } }); S.adminClick = false; }
  else sendNet({ t: 'mark', x, y: f * map.FH, z });
  closeBigMap();
  S.ghostCursor = false;
  renderer.domElement.requestPointerLock();
});
function openBigMap() {
  S.bigOn = true; $('bigmap').style.display = 'flex'; $('bigLv').textContent = LEVELS[curLevel].name.toUpperCase();
  const sz = Math.floor(Math.min(innerWidth * 0.92, innerHeight * 0.78));
  bigc.width = bigc.height = sz; sfx.click(); drawBigMap();
}
export function closeBigMap() { if (S.bigOn) { S.bigOn = false; $('bigmap').style.display = 'none'; } }

function mobDots(ctx, X, Y, rad, pulse) {
  for (const mo of mobEnts) {
    if (!mo.seen) continue;
    const idle = mo.stun && !mo.chase;
    ctx.globalAlpha = floorAlpha(mo.y);
    ctx.fillStyle = idle ? 'rgba(255,90,70,.4)' : '#ff3b30';
    ctx.beginPath(); ctx.arc(X(mo.x), Y(mo.z), rad, 0, 7); ctx.fill();
    if (!idle) {
      const ph = (S.time * 1.6) % 1;
      ctx.strokeStyle = `rgba(255,59,48,${0.7 * (1 - ph)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(mo.x), Y(mo.z), rad + ph * rad * 3.2 * pulse, 0, 7); ctx.stroke();
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(mo.x), Y(mo.z)); ctx.lineTo(X(mo.x + Math.sin(mo.r) * 2.4), Y(mo.z + Math.cos(mo.r) * 2.4)); ctx.stroke();
  }
}
function objDots(ctx, X, Y, rad, sqs) {
  for (const { o } of objs.values()) {
    let col = OBJ_DOT[o.kind], sq = false, r = rad;
    if (o.kind === 'door') { col = o.open ? '#30ff60' : '#ff3020'; sq = true; r = sqs; }
    else if (o.kind === 'plate') col = o.on ? '#30ff60' : '#ff9030';
    else if (o.kind === 'lever') col = o.on ? '#30ff60' : '#' + LEVER_COL[o.col].toString(16).padStart(6, '0');
    else if (o.kind === 'arrow') { col = 'rgba(70,255,140,.65)'; r = rad * 0.55; }
    else if (o.kind === 'digit' || o.kind === 'mapitem') continue;
    if (!col) continue;
    ctx.globalAlpha = floorAlpha(o.y);
    ctx.fillStyle = col;
    if (sq) ctx.fillRect(X(o.x) - r, Y(o.z) - r, r * 2, r * 2);
    else { ctx.beginPath(); ctx.arc(X(o.x), Y(o.z), r, 0, 7); ctx.fill(); }
  }
}


// Цвет клетки этажа f на карте
const CELL_COL = { 2: '#050505', 3: '#c9b56a', 4: '#2a7f9a', 5: '#5a554d' };
function cellColor(f, i, pal) {
  const t = map.t[f][i];
  if (f === map.exit.f && i === map.exit.cell) return map.t[f][i] === BR.T.WALL ? pal[1] : pal[0];
  if (t === BR.T.WALL) return pal[1];
  return CELL_COL[t] || pal[0];
}
function drawCell(ctx, f, i, x, y, w, pal) {
  ctx.fillStyle = cellColor(f, i, pal);
  ctx.fillRect(x, y, w, w);
  const t = map.t[f][i];
  if (map.wz[i] >= 0 && t !== BR.T.POOL && t !== BR.T.WALL) { ctx.fillStyle = 'rgba(60,160,220,.35)'; ctx.fillRect(x, y, w, w); }
  if (t === BR.T.LOW) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y, w, w); }
  if (t === BR.T.LADDER) { ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x + w * 0.35, y + w * 0.1, w * 0.3, w * 0.8); }
  if (t === BR.T.STAIR && w > 6) { // стрелка вверх по лестнице
    const d = BR.stairDir(map.a[f][i]), [dx, dz] = BR.D4[d];
    ctx.strokeStyle = 'rgba(40,30,0,.8)'; ctx.lineWidth = Math.max(1, w * 0.12);
    ctx.beginPath(); ctx.moveTo(x + w / 2 - dx * w * 0.3, y + w / 2 - dz * w * 0.3); ctx.lineTo(x + w / 2 + dx * w * 0.3, y + w / 2 + dz * w * 0.3); ctx.stroke();
  }
}
// Объекты других этажей — полупрозрачные
const myFloor = () => BR.floorOf(map, me.x, me.y + 0.1, me.z);
const floorAlpha = (y) => (BR.floorOf(map, me.x, (y || 0) + 0.1, me.z) === myFloor() || Math.abs((y || 0) - me.y) < 1.5 ? 1 : 0.3);

// Метки «сюда/опасность» и подсказки призраков
function markDots(ctx, X, Y, r) {
  for (const k of activeMarks()) {
    ctx.globalAlpha = k.ghost ? 0.5 + 0.5 * Math.abs(Math.sin(k.t * 6)) : 1;
    ctx.strokeStyle = '#' + k.col.toString(16).padStart(6, '0'); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(X(k.x), Y(k.z), r + Math.sin(k.t * 5) * 1.5, 0, 7); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawMinimap() {
  if (!S.mmOn || !map) return;
  const pal = MAPPAL[LEVELS[curLevel].style] || MAPPAL.yellow;
  const R = UP.map ? 16 : 9, s = mm.width, cell = s / (R * 2 + 1);
  const px = me.x / TILE, pz = me.z / TILE, fl = myFloor();
  const X = (wx) => (wx / TILE - px) * cell + s / 2, Y = (wz) => (wz / TILE - pz) * cell + s / 2;
  mg.fillStyle = pal[2]; mg.fillRect(0, 0, s, s);
  for (let ty = Math.floor(pz) - R - 1; ty <= Math.floor(pz) + R + 1; ty++) {
    for (let tx = Math.floor(px) - R - 1; tx <= Math.floor(px) + R + 1; tx++) {
      const x = (tx - px) * cell + s / 2, y = (ty - pz) * cell + s / 2;
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) { mg.fillStyle = pal[1]; mg.fillRect(x, y, cell + 0.5, cell + 0.5); continue; }
      drawCell(mg, fl, tx + ty * N, x, y, cell + 0.5, pal);
    }
  }
  objDots(mg, X, Y, UP.map ? 2.8 : 3.6, UP.map ? 4 : 5);
  if (UP.map || performance.now() / 1000 < (S.cctvUntil || 0)) mobDots(mg, X, Y, 3.4, 0.9); // камеры наблюдения тоже показывают существ
  mg.globalAlpha = 1;
  for (const r of remotes.values()) {
    if (!r.seen) continue;
    mg.globalAlpha = floorAlpha(r.y);
    mg.fillStyle = '#6fa8ff'; mg.beginPath(); mg.arc(X(r.x), Y(r.z), 3.8, 0, 7); mg.fill();
    mg.globalAlpha = 1;
  }
  markDots(mg, X, Y, 4);
  mg.save(); mg.translate(s / 2, s / 2); mg.rotate(-me.yaw);
  if (FL.on) { mg.fillStyle = 'rgba(255,240,170,.16)'; mg.beginPath(); mg.moveTo(0, 0); mg.arc(0, 0, s * 0.45, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); mg.closePath(); mg.fill(); }
  mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(5, 6); mg.lineTo(-5, 6); mg.closePath(); mg.fill();
  mg.restore();
  const cam = performance.now() / 1000 < (S.cctvUntil || 0);
  const fname = LEVELS[curLevel].floorNames && LEVELS[curLevel].floorNames[fl];
  $('mmMode').textContent = (fname ? fname.toUpperCase() + ' · ' : map.F > 1 ? `ЭТАЖ ${fl + 1}/${map.F} · ` : '') + (UP.map ? 'КАРТА+ · Р16' : 'РАДИУС 9') + (cam ? ' · КАМЕРЫ' : '');
  $('mmMode').className = UP.map ? 'up' : '';
}

export function drawBigMap() {
  if (!map) return;
  const pal = MAPPAL[LEVELS[curLevel].style] || MAPPAL.yellow;
  const s = bigc.width, cell = s / N, fl = myFloor();
  $('bigLv').textContent = `${LEVELS[curLevel].name.toUpperCase()} · ЭТАЖ ${fl + 1}/${map.F}`;
  const X = (wx) => wx / TILE * cell, Y = (wz) => wz / TILE * cell;
  bg.fillStyle = pal[2]; bg.fillRect(0, 0, s, s);
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    drawCell(bg, fl, tx + ty * N, tx * cell, ty * cell, cell + 0.6, pal);
  }
  // мебель на уровне «Беги!»
  bg.fillStyle = 'rgba(0,0,0,.35)';
  for (const o of map.obst || []) { bg.beginPath(); bg.arc(X(o.x), Y(o.z), o.r / TILE * cell * 0.8, 0, 7); bg.fill(); }
  objDots(bg, X, Y, Math.max(3, cell * 0.28), Math.max(5, cell * 0.4));
  mobDots(bg, X, Y, Math.max(4, cell * 0.3), 1.6);
  bg.globalAlpha = 1;
  bg.font = `bold ${Math.max(11, cell * 0.38)}px "Courier New"`; bg.textAlign = 'center';
  for (const r of remotes.values()) {
    if (!r.seen) continue;
    bg.globalAlpha = floorAlpha(r.y);
    bg.fillStyle = '#6fa8ff'; bg.beginPath(); bg.arc(X(r.x), Y(r.z), Math.max(4, cell * 0.3), 0, 7); bg.fill();
    bg.fillStyle = '#fff'; bg.fillText(r.name, X(r.x), Y(r.z) - cell * 0.5);
  }
  bg.globalAlpha = 1;
  markDots(bg, X, Y, Math.max(5, cell * 0.35));
  bg.save(); bg.translate(X(me.x), Y(me.z)); bg.rotate(-me.yaw);
  bg.fillStyle = '#fff'; bg.strokeStyle = '#000'; bg.lineWidth = 2;
  const a = Math.max(7, cell * 0.45);
  bg.beginPath(); bg.moveTo(0, -a); bg.lineTo(a * 0.7, a * 0.8); bg.lineTo(-a * 0.7, a * 0.8); bg.closePath(); bg.fill(); bg.stroke();
  bg.restore();
}
