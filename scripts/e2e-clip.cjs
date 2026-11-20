const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const SHOT=process.argv[2]||'/home/claude/fur-holo/docs/shots8';require('fs').mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1200,height:1000},permissions:['clipboard-read','clipboard-write']});ctx.setDefaultTimeout(12000);
await ctx.addInitScript(()=>{try{localStorage.setItem('fur.pview','list')}catch{}});
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
await pg.click('.qa [data-act=new]');await pg.fill('.dlg input','Nusxa sinovi');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.docv');
await pg.click('[data-sa=adddoc]');await pg.waitForTimeout(200);await pg.click('[data-sa=adddoc]');await pg.waitForTimeout(200);
await pg.evaluate(()=>{const d=__fur.S.ses.doc;const p=d.pages.filter(x=>x.type==='document')[0];p.blocks=[
 {id:'b1',type:'paragraph',runs:[{t:'Qizil qalin',c:'#e03131',b:true},{t:' va oddiy so‘z'}]},
 {id:'b2',type:'paragraph',runs:[{t:'Ikkinchi qator matni'}]},
 {id:'b3',type:'heading',level:2,runs:[{t:'Uchinchi sarlavha'}]},
 {id:'b4',type:'paragraph',runs:[{t:'To‘rtinchi qator'}]},
 {id:'b5',type:'paragraph',runs:[{t:'Beshinchi qator'}]}];});
