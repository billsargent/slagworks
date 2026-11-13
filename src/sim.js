// Fixed-step factory simulation.
import { G, invAdd, invRemove, invCount, invFits, daylight, msg, pickup } from './state.js';
import { ITEMS, RECIPES, PROTO, TECH, SMELT } from './data.js';
import { DX, DY, clamp, key, CH, hash2 } from './util.js';
import { DAY_LEN } from './state.js';
import { entAt, beltAt, removeEntity, placeEntity, peekChunk, tileAt, resType, resAmt, setRes, frontTile, ORES, dims } from './world.js';
import { sfx } from './audio.js';
import { fluidTick, drawFrom } from './fluids.js';
import { trainTick, wagonAt } from './trains.js';
import { robotTick } from './robots.js';

const GAP = 0.25, END = 0.875;
export const recipeOK = r => !r.tech || !!G.research.done[r.tech];
export function bonus(k) {
  const d = G.research.done;
  if (k === 'mine') return d['mining-1'] ? 1.25 : 1;
  if (k === 'lab') return d['lab-speed'] ? 1.5 : 1;
  if (k === 'dmg') return 1 + (d.ballistics ? 0.5 : 0) + (d['ballistics-2'] ? 0.5 : 0);
  return 1;
}
export function fx(o) { if (G.fx.length < 500) { o.max = o.life; G.fx.push(o); } }

// ------------------------------------------------------------------ production statistics
const PW = { d: 0, s: 0, a: 0, w: 0 };
export function statP(id, n) { const c = G.stats.cur.p; c[id] = (c[id] || 0) + n; }
export function statC(id, n) { const c = G.stats.cur.c; c[id] = (c[id] || 0) + n; }
function statTick() {
  if (G.tick % 60) return;
  const st = G.stats;
  st.cur.pw = { d: PW.d / 60, s: PW.s / 60, a: PW.a / 60, w: PW.w / 60 };
  PW.d = PW.s = PW.a = PW.w = 0;
  st.hist.push(st.cur); if (st.hist.length > 600) st.hist.shift();
  st.cur = { p: {}, c: {} };
}

// ------------------------------------------------------------------ belts
function fwdTarget(d, fromX, fromY) {
  const t = beltAt(fromX + DX[d], fromY + DY[d]);
  if (!t) return null;
  if (t.dir === d) return (t.type === 'ubelt' && t.mode === 'out') ? null : { t, side: -1 };
  if (t.dir === ((d + 2) & 3) || t.type !== 'belt') return null;
  const fromLeft = d === ((t.dir + 1) & 3);
  if (t.curve && ((t.curve < 0) === fromLeft)) return { t, side: -1 };
  return { t, side: fromLeft ? 0 : 1 };
}
function targets(bl, par) {
  if (bl._v === G.beltVer) return bl._tg;
  let tg;
  if (par) tg = [fwdTarget(bl.dir, par.subs[0].x, par.subs[0].y), fwdTarget(bl.dir, par.subs[1].x, par.subs[1].y)];
  else if (bl.type === 'ubelt' && bl.mode === 'in') { const o = bl.pairK ? G.ents.get(bl.pairK) : null; tg = [o ? { t: o, side: -1 } : null]; }
  else tg = [fwdTarget(bl.dir, bl.x, bl.y)];
  bl._v = G.beltVer; bl._tg = tg;
  return tg;
}
function limitFor(tg, li) {
  if (!tg) return END;
  if (tg.side < 0) { const lane = tg.t.lanes[li]; return lane.length ? 1 + lane[lane.length - 1].p - GAP : 1.5; }
  const lane = tg.t.lanes[tg.side];
  for (let i = 0; i < lane.length; i++) if (Math.abs(lane[i].p - 0.5) < GAP) return END;
  return 1.5;
}
function insertSorted(lane, it) { let i = 0; while (i < lane.length && lane[i].p > it.p) i++; lane.splice(i, 0, it); }
function stepBelt(bl, par) {
  const tgs = targets(bl, par), sp = bl.speed;
  for (let li = 0; li < 2; li++) {
    const lane = bl.lanes[li];
    if (!lane.length) continue;
    let tg = null, lim = END;
    if (tgs.length === 1) { tg = tgs[0]; lim = limitFor(tg, li); }
    else {
      const a = par.tog[li] ? 1 : 0, l0 = limitFor(tgs[a], li);
      if (l0 >= 1) { tg = tgs[a]; lim = l0; }
      else { const l1 = limitFor(tgs[1 - a], li); if (l1 > l0) { tg = tgs[1 - a]; lim = l1; } else { tg = tgs[a]; lim = l0; } }
    }
    const it = lane[0];
    let np = it.p + sp, prev, start;
    if (np > lim) np = lim;
    if (np >= 1 && tg) {
      lane.shift();
      if (tg.side < 0) { it.p = np - 1; tg.t.lanes[li].push(it); } else { it.p = 0.5; insertSorted(tg.t.lanes[tg.side], it); }
      if (par) par.tog[li] ^= 1;
      prev = np; start = 0;
    } else { if (np > it.p) it.p = np; prev = it.p; start = 1; }
    for (let i = start; i < lane.length; i++) {
      const q = lane[i]; let v = q.p + sp; const l = prev - GAP;
      if (v > l) v = l; if (v > q.p) q.p = v; prev = q.p;
    }
  }
}
export function beltPut(bl, li, id) {
  const lane = bl.lanes[li];
  for (const p of [0.5, 0.25, 0.75]) {
    let ok = true;
    for (let i = 0; i < lane.length; i++) if (Math.abs(lane[i].p - p) < GAP) { ok = false; break; }
    if (ok) { insertSorted(lane, { id, p }); return true; }
  }
  return false;
}
function beltTake(bl, pred) {
  for (let li = 0; li < 2; li++) { const lane = bl.lanes[li]; for (let i = 0; i < lane.length; i++) if (pred(lane[i].id)) { const id = lane[i].id; lane.splice(i, 1); return id; } }
  return null;
}
function dropLane(d, bl) { return d === ((bl.dir + 3) & 3) ? 0 : 1; }

