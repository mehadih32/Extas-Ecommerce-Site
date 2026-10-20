const L = require('./lib');
(async () => {
  for(const [w, h] of [[1366, '#/admin/side-canvas'], [768, '#/admin/orders']]){
    const { browser, page } = await L.start({ width: w, height: 900 });
    await L.open(page, '#/', 'ST.adminLang="en";'); await L.go(page, h, 900);
    console.log(w, h, await page.evaluate(() => { const out = []; document.querySelectorAll('button,a').forEach(el => { const r = el.getBoundingClientRect(); if(r.right > innerWidth + 2 && r.width){ let p = el.parentElement, sc = null; while(p){ const cs = getComputedStyle(p); if(/auto|scroll/.test(cs.overflowX)){ sc = p.className; break; } if(/hidden|clip/.test(cs.overflowX)){ sc = 'HIDDEN:' + p.className; break; } p = p.parentElement; } out.push(el.textContent.trim().slice(0, 20) + ' → ' + sc); } }); return [...new Set(out.map(x => x.split(' → ')[1]))].join(' ; ') + ' n=' + out.length; }));
    if(w === 768) await page.screenshot({ path: L.OUT + '/adm-768.png', clip: { x: 0, y: 0, width: 768, height: 300 } });
    else await page.screenshot({ path: L.OUT + '/adm-sc-1366.png' });
    await browser.close();
  }
})();
