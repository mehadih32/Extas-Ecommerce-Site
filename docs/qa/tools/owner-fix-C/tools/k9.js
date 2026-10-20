// K9 regression: on desktop the payment BOXES always show and bKash, Nagad, card and COD
// can always be chosen — every entry path, 20 loops each, at 1366 / 1440 / 1920.
// The phone keeps rule 39 (tags until a finished word of the address). node k9.js <html> [loops]
const { chromium, SETUPS, open, nav } = require('./lib');
const html = process.argv[2], LOOPS = +(process.argv[3] || 20); let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; if (bad < 40) console.log('FAIL', m); } };
const clearOrders = () => { Object.keys(ST.orders).forEach(id => { if (ST.orders[id].name === 'K9') { delete ST.orders[id]; Object.values(ST.accounts).forEach(a => { if (a.orders) a.orders = a.orders.filter(x => x !== id); }); } }); saveState(); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1366, 768], [1440, 900], [1920, 1080]]) {
    const { ctx, pg } = await open(b, html, w, h, 0);
    const check = async (tag) => {
      const r = await pg.evaluate(() => {
        const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const boxes = [...document.querySelectorAll('.co-paysec .co-po')].filter(vis).length;
        const soon = [...document.querySelectorAll('.co-soon')].some(vis);
        return { boxes, soon };
      });
      ok(r.boxes === 3 && !r.soon, `${w} ${tag}: boxes=${r.boxes} oneLine=${r.soon}`);
      for (const [act, v, want] of [['co-pay', 'mb', null], ['co-mb', 'bkash', 'bkash'], ['co-mb', 'nagad', 'nagad'], ['co-pay', 'card', 'card'], ['co-card', 'mastercard', 'card'], ['co-pay', 'cod', 'cod']]) {
        const sel = `.co-paysec [data-act="${act}"][data-v="${v}"]`;
        const el = await pg.$(sel); if (!el || !(await el.isVisible())) { ok(false, `${w} ${tag}: ${act}=${v} not clickable`); continue; }
        await el.click(); await pg.waitForTimeout(30);
        const got = await pg.evaluate(() => co_payment(co_state()));
        ok(want ? got === want : (got === 'bkash' || got === 'nagad'), `${w} ${tag}: chose ${v}, got ${got}`);
      }
    };
    for (let i = 0; i < LOOPS; i++) {
      await pg.evaluate(clearOrders);
      // 1. fresh direct visit, no draft
      await pg.evaluate(() => { delete UI['checkout']; try { sessionStorage.removeItem('extas-co-draft') } catch (e) { } logout && logout(); });
      await pg.evaluate(SETUPS.items(1 + (i % 6))); await nav(pg, '#/checkout'); await check('direct #' + i);
      // 2. bag -> checkout
      await pg.evaluate(() => { delete UI['checkout']; try { sessionStorage.removeItem('extas-co-draft') } catch (e) { } });
      await nav(pg, '#/bag'); await pg.click('[data-testid=bag-checkout]'); await pg.waitForTimeout(350); await check('bag->checkout #' + i);
      // 3. drawer -> checkout
      await pg.evaluate(() => { delete UI['checkout']; try { sessionStorage.removeItem('extas-co-draft') } catch (e) { } });
      await nav(pg, '#/p/contrast-collar-polo'); await pg.evaluate(() => { const c = pdp_cur(); const used = ST.bag.filter(l => l.product === c.p.id && l.color === c.u.color).map(l => l.size); c.u.size = c.p.sizes.find(z => stockOf(c.p.id, c.u.color, z) > 0 && used.indexOf(z) < 0); ACT['pdp-add'](); }); await pg.waitForTimeout(250);
      const d = await pg.$('.modal.atb-d a[href="#/checkout"]'); if (d) { await d.click(); await pg.waitForTimeout(350); await check('drawer->checkout #' + i); } else ok(false, `${w} drawer missing #${i}`);
      if (!(await pg.$('#co-address'))) { await nav(pg, '#/checkout'); }
      // 4. refresh with and without a typed address
      if (i % 2) { await pg.fill('#co-address', 'House 12, Road 5, Mirpur 10, Dhaka'); await pg.waitForTimeout(100); }
      await pg.reload(); await pg.waitForTimeout(700); await pg.evaluate(() => { ST.seenIntro = true; try { closeModal() } catch (e) { } }); await check('refresh #' + i);
      // 5. a one-letter address (rule 39 would have kept the tags)
      await pg.fill('#co-address', 'H'); await pg.waitForTimeout(80); await check('one letter #' + i);
    }
    ok(!pg._errs.length, `${w} page errors ${pg._errs.slice(0, 2)}`);
    await ctx.close();
  }
  // phone: unchanged — tags first, boxes after a finished word
  for (const [w, h] of [[360, 800], [393, 852], [430, 932]]) {
    const { ctx, pg } = await open(b, html, w, h, 1);
    await pg.evaluate(() => { delete UI['checkout']; try { sessionStorage.removeItem('extas-co-draft') } catch (e) { } });
    await pg.evaluate(SETUPS.items(2)); await nav(pg, '#/checkout');
    const a = await pg.evaluate(() => ({ soon: !!document.querySelector('.co-soon') && document.querySelector('.co-soon').getClientRects().length > 0, desk: [...document.querySelectorAll('[data-testid=co-pay-desk]')].some(e => e.getClientRects().length) }));
    ok(a.soon && !a.desk, `${w} phone fresh: ${JSON.stringify(a)}`);
    await pg.fill('#co-address', 'House 12, Road 5'); await pg.waitForTimeout(120);
    const c = await pg.evaluate(() => [...document.querySelectorAll('.co-paysec .co-po')].filter(e => e.getClientRects().length).length);
    ok(c === 3, `${w} phone after address: boxes ${c}`);
    await ctx.close();
  }
  console.log(bad ? `K9 FAIL (${bad} of ${n})` : `K9 ALL PASSED (${n} checks, ${LOOPS} loops × 5 paths × 3 widths)`); await b.close();
})();
