const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const SHOT=process.argv[2]||'/home/claude/fur-platform/docs/shots3';require('fs').mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1280,height:900}});await ctx.addInitScript(()=>{try{localStorage.setItem('fur.pview','list')}catch{}});ctx.setDefaultTimeout(8000);
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
await pg.click('header [data-act=new]');await pg.fill('.dlg input','Fizika: Nyuton qonunlari');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.docv');
await pg.click('[data-sa=addboard]');await pg.locator('.pg.openable').last().click();await pg.waitForSelector('#bc');await pg.waitForTimeout(200);
const O=()=>pg.evaluate(()=>JSON.parse(JSON.stringify(__board.page.objects)));
const V=()=>pg.evaluate(()=>({...__board.v}));
const box=await pg.locator('#bc').boundingBox();const X=x=>box.x+x,Y=y=>box.y+y;
const drag=async(pts,steps=1)=>{await pg.mouse.move(X(pts[0][0]),Y(pts[0][1]));await pg.mouse.down();for(const p of pts.slice(1))await pg.mouse.move(X(p[0]),Y(p[1]),{steps});await pg.mouse.up();};
const tool=async t=>pg.click(`[data-tool=${t}]`);
ok('doska ochildi (canvas, asboblar)',await pg.locator('#bc').isVisible()&&await pg.locator('button[data-tool]').count()===10);
// 1) qalam
await tool('pen');await pg.click('[data-c="#1971c2"]');await pg.click('[data-w="1"]');
await drag([[120,120],[160,90],[220,150],[280,100],[340,140]],8);
let o=await O();ok('qalam chizig‘i',o.length===1&&o[0].t==='stroke'&&o[0].pts.length>5&&o[0].c==='#1971c2',JSON.stringify([o.length,o[0]&&o[0].pts.length]));
// 2) shakllar
await tool('rect');await pg.click('[data-c="#e03131"]');await drag([[120,220],[300,330]]);
await tool('ellipse');await pg.click('[data-c="#2f9e44"]');await drag([[360,220],[520,330]]);
await tool('arrow');await pg.click('[data-c="#111111"]');await drag([[300,275],[360,275]]);
await tool('line');await drag([[120,380],[520,380]]);
o=await O();ok('to‘rtburchak, ellips, strelka, chiziq',o.map(x=>x.t).join()==='stroke,rect,ellipse,arrow,line',o.map(x=>x.t).join());
// 3) marker
await tool('hl');await pg.click('[data-c="#f08c00"]');await drag([[120,160],[340,160]],6);o=await O();ok('marker (shaffof)',o[o.length-1].hl===true);
// 4) matn
await tool('text');await pg.click('[data-c="#111111"]');await pg.click('[data-w="2"]');await pg.mouse.click(X(560),Y(120));await pg.waitForSelector('.dlg input');
await pg.fill('.dlg input','F = m · a\\nIkkinchi qonun');await pg.click('.dlg [data-x="1"]');await pg.waitForTimeout(100);
o=await O();const T=o.find(x=>x.t==='text');ok('matn qo‘shildi (ko‘p qatorli)',!!T&&T.tx==='F = m · a\nIkkinchi qonun',JSON.stringify(T));
// 5) o'chirg'ich
const n0=(await O()).length;await tool('eraser');await drag([[200,380],[210,380]]);o=await O();ok('o‘chirg‘ich chiziqni o‘chirdi',o.length===n0-1&&!o.some(x=>x.t==='line'));
// 6) orqaga/oldinga
await pg.click('[data-b=undo]');o=await O();ok('orqaga: chiziq qaytdi',o.some(x=>x.t==='line'));
await pg.click('[data-b=redo]');o=await O();ok('oldinga: chiziq yana yo‘q',!o.some(x=>x.t==='line'));
await pg.keyboard.press('Control+z');o=await O();ok('Ctrl+Z ishlaydi',o.some(x=>x.t==='line'));
// 7) tanlash/ko'chirish/o'chirish
await tool('select');const r0=(await O()).find(x=>x.t==='rect');await drag([[210,275],[250,305]],4);const r1=(await O()).find(x=>x.t==='rect');
ok('tanlab ko‘chirildi',Math.abs((r1.x1-r0.x1)-40)<2&&Math.abs((r1.y1-r0.y1)-30)<2,`${r1.x1-r0.x1},${r1.y1-r0.y1}`);
await pg.keyboard.press('Delete');o=await O();ok('Delete tanlanganni o‘chirdi',!o.some(x=>x.t==='rect'));await pg.keyboard.press('Control+z');
// matnni tahrirlash
await pg.mouse.dblclick(X(580),Y(135));await pg.waitForSelector('.dlg input');await pg.fill('.dlg input','F = m · a\\nNyutonning 2-qonuni');await pg.click('.dlg [data-x="1"]');await pg.waitForTimeout(100);
ok('matn tahrirlandi',(await O()).find(x=>x.t==='text').tx.includes('Nyutonning'));
// 8) zoom/surish
const v0=await V();await pg.mouse.move(X(400),Y(300));await pg.keyboard.down('Control');await pg.mouse.wheel(0,-300);await pg.keyboard.up('Control');await pg.waitForTimeout(100);const v1=await V();
ok('Ctrl+g‘ildirak: zoom',v1.s>v0.s*1.5,`${v0.s}->${v1.s}`);
await pg.mouse.wheel(0,200);await pg.waitForTimeout(80);const v2=await V();ok('g‘ildirak: surish',v2.y<v1.y);
await pg.click('[data-b=fit]');await pg.waitForTimeout(100);const v3=await V();ok('sig‘dirish',v3.s>0.1&&v3.s<4);
await tool('hand');const v4=await V();await drag([[300,300],[360,340]],4);const v5=await V();ok('surish asbobi',Math.abs(v5.x-v4.x-60)<3);
await pg.click('[data-b=fit]');
// 9) rasm
await pg.setInputFiles('#bimg','/home/claude/fur/im-1.png');await pg.waitForFunction(()=>__board.page.objects.some(x=>x.t==='image'),null,{timeout:5000}).catch(()=>{});await pg.waitForTimeout(300);o=await O();
ok('rasm qo‘shildi (asset + obyekt)',o.some(x=>x.t==='image')&&await pg.evaluate(()=>__fur.S.ses.doc.assets.length)===1);
// 10) fon
await pg.click('[data-b=bg]');ok('fon almashdi (oq)',await pg.evaluate(()=>__board.page.bg)==='white');await pg.click('[data-b=bg]');await pg.click('[data-b=bg]');ok('fon: katakka qaytdi',await pg.evaluate(()=>__board.page.bg)==='grid');
await pg.click('[data-b=fit]');await pg.waitForTimeout(150);
await pg.screenshot({path:SHOT+'/1-doska.png'});
// 11) saqlash va qayta ochish
const cnt=(await O()).length;await pg.waitForFunction(()=>__fur.S.ses.status==='saved',null,{timeout:6000});
await pg.click('[data-act=pages]');await pg.click('[data-act=back]');await pg.waitForSelector('.card');await pg.click('.card');await pg.waitForSelector('.docv');
await pg.locator('.pg.openable').last().click();await pg.waitForSelector('#bc');await pg.waitForTimeout(400);
const o2=await O();ok('saqlangan doska qayta ochildi',o2.length===cnt&&o2.some(x=>x.t==='image')&&o2.some(x=>x.t==='text'),`${o2.length}/${cnt}`);
ok('rasm qayta chizilmoqda (asset bor)',await pg.evaluate(()=>__fur.S.ses.doc.assets.length)===1);
await pg.screenshot({path:SHOT+'/2-qayta-ochildi.png'});
// 12) qora fon + marker ko'rinishi
await pg.click('[data-b=bg]');await pg.click('[data-b=bg]');await pg.waitForTimeout(100);await pg.screenshot({path:SHOT+'/3-qora-fon.png'});
// 13) sahifalar ro'yxati
await pg.click('[data-act=pages]');await pg.waitForSelector('.plist2');await pg.waitForTimeout(100);ok('doska sahifa ro‘yxatida obyektlar soni',(await pg.locator('.pginfo').last().innerText()).includes('obyekt'));
// 14) mobil
const m=await b.newContext({viewport:{width:390,height:820},hasTouch:true,isMobile:true,deviceScaleFactor:2});await m.addInitScript(()=>{try{localStorage.setItem('fur.pview','list')}catch{}});const mp=await m.newPage();mp.on('pageerror',e=>errs.push(e.message));
await mp.goto('http://localhost:8765/');await mp.waitForSelector('.empty');
await mp.evaluate(async()=>{});
await mp.click('header [data-act=new]');await mp.fill('.dlg input','Mobil');await mp.click('.dlg [data-x="1"]');await mp.waitForSelector('.docv');await mp.click('[data-sa=addboard]');await mp.locator('.pg.openable').last().click();await mp.waitForSelector('#bc');
const bb=await mp.locator('#bc').boundingBox();
await mp.evaluate(()=>{const p=__board.page;p.objects.push({t:'stroke',id:'s1',pts:[[-100,-40],[-60,-80],[0,-20],[60,-70],[110,-30]],c:'#e03131',w:6,hl:false},{t:'rect',id:'r1',x1:-100,y1:20,x2:100,y2:100,c:'#1971c2',w:4},{t:'text',id:'t1',x:-80,y:40,tx:'Salom, doska!',s:30,c:'#111111'});__board.fit();});
await mp.waitForTimeout(300);await mp.screenshot({path:SHOT+'/4-mobil-doska.png'});
// teginish: 1 barmoq chizadi, qalamdan keyin teginish faqat suradi
const cdp=await m.newCDPSession(mp);
const touch=async(pts)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pts[0][0],y:pts[0][1]}]});for(const p of pts.slice(1))await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p[0],y:p[1]}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
const n1=await mp.evaluate(()=>__board.page.objects.length);await mp.click('[data-tool=pen]');await touch([[60,400],[120,440],[200,420],[260,470]]);
ok('mobil: barmoq bilan chizish',await mp.evaluate(()=>__board.page.objects.length)===n1+1);
ok('konsolda xato yo‘q',errs.length===0,errs.join(' | '));
console.log(`\n${pass} o‘tdi, ${fail} yiqildi`);await b.close();process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
