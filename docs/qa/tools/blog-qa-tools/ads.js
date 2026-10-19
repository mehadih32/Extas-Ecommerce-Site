/* House-ad checker, R2 rules.  usage: node ads.js <device> [only]
   R2 rules (coordinator, decisions): categories set → categories decide; else match 'related' = post products or tags
   match the ad's shop category; 'all' = every post; picked posts override; ≤3 ads per post (phone and desktop);
   no ad above paragraph 1, post-top after section 1; never the same ad twice on a page; empty slots collapse;
   dates = whole days Asia/Dhaka; denim post gets no polo ads. */
const L = require('./lib');
const D = L.dev(process.argv[2]); const only = process.argv[3];
const R = L.Rec('ads', D.name);
const run = k => !only || only.split(',').includes(k);

/* the rule written independently of the shop and back-end code */
function installRule(){
  window.QA_today = ts => { const p = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(ts || Date.now())); return p; };
  window.QA_adCats = a => { const out = new Set(); const pc = id => { const p = P(id); if(p) out.add(p.cat); };
    if(a.type === 'product') pc(a.productId);
    if(a.type === 'combo'){ const c = (DB.combos || []).find(x => x.id === a.comboId); ((c && c.items) || []).forEach(i => pc(typeof i === 'string' ? i : (i.id || i.p))); }
    if(a.catId) out.add(a.catId);
    const m = String(a.link || '').match(/^#\/(c|p|combo)\/([\w-]+)/); if(m){ if(m[1] === 'c') out.add(m[2]); else if(m[1] === 'p') pc(m[2]); else { const c = (DB.combos || []).find(x => x.id === m[2]); ((c && c.items) || []).forEach(i => pc(typeof i === 'string' ? i : i.id)); } }
    return [...out]; };
  window.QA_catWords = cats => { const w = new Set(); cats.forEach(id => { const c = CAT(id) || {}; [id, id.replace(/s$/, ''), id.replace(/-/g, ' ')].concat(String(c.name || '').toLowerCase().split(/[^a-z0-9]+/)).forEach(x => { if(x && x.length > 2){ w.add(x); w.add(x.replace(/s$/, '')); } }); }); return w; };
  window.QA_related = (a, post) => { const cats = QA_adCats(a); const pcats = (post.products || []).map(id => (P(id) || {}).cat).filter(Boolean); if(cats.some(c => pcats.includes(c))) return 'product'; const w = QA_catWords(cats); const tag = (post.tags || []).find(t => String(t).toLowerCase().split(/[^a-z0-9]+/).some(x => w.has(x) || w.has(x.replace(/s$/, '')))); return tag ? 'tag:' + tag : ''; };
  window.QA_post = slug => { const l = bfAll(); return l.find(p => p.slug === slug) || null; };
  window.QA_expect = (slot, ctx) => (ST.blogAds || []).filter(a => {
    const t = QA_today();
    if(a.active === false) return false; if(a.start && t < a.start) return false; if(a.end && t > a.end) return false;
    if((a.slots || []).indexOf(slot) < 0) return false;
    if(a.type === 'product' && !P(a.productId)) return false; if(a.type === 'combo' && !(typeof COMBO === 'function' && COMBO(a.comboId))) return false; if(a.type === 'category' && !CAT(a.catId)) return false;
    if(/^post-/.test(slot)){
      const post = QA_post(ctx.slug); if(!post) return false;
      if(a.posts && a.posts.length) return a.posts.includes(ctx.slug);
      if(a.pillars && a.pillars.length) return a.pillars.includes(post.pillar);
      if(a.match !== 'related') return true;
      return !!QA_related(a, post);
    }
    if(a.posts && a.posts.length) return false;          /* a post-only ad never on list pages */
    if(ctx.pillar && a.pillars && a.pillars.length) return a.pillars.includes(ctx.pillar);
    return true;
  }).map(a => a.id);
  window.QA_href = a => a.type === 'product' ? '#/p/' + a.productId : a.type === 'combo' ? '#/combo/' + a.comboId : a.type === 'category' ? '#/c/' + a.catId : a.link;
  window.QA_rendered = () => [...document.querySelectorAll('[data-bf-ad]')].filter(x => !x.closest('.modal-back')).map(x => ({slot: x.dataset.bfSlot, ad: x.dataset.bfAd, href: (x.querySelector('a.bf-adt, a.bf-bar-b') || x.querySelector('a') || {getAttribute: () => null}).getAttribute('href'), vis: x.id === 'bf-bar' || !!x.offsetParent, title: ((x.querySelector('.bf-adt, .bf-bar-t') || {}).textContent || '').trim(), lab: ((x.querySelector('.bf-adlab, .bf-bar-l') || {}).textContent || '').trim()}));
}
async function setAds(T, f, arg){ await L.ev(T, ([src, arg]) => { const fn = new Function('arg', src); fn(arg); saveState(); }, [f, arg]); }

