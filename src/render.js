import { G, UI, daylight } from './state.js';
import { PROTO, ITEMS } from './data.js';
import { SPR, ICON, BELT, ORE, PIPE } from './sprites.js';
import { fluidConns } from './fluids.js';
import { RAIL } from './sprites.js';
import { CARLEN, signalState } from './trains.js';
import { FLUID_COL } from './data.js';
import { TILE, CH, DX, DY, key, clamp, hash2 } from './util.js';
import { getChunk, peekChunk, dims } from './world.js';
import { paintChunk } from './terrain.js';
import { treeGrowth } from './sim.js';

export const cam = { x: 0, y: 0, zoom: 1.5 };
let cvs, ctx, lc, lctx, W = 1, H = 1, dpr = 1, frame = 0;
const T = TILE, HP = Math.PI / 2;

export function initRender(canvas) {
  cvs = canvas; ctx = cvs.getContext('2d', { alpha: false });
  lc = document.createElement('canvas'); lctx = lc.getContext('2d');
  const rs = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cvs.width = Math.floor(innerWidth * dpr); H = cvs.height = Math.floor(innerHeight * dpr);
    lc.width = Math.ceil(W / 2); lc.height = Math.ceil(H / 2);
  };
  addEventListener('resize', rs); rs();
}
export function s2w(sx, sy) { const z = cam.zoom * dpr * T; return [(sx * dpr - W / 2) / z + cam.x, (sy * dpr - H / 2) / z + cam.y]; }

function dspr(s, x, y) { ctx.drawImage(s.c, x * T - s.ox / 2, y * T - s.oy / 2, s.c.width / 2, s.c.height / 2); }
function rot(s, cx, cy, ang, sc = 1) {
  ctx.save(); ctx.translate(cx * T, cy * T); ctx.rotate(ang);
  ctx.drawImage(s.c, -s.c.width / 4 * sc, -s.c.height / 4 * sc, s.c.width / 2 * sc, s.c.height / 2 * sc);
  ctx.restore();
}
function icon(id, cx, cy, size) { const c = ICON[id]; if (c) ctx.drawImage(c, cx * T - size / 2, cy * T - size / 2, size, size); }

function beltSprite(e) {
  const b = BELT[e.name] || BELT.belt, f = (G.tick * (e.speed > 0.04 ? 2 : 1)) & 7;
  return (e.curve ? (e.curve < 0 ? b.l : b.r) : b.s)[e.dir][f];
}
function itemPos(bl, li, p) {
  const d = bl.dir;
  if (bl.curve) {
    const inner = bl.curve < 0 ? li === 0 : li === 1, r = (32 + (inner ? -14 : 14)) / 64, a = HP * (1 - p);
    let u = r * Math.cos(a), v = r * Math.sin(a);
    if (bl.curve > 0) u = 1 - u;
    for (let i = 0; i < d; i++) { const t = u; u = 1 - v; v = t; }
    return [bl.x + u, bl.y + v];
  }
  const l = (d + 3) & 3, s = li === 0 ? 0.22 : -0.22;
  return [bl.x + 0.5 + DX[d] * (p - 0.5) + DX[l] * s, bl.y + 0.5 + DY[d] * (p - 0.5) + DY[l] * s];
}
function drawItems(bl) {
  for (let li = 0; li < 2; li++) {
    const lane = bl.lanes[li];
    for (let i = 0; i < lane.length; i++) {
      const it = lane[i], q = itemPos(bl, li, it.p), c = ICON[it.id];
      ctx.drawImage(c, q[0] * T - 6.5, q[1] * T - 6.5, 13, 13);
    }
  }
}

const lights = [];
function light(x, y, r, a = 1) { lights.push(x, y, r, a); }

function warnIcon(e, cx, cy) {
  if (!e.warn || !UI.alt || ((G.tick >> 4) & 1)) return;
  const s = SPR['warn_' + e.warn]; if (s) rot(s, cx, cy, 0, 0.8);
}

