/* Chunk 1a: demo controls hidden for visitors, shown with ?demo=1, never over the footer. */
const L = require('./lib');
(async () => {
  for(const w of [1366, 1920, 768, 393]){
    const vp = { width: w, height: w > 1000 ? (w === 1920 ? 1080 : 768) : (w === 768 ? 1024 : 852) };
    const { browser, page } = await L.start(vp, w === 393 ? { ctx: { isMobile: true, hasTouch: true } } : {});
    await page.goto('file://' + L.BUILD + '#/');
    await page.waitForTimeout(800);
    const v = await page.evaluate(() => ({ fab: !!document.querySelector('.demo-fab'), modal: !!document.querySelector('.modal, [role="dialog"]') && /Welcome to the EXTAS demo/.test(document.body.innerText) }));
    L.rec(!v.fab && !v.modal, w + ' visitor: no demo gear, no welcome box', v);
    await page.goto('file://' + L.BUILD + '?demo=1#/');
    await page.evaluate(() => { ST.seenIntro = true; saveState(); rerender(); });
    await page.waitForTimeout(400);
    const has = await page.evaluate(() => !!document.querySelector('.demo-fab'));
    L.rec(has, w + ' ?demo=1: demo gear shows');
    /* scroll to the very end and test overlap with every footer text box */
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => {
      const f = document.querySelector('.demo-fab'); if(!f) return { none: 1 };
      const r = f.getBoundingClientRect(), hits = [];
      document.querySelectorAll('footer *').forEach(el => {
        if(el.children.length && !/^(A|BUTTON|IMG|SVG)$/i.test(el.tagName)) return;
        const b = el.getBoundingClientRect(); if(!b.width || !b.height) return;
        if(b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top) hits.push((el.textContent || el.tagName).trim().slice(0, 40));
      });
      return { r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], hits };
    });
    L.rec(!o.hits || !o.hits.length, w + ' ?demo=1: gear covers nothing in the footer', o);
    if(w === 1366){ await page.screenshot({ path: L.OUT + '/demo-gear-footer-1366.png' }); }
    /* hide again */
    await page.evaluate(() => ACT['demo-hide']()); await page.waitForTimeout(300);
    await page.goto('file://' + L.BUILD + '#/'); await page.waitForTimeout(400);
    L.rec(!(await page.evaluate(() => !!document.querySelector('.demo-fab'))), w + ' Hide demo controls: gone after reload');
    L.rec(!page._errs.length, w + ' no JS errors', page._errs.slice(0, 3));
    await browser.close();
  }
  L.done('c1-demo');
})();
