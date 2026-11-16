// Декор и эффекты уровня из map.fx (их раскладывает общий генератор, поэтому у всех одинаково):
// пар в саунах, буйки на воде, фонтан, вышки, шезлонги, детская горка, круги в «ленивой реке».
import * as THREE from 'three';
import { BR } from '../core/util.js';
import { glowTexture } from '../render/textures.js';

const lam = (color, emissive = 0) => new THREE.MeshLambertMaterial({ color, emissive });

let softTex = null;
const soft = () => softTex || (softTex = glowTexture());

// Облако частиц (пар, брызги): позиции обновляются в update
function particles(n, color, size, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ map: soft(), color, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function buildFx(map) {
  const group = new THREE.Group();
  const updaters = [];
  for (const e of map.fx) {
    switch (e.k) {
      case 'steam': {
        const n = 70, pts = particles(n, 0xeef4f2, 2.2, 0.16);
        const life = [], pos = pts.geometry.attributes.position.array;
        for (let i = 0; i < n; i++) life.push(Math.random());
        updaters.push((dt) => {
          for (let i = 0; i < n; i++) {
            life[i] += dt * 0.12;
            if (life[i] > 1) life[i] -= 1;
            const a = i * 2.4 + life[i] * 2;
            pos[i * 3] = e.x + Math.cos(a) * (0.6 + life[i] * 1.6);
            pos[i * 3 + 1] = e.y + 0.2 + life[i] * 3.2;
            pos[i * 3 + 2] = e.z + Math.sin(a) * (0.6 + life[i] * 1.6);
          }
          pts.geometry.attributes.position.needsUpdate = true;
        });
        const lamp = new THREE.PointLight(0xffb070, 1.6, 7, 1.5); lamp.position.set(e.x, e.y + 2.4, e.z);
        group.add(pts, lamp);
        break;
      }
      case 'buoys': {
        const n = Math.floor((e.x1 - e.x0) / 0.8);
        const geo = new THREE.SphereGeometry(0.16, 10, 8);
        const red = new THREE.InstancedMesh(geo, lam(0xd83020, 0x200000), Math.ceil(n / 2));
        const white = new THREE.InstancedMesh(geo, lam(0xf0f0f0, 0x202020), Math.floor(n / 2));
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, e.x1 - e.x0, 4), lam(0x30485a));
        rope.rotation.z = Math.PI / 2;
        red.frustumCulled = white.frustumCulled = false;
        const m4 = new THREE.Matrix4();
        updaters.push((dt, t) => {
          const y = map.wl[e.zone] + 0.06;
          let r = 0, w = 0;
          for (let i = 0; i < n; i++) {
            m4.makeTranslation(e.x0 + 0.4 + i * 0.8, y + Math.sin(t * 1.3 + i * 0.7) * 0.04, e.z);
            if (i % 2) white.setMatrixAt(w++, m4); else red.setMatrixAt(r++, m4);
          }
          red.instanceMatrix.needsUpdate = white.instanceMatrix.needsUpdate = true;
          rope.position.set((e.x0 + e.x1) / 2, y, e.z);
        });
        group.add(red, white, rope);
        break;
      }
      case 'fountain': {
        const stone = lam(0xc8d8d8);
        const g = new THREE.Group();
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.5, 20), stone));
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 12), stone); pillar.position.y = 1.1;
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.4, 0.3, 16), stone); bowl.position.y = 2.2;
        g.add(pillar, bowl);
        g.position.set(e.x, e.y, e.z);
        const n = 90, spray = particles(n, 0xcff4ff, 0.35, 0.55), pos = spray.geometry.attributes.position.array;
        const ph = []; for (let i = 0; i < n; i++) ph.push(Math.random());
        updaters.push((dt) => {
          for (let i = 0; i < n; i++) {
            ph[i] += dt * 0.6; if (ph[i] > 1) ph[i] -= 1;
            const a = i * 0.7, r = ph[i] * 1.2, t = ph[i];
            pos[i * 3] = e.x + Math.cos(a) * r; pos[i * 3 + 2] = e.z + Math.sin(a) * r;
            pos[i * 3 + 1] = e.y + 2.4 + t * 2.2 - t * t * 3.4;
          }
          spray.geometry.attributes.position.needsUpdate = true;
        });
        group.add(g, spray);
        break;
      }
      case 'board': {
        // трамплин над атриумом: доска уходит в провал
        const g = new THREE.Group();
        const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.7), lam(0x2a7fb0));
        plank.position.set(1.6, 0.35, 0);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.9), lam(0xb8c4c8)); base.position.set(0.1, 0.17, 0);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), lam(0xc0c0c0)); rail.position.set(-0.2, 0.7, 0.4);
        g.add(plank, base, rail);
        g.position.set(e.x, e.y, e.z);
        g.rotation.y = e.dir === 0 ? 0 : Math.PI;
        group.add(g);
        break;
      }
      case 'lounger': {
        const g = new THREE.Group(), w = lam(0xe8e8e0), fr = lam(0x9aa0a4);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 1.4), w); seat.position.set(0, 0.35, 0.2);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.7), w); back.position.set(0, 0.6, -0.65); back.rotation.x = -0.9;
        for (const [x, z] of [[-0.3, 0.8], [0.3, 0.8], [-0.3, -0.4], [0.3, -0.4]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 5), fr); l.position.set(x, 0.17, z); g.add(l); }
        g.add(seat, back);
        g.position.set(e.x, e.y, e.z); g.rotation.y = e.rot || 0;
        group.add(g);
        break;
      }
      case 'slide': {
        const g = new THREE.Group();
        const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 1.2), lam(0xe0c030)); tower.position.y = 1.2;
        const chute = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 4.2), lam(0x30a0d0)); chute.position.set(0, 1.25, 2.4); chute.rotation.x = 0.5;
        g.add(tower, chute); g.position.set(e.x, e.y, e.z);
        group.add(g);
        break;
      }
      case 'river': {
        // надувные круги плывут по течению
        const ring = new THREE.TorusGeometry(0.45, 0.16, 8, 16); ring.rotateX(Math.PI / 2);
        const cols = [0xff6a3a, 0xffd23a, 0x3ac0ff, 0x7aff6a];
        const per = 2 * ((e.x1 - e.x0) + (e.z1 - e.z0)) * 4;
        const rings = cols.map((c) => new THREE.Mesh(ring, lam(c, c & 0x222222)));
        rings.forEach((r) => group.add(r));
        const path = (s) => { // точка на кольце по длине s (по часовой стрелке)
          const W = (e.x1 - e.x0) * 4, H = (e.z1 - e.z0) * 4, x0 = e.x0 * 4 + 2, z0 = e.z0 * 4 + 2;
          s = ((s % per) + per) % per;
          if (s < W) return [x0 + s, z0];
          if (s < W + H) return [x0 + W, z0 + s - W];
          if (s < 2 * W + H) return [x0 + W - (s - W - H), z0 + H];
          return [x0, z0 + H - (s - 2 * W - H)];
        };
        updaters.push((dt, t) => {
          rings.forEach((r, k) => {
            const [x, z] = path(t * BR.PHYS.CURRENT + k * per / rings.length);
            const zone = map.wz[BR.cellAt(x, z)];
            r.position.set(x, (zone >= 0 ? map.wl[zone] : e.y) + 0.05, z);
            r.rotation.y = t * 0.3 + k;
          });
        });
        break;
      }
    }
  }
  let time = 0;
  return { group, update(dt) { time += dt; for (const u of updaters) u(dt, time); } };
}
