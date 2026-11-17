// Декор и эффекты уровня из map.fx (их раскладывает общий генератор, поэтому у всех одинаково):
// пар в саунах, буйки на воде, фонтан, вышки, шезлонги, детская горка, круги в «ленивой реке».
import * as THREE from 'three';
import { BR } from '../core/util.js';
import { glowSprite, glowTexture } from '../render/textures.js';
import { S } from '../core/state.js';

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
        const n = e.small ? 30 : 70, pts = particles(n, 0xeef4f2, e.small ? 1.4 : 2.2, e.small ? 0.12 : 0.16);
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
        group.add(pts);
        if (!e.small) { const lamp = new THREE.PointLight(0xffb070, 1.6, 7, 1.5); lamp.position.set(e.x, e.y + 2.4, e.z); group.add(lamp); }
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
      default: buildFxMore(e, map, group, updaters);
    }
  }
  let time = 0;
  return { group, update(dt) { time += dt; for (const u of updaters) u(dt, time); } };
}

/* ------------------ Знаковые места уровней (декор по данным генератора) ------------------ */
const T4 = 4;
const boxM = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cylM = (rt, rb, h, mat, x, y, z, seg = 10) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); return m; };
function signPlane(text, w, h, bg, fg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.font = `bold ${Math.round(c.height * 0.55)}px "Courier New"`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, fog: false, side: THREE.DoubleSide }));
}

