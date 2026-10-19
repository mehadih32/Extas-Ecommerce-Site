// quick probe: node probe.js <html>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1280,height:800}}); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if(m.type()==='error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); });
  await pg.goto('file://' + path.resolve(process.argv[2]) + '#/'); await pg.waitForTimeout(500);
  await pg.evaluate(() => { ST.seenIntro = true; saveState(); closeModal(); });
  const r = await pg.evaluate(() => {
    const all = bfAll();
    return {n: all.length, posts: all.map(p => [p.slug, p.lang, p.pillar, p.sub, p.author, p.reviewer, !!p.bn, (p.products||[]).join('+'), (p.combos||[]).join('+'), p.tags.join(','), new Date(p.date).toISOString().slice(0,10), p.thin, p.demo].join(' | ')),
      ads: (ST.blogAds||[]).map(a => [a.id, a.type, a.slots.join('/'), (a.pillars||[]).join('/'), (a.posts||[]).join('/'), a.active, a.start, a.end, a.link, JSON.stringify(a.popup||null)].join(' | ')), set: ST.blogAdSettings, pillars: bfPillars().map(p=>p.id+':'+p.en),
      authors: bfAuthors().map(a=>a.id+':'+a.name+':'+a.reviewer)};
  });
  console.log(JSON.stringify(r, null, 1));
  for (const h of ['#/journal', '#/journal/how-to-wash-denim']) {
    await pg.evaluate(x => { location.hash = x; }, h); await pg.waitForTimeout(500);
    console.log(h, await pg.evaluate(() => ({h1: document.querySelectorAll('h1').length, ads: [...document.querySelectorAll('[data-bf-ad]')].map(e => e.dataset.bfSlot + '=' + e.dataset.bfAd), cards: document.querySelectorAll('.bf-card').length, title: document.title})));
  }
  console.log('errs', errs);
  await b.close();
})();
