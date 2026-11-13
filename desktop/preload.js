// Exposes file-based save slots to the game page.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('slagFS', {
  list: () => ipcRenderer.sendSync('save-list'),
  read: id => ipcRenderer.sendSync('save-read', id),
  write: (id, text, meta) => ipcRenderer.sendSync('save-write', id, text, meta),
  remove: id => ipcRenderer.sendSync('save-remove', id),
  kvGet: k => ipcRenderer.sendSync('kv-get', k),
  kvSet: (k, v) => ipcRenderer.sendSync('kv-set', k, v),
});