// ------------------------------------------------------------------ item interfaces
const fuelOK = (e, it, id, manual) => !!it.fuel && (!e.fuel || (e.fuel.id === id && e.fuel.n < (manual ? it.stack : 5)));
export function entAccepts(e, id, manual) {
  const p = PROTO[e.name], it = ITEMS[id];
  switch (p.type) {
    case 'wagon': return invFits(e.inv, id);
    case 'roboport': return id === 'construction-robot' || id === 'logistic-robot';
    case 'chest': {
      if (manual || e.limit == null) return invFits(e.inv, id);
      const st = ITEMS[id].stack;
      for (let i = 0; i < e.limit && i < e.inv.length; i++) { const s = e.inv[i]; if (!s || (s.id === id && s.n < st)) return true; }
      return false;
    }
    case 'furnace': {
      const r = SMELT[id];
      if (!r) return !!p.burner && fuelOK(e, it, id, manual);
      if (!recipeOK(r)) return false;
      return !e.inp || (e.inp.id === id && e.inp.n < (manual ? it.stack : r.in[id] * 2));
    }
    case 'assembler': {
      const r = e.recipe && RECIPES[e.recipe];
      if (!r || !r.in[id]) return false;
      return (e.inp[id] || 0) < (manual ? Math.max(it.stack, r.in[id]) : r.in[id] * 2 + 1);
    }
    case 'lab': return !!it.sci && (e.inp[id] || 0) < (manual ? it.stack : 3);
    case 'generator': case 'boiler': return fuelOK(e, it, id, manual);
    case 'drill': return !!p.burner && fuelOK(e, it, id, manual);
    case 'turret': return id === 'ammo' && e.ammo < (manual ? 50 : 10);
    case 'silo': return id === 'rocket-part' && e.parts < p.need && !G.launch;
  }
  return false;
}
export function entInsert(e, id) {
  const p = PROTO[e.name];
  switch (p.type) {
    case 'chest': case 'wagon': invAdd(e.inv, id, 1); break;
    case 'roboport': e.robots[id.split('-')[0]]++; break;
    case 'furnace': if (SMELT[id]) { if (e.inp) e.inp.n++; else e.inp = { id, n: 1 }; } else { if (e.fuel) e.fuel.n++; else e.fuel = { id, n: 1 }; } break;
    case 'assembler': case 'lab': e.inp[id] = (e.inp[id] || 0) + 1; break;
    case 'generator': case 'drill': case 'boiler': if (e.fuel) e.fuel.n++; else e.fuel = { id, n: 1 }; break;
    case 'turret': e.ammo++; break;
    case 'silo': e.parts++; break;
  }
}
export function giveTo(e, id, n) { let k = 0; while (k < n && entAccepts(e, id, true)) { entInsert(e, id); k++; } return k; }
function entTake(e, pred) {
  switch (e.type) {
    case 'chest': case 'wagon': for (let i = 0; i < e.inv.length; i++) { const s = e.inv[i]; if (s && pred(s.id)) { const id = s.id; if (--s.n <= 0) e.inv[i] = null; return id; } } return null;
    case 'furnace': case 'drill': case 'pumpjack':
      if (e.out && pred(e.out.id)) { const id = e.out.id; if (--e.out.n <= 0) e.out = null; return id; } return null;
    case 'assembler': for (const id in e.out) if (e.out[id] > 0 && pred(id)) { e.out[id]--; return id; } return null;
  }
  return null;
}
export function entContents(e) {
  const o = [], add = (id, n) => { if (id && n > 0) o.push([id, n]); };
  if (e.lanes) for (const l of e.lanes) for (const it of l) add(it.id, 1);
  if (e.subs) for (const s of e.subs) for (const l of s.lanes) for (const it of l) add(it.id, 1);
  if (e.inv) for (const s of e.inv) if (s) add(s.id, s.n);
  if (e.fuel) add(e.fuel.id, e.fuel.n);
  if (e.type === 'furnace') { if (e.inp) add(e.inp.id, e.inp.n); if (e.out) add(e.out.id, e.out.n); }
  else if (e.type === 'drill' || e.type === 'pumpjack') { if (e.out) add(e.out.id, e.out.n); }
  else { if (e.inp) for (const k in e.inp) add(k, e.inp[k]); if (e.out) for (const k in e.out) add(k, e.out[k]); }
  if (e.crafting && e.recipe) { const r = RECIPES[e.recipe]; for (const k in r.in) add(k, r.in[k]); }
  if (e.held) add(e.held, 1);
  if (e.ammo) add('ammo', e.ammo);
  if (e.parts) add('rocket-part', e.parts);
  if (e.robots) for (const k in e.robots) add(k + '-robot', e.robots[k]);
  return o;
}

