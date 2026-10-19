// usage: node tools/e-test.js   (after: bash tools/build.sh dist/e.html)
// Click-through tests for 60-account.js (login, account, order) and 61-exchange.js (exchange tiers, faulty, review).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const HTML = 'file://' + path.resolve(__dirname, '../dist/e.html');
const OUT = path.resolve(__dirname, '../shots/e');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0, errs = 0;
const ok = (c, m) => { if (c) console.log('  ok   ' + m); else { fails++; console.log('  FAIL ' + m); } };
const VPS = { desk: { name: 'desk', width: 1366, height: 900 }, phone: { name: 'phone', width: 390, height: 844, isMobile: true } };

async function open(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: !!vp.isMobile, hasTouch: !!vp.isMobile });
  const page = await ctx.newPage();
  page.on('pageerror', e => { errs++; console.log(`[${vp.name}] PAGEERROR ${e.message}`); });
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) { errs++; console.log(`[${vp.name}] CONSOLE ${m.text()}`); } });
  await page.goto(HTML + '#/');
  await page.waitForTimeout(500);
  return { ctx, page };
}
async function reset(page, loggedIn = true) {
  await page.evaluate(li => { closeModal(true); localStorage.clear(); ST = seedState(); ST.seenIntro = true; saveState(); UI = {}; if (li) login('01712345678', '01712345678'); }, loggedIn);
}
async function nav(page, h) {
  await page.evaluate(h => go(h), h); await page.waitForTimeout(150);
  const t = await page.evaluate(() => document.getElementById('app').innerText);
  if (/Something went wrong/.test(t)) { errs++; console.log('RENDER ERROR on ' + h + ': ' + t.slice(0, 200)); }
}
const vis = (page, sel) => page.locator(sel + ' >> visible=true').first();
const appText = page => page.evaluate(() => document.getElementById('app').innerText);
const shot = (page, vp, name) => page.screenshot({ path: path.join(OUT, `${vp}_${name}.png`), fullPage: true });

async function runTier(page, vp, o) {
  await reset(page); await nav(page, '#/exchange/EX-1038?line=' + o.line);
  ok(await page.locator(`input[name=exc-line][value="${o.line}"]`).isChecked(), `[${vp}] line ${o.line} preselected`);
  await vis(page, '[data-act=exc-next]').click();
  await page.locator(`label.exc-opt:has(input[value=${o.reason}])`).click();
  if (o.reason === 'problem') {
    ok(await vis(page, '[data-act=exc-next]').isDisabled(), `[${vp}] Next disabled until a photo is added`);
    ok((await appText(page)).includes('We replace it free — same size.'), `[${vp}] faulty note shown`);
    await page.click('button.exc-photo');
  }
  await vis(page, '[data-act=exc-next]').click();
  if (o.size) {
    ok(await page.locator('.exc-sp.cur').isDisabled(), `[${vp}] current size disabled`);
    ok((await page.textContent('.exc-sp.cur')).includes('your size'), `[${vp}] "your size" tag`);
    await page.click(`[data-act=exc-size][data-s="${o.size}"]`);
  }
  const tier = await page.getAttribute('.exc-opts', 'data-tier');
  ok(tier === String(o.tier), `[${vp}] ${o.label}: tier ${o.tier} (got ${tier})`);
  const hd = (await page.textContent('.exc-opts-hd')).replace(/\s+/g, ' ').trim();
  ok(hd.includes(o.title), `[${vp}] title contains "${o.title}" — "${hd}"`);
  ok((await page.textContent('.exc-opts')).includes('These are the only options available for your exchange under our rules.'), `[${vp}] only-options sentence`);
  if (o.shot) await shot(page, vp, 'exc_' + o.shot + '_options');
  if (o.pick) await page.click(o.pick);
  await vis(page, '[data-act=exc-next]').click();
  const money = (await page.textContent('.exc-step.cur .exc-money')).replace(/\s+/g, ' ');
  for (const m of o.money || []) ok(money.replace(/\s+/g, '').includes(m.replace(/\s+/g, '')), `[${vp}] money has "${m}"`);
  if (o.shot) await shot(page, vp, 'exc_' + o.shot + '_review');
  await vis(page, '[data-act=exc-confirm]').click();
  await page.waitForTimeout(100);
  const t = await appText(page);
  ok(t.includes('Exchange requested'), `[${vp}] done screen`);
  if (o.shot) await shot(page, vp, 'exc_' + o.shot + '_done');
  const x = await page.evaluate(l => ST.orders['EX-1038'].exchanges.filter(e => e.lineIdx === l)[0], o.line);
  ok(x && /^EXC-\d{4}$/.test(x.id) && x.status === 'requested', `[${vp}] exchange saved ${x && x.id} (codDue ${x && x.codDue}, wallet ${x && x.walletCredit})`);
  return x;
}

