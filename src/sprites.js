// Procedural art: every sprite and icon in the game is drawn here at start-up.
import { S, hash2, vnoise, rng, clamp } from './util.js';
import { ITEMS, PROTO } from './data.js';

export const SPR = {}, ICON = {}, BELT = {}, ORE = {};
const P = 20, TAU = Math.PI * 2;

function cv(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
function rgbOf(c) {
  if (c[0] === '#') { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  return c.match(/[\d.]+/g).slice(0, 3).map(Number);
}
function sh(c, a) {
  const f = v => Math.round(clamp(a >= 0 ? v + (255 - v) * a : v * (1 + a), 0, 255));
  const [r, g, b] = rgbOf(c);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function lg(g, x0, y0, x1, y1, ...stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
  return gr;
}
function rg(g, x, y, r0, r1, ...stops) {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
  return gr;
}
const OUT = 'rgba(16,14,12,0.92)';
function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
function poly(g, pts) { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); }

// raised bevelled plate
function box(g, x, y, w, h, col, o = {}) {
  const r = o.r ?? 6;
  g.beginPath(); g.roundRect(x, y, w, h, r);
  g.fillStyle = lg(g, x, y, x + w * 0.35, y + h, sh(col, 0.16), col, sh(col, -0.24));
  g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
  g.save(); g.beginPath(); g.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, Math.max(1, r - 1)); g.clip();
  g.lineWidth = 2.2; g.strokeStyle = 'rgba(255,255,255,0.24)';
  g.beginPath(); g.moveTo(x + 3, y + h - 3); g.lineTo(x + 3, y + 3); g.lineTo(x + w - 3, y + 3); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.32)';
  g.beginPath(); g.moveTo(x + w - 3, y + 3); g.lineTo(x + w - 3, y + h - 3); g.lineTo(x + 3, y + h - 3); g.stroke();
  g.restore();
}
// box with visible south face: footprint (x,y,w,h), height d
function block(g, x, y, w, h, d, col, o = {}) {
  box(g, x, y + h - d - 8, w, d + 8, sh(col, -0.45), o);
  box(g, x, y - d, w, h, col, o);
}
function inset(g, x, y, w, h, col, r = 4) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = col; g.fill();
  g.save(); g.clip(); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y); g.lineTo(x + w, y); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.stroke();
  g.restore();
}
function disc(g, x, y, r, col, o = {}) {
  g.beginPath(); g.arc(x, y, r, 0, TAU);
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, sh(col, 0.3)); gr.addColorStop(0.6, col); gr.addColorStop(1, sh(col, -0.35));
  g.fillStyle = gr; g.fill(); g.lineWidth = o.lw ?? 2.2; g.strokeStyle = OUT; g.stroke();
}
function hole(g, x, y, r) {
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = rg(g, x, y + r * 0.3, r * 0.2, r, '#0b0b0c', '#1c1b1a'); g.fill();
  g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.stroke();
  g.beginPath(); g.arc(x, y, r, 0.2, Math.PI - 0.2); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1.5; g.stroke();
}
function rivets(g, pts) {
  for (const [x, y] of pts) {
    g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fillStyle = 'rgba(20,20,22,0.85)'; g.fill();
    g.beginPath(); g.arc(x - 0.6, y - 0.6, 1.3, 0, TAU); g.fillStyle = 'rgba(235,235,240,0.55)'; g.fill();
  }
}
function cornerRivets(g, x, y, w, h, m = 7) { rivets(g, [[x + m, y + m], [x + w - m, y + m], [x + m, y + h - m], [x + w - m, y + h - m]]); }
function hazard(g, x, y, w, h) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#d8a520'; g.fillRect(x, y, w, h); g.fillStyle = '#1c1c1e';
  for (let i = -h; i < w + h; i += 12) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + h, y); g.lineTo(x + i + h + 6, y); g.lineTo(x + i + 6, y + h); g.fill(); }
  g.restore(); g.lineWidth = 1.5; g.strokeStyle = OUT; g.strokeRect(x, y, w, h);
}
function vent(g, x, y, w, h) {
  inset(g, x, y, w, h, '#19191b', 2);
  g.strokeStyle = 'rgba(120,125,130,0.7)'; g.lineWidth = 1.5;
  for (let i = y + 4; i < y + h - 1; i += 4) line(g, x + 2, i, x + w - 2, i);
}
function gearPath(g, cx, cy, ro, ri, n) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, st = TAU / n;
    g.lineTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
    g.lineTo(cx + Math.cos(a + st * 0.15) * ro, cy + Math.sin(a + st * 0.15) * ro);
    g.lineTo(cx + Math.cos(a + st * 0.45) * ro, cy + Math.sin(a + st * 0.45) * ro);
    g.lineTo(cx + Math.cos(a + st * 0.6) * ri, cy + Math.sin(a + st * 0.6) * ri);
  }
  g.closePath();
}
function gear(g, cx, cy, ro, n, col) {
  gearPath(g, cx, cy, ro, ro * 0.78, n);
  g.fillStyle = rg(g, cx - ro * 0.3, cy - ro * 0.3, 1, ro * 1.2, sh(col, 0.3), col, sh(col, -0.35));
  g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
  g.beginPath(); g.arc(cx, cy, ro * 0.5, 0, TAU); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.stroke();
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; g.beginPath(); g.arc(cx + Math.cos(a) * ro * 0.38, cy + Math.sin(a) * ro * 0.38, ro * 0.09, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill(); }
  disc(g, cx, cy, ro * 0.18, sh(col, -0.2), { lw: 1.5 });
}
function tube(g, pts, w, col) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  const path = () => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); };
  path(); g.strokeStyle = OUT; g.lineWidth = w + 3; g.stroke();
  path(); g.strokeStyle = sh(col, -0.25); g.lineWidth = w; g.stroke();
  path(); g.strokeStyle = col; g.lineWidth = w * 0.6; g.stroke();
  path(); g.strokeStyle = sh(col, 0.35); g.lineWidth = w * 0.2; g.stroke();
  g.lineCap = 'butt'; g.lineJoin = 'miter';
}

// ---- post processing
const NT = new Float32Array(65536);
for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) NT[(y << 8) | x] = vnoise(x / 9, y / 9, 4242) * 0.65 + vnoise(x / 3, y / 3, 99) * 0.35;
function grime(c, str) {
  const g = c.getContext('2d'), im = g.getImageData(0, 0, c.width, c.height), d = im.data, w = c.width;
  for (let i = 0, px = 0; i < d.length; i += 4, px++) {
    if (d[i + 3] < 10) continue;
    const x = px % w, y = (px / w) | 0, n = NT[((y & 255) << 8) | (x & 255)], h = hash2(x, y, 7);
    const f = 1 + (n - 0.5) * str * 2.4 + (h - 0.5) * str * 1.0;
    let r = d[i] * f, gg = d[i + 1] * f, b = d[i + 2] * f;
    if (n > 0.63) { const k = Math.min(0.6, (n - 0.63) * str * 14) * (0.5 + h * 0.5); r = r * (1 - k) + 96 * k; gg = gg * (1 - k) + 58 * k; b = b * (1 - k) + 34 * k; }
    d[i] = r; d[i + 1] = gg; d[i + 2] = b;
  }
  g.putImageData(im, 0, 0);
}
function withShadow(c, off) {
  const o = cv(c.width, c.height), g = o.getContext('2d'), s = cv(c.width, c.height), sg = s.getContext('2d');
  sg.drawImage(c, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#000'; sg.fillRect(0, 0, s.width, s.height);
  g.filter = 'blur(4px)'; g.globalAlpha = 0.5; g.drawImage(s, off[0], off[1]); g.filter = 'none'; g.globalAlpha = 1;
  g.drawImage(c, 0, 0);
  return o;
}
// footprint sprite: (0,0) is the footprint's top-left
function make(name, w, h, o, draw) {
  const top = (o.top || 0) * S, side = (o.side || 0) * S;
  const c = cv(w * S + 2 * P + 2 * side, h * S + 2 * P + top), g = c.getContext('2d');
  g.translate(P + side, P + top);
  draw(g, w * S, h * S);
  if (o.grime !== 0) grime(c, o.grime || 0.1);
  SPR[name] = { c: o.shadow === false ? c : withShadow(c, o.sh || [9, 8]), ox: P + side, oy: P + top };
  return SPR[name];
}
// centre-pivot sprite
function raw(name, w, h, draw, gr = 0.08) {
  const c = cv(w, h), g = c.getContext('2d');
  draw(g, w, h); if (gr) grime(c, gr);
  SPR[name] = { c, ox: w / 2, oy: h / 2 };
  return SPR[name];
}

// =========================================================== belts
const TRACK = '#2a2b2e';
function rail(g, x) {
  g.fillStyle = lg(g, x, 0, x + 6, 0, '#9aa0a6', '#5c6167', '#3a3d41'); g.fillRect(x, 0, 6, 64);
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 0, 1, 64); g.fillRect(x + 5, 0, 1, 64);
  g.fillStyle = 'rgba(0,0,0,0.45)'; for (let y = 6; y < 64; y += 16) g.fillRect(x + 2, y, 2, 2);
}
function beltStraight(g, f, col) {
  g.fillStyle = TRACK; g.fillRect(4, 0, 56, 64);
  g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(30, 0, 4, 64);
  g.save(); g.beginPath(); g.rect(8, 0, 48, 64); g.clip();
  g.lineWidth = 3.2; g.lineJoin = 'round';
  for (let k = -1; k < 6; k++) {
    const y = 64 - (k * 16 + f * 2);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.moveTo(13, y + 10); g.lineTo(32, y + 2); g.lineTo(51, y + 10); g.stroke();
    g.strokeStyle = col; g.beginPath(); g.moveTo(13, y + 8); g.lineTo(32, y); g.lineTo(51, y + 8); g.stroke();
  }
  g.restore();
  rail(g, 2); rail(g, 56);
}
function beltCurve(g, f, col) {
  g.save(); g.beginPath(); g.rect(0, 0, 64, 64); g.clip();
  g.strokeStyle = TRACK; g.lineWidth = 56; g.beginPath(); g.arc(0, 0, 32, 0, Math.PI / 2); g.stroke();
  g.lineWidth = 3.2; g.lineJoin = 'round';
  for (let k = -2; k < 7; k++) {
    const a = Math.PI / 2 * (1 - (k * 16 + f * 2) / 64);
    if (a < -0.4 || a > Math.PI / 2 + 0.7) continue;
    const pts = [[13, a + 0.5], [32, a], [51, a + 0.16]];
    for (const [dy, c2] of [[2, 'rgba(0,0,0,0.45)'], [0, col]]) {
      g.strokeStyle = c2; g.beginPath();
      pts.forEach(([r, an], i) => { const x = r * Math.cos(an), y = r * Math.sin(an) + dy; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    }
  }
  for (const r of [5, 59]) {
    g.strokeStyle = '#3a3d41'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, r, 0, Math.PI / 2); g.stroke();
    g.strokeStyle = '#8a9096'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r - 0.5, 0, Math.PI / 2); g.stroke();
  }
  g.restore();
}
function rot64(src, d, flip) {
  const c = cv(64, 64), g = c.getContext('2d');
  g.translate(32, 32); g.rotate(d * Math.PI / 2); if (flip) g.scale(-1, 1); g.drawImage(src, -32, -32);
  return c;
}
function genBelts() {
  for (const [name, col] of [['belt', 'rgba(224,170,60,0.62)'], ['fast-belt', 'rgba(70,190,205,0.66)']]) {
    const b = BELT[name] = { s: [[], [], [], []], l: [[], [], [], []], r: [[], [], [], []] };
    for (let f = 0; f < 8; f++) {
      const s = cv(64, 64); beltStraight(s.getContext('2d'), f, col);
      const c = cv(64, 64); beltCurve(c.getContext('2d'), f, col);
      for (let d = 0; d < 4; d++) { b.s[d][f] = rot64(s, d); b.l[d][f] = rot64(c, d); b.r[d][f] = rot64(c, d, true); }
    }
  }
  // underground hoods + splitter hoods, 4 rotations each
  const hood = (g, y0, y1, mouthTop) => {
    box(g, 3, y0, 58, y1 - y0, '#6c7178', { r: 5 });
    hazard(g, 8, mouthTop ? y0 + 3 : y1 - 10, 48, 7);
    g.fillStyle = '#0c0c0d'; g.beginPath();
    if (mouthTop) g.roundRect(10, y0 - 7, 44, 10, [5, 5, 0, 0]); else g.roundRect(10, y1 - 3, 44, 10, [0, 0, 5, 5]);
    g.fill();
    rivets(g, [[9, (y0 + y1) / 2], [55, (y0 + y1) / 2]]);
  };
  for (const [nm, fn] of [['ubelt_in', g => hood(g, 4, 36, false)], ['ubelt_out', g => hood(g, 28, 60, true)]]) {
    const c = cv(64, 64), g = c.getContext('2d'); fn(g); grime(c, 0.1);
    for (let d = 0; d < 4; d++) SPR[nm + d] = { c: rot64(c, d), ox: 0, oy: 0 };
  }
  const sp = cv(128, 64), g = sp.getContext('2d');
  box(g, 2, 14, 124, 36, '#6c7178', { r: 6 });
  box(g, 50, 8, 28, 48, '#d09a30', { r: 5 });
  g.fillStyle = '#1b1b1d'; poly(g, [[64, 16], [74, 32], [68, 32], [68, 46], [60, 46], [60, 32], [54, 32]]); g.fill();
  vent(g, 10, 22, 30, 20); vent(g, 88, 22, 30, 20);
  rivets(g, [[8, 20], [8, 44], [120, 20], [120, 44]]);
  grime(sp, 0.1);
  for (let d = 0; d < 4; d++) {
    const v = d & 1, c = cv(v ? 64 : 128, v ? 128 : 64), cg = c.getContext('2d');
    cg.translate(c.width / 2, c.height / 2); cg.rotate(d * Math.PI / 2); cg.drawImage(sp, -64, -32);
    SPR['splitter' + d] = { c: withShadow(c, [3, 3]), ox: 0, oy: 0 };
  }
}

