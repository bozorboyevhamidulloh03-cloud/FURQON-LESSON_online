const {chromium}=require('/opt/npm-tools/node_modules/playwright');const {spawn}=require('child_process');const fs=require('fs');
const SHOT=process.argv[2]||'/home/claude/fur-holo/docs/shots8';fs.mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
const relay=spawn('node',['/home/claude/fur-holo/tools/fur-relay.cjs','18886'],{env:{...process.env,NODE_PATH:'/opt/npm-tools/node_modules'},stdio:'inherit'});
const SRV='ws://localhost:18886';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await sleep(500);const b=await chromium.launch();const errs=[];
const mk=async(vp,nm)=>{const c=await b.newContext({viewport:vp});await c.addInitScript(()=>{try{localStorage.setItem('fur.pview','list')}catch{}});c.setDefaultTimeout(15000);const p=await c.newPage();p.on('pageerror',e=>errs.push(nm+': '+e.message));await p.goto('http://localhost:8765/');return p;};
const T=await mk({width:1200,height:800},'T');await T.waitForSelector('.empty');
await T.click('.qa [data-act=new]');await T.fill('.dlg input','Birga yozish');await T.click('.dlg [data-x="1"]');await T.waitForSelector('.docv');
await T.evaluate(()=>{__fur.S.ses.doc.pages[0].objects=[{t:'text',id:'t0',x:60,y:60,tx:'Ustoz yozdi',s:36,c:'#111111'}]});
await T.click('[data-sa=live]');await T.waitForSelector('#srv');await T.fill('#srv',SRV);await T.click('.dlg [data-v=go]');await T.waitForSelector('#bcode');
const code=(await T.locator('#bcode').innerText()).trim();
const join=async(nm)=>{const S=await mk({width:900,height:640},nm);await S.waitForSelector('.empty');await S.click('[data-act=join]');await S.fill('#jc',code);await S.fill('#jn',nm);await S.fill('#js',SRV);await S.click('.dlg [data-v=go]');await S.waitForSelector('.pres');return S;};
const A=await join('Vali'),B=await join('Ali');
await T.waitForFunction(()=>document.querySelectorAll('#rost .rl').length===2);
ok('1: ruxsatsiz o‘quvchida yozish tugmasi yo‘q',await A.locator('[data-p=write]').isHidden());
// ruxsat: faqat Vali ga
await T.locator('#rost .rl').filter({hasText:'Vali'}).locator('[data-pm$=":wr"]').click();await A.waitForSelector('[data-p=write]:not([hidden])');
ok('2: ruxsatdan keyin Valida yozish tugmasi chiqdi',true);ok('2: Alida chiqmadi',await B.locator('[data-p=write]').isHidden());
await A.click('[data-p=write]');await A.waitForSelector('[data-p=wcol]:not([hidden])');
const box=await A.locator('.pres-stage').boundingBox();
await A.mouse.move(box.x+300,box.y+200);await A.mouse.down();for(let k=0;k<20;k++)await A.mouse.move(box.x+300+k*12,box.y+200+Math.sin(k/3)*40);await A.mouse.up();await A.waitForTimeout(300);
await T.close;
const n1=await T.evaluate(()=>__fur.S.ses.doc.pages[0].objects.filter(o=>o.t==='stroke').length);
await T.waitForFunction(()=>__fur.S.ses.doc.pages[0].objects.filter(o=>o.t==='stroke').length===1,null,{timeout:8000});ok('3: ustozning doskasida o‘quvchi chizgani paydo bo‘ldi',true);
const so=await T.evaluate(()=>__fur.S.ses.doc.pages[0].objects.find(o=>o.t==='stroke'));ok('3: chiziq to‘g‘ri (nuqtalar, rang)',so.pts.length>=15&&/^#/.test(so.c),so.pts.length+' nuqta '+so.c);
const nonWhite=async(P)=>P.evaluate(()=>{const c=document.querySelector('.pres-stage canvas');const g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4){if(d[i]>200&&d[i+1]<80&&d[i+2]<80)n++;}return n;});
await B.waitForTimeout(1500);const nb=await nonWhite(B);ok('4: boshqa o‘quvchi (Ali) ham chizilgan chiziqni ko‘rdi',nb>50,'qizil px='+nb);
const na=await nonWhite(A);ok('4: Vali o‘zida ham ko‘radi',na>50,'qizil px='+na);
await A.screenshot({path:SHOT+'/birga-yozish-oquvchi.png'});await T.screenshot({path:SHOT+'/birga-yozish-ustoz.png'});
// 5. Ali yoza olmaydi (xavfsizlik): to'g'ridan-to'g'ri xabar yuborsa ham qabul qilinmaydi — ruxsatsiz
// 6. qaytarish
await A.click('[data-p=wundo]');await T.waitForFunction(()=>__fur.S.ses.doc.pages[0].objects.filter(o=>o.t==='stroke').length===0,null,{timeout:8000});ok('6: o‘quvchi qaytarganda ustozdan ham o‘chdi',true);
// 7. ruxsat olinadi
await T.locator('#rost .rl').filter({hasText:'Vali'}).locator('[data-pm$=":wr"]').click();await A.waitForSelector('[data-p=write][hidden]',{state:'attached'});ok('7: ruxsat olingach yozish tugmasi yo‘qoldi',true);
ok('xatolar yo‘q',errs.length===0,errs.join('|'));
console.log('\n'+pass+' o‘tdi, '+fail+' yiqildi');relay.kill();await b.close();process.exit(fail?1:0);})();
