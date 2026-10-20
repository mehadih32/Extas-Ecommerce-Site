// node k9probe.js <html> — which payment look shows, per path / width / state
const { chromium, SETUPS, open, nav } = require('./lib');
const html = process.argv[2];
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[1366, 768], [1440, 900], [1920, 1080], [393, 852]]) {
    const mob = w < 1000;
    const { ctx, pg } = await open(b, html, w, h, mob);
    const look = async (tag) => { const r = await pg.evaluate(() => ({ soon: !!document.querySelector('.co-soon'), boxes: document.querySelectorAll('.co-po').length, addr: (document.getElementById('co-address') || {}).value, draft: (() => { try { return sessionStorage.getItem('extas-co-draft') } catch (e) { return 'x' } })(), acc: !!currentAccount() })); console.log(w, tag.padEnd(28), r.soon ? 'ONE LINE' : 'boxes(' + r.boxes + ')', 'addr=' + JSON.stringify(r.addr), 'draft=' + (r.draft ? 'yes' : 'no'), 'acc=' + r.acc); };
    await pg.evaluate(SETUPS.items(2)); await nav(pg, '#/checkout'); await look('direct fresh');
    await pg.fill('#co-address', 'House 12, Road 5, Mirpur 10, Dhaka'); await pg.waitForTimeout(1000); await look('after typing address');
    await nav(pg, '#/bag'); await pg.click('[data-testid=bag-checkout]'); await pg.waitForTimeout(600); await look('bag -> checkout (same tab)');
    await pg.reload(); await pg.waitForTimeout(900); await look('refresh');
    await pg.evaluate(() => { delete UI['checkout']; try { sessionStorage.removeItem('extas-co-draft') } catch (e) { } });
    await nav(pg, '#/bag'); await pg.click('[data-testid=bag-checkout]'); await pg.waitForTimeout(600); await look('bag -> checkout (new draft)');
    if (!mob) { await nav(pg, '#/p/heavyweight-hoodie'); await pg.evaluate(() => { const c = pdp_cur(); c.u.size = 'L'; ACT['pdp-add'](); }); await pg.waitForTimeout(500); await pg.click('.modal.atb-d a[href="#/checkout"]'); await pg.waitForTimeout(600); await look('drawer -> checkout'); }
    await pg.evaluate(() => { login && login(DB.accounts ? DB.accounts[0].phone : '01712345678'); }).catch(()=>{});
    await pg.evaluate(() => { delete UI['checkout']; try { sessionStorage.removeItem('extas-co-draft') } catch (e) { } }); await nav(pg, '#/checkout'); await look('logged in');
    console.log('errors', pg._errs.slice(0, 3)); await ctx.close();
  }
  await b.close();
})();
