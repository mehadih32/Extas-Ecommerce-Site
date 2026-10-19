const L = require('./lib');
(async () => { for (const dn of ['p393x852', 'd1440x900']) { const D = L.dev(dn); const T = await L.open(D, {dpr: D.group === 'phone' ? 2 : 1}); await L.prep(T, '#/admin/blog?tab=authors'); await L.wait(T, 900);
  await L.ev(T, () => { const e = document.querySelector('[data-testid=zb-acard]'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 160); }); await L.wait(T, 400);
  await T.p.screenshot({path: L.SHOTS + '/r2-' + dn + '-admin-authors.png'}); await L.close(T); } })();
