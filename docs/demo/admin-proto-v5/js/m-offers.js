/* m-offers: Offers & discounts 360 (Rules › Offers & discounts). One hub for coupons, sale prices, free delivery,
   online-payment rewards, points & wallet, abandoned-cart offers and first-order / returning offers. */
(function () {
  'use strict';
  const A = window.A; const U = A.ui; const t = A.t; const tk = A.fmt.tk; const esc = A.esc;
  const R = () => A.D.rules; const X = () => A.rulesApi._x;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const TODAY = () => A.fmt.ymd(A.TODAY);
  const dshort = (ymd) => (ymd ? A.fmt.date(ymd + 'T12:00:00+06:00') : '');
  const addDays = (n) => A.fmt.ymd(A.TODAY.getTime() + n * 864e5);
  const catBoth = (id) => { const c = A.byId(A.CATS, id); return c ? [c.en, c.bn] : [id, id]; };
  const cat = (id) => { const c = catBoth(id); return t(c[0], c[1]); };

  A.css('offers', `
    .of-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px}
    .of-seg{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}
    .of-seg .chip .c{margin-left:6px}
    .of-segd{font-size:13px;color:var(--muted);margin:2px 0 12px}
    .of-top{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:14px;margin-bottom:14px;align-items:start}
    .of-warn{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;padding:9px 12px;border-radius:10px;background:var(--warn-bg,var(--card2));font-size:13px;margin-bottom:8px}
    .of-warn:last-child{margin-bottom:0}
    .of-cal{display:flex;flex-direction:column;gap:6px;position:relative}
    .of-cr{display:grid;grid-template-columns:130px minmax(0,1fr);gap:10px;align-items:center;font-size:12.5px}
    .of-cr .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .of-tr{position:relative;height:14px;background:var(--card2);border-radius:7px;overflow:hidden}
    .of-bar{position:absolute;top:0;bottom:0;border-radius:7px;background:var(--accent);opacity:.85} .of-bar.sch{background:var(--info,var(--accent));opacity:.6} .of-bar.end{background:var(--muted);opacity:.4}
    .of-today{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--ink)}
    .of-ax{display:grid;grid-template-columns:130px minmax(0,1fr);gap:10px;font-size:11px;color:var(--muted)} .of-ax div{display:flex;justify-content:space-between}
    .of-aw{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;padding:12px;border:1px dashed var(--accent);border-radius:12px;background:var(--card2);margin-bottom:10px}
    .of-aw:last-child{margin-bottom:0}
    .of-n{font-weight:600;font-size:14px} .of-sub{font-size:12.5px;color:var(--muted)}
    .of-ty{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
    .of-tb{border:1.5px solid var(--line);border-radius:12px;padding:12px;background:var(--card);cursor:pointer;text-align:left;font:inherit;color:var(--ink);display:flex;flex-direction:column;gap:3px}
    .of-tb b{font-size:14px} .of-tb span{font-size:12px;color:var(--muted)} .of-tb.on{border-color:var(--accent);background:var(--accent-soft,var(--card2))}
    .of-steps{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px}
    .of-steps span{font-size:12px;padding:4px 10px;border-radius:999px;background:var(--card2);color:var(--muted)} .of-steps span.on{background:var(--accent);color:#fff;font-weight:600} .of-steps span.done{background:var(--good-bg,var(--card2));color:var(--good)}
    .of-rc{border:1px solid var(--line2);border-radius:12px;padding:12px;background:var(--card);display:flex;flex-direction:column;gap:7px;font-size:13.5px}
    .of-rc .ln{display:flex;justify-content:space-between;gap:8px} .of-rc .ln.g{color:var(--good);font-weight:600} .of-rc .ln.tot{border-top:1px solid var(--line);padding-top:7px;font-weight:700}
    .of-dl{display:grid;grid-template-columns:130px minmax(0,1fr);gap:6px 10px;font-size:13.5px} .of-dl dt{color:var(--muted)} .of-dl dd{margin:0}
    .of-bi{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--line);font-size:13.5px} .of-bi:first-child{border-top:0}
    .of-wz-f{display:flex;justify-content:space-between;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--line)}
    .of-pick{max-height:170px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:4px 8px}
    @media (max-width:1100px){.of-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.of-top{grid-template-columns:minmax(0,1fr)}}
    @media (max-width:560px){.of-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.of-cr,.of-ax{grid-template-columns:84px minmax(0,1fr)}.of-dl{grid-template-columns:1fr}}
  `);

  const KINDS = {
    free_delivery: ['Free delivery', 'ফ্রি ডেলিভারি', 'Delivery charge is taken off', 'ডেলিভারি চার্জ মাফ'],
    percent: ['% off', '% ছাড়', 'A percentage off the price', 'দামের ওপর শতাংশ ছাড়'],
    flat: ['৳ off', '৳ ছাড়', 'A fixed amount off', 'নির্দিষ্ট টাকা ছাড়'],
    points: ['Points', 'পয়েন্ট', 'Bonus loyalty points', 'বোনাস লয়্যালটি পয়েন্ট'],
    wallet: ['Wallet credit', 'ওয়ালেট ক্রেডিট', 'Added to the wallet for the next purchase', 'পরের কেনাকাটার জন্য ওয়ালেটে যোগ হয়'],
    bxgy: ['Buy X get Y', 'X কিনলে Y ফ্রি', 'Free pieces', 'ফ্রি পিস'],
  };
  const WHERE = {
    checkout: ['Whole checkout', 'পুরো চেকআউট'], online: ['Online payment', 'অনলাইন পেমেন্ট'], category: ['A category', 'একটি ক্যাটাগরি'], product: ['Chosen products', 'বাছাই প্রোডাক্ট'],
    group: ['A customer group', 'কাস্টমার গ্রুপ'], campaign: ['An ad campaign', 'একটি ক্যাম্পেইন'], abandoned: ['Abandoned cart', 'অসম্পূর্ণ অর্ডার'],
  };
  const WHO = () => { const g = (R().priority && R().priority.grades) || []; return [['all', ['Everyone', 'সবাই']], ['first', ['First order', 'প্রথম অর্ডার']], ['returning', ['Returning (2+ orders)', 'পুরনো (2+ অর্ডার)']]].concat(g.map((x) => ['grade:' + x.name, [x.name + ' and above', x.name + ' ও ওপরে']])); };
  const whoTxt = (k) => { if (!k || k === 'all') return t('Everyone', 'সবাই'); if (k === 'first') return t('First order', 'প্রথম অর্ডার'); if (k === 'returning') return t('Returning', 'পুরনো কাস্টমার'); if (k === 'group') return t('Members', 'মেম্বার'); if (k.startsWith('grade:')) return k.slice(6) + '+'; return k; };
  const cfg = () => (A.D.offerCfg = A.D.offerCfg || { pointTk: 0.5 });

  /* ---------- sample data ---------- */
  function seed() {
    if (A.D.offers) return;
    const ab = A.D.abandoned || []; const lost = ab.filter((x) => !x.recovered); const lostV = A.sum(lost, (x) => x.value);
    const ret = A.D.customers.filter((c) => (c.delivered || 0) >= 2).length;
    A.D.offers = [
      { id: 'OF1', name: 'Eid sale', nameBn: 'ঈদ সেল', kind: 'percent', value: 10, maxOff: 400, channel: 'auto', code: '', where: 'campaign', target: 'AD2', who: 'all', from: '2027-02-20', to: '2027-03-07', min: 0, perCustomer: 0, total: 0, stack: 'best', on: true, stats: { orders: 0, off: 0, sales: 0, cogsPct: 58 }, history: [{ t: '2026-11-09T11:00:00+06:00', text: 'Created and scheduled', by: 'Mehadi Hasan' }] },
      { id: 'OF2', name: 'Free delivery over ৳2,000', nameBn: '৳2,000 এর বেশি অর্ডারে ফ্রি ডেলিভারি', kind: 'free_delivery', value: 0, channel: 'auto', code: '', where: 'checkout', who: 'all', from: '2026-11-10', to: '2026-11-30', min: 2000, perCustomer: 0, total: 0, stack: 'best', on: true, stats: { orders: 41, off: 3280, sales: 118400, cogsPct: 57 }, history: [{ t: '2026-11-09T16:20:00+06:00', text: 'Created', by: 'Mehadi Hasan' }] },
      { id: 'OF3', name: 'Pay online, get 5% off', nameBn: 'অনলাইনে পেমেন্টে 5% ছাড়', kind: 'percent', value: 5, maxOff: 200, channel: 'auto', code: '', where: 'online', who: 'all', from: '2026-10-20', to: '', min: 0, perCustomer: 0, total: 0, stack: 'best', on: true, stats: { orders: 28, off: 3400, sales: 68900, cogsPct: 56 }, history: [{ t: '2026-10-20T10:00:00+06:00', text: 'Created: online-payment reward', by: 'Mehadi Hasan' }] },
      { id: 'OF4', name: 'First order 10% off', nameBn: 'প্রথম অর্ডারে 10% ছাড়', kind: 'percent', value: 10, maxOff: 250, channel: 'auto', code: '', where: 'checkout', who: 'first', from: '2026-10-01', to: '', min: 1200, perCustomer: 1, total: 0, stack: 'best', on: true, stats: { orders: 33, off: 6900, sales: 79300, cogsPct: 59 }, history: [{ t: '2026-10-01T09:30:00+06:00', text: 'Created', by: 'Mehadi Hasan' }] },
      { id: 'OF5', name: 'Come back: ৳100 off', nameBn: 'ফিরে আসুন: ৳100 ছাড়', kind: 'flat', value: 100, channel: 'code', code: 'COMEBACK100', where: 'abandoned', who: 'all', from: '2026-11-01', to: '', min: 1000, perCustomer: 1, total: 300, stack: 'best', on: true, stats: { orders: 9, off: 900, sales: 21400, cogsPct: 58 }, history: [{ t: '2026-11-01T12:00:00+06:00', text: 'Created for Incomplete orders messages', by: 'Mehadi Hasan' }] },
      { id: 'OF6', name: 'Wallet credit ৳150 for next order', nameBn: 'পরের অর্ডারে ওয়ালেটে ৳150', kind: 'wallet', value: 150, channel: 'auto', code: '', where: 'online', who: 'returning', from: '2026-11-12', to: '2026-11-30', min: 3000, perCustomer: 1, total: 150, stack: 'stack', on: true, stats: { orders: 12, off: 1800, sales: 31600, cogsPct: 57 }, history: [{ t: '2026-11-12T10:10:00+06:00', text: 'Created: online-payment reward', by: 'Mehadi Hasan' }] },
      { id: 'OF7', name: '100 bonus points on hoodies', nameBn: 'হুডিতে 100 বোনাস পয়েন্ট', kind: 'points', value: 100, channel: 'auto', code: '', where: 'category', target: 'hoodie', who: 'all', from: '2026-11-20', to: '2026-11-23', min: 0, perCustomer: 0, total: 0, stack: 'stack', on: true, stats: { orders: 0, off: 0, sales: 0, cogsPct: 60 }, history: [{ t: '2026-11-11T15:00:00+06:00', text: 'Created and scheduled', by: 'Tania' }] },
      { id: 'OF8', name: 'Free delivery for returning customers over ৳1,500', nameBn: 'পুরনো কাস্টমারের ৳1,500 এর বেশি অর্ডারে ফ্রি ডেলিভারি', kind: 'free_delivery', value: 0, channel: 'auto', code: '', where: 'group', who: 'returning', from: '', to: '', min: 1500, perCustomer: 0, total: 0, stack: 'best', on: false, proposed: true, by: 'AI', reason: [`${ret} customers have 2 or more delivered orders. Free delivery from ৳1,500 may bring the quiet ones back.`, `${ret} জন কাস্টমারের 2টি বা বেশি ডেলিভারি হয়েছে। ৳1,500 থেকে ফ্রি ডেলিভারি দিলে যারা চুপ আছেন তারা ফিরতে পারেন।`], stats: { orders: 0, off: 0, sales: 0, cogsPct: 58 }, history: [] },
      { id: 'OF9', name: 'Bag left at payment: ৳150 off', nameBn: 'পেমেন্টে এসে ছেড়ে যাওয়া ব্যাগে ৳150 ছাড়', kind: 'flat', value: 150, channel: 'code', code: 'BAG150', where: 'abandoned', who: 'all', from: '', to: '', min: 1500, perCustomer: 1, total: 100, stack: 'best', on: false, proposed: true, by: 'AI', reason: [`${lost.length} bags worth ${tk(lostV)} were left unfinished and not recovered. Most stopped at Payment or Delivery.`, `${lost.length}টি ব্যাগ (${tk(lostV)}) অসম্পূর্ণ থেকে গেছে, ফেরত আসেনি। বেশিরভাগ পেমেন্ট বা ডেলিভারিতে থেমেছে।`], stats: { orders: 0, off: 0, sales: 0, cogsPct: 58 }, history: [] },
    ];
  }

  /* ---------- normalised view of everything ---------- */
  const r30 = () => A.calc.range('30d');
  const orders30 = () => A.calc.ordersIn(r30().from, r30().to).filter((o) => o.status !== 'cancelled');
  function normCoupon(c) {
    const X_ = X(); const os = orders30().filter((o) => o.coupon === c.code); const u = X_.usage(c.code);
    const st = !c.on ? 'off' : c.ends && c.ends < TODAY() ? 'ended' : c.limit && u.n >= c.limit ? 'ended' : 'running';
    return { uid: 'c:' + c.id, src: 'coupon', ref: c, name: c.code, nameBn: c.code, kind: c.type === 'freeship' ? 'free_delivery' : c.type, value: c.value, maxOff: c.maxOff, channel: 'code', code: c.code, where: 'checkout', who: c.who === 'members' ? 'group' : c.who, from: '', to: c.ends || '', min: c.min, perCustomer: c.perCustomer, total: c.limit, stack: 'best', status: st, usedAll: u.n, u30: { orders: os.length, off: A.sum(os, (o) => o.discount), sales: A.sum(os, (o) => o.total), cogs: A.sum(os, (o) => A.calc.cogs(o)) }, history: [{ t: '', text: `Coupon ${c.code} created`, by: 'Mehadi Hasan' }] };
  }
  function normSale(d) {
    const X_ = X(); const ps = X_.discStatus ? null : null; const pids = d.on === 'all' ? null : d.on === 'cat' ? A.D.products.filter((p) => p.cat === d.target).map((p) => p.id) : d.pids || [];
    let orders = 0, sales = 0, cogs = 0, off = 0; orders30().forEach((o) => { if (o.created.slice(0, 10) < d.from || o.created.slice(0, 10) > d.to) return; const ls = o.lines.filter((l) => !pids || pids.includes(l.pid)); if (!ls.length) return; orders++; ls.forEach((l) => { const s = l.price * l.qty; sales += s; cogs += (l.cost || 0) * l.qty; off += d.type === 'percent' ? Math.round(s * d.value / (100 - d.value)) : d.type === 'flat' ? d.value * l.qty : 0; }); });
    const ss = X_.discStatus(d); const st = { off: 'off', ended: 'ended', soon: 'scheduled', run: 'running' }[ss];
    return { uid: 'd:' + d.id, src: 'sale', ref: d, name: d.name, nameBn: d.name, kind: d.type, value: d.value, x: d.x, y: d.y, channel: 'auto', code: '', where: d.on === 'all' ? 'checkout' : d.on === 'cat' ? 'category' : 'product', target: d.target, pids: d.pids, who: 'all', from: d.from, to: d.to, min: 0, perCustomer: 0, total: 0, stack: 'best', status: st, u30: { orders, off, sales, cogs }, history: [{ t: '', text: 'Sale price created', by: 'Mehadi Hasan' }] };
  }
  function normOffer(o) {
    const today = TODAY(); const st = o.proposed ? 'awaiting' : o.declined ? 'declined' : !o.on ? 'off' : o.to && o.to < today ? 'ended' : o.from && o.from > today ? 'scheduled' : 'running';
    const s = o.stats || {};
    return { uid: 'o:' + o.id, src: 'offer', ref: o, name: o.name, nameBn: o.nameBn || o.name, kind: o.kind, value: o.value, maxOff: o.maxOff, channel: o.channel, code: o.code, where: o.where, target: o.target, pids: o.pids, who: o.who, from: o.from, to: o.to, min: o.min, perCustomer: o.perCustomer, total: o.total, stack: o.stack, status: st, u30: { orders: s.orders || 0, off: s.off || 0, sales: s.sales || 0, cogs: Math.round((s.sales || 0) * (s.cogsPct || 58) / 100) }, history: o.history || [] };
  }
  function all() { seed(); X().store(); return A.D.coupons.map(normCoupon).concat(A.D.discounts.map(normSale), A.D.offers.map(normOffer)); }

  /* ---------- texts & maths ---------- */
  const valTxt = (n) => {
    const v = n.value;
    if (n.kind === 'percent') return [`${v}% off${n.maxOff ? ` (up to ${tk(n.maxOff)})` : ''}`, `${v}% ছাড়${n.maxOff ? ` (সর্বোচ্চ ${tk(n.maxOff)})` : ''}`];
    if (n.kind === 'flat') return [`${tk(v)} off`, `${tk(v)} ছাড়`];
    if (n.kind === 'free_delivery') return n.min ? [`Free delivery over ${tk(n.min)}`, `${tk(n.min)} এর বেশি অর্ডারে ফ্রি ডেলিভারি`] : ['Free delivery', 'ফ্রি ডেলিভারি'];
    if (n.kind === 'points') return [`${v} bonus points`, `${v} বোনাস পয়েন্ট`];
    if (n.kind === 'wallet') return [`${tk(v)} wallet credit`, `${tk(v)} ওয়ালেট ক্রেডিট`];
    return [`Buy ${n.x || 2} get ${n.y || 1} free`, `${n.x || 2}টা কিনলে ${n.y || 1}টা ফ্রি`];
  };
  const vt = (n) => { const x = valTxt(n); return t(x[0], x[1]); };
  const whereTxt = (n) => { const w = WHERE[n.where] || [n.where, n.where]; let extra = ''; if (n.where === 'category' && n.target) extra = ': ' + cat(n.target); else if (n.where === 'product') extra = `: ${(n.pids || []).length}`; else if (n.where === 'campaign' && n.target) { const c = A.byId(A.D.campaigns, n.target); extra = c ? ': ' + c.name : ''; } return t(w[0], w[1]) + extra; };
  const stBadge = (s) => ({ running: U.badge(t('Running', 'চলছে'), 'good'), scheduled: U.badge(t('Scheduled', 'শিডিউল করা'), 'info'), ended: U.badge(t('Ended', 'শেষ')), off: U.badge(t('Off', 'বন্ধ')), awaiting: U.badge(t('Awaiting approval', 'অনুমোদনের অপেক্ষায়'), 'warn'), declined: U.badge(t('Declined', 'বাতিল')) }[s]);
  const whenTxt = (n) => (n.from || n.to ? `${n.from ? dshort(n.from) : t('Started', 'চালু')} – ${n.to ? dshort(n.to) : t('no end', 'শেষ নেই')}` : t('Always', 'সবসময়'));
  const prodsOf = (n) => { const L = A.D.products.filter((p) => p.status === 'live'); if (n.where === 'category' && n.target) return L.filter((p) => p.cat === n.target); if (n.where === 'product' && n.pids && n.pids.length) return L.filter((p) => n.pids.includes(p.id)); return L; };
  function mchk(n) {
    const ps = prodsOf(n); if (!ps.length) return { pct: null, tone: '', en: 'No live products', bn: 'লাইভ প্রোডাক্ট নেই', ps };
    const del = R().delivery.inside.fee; let worst = null;
    ps.forEach((p) => { let sp = p.price, ex = 0;
      if (n.kind === 'percent') sp = p.price - Math.min(n.maxOff || 1e9, p.price * n.value / 100); else if (n.kind === 'flat') sp = p.price - n.value; else if (n.kind === 'bxgy') sp = p.price * (n.x || 2) / ((n.x || 2) + (n.y || 1)); else if (n.kind === 'free_delivery') ex = del; else if (n.kind === 'wallet') ex = n.value; else if (n.kind === 'points') ex = n.value * cfg().pointTk;
      const m = sp > 0 ? (sp - p.cost - ex) / sp * 100 : -100; if (!worst || m < worst.m) worst = { p, m, sp }; });
    const pct = Math.round(worst.m); const tone = pct < 0 ? 'bad' : pct < 20 ? 'warn' : 'good';
    return { pct, tone, worst, ps, en: pct < 0 ? 'Below cost' : pct < 20 ? `Thin ${pct}%` : `${pct}% margin`, bn: pct < 0 ? 'কেনা দামের নিচে' : pct < 20 ? `কম লাভ ${pct}%` : `লাভ ${pct}%` };
  }
  const mBadge = (n) => { const m = mchk(n); return m.pct == null ? '—' : U.badge(t(m.en, m.bn), m.tone); };
  const kindUsable = (a) => (a.kind === 'percent' || a.kind === 'flat' || a.kind === 'bxgy' ? 'money' : a.kind === 'free_delivery' ? 'ship' : 'reward');
  function scopeOverlap(a, b) {
    const wa = a.where, wb = b.where; const aw = (w) => w === 'checkout' || w === 'online' && false;
    if (wa === wb) { if (wa === 'category') return a.target === b.target; if (wa === 'product') return (a.pids || []).some((x) => (b.pids || []).includes(x)); return true; }
    if (wa === 'checkout' || wb === 'checkout') return true;
    if ((wa === 'category' && wb === 'product') || (wa === 'product' && wb === 'category')) { const c = wa === 'category' ? a : b, p = wa === 'product' ? a : b; return (p.pids || []).some((id) => { const pr = A.byId(A.D.products, id); return pr && pr.cat === c.target; }); }
    return ['online', 'category', 'product', 'campaign', 'group'].includes(wa) && ['online', 'category', 'product', 'campaign', 'group'].includes(wb);
  }
  const whoOverlap = (a, b) => a.who === 'all' || b.who === 'all' || a.who === b.who;
  function conflictsOf(list, extra) {
    const run = list.filter((n) => n.status === 'running' || n.status === 'scheduled'); const out = [];
    const pool = extra ? run.concat([extra]) : run;
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i], b = pool[j]; if (extra && a !== extra && b !== extra) continue; if (kindUsable(a) !== kindUsable(b) || kindUsable(a) === 'reward') continue;
      if (a.stack === 'stack' || b.stack === 'stack') continue; if (!scopeOverlap(a, b) || !whoOverlap(a, b)) continue;
      if (a.from && b.to && a.from > b.to || b.from && a.to && b.from > a.to) continue;
      out.push({ a, b, msg: [`2 offers apply to the same cart: "${a.name}" and "${b.name}". ${a.stack === 'exclusive' || b.stack === 'exclusive' ? 'One is set to "only this one", so only one is used.' : 'The best one wins.'}`, `2টি অফার একই কার্টে খাটে: "${a.nameBn || a.name}" ও "${b.nameBn || b.name}"। ${a.stack === 'exclusive' || b.stack === 'exclusive' ? 'একটা "শুধু এটা" দেওয়া, তাই একটাই কাজ করবে।' : 'যেটায় ছাড় বেশি সেটাই কাজ করবে।'}`] });
    }
    if (!extra) { const r = R(); const ships = run.filter((n) => n.kind === 'free_delivery' && n.status === 'running');
      if (r.freeDelivery.on && ships.length) out.push({ a: ships[0], b: null, msg: [`"${ships[0].name}" and the Free delivery rule (over ${tk(r.freeDelivery.over)}) both give free delivery. The lower amount wins.`, `"${ships[0].nameBn || ships[0].name}" ও ফ্রি ডেলিভারি নিয়ম (${tk(r.freeDelivery.over)} এর বেশি) দুটোই ফ্রি ডেলিভারি দেয়। কম পরিমাণটা কাজ করবে।`] });
      if (r.wallets.prepaidOn && run.some((n) => n.where === 'online' && (n.kind === 'percent' || n.kind === 'flat'))) out.push({ a: run.find((n) => n.where === 'online'), b: null, msg: ['The old online-payment discount in Rules and an online-payment offer are both on. The best one wins.', 'নিয়মের পুরনো অনলাইন-পেমেন্ট ছাড় ও একটা অনলাইন-পেমেন্ট অফার দুটোই চালু। বেশিটা কাজ করবে।'] }); }
    return out;
  }
  const mapKind = (k) => (k === 'bxgy' ? null : k);

  /* ---------- Offers API (pickers in other pages) ---------- */
  A.offersApi = {
    all: () => all(),
    active: () => all().filter((n) => n.status === 'running' && mapKind(n.kind)).map((n) => ({ id: n.uid, name: [n.name, n.nameBn || n.name], kind: n.kind, value: n.kind === 'free_delivery' ? (n.min || 0) : n.value, where: n.where, status: 'running', code: n.code || '' })),
  };

  /* ---------- state ---------- */
  const st = { seg: 'all', q: '' };
  const SEGS = [
    ['all', ['All offers', 'সব অফার'], () => true, ['Everything customers can get: codes, automatic discounts, free delivery, rewards and points.', 'কাস্টমার যা যা পেতে পারেন: কোড, অটো ছাড়, ফ্রি ডেলিভারি, রিওয়ার্ড ও পয়েন্ট।']],
    ['coupons', ['Coupons', 'কুপন'], (n) => n.channel === 'code', ['Customers type a code at checkout.', 'কাস্টমার চেকআউটে কোড লেখেন।']],
    ['auto', ['Automatic discounts', 'অটো ডিসকাউন্ট'], (n) => n.channel === 'auto' && (n.kind === 'percent' || n.kind === 'flat' || n.kind === 'bxgy') && n.where !== 'online' && n.where !== 'abandoned', ['No code needed. Sale prices and automatic offers show by themselves.', 'কোড লাগে না। সেল দাম ও অটো অফার নিজে থেকে দেখায়।']],
    ['ship', ['Free delivery', 'ফ্রি ডেলিভারি'], (n) => n.kind === 'free_delivery', ['Delivery charge taken off. The basic Free delivery rule is under "Built-in rules" below.', 'ডেলিভারি চার্জ মাফ। মূল ফ্রি ডেলিভারি নিয়ম নিচে "বিল্ট-ইন নিয়ম" এ।']],
    ['online', ['Online-payment reward', 'অনলাইন-পেমেন্ট রিওয়ার্ড'], (n) => n.where === 'online', ['A reward for paying by bKash, Nagad or card: free delivery, % or ৳ off, points or wallet credit.', 'bKash, Nagad বা কার্ডে পেমেন্টের রিওয়ার্ড: ফ্রি ডেলিভারি, % বা ৳ ছাড়, পয়েন্ট বা ওয়ালেট ক্রেডিট।']],
    ['points', ['Points & wallet', 'পয়েন্ট ও ওয়ালেট'], (n) => n.kind === 'points' || n.kind === 'wallet', ['Rewards that are given back later, not taken off the price now.', 'রিওয়ার্ড যা এখন দাম থেকে কাটা হয় না, পরে ফেরত দেওয়া হয়।']],
    ['abandoned', ['Abandoned-cart offers', 'অসম্পূর্ণ অর্ডারের অফার'], (n) => n.where === 'abandoned', ['Used in Incomplete orders messages and by the AI follow-up to bring people back.', 'ইনকমপ্লিট অর্ডারের মেসেজ ও AI ফলো-আপে কাস্টমারকে ফিরিয়ে আনতে ব্যবহার হয়।']],
    ['first', ['First order / returning', 'প্রথম অর্ডার / পুরনো'], (n) => n.who === 'first' || n.who === 'returning' || (n.who || '').startsWith('grade:'), ['Offers only for new customers, or only for people who already bought.', 'শুধু নতুন কাস্টমার বা শুধু যারা আগে কিনেছেন তাদের অফার।']],
  ];

  /* ---------- page ---------- */
  function page(el, r) {
    seed(); const X_ = X(); X_.store(); X_.initV2(); X_.runScheds();
    const list = all(); const segDef = SEGS.find((s) => s[0] === st.seg) || SEGS[0];
    const q = st.q.toLowerCase(); const rows = list.filter((n) => n.status !== 'awaiting' && n.status !== 'declined' && segDef[2](n) && (!q || (n.name + ' ' + n.code + ' ' + (n.nameBn || '')).toLowerCase().includes(q)))
      .sort((a, b) => ({ running: 0, scheduled: 1, off: 2, ended: 3 }[a.status] - { running: 0, scheduled: 1, off: 2, ended: 3 }[b.status]) || b.u30.sales - a.u30.sales);
    const real = list.filter((n) => n.status !== 'awaiting' && n.status !== 'declined');
    const active = real.filter((n) => n.status === 'running').length; const sch = real.filter((n) => n.status === 'scheduled').length;
    const used = A.sum(real, (n) => n.u30.orders), off = A.sum(real, (n) => n.u30.off), sales = A.sum(real, (n) => n.u30.sales), cogs = A.sum(real, (n) => n.u30.cogs);
    const profit = sales - cogs; const mg = sales ? profit / sales * 100 : null; const roi = off ? profit / off : null;
    const conf = conflictsOf(list); const aw = list.filter((n) => n.status === 'awaiting');
    const kp = (label, value, sub) => U.card('', U.kpi({ label, value, sub }));
    el.innerHTML = A.pageHead(t('Offers & discounts', 'অফার ও ডিসকাউন্ট'), t('Every way a customer can pay less or get more: one place to see what runs, what it costs and what it earns.', 'কাস্টমার যেভাবে কম দেন বা বেশি পান: কী চলছে, খরচ কত, আয় কত — এক জায়গায়।'),
      `<button class="btn" id="of-ns">${A.icon('plus')} ${t('Sale price', 'সেল দাম')}</button><button class="btn" id="of-nc">${A.icon('plus')} ${t('Quick coupon', 'দ্রুত কুপন')}</button><button class="btn primary" id="of-new">${A.icon('plus')} ${t('New offer', 'নতুন অফার')}</button>`) + A.tabsBar('rules', 'coupons') +
      `<div class="of-kpis">${kp(t('Active offers', 'চালু অফার'), active, sch ? t(`${sch} scheduled`, `${sch}টি শিডিউল করা`) : t('right now', 'এই মুহূর্তে'))}${kp(t('Orders with an offer', 'অফারে অর্ডার'), A.fmt.num(used), t('last 30 days', 'গত 30 দিন'))}${kp(t('Discount given', 'ছাড় দেওয়া'), tk(off), t('last 30 days', 'গত 30 দিন'))}${kp(t('Sales from offers', 'অফার থেকে বিক্রি'), tk(sales), t('last 30 days', 'গত 30 দিন'))}${kp(t('Margin after discount', 'ছাড়ের পর লাভ'), mg == null ? '—' : A.fmt.pct(mg, 0), t('vs ERP buying price', 'ERP কেনা দামের তুলনায়'))}${kp('ROI', roi == null ? '—' : '৳' + roi.toFixed(1), t('profit per ৳1 given', '৳1 ছাড়ে লাভ'))}</div>` +
      (aw.length ? U.card(t('Awaiting your approval', 'আপনার অনুমোদনের অপেক্ষায়'), aw.map((n) => { const o = n.ref; const m = mchk(n); return `<div class="of-aw"><div style="min-width:0;flex:1 1 260px"><div class="of-n">${U.badge('AI', 'accent')} ${esc(t(n.name, n.nameBn))}</div><div class="of-sub">${vt(n)} · ${whereTxt(n)} · ${whoTxt(n.who)}</div><div style="margin-top:6px;font-size:13px">${esc(t(o.reason[0], o.reason[1]))}</div><div style="margin-top:6px">${m.pct == null ? '' : U.badge(t(m.en, m.bn), m.tone)}</div></div><div class="row"><button class="btn" data-dec="${o.id}">${t('Decline', 'বাতিল')}</button><button class="btn primary" data-apr="${o.id}">${A.icon('check')} ${t('Approve', 'অনুমোদন')}</button></div></div>`; }).join(''), { sub: t('The AI only proposes. Nothing goes live until you approve with your PIN.', 'AI শুধু প্রস্তাব দেয়। আপনি PIN দিয়ে অনুমোদন না করলে কিছু চালু হয় না।') }) + '<div style="height:14px"></div>' : '') +
      `<div class="of-top">${U.card(t('Heads up', 'সতর্কতা'), conf.length ? conf.slice(0, 4).map((c, i) => `<div class="of-warn"><span>${A.icon('warn')} ${esc(t(c.msg[0], c.msg[1]))}</span>${c.a ? `<button class="linkbtn" data-open="${c.a.uid}">${t('Open', 'খুলুন')}</button>` : ''}</div>`).join('') : `<div class="muted">${t('No overlaps. Every cart gets at most one discount.', 'কোনো ওভারল্যাপ নেই। প্রতিটা কার্টে একটার বেশি ছাড় লাগে না।')}</div>`, { sub: t('Offers that could apply to the same cart.', 'যে অফারগুলো একই কার্টে খাটতে পারে।') })}${U.card(t('Calendar', 'ক্যালেন্ডার'), calHtml(real), { sub: t('Next 5 weeks. The dark line is today.', 'পরের 5 সপ্তাহ। কালো দাগ আজ।') })}</div>` +
      `<div class="of-seg">${SEGS.map((s) => `<button class="chip ${st.seg === s[0] ? 'on' : ''}" data-seg="${s[0]}">${t(s[1][0], s[1][1])}<span class="c">${real.filter(s[2]).length}</span></button>`).join('')}</div><div class="of-segd">${t(segDef[3][0], segDef[3][1])}</div>` +
      U.card(t('Offers', 'অফার'), `<div class="row" style="margin-bottom:10px"><input class="inp" id="of-q" placeholder="${t('Search offers or codes…', 'অফার বা কোড খুঁজুন…')}" value="${esc(st.q)}" style="max-width:320px"></div>` + (rows.length ? U.table([
        { h: t('Offer', 'অফার'), f: (n) => `<b>${esc(t(n.name, n.nameBn))}</b><div class="muted small">${vt(n)}${n.code ? ` · <span class="mono">${esc(n.code)}</span>` : ''}${n.src === 'sale' ? ' · ' + t('sale price', 'সেল দাম') : ''}</div>` },
        { h: t('Applies to', 'কোথায় খাটে'), f: (n) => `${whereTxt(n)}<div class="muted small">${whoTxt(n.who)}${n.min ? ' · ' + t('min ', 'ন্যূনতম ') + tk(n.min) : ''}</div>`, hide: true },
        { h: t('When', 'কখন'), f: (n) => whenTxt(n), hide: true },
        { h: t('Limits', 'সীমা'), f: (n) => `${n.perCustomer ? t(`${n.perCustomer} per customer`, `জনপ্রতি ${n.perCustomer}`) : t('No per-customer limit', 'জনপ্রতি সীমা নেই')}<div class="muted small">${n.total ? t(`${n.total} uses in all`, `মোট ${n.total} বার`) : t('No total limit', 'মোট সীমা নেই')} · ${t({ best: 'best wins', stack: 'can stack', exclusive: 'only this one' }[n.stack] || 'best wins', { best: 'সেরাটা জেতে', stack: 'একসাথে চলে', exclusive: 'শুধু এটা' }[n.stack] || 'সেরাটা জেতে')}</div>`, hide: true },
        { h: t('Used (30d)', 'ব্যবহার (30দি)'), r: true, f: (n) => A.fmt.num(n.u30.orders) },
        { h: t('Cost', 'খরচ'), r: true, f: (n) => tk(n.u30.off), hide: true },
        { h: t('Sales', 'বিক্রি'), r: true, f: (n) => tk(n.u30.sales), hide: true },
        { h: t('Margin', 'লাভ'), f: mBadge },
        { h: t('Status', 'অবস্থা'), f: (n) => stBadge(n.status) },
        { h: '', r: true, f: (n) => U.switch('ofs-' + n.uid, n.status === 'running' || n.status === 'scheduled', `data-osw="${n.uid}"`) },
      ], rows.map((n) => Object.assign({ _id: n.uid }, n)), { onRow: true }) : U.empty(t('No offers here yet.', 'এখানে এখনো কোনো অফার নেই।'))), { sub: t('Cost = discount given. Click a row for the full picture.', 'খরচ = দেওয়া ছাড়। পুরো ছবি দেখতে সারিতে ক্লিক করুন।') }) +
      `<div style="height:14px"></div>` + U.card(t('Built-in rules that also change the price', 'বিল্ট-ইন নিয়ম যা দামও বদলায়'), builtinHtml(), { sub: t('Basic rules from Rules › All rules. They are counted in the overlap check above.', 'নিয়ম › সব নিয়ম এর মূল নিয়ম। ওপরের ওভারল্যাপ চেকে এগুলোও ধরা হয়।') }) +
      `<div style="height:14px"></div><div class="grid g2" style="align-items:start">${X_.cardHtml(X_.spec('buymore'))}<div></div></div>`;
    wire(el, list, r);
  }
  function calHtml(real) {
    const start = A.TODAY.getTime() - 7 * 864e5, span = 42 * 864e5; const pc = (ymd) => Math.max(0, Math.min(100, (new Date(ymd + 'T00:00:00+06:00').getTime() - start) / span * 100));
    const rs = real.filter((n) => n.status !== 'off' && n.status !== 'ended').slice(0, 9);
    if (!rs.length) return `<div class="muted">${t('Nothing running or planned.', 'কিছু চলছে বা প্ল্যান করা নেই।')}</div>`;
    const days = [0, 14, 28, 42].map((d) => dshort(A.fmt.ymd(start + d * 864e5)));
    return `<div class="of-cal">${rs.map((n) => { const a = n.from ? pc(n.from) : 0; const b = n.to ? pc(n.to) : 100; return `<div class="of-cr"><span class="nm" title="${esc(n.name)}">${esc(t(n.name, n.nameBn))}</span><span class="of-tr"><span class="of-bar ${n.status === 'scheduled' ? 'sch' : ''}" style="left:${a}%;width:${Math.max(2, b - a)}%"></span><span class="of-today" style="left:${pc(TODAY())}%"></span></span></div>`; }).join('')}<div class="of-ax"><span></span><div>${days.map((d) => `<span>${d}</span>`).join('')}</div></div></div>`;
  }
  function builtinHtml() {
    const r = R(); const rows = [
      [t('Free delivery rule', 'ফ্রি ডেলিভারি নিয়ম'), r.freeDelivery.on ? t(`On orders over ${tk(r.freeDelivery.over)}`, `${tk(r.freeDelivery.over)} এর বেশি অর্ডারে`) : t('Off', 'বন্ধ'), r.freeDelivery.on, 'free'],
      [t('Online-payment discount (basic setting)', 'অনলাইন-পেমেন্ট ছাড় (মূল সেটিং)'), r.wallets.prepaidOn ? (r.wallets.prepaidType === 'percent' ? r.wallets.prepaidOff + '%' : tk(r.wallets.prepaidOff)) + t(' off', ' ছাড়') + ' · ' + t('Better: make an online-payment offer above', 'ভালো: ওপরে অনলাইন-পেমেন্ট অফার বানান') : t('Off. Use an online-payment offer instead.', 'বন্ধ। এর বদলে অনলাইন-পেমেন্ট অফার ব্যবহার করুন।'), r.wallets.prepaidOn, 'prepaid'],
      [t('Buy more, save', 'বেশি কিনলে ছাড়'), r.buyMore.on ? r.buyMore.tiers.map((x) => `${x.qty}+ → ${x.off}%`).join(' · ') : t('Off', 'বন্ধ'), r.buyMore.on, 'buymore'],
      [t('Customer grade discount', 'কাস্টমার গ্রেড ছাড়'), r.priority && r.priority.on ? r.priority.grades.map((g) => `${g.name} ${g.off}%`).join(' · ') : t('Off', 'বন্ধ'), r.priority && r.priority.on, 'priority'],
    ];
    return rows.map((x) => `<div class="of-bi"><div style="min-width:0"><b>${x[0]}</b><div class="muted small">${x[1]}</div></div><div class="row">${x[2] ? U.badge(t('On', 'চালু'), 'good') : U.badge(t('Off', 'বন্ধ'))}<a class="linkbtn" href="${A.href('rules', 'all', x[3])}">${t('Open', 'খুলুন')} →</a></div></div>`).join('');
  }

  function wire(el, list, r) {
    const X_ = X(); const byUid = (u) => list.find((n) => n.uid === u);
    el.querySelector('#of-new').onclick = () => wizard();
    el.querySelector('#of-nc').onclick = () => X_.couponModal();
    el.querySelector('#of-ns').onclick = () => X_.discountModal();
    A.on(el, '[data-seg]', 'click', (e, b) => { st.seg = b.dataset.seg; A.render(); });
    const q = el.querySelector('#of-q'); if (q) q.oninput = () => { st.q = q.value; A.render(); const n = document.querySelector('#of-q'); if (n) { n.focus(); n.setSelectionRange(st.q.length, st.q.length); } };
    A.on(el, '[data-open]', 'click', (e, b) => { const n = byUid(b.dataset.open); if (n) detail(n); });
    A.on(el, '.switch', 'click', (e) => e.stopPropagation());
    A.on(el, '[data-osw]', 'change', (e, i) => { const n = byUid(i.dataset.osw); const on = !(n.status === 'running' || n.status === 'scheduled'); i.checked = !on; toggle(n, on); });
    el.querySelectorAll('tr[data-row]').forEach((tr) => (tr.onclick = () => { const n = byUid(tr.dataset.row); if (n) detail(n); }));
    A.on(el, '[data-apr]', 'click', (e, b) => { const o = A.byId(A.D.offers, b.dataset.apr); const n = normOffer(o); X_.pinAsk(t('Approve this offer?', 'এই অফার অনুমোদন করবেন?'), `<p><b>${esc(o.name)}</b><br>${vt(n)} · ${whereTxt(n)}</p>`, t('Approve', 'অনুমোদন'), () => { o.proposed = false; o.on = true; if (!o.from) o.from = TODAY(); o.history.unshift({ t: A.TODAY.toISOString(), text: 'Approved by the owner (proposed by AI)', by: 'Mehadi Hasan' }); A.commit('Offer approved: ' + o.name); A.toast(t('Offer approved and live', 'অফার অনুমোদিত ও চালু'), 'good'); A.render(); }); });
    A.on(el, '[data-dec]', 'click', (e, b) => { const o = A.byId(A.D.offers, b.dataset.dec); U.confirm(t('Decline this proposal?', 'এই প্রস্তাব বাতিল করবেন?'), esc(o.name), t('Decline', 'বাতিল'), () => { o.proposed = false; o.declined = true; o.history.unshift({ t: A.TODAY.toISOString(), text: 'Declined by the owner', by: 'Mehadi Hasan' }); A.commit('Offer proposal declined: ' + o.name); A.toast(t('Proposal declined', 'প্রস্তাব বাতিল')); A.render(); }, true); });
    el.querySelectorAll('.rl-card').forEach(X_.wireCard);
    if (r.id) { const n = byUid(r.id) || list.find((x) => x.ref && x.ref.id === r.id); if (n) setTimeout(() => detail(n), 60); }
  }
  function toggle(n, on) {
    const X_ = X(); if (n.src === 'coupon') return X_.setCoupon(n.ref, on); if (n.src === 'sale') return X_.setDiscount(n.ref, on);
    const o = n.ref; const go = () => { o.on = on; o.history.unshift({ t: A.TODAY.toISOString(), text: on ? 'Turned on' : 'Turned off', by: 'Mehadi Hasan' }); A.commit(`Offer ${o.name} turned ${on ? 'on' : 'off'}`); A.toast(on ? t('Offer is on', 'অফার চালু') : t('Offer is off. Customers no longer get it.', 'অফার বন্ধ। কাস্টমার আর পাবেন না।'), 'good'); U.close(); A.render(); };
    if (on) X_.pinAsk(t('Turn this offer on?', 'এই অফার চালু করবেন?'), `<p><b>${esc(o.name)}</b><br>${vt(n)} · ${whereTxt(n)}</p>`, t('Turn on', 'চালু করুন'), go); else go();
  }

  /* ---------- how checkout shows it ---------- */
  function receipt(n) {
    const sub = 2400, del = R().delivery.inside.fee; let off = 0, free = false, note = '';
    if (n.kind === 'percent') off = Math.min(n.maxOff || 1e9, Math.round(sub * n.value / 100)); else if (n.kind === 'flat') off = n.value; else if (n.kind === 'free_delivery') free = true; else if (n.kind === 'bxgy') off = Math.round(1200 / ((n.x || 2) + (n.y || 1)) * (n.y || 1));
    if (n.kind === 'points') note = t(`You will earn ${n.value} bonus points`, `আপনি ${n.value} বোনাস পয়েন্ট পাবেন`); if (n.kind === 'wallet') note = t(`${tk(n.value)} will be added to your wallet for your next order`, `পরের অর্ডারের জন্য ওয়ালেটে ${tk(n.value)} যোগ হবে`);
    const total = sub - off + (free ? 0 : del);
    const name = t(n.name, n.nameBn || n.name);
    return `<div class="of-rc"><div class="ln"><span>${t('Products (2 pcs)', 'প্রোডাক্ট (2 পিস)')}</span><b>${tk(sub)}</b></div>${off ? `<div class="ln g"><span>${esc(name)}${n.code ? ` · ${esc(n.code)}` : ''}</span><b>−${tk(off)}</b></div>` : ''}<div class="ln ${free ? 'g' : ''}"><span>${t('Delivery', 'ডেলিভারি')}</span><b>${free ? `<s class="muted">${tk(del)}</s> ${t('Free', 'ফ্রি')}` : tk(del)}</b></div>${note ? `<div class="ln g"><span>${A.icon('star')} ${esc(note)}</span></div>` : ''}<div class="ln tot"><span>${t('Total', 'মোট')}</span><b>${tk(total)}</b></div></div>`;
  }
  function sentence(n) {
    const who = { all: ['', ''], first: [' on your first order', ' প্রথম অর্ডারে'], returning: [' for returning customers', ' পুরনো কাস্টমারদের জন্য'] }[n.who] || [` for ${whoTxt(n.who)}`, ` ${whoTxt(n.who)} এর জন্য`];
    const w = { online: [' when you pay online', ' অনলাইনে পেমেন্ট করলে'], category: [` on ${n.target ? catBoth(n.target)[0] : 'this category'}`, ` ${n.target ? catBoth(n.target)[1] : 'এই ক্যাটাগরিতে'}`], product: [' on selected items', ' বাছাই করা প্রোডাক্টে'], abandoned: [' to finish your order', ' অর্ডারটা শেষ করতে'], campaign: [' from our campaign', ' আমাদের ক্যাম্পেইন থেকে'] }[n.where] || ['', ''];
    const v = valTxt(n); const code = n.code ? [` Use code ${n.code}.`, ` কোড ${n.code} ব্যবহার করুন।`] : ['', ''];
    return { en: `${v[0]}${w[0]}${who[0]}.${code[0]}`, bn: `${v[1]}${w[1]}${who[1]}।${code[1]}` };
  }

  /* ---------- detail drawer ---------- */
  function detail(n) {
    const X_ = X(); const m = mchk(n); const s = sentence(n); const on = n.status === 'running' || n.status === 'scheduled';
    const margin = n.src === 'sale' && n.ref.type !== 'bxgy' ? X_.marginCheck(n.ref) : m.pct == null ? '' : U.callout(t(`Worst case: <b>${esc(m.worst.p.name)}</b> sells at ${tk(Math.round(m.worst.sp))} with a buying price of ${tk(m.worst.p.cost)}. Margin ${m.pct}% across ${m.ps.length} products.`, `সবচেয়ে খারাপ: <b>${esc(m.worst.p.name)}</b> ${tk(Math.round(m.worst.sp))} এ বিক্রি, কেনা দাম ${tk(m.worst.p.cost)}। ${m.ps.length}টি প্রোডাক্টে লাভ ${m.pct}%।`), m.tone, m.tone === 'good' ? 'check' : 'warn');
    const prof = n.u30.sales - n.u30.cogs; const hist = (n.history || []).slice(0, 6);
    const dr = U.drawer(esc(t(n.name, n.nameBn)), `<div class="stack">
      <div class="grid g2">${U.kpi({ label: t('Used (30 days)', 'ব্যবহার (30 দিন)'), value: A.fmt.num(n.u30.orders), sub: stBadge(n.status) })}${U.kpi({ label: t('Discount given', 'ছাড় দেওয়া'), value: tk(n.u30.off) })}${U.kpi({ label: t('Sales', 'বিক্রি'), value: tk(n.u30.sales) })}${U.kpi({ label: t('Profit after discount', 'ছাড়ের পর লাভ'), value: tk(prof), sub: n.u30.sales ? A.fmt.pct(prof / n.u30.sales * 100, 0) : '' })}</div>
      <dl class="of-dl"><dt>${t('Type', 'ধরন')}</dt><dd>${vt(n)}</dd><dt>${t('Applies to', 'কোথায় খাটে')}</dt><dd>${whereTxt(n)}</dd><dt>${t('Who', 'কে পাবে')}</dt><dd>${whoTxt(n.who)}${n.min ? ' · ' + t('min order ', 'ন্যূনতম অর্ডার ') + tk(n.min) : ''}</dd><dt>${t('How they get it', 'কীভাবে পান')}</dt><dd>${n.channel === 'code' ? t('With code ', 'কোড দিয়ে ') + `<b class="mono">${esc(n.code)}</b>` : t('Automatically', 'নিজে থেকে')}</dd><dt>${t('When', 'কখন')}</dt><dd>${whenTxt(n)}</dd><dt>${t('Limits', 'সীমা')}</dt><dd>${n.perCustomer ? t(`${n.perCustomer} per customer`, `জনপ্রতি ${n.perCustomer}`) : t('None per customer', 'জনপ্রতি নেই')} · ${n.total ? t(`${n.total} in all`, `মোট ${n.total}`) : t('no total limit', 'মোট সীমা নেই')}</dd><dt>${t('With other offers', 'অন্য অফারের সাথে')}</dt><dd>${t({ best: 'The best one wins', stack: 'Can stack with others', exclusive: 'Only this one applies' }[n.stack] || 'The best one wins', { best: 'সেরাটা জেতে', stack: 'অন্যদের সাথে একসাথে চলে', exclusive: 'শুধু এটা খাটে' }[n.stack] || 'সেরাটা জেতে')}</dd></dl>
      <div class="rl-prev"><div class="rl-prev-h">${t('How customers see it', 'কাস্টমার যেভাবে দেখবেন')}</div><div class="bn" style="font-family:var(--f-bn)">${esc(s.bn)}</div><div class="small muted" style="margin-bottom:8px">${esc(s.en)}</div>${receipt(n)}</div>
      ${margin}
      ${U.card(t('History', 'ইতিহাস'), hist.length ? `<div class="list">${hist.map((h) => `<div class="li"><span class="grow small">${esc(h.text)}</span><span class="muted small">${h.t ? A.fmt.dt(h.t) + ' · ' : ''}${esc(h.by)}</span></div>`).join('')}</div>` : `<div class="muted small">${t('No changes yet.', 'এখনো কোনো পরিবর্তন নেই।')}</div>`)}</div>`,
      { foot: `${n.src === 'offer' ? `<button class="btn" id="od-edit">${A.icon('edit')} ${t('Edit', 'এডিট')}</button>` : n.src === 'coupon' ? `<button class="btn" id="od-edit">${A.icon('edit')} ${t('Coupon details', 'কুপনের বিস্তারিত')}</button>` : `<button class="btn" id="od-edit">${A.icon('edit')} ${t('Edit sale price', 'সেল দাম এডিট')}</button>`}${on ? `<button class="btn danger" id="od-off">${t('Turn off', 'বন্ধ করুন')}</button>` : n.status !== 'ended' || n.src === 'offer' ? `<button class="btn primary" id="od-on">${t('Turn on', 'চালু করুন')}</button>` : ''}` });
    const root = dr.parentNode;
    const g = (id) => root.querySelector(id);
    if (g('#od-edit')) g('#od-edit').onclick = () => { U.close(); if (n.src === 'offer') wizard(n.ref); else if (n.src === 'coupon') X_.couponDrawer(n.ref); else X_.discountModal(n.ref); };
    if (g('#od-off')) g('#od-off').onclick = () => { U.close(); toggle(n, false); };
    if (g('#od-on')) g('#od-on').onclick = () => { U.close(); toggle(n, true); };
  }

  /* ---------- New offer wizard ---------- */
  function wizard(edit) {
    const X_ = X(); seed();
    const w = edit ? clone(edit) : { id: A.uid('OF'), name: '', nameBn: '', kind: 'percent', value: 10, maxOff: 300, channel: 'auto', code: '', where: 'checkout', target: 'polo', pids: [], who: 'all', from: TODAY(), to: addDays(14), min: 0, perCustomer: 1, total: 0, stack: 'best', on: true, stats: { orders: 0, off: 0, sales: 0, cogsPct: 58 }, history: [] };
    if (!w.pids) w.pids = []; let step = 0; let noEnd = !w.to;
    const STEPS = [['Type', 'ধরন'], ['Value', 'মান'], ['Where', 'কোথায়'], ['Who', 'কে'], ['When', 'কখন'], ['Limits', 'সীমা'], ['Preview', 'প্রিভিউ']];
    const live = A.D.products.filter((p) => p.status === 'live');
    const m = U.modal(edit ? t('Edit offer', 'অফার এডিট') : t('New offer', 'নতুন অফার'), '<div id="of-w"></div>', { wide: true });
    const body = () => m.querySelector('#of-w');
    const read = () => {
      const b = body(); const v = (id) => { const e = b.querySelector('#' + id); return e ? e.value.trim() : null; }; const nn = (id) => { const e = b.querySelector('#' + id); return e ? Number(e.value) : null; };
      if (step === 1) { if (nn('ow-v') != null) w.value = nn('ow-v'); if (nn('ow-max') != null) w.maxOff = nn('ow-max'); if (nn('ow-min') != null) w.min = nn('ow-min'); const ch = b.querySelector('#ow-ch button.on'); if (ch) w.channel = ch.dataset.v; if (v('ow-code') != null) w.code = v('ow-code').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (v('ow-name') != null) w.name = v('ow-name'); if (v('ow-nbn') != null) w.nameBn = v('ow-nbn'); }
      if (step === 2) { if (v('ow-cat') != null) w.target = v('ow-cat'); if (v('ow-cmp') != null && w.where === 'campaign') w.target = v('ow-cmp'); if (nn('ow-min2') != null) w.min = nn('ow-min2'); w.pids = [...b.querySelectorAll('[data-pid]:checked')].map((x) => x.dataset.pid); }
      if (step === 4) { if (v('ow-from') != null) w.from = v('ow-from'); noEnd = b.querySelector('#ow-ne').checked; w.to = noEnd ? '' : v('ow-to'); }
      if (step === 5) { if (nn('ow-per') != null) w.perCustomer = nn('ow-per'); if (nn('ow-tot') != null) w.total = nn('ow-tot'); const sk = b.querySelector('#ow-st button.on'); if (sk) w.stack = sk.dataset.v; }
    };
    const draw = () => {
      const b = body(); let h = `<div class="of-steps">${STEPS.map((s, i) => `<span class="${i === step ? 'on' : i < step ? 'done' : ''}">${i + 1}. ${t(s[0], s[1])}</span>`).join('')}</div>`;
      if (step === 0) h += `<p class="muted" style="margin-top:0">${t('What does the customer get?', 'কাস্টমার কী পাবেন?')}</p><div class="of-ty">${['free_delivery', 'percent', 'flat', 'points', 'wallet'].map((k) => `<button type="button" class="of-tb ${w.kind === k ? 'on' : ''}" data-k="${k}"><b>${t(KINDS[k][0], KINDS[k][1])}</b><span>${t(KINDS[k][2], KINDS[k][3])}</span></button>`).join('')}</div>`;
      if (step === 1) { h += `<div class="stack"><div class="formgrid">`;
        if (w.kind === 'percent') h += U.field(t('Percent off', 'কত % ছাড়'), U.input('ow-v', w.value, 'type="number" min="1" max="90"')) + U.field(t('Most off per order', 'অর্ডারে সর্বোচ্চ ছাড়'), U.money('ow-max', w.maxOff || 0));
        if (w.kind === 'flat') h += U.field(t('Amount off', 'কত টাকা ছাড়'), U.money('ow-v', w.value));
        if (w.kind === 'points') h += U.field(t('Bonus points', 'বোনাস পয়েন্ট'), U.input('ow-v', w.value, 'type="number" min="1"'), t(`1 point = ${tk(cfg().pointTk)} (set in Customers › Loyalty)`, `1 পয়েন্ট = ${tk(cfg().pointTk)} (কাস্টমার › লয়্যালটি তে ঠিক হয়)`));
        if (w.kind === 'wallet') h += U.field(t('Credit added to wallet', 'ওয়ালেটে কত টাকা যোগ হবে'), U.money('ow-v', w.value), t('The customer can use it on the next purchase.', 'কাস্টমার পরের কেনাকাটায় ব্যবহার করতে পারবেন।'));
        if (w.kind === 'free_delivery') h += U.field(t('When the order is over', 'অর্ডার এর বেশি হলে'), U.money('ow-min', w.min || 0), t('0 = on every order', '0 = সব অর্ডারে'));
        h += `${U.field(t('Name (optional)', 'নাম (ঐচ্ছিক)'), U.input('ow-name', w.name, `placeholder="${t('Made automatically', 'নিজে থেকে তৈরি হবে')}"`))}${U.field(t('Name in Bengali (optional)', 'বাংলায় নাম (ঐচ্ছিক)'), U.input('ow-nbn', w.nameBn || ''))}</div>
        <div class="field"><label>${t('How customers get it', 'কাস্টমার কীভাবে পাবেন')}</label>${U.seg('ow-ch', [['auto', t('Automatically', 'নিজে থেকে')], ['code', t('With a code', 'কোড দিয়ে')]], w.channel)}</div>${w.channel === 'code' ? U.field(t('Code', 'কোড'), U.input('ow-code', w.code, 'placeholder="WINTER15" style="text-transform:uppercase"')) : ''}</div>`; }
      if (step === 2) { h += `<p class="muted" style="margin-top:0">${t('Where does it apply?', 'কোথায় খাটবে?')}</p><div class="of-ty">${Object.keys(WHERE).map((k) => `<button type="button" class="of-tb ${w.where === k ? 'on' : ''}" data-w="${k}"><b>${t(WHERE[k][0], WHERE[k][1])}</b></button>`).join('')}</div><div class="stack" style="margin-top:12px">`;
        if (w.where === 'category') h += `<div class="field"><label>${t('Category', 'ক্যাটাগরি')}</label>${U.select('ow-cat', A.CATS.map((c) => [c.id, t(c.en, c.bn)]), w.target || 'polo')}</div>`;
        if (w.where === 'campaign') h += `<div class="field"><label>${t('Ad campaign', 'বিজ্ঞাপন ক্যাম্পেইন')}</label>${U.select('ow-cmp', A.D.campaigns.map((c) => [c.id, c.ch + ' · ' + c.name]), w.target || A.D.campaigns[0].id)}</div>`;
        if (w.where === 'product') h += `<div class="of-pick">${live.slice(0, 40).map((p) => `<label class="li rl-check"><input type="checkbox" data-pid="${p.id}" ${w.pids.includes(p.id) ? 'checked' : ''}><span class="grow ellip">${esc(p.name)}</span><span class="muted small">${tk(p.price)}</span></label>`).join('')}</div>`;
        if (w.where === 'group') h += `<div class="muted small">${t('Pick the group in the next step (Who).', 'গ্রুপ পরের ধাপে (কে) বাছুন।')}</div>`;
        if (w.where === 'abandoned') h += `<div class="muted small">${t('Used in Incomplete orders messages and the AI follow-up.', 'ইনকমপ্লিট অর্ডারের মেসেজ ও AI ফলো-আপে ব্যবহার হবে।')}</div>`;
        if (w.kind !== 'free_delivery') h += U.field(t('Minimum order', 'ন্যূনতম অর্ডার'), U.money('ow-min2', w.min || 0), t('0 = no minimum', '0 = ন্যূনতম নেই')); h += '</div>'; }
      if (step === 3) h += `<p class="muted" style="margin-top:0">${t('Who can get it?', 'কে পাবেন?')}</p><div class="of-ty">${WHO().map((x) => `<button type="button" class="of-tb ${w.who === x[0] ? 'on' : ''}" data-who="${x[0]}"><b>${t(x[1][0], x[1][1])}</b></button>`).join('')}</div>${w.where === 'group' && w.who === 'all' ? U.callout(t('You chose "A customer group", so pick a group here.', 'আপনি "কাস্টমার গ্রুপ" বেছেছেন, তাই এখানে একটা গ্রুপ বাছুন।'), 'warn', 'warn') : ''}`;
      if (step === 4) h += `<div class="formgrid">${U.field(t('Starts', 'শুরু'), U.input('ow-from', w.from || TODAY(), 'type="date"'))}${U.field(t('Ends', 'শেষ'), U.input('ow-to', w.to || addDays(14), `type="date" ${noEnd ? 'disabled' : ''}`))}</div><label class="rl-check" style="margin-top:8px"><input type="checkbox" id="ow-ne" ${noEnd ? 'checked' : ''}> ${t('No end date', 'শেষের তারিখ নেই')}</label><div class="muted small" style="margin-top:8px">${t('A start date in the future makes it "Scheduled".', 'ভবিষ্যতের শুরুর তারিখ দিলে "শিডিউল করা" হয়ে যাবে।')}</div>`;
      if (step === 5) h += `<div class="formgrid">${U.field(t('Uses per customer', 'জনপ্রতি কতবার'), U.input('ow-per', w.perCustomer, 'type="number" min="0"'), t('0 = no limit', '0 = সীমা নেই'))}${U.field(t('Total uses', 'মোট কতবার'), U.input('ow-tot', w.total, 'type="number" min="0"'), t('0 = no limit', '0 = সীমা নেই'))}</div><div class="field"><label>${t('If another offer also applies', 'অন্য অফারও খাটলে')}</label>${U.seg('ow-st', [['best', t('Best one wins', 'সেরাটা জেতে')], ['stack', t('Can stack', 'একসাথে চলবে')], ['exclusive', t('Only this one', 'শুধু এটা')]], w.stack)}</div>`;
      if (step === 6) { autoName(); const n = normOffer(Object.assign({}, w, { proposed: false, declined: false })); const mc = mchk(n); const cf = conflictsOf(all().filter((x) => !(x.src === 'offer' && x.ref.id === w.id)), n); const s = sentence(n);
        h += `<div class="grid g2" style="align-items:start"><div><div class="rl-prev"><div class="rl-prev-h">${t('How checkout shows it', 'চেকআউটে যেভাবে দেখাবে')}</div><div class="bn" style="font-family:var(--f-bn);margin-bottom:2px">${esc(s.bn)}</div><div class="small muted" style="margin-bottom:8px">${esc(s.en)}</div>${receipt(n)}</div></div><div class="stack">${mc.pct == null ? '' : U.callout(t(`Margin check: ${mc.en}. Worst case <b>${esc(mc.worst.p.name)}</b>, buying price ${tk(mc.worst.p.cost)}.`, `মার্জিন চেক: ${mc.bn}। সবচেয়ে খারাপ: <b>${esc(mc.worst.p.name)}</b>, কেনা দাম ${tk(mc.worst.p.cost)}।`), mc.tone, mc.tone === 'good' ? 'check' : 'warn')}${cf.length ? cf.slice(0, 3).map((c) => `<div class="of-warn">${A.icon('warn')} <span>${esc(t(c.msg[0], c.msg[1]))}</span></div>`).join('') : U.callout(t('No overlap with other offers.', 'অন্য অফারের সাথে ওভারল্যাপ নেই।'), 'good', 'check')}<dl class="of-dl"><dt>${t('When', 'কখন')}</dt><dd>${whenTxt(n)}</dd><dt>${t('Limits', 'সীমা')}</dt><dd>${n.perCustomer ? t(`${n.perCustomer} per customer`, `জনপ্রতি ${n.perCustomer}`) : t('No per-customer limit', 'জনপ্রতি সীমা নেই')}, ${n.total ? t(`${n.total} in all`, `মোট ${n.total}`) : t('no total limit', 'মোট সীমা নেই')}</dd></dl></div></div>`; }
      h += `<div class="of-wz-f"><button class="btn" id="ow-back" ${step === 0 ? 'disabled' : ''}>← ${t('Back', 'পেছনে')}</button>${step < 6 ? `<button class="btn primary" id="ow-next">${t('Next', 'পরের ধাপ')} →</button>` : `<button class="btn primary" id="ow-save">${A.icon('check')} ${edit ? t('Save changes', 'পরিবর্তন সেভ') : t('Save offer', 'অফার সেভ')} · PIN</button>`}</div>`;
      b.innerHTML = h; wireStep();
    };
    const autoName = () => { if (!w.name) w.name = (w.kind === 'percent' ? w.value + '% off' : w.kind === 'flat' ? '৳' + w.value + ' off' : w.kind === 'free_delivery' ? 'Free delivery' : w.kind === 'points' ? w.value + ' bonus points' : '৳' + w.value + ' wallet credit') + ' · ' + WHERE[w.where][0]; if (!w.nameBn) w.nameBn = w.name; };
    const valid = () => {
      if (step === 1) { if (['percent', 'flat', 'points', 'wallet'].includes(w.kind) && !(w.value > 0)) return t('Enter the value.', 'মান দিন।'); if (w.kind === 'percent' && w.value > 90) return t('Percent must be 90 or less.', '% 90 বা কম হতে হবে।'); if (w.channel === 'code' && w.code.length < 3) return t('Code needs at least 3 letters or numbers.', 'কোডে অন্তত 3টি অক্ষর বা সংখ্যা লাগবে।'); if (w.channel === 'code' && (A.D.coupons.some((c) => c.code === w.code) || A.D.offers.some((o) => o.code === w.code && o.id !== w.id))) return t('This code already exists.', 'এই কোড আগেই আছে।'); }
      if (step === 2 && w.where === 'product' && !w.pids.length) return t('Pick at least one product.', 'অন্তত একটা প্রোডাক্ট বাছুন।');
      if (step === 3 && w.where === 'group' && w.who === 'all') return t('Pick a group.', 'একটা গ্রুপ বাছুন।');
      if (step === 4 && w.to && w.to < w.from) return t('"Ends" must be after "Starts".', '"শেষ" তারিখ "শুরু" র পরে হতে হবে।');
      return '';
    };
    function wireStep() {
      const b = body();
      A.on(b, '[data-k]', 'click', (e, x) => { w.kind = x.dataset.k; if (w.kind === 'wallet' || w.kind === 'points') w.stack = 'stack'; draw(); });
      A.on(b, '[data-w]', 'click', (e, x) => { read(); w.where = x.dataset.w; if (w.where === 'abandoned' && !w.code) w.channel = 'code'; draw(); });
      A.on(b, '[data-who]', 'click', (e, x) => { w.who = x.dataset.who; draw(); });
      A.on(b, '.seg button', 'click', (e, x) => { x.parentNode.querySelectorAll('button').forEach((y) => y.classList.toggle('on', y === x)); if (x.parentNode.id === 'ow-ch') { read(); w.channel = x.dataset.v; draw(); } });
      const ne = b.querySelector('#ow-ne'); if (ne) ne.onchange = () => { b.querySelector('#ow-to').disabled = ne.checked; };
      b.querySelector('#ow-back').onclick = () => { read(); step--; draw(); };
      const nx = b.querySelector('#ow-next'); if (nx) nx.onclick = () => { read(); const er = valid(); if (er) return A.toast(er, 'bad'); step++; draw(); };
      const sv = b.querySelector('#ow-save'); if (sv) sv.onclick = () => {
        const n = normOffer(Object.assign({}, w, { proposed: false, declined: false })); if (!w.name) w.name = (w.kind === 'percent' ? w.value + '% off' : w.kind === 'flat' ? '৳' + w.value + ' off' : w.kind === 'free_delivery' ? 'Free delivery' : w.kind === 'points' ? w.value + ' bonus points' : '৳' + w.value + ' wallet credit') + ' · ' + WHERE[w.where][0]; if (!w.nameBn) w.nameBn = w.name;
        X_.pinAsk(edit ? t('Save this offer?', 'এই অফার সেভ করবেন?') : t('Create this offer?', 'এই অফার তৈরি করবেন?'), `<p><b>${esc(w.name)}</b><br>${vt(n)} · ${whereTxt(n)} · ${whenTxt(n)}</p>`, t('Save', 'সেভ'), () => {
          w.history = w.history || []; w.history.unshift({ t: A.TODAY.toISOString(), text: edit ? 'Edited' : 'Created', by: 'Mehadi Hasan' });
          const i = A.D.offers.findIndex((o) => o.id === w.id); if (i >= 0) A.D.offers[i] = w; else A.D.offers.unshift(w);
          A.commit('Offer saved: ' + w.name); A.toast(t('Offer saved', 'অফার সেভ হয়েছে'), 'good'); U.close(); A.render(); });
      };
    }
    draw();
  }

  /* ---------- guides ---------- */
  const G = (whatEn, whatBn, whyEn, whyBn, howEn, howBn) => ({ en: `<p><b>What:</b> ${whatEn}</p><p><b>Why:</b> ${whyEn}</p><p><b>How:</b></p><ol>${howEn.map((x) => `<li>${x}</li>`).join('')}</ol>`, bn: `<p><b>কী:</b> ${whatBn}</p><p><b>কেন:</b> ${whyBn}</p><p><b>কীভাবে:</b></p><ol>${howBn.map((x) => `<li>${x}</li>`).join('')}</ol>` });
  const gOffers = G('All your offers in one place: coupon codes, sale prices, free delivery, online-payment rewards, points and wallet credit, abandoned-cart offers, first-order offers. The top row shows what they cost and earn in the last 30 days.', 'আপনার সব অফার এক জায়গায়: কুপন কোড, সেল দাম, ফ্রি ডেলিভারি, অনলাইন-পেমেন্ট রিওয়ার্ড, পয়েন্ট ও ওয়ালেট ক্রেডিট, অসম্পূর্ণ অর্ডারের অফার, প্রথম অর্ডারের অফার। ওপরের সারিতে গত 30 দিনের খরচ ও আয় দেখায়।',
    'Eid sale: 10% off for visitors from your catalog ads. The margin badge tells you the worst product still keeps a profit over its ERP buying price. If a second offer also applies to the same cart, the page warns you before the customer sees a surprise.', 'ঈদ সেল: ক্যাটালগ বিজ্ঞাপন থেকে আসা ভিজিটরদের 10% ছাড়। মার্জিন ব্যাজ বলে ERP কেনা দামের ওপর সবচেয়ে খারাপ প্রোডাক্টেও লাভ থাকছে কি না। একই কার্টে আরেকটা অফার খাটলে কাস্টমার অবাক হওয়ার আগেই পেজ আপনাকে সতর্ক করে।',
    ['Press "New offer" and go step by step: type, value, where, who, when, limits, preview.', 'Use the chips (Coupons, Free delivery, Online-payment reward…) to filter. Click a row for usage, cost, history and how checkout shows it.', 'Check "Heads up" for overlaps and the calendar for dates that clash.', 'Offers proposed by the AI wait under "Awaiting your approval". Approve with your PIN or decline.', 'Sale prices and coupons you made before are in the same list. "Quick coupon" and "Sale price" open the simple forms.'],
    ['"নতুন অফার" চেপে ধাপে ধাপে করুন: ধরন, মান, কোথায়, কে, কখন, সীমা, প্রিভিউ।', 'চিপ (কুপন, ফ্রি ডেলিভারি, অনলাইন-পেমেন্ট রিওয়ার্ড…) দিয়ে ফিল্টার করুন। সারিতে ক্লিক করলে ব্যবহার, খরচ, ইতিহাস ও চেকআউটে কেমন দেখাবে দেখা যায়।', '"সতর্কতা" তে ওভারল্যাপ ও ক্যালেন্ডারে তারিখের ঝামেলা দেখুন।', 'AI এর প্রস্তাব করা অফার "আপনার অনুমোদনের অপেক্ষায়" থাকে। PIN দিয়ে অনুমোদন করুন বা বাতিল করুন।', 'আগের বানানো সেল দাম ও কুপন একই তালিকায় আছে। "দ্রুত কুপন" ও "সেল দাম" সহজ ফর্ম খোলে।']);
  A.mod('rules', { coupons: { render: page, guide: gOffers }, discounts: { render: page, guide: gOffers } });
})();