function drawEnt(e) {
  const p = PROTO[e.name], x = e.x, y = e.y, s = SPR[e.name];
  switch (e.type) {
    case 'tree': {
      const g = treeGrowth(e);
      if (e.decon) { ctx.strokeStyle = '#ff4a30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x * T + 8, y * T + 8); ctx.lineTo(x * T + 24, y * T + 24); ctx.moveTo(x * T + 24, y * T + 8); ctx.lineTo(x * T + 8, y * T + 24); ctx.stroke(); }
      if (g >= 1) { dspr(SPR['tree' + (e.v || 0)], x, y); return; }
      ctx.save(); ctx.translate((x + 0.5) * T, (y + 0.9) * T); ctx.scale(g, g); ctx.translate(-(x + 0.5) * T, -(y + 0.9) * T);
      dspr(SPR['tree' + (e.v || 0)], x, y); ctx.restore(); return;
    }
    case 'arm': {
      dspr(s, x, y);
      const a = (e.dir - 1) * HP + Math.PI + Math.PI * e.prog, h = SPR['armh_' + e.name], cx = x + 0.5, cy = y + 0.5;
      ctx.save(); ctx.translate(cx * T, cy * T); ctx.rotate(a + HP);
      ctx.drawImage(h.c, -7, -(h.c.height - 7) / 2, 14, h.c.height / 2); ctx.restore();
      if (e.held) icon(e.held, cx + Math.cos(a) * p.reach, cy + Math.sin(a) * p.reach, 12);
      warnIcon(e, cx, cy);
      break;
    }
    case 'drill': {
      dspr(s, x, y);
      const big = p.w === 3;
      rot(SPR[big ? 'bit_b' : 'bit_s'], x + p.w / 2, y + (big ? 1.28 : 0.81), e.anim * 0.12);
      rot(SPR.chute, x + p.w / 2 + DX[e.dir] * (p.w / 2 - 0.2), y + p.h / 2 + DY[e.dir] * (p.h / 2 - 0.2), (e.dir - 1) * HP, 0.75);
      warnIcon(e, x + p.w / 2, y + p.h / 2);
      break;
    }
    case 'furnace': {
      dspr(s, x, y);
      if (e.working) {
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(G.tick * 0.35 + e.id); dspr(SPR[e.name + '_on'], x, y); ctx.globalAlpha = 1;
        light(x + p.w / 2, y + p.h / 2 + 0.4, 3.5, 0.6);
      }
      warnIcon(e, x + p.w / 2, y + p.h / 2);
      break;
    }
    case 'assembler': {
      dspr(s, x, y);
      if (p.conns) drawStubs(p, x, y, e.dir);
      if (e.name === 'chem-plant') {
        if (e.working) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.tick * 0.2 + e.id); dspr(SPR['chem-plant_on'], x, y); ctx.globalAlpha = 1; light(x + 2.1, y + 1.8, 3, 0.5); }
        if (e.recipe && UI.alt) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc((x + 1.5) * T, (y + 1.5) * T, 13, 0, 7); ctx.fill(); icon(e.recipe, x + 1.5, y + 1.5, 20); }
      } else if (e.name === 'refinery') {
        if (e.working) { ctx.globalAlpha = 0.7 + 0.3 * Math.sin(G.tick * 0.5); dspr(SPR.refinery_on, x, y); ctx.globalAlpha = 1; light(x + 3.3, y - 0.5, 4, 0.6); }
        if (e.recipe && UI.alt) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc((x + 2) * T, (y + 2.4) * T, 13, 0, 7); ctx.fill(); icon(e.recipe, x + 2, y + 2.4, 20); }
      } else {
        rot(SPR.gear_big, x + 1.5, y + 1.25, e.anim * 0.06, 0.95);
        if (e.recipe && UI.alt) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc((x + 1.5) * T, (y + 1.25) * T, 13, 0, 7); ctx.fill(); icon(e.recipe, x + 1.5, y + 1.25, 20); }
      }
      warnIcon(e, x + p.w / 2, y + p.h - 0.7);
      break;
    }
    case 'lab':
      dspr(s, x, y);
      if (e.working) { ctx.globalAlpha = 0.45 + 0.3 * Math.sin(G.tick * 0.12 + e.id); dspr(SPR.lab_on, x, y); ctx.globalAlpha = 1; light(x + 1.5, y + 1.3, 4, 0.55); }
      warnIcon(e, x + 1.5, y + 1.5);
      break;
    case 'generator':
      dspr(s, x, y); rot(SPR.flywheel, x + 2.297, y + 1.06, e.anim * 0.2);
      warnIcon(e, x + 1.5, y + 1.5);
      break;
    case 'accu': {
      dspr(s, x, y);
      const f = clamp(e.charge / p.cap, 0, 1);
      ctx.fillStyle = f > 0.25 ? '#6ee06a' : '#e0a030'; ctx.fillRect(x * T + 15, y * T + 51, 34 * f, 3);
      break;
    }
    case 'boiler':
      dspr(SPR[e.dir & 1 ? 'boiler_v' : 'boiler_h'], x, y); drawStubs(p, x, y, e.dir);
      if (e.working) { ctx.globalAlpha = 0.75 + 0.25 * Math.sin(G.tick * 0.3 + e.id); dspr(SPR.boiler_on, x, y); ctx.globalAlpha = 1; light(x + 1.5, y + 2.4, 3.5, 0.6); }
      warnIcon(e, x + 1.5, y + 1.5);
      break;
    case 'engine': {
      dspr(SPR[e.dir & 1 ? 'steam-engine_h' : 'steam-engine_v'], x, y); drawStubs(p, x, y, e.dir);
      const v = !(e.dir & 1); rot(SPR.flywheel, x + (v ? 2.34 : 1.5), y + (v ? 1.34 : 0.5), e.anim * 0.15, 0.6);
      if (e.working && (G.tick + e.id) % 30 === 0) fx({ k: 'smoke', x: x + 1.5, y: y + 0.4, vx: 0.003, vy: -0.01, life: 50, s: 0.3 });
      warnIcon(e, x + 1.5, y + 1.5);
      break;
    }
    case 'offshore': case 'tank': dspr(s, x, y); drawStubs(p, x, y, e.dir); break;
    case 'pumpjack':
      dspr(s, x, y); drawStubs(p, x, y, e.dir); rot(SPR.pump_beam, x + 1.5, y + 0.78, Math.sin(e.anim * 0.08) * 0.22);
      warnIcon(e, x + 1.5, y + 1.6);
      break;
    case 'turret': dspr(s, x, y); rot(SPR.turret_gun, x + 1, y + 0.94, e.ang); warnIcon(e, x + 1, y + 1); break;
    case 'lamp':
      dspr(s, x, y);
      if (e.on) { dspr(SPR.lamp_on, x, y); light(x + 0.5, y + 0.3, 7, 1); }
      break;
    case 'silo': {
      dspr(s, x, y);
      const L = G.launch;
      if (e.parts > 0 || (L && L.id === e.id)) {
        const t = L && L.id === e.id ? L.t : 0, rise = t > 60 ? Math.pow((t - 60) / 60, 2.2) * 6 : 0, r = SPR.rocket;
        const built = L && L.id === e.id ? 1 : e.parts / p.need;
        const hgt = r.c.height / 2, cx = (x + 2.5) * T, base = (y + 2.9 - rise) * T;
        ctx.save(); ctx.beginPath(); ctx.rect(cx - 30, base - hgt * built, 60, hgt * built + 2); ctx.clip();
        ctx.drawImage(r.c, cx - r.c.width / 4, base - hgt, r.c.width / 2, hgt); ctx.restore();
        if (t > 40) { rot(SPR.boom, x + 2.5, y + 3.1 - rise, 0, 0.8 + Math.random() * 0.3); light(x + 2.5, y + 3 - rise, 9, 1); }
      }
      break;
    }
    case 'nest': dspr(s, x, y); break;
    case 'roboport': dspr(s, x, y); light(x + 3.1, y - 0.6, 3, 0.7); light(x + 2, y + 1.8, 3.5, 0.5); break;
    case 'signal': {
      dspr(s, x, y);
      rot(SPR.chute, x + 0.5, y + 0.72, (e.dir - 1) * HP, 0.45);
      const st = signalState(e), col = st === 'red' ? '#ff3a28' : st === 'green' ? '#4cff5a' : '#ffb020';
      const ly = st === 'green' ? y - 0.56 : y - 0.79;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc((x + 0.5) * T, ly * T, 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc((x + 0.5) * T - 0.8, ly * T - 0.8, 0.9, 0, 7); ctx.fill();
      light(x + 0.5, ly, 1.6, 0.8);
      if (!e.rail && UI.alt && (G.tick >> 4) & 1) rot(SPR.warn_fluid, x + 0.5, y + 0.3, 0, 0.5);
      break;
    }
    case 'stop':
      dspr(s, x, y); light(x + 0.5, y - 0.9, 3, 0.6);
      if (UI.alt && e.stopName) { ctx.font = '600 6px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(e.stopName, (x + 0.5) * T, (y - 1.55) * T); ctx.fillStyle = '#ffd24a'; ctx.fillText(e.stopName, (x + 0.5) * T, (y - 1.55) * T); }
      break;
    default: dspr(s, x, y);
  }
  if (e.decon) { const [w, h] = dims(p, e.dir), cx = (x + w / 2) * T, cy = (y + h / 2) * T, r = Math.min(w, h) * 8; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); ctx.strokeStyle = '#ff4a30'; ctx.lineWidth = 2.5; ctx.stroke(); }
  if (e.hp < p.hp && e.type !== 'tree') {
    const w = p.w * T * 0.7, f = clamp(e.hp / p.hp, 0, 1), bx = (x + p.w / 2) * T - w / 2, by = (y + p.h) * T - 3;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 0.5, by - 0.5, w + 1, 3);
    ctx.fillStyle = f > 0.5 ? '#6ee06a' : f > 0.25 ? '#e0c030' : '#e04a30'; ctx.fillRect(bx, by, w * f, 2);
  }
}