// ------------------------------------------------------------------ power
function usePower(e, kw) { const n = e.net; if (!n) return 0; n.demand += kw; return n.sat; }
function rebuildPower() {
  G.powerDirty = false;
  const poles = [], elec = [];
  for (const e of G.active) {
    if (e.dead || e.natural) continue;
    const p = PROTO[e.name]; e.net = null;
    if (p.type === 'pole') { e._cx = e.x + p.w / 2; e._cy = e.y + p.h / 2; e._r = e; e._nb = []; poles.push(e); }
    else if (p.power || p.gen || p.type === 'accu') elec.push(e);
  }
  const find = a => { while (a._r !== a) { a._r = a._r._r; a = a._r; } return a; };
  for (let i = 0; i < poles.length; i++) for (let j = i + 1; j < poles.length; j++) {
    const a = poles[i], b = poles[j], d = Math.hypot(a._cx - b._cx, a._cy - b._cy);
    if (d <= Math.min(PROTO[a.name].wire, PROTO[b.name].wire)) { a._nb.push([b, d]); b._nb.push([a, d]); find(a)._r = find(b); }
  }
  G.wires = [];
  for (const a of poles) for (const [b, d] of a._nb) {
    if (a.id > b.id) continue;
    let skip = false;
    for (const [c, dc] of a._nb) if (c !== b && dc < d && Math.hypot(c._cx - b._cx, c._cy - b._cy) < d) { skip = true; break; }
    if (!skip) G.wires.push([a, b]);
  }
  G.nets = [];
  const mk = () => { const n = { sat: 0, demand: 0, gens: [], engines: [], solars: [], accus: [], dem: 0, sup: 0 }; G.nets.push(n); return n; };
  for (const a of poles) { const r = find(a); if (!r._net || r._netV !== G.tick) { r._net = mk(); r._netV = G.tick; } a.net = r._net; }
  for (const e of elec) {
    const p = PROTO[e.name];
    for (const a of poles) {
      const ar = PROTO[a.name].area;
      if (e.x < a._cx + ar && e.x + p.w > a._cx - ar && e.y < a._cy + ar && e.y + p.h > a._cy - ar) { e.net = a.net; break; }
    }
    if (e.net) { if (p.type === 'generator') e.net.gens.push(e); else if (p.type === 'engine') e.net.engines.push(e); else if (p.type === 'solar') e.net.solars.push(e); else if (p.type === 'accu') e.net.accus.push(e); }
  }
}
function powerTick() {
  const day = daylight();
  for (const n of G.nets) {
    const D = n.demand; n.demand = 0;
    const solar = n.solars.length * 60 * day;
    let genCap = 0, room = 0, avail = 0;
    for (const g of n.gens) { if (g.energy <= 0 && g.fuel) { g.energy += ITEMS[g.fuel.id].fuel; statC(g.fuel.id, 1); if (--g.fuel.n <= 0) g.fuel = null; } if (g.energy > 0) genCap += 900; }
    for (const g of n.engines) { const s = g.fseg && g.fseg.s; g.cap = s && s.f === 'steam' ? Math.min(900, s.a / 0.5 * 900) : 0; genCap += g.cap; }
    for (const a of n.accus) { room += Math.min(300, (5000 - a.charge) * 60); avail += Math.min(300, a.charge * 60); }
    const supply = solar + genCap, used = Math.min(D, supply), fromAcc = Math.min(D - used, avail), toAcc = Math.min(supply - used, room);
    const load = genCap > 0 ? clamp((used + toAcc - solar) / genCap, 0, 1) : 0;
    for (const g of n.gens) { g.load = g.energy > 0 ? load : 0; if (g.energy > 0) g.energy -= 900 * load / 60; }
    for (const g of n.engines) { g.load = g.cap > 0 ? load * g.cap / 900 : 0; if (g.load > 0) drawFrom(g, 's', 'steam', 0.5 * g.load); }
    if (fromAcc > 0) for (const a of n.accus) a.charge = Math.max(0, a.charge - Math.min(300, a.charge * 60) / avail * fromAcc / 60);
    else if (toAcc > 0) for (const a of n.accus) a.charge = Math.min(5000, a.charge + Math.min(300, (5000 - a.charge) * 60) / room * toAcc / 60);
    n.sat = D > 0 ? (used + fromAcc) / D : (supply + avail > 0 ? 1 : 0);
    n.dem = D; n.sup = supply; n.acc = avail;
    PW.d += Math.min(D, supply + avail); PW.s += supply; PW.a += n.accus.reduce((t, a) => t + a.charge, 0); PW.w += D;
  }
}

