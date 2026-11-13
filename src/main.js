import { G, UI, newState, invAdd } from './state.js';
import { generateSprites } from './sprites.js';
import { initRender, render, cam } from './render.js';
import { initInput, pollInput, endFrame, I } from './input.js';
import { initUI, uiFrame, renderMenu, closeWin, toast, hooks } from './ui.js';
import { playerTick, playerFrame } from './player.js';
import { simTick } from './sim.js';
import { pregen, entAt, removeEntity, canPlace, placeEntity } from './world.js';
import { applyUiScale } from './settings.js';
import { mapFrame, closeMap } from './mapview.js';
import { saveGame, loadGame, hasSave, listSaves, deleteSave } from './save.js';

const canvas = document.getElementById('game');
const STEP = 1000 / 60;
let lastT = 0, acc = 0, lastSave = 0;

function enter() { closeMap(); UI.menu = false; UI.held = null; UI.sub = ''; closeWin(); cam.x = G.player.x; cam.y = G.player.y; renderMenu(); lastSave = performance.now(); }
hooks.hasSave = hasSave;
hooks.newGame = (seed, opts) => {
  newState(seed, opts); pregen(8);
  const inv = G.player.inv;
  invAdd(inv, 'burner-drill', 1); invAdd(inv, 'stone-furnace', 1); invAdd(inv, 'iron-plate', 8); invAdd(inv, 'ammo', 5);
  // supply crate beside the landing site
  for (const [x, y] of [[2, -1], [3, -1], [-3, -1], [2, 2], [-2, 2]]) {
    const t = entAt(x, y); if (t && t.natural) removeEntity(t);
    if (!canPlace('iron-chest', x, y, 0)) continue;
    const c = placeEntity('iron-chest', x, y, 0);
    for (const [id, n] of [['burner-drill', 2], ['stone-furnace', 3], ['iron-plate', 30], ['wood', 20], ['coal', 20], ['ammo', 10], ['wood-chest', 4]]) invAdd(c.inv, id, n);
    G.crateId = c.id; break;
  }
  enter(); toast('Landing site secured. Follow the objective in the top-left.');
};
hooks.list = listSaves;
hooks.del = deleteSave;
// id: existing slot to overwrite, 'quick', or empty for a brand-new slot
hooks.save = id => {
  const l = listSaves(); let name;
  if (id === 'quick') name = 'Quick save';
  else if (!id) { let n = 0; for (const s of l) { const m = /^Save (\d+)$/.exec(s.name); if (m) n = Math.max(n, +m[1]); } id = 's' + Date.now(); name = 'Save ' + (n + 1); }
  else name = (l.find(s => s.id === id) || {}).name || 'Save';
  toast(saveGame(id, name) ? 'Saved: ' + name : 'Save failed (storage full?)');
};
// no id: load the most recent save of any kind
hooks.load = id => {
  const l = listSaves(), s = id ? l.find(x => x.id === id) : l[0];
  if (s && loadGame(s.id)) { enter(); toast('Loaded: ' + s.name); } else toast('No saved game found');
};
const autosave = () => saveGame('auto', 'Autosave');
hooks.quit = () => { closeMap(); autosave(); UI.menu = true; UI.sub = ''; closeWin(); renderMenu(); };

function frame(ts) {
  const dt = Math.min(100, ts - lastT); lastT = ts;
  pollInput(dt / 1000);
  if (!UI.menu) {
    const paused = UI.win === 'pause';
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 4) { if (!paused) { playerTick(); simTick(); } acc -= STEP; n++; }
    if (acc > STEP * 4) acc = 0;
    playerFrame();
    if (UI.map) mapFrame(dt / 1000); else render();
    if (ts - lastSave > 180000) { lastSave = ts; if (autosave()) toast('Autosaved'); }
  }
  uiFrame();
  endFrame();
  requestAnimationFrame(frame);
}

function boot() {
  applyUiScale();
  generateSprites();
  initRender(canvas); initInput(canvas); initUI();
  document.getElementById('loading').remove();
  addEventListener('beforeunload', () => { if (!UI.menu && G.player) autosave(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  window.__game = { G, UI, cam, I };   // debugging handle
  requestAnimationFrame(frame);
}
setTimeout(boot, 30);
