'use strict';
// Windows .exe ga ikonka va versiya ma'lumotini yozadi (wine/rcedit kerak emas — sof JS: resedit).
const fs = require('fs'), path = require('path');
exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = require('resedit'), exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe');
  const ne = ResEdit.NtExecutable.from(fs.readFileSync(exe)), res = ResEdit.NtExecutableResource.from(ne);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'build', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries), g = groups[0];
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g ? g.id : 1, g ? g.lang : 1033, ico.icons.map(i => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const v = ctx.packager.appInfo.version.split('.').map(Number); vi.setFileVersion(v[0] || 1, v[1] || 0, v[2] || 0, 0, 1033); vi.setProductVersion(v[0] || 1, v[1] || 0, v[2] || 0, 0, 1033);
    vi.setStringValues({ lang: 1033, codepage: 1200 }, { FileDescription: 'FURQON Online', ProductName: 'FURQON Online', CompanyName: 'FURQON', LegalCopyright: 'FURQON', OriginalFilename: 'FURQON Online.exe', InternalName: 'FURQON Online' });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(ne); fs.writeFileSync(exe, Buffer.from(ne.generate()));
  console.log('  • afterPack: ikonka va versiya ma’lumoti yozildi');
};
