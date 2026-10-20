// Independent-style QA matrix for bag + checkout + drawer. node qa.js <html> <outdir>
const { chromium, SETUPS, open, nav } = require('./lib'); const fs = require('fs');
const [html, OUT] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
let bad = 0, n = 0; const issues = []; const ok = (c, m) => { n++; if (!c) { bad++; issues.push(m); } };
const opt = (o) => `(()=>{ ST.shopOpt = Object.assign(ST.shopOpt||{}, ${JSON.stringify(o)}); saveState(); })()`;
const AUDIT = (scope) => `(()=>{
  const out = []; const W = innerWidth;
  if (document.documentElement.scrollWidth > W + 1) out.push('page scrolls sideways ' + document.documentElement.scrollWidth + '>' + W);
  const root = document.querySelector(${JSON.stringify(scope)}); if (!root) return ['scope missing ${scope}'];
  const vis = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  root.querySelectorAll('*').forEach(e => {
    if (!vis(e) || e.closest('.sr,.pimg,svg,.ups-row,.zc-row,[data-sm]')) return;
    const r = e.getBoundingClientRect(); if (!r.width) return;
    const cs = getComputedStyle(e);
    // text cut inside its own box
    if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis' || cs.overflowX === 'hidden') && e.scrollWidth > e.clientWidth + 2 && e.textContent.trim() && e.children.length < 4) out.push('cut: ' + (e.className || e.tagName) + ' "' + e.textContent.trim().slice(0, 40) + '"');
    // sticks out of the scope horizontally
    const rr = root.getBoundingClientRect(); if (r.right > Math.max(rr.right, W) + 2 || r.left < Math.min(rr.left, 0) - 2) out.push('outside: ' + (e.className || e.tagName));
  });
  return out.slice(0, 6); })()`;
