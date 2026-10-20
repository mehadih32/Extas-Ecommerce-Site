const L = require('./lib');
(async () => {
  const { browser, page } = await L.start({ width: 1366, height: 768 });
  await L.open(page, '#/');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(400);
  const inp = page.locator('#join-d-msg').locator('xpath=..').locator('input[type="tel"]');
  const n = await inp.count(); console.log('inputs', n);
  for(const v of ['1', '+880 1712-345678', '০১৭১২৩৪৫৬৭৮']){
    await inp.fill(v); await inp.press('Enter'); await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ msg: document.querySelector('#join-d-msg').textContent, toast: (document.querySelector('.toast') || {}).textContent }));
    L.rec(v === '1' ? /\S/.test(r.msg) : /Thanks/.test(r.toast || ''), 'desktop join ' + v, r);
  }
  await page.screenshot({ path: L.OUT + '/join-1366.png', clip: { x: 0, y: 300, width: 700, height: 468 } });
  await browser.close(); L.done('q-join');
})();
