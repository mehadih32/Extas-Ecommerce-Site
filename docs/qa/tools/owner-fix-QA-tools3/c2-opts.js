const L = require('./lib');
(async () => {
  for(const w of [1366, 1920]){
  const { browser, page } = await L.start({ width: w, height: w === 1920 ? 1080 : 768 });
  await L.open(page, '#/');
  const setA = (area, patch) => page.evaluate(([a, p]) => { window.SB_INJECT = window.SB_INJECT || { areas: {} }; window.SB_INJECT.areas[a] = Object.assign({}, window.SB_INJECT.areas[a] || {}, p); rerender(); }, [area, patch]);
  const nav = () => page.evaluate(() => [...document.querySelectorAll('.hdr .nav-i')].filter(a => a.getClientRects().length && !a.hidden).map(a => a.textContent.trim()));
  for(const lay of ['all', 'catsMore', 'shop', 'priority']){
    await setA('menus', { deskLayout: lay }); await page.waitForTimeout(400);
    const n = await nav(); const cs = await L.cutScan(page, '.hdr');
    L.rec(n.length >= 3 && cs.n === 0, w + ' H4 menu arrangement "' + lay + '"', n.join(' | '));
  }
  await setA('menus', { deskLayout: 'all' });
  const lg = [];
  for(let s = 0; s <= 10; s++){
    await page.evaluate((s) => { window.SB_INJECT.areas.header = Object.assign({}, window.SB_INJECT.areas.header || {}, { logo: { text: 'EXTAS', img: '', imgPhone: '', alt: '', hDesk: 36, hPhone: 28, hFooter: 32, style: s } }); rerender(); }, s);
    await page.waitForTimeout(200);
    lg.push(await page.evaluate(() => { const l = document.querySelector('.hdr .logo'); const b = l.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height) + ':' + (l.className.match(/lg-s\d+|style-\d+/) || [''])[0]; }));
    if(s === 5) await page.screenshot({ path: L.OUT + '/h5-logo5-' + w + '.png', clip: { x: 0, y: 0, width: w, height: 110 } });
  }
  L.rec(new Set(lg).size >= 8, w + ' H5 logo styles 0–10 draw differently', lg);
  await page.evaluate(() => { delete window.SB_INJECT.areas.header; rerender(); });
  await setA('home', { rowFade: false }); await page.waitForTimeout(300);
  const nf = await page.evaluate(() => document.documentElement.classList.contains('hm-nofade'));
  await setA('home', { rowFade: true }); await page.waitForTimeout(300);
  const f2 = await page.evaluate(() => document.documentElement.classList.contains('hm-nofade'));
  L.rec(nf && !f2, w + ' H9 row edge fade switch works both ways', { off: nf, backOn: !f2 });
  const tiles = await page.evaluate(() => { const fn = typeof sg_cats === 'function' ? sg_cats() : null; return { cats: fn ? fn.length : -1 }; });
  L.rec(tiles.cats > 0, w + ' H8 size-finder categories come from data (sg_cats)', tiles);
  await setA('home', { finder: { title: 'QA TITLE X', text: 'QA TEXT Y', btn: 'QA BTN', btnSaved: 'QA SAVED' } }); await page.waitForTimeout(300);
  const ft = await page.evaluate(() => /QA TITLE X/.test(document.body.innerText) && /QA TEXT Y/.test(document.body.innerText));
  L.rec(ft, w + ' H8 size-finder words are editable');
  await setA('home', { finder: undefined });
  await page.evaluate(() => { delete window.SB_INJECT.areas.home.finder; rerender(); });

  L.rec(!page._errs.length, w + ' options: no JS errors', page._errs.slice(0, 3));
  await browser.close();
  }
  L.done('c2-opts');
})();
