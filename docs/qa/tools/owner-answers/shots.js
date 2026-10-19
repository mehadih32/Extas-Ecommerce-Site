// node shots.js <html> <outdir> — screenshots of every owner-answer change (393×852, checkout also 360×800)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const HTML = path.resolve(process.argv[2]), OUT = process.argv[3]; fs.mkdirSync(OUT, {recursive:true});
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const vp of [{w:393, h:852}, {w:360, h:800}]) {
    const ctx = await b.newContext({viewport:{width:vp.w, height:vp.h}, isMobile:true, hasTouch:true, deviceScaleFactor:2});
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
    await pg.goto('file://'+HTML+'#/'); await pg.waitForTimeout(400);
    const ev = (f, a) => pg.evaluate(f, a);
    const go = async h => { await ev(x => { if(location.hash===x) rerender(); else location.hash = x; }, h); await pg.waitForTimeout(450); };
    const noToast = () => ev(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); });
    const shot = async (n, sel, dy) => { if(sel){ await ev(a => { var e = document.querySelector(a.s); if(e){ e.scrollIntoView({block:'start'}); window.scrollBy(0, a.dy||0); } }, {s:sel, dy:dy||-90}); await pg.waitForTimeout(250); } await pg.screenshot({path:path.join(OUT, n+'-'+vp.w+'.png')}); };
    await ev(() => { localStorage.clear(); resetState(); ST.seenIntro = true; saveState(); closeModal(true); });
    const fillCo = async () => { await ev(() => { ST.bag = []; bagAdd({kind:'item', product:'essential-pique-polo', color:'navy', size:'M', qty:1}, {force:true}); delete UI.checkout; saveState(); }); await go('#/checkout');
      await ev(() => { var u = co_state(); u.name = 'Rahim Uddin'; u.phone = '01811223344'; u.address = 'House 3, Road 2, Dhanmondi, Dhaka'; u.addrRead = u.address; rerender(); }); await pg.waitForTimeout(1200); await noToast(); };
    /* checkout — both widths, both languages */
    await fillCo();
    await shot('checkout-consent', '[data-testid=co-consent-sms]', 2000);
    await shot('checkout-trial', '[data-testid=co-delivery]', -80);
    await ev(() => { ST.lang = 'bn'; saveState(); rerender(); }); await pg.waitForTimeout(300);
    await shot('checkout-consent-bn', '[data-testid=co-consent-sms]', 2000);
    await shot('checkout-trial-bn', '[data-testid=co-delivery]', -80);
    await ev(() => { ST.lang = 'en'; saveState(); });
    /* free-delivery checkout (trial under the hours promise) */
    await ev(() => { var p = DB.products.filter(x => !x.freeDelivery && x.price < 1000 && x.colors && x.sizes)[0]; ST.bag = []; bagAdd({kind:'item', product:p.id, color:p.colors[0], size:p.sizes[1]||p.sizes[0], qty:1}, {force:true}); saveState(); }); await go('#/checkout');
    await ev(() => { var u = co_state(); u.address = 'House 3, Road 2, Dhanmondi, Dhaka'; u.addrRead = u.address; rerender(); }); await pg.waitForTimeout(1200); await noToast();
    await shot('checkout-trial-paid', '[data-testid=co-delivery]', -80);
    if (vp.w === 393) {
      /* product page */
      await go('#/p/essential-pique-polo'); await noToast();
      await shot('pdp-trial', '[data-testid=pdp-rules]', -360);
      await ev(() => { ST.lang = 'bn'; saveState(); rerender(); }); await pg.waitForTimeout(300); await shot('pdp-trial-bn', '[data-testid=pdp-rules]', -360);
      await ev(() => { ST.lang = 'en'; saveState(); rerender(); });
      await ev(() => { ST.shopOpt = {'bag.duplicateAdd':'qty'}; ST.bag = []; saveState(); var c = pdp_cur(); c.u.size = 'M'; c.u.color = 'navy'; LAST_ADD = {k:'',t:0}; ACT['pdp-add'](); closeModal(true); LAST_ADD = {k:'',t:0}; ACT['pdp-add'](); });
      await pg.waitForTimeout(200); await shot('pdp-same-size-qty');
      await ev(() => { ST.shopOpt = {}; ST.bag = []; saveState(); var c = pdp_cur(); LAST_ADD = {k:'',t:0}; ACT['pdp-add'](); closeModal(true); LAST_ADD = {k:'',t:0}; ACT['pdp-add'](); });
      await pg.waitForTimeout(200); await shot('pdp-same-size-block');
      await ev(() => { delete ST.shopOpt; ST.bag = []; saveState(); });
      /* help pages */
      await go('#/page/delivery'); await noToast(); await shot('help-delivery', '[data-testid=trial-help]', -200);
      await go('#/page/exchange'); await noToast(); await shot('help-exchange');
      /* settings */
      await go('#/admin/settings'); await noToast();
      await shot('settings-consent', '#zs-g-consent', -10); await shot('settings-trial', '#zs-g-trial', -10); await shot('settings-bag', '#zs-g-bagopt', -10);
      /* account preferences */
      await ev(() => { login('01712345678','01712345678'); }); await go('#/account/profile'); await noToast(); await shot('account-offer-switches', '.acc-prefs', -40);
      /* CRM */
      await go('#/admin/customers'); await noToast(); await shot('crm-list', '#zr-rows', -120);
      await go('#/admin/customers/01712345678'); await pg.locator('[data-testid=zr-copy]').click(); await pg.waitForTimeout(150); await noToast();
      await shot('crm-profile-phone', '.zr-hero', -70);
      await shot('crm-consent', '[data-testid=zr-cons-sms]', -120);
      await shot('crm-viewlog', '[data-testid=zr-viewlog]', -40);
      /* combo lifecycle */
      await ev(() => { acw_patch('solid-polo-2', {active:false}); acw_patch('hoodie-jogger', {start:'2099-01-01'}); });
      await go('#/admin/combos'); await noToast(); await shot('admin-combo-rules', '.acb-g', -120);
      await shot('admin-combo-soon', '[data-testid=acw-rule-hoodie-jogger] [data-testid=acw-dates]', -380);
      await go('#/admin/combos?tab=archive'); await noToast(); await shot('admin-combo-archive');
      await shot('admin-combo-archive-card', '[data-testid=acw-rule-solid-polo-2] [data-testid=acw-dates]', -420);
      const pid = await ev(() => ca_generate(ca_rule('solid-polo-2')).all[0].id);
      await go('#/combo-pair/'+pid); await noToast(); await shot('combo-ended-pair');
      await go('#/combos/solid-polo-2'); await noToast(); await shot('combo-ended-page');
      await ev(() => { ST.lang = 'bn'; saveState(); }); await go('#/combos/hoodie-jogger'); await noToast(); await shot('combo-starts-later');
      await ev(() => { ST.lang = 'en'; acw_patch('solid-polo-2', {active:true}); acw_patch('hoodie-jogger', {start:''}); saveState(); });
      await go('#/admin/combos?tab=new'); await ev(() => { UI.acw.step = 8; UI.acw.d.bind.categories = ['polos']; rerender(); }); await pg.waitForTimeout(300); await shot('admin-wizard-dates', '#acw-ds', -300);
      /* slider snapped after a hand swipe */
      await pg.mouse.move(2, 2); await go('#/'); await pg.waitForTimeout(900);
      const t = await ev(() => { var e = document.getElementById('hm-settrack'); e.scrollIntoView({block:'center'}); var r = e.getBoundingClientRect(); return {x:Math.round(r.left + r.width*0.7), y:Math.round(r.top + r.height/2)}; });
      await pg.waitForTimeout(300); await shot('slider-before-swipe');
      const cdp = await ctx.newCDPSession(pg);
      await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:t.x, y:t.y}]});
      for (let i=1;i<=10;i++){ await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:t.x - i*11, y:t.y}]}); await pg.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]}); await pg.waitForTimeout(900);
      await shot('slider-after-swipe-snapped');
    }
    await ctx.close();
  }
  console.log(errs.length ? 'JS errors: '+JSON.stringify(errs.slice(0,3)) : 'no JS errors');
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