function drawPlayer() {
  const pl = G.player;
  if (pl.hp <= 0) return;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(pl.x * T + 2, pl.y * T + 3, 9, 6, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(pl.x * T, pl.y * T); ctx.rotate(pl.ang);
  const sw = pl.moving ? Math.sin(pl.walk) * 5 : 0;
  ctx.fillStyle = '#2c2a28';
  ctx.beginPath(); ctx.roundRect(-4 + sw, -8, 9, 5, 2); ctx.roundRect(-4 - sw, 3, 9, 5, 2); ctx.fill();
  ctx.drawImage(SPR.player.c, -13, -13, 26, 26);
  ctx.restore();
  light(pl.x, pl.y, 5.5, 0.85);
}
function drawCar(c, t) {
  const s = SPR[c.loco ? 'locomotive' : 'cargo-wagon'];
  ctx.save(); ctx.translate(c.x * T + 3, c.y * T + 4); ctx.rotate(c.ang); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-28, -13, 56, 26); ctx.restore();
  rot(s, c.x, c.y, c.ang, 0.95);
  if (c.loco) { light(c.x + Math.cos(c.ang) * 1.3, c.y + Math.sin(c.ang) * 1.3, 4, 0.8); if (t.noFuel && UI.alt && (G.tick >> 4) & 1) rot(SPR.warn_fuel, c.x, c.y, 0, 0.7); }
}
function drawUnit(u) {
  const s = SPR[(u.spit ? 'spitter' : u.big ? 'crawler_big' : 'crawler') + ((u.t >> 3) & 1)], sc = u.big ? 1.25 : u.spit ? 0.95 : 0.8;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(u.x * T + 2, u.y * T + 3, 11 * sc, 7 * sc, 0, 0, 7); ctx.fill();
  rot(s, u.x, u.y, u.ang, sc);
  if (u.hp < u.max) { const w = 16; ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(u.x * T - w / 2, u.y * T - 14 * sc, w, 2.5); ctx.fillStyle = '#e04a30'; ctx.fillRect(u.x * T - w / 2, u.y * T - 14 * sc, w * u.hp / u.max, 2); }
}

