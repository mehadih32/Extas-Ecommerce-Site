// usage: node tools/d-test.js   (bag / checkout / thanks click-through)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'); const fs = require('fs');
const HTML = 'file://' + path.resolve(__dirname, '../dist/d.html');
const OUT = path.resolve(__dirname, '../shots/d'); fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok   ' + m); else { fails++; console.log('  FAIL ' + m); } };
const wait = (p, ms) => p.waitForTimeout(ms || 200);

async function fresh(page, items) {
  await page.goto(HTML + '#/'); await wait(page, 300);
  await page.evaluate(() => { localStorage.clear(); ST = seedState(); saveState(); UI = {}; });
  if (items) await page.evaluate(() => {
    bagAdd({kind:'item',product:'essential-pique-polo',color:'navy',size:'L',qty:1});
    bagAdd({kind:'item',product:'oxford-cotton-shirt',color:'sky',size:'L',qty:1});
    bagAdd({kind:'item',product:'oxford-cotton-shirt',color:'sky',size:'XL',qty:1});
    rerender();
  });
  await page.evaluate(() => { location.hash = '#/bag'; }); await wait(page, 300);
}
const txt = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel);

async function run(browser, vp) {
  console.log(`\n=== ${vp.name} ===`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: !!vp.isMobile, hasTouch: !!vp.isMobile });
  const page = await ctx.newPage();
  page.on('pageerror', e => { fails++; console.log(`  PAGEERROR ${e.message}`); });
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) { fails++; console.log(`  CONSOLE ${m.text()}`); } });
  const shot = async (n, full = true) => page.screenshot({ path: path.join(OUT, `${vp.name}_${n}.png`), fullPage: full });

  // empty bag + empty checkout
  await fresh(page, false);
  ok(await page.$('[data-testid=bag-empty]'), 'empty bag state');
  await shot('bag_empty');
  await page.evaluate(() => { location.hash = '#/checkout'; }); await wait(page);
  ok(await page.$('[data-testid=co-empty]'), 'empty checkout state');

  // bag with items
  await fresh(page, true);
  await shot('bag_1');
  ok((await txt(page, '[data-testid=bag-free]')).includes('You get free delivery'), 'free delivery reached');
  ok(await page.$('[data-testid=duo-offer]'), 'polo duo offer shown');
  ok(await page.$('[data-testid=brk-card]'), 'bracket card shown');
  ok((await txt(page, '[data-testid=brk-card]')).includes('Same Oxford Cotton Shirt in L and XL'), 'bracket title');
  // one is for someone else → undo
  await page.click('[data-testid=brk-card] >> text=One is for someone else'); await wait(page);
  ok((await txt(page, '[data-testid=brk-done]')).includes('Got it — both sizes stay'), 'ack other');
  await page.click('[data-testid=brk-done] >> text=Change'); await wait(page);
  // help me pick
  await page.click('text=Help me pick my size'); await wait(page);
  const brk = await txt(page, '[data-testid=brk-card]');
  ok(brk.includes('Find my size') && brk.includes('Keep L, remove XL') && brk.includes('Keep XL, remove L'), 'help (guest) shows finder link + keep buttons');
  ok(await page.$('a[href="#/p/oxford-cotton-shirt?finder=1"]'), 'finder link');
  await shot('bag_help');
  await page.click('[data-testid=brk-card] >> text=Keep both'); await wait(page);
  ok((await txt(page, '[data-testid=brk-done]')).includes('Keeping both'), 'keep both');
  // add 2nd polo via offer
  await page.click('[data-testid=duo-offer] button[data-color=black]'); await wait(page);
  ok(await page.$('[data-testid=combo-tag]'), 'combo tag shown');
  ok((await txt(page, '[data-testid=bag-summary]')).includes('Polo Duo set price'), 'polo duo discount in summary');
  ok(!(await page.$('[data-testid=duo-offer]')), 'offer card gone after adding');
  ok((await txt(page, '[data-testid=bag-total]')) === '৳4,000', 'bag total 4,000: ' + (await txt(page, '[data-testid=bag-total]')));
  // qty & save for later on a temp item
  await page.evaluate(() => { bagAdd({kind:'item',product:'pocket-tee',color:'sky',size:'M',qty:1}); rerender(); });
  await page.click('[data-line] button[aria-label="One more"] >> nth=-1'); await wait(page);
  ok(await page.evaluate(() => ST.bag.filter(l => l.product==='pocket-tee')[0].qty === 2), 'qty +1');
  await page.click('[data-line]:last-of-type >> text=Save for later'); await wait(page);
  ok(await page.evaluate(() => ST.wishlist.indexOf('pocket-tee')>=0 && !ST.bag.some(l => l.product==='pocket-tee')), 'save for later → wishlist');
  // code (guest)
  await page.click('text=Have a code?'); await wait(page);
  await page.fill('#bag-code', 'VIP15'); await page.click('form[data-submit=bag-code] button'); await wait(page);
  ok((await txt(page, '[data-testid=bag-summary]')).includes('Member codes work after you log in'), 'guest code message');
  // whatsapp modal
  await page.click('text=Send my bag on WhatsApp'); await wait(page);
  const wa = await txt(page, '[data-testid=wa-preview]');
  ok(wa && wa.includes('Please place this order for me') && wa.includes('Oxford Cotton Shirt — Sky Blue, XL') && wa.includes('Total: ৳4,000'), 'whatsapp preview');
  await shot('bag_wa_modal', false);
  await page.click('.modal [data-act=close-modal] >> nth=0'); await wait(page);
  await shot('bag_2');
  if (vp.isMobile) { await shot('bag_viewport', false); }

  // checkout
  await page.evaluate(() => { location.hash = '#/checkout'; }); await wait(page, 300);
  await shot('co_1');
  const btnTxt = () => page.evaluate(() => [...document.querySelectorAll('.co-confirm')].filter(b => b.offsetParent).map(b => b.innerText + (b.disabled ? ' [disabled]' : '')).join(' | '));
  ok((await btnTxt()).includes('Add your name to continue'), 'confirm disabled (name): ' + await btnTxt());
  await page.fill('#co-name', 'Rakib Hasan');
  await page.click('#co-phone'); await page.keyboard.type('+880 1712-34567');
  ok((await txt(page, '#co-phone-hint')).includes('missing'), 'phone warn hint: ' + await txt(page, '#co-phone-hint'));
  ok(await page.evaluate(() => document.activeElement.id === 'co-phone'), 'phone keeps focus');
  ok((await btnTxt()).includes('Add your address to continue'), 'confirm disabled (address) — warn phone does not block');
  await page.keyboard.type('8');
  ok((await txt(page, '#co-phone-hint')).includes('01712-345678 looks right'), 'phone ok hint');
  ok(!(await page.$('[data-testid=co-delivery]')), 'no delivery section before address');
  await page.click('#co-address'); await page.keyboard.type('Agrabad, Chattogram');
  ok(await page.evaluate(() => document.activeElement.id === 'co-address'), 'address keeps focus');
  ok((await txt(page, '[data-testid=co-zone]')) === 'Outside Dhaka', 'outside dhaka');
  await shot('co_outside');
  await page.fill('#co-address', 'House 12, Road 5, Mirpur 10, Dhaka');
  ok((await txt(page, '[data-testid=co-zone]')) === 'Inside Dhaka', 'inside dhaka');
  ok((await txt(page, '[data-testid=co-delivery]')).includes('Free'), 'free delivery shown');
  ok((await txt(page, '[data-testid=co-cod-note]')).includes('Total due ৳4,000'), 'cod note');
  ok((await btnTxt()).includes('Confirm Order · ৳4,000'), 'confirm enabled: ' + await btnTxt());
  // upsell, note, optin, payment
  await page.click('[data-act=co-ups]'); await wait(page);
  ok((await btnTxt()).includes('৳4,350'), 'socks added to total');
  await page.click('text=+ Add a delivery note (optional)'); await wait(page);
  await page.fill('#co-note', 'Leave with guard');
  await page.check('input[data-change=co-optin]');
  if (vp.isMobile) {
    await page.click('[data-act=co-sum]'); await wait(page);
    ok(await page.$('#co-sum-m'), 'mobile summary opens');
    await shot('co_2');
    await shot('co_viewport', false);
  } else {
    await page.click('[data-act=co-pay][data-v=mb]'); await wait(page);
    await page.click('[data-act=co-mb][data-v=bkash]'); await wait(page);
    await shot('co_2');
  }
  ok(await page.evaluate(() => document.getElementById('co-name').value === 'Rakib Hasan' && document.getElementById('co-note').value === 'Leave with guard'), 'values survive rerender');
  await page.locator('.co-confirm:visible').first().click(); await wait(page, 400);
  const hash = await page.evaluate(() => location.hash);
  ok(/#\/thanks\/EX-\d+/.test(hash), 'went to thanks ' + hash);
  await shot('ty_1');
  const oid = hash.split('/').pop();
  const ord = await page.evaluate(id => ST.orders[id], oid);
  ok(ord.flags.includes('2 sizes — check'), 'order flagged 2 sizes — check');
  ok(ord.note === 'Leave with guard' && ord.offersOptIn === true, 'note + optin saved');
  ok((await txt(page, '[data-testid=ty-pay]')).includes(vp.isMobile ? 'Cash on Delivery · Total due ৳4,350' : 'Paid ৳4,350 by bKash'), 'pay box: ' + await txt(page, '[data-testid=ty-pay]'));
  ok(await page.$('[data-testid=ty-question]'), 'whatsapp quick question');
  ok(await page.$('[data-testid=ty-account]'), 'account card');
  await page.click('[data-act=ty-pw]'); await wait(page);
  ok((await txt(page, '[data-testid=ty-pw]')) === '01712345678', 'show password');
  await page.click('[data-act=ty-brk][data-v=L]'); await wait(page);
  const ord2 = await page.evaluate(id => ST.orders[id], oid);
  ok(!ord2.flags.includes('2 sizes — check') && !ord2.lines.some(l => l.product==='oxford-cotton-shirt' && l.size==='XL') && ord2.total === 3100, 'only L → XL removed, total ' + ord2.total);
  await page.click('[data-act=ty-add][data-p=leather-look-belt]'); await wait(page);
  ok((await txt(page, '[data-testid=ty-newtot]')).includes('৳3,750'), 'new total due: ' + await txt(page, '[data-testid=ty-newtot]'));
  await shot('ty_2');
  await page.click('[data-act=ty-copy]'); await wait(page, 100);

  // logged-in returning customer: VIP + wallet + evidence
  await fresh(page, false);
  await page.evaluate(() => { login('01712345678','01712345678'); bagAdd({kind:'item',product:'essential-pique-polo',color:'navy',size:'L',qty:1}); bagAdd({kind:'item',product:'essential-pique-polo',color:'navy',size:'XL',qty:1}); rerender(); });
  await page.click('text=Help me pick my size'); await wait(page);
  const ev = await txt(page, '[data-testid=brk-card]');
  ok(ev.includes('Find my size says L (5\'9", 70 kg)') && ev.includes('You kept XL in your last order') && ev.includes('Keep L, remove XL'), 'evidence for logged-in');
  ok((await txt(page, '[data-testid=bag-summary]')).includes('VIP · 15% off'), 'VIP shown in bag');
  await page.click('text=Have a code?'); await wait(page);
  await page.fill('#bag-code', 'bday200'); await page.click('form[data-submit=bag-code] button'); await wait(page);
  ok((await txt(page, '[data-testid=bag-summary]')).includes('saves you more'), 'BDAY200 vs VIP note');
  await shot('bag_vip');
  await page.click('text=Keep L, remove XL'); await wait(page);
  ok(await page.evaluate(() => ST.bag.length === 1 && ST.bag[0].size === 'L'), 'keep L removes XL');
  await page.evaluate(() => { location.hash = '#/checkout'; }); await wait(page, 300);
  ok(await page.evaluate(() => document.getElementById('co-address').value.includes('Mirpur')), 'prefilled address');
  ok((await txt(page, '[data-testid=co-offer]')).includes('VIP'), 'VIP auto-applied at checkout');
  await page.check('input[data-change=co-wallet]'); await wait(page);
  // 850 → BDAY200 needs 1,500 → VIP 15% = 128; delivery inside 80; wallet 350 → 850-128+80-350 = 452
  ok((await btnTxt()).includes('৳452'), 'wallet + VIP total: ' + await btnTxt());
  await shot('co_vip');
  await page.locator('.co-confirm:visible').first().click(); await wait(page, 400);
  const o3 = await page.evaluate(() => ST.orders[location.hash.split('/').pop()]);
  ok(o3 && o3.total === 452 && o3.walletUsed === 350 && o3.delivery === 80, 'vip order saved total ' + (o3 && o3.total));
  ok(await page.evaluate(() => ST.accounts['01712345678'].wallet === 0), 'wallet debited');
  await shot('ty_vip');
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await run(browser, { name: 'desk', width: 1366, height: 900 });
  await run(browser, { name: 'phone', width: 390, height: 844, isMobile: true });
  await browser.close();
  console.log(fails ? `\nDONE with ${fails} failure(s)` : '\nDONE, all passed');
})();
