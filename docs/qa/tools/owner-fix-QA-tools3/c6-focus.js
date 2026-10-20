const L = require('./lib');
(async () => {
  const { browser, page } = await L.start({ width: 1366, height: 768 });
  for(const h of ['#/', '#/p/essential-pique-polo', '#/bag', '#/checkout']){
    await L.open(page, h, 'ST.bag=[{kind:"item",product:"essential-pique-polo",color:"navy",size:"M",qty:1}];'); await page.evaluate(() => rerender()); await page.waitForTimeout(400);
    const res = [];
    for(let i = 0; i < 14; i++){
      await page.keyboard.press('Tab'); await page.waitForTimeout(60);
      res.push(await page.evaluate(() => { const a = document.activeElement; if(!a || a === document.body) return 'BODY'; const cs = getComputedStyle(a); const vis = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none'); const r = a.getBoundingClientRect(); return (vis ? 'ok' : 'NOFOCUS') + ':' + (a.getAttribute('aria-label') || a.textContent.trim()).slice(0, 18) + (r.width ? '' : ':HIDDEN'); }));
    }
    const badf = res.filter(x => /NOFOCUS|HIDDEN|BODY/.test(x));
    L.rec(!badf.length, h + ' keyboard focus visible on the first 14 Tab stops', badf.length ? res : res.slice(0, 4));
  }
  L.rec(!page._errs.length, 'no JS errors', page._errs.slice(0, 2));
  await browser.close(); L.done('c6-focus');
})();