(async () => {
  const b = await chromium.launch();
  const desk = [[1366, 768], [1440, 900], [1920, 1080]], phones = [[360, 800], [393, 852], [430, 932]];
  for (const [w, h] of desk.concat(phones)) {
    const mob = w < 1000; const { ctx, pg } = await open(b, html, w, h, mob);
    for (const lay of mob ? ['wide'] : ['wide', 'classic']) for (const items of [1, 3, 5, 6]) {
      await pg.evaluate(opt({ 'co.layout': lay }));
      await pg.evaluate(() => { try { logout() } catch (e) { } delete UI['checkout']; try { sessionStorage.removeItem('extas-co-draft') } catch (e) { } Object.keys(ST.orders).forEach(id => { if (ST.orders[id].name === 'QA') delete ST.orders[id]; }); });
      await pg.evaluate(SETUPS.items(items));
      // bag
      await nav(pg, '#/bag'); const ab = await pg.evaluate(AUDIT('.bg-page')); ok(!ab.length, `${w} bag ${items} items: ${ab.join(' | ')}`);
      const bagT = await pg.evaluate(() => (document.querySelector('[data-testid=bag-total]') || {}).textContent);
      if (lay === 'wide') await pg.screenshot({ path: `${OUT}/bag-${w}-${items}.png`, fullPage: true });
      // checkout via bag
      await pg.click(mob ? '[data-testid=bag-mbar]' : '[data-testid=bag-checkout]'); await pg.waitForTimeout(450);
      const ac = await pg.evaluate(AUDIT('#co-form')); ok(!ac.length, `${w} ${lay} checkout ${items}: ${ac.join(' | ')}`);
      const coT = await pg.evaluate(() => [...document.querySelectorAll('[data-testid=co-total]')].map(e => e.textContent));
      ok(coT.every(x => x === bagT), `${w} ${items} totals bag ${bagT} vs checkout ${coT}`);
      if (!mob) {
        const s = await pg.evaluate(() => { const fl = document.querySelector('.co-float'), btn = fl.querySelector('.co-confirm'), help = fl.querySelector('.co-sidehelp');
          const vis = (e) => { const r = e.getBoundingClientRect(), f = fl.getBoundingClientRect(); return r.height > 0 && r.bottom <= f.bottom + 1 + (getComputedStyle(fl).overflowY === 'visible' ? 1e5 : 0); };
          return { btn: vis(btn), help: !!help && vis(help), tall: fl.classList.contains('co-tall'), gap: help ? help.getBoundingClientRect().top - fl.querySelector('.card').getBoundingClientRect().bottom : -1 }; });
        ok(s.btn && s.help && s.gap >= 16, `${w} ${lay} ${items}: summary column ${JSON.stringify(s)}`);
        const pay = await pg.evaluate(() => [...document.querySelectorAll('.co-paysec .co-po')].filter(e => e.getClientRects().length).length); ok(pay === 3, `${w} ${items} payment boxes ${pay}`);
        const ticks = await pg.evaluate(() => { const t = [...document.querySelectorAll('.co-msgs .ct-tick')]; return t.length === 2 && Math.abs(t[0].getBoundingClientRect().top - t[1].getBoundingClientRect().top) < 3; }); ok(ticks, `${w} ${lay} ticks not on one line`);
        const note = await pg.evaluate(() => !!document.querySelector('#co-note-d, #co-note') && document.querySelector('#co-note-d, #co-note').getClientRects().length > 0); ok(note, `${w} delivery note not open`);
        const grid = await pg.evaluate(() => { const g = getComputedStyle(document.querySelector('.co-wrap .split-side')); return g.gridTemplateColumns + ' gap ' + g.columnGap; });
        ok(lay === 'wide' ? /440px/.test(grid) && /42px/.test(grid) : /380px/.test(grid) && /32px/.test(grid), `${w} ${lay} grid ${grid}`);
      }
      if (lay === 'wide') { await pg.screenshot({ path: `${OUT}/co-${w}-${items}.png`, fullPage: true }); await pg.screenshot({ path: `${OUT}/co-${w}-${items}-fold.png` }); }
      // place it (totals → order)
      await pg.fill('#co-name', 'QA'); await pg.fill('#co-phone', '+880 1712-345678'); await pg.fill('#co-address', 'House 12, Road 5, Mirpur 10, Dhaka'); await pg.waitForTimeout(1000);
      const shown = await pg.evaluate(() => document.querySelector('[data-testid=co-total]').textContent);
      await pg.click('[data-testid=co-confirm]:visible'); await pg.waitForTimeout(500);
      const o = await pg.evaluate(() => { const id = location.hash.split('/').pop(), o = ST.orders[id]; return o ? { t: fmt(o.total), inv: typeof zx_invData === 'function' ? fmt(zx_invData(o).total) : fmt(o.total), p: o.phone, e: o.phoneE164 } : null; });
      ok(o && o.t === shown && o.inv === shown && o.p === '01712345678' && o.e === '+8801712345678', `${w} ${lay} ${items}: order ${JSON.stringify(o)} vs ${shown}`);
    }
    // drawer styles (desktop) — every entry: product page, combo page, ready set
    if (!mob) for (const st of ['A', 'B']) for (const items of [0, 2, 5, 6]) {
      await pg.evaluate(opt({ 'atb.style': st })); await pg.evaluate(SETUPS.items(items));
      await nav(pg, '#/p/contrast-collar-polo');
      await pg.evaluate(() => { const c = pdp_cur(); const used = ST.bag.filter(l => l.product === c.p.id && l.color === c.u.color).map(l => l.size); c.u.size = c.p.sizes.find(z => stockOf(c.p.id, c.u.color, z) > 0 && used.indexOf(z) < 0); ACT['pdp-add'](); }); await pg.waitForTimeout(450);
      const d = await pg.evaluate(() => { const m = document.querySelector('.modal.atb-d'); if (!m) return null; const bd = m.lastElementChild; const t = (m.querySelector('[data-testid=atbc-total]') || {}).textContent; const tot = bagTotals(); const g = fmt(tot.total - bag_bestOffer(tot.total).amount);
        const xs = [...m.querySelectorAll('.atbc-x .atb-xi')].filter(e => e.style.display !== 'none').length; const lines = m.querySelectorAll('.atbc-li').length; const newTop = (m.querySelector('.atbc-li') || {}).className || '';
        return { t, g, scroll: bd.scrollHeight > bd.clientHeight + 1, xs, lines, newTop, free: !!m.querySelector('.atbc-free'), style: (m.querySelector('.atbc') || {}).dataset?.style, addMore: /add ৳|more for free/i.test(m.textContent) }; });
      ok(d && d.t === d.g && d.style === st && !d.addMore, `${w} drawer ${st} ${items}+1: ${JSON.stringify(d)}`);
      if (d && st === 'A') ok(d.xs >= 2, `${w} drawer A ${items}: only ${d.xs} products`);
      if (d && st === 'B') ok(/new/.test(d.newTop) && d.lines === Math.min(items + 1, 4), `${w} drawer B ${items}: lines ${d.lines} top ${d.newTop}`);
      if (d && st === 'B') ok(!d.scroll || d.xs === 0, `${w} drawer B ${items}: scrolls with ${d.xs} products`);
      const ad = await pg.evaluate(AUDIT('.modal.atb-d')); ok(!ad.length, `${w} drawer ${st} ${items}: ${ad.join(' | ')}`);
      await pg.screenshot({ path: `${OUT}/drawer-${st}-${w}-${items + 1}.png` }); await pg.evaluate(() => closeModal());
      // combo drawer
      if (items === 2) { await nav(pg, '#/combo/office-trio'); const btn = await pg.$('[data-act=cb-add]:visible'); if (btn) { await pg.evaluate(() => { const x = document.querySelector('[data-act=cb-add]'); }); }
        const cd = await pg.evaluate(() => { const l = ST.bag[ST.bag.length - 1]; bag_drawerOpen(l.id); const m = document.querySelector('.modal.atb-d'); const r = { style: (m.querySelector('.atbc') || {}).dataset?.style, testid: (m.querySelector('.atbc') || {}).dataset?.testid }; closeModal(); return r; });
        ok(cd.style === st && cd.testid === 'bag-drawer', `${w} combo drawer ${st}: ${JSON.stringify(cd)}`); }
    }
    // bag offer styles
    if (!mob) for (const st of ['current', 'cards', 'side']) { await pg.evaluate(opt({ 'bag.upsellStyle': st })); await pg.evaluate(SETUPS.items(1)); await nav(pg, '#/bag');
      const a = await pg.evaluate(AUDIT('.ups')); ok(!a.length, `${w} bag style ${st}: ${a.join(' | ')}`); await pg.screenshot({ path: `${OUT}/bagstyle-${st}-${w}.png`, fullPage: true }); }
    await pg.evaluate(opt({ 'atb.style': 'A', 'bag.upsellStyle': 'current', 'co.layout': 'wide' }));
    ok(!pg._errs.length, `${w} JS errors: ${pg._errs.slice(0, 3)}`);
    await ctx.close();
  }
  fs.writeFileSync(OUT + '/issues.txt', issues.join('\n'));
  console.log(issues.slice(0, 40).join('\n')); console.log(bad ? `QA: ${bad} issues of ${n}` : `QA: ALL ${n} CHECKS PASSED`); await b.close();
})();