// =========================================================== buildings
function genBuildings() {
  // ---- arms
  for (const [name, col, reach] of [['arm', '#d39a2c', 1], ['long-arm', '#b9483a', 2], ['fast-arm', '#3f86c0', 1]]) {
    make(name, 1, 1, { sh: [4, 4] }, g => {
      box(g, 12, 12, 40, 40, '#4c5056', { r: 9 });
      cornerRivets(g, 12, 12, 40, 40, 6);
      disc(g, 32, 32, 13, col); disc(g, 32, 32, 5, '#2c2d30', { lw: 1.5 });
    });
    const L = reach * 64 + 14;
    raw('armh_' + name, 28, L, g => {
      g.beginPath(); g.moveTo(8, L - 7); g.lineTo(11, 16); g.lineTo(17, 16); g.lineTo(20, L - 7); g.closePath();
      g.fillStyle = lg(g, 8, 0, 20, 0, sh(col, 0.25), col, sh(col, -0.35)); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; for (let y = L - 20; y > 24; y -= 14) line(g, 10, y, 18, y);
      disc(g, 14, L - 7, 6, '#3a3c40', { lw: 1.5 });
      g.strokeStyle = OUT; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(11, 16); g.lineTo(5, 5); g.moveTo(17, 16); g.lineTo(23, 5); g.stroke();
      g.strokeStyle = '#b9bdc2'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(11, 16); g.lineTo(5, 5); g.moveTo(17, 16); g.lineTo(23, 5); g.stroke();
      g.lineCap = 'butt'; disc(g, 14, 16, 4.5, '#55585d', { lw: 1.5 });
    }, 0.06);
  }
  // ---- chests
  make('wood-chest', 1, 1, { top: 0.2, sh: [5, 5] }, g => {
    block(g, 7, 7, 50, 50, 9, '#96693a', { r: 3 });
    g.strokeStyle = 'rgba(40,22,8,0.6)'; g.lineWidth = 1.6; for (let i = 1; i < 4; i++) line(g, 9, -2 + i * 12.5, 55, -2 + i * 12.5);
    g.fillStyle = '#4e5156'; for (const [x, y] of [[7, -2], [48, -2], [7, 39], [48, 39]]) { g.fillRect(x, y, 9, 9); g.strokeStyle = OUT; g.lineWidth = 1.2; g.strokeRect(x, y, 9, 9); }
    box(g, 27, 45, 10, 9, '#c9a13c', { r: 2 });
  });
  make('iron-chest', 1, 1, { top: 0.2, sh: [5, 5] }, g => {
    block(g, 7, 7, 50, 50, 9, '#8d939a', { r: 4 });
    inset(g, 13, 4, 38, 38, '#7b8188', 3);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; line(g, 32, 5, 32, 41); line(g, 14, 23, 50, 23);
    cornerRivets(g, 7, -2, 50, 50, 5);
    box(g, 26, 45, 12, 9, '#d09a30', { r: 2 });
  });
  // ---- drills
  make('burner-drill', 2, 2, { top: 0.25 }, (g, W, H) => {
    block(g, 5, 5, W - 10, H - 10, 12, '#7a6652');
    inset(g, 14, 2, W - 28, H - 28, '#5f5042', 8);
    hole(g, 64, 52, 36);
    g.lineWidth = 5; g.strokeStyle = '#b08a2a'; g.beginPath(); g.arc(64, 52, 39, 0, TAU); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = OUT; g.beginPath(); g.arc(64, 52, 42, 0, TAU); g.stroke();
    disc(g, 22, 8, 10, '#3b3836'); hole(g, 22, 8, 6);
    cornerRivets(g, 5, -7, W - 10, H - 10, 7);
    hazard(g, 14, 110, 100, 8);
  });
  make('electric-drill', 3, 3, { top: 0.3 }, (g, W, H) => {
    block(g, 6, 6, W - 12, H - 12, 14, '#59636d');
    for (const [x, y] of [[10, -4], [146, -4], [10, 132], [146, 132]]) box(g, x, y, 36, 36, '#d09a30', { r: 5 });
    for (const [x, y] of [[16, 2], [152, 2], [16, 138], [152, 138]]) vent(g, x, y, 24, 24);
    hole(g, 96, 82, 54);
    g.lineWidth = 7; g.strokeStyle = '#8f979f'; g.beginPath(); g.arc(96, 82, 58, 0, TAU); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = OUT; g.beginPath(); g.arc(96, 82, 62, 0, TAU); g.stroke();
    rivets(g, [[96, 20], [96, 144], [34, 82], [158, 82]]);
    hazard(g, 50, 172, 92, 8);
  });
  raw('bit_s', 76, 76, g => {
    for (let i = 0; i < 3; i++) { g.save(); g.translate(38, 38); g.rotate(i * TAU / 3); poly(g, [[-7, -6], [30, -9], [35, 0], [30, 9], [-7, 6]]); g.fillStyle = lg(g, 0, -9, 0, 9, '#c7ccd2', '#6d737a'); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke(); g.restore(); }
    disc(g, 38, 38, 12, '#8a6a2c'); disc(g, 38, 38, 4, '#2c2d30', { lw: 1 });
  }, 0.1);
  raw('bit_b', 116, 116, g => {
    for (let i = 0; i < 4; i++) { g.save(); g.translate(58, 58); g.rotate(i * TAU / 4); poly(g, [[-8, -8], [40, -11], [53, -5], [53, 5], [40, 11], [-8, 8]]); g.fillStyle = lg(g, 0, -11, 0, 11, '#cfd4da', '#666c73'); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke(); g.fillStyle = '#2a2a2c'; g.fillRect(42, -3, 8, 6); g.restore(); }
    disc(g, 58, 58, 18, '#d09a30'); disc(g, 58, 58, 7, '#2c2d30', { lw: 1.5 });
  }, 0.1);
  raw('chute', 40, 40, g => {
    poly(g, [[6, 12], [22, 12], [22, 4], [38, 20], [22, 36], [22, 28], [6, 28]]);
    g.fillStyle = lg(g, 0, 4, 0, 36, '#f2c14a', '#b07c18'); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
  }, 0);
  // ---- furnaces
  make('stone-furnace', 2, 2, { top: 0.35 }, (g, W, H) => {
    block(g, 8, 8, W - 16, H - 16, 18, '#8f897e', { r: 10 });
    g.strokeStyle = 'rgba(40,36,30,0.5)'; g.lineWidth = 1.6;
    for (let r = 0; r < 5; r++) { const y = -6 + r * 21; line(g, 12, y, W - 12, y); for (let c = 0; c < 4; c++) line(g, 22 + c * 28 + (r & 1) * 14, y, 22 + c * 28 + (r & 1) * 14, y + 21); }
    disc(g, 64, 44, 36, '#9a948a'); disc(g, 64, 44, 15, '#4a4640'); hole(g, 64, 44, 10);
    g.beginPath(); g.moveTo(46, 121); g.lineTo(46, 104); g.arc(64, 104, 18, Math.PI, 0); g.lineTo(82, 121); g.closePath();
    g.fillStyle = '#0d0b0a'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#4a4640'; g.stroke();
  });
  make('stone-furnace_on', 2, 2, { top: 0.35, shadow: false, grime: 0 }, g => {
    g.beginPath(); g.moveTo(48, 120); g.lineTo(48, 104); g.arc(64, 104, 16, Math.PI, 0); g.lineTo(80, 120); g.closePath();
    g.fillStyle = rg(g, 64, 116, 2, 22, '#fff3b0', '#ff9a2e', '#c2380c'); g.fill();
    g.fillStyle = rg(g, 64, 118, 4, 46, 'rgba(255,150,40,0.55)', 'rgba(255,120,20,0)'); g.fillRect(10, 70, 108, 70);
    g.fillStyle = rg(g, 64, 44, 1, 12, 'rgba(255,190,90,0.9)', 'rgba(255,110,20,0)'); g.beginPath(); g.arc(64, 44, 12, 0, TAU); g.fill();
  });
  make('electric-furnace', 3, 3, { top: 0.3 }, (g, W, H) => {
    block(g, 6, 6, W - 12, H - 12, 16, '#757c85');
    inset(g, 30, 14, 132, 104, '#1d1c1c', 8);
    g.lineWidth = 6; g.lineCap = 'round'; g.strokeStyle = '#5a3a2a';
    for (let i = 0; i < 5; i++) line(g, 44, 30 + i * 18, 148, 30 + i * 18);
    g.lineCap = 'butt';
    g.fillStyle = 'rgba(160,200,230,0.10)'; poly(g, [[34, 18], [90, 18], [50, 114], [34, 114]]); g.fill();
    vent(g, 14, 132, 50, 26); vent(g, 128, 132, 50, 26);
    box(g, 76, 130, 40, 30, '#d09a30', { r: 4 }); g.fillStyle = '#1b1b1d'; poly(g, [[98, 134], [88, 147], [95, 147], [92, 157], [104, 143], [97, 143]]); g.fill();
    cornerRivets(g, 6, -10, W - 12, H - 12, 8);
  });
  make('electric-furnace_on', 3, 3, { top: 0.3, shadow: false, grime: 0 }, g => {
    g.lineWidth = 6; g.lineCap = 'round'; g.shadowColor = '#ff7a1a'; g.shadowBlur = 14; g.strokeStyle = '#ffc060';
    for (let i = 0; i < 5; i++) line(g, 44, 30 + i * 18, 148, 30 + i * 18);
    g.shadowBlur = 0; g.fillStyle = rg(g, 96, 66, 10, 90, 'rgba(255,140,40,0.35)', 'rgba(255,120,20,0)'); g.fillRect(0, -30, 192, 190);
  });
  // ---- assemblers
  for (const [name, col, acc] of [['assembler-1', '#6f7a68', '#d09a30'], ['assembler-2', '#4f6a86', '#e0e4e8']]) {
    make(name, 3, 3, { top: 0.3 }, (g, W, H) => {
      block(g, 6, 6, W - 12, H - 12, 16, col);
      for (const [x, y] of [[12, -4], [144, -4], [12, 128], [144, 128]]) { box(g, x, y, 36, 36, sh(col, -0.2), { r: 6 }); disc(g, x + 18, y + 18, 10, '#3a3c40'); disc(g, x + 18, y + 18, 4, acc, { lw: 1 }); }
      hole(g, 96, 80, 50);
      g.lineWidth = 6; g.strokeStyle = acc; g.beginPath(); g.arc(96, 80, 54, 0, TAU); g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = OUT; g.beginPath(); g.arc(96, 80, 57.5, 0, TAU); g.stroke(); g.beginPath(); g.arc(96, 80, 50.5, 0, TAU); g.stroke();
      vent(g, 58, -4, 76, 12); hazard(g, 58, 172, 76, 8);
      tube(g, [[30, 40], [30, 120]], 7, '#8d939a'); tube(g, [[162, 40], [162, 120]], 7, '#8d939a');
    });
  }
  raw('gear_big', 100, 100, g => { gear(g, 50, 50, 46, 14, '#9aa1a8'); }, 0.1);
  raw('gear_small', 44, 44, g => { gear(g, 22, 22, 20, 9, '#c9a13c'); }, 0.08);
  // ---- lab
  make('lab', 3, 3, { top: 0.3 }, (g, W, H) => {
    block(g, 6, 6, W - 12, H - 12, 12, '#7c828a');
    const hex = r => { const p = []; for (let i = 0; i < 6; i++) p.push([96 + Math.cos(i * TAU / 6 + 0.52) * r, 82 + Math.sin(i * TAU / 6 + 0.52) * r * 0.94]); return p; };
    poly(g, hex(76)); g.fillStyle = '#4a4e55'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    poly(g, hex(68)); g.fillStyle = rg(g, 76, 60, 6, 90, '#9fdcd6', '#3f8f92', '#1d4a55'); g.fill(); g.lineWidth = 2; g.stroke();
    g.strokeStyle = 'rgba(20,40,45,0.7)'; g.lineWidth = 2; const hp = hex(68); for (const q of hp) line(g, 96, 82, q[0], q[1]);
    disc(g, 96, 82, 20, '#c8d2d6'); disc(g, 96, 82, 10, '#7b4fb0');
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.ellipse(72, 54, 26, 10, -0.6, 0, TAU); g.fill();
    cornerRivets(g, 6, -6, W - 12, H - 12, 8);
    box(g, 14, 150, 30, 14, '#d09a30', { r: 3 }); box(g, 148, 150, 30, 14, '#3fa7a0', { r: 3 });
  });
  make('lab_on', 3, 3, { top: 0.3, shadow: false, grime: 0 }, g => {
    g.fillStyle = rg(g, 96, 82, 4, 80, 'rgba(190,150,255,0.85)', 'rgba(110,220,220,0.35)', 'rgba(90,200,220,0)');
    g.beginPath(); g.arc(96, 82, 80, 0, TAU); g.fill();
  });
  // ---- generator
  make('generator', 3, 3, { top: 0.35 }, (g, W, H) => {
    block(g, 6, 6, W - 12, H - 12, 14, '#625a51');
    // boiler drum
    g.beginPath(); g.roundRect(16, 4, 92, 132, 40); g.fillStyle = lg(g, 16, 0, 108, 0, '#4d463f', '#a39a8c', '#8a8072', '#3d3731'); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    g.strokeStyle = 'rgba(30,26,22,0.8)'; g.lineWidth = 4; for (const y of [34, 70, 106]) line(g, 18, y, 106, y);
    rivets(g, [[26, 34], [62, 34], [98, 34], [26, 106], [62, 106], [98, 106]]);
    disc(g, 62, 20, 14, '#3b3836'); hole(g, 62, 20, 9);
    // flywheel housing
    box(g, 116, 14, 62, 110, '#70675c', { r: 8 }); hole(g, 147, 68, 27);
    tube(g, [[108, 70], [122, 70]], 8, '#b9772e');
    box(g, 28, 142, 60, 22, '#3f3a35', { r: 4 }); hazard(g, 34, 148, 48, 8);
    vent(g, 120, 140, 54, 22);
  });
  raw('flywheel', 56, 56, g => {
    disc(g, 28, 28, 25, '#8d939a'); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2; g.beginPath(); g.arc(28, 28, 18, 0, TAU); g.stroke();
    g.strokeStyle = '#3a3c40'; g.lineWidth = 6; for (let i = 0; i < 3; i++) { const a = i * TAU / 3; line(g, 28, 28, 28 + Math.cos(a) * 18, 28 + Math.sin(a) * 18); }
    disc(g, 28, 28, 7, '#d09a30', { lw: 1.5 });
  }, 0.08);
  // ---- solar
  make('solar-panel', 3, 3, { top: 0.12, sh: [6, 6] }, (g, W, H) => {
    block(g, 5, 5, W - 10, H - 10, 6, '#50565e', { r: 4 });
    g.beginPath(); g.rect(13, 7, W - 26, H - 26); g.fillStyle = lg(g, 13, 7, W - 13, H - 19, '#3a5c9e', '#1c2f5a', '#16244a'); g.fill();
    g.strokeStyle = 'rgba(150,180,230,0.35)'; g.lineWidth = 1.2;
    for (let i = 1; i < 6; i++) { line(g, 13 + i * (W - 26) / 6, 7, 13 + i * (W - 26) / 6, H - 19); line(g, 13, 7 + i * (H - 26) / 6, W - 13, 7 + i * (H - 26) / 6); }
    g.strokeStyle = 'rgba(10,14,30,0.9)'; g.lineWidth = 3; line(g, 13 + (W - 26) / 2, 7, 13 + (W - 26) / 2, H - 19); line(g, 13, 7 + (H - 26) / 2, W - 13, 7 + (H - 26) / 2);
    g.save(); g.beginPath(); g.rect(13, 7, W - 26, H - 26); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.13)'; poly(g, [[30, 7], [80, 7], [20, H - 19], [-30, H - 19]]); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.06)'; poly(g, [[110, 7], [130, 7], [70, H - 19], [50, H - 19]]); g.fill(); g.restore();
    g.lineWidth = 2; g.strokeStyle = OUT; g.strokeRect(13, 7, W - 26, H - 26);
  });
  // ---- accumulator
  make('accumulator', 2, 2, { top: 0.3 }, (g, W, H) => {
    block(g, 6, 6, W - 12, H - 12, 12, '#5d646c');
    for (const x of [38, 90]) {
      g.beginPath(); g.roundRect(x - 22, 20, 44, 78, 6); g.fillStyle = lg(g, x - 22, 0, x + 22, 0, '#39424b', '#8fa0ae', '#2b333b'); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
      g.beginPath(); g.ellipse(x, 20, 22, 11, 0, 0, TAU); g.fillStyle = rg(g, x - 6, 16, 2, 24, '#c6d0d8', '#6b7782'); g.fill(); g.stroke();
      disc(g, x, 19, 6, '#c87533', { lw: 1.5 });
    }
    tube(g, [[38, 16], [90, 16]], 4, '#c87533');
    inset(g, 28, 100, 72, 10, '#101112', 3);
  });
  // ---- poles
  make('pole', 1, 1, { top: 1.7, side: 0.5, shadow: false }, g => {
    g.save(); g.filter = 'blur(3px)'; g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 7; g.lineCap = 'round'; line(g, 34, 40, 78, 28); g.restore();
    g.fillStyle = lg(g, 27, 0, 37, 0, '#9a7446', '#7a5730', '#4f3619'); g.fillRect(27, -96, 10, 138);
    g.lineWidth = 2; g.strokeStyle = OUT; g.strokeRect(27, -96, 10, 138);
    g.strokeStyle = 'rgba(40,24,10,0.5)'; g.lineWidth = 1; for (let y = -84; y < 36; y += 13) line(g, 29, y, 35, y + 5);
    box(g, 6, -92, 52, 9, '#7a5730', { r: 2 });
    for (const x of [10, 32, 54]) { disc(g, x, -96, 4.5, '#cfd6da', { lw: 1.2 }); }
    box(g, 24, 36, 16, 8, '#55585c', { r: 2 });
  });
  make('big-pole', 2, 2, { top: 2.7, side: 0.3, shadow: false }, (g, W, H) => {
    g.save(); g.filter = 'blur(4px)'; g.strokeStyle = 'rgba(0,0,0,0.36)'; g.lineWidth = 16; g.lineCap = 'round'; line(g, 70, 96, 150, 70); g.restore();
    box(g, 30, 78, 68, 34, '#7e7f7b', { r: 4 });
    const L = -150;
    g.lineCap = 'round';
    const legs = () => { g.beginPath(); g.moveTo(40, 94); g.lineTo(58, L); g.moveTo(88, 94); g.lineTo(70, L); g.stroke(); };
    g.strokeStyle = OUT; g.lineWidth = 8; legs(); g.strokeStyle = '#8d949c'; g.lineWidth = 5; legs(); g.strokeStyle = '#c9d0d6'; g.lineWidth = 1.5; legs();
    g.strokeStyle = '#6b727a'; g.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) { const t0 = i / 6, t1 = (i + 1) / 6, y0 = 94 + (L - 94) * t0, y1 = 94 + (L - 94) * t1, a0 = 40 + 18 * t0, b0 = 88 - 18 * t0, a1 = 40 + 18 * t1, b1 = 88 - 18 * t1; line(g, a0, y0, b1, y1); line(g, b0, y0, a1, y1); }
    g.lineCap = 'butt';
    box(g, 20, L - 4, 88, 9, '#8d949c', { r: 2 }); box(g, 32, L + 34, 64, 7, '#8d949c', { r: 2 });
    for (const x of [24, 64, 104]) disc(g, x, L - 8, 5, '#d8e0e4', { lw: 1.2 });
  });
  // ---- pumpjack
  make('pumpjack', 3, 3, { top: 0.4 }, (g, W, H) => {
    block(g, 8, 8, W - 16, H - 16, 8, '#5e6166');
    hazard(g, 14, 6, W - 28, 8);
    disc(g, 152, 96, 20, '#3d4044'); hole(g, 152, 96, 11);
    box(g, 18, 92, 54, 62, '#8a5a3c', { r: 6 }); vent(g, 26, 100, 38, 22); disc(g, 45, 138, 9, '#d09a30');
    g.lineCap = 'round';
    const fr = () => { g.beginPath(); g.moveTo(74, 150); g.lineTo(96, 50); g.lineTo(118, 150); g.stroke(); };
    g.strokeStyle = OUT; g.lineWidth = 12; fr(); g.strokeStyle = '#d09a30'; g.lineWidth = 8; fr(); g.strokeStyle = '#f0c868'; g.lineWidth = 2; fr();
    g.lineCap = 'butt';
  });
  raw('pump_beam', 168, 44, g => {
    box(g, 10, 15, 124, 14, '#b9483a', { r: 3 });
    g.beginPath(); g.moveTo(128, 6); g.quadraticCurveTo(166, 10, 160, 40); g.lineTo(134, 36); g.closePath();
    g.fillStyle = lg(g, 128, 6, 160, 40, '#d0604e', '#8a2f24'); g.fill(); g.lineWidth = 2.2; g.strokeStyle = OUT; g.stroke();
    box(g, 4, 8, 22, 28, '#4c5056', { r: 4 }); disc(g, 84, 22, 8, '#3a3c40');
  }, 0.1);
  // ---- refinery
  make('refinery', 4, 4, { top: 0.9 }, (g, W, H) => {
    block(g, 6, 6, W - 12, H - 12, 10, '#5f646a');
    hazard(g, 14, 232, W - 28, 8);
    tube(g, [[60, 150], [60, 200], [200, 200], [200, 120]], 9, '#b9772e');
    tube(g, [[110, 90], [176, 90], [176, 40]], 7, '#8d939a');
    for (const [x, y, r, c] of [[58, 150, 40, '#9aa3ab'], [150, 168, 34, '#9aa3ab'], [206, 100, 30, '#c9b28a']]) {
      disc(g, x, y, r, c); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r * 0.72, 0, TAU); g.stroke(); disc(g, x, y, r * 0.2, '#4c5056', { lw: 1.5 });
      rivets(g, [0, 1, 2, 3, 4, 5].map(i => [x + Math.cos(i * TAU / 6) * r * 0.86, y + Math.sin(i * TAU / 6) * r * 0.86]));
    }
    // distillation column (tall)
    g.beginPath(); g.rect(52, -40, 60, 130); g.fillStyle = lg(g, 52, 0, 112, 0, '#444a50', '#b4bcc3', '#8f979e', '#353a3f'); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    g.strokeStyle = 'rgba(25,25,28,0.85)'; g.lineWidth = 4; for (const y of [-18, 14, 46, 78]) line(g, 52, y, 112, y);
    g.beginPath(); g.ellipse(82, -40, 30, 13, 0, 0, TAU); g.fillStyle = rg(g, 74, -44, 2, 32, '#d3dadf', '#7b848c'); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    g.strokeStyle = '#d09a30'; g.lineWidth = 2; line(g, 116, -30, 116, 88); line(g, 122, -30, 122, 88); for (let y = -26; y < 88; y += 9) line(g, 116, y, 122, y);
    // flare stack
    tube(g, [[214, 40], [214, -20]], 8, '#6b7178'); disc(g, 214, -22, 8, '#3a3c40');
    vent(g, 150, 22, 40, 26);
  });
  make('refinery_on', 4, 4, { top: 0.9, shadow: false, grime: 0 }, g => {
    g.fillStyle = rg(g, 214, -32, 2, 26, '#fff6c0', '#ff9a2e', 'rgba(255,90,10,0)');
    g.beginPath(); g.ellipse(214, -36, 12, 22, 0, 0, TAU); g.fill();
  });
  // ---- turret
  make('turret', 2, 2, { top: 0.2 }, (g, W, H) => {
    block(g, 8, 8, W - 16, H - 16, 8, '#62676c', { r: 22 });
    disc(g, 64, 60, 42, '#4a4e53'); g.strokeStyle = '#d09a30'; g.lineWidth = 3; g.beginPath(); g.arc(64, 60, 36, 0, TAU); g.stroke();
    rivets(g, [0, 1, 2, 3, 4, 5, 6, 7].map(i => [64 + Math.cos(i * TAU / 8) * 44, 60 + Math.sin(i * TAU / 8) * 44]));
  });
  raw('turret_gun', 112, 112, g => {
    g.fillStyle = lg(g, 0, 44, 0, 68, '#9aa1a8', '#3f4348');
    for (const y of [45, 58]) { g.beginPath(); g.roundRect(60, y, 48, 9, 2); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke(); g.fillStyle = '#1a1a1c'; g.fillRect(102, y + 2, 6, 5); g.fillStyle = lg(g, 0, 44, 0, 68, '#9aa1a8', '#3f4348'); }
    box(g, 28, 34, 46, 44, '#5d7050', { r: 8 }); box(g, 20, 42, 20, 28, '#465540', { r: 5 });
    vent(g, 46, 44, 20, 24); disc(g, 56, 56, 5, '#d09a30', { lw: 1.2 });
  }, 0.1);
  // ---- wall, lamp
  make('wall', 1, 1, { top: 0.3, sh: [5, 5] }, g => {
    block(g, 2, 2, 60, 60, 16, '#908b82', { r: 3 });
    g.strokeStyle = 'rgba(40,36,30,0.55)'; g.lineWidth = 1.6;
    for (let r = 0; r < 3; r++) { const y = -14 + r * 20; if (r) line(g, 4, y, 60, y); line(g, 22 + (r & 1) * 14, y, 22 + (r & 1) * 14, y + 20); line(g, 46 - (r & 1) * 10, y, 46 - (r & 1) * 10, y + 20); }
    line(g, 20, 48, 20, 60); line(g, 44, 48, 44, 60);
  });
  make('lamp', 1, 1, { top: 0.5, sh: [5, 5] }, g => {
    box(g, 18, 34, 28, 18, '#55585c', { r: 4 });
    g.fillStyle = lg(g, 28, 0, 36, 0, '#9aa1a8', '#4a4e53'); g.fillRect(28, 4, 8, 34); g.lineWidth = 2; g.strokeStyle = OUT; g.strokeRect(28, 4, 8, 34);
    disc(g, 32, 0, 13, '#3a3c40'); disc(g, 32, 0, 9, '#d8d4c0');
  });
  make('lamp_on', 1, 1, { top: 0.5, shadow: false, grime: 0 }, g => {
    g.fillStyle = rg(g, 32, 0, 2, 30, '#fffbe0', 'rgba(255,230,140,0.6)', 'rgba(255,220,120,0)'); g.beginPath(); g.arc(32, 0, 30, 0, TAU); g.fill();
  });
  // ---- launch pad + rocket
  make('launch-pad', 5, 5, { top: 0.3 }, (g, W, H) => {
    block(g, 5, 5, W - 10, H - 10, 10, '#73746f', { r: 8 });
    hazard(g, 14, 4, W - 28, 9); hazard(g, 14, W - 34, W - 28, 9);
    const oct = r => { const p = []; for (let i = 0; i < 8; i++) p.push([160 + Math.cos(i * TAU / 8 + 0.3927) * r, 150 + Math.sin(i * TAU / 8 + 0.3927) * r]); return p; };
    poly(g, oct(118)); g.fillStyle = '#4f5358'; g.fill(); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
    poly(g, oct(104)); g.fillStyle = lg(g, 60, 50, 260, 250, '#8c949b', '#4a4f55'); g.fill(); g.lineWidth = 2.5; g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3; line(g, 160, 46, 160, 254); line(g, 56, 150, 264, 150);
    hole(g, 160, 150, 40);
    rivets(g, oct(111));
    for (const [x, y] of [[26, 20], [270, 20], [26, 262], [270, 262]]) { box(g, x, y, 26, 26, '#d09a30', { r: 4 }); disc(g, x + 13, y + 13, 6, '#b9483a', { lw: 1.2 }); }
  });
  raw('rocket', 84, 230, g => {
    poly(g, [[14, 200], [2, 226], [28, 214]]); g.fillStyle = '#b9483a'; g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
    poly(g, [[70, 200], [82, 226], [56, 214]]); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(42, 4); g.bezierCurveTo(62, 30, 66, 70, 66, 110); g.lineTo(66, 214); g.lineTo(18, 214); g.lineTo(18, 110); g.bezierCurveTo(18, 70, 22, 30, 42, 4); g.closePath();
    g.fillStyle = lg(g, 18, 0, 66, 0, '#f2f2ee', '#d8d8d2', '#8a8c8c'); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    g.fillStyle = '#b9483a'; g.fillRect(19, 120, 46, 14); g.fillStyle = '#2b2d30'; g.fillRect(19, 196, 46, 8);
    disc(g, 42, 70, 9, '#3f86c0', { lw: 2 });
    rivets(g, [[24, 150], [60, 150], [24, 180], [60, 180]]);
  }, 0.05);
  // ---- nest
  make('nest', 3, 3, { top: 0.3, sh: [8, 7], grime: 0.16 }, (g, W, H) => {
    const r = rng(77), pts = [];
    for (let i = 0; i < 22; i++) { const a = i / 22 * TAU, d = 78 + r() * 16; pts.push([96 + Math.cos(a) * d, 90 + Math.sin(a) * d * 0.9]); }
    poly(g, pts); g.fillStyle = rg(g, 76, 60, 10, 110, '#8a5a78', '#5b3a52', '#33202e'); g.fill(); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
    g.strokeStyle = 'rgba(30,14,26,0.5)'; g.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) { const a = r() * TAU; g.beginPath(); g.moveTo(96, 90); g.quadraticCurveTo(96 + Math.cos(a + 0.5) * 40, 90 + Math.sin(a + 0.5) * 36, 96 + Math.cos(a) * 80, 90 + Math.sin(a) * 72); g.stroke(); }
    for (const [x, y, s] of [[96, 80, 24], [50, 60, 13], [140, 64, 14], [60, 122, 15], [134, 124, 16]]) {
      g.beginPath(); g.ellipse(x, y, s, s * 0.78, 0, 0, TAU); g.fillStyle = '#9a6a86'; g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
      g.beginPath(); g.ellipse(x, y + 2, s * 0.68, s * 0.5, 0, 0, TAU); g.fillStyle = rg(g, x, y + 4, 1, s, '#b6e060', '#263a10', '#0a0c06'); g.fill();
    }
  });
}

