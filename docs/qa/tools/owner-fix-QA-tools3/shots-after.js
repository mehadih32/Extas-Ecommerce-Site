/* after-shots for the Bengali sheets of the r3 fixes */
const L = require('./lib');
(async () => {
  const { browser, page } = await L.start({ width: 1366, height: 768 });
  await L.open(page, '#/');
  /* footer brand + slogan */
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(500);
  const fb = await page.evaluate(() => { const r = document.querySelector('.fdr-brand').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.screenshot({ path: L.OUT + '/' + (process.env.PFX || 'after') + '-footer-slogan.png', clip: { x: Math.max(0, fb.x - 20), y: Math.max(0, fb.y - 20), width: 620, height: fb.h + 140 } });
  /* category pick names */
  await L.go(page, '#/c/hoodies', 900);
  const el = await page.$('.cat-pick-n'); await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(400);
  const bx = await el.evaluate(e => { const r = (e.closest('[class*="cat-bn"]') || e.parentElement).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.screenshot({ path: L.OUT + '/' + (process.env.PFX || 'after') + '-catpick.png', clip: { x: Math.max(0, bx.x - 10), y: Math.max(0, bx.y - 10), width: Math.min(1346, bx.w + 20), height: Math.min(700, bx.h + 20) } });
  /* find my size wording for a product on a sample chart */
  const pid = await page.evaluate(() => { const p = DB.products.find(p => /^ct-/.test(p.chart || '')); return p && p.id; });
  if(pid){
    await L.go(page, '#/p/' + pid, 900);
    const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button, a')].find(x => /Find my size/i.test(x.textContent) && x.getClientRects().length); if(b){ b.click(); return true; } return false; });
    await page.waitForTimeout(700);
    const txt = await page.evaluate(() => { const m = document.querySelector('.modal, [role="dialog"]'); return m ? m.innerText.slice(0, 200) : ''; });
    L.rec(ok && !/\(test\)/.test(txt), 'Find my size has no "(test)" for ' + pid, txt.replace(/\n/g, ' | '));
    await page.screenshot({ path: L.OUT + '/' + (process.env.PFX || 'after') + '-findsize.png' });
  } else L.rec(false, 'a product on a ct- chart');
  await browser.close(); L.done('shots-after');
})();
