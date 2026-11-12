/* Home — the owner's morning screen. Three layouts of the same widgets: A Command center, B Calm, C Classic cards. */
(function () {
  const C = A.calc, U = A.ui, f = A.fmt;
  let range = '30d';
  A.css('home', `
  .hmA-chk{display:flex;gap:8px;align-items:center;margin-top:10px;padding:9px 11px;border-radius:10px;background:var(--card2);color:var(--ink2);font-size:12.5px;text-decoration:none;border:1px dashed var(--line2)} .hmA-chk .ib svg{width:15px;height:15px} .hmA-chk:hover{border-color:var(--accent)}

    .hm-greet h1{font-size:28px}
    .hm-snap{margin-bottom:var(--gap,16px)}
    .hm-strip{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-radius:12px;background:var(--warn-soft);font-size:13px}
    .hm-do .li{gap:12px}
    .hm-do .ico{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);flex:none}
    .hm-do .ico svg{width:18px;height:18px}
    .hm-do .n{font:700 20px var(--f-head);min-width:34px;text-align:right}
    .hm-kpi .kpi-v{font-size:26px}
    .hm-hero{display:grid;grid-template-columns:1.4fr 1fr;gap:18px}
    .hm-hero .kpi-v{font-size:34px;color:#fff}
    .hm-target{height:10px;border-radius:10px;background:rgba(255,255,255,.18);overflow:hidden}
    .hm-target i{display:block;height:100%;background:#fff;border-radius:10px}
    .hm-feed .li{font-size:13px}
    .hm-design{display:flex;gap:6px;align-items:center}
    .hm-tour{border:1px solid var(--accent);background:var(--accent-soft)}
    .hm-tour ol{margin:6px 0 0;padding-left:20px;display:grid;gap:4px}
    @media (max-width:960px){.hm-hero{grid-template-columns:1fr}}
    .hmA-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .hmA-k{position:relative;display:flex;flex-direction:column;gap:6px;padding:15px 16px 13px;text-decoration:none;color:inherit;transition:border-color .15s, transform .15s}
    .hmA-k:hover{border-color:var(--line2);transform:translateY(-1px)}
    .hmA-k .hd{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:12.5px;font-weight:500}
    .hmA-k .ib{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--tone) 13%,transparent);color:var(--tone);flex:none}
    .hmA-k .ib svg{width:17px;height:17px}
    .hmA-k .v{font:650 27px/1.1 var(--f-num);letter-spacing:-.03em;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
    .hmA-k .v small{font:500 13px var(--f-num);color:var(--muted);letter-spacing:0}
    .hmA-k .ft{display:flex;align-items:flex-end;justify-content:space-between;gap:8px}
    .hmA-k .ft .s{font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-width:0}
    .hmA-k .spark{flex:none;opacity:.95}
    .hmA-tr .card-h{margin-bottom:6px}
    .hmA-sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:2px 0 12px}
    .hmA-sum>div{background:var(--card2);border-radius:10px;padding:9px 12px}
    .hmA-sum>div>span:first-child{display:block;font-size:11.5px;color:var(--muted)}
    .hmA-sum b{font:650 17px var(--f-num);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
    .hmA-do .li{gap:11px;padding:9px 0;text-decoration:none;color:inherit}
    .hmA-do .li:hover .t{color:var(--accent)}
    .hmA-do .ib{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:none;background:var(--card2);color:var(--ink2)}
    .hmA-do .ib svg{width:17px;height:17px}
    .hmA-do .bad .ib{background:var(--bad-soft);color:var(--bad)} .hmA-do .warn .ib{background:var(--warn-soft);color:var(--warn)} .hmA-do .acc .ib{background:var(--accent-soft);color:var(--accent)}
    .hmA-do .t{font-weight:600;display:block;line-height:1.3}
    .hmA-do .d{font-size:12px;color:var(--muted);display:block;margin-top:1px}
    .hmA-do .n{font:650 19px var(--f-num);font-variant-numeric:tabular-nums;min-width:30px;text-align:right}
    .hmA-do .go{color:var(--muted)} .hmA-do .go svg{width:16px;height:16px}
    .hmA-grp{font-size:11px;font-weight:650;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:10px 0 2px}
    .hmA-grp:first-child{padding-top:0}
    @media (max-width:1180px){.hmA-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:560px){.hmA-kpis{gap:10px}.hmA-k{padding:12px}.hmA-k .v{font-size:21px}.hmA-k .spark{display:none}.hmA-sum{grid-template-columns:1fr 1fr 1fr;gap:6px}.hmA-sum>div{padding:7px 8px}.hmA-sum b{font-size:14px}}
  `);

  function data() {
    const r = C.range(range); const k = C.kpis(r); const m = C.range('month'); const pm = C.pnl(m.from, m.to); const plm = C.pnl(m.prevFrom, m.prevTo);
    const cod = C.codWithCouriers(); const codOld = cod.filter((o) => (A.TODAY - new Date(o.deliveredAt)) / 864e5 > 7);
    const cnt = C.counts();
    return { r, k, pm, plm, cod, codOld, cnt };
  }

  function kpis(d) {
    const { k } = d; const fin = k.cur.delivered ? A.t(`${k.cur.delivered} delivered`, `${k.cur.delivered}টি ডেলিভারি`) : '';
    const cards = [
      U.kpi({ label: A.t('Orders', 'অর্ডার'), icon: 'orders', value: `${f.num(k.cur.orders)} <span class="muted" style="font-size:15px">· ${f.tkShort(k.cur.orderValue)}</span>`, delta: A.delta(k.cur.orders, k.prev.orders), sub: A.t('vs previous period', 'আগের সময়ের তুলনায়') }),
      U.kpi({ label: A.t('Sales (delivered)', 'বিক্রি (ডেলিভারি হওয়া)'), icon: 'truck', value: f.tk(k.cur.sales), delta: A.delta(k.cur.sales, k.prev.sales), sub: fin }),
      U.kpi({ label: A.t('Net profit', 'নিট লাভ'), icon: 'finance', value: f.tk(k.cur.profit), delta: A.delta(k.cur.profit, k.prev.profit), sub: A.t('after product cost, delivery, ads, rent & salaries', 'পণ্যের দাম, ডেলিভারি, বিজ্ঞাপন, ভাড়া ও বেতনের পরে') }),
      U.kpi({ label: A.t('Money with couriers', 'কুরিয়ারের কাছে টাকা'), icon: 'box', value: f.tk(A.sum(d.cod, (o) => o.total - C.courierFee(o) - C.codFee(o))), delta: d.codOld.length ? `<span class="delta down">${d.codOld.length} ${A.t('over 7 days', '7 দিনের বেশি')}</span>` : '<span class="delta up">' + A.t('all fresh', 'সব নতুন') + '</span>', sub: A.t(`${d.cod.length} parcels not paid out yet (after courier fees)`, `${d.cod.length}টি পার্সেলের টাকা এখনো আসেনি (কুরিয়ার ফি বাদে)`) }),
      U.kpi({ label: A.t('Return rate', 'রিটার্নের হার'), icon: 'reset', value: f.pct(k.cur.returnRate), delta: A.delta(k.cur.returnRate, k.prev.returnRate, true), sub: A.t('of finished parcels', 'শেষ হওয়া পার্সেলের মধ্যে') }),
      U.kpi({ label: A.t('Ad spend · sales per ৳1', 'বিজ্ঞাপন খরচ · ৳1-এ বিক্রি'), icon: 'marketing', value: `${f.tkShort(k.cur.ads)} <span class="muted" style="font-size:15px">· ${k.cur.roas.toFixed(1)}x</span>`, delta: A.delta(k.cur.roas, k.prev.roas), sub: A.t('all sales ÷ ad spend · ad-only ROAS is below', 'মোট বিক্রি ÷ বিজ্ঞাপন খরচ · শুধু বিজ্ঞাপনের ROAS নিচে') }),
    ];
    return cards;
  }

  /** Counts for the new order flow: Processing = orders that need a person, To ship = confirmed + booked, Incomplete from its own module. */
  function flow() {
    const os = A.D.orders; const g = (api, fn) => { try { return A[api] && A[api][fn] ? A[api][fn]() : null; } catch (e) { return null; } };
    const inc = g('incompleteApi', 'openCount');
    return { processing: os.filter((o) => o.status === 'new' || o.status === 'processing').length, toShip: os.filter((o) => o.status === 'confirmed' || o.status === 'booked').length, incomplete: inc == null ? 0 : inc };
  }
  const snap = () => (A.profitSnapshot ? `<div class="hm-snap">${A.profitSnapshot()}</div>` : '');

  function doNow(d) {
    const c = d.cnt; const fl = flow();
    const rows = [
      ['phone', A.t('Processing: orders that need a person', 'প্রসেসিং: যে অর্ডারে লোক লাগবে'), fl.processing, A.href('orders', 'processing'), c.highRisk ? A.t(`${c.highRisk} high risk`, `${c.highRisk}টি ঝুঁকি বেশি`) : ''],
      ['box', A.t('To ship: book courier, print stickers', 'পাঠানোর জন্য: কুরিয়ার বুক, স্টিকার প্রিন্ট'), fl.toShip, A.href('orders', 'ship'), ''],
      ['orders', A.t('Incomplete orders to follow up', 'অসম্পূর্ণ অর্ডারে ফলো-আপ'), fl.incomplete, A.href('orders', 'incomplete'), ''],
      ['inbox', A.t('Customer messages waiting', 'কাস্টমারের মেসেজ বাকি'), c.inbox, A.href('inbox'), ''],
      ['reset', A.t('Returned parcels to check', 'ফেরত পার্সেল চেক'), c.returns, A.href('orders', 'returns'), ''],
      ['products', A.t('Drafts ready to publish', 'পাবলিশের অপেক্ষায় ড্রাফট'), c.publish, A.href('products', 'all'), ''],
      ['star', A.t('Reviews & questions to answer', 'রিভিউ ও প্রশ্নের উত্তর'), c.reviews, A.href('products', 'reviews'), ''],
      ['warn', A.t('Sizes almost out of stock', 'প্রায় শেষ সাইজ'), c.low, A.href('products', 'stock'), ''],
    ].filter((r) => r[2] > 0);
    const total = A.sum(rows, (r) => r[2]);
    return U.card(A.t('Do now', 'এখন যা করবেন'), `<div class="list hm-do">${rows.map((r) => `<a class="li" href="${r[3]}" style="text-decoration:none"><span class="ico">${A.icon(r[0])}</span><span class="grow"><b style="font-weight:600">${r[1]}</b>${r[4] ? `<span class="small" style="color:var(--bad);display:block">${r[4]}</span>` : ''}</span><span class="n num">${r[2]}</span><span class="btn sm">${A.t('Open', 'খুলুন')}</span></a>`).join('') || U.empty(A.t('All clear. Nothing waiting.', 'সব কাজ শেষ, কিছু বাকি নেই।'))}</div>`, { sub: A.t(`${total} things waiting · most urgent first`, `মোট ${total}টি কাজ বাকি · জরুরিগুলো আগে`) });
  }

  function trend(d) {
    const days = 30; const end = A.TODAY.getTime(); const from = new Date(f.ymd(end - (days - 1) * 864e5) + 'T00:00:00+06:00').getTime();
    const labels = [], ov = [], sv = [], pv = [];
    for (let i = 0; i < days; i++) {
      const t = from + i * 864e5; const ymd = f.ymd(t); labels.push(f.date(t));
      const os = A.D.orders.filter((o) => f.ymd(o.created) === ymd && o.status !== 'cancelled');
      ov.push(A.sum(os, (o) => o.total)); sv.push(A.sum(os.filter(C.isDelivered), (o) => o.total));
      const pymd = f.ymd(t - 30 * 864e5); pv.push(A.sum(A.D.orders.filter((o) => f.ymd(o.created) === pymd && o.status !== 'cancelled'), (o) => o.total));
    }
    const sm = (a) => a.map((v, i) => Math.round(A.sum(a.slice(Math.max(0, i - 2), i + 1)) / Math.min(3, i + 1)));
    return U.card(A.t('Sales trend, last 30 days', 'বিক্রির ধারা, শেষ 30 দিন'), A.chart.line({ labels, series: [{ name: A.t('Orders placed (৳)', 'অর্ডার এসেছে (৳)'), color: 'var(--c1)', values: sm(ov) }, { name: A.t('Delivered (৳)', 'ডেলিভারি হয়েছে (৳)'), color: 'var(--c3)', values: sm(sv) }, { name: A.t('Previous 30 days', 'আগের 30 দিন'), color: 'var(--muted)', values: sm(pv), dashed: true }], height: 230 }) + `<div class="small muted" style="margin-top:6px">${A.t('3-day average so one busy day does not hide the trend. Recent days are lower in "Delivered" because those parcels are still on the way.', '3 দিনের গড়, যাতে এক দিনের ভিড়ে ধারা না হারায়। শেষ কয়েক দিনের "ডেলিভারি" কম, কারণ সেই পার্সেলগুলো এখনো পথে।')}</div>`, { more: A.t('Sales report', 'বিক্রির রিপোর্ট'), moreHref: A.href('reports', 'sales') });
  }

  function products() {
    const best = A.D.products.filter((p) => p.status === 'live').sort((a, b) => b.revenue30 - a.revenue30).slice(0, 5);
    const slow = A.D.products.filter((p) => p.status === 'live' && p.sold30 === 0).slice(0, 3);
    const low = C.lowStock(1);
    const list = best.map((p) => { const dd = C.stockDays(p); return `<a class="li" href="${A.href('products', 'all', p.id)}" style="text-decoration:none">${U.thumb(p, 36)}<span class="grow"><b class="ellip" style="display:block;font-weight:600">${A.esc(p.name)}</b><span class="small muted">${p.sold30} ${A.t('sold', 'বিক্রি')} · ${f.tk(p.revenue30)}</span></span>${dd < 14 ? U.badge(A.t(`${dd} days of stock`, `${dd} দিনের স্টক`), 'warn') : U.badge(A.t(`${dd > 99 ? '99+' : dd} days`, `${dd > 99 ? '99+' : dd} দিন`), 'good')}</a>`; }).join('');
    const tips = [];
    if (low.length) tips.push(A.t(`<b>${low.length} sizes</b> have 0–1 piece left — ask the ERP to restock.`, `<b>${low.length}টি সাইজে</b> 0-1 পিস বাকি — ERP-কে রিস্টক করতে বলুন।`));
    if (slow.length) tips.push(A.t(`<b>${slow.length}+ products</b> sold nothing in 30 days, e.g. ${A.esc(slow[0].name)} — try a combo or discount.`, `<b>${slow.length}+ প্রোডাক্ট</b> 30 দিনে একটাও বিক্রি হয়নি, যেমন ${A.esc(slow[0].name)} — কম্বো বা ছাড় দিয়ে দেখুন।`));
    return U.card(A.t('Products: what to do', 'প্রোডাক্ট: কী করবেন'), `<div class="list">${list}</div>${tips.length ? `<div class="stack" style="margin-top:10px">${tips.map((t) => U.callout(t, 'warn', 'warn')).join('')}</div>` : ''}`, { sub: A.t('Best sellers, 30 days, with stock cover', 'সেরা বিক্রি, 30 দিন, স্টক কত দিন চলবে'), more: A.t('Products report', 'প্রোডাক্ট রিপোর্ট'), moreHref: A.href('reports', 'products') });
  }

  function ads(d) {
    const r = d.r; const chs = ['Facebook', 'Google', 'TikTok'];
    const src = { Facebook: 'Facebook ads', Google: 'Google', TikTok: 'TikTok' };
    // Same attribution as Reports and Marketing: website orders count fully for their ad source; Facebook page, Instagram and WhatsApp orders count 60% for Facebook.
    const all = C.ordersIn(r.from, r.to).filter(C.isDelivered);
    const rows = chs.map((ch) => { const spend = C.adSpendIn(r.from, r.to, ch); let sales = 0, n = 0; for (const o of all) { const w = o.channel === 'Website' && o.source === src[ch] ? 1 : ch === 'Facebook' && ['Facebook', 'Instagram', 'WhatsApp'].includes(o.channel) ? 0.6 : 0; sales += w * (o.subtotal - o.discount + o.delivery); n += w; } const roas = spend ? sales / spend : 0; return { ch, spend, sales, roas, n }; });
    return U.card(A.t('Ads: are they paying?', 'বিজ্ঞাপন: টাকা ফেরত আসছে?'), U.table([
      { h: A.t('Channel', 'চ্যানেল'), f: (x) => `<b>${x.ch}</b>` },
      { h: A.t('Spend', 'খরচ'), r: 1, f: (x) => f.tk(x.spend) },
      { h: A.t('Sales', 'বিক্রি'), r: 1, f: (x) => f.tk(x.sales) },
      { h: 'ROAS', r: 1, f: (x) => `<b>${x.roas.toFixed(1)}x</b>` },
      { h: A.t('Verdict', 'পরামর্শ'), f: (x) => (x.roas >= 4 ? U.badge(A.t('Scale up', 'বাড়ান'), 'good') : x.roas >= 2.5 ? U.badge(A.t('Keep', 'চালু রাখুন'), 'info') : x.roas >= 1.5 ? U.badge(A.t('Fix', 'ঠিক করুন'), 'warn') : U.badge(A.t('Stop', 'বন্ধ করুন'), 'bad')) },
    ], rows), { sub: A.t('Delivered sales from each channel ÷ ad spend', 'প্রতিটা চ্যানেলের ডেলিভারি বিক্রি ÷ বিজ্ঞাপন খরচ'), more: A.t('Campaigns', 'ক্যাম্পেইন'), moreHref: A.href('marketing', 'campaigns') });
  }

  function couriers(d) {
    const r = C.range('30d');
    const rows = A.D.couriers.map((c) => { const os = C.ordersIn(r.from, r.to).filter((o) => o.courier === c.id); const fin = os.filter((o) => C.isDelivered(o) || o.status === 'returned'); const ok = fin.filter(C.isDelivered).length; const stuck = A.sum(d.cod.filter((o) => o.courier === c.id), (o) => o.total); return { c, n: os.length, rate: fin.length ? ok / fin.length * 100 : 0, stuck }; });
    return U.card(A.t('Delivery: by courier', 'ডেলিভারি: কুরিয়ার অনুযায়ী'), `<div class="list">${rows.map((x) => `<div class="li"><span class="grow"><b>${x.c.name}</b><span class="small muted" style="display:block">${x.n} ${A.t('parcels', 'পার্সেল')} · ${A.t('money with them', 'তাদের কাছে টাকা')} ${f.tk(x.stuck)}</span></span><span style="width:40%">${U.bar(x.rate, x.rate >= 90 ? 'var(--good)' : x.rate >= 85 ? 'var(--warn)' : 'var(--bad)')}</span><b class="num" style="width:54px;text-align:right">${f.pct(x.rate, 0)}</b></div>`).join('')}</div>`, { sub: A.t('Delivery success, last 30 days', 'ডেলিভারি সফল, শেষ 30 দিন'), more: A.t('Delivery report', 'ডেলিভারি রিপোর্ট'), moreHref: A.href('reports', 'delivery') });
  }

  function feed() {
    const os = A.D.orders.slice(0, 7);
    return U.card(A.t('Latest orders', 'সর্বশেষ অর্ডার'), `<div class="list hm-feed">${os.map((o) => `<a class="li" href="${A.href('orders', 'all', o.id)}" style="text-decoration:none"><span class="grow ellip"><b>${o.id}</b> · ${A.esc(o.name)} · <span class="muted">${A.esc(o.district)}</span></span><span class="num">${f.tk(o.total)}</span>${U.statusBadge(o.status)}<span class="small muted hide-sm" style="width:70px;text-align:right">${f.ago(o.created)}</span></a>`).join('')}</div>`, { more: A.t('All orders', 'সব অর্ডার'), moreHref: A.href('orders', 'all') });
  }

  function target(d) {
    const tgt = A.D.home.target; const got = d.pm.revenue; const pct = got / tgt * 100; const dayOf = 12, dim = 30; const pace = got / dayOf * dim;
    return `<div class="stack" style="gap:6px"><div class="row between small"><span>${A.t('November target', 'নভেম্বরের লক্ষ্য')} ${f.tk(tgt)}</span><b>${f.pct(pct, 0)}</b></div><div class="hm-target"><i style="width:${Math.min(100, pct)}%"></i></div><div class="small" style="opacity:.8">${A.t(`At this pace the month ends near ${f.tk(pace)} (${pace >= tgt ? 'target met' : f.tk(tgt - pace) + ' short'}).`, `এই গতিতে মাস শেষ হবে প্রায় ${f.tk(pace)}-এ (${pace >= tgt ? 'লক্ষ্য পূরণ' : f.tk(tgt - pace) + ' কম'})।`)} <button class="linkbtn" id="hm-set-target" style="color:#fff;text-decoration:underline">${A.t('Change target', 'লক্ষ্য বদলান')}</button></div></div>`;
  }

  function erpCard() {
    const e = A.D.erp; const bal = C.erpBalance();
    return U.card(A.t('ERP link', 'ERP সংযোগ'), `<div class="list"><div class="li"><span class="grow">${A.t('Connection', 'সংযোগ')}</span>${U.badge(A.t('Working', 'চালু আছে'), 'good')}</div><div class="li"><span class="grow">${A.t('Stock last pulled', 'শেষ স্টক এসেছে')}</span><span class="muted">${f.ago(e.lastStockSync)}</span></div><div class="li"><span class="grow">${A.t('Orders sent today', 'আজ পাঠানো অর্ডার')}</span><b>${A.D.orders.filter((o) => o.erp && o.erp.pushed && f.ymd(o.erp.at) === f.ymd(A.TODAY)).length}</b></div><div class="li"><span class="grow">${bal.owed >= 0 ? A.t('Shop owes ERP (buying price)', 'ERP-কে দেনা (কেনা দামে)') : A.t('Paid ahead to ERP', 'ERP-কে অগ্রিম দেওয়া')}</span><b>${f.tk(Math.abs(bal.owed))}</b></div></div>`, { more: A.t('Details', 'বিস্তারিত'), moreHref: A.href('settings', 'erp') });
  }

  function insights(d) {
    const { k, pm, plm } = d; const lines = [];
    const sd = k.prev.sales ? (k.cur.sales - k.prev.sales) / k.prev.sales * 100 : 0;
    lines.push(A.t(`Delivered sales are <b>${sd >= 0 ? 'up' : 'down'} ${Math.abs(sd).toFixed(0)}%</b> on the previous ${d.r.days} days.`, `ডেলিভারি বিক্রি আগের ${d.r.days} দিনের চেয়ে <b>${Math.abs(sd).toFixed(0)}% ${sd >= 0 ? 'বেশি' : 'কম'}</b>।`));
    const keep = pm.revenue ? pm.net / pm.revenue * 100 : 0;
    lines.push(A.t(`This month you keep <b>৳${Math.round(keep)}</b> of every ৳100 sold, after all costs (last month ৳${Math.round(plm.revenue ? plm.net / plm.revenue * 100 : 0)}).`, `এই মাসে প্রতি ৳100 বিক্রিতে সব খরচের পর হাতে থাকছে <b>৳${Math.round(keep)}</b> (গত মাসে ৳${Math.round(plm.revenue ? plm.net / plm.revenue * 100 : 0)})।`));
    const cats = A.groupBy(C.ordersIn(d.r.from, d.r.to).filter(C.isDelivered).flatMap((o) => o.lines), (l) => (A.byId(A.D.products, l.pid) || {}).cat);
    const top = Object.entries(cats).map(([c, ls]) => [c, A.sum(ls, (l) => l.price * l.qty)]).sort((a, b) => b[1] - a[1])[0];
    if (top) { const cat = A.byId(A.CATS, top[0]); lines.push(A.t(`<b>${cat.en}</b> bring the most money: ${f.tk(top[1])}.`, `সবচেয়ে বেশি টাকা আসছে <b>${cat.bn}</b> থেকে: ${f.tk(top[1])}।`)); }
    return lines;
  }

  function tour() {
    let off = false; try { off = localStorage.getItem('extas-proto-tour') === 'off'; } catch (e) {}
    if (off) return '';
    return `<section class="card hm-tour"><div class="row between"><h3>${A.t('How to try this prototype', 'এই প্রোটোটাইপ কীভাবে দেখবেন')}</h3><button class="btn sm ghost" id="hm-tour-x">${A.t('Hide', 'লুকান')}</button></div><ol class="small">
      <li>${A.t('Everything here is sample data for 70 days (120 products, ~850 orders, 420 customers). Your clicks really change it; Settings › System (owner) › "Reset sample data" starts again.', 'এখানে সব 70 দিনের নমুনা ডেটা (120 প্রোডাক্ট, প্রায় 850 অর্ডার, 420 জন কাস্টমার)। আপনার ক্লিকে সত্যি বদলায়; সেটিংস › সিস্টেম (মালিক) › "নমুনা ডেটা রিসেট" দিলে আবার শুরু হয়।')}</li>
      <li>${A.t('Try: Orders › Processing → confirm an order and watch it go to the ERP. Rules › Delivery → change 80 to 90, then see Rules › All rules › Checkout simulator.', 'চেষ্টা করুন: অর্ডার › প্রসেসিং → একটা অর্ডার কনফার্ম করে দেখুন ERP-তে যায়। নিয়ম › ডেলিভারি → 80 বদলে 90 করুন, তারপর নিয়ম › সব নিয়ম › চেকআউট সিমুলেটর দেখুন।')}</li>
      <li>${A.t('Finance › Profit & loss and Reports show where every taka goes. Settings › ERP connection shows what moves between the ERP and the shop.', 'হিসাব › লাভ-ক্ষতি আর রিপোর্ট-এ দেখবেন প্রতিটা টাকা কোথায় যায়। সেটিংস › ERP কানেকশন-এ দেখবেন ERP আর দোকানের মধ্যে কী আসে-যায়।')}</li>
      <li>${A.t('Switch EN / বাং at the top. Below, pick one of three Home designs. Leave comments on the page — I read them all.', 'উপরে EN / বাং বদলান। নিচে Home-এর তিনটা ডিজাইনের একটা বেছে নিন। পেজে কমেন্ট দিন — আমি সব পড়ব।')}</li></ol></section>`;
  }

  /* ---------- Design A "Command" ---------- */
  const DAY = 864e5;
  function series(d, fn) { // per-day values for the chosen range (max 30 points), for sparklines
    const r = d.r; const days = Math.max(1, Math.min(30, Math.round((r.to - r.from) / DAY))); const out = [];
    if (days <= 1) { for (let h = 0; h < 24; h += 2) { const a = r.from + h * 36e5; out.push(fn(a, a + 2 * 36e5)); } return out; }
    for (let i = 0; i < days; i++) { const a = r.to - (days - i) * DAY; out.push(fn(a, a + DAY)); }
    return out;
  }
  function kpisA(d) {
    const { k } = d; const live = (a, b) => C.ordersIn(a, b).filter((o) => o.status !== 'cancelled');
    const codSum = A.sum(d.cod, (o) => o.total - C.courierFee(o) - C.codFee(o));
    const tiles = [
      { l: A.t('Orders', 'অর্ডার'), i: 'orders', tone: 'var(--c1)', v: f.num(k.cur.orders), sm: f.tkShort(k.cur.orderValue), dl: A.delta(k.cur.orders, k.prev.orders), s: A.t(`${f.num(k.cur.pieces)} pieces`, `${f.num(k.cur.pieces)} পিস`), sp: series(d, (a, b) => live(a, b).length), h: A.href('orders', 'all') },
      { l: A.t('Sales (delivered)', 'বিক্রি (ডেলিভারি হওয়া)'), i: 'truck', tone: 'var(--c3)', v: f.tk(k.cur.sales), dl: A.delta(k.cur.sales, k.prev.sales), s: A.t(`${f.num(k.cur.delivered)} delivered`, `${f.num(k.cur.delivered)}টি ডেলিভারি`), sp: series(d, (a, b) => A.sum(C.ordersIn(a, b).filter(C.isDelivered), (o) => o.total)), h: A.href('reports', 'sales') },
      { l: A.t('Net profit', 'নিট লাভ'), i: 'finance', tone: 'var(--good)', v: f.tk(k.cur.profit), dl: A.delta(k.cur.profit, k.prev.profit), s: A.t(`keeps ৳${Math.round(k.cur.sales ? k.cur.profit / k.cur.sales * 100 : 0)} of ৳100 sold`, `৳100 বিক্রিতে থাকে ৳${Math.round(k.cur.sales ? k.cur.profit / k.cur.sales * 100 : 0)}`), sp: series(d, (a, b) => A.sum(C.ordersIn(a, b), C.orderProfit)), h: A.href('finance', 'pnl') },
      { l: A.t('Money with couriers', 'কুরিয়ারের কাছে টাকা'), i: 'cash', tone: 'var(--c4)', v: f.tk(codSum), dl: d.codOld.length ? `<span class="delta down">${d.codOld.length} ${A.t('over 7 days', '7 দিনের বেশি')}</span>` : `<span class="delta up">${A.t('all fresh', 'সব নতুন')}</span>`, s: A.t(`${d.cod.length} parcels, after fees`, `${d.cod.length}টি পার্সেল, ফি বাদে`), h: A.href('finance', 'overview') },
      { l: A.t('Return rate', 'রিটার্নের হার'), i: 'reset', tone: 'var(--bad)', v: f.pct(k.cur.returnRate), dl: A.delta(k.cur.returnRate, k.prev.returnRate, true), s: A.t('of finished parcels', 'শেষ হওয়া পার্সেলের'), sp: series(d, (a, b) => C.ordersIn(a, b).filter((o) => o.status === 'returned').length), h: A.href('reports', 'delivery') },
      { l: A.t('Ad spend · sales per ৳1', 'বিজ্ঞাপন খরচ · ৳1-এ বিক্রি'), i: 'marketing', tone: 'var(--c5)', v: f.tkShort(k.cur.ads), sm: `${k.cur.roas.toFixed(1)}x`, dl: A.delta(k.cur.roas, k.prev.roas), s: A.t('all delivered sales ÷ ads', 'মোট ডেলিভারি বিক্রি ÷ বিজ্ঞাপন'), sp: series(d, (a, b) => C.adSpendIn(a, b)), h: A.href('marketing', 'overview') },
    ];
    return `<div class="hmA-kpis">${tiles.map((x) => `<a class="card hmA-k" href="${x.h}" style="--tone:${x.tone}"><span class="hd"><span class="ib">${A.icon(x.i)}</span>${x.l}</span><span class="v">${x.v}${x.sm ? `<small>· ${x.sm}</small>` : ''}</span><span class="ft"><span class="s">${x.dl}<span>${x.s}</span></span>${x.sp ? A.chart.spark(x.sp, x.tone, 86, 26) : ''}</span></a>`).join('')}</div>`;
  }
  function trendA(d) {
    const days = 30; const end = A.TODAY.getTime(); const from = new Date(f.ymd(end - (days - 1) * DAY) + 'T00:00:00+06:00').getTime();
    const labels = [], ov = [], sv = [], pv = [];
    const live = A.D.orders.filter((o) => o.status !== 'cancelled'); const byDay = A.groupBy(live, (o) => f.ymd(o.created));
    for (let i = 0; i < days; i++) {
      const t = from + i * DAY; const ymd = f.ymd(t); labels.push(f.date(t)); const os = byDay[ymd] || [];
      ov.push(A.sum(os, (o) => o.total)); sv.push(A.sum(os.filter(C.isDelivered), (o) => o.total));
      pv.push(A.sum(byDay[f.ymd(t - 30 * DAY)] || [], (o) => o.total));
    }
    const sm = (a) => a.map((v, i) => Math.round(A.sum(a.slice(Math.max(0, i - 2), i + 1)) / Math.min(3, i + 1)));
    const cur = A.sum(ov), prev = A.sum(pv), del = A.sum(sv); const best = ov.indexOf(Math.max(...ov));
    const sum = `<div class="hmA-sum"><div><span>${A.t('Orders placed, 30 days', 'অর্ডার এসেছে, 30 দিন')}</span><b>${f.tkShort(cur)}</b> ${A.delta(cur, prev)}</div><div><span>${A.t('Delivered so far', 'এ পর্যন্ত ডেলিভারি')}</span><b>${f.tkShort(del)}</b></div><div><span>${A.t('Best day', 'সেরা দিন')}</span><b>${labels[best]}</b></div></div>`;
    const chart = A.chart.line({ labels, series: [{ name: A.t('Orders placed (৳)', 'অর্ডার এসেছে (৳)'), color: 'var(--c1)', values: sm(ov) }, { name: A.t('Delivered (৳)', 'ডেলিভারি হয়েছে (৳)'), color: 'var(--c3)', values: sm(sv) }, { name: A.t('Previous 30 days', 'আগের 30 দিন'), color: 'var(--muted)', values: sm(pv), dashed: true }], height: 236 });
    const diff = prev ? (cur - prev) / prev * 100 : 0;
    const note = A.t(`Orders are <b>${diff >= 0 ? 'up' : 'down'} ${Math.abs(diff).toFixed(0)}%</b> on the 30 days before. Lines are 3-day averages; the last days of "Delivered" are lower because those parcels are still on the way.`, `আগের 30 দিনের চেয়ে অর্ডার <b>${Math.abs(diff).toFixed(0)}% ${diff >= 0 ? 'বেশি' : 'কম'}</b>। লাইনগুলো 3 দিনের গড়; শেষ কয়েক দিনের "ডেলিভারি" কম, কারণ পার্সেলগুলো এখনো পথে।`);
    return U.card(A.t('Sales trend, last 30 days', 'বিক্রির ধারা, শেষ 30 দিন'), sum + chart + `<div class="small muted" style="margin-top:8px">${note}</div>`, { cls: 'hmA-tr', sub: A.t('Hover or tap the chart to see each day', 'প্রতিদিনের হিসাব দেখতে চার্টে মাউস রাখুন বা চাপুন'), more: A.t('Sales report', 'বিক্রির রিপোর্ট'), moreHref: A.href('reports', 'sales') });
  }
  /** Work waiting, grouped by urgency. Extra counts come from the Orders / Rules modules when they publish them (A.work), else from the order data. */
  function workCounts() {
    const D = A.D; const now = A.TODAY.getTime(); const W = (A.work && typeof A.work === 'function' ? A.work() : A.work) || {};
    const stockOut = (o) => o.lines.some((l) => { const p = A.byId(D.products, l.pid); const v = p && p.variants.find((x) => x.sku === l.sku); return v && v.stock - (v.reserved || 0) <= 0; });
    const stuckL = D.orders.filter((o) => o.status === 'new' && (o.risk !== 'low' || stockOut(o) || now - new Date(o.created) > 36 * 36e5));
    const exch = D.orders.filter((o) => o.status === 'delivered' && o.deliveredAt && now - new Date(o.deliveredAt) < 72 * 36e5 && (parseInt(o.id.replace(/\D/g, ''), 10) % 7 === 0));
    const erpDue = D.orders.filter((o) => o.status === 'returned' && !o.returnChecked && now - new Date(o.created) > 9 * DAY && now - new Date(o.created) <= 12 * DAY);
    const mism = D.orders.filter((o) => o.status === 'packed' && !o.tracking && now - new Date(o.created) > 2 * DAY);
    let sample = 0; const rs = D.rules || {}; for (const k of Object.keys(rs)) if (rs[k] && typeof rs[k] === 'object' && (rs[k].sample === true || rs[k].onSample === true)) sample++;
    if (Array.isArray(D.rulesOnSample)) sample = D.rulesOnSample.length; if (!sample && !D.rulesReviewed) sample = 3;
    return {
      stuck: W.stuck != null ? W.stuck : stuckL.length, stuckHigh: stuckL.filter((o) => o.risk !== 'low').length, stuckStock: stuckL.filter(stockOut).length,
      exch: W.exchange != null ? W.exchange : exch.length, erpDue: W.erpDue != null ? W.erpDue : erpDue.length, mism: W.mismatch != null ? W.mismatch : mism.length, sample: W.sample != null ? W.sample : sample,
    };
  }
  function doNowA(d) {
    const c = d.cnt; const w = workCounts(); const fl = flow();
    const tr = (A.D.traffic || [])[A.D.traffic.length - 1] || {}; const ckErr = Math.max(3, Math.round((tr.checkouts || 300) * 0.04)); const noRes = Math.max(4, Math.round((tr.sessions || 900) * 0.006));
    const aiWait = (A.D.aiQueue || []).filter((x) => x.st === 'wait').length || 4;
    const pc = A.D.pageCheck || (A.D.pageCheck = { at: '03:00', pages: 142, failed: [{ en: 'Size chart pop-up on phone', bn: 'ফোনে সাইজ চার্টের পপ-আপ' }] });
    const G = [
      [A.t('Urgent', 'জরুরি'), [
        ['warn', 'bad', A.t('Orders stuck in this batch', 'এই ব্যাচে আটকে থাকা অর্ডার'), w.stuck, A.href('orders', 'processing'), [w.stuckHigh ? A.t(`${w.stuckHigh} suspicious`, `${w.stuckHigh}টি সন্দেহজনক`) : '', w.stuckStock ? A.t(`${w.stuckStock} no stock`, `${w.stuckStock}টিতে স্টক নেই`) : '', A.t('waiting too long', 'অনেকক্ষণ অপেক্ষায়')].filter(Boolean).slice(0, 2).join(' · ')],
        ['clock', 'bad', A.t('ERP check days running out', 'ERP চেকের সময় শেষ হয়ে আসছে'), w.erpDue, A.href('orders', 'returns'), A.t('returned pieces, check window ends in 3 days or less', 'ফেরত পিস, চেকের সময় আর 3 দিন বা কম')],
        ['warn', 'bad', A.t(`${ckErr} customers hit an error at checkout today`, `আজ ${ckErr} জন কাস্টমার চেকআউটে এরর পেয়েছেন`), ckErr, A.href('website', 'analytics'), A.t('most at the bKash payment step — they did not finish the order', 'বেশিরভাগ bKash পেমেন্টের ধাপে — অর্ডার শেষ করতে পারেননি')],
        ['truck', 'bad', A.t('Courier entry mismatch', 'কুরিয়ারে এন্ট্রির গরমিল'), w.mism, A.href('orders', 'courier'), A.t('packed here, not entered at the courier', 'এখানে প্যাক, কুরিয়ারে এন্ট্রি হয়নি')],
      ]],
      [A.t('Today', 'আজ'), [
        ['phone', 'acc', A.t('Processing: orders that need a person', 'প্রসেসিং: যে অর্ডারে লোক লাগবে'), fl.processing, A.href('orders', 'processing'), A.t('the rest were confirmed by themselves', 'বাকিগুলো নিজে থেকে এগিয়েছে')],
        ['exchange', 'warn', A.t('Exchange requests waiting', 'এক্সচেঞ্জ রিকোয়েস্ট অপেক্ষায়'), w.exch, A.href('orders', 'returns'), A.t('72-hour window is running', '72 ঘণ্টার সময় চলছে')],
        ['box', 'acc', A.t('To ship', 'পাঠানোর জন্য'), fl.toShip, A.href('orders', 'ship'), A.t('book the courier, then print stickers', 'কুরিয়ার বুক করুন, তারপর স্টিকার প্রিন্ট')],
        ['orders', 'warn', A.t('Incomplete orders', 'অসম্পূর্ণ অর্ডার'), fl.incomplete, A.href('orders', 'incomplete'), A.t('customers who left at checkout, newest first', 'চেকআউটে ছেড়ে যাওয়া কাস্টমার, নতুন আগে')],
        ['inbox', 'acc', A.t('Customer messages waiting', 'কাস্টমারের মেসেজ বাকি'), c.inbox, A.href('inbox'), ''],
        ['check', 'acc', A.t('AI approvals waiting', 'AI অনুমোদনের অপেক্ষায়'), aiWait, '#ai--approvals', A.t('drafts and suggestions that need your OK', 'আপনার OK লাগবে এমন ড্রাফট ও প্রস্তাব')],
        ['search', 'warn', A.t('Searches with no result', 'খুঁজে কিছু পাননি'), noRes, A.href('website', 'analytics'), A.t('customers looked for something you do not show', 'কাস্টমার এমন কিছু খুঁজেছেন যা দোকানে নেই')],
      ]],
      [A.t('This week', 'এই সপ্তাহে'), [
        ['rules', 'warn', A.t('Rules still on sample values', 'নিয়মে এখনো নমুনা মান'), w.sample, A.href('rules', 'all'), A.t('check the numbers before going live', 'চালুর আগে সংখ্যাগুলো ঠিক করুন')],
        ['star', '', A.t('Reviews & questions to answer', 'রিভিউ ও প্রশ্নের উত্তর'), c.reviews, A.href('products', 'reviews'), ''],
        ['products', '', A.t('Sizes almost out of stock', 'প্রায় শেষ সাইজ'), c.low, A.href('products', 'stock'), A.t('ask the ERP to restock', 'ERP-কে রিস্টক করতে বলুন')],
      ]],
    ];
    let total = 0;
    const html = G.map(([g, rows]) => { const rs = rows.filter((r) => r[3] > 0); total += A.sum(rs, (r) => r[3]); return rs.length ? `<div class="hmA-grp">${g}</div>` + rs.map((r) => `<a class="li ${r[1]}" href="${r[4]}"><span class="ib">${A.icon(r[0])}</span><span class="grow"><span class="t">${r[2]}</span>${r[5] ? `<span class="d">${r[5]}</span>` : ''}</span><span class="n">${f.num(r[3])}</span><span class="go">${A.icon('chev')}</span></a>`).join('') : ''; }).join('');
    const chk = `<a class="hmA-chk" href="${A.href('website', 'analytics')}"><span class="ib">${A.icon(pc.failed.length ? 'warn' : 'check')}</span><span class="grow">${A.t(`Nightly page check (${pc.at}): ${pc.pages} pages checked · ${pc.failed.length ? `${pc.failed.length} failed — ${pc.failed.map((x) => x.en).join(', ')}` : 'all fine'}`, `রাতের পেজ চেক (${pc.at}): ${pc.pages}টি পেজ দেখা হয়েছে · ${pc.failed.length ? `${pc.failed.length}টি সমস্যা — ${pc.failed.map((x) => x.bn).join(', ')}` : 'সব ঠিক'}`)}</span></a>`;
    return U.card(A.t('Do now', 'এখন যা করবেন'), `<div class="list hmA-do">${html || U.empty(A.t('All clear. Nothing waiting.', 'সব কাজ শেষ, কিছু বাকি নেই।'))}</div>${chk}`, { sub: A.t(`${total} things waiting · most urgent first`, `মোট ${total}টি কাজ বাকি · জরুরিগুলো আগে`) });
  }

  function render(el) {
    const d = data(); const design = A.D.home.design || 'A';
    const hour = 20; const hello = A.t(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening', hour < 12 ? 'শুভ সকাল' : hour < 17 ? 'শুভ দুপুর' : 'শুভ সন্ধ্যা');
    const seg = U.seg('hm-range', U.rangeOpts().slice(0, 4), range);
    const dsel = `<div class="hm-design"><span class="small muted">${A.t('Design', 'ডিজাইন')}</span>${U.seg('hm-design', [['A', A.t('A · Command', 'A · কমান্ড')], ['B', A.t('B · Calm', 'B · শান্ত')], ['C', A.t('C · Classic', 'C · ক্লাসিক')]], design)}</div>`;
    const head = `<div class="phead hm-greet"><div><h1>${hello}, Mehadi</h1><p>${A.t('Thursday, 12 November · 8:00 PM · here is your shop today', 'বৃহস্পতিবার, 12 নভেম্বর · রাত 8টা · আজ আপনার দোকানের অবস্থা')}</p></div><div class="acts">${seg}</div></div>`;
    const strip = d.codOld.length ? `<div class="hm-strip">${A.icon('warn')}<span>${A.t(`<b>${d.codOld.length} COD payouts are older than 7 days</b> (${f.tk(A.sum(d.codOld, (o) => o.total))}). Ask the couriers.`, `<b>${d.codOld.length}টি COD পেমেন্ট 7 দিনের বেশি পুরোনো</b> (${f.tk(A.sum(d.codOld, (o) => o.total))})। কুরিয়ারকে জিজ্ঞেস করুন।`)}</span><a class="btn sm" href="${A.href('finance', 'overview')}">${A.t('See list', 'তালিকা দেখুন')}</a></div>` : '';
    const ins = U.card(A.t('In short', 'এক কথায়'), `<div class="stack">${insights(d).map((l) => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start">${A.icon('info')}<span>${l}</span></div>`).join('')}</div>`);
    const K = kpis(d);
    let body = '';
    if (design === 'A') {
      body = `${strip}${snap()}${kpisA(d)}
      <div class="grid g3"><div class="span2 stack">${trendA(d)}</div><div class="stack">${doNowA(d)}</div></div>
      <div class="grid g3"><div class="stack">${products()}</div><div class="stack">${ads(d)}${couriers(d)}</div><div class="stack">${ins}<section class="card hero"><div class="card-h"><h3 style="color:#fff">${A.t('Month target', 'মাসের লক্ষ্য')}</h3></div>${target(d)}</section>${erpCard()}</div></div>
      ${feed()}`;
    } else if (design === 'B') {
      body = `${strip}${snap()}<section class="card hero"><div class="hm-hero"><div>${U.kpi({ label: A.t('Net profit this month', 'এই মাসের নিট লাভ'), value: f.tk(d.pm.net), delta: A.delta(d.pm.net, d.plm.net), sub: A.t(`from ${f.tk(d.pm.revenue)} delivered sales · margin ${f.pct(d.pm.margin)}`, `${f.tk(d.pm.revenue)} ডেলিভারি বিক্রি থেকে · মার্জিন ${f.pct(d.pm.margin)}`) })}<div style="margin-top:14px">${target(d)}</div></div><div class="stack small" style="color:rgba(255,255,255,.85)">${insights(d).map((l) => `<div>• ${l}</div>`).join('')}</div></div></section>
      <div class="grid g2"><div class="stack">${doNow(d)}</div><div class="grid g2" style="align-content:start">${K.slice(0, 2).concat(K.slice(3, 5)).map((k) => `<div class="card">${k}</div>`).join('')}</div></div>
      ${trend(d)}<div class="grid g2">${products()}${ads(d)}</div>`;
    } else {
      body = `${strip}${snap()}<div class="grid g4 hm-kpi">${[K[0], K[1], K[2], K[3]].map((k) => `<div class="card">${k}</div>`).join('')}</div>${trend(d)}<div class="grid g3">${doNow(d)}${products()}<div class="stack">${couriers(d)}${erpCard()}</div></div><div class="grid g2">${ads(d)}${feed()}</div>`;
    }
    el.innerHTML = head + tour() + `<div class="row between">${dsel}<span class="small muted">${A.t('Pick one design — the final admin keeps only your choice.', 'একটা ডিজাইন বেছে নিন — আসল অ্যাডমিনে শুধু সেটাই থাকবে।')}</span></div>` + body;
    A.on(el, '#hm-range button', 'click', (e, b) => { range = b.dataset.v; A.render(); });
    A.on(el, '#hm-design button', 'click', (e, b) => { A.D.home.design = b.dataset.v; A.commit(); A.render(); });
    const tx = el.querySelector('#hm-tour-x'); if (tx) tx.onclick = () => { try { localStorage.setItem('extas-proto-tour', 'off'); } catch (e) {} A.render(); };
    const st = el.querySelector('#hm-set-target'); if (st) st.onclick = () => { const m = U.modal(A.t('Monthly sales target', 'মাসের বিক্রির লক্ষ্য'), U.field(A.t('Target for November (delivered sales)', 'নভেম্বরের লক্ষ্য (ডেলিভারি বিক্রি)'), U.money('hm-tgt', A.D.home.target)), { foot: `<button class="btn" data-close>${A.t('Cancel', 'বাতিল')}</button><button class="btn primary" id="hm-tgt-ok">${A.t('Save', 'সেভ করুন')}</button>` }); m.querySelector('#hm-tgt-ok').onclick = () => { A.D.home.target = +m.querySelector('#hm-tgt').value || A.D.home.target; U.close(); A.commit('Monthly target changed'); A.toast(A.t('Target saved', 'লক্ষ্য সেভ হয়েছে'), 'good'); A.render(); }; };
  }

  A.mod('home', { main: { render, guide: {
    en: '<p><b>What:</b> your morning screen. Top numbers for the period you pick, what needs you now, and where money comes from and goes.</p><p><b>Why:</b> in 30 seconds you know if the shop is fine: e.g. "profit is down because return rate rose in Chattogram".</p><p><b>How:</b> pick Today / 7 days / 30 days / This month. Tap any card to open its page. "Do now" lists work in the order to do it.</p>',
    bn: '<p><b>এটা কী:</b> সকালের স্ক্রিন। আপনার বাছাই করা সময়ের মূল সংখ্যা, এখন কী করতে হবে, আর টাকা কোথা থেকে আসছে-যাচ্ছে।</p><p><b>কেন:</b> 30 সেকেন্ডে বুঝবেন দোকান কেমন চলছে, যেমন "চট্টগ্রামে রিটার্ন বেড়েছে বলে লাভ কমেছে"।</p><p><b>কীভাবে:</b> আজ / 7 দিন / 30 দিন / এই মাস বাছুন। যেকোনো কার্ডে চাপলে তার পেজ খুলবে। "এখন যা করবেন" তালিকা কাজের ক্রমে সাজানো।</p>' } } });
})();