// =========================================================== nature, creatures, fx
function genNature() {
  const cols = [['#2a5226', '#5a9440'], ['#3b5a22', '#86a544'], ['#234a36', '#48906c'], ['#55601f', '#a2ac48']];
  cols.forEach((c, v) => make('tree' + v, 1, 1, { top: 1.5, side: 0.7, shadow: false, grime: 0.14 }, g => {
    const r = rng(100 + v * 7);
    g.save(); g.filter = 'blur(5px)'; g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(54, 42, 42, 20, -0.2, 0, TAU); g.fill(); g.restore();
    g.fillStyle = lg(g, 25, 0, 39, 0, '#7a5632', '#4a3220'); g.beginPath(); g.moveTo(27, 10); g.lineTo(37, 10); g.lineTo(40, 48); g.lineTo(24, 48); g.closePath(); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
    const bl = [];
    for (let i = 0; i < 19; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 31; bl.push([32 + Math.cos(a) * d * 1.2, -4 + Math.sin(a) * d * 0.85, 13 + r() * 10]); }
    bl.sort((a, b) => a[1] - b[1]);
    g.fillStyle = sh(c[0], -0.6); for (const b of bl) { g.beginPath(); g.arc(b[0], b[1], b[2] + 2.5, 0, TAU); g.fill(); }
    for (const b of bl) {
      const gr = g.createRadialGradient(b[0] - b[2] * 0.45, b[1] - b[2] * 0.45, 1, b[0], b[1], b[2]);
      gr.addColorStop(0, c[1]); gr.addColorStop(0.55, sh(c[0], 0.12)); gr.addColorStop(1, sh(c[0], -0.3));
      g.fillStyle = gr; g.beginPath(); g.arc(b[0], b[1], b[2], 0, TAU); g.fill();
    }
  }));
  // ore: [type][density*4+variant]
  const OC = [null, ['#7f9bb3', '#a9c4d8'], ['#c9743a', '#f0a868'], ['#2c2c30', '#55555c'], ['#b0a794', '#d8d0bf']];
  for (let t = 1; t <= 4; t++) {
    ORE[t] = [];
    for (let dn = 0; dn < 3; dn++) for (let v = 0; v < 4; v++) {
      const c = cv(84, 84), g = c.getContext('2d'), r = rng(t * 100 + dn * 10 + v);
      const n = [5, 10, 16][dn];
      const ch = []; for (let i = 0; i < n; i++) ch.push([42 + (r() - 0.5) * 60, 42 + (r() - 0.5) * 60, 4.5 + r() * (4 + dn * 1.6)]);
      ch.sort((a, b) => a[1] - b[1]);
      for (const k of ch) chunk(g, k[0], k[1], k[2], OC[t], r);
      grime(c, 0.1);
      ORE[t].push(withShadow(c, [2, 2]));
    }
  }
  ORE[5] = [];
  for (let v = 0; v < 4; v++) {
    const c = cv(84, 84), g = c.getContext('2d'), r = rng(900 + v), pts = [];
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, d = 24 + r() * 12; pts.push([42 + Math.cos(a) * d, 42 + Math.sin(a) * d * 0.8]); }
    g.beginPath(); pts.forEach((p, i) => { const q = pts[(i + 1) % 14]; const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; i ? g.quadraticCurveTo(p[0], p[1], mx, my) : g.moveTo(mx, my); }); g.closePath();
    g.fillStyle = rg(g, 36, 36, 2, 40, '#2a2330', '#0c0b10'); g.fill();
    g.fillStyle = 'rgba(160,120,220,0.25)'; g.beginPath(); g.ellipse(34, 34, 12, 5, -0.5, 0, TAU); g.fill();
    g.fillStyle = 'rgba(90,200,190,0.18)'; g.beginPath(); g.ellipse(50, 46, 9, 4, 0.3, 0, TAU); g.fill();
    for (let d = 0; d < 3; d++) ORE[5][d * 4 + v] = c;
  }
}
function chunk(g, x, y, s, col, r) {
  const n = 5 + (r() * 3 | 0), pts = [], a0 = r() * TAU;
  for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU, d = s * (0.7 + r() * 0.5); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85]); }
  poly(g, pts); g.fillStyle = lg(g, x - s, y - s, x + s, y + s, col[1], col[0], sh(col[0], -0.45)); g.fill(); g.lineWidth = 1.4; g.strokeStyle = 'rgba(14,12,10,0.85)'; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1; line(g, pts[0][0], pts[0][1], x, y); line(g, pts[2][0], pts[2][1], x, y);
}
function genCreatures() {
  // engineer, facing +x
  raw('player', 64, 64, g => {
    box(g, 12, 20, 16, 24, '#5a5148', { r: 4 });
    g.beginPath(); g.ellipse(32, 32, 13, 19, 0, 0, TAU); g.fillStyle = lg(g, 20, 14, 44, 50, '#e08a3a', '#b5621e'); g.fill(); g.lineWidth = 2.2; g.strokeStyle = OUT; g.stroke();
    for (const y of [15, 49]) { g.beginPath(); g.ellipse(36, y, 8, 5, 0, 0, TAU); g.fillStyle = '#c7722a'; g.fill(); g.stroke(); disc(g, 44, y, 4, '#d8b08a', { lw: 1.2 }); }
    disc(g, 33, 32, 10.5, '#e2dccb'); g.fillStyle = '#23282e'; g.beginPath(); g.arc(33, 32, 8, -0.9, 0.9); g.lineTo(36, 32); g.closePath(); g.fill();
    g.fillStyle = 'rgba(140,200,230,0.5)'; g.beginPath(); g.arc(34, 31, 6, -0.7, 0.1); g.lineTo(37, 31); g.fill();
  }, 0.06);
  for (const [nm, col, hi] of [['crawler', '#7a3d36', '#c0694c'], ['crawler_big', '#4c2f58', '#9a62b4'], ['spitter', '#3e6a2a', '#a6d84e']])
    for (let f = 0; f < 2; f++) raw(nm + f, 72, 72, g => {
      g.strokeStyle = OUT; g.lineCap = 'round';
      for (const sgn of [-1, 1]) for (let i = 0; i < 3; i++) {
        const bx = 26 + i * 9, sw = ((i + f) & 1 ? 5 : -5);
        g.lineWidth = 4.5; g.strokeStyle = OUT; g.beginPath(); g.moveTo(bx, 36 + sgn * 6); g.lineTo(bx + sw * 0.4, 36 + sgn * 18); g.lineTo(bx + sw, 36 + sgn * 30); g.stroke();
        g.lineWidth = 2.2; g.strokeStyle = sh(col, -0.3); g.stroke();
      }
      g.lineCap = 'butt';
      for (const [x, rx, ry] of [[20, 14, 12], [38, 11, 10], [53, 8, 8]]) {
        g.beginPath(); g.ellipse(x, 36, rx, ry, 0, 0, TAU); g.fillStyle = rg(g, x - 3, 31, 1, rx + 4, hi, col, sh(col, -0.5)); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
      }
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(20, 36, 8, -1.2, 1.2); g.stroke();
      g.strokeStyle = '#e8d8b0'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(58, 32); g.lineTo(67, 30); g.moveTo(58, 40); g.lineTo(67, 42); g.stroke();
      g.fillStyle = '#ffd040'; g.beginPath(); g.arc(56, 33, 1.8, 0, TAU); g.arc(56, 39, 1.8, 0, TAU); g.fill();
    }, 0.1);
  raw('smoke', 64, 64, g => { g.fillStyle = rg(g, 32, 32, 2, 30, 'rgba(210,205,200,0.75)', 'rgba(150,146,142,0.35)', 'rgba(120,118,116,0)'); g.fillRect(0, 0, 64, 64); }, 0);
  raw('glow', 128, 128, g => { g.fillStyle = rg(g, 64, 64, 4, 64, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'); g.fillRect(0, 0, 128, 128); }, 0);
  raw('boom', 96, 96, g => { g.fillStyle = rg(g, 48, 48, 2, 46, '#fff6c8', '#ffb23a', 'rgba(220,70,10,0.5)', 'rgba(120,30,0,0)'); g.fillRect(0, 0, 96, 96); }, 0);
  const warn = (nm, bg, fn) => raw(nm, 48, 48, g => {
    disc(g, 24, 24, 20, bg); g.fillStyle = '#16161a'; fn(g);
  }, 0);
  warn('warn_power', '#f0c030', g => { poly(g, [[27, 6], [13, 27], [22, 27], [19, 42], [35, 20], [26, 20]]); g.fill(); });
  warn('warn_fuel', '#e05535', g => { g.beginPath(); g.moveTo(24, 6); g.bezierCurveTo(38, 20, 36, 40, 24, 41); g.bezierCurveTo(12, 40, 10, 22, 24, 6); g.fill(); g.fillStyle = '#e05535'; g.beginPath(); g.arc(24, 32, 5, 0, TAU); g.fill(); });
  warn('warn_ore', '#e05535', g => { g.lineWidth = 6; g.strokeStyle = '#16161a'; line(g, 14, 14, 34, 34); line(g, 34, 14, 14, 34); });
  warn('warn_ammo', '#e05535', g => { g.fillRect(19, 16, 10, 22); g.beginPath(); g.arc(24, 16, 5, Math.PI, 0); g.fill(); });
}

// =========================================================== icons
function ico(id, draw, gr = 0.07) { const c = cv(64, 64), g = c.getContext('2d'); draw(g); if (gr) grime(c, gr); ICON[id] = c; }
function plates(g, col) {
  for (let i = 0; i < 3; i++) {
    const y = 40 - i * 9;
    poly(g, [[6, y], [40, y - 10], [58, y - 2], [24, y + 10]]); g.fillStyle = lg(g, 6, y - 10, 58, y + 10, sh(col, 0.3), col, sh(col, -0.25)); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
    poly(g, [[6, y], [24, y + 10], [24, y + 15], [6, y + 5]]); g.fillStyle = sh(col, -0.45); g.fill(); g.stroke();
    poly(g, [[24, y + 10], [58, y - 2], [58, y + 3], [24, y + 15]]); g.fillStyle = sh(col, -0.3); g.fill(); g.stroke();
  }
}
function flask(g, col) {
  g.beginPath(); g.moveTo(26, 8); g.lineTo(38, 8); g.lineTo(38, 22); g.lineTo(54, 50); g.quadraticCurveTo(56, 58, 48, 58); g.lineTo(16, 58); g.quadraticCurveTo(8, 58, 10, 50); g.lineTo(26, 22); g.closePath();
  g.fillStyle = 'rgba(220,235,240,0.55)'; g.fill();
  g.save(); g.clip(); g.fillStyle = lg(g, 0, 32, 0, 60, sh(col, 0.25), col, sh(col, -0.35)); g.fillRect(0, 34, 64, 30);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(18, 36, 5, 18); g.restore();
  g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
  box(g, 23, 4, 18, 7, '#b9bdc2', { r: 2 });
}
function board(g, col, chip) {
  box(g, 6, 14, 52, 38, col, { r: 4 });
  g.strokeStyle = sh(col, 0.45); g.lineWidth = 1.6;
  for (const p of [[[12, 22], [22, 22], [22, 30]], [[52, 44], [40, 44], [40, 36]], [[12, 44], [18, 38], [26, 38]], [[52, 22], [44, 22], [44, 28]]]) { g.beginPath(); p.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.stroke(); }
  box(g, 24, 25, 18, 14, chip, { r: 2 });
  g.fillStyle = '#d9c070'; for (const [x, y] of [[12, 22], [52, 44], [12, 44], [52, 22]]) { g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill(); }
}
function genIcons() {
  const r = rng(5);
  const oreIcon = (id, col) => ico(id, g => { for (const k of [[22, 26, 14], [42, 30, 13], [30, 44, 14]]) chunk(g, k[0], k[1], k[2], col, r); });
  oreIcon('iron-ore', ['#7f9bb3', '#b6d0e2']); oreIcon('copper-ore', ['#c9743a', '#f0a868']); oreIcon('coal', ['#2c2c30', '#5c5c64']); oreIcon('stone', ['#b0a794', '#ded6c6']);
  ico('wood', g => {
    for (const [x, y] of [[8, 34], [14, 14]]) {
      g.save(); g.translate(x, y); g.rotate(-0.25);
      g.beginPath(); g.roundRect(0, 0, 44, 16, 8); g.fillStyle = lg(g, 0, 0, 0, 16, '#b07a44', '#6a4424'); g.fill(); g.lineWidth = 2.2; g.strokeStyle = OUT; g.stroke();
      g.beginPath(); g.ellipse(42, 8, 5, 8, 0, 0, TAU); g.fillStyle = '#d9b27a'; g.fill(); g.stroke(); g.beginPath(); g.ellipse(42, 8, 2, 4, 0, 0, TAU); g.strokeStyle = '#8a6238'; g.lineWidth = 1; g.stroke();
      g.restore();
    }
  });
  ico('iron-plate', g => plates(g, '#aab3bc')); ico('copper-plate', g => plates(g, '#d9874a')); ico('steel-plate', g => plates(g, '#7d8a98')); ico('alloy-plating', g => plates(g, '#e3dcbf'));
  ico('stone-brick', g => { block(g, 8, 20, 48, 34, 12, '#a39c90', { r: 3 }); g.strokeStyle = 'rgba(40,36,30,0.5)'; g.lineWidth = 1.5; line(g, 10, 25, 54, 25); line(g, 32, 9, 32, 25); line(g, 20, 25, 20, 41); line(g, 44, 25, 44, 41); });
  ico('gear', g => gear(g, 32, 32, 27, 10, '#9aa1a8'));
  ico('copper-wire', g => { for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(32, 20 + i * 6, 22, 9, 0, 0, TAU); g.strokeStyle = OUT; g.lineWidth = 6; g.stroke(); g.strokeStyle = i & 1 ? '#e09252' : '#c87533'; g.lineWidth = 3.4; g.stroke(); } });
  ico('circuit', g => board(g, '#3d7a3a', '#22252a'));
  ico('adv-circuit', g => { board(g, '#a23a34', '#22252a'); box(g, 10, 8, 14, 10, '#d09a30', { r: 2 }); box(g, 40, 46, 14, 10, '#3f86c0', { r: 2 }); });
  ico('plastic', g => { for (const [x, y] of [[8, 30], [16, 14]]) { g.save(); g.translate(x, y); g.rotate(-0.2); box(g, 0, 0, 44, 15, '#dfe8ee', { r: 3 }); g.restore(); } });
  ico('solid-fuel', g => { block(g, 12, 22, 40, 32, 12, '#3a3632', { r: 4 }); g.fillStyle = '#e07a20'; g.fillRect(14, 20, 36, 5); g.fillRect(14, 46, 36, 4); });
  ico('pipe', g => { g.save(); g.translate(32, 32); g.rotate(-0.5); g.fillStyle = lg(g, 0, -10, 0, 10, '#c5ccd2', '#8d949b', '#4a4f55'); g.fillRect(-24, -10, 48, 20); g.lineWidth = 2.2; g.strokeStyle = OUT; g.strokeRect(-24, -10, 48, 20); for (const x of [-28, 20]) box(g, x, -14, 8, 28, '#9aa1a8', { r: 2 }); g.restore(); });
  ico('engine', g => { box(g, 8, 24, 48, 28, '#6b7178', { r: 5 }); for (const x of [14, 28, 42]) { box(g, x, 10, 10, 20, '#9aa1a8', { r: 2 }); } tube(g, [[10, 46], [54, 46]], 5, '#b9772e'); disc(g, 50, 38, 7, '#d09a30', { lw: 1.5 }); });
  ico('battery', g => { g.beginPath(); g.roundRect(18, 14, 28, 44, 5); g.fillStyle = lg(g, 18, 0, 46, 0, '#2f4a3a', '#6fba7c', '#27402f'); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke(); box(g, 25, 7, 14, 9, '#c8ced3', { r: 2 }); g.fillStyle = '#e8f0e0'; g.fillRect(29, 28, 6, 16); g.fillRect(24, 33, 16, 6); });
  ico('rocket-part', g => { poly(g, [[32, 4], [50, 26], [50, 54], [14, 54], [14, 26]]); g.fillStyle = lg(g, 14, 0, 50, 0, '#f0f0ea', '#9a9c9c'); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke(); g.fillStyle = '#b9483a'; g.fillRect(15, 36, 34, 7); disc(g, 32, 24, 6, '#3f86c0', { lw: 1.5 }); g.fillStyle = '#2b2d30'; g.fillRect(18, 54, 28, 6); });
  ico('sci1', g => flask(g, '#e0a030'), 0.04); ico('sci2', g => flask(g, '#2fb3a4'), 0.04); ico('sci3', g => flask(g, '#8e5bd0'), 0.04);
  ico('ammo', g => { box(g, 14, 22, 36, 34, '#b89a3a', { r: 4 }); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; for (let y = 30; y < 54; y += 7) line(g, 17, y, 47, y); for (const x of [20, 30, 40]) { g.beginPath(); g.moveTo(x - 4, 22); g.lineTo(x - 4, 14); g.quadraticCurveTo(x, 4, x + 4, 14); g.lineTo(x + 4, 22); g.closePath(); g.fillStyle = lg(g, x - 4, 0, x + 4, 0, '#f0c070', '#a06a28'); g.fill(); g.lineWidth = 1.6; g.strokeStyle = OUT; g.stroke(); } });
  ico('crude-oil', g => { box(g, 14, 16, 36, 42, '#3a4048', { r: 5 }); box(g, 22, 8, 12, 10, '#d09a30', { r: 2 }); g.beginPath(); g.moveTo(32, 26); g.bezierCurveTo(42, 38, 40, 50, 32, 50); g.bezierCurveTo(24, 50, 22, 38, 32, 26); g.fillStyle = '#0c0b10'; g.fill(); g.fillStyle = 'rgba(160,120,220,0.5)'; g.beginPath(); g.ellipse(29, 42, 2, 4, 0.3, 0, TAU); g.fill(); });

  // building icons from their sprites
  const fit = (id, src, sx, sy, sw, sh2) => { const c = cv(64, 64), g = c.getContext('2d'); const k = Math.min(60 / sw, 60 / sh2); g.imageSmoothingQuality = 'high'; g.drawImage(src, sx, sy, sw, sh2, 32 - sw * k / 2, 32 - sh2 * k / 2, sw * k, sh2 * k); ICON[id] = c; return g; };
  for (const id in PROTO) {
    const p = PROTO[id]; if (p.natural || ICON[id]) continue;
    if (p.type === 'belt') { ICON[id] = BELT[id].s[0][0]; continue; }
    if (id === 'ubelt') { const g = fit(id, BELT.belt.s[0][0], 0, 0, 64, 64); g.drawImage(SPR.ubelt_in0.c, 2, 2, 60, 60); continue; }
    if (id === 'splitter') { fit(id, SPR.splitter0.c, 0, 0, 128, 64); continue; }
    const s = SPR[id];
    const g = fit(id, s.c, P - 2, 0, s.c.width - 2 * P + 14, s.c.height - P + 12);
    if (p.type === 'arm') { const a = SPR['armh_' + id].c; g.save(); g.translate(32, 34); g.rotate(0.5); const k = 46 / a.height; g.drawImage(a, -a.width * k / 2, -a.height * k + 4, a.width * k, a.height * k); g.restore(); }
    if (p.type === 'drill') { const b = SPR[p.w === 2 ? 'bit_s' : 'bit_b'].c; g.drawImage(b, 32 - 17, 30 - 17, 34, 34); }
    if (id === 'assembler-1' || id === 'assembler-2') g.drawImage(SPR.gear_big.c, 17, 14, 30, 30);
    if (p.type === 'turret') g.drawImage(SPR.turret_gun.c, 8, 6, 48, 48);
    if (p.type === 'pumpjack') g.drawImage(SPR.pump_beam.c, 8, 14, 50, 13);
  }
  // CSS classes for DOM
  let css = '';
  for (const id in ICON) css += `.i-${id}{background-image:url(${ICON[id].toDataURL()})}\n`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
}

// =========================================================== fluids
export const PIPE = [];
function pipeRun(g, d, w = 20) {
  const c = 32, h = w / 2;
  g.save(); g.translate(c, c); g.rotate(d * Math.PI / 2);
  g.fillStyle = lg(g, -h, 0, h, 0, '#5b6168', '#c3cad1', '#8d949b', '#3c4146'); g.fillRect(-h, -c - 1, w, c + 1);
  g.strokeStyle = OUT; g.lineWidth = 2; line(g, -h, -c - 1, -h, 0); line(g, h, -c - 1, h, 0);
  // flange at the tile edge
  g.fillStyle = lg(g, -h - 3, 0, h + 3, 0, '#6b7178', '#d3d9de', '#7d848b', '#40454a'); g.fillRect(-h - 3, -c, w + 6, 6);
  g.strokeRect(-h - 3, -c, w + 6, 6);
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-h - 1, -c + 2, 2, 2); g.fillRect(h - 1, -c + 2, 2, 2);
  g.restore();
}
function genFluids() {
  // pipes: 16 connection masks (bit d = connected toward direction d)
  for (let m = 0; m < 16; m++) {
    const c = cv(64, 64), g = c.getContext('2d');
    const ds = [0, 1, 2, 3].filter(d => m & (1 << d));
    const straight = (m === 5 || m === 10);
    if (!ds.length) { pipeRun(g, 0); pipeRun(g, 2); }
    else if (ds.length === 1) { pipeRun(g, ds[0]); pipeRun(g, (ds[0] + 2) & 3); }
    else for (const d of ds) pipeRun(g, d);
    if (!straight) {
      g.beginPath(); g.roundRect(18, 18, 28, 28, 6);
      g.fillStyle = rg(g, 26, 26, 2, 26, '#d6dce1', '#959ca3', '#50565c'); g.fill(); g.lineWidth = 2; g.strokeStyle = OUT; g.stroke();
      rivets(g, [[23, 23], [41, 23], [23, 41], [41, 41]]);
    }
    if (!ds.length || ds.length === 1) { // end caps
      for (const d of [0, 2]) { g.save(); g.translate(32, 32); g.rotate(((ds[0] ?? 0) + d) * Math.PI / 2); box(g, -13, -31, 26, 7, '#9aa1a8', { r: 2 }); g.restore(); }
    }
    grime(c, 0.08);
    PIPE[m] = withShadow(c, [3, 3]);
  }
  // underground pipe: connection to the south, hood going down at the north
  {
    const c = cv(64, 64), g = c.getContext('2d');
    pipeRun(g, 2);
    box(g, 10, 8, 44, 30, '#7a8189', { r: 6 });
    g.fillStyle = '#0c0c0d'; g.beginPath(); g.roundRect(16, 4, 32, 12, [6, 6, 0, 0]); g.fill();
    hazard(g, 16, 26, 32, 6);
    rivets(g, [[15, 20], [49, 20]]);
    grime(c, 0.1);
    const s = withShadow(c, [3, 3]);
    for (let d = 0; d < 4; d++) SPR['pipeug' + d] = { c: rot64(s, d), ox: 0, oy: 0 };
  }
  SPR.pipe = { c: PIPE[10], ox: 0, oy: 0 };
  ICON.pipe = (() => { const c = cv(64, 64), g = c.getContext('2d'); g.drawImage(PIPE[5], 0, 0); return c; })();
  ICON['pipe-ug'] = SPR.pipeug0.c;

  // connection stub drawn on machines, pointing up (north)
  raw('stub', 28, 24, g => {
    g.fillStyle = lg(g, 4, 0, 24, 0, '#5b6168', '#c3cad1', '#8d949b', '#3c4146'); g.fillRect(5, 6, 18, 18); g.strokeStyle = OUT; g.lineWidth = 2; g.strokeRect(5, 6, 18, 18);
    box(g, 2, 2, 24, 7, '#a8afb6', { r: 2 });
  }, 0.08);

  // offshore pump (output north, water to the south)
  make('offshore-pump', 1, 1, { top: 0.15, sh: [4, 4] }, g => {
    g.fillStyle = lg(g, 24, 0, 40, 0, '#5b6168', '#c3cad1', '#3c4146'); g.fillRect(24, 34, 16, 34); g.lineWidth = 2; g.strokeStyle = OUT; g.strokeRect(24, 34, 16, 34);
    box(g, 10, 6, 44, 34, '#d09a30', { r: 6 });
    disc(g, 32, 22, 11, '#5b6168'); disc(g, 32, 22, 4, '#2c2d30', { lw: 1 });
    vent(g, 15, 11, 8, 20); vent(g, 41, 11, 8, 20);
    pipeRun(g, 0, 14);
  });

  // boiler: horizontal (steam to N/S) and vertical variants
  for (const hz of [1, 0]) make('boiler_' + (hz ? 'h' : 'v'), 3, 3, { top: 0.4 }, (g, W, H) => {
    block(g, 8, 8, W - 16, H - 16, 10, '#5d5650');
    g.save();
    if (!hz) { g.translate(96, 96); g.rotate(Math.PI / 2); g.translate(-96, -96); }
    g.beginPath(); g.roundRect(22, 34, 148, 76, 38);
    g.fillStyle = lg(g, 0, 34, 0, 110, '#3d3731', '#b0a596', '#8a7f70', '#3a342e'); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    g.strokeStyle = 'rgba(30,26,22,0.8)'; g.lineWidth = 4; for (const x of [58, 96, 134]) line(g, x, 36, x, 108);
    rivets(g, [58, 96, 134].flatMap(x => [[x - 6, 44], [x - 6, 100]]));
    g.restore();
    box(g, 66, 120, 60, 40, '#3f3a35', { r: 4 });
    g.fillStyle = '#100c0a'; g.beginPath(); g.roundRect(76, 128, 40, 22, 4); g.fill();
    disc(g, 150, 30, 13, '#4a4540'); hole(g, 150, 30, 8);
  });
  make('boiler_on', 3, 3, { top: 0.4, shadow: false, grime: 0 }, g => {
    g.fillStyle = rg(g, 96, 140, 2, 26, '#fff3b0', '#ff9a2e', '#c2380c'); g.beginPath(); g.roundRect(78, 130, 36, 18, 3); g.fill();
    g.fillStyle = rg(g, 96, 146, 4, 60, 'rgba(255,150,40,0.45)', 'rgba(255,120,20,0)'); g.fillRect(30, 96, 132, 96);
  });
  SPR.boiler = SPR.boiler_h;

  // steam engine: vertical (steam N/S) and horizontal variants
  for (const vt of [1, 0]) make('steam-engine_' + (vt ? 'v' : 'h'), 3, 3, { top: 0.3 }, (g, W, H) => {
    block(g, 6, 6, W - 12, H - 12, 10, '#4e5a62');
    g.save();
    if (!vt) { g.translate(96, 86); g.rotate(-Math.PI / 2); g.translate(-96, -86); }
    g.beginPath(); g.roundRect(70, 2, 52, 168, 24);
    g.fillStyle = lg(g, 70, 0, 122, 0, '#3c4146', '#c3cad1', '#8d949b', '#30353a'); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    g.strokeStyle = 'rgba(20,20,24,0.8)'; g.lineWidth = 3; for (const y of [40, 86, 132]) line(g, 72, y, 120, y);
    box(g, 130, 34, 40, 104, '#65707a', { r: 6 }); hole(g, 150, 86, 16);
    box(g, 24, 50, 38, 72, '#d09a30', { r: 5 }); vent(g, 30, 58, 26, 56);
    g.restore();
  });
  SPR['steam-engine'] = SPR['steam-engine_v'];

  // storage tank
  make('storage-tank', 3, 3, { top: 0.5 }, (g, W, H) => {
    block(g, 10, 10, W - 20, H - 20, 8, '#575c62', { r: 10 });
    g.beginPath(); g.arc(96, 70, 80, 0, TAU); g.fillStyle = rg(g, 72, 44, 8, 96, '#e3e6e8', '#a5adb4', '#5e656c', '#3a3f44'); g.fill(); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
    g.strokeStyle = 'rgba(30,30,34,0.45)'; g.lineWidth = 2; g.beginPath(); g.arc(96, 70, 62, 0, TAU); g.stroke(); g.beginPath(); g.arc(96, 70, 36, 0, TAU); g.stroke();
    rivets(g, Array.from({ length: 12 }, (_, i) => [96 + Math.cos(i * TAU / 12) * 72, 70 + Math.sin(i * TAU / 12) * 72]));
    disc(g, 96, 70, 12, '#d09a30');
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.ellipse(70, 40, 30, 12, -0.6, 0, TAU); g.fill();
  });

  // chemical plant
  make('chem-plant', 3, 3, { top: 0.45 }, (g, W, H) => {
    block(g, 6, 6, W - 12, H - 12, 12, '#5a6a5e');
    tube(g, [[52, 120], [52, 150], [140, 150], [140, 120]], 8, '#b9772e');
    for (const [x, y, r, c] of [[56, 70, 34, '#cfd5d8'], [138, 58, 28, '#c9b28a']]) {
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = rg(g, x - r * 0.4, y - r * 0.4, 2, r * 1.2, '#ffffff', c, sh(c, -0.5)); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x, y + r * 0.15, r * 0.7, 0.2, Math.PI - 0.2); g.fill();
      disc(g, x, y - r * 0.2, r * 0.25, '#4c5056', { lw: 1.5 });
    }
    box(g, 106, 96, 60, 40, '#3e4a42', { r: 5 });
    inset(g, 112, 102, 48, 26, '#141716', 3);
    tube(g, [[88, 70], [110, 70], [110, 58]], 6, '#8d949b');
    hazard(g, 24, 172, 60, 8);
  });
  make('chem-plant_on', 3, 3, { top: 0.45, shadow: false, grime: 0 }, g => {
    g.fillStyle = rg(g, 136, 115, 2, 30, 'rgba(200,255,140,0.95)', 'rgba(120,220,90,0.4)', 'rgba(90,200,80,0)'); g.fillRect(100, 90, 72, 50);
  });

  // fluid icons
  const drop = (g, col) => {
    g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(48, 26, 54, 36, 54, 42); g.bezierCurveTo(54, 54, 44, 60, 32, 60); g.bezierCurveTo(20, 60, 10, 54, 10, 42); g.bezierCurveTo(10, 36, 16, 26, 32, 6); g.closePath();
    g.fillStyle = rg(g, 24, 36, 2, 30, sh(col, 0.45), col, sh(col, -0.45)); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(23, 40, 4, 8, 0.3, 0, TAU); g.fill();
  };
  for (const [id, col] of [['water', '#3f86c8'], ['crude-oil', '#4a3a52'], ['petroleum', '#c07ac8']]) ico(id, g => drop(g, col), 0);
  ico('steam', g => {
    for (const [x, y, r] of [[22, 38, 14], [38, 32, 16], [30, 22, 12], [44, 44, 12], [20, 48, 10]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = rg(g, x - 4, y - 4, 1, r, '#ffffff', '#d4d4d0', '#9a9a96'); g.fill(); }
  }, 0);
  const warn = (nm, bg, fn) => raw(nm, 48, 48, g => { disc(g, 24, 24, 20, bg); g.fillStyle = '#16161a'; fn(g); }, 0);
  const wdrop = g => { g.beginPath(); g.moveTo(24, 9); g.bezierCurveTo(33, 21, 35, 26, 35, 30); g.bezierCurveTo(35, 36, 30, 40, 24, 40); g.bezierCurveTo(18, 40, 13, 36, 13, 30); g.bezierCurveTo(13, 26, 15, 21, 24, 9); g.fill(); };
  warn('warn_water', '#3f86c8', wdrop); warn('warn_fluid', '#e0a030', wdrop);
  warn('warn_steam', '#c8c8c4', g => { for (const [x, y, r] of [[18, 28, 7], [27, 22, 8], [30, 31, 7]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } });
}

// =========================================================== railways
export const RAIL = [];
function railLayer(g, m, pass) {
  const ds = [0, 1, 2, 3].filter(d => m & (1 << d));
  const straight = [], curves = [];
  if (ds.length === 1) straight.push(ds[0] & 1);
  if (m & 5) { if ((m & 5) === 5) straight.push(0); }
  if ((m & 10) === 10) straight.push(1);
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) if ((m & (1 << a)) && (m & (1 << b)) && !(ds.length === 4)) curves.push(a);
  if (ds.length === 2 && ((m & 5) === 5 || (m & 10) === 10)) curves.length = 0;
  const G0 = 14;  // half gauge in px
  if (pass === 0) {  // sleepers
    g.fillStyle = '#5a4430'; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
    for (const ax of straight) for (let i = 4; i < 64; i += 12) { if (ax === 0) { g.fillRect(12, i, 40, 6); g.strokeRect(12, i, 40, 6); } else { g.fillRect(i, 12, 6, 40); g.strokeRect(i, 12, 6, 40); } }
    for (const a of curves) {
      const cx = a === 0 || a === 1 ? 64 : 0, cy = a === 1 || a === 2 ? 64 : 0, a0 = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][a];
      for (let k = 0; k < 4; k++) { const t = a0 + (k + 0.5) / 4 * Math.PI / 2; g.save(); g.translate(cx + Math.cos(t) * 32, cy + Math.sin(t) * 32); g.rotate(t); g.fillRect(-20, -3, 40, 6); g.strokeRect(-20, -3, 40, 6); g.restore(); }
    }
  } else {   // steel rails
    const steel = (fn) => { g.lineCap = 'butt'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 5; fn(); g.stroke(); g.strokeStyle = '#8f969c'; g.lineWidth = 3; fn(); g.stroke(); g.strokeStyle = '#d6dce0'; g.lineWidth = 1; fn(); g.stroke(); };
    for (const ax of straight) for (const o of [-G0, G0]) steel(() => { g.beginPath(); if (ax === 0) { g.moveTo(32 + o, 0); g.lineTo(32 + o, 64); } else { g.moveTo(0, 32 + o); g.lineTo(64, 32 + o); } });
    for (const a of curves) {
      const cx = a === 0 || a === 1 ? 64 : 0, cy = a === 1 || a === 2 ? 64 : 0, a0 = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][a];
      for (const r of [32 - G0, 32 + G0]) steel(() => { g.beginPath(); g.arc(cx, cy, r, a0, a0 + Math.PI / 2); });
    }
    if (ds.length === 1) {   // buffer stop at the open end
      const d = (ds[0] + 2) & 3; g.save(); g.translate(32, 32); g.rotate(d * Math.PI / 2); box(g, -20, -30, 40, 9, '#b9483a', { r: 2 }); g.restore();
    }
  }
}
function genRails() {
  for (let m = 0; m < 16; m++) {
    const c = cv(64, 64), g = c.getContext('2d');
    g.fillStyle = 'rgba(70,62,54,0.35)';
    const ds = [0, 1, 2, 3].filter(d => m & (1 << d));
    if (ds.length) { g.beginPath(); g.arc(32, 32, 24, 0, TAU); g.fill(); for (const d of ds) { g.save(); g.translate(32, 32); g.rotate(d * Math.PI / 2); g.fillRect(-24, -32, 48, 32); g.restore(); } }
    railLayer(g, m || 5, 0); railLayer(g, m || 5, 1);
    grime(c, 0.06);
    RAIL[m] = c;
  }
  ICON.rail = RAIL[5]; SPR.rail = { c: RAIL[5], ox: 0, oy: 0 };
  make('train-stop', 1, 1, { top: 1.2, shadow: false }, g => {
    g.save(); g.filter = 'blur(3px)'; g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(34, 36, 40, 8); g.restore();
    box(g, 20, 40, 24, 14, '#55585c', { r: 3 });
    g.fillStyle = lg(g, 28, 0, 36, 0, '#9aa1a8', '#4a4e53'); g.fillRect(28, -50, 8, 92); g.lineWidth = 2; g.strokeStyle = OUT; g.strokeRect(28, -50, 8, 92);
    box(g, 6, -74, 52, 30, '#d09a30', { r: 4 });
    g.fillStyle = '#1b1b1d'; g.beginPath(); g.roundRect(12, -68, 40, 18, 3); g.fill();
    g.fillStyle = '#f0c040'; for (let i = 0; i < 3; i++) g.fillRect(17 + i * 11, -63, 7, 8);
    disc(g, 32, -80, 6, '#e04a30', { lw: 1.5 });
  });
  make('rail-signal', 1, 1, { top: 1, shadow: false }, g => {
    g.save(); g.filter = 'blur(3px)'; g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(34, 34, 34, 7); g.restore();
    box(g, 18, 36, 28, 18, '#4c5056', { r: 4 });
    g.fillStyle = lg(g, 28, 0, 36, 0, '#9aa1a8', '#4a4e53'); g.fillRect(29, -34, 6, 76); g.lineWidth = 2; g.strokeStyle = OUT; g.strokeRect(29, -34, 6, 76);
    box(g, 20, -60, 24, 34, '#2b2d30', { r: 5 });
    for (const y of [-51, -36]) { g.beginPath(); g.arc(32, y, 6, 0, TAU); g.fillStyle = '#121214'; g.fill(); }
  });
  // locomotive and wagon, top-down, facing +x
  raw('locomotive', 120, 60, g => {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.roundRect(8, 10, 108, 46, 10); g.fill();
    for (const x of [16, 36, 76, 96]) { g.fillStyle = '#1e1f21'; g.fillRect(x, 6, 12, 48); }
    g.beginPath(); g.roundRect(4, 8, 108, 44, 10); g.fillStyle = lg(g, 0, 8, 0, 52, '#e07a3a', '#b4511c', '#7a3210'); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    g.beginPath(); g.moveTo(112, 14); g.lineTo(118, 22); g.lineTo(118, 38); g.lineTo(112, 46); g.closePath(); g.fillStyle = '#3a3c40'; g.fill(); g.stroke();
    box(g, 14, 14, 54, 32, '#6b7178', { r: 5 }); vent(g, 20, 19, 42, 22);
    box(g, 74, 12, 32, 36, '#2e3236', { r: 5 });
    g.fillStyle = 'rgba(150,210,240,0.6)'; g.fillRect(96, 16, 6, 28);
    g.fillStyle = '#f0c040'; g.fillRect(4, 26, 4, 8);
    disc(g, 114, 30, 3, '#fff6c0', { lw: 1 });
  }, 0.08);
  raw('cargo-wagon', 120, 60, g => {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.roundRect(8, 10, 108, 46, 6); g.fill();
    for (const x of [16, 36, 76, 96]) { g.fillStyle = '#1e1f21'; g.fillRect(x, 6, 12, 48); }
    g.beginPath(); g.roundRect(6, 8, 108, 44, 5); g.fillStyle = lg(g, 0, 8, 0, 52, '#9aa3ab', '#6b7480', '#454c54'); g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; for (let x = 18; x < 112; x += 12) line(g, x, 10, x, 50);
    box(g, 44, 14, 32, 32, '#7d868f', { r: 3 }); rivets(g, [[12, 14], [108, 14], [12, 46], [108, 46]]);
  }, 0.1);
  ICON.locomotive = (() => { const c = cv(64, 64), g = c.getContext('2d'); g.translate(32, 32); g.rotate(-0.5); g.drawImage(SPR.locomotive.c, -30, -15, 60, 30); return c; })();
  ICON['cargo-wagon'] = (() => { const c = cv(64, 64), g = c.getContext('2d'); g.translate(32, 32); g.rotate(-0.5); g.drawImage(SPR['cargo-wagon'].c, -30, -15, 60, 30); return c; })();
}

