// node check.js [shots]  — every server admin route × en/bn × widths: console errors, overflow, Bengali in English
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const FILE = '/tmp/claude-0/-home-claude/a27f8d4d-b57b-5d41-b919-c637e74e7368/scratchpad/proto/dist/EXTAS-demo.html';
const OUT = path.join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const SHOTS = process.argv.includes('shots');
const ROUTES = ['#/admin/server', '#/admin/cache', '#/admin/images', '#/admin/speed', '#/admin/integrations', '#/admin/backup', '#/admin/settings', '#/admin/health'];
const SIZES = [[1366, 900, false], [768, 1024, true], [393, 852, true], [360, 800, true]];
(async () => {
  const b = await chromium.launch();
  let fails = 0, n = 0;
  for (const [w, h, mob] of SIZES) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto('file://' + FILE + '#/'); await pg.waitForTimeout(400);
    for (const blob of [false, true]) {
      for (const lang of ['en', 'bn']) {
        await pg.evaluate(([l, bl]) => { ST.seenIntro = true; ST.adminLang = l; if (ST.srv) ST.srv.keys.blob.on = bl; saveState(); closeModal(); }, [lang, blob]);
        for (const r of ROUTES) {
          if (blob && !/backup|server|images/.test(r)) continue;
          errs.length = 0;
          await pg.evaluate(hh => { location.hash = '#/__x'; setTimeout(() => location.hash = hh, 30); }, r); await pg.waitForTimeout(450);
          const res = await pg.evaluate(() => {
            const de = document.documentElement, ov = de.scrollWidth - innerWidth;
            const BN = /[ঀ-৲৴-৿]/; const bad = [];
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
            while ((t = w.nextNode())) { const p = t.parentElement; if (!p || !BN.test(t.nodeValue)) continue; if (p.closest('[translate="no"],script,style')) continue; const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || !p.getClientRects().length) continue; bad.push(t.nodeValue.trim().slice(0, 60)); }
            const attrs = [...document.querySelectorAll('#app [placeholder],#app [aria-label],#app [title]')].filter(e => !e.closest('[translate="no"]')).map(e => (e.getAttribute('placeholder') || '') + (e.getAttribute('aria-label') || '') + (e.getAttribute('title') || '')).filter(x => BN.test(x));
            const wide = [...document.querySelectorAll('#app *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 && r.width > 0 && !e.closest('.zs-tabs,.admin-tabs,.tbl-wrap,[style*="overflow-x"]'); }).slice(0, 3).map(e => e.className || e.tagName);
            return { ov, bad: bad.slice(0, 5), nbad: bad.length, attrs: attrs.slice(0, 3), wide, h1: (document.querySelector('#app h1') || {}).textContent };
          });
          n++;
          const probs = [];
          if (errs.length) probs.push('console: ' + errs.slice(0, 2).join(' | '));
          if (res.ov > 0) probs.push('overflow ' + res.ov + 'px ' + res.wide.join(','));
          if (lang === 'en' && (res.nbad || res.attrs.length)) probs.push('bengali in EN: ' + JSON.stringify(res.bad.concat(res.attrs)));
          if (probs.length) { fails++; console.log('FAIL', w, lang, blob ? 'blob' : '', r, probs.join(' ; ')); }
          if (SHOTS && w !== 360 && !(r === '#/admin/settings' || r === '#/admin/health')) await pg.screenshot({ path: path.join(OUT, `${r.split('/').pop()}-${lang}-${w}${blob ? '-blob' : ''}.png`), fullPage: true });
        }
      }
    }
    // modals: restore picker, clear cache confirm, add key, test alert
    for (const lang of ['en', 'bn']) {
      await pg.evaluate(l => { ST.adminLang = l; ST.srv.keys.blob.on = true; saveState(); closeModal(); }, lang);
      const modals = [['#/admin/backup', '[data-act="zs-bk-restore"]', 'restore', async () => { await pg.click('.modal [data-k="pit"][data-v="minute"]'); await pg.waitForTimeout(150); }],
        ['#/admin/cache', '[data-act="zv-clear"]', 'clear', null], ['#/admin/integrations', '[data-act="zv-key-off"][data-k="blob"]', null, null],
        ['#/admin/integrations', '[data-act="zv-key-add"][data-k="blob"]', 'key', null], ['#/admin/server', '[data-act="zv-al-test"]', 'tgtest', null]];
      for (const [r, sel, nm, after] of modals) {
        errs.length = 0;
        await pg.evaluate(hh => { closeModal(); location.hash = '#/__x'; setTimeout(() => location.hash = hh, 30); }, r); await pg.waitForTimeout(450);
        await pg.click(sel); await pg.waitForTimeout(300); if (after) await after();
        if (!nm) continue;
        const res = await pg.evaluate(() => { const m = document.querySelector('.modal-back'); if (!m) return { none: true }; const BN = /[ঀ-৲৴-৿]/; return { bn: BN.test(m.innerText), ov: document.documentElement.scrollWidth - innerWidth, mw: (m.querySelector('.modal') || m).scrollWidth - (m.querySelector('.modal') || m).clientWidth }; });
        n++;
        const probs = []; if (res.none) probs.push('no modal'); if (errs.length) probs.push('console ' + errs[0]); if (lang === 'en' && res.bn) probs.push('bengali in EN modal'); if (res.ov > 0 || res.mw > 0) probs.push('modal overflow ' + res.ov + '/' + res.mw);
        if (probs.length) { fails++; console.log('FAIL modal', w, lang, nm, probs.join(' ; ')); }
        if (SHOTS && w !== 360) await pg.screenshot({ path: path.join(OUT, `modal-${nm}-${lang}-${w}.png`) });
      }
      await pg.evaluate(() => closeModal());
    }
    await ctx.close();
  }
  await b.close();
  console.log(`checks: ${n} · fails: ${fails}`);
})();
