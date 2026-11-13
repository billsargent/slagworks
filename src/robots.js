// Roboports, construction robots (build ghosts, remove marked buildings) and logistic robots (feed requester chests).
import { G, invAdd, invRemove, invCount, invFits, msg } from './state.js';
import { PROTO, ITEMS } from './data.js';
import { key } from './util.js';
import { entAt, placeEntity, removeEntity, canPlace, dims, removeGhost } from './world.js';
import { applySettings } from './blueprint.js';
import { entContents } from './sim.js';

const SPEED = 0.13, CAP = { construction: 1, logistic: 5 };
export const byId = id => G.byId && G.byId.get(id);

let portCache = null, portTick = -1;
function ports() { if (portTick !== G.tick || !portCache) { portCache = G.active.filter(e => e.type === 'roboport' && !e.dead); portTick = G.tick; } return portCache; }
const inArea = (e, x, y, r) => { const p = PROTO[e.name]; return x >= e.x - r && x < e.x + p.w + r && y >= e.y - r && y < e.y + p.h + r; };
function chestsFor(port) {
  const r = PROTO[port.name].logi, out = [];
  for (const e of G.active) if (e.type === 'chest' && e.logi && !e.dead && inArea(port, e.x, e.y, r)) out.push(e);
  return out;
}
function takeFrom(chest, id, n) { return invRemove(chest.inv, id, n); }
function findSource(chests, id, exclude) {
  // storage and provider chests (and passive buffers) can supply items
  let best = null;
  for (const c of chests) if (c !== exclude && (c.logi === 'storage' || c.logi === 'provider') && invCount(c.inv, id) > 0) { best = c; if (c.logi === 'provider') break; }
  return best;
}
function findStorage(chests, id) {
  let any = null;
  for (const c of chests) if (c.logi === 'storage' && invFits(c.inv, id)) { if (invCount(c.inv, id)) return c; any = any || c; }
  return any;
}
function launch(port, kind, task) {
  if (!(port.robots[kind] > 0)) return false;
  port.robots[kind]--;
  const p = PROTO[port.name];
  G.bots.push({ id: G.nextId++, kind, home: port.id, x: port.x + p.w / 2, y: port.y + p.h / 2, phase: 0, ...task });
  return true;
}

function assign() {
  const P = ports(); if (!P.length) return;
  const ghostsBusy = new Set(G.bots.filter(b => b.type === 'build').map(b => b.gk)), deconBusy = new Set(G.bots.filter(b => b.type === 'decon').map(b => b.eid));
  for (const port of P) {
    const pp = PROTO[port.name];
    if (port.lowPower) continue;
    const chests = chestsFor(port);
    // construction: ghosts first, then deconstruction
    if (port.robots.construction > 0) {
      for (const g of G.ghosts) {
        if (port.robots.construction <= 0) break;
        const gk = key(g.x, g.y);
        if (ghostsBusy.has(gk) || !inArea(port, g.x, g.y, pp.cons)) continue;
        const src = findSource(chests, g.name, null);
        if (!src) { g.noItem = true; continue; }
        g.noItem = false;
        takeFrom(src, g.name, 1);
        if (launch(port, 'construction', { type: 'build', gk, gx: g.x, gy: g.y, item: g.name, n: 1, src: src.id, tx: src.x + 0.5, ty: src.y + 0.5 })) ghostsBusy.add(gk);
      }
      for (const e of G.active) {
        if (port.robots.construction <= 0) break;
        if (!e.decon || e.dead || deconBusy.has(e.id) || !inArea(port, e.x, e.y, pp.cons)) continue;
        if (launch(port, 'construction', { type: 'decon', eid: e.id, tx: e.x + PROTO[e.name].w / 2, ty: e.y + PROTO[e.name].h / 2 })) deconBusy.add(e.id);
      }
      for (const t of G.deconTrees || []) {
        if (port.robots.construction <= 0) break;
        if (t.dead || deconBusy.has(t.id) || !inArea(port, t.x, t.y, pp.cons)) continue;
        if (launch(port, 'construction', { type: 'decon', eid: t.id, tree: { x: t.x, y: t.y }, tx: t.x + 0.5, ty: t.y + 0.5 })) deconBusy.add(t.id);
      }
    }
    // logistics: fill requester chests
    if (port.robots.logistic > 0) for (const c of chests) {
      if (c.logi !== 'requester' || !c.req) continue;
      c.inbound = c.inbound || {};
      for (const r of c.req) {
        if (!r.id || port.robots.logistic <= 0) continue;
        const have = invCount(c.inv, r.id) + (c.inbound[r.id] || 0), need = r.n - have;
        if (need <= 0 || !invFits(c.inv, r.id)) continue;
        const src = findSource(chests, r.id, c); if (!src) continue;
        const n = takeFrom(src, r.id, Math.min(need, CAP.logistic));
        if (!n) continue;
        if (launch(port, 'logistic', { type: 'deliver', item: r.id, n, src: src.id, dst: c.id, tx: src.x + 0.5, ty: src.y + 0.5 })) c.inbound[r.id] = (c.inbound[r.id] || 0) + n;
        else invAdd(src.inv, r.id, n);
      }
    }
  }
}

