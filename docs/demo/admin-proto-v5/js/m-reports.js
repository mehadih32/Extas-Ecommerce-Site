/* EXTAS admin prototype — Reports (business reports only).
   Every report uses one layout: toolbar → "What changed" → KPI tiles → charts → sortable breakdown table.
   All money maths go through A.calc so the numbers match Home and Finance. */
(function () {
  'use strict';
  const A = window.A; const C = A.calc; const U = A.ui; const t = A.t; const F = A.fmt;
  const DAY = 864e5;

  /* ---------------- shared state (kept while moving between report tabs) ---------------- */
  const S = {
    range: '30d', custom: { from: '2026-10-15', to: '2026-11-12' }, compare: true,
    f: { ch: 'all', cat: 'all', courier: 'all', zone: 'all', area: 'all', adch: 'all' }, open: {},
    grain: 'day', sort: {}, showAll: {},
  };
  let ACT = []; // filters shown on the current tab (only these apply)
  let H = {};   // row handlers per table, rebuilt every render
  let CUR = null;

  /* ---------------- names ---------------- */
  const CHN = { Website: ['Website', 'ওয়েবসাইট'], Facebook: ['Facebook page', 'ফেসবুক পেজ'], Instagram: ['Instagram', 'ইনস্টাগ্রাম'], Phone: ['Phone', 'ফোন'], WhatsApp: ['WhatsApp', 'হোয়াটসঅ্যাপ'] };
  const chName = (c) => (CHN[c] ? t(CHN[c][0], CHN[c][1]) : c);
  const ZN = { inside: ['Inside Dhaka', 'ঢাকার ভেতরে'], sub: ['Dhaka suburbs', 'ঢাকার আশেপাশে'], outside: ['Outside Dhaka', 'ঢাকার বাইরে'] };
  const zName = (z) => t(ZN[z][0], ZN[z][1]);
  const catName = (id) => { const c = A.byId(A.CATS, id); return c ? t(c.en, c.bn) : id; };
  const c360 = (id) => { try { if (A.couriersApi && A.couriersApi.href) return A.couriersApi.href(id); } catch (e) {} return '#couriers--c360--' + id; };
  const courName = (id) => { const c = A.byId(A.D.couriers, id); return c ? c.name : t('Not set', 'ঠিক হয়নি'); };
  const PAY = { COD: ['Cash on delivery', 'ক্যাশ অন ডেলিভারি'], bKash: ['bKash', 'বিকাশ'], Nagad: ['Nagad', 'নগদ'], Card: ['Card', 'কার্ড'] };
  const WD = [['Sun', 'রবি'], ['Mon', 'সোম'], ['Tue', 'মঙ্গল'], ['Wed', 'বুধ'], ['Thu', 'বৃহস্পতি'], ['Fri', 'শুক্র'], ['Sat', 'শনি']];
  const COLS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--navy2)', 'var(--good)'];
  const dhH = (iso) => new Date(new Date(iso).getTime() + 6 * 36e5).getUTCHours();
  const dhW = (iso) => new Date(new Date(iso).getTime() + 6 * 36e5).getUTCDay();
  const pc = (a, b) => (b ? a / b * 100 : 0);
  const chg = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) * 100 : null);
  const sg = (p) => (p == null ? '—' : (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(0) + '%');
  const dl = (c, p, inv) => (S.compare ? A.delta(c, p, inv) : '');

  /* ---------------- data access ---------------- */
  const rng = () => { if (S.range !== '6m') return C.range(S.range, S.custom); const to = A.TODAY.getTime(); const from = new Date(F.ymd(to - 182 * DAY) + 'T00:00:00+06:00').getTime(); return { key: '6m', from, to, prevFrom: from - (to - from), prevTo: from, days: Math.round((to - from) / DAY) }; };
  const on = (k) => ACT.includes(k) && S.f[k] !== 'all';
  const filtered = () => ['ch', 'cat', 'courier', 'zone', 'area'].some(on);
  const fo = (from, to) => C.ordersIn(from, to).filter((o) =>
    (!on('ch') || o.channel === S.f.ch) && (!on('zone') || o.zone === S.f.zone) && (!on('area') || areaOk(o)) &&
    (!on('courier') || o.courier === S.f.courier) && (!on('cat') || o.lines.some((l) => catOf(l) === S.f.cat)));
  const PC = {}; const catOf = (l) => { if (!PC[l.pid]) { const p = A.byId(A.D.products, l.pid); PC[l.pid] = p ? p.cat : 'extras'; } return PC[l.pid]; };
  const lineOk = (l) => !on('cat') || catOf(l) === S.f.cat;
  /** Area filter: 'z:<zone>' or 'd:<division>'. Works for orders and customers (both carry zone + district). */
  const areaOk = (x) => { const v = S.f.area || 'all'; if (v === 'all') return true; return v.startsWith('z:') ? x.zone === v.slice(2) : (DIV[x.district] || 'Dhaka') === v.slice(2); };
  const liveO = (os) => os.filter((o) => o.status !== 'cancelled');
  const delO = (os) => os.filter(C.isDelivered);
  const retO = (os) => os.filter((o) => o.status === 'returned');
  const trafficIn = (from, to) => A.D.traffic.filter((x) => { const v = new Date(x.date + 'T12:00:00+06:00').getTime(); return v >= from && v < to; });

  /** Same lines as A.calc.pnl. With a filter on, the order lines are the filtered orders and ads/fixed/other costs are shared by sales. */
  function pnlF(from, to) {
    const all = C.pnl(from, to); if (!filtered()) return all;
    const os = fo(from, to); const del = delO(os), ret = retO(os); const pk = A.D.expenseSettings.packaging;
    const productSales = A.sum(del, (o) => o.subtotal), discounts = A.sum(del, (o) => o.discount), deliveryIncome = A.sum(del, (o) => o.delivery);
    const revenue = productSales - discounts + deliveryIncome; const cogs = A.sum(del, C.cogs); const courier = A.sum(del, C.courierFee); const cod = A.sum(del, C.codFee);
    const packaging = (del.length + ret.length) * pk; const gateway = A.sum(os, C.gatewayFee); const returns = A.sum(ret, (o) => Math.round(C.courierFee(o) * 1.5));
    const gross = revenue - cogs - courier - cod - packaging - gateway - returns; const share = all.revenue ? revenue / all.revenue : 0;
    const ads = Math.round(all.ads * share), fixed = Math.round(all.fixed * share), other = Math.round(all.other * share); const net = gross - ads - fixed - other;
    return { orders: os.length, delivered: del.length, returned: ret.length, productSales, discounts, deliveryIncome, revenue, cogs, courier, cod, packaging, gateway, returns, gross, ads, fixed, other, net, margin: revenue ? net / revenue * 100 : 0, shared: true };
  }
  /** Same as A.calc.kpis, on the filtered orders. */
  function kp(from, to) {
    const os = fo(from, to); const live = liveO(os); const del = delO(os), ret = retO(os); const fin = del.length + ret.length;
    const sessions = A.sum(trafficIn(from, to), (x) => x.sessions); const p = pnlF(from, to); const ov = A.sum(live, (o) => o.total);
    return { os, live, del, ret, p, orders: live.length, orderValue: ov, aov: live.length ? ov / live.length : 0, delivered: del.length, sales: p.revenue, profit: p.net, gross: p.gross,
      returnRate: fin ? ret.length / fin * 100 : 0, cancelled: os.length - live.length, ads: p.ads, roas: p.ads ? p.revenue / p.ads : 0, sessions,
      conv: sessions ? os.filter((o) => o.channel === 'Website').length / sessions * 100 : 0, pieces: A.sum(live, C.pieces), success: fin ? del.length / fin * 100 : 0 };
  }
  /** Time buckets for charts: hours for one day, days up to 45 days, else weeks. Previous period is shifted to line up. */
  function buckets(r, grain) {
    const out = []; const off = r.from - r.prevFrom;
    if (r.to - r.from <= DAY + 1) { for (let x = r.from; x < r.to; x += 36e5) out.push({ label: dhH(x) + ':00', from: x, to: Math.min(x + 36e5, r.to) }); }
    else { const step = grain === 'week' || r.days > 45 ? 7 * DAY : DAY; for (let x = r.from; x < r.to; x += step) out.push({ label: F.date(x), from: x, to: Math.min(x + step, r.to) }); }
    return out.map((b) => ({ ...b, pfrom: b.from - off, pto: b.to - off }));
  }
  const periodText = (r) => {
    const a = F.date(r.from), b = F.date(r.to - 1), pa = F.date(r.prevFrom), pb = F.date(r.prevTo - 1);
    return `${a} – ${b}` + (S.compare ? t(` · compared with ${pa} – ${pb}`, ` · তুলনা ${pa} – ${pb}`) : '');
  };
  const prevName = (r) => (r.key === 'month' ? t('the same days last month', 'গত মাসের একই দিনগুলোর') : r.key === 'lastmonth' ? t('the month before', 'তার আগের মাসের') : t(`the previous ${r.days} days`, `আগের ${r.days} দিনের`));

  /* ---------------- UI bits ---------------- */
  A.css('reports', `
  .rep-bar{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;padding:12px 14px}
  .rep-bar .grow{flex:1}
  .rep-bar select.inp{width:auto;min-width:0;max-width:100%;padding-top:6px;padding-bottom:6px;font-size:13px}
  .rep-bar .rep-sw{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink2);white-space:nowrap}
  .rep-bar .rep-date{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
  .rep-bar .rep-date input{width:auto;padding:5px 8px;font-size:13px}
  .rep-per{font-size:12px;color:var(--muted);width:100%;margin-top:-2px}
  .rep-phone{display:none}
  .rep-ins{display:grid;grid-template-columns:auto 1fr;gap:12px 16px;align-items:start;padding:16px 18px}
  .rep-ins h3{color:#fff;font-size:15px;margin:0 0 6px}
  .rep-ins ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px}
  .rep-ins li{display:flex;gap:9px;align-items:flex-start;font-size:13.5px;line-height:1.45;color:rgba(255,255,255,.92)}
  .rep-ins li i{flex:none;width:8px;height:8px;border-radius:50%;margin-top:6px;background:var(--c4)}
  .rep-ins li i.g{background:#4ade80}.rep-ins li i.b{background:#f87171}
  .rep-ins .rep-ico{width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.12);display:grid;place-items:center}
  .rep-ins .rep-ico svg{width:20px;height:20px;color:#fff}
  .rep-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
  @media (max-width:900px){.rep-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .rep-ks{display:flex;flex-wrap:wrap;gap:8px;margin:-4px 0 0}
  .rep-ks>div{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:7px 11px;font-size:12.5px;min-width:0}
  .rep-ks span{color:var(--muted)} .rep-ks b{font:700 14px var(--f-head);font-variant-numeric:tabular-nums} .rep-ks em{font-style:normal;color:var(--muted);font-size:11.5px}
  .rep-qk{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-bottom:2px}
  .rep-ins h3{font-size:17px!important;line-height:1.35}
  .rep-ins li{align-items:center!important}
  .rep-ins .rep-act{flex:none;background:rgba(255,255,255,.14);color:inherit;border-color:rgba(255,255,255,.22);white-space:nowrap}
  .rep-ins .rep-act:hover{background:rgba(255,255,255,.24)}
  .rep-bar2{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;width:100%;padding-top:10px;border-top:1px solid var(--line)}
  .rep-bar2 .lbl{font-size:12px;color:var(--muted);font-weight:600}
  .rep-sched{display:inline-flex;align-items:center;gap:6px}
  .rep-lib-g{margin-top:6px}
  .rep-pk{display:flex;flex-direction:column;gap:10px;padding:14px 15px;min-width:0}
  .rep-pk select.inp{width:auto;padding:5px 8px;font-size:13px}
  .rep-pki{flex:none;width:34px;height:34px;border-radius:10px;background:var(--card2);display:grid;place-items:center;color:var(--accent)}
  .rep-dlw .grid{grid-template-columns:1fr}
  .rep-lib-g>h3{display:flex;align-items:center;gap:8px;font-size:14px;margin:18px 2px 10px;color:var(--ink2)}
  .rep-lib{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
  .rep-lc{display:flex;flex-direction:column;gap:8px;padding:14px 15px;text-decoration:none;color:inherit;transition:border-color .15s, transform .15s}
  .rep-lc:hover{border-color:var(--accent);transform:translateY(-1px)}
  .rep-lc .q{font-weight:650;font-size:14px;line-height:1.35;color:var(--ink)}
  .rep-lc .v{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
  .rep-lc .v b{font:700 22px var(--f-head);font-variant-numeric:tabular-nums}
  .rep-lc .s{font-size:12px;color:var(--muted);min-height:16px}
  .rep-lc .ft{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding-top:8px;border-top:1px dashed var(--line);font-size:12px}
  .rep-pin{border:0;background:none;color:var(--muted);font:inherit;font-size:12px;cursor:pointer;padding:2px 0;display:inline-flex;gap:4px;align-items:center}
  .rep-pin.on{color:var(--accent);font-weight:700}
  .rep-tree .tr{display:grid;grid-template-columns:minmax(0,2.4fr) repeat(5,minmax(0,.8fr)) minmax(0,1fr);gap:8px;align-items:center;padding:9px 6px;border-bottom:1px solid var(--line);font-size:13px}
  .rep-tree .tr.h{font-size:11.5px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.03em}
  .rep-tree .tr>span:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
  .rep-tree .tr.l0{background:var(--card2);font-weight:700;cursor:pointer}
  .rep-tree .tr.l1{cursor:pointer;font-weight:600}
  .rep-tree .tr.l1>span:first-child{padding-left:18px}
  .rep-tree .tr.l2{cursor:pointer}
  .rep-tree .tr.l2>span:first-child{padding-left:38px}
  .rep-tree .tr:hover{background:var(--card2)}
  .rep-tree .car{display:inline-block;width:14px;color:var(--muted);transition:transform .15s}
  .rep-tree .open>.nm .car{transform:rotate(90deg)}
  .rep-tree .nm{display:flex;align-items:center;gap:6px;min-width:0}
  .rep-tree .nm b,.rep-tree .nm em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:normal}
  .rep-rules{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;font-size:12px}
  .rep-rules>span{background:var(--card2);border-radius:8px;padding:5px 9px}
  .rep-coh td.h{text-align:center;font-weight:600;font-variant-numeric:tabular-nums}
  .rep-rv h4{margin:0 0 8px;font-size:14px;display:flex;gap:8px;align-items:center}
  .rep-rv ol,.rep-rv ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:9px;font-size:13.5px;line-height:1.45}
  .rep-rv li .btn{margin-top:6px}
  @media (max-width:760px){.rep-tree .tr{grid-template-columns:minmax(0,2fr) repeat(2,minmax(0,.9fr)) minmax(0,1.1fr)}.rep-tree .tr>.hs{display:none}}
  .rep-kpis .card{padding:13px 14px}
  .rep-kpis .kpi-v{font-size:22px}
  .rep-tbl th[data-si]{cursor:pointer;user-select:none}
  .rep-tbl th[data-si]:hover{color:var(--ink)}
  .rep-tbl th .ar{opacity:.35;margin-left:3px}
  .rep-tbl th.sorted{color:var(--ink)} .rep-tbl th.sorted .ar{opacity:1;color:var(--accent)}
  .rep-tbl tr[data-ri]{cursor:pointer}
  .rep-tbl tr[data-ri]:hover td{background:var(--card2)}
  .rep-more{display:block;margin:10px auto 0}
  .rep-light{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line)}
  .rep-light:last-child{border-bottom:0}
  .rep-light .dot{flex:none;width:12px;height:12px;border-radius:50%;margin-top:4px}
  .rep-light .dot.good{background:var(--good);box-shadow:0 0 0 4px var(--good-soft)}
  .rep-light .dot.warn{background:var(--warn);box-shadow:0 0 0 4px var(--warn-soft)}
  .rep-light .dot.bad{background:var(--bad);box-shadow:0 0 0 4px var(--bad-soft)}
  .rep-light b.v{font-family:var(--f-head);margin-left:auto;white-space:nowrap}
  .rep-heat td.h{text-align:center;font-variant-numeric:tabular-nums;font-weight:600}
  .rep-mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
  .rep-mini > div{background:var(--card2);border-radius:10px;padding:10px 12px}
  .rep-mini b{display:block;font:700 18px var(--f-head)}
  .rep-mini span{font-size:12px;color:var(--muted)}
  .rep-rank{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:7px;background:var(--card2);font-weight:700;font-size:12px}
  .rep-rank.first{background:var(--accent);color:var(--accent-ink)}
  @media (max-width:560px){.rep-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.rep-ins li{flex-wrap:wrap}.rep-ins .rep-act{margin-left:17px}.rep-seg{display:none}.rep-phone{display:block}.rep-ins{grid-template-columns:1fr;padding:14px}.rep-ins .rep-ico{display:none}.rep-bar .rep-btns{width:100%;flex-wrap:wrap!important}.rep-bar .rep-btns .btn{flex:1 1 auto}.rep-bar2 select.inp{flex:1 1 140px}.rep-tree .tr>span:last-child{display:flex;flex-wrap:wrap;gap:3px;justify-content:flex-end}}
  `);

  /** The report's question on top, then 2–3 computed lines, each with the action that fixes it. */
  const ins = (items) => {
    const tab = CUR ? CUR.r.tab : ''; const da = ACTS[tab];
    const list = items.map((x, i) => (x ? { ...x, act: x.act || (typeof da === 'function' ? da(x, i) : da && da[i]) } : null)).filter(Boolean).slice(0, 3);
    return U.card('', `<div class="rep-ico">${A.icon('reports')}</div><div><div class="rep-qk">${t('This report answers', 'এই রিপোর্টের প্রশ্ন')}</div><h3>${Q[tab] ? Q[tab]() : t('What changed', 'কী বদলেছে')}</h3><ul>${list.map((x) => `<li><i class="${x.tone || ''}"></i><span class="grow">${x.text}</span>${x.act ? `<a class="btn sm rep-act" href="${A.href(x.act[1], x.act[2], x.act[3])}">${x.act[0]} →</a>` : ''}</li>`).join('')}</ul></div>`, { cls: 'hero rep-ins' });
  };
  const I2 = (text, tone, act) => ({ text, tone: tone === 'good' ? 'g' : tone === 'bad' ? 'b' : '', act });
  const AC = (en, bn, sec, tab, id) => [t(en, bn), sec, tab, id];
  /** The question each report answers (shown on top). */
  const Q = {
    overview: () => t('Which report answers my question?', 'আমার প্রশ্নের উত্তর কোন রিপোর্টে?'),
    sales: () => t('How much are we selling, when, and through which channel?', 'কত বিক্রি হচ্ছে, কখন, আর কোন চ্যানেলে?'),
    profit: () => t('Where does our profit come from, and where does it leak?', 'লাভ কোথা থেকে আসে, আর কোথায় হারায়?'),
    products: () => t('What should I restock, buy in bulk or stop?', 'কোনটা আবার আনব, বেশি করে আনব, নাকি বন্ধ করব?'),
    customers: () => t('Do customers come back, and who is worth the most?', 'কাস্টমার কি আবার আসেন, আর কারা সবচেয়ে মূল্যবান?'),
    delivery: () => t('Why do parcels come back, and from where?', 'পার্সেল কেন ফেরত আসে, আর কোথা থেকে?'),
    marketing: () => t('Which ads bring profit, and which waste money?', 'কোন বিজ্ঞাপনে লাভ আসে, কোনটায় টাকা নষ্ট?'),
    areas: () => t('Where do orders come from, and where do they fail?', 'অর্ডার কোথা থেকে আসে, আর কোথায় আটকে যায়?'),
    team: () => t('Who is doing what, and how fast?', 'কে কী কাজ করছেন, আর কত দ্রুত?'),
  };
  /** Default action per insight line (by position) for reports whose lines don't set one. */
  const ACTS = {
    sales: [AC('See products', 'প্রোডাক্ট দেখুন', 'reports', 'products'), AC('Plan a post', 'পোস্ট প্ল্যান', 'marketing', 'calendar'), AC('COD rules', 'COD নিয়ম', 'rules', 'all'), AC('Coupons', 'কুপন', 'rules', 'coupons')],
    products: [AC('Make combo', 'কম্বো বানান', 'products', 'combos'), AC('Reorder', 'রিঅর্ডার', 'products', 'stock'), AC('Reorder', 'রিঅর্ডার', 'products', 'stock'), AC('Make combo', 'কম্বো বানান', 'products', 'combos')],
    customers: [AC('Customer list', 'কাস্টমার লিস্ট', 'customers', 'all'), AC('Customer grades', 'কাস্টমার গ্রেড', 'rules', 'all'), AC('Send win-back', 'ফেরানোর মেসেজ', 'marketing', 'messages')],
    delivery: [AC('Returns', 'রিটার্ন', 'orders', 'returns'), AC('Courier rules', 'কুরিয়ার নিয়ম', 'rules', 'all'), AC('Ask advance', 'আগে চার্জ নিন', 'rules', 'all'), AC('See returns', 'রিটার্ন দেখুন', 'orders', 'returns')],
    marketing: [AC('Campaigns', 'ক্যাম্পেইন', 'marketing', 'campaigns'), AC('Raise budget', 'বাজেট বাড়ান', 'marketing', 'campaigns'), AC('Pause ad', 'বিজ্ঞাপন থামান', 'marketing', 'campaigns'), AC('Plan & ideas', 'প্ল্যান ও আইডিয়া', 'marketing', 'plan')],
    areas: (x) => (x.tone === 'b' ? AC('Ask delivery charge first', 'আগে ডেলিভারি চার্জ', 'rules', 'all') : AC('Plan a local ad', 'লোকাল বিজ্ঞাপন', 'marketing', 'plan')),
    team: [AC('Inbox', 'ইনবক্স', 'inbox'), AC('Processing', 'প্রসেসিং', 'orders', 'processing'), AC('Open inbox', 'ইনবক্স খুলুন', 'inbox')],
  };
  const kpis = (arr) => `<div class="rep-kpis">${arr.slice(0, 4).map((k) => `<div class="card">${U.kpi(k)}</div>`).join('')}</div>` +
    (arr.length > 4 ? `<div class="rep-ks">${arr.slice(4).map((k) => `<div><span>${k.label}</span><b>${k.value}</b>${k.delta || ''}${k.sub ? `<em>${k.sub}</em>` : ''}</div>`).join('')}</div>` : '');

  /** Sortable, clickable table. cols: {h, v(row) sort value, f(row) html, r, hide}. */
  function stbl(id, cols, rows, { sort = [0, 'desc'], onRow, limit = 12, empty } = {}) {
    if (!S.sort[id]) S.sort[id] = { i: sort[0], dir: sort[1] };
    const st = S.sort[id]; const c = cols[st.i];
    const sorted = rows.slice();
    if (c && c.v) sorted.sort((a, b) => { const x = c.v(a), y = c.v(b); const d = typeof x === 'string' ? String(x).localeCompare(String(y)) : x - y; return st.dir === 'asc' ? d : -d; });
    if (onRow) H[id] = { rows: sorted, fn: onRow };
    if (!sorted.length) return `<div class="tbl-wrap"><div class="empty">${empty || t('No data for this period', 'এই সময়ে কোনো ডেটা নেই')}</div></div>`;
    const all = S.showAll[id]; const shown = all ? sorted : sorted.slice(0, limit);
    const th = cols.map((k, i) => `<th class="${k.r ? 'r' : ''} ${k.hide ? 'hide-sm' : ''} ${i === st.i ? 'sorted' : ''}" ${k.v ? `data-si="${i}"` : ''}>${k.h}${k.v ? `<span class="ar">${i === st.i ? (st.dir === 'asc' ? '▲' : '▼') : '↕'}</span>` : ''}</th>`).join('');
    const body = shown.map((row, ri) => `<tr ${onRow ? `data-ri="${ri}"` : ''}>${cols.map((k) => `<td class="${k.r ? 'r' : ''} ${k.hide ? 'hide-sm' : ''}">${k.f(row)}</td>`).join('')}</tr>`).join('');
    const more = sorted.length > limit ? `<button class="btn sm ghost rep-more" data-more="${id}">${all ? t('Show less', 'কম দেখান') : t(`Show all ${sorted.length}`, `সব ${sorted.length}টি দেখান`)}</button>` : '';
    return `<div class="tbl-wrap"><table class="tbl rep-tbl" data-st="${id}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>${more}`;
  }

  function ordersDrawer(title, os) {
    const live = liveO(os);
    const body = `<div class="rep-mini" style="margin-bottom:12px"><div><b>${F.num(os.length)}</b><span>${t('orders', 'অর্ডার')}</span></div><div><b>${F.tkShort(A.sum(live, (o) => o.total))}</b><span>${t('order value', 'অর্ডারের মূল্য')}</span></div><div><b>${F.tk(A.sum(os, C.orderProfit))}</b><span>${t('profit before ads', 'বিজ্ঞাপনের আগে লাভ')}</span></div></div>` +
      U.table([{ h: t('Order', 'অর্ডার'), f: (o) => `<b>${o.id}</b><div class="small muted">${F.dt(o.created)}</div>` }, { h: t('Customer', 'কাস্টমার'), f: (o) => `${A.esc(o.name)}<div class="small muted">${A.esc(o.district)}</div>` }, { h: t('Status', 'অবস্থা'), f: (o) => U.statusBadge(o.status) }, { h: t('Total', 'মোট'), r: 1, f: (o) => F.tk(o.total) }],
        os.slice(0, 120).map((o) => ({ ...o, _id: o.id })), { onRow: true });
    U.drawer(title, body, { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button><a class="btn primary" href="${A.href('orders', 'all')}" data-close>${t('Open Orders', 'অর্ডারে যান')}</a>`, onOpen: (d) => d.querySelectorAll('tr[data-row]').forEach((tr) => (tr.onclick = () => { U.close(); A.go('orders', 'all', tr.dataset.row); })) });
  }
  /** Sizes that sold in the last 30 days and have under 14 days of stock left (or are out). */
  let VS = null;
  const shortSizes = (p) => {
    if (!VS) { VS = {}; const from = A.TODAY - 30 * DAY; for (const o of A.D.orders) { if (o.status === 'cancelled' || new Date(o.created) < from) continue; for (const l of o.lines) VS[l.sku] = (VS[l.sku] || 0) + l.qty; } setTimeout(() => (VS = null), 0); }
    return p.variants.filter((v) => VS[v.sku] && v.stock <= Math.max(2, Math.ceil(VS[v.sku] / 30 * 14)));
  };
  const goProduct = (id) => A.go('products', 'all', id);
  const goCustomer = (id) => A.go('customers', 'all', id);

  /* ---------------- toolbar ---------------- */
  const FILTERS = {
    ch: () => [['all', t('All channels', 'সব চ্যানেল')], ...Object.keys(CHN).map((c) => [c, chName(c)])],
    cat: () => [['all', t('All categories', 'সব ক্যাটাগরি')], ...A.CATS.map((c) => [c.id, t(c.en, c.bn)])],
    courier: () => [['all', t('All couriers', 'সব কুরিয়ার')], ...A.D.couriers.map((c) => [c.id, c.name])],
    zone: () => [['all', t('All zones', 'সব জোন')], ...Object.keys(ZN).map((z) => [z, zName(z)])],
    area: () => [['all', t('All areas', 'সব এলাকা')], ...Object.keys(ZN).map((z) => ['z:' + z, zName(z)]), ...Object.keys(DIVBN).map((d) => ['d:' + d, t(d + ' division', DIVBN[d] + ' বিভাগ')])],
    adch: () => [['all', t('All ad channels', 'সব বিজ্ঞাপন চ্যানেল')], ['Facebook', 'Facebook'], ['Google', 'Google'], ['TikTok', 'TikTok']],
  };
  /** Schedule saved per report: { tg, email, freq daily|weekly|monthly, time }. Older saves were just true. */
  const subOf = (tab) => { const x = (A.D.reportSubs || {})[tab]; if (!x) return null; return x === true ? { tg: true, email: false, freq: 'weekly', time: '09:00' } : x; };
  const FREQ = () => ({ daily: t('Every day', 'প্রতিদিন'), weekly: t('Every Monday', 'প্রতি সোমবার'), monthly: t('1st of every month', 'প্রতি মাসের 1 তারিখ') });
  const subText = (x) => `${FREQ()[x.freq]} · ${x.time} · ${[x.tg ? 'Telegram' : '', x.email ? t('Email', 'ইমেইল') : ''].filter(Boolean).join(' + ')}`;
  function toolbar(tab, title) {
    const r = rng(); const opts = [...U.rangeOpts(), ['6m', t('6 months', '6 মাস')], ['custom', t('Custom dates', 'নিজের তারিখ')]];
    if (!A.D.reportSubs) A.D.reportSubs = {};
    if (!A.D.reportViews) A.D.reportViews = [];
    const sub = subOf(tab);
    const views = A.D.reportViews;
    return U.card('', `
      <div class="rep-seg">${U.seg('rep-range', opts, S.range)}</div>
      <div class="rep-phone">${U.select('rep-range-m', opts, S.range)}</div>
      ${S.range === 'custom' ? `<span class="rep-date"><input type="date" class="inp" id="rep-from" value="${S.custom.from}" min="2026-09-14" max="2026-11-12"><span class="muted">–</span><input type="date" class="inp" id="rep-to" value="${S.custom.to}" min="2026-09-14" max="2026-11-12"><button class="btn sm" id="rep-apply">${t('Apply', 'দেখান')}</button></span>` : ''}
      <label class="rep-sw">${U.switch('rep-cmp', S.compare)}${t('Compare with previous period', 'আগের সময়ের সাথে তুলনা')}</label>
      <div class="rep-per">${periodText(r)}${filtered() ? ' · ' + t('Filter on: ads and office costs are shared by sales', 'ফিল্টার চালু: বিজ্ঞাপন ও অফিস খরচ বিক্রির ভাগে ধরা') : ''}</div>
      <div class="rep-bar2">
        ${ACT.map((k) => U.select('rep-f-' + k, FILTERS[k](), S.f[k])).join('')}
        ${ACT.some((k) => S.f[k] !== 'all') ? `<button class="btn sm ghost" id="rep-clear">${A.icon('x')} ${t('Clear', 'মুছুন')}</button>` : ''}
        ${U.select('rep-view', [['', views.length ? t(`Saved views (${views.length})`, `সেভ করা ভিউ (${views.length})`) : t('Saved views', 'সেভ করা ভিউ')], ...views.map((v) => [v.id, v.name])], '')}
        <button class="btn sm ghost" id="rep-save">${A.icon('star')} ${t('Save view', 'ভিউ সেভ')}</button>
        <span class="grow"></span>
        <span class="row rep-btns" style="gap:8px;flex-wrap:nowrap"><button class="btn sm" id="rep-xls">${A.icon('down')} Excel</button><button class="btn sm" id="rep-pdf">${A.icon('down')} PDF</button><button class="btn sm ghost" id="rep-prt" title="${t('Print', 'প্রিন্ট')}">${A.icon('print')}</button><button class="btn sm" id="rep-dlp">${t('Report packs', 'রিপোর্ট প্যাক')}</button><button class="btn sm ${sub ? 'primary' : ''}" id="rep-sch" title="${sub ? A.esc(subText(sub)) : ''}">${A.icon('send')} ${sub ? t('Scheduled', 'শিডিউল চালু') : t('Schedule', 'শিডিউল')}</button></span>
      </div>`, { cls: 'rep-bar' });
  }

  function scheduleModal(tab, title) {
    const x = subOf(tab) || { tg: true, email: false, freq: tab === 'review' ? 'monthly' : 'weekly', time: '09:00' };
    const tm = ['08:00', '09:00', '10:00', '18:00', '21:00'].map((v) => [v, v]);
    U.modal(t('Send this report by itself', 'রিপোর্টটা নিজে থেকে পাঠান'), `
      <p class="muted small" style="margin-top:0">${t(`"${title}" goes to you as a short summary with the PDF attached. You choose where and how often.`, `"${title}" ছোট সারাংশ ও PDF সহ আপনার কাছে যাবে। কোথায় ও কতবার, আপনি ঠিক করুন।`)}</p>
      <div class="stack">
        <label class="row" style="gap:10px">${U.switch('rs-tg', x.tg)}<span><b>Telegram</b><div class="small muted">${t('To your Telegram (set in Settings)', 'আপনার টেলিগ্রামে (সেটিংসে ঠিক করা)')}</div></span></label>
        <label class="row" style="gap:10px">${U.switch('rs-em', x.email)}<span><b>${t('Email', 'ইমেইল')}</b><div class="small muted">${A.esc((A.D.store && A.D.store.email) || 'owner@extas.com.bd')}</div></span></label>
        <div class="formgrid">${U.field(t('How often', 'কতবার'), U.select('rs-fq', Object.entries(FREQ()), x.freq))}${U.field(t('Time', 'সময়'), U.select('rs-tm', tm, x.time))}</div>
      </div>`, { foot: `${subOf(tab) ? `<button class="btn danger" id="rs-off">${t('Turn off', 'বন্ধ করুন')}</button>` : ''}<span class="grow"></span><button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="rs-ok">${t('Save schedule', 'শিডিউল সেভ')}</button>`,
      onOpen: (m) => {
        m.querySelector('#rs-ok').onclick = () => {
          const v = { tg: m.querySelector('#rs-tg').checked, email: m.querySelector('#rs-em').checked, freq: m.querySelector('#rs-fq').value, time: m.querySelector('#rs-tm').value };
          if (!v.tg && !v.email) { A.toast(t('Pick Telegram, email or both', 'টেলিগ্রাম, ইমেইল বা দুটোই বাছুন'), 'bad'); return; }
          A.D.reportSubs[tab] = v; A.commit('Report schedule set: ' + title); U.close(); A.toast(t(`"${title}" will be sent: `, `"${title}" যাবে: `) + subText(v), 'good'); draw();
        };
        const off = m.querySelector('#rs-off'); if (off) off.onclick = () => { delete A.D.reportSubs[tab]; A.commit('Report schedule off: ' + title); U.close(); A.toast(t('Schedule turned off', 'শিডিউল বন্ধ হলো'), 'good'); draw(); };
      } });
  }

  function wire(el, tab, title, bar = true) {
    const rr = () => draw();
    A.on(el, '[data-more]', 'click', (e, b) => { S.showAll[b.dataset.more] = !S.showAll[b.dataset.more]; rr(); });
    A.on(el, '[data-grain]', 'click', (e, b) => { S.grain = b.dataset.grain; rr(); });
    A.on(el, 'table[data-st] th[data-si]', 'click', (e, th) => { const id = th.closest('table').dataset.st; const i = +th.dataset.si; const st = S.sort[id]; if (st.i === i) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.i = i; st.dir = 'desc'; } rr(); });
    A.on(el, 'table[data-st] tr[data-ri]', 'click', (e, tr) => { const id = tr.closest('table').dataset.st; const h = H[id]; if (h) h.fn(h.rows[+tr.dataset.ri]); });
    const sch = el.querySelector('#rep-sch'); if (sch) sch.onclick = () => scheduleModal(tab, title);
    if (!bar) return;
    const setRange = (v) => { S.range = v; rr(); };
    A.on(el, '#rep-range button', 'click', (e, b) => setRange(b.dataset.v));
    const m = el.querySelector('#rep-range-m'); if (m) m.onchange = () => setRange(m.value);
    const ap = el.querySelector('#rep-apply'); if (ap) ap.onclick = () => { const a = el.querySelector('#rep-from').value, b = el.querySelector('#rep-to').value; if (!a || !b || a > b) { A.toast(t('Pick a start date before the end date', 'শেষ তারিখের আগের একটা শুরুর তারিখ দিন'), 'bad'); return; } S.custom = { from: a, to: b }; rr(); };
    el.querySelector('#rep-cmp').onchange = (e) => { S.compare = e.target.checked; rr(); };
    for (const k of ACT) { const s = el.querySelector('#rep-f-' + k); if (s) s.onchange = () => { S.f[k] = s.value; rr(); }; }
    const cl = el.querySelector('#rep-clear'); if (cl) cl.onclick = () => { for (const k of ACT) S.f[k] = 'all'; rr(); };
    el.querySelector('#rep-xls').onclick = () => reportFile(tab, title, 'xlsx');
    el.querySelector('#rep-pdf').onclick = () => reportFile(tab, title, 'pdf');
    el.querySelector('#rep-prt').onclick = () => reportFile(tab, title, 'print');
    el.querySelector('#rep-dlp').onclick = () => downloadsDrawer();
    const vw = el.querySelector('#rep-view'); if (vw) vw.onchange = () => {
      const v = A.byId(A.D.reportViews, vw.value); if (!v) return;
      S.range = v.range; S.compare = v.compare; Object.assign(S.f, v.f); if (v.custom) S.custom = v.custom;
      A.toast(t('Opened view: ', 'ভিউ খোলা হলো: ') + v.name, 'good');
      if (v.tab !== tab) A.go('reports', v.tab); else rr();
    };
    el.querySelector('#rep-save').onclick = () => U.modal(t('Save this view', 'এই ভিউ সেভ করুন'), U.field(t('Name', 'নাম'), U.input('rv-name', `${title} · ${(U.rangeOpts().concat([['6m', t('6 months', '6 মাস')], ['custom', t('Custom dates', 'নিজের তারিখ')]]).find((o) => o[0] === S.range) || ['', ''])[1]}`), t('Saves the period, the comparison and the filters. Pick it later from "Saved views".', 'সময়, তুলনা ও ফিল্টার সেভ হবে। পরে "সেভ করা ভিউ" থেকে বেছে নিন।')), {
      foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="rv-ok">${t('Save', 'সেভ')}</button>`,
      onOpen: (md) => { md.querySelector('#rv-ok').onclick = () => { const name = md.querySelector('#rv-name').value.trim(); if (!name) { A.toast(t('Give the view a name', 'ভিউয়ের একটা নাম দিন'), 'bad'); return; } A.D.reportViews.push({ id: 'RV' + Date.now(), name, tab, range: S.range, compare: S.compare, custom: { ...S.custom }, f: { ...S.f } }); A.commit('Saved report view: ' + name); U.close(); A.toast(t('View saved', 'ভিউ সেভ হলো'), 'good'); rr(); }; },
    });
  }

  function draw() { if (!CUR) return; const y = window.scrollY; TABS[CUR.r.tab].render(CUR.el, CUR.r); window.scrollTo(0, y); }

  /** Frame shared by every report. */
  function frame(el, r, tab, { title, sub, filters = [], body, bar = true }) {
    CUR = { el, r }; H = {};
    ACT = ['ch', 'cat', ...(tab === 'areas' ? [] : ['area']), ...filters.filter((f) => f === 'adch')];
    const content = body();
    el.innerHTML = A.pageHead(t('Reports', 'রিপোর্ট'), sub) + A.tabsBar('reports', tab) + (bar ? toolbar(tab, title) : '') + content;
    wire(el, tab, title, bar);
  }

  /* ---------------- helpers for charts ---------------- */
  function trend(r, series, { money = true, grain } = {}) {
    const bs = buckets(r, grain || 'day');
    const out = [];
    series.forEach((s) => {
      out.push({ name: s.name, color: s.color, values: bs.map((b) => s.fn(b.from, b.to)) });
      if (s.prev && S.compare) out.push({ name: s.name + t(' (before)', ' (আগে)'), color: s.color, dashed: true, values: bs.map((b) => s.fn(b.pfrom, b.pto)) });
    });
    return A.chart.line({ labels: bs.map((b) => b.label), series: out, money });
  }
  const lineSales = (os) => { const m = {}; for (const o of liveO(os)) for (const l of o.lines) if (lineOk(l)) { m[l.pid] = m[l.pid] || { pid: l.pid, qty: 0, value: 0, cost: 0 }; m[l.pid].qty += l.qty; m[l.pid].value += l.qty * l.price; m[l.pid].cost += l.qty * l.cost; } return m; };
  const catSales = (os) => { const m = {}; for (const o of liveO(os)) for (const l of o.lines) if (lineOk(l)) { const c = catOf(l); m[c] = (m[c] || 0) + l.qty * l.price; } return m; };
  /** Share an order's profit over its lines by line value (for category profit). */
  const catProfit = (os) => { const m = {}; for (const o of os) { const pr = C.orderProfit(o); if (!pr) continue; for (const l of o.lines) if (lineOk(l)) { const c = catOf(l); m[c] = (m[c] || 0) + pr * (l.qty * l.price) / o.subtotal; } } return m; };
  const topMover = (cur, prev) => { let best = null; for (const k of Object.keys(cur)) { const p = chg(cur[k], prev[k] || 0); if (p == null || cur[k] < 5000) continue; if (!best || Math.abs(cur[k] - (prev[k] || 0)) > Math.abs(best.d)) best = { k, p, d: cur[k] - (prev[k] || 0) }; } return best; };
  const finishedBy = (os, keyFn, min = 4) => { const g = A.groupBy(os.filter((o) => C.isDelivered(o) || o.status === 'returned'), keyFn); return Object.entries(g).map(([k, v]) => ({ k, n: v.length, rate: pc(v.filter((o) => o.status === 'returned').length, v.length) })).filter((x) => x.n >= min).sort((a, b) => b.rate - a.rate); };

  /* ================= SALES ================= */
  function rSales(el, r0) {
    frame(el, r0, 'sales', { title: t('Sales report', 'বিক্রির রিপোর্ট'), sub: t('What sold, when and how customers paid', 'কী বিক্রি হলো, কখন, আর কাস্টমার কীভাবে পেমেন্ট করলেন'), filters: ['ch', 'cat'], body: () => {
      const r = rng(); const k = kp(r.from, r.to), q = kp(r.prevFrom, r.prevTo);
      const hours = Array(24).fill(0), wds = Array(7).fill(0);
      for (const o of k.live) { hours[dhH(o.created)] += o.total; wds[dhW(o.created)] += o.total; }
      const peakH = hours.indexOf(Math.max(...hours)); const bestW = wds.indexOf(Math.max(...wds));
      const byPay = A.groupBy(k.live, (o) => o.payment); const codShare = pc((byPay.COD || []).length, k.live.length);
      const disc = A.sum(k.live, (o) => o.discount); const discQ = A.sum(liveO(q.os), (o) => o.discount);
      const withD = k.live.filter((o) => o.discount > 0), noD = k.live.filter((o) => !o.discount);
      const items = [
        I2(t(`${k.orders} orders worth ${F.tk(k.orderValue)} (${sg(chg(k.orderValue, q.orderValue))} vs ${prevName(r)}); ${k.pieces} pieces sold.`, `${k.orders}টি অর্ডার, মূল্য ${F.tk(k.orderValue)} (${prevName(r)} তুলনায় ${sg(chg(k.orderValue, q.orderValue))}); ${k.pieces} পিস বিক্রি।`), k.orderValue >= q.orderValue ? 'good' : 'bad'),
        I2(t(`Busiest time is ${peakH}:00–${peakH + 1}:00 and the best day is ${WD[bestW][0]}. Post offers an hour before.`, `সবচেয়ে বেশি অর্ডার আসে ${peakH}:00–${peakH + 1}:00-এ, সেরা দিন ${WD[bestW][1]}বার। অফার এর 1 ঘণ্টা আগে দিন।`)),
        I2(t(`${F.pct(codShare, 0)} pay cash on delivery. Paid-online orders: ${k.live.length - (byPay.COD || []).length}.`, `${F.pct(codShare, 0)} কাস্টমার ক্যাশ অন ডেলিভারিতে দেন। অনলাইনে পেমেন্ট: ${k.live.length - (byPay.COD || []).length}টি অর্ডার।`)),
        I2(t(`Discounts cost ${F.tk(disc)} (${sg(chg(disc, discQ))}). Orders with a discount average ${F.tk(withD.length ? A.sum(withD, (o) => o.total) / withD.length : 0)} vs ${F.tk(noD.length ? A.sum(noD, (o) => o.total) / noD.length : 0)} without.`, `ছাড়ে খরচ ${F.tk(disc)} (${sg(chg(disc, discQ))})। ছাড়সহ অর্ডারের গড় ${F.tk(withD.length ? A.sum(withD, (o) => o.total) / withD.length : 0)}, ছাড় ছাড়া ${F.tk(noD.length ? A.sum(noD, (o) => o.total) / noD.length : 0)}।`)),
      ];
      const bs = buckets(r, S.grain);
      const cnt = (fn) => (a, b) => fn(fo(a, b)).length;
      const lineChart = A.chart.line({ labels: bs.map((b) => b.label), money: false, series: [
        { name: t('Orders', 'অর্ডার'), color: 'var(--c2)', values: bs.map((b) => cnt(liveO)(b.from, b.to)) },
        { name: t('Delivered', 'ডেলিভারড'), color: 'var(--good)', values: bs.map((b) => cnt(delO)(b.from, b.to)) },
        { name: t('Returned', 'রিটার্ন'), color: 'var(--bad)', values: bs.map((b) => cnt(retO)(b.from, b.to)) },
        ...(S.compare ? [{ name: t('Orders (before)', 'অর্ডার (আগে)'), color: 'var(--c2)', dashed: true, values: bs.map((b) => cnt(liveO)(b.pfrom, b.pto)) }] : []),
      ] });
      const byCh = A.groupBy(k.live, (o) => o.channel);
      const chBars = A.chart.bars({ items: Object.keys(byCh).sort((a, b) => A.sum(byCh[b], (o) => o.total) - A.sum(byCh[a], (o) => o.total)).map((c, i) => ({ label: `${chName(c)} · ${byCh[c].length}`, value: A.sum(byCh[c], (o) => o.total), color: COLS[i] })) });
      const payD = A.chart.donut({ parts: Object.keys(PAY).filter((p) => byPay[p]).map((p, i) => ({ label: t(PAY[p][0], PAY[p][1]), value: byPay[p].length, color: COLS[i] })), center: F.num(k.live.length) });
      const hrs = []; for (let h = 9; h <= 23; h++) hrs.push(h);
      const hourCols = A.chart.columns({ labels: hrs.map((h) => String(h)), values: hrs.map((h) => hours[h]) });
      const wdOrder = [6, 0, 1, 2, 3, 4, 5];
      const wdCols = A.chart.columns({ labels: wdOrder.map((d) => t(WD[d][0], WD[d][1])), values: wdOrder.map((d) => wds[d]), color: 'var(--c2)' });
      // discounts
      const dg = A.groupBy(withD, (o) => o.coupon || (C.pieces(o) >= 3 ? 'BUY3' : 'BUY2'));
      const dname = (key) => (key === 'BUY3' ? t('Buy 3, get 10% off', '3টা নিলে 10% ছাড়') : key === 'BUY2' ? t('Buy 2, get 5% off', '2টা নিলে 5% ছাড়') : t('Coupon ', 'কুপন ') + key);
      const drows = Object.entries(dg).map(([key, os]) => ({ key, os, n: os.length, off: A.sum(os, (o) => o.discount), v: A.sum(os, (o) => o.total), aov: A.sum(os, (o) => o.total) / os.length, pcs: A.sum(os, C.pieces) / os.length }));
      const days = bs.map((b) => { const os = fo(b.from, b.to); const lv = liveO(os); return { b, os, n: lv.length, pcs: A.sum(lv, C.pieces), v: A.sum(lv, (o) => o.total), del: delO(os).length, ret: retO(os).length, can: os.length - lv.length }; });
      return ins(items) + kpis([
        { label: t('Order value', 'অর্ডারের মূল্য'), value: F.tk(k.orderValue), delta: dl(k.orderValue, q.orderValue) },
        { label: t('Orders', 'অর্ডার'), value: F.num(k.orders), delta: dl(k.orders, q.orders) },
        { label: t('Pieces sold', 'পিস বিক্রি'), value: F.num(k.pieces), delta: dl(k.pieces, q.pieces) },
        { label: t('Average order', 'গড় অর্ডার'), value: F.tk(k.aov), delta: dl(k.aov, q.aov) },
        { label: t('Delivered sales', 'ডেলিভারড বিক্রি'), value: F.tk(k.sales), delta: dl(k.sales, q.sales) },
        { label: t('Cancelled', 'বাতিল'), value: F.num(k.cancelled), delta: dl(k.cancelled, q.cancelled, true), sub: F.pct(pc(k.cancelled, k.os.length)) },
      ]) + U.card(t('Orders, delivered and returned', 'অর্ডার, ডেলিভারড ও রিটার্ন'), `<div class="row" style="margin-bottom:8px">${U.seg('rep-grain', [['day', t('By day', 'দিন অনুযায়ী')], ['week', t('By week', 'সপ্তাহ অনুযায়ী')]], S.grain).replace(/data-v=/g, 'data-grain=')}</div>${lineChart}`, { sub: t('Count of orders placed in each period', 'প্রতিটা সময়ে কতগুলো অর্ডার এসেছে') }) +
      `<div class="grid g3">${U.card(t('By channel', 'চ্যানেল অনুযায়ী'), chBars)}${U.card(t('By payment method', 'পেমেন্ট মাধ্যম অনুযায়ী'), payD, { sub: t('Number of orders', 'অর্ডারের সংখ্যা') })}${U.card(t('Discounts & coupons', 'ছাড় ও কুপন'), stbl('sa-disc', [
        { h: t('Offer', 'অফার'), v: (x) => x.key, f: (x) => `<b>${dname(x.key)}</b><div class="small muted">${x.n} ${t('orders', 'অর্ডার')} · ${x.pcs.toFixed(1)} ${t('pcs/order', 'পিস/অর্ডার')}</div>` },
        { h: t('Cost', 'খরচ'), r: 1, v: (x) => x.off, f: (x) => F.tk(x.off) },
        { h: t('Avg order', 'গড় অর্ডার'), r: 1, v: (x) => x.aov, f: (x) => F.tk(x.aov) },
      ], drows, { sort: [1, 'desc'], onRow: (x) => ordersDrawer(dname(x.key), x.os), limit: 6 }))}</div>` +
      `<div class="grid g2">${U.card(t('By hour of day', 'দিনের কোন ঘণ্টায়'), hourCols, { sub: t('Order value by the hour the order was placed', 'অর্ডারের ঘণ্টা অনুযায়ী মূল্য') })}${U.card(t('By weekday', 'সপ্তাহের কোন দিনে'), wdCols, { sub: t('Friday is the big day for most Bangladeshi shops', 'বেশিরভাগ দেশি দোকানে শুক্রবার সবচেয়ে বড় দিন') })}</div>` +
      U.card(S.grain === 'week' ? t('Week by week', 'সপ্তাহ অনুযায়ী') : t('Day by day', 'দিন অনুযায়ী'), stbl('sa-days', [
        { h: t('Period', 'সময়'), v: (x) => x.b.from, f: (x) => `<b>${x.b.label}</b>` },
        { h: t('Orders', 'অর্ডার'), r: 1, v: (x) => x.n, f: (x) => F.num(x.n) },
        { h: t('Pieces', 'পিস'), r: 1, hide: 1, v: (x) => x.pcs, f: (x) => F.num(x.pcs) },
        { h: t('Order value', 'অর্ডারের মূল্য'), r: 1, v: (x) => x.v, f: (x) => F.tk(x.v) },
        { h: t('Delivered', 'ডেলিভারড'), r: 1, hide: 1, v: (x) => x.del, f: (x) => F.num(x.del) },
        { h: t('Returned', 'রিটার্ন'), r: 1, v: (x) => x.ret, f: (x) => (x.ret ? `<span style="color:var(--bad)">${x.ret}</span>` : '0') },
        { h: t('Cancelled', 'বাতিল'), r: 1, hide: 1, v: (x) => x.can, f: (x) => F.num(x.can) },
      ], days, { sort: [0, 'desc'], onRow: (x) => ordersDrawer(x.b.label + ' · ' + t('orders', 'অর্ডার'), x.os) }), { sub: t('Click a row to see the orders', 'অর্ডার দেখতে সারিতে চাপুন') });
    } });
  }

  /* ================= PRODUCTS ================= */
  function rProducts(el, r0) {
    frame(el, r0, 'products', { title: t('Product report', 'প্রোডাক্ট রিপোর্ট'), sub: t('What sells, what sits, and what to reorder', 'কী বিক্রি হয়, কী পড়ে থাকে, আর কী আবার আনতে হবে'), filters: ['cat'], body: () => {
      const r = rng(); const k = kp(r.from, r.to), q = kp(r.prevFrom, r.prevTo);
      const ls = lineSales(k.os), lq = lineSales(q.os);
      const pool = A.D.products.filter((p) => p.status === 'live' && (!on('cat') || p.cat === S.f.cat));
      // returns by product
      const rp = {}; for (const o of k.os) { if (!C.isDelivered(o) && o.status !== 'returned') continue; for (const l of o.lines) { if (!lineOk(l)) continue; rp[l.pid] = rp[l.pid] || { fin: 0, ret: 0 }; rp[l.pid].fin += l.qty; if (o.status === 'returned') rp[l.pid].ret += l.qty; } }
      const rows = pool.map((p) => { const s = ls[p.id] || { qty: 0, value: 0, cost: 0 }; const stock = A.sum(p.variants, (v) => v.stock); const days = C.stockDays(p); const rr = rp[p.id] || { fin: 0, ret: 0 };
        return { p, _id: p.id, qty: s.qty, value: s.value, pv: (lq[p.id] || {}).value || 0, margin: pc(s.value - s.cost, s.value), stock, days, st: pc(p.sold30, p.sold30 + stock), ret: pc(rr.ret, rr.fin), retN: rr.fin, short: shortSizes(p) }; });
      rows.forEach((x) => { x.reorder = x.short.length > 0; x.out = x.short.filter((v) => v.stock === 0).length; });
      const sold = rows.filter((x) => x.qty > 0).sort((a, b) => b.qty - a.qty);
      const worst = rows.filter((x) => x.stock > 20).sort((a, b) => a.qty - b.qty || b.stock - a.stock).slice(0, 6);
      const reorder = rows.filter((x) => x.reorder).sort((a, b) => b.out - a.out || b.short.length - a.short.length);
      // category table
      const catRows = A.CATS.filter((c) => !on('cat') || c.id === S.f.cat).map((c) => { const rs = rows.filter((x) => x.p.cat === c.id); const fin = A.sum(rs, (x) => (rp[x.p.id] || { fin: 0 }).fin), ret = A.sum(rs, (x) => (rp[x.p.id] || { ret: 0 }).ret); const v = A.sum(rs, (x) => x.value); const cost = A.sum(rs, (x) => (ls[x.p.id] || { cost: 0 }).cost); return { c: c.id, pcs: A.sum(rs, (x) => x.qty), v, pv: A.sum(rs, (x) => x.pv), m: pc(v - cost, v), ret: pc(ret, fin), stock: A.sum(rs, (x) => x.stock) }; }).filter((x) => x.pcs || x.stock);
      // size & colour demand
      const sz = {}, col = {}; for (const o of k.live) for (const l of o.lines) { if (!lineOk(l)) continue; const c = catOf(l); sz[c] = sz[c] || {}; sz[c][l.size] = (sz[c][l.size] || 0) + l.qty; col[l.color] = (col[l.color] || 0) + l.qty; }
      const heat = (sizes, shapeOk) => { const cs = A.CATS.filter((c) => shapeOk(c.shape) && sz[c.id]); if (!cs.length) return ''; return `<div class="tbl-wrap"><table class="tbl rep-heat"><thead><tr><th>${t('Category', 'ক্যাটাগরি')}</th>${sizes.map((s) => `<th class="r">${s}</th>`).join('')}</tr></thead><tbody>${cs.map((c) => { const row = sz[c.id]; const tot = A.sum(sizes, (s) => row[s] || 0) || 1; return `<tr><td><b>${t(c.en, c.bn)}</b></td>${sizes.map((s) => { const pct = (row[s] || 0) / tot * 100; return `<td class="h" style="background:color-mix(in srgb, var(--accent) ${Math.round(pct * 1.6)}%, var(--card))${pct > 30 ? ';color:var(--accent-ink)' : ''}" title="${row[s] || 0} pcs">${Math.round(pct)}%</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>`; };
      const colItems = Object.entries(col).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, n]) => ({ label: `${U.sw(c)} ${c}`, value: n, text: n + t(' pcs', ' পিস'), color: 'var(--c2)' }));
      const lookers = pool.filter((p) => p.views30 > 150).map((p) => ({ p, _id: p.id, views: p.views30, carts: p.carts30, sold: p.sold30, conv: pc(p.sold30, p.views30) })).sort((a, b) => a.conv - b.conv).slice(0, 8);
      const retRows = rows.filter((x) => x.retN >= 3 && x.ret > 0).sort((a, b) => b.ret - a.ret).slice(0, 8);
      // top size in top category
      const topCat = Object.entries(catSales(k.os)).sort((a, b) => b[1] - a[1])[0];
      const topSize = topCat && sz[topCat[0]] ? Object.entries(sz[topCat[0]]).sort((a, b) => b[1] - a[1])[0] : null;
      const best = sold[0]; const dead = rows.filter((x) => x.qty === 0 && x.stock > 30);
      const items = [
        best ? I2(t(`Best seller: ${best.p.name} (${best.qty} pcs, ${F.tk(best.value)}).`, `সবচেয়ে বেশি বিক্রি: ${best.p.name} (${best.qty} পিস, ${F.tk(best.value)})।`), 'good') : null,
        topSize ? I2(t(`In ${catName(topCat[0])}, size ${topSize[0]} sells most (${F.pct(pc(topSize[1], A.sum(Object.values(sz[topCat[0]]))), 0)} of pieces). Keep it deep in stock.`, `${catName(topCat[0])}-এ সাইজ ${topSize[0]} সবচেয়ে বেশি চলে (মোট পিসের ${F.pct(pc(topSize[1], A.sum(Object.values(sz[topCat[0]]))), 0)})। এই সাইজের স্টক বেশি রাখুন।`)) : null,
        I2(t(`${reorder.length} products have selling sizes that are out or will run out within 14 days (${A.sum(reorder, (x) => x.out)} sizes already out). Reorder them from the ERP.`, `${reorder.length}টি প্রোডাক্টের চলতি সাইজ শেষ বা 14 দিনে শেষ হবে (${A.sum(reorder, (x) => x.out)}টি সাইজ এখনই শেষ)। ERP থেকে আবার আনুন।`), reorder.length ? 'bad' : 'good'),
        dead.length ? I2(t(`${dead.length} live products sold nothing in this period but hold ${F.num(A.sum(dead, (x) => x.stock))} pcs. Try a discount or a combo.`, `${dead.length}টি লাইভ প্রোডাক্ট এই সময়ে একটাও বিক্রি হয়নি, স্টকে ${F.num(A.sum(dead, (x) => x.stock))} পিস। ছাড় বা কম্বো দিন।`)) : null,
      ];
      const TR = styleTree(k);
      const stockAll = A.sum(rows, (x) => x.stock), soldAll = A.sum(rows, (x) => x.p.sold30);
      const pName = (x) => `<span class="row" style="gap:8px;flex-wrap:nowrap">${U.thumb(x.p, 32)}<span style="min-width:0"><b class="ellip" style="display:block;max-width:170px">${A.esc(x.p.name)}</b><span class="small muted">${x.p.styleCode}</span></span></span>`;
      return ins(items) + kpis([
        { label: t('Restock now', 'এখনই আবার আনুন'), value: F.num(TR.counts.restock), sub: t('selling, stock running out', 'বিক্রি চলছে, স্টক শেষ হচ্ছে') },
        { label: t('Buy in bulk', 'বেশি করে আনুন'), value: F.num(TR.counts.bulk), sub: t('fast sellers with good margin', 'দ্রুত বিক্রি, ভালো মার্জিন') },
        { label: t('Stop buying', 'আর আনবেন না'), value: F.num(TR.counts.stop), sub: t('slow or low margin', 'ধীর বিক্রি বা কম মার্জিন') },
        { label: t('Pieces sold', 'পিস বিক্রি'), value: F.num(A.sum(rows, (x) => x.qty)), delta: dl(A.sum(rows, (x) => x.qty), A.sum(Object.values(lq).filter((x) => pool.some((p) => p.id === x.pid)), (x) => x.qty)) },
        { label: t('Products that sold', 'যে প্রোডাক্ট বিক্রি হয়েছে'), value: `${sold.length}<span class="muted" style="font-size:14px"> / ${pool.length}</span>` },
        { label: t('Sell-through (30 days)', 'বিক্রির হার (30 দিন)'), value: F.pct(pc(soldAll, soldAll + stockAll)), sub: t('sold ÷ (sold + stock)', 'বিক্রি ÷ (বিক্রি + স্টক)') },
        { label: t('Stock on hand', 'হাতে স্টক'), value: F.num(stockAll) + t(' pcs', ' পিস'), sub: soldAll ? t(`about ${Math.round(stockAll / (soldAll / 30))} days`, `প্রায় ${Math.round(stockAll / (soldAll / 30))} দিন চলবে`) : '' },
          { label: t('Return rate (pieces)', 'রিটার্নের হার (পিস)'), value: F.pct(pc(A.sum(Object.values(rp), (x) => x.ret), A.sum(Object.values(rp), (x) => x.fin))) },
      ]) + TR.html + `<div class="grid g2">${U.card(t('Best sellers', 'সবচেয়ে বেশি বিক্রি'), A.chart.bars({ items: sold.slice(0, 8).map((x) => ({ label: A.esc(x.p.name), value: x.value, text: `${x.qty} ${t('pcs', 'পিস')} · ${F.tkShort(x.value)}` })) }))}${U.card(t('Slow sellers with stock', 'স্টক আছে কিন্তু বিক্রি কম'), `<div class="list">${worst.map((x) => `<a class="li" href="${A.href('products', 'all', x.p.id)}" style="text-decoration:none;color:inherit">${U.thumb(x.p, 32)}<span class="grow"><b class="ellip" style="display:block">${A.esc(x.p.name)}</b><span class="small muted">${x.qty} ${t('sold', 'বিক্রি')} · ${x.p.views30} ${t('views', 'ভিউ')}</span></span>${U.badge(x.stock + t(' in stock', ' স্টকে'), 'warn')}</a>`).join('')}</div>`, { sub: t('Ideas: discount, combo, better photos', 'উপায়: ছাড়, কম্বো, ভালো ছবি') })}</div>` +
      U.card(t('Categories', 'ক্যাটাগরি'), stbl('pd-cat', [
        { h: t('Category', 'ক্যাটাগরি'), v: (x) => catName(x.c), f: (x) => `<b>${catName(x.c)}</b>` },
        { h: t('Pieces', 'পিস'), r: 1, v: (x) => x.pcs, f: (x) => F.num(x.pcs) },
        { h: t('Sales', 'বিক্রি'), r: 1, v: (x) => x.v, f: (x) => F.tk(x.v) + ' ' + dl(x.v, x.pv) },
        { h: t('Margin', 'মার্জিন'), r: 1, v: (x) => x.m, f: (x) => F.pct(x.m, 0) },
        { h: t('Return %', 'রিটার্ন %'), r: 1, v: (x) => x.ret, f: (x) => `<span style="color:${x.ret > 12 ? 'var(--bad)' : 'inherit'}">${F.pct(x.ret)}</span>` },
        { h: t('Stock', 'স্টক'), r: 1, hide: 1, v: (x) => x.stock, f: (x) => F.num(x.stock) },
      ], catRows, { sort: [2, 'desc'], onRow: (x) => { S.f.cat = x.c; A.toast(t('Showing ', 'দেখাচ্ছে: ') + catName(x.c)); draw(); } }), { sub: t('Click a category to filter the whole report', 'পুরো রিপোর্ট ফিল্টার করতে ক্যাটাগরিতে চাপুন') }) +
      `<div class="grid g3">${U.card(t('Size demand: tops', 'সাইজের চাহিদা: টপস'), heat(['S', 'M', 'L', 'XL', 'XXL'], (s) => s === 'top' || s === 'long') || U.empty(t('No tops in this filter', 'এই ফিল্টারে টপস নেই')), { cls: 'span2', sub: t('Share of pieces sold in each size. Darker = more demand.', 'প্রতিটা সাইজে কত ভাগ বিক্রি। গাঢ় রং = বেশি চাহিদা।') })}${U.card(t('Colour demand', 'রঙের চাহিদা'), A.chart.bars({ items: colItems, money: false }))}</div>` +
      `<div class="grid g2">${U.card(t('Size demand: bottoms', 'সাইজের চাহিদা: প্যান্ট'), heat(['30', '32', '34', '36', '38'], (s) => s === 'bottom') || U.empty(t('No bottoms in this filter', 'এই ফিল্টারে প্যান্ট নেই')))}${U.card(t('Looked at a lot, bought little', 'অনেকে দেখেছেন, কম কিনেছেন'), stbl('pd-look', [
        { h: t('Product', 'প্রোডাক্ট'), v: (x) => x.p.name, f: pName },
        { h: t('Views', 'ভিউ'), r: 1, v: (x) => x.views, f: (x) => F.num(x.views) },
        { h: t('Sold', 'বিক্রি'), r: 1, v: (x) => x.sold, f: (x) => F.num(x.sold) },
        { h: t('Buy rate', 'কেনার হার'), r: 1, v: (x) => x.conv, f: (x) => F.pct(x.conv) },
      ], lookers, { sort: [4, 'asc'], limit: 6, onRow: (x) => goProduct(x.p.id) }), { sub: t('Last 30 days. Check price, photos and size chart.', 'গত 30 দিন। দাম, ছবি ও সাইজ চার্ট দেখুন।') })}</div>` +
      `<div class="grid g2">${U.card(t('Reorder now', 'এখনই আবার আনুন'), stbl('pd-re', [
        { h: t('Product', 'প্রোডাক্ট'), v: (x) => x.p.name, f: pName },
        { h: t('Sizes running out', 'যে সাইজ শেষ হচ্ছে'), f: (x) => `<div class="small" style="white-space:normal;max-width:260px">${x.short.slice(0, 4).map((v) => `${v.color} ${v.size} <b style="color:${v.stock ? 'var(--warn)' : 'var(--bad)'}">(${v.stock})</b>`).join(', ')}${x.short.length > 4 ? ' +' + (x.short.length - 4) : ''}</div>` },
        { h: t('Sold/30d', 'বিক্রি/30দিন'), r: 1, hide: 1, v: (x) => x.p.sold30, f: (x) => F.num(x.p.sold30) },
        { h: t('Out', 'শেষ'), r: 1, v: (x) => x.out, f: (x) => U.badge(x.out + t(' out', 'টি শেষ'), x.out ? 'bad' : 'warn') },
      ], reorder, { sort: [3, 'desc'], limit: 6, onRow: (x) => goProduct(x.p.id), empty: t('Nothing runs out in the next 14 days', 'আগামী 14 দিনে কিছু শেষ হবে না') }) + (reorder.length ? `<button class="btn primary sm" id="pd-reorder" style="margin-top:10px">${A.icon('send')} ${t(`Send ${reorder.length} to ERP reorder list`, `${reorder.length}টি ERP রিঅর্ডার লিস্টে পাঠান`)}</button>` : ''))}${U.card(t('Return rate by product', 'প্রোডাক্ট অনুযায়ী রিটার্ন'), stbl('pd-ret', [
        { h: t('Product', 'প্রোডাক্ট'), v: (x) => x.p.name, f: pName },
        { h: t('Pieces', 'পিস'), r: 1, hide: 1, v: (x) => x.retN, f: (x) => F.num(x.retN) },
        { h: t('Return %', 'রিটার্ন %'), r: 1, v: (x) => x.ret, f: (x) => `<b style="color:${x.ret > 15 ? 'var(--bad)' : 'inherit'}">${F.pct(x.ret, 0)}</b>` },
      ], retRows, { sort: [2, 'desc'], limit: 6, onRow: (x) => goProduct(x.p.id), empty: t('No returns worth flagging', 'চোখে পড়ার মতো রিটার্ন নেই') }), { sub: t('Products with 3+ pieces finished', 'অন্তত 3 পিস ডেলিভারি বা রিটার্ন হয়েছে') })}</div>` +
      U.card(t('All products', 'সব প্রোডাক্ট'), stbl('pd-all', [
        { h: t('Product', 'প্রোডাক্ট'), v: (x) => x.p.name, f: pName },
        { h: t('Category', 'ক্যাটাগরি'), hide: 1, v: (x) => catName(x.p.cat), f: (x) => catName(x.p.cat) },
        { h: t('Pieces', 'পিস'), r: 1, v: (x) => x.qty, f: (x) => F.num(x.qty) },
        { h: t('Sales', 'বিক্রি'), r: 1, v: (x) => x.value, f: (x) => F.tk(x.value) },
        { h: t('Margin', 'মার্জিন'), r: 1, hide: 1, v: (x) => x.margin, f: (x) => (x.value ? F.pct(x.margin, 0) : '—') },
        { h: t('Return %', 'রিটার্ন %'), r: 1, hide: 1, v: (x) => x.ret, f: (x) => (x.retN ? F.pct(x.ret, 0) : '—') },
        { h: t('Days left', 'কতদিন চলবে'), r: 1, v: (x) => x.days, f: (x) => (x.reorder ? U.badge(t('Reorder', 'রিঅর্ডার'), 'bad') + ' ' : '') + (x.days >= 999 ? '—' : x.days + t(' d', ' দিন')) },
      ], rows, { sort: [3, 'desc'], onRow: (x) => goProduct(x.p.id) }), { sub: t('Click a product to open it', 'প্রোডাক্ট খুলতে চাপুন') });
    } });
    wireTree(el);
    const b = el.querySelector('#pd-reorder');
    if (b) b.onclick = () => U.confirm(t('Send reorder list to ERP?', 'ERP-তে রিঅর্ডার লিস্ট পাঠাবেন?'), t('The ERP gets a reorder request for each size running out, with 30 days of sales as the suggested quantity. Nothing is bought until you approve it in the ERP.', 'শেষ হতে থাকা প্রতিটা সাইজের জন্য ERP-তে রিঅর্ডারের অনুরোধ যাবে, 30 দিনের বিক্রি হিসাব করে। ERP-তে আপনি অনুমোদন না দেওয়া পর্যন্ত কিছু কেনা হবে না।'), t('Send', 'পাঠান'), () => { A.D.erpEvents.unshift({ t: A.TODAY.toISOString(), kind: 'product', text: 'Reorder request sent from Reports', ok: true }); A.commit('Reorder request sent to ERP from Reports'); A.toast(t('Reorder request sent to the ERP', 'রিঅর্ডারের অনুরোধ ERP-তে গেছে'), 'good'); });
  }

  /* ================= CUSTOMERS ================= */
  function rCustomers(el, r0) {
    frame(el, r0, 'customers', { title: t('Customer report', 'কাস্টমার রিপোর্ট'), sub: t('Who buys, who comes back, and who is slipping away', 'কে কেনেন, কে আবার আসেন, কে চলে যাচ্ছেন'), filters: ['zone'], body: () => {
      const r = rng(); const k = kp(r.from, r.to), q = kp(r.prevFrom, r.prevTo);
      const first = {}; for (const o of A.D.orders) { if (o.status === 'cancelled') continue; if (!first[o.customerId] || o.created < first[o.customerId]) first[o.customerId] = o.created; }
      const isNew = (o) => first[o.customerId] === o.created;
      const stats = (os) => { const lv = liveO(os); const ids = new Set(lv.map((o) => o.customerId)); const nw = new Set(lv.filter(isNew).map((o) => o.customerId)); return { lv, ids, n: ids.size, nw: nw.size, ret: ids.size - nw.size }; };
      const s = stats(k.os), sq = stats(q.os);
      const custs = A.D.customers.filter((c) => (!on('area') || areaOk(c)));
      const buyers = custs.filter((c) => c.orders > 0); const rep = buyers.filter((c) => c.orders - 0 >= 2);
      const repeat = pc(rep.length, buyers.length);
      const avgVal = buyers.length ? A.sum(buyers, (c) => c.spent) / buyers.length : 0;
      const atRisk = buyers.filter((c) => c.delivered > 0 && c.lastOrder && (A.TODAY - new Date(c.lastOrder)) / DAY > 30);
      const per = Object.values(A.groupBy(s.lv, (o) => o.customerId)).map((os) => { const c = A.byId(A.D.customers, os[0].customerId); return { c, _id: c.id, n: os.length, v: A.sum(os, (o) => o.total), isNew: os.some(isNew) }; });
      // cohorts
      const coh = {}; for (const c of buyers) { const f = first[c.id]; if (!f) continue; const m = f.slice(0, 7); coh[m] = coh[m] || { m, n: 0, back: 0, v: 0 }; coh[m].n++; coh[m].v += c.spent; if (c.orders >= 2) coh[m].back++; }
      const MN = { '2026-09': ['September', 'সেপ্টেম্বর'], '2026-10': ['October', 'অক্টোবর'], '2026-11': ['November', 'নভেম্বর'] };
      const cohRows = Object.values(coh).sort((a, b) => a.m.localeCompare(b.m));
      const dist = Object.values(A.groupBy(s.lv, (o) => o.district)).map((os) => ({ d: os[0].district, os, n: new Set(os.map((o) => o.customerId)).size, o: os.length, v: A.sum(os, (o) => o.total) }));
      const items = [
        I2(t(`${s.n} customers ordered: ${s.nw} new and ${s.ret} returning (new ${sg(chg(s.nw, sq.nw))}, returning ${sg(chg(s.ret, sq.ret))}).`, `${s.n} জন কাস্টমার অর্ডার করেছেন: ${s.nw} জন নতুন, ${s.ret} জন পুরনো (নতুন ${sg(chg(s.nw, sq.nw))}, পুরনো ${sg(chg(s.ret, sq.ret))})।`), s.n >= sq.n ? 'good' : 'bad'),
        I2(t(`${F.pct(repeat, 0)} of buyers have ordered more than once. A buyer is worth ${F.tk(avgVal)} on average.`, `${F.pct(repeat, 0)} ক্রেতা একাধিকবার অর্ডার করেছেন। গড়ে একজন ক্রেতার মূল্য ${F.tk(avgVal)}।`)),
        I2(t(`${atRisk.length} past buyers have not ordered for 30+ days. A "we miss you" message with a small coupon usually brings 1 in 8 back.`, `${atRisk.length} জন পুরনো ক্রেতা 30+ দিন অর্ডার করেননি। ছোট কুপনসহ একটা মেসেজে সাধারণত 8 জনে 1 জন ফিরে আসেন।`), atRisk.length > 10 ? 'bad' : ''),
      ];
      const bs = buckets(r, 'day');
      const nr = A.chart.line({ labels: bs.map((b) => b.label), money: false, series: [
        { name: t('New customers', 'নতুন কাস্টমার'), color: 'var(--c1)', values: bs.map((b) => liveO(fo(b.from, b.to)).filter(isNew).length) },
        { name: t('Returning customers', 'পুরনো কাস্টমার'), color: 'var(--c2)', values: bs.map((b) => liveO(fo(b.from, b.to)).filter((o) => !isNew(o)).length) },
      ] });
      return ins(items) + kpis([
        { label: t('Customers who ordered', 'অর্ডার করা কাস্টমার'), value: F.num(s.n), delta: dl(s.n, sq.n) },
        { label: t('New customers', 'নতুন কাস্টমার'), value: F.num(s.nw), delta: dl(s.nw, sq.nw) },
        { label: t('Returning customers', 'পুরনো কাস্টমার'), value: F.num(s.ret), delta: dl(s.ret, sq.ret) },
        { label: t('Repeat rate', 'আবার কেনার হার'), value: F.pct(repeat, 0), sub: t('all time', 'এখন পর্যন্ত') },
        { label: t('Average customer value', 'গড় কাস্টমার মূল্য'), value: F.tk(avgVal), sub: t('delivered, all time', 'ডেলিভারড, এখন পর্যন্ত') },
        { label: t('At risk', 'হারানোর ঝুঁকি'), value: F.num(atRisk.length), sub: t('no order in 30+ days', '30+ দিন অর্ডার নেই') },
      ]) + `<div class="grid g3">${U.card(t('New vs returning', 'নতুন বনাম পুরনো'), nr, { cls: 'span2', sub: t('Orders per day', 'দিনে কতটি অর্ডার') })}${U.card(t('Lifetime value', 'কাস্টমারের মোট মূল্য'), `<div class="rep-mini"><div><b>${F.tk(avgVal)}</b><span>${t('average per buyer', 'ক্রেতা প্রতি গড়')}</span></div><div><b>${F.pct(repeat, 0)}</b><span>${t('bought again', 'আবার কিনেছেন')}</span></div><div><b>${F.num(atRisk.length)}</b><span>${t('at risk', 'ঝুঁকিতে')}</span></div></div><button class="btn sm" id="cu-winback" style="margin-top:12px">${A.icon('send')} ${t(`Send win-back message to ${atRisk.length}`, `${atRisk.length} জনকে ফিরে আসার মেসেজ`)}</button>`, { sub: t('Delivered value, all time', 'ডেলিভারড মূল্য, এখন পর্যন্ত') })}</div>` + customerExtra(k, custs) +
      `<div class="grid g2">${U.card(t('Top customers', 'সেরা কাস্টমার'), stbl('cu-top', [
        { h: t('Customer', 'কাস্টমার'), v: (x) => x.c.name, f: (x) => `<b>${A.esc(x.c.name)}</b> ${x.isNew ? U.badge(t('New', 'নতুন'), 'accent') : ''}<div class="small muted">${A.esc(x.c.area)}, ${A.esc(x.c.district)}</div>` },
        { h: t('Orders', 'অর্ডার'), r: 1, v: (x) => x.n, f: (x) => F.num(x.n) },
        { h: t('Spent', 'খরচ করেছেন'), r: 1, v: (x) => x.v, f: (x) => F.tk(x.v) },
        { h: t('All time', 'এখন পর্যন্ত'), r: 1, hide: 1, v: (x) => x.c.spent, f: (x) => F.tk(x.c.spent) },
      ], per, { sort: [2, 'desc'], limit: 8, onRow: (x) => goCustomer(x.c.id) }), { sub: t('Click to open the customer', 'কাস্টমার খুলতে চাপুন') })}${U.card(t('By district', 'জেলা অনুযায়ী'), stbl('cu-dist', [
        { h: t('District', 'জেলা'), v: (x) => x.d, f: (x) => `<b>${A.esc(x.d)}</b>` },
        { h: t('Customers', 'কাস্টমার'), r: 1, v: (x) => x.n, f: (x) => F.num(x.n) },
        { h: t('Orders', 'অর্ডার'), r: 1, hide: 1, v: (x) => x.o, f: (x) => F.num(x.o) },
        { h: t('Order value', 'অর্ডারের মূল্য'), r: 1, v: (x) => x.v, f: (x) => F.tk(x.v) },
      ], dist, { sort: [3, 'desc'], limit: 8, onRow: (x) => ordersDrawer(x.d, x.os) }))}</div>` +
      U.card(t('At-risk customers', 'হারানোর ঝুঁকিতে থাকা কাস্টমার'), stbl('cu-risk', [
        { h: t('Customer', 'কাস্টমার'), v: (x) => x.name, f: (x) => `<b>${A.esc(x.name)}</b><div class="small muted">${A.esc(x.phone)}</div>` },
        { h: t('District', 'জেলা'), hide: 1, v: (x) => x.district, f: (x) => A.esc(x.district) },
        { h: t('Orders', 'অর্ডার'), r: 1, v: (x) => x.orders, f: (x) => F.num(x.orders) },
        { h: t('Spent', 'খরচ করেছেন'), r: 1, v: (x) => x.spent, f: (x) => F.tk(x.spent) },
        { h: t('Last order', 'শেষ অর্ডার'), r: 1, v: (x) => -new Date(x.lastOrder).getTime(), f: (x) => F.ago(x.lastOrder) },
      ], atRisk.map((c) => ({ ...c, _id: c.id })), { sort: [3, 'desc'], limit: 8, onRow: (x) => goCustomer(x.id), empty: t('Nobody at risk right now', 'এখন কেউ ঝুঁকিতে নেই') }), { sub: t('Bought before, nothing in the last 30 days. Highest spenders first.', 'আগে কিনেছেন, গত 30 দিনে কিছু না। বেশি খরচ করা আগে।') });
    } });
    const b = el.querySelector('#cu-winback');
    if (b) b.onclick = () => U.confirm(t('Send win-back message?', 'ফিরে আসার মেসেজ পাঠাবেন?'), t('Each at-risk customer gets an SMS: "We miss you! Here is ৳100 off your next order." The coupon and text come from Marketing › Message campaigns.', 'ঝুঁকিতে থাকা প্রতিটা কাস্টমার SMS পাবেন: "আপনাকে মিস করছি! পরের অর্ডারে ৳100 ছাড়।" কুপন ও লেখা আসে মার্কেটিং › মেসেজ ক্যাম্পেইন থেকে।'), t('Send', 'পাঠান'), () => { A.commit('Win-back SMS sent to at-risk customers from Reports'); A.toast(t('Win-back message queued', 'মেসেজ পাঠানোর জন্য তৈরি'), 'good'); });
  }

  /* ================= DELIVERY ================= */
  function rDelivery(el, r0) {
    frame(el, r0, 'delivery', { title: t('Delivery & returns report', 'ডেলিভারি ও রিটার্ন রিপোর্ট'), sub: t('Which courier and which area deliver best, and what returns cost', 'কোন কুরিয়ার ও এলাকায় ডেলিভারি ভালো, আর রিটার্নে কত খরচ'), filters: ['courier', 'zone'], body: () => {
      const r = rng(); const k = kp(r.from, r.to), q = kp(r.prevFrom, r.prevTo);
      const sent = k.os.filter((o) => o.courier); const fin = sent.filter((o) => C.isDelivered(o) || o.status === 'returned');
      const days = (o) => (new Date(o.deliveredAt) - new Date(o.created)) / DAY;
      const avgDays = (os) => { const d = os.filter((o) => o.deliveredAt); return d.length ? A.sum(d, days) / d.length : 0; };
      const qd = delO(q.os);
      const retCost = A.sum(k.ret, C.returnCost), retCostQ = A.sum(q.ret, C.returnCost);
      const withC = sent.filter((o) => o.status === 'shipped');
      const cod = C.codWithCouriers().filter((o) => (!on('area') || areaOk(o)));
      const age = (o) => (A.TODAY - new Date(o.deliveredAt)) / DAY;
      const ageB = [[t('0–3 days', '0–3 দিন'), cod.filter((o) => age(o) <= 3), 'var(--good)'], [t('4–7 days', '4–7 দিন'), cod.filter((o) => age(o) > 3 && age(o) <= 7), 'var(--warn)'], [t('8+ days', '8+ দিন'), cod.filter((o) => age(o) > 7), 'var(--bad)']];
      const byC = A.D.couriers.map((c) => { const os = fin.filter((o) => o.courier === c.id); const d = delO(os); return { c, os, n: os.length, s: pc(d.length, os.length), days: avgDays(d), rc: A.sum(retO(os), C.returnCost) }; }).filter((x) => x.n);
      const zones = Object.keys(ZN).map((z) => { const d = k.del.filter((o) => o.zone === z); return { z, days: avgDays(d), n: d.length }; }).filter((x) => x.n);
      const reasons = Object.entries(A.groupBy(k.ret, (o) => o.returnReason || '—')).sort((a, b) => b[1].length - a[1].length);
      const RB = { 'Customer refused at door': 'দরজায় নিতে রাজি হননি', 'Customer not reachable': 'কাস্টমারকে পাওয়া যায়নি', 'Wrong size, refused': 'সাইজ ভুল, নেননি', 'Changed mind': 'মত বদলেছেন', 'Address not found': 'ঠিকানা পাওয়া যায়নি' };
      const areaRet = finishedBy(fin, (o) => o.district, 3).slice(0, 8);
      const grid = []; for (const c of A.D.couriers) for (const z of Object.keys(ZN)) { const os = fin.filter((o) => o.courier === c.id && o.zone === z); if (!os.length) continue; const d = delO(os); grid.push({ c, z, os, n: os.length, d: d.length, rt: os.length - d.length, s: pc(d.length, os.length), days: avgDays(d), rc: A.sum(retO(os), C.returnCost) }); }
      const bestC = byC.slice().sort((a, b) => b.s - a.s); const worstA = areaRet[0];
      const items = [
        I2(t(`${F.pct(k.success)} of finished parcels were delivered (${sg(chg(k.success, q.success))} vs ${prevName(r)}).`, `শেষ হওয়া পার্সেলের ${F.pct(k.success)} ডেলিভারি হয়েছে (${prevName(r)} তুলনায় ${sg(chg(k.success, q.success))})।`), k.success >= q.success ? 'good' : 'bad'),
        bestC.length > 1 ? I2(t(`${bestC[0].c.name} delivers best (${F.pct(bestC[0].s)}); ${bestC[bestC.length - 1].c.name} is lowest (${F.pct(bestC[bestC.length - 1].s)}).`, `${bestC[0].c.name} সবচেয়ে ভালো ডেলিভারি দিচ্ছে (${F.pct(bestC[0].s)}); সবচেয়ে কম ${bestC[bestC.length - 1].c.name} (${F.pct(bestC[bestC.length - 1].s)})।`)) : null,
        worstA ? I2(t(`Most returns: ${worstA.k} (${F.pct(worstA.rate, 0)} of ${worstA.n} parcels). Ask for delivery charge first there.`, `সবচেয়ে বেশি রিটার্ন: ${worstA.k} (${worstA.n}টি পার্সেলের ${F.pct(worstA.rate, 0)})। সেখানে আগে ডেলিভারি চার্জ নিন।`), worstA.rate > 12 ? 'bad' : '') : null,
        reasons[0] ? I2(t(`Top return reason: "${reasons[0][0]}" (${reasons[0][1].length}). Returns cost ${F.tk(retCost)} in this period.`, `রিটার্নের প্রধান কারণ: "${RB[reasons[0][0]] || reasons[0][0]}" (${reasons[0][1].length}টি)। এই সময়ে রিটার্নে খরচ ${F.tk(retCost)}।`)) : null,
      ];
      return ins(items) + kpis([
        { label: t('Delivery success', 'ডেলিভারি সফল'), value: F.pct(k.success), delta: dl(k.success, q.success) },
        { label: t('Average days to deliver', 'ডেলিভারিতে গড় দিন'), value: avgDays(k.del).toFixed(1) + t(' d', ' দিন'), delta: dl(avgDays(k.del), avgDays(qd), true) },
        { label: t('Returned parcels', 'ফেরত পার্সেল'), value: F.num(k.ret.length), delta: dl(k.ret.length, q.ret.length, true) },
        { label: t('Cost of returns', 'রিটার্নের খরচ'), value: F.tk(retCost), delta: dl(retCost, retCostQ, true), sub: t('courier both ways + packing', 'দুই দিকের কুরিয়ার + প্যাকিং') },
        { label: t('COD with couriers', 'কুরিয়ারের কাছে COD'), value: F.tk(A.sum(cod, (o) => o.total)), sub: `${cod.length} ${t('parcels, not paid yet', 'পার্সেল, টাকা আসেনি')}` },
        { label: t('Still on the way', 'এখনো পথে'), value: F.num(withC.length), sub: t('with courier now', 'এখন কুরিয়ারে') },
      ]) + `<div class="grid g3">${U.card(t('Success by courier', 'কুরিয়ার অনুযায়ী সফলতা'), A.chart.bars({ items: byC.map((x, i) => ({ label: `${x.c.name} · ${x.n} ${t('parcels', 'পার্সেল')}`, value: x.s, text: F.pct(x.s), color: COLS[i] })), max: 100 }) + `<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px">${byC.map((x) => `<a class="btn sm ghost" href="${c360(x.c.id)}">${t('Open Courier 360', 'কুরিয়ার 360 খুলুন')} · ${x.c.name}</a>`).join('')}</div>`)}${U.card(t('Average days by zone', 'জোন অনুযায়ী গড় দিন'), A.chart.bars({ items: zones.map((x, i) => ({ label: `${zName(x.z)} · ${t('promise', 'কথা')} ${A.D.rules.delivery[x.z].days}`, value: x.days, text: x.days.toFixed(1) + t(' days', ' দিন'), color: COLS[i + 1] })), max: 5 }))}${U.card(t('COD money with couriers', 'কুরিয়ারের কাছে COD টাকা'), A.chart.bars({ items: ageB.map((b) => ({ label: `${b[0]} · ${b[1].length} ${t('parcels', 'পার্সেল')}`, value: A.sum(b[1], (o) => o.total), color: b[2] })) }) + `<a class="btn sm" style="margin-top:10px" href="${A.href('finance', 'overview')}">${t('Open Finance', 'হিসাবে যান')}</a>`, { sub: t('Days since delivery', 'ডেলিভারির পর কতদিন') })}</div>` +
      `<div class="grid g2">${U.card(t('Refused parcels by area', 'এলাকা অনুযায়ী ফেরত'), A.chart.bars({ items: areaRet.map((x) => ({ label: `${A.esc(x.k)} · ${x.n} ${t('parcels', 'পার্সেল')}`, value: x.rate, text: F.pct(x.rate, 0), color: x.rate > 12 ? 'var(--bad)' : 'var(--c4)' })), max: Math.max(20, ...areaRet.map((x) => x.rate)) }), { sub: t('Districts with 3+ finished parcels', 'অন্তত 3টি পার্সেল শেষ হয়েছে এমন জেলা') })}${U.card(t('Why parcels came back', 'পার্সেল কেন ফেরত এলো'), A.chart.bars({ items: reasons.map(([k2, os], i) => ({ label: t(k2, RB[k2] || k2), value: os.length, text: `${os.length} · ${F.tk(A.sum(os, C.returnCost))}`, color: COLS[i] })), money: false }) || U.empty(t('No returns', 'কোনো রিটার্ন নেই')))}</div>` +
      deliveryExtra(k) +
      U.card(t('Courier and zone', 'কুরিয়ার ও জোন'), stbl('dl-grid', [
        { h: t('Courier', 'কুরিয়ার'), v: (x) => x.c.name, f: (x) => `<b>${x.c.name}</b><div class="small muted">${zName(x.z)}</div>` },
        { h: t('Parcels', 'পার্সেল'), r: 1, v: (x) => x.n, f: (x) => F.num(x.n) },
        { h: t('Delivered', 'ডেলিভারড'), r: 1, hide: 1, v: (x) => x.d, f: (x) => F.num(x.d) },
        { h: t('Returned', 'ফেরত'), r: 1, hide: 1, v: (x) => x.rt, f: (x) => F.num(x.rt) },
        { h: t('Success', 'সফল'), r: 1, v: (x) => x.s, f: (x) => U.badge(F.pct(x.s, 0), x.s >= 90 ? 'good' : x.s >= 85 ? 'warn' : 'bad') },
        { h: t('Avg days', 'গড় দিন'), r: 1, v: (x) => x.days, f: (x) => x.days.toFixed(1) },
        { h: t('Return cost', 'রিটার্ন খরচ'), r: 1, hide: 1, v: (x) => x.rc, f: (x) => F.tk(x.rc) },
      ], grid, { sort: [1, 'desc'], onRow: (x) => ordersDrawer(`${x.c.name} · ${zName(x.z)}`, x.os) }), { sub: t('Parcels that were delivered or came back. Click to see them.', 'যে পার্সেল ডেলিভারি হয়েছে বা ফেরত এসেছে। দেখতে চাপুন।') });
    } });
  }

  /* ================= MARKETING ================= */
  const SRC = { 'Facebook ads': 'Facebook', Google: 'Google', TikTok: 'TikTok' };
  const W = { AD1: 1, AD2: 1.25, AD3: 1.6, AD4: 1.9, AD5: 0.45, AD6: 1 };
  function rMarketing(el, r0) {
    frame(el, r0, 'marketing', { title: t('Marketing & ads report', 'মার্কেটিং ও বিজ্ঞাপন রিপোর্ট'), sub: t('What the ads bring back, campaign by campaign', 'বিজ্ঞাপন কত ফেরত আনছে, ক্যাম্পেইন ধরে'), filters: ['adch'], body: () => {
      const r = rng(); const k = kp(r.from, r.to), q = kp(r.prevFrom, r.prevTo);
      const adOk = (ch) => S.f.adch === 'all' || S.f.adch === ch;
      /* Website orders count fully for their ad source; Facebook page, Instagram and WhatsApp orders count 60% for Facebook (click-to-message ads). */
      const att = (os) => { const m = { Facebook: [], Google: [], TikTok: [] }; for (const o of os) { if (o.channel === 'Website' && SRC[o.source]) m[SRC[o.source]].push({ o, w: 1 }); else if (['Facebook', 'Instagram', 'WhatsApp'].includes(o.channel)) m.Facebook.push({ o, w: 0.6 }); } return m; };
      const wsum = (arr, f) => A.sum(arr, (x) => x.w * f(x.o));
      const at = att(k.os), aq = att(q.os);
      const dSales = (arr) => wsum(arr, (o) => (C.isDelivered(o) ? o.subtotal - o.discount + o.delivery : 0));
      const nLive = (arr) => wsum(arr, (o) => (o.status !== 'cancelled' ? 1 : 0)); const nDel = (arr) => wsum(arr, (o) => (C.isDelivered(o) ? 1 : 0));
      const chs = ['Facebook', 'Google', 'TikTok'].filter(adOk);
      const chRows = chs.map((c) => ({ c, spend: C.adSpendIn(r.from, r.to, c), pspend: C.adSpendIn(r.prevFrom, r.prevTo, c), sales: dSales(at[c]), psales: dSales(aq[c]), orders: nLive(at[c]), del: nDel(at[c]) }));
      const spend = A.sum(chRows, (x) => x.spend), pspend = A.sum(chRows, (x) => x.pspend), sales = A.sum(chRows, (x) => x.sales), psales = A.sum(chRows, (x) => x.psales), del = A.sum(chRows, (x) => x.del);
      const pdel = A.sum(chs, (c) => nDel(aq[c]));
      // campaigns
      const inR = (a, from, to) => { const x = new Date(a.date + 'T12:00:00+06:00').getTime(); return x >= from && x < to; };
      const camp = A.D.campaigns.filter((c) => adOk(c.ch)).map((c) => { const rows = A.D.adSpend.filter((a) => a.cid === c.id && inR(a, r.from, r.to)); return { c, spend: A.sum(rows, (a) => a.spend), clicks: A.sum(rows, (a) => a.clicks), imp: A.sum(rows, (a) => a.impressions), w: A.sum(rows, (a) => a.clicks) * W[c.id] }; });
      for (const x of camp) { const sib = camp.filter((y) => y.c.ch === x.c.ch); const tw = A.sum(sib, (y) => y.w) || 1; const cr = chRows.find((y) => y.c === x.c.ch); x.sales = cr ? Math.round(cr.sales * x.w / tw) : 0; x.del = cr ? Math.round(cr.del * x.w / tw) : 0; x.roas = x.spend ? x.sales / x.spend : 0; x.cpo = x.del ? x.spend / x.del : 0;
        const rec = x.roas >= 4 ? ['scale', 'good'] : x.roas >= 2.5 ? ['keep', 'info'] : x.roas >= 1.5 ? ['fix', 'warn'] : ['stop', 'bad']; x.rec = rec;
        x.why = { scale: t(`Each ৳1 brings ৳${x.roas.toFixed(1)}. Raise the budget step by step (about 20% a week).`, `প্রতি ৳1-এ আসে ৳${x.roas.toFixed(1)}। বাজেট ধাপে ধাপে বাড়ান (সপ্তাহে প্রায় 20%)।`), keep: t(`Pays back (৳${x.roas.toFixed(1)} per ৳1). Keep it running and test one new photo.`, `খরচ উঠে আসছে (৳1-এ ৳${x.roas.toFixed(1)})। চালু রাখুন, একটা নতুন ছবি টেস্ট করুন।`), fix: t(`Weak (৳${x.roas.toFixed(1)} per ৳1). Change the audience or the creative before spending more.`, `দুর্বল (৳1-এ ৳${x.roas.toFixed(1)})। আরও খরচের আগে অডিয়েন্স বা ছবি/ভিডিও বদলান।`), stop: t(`Loses money (৳${x.roas.toFixed(1)} per ৳1). Pause it and move the budget to a better campaign.`, `টাকা নষ্ট হচ্ছে (৳1-এ ৳${x.roas.toFixed(1)})। বন্ধ করে বাজেট ভালো ক্যাম্পেইনে দিন।`) }[rec[0]]; }
      const RECN = { scale: t('Scale', 'বাড়ান'), keep: t('Keep', 'চালু রাখুন'), fix: t('Fix', 'ঠিক করুন'), stop: t('Stop', 'বন্ধ করুন') };
      // coupons
      const cg = A.groupBy(k.live.filter((o) => o.coupon), (o) => o.coupon);
      const cRows = A.D.coupons.map((c) => { const os = cg[c.code] || []; return { c, os, n: os.length, off: A.sum(os, (o) => o.discount), v: A.sum(os, (o) => o.total) }; });
      const paidN = Math.round(A.sum(['Facebook', 'Google', 'TikTok'], (c) => nLive(at[c]))); const orgN = k.live.length - paidN;
      const best = camp.slice().sort((a, b) => b.roas - a.roas); const worst = best[best.length - 1];
      const items = [
        I2(t(`Ads cost ${F.tk(spend)} and brought ${F.tk(sales)} in delivered sales (ROAS ${pc(sales, spend) / 100 > 0 ? (sales / spend).toFixed(1) : '0'}×, was ${pspend ? (psales / pspend).toFixed(1) : '0'}×).`, `বিজ্ঞাপনে খরচ ${F.tk(spend)}, ডেলিভারড বিক্রি এসেছে ${F.tk(sales)} (ROAS ${spend ? (sales / spend).toFixed(1) : '0'}×, আগে ছিল ${pspend ? (psales / pspend).toFixed(1) : '0'}×)।`), sales / (spend || 1) >= psales / (pspend || 1) ? 'good' : 'bad'),
        best[0] ? I2(t(`Best campaign: "${best[0].c.name}" (${best[0].roas.toFixed(1)}×). Worth more budget.`, `সেরা ক্যাম্পেইন: "${best[0].c.name}" (${best[0].roas.toFixed(1)}×)। বাজেট বাড়ানো যায়।`), 'good') : null,
        worst && worst.roas < 2.5 ? I2(t(`"${worst.c.name}" returns only ${worst.roas.toFixed(1)}×: ${F.tk(worst.spend)} spent. Stop or fix it.`, `"${worst.c.name}" দিচ্ছে মাত্র ${worst.roas.toFixed(1)}×: খরচ ${F.tk(worst.spend)}। বন্ধ করুন বা ঠিক করুন।`), 'bad') : null,
        I2(t(`${F.pct(pc(orgN, k.live.length), 0)} of orders came without paid ads (page, search, phone, direct).`, `${F.pct(pc(orgN, k.live.length), 0)} অর্ডার এসেছে বিজ্ঞাপন ছাড়া (পেজ, সার্চ, ফোন, সরাসরি)।`)),
      ];
      const spendLine = trend(r, [{ name: t('Ad spend', 'বিজ্ঞাপন খরচ'), color: 'var(--c1)', prev: true, fn: (a, b) => A.sum(chs, (c) => C.adSpendIn(a, b, c)) }, { name: t('Ad sales', 'বিজ্ঞাপনের বিক্রি'), color: 'var(--c3)', fn: (a, b) => { const m = att(fo(a, b)); return A.sum(chs, (c) => dSales(m[c])); } }]);
      return ins(items) + kpis([
        { label: t('Ad spend', 'বিজ্ঞাপন খরচ'), value: F.tk(spend), delta: dl(spend, pspend, true) },
        { label: t('Sales from ads', 'বিজ্ঞাপন থেকে বিক্রি'), value: F.tk(sales), delta: dl(sales, psales), sub: t('delivered', 'ডেলিভারড') },
        { label: t('Ad ROAS', 'বিজ্ঞাপনের ROAS'), value: (spend ? sales / spend : 0).toFixed(1) + '×', delta: dl(spend ? sales / spend : 0, pspend ? psales / pspend : 0) },
        { label: t('Cost per delivered order', 'প্রতি ডেলিভারড অর্ডারে খরচ'), value: F.tk(del ? spend / del : 0), delta: dl(del ? spend / del : 0, pdel ? pspend / pdel : 0, true) },
        { label: t('Paid share of orders', 'বিজ্ঞাপনের অর্ডারের ভাগ'), value: F.pct(pc(paidN, k.live.length), 0), sub: `${paidN} ${t('orders', 'অর্ডার')}` },
        { label: t('Coupon discount cost', 'কুপনের ছাড়ের খরচ'), value: F.tk(A.sum(cRows, (x) => x.off)), sub: `${A.sum(cRows, (x) => x.n)} ${t('uses', 'বার ব্যবহার')}` },
      ]) + `<div class="grid g3">${U.card(t('Spend vs sales from ads', 'খরচ বনাম বিজ্ঞাপনের বিক্রি'), spendLine, { cls: 'span2', sub: t('Website orders from Facebook ads, Google and TikTok', 'ফেসবুক বিজ্ঞাপন, গুগল ও টিকটক থেকে আসা ওয়েবসাইট অর্ডার') })}${U.card(t('Paid vs free orders', 'বিজ্ঞাপনের বনাম ফ্রি অর্ডার'), A.chart.donut({ parts: [{ label: t('From ads', 'বিজ্ঞাপন থেকে'), value: paidN, color: 'var(--c1)' }, { label: t('Without ads', 'বিজ্ঞাপন ছাড়া'), value: orgN, color: 'var(--c3)' }], center: F.pct(pc(paidN, k.live.length), 0) }) + `<div style="margin-top:14px">${A.chart.columns({ labels: chRows.map((x) => x.c), values: chRows.map((x) => x.spend), values2: chRows.map((x) => x.sales), height: 150, color: 'var(--c1)', color2: 'var(--c3)' })}<div class="legend"><span><i class="dotk" style="background:var(--c1)"></i>${t('Spend', 'খরচ')}</span><span><i class="dotk" style="background:var(--c3)"></i>${t('Sales', 'বিক্রি')}</span></div></div>`)}</div>` +
      U.card(t('Campaigns: what to do next', 'ক্যাম্পেইন: এরপর কী করবেন'), stbl('mk-camp', [
        { h: t('Campaign', 'ক্যাম্পেইন'), v: (x) => x.c.name, f: (x) => `<b>${A.esc(x.c.name)}</b><div class="small muted">${x.c.ch} · ${F.num(x.clicks)} ${t('clicks', 'ক্লিক')}</div>` },
        { h: t('Spend', 'খরচ'), r: 1, hide: 1, v: (x) => x.spend, f: (x) => F.tk(x.spend) },
        { h: t('Sales', 'বিক্রি'), r: 1, hide: 1, v: (x) => x.sales, f: (x) => F.tk(x.sales) },
        { h: 'ROAS', r: 1, v: (x) => x.roas, f: (x) => `<b>${x.roas.toFixed(1)}×</b>` },
        { h: t('Cost / order', 'খরচ / অর্ডার'), r: 1, hide: 1, v: (x) => x.cpo, f: (x) => (x.cpo ? F.tk(x.cpo) : '—') },
        { h: t('Do this', 'এটা করুন'), v: (x) => ['stop', 'fix', 'keep', 'scale'].indexOf(x.rec[0]), f: (x) => `${U.badge(RECN[x.rec[0]], x.rec[1])}<div class="small muted hide-sm" style="max-width:300px;white-space:normal;margin-top:3px">${x.why}</div>` },
      ], camp, { sort: [3, 'desc'], onRow: (x) => campDrawer(x, RECN) }), { sub: t('Sales: website orders by ad source, plus 60% of Facebook page, Instagram and WhatsApp orders for Facebook; shared by clicks. Budget changes are made in Marketing with your OK.', 'বিক্রি = বিজ্ঞাপন থেকে আসা ওয়েবসাইট অর্ডার, সাথে ফেসবুকের জন্য পেজ, ইনস্টাগ্রাম ও হোয়াটসঅ্যাপ অর্ডারের 60%; ক্লিক অনুযায়ী ভাগ। বাজেট বদলানো হয় মার্কেটিং পেজে, আপনার অনুমতিতে।') }) +
      U.card(t('Coupons', 'কুপন'), stbl('mk-cp', [
        { h: t('Code', 'কোড'), v: (x) => x.c.code, f: (x) => `<b class="mono">${x.c.code}</b> ${x.c.on ? U.badge(t('On', 'চালু'), 'good') : U.badge(t('Off', 'বন্ধ'))}` },
        { h: t('Uses', 'ব্যবহার'), r: 1, v: (x) => x.n, f: (x) => F.num(x.n) },
        { h: t('Discount given', 'ছাড় দেওয়া'), r: 1, v: (x) => x.off, f: (x) => F.tk(x.off) },
        { h: t('Order value', 'অর্ডারের মূল্য'), r: 1, hide: 1, v: (x) => x.v, f: (x) => F.tk(x.v) },
        { h: t('Cost %', 'খরচ %'), r: 1, hide: 1, v: (x) => pc(x.off, x.v), f: (x) => (x.v ? F.pct(pc(x.off, x.v)) : '—') },
      ], cRows, { sort: [1, 'desc'], onRow: (x) => (x.n ? ordersDrawer(t('Coupon ', 'কুপন ') + x.c.code, x.os) : A.go('rules', 'discounts')) }));
    } });
  }
  function campDrawer(x, RECN) {
    const days = A.D.adSpend.filter((a) => a.cid === x.c.id).slice(-14);
    U.drawer(A.esc(x.c.name), `<div class="stack">${U.callout(`<b>${RECN[x.rec[0]]}</b> · ${x.why}`, x.rec[1] === 'bad' ? 'bad' : x.rec[1] === 'warn' ? 'warn' : 'good', 'info')}
      <div class="rep-mini"><div><b>${F.tk(x.spend)}</b><span>${t('spent', 'খরচ')}</span></div><div><b>${F.tk(x.sales)}</b><span>${t('sales', 'বিক্রি')}</span></div><div><b>${x.roas.toFixed(1)}×</b><span>ROAS</span></div><div><b>${F.num(x.imp)}</b><span>${t('people reached', 'মানুষ দেখেছেন')}</span></div><div><b>${F.pct(pc(x.clicks, x.imp), 2)}</b><span>${t('click rate', 'ক্লিকের হার')}</span></div><div><b>${F.tk(x.c.daily)}</b><span>${t('daily budget', 'দৈনিক বাজেট')}</span></div></div>
      <div class="card flat"><div class="small muted" style="margin-bottom:6px">${t('Spend, last 14 days', 'খরচ, গত 14 দিন')}</div>${A.chart.columns({ labels: days.map((d) => F.date(d.date).split(' ')[0]), values: days.map((d) => d.spend), height: 140 })}</div></div>`,
    { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button><a class="btn primary" href="${A.href('marketing', 'campaigns')}" data-close>${t('Open in Marketing', 'মার্কেটিংয়ে খুলুন')}</a>` });
  }

  /* ================= AREAS ================= */
  /* Division → district → thana → area. Orders carry district + area; division and thana come from these small lookups,
     and the last level (a neighbourhood inside the thana) from the customer's saved address. */
  const DIV = { Dhaka: 'Dhaka', Gazipur: 'Dhaka', Narayanganj: 'Dhaka', Chattogram: 'Chattogram', "Cox's Bazar": 'Chattogram', Cumilla: 'Chattogram', Feni: 'Chattogram', Noakhali: 'Chattogram', Sylhet: 'Sylhet', Rajshahi: 'Rajshahi', Bogura: 'Rajshahi', Khulna: 'Khulna', Jessore: 'Khulna', Mymensingh: 'Mymensingh', Rangpur: 'Rangpur', Barishal: 'Barishal' };
  const DIVBN = { Dhaka: 'ঢাকা', Chattogram: 'চট্টগ্রাম', Sylhet: 'সিলেট', Rajshahi: 'রাজশাহী', Khulna: 'খুলনা', Mymensingh: 'ময়মনসিংহ', Rangpur: 'রংপুর', Barishal: 'বরিশাল' };
  const THANA = { Mirpur: 'Mirpur', Uttara: 'Uttara', Dhanmondi: 'Dhanmondi', Mohammadpur: 'Mohammadpur', Gulshan: 'Gulshan', Banani: 'Banani', Badda: 'Badda', Bashundhara: 'Vatara', Motijheel: 'Motijheel', 'Old Dhaka': 'Kotwali', Jatrabari: 'Jatrabari', Khilgaon: 'Khilgaon', Rampura: 'Rampura', Tejgaon: 'Tejgaon', Farmgate: 'Tejgaon', Malibagh: 'Shahjahanpur', Tongi: 'Tongi', 'Board Bazar': 'Gazipur Sadar', Fatullah: 'Fatullah', Savar: 'Savar', Keraniganj: 'Keraniganj', Siddhirganj: 'Siddhirganj', Agrabad: 'Double Mooring', Halishahar: 'Halishahar', Zindabazar: 'Kotwali', 'Shaheb Bazar': 'Boalia', Sonadanga: 'Sonadanga', Kandirpar: 'Cumilla Sadar', Ganginarpar: 'Mymensingh Sadar', Satmatha: 'Bogura Sadar', 'Jahaj Company': 'Kotwali', Nathullabad: 'Kotwali', Kolatoli: "Cox's Bazar Sadar", Doratana: 'Jessore Sadar', 'Trunk Road': 'Feni Sadar', Maijdee: 'Sudharam' };
  const SUBA = { Mirpur: ['Mirpur 1', 'Mirpur 2', 'Mirpur 10', 'Mirpur 11', 'Pallabi'], Uttara: ['Sector 4', 'Sector 7', 'Sector 10', 'Sector 13'], Dhanmondi: ['Road 2', 'Road 8', 'Road 27', 'Jigatola'], Mohammadpur: ['Tajmahal Road', 'Shyamoli', 'Adabor'], Gulshan: ['Gulshan 1', 'Gulshan 2'], Banani: ['Banani', 'Kakoli'], Farmgate: ['Farmgate', 'Indira Road'], Tejgaon: ['Tejgaon', 'Kawran Bazar'], Agrabad: ['Agrabad C/A', 'Chowmuhani'], Bashundhara: ['Block C', 'Block D', 'Block F'] };
  const hsh = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const LV = [
    { k: 'div', en: 'Division', bn: 'বিভাগ', f: (o) => DIV[o.district] || 'Dhaka' },
    { k: 'dist', en: 'District', bn: 'জেলা', f: (o) => o.district },
    { k: 'thana', en: 'Thana', bn: 'থানা', f: (o) => THANA[o.area] || o.area },
    { k: 'area', en: 'Area', bn: 'এলাকা', f: (o) => { const l = SUBA[o.area]; return l ? l[hsh(o.customerId) % l.length] : o.area; } },
  ];
  const placeName = (lvl, k) => (lvl === 0 ? t(k, DIVBN[k] || k) : k);
  if (!S.ar) S.ar = { path: [], view: 'map', m: 'v', pick: 'cat:' + ((A.CATS[0] || {}).id || '') };
  const areaStats = (os, key) => {
    const g = A.groupBy(os, key);
    return Object.entries(g).map(([k, list]) => {
      const lv = liveO(list), d = delO(list), rt = retO(list);
      const v = A.sum(lv, (o) => o.total);
      return { k, os: list, n: lv.length, pcs: A.sum(lv, C.pieces), mrp: A.sum(lv, (o) => A.sum(o.lines, (l) => l.qty * l.price)), v, d: d.length, rt: rt.length, rr: pc(rt.length, d.length + rt.length), col: A.sum(d.filter((o) => o.settled || o.paid), (o) => o.total), pr: A.sum(list, C.orderProfit), aov: lv.length ? v / lv.length : 0 };
    });
  };
  const AM = { v: ['Order value', 'অর্ডারের মূল্য', (x) => x.v, 1], n: ['Orders', 'অর্ডার', (x) => x.n, 0], pr: ['Profit', 'লাভ', (x) => x.pr, 1], rr: ['Return rate', 'রিটার্নের হার', (x) => x.rr, 2] };
  const mFmt = (m, val) => (AM[m][3] === 1 ? F.tkShort(val) : AM[m][3] === 2 ? F.pct(val, 0) : F.num(val));
  A.css('reports-areas', `
  .ar-crumb{display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:13px}
  .ar-crumb button{border:0;background:var(--card2);border-radius:8px;padding:4px 10px;cursor:pointer;font-weight:600;color:var(--ink2)}
  .ar-crumb button.on{background:var(--ink);color:var(--card)}
  .ar-crumb .sep{color:var(--muted)}
  .ar-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
  .ar-tile{position:relative;text-align:left;border:1px solid var(--line);border-radius:12px;padding:10px 12px 11px;cursor:pointer;min-height:86px;display:flex;flex-direction:column;gap:2px;color:var(--ink);background:color-mix(in srgb,var(--tone) calc(var(--h) * 1%),var(--card));transition:transform .12s,border-color .12s}
  .ar-tile:hover{transform:translateY(-1px);border-color:var(--line2)}
  .ar-tile b{font-weight:650;font-size:13px;line-height:1.25}
  .ar-tile .v{font:650 18px var(--f-num);letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:auto}
  .ar-tile .s{font-size:11.5px;color:var(--ink2);opacity:.85}
  .ar-tile.hot b,.ar-tile.hot .v,.ar-tile.hot .s{color:#fff}
  .ar-tile .rk{position:absolute;top:8px;right:9px;font-size:11px;font-weight:700;opacity:.6}
  .ar-scale{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--muted);margin-top:10px}
  .ar-scale i{height:8px;flex:0 0 120px;border-radius:6px;background:linear-gradient(90deg,color-mix(in srgb,var(--tone) 8%,var(--card)),var(--tone))}
  .ar-top .li{gap:10px}
  .ar-top .li .n{font:650 14px var(--f-num);font-variant-numeric:tabular-nums;white-space:nowrap}
  `);
  function rAreas(el, r0) {
    frame(el, r0, 'areas', { title: t('Area report', 'এলাকা রিপোর্ট'), sub: t('Where orders come from, down to the neighbourhood, and which places pay off', 'অর্ডার কোথা থেকে আসে, পাড়া পর্যন্ত, আর কোন এলাকা লাভজনক'), filters: ['ch', 'cat'], body: () => {
      const r = rng(); const A0 = S.ar; const path = A0.path; const lvl = path.length;
      const inPath = (o) => path.every((p, i) => LV[i].f(o) === p);
      const cur = fo(r.from, r.to).filter(inPath), prev = fo(r.prevFrom, r.prevTo).filter(inPath);
      const leaf = lvl >= LV.length - 1; const L = LV[Math.min(lvl, LV.length - 1)];
      const kids = leaf ? areaStats(cur, (o) => LV[LV.length - 1].f(o)) : areaStats(cur, L.f);
      const kidsQ = leaf ? areaStats(prev, (o) => LV[LV.length - 1].f(o)) : areaStats(prev, L.f);
      const mf = AM[A0.m][2]; const valid = (x) => (A0.m === 'rr' ? x.d + x.rt >= 3 : true);
      kids.sort((a, b) => mf(b) - mf(a));
      const T = areaStats(cur, () => 'all')[0] || { n: 0, pcs: 0, mrp: 0, v: 0, d: 0, rt: 0, rr: 0, col: 0, pr: 0, aov: 0 };
      const Q = areaStats(prev, () => 'all')[0] || { n: 0, pcs: 0, mrp: 0, v: 0, d: 0, rt: 0, rr: 0, col: 0, pr: 0, aov: 0 };
      const here = lvl ? path.map((p, i) => placeName(i, p)).slice(-1)[0] : t('Bangladesh', 'বাংলাদেশ');
      const lvName = leaf ? t('Area', 'এলাকা') : t(L.en, L.bn);
      /* insights */
      const items = [];
      const top = kids.slice().sort((a, b) => b.v - a.v)[0];
      if (top && T.v) items.push(I2(t(`${placeName(lvl, top.k)} brings ${F.pct(pc(top.v, T.v), 0)} of ${here}'s order value: ${F.tk(top.v)} from ${top.n} orders.`, `${here}-এর অর্ডার মূল্যের ${F.pct(pc(top.v, T.v), 0)} আসে ${placeName(lvl, top.k)} থেকে: ${top.n}টি অর্ডারে ${F.tk(top.v)}।`)));
      const grow = kids.map((x) => { const p = kidsQ.find((y) => y.k === x.k); return { ...x, ch: chg(x.v, p ? p.v : 0) }; }).filter((x) => x.v > 5000 && x.ch != null).sort((a, b) => b.ch - a.ch)[0];
      if (grow && S.compare) items.push(I2(t(`Growing fastest: ${placeName(lvl, grow.k)} (${sg(grow.ch)} vs ${prevName(r)}). Worth a local ad.`, `সবচেয়ে দ্রুত বাড়ছে: ${placeName(lvl, grow.k)} (${prevName(r)} তুলনায় ${sg(grow.ch)})। ওখানে আলাদা বিজ্ঞাপন দিয়ে দেখুন।`), 'good'));
      const badR = kids.filter((x) => x.d + x.rt >= 6 && x.rr > Math.max(10, T.rr * 1.4)).sort((a, b) => b.rr - a.rr)[0];
      if (badR) items.push(I2(t(`${placeName(lvl, badR.k)} returns ${F.pct(badR.rr, 0)} of parcels (all ${here}: ${F.pct(T.rr, 0)}). Ask for the delivery charge in advance there.`, `${placeName(lvl, badR.k)}-এ ${F.pct(badR.rr, 0)} পার্সেল ফেরত আসে (পুরো ${here}: ${F.pct(T.rr, 0)})। ওখানে ডেলিভারি চার্জ আগে নিন।`), 'bad'));
      else { const aovTop = kids.filter((x) => x.n >= 5).sort((a, b) => b.aov - a.aov)[0]; if (aovTop) items.push(I2(t(`Biggest baskets: ${placeName(lvl, aovTop.k)}, ${F.tk(aovTop.aov)} per order (average ${F.tk(T.aov)}).`, `সবচেয়ে বড় অর্ডার: ${placeName(lvl, aovTop.k)}, প্রতি অর্ডারে ${F.tk(aovTop.aov)} (গড় ${F.tk(T.aov)})।`))); }
      if (!items.length) items.push(I2(t('No orders here in this period.', 'এই সময়ে এখানে কোনো অর্ডার নেই।')));
      /* breadcrumb + view controls */
      const crumb = `<div class="ar-crumb"><button data-ar-go="0" class="${lvl ? '' : 'on'}">${t('Bangladesh', 'বাংলাদেশ')}</button>${path.map((p, i) => `<span class="sep">›</span><button data-ar-go="${i + 1}" class="${i === lvl - 1 ? 'on' : ''}">${A.esc(placeName(i, p))}</button>`).join('')}</div>`;
      const ctrls = `<div class="row" style="gap:8px">${U.seg('ar-m', Object.keys(AM).map((k) => [k, t(AM[k][0], AM[k][1])]), A0.m)}${U.seg('ar-view', [['map', t('Map', 'ম্যাপ')], ['bars', t('Bars', 'বার')]], A0.view)}</div>`;
      const shown = kids.filter(valid); const mx = Math.max(1e-9, ...shown.map(mf)); const tone = A0.m === 'rr' ? 'var(--bad)' : A0.m === 'pr' ? 'var(--good)' : 'var(--c2)';
      const tiles = shown.length ? `<div class="ar-tiles" style="--tone:${tone}">${shown.map((x, i) => { const h = Math.round(8 + 80 * mf(x) / mx); return `<button class="ar-tile ${h > 55 ? 'hot' : ''}" style="--h:${h}" data-ar-in="${A.esc(x.k)}"><span class="rk">#${i + 1}</span><b>${A.esc(placeName(lvl, x.k))}</b><span class="v">${mFmt(A0.m, mf(x))}</span><span class="s">${F.num(x.n)} ${t('orders', 'অর্ডার')} · ${F.pct(x.rr, 0)} ${t('returned', 'ফেরত')}</span></button>`; }).join('')}</div><div class="ar-scale" style="--tone:${tone}">${t('Low', 'কম')}<i></i>${t('High', 'বেশি')} · ${t(AM[A0.m][0], AM[A0.m][1])}${leaf ? '' : ' · ' + t('click a box to go deeper', 'আরও ভেতরে যেতে বক্সে চাপুন')}</div>` : U.empty(t('No orders here in this period', 'এই সময়ে এখানে অর্ডার নেই'));
      const bars = shown.length ? A.chart.bars({ items: shown.slice(0, 14).map((x) => ({ label: `${A.esc(placeName(lvl, x.k))} · ${x.n}`, value: mf(x), text: mFmt(A0.m, mf(x)), color: tone })), money: AM[A0.m][3] === 1 }) : U.empty(t('No orders here in this period', 'এই সময়ে এখানে অর্ডার নেই'));
      const mapCard = U.card(t(`${here}: by ${leaf ? 'area' : L.en.toLowerCase()}`, `${here}: ${lvName} অনুযায়ী`), `<div class="stack" style="gap:12px"><div class="row between">${crumb}${ctrls}</div>${A0.view === 'map' ? tiles : bars}</div>`);
      /* top products here */
      const ls = lineSales(cur); const tp = Object.values(ls).sort((a, b) => b.qty - a.qty).slice(0, 6);
      const topProd = U.card(t(`Top products in ${here}`, `${here}-এ সেরা প্রোডাক্ট`), tp.length ? `<div class="list ar-top">${tp.map((x, i) => { const p = A.byId(A.D.products, x.pid); return p ? `<a class="li" href="${A.href('products', 'all', p.id)}" style="text-decoration:none"><span class="rep-rank ${i ? '' : 'first'}">${i + 1}</span>${U.thumb(p, 34)}<span class="grow"><b class="ellip" style="display:block;font-weight:600">${A.esc(p.name)}</b><span class="small muted">${catName(p.cat)}</span></span><span class="n">${F.num(x.qty)} ${t('pcs', 'পিস')}</span><span class="small muted hide-sm" style="width:70px;text-align:right">${F.tkShort(x.value)}</span></a>` : ''; }).join('')}</div>` : U.empty(t('No sales here', 'এখানে বিক্রি নেই')), { sub: t('By pieces ordered', 'অর্ডার হওয়া পিস অনুযায়ী') });
      /* product/category → top places */
      const prods = Object.values(lineSales(fo(r.from, r.to))).sort((a, b) => b.qty - a.qty).slice(0, 25).map((x) => A.byId(A.D.products, x.pid)).filter(Boolean);
      const pickOpts = [...A.CATS.map((c) => ['cat:' + c.id, t('Category: ', 'ক্যাটাগরি: ') + t(c.en, c.bn)]), ...prods.map((p) => ['p:' + p.id, p.name])];
      if (!pickOpts.some((o) => o[0] === A0.pick)) A0.pick = pickOpts[0][0];
      const [pk, pv] = A0.pick.split(':');
      const lineHit = (l) => (pk === 'cat' ? catOf(l) === pv : l.pid === pv);
      const byLvl = lvl === 0 ? LV[1] : leaf ? LV[LV.length - 1] : L;
      const pm = {}; for (const o of liveO(cur)) for (const l of o.lines) if (lineHit(l)) { const k = byLvl.f(o); pm[k] = pm[k] || { k, q: 0, v: 0 }; pm[k].q += l.qty; pm[k].v += l.qty * l.price; }
      const pt = Object.values(pm).sort((a, b) => b.q - a.q).slice(0, 8); const pq = A.sum(Object.values(pm), (x) => x.q);
      const topAreas = U.card(t('Where it sells', 'কোথায় বিক্রি হয়'), `<div class="stack" style="gap:10px">${U.select('ar-pick', pickOpts, A0.pick)}${pt.length ? A.chart.bars({ items: pt.map((x) => ({ label: `${A.esc(placeName(byLvl === LV[0] ? 0 : 1, x.k))}`, value: x.q, text: `${F.num(x.q)} ${t('pcs', 'পিস')} · ${F.pct(pc(x.q, pq), 0)}`, color: 'var(--c1)' })), money: false }) : U.empty(t('Not sold here in this period', 'এই সময়ে এখানে বিক্রি হয়নি'))}</div>`, { sub: t(`Top ${lvl === 0 ? 'districts' : leaf ? 'areas' : L.en.toLowerCase() + 's'} for a product or category`, `একটা প্রোডাক্ট বা ক্যাটাগরির সেরা ${lvl === 0 ? 'জেলা' : lvName}`) });
      /* table */
      const cols = [
        { h: lvName, v: (x) => x.k, f: (x) => `<b>${A.esc(placeName(lvl, x.k))}</b>` },
        { h: t('Orders', 'অর্ডার'), r: 1, v: (x) => x.n, f: (x) => F.num(x.n) },
        { h: t('Pieces', 'পিস'), r: 1, hide: 1, v: (x) => x.pcs, f: (x) => F.num(x.pcs) },
        { h: t('Product value', 'প্রোডাক্টের মূল্য'), r: 1, hide: 1, v: (x) => x.mrp, f: (x) => F.tk(x.mrp) },
        { h: t('Delivered', 'ডেলিভারি'), r: 1, hide: 1, v: (x) => x.d, f: (x) => F.num(x.d) },
        { h: t('Returned', 'ফেরত'), r: 1, hide: 1, v: (x) => x.rt, f: (x) => F.num(x.rt) },
        { h: t('Return %', 'রিটার্ন %'), r: 1, v: (x) => x.rr, f: (x) => `<span style="color:${x.rr > 12 ? 'var(--bad)' : 'inherit'}">${F.pct(x.rr, 0)}</span>` },
        { h: t('Collected', 'টাকা এসেছে'), r: 1, hide: 1, v: (x) => x.col, f: (x) => F.tk(x.col) },
        { h: t('Profit', 'লাভ'), r: 1, v: (x) => x.pr, f: (x) => F.tk(x.pr) },
        { h: t('Avg order', 'গড় অর্ডার'), r: 1, hide: 1, v: (x) => x.aov, f: (x) => F.tk(x.aov) },
      ];
      const tbl = U.card(t('Every place in detail', 'প্রতিটা জায়গা বিস্তারিত'), stbl('ar-tbl', cols, kids, { sort: [1, 'desc'], limit: 10, onRow: (x) => (leaf ? ordersDrawer(placeName(lvl, x.k), x.os) : (S.ar.path = path.concat(x.k), draw())) }), { sub: leaf ? t('Click a row to see its orders', 'অর্ডার দেখতে সারিতে চাপুন') : t('Click a row to go one level deeper', 'এক ধাপ ভেতরে যেতে সারিতে চাপুন') });
      return ins(items.slice(0, 3)) + kpis([
        { label: t('Orders', 'অর্ডার'), value: F.num(T.n), delta: dl(T.n, Q.n), sub: t(`${F.num(T.pcs)} pieces`, `${F.num(T.pcs)} পিস`) },
        { label: t('Product value', 'প্রোডাক্টের মূল্য'), value: F.tkShort(T.mrp), delta: dl(T.mrp, Q.mrp) },
        { label: t('Delivered', 'ডেলিভারি'), value: F.num(T.d), delta: dl(T.d, Q.d) },
        { label: t('Return rate', 'রিটার্নের হার'), value: F.pct(T.rr), delta: dl(T.rr, Q.rr, true), sub: t(`${T.rt} returned`, `${T.rt}টি ফেরত`) },
        { label: t('Collected', 'টাকা এসেছে'), value: F.tkShort(T.col), delta: dl(T.col, Q.col) },
        { label: t('Profit before ads', 'বিজ্ঞাপনের আগে লাভ'), value: F.tkShort(T.pr), delta: dl(T.pr, Q.pr), sub: t(`avg order ${F.tk(T.aov)}`, `গড় অর্ডার ${F.tk(T.aov)}`) },
      ]) + `<div class="grid g3"><div class="span2 stack">${mapCard}</div><div class="stack">${topProd}${topAreas}</div></div>` + tbl;
    } });
    A.on(el, '[data-ar-go]', 'click', (e, b) => { S.ar.path = S.ar.path.slice(0, +b.dataset.arGo); draw(); });
    A.on(el, '[data-ar-in]', 'click', (e, b) => { if (S.ar.path.length >= LV.length - 1) { const r = rng(); const os = fo(r.from, r.to).filter((o) => S.ar.path.every((p, i) => LV[i].f(o) === p) && LV[LV.length - 1].f(o) === b.dataset.arIn); ordersDrawer(b.dataset.arIn, os); return; } S.ar.path = S.ar.path.concat(b.dataset.arIn); draw(); });
    A.on(el, '#ar-m button', 'click', (e, b) => { S.ar.m = b.dataset.v; draw(); });
    A.on(el, '#ar-view button', 'click', (e, b) => { S.ar.view = b.dataset.v; draw(); });
    const pk = el.querySelector('#ar-pick'); if (pk) pk.onchange = () => { S.ar.pick = pk.value; draw(); };
  }

  /* ================= TEAM ================= */
  function rTeam(el, r0) {
    frame(el, r0, 'team', { title: t('Team report', 'টিম রিপোর্ট'), sub: t('Who did what: calls, packing and customer messages', 'কে কী করেছেন: কল, প্যাকিং ও কাস্টমার মেসেজ'), filters: [], body: () => {
      const r = rng();
      const act = (from, to) => { const m = {}; const add = (who, key, extra) => { m[who] = m[who] || { confirm: 0, cancel: 0, pack: 0, hand: 0, exch: 0, msgs: 0, rt: [], ct: [], log: [] }; m[who][key]++; if (extra) m[who][extra[0]].push(extra[1]); };
        for (const o of A.D.orders) for (const e of o.timeline) { if (!C.inRange(e.t, from, to)) continue;
          if (e.text === 'Confirmed on call') { add(e.by, 'confirm', ['ct', (new Date(e.t) - new Date(o.created)) / 36e5]); m[e.by].log.push({ t: e.t, text: t('Confirmed ', 'কনফার্ম করেছেন ') + o.id, id: o.id }); }
          else if (e.text.startsWith('Cancelled')) { add(e.by, 'cancel'); m[e.by].log.push({ t: e.t, text: t('Cancelled ', 'বাতিল করেছেন ') + o.id, id: o.id }); }
          else if (e.text.startsWith('Packed')) { add(e.by, 'pack'); m[e.by].log.push({ t: e.t, text: t('Packed ', 'প্যাক করেছেন ') + o.id, id: o.id }); }
          else if (e.text.startsWith('Handed to')) add(e.by, 'hand');
          else if (e.text.startsWith('Size exchange')) { add(e.by, 'exch'); m[e.by].log.push({ t: e.t, text: t('Exchange for ', 'এক্সচেঞ্জ ') + o.id, id: o.id }); } }
        for (const c of A.D.conversations) c.msgs.forEach((x, i) => { if (x.from !== 's' || !C.inRange(x.t, from, to)) return; const pv = c.msgs[i - 1]; add(x.by, 'msgs', pv && pv.from === 'c' ? ['rt', (new Date(x.t) - new Date(pv.t)) / 6e4] : null); m[x.by].log.push({ t: x.t, text: t('Replied to ', 'উত্তর দিয়েছেন: ') + c.name }); });
        return m; };
      const cur = act(r.from, r.to), prev = act(r.prevFrom, r.prevTo);
      const avg = (a) => (a.length ? A.sum(a) / a.length : 0);
      const ROLE = { Owner: 'মালিক', 'Order manager': 'অর্ডার ম্যানেজার', 'Customer care': 'কাস্টমার কেয়ার', Packing: 'প্যাকিং', Marketing: 'মার্কেটিং' };
      const rows = A.D.staff.map((s) => { const k = s.name.split(' ')[0]; const a = cur[k] || cur[s.name] || { confirm: 0, cancel: 0, pack: 0, hand: 0, exch: 0, msgs: 0, rt: [], ct: [], log: [] }; const p = prev[k] || { confirm: 0, pack: 0, msgs: 0, hand: 0, exch: 0, cancel: 0 };
        const total = a.confirm + a.cancel + a.pack + a.hand + a.exch + a.msgs; const ptotal = p.confirm + p.cancel + p.pack + p.hand + p.exch + p.msgs;
        return { s, _id: s.id, a, total, ptotal, rt: avg(a.rt), ct: avg(a.ct) }; });
      const tot = (f) => A.sum(rows, (x) => x.a[f]); const ptot = (f) => A.sum(Object.values(prev), (x) => x[f]);
      const allRt = rows.flatMap((x) => x.a.rt); const allCt = rows.flatMap((x) => x.a.ct);
      const lead = rows.slice().sort((a, b) => b.total - a.total);
      const slow = rows.filter((x) => x.a.rt.length).sort((a, b) => b.rt - a.rt)[0];
      const open = A.D.conversations.filter((c) => c.status === 'open'); const unassigned = open.filter((c) => !c.assignee).length;
      const newWaiting = A.D.orders.filter((o) => o.status === 'new').length;
      const items = [
        lead[0] && lead[0].total ? I2(t(`${lead[0].s.name} did the most work: ${lead[0].total} actions (${sg(chg(lead[0].total, lead[0].ptotal))} vs ${prevName(r)}).`, `সবচেয়ে বেশি কাজ করেছেন ${lead[0].s.name}: ${lead[0].total}টি কাজ (${prevName(r)} তুলনায় ${sg(chg(lead[0].total, lead[0].ptotal))})।`), 'good') : null,
        I2(t(`New orders are confirmed in ${avg(allCt).toFixed(1)} hours on average. ${newWaiting} are waiting for a call now.`, `নতুন অর্ডার গড়ে ${avg(allCt).toFixed(1)} ঘণ্টায় কনফার্ম হয়। এখন ${newWaiting}টি কলের অপেক্ষায়।`), avg(allCt) > 3 ? 'bad' : ''),
        slow ? I2(t(`Average first reply to a customer message is ${Math.round(avg(allRt))} min. ${unassigned} open chats have nobody assigned.`, `কাস্টমারের মেসেজে গড়ে ${Math.round(avg(allRt))} মিনিটে প্রথম উত্তর। ${unassigned}টি খোলা চ্যাটে কেউ দায়িত্বে নেই।`), avg(allRt) > 20 ? 'bad' : '') : null,
      ];
      const CV = chatConv(r.from, r.to), CVq = chatConv(r.prevFrom, r.prevTo); const cvOf = (m, s) => m[s.name.split(' ')[0]] || m[s.name] || { chats: 0, orders: 0 };
      const cvAll = (m) => ({ chats: A.sum(Object.values(m), (x) => x.chats), orders: A.sum(Object.values(m), (x) => x.orders) }); const ca = cvAll(CV), cq = cvAll(CVq);
      const fmtMin = (m) => (m ? (m >= 60 ? (m / 60).toFixed(1) + t(' h', ' ঘণ্টা') : Math.round(m) + t(' min', ' মিনিট')) : '—');
      return ins(items) + kpis([
        { label: t('Calls confirmed', 'কলে কনফার্ম'), value: F.num(tot('confirm')), delta: dl(tot('confirm'), ptot('confirm')) },
        { label: t('Orders packed', 'প্যাক করা অর্ডার'), value: F.num(tot('pack')), delta: dl(tot('pack'), ptot('pack')) },
        { label: t('Chat → order', 'চ্যাট → অর্ডার'), value: F.pct(pc(ca.orders, ca.chats), 0), delta: dl(pc(ca.orders, ca.chats), pc(cq.orders, cq.chats)), sub: t(`${ca.orders} orders from ${ca.chats} chats`, `${ca.chats}টি চ্যাট থেকে ${ca.orders}টি অর্ডার`) },
        { label: t('Avg first reply', 'গড় প্রথম উত্তর'), value: fmtMin(avg(allRt)), sub: t('customer messages', 'কাস্টমার মেসেজ') },
        { label: t('Handed to couriers', 'কুরিয়ারে দেওয়া'), value: F.num(tot('hand')), delta: dl(tot('hand'), ptot('hand')) },
        { label: t('Messages answered', 'মেসেজের উত্তর'), value: F.num(tot('msgs')), delta: dl(tot('msgs'), ptot('msgs')) },
        { label: t('Avg time to confirm', 'কনফার্মে গড় সময়'), value: avg(allCt).toFixed(1) + t(' h', ' ঘণ্টা'), sub: t('order placed → call done', 'অর্ডার → কল শেষ') },
      ]) + `<div class="grid g2">${U.card(t('Leaderboard', 'লিডারবোর্ড'), `<div class="list">${lead.map((x, i) => `<div class="li"><span class="rep-rank ${i === 0 && x.total ? 'first' : ''}">${i + 1}</span><span class="avatar" style="width:32px;height:32px;font-size:13px">${x.s.name[0]}</span><span class="grow"><b>${A.esc(x.s.name)}</b><div class="small muted">${t(x.s.role, ROLE[x.s.role] || x.s.role)}</div>${U.bar(pc(x.total, lead[0].total || 1), COLS[i])}</span><b class="num">${x.total}</b></div>`).join('')}</div>`, { sub: t('All recorded actions in this period', 'এই সময়ে সব রেকর্ড করা কাজ') })}${U.card(t('Work by type', 'কাজের ধরন অনুযায়ী'), A.chart.columns({ labels: rows.map((x) => x.s.name.split(' ')[0]), values: rows.map((x) => x.a.confirm + x.a.cancel), values2: rows.map((x) => x.a.pack + x.a.hand), money: false, color: 'var(--c2)', color2: 'var(--c1)' }) + `<div class="legend"><span><i class="dotk" style="background:var(--c2)"></i>${t('Calls', 'কল')}</span><span><i class="dotk" style="background:var(--c1)"></i>${t('Packing & handover', 'প্যাকিং ও হস্তান্তর')}</span></div>` + `<div class="small muted" style="margin-top:8px">${t('Marketing work (ads, posts) shows in the Marketing report.', 'মার্কেটিংয়ের কাজ (বিজ্ঞাপন, পোস্ট) মার্কেটিং রিপোর্টে দেখুন।')}</div>`)}</div>` +
      U.card(t('Team details', 'টিমের বিস্তারিত'), stbl('tm-all', [
        { h: t('Person', 'নাম'), v: (x) => x.s.name, f: (x) => `<b>${A.esc(x.s.name)}</b><div class="small muted">${t(x.s.role, ROLE[x.s.role] || x.s.role)}</div>` },
        { h: t('Calls confirmed', 'কলে কনফার্ম'), r: 1, v: (x) => x.a.confirm, f: (x) => F.num(x.a.confirm) },
        { h: t('Cancelled', 'বাতিল'), r: 1, hide: 1, v: (x) => x.a.cancel, f: (x) => F.num(x.a.cancel) },
        { h: t('Packed', 'প্যাক'), r: 1, v: (x) => x.a.pack, f: (x) => F.num(x.a.pack) },
        { h: t('Exchanges', 'এক্সচেঞ্জ'), r: 1, hide: 1, v: (x) => x.a.exch, f: (x) => F.num(x.a.exch) },
        { h: t('Messages', 'মেসেজ'), r: 1, v: (x) => x.a.msgs, f: (x) => F.num(x.a.msgs) },
        { h: t('Chat → order', 'চ্যাট → অর্ডার'), r: 1, v: (x) => pc(cvOf(CV, x.s).orders, cvOf(CV, x.s).chats), f: (x) => { const c = cvOf(CV, x.s); return c.chats ? `${F.pct(pc(c.orders, c.chats), 0)}<div class="small muted">${c.orders}/${c.chats}</div>` : '—'; } },
        { h: t('Avg reply', 'গড় উত্তর'), r: 1, hide: 1, v: (x) => x.rt || 1e9, f: (x) => fmtMin(x.rt) },
        { h: t('Total', 'মোট'), r: 1, v: (x) => x.total, f: (x) => `<b>${x.total}</b> ${dl(x.total, x.ptotal)}` },
      ], rows, { sort: [9, 'desc'], onRow: (x) => U.drawer(A.esc(x.s.name) + ' · ' + t('recent work', 'সাম্প্রতিক কাজ'), x.a.log.length ? `<div class="card list">${x.a.log.sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, 40).map((l) => `<div class="li">${l.id ? `<a href="${A.href('orders', 'all', l.id)}" data-close class="grow" style="text-decoration:none;color:inherit">${l.text}</a>` : `<span class="grow">${A.esc(l.text)}</span>`}<span class="small muted">${F.dt(l.t)}</span></div>`).join('')}</div>` : U.empty(t('No recorded order or message work in this period', 'এই সময়ে অর্ডার বা মেসেজের কোনো কাজ রেকর্ড নেই'))) }), { sub: t('Click a person to see what they did', 'কে কী করেছেন দেখতে নামে চাপুন') });
    } });
  }

  /* ---------------- shared analysis helpers ---------------- */
  const styleOf = (p) => p.name.replace(/ (II|Plus|Lite|Pro|Classic)$/, '');
  /** Profit before ads of finished orders, shared over their lines by line value; sales = delivered line value. key(line, order). */
  const profitBy = (os, key) => {
    const m = {};
    for (const o of os) {
      const d = C.isDelivered(o), rt = o.status === 'returned'; if (!d && !rt) continue; const pr = C.orderProfit(o);
      for (const l of o.lines) { if (!lineOk(l)) continue; const k = key(l, o); if (k == null) continue; m[k] = m[k] || { k, sales: 0, profit: 0, pcs: 0, cost: 0, ret: 0 };
        const share = o.subtotal ? (l.qty * l.price) / o.subtotal : 0; m[k].profit += pr * share;
        if (d) { m[k].sales += l.qty * l.price; m[k].pcs += l.qty; m[k].cost += l.qty * l.cost; } else m[k].ret += l.qty; }
    }
    Object.values(m).forEach((x) => { x.m = pc(x.profit, x.sales); });
    return m;
  };
  const divOf = (o) => DIV[o.district] || 'Dhaka';
  const divName = (d) => t(d, DIVBN[d] || d);
  const gradeOf = (c) => { const g = A.rulesApi && A.rulesApi.gradeOf ? A.rulesApi.gradeOf(c) : null; if (g) return { idx: g.idx, name: g.name }; const s = c.spent || 0; return s >= 15000 ? { idx: 2, name: 'Gold' } : s >= 6000 ? { idx: 1, name: 'Silver' } : s > 0 ? { idx: 0, name: 'Regular' } : { idx: -1, name: t('No delivered order yet', 'এখনো ডেলিভারি হয়নি') }; };
  /** Restock verdict rules (shown on the page). */
  const VR = { restockDays: 21, restockSold: 5, bulkSold: 20, bulkMargin: 45, stopSold: 2, stopDays: 90, stopMargin: 15 };
  const verdict = (x) => {
    if (x.sold >= VR.restockSold && (x.days < VR.restockDays || x.short)) return ['restock', t('Restock', 'আবার আনুন'), 'bad'];
    if (x.sold30 >= VR.bulkSold && x.m >= VR.bulkMargin) return ['bulk', t('Buy in bulk', 'বেশি করে আনুন'), 'good'];
    if ((x.sold <= VR.stopSold && x.days > VR.stopDays) || (x.sales > 0 && x.m < VR.stopMargin)) return ['stop', t('Stop', 'বন্ধ করুন'), 'dark'];
    return ['keep', t('Keep', 'চালু রাখুন'), 'info'];
  };
  /** Partial deliveries and exchange reasons are kept on the order by the returns screen; the sample picks them the same way every time. */
  const isPartial = (o) => C.isDelivered(o) && C.pieces(o) >= 2 && hsh(o.id) % 9 === 0;
  const EXR = [['Size too small', 'সাইজ ছোট'], ['Size too big', 'সাইজ বড়'], ['Size too small', 'সাইজ ছোট'], ['Colour not as photo', 'রং ছবির মতো না'], ['Small defect', 'ছোট ত্রুটি']];
  const exReason = (o) => EXR[hsh(o.id + 'x') % EXR.length];

  /* ================= REPORT LIBRARY ================= */
  function rOverview(el, r0) {
    frame(el, r0, 'overview', { title: t('Report library', 'রিপোর্ট লাইব্রেরি'), sub: t('Pick a question, see the answer. Pin the numbers you want on Home.', 'প্রশ্ন বাছুন, উত্তর দেখুন। যে সংখ্যা Home-এ চান, পিন করুন।'), body: () => {
      const r = rng(); const k = kp(r.from, r.to), q = kp(r.prevFrom, r.prevTo);
      if (!A.D.reportPins) A.D.reportPins = ['sales', 'profit', 'restock', 'returns'];
      const pins = A.D.reportPins;
      const pcs = (os) => profitBy(os, (l) => l.pid);
      const cp = profitBy(k.os, (l, o) => o.channel), cpq = profitBy(q.os, (l, o) => o.channel);
      const bestCh = Object.values(cp).sort((a, b) => b.profit - a.profit)[0];
      const rows = A.D.products.filter((p) => p.status === 'live').map((p) => ({ p, sold: (lineSales(k.os)[p.id] || {}).qty || 0 }));
      const ls = lineSales(k.os), lq = lineSales(q.os);
      const pp = pcs(k.os);
      const vcount = (arr) => arr.filter((p) => { const s = ls[p.id] || { qty: 0 }; const x = { sold: s.qty, sold30: p.sold30, short: shortSizes(p).length, days: C.stockDays(p), m: (pp[p.id] || { m: 0 }).m, sales: (pp[p.id] || { sales: 0 }).sales }; return verdict(x)[0] === 'restock'; }).length;
      const live = A.D.products.filter((p) => p.status === 'live');
      const top = Object.values(ls).sort((a, b) => b.qty - a.qty)[0]; const topP = top && A.byId(A.D.products, top.pid);
      const first = {}; for (const o of A.D.orders) { if (o.status === 'cancelled') continue; if (!first[o.customerId] || o.created < first[o.customerId]) first[o.customerId] = o.created; }
      const nw = (os) => new Set(liveO(os).filter((o) => first[o.customerId] === o.created).map((o) => o.customerId)).size;
      const buyers = A.D.customers.filter((c) => c.orders > 0); const repeat = pc(buyers.filter((c) => c.orders >= 2).length, buyers.length);
      const reasons = Object.entries(A.groupBy(k.ret, (o) => o.returnReason || '—')).sort((a, b) => b[1].length - a[1].length)[0];
      const dists = Object.values(A.groupBy(k.live, (o) => o.district)).map((os) => ({ d: os[0].district, v: A.sum(os, (o) => o.total) })).sort((a, b) => b.v - a.v)[0];
      const badDist = finishedBy(k.os, (o) => o.district, 5)[0];
      const ct = (from, to) => { const a = []; for (const o of A.D.orders) for (const e of o.timeline) if (e.text === 'Confirmed on call' && C.inRange(e.t, from, to)) a.push((new Date(e.t) - new Date(o.created)) / 36e5); return a.length ? A.sum(a) / a.length : 0; };
      const ctc = ct(r.from, r.to), ctp = ct(r.prevFrom, r.prevTo);
      const G = [
        ['sales', t('Sales & profit', 'বিক্রি ও লাভ'), 'finance', [
          { id: 'sales', q: t('How much did we sell?', 'কত বিক্রি হলো?'), v: F.tk(k.orderValue), d: dl(k.orderValue, q.orderValue), s: t(`${k.orders} orders · ${k.pieces} pieces`, `${k.orders}টি অর্ডার · ${k.pieces} পিস`), tab: 'sales' },
          { id: 'profit', q: t('Did we make money after all costs?', 'সব খরচের পরে কি লাভ হলো?'), v: F.tk(k.profit), d: dl(k.profit, q.profit), s: t(`${F.pct(k.p.margin)} of sales · same as Finance`, `বিক্রির ${F.pct(k.p.margin)} · হিসাবের সাথে মিল`), tab: 'profit' },
          { id: 'chprofit', q: t('Which channel earns the most profit?', 'কোন চ্যানেলে লাভ সবচেয়ে বেশি?'), v: bestCh ? chName(bestCh.k) : '—', d: bestCh ? dl(bestCh.profit, (cpq[bestCh.k] || { profit: 0 }).profit) : '', s: bestCh ? t(`${F.tk(bestCh.profit)} profit before ads`, `বিজ্ঞাপনের আগে লাভ ${F.tk(bestCh.profit)}`) : '', tab: 'profit' },
          { id: 'aov', q: t('How big is an average order?', 'গড় অর্ডার কত বড়?'), v: F.tk(k.aov), d: dl(k.aov, q.aov), s: t(`${(k.pieces / (k.orders || 1)).toFixed(1)} pieces per order`, `অর্ডারে গড়ে ${(k.pieces / (k.orders || 1)).toFixed(1)} পিস`), tab: 'sales' },
        ]],
        ['products', t('Products & stock', 'প্রোডাক্ট ও স্টক'), 'products', [
          { id: 'restock', q: t('What should I restock now?', 'এখন কী আবার আনতে হবে?'), v: F.num(vcount(live)) + t(' products', 'টি প্রোডাক্ট'), d: '', s: t('still selling, a size runs out within 14 days', 'বিক্রি চলছে, কোনো সাইজ 14 দিনে শেষ হবে'), tab: 'products' },
          { id: 'best', q: t('What is the best seller?', 'সবচেয়ে বেশি বিক্রি কোনটা?'), v: topP ? A.esc(topP.name) : '—', d: top ? dl(top.qty, (lq[top.pid] || { qty: 0 }).qty) : '', s: top ? t(`${top.qty} pieces · ${F.tkShort(top.value)}`, `${top.qty} পিস · ${F.tkShort(top.value)}`) : '', tab: 'products', small: 1 },
          { id: 'dead', q: t('What is sitting unsold?', 'কী বিক্রি না হয়ে পড়ে আছে?'), v: F.num(rows.filter((x) => !x.sold && A.sum(x.p.variants, (v) => v.stock) > 30).length) + t(' products', 'টি প্রোডাক্ট'), d: '', s: t('no sale in this period, 30+ pieces in stock', 'এই সময়ে বিক্রি নেই, স্টকে 30+ পিস'), tab: 'products' },
        ]],
        ['customers', t('Customers', 'কাস্টমার'), 'customers', [
          { id: 'repeat', q: t('Do customers come back?', 'কাস্টমার কি আবার কেনেন?'), v: F.pct(repeat, 0), d: '', s: t('ordered more than once, all time', 'একাধিকবার অর্ডার, এখন পর্যন্ত'), tab: 'customers' },
          { id: 'newc', q: t('How many new customers did we get?', 'কতজন নতুন কাস্টমার এলেন?'), v: F.num(nw(k.os)), d: dl(nw(k.os), nw(q.os)), s: t('first order in this period', 'এই সময়ে প্রথম অর্ডার'), tab: 'customers' },
        ]],
        ['delivery', t('Delivery & returns', 'ডেলিভারি ও রিটার্ন'), 'truck', [
          { id: 'returns', q: t('How many parcels come back?', 'কত পার্সেল ফেরত আসে?'), v: F.pct(k.returnRate), d: dl(k.returnRate, q.returnRate, true), s: t(`${k.ret.length} parcels returned`, `${k.ret.length}টি পার্সেল ফেরত`), tab: 'delivery' },
          { id: 'why', q: t('Why do parcels come back?', 'পার্সেল কেন ফেরত আসে?'), v: reasons ? A.esc(reasons[0]) : '—', d: '', s: reasons ? t(`${reasons[1].length} parcels`, `${reasons[1].length}টি পার্সেল`) : '', tab: 'delivery', small: 1 },
        ]],
        ['marketing', t('Marketing', 'মার্কেটিং'), 'marketing', [
          { id: 'roas', q: t('Do our ads pay back?', 'বিজ্ঞাপনের টাকা কি ফেরত আসে?'), v: k.roas.toFixed(1) + '×', d: dl(k.roas, q.roas), s: t('delivered sales per ৳1 of ads', 'বিজ্ঞাপনের ৳1-এ ডেলিভারড বিক্রি'), tab: 'marketing' },
          { id: 'ads', q: t('How much did ads cost?', 'বিজ্ঞাপনে কত খরচ হলো?'), v: F.tk(k.ads), d: dl(k.ads, q.ads, true), s: t('all ad platforms', 'সব বিজ্ঞাপন প্ল্যাটফর্ম'), tab: 'marketing' },
        ]],
        ['areas', t('Areas', 'এলাকা'), 'search', [
          { id: 'toparea', q: t('Where do most orders come from?', 'সবচেয়ে বেশি অর্ডার কোথা থেকে?'), v: dists ? A.esc(dists.d) : '—', d: '', s: dists ? t(`${F.tkShort(dists.v)} order value · ${F.pct(pc(dists.v, k.orderValue), 0)} of all`, `${F.tkShort(dists.v)} অর্ডারের মূল্য · মোটের ${F.pct(pc(dists.v, k.orderValue), 0)}`) : '', tab: 'areas' },
          { id: 'badarea', q: t('Which area returns the most?', 'কোন এলাকায় ফেরত সবচেয়ে বেশি?'), v: badDist ? A.esc(badDist.k) : '—', d: '', s: badDist ? t(`${F.pct(badDist.rate, 0)} of ${badDist.n} parcels`, `${badDist.n}টি পার্সেলের ${F.pct(badDist.rate, 0)}`) : '', tab: 'areas' },
        ]],
        ['team', t('Team', 'টিম'), 'customers', [
          { id: 'confirmtime', q: t('How fast do we confirm new orders?', 'নতুন অর্ডার কত দ্রুত কনফার্ম হয়?'), v: ctc.toFixed(1) + t(' h', ' ঘণ্টা'), d: dl(ctc, ctp, true), s: t('order placed → call done', 'অর্ডার → কল শেষ'), tab: 'team' },
        ]],
      ];
      const cs = A.D.couriers.map((c) => { const fin = k.os.filter((o) => o.courier === c.id && (C.isDelivered(o) || o.status === 'returned')); return { c, n: fin.length, rate: fin.length ? fin.filter(C.isDelivered).length / fin.length * 100 : 0 }; }).filter((x) => x.n).sort((a, b) => b.rate - a.rate)[0];
      let incN = null; try { incN = A.incompleteApi && A.incompleteApi.openCount ? A.incompleteApi.openCount() : null; } catch (e) { incN = null; }
      G.find((g) => g[0] === 'delivery')[3].push({ id: 'courierrep', q: t('Courier report', 'কুরিয়ার রিপোর্ট'), v: cs ? A.esc(cs.c.name) : '—', d: '', s: cs ? t(`best success: ${F.pct(cs.rate, 0)} of ${cs.n} parcels · every courier compared`, `সবচেয়ে ভালো সফলতা: ${cs.n}টি পার্সেলের ${F.pct(cs.rate, 0)} · সব কুরিয়ারের তুলনা`) : t('every courier compared', 'সব কুরিয়ারের তুলনা'), href: '#reports--couriers', small: 1 });
      G.find((g) => g[0] === 'customers')[3].push({ id: 'checkoutj', q: t('Checkout journey (incomplete orders)', 'চেকআউট জার্নি (অসম্পূর্ণ অর্ডার)'), v: incN == null ? '—' : F.num(incN) + t(' open', 'টি খোলা'), d: '', s: t('where visitors stop in checkout, and how many we win back', 'চেকআউটে কোথায় থেমে যান, আর কতজনকে ফেরানো গেল'), href: '#orders--incomplete' });
      const all = G.flatMap((g) => g[3]);
      const card = (c) => { const pin = pins.includes(c.id); return `<a class="card rep-lc" href="${c.href || A.href('reports', c.tab)}"><span class="q">${c.q}</span><span class="v"><b ${c.small ? 'style="font-size:17px"' : ''}>${c.v}</b>${c.d || ''}</span><span class="s">${c.s || ''}</span><span class="ft"><span class="muted">${t('Open report', 'রিপোর্ট খুলুন')} →</span><button class="rep-pin ${pin ? 'on' : ''}" data-pin="${c.id}">${A.icon(pin ? 'check' : 'plus')} ${pin ? t('On Home', 'Home-এ আছে') : t('Pin to Home', 'Home-এ পিন')}</button></span></a>`; };
      const lm = C.range('lastmonth'); const lp = C.pnl(lm.from, lm.to);
      const review = U.callout(`<div class="row between" style="gap:10px;flex-wrap:wrap"><span><b>${t('October 2026 review is ready', 'অক্টোবর 2026-এর রিভিউ তৈরি')}</b> · ${t(`net profit ${F.tk(lp.net)} on ${F.tk(lp.revenue)} delivered sales. What went well, what went badly and 3 things to do.`, `ডেলিভারড বিক্রি ${F.tk(lp.revenue)}, নিট লাভ ${F.tk(lp.net)}। কী ভালো হলো, কী খারাপ, আর 3টা কাজ।`)}</span><a class="btn sm primary" href="${A.href('reports', 'review')}">${t('Read the review', 'রিভিউ পড়ুন')} →</a></div>`, 'info', 'star');
      const pinned = all.filter((c) => pins.includes(c.id));
      return review + (pinned.length ? `<div class="rep-lib-g"><h3>${A.icon('home')} ${t(`Pinned to Home (${pinned.length})`, `Home-এ পিন করা (${pinned.length})`)}</h3><div class="rep-lib">${pinned.map(card).join('')}</div></div>` : '') +
        G.map((g) => `<div class="rep-lib-g"><h3>${A.icon(g[2])} ${g[1]}</h3><div class="rep-lib">${g[3].map(card).join('')}</div></div>`).join('') +
        `<div class="rep-lib-g" id="rep-downloads"><h3>${A.icon('down')} ${t('Downloads & report packs', 'ডাউনলোড ও রিপোর্ট প্যাক')}</h3><p class="small muted" style="margin:-4px 2px 10px">${t('For a bank or loan application, a partner, or your own analysis. PDF on the EXTAS letterhead, or Excel with one sheet per part.', 'ব্যাংক বা লোনের আবেদন, পার্টনার, বা নিজের বিশ্লেষণের জন্য। EXTAS লেটারহেডে PDF, বা অংশ প্রতি শিটসহ Excel।')}</p>${downloadsHtml(false)}</div>` +
        `<p class="small muted" style="margin-top:16px">${t('Money and the books (profit & loss statement, expenses, COD with couriers) are in Finance. Visitors and the website funnel are in Website › Analytics.', 'টাকা ও খাতা (লাভ-ক্ষতির হিসাব, খরচ, কুরিয়ারের কাছে COD) হিসাব পেজে। ভিজিটর ও ওয়েবসাইট ফানেল ওয়েবসাইট › অ্যানালিটিক্স-এ।')} <a href="${A.href('finance', 'pnl')}">${t('Open Finance', 'হিসাবে যান')}</a></p>`;
    } });
    wireDownloads(el);
    A.on(el, '[data-pin]', 'click', (e, b) => {
      e.preventDefault(); e.stopPropagation(); const id = b.dataset.pin; const pins = A.D.reportPins; const i = pins.indexOf(id);
      if (i >= 0) pins.splice(i, 1); else pins.push(id);
      A.commit((i >= 0 ? 'Unpinned report from Home: ' : 'Pinned report to Home: ') + id); A.toast(i >= 0 ? t('Removed from Home', 'Home থেকে সরানো হলো') : t('Pinned to Home', 'Home-এ পিন হলো'), 'good'); draw();
    });
  }

  /* ================= PROFIT ANALYSIS ================= */
  function rProfit(el, r0) {
    frame(el, r0, 'profit', { title: t('Profit analysis', 'লাভের বিশ্লেষণ'), sub: t('Which channels, categories, styles and areas make the money', 'কোন চ্যানেল, ক্যাটাগরি, স্টাইল ও এলাকা থেকে লাভ আসে'), body: () => {
      const r = rng(); const k = kp(r.from, r.to), q = kp(r.prevFrom, r.prevTo); const p = k.p, pp = q.p;
      const before = A.sum(k.os, C.orderProfit), beforeQ = A.sum(q.os, C.orderProfit);
      const ppo = k.del.length ? before / k.del.length : 0, ppoQ = q.del.length ? beforeQ / q.del.length : 0;
      const byCh = profitBy(k.os, (l, o) => o.channel), byChQ = profitBy(q.os, (l, o) => o.channel);
      const byCat = profitBy(k.os, (l) => catOf(l)), byCatQ = profitBy(q.os, (l) => catOf(l));
      const byStyle = profitBy(k.os, (l) => { const pr = A.byId(A.D.products, l.pid); return pr ? pr.cat + '|' + styleOf(pr) : null; });
      const byProd = profitBy(k.os, (l) => l.pid);
      const byDiv = profitBy(k.os, (l, o) => divOf(o)), byDivQ = profitBy(q.os, (l, o) => divOf(o));
      const wk = []; const end = new Date(F.ymd(A.TODAY) + 'T00:00:00+06:00').getTime() + DAY; for (let i = 7; i >= 0; i--) wk.push({ from: end - (i + 1) * 7 * DAY, to: end - i * 7 * DAY });
      const wkP = wk.map((w) => pnlF(w.from, w.to));
      const main = A.chart.line({ labels: wk.map((w) => F.date(w.from)), money: false, series: [
        { name: t('Margin before ads %', 'বিজ্ঞাপনের আগে মার্জিন %'), color: 'var(--c3)', values: wkP.map((x) => Math.max(0, Math.round(pc(x.gross, x.revenue)))) },
        { name: t('Net margin %', 'নিট মার্জিন %'), color: 'var(--c1)', values: wkP.map((x) => Math.round(pc(x.net, x.revenue))) },
      ] });
      const cats = Object.values(byCat).filter((x) => x.sales > 3000).sort((a, b) => b.m - a.m);
      const lowCat = cats[cats.length - 1]; const bestCh = Object.values(byCh).sort((a, b) => b.profit - a.profit)[0];
      const prods = Object.values(byProd).filter((x) => x.pcs + x.ret >= 2);
      const losers = prods.filter((x) => x.profit < 0).sort((a, b) => a.profit - b.profit);
      const worstDiv = Object.values(byDiv).filter((x) => x.sales > 5000).sort((a, b) => a.m - b.m)[0];
      const items = [
        lowCat ? I2(t(`${catName(lowCat.k)} keeps only ${F.pct(lowCat.m, 0)} of sales as profit before ads (best: ${catName(cats[0].k)} ${F.pct(cats[0].m, 0)}). Check its prices or discounts.`, `${catName(lowCat.k)}-এ বিক্রির মাত্র ${F.pct(lowCat.m, 0)} বিজ্ঞাপনের আগে লাভ থাকে (সেরা: ${catName(cats[0].k)} ${F.pct(cats[0].m, 0)})। দাম বা ছাড় দেখুন।`), lowCat.m < 25 ? 'bad' : '', AC('Check prices', 'দাম দেখুন', 'products', 'all')) : null,
        bestCh ? I2(t(`${chName(bestCh.k)} brings the most profit: ${F.tk(bestCh.profit)} (${sg(chg(bestCh.profit, (byChQ[bestCh.k] || {}).profit))} vs ${prevName(r)}). Put more ad money behind it.`, `সবচেয়ে বেশি লাভ ${chName(bestCh.k)} থেকে: ${F.tk(bestCh.profit)} (${prevName(r)} তুলনায় ${sg(chg(bestCh.profit, (byChQ[bestCh.k] || {}).profit))})। এখানে বিজ্ঞাপন বাড়ান।`), 'good', AC('Raise budget', 'বাজেট বাড়ান', 'marketing', 'campaigns')) : null,
        worstDiv ? I2(t(`${divName(worstDiv.k)} division has the thinnest margin (${F.pct(worstDiv.m, 0)}) because of returns and courier cost. Ask for the delivery charge first there.`, `${divName(worstDiv.k)} বিভাগে মার্জিন সবচেয়ে কম (${F.pct(worstDiv.m, 0)}), রিটার্ন ও কুরিয়ার খরচের কারণে। সেখানে আগে ডেলিভারি চার্জ নিন।`), worstDiv.m < 25 ? 'bad' : '', AC('Ask advance', 'আগে চার্জ নিন', 'rules', 'all')) : null,
      ];
      const mcol = (m) => (m >= 35 ? 'var(--good)' : m >= 20 ? 'var(--ink)' : 'var(--bad)');
      const pcols = (id, kname, kfmt, rowsArr, prevMap, onRow, extra = {}) => stbl(id, [
        { h: kname, v: (x) => kfmt(x.k), f: (x) => `<b>${kfmt(x.k, true)}</b>` },
        { h: t('Delivered sales', 'ডেলিভারড বিক্রি'), r: 1, hide: 1, v: (x) => x.sales, f: (x) => F.tk(x.sales) },
        { h: t('Profit before ads', 'বিজ্ঞাপনের আগে লাভ'), r: 1, v: (x) => x.profit, f: (x) => `<b style="color:${x.profit < 0 ? 'var(--bad)' : 'inherit'}">${F.tk(x.profit)}</b>` + (prevMap ? ' ' + dl(x.profit, (prevMap[x.k] || { profit: 0 }).profit) : '') },
        { h: t('Margin', 'মার্জিন'), r: 1, v: (x) => x.m, f: (x) => `<span style="color:${mcol(x.m)}">${x.sales ? F.pct(x.m, 0) : '—'}</span>` },
      ], rowsArr, { sort: [2, 'desc'], onRow, ...extra });
      const pName = (pid, html) => { const pr = A.byId(A.D.products, pid); if (!pr) return pid; return html ? `<span class="row" style="gap:8px;flex-wrap:nowrap">${U.thumb(pr, 28)}<span class="ellip" style="max-width:190px">${A.esc(pr.name)}</span></span>` : pr.name; };
      const stName = (key, html) => { const [c, st] = key.split('|'); return html ? `${A.esc(st)}<div class="small muted">${catName(c)}</div>` : st; };
      return ins(items) + kpis([
        { label: t('Net profit (after all costs)', 'নিট লাভ (সব খরচের পরে)'), value: F.tk(p.net), delta: dl(p.net, pp.net), sub: t('same as Finance', 'হিসাবের সাথে মিল') },
        { label: t('Profit before ads', 'বিজ্ঞাপনের আগে লাভ'), value: F.tk(before), delta: dl(before, beforeQ) },
        { label: t('Net margin', 'নিট মার্জিন'), value: F.pct(p.margin), delta: dl(p.margin, pp.margin) },
        { label: t('Profit per delivered order', 'প্রতি ডেলিভারড অর্ডারে লাভ'), value: F.tk(ppo), delta: dl(ppo, ppoQ), sub: t('before ads', 'বিজ্ঞাপনের আগে') },
        { label: t('Ad spend', 'বিজ্ঞাপন খরচ'), value: F.tk(p.ads), delta: dl(p.ads, pp.ads, true) },
        { label: t('Return costs', 'রিটার্ন খরচ'), value: F.tk(p.returns), delta: dl(p.returns, pp.returns, true) },
        { label: t('Products losing money', 'ক্ষতির প্রোডাক্ট'), value: F.num(losers.length) },
      ]) + `<div class="grid g3">${U.card(t('Margin, week by week', 'সপ্তাহ অনুযায়ী মার্জিন'), main, { cls: 'span2', sub: t('Last 8 weeks, in %. Net margin is after ads and office costs.', 'গত 8 সপ্তাহ, % হিসেবে। নিট মার্জিন বিজ্ঞাপন ও অফিস খরচের পরে।') })}${U.card(t('Profit by channel', 'চ্যানেল অনুযায়ী লাভ'), A.chart.bars({ items: Object.values(byCh).sort((a, b) => b.profit - a.profit).map((x, i) => ({ label: `${chName(x.k)} · ${F.pct(x.m, 0)}`, value: x.profit, color: COLS[i] })) }), { sub: t('Before ads and office costs', 'বিজ্ঞাপন ও অফিস খরচের আগে') })}</div>` +
        U.callout(`${t('This page explains where profit comes from. The full profit & loss statement (every cost line) is in Finance.', 'এই পাতা দেখায় লাভ কোথা থেকে আসে। পুরো লাভ-ক্ষতির হিসাব (প্রতিটা খরচের খাত) হিসাব পেজে।')} <a href="${A.href('finance', 'pnl')}"><b>${t('Open profit & loss', 'লাভ-ক্ষতি খুলুন')} →</b></a>`, 'info', 'info') +
        `<div class="grid g2">${U.card(t('By category', 'ক্যাটাগরি অনুযায়ী'), pcols('pr-cat', t('Category', 'ক্যাটাগরি'), (c) => catName(c), Object.values(byCat), byCatQ, (x) => { S.f.cat = x.k; A.toast(t('Filtered: ', 'ফিল্টার: ') + catName(x.k)); draw(); }), { sub: t('Click a category to filter the whole page', 'পুরো পাতা ফিল্টার করতে ক্যাটাগরিতে চাপুন') })}${U.card(t('By area (division)', 'এলাকা অনুযায়ী (বিভাগ)'), pcols('pr-div', t('Division', 'বিভাগ'), (d) => divName(d), Object.values(byDiv), byDivQ, (x) => A.go('reports', 'areas')), { sub: t('Returns and courier cost lower the margin outside Dhaka', 'ঢাকার বাইরে রিটার্ন ও কুরিয়ার খরচে মার্জিন কমে') })}</div>` +
        `<div class="grid g2">${U.card(t('By style', 'স্টাইল অনুযায়ী'), pcols('pr-st', t('Style', 'স্টাইল'), stName, Object.values(byStyle), null, (x) => { A.go('reports', 'products'); }, { limit: 8 }), { sub: t('All colours and versions of a style together', 'একটা স্টাইলের সব রং ও ভার্সন একসাথে') })}${U.card(t('By product', 'প্রোডাক্ট অনুযায়ী'), pcols('pr-pd', t('Product', 'প্রোডাক্ট'), pName, prods, null, (x) => goProduct(x.k), { limit: 8 }), { sub: t('Sort by profit ▲ to see the ones losing money', 'ক্ষতির প্রোডাক্ট দেখতে লাভ ▲ দিয়ে সাজান') })}</div>`;
    } });
  }

  /* ================= MONTHLY REVIEW ================= */
  if (!S.rv) S.rv = 'lastmonth';
  function rReview(el, r0) {
    const MON = { lastmonth: [t('October 2026', 'অক্টোবর 2026'), new Date('2026-10-01T00:00:00+06:00').getTime(), new Date('2026-11-01T00:00:00+06:00').getTime(), new Date('2026-09-14T00:00:00+06:00').getTime(), new Date('2026-10-01T00:00:00+06:00').getTime(), t('September', 'সেপ্টেম্বর')], month: [t('November 2026 so far', 'নভেম্বর 2026 (এ পর্যন্ত)'), new Date('2026-11-01T00:00:00+06:00').getTime(), A.TODAY.getTime(), new Date('2026-10-01T00:00:00+06:00').getTime(), new Date('2026-11-01T00:00:00+06:00').getTime(), t('October', 'অক্টোবর')] };
    const M = MON[S.rv];
    frame(el, r0, 'review', { title: t('Monthly review', 'মাসের রিভিউ') + ' · ' + M[0], sub: t('Last month on one page: what went well, what went badly, what to do next', 'গত মাস এক পাতায়: কী ভালো হলো, কী খারাপ, এরপর কী করবেন'), bar: false, body: () => {
      const [, from, to, pf, pt, pname] = M; const days = (to - from) / DAY, pdays = (pt - pf) / DAY;
      const saveF = { ...S.f }; for (const kk of Object.keys(S.f)) S.f[kk] = 'all';
      const k = kp(from, to), q = kp(pf, pt); const P = C.pnl(from, to), PQ = C.pnl(pf, pt);
      const perDay = (v, d) => v / (d || 1);
      const dd = (a, b, inv) => A.delta(perDay(a, days), perDay(b, pdays), inv);
      const cs = profitBy(k.os, (l) => catOf(l)), cq = profitBy(q.os, (l) => catOf(l));
      const growth = Object.values(cs).filter((x) => x.sales > 5000).map((x) => ({ ...x, g: chg(perDay(x.sales, days), perDay((cq[x.k] || { sales: 0 }).sales, pdays)) })).filter((x) => x.g != null).sort((a, b) => b.g - a.g);
      const ch = profitBy(k.os, (l, o) => o.channel); const bestCh = Object.values(ch).sort((a, b) => b.profit - a.profit)[0];
      const ls = lineSales(k.os); const top = Object.values(ls).sort((a, b) => b.qty - a.qty)[0]; const topP = top && A.byId(A.D.products, top.pid);
      const badD = finishedBy(k.os, (o) => o.district, 5)[0];
      const low = Object.values(cs).filter((x) => x.sales > 3000).sort((a, b) => a.m - b.m)[0];
      const live = A.D.products.filter((p) => p.status === 'live');
      const dead = live.filter((p) => !(ls[p.id]) && A.sum(p.variants, (v) => v.stock) > 30);
      const deadCash = A.sum(dead, (p) => p.cost * A.sum(p.variants, (v) => v.stock));
      const restock = live.filter((p) => shortSizes(p).length);
      const exch = k.os.filter((o) => o.status === 'exchanged'); const sizeEx = exch.filter((o) => exReason(o)[0].startsWith('Size'));
      const camps = A.D.campaigns || [];
      const good = [
        I2(t(`Delivered sales ${F.tk(P.revenue)} and net profit ${F.tk(P.net)} (${F.pct(P.margin)} of sales). Per day that is ${F.tk(perDay(P.revenue, days))} in sales, ${sg(chg(perDay(P.revenue, days), perDay(PQ.revenue, pdays)))} vs ${pname}.`, `ডেলিভারড বিক্রি ${F.tk(P.revenue)}, নিট লাভ ${F.tk(P.net)} (বিক্রির ${F.pct(P.margin)})। দিনে গড়ে ${F.tk(perDay(P.revenue, days))} বিক্রি, ${pname}-এর তুলনায় ${sg(chg(perDay(P.revenue, days), perDay(PQ.revenue, pdays)))}।`), 'good'),
        growth[0] ? I2(t(`${catName(growth[0].k)} grew fastest: ${sg(growth[0].g)} per day, ${F.tk(growth[0].sales)} delivered at ${F.pct(growth[0].m, 0)} margin.`, `সবচেয়ে বেশি বেড়েছে ${catName(growth[0].k)}: দিনে ${sg(growth[0].g)}, ${F.pct(growth[0].m, 0)} মার্জিনে ${F.tk(growth[0].sales)} ডেলিভারড।`), 'good') : null,
        topP ? I2(t(`Best seller: ${topP.name}, ${top.qty} pieces. ${bestCh ? chName(bestCh.k) + ' was the most profitable channel (' + F.tk(bestCh.profit) + ' before ads).' : ''}`, `সেরা বিক্রি: ${topP.name}, ${top.qty} পিস। ${bestCh ? 'সবচেয়ে লাভের চ্যানেল ' + chName(bestCh.k) + ' (বিজ্ঞাপনের আগে ' + F.tk(bestCh.profit) + ')।' : ''}`), 'good') : null,
      ].filter(Boolean);
      const bad = [
        badD ? I2(t(`${badD.k} sent back ${F.pct(badD.rate, 0)} of ${badD.n} parcels (shop average ${F.pct(k.returnRate)}). Returns cost ${F.tk(P.returns)} in courier fees this month.`, `${badD.k} থেকে ${badD.n}টি পার্সেলের ${F.pct(badD.rate, 0)} ফেরত এসেছে (গড় ${F.pct(k.returnRate)})। এই মাসে রিটার্নে কুরিয়ার খরচ ${F.tk(P.returns)}।`), 'bad') : null,
        low ? I2(t(`${catName(low.k)} kept only ${F.pct(low.m, 0)} of sales as profit before ads.`, `${catName(low.k)}-এ বিক্রির মাত্র ${F.pct(low.m, 0)} বিজ্ঞাপনের আগে লাভ ছিল।`), 'bad') : null,
        dead.length ? I2(t(`${dead.length} products sold nothing; ${F.tk(deadCash)} of buying price is sitting in that stock.`, `${dead.length}টি প্রোডাক্ট একটাও বিক্রি হয়নি; সেই স্টকে কেনা দামে ${F.tk(deadCash)} আটকে আছে।`), 'bad') : null,
        sizeEx.length ? I2(t(`${sizeEx.length} of ${exch.length} exchanges were about size.`, `${exch.length}টি এক্সচেঞ্জের ${sizeEx.length}টি সাইজের কারণে।`), 'bad') : null,
      ].filter(Boolean).slice(0, 3);
      const todo = [
        restock.length ? [t(`Restock ${restock.length} products whose selling sizes are running out, before the winter rush.`, `শীতের ভিড়ের আগে ${restock.length}টি প্রোডাক্ট আবার আনুন, যাদের চলতি সাইজ শেষ হচ্ছে।`), AC('Open stock', 'স্টক খুলুন', 'products', 'stock')] : null,
        dead.length ? [t(`Put the ${dead.length} unsold products into combos or a small discount to free ${F.tkShort(deadCash)}.`, `বিক্রি না হওয়া ${dead.length}টি প্রোডাক্ট কম্বো বা ছোট ছাড়ে দিন, ${F.tkShort(deadCash)} ছাড়ান।`), AC('Make combos', 'কম্বো বানান', 'products', 'combos')] : null,
        badD ? [t(`Ask for the delivery charge in advance in ${badD.k} and other high-return areas.`, `${badD.k} ও বেশি রিটার্নের এলাকায় আগে ডেলিভারি চার্জ নিন।`), AC('Open rules', 'নিয়ম খুলুন', 'rules', 'all')] : null,
        [t('Move ad money from campaigns under 1.5× to the best one.', '1.5×-এর নিচের ক্যাম্পেইন থেকে বিজ্ঞাপনের টাকা সেরাটায় সরান।'), AC('Campaigns', 'ক্যাম্পেইন', 'marketing', 'campaigns')],
      ].filter(Boolean).slice(0, 3);
      const li = (x) => `<li><span style="color:${x.tone === 'b' ? 'var(--bad)' : 'var(--good)'}">●</span> ${x.text}</li>`;
      const numbers = [[t('Delivered sales', 'ডেলিভারড বিক্রি'), 'revenue'], [t('Product cost', 'প্রোডাক্টের খরচ'), 'cogs', 1], [t('Courier, COD, packing & fees', 'কুরিয়ার, COD, প্যাকিং ও ফি'), 'x', 1], [t('Return costs', 'রিটার্ন খরচ'), 'returns', 1], [t('Ad spend', 'বিজ্ঞাপন খরচ'), 'ads', 1], [t('Office costs', 'অফিস খরচ'), 'y', 1], [t('Net profit', 'নিট লাভ'), 'net']];
      const val = (p, kk) => (kk === 'x' ? p.courier + p.cod + p.packaging + p.gateway : kk === 'y' ? p.fixed + p.other : p[kk]);
      const out = `<div class="card row between rep-bar" style="gap:10px">${U.seg('rv-m', [['lastmonth', t('October', 'অক্টোবর')], ['month', t('November so far', 'নভেম্বর (এ পর্যন্ত)')]], S.rv)}<span class="small muted">${t(`Compared per day with ${pname}${S.rv === 'lastmonth' ? ' (records start 14 Sep)' : ''}`, `${pname}-এর সাথে দিনের গড়ে তুলনা${S.rv === 'lastmonth' ? ' (রেকর্ড 14 সেপ্টেম্বর থেকে)' : ''}`)}</span><span class="grow"></span><span class="row rep-btns" style="gap:8px"><button class="btn sm" id="rv-pdf">${A.icon('print')} PDF</button><button class="btn sm" id="rep-sch">${A.icon('send')} ${subOf('review') ? t('Scheduled', 'শিডিউল চালু') : t('Every month', 'প্রতি মাসে')}</button><button class="btn sm primary" id="rv-tg">${A.icon('send')} ${t('Send to Telegram', 'টেলিগ্রামে পাঠান')}</button></span></div>` +
        kpis([
          { label: t('Delivered sales', 'ডেলিভারড বিক্রি'), value: F.tk(P.revenue), delta: dd(P.revenue, PQ.revenue), sub: t('▲▼ per day', '▲▼ দিনের গড়ে') },
          { label: t('Net profit', 'নিট লাভ'), value: F.tk(P.net), delta: dd(P.net, PQ.net), sub: F.pct(P.margin) },
          { label: t('Orders', 'অর্ডার'), value: F.num(k.orders), delta: dd(k.orders, q.orders), sub: F.num(k.pieces) + t(' pieces', ' পিস') },
          { label: t('Return rate', 'রিটার্নের হার'), value: F.pct(k.returnRate), delta: A.delta(k.returnRate, q.returnRate, true) },
        ]) +
        `<div class="grid g3 rep-rv">${U.card('', `<h4>${U.badge(t('Went well', 'ভালো হলো'), 'good')}</h4><ul style="list-style:none;padding:0">${good.map(li).join('')}</ul>`)}${U.card('', `<h4>${U.badge(t('Went badly', 'খারাপ হলো'), 'bad')}</h4><ul style="list-style:none;padding:0">${bad.map(li).join('') || `<li>${t('Nothing serious.', 'বড় কোনো সমস্যা নেই।')}</li>`}</ul>`)}${U.card('', `<h4>${U.badge(t('3 things to do next month', 'আগামী মাসে 3টা কাজ'), 'accent')}</h4><ol>${todo.map((x) => `<li>${x[0]}<br><a class="btn sm" href="${A.href(x[1][1], x[1][2], x[1][3])}">${x[1][0]} →</a></li>`).join('')}</ol>`)}</div>` +
        U.card(t('The month in numbers', 'সংখ্যায় মাসটা'), `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Line', 'খাত')}</th><th class="r">${M[0]}</th><th class="r hide-sm">${pname}</th></tr></thead><tbody>${numbers.map((n) => `<tr style="${n[1] === 'net' ? 'font-weight:700;background:var(--card2)' : ''}"><td style="${n[2] ? 'padding-left:22px' : ''}">${n[0]}</td><td class="r">${F.tk(n[2] ? -val(P, n[1]) : val(P, n[1]))}</td><td class="r hide-sm muted">${F.tk(n[2] ? -val(PQ, n[1]) : val(PQ, n[1]))}</td></tr>`).join('')}</tbody></table></div><div class="small muted" style="margin-top:8px">${t('Same figures as Finance › Profit & loss for these dates.', 'এই তারিখের হিসাব › লাভ-ক্ষতির একই সংখ্যা।')} <a href="${A.href('finance', 'pnl')}">${t('Open Finance', 'হিসাবে যান')}</a></div>`, { more: t('All reports', 'সব রিপোর্ট'), moreHref: A.href('reports', 'overview') });
      Object.assign(S.f, saveF);
      return out;
    } });
    A.on(el, '#rv-m button', 'click', (e, b) => { S.rv = b.dataset.v; draw(); });
    el.querySelector('#rv-pdf').onclick = () => reportFile('review', t('Monthly review', 'মাসের রিভিউ') + ' · ' + M[0], 'pdf');
    el.querySelector('#rv-tg').onclick = () => { A.commit('Monthly review sent to Telegram: ' + M[0]); A.toast(t('Review sent to your Telegram with the PDF', 'রিভিউ PDF সহ আপনার টেলিগ্রামে গেছে'), 'good'); };
  }

  /* ---------------- products: style profit & restock tree ---------------- */
  function styleTree(k) {
    const ls = lineSales(k.os); const pp = profitBy(k.os, (l) => l.pid);
    const pool = A.D.products.filter((p) => p.status === 'live' && (!on('cat') || p.cat === S.f.cat));
    const node = (p) => { const s = ls[p.id] || { qty: 0, value: 0 }; const pr = pp[p.id] || { profit: 0, sales: 0 }; const x = { p, sold: s.qty, sold30: p.sold30, short: shortSizes(p).length, rev: s.value, profit: pr.profit, sales: pr.sales, m: pc(pr.profit, pr.sales), days: C.stockDays(p) }; x.v = verdict(x); return x; };
    const agg = (xs) => { const sold = A.sum(xs, (x) => x.sold), rev = A.sum(xs, (x) => x.rev), profit = A.sum(xs, (x) => x.profit), sales = A.sum(xs, (x) => x.sales); const stock = A.sum(xs, (x) => A.sum(x.p.variants, (v) => v.stock)), per = A.sum(xs, (x) => x.p.sold30) / 30; const vc = {}; xs.forEach((x) => (vc[x.v[0]] = (vc[x.v[0]] || 0) + 1)); return { sold, rev, profit, m: pc(profit, sales), days: per ? Math.round(stock / per) : 999, vc }; };
    const vcHtml = (vc) => ['restock', 'bulk', 'stop'].filter((v) => vc[v]).map((v) => U.badge(vc[v] + ' ' + { restock: t('restock', 'আনুন'), bulk: t('bulk', 'বেশি'), stop: t('stop', 'বন্ধ') }[v], { restock: 'bad', bulk: 'good', stop: 'dark' }[v])).join(' ') || `<span class="muted small">${t('Keep', 'চালু রাখুন')}</span>`;
    const dTxt = (d) => (d >= 999 ? '—' : d + t(' d', ' দিন'));
    const row = (lvl, key, name, a, verdictHtml, open) => `<div class="tr l${lvl} ${open ? 'open' : ''}" data-tk="${A.esc(key)}"><span class="nm">${lvl < 2 ? `<span class="car">▸</span>` : ''}${name}</span><span>${F.num(a.sold)}</span><span class="hs">${F.tkShort(a.rev)}</span><span class="hs">${F.tkShort(a.profit)}</span><span class="hs" style="color:${a.m >= 35 ? 'var(--good)' : a.m >= 20 ? 'inherit' : 'var(--bad)'}">${a.sold ? F.pct(a.m, 0) : '—'}</span><span>${dTxt(a.days)}</span><span>${verdictHtml}</span></div>`;
    let html = `<div class="tr h"><span>${t('Category › style › product', 'ক্যাটাগরি › স্টাইল › প্রোডাক্ট')}</span><span>${t('Sold', 'বিক্রি')}</span><span class="hs">${t('Revenue', 'বিক্রির টাকা')}</span><span class="hs">${t('Profit', 'লাভ')}</span><span class="hs">${t('Margin', 'মার্জিন')}</span><span>${t('Stock left', 'স্টক চলবে')}</span><span>${t('Verdict', 'সিদ্ধান্ত')}</span></div>`;
    const counts = { restock: 0, bulk: 0, stop: 0 };
    for (const c of A.CATS) {
      const ps = pool.filter((p) => p.cat === c.id); if (!ps.length) continue; const xs = ps.map(node); xs.forEach((x) => { if (counts[x.v[0]] != null) counts[x.v[0]]++; });
      const ck = 'c:' + c.id; const co = !!S.open[ck];
      html += row(0, ck, `<b>${t(c.en, c.bn)}</b><span class="muted small">${ps.length}</span>`, agg(xs), vcHtml(agg(xs).vc), co);
      if (!co) continue;
      const groups = A.groupBy(xs, (x) => styleOf(x.p));
      for (const [st, gx] of Object.entries(groups).sort((a, b) => agg(b[1]).rev - agg(a[1]).rev)) {
        const sk = 's:' + c.id + ':' + st; const so = !!S.open[sk]; const ga = agg(gx);
        html += row(1, sk, `<b>${A.esc(st)}</b><span class="muted small">${gx.length}</span>`, ga, vcHtml(ga.vc), so);
        if (!so) continue;
        for (const x of gx.sort((a, b) => b.rev - a.rev)) html += row(2, 'p:' + x.p.id, `${U.sw2 ? U.sw2(x.p.colors.slice(0, 3)) : ''}<em>${A.esc(x.p.name)}</em>`, { sold: x.sold, rev: x.rev, profit: x.profit, m: x.m, days: x.days }, U.badge(x.v[1], x.v[2]), false);
      }
    }
    const rules = `<div class="rep-rules"><span>${U.badge(t('Restock', 'আবার আনুন'), 'bad')} ${t(`sold ${VR.restockSold}+ in the period and a selling size runs out within 14 days (or under ${VR.restockDays} days of stock)`, `এই সময়ে ${VR.restockSold}+ বিক্রি, আর চলতি কোনো সাইজ 14 দিনে শেষ হবে (বা স্টক ${VR.restockDays} দিনের কম)`)}</span><span>${U.badge(t('Buy in bulk', 'বেশি করে আনুন'), 'good')} ${t(`${VR.bulkSold}+ sold in 30 days at ${VR.bulkMargin}%+ margin`, `30 দিনে ${VR.bulkSold}+ বিক্রি, মার্জিন ${VR.bulkMargin}%+`)}</span><span>${U.badge(t('Stop', 'বন্ধ করুন'), 'dark')} ${t(`${VR.stopSold} or fewer sold and ${VR.stopDays}+ days of stock, or margin under ${VR.stopMargin}%`, `${VR.stopSold}টা বা কম বিক্রি ও ${VR.stopDays}+ দিনের স্টক, বা মার্জিন ${VR.stopMargin}%-এর কম`)}</span></div>`;
    return { counts, html: U.card(t('Style profit & restock', 'স্টাইলের লাভ ও রিস্টক'), rules + `<div class="rep-tree">${html}</div><div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn sm" id="tree-all">${t('Open all', 'সব খুলুন')}</button><button class="btn sm ghost" id="tree-none">${t('Close all', 'সব বন্ধ')}</button></div>`, { sub: t('Click a category, then a style, to see each product. Click a product to open it.', 'ক্যাটাগরিতে চাপুন, তারপর স্টাইলে, প্রতিটা প্রোডাক্ট দেখবেন। প্রোডাক্ট খুলতে চাপুন।') }) };
  }
  function wireTree(el) {
    A.on(el, '.rep-tree .tr[data-tk]', 'click', (e, r) => { const kk = r.dataset.tk; if (kk.startsWith('p:')) { goProduct(kk.slice(2)); return; } S.open[kk] = !S.open[kk]; draw(); });
    const a = el.querySelector('#tree-all'); if (a) a.onclick = () => { for (const p of A.D.products) { S.open['c:' + p.cat] = true; S.open['s:' + p.cat + ':' + styleOf(p)] = true; } draw(); };
    const n = el.querySelector('#tree-none'); if (n) n.onclick = () => { S.open = {}; draw(); };
  }

  /* ---------------- delivery: returns by size and product, partial deliveries, exchange reasons ---------------- */
  function deliveryExtra(k) {
    const sz = {}, pr = {};
    for (const o of k.os) { const d = C.isDelivered(o), rt = o.status === 'returned'; if (!d && !rt) continue; for (const l of o.lines) { if (!lineOk(l)) continue; sz[l.size] = sz[l.size] || { k: l.size, fin: 0, ret: 0 }; sz[l.size].fin += l.qty; pr[l.pid] = pr[l.pid] || { k: l.pid, fin: 0, ret: 0 }; pr[l.pid].fin += l.qty; if (rt) { sz[l.size].ret += l.qty; pr[l.pid].ret += l.qty; } } }
    const ORD = ['S', 'M', 'L', 'XL', 'XXL', '30', '32', '34', '36', '38', 'Free'];
    const sizes = Object.values(sz).filter((x) => x.fin >= 3).sort((a, b) => ORD.indexOf(a.k) - ORD.indexOf(b.k));
    const prods = Object.values(pr).filter((x) => x.fin >= 3 && x.ret).map((x) => ({ ...x, rate: pc(x.ret, x.fin), p: A.byId(A.D.products, x.k) })).filter((x) => x.p).sort((a, b) => b.rate - a.rate);
    const part = k.del.filter(isPartial).map((o) => { const back = 1; const unit = Math.max(...o.lines.map((l) => l.price)); return { ...o, _id: o.id, kept: C.pieces(o) - back, back, lost: unit }; });
    const ex = k.os.filter((o) => o.status === 'exchanged').map((o) => ({ o, r: exReason(o), p: A.byId(A.D.products, o.lines[0].pid) })).filter((x) => x.p);
    const byStyle = Object.values(A.groupBy(ex, (x) => styleOf(x.p))).map((xs) => { const rs = A.groupBy(xs, (x) => x.r[0]); const top = Object.entries(rs).sort((a, b) => b[1].length - a[1].length)[0]; const sizeN = xs.filter((x) => x.r[0].startsWith('Size')).length; const small = xs.filter((x) => x.r[0] === 'Size too small').length; return { st: styleOf(xs[0].p), cat: xs[0].p.cat, pid: xs[0].p.id, n: xs.length, top: xs.find((x) => x.r[0] === top[0]).r, size: pc(sizeN, xs.length), small, big: sizeN - small }; });
    const exR = Object.values(A.groupBy(ex, (x) => x.r[0])).map((xs) => ({ label: t(xs[0].r[0], xs[0].r[1]), value: xs.length })).sort((a, b) => b.value - a.value);
    const sizeBars = A.chart.bars({ items: sizes.map((x) => { const r = pc(x.ret, x.fin); return { label: `${x.k} · ${x.fin} ${t('pcs', 'পিস')}`, value: r, text: F.pct(r, 0), color: r > 12 ? 'var(--bad)' : 'var(--c4)' }; }), max: 25 });
    return `<div class="grid g3">${U.card(t('Returns by size', 'সাইজ অনুযায়ী রিটার্ন'), sizeBars || U.empty(t('No returns', 'কোনো রিটার্ন নেই')), { sub: t('Share of pieces sent that came back', 'যত পিস গেছে তার কত ভাগ ফেরত') })}${U.card(t('Returns by product', 'প্রোডাক্ট অনুযায়ী রিটার্ন'), stbl('dl-rp', [
      { h: t('Product', 'প্রোডাক্ট'), v: (x) => x.p.name, f: (x) => `<span class="row" style="gap:8px;flex-wrap:nowrap">${U.thumb(x.p, 28)}<span class="ellip" style="max-width:150px">${A.esc(x.p.name)}</span></span>` },
      { h: t('Back', 'ফেরত'), r: 1, v: (x) => x.ret, f: (x) => `${x.ret}/${x.fin}` },
      { h: '%', r: 1, v: (x) => x.rate, f: (x) => `<b style="color:${x.rate > 15 ? 'var(--bad)' : 'inherit'}">${F.pct(x.rate, 0)}</b>` },
    ], prods, { sort: [2, 'desc'], limit: 6, onRow: (x) => goProduct(x.p.id), empty: t('No returns worth flagging', 'চোখে পড়ার মতো রিটার্ন নেই') }))}${U.card(t('Partial deliveries', 'আংশিক ডেলিভারি'), `<div class="rep-mini" style="margin-bottom:10px"><div><b>${part.length}</b><span>${t('orders', 'অর্ডার')}</span></div><div><b>${A.sum(part, (x) => x.back)}</b><span>${t('pieces sent back', 'পিস ফেরত')}</span></div><div><b>${F.tkShort(A.sum(part, (x) => x.lost))}</b><span>${t('sale lost', 'বিক্রি কমেছে')}</span></div></div>` + stbl('dl-part', [
      { h: t('Order', 'অর্ডার'), v: (x) => x.id, f: (x) => `<b>${x.id}</b><div class="small muted">${A.esc(x.district)}</div>` },
      { h: t('Kept', 'রেখেছেন'), r: 1, v: (x) => x.kept, f: (x) => `${x.kept}/${C.pieces(x)}` },
      { h: t('Lost', 'কমেছে'), r: 1, v: (x) => x.lost, f: (x) => F.tk(x.lost) },
    ], part, { sort: [2, 'desc'], limit: 5, onRow: (x) => A.go('orders', 'all', x.id), empty: t('No partial deliveries', 'কোনো আংশিক ডেলিভারি নেই') }), { sub: t('Counted as delivered, shown apart', 'ডেলিভারড ধরা হয়, আলাদা দেখানো') })}</div>` +
    `<div class="grid g3">${U.card(t('Exchange reasons', 'এক্সচেঞ্জের কারণ'), A.chart.bars({ items: exR.map((x, i) => ({ ...x, text: String(x.value), color: COLS[i] })), money: false }) || U.empty(t('No exchanges', 'কোনো এক্সচেঞ্জ নেই')))}${U.card(t('Size problems by style', 'স্টাইল অনুযায়ী সাইজের সমস্যা'), stbl('dl-ex', [
      { h: t('Style', 'স্টাইল'), v: (x) => x.st, f: (x) => `<b>${A.esc(x.st)}</b><div class="small muted">${catName(x.cat)}</div>` },
      { h: t('Exchanges', 'এক্সচেঞ্জ'), r: 1, v: (x) => x.n, f: (x) => F.num(x.n) },
      { h: t('Top reason', 'প্রধান কারণ'), hide: 1, f: (x) => t(x.top[0], x.top[1]) },
      { h: t('Runs', 'সাইজ চলে'), r: 1, v: (x) => x.small - x.big, f: (x) => (x.small > x.big ? U.badge(t('Small', 'ছোট'), 'warn') : x.big > x.small ? U.badge(t('Big', 'বড়'), 'info') : '—') },
    ], byStyle, { sort: [1, 'desc'], limit: 6, onRow: (x) => A.go('products', 'sizecharts'), empty: t('No exchanges in this period', 'এই সময়ে কোনো এক্সচেঞ্জ নেই') }) + `<a class="btn sm" style="margin-top:10px" href="${A.href('products', 'sizecharts')}">${t('Fix size charts', 'সাইজ চার্ট ঠিক করুন')} →</a>`, { cls: 'span2', sub: t('If a style "runs small", add a note on its size chart: "take one size up"', 'কোনো স্টাইল "ছোট চলে" হলে সাইজ চার্টে লিখুন: "এক সাইজ বড় নিন"') })}</div>`;
  }

  /* ---------------- customers: grades and cohorts ---------------- */
  function customerExtra(k, custs) {
    const buyers = custs.filter((c) => c.orders > 0);
    const gs = {}; for (const c of buyers) { const g = gradeOf(c); const key = g.idx; gs[key] = gs[key] || { g, cs: [], sales: 0, orders: 0 }; gs[key].cs.push(c); }
    const gi = {}; for (const [key, x] of Object.entries(gs)) for (const c of x.cs) gi[c.id] = key;
    for (const o of k.del) { const key = gi[o.customerId]; if (key != null && gs[key]) gs[key].sales += o.total; }
    for (const o of k.live) { const key = gi[o.customerId]; if (key != null && gs[key]) gs[key].orders++; }
    const grows = Object.values(gs).map((x) => ({ ...x, n: x.cs.length, ltv: A.sum(x.cs, (c) => c.spent) / x.cs.length, rep: pc(x.cs.filter((c) => c.orders >= 2).length, x.cs.length) })).sort((a, b) => b.g.idx - a.g.idx);
    const totalSales = A.sum(grows, (x) => x.sales) || 1;
    // cohorts: share of each first-order month's customers who ordered again in that month, the next and the one after
    const first = {}; const byC = {}; for (const o of A.D.orders) { if (o.status === 'cancelled') continue; (byC[o.customerId] = byC[o.customerId] || []).push(o); if (!first[o.customerId] || o.created < first[o.customerId]) first[o.customerId] = o.created; }
    const mIdx = (iso) => { const d = new Date(new Date(iso).getTime() + 6 * 36e5); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
    const MN = { 8: ['September', 'সেপ্টেম্বর'], 9: ['October', 'অক্টোবর'], 10: ['November', 'নভেম্বর'] };
    const coh = {}; for (const c of buyers) { const f = first[c.id]; if (!f) continue; const m = mIdx(f); coh[m] = coh[m] || { m, n: 0, back: [0, 0, 0], ltv: 0 }; coh[m].n++; coh[m].ltv += c.spent; const later = (byC[c.id] || []).filter((o) => o.created !== f); for (let i = 0; i < 3; i++) if (later.some((o) => mIdx(o.created) === m + i)) coh[m].back[i]++; }
    const nowM = mIdx(A.TODAY.toISOString());
    const cohRows = Object.values(coh).sort((a, b) => a.m - b.m);
    const cell = (c, i) => { if (c.m + i > nowM) return '<td class="h muted">·</td>'; const p = pc(c.back[i], c.n); return `<td class="h" style="background:color-mix(in srgb, var(--accent) ${Math.round(Math.min(100, p * 3))}%, var(--card))${p > 22 ? ';color:var(--accent-ink)' : ''}">${F.pct(p, 0)}</td>`; };
    const cohHtml = `<div class="tbl-wrap"><table class="tbl rep-coh"><thead><tr><th>${t('First order', 'প্রথম অর্ডার')}</th><th class="r">${t('Customers', 'কাস্টমার')}</th><th class="r">${t('Same month', 'একই মাসে')}</th><th class="r">${t('Month +1', 'পরের মাসে')}</th><th class="r">${t('Month +2', '2 মাস পরে')}</th><th class="r hide-sm">${t('Avg value', 'গড় মূল্য')}</th></tr></thead><tbody>${cohRows.map((c) => `<tr><td><b>${t(...(MN[c.m % 12] || [String(c.m), String(c.m)]))}</b></td><td class="r">${c.n}</td>${cell(c, 0)}${cell(c, 1)}${cell(c, 2)}<td class="r hide-sm">${F.tk(c.ltv / c.n)}</td></tr>`).join('')}</tbody></table></div><div class="small muted" style="margin-top:8px">${t('Share of each month\'s new customers who ordered again. Records start 14 September.', 'প্রতি মাসের নতুন কাস্টমারের কত ভাগ আবার অর্ডার করেছেন। রেকর্ড 14 সেপ্টেম্বর থেকে।')}</div>`;
    const gHtml = stbl('cu-grade', [
      { h: t('Grade', 'গ্রেড'), v: (x) => x.g.idx, f: (x) => `<b>${A.esc(x.g.name)}</b><div class="small muted">${x.n} ${t('customers', 'কাস্টমার')}</div>` },
      { h: t('Sales (delivered)', 'বিক্রি (ডেলিভারড)'), r: 1, v: (x) => x.sales, f: (x) => `${F.tk(x.sales)}<div class="small muted">${F.pct(pc(x.sales, totalSales), 0)}</div>` },
      { h: t('Orders', 'অর্ডার'), r: 1, hide: 1, v: (x) => x.orders, f: (x) => F.num(x.orders) },
      { h: t('Lifetime value', 'মোট মূল্য (গড়)'), r: 1, v: (x) => x.ltv, f: (x) => F.tk(x.ltv) },
      { h: t('Repeat', 'আবার কেনেন'), r: 1, hide: 1, v: (x) => x.rep, f: (x) => F.pct(x.rep, 0) },
    ], grows, { sort: [0, 'desc'], onRow: () => A.go('customers', 'all') });
    return `<div class="grid g2">${U.card(t('Sales by grade', 'গ্রেড অনুযায়ী বিক্রি'), gHtml + `<a class="btn sm" style="margin-top:10px" href="${A.href('rules', 'all')}">${t('Grade offers in Rules', 'নিয়মে গ্রেডের অফার')} →</a>`, { sub: t('Grades come from lifetime spend and delivered parcels (Rules)', 'গ্রেড ঠিক হয় মোট কেনা ও ডেলিভারড পার্সেল দিয়ে (নিয়ম)') })}${U.card(t('Repeat rate by first-order month', 'প্রথম অর্ডারের মাস ধরে আবার কেনার হার'), cohHtml)}</div>`;
  }

  /* ---------------- team: chat → order ---------------- */
  /** A chat counts as converted when the customer placed an order within 48 hours after this person's reply. */
  function chatConv(from, to) {
    const m = {};
    for (const c of A.D.conversations) {
      const rep = c.msgs.filter((x) => x.from === 's' && C.inRange(x.t, from, to)); if (!rep.length) continue;
      const by = rep[rep.length - 1].by || 'Nusrat'; const t0 = new Date(rep[0].t).getTime();
      m[by] = m[by] || { chats: 0, orders: 0 }; m[by].chats++;
      if (A.D.orders.some((o) => o.customerId === c.customerId && new Date(o.created).getTime() >= t0 && new Date(o.created).getTime() <= t0 + 2 * DAY)) m[by].orders++;
    }
    return m;
  }


  /* ---------------- downloads: single reports, report packs, daily business report ---------------- */
  const PK_PER = () => [['lastmonth', t('Last month', 'গত মাস')], ['month', t('This month', 'এই মাস')], ['3m', t('Last 3 months', 'গত 3 মাস')], ['6m', t('Last 6 months', 'গত 6 মাস')], ['12m', t('Last 12 months', 'গত 12 মাস')]];
  const perRange = (key) => { if (key === 'month' || key === 'lastmonth') return C.range(key); const n = { '3m': 3, '6m': 6, '12m': 12 }[key] || 1; const to = new Date('2026-11-01T00:00:00+06:00').getTime(); const d = new Date('2026-11-01T00:00:00+06:00'); d.setUTCMonth(d.getUTCMonth() - n); return { from: d.getTime(), to }; };
  const stockValue = () => A.sum(A.D.products.filter((p) => p.status !== 'archived'), (p) => p.cost * A.sum(p.variants, (v) => v.stock));
  const stockPcs = () => A.sum(A.D.products.filter((p) => p.status !== 'archived'), (p) => A.sum(p.variants, (v) => v.stock));
  /** Monthly figures for trend parts (records start 14 Sep 2026). */
  const months = (r) => { const out = []; const d = new Date(r.from); while (d.getTime() < r.to) { const a = d.getTime(); const e = new Date(d); e.setUTCMonth(e.getUTCMonth() + 1); const b = Math.min(e.getTime(), r.to); const p = C.pnl(a, b); out.push({ label: F.date(a + 7 * 36e5).replace(/^\d+\s*/, ''), a, p, has: b > new Date('2026-09-14T00:00:00+06:00').getTime() }); d.setTime(e.getTime()); } return out; };
  /** One part of a pack: name + a one-line summary with real numbers. */
  const PART = {
    pnl: (r) => { const p = C.pnl(r.from, r.to); return [t('Profit & loss summary', 'লাভ-ক্ষতির সারাংশ'), t(`Revenue ${F.tk(p.revenue)} · gross ${F.tk(p.gross)} · net ${F.tk(p.net)} (${F.pct(p.margin)})`, `আয় ${F.tk(p.revenue)} · গ্রস ${F.tk(p.gross)} · নিট ${F.tk(p.net)} (${F.pct(p.margin)})`)]; },
    monthlypnl: (r) => [t('Monthly profit & loss', 'মাস অনুযায়ী লাভ-ক্ষতি'), months(r).filter((m) => m.has).map((m) => `${m.label}: ${F.tkShort(m.p.net)}`).join(' · ') || '—'],
    trend: (r) => [t('Sales & profit trend', 'বিক্রি ও লাভের ধারা'), months(r).filter((m) => m.has).map((m) => `${m.label} ${F.tkShort(m.p.revenue)}`).join(' · ') + t(' · months before 14 Sep 2026 are empty (no records)', ' · 14 সেপ্টেম্বর 2026-এর আগের মাস খালি (রেকর্ড নেই)')],
    sales: (r) => { const os = liveO(C.ordersIn(r.from, r.to)); return [t('Sales', 'বিক্রি'), t(`${os.length} orders · ${F.tk(A.sum(os, (o) => o.total))} order value · ${A.sum(os, C.pieces)} pieces`, `${os.length}টি অর্ডার · অর্ডারের মূল্য ${F.tk(A.sum(os, (o) => o.total))} · ${A.sum(os, C.pieces)} পিস`)]; },
    channels: (r) => { const g = A.groupBy(liveO(C.ordersIn(r.from, r.to)), (o) => o.channel); return [t('Sales by channel', 'চ্যানেল অনুযায়ী বিক্রি'), Object.keys(g).map((c) => `${chName(c)} ${F.tkShort(A.sum(g[c], (o) => o.total))}`).join(' · ')]; },
    cats: (r) => { const g = {}; for (const o of liveO(C.ordersIn(r.from, r.to))) for (const l of o.lines) { const c = catOf(l); g[c] = (g[c] || 0) + l.qty * l.price; } return [t('Sales by category', 'ক্যাটাগরি অনুযায়ী বিক্রি'), Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, v]) => `${catName(c)} ${F.tkShort(v)}`).join(' · ')]; },
    areas: (r) => { const g = A.groupBy(liveO(C.ordersIn(r.from, r.to)), (o) => DIV[o.district] || 'Dhaka'); return [t('Sales by area', 'এলাকা অনুযায়ী বিক্রি'), Object.keys(g).sort((a, b) => g[b].length - g[a].length).slice(0, 5).map((d) => `${divName(d)} ${g[d].length}`).join(' · ')]; },
    stockval: () => [t('Stock value', 'স্টকের মূল্য'), t(`${F.num(stockPcs())} pieces · ${F.tk(stockValue())} at buying price`, `${F.num(stockPcs())} পিস · কেনা দামে ${F.tk(stockValue())}`)],
    stocklist: () => [t('Stock list (product › colour › size)', 'স্টক লিস্ট (প্রোডাক্ট › রং › সাইজ)'), t(`${A.sum(A.D.products, (p) => p.variants.length)} rows from the ERP stock`, `ERP স্টক থেকে ${A.sum(A.D.products, (p) => p.variants.length)}টি সারি`)],
    restock: () => { const n = A.D.products.filter((p) => p.status === 'live' && shortSizes(p).length).length; return [t('Restock list', 'রিস্টক লিস্ট'), t(`${n} products with selling sizes running out`, `${n}টি প্রোডাক্টের চলতি সাইজ শেষ হচ্ছে`)]; },
    slow: () => { const n = A.D.products.filter((p) => p.status === 'live' && p.sold30 === 0).length; return [t('Slow stock', 'ধীর স্টক'), t(`${n} live products with no sale in 30 days`, `30 দিনে বিক্রি নেই এমন ${n}টি লাইভ প্রোডাক্ট`)]; },
    cash: () => { const cod = C.codWithCouriers(); return [t('Cash & money position', 'টাকার অবস্থা'), t(`COD with courier ${F.tk(A.sum(cod, (o) => o.total))} (${cod.length} parcels) · details in Finance`, `কুরিয়ারের কাছে COD ${F.tk(A.sum(cod, (o) => o.total))} (${cod.length}টি পার্সেল) · বিস্তারিত হিসাবে`)]; },
    cashflow: (r) => { const p = C.pnl(r.from, r.to); return [t('Cash flow', 'টাকার আসা-যাওয়া'), t(`Money in ${F.tk(p.revenue)} · product, courier and fees ${F.tk(p.revenue - p.gross)} · ads and office ${F.tk(p.ads + p.fixed + p.other)}`, `টাকা এসেছে ${F.tk(p.revenue)} · প্রোডাক্ট, কুরিয়ার ও ফি ${F.tk(p.revenue - p.gross)} · বিজ্ঞাপন ও অফিস ${F.tk(p.ads + p.fixed + p.other)}`)]; },
    erp: () => { const b = C.erpBalance(); return [t('ERP balance', 'ERP ব্যালেন্স'), t(`Bills ${F.tk(b.bills)} · credits ${F.tk(b.credits)} · paid ${F.tk(b.paid)} · owed ${F.tk(b.owed)}`, `বিল ${F.tk(b.bills)} · ক্রেডিট ${F.tk(b.credits)} · দেওয়া ${F.tk(b.paid)} · বাকি ${F.tk(b.owed)}`)]; },
    top: (r) => { const ls = lineSales(C.ordersIn(r.from, r.to)); return [t('Top products', 'সেরা প্রোডাক্ট'), Object.values(ls).sort((a, b) => b.value - a.value).slice(0, 3).map((x) => { const p = A.byId(A.D.products, x.pid); return `${p ? A.esc(p.name) : x.pid} (${x.qty})`; }).join(' · ')]; },
    returns: (r) => { const os = C.ordersIn(r.from, r.to); const ret = os.filter((o) => o.status === 'returned'), d = os.filter(C.isDelivered); return [t('Returns', 'রিটার্ন'), t(`${ret.length} parcels back · ${F.pct(pc(ret.length, ret.length + d.length))} return rate · cost ${F.tk(A.sum(ret, C.returnCost))}`, `${ret.length}টি পার্সেল ফেরত · রিটার্নের হার ${F.pct(pc(ret.length, ret.length + d.length))} · খরচ ${F.tk(A.sum(ret, C.returnCost))}`)]; },
    customers: (r) => { const ids = new Set(liveO(C.ordersIn(r.from, r.to)).map((o) => o.customerId)); return [t('Customer count', 'কাস্টমারের সংখ্যা'), t(`${F.num(A.D.customers.length)} customers on record · ${ids.size} bought in this period`, `রেকর্ডে ${F.num(A.D.customers.length)} জন কাস্টমার · এই সময়ে কিনেছেন ${ids.size} জন`)]; },
    legal: () => [t('Letterhead with shop legal details', 'দোকানের আইনি তথ্যসহ লেটারহেড'), `${A.esc(A.D.store.name)} · ${t('Trade licence', 'ট্রেড লাইসেন্স')} ${A.esc(A.D.store.tradeLicence || '—')} · ${A.esc(A.D.store.address)}`],
  };
  const PACKS = () => [
    { id: 'monthly', icon: 'reports', name: t('Monthly business pack', 'মাসিক ব্যবসার প্যাক'), for: t('For yourself or a partner, every month', 'নিজের বা পার্টনারের জন্য, প্রতি মাসে'), per: 'lastmonth', parts: ['pnl', 'sales', 'stockval', 'stocklist', 'cash', 'erp', 'top', 'returns'] },
    { id: 'bank', icon: 'finance', name: t('Bank pack', 'ব্যাংক প্যাক'), for: t('For a bank loan or credit application', 'ব্যাংক লোন বা ক্রেডিটের আবেদনের জন্য'), per: '12m', parts: ['legal', 'trend', 'monthlypnl', 'cashflow', 'stockval', 'customers'] },
    { id: 'stock', icon: 'box', name: t('Stock pack', 'স্টক প্যাক'), for: t('Stock count, value and what to buy', 'স্টকের হিসাব, মূল্য ও কী আনতে হবে'), per: 'month', parts: ['stockval', 'stocklist', 'restock', 'slow'] },
    { id: 'sales', icon: 'orders', name: t('Sales pack', 'বিক্রির প্যাক'), for: t('Sales by day, channel, category and area', 'দিন, চ্যানেল, ক্যাটাগরি ও এলাকা ধরে বিক্রি'), per: 'lastmonth', parts: ['sales', 'channels', 'cats', 'areas', 'top', 'returns'] },
  ];
  if (!S.pk) S.pk = {};
  const pkState = (p) => (S.pk[p.id] = S.pk[p.id] || { per: p.per, fmt: 'pdf' });
  /** Preview of what the PDF (letterhead) or Excel (one sheet per part) holds. */
  function previewFile(title, fmt, perLabel, parts, r) {
    const st = A.D.store; const rows = parts.map((k) => PART[k](r));
    const body = fmt === 'pdf'
      ? `<div class="card" style="padding:18px 20px"><div class="row between" style="border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:12px;gap:10px;flex-wrap:wrap"><span><b style="font:800 20px var(--f-head);letter-spacing:.06em">${A.esc(st.name)}</b><div class="small muted">${A.esc(st.address)}</div><div class="small muted">${A.esc(st.phone)} · ${A.esc(st.email)} · ${t('Trade licence', 'ট্রেড লাইসেন্স')} ${A.esc(st.tradeLicence || '—')}</div></span><span class="small" style="text-align:right"><b>${A.esc(title)}</b><div class="muted">${perLabel}</div><div class="muted">${t('Made', 'তৈরি')} ${F.dt(A.TODAY)}</div></span></div><ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:10px">${rows.map((x) => `<li><b>${x[0]}</b><div class="small muted">${x[1]}</div></li>`).join('')}</ol><div class="small muted" style="margin-top:14px;border-top:1px solid var(--line);padding-top:8px">${t('Page numbers and signature line at the bottom of every page. Figures match Finance.', 'প্রতি পাতার নিচে পাতার নম্বর ও সইয়ের জায়গা। সংখ্যা হিসাবের সাথে মেলে।')}</div></div>`
      : `<div class="small muted" style="margin-bottom:8px">${t(`One sheet per part · ${rows.length} sheets`, `প্রতি অংশে একটা শিট · ${rows.length}টি শিট`)}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Sheet', 'শিট')}</th><th>${t('What is in it', 'এতে কী আছে')}</th></tr></thead><tbody>${rows.map((x, i) => `<tr><td><span class="mono">${i + 1}</span> <b>${x[0]}</b></td><td class="small">${x[1]}</td></tr>`).join('')}</tbody></table></div>`;
    const file = `EXTAS · ${title} · ${perLabel}.${fmt === 'pdf' ? 'pdf' : 'xlsx'}`;
    U.modal(t('Preview: ', 'প্রিভিউ: ') + title, body, { wide: true, foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button><button class="btn" id="pv-print">${A.icon('print')} ${t('Print', 'প্রিন্ট')}</button><button class="btn primary" id="pv-dl">${A.icon('down')} ${t('Download', 'ডাউনলোড')}</button>`,
      onOpen: (m) => { m.querySelector('#pv-print').onclick = () => A.toast(t('Sent to the printer: ', 'প্রিন্টারে গেছে: ') + title, 'good'); m.querySelector('#pv-dl').onclick = () => { U.download(file); A.commit('Downloaded ' + file); } } });
    A.toast(t('Ready: ', 'তৈরি: ') + file, 'good');
  }
  /** This report as a file (Excel / PDF / Print). */
  function reportFile(tab, title, fmt) {
    const r = rng(); const per = periodText(r).split(' · ')[0];
    const parts = { sales: ['sales', 'channels', 'cats', 'top'], profit: ['pnl', 'cats', 'areas', 'top'], products: ['top', 'stockval', 'restock', 'slow'], customers: ['customers', 'sales'], delivery: ['returns', 'cash'], marketing: ['sales', 'channels'], areas: ['areas', 'returns'], team: ['sales'], review: ['pnl', 'top', 'returns', 'restock'], overview: ['pnl', 'sales', 'returns'] }[tab] || ['sales'];
    if (fmt === 'print') { A.toast(t('Sent to the printer: ', 'প্রিন্টারে গেছে: ') + title, 'good'); return; }
    previewFile(title, fmt, per, parts, r);
  }
  function downloadsHtml(compact) {
    if (!A.D.dailyReport) A.D.dailyReport = { on: true, time: '22:00', tg: true, email: true };
    const dr = A.D.dailyReport;
    const packs = PACKS().map((p) => { const s2 = pkState(p); return `<div class="card rep-pk" data-pk="${p.id}"><div class="row" style="gap:10px;align-items:flex-start;flex-wrap:nowrap"><span class="rep-pki">${A.icon(p.icon)}</span><span class="grow" style="min-width:0"><b>${p.name}</b><div class="small muted">${p.for}</div></span></div><div class="small" style="line-height:1.5">${p.parts.map((k) => PART[k]({ from: 0, to: 0 })[0]).join(' · ')}</div><div class="row" style="gap:8px;flex-wrap:wrap">${U.select('pk-per-' + p.id, PK_PER(), s2.per)}${U.seg('pk-fmt-' + p.id, [['pdf', t('PDF on letterhead', 'লেটারহেডে PDF')], ['xlsx', t('Excel, sheet per part', 'Excel, অংশ প্রতি শিট')]], s2.fmt)}</div><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm primary" data-pka="dl">${A.icon('down')} ${t('Download', 'ডাউনলোড')}</button><button class="btn sm" data-pka="pv">${t('Preview', 'প্রিভিউ')}</button><button class="btn sm" data-pka="print">${A.icon('print')} ${t('Print', 'প্রিন্ট')}</button><button class="btn sm ghost" data-pka="sch">${A.icon('send')} ${subOf('pack-' + p.id) ? t('Scheduled', 'শিডিউল চালু') : t('Schedule', 'শিডিউল')}</button></div></div>`; }).join('');
    const single = `<div class="list">${A.NAV ? (A.sec('reports').tabs || []).filter((x) => x[0] !== 'overview').map((x) => `<div class="li" style="flex-wrap:wrap;gap:8px"><b class="grow">${A.nm(x[1])}</b><span class="row" style="gap:6px"><button class="btn sm" data-rf="${x[0]}" data-fmt="xlsx">Excel</button><button class="btn sm" data-rf="${x[0]}" data-fmt="pdf">PDF</button><button class="btn sm ghost" data-rf="${x[0]}" data-fmt="print">${A.icon('print')}</button></span></div>`).join('') : ''}</div>`;
    const daily = `<div class="row" style="gap:10px;flex-wrap:wrap;align-items:center"><label class="rep-sw">${U.switch('dr-on', dr.on)}${t('Send every night at', 'প্রতি রাতে পাঠান')}</label>${U.select('dr-time', ['20:00', '21:00', '22:00', '23:00'].map((v) => [v, v]), dr.time)}<label class="rep-sw">${U.switch('dr-tg', dr.tg)}Telegram</label><label class="rep-sw">${U.switch('dr-em', dr.email)}${t('Email', 'ইমেইল')}</label><span class="grow"></span><button class="btn sm" id="dr-pv">${t('See today\'s', 'আজকেরটা দেখুন')}</button></div><div class="small muted" style="margin-top:6px">${t('Every night: orders, delivered sales, profit, returns, stock to restock and what is waiting for tomorrow.', 'প্রতি রাতে: অর্ডার, ডেলিভারড বিক্রি, লাভ, রিটার্ন, রিস্টকের স্টক আর কাল কী বাকি।')}</div>`;
    return `<div class="grid g2 rep-dl">${packs}</div>` + (compact ? '' : `<div class="grid g2" style="margin-top:12px">${U.card(t('Single reports', 'একটা একটা রিপোর্ট'), single, { sub: t('Uses the period and filters you last picked', 'শেষ বাছাই করা সময় ও ফিল্টার দিয়ে') })}${U.card(t('Daily business report', 'দৈনিক ব্যবসার রিপোর্ট'), daily)}</div>`);
  }
  function wireDownloads(root) {
    for (const p of PACKS()) {
      const box = root.querySelector(`[data-pk="${p.id}"]`); if (!box) continue; const s2 = pkState(p);
      const sel = box.querySelector('#pk-per-' + p.id); sel.onchange = () => (s2.per = sel.value);
      box.querySelectorAll('#pk-fmt-' + p.id + ' button').forEach((b) => (b.onclick = () => { s2.fmt = b.dataset.v; box.querySelectorAll('#pk-fmt-' + p.id + ' button').forEach((x) => x.classList.toggle('on', x === b)); }));
      box.querySelectorAll('[data-pka]').forEach((b) => (b.onclick = () => {
        const a = b.dataset.pka; const perL = (PK_PER().find((x) => x[0] === s2.per) || ['', ''])[1];
        if (a === 'sch') { scheduleModal('pack-' + p.id, p.name); return; }
        if (a === 'print') { A.toast(t('Sent to the printer: ', 'প্রিন্টারে গেছে: ') + p.name, 'good'); return; }
        previewFile(p.name, s2.fmt === 'xlsx' ? 'xlsx' : 'pdf', perL, p.parts, perRange(s2.per));
        if (a === 'dl') { U.download(`EXTAS · ${p.name} · ${perL}.${s2.fmt === 'xlsx' ? 'xlsx' : 'pdf'}`); A.commit('Downloaded report pack: ' + p.name); }
      }));
    }
    root.querySelectorAll('[data-rf]').forEach((b) => (b.onclick = () => { const tb = (A.sec('reports').tabs || []).find((x) => x[0] === b.dataset.rf); reportFile(b.dataset.rf, tb ? A.nm(tb[1]) : b.dataset.rf, b.dataset.fmt); }));
    const dr = A.D.dailyReport; const sw = (id, key) => { const x = root.querySelector(id); if (x) x.onchange = () => { dr[key] = x.checked; A.commit('Daily business report: ' + key + ' ' + x.checked); A.toast(t('Daily report updated', 'দৈনিক রিপোর্ট আপডেট হলো'), 'good'); }; };
    sw('#dr-on', 'on'); sw('#dr-tg', 'tg'); sw('#dr-em', 'email');
    const tm = root.querySelector('#dr-time'); if (tm) tm.onchange = () => { dr.time = tm.value; A.commit('Daily business report time ' + tm.value); A.toast(t(`Daily report will go at ${tm.value}`, `দৈনিক রিপোর্ট যাবে ${tm.value}-এ`), 'good'); };
    const pv = root.querySelector('#dr-pv'); if (pv) pv.onclick = () => previewFile(t('Daily business report', 'দৈনিক ব্যবসার রিপোর্ট'), 'pdf', F.date(A.TODAY), ['sales', 'pnl', 'returns', 'restock', 'cash'], C.range('today'));
  }
  function downloadsDrawer() {
    U.drawer(t('Downloads & report packs', 'ডাউনলোড ও রিপোর্ট প্যাক'), `<div class="rep-dlw"><p class="small muted" style="margin-top:0">${t('For a bank, a loan, a partner or your own analysis. PDF comes on the EXTAS letterhead; Excel has one sheet per part.', 'ব্যাংক, লোন, পার্টনার বা নিজের বিশ্লেষণের জন্য। PDF আসে EXTAS লেটারহেডে; Excel-এ প্রতি অংশের আলাদা শিট।')}</p>` + downloadsHtml(false) + '</div>', { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>`, onOpen: (d) => wireDownloads(d) });
  }

  /* ---------------- guides ---------------- */
  const G = (en, bn) => ({ en, bn });
  const COMMON_EN = '<p><b>How:</b> pick a period at the top (Today, 7 days, 30 days, this month, last month, 6 months or your own dates). "Compare with previous period" shows ▲▼ and a dashed line for the period before. Click any column header to sort, and any row to open the orders, product or customer behind it. Filter by channel, category and area; "Save view" keeps the period and filters for later. "Excel" or "PDF" saves the report; "Schedule" sends it to Telegram or email daily, weekly or monthly. Each line on top has a button that takes you to the fix.</p>';
  const COMMON_BN = '<p><b>কীভাবে:</b> ওপরে সময় বেছে নিন (আজ, 7 দিন, 30 দিন, এই মাস, গত মাস, 6 মাস বা নিজের তারিখ)। "আগের সময়ের সাথে তুলনা" চালু থাকলে ▲▼ আর আগের সময়ের ড্যাশ লাইন দেখাবে। সাজাতে কলামের নামে চাপুন, পেছনের অর্ডার, প্রোডাক্ট বা কাস্টমার দেখতে সারিতে চাপুন। চ্যানেল, ক্যাটাগরি ও এলাকা দিয়ে ফিল্টার করুন; "ভিউ সেভ" দিলে সময় ও ফিল্টার পরে আবার পাবেন। "Excel" বা "PDF" ডাউনলোড করুন; "শিডিউল" দিলে টেলিগ্রাম বা ইমেইলে প্রতিদিন, প্রতি সপ্তাহে বা প্রতি মাসে নিজে থেকে যাবে। ওপরের প্রতিটা লাইনের বোতাম আপনাকে সমাধানের জায়গায় নিয়ে যাবে।</p>';
  const guide = (en, bn) => G(en + COMMON_EN, bn + COMMON_BN);

  const TABS = {
    overview: { render: rOverview, guide: G('<p><b>What:</b> every report as a question with its answer: the headline number with ▲▼ against the period before.</p><p><b>Why:</b> you don\'t need to know which report to open. Ask "What should I restock?" and the card tells you, then opens the full report.</p><p><b>How:</b> pick a period on top. Click a card to open its report. "Pin to Home" puts that number on your Home page. Money and the books (profit & loss, expenses) are in Finance; website visitors are in Website › Analytics.</p>', '<p><b>কী:</b> প্রতিটা রিপোর্ট একটা প্রশ্ন আর তার উত্তর: মূল সংখ্যা, আগের সময়ের তুলনায় ▲▼।</p><p><b>কেন:</b> কোন রিপোর্ট খুলবেন জানার দরকার নেই। "এখন কী আবার আনতে হবে?" দেখুন, কার্ড উত্তর দেবে, তারপর পুরো রিপোর্ট খুলবে।</p><p><b>কীভাবে:</b> ওপরে সময় বাছুন। কার্ডে চাপলে রিপোর্ট খুলবে। "Home-এ পিন" দিলে সংখ্যাটা Home পেজে দেখাবে। টাকা ও খাতা (লাভ-ক্ষতি, খরচ) হিসাব পেজে; ওয়েবসাইটের ভিজিটর ওয়েবসাইট › অ্যানালিটিক্স-এ।</p>') },
    sales: { render: rSales, guide: guide('<p><b>What:</b> orders and order value by day or week, channel, payment method, hour and weekday, plus what discounts and coupons cost.</p><p><b>Why:</b> if most orders come Friday 9–11 PM, boost your Facebook post on Friday at 8 PM. If "Buy 3" orders are bigger, keep that offer.</p>', '<p><b>কী:</b> দিন বা সপ্তাহ, চ্যানেল, পেমেন্ট মাধ্যম, ঘণ্টা ও বার অনুযায়ী অর্ডার ও মূল্য, সাথে ছাড় ও কুপনের খরচ।</p><p><b>কেন:</b> শুক্রবার রাত 9–11টায় বেশি অর্ডার এলে শুক্রবার রাত 8টায় পোস্ট বুস্ট করুন। "3টা নিলে ছাড়" অর্ডার বড় হলে অফারটা রাখুন।</p>') },
    profit: { render: rProfit, guide: guide('<p><b>What:</b> where profit comes from: by channel, category, style, product and area, with the margin week by week. The full profit & loss statement stays in Finance.</p><p><b>Why:</b> a busy month can still lose money. Example: hoodies sell well but returns in Sylhet eat the margin, so ask for the delivery charge first there.</p>', '<p><b>কী:</b> লাভ কোথা থেকে আসে: চ্যানেল, ক্যাটাগরি, স্টাইল, প্রোডাক্ট ও এলাকা ধরে, সাথে সপ্তাহ অনুযায়ী মার্জিন। পুরো লাভ-ক্ষতির হিসাব থাকে হিসাব পেজে।</p><p><b>কেন:</b> ব্যস্ত মাসেও ক্ষতি হতে পারে। যেমন: হুডি ভালো বিক্রি হচ্ছে কিন্তু সিলেটের রিটার্নে মার্জিন কমছে, তাই সেখানে আগে ডেলিভারি চার্জ নিন।</p>') },
    products: { render: rProducts, guide: guide('<p><b>What:</b> "Style profit & restock" (category › style › product with sold, revenue, profit, margin, days of stock and a verdict: Restock, Buy in bulk or Stop), best and slow sellers, each category\'s pieces, sales, margin and returns, which sizes and colours sell, days of stock left and products people look at but don\'t buy.</p><p><b>Why:</b> if navy polo in L will run out in 5 days, send a reorder to the ERP now. If a shirt has many views but few sales, fix the price or photos.</p>', '<p><b>কী:</b> "স্টাইলের লাভ ও রিস্টক" (ক্যাটাগরি › স্টাইল › প্রোডাক্ট: বিক্রি, টাকা, লাভ, মার্জিন, স্টক কতদিন চলবে আর সিদ্ধান্ত: আবার আনুন, বেশি করে আনুন বা বন্ধ করুন), বেশি ও কম বিক্রির প্রোডাক্ট, প্রতিটা ক্যাটাগরির পিস, বিক্রি, মার্জিন ও রিটার্ন, কোন সাইজ ও রং চলে, স্টক কতদিন চলবে আর কোনটা দেখে কেউ কেনেন না।</p><p><b>কেন:</b> নেভি পোলোর L সাইজ 5 দিনে শেষ হলে এখনই ERP-তে রিঅর্ডার পাঠান। কোনো শার্টে ভিউ বেশি কিন্তু বিক্রি কম হলে দাম বা ছবি ঠিক করুন।</p>') },
    customers: { render: rCustomers, guide: guide('<p><b>What:</b> new and returning customers, repeat rate, top customers, customers by first order month, at-risk buyers and districts.</p><p><b>Why:</b> keeping an old customer costs less than finding a new one. Send the at-risk list a small coupon before Eid.</p>', '<p><b>কী:</b> নতুন ও পুরনো কাস্টমার, আবার কেনার হার, সেরা কাস্টমার, প্রথম অর্ডারের মাস, ঝুঁকিতে থাকা ক্রেতা আর জেলা।</p><p><b>কেন:</b> নতুন কাস্টমার খোঁজার চেয়ে পুরনোকে ধরে রাখা সস্তা। ঈদের আগে ঝুঁকির তালিকায় ছোট কুপন পাঠান।</p>') },
    delivery: { render: rDelivery, guide: guide('<p><b>What:</b> delivery success by courier, days to deliver by zone, refused parcels by area and reason, COD money still with couriers and what returns cost.</p><p><b>Why:</b> if RedX returns more parcels in Sylhet, send Sylhet orders with Steadfast. If COD sits with a courier 8+ days, call them.</p>', '<p><b>কী:</b> কুরিয়ার অনুযায়ী ডেলিভারি সফলতা, জোন অনুযায়ী দিন, এলাকা ও কারণ অনুযায়ী ফেরত, কুরিয়ারের কাছে থাকা COD টাকা আর রিটার্নের খরচ।</p><p><b>কেন:</b> সিলেটে RedX বেশি ফেরত দিলে সিলেটের অর্ডার Steadfast-এ দিন। কুরিয়ারের কাছে COD 8+ দিন থাকলে ফোন করুন।</p>') },
    marketing: { render: rMarketing, guide: guide('<p><b>What:</b> ad spend against the sales it brought, by channel and campaign, cost per delivered order, coupon cost and how many orders came without ads. Each campaign gets Scale, Keep, Fix or Stop with a reason.</p><p><b>Why:</b> if "Panjabi retargeting" brings ৳6 per ৳1, give it more budget; if "Hoodie reels" brings ৳1, stop it. Budget changes are made in Marketing with your OK.</p>', '<p><b>কী:</b> বিজ্ঞাপনের খরচ বনাম বিক্রি, চ্যানেল ও ক্যাম্পেইন ধরে, প্রতি ডেলিভারড অর্ডারে খরচ, কুপনের খরচ আর বিজ্ঞাপন ছাড়া কত অর্ডার। প্রতিটা ক্যাম্পেইনে "বাড়ান, চালু রাখুন, ঠিক করুন বা বন্ধ করুন" কারণসহ।</p><p><b>কেন:</b> "Panjabi retargeting" ৳1-এ ৳6 আনলে বাজেট বাড়ান; "Hoodie reels" ৳1 আনলে বন্ধ করুন। বাজেট বদলানো হয় মার্কেটিং পেজে, আপনার অনুমতিতে।</p>') },
    areas: { render: rAreas, guide: guide('<p><b>What:</b> orders, pieces, product value, delivered, returned, return rate, money collected, profit and average order for every division, district, thana and area. Click a box or row to go one level deeper; the path on top takes you back.</p><p><b>Why:</b> if Mirpur 10 orders many polos but Sylhet returns 1 in 5 parcels, run a Mirpur-only polo ad and ask Sylhet for the delivery charge first. "Where it sells" shows the best places for any product or category before you plan stock or ads.</p>', '<p><b>কী:</b> প্রতিটা বিভাগ, জেলা, থানা ও এলাকার অর্ডার, পিস, প্রোডাক্টের মূল্য, ডেলিভারি, ফেরত, রিটার্নের হার, টাকা আসা, লাভ ও গড় অর্ডার। বক্স বা সারিতে চাপলে এক ধাপ ভেতরে যাবেন; ওপরের পথ ধরে আবার ফিরবেন।</p><p><b>কেন:</b> মিরপুর 10 থেকে অনেক পোলো এলে আর সিলেটে প্রতি 5টায় 1টা পার্সেল ফেরত এলে, শুধু মিরপুরে পোলোর বিজ্ঞাপন দিন আর সিলেটে আগে ডেলিভারি চার্জ নিন। "কোথায় বিক্রি হয়" দেখায় যেকোনো প্রোডাক্ট বা ক্যাটাগরির সেরা এলাকা, স্টক বা বিজ্ঞাপনের আগে দেখে নিন।</p>') },
    team: { render: rTeam, guide: guide('<p><b>What:</b> each team member\'s calls confirmed, orders packed, parcels handed over, exchanges and messages answered, with average reply and confirm times.</p><p><b>Why:</b> fair praise and fast service. If new orders wait 4 hours for a call, customers cancel; share the calls or set a reminder.</p>', '<p><b>কী:</b> টিমের প্রত্যেকের কলে কনফার্ম, প্যাক, কুরিয়ারে দেওয়া, এক্সচেঞ্জ আর মেসেজের উত্তর, সাথে গড় উত্তর ও কনফার্মের সময়।</p><p><b>কেন:</b> ঠিকভাবে প্রশংসা আর দ্রুত সার্ভিস। নতুন অর্ডার 4 ঘণ্টা কলের অপেক্ষায় থাকলে কাস্টমার বাতিল করেন; কল ভাগ করুন বা রিমাইন্ডার দিন।</p>') },
    review: { render: rReview, guide: G('<p><b>What:</b> last month on one page: sales, profit, orders and returns, what went well, what went badly and 3 things to do next month, each with a button.</p><p><b>Why:</b> a 2-minute read on the 1st of the month instead of opening every report. Example: "Polo grew 20% a day; Sylhet returned 1 in 5 parcels; restock 12 products before winter."</p><p><b>How:</b> pick October or November so far. "Send to Telegram" sends it now; "Every month" sends it by itself on the 1st. Figures match Finance › Profit & loss.</p>', '<p><b>কী:</b> গত মাস এক পাতায়: বিক্রি, লাভ, অর্ডার ও রিটার্ন, কী ভালো হলো, কী খারাপ, আর আগামী মাসের 3টা কাজ, প্রতিটায় বোতাম।</p><p><b>কেন:</b> মাসের 1 তারিখে সব রিপোর্ট না খুলে 2 মিনিটে পড়ে নিন। যেমন: "পোলো দিনে 20% বেড়েছে; সিলেটে প্রতি 5টায় 1টা ফেরত; শীতের আগে 12টা প্রোডাক্ট আনুন।"</p><p><b>কীভাবে:</b> অক্টোবর বা নভেম্বর (এ পর্যন্ত) বাছুন। "টেলিগ্রামে পাঠান" এখনই পাঠাবে; "প্রতি মাসে" দিলে প্রতি মাসের 1 তারিখে নিজে থেকে যাবে। সংখ্যা হিসাব › লাভ-ক্ষতির সাথে মেলে।</p>') },
  };

  A.mod('reports', TABS);
})();
