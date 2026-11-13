// Player settings: key bindings, UI scale, music. Stored in browser storage, shared by all saves.
import { kvGet, kvSet } from './kv.js';
const KEY = 'slagworks-settings';
export const ACTIONS = [
  ['up', 'Walk up', 'KeyW'], ['down', 'Walk down', 'KeyS'], ['left', 'Walk left', 'KeyA'], ['right', 'Walk right', 'KeyD'],
  ['inventory', 'Inventory and crafting', 'KeyE'], ['tech', 'Technology', 'KeyT'], ['rotate', 'Rotate', 'KeyR'],
  ['pick', 'Pick item / clear hand', 'KeyQ'], ['map', 'Map', 'KeyM'], ['blueprints', 'Blueprints', 'KeyB'],
  ['stats', 'Production statistics', 'KeyP'], ['overlay', 'Info overlay', 'AltLeft'], ['quicksave', 'Quick save', 'F5'], ['quickload', 'Quick load', 'F9'],
];
const DEF = Object.fromEntries(ACTIONS.map(a => [a[0], a[2]]));
export const SET = { binds: { ...DEF }, uiScale: 1, music: 0.35 };
try { const s = JSON.parse(kvGet(KEY)); if (s) { Object.assign(SET, s); SET.binds = { ...DEF, ...(s.binds || {}) }; } } catch { }
export function saveSettings() { kvSet(KEY, JSON.stringify(SET)); }

// physical key -> the canonical (default) code the game logic listens for
export function translateKey(code) {
  for (const a in SET.binds) if (SET.binds[a] === code) return DEF[a];
  for (const a in DEF) if (DEF[a] === code && SET.binds[a] !== code) return null;   // default key moved elsewhere
  return code;
}
export function keyName(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' (left)').replace('Right', ' (right)').replace('Arrow', 'Arrow ');
}
export function bind(action, code) {
  for (const a in SET.binds) if (SET.binds[a] === code) SET.binds[a] = null;
  SET.binds[action] = code; saveSettings();
}
export function resetBinds() { SET.binds = { ...DEF }; saveSettings(); }
export function applyUiScale() { document.documentElement.style.fontSize = `calc(clamp(11px, 1.48vh, 26px) * ${SET.uiScale})`; }
