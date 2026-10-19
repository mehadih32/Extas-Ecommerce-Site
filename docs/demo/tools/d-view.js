// viewport (not full-page) phone shots of bag / checkout / thanks, plus festive theme check
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const HTML = 'file://' + path.resolve(__dirname, '../dist/d.html');
const OUT = path.resolve(__dirname, '../shots/d');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); let errs = 0;
  p.on('pageerror', e => { errs++; console.log('PAGEERROR', e.message); });
  await p.goto(HTML + '#/'); await p.waitForTimeout(300);
  await p.evaluate(() => { localStorage.clear(); ST = seedState(); UI = {}; bagAdd({kind:'item',product:'essential-pique-polo',color:'navy',size:'L',qty:1}); bagAdd({kind:'set',source:'combo',refId:'polo-duo',name:'Polo Duo',items:[{product:'essential-pique-polo',color:'white',size:'M'},{product:'essential-pique-polo',color:'olive',size:'M'}],price:1500}); location.hash = '#/bag'; });
  await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/view_phone_bag_top.png' });
  await p.evaluate(() => { location.hash = '#/checkout'; }); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/view_phone_co_top.png' });
  await p.fill('#co-name', 'Sabbir Rahman'); await p.fill('#co-phone', '01812345678'); await p.fill('#co-address', 'Agrabad, Chattogram');
  await p.click('.co-confirm:visible'); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '/view_phone_ty_top.png' });
  await p.evaluate(() => { ST.theme = 'festive'; applyTheme(); rerender(); });
  await p.screenshot({ path: OUT + '/view_phone_ty_festive.png', fullPage: true });
  const o = await p.evaluate(() => ST.orders[location.hash.split('/').pop()]);
  console.log('order', o.id, 'total', o.total, 'delivery', o.delivery, 'zone', o.zone, 'flags', JSON.stringify(o.flags), 'lines', o.lines.length);
  await b.close(); console.log(errs ? 'errors: ' + errs : 'no errors');
})();