export function buildFxMore(e, map, group, updaters) {
  const FH = map.FH, y0 = (e.f || 0) * FH;
  switch (e.k) {
    case 'upside': {
      // комната вверх дном: стол и стулья «стоят» на потолке
      const top = y0 + FH, wood = lam(0x7a5a34), cloth = lam(0x8a2a2a);
      const g = new THREE.Group();
      g.add(boxM(2.0, 0.08, 1.2, wood, 0, -0.75, 0), boxM(0.08, 0.75, 0.08, wood, -0.9, -0.37, -0.5), boxM(0.08, 0.75, 0.08, wood, 0.9, -0.37, -0.5),
        boxM(0.08, 0.75, 0.08, wood, -0.9, -0.37, 0.5), boxM(0.08, 0.75, 0.08, wood, 0.9, -0.37, 0.5));
      for (const [x, z, r] of [[-1.5, 0, 0.3], [1.5, 0.2, 2.8], [0, 1.4, 1.5]]) {
        const ch = new THREE.Group();
        ch.add(boxM(0.5, 0.06, 0.5, cloth, 0, -0.45, 0), boxM(0.5, 0.55, 0.06, cloth, 0, -0.75, -0.22));
        for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) ch.add(boxM(0.04, 0.45, 0.04, wood, lx, -0.22, lz));
        ch.position.set(x, 0, z); ch.rotation.y = r; g.add(ch);
      }
      const lampOff = cylM(0.2, 0.3, 0.3, lam(0xd8d0b0), 0.3, -0.95, 0); g.add(lampOff);
      g.position.set(e.x, top - 0.01, e.z);
      group.add(g);
      break;
    }
    case 'endless': {
      // бесконечный коридор: одинаковые двери по обе стороны каждые две клетки и свет в конце
      const door = lam(0x6a5a34), frame = lam(0x4a3e22);
      const zc = (e.z + 0.5) * T4;
      for (let x = e.x0 + 1; x < e.x1; x += 2) {
        for (const side of [-1, 1]) {
          const z = zc + side * (T4 / 2 - 0.06);
          group.add(boxM(1.0, 2.1, 0.06, door, (x + 0.5) * T4, y0 + 1.05, z), boxM(1.2, 0.1, 0.08, frame, (x + 0.5) * T4, y0 + 2.15, z));
        }
      }
      const far = glowSprite(0xfff4c0, 6, 0.6); far.position.set((e.x1 + 0.5) * T4, y0 + 1.6, zc); group.add(far);
      break;
    }
    case 'barrier': {
      const g = new THREE.Group();
      g.add(boxM(0.35, 1.1, 0.35, lam(0xd8c020), 0, 0.55, 0));
      const arm = new THREE.Group(); arm.position.set(0, 1.0, 0);
      for (let k = 0; k < 6; k++) arm.add(boxM(0.6, 0.1, 0.1, lam(k % 2 ? 0xffffff : 0xd02020), 0.35 + k * 0.6, 0, 0));
      arm.rotation.z = 0.12;
      g.add(arm); g.position.set(e.x, y0, e.z); g.rotation.y = e.rot || 0;
      group.add(g);
      break;
    }
    case 'rampsign': {
      const s = signPlane(e.text, 2.2, 0.55, '#1a3a8a', '#ffffff'); s.position.set(e.x, y0 + FH - 0.6, e.z); group.add(s);
      break;
    }
    case 'booth': {
      const s = signPlane('ОХРАНА', 1.8, 0.45, '#202020', '#ffd040');
      s.position.set((e.x0 + e.x1 + 1) / 2 * T4, y0 + FH - 0.5, (e.z1 + 1) * T4 + 0.06); group.add(s);
      const l = new THREE.PointLight(0x80b0ff, 1.5, 10, 1.5); l.position.set((e.x0 + e.x1 + 1) / 2 * T4, y0 + 2.4, (e.z0 + e.z1 + 1) / 2 * T4); group.add(l);
      break;
    }
    case 'steamgate': {
      const red = new THREE.PointLight(0xff3020, 2.5, 10, 1.5); red.position.set(e.x - 3, y0 + 2.3, e.z); group.add(red);
      const s = signPlane('ПАРОВОЙ ШЛЮЗ', 2.4, 0.4, '#3a1008', '#ffb040'); s.position.set(e.x - 2.1, y0 + 2.4, e.z); s.rotation.y = -Math.PI / 2; group.add(s);
      updaters.push((dt, t) => { red.intensity = 1.5 + Math.sin(t * 4) * 1.2; });
      break;
    }
    case 'shaft': {
      // перила мостков над пропастью и тросы, уходящие вниз
      const rail = lam(0xb0a080), zz = (e.z0 + 1) * T4, x0 = (e.x0 - 1) * T4, len = (e.x1 - e.x0 + 3) * T4, yb = 2 * FH;
      for (const dz of [0.15, T4 - 0.15]) {
        const r = cylM(0.04, 0.04, len, rail, x0 + len / 2, yb + 1.0, zz + dz, 6); r.rotation.z = Math.PI / 2; group.add(r);
        for (let k = 0; k <= len; k += 2) group.add(cylM(0.03, 0.03, 1.0, rail, x0 + k, yb + 0.5, zz + dz, 5));
      }
      for (let k = 0; k < 4; k++) {
        const c = cylM(0.02, 0.02, 3 * FH, lam(0x222222), (e.x0 + 0.5 + k * 0.7) * T4, 1.5 * FH, (e.z0 + 0.3) * T4, 4); group.add(c);
      }
      const warn = new THREE.PointLight(0xff4020, 1.6, 14, 1.5); warn.position.set((e.x0 + 1.5) * T4, 2 * FH + 2.4, (e.z0 + 1.5) * T4); group.add(warn);
      break;
    }
    case 'boiler': {
      const tank = cylM(1.1, 1.1, 2.4, lam(0x5a3a2a, 0x100602), e.x, y0 + 1.2, e.z, 16); group.add(tank);
      const glow = glowSprite(0xff7020, 2.5, 0.5); glow.position.set(e.x, y0 + 0.6, e.z + 1.15); group.add(glow);
      const l = new THREE.PointLight(0xff8040, 2.2, 9, 1.5); l.position.set(e.x, y0 + 1, e.z + 1.6); group.add(l);
      updaters.push((dt, t) => { l.intensity = 1.8 + Math.sin(t * 7) * 0.4 + Math.random() * 0.2; });
      break;
    }
    case 'stairwell': {
      const s = signPlane('ЛЕСТНИЦА ↑', 1.8, 0.4, '#0a4a2a', '#d0ffe0'); s.position.set(e.x, FH - 0.5, e.z - 6); group.add(s);
      const l = new THREE.PointLight(0x40ff90, 1.4, 10, 1.5); l.position.set(e.x, FH - 0.6, e.z - 4); group.add(l);
      break;
    }
    case 'morgue': {
      const steel = lam(0x9aa0a4);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        group.add(boxM(0.9, 0.55, 0.05, steel, e.x - 1.6 + c * 1.05, y0 + 0.5 + r * 0.65, e.z - 3.7), boxM(0.2, 0.05, 0.08, lam(0x333333), e.x - 1.6 + c * 1.05, y0 + 0.62 + r * 0.65, e.z - 3.65));
      }
      group.add(boxM(0.9, 0.85, 2.0, steel, e.x + 1, y0 + 0.42, e.z));
      break;
    }
    case 'surgery': {
      const lampTop = cylM(0.7, 0.9, 0.25, lam(0xdfe4e0, 0x404040), e.x, y0 + FH - 0.6, e.z, 16); group.add(lampTop);
      // без настоящего источника света (их число дорого обходится шейдерам) — светящийся диск и ореол
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), new THREE.MeshBasicMaterial({ color: 0xf0fff4 }));
      disc.rotation.x = Math.PI / 2; disc.position.set(e.x, y0 + FH - 0.74, e.z);
      const halo = glowSprite(0xe8fff0, 3, 0.5); halo.position.set(e.x, y0 + FH - 1.0, e.z);
      group.add(disc, halo, boxM(0.9, 0.9, 2.1, lam(0x6a8a80), e.x, y0 + 0.45, e.z));
      updaters.push(() => { halo.material.opacity = Math.random() < 0.03 ? 0.05 : 0.5; });
      break;
    }
    case 'collapse': {
      const debris = lam(0x7a7a70);
      for (let k = 0; k < 14; k++) {
        const m = boxM(0.3 + Math.random() * 0.5, 0.1 + Math.random() * 0.25, 0.3 + Math.random() * 0.5, debris,
          (e.x0 + Math.random() * (e.x1 - e.x0 + 1)) * T4, Math.random() < 0.5 ? 0.1 : y0 + 0.1, (e.z + (Math.random() < 0.5 ? -0.3 : 1.3)) * T4);
        m.rotation.set(Math.random(), Math.random() * 3, Math.random()); group.add(m);
      }
      break;
    }
    case 'glassroom': {
      const s = signPlane('ПЕРЕГОВОРНАЯ', 2.4, 0.45, '#e8e8e8', '#1a3a6a');
      s.position.set((e.x0 + 3.5) * T4, y0 + FH - 0.5, (e.z1 + 1) * T4 + 0.06); group.add(s);
      break;
    }
    case 'serverroom': {
      const l = new THREE.PointLight(0x4080ff, 2.2, 14, 1.5); l.position.set((e.x0 + e.x1 + 1) / 2 * T4, y0 + FH - 0.6, (e.z0 + e.z1 + 1) / 2 * T4); group.add(l);
      updaters.push((dt, t) => { l.intensity = 1.8 + (Math.sin(t * 11) > 0.9 ? 0.8 : 0); });
      break;
    }
    case 'reactor': {
      // ядро реактора: светящийся столб через все этажи
      const h = e.F * FH, core = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, h, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x40e0ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      core.position.set(e.x, h / 2, e.z); group.add(core);
      const l = new THREE.PointLight(0x40d0ff, 3, 26, 1.2); l.position.set(e.x, FH * 1.5, e.z); group.add(l);
      for (let f = 0; f < e.F; f++) { const gl = glowSprite(0x60e0ff, 7, 0.35); gl.position.set(e.x, f * FH + 1.8, e.z); group.add(gl); }
      updaters.push((dt, t) => { core.material.opacity = 0.25 + Math.sin(t * 2.2) * 0.1; l.intensity = 2.6 + Math.sin(t * 2.2) * 0.8; });
      break;
    }
    case 'airlock': {
      const col = { blue: 0x2a6aff, yellow: 0xffc020, red: 0xff2a20 }[e.col];
      const l = new THREE.PointLight(col, 1.8, 9, 1.5); l.position.set(e.x, y0 + FH - 0.5, e.z); group.add(l);
      const s = signPlane(`ШЛЮЗ · ${{ blue: 'СИНИЙ', yellow: 'ЖЁЛТЫЙ', red: 'КРАСНЫЙ' }[e.col]} ДОПУСК`, 2.6, 0.38, '#101418', '#' + col.toString(16).padStart(6, '0'));
      s.position.set(e.x, y0 + FH - 0.45, e.z); group.add(s);
      break;
    }
    case 'specimen': {
      // стеклянный бак с «образцом»
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.4, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x80ffd0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      glass.position.set(e.x, y0 + 1.2, e.z);
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), lam(0xc8b0a0, 0x200a04)); blob.position.set(e.x, y0 + 1.1, e.z);
      group.add(glass, blob, cylM(0.9, 0.9, 0.2, lam(0x30383c), e.x, y0 + 0.1, e.z, 16), cylM(0.9, 0.9, 0.2, lam(0x30383c), e.x, y0 + 2.4, e.z, 16));
      updaters.push((dt, t) => { blob.position.y = y0 + 1.1 + Math.sin(t * 0.8 + e.x) * 0.2; blob.scale.set(1, 1 + Math.sin(t * 1.3 + e.z) * 0.15, 1); });
      break;
    }
    case 'quarantine': {
      const l = new THREE.PointLight(0xff2010, 2, 12, 1.5); l.position.set(e.x, y0 + FH - 0.4, e.z); group.add(l);
      updaters.push((dt, t) => { l.intensity = 1 + Math.max(0, Math.sin(t * 4)) * 2; });
      break;
    }
    case 'stage': {
      const red = lam(0x7a0c14, 0x140204);
      for (const sx of [-1, 1]) { const c = boxM(3.2, FH - 0.4, 0.2, red, e.x + sx * 22, y0 + (FH - 0.4) / 2, e.z - 1.6); group.add(c); }
      group.add(boxM(40, 1.0, 0.2, red, e.x, y0 + FH - 0.6, e.z - 1.6));
      const l = new THREE.SpotLight(0xfff0d0, 8, 24, 0.5, 0.6, 1.2); l.position.set(e.x, y0 + FH - 0.3, e.z - 12); l.target.position.set(e.x, y0, e.z - 2); group.add(l, l.target);
      break;
    }
    case 'playroom': case 'library': case 'boilerroom': case 'piperoom': {
      const txt = { playroom: 'ИГРОВАЯ', library: 'БИБЛИОТЕКА', boilerroom: 'КОТЕЛЬНАЯ', piperoom: 'ТРУБНАЯ' }[e.k];
      const s = signPlane(txt, 2.2, 0.42, e.k === 'piperoom' ? '#2a1a0a' : '#f0e0c0', e.k === 'piperoom' ? '#ffb040' : '#4a2a10');
      s.position.set(e.x, y0 + FH - 0.6, e.z); group.add(s);
      break;
    }
    case 'drawing': {
      // детский рисунок на полу у стены (плоский лист); после события «рисунки оживают» он шевелится
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'); g.fillStyle = '#f4efe2'; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = ['#d02a2a', '#2a5ad0', '#2a9a3a', '#c0802a'][e.n % 4]; g.lineWidth = 4;
      g.beginPath(); g.arc(64, 38, 16, 0, 7); g.moveTo(64, 54); g.lineTo(64, 96); g.moveTo(40, 70); g.lineTo(88, 70); g.moveTo(64, 96); g.lineTo(46, 122); g.moveTo(64, 96); g.lineTo(82, 122); g.stroke();
      if (e.n % 3 === 0) { g.fillStyle = '#000'; g.fillRect(56, 34, 4, 4); g.fillRect(68, 34, 4, 4); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = (e.n * 1.3) % 6.28; m.position.set(e.x + ((e.n % 3) - 1), y0 + 0.02, e.z + ((e.n % 2) - 0.5));
      group.add(m);
      updaters.push((dt, tt) => { if (S.drawingsAlive) m.rotation.z += Math.sin(tt * 3 + e.n) * dt * 0.8; });
      break;
    }
    case 'furnace': {
      // раскалённый пол перед печью — предупреждающие полосы
      const hot = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 7.6), new THREE.MeshBasicMaterial({ color: 0xff4010, transparent: true, opacity: 0.18, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      hot.rotation.x = -Math.PI / 2; hot.position.set(e.x + (e.x < 90 ? 2 : -2), 0.03, e.z + (e.z < 90 ? 2 : -2)); group.add(hot);
      updaters.push((dt, t) => { hot.material.opacity = 0.14 + Math.sin(t * 2 + e.x) * 0.06; });
      break;
    }
    case 'gears': {
      // гигантские шестерни на стенах шахты
      const iron = lam(0x4a3a30, 0x0a0604);
      const make = (r) => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 24), iron)); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const tooth = boxM(0.4, 0.3, 0.5, iron, Math.cos(a) * (r + 0.2), 0, Math.sin(a) * (r + 0.2)); tooth.rotation.y = -a; g.add(tooth); } g.rotation.x = Math.PI / 2; return g; };
      const list = [];
      for (let f = 1; f < e.F; f++) {
        for (const [x, z, ry] of [[(e.x0 - 0.45) * T4, (e.z0 + 3) * T4, Math.PI / 2], [(e.x1 + 1.45) * T4, (e.z1 - 3) * T4, Math.PI / 2]]) {
          const g = make(1.4 + (f % 2) * 0.6); const holder = new THREE.Group(); holder.add(g); holder.position.set(x, f * FH + FH / 2, z); holder.rotation.y = ry; group.add(holder); list.push([g, f % 2 ? 1 : -1]);
        }
      }
      updaters.push((dt) => { for (const [g, dir] of list) g.rotation.y += dt * 0.25 * dir; });
      break;
    }
    case 'control': {
      const l = new THREE.PointLight(0xff3010, 2.4, 14, 1.4); l.position.set(e.x, y0 + FH - 0.6, e.z); group.add(l);
      updaters.push((dt, t) => { l.intensity = 1.8 + Math.sin(t * 1.4) * 0.6; });
      break;
    }
    case 'hall': break; // великий зал: архитектура целиком в геометрии
    case 'escalators': break; // эскалаторы рисует геометрия по стилю уровня
    case 'chandelier': {
      const y = y0 + FH - 0.25, gold = lam(0xc8a040, 0x302008), crystal = new THREE.MeshBasicMaterial({ color: 0xfff4d8 });
      const g = new THREE.Group();
      g.add(cylM(0.03, 0.03, 0.6, gold, 0, -0.3, 0, 5), cylM(0.9, 0.5, 0.12, gold, 0, -0.7, 0, 16));
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const c = cylM(0.03, 0.06, 0.28, crystal, Math.cos(a) * 0.75, -0.9, Math.sin(a) * 0.75, 6); g.add(c); }
      const glow = glowSprite(0xffe2a0, 3.4, 0.55); glow.position.y = -0.8; g.add(glow);
      g.position.set(e.x, y, e.z); group.add(g);
      updaters.push((dt, t) => { g.rotation.y = Math.sin(t * 0.3 + e.x) * 0.05; glow.material.opacity = 0.5 + Math.sin(t * 13 + e.z) * 0.03; });
      break;
    }
    case 'stairsign': {
      for (let f = e.f0; f <= e.f1; f++) {
        const s = signPlane(f === 0 ? 'ЛЕСТНИЦА · П' : `ЛЕСТНИЦА · ${f}`, 1.6, 0.36, '#2a5a2a', '#e0ffe0');
        s.position.set(e.x, f * FH + FH - 0.6, e.z); group.add(s);
      }
      break;
    }
    case 'svcdoor': {
      const s = signPlane('СЛУЖЕБНЫЙ ВХОД', 2.2, 0.36, '#4a1010', '#ffd0a0'); s.position.set(e.x, y0 + FH - 0.5, e.z - 2.0); group.add(s);
      break;
    }
    case 'roofsign': {
      const s = signPlane('ВЫХОД НА КРЫШУ →', 2.4, 0.4, '#0a4a2a', '#d0ffe0'); s.position.set(e.x - 4, y0 + FH - 0.5, e.z - 1.9); group.add(s);
      break;
    }
    case 'dummy': {
      // неподвижный манекен в витрине (настоящие манекены-существа выглядят так же — паранойя)
      const white = lam(0xe8e2d8, 0x18160f), g = new THREE.Group();
      g.add(cylM(0.2, 0.17, 0.75, white, 0, 1.25, 0, 12), cylM(0.17, 0.19, 0.25, white, 0, 0.85, 0, 12), cylM(0.07, 0.07, 0.8, white, -0.1, 0.4, 0, 8), cylM(0.07, 0.07, 0.8, white, 0.1, 0.4, 0, 8));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), white); head.position.y = 1.82; head.scale.set(0.9, 1.15, 0.95); g.add(head);
      g.position.set(e.x, y0, e.z); g.rotation.y = e.rot || 0; group.add(g);
      break;
    }
    case 'shopsign': {
      const names = ['МОДА', 'ОБУВЬ', 'ИГРУШКИ', 'КНИГИ', 'ЧАСЫ', 'ПАРФЮМ', 'ДЕТСКИЙ МИР', 'ЭЛЕКТРОНИКА', 'СПОРТ', 'ОПТИКА', 'ЦВЕТЫ', 'КОФЕ', 'АПТЕКА', 'ПОДАРКИ'];
      const cols = ['#c02a5a', '#2a6ac0', '#c0a02a', '#2ac07a', '#8a2ac0'];
      const sg = signPlane(names[e.n % names.length], 2.6, 0.5, '#111418', cols[e.n % cols.length]);
      sg.position.set(e.x, y0 + FH - 0.6, e.z); sg.rotation.y = e.horiz ? 0 : Math.PI / 2; group.add(sg);
      const lit = sg.material; updaters.push((dt, t) => { lit.opacity = 1; lit.color.setScalar(Math.random() < 0.01 ? 0.3 : 1); });
      break;
    }
    case 'entrance': {
      const s = signPlane('ТЦ «ГОРИЗОНТ» · ВХОД', 3.2, 0.5, '#1a2a4a', '#ffd040'); s.position.set(e.x, y0 + FH - 0.7, e.z + 1.9); group.add(s);
      break;
    }
    case 'secroom': {
      const s = signPlane('ОХРАНА', 1.6, 0.4, '#202020', '#ff6040'); s.position.set(e.x + 6 * T4 - 22, y0 + FH - 0.6, e.z + 6); s.rotation.y = Math.PI / 2; group.add(s);
      break;
    }
    case 'roofgen': {
      const smoke = glowSprite(0x606060, 3, 0.2); smoke.position.set(e.x + 0.8, y0 + 3.2, e.z + 0.3); group.add(smoke);
      break;
    }
    case 'cinema': {
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.2), new THREE.MeshBasicMaterial({ color: 0xc8d0d8, fog: false }));
      scr.position.set(e.x, y0 + 2.4, e.z - 0.3); scr.rotation.y = Math.PI; group.add(scr);
      const s = signPlane('АВАРИЙНЫЙ ВЫХОД', 2.0, 0.36, '#0a5a2a', '#d0ffe0'); s.position.set(31.5 * T4, y0 + 3.0, e.z - 0.4); s.rotation.y = Math.PI; group.add(s);
      updaters.push((dt, t) => { const k = 0.35 + Math.abs(Math.sin(t * 0.7)) * 0.3 + (Math.random() < 0.05 ? 0.4 : 0); scr.material.color.setRGB(k * 0.8, k * 0.85, k); });
      break;
    }
  }
}

