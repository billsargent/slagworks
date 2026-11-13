// DOM user interface: HUD, windows, tooltips, menus, minimap.
import { G, UI, invCount, invAdd, invRemove, daylight, DAY_LEN } from './state.js';
import { ITEMS, RECIPES, PROTO, TECH, TABS } from './data.js';
import { I } from './input.js';
import { sfx, audio, setVolume, setMusic } from './audio.js';
import { SET, ACTIONS, keyName, bind, resetBinds, saveSettings, applyUiScale } from './settings.js';
import { recipeOK, craftPlan, queueCraft, giveTo, bonus, setRecipe } from './sim.js';
import { peekChunk, resType, resAmt, ORES, ORE_NAMES } from './world.js';
import { CH } from './util.js';
import { FLUID_COL } from './data.js';
import { segInfo } from './fluids.js';
import { stops } from './trains.js';
import { robotStats } from './robots.js';
import { libList, libAdd, libRemove, libRename, libGet, bpCounts, bpToText, bpFromText, getSettings, applySettings } from './blueprint.js';
import { startSelect, holdBlueprint } from './player.js';

const $ = id => document.getElementById(id);
const last = {};
function set(id, html) { if (last[id] !== html) { last[id] = html; $(id).innerHTML = html; } }
export const hooks = {};   // filled by main: save, load, newGame, quit, hasSave

function slot(id, n, attr = '', cls = '') {
  return `<div class="slot ${cls}" ${attr}>${id ? `<i class="ic i-${id}"></i>` : ''}${n !== null && n !== undefined && n !== '' ? `<b>${n}</b>` : ''}</div>`;
}
export function toast(t) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = t;
  $('alerts').appendChild(d); setTimeout(() => d.classList.add('out'), 5200); setTimeout(() => d.remove(), 6000);
  while ($('alerts').children.length > 5) $('alerts').firstChild.remove();
}

// ---------------------------------------------------------------- objectives
const crateEmpty = () => { const c = G.active.find(e => e.id === G.crateId); return !c || c.dead || !c.inv.some(Boolean); };
const OBJ = [
  ['Open the supply crate beside you (click it) and take what you need: click a stack to move it', () => !G.crateId || crateEmpty() || G.built['burner-drill']],
  ['Hold the mouse button (B) on trees and ore to gather wood, stone and iron ore. Press E to see your inventory', () => invCount(G.player.inv, 'wood') > 0 || G.built['burner-drill']],
  ['Place the Burner Drill on an ore patch, then click it holding wood or coal to fuel it', () => G.built['burner-drill']],
  ['Place a Stone Furnace where the drill outputs (the arrow) and fuel it', () => G.built['stone-furnace']],
  ['Craft a Burner Generator and Power Poles (E opens crafting) and place them', () => G.built.generator && G.built.pole],
  ['Build a Research Lab near a pole, feed it Science Pack I, and pick a technology (T)', () => G.built.lab && Object.keys(G.research.done).length > 0],
  ['Research Automation and set up an Assembler fed by Robotic Arms', () => G.built['assembler-1']],
  ['Research Logistic Science and start making Science Pack II', () => G.research.done.sci2],
  ['Research Steel Processing and Oil Processing, then build a Pumpjack on an oil seep', () => G.built.pumpjack],
  ['Research Rocketry and build the Launch Pad', () => G.built['launch-pad']],
  ['Deliver 20 Rocket Parts to the Launch Pad and launch', () => G.won],
];
function objective() { for (const o of OBJ) if (!o[1]()) return o[0]; return 'Mission complete. The factory must grow.'; }

// ---------------------------------------------------------------- tooltips
function ingLine(r) {
  const fl = Object.entries(r.fin || {}).map(([k, v]) => `<div class="ing"><i class="ic sm i-${k}"></i>${v} × ${ITEMS[k].name} <span>(fluid)</span></div>`).join('') + Object.entries(r.fout || {}).map(([k, v]) => `<div class="ing"><i class="ic sm i-${k}"></i>makes ${v} × ${ITEMS[k].name}</div>`).join('');
  return fl + Object.keys(r.in).map(k => { const h = invCount(G.player.inv, k); return `<div class="ing ${h >= r.in[k] ? '' : 'miss'}"><i class="ic sm i-${k}"></i>${r.in[k]} × ${ITEMS[k].name} <span>(${h})</span></div>`; }).join('');
}
function tipFor(k) {
  const [kind, id] = k.split(':');
  if (kind === 'txt') return id;
  if (kind === 'tech') {
    const t = TECH[id];
    return `<h4>${t.name}</h4>${t.desc ? `<p>${t.desc}</p>` : ''}<div class="row">${t.packs.map(p => `<i class="ic sm i-${p}"></i>`).join('')} × ${t.n}</div>` +
      (t.unlocks.length ? `<p class="dimt">Unlocks</p><div class="row">${t.unlocks.map(u => `<i class="ic sm i-${u}"></i>`).join('')}</div>` : '') +
      (t.req.length ? `<p class="dimt">Requires: ${t.req.map(r => TECH[r].name).join(', ')}</p>` : '');
  }
  const it = ITEMS[id]; if (!it) return '';
  let h = `<h4>${it.name}</h4>`;
  if (it.desc) h += `<p>${it.desc}</p>`;
  const p = it.place && PROTO[it.place];
  if (p) { const b = []; if (p.power) b.push(`Uses ${p.power} kW`); if (p.gen) b.push(`Produces ${p.gen} kW`); if (p.slots) b.push(`${p.slots} slots`); b.push(`${p.w}×${p.h}`); h += `<p class="dimt">${b.join(' · ')}</p>`; }
  if (it.fuel) h += `<p class="dimt">Fuel value ${it.fuel / 1000} MJ</p>`;
  const r = RECIPES[id];
  if (r && (kind === 'recipe' || kind === 'item')) {
    h += `<p class="dimt">${r.cat === 'smelt' ? 'Smelted in a furnace' : r.cat === 'refine' ? 'Made in a Refinery' : 'Recipe'} · ${r.time}s${r.n > 1 ? ` · makes ${r.n}` : ''}</p>` + ingLine(r);
    if (kind === 'recipe') h += `<p class="hint">Click: craft 1 · Right-click: 5 · Shift: max</p>`;
  }
  return h;
}
function moveTip(x, y, t) {
  const tip = $('tip'), el = t && t.closest ? t.closest('[data-tip]') : null;
  if (el) {
    const k = el.dataset.tip; if (tip._k !== k) { tip._k = k; tip.innerHTML = tipFor(k); }
    tip.classList.remove('hidden');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(innerWidth - w - 8, x + 18) + 'px'; tip.style.top = Math.max(8, Math.min(innerHeight - h - 8, y + 18)) + 'px';
  } else { tip.classList.add('hidden'); tip._k = null; }
  const hi = $('heldicon');
  if (UI.held && I.overUI) { hi.className = 'ic i-' + UI.held; hi.style.transform = `translate(${x + 6}px,${y + 6}px)`; } else hi.className = 'hidden';
}

// ---------------------------------------------------------------- windows
export function openWin(w, ent) { UI.win = w; UI.ent = ent || null; $('win').classList.remove('hidden'); $('win').className = 'panel w-' + w; last.win = null; renderWin(); sfx('ui'); }
export function closeWin() { UI.win = null; UI.ent = null; $('win').classList.add('hidden'); $('tip').classList.add('hidden'); }
export function toggleWin(w) { if (UI.win === w) closeWin(); else openWin(w); }

