// usage: node tools/journey.js <html> <outdir>
// Full customer journey with real clicks, at phone and desktop. Viewport screenshots at each step.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'); const fs = require('fs');
(async () => {
  const [html, outdir] = process.argv.slice(2);
  fs.mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch();
  let errors = 0, fails = 0;
  const ok = (c, m) => { if (c) console.log('  ok  ' + m); else { fails++; console.log('  FAIL ' + m); } };
  for (const vp of [{ name: 'phone', width: 390, height: 844, isMobile: true }, { name: 'desk', width: 1366, height: 900 }]) {
    console.log('== ' + vp.name);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: !!vp.isMobile, hasTouch: !!vp.isMobile });
    const page = await ctx.newPage();
    page.on('pageerror', e => { errors++; console.log(`[${vp.name}] PAGEERROR ${e.message}`); });
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) { errors++; console.log(`[${vp.name}] CONSOLE ${m.text()}`); } });
    let n = 0;
    const shot = async (label) => { n++; await page.waitForTimeout(250); await page.screenshot({ path: path.join(outdir, `${vp.name}_${String(n).padStart(2, '0')}_${label}.png`) }); };
    const vis = async (sel) => {
      const els = await page.$$(sel);
      for (const e of els) { if (await e.isVisible()) return e; }
      return null;
    };
    const click = async (sel, label) => {
      const e = await vis(sel);
      if (!e) { ok(false, 'visible: ' + (label || sel)); return false; }
      await e.scrollIntoViewIfNeeded(); await e.click(); await page.waitForTimeout(250); return true;
    };
    const hash = async (h) => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(300); };

    await page.goto('file://' + path.resolve(html) + '#/');
    await page.waitForTimeout(600);
    ok(await page.isVisible('.modal'), 'welcome guide shows on first visit');
    await shot('welcome');
    await click('[data-act="intro-close"]', 'Start shopping');
    await shot('home');

    // product page
    await hash('#/p/essential-pique-polo');
    await shot('pdp');
    await click('[data-act="pdp-open-finder"]', 'Find my size');
    await shot('finder');
    await page.evaluate(() => closeModal());
    await click('[data-act="pdp-size"][data-s="M"]', 'size M');
    await click('[data-act="pdp-add"]', 'Add to Bag');
    await shot('added');
    const bagCount = await page.evaluate(() => ST.bag.length);
    ok(bagCount === 1, 'one line in bag (got ' + bagCount + ')');
    await page.evaluate(() => closeModal());

    // second polo, another colour -> combo auto-applies
    await hash('#/p/essential-pique-polo?color=white');
    await click('[data-act="pdp-size"][data-s="M"]', 'size M (white)');
    await click('[data-act="pdp-add"]', 'Add to Bag 2');
    await page.evaluate(() => closeModal());
    await hash('#/bag');
    await shot('bag');
    const t = await page.evaluate(() => bagTotals());
    ok(t.setDiscounts.length > 0 && t.total === 1500, 'Polo Duo auto price ৳1,500 (got ' + t.total + ')');

    // checkout
    await hash('#/checkout');
    await shot('checkout');
    await page.fill('[data-input="co-name"]', 'Tanvir Ahmed');
    await page.fill('[data-input="co-phone"]', '01811223344');
    await page.fill('[data-input="co-address"]', 'House 12, Road 5, Dhanmondi, Dhaka');
    await page.waitForTimeout(300);
    await shot('checkout_filled');
    await click('button.co-confirm:not([disabled])', 'Confirm Order');
    await page.waitForTimeout(400);
    const h1 = await page.evaluate(() => location.hash);
    ok(/thanks/.test(h1), 'thank-you page (' + h1 + ')');
    await shot('thanks');
    const oid = h1.split('/').pop();

    // account + order
    await hash('#/account');
    await shot('account');
    await hash('#/order/' + oid);
    await shot('order');
    for (let i = 0; i < 6; i++) {
      const b = await vis('[data-act="ord-demo-next"]');
      if (!b) break; await b.click(); await page.waitForTimeout(200);
    }
    const st = await page.evaluate(id => ST.orders[id].status, oid);
    ok(st === 'delivered', 'order advanced to delivered (got ' + st + ')');
    await shot('order_delivered');
    if (await click('[data-act="ord-rev-open"]', 'Rate & review')) { await shot('review'); await page.evaluate(() => closeModal()); }

    // exchange on the returning customer's order (4 tiers)
    await page.evaluate(() => { logout(); });
    await hash('#/login');
    await page.fill('input[type="tel"], [data-input="login-phone"]', '01712345678');
    const pw = await vis('input[type="password"]'); if (pw) await pw.fill('01712345678');
    await click('#app form[data-submit="login-form"] button[type="submit"]', 'Log in');
    const who = await page.evaluate(() => (currentAccount() || {}).name);
    ok(who === 'Rakib Hasan', 'returning customer logged in (' + who + ')');
    await hash('#/exchange/EX-1038?line=0');
    await shot('exchange_1');
    await page.waitForTimeout(200);
    const steps = await page.evaluate(() => document.querySelector('#app').innerText.slice(0, 400).replace(/\s+/g, ' '));
    console.log('     exchange page: ' + steps.slice(0, 160));

    // admin: change exchange window in Smart Rules and see the shop update
    await hash('#/admin/rules');
    await shot('admin_rules');
    await hash('#/admin/ai');
    await shot('admin_ai');
    await hash('#/admin/landing/new');
    await shot('admin_landing_new');
    await hash('#/l/polo-duo');
    await shot('landing');
    await ctx.close();
  }
  await browser.close();
  console.log(`DONE errors=${errors} fails=${fails}`);
})();
