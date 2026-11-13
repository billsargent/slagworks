// Blueprints (capture / rotate / place / library) and entity settings copy-paste.
import { G, UI, invCount, invRemove, invAdd } from './state.js';
import { PROTO, RECIPES, ITEMS } from './data.js';
import { DX, DY } from './util.js';
import { entAt, dims, canPlace, placeEntity, addGhost } from './world.js';
import { setRecipe } from './sim.js';
import { kvGet, kvSet } from './kv.js';

// ---------------------------------------------------------------- settings
export function getSettings(e) {
  const s = {};
  if (e.recipe !== undefined) s.recipe = e.recipe;
  if (e.type === 'arm') s.filter = e.filter || null;
  if (e.type === 'chest') s.limit = e.limit ?? null;
  if (e.type === 'stop') s.stopName = e.stopName;
  if (e.logi === 'requester') s.req = JSON.parse(JSON.stringify(e.req || []));
  return s;
}
export function applySettings(e, s) {
  if (!s) return false;
  let ok = false;
  if (s.recipe !== undefined && e.type === 'assembler') {
    const r = s.recipe && RECIPES[s.recipe], p = PROTO[e.name];
    if (!s.recipe || (r && p.cats.includes(r.cat))) { if (e.recipe !== s.recipe) setRecipe(e, s.recipe); ok = true; }
  }
  if ('filter' in s && e.type === 'arm') { e.filter = s.filter; ok = true; }
  if ('limit' in s && e.type === 'chest') { e.limit = s.limit; ok = true; }
  if ('stopName' in s && e.type === 'stop') { e.stopName = s.stopName; ok = true; }
  if ('req' in s && e.logi === 'requester') { e.req = JSON.parse(JSON.stringify(s.req)); ok = true; }
  return ok;
}

// ---------------------------------------------------------------- capture / rotate
export function capture(x0, y0, x1, y1) {
  const ax = Math.min(x0, x1), ay = Math.min(y0, y1), bx = Math.max(x0, x1), by = Math.max(y0, y1);
  const seen = new Set(), list = [];
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    const e = entAt(x, y);
    if (!e || e.natural || seen.has(e) || !ITEMS[e.name]) continue;
    seen.add(e); list.push(e);
  }
  for (const g of G.ghosts || []) if (g.x >= ax && g.x <= bx && g.y >= ay && g.y <= by) list.push({ name: g.name, x: g.x, y: g.y, dir: g.dir, _set: g.set, ghost: true });
  if (!list.length) return null;
  let mx = 1e9, my = 1e9, Mx = -1e9, My = -1e9;
  for (const e of list) { const [w, h] = dims(PROTO[e.name], e.dir); mx = Math.min(mx, e.x); my = Math.min(my, e.y); Mx = Math.max(Mx, e.x + w); My = Math.max(My, e.y + h); }
  return {
    name: 'Blueprint', w: Mx - mx, h: My - my,
    ents: list.map(e => ({ n: e.name, x: e.x - mx, y: e.y - my, d: e.dir | 0, m: e.mode, s: e.ghost ? e._set : getSettings(e) })),
  };
}
export function rotateBp(bp) {
  for (const t of bp.ents) {
    const p = PROTO[t.n], [w, h] = dims(p, t.d), nx = bp.h - (t.y + h), ny = t.x;
    t.x = nx; t.y = ny; t.d = (t.d + 1) & 3;
  }
  [bp.w, bp.h] = [bp.h, bp.w];
}
export function bpCounts(bp) {
  const c = {}; for (const t of bp.ents) c[t.n] = (c[t.n] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}

// state of each entry when stamped at (gx, gy): 'ok' buildable, 'ghost' no item (placed as ghost), 'bad' blocked
export function planStates(bp, gx, gy) {
  const have = {}, out = [];
  for (const t of bp.ents) {
    const x = gx + t.x, y = gy + t.y;
    if (!canPlace(t.n, x, y, t.d)) { out.push('bad'); continue; }
    have[t.n] = have[t.n] ?? invCount(G.player.inv, t.n);
    if (have[t.n] > 0) { have[t.n]--; out.push('ok'); } else out.push('ghost');
  }
  return out;
}
const ORDERED = new Set(['ubelt', 'pipe-ug']);
export function placeBp(bp, gx, gy) {
  const st = planStates(bp, gx, gy);
  const idx = bp.ents.map((t, i) => i);
  const proj = t => t.x * DX[t.d] + t.y * DY[t.d];
  idx.sort((a, b) => {
    const A = bp.ents[a], B = bp.ents[b], oa = ORDERED.has(PROTO[A.n].type), ob = ORDERED.has(PROTO[B.n].type);
    if (oa !== ob) return oa ? 1 : -1;
    if (oa) return A.d - B.d || proj(A) - proj(B);
    return 0;
  });
  let built = 0, ghosts = 0, blocked = 0;
  for (const i of idx) {
    const t = bp.ents[i], x = gx + t.x, y = gy + t.y;
    if (st[i] === 'bad' || !canPlace(t.n, x, y, t.d)) { blocked++; continue; }
    if (st[i] === 'ok' && invCount(G.player.inv, t.n) > 0) {
      const e = placeEntity(t.n, x, y, t.d);
      invRemove(G.player.inv, t.n, 1); G.built[t.n] = (G.built[t.n] || 0) + 1;
      applySettings(e, t.s); built++;
    } else { addGhost(t.n, x, y, t.d, t.s); ghosts++; }
  }
  return { built, ghosts, blocked };
}

// ---------------------------------------------------------------- library (shared by all saves)
const LIB = 'slagworks-blueprints';
export function libList() { try { return JSON.parse(kvGet(LIB)) || []; } catch { return []; } }
function libWrite(l) { return kvSet(LIB, JSON.stringify(l)); }
export function libAdd(bp) {
  const l = libList(), copy = JSON.parse(JSON.stringify(bp));
  copy.id = 'b' + Date.now().toString(36) + ((Math.random() * 1e4) | 0);
  if (!copy.name || copy.name === 'Blueprint') copy.name = 'Blueprint ' + (l.length + 1);
  l.unshift(copy); libWrite(l); return copy;
}
export function libRemove(id) { libWrite(libList().filter(b => b.id !== id)); }
export function libRename(id, name) { const l = libList(), b = l.find(x => x.id === id); if (b) { b.name = name.slice(0, 40) || b.name; libWrite(l); } }
export function libGet(id) { const b = libList().find(x => x.id === id); return b && JSON.parse(JSON.stringify(b)); }

// text form for sharing: "SW1" + base64(JSON)
export function bpToText(bp) { const b = { name: bp.name, w: bp.w, h: bp.h, ents: bp.ents }; return 'SW1' + btoa(unescape(encodeURIComponent(JSON.stringify(b)))); }
export function bpFromText(t) {
  try {
    t = t.trim(); if (!t.startsWith('SW1')) return null;
    const b = JSON.parse(decodeURIComponent(escape(atob(t.slice(3)))));
    if (!Array.isArray(b.ents) || !b.ents.every(e => PROTO[e.n] && ITEMS[e.n])) return null;
    return b;
  } catch { return null; }
}
