// shared helpers for owner-fix C (drawer, bag, checkout)
const { chromium } = require('playwright'); const path = require('path');
const SETUPS = {
  // n loose items (+ optional set). Returns nothing; runs in page.
  items: (n) => `(()=>{ ST.seenIntro=true; ST.bag=[]; ST.bracketAck={}; delete UI['checkout']; try{sessionStorage.removeItem('extas-co-draft')}catch(e){}
    const pick=[['essential-pique-polo','navy','M'],['slim-chino-trousers',null,2],['oxford-cotton-shirt',null,'L'],['heavyweight-hoodie',null,'L'],['classic-cotton-panjabi',null,'L'],['essential-pique-polo','black','L'],['everyday-crew-tee',null,'M'],['linen-blend-shirt',null,'L']];
    let k=0; for(const [id,c,s] of pick){ if(k>=${n}) break; const p=P(id); if(!p) continue; const col=c||p.colors.find(x=>p.sizes.some(z=>stockOf(id,x,z)>0))||p.colors[0];
      const size=typeof s==='number'?p.sizes[s]:(p.sizes.indexOf(s)>=0?s:p.sizes[Math.min(2,p.sizes.length-1)]);
      const r=bagAdd({kind:'item',product:id,color:col,size:size,qty:1},{force:true}); if(r&&r.added!==false) k++; }
    saveState(); try{closeModal()}catch(e){} return ST.bag.length; })()`,
};
async function open(b, html, w, h, mob, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: !!mob, hasTouch: !!mob, reducedMotion: opts.motion || 'reduce', deviceScaleFactor: opts.dpr || 1 });
  const pg = await ctx.newPage(); pg._errs = []; pg.on('pageerror', e => pg._errs.push(e.message));
  await pg.goto('file://' + path.resolve(html) + '#/'); await pg.waitForTimeout(600);
  await pg.evaluate(() => { ST.seenIntro = true; saveState(); try { closeModal() } catch (e) { } });
  return { ctx, pg };
}
async function nav(pg, hash) { await pg.evaluate(async (h) => { location.hash = '#/__x'; await new Promise(r => setTimeout(r, 40)); location.hash = h; await new Promise(r => setTimeout(r, 650)); }, hash); }
module.exports = { chromium, path, SETUPS, open, nav };
