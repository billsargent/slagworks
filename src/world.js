import { G, invNew } from './state.js';
import { PROTO } from './data.js';
import { shapeRail, nameStop } from './trains.js';
import { key, fbm, vnoise, hash2, DX, DY, CH } from './util.js';

export const WATER_E = 0.375, SAND_E = 0.40;
export const ORES = [null, 'iron-ore', 'copper-ore', 'coal', 'stone', 'crude-oil'];
export const ORE_NAMES = [null, 'Iron Ore', 'Copper Ore', 'Coal', 'Stone', 'Oil Seep'];

// world spacing: 1 = the original compact world; larger values stretch lakes, forests, ore fields and nests apart
const WS = () => G.ws || 1;
export function elevAt(x, y) {
  const S = WS(), R = 30 * Math.min(S, 2);
  let e = fbm(x / (56 * S), y / (56 * S), G.seed, 4);
  const d = Math.hypot(x, y);
  if (d < R) e += (1 - d / R) * 0.25;
  return e;
}
export function moistAt(x, y) { const S = WS(); return fbm(x / (80 * S) + 31.7, y / (80 * S) - 12.3, G.seed + 101, 3); }
// 0 deep water, 1 water, 2 sand, 3 grass, 4 dirt, 5 desert
export function classify(e, m) {
  if (e < 0.33) return 0; if (e < WATER_E) return 1; if (e < SAND_E) return 2;
  if (m > 0.5) return 3; if (m > 0.42) return 4; return 5;
}

const STARTER = [[1, 13, -6, 6.5], [2, -14, -7, 5.5], [3, -9, 12, 5.5], [4, 14, 12, 4.5]];
const THR = [0, 0.80, 0.815, 0.83, 0.86];
function oreAt(x, y) {
  const S = WS(), SP = Math.min(S, 1.8), SR = 1 + (S - 1) * 0.35;
  const j = (vnoise(x / 3.1, y / 3.1, G.seed + 5) - 0.5) * 3;
  for (const s of STARTER) { const r = s[3] * SR, d = Math.hypot(x - s[1] * SP, y - s[2] * SP) + j; if (d < r) return [s[0], 350 + ((r - d) * 140 | 0)]; }
  const d0 = Math.hypot(x, y);
  if (d0 > 34 * S) {
    const w = (vnoise(x / 4, y / 4, G.seed + 77) - 0.5) * 0.06;
    for (let t = 1; t <= 4; t++) {
      const v = vnoise(x / (26 * S) + t * 53.3, y / (26 * S) - t * 17.1, G.seed + t * 13) + w;
      if (v > THR[t]) return [t, (300 + ((v - THR[t]) * 22000 | 0)) * S + (d0 * 3 | 0)];
    }
  }
  const cell = 32 * S, cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  if ((cx === 1 && cy === -1) || (Math.abs(cx) + Math.abs(cy) >= 2 && hash2(cx, cy, G.seed + 900) < 0.2)) {
    const ox = cx * cell + cell / 4 + hash2(cx, cy, G.seed + 902) * cell / 2, oy = cy * cell + cell / 4 + hash2(cx, cy, G.seed + 903) * cell / 2;
    if (Math.hypot(x - ox, y - oy) < 2.6 * Math.min(S, 1.6) && hash2(x, y, G.seed + 901) < 0.45) return [5, 1000000];
  }
  return [0, 0];
}

