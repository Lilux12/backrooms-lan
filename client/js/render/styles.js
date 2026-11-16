// Визуальные стили уровней: туман, свет, лампы, текстуры
import { FULL, rand } from '../core/util.js';
import { grain, gridLines, makeTex, stains } from './textures.js';

// Стили уровней: цвет тумана, свет, форма ламп, текстуры, звуковая атмосфера
export const STYLES = {
  yellow: {
    fog: 0x6e6226, fogD: 0.03, hemi: [0xfff0b0, 0x6b5a20, 1.7], sun: [0xfff4c8, 1.2], lamp: [0xffefb0, 4.6],
    panel: { c: [1, 0.96, 0.78], size: 1.5, test: (x, y, h) => (x + y) % 2 === 0 && h > 0.12 },
    flick: [5, 16], hum: [60, 120, 180, 240], amb: null, fr: FULL / 3, cr: FULL / 2,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#c9b85a'; g.fillRect(0, 0, s, s);
        for (let x = 0; x < s; x += 16) { g.fillStyle = 'rgba(120,100,25,.35)'; g.fillRect(x, 0, 6, s); }
        stains(g, s, 6, 'rgba(90,70,15,.25)');
        g.fillStyle = 'rgba(70,55,15,.55)'; g.fillRect(0, s - 34, s, 34);
        g.fillStyle = 'rgba(40,30,8,.7)'; g.fillRect(0, s - 36, s, 3);
        grain(g, s, 22);
      }),
      floor: makeTex(256, (g, s) => {
        g.fillStyle = '#8b7a35'; g.fillRect(0, 0, s, s);
        for (let i = 0; i < 1800; i++) {
          g.fillStyle = `rgba(${60 + Math.random() * 60},${50 + Math.random() * 50},15,.35)`;
          g.fillRect(Math.random() * s, Math.random() * s, 2, 2 + Math.random() * 3);
        }
        stains(g, s, 5, 'rgba(50,35,5,.3)'); grain(g, s, 40);
      }, FULL / 3, FULL / 3),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#b9af88'; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(70,62,35,.8)'; g.lineWidth = 4;
        g.strokeRect(0, 0, s, s); g.strokeRect(s / 2, 0, 0, s); g.strokeRect(0, s / 2, s, 0);
        stains(g, s, 3, 'rgba(90,70,20,.22)'); grain(g, s, 18);
      }, FULL / 2, FULL / 2),
    }),
  },
  concrete: {
    fog: 0x1b1e22, fogD: 0.042, hemi: [0x9fb0c4, 0x2d3036, 1.2], sun: [0xdfe6f0, 0.55], lamp: [0xcfe0ff, 5.2],
    panel: { c: [0.82, 0.92, 1], size: 1.3, test: (x, y, h) => x % 4 === 2 && y % 4 === 2 && h > 0.28 },
    flick: [2.5, 8], hum: [50, 100, 150, 50], amb: 'rumble', fr: FULL / 4, cr: FULL / 4, ramp: true,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#6e7176'; g.fillRect(0, 0, s, s);
        for (let x = 0; x < s; x += 64) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 3, s); }
        stains(g, s, 9, 'rgba(15,15,15,.3)');
        g.fillStyle = '#b8a02a'; g.fillRect(0, s - 34, s, 16);
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, s - 18, s, 18);
        grain(g, s, 30);
      }),
      floor: makeTex(256, (g, s) => {
        g.fillStyle = '#4b4d51'; g.fillRect(0, 0, s, s);
        g.fillStyle = 'rgba(210,200,90,.5)'; g.fillRect(0, 0, s, 7);
        stains(g, s, 6, 'rgba(10,10,10,.4)', 40);
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          g.beginPath(); let x = Math.random() * s, y = Math.random() * s; g.moveTo(x, y);
          for (let k = 0; k < 6; k++) { x += rand(-25, 25); y += rand(-25, 25); g.lineTo(x, y); }
          g.stroke();
        }
        grain(g, s, 36);
      }, FULL / 4, FULL / 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#3a3c40'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#2a2c2f'; g.fillRect(0, 0, s, 26);
        g.fillStyle = '#5c6065'; g.fillRect(0, 100, s, 10);
        stains(g, s, 5, 'rgba(0,0,0,.35)'); grain(g, s, 20);
      }, FULL / 4, FULL / 4),
    }),
  },
  tunnel: {
    fog: 0x1a0b08, fogD: 0.045, hemi: [0xff6a4a, 0x3a1710, 1.6], sun: [0xff8060, 0.8], lamp: [0xff9070, 5.6],
    panel: { c: [1, 0.12, 0.06], size: 0.7, test: (x, y, h) => (x + y) % 3 === 0 && h > 0.2 },
    flick: [3, 9], pulse: true, hum: [40, 80, 160, 120], amb: 'clang', fr: FULL / 3, cr: FULL / 3,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#4e4036'; g.fillRect(0, 0, s, s);
        stains(g, s, 8, 'rgba(150,70,20,.32)');
        for (const [y0, y1] of [[56, 100], [150, 178]]) {
          const gr = g.createLinearGradient(0, y0, 0, y1);
          gr.addColorStop(0, '#2c2c2c'); gr.addColorStop(0.5, '#8a8a86'); gr.addColorStop(1, '#2c2c2c');
          g.fillStyle = gr; g.fillRect(0, y0, s, y1 - y0);
        }
        g.fillStyle = '#1c1c1c';
        for (let x = 8; x < s; x += 16) { g.beginPath(); g.arc(x, 122, 2.5, 0, 7); g.fill(); }
        grain(g, s, 26);
      }),
      floor: makeTex(256, (g, s) => {
        g.fillStyle = '#262626'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 32, 'rgba(130,130,130,.5)', 3);
        stains(g, s, 5, 'rgba(120,60,20,.25)', 40); grain(g, s, 30);
      }, FULL / 3, FULL / 3),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#1e1e1e'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#2d2d2d'; g.fillRect(0, 0, s, 30); g.fillRect(0, 128, s, 14);
        grain(g, s, 18);
      }, FULL / 3, FULL / 3),
    }),
  },
  pool: {
    fog: 0x6fb7c4, fogD: 0.028, hemi: [0xe6ffff, 0x4a9aa8, 1.9], sun: [0xffffff, 1.0], lamp: [0xe0ffff, 3.6],
    panel: { c: [0.85, 1, 1], size: 1.6, test: (x, y) => (x + y) % 2 === 0 },
    flick: [22, 40], hum: [55, 110, 220, 330], amb: 'drip', fr: FULL / 4, cr: FULL / 4,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#d6ecee'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#3f9eb0'; g.fillRect(0, s * 0.66, s, s * 0.34);
        gridLines(g, s, 32, 'rgba(100,150,160,.7)', 2);
        stains(g, s, 4, 'rgba(60,120,130,.2)'); grain(g, s, 14);
      }),
      floor: makeTex(256, (g, s) => {
        g.fillStyle = '#3aa3b2'; g.fillRect(0, 0, s, s);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; g.fillRect(Math.floor(Math.random() * 8) * 32, Math.floor(Math.random() * 8) * 32, 32, 32); }
        gridLines(g, s, 32, 'rgba(205,239,242,.9)', 3); grain(g, s, 16);
      }, FULL / 4, FULL / 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#e2f1f3'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 64, 'rgba(150,185,190,.9)', 3); grain(g, s, 12);
      }, FULL / 4, FULL / 4),
    }),
  },
  run: {
    fog: 0x4a615a, fogD: 0.036, hemi: [0xd8f4ea, 0x35453f, 1.55], sun: [0xe6fff4, 0.7], lamp: [0xd6ffee, 4.8],
    panel: { c: [0.8, 1, 0.92], size: 1.4, test: (x, y, h) => (x + 2 * y) % 3 === 0 && h > 0.05 },
    flick: [1.2, 4.5], pulse: true, hum: [50, 100, 150, 300], amb: 'crackle', step: 520, fr: FULL / 3, cr: FULL / 3,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#d4dad1'; g.fillRect(0, 0, s, s);
        stains(g, s, 6, 'rgba(90,100,70,.22)');
        g.fillStyle = '#4f8a78'; g.fillRect(0, s * 0.46, s, s * 0.54);
        gridLines(g, s, 32, 'rgba(20,50,40,.45)', 1.5);
        g.fillStyle = '#e9efe6'; g.fillRect(0, s * 0.46 - 6, s, 8);
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, s * 0.46 + 2, s, 3);
        // скол плитки, подтёки и следы
        for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(Math.random() * s, s * 0.5 + Math.random() * s * 0.45, 8 + Math.random() * 18, 4 + Math.random() * 8); }
        g.strokeStyle = 'rgba(110,8,8,.55)'; g.lineCap = 'round';
        for (let i = 0; i < 3; i++) { const x = Math.random() * s; g.lineWidth = 2 + Math.random() * 4; g.beginPath(); g.moveTo(x, 30 + Math.random() * 60); g.lineTo(x + rand(-6, 6), 120 + Math.random() * 120); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,.38)'; g.fillRect(0, s - 14, s, 14);
        grain(g, s, 20);
      }),
      floor: makeTex(256, (g, s) => {
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#b4bbae' : '#c6ccc0'; g.fillRect(x * 64, y * 64, 64, 64); }
        gridLines(g, s, 64, 'rgba(40,50,40,.55)', 2);
        stains(g, s, 7, 'rgba(30,36,26,.28)', 50);
        stains(g, s, 2, 'rgba(110,10,8,.45)', 28);
        g.strokeStyle = 'rgba(30,30,30,.25)'; g.lineWidth = 3;
        for (let i = 0; i < 6; i++) { g.beginPath(); const x = Math.random() * s, y = Math.random() * s; g.moveTo(x, y); g.quadraticCurveTo(x + rand(-40, 40), y + rand(-40, 40), x + rand(-60, 60), y + rand(-60, 60)); g.stroke(); }
        grain(g, s, 26);
      }, FULL / 4, FULL / 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#c9cec5'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 128, 'rgba(60,66,58,.7)', 4);
        for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(60,66,58,.35)'; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
        stains(g, s, 4, 'rgba(120,100,40,.22)'); grain(g, s, 14);
      }, FULL / 4, FULL / 4),
    }),
  },
  office: {
    fog: 0x3f4637, fogD: 0.036, hemi: [0xe0ecd0, 0x40483a, 1.5], sun: [0xeaf0dc, 0.9], lamp: [0xf0f4d8, 4.4],
    panel: { c: [0.9, 1, 0.85], size: 1.2, test: (x, y, h) => x % 2 === 0 && y % 2 === 0 && h > 0.2 },
    flick: [2, 7], hum: [60, 120, 180, 360], amb: 'crackle', fr: FULL / 4, cr: FULL / 4,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#bdb7a0'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#8b856f'; g.fillRect(0, s - 64, s, 64);
        g.fillStyle = 'rgba(40,36,24,.6)'; g.fillRect(0, s - 66, s, 3);
        stains(g, s, 5, 'rgba(80,70,40,.18)'); grain(g, s, 20);
      }),
      floor: makeTex(256, (g, s) => {
        g.fillStyle = '#59604f'; g.fillRect(0, 0, s, s);
        for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() * 60},${Math.random() * 70},${Math.random() * 40},.3)`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
        gridLines(g, s, 64, 'rgba(0,0,0,.2)', 2); stains(g, s, 4, 'rgba(20,20,10,.3)', 40); grain(g, s, 30);
      }, FULL / 4, FULL / 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#cfcbbc'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 128, 'rgba(80,75,60,.7)', 4); stains(g, s, 3, 'rgba(100,90,40,.2)'); grain(g, s, 14);
      }, FULL / 4, FULL / 4),
    }),
  },
  hotel: {
    fog: 0x2c1c12, fogD: 0.03, hemi: [0xffe6c0, 0x40281a, 1.6], sun: [0xffe0b0, 0.8], lamp: [0xffd6a0, 4.6],
    panel: { c: [1, 0.86, 0.62], size: 0.9, test: (x, y, h) => (x + y) % 2 === 0 && h > 0.3 },
    flick: [6, 18], hum: [55, 110, 165, 220], amb: 'creak', fr: 8, cr: 4,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        // обои с дамасским узором и деревянная панель внизу
        g.fillStyle = '#b89a6a'; g.fillRect(0, 0, s, s);
        g.fillStyle = 'rgba(120,80,30,.35)';
        for (let y = 0; y < s * 0.62; y += 48) for (let x = (y / 48) % 2 ? 24 : 0; x < s; x += 48) {
          g.beginPath(); g.ellipse(x + 12, y + 18, 8, 14, 0, 0, 7); g.fill();
          g.beginPath(); g.moveTo(x + 12, y + 2); g.lineTo(x + 20, y + 18); g.lineTo(x + 12, y + 34); g.lineTo(x + 4, y + 18); g.closePath(); g.fill();
        }
        g.fillStyle = '#4a2a16'; g.fillRect(0, s * 0.62, s, s * 0.38);
        g.fillStyle = 'rgba(255,220,150,.25)'; g.fillRect(0, s * 0.62, s, 4);
        for (let x = 0; x < s; x += 64) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, s * 0.62, 3, s * 0.38); }
        stains(g, s, 4, 'rgba(60,40,20,.25)'); grain(g, s, 16);
      }),
      floor: makeTex(256, (g, s) => {
        // красный ковёр с золотым орнаментом
        g.fillStyle = '#6a1418'; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(200,150,60,.55)'; g.lineWidth = 3;
        for (let k = 0; k < 4; k++) { const o = k * 64 + 32; g.beginPath(); g.moveTo(o, 8); g.lineTo(o + 24, 32); g.lineTo(o, 56); g.lineTo(o - 24, 32); g.closePath(); g.stroke(); }
        for (let k = 0; k < 4; k++) { const o = k * 64 + 32; g.beginPath(); g.arc(o, 160, 22, 0, 7); g.stroke(); }
        g.fillStyle = 'rgba(200,150,60,.4)'; g.fillRect(0, 100, s, 4); g.fillRect(0, 220, s, 4);
        stains(g, s, 5, 'rgba(20,0,0,.35)', 40); grain(g, s, 22);
      }, FULL / 4, FULL / 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#e8dcc4'; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(150,120,80,.7)'; g.lineWidth = 6; g.strokeRect(16, 16, s - 32, s - 32);
        g.lineWidth = 2; g.strokeRect(30, 30, s - 60, s - 60);
        stains(g, s, 3, 'rgba(120,90,40,.2)'); grain(g, s, 12);
      }, FULL / 4, FULL / 4),
    }),
  },
  mall: {
    fog: 0x1c2228, fogD: 0.03, hemi: [0xe0eaf4, 0x30363c, 1.4], sun: [0xf0f4ff, 0.9], lamp: [0xe8f0ff, 4.4], unpowered: true, escalator: true,
    panel: { c: [0.92, 0.96, 1], size: 2.2, test: (x, y, h) => x % 2 === 0 && y % 3 === 0 && h > 0.1 },
    flick: [3, 9], hum: [50, 100, 150, 200], amb: 'muzak', fr: 8, cr: 8,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        // витринная стена: светлая штукатурка, полоса плитки, вывесочный короб сверху
        g.fillStyle = '#d8d8d2'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#2a2e34'; g.fillRect(0, 0, s, 40);
        g.fillStyle = 'rgba(255,255,255,.1)'; for (let x = 0; x < s; x += 32) g.fillRect(x, 4, 28, 30);
        g.fillStyle = '#a8b0b6'; g.fillRect(0, s - 50, s, 50);
        gridLines(g, s, 64, 'rgba(90,96,100,.35)', 2);
        stains(g, s, 6, 'rgba(60,70,60,.22)'); grain(g, s, 14);
      }),
      floor: makeTex(256, (g, s) => {
        // глянцевая плитка торгового центра
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#e4e2dc' : '#cfcdc6'; g.fillRect(x * 64, y * 64, 64, 64); }
        g.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 12; i++) g.fillRect(Math.random() * s, Math.random() * s, 40, 3);
        gridLines(g, s, 64, 'rgba(90,90,85,.6)', 2);
        stains(g, s, 6, 'rgba(70,80,60,.25)', 50); grain(g, s, 14);
      }, FULL / 6, FULL / 6),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#e6e8ea'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 64, 'rgba(120,124,128,.8)', 3); stains(g, s, 4, 'rgba(110,100,60,.2)'); grain(g, s, 10);
      }, FULL / 4, FULL / 4),
    }),
  },
  lab: {
    fog: 0x0e1a1e, fogD: 0.034, hemi: [0xd8f4ff, 0x1e3038, 1.45], sun: [0xe8faff, 0.8], lamp: [0xd0f0ff, 4.6],
    panel: { c: [0.85, 0.97, 1], size: 1.6, test: (x, y, h) => (x + y) % 2 === 0 && h > 0.25 },
    flick: [4, 12], hum: [60, 120, 240, 480], amb: 'beep', fr: 4, cr: 4,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        g.fillStyle = '#d4dee0'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 64, 'rgba(120,140,145,.55)', 2);
        g.fillStyle = '#2a7a8a'; g.fillRect(0, s * 0.7, s, 10);                 // цветная полоса сектора
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, s - 30, s, 30);
        g.fillStyle = 'rgba(40,10,10,.35)'; g.font = 'bold 22px "Courier New"'; g.fillText('BIO-7', 16, 40);
        stains(g, s, 5, 'rgba(60,80,70,.25)'); grain(g, s, 12);
      }),
      floor: makeTex(256, (g, s) => {
        g.fillStyle = '#9aa6a8'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 32, 'rgba(60,70,72,.45)', 1.5);
        g.fillStyle = 'rgba(220,180,40,.6)'; for (let x = 0; x < s; x += 32) { g.save(); g.translate(x, s - 14); g.rotate(-0.6); g.fillRect(0, 0, 14, 30); g.restore(); }
        stains(g, s, 6, 'rgba(30,50,40,.3)', 40); grain(g, s, 18);
      }, 4, 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#c4ced0'; g.fillRect(0, 0, s, s);
        gridLines(g, s, 64, 'rgba(90,100,104,.8)', 3);
        g.fillStyle = 'rgba(40,40,40,.4)'; for (let i = 0; i < 4; i++) g.fillRect(20 + i * 64, 20, 24, 24); // решётки вентиляции
        grain(g, s, 10);
      }, 4, 4),
    }),
  },
  school: {
    fog: 0x3a3020, fogD: 0.026, hemi: [0xfff0d8, 0x4a3a28, 1.5], sun: [0xfff4e0, 0.9], lamp: [0xfff0d0, 4.4],
    panel: { c: [1, 0.95, 0.85], size: 2.0, test: (x, y, h) => x % 2 === 0 && y % 2 === 0 && h > 0.2 },
    flick: [8, 22], hum: [55, 110, 165, 330], amb: 'giggle', fr: 4, cr: 8,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        // пастельные обои с облачками и звёздочками, зелёная масляная панель снизу
        g.fillStyle = '#e8d8b8'; g.fillRect(0, 0, s, s);
        for (let i = 0; i < 14; i++) {
          const x = (i * 53) % s, y = 20 + ((i * 37) % 120);
          g.fillStyle = ['rgba(255,170,170,.5)', 'rgba(170,200,255,.5)', 'rgba(255,230,140,.6)'][i % 3];
          g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 1.2566 - 1.57; g.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); g.lineTo(x + Math.cos(a + 0.628) * 4, y + Math.sin(a + 0.628) * 4); } g.fill();
        }
        g.fillStyle = '#5a8a5a'; g.fillRect(0, s * 0.62, s, s * 0.38);
        g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, s * 0.62, s, 5);
        stains(g, s, 5, 'rgba(80,60,30,.22)'); grain(g, s, 14);
      }),
      floor: makeTex(256, (g, s) => {
        // паркет ёлочкой (с переносом через край — текстура повторяется без шва)
        g.fillStyle = '#8a5a30'; g.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 32) for (let x = 0; x < s + 64; x += 64) {
          const o = (y / 32) % 2 ? 32 : 0;
          g.fillStyle = ['#8a5a30', '#9a6a3a', '#7a4a28'][Math.floor((x + y) / 32) % 3]; g.fillRect(x + o - 64, y, 62, 30);
        }
        gridLines(g, s, 32, 'rgba(40,20,10,.35)', 1);
        stains(g, s, 4, 'rgba(30,20,10,.3)', 40); grain(g, s, 16);
      }, 4, 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#ece4d4'; g.fillRect(0, 0, s, s);
        g.strokeStyle = 'rgba(150,130,100,.6)'; g.lineWidth = 4; g.strokeRect(10, 10, s - 20, s - 20);
        stains(g, s, 4, 'rgba(140,110,60,.2)'); grain(g, s, 10);
      }, 8, 8),
    }),
  },
  factory: {
    fog: 0x160c06, fogD: 0.028, hemi: [0xffb080, 0x2a140a, 1.3], sun: [0xffa060, 0.7], lamp: [0xffb070, 4.8],
    panel: { c: [1, 0.6, 0.3], size: 0.9, test: (x, y, h) => (x * 3 + y) % 4 === 0 && h > 0.2 },
    flick: [3, 10], pulse: true, hum: [35, 70, 105, 140], amb: 'clang', fr: 4, cr: 4,
    tex: () => ({
      wall: makeTex(256, (g, s) => {
        // клёпаные стальные листы с ржавчиной
        g.fillStyle = '#4a3a30'; g.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 64) for (let x = 0; x < s; x += 128) {
          g.fillStyle = `rgba(${90 + (x + y) % 30},${60 + (x * y) % 20},40,.5)`; g.fillRect(x + 2, y + 2, 124, 60);
          g.fillStyle = '#20160e'; for (let k = 8; k < 128; k += 20) { g.beginPath(); g.arc(x + k, y + 6, 2.5, 0, 7); g.arc(x + k, y + 58, 2.5, 0, 7); g.fill(); }
        }
        stains(g, s, 10, 'rgba(160,70,20,.35)'); stains(g, s, 4, 'rgba(0,0,0,.4)');
        g.fillStyle = 'rgba(220,160,30,.6)'; for (let x = 0; x < s; x += 40) { g.save(); g.translate(x, s - 20); g.rotate(-0.7); g.fillRect(0, 0, 16, 34); g.restore(); }
        grain(g, s, 26);
      }),
      floor: makeTex(256, (g, s) => {
        // рифлёный металл
        g.fillStyle = '#3a3634'; g.fillRect(0, 0, s, s);
        g.fillStyle = 'rgba(160,150,140,.35)';
        for (let y = 8; y < s; y += 22) for (let x = (y / 22) % 2 ? 0 : 11; x < s; x += 22) { g.save(); g.translate(x, y); g.rotate(0.7); g.fillRect(-7, -2, 14, 4); g.restore(); }
        stains(g, s, 8, 'rgba(120,50,10,.35)', 50); grain(g, s, 24);
      }, 4, 4),
      ceil: makeTex(256, (g, s) => {
        g.fillStyle = '#1e1a18'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#3a302a'; for (let x = 0; x < s; x += 64) g.fillRect(x, 0, 14, s);
        grain(g, s, 14);
      }, 4, 4),
    }),
  },
};