function invGrid() {
  return `<div class="grid g10">` + G.player.inv.map((s, i) => slot(s && s.id, s && s.n, `data-act="inv" data-i="${i}" ${s ? `data-tip="item:${s.id}"` : ''}`, s && UI.held === s.id ? 'sel' : '')).join('') + `</div>`;
}
function craftHTML() {
  let h = `<div class="tabs">` + TABS.map(t => `<div class="tab ${UI.tab === t[0] ? 'on' : ''}" data-act="tab" data-id="${t[0]}">${t[1]}</div>`).join('') + `</div><div class="grid g8">`;
  for (const id in RECIPES) { const r = RECIPES[id]; if (r.cat !== 'craft' || r.tab !== UI.tab || !recipeOK(r)) continue; h += slot(id, r.n > 1 ? r.n : '', `data-act="craft" data-id="${id}" data-tip="recipe:${id}"`, craftPlan(id, 1) ? '' : 'dim'); }
  return h + `</div>`;
}
const bar = (f, cls = '') => `<div class="bar ${cls}"><div style="width:${Math.max(0, Math.min(1, f)) * 100}%"></div></div>`;
const tk = (k, o) => slot(o && o.id, o && o.n, `data-act="take" data-k="${k}" ${o ? `data-tip="item:${o.id}"` : ''}`);
const fluidBar = (fb, label) => { const f = fb && fb.a > 0.01 && fb.f; return `<label>${label}${f ? ': ' + ITEMS[f].name + ' ' + Math.floor(fb.a) + ' / ' + fb.cap : ': empty'}</label><div class="bar"><div style="width:${f ? Math.min(100, fb.a / fb.cap * 100) : 0}%;background:${f ? FLUID_COL[f] : 'none'}"></div></div>`; };
function status(e) {
  if (e.warn === 'water') return '<span class="bad">No water</span>'; if (e.warn === 'steam') return '<span class="bad">No steam</span>'; if (e.warn === 'fluid') return '<span class="bad">Missing fluid input</span>';
  if (e.warn === 'power') return '<span class="bad">No power</span>'; if (e.warn === 'fuel') return '<span class="bad">No fuel</span>';
  if (e.warn === 'ore') return '<span class="bad">No resources</span>'; if (e.warn === 'ammo') return '<span class="bad">No ammo</span>';
  return e.working ? '<span class="good">Working</span>' : 'Idle';
}
function entPanel(e) {
  const p = PROTO[e.name];
  const cs = Object.keys(getSettings(e)).length;
  let h = `<h3>${p.name}${cs ? `<span class="hbtns"><span class="btn sm" data-act="copyset" data-tip="txt:Copy settings (Shift+right-click)">Copy</span>${UI.copied && UI.copied.type === e.type ? `<span class="btn sm" data-act="pasteset" data-tip="txt:Paste settings (Shift+left-click)">Paste</span>` : ''}</span>` : ''}</h3>`;
  switch (p.type) {
    case 'chest': {
      const lim = e.limit;
      if (e.logi === 'requester') {
        h += `<label>Requests</label><div class="reqs">` + e.req.map((r, i) => `<div class="req">${slot(r.id, r.n, `data-act="reqrm" data-id="${i}" data-tip="txt:Click to remove this request"`)}<div class="btn sm" data-act="reqn" data-id="${i}:-1">−</div><div class="btn sm" data-act="reqn" data-id="${i}:1">+</div></div>`).join('') +
          (e.req.length < 8 ? `<div class="req">${slot(null, '', `data-act="reqadd" data-tip="txt:Click, then click an item in your inventory to request it"`, UI.reqPick ? 'sel' : '')}</div>` : '') + `</div>${UI.reqPick ? '<p class="hint">Now click an item in your inventory to request it</p>' : ''}`;
      }
      h += `<div class="grid g8">` + e.inv.map((s, i) => tk('ch:' + i, s).replace('class="slot ', `class="slot ${lim != null && i >= lim ? 'lim ' : ''}`)).join('') + `</div>`;
      h += `<div class="btn sm takeall" data-act="takeall">Take all</div>`;
      h += `<div class="vol"><label>Fill limit for arms</label><div class="btn sm" data-act="lim" data-id="-1">−</div><b class="limv">${lim == null ? 'none' : lim + ' slots'}</b><div class="btn sm" data-act="lim" data-id="1">+</div><div class="btn sm" data-act="lim" data-id="0">Clear</div></div>`;
      break;
    }
    case 'arm':
      h += `<p>${status(e)}${e.held ? ` · holding ${ITEMS[e.held].name}` : ''}</p><div class="mrow"><div><label>Filter</label>${slot(e.filter, '', `data-act="clrfilter" data-tip="txt:${e.filter ? 'Click to clear the filter' : 'No filter: moves any item. Click an item in your inventory to set one.'}"`, e.filter ? 'sel' : '')}</div></div>` +
        `<p class="dimt">With a filter the arm only moves that item. Click an item in your inventory to set it.</p>`;
      break;
    case 'furnace':
      h += `<p>${status(e)}</p><div class="mrow">${p.burner ? `<div><label>Fuel</label>${tk('fuel', e.fuel)}</div>` : ''}<div><label>Input</label>${tk('inp', e.inp)}</div><div class="grow"><label>&nbsp;</label>${bar(e.cur ? e.prog : 0)}</div><div><label>Output</label>${tk('out', e.out)}</div></div>`;
      if (p.burner) h += `<label>Heat</label>${bar(e.energy / 4000, 'fuel')}`;
      break;
    case 'drill': {
      h += `<p>${status(e)}</p><div class="mrow">${p.burner ? `<div><label>Fuel</label>${tk('fuel', e.fuel)}</div>` : ''}<div class="grow"><label>Mining</label>${bar(e.prog)}</div><div><label>Output</label>${tk('out', e.out)}</div></div>`;
      let tot = 0; const a = p.area; for (let j = -a; j < p.h + a; j++) for (let i = -a; i < p.w + a; i++) { const t = resType(e.x + i, e.y + j); if (t && t < 5) tot += resAmt(e.x + i, e.y + j); }
      h += `<p class="dimt">Ore remaining in reach: ${tot}</p>`;
      break;
    }
    case 'pumpjack': h += `<p>${status(e)} · ${PROTO[e.name].rate} units/s</p>${fluidBar(e.fb.o, 'Output')}`; break;
    case 'offshore': h += `<p>${e.working ? '<span class="good">Pumping</span>' : 'Output full'} · ${PROTO[e.name].rate * 60} units/s</p>${fluidBar(e.fb.o, 'Output')}`; break;
    case 'tank': { const s = segInfo(e); h += fluidBar(s && { f: s.f, a: s.a, cap: s.cap }, 'Contents (whole connected pipe network)'); break; }
    case 'boiler': h += `<p>${status(e)}</p><div class="mrow"><div><label>Fuel</label>${tk('fuel', e.fuel)}</div><div class="grow">${fluidBar(segInfo(e), 'Water')}</div></div>${fluidBar(e.fb.s, 'Steam')}<label>Heat</label>${bar(e.energy / 4000, 'fuel')}`; break;
    case 'engine': h += `<p>${status(e)}</p><label>Output ${Math.round((e.load || 0) * 900)} / 900 kW</label>${bar(e.load || 0)}${fluidBar(segInfo(e), 'Steam')}`; break;
    case 'assembler': {
      const r = e.recipe && RECIPES[e.recipe];
      if (r) {
        h += `<p>${status(e)}</p><div class="mrow"><div><label>Recipe</label>${slot(r.id, '', `data-act="clearrecipe" data-tip="txt:Click to change recipe"`, 'sel')}</div>` +
          Object.keys(r.in).map(k => `<div><label>${r.in[k]}×</label>${slot(k, e.inp[k] || 0, `data-act="take" data-k="ai:${k}" data-tip="item:${k}"`, (e.inp[k] || 0) ? '' : 'dim')}</div>`).join('') +
          `<div class="grow"><label>&nbsp;</label>${bar(e.crafting ? e.prog : 0)}</div>${r.n > 0 ? `<div><label>Output</label>${slot(r.id, e.out[r.id] || 0, `data-act="take" data-k="ao:${r.id}" data-tip="item:${r.id}"`, (e.out[r.id] || 0) ? '' : 'dim')}</div>` : ''}</div>`;
        if (e.fb) h += (r.fin ? fluidBar(e.fb.i, 'Fluid in (' + Object.entries(r.fin).map(([k, v]) => v + ' ' + ITEMS[k].name).join(', ') + ' per craft)') : '') + (r.fout ? fluidBar(e.fb.o, 'Fluid out') : '');
      } else {
        h += `<p>Choose a recipe</p><div class="grid g8">`;
        for (const id in RECIPES) { const q = RECIPES[id]; if (p.cats.includes(q.cat) && recipeOK(q)) h += slot(id, '', `data-act="setrecipe" data-id="${id}" data-tip="item:${id}"`); }
        h += `</div>`;
      }
      break;
    }
    case 'lab': {
      const R = G.research, t = R.current && TECH[R.current];
      h += `<p>${status(e)}</p><div class="mrow">` + ['sci1', 'sci2', 'sci3'].map(k => `<div>${slot(k, e.inp[k] || 0, `data-act="take" data-k="ai:${k}" data-tip="item:${k}"`, (e.inp[k] || 0) ? '' : 'dim')}</div>`).join('') + `</div>`;
      h += t ? `<label>Researching: ${t.name}</label>${bar(R.progress / t.n)}` : `<p class="bad">No research selected</p><div class="btn" data-act="opentech">Open technology (T)</div>`;
      break;
    }
    case 'generator': h += `<p>${status(e)}</p><div class="mrow"><div><label>Fuel</label>${tk('fuel', e.fuel)}</div><div class="grow"><label>Output ${Math.round(e.load * p.gen)} / ${p.gen} kW</label>${bar(e.load)}</div></div><label>Heat</label>${bar(e.energy / 4000, 'fuel')}`; break;
    case 'solar': h += `<p>Output ${Math.round(p.gen * daylight())} kW</p>`; break;
    case 'accu': h += `<label>Charge ${(e.charge / 1000).toFixed(1)} / ${p.cap / 1000} MJ</label>${bar(e.charge / p.cap)}`; break;
    case 'turret': h += `<p>${status(e)}</p><div class="mrow"><div><label>Ammo</label>${slot('ammo', e.ammo, `data-act="take" data-k="ammo" data-tip="item:ammo"`, e.ammo ? '' : 'dim')}</div></div><p class="dimt">Rounds in chamber: ${e.rounds}</p>`; break;
    case 'silo': h += `<label>Rocket parts ${e.parts} / ${p.need}</label>${bar(e.parts / p.need)}<div class="mrow"><div>${slot('rocket-part', e.parts, `data-tip="item:rocket-part"`, e.parts ? '' : 'dim')}</div></div>` + (e.parts >= p.need && !G.launch ? `<div class="btn big" data-act="launch">LAUNCH</div>` : ''); break;
    case 'roboport': {
      const st = robotStats(e);
      h += `<div class="mrow">${['construction', 'logistic'].map(k => `<div><label>${k}</label>${slot(k + '-robot', e.robots[k], `data-act="rtake" data-id="${k}" data-tip="item:${k}-robot"`, e.robots[k] ? '' : 'dim')}</div>`).join('')}</div>
        <p>${st.flying} robots flying · ${st.ghosts} planned buildings in range${st.missing ? ` · <span class="bad">${st.missing} waiting for items in a storage chest</span>` : ''}</p>
        <p class="dimt">Click robots in your inventory to put them in. Construction area reaches ${PROTO[e.name].cons} tiles out, logistic area ${PROTO[e.name].logi}.</p>${e.lowPower ? '<p class="bad">Low power: robots fly slowly and stay docked</p>' : ''}`;
      break;
    }
    case 'stop': h += `<label>Name</label><input class="stopname" data-stopname="${e.id}" value="${esc(e.stopName || '')}" maxlength="24"><p class="dimt">Trains with this stop in their schedule halt on the rail tile beside it.</p>`; break;
    default: h += `<p class="dimt">${ITEMS[e.name].desc || ''}</p>`;
  }
  if (e.net) { const n = e.net; h += `<div class="net"><label>Electric network — ${Math.round(n.dem)} kW used of ${Math.round(n.sup)} kW</label>${bar(n.sat, n.sat < 0.99 ? 'bad' : 'good')}</div>`; }
  else if (p.power || p.type === 'pole') h += `<p class="bad">Not connected to a power network</p>`;
  return h;
}
function techHTML() {
  const R = G.research, depth = {};
  const dp = id => depth[id] ?? (depth[id] = TECH[id].req.length ? 1 + Math.max(...TECH[id].req.map(dp)) : 0);
  const ids = Object.keys(TECH).sort((a, b) => dp(a) - dp(b) || TECH[a].n - TECH[b].n);
  let h = `<h3>Technology</h3><div class="techs">`;
  for (const id of ids) {
    const t = TECH[id], done = R.done[id], av = t.req.every(r => R.done[r]), cur = R.current === id;
    h += `<div class="tech ${done ? 'done' : cur ? 'cur' : av ? 'av' : 'lock'}" data-act="tech" data-id="${id}" data-tip="tech:${id}">` +
      `<i class="ic i-${t.unlocks[0] || t.packs[t.packs.length - 1]}"></i><div><b>${t.name}</b><span>${done ? 'Researched' : t.packs.map(p => `<i class="ic xs i-${p}"></i>`).join('') + ' × ' + t.n}</span>${cur ? bar(R.progress / t.n) : ''}</div></div>`;
  }
  return h + `</div>`;
}
const K = a => esc(keyName(SET.binds[a]));
const CONTROLS = () => `<table class="ctl">
<tr><th></th><th>Keyboard / mouse</th><th>Controller</th></tr>
<tr><td>Move</td><td>${K('up')} ${K('left')} ${K('down')} ${K('right')} / arrows</td><td>Left stick</td></tr>
<tr><td>Cursor</td><td>Mouse</td><td>Right stick</td></tr>
<tr><td>Build / use / open</td><td>Left click</td><td>A</td></tr>
<tr><td>Mine / remove (hold)</td><td>Right click</td><td>B</td></tr>
<tr><td>Inventory &amp; crafting</td><td>${K('inventory')}</td><td>X</td></tr>
<tr><td>Technology</td><td>${K('tech')}</td><td>Y</td></tr>
<tr><td>Rotate</td><td>${K('rotate')}</td><td>D-pad right</td></tr>
<tr><td>Pick item under cursor / clear hand</td><td>${K('pick')}</td><td>D-pad left / View</td></tr>
<tr><td>Hotbar</td><td>1 – 0</td><td>LB / RB</td></tr>
<tr><td>Zoom</td><td>Mouse wheel</td><td>LT / RT</td></tr>
<tr><td>Toggle info overlay</td><td>${K('overlay')}</td><td>D-pad up</td></tr>
<tr><td>Map</td><td>${K('map')}</td><td>Left stick click</td></tr>
<tr><td>Production statistics</td><td>${K('stats')}</td><td>Pause menu</td></tr>
<tr><td>Blueprints</td><td>${K('blueprints')} · Ctrl+C copy area · Ctrl+V paste</td><td>D-pad down</td></tr>
<tr><td>Mark for removal by robots</td><td>Ctrl+X, then drag</td><td>Blueprint window</td></tr>
<tr><td>Copy / paste machine settings</td><td>Shift+right / Shift+left click</td><td>Machine window buttons</td></tr>
<tr><td>Menu / close</td><td>Esc</td><td>Menu</td></tr>
<tr><td>Quick save / load</td><td>${K('quicksave')} / ${K('quickload')}</td><td>via menu</td></tr></table>
<p class="dimt">Click a machine while holding an item to insert it. Carry Ammo Magazines to fire automatically at crawlers. Keys can be changed in Settings.</p>`;
function settingsHTML(back) {
  const fs = !!document.fullscreenElement;
  return `<h3>Settings</h3>
  <div class="vol"><label>Sound effects</label><div class="btn sm" data-act="vol" data-id="-1">−</div>${bar(audio.vol)}<div class="btn sm" data-act="vol" data-id="1">+</div></div>
  <div class="vol"><label>Music</label><div class="btn sm" data-act="mus" data-id="-1">−</div>${bar(SET.music)}<div class="btn sm" data-act="mus" data-id="1">+</div></div>
  <div class="vol"><label>Interface size</label><div class="btn sm" data-act="uis" data-id="-1">−</div><b class="limv">${Math.round(SET.uiScale * 100)}%</b><div class="btn sm" data-act="uis" data-id="1">+</div></div>
  <div class="btn" data-act="fullscreen">${fs ? 'Leave fullscreen' : 'Fullscreen'}</div>
  <label>Key bindings (click one, then press the new key; Esc cancels)</label>
  <div class="binds">${ACTIONS.map(([a, name]) => `<div class="bind"><span>${name}</span><div class="btn sm ${UI.rebinding === a ? 'danger' : ''}" data-act="rebind" data-id="${a}">${UI.rebinding === a ? 'Press a key…' : K(a)}</div></div>`).join('')}</div>
  <div class="btn" data-act="resetkeys">Reset keys to default</div>
  <div class="btn" data-act="${back}" data-id="">Back</div>`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function playtime(t) { const m = Math.floor(t / 3600); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }
function slotsHTML(act) {
  const l = hooks.list();
  if (!l.length) return `<p class="dimt">No saved games yet.</p>`;
  return `<div class="saves">` + l.map(s => `<div class="save" data-act="${act}" data-id="${esc(s.id)}"><div><b>${esc(s.name)}</b><span>${new Date(s.time).toLocaleString()} · ${playtime(s.tick)} played</span></div>` +
    `<i class="del ${UI.delArm === s.id ? 'arm' : ''}" data-act="delslot" data-id="${esc(s.id)}" data-tip="txt:Delete this save">${UI.delArm === s.id ? 'Delete?' : '✕'}</i></div>`).join('') + `</div>`;
}
function pauseHTML() {
  if (UI.sub === 'controls') return `<h3>Controls</h3>${CONTROLS()}<div class="btn" data-act="sub" data-id="">Back</div>`;
  if (UI.sub === 'settings') return settingsHTML('sub');
  if (UI.sub === 'save') return `<h3>Save game</h3><div class="btn" data-act="saveslot" data-id="">＋ New save slot</div><p class="dimt">or overwrite an existing save:</p>${slotsHTML('saveslot')}<div class="btn" data-act="sub" data-id="">Back</div>`;
  if (UI.sub === 'load') return `<h3>Load game</h3>${slotsHTML('loadslot')}<div class="btn" data-act="sub" data-id="">Back</div>`;
  return `<h3>Paused</h3><div class="btn" data-act="close">Resume</div><div class="btn" data-act="save">Save game</div><div class="btn" data-act="load">Load game</div>
  <div class="btn" data-act="openstats">Production statistics</div><div class="btn" data-act="openbp">Blueprints</div><div class="btn" data-act="sub" data-id="controls">Controls</div>
  <div class="btn" data-act="sub" data-id="settings">Settings</div>
  <div class="btn" data-act="quit">Save &amp; exit to menu</div>`;
}
function bpRow(b) {
  const c = bpCounts(b).slice(0, 6).map(([id, n]) => `<span class="bpi"><i class="ic sm i-${id}"></i>${n}</span>`).join('');
  return `<div class="bprow"><input data-bpname="${esc(b.id)}" value="${esc(b.name)}" maxlength="40"><div class="bpitems">${c}</div>` +
    `<div class="btn sm" data-act="bpuse" data-id="${esc(b.id)}">Use</div><div class="btn sm" data-act="bpexport" data-id="${esc(b.id)}" data-tip="txt:Copy as text to share">Text</div>` +
    `<div class="btn sm ${UI.delArm === b.id ? 'danger' : ''}" data-act="bpdel" data-id="${esc(b.id)}">${UI.delArm === b.id ? 'Delete?' : '✕'}</div></div>`;
}
function bpHTML() {
  const l = libList();
  let h = `<h3>Blueprints</h3><div class="row gap"><div class="btn" data-act="bpnew">Copy area (Ctrl+C)</div>`;
  if (UI.bp && !UI.bp.id) h += `<div class="btn" data-act="bpsave">Save held blueprint</div>`;
  if (UI.lastBp) h += `<div class="btn" data-act="bplast">Hold last copy (Ctrl+V)</div>`;
  if (G.research.done.robotics) h += `<div class="btn" data-act="decon">Mark for removal</div><div class="btn" data-act="undecon">Cancel removals</div>`;
  h += `</div>`;
  h += l.length ? `<div class="bplist">${l.map(bpRow).join('')}</div>` : `<p class="dimt">No saved blueprints. Copy an area, then press "Save held blueprint".</p>`;
  h += `<label>Import blueprint text</label><div class="row gap"><input id="bpimport" placeholder="Paste SW1… text here"><div class="btn sm" data-act="bpimport">Import</div></div>`;
  if (UI.bpText) h += `<label>Blueprint text (select and copy)</label><textarea id="bptext" readonly>${esc(UI.bpText)}</textarea>`;
  h += `<p class="hint">Holding a blueprint: click to place, R to rotate, right-click to drop. Shift+right-click a machine copies its settings; Shift+left-click pastes them.</p>`;
  return h;
}
const fmt = v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v >= 10 ? Math.round(v) + '' : v >= 0.1 ? v.toFixed(1) : v > 0 ? '<0.1' : '0';
function statsHTML() {
  const tab = UI.stab || 'items', per = UI.sper || 60, h0 = `<h3>Production</h3><div class="tabs">` +
    [['items', 'Items'], ['power', 'Electricity']].map(t => `<div class="tab ${tab === t[0] ? 'on' : ''}" data-act="stab" data-id="${t[0]}">${t[1]}</div>`).join('') +
    `<span class="sp"></span>` + [[60, '1 min'], [600, '10 min']].map(t => `<div class="tab ${per === t[0] ? 'on' : ''}" data-act="sper" data-id="${t[0]}">${t[1]}</div>`).join('') + `</div>`;
  const hist = G.stats.hist.slice(-per), mins = Math.max(1, hist.length) / 60;
  if (tab === 'power') {
    const last = hist.length ? hist[hist.length - 1].pw || {} : {};
    return h0 + `<div class="pwnums"><span><i class="dot d1"></i>Used <b>${fmt(last.d || 0)} kW</b></span><span><i class="dot d2"></i>Wanted <b>${fmt(last.w || 0)} kW</b></span><span><i class="dot d3"></i>Generated <b>${fmt(last.s || 0)} kW</b></span><span><i class="dot d4"></i>Stored <b>${fmt((last.a || 0) / 1000)} MJ</b></span></div><canvas id="pwgraph" width="760" height="220"></canvas>`;
  }
  const P = {}, C = {};
  for (const s of hist) { for (const k in s.p) P[k] = (P[k] || 0) + s.p[k]; for (const k in s.c) C[k] = (C[k] || 0) + s.c[k]; }
  const ids = [...new Set([...Object.keys(P), ...Object.keys(C)])].filter(k => ITEMS[k]).sort((a, b) => Math.max(P[b] || 0, C[b] || 0) - Math.max(P[a] || 0, C[a] || 0));
  if (!ids.length) return h0 + `<p class="dimt">Nothing has been produced yet. Statistics cover this play session.</p>`;
  const mx = Math.max(...ids.map(k => Math.max(P[k] || 0, C[k] || 0))) / mins;
  return h0 + `<div class="srow sh"><span></span><span>Item</span><span>Made / min</span><span>Used / min</span></div><div class="stats">` + ids.map(k => {
    const p = (P[k] || 0) / mins, c = (C[k] || 0) / mins;
    return `<div class="srow" data-tip="item:${k}"><i class="ic sm i-${k}"></i><span>${ITEMS[k].name}</span><span class="sv"><i style="width:${p / mx * 100}%"></i><b>${fmt(p)}</b></span><span class="sv c"><i style="width:${c / mx * 100}%"></i><b>${fmt(c)}</b></span></div>`;
  }).join('') + `</div>`;
}
function drawPowerGraph() {
  const c = document.getElementById('pwgraph'); if (!c) return;
  const g = c.getContext('2d'), per = UI.sper || 60, hist = G.stats.hist.slice(-per), W = c.width, H = c.height;
  g.fillStyle = '#16171a'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, H * i / 4 + 0.5); g.lineTo(W, H * i / 4 + 0.5); g.stroke(); }
  if (hist.length < 2) return;
  const mx = Math.max(10, ...hist.map(s => Math.max((s.pw || {}).s || 0, (s.pw || {}).w || 0))) * 1.1;
  const line = (f, col, w) => { g.beginPath(); hist.forEach((s, i) => { const x = (i + per - hist.length) / (per - 1) * W, y = H - (f(s.pw || {}) / mx) * (H - 8) - 4; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = col; g.lineWidth = w; g.stroke(); };
  line(p => p.s || 0, '#f0b840', 2); line(p => p.w || 0, '#e05a40', 1.5); line(p => p.d || 0, '#6ee06a', 2);
  g.fillStyle = 'rgba(230,226,216,0.6)'; g.font = '12px sans-serif'; g.fillText(fmt(mx) + ' kW', 6, 14);
}
const CONDS = { full: 'until wagons are full', empty: 'until wagons are empty', time: 'for 30 seconds', inactive: 'until 5 s without loading' };
function trainHTML(t) {
  if (!t || !G.trains.includes(t)) return '<p>This train no longer exists.</p>';
  const ld = t.cars[0], names = stops().map(s => s.stopName);
  const st = t.state === 'wait' ? 'Waiting at station' : t.sigWait ? 'Waiting at a red signal' : t.noFuel ? '<span class="bad">Out of fuel</span>' : t.noPath ? '<span class="bad">No route to the next stop</span>' : t.v > 0 ? 'Moving' : t.mode === 'auto' && !t.sched.length ? 'Add stops to the schedule' : 'Stopped';
  let h = `<h3>Train · ${t.cars.length} car${t.cars.length > 1 ? 's' : ''}</h3><p>${st}</p>
    <div class="mrow"><div><label>Fuel</label>${slot(ld.fuel && ld.fuel.id, ld.fuel && ld.fuel.n, `data-act="tfuel" ${ld.fuel ? `data-tip="item:${ld.fuel.id}"` : 'data-tip="txt:Click fuel in your inventory to load it"'}`)}</div>
    <div class="grow"><label>Mode</label><div class="row gap"><div class="btn sm ${t.mode === 'auto' ? 'danger' : ''}" data-act="tmode" data-id="auto">Automatic</div><div class="btn sm ${t.mode === 'manual' ? 'danger' : ''}" data-act="tmode" data-id="manual">Stopped</div></div></div></div>
    <label>Schedule</label><div class="sched">`;
  t.sched.forEach((s, i) => {
    h += `<div class="srow2 ${t.mode === 'auto' && i === t.cur % t.sched.length ? 'cur' : ''}"><b>${i + 1}.</b><div class="btn sm" data-act="tstop" data-id="${i}" data-tip="txt:Click to pick the next stop">${esc(s.stop)}</div><div class="btn sm" data-act="tcond" data-id="${i}">${CONDS[s.cond]}</div><div class="btn sm" data-act="tdel" data-id="${i}">✕</div></div>`;
  });
  h += `</div>` + (names.length ? `<div class="btn sm" data-act="tadd">+ Add stop</div>` : `<p class="dimt">Build some train stops first.</p>`);
  t.cars.forEach((c, i) => { if (c.wagon) h += `<label>Wagon ${i}</label><div class="grid g12">` + c.inv.map((s, j) => slot(s && s.id, s && s.n, `data-act="wtake" data-id="${i}:${j}" ${s ? `data-tip="item:${s.id}"` : ''}`)).join('') + `</div>`; });
  return h;
}
function renderWin() {
  if (!UI.win) return;
  if (UI.ent && UI.ent.dead) { closeWin(); return; }
  const x = `<div class="x" data-act="close">✕</div>`;
  let h;
  if (UI.win === 'inv') h = `${x}<div class="cols"><div><h3>Inventory</h3>${invGrid()}</div><div><h3>Crafting</h3>${craftHTML()}</div></div>`;
  else if (UI.win === 'ent') h = `${x}<div class="cols"><div><h3>Inventory</h3>${invGrid()}<p class="hint">Click a stack to move it into the machine (right-click: half)</p></div><div class="entp">${entPanel(UI.ent)}</div></div>`;
  else if (UI.win === 'tech') h = x + techHTML();
  else if (UI.win === 'bp') h = x + bpHTML();
  else if (UI.win === 'stats') h = x + statsHTML();
  else if (UI.win === 'train') h = `${x}<div class="cols"><div><h3>Inventory</h3>${invGrid()}<p class="hint">Click fuel to load the locomotive, anything else goes into the wagons</p></div><div class="entp">${trainHTML(UI.train)}</div></div>`;
  else h = pauseHTML();
  set('win', h);
  if (UI.win === 'stats') drawPowerGraph();
}

// ---------------------------------------------------------------- actions
const ACT = {
  hot(d, btn) {
    const pl = G.player, i = +d.i;
    if (btn === 2) { pl.hotbar[i] = null; return; }
    if (UI.held && pl.hotbar[i] !== UI.held && !pl.hotbar[i]) { const o = pl.hotbar.indexOf(UI.held); if (o >= 0) pl.hotbar[o] = null; pl.hotbar[i] = UI.held; return; }
    const id = pl.hotbar[i]; if (id) selectHeld(id);
  },
  inv(d, btn) {
    const s = G.player.inv[+d.i]; if (!s) return;
    if (UI.win === 'ent' && UI.ent && UI.reqPick && UI.ent.req) { UI.ent.req.push({ id: s.id, n: ITEMS[s.id].stack }); UI.reqPick = false; sfx('ui'); }
    else if (UI.win === 'train' && UI.train) {
      const t = UI.train, ld = t.cars[0], it = ITEMS[s.id], n = btn === 2 ? Math.ceil(s.n / 2) : s.n;
      if (it.fuel && (!ld.fuel || ld.fuel.id === s.id)) { const k = Math.min(n, it.stack - (ld.fuel ? ld.fuel.n : 0)); if (k > 0) { ld.fuel = { id: s.id, n: (ld.fuel ? ld.fuel.n : 0) + k }; invRemove(G.player.inv, s.id, k); sfx('pick'); } }
      else { let left = n; for (const c of t.cars) if (c.wagon && left > 0) left = invAdd(c.inv, s.id, left); if (left < n) { invRemove(G.player.inv, s.id, n - left); sfx('pick'); } else sfx('deny'); }
    }
    else if (UI.win === 'ent' && UI.ent && UI.ent.type === 'arm') { UI.ent.filter = s.id; sfx('ui'); }
    else if (UI.win === 'ent' && UI.ent) {
      const n = btn === 2 ? Math.ceil(s.n / 2) : s.n, id = s.id, k = giveTo(UI.ent, id, n);
      if (k) { invRemove(G.player.inv, id, k); sfx('pick'); } else sfx('deny');
    } else selectHeld(s.id);
  },
  craft(d, btn, shift) {
    let n = shift ? 100 : btn === 2 ? 5 : 1;
    while (n > 0 && !queueCraft(d.id, n)) n--;
    sfx(n ? 'ui' : 'deny');
  },
  tab(d) { UI.tab = d.id; },
  take(d) {
    const e = UI.ent, pl = G.player, k = d.k; if (!e) return;
    const mv = (o, clr) => { if (!o) return; const left = invAdd(pl.inv, o.id, o.n); if (left) o.n = left; else clr(); sfx('pick'); };
    if (k === 'fuel') mv(e.fuel, () => e.fuel = null);
    else if (k === 'inp') mv(e.inp, () => e.inp = null);
    else if (k === 'out') mv(e.out, () => e.out = null);
    else if (k === 'ammo') { if (e.ammo) { e.ammo = invAdd(pl.inv, 'ammo', e.ammo); sfx('pick'); } }
    else if (k.startsWith('ch:')) { const i = +k.slice(3); mv(e.inv[i], () => e.inv[i] = null); }
    else { const id = k.slice(3), b = k.startsWith('ai:') ? e.inp : e.out; if (b[id]) { b[id] = invAdd(pl.inv, id, b[id]); sfx('pick'); } }
  },
  setrecipe(d) { setRecipe(UI.ent, d.id); },
  clearrecipe() { setRecipe(UI.ent, null); },
  tech(d) {
    const t = TECH[d.id], R = G.research;
    if (R.done[t.id] || !t.req.every(r => R.done[r])) { sfx('deny'); return; }
    if (R.current !== t.id) { R.current = t.id; R.progress = 0; toast('Researching ' + t.name); }
  },
  opentech() { openWin('tech'); },
  bpnew() { startSelect('bp'); },
  bpsave() { const b = libAdd(UI.bp); UI.bp.id = b.id; UI.bp.name = b.name; toast('Saved ' + b.name); },
  bplast() { holdBlueprint(JSON.parse(JSON.stringify(UI.lastBp))); },
  bpuse(d) { const b = libGet(d.id); if (b) holdBlueprint(b); },
  bpdel(d) { if (UI.delArm === d.id) { libRemove(d.id); UI.delArm = null; } else UI.delArm = d.id; },
  bpexport(d) { const b = libGet(d.id); if (!b) return; UI.bpText = bpToText(b); try { navigator.clipboard.writeText(UI.bpText).then(() => toast('Blueprint text copied to clipboard'), () => { }); } catch { } },
  bpimport() { const el = $('bpimport'), b = el && bpFromText(el.value); if (!b) { toast('That text is not a valid blueprint'); sfx('deny'); return; } libAdd(b); toast('Imported ' + (b.name || 'blueprint')); },
  decon() { startSelect('decon'); },
  undecon() { startSelect('undecon'); },
  tmode(d) { UI.train.mode = d.id; if (d.id === 'auto') { UI.train.state = 'idle'; UI.train.path = null; } },
  tadd() { const n = stops().map(s => s.stopName); UI.train.sched.push({ stop: n[0], cond: 'full' }); },
  tdel(d) { UI.train.sched.splice(+d.id, 1); },
  tstop(d) { const n = stops().map(s => s.stopName).sort(), e = UI.train.sched[+d.id]; e.stop = n[(n.indexOf(e.stop) + 1) % n.length]; UI.train.path = null; },
  tcond(d) { const k = Object.keys(CONDS), e = UI.train.sched[+d.id]; e.cond = k[(k.indexOf(e.cond) + 1) % k.length]; },
  tfuel() { const ld = UI.train.cars[0]; if (ld.fuel) { ld.fuel.n = invAdd(G.player.inv, ld.fuel.id, ld.fuel.n); if (!ld.fuel.n) ld.fuel = null; sfx('pick'); } },
  wtake(d) { const [i, j] = d.id.split(':').map(Number), c = UI.train.cars[i], s = c && c.inv[j]; if (!s) return; const left = invAdd(G.player.inv, s.id, s.n); if (left) s.n = left; else c.inv[j] = null; sfx('pick'); },
  reqadd() { UI.reqPick = !UI.reqPick; },
  reqrm(d) { UI.ent.req.splice(+d.id, 1); },
  reqn(d) { const [i, v] = d.id.split(':').map(Number), r = UI.ent.req[i], st = ITEMS[r.id].stack; r.n = Math.max(1, r.n + v * Math.max(1, Math.round(st / 10))); },
  rtake(d) { const e = UI.ent, n = e.robots[d.id]; if (n) { e.robots[d.id] = invAdd(G.player.inv, d.id + '-robot', n); sfx('pick'); } },
  clrfilter() { UI.ent.filter = null; },
  takeall() { const e = UI.ent, pl = G.player; let n = 0; for (let i = 0; i < e.inv.length; i++) { const st = e.inv[i]; if (!st) continue; const left = invAdd(pl.inv, st.id, st.n); n += st.n - left; if (left) st.n = left; else e.inv[i] = null; } if (n) sfx('pick'); },
  lim(d) { const e = UI.ent, n = e.inv.length, v = +d.id; if (!v) e.limit = null; else e.limit = Math.max(0, Math.min(n, (e.limit ?? n) + v)); if (e.limit === n) e.limit = null; },
  stab(d) { UI.stab = d.id; }, sper(d) { UI.sper = +d.id; },
  openstats() { openWin('stats'); }, openbp() { openWin('bp'); },
  copyset() { const e = UI.ent; UI.copied = { type: e.type, s: getSettings(e) }; toast('Settings copied'); },
  pasteset() { const e = UI.ent; if (UI.copied && UI.copied.type === e.type && applySettings(e, UI.copied.s)) toast('Settings pasted'); else sfx('deny'); },
  close() { closeWin(); },
  launch() { const e = UI.ent; if (e && e.parts >= PROTO[e.name].need && !G.launch) { G.launch = { id: e.id, t: 0 }; closeWin(); toast('Launch sequence started'); } },
  save() { UI.sub = 'save'; UI.delArm = null; }, load() { UI.sub = 'load'; UI.delArm = null; }, quit() { hooks.quit(); },
  saveslot(d) { hooks.save(d.id); UI.sub = ''; closeWin(); },
  loadslot(d) { UI.sub = ''; hooks.load(d.id); },
  delslot(d) { if (UI.delArm === d.id) { hooks.del(d.id); UI.delArm = null; } else UI.delArm = d.id; },
  sub(d) { UI.sub = d.id; UI.delArm = null; },
  vol(d) { setVolume(Math.round(Math.max(0, Math.min(1, audio.vol + 0.1 * +d.id)) * 10) / 10); sfx('ui'); },
  mus(d) { setMusic(Math.round(Math.max(0, Math.min(1, SET.music + 0.1 * +d.id)) * 10) / 10); },
  uis(d) { SET.uiScale = Math.round(Math.max(0.7, Math.min(1.6, SET.uiScale + 0.1 * +d.id)) * 10) / 10; saveSettings(); applyUiScale(); },
  fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => toast('Fullscreen is not available here')); },
  rebind(d) { UI.rebinding = d.id; I.onrebind = code => { if (code) bind(d.id, code); UI.rebinding = null; I.onrebind = null; last.win = null; refresh(true); if (UI.menu) renderMenu(); }; },
  resetkeys() { resetBinds(); },
  newgame() { const s = $('seed').value.trim(); hooks.newGame(s ? (parseInt(s, 10) || [...s].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7)) : (Math.random() * 1e9) | 0, { peaceful: UI.peace, ws: WSOPT[UI.wsi ?? 1][1] }); },
  cont() { hooks.load(); },
  peace() { UI.peace = !UI.peace; },
  wsnext() { UI.wsi = ((UI.wsi ?? 1) + 1) % WSOPT.length; },
  msub(d) { UI.sub = d.id; UI.delArm = null; },
};
export function selectHeld(id) {
  UI.bp = null; UI.sel = null;
  if (UI.held === id || !invCount(G.player.inv, id)) UI.held = null; else UI.held = id;
  sfx('ui');
}
function uiClick(target, btn, shift) {
  const el = target.closest ? target.closest('[data-act]') : null;
  if (!el) return;
  const f = ACT[el.dataset.act]; if (f) f(el.dataset, btn, shift);
  if (UI.menu) renderMenu();
  last.win = null; refresh(true);
}

