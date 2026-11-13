// Save slots. Desktop build stores each slot as a file (via the preload bridge); browsers use localStorage.
import { G, newState } from './state.js';
import { registerEntity, pregen, placeEntity, addGhost } from './world.js';
import { key } from './util.js';
import { syncFluids } from './fluids.js';
import { botsToSave, restoreBots } from './robots.js';
import { ITEMS } from './data.js';

const fsb = window.slagFS || null;
const PRE = 'slagworks-slot-', INDEX = 'slagworks-slots', LEGACY = 'slagworks-save-v1';

const store = fsb ? {
  list: () => fsb.list() || [],
  read: id => fsb.read(id),
  write: (id, text, meta) => fsb.write(id, text, meta),
  remove: id => fsb.remove(id),
} : {
  list() { try { return JSON.parse(localStorage.getItem(INDEX)) || []; } catch { return []; } },
  read(id) { try { return localStorage.getItem(PRE + id); } catch { return null; } },
  write(id, text, meta) {
    try {
      localStorage.setItem(PRE + id, text);
      const l = this.list().filter(s => s.id !== id); l.push(meta);
      localStorage.setItem(INDEX, JSON.stringify(l));
      return true;
    } catch (e) { console.error(e); return false; }
  },
  remove(id) { try { localStorage.removeItem(PRE + id); localStorage.setItem(INDEX, JSON.stringify(this.list().filter(s => s.id !== id))); } catch { } },
};

// bring a save from the old single-slot format into the slot list, once
try {
  const old = localStorage.getItem(LEGACY);
  if (old) { const d = JSON.parse(old); if (store.write('legacy', old, { id: 'legacy', name: 'Earlier save', time: Date.now(), tick: d.tick || 0 })) localStorage.removeItem(LEGACY); }
} catch { }

export function listSaves() { return store.list().filter(s => s && s.id).sort((a, b) => b.time - a.time); }
export function hasSave() { return listSaves().length > 0; }
export function deleteSave(id) { store.remove(id); }

export function saveGame(id, name) {
  const data = {
    v: 1, seed: G.seed, ws: G.ws, tick: G.tick, peaceful: G.peaceful, player: G.player, research: G.research, evo: G.evo, kills: G.kills,
    nestKills: G.nestKills || 0, nextWave: G.nextWave, nextExpand: G.nextExpand || 0, won: G.won, nextId: G.nextId, built: G.built, crateId: G.crateId,
    removed: [...G.removed], resMod: [...G.resMod], ents: G.active.filter(e => !e.dead && !e.natural), units: G.units, trains: G.trains, bots: botsToSave(),
    decon: G.active.filter(e => e.decon && !e.dead).map(e => e.id),
    ghosts: G.ghosts.map(g => ({ name: g.name, x: g.x, y: g.y, dir: g.dir, set: g.set })),
    nests: G.nests.filter(n => !n.gen && !n.dead).map(n => ({ x: n.x, y: n.y, hp: n.hp })),
    chopped: G.chopped || [],
    regrown: G.regrown.filter(e => !e.dead).map(e => ({ x: e.x, y: e.y, v: e.v, born: e.born })),
  };
  syncFluids();
  let text;
  try { text = JSON.stringify(data, (k, v) => (k === 'net' || k === 'tgt' || k === 'fseg' || k === 'inbound' || k[0] === '_') ? undefined : v); } catch (e) { console.error(e); return false; }
  return !!store.write(id, text, { id, name, time: Date.now(), tick: G.tick });
}
export function loadGame(id) {
  let d;
  try { d = JSON.parse(store.read(id)); } catch { return false; }
  if (!d || d.v !== 1) return false;
  newState(d.seed, { peaceful: d.peaceful, ws: d.ws || 1 });
  Object.assign(G, { tick: d.tick, research: d.research, evo: d.evo, kills: d.kills, nestKills: d.nestKills, nextWave: d.nextWave, nextExpand: d.nextExpand, won: d.won, nextId: d.nextId, built: d.built || {}, crateId: d.crateId });
  Object.assign(G.player, d.player);
  G.removed = new Set(d.removed); G.resMod = new Map(d.resMod);
  G.chopped = d.chopped || [];
  for (const e of d.ents) registerEntity(e);
  // fluids used to be items in older saves; drop any that are still lying around
  const dropFluids = inv => { if (inv) for (let i = 0; i < inv.length; i++) if (inv[i] && ITEMS[inv[i].id] && ITEMS[inv[i].id].fluid) inv[i] = null; };
  dropFluids(G.player.inv); for (const e of d.ents) { dropFluids(e.inv); if (e.type === 'pumpjack') { delete e.out; if (!e.fb) e.fb = { o: { f: null, a: 0, cap: 200 } }; } if (e.inp && typeof e.inp === 'object' && !e.inp.id) delete e.inp['crude-oil']; }
  pregen(8);
  G.units = d.units || []; G.trains = d.trains || [];
  restoreBots(d.bots);
  for (const r of d.regrown || []) {
    if (G.ents.has(key(r.x, r.y))) continue;
    const e = placeEntity('tree', r.x, r.y, 0, true); e.v = r.v; e.born = r.born; G.regrown.push(e);
  }
  for (const n of d.nests || []) if (!G.ents.has(key(n.x, n.y))) placeEntity('nest', n.x, n.y, 0, true).hp = n.hp;
  for (const g of d.ghosts || []) addGhost(g.name, g.x, g.y, g.dir, g.set);
  G.beltVer++; G.powerDirty = true;
  return true;
}
