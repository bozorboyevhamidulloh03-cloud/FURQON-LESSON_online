const {chromium}=require('/opt/npm-tools/node_modules/playwright');const {spawn}=require('child_process');const fs=require('fs');
const SHOT=process.argv[2]||'/home/claude/fur-platform/docs/shots8';fs.mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
const relay=spawn('node',['/home/claude/fur-platform/tools/fur-relay.cjs','18885'],{env:{...process.env,NODE_PATH:'/opt/npm-tools/node_modules'},stdio:'inherit'});
const SRV='ws://localhost:18885';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await sleep(500);const b=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});const errs=[];
const mk=async(vp)=>{const c=await b.newContext({viewport:vp,permissions:['microphone','camera']});await c.addInitScript(()=>{try{localStorage.setItem('fur.pview','list')}catch{}});c.setDefaultTimeout(15000);const p=await c.newPage();p.on('pageerror',e=>errs.push(e.message));await p.goto('http://localhost:8765/');return p;};
const T=await mk({width:1200,height:800});await T.waitForSelector('.empty');
await T.click('header [data-act=new]');await T.fill('.dlg input','Ovoz');await T.click('.dlg [data-x="1"]');await T.waitForSelector('.docv');
await T.click('[data-sa=live]');await T.waitForSelector('#srv');await T.fill('#srv',SRV);await T.click('.dlg [data-v=go]');await T.waitForSelector('#bcode');
const code=(await T.locator('#bcode').innerText()).trim();
const S=await mk({width:700,height:600});await S.waitForSelector('.empty');
await S.click('[data-act=join]');await S.fill('#jc',code);await S.fill('#jn','Vali');await S.fill('#js',SRV);await S.click('.dlg [data-v=go]');await S.waitForSelector('.pres');
await T.waitForSelector('#rost li .tb');ok('1: ro‘yxatda o‘quvchi va ruxsat tugmalari',true);
// 2. ruxsatsiz o'quvchi mikrofon yoqa olmaydi
ok('2: o‘quvchida mikrofon tugmasi bor',await S.locator('[data-p=mic]').count()===1);
await S.click('[data-p=mic]');await S.waitForTimeout(400);
const st0=await S.locator('#pst').innerText();ok('2: ruxsatsiz — ogohlantirish',/ruxsat/i.test(st0),st0);
const on0=await S.locator('[data-p=mic].on').count();ok('2: ruxsatsiz mikrofon yoqilmadi',on0===0);
// 3. ustoz ruxsat beradi
await T.click('[data-pm$=":mic"]');await T.waitForTimeout(600);
await S.click('[data-p=mic]');await S.waitForTimeout(800);
ok('3: ruxsatdan keyin mikrofon yondi',await S.locator('[data-p=mic].on').count()===1);
await T.waitForFunction(()=>[...document.querySelectorAll('#fur-media .mtile')].length===1,null,{timeout:15000});
const tt=await T.evaluate(async()=>{const v=document.querySelector('#fur-media video');await new Promise(r=>setTimeout(r,1200));const s=v.srcObject;return {a:s.getAudioTracks().length,live:s.getAudioTracks().some(t=>t.readyState==='live'),lab:document.querySelector('#fur-media .mlab').textContent}});
ok('3: ustoz o‘quvchi ovozini oldi (plitka + audio trek)',tt.a>=1&&tt.live,JSON.stringify(tt));
await T.screenshot({path:SHOT+'/ovoz-ustoz.png'});
// 4. ustoz o'z mikrofon/kamerasini yoqadi — o'quvchi eshitadi/ko'radi
await T.click('[data-m=mic]');await T.click('[data-m=cam]');await T.waitForTimeout(500);
await S.waitForFunction(()=>document.querySelector('#fur-media .mtile'),null,{timeout:15000});
const st=await S.evaluate(async()=>{await new Promise(r=>setTimeout(r,1500));const v=document.querySelector('#fur-media video');const s=v.srcObject;return {a:s.getAudioTracks().length,v:s.getVideoTracks().length,w:v.videoWidth,cam:!document.querySelector('#fur-media .mtile').classList.contains('audio'),lab:document.querySelector('#fur-media .mlab').textContent}});
ok('4: o‘quvchi ustoz ovozi va videosini oldi',st.a>=1&&st.v>=1&&st.w>0,JSON.stringify(st));
ok('4: kamera yoqilganda video plitka ko‘rinadi',st.cam);
await S.screenshot({path:SHOT+'/ovoz-oquvchi.png'});
// 5. ruxsat qaytarib olinadi
await T.click('[data-pm$=":mic"]');await T.waitForTimeout(800);
ok('5: ruxsat olingach o‘quvchi mikrofoni o‘chdi',await S.locator('[data-p=mic].on').count()===0);
ok('xatolar yo‘q',errs.length===0,errs.join('|'));
console.log('\n'+pass+' o‘tdi, '+fail+' yiqildi');relay.kill();await b.close();process.exit(fail?1:0);})();
