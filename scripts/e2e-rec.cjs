const {chromium}=require('/opt/npm-tools/node_modules/playwright');const fs=require('fs');const {execSync}=require('child_process');
const SHOT=process.argv[2]||'/home/claude/fur-platform/docs/shots8';fs.mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});const ctx=await b.newContext({viewport:{width:1100,height:700},permissions:['microphone','camera'],acceptDownloads:true});ctx.setDefaultTimeout(15000);
await ctx.addInitScript(()=>{try{localStorage.setItem('fur.pview','list')}catch{}});
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
await pg.click('header [data-act=new]');await pg.fill('.dlg input','Yozuv');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.docv');
await pg.click('[data-sa=adddoc]');await pg.waitForTimeout(200);
await pg.evaluate(()=>{const ps=__fur.S.ses.doc.pages;ps[0].objects=[{t:'rect',id:'r1',x1:100,y1:100,x2:500,y2:300,c:'#e03131',w:8},{t:'text',id:'t1',x:150,y:160,tx:'Doska yozuvi',s:48,c:'#1971c2'}];const d=ps.find(x=>x.type==='document');d.blocks=[{id:'h',type:'heading',level:1,runs:[{t:'Hujjat sarlavhasi',c:'#2f9e44'}]},{id:'p',type:'paragraph',runs:[{t:'Bu yozuvga tushishi kerak bo‘lgan matn.'}]}];});
await pg.click('[data-act=present]').catch(async()=>{await pg.click('[data-sa=present]')});await pg.waitForSelector('.pres');
await pg.waitForSelector('[data-p=rec]');
async function record(name,secs){
  await pg.click('[data-p=rec]');await pg.waitForTimeout(secs*1000);
  const dl=pg.waitForEvent('download');await pg.click('[data-p=rec]');const d=await dl;const path=SHOT+'/'+name;await d.saveAs(path);return path;
}
const f1=await record('yozuv-doska.webm',3);
const sz=fs.statSync(f1).size;ok('1: doska yozuvi fayli bor',sz>3000,sz+' bayt');
const head=fs.readFileSync(f1).subarray(0,4).toString('hex');ok('1: webm sarlavhasi',head==='1a45dfa3',head);
const info=JSON.parse(execSync(`ffprobe -v error -show_streams -of json ${f1}`).toString());
ok('1: video oqimi bor',info.streams.some(s=>s.codec_type==='video'));ok('1: audio oqimi bor (ustoz ovozi)',info.streams.some(s=>s.codec_type==='audio'));
execSync(`ffmpeg -y -v error -ss 1.5 -i ${f1} -frames:v 1 ${SHOT}/yozuv-doska-kadr.png`);
// kadr bo'sh emasligini tekshir (qizil piksellar)
const red=execSync(`ffmpeg -v error -i ${SHOT}/yozuv-doska-kadr.png -vf "format=rgb24,scale=64:36" -f rawvideo -`,{maxBuffer:1e7});let n=0;for(let i=0;i<red.length;i+=3)if(red[i]>180&&red[i+1]<90&&red[i+2]<90)n++;ok('1: kadrda doskadagi qizil shakl bor',n>10,'qizil px='+n);
// 2. hujjat sahifasi
await pg.keyboard.press('ArrowRight');await pg.waitForTimeout(700);
const f2=await record('yozuv-hujjat.webm',3);
execSync(`ffmpeg -y -v error -ss 1.8 -i ${f2} -frames:v 1 ${SHOT}/yozuv-hujjat-kadr.png`);
const grn=execSync(`ffmpeg -v error -i ${SHOT}/yozuv-hujjat-kadr.png -vf "format=rgb24,scale=128:72" -f rawvideo -`,{maxBuffer:1e7});let g=0,w=0;for(let i=0;i<grn.length;i+=3){if(grn[i+1]>grn[i]+40&&grn[i+1]>grn[i+2]+40)g++;if(grn[i]>240&&grn[i+1]>240&&grn[i+2]>240)w++;}
ok('2: hujjat sahifasi (oq varaq) kadrga tushdi',w>400,'oq px='+w);ok('2: yashil sarlavha kadrda',g>5,'yashil px='+g);
ok('xatolar yo‘q',errs.length===0,errs.join('|'));
console.log('\n'+pass+' o‘tdi, '+fail+' yiqildi');await b.close();process.exit(fail?1:0);})();
