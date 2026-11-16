// Общие утилиты клиента и константы карты

export const BR = window.BR;
export const { TILE, N, LEVELS } = BR;
export const $ = (id) => document.getElementById(id);
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function lerpAngle(a, b, k) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * k;
}
export const FULL = N * TILE; // размер карты в метрах
