/* Screens for the comparison sheets + fail evidence.  usage: node capture.js <device> */
const L = require('./lib');
const D = L.dev(process.argv[2]); const dpr = D.group === 'phone' ? 2 : 1;
const S = n => L.SHOTS + '/sheet-' + D.name + '-' + n + '.png';
(async () => {
  const T = await L.open(D, {dpr});
  await L.prep(T, '#/admin/blog?tab=ads'); await L.wait(T, 1200);
  const shotAt = async (n, sel, off = 0.25) => { await L.ev(T, ([s, o]) => { const e = document.querySelector(s); if(e) scrollTo(0, e.getBoundingClientRect().top + scrollY - innerHeight * o); }, [sel, off]); await L.wait(T, 500); await T.p.screenshot({path: S(n)}); };
  await L.go(T, '#/journal', 800); await T.p.screenshot({path: S('home')});
  await shotAt('home-grid', '.bf-gridad', 0.35);
  await shotAt('home-browse', '.bf-browse', 0.1);
  await L.go(T, '#/journal/topic/care', 700); await T.p.screenshot({path: S('topic')});
  await L.go(T, '#/journal/how-to-wash-denim', 800); await T.p.screenshot({path: S('post')});
  await shotAt('post-top-ad', '.bf-quick', 0.15);
  await shotAt('post-inline', '[data-bf-slot="post-inline"]', 0.35);
  await shotAt('post-prods', '.bf-prods', 0.2);
  await L.ev(T, () => { const a = document.getElementById('bf-article'); scrollTo(0, a.offsetTop + a.offsetHeight * 0.72 - innerHeight); }); await L.wait(T, 700); await T.p.screenshot({path: S('post-bar')});
  await shotAt('post-end', '.bf-pend', 0.3);
  /* popup */
  await L.ev(T, () => { const a = ST.blogAds.find(a => (a.slots || []).includes('post-popup')); a.popup = Object.assign({}, a.popup, {delay: 0}); saveState(); try{ Object.keys(localStorage).filter(k => /^bf-pop-/.test(k)).forEach(k => localStorage.removeItem(k)); sessionStorage.clear(); }catch(e){} BF.popShown = {}; });
  await L.go(T, '#/journal', 300); await L.go(T, '#/journal/how-to-wash-denim', 600);
  await L.ev(T, () => { const a = document.getElementById('bf-article'); scrollTo(0, a.offsetTop + a.offsetHeight * 0.7 - innerHeight); }); await L.wait(T, 1200);
  await T.p.screenshot({path: S('popup')}); await L.ev(T, () => closeModal());
  /* Bengali twin */
  await L.go(T, '#/bn/journal/how-to-keep-a-polo-shirt-in-shape', 800); await T.p.screenshot({path: S('post-bn')});
  /* admin */
  await L.go(T, '#/admin/blog?tab=pipe', 800); await shotAt('admin-pipe', '[data-testid=zb-board]', 0.05);
  await L.go(T, '#/admin/blog?tab=ads', 800); await shotAt('admin-slotmap', '[data-testid=zb-slotmap]', 0.08);
  await L.go(T, '#/admin/blog?tab=topics', 800); await T.p.screenshot({path: S('admin-topics')});
  await L.go(T, '#/admin/blog?tab=ads&ad=ad-denim-popup', 800); await shotAt('admin-popup', '[data-testid=zb-ad-popup]', 0.1);
  /* fail evidence */
  if(D.group === 'phone'){ await L.go(T, '#/journal/topic/season', 700); await T.p.screenshot({path: S('fail-activechip'), clip: {x: 0, y: 0, width: D.w, height: Math.min(D.h, 700)}}); }
  await L.go(T, '#/journal/how-to-keep-a-polo-shirt-in-shape', 700); await shotAt('fail-byline', '.bf-by', 0.3);
  await L.go(T, '#/bn/journal/how-to-keep-a-polo-shirt-in-shape', 700); await shotAt('fail-bn-related', '.bf-related', 0.2);
  await L.ev(T, () => { zb_pillar('brand').hidden = true; zb_commit(); }); await L.go(T, '#/journal/inside-the-essential-pique-polo', 700); await T.p.screenshot({path: S('fail-hiddencat')});
  await L.ev(T, () => { zb_pillar('brand').hidden = false; zb_commit(); });
  await L.close(T);
})().catch(e => { console.error(e); process.exit(1); });
