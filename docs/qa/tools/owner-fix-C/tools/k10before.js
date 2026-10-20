const { chromium, SETUPS, open, nav } = require('./lib');
(async () => { const b = await chromium.launch();
  for (const [html, tag] of [[process.argv[2], 'v12'], [process.argv[3], 'a']]) {
    const { ctx, pg } = await open(b, html, 1366, 768, 0);
    await pg.evaluate(SETUPS.items(1)); await nav(pg, '#/checkout');
    await pg.fill('#co-name', 'Rahim'); await pg.fill('#co-phone', '1'); await pg.fill('#co-address', 'House 12, Road 5, Mirpur 10, Dhaka'); await pg.waitForTimeout(1000);
    await pg.click('.co-side [data-testid=co-confirm]'); await pg.waitForTimeout(900);
    console.log(tag, await pg.evaluate(() => location.hash));
    await pg.screenshot({ path: process.argv[4] + '/' + tag + '-k10-one-digit.png' }); await ctx.close(); }
  await b.close(); })();
