// Рендерер, сцена, камера, свет игрока и пыль
import * as THREE from 'three';
import { $, rand } from '../core/util.js';
import { settings } from '../core/settings.js';

/* =============================== Сцена =============================== */
export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
export function applyQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio * settings.q, 2.2));
  renderer.setSize(innerWidth, innerHeight);
}
applyQuality();
$('game').appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.03);

export const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 120);
camera.rotation.order = 'YXZ';
scene.add(camera);

export const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
export const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.position.set(0.6, 1, 0.3);
export const lamp = new THREE.PointLight(0xffffff, 4.6, 36, 1); // «фонарь» чуть позади камеры
lamp.position.set(0, 0.1, 1.0);
camera.add(lamp);
scene.add(hemi, sun);

// Фонарик (F): конус света из руки
export const torch = new THREE.SpotLight(0xfff1cc, 0, 70, 0.4, 0.7, 1.1);
torch.position.set(0.14, -0.14, 0.15);
camera.add(torch, torch.target);
torch.target.position.set(0.05, -0.12, -10);

// Пылинки в воздухе
const DUST_N = 320, DUST_R = 10;
const dustPos = new Float32Array(DUST_N * 3), dustVel = [];
for (let i = 0; i < DUST_N; i++) {
  dustPos[i * 3] = rand(-DUST_R, DUST_R); dustPos[i * 3 + 1] = rand(0, 3.4); dustPos[i * 3 + 2] = rand(-DUST_R, DUST_R);
  dustVel.push([rand(-0.05, 0.05), rand(-0.03, 0.04), rand(-0.05, 0.05)]);
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
export const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.05, color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
dust.frustumCulled = false;
scene.add(dust);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Пылинки летают вокруг камеры (зацикленный объём DUST_R)
export function updateDust(dt, H) {
  const dp = dustGeo.attributes.position.array;
  for (let i = 0; i < DUST_N; i++) {
    const v = dustVel[i];
    dp[i * 3] += v[0] * dt; dp[i * 3 + 1] += v[1] * dt; dp[i * 3 + 2] += v[2] * dt;
    dp[i * 3] = camera.position.x + ((dp[i * 3] - camera.position.x + DUST_R * 3) % (DUST_R * 2)) - DUST_R;
    dp[i * 3 + 2] = camera.position.z + ((dp[i * 3 + 2] - camera.position.z + DUST_R * 3) % (DUST_R * 2)) - DUST_R;
    if (dp[i * 3 + 1] > H) dp[i * 3 + 1] = 0.1; else if (dp[i * 3 + 1] < 0) dp[i * 3 + 1] = H - 0.1;
  }
  dustGeo.attributes.position.needsUpdate = true;
}
