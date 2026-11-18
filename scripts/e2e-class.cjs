const {chromium}=require('/opt/npm-tools/node_modules/playwright');const {spawn}=require('child_process');const fs=require('fs');
const SHOT=process.argv[2]||'/home/claude/fur-platform/docs/shots6';fs.mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
const LOG='/tmp/relay.log';try{fs.unlinkSync(LOG)}catch{}
const relay=spawn('node',['/home/claude/fur-platform/tools/fur-relay.cjs','18883'],{env:{...process.env,NODE_PATH:'/opt/npm-tools/node_modules',FUR_RELAY_LOG:LOG},stdio:'inherit'});
const SRV='ws://localhost:18883';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
await sleep(500);
const b=await chromium.launch();const errs=[];
const mk=async(vp,extra={})=>{const c=await b.newContext({viewport:vp,...extra});c.setDefaultTimeout(15000);const p=await c.newPage();p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});await p.goto('http://localhost:8765/');return p;};
const T=await mk({width:1280,height:800});await T.waitForSelector('.empty');
await T.setInputFiles('#file',['/home/claude/imp/IELTS Task 1 Introduction.fur']);await T.waitForFunction(()=>__fur.S.metas.length===1,null,{timeout:20000});
await T.evaluate(()=>__fur.openDoc(__fur.S.metas[0].id));await T.waitForSelector('.docv');
// --- o'qituvchi boshlaydi ---
await T.click('[data-sa=live]');await T.waitForSelector('#srv');await T.fill('#srv',SRV);await T.click('.dlg [data-v=go]');await T.waitForSelector('#bcode');
const code=(await T.locator('#bcode').innerText()).trim();ok('jonli dars kodi chiqdi (9-XXXX-XXXX-XXXX)',/^9-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code),code);
// --- noto'g'ri kod ---
const S1=await mk({width:1280,height:800});await S1.waitForSelector('.empty');
await S1.click('[data-act=join]');await S1.fill('#jc','xyz');await S1.fill('#jn','Ali');await S1.click('.dlg [data-v=go]');await S1.waitForFunction(()=>document.getElementById('jerr').textContent.includes('noto'));ok('noto‘g‘ri kod rad etildi',true);
await S1.fill('#jc',code);await S1.fill('#js',SRV);await S1.click('.dlg [data-v=go]');await S1.waitForSelector('.pres');
await S1.waitForFunction(()=>document.getElementById('pst')&&document.getElementById('pst').textContent.includes('Jonli'),null,{timeout:10000});ok('o‘quvchi ulandi (● Jonli)',true);
ok('o‘quvchi 1/9 sahifani ko‘rdi',(await S1.locator('#pn').innerText())==='1 / 9');
await T.waitForFunction(()=>document.getElementById('livepill')&&document.getElementById('livepill').textContent.includes('· 1'),null,{timeout:8000});ok('o‘qituvchi ro‘yxatida 1 ta o‘quvchi',true);
await T.locator('#rost li').first().waitFor();ok('ro‘yxatda ism: Ali',(await T.locator('#rost').innerText()).includes('Ali'));
await T.screenshot({path:SHOT+'/1-oqituvchi-kod.png'});
const nonWhite=async p=>p.evaluate(()=>{const c=document.querySelector('.pres-stage canvas');if(!c)return 0;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=16)if(d[i]<235||d[i+1]<235||d[i+2]<235)n++;return n});
await S1.waitForFunction(()=>{const c=document.querySelector('.pres-stage canvas');if(!c)return false;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=16)if(d[i]<200)n++;return n>800},null,{timeout:10000});ok('o‘quvchi PDF sahifasi rasmini oldi (asset uzatildi)',true);
// --- sahifa almashtirish ---
await T.click('.dlg [data-v=close]');await T.locator('.pg.openable').nth(3).click();await T.waitForSelector('#bc');
await S1.waitForFunction(()=>document.getElementById('pn').textContent==='4 / 9',null,{timeout:8000});ok('o‘qituvchi 4-sahifani ochdi → o‘quvchida 4/9',true);
await S1.waitForTimeout(800);
// --- chizish (ops) ---
const red=async p=>p.evaluate(()=>{const c=document.querySelector('.pres-stage canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+1]<90&&d[i+2]<90)n++;return n});
const r0=await red(S1);await T.click('[data-tool=pen]');await T.click('[data-c="#e03131"]');await T.click('[data-w="3"]');const bx=await T.locator('#bc').boundingBox();
await T.mouse.move(bx.x+300,bx.y+300);await T.mouse.down();for(const [x,y] of [[380,250],[470,330],[560,260],[650,340]])await T.mouse.move(bx.x+x,bx.y+y,{steps:8});await T.mouse.up();
await S1.waitForFunction(r=>{const c=document.querySelector('.pres-stage canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+1]<90&&d[i+2]<90)n++;return n>r+300},r0,{timeout:8000});ok('o‘qituvchi chizgan chiziq o‘quvchida paydo bo‘ldi',true);await S1.waitForTimeout(300);await S1.screenshot({path:SHOT+'/2-oquvchi-ekrani.png'});
// undo
await T.keyboard.press('Control+z');await S1.waitForFunction(r=>{const c=document.querySelector('.pres-stage canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+1]<90&&d[i+2]<90)n++;return n<=r+50},r0,{timeout:8000});ok('orqaga (undo) o‘quvchida ham qaytdi',true);
await T.keyboard.press('Control+y');await S1.waitForTimeout(600);
// --- hujjat sahifasi ---
await T.click('[data-act=pages]');await T.click('[data-sa=adddoc]');await T.locator('.pg.openable').last().click();await T.waitForSelector('.paper');
await T.locator('.paper .blk').first().click();await T.keyboard.type('Salom sinf! Bugun Present Simple.');
await S1.waitForFunction(()=>{const p=document.querySelector('.pp-paper');return p&&p.innerText.includes('Present Simple')},null,{timeout:8000});ok('hujjat sahifasi matni o‘quvchida real vaqtda',(await S1.locator('.pp-paper').innerText()).includes('Salom sinf'));
// --- kechikib kirgan o'quvchi ---
const S2=await mk({width:390,height:820},{isMobile:true,hasTouch:true,deviceScaleFactor:2});await S2.waitForSelector('.empty');
await S2.click('[data-act=join]');await S2.fill('#jc',code);await S2.fill('#jn','Vali');await S2.fill('#js',SRV);await S2.click('.dlg [data-v=go]');await S2.waitForSelector('.pp-paper',{timeout:12000});
ok('kech kirgan o‘quvchi joriy sahifani (10/10 hujjat) oldi',(await S2.locator('.pp-paper').innerText()).includes('Salom sinf')&&(await S2.locator('#pn').innerText())==='10 / 10',await S2.locator('#pn').innerText());
await T.waitForFunction(()=>document.getElementById('livepill').textContent.includes('· 2'),null,{timeout:8000});ok('ro‘yxatda 2 ta o‘quvchi',true);
// --- qo'l ko'tarish ---
await S2.click('[data-p=hand]');await T.waitForFunction(()=>document.getElementById('livepill').textContent.includes('✋1'),null,{timeout:8000});ok('qo‘l ko‘tarish o‘qituvchiga yetdi',true);
await sleep(300);await S2.screenshot({path:SHOT+'/4-mobil-oquvchi.png'});
// --- taqdimot + lazer + qalam ---
await T.click('[data-act=prevpage]');await T.waitForTimeout(500);await T.click('[data-act=present]');await T.waitForSelector('.pres');
await S1.waitForFunction(()=>document.getElementById('pn').textContent.startsWith('9'),null,{timeout:8000});
await T.keyboard.press('l');await T.mouse.move(500,300);await T.mouse.move(560,340,{steps:5});
await S1.waitForFunction(()=>!document.getElementById('pl').hidden,null,{timeout:6000});ok('lazer ko‘rsatkichi o‘quvchi ekranida',true);
await T.keyboard.press('l');await T.keyboard.press('p');await T.mouse.move(300,500);await T.mouse.down();for(const [x,y] of [[360,470],[430,520],[500,480]])await T.mouse.move(x,y,{steps:5});await T.mouse.up();
await S1.waitForFunction(()=>{const c=document.getElementById('pi');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n>200},null,{timeout:6000});ok('vaqtincha qalam chizmasi o‘quvchida',true);
await S1.waitForTimeout(300);await S1.screenshot({path:SHOT+'/5-lazer-qalam.png'});
await T.keyboard.press('Escape');await T.waitForSelector('.pres',{state:'detached'});await T.waitForTimeout(300);await T.screenshot({path:SHOT+'/3-oqituvchi-jonli.png'});
// --- shifrlash ---
const logTxt=fs.readFileSync(LOG,'latin1');ok('serverga o‘tgan trafik shifrlangan (matn ko‘rinmaydi)',logTxt.length>1000&&!logTxt.includes('Salom sinf')&&!logTxt.includes('Present')&&!logTxt.includes('"k":"page"')&&!logTxt.includes('IELTS'),'bayt='+logTxt.length);
// --- tugatish ---
await T.click('#livepill');await T.click('.dlg [data-v=end]');await S1.waitForFunction(()=>document.getElementById('pst').textContent.includes('tugadi'),null,{timeout:8000});ok('dars tugatildi → o‘quvchida “Dars tugadi”',true);
ok('o‘qituvchi belgisi yo‘qoldi',await T.locator('#livepill').count()===0);
ok('konsolda xato yo‘q',errs.length===0,errs.join(' | '));
console.log(`\n${pass} o‘tdi, ${fail} yiqildi`);await b.close();relay.kill();process.exit(fail?1:0);
})().catch(e=>{console.error(e);relay.kill();process.exit(1)});
