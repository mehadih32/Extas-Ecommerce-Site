// node shot.js <html> <out.png> <hash> [w] [h] [full] [js-before]
const { chromium } = require('playwright'); const path=require('path');
(async()=>{ const [html,out,hash,w,h,full,js]=process.argv.slice(2); const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:+(w||1366),height:+(h||768)}});
pg.on('pageerror',e=>console.log('ERR',e.message));
await pg.goto('file://'+path.resolve(html)+'#/'); await pg.waitForTimeout(700);
await pg.evaluate(()=>{ST.seenIntro=true;saveState();try{closeModal()}catch(e){}});
await pg.evaluate(()=>{location.hash='#/__blank'}); await pg.waitForTimeout(40); await pg.evaluate(h=>{location.hash=h},hash); await pg.waitForTimeout(700);
if(js){ const r=await pg.evaluate(js); if(r!==undefined) console.log(JSON.stringify(r)); await pg.waitForTimeout(500); }
await pg.screenshot({path:out, fullPage:full==='1'}); await b.close();})();
