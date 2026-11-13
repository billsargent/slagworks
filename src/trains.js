// Railways. Rails are 1x1 tiles whose shape is a 4-bit connection mask; trains move tile to tile along it.
import { G, invNew, invFits, invAdd, invCount, msg } from './state.js';
import { ITEMS } from './data.js';
import { DX, DY, key } from './util.js';
import { entAt } from './world.js';

export const CARLEN = 2;              // spacing between car centres, in tiles
const VMAX = 0.2, ACC = 0.0025, DEC = 0.005;
export const RAIL_SHAPES = [5, 10, 3, 6, 12, 9, 7, 14, 13, 11, 15];
const bits = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

// ---------------------------------------------------------------- rails
export function railAt(x, y) { const e = G.ents.get(key(x, y)); return e && e.type === 'rail' ? e : null; }
export function railLinked(x, y, d) {
  const a = railAt(x, y), b = railAt(x + DX[d], y + DY[d]);
  return !!(a && b && (a.rmask & (1 << d)) && (b.rmask & (1 << ((d + 2) & 3))));
}
// shape a freshly placed rail from its neighbours (open-ended straight by default)
export function shapeRail(e, dir) {
  let m = 0;
  for (let d = 0; d < 4; d++) {
    const n = railAt(e.x + DX[d], e.y + DY[d]); if (!n) continue;
    const back = 1 << ((d + 2) & 3);
    if (n.rmask & back) m |= 1 << d;
    else if (bits(n.rmask) < 2 || openEnd(n)) { n.rmask |= back; trimOpen(n); m |= 1 << d; }
  }
  if (!m) m = (dir & 1) ? 10 : 5;
  else if (bits(m) === 1) { for (let d = 0; d < 4; d++) if (m & (1 << d)) m |= 1 << ((d + 2) & 3); }
  e.rmask = m;
}
// a straight piece whose far side is empty counts as an open end that can be bent toward a new neighbour
function openEnd(n) { for (let d = 0; d < 4; d++) if ((n.rmask & (1 << d)) && !railAt(n.x + DX[d], n.y + DY[d])) return true; return false; }
function trimOpen(n) {
  if (bits(n.rmask) <= 2) return;
  for (let d = 0; d < 4; d++) if ((n.rmask & (1 << d)) && !railAt(n.x + DX[d], n.y + DY[d]) && bits(n.rmask) > 2) n.rmask &= ~(1 << d);
}
export function cycleRail(e) { const i = RAIL_SHAPES.indexOf(e.rmask); e.rmask = RAIL_SHAPES[(i + 1) % RAIL_SHAPES.length]; G.railVer = (G.railVer || 0) + 1; }

// ---------------------------------------------------------------- stops
export function stopRail(s) { for (let d = 0; d < 4; d++) { const r = railAt(s.x + DX[d], s.y + DY[d]); if (r) return r; } return null; }
let stopCache = null, stopTick = -1;
export function stops() { if (stopTick !== G.tick || !stopCache) { stopCache = G.active.filter(e => e.type === 'stop' && !e.dead); stopTick = G.tick; } return stopCache; }
export function nameStop(e) { const used = new Set(stops().map(s => s.stopName)); let i = 1; while (used.has('Stop ' + i)) i++; e.stopName = 'Stop ' + i; }

