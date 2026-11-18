import { FurError, newDocument, splitRuns, patchRuns, setFlag, allHave, replaceRange, plainText, newPage, parseFur, serializeFur, writeZip, FurDocument, uid } from '../src/index';
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (extra ? '  ' + extra : '')); };
async function throws(n: string, code: string, f: () => Promise<unknown>) {
  try { await f(); ok(n, false, 'xato kutilgan edi'); } catch (e) { ok(n, e instanceof FurError && e.code === code, e instanceof FurError ? e.code : String(e)); }
}
const enc = new TextEncoder();
const bad2 = { id: 'x', type: 'document', blocks: [{ type: 'paragraph', text: 'eski matn' }, { type: 'paragraph', runs: [{ t: 'x', c: 'javascript:1', href: 'javascript:alert(1)', ff: 'a;b{}' }] }, { type: 'table', rows: [[[{ t: 'a' }]], [[{ t: 'b' }], [{ t: 'c' }]]] }, { type: 'image', a: '../x' }] };
(async () => {
  const sane = await parseFur(await writeZip([{ name: 'manifest.json', data: enc.encode(JSON.stringify({ format: 'fur', formatVersion: '1.0', pages: [{ id: 'x', file: 'pages/p-0001.json', type: 'document' }], files: {} })) }, { name: 'pages/p-0001.json', data: enc.encode(JSON.stringify(bad2)) }]));
  const sb = sane.doc.pages[0].blocks as any[];
  ok('eski text maydoni runs ga o\u2018tadi', sb[0].runs[0].t === 'eski matn');
  ok('xavfli rang/havola/shrift tozalanadi', !sb[1].runs[0].c && !sb[1].runs[0].href && !sb[1].runs[0].ff);
  ok('notekis jadval to\u2018g\u2018rilanadi, noto\u2018g\u2018ri rasm tashlanadi', sb.length === 3 && sb[2].rows[0].length === 2);
  const doc: FurDocument = newDocument('Sinov', 'Muallif');
  const b = doc.pages[0]; const pts: [number, number][] = []; for (let i = 0; i < 3000; i++) pts.push([i, Math.sin(i / 9) * 50]);
  b.objects.push({ t: 'stroke', id: uid('o'), pts, c: '#e03131', w: 4, hl: false }, { t: 'rect', id: uid('o'), x1: 0, y1: 0, x2: 100, y2: 60, c: '#111111', w: 3 }, { t: 'text', id: uid('o'), x: 5, y: 5, tx: 'Salom, oʻzbek Ўзбек', s: 24, c: '#111111' });
  const img = new Uint8Array(5000).map((_, i) => (i * 7) & 255);
  doc.assets.push({ id: 'img1', mime: 'image/png', data: img });
  b.objects.push({ t: 'image', id: 'i1', a: 'img1', x: 0, y: 0, w: 100, h: 100 });
  const dp = newPage('document', 'Konspekt'); dp.blocks = [{ id: 'b1', type: 'heading', level: 1, runs: [{ t: 'Mavzu' }] }, { id: 'b2', type: 'paragraph', align: 'justify', runs: [{ t: 'Qalin ', b: true }, { t: 'qiya', i: true, c: '#e03131', fs: 20 }, { t: ' havola', href: 'https://example.com' }] },
    { id: 'b3', type: 'li', list: 'ordered', indent: 1, runs: [{ t: 'Band' }] }, { id: 'b4', type: 'table', header: true, rows: [[[{ t: 'A' }], [{ t: 'B', b: true }]], [[{ t: 'C' }], []]] }, { id: 'b5', type: 'image', a: 'img1', w: 50, align: 'right', caption: [{ t: 'Rasm' }] }]; doc.layout = { margin: 'wide', header: 'Sarlavha', footer: 'Past', pageNumbers: false }; doc.pages.push(dp);
  const bytes = await serializeFur(doc);
  const back = await parseFur(bytes);
  ok('round-trip: sahifalar', back.doc.pages.length === 2 && back.doc.pages[1].type === 'document');
  ok('round-trip: 3000 nuqtali chiziq', (back.doc.pages[0].objects[0] as any).pts.length === 3000);
  ok('round-trip: unicode matn', (back.doc.pages[0].objects[2] as any).tx === 'Salom, oʻzbek Ўзбек');
  ok('round-trip: rasm baytlari', back.doc.assets[0]?.data.length === 5000 && back.doc.assets[0].data[7] === 49);
  ok('round-trip: hujjat bloklari', back.doc.pages[1].blocks.length === 5 && (back.doc.pages[1].blocks[0] as any).level === 1);
  const rb = back.doc.pages[1].blocks as any[];
  ok('matn runlari (qalin/qiya/rang/o\u2018lcham/havola)', rb[1].runs.length === 3 && rb[1].runs[0].b === true && rb[1].runs[1].c === '#e03131' && rb[1].runs[1].fs === 20 && rb[1].runs[2].href === 'https://example.com' && rb[1].align === 'justify');
  ok('ro\u2018yxat, jadval, rasm bloklari', rb[2].list === 'ordered' && rb[2].indent === 1 && rb[3].rows[1].length === 2 && rb[3].header === true && rb[4].w === 50 && rb[4].caption[0].t === 'Rasm');
  ok('sahifa sozlamalari (layout)', back.doc.layout.margin === 'wide' && back.doc.layout.header === 'Sarlavha' && back.doc.layout.pageNumbers === false);
  ok('versiya 1.1, migratsiya yo\u2018q', back.sourceVersion === '1.1' && !back.migrated);
  const jsonSize = JSON.stringify(b).length; ok('siqish ishlaydi', bytes.length < jsonSize * 0.7, `fayl ${bytes.length} B, JSON ${jsonSize} B`);

  const bad = bytes.slice(); bad[Math.floor(bad.length / 2)] ^= 0xff;
  for (const [label, pos] of [['o\u2018rtada', Math.floor(bad.length / 2)], ['boshida', 300], ['oxirida', bad.length - 100]] as const) {
    const m = bytes.slice(); m[pos] ^= 0xff;
    try { await parseFur(m); ok('buzilgan bayt (' + label + ') aniqlanadi', false, 'xato topilmadi'); }
    catch (e) { ok('buzilgan bayt (' + label + ') aniqlanadi', e instanceof FurError, e instanceof FurError ? e.code : String(e)); }
  }
  await throws('kesilgan fayl', 'NOT_ZIP', () => parseFur(bytes.slice(0, bytes.length - 40)));
  await throws('ZIP emas', 'NOT_ZIP', () => parseFur(enc.encode('bu oddiy matn fayl, zip emas, hech qanday konteyner yo‘q')));
  const trav = await writeZip([{ name: '../evil.json', data: enc.encode('{}') }]);
  await throws('yo‘l o‘tish (../)', 'UNSAFE', () => parseFur(trav));
  const nomf = await writeZip([{ name: 'x.json', data: enc.encode('{}') }]);
  await throws('manifest yo‘q', 'MISSING', () => parseFur(nomf));
  const fut = await writeZip([{ name: 'manifest.json', data: enc.encode(JSON.stringify({ format: 'fur', formatVersion: '2.0', pages: [] })) }]);
  await throws('kelajak versiyasi rad etiladi', 'UNSUPPORTED_VERSION', () => parseFur(fut));
  const notfur = await writeZip([{ name: 'manifest.json', data: enc.encode('{"format":"docx"}') }]);
  await throws('boshqa format', 'INVALID', () => parseFur(notfur));
  const big = await writeZip([{ name: 'a.bin', data: new Uint8Array(3_000_000) }]);
  await throws('zip-bomba (chegara)', 'TOO_LARGE', () => parseFur(big, { maxEntries: 10, maxTotal: 1_000_000, maxEntry: 1_000_000 }));
  const unk = await writeZip([{ name: 'manifest.json', data: enc.encode(JSON.stringify({ format: 'fur', formatVersion: '1.5', futureField: { a: 1 }, pages: [{ id: 'p1', type: 'board', file: 'pages/p-0001.json', extra: 1 }], files: {} })) }, { name: 'pages/p-0001.json', data: enc.encode(JSON.stringify({ id: 'p1', type: 'board', objects: [{ t: 'hologram' }, { t: 'rect', x1: 0, y1: 0, x2: 5, y2: 5 }], newThing: 1 })) }]);
  const u = await parseFur(unk); ok('orqaga/oldinga moslik: noma’lum maydonlar o‘tkazib yuboriladi', u.doc.pages[0].objects.length === 1 && u.sourceVersion === '1.5');

  const old = await parseFur(new Uint8Array(readFileSync(process.argv[2] ?? '/home/claude/fur/sample.fur')));
  ok('eski 0.1 fayl ochiladi va migratsiya qilinadi', old.migrated && old.sourceVersion === '0.1' && old.doc.pages.length === 3 && old.doc.assets.length === 3, `${old.doc.pages.length} sahifa, ${old.doc.assets.length} rasm`);
  const re = await parseFur(await serializeFur(old.doc)); ok('0.1 → 1.0 qayta saqlash', re.sourceVersion === '1.1' && re.doc.pages.length === 3);

  const R = [{ t: 'Salom ' }, { t: 'dunyo', b: true }];
  ok('runs: patch qalin', JSON.stringify(patchRuns(R, 0, 5, x => setFlag(x, 'b', true))) === JSON.stringify([{ t: 'Salom', b: true }, { t: ' ' }, { t: 'dunyo', b: true }]));
  ok('runs: allHave', allHave(R, 6, 11, 'b') && !allHave(R, 0, 11, 'b'));
  ok('runs: split/merge', plainText(splitRuns(R, 3)[0]) === 'Sal' && plainText(splitRuns(R, 3)[1]) === 'om dunyo');
  ok('runs: almashtirish', plainText(replaceRange(R, 6, 11, 'jahon')) === 'Salom jahon');
  console.log(`\n${pass} o‘tdi, ${fail} yiqildi`); process.exit(fail ? 1 : 0);
})();
