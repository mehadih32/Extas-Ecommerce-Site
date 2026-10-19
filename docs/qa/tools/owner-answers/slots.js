const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const path=require('path');
(async () => { const b = await chromium.launch(); const pg = await (await b.newContext()).newPage(); const errs=[]; pg.on('pageerror', e=>errs.push(e.message));
  await pg.goto('file://'+path.resolve(process.argv[2])+'#/'); await pg.waitForTimeout(400);
  const r = await pg.evaluate(() => { localStorage.clear(); resetState(); delete ST.blogAds; var out = [], pil = zb_pillarsAll().map(p => p.id);
    ZB_SLOTS.forEach(s => { if(s[0]==='post-popup') return; var ctxs = /^post-|^cat-/.test(s[0]) ? pil.map(p => ({pillar:p})) : [{}];
      ctxs.forEach(c => { if(!zb_adsFor(s[0], c).length) out.push(s[0]+'/'+(c.pillar||'-')); }); });
    var views = zb_posts().filter(p => p.status==='published').map(p => [p.title, zb_href(p), !!hm_journalBySlug(zb_href(p).split("/")[2])]);
    return {empty:out, slots:ZB_SLOTS.map(s=>s[0]), bar:zb_ad('ad-bar-polos'), badView:views.filter(v => !v[2]).map(v => v[0]+' → '+v[1]).slice(0,5), nviews:views.length}; });
  console.log(JSON.stringify(r, null, 1)); console.log('errors', errs.slice(0,2)); await b.close(); })();
