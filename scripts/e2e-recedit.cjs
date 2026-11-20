// Yozuv jonli dars darajasida: tahrirlashga o'tganda to'xtamaydi; o'quvchi ovozi aralashadi; model asosidagi kadrlar.
const {chromium}=require('/opt/npm-tools/node_modules/playwright');const {spawn,execSync}=require('child_process');const fs=require('fs');
const SHOT=process.argv[2]||'/home/claude/fur-holo/docs/shots9';fs.mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
const relay=spawn('node',['/home/claude/fur-holo/tools/fur-relay.cjs','18891'],{env:{...process.env,NODE_PATH:'/opt/npm-tools/node_modules'},stdio:'inherit'});
const SRV='ws://localhost:18891';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{await sleep(500);const b=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});const errs=[];
const mk=async(vp,nm,dl)=>{const c=await b.newContext({viewport:vp,permissions:['microphone','camera'],acceptDownloads:!!dl});c.setDefaultTimeout(15000);const p=await c.newPage();p.on('pageerror',e=>errs.push(nm+': '+e.message));await p.goto('http://localhost:8765/');return p;};
const T=await mk({width:1200,height:800},'T',true);await T.waitForSelector('.empty');
await T.click('.qa [data-act=new]');await T.fill('.dlg input','Yozuv-tahrir');await T.click('.dlg [data-x="1"]');await T.waitForSelector('.docv');
await T.click('[data-sa=adddoc]');await T.waitForTimeout(200);
await T.evaluate(()=>{const d=__fur.S.ses.doc.pages.find(x=>x.type==='document');d.blocks=[{id:'a',type:'heading',level:1,runs:[{t:'Birinchi sarlavha',c:'#2f9e44'}]},{id:'b',type:'paragraph',runs:[{t:'Boshlang‘ich matn.'}]}];});
await T.click('[data-sa=live]');await T.waitForSelector('#srv');await T.fill('#srv',SRV);await T.click('.dlg [data-v=go]');await T.waitForSelector('#bcode');
const code=(await T.locator('#bcode').innerText()).trim();
const S=await mk({width:800,height:600},'S');await S.waitForSelector('.empty');await S.click('.qa [data-act=join]');await S.fill('#jc',code);await S.fill('#jn','Vali');await S.fill('#js',SRV);await S.click('.dlg [data-v=go]');await S.waitForSelector('.pres');
await T.waitForSelector('#rost .rl .tg');
// o'quvchiga mikrofon ruxsati, u yoqadi
await T.locator('#rost .rl').first().locator('[data-pm$=":mic"]').click();await S.waitForTimeout(700);await S.click('[data-p=mic]');await S.waitForTimeout(1200);
ok('1: o‘quvchi mikrofoni yondi',await S.locator('[data-p=mic].on').count()===1);
await T.waitForFunction(()=>document.querySelectorAll('#fur-media .mtile').length>=1);
// yozuvni boshlash (dialogdan), dialogni yopish
await T.click('[data-r=start]');await T.waitForTimeout(600);
ok('2: REC belgisi (pill) paydo bo‘ldi',await T.locator('#recpill').count()===1);
await T.click('.ld-f [data-v=done]');await T.waitForTimeout(300);
// sahifani ochib tahrirlash (taqdimot emas)
await T.keyboard.press('Escape');await T.waitForTimeout(500);await T.click('[data-act="pview:list"]');await T.waitForSelector('.pg.openable');await T.locator('.pg.openable').nth(1).click();
await T.waitForSelector('#editor .ed');await T.waitForTimeout(1800);
await T.screenshot({path:SHOT+'/yozuv-tahrirda.png'});
ok('3: tahrirlashga o‘tganda yozuv davom etmoqda (pill bor)',await T.locator('#recpill').count()===1);
await T.locator('#editor .ed').nth(1).click();await T.keyboard.press('End');await T.keyboard.type(' YANGI QO‘SHILGAN MATN ');await T.waitForTimeout(2500);
await T.keyboard.press('Enter');await T.keyboard.type('Ikkinchi paragraf');await T.waitForTimeout(2500);
// yozuvni pill orqali to'xtatish
await T.click('#recpill');await T.waitForSelector('[data-r=stop]');
const dl=T.waitForEvent('download');await T.click('[data-r=stop]');const d=await dl;const f=SHOT+'/yozuv-tahrir.webm';await d.saveAs(f);
const sz=fs.statSync(f).size;ok('4: fayl saqlandi',sz>5000,sz+' bayt');
const info=JSON.parse(execSync(`ffprobe -v error -show_streams -show_format -of json ${f}`).toString());
const dur=parseFloat(info.format.duration||0)||0;
ok('4: video va audio oqimlari bor',info.streams.some(s=>s.codec_type==='video')&&info.streams.some(s=>s.codec_type==='audio'));
// audio: faqat o'quvchi gapirgan (ustoz mikrofoni o'chiq) — demak aralashma ishlagan
let vol='';try{vol=execSync(`ffmpeg -i ${f} -vn -af volumedetect -f null - 2>&1 | grep mean_volume`).toString()}catch(e){vol=String(e.stdout||'')}
const mv=parseFloat((vol.match(/mean_volume: (-?[\d.]+)/)||[])[1]);ok('5: o‘quvchi ovozi yozuvga tushgan (jimjit emas)',mv>-60,'mean='+mv+' dB');
// kadrlar: boshida va oxirida farq bo'lishi kerak (matn qo'shilgan)
execSync(`ffmpeg -y -v error -ss 3.0 -i ${f} -frames:v 1 ${SHOT}/yozuv-kadr-boshi.png`);execSync(`ffmpeg -y -v error -ss 6.5 -i ${f} -frames:v 1 ${SHOT}/yozuv-kadr-oxiri.png`);
const raw=p=>execSync(`ffmpeg -v error -i ${p} -vf "format=gray,scale=160:90" -f rawvideo -`,{maxBuffer:1e7});const A=raw(SHOT+'/yozuv-kadr-boshi.png'),B=raw(SHOT+'/yozuv-kadr-oxiri.png');let diff=0,white=0;for(let i=0;i<A.length;i++){if(Math.abs(A[i]-B[i])>40)diff++;if(A[i]>235)white++;}
ok('6: sahifa kadrga tushgan (oq varaq)',white>2000,'oq='+white);ok('6: tahrir yozuvda ko‘rinadi (kadrlar farq qiladi)',diff>15,'farq='+diff);
ok('xatolar yo‘q',errs.length===0,errs.join('|'));
console.log('\n'+pass+' o‘tdi, '+fail+' yiqildi');relay.kill();await b.close();process.exit(fail?1:0);})();
