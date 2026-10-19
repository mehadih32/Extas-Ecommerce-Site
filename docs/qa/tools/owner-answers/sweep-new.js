// node sweep-new.js <html> <from> <to> [--tablets] — the gate's own page checks (qa/device-matrix.js pageChecks)
// on the surfaces this wave changed, which the gate's route list does not visit.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs'), path = require('path');
const HTML = path.resolve(process.argv[2]); const A = +process.argv[3], B = +process.argv[4];
const src = fs.readFileSync('/home/claude/blueprint/qa/device-matrix.js', 'utf8');
const pc = src.slice(src.indexOf('function pageChecks'), src.indexOf('\n}\n', src.indexOf('function pageChecks')) + 2);
const pageChecks = eval('(' + pc + ')');
const PH = JSON.parse(fs.readFileSync('/home/claude/blueprint/qa/devices.json', 'utf8')).map(d => Object.assign({dpr:3}, d));
const TB = [{name:'Desktop 1280', w:1280, h:800}, {name:'Desktop 1440', w:1440, h:900}, {name:'iPad mini P', w:768, h:1024}, {name:'iPad mini L', w:1024, h:768}, {name:'iPad Air P', w:820, h:1180}, {name:'Android tab L', w:1280, h:800}].map(d => Object.assign({dpr:2}, d));
const DEV = (process.argv.includes('--tablets') ? TB : PH).slice(A, B);
const SET = {
  checkout: "ST.bag=[]; bagAdd({kind:'item',product:'essential-pique-polo',color:'navy',size:'M',qty:1},{force:true}); delete UI.checkout; saveState();",
  checkoutPaid: "var p=DB.products.filter(x=>!x.freeDelivery&&x.price<1000)[0]; ST.bag=[]; bagAdd({kind:'item',product:p.id,color:p.colors[0],size:p.sizes[1]||p.sizes[0],qty:1},{force:true}); delete UI.checkout; saveState();",
  off: "ST.comboAutoOverride=ST.comboAutoOverride||{}; ST.comboAutoOverride['solid-polo-2']={active:false}; ST.comboAutoOverride['hoodie-jogger']={start:'2099-01-01'}; CA.cache={}; saveState();",
  on: "delete ST.comboAutoOverride; CA.cache={}; saveState();",
  login: "login('01712345678','01712345678');",
  endedbag: "ST.bag=[]; delete ST.comboAutoOverride; CA.cache={}; ca_bagAdd(ca_listing('solid-polo-2~black-navy'),['L','L'],{force:true}); ST.comboAutoOverride={'solid-polo-2':{active:false}}; CA.cache={}; delete UI.checkout; saveState();",
  bn: "ST.lang='bn'; saveState();", en: "ST.lang='en'; saveState();"
};
const R = [['checkout', '#/checkout', 'checkout'], ['checkout-bn', '#/checkout', 'checkout;bn'], ['checkout-paid', '#/checkout', 'checkoutPaid;en', true],
  ['pdp', '#/p/essential-pique-polo', 'en'], ['pdp-bn', '#/p/oxford-cotton-shirt', 'bn'], ['help-delivery', '#/page/delivery', 'en'], ['help-exchange', '#/page/exchange', 'en'],
  ['combo-ended', '#/combos/solid-polo-2', 'off'], ['pair-ended', '#/combo-pair/solid-polo-2~black-navy', 'off'], ['combo-soon', '#/combos/hoodie-jogger', 'off;bn'],
  ['landing', '#/l/polo-duo', 'on;en'], ['account', '#/account/profile', 'login'],
  ['bag-ended', '#/bag', 'endedbag;en'], ['checkout-ended', '#/checkout', 'endedbag;bn'],
  ['adm-settings', '#/admin/settings', 'en;on'], ['adm-combos', '#/admin/combos', 'off'], ['adm-archive', '#/admin/combos?tab=archive', 'off'], ['adm-cust', '#/admin/customers', 'on'], ['adm-cust1', '#/admin/customers/01712345678', '']];
(async () => {
  const b = await chromium.launch(); let fails = 0, runs = 0;
  for (const d of DEV) {
    const ctx = await b.newContext({viewport:{width:d.w, height:d.h}, deviceScaleFactor:d.dpr, isMobile:true, hasTouch:true});
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto('file://'+HTML+'#/'); await pg.waitForTimeout(400);
    await pg.evaluate(() => { localStorage.clear(); resetState(); ST.seenIntro = true; saveState(); closeModal(true); });
    for (const [n, url, pre, addr] of R) {
      await pg.evaluate(([pre, S]) => { pre.split(';').filter(Boolean).forEach(k => eval(S[k])); location.hash = '#/'; }, [pre, SET]); await pg.waitForTimeout(150);
      await pg.evaluate(u => { location.hash = u; }, url); await pg.waitForTimeout(500);
      if (addr) { await pg.evaluate(() => { var u = co_state(); u.name = 'Rahim'; u.phone = '01811223344'; u.address = 'House 3, Road 2, Dhanmondi, Dhaka'; u.addrRead = u.address; rerender(); }); await pg.waitForTimeout(1100); }
      await pg.evaluate(() => { closeModal(true); document.querySelectorAll('.toast').forEach(t => t.remove()); });
      const g = await pg.evaluate(pageChecks, d.w); runs++;
      if (g.issues.length) { fails++; console.log('  FAIL '+d.w+'x'+d.h+' '+n+' '+JSON.stringify(g.issues).slice(0, 400)); }
    }
    if (errs.length) { fails++; console.log('  JS errors '+d.w+': '+errs.slice(0,2).join(' | ')); }
    await ctx.close();
  }
  console.log((process.argv.includes('--tablets') ? 'tablets ' : 'phones ')+DEV.map(d => d.w+'x'+d.h).join(' ')+' · '+runs+' page checks · '+(fails ? fails+' FAILING' : 'ALL CLEAN'));
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