// ------------------------------------------------------------------ machines
function smoke(x, y, s = 0.5) { fx({ k: 'smoke', x, y, vx: 0.004 + Math.random() * 0.004, vy: -0.012 - Math.random() * 0.006, life: 70, s }); }
function burn(e, p) {
  if (e.energy <= 0) { if (!e.fuel) { e.warn = 'fuel'; return false; } e.energy += ITEMS[e.fuel.id].fuel; statC(e.fuel.id, 1); if (--e.fuel.n <= 0) e.fuel = null; }
  e.energy -= p.heat / 60; return true;
}
function pushOut(e) {
  const [fxx, fyy] = frontTile(e), bl = beltAt(fxx, fyy);
  let ok = false;
  if (bl) ok = beltPut(bl, dropLane(e.dir, bl), e.out.id);
  else { const t = entAt(fxx, fyy); if (t && !t.natural && entAccepts(t, e.out.id)) { entInsert(t, e.out.id); ok = true; } }
  if (ok && --e.out.n <= 0) e.out = null;
}
function findRes(e, p) {
  const a = p.area;
  for (let j = -a; j < p.h + a; j++) for (let i = -a; i < p.w + a; i++) {
    const x = e.x + i, y = e.y + j, t = resType(x, y);
    if (t && t < 5 && resAmt(x, y) > 0 && (!e.out || e.out.id === ORES[t])) { e.rx = x; e.ry = y; return true; }
  }
  e.rx = null; return false;
}
const UPD = {
  belt(e) { stepBelt(e, null); },
  ubelt(e) { stepBelt(e, null); },
  splitter(e) { stepBelt(e.subs[0], e); stepBelt(e.subs[1], e); },
  arm(e, p) {
    const moving = e.state === 1 || e.state === 3, s = usePower(e, moving ? p.power : p.power * 0.08);
    if (s <= 0) { e.warn = 'power'; return; }
    e.warn = null;
    const d = e.dir, r = p.reach;
    if (e.state === 0) {
      if ((G.tick + e.id) % 3) return;
      const tx = e.x + DX[d] * r, ty = e.y + DY[d] * r, tb = beltAt(tx, ty), te = tb ? null : (wagonAt(tx, ty) || entAt(tx, ty));
      if (!tb && (!te || te.natural)) return;
      const f = e.filter, want = tb ? (f ? (id => id === f) : (() => true)) : (id => (!f || id === f) && entAccepts(te, id));
      const sx = e.x - DX[d] * r, sy = e.y - DY[d] * r, sb = beltAt(sx, sy);
      let id = null;
      if (sb) id = beltTake(sb, want); else { const se = wagonAt(sx, sy) || entAt(sx, sy); if (se) id = entTake(se, want); }
      if (id) { e.held = id; e.state = 1; }
    } else if (e.state === 1) { e.prog += s / p.swing; if (e.prog >= 1) { e.prog = 1; e.state = 2; } }
    else if (e.state === 2) {
      const tx = e.x + DX[d] * r, ty = e.y + DY[d] * r, tb = beltAt(tx, ty);
      let ok = false;
      if (tb) ok = beltPut(tb, dropLane(d, tb), e.held);
      else { const te = wagonAt(tx, ty) || entAt(tx, ty); if (te && !te.natural && entAccepts(te, e.held)) { entInsert(te, e.held); ok = true; } }
      if (ok) { e.held = null; e.state = 3; }
    } else { e.prog -= s / p.swing; if (e.prog <= 0) { e.prog = 0; e.state = 0; } }
  },
  drill(e, p) {
    e.working = false; e.warn = null;
    if (e.out) pushOut(e);
    if (e.out && e.out.n >= p.buf) return;
    if (e.rx == null && ((G.tick + e.id) % 30 || !findRes(e, p))) { e.warn = 'ore'; return; }
    let s = 1;
    if (p.burner) { if (!burn(e, p)) return; } else { s = usePower(e, p.power); if (s <= 0) { e.warn = 'power'; return; } }
    e.working = true; e.anim += s; e.prog += p.rate * s * bonus('mine') / 60;
    if (p.burner && (G.tick + e.id) % 24 === 0) smoke(e.x + 0.35, e.y - 0.1, 0.4);
    if (e.prog >= 1) {
      e.prog -= 1;
      let t = resType(e.rx, e.ry);
      if (!t || t === 5 || (e.out && e.out.id !== ORES[t])) { if (!findRes(e, p)) return; t = resType(e.rx, e.ry); }
      setRes(e.rx, e.ry, resAmt(e.rx, e.ry) - 1);
      if (e.out) e.out.n++; else e.out = { id: ORES[t], n: 1 };
      statP(ORES[t], 1);
      if (resAmt(e.rx, e.ry) <= 0) e.rx = null;
    }
  },
  pumpjack(e, p) {
    e.working = false; e.warn = null;
    const o = e.fb.o;
    if (o.a > o.cap - 1) return;
    const s = usePower(e, p.power); if (s <= 0) { e.warn = 'power'; return; }
    const mv = Math.min(o.cap - o.a, p.rate * s / 60);
    e.working = true; e.anim += s; o.f = 'crude-oil'; o.a += mv; statP('crude-oil', mv);
  },
  offshore(e, p) { const o = e.fb.o; if (o.a < o.cap) { const mv = Math.min(o.cap - o.a, p.rate); o.f = 'water'; o.a += mv; statP('water', mv); e.working = true; } else e.working = false; },
  boiler(e, p) {
    e.working = false; e.warn = null;
    const o = e.fb.s;
    if (o.a > o.cap - 1) return;
    const s = e.fseg && e.fseg.w;
    if (!s || s.f !== 'water' || s.a < 1) { e.warn = 'water'; return; }
    if (!burn(e, p)) return;
    drawFrom(e, 'w', 'water', 1); o.f = 'steam'; o.a += 1; statC('water', 1); statP('steam', 1);
    e.working = true;
    if ((G.tick + e.id) % 18 === 0) smoke(e.x + 1.5 + DX[e.dir] * 0.2, e.y + 0.6, 0.5);
  },
  engine(e) { e.working = e.load > 0.01; e.anim += e.load; e.warn = e.fseg && e.fseg.s && e.fseg.s.f === 'steam' ? null : 'steam'; if (e.load > 0) statC('steam', 0.5 * e.load); },
  furnace(e, p) {
    e.working = false; e.warn = null;
    if (!e.cur) {
      if (!e.inp) return;
      const r = SMELT[e.inp.id], need = r.in[e.inp.id];
      if (e.inp.n < need) return;
      if (e.out && (e.out.id !== r.id || e.out.n >= ITEMS[r.id].stack)) return;
      statC(e.inp.id, need); e.inp.n -= need; if (!e.inp.n) e.inp = null;
      e.cur = r.id; e.prog = 0;
    }
    const r = RECIPES[e.cur]; let s = 1;
    if (p.burner) { if (!burn(e, p)) return; } else { s = usePower(e, p.power); if (s <= 0) { e.warn = 'power'; return; } }
    e.working = true; e.prog += p.speed * s / (r.time * 60);
    if (p.burner && (G.tick + e.id) % 20 === 0) smoke(e.x + 1, e.y + 0.35, 0.45);
    if (e.prog >= 1) { if (e.out) e.out.n += r.n; else e.out = { id: r.id, n: r.n }; statP(r.id, r.n); e.cur = null; e.prog = 0; }
  },
  assembler(e, p) {
    e.working = false; e.warn = null;
    const r = e.recipe && RECIPES[e.recipe];
    if (!r) return;
    const fi = r.fin && Object.keys(r.fin)[0], fo = r.fout && Object.keys(r.fout)[0];
    if (e.fb && e.fb.i) e.fb.i.want = fi || null;
    if (!e.crafting) {
      if (r.n > 0 && (e.out[r.id] || 0) >= r.n * 5) return;
      if (fo && (e.fb.o.a + r.fout[fo] > e.fb.o.cap || (e.fb.o.f && e.fb.o.f !== fo && e.fb.o.a > 0))) return;
      for (const k in r.in) if ((e.inp[k] || 0) < r.in[k]) return;
      if (fi && (e.fb.i.f !== fi || e.fb.i.a < r.fin[fi])) { e.warn = 'fluid'; return; }
      for (const k in r.in) { e.inp[k] -= r.in[k]; statC(k, r.in[k]); }
      if (fi) { e.fb.i.a -= r.fin[fi]; statC(fi, r.fin[fi]); }
      e.crafting = true; e.prog = 0;
    }
    const s = usePower(e, p.power); if (s <= 0) { e.warn = 'power'; return; }
    e.working = true; e.anim += s; e.prog += p.speed * s / (r.time * 60);
    if (e.name === 'refinery' && (G.tick + e.id) % 16 === 0) smoke(e.x + 3.35, e.y - 0.9, 0.5);
    if (e.prog >= 1) {
      if (r.n > 0) { e.out[r.id] = (e.out[r.id] || 0) + r.n; statP(r.id, r.n); }
      if (fo) { e.fb.o.f = fo; e.fb.o.a += r.fout[fo]; statP(fo, r.fout[fo]); }
      e.crafting = false; e.prog = 0;
    }
  },
  lab(e, p) {
    e.working = false; e.warn = null;
    const R = G.research, t = R.current && TECH[R.current];
    if (!t) return;
    if (e.unit <= 0) {
      for (const k of t.packs) if (!(e.inp[k] > 0)) return;
      for (const k of t.packs) { e.inp[k]--; statC(k, 1); }
      e.unit = 1;
    }
    const s = usePower(e, p.power); if (s <= 0) { e.warn = 'power'; return; }
    e.working = true;
    const dlt = Math.min(e.unit, p.speed * s * bonus('lab') / (5 * 60));
    e.unit -= dlt; R.progress += dlt;
    if (R.progress >= t.n - 1e-6) { R.done[t.id] = true; R.current = null; R.progress = 0; msg('Research complete: ' + t.name); sfx('research'); }
  },
  generator(e) {
    e.warn = (e.energy <= 0 && !e.fuel) ? 'fuel' : null;
    e.working = e.load > 0.01; e.anim += e.load;
    if (e.working && (G.tick + e.id) % 14 === 0) smoke(e.x + 0.97, e.y + 0.1, 0.4 + e.load * 0.3);
  },
  lamp(e, p) { if (daylight() < 0.45) e.on = usePower(e, p.power) > 0.2; else e.on = false; },
  turret(e, p) {
    if (e.cd > 0) e.cd--;
    const cx = e.x + 1, cy = e.y + 1;
    if ((G.tick + e.id) % 10 === 0) { e.tgt = null; let best = p.range * p.range; for (const u of G.units) { const d = (u.x - cx) ** 2 + (u.y - cy) ** 2; if (d < best) { best = d; e.tgt = u; } } }
    const u = e.tgt; e.warn = e.ammo <= 0 && e.rounds <= 0 ? 'ammo' : null;
    if (!u || u.hp <= 0) { e.tgt = null; return; }
    e.ang = Math.atan2(u.y - cy, u.x - cx);
    if (e.cd <= 0) {
      if (e.rounds <= 0) { if (e.ammo <= 0) return; e.ammo--; statC('ammo', 1); e.rounds = 10; }
      e.rounds--; e.cd = p.cool; hitUnit(u, p.dmg * bonus('dmg'));
      fx({ k: 'tracer', x: cx + Math.cos(e.ang) * 1.2, y: cy - 0.06 + Math.sin(e.ang) * 1.2, x2: u.x, y2: u.y, life: 4 });
      sfx('shot', 0.5);
    }
  },
  nest(e) {
    if (--e.cd > 0) return;
    e.cd = 60 * 20;
    let near = 0; for (const u of G.units) if (u.gx == null && Math.abs(u.home[0] - e.x - 1.5) < 2 && Math.abs(u.home[1] - e.y - 1.5) < 2) near++;
    if (near < 3 + Math.floor(G.evo * 5)) spawnUnit(e.x + 1.5 + (Math.random() - 0.5) * 5, e.y + 3.6, null, e);
  },
  silo(e) {
    const L = G.launch; if (!L || L.id !== e.id) return;
    L.t++;
    if (L.t > 40 && L.t % 3 === 0) smoke(e.x + 2.5 + (Math.random() - 0.5) * 2, e.y + 3.2, 1.2);
    if (L.t === 45) sfx('boom');
    if (L.t > 200) { G.launch = null; e.parts = 0; if (!G.won) { G.won = true; msg('Launch successful! You have completed Slagworks. The factory is yours to keep growing.'); sfx('research'); } }
  },
};

