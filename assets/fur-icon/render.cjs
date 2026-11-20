const {chromium}=require('/opt/npm-tools/node_modules/playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
const jobs=[['fur-icon.svg',[16,24,32,48,64,96,128,180,256,512,1024]],['fur-icon-small.svg',[16,24,32,48]]];
for(const [f,sizes] of jobs){const svg=fs.readFileSync(f,'utf8');
 for(const s of sizes){await p.setViewportSize({width:s,height:s});
  await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${s}px;height:${s}px}</style>${svg}`);
  const out=(f==='fur-icon.svg'?'fur-icon-':'fur-icon-small-')+s+'.png';
  await p.screenshot({path:out,omitBackground:true,clip:{x:0,y:0,width:s,height:s}});}}
await b.close();})();
