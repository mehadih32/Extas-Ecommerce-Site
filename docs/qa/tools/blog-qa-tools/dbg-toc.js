const L = require('./lib');
(async () => { const T = await L.open(L.dev('d1440x900')); await L.prep(T, '#/journal'); await L.wait(T, 600);
  for (const s of ['winter-layering-in-dhaka', 'what-to-wear-for-eid', 'how-to-wash-denim']) { await L.go(T, '#/journal/' + s, 700);
    const out = [];
    for (const k of [1, 2, 3]) { const r = await L.ev(T, async k => { const h = document.getElementById('bf-s' + k); if(!h) return null; scrollTo(0, h.getBoundingClientRect().top + scrollY - 150); await new Promise(r => setTimeout(r, 400)); const td = document.querySelector('.bf-tocd').getBoundingClientRect(); return {k, on: (document.querySelector('.bf-tocd a.on') || {}).dataset ? document.querySelector('.bf-tocd a.on').dataset.id : null, tocTop: Math.round(td.top)}; }, k); out.push(r); }
    console.log(s, JSON.stringify(out)); }
  await L.close(T); })();
