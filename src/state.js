import { ITEMS } from './data.js';
import { clamp } from './util.js';

export const G = {};
// UI state shared between input, renderer and DOM UI
export const UI = { held: null, dir: 0, win: null, ent: null, tab: 'log', alt: true, hover: null, tx: 0, ty: 0, gx: 0, gy: 0, gok: false, menu: true };
export const DAY_LEN = 60 * 60 * 7;

export function invNew(n) { return new Array(n).fill(null); }
export function invCount(inv, id) { let c = 0; for (const s of inv) if (s && s.id === id) c += s.n; return c; }
export function invAdd(inv, id, n) {
  const st = ITEMS[id].stack;
  for (const s of inv) { if (n <= 0) break; if (s && s.id === id && s.n < st) { const k = Math.min(n, st - s.n); s.n += k; n -= k; } }
  for (let i = 0; i < inv.length && n > 0; i++) if (!inv[i]) { const k = Math.min(n, st); inv[i] = { id, n: k }; n -= k; }
  return n;
}
export function invRemove(inv, id, n) {
  let r = 0;
  for (let i = inv.length - 1; i >= 0 && n > 0; i--) {
    const s = inv[i];
    if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; r += k; if (!s.n) inv[i] = null; }
  }
  return r;
}
export function invFits(inv, id) {
  const st = ITEMS[id].stack;
  for (const s of inv) if (!s || (s.id === id && s.n < st)) return true;
  return false;
}
export function daylight() { return clamp(0.5 + 0.95 * Math.cos(2 * Math.PI * (G.tick % DAY_LEN) / DAY_LEN), 0, 1); }

export function newState(seed, opts = {}) {
  for (const k of Object.keys(G)) delete G[k];
  Object.assign(G, {
    seed: seed | 0, ws: opts.ws || 1, tick: 0, chunks: new Map(), ents: new Map(), active: [], units: [], fx: [], nets: [], wires: [],
    powerDirty: true, fluidDirty: true, fsegs: [], beltVer: 1, nests: [], removed: new Set(), resMod: new Map(), peaceful: !!opts.peaceful,
    player: { x: 0.5, y: 0.5, hp: 100, inv: invNew(60), hotbar: new Array(10).fill(null), seen: {}, queue: [], ang: Math.PI / 2, walk: 0, rounds: 0, cd: 0, mineP: 0, mineK: null },
    research: { done: {}, current: null, progress: 0 },
    stats: { cur: { p: {}, c: {} }, hist: [] }, chopped: [], proj: [], trains: [], bots: [], byId: new Map(), regrown: [], ghosts: [], ghostAt: new Map(), evo: 0, kills: 0, nextWave: 60 * 60 * 12, won: false, nextId: 1, msgs: [], built: {}, launch: null,
  });
}
export function msg(t) { G.msgs.push(t); }
// on-screen "+N item" feed shown above the hotbar
export function pickup(id, n) {
  const f = UI.feed || (UI.feed = []), e = f.find(x => x.id === id), t = performance.now();
  if (e) { e.n += n; e.t = t; } else f.push({ id, n, t });
}
