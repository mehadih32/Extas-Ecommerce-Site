/* Chunk 2: owner items H1–H14 on the combined build at 1366 and 1920 (one browser per width). */
const L = require('./lib');
const BEFORE = L.S + '/owner-fix/A/before.html';
const W = process.argv[2] ? [+process.argv[2]] : [1366, 1920];
async function hero(page){
  return page.evaluate(() => {
    const h = document.querySelector('.hm-hero'); if(!h) return null;
    const t = h.querySelector('.hm-hero-txt'), m = h.querySelector('.hm-hero-media');
    const r = el => { if(!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
    const btns = [...h.querySelectorAll('.hm-hero-btns a, .hm-hero-btns button')].map(r);
    const trust = [...h.querySelectorAll('.hm-hero-trust > *')].map(e => Object.assign(r(e), { tx: e.textContent.trim() }));
    /* the coloured board: the element behind the text with a background colour */
    let board = null; [h, ...h.querySelectorAll('*')].some(e => { const cs = getComputedStyle(e); if(e !== t && !e.closest('.hm-hero-media') && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && e.getBoundingClientRect().width > 200 && !/btn/.test(e.className)) { board = Object.assign(r(e), { cls: String(e.className).slice(0, 40) }); return true; } });
    return { txt: r(t), media: r(m), board, btns, trust };
  });
}
(async () => {
  for(const w of W){
    const vp = { width: w, height: w === 1920 ? 1080 : 768 };
    const { browser, page } = await L.start(vp);
    /* H1 needs the before build: text where it was, board/media moved 110–115 px right */
    await page.goto('file://' + BEFORE + '#/'); await page.evaluate(() => { ST.seenIntro = true; saveState(); rerender(); }); await page.waitForTimeout(600);
    const hb = await hero(page);
    await L.open(page, '#/'); await page.evaluate(() => rerender()); await page.waitForTimeout(700);
    const ha = await hero(page);
    if(hb && ha){
      const dt = ha.txt.l - hb.txt.l, dm = ha.media && hb.media ? ha.media.l - hb.media.l : null;
      L.rec(Math.abs(dt) <= 2, w + ' H1 hero text stays where it starts', { before: hb.txt.l, after: ha.txt.l });
      L.rec('info', w + ' H1 hero geometry', { boardBefore: hb.board, boardAfter: ha.board, mediaBefore: hb.media, mediaAfter: ha.media, dMedia: dm });
      /* H2 */
      if(ha.btns.length >= 2){ const gap = ha.btns[1].l - ha.btns[0].r; L.rec(gap >= 12, w + ' H2 gap between the two hero buttons', gap + ' px'); }
      L.rec(ha.trust.length >= 2 && ha.trust.every(x => x.t > Math.max(...ha.btns.map(b => b.t))), w + ' H2 trust lines sit under the buttons', ha.trust.map(x => x.tx));
      if(ha.trust.length >= 2 && ha.btns.length >= 2){
        const al = ha.trust.slice(0, 2).map((x, i) => Math.abs(x.l - ha.btns[i].l));
        L.rec(al.every(a => a <= 24), w + ' H2 each line under its button (left edges within 24 px)', al);
      }
      L.rec(ha.trust.some(x => /72/.test(x.tx) && x.tx.length > 16), w + ' H2 72-hour line longer', ha.trust.map(x => x.tx));
    } else L.rec(false, w + ' H1/H2 hero found', { hb: !!hb, ha: !!ha });
    await page.screenshot({ path: L.OUT + '/h-hero-' + w + '.png' });
    /* H3 + H4 header */
    const hd = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.nav-d .nav-i, .hdr .nav-i')].filter(a => a.getClientRects().length && !a.hidden).map(a => a.textContent.trim());
      const fj = [...document.querySelectorAll('footer a')].filter(a => /journal|blog/i.test(a.textContent + a.getAttribute('href')));
      const lg = document.querySelector('.hdr .logo'); const fs = lg ? parseFloat(getComputedStyle(lg).fontSize) : 0;
      return { items, journalInHeader: items.some(t => /journal|blog/i.test(t)), footerJournal: fj.map(a => ({ t: a.textContent.trim(), hl: a.className })), logoFs: fs, logoH: lg ? Math.round(lg.getBoundingClientRect().height) : 0 };
    });
    L.rec(!hd.journalInHeader, w + ' H3 no Journal in the desktop header', hd.items);
    L.rec(hd.footerJournal.length > 0 && hd.footerJournal.some(x => /hl/.test(x.hl)), w + ' H3 highlighted Journal link in the footer', hd.footerJournal);
    L.rec(hd.items.length <= 11, w + ' H4 header menu count', hd.items.length + ' items');
    L.rec('info', w + ' H5 wordmark size', { fs: hd.logoFs, h: hd.logoH });
    /* H6 dropdown: hover Polos, measure panel */
    const navs = await page.$$('.nav-d .nav-i[data-mega], .hdr .nav-i[data-mega]');
    let dd = null;
    for(const n of navs){
      const id = await n.getAttribute('data-nav'); if(id === 'more' || id === 'new') continue;
      await n.hover(); await page.waitForTimeout(500);
      dd = await page.evaluate(() => {
        const p = [...document.querySelectorAll('.mega, [class*="mega"]')].find(e => e.getClientRects().length && e.getBoundingClientRect().height > 40 && getComputedStyle(e).visibility !== 'hidden');
        if(!p) return null; const b = p.getBoundingClientRect(); return { cls: String(p.className).slice(0, 60), w: Math.round(b.width), h: Math.round(b.height), l: Math.round(b.left) };
      });
      if(dd){ dd.nav = id; break; }
    }
    L.rec(dd && dd.w < vp.width * 0.6, w + ' H6 compact dropdown under the item (not full screen)', dd);
    if(dd) await page.screenshot({ path: L.OUT + '/h-dropdown-' + w + '.png', clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 560) } });
    await page.mouse.move(5, vp.height - 5); await page.waitForTimeout(500);
    /* H7 + H10 sets block */
    const sets = await page.evaluate(() => {
      const tall = document.querySelector('.hm-sets-tall'); if(!tall) return null;
      const g = tall.parentElement, kids = [...g.children].filter(e => e.getClientRects().length);
      const tb = tall.getBoundingClientRect();
      const others = kids.filter(k => k !== tall).map(k => k.getBoundingClientRect());
      const rows = [...new Set(others.map(b => Math.round(b.top)))];
      const price = tall.querySelector('[class*="price"], b, strong'); const pcs = price ? getComputedStyle(price) : null;
      return { n: others.length, rows: rows.length, tallH: Math.round(tb.height), cardH: others[0] ? Math.round(others[0].height) : 0, tallText: tall.textContent.trim().slice(0, 80), price: pcs ? { c: pcs.color, fw: pcs.fontWeight } : null };
    });
    L.rec(sets && sets.n === 6 && sets.rows === 2 && sets.tallH > sets.cardH * 1.8, w + ' H7 3+3 sets with a tall Build-your-own tile across both rows', sets);
    L.rec(sets && sets.price && +sets.price.fw >= 600, w + ' H10 Build-your-own prices highlighted', sets && sets.price);
    const setsEl = await page.$('.hm-sets-tall'); if(setsEl){ await setsEl.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: L.OUT + '/h-sets-' + w + '.png' }); }
    /* H8 finder tiles from data; H11 look; H12 journal */
    const misc = await page.evaluate(() => {
      const look = document.querySelector('.hm-look');
      const q = s => look && look.querySelector(s);
      const st = el => el ? (c => ({ fs: c.fontSize, fw: c.fontWeight, col: c.color }))(getComputedStyle(el)) : null;
      const jr = document.querySelector('#hm-jtrack');
      const jc = jr ? [...jr.children].filter(e => e.getClientRects().length) : [];
      const arrows = jr ? [...jr.closest('section').querySelectorAll('button')].filter(b => /prev|next|left|right|arrow/i.test(b.className + b.getAttribute('aria-label')) && b.getClientRects().length).length : -1;
      const jt = jc.map(c => (c.querySelector('.hm-art-t') || c).textContent.trim());
      return { lookName: st(q('.hm-look-n')), lookPrice: st(q('.hm-look-p')), lookTot: st(q('.hm-look-tot')), lookSave: st(q('.hm-look-save')), lookStrike: st(q('s, del, .strike')),
        jn: jc.length, arrows, jt, jdup: jt.length !== new Set(jt).size, jsameRow: new Set(jc.map(c => Math.round(c.getBoundingClientRect().top))).size };
    });
    L.rec('info', w + ' H11 shop-the-look styles', { n: misc.lookName, p: misc.lookPrice, tot: misc.lookTot, save: misc.lookSave, strike: misc.lookStrike });
    L.rec(misc.lookStrike ? /rgb\((1[5-9]\d|2\d\d), ?\d{1,2}\d?, ?\d/.test(misc.lookStrike.col) : false, w + ' H11 struck price is red', misc.lookStrike);
    L.rec(misc.jn === 4 && misc.arrows === 0 && misc.jsameRow === 1 && !misc.jdup, w + ' H12 journal: 4 fixed posts, no arrows, no duplicates', { n: misc.jn, arrows: misc.arrows, rows: misc.jsameRow, titles: misc.jt });
    /* H13 footer */
    const ft = await page.evaluate(() => {
      const f = document.querySelector('footer'); if(!f) return null;
      const soc = [...f.querySelectorAll('.fdr-soc > *')].map(e => ({ t: e.textContent.trim(), svg: !!e.querySelector('svg'), link: e.tagName === 'A' }));
      const cod = f.querySelector('.fdr-pm.pm-cod, [class*="cod"]');
      return { soc, cod: !!cod };
    });
    L.rec(ft && ft.soc.length >= 3 && ft.soc.every(s => s.svg), w + ' H13 footer social icons are there', ft && ft.soc);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(400);
    await page.screenshot({ path: L.OUT + '/h-footer-' + w + '.png' });
    const fc = await L.cutScan(page, 'footer');
    L.rec(fc.n === 0, w + ' H13 footer: no cut text', fc.cut);
    /* H14 / K10 join: Bengali digits + +880 cleaned and accepted; 1 digit refused */
    const j = await page.evaluate(async () => {
      const f = document.querySelector('form[data-submit="join"]'); if(!f) return null;
      const inp = f.querySelector('input[type="tel"]'), out = [];
      for(const v of ['১', '+880 1712-345678', '০১৭১২৩৪৫৬৭৮', '8801712345678', '01212345678']){
        inp.value = v; f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 120));
        const m = f.querySelector('.fdr-msg'); out.push({ v, val: inp.value, msg: m ? m.textContent : '', bad: inp.getAttribute('aria-invalid') === 'true' });
      }
      return out;
    });
    if(j){
      L.rec(j[0].bad, w + ' H14 join refuses a 1-digit number', j[0]);
      L.rec(!j[1].bad && !j[2].bad && !j[3].bad, w + ' H14 join accepts +880 / Bengali digits / 880 (cleaned)', j.slice(1, 4));
      L.rec(j[4].bad, w + ' H14 join refuses 012… (not 01[3-9])', j[4]);
    } else L.rec(false, w + ' H14 join form found');
    /* page-wide */
    await page.evaluate(() => window.scrollTo(0, 0));
    const cs = await L.cutScan(page, 'main');
    L.rec(cs.n === 0 && cs.hscroll <= 0, w + ' home: no cut text, no sideways scroll', cs);
    L.rec(!page._errs.length, w + ' home: no JS errors', page._errs.slice(0, 3));
    await browser.close();
  }
  L.done('c2-home ' + W.join(','));
})();
