const { chromium, SETUPS, open, nav } = require('./lib');
(async () => { const b = await chromium.launch(); const { ctx, pg } = await open(b, process.argv[2], 1366, 768, 0);
  await pg.evaluate(SETUPS.items(3)); await nav(pg, '#/p/heavyweight-hoodie');
  await pg.evaluate(() => { const c = pdp_cur(); c.u.size = 'XL'; ACT['pdp-add'](); }); await pg.waitForTimeout(600);
  console.log(await pg.evaluate(() => { const m = document.querySelector('.modal.atb-d'), bd = m.lastElementChild; const its = [...m.querySelectorAll('.atb-xi')]; return { n: its.length, vis: its.filter(x => x.style.display !== 'none').length, sh: bd.scrollHeight, ch: bd.clientHeight, cls: bd.className, ups: ups_picks(16).length }; }));
  await b.close(); })();