// ------------------------------------------------------------------ combat
function spawnUnit(x, y, goal, nest) {
  const spit = G.evo > 0.12 && Math.random() < 0.35, big = !spit && Math.random() < G.evo * 0.7, hp = (spit ? 32 : big ? 90 : 25) * (1 + G.evo);
  G.units.push({ x, y, hp, max: hp, big, spit, gx: goal ? goal[0] : null, gy: goal ? goal[1] : null, cd: 0, ang: 0, home: [nest.x + 1.5, nest.y + 1.5], t: (Math.random() * 100) | 0, wx: x, wy: y });
}
export function hitUnit(u, dmg) {
  u.hp -= dmg; u.agg = 600;
  if (u.hp <= 0) { fx({ k: 'splat', x: u.x, y: u.y, life: 240, s: u.big ? 1.5 : 1 }); G.kills++; }
}
export function damageEnt(e, dmg) {
  if (e.dead) return;
  e.hp -= dmg;
  if (e.type === 'nest') { if (e.cd > 90) e.cd = 90; }
  if (e.hp <= 0) {
    const p = PROTO[e.name];
    fx({ k: 'boom', x: e.x + p.w / 2, y: e.y + p.h / 2, life: 30, s: p.w * 0.6 }); sfx('boom');
    if (e.type === 'nest') { msg('Nest destroyed.'); G.nestKills = (G.nestKills || 0) + 1; }
    else if (!e.natural) { if (!G._lastDest || G.tick - G._lastDest > 300) { msg(p.name + ' was destroyed by crawlers!'); sfx('alert'); G._lastDest = G.tick; } }
    removeEntity(e);
  }
}
function nearestBuilding(x, y, maxd) {
  let best = null, bd = maxd ? maxd * maxd : 1e12;
  for (const e of G.active) { if (e.dead || e.natural) continue; const d = (e.x - x) ** 2 + (e.y - y) ** 2; if (d < bd) { bd = d; best = e; } }
  return best ? [best.x + 0.5, best.y + 0.5] : null;
}
function updUnits() {
  const pl = G.player;
  let dead = false;
  for (const u of G.units) {
    if (u.hp <= 0) { dead = true; continue; }
    u.t++; if (u.agg > 0) u.agg--;
    const dp = Math.hypot(pl.x - u.x, pl.y - u.y), chase = pl.hp > 0 && (dp < 11 || (u.agg > 0 && dp < 30));
    let tx, ty;
    if (chase) { tx = pl.x; ty = pl.y; }
    else if (u.gx != null) { tx = u.gx; ty = u.gy; }
    else { if (u.t % 150 === 1) { u.wx = u.home[0] + (Math.random() - 0.5) * 12; u.wy = u.home[1] + (Math.random() - 0.5) * 12; } tx = u.wx; ty = u.wy; }
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
    if (u.cd > 0) u.cd--;
    if (u.spit) {
      // spitters stop at range and lob acid at the player or the nearest building
      if (u.t % 20 === 0) u.st = chase ? null : nearestBuilding(u.x, u.y, 7.5);
      const st = chase && dp < 7 ? [pl.x, pl.y] : u.st;
      if (st && Math.hypot(st[0] - u.x, st[1] - u.y) < 7.5) {
        u.ang = Math.atan2(st[1] - u.y, st[0] - u.x);
        if (u.cd <= 0) { u.cd = 100; G.proj.push({ x: u.x, y: u.y, sx: u.x, sy: u.y, tx: st[0] + (Math.random() - 0.5) * 0.6, ty: st[1] + (Math.random() - 0.5) * 0.6, t: 0, T: 28 + d * 2, dmg: 10 * (1 + G.evo) }); }
        continue;
      }
    }
    if (d > 0.8) {
      const sp = (u.big ? 0.05 : 0.065) * (chase || u.gx != null ? 1 : 0.35), nx = u.x + dx / d * sp, ny = u.y + dy / d * sp;
      u.ang = Math.atan2(dy, dx);
      const b = entAt(Math.floor(nx), Math.floor(ny));
      if (b && !b.natural && b.type !== 'belt' && b.type !== 'rail') { if (u.cd <= 0) { u.cd = 40; damageEnt(b, u.big ? 22 : 8); } }
      else { u.x = nx; u.y = ny; }
    } else if (chase) { if (u.cd <= 0) { u.cd = 40; damagePlayer(u.big ? 16 : 6); } }
    else if (u.gx != null && !u.spit) { const g = nearestBuilding(u.x, u.y); if (g && Math.hypot(g[0] - u.x, g[1] - u.y) < 60) { u.gx = g[0]; u.gy = g[1]; } else { u.gx = pl.x; u.gy = pl.y; } }
  }
  if (dead) G.units = G.units.filter(u => u.hp > 0);
  // acid projectiles
  let pd = false;
  for (const p of G.proj) {
    p.t++; const k = p.t / p.T; p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k;
    if (p.t >= p.T) {
      pd = true; fx({ k: 'acid', x: p.tx, y: p.ty, life: 160, s: 1 });
      if (Math.hypot(pl.x - p.tx, pl.y - p.ty) < 1.2) damagePlayer(p.dmg);
      const e = entAt(Math.floor(p.tx), Math.floor(p.ty)); if (e && !e.natural) damageEnt(e, p.dmg * 1.5);
    }
  }
  if (pd) G.proj = G.proj.filter(p => p.t < p.T);
}
function expandNests() {
  if (G.peaceful || G.tick < (G.nextExpand || 60 * 60 * 15)) return;
  G.nextExpand = G.tick + 60 * 60 * (10 - G.evo * 6) * (0.7 + Math.random() * 0.6);
  if (!G.nests.length || G.nests.length > 80) return;
  const n = G.nests[(Math.random() * G.nests.length) | 0], pl = G.player;
  for (let tries = 0; tries < 12; tries++) {
    const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 14, x = Math.round(n.x + Math.cos(a) * r), y = Math.round(n.y + Math.sin(a) * r);
    if (Math.hypot(x - pl.x, y - pl.y) < 40 || nearestBuilding(x, y, 30)) continue;
    let ok = true;
    for (let j = 0; j < 3 && ok; j++) for (let i = 0; i < 3; i++) { if (tileAt(x + i, y + j) < 2 || resType(x + i, y + j)) { ok = false; break; } const e = entAt(x + i, y + j); if (e && e.type !== 'tree') { ok = false; break; } }
    if (!ok) continue;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const e = entAt(x + i, y + j); if (e) removeEntity(e); }
    placeEntity('nest', x, y, 0, true);
    return;
  }
}
function damagePlayer(d) {
  const pl = G.player; if (pl.hp <= 0) return;
  pl.hp -= d; sfx('hurt');
  if (pl.hp <= 0) { pl.hp = 0; pl.dead = 240; msg('You were overrun. Respawning at the landing site...'); sfx('alert'); }
}
function playerCombat() {
  const pl = G.player;
  if (pl.dead) { if (--pl.dead <= 0) { pl.dead = 0; pl.hp = 100; pl.x = 0.5; pl.y = 0.5; } return; }
  if (G.tick % 90 === 0 && pl.hp < 100) pl.hp++;
  if (pl.cd > 0) { pl.cd--; return; }
  let best = null, bd = 11 * 11, nest = null;
  for (const u of G.units) { const d = (u.x - pl.x) ** 2 + (u.y - pl.y) ** 2; if (d < bd) { bd = d; best = u; } }
  if (!best) for (const n of G.nests) { const d = (n.x + 1.5 - pl.x) ** 2 + (n.y + 1.5 - pl.y) ** 2; if (d < 81) { nest = n; break; } }
  if (!best && !nest) return;
  if (pl.rounds <= 0) { if (invRemove(pl.inv, 'ammo', 1)) { pl.rounds = 10; statC('ammo', 1); } else return; }
  pl.rounds--; pl.cd = 7;
  const tx = best ? best.x : nest.x + 1.5, ty = best ? best.y : nest.y + 1.5;
  pl.ang = Math.atan2(ty - pl.y, tx - pl.x);
  fx({ k: 'tracer', x: pl.x + Math.cos(pl.ang) * 0.5, y: pl.y + Math.sin(pl.ang) * 0.5, x2: tx, y2: ty, life: 4 });
  sfx('shot', 0.7);
  if (best) hitUnit(best, 5 * bonus('dmg')); else damageEnt(nest, 5 * bonus('dmg'));
}
function waves() {
  if (G.tick % 60 === 0) G.evo = Math.min(1, G.tick / (60 * 60 * 120) + (G.nestKills || 0) * 0.03);
  if (G.peaceful || G.tick < G.nextWave) return;
  G.nextWave = G.tick + 60 * 60 * (4 + Math.random() * 4) * (1 - G.evo * 0.5);
  const pl = G.player; let best = null, bd = 260 * 260;
  for (const n of G.nests) { const d = (n.x - pl.x) ** 2 + (n.y - pl.y) ** 2; if (d < bd) { bd = d; best = n; } }
  if (!best) return;
  const tgt = nearestBuilding(best.x, best.y) || [pl.x, pl.y], cnt = 3 + Math.floor(G.evo * 14) + ((Math.random() * 3) | 0);
  for (let i = 0; i < cnt; i++) spawnUnit(best.x + 1.5 + (Math.random() - 0.5) * 6, best.y + 3.6 + Math.random() * 2, tgt, best);
  msg('Crawlers are on the move!'); sfx('alert');
}

