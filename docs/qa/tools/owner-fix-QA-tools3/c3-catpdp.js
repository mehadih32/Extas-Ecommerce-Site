/* Chunk 3: C1–C5 and P1–P6, P8 on the combined build, 1366 + 1920. */
const L = require('./lib');
const W = process.argv[2] ? [+process.argv[2]] : [1366, 1920];
const CATS = ['polos', 'tshirts', 'shirts', 'panjabi', 'trousers', 'hoodies'];
const PRODS = ['essential-pique-polo', 'classic-cotton-panjabi', 'heavyweight-hoodie', 'oxford-cotton-shirt'];
(async () => {
  for(const w of W){
    const vp = { width: w, height: w === 1920 ? 1080 : 768 };
    const { browser, page } = await L.start(vp);
    await L.open(page, '#/');
    const boxSig = [];
    for(const c of CATS){
      await L.go(page, '#/c/' + c, 700);
      const r = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('main .pcard, main [class*="pcard"]')].filter(e => e.getClientRects().length && /pcard\b|pcard /.test(e.className + ' '));
        const filt = !!document.querySelector('main [class*="filter"], main [data-act*="filter"], main .chips');
        const box = document.querySelector('main .cat-bn-std, main [class*="cat-bn"]');
        const faq = document.querySelector('main .cat-faq'), slot = document.querySelector('main .ob-slot');
        const slotTxt = slot ? slot.textContent.trim().slice(0, 60) : '';
        return { n: cards.length, filt, box: box ? box.className.split(' ')[0] : null, faq: !!faq, slot: !!slot && slot.getBoundingClientRect().height > 60, slotTxt, title: document.title };
      });
      const cs = await L.cutScan(page, 'main');
      L.rec(r.n >= 8 && r.filt && !!r.box, w + ' C3/C5 ' + c + ': filters, set box, ' + r.n + ' products', r);
      if(r.faq) L.rec(r.slot, w + ' C1 ' + c + ': FAQ side filled', r.slotTxt);
      L.rec(cs.n === 0 && cs.hscroll <= 0, w + ' ' + c + ': no cut text / sideways scroll', cs);
      boxSig.push(r.box);
      if(c === 'panjabi' && w === 1366){ await page.screenshot({ path: L.OUT + '/c-panjabi-1366.png' }); }
    }
    L.rec(new Set(boxSig).size === 1, w + ' C4 the same set box on every category', boxSig);
    for(const id of PRODS){
      await L.go(page, '#/p/' + id, 900);
      const r = await page.evaluate(() => {
        const img = document.querySelector('.pdp-page .pdp-gal .pimg, .pdp-page .pimg'); const ib = img ? img.getBoundingClientRect() : null;
        const thumbs = [...document.querySelectorAll('.pdp-thumb')].filter(e => e.getClientRects().length);
        const more = thumbs.some(t => /\+\d/.test(t.textContent));
        const care = !!document.querySelector('.ob-care') && /min|read/i.test((document.querySelector('.ob-care') || {}).textContent || '');
        const revs = [...document.querySelectorAll('.pdp-revlist > *')].filter(e => e.getClientRects().length).map(e => Math.round(e.getBoundingClientRect().height));
        const qh = !!document.querySelector('.ob-qh-f, .ob-qh-row');
        return { imgBottom: ib ? Math.round(ib.bottom) : -1, imgTop: ib ? Math.round(ib.top) : -1, vh: innerHeight, thumbs: thumbs.length, more, care, revs, qh };
      });
      L.rec(r.imgBottom > 0 && r.imgBottom <= r.vh, w + ' P1 ' + id + ': whole main photo in the first screen', { top: r.imgTop, bottom: r.imgBottom, vh: r.vh });
      L.rec(r.thumbs >= 2, w + ' P8 ' + id + ': thumbnails', { n: r.thumbs, more: r.more });
      L.rec(r.care, w + ' P2 ' + id + ': care article card with read time');
      if(r.revs.length > 1) L.rec(Math.max(...r.revs) - Math.min(...r.revs) <= 2, w + ' P3 ' + id + ': review cards equal height', r.revs);
      L.rec(r.qh, w + ' P4 ' + id + ': Q&A left is a size helper');
      if(id === 'essential-pique-polo') await page.screenshot({ path: L.OUT + '/p-first-' + w + '.png' });
      /* P5 bottom: one slider + grid of 4 */
      const low = await page.evaluate(() => {
        const secs = [...document.querySelectorAll('.pdp-page section, .pdp-page .pdp-row, .pdp-page [class*="rv-"]')];
        const heads = [...document.querySelectorAll('.pdp-page h2, .pdp-page .h2, .pdp-page .sec-t')].map(h => h.textContent.trim()).filter(Boolean);
        const grid = document.querySelector('.ob-rv-grid, [class*="rv-grid"], [class*="recent-grid"]');
        const gn = grid ? [...grid.children].filter(e => e.getClientRects().length).length : -1;
        return { heads: heads.slice(-8), gn };
      });
      L.rec(low.gn === 4, w + ' P5 ' + id + ': fixed grid of 4 at the bottom', low);
      /* P6 sticky bar */
      for(const y of [1400, 2200, 3000]){ await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(500); if(await page.evaluate(() => { const b = document.querySelector('.ob-bm'); return b && b.getBoundingClientRect().top >= 0 && b.getBoundingClientRect().bottom < 200 && b.getClientRects().length > 0; })) break; }
      const bar = await page.evaluate(() => {
        const b = document.querySelector('.ob-bm'); if(!b) return null;
        const bar = b.closest('[class*="sticky"], [class*="bar"]') || b;
        const br = b.getBoundingClientRect(); return { vis: b.getClientRects().length > 0 && br.top >= 0 && br.bottom < 200 && getComputedStyle(bar).visibility !== 'hidden' && +getComputedStyle(bar).opacity > 0.5, care: (document.querySelector('.ob-care') || {}).textContent, items: [...b.querySelectorAll('.ob-bm-i')].filter(e => e.getClientRects().length).map(e => e.textContent.trim().slice(0, 30)) };
      });
      L.rec(bar && bar.vis && bar.items.length >= 2, w + ' P6 ' + id + ': sticky bar middle filled', bar);
      if(id === 'essential-pique-polo') await page.screenshot({ path: L.OUT + '/p-bar-' + w + '.png', clip: { x: 0, y: 0, width: w, height: 140 } });
      const cs = await L.cutScan(page, 'body');
      L.rec(cs.n === 0 && cs.hscroll <= 0, w + ' ' + id + ': no cut text / sideways scroll', cs);
    }
    L.rec(!page._errs.length, w + ' no JS errors', page._errs.slice(0, 3));
    await browser.close();
  }
  L.done('c3-catpdp ' + W.join(','));
})();
