const L = require('./lib');
(async () => {
  const [hash, w, h, y, name] = process.argv.slice(2);
  const { browser, page } = await L.start({ width: +w, height: +h });
  await L.open(page, '#/'); await L.go(page, hash, 900);
  await page.evaluate((y) => window.scrollTo(0, y), +y || 0); await page.waitForTimeout(700);
  await page.screenshot({ path: L.OUT + '/' + name + '.png' });
  console.log(page._errs.length ? page._errs : 'ok'); await browser.close();
})();
