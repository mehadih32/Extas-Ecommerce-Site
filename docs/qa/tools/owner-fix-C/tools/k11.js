// K11 — Polo Duo is "any 2 DIFFERENT colours": price and words agree, and the total is the
// same in the drawer, the bag, the checkout summary, the order and the invoice. node k11.js <html>
const { chromium, open, nav } = require('./lib');
const html = process.argv[2]; let bad = 0, n = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } else if (process.env.V) console.log('ok  ', m); };
const P1 = 'essential-pique-polo';
const CASES = [
  ['navy+navy (same colour)', [['navy', 'M'], ['navy', 'L']], 1700],
  ['navy+black', [['navy', 'M'], ['black', 'M']], 1500],
  ['navy+navy+black', [['navy', 'M'], ['navy', 'L'], ['black', 'M']], 2350],
  ['navy,navy,black,black', [['navy', 'M'], ['navy', 'L'], ['black', 'M'], ['black', 'L']], 3000],
  ['navy x2 qty (one line)', [['navy', 'M', 2]], 1700],
];
(async () => {
  const b = await chromium.launch();
  for (const [w, h, mob] of [[1366, 768, 0], [393, 852, 1]]) {
    const { ctx, pg } = await open(b, html, w, h, mob);
    for (const style of mob ? ['A'] : ['A', 'B']) for (const [label, lines, want] of CASES) {
      await pg.evaluate(([P1, lines, style]) => { Object.keys(ST.orders).forEach(id => { if (ST.orders[id].name === 'K11') delete ST.orders[id]; }); ST.shopOpt = Object.assign(ST.shopOpt || {}, { 'atb.style': style }); ST.bag = []; try { logout(); } catch (e) { } delete UI['checkout']; try { sessionStorage.removeItem('extas-co-draft') } catch (e) { }
        lines.forEach(([c, s, q]) => bagAdd({ kind: 'item', product: P1, color: c, size: s, qty: q || 1 }, { force: true })); saveState(); }, [P1, lines, style]);
      const r = await pg.evaluate(async () => {
        const tot = bagTotals(), off = bag_bestOffer(tot.total), grand = tot.total - off.amount;
        location.hash = '#/x'; await new Promise(r => setTimeout(r, 40)); location.hash = '#/bag'; await new Promise(r => setTimeout(r, 500));
        const bag = (document.querySelector('[data-testid=bag-total]') || {}).textContent;
        location.hash = '#/checkout'; await new Promise(r => setTimeout(r, 500));
        const co = [...document.querySelectorAll('[data-testid=co-total]')].map(e => e.textContent);
        return { grand: fmt(grand), raw: grand, bag, co };
      });
      ok(r.raw === want, `${w} ${label}: bag total ${r.raw}, want ${want}`);
      ok(r.bag === r.grand && r.co.every(x => x === r.grand), `${w} ${label}: bag ${r.bag} / checkout ${r.co} / calc ${r.grand}`);
      // drawer (desktop): add one more of the first line's colour again via the drawer builder
      if (!mob) {
        const d = await pg.evaluate(() => { const l = ST.bag[ST.bag.length - 1]; bag_drawerOpen(l.id); const t = (document.querySelector('[data-testid=atbc-total]') || {}).textContent; closeModal(); return { t, g: fmt(bagTotals().total - bag_bestOffer(bagTotals().total).amount) }; });
        ok(d.t === d.g && d.t === r.grand, `${w} ${style} ${label}: drawer ${d.t} vs bag ${r.grand}`);
      }
      // place the order: order total and invoice total
      const o = await pg.evaluate(async () => {
        document.getElementById('co-name').value = 'K11'; INPUT['co-name'](document.getElementById('co-name'));
        const ph = document.getElementById('co-phone'); ph.value = '01712345678'; INPUT['co-phone'](ph);
        const ad = document.getElementById('co-address'); ad.value = 'House 12, Road 5, Mirpur 10, Dhaka'; INPUT['co-address'](ad);
        await new Promise(r => setTimeout(r, 1000));
        const shown = document.querySelector('[data-testid=co-total]').textContent;
        SUBMIT['co-place'](document.getElementById('co-form'), { submitter: document.querySelector('.co-confirm') });
        await new Promise(r => setTimeout(r, 300));
        const id = location.hash.split('/').pop(), od = ST.orders[id]; if (!od) return { err: location.hash };
        const inv = typeof zx_invData === 'function' ? zx_invData(od).total : od.total;
        return { shown, total: fmt(od.total), inv: fmt(inv) };
      });
      ok(!o.err && o.total === o.shown && o.inv === o.shown, `${w} ${label}: checkout ${o.shown} → order ${o.total} → invoice ${o.inv}`);
    }
    // the combo page refuses Navy + Navy, takes Navy + Black
    await pg.evaluate(() => { ST.bag = []; saveState(); }); await nav(pg, '#/combo/polo-duo');
    const cp = await pg.evaluate(() => { const c = COMBO('polo-duo'); const u = { colors: ['navy', 'navy'], sizes: ['M', 'M'], same: [false, false], done: [true, true] }; const a = cb_checkAll(c, u); u.colors = ['navy', 'black']; const b2 = cb_checkAll(c, u); return { same: a, diff: b2, blurb: c.blurb }; });
    ok(!cp.same.ok && /different colour/.test(cp.same.msg) && cp.diff.ok, `${w} combo page check: ${JSON.stringify(cp)}`);
    ok(/different colours/.test(cp.blurb), `${w} wording: ${cp.blurb}`);
    // a stored Navy + Navy set line is priced as two singles everywhere
    const sl = await pg.evaluate(() => { ST.bag = []; bagAdd({ kind: 'set', source: 'combo', refId: 'polo-duo', name: 'Polo Duo', items: [{ product: 'essential-pique-polo', color: 'navy', size: 'M' }, { product: 'essential-pique-polo', color: 'navy', size: 'L' }], price: 1500 }, { force: true }); return bagTotals().total; });
    ok(sl === 1700, `${w} same-colour set line priced ${sl}`);
    // landing page duo never ends with one colour twice
    const lp = await pg.evaluate(async () => { const L = (ST.landingPages || DB.landingPages || []).find(x => x.slug === 'polo-duo'); if (!L) return 'nolanding'; location.hash = '#/l/polo-duo'; await new Promise(r => setTimeout(r, 500));
      const sw = document.querySelector('[data-act=lp-pick][data-i="1"][data-c="' + (document.querySelector('[data-act=lp-pick][data-i="0"].on') || {}).getAttribute?.('data-c') + '"]'); if (sw) sw.click(); await new Promise(r => setTimeout(r, 200));
      const on = [...document.querySelectorAll('[data-act=lp-pick].on')].map(e => e.getAttribute('data-c')); const lab = [...document.querySelectorAll('.lp-fld .label')].map(e => e.textContent).join(' | '); return { on, lab }; });
    ok(lp === 'nolanding' || (lp.on.length >= 2 && lp.on[0] !== lp.on[1] && /different colours/.test(JSON.stringify(lp))), `${w} landing picks ${JSON.stringify(lp)}`);
    ok(!pg._errs.length, `${w} errors ${pg._errs.slice(0, 2)}`);
    await ctx.close();
  }
  console.log(bad ? `K11 FAIL (${bad} of ${n})` : `K11 + TOTALS ALL PASSED (${n} checks)`); await b.close();
})();
