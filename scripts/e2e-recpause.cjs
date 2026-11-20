// Yozuvni pauza qilish / davom ettirish testi
const {chromium}=require('/opt/npm-tools/node_modules/playwright');const fs=require('fs');const {execSync}=require('child_process');
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const ctx=await b.newContext({viewport:{width:1100,height:700},permissions:['microphone','camera'],acceptDownloads:true});ctx.setDefaultTimeout(15000);
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
await pg.click('.qa [data-act=new]');await pg.fill('.dlg input','Pauza');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.docv');
await pg.click('[data-sa=addboard]');await pg.waitForTimeout(200);
await pg.evaluate(()=>{__fur.S.ses.doc.pages[0].objects=[{t:'rect',id:'r1',x1:100,y1:100,x2:500,y2:300,c:'#e03131',w:8}]});
await pg.click('[data-sa=present]').catch(async()=>{await pg.click('[data-act=present]')});await pg.waitForSelector('.pres');
ok('pauza tugmasi yozishdan oldin yashirin',await pg.locator('[data-p=recp]').isHidden());
await pg.click('[data-p=rec]');await pg.waitForTimeout(1800);
ok('pauza tugmasi yozish boshlanganda ko‘rinadi',await pg.locator('[data-p=recp]').isVisible());
ok('REC belgisi ko‘rinadi',(await pg.locator('#prb').innerText()).includes('REC'));
await pg.click('[data-p=recp]');await pg.waitForTimeout(300);
ok('pauzada belgi "PAUZA"',(await pg.locator('#prb').innerText()).includes('PAUZA'));
const t1=await pg.locator('#prb b').innerText();await pg.waitForTimeout(3000);const t2=await pg.locator('#prb b').innerText();
ok('pauza vaqtida taymer to‘xtaydi',t1===t2,t1+' → '+t2);
await pg.click('[data-p=recp]');await pg.waitForTimeout(300);
ok('davom ettirilganda belgi "REC"',(await pg.locator('#prb').innerText()).includes('REC'));
await pg.waitForTimeout(1800);
const t3=await pg.locator('#prb b').innerText();ok('davom ettirilgach taymer yurdi',t3!==t2,t2+' → '+t3);
// pauza holatida to'xtatish ham saqlashi kerak
await pg.click('[data-p=recp]');await pg.waitForTimeout(300);
const dl=pg.waitForEvent('download');await pg.click('[data-p=rec]');const d=await dl;
const f='/tmp/recpause.webm';await d.saveAs(f);const sz=fs.statSync(f).size;ok('pauzadan to‘xtatilganda ham fayl saqlandi',sz>2000,sz+' bayt');
let dur=0;try{const o=execSync(`ffmpeg -i ${f} -f null - 2>&1`).toString();const m=[...o.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();dur=m?(+m[1])*3600+(+m[2])*60+parseFloat(m[3]):0}catch(e){const m=[...String(e.stdout||'').matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();dur=m?(+m[1])*3600+(+m[2])*60+parseFloat(m[3]):0}
console.log('   yozuv davomiyligi ≈',dur,'s (kutilgan ≈ 3.6s; pauza 3s hisobga olinmaydi)');
ok('pauza vaqti yozuvga kirmagan (<6.5s)',dur>0&&dur<6.5,String(dur));
ok('to‘xtatgach tugma va belgi yashirildi',await pg.locator('[data-p=recp]').isHidden()&&await pg.locator('#prb').isHidden());
ok('xatolar yo‘q',errs.length===0,errs.join('|'));
console.log('\n'+pass+' o‘tdi, '+fail+' yiqildi');await b.close();process.exit(fail?1:0);})();
