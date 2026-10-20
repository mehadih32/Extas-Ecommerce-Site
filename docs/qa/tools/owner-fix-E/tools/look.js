// node look.js <html> <outdir> <width> <lang> route1 route2 ...
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path=require('path'), fs=require('fs');
(async()=>{
  const [html,out,w,lang,...routes]=process.argv.slice(2); fs.mkdirSync(out,{recursive:true});
  const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:+w,height:900}})).newPage();
  await p.goto('file://'+path.resolve(html)+'#/'); await p.waitForTimeout(700);
  await p.evaluate(l=>{ ST.seenIntro=true; ST.adminLang=l; saveState(); closeModal(); },lang);
  for(const r of routes){ await p.evaluate(h=>{ location.hash='#/x'; location.hash=h; },r); await p.waitForTimeout(350);
    await p.screenshot({path:path.join(out,w+'_'+lang+'_'+r.replace(/[^\w]+/g,'_')+'.png'),fullPage:true}); }
  await b.close();
})();
