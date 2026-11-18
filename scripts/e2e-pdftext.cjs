const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const SHOT=process.argv[2]||'/home/claude/fur-platform/docs/shots4b';require('fs').mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1280,height:900}});await ctx.addInitScript(()=>{try{localStorage.setItem('fur.pview','list')}catch{}});ctx.setDefaultTimeout(30000);
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
await pg.setInputFiles('#file',['/home/claude/imp/IELTS Task 1 Introduction.pdf']);await pg.waitForSelector('.opt');
ok('import tanlovi ko‘rsatildi (2 variant + bekor)',await pg.locator('.opt').count()===2);
await pg.click('.opt[data-v=text]');await pg.waitForFunction(()=>__fur.S.metas.length===1,null,{timeout:40000});
const info=await pg.evaluate(()=>JSON.stringify(__fur.S.metas.map(m=>[m.pages,m.boards,m.docs])));ok('9 hujjat sahifasi (doska emas)',info==='[[9,0,9]]',info);
await pg.evaluate(()=>__fur.openDoc(__fur.S.metas[0].id));await pg.waitForSelector('.docv');
const D=await pg.evaluate(()=>JSON.parse(JSON.stringify({p:__fur.S.ses.doc.pages.map(p=>p.blocks),a:__fur.S.ses.doc.assets.length})));
const txt=p=>D.p[p].filter(b=>b.runs).map(b=>b.runs.map(r=>r.t).join('')).join('\n');
const all=D.p.map((_,i)=>txt(i)).join('\n');
ok('asosiy matn bor',all.includes('Paraphrase the question')&&all.includes('The line graph compares')&&all.includes('Togri sinonm toppish'));
ok('1-sahifa: ro‘yxat (- bandlar)',D.p[0].filter(b=>b.type==='li').length>=4,D.p[0].map(b=>b.type).join());
ok('qizil/ko‘k rangli matn saqlandi',JSON.stringify(D.p).includes('"c":"#')&&D.p[0].some(b=>b.runs&&b.runs.some(r=>r.c&&/^#[c-f]/i.test(r.c))));

ok('rasmlar ajratildi (≥5 ta rasm bloki)',D.p.flat().filter(b=>b.type==='image').length>=5&&D.a>=5,D.p.flat().filter(b=>b.type==='image').length+' blok, '+D.a+' asset');
ok('rasm ichidagi grafik matni (rasm ustida) matnga aralashmadi',!all.includes('Percentage')&&!all.includes('Who Uses'));
ok('ko‘p qatorli abzats birlashtirildi (2-bet)',D.p[1].some(b=>b.runs&&b.runs.map(r=>r.t).join('').includes('give me 2 most suitable synonyms')&&b.runs.map(r=>r.t).join('').includes('forecast')&&b.runs.map(r=>r.t).join('').length>100));
await pg.locator('.pg.openable').nth(0).click();await pg.waitForSelector('.paper');await pg.waitForTimeout(500);await pg.screenshot({path:SHOT+'/1-pdf-matn-1bet.png'});
// tahrirlash mumkinligini tekshirish: sarlavha oxiriga matn yozish
const first=pg.locator('.paper .blk').first();await first.click();await pg.keyboard.press('End');await pg.keyboard.type(' (tahrirlandi)');await pg.waitForTimeout(300);
ok('import qilingan matn tahrirlanadi',(await pg.locator('.paper').innerText()).includes('(tahrirlandi)'));
await pg.click('[data-act=nextpage]');await pg.waitForTimeout(500);await pg.screenshot({path:SHOT+'/2-pdf-matn-2bet.png'});
await pg.click('[data-act=nextpage]');await pg.click('[data-act=nextpage]');await pg.waitForTimeout(600);await pg.screenshot({path:SHOT+'/3-pdf-matn-4bet.png'});
// tanlov: rasm varianti ham ishlaydi
await pg.click('[data-act=pages]');await pg.click('[data-act=back]');await pg.waitForSelector('.card');
await pg.setInputFiles('#file',['/home/claude/imp/test.pdf']);await pg.click('.opt[data-v=img]');await pg.waitForFunction(()=>__fur.S.metas.length===2,null,{timeout:30000});
ok('rasm varianti: doska sahifalari',await pg.evaluate(()=>__fur.S.metas.some(m=>m.title==='test'&&m.boards===2)));
await pg.setInputFiles('#file',['/home/claude/imp/test.pdf']);await pg.waitForSelector('.opt');await pg.click('.dlg [data-v=""]');await pg.waitForTimeout(500);ok('bekor qilinsa hech narsa qo‘shilmaydi',await pg.evaluate(()=>__fur.S.metas.length)===2);
await pg.screenshot({path:SHOT+'/4-fayllar.png'});
ok('konsolda xato yo‘q',errs.length===0,errs.join(' | '));
console.log(`\n${pass} o‘tdi, ${fail} yiqildi`);await b.close();process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