function wirePos(e) { return e.name === 'pole' ? [e.x + 0.5, e.y - 1.5] : [e.x + 1, e.y - 2.42]; }

// sprite of a not-yet-built entity
export function planSprite(p, x, y, dir) {
  if (p.type === 'belt') ctx.drawImage(BELT[p.id].s[dir][0], x * T, y * T, T, T);
  else if (p.type === 'ubelt') { ctx.drawImage(BELT.belt.s[dir][0], x * T, y * T, T, T); ctx.drawImage(SPR['ubelt_in' + dir].c, x * T, y * T, T, T); }
  else if (p.type === 'splitter') { const s = SPR['splitter' + dir]; ctx.drawImage(s.c, x * T, y * T, s.c.width / 2, s.c.height / 2); }
  else if (PLAN[p.type]) PLAN[p.type](p, x, y, dir);
  else if (SPR[p.id]) {
    dspr(SPR[p.id], x, y);
    if (p.type === 'arm') { const hd = SPR['armh_' + p.id]; ctx.save(); ctx.translate((x + .5) * T, (y + .5) * T); ctx.rotate((dir - 1) * HP + HP); ctx.drawImage(hd.c, -7, -(hd.c.height - 7) / 2, 14, hd.c.height / 2); ctx.restore(); }
    if (p.type === 'drill') rot(SPR.chute, x + p.w / 2 + DX[dir] * (p.w / 2 - 0.2), y + p.h / 2 + DY[dir] * (p.h / 2 - 0.2), (dir - 1) * HP, 0.75);
    if (p.conns) drawStubs(p, x, y, dir);
  } else { const [w, h] = dims(p, dir); icon(p.id, x + w / 2, y + h / 2, Math.min(w, h) * T * 0.8); }
}
export const PLAN = {};
export const HOOKS = { stubs: null, ents: {}, under: null, over: null };
function drawStubs(p, x, y, dir, mode) {
  if (p.type === 'pipe' || p.type === 'pipe-ug') return;
  for (const c of fluidConns({ name: p.id, x, y, dir, mode })) rot(SPR.stub, c.x + 0.5 + DX[c.d] * 0.47, c.y + 0.5 + DY[c.d] * 0.47, c.d * HP, 0.8);
}
function drawPipe(e) {
  ctx.drawImage(PIPE[e.mask || 0], e.x * T, e.y * T, T + 0.3, T + 0.3);
  const s = e.fseg && e.fseg.p;
  if (s && s.f && s.a > 0.5) { ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, s.a / s.cap); ctx.fillStyle = FLUID_COL[s.f]; ctx.fillRect(e.x * T + 13, e.y * T + 14.5, 6, 3); ctx.globalAlpha = 1; }
}
function pipeUgSprite(e) { return SPR['pipeug' + (e.mode === 'out' ? (e.dir + 2) & 3 : e.dir)]; }
PLAN.pipe = (p, x, y) => ctx.drawImage(PIPE[0], x * T, y * T, T, T);
PLAN['pipe-ug'] = (p, x, y, d) => ctx.drawImage(SPR['pipeug' + d].c, x * T, y * T, T, T);
PLAN.boiler = (p, x, y, d) => { dspr(SPR[d & 1 ? 'boiler_v' : 'boiler_h'], x, y); drawStubs(p, x, y, d); };
PLAN.engine = (p, x, y, d) => { dspr(SPR[d & 1 ? 'steam-engine_h' : 'steam-engine_v'], x, y); drawStubs(p, x, y, d); };   // per-type plan drawers registered by other modules
const BOX = { ok: ['rgba(90,230,110,0.22)', 'rgba(120,255,140,0.8)'], bad: ['rgba(240,60,40,0.35)', 'rgba(255,90,70,0.9)'], ghost: ['rgba(80,150,255,0.25)', 'rgba(120,180,255,0.85)'] };
function planBox(x, y, w, h, st) { const c = BOX[st]; ctx.fillStyle = c[0]; ctx.fillRect(x * T, y * T, w * T, h * T); ctx.lineWidth = 1; ctx.strokeStyle = c[1]; ctx.strokeRect(x * T + 0.5, y * T + 0.5, w * T - 1, h * T - 1); }

