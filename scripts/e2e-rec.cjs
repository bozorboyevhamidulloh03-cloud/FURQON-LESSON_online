const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const SHOT=process.argv[2]||'/tmp/shots-r';require('fs').mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1100,height:800}});ctx.setDefaultTimeout(8000);
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
// --- Efirga qaytish kartasi: saqlangan o'quvchi holati
await pg.evaluate(()=>{localStorage.setItem('fur.live',JSON.stringify({role:'student',code:'0K7M2Q9XA4TDP',name:'Ali',title:'Kimyo 9-A',at:Date.now()}));});
await pg.reload();await pg.waitForSelector('.livecard');
ok('"Efirga qaytish" kartasi chiqdi',/Kimyo 9-A/.test(await pg.locator('.livecard').innerText()));
await pg.screenshot({path:SHOT+'/1-efir-karta.png'});
await pg.click('[data-act=dismisslive]');ok('karta yopiladi',await pg.locator('.livecard').count()===0);
// --- darslar: 3 ta dars yaratish
for(const t of ['A dars','B dars','C dars']){await pg.click('.qa [data-act=new]').catch(async()=>{await pg.click('[data-act=new]')});await pg.fill('.dlg input',t);await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.docv');await pg.click('[data-act=back]');await pg.waitForSelector('.card');}
ok('3 ta dars',await pg.locator('.card').count()===3);
// menyu endi oyna (ekrandan chiqib ketmaydi) va "Butunlay o'chirish" bor
await pg.locator('.card [data-act=menu]').first().click();await pg.waitForSelector('.sheetl');
const items=await pg.locator('.sheetl .sbtn').allInnerTexts();ok('menyuda "Butunlay o‘chirish" bor',items.some(x=>/Butunlay/.test(x)),items.join('|'));
const bb=await pg.locator('.dlg').boundingBox();ok('menyu to‘liq ekranda',bb.y>=0&&bb.y+bb.height<=800,JSON.stringify(bb));
await pg.screenshot({path:SHOT+'/2-menyu.png'});
await pg.click('.sbtn.dng');await pg.waitForSelector('.dlg .btn.dng');await pg.click('.dlg .btn.dng');
await pg.waitForFunction(()=>document.querySelectorAll('.card').length===2);ok('bitta dars butunlay o‘chirildi',true);
// tanlab ko'plab o'chirish
await pg.click('[data-act=seltoggle]');await pg.locator('.card').nth(0).click();await pg.locator('.card').nth(1).click();
ok('2 ta tanlandi',/2 ta tanlandi/.test(await pg.locator('.selbar').innerText()));await pg.screenshot({path:SHOT+'/3-tanlash.png'});
await pg.click('[data-act="bulk:trash"]');await pg.waitForFunction(()=>document.querySelectorAll('.card').length===0);
await pg.click('[data-nav=trash]');await pg.waitForSelector('.card');ok('savatda 2 ta',await pg.locator('.card').count()===2);
await pg.click('[data-act=emptytrash]');await pg.click('.dlg .btn.dng');await pg.waitForFunction(()=>document.querySelectorAll('.card').length===0);ok('savat bo‘shatildi (butunlay)',true);
// --- yozuvlar (brauzer zaxirasi): haqiqiy video yozib saqlash
await pg.click('[data-nav=rec]');await pg.waitForSelector('.empty');
const saved=await pg.evaluate(async()=>{const cv=document.createElement('canvas');cv.width=320;cv.height=180;const g=cv.getContext('2d');const st=cv.captureStream(15);const mr=new MediaRecorder(st,{mimeType:'video/webm'});const ch=[];mr.ondataavailable=e=>ch.push(e.data);mr.start(200);for(let i=0;i<20;i++){g.fillStyle=`hsl(${i*18},80%,50%)`;g.fillRect(0,0,320,180);await new Promise(r=>setTimeout(r,100));}await new Promise(r=>{mr.onstop=r;mr.stop()});const blob=new Blob(ch,{type:'video/webm'});
 await __fur.saveRecording(blob,'Kimyo 9-A dars',2000);await __fur.saveRecording(blob,'Fizika 8-B',2000);await __fur.refreshRecs();return blob.size;});
ok('test video yozildi',saved>1000,String(saved));
await pg.waitForSelector('.rrow');ok('2 ta yozuv ro‘yxatda',await pg.locator('.rrow').count()===2);await pg.waitForTimeout(700);await pg.screenshot({path:SHOT+'/4-yozuvlar.png'});
await pg.locator('.rrow').first().click();await pg.waitForSelector('video.recvid');
await pg.waitForFunction(()=>{const v=document.querySelector('video.recvid');return v&&v.readyState>=1},null,{timeout:8000});
ok('ichki pleyer videoni ochdi',true);
await pg.click('[data-sp="1.5"]');ok('tezlik 1.5×',await pg.evaluate(()=>document.querySelector('video.recvid').playbackRate)===1.5);
await pg.screenshot({path:SHOT+'/5-pleyer.png'});await pg.click('.dlg [data-x=close]');
await pg.locator('.rrow [data-act=rdel]').first().click();await pg.click('.dlg .btn.dng');await pg.waitForFunction(()=>document.querySelectorAll('.rrow').length===1);ok('yozuv o‘chirildi',true);
await pg.reload();await pg.click('[data-nav=rec]');await pg.waitForSelector('.rrow');ok('qayta ochilgach 1 ta qolgan',await pg.locator('.rrow').count()===1);
await pg.click('[data-act=seltoggle]');await pg.locator('.rrow').first().click();await pg.click('[data-act="bulk:recdel"]');await pg.click('.dlg .btn.dng');await pg.waitForSelector('.empty');ok('tanlab o‘chirish: yozuvlar tozalandi',true);
await b.close();console.log(`\n${pass} PASS / ${fail} FAIL`);if(errs.length)console.log('XATOLAR',errs.slice(0,4));process.exit(fail?1:0);})().catch(e=>{console.error(e);process.exit(2)});
