/* Route sweep + page checks on one device.  usage: node sweep.js <device> [routeFilter] */
const L = require('./lib'), C = require('./checks');
const D = L.dev(process.argv[2]); const only = process.argv[3];
const R = L.Rec('sweep', D.name);
const FULL = ['p393x852', 'p320x640', 't820x1180p', 't1180x820l', 'd1440x900', 'd1280x800'];
const ROUTES = [
  ['home', '#/journal', 'list'], ['topic-care', '#/journal/topic/care', 'list'], ['sub-washing', '#/journal/topic/care/washing', 'list'], ['topic-season', '#/journal/topic/season', 'list'],
  ['tag-polo', '#/journal/tag/polo', 'list'], ['author-jotno', '#/journal/author/jotno', 'list'], ['archive', '#/journal/archive', 'page'], ['archive-month', '#/journal/archive/2026-10', 'list'],
  ['search', '#/journal/search?q=denim', 'list'], ['post-polo', '#/journal/how-to-keep-a-polo-shirt-in-shape', 'post'], ['post-polo-bn', '#/bn/journal/how-to-keep-a-polo-shirt-in-shape', 'post'],
  ['post-denim', '#/journal/how-to-wash-denim', 'post'], ['post-winter', '#/journal/winter-layering-in-dhaka', 'post'], ['post-eid', '#/journal/what-to-wear-for-eid', 'post'],
  ['post-thin', '#/journal/why-we-only-exchange-for-size', 'post'], ['home-bn', '#/bn/journal', 'list'], ['rss', '#/journal/rss', 'page'], ['notfound', '#/journal/no-such-guide', 'page']
];
(async () => {
  const T = await L.open(D);
  await L.prep(T, '#/journal');
  /* fonts: give Google Fonts a moment the first time */
  await T.p.waitForTimeout(1200);
  for(const [id, hash, kind] of ROUTES){
    if(only && id.indexOf(only) < 0) continue;
    const e0 = T.errs.length;
    await L.go(T, hash, 700);
    await T.p.evaluate(() => { scrollTo(0, 0); closeModal(); });
    await T.p.waitForTimeout(150);
    const a = await C.audit(T, {maxSample: D.group === 'phone' ? 25 : 30});
    const errs = T.errs.slice(e0);
    R.add('S01-hscroll@' + id, 'no sideways scroll', a.hscroll.sw <= a.hscroll.iw + 1 && !a.wide.length, {measured: a.hscroll.sw + '/' + a.hscroll.iw + (a.wide.length ? ' ' + a.wide.join('; ') : ''), expected: 'scrollWidth ≤ viewport'});
    R.add('S02-js@' + id, 'no JS errors', errs.length === 0, {measured: errs.join(' | ') || 'none'});
    R.add('S03-h1@' + id, 'exactly one h1', a.h1.length === 1 && a.h1all === 1, {measured: a.h1all + ' ' + JSON.stringify(a.h1)});
    R.add('S04-skip@' + id, 'skip link first + target', !!(a.skip && a.skip.first && a.skip.target), {measured: JSON.stringify(a.skip)});
    R.add('S05-tap@' + id, 'tap targets ≥ 44px', a.tap.length === 0, {measured: a.tap.length + '/' + a.tapN + ' small: ' + a.tap.slice(0, 8).map(x => x.s + ' "' + x.t.slice(0, 18) + '" ' + x.w + '×' + x.h).join('; '), detail: a.tap});
    R.add('S06-contrast@' + id, 'text contrast ≥ 4.5:1 (3:1 large)', a.contrast.length === 0, {measured: a.contrast.length + ' low of ' + a.contrastN + ' (pixel-sampled ' + a.sampled + '): ' + a.contrast.slice(0, 6).map(x => x.s + ' "' + x.t.slice(0, 20) + '" ' + x.ratio + (x.measured ? 'px' : '') + ' fg' + JSON.stringify(x.fg) + (x.bg ? ' bg' + JSON.stringify(x.bg) : ' ' + (x.img || ''))).join('; '), detail: a.contrast});
    R.add('S07-cut@' + id, 'no cut text', a.cut.length === 0, {measured: a.cut.map(x => x.s + ' "' + x.t.slice(0, 24) + '" ' + (x.v ? x.sh + '>' + x.ch : x.sw + '>' + x.cw)).join('; ') || 'none', detail: a.cut, trunc: a.trunc});
    if(a.trunc.length) R.add('S07b-trunc@' + id, 'text shortened with … (info)', null, {measured: a.trunc.slice(0, 6).map(x => x.s + ' "' + x.t.slice(0, 24) + '"').join('; ')});
    R.add('S08-overlap@' + id, 'no overlapping text', a.overlap.length === 0, {measured: a.overlap.map(x => x.a + ' × ' + x.b + ' ' + x.px.join('×')).join('; ') || 'none'});
    R.add('S09-img@' + id, 'images lazy + alt', a.img.noLazy.length === 0 && a.img.noAlt.length === 0, {measured: 'img ' + a.img.n + ' noLazy ' + a.img.noLazy.length + ' noAlt ' + a.img.noAlt.length + ' · drawings ' + a.img.pimg + ' (unnamed ' + a.img.pimgUnnamed + ')'});
    if(a.bn.n){
      const used = a.bn.used || {}, fams = Object.keys(used).filter(k => k !== 'err');
      R.add('S10-bn@' + id, 'Bengali glyphs drawn with Hind Siliguri (real font used)', a.bn.hindLoaded && fams.length > 0 && fams.every(f => /Hind Siliguri|Instrument Sans|Archivo/i.test(f)) && fams.some(f => /Hind Siliguri/i.test(f)), {measured: 'used ' + JSON.stringify(used) + ' · loaded ' + a.bn.hindLoaded + ' · min size ' + a.bn.minSize + 'px'});
      R.add('S10b-bnlang@' + id, 'Bengali text marked lang="bn" (screen readers, Google)', a.bn.noLang === 0, {measured: a.bn.noLang + ' of ' + a.bn.n + ' Bengali text blocks without lang=bn (html lang=' + await T.p.evaluate(() => document.documentElement.lang) + ')'});
    }
    /* page-kind checks */
    const lay = await T.p.evaluate(() => {
      const o = {}; const g = document.querySelector('.bf-grid'); if(g){ o.cols = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length; }
      const cr = document.querySelector('.bf-cats .bf-chiprow'); if(cr){ const cs = getComputedStyle(cr); const before = cr.scrollLeft; cr.scrollLeft = 120; o.chips = {ox: cs.overflowX, sw: cr.scrollWidth, cw: cr.clientWidth, moved: cr.scrollLeft - before, wrap: cs.flexWrap}; cr.scrollLeft = 0; }
      const ads = [...document.querySelectorAll('[data-bf-ad]')]; o.ads = ads.map(x => ({slot: x.dataset.bfSlot, ad: x.dataset.bfAd, vis: x.getBoundingClientRect().width > 0 && getComputedStyle(x).display !== 'none' && !!x.offsetParent || x.id === 'bf-bar', lab: ((x.querySelector('.bf-adlab, .bf-bar-l') || {}).textContent || '').trim()}));
      const tm = document.querySelector('details.bf-tocm'), td = document.querySelector('.bf-tocd');
      o.toc = {m: tm ? {vis: tm.getBoundingClientRect().height > 0 && getComputedStyle(tm).display !== 'none', open: tm.open} : null, d: td ? {vis: td.getBoundingClientRect().width > 0 && getComputedStyle(td).display !== 'none', sticky: getComputedStyle(td.closest('.bf-side-in') || td).position} : null};
      const by = document.querySelector('.bf-by'); if(by){ o.by = {img: by.querySelectorAll('img').length, l1: (by.querySelector('.bf-by-l1') || {}).textContent, l2: (by.querySelector('.bf-by-l2') || {}).textContent || null, ai: /AI/.test(by.textContent)}; }
      o.rel = document.querySelectorAll('.bf-related .bf-card').length;
      const tw = document.querySelector('.bf-eyebrow .bf-langl'); o.twin = tw ? {tag: tw.tagName, href: tw.getAttribute('href'), hreflang: tw.getAttribute('hreflang'), txt: tw.textContent} : null;
      o.prods = document.querySelectorAll('.bf-prods .bf-pc').length; o.quick = !!document.querySelector('.bf-quick');
      o.share = [...document.querySelectorAll('.bf-share a, .bf-share button')].map(x => x.getAttribute('href') || x.dataset.url);
      o.prose = (() => { const p = document.querySelector('.bf-prose p'); if(!p) return null; const cs = getComputedStyle(p); const r = p.getBoundingClientRect(); const cpl = r.width / (parseFloat(cs.fontSize) * 0.5); return {fs: parseFloat(cs.fontSize), lh: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize), w: Math.round(r.width), cpl: Math.round(cpl)}; })();
      o.cardsN = document.querySelectorAll('.bf-grid .bf-card').length; o.main = (document.querySelector('main') || document.body).innerText.length;
      return o;
    });
    if(id !== 'notfound') R.add('S11-render@' + id, 'page renders content', lay.main > 200, {measured: lay.main + ' chars, cards ' + lay.cardsN});
    if(lay.ads.length) R.add('S12-adlabel@' + id, 'every ad is labelled', lay.ads.every(x => /EXTAS/.test(x.lab)), {measured: lay.ads.map(x => x.slot + '=' + x.ad + (x.vis ? '' : '(hidden)') + ' "' + x.lab + '"').join(', ')});
    if(kind === 'list' && lay.cols){
      const exp = D.w < 600 ? 1 : D.w < 1024 ? 2 : 3;
      const spec = D.group === 'phone' ? 1 : D.group === 'desktop' ? 3 : 2;
      R.add('S13-cols@' + id, 'grid columns (phone 1 / tablet 2 / desktop 3)', lay.cols === spec, {measured: lay.cols, expected: spec + (spec !== exp ? ' (CSS breakpoint gives ' + exp + ' at ' + D.w + 'px)' : '')});
    }
    if(/^topic-/.test(id) && D.group === 'phone'){ const ac = await T.p.evaluate(() => { const c = document.querySelector('.bf-cats .bf-chiprow'), on = c && c.querySelector('.bf-chip.on'); if(!on) return null; const cr = c.getBoundingClientRect(), r = on.getBoundingClientRect(); return {left: Math.round(r.left - cr.left), right: Math.round(r.right - cr.left), cw: c.clientWidth}; }); R.add('S14b-activechip@' + id, 'active category chip is visible (scrolled into view) on phones', !!ac && ac.left >= 0 && ac.right <= ac.cw - 20, {measured: JSON.stringify(ac), expected: 'chip inside the row, clear of the right-edge fade'}); }
    const av = await T.p.evaluate(() => [...document.querySelectorAll('main .bf-av')].filter(a => a.offsetParent).map(a => { const r = a.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height) + (a.closest('.bf-browse') ? '(browse)' : a.closest('.bf-by') ? '(byline)' : a.closest('.bf-about') ? '(about)' : a.closest('.bf-auth') ? '(author)' : ''); }));
    if(av.length) R.add('S23-avatar@' + id, 'author avatars are round (width = height)', av.every(x => { const m = x.match(/^(\d+)x(\d+)/); return Math.abs(m[1] - m[2]) <= 1; }), {measured: av.slice(0, 6).join(', ')});
    if(id === 'home' || id === 'topic-care'){
      if(D.group === 'phone') R.add('S14-chips@' + id, 'category chips scroll sideways on phones', !!(lay.chips && /(auto|scroll)/.test(lay.chips.ox) && lay.chips.sw > lay.chips.cw && lay.chips.moved !== 0), {measured: JSON.stringify(lay.chips)});
      else R.add('S14-chips@' + id, 'category chips (info)', null, {measured: JSON.stringify(lay.chips)});
    }
    if(kind === 'post' && id !== 'post-thin'){
      const wide = D.w >= 1100;
      if(lay.toc.m || lay.toc.d){
        const ok = wide ? (lay.toc.d && lay.toc.d.vis && lay.toc.d.sticky === 'sticky' && !(lay.toc.m && lay.toc.m.vis)) : (lay.toc.m && lay.toc.m.vis && !lay.toc.m.open && !(lay.toc.d && lay.toc.d.vis));
        R.add('S15-toc@' + id, wide ? 'TOC sticky on the side (≥1100)' : 'TOC collapsible, closed by default (<1100)', !!ok, {measured: JSON.stringify(lay.toc)});
        if(wide){ /* stays in view after scrolling */
          const st = await T.p.evaluate(async () => { const h2 = document.getElementById('bf-s2'); scrollTo(0, h2.getBoundingClientRect().top + scrollY - 150); await new Promise(r => setTimeout(r, 300)); const td = document.querySelector('.bf-tocd'); const r = td.getBoundingClientRect(); const out = {top: Math.round(r.top), bottom: Math.round(r.bottom), on: (document.querySelector('.bf-tocd a.on') || {}).textContent || null}; scrollTo(0, 0); return out; });
          R.add('S15b-tocstick@' + id, 'TOC still on screen after scrolling + highlights section', st.top >= 0 && st.top < 200 && !!st.on, {measured: JSON.stringify(st)});
        }
      }
      const side = lay.ads.filter(x => x.slot === 'post-sidebar');
      R.add('S16-sidebar@' + id, 'sidebar ad only ≥1100', wide ? side.some(x => x.vis) : !side.some(x => x.vis), {measured: JSON.stringify(side)});
      R.add('S17-byline@' + id, 'byline honest (no photo, AI label, no empty "Reviewed by")', !!(lay.by && lay.by.img === 0 && lay.by.ai && !lay.by.l2), {measured: JSON.stringify(lay.by)});
      R.add('S18-related@' + id, 'related posts shown', lay.rel >= 3, {measured: lay.rel});
      R.add('S19-prods@' + id, 'quick answer + product block', lay.quick && lay.prods > 0, {measured: 'quick ' + lay.quick + ', product cards ' + lay.prods});
      if(lay.prose) R.add('S20-read@' + id, 'reading measure (info)', null, {measured: JSON.stringify(lay.prose)});
    }
    if(id === 'post-polo') R.add('S21-twin@' + id, 'Bengali twin is an <a> to the twin', !!(lay.twin && lay.twin.tag === 'A' && lay.twin.href === '#/bn/journal/how-to-keep-a-polo-shirt-in-shape' && lay.twin.hreflang === 'bn'), {measured: JSON.stringify(lay.twin)});
    if(id === 'post-polo-bn'){ const bnok = await T.p.evaluate(() => { const h = document.querySelector('h1'); return {lang: h.getAttribute('lang') || h.closest('[lang]').getAttribute('lang'), bn: /[ঀ-৿]/.test(h.textContent), back: (document.querySelector('.bf-eyebrow .bf-langl') || {}).outerHTML || null, prose: /[ঀ-৿]/.test((document.querySelector('.bf-prose') || {}).textContent || '')}; }); R.add('S22-bnpost', 'Bengali twin renders Bengali text + link back', bnok.lang === 'bn' && bnok.bn && bnok.prose && /href="#\/journal\//.test(bnok.back || ''), {measured: JSON.stringify(bnok)}); }
    /* screenshots */
    await L.shot(T, D.name + '-' + id);
    if(FULL.includes(D.name) && /^(home|topic-care|post-polo|post-denim|post-polo-bn|author-jotno|search)$/.test(id)) await L.shot(T, D.name + '-' + id + '-full', true);
  }
  R.add('S99-errors', 'JS errors over the whole sweep', T.errs.length === 0, {measured: T.errs.slice(0, 5).join(' | ') || 'none'});
  await L.close(T);
})().catch(e => { console.error('CRASH', e); R.add('S00-crash', 'sweep crashed', false, {measured: String(e).slice(0, 300)}); process.exit(1); });
