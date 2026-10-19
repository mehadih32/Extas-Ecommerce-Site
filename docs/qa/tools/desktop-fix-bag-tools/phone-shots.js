// Phone baseline / after shots for the Batch B desktop fix.
// usage: node phone-shots.js <html> <outdir> [widths=360x800,393x852,430x932] [filter-regex]
// Full-page shots of the audit's 47 routes + a few Batch B interaction states (viewport shots),
// mobile context, reducedMotion reduce, fixed clock, seeded Math.random -> deterministic.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const FILE = 'file://' + path.resolve(process.argv[2]);
const OUT = process.argv[3]; fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = (process.argv[4] || '360x800,393x852,430x932').split(',').map(s => s.split('x').map(Number));
const FILTER = process.argv[5] ? new RegExp(process.argv[5]) : null;
const ROUTES = [
  ['home', '#/'],
  ['cat-polos', '#/c/polos'], ['cat-new', '#/c/new'], ['cat-hoodies', '#/c/hoodies'], ['cat-jackets', '#/c/jackets'], ['cat-panjabi', '#/c/panjabi'],
  ['search-polo', '#/search?q=polo'], ['search-typo', '#/search?q=pollo%20shrt'], ['search-help', '#/search?q=delivery'], ['search-none', '#/search?q=xyzzq'], ['search-empty', '#/search'],
  ['pdp-polo', '#/p/essential-pique-polo'], ['pdp-panjabi', '#/p/classic-cotton-panjabi'], ['pdp-hoodie-sale', '#/p/heavyweight-hoodie'], ['pdp-shirt', '#/p/oxford-cotton-shirt'],
  ['combos-hub', '#/combos'], ['combos-list', '#/combos/solid-polo-2'], ['combos-list3', '#/combos/solid-polo-3'],
  ['pair-P1', '#/combo-pair/solid-polo-2~black-navy?tpl=P1'], ['pair-P2', '#/combo-pair/solid-polo-2~black-navy?tpl=P2'], ['pair-P3', '#/combo-pair/hoodie-jogger~X?tpl=P3'],
  ['pair-P4', '#/combo-pair/solid-polo-2~black-navy?tpl=P4'], ['pair-P5', '#/combo-pair/solid-polo-2~black-navy?tpl=P5'],
  ['combo-duo', '#/combo/polo-duo'], ['combo-trio', '#/combo/office-trio'], ['set', '#/set'], ['set-polos', '#/set/any-polos'],
  ['bag-empty', '#/bag', 'empty'], ['bag-3', '#/bag', 'items'], ['bag-B5', '#/bag', 'sets'], ['bag-current', '#/bag?btpl=current', 'sets'],
  ['checkout', '#/checkout', 'items'], ['thanks', '#/thanks/ORDER', 'order'], ['order', '#/order/ORDER', 'order'],
  ['account', '#/account', 'login'], ['acc-orders', '#/account/orders', 'login'], ['acc-wish', '#/account/wishlist', 'login'], ['acc-foryou', '#/account/foryou', 'login'], ['exchange', '#/exchange/DELIV', 'login'],
  ['login', '#/login', 'logout'], ['page-faq', '#/page/faq'], ['page-delivery', '#/page/delivery'], ['page-contact', '#/page/contact'], ['size-guide', '#/size-guide'],
  ['journal', '#/journal'], ['notfound', '#/no-such-page'],
  // extra Batch B states
  ['bag-1', '#/bag', 'one'], ['checkout-5', '#/checkout', 'five'], ['checkout-1', '#/checkout', 'one'], ['pdp-t3', '#/p/essential-pique-polo?tpl=T3'],
  ['bag-dup', '#/bag', 'dup'], ['bag-B1', '#/bag?btpl=B1', 'sets'], ['bag-B2', '#/bag?btpl=B2', 'sets'], ['bag-B3', '#/bag?btpl=B3', 'sets'], ['bag-B4', '#/bag?btpl=B4', 'sets'],
  ['bag-free1', '#/bag', 'cheap'], ['checkout-dup', '#/checkout', 'dup'],
  ['landing-duo', '#/l/polo-duo'], ['landing-hoodie', '#/l/winter-hoodie'], ['pdp-pocket', '#/p/pocket-tee'],
  ['pdp-polo-noreal', '#/p/essential-pique-polo', 'noreal'], ['pdp-t3p-noreal', '#/p/contrast-collar-polo', 'noreal'],
];
const SEED = () => { let s = 12345; Math.random = function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [w, h] of WIDTHS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await ctx.addInitScript(SEED);
    const pg = await ctx.newPage();
    await pg.clock.setFixedTime(new Date('2026-10-19T11:00:00+06:00'));
    pg.on('pageerror', e => errs.push(w + ' ' + String(e.message).slice(0, 200)));
    await pg.goto(FILE + '#/'); await pg.waitForTimeout(900);
    const ids = await pg.evaluate(() => {
      ST.seenIntro = true; saveState(); try { closeModal(); } catch (e) { }
      let deliv = null; for (const k in ST.orders) { if (/deliver/i.test(ST.orders[k].status)) deliv = k; }
      let pair = null; try { const r = (DB.comboRules || []).find(x => x.id === 'hoodie-jogger'); if (r) { pair = ca_generate(r).visible[0].id; } } catch (e) { }
      return { deliv, pair };
    });
    const setState = (kind) => pg.evaluate((kind) => {
      try { closeModal(); } catch (e) { }
      const add = (id, ci, si) => { const p = P(id); bagAdd({ kind: 'item', product: id, color: typeof ci === 'string' ? ci : p.colors[ci || 0], size: typeof si === 'string' ? si : p.sizes[si || 2], qty: 1 }); };
      if (kind === 'empty') ST.bag = [];
      if (kind === 'dup') { ST.bag = []; add('essential-pique-polo', 'navy', 'M'); add('essential-pique-polo', 'navy', 'L'); add('slim-chino-trousers', 0, 2); }
      if (kind === 'cheap') { ST.bag = []; add('cotton-socks-3', 0, 0); }
      if (kind === 'noreal') { ST.bag = []; (DB.reviews || []).forEach(r => { r.hidden = true; }); }
      if (kind === 'one') { ST.bag = []; add('essential-pique-polo', 'navy', 'L'); }
      if (kind === 'items' || kind === 'order') { ST.bag = []; add('essential-pique-polo', 'navy', 'L'); add('oxford-cotton-shirt', 0, 'L'); add('slim-chino-trousers', 0, 2); }
      if (kind === 'five') { ST.bag = []; add('essential-pique-polo', 'navy', 'L'); add('oxford-cotton-shirt', 0, 'L'); add('slim-chino-trousers', 0, 2); add('heavyweight-hoodie', 0, 2); add('classic-cotton-panjabi', 0, 2); }
      if (kind === 'sets') { ST.bag = []; try { const L = ca_generate((DB.comboRules || []).find(x => x.id === 'solid-polo-2')).visible; for (let i = 0; i < 3; i++) { const l = L[i]; ca_bagAdd(l, l.pieces.map(() => 'L'), { force: true }); } } catch (e) { } add('essential-pique-polo', 'navy', 'L'); }
      if (kind === 'login') { if (!currentAccount()) login('01712345678', '01712345678'); }
      if (kind === 'logout') { try { logout(); } catch (e) { ST.user = null; } }
      saveState();
    }, kind);
    let orderId = null;
    const go = async (hash) => {
      await pg.evaluate(() => { try { closeModal(); } catch (e) { } location.hash = '#/__blank'; });
      await pg.waitForTimeout(40);
      await pg.evaluate(hh => { let s = 777; Math.random = function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; location.hash = hh; }, hash);
      await pg.waitForTimeout(800);
      await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(250);
    };
    for (let [name, hash, st] of ROUTES) {
      if (FILTER && !FILTER.test(name)) continue;
      if (st) await setState(st);
      if (st === 'order') orderId = await pg.evaluate(() => placeOrder({ name: 'Rafiq Ahmed', phone: '01811223344', address: 'House 12, Road 5, Dhanmondi, Dhaka', payment: 'cod', offers: true, note: '', source: 'web' }));
      hash = hash.replace('ORDER', orderId).replace('DELIV', ids.deliv || 'x').replace('hoodie-jogger~X', ids.pair || 'x');
      await go(hash);
      await pg.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true, animations: 'disabled' });
    }
    // interaction states (viewport shots)
    const I = async (name, fn) => {
      if (FILTER && !FILTER.test(name)) return;
      try { await pg.goto(FILE + '#/'); await pg.waitForTimeout(700); await pg.evaluate(() => { ST.seenIntro = true; ST.bag = []; saveState(); try { closeModal(); } catch (e) { } }); await fn(); await pg.waitForTimeout(350); if (process.env.DBG) console.log(name, w, await pg.evaluate(() => ({ modal: !!document.querySelector('.modal-back'), bag: ST.bag.length, toast: (document.querySelector('.toast') || {}).textContent, hash: location.hash }))); await pg.screenshot({ path: `${OUT}/${name}-${w}.png`, animations: 'disabled' }); }
      catch (e) { errs.push(w + ' ' + name + ' ' + e.message.slice(0, 120)); }
    };
    await setState('empty');
    await I('x-pdp-scrolled', async () => { await go('#/p/essential-pique-polo'); await pg.evaluate(() => scrollTo(0, 1600)); });
    await I('x-pdp-atb', async () => { await go('#/p/essential-pique-polo'); const sz = await pg.evaluate(() => { const c = pdp_cur(); return c.p.sizes.filter(s => stockOf(c.p.id, c.u.color, s) > 3)[0]; }); await pg.locator('[data-act="pdp-size"][data-s="' + sz + '"]:visible').first().click(); await pg.waitForTimeout(150); await pg.locator('[data-act="pdp-add"]:visible').first().click(); if (process.env.DBG) console.log('after', sz, await pg.evaluate(() => [ST.bag.length, !!document.querySelector('.modal-back'), (document.querySelector('.toast')||{}).textContent])); });
    await I('x-pdp-chart', async () => { await setState('empty'); await go('#/p/essential-pique-polo'); await pg.evaluate(() => ACT['pdp-open-chart'] && ACT['pdp-open-chart'](document.querySelector('[data-act="pdp-open-chart"]'))); });
    await I('x-zoom', async () => { await go('#/p/essential-pique-polo'); await pg.click('.pdp-main >> nth=0'); });
    await I('x-pair-add', async () => { await setState('empty'); await go('#/combo-pair/solid-polo-2~black-navy?tpl=P1'); const b = await pg.$$('[data-act^="ca-size"],[data-act^="cap-size"]'); for (const x of b.slice(0, 1)) await x.click(); });
    await ctx.close();
    console.log('width done', w);
  }
  fs.writeFileSync(`${OUT}/errs.json`, JSON.stringify(errs, null, 1));
  console.log('errs', errs.length, errs.slice(0, 8));
  await b.close();
})();