// ---------------------------------------------------------------- menu
const WSOPT = [['Compact', 1, 'Everything close together (the original layout)'], ['Normal', 1.6, 'Ore fields, lakes and nests spread out'], ['Spacious', 2.4, 'Big ore fields far apart: belts and trains pay off'], ['Vast', 3.5, 'Huge distances between resources: plan for trains']];
export function renderMenu() {
  const m = $('menu');
  if (!UI.menu) { m.classList.add('hidden'); return; }
  m.classList.remove('hidden');
  const sd = $('seed'), seedVal = sd ? sd.value : (UI.seedVal || ''); UI.seedVal = seedVal;
  const saves = hooks.list();
  m.innerHTML = `<div class="mbox panel"><h1>SLAG<span>WORKS</span></h1><p class="tag">Mine. Smelt. Automate. Leave.</p>` + (UI.sub === 'controls' ? CONTROLS() + `<div class="btn" data-act="msub" data-id="">Back</div>` :
    UI.sub === 'settings' ? settingsHTML('msub') :
    UI.sub === 'load' ? `<h3>Load game</h3>${slotsHTML('loadslot')}<div class="btn" data-act="msub" data-id="">Back</div>` :
    `${saves.length ? `<div class="btn big" data-act="cont">Continue <small>${esc(saves[0].name)}</small></div><div class="btn" data-act="msub" data-id="load">Load game…</div>` : ''}
    <div class="btn big" data-act="newgame">New game</div>
    <div class="opt"><label>World seed</label><input id="seed" placeholder="random" maxlength="12" value="${esc(seedVal)}"></div>
    <div class="opt"><label>Resource spacing</label><div class="btn" data-act="wsnext">${WSOPT[UI.wsi ?? 1][0]} <small>${WSOPT[UI.wsi ?? 1][2]}</small></div></div>
    <div class="opt chk" data-act="peace"><span class="box">${UI.peace ? '✓' : ''}</span> Peaceful mode (no attack waves)</div>
    <div class="btn" data-act="msub" data-id="settings">Settings</div><div class="btn" data-act="msub" data-id="controls">Controls</div>`) + `</div>`;
}