// ---------------------------------------------------------------- trains
function trace(x, y, back, need) {
  // walk the track from (x,y) leaving in direction `back`, collecting up to `need` tiles
  const out = [[x, y]]; let h = back;
  while (out.length < need) {
    const [cx, cy] = out[out.length - 1];
    let nd = -1;
    if (railLinked(cx, cy, h)) nd = h;
    else for (const d of [(h + 1) & 3, (h + 3) & 3]) if (railLinked(cx, cy, d)) { nd = d; break; }
    if (nd < 0) break;
    out.push([cx + DX[nd], cy + DY[nd]]); h = nd;
  }
  return out;
}
export function placeTrain(x, y, dir) {
  const r = railAt(x, y); if (!r) return 'Locomotives go on rails';
  if (!(r.rmask & (1 << dir)) && !(r.rmask & (1 << ((dir + 2) & 3)))) return 'Rotate (R) to line the locomotive up with the track';
  if (trainOn(x, y)) return 'There is already a train there';
  const hist = trace(x, y, (dir + 2) & 3, CARLEN + 3);
  if (hist.length < 3) return 'Needs at least 3 tiles of track behind it';
  const t = { id: G.nextId++, cars: [{ loco: true, fuel: null, energy: 0 }], hist, next: null, f: 0, v: 0, dir, mode: 'manual', sched: [], cur: 0, state: 'idle', wait: 0, path: null };
  G.trains.push(t); layout(t);
  return t;
}
export function addWagon(t) {
  const need = (t.cars.length + 1) * CARLEN + 3;
  if (t.hist.length < need) {
    const [ex, ey] = t.hist[t.hist.length - 1], [px, py] = t.hist[t.hist.length - 2];
    const more = trace(ex, ey, dirOf(px, py, ex, ey), need - t.hist.length + 1);
    t.hist.push(...more.slice(1));
  }
  if (t.hist.length < need) return 'Not enough straight track behind the train';
  t.cars.push({ wagon: true, inv: invNew(24) }); layout(t);
  return null;
}
const dirOf = (ax, ay, bx, by) => bx > ax ? 1 : bx < ax ? 3 : by > ay ? 2 : 0;

