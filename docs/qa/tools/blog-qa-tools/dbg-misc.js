const L = require('./lib');
(async () => { for (const dn of ['p320x640', 'p393x852', 't820x1180p', 'd1440x900']) { const T = await L.open(L.dev(dn)); await L.prep(T, '#/journal'); await L.wait(T, 500);
  const o = await L.ev(T, () => ({av: [...document.querySelectorAll('.bf-browse .bf-av')].map(a => Math.round(a.getBoundingClientRect().width) + 'x' + Math.round(a.getBoundingClientRect().height)).slice(0, 2),
    navJournal: [...document.querySelectorAll('header a, .hdr a, nav a')].filter(a => /journal/.test(a.getAttribute('href') || '')).map(a => (a.closest('footer') ? 'footer:' : 'hdr:') + a.textContent.trim()),
    firstCardTop: Math.round((document.querySelector('.bf-feat') || {getBoundingClientRect: () => ({top: -1})}).getBoundingClientRect().top), ih: innerHeight }));
  /* mobile menu */
  const burger = await T.p.locator('.hdr button[aria-label*="enu"], .hdr [data-act*="menu"]').first();
  let menu = null; if (await burger.count()) { await burger.click().catch(() => {}); await L.wait(T, 400); menu = await L.ev(T, () => [...document.querySelectorAll('a')].filter(a => a.offsetParent && /journal/.test(a.getAttribute('href') || '') && !a.closest('footer') && !a.closest('main')).map(a => a.textContent.trim())); }
  await L.ev(T, () => closeModal && closeModal());
  await L.go(T, '#/journal/how-to-keep-a-polo-shirt-in-shape', 600);
  await L.ev(T, () => { const a = document.getElementById('bf-article'); scrollTo(0, a.offsetTop + a.offsetHeight * 0.7 - innerHeight); }); await L.wait(T, 600);
  const bars = await L.ev(T, () => { const b = document.getElementById('bf-bar'), n = document.querySelector('.tabbar, .bnav, nav.bottom, .mnav'); const r = b && b.classList.contains('on') ? b.getBoundingClientRect() : null; const fixed = [...document.querySelectorAll('body *')].filter(e => { const cs = getComputedStyle(e); return cs.position === 'fixed' && e.offsetHeight > 30 && e.getBoundingClientRect().bottom >= innerHeight - 2 && e.getBoundingClientRect().top > innerHeight / 2; }).map(e => (e.className || e.tagName).toString().slice(0, 30) + ':' + Math.round(e.getBoundingClientRect().top)); return {bar: r ? [Math.round(r.top), Math.round(r.height)] : null, fixedBottom: fixed, ih: innerHeight}; });
  console.log(dn, JSON.stringify(o), 'menu', JSON.stringify(menu), 'bars', JSON.stringify(bars));
  await L.close(T); } })();