const open=async n=>{await pg.waitForSelector('.pg.openable');await pg.locator('.pg.openable').nth(n).click();await pg.waitForSelector('#editor .ed');};
await open(1);
const model=()=>pg.evaluate(()=>__fur.S.ses.doc.pages.filter(x=>x.type==='document')[0].blocks);
const box=async i=>pg.locator('#editor .ed').nth(i).boundingBox();
// 1. sichqoncha bilan 1-qatordan 3-qatorgacha belgilash
const b1=await box(0),b3=await box(2);
await pg.mouse.move(b1.x+3,b1.y+8);await pg.mouse.down();await pg.waitForTimeout(150);const b3n=await box(2);await pg.mouse.move(b1.x+60,b1.y+20,{steps:5});await pg.waitForTimeout(200);const b3m=await box(2);await pg.mouse.move(b3m.x+300,b3m.y+8,{steps:10});await pg.waitForTimeout(100);await pg.mouse.up();
const seltxt=await pg.evaluate(()=>getSelection().getRangeAt(0).toString());
ok('1: bir nechta qator belgilandi',seltxt.includes('Ikkinchi qator matni')&&seltxt.includes('Uchinchi'),JSON.stringify(seltxt.slice(0,70)));
await pg.screenshot({path:SHOT+'/belgilash-kop-qator.png'});
// 2. rang va qalin hammasiga
await pg.evaluate(()=>{const i=document.getElementById('tcolor');i.value='#2f9e44';i.dispatchEvent(new Event('change',{bubbles:true}))});await pg.waitForTimeout(150);
let m=await model();const col=x=>x.runs.some(r=>r.c==='#2f9e44');
ok('2: rang bir nechta qatorga qo‘llandi',col(m[0])&&col(m[1])&&col(m[2]),m.slice(0,3).map(col).join());
await pg.click('[data-cmd=b]');await pg.waitForTimeout(150);m=await model();
ok('2: qalin bir nechta qatorga qo‘llandi',m[1].runs.every(r=>r.b)&&m[2].runs.some(r=>r.b));
// 3. nusxa (ko'p qator) va qo'yish formatni saqlaydi
const sel=await pg.evaluate(()=>getSelection().toString());
await pg.keyboard.press('Control+c');await pg.waitForTimeout(100);
const b5=await box(4);await pg.mouse.click(b5.x+b5.width-4,b5.y+8);await pg.keyboard.press('End');await pg.keyboard.press('Control+v');await pg.waitForTimeout(250);
m=await model();ok('3: qo‘yilgach bloklar ko‘paydi',m.length>=8,'bloklar='+m.length);
const pasted=m.slice(5);ok('3: qo‘yilgan matnda rang saqlandi',pasted.some(col));ok('3: qo‘yilgan matnda qalin saqlandi',pasted.some(x=>x.runs.some(r=>r.b)));
ok('3: sarlavha turi saqlandi',pasted.some(x=>x.type==='heading'));
await pg.screenshot({path:SHOT+'/qoyish-format-saqlandi.png'});
// 4. bitta so'z (qizil+qalin) -> boshqa joyga
await pg.evaluate(()=>{const d=__fur.S.ses.doc;const p=d.pages.filter(x=>x.type==='document')[0];p.blocks=[{id:'c1',type:'paragraph',runs:[{t:'Qizil',c:'#e03131',b:true},{t:' oddiy'}]},{id:'c2',type:'paragraph',runs:[{t:'Bo‘sh joy: '}]}];});
await pg.click('[data-act=pages]');await pg.waitForSelector('.pg.openable');await open(1);
const c1=await box(0);await pg.mouse.dblclick(c1.x+12,c1.y+8);await pg.keyboard.press('Control+c');
const c2=await box(1);await pg.mouse.click(c2.x+c2.width-3,c2.y+8);await pg.keyboard.press('End');await pg.keyboard.press('Control+v');await pg.waitForTimeout(200);
m=await model();ok('4: bitta so‘z nusxasida rang va qalin saqlandi',m[1].runs.some(r=>r.c==='#e03131'&&r.b),JSON.stringify(m[1].runs));
// 5. ko'p qatorni belgilab o'chirish
await pg.evaluate(()=>{const d=__fur.S.ses.doc;const p=d.pages.filter(x=>x.type==='document')[0];p.blocks=['Bir','Ikki','Uch','To‘rt'].map((t,i)=>({id:'d'+i,type:'paragraph',runs:[{t:t+' qator'}]}));});
await pg.click('[data-act=pages]');await pg.waitForSelector('.pg.openable');await open(1);
await pg.locator('#editor .ed').first().click();await pg.keyboard.press('Control+a');await pg.keyboard.press('Backspace');await pg.waitForTimeout(200);
m=await model();ok('5: Ctrl+A + Backspace hammasini o‘chirdi',m.length===1&&!m[0].runs.length,m.length+' blok');
// 6. belgilash rejimi: rasm + matn bloklarini boshqa sahifaga ko'chirish
await pg.evaluate(()=>{const d=__fur.S.ses.doc;const p=d.pages.filter(x=>x.type==='document')[0];p.blocks=['Bir','Ikki','Uch'].map((t,i)=>({id:'e'+i,type:'paragraph',runs:[{t:t+' qator',c:'#e03131'}]}));});
await pg.click('[data-act=pages]');await pg.waitForSelector('.pg.openable');await open(1);
await pg.setInputFiles('#eimg','/home/claude/fur/im-1.png');await pg.waitForSelector('.imgf');
await pg.click('[data-cmd=selmode]');await pg.locator('#pbody > *').nth(1).click();await pg.locator('#pbody > *').nth(3).click({position:{x:20,y:20}});
ok('6: belgilash rejimida 3 ta blok',(await pg.locator('.bsel').count())>=2,String(await pg.locator('.bsel').count()));
await pg.screenshot({path:SHOT+'/belgilash-rejimi.png'});
await pg.click('[data-x=send]');await pg.waitForSelector('.sendl');await pg.locator('input[name=dp]').nth(0).check();await pg.locator('input[name=dm][value=move]').check();await pg.click('#sg');await pg.waitForTimeout(500);
const boardObjs=await pg.evaluate(()=>__fur.S.ses.doc.pages[0].objects.map(o=>o.t));
ok('6: doskaga ko‘chdi (matn+rasm obyektlari)',boardObjs.filter(t=>t==='text').length>=1&&boardObjs.includes('image'),JSON.stringify(boardObjs));
m=await model();ok('6: ko‘chirilganlar bu yerdan o‘chdi',m.length<4,'qoldi='+m.length);
ok('xatolar yo‘q',errs.length===0,errs.join('|'));
console.log('\n'+pass+' o‘tdi, '+fail+' yiqildi');await b.close();process.exit(fail?1:0);})();
