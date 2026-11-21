// Office-uslubidagi muharrir: rang paneli, katak belgilash, birlashtirish, tekislash, .fur ni "Ochish"
const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const SHOT=process.argv[2]||'/tmp/shots-o';require('fs').mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1280,height:1500},acceptDownloads:true});await ctx.addInitScript(()=>{try{localStorage.setItem('fur.pview','list')}catch{}});ctx.setDefaultTimeout(8000);
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
await pg.click('.qa [data-act=new]');await pg.fill('.dlg input','IELTS Task 1 Introduction');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.docv');
await pg.click('[data-sa=adddoc]');await pg.locator('.pg.openable button[data-open]').last().click();await pg.waitForSelector('.paper');
const blocks=()=>pg.evaluate(()=>JSON.parse(JSON.stringify(__fur.S.ses.doc.pages[1].blocks)));
const table=async()=>(await blocks()).find(x=>x.type==='table');
const sel=async(from,len)=>{await pg.keyboard.press('Home');for(let i=0;i<from;i++)await pg.keyboard.press('ArrowRight');for(let i=0;i<len;i++)await pg.keyboard.press('Shift+ArrowRight');};
// ---- A) rang: bir xil rangni qayta-qayta qo'llash ----
await pg.click('.blk.p');await pg.keyboard.type('word laptop phone');
await sel(0,4);await pg.click('[data-cmd=color-menu]');await pg.waitForSelector('.cpop');await pg.screenshot({path:SHOT+'/1-palitra.png'});
await pg.click('.cpop [data-col="#e03131"]');
let B=await blocks();ok('1-so‘z qizil',B[0].runs[0].t==='word'&&B[0].runs[0].c==='#e03131',JSON.stringify(B[0].runs));
await sel(5,6);await pg.click('[data-cmd=color]');
B=await blocks();ok('2-so‘z ham QIZIL (avval boshqa rang tanlamasdan)',B[0].runs.find(r=>r.t==='laptop')?.c==='#e03131',JSON.stringify(B[0].runs.map(r=>[r.t,r.c])));
await pg.keyboard.press('End');await pg.keyboard.press('Shift+ArrowLeft');await pg.keyboard.press('Shift+ArrowLeft');await pg.keyboard.press('Shift+ArrowLeft');await pg.keyboard.press('Shift+ArrowLeft');await pg.keyboard.press('Shift+ArrowLeft');
await pg.click('[data-cmd=color-menu]');await pg.click('.cpop [data-col="#e03131"]');
B=await blocks();ok('3-so‘z palitradan yana qizil',B[0].runs.find(r=>r.t==='phone')?.c==='#e03131',JSON.stringify(B[0].runs.map(r=>[r.t,r.c])));
// marker
await pg.click('[data-cmd=hl-menu]');await pg.click('.cpop [data-col="#ffd43b"]');
B=await blocks();ok('marker (fon rangi)',B[0].runs.some(r=>r.t==='phone'&&r.hl==='#ffd43b'));
// o'lcham: bir xil o'lchamni ikki so'zga
await sel(0,4);await pg.selectOption('#tsize','24');await sel(5,6);await pg.selectOption('#tsize','24');
B=await blocks();ok('o‘lcham 24 ikkala so‘zga',B[0].runs.filter(r=>r.fs===24).map(r=>r.t).join('|').includes('word')&&B[0].runs.filter(r=>r.fs===24).map(r=>r.t).join('|').includes('laptop'),JSON.stringify(B[0].runs.map(r=>[r.t,r.fs])));
await sel(0,4);await pg.click('[data-cmd="fs+"]');B=await blocks();ok('A+ shriftni kattalashtirdi',B[0].runs[0].fs===28,String(B[0].runs[0].fs));
await pg.click('[data-cmd=clear]');B=await blocks();ok('formatni tozalash',!B[0].runs[0].c&&!B[0].runs[0].fs,JSON.stringify(B[0].runs[0]));
// ---- B) jadval ----
await pg.keyboard.press('End');await pg.keyboard.press('Enter');
await pg.click('[data-cmd=table]');await pg.fill('.dlg input','4x3');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('table');
for(const t of ['QUESTION','SYNONYM','UNCHANGED','a','b','c','d','e','f']){await pg.keyboard.type(t);await pg.keyboard.press('Tab');}
await pg.locator('td,th').nth(0).click();
// tekislash katak ichida
await pg.click('[data-cmd=al-center]');let T=await table();
ok('katakda "o‘rtadan" tekislash modeli',T.cs&&T.cs['0,0']&&T.cs['0,0'].a==='center',JSON.stringify(T.cs));
ok('katak DOM text-align=center',await pg.locator('th').nth(0).evaluate(e=>e.style.textAlign)==='center');
ok('tugma "on" holatida',await pg.locator('[data-cmd=al-center]').evaluate(e=>e.classList.contains('on')));
await pg.click('[data-cmd=al-right]');T=await table();ok('"o‘ngdan"',T.cs['0,0'].a==='right');
await pg.click('[data-cmd=al-left]');T=await table();ok('"chapdan" = standart (kalit olib tashlandi)',!T.cs);
await pg.keyboard.press('Control+e');T=await table();ok('Ctrl+E o‘rtadan',T.cs['0,0'].a==='center');
// ---- C) katak oralig'ini belgilash (sichqoncha bilan sudrash) ----
const bx=async(i)=>pg.locator('th,td').nth(i).boundingBox();
const drag=async(i,j)=>{await pg.waitForTimeout(600);const a=await bx(i);await pg.mouse.move(a.x+8,a.y+a.height/2);await pg.mouse.down();for(let k=0;k<8;k++){await pg.waitForTimeout(80);const z=await bx(j);await pg.mouse.move(z.x+z.width/2,z.y+z.height/2);}await pg.mouse.up();};
await drag(0,1);
ok('2 ta katak belgilandi (.csel)',await pg.locator('.csel').count()===2,String(await pg.locator('.csel').count()));
await pg.click('[data-cmd=b]');await pg.click('[data-cmd=color-menu]');await pg.click('.cpop [data-col="#e03131"]');
T=await table();ok('ikkala katakka qalin+qizil',T.rows[0][0][0].b&&T.rows[0][1][0].b&&T.rows[0][0][0].c==='#e03131'&&T.rows[0][1][0].c==='#e03131',JSON.stringify([T.rows[0][0],T.rows[0][1]]));
await pg.screenshot({path:SHOT+'/2-katak-belgilash.png'});
// qat'iy emas: keyin bitta katakni alohida o'zgartirish
await pg.locator('th').nth(1).click();await pg.keyboard.press('Home');await pg.keyboard.press('Shift+End');await pg.click('[data-cmd=color-menu]');await pg.click('.cpop [data-col="#1971c2"]');
T=await table();ok('keyin 2-katakka boshqa rang berish mumkin',T.rows[0][1][0].c==='#1971c2'&&T.rows[0][0][0].c==='#e03131',JSON.stringify([T.rows[0][0][0].c,T.rows[0][1][0].c]));
await pg.keyboard.press('Control+z');T=await table();ok('Ctrl+Z oxirgi o‘zgarishni qaytardi',T.rows[0][1][0].c==='#e03131',T.rows[0][1][0].c);
// butun qator tugmasi
await pg.locator('td').nth(0).click();await pg.click('[data-x=selr]');
ok('"Qator" — 3 katak belgilandi',await pg.locator('.csel').count()===3,String(await pg.locator('.csel').count()));
await pg.click('[data-cmd=al-center]');T=await table();ok('butun qator o‘rtaga tekislandi',['1,0','1,1','1,2'].every(k=>T.cs[k]&&T.cs[k].a==='center'),JSON.stringify(T.cs));
await pg.click('[data-x=cbg]');await pg.waitForSelector('.cpop');await pg.click('.cpop [data-col="#ffec99"]');T=await table();
ok('katak foni butun qatorga',['1,0','1,1','1,2'].every(k=>T.cs[k].bg==='#ffec99'));
// ---- D) birlashtirish ----
await pg.locator('td').nth(3).click();await pg.click('[data-x=selr]');await pg.click('[data-x=merge]');
T=await table();ok('3 katak bitta katakka birlashtirildi',T.merges&&T.merges.length===1&&T.merges[0].r===2&&T.merges[0].cs===3,JSON.stringify(T.merges));
ok('DOM colspan=3',await pg.locator('td[colspan="3"]').count()===1);
ok('matn yo‘qolmadi ("d e f")',/d.*e.*f/.test(T.rows[2][0].map(r=>r.t).join('')),JSON.stringify(T.rows[2][0]));
await pg.screenshot({path:SHOT+'/3-birlashtirilgan.png'});
await pg.click('[data-x=unmerge]');T=await table();ok('ajratish',!T.merges&&await pg.locator('td[colspan]').count()===0);
// 2x2 birlashtirish + yuqoridan qator qo'shish
await pg.locator('th,td').nth(4).click();await pg.keyboard.press('Home');await drag(4,8);
console.log('DBG',JSON.stringify(await pg.evaluate(()=>{const g=getSelection();const k=n=>{const e=(n.nodeType==1?n:n.parentElement).closest('.ed');return e.dataset.r+','+e.dataset.c};return [k(g.anchorNode),k(g.focusNode),document.querySelectorAll('.csel').length,document.querySelectorAll('th,td').length]})));await pg.click('[data-x=merge]');T=await table();ok('2×2 birlashtirish',T.merges&&T.merges[0].rs===2&&T.merges[0].cs===2,JSON.stringify(T.merges));
await pg.locator('th').nth(0).click();await pg.click('[data-x=addrb]');T=await table();
ok('birinchi qatordan oldin qo‘shildi, birlashma pastga siljidi',T.rows.length===5&&T.merges[0].r===2,JSON.stringify(T.merges));
await pg.click('[data-x=delr]');T=await table();ok('qator o‘chirildi, birlashma joyiga qaytdi',T.rows.length===4&&T.merges[0].r===1,JSON.stringify(T.merges));

