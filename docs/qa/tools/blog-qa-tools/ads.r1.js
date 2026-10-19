/* House-ad slot checker on one device.  usage: node ads.js <device> [only] */
const L = require('./lib');
const D = L.dev(process.argv[2]); const only = process.argv[3];
const R = L.Rec('ads', D.name);
const run = k => !only || only.split(',').includes(k);

/* the rule as the owner reads it in the back end, written independently of the shop code:
   on, inside its dates (whole days, Dhaka), slot ticked, its categories (if any) match the page,
   its posts (if any) match the post — a post-only ad never shows on list pages. */
function installRule(){
  window.QA_today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  window.QA_expect = (slot, ctx) => (ST.blogAds || []).filter(a => {
    const t = QA_today();
    if(a.active === false) return false; if(a.start && t < a.start) return false; if(a.end && t > a.end) return false;
    if((a.slots || []).indexOf(slot) < 0) return false;
    if(a.type === 'product' && !P(a.productId)) return false; if(a.type === 'combo' && !(typeof COMBO === 'function' && COMBO(a.comboId))) return false; if(a.type === 'category' && !CAT(a.catId)) return false;
    if(a.pillars && a.pillars.length && ctx.pillar && a.pillars.indexOf(ctx.pillar) < 0) return false;
    if(a.posts && a.posts.length){ if(!ctx.slug || a.posts.indexOf(ctx.slug) < 0) return false; }
    return true;
  }).map(a => a.id);
  window.QA_href = a => a.type === 'product' ? '#/p/' + a.productId : a.type === 'combo' ? '#/combo/' + a.comboId : a.type === 'category' ? '#/c/' + a.catId : a.link;
  window.QA_rendered = () => [...document.querySelectorAll('[data-bf-ad]')].map(x => ({slot: x.dataset.bfSlot, ad: x.dataset.bfAd, href: (x.querySelector('a.bf-adt, a.bf-bar-b, .bf-pop-img') || {}).getAttribute ? (x.querySelector('a.bf-adt, a.bf-bar-b') || x.querySelector('a')).getAttribute('href') : null, vis: x.id === 'bf-bar' ? x.classList.contains('on') : !!x.offsetParent, lab: ((x.querySelector('.bf-adlab, .bf-bar-l') || {}).textContent || '').trim()}));
}
async function pageCheck(T, hash, ctx, tag){
  await L.go(T, hash, 450);
  return L.ev(T, ([ctx]) => { const r = QA_rendered(); return r.map(x => { const exp = QA_expect(x.slot, ctx); const ad = (ST.blogAds || []).find(a => a.id === x.ad) || (typeof BLOG_ADS_SEED !== 'undefined' ? BLOG_ADS_SEED.find(a => a.id === x.ad) : null); return Object.assign(x, {exp, ok: exp.indexOf(x.ad) >= 0, inStore: !!(ST.blogAds || []).find(a => a.id === x.ad), wantHref: ad ? QA_href(ad) : null}); }); }, [ctx]);
}
async function setAds(T, f, arg){ await L.ev(T, ([src, arg]) => { const fn = new Function('arg', src); fn(arg); saveState(); }, [f, arg]); }

