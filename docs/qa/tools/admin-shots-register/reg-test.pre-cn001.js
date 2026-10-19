// PR 594 register — click-through + AUTO ADJUST gate (Prohori A360-02)
// usage: NODE_PATH=/opt/npm-tools/node_modules node reg-test.js <html> <outdir> [--sweep]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const [HTML, OUT, ...FLAGS] = process.argv.slice(2);
let fails = 0; const log = (ok, m) => { if (!ok) fails++; console.log((ok ? '  ok   ' : '  FAIL ') + m); };
const URL0 = 'file://' + path.resolve(HTML);

/* measure one screen: sideways scroll, h1 count, small taps, things past the right edge */
const MEASURE = () => {
  const vw = innerWidth, out = {sw: document.documentElement.scrollWidth, vw, h1: document.querySelectorAll('h1').length, small: [], wide: [], err: /Something went wrong|Page not found/.test(document.getElementById('app').innerText)};
  const scope = document.querySelectorAll('.zg-page, .zg-panel');
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  scope.forEach(root => {
    root.querySelectorAll('a[href], button, input:not([type=checkbox]):not([type=radio]), select, textarea, summary, label.zg-chk, .zg-pri-o').forEach(e => {
      if (!vis(e)) return;
      if (e.closest('p, td, th, li, .zg-mh, .zg-tlb, .zs-note, .zs-li .t, .zg-evb, .zg-mini, .zg-tx, .zg-specx, .zg-dbn')) return;   // inline text links
      if (e.closest('.zg-pri-o') && e.tagName === 'INPUT') return;
      const r = e.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) out.small.push((e.className || e.tagName).toString().slice(0, 40) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + (e.textContent || '').trim().slice(0, 20) + '"');
    });
    root.querySelectorAll('*').forEach(e => {
      if ((e.parentElement && e.parentElement.closest('.zg-ell, .zg-ell2'))) return;   // clipped by design (ellipsis)
      const r = e.getBoundingClientRect();
      if (r.width && r.right > vw + 1 && vis(e)) out.wide.push((e.className || e.tagName).toString().slice(0, 30) + ' r=' + Math.round(r.right));
    });
  });
  out.small = out.small.slice(0, 8); out.wide = out.wide.slice(0, 6);
  return out;
};