function drawGhost() {
  if (UI.bp) return drawBlueprint();
  const it = UI.held && ITEMS[UI.held];
  if (it && it.vehicle === 'locomotive') { ctx.globalAlpha = 0.6; rot(SPR.locomotive, UI.tx + 0.5 - DX[UI.dir] * 0.25, UI.ty + 0.5 - DY[UI.dir] * 0.25, (UI.dir - 1) * HP, 0.95); ctx.globalAlpha = 1; planBox(UI.tx, UI.ty, 1, 1, 'ok'); return; }
  if (!it || !it.place) return;
  const p = PROTO[it.place], [w, h] = dims(p, UI.dir), x = UI.gx, y = UI.gy;
  ctx.globalAlpha = 0.7; planSprite(p, x, y, UI.dir); ctx.globalAlpha = 1;
  planBox(x, y, w, h, UI.gok ? 'ok' : 'bad');
  let ar = null;
  if (p.type === 'drill' && p.area) ar = p.area; else if (p.type === 'pole') ar = p.area - p.w / 2; else if (p.type === 'turret') ar = p.range - 1;
  else if (p.type === 'roboport') ar = p.cons;
  if (ar) { ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(120,200,255,0.75)'; ctx.strokeRect((x - ar) * T, (y - ar) * T, (w + 2 * ar) * T, (h + 2 * ar) * T); ctx.setLineDash([]); }
  if (p.type === 'roboport') { const r = p.logi; ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(255,200,90,0.8)'; ctx.strokeRect((x - r) * T, (y - r) * T, (w + 2 * r) * T, (h + 2 * r) * T); ctx.setLineDash([]); }
  if (p.type === 'arm') {
    ctx.fillStyle = 'rgba(255,220,90,0.9)';
    const r = p.reach, cx = (x + .5 + DX[UI.dir] * r) * T, cy = (y + .5 + DY[UI.dir] * r) * T;
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,90,0.9)'; ctx.beginPath(); ctx.arc((x + .5 - DX[UI.dir] * r) * T, (y + .5 - DY[UI.dir] * r) * T, 3, 0, 7); ctx.stroke();
  }
}
function drawBlueprint() {
  const bp = UI.bp, st = UI.bpStates || [], gx = UI.bpx, gy = UI.bpy;
  bp.ents.forEach((t, i) => {
    const p = PROTO[t.n], [w, h] = dims(p, t.d), x = gx + t.x, y = gy + t.y;
    ctx.globalAlpha = 0.6; planSprite(p, x, y, t.d); ctx.globalAlpha = 1;
    planBox(x, y, w, h, st[i] || 'bad');
  });
  ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
  ctx.strokeRect(gx * T, gy * T, bp.w * T, bp.h * T); ctx.setLineDash([]);
}
function drawWorldGhosts(x0, y0, x1, y1) {
  for (const g of G.ghosts) {
    if (g.x > x1 + 1 || g.x < x0 - 5 || g.y > y1 + 1 || g.y < y0 - 5) continue;
    const p = PROTO[g.name], [w, h] = dims(p, g.dir);
    ctx.globalAlpha = 0.42; planSprite(p, g.x, g.y, g.dir); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(80,150,255,0.18)'; ctx.fillRect(g.x * T, g.y * T, w * T, h * T);
  }
}
function drawSelection() {
  const s = UI.sel; if (!s) return;
  const x = s.active ? s : { x0: UI.tx, y0: UI.ty, x1: UI.tx, y1: UI.ty };
  const ax = Math.min(x.x0, x.x1), ay = Math.min(x.y0, x.y1), bx = Math.max(x.x0, x.x1) + 1, by = Math.max(x.y0, x.y1) + 1;
  const col = s.mode === 'bp' ? '80,170,255' : s.mode === 'decon' ? '255,80,60' : '255,210,80';
  ctx.fillStyle = `rgba(${col},0.12)`; ctx.fillRect(ax * T, ay * T, (bx - ax) * T, (by - ay) * T);
  ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.strokeRect(ax * T, ay * T, (bx - ax) * T, (by - ay) * T); ctx.setLineDash([]);
  if (s.active) {
    const seen = new Set();
    for (let y = ay; y < by; y++) for (let x2 = ax; x2 < bx; x2++) {
      const e = G.ents.get(key(x2, y)); if (!e || seen.has(e) || (s.mode === 'bp' && e.natural) || e.type === 'nest') continue; seen.add(e);
      const [w, h] = dims(PROTO[e.name], e.dir); ctx.strokeStyle = `rgba(${col},0.9)`; ctx.strokeRect(e.x * T + 1, e.y * T + 1, w * T - 2, h * T - 2);
    }
  }
}

export function render() {
  frame++;
  const z = cam.zoom * dpr, ox = Math.round(W / 2 - cam.x * T * z), oy = Math.round(H / 2 - cam.y * T * z);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#10161c'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(z, 0, 0, z, ox, oy);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
  const hw = W / 2 / (T * z), hh = H / 2 / (T * z);
  const x0 = cam.x - hw, x1 = cam.x + hw, y0 = cam.y - hh, y1 = cam.y + hh;
  const cx0 = Math.floor(x0 / CH), cx1 = Math.floor(x1 / CH), cy0 = Math.floor(y0 / CH), cy1 = Math.floor(y1 / CH);
  lights.length = 0;

  // ---- ground
  let budget = 2;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = getChunk(cx, cy);
    if (!c.canvas) { if (budget > 0) { paintChunk(c); budget--; } else { ctx.fillStyle = '#3c4a34'; ctx.fillRect(cx * 512, cy * 512, 512, 512); continue; } }
    c.seen = frame;
    ctx.drawImage(c.canvas, cx * 512, cy * 512, 512.4, 512.4);
  }
  if (frame % 300 === 0) { let n = 0; for (const c of G.chunks.values()) if (c.canvas) n++; if (n > 260) for (const c of G.chunks.values()) if (c.canvas && frame - (c.seen || 0) > 600) c.canvas = null; }

  // ---- ore
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = peekChunk(cx, cy);
    for (let i = 0; i < 256; i++) {
      const t = c.res[i]; if (!t) continue;
      const tx = cx * CH + (i & 15), ty = cy * CH + (i >> 4), a = c.amt[i];
      const v = ((hash2(tx, ty, 3) * 4) | 0) + (a > 700 ? 8 : a > 250 ? 4 : 0);
      ctx.drawImage(ORE[t][v], tx * T - 5, ty * T - 5, 42, 42);
    }
  }

  // ---- gather entities
  const belts = [], hoods = [], list = [], pipes = [], rails = [];
  for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
    const c = peekChunk(cx, cy); if (!c) continue;
    for (const e of c.ents) {
      if (e.type === 'belt') belts.push(e);
      else if (e.type === 'pipe' || e.type === 'pipe-ug') pipes.push(e);
      else if (e.type === 'rail') rails.push(e);
      else if (e.type === 'ubelt' || e.type === 'splitter') hoods.push(e);
      else { e._sy = e.y + PROTO[e.name].h; list.push(e); }
    }
  }
  for (const e of rails) ctx.drawImage(RAIL[e.rmask || 5], e.x * T, e.y * T, T + 0.3, T + 0.3);
  for (const e of pipes) { if (e.type === 'pipe') drawPipe(e); else ctx.drawImage(pipeUgSprite(e).c, e.x * T, e.y * T, T, T); }
  for (const e of belts) ctx.drawImage(beltSprite(e), e.x * T, e.y * T, T + 0.3, T + 0.3);
  for (const e of hoods) {
    if (e.type === 'ubelt') ctx.drawImage(BELT.belt.s[e.dir][G.tick & 7], e.x * T, e.y * T, T + 0.3, T + 0.3);
    else for (const sb of e.subs) ctx.drawImage(BELT.belt.s[e.dir][G.tick & 7], sb.x * T, sb.y * T, T + 0.3, T + 0.3);
  }
  if (cam.zoom > 0.5) {
    for (const e of belts) if (e.lanes[0].length || e.lanes[1].length) drawItems(e);
    for (const e of hoods) { if (e.type === 'ubelt') drawItems(e); else { drawItems(e.subs[0]); drawItems(e.subs[1]); } }
  }
  for (const e of hoods) {
    if (e.type === 'ubelt') ctx.drawImage(SPR['ubelt_' + e.mode + e.dir].c, e.x * T, e.y * T, T, T);
    else { const s = SPR['splitter' + e.dir]; ctx.drawImage(s.c, e.x * T, e.y * T, s.c.width / 2, s.c.height / 2); }
  }

  // ---- sorted objects
  for (const u of G.units) if (u.x > x0 - 2 && u.x < x1 + 2 && u.y > y0 - 2 && u.y < y1 + 2) list.push({ type: '_u', u, _sy: u.y + 0.3, x: u.x });
  list.push({ type: '_p', _sy: G.player.y + 0.3, x: G.player.x });
  for (const t of G.trains) for (const c of t.cars) if (c.x > x0 - 3 && c.x < x1 + 3 && c.y > y0 - 3 && c.y < y1 + 3) list.push({ type: '_c', c, t, _sy: c.y + 0.4, x: c.x });
  list.sort((a, b) => a._sy - b._sy || a.x - b.x);
  for (const e of list) { if (e.type === '_u') drawUnit(e.u); else if (e.type === '_c') drawCar(e.c, e.t); else if (e.type === '_p') drawPlayer(); else drawEnt(e); }

  drawWorldGhosts(x0, y0, x1, y1);
  // ---- flying robots
  for (const b of G.bots) {
    if (b.x < x0 - 2 || b.x > x1 + 2 || b.y < y0 - 2 || b.y > y1 + 2) continue;
    const bob = Math.sin(G.tick * 0.15 + b.id) * 0.08;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(b.x * T + 10, b.y * T + 14, 6, 4, 0, 0, 7); ctx.fill();
    rot(SPR['bot_' + b.kind], b.x, b.y - 0.55 + bob, (b.ang || 0) + Math.PI / 2, 0.75);
    if (b.item) icon(b.item, b.x, b.y - 0.15 + bob, 9);
    light(b.x, b.y - 0.5, 1.5, 0.45);
  }
  // ---- wires
  ctx.lineWidth = 0.9;
  for (const [a, b] of G.wires) {
    if (a.dead || b.dead) continue;
    const p = wirePos(a), q = wirePos(b);
    if (Math.max(p[0], q[0]) < x0 - 1 || Math.min(p[0], q[0]) > x1 + 1) continue;
    const mx = (p[0] + q[0]) / 2 * T, my = (p[1] + q[1]) / 2 * T + 5 + Math.hypot(p[0] - q[0], p[1] - q[1]) * 1.3;
    ctx.beginPath(); ctx.moveTo(p[0] * T, p[1] * T); ctx.quadraticCurveTo(mx, my, q[0] * T, q[1] * T);
    ctx.strokeStyle = 'rgba(30,16,8,0.7)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = '#c9803e'; ctx.lineWidth = 0.8; ctx.stroke();
  }

  // ---- fx
  for (const f of G.fx) {
    const k = f.life / f.max;
    if (f.k === 'smoke') { ctx.globalAlpha = k * 0.6; rot(SPR.smoke, f.x, f.y, 0, f.s * (1.6 - k)); ctx.globalAlpha = 1; }
    else if (f.k === 'tracer') { ctx.strokeStyle = `rgba(255,230,150,${k})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(f.x * T, f.y * T); ctx.lineTo(f.x2 * T, f.y2 * T); ctx.stroke(); light(f.x, f.y, 3, k); }
    else if (f.k === 'boom') { ctx.globalAlpha = k; rot(SPR.boom, f.x, f.y, 0, f.s * (1.5 - k)); ctx.globalAlpha = 1; light(f.x, f.y, 6 * f.s, k); }
    else if (f.k === 'acid') { ctx.fillStyle = `rgba(150,230,60,${k * 0.55})`; ctx.beginPath(); ctx.ellipse(f.x * T, f.y * T, 14, 9, 0, 0, 7); ctx.fill(); if (k > 0.8) light(f.x, f.y, 2, 0.5); }
    else if (f.k === 'splat') { ctx.fillStyle = `rgba(110,150,40,${k * 0.7})`; ctx.beginPath(); ctx.ellipse(f.x * T, f.y * T, 9 * f.s, 6 * f.s, 0, 0, 7); ctx.fill(); }
    else if (f.k === 'text') { ctx.globalAlpha = Math.min(1, k * 2); ctx.font = '600 6px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(f.txt, f.x * T, f.y * T); ctx.fillStyle = f.col || '#fff'; ctx.fillText(f.txt, f.x * T, f.y * T); ctx.globalAlpha = 1; }
  }

  for (const p of G.proj) {
    const k = p.t / p.T, hgt = Math.sin(k * Math.PI) * 1.6;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.x * T, p.y * T, 4, 2.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#b8f050'; ctx.beginPath(); ctx.arc(p.x * T, (p.y - hgt) * T, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(200,255,120,0.4)'; ctx.beginPath(); ctx.arc(p.x * T, (p.y - hgt) * T, 6, 0, 7); ctx.fill();
    light(p.x, p.y - hgt, 2, 0.6);
  }
  // ---- hover + ghost + mining
  const hv = UI.hover;
  if (hv && !hv.dead && !(UI.held && ITEMS[UI.held].place)) {
    const [w, h] = dims(PROTO[hv.name], hv.dir), a = hv.x * T, b = hv.y * T, c = w * T, d = h * T, k = 6;
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (const [px, py, sx, sy] of [[a, b, 1, 1], [a + c, b, -1, 1], [a, b + d, 1, -1], [a + c, b + d, -1, -1]]) { ctx.moveTo(px + sx * k, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * k); }
    ctx.stroke();
  }
  drawGhost(); drawSelection();
  const pl = G.player;
  if (pl.mineP > 0) {
    const cx = (UI.tx + 0.5) * T, cy = (UI.ty + 0.5) * T;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 9, -HP, -HP + pl.mineP * Math.PI * 2); ctx.stroke();
  }

  // ---- night
  const dark = (1 - daylight()) * 0.78;
  if (dark > 0.02) {
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, lc.width, lc.height); lctx.fillStyle = `rgba(5,9,26,${dark})`; lctx.fillRect(0, 0, lc.width, lc.height);
    lctx.globalCompositeOperation = 'destination-out';
    const g = SPR.glow.c;
    for (let i = 0; i < lights.length; i += 4) {
      const r = lights[i + 2] * T * z / 2, sx = (lights[i] * T * z + ox) / 2, sy = (lights[i + 1] * T * z + oy) / 2;
      lctx.globalAlpha = lights[i + 3]; lctx.drawImage(g, sx - r, sy - r, r * 2, r * 2);
    }
    lctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lc, 0, 0, W, H);
  }
}
