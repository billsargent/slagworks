// Player actions: movement, building, mining, hotkeys.
import { G, UI, invCount, invAdd, invRemove, pickup } from './state.js';
import { ITEMS, PROTO } from './data.js';
import { I } from './input.js';
import { cam, s2w } from './render.js';
import { key, clamp } from './util.js';
import { entAt, tileAt, canPlace, placeEntity, removeEntity, dims, resType, resAmt, setRes, refreshBelts, ORES, ghostAtTile, removeGhost } from './world.js';
import { entAccepts, giveTo, entContents, fx, treeGrowth, statP } from './sim.js';
import { sfx } from './audio.js';
import { openMap, closeMap } from './mapview.js';
import { markArea } from './robots.js';
import { placeTrain, addWagon, carAtPoint, trainOn, removeTrain, cycleRail } from './trains.js';
import { capture, rotateBp, planStates, placeBp, getSettings, applySettings } from './blueprint.js';
import { openWin, closeWin, toggleWin, selectHeld, toast, hooks } from './ui.js';

const REACH = 10, MINE_REACH = 3;   // building / opening machines vs. chopping and hand-mining
const GUI = new Set(['roboport', 'stop', 'arm', 'boiler', 'engine', 'tank', 'offshore', 'chest', 'furnace', 'drill', 'pumpjack', 'assembler', 'lab', 'generator', 'solar', 'accu', 'turret', 'silo', 'pole']);

function blocked(x, y) {
  for (const [ox, oy] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]]) {
    const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
    if (tileAt(tx, ty) < 2) return true;
    const e = entAt(tx, ty);
    if (e && e.type !== 'belt' && e.type !== 'rail') return true;
  }
  return false;
}
function inReach(x, y, r = REACH) { const pl = G.player; return Math.hypot(x + 0.5 - pl.x, y + 0.5 - pl.y) <= r; }

function ghost() {
  const it = UI.held && ITEMS[UI.held];
  if (!it || !it.place) return null;
  const p = PROTO[it.place], [w, h] = dims(p, UI.dir), [wx, wy] = s2w(I.mx, I.my);
  UI.gx = Math.floor(wx - (w - 1) / 2); UI.gy = Math.floor(wy - (h - 1) / 2);
  const pl = G.player, px = Math.floor(pl.x), py = Math.floor(pl.y);
  const onPlayer = p.type !== 'belt' && px >= UI.gx && px < UI.gx + w && py >= UI.gy && py < UI.gy + h;
  UI.gok = !onPlayer && inReach(UI.gx + (w - 1) / 2, UI.gy + (h - 1) / 2) && canPlace(p.id, UI.gx, UI.gy, UI.dir);
  return p;
}
function tryBuild(p) {
  const pl = G.player, x = UI.gx, y = UI.gy;
  if (!invCount(pl.inv, p.id)) { UI.held = null; return; }
  const ex = entAt(x, y);
  if (p.type === 'belt' && ex && ex.type === 'belt' && inReach(x, y)) {
    if (ex.dir === UI.dir && ex.name === p.id) return;
    if (ex.name !== p.id) { invRemove(pl.inv, p.id, 1); invAdd(pl.inv, ex.name, 1); ex.name = p.id; ex.speed = p.speed; }
    ex.dir = UI.dir; refreshBelts(x, y); sfx('build', 0.6); return;
  }
  if (!UI.gok) { if (I.lp) sfx('deny'); return; }
  const gh = ghostAtTile(x, y), ne = placeEntity(p.id, x, y, UI.dir);
  if (gh && gh.name === p.id && gh.x === x && gh.y === y) applySettings(ne, gh.set);
  invRemove(pl.inv, p.id, 1);
  G.built[p.id] = (G.built[p.id] || 0) + 1;
  sfx('build');
  if (!invCount(pl.inv, p.id)) UI.held = null;
}
// floating hint when the target is out of reach (throttled)
function tooFar(x, y) { const pl = G.player; if (G.tick - (pl.farT || -99) < 45) return; pl.farT = G.tick; fx({ k: 'text', x, y: y - 0.4, vx: 0, vy: -0.01, life: 40, txt: 'Too far — walk closer', col: '#ffb0a0' }); }
function mineEnt(e) {
  const pl = G.player;
  if (e.type === 'tree') { const w = Math.max(1, Math.round(4 * treeGrowth(e))); invAdd(pl.inv, 'wood', w); pickup('wood', w); statP('wood', w); fx({ k: 'text', x: e.x + 0.5, y: e.y, vx: 0, vy: -0.01, life: 50, txt: `+${w} Wood` }); removeEntity(e); sfx('mine'); return; }
  let lost = invAdd(pl.inv, e.name, 1); pickup(e.name, 1);
  for (const [id, n] of entContents(e)) { lost += invAdd(pl.inv, id, n); pickup(id, n); }
  if (lost) toast('Inventory full — some items were lost');
  if (UI.ent === e) closeWin();
  removeEntity(e); sfx('pick');
}

