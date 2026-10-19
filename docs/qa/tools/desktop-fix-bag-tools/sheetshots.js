const { chromium } = require('playwright'); const path=require('path'); const fs=require('fs');
const [BEFORE, AFTER, OUT] = process.argv.slice(2); fs.mkdirSync(OUT,{recursive:true});
(async()=>{ const b=await chromium.launch();
const run = async (html, tag, w, h, mob, setup, hash, name, opts={}) => {
  const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:!!mob,hasTouch:!!mob,reducedMotion:'reduce'}); const pg=await ctx.newPage();
  await pg.goto('file://'+path.resolve(html)+'#/'); await pg.waitForTimeout(700);
  await pg.evaluate(setup); await pg.evaluate(async(h)=>{ location.hash='#/x'; await new Promise(r=>setTimeout(r,60)); location.hash=h; await new Promise(r=>setTimeout(r,800)); }, hash);
  if(opts.css) await pg.addStyleTag({content:opts.css});
  if(opts.js) await pg.evaluate(opts.js); await pg.waitForTimeout(300);
  let clip=null;
  if(opts.sel){ const e=await pg.$(opts.sel); if(e){ await e.scrollIntoViewIfNeeded(); await pg.waitForTimeout(200); const bb=await e.boundingBox(); clip={x:Math.max(0,bb.x-(opts.pad||16)),y:Math.max(0,bb.y-(opts.pad||16)),width:Math.min(w,bb.width+2*(opts.pad||16)),height:bb.height+2*(opts.pad||16)}; } }
  await pg.screenshot({path:`${OUT}/${tag}-${name}.png`, fullPage:!!opts.full, clip: clip||undefined, animations:'disabled'}); await ctx.close(); };
const dup = () => { ST.seenIntro=true; ST.bag=[]; ST.bracketAck={}; const a=(id,c,s)=>bagAdd({kind:'item',product:id,color:c,size:s,qty:1},{force:true}); a('essential-pique-polo','navy','M'); a('essential-pique-polo','navy','L'); a('slim-chino-trousers',P('slim-chino-trousers').colors[0],P('slim-chino-trousers').sizes[2]); a('oxford-cotton-shirt',P('oxford-cotton-shirt').colors[0],'L'); saveState(); try{closeModal()}catch(e){} };
const help = () => { ST.seenIntro=true; ST.bag=[]; const a=(id,c,s)=>bagAdd({kind:'item',product:id,color:c,size:s,qty:1},{force:true}); a('essential-pique-polo','navy','M'); a('essential-pique-polo','navy','L'); ST.bracketAck={}; ST.bracketAck[bracketPairs()[0].key]='help'; saveState(); try{closeModal()}catch(e){} };
const sets = () => { ST.seenIntro=true; ST.bag=[]; const L=ca_generate((DB.comboRules||[]).find(x=>x.id==='solid-polo-2')).visible; for(let i=0;i<3;i++){ const l=L[i]; ca_bagAdd(l,l.pieces.map(()=>'L'),{force:true}); } bagAdd({kind:'item',product:'essential-pique-polo',color:'navy',size:'L',qty:1},{force:true}); saveState(); try{closeModal()}catch(e){} };
const one = () => { ST.seenIntro=true; ST.bag=[]; bagAdd({kind:'item',product:'essential-pique-polo',color:'navy',size:'M',qty:1},{force:true}); bagAdd({kind:'item',product:'slim-chino-trousers',color:P('slim-chino-trousers').colors[0],size:P('slim-chino-trousers').sizes[2],qty:1},{force:true}); saveState(); try{closeModal()}catch(e){} };
for (const [html,tag] of [[BEFORE,'b'],[AFTER,'a']]) {
  await run(html,tag,1366,900,0,dup,'#/bag','top',{});
  await run(html,tag,1366,768,0,dup,'#/bag','summary',{sel:'[data-testid=bag-summary]'});
  await run(html,tag,1366,768,0,dup,'#/bag','brk',{sel:'.bg-brk'});
  await run(html,tag,1366,768,0,help,'#/bag','brkhelp',{sel:'.bg-brk'});
  await run(html,tag,1366,768,0,dup,'#/bag','lines',{sel:'.bg-lines'});
  await run(html,tag,1366,768,0,dup,'#/bag','ups',{sel:'.ups .container', pad:4});
  await run(html,tag,1366,768,0,sets,'#/bag?btpl=B5','b5',{sel:'.bg-lines'});
  await run(html,tag,1366,768,0,one,'#/bag','duo',{sel:'.bg-offer-slot, [data-testid=duo-offer]'});
  await run(html,tag,393,852,1,one,'#/bag','ph-duo',{sel:'[data-testid=duo-offer]', pad:8});
  await run(html,tag,393,852,1,dup,'#/bag','ph-ups',{sel:'.ups .ups-hd', pad:8, js:"(()=>{})()"});
  await run(html,tag,393,852,1,dup,'#/bag','ph-top',{});
}
/* after-only: admin settings groups + the phone version of the tier box (preview, NOT applied) */
const adm = (g) => async () => {};
for (const g of ['shimmer','bagwords','bagtiers']) await run(AFTER,'a',1366,900,0,()=>{ ST.seenIntro=true; saveState(); },'#/admin/settings','set-'+g,{js:`(()=>{ const e=document.getElementById('zs-g-${g}'); if(e) e.scrollIntoView(); })()`});
const PREV = `.bg-tiers.hide-m{display:block!important;border:1.5px solid var(--brand);background:var(--brand-tint);border-radius:var(--card-radius);padding:14px 14px;margin:2px 0 12px}
.bg-tiers-h{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}.bg-tiers-t{font-weight:800;font-size:16px;color:var(--ink)}.bg-tiers-go{font-weight:700;display:inline-flex;align-items:center;gap:4px}
.bg-tiers-row{display:flex;flex-direction:column}.bg-tier{display:flex;align-items:baseline;white-space:nowrap;font-size:15px;color:var(--ink);padding:8px 2px}.bg-tier b{font-weight:800}.bg-tier .bg-tier-s{color:var(--sale);font-weight:800}.bg-tier .bg-tdot{color:var(--text2);padding:0 .35em}
.bg-tbar{display:block;height:2px;border-radius:2px;background:var(--gold);margin:2px 0}.ups-set.hide-d{display:none!important}`;
await run(AFTER,'a',393,852,1,dup,'#/bag','ph-tiers-preview',{sel:'.ups .container', pad:4, css:PREV});
await b.close(); console.log('done'); })();
