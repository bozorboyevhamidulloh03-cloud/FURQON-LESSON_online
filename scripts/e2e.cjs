const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const SHOT=process.argv[2]||'/home/claude/fur-platform/docs/shots';require('fs').mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,colorScheme:'light'});
const pg=await ctx.newPage();ctx.setDefaultTimeout(8000);const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
await pg.screenshot({path:SHOT+'/1-bosh-sahifa-bosh.png'});
ok('bo‘sh holat ko‘rinadi',await pg.locator('.empty h2').innerText()==='Birinchi darsingizni yarating');
// yaratish
const mk=async(name)=>{await pg.click('header [data-act=new]');await pg.fill('.dlg input',name);await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.docv');};
await mk('Ingliz tili 5-dars');
await pg.click('[data-sa=adddoc]');await pg.click('[data-sa=addboard]');await pg.waitForTimeout(2200);
ok('hujjat 3 sahifa, avtosaqlandi',await pg.locator('.pg').count()===3&&(await pg.locator('#status').innerText()).startsWith('Saqlandi'));
await pg.screenshot({path:SHOT+'/2-dars-ichi-avtosaqlash.png'});
await pg.click('[data-act=back]');await pg.waitForSelector('.grid');
await mk('Matematika: kasrlar');await pg.click('[data-act=back]');await pg.waitForSelector('.grid');
// import eski 0.1
await pg.setInputFiles('#file','/home/claude/fur/sample.fur');await pg.waitForTimeout(900);
const t=await pg.locator('#toast').innerText();ok('eski 0.1 fayl import va migratsiya',t.includes('0.1')&&t.includes('1.1'),t);
// buzilgan fayl
require('fs').writeFileSync('/tmp/bad.fur',Buffer.from('PK\u0003\u0004 bu buzilgan fayl, zip emas aslida...........'));
await pg.setInputFiles('#file','/tmp/bad.fur');await pg.waitForTimeout(500);
ok('buzilgan fayl rad etiladi',(await pg.locator('#toast').getAttribute('class')).includes('bad'),await pg.locator('#toast').innerText());
// sevimli, papka
await pg.locator('.card').first().hover();await pg.locator('.card').first().locator('[data-act=fav]').click();
await pg.click('header [data-act=newfolder]');await pg.fill('.dlg input','8-sinf');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.fold');
await pg.locator('.card',{hasText:'Matematika'}).locator('[data-act=menu]').click();await pg.click('[data-act="m:move"]');await pg.click('.pitem:has-text("8-sinf")');await pg.waitForTimeout(300);
ok('papkaga ko‘chirildi',(await pg.locator('.card').count())===2&&await pg.locator('.fold em').innerText()==='1');
await pg.screenshot({path:SHOT+'/3-fayl-menejeri.png'});
// qidiruv
await pg.fill('#q','ingliz');await pg.waitForTimeout(200);ok('qidiruv',(await pg.locator('.card').count())===1);
await pg.fill('#q','');
// o'chirish va tiklash
await pg.locator('.card',{hasText:'Ingliz'}).locator('[data-act=menu]').click();await pg.click('[data-act="m:trash"]');await pg.waitForTimeout(300);
await pg.click('[data-nav=trash]');ok('o‘chirilganlarda turadi',(await pg.locator('.card').count())===1);
await pg.locator('.card').locator('[data-act=menu]').click();await pg.click('[data-act="m:restore"]');await pg.waitForTimeout(300);
await pg.click('[data-nav=all]');ok('tiklandi',(await pg.locator('.card',{hasText:'Ingliz'}).count())===1);
// avariyadan tiklash: o'zgarish, 250ms dan keyin sahifani majburan yopish (asosiy saqlash 1.5s)
await pg.locator('.card',{hasText:'Ingliz'}).click();await pg.waitForSelector('.docv');
await pg.click('[data-sa=addboard]');await pg.click('[data-sa=addboard]');await pg.waitForTimeout(500);
ok('asosiy saqlash hali bo‘lmagan',(await pg.locator('#status').textContent()).includes('zgarishlar'));
await pg.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>false});});await pg.close();         // kutilmagan yopilish
const p2=await ctx.newPage();p2.on('pageerror',e=>errs.push(e.message));await p2.goto('http://localhost:8765/');await p2.waitForSelector('.grid');
await p2.locator('.card',{hasText:'Ingliz'}).click();await p2.waitForSelector('.banner');
ok('tiklash banneri chiqdi',await p2.locator('.banner b').innerText()==='Saqlanmagan o‘zgarishlar topildi');
await p2.screenshot({path:SHOT+'/4-avariyadan-tiklash.png'});
await p2.click('[data-sa=recover]');await p2.waitForTimeout(300);
ok('tiklandi: 5 sahifa',await p2.locator('.pg').count()===5,String(await p2.locator('.pg').count()));
await p2.waitForTimeout(2000);
// qayta ochilganda saqlangan
await p2.click('[data-act=back]');await p2.waitForSelector('.grid');await p2.locator('.card',{hasText:'Ingliz'}).click();await p2.waitForSelector('.docv');
ok('tiklangan holat saqlandi, banner yo‘q',await p2.locator('.pg').count()===5&&await p2.locator('.banner').count()===0);
// qorong'i mavzu + mobil
await p2.click('[data-act=back]');await p2.waitForSelector('.grid');
await p2.setViewportSize({width:390,height:800});await p2.evaluate(()=>{document.documentElement.dataset.theme='dark'});await p2.waitForTimeout(200);
await p2.screenshot({path:SHOT+'/5-mobil-qorongi.png'});
// eksport -> qayta import butunligi
const [dl]=await Promise.all([p2.waitForEvent('download'),(async()=>{await p2.locator('.card',{hasText:'Ingliz'}).locator('[data-act=menu]').click();await p2.click('[data-act="m:export"]');})()]);
await dl.saveAs('/tmp/exp.fur');ok('eksport fayli',dl.suggestedFilename()==='Ingliz tili 5-dars.fur');
console.log('xatolar:',errs);ok('konsol xatolari yo‘q',errs.length===0);
console.log(`\n${pass} o‘tdi, ${fail} yiqildi`);await b.close();process.exit(fail?1:0);})();
