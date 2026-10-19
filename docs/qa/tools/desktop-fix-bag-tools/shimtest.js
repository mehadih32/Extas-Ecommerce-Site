const { chromium } = require('playwright'); const path=require('path');
(async()=>{ const b=await chromium.launch(); let bad=0; const log=(ok,m)=>{ if(!ok) bad++; console.log((ok?'  ok  ':'  FAIL ')+m); };
for (const rm of ['no-preference','reduce']) {
const ctx=await b.newContext({viewport:{width:1366,height:768},reducedMotion:rm}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://'+path.resolve(process.argv[2])+'#/'); await pg.waitForTimeout(700);
const st = ()=>pg.evaluate(()=>{ const ps=(s,p)=>{ const e=document.querySelector(s); if(!e) return 'none-el'; const c=getComputedStyle(e,p); return c.display+'|'+c.animationName+'|'+c.animationDuration+'|'+c.opacity; };
  return {cont:ps('.bg-cont','::after'), free:ps('.bg-freeb','::after'), chk:ps('[data-testid=bag-summary] .btn-primary','::after'), css:(document.getElementById('shim-css')||{}).textContent||''}; });
await pg.evaluate(async()=>{ ST.seenIntro=true; ST.shimmer={}; ST.bag=[]; bagAdd({kind:'item',product:'essential-pique-polo',color:'navy',size:'M',qty:1},{force:true}); bagAdd({kind:'item',product:'slim-chino-trousers',color:P('slim-chino-trousers').colors[0],size:P('slim-chino-trousers').sizes[2],qty:1},{force:true}); saveState(); shim_apply(); location.hash='#/bag'; await new Promise(r=>setTimeout(r,700)); });
let s=await st(); console.log(rm,'default',JSON.stringify(s));
if(rm==='no-preference'){
  log(s.css==='', 'defaults write no style');
  log(/^block\|ctaSheenBg/.test(s.cont) && /^block\|ctaSheenBg/.test(s.free) && /ctaSheenBg/.test(s.chk), 'Continue / FREE / Checkout shimmer on by default');
  await pg.evaluate(()=>{ shim_set('free','on',false); shim_set('cont','speed','slow'); shim_set('cont','strength','soft'); }); s=await st();
  log(/^none/.test(s.free), 'FREE off'); log(/10\.5s\|0\.5$/.test(s.cont), 'Continue slow (10.5s) + soft (0.5) '+s.cont);
  await pg.evaluate(()=>{ shim_set('primary','on',false); }); s=await st(); log(/^block\|ctaSheenBg/.test(s.chk), 'Checkout stays on when "other green buttons" are off '+s.chk);
  await pg.evaluate(()=>{ shim_set('*','on',false); }); s=await st(); log(/^none/.test(s.cont) && /^none/.test(s.chk), 'master off → all off');
  await pg.evaluate(()=>{ ST.shimmer={}; shim_apply(); location.hash='#/admin/settings'; }); await pg.waitForTimeout(900);
  const g=await pg.evaluate(()=>['shimmer','bagwords','bagtiers'].map(id=>{ const e=document.getElementById('zs-g-'+id); return id+':'+(e?e.querySelectorAll('input,select').length:0); }));
  log(g.every(x=>!/:0$/.test(x)), 'settings groups render '+g.join(' '));
  /* change a tier price from Settings and see bag + builder agree */
  await pg.evaluate(()=>{ zs_S('tiers.any-polos.2.price').set(2600); zs_S('opt.bag.w.alsoLike').set('More you may like'); });
  await pg.evaluate(async()=>{ location.hash='#/bag'; await new Promise(r=>setTimeout(r,600)); });
  const t=await pg.evaluate(()=>({box:(document.querySelector('[data-testid=bag-tiers]')||{}).innerText, h:(document.querySelector('.ups-hd h2')||{}).textContent, rule:setRules().find(r=>r.id==='any-polos').tiers}));
  log(/2,600/.test(t.box) && t.rule[4]===2600 && t.h==='More you may like', 'tier price + heading editable from Settings '+JSON.stringify(t));
  await pg.evaluate(()=>{ zs_S('tiers.on').set(false); }); await pg.evaluate(async()=>{ location.hash='#/x'; await new Promise(r=>setTimeout(r,50)); location.hash='#/bag'; await new Promise(r=>setTimeout(r,600)); });
  log(await pg.evaluate(()=>!document.querySelector('[data-testid=bag-tiers]') && getComputedStyle(document.querySelector('.ups-set')).display!=='none'), 'tier box off → the one-line offer comes back');
  await pg.evaluate(()=>{ zs_S('tiers.on').set(true); zs_S('tiers.end').set('2020-01-01'); }); await pg.evaluate(async()=>{ location.hash='#/x'; await new Promise(r=>setTimeout(r,50)); location.hash='#/bag'; await new Promise(r=>setTimeout(r,600)); });
  log(await pg.evaluate(()=>!document.querySelector('[data-testid=bag-tiers]')), 'tier box hidden after its end date');
} else {
  log(/^none/.test(s.cont) && /^none/.test(s.free), 'reduced motion: new shimmers not drawn '+s.cont+' '+s.free);
  await pg.evaluate(()=>{ shim_set('primary','on',false); }); s=await st(); log(!/ctaSheenBg/.test(s.chk) || /^none/.test(s.chk), 'reduced motion: nothing switched back on '+s.chk);
}
log(errs.length===0, 'no JS errors '+errs.slice(0,2)); await ctx.close(); }
console.log(bad?'FAIL':'ALL PASSED'); await b.close(); })();
