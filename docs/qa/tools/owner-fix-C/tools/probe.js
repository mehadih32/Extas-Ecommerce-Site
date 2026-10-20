// node probe.js <html> <outdir> [w] [h]
const { chromium, SETUPS, open, nav } = require('./lib'); const fs = require('fs');
const [html, out, W, H] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
const w = +(W || 1366), h = +(H || 768);
(async () => {
  const b = await chromium.launch();
  let { ctx, pg } = await open(b, html, w, h, 0);
  console.log('ids', await pg.evaluate(() => ['heavyweight-hoodie', 'classic-cotton-panjabi', 'crew-neck-tee', 'denim-jacket', 'slim-chino-trousers', 'oxford-cotton-shirt'].map(i => i + ':' + !!P(i))));
  // drawer via PDP with 4 items already in the bag
  await pg.evaluate(SETUPS.items(4));
  await nav(pg, '#/p/heavyweight-hoodie');
  await pg.evaluate(() => { const c = pdp_cur(); c.u.size = 'XL'; c.u.color = c.p.colors[1] || c.p.colors[0]; });
  await pg.evaluate(() => ACT['pdp-add']());
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: out + '/drawer-pdp.png' });
  await pg.evaluate(() => { try { closeModal() } catch (e) { } });
  // bag with 1 polo (duo) + tiers
  await pg.evaluate(SETUPS.items(1)); await nav(pg, '#/bag');
  await pg.screenshot({ path: out + '/bag-1.png', fullPage: true });
  await pg.evaluate(SETUPS.items(3)); await nav(pg, '#/bag');
  await pg.screenshot({ path: out + '/bag-3.png', fullPage: true });
  for (const n of [1, 5]) {
    await pg.evaluate(SETUPS.items(n)); await nav(pg, '#/checkout');
    await pg.screenshot({ path: out + `/co-${n}.png`, fullPage: true });
    await pg.screenshot({ path: out + `/co-${n}-fold.png` });
  }
  console.log('errs', pg._errs); await b.close();
})();
