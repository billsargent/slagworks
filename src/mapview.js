// Full-screen map (M). Pans with WASD / left stick / mouse drag, zooms with wheel / triggers.
import { G, UI } from './state.js';
import { PROTO } from './data.js';
import { ICON } from './sprites.js';
import { I } from './input.js';
import { CH, clamp } from './util.js';
import { peekChunk } from './world.js';

const TILE_COL = ['#16324a', '#2c5c6c', '#b3a274', '#55682e', '#77603f', '#9b774f'];
const ORE_COL = [null, '#8fb0c8', '#d98548', '#1c1c20', '#c9c0ae', '#7a4fb0'];
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const TC = TILE_COL.map(rgb), OC = ORE_COL.map(c => c && rgb(c));
export function entColor(e) {
  switch (e.type) {
    case 'tree': return '#2c4a22';
    case 'nest': return '#d03060';
    case 'belt': case 'ubelt': case 'splitter': return '#d8b040';
    case 'pole': return '#70c8ff';
    case 'pipe': case 'pipe-ug': case 'tank': return '#5a8ab8';
    case 'rail': return '#9a8f84';
    case 'wall': return '#cfc8b8';
    case 'turret': return '#e07040';
    default: return '#c8ccd2';
  }
}

let cv, ctx, drag = null;
export function mapOpen() { return !!UI.map; }
export function openMap() {
  if (!cv) { cv = document.getElementById('mapview'); ctx = cv.getContext('2d'); }
  UI.map = { x: G.player.x, y: G.player.y, z: 5 };
  cv.classList.remove('hidden');
}
export function closeMap() { UI.map = null; if (cv) cv.classList.add('hidden'); drag = null; }

function chunkImage(c, now) {
  if (c.mapImg && now - c.mapT < 2500) return c.mapImg;
  if (!c.mapImg) { c.mapImg = document.createElement('canvas'); c.mapImg.width = c.mapImg.height = CH; }
  const g = c.mapImg.getContext('2d'), im = g.createImageData(CH, CH), d = im.data;
  for (let i = 0; i < 256; i++) {
    const r = c.res[i], col = r ? OC[r] : TC[c.tiles[i]], k = (((i & 15) + (i >> 4)) & 1) ? 1 : 0.95;
    d[i * 4] = col[0] * k; d[i * 4 + 1] = col[1] * k; d[i * 4 + 2] = col[2] * k; d[i * 4 + 3] = 255;
  }
  for (const e of c.ents) {
    const p = PROTO[e.name], col = rgb(entColor(e)), w = e.type === 'splitter' && (e.dir & 1) ? p.h : p.w, h = e.type === 'splitter' && (e.dir & 1) ? p.w : p.h;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const lx = e.x + i - c.cx * CH, ly = e.y + j - c.cy * CH;
      if (lx < 0 || ly < 0 || lx >= CH || ly >= CH) continue;
      const o = (ly * CH + lx) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2];
    }
  }
  g.putImageData(im, 0, 0); c.mapT = now;
  return c.mapImg;
}

export function mapFrame(dt) {
  const m = UI.map; if (!m) return;
  const W = cv.width = Math.floor(innerWidth * Math.min(devicePixelRatio || 1, 2)), H = cv.height = Math.floor(innerHeight * Math.min(devicePixelRatio || 1, 2));
  const k = W / innerWidth;
  // pan + zoom input
  const sp = 900 * dt / m.z;
  m.x += I.moveX * sp; m.y += I.moveY * sp;
  if (I.wheel && !I.overUI) {
    const wx = m.x + (I.mx * k - W / 2) / (m.z * k), wy = m.y + (I.my * k - H / 2) / (m.z * k);
    m.z = clamp(m.z * Math.pow(1.18, -I.wheel), 0.6, 24);
    m.x = wx - (I.mx * k - W / 2) / (m.z * k); m.y = wy - (I.my * k - H / 2) / (m.z * k);
  }
  if (I.lmb && !I.overUI) { if (!drag) drag = [I.mx, I.my]; else { m.x -= (I.mx - drag[0]) / m.z; m.y -= (I.my - drag[1]) / m.z; drag = [I.mx, I.my]; } } else drag = null;

  const z = m.z * k, ox = W / 2 - m.x * z, oy = H / 2 - m.y * z;
  ctx.fillStyle = '#07090b'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const now = performance.now();
  const cx0 = Math.floor((m.x - W / 2 / z) / CH), cx1 = Math.floor((m.x + W / 2 / z) / CH), cy0 = Math.floor((m.y - H / 2 / z) / CH), cy1 = Math.floor((m.y + H / 2 / z) / CH);
  let budget = 60;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = peekChunk(cx, cy); if (!c) continue;
    if ((!c.mapImg || now - c.mapT > 2500) && budget-- <= 0 && c.mapImg) { ctx.drawImage(c.mapImg, ox + cx * CH * z, oy + cy * CH * z, CH * z + 0.5, CH * z + 0.5); continue; }
    ctx.drawImage(chunkImage(c, now), ox + cx * CH * z, oy + cy * CH * z, CH * z + 0.5, CH * z + 0.5);
  }
  if (z >= 7) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let cx = cx0; cx <= cx1 + 1; cx++) { const x = Math.round(ox + cx * CH * z) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let cy = cy0; cy <= cy1 + 1; cy++) { const y = Math.round(oy + cy * CH * z) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }
  // building icons when zoomed in
  ctx.imageSmoothingEnabled = true;
  if (z >= 9) for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = peekChunk(cx, cy); if (!c) continue;
    for (const e of c.ents) { const p = PROTO[e.name]; if (p.w < 2 || e.natural || !ICON[e.name]) continue; const s = Math.min(p.w, p.h) * z * 0.8; ctx.drawImage(ICON[e.name], ox + (e.x + p.w / 2) * z - s / 2, oy + (e.y + p.h / 2) * z - s / 2, s, s); }
  }
  // trains
  for (const t of G.trains || []) for (const car of t.cars) { ctx.fillStyle = car.loco ? '#ff9a30' : '#f0d070'; ctx.fillRect(ox + car.x * z - Math.max(2, z * 0.6), oy + car.y * z - Math.max(2, z * 0.6), Math.max(4, z * 1.2), Math.max(4, z * 1.2)); }
  // enemies
  for (const n of G.nests) { ctx.strokeStyle = '#ff4070'; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(ox + (n.x + 1.5) * z, oy + (n.y + 1.5) * z, Math.max(5 * k, z * 2), 0, 7); ctx.stroke(); }
  ctx.fillStyle = '#ff3030';
  for (const u of G.units) ctx.fillRect(ox + u.x * z - 2 * k, oy + u.y * z - 2 * k, 4 * k, 4 * k);
  // player
  const pl = G.player, px = ox + pl.x * z, py = oy + pl.y * z, r = 9 * k;
  ctx.save(); ctx.translate(px, py); ctx.rotate(pl.ang);
  ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, -r * 0.7); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.7, r * 0.7); ctx.closePath();
  ctx.fillStyle = '#ffd24a'; ctx.fill(); ctx.lineWidth = 2 * k; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.restore();
  // help
  ctx.font = `${13 * k}px "Segoe UI",sans-serif`; ctx.fillStyle = 'rgba(230,226,216,0.75)'; ctx.textAlign = 'center';
  ctx.fillText('MAP  ·  WASD / left stick or drag to pan  ·  wheel / triggers to zoom  ·  M or Esc to close', W / 2, H - 22 * k);
}
