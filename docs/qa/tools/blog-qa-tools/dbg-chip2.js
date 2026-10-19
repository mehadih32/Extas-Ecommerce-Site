const L = require('./lib');
(async () => { const T = await L.open(L.dev(process.argv[2] || 'p360x800')); await L.prep(T, '#/journal'); await L.wait(T, 800);
  for (const h of ['#/journal/topic/care', '#/journal/topic/season', '#/journal/topic/brand']) { await L.go(T, h, 900);
    console.log(h, JSON.stringify(await L.ev(T, () => [...document.querySelectorAll('.bf-chiprow')].map(c => { const on = c.querySelector('.bf-chip.on'); const cr = c.getBoundingClientRect(); return {cls: c.parentElement.className, sl: Math.round(c.scrollLeft), sw: c.scrollWidth, cw: c.clientWidth, on: on ? [Math.round(on.getBoundingClientRect().left - cr.left), Math.round(on.getBoundingClientRect().right - cr.left), on.textContent] : null}; })))); }
  await L.close(T); })();
