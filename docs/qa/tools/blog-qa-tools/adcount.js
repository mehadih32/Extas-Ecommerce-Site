const L = require('./lib');
(async () => { for (const dn of ['p393x852', 'd1440x900']) { const T = await L.open(L.dev(dn)); await L.prep(T, '#/admin/blog?tab=ads'); await L.wait(T, 400);
  for (const s of ['how-to-wash-denim', 'how-to-keep-a-polo-shirt-in-shape', 'what-gsm-means']) { await L.go(T, '#/journal/' + s, 600);
    const r = await L.ev(T, () => { const vis = [...document.querySelectorAll('[data-bf-ad]')].filter(x => x.id === 'bf-bar' || x.offsetParent); const art = document.getElementById('bf-article'); const words = (document.querySelector('.bf-prose').innerText.match(/\S+/g) || []).length; return {ads: vis.map(x => x.dataset.bfSlot + '=' + x.dataset.bfAd), n: vis.length, prodBlock: document.querySelectorAll('.bf-prods .bf-pc').length, words, artH: art.offsetHeight, firstAdY: Math.round(vis.filter(x=>x.id!=='bf-bar')[0].getBoundingClientRect().top), firstParaY: Math.round(document.querySelector('.bf-prose p').getBoundingClientRect().top), ih: innerHeight}; });
    console.log(dn, s, JSON.stringify(r)); }
  await L.go(T, '#/journal/how-to-wash-denim', 600); await L.ev(T, () => scrollTo(0, 0)); await L.shot(T, dn + '-fold-denim');
  await L.go(T, '#/journal', 600); await L.shot(T, dn + '-fold-home');
  await L.close(T); } })();
