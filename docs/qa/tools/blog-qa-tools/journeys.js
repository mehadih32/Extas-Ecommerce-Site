/* Visitor journeys on one device.  usage: node journeys.js <device> [only] */
const L = require('./lib');
const D = L.dev(process.argv[2]); const only = process.argv[3];
const R = L.Rec('journeys', D.name);
const st = T => L.ev(T, () => ({hash: location.hash, y: Math.round(scrollY), h1: (document.querySelector('h1') || {}).textContent || '', modal: !!document.querySelector('.modal-back')}));
const run = (k) => !only || only.split(',').includes(k);

(async () => {
  const T = await L.open(D);
  await L.prep(T, '#/journal'); await L.wait(T, 800);

  /* J1 home → category → post → related post → back ×3 → forward */
  if(run('J1')) try{
    await L.go(T, '#/journal', 600);
    const steps = [];
    await L.tap(T, '.bf-cats a.bf-chip[href="#/journal/topic/care"]');
    await L.wait(T, 600); let s = await st(T); steps.push(['category', s.hash]);
    const catOk = s.hash === '#/journal/topic/care';
    await L.ev(T, () => { const c = document.querySelectorAll('.bf-grid .bf-card'); const e = c[Math.min(c.length - 1, 3)] || c[0]; scrollTo(0, Math.max(0, Math.round(e.getBoundingClientRect().top + scrollY - innerHeight * 0.35))); }); await L.wait(T, 400);
    const yCat = (await st(T)).y;
    /* first card that is fully on screen */
    const idx = await L.ev(T, () => { const a = [...document.querySelectorAll('.bf-grid .bf-card a, .bf-pin a')]; return a.findIndex(e => { const r = e.getBoundingClientRect(); return r.top > 80 && r.top < innerHeight - 120 && r.width > 40; }); });
    const card = T.p.locator('.bf-grid .bf-card a, .bf-pin a').nth(Math.max(0, idx));
    const postHref = await card.getAttribute('href');
    if(D.touch) await card.tap(); else await card.click(); await L.wait(T, 700);
    s = await st(T); steps.push(['post', s.hash, s.y]);
    const postTopOk = s.y < 5;
    await L.ev(T, () => { const r = document.querySelector('.bf-related'); if(r) scrollTo(0, r.getBoundingClientRect().top + scrollY - 120); }); await L.wait(T, 500);
    const yPost = (await st(T)).y;
    const rel = T.p.locator('.bf-related .bf-card a').first(); const relHref = await rel.getAttribute('href');
    if(D.touch) await rel.tap(); else await rel.click(); await L.wait(T, 700);
    s = await st(T); steps.push(['related', s.hash, s.y]);
    const relOk = s.hash === relHref && s.y < 5;
    await T.p.goBack({waitUntil: 'commit'}).catch(() => {}); await L.wait(T, 900); const b1 = await st(T); steps.push(['back1', b1.hash, b1.y]);
    await T.p.goBack({waitUntil: 'commit'}).catch(() => {}); await L.wait(T, 900); const b2 = await st(T); steps.push(['back2', b2.hash, b2.y]);
    await T.p.goBack({waitUntil: 'commit'}).catch(() => {}); await L.wait(T, 900); const b3 = await st(T); steps.push(['back3', b3.hash, b3.y]);
    await T.p.goForward({waitUntil: 'commit'}).catch(() => {}); await L.wait(T, 900); const f1 = await st(T); steps.push(['fwd1', f1.hash, f1.y]);
    R.add('J1a-nav', 'home → category → post → related: each opens at the top', catOk && postTopOk && relOk, {measured: JSON.stringify(steps.slice(0, 3))});
    R.add('J1b-back1', 'back #1 → the first post at the same scroll spot', b1.hash === postHref && Math.abs(b1.y - yPost) < 80, {measured: b1.hash + ' y=' + b1.y, expected: postHref + ' y≈' + yPost});
    R.add('J1c-back2', 'back #2 → category at the same scroll spot', b2.hash === '#/journal/topic/care' && Math.abs(b2.y - yCat) < 80, {measured: b2.hash + ' y=' + b2.y, expected: '#/journal/topic/care y≈' + yCat});
    R.add('J1d-back3', 'back #3 → blog home at top', b3.hash === '#/journal' && b3.y < 80, {measured: b3.hash + ' y=' + b3.y});
    R.add('J1e-fwd', 'forward → category again', f1.hash === '#/journal/topic/care', {measured: f1.hash + ' y=' + f1.y});
    await L.shot(T, D.name + '-J1-after-back');
  }catch(e){ R.add('J1-crash', 'journey J1 ran', false, {measured: String(e).slice(0, 200)}); }

  /* J2 product block: Add to bag really adds */
  if(run('J2')) try{
    await L.go(T, '#/journal/how-to-keep-a-polo-shirt-in-shape', 700);
    const n0 = await L.ev(T, () => bagCount());
    await L.tap(T, '.bf-prods [data-act="bf-add"]');
    const sheet = await L.ev(T, () => !!document.querySelector('.modal-back .bf-addm'));
    await L.shot(T, D.name + '-J2-sizesheet');
    /* add without size → asks for a size */
    await L.tap(T, '.modal-back [data-act="bf-add-go"]');
    const err = await L.ev(T, () => !!document.querySelector('.modal-back .bf-news-e'));
    await L.tap(T, '.modal-back .bf-sz:not(.oos)');
    await L.tap(T, '.modal-back [data-act="bf-add-go"]');
    const n1 = await L.ev(T, () => bagCount()), toast = await L.ev(T, () => (document.querySelector('.toast') || {}).textContent || '');
    const hdr = await L.ev(T, () => { const b = document.querySelector('.hdr [href="#/bag"] .badge, .hdr .bag-count, .hdr [data-testid=bag-count], .hdr .cnt'); return b ? b.textContent.trim() : null; });
    R.add('J2-addbag', 'product block "Add to bag" → size sheet → really in the bag', sheet && err && n1 === n0 + 1 && /Added|ব্যাগে/.test(toast), {measured: 'sheet ' + sheet + ', no-size error ' + err + ', bag ' + n0 + '→' + n1 + ', toast "' + toast + '", header badge ' + hdr});
    /* product ad's Add button */
    const adBtn = await T.p.locator('[data-bf-ad] [data-act="bf-add"]').filter({visible: true}).count();
    if(adBtn){ await L.tap(T, '[data-bf-ad] [data-act="bf-add"]'); const ok = await L.ev(T, () => !!document.querySelector('.modal-back .bf-addm')); const nsz = await T.p.locator('.modal-back .bf-sz:not(.oos)').count(); await L.tap(T, '.modal-back .bf-sz:not(.oos)', nsz - 1); await L.tap(T, '.modal-back [data-act="bf-add-go"]'); const n2 = await L.ev(T, () => bagCount()); R.add('J2b-adadd', 'product ad "Add to bag" adds too', ok && n2 === n1 + 1, {measured: 'bag ' + n1 + '→' + n2}); }
    else R.add('J2b-adadd', 'product ad "Add to bag" (no product ad with Add on this page/width)', null, {measured: 'none visible'});
  }catch(e){ R.add('J2-crash', 'journey J2 ran', false, {measured: String(e).slice(0, 200)}); }

  /* J3 share links */
  if(run('J3')) try{
    await L.go(T, '#/journal/how-to-wash-denim', 700);
    const sh = await L.ev(T, () => { const q = s => document.querySelector(s); return {title: document.querySelector('h1').textContent, wa: q('.bf-sh.wa').getAttribute('href'), fb: q('.bf-sh.fb').getAttribute('href'), cp: q('.bf-sh.cp').dataset.url, waT: q('.bf-sh.wa').target, rel: q('.bf-sh.wa').rel}; });
    const want = 'journal/how-to-wash-denim';
    const waTxt = decodeURIComponent((sh.wa.split('text=')[1] || ''));
    const fbU = decodeURIComponent((sh.fb.split('u=')[1] || ''));
    R.add('J3a-wa', 'WhatsApp share = wa.me + title + post link', /^https:\/\/wa\.me\/\?text=/.test(sh.wa) && waTxt.indexOf(sh.title) === 0 && waTxt.indexOf(want) > 0 && sh.waT === '_blank', {measured: sh.wa.slice(0, 160)});
    R.add('J3b-fb', 'Facebook share = sharer.php?u=<post link>', /^https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/.test(sh.fb) && fbU.indexOf(want) > 0, {measured: sh.fb.slice(0, 160)});
    R.add('J3c-linkform', 'shared link form (info: demo runs from file://, live build must share https://extas.com.bd/journal/<slug>)', null, {measured: fbU.slice(0, 120), expected: 'https://extas.com.bd/journal/how-to-wash-denim (live build)', note: 'demo runs from file://'});
    await L.tap(T, '.bf-sh.cp');
    const clip = await L.ev(T, () => navigator.clipboard.readText().catch(e => 'ERR ' + e)); const toast = await L.ev(T, () => (document.querySelector('.toast') || {}).textContent || '');
    R.add('J3d-copy', 'Copy link copies the post link + says so', clip.indexOf(want) > 0 && /copied|কপি/.test(toast), {measured: 'clipboard "' + clip.slice(0, 100) + '" toast "' + toast + '"'});
  }catch(e){ R.add('J3-crash', 'journey J3 ran', false, {measured: String(e).slice(0, 200)}); }

  /* J4 Bengali twin */
  if(run('J4')) try{
    await L.go(T, '#/journal/how-to-keep-a-polo-shirt-in-shape', 700);
    const before = await st(T);
    await L.wait(T, 1500); const still = await st(T);
    await L.tap(T, '.bf-eyebrow a.bf-langl');
    await L.wait(T, 500);
    const bn = await L.ev(T, () => ({hash: location.hash, h1: document.querySelector('h1').textContent, lang: document.querySelector('h1').getAttribute('lang'), back: (document.querySelector('.bf-eyebrow a.bf-langl') || {}).getAttribute ? document.querySelector('.bf-eyebrow a.bf-langl').getAttribute('href') : null, htmlLang: document.documentElement.lang}));
    R.add('J4a-twin', 'twin link opens the Bengali post (Bengali text)', bn.hash === '#/bn/journal/how-to-keep-a-polo-shirt-in-shape' && /[ঀ-৲৴-৿]/.test(bn.h1) && bn.lang === 'bn' && bn.back === '#/journal/how-to-keep-a-polo-shirt-in-shape', {measured: JSON.stringify(bn)});
    R.add('J4b-noredirect', 'no automatic redirect on the English post', before.hash === still.hash, {measured: before.hash + ' → ' + still.hash});
    await L.shot(T, D.name + '-J4-bnpost');
    /* site language Bengali + Bengali browser: English URL must stay English */
    await L.ev(T, () => { ST.lang = 'bn'; saveState(); });
    await L.go(T, '#/journal/how-to-keep-a-polo-shirt-in-shape', 1500);
    const s2 = await st(T);
    R.add('J4c-noredirect-bnsite', 'site switched to Bengali: English URL is not redirected', s2.hash === '#/journal/how-to-keep-a-polo-shirt-in-shape', {measured: s2.hash + ' h1 "' + s2.h1.slice(0, 40) + '"'});
    await L.ev(T, () => { ST.lang = 'en'; saveState(); });
    /* Bengali post without a twin */
    await L.go(T, '#/bn/journal/how-to-wash-denim', 700);
    const nb = await L.ev(T, () => ({note: (document.querySelector('.bf-bnnote') || {}).textContent || null, hash: location.hash}));
    R.add('J4d-notwin', 'Bengali URL of a post with no twin explains it shows in English', !!nb.note, {measured: JSON.stringify(nb)});
  }catch(e){ R.add('J4-crash', 'journey J4 ran', false, {measured: String(e).slice(0, 200)}); }

  /* J5 search */
  if(run('J5')) try{
    await L.go(T, '#/journal', 600);
    if(!(await T.p.locator('#bf-q').isVisible().catch(() => false)) && await T.p.locator('.bf-sbtn').count()){ await L.tap(T, '.bf-sbtn'); await L.wait(T, 300); }
    await T.p.locator('#bf-q').fill('denim'); await T.p.locator('#bf-q').press('Enter'); await L.wait(T, 700);
    const s1 = await L.ev(T, () => ({hash: location.hash, n: document.querySelectorAll('.bf-grid .bf-card').length, first: (document.querySelector('.bf-grid .bf-card a') || {}).getAttribute ? document.querySelector('.bf-grid .bf-card a').getAttribute('href') : null, status: document.querySelector('.bf-resc').textContent}));
    R.add('J5a-search', 'search "denim" returns the denim guide', /search\?q=denim/.test(s1.hash) && s1.n > 0 && /how-to-wash-denim/.test(s1.first), {measured: JSON.stringify(s1)});
    await L.go(T, '#/journal/search?q=' + encodeURIComponent('পোলো'), 600);
    const s2 = await L.ev(T, () => ({n: document.querySelectorAll('.bf-grid .bf-card').length, status: document.querySelector('.bf-resc').textContent}));
    R.add('J5b-searchbn', 'Bengali search "পোলো" finds polo guides', s2.n > 0, {measured: JSON.stringify(s2)});
    await L.go(T, '#/bn/journal/search?q=' + encodeURIComponent('পোলো'), 600);
    const s2b = await L.ev(T, () => ({n: document.querySelectorAll('.bf-grid .bf-card').length, status: document.querySelector('.bf-resc').textContent}));
    R.add('J5b2-searchbn-bnroute', 'Bengali search on the Bengali blog finds polo guides', s2b.n > 0, {measured: JSON.stringify(s2b)});
    await L.go(T, '#/journal/search?q=zzqq', 600);
    const s3 = await L.ev(T, () => ({n: document.querySelectorAll('.bf-grid .bf-card').length, status: document.querySelector('.bf-resc').textContent, tags: document.querySelectorAll('.bf-noresult .bf-tag').length}));
    R.add('J5c-noresult', 'no-result search says so and offers tags', s3.n === 0 && s3.tags > 0 && /No guides|পাওয়া যায়নি/.test(s3.status), {measured: JSON.stringify(s3)});
    await L.go(T, '#/journal/search?q=wash', 600);
    const s4 = await L.ev(T, () => [...document.querySelectorAll('.bf-grid .bf-card a')].map(a => a.getAttribute('href').split('/').pop()));
    R.add('J5d-searchsyn', 'search "wash" (info: results order)', null, {measured: s4.slice(0, 6).join(', ')});
  }catch(e){ R.add('J5-crash', 'journey J5 ran', false, {measured: String(e).slice(0, 200)}); }

  /* J6 archive */
  if(run('J6')) try{
    await L.go(T, '#/journal/archive', 600);
    const m = await L.ev(T, () => [...document.querySelectorAll('.bf-browse .bf-rows a[href*="/archive/"]')].map(a => [a.getAttribute('href'), +a.querySelector('.bf-cnt').textContent]));
    const tot = await L.ev(T, () => bfList().length);
    await L.tap(T, '.bf-browse .bf-rows a[href*="/archive/"]');
    const s = await L.ev(T, () => ({hash: location.hash, n: document.querySelectorAll('.bf-grid .bf-card').length, more: !!document.querySelector('.bf-more-b'), h1: document.querySelector('h1').textContent}));
    R.add('J6-archive', 'archive lists months, month page lists that month', m.length > 0 && m.reduce((a, x) => a + x[1], 0) === tot && s.hash === m[0][0] && (s.n === Math.min(8, m[0][1]) || s.n === m[0][1]), {measured: JSON.stringify(m) + ' total ' + tot + ' → ' + JSON.stringify(s)});
  }catch(e){ R.add('J6-crash', 'journey J6 ran', false, {measured: String(e).slice(0, 200)}); }

  /* J7 tag + author pages */
  if(run('J7')) try{
    await L.go(T, '#/journal/how-to-wash-denim', 700);
    await L.tap(T, '.bf-ptags a.bf-tag');
    const tg = await L.ev(T, () => { const tag = location.hash.split('/tag/')[1]; const exp = bfList().filter(p => p.tags.indexOf(tag) >= 0).map(p => p.slug); const got = [...document.querySelectorAll('.bf-grid .bf-card a')].map(a => a.getAttribute('href').split('/').pop()); return {tag, exp, got}; });
    R.add('J7a-tag', 'tag link → tag page lists exactly the tagged guides', tg.got.length > 0 && tg.exp.slice(0, 8).every(x => tg.got.includes(x)) && tg.got.every(x => tg.exp.includes(x)), {measured: JSON.stringify(tg)});
    await L.go(T, '#/journal/how-to-wash-denim', 700);
    await L.tap(T, '.bf-about-l');
    const au = await L.ev(T, () => { const id = location.hash.split('/author/')[1]; const exp = bfList().filter(p => p.author === id).map(p => p.slug); const got = [...document.querySelectorAll('.bf-grid .bf-card a')].map(a => a.getAttribute('href').split('/').pop()); return {id, exp, got, h1: document.querySelector('h1').textContent, honest: !!document.querySelector('.bf-honest'), img: document.querySelectorAll('.bf-auth img').length, rev: /Reviewed by/.test((document.querySelector('.bf-honest') || {}).textContent || '')}; });
    R.add('J7b-author', 'author page: honest AI note, no photo, lists their guides', !!au.id && au.honest && au.img === 0 && !au.rev && au.got.length === Math.min(8, au.exp.length) && au.got.every(x => au.exp.includes(x)), {measured: JSON.stringify(au)});
    /* every author page */
    const all = await L.ev(T, () => bfAuthors().map(a => a.id));
    const empty = [];
    for(const id of all){ await L.go(T, '#/journal/author/' + id, 400); const n = await L.ev(T, () => document.querySelectorAll('.bf-grid .bf-card').length); if(!n) empty.push(id); }
    R.add('J7c-authors', 'every author page has guides', empty.length === 0, {measured: empty.length ? 'empty: ' + empty.join(',') : 'all have guides'});
  }catch(e){ R.add('J7-crash', 'journey J7 ran', false, {measured: String(e).slice(0, 200)}); }

  /* J8 load more + keyboard focus */
  if(run('J8')) try{
    await L.go(T, '#/journal', 600);
    const n0 = await L.ev(T, () => document.querySelectorAll('.bf-grid .bf-card').length);
    await L.tap(T, '.bf-more-b');
    const r = await L.ev(T, () => ({n: document.querySelectorAll('.bf-grid .bf-card').length, focus: document.activeElement && document.activeElement.closest('.bf-card') ? document.activeElement.closest('.bf-card').dataset.i : null, ads: document.querySelectorAll('.bf-gridad').length}));
    R.add('J8-more', 'Load more adds 8 cards, focus to the first new one', r.n > n0 && String(r.focus) === String(n0), {measured: n0 + '→' + r.n + ' focus card ' + r.focus + ', grid ads ' + r.ads});
  }catch(e){ R.add('J8-crash', 'journey J8 ran', false, {measured: String(e).slice(0, 200)}); }

  /* J9 pull to refresh (touch) */
  if(run('J9') && D.touch) try{
    await L.go(T, '#/journal', 700); await L.ev(T, () => scrollTo(0, 0)); await L.wait(T, 200);
    const ind = await L.pullDown(T, 260);
    await L.wait(T, 1500);
    const after = await st(T);
    R.add('J9-ptr', 'pull-to-refresh shows, arms and refreshes the blog', !!(ind && ind.visible && ind.armed) && after.hash === '#/journal' && after.h1.length > 3, {measured: JSON.stringify(ind) + ' after ' + after.hash});
    await L.go(T, '#/journal/how-to-wash-denim', 700); await L.ev(T, () => scrollTo(0, 0));
    const ind2 = await L.pullDown(T, 260); await L.wait(T, 1500); const a2 = await st(T);
    R.add('J9b-ptr-post', 'pull-to-refresh on a post', !!(ind2 && ind2.visible) && a2.hash === '#/journal/how-to-wash-denim', {measured: JSON.stringify(ind2)});
  }catch(e){ R.add('J9-crash', 'journey J9 ran', false, {measured: String(e).slice(0, 200)}); }

  /* J10 newsletter */
  if(run('J10')) try{
    await L.go(T, '#/journal', 600);
    const f = T.p.locator('#bf-news-i-home'); await f.scrollIntoViewIfNeeded(); await f.fill('abc'); await f.press('Enter'); await L.wait(T, 300);
    const e1 = await L.ev(T, () => !!document.querySelector('#bf-news-e-home'));
    await T.p.locator('#bf-news-i-home').fill('01712345678'); await T.p.locator('#bf-news-i-home').press('Enter'); await L.wait(T, 300);
    const ok = await L.ev(T, () => !!document.querySelector('.bf-news-ok'));
    R.add('J10-news', 'newsletter: wrong input warns, phone number accepted', e1 && ok, {measured: 'error ' + e1 + ', ok ' + ok});
  }catch(e){ R.add('J10-crash', 'journey J10 ran', false, {measured: String(e).slice(0, 200)}); }

  /* J11 TOC jump (phone: open details, tap item) */
  if(run('J11')) try{
    await L.go(T, '#/journal/how-to-wash-denim', 700);
    if(D.w < 1100){ await L.tap(T, 'details.bf-tocm summary'); await L.wait(T, 200); await L.tap(T, 'details.bf-tocm a', 1); }
    else await L.tap(T, '.bf-tocd a', 1);
    await L.wait(T, 900);
    const r = await L.ev(T, () => { const h = document.getElementById('bf-s2'); const hr = document.querySelector('.hdr'); return {top: Math.round(h.getBoundingClientRect().top), hdr: hr ? Math.round(hr.getBoundingClientRect().bottom) : 0, open: !!(document.querySelector('details.bf-tocm') || {}).open}; });
    R.add('J11-toc', 'TOC item jumps to its section below the header', r.top >= r.hdr - 2 && r.top < r.hdr + 120 && !r.open, {measured: JSON.stringify(r)});
  }catch(e){ R.add('J11-crash', 'journey J11 ran', false, {measured: String(e).slice(0, 200)}); }

  R.add('J99-errors', 'JS errors during journeys', T.errs.length === 0, {measured: T.errs.slice(0, 5).join(' | ') || 'none'});
  await L.close(T);
})().catch(e => { console.error('CRASH', e); R.add('J00-crash', 'journeys crashed', false, {measured: String(e).slice(0, 300)}); process.exit(1); });
