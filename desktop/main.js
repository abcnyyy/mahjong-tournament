const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const dataDir = app.getPath('userData');
const dataFile = path.join(dataDir, 'data.json');
const backupFile = path.join(dataDir, 'data.bak.json');
const logFile = path.join(app.getPath('temp'), 'mtt-startup.log');

function log(s) {
  try { fs.appendFileSync(logFile, new Date().toISOString() + ' ' + s + '\n'); } catch (e) {}
}
log('main start');
process.on('uncaughtException', (e) => { log('uncaught ' + (e && e.stack || e)); });

function ensureDir() {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}

ipcMain.on('mtt-load', (e) => {
  ensureDir();
  try { e.returnValue = fs.readFileSync(dataFile, 'utf8'); }
  catch (err) { e.returnValue = null; }
});

ipcMain.on('mtt-save', (e, json) => {
  ensureDir();
  try {
    const tmp = dataFile + '.tmp';
    fs.writeFileSync(tmp, String(json), 'utf8');
    try { if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, backupFile); } catch (err) {}
    fs.renameSync(tmp, dataFile);
    e.returnValue = true;
  } catch (err) { e.returnValue = false; }
});

ipcMain.on('mtt-saveFile', (e, name, base64) => {
  try {
    const win = BrowserWindow.getFocusedWindow();
    const r = dialog.showSaveDialogSync(win, { defaultPath: path.join(app.getPath('downloads'), name) });
    if (!r) { e.returnValue = false; return; }
    fs.writeFileSync(r, Buffer.from(String(base64 || ''), 'base64'));
    e.returnValue = r;
  } catch (err) { e.returnValue = false; }
});

ipcMain.on('mtt-print', (e, html) => {
  try {
    const w = new BrowserWindow({ show: false, width: 900, height: 1200 });
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    w.webContents.once('did-finish-load', () => {
      setTimeout(() => { w.webContents.print({ silent: false, printBackground: true }); }, 400);
    });
    w.webContents.once('did-finish-load', () => { setTimeout(() => { try { w.close(); } catch (err) {} }, 60000); });
    e.returnValue = true;
  } catch (err) { e.returnValue = false; }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1180, height: 860, minWidth: 380, minHeight: 560,
    title: '麻将赛事管理',
    backgroundColor: '#f5f6f8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('did-finish-load', () => log('did-finish-load'));
  win.webContents.on('did-fail-load', (e, code, desc) => log('did-fail-load ' + code + ' ' + desc));
  win.webContents.on('console-message', (e, level, message) => { if (level >= 2) log('console: ' + message); });
  win.webContents.on('render-process-gone', (e, d) => log('render-gone ' + JSON.stringify(d)));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('file://')) return { action: 'allow' };
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  log('app ready');
  try { createWindow(); } catch (e) { log('createWindow failed ' + (e && e.stack || e)); }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