(async () => {
  const b = await chromium.launch();
  const VPS = [{n:'1280', w:1280, h:800, m:0}, {n:'393', w:393, h:852, m:1}, {n:'820-tablet', w:820, h:1180, m:1}];
  for (const vp of VPS) {
    console.log('== ' + vp.n);
    const dir = path.join(OUT, vp.n); fs.mkdirSync(dir, {recursive: true});
    const ctx = await b.newContext({viewport: {width: vp.w, height: vp.h}, isMobile: !!vp.m, hasTouch: !!vp.m, deviceScaleFactor: 1, acceptDownloads: true});
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); });
    await pg.goto(URL0 + '#/'); await pg.waitForTimeout(400);
    await pg.evaluate(() => { localStorage.clear(); location.reload(); }); await pg.waitForTimeout(600);
    await pg.evaluate(() => { ST.seenIntro = true; ST.adminLang = 'bn'; saveState(); closeModal(); }   /* PR 503: Bengali labels */);
    const go = async h => { await pg.evaluate(() => { location.hash = '#/admin/orders'; }); await pg.waitForTimeout(150); await pg.evaluate(x => { location.hash = x; }, h); await pg.waitForTimeout(350); };
    const shot = async (n, full) => pg.screenshot({path: path.join(dir, n + '.png'), fullPage: !!full});
    const gate = async label => { const r = await pg.evaluate(MEASURE); log(!r.err && r.sw <= r.vw && r.h1 === 1 && !r.small.length && !r.wide.length, label + ' · sw ' + r.sw + '/' + r.vw + ' · h1 ' + r.h1 + (r.small.length ? ' · small: ' + r.small.join(' | ') : '') + (r.wide.length ? ' · wide: ' + r.wide.join(' | ') : '')); };
    const tap = async loc => { await loc.scrollIntoViewIfNeeded(); if (vp.m) await loc.tap(); else await loc.click(); await pg.waitForTimeout(300); };

    /* 0 — the sidebar / tab link carries the unseen counter before the page is opened */
    await go('#/admin/orders');
    const badge = await pg.evaluate(() => { const a = [...document.querySelectorAll('a[href="#/admin/register"]')].filter(e => e.offsetParent); return a.map(e => (e.querySelector('.zg-sbadge') || {}).textContent || '').join(','); });
    log(/[০-৯]/.test(badge), 'admin link shows the unseen counter (' + badge + ')');

    /* 1 — the page: totals + one h1 */
    await go('#/admin/register');
    const tot = await pg.evaluate(() => [...document.querySelectorAll('.zg-k .v')].map(e => e.textContent).join(' '));
    const hdr = await pg.evaluate(() => { const h = (REGISTER && (REGISTER.header || REGISTER.totals)) || {}; return {prs: h.prs || h.total || (REGISTER.prs||[]).length, built: h.built}; });
    const toBn = x => String(x).replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[d]);
    log(/২৮/.test(tot) && tot.indexOf(toBn(hdr.prs)) >= 0 && (!hdr.built || tot.indexOf(toBn(hdr.built)) >= 0), 'totals follow the register header ('+hdr.prs+' / '+hdr.built+'): ' + tot);
    const bell = await pg.locator('.zg-bell .zg-badge').count(); log(bell === 1, 'header bell shows the counter at open');
    await shot('01-register'); await gate('register page');
    const badge2 = await pg.evaluate(() => [...document.querySelectorAll('a[href="#/admin/register"] .zg-sbadge')].length);
    log(badge2 === 0, 'counter is cleared on the link once the page is opened');

    /* 2 — open a stage */
    await tap(pg.locator('.zg-sh[data-c=S03]'));
    const rows = await pg.locator('#zg-sb-S03 .zg-row').count();
    log(rows === 22, 'S03 opens with its PR table (' + rows + ' rows)');
    await pg.locator('#zg-s-S03').scrollIntoViewIfNeeded(); await shot('02-stage-S03'); await gate('stage open');

    /* 3 — open a PR from the table, then close back to the list */
    await tap(pg.locator('#zg-sb-S03 a.zg-row[href="#/admin/register/pr/571"]'));
    let h = await pg.evaluate(() => location.hash); log(h === '#/admin/register/pr/571', 'PR row opens the PR card (' + h + ')');
    const secs = await pg.evaluate(() => [...document.querySelectorAll('.zg-panel .zg-psec h3')].map(e => e.textContent));
    log(['পুরো লেখা', 'পরে যোগ হওয়া অংশ', 'মালিকের সিদ্ধান্ত', 'যে PR-গুলোর সাথে যুক্ত', 'ইতিহাস'].every(s => secs.some(x => x.indexOf(s) === 0)) && secs.some(x => /Report a problem/.test(x)), 'card sections: ' + secs.join(' / '));
    log(await pg.locator('.zg-panel a:has-text("ডেমোতে দেখুন")').count() >= 1, 'card has "ডেমোতে দেখুন"');
    const pw = await pg.evaluate(() => { const r = document.querySelector('.zg-panel').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; });
    log(vp.w >= 900 ? pw[0] > 0 : pw[0] === 0 && pw[1] === vp.w, 'panel is ' + (vp.w >= 900 ? 'a side panel' : 'full screen') + ' (' + pw.join(',') + ')');
    await shot('03-pr-571'); await gate('PR card 571');
    await tap(pg.locator('.zg-panel .zg-rel').first());
    h = await pg.evaluate(() => location.hash); log(/\/pr\/\d+$/.test(h) && h !== '#/admin/register/pr/571', 'aligned PR link opens another card (' + h + ')');
    await tap(pg.locator('.zg-panel button[data-act=zg-close]').first()); await pg.waitForTimeout(300);
    h = await pg.evaluate(() => location.hash); log(h === '#/admin/register', 'close steps back to the list (' + h + ')');
    log(await pg.locator('#zg-sb-S03').count() === 1, 'the open stage is still open after close');

    /* 4 — search "combo" (focus stays) */
    await pg.locator('#zg-q').scrollIntoViewIfNeeded();
    await pg.locator('#zg-q').click(); await pg.keyboard.type('combo', {delay: 30}); await pg.waitForTimeout(250);
    const sr = await pg.evaluate(() => ({n: document.querySelectorAll('#zg-res .zg-row').length, c: (document.querySelector('.zg-rcount') || {}).textContent, f: document.activeElement && document.activeElement.id, t: [...document.querySelectorAll('#zg-res .zg-tt')].slice(0, 3).map(e => e.textContent)}));
    log(sr.n > 10 && sr.f === 'zg-q', 'search "combo": ' + sr.c + ' · focus kept · ' + sr.t.join(' | '));
    await shot('04-search-combo'); await gate('search');
    const bn = await pg.evaluate(() => { const u = zg_u(); u.q = 'কম্বো'; return zg_list().filter(P => zg_match(P, u)).length; });
    log(bn === 22, 'Bengali search "কম্বো" finds the S03 PRs (' + bn + ')');
    const n594 = await pg.evaluate(() => { const u = zg_u(); u.q = '594'; return zg_list().filter(P => zg_match(P, u)).map(P => P.n).join(','); });
    log(n594 === '594', 'number search "594" finds exactly PR 594');
    await pg.evaluate(() => { const u = zg_u(); u.q = ''; });

    /* 5 — filter by agent */
    await pg.locator('#zg-q').fill(''); await pg.dispatchEvent('#zg-q', 'input');
    await pg.selectOption('select[data-k=agent]', 'tirondaj'); await pg.waitForTimeout(250);
    const fa = await pg.evaluate(() => ({n: document.querySelectorAll('#zg-res .zg-row').length, want: zg_list().filter(P => (P.own || []).indexOf('tirondaj') >= 0 || (P.also || []).indexOf('tirondaj') >= 0).length}));
    log(fa.n > 0 && fa.n === Math.min(fa.want, 60), 'agent filter Tirondaj: ' + fa.n + ' rows (expected ' + fa.want + ')');
    await shot('05-filter-tirondaj'); await gate('agent filter');
    await pg.selectOption('select[data-k=status]', 'parked'); await pg.waitForTimeout(200);
    log(await pg.locator('#zg-res .zg-row').count() === 0, 'Tirondaj + parked = nothing (honest empty state)');
    await tap(pg.locator('button[data-act=zg-clear]'));
    await pg.selectOption('select[data-k=status]', 'parked'); await pg.waitForTimeout(200);
    log(await pg.locator('#zg-res .zg-row').count() === 6, 'status filter "parked" = 6');
    await pg.check('input[data-k=dec]'); await pg.waitForTimeout(150);
    await tap(pg.locator('button[data-act=zg-clear]'));

    /* 6 — report a problem on a PR */
    await go('#/admin/register/pr/550');
    await pg.locator('#zg-what').scrollIntoViewIfNeeded();
    await pg.fill('#zg-what', 'Gabtoli Bogura shows the Dhaka charge on a phone');
    await tap(pg.locator('.zg-pri-o:has(input[value=high])'));
    await shot('06-report-form');
    await tap(pg.locator('form[data-submit=zg-report] button[type=submit]'));
    const rep = await pg.evaluate(() => { const x = ST.prIssues[0] || {}; const t = (typeof za_prof === 'function' && x.agent) ? za_prof(x.agent).tasks.filter(t => /^PR 550:/.test(t.title)).length : -1; const tg = ((ST.za || {}).tg || []).filter(m => /PR 550/.test(m.text)).length; return {n: ST.prIssues.length, ag: x.agent, pri: x.pri, task: t, tg}; });
    log(rep.n === 1 && rep.pri === 'high' && rep.task === 1 && rep.tg === 1, 'problem saved (ST.prIssues ' + rep.n + ', ' + rep.pri + ') → assigned to ' + rep.ag + ' via Gyani, on its task list (' + rep.task + '), Telegram preview (' + rep.tg + ')');
    log(await pg.locator('.zg-panel .zg-isli').count() === 1, 'the problem shows on the PR card');
    await shot('07-report-done'); await gate('PR card after report');

    /* 7 — reported problems tab */
    await go('#/admin/register?tab=issues');
    log(await pg.locator('.zg-isli').count() === 1, 'Reported problems tab lists it');
    await tap(pg.locator('button[data-act=zg-ist][data-v=doing]'));
    log(await pg.evaluate(() => ST.prIssues[0].st) === 'doing', 'status → কাজ চলছে');
    await shot('08-issues'); await gate('issues tab');

    /* 8 — What's new */
    await go('#/admin/register?tab=new');
    const wn = await pg.evaluate(() => document.querySelector('.zg-body').innerText);
    log(/PR 594 যোগ হলো/.test(wn) && /PR 570 যোগ হলো/.test(wn) && /PR 571-এ নতুন অংশ যোগ হলো/.test(wn), 'What\'s new has PR 570–594 and the 571 update');
    log(/জ্ঞানী রিভিউ/.test(wn), 'Gyani review list shows');
    const tg = await pg.evaluate(() => ((ST.za || {}).tg || []).filter(m => /^📚 Register update/.test(m.text)).length);
    log(tg === 1, 'Telegram preview carries one "📚 Register update"');
    await shot('09-whats-new'); await gate('what\'s new');
    await tap(pg.locator('button[data-act=zg-rv][data-v=merge]').first());
    log(await pg.evaluate(() => za_prof('gyani').tasks.filter(t => /^Register: PR/.test(t.title)).length) === 1, '"জ্ঞানীকে দিন" puts the merge question on Gyani\'s list');

    /* 9 — range-only PR: details from the specification */
    await go('#/admin/register/pr/400');
    log(await pg.locator('.zg-specbox:has-text("Details in the specification")').count() === 1, 'PR 400 (no own row) shows "Details in the specification"');
    await shot('10-pr-400'); await gate('PR 400');
    await go('#/admin/register/pr/591');
    const rel = await pg.locator('.zg-panel .zg-psec:has(h3:text-is("সম্পর্কিত PR")) a.chip').count();
    log(rel >= 2, 'PR 591 lists related PRs as links (' + rel + ')');

    /* 10 — direct link in a fresh page: open, then close to the list */
    const pg2 = await ctx.newPage(); pg2.on('pageerror', e => errs.push(e.message));
    await pg2.goto(URL0 + '#/admin/register/pr/593'); await pg2.waitForTimeout(700);
    await pg2.evaluate(() => closeModal && closeModal());
    const t593 = await pg2.evaluate(() => (document.getElementById('zg-pt') || {}).textContent || '');
    log(/Blog writing team/.test(t593), 'direct link #/admin/register/pr/593 opens the card (' + t593.slice(0, 40) + ')');
    await pg2.screenshot({path: path.join(dir, '11-direct-593.png')});
    await pg2.locator('.zg-panel button[data-act=zg-close]').first().click(); await pg2.waitForTimeout(350);
    log(await pg2.evaluate(() => location.hash) === '#/admin/register', 'close on a shared link lands on the list');
    await pg2.close();

    /* 11 — blueprint & files */
    await go('#/admin/register?tab=docs');
    const nd = await pg.locator('.zg-dc').count(); log(nd >= 14, 'Blueprint & files lists ' + nd + ' files');
    log(await pg.locator('.zg-dc:has-text("EXTAS-ECOMMERCE-V1.md") .zg-new').count() === 1, 'V1 marked সর্বশেষ / latest');
    await shot('12-docs'); await gate('docs tab');
    const tr0 = Date.now(); await tap(pg.locator('.zg-dc:has-text("EXTAS-ECOMMERCE-V1.md") a:has-text("পড়ুন")'));
    await pg.waitForSelector('#zg-md h3', {timeout: 8000}); console.log('       reader ready in ' + (Date.now() - tr0) + ' ms');
    log(await pg.locator('#zg-md .zg-mh').count() > 200, 'reader renders headings (' + await pg.locator('#zg-md .zg-mh').count() + ')');
    log(await pg.locator('#zg-md table').count() > 10, 'reader renders tables');
    await pg.fill('input[data-input=zg-dq]', 'courier sticker'); await pg.dispatchEvent('input[data-input=zg-dq]', 'input'); await pg.waitForTimeout(250);
    const hits = await pg.locator('.zg-hit').count(); log(hits > 0, 'in-document search "courier sticker": ' + hits + ' sections');
    await tap(pg.locator('.zg-hit').first());
    await pg.waitForTimeout(700);
    const jumped = await pg.evaluate(() => ({h: location.hash, y: scrollY}));
    log(/\?h=/.test(jumped.h) && jumped.y > 300, 'hit jumps to the section and the address carries ?h= (' + jumped.h.slice(-40) + ')');
    await shot('13-reader'); await gate('reader');
    if (vp.n === '1280') {
      const [dl] = await Promise.all([pg.waitForEvent('download', {timeout: 6000}).catch(() => null), pg.locator('button[data-act=zg-dl]').first().click()]);
      const fn = dl ? dl.suggestedFilename() : ''; let size = 0;
      if (dl) { const p = path.join(dir, fn); await dl.saveAs(p); size = fs.statSync(p).size; }
      log(fn === 'EXTAS-ECOMMERCE-V1.md' && size > 100000, 'download (.md) works in a normal browser: ' + fn + ' ' + size + ' bytes');
    }
    /* spec link from a PR card */
    await go('#/admin/register/pr/342');
    await tap(pg.locator('.zg-panel a:has-text("নির্দেশিকায় দেখুন")'));
    await pg.waitForTimeout(300);
    const sp = await pg.evaluate(() => ({h: location.hash, f: !!document.querySelector('.zg-flash, #zg-md')}));
    log(/\/doc\/extas-ecommerce-v1\?h=/.test(sp.h), 'PR card → spec section (' + sp.h + ')');

    log(!errs.length, 'no JS errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' ;; ') : ''));
    await ctx.close();
  }

  /* width sweep 320 → 1440 */
  console.log('== sweep');
  const W = [320, 360, 375, 393, 430, 768, 820, 1024, 1180, 1280, 1440];
  const R = ['#/admin/register', '#/admin/register@@S03', '#/admin/register?tab=new', '#/admin/register?tab=issues', '#/admin/register?tab=docs', '#/admin/register/pr/571', '#/admin/register/pr/400', '#/admin/register/pr/591', '#/admin/register/doc/extas-ecommerce-v1', '#/admin/register/doc/master-register'];
  const sdir = path.join(OUT, 'sweep'); fs.mkdirSync(sdir, {recursive: true});
  for (const w of W) {
    const m = w < 1024;
    const ctx = await b.newContext({viewport: {width: w, height: m ? 860 : 900}, isMobile: m, hasTouch: m});
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(URL0 + '#/'); await pg.waitForTimeout(400);
    await pg.evaluate(() => { ST.seenIntro = true; ST.adminLang = 'bn'; saveState(); closeModal(); }   /* PR 503: Bengali labels */);
    let bad = [];
    for (const r of R) {
      const [hash, act] = r.split('@@');
      await pg.evaluate(() => { location.hash = '#/admin/orders'; }); await pg.waitForTimeout(100);
      await pg.evaluate(x => { location.hash = x; }, hash); await pg.waitForTimeout(250);
      if (act) { await pg.evaluate(c => { const u = zg_u(); u.open[c] = true; rerender(); }, act); await pg.waitForTimeout(150); }
      const x = await pg.evaluate(MEASURE);
      if (x.err || x.sw > x.vw || x.h1 !== 1 || x.small.length || x.wide.length) bad.push(r + ' → sw ' + x.sw + ' h1 ' + x.h1 + ' ' + x.small.join('|') + ' ' + x.wide.join('|'));
      if ([320, 820, 1440].indexOf(w) >= 0 && /register(\?tab=new)?$|pr\/571|doc\/extas/.test(hash) && !act) await pg.screenshot({path: path.join(sdir, w + '-' + hash.replace(/[^\w]+/g, '_') + '.png')});
    }
    log(!bad.length && !errs.length, w + 'px: ' + R.length + ' screens' + (bad.length ? ' · ' + bad.join(' ;; ') : '') + (errs.length ? ' · JS ' + errs[0] : ''));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? 'FAILED: ' + fails : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})();
