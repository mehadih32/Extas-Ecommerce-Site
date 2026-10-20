const L = require('./lib');
(async () => {
  const { browser, page } = await L.start({ width: 1366, height: 768 });
  await L.open(page, '#/');
  for(const id of ['essential-pique-polo', 'classic-cotton-panjabi']){
    await L.go(page, '#/p/' + id, 900);
    await page.evaluate(() => window.scrollTo(0, 2200)); await page.waitForTimeout(600);
    console.log(id, await page.evaluate(() => {
      const h = document.querySelector('h1.h1'); const cs = getComputedStyle(h); const r = h.getBoundingClientRect();
      const rg = document.createRange(); rg.selectNodeContents(h.firstChild); const b = rg.getBoundingClientRect();
      const care = document.querySelector('.ob-care');
      const th = [...document.querySelectorAll('.pdp-thumb')].map(t => { const r = t.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), getComputedStyle(t).display]; });
      const bm = document.querySelector('.ob-bm'); let bar = bm; while(bar && bar.parentElement && !/sticky|bar/.test(bar.className)) bar = bar.parentElement;
      return JSON.stringify({ h1: { cls: h.className, ov: cs.overflow, w: Math.round(r.width), x: Math.round(r.x), tx: [Math.round(b.left), Math.round(b.right)], html: h.innerHTML.slice(0, 160) }, care: care && care.outerHTML.slice(0, 300), th, bar: bar && { cls: bar.className, top: Math.round(bar.getBoundingClientRect().top), op: getComputedStyle(bar).opacity, tr: getComputedStyle(bar).transform } });
    }));
  }
  await browser.close();
})();
