const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const SHOT=process.argv[2]||'/home/claude/fur-platform/docs/shots4';require('fs').mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
const D='/home/claude/imp/';
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1280,height:900}});ctx.setDefaultTimeout(15000);
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
const titles=()=>pg.evaluate(()=>__fur.S.metas.map(m=>m.title+'|'+m.pages+'|'+m.boards+'|'+m.docs));
await pg.setInputFiles('#file',[D+'test.pdf']);await pg.click('.opt[data-v=img]');await pg.waitForFunction(()=>__fur.S.metas.length===1,null,{timeout:20000});
let t=await titles();ok('PDF import: 2 sahifa, ikkalasi doska',t[0]==='test|2|2|0',t.join());
await pg.setInputFiles('#file',[D+'test.docx']);await pg.waitForFunction(()=>__fur.S.metas.length===2,null,{timeout:10000});
t=await titles();const dm=t.find(x=>x.startsWith('test|')&&x!=='test|2|2|0');ok('DOCX import: 2 hujjat sahifasi (sahifa uzilishi)',dm==='test|2|0|2',t.join());
await pg.setInputFiles('#file',['/home/claude/fur/im-2.png']);await pg.waitForFunction(()=>__fur.S.metas.length===3,null,{timeout:10000});
t=await titles();ok('Rasm import: 1 doska sahifasi',t.some(x=>x==='im-2|1|1|0'),t.join());
// noto'g'ri fayllar
require('fs').writeFileSync(D+'bad.pdf','bu pdf emas');require('fs').writeFileSync(D+'bad.docx','PK-emas');
await pg.setInputFiles('#file',[D+'bad.pdf']);await pg.waitForSelector('#toast.bad');ok('soxta PDF rad etildi',(await pg.locator('#toast').innerText()).length>3,await pg.locator('#toast').innerText());
await pg.waitForTimeout(300);await pg.setInputFiles('#file',[D+'bad.docx']);await pg.waitForTimeout(800);ok('buzilgan DOCX rad etildi (hech narsa qo‘shilmadi)',(await titles()).length===3);
// DOCX mazmuni
const docId=await pg.evaluate(()=>__fur.S.metas.find(m=>m.docs===2).id);await pg.evaluate(id=>__fur.openDoc(id),docId);await pg.waitForSelector('.docv');
const P=await pg.evaluate(()=>JSON.parse(JSON.stringify(__fur.S.ses.doc.pages.map(p=>p.blocks))));const A=P[0];
const h=A[0];ok('Sarlavha (H1)',h.type==='heading'&&h.level===1&&h.runs[0].t==='Present Simple',JSON.stringify(h));
ok('qalin + rang + kursiv + tagiga chiziq + havola',A[1].runs.some(r=>r.b&&r.c==='#e03131')&&A[1].runs.some(r=>r.i)&&A[1].runs.some(r=>r.u&&!r.href)&&A[1].runs.some(r=>r.href==='https://example.com/'||r.href==='https://example.com'),JSON.stringify(A[1].runs.map(r=>[r.t,r.b,r.i,r.u,r.c,r.href])));
ok('markerli ro‘yxat',A[2].type==='li'&&A[2].list==='bullet'&&A[3].list==='bullet',A.map(x=>x.type+':'+x.list).join());
ok('raqamli ro‘yxat',A[4].list==='ordered'&&A[5].list==='ordered');
ok('markazga tekislash',A[6].align==='center');
const T=A.find(x=>x.type==='table');ok('jadval 3x2 + sarlavha qatori',T&&T.rows.length===3&&T.rows[0].length===2&&T.header&&T.rows[0][1][0].t==='Fe’l'&&T.rows[2][1][0].t==='works',T&&T.rows.length);
const I=A.find(x=>x.type==='image');ok('rasm bloki + asset',!!I&&await pg.evaluate(()=>__fur.S.ses.doc.assets.length)===1);
ok('2-sahifa: sarlavha va kirill matn',P[1][0].type==='heading'&&P[1][0].level===2&&P[1][1].runs[0].t.includes('Ўзбекча'));
// ochish va ko'rish
await pg.locator('.pg.openable').first().click();await pg.waitForSelector('.paper');await pg.waitForTimeout(3800);await pg.screenshot({path:SHOT+'/1-docx-import.png'});
await pg.click('[data-act=pages]');await pg.waitForSelector('.plist2');await pg.click('[data-act=back]');await pg.waitForSelector('.card');await pg.waitForTimeout(200);
await pg.screenshot({path:SHOT+'/2-fayllar-ruyxati.png'});
// PDF doska
const pdfId=await pg.evaluate(()=>__fur.S.metas.find(m=>m.boards===2).id);await pg.evaluate(id=>__fur.openDoc(id),pdfId);await pg.waitForSelector('.docv');
ok('PDF sahifalarida rasm obyekti va asset',await pg.evaluate(()=>__fur.S.ses.doc.pages.every(p=>p.objects.length===1&&p.objects[0].t==='image')&&__fur.S.ses.doc.assets.length===2));
await pg.locator('.pg.openable').first().click();await pg.waitForSelector('#bc');await pg.waitForTimeout(800);
await pg.click('[data-tool=pen]');await pg.click('[data-c="#e03131"]');await pg.click('[data-w="2"]');const bx=await pg.locator('#bc').boundingBox();
await pg.mouse.move(bx.x+300,bx.y+250);await pg.mouse.down();for(const [x,y] of [[360,200],[430,260],[500,210],[560,270]])await pg.mouse.move(bx.x+x,bx.y+y,{steps:6});await pg.mouse.up();
await pg.waitForTimeout(300);await pg.screenshot({path:SHOT+'/3-pdf-ustiga-yozish.png'});
ok('PDF sahifasi ustiga yozildi (2 obyekt)',await pg.evaluate(()=>__board.page.objects.length)===2);
// eksport -> qayta import (to'liq tsikl)
await pg.waitForFunction(()=>__fur.S.ses.status==='saved',null,{timeout:6000});
ok('konsolda xato yo‘q',errs.length===0,errs.join(' | '));
// mobil
const m=await b.newContext({viewport:{width:390,height:820},isMobile:true,hasTouch:true,deviceScaleFactor:2});const mp=await m.newPage();mp.on('pageerror',e=>errs.push(e.message));await mp.goto('http://localhost:8765/');await mp.waitForSelector('.empty');
await mp.setInputFiles('#file',[D+'test.docx',D+'test.pdf']);await mp.click('.opt[data-v=img]');await mp.waitForFunction(()=>__fur.S.metas.length===2,null,{timeout:20000});await mp.waitForTimeout(500);await mp.screenshot({path:SHOT+'/4-mobil-import.png'});
console.log(`\n${pass} o‘tdi, ${fail} yiqildi`);await b.close();process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
