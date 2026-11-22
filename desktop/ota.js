'use strict';
// Veb-qism yangilanishi (Android'dagi kabi): latest.json -> zip -> sha256 tekshiruv -> userData/ota/web. Ilovani qayta o'rnatish shart emas.
const { app, net } = require('electron');
const fs = require('fs'), path = require('path'), crypto = require('crypto'), AdmZip = require('adm-zip');
const bundled = () => path.join(__dirname, 'web');
const otaDir = () => path.join(app.getPath('userData'), 'ota', 'web');
const readVer = dir => { try { return Number(JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')).web) || 0; } catch { return 0; } };
/** Qaysi veb-papka ishlatiladi: yangiroq bo'lsa OTA, aks holda o'rnatilgan. */
function webRoot() { const o = otaDir(); return fs.existsSync(path.join(o, 'index.html')) && readVer(o) > readVer(bundled()) ? o : bundled(); }
const webVer = () => readVer(webRoot());
async function fetchLatest(base) {
  const r = await net.fetch(base.replace(/\/?$/, '/') + 'latest.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
}
/** Yangi versiya bo'lsa yuklab, joyiga qo'yadi. Qaytaradi: { status: 'none'|'updated'|'off', web } */
async function update(base) {
  if (!base) return { status: 'off', web: webVer() };
  const lj = await fetchLatest(base), cur = webVer();
  if (!(Number(lj.web) > cur)) return { status: 'none', web: cur };
  const r = await net.fetch(base.replace(/\/?$/, '/') + String(lj.zip).replace(/^\/+/, '')); if (!r.ok) throw new Error('zip HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (crypto.createHash('sha256').update(buf).digest('hex') !== String(lj.sha256).toLowerCase()) throw new Error('Yuklangan fayl shikastlangan (sha256 mos emas)');
  const tmp = otaDir() + '.new'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const zip = new AdmZip(buf), root = path.resolve(tmp) + path.sep;
  for (const e of zip.getEntries()) { // zip-slip himoyasi
    const dest = path.resolve(tmp, e.entryName); if (!dest.startsWith(root)) throw new Error('Xavfli fayl yo‘li: ' + e.entryName);
    if (e.isDirectory) fs.mkdirSync(dest, { recursive: true }); else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, e.getData()); }
  }
  if (!fs.existsSync(path.join(tmp, 'index.html'))) throw new Error('Paketda index.html yo‘q');
  fs.writeFileSync(path.join(tmp, 'version.json'), JSON.stringify({ web: Number(lj.web) })); // paket ichidagi raqam noto'g'ri bo'lsa ham qayta-qayta yuklamasin
  fs.rmSync(otaDir(), { recursive: true, force: true }); fs.renameSync(tmp, otaDir());
  return { status: 'updated', web: Number(lj.web), notes: lj.notes || '' };
}
module.exports = { webRoot, webVer, update };
