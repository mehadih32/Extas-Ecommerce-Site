// node tools/vshot.js <html> <out.png> <w> <h> <scrollY> <route...>  -> viewport shots side by side
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path=require('path');
(async()=>{
  const [html,out,w,h,sy,...routes]=process.argv.slice(2);
  const b=await chromium.launch(); const mob=+w<800;
  const ctx=await b.newContext({viewport:{width:+w,height:+h},isMobile:mob,hasTouch:mob});
  const p=await ctx.newPage(); p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+path.resolve(html)+'#/'); await p.waitForTimeout(300);
  await p.evaluate(()=>{ST.seenIntro=true;saveState();closeModal();});
  const shots=[];
  for(const r of routes){ await p.evaluate(x=>{location.hash=x},r); await p.waitForTimeout(350); await p.evaluate(y=>window.scrollTo(0,+y),sy); await p.waitForTimeout(200); shots.push(await p.screenshot()); }
  const fs=require('fs'); shots.forEach((s,i)=>fs.writeFileSync(out.replace('.png','_'+i+'.png'),s));
  await b.close();
})();