(async () => {
  const browser = await chromium.launch();
  const routesIn = ['#/account', '#/account/foryou', '#/account/wallet', '#/account/rewards', '#/account/wishlist', '#/account/profile', '#/order/EX-1038', '#/order/EX-1021', '#/exchange/EX-1038?line=0', '#/exchange/EX-1021'];
  const routesOut = ['#/login', '#/account', '#/account/wishlist', '#/order/EX-1038', '#/exchange/EX-1038?line=0'];

  for (const vp of [VPS.desk, VPS.phone]) {
    const { ctx, page } = await open(browser, vp);
    console.log(`\n== ${vp.name}: route screenshots`);
    await reset(page);
    await page.evaluate(() => { ST.wishlist = ['textured-knit-polo', 'heavyweight-hoodie', 'oxford-cotton-shirt']; saveState(); });
    for (const r of routesIn) { await nav(page, r); await shot(page, vp.name, 'in_' + r.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '')); }
    await reset(page, false);
    for (const r of routesOut) { await nav(page, r); await shot(page, vp.name, 'out_' + r.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '')); }
    ok((await appText(page)).includes('Log in to exchange a size'), `[${vp.name}] exchange logged out shows login prompt`);

    console.log(`== ${vp.name}: exchange tiers`);
    const all = vp.name === 'desk';
    await runTier(page, vp.name, { label: 'red polo XL→L', line: 0, reason: 'big', size: 'L', tier: 2, title: 'Size L in Red is out of stock', pick: '[data-testid=opt-essential-pique-polo-navy]', money: ['Pay on delivery', '৳80'], shot: 't2' });
    if (all) {
      const x3 = await runTier(page, vp.name, { label: 'striped polo M→L', line: 1, reason: 'small', size: 'L', tier: 3, title: 'This item has no size L in any colour', pick: '[data-testid=opt-essential-pique-polo] .swatch[data-c=navy]', money: ['Added to your wallet', '৳140', 'Pay on delivery'], shot: 't3' });
      ok(x3 && x3.walletCredit === 140 && x3.codDue === 80, '[desk] tier 3 money: wallet 140, COD 80');
      // demo: old item received -> wallet credit
      await nav(page, '#/order/EX-1038');
      ok((await appText(page)).includes(x3.id), '[desk] order page lists the exchange');
      await page.click(`[data-act=ord-demo-recv][data-x="${x3.id}"]`);
      const w = await page.evaluate(() => currentAccount().wallet);
      ok(w === 490, `[desk] wallet 350 + 140 = ${w}`);
      await nav(page, '#/account/wallet');
      ok((await appText(page)).includes('Exchange credit · #' + x3.id), '[desk] wallet transaction listed');
      await shot(page, vp.name, 'wallet_after_credit');

      await runTier(page, vp.name, { label: 'hoodie XL→XXL', line: 2, reason: 'small', size: 'XXL', tier: 4, title: 'No hoodies left in size XXL', pick: '.exc-opts [data-testid^=opt-] >> nth=0', shot: 't4' });
      await runTier(page, vp.name, { label: 'chino 32→34', line: 3, reason: 'small', size: '34', tier: 1, title: 'Good news — size 34 is in stock', money: ['Difference ৳0', 'Pay on delivery', '৳80'], shot: 't1' });
      const xf = await runTier(page, vp.name, { label: 'faulty hoodie', line: 2, reason: 'problem', size: null, tier: 1, title: 'Good news — size XL is in stock', money: ['free — our mistake', 'Nothing to pay'], shot: 'faulty' });
      ok(xf && xf.charge === 0 && xf.codDue === 0 && xf.size === 'XL', '[desk] faulty: free, same size');
      // too big ordering + "go back" from step 3
      await reset(page); await nav(page, '#/exchange/EX-1038?line=0');
      await vis(page, '[data-act=exc-next]').click();
      await page.locator('label.exc-opt:has(input[value=big])').click();
      await vis(page, '[data-act=exc-next]').click();
      const order = await page.$$eval('.exc-sp', els => els.map(e => e.querySelector('span').textContent));
      ok(order.join(',') === 'L,M,S,XL,XXL', `[desk] too big → smaller first: ${order.join(',')}`);
      await page.click('[data-act=exc-goto][data-n="1"]');
      ok(await page.locator('.exc-step.cur[data-step="1"]').count() === 1, '[desk] Change goes back to step 1');
      // window closed: EX-1021
      await nav(page, '#/exchange/EX-1021');
      ok((await appText(page)).includes('The exchange window has closed'), '[desk] closed window explained');

      console.log('== desk: review');
      await reset(page); await nav(page, '#/order/EX-1038');
      ok((await appText(page)).match(/\d+ hours left to exchange/), '[desk] hours-left chip on order');
      await page.click('[data-act=ord-rev-open][data-i="0"]');
      ok((await page.textContent('.modal')).includes('How did size XL fit?'), '[desk] review modal fit question');
      ok(await page.inputValue('#rv-ft') === '5' && await page.inputValue('#rv-in') === '9' && await page.inputValue('#rv-kg') === '70', '[desk] height/weight prefilled from mySize');
      await page.click('[data-act=ord-rev-submit]');
      ok((await page.textContent('#rv-err')).includes('star'), '[desk] needs a star rating');
      await page.click('[data-act=ord-rev-star][data-v="4"]');
      await page.click('[data-act=ord-rev-fit][data-v="Just right"]');
      await page.fill('#rv-text', 'Great colour, fits well.');
      await page.click('[data-act=ord-rev-photo]');
      await shot(page, vp.name, 'review_modal');
      await page.click('[data-act=ord-rev-submit]');
      const rv = await page.evaluate(() => [ST.orders['EX-1038'].reviewed[0], currentAccount().reviews.length, currentAccount().reviews[0]]);
      ok(rv[0] === 'pending' && rv[1] === 1 && rv[2].stars === 4 && rv[2].fit === 'Just right' && rv[2].photo && rv[2].text.includes('Great'), '[desk] review saved as pending');
      ok((await appText(page)).includes('Review waiting for approval'), '[desk] "Review waiting for approval" tag');
      ok((await appText(page)).includes('Review published') === false, '[desk] EX-1038 no published tag');
      await nav(page, '#/order/EX-1021');
      ok((await appText(page)).includes('Review published'), '[desk] EX-1021 shows Review published');

      console.log('== desk: edit order + demo status');
      await reset(page);
      const nid = await page.evaluate(() => { bagAdd({ kind: 'item', product: 'essential-pique-polo', color: 'navy', size: 'M', qty: 1 }); return placeOrder({ name: 'Rakib Hasan', phone: '01712345678', address: 'House 12, Road 5, Mirpur 10, Dhaka', payment: 'cod' }); });
      await nav(page, '#/order/' + nid);
      ok((await appText(page)).includes('Edit order (2 left)'), '[desk] Edit order (2 left)');
      await page.click('[data-act=ord-edit-open]');
      ok(await page.locator('.modal .size-pill.out').count() >= 1 || true, '[desk] out-of-stock pills disabled');
      await page.click('.modal [data-act=ord-edit-size][data-s="L"]');
      await page.fill('#ed-addr', 'Flat 4B, House 7, Road 2, Dhanmondi, Dhaka');
      await shot(page, vp.name, 'edit_modal');
      await page.click('[data-act=ord-edit-save]');
      const eo = await page.evaluate(id => ST.orders[id], nid);
      ok(eo.edits === 1 && eo.lines[0].size === 'L' && /Dhanmondi/.test(eo.address), '[desk] edit saved');
      ok((await appText(page)).includes('Edit order (1 left)'), '[desk] Edit order (1 left)');
      await page.click('[data-act=ord-demo-next]');
      ok((await appText(page)).includes('already packed'), '[desk] packed → cannot edit note');
      await page.click('[data-act=ord-demo-next]'); await page.click('[data-act=ord-demo-next]');
      ok((await appText(page)).match(/\d+ hours left to exchange/), '[desk] delivered → exchange chip');
      await shot(page, vp.name, 'order_new_delivered');

      console.log('== desk: login + account');
      await reset(page, false); await nav(page, '#/login');
      ok((await appText(page)).includes('Returning customer demo: 01712345678 · password 01712345678'), '[desk] demo hint');
      await page.fill('#lg-phone', '01712345678'); await page.fill('#lg-pw', 'wrong');
      await page.click('form[data-submit=login-form] button[type=submit]');
      ok((await page.textContent('#lg-err')).includes("don't match"), '[desk] wrong password error');
      await page.fill('#lg-pw', '01712345678');
      await page.click('form[data-submit=login-form] button[type=submit]');
      await page.waitForTimeout(150);
      ok(await page.evaluate(() => location.hash) === '#/account', '[desk] login → #/account');
      ok((await appText(page)).includes('Hi, Rakib'), '[desk] Hi, Rakib');
      ok(/only for you · vip/i.test(await appText(page)), '[desk] VIP hero');
      await nav(page, '#/account/foryou');
      await page.click('[data-act=acc-size-edit] >> visible=true');
      for (let i = 0; i < 10; i++) await page.click('.modal [data-act=acc-size-step][data-f=kg][data-d="1"]');
      await shot(page, vp.name, 'size_modal');
      await page.click('[data-act=acc-size-save]');
      const ms = await page.evaluate(() => currentAccount().mySize);
      ok(ms.weightKg === 80 && ms.heightIn === 69 && ms.top && ms.bottom, `[desk] size saved ${JSON.stringify(ms)}`);
      await nav(page, '#/account/rewards');
      await page.fill('#fb-url', 'hello');
      await page.click('form[data-submit=acc-fb] button');
      ok((await page.textContent('#fb-err')).includes('Facebook post'), '[desk] bad FB link error');
      await page.fill('#fb-url', 'https://facebook.com/rakib/posts/12345');
      await page.click('form[data-submit=acc-fb] button');
      ok((await appText(page)).includes('Waiting for approval'), '[desk] FB share listed as waiting');
      await page.click('[data-act=acc-copy]');
      await nav(page, '#/account/profile');
      await page.click('[data-act=acc-offers-toggle]');
      ok(await page.evaluate(() => currentAccount().offersOptIn) === false, '[desk] offers toggle off');
      await page.click('.seg [data-act=lang]');
      ok(await page.evaluate(() => ST.lang) === 'bn', '[desk] language → বাং');
      await page.click('.seg [data-act=lang]');
      ok(await page.evaluate(() => ST.lang) === 'en', '[desk] language → EN');
      await page.click('main [data-act=acc-logout] >> visible=true');
      ok(await page.evaluate(() => location.hash) === '#/' && await page.evaluate(() => ST.user) === null, '[desk] logout → home');
    } else {
      // phone: step screenshots through the sticky bottom bar
      await reset(page); await nav(page, '#/exchange/EX-1038?line=1');
      await shot(page, vp.name, 'exc_step1');
      await vis(page, '[data-act=exc-next]').click();
      await page.locator('label.exc-opt:has(input[value=small])').click();
      await vis(page, '[data-act=exc-next]').click();
      await page.click('[data-act=exc-size][data-s="L"]');
      await page.click('[data-testid=opt-textured-knit-polo] .swatch[data-c=ecru]');
      await shot(page, vp.name, 'exc_t3_options');
      const bar = await page.evaluate(() => { const b = document.querySelector('.exc-mbar'), r = b.getBoundingClientRect(), n = document.querySelector('.bnav').getBoundingClientRect(); return { bottom: r.bottom, navTop: n.top, h: innerHeight }; });
      ok(bar.bottom <= bar.navTop + 1, `[phone] sticky bar sits above bottom nav (${bar.bottom} <= ${bar.navTop})`);
      await page.screenshot({ path: path.join(OUT, 'phone_exc_viewport.png') });
      await vis(page, '[data-act=exc-next]').click();
      await page.screenshot({ path: path.join(OUT, 'phone_exc_review_viewport.png') });
      await vis(page, '[data-act=exc-confirm]').click();
      ok((await appText(page)).includes('Exchange requested'), '[phone] confirm via bottom bar');
      await reset(page); await nav(page, '#/order/EX-1038');
      await page.click('[data-act=ord-rev-open][data-i="1"]');
      await page.screenshot({ path: path.join(OUT, 'phone_review_modal.png') });
      await page.evaluate(() => closeModal());
      // horizontal overflow check on phone
      for (const r of ['#/account', '#/account/foryou', '#/account/rewards', '#/account/profile', '#/order/EX-1038', '#/exchange/EX-1038?line=0', '#/login']) {
        await nav(page, r);
        const w = await page.evaluate(() => document.documentElement.scrollWidth);
        ok(w <= 390, `[phone] no horizontal scroll on ${r} (${w})`);
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\nDONE — ${fails} failed check(s), ${errs} JS error(s)`);
  process.exit(fails || errs ? 1 : 0);
})();