export function peekChunk(cx, cy) { return G.chunks.get(key(cx, cy)); }
export function getChunk(cx, cy) {
  const ck = key(cx, cy);
  let c = G.chunks.get(ck);
  if (c) return c;
  c = { cx, cy, tiles: new Uint8Array(256), res: new Uint8Array(256), amt: new Uint32Array(256), ents: [], canvas: null };
  G.chunks.set(ck, c);
  const bx = cx * CH, by = cy * CH;
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const x = bx + i, y = by + j, idx = j * CH + i;
    const t = classify(elevAt(x + 0.5, y + 0.5), moistAt(x + 0.5, y + 0.5));
    c.tiles[idx] = t;
    if (t >= 2) {
      const o = oreAt(x, y);
      if (o[0]) {
        const m = G.resMod.get(key(x, y));
        const a = m === undefined ? o[1] : m;
        if (a > 0) { c.res[idx] = o[0]; c.amt[idx] = a; }
      }
    }
  }
  // nest
  if (Math.max(Math.abs(cx), Math.abs(cy)) >= 6 * WS() && hash2(cx, cy, G.seed + 500) < 0.05 / WS() && !G.removed.has(key(bx + 6, by + 6))) {
    let ok = true;
    for (let j = 6; j < 9 && ok; j++) for (let i = 6; i < 9; i++) if (c.tiles[j * CH + i] < 2 || c.res[j * CH + i] || G.ents.has(key(bx + i, by + j))) { ok = false; break; }
    if (ok) placeEntity('nest', bx + 6, by + 6, 0, true).gen = true;
  }
  // trees
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const x = bx + i, y = by + j, idx = j * CH + i, t = c.tiles[idx];
    if (t < 3 || c.res[idx]) continue;
    if (x * x + y * y < 36) continue;
    const f = fbm(x / (24 * WS()), y / (24 * WS()), G.seed + 300, 3);
    let p = f > 0.56 ? (f - 0.56) * 6 + 0.12 : 0.006;
    if (t === 5) p *= 0.25;
    const h = hash2(x, y, G.seed + 301);
    if (h < p) {
      const k = key(x, y);
      if (G.removed.has(k) || G.ents.has(k)) continue;
      const e = placeEntity('tree', x, y, 0, true);
      e.v = (hash2(x, y, G.seed + 302) * 4) | 0;
    }
  }
  return c;
}

const fd = Math.floor;
export function tileAt(x, y) { const c = getChunk(fd(x / CH), fd(y / CH)); return c.tiles[(y - c.cy * CH) * CH + (x - c.cx * CH)]; }
export function resType(x, y) { const c = getChunk(fd(x / CH), fd(y / CH)); return c.res[(y - c.cy * CH) * CH + (x - c.cx * CH)]; }
export function resAmt(x, y) { const c = getChunk(fd(x / CH), fd(y / CH)); return c.amt[(y - c.cy * CH) * CH + (x - c.cx * CH)]; }
export function setRes(x, y, a) {
  const c = getChunk(fd(x / CH), fd(y / CH)), i = (y - c.cy * CH) * CH + (x - c.cx * CH);
  c.amt[i] = Math.max(0, a); if (a <= 0) c.res[i] = 0;
  G.resMod.set(key(x, y), Math.max(0, a));
}
export function entAt(x, y) { return G.ents.get(key(x, y)); }
export function dims(p, dir) { return p.w !== p.h && (dir & 1) ? [p.h, p.w] : [p.w, p.h]; }
export function frontTile(e) {
  const p = PROTO[e.name], w = p.w, h = p.h, m = (w - 1) >> 1;
  switch (e.dir) { case 0: return [e.x + m, e.y - 1]; case 1: return [e.x + w, e.y + m]; case 2: return [e.x + m, e.y + h]; default: return [e.x - 1, e.y + m]; }
}

// ---- belt helpers
export function beltAt(x, y) {
  const e = G.ents.get(key(x, y));
  if (!e) return null;
  const t = e.type;
  if (t === 'belt' || t === 'ubelt') return e;
  if (t === 'splitter') return e.subs[(x === e.x && y === e.y) ? 0 : 1];
  return null;
}
function feeds(src, tx, ty) {
  if (!src) return false;
  if (src.type === 'ubelt' && src.mode === 'in') return false;
  return src.x + DX[src.dir] === tx && src.y + DY[src.dir] === ty;
}
export function refreshBelts(x, y) {
  G.beltVer++;
  for (let i = -1; i < 4; i++) {
    const bx = i < 0 ? x : x + DX[i], by = i < 0 ? y : y + DY[i];
    const b = G.ents.get(key(bx, by));
    if (!b || b.type !== 'belt') continue;
    const d = b.dir, l = (d + 3) & 3, r = (d + 1) & 3;
    const back = feeds(beltAt(bx - DX[d], by - DY[d]), bx, by);
    const fl = feeds(beltAt(bx + DX[l], by + DY[l]), bx, by);
    const fr = feeds(beltAt(bx + DX[r], by + DY[r]), bx, by);
    b.curve = (!back && fl !== fr) ? (fl ? -1 : 1) : 0;
  }
}

