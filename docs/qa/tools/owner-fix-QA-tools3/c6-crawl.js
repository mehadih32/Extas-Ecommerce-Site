/* Chunk 6: storefront crawl — every internal link reachable from home/category/product/footer.
   Checks: page not found, JS errors, cut text, sideways scroll, empty main, images without alt.
   node c6-crawl.js <width> */
const L = require('./lib');
const fs = require('fs');
const w = +(process.argv[2] || 1366);
(async () => {
  const { browser, page } = await L.start({ width: w, height: w >= 1366 ? (w === 1920 ? 1080 : 768) : 1024 });
  await L.open(page, '#/');
  const seen = new Set(), queue = ['#/'];
  const seeds = ['#/', '#/c/polos', '#/p/essential-pique-polo', '#/combo/polo-duo', '#/set', '#/journal', '#/account', '#/bag', '#/page/faq'];
  for(const s of seeds){
    await L.go(page, s, 600);
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href^="#/"]')].map(a => a.getAttribute('href')));
    links.forEach(h => { const k = h.replace(/\?.*$/, '').replace(/\/$/, ''); if(!/admin/.test(h) && !seen.has(k)){ seen.add(k); queue.push(h); } });
  }
  const list = [...new Set(queue)].slice(0, 160);
  const bad = [];
  for(const h of list){
    page._errs = [];
    await page.evaluate(() => { location.hash = '#/blank-x'; }); await page.waitForTimeout(60);
    await L.go(page, h, 550);
    const r = await page.evaluate(() => {
      const t = document.body.innerText;
      const nf = /page not found|couldn.t find this page|404/i.test((document.querySelector('main') || document.body).innerText.slice(0, 400));
      const main = document.querySelector('main'); const empty = main ? main.innerText.trim().length < 20 : true;
      const noalt = [...document.querySelectorAll('main img')].filter(i => !i.hasAttribute('alt')).length;
      const und = /\bundefined\b|\bNaN\b|\[object Object\]/.test(t) ? (t.match(/.{0,30}(\bundefined\b|\bNaN\b|\[object Object\]).{0,30}/) || [''])[0] : '';
      return { nf, empty, noalt, und, title: document.title };
    });
    const cs = await L.cutScan(page, 'body');
    const issues = [];
    if(r.nf) issues.push('NOT-FOUND'); if(r.empty) issues.push('EMPTY'); if(r.noalt) issues.push('IMG-NO-ALT ' + r.noalt);
    if(r.und) issues.push('BAD-TEXT ' + r.und); if(cs.n) issues.push('CUT ' + cs.cut.slice(0, 3).join(' | ')); if(cs.hscroll > 0) issues.push('HSCROLL ' + cs.hscroll);
    if(page._errs.length) issues.push('JS ' + page._errs.slice(0, 2).join(' | '));
    if(issues.length){ bad.push({ h, issues }); console.log('ISSUE', w, h, issues.join(' ; ').slice(0, 400)); }
  }
  console.log(`\n${w}: crawled ${list.length} routes, ${bad.length} with issues`);
  fs.writeFileSync(L.OUT + '/c6-crawl-' + w + '.json', JSON.stringify({ list, bad }, null, 1));
  fs.appendFileSync(L.OUT + '/summary.log', `c6-crawl ${w}: ${list.length} routes, ${bad.length} with issues\n`);
  await browser.close();
})();
