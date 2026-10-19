const L = require('./lib');
(async () => { const T = await L.open(L.dev(process.argv[2] || 't1024x1366p')); await L.prep(T, '#/journal'); await L.wait(T, 600);
  await L.go(T, '#/journal/topic/care', 600);
  const a = await L.ev(T, () => { scrollTo(0, 99999); return {y: scrollY, docH: document.documentElement.scrollHeight, ih: innerHeight}; }); await L.wait(T, 400);
  console.log('cat max', a);
  await L.ev(T, () => { location.hash = '#/journal/how-to-wash-denim'; }); await L.wait(T, 800);
  await T.p.goBack(); 
  for (const ms of [50, 200, 500, 1000, 2000]) { await L.wait(T, ms); console.log(ms, await L.ev(T, () => ({y: scrollY, docH: document.documentElement.scrollHeight, h: location.hash}))); }
  await L.close(T); })();
