const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const path=require('path');
(async()=>{ const html=path.resolve(process.argv[2]), out=path.resolve(process.argv[3]); const b=await chromium.launch();
 const run=async(w,h,lang,routes,mobile,prep)=>{ const c=await b.newContext({viewport:{width:w,height:h},isMobile:!!mobile,hasTouch:!!mobile,deviceScaleFactor:mobile?2:1}); const p=await c.newPage();
   await p.goto('file://'+html+'#/'); await p.waitForTimeout(700); await p.evaluate(([l,pr])=>{ ST.seenIntro=true; ST.adminLang=l; if(pr) ST.user='01712345678'; saveState(); closeModal(); },[lang,prep]);
   for(const [r,full] of routes){ await p.evaluate(h=>{location.hash='#/x';location.hash=h;},r); await p.waitForTimeout(450);
     if(/couriers/.test(r)) await p.evaluate(()=>{ const s=document.querySelector('.admin-tabs'); if(s){ s.scrollLeft=s.scrollWidth/2-s.clientWidth/2; s.dispatchEvent(new Event('scroll')); } }); await p.waitForTimeout(200);
     const tabs=await p.evaluate(()=>[...document.querySelectorAll('.zy-tw')].map(w=>w.className));
     console.log(w,lang,r,JSON.stringify(tabs.slice(0,3)));
     await p.screenshot({path:path.join(out,w+'_'+lang+'_'+r.replace(/[^\w]+/g,'_')+'.png'),fullPage:!!full}); }
   await c.close(); };
 await run(768,1024,'en',[['#/admin/finance',0],['#/admin/couriers?tab=money',0]]);
 await run(1366,900,'bn',[['#/admin/finance',1],['#/admin/support?t=T-1002',1],['#/admin/exchanges',1]]);
 await run(390,844,'en',[['#/account/orders',1],['#/order/EX-1038',1],['#/admin/support?t=T-1002',1]],true,true);
 await b.close(); })();