// point at arc distance s behind the head
function pointBack(t, s) {
  const h = t.hist;
  if (t.next && s <= t.f) { const k = t.f - s; return [h[0][0] + (t.next[0] - h[0][0]) * k + 0.5, h[0][1] + (t.next[1] - h[0][1]) * k + 0.5]; }
  let r = s - (t.next ? t.f : 0);
  if (r < 0) return [h[0][0] + (h[0][0] - h[1][0]) * -r + 0.5, h[0][1] + (h[0][1] - h[1][1]) * -r + 0.5];   // just ahead of the head
  const i = Math.min(h.length - 2, Math.floor(r)), k = Math.min(1, r - i);
  return [h[i][0] + (h[i + 1][0] - h[i][0]) * k + 0.5, h[i][1] + (h[i + 1][1] - h[i][1]) * k + 0.5];
}
export function layout(t) {
  t.cars.forEach((c, i) => {
    const s = i * CARLEN + 0.5, p = pointBack(t, s), a = pointBack(t, s - 0.7), b = pointBack(t, s + 0.7);
    c.x = p[0]; c.y = p[1]; c.ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
  });
  const need = t.cars.length * CARLEN + 4; if (t.hist.length > need) t.hist.length = need;
}
export function trainOn(x, y) {
  for (const t of G.trains) for (const c of t.cars) if (Math.abs(c.x - x - 0.5) < 0.9 && Math.abs(c.y - y - 0.5) < 0.9) return t;
  return null;
}
export function carAtPoint(wx, wy) {
  for (const t of G.trains) for (const c of t.cars) {
    const dx = wx - c.x, dy = wy - c.y, ca = Math.cos(c.ang), sa = Math.sin(c.ang);
    if (Math.abs(dx * ca + dy * sa) < 0.95 && Math.abs(-dx * sa + dy * ca) < 0.5) return { t, c };
  }
  return null;
}
// ---------------------------------------------------------------- signals and blocks
// A signal sits beside a rail and guards the edge leaving that rail tile in the signal's direction.
// Signals split the track into blocks; a train may only pass a signal when the block beyond is free.
export function signalRail(s) {
  for (const sd of [(s.dir + 3) & 3, (s.dir + 1) & 3]) { const r = railAt(s.x + DX[sd], s.y + DY[sd]); if (r && (r.rmask & (1 << s.dir))) return r; }
  return null;
}
const sk = (x, y, d) => x + ',' + y + ',' + d;
const cut = (x, y, d) => G.sigs.has(sk(x, y, d)) || G.sigs.has(sk(x + DX[d], y + DY[d], (d + 2) & 3));
function rebuildSignals() {
  G.sigVer = G.railVer || 0;
  G.sigs = new Map();
  for (const e of G.active) if (e.type === 'signal' && !e.dead) { const r = signalRail(e); e.rail = r ? [r.x, r.y] : null; if (r) G.sigs.set(sk(r.x, r.y, e.dir), e); }
  const id = new Map(); let n = 0;
  for (const r of G.active) {
    if (r.type !== 'rail' || r.dead || id.has(key(r.x, r.y))) continue;
    const q = [r]; id.set(key(r.x, r.y), ++n);
    while (q.length) {
      const a = q.pop();
      for (let d = 0; d < 4; d++) {
        if (!railLinked(a.x, a.y, d) || cut(a.x, a.y, d)) continue;
        const b = railAt(a.x + DX[d], a.y + DY[d]), kb = key(b.x, b.y);
        if (!id.has(kb)) { id.set(kb, n); q.push(b); }
      }
    }
  }
  G.blocks = id;
}
// driving through a signalled edge against the signal is not allowed: that is how one-way track works
export function edgeAllowed(x, y, d) { return !G.sigs || G.sigs.has(sk(x, y, d)) || !G.sigs.has(sk(x + DX[d], y + DY[d], (d + 2) & 3)); }
function carTiles(c) { const out = []; for (const s of [-0.85, 0, 0.85]) out.push(key(Math.floor(c.x + Math.cos(c.ang) * s), Math.floor(c.y + Math.sin(c.ang) * s))); return out; }
function buildOccupancy() {
  G.occ = new Map();
  const mark = (b, t) => { if (b == null) return; let s = G.occ.get(b); if (!s) G.occ.set(b, s = new Set()); s.add(t.id); };
  for (const t of G.trains) {
    for (const c of t.cars) for (const k of carTiles(c)) mark(G.blocks.get(k), t);
    mark(G.blocks.get(key(t.hist[0][0], t.hist[0][1])), t);
    if (t.next && t.f > 0.05) mark(G.blocks.get(key(t.next[0], t.next[1])), t);
  }
  G.res = new Map();
  for (const t of G.trains) if (t.resv != null && !G.res.has(t.resv)) G.res.set(t.resv, t.id);
}
const blockFree = (b, t) => { if (b == null) return true; const o = G.occ.get(b); if (o && (o.size > 1 || !o.has(t.id))) return false; const r = G.res.get(b); return r == null || r === t.id; };
// the tiles the train will drive over next
function lookahead(t, n) {
  const seq = [t.hist[0]]; if (!t.next) return seq;
  seq.push(t.next);
  if (t.path) for (const p of t.path) { if (seq.length >= n) break; seq.push(p); }
  let px = seq[seq.length - 2], cx = seq[seq.length - 1];
  while (seq.length < n) {
    const h = dirOf(px[0], px[1], cx[0], cx[1]), ex = exits(cx[0], cx[1], h); if (!ex.length) break;
    const d = ex.includes(h) ? h : ex[0], nx = [cx[0] + DX[d], cx[1] + DY[d]];
    seq.push(nx); px = cx; cx = nx;
  }
  return seq;
}
// returns the distance to a red signal ahead (or Infinity) and reserves the first green block
function signalCheck(t) {
  t.resv = null;
  if (!G.sigs.size || !t.next) return Infinity;
  const seq = lookahead(t, 10);
  let reserved = false;
  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i], b = seq[i + 1], d = dirOf(a[0], a[1], b[0], b[1]), dist = i - t.f;
    if (dist < -0.05) continue;               // already past this signal's stop line
    if (!G.sigs.has(sk(a[0], a[1], d))) continue;
    const blk = G.blocks.get(key(b[0], b[1]));
    if (!blockFree(blk, t)) return dist;
    if (!reserved) { reserved = true; t.resv = blk; G.res.set(blk, t.id); }
  }
  return Infinity;
}