(async () => {
  const T = await L.open(D, {init: installRule});
  await L.prep(T, '#/admin/blog?tab=ads'); await L.wait(T, 600);   /* the back end seeds ST.blogAds */
  await L.go(T, '#/journal', 500);

  /* A1 every page: each ad shown is allowed; slots with allowed ads show one (unless the per-post cap is used up) */
  if(run('A1')){
    const pages = await L.ev(T, () => [['#/journal', {page: 'home'}, 'home']].concat(bfPillars().map(p => ['#/journal/topic/' + p.id, {page: 'topic', pillar: p.id}, 'topic-' + p.id]), [['#/journal/tag/polo', {page: 'tag'}, 'tag-polo']], bfList().filter(p => p.lang === 'en').map(p => ['#/journal/' + p.slug, {page: 'post', pillar: p.pillar, slug: p.slug}, 'post-' + p.slug]), bfList().filter(p => p.bn).map(p => ['#/bn/journal/' + p.slug, {page: 'post', pillar: p.pillar, slug: p.slug, bn: true}, 'bnpost-' + p.slug])));
    const bad = [], hrefBad = [], unlabelled = [], notInStore = [], seen = {}, oracle = [], miss = [];
    for(const [hash, ctx, tag] of pages){
      await L.go(T, hash, 450);
      const r = await L.ev(T, ([ctx]) => QA_rendered().map(x => { const bctx = ctx.page === 'post' ? {pillar: ctx.pillar, slug: ctx.slug} : ctx.page === 'topic' ? {pillar: ctx.pillar} : {}; let exp; try{ exp = zb_adsFor(x.slot, bctx).map(a => a.id); }catch(e){ exp = QA_expect(x.slot, ctx); } if(ctx.page !== 'post') exp = exp.filter(id => { const a = (ST.blogAds || []).find(y => y.id === id); return !(a && a.posts && a.posts.length); }); const ad = (ST.blogAds || []).find(a => a.id === x.ad); const why = (ad && /^post-/.test(x.slot) && typeof zb_adWhy === 'function') ? (() => { try{ return zb_adWhy(ad, zb_postBySlug(ctx.slug)); }catch(e){ return 'ERR'; } })() : null; return Object.assign(x, {exp, ok: exp.includes(x.ad), inStore: !!ad, wantHref: ad ? QA_href(ad) : null, why}); }), [ctx]);
      r.forEach(x => { seen[x.slot + '=' + x.ad] = (seen[x.slot + '=' + x.ad] || 0) + 1; if(!x.inStore) notInStore.push(tag + ' ' + x.slot + '=' + x.ad); else if(!x.ok) bad.push(tag + ' ' + x.slot + '=' + x.ad + ' (allowed: ' + (x.exp.join('/') || 'none') + (x.why ? '; back end says "' + x.why + '"' : '') + ')'); if(x.wantHref && x.href !== x.wantHref) hrefBad.push(tag + ' ' + x.ad + ' ' + x.href + '≠' + x.wantHref); if(!/EXTAS/.test(x.lab)) unlabelled.push(tag + ' ' + x.ad); });
      if(ctx.page === 'post'){ const dis = await L.ev(T, ([ctx]) => { const out = []; const post = zb_postBySlug ? zb_postBySlug(ctx.slug) : null; (ST.blogAds || []).forEach(a => { if(!(a.slots || []).some(s => /^post-/.test(s)) || a.active === false) return; let mine = false; const p = QA_post(ctx.slug); if(a.posts && a.posts.length) mine = a.posts.includes(ctx.slug); else if(a.pillars && a.pillars.length) mine = a.pillars.includes(p.pillar); else mine = a.match !== 'related' || !!QA_related(a, p); let theirs = null; try{ theirs = !!zb_adWhy(a, post); }catch(e){} if(theirs !== null && theirs !== mine) out.push(a.id + ' qa=' + mine + ' backend=' + theirs); }); return out; }, [ctx]); dis.forEach(x => oracle.push(tag + ' ' + x)); }
    }
    R.add('A1a-rules', 'each ad shown is allowed by the back end\'s own rule (zb_adsFor: dates / slot / categories / related / picked posts); post-only ads never on list pages', bad.length === 0, {measured: bad.length + ' wrong: ' + bad.slice(0, 8).join('; '), detail: bad});
    R.add('A1b-oracle', 'independent re-implementation of the rule vs the back end (info: differences)', null, {measured: oracle.length + ': ' + oracle.slice(0, 8).join('; ')});
    R.add('A1c-href', 'ad click goes to its product / combo / category', hrefBad.length === 0, {measured: hrefBad.slice(0, 6).join('; ') || 'all match'});
    R.add('A1d-label', 'every ad carries the "EXTAS offer" label', unlabelled.length === 0, {measured: unlabelled.join('; ') || 'all labelled'});
    R.add('A1e-store', 'every ad on the shop comes from the back-end list', notInStore.length === 0, {measured: notInStore.join(', ') || 'all'});
    R.add('A1f-mix', 'ads seen per slot (info)', null, {measured: JSON.stringify(seen)});
  }

  /* A10 per post: ≤3 ads, unique, nothing above paragraph 1, post-top after section 1, empty slots collapse */
  if(run('A10')){
    const slugs = await L.ev(T, () => bfList().filter(p => p.lang === 'en').map(p => p.slug).concat(bfList().filter(p => p.bn).map(p => 'bn:' + p.slug)));
    const over = [], dup = [], above = [], topPos = [], empty = [], counts = {};
    for(const s of slugs){
      const bn = s.startsWith('bn:'), slug = s.replace('bn:', '');
      await L.go(T, (bn ? '#/bn/journal/' : '#/journal/') + slug, 450);
      const r = await L.ev(T, () => {
        const ads = [...document.querySelectorAll('[data-bf-ad]')].filter(x => !x.closest('.modal-back') && (x.id === 'bf-bar' || !!x.offsetParent));
        const p1 = document.querySelector('.bf-prose p'), y1 = p1 ? p1.getBoundingClientRect().top + scrollY : 0;
        const s1 = document.getElementById('bf-s1'), s2 = document.getElementById('bf-s2');
        const inArt = ads.filter(x => x.closest('.bf-art')).map(x => ({slot: x.dataset.bfSlot, ad: x.dataset.bfAd, y: Math.round(x.getBoundingClientRect().top + scrollY)}));
        const top = ads.find(x => x.dataset.bfSlot === 'post-top'); const ty = top ? top.getBoundingClientRect().top + scrollY : null;
        const wraps = [...document.querySelectorAll('.bf-top, .bf-ptop, .bf-pend, .bf-gridad, .bf-side-ad')].filter(w => !w.querySelector('[data-bf-ad]')).map(w => ({c: w.className, h: Math.round(w.getBoundingClientRect().height)})).filter(w => w.h > 0);
        return {n: ads.length, ids: ads.map(x => x.dataset.bfAd), slots: ads.map(x => x.dataset.bfSlot + '=' + x.dataset.bfAd), above: inArt.filter(x => x.y < y1).map(x => x.slot + '=' + x.ad), top: top ? {y: Math.round(ty), s1: s1 ? Math.round(s1.getBoundingClientRect().top + scrollY) : null, s2: s2 ? Math.round(s2.getBoundingClientRect().top + scrollY) : null} : null, empty: wraps};
      });
      counts[s] = r.n + ' ' + r.slots.join(',');
      if(r.n > 3) over.push(s + ' ' + r.n + ' [' + r.slots.join(', ') + ']');
      if(new Set(r.ids).size !== r.ids.length) dup.push(s + ' [' + r.slots.join(', ') + ']');
      if(r.above.length) above.push(s + ' ' + r.above.join(','));
      if(r.top && r.top.s1 !== null && !(r.top.y > r.top.s1 && (r.top.s2 === null || r.top.y < r.top.s2))) topPos.push(s + ' ' + JSON.stringify(r.top));
      if(r.empty.length) empty.push(s + ' ' + JSON.stringify(r.empty));
    }
    R.add('A10a-max3', 'at most 3 ads on a post (all slots together, incl. the slim bar)', over.length === 0, {measured: over.length + ': ' + over.slice(0, 6).join('; ')});
    R.add('A10b-nodup', 'the same ad never twice on a page', dup.length === 0, {measured: dup.slice(0, 6).join('; ') || 'none'});
    R.add('A10c-p1', 'no ad above paragraph 1', above.length === 0, {measured: above.slice(0, 6).join('; ') || 'none'});
    R.add('A10d-topsec', 'post-top ad sits after section 1 (between the 1st and 2nd heading)', topPos.length === 0, {measured: topPos.slice(0, 6).join('; ') || 'ok'});
    R.add('A10e-collapse', 'empty ad slots collapse (no blank box)', empty.length === 0, {measured: empty.slice(0, 4).join('; ') || 'none'});
    R.add('A10f-counts', 'ads per post (info)', null, {measured: JSON.stringify(counts)});
    /* list pages: no duplicates, empty slots collapse */
    const ld = [];
    for(const h of ['#/journal', '#/journal/topic/care', '#/journal/topic/fabric', '#/journal/tag/denim', '#/bn/journal']){ await L.go(T, h, 400); const r = await L.ev(T, () => { const ids = [...document.querySelectorAll('[data-bf-ad]')].map(x => x.dataset.bfAd); const wraps = [...document.querySelectorAll('.bf-top, .bf-gridad')].filter(w => !w.querySelector('[data-bf-ad]') && w.getBoundingClientRect().height > 0).length; return {ids, wraps}; }); if(r.wraps) ld.push(h + ' empty box ×' + r.wraps); }
    R.add('A10g-listcollapse', 'list pages: empty ad slots collapse', ld.length === 0, {measured: ld.join('; ') || 'none'});
  }

  /* A11 relevance that the owner named */
  if(run('A11')){
    const adsOn = async h => { await L.go(T, h, 450); await L.ev(T, () => { const a = document.getElementById('bf-article'); if(a) scrollTo(0, a.offsetTop + a.offsetHeight * 0.75 - innerHeight); }); await L.wait(T, 400); return L.ev(T, () => QA_rendered().map(x => { const a = (ST.blogAds || []).find(y => y.id === x.ad); return {slot: x.slot, ad: x.ad, cats: a ? QA_adCats(a) : []}; })); };
    const den = await adsOn('#/journal/how-to-wash-denim');
    const polo = den.filter(x => x.cats.includes('polos'));
    R.add('A11a-denim', 'denim post gets no polo ads', polo.length === 0, {measured: 'denim post ads: ' + JSON.stringify(den.map(x => x.slot + '=' + x.ad + '[' + x.cats + ']'))});
    const pol = await adsOn('#/journal/how-to-keep-a-polo-shirt-in-shape');
    R.add('A11b-polo', 'polo post: its ads sell polos or match its category (info)', null, {measured: JSON.stringify(pol.map(x => x.slot + '=' + x.ad + '[' + x.cats + ']'))});
    const hood = [], allowedH = []; for(const s of await L.ev(T, () => bfList().filter(p => p.lang === 'en').map(p => p.slug))){ const ok = await L.ev(T, s => { const p = bfFind(s); return ['post-top','post-inline','post-sidebar','post-end','post-bar'].some(sl => zb_adsFor(sl, {pillar: p.pillar, slug: s}).some(a => a.id === 'ad-winter-hoodie')); }, s); if(ok) allowedH.push(s); const r = await adsOn('#/journal/' + s); if(r.some(x => x.ad === 'ad-winter-hoodie') && !ok) hood.push(s); }
    R.add('A11c-hoodie', 'hoodie banner shows only on posts the back end allows (zb_adsFor; seed: care + season)', hood.length === 0, {measured: 'outside the rule: ' + (hood.join(', ') || 'none') + ' · allowed on: ' + allowedH.join(', ')});
  }

  /* A12 Bengali pages show Bengali ad text */
  if(run('A12')){
    const en = [];
    for(const h of ['#/bn/journal', '#/bn/journal/how-to-keep-a-polo-shirt-in-shape', '#/bn/journal/how-a-polo-should-fit']){ await L.go(T, h, 450); await L.ev(T, () => { const a = document.getElementById('bf-article'); if(a) scrollTo(0, a.offsetTop + a.offsetHeight * 0.75 - innerHeight); }); await L.wait(T, 400); const r = await L.ev(T, () => QA_rendered().filter(x => x.title && !/[ঀ-৲৴-৿]/.test(x.title)).map(x => x.slot + '="' + x.title + '"')); r.forEach(x => en.push(h.split('/').pop() + ' ' + x)); }
    R.add('A12-bnads', 'Bengali pages show the ads\' Bengali text', en.length === 0, {measured: en.slice(0, 6).join('; ') || 'all Bengali'});
  }

  /* A2 dates (whole Dhaka days) */
  if(run('A2')){
    const today = await L.ev(T, () => QA_today());
    const y = await L.ev(T, () => QA_today(Date.now() - 86400000)), tm = await L.ev(T, () => QA_today(Date.now() + 86400000));
    const homeTop = async () => { await L.go(T, '#/journal', 400); return L.ev(T, () => (document.querySelector('[data-bf-slot="home-top"]') || {}).dataset ? document.querySelector('[data-bf-slot="home-top"]').dataset.bfAd : null); };
    const base = await homeTop();
    await setAds(T, 'ST.blogAds.forEach(a => { if(a.id === arg.id) a.end = arg.d; });', {id: base, d: y}); const e1 = await homeTop();
    await setAds(T, 'ST.blogAds.forEach(a => { if(a.id === arg.id){ a.end = ""; a.start = arg.d; } });', {id: base, d: tm}); const e2 = await homeTop();
    await setAds(T, 'ST.blogAds.forEach(a => { if(a.id === arg.id){ a.start = arg.d; a.end = arg.d; } });', {id: base, d: today}); const e3 = await homeTop();
    await setAds(T, 'ST.blogAds.forEach(a => { if(a.id === arg.id){ a.start = ""; a.end = ""; } });', {id: base});
    R.add('A2a-ended', 'ad that ended yesterday disappears', !!base && e1 !== base, {measured: base + ' end=' + y + ' → home-top ' + e1});
    R.add('A2b-future', 'ad that starts tomorrow is not shown yet', !!base && e2 !== base, {measured: 'start=' + tm + ' → ' + e2});
    R.add('A2c-today', 'ad that runs today only is shown', !!base && e3 === base, {measured: 'start=end=' + today + ' → ' + e3});
  }

  /* A3 category + picked-post targeting */
  if(run('A3')){
    await setAds(T, 'ST.blogAds.push({id:"qa-cat-care", type:"category", catId:"polos", title:"QA care-only", titleBn:"QA যত্ন", sub:"", cta:"See", link:"#/c/polos", slots:["cat-top","post-end"], pillars:["care"], posts:[], match:"related", start:"", end:"", active:true, weight:50, popup:{trigger:"scroll",value:50,freq:"session",delay:0}}); ST.blogAds.push({id:"qa-post-gsm", type:"product", productId:"lv-slim-jeans", title:"QA gsm-only", titleBn:"QA জিএসএম", sub:"", cta:"See", link:"#/p/lv-slim-jeans", slots:["post-end"], pillars:[], posts:["what-gsm-means"], match:"related", start:"", end:"", active:true, weight:50, popup:{trigger:"scroll",value:50,freq:"session",delay:0}});');
    const at = async (h, slot) => { await L.go(T, h, 400); return L.ev(T, s => [...document.querySelectorAll('[data-bf-slot="' + s + '"]')].map(x => x.dataset.bfAd), slot); };
    const c1 = await at('#/journal/topic/care', 'cat-top'), c2 = await at('#/journal/topic/style', 'cat-top');
    const p1 = await at('#/journal/what-gsm-means', 'post-end'), p2 = await at('#/journal/how-to-wash-denim', 'post-end'), p3 = await at('#/journal', 'home-top');
    R.add('A3a-pillar', 'category-only ad: on its category, not on others', c1.includes('qa-cat-care') && !c2.includes('qa-cat-care'), {measured: 'care ' + c1 + ' / style ' + c2});
    R.add('A3b-post', 'picked-post ad (unrelated product) shows on that post only — picked posts override relevance', p1.includes('qa-post-gsm') && !p2.includes('qa-post-gsm') && !p3.includes('qa-post-gsm'), {measured: 'gsm ' + p1 + ' / denim ' + p2 + ' / home ' + p3});
    await setAds(T, 'ST.blogAds.push({id:"qa-all", type:"category", catId:"panjabi", title:"QA every post", titleBn:"QA সব লেখায়", sub:"", cta:"See", link:"#/c/panjabi", slots:["post-end"], pillars:[], posts:[], match:"all", start:"", end:"", active:true, weight:99, popup:{trigger:"scroll",value:50,freq:"session",delay:0}}); ST.blogAds.forEach(a => { if(a.id !== "qa-all" && (a.slots||[]).includes("post-end")) a.active = false; });');
    const all = []; for(const s of ['how-to-wash-denim', 'what-gsm-means', 'one-oxford-shirt-three-ways']) all.push(s + ':' + (await at('#/journal/' + s, 'post-end')).join('/'));
    R.add('A3c-all', '"সব লেখায়" (match all) ad shows on every post', all.every(x => /qa-all/.test(x)), {measured: all.join(' ')});
    await setAds(T, 'ST.blogAds = ST.blogAds.filter(a => !/^qa-/.test(a.id)); ST.blogAds.forEach(a => a.active = true);');
  }

  /* A4 grid ad every N cards */
  if(run('A4')){
    const grid = () => L.ev(T, () => { const out = []; let n = 0; const g = document.querySelector('.bf-grid'); if(!g) return out; [...g.children].forEach(c => { if(c.classList.contains('bf-card')) n++; else if(c.classList.contains('bf-gridad')) { out.push(n); n = 0; } }); return out; });
    await L.go(T, '#/journal', 450); const d6 = await grid();
    await setAds(T, 'ST.blogAdSettings.gridEvery = 3;'); await L.go(T, '#/journal', 450); const d3 = await grid();
    await L.tap(T, '.bf-more-b'); const d3m = await grid();
    await setAds(T, 'ST.blogAdSettings.gridEvery = 6;');
    R.add('A4a-grid6', 'grid ad after every 6 cards (default)', d6.length >= 1 && d6.every(x => x === 6), {measured: 'cards between ads ' + JSON.stringify(d6)});
    R.add('A4b-grid3', 'setting 3 → an ad after every 3 cards (no repeat leaves the rest empty, collapsed)', d3.length >= 1 && d3.every(x => x === 3 || x % 3 === 0) && d3m.every(x => x % 3 === 0), {measured: JSON.stringify(d3) + ' after load more ' + JSON.stringify(d3m)});
    await L.go(T, '#/journal/topic/care', 400); const tg = await L.ev(T, () => QA_rendered().filter(x => x.slot === 'home-grid').map(x => x.ad));
    R.add('A4c-topicgrid', 'category page grid ads respect the ad\'s categories', await L.ev(T, ids => ids.every(id => QA_expect('home-grid', {page: 'topic', pillar: 'care'}).includes(id)), tg), {measured: 'care page grid ads: ' + JSON.stringify(tg)});
  }

  /* A5 in-article ads after paragraph N, max count (inline ad set to match:'all' for the mechanics) */
  if(run('A5')){
    const inl = async () => { await L.go(T, '#/journal/how-to-wash-denim', 450); return L.ev(T, () => { const out = []; let n = 0; [...document.querySelector('.bf-prose').children].forEach(c => { if(c.tagName === 'P') n++; else if(c.matches('[data-bf-slot="post-inline"]')) out.push(n); }); return {after: out, paras: n, total: [...document.querySelectorAll('[data-bf-ad]')].filter(x => x.id === 'bf-bar' || !!x.offsetParent).length}; }); };
    await setAds(T, 'ST.blogAds.forEach(a => { if((a.slots||[]).includes("post-inline")){ a.match = "all"; a.pillars = []; a.posts = []; } }); ST.blogAdSettings.inlineAfter = 3; ST.blogAdSettings.maxInline = 2;');
    const r32 = await inl();
    await setAds(T, 'ST.blogAdSettings.inlineAfter = 2; ST.blogAdSettings.maxInline = 3;'); const r23 = await inl();
    await setAds(T, 'ST.blogAdSettings.inlineAfter = 2; ST.blogAdSettings.maxInline = 1;'); const r21 = await inl();
    await setAds(T, 'ST.blogAdSettings.inlineAfter = 3; ST.blogAdSettings.maxInline = 2;');
    R.add('A5a-inline', 'first in-article ad right after paragraph N (3), at most 2, page total ≤3', r32.after.length >= 1 && r32.after[0] === 3 && r32.after.length <= 2 && r32.total <= 3, {measured: JSON.stringify(r32)});
    R.add('A5b-inline2', 'N=2, max 3 → first after paragraph 2, never more than 3; page total ≤3', r23.after.length >= 1 && r23.after[0] === 2 && r23.after.length <= 3 && r23.total <= 3, {measured: JSON.stringify(r23)});
    R.add('A5c-max1', 'max 1 → exactly one in-article ad', r21.after.length === 1, {measured: JSON.stringify(r21)});
    await L.shot(T, D.name + '-A5-inline');
    await L.prep(T, '#/admin/blog?tab=ads'); await L.go(T, '#/journal', 300);   /* back to seed */
  }

  /* A6 sidebar ad only ≥1100 (on a post that has a sidebar ad) */
  if(run('A6')){
    const res = []; for(const s of ['how-to-keep-a-polo-shirt-in-shape', 'how-a-polo-should-fit', 'pique-vs-jersey-polo']){ await L.go(T, '#/journal/' + s, 450); res.push(await L.ev(T, () => { const x = document.querySelector('[data-bf-slot="post-sidebar"]'); return x ? {vis: !!x.offsetParent && x.getBoundingClientRect().width > 0} : null; })); }
    const any = res.filter(Boolean);
    R.add('A6-sidebar', 'sidebar ad visible only at ≥1100px', D.w >= 1100 ? (any.length ? any.some(x => x.vis) : null) : !any.some(x => x.vis), {measured: JSON.stringify(res) + ' at ' + D.w});
  }

  /* A7 clicking ads lands on the right page */
  if(run('A7')){
    const types = {};
    for(const h of ['#/journal', '#/journal/what-to-wear-for-eid', '#/journal/how-to-keep-a-polo-shirt-in-shape', '#/journal/winter-layering-in-dhaka', '#/journal/how-a-polo-should-fit']){
      await L.go(T, h, 400);
      const ads = await L.ev(T, () => QA_rendered().filter(x => x.vis && x.slot !== 'post-bar').map(x => { const a = ST.blogAds.find(y => y.id === x.ad); return a ? {id: a.id, type: a.type, slot: x.slot, want: QA_href(a)} : null; }).filter(Boolean));
      for(const a of ads) if(!types[a.type]) types[a.type] = Object.assign({page: h}, a);
    }
    const res = [];
    for(const t of Object.values(types)){
      await L.go(T, t.page, 450);
      await L.tap(T, '[data-bf-ad="' + t.id + '"][data-bf-slot="' + t.slot + '"] a.bf-adt');
      await L.wait(T, 400);
      const land = await L.ev(T, () => ({hash: location.hash, page: CUR.page}));
      res.push({type: t.type, ad: t.id, want: t.want, got: land.hash, ok: land.hash === t.want && land.page !== 'journal'});
    }
    R.add('A7-click', 'tapping an ad opens its product / combo / category page', res.length > 0 && res.every(x => x.ok), {measured: JSON.stringify(res)});
  }

  /* A8 whole-day edges in Asia/Dhaka: 03:00 on the start day, 23:30 on the end day, 00:30 after */
  if(run('A8')){
    const edge = async (clock, start, end) => {
      const T2 = await L.open(D, {browser: T.b, init: installRule, clock});
      await L.prep(T2, '#/admin/blog?tab=ads'); await L.wait(T2, 300);
      const id = await L.ev(T2, ([s, e]) => { const a = ST.blogAds.find(x => (x.slots || []).includes('home-top')); a.start = s; a.end = e; ST.blogAds.forEach(b => { if(b !== a && (b.slots || []).includes('home-top')) b.active = false; }); saveState(); return a.id; }, [start, end]);
      const adm = await L.ev(T2, id => zb_adLive(ST.blogAds.find(x => x.id === id)), id);
      await L.go(T2, '#/journal', 400);
      const shop = await L.ev(T2, () => [...document.querySelectorAll('[data-bf-slot="home-top"]')].map(x => x.dataset.bfAd));
      await L.close(T2); return {id, adm, shop: shop.includes(id)};
    };
    const a = await edge('2026-10-20T03:00:00+06:00', '2026-10-20', '');
    const b = await edge('2026-10-20T23:30:00+06:00', '', '2026-10-20');
    const c = await edge('2026-10-21T00:30:00+06:00', '', '2026-10-20');
    R.add('A8a-startday', '03:00 Dhaka on the start day: live in back end and shop', a.adm && a.shop, {measured: JSON.stringify(a)});
    R.add('A8b-endday', '23:30 Dhaka on the end day: still live in both', b.adm && b.shop, {measured: JSON.stringify(b)});
    R.add('A8c-after', '00:30 Dhaka the day after the end: off in both', !c.adm && !c.shop, {measured: JSON.stringify(c)});
  }

  R.add('A99-errors', 'JS errors during ad checks', T.errs.length === 0, {measured: T.errs.slice(0, 5).join(' | ') || 'none'});
  await L.close(T);
})().catch(e => { console.error('CRASH', e); R.add('A00-crash', 'ads crashed', false, {measured: String(e).slice(0, 300)}); process.exit(1); });
