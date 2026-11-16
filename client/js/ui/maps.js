// Миникарта и карта на весь экран
import { $, LEVELS, N, TILE } from '../core/util.js';
import { FL, S, UP, me } from '../core/state.js';
import { curLevel, map, objs } from '../world/world.js';
import { LEVER_COL } from '../world/objects.js';
import { remotes } from '../entities/avatars.js';
import { mobEnts } from '../entities/mobs.js';
import { sfx } from '../audio/audio.js';
import { toast } from './hud.js';

/* ============================ Карты ============================ */
const mm = $('minimap'), mg = mm.getContext('2d');
const bigc = $('bigcanvas'), bg = bigc.getContext('2d');
const MAPPAL = {
  yellow: ['#8d7d38', '#2b2610', '#0d0b03'], concrete: ['#7b7f86', '#24262a', '#0a0b0c'], tunnel: ['#8a5a44', '#2a1710', '#0d0605'],
  pool: ['#58bccb', '#1b4e57', '#04161a'], run: ['#a9c4b6', '#22332c', '#06100c'], office: ['#98a081', '#2a2e22', '#0a0b08'],
};
const OBJ_DOT = { water: '#7fe8ff', fuse: '#ffb030', box: '#ffffff', keypad: '#ffffff', note: '#f0e8b0' };


export function toggleBigMap() {
  if (!UP.map) { toast('У вас нет улучшенной карты. Она может лежать где-то на 1 уровне.', 3200); return; }
  S.bigOn ? closeBigMap() : openBigMap();
}
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
    ctx.fillStyle = col;
    if (sq) ctx.fillRect(X(o.x) - r, Y(o.z) - r, r * 2, r * 2);
    else { ctx.beginPath(); ctx.arc(X(o.x), Y(o.z), r, 0, 7); ctx.fill(); }
  }
}

export function drawMinimap() {
  if (!S.mmOn || !map) return;
  const pal = MAPPAL[LEVELS[curLevel].style] || MAPPAL.yellow;
  const R = UP.map ? 16 : 9, s = mm.width, cell = s / (R * 2 + 1);
  const px = me.x / TILE, pz = me.z / TILE;
  const X = (wx) => (wx / TILE - px) * cell + s / 2, Y = (wz) => (wz / TILE - pz) * cell + s / 2;
  mg.fillStyle = pal[2]; mg.fillRect(0, 0, s, s);
  for (let ty = Math.floor(pz) - R - 1; ty <= Math.floor(pz) + R + 1; ty++) {
    for (let tx = Math.floor(px) - R - 1; tx <= Math.floor(px) + R + 1; tx++) {
      const wall = tx < 0 || ty < 0 || tx >= N || ty >= N || map.g[ty * N + tx];
      mg.fillStyle = wall ? pal[1] : pal[0];
      mg.fillRect((tx - px) * cell + s / 2, (ty - pz) * cell + s / 2, cell + 0.5, cell + 0.5);
    }
  }
  objDots(mg, X, Y, UP.map ? 2.8 : 3.6, UP.map ? 4 : 5);
  if (UP.map) mobDots(mg, X, Y, 3.4, 0.9);
  for (const r of remotes.values()) {
    if (!r.seen) continue;
    mg.fillStyle = '#6fa8ff'; mg.beginPath(); mg.arc(X(r.x), Y(r.z), 3.8, 0, 7); mg.fill();
  }
  mg.save(); mg.translate(s / 2, s / 2); mg.rotate(-me.yaw);
  if (FL.on) { mg.fillStyle = 'rgba(255,240,170,.16)'; mg.beginPath(); mg.moveTo(0, 0); mg.arc(0, 0, s * 0.45, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); mg.closePath(); mg.fill(); }
  mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(5, 6); mg.lineTo(-5, 6); mg.closePath(); mg.fill();
  mg.restore();
  $('mmMode').textContent = UP.map ? 'КАРТА+ · РАДИУС 16' : 'РАДИУС 9';
  $('mmMode').className = UP.map ? 'up' : '';
}

export function drawBigMap() {
  if (!map) return;
  const pal = MAPPAL[LEVELS[curLevel].style] || MAPPAL.yellow;
  const s = bigc.width, cell = s / N;
  const X = (wx) => wx / TILE * cell, Y = (wz) => wz / TILE * cell;
  bg.fillStyle = pal[2]; bg.fillRect(0, 0, s, s);
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    bg.fillStyle = map.g[ty * N + tx] ? pal[1] : pal[0];
    bg.fillRect(tx * cell, ty * cell, cell + 0.6, cell + 0.6);
  }
  // мебель на уровне «Беги!»
  bg.fillStyle = 'rgba(0,0,0,.35)';
  for (const o of map.obst || []) { bg.beginPath(); bg.arc(X(o.x), Y(o.z), o.r / TILE * cell * 0.8, 0, 7); bg.fill(); }
  objDots(bg, X, Y, Math.max(3, cell * 0.28), Math.max(5, cell * 0.4));
  mobDots(bg, X, Y, Math.max(4, cell * 0.3), 1.6);
  bg.font = `bold ${Math.max(11, cell * 0.38)}px "Courier New"`; bg.textAlign = 'center';
  for (const r of remotes.values()) {
    if (!r.seen) continue;
    bg.fillStyle = '#6fa8ff'; bg.beginPath(); bg.arc(X(r.x), Y(r.z), Math.max(4, cell * 0.3), 0, 7); bg.fill();
    bg.fillStyle = '#fff'; bg.fillText(r.name, X(r.x), Y(r.z) - cell * 0.5);
  }
  bg.save(); bg.translate(X(me.x), Y(me.z)); bg.rotate(-me.yaw);
  bg.fillStyle = '#fff'; bg.strokeStyle = '#000'; bg.lineWidth = 2;
  const a = Math.max(7, cell * 0.45);
  bg.beginPath(); bg.moveTo(0, -a); bg.lineTo(a * 0.7, a * 0.8); bg.lineTo(-a * 0.7, a * 0.8); bg.closePath(); bg.fill(); bg.stroke();
  bg.restore();
}
