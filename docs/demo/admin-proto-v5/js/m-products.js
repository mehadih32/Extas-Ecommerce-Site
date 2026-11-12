/* EXTAS admin prototype — Products section: all products + editor, add (ERP import / manual), publish queue,
   stock (from ERP), shop ranking, combos, reviews & questions, size charts. */
(function () {
  'use strict';
  const A = window.A; const U = A.ui; const C = A.calc; const t = (en, bn) => A.t(en, bn);
  const DAY = 864e5;

  A.css('products', `
  .prd-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
  .prd-tools .inp{max-width:320px}
  .prd-tools .grow{flex:1}
  .prd-chips{margin-bottom:8px}
  .prd-bulk{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;border-radius:12px;background:var(--accent-soft);margin-bottom:12px}
  .prd-strike{text-decoration:line-through;color:var(--muted);font-size:12px;margin-left:4px}
  .prd-low{color:var(--bad);font-weight:700}
  .prd-smonly{display:none}
  @media (max-width:560px){.prd-smonly{display:inline-flex;margin-top:3px}.prd-tools .inp{max-width:none;width:100%}}
  .prd-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
  .prd-ph{border:1px dashed var(--line2);border-radius:10px;aspect-ratio:3/4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11.5px;color:var(--muted);text-align:center;padding:4px}
  .prd-ph.has{border-style:solid;background:var(--card2);color:var(--ink2)}
  .prd-ph.miss{border-color:var(--bad);color:var(--bad)}
  .prd-gprev{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--card)}
  .prd-gprev .u{font-size:12px;color:var(--good)}
  .prd-gprev .ti{color:var(--info);font-size:17px;line-height:1.3;margin:2px 0}
  .prd-gprev .de{font-size:13px;color:var(--ink2)}
  .prd-ck{display:flex;gap:8px;align-items:flex-start;padding:6px 0;font-size:13.5px}
  .prd-ck svg{width:18px;height:18px;flex:none;margin-top:1px}
  .prd-ck.ok svg{color:var(--good)} .prd-ck.no svg{color:var(--bad)}
  .prd-heat{border-collapse:separate;border-spacing:4px;width:100%}
  .prd-heat td,.prd-heat th{text-align:center;font-size:12.5px;padding:7px 4px;border-radius:7px}
  .prd-heat th{color:var(--muted);font-weight:600}
  .prd-h0{background:var(--bad-soft);color:var(--bad);font-weight:700}
  .prd-h1{background:var(--warn-soft);color:var(--warn);font-weight:700}
  .prd-h2{background:var(--good-soft);color:var(--good)}
  .prd-h3{background:color-mix(in srgb,var(--good) 30%,var(--card));color:var(--ink);font-weight:600}
  .prd-rank{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)}
  .prd-rank:last-child{border:0}
  .prd-rank .n{width:26px;font-weight:700;text-align:right;flex:none}
  .prd-rank .sc{width:110px;flex:none}
  .prd-w{display:grid;grid-template-columns:1fr 70px;gap:4px 10px;align-items:center;font-size:13px}
  .prd-w input[type=range]{width:100%;accent-color:var(--accent)}
  .prd-coll{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
  .prd-coll .it{flex:none;width:86px;font-size:11px;text-align:center}
  .prd-coll .it .thumb{margin:0 auto 4px}
  .prd-combo{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .prd-stars{color:var(--c4);letter-spacing:1px}
  .prd-sc input.inp{width:64px;padding:6px;text-align:center}
  .prd-sc td small{display:block;color:var(--muted);font-size:11px;margin-top:2px}
  .prd-pp{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--card2)}
  .prd-pp .tbl th,.prd-pp .tbl td{padding:6px 5px;font-size:12.5px}
  .prd-szb{display:inline-grid;place-items:center;min-width:38px;height:34px;border:1px solid var(--line2);border-radius:8px;margin:0 6px 6px 0;font-weight:600;font-size:13px;background:var(--card)}
  .prd-steps{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
  .prd-steps span{padding:6px 10px;border-radius:999px;background:var(--card2);font-size:12.5px;color:var(--muted);border:1px solid var(--line)}
  .prd-steps span.on{background:var(--ink);color:var(--card);border-color:var(--ink)}
  .prd-steps span.done{color:var(--good);border-color:var(--good)}
  .prd-tog{display:flex;flex-wrap:wrap;gap:6px}
  .prd-q{border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px}
  `);

  /* ---------------- shared data helpers ---------------- */
  function ensure() {
    const D = A.D;
    if (!D.pset) D.pset = { minMargin: 50, weights: { sales: 35, conv: 20, margin: 15, stock: 20, fresh: 10 }, baseRanks: null, collections: ['New in', 'Winter edit', 'Best sellers', 'Office wear', 'Eid collection'] };
    if (!D.sizeCharts) {
      const top = ['S', 'M', 'L', 'XL', 'XXL'], bot = ['30', '32', '34', '36', '38'];
      const r = (point, vals) => ({ point, vals });
      D.sizeCharts = [
        { id: 'SC1', name: 'Polo & T-shirt', cats: ['polo', 'tshirt'], sizes: top, rows: [r('Chest', [38, 40, 42, 44, 46]), r('Length', [27, 28, 29, 30, 31]), r('Shoulder', [16.5, 17, 17.5, 18, 18.5]), r('Sleeve', [7.5, 8, 8.5, 9, 9.5])] },
        { id: 'SC2', name: 'Shirt', cats: ['shirt'], sizes: top, rows: [r('Chest', [39, 41, 43, 45, 47]), r('Length', [28, 29, 30, 31, 32]), r('Shoulder', [17, 17.5, 18, 18.5, 19]), r('Sleeve', [24, 24.5, 25, 25.5, 26])] },
        { id: 'SC3', name: 'Panjabi', cats: ['panjabi'], sizes: top, rows: [r('Chest', [40, 42, 44, 46, 48]), r('Length', [40, 41, 42, 43, 44]), r('Shoulder', [17, 17.5, 18, 18.5, 19]), r('Sleeve', [23, 23.5, 24, 24.5, 25])] },
        { id: 'SC4', name: 'Trousers, denim & joggers', cats: ['trouser', 'denim', 'jogger'], sizes: bot, rows: [r('Waist', [30, 32, 34, 36, 38]), r('Hip', [38, 40, 42, 44, 46]), r('Length', [39, 40, 40, 41, 41]), r('Thigh', [22, 23, 24, 25, 26])] },
        { id: 'SC5', name: 'Hoodie & sweatshirt', cats: ['hoodie'], sizes: top, rows: [r('Chest', [40, 42, 44, 46, 48]), r('Length', [26, 27, 28, 29, 30]), r('Sleeve', [24, 24.5, 25, 25.5, 26])] },
      ];
    }
    if (!D.combos) {
      const live = D.products.filter((p) => p.status === 'live');
      const best = (cat, n = 0) => live.filter((p) => p.cat === cat).sort((a, b) => b.sold30 - a.sold30)[n];
      const mk = (id, name, items, sold, on = true) => { items = items.filter(Boolean); const sep = A.sum(items, (x) => x.price); return { id, name, pids: items.map((x) => x.id), price: Math.round(sep * 0.91 / 10) * 10 - 10, sold30: sold, on }; };
      D.combos = [
        mk('CB1', 'Polo + Chino', [best('polo'), best('trouser')], 18),
        mk('CB2', 'Tee 3-pack', [best('tshirt'), best('tshirt', 1), best('tshirt', 2)], 26),
        mk('CB3', 'Hoodie + Jogger', [best('hoodie'), best('jogger')], 12),
        mk('CB4', 'Office set: Shirt + Trousers', [best('shirt'), best('trouser', 1)], 7),
        mk('CB5', 'Panjabi + Katua', [best('panjabi'), best('katua')], 4, false),
      ];
    }
    return D.pset;
  }
  const catNm = (id) => { const c = A.byId(A.CATS, id); return c ? t(c.en, c.bn) : id; };
  const stockOf = (p) => A.sum(p.variants, (v) => v.stock);
  const marginOf = (price, cost) => (price ? (price - cost) / price * 100 : 0);
  const pm = (p) => marginOf(p.price, p.cost);
  const isLow = (p) => p.variants.some((v) => v.stock <= 2) || stockOf(p) < 10;
  const needPhotos = (p) => p.photos < p.colors.length;
  const reservedMap = () => { const m = {}; for (const o of A.D.orders) if (['new', 'confirmed', 'packed'].includes(o.status)) for (const l of o.lines) m[l.sku] = (m[l.sku] || 0) + l.qty; return m; };
  const hasChart = (p) => p.cat === 'extras' || !!p.sizeChartId || p.chartSource === 'erp' || p.chartSource === 'new' || A.D.sizeCharts.some((c) => !c.archived && c.cats.includes(p.cat));
  const pinOk = (v) => /^\d{4}$/.test(String(v || '').trim());
  const marginBadge = (m) => U.badge(A.fmt.pct(m, 0), m < A.D.pset.minMargin ? 'bad' : m < A.D.pset.minMargin + 8 ? 'warn' : 'good');
  const syncAgo = () => A.fmt.ago(A.D.erp.lastStockSync);
  const nextId = () => 'P' + (Math.max(...A.D.products.map((p) => +p.id.slice(1))) + 1);
  const ago30 = A.TODAY - 30 * DAY;

  function checklist(p) {
    const fr = Math.min(p.photos, p.colors.length);
    return [
      { k: 'photos', ok: p.photos >= p.colors.length, l: t(`Front photo for every colour (${fr}/${p.colors.length})`, `প্রতিটা কালারের সামনের ছবি (${fr}/${p.colors.length})`) },
      { k: 'desc', ok: (p.desc || '').length >= 40, l: t('Description (at least 40 letters)', 'বিবরণ (কমপক্ষে 40 অক্ষর)') },
      { k: 'price', ok: p.price > 0 && p.price > p.cost, l: t('Selling price above buying price', 'বিক্রির দাম কেনা দামের বেশি') },
      { k: 'chart', ok: hasChart(p), l: t('Size chart for this category', 'এই ক্যাটাগরির সাইজ চার্ট') },
      { k: 'seo', ok: !!(p.seo.title && p.seo.desc), l: t('Google title and description', 'গুগলের টাইটেল ও বিবরণ') },
    ];
  }
  const ckDone = (p) => checklist(p).every((c) => c.ok);
  const ckHtml = (list) => list.map((c) => `<div class="prd-ck ${c.ok ? 'ok' : 'no'}">${A.icon(c.ok ? 'check' : 'x')}<span>${c.l}</span></div>`).join('');

  /** owner PIN step for money / price changes */
  function pinConfirm(title, html, okLabel, onOk) {
    const m = U.modal(title, `${html}<div style="margin-top:12px">${U.field(t('Owner PIN', 'মালিকের PIN'), `<input class="inp" id="pc-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="max-width:140px">`, t('Price changes need the owner PIN (any 4 digits in this demo).', 'দাম বদলাতে মালিকের PIN লাগে (ডেমোতে যেকোনো 4 সংখ্যা)।'))}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="pc-ok">${okLabel}</button>`, wide: true });
    m.querySelector('#pc-ok').onclick = () => { if (!pinOk(m.querySelector('#pc-pin').value)) { A.toast(t('Enter the 4-digit PIN', '4 সংখ্যার PIN দিন'), 'bad'); return; } U.close(); onOk(); };
  }

  function salesDaily(p) {
    const days = []; for (let i = 29; i >= 0; i--) days.push(A.fmt.ymd(A.TODAY - i * DAY));
    const m = Object.fromEntries(days.map((d) => [d, 0]));
    for (const o of A.D.orders) { if (o.status === 'cancelled' || new Date(o.created) < ago30) continue; const d = A.fmt.ymd(o.created); if (d in m) for (const l of o.lines) if (l.pid === p.id) m[d] += l.qty; }
    return days.map((d) => m[d]);
  }
  const returns30 = (p) => A.D.orders.filter((o) => o.status === 'returned' && new Date(o.created) >= ago30 && o.lines.some((l) => l.pid === p.id)).length;

  /* ================= ALL PRODUCTS ================= */
  const st = { q: '', status: 'all', cat: 'all', sort: 'sold', sel: new Set(), more: false };

  function renderAll(el, r) {
    ensure();
    if (r.id && A.byId(A.D.products, r.id)) return renderEditor(el, A.byId(A.D.products, r.id));
    const P = A.D.products; const live = P.filter((p) => p.status === 'live'); const cnt = C.counts();
    const avgM = live.length ? A.sum(live, pm) / live.length : 0;
    const nPh = P.filter((p) => p.status !== 'archived' && needPhotos(p)).length;
    const lowM = live.filter((p) => pm(p) < A.D.pset.minMargin);
    const zero = live.filter((p) => !p.sold30);
    const top = live.slice().sort((a, b) => b.sold30 - a.sold30)[0];
    const catSold = A.groupBy(live, (p) => p.cat); const bestCat = Object.keys(catSold).sort((a, b) => A.sum(catSold[b], (p) => p.revenue30) - A.sum(catSold[a], (p) => p.revenue30))[0];
    el.innerHTML = A.pageHead(t('Products', 'প্রোডাক্ট'), t(`${P.length} products · stock and buying prices come from the ERP (synced ${syncAgo()})`, `${P.length}টি প্রোডাক্ট · স্টক ও কেনা দাম ERP থেকে আসে (সিংক ${syncAgo()})`),
      `<button class="btn" id="pa-exp">${A.icon('down')}${t('Export', 'এক্সপোর্ট')}</button><button class="btn" id="pa-qi">${A.icon('sync')}${t('Quick import', 'কুইক ইমপোর্ট')}</button><a class="btn primary" href="${A.href('products', 'add')}">${A.icon('plus')}${t('Add product', 'নতুন প্রোডাক্ট')}</a>`) + A.tabsBar('products', 'all') +
      `<div class="grid g5" style="margin-bottom:14px">
        ${U.kpi({ label: t('On the shop', 'সাইটে লাইভ'), value: A.fmt.num(live.length), sub: t(`${A.fmt.num(A.sum(live, (p) => p.sold30))} pieces sold in 30 days`, `30 দিনে ${A.fmt.num(A.sum(live, (p) => p.sold30))} পিস বিক্রি`) })}
        ${U.kpi({ label: t('Drafts & scheduled', 'খসড়া ও শিডিউল'), value: P.filter((p) => ['draft', 'ready', 'scheduled'].includes(p.status)).length, sub: `<a href="#" id="pa-drafts">${t('See what is left', 'কী বাকি দেখুন')} →</a>` })}
        ${U.kpi({ label: t('Sizes almost out', 'সাইজ প্রায় শেষ'), value: cnt.low, sub: `<a href="${A.href('products', 'stock')}">${t('See stock', 'স্টক দেখুন')} →</a>` })}
        ${U.kpi({ label: t('Need photos', 'ছবি লাগবে'), value: nPh, sub: t('front photo missing for a colour', 'কোনো কালারের সামনের ছবি নেই') })}
        ${U.kpi({ label: t('Average margin', 'গড় মার্জিন'), value: A.fmt.pct(avgM), sub: t(`${lowM.length} below your ${A.D.pset.minMargin}% minimum`, `${lowM.length}টি আপনার ${A.D.pset.minMargin}% সীমার নিচে`) })}
      </div>` +
      U.callout(t(`<b>${A.esc(top ? top.name : '')}</b> is your best seller (${top ? top.sold30 : 0} pieces in 30 days). ${catNm(bestCat)} bring the most money. ${zero.length} products on the shop sold nothing in 30 days — push them down in <a href="${A.href('products', 'ranking')}">Shop ranking</a> or put them in a combo.`,
        `<b>${A.esc(top ? top.name : '')}</b> সবচেয়ে বেশি বিক্রি হচ্ছে (30 দিনে ${top ? top.sold30 : 0} পিস)। সবচেয়ে বেশি টাকা আসছে ${catNm(bestCat)} থেকে। সাইটের ${zero.length}টি প্রোডাক্ট 30 দিনে একটাও বিক্রি হয়নি — <a href="${A.href('products', 'ranking')}">দোকানে সাজানো</a> পেজে নিচে নামান বা কম্বোতে দিন।`), 'info', 'info') +
      `<div class="card" style="margin-top:14px"><div class="prd-tools"><input class="inp" id="pa-q" placeholder="${t('Search name, style code or SKU', 'নাম, স্টাইল কোড বা SKU খুঁজুন')}" value="${A.esc(st.q)}"><span class="grow"></span>${U.select('pa-sort', [['sold', t('Sort: best selling', 'সাজান: বেশি বিক্রি')], ['new', t('Sort: newest', 'সাজান: নতুন আগে')], ['margin', t('Sort: margin', 'সাজান: মার্জিন')], ['stock', t('Sort: stock (low first)', 'সাজান: স্টক (কম আগে)')]], st.sort, 'style="max-width:220px"')}</div><div id="pa-chips"></div><div id="pa-bulk"></div><div id="pa-list"></div></div>`;
    const q = el.querySelector('#pa-q'); q.oninput = () => { st.q = q.value; st.more = false; draw(); };
    el.querySelector('#pa-sort').onchange = (e) => { st.sort = e.target.value; draw(); };
    el.querySelector('#pa-qi').onclick = () => quickImport();
    el.querySelector('#pa-drafts').onclick = (e) => { e.preventDefault(); st.status = 'draft'; draw(); };
    el.querySelector('#pa-exp').onclick = () => U.download(t(`products-${P.length}.csv`, `products-${P.length}.csv`));
    function filtered() {
      const s = st.q.trim().toLowerCase();
      return P.filter((p) => (!s || p.name.toLowerCase().includes(s) || p.styleCode.toLowerCase().includes(s) || p.variants.some((v) => v.sku.toLowerCase().includes(s))));
    }
    function draw() {
      const base = filtered();
      const stOk = (p, k) => k === 'all' || p.status === k || (k === 'draft' && p.status === 'ready');
      const byStatus = base.filter((p) => stOk(p, st.status));
      const rows = byStatus.filter((p) => st.cat === 'all' || p.cat === st.cat);
      const sorters = { sold: (a, b) => b.sold30 - a.sold30, new: (a, b) => new Date(b.created) - new Date(a.created), margin: (a, b) => pm(b) - pm(a), stock: (a, b) => stockOf(a) - stockOf(b) };
      rows.sort(sorters[st.sort]);
      const sc = (k) => (k === 'demo' ? demoData().items.filter((it) => !st.q || it.name.toLowerCase().includes(st.q.trim().toLowerCase())).length : base.filter((p) => stOk(p, k)).length);
      const stChips = [['all', t('All', 'সব')], ['live', t('On the shop', 'সাইটে লাইভ')], ['draft', t('Draft', 'খসড়া')], ['scheduled', t('Scheduled', 'শিডিউল করা')], ['archived', t('Archived', 'আর্কাইভ')], ['demo', t('Demo', 'ডেমো')]];
      const mName = { photos: t('Photos', 'ছবি'), desc: t('Description', 'বিবরণ'), price: t('Price', 'দাম'), chart: t('Size chart', 'সাইজ চার্ট'), seo: t('Google text', 'Google-এর লেখা') };
      const needs = st.status === 'draft' || st.status === 'scheduled';
      const catChips = [['all', t('All categories', 'সব ক্যাটাগরি')]].concat(A.CATS.map((c) => [c.id, t(c.en, c.bn)]));
      el.querySelector('#pa-chips').innerHTML = `<div class="chips prd-chips">${stChips.map((c) => `<button class="chip ${st.status === c[0] ? 'on' : ''}" data-st="${c[0]}">${c[1]}<span class="c">${sc(c[0])}</span></button>`).join('')}</div><div class="chips prd-chips">${catChips.map((c) => `<button class="chip ${st.cat === c[0] ? 'on' : ''}" data-cat="${c[0]}">${c[1]}<span class="c">${(st.status === 'demo' ? demoData().items : byStatus).filter((p) => c[0] === 'all' || p.cat === c[0]).length}</span></button>`).join('')}</div>`;
      A.on(el, '[data-st]', 'click', (e, b) => { st.status = b.dataset.st; draw(); });
      A.on(el, '[data-cat]', 'click', (e, b) => { st.cat = b.dataset.cat; draw(); });
      if (st.status === 'demo') { demoList(el); st.sel.clear(); bulk(); return; }
      const shown = st.more ? rows : rows.slice(0, 40);
      const cols = [
        { h: `<input type="checkbox" id="pa-all" aria-label="Select all">`, f: (p) => `<input type="checkbox" data-sel="${p.id}" ${st.sel.has(p.id) ? 'checked' : ''} aria-label="Select">` },
        { h: t('Product', 'প্রোডাক্ট'), f: (p) => `<div class="cellmain">${U.thumb(p)}<div style="min-width:0"><b class="ellip" style="max-width:240px">${A.esc(p.name)}</b><span class="muted small mono">${p.styleCode}</span><div class="prd-smonly">${stBadge(p)}</div></div></div>` },
        { h: t('Category', 'ক্যাটাগরি'), hide: true, f: (p) => `<span class="small">${catNm(p.cat)}</span>` },
        { h: t('Colours', 'কালার'), hide: true, f: (p) => U.sw2(p.colors) },
        { h: t('Price', 'দাম'), r: true, f: (p) => `${A.fmt.tk(p.price)}${p.compareAt ? `<div class="prd-strike">${A.fmt.tk(p.compareAt)}</div>` : ''}` },
        { h: t('Buying price (ERP) · margin', 'কেনা দাম (ERP) · মার্জিন'), r: true, hide: true, f: (p) => `<span class="small">${A.fmt.tk(p.cost)}</span> ${marginBadge(pm(p))}` },
        { h: t('Stock', 'স্টক'), r: true, f: (p) => { const lowN = p.variants.filter((v) => v.stock <= 2).length; return `<span class="${stockOf(p) < 10 ? 'prd-low' : ''}">${A.fmt.num(stockOf(p))}</span>${lowN ? `<div class="small" style="color:var(--warn)">${t(`${lowN} sizes low`, `${lowN} সাইজ কম`)}</div>` : ''}`; } },
        { h: t('Sold 30d', '30 দিনে বিক্রি'), r: true, hide: true, f: (p) => A.fmt.num(p.sold30) },
        needs ? { h: t('Still needs', 'যা বাকি'), f: (p) => { const miss = checklist(p).filter((c) => !c.ok); return `${p.status === 'scheduled' && p.scheduleAt ? `<div class="small">${A.icon('info')} ${t(`Goes live ${A.fmt.dt(p.scheduleAt)}`, `লাইভ হবে ${A.fmt.dt(p.scheduleAt)}`)}</div>` : ''}${miss.length ? miss.map((c) => U.badge(mName[c.k], 'warn')).join(' ') : U.badge(t('Nothing — ready', 'কিছু না — রেডি'), 'good')} <a class="small" href="${A.href('products', 'add', p.id)}" data-fin="1">${t('Finish', 'শেষ করুন')} →</a>`; } } : { h: t('Status', 'অবস্থা'), hide: true, f: (p) => stBadge(p) },
      ];
      el.querySelector('#pa-list').innerHTML = U.table(cols, shown.map((p) => Object.assign({}, p, { _id: p.id })), { onRow: true, empty: t('No product matches this search', 'এই খোঁজে কোনো প্রোডাক্ট নেই') }) +
        (rows.length > shown.length ? `<div style="text-align:center;margin-top:10px"><button class="btn" id="pa-more">${t(`Show all ${rows.length}`, `সব ${rows.length}টি দেখুন`)}</button></div>` : '');
      const more = el.querySelector('#pa-more'); if (more) more.onclick = () => { st.more = true; draw(); };
      el.querySelectorAll('#pa-list tr.click').forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('input,a')) return; A.go('products', 'all', tr.dataset.row); }));
      A.on(el, '[data-sel]', 'change', (e, c) => { c.checked ? st.sel.add(c.dataset.sel) : st.sel.delete(c.dataset.sel); bulk(); });
      const all = el.querySelector('#pa-all'); if (all) { all.checked = shown.length && shown.every((p) => st.sel.has(p.id)); all.onchange = () => { shown.forEach((p) => (all.checked ? st.sel.add(p.id) : st.sel.delete(p.id))); draw(); }; }
      bulk();
    }
    function bulk() {
      const n = st.sel.size; const box = el.querySelector('#pa-bulk');
      if (!n) { box.innerHTML = ''; return; }
      box.innerHTML = `<div class="prd-bulk"><b>${t(`${n} selected`, `${n}টি সিলেক্ট করা`)}</b><button class="btn sm" data-b="price">${t('Change price by %', 'দাম % এ বদলান')}</button><button class="btn sm" data-b="pub">${t('Publish', 'পাবলিশ')}</button><button class="btn sm" data-b="unpub">${t('Unpublish', 'আনপাবলিশ')}</button><button class="btn sm" data-b="coll">${t('Add to collection', 'কালেকশনে দিন')}</button><button class="btn sm" data-b="exp">${t('Export', 'এক্সপোর্ট')}</button><button class="btn sm ghost" data-b="clear">${t('Clear', 'বাদ দিন')}</button></div>`;
      A.on(box, '[data-b]', 'click', (e, b) => bulkAct(b.dataset.b));
    }
    function bulkAct(k) {
      const list = [...st.sel].map((id) => A.byId(P, id)).filter(Boolean);
      if (k === 'clear') { st.sel.clear(); draw(); return; }
      if (k === 'exp') { U.download(`products-selected-${list.length}.csv`); return; }
      if (k === 'pub') {
        const ok = list.filter(ckDone); ok.forEach((p) => (p.status = 'live'));
        A.commit(`Published ${ok.length} products`); A.toast(t(`${ok.length} published${list.length - ok.length ? `, ${list.length - ok.length} skipped (checklist not complete)` : ''}`, `${ok.length}টি পাবলিশ হলো${list.length - ok.length ? `, ${list.length - ok.length}টি বাদ (চেকলিস্ট অসম্পূর্ণ)` : ''}`), 'good'); st.sel.clear(); A.render(); return;
      }
      if (k === 'unpub') {
        U.confirm(t('Hide from the shop?', 'সাইট থেকে লুকাবেন?'), t(`${list.length} products will be hidden from customers. Stock stays in the ERP.`, `${list.length}টি প্রোডাক্ট কাস্টমার আর দেখবে না। স্টক ERP তেই থাকবে।`), t('Unpublish', 'আনপাবলিশ'), () => {
          list.forEach((p) => { if (p.status === 'live') p.status = ckDone(p) ? 'ready' : 'draft'; });
          A.commit(`Unpublished ${list.length} products`); A.toast(t(`${list.length} hidden from the shop`, `${list.length}টি সাইট থেকে লুকানো হলো`), 'good'); st.sel.clear(); A.render();
        }, true); return;
      }
      if (k === 'coll') {
        const m = U.modal(t('Add to collection', 'কালেকশনে দিন'), U.field(t('Collection', 'কালেকশন'), U.select('pc-col', A.D.pset.collections.map((c) => [c, c]), A.D.pset.collections[0])), { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="pc-go">${t('Add', 'যোগ করুন')}</button>` });
        m.querySelector('#pc-go').onclick = () => { const c = m.querySelector('#pc-col').value; list.forEach((p) => { p.collections = p.collections || []; if (!p.collections.includes(c)) p.collections.push(c); }); U.close(); A.commit(`Added ${list.length} products to ${c}`); A.toast(t(`${list.length} added to “${c}”`, `${list.length}টি “${c}” কালেকশনে দেওয়া হলো`), 'good'); st.sel.clear(); A.render(); };
        return;
      }
      if (k === 'price') {
        const m = U.modal(t('Change price by %', 'দাম % এ বদলান'), `<div class="formgrid">${U.field(t('Change (%)', 'পরিবর্তন (%)'), U.input('bp-pct', '-10', 'type="number" step="1"'), t('Use minus for a cut, e.g. -10', 'কমাতে মাইনাস দিন, যেমন -10'))}${U.field(t('Round to', 'রাউন্ড'), U.select('bp-rnd', [['10', t('Nearest ৳10 ending in 0', '৳10 এর ঘরে')], ['1', t('Exact', 'যেমন আছে')]], '10'))}</div><div id="bp-prev" style="margin-top:10px"></div><div style="margin-top:12px">${U.field(t('Owner PIN', 'মালিকের PIN'), `<input class="inp" id="bp-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="max-width:140px">`, t('Any 4 digits in this demo', 'ডেমোতে যেকোনো 4 সংখ্যা'))}</div>`,
          { wide: true, foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="bp-ok">${t('Apply new prices', 'নতুন দাম সেভ করুন')}</button>` });
        const calc = (p) => { const pct = +m.querySelector('#bp-pct').value || 0; const rd = +m.querySelector('#bp-rnd').value; const v = p.price * (1 + pct / 100); return rd === 10 ? Math.round(v / 10) * 10 : Math.round(v); };
        const prev = () => {
          const rows = list.map((p) => { const np = calc(p); return { _id: p.id, p, np }; });
          const low = rows.filter((x) => marginOf(x.np, x.p.cost) < A.D.pset.minMargin).length;
          m.querySelector('#bp-prev').innerHTML = U.table([{ h: t('Product', 'প্রোডাক্ট'), f: (x) => `<span class="ellip" style="max-width:200px;display:inline-block">${A.esc(x.p.name)}</span>` }, { h: t('Before', 'আগে'), r: true, f: (x) => A.fmt.tk(x.p.price) }, { h: t('After', 'পরে'), r: true, f: (x) => `<b>${A.fmt.tk(x.np)}</b>` }, { h: t('Margin', 'মার্জিন'), r: true, f: (x) => `${A.fmt.pct(pm(x.p), 0)} → ${marginBadge(marginOf(x.np, x.p.cost))}` }], rows.slice(0, 8)) + (rows.length > 8 ? `<div class="muted small" style="margin-top:6px">${t(`+ ${rows.length - 8} more`, `+ আরও ${rows.length - 8}টি`)}</div>` : '') + (low ? U.callout(t(`${low} products would go below your ${A.D.pset.minMargin}% minimum margin.`, `${low}টি প্রোডাক্টের মার্জিন আপনার ${A.D.pset.minMargin}% সীমার নিচে যাবে।`), 'warn', 'warn') : '');
        };
        m.querySelector('#bp-pct').oninput = prev; m.querySelector('#bp-rnd').onchange = prev; prev();
        m.querySelector('#bp-ok').onclick = () => {
          if (!pinOk(m.querySelector('#bp-pin').value)) { A.toast(t('Enter the 4-digit PIN', '4 সংখ্যার PIN দিন'), 'bad'); return; }
          const pct = m.querySelector('#bp-pct').value; list.forEach((p) => { const np = calc(p); p.price = np; p.variants.forEach((v) => { if (v.price) v.price = np; }); });
          U.close(); A.commit(`Changed price of ${list.length} products by ${pct}%`); A.toast(t(`New prices saved for ${list.length} products`, `${list.length}টি প্রোডাক্টের নতুন দাম সেভ হলো`), 'good'); st.sel.clear(); A.render();
        };
      }
    }
    draw();
  }

  /* ---------------- product editor (page) ---------------- */
  function kwFor(cat) { return { polo: ['polo'], tshirt: ['t shirt'], shirt: ['oxford', 'linen shirt'], panjabi: ['panjabi'], trouser: ['chino', 'trouser'], denim: ['denim', 'jeans'], jogger: ['jogger'], hoodie: ['hoodie'], jacket: ['jacket'], katua: ['katua'], extras: ['cap'] }[cat] || []; }
  function seoScore(title, desc, slug, p) {
    const tips = []; let s = 100;
    if (title.length < 30 || title.length > 60) { s -= 15; tips.push(t('Keep the title between 30 and 60 letters', 'টাইটেল 30 থেকে 60 অক্ষরের মধ্যে রাখুন')); }
    if (desc.length < 120 || desc.length > 160) { s -= 20; tips.push(t('Description works best at 120–160 letters', 'বিবরণ 120–160 অক্ষর হলে সবচেয়ে ভালো')); }
    const kw = kwFor(p.cat)[0]; if (kw && !(title + ' ' + desc).toLowerCase().includes(kw.split(' ')[0])) { s -= 15; tips.push(t(`Add the word “${kw}” — people search for it`, `“${kw}” শব্দটা দিন — মানুষ এটাই খোঁজে`)); }
    if (!/bangladesh|bd|dhaka/i.test(desc)) { s -= 10; tips.push(t('Mention Bangladesh or cash on delivery in the description', 'বিবরণে Bangladesh বা ক্যাশ অন ডেলিভারি লিখুন')); }
    if (slug.length > 45) { s -= 5; tips.push(t('Shorter web address (slug) is better', 'ওয়েব ঠিকানা (slug) ছোট হলে ভালো')); }
    if (p.photos < p.colors.length) { s -= 10; tips.push(t('More photos with alt text help Google Images', 'alt টেক্সটসহ বেশি ছবি গুগল ইমেজে সাহায্য করে')); }
    return { s: Math.max(10, s), tips };
  }

  function renderEditor(el, p) {
    const res = reservedMap();
    const live = p.status === 'live';
    const kws = A.D.keywords.filter((k) => kwFor(p.cat).some((w) => k.kw.includes(w)));
    const ret = returns30(p); const conv = p.views30 ? p.sold30 / p.views30 * 100 : 0;
    const ck = checklist(p);
    el.innerHTML = A.pageHead(A.esc(p.name), `<span class="mono">${p.styleCode}</span> · ${catNm(p.cat)} · ${stBadge(p)} · ${p.source === 'ERP' ? t('from ERP', 'ERP থেকে') : t('made by hand', 'হাতে বানানো')}`,
      `<a class="btn" href="${A.href('products', 'all')}">← ${t('All products', 'সব প্রোডাক্ট')}</a><a class="btn" href="${A.href('products', 'add', p.id)}">${A.icon('edit')}${t('Edit step by step', 'ধাপে ধাপে এডিট')}</a><button class="btn" id="pe-view">${A.icon('ext')}${t('View on shop', 'সাইটে দেখুন')}</button><button class="btn primary" id="pe-save">${A.icon('check')}${t('Save changes', 'সেভ করুন')}</button>`) + A.tabsBar('products', 'all') +
      `<div class="grid g3">
        <div class="span2 stack">
          ${U.card(t('Basics', 'মূল তথ্য'), `<div class="formgrid">${U.field(t('Name', 'নাম'), U.input('pe-name', p.name))}${U.field(t('Category', 'ক্যাটাগরি'), U.select('pe-cat', A.CATS.map((c) => [c.id, t(c.en, c.bn)]), p.cat))}${U.field(t('Fabric', 'ফেব্রিক'), U.input('pe-fab', p.fabric))}${U.field(t('Fit', 'ফিট'), U.select('pe-fit', [['Regular', 'Regular'], ['Slim', 'Slim'], ['Relaxed', 'Relaxed']], p.fit))}</div>${U.field(t('Description', 'বিবরণ'), `<textarea class="inp" id="pe-desc" rows="3">${A.esc(p.desc)}</textarea>`)}`)}
          ${U.card(t('Photos', 'ছবি'), `<div class="prd-photos">${photoTiles(p)}</div><div class="row" style="margin-top:10px;gap:8px"><button class="btn sm" id="pe-addph">${A.icon('plus')}${t('Add photo', 'ছবি যোগ করুন')}</button><span class="muted small">${t(`${p.photos} photos · required: a front photo for each colour`, `${p.photos}টি ছবি · দরকার: প্রতিটা কালারের সামনের ছবি`)}</span></div>`, { sub: needPhotos(p) ? `<span style="color:var(--bad)">${t(`${p.colors.length - p.photos} front photos missing`, `${p.colors.length - p.photos}টি সামনের ছবি নেই`)}</span>` : t('All colours have a front photo', 'সব কালারের সামনের ছবি আছে') })}
          ${U.card(t('Variants', 'ভ্যারিয়েন্ট'), U.table([
            { h: t('Colour', 'কালার'), f: (v) => `${U.sw(v.color)} ${A.esc(v.color)}` },
            { h: t('Size', 'সাইজ'), f: (v) => `<b>${v.size}</b>` },
            { h: 'SKU', hide: true, f: (v) => `<span class="mono small">${v.sku}</span>` },
            { h: t('Stock (ERP)', 'স্টক (ERP)'), r: true, f: (v) => `<span class="${v.stock <= 2 ? 'prd-low' : ''}">${v.stock}</span>${res[v.sku] ? `<div class="muted small">${t(`${res[v.sku]} in orders`, `${res[v.sku]} অর্ডারে`)}</div>` : ''}` },
            { h: t('Selling price', 'বিক্রির দাম'), r: true, f: (v) => `<input class="inp" data-vp="${v.sku}" type="number" value="${v.price || p.price}" style="width:96px;text-align:right">` },
          ], p.variants), { sub: `${A.icon('sync')} ${t(`Stock is read-only, synced from the ERP ${syncAgo()}`, `স্টক এখানে বদলানো যায় না, ERP থেকে সিংক হয়েছে ${syncAgo()}`)}` })}
          ${U.card(t('Pricing', 'দাম'), `<div class="formgrid">${U.field(t('Selling price', 'বিক্রির দাম'), U.money('pe-price', p.price))}${U.field(t('Compare-at price (crossed out)', 'আগের দাম (কেটে দেখাবে)'), U.money('pe-cmp', p.compareAt || ''))}${U.field(t('Buying price from ERP', 'ERP থেকে কেনা দাম'), `<div class="inp" style="background:var(--card2)">${A.fmt.tk(p.cost)}</div>`, t('Changes only in the ERP', 'শুধু ERP তে বদলায়'))}${U.field(t('Margin', 'মার্জিন'), `<div id="pe-m" class="inp" style="background:var(--card2)"></div>`)}</div><div id="pe-mw" style="margin-top:10px"></div>`)}
          ${U.card(t('Google search look (SEO)', 'গুগলে কেমন দেখাবে (SEO)'), `<div class="prd-gprev" id="pe-gp"></div><div class="formgrid" style="margin-top:12px">${U.field(`${t('Title', 'টাইটেল')} <span class="muted" id="pe-tc"></span>`, U.input('pe-st', p.seo.title))}${U.field(t('Web address (slug)', 'ওয়েব ঠিকানা (slug)'), U.input('pe-slug', p.seo.slug))}</div>${U.field(`${t('Description', 'বিবরণ')} <span class="muted" id="pe-dc"></span>`, `<textarea class="inp" id="pe-sd" rows="2">${A.esc(p.seo.desc)}</textarea>`)}<div id="pe-score" style="margin-top:10px"></div>`)}
        </div>
        <div class="stack">
          ${U.card(t('Publish checklist', 'পাবলিশ চেকলিস্ট'), `${U.bar(ck.filter((c) => c.ok).length / ck.length * 100, ckDone(p) ? 'var(--good)' : 'var(--warn)')}<div style="margin-top:8px">${ckHtml(ck)}</div><div class="row" style="gap:8px;margin-top:10px">${live ? `<button class="btn" id="pe-unpub">${t('Hide from shop', 'সাইট থেকে লুকান')}</button>` : `<button class="btn primary" id="pe-pub" ${ckDone(p) ? '' : 'disabled'}>${t('Publish', 'পাবলিশ')}</button>`}${p.status !== 'archived' ? `<button class="btn ghost" id="pe-arch">${t('Archive', 'আর্কাইভ')}</button>` : ''}</div>`)}
          ${U.card(t('Sales · 30 days', 'বিক্রি · 30 দিন'), `<div class="grid g2" style="gap:10px">${U.kpi({ label: t('Sold', 'বিক্রি'), value: A.fmt.num(p.sold30) })}${U.kpi({ label: t('Revenue', 'আয়'), value: A.fmt.tkShort(p.revenue30) })}${U.kpi({ label: t('Returns', 'রিটার্ন'), value: ret })}${U.kpi({ label: t('Rating', 'রেটিং'), value: p.rating ? p.rating.toFixed(1) + '★' : '—', sub: t(`${p.reviews} reviews`, `${p.reviews}টি রিভিউ`) })}</div><div style="margin:10px 0 4px">${A.chart.spark(salesDaily(p), 'var(--accent)', 260, 40)}</div>${A.chart.funnel([{ label: t('Views', 'ভিউ'), value: p.views30 }, { label: t('Added to cart', 'কার্টে যোগ'), value: p.carts30 }, { label: t('Sold', 'বিক্রি'), value: p.sold30 }])}<div class="muted small">${t(`${A.fmt.pct(conv)} of viewers buy`, `যারা দেখে তাদের ${A.fmt.pct(conv)} কেনে`)}</div>`)}
          ${U.card(t('Google ranking for this type', 'এই ধরনের গুগল র‍্যাঙ্কিং'), kws.length ? `<div class="list">${kws.map((k) => `<div class="li"><span class="grow small">${A.esc(k.kw)}</span><b>#${k.pos || '—'}</b> ${k.prev && k.pos ? A.delta(k.prev, k.pos) : ''}</div>`).join('')}</div>` : U.empty(t('No tracked search word for this category yet', 'এই ক্যাটাগরির কোনো সার্চ শব্দ এখনো ট্র্যাক হচ্ছে না')), { more: t('SEO & Google', 'SEO ও গুগল'), moreHref: A.href('website', 'seo') })}
          ${(p.collections || []).length ? U.card(t('Collections', 'কালেকশন'), `<div class="chips">${p.collections.map((c) => U.badge(c, 'info')).join('')}</div>`) : ''}
        </div>
      </div>`;
    const $ = (s) => el.querySelector(s);
    const live2 = () => {
      const price = +$('#pe-price').value || 0; const m = marginOf(price, p.cost);
      $('#pe-m').innerHTML = `${A.fmt.tk(price - p.cost)} · ${marginBadge(m)}`;
      $('#pe-mw').innerHTML = m < A.D.pset.minMargin ? U.callout(t(`Margin is below your ${A.D.pset.minMargin}% minimum. After courier, COD fee and packaging very little is left.`, `মার্জিন আপনার ${A.D.pset.minMargin}% সীমার নিচে। কুরিয়ার, COD চার্জ ও প্যাকেজিং এর পর খুব কম থাকবে।`), 'warn', 'warn') : '';
      const ti = $('#pe-st').value, de = $('#pe-sd').value, sl = $('#pe-slug').value;
      $('#pe-tc').textContent = `${ti.length}/60`; $('#pe-dc').textContent = `${de.length}/160`;
      $('#pe-gp').innerHTML = `<div class="u">extas.com.bd › products › ${A.esc(sl)}</div><div class="ti">${A.esc(ti || p.name)}</div><div class="de">${A.esc(de || t('No description — Google will pick random text from the page.', 'বিবরণ নেই — গুগল পেজ থেকে যেকোনো লেখা তুলে দেখাবে।'))}</div><div class="small muted" style="margin-top:4px">${A.fmt.tk(price)} · ${t('In stock', 'স্টকে আছে')}${p.rating ? ' · ' + p.rating.toFixed(1) + '★' : ''}</div>`;
      const sc = seoScore(ti, de, sl, p);
      $('#pe-score').innerHTML = `<div class="row between"><b>${t('SEO score', 'SEO স্কোর')}: ${sc.s}/100</b>${U.badge(sc.s >= 80 ? t('Good', 'ভালো') : sc.s >= 60 ? t('OK', 'চলবে') : t('Weak', 'দুর্বল'), sc.s >= 80 ? 'good' : sc.s >= 60 ? 'warn' : 'bad')}</div>${U.bar(sc.s, sc.s >= 80 ? 'var(--good)' : 'var(--warn)')}${sc.tips.length ? `<ul class="small" style="margin:8px 0 0;padding-left:18px">${sc.tips.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}`;
    };
    ['#pe-price', '#pe-st', '#pe-sd', '#pe-slug'].forEach((s) => ($(s).oninput = live2)); live2();
    $('#pe-view').onclick = () => A.toast(t(`Opens extas.com.bd/products/${p.seo.slug}`, `extas.com.bd/products/${p.seo.slug} খুলবে`));
    $('#pe-addph').onclick = () => { p.photos++; A.commit(`Photo added to ${p.name}`); A.toast(t('Photo added', 'ছবি যোগ হলো'), 'good'); A.render(); };
    const setStatus = (s, msg) => { p.status = s; A.commit(msg); A.toast(msg, 'good'); A.render(); };
    if ($('#pe-pub')) $('#pe-pub').onclick = () => setStatus('live', t(`${p.name} is now on the shop`, `${p.name} এখন সাইটে লাইভ`));
    if ($('#pe-unpub')) $('#pe-unpub').onclick = () => U.confirm(t('Hide from the shop?', 'সাইট থেকে লুকাবেন?'), t('Customers will not see it. Stock stays in the ERP.', 'কাস্টমার আর দেখবে না। স্টক ERP তেই থাকবে।'), t('Hide', 'লুকান'), () => setStatus(ckDone(p) ? 'ready' : 'draft', t('Hidden from the shop', 'সাইট থেকে লুকানো হলো')), true);
    if ($('#pe-arch')) $('#pe-arch').onclick = () => U.confirm(t('Archive this product?', 'প্রোডাক্টটা আর্কাইভ করবেন?'), t('It leaves the shop and lists. Sales history stays. You can bring it back any time.', 'সাইট ও লিস্ট থেকে সরে যাবে। বিক্রির হিসাব থাকবে। যেকোনো সময় ফিরিয়ে আনা যাবে।'), t('Archive', 'আর্কাইভ'), () => setStatus('archived', t('Archived', 'আর্কাইভ হলো')), true);
    $('#pe-save').onclick = () => {
      const np = Math.round(+$('#pe-price').value || 0); const cmp = Math.round(+$('#pe-cmp').value || 0) || null;
      const vps = {}; el.querySelectorAll('[data-vp]').forEach((i) => (vps[i.dataset.vp] = Math.round(+i.value || np)));
      const vChanged = p.variants.filter((v) => vps[v.sku] !== (v.price || p.price) && vps[v.sku] !== np);
      const apply = () => {
        p.name = $('#pe-name').value.trim() || p.name; p.cat = $('#pe-cat').value; p.fabric = $('#pe-fab').value; p.fit = $('#pe-fit').value; p.desc = $('#pe-desc').value;
        p.seo.title = $('#pe-st').value; p.seo.desc = $('#pe-sd').value; p.seo.slug = $('#pe-slug').value; p.seo.score = seoScore(p.seo.title, p.seo.desc, p.seo.slug, p).s;
        p.price = np; p.compareAt = cmp; p.variants.forEach((v) => { v.price = vps[v.sku] !== np ? vps[v.sku] : undefined; });
        A.commit(`Saved product ${p.name}`); A.toast(t('Product saved', 'প্রোডাক্ট সেভ হলো'), 'good'); A.render();
      };
      if (np !== p.price || cmp !== (p.compareAt || null) || vChanged.length) {
        pinConfirm(t('Confirm price change', 'দাম বদল কনফার্ম করুন'), `<div class="list"><div class="li"><span class="grow">${t('Selling price', 'বিক্রির দাম')}</span>${A.fmt.tk(p.price)} → <b>${A.fmt.tk(np)}</b></div><div class="li"><span class="grow">${t('Margin', 'মার্জিন')}</span>${A.fmt.pct(pm(p), 0)} → ${marginBadge(marginOf(np, p.cost))}</div>${cmp !== (p.compareAt || null) ? `<div class="li"><span class="grow">${t('Compare-at', 'আগের দাম')}</span>${p.compareAt ? A.fmt.tk(p.compareAt) : '—'} → <b>${cmp ? A.fmt.tk(cmp) : '—'}</b></div>` : ''}${vChanged.length ? `<div class="li"><span class="grow">${t('Sizes with their own price', 'আলাদা দামের সাইজ')}</span><b>${vChanged.length}</b></div>` : ''}</div>`, t('Save new price', 'নতুন দাম সেভ করুন'), apply);
      } else apply();
    };
  }
  function photoTiles(p) {
    const out = []; let n = p.photos;
    for (const c of p.colors) { const has = n > 0; n--; out.push(`<div class="prd-ph ${has ? 'has' : 'miss'}">${has ? A.garmentSvg((A.byId(A.CATS, p.cat) || A.CATS[0]).shape, A.COLORS[c] || '#999', 46) : A.icon('plus')}<span>${A.esc(c)} · ${t('front', 'সামনে')}</span>${has ? '' : `<b>${t('Required', 'লাগবেই')}</b>`}</div>`); }
    for (let i = 0; i < Math.max(0, n); i++) out.push(`<div class="prd-ph has">${A.garmentSvg((A.byId(A.CATS, p.cat) || A.CATS[0]).shape, A.COLORS[p.colors[i % p.colors.length]] || '#999', 40)}<span>${[t('Back', 'পেছনে'), t('Detail', 'কাছ থেকে'), t('On model', 'মডেলে')][i % 3]}</span></div>`);
    return out.join('');
  }

  /* ================= ADD PRODUCT ================= */
  const add = { step: 1, d: null };
  const CODE2CAT = { PL: 'polo', TS: 'tshirt', SH: 'shirt', PJ: 'panjabi', TR: 'trouser', DN: 'denim', JG: 'jogger', HD: 'hoodie', JK: 'jacket', KT: 'katua', EX: 'extras' };
  const sizesFor = (cat) => { const c = A.byId(A.CATS, cat); return c.shape === 'bottom' ? ['30', '32', '34', '36', '38'] : c.shape === 'cap' ? ['Free'] : ['S', 'M', 'L', 'XL', 'XXL']; };
  function erpPreview(it) {
    const cat = CODE2CAT[it.styleCode.split('-')[1]] || 'polo'; const keys = Object.keys(A.COLORS);
    const h = A.sum(it.styleCode.split(''), (ch) => ch.charCodeAt(0)); const colors = []; for (let i = 0; i < it.colors; i++) colors.push(keys[(h + i * 5) % keys.length]);
    const sizes = sizesFor(cat); const w = sizes.map((s) => (['M', 'L', '32', '34'].includes(s) ? 3 : 2)); const tw = A.sum(w) * colors.length;
    const variants = []; for (const c of colors) sizes.forEach((s, i) => variants.push({ sku: `${it.styleCode}-${c.slice(0, 3).toUpperCase()}-${s}`, color: c, size: s, stock: Math.floor(it.stock * w[i] / tw), reserved: 0 }));
    return { cat, colors, sizes, variants };
  }

  /* ================= ADD PRODUCT — 8-step wizard (matches flow/add-product.html) ================= */
  A.css('products2', `
  .wz-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:10px}
  .wz-prog{flex:1;min-width:220px}
  .wz-prog .small{margin-bottom:4px}
  .wz-steps{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
  .wz-steps button{display:inline-flex;gap:6px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 11px 5px 5px;font:inherit;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer}
  .wz-steps button b{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--card2);color:var(--muted);font-size:11.5px;font-variant-numeric:tabular-nums}
  .wz-steps button.done b{background:var(--good);color:var(--card)}
  .wz-steps button.warn b{background:var(--warn);color:var(--card)}
  .wz-steps button.on{border-color:var(--ink);background:var(--ink);color:var(--card)}
  .wz-steps button.on b{background:var(--accent);color:var(--card)}
  .wz-grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px;align-items:start}
  .wz-side{position:sticky;top:12px}
  .wz-grid>div{min-width:0}
  @media (max-width:1100px){.wz-grid{grid-template-columns:minmax(0,1fr)}.wz-side{position:static}}
  .wz-why{font-size:13px;color:var(--muted);margin:-4px 0 12px}
  .wz-tag{display:inline-block;font-size:10.5px;font-weight:700;border-radius:5px;padding:1px 6px;margin-left:6px;vertical-align:1px}
  .wz-tag.e{background:var(--info-soft);color:var(--info)} .wz-tag.a{background:var(--warn-soft);color:var(--warn)} .wz-tag.y{background:var(--good-soft);color:var(--good)}
  .wz-ro{background:var(--info-soft)!important;border-color:transparent!important;color:var(--ink)}
  .wz-pick{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;cursor:pointer;background:var(--card)}
  .wz-pick.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
  .wz-pick input{accent-color:var(--accent)}
  .wz-box{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--card2)}
  .wz-grid5{overflow-x:auto}
  .wz-grid5 table{border-collapse:collapse;width:100%;min-width:300px;font-size:13px;font-variant-numeric:tabular-nums}
  .wz-grid5 th,.wz-grid5 td{padding:6px;text-align:center;border-bottom:1px solid var(--line)}
  .wz-grid5 th:first-child,.wz-grid5 td:first-child{text-align:left;white-space:nowrap}
  .wz-grid5 td.z{color:var(--bad);font-weight:700}
  .wz-grid5 input.inp{width:62px;padding:5px;text-align:center}
  .wz-grid5 input.inp.w{width:84px}
  .wz-slots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  @media (max-width:520px){.wz-slots{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .wz-slot{aspect-ratio:3/4;border:1.5px dashed var(--line2);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11.5px;color:var(--muted);text-align:center;cursor:pointer;background:var(--card);padding:4px;font:inherit}
  .wz-slot.has{border-style:solid;border-color:var(--good);color:var(--ink2)}
  .wz-slot.req{border-color:var(--bad);color:var(--bad)}
  .wz-ck{display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--line);font-size:13.5px}
  .wz-ck:last-child{border:0}
  .wz-ck .i{font-weight:700;width:18px;flex:none;text-align:center}
  .wz-ck.ok .i{color:var(--good)} .wz-ck.no .i{color:var(--warn)} .wz-ck.stop .i{color:var(--bad)}
  .wz-nav{display:flex;justify-content:space-between;gap:8px;margin-top:16px;flex-wrap:wrap}
  .pw-phone{width:100%;max-width:300px;margin:0 auto;border:8px solid var(--ink);border-radius:30px;overflow:hidden;background:var(--card);box-shadow:var(--shadow)}
  .pw-bar{display:flex;justify-content:space-between;font-size:10.5px;color:var(--muted);padding:6px 12px;background:var(--card2)}
  .pw-img{height:230px;display:grid;place-items:center;position:relative}
  .pw-img .no{position:absolute;bottom:8px;left:8px;font-size:11px;background:var(--card);border-radius:6px;padding:2px 6px;color:var(--bad)}
  .pw-dots{display:flex;gap:4px;justify-content:center;padding:6px 0}
  .pw-dots i{width:6px;height:6px;border-radius:50%;background:var(--line2)} .pw-dots i.on{background:var(--ink)}
  .pw-b{padding:4px 12px 14px;font-size:12.5px}
  .pw-brand{font-size:10.5px;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}
  .pw-name{font-weight:700;font-size:15px;line-height:1.3;margin:2px 0 4px}
  .pw-price{font-weight:700;font-size:16px;font-variant-numeric:tabular-nums}
  .pw-price s{color:var(--muted);font-weight:400;font-size:12.5px;margin-left:4px}
  .pw-price em{font-style:normal;color:var(--bad);font-size:12px;margin-left:4px}
  .pw-sw{display:flex;gap:6px;margin:6px 0 8px;flex-wrap:wrap}
  .pw-sw button{width:24px;height:24px;border-radius:50%;border:2px solid var(--card);box-shadow:0 0 0 1px var(--line2);cursor:pointer;padding:0}
  .pw-sw button.on{box-shadow:0 0 0 2px var(--ink)}
  .pw-sz{display:flex;gap:5px;flex-wrap:wrap;margin:4px 0 8px}
  .pw-sz span{min-width:32px;text-align:center;border:1px solid var(--line2);border-radius:7px;padding:4px 5px;font-size:11.5px;font-weight:600}
  .pw-sz span.out{color:var(--muted);text-decoration:line-through;background:var(--card2)}
  .pw-cta{display:block;width:100%;margin-top:10px;background:var(--ink);color:var(--card);border:0;border-radius:10px;padding:9px;font:inherit;font-weight:700}
  .pw-li{margin:6px 0 0;padding-left:16px;color:var(--ink2)}
  .pw-note{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.45}
  .pw-link{color:var(--info);font-size:11.5px;text-decoration:underline}
  .cb-items{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
  .cb-items .x{color:var(--muted);font-weight:700}
  .st-card .pc{display:flex;gap:10px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:10px;min-width:0}
  .st-card .pc b{display:block}
  .st-pieces{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}
  @media (max-width:560px){.st-pieces{grid-template-columns:1fr}.st-pieces .plus{text-align:center}}
  .sc-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
  .sc-card{border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--card);display:flex;flex-direction:column;gap:8px}
  .sc-card .dg{display:flex;gap:10px;align-items:center}
  .sc-card .dg svg{flex:none;color:var(--muted)}
  .sc-card .acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}
  .sc-grp{margin:18px 0 8px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
  .sc-grp h3{margin:0;font-size:15px}
  .sc-dirty{position:sticky;top:0;z-index:5;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 12px;border-radius:12px;background:var(--warn-soft);color:var(--warn);font-weight:600;margin-bottom:12px}
  .rv-hidden{opacity:.7}
  .faq-li{padding:10px 0;border-bottom:1px solid var(--line)}
  .faq-li:last-child{border:0}
  .faq-li .q{font-weight:600}
  .rk-how{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .rk-how>div{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--card2);font-size:13.5px}
  .rk-how b.n{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--accent);color:var(--card);margin-right:6px;font-size:12px}
  @media (max-width:900px){.rk-how{grid-template-columns:1fr}}
  `);

  const STEPS = [['Pick from ERP', 'ERP থেকে বাছুন'], ['Name & category', 'নাম ও ক্যাটাগরি'], ['Colours & sizes', 'কালার ও সাইজ'], ['Photos & video', 'ছবি ও ভিডিও'], ['Price', 'দাম'], ['Description & size chart', 'বিবরণ ও সাইজ চার্ট'], ['Google & link', 'Google ও লিংক'], ['Check & publish', 'চেক ও পাবলিশ']];
  const WHY = [
    ['All stock comes from the ERP, so you start here. Styles that are in the ERP but not on the shop are listed first.', 'সব স্টক ERP থেকে আসে, তাই শুরু এখান থেকে। ERP-তে আছে কিন্তু দোকানে নেই, এমন স্টাইলগুলো উপরে।'],
    ['Customers and Google see the name first. The category decides which details you fill in.', 'কাস্টমার আর Google প্রথমে নামই দেখে। ক্যাটাগরি অনুযায়ী কোন তথ্য দেবেন তা বদলায়।'],
    ['Pick which ERP colours and sizes show on the shop. Stock is read only and updates by itself.', 'ERP-র কোন কালার ও সাইজ দোকানে দেখাবে বেছে নিন। স্টক শুধু দেখা যায়, নিজে আপডেট হয়।'],
    ['Each colour has its own photos. Add many at once; every photo is made light and checked for you. Video is optional.', 'প্রতিটা কালারের নিজের ছবি। একসাথে অনেক ছবি দিন; প্রতিটা ছবি নিজে হালকা হয় ও চেক হয়। ভিডিও চাইলে দিতে পারেন।'],
    ['Buying price comes from the ERP; the selling price is yours. Profit shows at once so nothing goes live at a wrong price.', 'কেনা দাম ERP থেকে, বিক্রির দাম আপনার। লাভ সাথে সাথে দেখায়, যাতে ভুল দামে পাবলিশ না হয়।'],
    ['Good text and the right size chart mean fewer questions and fewer exchanges.', 'ভালো লেখা আর ঠিক সাইজ চার্ট থাকলে প্রশ্ন কমে, এক্সচেঞ্জও কমে।'],
    ['The right name, link and text help you come up in Google. See exactly how it will look.', 'ঠিক নাম, লিংক আর লেখা থাকলে Google-এ উপরে আসে। কেমন দেখাবে এখানেই দেখুন।'],
    ['See what is done and what is left. Even with gaps the draft stays saved.', 'কী শেষ আর কী বাকি একবারে দেখুন। বাকি থাকলেও খসড়া সেভ থাকে।'],
  ];
  const DET = {
    polo: [['fabric', 'Fabric', 'ফেব্রিক', '100% cotton piqué'], ['gsm', 'GSM', 'GSM', '220'], ['collar', 'Collar', 'কলার', 'Rib knit'], ['sleeve', 'Sleeve', 'হাতা', 'Half sleeve']],
    tshirt: [['fabric', 'Fabric', 'ফেব্রিক', 'Cotton jersey'], ['gsm', 'GSM', 'GSM', '180'], ['neck', 'Neck', 'গলা', 'Crew neck'], ['sleeve', 'Sleeve', 'হাতা', 'Half sleeve']],
    shirt: [['fabric', 'Fabric', 'ফেব্রিক', 'Cotton oxford'], ['collar', 'Collar', 'কলার', 'Button-down'], ['sleeve', 'Sleeve', 'হাতা', 'Full sleeve'], ['pocket', 'Pocket', 'পকেট', 'One chest pocket']],
    panjabi: [['fabric', 'Fabric', 'ফেব্রিক', 'Cotton'], ['work', 'Embroidery or work', 'এমব্রয়ডারি বা কাজ', 'Neck embroidery'], ['length', 'Length', 'লম্বা', 'Long'], ['button', 'Buttons', 'বোতাম', 'Metal']],
    trouser: [['fabric', 'Fabric', 'ফেব্রিক', 'Cotton twill'], ['rise', 'Rise', 'রাইজ', 'Mid rise'], ['stretch', 'Stretch', 'স্ট্রেচ', 'Light stretch'], ['closure', 'Closure', 'বন্ধ করার ধরন', 'Zip and button']],
    denim: [['fabric', 'Fabric', 'ফেব্রিক', '12 oz denim'], ['rise', 'Rise', 'রাইজ', 'Mid rise'], ['stretch', 'Stretch', 'স্ট্রেচ', '2% elastane'], ['wash', 'Wash', 'ওয়াশ', 'Dark blue']],
    jogger: [['fabric', 'Fabric', 'ফেব্রিক', 'French terry'], ['gsm', 'GSM', 'GSM', '280'], ['waist', 'Waistband', 'কোমর', 'Elastic with cord'], ['pockets', 'Pockets', 'পকেট', '2 side, 1 back zip']],
    hoodie: [['fabric', 'Fabric', 'ফেব্রিক', 'Cotton fleece'], ['gsm', 'GSM', 'GSM', '320'], ['hood', 'Hood', 'হুড', 'Lined hood'], ['zip', 'Zip', 'জিপ', 'No zip']],
    jacket: [['shell', 'Outer fabric', 'বাইরের কাপড়', 'Nylon'], ['lining', 'Lining', 'লাইনিং', 'Polyester'], ['closure', 'Closure', 'বন্ধ করার ধরন', 'Front zip'], ['warmth', 'Warmth', 'কতটা গরম', 'Medium']],
    katua: [['fabric', 'Fabric', 'ফেব্রিক', 'Khadi cotton'], ['sleeve', 'Sleeve', 'হাতা', 'Half sleeve'], ['neck', 'Neck', 'গলা', 'Band collar']],
    extras: [['material', 'Material', 'ম্যাটেরিয়াল', 'Cotton'], ['size', 'Size', 'সাইজ', 'Free size']],
  };
  const SUBS = { polo: ['Solid polo', 'Striped polo', 'Long sleeve polo'], tshirt: ['Crew neck tee', 'Oversized tee', 'Graphic tee'], shirt: ['Casual shirt', 'Formal shirt', 'Linen shirt'], panjabi: ['Cotton panjabi', 'Embroidered panjabi', 'Festive panjabi'], trouser: ['Chino', 'Formal trousers', 'Cargo'], denim: ['Slim jeans', 'Straight jeans', 'Tapered jeans'], jogger: ['Terry jogger', 'Fleece jogger', 'Cargo jogger'], hoodie: ['Pullover hoodie', 'Zip hoodie', 'Sweatshirt'], jacket: ['Bomber', 'Denim jacket', 'Puffer'], katua: ['Plain katua', 'Printed katua'], extras: ['Cap', 'Socks', 'Boxer', 'Belt'] };
  const BRANDS = ['EXTAS', 'Ralph Lauren', 'Tommy Hilfiger', 'Calvin Klein', 'Zara', 'H&M', "Levi's", 'Uniqlo'];
  const TAGS = ['New in', 'Winter 2026', 'Best seller', 'Office wear', 'Eid collection'];
  const TOP_SZ = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];
  const BOT_SZ = ['28', '30', '32', '34', '36', '38', '40'];
  const PT = { Chest: 'বুক', Length: 'লম্বা', Shoulder: 'কাঁধ', Sleeve: 'হাতা', Collar: 'কলার', Waist: 'কোমর', Hip: 'হিপ', Inseam: 'ইনসিম', Thigh: 'থাই', 'Leg opening': 'পায়ের মুখ' };
  const ptName = (p) => t(p, PT[p] || p);
  const shapeOf = (cat) => (A.byId(A.CATS, cat) || A.CATS[0]).shape;
  const isBottom = (cat) => shapeOf(cat) === 'bottom';
  const pointsFor = (cat) => (isBottom(cat) ? ['Waist', 'Hip', 'Inseam', 'Thigh', 'Leg opening'] : cat === 'shirt' ? ['Chest', 'Length', 'Shoulder', 'Sleeve', 'Collar'] : cat === 'extras' ? [] : ['Chest', 'Length', 'Shoulder', 'Sleeve']);
  const allSizesFor = (cat) => (isBottom(cat) ? BOT_SZ : TOP_SZ);
  function genRows(cat, sizes) {
    const base = { Chest: [40, 2], Length: [shapeOf(cat) === 'long' ? 42 : 28, 1], Shoulder: [17, 0.5], Sleeve: [cat === 'shirt' || cat === 'hoodie' || cat === 'jacket' || cat === 'panjabi' ? 24.5 : 8, 0.5], Collar: [15.5, 0.5], Hip: [40, 2], Inseam: [30, 0.5], Thigh: [23, 1], 'Leg opening': [7, 0.25] };
    return pointsFor(cat).map((pt) => ({ point: pt, vals: sizes.map((s) => { if (pt === 'Waist') return +s || 32; const ix = isBottom(cat) ? (BOT_SZ.indexOf(s) - 2) : (TOP_SZ.indexOf(s) - 2); const b = base[pt]; return Math.round((b[0] + b[1] * (ix < -2 ? 0 : ix)) * 4) / 4; }) }));
  }
  const FIND_TOP = { XS: ["5'0\"", "5'3\"", 45, 52], S: ["5'2\"", "5'5\"", 50, 58], M: ["5'5\"", "5'8\"", 58, 66], L: ["5'7\"", "5'10\"", 66, 75], XL: ["5'9\"", "6'0\"", 75, 85], XXL: ["5'10\"", "6'2\"", 85, 95], '3XL': ["5'11\"", "6'3\"", 95, 105], '4XL': ["6'0\"", "6'4\"", 105, 118] };
  const FIND_BOT = { 28: ["5'2\"", "5'5\"", 48, 55], 30: ["5'4\"", "5'7\"", 55, 63], 32: ["5'6\"", "5'9\"", 63, 71], 34: ["5'7\"", "5'11\"", 71, 80], 36: ["5'8\"", "6'0\"", 80, 90], 38: ["5'9\"", "6'1\"", 90, 100], 40: ["5'10\"", "6'2\"", 100, 112] };
  const defFinder = (sizes) => sizes.map((s) => { const f = FIND_TOP[s] || FIND_BOT[s] || ["5'6\"", "5'9\"", 60, 70]; return { size: s, h1: f[0], h2: f[1], w1: f[2], w2: f[3] }; });
  const stBadge = (p) => (p.status === 'scheduled' ? U.badge(t('Scheduled', 'শিডিউল করা'), 'accent') : U.statusBadge(p.status));
  const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const cmS = (v) => Math.round(v * 2.54);

  function ensure2() {
    const D = A.D; ensure();
    D.combos.forEach((cb) => { if (!cb.type) { cb.type = 'prod-prod'; cb.cols = cb.pids.map(() => null); cb.priceMode = 'fixed'; cb.pct = 10; cb.from = ''; cb.to = ''; cb.status = cb.on === false ? 'off' : 'on'; } });
    if (!D.combos.some((c) => c.type === 'style-colours')) {
      const live = D.products.filter((p) => p.status === 'live' && p.colors.length >= 2);
      const pc = live.find((p) => p.cat === 'polo') || live[0];
      const out = live.find((p) => p.colors.some((c) => !p.variants.filter((v) => v.color === c).some((v) => v.stock > 0)));
      const mk = (id, name, p, cols, sold) => ({ id, name, type: 'style-colours', pids: cols.map(() => p.id), cols, priceMode: 'rule', pct: 12, price: Math.round(p.price * cols.length * 0.88 / 10) * 10, sold30: sold, from: '', to: '', status: 'on' });
      if (pc) D.combos.push(mk('CB6', `${pc.name} · 2 colours`, pc, pc.colors.slice(0, 2), 21));
      if (out && out !== pc) { const sc = out.colors.find((c) => !out.variants.filter((v) => v.color === c).some((v) => v.stock > 0)); const other = out.colors.find((c) => c !== sc); D.combos.push(mk('CB7', `${out.name} · ${sc} + ${other}`, out, [sc, other], 6)); }
      D.combos.push({ id: 'CB8', name: 'Any polo + any trousers', type: 'cat-cat', pids: [], cats: ['polo', 'trouser'], cols: [], priceMode: 'rule', pct: 10, price: 0, sold30: 15, from: A.fmt.ymd(A.TODAY - 10 * DAY), to: A.fmt.ymd(A.TODAY + 20 * DAY), status: 'on' });
    }
    if (!D.sets) {
      const live = D.products.filter((p) => p.status === 'live'); const best = (cat, n = 0) => live.filter((p) => p.cat === cat).sort((a, b) => b.sold30 - a.sold30)[n];
      const mk = (id, name, top, bot, link, sold) => (top && bot ? { id, name, topPid: top.id, botPid: bot.id, link, price: Math.round((top.price + bot.price) * 0.9 / 10) * 10, sold30: sold, status: 'on' } : null);
      D.sets = [mk('ST1', 'Fleece tracksuit', best('hoodie'), best('jogger'), 'same', 9), mk('ST2', 'Office set: shirt + trousers', best('shirt'), best('trouser'), 'any', 5), mk('ST3', 'Summer polo + chino set', best('polo', 1), best('trouser', 1), 'any', 3)].filter(Boolean);
    }
    if (!D.faqs) {
      const P = D.products;
      D.faqs = [
        { id: 'F1', scope: 'category', cat: 'polo', q: 'Does the colour fade after washing?', a: 'No. Wash in cold water and dry in shade; the colour stays.', on: true },
        { id: 'F2', scope: 'category', cat: 'panjabi', q: 'Can I get it before Eid?', a: 'Inside Dhaka 24–48 hours, outside Dhaka 2–4 days.', on: true },
        { id: 'F3', scope: 'product', pid: P[0].id, q: 'Is it 100% cotton?', a: 'Yes, 100% cotton piqué, 220 GSM.', on: true },
        { id: 'F4', scope: 'category', cat: 'trouser', q: 'Is there stretch?', a: 'Yes, light stretch for easy movement.', on: true },
      ];
    }
    D.sizeCharts.forEach((ch) => { if (!ch.cat) { ch.cat = ch.cats[0]; ch.finder = defFinder(ch.sizes); ch.fit = 'Regular'; ch.run = 'true'; ch.updated = A.TODAY.toISOString(); } });
    return D.pset;
  }

  /* ---------- wizard state (autosaved in A.D.pdraft) ---------- */
  const wzu = { pv: null, pcol: null, q: '', unit: 'in' };
  function newDraft() { return { step: 1, kind: 'single', code: '', manual: false, botPid: '', link: 'same', erpName: '', cat: 'polo', colors: [], sizes: [], variants: [], cost: 0, show: {}, hideSz: [], cname: {}, bgrade: false, name: '', brand: 'EXTAS', forWho: 'Men', sub: '', det: {}, tags: [], photos: {}, video: false, price: '', compareAt: '', priceOk: false, inCombos: true, points: '', desc: '', chartMode: 'erp', chartId: '', nc: null, ncSave: true, ncName: '', finder: [], fit: 'Regular', run: 'true', model: { h: '', w: '', size: '' }, faqs: [], slug: '', title: '', mdesc: '', kw: '', savedAt: 0, pid: null }; }
  const D0 = () => { if (!A.D.pdraft) A.D.pdraft = newDraft(); return A.D.pdraft; };
  const shownColors = (d) => d.colors.filter((c) => d.show[c] !== false);
  const shownSizes = (d) => d.sizes.filter((s) => !d.hideSz.includes(s));
  const stockC = (d, c) => A.sum(d.variants.filter((v) => v.color === c), (v) => v.stock);
  const stockCS = (d, c, s) => { const v = d.variants.find((x) => x.color === c && x.size === s); return v ? v.stock : 0; };
  const front = (d, c) => !!(d.photos[c] && d.photos[c][0]);
  const photosOf = (d, c) => (d.photos[c] || []).filter(Boolean).length;
  const suggestName = (d) => { const bits = (d.erpName || '').split(' '); return (d.brand && d.brand !== 'EXTAS' && !d.erpName.startsWith(d.brand) ? d.brand + ' ' : '') + (d.erpName || '') + (bits.length < 3 && d.sub ? ' ' + d.sub : ''); };
  const setCost = (d) => { const b = A.byId(A.D.products, d.botPid); return d.cost + (d.kind === 'set' && b ? b.cost : 0); };
  function loadStyle(d, it) {
    const pv = erpPreview(it);
    Object.assign(d, { code: it.styleCode, manual: false, erpName: it.name, cat: pv.cat, colors: pv.colors, sizes: pv.sizes, variants: pv.variants, cost: it.cost, show: {}, hideSz: [], cname: {}, name: '', sub: SUBS[pv.cat][0], det: Object.fromEntries((DET[pv.cat] || []).map((x) => [x[0], x[3]])), photos: {}, price: it.price, compareAt: Math.round(it.price * 1.25 / 10) * 10, priceOk: false, slug: '', title: '', mdesc: '', kw: '', nc: null, chartMode: 'erp', finder: defFinder(pv.sizes) });
    pv.colors.forEach((c) => { d.cname[c] = c; d.photos[c] = [false, false, false, false]; });
    d.photos[pv.colors[0]] = [true, false, false, false]; // ERP had one photo
    d.name = suggestName(d); wzu.pv = pv.colors[0]; wzu.pcol = pv.colors[0];
  }
  function loadProduct(p) {
    const d = newDraft();
    Object.assign(d, { pid: p.id, code: p.styleCode, manual: p.source !== 'ERP', erpName: p.name, cat: p.cat, colors: p.colors.slice(), sizes: p.sizes.slice(), variants: p.variants, cost: p.cost, name: p.name, brand: p.brand || 'EXTAS', sub: p.sub || SUBS[p.cat][0], det: p.det || Object.fromEntries((DET[p.cat] || []).map((x) => [x[0], x[0] === 'fabric' ? p.fabric : x[3]])), tags: (p.collections || []).slice(), price: p.price, compareAt: p.compareAt || '', priceOk: true, desc: p.desc, points: p.points || '', fit: p.fit || 'Regular', slug: p.seo.slug, title: p.seo.title, mdesc: p.seo.desc, kw: p.seo.kw || '', finder: p.finder || defFinder(p.sizes), chartMode: p.sizeChartId ? 'saved' : 'erp', chartId: p.sizeChartId || '', step: 2, kind: p.kind || 'single', botPid: p.botPid || '' });
    let n = p.photos; p.colors.forEach((c) => { d.cname[c] = c; d.photos[c] = [false, false, false, false]; if (n > 0) { d.photos[c][0] = true; n--; } });
    p.colors.forEach((c) => { for (let i = 1; i < 4 && n > 0; i++) { d.photos[c][i] = true; n--; } });
    A.D.pdraft = d; wzu.pv = p.colors[0]; wzu.pcol = p.colors[0];
  }
  function chartOf(d) {
    if (d.chartMode === 'new' && d.nc) return d.nc;
    if (d.chartMode === 'saved') { const c = A.byId(A.D.sizeCharts, d.chartId); if (c) return c; }
    return { name: t('From ERP (tech pack)', 'ERP থেকে (টেক প্যাক)'), sizes: d.sizes, rows: genRows(d.cat, d.sizes) };
  }
  function wzSeo(d) {
    const tips = []; let s = 100; const ti = d.title || '', de = d.mdesc || '', kw = (d.kw || '').toLowerCase();
    const add = (ok, pts, en, bn) => { if (!ok) { s -= pts; tips.push({ ok, l: t(en, bn) }); } else tips.push({ ok, l: t(en, bn) }); };
    add(ti.length >= 30 && ti.length <= 60, 15, 'Title is 30–60 letters', 'শিরোনাম 30–60 অক্ষর');
    add(de.length >= 120 && de.length <= 160, 15, 'Description is 120–160 letters', 'বিবরণ 120–160 অক্ষর');
    add(!!kw && ti.toLowerCase().includes(kw.split(' ')[0]), 15, 'Search word is in the title', 'সার্চ শব্দ শিরোনামে আছে');
    add((d.desc || '').length >= 80, 10, 'Description on the page is your own text', 'পেজের বিবরণ নিজের লেখা');
    const miss = shownColors(d).filter((c) => !front(d, c)).length;
    add(!miss, 10, 'Every photo has alt text', 'প্রতিটা ছবির লেখা (alt) আছে');
    add((d.slug || '').length > 0 && d.slug.length <= 50, 5, 'Short, clean link', 'ছোট, পরিষ্কার লিংক');
    add(/bangladesh|bd|dhaka|cash on delivery/i.test(de), 10, 'Mentions Bangladesh or cash on delivery', 'Bangladesh বা ক্যাশ অন ডেলিভারি লেখা আছে');
    return { s: Math.max(10, s), tips };
  }
  function stepState(d) {
    const sc = shownColors(d); const pr = +d.price || 0;
    const noPh = sc.filter((c) => !front(d, c));
    const st = [
      { ok: !!d.code && (d.kind !== 'set' || !!d.botPid), miss: d.kind === 'set' && !d.botPid ? t('Bottom piece', 'নিচের পিস') : t('ERP style', 'ERP স্টাইল') },
      { ok: (d.name || '').length >= 3 && !!d.cat, miss: t('Name', 'নাম') },
      { ok: sc.length > 0, miss: t('Colours', 'কালার') },
      { ok: sc.length > 0 && !noPh.length, miss: t(`Photos (${noPh.join(', ')})`, `ছবি (${noPh.join(', ')})`) },
      { ok: pr > setCost(d) && d.priceOk, miss: pr > setCost(d) ? t('Price PIN', 'দামের PIN') : t('Price', 'দাম') },
      { ok: (d.desc || '').length >= 40, miss: t('Description', 'বিবরণ') },
      { ok: !!(d.title && d.mdesc && d.slug), miss: t('Google text', 'Google-এর লেখা') },
    ];
    st.push({ ok: st.every((x) => x.ok), miss: '' });
    return st;
  }
  const mainSrc = (d, c) => { const x = d.pm && d.pm.code === d.code ? d.pm.list.find((y) => y.color === c) : null; return x ? x.src : ''; };
  function phonePreview(d) {
    const sc = shownColors(d); const c = sc.includes(wzu.pv) ? wzu.pv : sc[0] || d.colors[0] || 'Navy'; const hex = A.COLORS[c] || '#888';
    const pr = +d.price || 0, cmp = +d.compareAt || 0; const ph = photosOf(d, c); const ss = shownSizes(d);
    const pts = (d.points || '').split(/[·\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
    const bot = d.kind === 'set' ? A.byId(A.D.products, d.botPid) : null;
    return `<div class="pw-phone"><div class="pw-bar"><span>9:41</span><span>extas.com.bd</span><span>●●●</span></div>
      <div class="pw-img" style="background:color-mix(in srgb, ${hex} 16%, var(--card2))">${mainSrc(d, c) ? `<img src="${mainSrc(d, c)}" alt="" style="width:100%;height:100%;object-fit:cover">` : A.garmentSvg(shapeOf(d.cat), hex, 150)}${ph ? '' : `<span class="no">${t('No photo yet', 'এখনো ছবি নেই')}</span>`}</div>
      <div class="pw-dots">${[0, 1, 2, 3].map((i) => `<i class="${i < Math.max(1, ph) ? 'on' : ''}"></i>`).join('')}</div>
      <div class="pw-b"><div class="pw-brand">${A.esc(d.brand || 'EXTAS')}</div><div class="pw-name">${A.esc(d.name || t('Product name', 'প্রোডাক্টের নাম'))}</div>
      <div class="pw-price">${pr ? A.fmt.tk(pr) : '৳—'}${cmp > pr && pr ? `<s>${A.fmt.tk(cmp)}</s><em>-${Math.round((cmp - pr) / cmp * 100)}%</em>` : ''}</div>
      <div class="small" style="margin-top:6px">${t('Colour', 'কালার')}: <b>${A.esc(d.cname[c] || c)}</b></div>
      <div class="pw-sw">${sc.map((x) => `<button data-pvc="${A.esc(x)}" class="${x === c ? 'on' : ''}" style="background:${A.COLORS[x] || '#888'}" aria-label="${A.esc(x)}"></button>`).join('')}</div>
      <div class="small">${bot ? t('Top size', 'উপরের সাইজ') : t('Size', 'সাইজ')} · <span class="pw-link">${t('Size chart', 'সাইজ চার্ট')}</span> · <span class="pw-link">${t('Find my size', 'আমার সাইজ')}</span></div>
      <div class="pw-sz">${ss.map((s) => `<span class="${stockCS(d, c, s) ? '' : 'out'}">${s}</span>`).join('') || '—'}</div>
      ${bot ? `<div class="small">${t('Bottom size', 'নিচের সাইজ')}</div><div class="pw-sz">${bot.sizes.map((s) => `<span>${s}</span>`).join('')}</div>` : ''}
      ${pts.length ? `<ul class="pw-li">${pts.map((x) => `<li>${A.esc(x)}</li>`).join('')}</ul>` : ''}
      ${d.model.h ? `<div class="pw-note">${t(`Model is ${A.esc(d.model.h)}, ${A.esc(d.model.w)} kg, wearing ${A.esc(d.model.size)}`, `মডেল ${A.esc(d.model.h)}, ${A.esc(d.model.w)} কেজি, পরেছেন ${A.esc(d.model.size)}`)}</div>` : ''}
      <button class="pw-cta" type="button">${t('Add to cart', 'কার্টে দিন')}</button>
      <div class="pw-note">${t(`Delivery: Dhaka 24–48 hours (${A.fmt.tk(dFee())}), outside Dhaka 2–4 days · 72-hour exchange · check at the door`, `ডেলিভারি: ঢাকায় 24–48 ঘণ্টা (${A.fmt.tk(dFee())}), ঢাকার বাইরে 2–4 দিন · 72 ঘণ্টায় এক্সচেঞ্জ · দরজায় দেখে নিন`)}</div></div></div>`;
  }
  const dFee = () => { try { const f = C.deliveryFee('inside', 0); return isFinite(f) ? f : 70; } catch (e) { return 70; } };
  const tag = (k) => (k === 'e' ? '<span class="wz-tag e">ERP</span>' : k === 'a' ? `<span class="wz-tag a">${t('Auto', 'অটো')}</span>` : `<span class="wz-tag y">${t('You', 'আপনি')}</span>`);
  const fld = (label, k, html, hint) => U.field(label + tag(k), html, hint || '');
  const roBox = (v) => `<div class="inp wz-ro">${v}</div>`;

  function stepBody(d, s) {
    const ni = A.D.erp.notImported; const sc = shownColors(d);
    if (s === 1) {
      const q = wzu.q.toLowerCase(); const list = ni.filter((x) => !q || x.styleCode.toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
      const bots = A.D.products.filter((p) => p.status === 'live' && isBottom(p.cat));
      return `${U.field(t('What are you adding?', 'কী যোগ করছেন?'), U.seg('wz-kind', [['single', t('Single product', 'একক প্রোডাক্ট')], ['set', t('Set (top + bottom)', 'সেট (উপর + নিচ)')]], d.kind))}
        ${fld(t('Search style code or name', 'স্টাইল কোড বা নাম খুঁজুন'), 'y', `<input class="inp" id="wz-q" value="${A.esc(wzu.q)}" placeholder="EXT-PL-1031">`)}
        <div class="small muted" style="margin:8px 0">${t(`In the ERP, not on the shop (${ni.length})`, `ERP-তে আছে, দোকানে নেই (${ni.length})`)}</div>
        ${list.map((x) => { const pv = erpPreview(x); return `<label class="wz-pick ${d.code === x.styleCode ? 'on' : ''}"><input type="radio" name="wz-style" data-style="${x.styleCode}" ${d.code === x.styleCode ? 'checked' : ''}>${U.thumb({ colors: pv.colors, cat: pv.cat }, 40)}<div style="min-width:0;flex:1"><b class="ellip" style="display:block">${A.esc(x.name)}</b><span class="small muted"><span class="mono">${x.styleCode}</span> · ${t(`${x.colors} colours · ${x.stock} pcs`, `${x.colors} কালার · ${x.stock} পিস`)}</span></div>${U.sw2(pv.colors)}</label>`; }).join('') || U.empty(t('No ERP style matches. Try another code.', 'কোনো ERP স্টাইল মেলেনি। অন্য কোড দিন।'))}
        ${d.kind === 'set' ? fld(t('Bottom piece (from the ERP)', 'নিচের পিস (ERP থেকে)'), 'y', U.select('wz-bot', [['', t('— pick trousers, jeans or joggers —', '— ট্রাউজার, জিন্স বা জগার বাছুন —')]].concat(bots.map((p) => [p.id, `${p.name} · ${p.styleCode}`])), d.botPid), t('A set is one listing: the top and the bottom each keep their own sizes and stock.', 'সেট একটাই লিস্টিং: উপর আর নিচের পিসের সাইজ ও স্টক আলাদা থাকে।')) : ''}
        ${d.code ? `<div class="wz-box" style="margin-top:12px"><div class="small strong" style="margin-bottom:6px">${t('Brought in from the ERP', 'ERP থেকে আসা তথ্য')} ${tag('e')}</div><div class="small">${t(`Style code <b class="mono">${d.code}</b> · ${A.esc(d.erpName)} · ${d.colors.length} colours × ${d.sizes.length} sizes = ${d.variants.length} SKUs · barcodes · stock per SKU · buying price ${A.fmt.tk(d.cost)} · A/B grade · size chart`, `স্টাইল কোড <b class="mono">${d.code}</b> · ${A.esc(d.erpName)} · ${d.colors.length} কালার × ${d.sizes.length} সাইজ = ${d.variants.length}টি SKU · বারকোড · প্রতি SKU-র স্টক · কেনা দাম ${A.fmt.tk(d.cost)} · A/B গ্রেড · সাইজ চার্ট`)}</div></div>` : ''}
        <div class="small" style="margin-top:10px"><button class="btn sm ghost" id="wz-noerp">${t('Without ERP (rare)', 'ERP ছাড়া (খুব কম)')}</button> <span class="muted">${t('Stock shows 0 until the style is in the ERP.', 'ERP-তে স্টাইল না ওঠা পর্যন্ত স্টক 0 দেখাবে।')}</span></div>`;
    }
    if (s === 2) {
      return `<div class="formgrid">${fld(t('ERP name', 'ERP-র নাম'), 'e', roBox(A.esc(d.erpName || '—')))}${fld(t('Name on site', 'সাইটে নাম'), 'a', `<input class="inp" data-f="name" value="${A.esc(d.name)}">`, t('Suggested from brand + type. The ERP name stays inside.', 'ব্র্যান্ড আর ধরন থেকে প্রস্তাব। ERP-র নাম ভেতরে থাকে।'))}
        ${fld(t('Brand', 'ব্র্যান্ড'), 'y', U.select('wz-brand', BRANDS.map((b) => [b, b]), d.brand, 'data-f="brand"'))}${fld(t('For', 'কার জন্য'), 'y', U.select('wz-for', [['Men', t('Men', 'ছেলেদের')], ['Boys', t('Boys', 'বাচ্চা ছেলেদের')], ['Unisex', t('Everyone', 'সবার')]], d.forWho, 'data-f="forWho"'))}
        ${fld(t('Category', 'ক্যাটাগরি'), 'y', U.select('wz-cat', A.CATS.map((c) => [c.id, t(c.en, c.bn)]), d.cat))}${fld(t('Sub-category', 'সাব-ক্যাটাগরি'), 'y', U.select('wz-sub', (SUBS[d.cat] || []).map((x) => [x, x]), d.sub, 'data-f="sub"'))}</div>
        <div class="wz-box" style="margin-top:12px"><div class="small strong" style="margin-bottom:8px">${t(`${catNm(d.cat)} details`, `${catNm(d.cat)}-র তথ্য`)} ${tag('y')}</div><div class="formgrid">${(DET[d.cat] || []).map((x) => U.field(t(x[1], x[2]), `<input class="inp" data-det="${x[0]}" value="${A.esc(d.det[x[0]] != null ? d.det[x[0]] : x[3])}">`)).join('')}</div><div class="small muted" style="margin-top:6px">${t('Change the category and these questions change too (polo: collar and GSM; denim: rise and stretch).', 'ক্যাটাগরি বদলালে প্রশ্নও বদলায় (পোলোতে কলার ও GSM, ডেনিমে রাইজ ও স্ট্রেচ)।')}</div></div>
        ${fld(t('Collections & tags', 'কালেকশন ও ট্যাগ'), 'y', `<div class="chips">${TAGS.map((x) => `<button class="chip ${d.tags.includes(x) ? 'on' : ''}" data-tagx="${x}">${x}</button>`).join('')}</div>`)}`;
    }
    if (s === 3) {
      const bgr = Math.round(A.sum(d.variants, (v) => v.stock) * 0.06);
      const bot = d.kind === 'set' ? A.byId(A.D.products, d.botPid) : null;
      return `<div class="wz-grid5"><table><thead><tr><th>${t('Colour', 'কালার')}</th>${d.sizes.map((z) => `<th><label class="small" style="display:inline-flex;gap:4px;align-items:center"><input type="checkbox" data-hsz="${z}" ${d.hideSz.includes(z) ? '' : 'checked'}>${z}</label></th>`).join('')}<th>${t('Total', 'মোট')}</th><th>${t('Show', 'দেখাবে')}</th></tr></thead><tbody>${d.colors.map((c) => `<tr><td>${U.sw(c)} ${A.esc(c)}</td>${d.sizes.map((z) => { const n = stockCS(d, c, z); return `<td class="${n ? '' : 'z'}">${n}</td>`; }).join('')}<td><b>${stockC(d, c)}</b></td><td><input type="checkbox" data-showc="${A.esc(c)}" ${d.show[c] !== false ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div>
        <div class="small muted" style="margin:6px 0 12px">${A.icon('sync')} ${t(`Stock ${'<span class="wz-tag e">ERP</span>'} · read only · updates every hour and with every sale. 0 shows “Sold out”; a sold-out colour moves to the back.`, `স্টক <span class="wz-tag e">ERP</span> · শুধু দেখা যায় · প্রতি ঘণ্টায় ও প্রতি বিক্রিতে আপডেট। 0 হলে “Sold out” দেখায়; পুরো কালার শেষ হলে পিছনে যায়।`)}</div>
        ${bot ? `<div class="wz-box" style="margin-bottom:12px"><div class="small strong">${t('Bottom piece', 'নিচের পিস')}: ${A.esc(bot.name)}</div><div class="small muted">${t(`Sizes ${bot.sizes.join(', ')} · ${stockOf(bot)} pcs in the ERP`, `সাইজ ${bot.sizes.join(', ')} · ERP-তে ${stockOf(bot)} পিস`)}</div>${U.field(t('Colour link', 'কালার মেলানো'), U.seg('wz-link', [['same', t('Same colour top and bottom', 'উপর-নিচ একই কালার')], ['any', t('Customer picks each colour', 'কাস্টমার আলাদা বাছবেন')]], d.link))}</div>` : ''}
        <div class="formgrid">${sc.map((c) => fld(t(`Colour name on site · ${c}`, `সাইটে কালারের নাম · ${c}`), 'a', `<input class="inp" data-cname="${A.esc(c)}" value="${A.esc(d.cname[c] || c)}">`)).join('')}</div>
        <div class="wz-box row between" style="margin-top:12px;gap:10px;flex-wrap:wrap"><div><b>${t('B-grade pieces', 'B-গ্রেড পিস')}</b> ${tag('e')}<div class="small muted">${t(`${bgr} B-grade pieces in the ERP. Show them as a separate “Outlet” listing at a lower price.`, `ERP-তে ${bgr}টি B-গ্রেড পিস। কম দামে আলাদা “Outlet” লিস্টিং হিসেবে দেখান।`)}</div></div>${U.switch('wz-bg', d.bgrade)}</div>`;
    }
    if (s === 4) return photoStep(d, sc);
    if (s === 5) {
      const cmb = A.D.combos.filter((cb) => cb.status !== 'archived' && cb.type === 'cat-cat' && (cb.cats || []).includes(d.cat));
      return `<div class="formgrid">${fld(t('Buying price (owner only)', 'কেনা দাম (শুধু মালিক)'), 'e', roBox(A.fmt.tk(setCost(d))), d.kind === 'set' ? t('Top + bottom buying price from the ERP. Customers never see it.', 'উপর + নিচের কেনা দাম, ERP থেকে। কাস্টমার কখনো দেখেন না।') : t('The shop price the ERP gives. Customers never see it.', 'ERP-র দেওয়া দোকানের দাম। কাস্টমার কখনো দেখেন না।'))}
        ${fld(t('Selling price', 'বিক্রির দাম'), 'y', U.money('wz-price', d.price, 'data-f="price" data-num="1"'))}${fld(t('Compare-at price (crossed out)', 'আগের দাম (কেটে দেখাবে)'), 'y', U.money('wz-cmp', d.compareAt, 'data-f="compareAt" data-num="1"'))}${fld(t('Profit per piece', 'প্রতি পিসে লাভ'), 'a', `<div class="inp wz-ro" id="wz-profit"></div>`)}</div>
        <div id="wz-pwarn" style="margin-top:10px"></div>
        <div class="wz-box row between" style="margin-top:12px;gap:10px;flex-wrap:wrap"><div><b>${t('Use in combos', 'কম্বোতে ব্যবহার')}</b> ${tag('y')}<div class="small muted">${cmb.length ? t(`Joins: ${cmb.map((x) => A.esc(x.name)).join(', ')}`, `যুক্ত হবে: ${cmb.map((x) => A.esc(x.name)).join(', ')}`) : t('Can be picked in Combos', 'কম্বোতে বাছা যাবে')}</div></div>${U.switch('wz-combo', d.inCombos)}</div>
        <div class="row" style="gap:10px;margin-top:12px;flex-wrap:wrap">${d.priceOk ? U.badge(t('Price confirmed with PIN', 'PIN দিয়ে দাম কনফার্ম'), 'good') : `<button class="btn primary" id="wz-pin">${A.icon('check')}${t('Confirm price with PIN', 'PIN দিয়ে দাম কনফার্ম করুন')}</button>`}<span class="small muted">${t('Sale, coupon and combo prices come from Rules, not from here. If the ERP buying price changes later, your selling price does not change by itself — you get a message.', 'সেল, কুপন ও কম্বোর দাম Rules থেকে আসে, এখান থেকে নয়। পরে ERP-র কেনা দাম বদলালে বিক্রির দাম নিজে বদলায় না — আপনাকে জানায়।')}</span></div>`;
    }
    if (s === 6) {
      const ch = chartOf(d); const saved = A.D.sizeCharts.filter((c) => !c.archived);
      const unitSeg = U.seg('wz-unit', [['in', t('inch', 'ইঞ্চি')], ['cm', 'cm']], wzu.unit);
      const tbl = d.chartMode === 'new'
        ? `<div class="chips" style="margin:8px 0">${allSizesFor(d.cat).map((z) => `<button class="chip ${d.nc.sizes.includes(z) ? 'on' : ''}" data-ncsz="${z}">${z}</button>`).join('')}</div><div class="wz-grid5"><table><thead><tr><th>${t(`Measure (${wzu.unit === 'in' ? 'inch' : 'cm'})`, `মাপ (${wzu.unit === 'in' ? 'ইঞ্চি' : 'cm'})`)}</th>${d.nc.sizes.map((z) => `<th>${z}</th>`).join('')}</tr></thead><tbody>${d.nc.rows.map((r, ri) => `<tr><td>${ptName(r.point)}</td>${r.vals.map((v, vi) => `<td><input class="inp" type="number" step="0.25" data-ncv="${ri}-${vi}" value="${wzu.unit === 'in' ? v : cmS(v)}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
           <div class="formgrid" style="margin-top:8px">${U.field(t('Chart name', 'চার্টের নাম'), `<input class="inp" data-f="ncName" value="${A.esc(d.ncName)}">`)}<label class="row small" style="gap:8px;align-self:end">${U.switch('wz-ncsave', d.ncSave)} ${t('Also save as a new chart in Size charts', 'Size charts-এ নতুন চার্ট হিসেবেও সেভ')}</label></div>`
        : `<div class="wz-grid5"><table><thead><tr><th>${t('in · cm', 'ইঞ্চি · cm')}</th>${ch.sizes.map((z) => `<th>${z}</th>`).join('')}</tr></thead><tbody>${ch.rows.map((r) => `<tr><td>${ptName(r.point)}</td>${r.vals.map((v) => `<td>${v} · ${cmS(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      return `${fld(t('Key points (3–5)', 'মূল কথা (3–5টা)'), 'y', `<input class="inp" data-f="points" value="${A.esc(d.points)}" placeholder="${t('100% cotton · Regular fit · Rib collar · Machine wash cold', '100% cotton · Regular fit · Rib collar · Machine wash cold')}">`, t('Separate with “·”.', '“·” দিয়ে আলাদা করুন।'))}
        ${fld(t('Description', 'বিবরণ'), 'a', `<textarea class="inp" rows="3" data-f="desc">${A.esc(d.desc)}</textarea>`, `<button class="btn sm ghost" id="wz-ai">${A.icon('edit')}${t('Write a draft for me', 'আমার জন্য খসড়া লিখুন')}</button> <span id="wz-dc"></span>`)}
        <div class="wz-box" style="margin-top:12px"><div class="row between" style="gap:8px;flex-wrap:wrap;margin-bottom:8px"><b>${t('Size chart', 'সাইজ চার্ট')}</b>${d.chartMode === 'new' ? unitSeg : ''}</div>
          ${U.seg('wz-cm', [['erp', t('From ERP', 'ERP থেকে')], ['saved', t('Pick saved', 'সেভ করা থেকে')], ['new', t('+ Create new', '+ নতুন বানান')]], d.chartMode)}
          ${d.chartMode === 'saved' ? `<div style="margin-top:8px">${U.select('wz-chart', saved.map((c) => [c.id, `${c.name} · ${catNm(c.cat)}`]), d.chartId)}</div>` : ''}
          <div class="small muted" style="margin:6px 0">${d.chartMode === 'erp' ? t('From the tech pack in the ERP. A change you make on the shop is never overwritten by a later ERP change.', 'ERP-র টেক প্যাক থেকে। দোকানে বদলালে পরে ERP-র বদল সেটা মুছবে না।') : d.chartMode === 'new' ? t(`XS to 4XL with the measures for ${catNm(d.cat)}. Type inches; cm works itself out.`, `XS থেকে 4XL আর ${catNm(d.cat)}-র মাপের ঘর নিজে আসে। ইঞ্চি দিন; cm নিজে হিসাব হয়।`) : ''}</div>${tbl}</div>
        <div class="wz-box" style="margin-top:12px"><b>${t('Size finder', 'সাইজ খোঁজা')}</b> ${tag('y')}<div class="small muted" style="margin-bottom:6px">${t('Which size fits which height and weight. Customers type theirs and get a size.', 'কোন সাইজ কোন উচ্চতা ও ওজনের জন্য। কাস্টমার নিজেরটা দিলে সাইজ বলে দেয়।')}</div>
          <div class="wz-grid5"><table><thead><tr><th>${t('Size', 'সাইজ')}</th><th>${t('Height from', 'উচ্চতা থেকে')}</th><th>${t('to', 'পর্যন্ত')}</th><th>${t('Weight kg', 'ওজন কেজি')}</th><th>${t('to', 'পর্যন্ত')}</th></tr></thead><tbody>${d.finder.map((f, i) => `<tr><td><b>${f.size}</b></td><td><input class="inp w" data-fn="${i}-h1" value="${A.esc(f.h1)}"></td><td><input class="inp w" data-fn="${i}-h2" value="${A.esc(f.h2)}"></td><td><input class="inp" type="number" data-fn="${i}-w1" value="${f.w1}"></td><td><input class="inp" type="number" data-fn="${i}-w2" value="${f.w2}"></td></tr>`).join('')}</tbody></table></div></div>
        <div class="formgrid" style="margin-top:12px">${fld(t('Fit', 'ফিট'), 'y', U.select('wz-fit', [['Slim', 'Slim'], ['Regular', 'Regular'], ['Relaxed', 'Relaxed'], ['Oversized', 'Oversized']], d.fit, 'data-f="fit"'))}${fld(t('Sizes run', 'সাইজ কেমন'), 'y', U.select('wz-run', [['small', t('Runs small', 'ছোট হয়')], ['true', t('True to size', 'ঠিক মাপের')], ['large', t('Runs large', 'বড় হয়')]], d.run, 'data-f="run"'), t('Moves the size finder one size up or down.', 'সাইজ খোঁজার প্রস্তাব এক সাইজ উপরে-নিচে সরায়।'))}</div>
        <div class="formgrid">${fld(t('Model height (optional)', 'মডেলের উচ্চতা (চাইলে)'), 'y', `<input class="inp" data-model="h" value="${A.esc(d.model.h)}" placeholder="5'10&quot;">`)}${fld(t('Model weight kg', 'মডেলের ওজন কেজি'), 'y', `<input class="inp" data-model="w" value="${A.esc(d.model.w)}" placeholder="72">`)}${fld(t('Model wears', 'মডেল পরেছেন'), 'y', U.select('wz-msize', [['', '—']].concat(d.sizes.map((z) => [z, z])), d.model.size, 'data-model="size"'))}</div>
        <div class="wz-box" style="margin-top:12px"><b>${t('Questions & answers for this product', 'এই প্রোডাক্টের প্রশ্ন-উত্তর')}</b><div class="small muted" style="margin-bottom:6px">${t(`${A.D.faqs.filter((f) => f.scope === 'category' && f.cat === d.cat && f.on).length} questions for ${catNm(d.cat)} are added by themselves.`, `${catNm(d.cat)}-র ${A.D.faqs.filter((f) => f.scope === 'category' && f.cat === d.cat && f.on).length}টি প্রশ্ন নিজে যুক্ত হয়।`)}</div>${d.faqs.map((f, i) => `<div class="faq-li"><div class="q">${A.esc(f.q)}</div><div class="small">${A.esc(f.a)}</div><button class="btn sm ghost" data-dfaq="${i}">${t('Remove', 'সরান')}</button></div>`).join('')}<div class="formgrid"><input class="inp" id="wz-fq" placeholder="${t('Question', 'প্রশ্ন')}"><input class="inp" id="wz-fa" placeholder="${t('Answer', 'উত্তর')}"></div><button class="btn sm" id="wz-addfaq" style="margin-top:6px">${A.icon('plus')}${t('Add question', 'প্রশ্ন যোগ করুন')}</button></div>
        <div class="small muted" style="margin-top:8px">${A.icon('info')} ${t('Delivery time, exchange and check-at-the-door lines come from Rules by themselves.', 'ডেলিভারি সময়, এক্সচেঞ্জ ও দরজায় দেখে নেওয়ার লাইন Rules থেকে নিজে বসে।')}</div>`;
    }
    if (s === 7) {
      return `${fld(t('Link', 'লিংক'), 'a', `<div class="row" style="gap:6px;flex-wrap:nowrap"><span class="small muted" style="white-space:nowrap">extas.com.bd/</span><input class="inp" data-f="slug" value="${A.esc(d.slug)}"></div>`, t('If you change it later, the old link still leads here.', 'পরে বদলালেও পুরনো লিংক এখানেই আনে।'))}
        ${fld(`${t('Google title', 'Google শিরোনাম')} <span class="muted" id="wz-tc"></span>`, 'a', `<input class="inp" data-f="title" value="${A.esc(d.title)}">`)}
        ${fld(`${t('Google description', 'Google বিবরণ')} <span class="muted" id="wz-mc"></span>`, 'a', `<textarea class="inp" rows="3" data-f="mdesc">${A.esc(d.mdesc)}</textarea>`)}
        ${fld(t('Focus keyword', 'মূল সার্চ শব্দ'), 'y', `<input class="inp" data-f="kw" value="${A.esc(d.kw)}">`, t(`Suggested: “${kwSuggest(d)}” · about ${A.fmt.num(kwVol(d))} searches a month`, `প্রস্তাব: “${kwSuggest(d)}” · মাসে প্রায় ${A.fmt.num(kwVol(d))} বার খোঁজে`))}
        <div class="prd-gprev" id="wz-gp" style="margin-top:12px"></div><div id="wz-seo" style="margin-top:12px"></div>`;
    }
    const st = stepState(d); const pr = +d.price || 0; const m = marginOf(pr, setCost(d)); const seo = wzSeo(d); const noPh = sc.filter((c) => !front(d, c));
    const line = (ok, l, stop) => `<div class="wz-ck ${ok ? 'ok' : stop ? 'stop' : 'no'}"><span class="i">${ok ? '✓' : '!'}</span><span>${l}</span></div>`;
    const canPub = sc.length && !noPh.length && pr > setCost(d) && d.priceOk;
    return `${line(st[0].ok, t(`From ERP: ${d.variants.length} SKUs, ${A.sum(d.variants, (v) => v.stock)} pcs`, `ERP থেকে: ${d.variants.length}টি SKU, ${A.sum(d.variants, (v) => v.stock)} পিস`))}
      ${line(st[1].ok, t(`Name, category${d.det.fabric ? ', fabric' : ''}`, `নাম, ক্যাটাগরি${d.det.fabric ? ', ফেব্রিক' : ''}`))}
      ${line(!!sc.length, t(`${sc.length} colours · ${shownSizes(d).length} sizes on the shop`, `দোকানে ${sc.length}টি কালার · ${shownSizes(d).length}টি সাইজ`))}
      ${line(!noPh.length, noPh.length ? t(`Photos missing: ${noPh.map((c) => `${c} ${photosOf(d, c)} of 4`).join(', ')}`, `ছবি বাকি: ${noPh.map((c) => `${c} 4টির ${photosOf(d, c)}টি`).join(', ')}`) : t('Front photo for every colour', 'প্রতিটা কালারের সামনের ছবি'), true)}
      ${line(pr > setCost(d) && d.priceOk, pr ? t(`Price ${A.fmt.tk(pr)} · profit ${A.fmt.pct(m, 0)}${d.priceOk ? '' : ' · confirm with PIN in step 5'}`, `দাম ${A.fmt.tk(pr)} · লাভ ${A.fmt.pct(m, 0)}${d.priceOk ? '' : ' · ধাপ 5-এ PIN দিয়ে কনফার্ম করুন'}`) : t('No price yet', 'এখনো দাম নেই'), true)}
      ${line(st[5].ok, t(`Description and size chart (${chartOf(d).name})`, `বিবরণ ও সাইজ চার্ট (${chartOf(d).name})`))}
      ${line(seo.s >= 70, t(`Google ${seo.s}/100`, `Google ${seo.s}/100`))}
      ${fld(t('Shows on', 'যেখানে দেখাবে'), 'a', roBox(`${catNm(d.cat)} ${t('page', 'পেজ')}${d.tags.length ? ' · ' + d.tags.join(' · ') : ''}${d.inCombos ? ' · ' + t('Combos', 'কম্বো') : ''}${d.bgrade ? ' · Outlet' : ''}`))}
      ${demoAsk(d)}
      ${canPub ? '' : U.callout(t('Publish needs a front photo for every colour and a confirmed price. Other gaps only warn.', 'পাবলিশ করতে প্রতিটা কালারের সামনের ছবি আর কনফার্ম করা দাম লাগবে। বাকিগুলো শুধু সতর্ক করে।'), 'warn', 'warn')}
      <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="wz-pub" ${canPub ? '' : 'disabled'}>${t('Publish now', 'এখনই পাবলিশ')}</button><button class="btn" id="wz-sch" ${canPub ? '' : 'disabled'}>${t('Schedule', 'শিডিউল')}</button><button class="btn" id="wz-draft">${t('Save draft', 'খসড়া সেভ')}</button></div>`;
  }
  const demoHide = (d) => (d.hideDemo !== undefined ? d.hideDemo : realIn(d.cat) >= 3);
  function demoAsk(d) {
    if (!A.demo) return ''; const dd = demoData(); const n = dd.items.filter((it) => it.cat === d.cat && demoShown(it)).length; if (!n) return '';
    return `<label class="wz-ck" style="cursor:pointer;align-items:flex-start"><input type="checkbox" id="wz-hidedemo" ${demoHide(d) ? 'checked' : ''} style="width:18px;height:18px;margin-top:2px;accent-color:var(--accent)"><span><b>${t(`Hide demo products in ${catNm(d.cat)}?`, `${catNm(d.cat)}-এ ডেমো প্রোডাক্ট লুকাবেন?`)}</b><span class="muted small" style="display:block">${t(`${n} sample items show there now. Your real product takes their place when it goes live.`, `এখন সেখানে ${n}টি নমুনা দেখাচ্ছে। আপনার আসল প্রোডাক্ট লাইভ হলে সেগুলোর জায়গা নেবে।`)}</span></span></label>`;
  }
  const kwSuggest = (d) => `${(d.brand && d.brand !== 'EXTAS' ? d.brand.toLowerCase() + ' ' : '') + (kwFor(d.cat)[0] || d.cat)} bd`;
  const kwVol = (d) => 600 + (A.sum((d.brand + d.cat).split(''), (c) => c.charCodeAt(0)) % 30) * 90;

  /* ================= ADD PRODUCT — step 4 "Photos & video" (round 3) =================
     Photos are optimised automatically (settings in "Media settings"); every photo gets a quality check, size saving, alt text and a file name.
     d.photos[colour] (4 true/false slots) is kept in step with the real list d.pm.list so the rest of the wizard (publish check, preview) keeps working. */
  A.css('products3', `
  .ph-drop{border:2px dashed var(--line2);border-radius:14px;padding:18px 14px;text-align:center;background:var(--card2);display:flex;flex-direction:column;gap:8px;align-items:center}
  .ph-drop.over{border-color:var(--accent);background:var(--accent-soft)}
  .ph-drop b{font-size:14.5px}
  .ph-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
  .ph-card{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:8px;display:flex;flex-direction:column;gap:7px;min-width:0}
  .ph-card.drag{opacity:.45}.ph-card.dropt{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
  .ph-img{position:relative;aspect-ratio:4/5;border-radius:9px;overflow:hidden;background:var(--card2);cursor:grab}
  .ph-img img{width:100%;height:100%;object-fit:cover;display:block}
  .ph-img .mn{position:absolute;left:6px;top:6px}
  .ph-img .ag{position:absolute;right:6px;top:6px;font-size:11px;background:rgba(0,0,0,.55);color:#fff;border-radius:6px;padding:1px 6px}
  .ph-sav{font-size:12.5px;display:flex;flex-direction:column;gap:2px}
  .ph-sav b{font-variant-numeric:tabular-nums}
  .ph-fm{display:flex;gap:6px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums}
  .ph-q{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
  .ph-acts{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
  .ph-acts .btn{padding:4px 8px;font-size:12px}
  .ph-acts select{font-size:12px;padding:3px 6px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);max-width:100%}
  .ph-fn{font:11px var(--f-mono,monospace);color:var(--muted);word-break:break-all}
  .ph-crop{position:relative;margin:0 auto;max-width:300px;user-select:none;touch-action:none;background:var(--card2)}
  .ph-crop img{display:block;width:100%;pointer-events:none}
  .ph-crop .sh{position:absolute;background:rgba(0,0,0,.5);pointer-events:none}
  .ph-crop .fr{position:absolute;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4);cursor:grab}
  .ph-vid{border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--card)}
  .ph-poster{position:relative;aspect-ratio:4/5;max-width:240px;border-radius:12px;overflow:hidden;background:var(--card2);cursor:pointer;border:0;padding:0;display:block;width:100%}
  .ph-poster img,.ph-poster iframe{width:100%;height:100%;object-fit:cover;display:block;border:0}
  .ph-play{position:absolute;inset:0;display:grid;place-items:center}
  .ph-play i{width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center;box-shadow:0 4px 14px rgba(0,0,0,.3)}
  .ph-play i:after{content:"";border-left:16px solid #1b1b1b;border-top:10px solid transparent;border-bottom:10px solid transparent;margin-left:4px}
  .ph-vrow{display:grid;grid-template-columns:minmax(0,240px) minmax(0,1fr);gap:14px;align-items:start}
  @media(max-width:560px){.ph-vrow{grid-template-columns:1fr}.ph-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
  .ph-seo .wz-ck{padding:4px 0}
  `);
  const MS = () => { const D = A.D; if (!D.mediaSettings) D.mediaSettings = { quality: 78, widths: '320,480,720,1080,1600', bigKB: 150, catKB: 40, minSide: 800, videoKbps: 1200, videoMaxMB: 8 }; return D.mediaSettings; };
  const widthsOf = () => String(MS().widths).split(/[ ,]+/).map(Number).filter((x) => x > 0).sort((a, b) => a - b);
  const kbOf = (px, q, mult) => Math.max(4, Math.round(px * (0.12 + Math.pow(q / 100, 3) * 0.5) * mult / 8 / 1024));
  /** estimated size of the big product image in each format, from the photo's real width and the quality setting */
  function estimate(it) {
    const ws = widthsOf(); const big = ws[Math.min(3, ws.length - 1)] || 1080; const w = Math.min(it.w, big); const px = w * w * 1.25; const q = +MS().quality || 78;
    const avif = kbOf(px, q, 1), webp = kbOf(px, q, 1.3), jpeg = kbOf(px, q, 1.9);
    return { w, avif, webp, jpeg, ok: avif <= MS().bigKB, saved: it.origKB > avif ? Math.round((1 - avif / it.origKB) * 100) : 0 };
  }
  const fmtKB = (kb) => (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB');
  const ISS = () => ({ ratio: [t('Wrong ratio', 'মাপ ঠিক নয়'), 'warn', true], small: [t('Too small', 'খুব ছোট'), 'bad', false], blurry: [t('Blurry', 'ঝাপসা'), 'bad', false], dark: [t('Too dark', 'খুব অন্ধকার'), 'warn', true], cut: [t('Cut off', 'কাটা পড়েছে'), 'bad', false] });
  const pmo = (d) => {
    if (!d.pm || d.pm.code !== d.code) d.pm = { code: d.code, list: [], video: null, vmode: 'file', seeded: false };
    if (!d.pm.seeded) { // photos the ERP already had show as real tiles, once
      d.pm.seeded = true;
      d.colors.forEach((c) => { (d.photos[c] || []).forEach((on, i) => { if (on) d.pm.list.push(mkSample(d, c, i, { origin: 'erp' })); }); });
    }
    return d.pm;
  };
  function syncFlags(d) { d.colors.forEach((c) => { const n = pmo(d).list.filter((x) => x.color === c).length; d.photos[c] = [n > 0, n > 1, n > 2, n > 3]; }); d.video = !!pmo(d).video; }
  const uidp = () => 'ph' + Math.random().toString(36).slice(2, 8);
  const ANG = () => [t('front', 'front'), t('back', 'back'), t('detail', 'detail'), t('true colour', 'true colour')];
  const posOf = (d, it) => pmo(d).list.filter((x) => x.color === it.color).indexOf(it);
  const altOf = (d, it) => it.alt != null ? it.alt : `${d.name || d.erpName || 'EXTAS'} – ${d.cname[it.color] || it.color} – ${ANG()[posOf(d, it)] || t('view ' + (posOf(d, it) + 1), 'view ' + (posOf(d, it) + 1))}`;
  const fileOf = (d, it) => `${slugify(d.name || d.erpName || d.code) || 'product'}-${slugify(d.cname[it.color] || it.color)}-${posOf(d, it) + 1}.avif`;
  /** a sample picture drawn from the garment shape (inline SVG), optionally with a ready-made problem */
  function sampleSrc(d, color, opt) {
    const hex = A.COLORS[color] || '#888'; const w = opt.w, h = opt.h; const g = A.garmentSvg(shapeOf(d.cat), hex, Math.min(w, h) * 0.8).replace('<svg ', `<svg x="${(w - Math.min(w, h) * 0.8) / 2}" y="${(h - Math.min(w, h) * 0.8) / 2}" `);
    const op = opt.dark ? 0.55 : 0; const blur = opt.blurry ? '<filter id="b"><feGaussianBlur stdDeviation="9"/></filter>' : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${blur}<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex}" stop-opacity=".12"/><stop offset="1" stop-color="${hex}" stop-opacity=".28"/></linearGradient></defs><rect width="${w}" height="${h}" fill="#f1f1ee"/><rect width="${w}" height="${h}" fill="url(#g)"/><g ${opt.blurry ? 'filter="url(#b)"' : ''}>${g}</g>${opt.cut ? `<rect x="0" y="${h * 0.8}" width="${w}" height="${h * 0.2}" fill="#f1f1ee"/>` : ''}<rect width="${w}" height="${h}" fill="#000" opacity="${op}"/></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function mkSample(d, color, i, o) {
    const kind = o.kind || 'good'; const dims = kind === 'ratio' ? [1500, 1000] : kind === 'small' ? [480, 600] : [1600, 2000];
    const orig = kind === 'small' ? 180 : [2400, 3100, 1900, 2700][i % 4];
    return { id: uidp(), color, name: `IMG_${4100 + Math.floor(Math.random() * 800)}.jpg`, src: sampleSrc(d, color, { w: dims[0], h: dims[1], dark: kind === 'dark', blurry: kind === 'blurry', cut: kind === 'cut' }), w: dims[0], h: dims[1], origKB: orig, issues: kind === 'good' ? [] : [kind], alt: null, origin: o.origin || 'sample' };
  }
  /** read a chosen/dropped/pasted image file: real size, ratio, light and sharpness checks, small stored copy for the preview */
  function readImage(file, color) {
    return new Promise((res) => {
      const url = URL.createObjectURL(file); const im = new Image();
      im.onload = () => {
        try {
          const w = im.naturalWidth, h = im.naturalHeight; const k = Math.min(1, 420 / Math.max(w, h)); const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
          const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, cw, ch);
          const px = cx.getImageData(0, 0, cw, ch).data; let sum = 0; const lum = new Float32Array(cw * ch);
          for (let i = 0, j = 0; i < px.length; i += 4, j++) { const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; lum[j] = l; sum += l; }
          const avg = sum / (cw * ch); const gr = [];
          for (let y = 1; y < ch - 1; y += 2) for (let x = 1; x < cw - 1; x += 2) { const j = y * cw + x; gr.push(Math.abs(lum[j + 1] - lum[j - 1]) + Math.abs(lum[j + cw] - lum[j - cw])); }
          gr.sort((a, b) => a - b); const p99 = gr[Math.floor(gr.length * 0.99)] || 0;
          const issues = []; const r = w / h;
          if (Math.abs(r - 0.8) > 0.03) issues.push('ratio'); if (Math.min(w, h) < MS().minSide) issues.push('small'); if (avg < 55) issues.push('dark'); if (p99 < 14) issues.push('blurry');
          res({ id: uidp(), color, name: file.name || 'pasted-image.png', src: cv.toDataURL('image/jpeg', 0.72), w, h, origKB: Math.max(1, Math.round(file.size / 1024)), issues, alt: null, origin: 'upload' });
        } catch (e) { res(null); }
        URL.revokeObjectURL(url);
      };
      im.onerror = () => { URL.revokeObjectURL(url); res(null); }; im.src = url;
    });
  }
  const parseVideo = (u) => {
    u = String(u || '').trim(); let m;
    if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/i))) return { provider: 'YouTube', id: m[1], embed: `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0&modestbranding=1&playsinline=1` };
    if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d{5,})/i))) return { provider: 'Vimeo', id: m[1], embed: `https://player.vimeo.com/video/${m[1]}?autoplay=1&title=0&byline=0&portrait=0` };
    if (/facebook\.com\/.+\/videos\/|fb\.watch\/|facebook\.com\/watch|facebook\.com\/reel\//i.test(u)) return { provider: 'Facebook', id: u, embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false&autoplay=true` };
    return null;
  };
  function cropDialog(d, it, done) {
    const wide = it.w / it.h > 0.8; let pos = 0.5;
    const m = U.modal(t('Fix the ratio (4:5)', 'মাপ ঠিক করুন (4:5)'), `<div class="small muted" style="margin-bottom:8px">${t('Drag the white frame to choose what stays. The shop shows every photo at 4:5, so nothing jumps while the page loads.', 'সাদা ফ্রেম টেনে ঠিক করুন কোনটুকু থাকবে। দোকানে সব ছবি 4:5-এ দেখায়, তাই পেজ লোডের সময় কিছু নড়ে না।')}</div>
      <div class="ph-crop" id="ph-cr"><img src="${it.src}" alt=""><div class="sh" id="ph-s1"></div><div class="sh" id="ph-s2"></div><div class="fr" id="ph-fr"></div></div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ph-apply">${t('Crop to 4:5', '4:5 করুন')}</button>` });
    const box = m.querySelector('#ph-cr'), img = box.querySelector('img'), fr = m.querySelector('#ph-fr'), s1 = m.querySelector('#ph-s1'), s2 = m.querySelector('#ph-s2');
    const paint = () => {
      const W = box.clientWidth, H = box.clientHeight || img.clientHeight; if (!W || !H) return;
      if (wide) { const fw = H * 0.8, x = (W - fw) * pos; Object.assign(fr.style, { left: x + 'px', top: 0, width: fw + 'px', height: H + 'px' }); Object.assign(s1.style, { left: 0, top: 0, width: x + 'px', height: H + 'px' }); Object.assign(s2.style, { left: x + fw + 'px', top: 0, width: W - x - fw + 'px', height: H + 'px' }); }
      else { const fh = W / 0.8, y = (H - fh) * pos; Object.assign(fr.style, { left: 0, top: y + 'px', width: W + 'px', height: fh + 'px' }); Object.assign(s1.style, { left: 0, top: 0, width: W + 'px', height: y + 'px' }); Object.assign(s2.style, { left: 0, top: y + fh + 'px', width: W + 'px', height: H - y - fh + 'px' }); }
    };
    if (img.complete) setTimeout(paint, 0); img.onload = paint;
    let drag = null;
    fr.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY, p: pos }; try { fr.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); };
    fr.onpointermove = (e) => { if (!drag) return; const W = box.clientWidth, H = box.clientHeight; const span = wide ? W - H * 0.8 : H - W / 0.8; if (span <= 0) return; pos = Math.min(1, Math.max(0, drag.p + ((wide ? e.clientX - drag.x : e.clientY - drag.y) / span))); paint(); };
    fr.onpointerup = fr.onpointercancel = () => { drag = null; };
    m.querySelector('#ph-apply').onclick = () => {
      const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1; const cw = wide ? Math.round(nh * 0.8) : nw, ch = wide ? nh : Math.round(nw / 0.8);
      const sx = wide ? Math.round((nw - cw) * pos) : 0, sy = wide ? 0 : Math.round((nh - ch) * pos);
      try { const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; cv.getContext('2d').drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch); it.src = cv.toDataURL('image/jpeg', 0.8); } catch (e) { /* keep the old picture, still mark the ratio fixed */ }
      if (wide) it.w = Math.round(it.h * 0.8); else it.h = Math.round(it.w / 0.8);
      it.issues = it.issues.filter((x) => x !== 'ratio'); U.close(); done();
    };
  }
  function brighten(it, done) {
    const im = new Image(); im.onload = () => { try { const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0); const id = cx.getImageData(0, 0, cv.width, cv.height); for (let i = 0; i < id.data.length; i += 4) for (let k = 0; k < 3; k++) id.data[i + k] = Math.min(255, 255 * Math.pow(id.data[i + k] / 255, 0.6) * 1.1); cx.putImageData(id, 0, 0); it.src = cv.toDataURL('image/jpeg', 0.78); } catch (e) {} it.issues = it.issues.filter((x) => x !== 'dark'); done(); }; im.onerror = () => { it.issues = it.issues.filter((x) => x !== 'dark'); done(); }; im.src = it.src;
  }
  function mediaSettings(done) {
    const s = MS();
    const m = U.modal(t('Media settings', 'মিডিয়া সেটিংস'), `<div class="formgrid">
      ${U.field(t('Photo quality (1–100)', 'ছবির কোয়ালিটি (1–100)'), U.input('ms-q', s.quality, 'type="number" inputmode="numeric"'), t('Higher = sharper and bigger files. 78 is a good balance.', 'বেশি হলে ছবি পরিষ্কার কিন্তু ফাইল বড়। 78 ভালো ব্যালান্স।'))}
      ${U.field(t('Picture widths (px)', 'ছবির প্রস্থ (px)'), `<input class="inp" id="ms-w" value="${A.esc(s.widths)}">`, t('Five sizes are made for every photo, each as AVIF, WebP and JPEG.', 'প্রতিটা ছবির পাঁচটা সাইজ বানানো হয়, প্রতিটা AVIF, WebP ও JPEG-তে।'))}
      ${U.field(t('Big product image, at most (KB)', 'বড় প্রোডাক্ট ছবি, সর্বোচ্চ (KB)'), U.input('ms-b', s.bigKB, 'type="number" inputmode="numeric"'))}
      ${U.field(t('Category image, at most (KB)', 'ক্যাটাগরি ছবি, সর্বোচ্চ (KB)'), U.input('ms-c', s.catKB, 'type="number" inputmode="numeric"'))}
      ${U.field(t('Smallest side allowed (px)', 'সবচেয়ে ছোট দিক (px)'), U.input('ms-m', s.minSide, 'type="number" inputmode="numeric"'), t('Smaller photos get a “Too small” note.', 'এর চেয়ে ছোট ছবিতে “খুব ছোট” লেখা আসে।'))}
      ${U.field(t('Video quality (kbps)', 'ভিডিওর কোয়ালিটি (kbps)'), U.input('ms-v', s.videoKbps, 'type="number" inputmode="numeric"'), t('Uploaded videos are made into MP4 (H.264) at about this rate.', 'আপলোড করা ভিডিও প্রায় এই রেটে MP4 (H.264) হয়।'))}
      ${U.field(t('Photo ratio', 'ছবির অনুপাত'), '<div class="inp wz-ro">4:5</div>', t('Fixed for the whole shop, so the page never jumps.', 'পুরো দোকানে একই, তাই পেজ নড়ে না।'))}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ms-ok">${t('Save settings', 'সেটিংস সেভ')}</button>` });
    m.querySelector('#ms-ok').onclick = () => {
      const g = (id) => Number(m.querySelector('#' + id).value) || 0; const q = g('ms-q'); const ws = m.querySelector('#ms-w').value.split(/[ ,]+/).map(Number).filter((x) => x > 0);
      if (q < 1 || q > 100 || ws.length < 2 || g('ms-b') < 10 || g('ms-c') < 5) return A.toast(t('Check the numbers', 'সংখ্যাগুলো দেখে নিন'), 'bad');
      Object.assign(s, { quality: q, widths: ws.join(','), bigKB: g('ms-b'), catKB: g('ms-c'), minSide: g('ms-m') || 800, videoKbps: g('ms-v') || 1200 }); U.close(); A.commit('Media settings changed'); A.toast(t('Media settings saved. New numbers show on every photo.', 'মিডিয়া সেটিংস সেভ হয়েছে। এখন সব ছবিতে নতুন সংখ্যা দেখাবে।'), 'good'); done();
    };
  }
  function videoHtml(d, v) {
    const s = MS(); const mode = pmo(d).vmode;
    const seg = U.seg('ph-vm', [['file', t('Upload a file', 'ফাইল আপলোড')], ['link', t('Paste a link', 'লিংক দিন')]], mode);
    let body = '';
    if (!v) {
      body = mode === 'file'
        ? `<div class="ph-drop" style="padding:14px"><span class="small muted">${t('MP4, MOV or WebM. We make it light and take a poster picture for you.', 'MP4, MOV বা WebM। আমরা হালকা করে দেব আর পোস্টার ছবি বানাব।')}</span><div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn sm primary" id="ph-vpick">${A.icon('plus')} ${t('Choose video', 'ভিডিও বাছুন')}</button><button class="btn sm ghost" id="ph-vsample">${t('Use a sample video', 'নমুনা ভিডিও নিন')}</button></div><input type="file" id="ph-vfile" accept="video/*" hidden></div>`
        : `<div class="stack" style="gap:8px"><input class="inp" id="ph-vurl" placeholder="https://www.youtube.com/watch?v=…  ·  vimeo.com/…  ·  facebook.com/…/videos/…"><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm primary" id="ph-vgo">${t('Use this link', 'এই লিংক নিন')}</button><span class="small muted">${t('YouTube, Vimeo or Facebook.', 'YouTube, Vimeo বা Facebook।')}</span></div></div>`;
    } else {
      const poster = v.poster || sampleSrc(d, shownColors(d)[0] || d.colors[0], { w: 800, h: 1000 });
      const info = v.kind === 'file'
        ? `<div class="stack" style="gap:6px"><div><b>${A.esc(v.name)}</b> <span class="muted small">${v.dur}s · MP4 (H.264)</span></div><div class="ph-sav"><span>${t('Made light', 'হালকা করা হয়েছে')}: <b>${fmtKB(v.origMB * 1024)} → ${fmtKB(v.finalMB * 1024)}</b> <span class="muted">(−${Math.round((1 - v.finalMB / v.origMB) * 100)}%)</span></span><span class="muted">${t(`${s.videoKbps} kbps · poster picture taken at 1 second · plays when tapped`, `${s.videoKbps} kbps · 1 সেকেন্ডে পোস্টার ছবি · চাপলে চলে`)}</span></div></div>`
        : `<div class="stack" style="gap:8px"><div><b>${v.provider}</b> ${v.provider === 'Vimeo' ? U.badge(t('Cleanest player', 'সবচেয়ে পরিষ্কার প্লেয়ার'), 'good') : U.badge(t('Small logo while playing', 'চলার সময় ছোট লোগো থাকে'), 'warn')}</div><div class="small muted" style="word-break:break-all">${A.esc(v.url)}</div><div class="small">${t('Looks like your own video: your page shows its own poster and play button first. The player loads only when a customer taps play, so the page stays fast.', 'দেখতে নিজেদের ভিডিওর মতো: পেজে আগে নিজের পোস্টার ও প্লে বোতাম দেখায়। কাস্টমার প্লে চাপলে তবেই প্লেয়ার লোড হয়, তাই পেজ দ্রুত থাকে।')}</div>
          <div class="small muted">${t('To be honest: YouTube and Facebook keep their own small logo inside the player once it starts playing. Vimeo is the cleanest.', 'সত্যি কথা: YouTube ও Facebook-এর প্লেয়ার চালু হলে ভেতরে তাদের ছোট লোগো থেকে যায়। Vimeo সবচেয়ে পরিষ্কার।')}</div></div>`;
      body = `<div class="ph-vrow"><div><button type="button" class="ph-poster" id="ph-vplay" aria-label="${t('Play', 'প্লে')}"><img src="${poster}" alt="${A.esc(altVideo(d, v))}"><span class="ph-play"><i></i></span></button><div class="small muted" style="margin-top:4px">${t('Tap to try', 'চেপে দেখুন')} · 4:5</div></div><div class="stack" style="gap:10px">${info}
        ${v.kind === 'link' ? U.field(t('Length (seconds)', 'দৈর্ঘ্য (সেকেন্ড)'), U.input('ph-vdur', v.dur, 'type="number" inputmode="numeric"'), t('Needed for Google (video info).', 'Google-এর জন্য লাগে (ভিডিওর তথ্য)।')) : ''}
        <div class="row" style="gap:8px"><button class="btn sm danger" id="ph-vdel">${t('Remove video', 'ভিডিও সরান')}</button></div></div></div>`;
    }
    return `<div class="ph-vid"><div class="row between" style="gap:8px;flex-wrap:wrap"><div><b>${t('Video (optional)', 'ভিডিও (চাইলে)')}</b><div class="small muted">${t('A 15-second clip on the model sells better.', 'মডেলের গায়ে 15 সেকেন্ডের ক্লিপে বিক্রি বাড়ে।')}</div></div>${v ? '' : seg}</div>${body}</div>`;
  }
  const altVideo = (d, v) => `${d.name || d.erpName || 'EXTAS'} – ${t('video', 'video')}`;
  function photoStep(d, sc) {
    const P = pmo(d); syncFlags(d); const c = sc.includes(wzu.pcol) ? wzu.pcol : sc[0];
    if (!c) return U.empty(t('Pick at least one colour in step 3 first.', 'আগে ধাপ 3-এ অন্তত একটা কালার বাছুন।'));
    const cl = P.list.filter((x) => x.color === c); const ISSM = ISS(); const s = MS();
    const allBad = P.list.filter((x) => sc.includes(x.color) && x.issues.length);
    const tile = (it, i) => {
      const e = estimate(it); const fixable = it.issues.some((k) => ISSM[k][2]);
      return `<div class="ph-card" data-pid="${it.id}"><div class="ph-img" draggable="true" data-drag="${it.id}"><img src="${it.src}" alt="${A.esc(altOf(d, it))}" loading="lazy">${i === 0 ? `<span class="mn">${U.badge(t('Main', 'মূল'), 'accent')}</span>` : ''}<span class="ag">${it.w}×${it.h}</span></div>
        <div class="ph-q">${it.issues.length ? it.issues.map((k) => U.badge(ISSM[k][0], ISSM[k][1])).join('') : U.badge('✓ ' + t('Looks good', 'ঠিক আছে'), 'good')}${fixable ? `<button class="btn sm primary" data-fix="${it.id}">${t('Fix', 'ঠিক করুন')}</button>` : ''}</div>
        ${it.issues.some((k) => !ISSM[k][2]) ? `<div class="small muted">${t('This one needs a new photo.', 'এটার জন্য নতুন ছবি তুলতে হবে।')}</div>` : ''}
        <div class="ph-sav"><span>${fmtKB(it.origKB)} → <b>${fmtKB(e.avif)}</b> ${e.saved ? `<span class="muted">(−${e.saved}%)</span>` : ''}</span><div class="ph-fm"><span>AVIF ${fmtKB(e.avif)}</span><span>WebP ${fmtKB(e.webp)}</span><span>JPEG ${fmtKB(e.jpeg)}</span></div><span class="small ${e.ok ? '' : 'muted'}" style="color:${e.ok ? 'var(--good)' : 'var(--warn)'}">${e.ok ? '✓ ' + t(`under ${s.bigKB} KB`, `${s.bigKB} KB-র নিচে`) : t(`over ${s.bigKB} KB: quality will drop a little`, `${s.bigKB} KB-র বেশি: কোয়ালিটি একটু কমবে`)}</span></div>
        <div><input class="inp" data-alt="${it.id}" value="${A.esc(altOf(d, it))}" aria-label="${t('Alt text', 'alt লেখা')}" style="font-size:12.5px"><div class="ph-fn">${A.esc(fileOf(d, it))}</div></div>
        <div class="ph-acts">${i === 0 ? '' : `<button class="btn sm" data-main="${it.id}">${t('Set as main', 'মূল করুন')}</button>`}<button class="btn sm ghost" data-mv="${it.id}:-1" ${i === 0 ? 'disabled' : ''} aria-label="${t('Move earlier', 'আগে নিন')}">◀</button><button class="btn sm ghost" data-mv="${it.id}:1" ${i === cl.length - 1 ? 'disabled' : ''} aria-label="${t('Move later', 'পরে নিন')}">▶</button>
          <select data-tag="${it.id}" aria-label="${t('Colour', 'কালার')}">${sc.map((x) => `<option value="${A.esc(x)}" ${x === it.color ? 'selected' : ''}>${A.esc(d.cname[x] || x)}</option>`).join('')}</select><button class="btn sm ghost" data-rm="${it.id}">${t('Remove', 'সরান')}</button></div></div>`;
    };
    const v = P.video; const noFront = sc.filter((x) => !front(d, x));
    const seo = [
      [P.list.length ? P.list.every((x) => altOf(d, x).trim()) : null, t('Every photo has alt text (written for you, you can edit)', 'প্রতিটা ছবির alt লেখা আছে (নিজে লেখা, বদলানো যায়)')],
      [P.list.length ? !!(d.name || d.erpName) : null, t('File names come from the product name and colour', 'ফাইলের নাম প্রোডাক্টের নাম ও কালার থেকে')],
      [true, t('Lazy loading is on: photos below the first screen load later', 'লেজি লোডিং চালু: প্রথম স্ক্রিনের নিচের ছবি পরে লোড হয়')],
      [P.list.length ? !P.list.some((x) => x.issues.includes('ratio')) : null, P.list.some((x) => x.issues.includes('ratio')) ? t(`${P.list.filter((x) => x.issues.includes('ratio')).length} photo(s) are not 4:5 yet: fix them so the page never jumps`, `${P.list.filter((x) => x.issues.includes('ratio')).length}টি ছবি এখনো 4:5 নয়: ঠিক করুন, তাহলে পেজ নড়বে না`) : t('Fixed 4:5 ratio, so the page does not jump while loading', 'ফিক্সড 4:5 মাপ, তাই লোডের সময় পেজ নড়ে না')],
      [P.list.length ? !allBad.length : null, allBad.length ? t(`${allBad.length} photo(s) need a look (see the notes above)`, `${allBad.length}টি ছবি দেখতে হবে (ওপরের নোট দেখুন)`) : t('All photos look good', 'সব ছবি ঠিক আছে')],
      [v ? !!(v.poster || v.kind === 'link') && v.dur > 0 : null, v ? t('Video info for Google (thumbnail, length, description) is filled', 'Google-এর জন্য ভিডিওর তথ্য (থাম্বনেইল, দৈর্ঘ্য, বিবরণ) ভরা আছে') : t('Video info for Google: added automatically when you add a video', 'Google-এর জন্য ভিডিওর তথ্য: ভিডিও দিলে নিজে যোগ হবে')],
      [v ? true : null, v ? t('Video is listed in the video sitemap', 'ভিডিও সাইটম্যাপে আছে') : t('Video sitemap: added automatically with a video', 'ভিডিও সাইটম্যাপ: ভিডিও দিলে নিজে যোগ হবে')],
    ];
    return `<div class="chips" style="margin-bottom:10px">${sc.map((x) => `<button class="chip ${x === c ? 'on' : ''}" data-pcol="${A.esc(x)}">${U.sw(x)} ${A.esc(x)} <span class="c">${P.list.filter((y) => y.color === x).length}</span></button>`).join('')}</div>
      <div class="ph-drop" id="ph-drop"><b>${t(`Add photos for ${d.cname[c] || c}`, `${d.cname[c] || c}-এর ছবি যোগ করুন`)}</b><span class="small muted">${t('Drop many photos here, paste one (Ctrl+V), or choose them. They are made light and sharp for you.', 'অনেকগুলো ছবি এখানে ফেলুন, পেস্ট করুন (Ctrl+V) বা বেছে নিন। আমরা হালকা ও পরিষ্কার করে দেব।')}</span>
        <div class="row" style="gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn primary" id="ph-pick">${A.icon('plus')} ${t('Choose photos', 'ছবি বাছুন')}</button><button class="btn" id="ph-lib">${t('From library / ERP', 'লাইব্রেরি / ERP থেকে')}</button><button class="btn ghost" id="ph-sample">${t('Try sample photos', 'নমুনা ছবি দিয়ে দেখুন')}</button><button class="btn ghost" id="ph-set">${A.icon('edit', 14)} ${t('Media settings', 'মিডিয়া সেটিংস')}</button></div><input type="file" id="ph-file" accept="image/*" multiple hidden></div>
      <div class="small muted" style="margin:8px 0">${t(`Every photo is made into ${widthsOf().length} sizes (${widthsOf().join(', ')} px) as AVIF, WebP and JPEG at quality ${s.quality}, shown at 4:5. The original is kept safe; the full-size file opens only when a customer zooms.`, `প্রতিটা ছবি ${widthsOf().length}টা সাইজে (${widthsOf().join(', ')} px) AVIF, WebP ও JPEG-তে, কোয়ালিটি ${s.quality}, 4:5 মাপে। আসল ছবি আলাদা রাখা থাকে; কাস্টমার জুম করলে তবেই বড় ফাইল খোলে।`)}</div>
      ${cl.length ? `<div class="ph-grid" id="ph-grid">${cl.map(tile).join('')}</div><div class="small muted" style="margin-top:6px">${t('Drag a photo to change the order. The first one is the main photo.', 'ছবি টেনে ক্রম বদলান। প্রথমটাই মূল ছবি।')}</div>` : U.empty(t('No photo for this colour yet.', 'এই কালারের কোনো ছবি এখনো নেই।'))}
      <div style="margin-top:14px">${videoHtml(d, v)}</div>
      ${noFront.length ? U.callout(t(`No front photo yet for: ${noFront.join(', ')}. Publish waits for it.`, `এখনো সামনের ছবি নেই: ${noFront.join(', ')}। এটা ছাড়া পাবলিশ হবে না।`), 'warn', 'warn') : U.callout(t('Every colour has a front photo.', 'সব কালারের সামনের ছবি আছে।'), 'good', 'check')}
      <div class="wz-box ph-seo" style="margin-top:10px"><b>${t('Google & speed checklist', 'Google ও স্পিড চেকলিস্ট')}</b>${seo.map((x) => `<div class="wz-ck ${x[0] === true ? 'ok' : x[0] === null ? '' : 'no'}"><span class="i">${x[0] === true ? '✓' : x[0] === null ? '–' : '!'}</span><span>${x[1]}</span></div>`).join('')}</div>`;
  }
  function wirePhotos(el, d, touch) {
    const P = pmo(d); const sc = shownColors(d); const c = sc.includes(wzu.pcol) ? wzu.pcol : sc[0]; if (!c) return;
    const find = (id) => P.list.find((x) => x.id === id); const redo = () => { syncFlags(d); wzu.pv = c; touch(true); };
    const addFiles = async (files, color) => {
      const fl = Array.from(files || []).filter((f) => /^image\//.test(f.type)); if (!fl.length) return A.toast(t('Please pick picture files', 'ছবির ফাইল বাছুন'), 'bad');
      A.toast(t(`Making ${fl.length} photo(s) light and sharp…`, `${fl.length}টি ছবি হালকা ও পরিষ্কার করা হচ্ছে…`));
      const out = (await Promise.all(fl.map((f) => readImage(f, color)))).filter(Boolean); if (!out.length) return A.toast(t('Could not read the picture', 'ছবিটা পড়া গেল না'), 'bad');
      P.list.push(...out); const bad = out.filter((x) => x.issues.length).length; syncFlags(d); A.save(); wzu.pv = color; A.toast(t(`${out.length} photo(s) added and optimised${bad ? ` · ${bad} need a look` : ''}`, `${out.length}টি ছবি যোগ ও অপটিমাইজ হয়েছে${bad ? ` · ${bad}টি দেখতে হবে` : ''}`), 'good'); A.render();
    };
    const fi = el.querySelector('#ph-file'); el.querySelector('#ph-pick').onclick = () => fi.click(); fi.onchange = () => { addFiles(fi.files, c); fi.value = ''; };
    const dz = el.querySelector('#ph-drop');
    ['dragenter', 'dragover'].forEach((ev) => (dz.addEventListener(ev, (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); dz.classList.add('over'); } })));
    ['dragleave', 'drop'].forEach((ev) => (dz.addEventListener(ev, () => dz.classList.remove('over'))));
    dz.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files, c); } });
    if (wzu.pasteH) document.removeEventListener('paste', wzu.pasteH);
    wzu.pasteH = (e) => { const r = A.route ? A.route() : {}; if (!document.body.contains(el) || (r && r.tab && r.tab !== 'add') || D0().step !== 4) return; const fs = Array.from((e.clipboardData && e.clipboardData.files) || []); if (fs.length) { e.preventDefault(); addFiles(fs, c); } };
    document.addEventListener('paste', wzu.pasteH);
    el.querySelector('#ph-sample').onclick = () => { ['good', 'good', 'ratio', 'dark', 'blurry'].forEach((k, i) => P.list.push(mkSample(d, c, i, { kind: k }))); A.toast(t('5 sample photos added. Two have problems, so you can see the checks.', '5টা নমুনা ছবি যোগ হয়েছে। দুটোতে সমস্যা আছে, চেকগুলো দেখার জন্য।'), 'good'); redo(); };
    el.querySelector('#ph-set').onclick = () => mediaSettings(() => A.render());
    el.querySelector('#ph-lib').onclick = () => {
      const pool = A.D.products.filter((p) => p.photos > 0 && p.cat === d.cat).slice(0, 8); const items = pool.map((p, i) => ({ p, src: sampleSrc(d, p.colors[0], { w: 1600, h: 2000 }) }));
      const m = U.modal(t('Pick from the library / ERP', 'লাইব্রেরি / ERP থেকে বাছুন'), `<div class="small muted" style="margin-bottom:8px">${t('Photos the ERP already has and photos used on other styles. Tick the ones you want.', 'ERP-তে যে ছবি আছে আর অন্য স্টাইলে যে ছবি ব্যবহার হয়েছে। যেগুলো চান টিক দিন।')}</div><div class="ph-grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">${items.map((x, i) => `<label class="ph-card" style="cursor:pointer"><div class="ph-img" style="cursor:pointer"><img src="${x.src}" alt=""></div><span class="small"><input type="checkbox" data-lib="${i}"> ${A.esc(x.p.styleCode)}</span></label>`).join('') || U.empty(t('Nothing in the library yet.', 'লাইব্রেরিতে এখনো কিছু নেই।'))}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ph-libok">${t('Add selected', 'বাছাইগুলো যোগ করুন')}</button>` });
      m.querySelector('#ph-libok').onclick = () => { const sel = Array.from(m.querySelectorAll('[data-lib]:checked')).map((x) => items[+x.dataset.lib]); if (!sel.length) return A.toast(t('Tick at least one photo', 'অন্তত একটা ছবি টিক দিন'), 'bad'); sel.forEach((x, i) => P.list.push({ id: uidp(), color: c, name: x.p.styleCode + '.jpg', src: x.src, w: 1600, h: 2000, origKB: 2100 + i * 230, issues: [], alt: null, origin: 'library' })); U.close(); A.toast(t(`${sel.length} photo(s) added from the library`, `লাইব্রেরি থেকে ${sel.length}টি ছবি যোগ হয়েছে`), 'good'); redo(); };
    };
    A.on(el, '[data-alt]', 'input', (e, i) => { const it = find(i.dataset.alt); if (it) { it.alt = i.value; A.save(); } });
    A.on(el, '[data-main]', 'click', (e, b) => { const it = find(b.dataset.main); P.list.splice(P.list.indexOf(it), 1); const first = P.list.findIndex((x) => x.color === it.color); P.list.splice(first < 0 ? P.list.length : first, 0, it); A.toast(t('Main photo changed', 'মূল ছবি বদলেছে'), 'good'); redo(); });
    A.on(el, '[data-mv]', 'click', (e, b) => { const [id, dir] = b.dataset.mv.split(':'); const it = find(id); const same = P.list.filter((x) => x.color === it.color); const k = same.indexOf(it) + +dir; if (k < 0 || k >= same.length) return; const other = same[k]; const a = P.list.indexOf(it), o = P.list.indexOf(other); P.list[a] = other; P.list[o] = it; redo(); });
    A.on(el, '[data-tag]', 'change', (e, s) => { const it = find(s.dataset.tag); it.color = s.value; wzu.pcol = s.value; A.toast(t(`Moved to ${d.cname[s.value] || s.value}`, `${d.cname[s.value] || s.value}-এ নেওয়া হয়েছে`), 'good'); redo(); });
    A.on(el, '[data-rm]', 'click', (e, b) => { const it = find(b.dataset.rm); P.list.splice(P.list.indexOf(it), 1); A.toast(t('Photo removed', 'ছবি সরানো হয়েছে'), 'good'); redo(); });
    A.on(el, '[data-fix]', 'click', (e, b) => { const it = find(b.dataset.fix); if (it.issues.includes('ratio')) return cropDialog(d, it, () => { A.toast(t('Cropped to 4:5', '4:5-এ কাটা হয়েছে'), 'good'); redo(); }); if (it.issues.includes('dark')) return brighten(it, () => { A.toast(t('Brightened', 'উজ্জ্বল করা হয়েছে'), 'good'); redo(); }); });
    // drag to reorder inside this colour
    let dragId = null;
    A.on(el, '[data-drag]', 'dragstart', (e, x) => { dragId = x.dataset.drag; x.closest('.ph-card').classList.add('drag'); try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (er) {} });
    A.on(el, '[data-drag]', 'dragend', (e, x) => { x.closest('.ph-card').classList.remove('drag'); });
    el.querySelectorAll('.ph-card[data-pid]').forEach((cd) => { cd.addEventListener('dragover', (e) => { if (dragId) { e.preventDefault(); cd.classList.add('dropt'); } }); cd.addEventListener('dragleave', () => cd.classList.remove('dropt'));
      cd.addEventListener('drop', (e) => { cd.classList.remove('dropt'); if (!dragId || dragId === cd.dataset.pid) return; e.preventDefault(); const a = find(dragId), b2 = find(cd.dataset.pid); P.list.splice(P.list.indexOf(a), 1); P.list.splice(P.list.indexOf(b2), 0, a); dragId = null; redo(); }); });
    // video
    A.on(el, '#ph-vm button', 'click', (e, b) => { P.vmode = b.dataset.v; A.render(); });
    const vf = el.querySelector('#ph-vfile'); const vp = el.querySelector('#ph-vpick'); if (vp) vp.onclick = () => vf.click();
    const setVideo = (v) => { P.video = v; syncFlags(d); A.save(); A.render(); };
    const fin = (mb, dur) => Math.max(0.3, Math.min(mb * 0.9, Math.round(dur * MS().videoKbps / 8 / 1024 * 10) / 10));
    if (vf) vf.onchange = () => {
      const f = vf.files[0]; if (!f) return; const url = URL.createObjectURL(f); const vd = document.createElement('video'); vd.muted = true; vd.preload = 'metadata'; vd.src = url; let fired = false;
      const finish = (poster, dur) => { if (fired) return; fired = true; URL.revokeObjectURL(url); const mb = Math.max(0.1, Math.round(f.size / 1048576 * 10) / 10); setVideo({ kind: 'file', name: f.name, dur: Math.round(dur) || 15, origMB: mb, finalMB: fin(mb, dur || 15), poster }); A.toast(t('Video added and made light', 'ভিডিও যোগ ও হালকা করা হয়েছে'), 'good'); };
      vd.onloadedmetadata = () => { try { vd.currentTime = Math.min(1, (vd.duration || 2) / 2); } catch (e) { finish('', vd.duration); } };
      vd.onseeked = () => { let p = ''; try { const cv = document.createElement('canvas'); const k = Math.min(1, 420 / Math.max(vd.videoWidth, vd.videoHeight)); cv.width = Math.round(vd.videoWidth * k); cv.height = Math.round(vd.videoHeight * k); cv.getContext('2d').drawImage(vd, 0, 0, cv.width, cv.height); p = cv.toDataURL('image/jpeg', 0.7); } catch (e) {} finish(p, vd.duration); };
      vd.onerror = () => finish('', 15); setTimeout(() => finish('', vd.duration || 15), 4000);
    };
    const vs = el.querySelector('#ph-vsample'); if (vs) vs.onclick = () => setVideo({ kind: 'file', name: 'model-walk.mp4', dur: 15, origMB: 48.6, finalMB: fin(48.6, 15), poster: sampleSrc(d, c, { w: 800, h: 1000 }) });
    const vg = el.querySelector('#ph-vgo'); if (vg) vg.onclick = () => { const u = el.querySelector('#ph-vurl').value.trim(); const pv = parseVideo(u); if (!pv) return A.toast(t('Paste a YouTube, Vimeo or Facebook video link', 'YouTube, Vimeo বা Facebook ভিডিওর লিংক দিন'), 'bad'); setVideo({ kind: 'link', url: u, provider: pv.provider, embed: pv.embed, dur: 15, poster: sampleSrc(d, c, { w: 800, h: 1000 }) }); A.toast(t(`${pv.provider} video added`, `${pv.provider} ভিডিও যোগ হয়েছে`), 'good'); };
    const vl = el.querySelector('#ph-vdel'); if (vl) vl.onclick = () => { P.video = null; syncFlags(d); A.toast(t('Video removed', 'ভিডিও সরানো হয়েছে'), 'good'); A.save(); A.render(); };
    const vdur = el.querySelector('#ph-vdur'); if (vdur) vdur.oninput = () => { P.video.dur = +vdur.value || 0; A.save(); };
    const play = el.querySelector('#ph-vplay'); if (play) play.onclick = () => { const v = P.video; if (!v) return; if (v.kind === 'link') { play.outerHTML = `<div class="ph-poster" style="cursor:default"><iframe src="${A.esc(v.embed)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy" title="${A.esc(altVideo(d, v))}"></iframe></div>`; } else A.toast(t('The player loads only when a customer taps play.', 'কাস্টমার প্লে চাপলে তবেই প্লেয়ার লোড হয়।')); };
  }

  function renderAddWizard(el, r) {
    ensure2();
    if (r.id && A.byId(A.D.products, r.id) && (!A.D.pdraft || A.D.pdraft.pid !== r.id)) loadProduct(A.byId(A.D.products, r.id));
    const d = D0(); const s = d.step;
    // auto-fill Google text when arriving on step 7
    if (s === 7) { if (!d.slug) d.slug = slugify(d.name); if (!d.title) d.title = `${d.name} for Men | EXTAS`.slice(0, 60); if (!d.kw) d.kw = kwSuggest(d); if (!d.mdesc) d.mdesc = `${d.name} in ${shownColors(d).slice(0, 4).join(', ')}. ${d.det.fabric || ''}, ${String(d.fit).toLowerCase()} fit. Cash on delivery, 24–48 hours in Dhaka.`.replace(/\s+/g, ' ').slice(0, 160); }
    if (s === 6 && d.chartMode === 'new' && !d.nc) { const sz = isBottom(d.cat) ? BOT_SZ.slice(1, 6) : TOP_SZ.slice(1, 6); d.nc = { sizes: sz, rows: genRows(d.cat, sz) }; d.ncName = `${catNm(d.cat)} – ${d.fit}`; }
    const st = stepState(d); const doneN = st.slice(0, 7).filter((x) => x.ok).length;
    const left = st.slice(0, 7).filter((x) => !x.ok).map((x) => x.miss);
    el.innerHTML = A.pageHead(d.pid ? t('Edit product step by step', 'ধাপে ধাপে প্রোডাক্ট এডিট') : t('Add product', 'নতুন প্রোডাক্ট'), t('8 short steps. Every step saves by itself — leave any time and come back to the same place. The phone on the right shows what customers will see.', '8টা ছোট ধাপ। প্রতিটা ধাপ নিজে সেভ হয় — মাঝপথে ছেড়ে গেলে পরে ঠিক সেখান থেকে শুরু। ডানের ফোনে কাস্টমার যা দেখবেন তা দেখায়।'),
      `<button class="btn" id="wz-quick">${A.icon('down')}${t('Quick import', 'কুইক ইমপোর্ট')}</button><button class="btn ghost" id="wz-reset">${A.icon('reset')}${t('Start again', 'নতুন করে শুরু')}</button>`) + A.tabsBar('products', 'add') +
      `<div class="wz-top"><div class="wz-prog"><div class="small"><b>${t(`${doneN} of 8 steps done`, `8 ধাপের ${doneN}টা শেষ`)}</b>${left.length ? ` · ${t('Left', 'বাকি')}: ${left.join(', ')}` : ''}</div>${U.bar(doneN / 8 * 100, left.length ? 'var(--warn)' : 'var(--good)')}</div><span class="small muted" id="wz-saved">${A.icon('check')} ${d.savedAt ? t(`Saved ${A.fmt.ago(new Date(d.savedAt).toISOString())}`, `সেভ হয়েছে ${A.fmt.ago(new Date(d.savedAt).toISOString())}`) : t('Saves by itself', 'নিজে সেভ হয়')}</span></div>
      <div class="wz-steps">${STEPS.map((x, i) => `<button data-go="${i + 1}" class="${i + 1 === s ? 'on' : st[i].ok ? 'done' : i + 1 < s ? 'warn' : ''}"><b>${st[i].ok && i + 1 !== s ? '✓' : i + 1}</b>${t(x[0], x[1])}</button>`).join('')}</div>
      <div class="wz-grid"><div>${U.card(`${s} · ${t(STEPS[s - 1][0], STEPS[s - 1][1])}`, `<p class="wz-why">${t(WHY[s - 1][0], WHY[s - 1][1])}</p><div class="stack">${stepBody(d, s)}</div><div class="wz-nav"><button class="btn" id="wz-back" ${s === 1 ? 'disabled' : ''}>← ${t('Back', 'আগের ধাপ')}</button>${s < 8 ? `<button class="btn primary" id="wz-next">${t('Next', 'পরের ধাপ')} →</button>` : ''}</div>`, { sub: t(`Step ${s} of 8`, `ধাপ ${s} / 8`) })}</div>
      <div class="wz-side">${U.card(t('Phone preview', 'ফোনে যেমন দেখাবে'), `<div id="wz-pv">${phonePreview(d)}</div>`, { sub: t('Changes as you type', 'লিখলেই বদলায়') })}</div></div>`;
    const $ = (q) => el.querySelector(q);
    const touch = (rerender) => { d.savedAt = Date.now(); A.save(); if (rerender) { A.render(); return; } $('#wz-pv').innerHTML = phonePreview(d); wirePv(); $('#wz-saved').innerHTML = `${A.icon('check')} ${t('Saved just now', 'এইমাত্র সেভ হয়েছে')}`; liveBits(); };
    const wirePv = () => A.on(el, '[data-pvc]', 'click', (e, b) => { wzu.pv = b.dataset.pvc; $('#wz-pv').innerHTML = phonePreview(d); wirePv(); });
    wirePv();
    function liveBits() {
      if (s === 5) { const pr = +d.price || 0, c = setCost(d), m = marginOf(pr, c); $('#wz-profit').innerHTML = pr ? `${A.fmt.tk(pr - c)} · ${marginBadge(m)}` : '—'; $('#wz-pwarn').innerHTML = pr && pr <= c ? U.callout(t('Selling price is below the buying price.', 'বিক্রির দাম কেনা দামের নিচে।'), 'bad', 'warn') : pr && m < A.D.pset.minMargin ? U.callout(t(`Profit is below your ${A.D.pset.minMargin}% minimum. After courier, COD fee and packing little is left.`, `লাভ আপনার ${A.D.pset.minMargin}% সীমার নিচে। কুরিয়ার, COD চার্জ ও প্যাকিংয়ের পর খুব কম থাকে।`), 'warn', 'warn') : ''; }
      if (s === 6 && $('#wz-dc')) $('#wz-dc').textContent = t(`${(d.desc || '').length} letters`, `${(d.desc || '').length} অক্ষর`);
      if (s === 7) {
        $('#wz-tc').textContent = `${(d.title || '').length}/60`; $('#wz-mc').textContent = `${(d.mdesc || '').length}/160`;
        $('#wz-gp').innerHTML = `<div class="u">extas.com.bd › ${A.esc((A.byId(A.CATS, d.cat) || {}).id || '')} › ${A.esc(d.slug)}</div><div class="ti">${A.esc(d.title || d.name)}</div><div class="de">${d.price ? A.fmt.tk(+d.price) + ' · ' : ''}${t('In stock', 'স্টকে আছে')} · ${A.esc((d.mdesc || '').slice(0, 150))}${(d.mdesc || '').length > 150 ? '…' : ''}</div>`;
        const sc = wzSeo(d); $('#wz-seo').innerHTML = `<div class="row between"><b>${t('SEO score', 'SEO স্কোর')}: ${sc.s}/100</b>${U.badge(sc.s >= 80 ? t('Good', 'ভালো') : sc.s >= 60 ? t('OK', 'চলবে') : t('Weak', 'দুর্বল'), sc.s >= 80 ? 'good' : sc.s >= 60 ? 'warn' : 'bad')}</div>${U.bar(sc.s, sc.s >= 80 ? 'var(--good)' : 'var(--warn)')}<div style="margin-top:6px">${sc.tips.map((x) => `<div class="wz-ck ${x.ok ? 'ok' : 'no'}"><span class="i">${x.ok ? '✓' : '!'}</span><span>${x.l}</span></div>`).join('')}</div>`;
      }
    }
    liveBits();
    if (s === 4) wirePhotos(el, d, touch);
    // generic inputs
    A.on(el, '[data-f]', 'input', (e, i) => { const k = i.dataset.f; d[k] = i.dataset.num ? i.value : i.value; if (k === 'price') d.priceOk = false; if (k === 'brand' && !d.pid) d.name = suggestName(d); touch(k === 'brand'); });
    A.on(el, 'select[data-f]', 'change', (e, i) => { d[i.dataset.f] = i.value; touch(i.dataset.f === 'brand'); });
    A.on(el, '[data-det]', 'input', (e, i) => { d.det[i.dataset.det] = i.value; touch(); });
    A.on(el, '[data-cname]', 'input', (e, i) => { d.cname[i.dataset.cname] = i.value; touch(); });
    A.on(el, '[data-model]', 'input', (e, i) => { d.model[i.dataset.model] = i.value; touch(); });
    A.on(el, 'select[data-model]', 'change', (e, i) => { d.model.size = i.value; touch(); });
    A.on(el, '[data-fn]', 'input', (e, i) => { const [ix, k] = i.dataset.fn.split('-'); d.finder[+ix][k] = k[0] === 'w' ? +i.value || 0 : i.value; touch(); });
    A.on(el, '[data-ncv]', 'input', (e, i) => { const [ri, vi] = i.dataset.ncv.split('-').map(Number); const v = +i.value || 0; d.nc.rows[ri].vals[vi] = wzu.unit === 'in' ? v : Math.round(v / 2.54 * 4) / 4; touch(); });
    A.on(el, '[data-go]', 'click', (e, b) => { d.step = +b.dataset.go; touch(true); });
    A.on(el, '#wz-kind button', 'click', (e, b) => { d.kind = b.dataset.v; touch(true); });
    A.on(el, '#wz-link button', 'click', (e, b) => { d.link = b.dataset.v; touch(true); });
    A.on(el, '#wz-cm button', 'click', (e, b) => { d.chartMode = b.dataset.v; if (d.chartMode === 'saved' && !d.chartId) { const c = A.D.sizeCharts.find((x) => x.cats.includes(d.cat)) || A.D.sizeCharts[0]; d.chartId = c.id; } touch(true); });
    A.on(el, '#wz-unit button', 'click', (e, b) => { wzu.unit = b.dataset.v; A.render(); });
    A.on(el, '[data-ncsz]', 'click', (e, b) => { const z = b.dataset.ncsz; const all = allSizesFor(d.cat); const cur = d.nc.sizes.includes(z) ? d.nc.sizes.filter((x) => x !== z) : all.filter((x) => d.nc.sizes.includes(x) || x === z); if (!cur.length) return; const old = d.nc; const fresh = genRows(d.cat, cur); d.nc = { sizes: cur, rows: fresh.map((r, ri) => ({ point: r.point, vals: cur.map((zz, k) => { const oi = old.sizes.indexOf(zz); return oi >= 0 && old.rows[ri] ? old.rows[ri].vals[oi] : r.vals[k]; }) })) }; touch(true); });
    A.on(el, '[data-style]', 'change', (e, i) => { const code = i.dataset.style; if (A.D.products.find((p) => p.styleCode === code)) { A.toast(t('This style is already on the shop — opening it', 'এই স্টাইল আগেই দোকানে আছে — খুলছি')); return; } loadStyle(d, A.D.erp.notImported.find((x) => x.styleCode === code)); touch(true); A.toast(t(`${code} brought in from the ERP`, `${code} ERP থেকে আনা হলো`), 'good'); });
    A.on(el, '[data-tagx]', 'click', (e, b) => { const x = b.dataset.tagx; d.tags = d.tags.includes(x) ? d.tags.filter((y) => y !== x) : d.tags.concat(x); touch(true); });
    A.on(el, '[data-hsz]', 'change', (e, i) => { const z = i.dataset.hsz; d.hideSz = i.checked ? d.hideSz.filter((x) => x !== z) : d.hideSz.concat(z); touch(); });
    A.on(el, '[data-showc]', 'change', (e, i) => { d.show[i.dataset.showc] = i.checked; touch(true); });
    A.on(el, '[data-pcol]', 'click', (e, b) => { wzu.pcol = b.dataset.pcol; wzu.pv = b.dataset.pcol; A.render(); });
    A.on(el, '[data-dfaq]', 'click', (e, b) => { d.faqs.splice(+b.dataset.dfaq, 1); touch(true); });
    const on = (id, fn) => { const x = $(id); if (x) x.onclick = fn; };
    const sw = (id, k) => { const x = $(id); if (x) x.onchange = () => { d[k] = x.checked; touch(); }; };
    sw('#wz-bg', 'bgrade'); sw('#wz-video', 'video'); sw('#wz-combo', 'inCombos'); sw('#wz-ncsave', 'ncSave');
    const q = $('#wz-q'); if (q) q.oninput = () => { wzu.q = q.value; const pos = q.selectionStart; A.render(); const n = el.querySelector('#wz-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    const bot = $('#wz-bot'); if (bot) bot.onchange = () => { d.botPid = bot.value; d.priceOk = false; touch(true); };
    const cat = $('#wz-cat'); if (cat) cat.onchange = () => { d.cat = cat.value; d.sub = SUBS[d.cat][0]; d.det = Object.fromEntries((DET[d.cat] || []).map((x) => [x[0], x[3]])); d.nc = null; touch(true); };
    const chs = $('#wz-chart'); if (chs) chs.onchange = () => { d.chartId = chs.value; touch(true); };
    on('#wz-noerp', () => { Object.assign(d, { code: `EXT-NEW-${String(A.D.products.length + 1).padStart(4, '0')}`, manual: true, erpName: t('New style (not in the ERP yet)', 'নতুন স্টাইল (এখনো ERP-তে নেই)'), cat: 'polo', colors: ['Navy', 'Black'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], cost: 0, name: '', sub: SUBS.polo[0], det: Object.fromEntries(DET.polo.map((x) => [x[0], x[3]])), finder: defFinder(['S', 'M', 'L', 'XL', 'XXL']) }); d.variants = []; d.colors.forEach((c) => { d.cname[c] = c; d.photos[c] = [false, false, false, false]; d.sizes.forEach((z) => d.variants.push({ sku: `${d.code}-${c.slice(0, 3).toUpperCase()}-${z}`, color: c, size: z, stock: 0, reserved: 0 })); }); wzu.pv = 'Navy'; wzu.pcol = 'Navy'; d.step = 2; touch(true); A.toast(t('Started without the ERP — stock shows 0 for now', 'ERP ছাড়া শুরু হলো — আপাতত স্টক 0'), 'good'); });
    on('#wz-ai', () => { d.desc = `A clean, everyday ${String(d.sub || catNm(d.cat)).toLowerCase()} in ${d.det.fabric || 'soft cotton'}. ${d.fit} fit that stays neat after many washes. Made for Bangladeshi weather — breathable, easy to iron, and comfortable from office to evening.`; if (!d.points) d.points = [d.det.fabric, `${d.fit} fit`, d.det.collar || d.det.neck || d.det.rise, 'Machine wash cold'].filter(Boolean).join(' · '); touch(true); A.toast(t('Draft written — read it and change what you like', 'খসড়া লেখা হলো — পড়ে যা চান বদলান'), 'good'); });
    on('#wz-addfaq', () => { const fq = $('#wz-fq').value.trim(), fa = $('#wz-fa').value.trim(); if (!fq || !fa) { A.toast(t('Write both the question and the answer', 'প্রশ্ন ও উত্তর দুটোই লিখুন'), 'bad'); return; } d.faqs.push({ q: fq, a: fa }); touch(true); A.toast(t('Question added', 'প্রশ্ন যোগ হলো'), 'good'); });
    on('#wz-pin', () => { const pr = +d.price || 0; if (pr <= setCost(d)) { A.toast(t('Selling price must be above the buying price', 'বিক্রির দাম কেনা দামের বেশি হতে হবে'), 'bad'); return; } pinConfirm(t('Confirm price', 'দাম কনফার্ম করুন'), `<div class="list"><div class="li"><span class="grow">${t('Selling price', 'বিক্রির দাম')}</span><b>${A.fmt.tk(pr)}</b></div><div class="li"><span class="grow">${t('Profit per piece', 'প্রতি পিসে লাভ')}</span>${A.fmt.tk(pr - setCost(d))} · ${marginBadge(marginOf(pr, setCost(d)))}</div></div>`, t('Confirm price', 'দাম কনফার্ম'), () => { d.priceOk = true; touch(true); A.commit(`Price confirmed for ${d.name}`); A.toast(t('Price confirmed', 'দাম কনফার্ম হলো'), 'good'); }); });
    on('#wz-back', () => { d.step = Math.max(1, s - 1); touch(true); });
    on('#wz-next', () => { if (s === 1 && !d.code) { A.toast(t('Pick a style from the ERP first', 'আগে ERP থেকে একটা স্টাইল বাছুন'), 'bad'); return; } if (s === 1 && d.kind === 'set' && !d.botPid) { A.toast(t('Pick the bottom piece of the set', 'সেটের নিচের পিস বাছুন'), 'bad'); return; } if (s === 2 && (d.name || '').trim().length < 3) { A.toast(t('Write the name on site', 'সাইটের নাম লিখুন'), 'bad'); return; } d.step = s + 1; touch(true); });
    on('#wz-reset', () => U.confirm(t('Start a new product?', 'নতুন প্রোডাক্ট শুরু করবেন?'), t('This draft is cleared. Products already saved stay as they are.', 'এই খসড়া মুছে নতুন শুরু হবে। আগে সেভ করা প্রোডাক্ট যেমন আছে থাকবে।'), t('Start again', 'নতুন করে শুরু'), () => { A.D.pdraft = newDraft(); A.commit('Add product: started again'); A.go('products', 'add'); }));
    on('#wz-quick', () => quickImport());
    A.on(el, '#wz-hidedemo', 'change', (e, i) => { d.hideDemo = i.checked; touch(); });
    on('#wz-pub', () => saveProduct(d, 'live'));
    on('#wz-draft', () => saveProduct(d, 'draft'));
    on('#wz-sch', () => { const m = U.modal(t('Schedule publishing', 'পাবলিশের সময় ঠিক করুন'), U.field(t('Goes live on', 'লাইভ হবে'), `<input class="inp" type="datetime-local" id="wz-when" value="${A.fmt.ymd(A.TODAY.getTime() + DAY)}T10:00">`, t('Good for launching a new collection all at once.', 'নতুন কালেকশন একসাথে ছাড়তে কাজে লাগে।')), { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="wz-schok">${t('Schedule', 'শিডিউল')}</button>` }); m.querySelector('#wz-schok').onclick = () => { const v = m.querySelector('#wz-when').value; if (!v) return; U.close(); saveProduct(d, 'scheduled', v); }; });
  }
  function saveProduct(d, status, when) {
    const sc = shownColors(d); const isNew = !d.pid; const p = isNew ? { id: nextId(), created: A.TODAY.toISOString(), rating: 0, reviews: 0, pin: false, views30: 0, carts30: 0, sold30: 0, revenue30: 0, tags: [] } : A.byId(A.D.products, d.pid);
    let chartId = d.chartMode === 'saved' ? d.chartId : null;
    if (d.chartMode === 'new' && d.nc && d.ncSave) { const nc = { id: A.uid('SC'), name: d.ncName || `${catNm(d.cat)} chart`, cat: d.cat, cats: [], sizes: d.nc.sizes.slice(), rows: d.nc.rows.map((r) => ({ point: r.point, vals: r.vals.slice() })), finder: d.finder.map((f) => Object.assign({}, f)), fit: d.fit, run: d.run, updated: A.TODAY.toISOString() }; A.D.sizeCharts.push(nc); chartId = nc.id; }
    const photos = A.sum(sc, (c) => photosOf(d, c));
    Object.assign(p, { styleCode: d.code, name: d.name.trim(), cat: d.cat, sub: d.sub, brand: d.brand, kind: d.kind, botPid: d.kind === 'set' ? d.botPid : '', price: Math.round(+d.price || 0), compareAt: Math.round(+d.compareAt || 0) || null, cost: setCost(d), colors: sc, sizes: shownSizes(d), variants: d.variants.filter((v) => sc.includes(v.color)), status: status === 'scheduled' ? 'scheduled' : status, scheduleAt: when || null, photos, photoMap: JSON.parse(JSON.stringify(d.photos)), video: d.video, source: d.manual ? 'Manual' : 'ERP', erpSyncedAt: d.manual ? null : A.TODAY.toISOString(), fabric: d.det.fabric || d.det.shell || d.det.material || '', det: Object.assign({}, d.det), fit: d.fit, run: d.run, desc: d.desc, points: d.points, collections: d.tags.slice(), bgrade: d.bgrade, inCombos: d.inCombos, sizeChartId: chartId, chartSource: d.chartMode, finder: d.finder.map((f) => Object.assign({}, f)), model: Object.assign({}, d.model), seo: { title: d.title || `${d.name} | EXTAS`, desc: d.mdesc, slug: d.slug || slugify(d.name), kw: d.kw, score: wzSeo(d).s } });
    if (isNew) A.D.products.push(p);
    d.faqs.forEach((f) => A.D.faqs.push({ id: A.uid('F'), scope: 'product', pid: p.id, q: f.q, a: f.a, on: true }));
    if (d.kind === 'set' && isNew) A.D.sets.push({ id: A.uid('ST'), name: p.name, topPid: p.id, botPid: d.botPid, link: d.link, price: p.price, sold30: 0, status: status === 'live' ? 'on' : 'off' });
    A.D.erp.notImported = A.D.erp.notImported.filter((x) => x.styleCode !== d.code);
    if (isNew) A.D.erpEvents.unshift({ t: A.TODAY.toISOString(), kind: 'product', text: `Added from ERP: ${d.code} (${sc.length} colours, ${p.variants.length} SKUs)`, ok: true });
    let demoMsg = ''; if (status !== 'draft' && A.demo && demoHide(d) && demoData().items.some((it) => it.cat === d.cat && demoShown(it))) { demoData().off[d.cat] = 1; demoMsg = t(' · demo products in this category hidden', ' · এই ক্যাটাগরির ডেমো প্রোডাক্ট লুকানো হলো'); }
    A.D.pdraft = newDraft();
    const msg0 = status === 'live' ? t(`${p.name} is now on the shop`, `${p.name} এখন দোকানে লাইভ`) : status === 'scheduled' ? t(`${p.name} will go live on ${A.fmt.dt(when)}`, `${p.name} লাইভ হবে ${A.fmt.dt(when)}`) : t(`${p.name} saved as draft — All products shows what is left`, `${p.name} খসড়া হিসেবে সেভ — কী বাকি All products-এ দেখাবে`);
    const msg = msg0 + demoMsg;
    A.commit(`${isNew ? 'Added' : 'Updated'} product ${p.name} (${status})`); A.toast(msg, 'good'); A.go('products', 'all', p.id);
  }

  /* ---------- Quick import popup (All products) ---------- */
  function quickImport() {
    ensure2(); const ni = A.D.erp.notImported;
    const m = U.modal(t('Quick import', 'কুইক ইমপোর্ট'), `<p class="small muted" style="margin-top:0">${t('Paste style codes. Each one becomes a draft with everything from the ERP. Finish them later in Add product.', 'স্টাইল কোড দিন। প্রতিটা ERP-র সব তথ্যসহ খসড়া হবে। পরে Add product-এ বাকিটা পূরণ করুন।')}</p>${U.field(t('Style codes', 'স্টাইল কোড'), `<textarea class="inp" id="qi-codes" rows="3">${ni.slice(0, 3).map((x) => x.styleCode).join(', ')}</textarea>`, t(`Not on the shop yet: ${ni.map((x) => x.styleCode).join(', ') || '—'}`, `এখনো দোকানে নেই: ${ni.map((x) => x.styleCode).join(', ') || '—'}`))}<div id="qi-res" class="small" style="margin-top:8px"></div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="qi-ok">${t('Import as drafts', 'খসড়া হিসেবে আনুন')}</button>` });
    const parse = () => { const codes = [...new Set(m.querySelector('#qi-codes').value.toUpperCase().split(/[\s,;]+/).filter(Boolean))]; return { found: codes.map((c) => ni.find((x) => x.styleCode === c)).filter(Boolean), dup: codes.filter((c) => A.D.products.some((p) => p.styleCode === c)), bad: codes.filter((c) => !ni.find((x) => x.styleCode === c) && !A.D.products.some((p) => p.styleCode === c)) }; };
    const upd = () => { const r = parse(); const skus = A.sum(r.found, (x) => erpPreview(x).variants.length); m.querySelector('#qi-res').innerHTML = `<b>${t(`${r.found.length} styles found · ${skus} SKUs`, `${r.found.length}টি স্টাইল পাওয়া গেছে · ${skus}টি SKU`)}</b>${r.dup.length ? `<div style="color:var(--warn)">${t(`Already on the shop: ${r.dup.join(', ')}`, `আগেই দোকানে আছে: ${r.dup.join(', ')}`)}</div>` : ''}${r.bad.length ? `<div style="color:var(--bad)">${t(`Not in the ERP: ${r.bad.join(', ')}`, `ERP-তে নেই: ${r.bad.join(', ')}`)}</div>` : ''}`; };
    m.querySelector('#qi-codes').oninput = upd; upd();
    m.querySelector('#qi-ok').onclick = () => {
      const r = parse(); if (!r.found.length) { A.toast(t('No new style code found', 'নতুন কোনো স্টাইল কোড পাওয়া যায়নি'), 'bad'); return; }
      r.found.forEach((it) => { const pv = erpPreview(it); const fab = (DET[pv.cat] || [[0, 0, 0, '']])[0][3]; A.D.products.push({ id: nextId(), styleCode: it.styleCode, name: it.name, cat: pv.cat, price: it.price, compareAt: null, cost: it.cost, colors: pv.colors, sizes: pv.sizes, variants: pv.variants, status: 'draft', photos: 1, source: 'ERP', erpSyncedAt: A.TODAY.toISOString(), created: A.TODAY.toISOString(), fabric: fab, fit: 'Regular', desc: '', tags: [], rating: 0, reviews: 0, seo: { title: '', desc: '', slug: slugify(it.name), score: 40 }, pin: false, views30: 0, carts30: 0, sold30: 0, revenue30: 0 }); A.D.erpEvents.unshift({ t: A.TODAY.toISOString(), kind: 'product', text: `Quick import from ERP: ${it.styleCode}`, ok: true }); });
      A.D.erp.notImported = ni.filter((x) => !r.found.includes(x)); U.close(); st.status = 'draft';
      A.commit(`Quick import: ${r.found.length} drafts`); A.toast(t(`${r.found.length} drafts made — finish them in Add product`, `${r.found.length}টি খসড়া তৈরি — Add product-এ শেষ করুন`), 'good'); A.go('products', 'all');
    };
  }

  /* ================= STOCK ================= */
  const sst = { q: '', f: 'all' };
  function renderStock(el) {
    ensure(); const res = reservedMap();
    const live = A.D.products.filter((p) => p.status === 'live');
    const pcs = A.sum(live, stockOf); const val = A.sum(live, (p) => stockOf(p) * p.cost);
    const reserved = A.sum(Object.values(res)); const low = C.lowStock(2); const out = low.filter((x) => x.v.stock === 0);
    const lowP = live.filter((p) => p.variants.some((v) => v.stock <= 2)).map((p) => ({ p, days: C.stockDays(p), sizes: p.variants.filter((v) => v.stock <= 2) })).sort((a, b) => a.days - b.days || b.p.sold30 - a.p.sold30);
    const mins = Math.round((A.TODAY - new Date(A.D.erp.lastStockSync)) / 6e4); const next = Math.max(1, 60 - mins);
    const dead = live.filter((p) => !p.sold30 && stockOf(p) > 30);
    el.innerHTML = A.pageHead(t('Stock', 'স্টক'), t('Stock lives in the ERP warehouse. The shop shows it and holds pieces for open orders.', 'স্টক থাকে ERP এর গুদামে। সাইট সেটাই দেখায় আর খোলা অর্ডারের জন্য পিস আটকে রাখে।'), `<button class="btn" id="sk-exp">${A.icon('down')}${t('Download stock list', 'স্টক লিস্ট ডাউনলোড')}</button>`) + A.tabsBar('products', 'stock') +
      `<div class="grid g5" style="margin-bottom:14px">${U.kpi({ label: t('Pieces on the shop', 'সাইটের পিস'), value: A.fmt.num(pcs) })}${U.kpi({ label: t('Stock value (buying price)', 'স্টকের দাম (কেনা দামে)'), value: A.fmt.tkShort(val) })}${U.kpi({ label: t('Held for open orders', 'খোলা অর্ডারে আটকানো'), value: A.fmt.num(reserved) + t(' pcs', ' পিস'), sub: t('not yet handed to courier', 'এখনো কুরিয়ারে যায়নি') })}${U.kpi({ label: t('Sizes almost out', 'সাইজ প্রায় শেষ'), value: low.length, sub: t('2 or fewer left', '2 বা তার কম') })}${U.kpi({ label: t('Sizes sold out', 'সাইজ শেষ'), value: out.length })}</div>
      <div class="grid g3">
        ${U.card(t('ERP stock sync', 'ERP স্টক সিংক'), `<div class="list"><div class="li"><span class="grow">${t('Last sync', 'শেষ সিংক')}</span><b>${syncAgo()}</b></div><div class="li"><span class="grow">${t('Next sync', 'পরের সিংক')}</span><b>${t(`in ${next} min`, `${next} মিনিট পরে`)}</b></div><div class="li"><span class="grow">${t('Warehouse', 'গুদাম')}</span>${A.esc(A.D.erp.warehouse)}</div></div><button class="btn primary" id="sk-sync" style="margin-top:10px">${A.icon('sync')}${t('Sync now', 'এখনই সিংক করুন')}</button><div class="muted small" style="margin-top:10px">${A.D.erpEvents.filter((e) => e.kind === 'stock' || e.kind === 'restock').slice(0, 3).map((e) => `${A.fmt.ago(e.t)} · ${A.esc(e.text)}`).join('<br>')}</div>`)}
        <div class="span2">${U.card(t('Running out soon', 'শিগগিরই শেষ হবে'), lowP.length ? `<div class="list">${lowP.slice(0, 8).map(({ p, days, sizes }) => `<div class="li" style="flex-wrap:wrap"><div class="cellmain grow" style="min-width:200px">${U.thumb(p, 32)}<div style="min-width:0"><b class="ellip" style="display:block">${A.esc(p.name)}</b><span class="small muted">${sizes.slice(0, 4).map((v) => `${v.color} ${v.size}: <b style="color:${v.stock ? 'var(--warn)' : 'var(--bad)'}">${v.stock}</b>`).join(' · ')}${sizes.length > 4 ? ` +${sizes.length - 4}` : ''}</span></div></div>${U.badge(days >= 999 ? t('no sales', 'বিক্রি নেই') : t(`${days} days left`, `${days} দিন চলবে`), days <= 14 ? 'bad' : days <= 30 ? 'warn' : '')}${p.restockAsked ? U.badge(t('Asked ERP', 'ERP কে বলা হয়েছে'), 'info') : `<button class="btn sm" data-rs="${p.id}">${t('Ask ERP to restock', 'ERP কে রিস্টক বলুন')}</button>`}</div>`).join('')}</div>` : U.empty(t('No size is running low', 'কোনো সাইজ কমে আসেনি')), { sub: t('Days left = stock ÷ daily sales of the last 30 days', 'কত দিন চলবে = স্টক ÷ গত 30 দিনের দৈনিক বিক্রি') })}</div>
      </div>
      ${dead.length ? U.callout(t(`${dead.length} products have more than 30 pieces but sold nothing in 30 days (${A.fmt.tk(A.sum(dead, (p) => stockOf(p) * p.cost))} stuck at buying price). Try a combo or a discount.`, `${dead.length}টি প্রোডাক্টে 30 এর বেশি পিস আছে কিন্তু 30 দিনে কিছুই বিক্রি হয়নি (কেনা দামে ${A.fmt.tk(A.sum(dead, (p) => stockOf(p) * p.cost))} আটকে)। কম্বো বা ছাড় দিয়ে দেখুন।`), 'warn', 'warn') : ''}
      <div class="card" style="margin-top:14px"><div class="card-h"><div><h3>${t('Stock by product', 'প্রোডাক্ট অনুযায়ী স্টক')}</h3><div class="sub">${t('Tap a product to see every colour and size', 'প্রতিটা কালার ও সাইজ দেখতে প্রোডাক্টে চাপুন')}</div></div></div><div class="prd-tools"><input class="inp" id="sk-q" placeholder="${t('Search product or style code', 'প্রোডাক্ট বা স্টাইল কোড খুঁজুন')}" value="${A.esc(sst.q)}"><div class="chips">${[['all', t('All', 'সব')], ['low', t('Low', 'কম')], ['out', t('Has sold-out sizes', 'কোনো সাইজ শেষ')]].map((c) => `<button class="chip ${sst.f === c[0] ? 'on' : ''}" data-sf="${c[0]}">${c[1]}</button>`).join('')}</div></div><div id="sk-list"></div></div>`;
    const draw = () => {
      const s = sst.q.toLowerCase();
      const rows = live.filter((p) => (!s || p.name.toLowerCase().includes(s) || p.styleCode.toLowerCase().includes(s)) && (sst.f === 'all' || (sst.f === 'low' ? isLow(p) : p.variants.some((v) => !v.stock)))).sort((a, b) => C.stockDays(a) - C.stockDays(b));
      el.querySelector('#sk-list').innerHTML = U.table([
        { h: t('Product', 'প্রোডাক্ট'), f: (p) => `<div class="cellmain">${U.thumb(p, 30)}<div style="min-width:0"><b class="ellip" style="max-width:220px">${A.esc(p.name)}</b><span class="muted small mono">${p.styleCode}</span></div></div>` },
        { h: t('Stock', 'স্টক'), r: true, f: (p) => `<span class="${isLow(p) ? 'prd-low' : ''}">${stockOf(p)}</span>` },
        { h: t('Held', 'আটকানো'), r: true, hide: true, f: (p) => A.sum(p.variants, (v) => res[v.sku] || 0) || '—' },
        { h: t('Sold 30d', '30 দিনে বিক্রি'), r: true, hide: true, f: (p) => p.sold30 },
        { h: t('Days left', 'কত দিন'), r: true, f: (p) => { const d = C.stockDays(p); return d >= 999 ? '—' : `<span style="color:${d <= 14 ? 'var(--bad)' : d <= 30 ? 'var(--warn)' : 'inherit'}">${d}</span>`; } },
        { h: t('Value', 'দাম'), r: true, hide: true, f: (p) => A.fmt.tk(stockOf(p) * p.cost) },
      ], rows.slice(0, 60).map((p) => Object.assign({}, p, { _id: p.id })), { onRow: true });
      el.querySelectorAll('#sk-list tr.click').forEach((tr) => (tr.onclick = () => heat(A.byId(A.D.products, tr.dataset.row), res)));
    };
    el.querySelector('#sk-q').oninput = (e) => { sst.q = e.target.value; draw(); };
    A.on(el, '[data-sf]', 'click', (e, b) => { sst.f = b.dataset.sf; el.querySelectorAll('[data-sf]').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
    draw();
    el.querySelector('#sk-exp').onclick = () => U.download('stock-list.csv');
    el.querySelector('#sk-sync').onclick = () => { A.D.erp.lastStockSync = A.TODAY.toISOString(); const ch = 3 + (A.D.erpEvents.length % 7); A.D.erpEvents.unshift({ t: A.TODAY.toISOString(), kind: 'stock', text: `Stock pulled from ERP · 1,318 SKUs · ${ch} changed`, ok: true }); A.D.products.forEach((p) => { if (p.source === 'ERP') p.erpSyncedAt = A.TODAY.toISOString(); }); A.commit('Stock synced from ERP'); A.toast(t(`Stock synced from the ERP · ${ch} sizes changed`, `ERP থেকে স্টক সিংক হলো · ${ch}টি সাইজ বদলেছে`), 'good'); A.render(); };
    A.on(el, '[data-rs]', 'click', (e, b) => { const p = A.byId(A.D.products, b.dataset.rs); const sz = p.variants.filter((v) => v.stock <= 2).map((v) => `${v.color} ${v.size}`); p.restockAsked = true; A.D.erpEvents.unshift({ t: A.TODAY.toISOString(), kind: 'restock', text: `Restock request sent to ERP: ${p.styleCode} · ${sz.slice(0, 4).join(', ')}${sz.length > 4 ? ' +' + (sz.length - 4) : ''}`, ok: true }); A.commit(`Asked ERP to restock ${p.styleCode}`); A.toast(t('Restock request sent to the ERP', 'ERP তে রিস্টকের অনুরোধ গেছে'), 'good'); A.render(); });
  }
  function heat(p, res) {
    const cell = (v) => { const c = v.stock === 0 ? 'prd-h0' : v.stock <= 3 ? 'prd-h1' : v.stock <= 12 ? 'prd-h2' : 'prd-h3'; return `<td class="${c}">${v.stock}${res[v.sku] ? `<div style="font-size:10px;font-weight:400">${t(`${res[v.sku]} held`, `${res[v.sku]} আটকানো`)}</div>` : ''}</td>`; };
    U.modal(A.esc(p.name), `<div class="muted small" style="margin-bottom:8px">${p.styleCode} · ${t(`synced from ERP ${syncAgo()}`, `ERP থেকে সিংক ${syncAgo()}`)} · ${t(`${C.stockDays(p) >= 999 ? '—' : C.stockDays(p)} days of stock`, `${C.stockDays(p) >= 999 ? '—' : C.stockDays(p)} দিনের স্টক`)}</div><div class="tbl-wrap"><table class="prd-heat"><tr><th></th>${p.sizes.map((s) => `<th>${s}</th>`).join('')}<th>${t('Total', 'মোট')}</th></tr>${p.colors.map((c) => `<tr><th style="text-align:left">${U.sw(c)} ${c}</th>${p.sizes.map((s) => { const v = p.variants.find((x) => x.color === c && x.size === s); return v ? cell(v) : '<td>—</td>'; }).join('')}<th>${A.sum(p.variants.filter((v) => v.color === c), (v) => v.stock)}</th></tr>`).join('')}</table></div><div class="legend" style="margin-top:10px"><span><i class="dotk" style="background:var(--bad)"></i>${t('Sold out', 'শেষ')}</span><span><i class="dotk" style="background:var(--warn)"></i>${t('3 or fewer', '3 বা কম')}</span><span><i class="dotk" style="background:var(--good)"></i>${t('Healthy', 'যথেষ্ট')}</span></div>`,
      { wide: true, foot: `<a class="btn" href="${A.href('products', 'all', p.id)}" data-close>${t('Open product', 'প্রোডাক্ট খুলুন')}</a>` });
  }

  /* ================= SHOP RANKING ================= */
  function scoreAll() {
    const w = A.D.pset.weights; const tw = A.sum(Object.values(w)) || 1;
    const live = A.D.products.filter((p) => p.status === 'live');
    const mx = (f) => Math.max(0.0001, ...live.map(f));
    const conv = (p) => (p.views30 ? p.sold30 / p.views30 : 0);
    const ms = mx((p) => p.sold30), mc = mx(conv), mm = mx(pm);
    const out = live.map((p) => {
      const inStock = p.variants.filter((v) => v.stock > 0).length / p.variants.length; const sd = Math.min(1, C.stockDays(p) / 30);
      const age = (A.TODAY - new Date(p.created)) / DAY;
      const parts = { sales: p.sold30 / ms, conv: conv(p) / mc, margin: Math.max(0, pm(p)) / mm, stock: inStock * 0.6 + sd * 0.4, fresh: Math.max(0, 1 - age / 120) };
      const score = Object.keys(w).reduce((s, k) => s + w[k] * parts[k], 0) / tw * 100;
      return { p, score, parts };
    });
    const grp = (x) => (x.p.pin === 'top' ? 0 : x.p.pin === 'down' ? 2 : 1);
    out.sort((a, b) => grp(a) - grp(b) || b.score - a.score);
    out.forEach((x, i) => (x.rank = i + 1));
    return out;
  }
  function renderRanking(el) {
    const ps = ensure();
    if (!ps.baseRanks) { ps.baseRanks = {}; scoreAll().forEach((x) => (ps.baseRanks[x.p.id] = x.rank)); A.save(); }
    const W = [['sales', t('Sales in 30 days', '30 দিনের বিক্রি')], ['conv', t('Visitors who buy', 'দেখে কেনার হার')], ['margin', t('Margin', 'মার্জিন')], ['stock', t('Stock health (sizes in stock)', 'স্টকের অবস্থা (সাইজ আছে কিনা)')], ['fresh', t('Newness', 'নতুনত্ব')]];
    el.innerHTML = A.pageHead(t('Shop ranking', 'দোকানে সাজানো'), t('The order products show in on your own shop — collections, category pages and search. Not Google.', 'আপনার নিজের সাইটে প্রোডাক্ট কোন ক্রমে দেখাবে — কালেকশন, ক্যাটাগরি পেজ ও সার্চ। গুগল নয়।'), `<a class="btn" href="${A.href('website', 'seo')}">${A.icon('website')}${t('Google ranking →', 'গুগল র‍্যাঙ্কিং →')}</a><button class="btn primary" id="rk-save">${t('Save this order', 'এই ক্রম সেভ করুন')}</button>`) + A.tabsBar('products', 'ranking') +
      `<div class="card" style="margin-bottom:14px"><div class="card-h"><div><h3>${t('How shop ranking works', 'দোকানে সাজানো কীভাবে কাজ করে')}</h3><div class="sub">${t('This is only the order on your own shop — category pages, collections and search. Google is separate.', 'এটা শুধু আপনার নিজের দোকানের ক্রম — ক্যাটাগরি পেজ, কালেকশন ও সার্চ। Google আলাদা।')}</div></div></div><div class="rk-how">
        <div><b class="n">1</b><b>${t('Every product gets a score', 'প্রতিটা প্রোডাক্ট স্কোর পায়')}</b><p class="small muted" style="margin:6px 0 0">${t('0 to 100, from five things: sales, how many visitors buy, profit, sizes in stock and how new it is. The sliders below decide how much each counts.', '0 থেকে 100, পাঁচটা জিনিস থেকে: বিক্রি, দেখে কতজন কেনে, লাভ, সাইজ আছে কিনা আর কতটা নতুন। নিচের স্লাইডার ঠিক করে কোনটা কতটা গুরুত্ব পাবে।')}</p></div>
        <div><b class="n">2</b><b>${t('Higher score shows first', 'বেশি স্কোর আগে দেখায়')}</b><p class="small muted" style="margin:6px 0 0">${t('Sold-out sizes lower the score by themselves, so customers do not open products they cannot buy. Scores update every night.', 'সাইজ শেষ হলে স্কোর নিজে কমে, তাই কাস্টমার এমন প্রোডাক্ট খোলেন না যা কিনতে পারবেন না। স্কোর প্রতি রাতে আপডেট হয়।')}</p></div>
        <div><b class="n">3</b><b>${t('You can always overrule', 'আপনি সবসময় বদলাতে পারেন')}</b><p class="small muted" style="margin:6px 0 0">${t('“Top” pins a product above everything (good for a launch); “Down” sends it to the end. Changes go live when you press “Save this order”.', '“উপরে” দিলে প্রোডাক্ট সবার উপরে থাকে (লঞ্চে কাজে লাগে); “নিচে” দিলে শেষে যায়। “এই ক্রম সেভ করুন” চাপলে চালু হয়।')}</p></div></div></div>` +
      `<div class="grid g3" style="margin-top:14px"><div class="stack">${U.card(t('What counts, and how much', 'কী কতটা গুরুত্ব পাবে'), `<div class="prd-w">${W.map((x) => `<label for="rw-${x[0]}">${x[1]}</label><b class="num" id="rv-${x[0]}" style="text-align:right">${ps.weights[x[0]]}</b><input type="range" min="0" max="50" id="rw-${x[0]}" value="${ps.weights[x[0]]}" style="grid-column:1/-1">`).join('')}</div><button class="btn sm ghost" id="rk-reset" style="margin-top:8px">${A.icon('reset')}${t('Back to default', 'আগের মতো করুন')}</button>`)}${U.card(t('Preview: “New in”', 'প্রিভিউ: “New in”'), `<div class="prd-coll" id="rk-new"></div>`)}${U.card(t('Preview: Polo page', 'প্রিভিউ: পোলো পেজ'), `<div class="prd-coll" id="rk-polo"></div>`)}</div>
      <div class="span2">${U.card(t('Live order on the shop', 'সাইটে এখনকার ক্রম'), `<input class="inp" id="rk-q" placeholder="${t('Find a product', 'প্রোডাক্ট খুঁজুন')}" style="margin-bottom:8px"><div id="rk-list"></div>`, { sub: t('▲▼ = moved since the last saved order', '▲▼ = শেষ সেভ করা ক্রম থেকে কত ধাপ সরেছে') })}</div></div>`;
    let q = '';
    const draw = () => {
      const all = scoreAll(); const s = q.toLowerCase();
      const rows = all.filter((x) => !s || x.p.name.toLowerCase().includes(s)).slice(0, s ? 40 : 25);
      el.querySelector('#rk-list').innerHTML = rows.map((x) => { const mv = (ps.baseRanks[x.p.id] || x.rank) - x.rank; return `<div class="prd-rank"><span class="n">${x.rank}</span>${U.thumb(x.p, 32)}<div class="grow" style="min-width:0"><b class="ellip" style="display:block">${A.esc(x.p.name)}</b><span class="small muted">${catNm(x.p.cat)} · ${t(`${x.p.sold30} sold`, `${x.p.sold30} বিক্রি`)}${x.p.pin === 'top' ? ' · ' + U.badge(t('Pinned', 'পিন করা'), 'accent') : x.p.pin === 'down' ? ' · ' + U.badge(t('Pushed down', 'নিচে নামানো'), '') : ''}</span></div><div class="sc hide-sm"><div class="small"><b>${Math.round(x.score)}</b>/100</div>${U.bar(x.score, 'var(--c2)')}</div><span class="delta ${mv > 0 ? 'up' : mv < 0 ? 'down' : 'flat'}" style="width:44px;text-align:right">${mv > 0 ? '▲' + mv : mv < 0 ? '▼' + -mv : '—'}</span><button class="btn sm ${x.p.pin === 'top' ? 'primary' : ''}" data-pin="${x.p.id}" title="${t('Pin to top', 'উপরে পিন')}">${t('Top', 'উপরে')}</button><button class="btn sm ${x.p.pin === 'down' ? 'dark' : ''}" data-down="${x.p.id}" title="${t('Push down', 'নিচে নামান')}">${t('Down', 'নিচে')}</button></div>`; }).join('');
      A.on(el, '[data-pin]', 'click', (e, b) => { const p = A.byId(A.D.products, b.dataset.pin); p.pin = p.pin === 'top' ? false : 'top'; A.commit(`${p.pin ? 'Pinned' : 'Unpinned'} ${p.name}`); A.toast(p.pin ? t('Pinned to the top', 'উপরে পিন করা হলো') : t('Pin removed', 'পিন সরানো হলো'), 'good'); draw(); });
      A.on(el, '[data-down]', 'click', (e, b) => { const p = A.byId(A.D.products, b.dataset.down); p.pin = p.pin === 'down' ? false : 'down'; A.commit(`${p.pin ? 'Pushed down' : 'Reset'} ${p.name}`); A.toast(p.pin ? t('Pushed to the end', 'শেষে নামানো হলো') : t('Back to normal', 'স্বাভাবিক হলো'), 'good'); draw(); });
      const coll = (list) => list.slice(0, 8).map((x) => `<div class="it">${U.thumb(x.p, 64)}<div class="ellip">${A.esc(x.p.name)}</div><b>${A.fmt.tk(x.p.price)}</b></div>`).join('');
      const fresh = all.filter((x) => (A.TODAY - new Date(x.p.created)) / DAY <= 60 || x.p.pin === 'top');
      el.querySelector('#rk-new').innerHTML = coll(fresh.length ? fresh : all) || U.empty('—');
      el.querySelector('#rk-polo').innerHTML = coll(all.filter((x) => x.p.cat === 'polo'));
    };
    W.forEach(([k]) => { const r = el.querySelector('#rw-' + k); r.oninput = () => { ps.weights[k] = +r.value; el.querySelector('#rv-' + k).textContent = r.value; draw(); }; r.onchange = () => A.save(); });
    el.querySelector('#rk-q').oninput = (e) => { q = e.target.value; draw(); };
    el.querySelector('#rk-reset').onclick = () => { ps.weights = { sales: 35, conv: 20, margin: 15, stock: 20, fresh: 10 }; A.commit('Shop ranking weights reset'); A.toast(t('Back to the default weights', 'আগের মতো করা হলো'), 'good'); A.render(); };
    el.querySelector('#rk-save').onclick = () => { ps.baseRanks = {}; scoreAll().forEach((x) => (ps.baseRanks[x.p.id] = x.rank)); A.commit('Shop ranking saved'); A.toast(t('New order is live on the shop', 'নতুন ক্রম সাইটে চালু হলো'), 'good'); draw(); };
    draw();
  }

  /* ================= COMBOS ================= */
  const CTYPE = { 'style-colours': ['Same style, 2–3 colours', 'একই স্টাইল, 2–3 কালার'], 'style-style': ['Style + style', 'স্টাইল + স্টাইল'], 'cat-cat': ['Category + category', 'ক্যাটাগরি + ক্যাটাগরি'], 'prod-prod': ['Product + product', 'প্রোডাক্ট + প্রোডাক্ট'] };
  const cbItems = (cb) => cb.pids.map((id, i) => ({ p: A.byId(A.D.products, id), color: (cb.cols || [])[i] || null })).filter((x) => x.p);
  const cbWas = (cb) => (cb.type === 'cat-cat' ? A.sum(cb.cats || [], (c) => { const l = A.D.products.filter((p) => p.status === 'live' && p.cat === c); return l.length ? A.sum(l, (p) => p.price) / l.length : 0; }) : A.sum(cbItems(cb), (x) => x.p.price));
  const cbPrice = (cb) => (cb.priceMode === 'rule' ? Math.round(cbWas(cb) * (1 - (cb.pct || 0) / 100) / 10) * 10 : cb.price);
  const cbCost = (cb) => (cb.type === 'cat-cat' ? A.sum(cb.cats || [], (c) => { const l = A.D.products.filter((p) => p.status === 'live' && p.cat === c); return l.length ? A.sum(l, (p) => p.cost) / l.length : 0; }) : A.sum(cbItems(cb), (x) => x.p.cost));
  const cbSoldOut = (cb) => { for (const x of cbItems(cb)) { if (x.color) { if (!x.p.variants.some((v) => v.color === x.color && v.stock > 0)) return `${x.p.name} · ${x.color}`; } else if (!stockOf(x.p)) return x.p.name; } return ''; };
  const today = () => A.fmt.ymd(A.TODAY);
  function cbState(cb) {
    if (cb.status === 'archived') return ['archived', t('Archived', 'আর্কাইভ'), ''];
    if (cb.status === 'off') return ['off', t('Off', 'বন্ধ'), ''];
    if (cb.from && cb.from > today()) return ['sched', t(`Starts ${A.fmt.date(cb.from)}`, `শুরু ${A.fmt.date(cb.from)}`), 'info'];
    if (cb.to && cb.to < today()) return ['ended', t('Ended', 'শেষ হয়েছে'), ''];
    const so = cbSoldOut(cb); if (so) return ['paused', t(`Paused · ${so} sold out`, `থামানো · ${so} শেষ`), 'warn'];
    return ['on', t('On the shop', 'দোকানে চালু'), 'good'];
  }
  const cbst = { f: 'active', q: '' };
  function renderCombos(el) {
    ensure2(); const cbs = A.D.combos; const S = cbs.map((c) => ({ c, s: cbState(c) }));
    const act = S.filter((x) => x.s[0] === 'on'); const paused = S.filter((x) => x.s[0] === 'paused');
    const rev = A.sum(cbs, (c) => c.sold30 * cbPrice(c)); const best = cbs.filter((c) => c.status !== 'archived').sort((a, b) => b.sold30 - a.sold30)[0];
    const avgSave = act.length ? A.sum(act, (x) => { const w = cbWas(x.c); return w ? (w - cbPrice(x.c)) / w * 100 : 0; }) / act.length : 0;
    el.innerHTML = A.pageHead(t('Combos', 'কম্বো'), t('Sell 2–3 pieces together for a little less. The “was” price is always the separate prices added up. A combo pauses by itself when a piece sells out.', '2–3 পিস একসাথে একটু কম দামে। “আগের দাম” সবসময় আলাদা দামগুলোর যোগফল। কোনো পিস শেষ হলে কম্বো নিজে থেমে যায়।'),
      `<button class="btn" id="cb-auto">${A.icon('sync')}${t('Auto-generate', 'অটো তৈরি')}</button><button class="btn primary" id="cb-new">${A.icon('plus')}${t('Build a combo', 'কম্বো বানান')}</button>`) + A.tabsBar('products', 'combos') +
      `<div class="grid g4" style="margin-bottom:14px">${U.kpi({ label: t('On the shop', 'দোকানে চালু'), value: act.length, sub: t(`${paused.length} paused (sold out)`, `${paused.length}টি থামানো (স্টক শেষ)`) })}${U.kpi({ label: t('Combos sold · 30 days', 'কম্বো বিক্রি · 30 দিন'), value: A.fmt.num(A.sum(cbs, (c) => c.sold30)) })}${U.kpi({ label: t('Combo sales · 30 days', 'কম্বো থেকে বিক্রি · 30 দিন'), value: A.fmt.tkShort(rev) })}${U.kpi({ label: t('Average customer saving', 'কাস্টমারের গড় সাশ্রয়'), value: A.fmt.pct(avgSave) })}</div>` +
      U.callout(best ? t(`<b>${A.esc(best.name)}</b> sells best (${best.sold30} in 30 days).${paused.length ? ` ${paused.length} combo${paused.length > 1 ? 's are' : ' is'} paused because a colour sold out — they come back by themselves when ERP stock arrives.` : ''}`, `<b>${A.esc(best.name)}</b> সবচেয়ে বেশি চলছে (30 দিনে ${best.sold30}টি)।${paused.length ? ` ${paused.length}টি কম্বো থেমে আছে কারণ কোনো কালার শেষ — ERP-তে স্টক এলে নিজে আবার চালু হবে।` : ''}`) : t('No combo yet.', 'এখনো কোনো কম্বো নেই।'), paused.length ? 'warn' : 'good', paused.length ? 'warn' : 'check') +
      `<div class="card" style="margin-top:14px"><div class="prd-tools"><input class="inp" id="cb-q" placeholder="${t('Search combos', 'কম্বো খুঁজুন')}" value="${A.esc(cbst.q)}"></div><div class="chips prd-chips">${[['active', t('Active', 'চালু')], ['paused', t('Paused', 'থামানো')], ['sched', t('Scheduled or ended', 'শিডিউল বা শেষ')], ['off', t('Off', 'বন্ধ')], ['archived', t('Archived', 'আর্কাইভ')]].map((f) => `<button class="chip ${cbst.f === f[0] ? 'on' : ''}" data-cf="${f[0]}">${f[1]}<span class="c">${S.filter((x) => cbMatch(x.s[0], f[0])).length}</span></button>`).join('')}</div><div id="cb-list"></div></div>`;
    const draw = () => {
      const q = cbst.q.toLowerCase(); const rows = S.filter((x) => cbMatch(x.s[0], cbst.f) && (!q || x.c.name.toLowerCase().includes(q))).map((x) => Object.assign({ _id: x.c.id }, x));
      el.querySelector('#cb-list').innerHTML = U.table([
        { h: t('Combo', 'কম্বো'), f: (x) => `<div style="min-width:0"><b class="ellip" style="display:block;max-width:260px">${A.esc(x.c.name)}</b><div class="cb-items">${x.c.type === 'cat-cat' ? (x.c.cats || []).map((c, i) => `${i ? '<span class="x">+</span>' : ''}${U.badge(catNm(c), 'info')}`).join('') : cbItems(x.c).map((it, i) => `${i ? '<span class="x">+</span>' : ''}${U.thumb(it.color ? { colors: [it.color], cat: it.p.cat } : it.p, 28)}${it.color ? `<span class="small">${A.esc(it.color)}</span>` : ''}`).join('')}</div><span class="small muted">${t(CTYPE[x.c.type][0], CTYPE[x.c.type][1])} · ${x.c.priceMode === 'rule' ? t(`${x.c.pct}% off rule`, `${x.c.pct}% ছাড়ের নিয়ম`) : t('Fixed price', 'নির্দিষ্ট দাম')}</span></div>` },
        { h: t('Price', 'দাম'), r: true, f: (x) => `<b>${x.c.type === 'cat-cat' ? t(`${x.c.pct}% off`, `${x.c.pct}% ছাড়`) : A.fmt.tk(cbPrice(x.c))}</b>${x.c.type === 'cat-cat' ? `<div class="small muted">${t('of what they pick', 'যা বাছবেন তার')}</div>` : `<div class="prd-strike">${A.fmt.tk(cbWas(x.c))}</div>`}` },
        { h: t('Profit', 'লাভ'), r: true, hide: true, f: (x) => marginBadge(marginOf(cbPrice(x.c), cbCost(x.c))) },
        { h: t('Sold 30d', '30 দিনে বিক্রি'), r: true, hide: true, f: (x) => A.fmt.num(x.c.sold30) },
        { h: t('Dates', 'তারিখ'), hide: true, f: (x) => `<span class="small">${x.c.from || x.c.to ? `${x.c.from ? A.fmt.date(x.c.from) : '…'} – ${x.c.to ? A.fmt.date(x.c.to) : '…'}` : t('Always', 'সবসময়')}</span>` },
        { h: t('Status', 'অবস্থা'), f: (x) => U.badge(x.s[1], x.s[2]) },
        { h: '', r: true, f: (x) => `<span class="row" style="gap:4px;justify-content:flex-end;flex-wrap:wrap">${x.c.status === 'archived' ? `<button class="btn sm" data-cbr="${x.c.id}">${t('Bring back', 'ফেরত আনুন')}</button>` : `<button class="btn sm" data-cbt="${x.c.id}">${x.c.status === 'off' ? t('Turn on', 'চালু') : t('Turn off', 'বন্ধ')}</button><button class="btn sm" data-cbp="${x.c.id}">${t('Price', 'দাম')}</button><button class="btn sm ghost" data-cba="${x.c.id}">${t('Archive', 'আর্কাইভ')}</button>`}</span>` },
      ], rows, { empty: t('No combo here', 'এখানে কোনো কম্বো নেই') });
      const get = (b, k) => A.byId(cbs, b.dataset[k]);
      A.on(el, '[data-cbt]', 'click', (e, b) => { const c = get(b, 'cbt'); c.status = c.status === 'off' ? 'on' : 'off'; A.commit(`Combo ${c.name} ${c.status}`); A.toast(c.status === 'on' ? t('Combo is on', 'কম্বো চালু হলো') : t('Combo turned off', 'কম্বো বন্ধ হলো'), 'good'); A.render(); });
      A.on(el, '[data-cba]', 'click', (e, b) => { const c = get(b, 'cba'); U.confirm(t('Archive this combo?', 'কম্বোটা আর্কাইভ করবেন?'), t('It leaves the shop. Sales history stays and you can bring it back any time.', 'দোকান থেকে সরে যাবে। বিক্রির হিসাব থাকবে, যেকোনো সময় ফেরত আনা যাবে।'), t('Archive', 'আর্কাইভ'), () => { c.status = 'archived'; A.commit(`Archived combo ${c.name}`); A.toast(t('Combo archived', 'কম্বো আর্কাইভ হলো'), 'good'); A.render(); }, true); });
      A.on(el, '[data-cbr]', 'click', (e, b) => { const c = get(b, 'cbr'); c.status = 'off'; A.commit(`Brought back combo ${c.name}`); A.toast(t('Combo is back (off for now)', 'কম্বো ফেরত এলো (আপাতত বন্ধ)'), 'good'); A.render(); });
      A.on(el, '[data-cbp]', 'click', (e, b) => comboBuild(get(b, 'cbp')));
    };
    A.on(el, '[data-cf]', 'click', (e, b) => { cbst.f = b.dataset.cf; A.render(); });
    el.querySelector('#cb-q').oninput = (e) => { cbst.q = e.target.value; draw(); };
    el.querySelector('#cb-new').onclick = () => comboBuild(null);
    el.querySelector('#cb-auto').onclick = () => comboAuto();
    draw();
  }
  const cbMatch = (s, f) => (f === 'active' ? s === 'on' : f === 'sched' ? s === 'sched' || s === 'ended' : s === f);
  function comboBuild(cb) {
    const live = A.D.products.filter((p) => p.status === 'live').sort((a, b) => a.name.localeCompare(b.name));
    const st2 = cb ? { type: cb.type, n: Math.max(2, cb.type === 'cat-cat' ? (cb.cats || []).length : cb.pids.length), pids: cb.pids.slice(), cols: (cb.cols || []).slice(), cats: (cb.cats || []).slice(), mode: cb.priceMode, price: cb.price, pct: cb.pct || 10, from: cb.from || '', to: cb.to || '', name: cb.name } : { type: 'prod-prod', n: 2, pids: [live.find((p) => p.cat === 'polo').id, live.find((p) => p.cat === 'trouser').id, live[0].id], cols: [], cats: ['polo', 'trouser', 'tshirt'], mode: 'fixed', price: 0, pct: 10, from: '', to: '', name: '' };
    const popts = live.map((p) => [p.id, `${p.name} · ${A.fmt.tk(p.price)}`]);
    const m = U.modal(cb ? t('Edit combo', 'কম্বো এডিট') : t('Build a combo', 'কম্বো বানান'), '<div id="cbm"></div>', { wide: true, foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="cbm-ok">${t('Save combo', 'কম্বো সেভ করুন')}</button>` });
    const tmp = () => ({ type: st2.type, pids: st2.type === 'cat-cat' ? [] : st2.pids.slice(0, st2.n), cols: st2.type === 'style-colours' || st2.type === 'prod-prod' ? st2.cols.slice(0, st2.n) : [], cats: st2.cats.slice(0, st2.n), priceMode: st2.type === 'cat-cat' ? 'rule' : st2.mode, price: +st2.price || 0, pct: +st2.pct || 0 });
    const draw = () => {
      if (st2.type === 'style-colours') { const p = A.byId(A.D.products, st2.pids[0]) || live[0]; st2.pids = [p.id, p.id, p.id]; st2.cols = [0, 1, 2].map((i) => (p.colors.includes(st2.cols[i]) ? st2.cols[i] : p.colors[i % p.colors.length])); }
      if (st2.type === 'prod-prod') st2.cols = [0, 1, 2].map((i) => { const p = A.byId(A.D.products, st2.pids[i]); return p && p.colors.includes(st2.cols[i]) ? st2.cols[i] : p ? p.colors[0] : null; });
      const c = tmp(); const was = cbWas(c); const pr = cbPrice(c); const cost = cbCost(c);
      const pick = (i) => {
        if (st2.type === 'cat-cat') return U.field(t(`Piece ${i + 1}: category`, `পিস ${i + 1}: ক্যাটাগরি`), U.select('cbm-c' + i, A.CATS.map((x) => [x.id, t(x.en, x.bn)]), st2.cats[i], `data-ci="${i}"`));
        if (st2.type === 'style-colours') { const p = A.byId(A.D.products, st2.pids[0]); return (i === 0 ? U.field(t('Style', 'স্টাইল'), U.select('cbm-p0', popts, st2.pids[0], 'data-pi="0"')) : '') + U.field(t(`Colour ${i + 1}`, `কালার ${i + 1}`), U.select('cbm-k' + i, p.colors.map((x) => [x, x]), st2.cols[i], `data-ki="${i}"`)); }
        const p = A.byId(A.D.products, st2.pids[i]);
        return U.field(t(`Piece ${i + 1}`, `পিস ${i + 1}`), U.select('cbm-p' + i, popts, st2.pids[i], `data-pi="${i}"`)) + (st2.type === 'prod-prod' && p ? U.field(t('Colour', 'কালার'), U.select('cbm-k' + i, p.colors.map((x) => [x, x]), st2.cols[i], `data-ki="${i}"`)) : '');
      };
      m.querySelector('#cbm').innerHTML = `${U.field(t('Pair type', 'জোড়ার ধরন'), U.seg('cbm-type', Object.keys(CTYPE).map((k) => [k, t(CTYPE[k][0], CTYPE[k][1])]), st2.type))}
        <div class="small muted" style="margin:-4px 0 8px">${{ 'style-colours': t('e.g. one polo in Navy + White. Customer picks sizes.', 'যেমন একই পোলো Navy + White। কাস্টমার সাইজ বাছবেন।'), 'style-style': t('e.g. Piqué Polo + Slim Chino. Customer picks colours and sizes.', 'যেমন Piqué Polo + Slim Chino। কাস্টমার কালার ও সাইজ বাছবেন।'), 'cat-cat': t('e.g. any polo + any trousers at 10% off. Price follows what the customer picks.', 'যেমন যেকোনো পোলো + যেকোনো ট্রাউজার 10% ছাড়ে। দাম কাস্টমারের বাছাই অনুযায়ী।'), 'prod-prod': t('Exact pieces: style and colour fixed. Customer picks sizes.', 'নির্দিষ্ট পিস: স্টাইল ও কালার ঠিক করা। কাস্টমার সাইজ বাছবেন।') }[st2.type]}</div>
        ${U.field(t('Pieces', 'পিস'), U.seg('cbm-n', [['2', '2'], ['3', '3']], String(st2.n)))}
        <div class="formgrid">${[...Array(st2.n).keys()].map(pick).join('')}</div>
        ${U.field(t('Combo name', 'কম্বোর নাম'), U.input('cbm-name', st2.name || (st2.type === 'cat-cat' ? c.cats.map(catNm).join(' + ') : st2.type === 'style-colours' ? `${(A.byId(A.D.products, st2.pids[0]) || {}).name} · ${c.cols.join(' + ')}` : cbItems(c).map((x) => x.p.name.split(' ').slice(-2).join(' ')).join(' + '))))}
        ${st2.type === 'cat-cat' ? '' : U.field(t('Price', 'দাম'), U.seg('cbm-mode', [['fixed', t('Price per combo', 'প্রতি কম্বোর দাম')], ['rule', t('Rule: % off', 'নিয়ম: % ছাড়')]], st2.mode))}
        <div class="formgrid">${st2.type !== 'cat-cat' && st2.mode === 'fixed' ? U.field(t('Combo price', 'কম্বোর দাম'), U.money('cbm-price', st2.price || Math.round(was * 0.9 / 10) * 10)) : U.field(t('% off the separate prices', 'আলাদা দামের উপর % ছাড়'), U.input('cbm-pct', st2.pct, 'type="number" min="1" max="50"'))}${U.field(t('Starts', 'শুরু'), `<input class="inp" type="date" id="cbm-from" value="${st2.from}">`)}${U.field(t('Ends', 'শেষ'), `<input class="inp" type="date" id="cbm-to" value="${st2.to}">`, t('Leave empty to run always', 'খালি রাখলে সবসময় চলবে'))}</div>
        <div class="list small" style="margin:8px 0"><div class="li"><span class="grow">${t('Was price (separate prices added up)', 'আগের দাম (আলাদা দামের যোগফল)')}</span>${st2.type === 'cat-cat' ? t(`about ${A.fmt.tk(was)}`, `প্রায় ${A.fmt.tk(was)}`) : A.fmt.tk(was)}</div><div class="li"><span class="grow">${t('Combo price', 'কম্বোর দাম')}</span><b>${A.fmt.tk(pr)}</b></div><div class="li"><span class="grow">${t('Customer saves', 'কাস্টমার বাঁচান')}</span>${A.fmt.tk(was - pr)}</div><div class="li"><span class="grow">${t('Your profit', 'আপনার লাভ')}</span>${A.fmt.tk(pr - cost)} · ${marginBadge(marginOf(pr, cost))}</div></div>
        <label class="row small" style="gap:8px">${U.switch('cbm-pause', true, 'disabled')} ${t('Pause by itself when a piece or colour sells out; start again when stock comes back', 'কোনো পিস বা কালার শেষ হলে নিজে থামবে; স্টক এলে আবার চালু')}</label>
        ${U.field(t('Owner PIN', 'মালিকের PIN'), `<input class="inp" id="cbm-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="max-width:140px">`, t('Prices need the owner PIN (any 4 digits in this demo)', 'দামের জন্য মালিকের PIN লাগে (ডেমোতে যেকোনো 4 সংখ্যা)'))}`;
      const keep = () => { const g = (id) => m.querySelector(id); if (g('#cbm-name')) st2.name = g('#cbm-name').value; if (g('#cbm-price')) st2.price = g('#cbm-price').value; if (g('#cbm-pct')) st2.pct = g('#cbm-pct').value; st2.from = g('#cbm-from').value; st2.to = g('#cbm-to').value; };
      A.on(m, '#cbm-type button', 'click', (e, b) => { keep(); st2.type = b.dataset.v; st2.name = ''; draw(); });
      A.on(m, '#cbm-n button', 'click', (e, b) => { keep(); st2.n = +b.dataset.v; st2.name = ''; draw(); });
      A.on(m, '#cbm-mode button', 'click', (e, b) => { keep(); st2.mode = b.dataset.v; draw(); });
      A.on(m, '[data-pi]', 'change', (e, s) => { keep(); st2.pids[+s.dataset.pi] = s.value; st2.name = ''; draw(); });
      A.on(m, '[data-ki]', 'change', (e, s) => { keep(); st2.cols[+s.dataset.ki] = s.value; st2.name = ''; draw(); });
      A.on(m, '[data-ci]', 'change', (e, s) => { keep(); st2.cats[+s.dataset.ci] = s.value; st2.name = ''; draw(); });
      ['#cbm-price', '#cbm-pct'].forEach((id) => { const x = m.querySelector(id); if (x) x.onchange = () => { keep(); draw(); }; });
    };
    draw();
    m.parentElement.querySelector('#cbm-ok').onclick = () => {
      const g = (id) => m.querySelector(id); if (g('#cbm-price')) st2.price = g('#cbm-price').value; if (g('#cbm-pct')) st2.pct = g('#cbm-pct').value; st2.from = g('#cbm-from').value; st2.to = g('#cbm-to').value; st2.name = g('#cbm-name').value.trim();
      const c = tmp(); const pr = cbPrice(c); if (st2.type !== 'cat-cat' && new Set(c.pids.map((id, i) => id + (c.cols[i] || ''))).size < c.pids.length) { A.toast(t('Pick different pieces', 'আলাদা আলাদা পিস বাছুন'), 'bad'); return; }
      if (pr <= cbCost(c)) { A.toast(t('Combo price must be above the buying price', 'কম্বোর দাম কেনা দামের বেশি হতে হবে'), 'bad'); return; }
      if (!pinOk(g('#cbm-pin').value)) { A.toast(t('Enter the 4-digit PIN', '4 সংখ্যার PIN দিন'), 'bad'); return; }
      const data = Object.assign(c, { name: st2.name || 'Combo', price: pr, from: st2.from, to: st2.to });
      if (cb) Object.assign(cb, data); else A.D.combos.unshift(Object.assign({ id: A.uid('CB'), sold30: 0, status: 'on' }, data));
      U.close(); A.commit(`${cb ? 'Changed' : 'Built'} combo ${data.name} at ${pr}`); A.toast(cb ? t('Combo saved', 'কম্বো সেভ হলো') : t('Combo is on the shop', 'কম্বো দোকানে চালু হলো'), 'good'); A.render();
    };
  }
  function comboAuto() {
    const live = A.D.products.filter((p) => p.status === 'live' && stockOf(p) > 0);
    const s2 = { type: 'style-colours', a: 'polo', b: 'trouser', n: 2, pct: 10, max: 30 };
    const m = U.modal(t('Auto-generate combos', 'অটো কম্বো তৈরি'), '<div id="cga"></div>', { wide: true, foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="cga-ok">${t('Make these combos', 'এই কম্বোগুলো বানান')}</button>` });
    const gen = () => {
      const out = []; const A1 = live.filter((p) => p.cat === s2.a).sort((a, b) => b.sold30 - a.sold30); const B1 = live.filter((p) => p.cat === s2.b).sort((a, b) => b.sold30 - a.sold30);
      const exists = (key) => A.D.combos.some((c) => c.status !== 'archived' && c.pids.map((id, i) => id + ((c.cols || [])[i] || '')).join('|') === key);
      if (s2.type === 'style-colours') A1.forEach((p) => { const cs = p.colors.filter((c) => p.variants.some((v) => v.color === c && v.stock > 0)); const combos = s2.n === 2 ? cs.flatMap((x, i) => cs.slice(i + 1).map((y) => [x, y])) : cs.flatMap((x, i) => cs.slice(i + 1).flatMap((y, j) => cs.slice(i + j + 2).map((z) => [x, y, z]))); combos.forEach((cc) => { const key = cc.map((c) => p.id + c).join('|'); if (!exists(key)) out.push({ name: `${p.name} · ${cc.join(' + ')}`, type: 'style-colours', pids: cc.map(() => p.id), cols: cc }); }); });
      if (s2.type === 'style-style' || s2.type === 'prod-prod') A1.slice(0, 8).forEach((x) => B1.slice(0, 6).forEach((y) => { if (s2.type === 'prod-prod') { const key = `${x.id}${x.colors[0]}|${y.id}${y.colors[0]}`; if (!exists(key)) out.push({ name: `${x.name} ${x.colors[0]} + ${y.name} ${y.colors[0]}`, type: 'prod-prod', pids: [x.id, y.id], cols: [x.colors[0], y.colors[0]] }); } else { const key = `${x.id}|${y.id}`; if (!exists(key)) out.push({ name: `${x.name} + ${y.name}`, type: 'style-style', pids: [x.id, y.id], cols: [null, null] }); } }));
      if (s2.type === 'cat-cat') out.push({ name: `Any ${catNm(s2.a)} + any ${catNm(s2.b)}`, type: 'cat-cat', pids: [], cols: [], cats: [s2.a, s2.b] });
      return out;
    };
    const draw = () => {
      const list = gen(); const shown = list.slice(0, s2.max);
      m.querySelector('#cga').innerHTML = `${U.field(t('Pair type', 'জোড়ার ধরন'), U.seg('cga-type', Object.keys(CTYPE).map((k) => [k, t(CTYPE[k][0], CTYPE[k][1])]), s2.type))}
        <div class="formgrid">${U.field(s2.type === 'style-colours' ? t('Category', 'ক্যাটাগরি') : t('First piece from', 'প্রথম পিস যেখান থেকে'), U.select('cga-a', A.CATS.map((x) => [x.id, t(x.en, x.bn)]), s2.a))}${s2.type === 'style-colours' ? U.field(t('Pieces', 'পিস'), U.seg('cga-n', [['2', '2'], ['3', '3']], String(s2.n))) : U.field(t('Second piece from', 'দ্বিতীয় পিস যেখান থেকে'), U.select('cga-b', A.CATS.map((x) => [x.id, t(x.en, x.bn)]), s2.b))}${U.field(t('Rule: % off the separate prices', 'নিয়ম: আলাদা দামের উপর % ছাড়'), U.input('cga-pct', s2.pct, 'type="number" min="1" max="50"'))}${U.field(t('Most combos to make', 'সর্বোচ্চ কতগুলো'), U.input('cga-max', s2.max, 'type="number" min="1" max="200"'))}</div>
        ${U.callout(t(`<b>${list.length} new combinations</b> found (only pieces in stock; ones you already have are skipped). ${shown.length} will be made at ${s2.pct}% off. Each pauses by itself when a piece sells out.`, `<b>${list.length}টি নতুন জোড়া</b> পাওয়া গেছে (শুধু স্টকে থাকা পিস; আগে থাকাগুলো বাদ)। ${shown.length}টি ${s2.pct}% ছাড়ে বানানো হবে। কোনো পিস শেষ হলে প্রতিটা নিজে থামবে।`), 'info')}
        <div class="list small" style="margin-top:8px">${shown.slice(0, 6).map((x) => { const c = Object.assign({ priceMode: 'rule', pct: s2.pct }, x); return `<div class="li"><span class="grow ellip">${A.esc(x.name)}</span>${x.type === 'cat-cat' ? `${s2.pct}%` : `<b>${A.fmt.tk(cbPrice(c))}</b> <span class="prd-strike">${A.fmt.tk(cbWas(c))}</span>`}</div>`; }).join('') || U.empty(t('Nothing new to make with these choices', 'এই বাছাইয়ে নতুন কিছু হয় না'))}${shown.length > 6 ? `<div class="li muted">${t(`+ ${shown.length - 6} more`, `+ আরও ${shown.length - 6}টি`)}</div>` : ''}</div>`;
      A.on(m, '#cga-type button', 'click', (e, b) => { s2.type = b.dataset.v; draw(); });
      A.on(m, '#cga-n button', 'click', (e, b) => { s2.n = +b.dataset.v; draw(); });
      ['a', 'b'].forEach((k) => { const x = m.querySelector('#cga-' + k); if (x) x.onchange = () => { s2[k] = x.value; draw(); }; });
      ['pct', 'max'].forEach((k) => { const x = m.querySelector('#cga-' + k); x.onchange = () => { s2[k] = Math.max(1, +x.value || 1); draw(); }; });
    };
    draw();
    m.parentElement.querySelector('#cga-ok').onclick = () => {
      const list = gen().slice(0, s2.max); if (!list.length) { A.toast(t('Nothing new to make', 'নতুন কিছু বানানোর নেই'), 'bad'); return; }
      pinConfirm(t('Make combos', 'কম্বো বানান'), t(`${list.length} combos at ${s2.pct}% off the separate prices.`, `${list.length}টি কম্বো, আলাদা দামের উপর ${s2.pct}% ছাড়ে।`), t('Make combos', 'কম্বো বানান'), () => {
        list.forEach((x) => { const c = Object.assign({ id: A.uid('CB'), priceMode: 'rule', pct: s2.pct, sold30: 0, from: '', to: '', status: 'on', auto: true }, x); c.price = cbPrice(c); A.D.combos.push(c); });
        A.commit(`Auto-generated ${list.length} combos`); A.toast(t(`${list.length} combos made and on the shop`, `${list.length}টি কম্বো বানানো হলো, দোকানে চালু`), 'good'); A.render();
      });
    };
  }

  /* ================= SETS ================= */
  function setInfo(s) {
    const top = A.byId(A.D.products, s.topPid), bot = A.byId(A.D.products, s.botPid); if (!top || !bot) return null;
    const was = top.price + bot.price, cost = top.cost + bot.cost;
    const colours = s.link === 'same' ? top.colors.filter((c) => bot.colors.includes(c)) : top.colors;
    const okCol = (c) => top.variants.some((v) => v.color === c && v.stock > 0) && (s.link === 'any' || bot.variants.some((v) => v.color === c && v.stock > 0));
    return { top, bot, was, cost, colours, okCol, szTop: top.sizes.map((z) => [z, A.sum(top.variants.filter((v) => v.size === z), (v) => v.stock)]), szBot: bot.sizes.map((z) => [z, A.sum(bot.variants.filter((v) => v.size === z), (v) => v.stock)]) };
  }
  function renderSets(el) {
    ensure2(); const S = A.D.sets; const act = S.filter((s) => s.status === 'on');
    el.innerHTML = A.pageHead(t('Sets', 'সেট'), t('A set is one product made of a top and a bottom (ERP SKUs). One price, and the customer picks a separate size for each piece.', 'সেট মানে উপর আর নিচের পিস (ERP SKU) মিলে একটা প্রোডাক্ট। দাম একটাই, কাস্টমার প্রতিটা পিসের সাইজ আলাদা বাছেন।'),
      `<a class="btn" href="${A.href('products', 'add')}">${t('Add as a new listing', 'নতুন লিস্টিং হিসেবে যোগ')}</a><button class="btn primary" id="st-new">${A.icon('plus')}${t('New set', 'নতুন সেট')}</button>`) + A.tabsBar('products', 'sets') +
      `<div class="grid g4" style="margin-bottom:14px">${U.kpi({ label: t('Sets on the shop', 'দোকানে সেট'), value: act.length + '/' + S.filter((s) => s.status !== 'archived').length })}${U.kpi({ label: t('Sold · 30 days', 'বিক্রি · 30 দিন'), value: A.fmt.num(A.sum(S, (s) => s.sold30)) })}${U.kpi({ label: t('Sales · 30 days', 'বিক্রি · 30 দিন'), value: A.fmt.tkShort(A.sum(S, (s) => s.sold30 * s.price)) })}${U.kpi({ label: t('Colours ready to sell', 'বিক্রির মতো কালার'), value: A.sum(act, (s) => { const i = setInfo(s); return i ? i.colours.filter(i.okCol).length : 0; }) })}</div>` +
      U.callout(t('Stock of a set is the stock of its two pieces in the ERP. When the top or the bottom of a colour runs out, that colour hides from the set by itself.', 'সেটের স্টক মানে ERP-তে দুই পিসের স্টক। কোনো কালারের উপর বা নিচের পিস শেষ হলে সেই কালার সেট থেকে নিজে লুকিয়ে যায়।'), 'info') +
      `<div class="grid g2" style="margin-top:14px">${S.map((s) => { const i = setInfo(s); if (!i) return ''; const m = marginOf(s.price, i.cost); return U.card(A.esc(s.name), `<div class="st-pieces"><a class="pc" href="${A.href('products', 'all', i.top.id)}" style="text-decoration:none;color:inherit">${U.thumb(i.top, 40)}<span style="min-width:0"><b class="ellip">${A.esc(i.top.name)}</b><span class="small muted mono">${i.top.styleCode}</span></span></a><b class="plus muted">+</b><a class="pc" href="${A.href('products', 'all', i.bot.id)}" style="text-decoration:none;color:inherit">${U.thumb(i.bot, 40)}<span style="min-width:0"><b class="ellip">${A.esc(i.bot.name)}</b><span class="small muted mono">${i.bot.styleCode}</span></span></a></div>
        <div class="small" style="margin-top:10px"><b>${s.link === 'same' ? t('Same colour top and bottom', 'উপর-নিচ একই কালার') : t('Customer picks each colour', 'কাস্টমার আলাদা কালার বাছেন')}</b></div><div class="chips" style="margin:6px 0">${i.colours.map((c) => `<span class="chip ${i.okCol(c) ? '' : 'off'}" style="${i.okCol(c) ? '' : 'opacity:.5;text-decoration:line-through'}">${U.sw(c)} ${c}</span>`).join('') || U.badge(t('No shared colour', 'মিলে এমন কালার নেই'), 'bad')}</div>
        <div class="small muted">${t('Top sizes', 'উপরের সাইজ')}: ${i.szTop.map((z) => `<span style="${z[1] ? '' : 'text-decoration:line-through'}">${z[0]}</span>`).join(' · ')}<br>${t('Bottom sizes', 'নিচের সাইজ')}: ${i.szBot.map((z) => `<span style="${z[1] ? '' : 'text-decoration:line-through'}">${z[0]}</span>`).join(' · ')}</div>
        <div class="list" style="margin-top:10px"><div class="li"><span class="grow">${t('Set price', 'সেটের দাম')}</span><b>${A.fmt.tk(s.price)}</b> <span class="prd-strike">${A.fmt.tk(i.was)}</span></div><div class="li"><span class="grow">${t('Your profit', 'আপনার লাভ')}</span>${A.fmt.tk(s.price - i.cost)} · ${marginBadge(m)}</div><div class="li"><span class="grow">${t('Sold · 30 days', 'বিক্রি · 30 দিন')}</span><b>${s.sold30}</b></div></div>
        <div class="row between" style="margin-top:10px;gap:8px;flex-wrap:wrap">${s.status === 'archived' ? `${U.badge(t('Archived', 'আর্কাইভ'), '')}<button class="btn sm" data-sr="${s.id}">${t('Bring back', 'ফেরত আনুন')}</button>` : `<label class="row small" style="gap:8px">${U.switch('sts-' + s.id, s.status === 'on', `data-son="${s.id}"`)} ${s.status === 'on' ? t('On the shop', 'দোকানে চালু') : t('Off', 'বন্ধ')}</label><span class="row" style="gap:6px"><button class="btn sm" data-se="${s.id}">${t('Edit', 'এডিট')}</button><button class="btn sm ghost" data-sa="${s.id}">${t('Archive', 'আর্কাইভ')}</button></span>`}</div>`, { cls: 'st-card' }); }).join('')}</div>`;
    const get = (b, k) => A.byId(S, b.dataset[k]);
    A.on(el, '[data-son]', 'change', (e, i) => { const s = get(i, 'son'); s.status = i.checked ? 'on' : 'off'; A.commit(`Set ${s.name} ${s.status}`); A.toast(i.checked ? t('Set is on the shop', 'সেট দোকানে চালু') : t('Set turned off', 'সেট বন্ধ হলো'), 'good'); A.render(); });
    A.on(el, '[data-sa]', 'click', (e, b) => { const s = get(b, 'sa'); U.confirm(t('Archive this set?', 'সেটটা আর্কাইভ করবেন?'), t('It leaves the shop. The two pieces stay on sale on their own.', 'দোকান থেকে সরে যাবে। দুই পিস আলাদাভাবে বিক্রি চলবে।'), t('Archive', 'আর্কাইভ'), () => { s.status = 'archived'; A.commit(`Archived set ${s.name}`); A.toast(t('Set archived', 'সেট আর্কাইভ হলো'), 'good'); A.render(); }, true); });
    A.on(el, '[data-sr]', 'click', (e, b) => { const s = get(b, 'sr'); s.status = 'off'; A.commit(`Brought back set ${s.name}`); A.toast(t('Set is back (off for now)', 'সেট ফেরত এলো (আপাতত বন্ধ)'), 'good'); A.render(); });
    A.on(el, '[data-se]', 'click', (e, b) => setModal(get(b, 'se')));
    el.querySelector('#st-new').onclick = () => setModal(null);
  }
  function setModal(s) {
    const live = A.D.products.filter((p) => p.status === 'live'); const tops = live.filter((p) => !isBottom(p.cat) && p.cat !== 'extras'); const bots = live.filter((p) => isBottom(p.cat));
    const w = s ? Object.assign({}, s) : { name: '', topPid: tops[0].id, botPid: bots[0].id, link: 'same', price: 0 };
    const m = U.modal(s ? t('Edit set', 'সেট এডিট') : t('New set', 'নতুন সেট'), '<div id="stm"></div>', { wide: true, foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="stm-ok">${t('Save set', 'সেট সেভ করুন')}</button>` });
    const draw = () => {
      const i = setInfo(w); if (!w.price) w.price = Math.round(i.was * 0.9 / 10) * 10;
      m.querySelector('#stm').innerHTML = `${U.field(t('Set name', 'সেটের নাম'), U.input('stm-name', w.name || `${i.top.name.split(' ').slice(-1)[0]} + ${i.bot.name.split(' ').slice(-1)[0]} set`))}<div class="formgrid">${U.field(t('Top piece', 'উপরের পিস'), U.select('stm-top', tops.map((p) => [p.id, `${p.name} · ${A.fmt.tk(p.price)}`]), w.topPid))}${U.field(t('Bottom piece', 'নিচের পিস'), U.select('stm-bot', bots.map((p) => [p.id, `${p.name} · ${A.fmt.tk(p.price)}`]), w.botPid))}</div>
        ${U.field(t('Colour link', 'কালার মেলানো'), U.seg('stm-link', [['same', t('Same colour top and bottom', 'উপর-নিচ একই কালার')], ['any', t('Customer picks each colour', 'কাস্টমার আলাদা বাছবেন')]], w.link), w.link === 'same' ? t(`Shared colours: ${i.colours.join(', ') || 'none'}`, `মিলে যাওয়া কালার: ${i.colours.join(', ') || 'নেই'}`) : '')}
        <div class="small muted">${t(`Sizes stay separate: top ${i.top.sizes.join('/')}, bottom ${i.bot.sizes.join('/')}.`, `সাইজ আলাদা থাকে: উপর ${i.top.sizes.join('/')}, নিচ ${i.bot.sizes.join('/')}।`)}</div>
        <div class="formgrid" style="margin-top:8px">${U.field(t('One price for the set', 'সেটের একটাই দাম'), U.money('stm-price', w.price))}${U.field(t('Owner PIN', 'মালিকের PIN'), `<input class="inp" id="stm-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••">`)}</div>
        <div class="list small"><div class="li"><span class="grow">${t('Was price (both added up)', 'আগের দাম (দুটোর যোগফল)')}</span>${A.fmt.tk(i.was)}</div><div class="li"><span class="grow">${t('Your profit', 'আপনার লাভ')}</span>${A.fmt.tk(w.price - i.cost)} · ${marginBadge(marginOf(w.price, i.cost))}</div></div>`;
      const keep = () => { w.name = m.querySelector('#stm-name').value; w.price = +m.querySelector('#stm-price').value || 0; };
      m.querySelector('#stm-top').onchange = (e) => { keep(); w.topPid = e.target.value; w.name = ''; w.price = 0; draw(); };
      m.querySelector('#stm-bot').onchange = (e) => { keep(); w.botPid = e.target.value; w.name = ''; w.price = 0; draw(); };
      m.querySelector('#stm-price').onchange = () => { keep(); draw(); };
      A.on(m, '#stm-link button', 'click', (e, b) => { keep(); w.link = b.dataset.v; draw(); });
    };
    draw();
    m.parentElement.querySelector('#stm-ok').onclick = () => {
      w.name = m.querySelector('#stm-name').value.trim(); w.price = Math.round(+m.querySelector('#stm-price').value || 0); const i = setInfo(w);
      if (w.link === 'same' && !i.colours.length) { A.toast(t('These two have no colour in common — choose “Customer picks each colour”', 'এই দুটোর কোনো কালার মেলে না — “কাস্টমার আলাদা বাছবেন” বাছুন'), 'bad'); return; }
      if (w.price <= i.cost) { A.toast(t('Set price must be above the buying price', 'সেটের দাম কেনা দামের বেশি হতে হবে'), 'bad'); return; }
      if (!pinOk(m.querySelector('#stm-pin').value)) { A.toast(t('Enter the 4-digit PIN', '4 সংখ্যার PIN দিন'), 'bad'); return; }
      if (s) Object.assign(s, w); else A.D.sets.unshift(Object.assign({ id: A.uid('ST'), sold30: 0, status: 'on' }, w));
      U.close(); A.commit(`${s ? 'Changed' : 'Made'} set ${w.name}`); A.toast(s ? t('Set saved', 'সেট সেভ হলো') : t('Set is on the shop', 'সেট দোকানে চালু হলো'), 'good'); A.render();
    };
  }

  /* ================= REVIEWS & QUESTIONS ================= */
  const rst = { tab: 'questions', stars: 0, photo: false };
  const stars = (n) => `<span class="prd-stars">${'★'.repeat(n)}<span style="opacity:.25">${'★'.repeat(5 - n)}</span></span>`;
  function refreshRating(pid) { const p = A.byId(A.D.products, pid); if (!p) return; const rs = A.D.reviews.filter((r) => r.pid === pid && r.status === 'published'); p.reviews = rs.length; p.rating = rs.length ? A.sum(rs, (r) => r.rating) / rs.length : 0; }
  const HIDE_WHY = [['spam', 'Spam or advert', 'স্প্যাম বা বিজ্ঞাপন'], ['abuse', 'Abusive or bad words', 'গালি বা খারাপ কথা'], ['private', 'Personal phone or address', 'ব্যক্তিগত ফোন বা ঠিকানা'], ['other', 'Not about this product', 'এই প্রোডাক্ট নিয়ে নয়']];
  function renderReviews(el) {
    ensure2(); const R = A.D.reviews; const pub = R.filter((r) => r.status === 'published'); const pend = R.filter((r) => r.status === 'pending'); const hid = R.filter((r) => r.status === 'hidden');
    const avg = pub.length ? A.sum(pub, (r) => r.rating) / pub.length : 0; const qs = A.D.questions; const openQ = qs.filter((q) => !q.answer);
    const unrep = pub.filter((r) => r.rating <= 2 && !r.reply);
    const pn = (id) => { const p = A.byId(A.D.products, id); return p ? `<a href="${A.href('products', 'all', p.id)}">${A.esc(p.name)}</a>` : ''; };
    const TABS = [['questions', t('Questions', 'প্রশ্ন'), openQ.length], ['reviews', t('Reviews', 'রিভিউ'), pend.length], ['hidden', t('Hidden', 'লুকানো'), hid.length], ['faqs', t('FAQs', 'FAQ'), A.D.faqs.filter((f) => f.on).length]];
    let body = '';
    if (rst.tab === 'questions') {
      const list = qs.slice().sort((a, b) => (!a.answer) - (!b.answer) || new Date(b.date) - new Date(a.date)).reverse().sort((a, b) => (!!a.answer) - (!!b.answer));
      body = U.card(t('Questions from product pages', 'প্রোডাক্ট পেজ থেকে আসা প্রশ্ন'), list.map((q) => `<div class="prd-q"><div class="row between"><b>${A.esc(q.name)}</b><span class="muted small">${A.fmt.ago(q.date)}</span></div><div class="small muted">${pn(q.pid)}</div><div style="margin:4px 0 8px">${A.esc(q.text)}</div>${q.answer ? `<div class="small" style="padding:8px 10px;background:var(--card2);border-radius:8px"><b>EXTAS:</b> ${A.esc(q.answer)}</div><div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${q.faq ? U.badge(t('Is an FAQ', 'FAQ হয়েছে'), 'good') : `<button class="btn sm" data-mkfaq="${q.id}">${t('Make this an FAQ', 'এটাকে FAQ বানান')}</button>`}<button class="btn sm ghost" data-qe="${q.id}">${t('Edit answer', 'উত্তর এডিট')}</button></div>` : `<textarea class="inp" rows="2" id="qa-${q.id}" placeholder="${t('Write the answer — it shows under the question on the product page', 'উত্তর লিখুন — প্রোডাক্ট পেজে প্রশ্নের নিচে দেখাবে')}"></textarea><button class="btn sm primary" data-qa="${q.id}" style="margin-top:6px">${A.icon('send')}${t('Answer & publish', 'উত্তর দিয়ে পাবলিশ')}</button>`}</div>`).join('') || U.empty(t('No questions yet', 'এখনো কোনো প্রশ্ন নেই')), { sub: t('Customers ask with “Ask a question” on the product page. They get an SMS when you answer.', 'কাস্টমার প্রোডাক্ট পেজের “Ask a question” দিয়ে জিজ্ঞেস করেন। উত্তর দিলে তাঁরা SMS পান।') });
    } else if (rst.tab === 'reviews') {
      const list = pub.filter((r) => (!rst.stars || r.rating === rst.stars) && (!rst.photo || r.photo)).sort((a, b) => new Date(b.date) - new Date(a.date));
      body = `<div class="grid g2"><div class="stack">${U.card(t('Waiting to go on the page', 'পেজে যাওয়ার অপেক্ষায়'), pend.length ? pend.map((r) => rv(r, true)).join('') : U.empty(t('All reviews checked', 'সব রিভিউ দেখা হয়েছে')))}</div>${U.card(t('On product pages', 'প্রোডাক্ট পেজে আছে'), `<div class="chips" style="margin-bottom:10px">${[0, 5, 4, 3, 2, 1].map((n) => `<button class="chip ${rst.stars === n ? 'on' : ''}" data-rs="${n}">${n ? n + '★' : t('All', 'সব')}<span class="c">${n ? pub.filter((r) => r.rating === n).length : pub.length}</span></button>`).join('')}<button class="chip ${rst.photo ? 'on' : ''}" id="rv-ph">${t('With photo', 'ছবিসহ')}</button></div>${list.slice(0, 20).map((r) => rv(r, false)).join('') || U.empty(t('No reviews match', 'মিলে এমন রিভিউ নেই'))}`)}</div>`;
    } else if (rst.tab === 'hidden') {
      body = U.card(t('Hidden reviews', 'লুকানো রিভিউ'), hid.map((r) => `<div class="prd-q rv-hidden"><div class="row between">${stars(r.rating)} <b>${A.esc(r.name)}</b><span class="muted small">${A.fmt.dateY(r.date)}</span></div><div class="small muted">${pn(r.pid)}</div><div>${A.esc(r.text)}</div><div class="small" style="margin-top:6px">${U.badge(t((HIDE_WHY.find((h) => h[0] === r.hideWhy) || HIDE_WHY[0])[1], (HIDE_WHY.find((h) => h[0] === r.hideWhy) || HIDE_WHY[0])[2]), 'warn')} ${r.hideNote ? A.esc(r.hideNote) : ''}</div><button class="btn sm" data-unh="${r.id}" style="margin-top:8px">${t('Show again', 'আবার দেখান')}</button></div>`).join('') || U.empty(t('Nothing hidden', 'কিছুই লুকানো নেই')), { sub: t('Kept for the record. Nothing is ever deleted.', 'রেকর্ডের জন্য রাখা। কিছুই মোছা হয় না।') });
    } else {
      const F = A.D.faqs; const prodF = F.filter((f) => f.scope === 'product'); const catF = F.filter((f) => f.scope === 'category');
      const fl = (f) => `<div class="faq-li ${f.on ? '' : 'rv-hidden'}"><div class="row between" style="gap:8px"><span class="q">${A.esc(f.q)}</span>${f.on ? '' : U.badge(t('Hidden', 'লুকানো'), '')}</div><div class="small">${A.esc(f.a)}</div><div class="small muted">${f.scope === 'product' ? pn(f.pid) : catNm(f.cat)}</div><div class="row" style="gap:6px;margin-top:6px"><button class="btn sm" data-fe="${f.id}">${t('Edit', 'এডিট')}</button><button class="btn sm ghost" data-ft="${f.id}">${f.on ? t('Hide', 'লুকান') : t('Show', 'দেখান')}</button></div></div>`;
      body = `<div class="row" style="justify-content:flex-end;gap:8px;margin-bottom:10px;flex-wrap:wrap"><a class="btn" href="${A.href('website', 'policies')}">${t('Shop-wide FAQ →', 'পুরো দোকানের FAQ →')}</a><button class="btn primary" id="faq-new">${A.icon('plus')}${t('New FAQ', 'নতুন FAQ')}</button></div><div class="grid g2">${U.card(t('Category FAQs', 'ক্যাটাগরির FAQ'), catF.map(fl).join('') || U.empty('—'), { sub: t('Added to every product of the category by itself', 'ক্যাটাগরির সব প্রোডাক্টে নিজে যুক্ত হয়') })}${U.card(t('Product FAQs', 'প্রোডাক্টের FAQ'), prodF.map(fl).join('') || U.empty('—'), { sub: t('Only on that product (also set in Add product, step 6)', 'শুধু ওই প্রোডাক্টে (Add product-এর ধাপ 6 থেকেও দেওয়া যায়)') })}</div>`;
    }
    function rv(r, pending) { return `<div class="prd-q"><div class="row between" style="gap:8px"><div>${stars(r.rating)} <b>${A.esc(r.name)}</b> ${r.photo ? U.badge(t('With photo', 'ছবিসহ'), 'info') : ''}</div><span class="muted small">${A.fmt.dateY(r.date)}</span></div><div class="small muted" style="margin:2px 0 6px">${pn(r.pid)}</div><div>${A.esc(r.text)}</div>${r.reply ? `<div class="small" style="margin-top:8px;padding:8px 10px;background:var(--card2);border-radius:8px"><b>EXTAS:</b> ${A.esc(r.reply)}</div>` : ''}<div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${pending ? `<button class="btn sm primary" data-ap="${r.id}">${t('Publish', 'পাবলিশ')}</button>` : ''}<button class="btn sm" data-rp="${r.id}">${r.reply ? t('Edit reply', 'উত্তর এডিট') : t('Reply', 'উত্তর দিন')}</button><button class="btn sm ghost" data-hd="${r.id}">${t('Hide (spam or abuse)', 'লুকান (স্প্যাম বা গালি)')}</button></div></div>`; }
    el.innerHTML = A.pageHead(t('Reviews & questions', 'রিভিউ ও প্রশ্ন'), t('Answer questions, publish reviews and turn good answers into FAQs.', 'প্রশ্নের উত্তর দিন, রিভিউ পাবলিশ করুন, ভালো উত্তরকে FAQ বানান।')) + A.tabsBar('products', 'reviews') +
      `<div class="grid g5" style="margin-bottom:14px">${U.kpi({ label: t('Average rating', 'গড় রেটিং'), value: avg.toFixed(2) + ' ★' })}${U.kpi({ label: t('Reviews on pages', 'পেজে রিভিউ'), value: pub.length, sub: t(`${pub.filter((r) => r.photo).length} with photo`, `${pub.filter((r) => r.photo).length}টি ছবিসহ`) })}${U.kpi({ label: t('Waiting to publish', 'পাবলিশের অপেক্ষায়'), value: pend.length })}${U.kpi({ label: t('Questions to answer', 'উত্তর বাকি প্রশ্ন'), value: openQ.length })}${U.kpi({ label: t('1–2 star without reply', 'উত্তর ছাড়া 1–2 স্টার'), value: unrep.length })}</div>` +
      U.callout(t('Bad reviews are never deleted (Bangladesh e-commerce guideline). You can only hide spam or abuse, with a reason. A short, kind reply works better than hiding.', 'খারাপ রিভিউ কখনো মোছা যায় না (বাংলাদেশের ই-কমার্স নির্দেশিকা)। শুধু স্প্যাম বা গালি কারণ লিখে লুকানো যায়। লুকানোর চেয়ে ছোট, ভদ্র উত্তর বেশি কাজ করে।'), 'info', 'info') +
      `<div class="chips" style="margin:14px 0">${TABS.map((x) => `<button class="chip ${rst.tab === x[0] ? 'on' : ''}" data-rt="${x[0]}">${x[1]}<span class="c">${x[2]}</span></button>`).join('')}</div>${body}`;
    A.on(el, '[data-rt]', 'click', (e, b) => { rst.tab = b.dataset.rt; A.render(); });
    A.on(el, '[data-rs]', 'click', (e, b) => { rst.stars = +b.dataset.rs; A.render(); });
    const ph = el.querySelector('#rv-ph'); if (ph) ph.onclick = () => { rst.photo = !rst.photo; A.render(); };
    A.on(el, '[data-ap]', 'click', (e, b) => { const r = A.byId(R, b.dataset.ap); r.status = 'published'; refreshRating(r.pid); A.commit('Review published'); A.toast(t('Review is on the product page', 'রিভিউ প্রোডাক্ট পেজে দেখাচ্ছে'), 'good'); A.render(); });
    A.on(el, '[data-unh]', 'click', (e, b) => { const r = A.byId(R, b.dataset.unh); r.status = 'published'; refreshRating(r.pid); A.commit('Review shown again'); A.toast(t('Review is back on the page', 'রিভিউ আবার পেজে দেখাচ্ছে'), 'good'); A.render(); });
    A.on(el, '[data-hd]', 'click', (e, b) => {
      const r = A.byId(R, b.dataset.hd);
      const m = U.modal(t('Hide this review?', 'রিভিউটা লুকাবেন?'), `<div class="small muted">${stars(r.rating)} ${A.esc(r.name)}: “${A.esc(r.text)}”</div>${r.rating <= 2 ? U.callout(t('This is a negative review. It can be hidden only if it is spam or abuse — not because it is bad for sales.', 'এটা খারাপ রিভিউ। শুধু স্প্যাম বা গালি হলে লুকানো যায় — বিক্রির ক্ষতি বলে নয়।'), 'warn', 'warn') : ''}${U.field(t('Reason', 'কারণ'), U.select('hd-why', HIDE_WHY.map((h) => [h[0], t(h[1], h[2])]), 'spam'))}${U.field(t('Note (who checked and why)', 'নোট (কে দেখলেন, কেন)'), `<textarea class="inp" id="hd-note" rows="2"></textarea>`)}`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn dark" id="hd-ok">${t('Hide with this reason', 'এই কারণে লুকান')}</button>` });
      m.parentElement.querySelector('#hd-ok').onclick = () => { const note = m.querySelector('#hd-note').value.trim(); if (r.rating <= 2 && note.length < 5) { A.toast(t('Write a short note for a negative review', 'খারাপ রিভিউর জন্য ছোট একটা নোট লিখুন'), 'bad'); return; } r.status = 'hidden'; r.hideWhy = m.querySelector('#hd-why').value; r.hideNote = note; refreshRating(r.pid); U.close(); A.commit(`Review hidden (${r.hideWhy})`); A.toast(t('Review hidden — kept under “Hidden”', 'রিভিউ লুকানো হলো — “লুকানো”-তে আছে'), 'good'); A.render(); };
    });
    A.on(el, '[data-rp]', 'click', (e, b) => {
      const r = A.byId(R, b.dataset.rp);
      const m = U.modal(t('Reply to review', 'রিভিউর উত্তর'), `<div class="small muted">${stars(r.rating)} ${A.esc(r.name)}: “${A.esc(r.text)}”</div><textarea class="inp" id="rr-t" rows="3" style="margin-top:10px">${A.esc(r.reply || (r.rating <= 2 ? 'Sorry for the trouble. Please message us on WhatsApp, we will exchange it for you.' : 'Thank you for your kind words!'))}</textarea>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="rr-ok">${t('Post reply', 'উত্তর পোস্ট করুন')}</button>` });
      m.parentElement.querySelector('#rr-ok').onclick = () => { r.reply = m.querySelector('#rr-t').value.trim(); U.close(); A.commit('Replied to review'); A.toast(t('Reply posted', 'উত্তর পোস্ট হলো'), 'good'); A.render(); };
    });
    A.on(el, '[data-qa]', 'click', (e, b) => { const q = A.byId(qs, b.dataset.qa); const v = el.querySelector('#qa-' + q.id).value.trim(); if (!v) { A.toast(t('Write the answer first', 'আগে উত্তর লিখুন'), 'bad'); return; } q.answer = v; A.commit('Answered product question'); A.toast(t('Answer published — customer gets an SMS', 'উত্তর পাবলিশ হলো — কাস্টমার SMS পাবেন'), 'good'); A.render(); });
    A.on(el, '[data-qe]', 'click', (e, b) => { const q = A.byId(qs, b.dataset.qe); const m = U.modal(t('Edit answer', 'উত্তর এডিট'), `<div class="small muted">${A.esc(q.text)}</div><textarea class="inp" id="qe-t" rows="3" style="margin-top:8px">${A.esc(q.answer)}</textarea>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="qe-ok">${t('Save', 'সেভ')}</button>` }); m.parentElement.querySelector('#qe-ok').onclick = () => { q.answer = m.querySelector('#qe-t').value.trim() || q.answer; U.close(); A.commit('Answer edited'); A.toast(t('Answer saved', 'উত্তর সেভ হলো'), 'good'); A.render(); }; });
    A.on(el, '[data-mkfaq]', 'click', (e, b) => { const q = A.byId(qs, b.dataset.mkfaq); faqModal({ q: q.text, a: q.answer, pid: q.pid, scope: 'product' }, () => { q.faq = true; }); });
    A.on(el, '[data-fe]', 'click', (e, b) => faqModal(A.byId(A.D.faqs, b.dataset.fe)));
    A.on(el, '[data-ft]', 'click', (e, b) => { const f = A.byId(A.D.faqs, b.dataset.ft); f.on = !f.on; A.commit(`FAQ ${f.on ? 'shown' : 'hidden'}`); A.toast(f.on ? t('FAQ is showing', 'FAQ দেখাচ্ছে') : t('FAQ hidden', 'FAQ লুকানো হলো'), 'good'); A.render(); });
    const nf = el.querySelector('#faq-new'); if (nf) nf.onclick = () => faqModal(null);
  }
  function faqModal(f, after) {
    const isNew = !f || !f.id; const w = Object.assign({ scope: 'category', cat: 'polo', pid: A.D.products[0].id, q: '', a: '' }, f || {});
    const p = A.byId(A.D.products, w.pid); if (p && !f?.cat) w.cat = p.cat;
    const m = U.modal(isNew ? t('Make an FAQ', 'FAQ বানান') : t('Edit FAQ', 'FAQ এডিট'), `${U.field(t('Show on', 'কোথায় দেখাবে'), U.select('fq-scope', [['product', t(`This product only${p ? ' · ' + p.name : ''}`, `শুধু এই প্রোডাক্ট${p ? ' · ' + p.name : ''}`)], ['category', t('Every product in the category', 'ক্যাটাগরির সব প্রোডাক্ট')]], w.scope))}${U.field(t('Category', 'ক্যাটাগরি'), U.select('fq-cat', A.CATS.map((c) => [c.id, t(c.en, c.bn)]), w.cat))}${U.field(t('Question', 'প্রশ্ন'), U.input('fq-q', w.q))}${U.field(t('Answer', 'উত্তর'), `<textarea class="inp" id="fq-a" rows="3">${A.esc(w.a)}</textarea>`)}`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="fq-ok">${t('Save FAQ', 'FAQ সেভ')}</button>` });
    m.parentElement.querySelector('#fq-ok').onclick = () => {
      const d = { scope: m.querySelector('#fq-scope').value, cat: m.querySelector('#fq-cat').value, pid: w.pid, q: m.querySelector('#fq-q').value.trim(), a: m.querySelector('#fq-a').value.trim() };
      if (!d.q || !d.a) { A.toast(t('Write both the question and the answer', 'প্রশ্ন ও উত্তর দুটোই লিখুন'), 'bad'); return; }
      if (isNew) A.D.faqs.unshift(Object.assign({ id: A.uid('F'), on: true }, d)); else Object.assign(f, d);
      if (after) after(); U.close(); A.commit(`FAQ saved: ${d.q}`); A.toast(d.scope === 'category' ? t(`FAQ added to every ${catNm(d.cat)} product`, `${catNm(d.cat)}-র সব প্রোডাক্টে FAQ যোগ হলো`) : t('FAQ added to the product page', 'প্রোডাক্ট পেজে FAQ যোগ হলো'), 'good'); rst.tab = isNew && !after ? 'faqs' : rst.tab; A.render();
    };
  }

  /* ================= SIZE CHARTS ================= */
  const scs = { edit: null, work: null, dirty: false, unit: 'in', pv: 2, ph: '', pw: '' };
  const usedBy = (ch) => A.D.products.filter((p) => p.status !== 'archived' && (p.sizeChartId ? p.sizeChartId === ch.id : ch.cats.includes(p.cat))).length;
  function measureSvg(cat) {
    const b = isBottom(cat);
    return b ? `<svg viewBox="0 0 60 64" width="54" height="58" aria-hidden="true"><path d="M18 6h24l3 54h-11l-4-36-4 36H15z" fill="var(--card2)" stroke="currentColor" stroke-width="1.5"/><path d="M16 4h28" stroke="var(--accent)" stroke-width="2"/><path d="M48 24v34" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3 2"/><text x="30" y="3" font-size="6" text-anchor="middle" fill="var(--accent)">W</text></svg>`
      : `<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><path d="M20 10l8-4q4 5 8 0l8 4 9 12-7 4-2-3v33H20V23l-2 3-7-4z" fill="var(--card2)" stroke="currentColor" stroke-width="1.5"/><path d="M20 26h24" stroke="var(--accent)" stroke-width="2"/><path d="M50 10v46" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3 2"/><text x="32" y="24" font-size="6" text-anchor="middle" fill="var(--accent)">C</text></svg>`;
  }
  function renderSizecharts(el) {
    ensure2(); const SC = A.D.sizeCharts;
    if (scs.edit && A.byId(SC, scs.edit)) return renderChartEditor(el, A.byId(SC, scs.edit));
    const cats = A.CATS.filter((c) => c.id !== 'extras'); const live = SC.filter((c) => !c.archived);
    const noChart = cats.filter((c) => !live.some((x) => x.cats.includes(c.id)));
    el.innerHTML = A.pageHead(t('Size charts', 'সাইজ চার্ট'), t('Charts by category, in inches with cm beside. Each category has one default; a product can also use another saved chart.', 'ক্যাটাগরি অনুযায়ী চার্ট, ইঞ্চিতে আর পাশে cm। প্রতি ক্যাটাগরির একটা ডিফল্ট; কোনো প্রোডাক্ট অন্য সেভ করা চার্টও নিতে পারে।')) + A.tabsBar('products', 'sizecharts') +
      `<div class="grid g4" style="margin-bottom:14px">${U.kpi({ label: t('Saved charts', 'সেভ করা চার্ট'), value: live.length })}${U.kpi({ label: t('Categories with a default', 'ডিফল্ট আছে এমন ক্যাটাগরি'), value: `${cats.length - noChart.length}/${cats.length}` })}${U.kpi({ label: t('Products using a chart', 'চার্ট ব্যবহার করা প্রোডাক্ট'), value: A.sum(live, usedBy) })}${U.kpi({ label: t('Exchanges for wrong size · 30 days', 'ভুল সাইজে এক্সচেঞ্জ · 30 দিন'), value: A.D.orders.filter((o) => o.status === 'exchanged' && new Date(o.created) >= ago30).length })}</div>` +
      (noChart.length ? U.callout(t(`${noChart.map((c) => c.en).join(', ')} ${noChart.length > 1 ? 'have' : 'has'} no default chart. Wrong size is the top reason for exchanges, and each exchange costs two courier trips.`, `${noChart.map((c) => c.bn).join(', ')}-র কোনো ডিফল্ট চার্ট নেই। ভুল সাইজই এক্সচেঞ্জের সবচেয়ে বড় কারণ, আর প্রতিটা এক্সচেঞ্জে দুইবার কুরিয়ার খরচ।`), 'warn', 'warn') : U.callout(t('Every category has a default size chart.', 'সব ক্যাটাগরির ডিফল্ট সাইজ চার্ট আছে।'), 'good', 'check')) +
      cats.map((c) => { const list = live.filter((x) => x.cat === c.id || x.cats.includes(c.id)); return `<div class="sc-grp"><h3>${t(c.en, c.bn)} <span class="muted small">· ${list.length}</span></h3><button class="btn sm" data-scnew="${c.id}">${A.icon('plus')}${t('New size chart', 'নতুন সাইজ চার্ট')}</button></div><div class="sc-cards">${list.map((x) => `<div class="sc-card"><div class="dg">${measureSvg(x.cat)}<div style="min-width:0"><b class="ellip" style="display:block">${A.esc(x.name)}</b><span class="small muted">${x.sizes[0]}–${x.sizes[x.sizes.length - 1]} · ${x.rows.map((r) => ptName(r.point)).slice(0, 4).join(', ')}</span></div></div><div class="row" style="gap:6px;flex-wrap:wrap">${x.cats.includes(c.id) ? U.badge(t('Default', 'ডিফল্ট'), 'good') : ''}${U.badge(t(`Used by ${usedBy(x)} products`, `${usedBy(x)}টি প্রোডাক্টে`), 'info')}${x.fit ? U.badge(x.fit, '') : ''}</div><div class="acts"><button class="btn sm primary" data-sce="${x.id}">${t('Edit', 'এডিট')}</button><button class="btn sm" data-scd="${x.id}">${t('Duplicate', 'কপি')}</button>${x.cats.includes(c.id) ? '' : `<button class="btn sm" data-scdef="${x.id}" data-c="${c.id}">${t('Set as default', 'ডিফল্ট করুন')}</button>`}<button class="btn sm ghost" data-sca="${x.id}">${t('Archive', 'আর্কাইভ')}</button></div></div>`).join('') || `<div class="sc-card">${U.empty(t('No chart yet for this category', 'এই ক্যাটাগরির এখনো চার্ট নেই'))}</div>`}</div>`; }).join('') +
      (SC.some((x) => x.archived) ? `<div class="sc-grp"><h3>${t('Archived', 'আর্কাইভ')}</h3></div><div class="sc-cards">${SC.filter((x) => x.archived).map((x) => `<div class="sc-card rv-hidden"><b>${A.esc(x.name)}</b><button class="btn sm" data-scr="${x.id}">${t('Bring back', 'ফেরত আনুন')}</button></div>`).join('')}</div>` : '');
    const g = (b, k) => A.byId(SC, b.dataset[k]);
    A.on(el, '[data-sce]', 'click', (e, b) => openChart(g(b, 'sce')));
    A.on(el, '[data-scd]', 'click', (e, b) => { const x = g(b, 'scd'); const n = JSON.parse(JSON.stringify(x)); n.id = A.uid('SC'); n.name = x.name + ' (copy)'; n.cats = []; SC.push(n); A.commit(`Duplicated size chart ${x.name}`); A.toast(t('Copy made — change what you need', 'কপি হলো — যা দরকার বদলান'), 'good'); openChart(n); });
    A.on(el, '[data-scdef]', 'click', (e, b) => { const x = g(b, 'scdef'); const c = b.dataset.c; SC.forEach((y) => (y.cats = y.cats.filter((z) => z !== c))); x.cats.push(c); A.commit(`${x.name} is now default for ${c}`); A.toast(t(`Default for ${catNm(c)} — product pages updated`, `${catNm(c)}-র ডিফল্ট হলো — প্রোডাক্ট পেজ আপডেট`), 'good'); A.render(); });
    A.on(el, '[data-sca]', 'click', (e, b) => { const x = g(b, 'sca'); U.confirm(t('Archive this chart?', 'চার্টটা আর্কাইভ করবেন?'), t(`${usedBy(x)} products use it. They switch to their category default. You can bring it back any time.`, `${usedBy(x)}টি প্রোডাক্ট এটা ব্যবহার করে। সেগুলো ক্যাটাগরির ডিফল্টে চলে যাবে। যেকোনো সময় ফেরত আনা যাবে।`), t('Archive', 'আর্কাইভ'), () => { x.archived = true; x.cats = []; A.D.products.forEach((p) => { if (p.sizeChartId === x.id) p.sizeChartId = null; }); A.commit(`Archived size chart ${x.name}`); A.toast(t('Chart archived', 'চার্ট আর্কাইভ হলো'), 'good'); A.render(); }, true); });
    A.on(el, '[data-scr]', 'click', (e, b) => { const x = g(b, 'scr'); x.archived = false; A.commit(`Brought back size chart ${x.name}`); A.toast(t('Chart is back', 'চার্ট ফেরত এলো'), 'good'); A.render(); });
    A.on(el, '[data-scnew]', 'click', (e, b) => { const c = b.dataset.scnew; const sz = isBottom(c) ? BOT_SZ.slice(1, 6) : TOP_SZ.slice(1, 6); const n = { id: A.uid('SC'), name: `${A.byId(A.CATS, c).en} – Regular`, cat: c, cats: live.some((x) => x.cats.includes(c)) ? [] : [c], sizes: sz, rows: genRows(c, sz), finder: defFinder(sz), fit: 'Regular', run: 'true', updated: A.TODAY.toISOString() }; SC.push(n); A.commit(`New size chart for ${c}`); A.toast(t('New chart made with this category’s measures — fill in the numbers', 'এই ক্যাটাগরির মাপসহ নতুন চার্ট — সংখ্যাগুলো দিন'), 'good'); openChart(n); });
  }
  function openChart(ch) { scs.edit = ch.id; scs.work = JSON.parse(JSON.stringify(ch)); scs.dirty = false; A.render(); }
  function renderChartEditor(el, ch) {
    const w = scs.work; const u = scs.unit; const cv = (v) => (u === 'in' ? v : cmS(v));
    const saveBar = (pos) => `<div class="row" style="gap:8px;flex-wrap:wrap${pos === 'b' ? ';justify-content:flex-end;margin-top:14px' : ''}"><button class="btn" data-scback="1">← ${t('All size charts', 'সব সাইজ চার্ট')}</button><button class="btn primary" data-scsave="1">${A.icon('check')}${t('Save', 'সেভ')}</button></div>`;
    const sizeIx = Math.min(scs.pv, w.sizes.length - 1);
    const sug = (() => { const h = parseFloat(scs.ph) || 0, kg = +scs.pw || 0; if (!kg) return ''; let i = w.finder.findIndex((f) => kg >= f.w1 && kg <= f.w2); if (i < 0) i = kg < (w.finder[0] || {}).w1 ? 0 : w.finder.length - 1; i = Math.max(0, Math.min(w.finder.length - 1, i + (w.run === 'small' ? 1 : w.run === 'large' ? -1 : 0))); return w.finder[i] ? w.finder[i].size : ''; })();
    el.innerHTML = A.pageHead(A.esc(w.name), t(`${catNm(w.cat)} · used by ${usedBy(ch)} products${w.cats.length ? ' · default for ' + w.cats.map(catNm).join(', ') : ''}`, `${catNm(w.cat)} · ${usedBy(ch)}টি প্রোডাক্টে${w.cats.length ? ' · ডিফল্ট: ' + w.cats.map(catNm).join(', ') : ''}`), saveBar('t')) + A.tabsBar('products', 'sizecharts') +
      `<div id="sc-dirty">${scs.dirty ? `<div class="sc-dirty">${A.icon('warn')} ${t('You have changes that are not saved yet', 'কিছু বদল এখনো সেভ হয়নি')}<button class="btn sm primary" data-scsave="1">${t('Save now', 'এখনই সেভ')}</button></div>` : ''}</div>
      <div class="grid g3"><div class="span2 stack">
        ${U.card(t('Measurements', 'মাপ'), `<div class="formgrid">${U.field(t('Chart name', 'চার্টের নাম'), U.input('sce-name', w.name))}${U.field(t('Unit', 'একক'), U.seg('sce-unit', [['in', t('inch', 'ইঞ্চি')], ['cm', 'cm']], u))}</div>
          ${U.field(t('Sizes in this chart', 'এই চার্টের সাইজ'), `<div class="chips">${allSizesFor(w.cat).map((z) => `<button class="chip ${w.sizes.includes(z) ? 'on' : ''}" data-scsz="${z}">${z}</button>`).join('')}</div>`)}
          <div class="tbl-wrap prd-sc" style="margin-top:10px"><table class="tbl"><thead><tr><th>${t(`Measure (${u === 'in' ? 'inch' : 'cm'})`, `মাপ (${u === 'in' ? 'ইঞ্চি' : 'cm'})`)}</th>${w.sizes.map((s) => `<th class="r">${s}</th>`).join('')}<th></th></tr></thead><tbody>${w.rows.map((r, ri) => `<tr><td><input class="inp" style="width:110px;text-align:left" data-pt="${ri}" value="${A.esc(r.point)}"></td>${r.vals.map((v, vi) => `<td class="r"><input class="inp" type="number" step="0.25" data-cv="${ri}-${vi}" value="${cv(v)}"><small>${u === 'in' ? cmS(v) + ' cm' : v + ' in'}</small></td>`).join('')}<td><button class="btn sm ghost" data-delr="${ri}" aria-label="${t('Remove', 'সরান')}">${A.icon('x')}</button></td></tr>`).join('')}</tbody></table></div>
          <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn sm" id="sce-addr">${A.icon('plus')}${t('Add measure', 'মাপ যোগ করুন')}</button>${pointsFor(w.cat).filter((p) => !w.rows.some((r) => r.point === p)).map((p) => `<button class="btn sm ghost" data-addpt="${p}">+ ${ptName(p)}</button>`).join('')}</div>`, { sub: t('Lay the garment flat. Chest = armpit to armpit × 2. Length = top of shoulder to hem.', 'পোশাক সমান করে রাখুন। বুক = এক বগল থেকে আরেক বগল × 2। লম্বা = কাঁধের উপর থেকে নিচ পর্যন্ত।') })}
        ${U.card(t('Size finder', 'সাইজ খোঁজা'), `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Size', 'সাইজ')}</th><th>${t('Height from', 'উচ্চতা থেকে')}</th><th>${t('to', 'পর্যন্ত')}</th><th>${t('Weight kg from', 'ওজন কেজি থেকে')}</th><th>${t('to', 'পর্যন্ত')}</th></tr></thead><tbody>${w.finder.map((f, i) => `<tr><td><b>${f.size}</b></td><td><input class="inp" style="width:76px" data-fn="${i}-h1" value="${A.esc(f.h1)}"></td><td><input class="inp" style="width:76px" data-fn="${i}-h2" value="${A.esc(f.h2)}"></td><td><input class="inp" style="width:64px" type="number" data-fn="${i}-w1" value="${f.w1}"></td><td><input class="inp" style="width:64px" type="number" data-fn="${i}-w2" value="${f.w2}"></td></tr>`).join('')}</tbody></table></div>
          <div class="formgrid" style="margin-top:10px">${U.field(t('Fit', 'ফিট'), U.select('sce-fit', [['Slim', 'Slim'], ['Regular', 'Regular'], ['Relaxed', 'Relaxed'], ['Oversized', 'Oversized']], w.fit))}${U.field(t('Sizes run', 'সাইজ কেমন'), U.select('sce-run', [['small', t('Runs small', 'ছোট হয়')], ['true', t('True to size', 'ঠিক মাপের')], ['large', t('Runs large', 'বড় হয়')]], w.run), t('Runs small moves the suggestion one size up.', '“ছোট হয়” দিলে প্রস্তাব এক সাইজ উপরে যায়।'))}</div>`, { sub: t('Customers type their height and weight on the product page and get a size from this table.', 'কাস্টমার প্রোডাক্ট পেজে উচ্চতা-ওজন দিলে এই ছক থেকে সাইজ পান।') })}
        ${U.card(t('Default for categories', 'যেসব ক্যাটাগরির ডিফল্ট'), `<div class="chips">${A.CATS.filter((c) => c.id !== 'extras').map((c) => { const other = A.D.sizeCharts.find((x) => x.id !== ch.id && !x.archived && x.cats.includes(c.id)); return `<button class="chip ${w.cats.includes(c.id) ? 'on' : ''}" data-cc="${c.id}">${t(c.en, c.bn)}${other && !w.cats.includes(c.id) ? ` <span class="c">· ${A.esc(other.name)}</span>` : ''}</button>`; }).join('')}</div>`)}
      </div>
      ${U.card(t('What customers see', 'কাস্টমার যা দেখবেন'), `<div class="prd-pp"><div class="row between" style="margin-bottom:8px"><b>${t('Size guide', 'সাইজ গাইড')}</b>${U.seg('sce-unit2', [['in', 'inch'], ['cm', 'cm']], u)}</div><div style="margin-bottom:8px">${w.sizes.map((s, i) => `<button class="prd-szb" data-pvs="${i}" style="cursor:pointer;${i === sizeIx ? 'border-color:var(--ink);background:var(--ink);color:var(--card)' : ''}">${s}</button>`).join('')}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${w.sizes.map((s) => `<th class="r">${s}</th>`).join('')}</tr></thead><tbody>${w.rows.map((r) => `<tr><td>${ptName(r.point)}</td>${r.vals.map((v, i) => `<td class="r" style="${i === sizeIx ? 'font-weight:700' : ''}">${u === 'cm' ? cmS(v) : v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px"><b class="small">${t('Find my size', 'আমার সাইজ খুঁজুন')}</b><div class="formgrid" style="margin-top:6px">${U.input('pv-h', scs.ph, `placeholder="${t('Height e.g. 5\'8', 'উচ্চতা যেমন 5\'8')}"`)}${U.input('pv-w', scs.pw, `type="number" placeholder="${t('Weight kg', 'ওজন কেজি')}"`)}</div><div class="small" style="margin-top:6px" id="pv-sug">${sug ? t(`We suggest <b>${sug}</b> · ${w.fit} fit`, `আপনার জন্য <b>${sug}</b> · ${w.fit} ফিট`) : t('Type a weight to try it', 'চেষ্টা করতে ওজন দিন')}</div></div></div>`)}
      </div>${saveBar('b')}`;
    const dirty = () => { if (!scs.dirty) { scs.dirty = true; el.querySelector('#sc-dirty').innerHTML = `<div class="sc-dirty">${A.icon('warn')} ${t('You have changes that are not saved yet', 'কিছু বদল এখনো সেভ হয়নি')}<button class="btn sm primary" data-scsave="1">${t('Save now', 'এখনই সেভ')}</button></div>`; A.on(el, '#sc-dirty [data-scsave]', 'click', save); } };
    const rr = () => { scs.dirty = true; A.render(); };
    el.querySelector('#sce-name').oninput = (e) => { w.name = e.target.value; dirty(); };
    A.on(el, '[data-pt]', 'input', (e, i) => { w.rows[+i.dataset.pt].point = i.value; dirty(); });
    A.on(el, '[data-cv]', 'input', (e, i) => { const [r, v] = i.dataset.cv.split('-').map(Number); const val = +i.value || 0; w.rows[r].vals[v] = u === 'in' ? val : Math.round(val / 2.54 * 4) / 4; i.nextElementSibling.textContent = u === 'in' ? cmS(val) + ' cm' : w.rows[r].vals[v] + ' in'; dirty(); });
    A.on(el, '[data-fn]', 'input', (e, i) => { const [ix, k] = i.dataset.fn.split('-'); w.finder[+ix][k] = k[0] === 'w' ? +i.value || 0 : i.value; dirty(); });
    A.on(el, '#sce-unit button, #sce-unit2 button', 'click', (e, b) => { scs.unit = b.dataset.v; A.render(); });
    A.on(el, '[data-pvs]', 'click', (e, b) => { scs.pv = +b.dataset.pvs; A.render(); });
    A.on(el, '[data-scsz]', 'click', (e, b) => { const z = b.dataset.scsz; const all = allSizesFor(w.cat); const next = w.sizes.includes(z) ? w.sizes.filter((x) => x !== z) : all.filter((x) => w.sizes.includes(x) || x === z); if (!next.length) return; const fresh = genRows(w.cat, next); w.rows = w.rows.map((r) => ({ point: r.point, vals: next.map((s, k) => { const oi = w.sizes.indexOf(s); if (oi >= 0) return r.vals[oi]; const f = fresh.find((x) => x.point === r.point); return f ? f.vals[k] : 0; }) })); const of = w.finder; w.finder = defFinder(next).map((f) => of.find((o) => o.size === f.size) || f); w.sizes = next; rr(); });
    A.on(el, '[data-delr]', 'click', (e, b) => { w.rows.splice(+b.dataset.delr, 1); rr(); });
    A.on(el, '[data-addpt]', 'click', (e, b) => { const f = genRows(w.cat, w.sizes).find((x) => x.point === b.dataset.addpt); w.rows.push(f || { point: b.dataset.addpt, vals: w.sizes.map(() => 0) }); rr(); });
    el.querySelector('#sce-addr').onclick = () => { w.rows.push({ point: 'New measure', vals: w.sizes.map(() => 0) }); rr(); };
    el.querySelector('#sce-fit').onchange = (e) => { w.fit = e.target.value; rr(); };
    el.querySelector('#sce-run').onchange = (e) => { w.run = e.target.value; rr(); };
    A.on(el, '[data-cc]', 'click', (e, b) => { const c = b.dataset.cc; w.cats = w.cats.includes(c) ? w.cats.filter((x) => x !== c) : w.cats.concat(c); rr(); });
    const pvh = el.querySelector('#pv-h'), pvw = el.querySelector('#pv-w');
    pvh.oninput = () => { scs.ph = pvh.value; }; pvw.onchange = () => { scs.pw = pvw.value; A.render(); };
    function save() { w.updated = A.TODAY.toISOString(); w.cats.forEach((c) => A.D.sizeCharts.forEach((x) => { if (x.id !== ch.id) x.cats = x.cats.filter((y) => y !== c); })); Object.assign(ch, JSON.parse(JSON.stringify(w))); scs.dirty = false; A.commit(`Saved size chart ${ch.name}`); A.toast(t(`Saved — ${usedBy(ch)} product pages updated`, `সেভ হলো — ${usedBy(ch)}টি প্রোডাক্ট পেজ আপডেট`), 'good'); A.render(); }
    A.on(el, '[data-scsave]', 'click', save);
    A.on(el, '[data-scback]', 'click', () => { const go = () => { scs.edit = null; scs.dirty = false; A.render(); }; if (scs.dirty) U.confirm(t('Leave without saving?', 'সেভ না করে বের হবেন?'), t('Your changes to this chart will be lost.', 'এই চার্টের বদলগুলো হারিয়ে যাবে।'), t('Leave without saving', 'সেভ ছাড়া বের হন'), go, true); else go(); });
  }

  /* ================= demo products (sample items that fill empty categories) ================= */
  const hsh = (s) => { let x = 7; for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) % 100003; return x; };
  const LEAVES = { polo: ['Half sleeve', 'Full sleeve'], tshirt: ['Half sleeve', 'Full sleeve'], shirt: ['Half sleeve', 'Full sleeve'], katua: ['Half sleeve', 'Full sleeve'], panjabi: ['Regular fit', 'Slim fit'], trouser: ['Regular fit', 'Slim fit'], denim: ['Regular fit', 'Slim fit'], jogger: ['Regular fit', 'Slim fit'], hoodie: ['Regular fit', 'Oversized'], jacket: ['Regular fit', 'Oversized'], extras: [] };
  const NODE_BN = { 'Half sleeve': 'হাফ হাতা', 'Full sleeve': 'ফুল হাতা', 'Regular fit': 'রেগুলার ফিট', 'Slim fit': 'স্লিম ফিট', Oversized: 'ওভারসাইজড' };
  const nodeNm = (s) => t(s, NODE_BN[s] || s);
  function demoData() {
    const D = A.D;
    if (D.demo && D.demo.v === 1) return D.demo;
    const ADJ = ['Classic', 'Urban', 'Everyday', 'Weekend', 'Studio', 'Coastal', 'Metro', 'Heritage'];
    const COLS = ['Navy', 'Black', 'Olive', 'Maroon', 'Grey', 'Beige', 'Sky', 'Charcoal'];
    const items = [];
    A.CATS.forEach((c) => (SUBS[c.id] || []).forEach((sub) => { const lv = LEAVES[c.id] || []; (lv.length ? lv : ['']).forEach((leaf) => {
      const n = 1 + hsh(c.id + sub + leaf) % 3;
      for (let i = 0; i < n; i++) { const k = hsh(sub + leaf + i); const steps = Math.max(1, Math.round((c.price[1] - c.price[0]) / 10)); items.push({ id: 'DM' + (items.length + 101), cat: c.id, sub, leaf, name: `${ADJ[k % ADJ.length]} ${sub}${leaf ? ' · ' + leaf : ''}`, price: c.price[0] + (k % steps) * 10, colors: [COLS[k % COLS.length], COLS[(k + 3) % COLS.length]] }); }
    }); }));
    D.demo = { v: 1, on: true, auto: false, autoN: 5, off: {}, hidden: {}, popup: { en: 'This design is coming soon — see what’s available in this category', bn: 'এই ডিজাইনটা শিগগির আসছে — এই ক্যাটাগরিতে যা আছে দেখুন' }, items };
    return D.demo;
  }
  const realSub = (p) => { const L = SUBS[p.cat] || []; return L.includes(p.sub) ? p.sub : L[hsh(p.id) % Math.max(1, L.length)] || ''; };
  const realLeaf = (p) => { const L = LEAVES[p.cat] || []; return L.length ? L[hsh(p.id + 'l') % L.length] : ''; };
  const realIn = (key) => { const [c, s, l] = key.split('/'); return A.D.products.filter((p) => p.status === 'live' && p.cat === c && (!s || realSub(p) === s) && (!l || realLeaf(p) === l)).length; };
  const keysOf = (it) => [it.cat, it.cat + '/' + it.sub, it.cat + '/' + it.sub + (it.leaf ? '/' + it.leaf : '')];
  const leafKey = (it) => keysOf(it)[2];
  // why a demo item is hidden ('' = showing on the shop)
  function demoWhy(it) {
    const d = demoData();
    if (!d.on) return t('All demo products are off', 'সব ডেমো প্রোডাক্ট বন্ধ');
    if (d.hidden[it.id]) return t('Hidden one by one', 'আলাদা করে লুকানো');
    const k = keysOf(it); const offK = [...new Set(k)].find((x) => d.off[x]);
    if (offK) return t('Switched off in ', 'বন্ধ: ') + offK.split('/').map((x, i) => (i ? nodeNm(x) : catNm(x))).join(' › ');
    if (d.auto && realIn(leafKey(it)) >= d.autoN) return t(`${d.autoN}+ real products here`, `এখানে ${d.autoN}+ আসল প্রোডাক্ট`);
    return '';
  }
  const demoShown = (it) => !demoWhy(it);
  A.demo = { data: demoData, why: demoWhy, shown: demoShown, realIn, keysOf, nodeNm, catNm, subs: (c) => SUBS[c] || [], leaves: (c) => LEAVES[c] || [], inKey: (key) => demoData().items.filter((it) => keysOf(it).includes(key)) };
  A.setProductsFilter = (k) => { st.status = k; st.cat = 'all'; };
  function demoRows() { const s = st.q.trim().toLowerCase(); return demoData().items.filter((it) => (st.cat === 'all' || it.cat === st.cat) && (!s || it.name.toLowerCase().includes(s))); }
  function demoList(el) {
    const d = demoData(); const rows = demoRows(); const shown = rows.filter(demoShown).length;
    el.querySelector('#pa-list').innerHTML = U.callout(t(`<b>${shown} of ${rows.length} demo products are showing on the shop.</b> They fill empty categories so the shop never looks bare. Customers who tap “Add to bag” see: “${A.esc(d.popup.en)}”. They never reach Google, ads, stock, reports, money or the ERP. <a href="${A.href('settings', 'demo')}">Manage in Settings › Demo products</a>`, `<b>${rows.length}টির মধ্যে ${shown}টি ডেমো প্রোডাক্ট দোকানে দেখাচ্ছে।</b> খালি ক্যাটাগরি ভরাতে এগুলো থাকে, দোকান ফাঁকা লাগে না। কাস্টমার “Add to bag” চাপলে দেখেন: “${A.esc(d.popup.bn)}”। এগুলো কখনো গুগল, বিজ্ঞাপন, স্টক, রিপোর্ট, হিসাব বা ERP-তে যায় না। <a href="${A.href('settings', 'demo')}">সেটিংস › ডেমো প্রোডাক্ট-এ বদলান</a>`), 'info', 'info') +
      U.table([
        { h: t('Product', 'প্রোডাক্ট'), f: (it) => `<div class="cellmain">${U.thumb(it)}<div style="min-width:0"><b class="ellip" style="max-width:240px">${A.esc(it.name)}</b> ${U.badge(t('Demo', 'ডেমো'), 'accent')}<span class="muted small" style="display:block">${t('Sample — not for sale', 'নমুনা — বিক্রির জন্য নয়')}</span></div></div>` },
        { h: t('Category', 'ক্যাটাগরি'), hide: true, f: (it) => `<span class="small">${catNm(it.cat)} › ${A.esc(it.sub)}${it.leaf ? ' › ' + nodeNm(it.leaf) : ''}</span>` },
        { h: t('Shown price', 'দেখানো দাম'), r: true, f: (it) => A.fmt.tk(it.price) },
        { h: t('On the shop', 'দোকানে'), f: (it) => { const w = demoWhy(it); return w ? `${U.badge(t('Hidden', 'লুকানো'), '')}<div class="muted small">${w}</div>` : U.badge(t('Showing', 'দেখাচ্ছে'), 'good'); } },
        { h: '', r: true, f: (it) => U.switch('dmi-' + it.id, !d.hidden[it.id], `data-dmi="${it.id}" aria-label="${t('Show this one', 'এটা দেখান')}"`) },
      ], rows.map((it) => Object.assign({}, it, { _id: it.id })), { empty: t('No demo product matches', 'কোনো ডেমো প্রোডাক্ট মেলেনি') });
    A.on(el, '[data-dmi]', 'change', (e, i) => { const it = d.items.find((x) => x.id === i.dataset.dmi); if (i.checked) delete d.hidden[it.id]; else d.hidden[it.id] = 1; A.commit(`Demo product ${it.name} ${i.checked ? 'shown' : 'hidden'}`); A.toast(i.checked ? t('Showing on the shop again', 'আবার দোকানে দেখাচ্ছে') : t('Hidden from the shop', 'দোকান থেকে লুকানো হলো'), 'good'); demoList(el); });
  }

  /* ================= register ================= */
  const G = (en, bn) => ({ en, bn });
  A.mod('products', {
    all: { render: (el, r) => { ensure2(); return renderAll(el, r); }, guide: G(
      '<p><b>What:</b> every product with price, ERP buying price, profit, stock and 30-day sales. The “Draft” and “Scheduled” chips show what each unfinished product still needs. The “Demo” chip lists the sample items that fill empty categories.</p><p><b>Why:</b> you see at once which polo sells, which one has no photos, and which draft is waiting only for a price.</p><p><b>How:</b> search by name, style code or SKU; filter by status or category; sort. Tick rows to change price by % (PIN), publish, hide or add to a collection. “Quick import” turns a list of style codes into drafts in one go. Click a row to open the product.</p><p>Stock is never typed here — it always comes from the ERP.</p>',
      '<p><b>কী:</b> সব প্রোডাক্ট — দাম, ERP-র কেনা দাম, লাভ, স্টক ও 30 দিনের বিক্রি। “খসড়া” আর “শিডিউল করা” চিপে প্রতিটা অসম্পূর্ণ প্রোডাক্টের কী বাকি তা দেখায়। “ডেমো” চিপে খালি ক্যাটাগরি ভরানোর নমুনা প্রোডাক্ট দেখায়।</p><p><b>কেন:</b> এক নজরে বোঝা যায় কোন পোলো চলছে, কোনটার ছবি নেই, কোন খসড়া শুধু দামের অপেক্ষায়।</p><p><b>কীভাবে:</b> নাম, স্টাইল কোড বা SKU দিয়ে খুঁজুন; অবস্থা বা ক্যাটাগরি দিয়ে ফিল্টার করুন। টিক দিয়ে % এ দাম বদলান (PIN), পাবলিশ, লুকান বা কালেকশনে দিন। “কুইক ইমপোর্ট” দিয়ে অনেক স্টাইল কোড একসাথে খসড়া হয়। লাইনে চাপলে প্রোডাক্ট খোলে।</p><p>স্টক এখানে লেখা যায় না — সবসময় ERP থেকে আসে।</p>') },
    add: { render: renderAddWizard, guide: G(
      '<p><b>What:</b> add a product in 8 short steps: Pick from ERP → Name & category → Colours & sizes → Photos → Price → Description & size chart → Google & link → Check & publish.</p><p><b>Why:</b> when the factory delivers a new polo to the warehouse, the ERP already knows its colours, sizes, stock and buying price — you only add what customers see.</p><p><b>How:</b> pick the style (or “Set” for top + bottom), follow the steps, watch the phone preview on the right. Every step saves by itself. Confirm the price with your PIN. At the end: Publish now, Schedule, or Save draft.</p><p><b>Photos & video (step 4):</b> pick a colour, then drop many photos at once, paste one, choose files or pick from the library / ERP. Drag to reorder, “Set as main”, and tag a photo with another colour. Every photo is optimised for you (5 sizes, AVIF/WebP/JPEG, 4:5) and shows its saving, like “2.4 MB → 96 KB”. A note says “Looks good” or the problem (too small, blurry, too dark, wrong ratio, cut off); “Fix” crops to 4:5 with a frame you can drag. Alt text is written for you and you can edit it. For video, upload a file (made light, poster picture taken) or paste a YouTube, Vimeo or Facebook link: your page shows its own poster and play button and loads the player only on tap. YouTube and Facebook keep a small logo while playing; Vimeo is the cleanest. “Media settings” holds the numbers (quality 78, size limits).</p><p><b>Tip:</b> the coloured tags show where each field comes from: ERP (fixed), Auto (filled for you, you can change), You.</p>',
      '<p><b>কী:</b> 8টা ছোট ধাপে প্রোডাক্ট যোগ: ERP থেকে বাছুন → নাম ও ক্যাটাগরি → কালার ও সাইজ → ছবি → দাম → বিবরণ ও সাইজ চার্ট → Google ও লিংক → চেক ও পাবলিশ।</p><p><b>কেন:</b> ফ্যাক্টরি নতুন পোলো গুদামে দিলে ERP আগেই কালার, সাইজ, স্টক ও কেনা দাম জানে — আপনি শুধু কাস্টমার যা দেখবেন তা দেন।</p><p><b>কীভাবে:</b> স্টাইল বাছুন (উপর + নিচ হলে “সেট”), ধাপগুলো পূরণ করুন, ডানে ফোনের প্রিভিউ দেখুন। প্রতিটা ধাপ নিজে সেভ হয়। দাম PIN দিয়ে কনফার্ম করুন। শেষে: এখনই পাবলিশ, শিডিউল বা খসড়া সেভ।</p><p><b>ছবি ও ভিডিও (ধাপ 4):</b> কালার বেছে একসাথে অনেক ছবি ফেলুন, পেস্ট করুন, ফাইল বাছুন বা লাইব্রেরি / ERP থেকে নিন। টেনে ক্রম বদলান, “মূল করুন” চাপুন, চাইলে ছবির কালার ট্যাগ বদলান। প্রতিটা ছবি নিজে অপটিমাইজ হয় (5 সাইজ, AVIF/WebP/JPEG, 4:5) আর কত কমল দেখায়, যেমন “2.4 MB → 96 KB”। ছবির নিচে “ঠিক আছে” বা সমস্যা লেখা থাকে (খুব ছোট, ঝাপসা, অন্ধকার, মাপ ঠিক নয়, কাটা পড়েছে); “ঠিক করুন” চাপলে টেনে সরানো যায় এমন ফ্রেমে 4:5 করে কাটে। alt লেখা নিজে লেখা হয়, বদলানো যায়। ভিডিওতে ফাইল আপলোড করুন (হালকা হয়, পোস্টার ছবি তৈরি হয়) বা YouTube, Vimeo, Facebook-এর লিংক দিন: পেজে নিজের পোস্টার ও প্লে বোতাম দেখায়, চাপলে তবেই প্লেয়ার লোড হয়। YouTube ও Facebook-এ চলার সময় ছোট লোগো থাকে; Vimeo সবচেয়ে পরিষ্কার। “মিডিয়া সেটিংস”-এ সংখ্যাগুলো আছে (কোয়ালিটি 78, সাইজের সীমা)।</p><p><b>টিপস:</b> রঙিন ট্যাগ বলে তথ্য কোথা থেকে আসে: ERP (বদলায় না), অটো (নিজে লেখা, বদলানো যায়), আপনি।</p>') },
    stock: { render: (el, r) => { ensure2(); return renderStock(el, r); }, guide: G(
      '<p><b>What:</b> stock of every product, pulled from the ERP every hour, with pieces held for open orders and stock value at buying price.</p><p><b>Why:</b> if navy polo size L runs out on a Thursday night, you lose the weekend’s orders. Days-left warns you before it happens.</p><p><b>How:</b> check “Running out soon” and press “Ask ERP to restock”. Press “Sync now” after the warehouse receives goods. Tap a product to see the colour × size grid.</p>',
      '<p><b>কী:</b> প্রতিটা প্রোডাক্টের স্টক, প্রতি ঘণ্টায় ERP থেকে আসে; খোলা অর্ডারে কত পিস আটকে আছে আর কেনা দামে স্টকের মূল্য।</p><p><b>কেন:</b> বৃহস্পতিবার রাতে নেভি পোলোর L শেষ হলে পুরো উইকেন্ডের অর্ডার হারাবেন। “কত দিন চলবে” আগেই সতর্ক করে।</p><p><b>কীভাবে:</b> “শিগগিরই শেষ হবে” দেখুন, “ERP কে রিস্টক বলুন” চাপুন। গুদামে মাল আসার পর “এখনই সিংক করুন” চাপুন। কালার × সাইজ দেখতে প্রোডাক্টে চাপুন।</p>') },
    ranking: { render: (el, r) => { ensure2(); return renderRanking(el, r); }, guide: G(
      '<p><b>What:</b> the order products appear in on your own shop (category pages, collections, search). Google ranking is in Website › SEO.</p><p><b>Why:</b> the first 8 products get most clicks. Best sellers with full sizes and good profit should be there, not a polo with only XXL left.</p><p><b>How:</b> move the sliders to decide what matters. Pin a product to the top for a launch, or push one down. ▲▼ shows the change; press “Save this order” to make it live.</p>',
      '<p><b>কী:</b> আপনার নিজের দোকানে প্রোডাক্ট কোন ক্রমে দেখাবে (ক্যাটাগরি পেজ, কালেকশন, সার্চ)। Google র‍্যাঙ্কিং আছে Website › SEO-তে।</p><p><b>কেন:</b> প্রথম 8টা প্রোডাক্টেই বেশি ক্লিক হয়। সেখানে থাকা উচিত বেশি বিক্রি, সব সাইজ আছে, ভালো লাভ — শুধু XXL বাকি এমন পোলো নয়।</p><p><b>কীভাবে:</b> স্লাইডার সরিয়ে ঠিক করুন কী বেশি গুরুত্ব পাবে। লঞ্চের সময় প্রোডাক্ট উপরে পিন করুন, বা কোনোটা নিচে নামান। ▲▼ পরিবর্তন দেখায়; “এই ক্রম সেভ করুন” চাপলে চালু হবে।</p>') },
    combos: { render: renderCombos, guide: G(
      '<p><b>What:</b> 2 or 3 pieces sold together for less: same style in 2 colours, style + style, any polo + any trousers, or exact products.</p><p><b>Why:</b> bigger orders cover the courier cost better, and slow items sell along with best sellers.</p><p><b>How:</b> “Build a combo” for one, or “Auto-generate” to make every combination of a category at a % off rule. The was-price is always the separate prices added up. A combo pauses by itself when a colour sells out and starts again when stock comes. Old combos are archived, never deleted. Prices need the PIN.</p>',
      '<p><b>কী:</b> 2 বা 3 পিস একসাথে কম দামে: একই স্টাইল 2 কালারে, স্টাইল + স্টাইল, যেকোনো পোলো + যেকোনো ট্রাউজার, বা নির্দিষ্ট প্রোডাক্ট।</p><p><b>কেন:</b> বড় অর্ডারে কুরিয়ার খরচ ভালোভাবে ওঠে, আর ধীরে চলা আইটেম বেশি বিক্রির সাথে বিক্রি হয়।</p><p><b>কীভাবে:</b> একটার জন্য “কম্বো বানান”, অথবা “অটো তৈরি” দিয়ে কোনো ক্যাটাগরির সব জোড়া % ছাড়ের নিয়মে বানান। আগের দাম সবসময় আলাদা দামের যোগফল। কোনো কালার শেষ হলে কম্বো নিজে থামে, স্টক এলে আবার চালু। পুরনো কম্বো আর্কাইভ হয়, মোছা হয় না। দামে PIN লাগে।</p>') },
    sets: { render: renderSets, guide: G(
      '<p><b>What:</b> a set is one product of a top and a bottom (for example hoodie + jogger), each with its own ERP SKUs and sizes, sold at one price.</p><p><b>Why:</b> customers who buy a tracksuit want both pieces in the same colour but often different sizes (L top, 32 bottom).</p><p><b>How:</b> “New set” → pick the top and the bottom → choose “Same colour” or “Customer picks each colour” → one price (PIN). A colour hides by itself when either piece runs out.</p>',
      '<p><b>কী:</b> সেট মানে উপর আর নিচের পিস (যেমন হুডি + জগার) মিলে একটা প্রোডাক্ট, প্রতিটার নিজের ERP SKU ও সাইজ, দাম একটাই।</p><p><b>কেন:</b> ট্র্যাকস্যুট যিনি কেনেন তিনি দুই পিস একই কালারে চান, কিন্তু সাইজ প্রায়ই আলাদা (উপরে L, নিচে 32)।</p><p><b>কীভাবে:</b> “নতুন সেট” → উপর আর নিচের পিস বাছুন → “একই কালার” বা “কাস্টমার আলাদা বাছবেন” → একটা দাম (PIN)। কোনো পিস শেষ হলে সেই কালার নিজে লুকিয়ে যায়।</p>') },
    reviews: { render: renderReviews, guide: G(
      '<p><b>What:</b> customer questions from “Ask a question”, reviews waiting to publish, hidden reviews and FAQs.</p><p><b>Why:</b> a buyer in Sylhet who sees an unanswered “Is there XXL in navy?” will not order. One answer helps every next buyer too.</p><p><b>How:</b> answer a question and press “Answer & publish”; press “Make this an FAQ” to show it on the product or on every product of the category. Bad reviews can never be deleted — reply kindly; only spam or abuse can be hidden, with a reason.</p>',
      '<p><b>কী:</b> “Ask a question” থেকে আসা কাস্টমারের প্রশ্ন, পাবলিশের অপেক্ষায় রিভিউ, লুকানো রিভিউ আর FAQ।</p><p><b>কেন:</b> সিলেটের একজন ক্রেতা “নেভিতে XXL আছে?” প্রশ্নের উত্তর না দেখলে অর্ডার করবেন না। একটা উত্তর পরের সব ক্রেতারও কাজে লাগে।</p><p><b>কীভাবে:</b> উত্তর লিখে “উত্তর দিয়ে পাবলিশ” চাপুন; “এটাকে FAQ বানান” দিলে প্রোডাক্টে বা ক্যাটাগরির সব প্রোডাক্টে দেখাবে। খারাপ রিভিউ কখনো মোছা যায় না — ভদ্রভাবে উত্তর দিন; শুধু স্প্যাম বা গালি কারণসহ লুকানো যায়।</p>') },
    sizecharts: { render: renderSizecharts, guide: G(
      '<p><b>What:</b> size charts as cards by category, each with its measures, size finder and “used by N products”.</p><p><b>Why:</b> wrong size is the main reason for exchanges, and each exchange costs two courier trips.</p><p><b>How:</b> “New size chart” in a category starts with that category’s measures (chest, length… or waist, hip, inseam…). Type inches (cm works itself out), set the size finder heights and weights, Fit and Sizes run, then Save (top or bottom). Duplicate a chart to make a variant; “Set as default” makes it the chart for the whole category.</p>',
      '<p><b>কী:</b> ক্যাটাগরি অনুযায়ী কার্ডে সাইজ চার্ট — মাপ, সাইজ খোঁজা আর “কতটা প্রোডাক্টে ব্যবহার” সহ।</p><p><b>কেন:</b> ভুল সাইজই এক্সচেঞ্জের প্রধান কারণ, আর প্রতিটা এক্সচেঞ্জে দুইবার কুরিয়ার খরচ।</p><p><b>কীভাবে:</b> কোনো ক্যাটাগরিতে “নতুন সাইজ চার্ট” দিলে সেই ক্যাটাগরির মাপের ঘর (বুক, লম্বা… বা কোমর, হিপ, ইনসিম…) নিজে আসে। ইঞ্চি দিন (cm নিজে হিসাব হয়), সাইজ খোঁজার উচ্চতা-ওজন, ফিট ও সাইজ কেমন দিন, তারপর সেভ (উপরে বা নিচে)। কপি দিয়ে আরেকটা বানান; “ডিফল্ট করুন” দিলে পুরো ক্যাটাগরিতে চলে।</p>') },
  });
})();
