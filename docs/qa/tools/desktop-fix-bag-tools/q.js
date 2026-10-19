// node q.js <html> "<js expr>" [hash] [w] [h]
const { chromium } = require('playwright'); const path=require('path');
(async()=>{ const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:+(process.argv[5]||1366),height:+(process.argv[6]||768)}});
pg.on('pageerror',e=>console.log('ERR',e.message));
await pg.goto('file://'+path.resolve(process.argv[2])+'#/'); await pg.waitForTimeout(700);
await pg.evaluate(()=>{ST.seenIntro=true;saveState();try{closeModal()}catch(e){}});
if(process.argv[4]){ await pg.evaluate(h=>{location.hash='#/__blank'},0); await pg.waitForTimeout(50); await pg.evaluate(h=>{location.hash=h},process.argv[4]); await pg.waitForTimeout(700);}
const r=await pg.evaluate(process.argv[3]); console.log(typeof r==='string'?r:JSON.stringify(r,null,1)); await b.close();})();
