'use strict';
const { app, BrowserWindow, protocol, ipcMain, dialog, shell, session, Menu, net } = require('electron');
const path = require('path'), fs = require('fs'), { Readable } = require('stream'), { pathToFileURL } = require('url');
const ota = require('./ota');
let cfg = { updateUrl: '' }; try { cfg = { ...cfg, ...require('./config.json') }; } catch { /* */ }

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null, ready = false;
const REC_DIR = () => path.join(app.getPath('videos'), 'FURQON Recordings');
const HOST = 'app://furqon';

// ---------- tashqaridan kelgan fayllar (.fur ni ikki marta bosish / "Ochish") ----------
const incoming = []; let incSeq = 0;
function takeFiles(argv) {
  for (const a of argv.slice(1)) {
    if (!/\.(fur)$/i.test(a) || a.startsWith('-')) continue;
    try { const st = fs.statSync(a); if (st.isFile() && st.size < 300 * 1024 * 1024) incoming.push({ id: ++incSeq, name: path.basename(a), data: fs.readFileSync(a) }); } catch { /* */ }
  }
  if (incoming.length && win && ready) win.webContents.executeJavaScript('window.__furIncoming&&window.__furIncoming()').catch(() => { });
}
app.on('second-instance', (_e, argv) => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } takeFiles(argv); });

// ---------- yozuvlar ----------
const openRec = new Map(); // token -> { fd, file, tmp }
const safeName = n => path.basename(String(n)).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-');
function recBegin(name) {
  try { fs.mkdirSync(REC_DIR(), { recursive: true }); let f = path.join(REC_DIR(), safeName(name)); const ext = path.extname(f), base = f.slice(0, -ext.length || undefined);
    for (let i = 2; fs.existsSync(f); i++) f = `${base} (${i})${ext}`;
    const tok = require('crypto').randomUUID(); openRec.set(tok, { fd: fs.openSync(f, 'w'), file: f }); return tok; } catch { return ''; }
}
function recEnd(tok, ok) {
  const o = openRec.get(tok); if (!o) return ''; openRec.delete(tok); try { fs.closeSync(o.fd); } catch { /* */ }
  if (!ok) { try { fs.unlinkSync(o.file); } catch { /* */ } return ''; }
  return JSON.stringify({ id: 'rec:' + path.basename(o.file), size: fs.statSync(o.file).size });
}
const recPath = id => { const n = String(id).startsWith('rec:') ? String(id).slice(4) : ''; if (!n || n !== path.basename(n)) return null; const f = path.join(REC_DIR(), n); return fs.existsSync(f) ? f : null; };
const mimeOf = f => (/\.mp4$/i.test(f) ? 'video/mp4' : 'video/webm');
function recList() {
  try { return JSON.stringify(fs.readdirSync(REC_DIR()).filter(n => /\.(webm|mp4)$/i.test(n)).map(n => { const st = fs.statSync(path.join(REC_DIR(), n)); return { id: 'rec:' + n, name: n, size: st.size, date: st.mtimeMs, mime: mimeOf(n) }; })); } catch { return '[]'; }
}

ipcMain.on('fur:sync', (e, op, ...a) => {
  let r = '';
  try {
    switch (op) {
      case 'version': r = JSON.stringify({ web: ota.webVer(), apk: 'Windows ' + app.getVersion() }); break;
      case 'recSaveBegin': r = recBegin(a[0]); break;
      case 'recSaveChunk': { const o = openRec.get(a[0]); r = false; if (o) { fs.writeSync(o.fd, Buffer.from(a[1], 'base64')); r = true; } break; }
      case 'recSaveEnd': r = recEnd(a[0], a[1]); break;
      case 'recList': r = recList(); break;
      case 'recDelete': { const f = recPath(a[0]); r = false; if (f) { fs.unlinkSync(f); r = true; } break; }
      case 'recWhere': r = REC_DIR().replace(app.getPath('home'), '~'); break;
      case 'incomingList': r = JSON.stringify(incoming.map(x => ({ id: x.id, name: x.name, size: x.data.length }))); break;
      case 'incomingChunk': { const x = incoming.find(y => y.id === a[0]); r = x && a[1] >= 0 && a[1] < x.data.length ? x.data.subarray(a[1], Math.min(x.data.length, a[1] + a[2])).toString('base64') : ''; break; }
    }
  } catch { r = op === 'recSaveChunk' || op === 'recDelete' ? false : ''; }
  e.returnValue = r;
});
ipcMain.on('fur:incomingDone', (_e, id) => { const i = incoming.findIndex(x => x.id === id); if (i >= 0) incoming.splice(i, 1); });
ipcMain.on('fur:recShow', (_e, id) => { const f = recPath(id); if (f) shell.showItemInFolder(f); });
ipcMain.on('fur:external', (_e, u) => { if (/^https?:\/\//i.test(u)) shell.openExternal(u); });
const saving = new Map(); // fayl nomi -> bo'laklar
ipcMain.on('fur:save', async (_e, name, b64, last) => {
  const parts = saving.get(name) ?? []; if (b64) parts.push(Buffer.from(b64, 'base64')); saving.set(name, parts); if (!last) return; saving.delete(name);
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), safeName(name)) });
  if (!r.canceled && r.filePath) { try { fs.writeFileSync(r.filePath, Buffer.concat(parts)); } catch (e) { dialog.showErrorBox('Saqlab bo‘lmadi', String(e.message || e)); } }
});