export function playerTick() {
  const pl = G.player;
  if (pl.dead) { pl.moving = false; pl.mineP = 0; return; }
  // movement
  let mx = UI.map ? 0 : I.moveX, my = UI.map ? 0 : I.moveY; const l = Math.hypot(mx, my);
  if (l > 0.1) {
    if (l > 1) { mx /= l; my /= l; }
    const sp = 0.145, stuck = blocked(pl.x, pl.y);   // if something was built on top of us, let us walk out
    if (stuck || !blocked(pl.x + mx * sp, pl.y)) pl.x += mx * sp;
    if (stuck || !blocked(pl.x, pl.y + my * sp)) pl.y += my * sp;
    if (pl.cd <= 0) pl.ang = Math.atan2(my, mx);
    pl.walk += 0.3; pl.moving = true;
  } else pl.moving = false;
  cam.x += (pl.x - cam.x) * 0.18; cam.y += (pl.y - cam.y) * 0.18;

  if (UI.map) { pl.mineP = 0; return; }
  const p = UI.bp || UI.sel ? null : ghost();
  if (I.lmb && !I.lp && !I.overUI && p && !I.shift) tryBuild(p);

  // mining
  const [wx, wy] = s2w(I.mx, I.my), tx = Math.floor(wx), ty = Math.floor(wy);
  const e = entAt(tx, ty), rt = resType(tx, ty);
  // right mouse mines anything; left mouse with an empty hand also gathers trees and ore
  const gather = I.lmb && !UI.held && !UI.bp && !UI.sel && !I.shift && (e ? e.type === 'tree' : rt && rt < 5);
  if (UI.sel || UI.bp || (I.rmb && I.shift)) { pl.mineP = 0; return; }
  if (I.rmb && !e && !I.overUI) { const g = ghostAtTile(tx, ty); if (g) { removeGhost(g); sfx('ui'); return; } }
  const car = I.rmb && !I.overUI ? carAtPoint(wx, wy) : null;
  if (car && Math.hypot(car.c.x - pl.x, car.c.y - pl.y) > REACH + 1) { tooFar(car.c.x, car.c.y); return; }
  if (car) {
    if (pl.mineK !== 'car') { pl.mineK = 'car'; pl.mineP = 0; }
    pl.mineP += 1 / 40; UI.tx = Math.floor(car.c.x); UI.ty = Math.floor(car.c.y);
    if (pl.mineP >= 1) { pl.mineP = 0; if (UI.train === car.t) closeWin(); if (removeTrain(car.t, pl.inv)) toast('Inventory full — some items were lost'); pickup('locomotive', 1); sfx('pick'); }
    return;
  }
  if ((I.rmb || gather) && !I.overUI) {
    const k = key(tx, ty);
    if (pl.mineK !== k) { pl.mineK = k; pl.mineP = 0; }
    let dur = 0;
    const harvest = e ? e.type === 'tree' : rt && rt < 5;
    if (inReach(tx, ty, harvest ? MINE_REACH : REACH)) { if (e) dur = e.type === 'nest' || (e.type === 'rail' && trainOn(tx, ty)) ? 0 : e.type === 'tree' ? 30 : 10; else if (rt && rt < 5) dur = 42; }
    else if (harvest || e) tooFar(tx + 0.5, ty + 0.5);
    if (dur) {
      pl.mineP += 1 / dur;
      if (!e && G.tick % 14 === 0) sfx('mine', 0.6);
      pl.ang = Math.atan2(ty + 0.5 - pl.y, tx + 0.5 - pl.x);
      if (pl.mineP >= 1) {
        pl.mineP = 0;
        if (e) mineEnt(e);
        else { setRes(tx, ty, resAmt(tx, ty) - 1); invAdd(pl.inv, ORES[rt], 1); statP(ORES[rt], 1); pickup(ORES[rt], 1); sfx('pick', 0.6); fx({ k: 'text', x: tx + 0.5, y: ty, vx: 0, vy: -0.01, life: 40, txt: '+1 ' + ITEMS[ORES[rt]].name }); }
      }
    } else pl.mineP = 0;
  } else { pl.mineP = 0; pl.mineK = null; }
}