// ---------------------------------------------------------------- per-frame
const MINI = ['#16324a', '#2c5c6c', '#b3a274', '#55682e', '#77603f', '#9b774f'], MORE = [null, '#8fb0c8', '#d98548', '#1c1c20', '#c9c0ae', '#3a2a4a'];
let mctx, mimg;
function minimap() {
  const c = $('minimap'); if (!mctx) { mctx = c.getContext('2d'); mimg = mctx.createImageData(176, 176); }
  const d = mimg.data, pl = G.player, bx = Math.floor(pl.x) - 88, by = Math.floor(pl.y) - 88;
  const col = (i, hex, k = 1) => { const n = parseInt(hex.slice(1), 16); d[i] = (n >> 16) * k; d[i + 1] = ((n >> 8) & 255) * k; d[i + 2] = (n & 255) * k; d[i + 3] = 255; };
  for (let cy = Math.floor(by / CH); cy <= Math.floor((by + 175) / CH); cy++) for (let cx = Math.floor(bx / CH); cx <= Math.floor((bx + 175) / CH); cx++) {
    const ch = peekChunk(cx, cy);
    for (let j = 0; j < CH; j++) { const y = cy * CH + j - by; if (y < 0 || y > 175) continue;
      for (let i = 0; i < CH; i++) { const x = cx * CH + i - bx; if (x < 0 || x > 175) continue; const p = (y * 176 + x) * 4;
        if (!ch) { col(p, '#0c0e10'); continue; }
        const r = ch.res[j * CH + i]; col(p, r ? MORE[r] : MINI[ch.tiles[j * CH + i]], ((i + j) & 1) ? 1 : 0.96);
      } }
    if (ch) for (const e of ch.ents) {
      const pr = PROTO[e.name], hex = e.type === 'tree' ? '#2c4a22' : e.type === 'nest' ? '#d03060' : e.type === 'belt' || e.type === 'ubelt' || e.type === 'splitter' ? '#d8b040' : e.type === 'pole' ? '#70c8ff' : '#c8ccd2';
      for (let j = 0; j < pr.h; j++) for (let i = 0; i < pr.w; i++) { const x = e.x + i - bx, y = e.y + j - by; if (x >= 0 && x < 176 && y >= 0 && y < 176) col((y * 176 + x) * 4, hex); }
    }
  }
  for (const u of G.units) { const x = Math.floor(u.x) - bx, y = Math.floor(u.y) - by; if (x > 0 && x < 175 && y > 0 && y < 175) for (const o of [0, 4, 176 * 4]) col((y * 176 + x) * 4 + o, '#ff3030'); }
  mctx.putImageData(mimg, 0, 0);
  mctx.fillStyle = '#fff'; mctx.fillRect(86, 86, 4, 4); mctx.strokeStyle = '#000'; mctx.lineWidth = 1; mctx.strokeRect(85.5, 85.5, 5, 5);
}
function infoHTML() {
  const e = UI.hover;
  if (e && !e.dead) {
    const p = PROTO[e.name]; let h = `<b>${p.name}</b>`;
    if (!e.natural || e.type === 'nest') h += ` <span class="dimt">${Math.ceil(e.hp)}/${p.hp} hp</span>`;
    if (e.type === 'tree') h += `<br><span class="dimt">Hold right mouse to chop</span>`;
    else if (e.type === 'assembler') h += `<br>${e.recipe ? ITEMS[e.recipe].name : 'No recipe'} · ${status(e)}`;
    else if (['furnace', 'drill', 'lab', 'generator', 'pumpjack', 'turret', 'arm'].includes(e.type)) h += `<br>${status(e)}`;
    else if (e.type === 'chest') { let n = 0; for (const s of e.inv) if (s) n++; h += `<br>${n}/${p.slots} slots used`; }
    else if (e.type === 'pole' && e.net) h += `<br>${Math.round(e.net.dem)} / ${Math.round(e.net.sup)} kW`;
    else if (e.fb) { const s = segInfo(e) || (e.fb.o && { f: e.fb.o.f, a: e.fb.o.a, cap: e.fb.o.cap }); if (s) h += `<br>${s.f && s.a > 0.5 ? ITEMS[s.f].name + ' ' + Math.floor(s.a) + ' / ' + s.cap : 'Empty'}`; if (['boiler', 'engine'].includes(e.type)) h += ` · ${status(e)}`; }
    return h;
  }
  if (UI.hoverCar) { const t = UI.hoverCar.t; return `<b>${UI.hoverCar.c.loco ? 'Locomotive' : 'Cargo Wagon'}</b><br><span class="dimt">${t.mode === 'auto' ? 'Automatic' : 'Stopped'} · click to open, hold right mouse to pick up the train</span>`; }
  if (!I.overUI) { const t = resType(UI.tx, UI.ty); if (t) return `<b>${ORE_NAMES[t]}</b>` + (t < 5 ? ` <span class="dimt">${resAmt(UI.tx, UI.ty)}</span><br><span class="dimt">Hold right mouse to mine</span>` : `<br><span class="dimt">Build a Pumpjack here</span>`); }
  return '';
}
let fcount = 0;
function refresh(force) {
  const pl = G.player; if (!pl) return;
  // auto-assign new placeables to the hotbar once
  for (const s of pl.inv) if (s && ITEMS[s.id].place && !pl.seen[s.id]) { pl.seen[s.id] = 1; const i = pl.hotbar.indexOf(null); if (i >= 0 && !pl.hotbar.includes(s.id)) pl.hotbar[i] = s.id; }
  if (UI.held && !invCount(pl.inv, UI.held)) UI.held = null;
  set('hotbar', pl.hotbar.map((id, i) => { const n = id ? invCount(pl.inv, id) : ''; return slot(id, n, `data-act="hot" data-i="${i}" ${id ? `data-tip="item:${id}"` : 'data-tip="txt:Empty hotbar slot — hold an item and click to assign"'}`, (id && UI.held === id ? 'sel ' : '') + (id && !n ? 'dim' : '')) + ''; }).join(''));
  const tod = (G.tick % DAY_LEN) / DAY_LEN, hr = Math.floor(((tod + 0.5) % 1) * 24), mn = Math.floor((((tod + 0.5) % 1) * 24 - hr) * 60);
  const ammo = invCount(pl.inv, 'ammo');
  set('topleft', `<div class="hp">${bar(pl.hp / 100, pl.hp < 35 ? 'bad' : 'good')}<span>${Math.ceil(pl.hp)}</span></div>
    <div class="stat"><i class="ic xs i-ammo"></i>${ammo}${pl.rounds ? ' +' + pl.rounds : ''} &nbsp; ${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')} ${daylight() < 0.3 ? '☾' : '☀'}${G.peaceful ? '' : ` &nbsp; threat ${Math.round(G.evo * 100)}%`}</div>
    <div class="obj"><label>Objective</label>${objective()}</div>`);
  const R = G.research, t = R.current && TECH[R.current];
  set('research', t ? `<label>Researching</label><b>${t.name}</b>${bar(R.progress / t.n)}` : `<label>Research</label><b class="bad">Press T to choose</b>`);
  set('info', infoHTML()); $('info').classList.toggle('hidden', !last.info);
  set('queue', pl.queue.slice(0, 8).map((q, i) => slot(q.id, q.left, `data-tip="item:${q.id}"`, i ? '' : 'sel') + (i ? '' : bar(q.prog))).join(''));
  const now = performance.now();
  if (UI.feed) UI.feed = UI.feed.filter(f => now - f.t < 3500);
  set('feed', (UI.feed || []).map(f => `<div><i class="ic sm i-${f.id}"></i><b>+${f.n}</b> ${ITEMS[f.id].name} <span>(${invCount(pl.inv, f.id)} in inventory)</span></div>`).join(''));
  if (UI.win && (UI.win !== 'tech' || force || fcount % 30 === 0)) renderWin();
  if (UI.win === 'stats') drawPowerGraph();
  while (G.msgs.length) toast(G.msgs.shift());
}
export function uiFrame() {
  fcount++;
  document.body.classList.toggle('ingame', !UI.menu);
  if (UI.menu) return;
  if (fcount % 6 === 0) refresh();
  if (fcount % 20 === 0) minimap();
}
export function initUI() {
  I.onmove = moveTip; I.onui = uiClick;
  document.addEventListener('change', e => {
    const id = e.target.dataset && e.target.dataset.bpname; if (id) { libRename(id, e.target.value); last.win = null; }
    const sid = e.target.dataset && e.target.dataset.stopname;
    if (sid) { const s = G.active.find(x => x.id === +sid), old = s && s.stopName, nv = e.target.value.trim().slice(0, 24); if (s && nv) { s.stopName = nv; for (const t of G.trains) for (const q of t.sched) if (q.stop === old) q.stop = nv; } last.win = null; }
  });
  renderMenu();
}