// ---- entity lifecycle
function initEnt(e, p) {
  if (p.boxes) { e.fb = {}; for (const b in p.boxes) e.fb[b] = { f: null, a: 0, cap: p.boxes[b].cap }; }
  switch (p.type) {
    case 'belt': e.lanes = [[], []]; e.curve = 0; e.speed = p.speed; break;
    case 'ubelt': e.lanes = [[], []]; e.speed = p.speed; e.mode = 'in'; e.pairK = 0; break;
    case 'splitter': {
      const w = dims(p, e.dir)[0];
      e.tog = [0, 0];
      e.subs = [0, 1].map(i => ({ type: 'sub', idx: i, x: e.x + (w === 2 ? i : 0), y: e.y + (w === 2 ? 0 : i), dir: e.dir, lanes: [[], []], speed: p.speed }));
      break;
    }
    case 'arm': e.state = 0; e.prog = 0; e.held = null; break;
    case 'chest': e.inv = invNew(p.slots); if (p.logi) e.logi = p.logi; if (p.logi === 'requester') e.req = []; break;
    case 'roboport': e.robots = { construction: 0, logistic: 0 }; break;
    case 'drill': e.fuel = null; e.energy = 0; e.prog = 0; e.out = null; e.anim = 0; break;
    case 'pumpjack': e.prog = 0; e.anim = 0; break;
    case 'pipe-ug': e.mode = 'in'; e.pairK = 0; break;
    case 'boiler': e.fuel = null; e.energy = 0; break;
    case 'engine': e.load = 0; e.anim = 0; break;
    case 'furnace': e.fuel = null; e.energy = 0; e.inp = null; e.out = null; e.cur = null; e.prog = 0; break;
    case 'assembler': e.recipe = null; e.inp = {}; e.out = {}; e.prog = 0; e.crafting = false; e.anim = 0; break;
    case 'lab': e.inp = {}; e.unit = 0; break;
    case 'generator': e.fuel = null; e.energy = 0; e.load = 0; e.anim = 0; break;
    case 'accu': e.charge = 0; break;
    case 'turret': e.ammo = 0; e.rounds = 0; e.cd = 0; e.ang = -Math.PI / 2; break;
    case 'silo': e.parts = 0; break;
    case 'nest': e.cd = 300; break;
  }
}
export function registerEntity(e) {
  const p = PROTO[e.name];
  e.type = p.type;
  const [w, h] = dims(p, e.dir);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) G.ents.set(key(e.x + i, e.y + j), e);
  getChunk(fd(e.x / CH), fd(e.y / CH)).ents.push(e);
  if (p.type !== 'tree') G.active.push(e);
  (G.byId || (G.byId = new Map())).set(e.id, e);
  if (p.type === 'nest') G.nests.push(e);
  if (!e.natural) G.powerDirty = true;
  if (p.boxes) G.fluidDirty = true;
}
// ---- ghosts: planned buildings waiting for the player or construction robots
export function ghostAtTile(x, y) { return G.ghostAt.get(key(x, y)); }
export function removeGhost(g) {
  if (g.dead) return; g.dead = true;
  const [w, h] = dims(PROTO[g.name], g.dir);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (G.ghostAt.get(key(g.x + i, g.y + j)) === g) G.ghostAt.delete(key(g.x + i, g.y + j));
  const ix = G.ghosts.indexOf(g); if (ix >= 0) G.ghosts.splice(ix, 1);
}
function clearGhosts(name, x, y, dir) {
  const [w, h] = dims(PROTO[name], dir);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const g = G.ghostAt.get(key(x + i, y + j)); if (g) removeGhost(g); }
}
export function addGhost(name, x, y, dir, set) {
  clearGhosts(name, x, y, dir);
  const g = { name, x, y, dir: dir | 0, set: set || null, t: G.tick };
  const [w, h] = dims(PROTO[name], g.dir);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) G.ghostAt.set(key(x + i, y + j), g);
  G.ghosts.push(g);
  return g;
}
export function placeEntity(name, x, y, dir, natural) {
  const p = PROTO[name];
  if (!natural && G.ghostAt.size) clearGhosts(name, x, y, dir | 0);
  const e = { id: G.nextId++, name, x, y, dir: dir | 0, hp: p.hp };
  if (natural) e.natural = true;
  initEnt(e, p);
  registerEntity(e);
  if (p.type === 'rail') { shapeRail(e, e.dir); G.railVer = (G.railVer || 0) + 1; }
  if (p.type === 'stop') nameStop(e);
  if (p.type === 'signal') G.railVer = (G.railVer || 0) + 1;
  if (p.type === 'pipe-ug') {
    const d = e.dir;
    for (let i = 1; i <= p.reach; i++) {
      const o = entAt(x - DX[d] * i, y - DY[d] * i);
      if (o && o.type === 'pipe-ug' && o.dir === d) { if (o.mode === 'in' && !o.pairK) { e.mode = 'out'; e.pairK = key(o.x, o.y); o.pairK = key(x, y); G.fluidDirty = true; } break; }
    }
  }
  if (p.type === 'ubelt') {
    const d = e.dir;
    for (let i = 1; i <= 5; i++) {
      const o = entAt(x - DX[d] * i, y - DY[d] * i);
      if (o && o.type === 'ubelt' && o.dir === d) {
        if (o.mode === 'in' && !o.pairK) { e.mode = 'out'; e.pairK = key(o.x, o.y); o.pairK = key(x, y); }
        break;
      }
    }
  }
  if (p.type === 'belt' || p.type === 'ubelt' || p.type === 'splitter') {
    const [w, h] = dims(p, e.dir);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) refreshBelts(x + i, y + j);
  }
  return e;
}
export function removeEntity(e) {
  if (e.dead) return;
  const p = PROTO[e.name];
  const [w, h] = dims(p, e.dir);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) G.ents.delete(key(e.x + i, e.y + j));
  if (G.byId) G.byId.delete(e.id);
  const c = getChunk(fd(e.x / CH), fd(e.y / CH));
  const ix = c.ents.indexOf(e); if (ix >= 0) c.ents.splice(ix, 1);
  e.dead = true;
  if (e.natural) { G.removed.add(key(e.x, e.y)); if (p.type === 'tree') { G.chopped = G.chopped || []; if (G.chopped.length < 20000) G.chopped.push([e.x, e.y, G.tick]); } } else G.powerDirty = true;
  if (p.boxes) G.fluidDirty = true;
  if (p.type === 'nest') { const i = G.nests.indexOf(e); if (i >= 0) G.nests.splice(i, 1); }
  if (p.type === 'rail' || p.type === 'signal') G.railVer = (G.railVer || 0) + 1;
  if (p.type === 'pipe-ug' && e.pairK) { const o = G.ents.get(e.pairK); if (o && o.type === 'pipe-ug') { o.pairK = 0; o.mode = 'in'; } }
  if (p.type === 'ubelt' && e.pairK) { const o = G.ents.get(e.pairK); if (o && o.type === 'ubelt') { o.pairK = 0; o.mode = 'in'; } }
  if (p.type === 'belt' || p.type === 'ubelt' || p.type === 'splitter')
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) refreshBelts(e.x + i, e.y + j);
}
export function canPlace(name, x, y, dir) {
  const p = PROTO[name];
  const [w, h] = dims(p, dir);
  let oil = false;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (tileAt(x + i, y + j) < 2) return false;
    if (G.ents.has(key(x + i, y + j))) return false;
    if (resType(x + i, y + j) === 5) oil = true;
  }
  if (p.type === 'pumpjack' && !oil) return false;
  if (p.type === 'offshore' && tileAt(x - DX[dir & 3], y - DY[dir & 3]) >= 2) return false;
  return true;
}
export function pregen(r) { for (let cy = -r; cy <= r; cy++) for (let cx = -r; cx <= r; cx++) getChunk(cx, cy); }