// change an assembler's recipe, handing its contents back to the player
export function setRecipe(e, id) {
  const pl = G.player, r = e.recipe && RECIPES[e.recipe];
  if (r && e.crafting) for (const k in r.in) invAdd(pl.inv, k, r.in[k]);
  for (const k in e.inp) if (e.inp[k] > 0 && ITEMS[k] && !ITEMS[k].fluid) invAdd(pl.inv, k, e.inp[k]);
  for (const k in e.out) if (e.out[k] > 0 && ITEMS[k] && !ITEMS[k].fluid) invAdd(pl.inv, k, e.out[k]);
  e.inp = {}; e.out = {}; e.recipe = id || null; e.crafting = false; e.prog = 0;
  if (e.fb) for (const b in e.fb) { e.fb[b].a = 0; e.fb[b].f = null; }
}

// ------------------------------------------------------------------ hand crafting
export function craftPlan(id, count) {
  const have = {}, virt = {}, use = {}, plan = [];
  const cnt = x => have[x] ?? (have[x] = invCount(G.player.inv, x));
  function need(item, n, depth) {
    const v = Math.min(virt[item] || 0, n); if (v) { virt[item] -= v; n -= v; }
    const t = Math.min(cnt(item), n); if (t) { have[item] -= t; use[item] = (use[item] || 0) + t; n -= t; }
    if (n <= 0) return true;
    const r = RECIPES[item];
    if (!r || r.cat !== 'craft' || !recipeOK(r) || depth > 6) return false;
    const times = Math.ceil(n / r.n);
    for (const k in r.in) if (!need(k, r.in[k] * times, depth + 1)) return false;
    plan.push({ id: item, left: times, prog: 0, per: 0, extra: 0 });
    virt[item] = (virt[item] || 0) + times * r.n - n;
    return true;
  }
  const r = RECIPES[id];
  if (!r || r.cat !== 'craft' || !recipeOK(r)) return null;
  for (const k in r.in) if (!need(k, r.in[k] * count, 0)) return null;
  for (const q of plan) if (virt[q.id]) { q.extra = virt[q.id]; virt[q.id] = 0; }
  plan.push({ id, left: count, prog: 0, per: r.n, extra: 0 });
  return { plan, use };
}
export function queueCraft(id, count) {
  const pl = craftPlan(id, count);
  if (!pl) return false;
  for (const k in pl.use) invRemove(G.player.inv, k, pl.use[k]);
  G.player.queue.push(...pl.plan);
  return true;
}
function craftTick() {
  const q = G.player.queue; if (!q.length) return;
  const c = q[0], r = RECIPES[c.id];
  c.prog += 1 / (r.time * 60);
  if (c.prog >= 1) {
    c.prog = 0; c.left--;
    let give = c.per + (c.left <= 0 ? c.extra : 0);
    statP(c.id, r.n); for (const k in r.in) statC(k, r.in[k]);
    if (give) { invAdd(G.player.inv, c.id, give); if (c.per) pickup(c.id, give); }
    if (c.per) sfx('craft', 0.5);
    if (c.left <= 0) q.shift();
  }
}

