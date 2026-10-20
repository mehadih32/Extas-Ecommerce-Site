/* admin English mode: toggles whose toast was written in Bengali must read in English */
const L = require('./lib');
(async () => {
  const { browser, page } = await L.start({ width: 1366, height: 900 });
  await L.open(page, '#/', 'ST.adminLang="en";');
  await L.go(page, '#/admin/combos?tab=fixed', 900);
  const btns = await page.$$('[data-act="acb-samecol"]');
  L.rec(btns.length > 0, 'same-colour switches found', btns.length);
  for(let i = 0; i < 2 && btns.length; i++){
    const b = (await page.$$('[data-act="acb-samecol"]'))[0];
    await b.click(); await page.waitForTimeout(300);
    const t = await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
    L.rec(t && !/[ঀ-৿]/.test(t), 'English toast after same-colour switch #' + (i + 1), t);
  }
  const bn = await page.evaluate(() => { const out = []; const w = document.createTreeWalker(document.querySelector('.admin-main') || document.body, NodeFilter.SHOW_TEXT); let n; while((n = w.nextNode())) if(/[ঀ-৿]/.test(n.textContent) && n.parentElement.getClientRects().length && !n.parentElement.closest('[lang="bn"]')) out.push(n.textContent.trim().slice(0, 60)); return out.slice(0, 6); });
  L.rec(!bn.length, 'no Bengali on the combos page in English mode', bn);
  L.rec(!page._errs.length, 'no JS errors', page._errs.slice(0, 3));
  await browser.close(); L.done('c5-toast');
})();
