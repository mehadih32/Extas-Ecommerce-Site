const { chromium } = require('/opt/npm-tools/node_modules/playwright'); const path=require('path');
(async () => { const b = await chromium.launch(); const H = 'file://'+path.resolve(process.argv[2]);
  for (const [w,h,m,list] of [[320,640,1,[['#/admin/customers','crm-list-kpi','.zs-kpis'],['#/admin/customers/01712345678','crm-orders','.zr-ord'],['#/admin/customers/01712345678','crm-messages','.zr-msgs']]],[1280,800,0,[['#/admin/combos','combos-rules','.acb-g']]]]) {
    const pg = await (await b.newContext({viewport:{width:w,height:h}, isMobile:!!m, hasTouch:!!m, deviceScaleFactor:2})).newPage();
    await pg.goto(H+'#/'); await pg.waitForTimeout(400); await pg.evaluate(() => { localStorage.clear(); resetState(); ST.seenIntro = true; saveState(); closeModal(true); });
    for (const [r,n,sel] of list) { await pg.evaluate(x => { location.hash = x; }, r); await pg.waitForTimeout(600);
      await pg.evaluate(s => { document.querySelectorAll('.toast').forEach(t=>t.remove()); var e = document.querySelector(s); if(e){ e.scrollIntoView({block:'start'}); window.scrollBy(0,-80); } }, sel); await pg.waitForTimeout(300);
      await pg.screenshot({path:'admin-fit-'+n+'-'+w+'.png'}); }
  } await b.close(); })();
