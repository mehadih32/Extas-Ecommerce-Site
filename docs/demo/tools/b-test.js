// usage: node tools/b-test.js dist/b.html shots/b   — click-through checks for the product page (30-product.js)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'); const fs = require('fs');
const [html, outdir] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
let fails = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok   ' + msg); else { fails++; console.log('  FAIL ' + msg); } };

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ name: 'desk', width: 1366, height: 900 }, { name: 'phone', width: 390, height: 844, isMobile: true }]) {
    console.log('== ' + vp.name);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: !!vp.isMobile, hasTouch: !!vp.isMobile });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); });
    const url = 'file://' + path.resolve(html);
    const nav = async h => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(250); };
    const toast = () => page.evaluate(() => { const t = document.querySelector('.toast'); return t ? t.textContent : ''; });
    const shot = async n => page.screenshot({ path: path.join(outdir, vp.name + '_' + n + '.png') });
    const click = async sel => { await page.locator(sel).first().click(); await page.waitForTimeout(150); };
    const addSel = vp.name === 'desk' ? '.pdp-dk [data-act="pdp-add"]' : '.pdp-mbar [data-act="pdp-add"]';
    const orderSel = vp.name === 'desk' ? '.pdp-dk [data-act="pdp-order"]' : '.pdp-mbar [data-act="pdp-order"]';

    await page.goto(url + '#/p/essential-pique-polo');
    await page.evaluate(() => { localStorage.clear(); ST = seedState(); ST.seenIntro = true; saveState(); render(); });
    await page.waitForTimeout(200);

    // 1. Add to Bag without a size
    await click(addSel);
    ok(/Please choose a size/.test(await toast()), 'add without size -> toast');
    ok(await page.locator('.pdp-pills.err').count() === 1, 'size pills highlighted');

    // 2. Size chart: click row L
    await click('[data-act="pdp-open-chart"]');
    ok(await page.locator('.modal [data-testid="chart-table"]').count() === 1, 'size chart modal open');
    await shot('chart_modal');
    await page.locator('.modal tr.pick[data-size="XXL"] td').nth(2).click(); await page.waitForTimeout(150);
    ok(/out of stock/i.test(await toast()) && await page.locator('.modal').count() === 1, 'out-of-stock row (XXL navy) not selectable, modal stays');
    await click('.modal [data-act="pdp-unit"][data-v="cm"]');
    ok(/cm/.test(await page.locator('.modal tbody tr').first().innerText()), 'cm toggle in chart');
    await page.locator('.modal tr.pick[data-size="L"] td').nth(1).click(); await page.waitForTimeout(150);
    ok(await page.locator('.modal').count() === 0, 'row click closes modal');
    ok(/Size L selected/.test(await toast()), 'toast "Size L selected"');
    ok(await page.locator('.pdp-pills .size-pill.on').innerText() === 'L', 'pill L selected');
    ok(/Only 2 left in Navy, size L/.test(await page.locator('[data-testid="stock-line"]').innerText()), 'low stock line for navy L');
    await click('[data-act="pdp-unit-toggle"]');
    ok(/cm/.test(await page.locator('.pdp-fitline, #pdp-sizes').first().innerText()), 'inline line in cm');
    await click('[data-act="pdp-unit-toggle"]');

    // 3. Find my size via card
    await click('[data-testid="fms-card"]');
    ok(await page.locator('.modal [data-testid="finder-show"]').count() === 1, 'finder modal open (ask step)');
    for (let i = 0; i < 3; i++) await click('.modal [data-act="pdp-step"][data-k="kg"][data-d="-1"]');
    ok(/63 kg/.test(await page.locator('#pdp-m-kg').innerText()), 'weight stepper patches value (63 kg)');
    await click('.modal [data-act="pdp-step"][data-k="in"][data-d="1"]');
    ok(/8 in/.test(await page.locator('#pdp-m-in').innerText()), 'inch stepper (5 ft 8 in)');
    await shot('finder_ask');
    await click('.modal [data-testid="finder-show"]');
    const res = await page.locator('.modal [data-testid="finder-result"]').innerText();
    ok(/your size/i.test(res) && await page.locator('.modal .pdp-why li').count() === 2, 'finder result with 2 reasons');
    await shot('finder_result');
    const recSize = await page.locator('.modal [data-testid="finder-select"]').getAttribute('data-size');
    await click('.modal [data-testid="finder-select"]');
    const saved = await page.evaluate(() => ST.guestSize);
    ok(saved && saved.top === recSize && saved.heightIn === 68 && saved.weightKg === 63, 'mySize saved: top=' + recSize + ' h=68 w=63');
    ok(await page.locator('.pdp-pills .size-pill.on').getAttribute('data-s') === recSize || /out of stock/.test(await toast()), 'recommended size selected');
    ok(await page.locator('.pdp-ystag').count() === 1, '"Your size" tag on pill');

    // 4. Add to bag -> modal with Polo Duo upsell
    await page.evaluate(() => { const c = pdp_cur(); c.u.size = 'M'; rerender(); });
    await click(addSel);
    ok(await page.locator('.modal [data-testid="bag-modal"]').count() === 1, 'added-to-bag modal');
    ok(await page.locator('.modal [data-testid="duo-upsell"]').count() === 1, 'Polo Duo upsell shown');
    await shot('bag_modal');
    await click('.modal [data-act="pdp-duo-add"][data-c="black"]');
    const tot = await page.evaluate(() => bagTotals());
    ok(tot.count === 2 && tot.autoApplied.indexOf('polo-duo') >= 0 && tot.total === 1500, 'second polo added, duo applied, total 1500 (' + tot.total + ')');
    ok(/Polo Duo/.test(await toast()), 'duo toast');
    await shot('bag_modal_duo');
    await click('.modal [data-act="close-modal"]');

    // 5. Neighbouring size -> soft note
    await page.evaluate(() => { const c = pdp_cur(); c.u.size = 'L'; rerender(); });
    await click(addSel);
    ok(await page.locator('.modal [data-testid="bracket-note"]').count() === 1, 'bracket note (M and L same colour)');
    ok(/Checkout|চেকআউট/.test(await page.locator('.modal .pdp-bagbtns').innerText()), 'bag modal buttons');
    await click('.modal [data-act="close-modal"]');

    // 6. Colour switch + true colour photo
    await click('.pdp-sw [data-c="red"]');
    ok(await page.evaluate(() => pdp_cur().u.color) === 'red', 'colour switched to red');
    ok(await page.locator('.pdp-pills .size-pill.out').count() >= 1, 'out-of-stock pill for red L');
    await click('[data-act="pdp-truecol"]');
    ok(await page.evaluate(() => pdp_cur().u.view) === 'flat', 'true-colour photo view');
    ok(/True colour/.test(await page.locator('#pdp-main').innerText()), 'flat chip on main image');

    // 7. wishlist + share
    await click('.pdp-b [data-act="wish"]');
    ok(await page.evaluate(() => ST.wishlist.indexOf('essential-pique-polo') >= 0), 'wishlist saved');
    await click('[data-act="pdp-share"]');
    ok(/Link copied/.test(await toast()), 'share toast');

    // 8. query.color + finder=1 opens once
    await nav('#/p/textured-knit-polo?color=bottle');
    ok(await page.evaluate(() => pdp_cur().u.color) === 'bottle', 'query.color preselects bottle');
    await nav('#/p/essential-pique-polo?finder=1');
    await page.waitForTimeout(100);
    ok(await page.locator('.modal [data-testid="finder-show"], .modal [data-testid="finder-result"]').count() === 1, 'finder auto-opens with ?finder=1');
    await shot('finder_auto');
    await click('.modal [data-act="close-modal"]');
    await page.evaluate(() => rerender()); await page.waitForTimeout(100);
    ok(await page.locator('.modal').count() === 0, 'finder does not reopen on rerender');

    // 9. Order Now
    await nav('#/p/slim-chino-trousers');
    await page.evaluate(() => { const c = pdp_cur(); c.u.size = '32'; rerender(); });
    ok(/32 fits waist up to 32/.test(await page.locator('#pdp-sizes').innerText()), 'bottom inline measurement line');
    await click(orderSel);
    ok(await page.evaluate(() => location.hash) === '#/checkout', 'Order Now -> #/checkout');

    // 10. Extras
    await nav('#/p/cotton-socks-3');
    ok(await page.locator('.pdp-pills').count() === 0 && await page.locator('[data-testid="fms-card"]').count() === 0, 'socks: no size pills / finder');
    await click(addSel);
    ok(await page.locator('.modal [data-testid="bag-modal"]').count() === 1, 'socks add to bag works');
    await click('.modal [data-act="close-modal"]');

    // 11. Templates T2 / T3 for all test products
    for (const tpl of ['T1', 'T2', 'T3']) {
      for (const id of ['essential-pique-polo', 'slim-chino-trousers', 'cotton-socks-3']) {
        await nav('#/p/' + id);
        await page.evaluate(t => { ST.pdpTemplate = t; rerender(); }, tpl);
        await page.waitForTimeout(120);
        const bad = await page.evaluate(() => /Something went wrong/.test(document.body.innerText));
        ok(!bad && await page.locator('.pdp-page.pdp-tpl-' + tpl).count() === 1, tpl + ' renders for ' + id);
        if (id === 'essential-pique-polo') { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(outdir, vp.name + '_tpl_' + tpl + '.png'), fullPage: true }); }
      }
    }
    // T3 inline finder
    await page.evaluate(() => { ST.guestSize = null; saveState(); });
    await nav('#/p/contrast-collar-polo');
    await page.evaluate(() => { ST.pdpTemplate = 'T3'; UI['pdp:contrast-collar-polo'] = null; rerender(); });
    ok(await page.locator('[data-testid="t3-card"]').count() === 1, 'T3 your-size card first');
    await click('[data-act="pdp-step"][data-scope="i"][data-k="kg"][data-d="1"]');
    await click('[data-testid="t3-find"]');
    const t3 = await page.locator('[data-testid="t3-card"]').innerText();
    ok(/Your size: /.test(t3) && /Change/.test(t3), 'T3 result "Your size: X" + Change');
    ok(await page.locator('.pdp-t3 .pdp-meas').count() === 1, 'T3 measurement table for selected size');
    await page.locator('[data-testid="t3-card"]').scrollIntoViewIfNeeded();
    await shot('t3_result');
    // T2 true colour scroll
    await page.evaluate(() => { ST.pdpTemplate = 'T2'; rerender(); });
    await click('[data-act="pdp-truecol"]');
    ok(await page.locator('#pdp-flat.pdp-flash').count() === 1, 'T2 true-colour flashes flat tile');
    await page.evaluate(() => { ST.pdpTemplate = 'auto'; saveState(); });

    // desktop sticky column
    if (vp.name === 'desk') {
      await nav('#/p/essential-pique-polo');
      const pos = await page.evaluate(() => getComputedStyle(document.getElementById('pdp-buy')).position);
      ok(pos === 'sticky', 'info column sticky on desktop');
    } else {
      await nav('#/p/essential-pique-polo');
      ok(await page.locator('.pdp-mbar').isVisible() && !(await page.locator('.bnav').isVisible()), 'phone: action bar visible, bottom nav hidden');
    }
    ok(errs.length === 0, 'no JS errors ' + (errs.length ? JSON.stringify(errs.slice(0, 3)) : ''));
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `DONE with ${fails} failure(s)` : 'DONE, all passed');
})();