export function playerFrame() {
  const pl = G.player, [wx, wy] = s2w(I.mx, I.my), tx = Math.floor(wx), ty = Math.floor(wy);
  UI.tx = tx; UI.ty = ty; UI.hover = I.overUI ? null : (entAt(tx, ty) || null);
  UI.hoverCar = I.overUI || UI.map ? null : carAtPoint(wx, wy);
  if (UI.hoverCar) UI.hover = null;
  if (I.wheel && !I.overUI && !UI.map) cam.zoom = clamp(cam.zoom * Math.pow(1.12, -I.wheel), 0.35, 3.2);
  const paused = UI.win === 'pause';
  for (const k of I.pressed) {
    if (k === 'KeyM' && !paused) { if (UI.map) closeMap(); else openMap(); continue; }
    if (k === 'Escape' && UI.map && !UI.win) { closeMap(); continue; }
    if (UI.map && k !== 'Escape') continue;
    if (k === 'Escape' && !UI.win && (UI.sel || UI.bp)) { UI.sel = null; UI.bp = null; continue; }
    if (k === 'Escape') { if (UI.win) closeWin(); else if (UI.held) UI.held = null; else { UI.sub = ''; openWin('pause'); } continue; }
    if (paused) continue;
    if (k === 'Ctrl+KeyC') { startSelect('bp'); continue; }
    if (k === 'Ctrl+KeyX') { startSelect('decon'); continue; }
    if (k === 'Ctrl+KeyV') { if (UI.lastBp) holdBlueprint(JSON.parse(JSON.stringify(UI.lastBp))); else toast('Nothing copied yet — Ctrl+C and drag over buildings first'); continue; }
    if (k === 'KeyB') { toggleWin('bp'); continue; }
    if (k === 'KeyE') toggleWin('inv');
    else if (k === 'KeyT') toggleWin('tech');
    else if (k === 'KeyP') toggleWin('stats');
    else if (k === 'AltLeft') UI.alt = !UI.alt;
    else if (k === 'F5') hooks.save('quick');
    else if (k === 'F9') hooks.load();
    else if (k === 'KeyR') {
      const h = UI.hover;
      if (UI.bp) { rotateBp(UI.bp); sfx('ui'); }
      else if (UI.held && (ITEMS[UI.held].place || ITEMS[UI.held].vehicle)) UI.dir = (UI.dir + (I.shift ? 3 : 1)) & 3;
      else if (h && h.type === 'rail') { if (trainOn(h.x, h.y)) sfx('deny'); else { cycleRail(h); sfx('ui'); } }
      else if (h && PROTO[h.name].rot && h.type !== 'ubelt' && h.type !== 'splitter' && h.type !== 'pipe-ug' && h.type !== 'offshore') { h.dir = (h.dir + 1) & 3; if (h.fb) G.fluidDirty = true; if (h.type === 'signal') G.railVer = (G.railVer || 0) + 1; if (h.type === 'belt') refreshBelts(h.x, h.y); if (h.type === 'drill') h.rx = null; sfx('ui'); }
    }
    else if (k === 'KeyQ') {
      const h = UI.hover;
      if (UI.bp || UI.sel) { UI.bp = null; UI.sel = null; }
      else if (UI.held) UI.held = null;
      else if (h && !h.natural && invCount(pl.inv, h.name)) { UI.held = h.name; UI.dir = h.dir; }
    }
    else if (k === 'HotNext' || k === 'HotPrev') {
      const ids = pl.hotbar.filter(id => id && invCount(pl.inv, id)); if (!ids.length) continue;
      let i = ids.indexOf(UI.held); i = k === 'HotNext' ? i + 1 : i - 1;
      UI.held = i >= ids.length || i < -1 ? null : i < 0 ? (UI.held ? null : ids[ids.length - 1]) : ids[i];
    }
    else if (k.startsWith('Digit')) { const i = (+k.slice(5) + 9) % 10, id = pl.hotbar[i]; if (id) selectHeld(id); }
  }
  if (!paused && !UI.map && selectFrame(tx, ty)) return;
  if (!paused && !UI.map && UI.bp) { bpFrame(); return; }
  if (I.rp && I.shift && !I.overUI && !paused && UI.hover && !UI.hover.natural) {
    const s = getSettings(UI.hover); if (Object.keys(s).length) { UI.copied = { type: UI.hover.type, s }; toast('Settings copied from ' + PROTO[UI.hover.name].name); sfx('ui'); }
  }
  if (I.lp && I.shift && !I.overUI && !paused && UI.hover && UI.copied) {
    if (UI.hover.type === UI.copied.type && applySettings(UI.hover, UI.copied.s)) { sfx('build', 0.5); fx({ k: 'text', x: tx + 0.5, y: ty, vx: 0, vy: -0.01, life: 45, txt: 'Settings pasted' }); }
    return;
  }
  if (I.lp && !I.overUI && !paused && !UI.map) {
    const e = UI.hover, placing = UI.held && ITEMS[UI.held].place, veh = UI.held && ITEMS[UI.held].vehicle;
    if (veh) {
      if (veh === 'locomotive') { const r = placeTrain(tx, ty, UI.dir); if (typeof r === 'string') { toast(r); sfx('deny'); } else { invRemove(pl.inv, 'locomotive', 1); G.built.locomotive = 1; sfx('build'); } }
      else { const c = carAtPoint(wx, wy); if (!c) { toast('Click an existing train to attach the wagon'); sfx('deny'); } else { const err = addWagon(c.t); if (err) { toast(err); sfx('deny'); } else { invRemove(pl.inv, 'cargo-wagon', 1); sfx('build'); } } }
      return;
    }
    if (!placing) { const c = carAtPoint(wx, wy); if (c) { if (UI.held && ITEMS[UI.held].fuel && c.c.loco) { const ld = c.t.cars[0], id = UI.held; if (!ld.fuel || ld.fuel.id === id) { const n = Math.min(invCount(pl.inv, id), ITEMS[id].stack - (ld.fuel ? ld.fuel.n : 0)); if (n > 0) { ld.fuel = { id, n: (ld.fuel ? ld.fuel.n : 0) + n }; invRemove(pl.inv, id, n); sfx('pick'); } } } else { UI.train = c.t; openWin('train'); } return; } }
    if (placing) { const gp = ghost(); if (gp) tryBuild(gp); }
    if (!placing && e && !e.natural && inReach(tx, ty)) {
      if (UI.held && entAccepts(e, UI.held, true)) {
        const k = giveTo(e, UI.held, Math.min(invCount(pl.inv, UI.held), ITEMS[UI.held].stack));
        invRemove(pl.inv, UI.held, k); sfx('pick');
        fx({ k: 'text', x: tx + 0.5, y: ty, vx: 0, vy: -0.01, life: 45, txt: `-${k} ${ITEMS[UI.held].name}` });
      } else if (GUI.has(e.type)) openWin('ent', e);
    }
  }
}

