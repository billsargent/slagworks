// Tiny synthesized sound effects (WebAudio), no audio files.
import { SET, saveSettings } from './settings.js';
import { kvGet, kvSet } from './kv.js';
let ac = null, master = null, noiseBuf = null, musicBus = null, echo = null;
const last = {};
export const audio = { vol: 0.5 };
{ const v = kvGet('slagworks-vol'); if (v !== null && v !== '' && !isNaN(+v)) audio.vol = +v; }

export function initAudio() {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = audio.vol; master.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = SET.music; musicBus.connect(ac.destination);
    // a soft feedback echo gives the music some space
    echo = ac.createDelay(2); echo.delayTime.value = 0.62; const fb = ac.createGain(); fb.gain.value = 0.38; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    echo.connect(lp); lp.connect(fb); fb.connect(echo); lp.connect(musicBus);
    setTimeout(musicLoop, 1500);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }
}
export function setVolume(v) { audio.vol = v; if (master) master.gain.value = v; kvSet('slagworks-vol', v); }

function tone(type, f0, f1, dur, vol, delay = 0) {
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(freq, type, dur, vol) {
  const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
}
export function sfx(name, v = 1) {
  if (!ac || audio.vol <= 0) return;
  const now = performance.now();
  if (now - (last[name] || 0) < 45) return;
  last[name] = now;
  switch (name) {
    case 'build': noise(500, 'lowpass', 0.09, 0.5 * v); tone('sine', 120, 60, 0.1, 0.5 * v); break;
    case 'mine': noise(1800, 'bandpass', 0.05, 0.35 * v); tone('square', 200, 90, 0.05, 0.08 * v); break;
    case 'pick': tone('sine', 520, 780, 0.07, 0.2 * v); break;
    case 'craft': tone('triangle', 880, 1320, 0.08, 0.15 * v); break;
    case 'ui': tone('sine', 1000, 1200, 0.03, 0.08 * v); break;
    case 'deny': tone('square', 150, 110, 0.12, 0.1 * v); break;
    case 'shot': noise(2500, 'highpass', 0.05, 0.3 * v); tone('square', 300, 80, 0.05, 0.1 * v); break;
    case 'hurt': tone('sawtooth', 220, 90, 0.18, 0.2 * v); break;
    case 'boom': noise(300, 'lowpass', 0.6, 0.9 * v); tone('sine', 90, 30, 0.5, 0.6 * v); break;
    case 'alert': tone('sawtooth', 660, 660, 0.14, 0.12 * v); tone('sawtooth', 440, 440, 0.2, 0.12 * v, 0.16); break;
    case 'research': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.25, 0.18 * v, i * 0.11)); break;
  }
}

// ---- generative ambient music: slow pad chords with sparse melody notes
export function setMusic(v) { SET.music = v; saveSettings(); if (musicBus) musicBus.gain.setTargetAtTime(v, ac.currentTime, 0.3); }
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [[50, 57, 60, 65], [46, 53, 58, 62], [48, 55, 58, 64], [45, 52, 57, 60], [43, 50, 55, 62], [48, 55, 60, 64]];
const SCALE = [62, 64, 65, 67, 69, 72, 74, 76, 77, 79];
let ci = 0;
function pad(n, t, dur, vol) {
  for (const det of [-4, 4]) {
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det;
    f.type = 'lowpass'; f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(900, t + dur * 0.5); f.frequency.linearRampToValueAtTime(400, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.1);
  }
}
function bell(n, t, vol) {
  const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.value = hz(n); o2.type = 'sine'; o2.frequency.value = hz(n) * 2.01;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  const g2 = ac.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(g);
  o.connect(g); g.connect(musicBus); g.connect(echo); o.start(t); o2.start(t); o.stop(t + 3.4); o2.stop(t + 3.4);
}
function musicLoop() {
  if (!ac) return;
  const dur = 9;
  if (SET.music > 0 && ac.state === 'running') {
    const t = ac.currentTime + 0.05, ch = CHORDS[ci++ % CHORDS.length];
    ch.forEach((n, i) => pad(n, t + i * 0.08, dur + 1.5, 0.035));
    pad(ch[0] - 12, t, dur + 1.5, 0.03);
    const notes = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < notes; i++) if (Math.random() < 0.8) bell(SCALE[(Math.random() * SCALE.length) | 0], t + 1 + Math.random() * (dur - 2), 0.05);
  }
  setTimeout(musicLoop, dur * 1000);
}