(async () => {
  const T = await L.open(D, {init: installRule});
  await L.prep(T, '#/journal'); await L.wait(T, 600);
  await L.go(T, '#/admin/blog?tab=ads', 500);   /* the back end creates ST.blogAds on first use */
  await L.go(T, '#/journal', 500);

  /* A1 every page: each ad shown is allowed for that slot/page; slots with candidates are filled */
  if(run('A1')){
    const pages = await L.ev(T, () => [['#/journal', {}, 'home']].concat(bfPillars().map(p => ['#/journal/topic/' + p.id, {pillar: p.id}, 'topic-' + p.id]), [['#/journal/tag/polo', {}, 'tag-polo']], bfList().filter(p => p.lang === 'en').map(p => ['#/journal/' + p.slug, {pillar: p.pillar, slug: p.slug}, 'post-' + p.slug])));
    const bad = [], missing = [], hrefBad = [], unlabelled = [], notInStore = [], seen = {};
    for(const [hash, ctx, tag] of pages){
      const r = await pageCheck(T, hash, ctx, tag);
      r.forEach(x => { seen[x.slot + '=' + x.ad] = (seen[x.slot + '=' + x.ad] || 0) + 1; if(!x.inStore) notInStore.push(tag + ' ' + x.slot + '=' + x.ad); else if(!x.ok) bad.push(tag + ' ' + x.slot + '=' + x.ad + ' (allowed: ' + (x.exp.join('/') || 'none') + ')'); if(x.wantHref && x.href !== x.wantHref) hrefBad.push(tag + ' ' + x.ad + ' ' + x.href + '≠' + x.wantHref); if(!/EXTAS/.test(x.lab)) unlabelled.push(tag + ' ' + x.ad); });
      /* missing: slot has allowed ads but nothing rendered */
      const slots = tag === 'home' ? ['home-top'] : /^topic|^tag/.test(tag) ? ['cat-top'] : ['post-top', 'post-sidebar', 'post-end'];
      const miss = await L.ev(T, ([slots, ctx]) => slots.filter(s => QA_expect(s, ctx).length && !document.querySelector('[data-bf-slot="' + s + '"]')), [slots, ctx]);
      miss.forEach(s => missing.push(tag + ' ' + s));
    }
    R.add('A1a-rules', 'each ad shown is allowed by date / slot / category / post', bad.length === 0, {measured: bad.length + ' wrong: ' + bad.slice(0, 8).join('; '), detail: bad});
    R.add('A1b-filled', 'slots that have an allowed ad show one', missing.length === 0, {measured: missing.length + ' empty: ' + missing.slice(0, 8).join('; ')});
    R.add('A1c-href', 'ad click goes to its product / combo / category', hrefBad.length === 0, {measured: hrefBad.slice(0, 6).join('; ') || 'all match'});
    R.add('A1d-label', 'every ad carries the "EXTAS offer" label', unlabelled.length === 0, {measured: unlabelled.join('; ') || 'all labelled'});
    R.add('A1e-store', 'every ad on the shop comes from the back-end list (owner can switch it off)', notInStore.length === 0, {measured: notInStore.length + ': ' + [...new Set(notInStore.map(x => x.split(' ').slice(1).join(' ')))].join(', '), expected: 'only ST.blogAds'});
    R.add('A1f-mix', 'ads seen per slot (info)', null, {measured: JSON.stringify(seen)});
  }

  /* A2 dates */
  if(run('A2')){
    const today = await L.ev(T, () => QA_today());
    const y = await L.ev(T, () => { const d = new Date(Date.now() - 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
    const tm = await L.ev(T, () => { const d = new Date(Date.now() + 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
    const homeTop = async () => { await L.go(T, '#/journal', 400); return L.ev(T, () => (document.querySelector('[data-bf-slot="home-top"]') || {}).dataset ? document.querySelector('[data-bf-slot="home-top"]').dataset.bfAd : null); };
    const base = await homeTop();
    await setAds(T, 'ST.blogAds.forEach(a => { if(a.id === arg.id) a.end = arg.d; });', {id: base, d: y}); const e1 = await homeTop();
    await setAds(T, 'ST.blogAds.forEach(a => { if(a.id === arg.id){ a.end = ""; a.start = arg.d; } });', {id: base, d: tm}); const e2 = await homeTop();
    await setAds(T, 'ST.blogAds.forEach(a => { if(a.id === arg.id){ a.start = arg.d; a.end = arg.d; } });', {id: base, d: today}); const e3 = await homeTop();
    await setAds(T, 'ST.blogAds.forEach(a => { if(a.id === arg.id){ a.start = ""; a.end = ""; } });', {id: base});
    R.add('A2a-ended', 'ad that ended yesterday disappears', e1 !== base, {measured: base + ' end=' + y + ' → home-top ' + e1});
    R.add('A2b-future', 'ad that starts tomorrow is not shown yet', e2 !== base, {measured: 'start=' + tm + ' → ' + e2});
    R.add('A2c-today', 'ad that runs today only is shown (time now ' + await L.ev(T, () => new Date().toTimeString().slice(0, 5)) + ')', e3 === base, {measured: 'start=end=' + today + ' → ' + e3});
  }

  /* A3 category + post targeting */
  if(run('A3')){
    await setAds(T, 'ST.blogAds.push({id:"qa-cat-care", type:"category", catId:"polos", title:"QA care-only", sub:"", cta:"See", link:"#/c/polos", slots:["cat-top","post-end"], pillars:["care"], posts:[], start:"", end:"", active:true, weight:50, popup:{trigger:"scroll",value:50,freq:"session",delay:0}}); ST.blogAds.push({id:"qa-post-denim", type:"product", productId:"lv-slim-jeans", title:"QA denim-only", sub:"", cta:"See", link:"#/p/lv-slim-jeans", slots:["post-top"], pillars:[], posts:["how-to-wash-denim"], start:"", end:"", active:true, weight:50, popup:{trigger:"scroll",value:50,freq:"session",delay:0}});');
    const at = async (h, slot) => { await L.go(T, h, 400); return L.ev(T, s => [...document.querySelectorAll('[data-bf-slot="' + s + '"]')].map(x => x.dataset.bfAd), slot); };
    const c1 = await at('#/journal/topic/care', 'cat-top'), c2 = await at('#/journal/topic/style', 'cat-top');
    const p1 = await at('#/journal/how-to-wash-denim', 'post-top'), p2 = await at('#/journal/what-gsm-means', 'post-top'), p3 = await at('#/journal', 'home-top');
    R.add('A3a-pillar', 'category-only ad: on its category, not on others', c1.includes('qa-cat-care') && !c2.includes('qa-cat-care'), {measured: 'care ' + c1 + ' / style ' + c2});
    R.add('A3b-post', 'post-only ad: on that post only', p1.includes('qa-post-denim') && !p2.includes('qa-post-denim') && !p3.includes('qa-post-denim'), {measured: 'denim ' + p1 + ' / gsm ' + p2 + ' / home ' + p3});
    await setAds(T, 'ST.blogAds = ST.blogAds.filter(a => !/^qa-/.test(a.id));');
  }

  /* A4 grid ad every N cards */
  if(run('A4')){
    const pos = async () => { await L.go(T, '#/journal', 450); return L.ev(T, () => { const out = []; let n = 0; [...document.querySelector('.bf-grid').children].forEach(c => { if(c.classList.contains('bf-card')) n++; else if(c.classList.contains('bf-gridad')) { out.push(n); n = 0; } }); return out; }); };
    const d6 = await pos();
    await setAds(T, 'ST.blogAdSettings.gridEvery = 3;'); const d3 = await pos();
    await L.tap(T, '.bf-more-b'); const d3m = await L.ev(T, () => { const out = []; let n = 0; [...document.querySelector('.bf-grid').children].forEach(c => { if(c.classList.contains('bf-card')) n++; else if(c.classList.contains('bf-gridad')) { out.push(n); n = 0; } }); return out; });
    await setAds(T, 'ST.blogAdSettings.gridEvery = 6;');
    R.add('A4a-grid6', 'grid ad after every 6 cards (default)', d6.length >= 1 && d6.every(x => x === 6), {measured: 'cards between ads ' + JSON.stringify(d6)});
    R.add('A4b-grid3', 'setting 3 → an ad after every 3 cards', d3.length >= 2 && d3.every(x => x === 3) && d3m.every(x => x === 3), {measured: JSON.stringify(d3) + ' after load more ' + JSON.stringify(d3m)});
    /* topic page grid */
    await L.go(T, '#/journal/topic/care', 400); const tg = await L.ev(T, () => QA_rendered().filter(x => x.slot === 'home-grid').map(x => x.ad));
    R.add('A4c-topicgrid', 'category page grid ads respect the ad\'s categories', true && (await L.ev(T, ids => ids.every(id => QA_expect('home-grid', {pillar: 'care'}).includes(id)), tg)), {measured: 'care page grid ads: ' + JSON.stringify(tg)});
  }

  /* A5 in-article ads after paragraph N, max count */
  if(run('A5')){
    const inl = async () => { await L.go(T, '#/journal/how-to-wash-denim', 450); return L.ev(T, () => { const out = []; let n = 0; [...document.querySelector('.bf-prose').children].forEach(c => { if(c.tagName === 'P') n++; else if(c.matches('[data-bf-slot="post-inline"]')) out.push(n); }); return {after: out, paras: n}; }); };
    await setAds(T, 'ST.blogAds.forEach(a => { if((a.slots||[]).includes("post-inline")) a.pillars = []; }); ST.blogAdSettings.inlineAfter = 3; ST.blogAdSettings.maxInline = 2;');
    const r32 = await inl();
    await setAds(T, 'ST.blogAdSettings.inlineAfter = 2; ST.blogAdSettings.maxInline = 3;'); const r23 = await inl();
    await setAds(T, 'ST.blogAdSettings.inlineAfter = 2; ST.blogAdSettings.maxInline = 1;'); const r21 = await inl();
    await setAds(T, 'ST.blogAdSettings.inlineAfter = 3; ST.blogAdSettings.maxInline = 2;');
    R.add('A5a-inline', 'first in-article ad right after paragraph N (3), at most 2', r32.after.length >= 1 && r32.after[0] === 3 && r32.after.length <= 2, {measured: JSON.stringify(r32)});
    R.add('A5b-inline2', 'N=2, max 3 → first after paragraph 2, never more than 3', r23.after.length >= 1 && r23.after[0] === 2 && r23.after.length <= 3, {measured: JSON.stringify(r23)});
    R.add('A5c-max1', 'max 1 → exactly one in-article ad', r21.after.length === 1, {measured: JSON.stringify(r21)});
    await L.shot(T, D.name + '-A5-inline');
  }

  /* A6 sidebar ad only ≥1100 */
  if(run('A6')){
    await L.go(T, '#/journal/how-to-wash-denim', 450);
    const s = await L.ev(T, () => { const x = document.querySelector('[data-bf-slot="post-sidebar"]'); return x ? {vis: !!x.offsetParent && x.getBoundingClientRect().width > 0, w: Math.round(x.getBoundingClientRect().width)} : null; });
    R.add('A6-sidebar', 'sidebar ad visible only at ≥1100px', D.w >= 1100 ? !!(s && s.vis) : !(s && s.vis), {measured: JSON.stringify(s) + ' at ' + D.w});
  }

  /* A7 clicking ads lands on the right page */
  if(run('A7')){
    const types = {};
    for(const h of ['#/journal', '#/journal/what-to-wear-for-eid', '#/journal/how-to-keep-a-polo-shirt-in-shape', '#/journal/what-gsm-means']){
      await L.go(T, h, 400);
      const ads = await L.ev(T, () => QA_rendered().filter(x => x.vis && x.slot !== 'post-bar').map(x => { const a = ST.blogAds.find(y => y.id === x.ad); return a ? {id: a.id, type: a.type, slot: x.slot, want: QA_href(a)} : null; }).filter(Boolean));
      for(const a of ads) if(!types[a.type]) types[a.type] = Object.assign({page: h}, a);
    }
    const res = [];
    for(const t of Object.values(types)){
      await L.go(T, t.page, 450);
      await L.tap(T, '[data-bf-ad="' + t.id + '"][data-bf-slot="' + t.slot + '"] a.bf-adt');
      await L.wait(T, 400);
      const land = await L.ev(T, () => ({hash: location.hash, page: CUR.page, h1: (document.querySelector('h1') || {}).textContent || ''}));
      res.push({type: t.type, ad: t.id, want: t.want, got: land.hash, ok: land.hash === t.want && land.page !== 'journal'});
    }
    R.add('A7-click', 'tapping an ad opens its product / combo / category page', res.length > 0 && res.every(x => x.ok), {measured: JSON.stringify(res)});
  }

  /* A8 date edge: before 9 am Dhaka on the start day */
  if(run('A8')){
    const T2 = await L.open(D, {browser: T.b, init: installRule, clock: '2026-10-20T03:00:00+06:00'});
    await L.prep(T2, '#/admin/blog?tab=ads'); await L.wait(T2, 300);
    await L.ev(T2, () => { const a = ST.blogAds.find(x => (x.slots || []).includes('home-top')); a.start = '2026-10-20'; a.end = ''; saveState(); window.__qaAd = a.id; });
    await L.go(T2, '#/admin/blog?tab=ads', 400);
    const adm = await L.ev(T2, () => { const a = ST.blogAds.find(x => x.id === window.__qaAd); return {id: a.id, live: zb_adLive(a)}; });
    await L.go(T2, '#/journal', 400);
    const shop = await L.ev(T2, () => [...document.querySelectorAll('[data-bf-slot="home-top"]')].map(x => x.dataset.bfAd));
    R.add('A8-startday', 'ad starting today shows from midnight (back end says "Live" at 03:00)', !adm.live || shop.includes(adm.id), {measured: 'back end live=' + adm.live + ', shop home-top ' + JSON.stringify(shop) + ' at 03:00 Dhaka', expected: 'same answer in back end and shop'});
    await L.close(T2);
  }

  R.add('A99-errors', 'JS errors during ad checks', T.errs.length === 0, {measured: T.errs.slice(0, 5).join(' | ') || 'none'});
  await L.close(T);
})().catch(e => { console.error('CRASH', e); R.add('A00-crash', 'ads crashed', false, {measured: String(e).slice(0, 300)}); process.exit(1); });
