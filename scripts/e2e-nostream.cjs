// CompressionStream/DecompressionStream YO'Q eski WebView simulyatsiyasi
const {chromium}=require('/opt/npm-tools/node_modules/playwright');
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1000,height:800}});
await ctx.addInitScript(()=>{delete window.CompressionStream;delete window.DecompressionStream;});
const pg=await ctx.newPage();ctx.setDefaultTimeout(8000);const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
ok('oqimlar yo‘qligi simulyatsiya qilindi',await pg.evaluate(()=>typeof CompressionStream==='undefined'));
await pg.click('header [data-act=new]');await pg.fill('.dlg input','Zaxira sinovi');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.docv');
ok('yangi hujjat ochildi (oqimsiz)',true);
await pg.waitForTimeout(1500);await pg.click('[data-act=back]');await pg.waitForSelector('.grid');
ok('ro‘yxatda ko‘rinadi',(await pg.locator('.grid').innerText()).includes('Zaxira sinovi'));
// siqilgan (haqiqiy deflate) .fur ni ochish: avval oddiy brauzerda yaratilgan fayl
await pg.setInputFiles('#file','/home/claude/imp/IELTS Task 1 Introduction.fur');await pg.waitForTimeout(1500);
const t=await pg.locator('#toast').innerText();ok('siqilgan .fur import (sof JS inflate)',!(await pg.locator('#toast').getAttribute('class')).includes('bad'),t);
ok('IELTS hujjati ro‘yxatda',(await pg.locator('.grid').innerText()).toLowerCase().includes('ielts'));
await pg.locator('.grid .card, .grid [data-id]').first().click().catch(()=>{});
ok('xatolar yo‘q',errs.length===0,errs.join('|'));
console.log('\n'+pass+' o‘tdi, '+fail+' yiqildi');await b.close();process.exit(fail?1:0);})();