// ---- path finding over (tile, heading)
function exits(x, y, h) {
  const r = railAt(x, y); if (!r) return [];
  const out = [];
  for (let d = 0; d < 4; d++) if (d !== ((h + 2) & 3) && railLinked(x, y, d) && edgeAllowed(x, y, d)) out.push(d);
  return out;
}
function findPath(t, target) {
  if (!t.next) return null;
  const sx = t.next[0], sy = t.next[1], sh = dirOf(t.hist[0][0], t.hist[0][1], sx, sy);
  const k0 = sx + ',' + sy + ',' + sh, prev = new Map([[k0, null]]), q = [[sx, sy, sh]];
  for (let qi = 0; qi < q.length && qi < 40000; qi++) {
    const [x, y, h] = q[qi];
    if (x === target.x && y === target.y) {
      const path = []; let k = x + ',' + y + ',' + h;
      while (k) { const [px, py] = k.split(',').map(Number); path.unshift([px, py]); k = prev.get(k); }
      return path.slice(1);   // tiles after `next`
    }
    for (const d of exits(x, y, h)) {
      const nx = x + DX[d], ny = y + DY[d], nk = nx + ',' + ny + ',' + d;
      if (!prev.has(nk)) { prev.set(nk, x + ',' + y + ',' + h); q.push([nx, ny, d]); }
    }
  }
  return null;
}
function chooseNext(t) {
  const [x, y] = t.hist[0], h = t.hist.length > 1 ? dirOf(t.hist[1][0], t.hist[1][1], x, y) : t.dir;
  if (t.path && t.path.length) { const n = t.path.shift(); if (railLinked(x, y, dirOf(x, y, n[0], n[1]))) return n; t.path = null; }
  const ex = exits(x, y, h); if (!ex.length) return null;
  const d = ex.includes(h) ? h : ex[0];
  return [x + DX[d], y + DY[d]];
}
function occupiedBy(other, x, y) {
  for (const t of G.trains) if (t !== other) for (const c of t.cars) if (Math.abs(c.x - x - 0.5) < 1.1 && Math.abs(c.y - y - 0.5) < 1.1) return true;
  return false;
}
function target(t) {
  if (t.mode !== 'auto' || !t.sched.length) return null;
  const e = t.sched[t.cur % t.sched.length]; const s = stops().find(s => s.stopName === e.stop);
  const r = s && stopRail(s); return r ? { x: r.x, y: r.y, entry: e } : null;
}
function wagonsFull(t) { return t.cars.filter(c => c.wagon).every(c => c.inv.every(s => s && s.n >= ITEMS[s.id].stack)); }
function wagonsEmpty(t) { return t.cars.filter(c => c.wagon).every(c => c.inv.every(s => !s)); }
function cargoSig(t) { let n = 0; for (const c of t.cars) if (c.wagon) for (const s of c.inv) if (s) n += s.n * 7 + s.id.length; return n; }

