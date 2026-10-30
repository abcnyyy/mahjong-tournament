const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('MTTBridge', {
  load: () => ipcRenderer.sendSync('mtt-load'),
  save: (json) => ipcRenderer.sendSync('mtt-save', json),
  saveFile: (name, base64) => ipcRenderer.sendSync('mtt-saveFile', name, base64),
  printHtml: (html) => ipcRenderer.sendSync('mtt-print', html),
  platform: 'electron',
});
