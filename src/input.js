// Keyboard, mouse and gamepad. The gamepad drives a virtual cursor so all DOM UI works with a controller.
import { initAudio } from './audio.js';
import { translateKey } from './settings.js';

export const I = {
  mx: innerWidth / 2, my: innerHeight / 2, lmb: false, rmb: false, lp: false, rp: false,
  keys: new Set(), pressed: new Set(), moveX: 0, moveY: 0, wheel: 0, overUI: false, pad: false, shift: false,
  onmove: null, onui: null,
};
let canvas, mapCv, padEl, prevBtn = [], padL = false, padR = false;

const isWorld = t => t === canvas || t === mapCv;
function moved(x, y, t) { I.mx = x; I.my = y; I.overUI = !!(t && !isWorld(t)); if (I.onmove) I.onmove(x, y, t); }

export function initInput(cv) {
  canvas = cv; mapCv = document.getElementById('mapview'); padEl = document.getElementById('padcursor');
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    initAudio();
    if (I.onrebind) { e.preventDefault(); if (e.code !== 'Escape') I.onrebind(e.code); else I.onrebind(null); return; }
    const code = (e.ctrlKey || e.metaKey) ? e.code : translateKey(e.code);
    I.shift = e.shiftKey; I.ctrl = e.ctrlKey || e.metaKey;
    if (!code) return;
    if (!e.repeat) I.pressed.add((e.ctrlKey || e.metaKey) && e.code !== 'ControlLeft' && e.code !== 'ControlRight' ? 'Ctrl+' + code : code);
    I.keys.add(code);
    if (I.ctrl && ['KeyC', 'KeyV', 'KeyX', 'KeyS'].includes(e.code)) e.preventDefault();
    if (['Tab', 'F5', 'F9', 'Space', 'AltLeft'].includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { const c = translateKey(e.code); if (c) I.keys.delete(c); I.shift = e.shiftKey; I.ctrl = e.ctrlKey || e.metaKey; });
  addEventListener('blur', () => { I.keys.clear(); I.lmb = I.rmb = false; });
  addEventListener('mousemove', e => { if (I.pad) { I.pad = false; padEl.style.display = 'none'; } moved(e.clientX, e.clientY, e.target); });
  addEventListener('mousedown', e => {
    initAudio();
    moved(e.clientX, e.clientY, e.target);
    if (isWorld(e.target)) { if (e.button === 0) { I.lmb = true; I.lp = true; } else if (e.button === 2) { I.rmb = true; I.rp = true; } }
    else if (I.onui && e.target.tagName !== 'INPUT') I.onui(e.target, e.button, e.shiftKey);
  });
  addEventListener('mouseup', e => { if (e.button === 0) I.lmb = false; else if (e.button === 2) I.rmb = false; });
  addEventListener('contextmenu', e => e.preventDefault());
  for (const c of [canvas, mapCv]) c.addEventListener('wheel', e => { I.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
}

const PADKEYS = { 10: 'KeyM', 2: 'KeyE', 3: 'KeyT', 4: 'HotPrev', 5: 'HotNext', 8: 'KeyQ', 9: 'Escape', 12: 'AltLeft', 13: 'KeyB', 14: 'KeyQ', 15: 'KeyR' };
export function pollInput(dt) {
  let mx = 0, my = 0;
  const k = I.keys;
  if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null; for (const g of gps) if (g && g.connected) { gp = g; break; }
  if (gp) {
    const dz = v => Math.abs(v) < 0.2 ? 0 : v;
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    mx += lx; my += ly;
    const b = gp.buttons.map(x => x.pressed || x.value > 0.4);
    const any = b.some(Boolean) || lx || ly || rx || ry;
    if (any && !I.pad) { I.pad = true; padEl.style.display = 'block'; initAudio(); }
    if (I.pad) {
      if (rx || ry) {
        const sp = innerHeight * 0.9 * dt;
        I.mx = Math.max(2, Math.min(innerWidth - 2, I.mx + rx * Math.abs(rx) * sp));
        I.my = Math.max(2, Math.min(innerHeight - 2, I.my + ry * Math.abs(ry) * sp));
      }
      padEl.style.transform = `translate(${I.mx}px,${I.my}px)`;
      padEl.style.display = 'none';
      const el = document.elementFromPoint(I.mx, I.my);
      padEl.style.display = 'block';
      moved(I.mx, I.my, el);
      const onCanvas = isWorld(el);
      // A / B = left / right mouse
      if (b[0] && !prevBtn[0]) { if (onCanvas) { padL = true; I.lmb = true; I.lp = true; } else if (el && I.onui) I.onui(el, 0, b[6]); }
      if (!b[0] && prevBtn[0] && padL) { padL = false; I.lmb = false; }
      if (b[1] && !prevBtn[1]) { if (onCanvas) { padR = true; I.rmb = true; I.rp = true; } else if (el && I.onui) I.onui(el, 2, false); }
      if (!b[1] && prevBtn[1] && padR) { padR = false; I.rmb = false; }
      for (const i in PADKEYS) if (b[i] && !prevBtn[i]) I.pressed.add(PADKEYS[i]);
      if (b[6]) I.wheel += dt * 14; if (b[7]) I.wheel -= dt * 14;
      if (b[11] && !prevBtn[11]) { I.mx = innerWidth / 2; I.my = innerHeight / 2; }
    }
    prevBtn = b;
  }
  I.moveX = mx; I.moveY = my;
}
export function endFrame() { I.pressed.clear(); I.lp = false; I.rp = false; I.wheel = 0; }
