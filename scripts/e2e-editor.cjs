const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const SHOT=process.argv[2]||'/home/claude/fur-holo/docs/shots2';require('fs').mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1280,height:900},acceptDownloads:true});await ctx.addInitScript(()=>{try{localStorage.setItem('fur.pview','list')}catch{}});ctx.setDefaultTimeout(8000);
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
await pg.click('.qa [data-act=new]');await pg.fill('.dlg input','Ingliz tili: Present Simple');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.docv');
await pg.click('[data-sa=adddoc]');await pg.locator('.pg.openable button[data-open]').last().click();await pg.waitForSelector('.paper');
const canon=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a<b?-1:1)):x);
const blocks=()=>pg.evaluate(()=>JSON.parse(JSON.stringify(__fur.S.ses.doc.pages[1].blocks)));
// 1) sarlavha
await pg.click('.blk.p');await pg.keyboard.type('Present Simple zamoni');await pg.selectOption('#tblock','h1');
let B=await blocks();ok('sarlavha (H1)',B[0].type==='heading'&&B[0].level===1&&B[0].runs[0].t==='Present Simple zamoni',JSON.stringify(B[0]));
// 2) Enter -> oddiy matn, qalin va rang
await pg.keyboard.press('End');await pg.keyboard.press('Enter');
await pg.keyboard.type('Bu zamon odatiy harakatlarni bildiradi: every day');
await pg.keyboard.press('Control+Shift+ArrowLeft');await pg.keyboard.press('Control+Shift+ArrowLeft');await pg.keyboard.press('Control+b');
B=await blocks();ok('Enter yangi paragraf yaratdi',B.length===2&&B[1].type==='paragraph');
ok('Ctrl+B: "every day" qalin',B[1].runs.some(r=>r.b&&r.t.includes('day')),JSON.stringify(B[1].runs));
await pg.evaluate(()=>{});await pg.locator('#tcolor').evaluate(e=>{e.value='#e03131';e.dispatchEvent(new Event('change',{bubbles:true}));});
B=await blocks();ok('rang berildi',B[1].runs.some(r=>r.c==='#e03131'&&r.b),JSON.stringify(B[1].runs.map(r=>[r.t,r.b,r.c])));
await pg.keyboard.press('End');
// 3) ro'yxat
await pg.keyboard.press('Enter');await pg.click('[data-cmd=bullet]');await pg.keyboard.type('I work every day');await pg.keyboard.press('Enter');await pg.keyboard.type('She works in a bank');await pg.keyboard.press('Enter');await pg.keyboard.press('Enter');
B=await blocks();ok('markerli ro‘yxat va Enter-Enter bilan chiqish',B[2].type==='li'&&B[3].type==='li'&&B[3].list==='bullet'&&B[4].type==='paragraph',B.map(x=>x.type).join(','));
await pg.keyboard.type('Raqamli:');await pg.keyboard.press('Enter');await pg.click('[data-cmd=ordered]');await pg.keyboard.type('Qoida');await pg.keyboard.press('Enter');await pg.keyboard.type('Istisno');await pg.keyboard.press('Tab');await pg.keyboard.press('Enter');await pg.keyboard.press('Enter');
B=await blocks();const ord=B.filter(x=>x.type==='li'&&x.list==='ordered');ok('raqamli ro‘yxat, Tab bilan chekinish',ord.length===2&&ord[1].indent===1,JSON.stringify(ord.map(o=>o.indent)));
// 4) jadval
await pg.click('[data-cmd=table]');await pg.fill('.dlg input','3x3');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('table');
const hdr=['Olmosh','Fe’l','Misol'];for(let i=0;i<3;i++){await pg.keyboard.type(hdr[i]);await pg.keyboard.press('Tab');}
for(const t of ['I','work','I work.','She','works','She works.'])  {await pg.keyboard.type(t);await pg.keyboard.press('Tab');}
B=await blocks();const T=B.find(x=>x.type==='table');ok('jadval 3x3 va Tab bilan to‘ldirildi',T&&T.rows.length>=3&&T.rows[0][1].map(r=>r.t).join('')==='Fe’l'&&T.rows[2][2][0].t==='She works.',T&&JSON.stringify(T.rows[2]));
ok('jadval kontekst paneli',await pg.locator('#ectx').isVisible());
await pg.click('#ectx [data-x=addr]');B=await blocks();ok('qator qo‘shildi',B.find(x=>x.type==='table').rows.length===5);
await pg.screenshot({path:SHOT+'/2-jadval-royxat.png'});
// 5) rasm
await pg.setInputFiles('#eimg','/home/claude/fur/im-1.png');await pg.waitForSelector('.imgf img');await pg.waitForTimeout(300);
B=await blocks();const I=B.find(x=>x.type==='image');ok('rasm bloki qo‘shildi',!!I&&await pg.evaluate(()=>__fur.S.ses.doc.assets.length)===1);
await pg.click('.imgf img');await pg.click('#ectx [data-x=w50]');await pg.click('[data-cmd=al-right]');B=await blocks();const I2=B.find(x=>x.type==='image');ok('rasm 50% va o‘ngga tekislandi',I2.w===50&&I2.align==='right');
// 6) bekor qilish
await pg.click('.blk.p >> nth=0');await pg.keyboard.press('Control+End');
const n0=(await blocks()).length;await pg.click('.blk.h1');await pg.keyboard.press('End');await pg.keyboard.press('Enter');await pg.keyboard.type('XYZ vaqtincha');await pg.waitForTimeout(700);
let t1=(await blocks())[1].runs.map(r=>r.t).join('');ok('yangi matn yozildi',t1==='XYZ vaqtincha',t1);
await pg.keyboard.press('Control+z');await pg.waitForTimeout(100);let B2=await blocks();ok('Ctrl+Z yozuvni qaytardi',B2.length===(await blocks()).length&&!JSON.stringify(B2).includes('XYZ'),String(B2.length));
await pg.keyboard.press('Control+y');ok('Ctrl+Y qayta tikladi',JSON.stringify(await blocks()).includes('XYZ'));
await pg.keyboard.press('Control+z');await pg.keyboard.press('Control+z');
// 7) topish va almashtirish
await pg.click('[data-cmd=find]');await pg.fill('#fq','work');await pg.fill('#fr','study');ok('topilganlar soni',(await pg.locator('#fc').innerText()).startsWith('6'),await pg.locator('#fc').innerText());
await pg.click('#fa');await pg.waitForTimeout(200);B=await blocks();ok('hammasi almashtirildi',!JSON.stringify(B).includes('work')&&JSON.stringify(B).includes('I study every day'));
// 8) sahifa sozlamalari
await pg.click('[data-cmd=page]');await pg.fill('#ph','Ingliz tili · 5-sinf');await pg.fill('#pf','Maktab 5');await pg.selectOption('#pm','wide');await pg.screenshot({path:SHOT+'/3-sahifa-sozlamalari.png'});await pg.click('#ps');
ok('kolontitul va sahifa raqami',(await pg.locator('#phdr').innerText()).includes('5-sinf')&&(await pg.locator('#pftr').innerText()).includes('Maktab 5')&&(await pg.locator('#pftr').innerText()).includes('2'));
await pg.click('.blk.h1');await pg.screenshot({path:SHOT+'/1-muharrir.png'});
// 9) saqlash va qayta ochish
await pg.waitForTimeout(2000);const before=canon(await blocks());
await pg.click('[data-act=pages]');await pg.click('[data-act=back]');await pg.waitForSelector('.grid');
await pg.reload();await pg.waitForSelector('.grid');await pg.locator('.card',{hasText:'Present Simple'}).click();await pg.waitForSelector('.docv');await pg.locator('.pg.openable button[data-open]').last().click();await pg.waitForSelector('.paper');
const after=canon(await blocks());ok('qayta ochilgandan keyin hammasi saqlangan',before===after,before.length+' / '+after.length);
ok('rasm qayta ochilganda ko‘rinadi',await pg.evaluate(()=>{const i=document.querySelector('.imgf img');return !!i&&i.complete&&i.naturalWidth>0}));
// 10) eksport -> import
await pg.click('[data-act=pages]');
const [dl]=await Promise.all([pg.waitForEvent('download'),pg.click('[data-sa=export]')]);await dl.saveAs('/tmp/ed.fur');
await pg.click('[data-act=back]');await pg.waitForSelector('.grid');await pg.setInputFiles('#file','/tmp/ed.fur');await pg.waitForTimeout(800);
await pg.locator('.card',{hasText:'Present Simple'}).last().click();await pg.waitForSelector('.docv');
const imp=canon(await pg.evaluate(()=>JSON.parse(JSON.stringify(__fur.S.ses.doc.pages[1].blocks))));ok('eksport → import: bloklar bir xil',imp===before);
// mobil
await pg.locator('.pg.openable button[data-open]').last().click();await pg.waitForSelector('.paper');await pg.setViewportSize({width:390,height:820});await pg.waitForTimeout(300);await pg.screenshot({path:SHOT+'/4-mobil-muharrir.png'});
console.log('xatolar:',errs);ok('konsol xatolari yo‘q',errs.length===0);console.log(`\n${pass} o‘tdi, ${fail} yiqildi`);await b.close();process.exit(fail?1:0);})();
