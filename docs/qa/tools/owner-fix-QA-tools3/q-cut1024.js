const L = require('./lib');
(async () => {
  const { browser, page } = await L.start({ width: 1024, height: 768 }, { ctx: { deviceScaleFactor: 2, hasTouch: true } });
  await L.open(page, '#/'); await L.go(page, '#/p/essential-pique-polo', 1000);
  const info = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.xs.text2')].find(e => /chest 42/.test(e.textContent) && e.getClientRects().length);
    if(!el) return null; el.scrollIntoView({ block: 'center' });
    const cs = getComputedStyle(el); const path = []; let p = el; for(let i = 0; i < 6 && p; i++){ path.push(p.tagName + '.' + String(p.className).replace(/ /g, '.')); p = p.parentElement; }
    return { txt: el.textContent, html: el.outerHTML.slice(0, 300), sw: el.scrollWidth, cw: el.clientWidth, ws: cs.whiteSpace, ov: cs.overflow, path };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.waitForTimeout(300);
  const b = await page.evaluate(() => { const el = [...document.querySelectorAll('.xs.text2')].find(e => /chest 42/.test(e.textContent) && e.getClientRects().length); const r = (el.parentElement.parentElement).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.screenshot({ path: L.OUT + '/' + (process.env.PFX || 'cut1024') + '.png', clip: { x: Math.max(0, b.x - 10), y: Math.max(0, b.y - 10), width: Math.min(1000, b.w + 20), height: Math.min(400, b.h + 20) } });
  await browser.close();
})();
