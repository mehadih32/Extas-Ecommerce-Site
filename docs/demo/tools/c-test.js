// usage: node tools/c-test.js dist/c.html shots/c
// Click-through test for the combo page (#/combo/:id) and Build-your-own-set page (#/set).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'); const fs = require('fs');
const [html, outdir] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
let fails = 0, errors = 0;
function ok(cond, msg) { if (cond) console.log('  ok  ' + msg); else { fails++; console.log('  FAIL ' + msg); } }

(async () => {
  const browser = await chromium.launch();
  const url = 'file://' + path.resolve(html);
  async function newPage(vp) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: !!vp.isMobile, hasTouch: !!vp.isMobile });
    const page = await ctx.newPage();
    page.on('pageerror', e => { errors++; console.log(`[${vp.name}] PAGEERROR ${e.message}`); });
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) { errors++; console.log(`[${vp.name}] CONSOLE ${m.text()}`); } });
    await page.goto(url + '#/combo/polo-duo');
    await page.evaluate(() => { localStorage.clear(); ST = seedState(); ST.seenIntro = true; saveState(); UI = {}; render(); });
    await page.waitForTimeout(200);
    return { ctx, page };
  }
  const nav = async (page, h) => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(250); };
  const shot = async (page, name, full) => page.screenshot({ path: path.join(outdir, name + '.png'), fullPage: !!full });

  /* ---------------- desktop ---------------- */
  console.log('DESKTOP');
  let { ctx, page } = await newPage({ name: 'desk', width: 1366, height: 900 });
  await nav(page, '#/combo/polo-duo');
  ok(await page.$('[data-testid="combo-C1"]'), 'polo-duo renders C1 by default');
  ok((await page.textContent('[data-testid="cb-colors"]')).trim() === 'Navy + White', 'auto colour name is "Navy + White"');

  // validation: nothing picked
  await page.click('.cb-donly [data-act="cb-add"]');
  await page.waitForTimeout(150);
  ok(await page.$('.cb-item.err'), 'Add without size highlights the item card');
  ok(/Pick a size/.test(await page.textContent('.toast')), 'toast asks for a size');
  ok((await page.evaluate(() => ST.bag.length)) === 0, 'bag still empty after failed add');

  // popular pair + sizes
  await page.click('[data-act="cb-pair"][data-colors="black,olive"]');
  ok((await page.textContent('[data-testid="cb-colors"]')).trim() === 'Black + Olive', 'popular pair sets both colours');
  await page.click('[data-act="cb-size"][data-i="0"][data-s="L"]');
  ok(await page.$eval('[data-change="cb-same"][data-i="1"]', e => e.checked), '"Same size as item 1" is on');
  ok(await page.$('[data-act="cb-size"][data-i="1"][data-s="L"].on'), 'item 2 follows item 1 size (L)');
  // olive XL is sold out -> disabled
  ok(await page.$eval('[data-act="cb-size"][data-i="1"][data-s="XL"]', e => e.disabled), 'out-of-stock size (Olive XL) is disabled');
  // gallery
  await page.click('[data-act="cb-gal"][data-i="1"]');
  await page.click('[data-act="cb-view"][data-v="back"]');
  ok(/Item 2 · Olive · Back/.test(await page.textContent('.cb-stage')), 'gallery shows item 2 back view');
  await shot(page, 'T_desk_polo-duo_gallery-back');
  await page.click('.cb-stage [data-act="cb-view"][data-v="set"]');
  // add
  await page.click('.cb-donly [data-act="cb-add"]');
  await page.waitForTimeout(150);
  const bag1 = await page.evaluate(() => ST.bag);
  ok(bag1.length === 1 && bag1[0].kind === 'set' && bag1[0].source === 'combo' && bag1[0].refId === 'polo-duo' && bag1[0].price === 1500, 'bag gets a combo set line at ৳1,500');
  ok(JSON.stringify(bag1[0].items.map(i => [i.product, i.color, i.size])) === JSON.stringify([['essential-pique-polo', 'black', 'L'], ['essential-pique-polo', 'olive', 'L']]), 'set items = Black L + Olive L');
  ok(/View bag/.test(await page.textContent('.toast')), 'toast has a "View bag" link');
  await shot(page, 'T_desk_polo-duo_added');

  // unlink by picking own size on item 2
  await page.click('[data-act="cb-size"][data-i="1"][data-s="M"]');
  ok(!(await page.$eval('[data-change="cb-same"][data-i="1"]', e => e.checked)), 'picking a size on item 2 unticks "Same size"');

  // C1 office trio (3 different products) + Order Now
  await page.evaluate(() => { ST.comboTemplate = 'C1'; saveState(); });
  await nav(page, '#/combo/office-trio');
  ok(await page.$('[data-testid="combo-C1"]'), 'office-trio forced to C1');
  await page.click('[data-act="cb-size"][data-i="0"][data-s="L"]');
  await page.click('[data-act="cb-size"][data-i="1"][data-s="32"]');
  await page.click('[data-act="cb-size"][data-i="2"][data-s="L"]');
  await page.click('[data-act="cb-unit"][data-v="cm"]');
  ok(/cm/.test(await page.textContent('#cb-item-1 .cb-measure')), 'cm toggle switches measurement line');
  await shot(page, 'T_desk_office-trio_C1', true);
  await page.click('.cb-donly [data-act="cb-order"]');
  await page.waitForTimeout(250);
  ok((await page.evaluate(() => location.hash)) === '#/checkout', 'Order Now goes to #/checkout');
  ok((await page.evaluate(() => ST.bag.length)) === 2, 'Order Now added the set first');

  // C2 screenshots + step flow
  await page.evaluate(() => { ST.comboTemplate = 'C2'; saveState(); UI = {}; });
  await nav(page, '#/combo/polo-duo');
  ok(await page.$('[data-testid="combo-C2"]'), 'polo-duo renders C2');
  await shot(page, 'T_desk_polo-duo_C2', true);
  await nav(page, '#/combo/office-trio');
  await shot(page, 'T_desk_office-trio_C2_step1', true);
  await page.click('[data-act="cb-next"]');
  ok(await page.$('.cb-panel.err'), 'C2 Next without size shows error');
  await page.click('[data-act="cb-color"][data-i="0"][data-c="white"]');
  await page.click('[data-act="cb-size"][data-i="0"][data-s="L"]');
  await page.click('[data-act="cb-next"]');
  await page.waitForTimeout(100);
  ok(/Oxford Cotton Shirt.*White, L/.test(await page.textContent('#cb-item-0')), 'completed step collapses to "Oxford Cotton Shirt — White, L"');
  await page.click('[data-act="cb-size"][data-i="1"][data-s="32"]');
  await page.click('[data-act="cb-next"]');
  await page.waitForTimeout(100);
  await shot(page, 'T_desk_office-trio_C2_step3', true);
  await page.click('[data-act="cb-size"][data-i="2"][data-s="M"]');
  await page.click('[data-act="cb-next"]');
  await page.waitForTimeout(100);
  ok(/Your set is ready/.test(await page.textContent('#cb-summary')), 'final review "Your set is ready"');
  await shot(page, 'T_desk_office-trio_C2_review', true);
  await page.click('.cb-donly [data-act="cb-add"]');
  const last = await page.evaluate(() => ST.bag[ST.bag.length - 1]);
  ok(last.refId === 'office-trio' && last.items.length === 3 && last.price === 3100, 'C2 adds office-trio set line (3 items, ৳3,100)');

  // inactive combo
  await page.evaluate(() => { ST.combosOverride['polo-chino'] = { active: false }; saveState(); });
  await nav(page, '#/combo/polo-chino');
  ok(await page.$('[data-testid="combo-unavailable"]'), 'inactive combo shows friendly unavailable state');
  await shot(page, 'T_desk_combo_inactive', true);
  await page.evaluate(() => { ST.combosOverride = {}; saveState(); });

  /* ---- build your own set ---- */
  await page.evaluate(() => { ST.bag = []; saveState(); });
  await nav(page, '#/set');
  ok(/Any 2 polos ৳1,500 · Any 3 ৳2,100/.test(await page.textContent('[data-testid="bs-headline"]')), 'headline "Any 2 polos ৳1,500 · Any 3 ৳2,100"');
  await page.click('[data-act="bs-add"][data-pid="essential-pique-polo"]');
  ok(/Pick a size/.test(await page.textContent('[data-testid="bs-card-essential-pique-polo"]')), 'Add to set without size asks for a size');
  await page.click('[data-act="bs-size"][data-pid="essential-pique-polo"][data-s="L"]');
  await page.click('[data-act="bs-add"][data-pid="essential-pique-polo"]');
  await page.click('[data-act="bs-color"][data-pid="essential-pique-polo"][data-c="white"]');
  await page.click('[data-act="bs-size"][data-pid="essential-pique-polo"][data-s="L"]');
  await page.click('[data-act="bs-add"][data-pid="essential-pique-polo"]');
  ok((await page.$$('.bs-donly [data-testid="slot-filled"]')).length === 2, 'same product added twice in different colours');
  ok((await page.textContent('.bs-donly [data-testid="bs-price"]')).trim() === '৳1,500', 'tier 2 price ৳1,500');
  ok(await page.$('[data-testid="tier-2"].on'), 'tier 2 card shows Unlocked');
  ok(/Add 1 more → 3 for ৳2,100/.test(await page.textContent('.bs-donly')), 'nudge "Add 1 more → 3 for ৳2,100"');
  await shot(page, 'T_desk_set_two', true);
  await page.click('[data-act="bs-size"][data-pid="textured-knit-polo"][data-s="M"]');
  await page.click('[data-act="bs-add"][data-pid="textured-knit-polo"]');
  ok((await page.textContent('.bs-donly [data-testid="bs-price"]')).trim() === '৳2,100', 'tier 3 price ৳2,100');
  ok(/Set full/.test(await page.textContent('[data-testid="bs-card-jersey-zip-polo"]')), 'cards show "Set full"');
  await shot(page, 'T_desk_set_full', true);
  // remove + re-add
  await page.click('.bs-donly [data-act="bs-rm"]');
  ok((await page.$$('.bs-donly [data-testid="slot-filled"]')).length === 2, 'remove button empties a slot');
  await page.click('[data-act="bs-add"][data-pid="textured-knit-polo"]');
  await page.click('.bs-donly [data-act="bs-bag"]');
  await page.waitForTimeout(250);
  const sb = await page.evaluate(() => ({ hash: location.hash, bag: ST.bag }));
  ok(sb.hash === '#/bag', 'Add set to Bag goes to #/bag');
  ok(sb.bag.length === 1 && sb.bag[0].source === 'custom' && sb.bag[0].refId === 'any-polos' && sb.bag[0].price === 2100 && sb.bag[0].items.length === 3 && sb.bag[0].name === 'Your set (3 items)', 'bag gets custom set line (3 items, ৳2,100)');
  // tabs clear selection
  await nav(page, '#/set/any-polos');
  await page.click('[data-act="bs-size"][data-pid="essential-pique-polo"][data-s="M"]');
  await page.click('[data-act="bs-add"][data-pid="essential-pique-polo"]');
  await page.click('[data-testid="bs-tab-any-tees"]');
  await page.waitForTimeout(250);
  ok((await page.$$('.bs-donly [data-testid="slot-filled"]')).length === 0, 'switching tab clears the selection');
  ok(/Any 2 T-shirts ৳950 · Any 3 ৳1,350/.test(await page.textContent('[data-testid="bs-headline"]')), 'T-shirt headline');
  await shot(page, 'T_desk_set_tees', true);
  // inactive rule in URL + no rules
  await nav(page, '#/set/office-skus');
  ok(/isn't available/.test(await page.textContent('main')), 'inactive rule id shows a notice and falls back');
  await page.evaluate(() => { ST.setRulesOverride = { 'any-polos': { active: false }, 'any-tees': { active: false } }; saveState(); });
  await nav(page, '#/set');
  ok(await page.$('[data-testid="set-empty"]'), 'no active rules -> friendly empty state');
  await shot(page, 'T_desk_set_empty', true);
  await page.evaluate(() => { ST.setRulesOverride = { 'office-skus': { active: true } }; saveState(); });
  await nav(page, '#/set/office-skus');
  ok(/Any 2 styles ৳2,400/.test(await page.textContent('[data-testid="bs-headline"]')), 'sku-mode rule works when owner turns it on');
  await page.evaluate(() => { ST.setRulesOverride = {}; saveState(); });
  await ctx.close();

  /* ---------------- phone ---------------- */
  console.log('PHONE');
  ({ ctx, page } = await newPage({ name: 'phone', width: 390, height: 844, isMobile: true }));
  await page.evaluate(() => { ST.comboTemplate = 'C1'; saveState(); });
  await nav(page, '#/combo/polo-duo');
  await shot(page, 'T_phone_polo-duo_top');
  const geo = await page.evaluate(() => { const m = document.querySelector('.cb-mbar').getBoundingClientRect(); const b = document.querySelector('.bnav').getBoundingClientRect(); return { mbarBottom: m.bottom, bnavTop: b.top, h: innerHeight }; });
  ok(Math.abs(geo.mbarBottom - geo.bnavTop) <= 2, `phone action bar sits right above the bottom nav (${geo.mbarBottom} vs ${geo.bnavTop})`);
  await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(100);
  await shot(page, 'T_phone_polo-duo_mid');
  await page.click('[data-act="cb-size"][data-i="0"][data-s="M"]');
  await page.click('.cb-mbar [data-act="cb-add"]');
  await page.waitForTimeout(150);
  ok((await page.evaluate(() => ST.bag.length)) === 1, 'phone bar "Add set to Bag" works');
  await shot(page, 'T_phone_polo-duo_added');
  await page.evaluate(() => { ST.comboTemplate = 'C2'; saveState(); UI = {}; render(); });
  await page.waitForTimeout(200);
  ok(await page.$('[data-testid="combo-C2"]'), 'phone: polo-duo renders C2');
  await shot(page, 'T_phone_polo-duo_C2', true);
  await nav(page, '#/combo/office-trio');
  await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(100);
  await shot(page, 'T_phone_office-trio_C2');
  await shot(page, 'T_phone_office-trio_C2_full', true);
  await nav(page, '#/set');
  await page.click('[data-act="bs-size"][data-pid="essential-pique-polo"][data-s="L"]');
  await page.click('[data-act="bs-add"][data-pid="essential-pique-polo"]');
  await page.click('[data-act="bs-size"][data-pid="textured-knit-polo"][data-s="L"]');
  await page.click('[data-act="bs-add"][data-pid="textured-knit-polo"]');
  ok(/2 items · ৳1,500 · Save ৳500/.test(await page.textContent('[data-testid="bs-mbar-line"]')), 'phone bar "2 items · ৳1,500 · Save ৳500"');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100);
  await shot(page, 'T_phone_set_top');
  await page.evaluate(() => window.scrollTo(0, 1100)); await page.waitForTimeout(100);
  await shot(page, 'T_phone_set_grid');
  await page.click('.bs-mbar [data-act="bs-bag"]');
  await page.waitForTimeout(250);
  ok((await page.evaluate(() => location.hash)) === '#/bag', 'phone: Add set to Bag goes to bag');
  await ctx.close();

  await browser.close();
  console.log(fails || errors ? `DONE: ${fails} failed check(s), ${errors} JS error(s)` : 'DONE: all checks passed, no JS errors');
})();
