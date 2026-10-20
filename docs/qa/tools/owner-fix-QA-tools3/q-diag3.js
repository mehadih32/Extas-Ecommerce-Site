const L = require('./lib');
(async () => {
  const { browser, page } = await L.start({ width: 1366, height: 768 });
  await L.open(page, '#/');
  await L.go(page, '#/c/hoodies', 800);
  console.log(await page.evaluate(() => {
    const e = document.querySelector('.cat-pick-n'); const cs = getComputedStyle(e);
    const p = e.closest('[class*="cat-pick"]:not(.cat-pick-n)');
    e.scrollIntoView({block:'center'});
    return JSON.stringify({ txt: e.textContent, sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight, ov: cs.overflow, to: cs.textOverflow, ws: cs.whiteSpace, clamp: cs.webkitLineClamp, parent: p && p.className,
      setbox: [...document.querySelectorAll('main *')].filter(x => /Build your own|any \d|Any \d/i.test(x.textContent) && x.children.length < 6 && x.getBoundingClientRect().height > 80).slice(0, 3).map(x => x.className) });
  }));
  await page.waitForTimeout(300);
  const pk = await page.$('.cat-pick-n'); const box = await pk.evaluate(e => { const r = (e.closest('a') || e.parentElement.parentElement).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.screenshot({ path: L.OUT + '/diag-catpick.png', clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: Math.min(700, box.w + 300), height: box.h + 40 } });
  for(const id of ['classic-cotton-panjabi', 'heavyweight-hoodie']){
    await L.go(page, '#/p/' + id, 900);
    console.log(id, await page.evaluate(() => JSON.stringify({ tpl: (document.querySelector('.pdp-page') || {}).className, thumbs: document.querySelectorAll('.pdp-thumb').length, care: !!document.querySelector('.ob-care'), careLink: [...document.querySelectorAll('a')].filter(a => /care/i.test(a.textContent)).map(a => a.textContent.trim().slice(0, 40)).slice(0, 3),
      rev: [...document.querySelectorAll('.pdp-revgrid > *')].map(e => e.className + ':' + Math.round(e.getBoundingClientRect().height)), revlist: [...document.querySelectorAll('.pdp-revlist > *')].map(e => Math.round(e.getBoundingClientRect().height)) })));
  }
  await browser.close();
})();
