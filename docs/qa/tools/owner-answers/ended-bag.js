// node ended-bag.js <html> <outdir> — a combo that ended while in the bag: price kept, note in bag + checkout
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const HTML = path.resolve(process.argv[2]), OUT = process.argv[3]; fs.mkdirSync(OUT, {recursive:true});
let fails = 0; const log = (ok, m) => { if(!ok) fails++; console.log((ok ? '  ok   ' : '  FAIL ') + m); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const vp of [{w:393,h:852},{w:360,h:800},{w:320,h:640}]) {
    const ctx = await b.newContext({viewport:{width:vp.w, height:vp.h}, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
    await pg.goto('file://'+HTML+'#/'); await pg.waitForTimeout(400);
    const ev = (f, a) => pg.evaluate(f, a);
    const go = async h => { await ev(x => { if(location.hash===x) rerender(); else location.hash = x; }, h); await pg.waitForTimeout(450); };
    await ev(() => { localStorage.clear(); resetState(); ST.seenIntro = true; ST.bag = []; ca_bagAdd(ca_listing('solid-polo-2~black-navy'), ['L','L'], {force:true}); saveState(); closeModal(true); });
    await go('#/bag');
    const t0 = await ev(() => bagTotals().total);
    log(await ev(() => !document.querySelector('[data-testid=bag-ended]')), vp.w+': live combo → no note');
    await ev(() => { ST.comboAutoOverride = {'solid-polo-2':{active:false}}; CA.cache = {}; saveState(); });
    await go('#/bag');
    const t1 = await ev(() => bagTotals().total);
    log(t1===t0, vp.w+': ended combo keeps its bag price ('+t0+' → '+t1+')');
    log(await ev(() => /এই অফার শেষ হয়ে গেছে|This offer has ended/.test((document.querySelector('[data-testid=bag-ended]')||{}).innerText||'')), vp.w+': bag shows the note');
    await ev(() => window.scrollTo(0,0)); await pg.screenshot({path:path.join(OUT, 'bag-ended-note-'+vp.w+'.png')});
    await go('#/checkout');
    log(await ev(() => !!document.querySelector('[data-testid=bag-ended]') && !!document.querySelector('.co-confirm')), vp.w+': checkout shows the note, order still possible');
    await ev(() => { ST.lang = 'bn'; saveState(); rerender(); }); await pg.waitForTimeout(300);
    log(await ev(() => /ব্যাগে থাকা দামে এখনো কিনতে পারবেন/.test(document.querySelector('[data-testid=bag-ended]').innerText)), vp.w+': note in Bengali');
    await ev(() => window.scrollTo(0,0)); await pg.screenshot({path:path.join(OUT, 'checkout-ended-note-bn-'+vp.w+'.png')});
    await ev(() => { ST.lang = 'en'; ST.shopOpt = {'bag.endedNote':'Offer over, bag price kept'}; saveState(); rerender(); }); await pg.waitForTimeout(200);
    log(await ev(() => /Offer over, bag price kept/.test(document.querySelector('[data-testid=bag-ended]').innerText)), vp.w+': note words from the setting');
    const iss = await ev(() => { var W = innerWidth, el = document.querySelector('[data-testid=bag-ended]'), r = el.getBoundingClientRect(); return [r.right <= W, el.scrollWidth <= el.clientWidth + 1, document.documentElement.scrollWidth <= W]; });
    log(iss.every(Boolean), vp.w+': note fits ('+iss+')');
    await ctx.close();
  }
  log(errs.length===0, 'no JS errors '+errs.slice(0,2));
  console.log(fails ? 'FAILS: '+fails : 'ALL PASSED'); await b.close(); process.exit(fails?1:0);
})();
