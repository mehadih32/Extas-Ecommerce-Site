const { chromium, SETUPS, open, nav } = require('./lib');
const OUT = '/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/owner-fix/C/shots/sheet';
(async () => { const b = await chromium.launch(); const { ctx, pg } = await open(b, process.argv[2], 1366, 900, 0);
  for (const lang of ['en', 'bn']) {
    await pg.evaluate((l) => { ST.adminLang = l; saveState(); }, lang); await nav(pg, '#/admin/settings'); await pg.waitForTimeout(500);
    const e = await pg.$('#zs-g-ownc'); console.log(lang, !!e); if (e) { await e.scrollIntoViewIfNeeded(); await e.screenshot({ path: OUT + '/admin-ownc-' + lang + '.png' }); }
  }
  // change drawer style from the admin row, then check the shop follows
  const r = await pg.evaluate(() => { const s = zs_S('opt.atb.style'); s.set('B'); saveState(); return OPT('atb.style'); }); console.log('set via admin row ->', r);
  await nav(pg, '#/admin/combos?tab=fixed'); await pg.waitForTimeout(400);
  const sw = await pg.evaluate(() => !!document.querySelector('[data-act=acb-samecol]')); console.log('combo same-colour switch', sw);
  await pg.evaluate(() => { ST.adminLang = 'en'; saveState(); }); await nav(pg, '#/admin/combos?tab=fixed'); await pg.waitForTimeout(600); { const e = await pg.$('[data-act=acb-samecol]'); if (e) { const c = await pg.evaluateHandle(x => x.closest('.acb-card, .card, article') || x.parentElement.parentElement, e); await c.asElement().screenshot({ path: OUT + '/admin-samecol-en.png' }); } }
  console.log('en label', await pg.evaluate(() => { const b = document.querySelector('[data-act=acb-samecol]'); return b ? b.parentElement.textContent : ''; }));
  // analytics card
  await pg.evaluate(() => { ST.adminLang = 'en'; saveState(); }); await pg.evaluate(() => { EXTRACK.demo && EXTRACK.demo(60); const sid = 'qa-' + Date.now(); ['A','B','A'].forEach((st, i) => EXTRACK.log('atb_drawer_view', { style: st })); }); await nav(pg, '#/admin/analytics'); await pg.waitForTimeout(600);
  const a = await pg.$('[data-testid=an-atb]'); console.log('analytics card', !!a); if (a) { const s = await pg.evaluateHandle(e => e.closest('section'), a); await s.asElement().screenshot({ path: OUT + '/admin-analytics-atb.png' }); }
  // Bengali shop drawer
  await pg.evaluate(() => { ST.lang = 'bn'; ST.shopOpt['atb.style'] = 'B'; saveState(); }); await pg.evaluate(SETUPS.items(2)); await nav(pg, '#/p/contrast-collar-polo');
  await pg.evaluate(() => { const c = pdp_cur(); c.u.size = c.p.sizes.find(z => stockOf(c.p.id, c.u.color, z) > 0); ACT['pdp-add'](); }); await pg.waitForTimeout(500);
  await pg.screenshot({ path: OUT + '/a-drawerB-bn.png' }); await pg.evaluate(() => { closeModal(); ST.lang = 'en'; ST.shopOpt['atb.style'] = 'A'; saveState(); });
  console.log('errs', pg._errs); await b.close(); })();
