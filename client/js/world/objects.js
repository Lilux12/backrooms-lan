// Интерактивные объекты уровня: предметы, щиток, рычаги, дверь…
import * as THREE from 'three';
import { BR, TILE, rand } from '../core/util.js';
import { S } from '../core/state.js';
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
      const isTape = o.kind === 'lore' && /плёнк|касс/i.test(o.title || '');
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
  } else if (o.kind === 'door') {
    p.slab.visible = p.stripe.visible = !o.open;
    p.portal.visible = !!o.open;
    p.sign.material.color.setHex(o.open ? 0x20ff60 : 0xff2010);
    p.plight.intensity = o.open ? 7 : 0;
    if (map) BR.setDoor(map, !!o.open);
  }
}

// Покачивание подбираемых предметов и мигание экрана терминала
export function animateObjects(dt) {
  for (const rec of objs.values()) {
    if (rec.bob) { rec.group.position.y = rec.baseY + (rec.o.kind === 'fuse' ? 0.9 : 1.0) + Math.sin(S.time * 2 + rec.o.x) * 0.1; rec.group.rotation.y += dt * 1.2; }
    if (rec.o.kind === 'keypad' && !S.goalLines.some((l) => l.startsWith('Код') && l.includes('✔'))) rec.parts.screen.visible = Math.sin(S.time * 4) > -0.3;
  }
}
