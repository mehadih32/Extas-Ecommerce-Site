const { chromium } = require('playwright'); const path=require('path');
(async()=>{ const b=await chromium.launch(); let bad=0;
for (const [w,h,mob] of [[1366,768,0],[393,852,1]]) {
const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:!!mob,hasTouch:!!mob}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://'+path.resolve(process.argv[2])+'#/'); await pg.waitForTimeout(700);
for (const tpl of ['current','B1','B2','B3','B4','B5']) {
  const r = await pg.evaluate(async(tpl)=>{ ST.seenIntro=true; ST.bag=[]; try{closeModal()}catch(e){}
    const L = ca_generate((DB.comboRules||[]).find(x=>x.id==='solid-polo-2')).visible; for(let i=0;i<3;i++){ const l=L[i]; ca_bagAdd(l, l.pieces.map(()=>'L'), {force:true}); }
    const polos = DB.products.filter(p=>p.cat==='polos').slice(0,4).map(p=>({product:p.id,color:p.colors.find(c=>stockOf(p.id,c,'M')>0)||p.colors[0],size:'M'}));
    const rule = setRules().find(r=>r.id==='any-polos');
    bagAdd({kind:'set',source:'custom',refId:'any-polos',name:'Your set (4 items)',items:polos,price:rule.tiers[4]},{force:true});
    bagAdd({kind:'item',product:'essential-pique-polo',color:'navy',size:'M',qty:1},{force:true}); bagAdd({kind:'item',product:'essential-pique-polo',color:'black',size:'M',qty:1},{force:true});
    saveState(); location.hash='#/x'; await new Promise(r=>setTimeout(r,50)); location.hash='#/bag?btpl='+tpl; await new Promise(r=>setTimeout(r,600));
    const tot=bagTotals(), off=bag_bestOffer(tot.total), grand=tot.total-off.amount;
    const shown=(document.querySelector('[data-testid=bag-total]')||{}).textContent;
    const setRow=tot.lines.find(x=>x.line.kind==='set'&&x.line.refId==='any-polos');
    const rowsSum=tot.lines.reduce((s,x)=>s+x.price,0);
    location.hash='#/checkout'; await new Promise(r=>setTimeout(r,600));
    const co=(document.querySelector('[data-testid=co-total]')||{}).textContent;
    return {tpl, shown, grand:fmt(grand), co, set4:setRow&&setRow.price, rule4:rule.tiers[4], rowsSub:tot.rowsSubtotal, rowsSum, disc:tot.discount, total:tot.total};
  }, tpl);
  const ok = r.shown===r.grand && r.set4===r.rule4 && r.rowsSub===r.rowsSum;
  if(!ok) bad++; console.log(w, ok?'ok ':'BAD', JSON.stringify(r));
}
if(errs.length){ bad++; console.log('errs',errs); } await ctx.close(); }
console.log(bad?'FAIL':'ALL TOTALS OK'); await b.close(); })();
