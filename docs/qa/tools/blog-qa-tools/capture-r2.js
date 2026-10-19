/* R2 screens for the Bengali sheets.  usage: node capture-r2.js <device> */
const L = require('./lib');
const D = L.dev(process.argv[2]); const dpr = D.group === 'phone' ? 2 : 1;
const S = n => L.SHOTS + '/r2-' + D.name + '-' + n + '.png';
(async () => {
  const T = await L.open(D, {dpr});
  await L.prep(T, '#/admin/blog?tab=ads'); await L.wait(T, 1200);
  const at = async (n, sel, off = 0.25) => { const ok = await L.ev(T, ([s, o]) => { const e = document.querySelector(s); if(!e) return false; scrollTo(0, e.getBoundingClientRect().top + scrollY - innerHeight * o); return true; }, [sel, off]); await L.wait(T, 600); await T.p.screenshot({path: S(n)}); return ok; };
  await L.go(T, '#/journal', 900); await T.p.screenshot({path: S('home')});
  await at('home-cards', '.bf-grid', 0.1);
  await L.go(T, '#/journal/how-to-keep-a-polo-shirt-in-shape', 900); await T.p.screenshot({path: S('post')});
  await at('post-top-ad', '[data-bf-slot="post-top"]', 0.45);
  await at('post-inline', '[data-bf-slot="post-inline"]', 0.4);
  await L.ev(T, () => { const a = document.getElementById('bf-article'); scrollTo(0, a.offsetTop + a.offsetHeight * 0.55 - innerHeight); }); await L.wait(T, 300);
  await L.ev(T, () => scrollBy(0, 500)); await L.wait(T, 800); await T.p.screenshot({path: S('post-reading')});
  await at('post-end', '.bf-pend', 0.35);
  await L.go(T, '#/journal/how-to-wash-denim', 900); await at('denim-ads', '[data-bf-slot="post-top"]', 0.45);
  /* popup */
  await L.ev(T, () => { const a = ST.blogAds.find(a => (a.slots || []).includes('post-popup')); a.popup = Object.assign({}, a.popup, {delay: 0}); saveState(); try{ Object.keys(localStorage).filter(k => /^bf-pop-/.test(k)).forEach(k => localStorage.removeItem(k)); sessionStorage.clear(); }catch(e){} BF.popShown = {}; });
  await L.go(T, '#/journal', 300); await L.go(T, '#/journal/how-to-wash-denim', 700);
  await L.ev(T, () => { const a = document.getElementById('bf-article'); scrollTo(0, a.offsetTop + a.offsetHeight * 0.7 - innerHeight); }); await L.wait(T, 1500);
  await T.p.screenshot({path: S('popup')}); await L.ev(T, () => closeModal());
  await L.prep(T, '#/admin/blog?tab=ads');
  await L.go(T, '#/bn/journal/how-to-keep-a-polo-shirt-in-shape', 900); await at('bn-ads', '[data-bf-slot="post-inline"]', 0.4);
  /* entry points */
  await L.go(T, '#/', 900);
  if(D.group === 'phone'){ const b = T.p.locator('.hdr button[aria-label*="enu" i], .hdr [data-act*="menu"]').first(); if(await b.count()){ await b.click().catch(() => {}); await L.wait(T, 600); } }
  await T.p.screenshot({path: S('nav')}); await L.ev(T, () => { try{ closeModal(); }catch(e){} });
  await L.go(T, '#/p/essential-pique-polo', 900); await at('pdp-care', '.bf-care, a[href*="/journal/"]', 0.5);
  /* back end */
  await L.go(T, '#/admin/blog?tab=pipe', 900); await at('admin-pipe-demo', '[data-testid=zb-board]', 0.05);
  if(await T.p.locator('[data-act=zb-p-demo]').count()){ await L.tap(T, '[data-act=zb-p-demo]'); await at('admin-pipe-owner', '[data-testid=zb-board]', 0.05); await L.tap(T, '[data-act=zb-p-demo]'); }
  await L.go(T, '#/admin/blog', 800);
  if(await T.p.locator('[data-testid=zb-row-pub]').count()){ await L.tap(T, '[data-testid=zb-row-pub]'); await L.wait(T, 400); await T.p.screenshot({path: S('admin-confirm')}); await L.ev(T, () => closeModal()); }
  await L.go(T, '#/admin/blog?tab=ads&ad=ad-pique-polo', 900); await at('admin-ad-rules', '[data-testid=zb-ad-reach], [data-testid=zb-ad-rules]', 0.1);
  await L.go(T, '#/admin/blog?tab=ads', 900); await at('admin-ad-settings', '[data-testid=zb-as-dup]', 0.3);
  await L.go(T, '#/admin/blog?tab=authors&a=jotno', 900); await at('admin-biobn', '#zb-a-biobn', 0.35);
  await L.go(T, '#/admin/blog?tab=authors', 900); await T.p.screenshot({path: S('admin-authors')});
  await L.close(T);
})().catch(e => { console.error(e); process.exit(1); });