// ---------- yangilanish ----------
async function checkUpdate(manual) {
  try {
    const r = await ota.update(cfg.updateUrl);
    if (r.status === 'off') { if (manual) await dialog.showMessageBox(win, { type: 'info', message: 'Yangilanish manzili sozlanmagan', detail: 'Yangi versiyani qo‘lda o‘rnating (desktop/config.json → updateUrl).' }); }
    else if (r.status === 'none') { if (manual) await dialog.showMessageBox(win, { type: 'info', message: 'Eng so‘nggi versiya o‘rnatilgan ✓', detail: 'Veb versiyasi: ' + r.web }); }
    else { const b = await dialog.showMessageBox(win, { type: 'info', buttons: ['Hozir qayta yuklash', 'Keyinroq'], message: 'Yangi versiya yuklandi (' + r.web + ')', detail: r.notes || '' }); if (b.response === 0 && win) win.loadURL(HOST + '/index.html'); }
  } catch (e) { if (manual) dialog.showMessageBox(win, { type: 'warning', message: 'Yangilanishni tekshirib bo‘lmadi', detail: 'Internetni tekshiring. ' + (e.message || '') }); }
}
ipcMain.on('fur:update', () => { void checkUpdate(true); });

// ---------- oyna ----------
function serveRec(req, p) {
  try {
    const id = Buffer.from(p.slice(7).replace(/\.[a-z0-9]+$/i, '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'), f = recPath(id);
    if (!f) return new Response('Not found', { status: 404 });
    const total = fs.statSync(f).size, h = { 'Content-Type': mimeOf(f), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    let s = 0, e = total - 1, part = false; const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
    if (m && total > 0) { if (m[1] === '') { s = Math.max(0, total - Number(m[2])); } else { s = Number(m[1]); if (m[2]) e = Math.min(e, Number(m[2])); } part = s <= e && s < total; if (!part) { s = 0; e = total - 1; } }
    h['Content-Length'] = String(total ? e - s + 1 : 0); if (part) h['Content-Range'] = `bytes ${s}-${e}/${total}`;
    return new Response(total ? Readable.toWeb(fs.createReadStream(f, { start: s, end: e })) : null, { status: part ? 206 : 200, headers: h });
  } catch { return new Response('Error', { status: 500 }); }
}
async function handleApp(req) {
  const u = new URL(req.url); let p = decodeURIComponent(u.pathname);
  if (p.startsWith('/__rec/')) return serveRec(req, p);
  if (p === '/sw.js') return new Response('', { status: 404 }); // ilova fayllari mahalliy — service worker kerak emas, OTA bilan to'qnashmasin
  if (p === '/' || p === '') p = '/index.html';
  const root = ota.webRoot(), f = path.normalize(path.join(root, p));
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return new Response('Not found', { status: 404 });
  return net.fetch(pathToFileURL(f).toString());
}
function createWindow() {
  win = new BrowserWindow({ width: 1366, height: 820, minWidth: 900, minHeight: 600, backgroundColor: '#00060f', title: 'FURQON Online', icon: path.join(__dirname, 'build', 'icon.ico'), show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => { ready = true; if (incoming.length) win.webContents.executeJavaScript('window.__furIncoming&&window.__furIncoming()').catch(() => { }); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(HOST + '/')) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); } });
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return; const c = i.control || i.meta;
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (c && (i.key === '+' || i.key === '=')) { win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5); e.preventDefault(); }
    else if (c && i.key === '-') { win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5); e.preventDefault(); }
    else if (c && i.key === '0') { win.webContents.setZoomLevel(0); e.preventDefault(); }
    else if (c && i.key.toLowerCase() === 'r') { win.webContents.reload(); e.preventDefault(); }
  });
  win.on('closed', () => { win = null; ready = false; });
  void win.loadURL(HOST + '/index.html');
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', handleApp);
  const allowed = ['media', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'mediaKeySystem'];
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.includes(perm) && wc.getURL().startsWith(HOST + '/')));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => allowed.includes(perm));
  takeFiles(process.argv); createWindow();
  if (cfg.updateUrl) setTimeout(() => { void checkUpdate(false); }, 6000);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
