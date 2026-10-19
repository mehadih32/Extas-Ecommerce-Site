/* L29 · overlays: open → page scroll locked; close → unlocked, scroll position kept, focus back on the opener.
   Popups, sheets, drawers, zoom viewers, blog popup, side-canvas popup, admin popups, share/sort popovers. */
const L = require('./lib');
const SETUP = "ST.user = Object.keys(ST.accounts)[0]; if(!ST.bag.length){ DB.products.slice(0,2).forEach(function(p){ var c=p.colors[0], s=p.sizes.filter(function(z){return stockOf(p.id,c,z)>0;})[0]; if(s) bagAdd({kind:'item',product:p.id,color:c,size:s,qty:1}); }); }";
const OVL = '.modal-back, .zm, #dsk-srch, .zg-panel';

async function tagOpener(page, sel){
  return page.evaluate((s) => {
    document.querySelectorAll('[data-qa-opener]').forEach(e => e.removeAttribute('data-qa-opener'));
    const e = [...document.querySelectorAll(s)].find(x => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden' && x.getBoundingClientRect().width > 0);
    if(!e) return null;
    e.setAttribute('data-qa-opener', '1');
    window.__qaOp = { act: e.getAttribute('data-act'), id: e.getAttribute('data-id') || '', tid: e.getAttribute('data-testid') || '', href: e.getAttribute('href') };
    return true;
  }, sel);
}
async function openerPoint(page){
  return page.evaluate(() => { const e = document.querySelector('[data-qa-opener]'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
}
async function activate(page, pt){
  if(page._dev === 'phone') await L.tap(page, pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
}
async function tryScroll(page){
  const y0 = await L.scrollY(page);
  const vp = page.viewportSize();
  if(page._dev === 'phone') await L.swipe(page, vp.width / 2, vp.height * 0.7, vp.width / 2, vp.height * 0.3, 8, 16);
  else { await page.mouse.move(vp.width / 2, vp.height / 2); await page.mouse.wheel(0, 400); }
  await page.waitForTimeout(450);
  return (await L.scrollY(page)) - y0;
}
async function state(page){
  return page.evaluate((ovl) => {
    const a = document.activeElement;
    return { open: !!document.querySelector(ovl), body: document.body.style.overflow || getComputedStyle(document.body).overflow, y: Math.round(window.pageYOffset),
      focusOpener: !!(a && a.hasAttribute && (a.hasAttribute('data-qa-opener') || (window.__qaOp && ((window.__qaOp.act && a.getAttribute('data-act') === window.__qaOp.act && (a.getAttribute('data-id') || '') === window.__qaOp.id && (a.getAttribute('data-testid') || '') === window.__qaOp.tid) || (window.__qaOp.href && a.getAttribute('href') === window.__qaOp.href))))),
      scrollable: document.documentElement.scrollHeight - innerHeight > 20, focus: a ? (a.tagName + (a.getAttribute('data-act') ? '[' + a.getAttribute('data-act') + ']' : '') + (a.className && typeof a.className === 'string' ? '.' + a.className.split(' ')[0] : '')) : 'none' };
  }, OVL);
}
async function closeBy(page, how){
  const vp = page.viewportSize();
  if(how === 'x'){
    const pt = await page.evaluate(() => { const b = document.querySelector('.modal-back [data-act="close-modal"], .zm .zm-x, #dsk-srch .dsk-s-x, .zg-panel .zg-x'); if(!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if(pt) await activate(page, pt);
  } else if(how === 'esc') await page.keyboard.press('Escape');
  else if(how === 'backdrop'){
    const pt = await page.evaluate(() => { const m = document.querySelector('.modal-back .modal, .zg-panel'); if(!m) return null; const r = m.getBoundingClientRect(); const c = [[8, 8], [innerWidth - 8, 8], [8, innerHeight / 2], [innerWidth - 8, innerHeight / 2]]; for(const [x, y] of c){ if(x < r.left || x > r.right || y < r.top || y > r.bottom){ const t = document.elementFromPoint(x, y); if(t && (t.classList.contains('modal-back') || t.classList.contains('zg-back'))) return { x, y }; } } return null; });
    if(pt) await activate(page, pt); else return 'no backdrop area visible';
  } else if(how === 'back') await page.evaluate(() => history.back());
  else if(how === 'swipe') await L.swipe(page, 6, vp.height / 2, 220, vp.height / 2 + 10, 10, 20);
  else if(how === 'swipedown') await L.swipe(page, vp.width / 2, vp.height * 0.35, vp.width / 2, vp.height * 0.35 + 160, 8, 20);
  return null;
}

/* one full cycle */
async function cycle(o){
  const { page, dev, lang, pg, name, opener, close } = o;
  const base = { dev, lang, page: pg };
  const id = 'OV ' + name + ' (' + close + ')';
  if(o.hash) await L.open(page, o.hash, { lang, wait: o.wait || 1000 });
  if(o.prep) await o.prep();
  if(!(await tagOpener(page, opener))){ L.rec({ ...base, id, what: 'opener present', measured: 'opener ' + opener + ' not found', pass: null }); return; }
  /* put the opener mid-screen with some page scrolled above it */
  await page.evaluate((yy) => { const e = document.querySelector('[data-qa-opener]'); if(yy != null){ window.scrollTo(0, yy); } else { const r = e.getBoundingClientRect(); if(r.top < 80 || r.bottom > innerHeight - 80) window.scrollBy(0, r.top - innerHeight / 2); } }, o.y == null ? null : o.y);
  await page.waitForTimeout(350);
  const y0 = await L.scrollY(page);
  const pt = await openerPoint(page);
  if(o.focusFirst) await page.evaluate(() => document.querySelector('[data-qa-opener]').focus());
  if(o.openKey) await page.keyboard.press(o.openKey); else await activate(page, pt);
  await page.waitForTimeout(o.openWait || 450);
  const s1 = await state(page);
  if(!s1.open){ L.rec({ ...base, id, what: 'opens', measured: 'did not open', pass: false }); return; }
  const moved = o.noLockCheck ? 0 : await tryScroll(page);
  const s1b = await state(page);
  const lockOk = o.noLockCheck ? null : Math.abs(moved) < 2 && s1b.open;
  /* close */
  const t0 = Date.now();
  const err = await closeBy(page, close);
  if(err){ L.rec({ ...base, id, what: 'close by ' + close, measured: err, pass: null }); await closeBy(page, 'esc'); return; }
  await page.waitForTimeout(o.closeWait || 300);
  const s2 = await state(page);
  const unlockMoved = await tryScroll(page);
  const posKept = Math.abs(s2.y - y0) <= 2;
  const focusOk = o.noFocus ? null : s2.focusOpener;
  const unlockOk = s2.scrollable ? unlockMoved > 2 : null;
  const pass = !s2.open && (lockOk !== false) && posKept && unlockOk !== false && (focusOk !== false);
  L.rec({ ...base, id, what: `${name}: open → page locked; close (${close}) → unlocked, same scroll spot, focus back on opener`,
    measured: `open: ${o.noLockCheck ? 'lock n/a' : (lockOk ? 'locked' : 'page SCROLLED ' + moved + ' px')} (body ${s1.body}) · close: ${s2.open ? 'STILL OPEN' : 'closed'}, body "${s2.body}", y ${y0}→${s2.y}${posKept ? '' : ' (JUMPED)'}, page scrolls after: ${unlockOk === null ? 'n/a (page shorter than screen)' : unlockOk ? 'yes' : 'NO (still locked)'} · focus → ${s2.focusOpener ? 'opener' : s2.focus}`,
    pass, note: o.note || '' });
  await page.waitForTimeout(150);
}

(async () => {
  /* ---------------- phone ---------------- */
  {
    const page = await L.newPage('phone');
    await L.open(page, '#/', { setup: SETUP });
    const dev = 'phone', lang = 'en';
    for(const close of ['x', 'backdrop', 'back', 'swipe'])
      await cycle({ page, dev, lang, pg: 'home', name: 'Menu', hash: '#/', opener: '.hdr [data-act="open-menu"]', close, y: 600 });
    await cycle({ page, dev, lang, pg: 'home', name: 'Search', hash: '#/', opener: '.hdr [data-act="open-search"], .bnav [data-act="open-search"]', close: 'x', y: 600 });
    await cycle({ page, dev, lang, pg: 'category', name: 'Filter sheet', hash: '#/c/polos', opener: '[data-act="cat-filter"]', close: 'x' });
    await cycle({ page, dev, lang, pg: 'product', name: 'Size chart', hash: '#/p/essential-pique-polo', opener: '[data-act="pdp-open-chart"]', close: 'x' });
    await cycle({ page, dev, lang, pg: 'product', name: 'Find my size', hash: '#/p/essential-pique-polo', opener: '[data-act="pdp-open-finder"]', close: 'backdrop' });
    await cycle({ page, dev, lang, pg: 'product', name: 'All colours', hash: '#/p/essential-pique-polo', opener: '[data-act="pdp-allcolors"]', close: 'x' });
    await cycle({ page, dev, lang, pg: 'product', name: 'Photo zoom', hash: '#/p/essential-pique-polo', opener: '.pdp-page .pdp-tile', close: 'x', noFocus: true, note: 'opened by a tap on the photo (not a button): no focus target' });
    await cycle({ page, dev, lang, pg: 'product', name: 'Photo zoom', hash: '#/p/essential-pique-polo', opener: '.pdp-page .pdp-tile', close: 'swipedown', noFocus: true });
    await cycle({ page, dev, lang, pg: 'product', name: 'Added-to-bag sheet', hash: '#/p/heavyweight-hoodie', opener: '[data-act="pdp-add"]', close: 'x',
      prep: async () => { await page.evaluate(() => { const c = pdp_cur(); const p = c.p; c.u.size = p.sizes.filter(z => stockOf(p.id, c.u.color, z) > 0)[0]; rerender(); }); await page.waitForTimeout(300); } });
    await cycle({ page, dev, lang, pg: 'account', name: 'Your size popup', hash: '#/account/foryou', opener: '[data-act="acc-size-edit"]', close: 'x' });
    await cycle({ page, dev, lang, pg: 'combo pair', name: 'Combo photo zoom', opener: '[data-act="ca-zoom"]', close: 'x',
      prep: async () => { await page.evaluate(() => { const r = ca_activeRules().find(r => { try{ return ca_generate(r).visible.length; }catch(e){ return false; } }); const L0 = ca_generate(r).visible[0]; location.hash = '#/combo-pair/' + L0.id; }); await page.waitForTimeout(1200); } });
    await page.context().close();
  }
  /* ---------------- desktop ---------------- */
  for(const [dev, lang] of [['d1366', 'en'], ['d1366', 'bn'], ['d1920', 'en']]){
    const page = await L.newPage(dev);
    await L.open(page, '#/', { lang, setup: SETUP });
    await cycle({ page, dev, lang, pg: 'home', name: 'Desktop search', hash: '#/', opener: '.hdr [data-act="open-search"]', close: 'esc', noLockCheck: true, note: 'search drops down under the header; the page is not meant to lock' });
    await cycle({ page, dev, lang, pg: 'product', name: 'Size chart', hash: '#/p/essential-pique-polo', opener: '[data-act="pdp-open-chart"]', close: 'esc' });
    await cycle({ page, dev, lang, pg: 'product', name: 'Size chart', hash: '#/p/essential-pique-polo', opener: '[data-act="pdp-open-chart"]', close: 'backdrop' });
    await cycle({ page, dev, lang, pg: 'product', name: 'Find my size', hash: '#/p/essential-pique-polo', opener: '[data-act="pdp-open-finder"]', close: 'x' });
    await cycle({ page, dev, lang, pg: 'product', name: 'Photo zoom', hash: '#/p/essential-pique-polo', opener: '.pdp-page .pdp-tile', close: 'esc', noFocus: true, note: 'opened by a click on the photo: no focus target' });
    await cycle({ page, dev, lang, pg: 'product', name: 'Added-to-bag drawer', hash: '#/p/heavyweight-hoodie', opener: '[data-act="pdp-add"]', close: 'esc',
      prep: async () => { await page.evaluate(() => { const c = pdp_cur(); const p = c.p; c.u.size = p.sizes.filter(z => stockOf(p.id, c.u.color, z) > 0)[1]; rerender(); }); await page.waitForTimeout(300); } });
    await cycle({ page, dev, lang, pg: 'combo pair', name: 'Combo photo zoom', opener: '[data-act="ca-zoom"]', close: 'esc',
      prep: async () => { await page.evaluate(() => { const r = ca_activeRules().find(r => { try{ return ca_generate(r).visible.length; }catch(e){ return false; } }); const L0 = ca_generate(r).visible[0]; location.hash = '#/combo-pair/' + L0.id; }); await page.waitForTimeout(1200); } });
    if(lang === 'en'){
      await cycle({ page, dev, lang, pg: 'account orders', name: 'Invoice', hash: '#/account/orders', opener: '[data-act="inv-open"]', close: 'esc' });
      await cycle({ page, dev, lang, pg: 'admin orders', name: 'Order sheet', hash: '#/admin/orders', opener: 'button.ao-idbtn, button.ao-card', close: 'esc' });
      await cycle({ page, dev, lang, pg: 'admin register', name: 'PR panel', hash: '#/admin/register', opener: 'a.zg-row, a.zg-ev, a.zg-prl', noLockCheck: true, prep: async () => { await page.evaluate(() => { const b = document.querySelector('[data-act="zg-stage"]'); if(b) b.click(); }); await page.waitForTimeout(500); }, note: 'side panel is its own route; lock not expected', close: 'esc' });
      await cycle({ page, dev, lang, pg: 'admin layout', name: 'Section editor', hash: '#/admin/layout', opener: '[data-act="lb-edit"], [data-act="lb-add"]', close: 'esc' });
    }
    await page.context().close();
  }
  L.save('overlays');
  await L.closeBrowser();
})().catch(async e => { console.error(e); L.save('overlays'); await L.closeBrowser(); process.exit(1); });
