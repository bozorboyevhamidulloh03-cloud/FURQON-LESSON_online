const {chromium}=require('/opt/npm-tools/node_modules/playwright');
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:900,height:700}});await ctx.addInitScript(()=>{try{localStorage.setItem('fur.pview','list')}catch{}});ctx.setDefaultTimeout(10000);const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.addInitScript(()=>{window.__calls=[];window.FurNative={saveFile:(n,m,b,l)=>window.__calls.push(['save',n,m,b,l]),version:()=>JSON.stringify({web:7,apk:1}),checkUpdate:()=>window.__calls.push(['check']),openExternal:u=>window.__calls.push(['ext',u])};});
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
ok('Yangilanish tugmasi faqat ilovada ko‘rinadi (versiya sarlavhasi bilan)',await pg.locator('[data-act=update]').count()===1&&(await pg.locator('[data-act=update]').getAttribute('title'))==='Versiya: web 7, APK 1');
await pg.click('[data-act=update]');ok('Yangilanish tugmasi native.checkUpdate() ni chaqiradi',(await pg.evaluate(()=>__calls.some(c=>c[0]==='check'))));
ok('ilovada service worker ro‘yxatga olinmadi',(await pg.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).length))===0);
await pg.click('.qa [data-act=new]');await pg.fill('.dlg input','Native sinov');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.docv');
ok('orqaga tugmasi: dars → fayllar ro‘yxati',await pg.evaluate(()=>__furBack())===true&&await pg.locator('.card,.empty').first().isVisible()&&await pg.locator('.docv').count()===0);
ok('fayllar ro‘yxatida orqaga: false (ilovadan chiqish mumkin)',await pg.evaluate(()=>__furBack())===false);
await pg.click('.qa [data-act=newfolder]');await pg.waitForSelector('.dlg');ok('orqaga tugmasi dialogni yopadi',await pg.evaluate(()=>__furBack())===true&&await pg.locator('.dlg').count()===0);
// eksport native orqali
await pg.waitForSelector('.card');await pg.locator('.card').first().click();await pg.waitForSelector('.docv');await pg.click('[data-sa=export]');await pg.waitForTimeout(600);
const calls=await pg.evaluate(()=>__calls.filter(c=>c[0]==='save'));
ok('eksport: saveFile chaqirildi (.fur nomi, oxirgi bo‘lak belgisi)',calls.length>=1&&/Native sinov\.fur$/.test(calls[0][1])&&calls[calls.length-1][4]===true,JSON.stringify(calls.map(c=>[c[1],c[3].length,c[4]])));
const bin=Buffer.from(calls.map(c=>c[3]).join(''),'base64');ok('eksport baytlari ZIP (PK) va to‘liq',bin[0]===0x50&&bin[1]===0x4b&&bin.length>200,String(bin.length));
ok('konsolda xato yo‘q',errs.length===0,errs.join(' | '));
console.log(`\n${pass} o‘tdi, ${fail} yiqildi`);await b.close();process.exit(fail?1:0);})().catch(e=>{console.error(e);process.exit(1)});
