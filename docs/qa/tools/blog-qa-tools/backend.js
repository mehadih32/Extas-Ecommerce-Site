/* Back-end flows + front-end reflection.  usage: node backend.js <device> [only] */
const L = require('./lib'), C = require('./checks');
const D = L.dev(process.argv[2]); const only = process.argv[3];
const R = L.Rec('backend', D.name);
const run = k => !only || only.split(',').includes(k);
const toastTxt = T => L.ev(T, () => (document.querySelector('.toast') || {}).textContent || '');
async function click(T, sel, i = 0){ const loc = T.p.locator(sel).nth(i); await loc.scrollIntoViewIfNeeded({timeout: 4000}); if(D.touch) await loc.tap({timeout: 4000}); else await loc.click({timeout: 4000}); await T.p.waitForTimeout(300); }
async function change(T, sel, val){ const loc = T.p.locator(sel).first(); await loc.scrollIntoViewIfNeeded(); await loc.fill(val); await loc.press('Tab'); await T.p.waitForTimeout(300); }
const go = (T, h, ms = 450) => T.p.evaluate(h => { location.hash = h; }, h).then(() => T.p.waitForTimeout(ms));

(async () => {
  const T = await L.open(D);
  await L.prep(T, '#/admin/blog'); await L.wait(T, 600);

  const B1full = [];
  /* B1 every tab renders: no errors, no sideways scroll, no cut / overlapping text */
  if(run('B1')){
    const tabs = [['posts', '#/admin/blog'], ['topics', '#/admin/blog?tab=topics'], ['pipe', '#/admin/blog?tab=pipe'], ['sched', '#/admin/blog?tab=sched'], ['results', '#/admin/blog?tab=results'], ['authors', '#/admin/blog?tab=authors'], ['author-profile', '#/admin/blog?tab=authors&a=jotno'],
      ['cats', '#/admin/blog?tab=cats'], ['ads', '#/admin/blog?tab=ads'], ['ad-edit', '#/admin/blog?tab=ads&ad=ad-denim-popup'], ['ad-new', '#/admin/blog?tab=ads&ad=new'], ['seo', '#/admin/blog?tab=seo'], ['editor', '#/admin/blog/bx-how-to-wash-denim'], ['editor-new', '#/admin/blog/new']];
    for(const [id, h] of tabs){
      const e0 = T.errs.length; await go(T, h, 600); await L.ev(T, () => scrollTo(0, 0));
      const a = await C.audit(T, {maxSample: 12, scope: '.zb-page, .modal-back'});
      const content = await L.ev(T, () => ({txt: (document.querySelector('main') || document.body).innerText.length, h: [...document.querySelectorAll('main h1, main h2')].length}));
      const errs = T.errs.slice(e0);
      const ok = errs.length === 0 && content.txt > 300 && a.hscroll.sw <= a.hscroll.iw + 1;
      R.add('B1-tab@' + id, 'tab works (renders, no JS error, no sideways scroll)', ok, {measured: 'text ' + content.txt + ', headings ' + content.h + ', scroll ' + a.hscroll.sw + '/' + a.hscroll.iw + (a.wide.length ? ' ' + a.wide.slice(0, 3).join('; ') : '') + (errs.length ? ' ERR ' + errs.join(' | ') : '')});
      R.add('B1c-cut@' + id, 'no cut / overlapping text', a.cut.length === 0 && a.overlap.length === 0, {measured: a.cut.slice(0, 4).map(x => x.s + ' "' + x.t.slice(0, 20) + '"').concat(a.overlap.slice(0, 3).map(x => x.a + '×' + x.b)).join('; ') || 'none'});
      R.add('B1t-tap@' + id, 'tap targets ≥ 44px (phone use)', D.touch ? a.tap.length === 0 : null, {measured: a.tap.length + '/' + a.tapN + ': ' + a.tap.slice(0, 6).map(x => x.s + ' "' + x.t.slice(0, 14) + '" ' + x.w + '×' + x.h).join('; ')});
      R.add('B1k-contrast@' + id, 'text contrast ≥ 4.5:1', a.contrast.length === 0, {measured: a.contrast.length + ': ' + a.contrast.slice(0, 4).map(x => x.s + ' "' + x.t.slice(0, 18) + '" ' + x.ratio).join('; ')});
      await L.shot(T, D.name + '-admin-' + id); if(['pipe', 'ads', 'topics', 'authors', 'cats'].includes(id) && /p393|d1440|t820/.test(D.name)) B1full.push([id, h]);
    }
  }

  /* B2 topics: duplicate held; approve-all skips duplicates */
  if(run('B2')){
    await go(T, '#/admin/blog?tab=topics');
    await T.p.fill('[data-testid=zb-tf-t]', 'Layering for winter in Dhaka'); await L.wait(T, 200);
    const warn = await T.p.locator('[data-testid=zb-tdup-warn]').count();
    await click(T, '[data-testid=zb-t-add]'); const t1 = await toastTxt(T);
    const added = await L.ev(T, () => zb_topics().some(t => t.t === 'Layering for winter in Dhaka'));
    R.add('B2a-dup', 'near-duplicate topic: warning while typing, first add is held', warn === 1 && /খুব কাছাকাছি/.test(t1) && !added, {measured: 'warn ' + warn + ', toast "' + t1.slice(0, 70) + '", added ' + added});
    const props = await L.ev(T, () => zb_topics().filter(t => t.st === 'proposed').map(t => ({t: t.t, dup: zb_dupFind(t.t, t.q, {topic: t.id}).score >= zb_cfg().dup.warn})));
    await click(T, '[data-testid=zb-t-all]'); const t2 = await toastTxt(T);
    const left = await L.ev(T, () => zb_topics().filter(t => t.st === 'proposed').map(t => t.t));
    const dups = props.filter(x => x.dup).map(x => x.t);
    R.add('B2b-approveall', 'approve-all approves the rest and keeps duplicates for the owner', props.length > 0 && left.length === dups.length && dups.every(x => left.includes(x)), {measured: 'proposed ' + props.length + ', dup ' + JSON.stringify(dups) + ', left ' + JSON.stringify(left) + ', toast "' + t2 + '"'});
    await L.shot(T, D.name + '-B2-topics');
  }

  /* B3 full pipeline through the screens, then the shop */
  let pubId = null;
  if(run('B3')){
    await go(T, '#/admin/blog?tab=pipe');
    await click(T, '[data-testid=zb-p-start]');
    const np = await L.ev(T, () => zb_posts().filter(p => p.pipe === 'writing' && !p.demo).sort((a, b) => b.at - a.at)[0]);
    pubId = np && np.id;
    R.add('B3a-start', 'start writing: new draft with writer = pillar author', !!np && !!np.writer && np.writer === (await L.ev(T, pl => zb_authorFor(pl), np.pillar)), {measured: np ? np.title + ' · writer ' + np.writer + ' · pillar ' + np.pillar + ' · products ' + np.products : 'none'});
    /* writer finishes the draft in the editor: description + quick answer */
    await go(T, '#/admin/blog/' + pubId, 600);
    const QA = 'Wash it inside out in cold water and dry it in the shade — QA quick answer.';
    const meta = await L.ev(T, id => { const kw = zb_get(id).kw || ''; let m = (kw.charAt(0).toUpperCase() + kw.slice(1)) + ' — the steps that work at home, what to avoid, and how our own team tests it on real garments in Dhaka heat and monsoon.'; if(m.length > 158) m = m.slice(0, 157).replace(/\s+\S*$/, '') + '.'; while(m.length < 125) m += ' Simple.'; return m; }, pubId);
    await T.p.locator('#zb-meta').fill(meta);
    await T.p.locator('#zb-qa').fill(QA);
    /* a full-length body (thin stubs may be kept off the lists) */
    if(await T.p.locator('#zb-body').count()){ const body = await L.ev(T, id => { const t = zb_get(id).title; const para = 'Our team washes and wears these garments in Dhaka heat and monsoon damp, and this is the routine that keeps them looking new. Use cold water, turn the garment inside out, skip the tumble dryer and dry it flat in the shade. Store it folded rather than hung so the shoulders keep their shape.'; return t + '\n\n' + [1,2,3,4,5].map(i => '## Step ' + i + '\n' + para).join('\n\n'); }, pubId); await T.p.locator('#zb-body').fill(body); }
    await click(T, '[data-testid=zb-save]'); await L.wait(T, 300);
    const s0 = await L.ev(T, id => { const p = zb_get(id); return {pipe: p.pipe, meta: (p.meta || '').length, qa: p.quickAnswer}; }, pubId);
    await go(T, '#/admin/blog?tab=pipe');
    await click(T, '[data-act=zb-p-submit][data-id=' + pubId + ']');
    const p1 = await L.ev(T, id => zb_get(id), pubId);
    R.add('B3b-proofer', 'sent to proof: proofreader is another author', p1.pipe === 'proof' && !!p1.proofer && p1.proofer !== p1.writer, {measured: 'stage ' + p1.pipe + ', writer ' + p1.writer + ', proofer ' + p1.proofer + ' (editor save kept stage ' + s0.pipe + ')'});
    await click(T, '[data-act=zb-p-pass][data-id=' + pubId + ']'); const tb = await toastTxt(T);
    const blocked = (await L.ev(T, id => zb_get(id).pipe, pubId)) === 'proof';
    for(const k of ['facts', 'photo', 'read']) await click(T, '[data-act=zb-p-ck][data-id=' + pubId + '][data-k=' + k + ']');
    /* self-approval: make the writer the proofreader and press pass */
    const self = await L.ev(T, id => { const p = zb_get(id); return zb_passProof(p, p.writer); }, pubId);
    await L.ev(T, id => { const p = zb_clone(zb_get(id)); p._qaProofer = p.proofer; p.proofer = p.writer; zb_put(p); }, pubId); await go(T, '#/admin/blog?tab=authors', 200); await go(T, '#/admin/blog?tab=pipe');
    await click(T, '[data-act=zb-p-pass][data-id=' + pubId + ']'); const tself = await toastTxt(T); const stSelf = await L.ev(T, id => zb_get(id).pipe, pubId);
    await L.ev(T, id => { const p = zb_clone(zb_get(id)); p.proofer = p._qaProofer; delete p._qaProofer; zb_put(p); }, pubId); await go(T, '#/admin/blog?tab=authors', 200); await go(T, '#/admin/blog?tab=pipe');
    R.add('B3c-self', 'writer can never pass their own post (code + button)', !!self && /নিজের/.test(self) && stSelf === 'proof' && /নিজের/.test(tself), {measured: 'code: "' + String(self).slice(0, 60) + '" · button toast: "' + tself.slice(0, 60) + '" · stage ' + stSelf});
    R.add('B3d-checks', 'proof pass blocked while checks are open', blocked && /বাকি/.test(tb), {measured: 'toast "' + tb.slice(0, 70) + '"'});
    await click(T, '[data-act=zb-p-pass][data-id=' + pubId + ']');
    const st1 = await L.ev(T, id => zb_get(id).pipe, pubId);
    if(await T.p.locator('[data-act=zb-p-autolink][data-id=' + pubId + ']').count()) await click(T, '[data-act=zb-p-autolink][data-id=' + pubId + ']');
    await click(T, '[data-act=zb-p-final][data-id=' + pubId + ']'); const tf = await toastTxt(T);
    const st2 = await L.ev(T, id => { const p = zb_get(id); return {pipe: p.pipe, miss: zb_pchecks(p).filter(x => !x.ok).map(x => x.k)}; }, pubId);
    R.add('B3e-final', 'proof pass → Doot final → Ready', st1 === 'final' && st2.pipe === 'ready', {measured: 'after pass ' + st1 + ', after final ' + JSON.stringify(st2) + ' toast "' + tf.slice(0, 60) + '"'});
    await L.shot(T, D.name + '-B3-pipeline');
    let oneTap = null, confirmShown = false;
    if(await T.p.locator('[data-act=zb-p-pub][data-id=' + pubId + ']').count()){
      await click(T, '[data-act=zb-p-pub][data-id=' + pubId + ']');
      oneTap = await L.ev(T, id => zb_get(id).status, pubId); confirmShown = await T.p.locator('[data-testid=zb-pubok]').count() > 0;
      await L.shot(T, D.name + '-B3-publish-confirm');
      if(confirmShown) await click(T, '[data-testid=zb-pubok]');
    }
    R.add('B3h-confirm', 'publish needs a confirm: one tap on "প্রকাশ করুন" does NOT publish; "হ্যাঁ" does', oneTap !== null && oneTap !== 'published' && confirmShown, {measured: 'after one tap: status ' + oneTap + ', confirm shown ' + confirmShown});
    const pub = await L.ev(T, id => { const p = zb_get(id); return {status: p.status, slug: p.slug, title: p.title, writer: p.writer, pillar: p.pillar, products: p.products, qa: p.quickAnswer}; }, pubId);
    await go(T, '#/journal', 600);
    const onHome = await L.ev(T, t => [...document.querySelectorAll('.bf-feat-t, .bf-card-t')].some(e => e.textContent === t), pub.title);
    const href = await L.ev(T, t => { const a = [...document.querySelectorAll('.bf-feat-a, .bf-card-a')].find(a => (a.querySelector('.bf-feat-t, .bf-card-t') || {}).textContent === t); return a ? a.getAttribute('href') : null; }, pub.title);
    if(href) await go(T, href, 700);
    const fe = await L.ev(T, () => ({h1: (document.querySelector('h1') || {}).textContent, by: (document.querySelector('.bf-by-l1') || {}).textContent, pillar: (document.querySelector('.bf-eyebrow .bf-pl') || {}).textContent, quick: (document.querySelector('.bf-quick p') || {}).textContent, prods: [...document.querySelectorAll('.bf-prods [data-act=bf-add]')].map(b => b.dataset.id)}));
    const want = await L.ev(T, ([w, pl]) => ({name: (zb_author(w) || {}).name, pillar: bfPName(pl, 'en')}), [pub.writer, pub.pillar]);
    R.add('B3f-live', 'published post is on #/journal', pub.status === 'published' && onHome && !!href, {measured: pub.status + ', on home ' + onHome + ', link ' + href});
    R.add('B3g-fields', 'shop post shows right author, category, quick answer, product block', fe.h1 === pub.title && (fe.by || '').indexOf(want.name) >= 0 && (fe.pillar || '').toLowerCase() === want.pillar.toLowerCase() && fe.quick === pub.qa && pub.products.every(p => fe.prods.includes(p)) && fe.prods.length > 0, {measured: JSON.stringify(fe), expected: JSON.stringify({author: want.name, pillar: want.pillar, quick: pub.qa, products: pub.products})});
    await L.shot(T, D.name + '-B3-live-post');
  }

  /* B4 editing a passed post sends it back to proof */
  if(run('B4')){
    const id = await L.ev(T, () => (zb_posts().find(p => p.pipe === 'final' || p.pipe === 'ready') || {}).id);
    if(id){
      const before = await L.ev(T, id => zb_get(id).pipe, id);
      await go(T, '#/admin/blog/' + id, 600);
      await T.p.locator('#zb-qa').fill('Changed after the pass — QA.');
      await click(T, '[data-testid=zb-save]'); const t = await toastTxt(T);
      const after = await L.ev(T, id => { const p = zb_get(id); return {pipe: p.pipe, passedBy: p.passedBy, finalBy: p.finalBy}; }, id);
      R.add('B4-reproof', 'editing a passed post → back to proof', after.pipe === 'proof' && !after.passedBy && !after.finalBy, {measured: id + ' ' + before + ' → ' + JSON.stringify(after) + ' toast "' + t + '"'});
      R.add('B4b-told', 'owner is told it went back to proof', /প্রুফ/.test(t), {measured: 'toast "' + t + '"', expected: 'লেখা বদলেছে — আবার প্রুফে গেল'});
    } else R.add('B4-reproof', 'editing a passed post (no passed post found)', false);
  }

  /* B5 schedule: tomorrow-below-minimum warning, auto-fill */
  if(run('B5')){
    await go(T, '#/admin/blog?tab=sched');
    const warn = await T.p.locator('[data-testid=zb-qwarn]').count();
    const r0 = await L.ev(T, () => ({ready: zb_ready().length, sch: zb_posts().filter(p => p.status === 'scheduled').length, tom: zb_dayPosts(1).length + zb_pubDay(1).length, min: zb_cfg().perDay.min}));
    await click(T, '[data-testid=zb-s-fill]'); const t = await toastTxt(T);
    const r1 = await L.ev(T, () => ({ready: zb_ready().length, sch: zb_posts().filter(p => p.status === 'scheduled').length, slots: zb_posts().filter(p => p.status === 'scheduled').map(p => zb_hm(p.at) + '@' + new Date(p.at).getDate()), maxDay: Math.max(...[0,1,2,3,4,5,6,7].map(o => zb_dayPosts(o).length + zb_pubDay(o).length))}));
    R.add('B5a-warn', 'warning when tomorrow is below the minimum', (r0.tom < r0.min) === (warn === 1), {measured: 'tomorrow ' + r0.tom + ' / min ' + r0.min + ', warning shown ' + warn});
    R.add('B5b-fill', 'auto-fill puts Ready posts into free slots (≤ max per day)', r0.ready === 0 || (r1.sch === r0.sch + r0.ready && r1.ready === 0), {measured: JSON.stringify(r0) + ' → ' + JSON.stringify(r1) + ' "' + t + '"'});
    await change(T, '[data-testid=zb-n-min]', '4');
    R.add('B5c-min', 'owner changes the minimum', (await L.ev(T, () => zb_cfg().perDay.min)) === 4, {measured: await L.ev(T, () => JSON.stringify(zb_cfg().perDay))});
    await L.shot(T, D.name + '-B5-schedule');
  }

  /* B6 categories: rename + reorder show on the shop */
  if(run('B6')){
    await go(T, '#/admin/blog?tab=cats');
    await change(T, '[data-change=zb-pl-nm][data-id=care][data-k=en]', 'Care & Laundry QA');
    await click(T, '[data-act=zb-pl-mv][data-id=season][data-d="-1"]');
    const order = await L.ev(T, () => ST.blogPillars.filter(p => !p.hidden).map(p => p.id));
    await go(T, '#/journal', 600);
    const chips = await L.ev(T, () => [...document.querySelectorAll('.bf-cats a.bf-chip')].slice(1).map(a => [a.getAttribute('href').split('/').pop(), a.textContent]));
    await go(T, '#/journal/topic/care', 500); const h1 = await L.ev(T, () => document.querySelector('h1').textContent);
    await go(T, '#/journal/how-to-wash-denim', 500); const eb = await L.ev(T, () => document.querySelector('.bf-eyebrow .bf-pl').textContent);
    R.add('B6a-rename', 'category rename shows on chips, category page and post', chips.some(c => c[0] === 'care' && c[1] === 'Care & Laundry QA') && h1 === 'Care & Laundry QA' && eb === 'Care & Laundry QA', {measured: 'chip ' + JSON.stringify(chips.find(c => c[0] === 'care')) + ', h1 "' + h1 + '", eyebrow "' + eb + '"'});
    R.add('B6b-order', 'category order shows on the shop', JSON.stringify(chips.map(c => c[0])) === JSON.stringify(order), {measured: 'shop ' + chips.map(c => c[0]).join(',') + ' / admin ' + order.join(',')});
    /* hide a category */
    await go(T, '#/admin/blog?tab=cats'); await click(T, '[data-act=zb-pl-hide][data-id=brand]');
    await go(T, '#/journal', 500); const hid = await L.ev(T, () => ({chip: !!document.querySelector('.bf-cats a[href$="/topic/brand"]'), card: [...document.querySelectorAll('.bf-card .bf-pl')].map(x => x.textContent)}));
    await go(T, '#/journal/inside-the-essential-pique-polo', 500); const hp = await L.ev(T, () => ({h1: (document.querySelector('h1') || {}).textContent, pl: (document.querySelector('.bf-eyebrow .bf-pl') || {}).textContent, href: (document.querySelector('.bf-eyebrow .bf-pl') || {}).getAttribute ? document.querySelector('.bf-eyebrow .bf-pl').getAttribute('href') : null}));
    R.add('B6c-hide', 'hidden category: chip gone; its posts keep the category name, shown without a (dead) link', !hid.chip && hid.card.every(x => x.trim()) && !!hp.pl && !hp.href, {measured: JSON.stringify(hid).slice(0, 200) + ' post: ' + JSON.stringify(hp)});
    await go(T, '#/admin/blog?tab=cats'); await click(T, '[data-act=zb-pl-hide][data-id=brand]');
  }

  /* B7 authors: name/bio/reviewer reflect in bylines + author pages; idle author ৳0 */
  if(run('B7')){
    await go(T, '#/admin/blog?tab=authors');
    const idle = await L.ev(T, () => { const all = zb_posts(); return zb_authors().filter(a => !zb_aStats(a.id, all).jobs).map(a => a.id); });
    const idleUi = await L.ev(T, () => [...document.querySelectorAll('[data-testid=zb-acard]')].map(c => c.innerText.replace(/\s+/g, ' ')));
    R.add('B7a-idle', 'an idle author shows ৳0', idle.length > 0 && idleUi.some(t => /৳\s?0(?!\d)/.test(t)), {measured: 'idle ' + idle.join(',') + ' · cards: ' + idleUi.slice(0, 5).map(t => t.slice(0, 70)).join(' | ')});
    await go(T, '#/admin/blog?tab=authors&a=jotno', 500);
    await change(T, '#zb-a-nm', 'Jotno QA');
    await change(T, '#zb-a-bio', 'QA bio: writes our care guides, tested in Dhaka.');
    await change(T, '#zb-a-rv', 'Mehedi Hasan');
    await go(T, '#/journal/how-to-keep-a-polo-shirt-in-shape', 600);
    const by = await L.ev(T, () => ({l1: (document.querySelector('.bf-by-l1') || {}).textContent, l2: (document.querySelector('.bf-by-l2') || {}).textContent || null, about: (document.querySelector('.bf-about p') || {}).textContent}));
    await go(T, '#/journal/author/jotno', 500);
    const ap = await L.ev(T, () => ({h1: document.querySelector('h1').textContent, bio: (document.querySelector('.bf-auth-bio') || {}).textContent, honest: (document.querySelector('.bf-honest') || {}).textContent}));
    await go(T, '#/journal/one-oxford-shirt-three-ways', 500);
    const other = await L.ev(T, () => (document.querySelector('.bf-by-l2') || {}).textContent || null);
    await go(T, '#/bn/journal/author/jotno', 500);
    const apbn = await L.ev(T, () => ({h1: document.querySelector('h1').textContent, bio: (document.querySelector('.bf-auth-bio') || {}).textContent}));
    R.add('B7b-name', 'author name edit shows in bylines + author page', /Jotno QA/.test(by.l1) && ap.h1 === 'Jotno QA', {measured: 'byline "' + by.l1 + '", author h1 "' + ap.h1 + '"'});
    R.add('B7c-bio', 'author bio edit shows on the author page', /QA bio/.test(ap.bio), {measured: ap.bio});
    R.add('B7c2-biobn', 'English bio edit leaves the Bengali author page on its own Bengali bio (bioBn)', !/QA bio/.test(apbn.bio || '') && /[\u0980-\u09FF]/.test(apbn.bio || ''), {measured: 'bn page: h1 "' + apbn.h1 + '", bio "' + (apbn.bio || '').slice(0, 80) + '"', expected: 'owner\'s edit (or a Bengali bio field) — not the old seed text'});
    await go(T, '#/admin/blog?tab=authors&a=jotno', 500);
    const hasBn = await T.p.locator('#zb-a-biobn').count();
    if(hasBn){ await change(T, '#zb-a-biobn', 'QA বাংলা পরিচয়: যত্নের গাইড লেখে।'); }
    await go(T, '#/bn/journal/author/jotno', 500);
    const apbn2 = await L.ev(T, () => (document.querySelector('.bf-auth-bio') || {}).textContent || '');
    await go(T, '#/journal/author/jotno', 500);
    const apen2 = await L.ev(T, () => (document.querySelector('.bf-auth-bio') || {}).textContent || '');
    R.add('B7c3-biobn-edit', 'Bengali bio field (পরিচয় (বাংলা)) edit shows on the Bengali author page only', hasBn > 0 && /QA বাংলা পরিচয়/.test(apbn2) && /QA bio/.test(apen2), {measured: 'field ' + hasBn + ', bn page "' + apbn2.slice(0, 60) + '", en page "' + apen2.slice(0, 50) + '"'});
    R.add('B7d-reviewer', 'reviewer set → "Reviewed by" on that author\'s posts only', /Reviewed by Mehedi Hasan/.test(by.l2 || '') && /Mehedi Hasan/.test(ap.honest) && !other, {measured: 'care post "' + by.l2 + '", author page "' + ap.honest.slice(0, 90) + '", style post "' + other + '"'});
    /* site-wide reviewer */
    await go(T, '#/admin/blog?tab=authors', 400); await change(T, '#zb-bl-r', 'Shop Reviewer QA');
    await go(T, '#/journal/one-oxford-shirt-three-ways', 500); const o2 = await L.ev(T, () => (document.querySelector('.bf-by-l2') || {}).textContent || null);
    R.add('B7e-sitereviewer', 'site-wide "Reviewed by" shows on posts without their own reviewer', /Shop Reviewer QA/.test(o2 || ''), {measured: String(o2)});
    await L.shot(T, D.name + '-B7-reviewed-post');
  }

  /* B8 ads: switch off → gone; add new → shows; all off → no ads at all */
  if(run('B8')){
    await go(T, '#/journal', 500); const before = await L.ev(T, () => (document.querySelector('[data-bf-slot="home-top"]') || {}).dataset ? document.querySelector('[data-bf-slot="home-top"]').dataset.bfAd : null);
    await go(T, '#/admin/blog?tab=ads');
    await click(T, '[data-act=zb-ad-on][data-id="' + before + '"]');
    await go(T, '#/journal', 500); const after = await L.ev(T, () => [...document.querySelectorAll('[data-bf-ad]')].map(x => x.dataset.bfAd));
    R.add('B8a-off', 'ad switched off in the back end disappears from the shop', !!before && !after.includes(before), {measured: before + ' → shop ads now ' + JSON.stringify(after)});
    /* new ad through the editor */
    await go(T, '#/admin/blog?tab=ads&ad=new', 600);
    await click(T, '[data-act=zb-ad-type][data-v=product]');
    await T.p.locator('#zb-ad-pick').selectOption('heavyweight-hoodie').catch(() => {}); await L.wait(T, 300);
    await click(T, '[data-act=zb-ad-slot][data-v=home-top]');
    await T.p.locator('#zb-ad-t').fill('QA new hoodie ad'); await L.wait(T, 100);
    await click(T, '[data-testid=zb-ad-save]'); const ts = await toastTxt(T);
    await go(T, '#/journal', 500); const nw = await L.ev(T, () => { const x = document.querySelector('[data-bf-slot="home-top"]'); return x ? {id: x.dataset.bfAd, t: x.querySelector('.bf-adt').textContent, href: x.querySelector('.bf-adt').getAttribute('href')} : null; });
    R.add('B8b-new', 'new ad added in the back end shows on the shop', !!nw && nw.t === 'QA new hoodie ad' && nw.href === '#/p/heavyweight-hoodie', {measured: JSON.stringify(nw) + ' (save toast "' + ts + '")'});
    /* everything off */
    await go(T, '#/admin/blog?tab=ads');
    const ids = await L.ev(T, () => ST.blogAds.filter(a => a.active).map(a => a.id));
    for(const id of ids) await click(T, '[data-act=zb-ad-on][data-id="' + id + '"]');
    const left = [];
    for(const h of ['#/journal', '#/journal/topic/care', '#/journal/how-to-wash-denim', '#/journal/how-to-keep-a-polo-shirt-in-shape']){ await go(T, h, 500); await L.ev(T, () => scrollTo(0, document.documentElement.scrollHeight * 0.7)); await L.wait(T, 400); left.push(...(await L.ev(T, () => [...document.querySelectorAll('[data-bf-ad]')].map(x => x.dataset.bfSlot + '=' + x.dataset.bfAd + (x.id === 'bf-bar' && x.classList.contains('on') ? '(showing)' : ''))))); }
    R.add('B8c-alloff', 'all ads off in the back end → no ads anywhere on the blog', left.length === 0, {measured: left.length ? JSON.stringify([...new Set(left)]) : 'none'});
    if(left.length) await L.shot(T, D.name + '-B8-ads-off-bar');
  }

  /* B9 reload keeps everything; reset returns the seed */
  if(run('B9')){
    const snap = await L.ev(T, () => ({care: (zb_pillar('care') || {}).en, jotno: (zb_author('jotno') || {}).name, ads: ST.blogAds.length, journal: DB.journal.length}));
    await T.p.reload(); await L.wait(T, 900);
    const after = await L.ev(T, () => ({care: (zb_pillar('care') || {}).en, jotno: (zb_author('jotno') || {}).name, ads: (ST.blogAds || []).length, journal: DB.journal.length}));
    R.add('B9a-reload', 'reload keeps the owner\'s changes', JSON.stringify(snap) === JSON.stringify(after), {measured: JSON.stringify(after), expected: JSON.stringify(snap)});
    await L.ev(T, () => resetState()); await L.wait(T, 500); await go(T, '#/admin/blog?tab=ads', 500);
    const seed = await L.ev(T, () => ({care: (zb_pillar('care') || {}).en, jotno: (zb_author('jotno') || {}).name, ads: ST.blogAds.length, journal: DB.journal.length, posts: bfAll().length, rev: (ST.blogByline || {}).reviewedBy || '', seedAds: zb_adSeed().length}));
    R.add('B9b-reset', 'reset → seed again', seed.care === 'Care & washing' && seed.jotno === 'Jotno' && seed.ads === seed.seedAds && !seed.rev, {measured: JSON.stringify(seed)});
  }

  /* B10 owner view: status chips, agent steps only in the dashed demo strip, no agent codes / PR numbers */
  if(run('B10')){
    const scan = async () => L.ev(T, () => { const page = document.querySelector('.zb-page'); if(!page) return null; const clone = page.cloneNode(true); clone.querySelectorAll('[data-testid=zbp-demo]').forEach(e => e.remove()); const vis = page.innerText; const txt = (() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:-9999px;width:1200px'; d.appendChild(clone); document.body.appendChild(d); const t = d.innerText; d.remove(); return t; })();
      const codes = (txt.match(/A360-\d+/g) || []), prs = (txt.match(/\bPR\s?\d{3}/g) || []);
      const agentBtns = [...page.querySelectorAll('[data-act=zb-p-submit],[data-act=zb-p-ck],[data-act=zb-p-pass],[data-act=zb-p-final],[data-act=zb-p-autolink],[data-act=zb-p-fix]')];
      return {codes: [...new Set(codes)].slice(0, 6), prs: [...new Set(prs)].slice(0, 6), agentOutside: agentBtns.filter(b => !b.closest('[data-testid=zbp-demo]')).length, agentIn: agentBtns.length, strips: page.querySelectorAll('[data-testid=zbp-demo]').length, stripLabel: /ডেমো: এজেন্টের ধাপ/.test(vis), status: page.querySelectorAll('[data-testid=zbp-status]').length, dashed: (() => { const s = page.querySelector('[data-testid=zbp-demo]'); return s ? getComputedStyle(s).borderStyle : null; })()}; });
    const res = {};
    for(const [id, h] of [['posts', '#/admin/blog'], ['topics', '#/admin/blog?tab=topics'], ['pipe', '#/admin/blog?tab=pipe'], ['sched', '#/admin/blog?tab=sched'], ['results', '#/admin/blog?tab=results'], ['authors', '#/admin/blog?tab=authors'], ['author-profile', '#/admin/blog?tab=authors&a=jotno'], ['cats', '#/admin/blog?tab=cats'], ['ads', '#/admin/blog?tab=ads'], ['ad-edit', '#/admin/blog?tab=ads&ad=ad-denim-popup'], ['seo', '#/admin/blog?tab=seo'], ['editor', '#/admin/blog/bx-how-to-wash-denim']]){ await go(T, h, 500); res[id] = await scan(); }
    const bad = Object.entries(res).filter(([k, v]) => v && (v.codes.length || v.prs.length)).map(([k, v]) => k + ': ' + v.codes.concat(v.prs).join(','));
    R.add('B10a-nocodes', 'owner screens show no agent codes (A360-…) or PR numbers', bad.length === 0, {measured: bad.join(' | ') || 'none'});
    const p = res.pipe || {};
    R.add('B10b-strip', 'agent-step buttons only inside the dashed "ডেমো: এজেন্টের ধাপ" strip; owner sees status chips', p.agentOutside === 0 && p.agentIn > 0 && p.stripLabel && p.status > 0 && /dashed/.test(p.dashed || ''), {measured: JSON.stringify(p)});
    /* switch demo off = the owner's live view */
    await go(T, '#/admin/blog?tab=pipe', 500);
    if(await T.p.locator('[data-act=zb-p-demo]').count()){ await click(T, '[data-act=zb-p-demo]'); const off = await scan(); R.add('B10c-liveview', 'demo switch off → no agent buttons at all, status chips stay', off.agentIn === 0 && off.status > 0, {measured: JSON.stringify(off)}); await L.shot(T, D.name + '-B10-owner-view'); await click(T, '[data-act=zb-p-demo]'); }
    else R.add('B10c-liveview', 'demo switch exists', false);
  }

  for(const [id, h] of B1full){ await go(T, h, 600); await L.shot(T, D.name + '-admin-' + id + '-full', true); }
  R.add('B99-errors', 'JS errors during back-end flows', T.errs.length === 0, {measured: T.errs.slice(0, 5).join(' | ') || 'none'});
  await L.close(T);
})().catch(e => { console.error('CRASH', e); R.add('B00-crash', 'backend crashed', false, {measured: String(e).slice(0, 300)}); process.exit(1); });