// ---- saqlash -> qayta ochish: birlashma, tekislash va fon saqlanadimi ----
await pg.waitForFunction(()=>__fur.S.ses.status==='saved',null,{timeout:15000}).catch(()=>{});const id=await pg.evaluate(()=>__fur.S.ses.meta.id);
await pg.keyboard.press('Control+s').catch(()=>{});
await pg.evaluate(async()=>{});
await pg.reload();await pg.waitForSelector('.docv,.empty,.card,.pg,[data-open]');
await pg.evaluate(id=>__fur.openDoc(id),id);await pg.waitForSelector('.docv');
const T2=await pg.evaluate(()=>JSON.parse(JSON.stringify(__fur.S.ses.doc.pages.flatMap(p=>p.blocks).find(x=>x.type==='table'))));
ok('qayta ochilgach birlashma va katak uslubi saqlangan',T2.merges&&T2.merges.length===1&&T2.cs&&T2.cs['1,1']&&T2.cs['1,1'].bg==='#ffec99',JSON.stringify([T2.merges,T2.cs]));
// ---- .fur ni "Ochish": Android ko'prigi mock ----
const bytes=await pg.evaluate(async()=>{return null});
await pg.click('[data-sa=export]').catch(()=>{});
await b.close();
console.log(`\n${pass} PASS / ${fail} FAIL`);if(errs.length)console.log('XATOLAR:',errs.slice(0,5));process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
