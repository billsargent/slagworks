// Fluid networks. Every connected run of "pass" boxes (pipes, tanks, engines, boiler water) forms one
// segment holding a single fluid. Machine "in"/"out" boxes attach to the segment next to them.
import { G } from './state.js';
import { PROTO } from './data.js';
import { DX, DY, key } from './util.js';
import { entAt } from './world.js';

// world-space connections of an entity: { x, y, d, b } (tile inside the entity, outward direction, box name)
export function fluidConns(e) {
  const p = PROTO[e.name]; if (!p.conns) return [];
  if (p.type === 'pipe-ug') { const d = e.mode === 'out' ? e.dir : (e.dir + 2) & 3; return [{ x: e.x, y: e.y, d, b: 'p' }]; }
  const n = p.w, out = [];
  for (const [cx, cy, cd, b] of p.conns) {
    let x = cx, y = cy, d = cd;
    for (let i = 0; i < (p.rot ? e.dir : 0); i++) { const t = x; x = n - 1 - y; y = t; d = (d + 1) & 3; }
    out.push({ x: e.x + x, y: e.y + y, d, b });
  }
  return out;
}
function connBack(n, x, y, d) {
  // the connection of entity n on tile (x,y) pointing in direction d, if any
  for (const c of fluidConns(n)) if (c.x === x && c.y === y && c.d === d) return c;
  return null;
}

// write segment contents back into the pass boxes (before a rebuild or a save)
export function syncFluids() {
  for (const s of G.fsegs || []) {
    if (!s.members.length) continue;
    for (const m of s.members) { const fb = m.e.fb[m.b]; fb.f = s.a > 0 ? s.f : null; fb.a = s.cap > 0 ? s.a * m.cap / s.cap : 0; }
  }
}

export function rebuildFluids() {
  syncFluids();
  G.fluidDirty = false;
  const nodes = new Map(), links = [];
  const node = (e, b) => { const k = e.id + ':' + b; let n = nodes.get(k); if (!n) { const p = PROTO[e.name]; n = { e, b, k: p.boxes[b].k, cap: p.boxes[b].cap, r: null }; n.r = n; nodes.set(k, n); } return n; };
  const ents = G.active.filter(e => !e.dead && e.fb);
  for (const e of ents) {
    if (e.type === 'pipe') e.mask = 0;
    e.fseg = {};
    for (const c of fluidConns(e)) {
      const n = entAt(c.x + DX[c.d], c.y + DY[c.d]);
      if (!n || !n.fb || n === e) continue;
      const back = connBack(n, c.x + DX[c.d], c.y + DY[c.d], (c.d + 2) & 3);
      if (!back) continue;
      if (e.type === 'pipe') e.mask |= 1 << c.d;
      if (e.id < n.id) links.push([node(e, c.b), node(n, back.b)]);
    }
    for (const b in e.fb) node(e, b);
    if (e.type === 'pipe-ug' && e.pairK && e.mode === 'in') { const o = G.ents.get(e.pairK); if (o && o.fb) links.push([node(e, 'p'), node(o, 'p')]); }
  }
  const find = n => { while (n.r !== n) { n.r = n.r.r; n = n.r; } return n; };
  for (const [a, b] of links) if (a.k === 'pass' && b.k === 'pass') find(a).r = find(b);
  const segs = new Map(), list = [];
  for (const n of nodes.values()) {
    if (n.k !== 'pass') continue;
    const r = find(n); let s = segs.get(r);
    if (!s) { s = { cap: 0, a: 0, f: null, members: [], ins: [], outs: [], tally: {} }; segs.set(r, s); list.push(s); }
    s.cap += n.cap; s.members.push(n);
    const fb = n.e.fb[n.b]; if (fb.f && fb.a > 0) s.tally[fb.f] = (s.tally[fb.f] || 0) + fb.a;
    n.e.fseg[n.b] = s;
  }
  for (const s of list) { let best = null; for (const f in s.tally) if (!best || s.tally[f] > s.tally[best]) best = f; s.f = best; s.a = best ? Math.min(s.cap, s.tally[best]) : 0; delete s.tally; }
  for (const [a, b] of links) {
    const ends = [[a, b], [b, a]];
    for (const [p, q] of ends) if (p.k === 'pass' && q.k !== 'pass') { const s = segs.get(find(p)); (q.k === 'in' ? s.ins : s.outs).push(q.e.fb[q.b]); }
    if (a.k !== 'pass' && b.k !== 'pass' && a.k !== b.k) {
      const vin = a.k === 'in' ? a : b, vout = a.k === 'out' ? a : b;
      list.push({ cap: 0, a: 0, f: null, members: [], ins: [vin.e.fb[vin.b]], outs: [vout.e.fb[vout.b]], virtual: true });
    }
  }
  G.fsegs = list;
}

export function fluidTick() {
  if (G.fluidDirty) rebuildFluids();
  for (const s of G.fsegs) {
    if (s.virtual) {
      const i = s.ins[0], o = s.outs[0];
      if (o.a > 0 && i.want === o.f && (!i.f || i.f === o.f || i.a <= 0)) { const mv = Math.min(o.a, i.cap - i.a); if (mv > 0) { i.f = o.f; i.a += mv; o.a -= mv; } }
      continue;
    }
    for (const o of s.outs) {
      if (o.a <= 0 || !o.f) continue;
      if (s.a <= 1e-6) { s.f = o.f; s.a = 0; }
      if (s.f !== o.f) continue;
      const mv = Math.min(o.a, s.cap - s.a); o.a -= mv; s.a += mv;
    }
    if (s.a > 0) for (const i of s.ins) {
      if (i.want !== s.f || (i.f && i.f !== s.f && i.a > 0)) continue;
      const mv = Math.min(s.a, i.cap - i.a); if (mv <= 0) continue;
      i.f = s.f; i.a += mv; s.a -= mv;
      if (s.a <= 0) break;
    }
    if (s.a < 1e-6) { s.a = 0; s.f = null; }
  }
}
// pull up to n units of fluid f from the segment that holds pass box b of entity e
export function drawFrom(e, b, f, n) {
  const s = e.fseg && e.fseg[b]; if (!s || s.f !== f || s.a <= 0) return 0;
  const mv = Math.min(n, s.a); s.a -= mv; if (s.a < 1e-6) { s.a = 0; s.f = null; } return mv;
}
export function segInfo(e) {
  const s = e.fseg && (e.fseg.p || e.fseg.t || e.fseg.s || e.fseg.w);
  return s ? { f: s.f, a: s.a, cap: s.cap } : null;
}
