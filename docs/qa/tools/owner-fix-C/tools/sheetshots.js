// node sheetshots.js <before.html> <after.html> <outdir> — element crops for the Bengali sheets
const { chromium, SETUPS, open, nav } = require('./lib'); const fs = require('fs');
const [BEFORE, AFTER, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const opt = (o) => `(()=>{ ST.shopOpt = Object.assign(ST.shopOpt||{}, ${JSON.stringify(o)}); saveState(); })()`;
(async () => {
  const b = await chromium.launch();
  const grab = async (pg, file, sel, pad = 12, full) => {
    await pg.addStyleTag({ content: '.demo-fab{display:none!important} header,.hdr,.co-hdr,.ck-hdr{position:relative!important;top:auto!important}' }); await pg.waitForTimeout(300);
    if (!sel) return pg.screenshot({ path: `${OUT}/${file}.png`, fullPage: !!full, animations: 'disabled' });
    const e = await pg.$(sel); if (!e) { console.log('missing', file, sel); return; }
    await e.scrollIntoViewIfNeeded(); await pg.waitForTimeout(150);
    await e.screenshot({ path: `${OUT}/${file}.png`, animations: 'disabled' });
  };
  for (const [html, tag] of [[BEFORE, 'b'], [AFTER, 'a']]) {
    for (const [w, h] of [[1366, 768], [1920, 1080]]) {
      const { ctx, pg } = await open(b, html, w, h, 0);
      const styles = tag === 'b' ? ['A'] : ['A', 'B'];
      for (const st of styles) {
        await pg.evaluate(opt({ 'atb.style': st })); await pg.evaluate(SETUPS.items(4)); await nav(pg, '#/p/heavyweight-hoodie');
        await pg.evaluate(() => { const c = pdp_cur(); c.u.size = 'XL'; c.u.color = c.p.colors[1] || c.p.colors[0]; ACT['pdp-add'](); }); await pg.waitForTimeout(500);
        await grab(pg, `${tag}-drawer${st}-${w}`, ".modal.atb-d", 0); await pg.evaluate(() => closeModal());
      }
      if (w === 1366) {
        // bag
        for (const st of tag === 'b' ? ['current'] : ['current', 'cards', 'side']) {
          await pg.evaluate(opt({ 'bag.upsellStyle': st })); await pg.evaluate(SETUPS.items(1)); await nav(pg, '#/bag');
          if (st === 'current') { await grab(pg, `${tag}-duo`, '[data-testid=duo-offer]', 8); await grab(pg, `${tag}-bagtop`); }
          await grab(pg, `${tag}-ups-${st}`, '.ups .container', 4);
        }
        await pg.evaluate(opt({ 'bag.upsellStyle': 'current' }));
        // checkout
        for (const n of [1, 5, 6]) {
          await pg.evaluate(() => { delete UI['checkout']; try { sessionStorage.removeItem('extas-co-draft') } catch (e) { } });
          await pg.evaluate(SETUPS.items(n)); await nav(pg, '#/checkout');
          if (n === 1) { await grab(pg, `${tag}-co-fold1`); await grab(pg, `${tag}-co-pay`, '[data-testid=co-pay]:visible, [data-testid=co-pay-desk]:visible', 6); }
          if (n === 5) { await grab(pg, `${tag}-co-full5`, null, 0, true); await grab(pg, `${tag}-co-bottom`, '.co-ups', 6); }
          if (n === 6) { await pg.evaluate(() => window.scrollTo(0, 0)); await grab(pg, `${tag}-co-side6`, '.co-float', 6); }
        }
        // K9: the same page after an address was typed earlier
        await pg.fill('#co-address', 'House 12, Road 5, Mirpur 10, Dhaka'); await pg.waitForTimeout(300); await pg.reload(); await pg.waitForTimeout(800);
        await grab(pg, `${tag}-co-pay-refresh`, '.co-paysec', 6);
        // K10 desktop
        await pg.fill('#co-phone', '+880 1712 345678'); await pg.click('#co-name'); await grab(pg, `${tag}-k10-ok-d`, '[data-field=co-phone]', 8);
        await pg.fill('#co-phone', '0171'); await pg.click('#co-name'); await grab(pg, `${tag}-k10-bad-d`, '[data-field=co-phone]', 8);
        // classic layout
        if (tag === 'a') { await pg.evaluate(opt({ 'co.layout': 'classic' })); await pg.evaluate(SETUPS.items(1)); await nav(pg, '#/checkout'); await grab(pg, `a-co-classic1`); await pg.evaluate(opt({ 'co.layout': 'wide' })); }
        // K11: Navy M + Navy L
        await pg.evaluate(() => { ST.bag = []; ['M', 'L'].forEach(s => bagAdd({ kind: 'item', product: 'essential-pique-polo', color: 'navy', size: s, qty: 1 }, { force: true })); saveState(); });
        await nav(pg, '#/bag'); await grab(pg, `${tag}-k11-sum`, '[data-testid=bag-summary]', 6);
        await pg.evaluate(() => { ST.bag = []; ['navy', 'black'].forEach(c => bagAdd({ kind: 'item', product: 'essential-pique-polo', color: c, size: 'M', qty: 1 }, { force: true })); saveState(); });
        await nav(pg, '#/bag'); await grab(pg, `${tag}-k11-sum2`, '[data-testid=bag-summary]', 6);
        await nav(pg, '#/combo/polo-duo'); await pg.evaluate(() => { const p = [...document.querySelectorAll('p.small.muted')].find(e => /colours of our/.test(e.textContent)); if (p) p.id = 'k11-blurb'; }); await grab(pg, `${tag}-k11-combo`, '#k11-blurb');
      }
      await ctx.close();
    }
    // phone K10
    const { ctx, pg } = await open(b, html, 393, 852, 1);
    await pg.evaluate(SETUPS.items(2)); await nav(pg, '#/checkout');
    await pg.fill('#co-phone', '০১৭১২৩৪৫৬৭৮'); await pg.click('#co-name'); await grab(pg, `${tag}-k10-ok-m`, '[data-field=co-phone]', 8);
    await pg.fill('#co-phone', '1'); await pg.click('#co-name'); await pg.waitForTimeout(100);
    await pg.fill('#co-name', 'Rahim'); await pg.fill('#co-address', 'House 12, Road 5, Mirpur 10, Dhaka');
    await pg.click('.co-mbar [data-testid=co-confirm]'); await pg.waitForTimeout(600); await grab(pg, `${tag}-k10-bad-m`, '[data-field=co-phone]', 8);
    await pg.evaluate(() => { ST.bag = []; ['M', 'L'].forEach(s => bagAdd({ kind: 'item', product: 'essential-pique-polo', color: 'navy', size: s, qty: 1 }, { force: true })); saveState(); });
    await nav(pg, '#/bag'); await grab(pg, `${tag}-k11-m`, '.bg-mbar', 0);
    await ctx.close();
  }
  await b.close(); console.log('done');
})();
