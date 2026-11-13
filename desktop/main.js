// Electron wrapper for Windows and Linux.
const { app, BrowserWindow, protocol, net, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ---- save slots: one JSON file (+ small meta file) per slot in <userData>/saves
const saveDir = () => { const d = path.join(app.getPath('userData'), 'saves'); fs.mkdirSync(d, { recursive: true }); return d; };
const safe = id => String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'slot';
ipcMain.on('save-list', e => {
  const out = [];
  try { for (const f of fs.readdirSync(saveDir())) if (f.endsWith('.meta.json')) { try { out.push(JSON.parse(fs.readFileSync(path.join(saveDir(), f), 'utf8'))); } catch { } } } catch { }
  e.returnValue = out;
});
ipcMain.on('save-read', (e, id) => { try { e.returnValue = fs.readFileSync(path.join(saveDir(), safe(id) + '.json'), 'utf8'); } catch { e.returnValue = null; } });
ipcMain.on('save-write', (e, id, text, meta) => {
  try {
    const f = path.join(saveDir(), safe(id));
    fs.writeFileSync(f + '.json.tmp', text); fs.renameSync(f + '.json.tmp', f + '.json');
    fs.writeFileSync(f + '.meta.json', JSON.stringify(meta));
    e.returnValue = true;
  } catch { e.returnValue = false; }
});
const kvFile = k => { const d = path.join(app.getPath('userData'), 'settings'); fs.mkdirSync(d, { recursive: true }); return path.join(d, safe(k) + '.json'); };
ipcMain.on('kv-get', (e, k) => { try { e.returnValue = fs.readFileSync(kvFile(k), 'utf8'); } catch { e.returnValue = null; } });
ipcMain.on('kv-set', (e, k, v) => { try { const f = kvFile(k); fs.writeFileSync(f + '.tmp', String(v)); fs.renameSync(f + '.tmp', f); e.returnValue = true; } catch { e.returnValue = false; } });
ipcMain.on('save-remove', (e, id) => {
  const f = path.join(saveDir(), safe(id));
  for (const x of ['.json', '.meta.json']) { try { fs.unlinkSync(f + x); } catch { } }
  e.returnValue = true;
});
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540, backgroundColor: '#0d1014', title: 'Slagworks',
    autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadURL('app://game/index.html');
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', req => {
    const rel = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
