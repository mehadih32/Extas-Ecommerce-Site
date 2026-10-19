// usage: node tools/a-test.js dist/a.html shots/a
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const [html, out] = process.argv.slice(2);
  const url = 'file://' + path.resolve(html);
  const browser = await chromium.launch();
  let fails = 0;
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
  const cards = p => p.$$eval('[data-testid=cat-grid] .pcard', els => els.map(e => e.getAttribute('data-testid').replace('pcard-', '')));

  // ---------- desktop ----------
  let ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  let page = await ctx.newPage();
  page.on('pageerror', e => { fails++; console.log('PAGEERROR', e.message); });
  await page.goto(url + '#/c/polos'); await page.waitForTimeout(200);
  await page.evaluate(() => { ST.seenIntro = true; saveState(); });
  ok((await cards(page)).length === 6, 'polos: 6 cards');
  ok(!!(await page.$('[data-testid=cat-set-banner]')), 'polos: set banner present');
  const bannerIdx = await page.$$eval('[data-testid=cat-grid] > *', els => els.findIndex(e => e.matches('[data-testid=cat-set-banner]')));
  ok(bannerIdx === 4, 'banner after 4th card (index ' + bannerIdx + ')');
  ok((await page.textContent('[data-testid=cat-set-banner]')).includes('Any 2 for ৳1,500 · Any 3 for ৳2,100'), 'banner tier text');
  ok(!(await page.$('[data-fk="d-mine-"]')), 'no My size toggle without saved size');

  // size L: striped-rib has L=0 in all colours
  await page.click('.cat-side [data-group=sizes][data-v=L]'); await page.waitForTimeout(100);
  let c = await cards(page);
  ok(c.length === 5 && c.indexOf('striped-rib-polo') < 0, 'size L filter excludes striped rib (got ' + c.join(',') + ')');
  // colour mustard + size L -> none
  await page.click('.cat-side [data-act=cat-morecol]'); await page.waitForTimeout(100);
  await page.click('.cat-side input[data-group=colors][data-v=mustard]'); await page.waitForTimeout(100);
  ok(!!(await page.$('.cat-empty')), 'mustard + L -> empty state');
  await page.click('.cat-actives [data-group=sizes][data-v=L]'); await page.waitForTimeout(100);
  c = await cards(page);
  ok(c.length === 1 && c[0] === 'striped-rib-polo', 'remove chip L -> mustard only striped rib');
  ok(await page.$eval('.cat-side input[data-group=colors][data-v=mustard]', e => e.checked), 'mustard checkbox stays checked');
  await page.click('.cat-side-hd [data-act=cat-clear]'); await page.waitForTimeout(100);
  ok((await cards(page)).length === 6, 'clear all -> 6');
  // fit slim
  await page.click('.cat-side input[data-group=fits][data-v="Slim fit"]'); await page.waitForTimeout(100);
  c = await cards(page); ok(c.length === 1 && c[0] === 'jersey-zip-polo', 'slim fit -> jersey zip');
  await page.click('.cat-side input[data-group=fits][data-v="Slim fit"]'); await page.waitForTimeout(100);
  // price over 1200 in polos -> none ; 800-1200 -> 6
  await page.click('.cat-side input[data-group=prices][data-v=m]'); await page.waitForTimeout(100);
  ok((await cards(page)).length === 6, 'price 800-1200 -> 6 polos');
  await page.click('.cat-side input[data-group=prices][data-v=m]'); await page.waitForTimeout(100);
  // sort
  await page.selectOption('#cat-sort-d', 'low'); await page.waitForTimeout(100);
  c = await cards(page); ok(c[0] === 'essential-pique-polo' && c[5] === 'long-sleeve-polo', 'sort low-high: ' + c.join(','));
  await page.selectOption('#cat-sort-d', 'top'); await page.waitForTimeout(100);
  c = await cards(page); ok(c[0] === 'textured-knit-polo', 'sort top rated first: ' + c[0]);
  // FAQ one-open
  await page.click('[data-act=cat-faq][data-i="1"]'); await page.waitForTimeout(100);
  ok((await page.$$('.cat-faq-a')).length === 1 && (await page.textContent('.cat-faq-a')).includes('Inside Dhaka'), 'FAQ 2 open alone, shows delivery rule');
  await page.click('[data-act=cat-faq][data-i="2"]'); await page.waitForTimeout(100);
  ok((await page.textContent('.cat-faq-a')).includes('72 hours'), 'FAQ 3 shows exchange rule');
  await page.click('[data-act=cat-seo]'); await page.waitForTimeout(100);
  ok(!(await page.$('.cat-seo-txt.clamp')), 'read more expands');

  // set price on 'new': combos+rules cover polos, tees, oxford, chino
  await page.goto(url + '#/c/new'); await page.waitForTimeout(150);
  const allNew = (await cards(page)).length;
  ok(allNew === 15, 'new: 15 products (no extras) got ' + allNew);
  await page.click('.cat-side [data-group=setOnly]'); await page.waitForTimeout(100);
  c = await cards(page);
  ok(c.length === 11 && c.indexOf('heavyweight-hoodie') < 0 && c.indexOf('oxford-cotton-shirt') >= 0, 'set price available -> ' + c.length);
  ok(!(await page.$('[data-testid=cat-set-banner]')), 'no banner on new');
  await page.screenshot({ path: out + '/t_desk_new_setonly.png' });

  // My size only (guest size saved)
  await page.evaluate(() => { ST.guestSize = { top: 'XXL', bottom: '36', heightIn: 70, weightKg: 90 }; saveState(); });
  await page.goto(url + '#/c/polos'); await page.waitForTimeout(150);
  ok(!!(await page.$('.cat-side [data-group=mine]')), 'My size toggle shown when size saved');
  ok((await cards(page)).length === 6, 'my size OFF by default');
  await page.click('.cat-side [data-group=mine]'); await page.waitForTimeout(100);
  c = await cards(page);
  ok(c.indexOf('jersey-zip-polo') < 0 && c.indexOf('essential-pique-polo') >= 0, 'my size XXL -> ' + c.join(','));
  await page.goto(url + '#/c/trousers'); await page.waitForTimeout(150);
  await page.click('.cat-side [data-group=mine]'); await page.waitForTimeout(100);
  c = await cards(page); ok(c.length === 2, 'trousers waist 36 -> ' + c.join(','));
  await page.evaluate(() => { ST.guestSize = null; saveState(); });

  // search
  await page.goto(url + '#/search?q=navy'); await page.waitForTimeout(150);
  ok((await page.$$('[data-testid=search-grid] .pcard')).length > 3, 'search navy finds by colour');
  await page.goto(url + '#/search?q=t-shirt'); await page.waitForTimeout(150);
  ok((await page.$$('[data-testid=search-grid] .pcard')).length === 3, 'search t-shirt -> 3');
  await page.goto(url + '#/search?q=zzz'); await page.waitForTimeout(150);
  ok(!!(await page.$('[data-testid=search-empty]')), 'search zzz empty state');
  await page.fill('#srch-q', 'hoodie'); await page.press('#srch-q', 'Enter'); await page.waitForTimeout(200);
  ok(page.url().includes('q=hoodie') && (await page.$$('[data-testid=search-grid] .pcard')).length === 1, 'search form submits');
  // home links
  await page.goto(url + '#/'); await page.waitForTimeout(150);
  ok((await page.$$('.hm-cat')).length === 6, 'home 6 category tiles');
  ok((await page.$$('.hm-set')).length === 4, 'home 3 combos + DIY card');
  ok(await page.getAttribute('[data-testid=home-finder]', 'href') === '#/p/essential-pique-polo?finder=1', 'finder link');
  await page.evaluate(() => { ST.festive = true; rerender(); });
  ok(!!(await page.$('.hm-festive')), 'festive card shown');
  await page.screenshot({ path: out + '/t_desk_home_festive.png' });
  await page.evaluate(() => { ST.festive = false; ST.lang = 'bn'; ST.theme = 'festive'; applyTheme(); rerender(); });
  await page.screenshot({ path: out + '/t_desk_home_bn_festive.png', fullPage: true });
  await page.evaluate(() => { ST.lang = 'en'; ST.theme = 'ivory'; applyTheme(); saveState(); go('#/c/polos'); });
  await page.waitForTimeout(150);
  await page.screenshot({ path: out + '/t_desk_polos_ivory.png' });
  await page.evaluate(() => { ST.theme = 'classic'; applyTheme(); saveState(); });
  await ctx.close();

  // ---------- phone ----------
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await ctx.newPage();
  page.on('pageerror', e => { fails++; console.log('PAGEERROR', e.message); });
  await page.goto(url + '#/c/polos'); await page.waitForTimeout(200);
  await page.evaluate(() => { ST.seenIntro = true; saveState(); });
  ok(!(await page.isVisible('.cat-side')), 'phone: sidebar hidden');
  await page.click('.cat-chiprow [data-group=setOnly]'); await page.waitForTimeout(100);
  ok(await page.$eval('.cat-chiprow [data-group=setOnly]', e => e.classList.contains('on')), 'phone chip toggles on');
  await page.click('.cat-chiprow [data-group=setOnly]'); await page.waitForTimeout(100);
  await page.click('[data-testid=cat-filter-btn]'); await page.waitForTimeout(150);
  ok(!!(await page.$('.modal')), 'filter modal opens');
  await page.click('.modal [data-group=sizes][data-v=L]'); await page.waitForTimeout(100);
  ok((await page.textContent('[data-testid=cat-show]')).includes('5'), 'modal show button updates: ' + await page.textContent('[data-testid=cat-show]'));
  await page.click('.modal input[data-group=colors][data-v=navy]'); await page.waitForTimeout(100);
  ok(await page.$eval('.modal input[data-group=colors][data-v=navy]', e => e.checked), 'modal checkbox checked after refresh');
  await page.screenshot({ path: out + '/t_phone_filter_modal.png' });
  await page.click('[data-testid=cat-show]'); await page.waitForTimeout(100);
  ok(!(await page.$('.modal')), 'modal closes');
  ok((await page.textContent('[data-testid=cat-filter-btn]')).includes('2'), 'filter button shows count 2');
  c = await cards(page); ok(c.length >= 1, 'phone results ' + c.join(','));
  await page.screenshot({ path: out + '/t_phone_polos_filtered.png' });
  await ctx.close();
  await browser.close();
  console.log(fails ? fails + ' FAIL(S)' : 'ALL PASS');
})();
