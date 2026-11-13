// Paints a 16x16-tile chunk of ground into a 512x512 canvas, per pixel.
import { elevAt, moistAt, WATER_E, SAND_E } from './world.js';
import { hash2, sstep, clamp, rng, CH } from './util.js';
import { G } from './state.js';

const N1 = new Float32Array(65536), N2 = new Float32Array(65536);
function tn(x, y, cell, seed) {
  const per = 256 / cell, fx = x / cell, fy = y / cell, xi = Math.floor(fx), yi = Math.floor(fy), xf = fx - xi, yf = fy - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => hash2(a % per, b % per, seed);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
  N1[(y << 8) | x] = tn(x, y, 32, 11) * 0.5 + tn(x, y, 16, 12) * 0.3 + tn(x, y, 8, 13) * 0.2;
  N2[(y << 8) | x] = hash2(x, y, 31) * 0.55 + tn(x, y, 4, 14) * 0.45;
}

const GR = 8, GN = 512 / GR + 1;
const ev = new Float32Array(GN * GN), mv = new Float32Array(GN * GN);

export function paintChunk(c) {
  const N = 512, can = document.createElement('canvas'); can.width = can.height = N;
  const g = can.getContext('2d'), im = g.createImageData(N, N), d = im.data;
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const wx = c.cx * CH + i * GR / 32, wy = c.cy * CH + j * GR / 32;
    ev[j * GN + i] = elevAt(wx, wy); mv[j * GN + i] = moistAt(wx, wy);
  }
  const bx = c.cx * 512, by = c.cy * 512;
  let p = 0;
  for (let y = 0; y < N; y++) {
    const gy = (y / GR) | 0, fy = (y % GR) / GR, Y = ((by + y) & 255) << 8;
    for (let x = 0; x < N; x++, p += 4) {
      const gx = (x / GR) | 0, fx = (x % GR) / GR, i0 = gy * GN + gx;
      const e0 = ev[i0] + (ev[i0 + 1] - ev[i0]) * fx, e1 = ev[i0 + GN] + (ev[i0 + GN + 1] - ev[i0 + GN]) * fx;
      const m0 = mv[i0] + (mv[i0 + 1] - mv[i0]) * fx, m1 = mv[i0 + GN] + (mv[i0 + GN + 1] - mv[i0 + GN]) * fx;
      const X = (bx + x) & 255, n1 = N1[Y | X], n2 = N2[Y | X];
      const e = e0 + (e1 - e0) * fy + (n1 - 0.5) * 0.014, m = m0 + (m1 - m0) * fy + (n1 - 0.5) * 0.05;
      let r, gg, b;
      if (e < WATER_E) {
        const dp = clamp((WATER_E - e) / 0.06, 0, 1), k = Math.sqrt(dp);
        r = 64 + (22 - 64) * k; gg = 118 + (52 - 118) * k; b = 124 + (78 - 124) * k;
        const br = 0.94 + n1 * 0.12 + (n2 - 0.5) * 0.05;
        r *= br; gg *= br; b *= br;
        if (dp < 0.1) { const f = (1 - dp / 0.1) * 0.35; r += (200 - r) * f; gg += (215 - gg) * f; b += (205 - b) * f; }
      } else {
        const gw = sstep(0.47, 0.53, m), dw = 1 - sstep(0.39, 0.45, m), tw = 1 - gw - dw;
        r = 84 * gw + 122 * tw + 166 * dw; gg = 106 * gw + 97 * tw + 126 * dw; b = 50 * gw + 66 * tw + 84 * dw;
        const sw = 1 - sstep(WATER_E, SAND_E + 0.012, e);
        r += (194 - r) * sw; gg += (174 - gg) * sw; b += (128 - b) * sw;
        const br = 0.80 + n1 * 0.34 + (n2 - 0.5) * 0.13;
        r *= br; gg *= br; b *= br;
      }
      d[p] = r; d[p + 1] = gg; d[p + 2] = b; d[p + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  // decals
  const R = rng(Math.imul(c.cx, 7349) ^ Math.imul(c.cy, 9151) ^ G.seed);
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const t = c.tiles[j * CH + i], px = i * 32, py = j * 32;
    if (t === 3) {
      const n = (R() * 4) | 0;
      for (let k = 0; k < n; k++) {
        const x = px + 3 + R() * 26, y = py + 6 + R() * 24, lt = R() > 0.5;
        g.strokeStyle = lt ? 'rgba(150,172,84,0.55)' : 'rgba(44,62,26,0.5)'; g.lineWidth = 1;
        g.beginPath(); for (let q = -1; q <= 1; q++) { g.moveTo(x + q * 1.5, y); g.lineTo(x + q * 3, y - 3 - R() * 3); } g.stroke();
      }
      if (R() < 0.035) { const x = px + 6 + R() * 20, y = py + 6 + R() * 20; g.fillStyle = R() < 0.5 ? '#e8d870' : '#e6e2d6'; for (let q = 0; q < 3; q++) g.fillRect(x + R() * 6, y + R() * 6, 1.6, 1.6); }
    } else if (t === 4 || t === 5 || t === 2) {
      if (R() < 0.3) {
        const x = px + 4 + R() * 24, y = py + 4 + R() * 24, s = 1 + R() * 2.2;
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(x + 0.8, y + 0.8, s, s * 0.75, 0, 0, 7); g.fill();
        g.fillStyle = t === 2 ? '#d8ccaa' : '#a89a86'; g.beginPath(); g.ellipse(x, y, s, s * 0.75, 0, 0, 7); g.fill();
      }
      if (t === 5 && R() < 0.035) { const x = px + 4 + R() * 20, y = py + 4 + R() * 20; g.strokeStyle = 'rgba(70,46,26,0.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 5, y + 3); g.lineTo(x + 4, y + 9); g.moveTo(x + 5, y + 3); g.lineTo(x + 11, y + 2); g.stroke(); }
    }
  }
  c.canvas = can;
}