// ---------------------------------------------------------------- selection + blueprints
export function startSelect(mode) { UI.sel = { mode, active: false }; UI.bp = null; UI.held = null; if (UI.win && UI.win !== 'pause') closeWin(); toast(mode === 'bp' ? 'Drag over buildings to copy them into a blueprint (right-click cancels)' : mode === 'decon' ? 'Drag over buildings to mark them for removal by robots' : 'Drag to cancel marked removals'); }
export function holdBlueprint(bp) { UI.bp = bp; UI.held = null; UI.sel = null; if (UI.win && UI.win !== 'pause') closeWin(); }
function selectFrame(tx, ty) {
  const s = UI.sel; if (!s) return false;
  if (I.rp && !I.overUI) { UI.sel = null; return true; }
  if (I.lp && !I.overUI) { s.active = true; s.x0 = s.x1 = tx; s.y0 = s.y1 = ty; }
  if (s.active) {
    s.x1 = tx; s.y1 = ty;
    if (!I.lmb) {
      UI.sel = null;
      if (s.mode === 'bp') {
        const bp = capture(s.x0, s.y0, s.x1, s.y1);
        if (!bp) toast('No buildings in that area'); else { UI.lastBp = JSON.parse(JSON.stringify(bp)); holdBlueprint(bp); toast(`Blueprint with ${bp.ents.length} buildings — click to place, R to rotate, B to save it`); }
      } else if (HOOK.area) HOOK.area(s);
    }
  }
  return true;
}
export const HOOK = { area: s => { const n = markArea(s, s.mode === 'decon'); toast(s.mode === 'decon' ? `${n} marked for removal by construction robots` : `${n} removal marks cancelled`); } };
function bpFrame() {
  const bp = UI.bp, [wx, wy] = s2w(I.mx, I.my);
  UI.bpx = Math.floor(wx - (bp.w - 1) / 2); UI.bpy = Math.floor(wy - (bp.h - 1) / 2);
  UI.bpStates = planStates(bp, UI.bpx, UI.bpy);
  if (I.rp && !I.overUI) { UI.bp = null; return; }
  if (I.lp && !I.overUI) {
    const r = placeBp(bp, UI.bpx, UI.bpy);
    if (r.built) sfx('build');
    const parts = [];
    if (r.built) parts.push(`${r.built} built`);
    if (r.ghosts) parts.push(`${r.ghosts} planned (no items — robots or you can build them)`);
    if (r.blocked) parts.push(`${r.blocked} blocked`);
    toast(parts.join(' · ') || 'Nothing placed');
  }
}