/* ------------- Таблички с номерами на дверях (отель): один атлас и одна геометрия ------------- */
export function buildDoorPlates(map) {
  const rooms = map.lv && map.lv.rooms;
  if (!rooms || !rooms.length) return null;
  const COLS = 16, CW = 64, CH = 32, rows = Math.ceil(rooms.length / COLS);
  const c = document.createElement('canvas'); c.width = COLS * CW; c.height = Math.max(32, 2 ** Math.ceil(Math.log2(rows * CH)));
  const g = c.getContext('2d');
  rooms.forEach((r, k) => {
    const x = (k % COLS) * CW, y = Math.floor(k / COLS) * CH;
    g.fillStyle = '#b8902c'; g.fillRect(x + 2, y + 2, CW - 4, CH - 4);
    g.strokeStyle = '#5a3a10'; g.lineWidth = 2; g.strokeRect(x + 4, y + 4, CW - 8, CH - 8);
    g.fillStyle = '#1a1006'; g.font = 'bold 20px "Courier New"'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(r.num), x + CW / 2, y + CH / 2 + 1);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const pos = [], uv = [], idx = [];
  const uvOf = (k) => { const u0 = (k % COLS) * CW / c.width, v0 = 1 - (Math.floor(k / COLS) + 1) * CH / c.height; return [u0, v0, u0 + CW / c.width, v0 + CH / c.height]; };
  rooms.forEach((r, k) => {
    // табличка на стене коридора рядом с проёмом: сбоку от двери, лицом в коридор
    const sx = -r.nz, sz = r.nx, cx = BR.centerX(r.door), cz = BR.centerZ(r.door), y = r.f * map.FH + 1.65;
    const px = cx + sx * 2.6 + r.nx * 2.02, pz = cz + sz * 2.6 + r.nz * 2.02, w = 0.22, h = 0.11;
    const base = pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pos.push(px + sx * a * w, y + b * h, pz + sz * a * w);
    const [u0, v0, u1, v1] = uvOf(k);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  // «неправильные» коридоры: номера на дверях, на которые никто не смотрит, иногда меняются местами
  const uvAttr = geo.attributes.uv, shown = rooms.map((_, k) => k);
  let t = 0;
  function update(dt, cam, fwd, keyCells) {
    t += dt;
    if (t < 2.5) return;
    t = 0;
    const k = Math.floor(Math.random() * rooms.length), r = rooms[k];
    if (keyCells.has(r.f + ':' + r.cells[4])) return; // номер с ключом не трогаем — по нему решают загадку
    const cx = BR.centerX(r.door), cz = BR.centerZ(r.door);
    const dx = cx - cam.x, dz = cz - cam.z, d = Math.hypot(dx, dz);
    if (d < 30 && (dx * fwd.x + dz * fwd.z) / (d || 1) > -0.2) return; // на виду — не меняем
    const same = rooms.map((q, j) => j).filter((j) => rooms[j].f === r.f && j !== k && !keyCells.has(rooms[j].f + ':' + rooms[j].cells[4]));
    if (!same.length) return;
    const j = same[Math.floor(Math.random() * same.length)];
    [shown[k], shown[j]] = [shown[j], shown[k]];
    for (const q of [k, j]) { const [u0, v0, u1, v1] = uvOf(shown[q]); uvAttr.array.set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8); }
    uvAttr.needsUpdate = true;
  }
  return { mesh, update, dispose() { geo.dispose(); tex.dispose(); mesh.material.dispose(); } };
}
