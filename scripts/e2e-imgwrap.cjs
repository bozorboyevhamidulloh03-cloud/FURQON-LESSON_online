const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const SHOT=process.argv[2]||'/home/claude/fur-holo/docs/shots8';require('fs').mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1100,height:1300}});ctx.setDefaultTimeout(15000);
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
await pg.click('.qa [data-act=new]');await pg.fill('.dlg input','Rasm sinovi');await pg.click('.dlg [data-x="1"]');await pg.waitForSelector('.docv');
await pg.waitForSelector('.pcell');await pg.click('[data-sa=adddoc]');await pg.waitForTimeout(300);await pg.locator('.pcell.document').first().click();await pg.waitForSelector('#editor .ed');
for(let k=0;k<6;k++){await pg.click('.ed >> nth=-1');await pg.keyboard.type('Bu uzun matn qator raqami '+k+'. Rasm shu matn bilan birga turishi kerak, shuning uchun biroz uzunroq yozamiz va davom etamiz.');await pg.keyboard.press('Enter');}
await pg.setInputFiles('#eimg','/home/claude/fur/im-1.png');await pg.waitForSelector('.imgf');
await pg.click('.imgf img');await pg.waitForSelector('.ectx:not([hidden])');
ok('rasm ustida variantlar paneli',(await pg.locator('.ectx').innerText()).includes('Chapga o‘rash'));
await pg.click('[data-x="wrap:left"]');for(let k=0;k<6;k++)await pg.click('[data-x=mvup]');await pg.waitForTimeout(150);
ok('chapga o‘rash: float',await pg.evaluate(()=>getComputedStyle(document.querySelector('.imgf')).float)==='left');
await pg.screenshot({path:SHOT+'/rasm-chapga-orash.png'});
await pg.click('.imgf img');await pg.click('[data-x="wrap:right"]');ok('o‘ngga o‘rash',await pg.evaluate(()=>getComputedStyle(document.querySelector('.imgf')).float)==='right');
await pg.click('.imgf img');await pg.click('[data-x="wrap:front"]');await pg.waitForTimeout(150);
ok('matn ustida: absolute',await pg.evaluate(()=>getComputedStyle(document.querySelector('.imgf')).position)==='absolute');
const b0=await pg.locator('.imgf').boundingBox();
await pg.click('.imgf img');await pg.waitForSelector('.imgh');const h=await pg.locator('.imgh').boundingBox();
await pg.mouse.move(h.x+10,h.y+10);await pg.mouse.down();await pg.mouse.move(h.x-100,h.y+90,{steps:8});await pg.mouse.up();await pg.waitForTimeout(200);
const b1=await pg.locator('.imgf').boundingBox();ok('sudrab ko‘chirildi (erkin joy)',Math.abs(b1.x-b0.x+100)<14&&Math.abs(b1.y-b0.y-80)<6,JSON.stringify([b1.x-b0.x,b1.y-b0.y]));
await pg.click('.imgf img');await pg.waitForSelector('.imgz');const z=await pg.locator('.imgz').boundingBox();const w0=b1.width;
await pg.mouse.move(z.x+10,z.y+10);await pg.mouse.down();await pg.mouse.move(z.x+90,z.y+10,{steps:6});await pg.mouse.up();await pg.waitForTimeout(200);
const w1=(await pg.locator('.imgf').boundingBox()).width;ok('o‘lchami sudrab o‘zgartirildi',w1>w0+30,w0+' -> '+w1);
await pg.screenshot({path:SHOT+'/rasm-matn-ustida.png'});
await pg.click('.imgf img');await pg.click('[data-x="wrap:behind"]');ok('matn ortida: z-index pastroq',await pg.evaluate(()=>+getComputedStyle(document.querySelector('.imgf')).zIndex<+getComputedStyle(document.querySelector('.blk')).zIndex));
await pg.screenshot({path:SHOT+'/rasm-matn-ortida.png'});
// saqlash va qayta ochish
await pg.waitForTimeout(1800);const id=await pg.evaluate(()=>__fur.S.ses.meta.id);await pg.click('[data-act=pages]');await pg.waitForSelector('.pcell');await pg.click('[data-act=back]');await pg.waitForSelector('.grid');
await pg.evaluate(i=>__fur.openDoc(i),id);await pg.waitForSelector('.pcell');await pg.locator('.pcell.document').first().click();await pg.waitForSelector('.imgf');
ok('saqlangan va qayta ochilgan: joylashuv saqlandi',await pg.evaluate(()=>document.querySelector('.imgf').classList.contains('w-behind')));
// taqdimotda
await pg.click('[data-act=present]');await pg.waitForSelector('.pp-img');ok('taqdimotda ham matn ortida',await pg.evaluate(()=>document.querySelector('.pp-img').classList.contains('w-behind')));
await pg.screenshot({path:SHOT+'/rasm-taqdimot.png'});
ok('xatolar yo‘q',errs.length===0,errs.join('|'));
console.log('\n'+pass+' o‘tdi, '+fail+' yiqildi');await b.close();process.exit(fail?1:0);})();
