// Haqiqiy TOUCH hodisalari (CDP): qalam, chimchilash-zoom, surish; oqimsiz WebView simulyatsiyasi (deflate-raw yo'q)
const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const SHOT=process.argv[2]||'/home/claude/fur-holo/docs/shots8';require('fs').mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:412,height:800},hasTouch:true,isMobile:true,deviceScaleFactor:2});ctx.setDefaultTimeout(15000);
await ctx.addInitScript(()=>{const C=window.CompressionStream,D=window.DecompressionStream;window.CompressionStream=function(f){if(f==='deflate-raw')throw new TypeError("Unsupported compression format: 'deflate-raw'");return new C(f)};window.DecompressionStream=function(f){if(f==='deflate-raw')throw new TypeError("Unsupported compression format: 'deflate-raw'");return new D(f)};});
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
await pg.setInputFiles('#file',['/home/claude/imp/IELTS Task 1 Introduction.fur','/home/claude/imp/test.docx']);await pg.waitForFunction(()=>__fur.S.metas.length===2,null,{timeout:20000});
ok('deflate-raw yo‘q WebView’da import ishladi',true);
const pdfId=await pg.evaluate(()=>__fur.S.metas.find(m=>m.boards===9).id),docxId=await pg.evaluate(()=>__fur.S.metas.find(m=>m.docs===2).id);
const cdp=await ctx.newCDPSession(pg);
const T=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map((p,i)=>({x:p[0],y:p[1],id:i}))});
const red=()=>pg.evaluate(()=>{const c=document.querySelector('#pi');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+3]>100)n++;return n});
for(const [name,id] of [['doc-sahifa',docxId],['doska-sahifa',pdfId]]){
  await pg.evaluate(i=>__fur.openDoc(i),id);await pg.waitForSelector('.docv');await pg.click('[data-sa=present]');await pg.waitForSelector('.pres');await pg.waitForTimeout(700);
  await pg.keyboard.press('p');
  await T('touchStart',[[60,300]]);for(let k=1;k<=30;k++){await T('touchMove',[[60+k*10,300+Math.sin(k/3)*60]]);}await T('touchEnd',[]);await pg.waitForTimeout(150);
  const n=await red();ok(name+': barmoq bilan uzluksiz chiziq chizildi',n>1500,'qizil piksel='+n);
  // chimchilash
  await pg.keyboard.press('p');
  await T('touchStart',[[150,400],[260,400]]);for(let k=1;k<=12;k++)await T('touchMove',[[150-k*8,400],[260+k*8,400]]);await T('touchEnd',[]);await pg.waitForTimeout(250);
  const t=await pg.locator('#pn').innerText();ok(name+': chimchilash zoom ishladi',/%/.test(t),t);
  await pg.screenshot({path:SHOT+'/'+name+'-zoom.png'});
  await pg.keyboard.press('0');await pg.waitForTimeout(150);ok(name+': zoom tiklandi',!/%/.test(await pg.locator('#pn').innerText()));
  await pg.click('[data-p=zin]');await pg.click('[data-p=zin]');ok(name+': + tugma',/%/.test(await pg.locator('#pn').innerText()));
  await pg.keyboard.press('Escape');await pg.waitForSelector('.pres',{state:'detached'});await pg.click('[data-act=back]');await pg.waitForSelector('.grid');
}
ok('xatolar yo‘q',errs.length===0,errs.join('|'));
console.log('\n'+pass+' o‘tdi, '+fail+' yiqildi');await b.close();process.exit(fail?1:0);})();