// ------------------------------------------------------------------ tree regrowth
const GROW = DAY_LEN * 2;
export function treeGrowth(e) { return e.born == null ? 1 : Math.min(1, 0.22 + 0.78 * (G.tick - e.born) / GROW); }
function nearBuilding(x, y, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const e = G.ents.get(key(x + dx, y + dy)); if (e && (!e.natural || e.type === 'nest')) return true; }
  return false;
}
function regrowChopped() {
  // mostly, trees come back where trees were cut down
  const L = G.chopped; if (!L || !L.length) return;
  const i = (Math.random() * L.length) | 0, [x, y, t0] = L[i], pl = G.player;
  if (G.tick - (t0 || 0) < DAY_LEN) return;   // a cleared spot stays clear for at least a day
  if (G.ents.has(key(x, y)) || nearBuilding(x, y, 2) || Math.hypot(pl.x - x - 0.5, pl.y - y - 0.5) < 2) { if (G.ents.has(key(x, y)) || nearBuilding(x, y, 1)) L.splice(i, 1); return; }
  L.splice(i, 1);
  const e = placeEntity('tree', x, y, 0, true);
  e.v = (hash2(x, y, G.seed + 302) * 4) | 0; e.born = G.tick; G.regrown.push(e);
}
function regrow() {
  if (Math.random() < 0.8) return;   // slow spread at forest edges
  const pl = G.player, cx = Math.floor(pl.x / CH) + ((Math.random() * 13) | 0) - 6, cy = Math.floor(pl.y / CH) + ((Math.random() * 13) | 0) - 6;
  const c = peekChunk(cx, cy); if (!c) return;
  const i = (Math.random() * 256) | 0;
  if (c.tiles[i] < 3 || c.res[i]) return;
  const x = cx * CH + (i & 15), y = cy * CH + (i >> 4);
  if (G.ents.has(key(x, y)) || Math.hypot(pl.x - x - 0.5, pl.y - y - 0.5) < 2) return;
  let trees = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const e = G.ents.get(key(x + dx, y + dy)); if (!e) continue;
    if (e.type === 'tree') { if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) trees++; }
    else if (!e.natural || e.type === 'nest') return;     // never grow into the factory
  }
  if (!trees || trees > 7) return;
  const e = placeEntity('tree', x, y, 0, true);
  e.v = (hash2(x, y, G.seed + 302) * 4) | 0; e.born = G.tick;
  G.regrown.push(e);
}

export function simTick() {
  G.tick++;
  if (G.powerDirty) rebuildPower();
  powerTick();
  fluidTick();
  trainTick();
  robotTick();
  const act = G.active; let dead = false;
  for (let i = 0; i < act.length; i++) { const e = act[i]; if (e.dead) { dead = true; continue; } const f = UPD[e.type]; if (f) f(e, PROTO[e.name]); }
  if (dead) G.active = G.active.filter(e => !e.dead);
  updUnits(); waves(); expandNests(); craftTick(); playerCombat();
  if (G.tick % 20 === 0) regrow();
  if (G.tick % 90 === 0) regrowChopped();
  statTick();
  if (G.tick % 3600 === 0) G.regrown = G.regrown.filter(e => !e.dead);
  const f = G.fx; let fd = false;
  for (let i = 0; i < f.length; i++) { const o = f[i]; if (--o.life <= 0) fd = true; if (o.vx) { o.x += o.vx; o.y += o.vy; } }
  if (fd) G.fx = f.filter(o => o.life > 0);
}