// =========================================================== robots
function genRobots() {
  make('roboport', 4, 4, { top: 0.6 }, (g, W, H) => {
    block(g, 6, 6, W - 12, H - 12, 18, '#4f5a64');
    for (const [x, y] of [[14, -8], [196, -8], [14, 178], [196, 178]]) { box(g, x, y, 46, 46, '#d09a30', { r: 6 }); vent(g, x + 8, y + 8, 30, 30); }
    g.beginPath(); g.arc(128, 116, 72, 0, TAU); g.fillStyle = '#3a4048'; g.fill(); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
    g.beginPath(); g.arc(128, 116, 60, 0, TAU); g.fillStyle = rg(g, 110, 96, 6, 80, '#7a8590', '#454e57', '#2a3036'); g.fill(); g.lineWidth = 2; g.stroke();
    g.strokeStyle = '#f0c040'; g.lineWidth = 4; g.setLineDash([10, 8]); g.beginPath(); g.arc(128, 116, 46, 0, TAU); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#f0c040'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('H', 128, 128);
    tube(g, [[200, 60], [200, -26]], 8, '#8d949b'); disc(g, 200, -32, 9, '#3f86c0');
    rivets(g, [[70, 80], [186, 80], [70, 160], [186, 160]]);
  });
  const chestTint = (nm, col, sym) => make(nm, 1, 1, { top: 0.2, sh: [5, 5] }, g => {
    block(g, 7, 7, 50, 50, 9, '#8d939a', { r: 4 });
    box(g, 11, 2, 42, 40, col, { r: 4 });
    g.fillStyle = 'rgba(20,20,22,0.85)'; sym(g);
    cornerRivets(g, 7, -2, 50, 50, 5);
  });
  chestTint('storage-chest', '#c8a43a', g => { g.fillRect(24, 14, 16, 16); });
  chestTint('provider-chest', '#c0503c', g => { g.beginPath(); g.moveTo(32, 10); g.lineTo(43, 24); g.lineTo(36, 24); g.lineTo(36, 34); g.lineTo(28, 34); g.lineTo(28, 24); g.lineTo(21, 24); g.closePath(); g.fill(); });
  chestTint('requester-chest', '#3f86c0', g => { g.beginPath(); g.moveTo(32, 34); g.lineTo(43, 20); g.lineTo(36, 20); g.lineTo(36, 10); g.lineTo(28, 10); g.lineTo(28, 20); g.lineTo(21, 20); g.closePath(); g.fill(); });
  for (const [k, col] of [['construction', '#e0a030'], ['logistic', '#c0503c']]) {
    raw('bot_' + k, 40, 40, g => {
      g.strokeStyle = OUT; g.lineWidth = 3; line(g, 8, 8, 32, 32); line(g, 32, 8, 8, 32);
      for (const [x, y] of [[8, 8], [32, 8], [8, 32], [32, 32]]) { g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fillStyle = 'rgba(200,210,220,0.35)'; g.fill(); g.lineWidth = 1.5; g.stroke(); }
      disc(g, 20, 20, 9, col); disc(g, 20, 20, 3.5, '#2c2d30', { lw: 1 });
    }, 0);
    ICON[k + '-robot'] = (() => { const c = cv(64, 64); c.getContext('2d').drawImage(SPR['bot_' + k].c, 4, 4, 56, 56); return c; })();
  }
}

export function generateSprites() {
  genBelts(); genBuildings(); genFluids(); genRails(); genRobots(); genNature(); genCreatures(); genIcons();
  for (const id in ITEMS) if (!ICON[id]) console.warn('missing icon', id);
}
