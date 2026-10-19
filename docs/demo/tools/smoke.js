// usage: node tools/smoke.js <html> <outdir> <route1> [route2 ...]
// Opens each route at desktop (1366x900) and phone (390x844), prints console errors, saves full-page screenshots.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'); const fs = require('fs');
(async () => {
  const [html, outdir, ...routes] = process.argv.slice(2);
  fs.mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch();
  let errors = 0;
  for (const vp of [{ name: 'desk', width: 1366, height: 900 }, { name: 'phone', width: 390, height: 844, isMobile: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: !!vp.isMobile, hasTouch: !!vp.isMobile });
    const page = await ctx.newPage();
    page.on('pageerror', e => { errors++; console.log(`[${vp.name}] PAGEERROR ${e.message}`); });
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) { errors++; console.log(`[${vp.name}] CONSOLE ${m.text()}`); } });
    await page.goto('file://' + path.resolve(html) + '#/');
    await page.waitForTimeout(300);
    await page.evaluate(() => { try { ST.seenIntro = true; saveState(); closeModal(); } catch (e) {} });
    for (const r of routes) {
      await page.evaluate(h => { location.hash = h; }, r);
      await page.waitForTimeout(250);
      const body = await page.evaluate(() => document.getElementById('app').innerText.slice(0, 160).replace(/\s+/g, ' '));
      if (/Something went wrong/.test(body)) { errors++; console.log(`[${vp.name}] ${r} RENDER ERROR: ${body}`); }
      const name = vp.name + '_' + r.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') + '.png';
      await page.screenshot({ path: path.join(outdir, name), fullPage: true });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(errors ? `DONE with ${errors} error(s)` : 'DONE, no errors');
})();
