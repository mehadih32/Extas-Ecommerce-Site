const L = require('./lib');
(async () => { for (const dn of ['p393x852', 't820x1180p', 'd1440x900']) { const D = L.dev(dn); const T = await L.open(D, {dpr: D.group === 'phone' ? 2 : 1}); await L.prep(T, '#/admin/blog?tab=ads&ad=ad-denim-popup'); await L.wait(T, 900);
  await L.ev(T, () => { const e = document.querySelector('[data-testid=zb-ad-popup]'); scrollTo(0, e.getBoundingClientRect().top + scrollY - innerHeight * 0.1); }); await L.wait(T, 400);
  await T.p.screenshot({path: L.SHOTS + '/sheet-' + dn + '-admin-popup.png'});
  if (dn === 'd1280x800' || dn === 'd1440x900') { await L.go(T, '#/admin/blog?tab=pipe', 700); await T.p.screenshot({path: L.SHOTS + '/sheet-' + dn + '-admin-sidebar.png'}); }
  await L.close(T); } })();
