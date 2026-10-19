/* UX re-review probes for the earlier top issues.  usage: node ux-r2.js <device> */
const L = require('./lib');
const D = L.dev(process.argv[2]);
const R = L.Rec('ux', D.name);
(async () => {
  const T = await L.open(D, {dpr: D.group === 'phone' ? 2 : 1});
  await L.prep(T, '#/admin/blog?tab=ads'); await L.wait(T, 900);
  /* U1/U2 ad load + relevance per post */
  const posts = ['how-to-wash-denim', 'how-to-keep-a-polo-shirt-in-shape', 'what-gsm-means', 'winter-layering-in-dhaka', 'one-oxford-shirt-three-ways'];
  const load = {};
  for(const s of posts){
    await L.go(T, '#/journal/' + s, 600);
    await L.ev(T, () => { const a = document.getElementById('bf-article'); scrollTo(0, a.offsetTop + a.offsetHeight * 0.75 - innerHeight); }); await L.wait(T, 500);
    load[s] = await L.ev(T, () => { const ads = [...document.querySelectorAll('[data-bf-ad]')].filter(x => !x.closest('.modal-back') && (x.id === 'bf-bar' || !!x.offsetParent)); const p1 = document.querySelector('.bf-prose p'); const y1 = p1.getBoundingClientRect().top + scrollY; const first = ads.filter(x => x.id !== 'bf-bar').map(x => x.getBoundingClientRect().top + scrollY).sort((a, b) => a - b)[0];
      return {n: ads.length, ads: ads.map(x => x.dataset.bfSlot + '=' + ((x.querySelector('.bf-adt, .bf-bar-t') || {}).textContent || x.dataset.bfAd).trim().slice(0, 28)), prods: document.querySelectorAll('.bf-prods .bf-pc').length, words: (document.querySelector('.bf-prose').innerText.match(/\S+/g) || []).length, firstAdVsP1: first ? Math.round(first - y1) : null, barOn: !!document.querySelector('#bf-bar.on')}; });
  }
  R.add('U1-load', 'ads per post (≤3), none before paragraph 1', Object.values(load).every(x => x.n <= 3 && (x.firstAdVsP1 === null || x.firstAdVsP1 > 0)), {measured: JSON.stringify(load)});
  /* U3 entry points */
  await L.go(T, '#/', 700);
  const nav = await L.ev(T, () => ({hdr: [...document.querySelectorAll('header a, .hdr a')].filter(a => /journal/.test(a.getAttribute('href') || '') && !a.closest('footer') && !a.closest('main')).map(a => a.textContent.trim() || a.getAttribute('aria-label'))}));
  let menu = [];
  const burger = T.p.locator('.hdr button[aria-label*="enu" i], .hdr [data-act*="menu"]').first();
  if(await burger.count()){ await burger.click().catch(() => {}); await L.wait(T, 500); menu = await L.ev(T, () => [...document.querySelectorAll('a')].filter(a => a.offsetParent && /journal/.test(a.getAttribute('href') || '') && !a.closest('footer') && !a.closest('main')).map(a => a.textContent.trim())); await L.shot(T, D.name + '-ux-menu'); await L.ev(T, () => { try{ closeModal(); }catch(e){} document.querySelectorAll('.drawer, .menu-back').forEach(e => e.remove()); }); }
  await L.go(T, '#/p/essential-pique-polo', 800);
  const pdp = await L.ev(T, () => [...document.querySelectorAll('main a')].filter(a => /journal/.test(a.getAttribute('href') || '')).map(a => a.textContent.trim().slice(0, 40) + ' → ' + a.getAttribute('href')));
  R.add('U3-entry', 'Journal in header or phone menu, and a guide link on the product page', (nav.hdr.length + menu.length) > 0 && pdp.length > 0, {measured: 'header ' + JSON.stringify(nav.hdr) + ' menu ' + JSON.stringify(menu) + ' PDP ' + JSON.stringify(pdp)});
  /* U4 cards: excerpt, demo pills, stubs */
  await L.go(T, '#/journal', 800);
  const cards = await L.ev(T, () => ({n: document.querySelectorAll('.bf-grid .bf-card').length, excerpt: document.querySelectorAll('.bf-grid .bf-card .bf-card-d, .bf-grid .bf-card p').length, demo: [...document.querySelectorAll('.bf-flag')].filter(f => /Demo|ডেমো/.test(f.textContent) && f.offsetParent).length, total: (document.querySelector('.bf-sechd .bf-cnt') || {}).textContent, stubs: bfList().filter(p => p.thin).length, stubsListed: [...document.querySelectorAll('.bf-grid .bf-card a')].map(a => a.getAttribute('href').split('/').pop()).filter(s => (bfFind(s) || {}).thin).length}));
  R.add('U4-cards', 'cards carry an excerpt; thin stubs kept off the list; no Demo pills (info)', null, {measured: JSON.stringify(cards)});
  /* U5 first screen */
  const fold = await L.ev(T, () => { const f = document.querySelector('.bf-feat') || document.querySelector('.bf-card'); return {firstGuideTop: Math.round(f.getBoundingClientRect().top), ih: innerHeight, homeTopAd: !!document.querySelector('[data-bf-slot="home-top"]') && !!document.querySelector('[data-bf-slot="home-top"]').offsetParent, rssTop: (() => { const r = document.querySelector('.bf-hd .bf-rss'); return r ? Math.round(r.getBoundingClientRect().top) : null; })()}; });
  R.add('U5-fold', 'first guide starts inside the first screen', fold.firstGuideTop < fold.ih - 120, {measured: JSON.stringify(fold)});
  await L.shot(T, D.name + '-ux-home-fold');
  /* U6 sticky stack while reading */
  await L.go(T, '#/journal/how-to-keep-a-polo-shirt-in-shape', 700);
  await L.ev(T, () => { const a = document.getElementById('bf-article'); scrollTo(0, a.offsetTop + a.offsetHeight * 0.55 - innerHeight); }); await L.wait(T, 300);
  await L.ev(T, () => scrollBy(0, 400)); await L.wait(T, 600);
  const down = await L.ev(T, () => { const b = document.getElementById('bf-bar'); return {bar: !!(b && b.classList.contains('on') && b.getBoundingClientRect().top < innerHeight), barH: b ? Math.round(b.getBoundingClientRect().height) : 0}; });
  await L.ev(T, () => { const a = document.getElementById('bf-article'); scrollTo(0, a.offsetTop + a.offsetHeight - innerHeight * 0.6); }); await L.wait(T, 700);
  const end = await L.ev(T, () => { const b = document.getElementById('bf-bar'); const nav = [...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().bottom >= innerHeight - 2 && e.getBoundingClientRect().top > innerHeight / 2 && e.offsetHeight > 30); const cover = nav.reduce((s, e) => s + e.getBoundingClientRect().height, 0); return {bar: !!(b && b.classList.contains('on')), cover: Math.round(cover), pct: Math.round(cover / innerHeight * 100)}; });
  R.add('U6-sticky', 'slim bar not on screen while reading down the middle; bottom cover (info)', !down.bar, {measured: 'mid-article scrolling down: bar ' + down.bar + ' · near end: ' + JSON.stringify(end)});
  await L.shot(T, D.name + '-ux-post-end');
  /* U7 Bengali ads */
  await L.go(T, '#/bn/journal/how-to-keep-a-polo-shirt-in-shape', 700);
  await L.ev(T, () => { const a = document.getElementById('bf-article'); scrollTo(0, a.offsetTop + a.offsetHeight * 0.75 - innerHeight); }); await L.wait(T, 500);
  const bnads = await L.ev(T, () => [...document.querySelectorAll('[data-bf-ad]')].map(x => ((x.querySelector('.bf-adt, .bf-bar-t') || {}).textContent || '').trim()).filter(Boolean));
  R.add('U7-bnads', 'Bengali page: ad text in Bengali', bnads.every(t => /[ঀ-৿]/.test(t)), {measured: JSON.stringify(bnads)});
  /* U8 small labels */
  await L.go(T, '#/journal/how-to-keep-a-polo-shirt-in-shape', 600);
  const sizes = await L.ev(T, () => { const q = s => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : null; }; return {pl: q('.bf-pl'), adlab: q('.bf-adlab'), quick: q('.bf-quick-l'), flag: q('.bf-flag'), body: q('.bf-prose p')}; });
  await L.go(T, '#/bn/journal/how-to-keep-a-polo-shirt-in-shape', 600);
  const bnmin = await L.ev(T, () => { let m = 99, w = ''; document.querySelectorAll('main *').forEach(e => { if(!e.offsetParent || !/[ঀ-৿]/.test([...e.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join(''))) return; const f = parseFloat(getComputedStyle(e).fontSize); if(f < m){ m = f; w = e.className || e.tagName; } }); return {min: m, where: String(w).slice(0, 30)}; });
  R.add('U8-labels', 'labels ≥13 px, Bengali text ≥13 px', Object.entries(sizes).filter(([k]) => k !== 'body').every(([k, v]) => v === null || v >= 13) && bnmin.min >= 13, {measured: JSON.stringify(sizes) + ' bn min ' + JSON.stringify(bnmin)});
  R.add('U99-errors', 'JS errors', T.errs.length === 0, {measured: T.errs.slice(0, 4).join(' | ') || 'none'});
  await L.close(T);
})().catch(e => { console.error('CRASH', e); R.add('U00-crash', 'ux crashed', false, {measured: String(e).slice(0, 300)}); process.exit(1); });