export function trainTick() {
  G.wagonTiles = new Map();
  if (G.sigVer !== (G.railVer || 0) || !G.blocks) rebuildSignals();
  buildOccupancy();
  for (const t of G.trains) {
    const loco = t.cars[0];
    if (loco.energy <= 0 && loco.fuel) { loco.energy += ITEMS[loco.fuel.id].fuel; if (--loco.fuel.n <= 0) loco.fuel = null; }
    let tg = target(t);
    if (t.state === 'wait') {
      t.wait++;
      const e = tg && tg.entry, sig = cargoSig(t);
      if (sig !== t.sig) { t.sig = sig; t.lastChange = t.wait; }
      let go = !e;
      if (e) go = e.cond === 'full' ? wagonsFull(t) : e.cond === 'empty' ? wagonsEmpty(t) : e.cond === 'inactive' ? t.wait - (t.lastChange || 0) > 300 : t.wait > 60 * (e.secs || 30);
      if (t.mode !== 'auto') go = false;
      if (go) { t.cur = (t.cur + 1) % Math.max(1, t.sched.length); t.state = 'idle'; t.path = null; t.left = t.hist[0]; tg = target(t); }
    }
    // need a next tile to move into
    if (!t.next) { t.next = chooseNext(t); t.f = 0; }
    if (tg && t.state !== 'wait' && !t.path && t.next) { t.path = findPath(t, tg); if (!t.path && !(t.next[0] === tg.x && t.next[1] === tg.y)) t.noPath = true; else t.noPath = false; }
    // speed control
    let want = t.mode === 'auto' && tg && t.state !== 'wait' && !t.noPath ? VMAX : 0;
    if (t.mode === 'manual' && t.drive) want = VMAX * 0.7;
    if (!t.next) want = 0;
    if (tg && t.state !== 'wait') {
      // distance to the stop tile centre
      let dist = Infinity;
      if (t.hist[0][0] === tg.x && t.hist[0][1] === tg.y && t.f < 0.01 && !(t.left && t.left[0] === tg.x && t.left[1] === tg.y)) dist = 0;
      else if (t.next && t.next[0] === tg.x && t.next[1] === tg.y) dist = 1 - t.f;
      else if (t.path) { const i = t.path.findIndex(p => p[0] === tg.x && p[1] === tg.y); if (i >= 0) dist = i + 2 - t.f; }
      if (dist < Infinity && t.v * t.v / (2 * DEC) >= dist - 0.05) want = dist > 0.12 ? Math.min(0.02, want) : 0;
      if (dist <= 0.12 && t.v < 0.03) {
        if (t.next && t.next[0] === tg.x && t.next[1] === tg.y) { t.hist.unshift(t.next); t.next = chooseNext(t); }
        t.v = 0; t.f = 0; t.state = 'wait'; t.wait = 0; t.lastChange = 0; t.sig = cargoSig(t); t.path = null;
      }
    }
    // signals: brake for a red signal ahead
    const sd = t.state === 'wait' ? Infinity : signalCheck(t);
    t.sigWait = false;
    if (sd < Infinity) {
      if (t.v * t.v / (2 * DEC) >= sd - 0.05) want = sd > 0.1 ? Math.min(0.02, want) : 0;
      if (sd <= 0.1 && want === 0) { t.sigWait = true; if (t.v < 0.03) t.v = 0; }
    }
    // collision avoidance: brake if the next two tiles hold another train
    if (t.next && (occupiedBy(t, t.next[0], t.next[1]) || (t.path && t.path[0] && occupiedBy(t, t.path[0][0], t.path[0][1])))) want = 0;
    if (t.state === 'wait') want = 0;
    if (want > t.v && loco.energy > 0) { t.v = Math.min(want, t.v + ACC); loco.energy -= 600 / 60 * (t.v / VMAX + 0.2); }
    else if (want < t.v) t.v = Math.max(want, t.v - DEC);
    else if (want > 0 && loco.energy <= 0) t.v = Math.max(0, t.v - DEC * 0.3);
    if (loco.energy < 0) loco.energy = 0;
    t.noFuel = loco.energy <= 0 && !loco.fuel;
    // advance
    t.f += t.v;
    if (t.v > 0.01) t.left = null;
    while (t.f >= 1 && t.next) {
      t.hist.unshift(t.next); t.f -= 1;
      if (tg && t.next[0] === tg.x && t.next[1] === tg.y) { t.f = 0; t.v = 0; t.next = chooseNext(t); t.state = 'wait'; t.wait = 0; t.lastChange = 0; t.sig = cargoSig(t); t.path = null; break; }
      t.next = chooseNext(t);
      if (!t.next) { t.f = 0; t.v = 0; }
    }
    layout(t);
    for (const c of t.cars) for (const k of carTiles(c)) { const b = G.blocks.get(k); if (b != null) { let s = G.occ.get(b); if (!s) G.occ.set(b, s = new Set()); s.add(t.id); } }
    if (t.v === 0) for (const c of t.cars) if (c.wagon) {
      c.type = 'wagon'; c.name = 'cargo-wagon';
      for (const s of [-0.5, 0.5]) G.wagonTiles.set(key(Math.floor(c.x + Math.cos(c.ang) * s), Math.floor(c.y + Math.sin(c.ang) * s)), c);
    }
  }
}
// signal lights: red when the block beyond holds a train or is reserved
export function signalState(e) {
  if (!e.rail || !G.blocks) return 'none';
  const b = G.blocks.get(key(e.rail[0] + DX[e.dir], e.rail[1] + DY[e.dir]));
  if (b == null) return 'none';
  return (G.occ && G.occ.get(b) && G.occ.get(b).size) || (G.res && G.res.has(b)) ? 'red' : 'green';
}
export function wagonAt(x, y) { return G.wagonTiles && G.wagonTiles.get(key(x, y)); }
export function removeTrain(t, inv) {
  let lost = 0;
  for (const c of t.cars) {
    lost += invAdd(inv, c.loco ? 'locomotive' : 'cargo-wagon', 1);
    if (c.fuel) lost += invAdd(inv, c.fuel.id, c.fuel.n);
    if (c.inv) for (const s of c.inv) if (s) lost += invAdd(inv, s.id, s.n);
  }
  G.trains.splice(G.trains.indexOf(t), 1);
  return lost;
}
export { invFits, invCount };
