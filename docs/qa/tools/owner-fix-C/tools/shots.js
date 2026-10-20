// node shots.js <html> <outdir> [w] [h] [filter]
const { chromium, SETUPS, open, nav } = require('./lib'); const fs = require('fs');
const [html, out, W, H, F] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const w = +(W || 1366), h = +(H || 768), filt = F ? new RegExp(F) : null;
const opt = (o) => `(()=>{ ST.shopOpt = Object.assign(ST.shopOpt||{}, ${JSON.stringify(o)}); saveState(); })()`;
(async () => {
  const b = await chromium.launch();
  const { ctx, pg } = await open(b, html, w, h, 0);
  const shot = async (name, full) => { if (filt && !filt.test(name)) return; await pg.waitForTimeout(250); await pg.screenshot({ path: `${out}/${name}.png`, fullPage: !!full }); };
  const want = (n) => !filt || filt.test(n);
  for (const st of ['A', 'B']) for (const n of [1, 4, 7]) {
    const name = `drawer-${st}-${n}`; if (!want(name)) continue;
    await pg.evaluate(opt({ 'atb.style': st })); await pg.evaluate(SETUPS.items(n - 1));
    await nav(pg, '#/p/heavyweight-hoodie');
    await pg.evaluate(() => { const c = pdp_cur(); c.u.size = 'XL'; c.u.color = c.p.colors[1] || c.p.colors[0]; ACT['pdp-add'](); });
    await pg.waitForTimeout(500); await shot(name); await pg.evaluate(() => closeModal());
  }
  if (want('drawer-combo')) { await pg.evaluate(opt({ 'atb.style': 'B' })); await pg.evaluate(SETUPS.items(2)); await nav(pg, '#/combo/polo-duo'); await pg.evaluate(() => { const b = document.querySelector('[data-act=cb-add]'); }); }
  for (const st of ['current', 'cards', 'side']) for (const n of [1, 3]) {
    const name = `bag-${st}-${n}`; if (!want(name)) continue;
    await pg.evaluate(opt({ 'bag.upsellStyle': st })); await pg.evaluate(SETUPS.items(n)); await nav(pg, '#/bag'); await shot(name, true);
  }
  for (const lay of ['wide', 'classic']) for (const n of [1, 3, 5, 6]) {
    const name = `co-${lay}-${n}`; if (!want(name)) continue;
    await pg.evaluate(opt({ 'co.layout': lay })); await pg.evaluate(SETUPS.items(n)); await nav(pg, '#/checkout');
    await shot(name + '-fold'); await shot(name, true);
  }
  await pg.evaluate(opt({ 'atb.style': 'A', 'bag.upsellStyle': 'current', 'co.layout': 'wide' }));
  console.log('errs', pg._errs); await b.close();
})();
