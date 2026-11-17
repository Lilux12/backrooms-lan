// Интерактивные объекты уровня: предметы, щиток, рычаги, дверь…
import * as THREE from 'three';
import { BR, TILE, rand } from '../core/util.js';
import { FL, S } from '../core/state.js';
import { camera } from '../render/scene.js';
import { basic, glowSprite, lam, textPlane } from '../render/textures.js';
import { G, H, map, objs } from './world.js';
import { bx, cy } from './props.js';

let arrowMat = null;
function getArrowMat() {
  if (arrowMat) return arrowMat;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(70,255,140,.95)';
  g.beginPath(); g.moveTo(64, 6); g.lineTo(118, 62); g.lineTo(86, 62); g.lineTo(86, 120); g.lineTo(42, 120); g.lineTo(42, 62); g.lineTo(10, 62); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,70,30,.9)'; g.lineWidth = 5; g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (arrowMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
}
export const LEVER_COL = [0xd43a2f, 0x2f6fd4, 0x2fb34a, 0xe8c02a];

export function createObj(o) {
  const grp = new THREE.Group();
  const rec = { o, group: grp, parts: {} };
  switch (o.kind) {
    case 'water': {
      const glass = new THREE.MeshLambertMaterial({ color: 0xbfefff, emissive: 0x2a7c8c, transparent: true, opacity: 0.9 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 12), glass);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 0.1, 12), glass); neck.position.y = 0.22;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), lam(0xffffff, 0x888888)); cap.position.y = 0.3;
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.103, 0.103, 0.12, 12), lam(0xffd36a, 0x6a4a10)); label.position.y = -0.02;
      grp.add(body, neck, cap, label, glowSprite(0x80e0ff, 1.3, 0.5));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'fuse': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 10), lam(0xe8e0d0, 0x403828));
      const capA = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10), lam(0xc0a060, 0x604818)); capA.position.y = 0.17;
      const capB = capA.clone(); capB.position.y = -0.17;
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), basic(0xff8a30));
      grp.add(body, capA, capB, wire, glowSprite(0xffa030, 1.6, 0.6));
      grp.rotation.z = Math.PI / 2;
      grp.position.set(o.x, 0.9, o.z); rec.bob = true;
      break;
    }
    case 'box': {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.8, 0.5), lam(0x4a5058));
      cab.position.y = 0.9;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      screen.position.set(0, 1.4, 0.26);
      const slots = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.05), lam(0x23272b)); slots.position.set(0, 0.9, 0.26);
      grp.add(cab, screen, slots);
      grp.position.set(o.x, 0, o.z);
      rec.parts.screen = screen; rec.face = true;
      break;
    }
    case 'digit': {
      const m = textPlane((g, s) => {
        g.clearRect(0, 0, s, s);
        g.fillStyle = 'rgba(180,15,10,.92)'; g.font = 'bold 190px "Courier New"'; g.textAlign = 'center';
        g.fillText(String(o.digit), 128, 175);
        g.fillRect(100, 188, 8, 28); g.fillRect(150, 192, 6, 40); // потёки
        g.font = 'bold 30px "Courier New"'; g.fillStyle = 'rgba(180,15,10,.8)';
        g.fillText(`${o.idx + 1} / 4`, 128, 240);
      });
      m.position.set(o.x, 1.6, o.z);
      m.rotation.y = Math.atan2(o.nx, o.nz);
      m.rotation.z = rand(-0.08, 0.08);
      if (o.uv) { // люминесцентная краска: зелёное свечение, видно только в луче фонаря
        m.material.color.setHex(0x60ff9a); m.material.fog = false; m.material.opacity = 0; m.material.transparent = true;
        m.material.blending = THREE.AdditiveBlending; m.material.depthWrite = false;
        rec.uvMat = m.material;
      }
      grp.add(m);
      break;
    }
    case 'note': {
      const m = textPlane((g, s) => {
        g.save(); g.translate(128, 128); g.rotate(0.05);
        g.fillStyle = '#e9e2c6'; g.fillRect(-90, -110, 180, 220);
        g.fillStyle = 'rgba(40,34,18,.7)';
        for (let i = 0; i < 9; i++) g.fillRect(-70, -85 + i * 22, 100 + ((i * 37) % 40), 4);
        g.fillStyle = '#b83a2a'; g.fillRect(-60, 100 - 12, 40, 4);
        g.restore();
      }, 0.9);
      m.position.set(o.x, 1.5, o.z);
      m.rotation.y = Math.atan2(o.nx, o.nz);
      grp.add(m, glowSprite(0xfff0b0, 1.3, 0.25));
      grp.children[1].position.set(o.x, 1.5, o.z);
      break;
    }
    case 'keypad': {
      const door = G.doorObj || { dx: 0, dz: 1 };
      const px = -door.dz, pz = door.dx; // сбоку от прохода
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.25, 0.35), lam(0x2a2f35));
      stand.position.y = 0.62;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      screen.position.set(0, 1.0, 0.18);
      grp.add(stand, screen);
      grp.position.set(o.x + px * 1.35, 0, o.z + pz * 1.35);
      grp.rotation.y = Math.atan2(-px, -pz);
      rec.parts.screen = screen;
      break;
    }
    case 'plate': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 1.9), lam(0x3a3d42));
      base.position.y = 0.05;
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.5), new THREE.MeshLambertMaterial({ color: 0x884422, emissive: 0x331100 }));
      top.position.y = 0.07;
      grp.add(base, top);
      grp.position.set(o.x, 0, o.z);
      rec.parts.top = top;
      rec.glow = glowSprite(0x40ff70, 3.4, 0.0); rec.glow.position.y = 0.4; grp.add(rec.glow);
      break;
    }
    case 'lever': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.5), lam(0x4a4f55)); base.position.y = 0.45;
      const arm = new THREE.Group(); arm.position.set(0, 0.95, 0);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), lam(0xb0b4b8)); stick.position.y = 0.4;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), lam(LEVER_COL[o.col], LEVER_COL[o.col] & 0x555555)); knob.position.y = 0.82;
      arm.add(stick, knob); arm.rotation.z = 0.9;
      const lampM = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0x661010 }));
      lampM.position.set(0, 0.75, 0.26);
      grp.add(base, arm, lampM, glowSprite(LEVER_COL[o.col], 1.4, 0.35));
      grp.children[3].position.y = 1.6;
      grp.position.set(o.x, 0, o.z);
      rec.parts.arm = arm; rec.parts.lampM = lampM; rec.face = true;
      break;
    }
    case 'mapitem': {
      const paper = new THREE.Group();
      const sheet = bx(0.56, 0.03, 0.42, lam(0xe6dcb8, 0x4a4228));
      const face = textPlane((g, s) => {
        g.fillStyle = '#e6dcb8'; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(40,90,150,.8)'; g.lineWidth = 3;
        for (let p = 16; p < s; p += 32) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); }
        g.strokeStyle = '#1b2a40'; g.lineWidth = 9; g.beginPath(); g.moveTo(30, 200); g.lineTo(30, 70); g.lineTo(130, 70); g.lineTo(130, 150); g.lineTo(220, 150); g.stroke();
        g.fillStyle = '#c52a1e'; g.font = 'bold 70px "Courier New"'; g.fillText('X', 168, 112);
      }, 0.5, false);
      face.rotation.x = -Math.PI / 2; face.position.y = 0.02; face.scale.y = 0.75;
      paper.add(sheet, face); paper.rotation.x = 0.35;
      grp.add(paper, glowSprite(0x7fc0ff, 2.4, 0.5), glowSprite(0xffe090, 1.2, 0.5));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'arrow': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), getArrowMat());
      m.rotation.x = -Math.PI / 2;
      grp.add(m);
      grp.position.set(o.x, 0.03, o.z);
      grp.rotation.y = Math.atan2(-o.dx, -o.dz);
      break;
    }
    case 'valve': {
      // большой вентиль на трубе с манометром (стрелка показывает давление 0..3)
      const col = [0xc8302a, 0x2f62c8, 0xd8b020][o.col];
      const pipe = cy(0.16, 0.16, 2.2, lam(0x5a6066), 0, 1.1, 0, 12);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 20), lam(col, col & 0x333333));
      wheel.position.set(0, 1.25, 0.24);
      for (let k = 0; k < 3; k++) { const sp = bx(0.8, 0.04, 0.04, lam(col), 0, 1.25, 0.24); sp.rotation.z = k * Math.PI / 3; grp.add(sp); }
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color: 0xf2efe2 }));
      dial.position.set(0, 1.9, 0.18);
      const needle = bx(0.02, 0.17, 0.01, basic(0x111111), 0, 0.07, 0);
      const nPivot = new THREE.Group(); nPivot.position.set(0, 1.9, 0.19); nPivot.add(needle);
      for (let k = 0; k <= 3; k++) { const t = bx(0.015, 0.05, 0.01, basic(k ? 0x222222 : 0xaa2222), 0, 0.16, 0); const g2 = new THREE.Group(); g2.position.copy(nPivot.position); g2.rotation.z = 1.2 - k * 0.8; g2.add(t); grp.add(g2); }
      grp.add(pipe, wheel, dial, nPivot, glowSprite(col, 1.4, 0.25));
      grp.children[grp.children.length - 1].position.y = 1.3;
      grp.position.set(o.x, 0, o.z);
      rec.parts = { wheel, needle: nPivot }; rec.face = true;
      break;
    }
    case 'drain': {
      const base = bx(0.7, 1.0, 0.5, lam(0x3a3f45), 0, 0.5, 0);
      const arm = new THREE.Group(); arm.position.set(0, 1.05, 0);
      arm.add(cy(0.05, 0.05, 0.9, lam(0xb0b4b8), 0, 0.45, 0, 8), new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), lam(0xff3020, 0x551008)));
      arm.children[1].position.y = 0.92; arm.rotation.z = 0.8;
      const sign = textPlane((g) => { g.fillStyle = '#d8d2b0'; g.fillRect(20, 80, 216, 96); g.fillStyle = '#7a1a10'; g.font = 'bold 44px Courier New'; g.textAlign = 'center'; g.fillText('СЛИВ', 128, 142); }, 0.8);
      sign.position.set(0, 0.6, 0.26);
      grp.add(base, arm, sign, glowSprite(0xff5030, 1.4, 0.3));
      grp.children[3].position.y = 1.6;
      grp.position.set(o.x, 0, o.z);
      rec.parts.arm = arm; rec.face = true;
      break;
    }
    case 'paper': case 'lore': {
      // записка/кассета: на стене (если есть нормаль) или на подставке
      const isTape = (o.kind === 'lore' || o.tape != null) && /плёнк|касс/i.test(o.title || '');
      const m = textPlane((g) => {
        g.save(); g.translate(128, 128); g.rotate(0.04);
        if (isTape) {
          g.fillStyle = '#1a1a1a'; g.fillRect(-100, -62, 200, 124); g.fillStyle = '#d8d0b0'; g.fillRect(-80, -48, 160, 34);
          g.fillStyle = '#444'; g.beginPath(); g.arc(-45, 22, 20, 0, 7); g.arc(45, 22, 20, 0, 7); g.fill();
        } else {
          g.fillStyle = o.kind === 'paper' ? '#dfe8e8' : '#e9e2c6'; g.fillRect(-90, -110, 180, 220);
          g.fillStyle = 'rgba(40,34,18,.7)';
          for (let i = 0; i < 9; i++) g.fillRect(-70, -85 + i * 22, 100 + ((i * 37) % 40), 4);
        }
        g.restore();
      }, 0.9);
      if (o.nx !== undefined) { m.position.set(o.x, 1.5, o.z); m.rotation.y = Math.atan2(o.nx, o.nz); grp.add(m); }
      else {
        const stand = bx(0.5, 1.1, 0.4, lam(0x4a4f55), 0, 0.55, 0);
        m.rotation.x = -Math.PI / 2.6; m.position.set(0, 1.2, 0);
        const g2 = new THREE.Group(); g2.add(stand, m); g2.position.set(o.x, 0, o.z); grp.add(g2);
      }
      const gl = glowSprite(0xfff0b0, 1.3, 0.25); gl.position.set(o.x + (o.nx || 0) * 0.2, 1.5, o.z + (o.nz || 0) * 0.2); grp.add(gl);
      break;
    }
    case 'gateplate': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 2.2), lam(0x2f3a40));
      base.position.y = 0.06;
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 1.7), new THREE.MeshLambertMaterial({ color: 0x2a6080, emissive: 0x0a2030 }));
      top.position.y = 0.09;
      grp.add(base, top);
      grp.position.set(o.x, 0, o.z);
      rec.parts.top = top;
      rec.glow = glowSprite(0x40c0ff, 3.4, 0.2); rec.glow.position.y = 0.4; grp.add(rec.glow);
      break;
    }
    case 'keycard': {
      const card = bx(0.5, 0.32, 0.02, lam(0xe8e8e8, 0x404040), 0, 0, 0);
      const stripe = bx(0.5, 0.07, 0.025, basic(0x2050c0), 0, 0.08, 0);
      const chip = bx(0.08, 0.06, 0.03, basic(0xd0a030), -0.15, -0.04, 0);
      grp.add(card, stripe, chip, glowSprite(0x80b0ff, 1.6, 0.6));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'pump': {
      const body = bx(1.2, 1.4, 0.7, lam(0x355060), 0, 0.7, 0);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      screen.position.set(0, 1.1, 0.36);
      const slot = bx(0.25, 0.04, 0.05, basic(0x111111), 0, 0.75, 0.36);
      grp.add(body, screen, slot, cy(0.12, 0.12, 1.4, lam(0x5a6066), 0.75, 0.7, 0, 10));
      grp.position.set(o.x, 0, o.z);
      rec.parts.screen = screen; rec.face = true;
      break;
    }
    case 'cage': {
      // клетка из прутьев; кто внутри — видно только вблизи (сервер присылает cageview)
      const bar = lam(0x50565c), H2 = 2.4;
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; grp.add(cy(0.035, 0.035, H2, bar, Math.cos(a) * 1.1, H2 / 2, Math.sin(a) * 1.1, 6)); }
      grp.add(cy(1.2, 1.2, 0.1, bar, 0, H2, 0, 16), cy(1.2, 1.2, 0.1, bar, 0, 0.05, 0, 16));
      const fig = new THREE.Group();
      fig.add(cy(0.22, 0.25, 0.9, lam(0x6a6a72), 0, 0.75, 0, 10), new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), lam(0xd8b898)));
      fig.children[1].position.y = 1.35; fig.rotation.x = 0.5; fig.position.y = -0.2; fig.visible = false;
      let tag = null;
      grp.add(fig);
      grp.position.set(o.x, 0, o.z);
      rec.parts.setPrisoner = (name) => {
        fig.visible = !!name;
        if (tag) { grp.remove(tag); tag = null; }
        if (name) {
          tag = textPlane((g) => { g.clearRect(0, 0, 256, 256); g.fillStyle = '#ffb090'; g.font = 'bold 30px Courier New'; g.textAlign = 'center'; g.fillText(name, 128, 128); }, 1.6);
          tag.position.y = 2.9; tag.onBeforeRender = (r, sc, cam) => tag.quaternion.copy(cam.quaternion);
          grp.add(tag);
        }
      };
      break;
    }
    case 'detector': {
      grp.add(bx(0.18, 0.3, 0.08, lam(0x2a2e33), 0, 0, 0), bx(0.12, 0.08, 0.01, basic(0x30ff60), 0, 0.06, 0.045), cy(0.012, 0.012, 0.25, lam(0x999999), 0.05, 0.25, 0, 5), glowSprite(0x60ff90, 1.3, 0.5));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'noisemaker': {
      grp.add(cy(0.09, 0.09, 0.22, lam(0xd04020, 0x300a05), 0, 0, 0, 10), cy(0.03, 0.03, 0.08, lam(0xdddddd), 0, 0.15, 0, 6), glowSprite(0xff8040, 1.1, 0.45));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'pad': {
      grp.add(cy(1.0, 1.0, 0.12, lam(0x3070ff, 0x081840), 0, 0.3, 0, 20), cy(1.05, 1.05, 0.06, lam(0x222222), 0, 0.22, 0, 20));
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; grp.add(cy(0.04, 0.04, 0.25, lam(0x888888), Math.cos(a) * 0.95, 0.12, Math.sin(a) * 0.95, 5)); }
      grp.position.set(o.x, 0, o.z);
      break;
    }
    case 'trap': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: 0xb050ff }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.05;
      grp.add(ring, glowSprite(0xb050ff, 2.4, 0.35));
      grp.children[1].position.y = 0.4;
      grp.position.set(o.x, 0, o.z);
      break;
    }
    case 'medkit': {
      grp.add(bx(0.42, 0.28, 0.22, lam(0xf2f2ee, 0x202020), 0, 0, 0), bx(0.06, 0.18, 0.225, basic(0xd42020), 0, 0, 0), bx(0.18, 0.06, 0.225, basic(0xd42020), 0, 0, 0),
        bx(0.2, 0.04, 0.04, lam(0x333333), 0, 0.16, 0), glowSprite(0xff5050, 1.2, 0.4));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'altar': {
      const stone = lam(0x3c3a36, 0x0a0806);
      grp.add(cy(0.7, 0.85, 0.9, stone, 0, 0.45, 0, 8), cy(0.55, 0.6, 0.12, lam(0x55504a), 0, 0.96, 0, 8));
      const flame = glowSprite(0xffc070, 2.2, 0.7); flame.position.y = 1.4; grp.add(flame);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; grp.add(cy(0.04, 0.05, 0.25, lam(0xe8dcc0, 0x302010), Math.cos(a) * 0.45, 1.15, Math.sin(a) * 0.45, 6)); }
      const lightA = new THREE.PointLight(0xffb060, 2.5, 9, 1.5); lightA.position.y = 1.6; grp.add(lightA);
      grp.position.set(o.x, 0, o.z);
      rec.parts = { flame, light: lightA };
      break;
    }
    case 'switch': {
      // удерживаемый переключатель: рубильник, генератор, плита, кнопка, стойка ресепшена
      const st = o.style || 'button';
      const lampMat = new THREE.MeshBasicMaterial({ color: 0x661010 });
      let lampM;
      if (st === 'plate') {
        grp.add(bx(2.0, 0.1, 2.0, lam(0x3a3d42), 0, 0.05, 0));
        const top = bx(1.6, 0.12, 1.6, new THREE.MeshLambertMaterial({ color: 0x884422, emissive: 0x331100 }), 0, 0.08, 0);
        grp.add(top); rec.parts.top = top;
        lampM = bx(0.3, 0.05, 0.3, lampMat, 0, 0.16, 0);
      } else if (st === 'generator') {
        grp.add(bx(1.6, 1.0, 0.9, lam(0x5a6a2a, 0x0a0c04), 0, 0.5, 0), bx(1.4, 0.15, 0.8, lam(0x2a2e22), 0, 1.07, 0),
          cy(0.06, 0.06, 0.7, lam(0x333333), 0.55, 1.4, 0.2, 8), bx(0.5, 0.35, 0.05, lam(0x1a1a1a), -0.4, 0.62, 0.46));
        lampM = bx(0.12, 0.12, 0.05, lampMat, -0.4, 0.86, 0.47);
        rec.parts.vib = true;
      } else if (st === 'breaker') {
        grp.add(bx(0.8, 1.2, 0.3, lam(0x4a5058), 0, 1.3, 0), bx(0.1, 0.5, 0.1, lam(0xb0b4b8), 0, 1.3, 0.2));
        const arm = new THREE.Group(); arm.position.set(0, 1.3, 0.25);
        arm.add(bx(0.08, 0.6, 0.08, lam(0xc02020, 0x300000), 0, 0.3, 0)); arm.rotation.x = 0.8;
        grp.add(arm); rec.parts.arm = arm;
        grp.add(bx(0.12, 1.3, 0.12, lam(0x30343a), 0, 0.65, 0));
        lampM = bx(0.15, 0.1, 0.05, lampMat, 0, 1.85, 0.16);
      } else if (st === 'pump') {
        grp.add(bx(0.6, 0.9, 0.5, lam(0x8a2a1a, 0x100302), 0, 0.45, 0), cy(0.06, 0.06, 0.9, lam(0x9aa0a4), 0, 1.3, 0, 8));
        const arm = new THREE.Group(); arm.position.set(0, 1.7, 0); arm.add(bx(0.8, 0.07, 0.07, lam(0x222222), 0.3, 0, 0)); grp.add(arm);
        rec.parts.arm = arm;
        lampM = bx(0.12, 0.12, 0.05, lampMat, 0, 0.75, 0.26);
      } else if (st === 'key') {
        grp.add(bx(0.7, 1.2, 0.5, lam(0x2a3034), 0, 0.6, 0), bx(0.5, 0.35, 0.05, lam(0xd8b020), 0, 1.0, 0.26));
        const keyArm = new THREE.Group(); keyArm.position.set(0, 1.0, 0.3); keyArm.add(bx(0.06, 0.18, 0.06, lam(0xc8c8c0), 0, 0, 0)); grp.add(keyArm);
        rec.parts.arm = keyArm;
        lampM = bx(0.12, 0.12, 0.05, lampMat, 0, 1.3, 0.26);
      } else if (st === 'swing') {
        const frame = lam(0x8a3030);
        grp.add(cy(0.05, 0.05, 2.6, frame, -0.9, 1.3, 0, 6), cy(0.05, 0.05, 2.6, frame, 0.9, 1.3, 0, 6), cy(0.05, 0.05, 1.9, frame, 0, 2.6, 0, 6));
        grp.children[2].rotation.z = Math.PI / 2;
        const sw = new THREE.Group(); sw.position.set(0, 2.6, 0);
        sw.add(cy(0.01, 0.01, 1.9, lam(0x888888), -0.3, -0.95, 0, 4), cy(0.01, 0.01, 1.9, lam(0x888888), 0.3, -0.95, 0, 4), bx(0.7, 0.06, 0.3, lam(0x3a6aa0), 0, -1.9, 0));
        grp.add(sw); rec.parts.swing = sw;
        lampM = bx(0.1, 0.1, 0.1, lampMat, 0, 2.7, 0);
      } else if (st === 'console') {
        grp.add(bx(1.4, 1.0, 0.8, lam(0x2a2420), 0, 0.5, 0), bx(1.4, 0.1, 0.9, lam(0x1a1614), 0, 1.05, 0));
        const scr = bx(1.0, 0.6, 0.05, new THREE.MeshBasicMaterial({ color: 0x401008 }), 0, 1.5, -0.3); scr.rotation.x = -0.3; grp.add(scr);
        lampM = bx(0.2, 0.08, 0.05, lampMat, 0, 1.12, 0.3);
      } else if (st === 'desk') {
        grp.add(bx(2.2, 1.05, 0.7, lam(0x6b5a44), 0, 0.52, 0), bx(2.3, 0.06, 0.8, lam(0x2b2b2b), 0, 1.08, 0));
        lampM = cy(0.1, 0.12, 0.08, lampMat, 0.6, 1.16, 0.1, 12);
        grp.add(cy(0.03, 0.03, 0.12, lam(0xc8c8c8), 0.6, 1.24, 0.1, 6));
      } else {
        grp.add(cy(0.18, 0.25, 1.0, lam(0x2a2f35), 0, 0.5, 0, 10));
        lampM = cy(0.12, 0.12, 0.08, lampMat, 0, 1.04, 0, 14);
      }
      grp.add(lampM);
      rec.glow = glowSprite(0xff3020, 1.6, 0.35); rec.glow.position.y = st === 'plate' ? 0.5 : 1.5; grp.add(rec.glow);
      rec.parts.lampM = lampM;
      grp.position.set(o.x, 0, o.z);
      break;
    }
    case 'steamvalve': {
      grp.add(cy(0.18, 0.18, 2.6, lam(0x6a4a3a), 0, 1.3, 0, 10), bx(0.5, 0.5, 0.5, lam(0x4a3a30), 0, 1.0, 0));
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 20), lam(0xc02a20, 0x300806));
      wheel.position.set(0, 1.25, 0.3);
      for (let k = 0; k < 3; k++) { const sp = bx(0.84, 0.04, 0.04, lam(0xc02a20), 0, 0, 0); sp.rotation.z = k * Math.PI / 3; wheel.add(sp); }
      const gauge = cy(0.16, 0.16, 0.05, lam(0xeeeeee), 0.35, 1.7, 0.27, 16); gauge.rotation.x = Math.PI / 2;
      const lampV = bx(0.14, 0.14, 0.05, new THREE.MeshBasicMaterial({ color: 0x661010 }), -0.35, 1.7, 0.27);
      grp.add(wheel, gauge, lampV);
      grp.position.set(o.x, 0, o.z);
      rec.parts = { wheel, lampV };
      break;
    }
    case 'radio': {
      grp.add(bx(0.9, 0.75, 0.6, lam(0x5a4a38), 0, 0.37, 0), bx(0.5, 0.28, 0.18, lam(0x2a2a2a), 0, 0.88, 0),
        cy(0.01, 0.01, 0.6, lam(0x999999), 0.18, 1.3, 0, 4), bx(0.3, 0.12, 0.02, basic(0xff9030), -0.05, 0.92, 0.1), glowSprite(0xffa040, 1.0, 0.3));
      grp.children[4].position.set(0, 1.1, 0);
      grp.position.set(o.x, 0, o.z);
      break;
    }
    case 'monitor': {
      const screenTex = textPlane((g, sz) => {
        g.fillStyle = '#0a140a'; g.fillRect(0, 0, sz, sz);
        for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(150,255,150,${Math.random() * 0.35})`; g.fillRect(Math.random() * sz, Math.random() * sz, 2, 2); }
        g.fillStyle = 'rgba(120,255,140,.9)'; g.font = 'bold 26px "Courier New"'; g.fillText('CAM 0' + (1 + (o.id % 8)), 14, 34); g.fillText('REC ●', 150, 34);
      }, 0.55, false).material;
      screenTex.fog = false;
      grp.add(bx(1.4, 0.8, 0.7, lam(0x3a342c), 0, 0.4, 0));
      for (const [x, y] of [[-0.35, 1.08], [0.35, 1.08], [0, 1.6]]) {
        grp.add(bx(0.62, 0.5, 0.5, lam(0x2c2c2c), x, y, -0.05));
        const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38), screenTex); sc.position.set(x, y, 0.21); grp.add(sc);
      }
      grp.add(glowSprite(0x80ff90, 2.2, 0.25)); grp.children[grp.children.length - 1].position.y = 1.3;
      grp.position.set(o.x, 0, o.z);
      break;
    }
    case 'lift': {
      const [dx, dz] = BR.D4[o.d || 0];
      grp.add(bx(TILE - 0.4, 0.04, TILE - 0.4, lam(0x6a6a6e), 0, 0.02, 0));
      const panel = bx(0.3, 0.5, 0.08, lam(0x2c2c30), 0, 1.3, 0); panel.position.set(-dz * 1.6 + dx * 0, 1.3, dx * 1.6);
      const btn = bx(0.12, 0.12, 0.1, basic(o.broken ? 0x331111 : 0xffb030), panel.position.x, 1.36, panel.position.z);
      const sign = textPlane((g, sz) => { g.fillStyle = '#111'; g.fillRect(0, 60, sz, 136); g.fillStyle = o.broken ? '#552222' : '#ff6a20'; g.font = 'bold 90px "Courier New"'; g.textAlign = 'center'; g.fillText(String(o.f + 1), 128, 165); }, 0.6, false);
      sign.position.set(-dx * 1.6, 2.5, -dz * 1.6); sign.rotation.y = Math.atan2(dx, dz); sign.material.fog = false;
      grp.add(panel, btn, sign);
      grp.position.set(o.x, 0, o.z);
      break;
    }
    case 'key': {
      const brass = lam(0xd8b040, 0x302008);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 14), brass);
      grp.add(ring, bx(0.03, 0.22, 0.02, brass, 0, -0.18, 0), bx(0.07, 0.03, 0.02, brass, 0.035, -0.26, 0),
        bx(0.18, 0.1, 0.01, lam(0xe8e0c8), 0.1, 0.05, 0), glowSprite(0xffd060, 1.2, 0.45));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'keyslot': {
      const wood = lam(0x5a3a20);
      grp.add(bx(1.2, 0.9, 0.12, wood, 0, 1.5, 0), bx(1.3, 1.1, 0.06, lam(0x3a2412), 0, 1.5, -0.06));
      for (let k = 0; k < 4; k++) {
        const hook = bx(0.04, 0.12, 0.08, lam(0xc0a050), -0.42 + k * 0.28, 1.65, 0.08); grp.add(hook);
        const tag = bx(0.12, 0.18, 0.02, lam(0xe8e0c8), -0.42 + k * 0.28, 1.45, 0.09); grp.add(tag);
      }
      grp.add(cy(0.08, 0.1, 1.0, lam(0x30343a), 0, 0.5, 0, 8));
      grp.position.set(o.x, 0, o.z);
      break;
    }
    case 'phone': {
      grp.add(bx(0.5, 0.75, 0.5, lam(0x3a2414), 0, 0.37, 0), bx(0.28, 0.1, 0.22, lam(0x101010), 0, 0.8, 0),
        cy(0.08, 0.08, 0.03, lam(0xd8d0c0), 0, 0.86, 0, 12), bx(0.3, 0.06, 0.07, lam(0x101010), 0, 0.9, -0.06));
      rec.parts.glow = glowSprite(0xffe0a0, 0.9, 0); rec.parts.glow.position.y = 1.1; grp.add(rec.parts.glow);
      grp.position.set(o.x, 0, o.z); rec.ring = true;
      break;
    }
    case 'fuelcan': {
      grp.add(bx(0.32, 0.42, 0.16, lam(0xc02018, 0x200402), 0, 0, 0), bx(0.08, 0.1, 0.06, lam(0x222222), 0.1, 0.25, 0), bx(0.2, 0.04, 0.04, lam(0x222222), -0.04, 0.24, 0),
        glowSprite(0xff6040, 1.3, 0.45));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'mallfuse': {
      grp.add(cy(0.08, 0.08, 0.36, lam(0xe0e0d8, 0x202020), 0, 0, 0, 10), cy(0.1, 0.1, 0.06, lam(0xd0a040), 0, 0.2, 0, 10), cy(0.1, 0.1, 0.06, lam(0xd0a040), 0, -0.2, 0, 10), glowSprite(0xffa030, 1.5, 0.55));
      grp.rotation.z = Math.PI / 2; grp.position.set(o.x, 0.9, o.z); rec.bob = true;
      break;
    }
    case 'genroof': {
      grp.add(bx(2.2, 1.2, 1.2, lam(0x3a5a3a, 0x060a06), 0, 0.6, 0), bx(2.0, 0.2, 1.0, lam(0x202420), 0, 1.3, 0),
        cy(0.09, 0.09, 1.6, lam(0x333333), 0.8, 1.9, 0.3, 8), bx(0.5, 0.5, 0.05, lam(0x1a1a1a), -0.6, 0.8, 0.61), bx(0.15, 0.25, 0.1, lam(0xc02020), -0.6, 0.8, 0.66));
      const lampG = bx(0.14, 0.14, 0.05, new THREE.MeshBasicMaterial({ color: 0x661010 }), 0.2, 1.0, 0.61); grp.add(lampG);
      grp.position.set(o.x, 0, o.z);
      rec.parts.lampG = lampG;
      break;
    }
    case 'labcard': {
      const col = { blue: 0x2a6aff, yellow: 0xffc020, red: 0xff2a20 }[o.group] || 0xffffff;
      grp.add(bx(0.32, 0.2, 0.015, lam(col, col & 0x333333), 0, 0, 0), bx(0.1, 0.06, 0.017, lam(0xd8d8d0), -0.08, 0.04, 0), glowSprite(col, 1.3, 0.6));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'cardreader': {
      const col = { blue: 0x2a6aff, yellow: 0xffc020, red: 0xff2a20 }[o.group] || 0xffffff;
      grp.add(cy(0.08, 0.1, 1.2, lam(0x30343a), 0, 0.6, 0, 8), bx(0.3, 0.4, 0.12, lam(0x1a1c20), 0, 1.35, 0), bx(0.22, 0.05, 0.02, lam(col, col & 0x444444), 0, 1.45, 0.07));
      const led = bx(0.06, 0.06, 0.02, new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, 1.25, 0.07); grp.add(led);
      grp.position.set(o.x, 0, o.z); rec.parts.led = led;
      break;
    }
    case 'mixer': {
      grp.add(bx(1.6, 1.0, 0.9, lam(0xc8d0d4), 0, 0.5, 0), bx(1.6, 0.06, 0.95, lam(0x2a3034), 0, 1.03, 0));
      for (let k = 0; k < 3; k++) grp.add(cy(0.09, 0.09, 0.4, new THREE.MeshLambertMaterial({ color: 0xc0f0ff, transparent: true, opacity: 0.5 }), -0.5 + k * 0.5, 1.26, 0, 10));
      const screen = bx(0.6, 0.35, 0.03, new THREE.MeshBasicMaterial({ color: 0x103020 }), 0, 1.4, -0.4); grp.add(screen);
      grp.position.set(o.x, 0, o.z); rec.parts.screen = screen;
      break;
    }
    case 'reagent': {
      const col = [0x2a6aff, 0x30d050, 0xffa020][o.col] || 0xffffff;
      grp.add(bx(0.5, 1.1, 0.4, lam(0x5a646a), 0, 0.55, 0), cy(0.14, 0.14, 0.5, new THREE.MeshLambertMaterial({ color: col, emissive: col & 0x333333, transparent: true, opacity: 0.8 }), 0, 1.35, 0, 12),
        cy(0.05, 0.05, 0.2, lam(0x222222), 0, 1.7, 0, 6), glowSprite(col, 1.2, 0.35));
      grp.children[3].position.y = 1.4;
      grp.position.set(o.x, 0, o.z);
      break;
    }
    case 'puzzlepiece': {
      const c2 = document.createElement('canvas'); c2.width = c2.height = 64;
      const g2 = c2.getContext('2d'); g2.fillStyle = ['#e85a5a', '#5ab0e8', '#e8d05a', '#7ae85a', '#c05ae8', '#e8905a'][(o.n || 0) % 6]; g2.fillRect(8, 8, 48, 48);
      g2.beginPath(); g2.arc(32, 8, 9, 0, 7); g2.arc(56, 32, 9, 0, 7); g2.fill();
      const t2 = new THREE.CanvasTexture(c2); t2.colorSpace = THREE.SRGBColorSpace;
      grp.add(new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({ map: t2, transparent: true, side: THREE.DoubleSide })), glowSprite(0xffe0a0, 1.2, 0.4));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'puzzleboard': {
      grp.add(bx(2.6, 1.8, 0.1, lam(0x6a4a2a), 0, 1.7, 0), cy(0.05, 0.05, 1.0, lam(0x3a2a1a), -1.0, 0.5, 0, 6), cy(0.05, 0.05, 1.0, lam(0x3a2a1a), 1.0, 0.5, 0, 6));
      rec.parts.cells = [];
      for (let k = 0; k < 6; k++) { const c = bx(0.75, 0.75, 0.02, lam(0x2a2a2a), -0.8 + (k % 3) * 0.8, 2.1 - Math.floor(k / 3) * 0.8, 0.06); grp.add(c); rec.parts.cells.push(c); }
      grp.position.set(o.x, 0, o.z);
      break;
    }
    case 'toy': {
      const g3 = new THREE.Group();
      if (o.toy === 'bear') { g3.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), lam(0x8a5a2a)), cy(0.05, 0.05, 0.02, lam(0x8a5a2a), -0.1, 0.16, 0, 8), cy(0.05, 0.05, 0.02, lam(0x8a5a2a), 0.1, 0.16, 0, 8)); }
      else if (o.toy === 'bunny') { g3.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), lam(0xe8e8e0)), bx(0.05, 0.22, 0.03, lam(0xe8e8e0), -0.05, 0.22, 0), bx(0.05, 0.22, 0.03, lam(0xe8e8e0), 0.05, 0.22, 0)); }
      else { g3.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), lam(0xffd020)), bx(0.12, 0.04, 0.08, lam(0xff8020), 0, 0, 0.16)); }
      grp.add(g3, glowSprite(0xfff0c0, 1.1, 0.4));
      grp.position.set(o.x, 1.0, o.z); rec.bob = true;
      break;
    }
    case 'shelf': {
      const col = { red: 0xd03030, green: 0x30a040, blue: 0x3060d0 }[o.color] || 0x888888;
      grp.add(bx(1.4, 0.08, 0.5, lam(0x6a4a2a), 0, 1.4, 0), bx(1.4, 0.1, 0.06, lam(col, col & 0x222222), 0, 1.5, 0.25), bx(0.06, 1.4, 0.5, lam(0x5a3a1a), -0.7, 0.7, 0), bx(0.06, 1.4, 0.5, lam(0x5a3a1a), 0.7, 0.7, 0));
      const seat = new THREE.Group(); seat.position.y = 1.6; grp.add(seat);
      grp.position.set(o.x, 0, o.z); rec.parts.seat = seat;
      break;
    }
    case 'musicbox': {
      grp.add(bx(0.6, 0.6, 0.6, lam(0x6a2a4a), 0, 0.3, 0), bx(0.64, 0.08, 0.64, lam(0xd8b040), 0, 0.64, 0), cy(0.025, 0.025, 0.3, lam(0xd8b040), 0.36, 0.4, 0, 6));
      const dancer = new THREE.Group(); dancer.position.y = 0.7;
      dancer.add(cy(0.04, 0.12, 0.25, lam(0xf0d0e0), 0, 0.12, 0, 8), new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lam(0xf0d8c8)));
      dancer.children[1].position.y = 0.3;
      grp.add(dancer, glowSprite(0xffc0e0, 1.2, 0.3));
      grp.children[grp.children.length - 1].position.y = 1.0;
      grp.position.set(o.x, 0, o.z); rec.parts.dancer = dancer;
      break;
    }
    case 'furnace': {
      grp.add(bx(1.8, 2.4, 1.8, lam(0x3a2a22, 0x0a0402), 0, 1.2, 0), cy(0.25, 0.3, 2.0, lam(0x2a2220), 0, 3.4, 0, 10));
      const mouth = bx(0.9, 0.8, 0.05, new THREE.MeshBasicMaterial({ color: 0x220a04 }), 0, 0.8, 0.92); grp.add(mouth);
      const plate = textPlane((g, s2) => { g.fillStyle = '#d8c8a0'; g.fillRect(30, 80, 196, 96); g.fillStyle = '#2a1a0a'; g.font = 'bold 64px "Courier New"'; g.textAlign = 'center'; g.fillText(`${o.temp}°`, 128, 152); }, 0.8, true);
      plate.position.set(0, 1.85, 0.93); grp.add(plate);
      const glow = glowSprite(0xff7020, 3.2, 0); glow.position.set(0, 0.9, 1.3); grp.add(glow);
      // печь стоит в клетке-стене за объектом и смотрит в центр шахты
      const cx = 22.5 * TILE, cz = 22.5 * TILE, dx = o.x - cx, dz = o.z - cz, d = Math.hypot(dx, dz) || 1;
      grp.position.set(o.x + dx / d * 2.4, 0, o.z + dz / d * 2.4); grp.rotation.y = Math.atan2(-dx, -dz);
      rec.parts = { mouth, glow };
      break;
    }
    case 'pipevalve': {
      grp.add(cy(0.15, 0.15, 3.0, lam(0x5a4a3a), 0, 1.5, 0, 10));
      const wheel = new THREE.Group(); wheel.position.set(0, 1.3, 0.25);
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 18), lam(0xc02a20)), bx(0.06, 0.6, 0.04, lam(0xc02a20), 0, 0, 0));
      const arrow = textPlane((g) => { g.fillStyle = '#ffe080'; g.font = 'bold 140px sans-serif'; g.textAlign = 'center'; g.fillText('▲', 128, 180); }, 0.4, true);
      arrow.position.set(0, 1.85, 0.2);
      grp.add(wheel, arrow);
      grp.position.set(o.x, 0, o.z); rec.parts = { wheel, arrow };
      break;
    }
    case 'ending': {
      const seat = lam(0x2a1a14, 0x080402), metal = lam(0x5a4a3a);
      grp.add(bx(1.2, 0.5, 1.0, seat, 0, 0.5, 0), bx(1.2, 2.2, 0.2, seat, 0, 1.6, -0.45), bx(0.15, 0.5, 1.0, metal, -0.65, 0.95, 0), bx(0.15, 0.5, 1.0, metal, 0.65, 0.95, 0));
      const halo = glowSprite(0xff4020, 3, 0); halo.position.y = 2.4; grp.add(halo);
      grp.position.set(o.x, 0, o.z); rec.parts = { halo };
      break;
    }
    case 'locker': {
      // металлический шкафчик у стены: можно спрятаться (сквозь щели видно комнату)
      const steel = lam(0x5a6670, 0x0a0c0e), dark = lam(0x1a1e22);
      const g2 = new THREE.Group();
      g2.add(bx(1.0, 2.1, 0.7, steel, 0, 1.05, 0), bx(0.9, 1.9, 0.02, lam(0x6a7680), 0, 1.0, 0.36));
      for (let k = 0; k < 6; k++) g2.add(bx(0.5, 0.03, 0.01, dark, 0, 1.6 + k * 0.06, 0.375));
      g2.add(bx(0.05, 0.15, 0.04, lam(0xb0b4b8), 0.35, 1.0, 0.39));
      g2.rotation.y = Math.atan2(o.nx || 0, o.nz || 0);
      grp.add(g2);
      grp.position.set(o.x - (o.nx || 0) * 0.15, 0, o.z - (o.nz || 0) * 0.15);
      break;
    }
    case 'egg': {
      // «4813-я лампа»: лампа, которая не гудит
      grp.add(bx(1.2, 0.08, 0.3, lam(0xd8d0b0), 0, 0, 0), bx(1.1, 0.04, 0.22, new THREE.MeshBasicMaterial({ color: 0xfff8d0 }), 0, -0.05, 0), glowSprite(0xfff4c0, 2.2, 0.6));
      grp.position.set(o.x, 1.2, o.z); rec.bob = true;
      break;
    }
    case 'door': {
      G.doorObj = o;
      const alongX = o.dx !== 0;
      const slabH = Math.min(H - 0.25, 3.0);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.4 : 3.4, slabH, alongX ? 3.4 : 0.4), lam(0x30343a));
      slab.position.set(-o.dx * (TILE / 2 - 0.25), slabH / 2, -o.dz * (TILE / 2 - 0.25));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.45 : 3.0, 0.2, alongX ? 3.0 : 0.45), lam(0xb8a02a));
      stripe.position.copy(slab.position); stripe.position.y = slabH * 0.55;
      const sign = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.1 : 1.3, 0.28, alongX ? 1.3 : 0.1), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
      sign.position.set(-o.dx * (TILE / 2 - 0.5), Math.min(H - 0.15, 3.2), -o.dz * (TILE / 2 - 0.5));
      const portal = textPlane((g, s) => {
        const gr = g.createRadialGradient(128, 128, 10, 128, 128, 140);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(190,255,215,.9)'); gr.addColorStop(1, 'rgba(120,255,170,.6)');
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
      }, TILE - 0.2, false);
      portal.material.fog = false; portal.scale.y = H / (TILE - 0.2);
      portal.position.set(o.dx * (TILE / 2 - 0.05), H / 2, o.dz * (TILE / 2 - 0.05));
      portal.rotation.y = Math.atan2(-o.dx, -o.dz);
      portal.visible = false;
      const plight = new THREE.PointLight(0xbfffd0, 0, 24, 1.2); plight.position.set(-o.dx * 0.5, 1.6, -o.dz * 0.5);
      grp.add(slab, stripe, sign, portal, plight);
      grp.position.set(o.x, 0, o.z);
      rec.parts = { slab, stripe, sign, portal, plight };
      break;
    }
  }
  if (rec.face) grp.rotation.y = rec.o.kind === 'box' ? Math.atan2(G.spawnDirX || 1, G.spawnDirZ || 0) : 0;
  refreshObj(rec);
  return rec;
}

export function refreshObj(rec) {
  const o = rec.o, p = rec.parts;
  if (o.kind === 'plate') {
    p.top.material.color.setHex(o.on ? 0x30d060 : 0x884422);
    p.top.material.emissive.setHex(o.on ? 0x106020 : 0x331100);
    rec.glow.material.opacity = o.on ? 0.55 : 0;
    p.top.position.y = o.on ? 0.03 : 0.07;
  } else if (o.kind === 'lever') {
    p.arm.rotation.z = o.on ? -0.9 : 0.9;
    p.lampM.material.color.setHex(o.on ? 0x30ff60 : 0x661010);
  } else if (o.kind === 'valve') {
    p.needle.rotation.z = 1.2 - o.val * 0.8;
    p.wheel.rotation.z = o.val * 1.4;
  } else if (o.kind === 'gateplate') {
    p.top.material.color.setHex(o.on ? 0x30d0ff : 0x2a6080);
    rec.glow.material.opacity = o.on ? 0.6 : 0.2;
    p.top.position.y = o.on ? 0.05 : 0.09;
  } else if (o.kind === 'switch') {
    o._t = performance.now();
    p.lampM.material.color.setHex(o.disabled ? 0x202020 : o.on ? 0x30ff60 : 0x661010);
    rec.glow.visible = !o.disabled;
    rec.glow.material.color.setHex(o.on ? 0x40ff70 : 0xff3020);
    rec.glow.material.opacity = o.on ? 0.6 : 0.3;
    if (p.top) { p.top.material.color.setHex(o.on ? 0x30d060 : 0x884422); p.top.position.y = o.pressed ? 0.04 : 0.08; }
    if (p.arm && o.style === 'pump') p.arm.rotation.z = o.on ? -0.4 : 0.3;
    else if (p.arm) p.arm.rotation.x = o.on ? -0.8 : 0.8;
  } else if (o.kind === 'furnace') {
    p.mouth.material.color.setHex(o.lit ? 0xff6a10 : 0x220a04);
    p.glow.material.opacity = o.lit ? 0.75 : 0;
  } else if (o.kind === 'pipevalve') {
    p.wheel.rotation.z = o.val * 2.1;
    p.arrow.rotation.z = [Math.PI / 2, 0, -Math.PI / 2][o.val] || 0;
  } else if (o.kind === 'puzzleboard') {
    p.cells.forEach((c, k) => c.material.color.setHex(k < (o.placed || 0) ? [0xe85a5a, 0x5ab0e8, 0xe8d05a, 0x7ae85a, 0xc05ae8, 0xe8905a][k] : 0x2a2a2a));
  } else if (o.kind === 'shelf') {
    p.seat.clear();
    if (o.toy) { const t = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lam({ bear: 0x8a5a2a, bunny: 0xe8e8e0, duck: 0xffd020 }[o.toy] || 0xffffff)); t.position.y = 0.16; p.seat.add(t); }
  } else if (o.kind === 'ending') {
    p.halo.material.opacity = o.active ? 0.7 : 0;
  } else if (o.kind === 'steamvalve') {
    p.lampV.material.color.setHex(o.on ? 0x30ff60 : 0x661010);
  } else if (o.kind === 'altar') {
    p.flame.visible = !o.used; p.light.intensity = o.used ? 0 : 2.5;
  } else if (o.kind === 'door') {
    p.slab.visible = p.stripe.visible = !o.open;
    p.portal.visible = !!o.open;
    p.sign.material.color.setHex(o.open ? 0x20ff60 : 0xff2010);
    p.plight.intensity = o.open ? 7 : 0;
    if (map) BR.setDoor(map, !!o.open);
  }
}

// Покачивание подбираемых предметов и мигание экрана терминала
const _fwd = new THREE.Vector3(), _to = new THREE.Vector3();
export function animateObjects(dt) {
  camera.getWorldDirection(_fwd);
  for (const rec of objs.values()) {
    const o = rec.o;
    // цифры люминесцентной краской: видны только в луче фонаря
    if (o.kind === 'digit' && o.uv && rec.uvMat) {
      _to.set(o.x - camera.position.x, (o.y || 0) + 1.6 - camera.position.y, o.z - camera.position.z);
      const d = _to.length(), c = d > 0 ? _fwd.dot(_to) / d : 0;
      const lit = FL.on && FL.k > 0.5 && d < 9 && c > 0.9 ? Math.min(1, (c - 0.9) * 14) * Math.min(1, (9 - d) / 3) : 0;
      rec.uvMat.opacity += (lit * 0.95 - rec.uvMat.opacity) * Math.min(1, dt * 8);
    }
    // отпущенный переключатель мигает всё чаще, пока не погаснет
    if (o.kind === 'switch' && o.on && !o.pressed) {
      const left = (o.left || 0) - (performance.now() - (o._t || 0)) / 1000;
      const rate = left < 4 ? 8 : left < 8 ? 4 : 2;
      rec.glow.material.opacity = Math.sin(S.time * rate * Math.PI) > 0 ? 0.65 : 0.15;
    }
    if (o.kind === 'switch' && o.on && rec.parts.vib) rec.group.position.x = o.x + Math.sin(S.time * 60) * 0.01;
    if (o.kind === 'steamvalve' && o.on) rec.parts.wheel.rotation.z += dt * 0.6;
    if (o.kind === 'switch' && o.style === 'swing' && o.on) rec.parts.swing.rotation.x = Math.sin(S.time * 2.6) * 0.7;
    if (o.kind === 'musicbox' && o.playing) rec.parts.dancer.rotation.y += dt * 2;
    if (o.kind === 'furnace' && o.lit) rec.parts.glow.material.opacity = 0.6 + Math.sin(S.time * 9 + o.x) * 0.12;
    if (o.kind === 'cardreader') rec.parts.led.material.color.setHex(Math.sin(S.time * 3) > 0 ? 0xff2020 : 0x401010);
    if (o.kind === 'switch' && o.style === 'pump' && o.on) rec.parts.arm.rotation.z = Math.sin(S.time * 6) * 0.35;
    if (rec.ring) rec.parts.glow.material.opacity = Math.sin(S.time * 1.3 + o.x) > 0.93 ? 0.6 : 0;
    if (o.kind === 'altar' && !o.used) rec.parts.flame.scale.setScalar(2.2 + Math.sin(S.time * 9) * 0.15);
    if (rec.bob) { rec.group.position.y = rec.baseY + (rec.o.kind === 'fuse' ? 0.9 : 1.0) + Math.sin(S.time * 2 + rec.o.x) * 0.1; rec.group.rotation.y += dt * 1.2; }
    if (rec.o.kind === 'keypad' && !S.goalLines.some((l) => l.startsWith('Код') && l.includes('✔'))) rec.parts.screen.visible = Math.sin(S.time * 4) > -0.3;
  }
}