function goHome(b) { const h = byId(b.home); if (!h || h.dead) { const P = ports(); if (!P.length) { b.lost = true; return; } b.home = P[0].id; } const p = byId(b.home), pp = PROTO[p.name]; b.phase = 9; b.tx = p.x + pp.w / 2; b.ty = p.y + pp.h / 2; }
function stash(b) {
  // drop whatever the robot carries into storage, or back into the source chest
  if (!b.item || !b.n) return;
  const port = byId(b.home), chests = port ? chestsFor(port) : [];
  const st = findStorage(chests, b.item) || byId(b.src);
  if (st && st.inv) b.n = invAdd(st.inv, b.item, b.n);
  if (b.n > 0) { const pl = G.player; b.n = invAdd(pl.inv, b.item, b.n); }
  b.item = null; b.n = 0;
}
function arrive(b) {
  if (b.phase === 9) { const h = byId(b.home); if (h && !h.dead) h.robots[b.kind]++; b.done = true; return; }
  if (b.type === 'build') {
    if (b.phase === 0) { b.phase = 1; b.tx = b.gx + 0.5; b.ty = b.gy + 0.5; return; }
    const g = G.ghostAt.get(b.gk);
    if (g && g.x === b.gx && g.y === b.gy && g.name === b.item) {
      const [w, h] = dims(PROTO[g.name], g.dir);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const t = entAt(g.x + i, g.y + j); if (t && t.type === 'tree') removeEntity(t); }
      if (canPlace(g.name, g.x, g.y, g.dir)) {
        const set = g.set, e = placeEntity(g.name, g.x, g.y, g.dir); applySettings(e, set); G.built[g.name] = (G.built[g.name] || 0) + 1;
        b.item = null; b.n = 0;
      }
    }
    stash(b); goHome(b); return;
  }
  if (b.type === 'decon') {
    const e = byId(b.eid);
    if (e && !e.dead) {
      if (e.type === 'tree') { removeEntity(e); b.item = 'wood'; b.n = 4; }
      else {
        const port = byId(b.home), chests = port ? chestsFor(port) : [];
        for (const [id, n] of entContents(e)) { let left = n; const st = findStorage(chests, id); if (st) left = invAdd(st.inv, id, left); if (left) invAdd(G.player.inv, id, left); }
        if (e.type === 'roboport') for (const k in e.robots) if (e.robots[k]) invAdd(G.player.inv, k + '-robot', e.robots[k]);
        b.item = e.name; b.n = 1; removeEntity(e);
      }
    }
    stash(b); goHome(b); return;
  }
  if (b.type === 'deliver') {
    if (b.phase === 0) { const d = byId(b.dst); if (!d || d.dead) { stash(b); goHome(b); return; } b.phase = 1; b.tx = d.x + 0.5; b.ty = d.y + 0.5; return; }
    const d = byId(b.dst);
    if (d && !d.dead) { if (d.inbound) d.inbound[b.item] = Math.max(0, (d.inbound[b.item] || 0) - b.n); b.n = invAdd(d.inv, b.item, b.n); if (!b.n) b.item = null; }
    stash(b); goHome(b);
  }
}

export function robotTick() {
  if (!G.bots) G.bots = [];
  for (const p of ports()) {
    const s = p.net ? p.net.sat : 0;
    p.net && (p.net.demand += 50 + 25 * G.bots.filter(b => b.home === p.id).length);
    p.lowPower = s < 0.5; p.sat = s;
  }
  if (G.tick % 20 === 0) assign();
  let dead = false;
  for (const b of G.bots) {
    const h = byId(b.home), sp = SPEED * (h && !h.dead ? Math.max(0.25, h.sat || 0) : 0.5);
    const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
    if (d <= sp) { b.x = b.tx; b.y = b.ty; arrive(b); if (b.done || b.lost) dead = true; }
    else { b.x += dx / d * sp; b.y += dy / d * sp; b.ang = Math.atan2(dy, dx); }
  }
  if (dead) G.bots = G.bots.filter(b => !b.done && !b.lost);
}
// ---- deconstruction marks
export function markArea(s, on) {
  const ax = Math.min(s.x0, s.x1), ay = Math.min(s.y0, s.y1), bx = Math.max(s.x0, s.x1), by = Math.max(s.y0, s.y1);
  let n = 0;
  G.deconTrees = G.deconTrees || [];
  const seen = new Set();
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    const e = entAt(x, y); if (!e || seen.has(e) || e.type === 'nest') continue; seen.add(e);
    if (e.type === 'tree') { if (on && !e.decon) { e.decon = true; G.deconTrees.push(e); n++; } else if (!on && e.decon) { e.decon = false; n++; } }
    else if (!e.natural && e.decon !== on) { e.decon = on; n++; }
  }
  if (!on) G.deconTrees = G.deconTrees.filter(t => t.decon && !t.dead);
  if (on) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) { const g = G.ghostAt.get(key(x, y)); if (g) removeGhost(g); }
  return n;
}
export function robotStats(port) {
  const flying = G.bots.filter(b => b.home === port.id);
  return { flying: flying.length, ghosts: G.ghosts.filter(g => inArea(port, g.x, g.y, PROTO[port.name].cons)).length, missing: G.ghosts.filter(g => g.noItem && inArea(port, g.x, g.y, PROTO[port.name].cons)).length };
}
export function botsToSave() {
  // flying robots are saved as if they were already home; their cargo goes back where it came from
  return G.bots.map(b => ({ kind: b.kind, home: b.home, item: b.item, n: b.n, src: b.src, dst: b.dst, type: b.type, gk: b.gk }));
}
export function restoreBots(list) {
  G.bots = [];
  for (const b of list || []) {
    const h = byId(b.home); if (h && h.robots) h.robots[b.kind]++;
    if (b.item && b.n) { const s = byId(b.src) || byId(b.dst); if (s && s.inv) invAdd(s.inv, b.item, b.n); else invAdd(G.player.inv, b.item, b.n); }
  }
}
