// Small key-value store for settings and the blueprint library.
// The desktop build keeps each key as a file next to the save games; browsers use localStorage.
const fsb = window.slagFS && window.slagFS.kvGet ? window.slagFS : null;
export function kvGet(k) {
  try { if (fsb) { const v = fsb.kvGet(k); if (v != null) return v; } return localStorage.getItem(k); } catch { return null; }
}
export function kvSet(k, v) {
  let ok = false;
  try { if (fsb) ok = !!fsb.kvSet(k, String(v)); } catch { }
  try { localStorage.setItem(k, String(v)); ok = true; } catch { }
  return ok;
}
