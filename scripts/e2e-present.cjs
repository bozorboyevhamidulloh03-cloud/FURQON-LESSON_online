const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const SHOT=process.argv[2]||'/home/claude/fur-platform/docs/shots5';require('fs').mkdirSync(SHOT,{recursive:true});
let pass=0,fail=0;const ok=(n,c,x='')=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(x?'  '+x:''));};
(async()=>{
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1280,height:800}});ctx.setDefaultTimeout(15000);
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await pg.goto('http://localhost:8765/');await pg.waitForSelector('.empty');
await pg.setInputFiles('#file',['/home/claude/imp/IELTS Task 1 Introduction.fur','/home/claude/imp/test.docx']);await pg.waitForFunction(()=>__fur.S.metas.length===2,null,{timeout:20000});
const pdfId=await pg.evaluate(()=>__fur.S.metas.find(m=>m.boards===9).id),docxId=await pg.evaluate(()=>__fur.S.metas.find(m=>m.docs===2).id);
// PDF taqdimoti
await pg.evaluate(id=>__fur.openDoc(id),pdfId);await pg.waitForSelector('.docv');await pg.click('[data-sa=present]');await pg.waitForSelector('.pres');await pg.waitForTimeout(600);
const I=()=>pg.evaluate(()=>__pres.i);
ok('taqdimot ochildi, 1-sahifa',await I()===0&&(await pg.locator('#pn').innerText())==='1 / 9');
await pg.keyboard.press('ArrowRight');ok('→ keyingi',await I()===1);await pg.keyboard.press(' ');ok('bo‘sh joy keyingi',await I()===2);
await pg.keyboard.press('ArrowLeft');ok('← oldingi',await I()===1);await pg.keyboard.press('End');ok('End oxirgi',await I()===8);await pg.keyboard.press('ArrowRight');ok('oxirida to‘xtaydi',await I()===8);await pg.keyboard.press('Home');ok('Home',await I()===0);
await pg.mouse.click(1000,400);ok('o‘ngga bosish: keyingi',await I()===1);await pg.mouse.click(100,400);ok('chapga bosish: oldingi',await I()===0);
await pg.keyboard.press('ArrowRight');await pg.keyboard.press('ArrowRight');await pg.keyboard.press('ArrowRight');await pg.waitForTimeout(500);
await pg.keyboard.press('l');ok('lazer rejimi',await pg.evaluate(()=>__pres.mode())==='laser');await pg.mouse.move(520,300);await pg.waitForTimeout(100);
ok('lazer ko‘rinadi',await pg.locator('#pl').isVisible());const clicked=await I();await pg.mouse.click(700,300);ok('lazer rejimida bosish sahifani o‘zgartirmaydi',await I()===clicked);
await pg.screenshot({path:SHOT+'/1-pdf-taqdimot-lazer.png'});
await pg.keyboard.press('p');ok('qalam rejimi',await pg.evaluate(()=>__pres.mode())==='pen');
await pg.mouse.move(300,500);await pg.mouse.down();for(const [x,y] of [[360,470],[430,520],[500,480],[580,530]])await pg.mouse.move(x,y,{steps:5});await pg.mouse.up();
const px=()=>pg.evaluate(()=>{const c=document.getElementById('pi'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n});
ok('vaqtincha chizma paydo bo‘ldi',(await px())>200);await pg.screenshot({path:SHOT+'/2-qalam-bilan-belgilash.png'});
await pg.keyboard.press('c');ok('C tozalaydi',(await px())===0);
await pg.mouse.move(300,500);await pg.mouse.down();await pg.mouse.move(420,520,{steps:4});await pg.mouse.up();await pg.keyboard.press('p');await pg.keyboard.press('ArrowRight');ok('sahifa o‘zgarganda chizma tozalandi',(await px())===0);
await pg.keyboard.press('b');ok('qora ekran',await pg.locator('#pb').isVisible());await pg.keyboard.press('b');ok('qora ekran o‘chdi',!(await pg.locator('#pb').isVisible()));
await pg.keyboard.press('Escape');await pg.waitForSelector('.pres',{state:'detached'});ok('Esc chiqadi, hujjat ko‘rinishiga qaytdi',await pg.locator('.docv').isVisible());
// Word taqdimoti (hujjat sahifalari)
await pg.evaluate(id=>__fur.openDoc(id),docxId);await pg.waitForSelector('.docv');await pg.click('[data-sa=present]');await pg.waitForSelector('.pp-paper');await pg.waitForTimeout(400);
const txt=await pg.locator('.pp-paper').innerText();ok('hujjat sahifasi o‘qiladi (sarlavha, jadval, ro‘yxat)',txt.includes('Present Simple')&&txt.includes('works')&&txt.includes('Qoida')&&await pg.locator('.pp-tbl th').count()===2&&await pg.locator('.pp-paper .pp-img img').count()===1);
ok('raqamli ro‘yxat 1., 2. (markerlardan keyin)',(await pg.locator('.pp-mk').allInnerTexts()).join('|')==='•|•|1.|2.',(await pg.locator('.pp-mk').allInnerTexts()).join('|'));
await pg.screenshot({path:SHOT+'/3-hujjat-taqdimot.png'});await pg.keyboard.press('ArrowRight');await pg.waitForTimeout(300);ok('2-sahifa: kirill matn',(await pg.locator('.pp-paper').innerText()).includes('Ўзбекча'));
// asboblar paneli tugmalari
await pg.click('[data-p=prev]');ok('panel tugmasi: oldingi',await I()===0);await pg.click('[data-p=exit]');await pg.waitForSelector('.pres',{state:'detached'});
// muharrirdan joriy sahifadan boshlash
await pg.locator('.pg.openable').nth(1).click();await pg.waitForSelector('.paper');await pg.click('[data-act=present]');await pg.waitForSelector('.pres');ok('muharrirdan joriy sahifadan boshlanadi',await I()===1);await pg.keyboard.press('Escape');
await pg.waitForSelector('.paper');ok('chiqqach muharrirga qaytdi',await pg.locator('.paper').isVisible());
// doska (qo'lda chizilgan) taqdimoti
await pg.click('[data-act=pages]');await pg.click('[data-sa=addboard]');await pg.locator('.pg.openable').last().click();await pg.waitForSelector('#bc');
await pg.evaluate(()=>{const p=__board.page;p.bg='dark';p.objects.push({t:'text',id:'t1',x:0,y:0,tx:'Nyuton qonunlari',s:48,c:'#111111'},{t:'stroke',id:'s1',pts:[[0,80],[200,120],[400,70],[600,130]],c:'#f08c00',w:8,hl:false},{t:'rect',id:'r1',x1:0,y1:160,x2:300,y2:300,c:'#1971c2',w:5});});
await pg.click('[data-act=present]');await pg.waitForSelector('.pres');await pg.waitForTimeout(500);await pg.screenshot({path:SHOT+'/4-doska-qora-fon.png'});
ok('doska taqdimoti ishladi',(await pg.locator('.pres-stage canvas').count())===1);
await pg.keyboard.press('Escape');
ok('konsolda xato yo‘q',errs.length===0,errs.join(' | '));
console.log(`\n${pass} o‘tdi, ${fail} yiqildi`);await b.close();process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
