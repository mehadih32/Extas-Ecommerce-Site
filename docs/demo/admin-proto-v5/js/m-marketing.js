/* EXTAS admin prototype — Marketing: ad campaigns, message campaigns, ad accounts, landing pages, referrals, calendar, shopping feed. */
(function () {
  'use strict';
  const t = (en, bn) => A.t(en, bn);
  const U = () => A.ui;
  const F = () => A.fmt;
  const DAY = 864e5;

  A.css('mkt', `
  .mkt-verdict{display:flex;flex-direction:column;gap:2px;min-width:150px}
  .mkt-verdict small{color:var(--muted);font-size:11.5px;line-height:1.3;white-space:normal}
  .mkt-acc{display:flex;flex-direction:column;gap:12px}
  .mkt-acc .lg{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;font:700 16px var(--f-head);color:#fff;flex:none}
  .mkt-st{display:flex;align-items:flex-start;gap:8px;font-size:13px}
  .mkt-st i{width:9px;height:9px;border-radius:50%;margin-top:5px;flex:none}
  .mkt-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--line);gap:1px}
  .mkt-cal .hd{background:var(--card2);font-size:11.5px;font-weight:600;color:var(--muted);text-align:center;padding:6px 2px}
  .mkt-cal .dc{background:var(--card);min-height:92px;padding:4px;display:flex;flex-direction:column;gap:3px;min-width:0}
  .mkt-cal .dc.out{background:var(--card2)}
  .mkt-cal .dc.today{box-shadow:inset 0 0 0 2px var(--accent)}
  .mkt-cal .dn{font-size:11.5px;color:var(--muted);font-weight:600}
  .mkt-ev{font-size:11px;line-height:1.25;padding:2px 5px;border-radius:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;color:var(--ink)}
  .mkt-ev.holiday{background:var(--bad-soft)} .mkt-ev.day{background:var(--warn-soft)} .mkt-ev.ad{background:var(--info-soft)} .mkt-ev.msg{background:var(--good-soft)} .mkt-ev.offer{background:var(--accent-soft)} .mkt-ev.post{background:var(--card2);border:1px solid var(--line)}
  .mkt-sms{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--muted)}
  .mkt-sms b{color:var(--ink)}
  .mkt-ph{border:1px solid var(--line2);border-radius:14px;padding:10px 12px;background:var(--card2);font-size:13px;white-space:pre-wrap;max-width:340px}
  .mkt-grp{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
  .mkt-grp button{text-align:left;border:1px solid var(--line2);background:var(--card);border-radius:10px;padding:9px 11px;cursor:pointer;display:flex;flex-direction:column;gap:2px}
  .mkt-grp button.on{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  .mkt-grp b{font-size:13px} .mkt-grp span{font-size:12px;color:var(--muted)}
  .mkt-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
  .mkt-flow div{background:var(--card2);border-radius:12px;padding:12px;font-size:12.5px}
  .mkt-flow b{display:block;font-size:20px;font-family:var(--f-head);color:var(--accent);margin-bottom:2px}
  @media (max-width:960px){.mkt-flow{grid-template-columns:repeat(2,minmax(0,1fr))}.mkt-cal .dc{min-height:64px;padding:2px}.mkt-ev{font-size:10px;padding:1px 3px}}
  @media (max-width:560px){.mkt-cal .mkt-ev span{display:none}.mkt-cal .mkt-ev{height:6px;padding:0;border-radius:3px}.mkt-cal .dc{min-height:48px}}
  `);

  /* ---------- shared marketing data (kept in A.D.mkt) ---------- */
  function M() {
    const D = A.D;
    if (D.mkt && D.mkt.v === 1) return D.mkt;
    D.mkt = {
      v: 1,
      msgs: [
        { id: 'MS1', name: 'Puja offer · PUJA15', channel: 'SMS', group: 'all', date: '2026-10-14', status: 'sent', sent: 92, delivered: 88, clicks: 21, orders: 6, sales: 11640, coupon: 'PUJA15', cost: 64 },
        { id: 'MS2', name: 'We miss you · 10% off', channel: 'SMS', group: 'risk', date: '2026-10-29', status: 'sent', sent: 34, delivered: 33, clicks: 7, orders: 2, sales: 3180, coupon: 'EXTAS10', cost: 24 },
        { id: 'MS3', name: 'Winter polo is here (VIP early access)', channel: 'WhatsApp', group: 'vip', date: '2026-11-07', status: 'sent', sent: 18, delivered: 18, clicks: 9, orders: 4, sales: 6920, coupon: 'EXTAS10', cost: 0 },
        { id: 'MS4', name: 'Free delivery weekend · FREESHIP', channel: 'SMS', group: 'dhaka', date: '2026-11-14', status: 'scheduled', sent: 0, delivered: 0, clicks: 0, orders: 0, sales: 0, coupon: 'FREESHIP', cost: 0 },
      ],
      autos: [
        { id: 'confirmed', en: 'Order confirmed', bn: 'অর্ডার কনফার্ম', when: ['Right after the call confirms the order', 'কলে অর্ডার কনফার্ম হলেই'], on: true, ch: 'SMS', sent30: 0 },
        { id: 'shipped', en: 'Handed to courier, with tracking', bn: 'কুরিয়ারে দেওয়া হয়েছে, ট্র্যাকিং সহ', when: ['When the parcel is handed to the courier', 'পার্সেল কুরিয়ারে দিলে'], on: true, ch: 'SMS', sent30: 0 },
        { id: 'delivered', en: 'Delivered + review request', bn: 'ডেলিভারি হয়েছে + রিভিউ চাওয়া', when: ['1 day after delivery', 'ডেলিভারির 1 দিন পরে'], on: true, ch: 'WhatsApp', sent30: 0 },
        { id: 'abandoned', en: 'Abandoned checkout reminder', bn: 'অসম্পূর্ণ চেকআউট রিমাইন্ডার', when: ['2 hours after someone leaves checkout', 'চেকআউট ছেড়ে গেলে 2 ঘণ্টা পরে'], on: false, ch: 'SMS', sent30: 0 },
        { id: 'birthday', en: 'Birthday wish with coupon', bn: 'জন্মদিনের শুভেচ্ছা ও কুপন', when: ['On the customer’s birthday, 10 AM', 'কাস্টমারের জন্মদিনে সকাল 10টায়'], on: false, ch: 'SMS', sent30: 0 },
      ],
      accounts: {
        facebook: { connected: true, name: 'EXTAS · Meta ad account', lastImport: new Date(A.TODAY - 25 * 6e4).toISOString(), pixel: 'ok', capi: 'ok' },
        google: { connected: true, name: 'EXTAS · Google Ads', lastImport: new Date(A.TODAY - 2 * 36e5).toISOString(), pixel: 'ok', capi: 'warn' },
        tiktok: { connected: true, name: 'EXTAS · TikTok Ads', lastImport: new Date(A.TODAY - 5 * 36e5).toISOString(), pixel: 'warn', capi: 'off' },
        merchant: { connected: true, name: 'EXTAS · Merchant Center', lastImport: new Date(A.TODAY - 50 * 6e4).toISOString(), pixel: 'ok', capi: 'ok' },
      },
      landing: [
        { id: 'LP1', name: 'Winter Polo', slug: 'winter-polo', template: 'collection', cat: 'polo', status: 'live', visits: 4820, orders: 61, sales: 79300, created: '2026-11-01' },
        { id: 'LP2', name: 'Heavyweight Hoodie 320 GSM', slug: 'hoodie-320', template: 'product', cat: 'hoodie', status: 'live', visits: 2140, orders: 19, sales: 36100, created: '2026-10-20' },
        { id: 'LP3', name: '3 tees for ৳1,299', slug: 'tee-combo', template: 'offer', cat: 'tshirt', status: 'ended', visits: 3310, orders: 74, sales: 96130, created: '2026-09-25' },
        { id: 'LP4', name: 'Eid Panjabi', slug: 'eid-panjabi', template: 'collection', cat: 'panjabi', status: 'draft', visits: 0, orders: 0, sales: 0, created: '2026-11-10' },
      ],
      ref: { on: false, giver: '', friend: '', min: '', limit: '', joined: [] },
      cal: [
        { id: 'CL1', title: 'Durga Puja', from: '2026-10-17', to: '2026-10-21', type: 'holiday' },
        { id: 'CL2', title: 'Puja offer · PUJA15', from: '2026-10-10', to: '2026-10-25', type: 'offer' },
        { id: 'CL3', title: 'Winter Polo Launch ads', from: '2026-11-01', to: '2026-11-30', type: 'ad' },
        { id: 'CL4', title: 'Winter polo week (12% off)', from: '2026-11-08', to: '2026-11-15', type: 'offer' },
        { id: 'CL5', title: '11.11 shopping day', from: '2026-11-11', to: '2026-11-11', type: 'day' },
        { id: 'CL6', title: 'SMS: Free delivery weekend', from: '2026-11-14', to: '2026-11-14', type: 'msg' },
        { id: 'CL7', title: 'Blog: Cotton vs linen', from: '2026-11-18', to: '2026-11-18', type: 'post' },
        { id: 'CL8', title: 'Panjabi pre-order offer', from: '2026-11-20', to: '2026-12-10', type: 'offer' },
        { id: 'CL9', title: 'Black Friday', from: '2026-11-27', to: '2026-11-27', type: 'day' },
        { id: 'CL10', title: 'Victory Day collection ads', from: '2026-12-08', to: '2026-12-16', type: 'ad' },
        { id: 'CL11', title: 'Victory Day (16 Dec)', from: '2026-12-16', to: '2026-12-16', type: 'holiday' },
        { id: 'CL12', title: 'Christmas', from: '2026-12-25', to: '2026-12-25', type: 'day' },
        { id: 'CL13', title: 'Year-end sale', from: '2026-12-26', to: '2026-12-31', type: 'offer' },
        { id: 'CL14', title: 'Ramadan starts (expected)', from: '2027-02-09', to: '2027-02-09', type: 'holiday' },
        { id: 'CL15', title: 'Pohela Falgun & Valentine’s', from: '2027-02-14', to: '2027-02-14', type: 'day' },
        { id: 'CL16', title: 'Language Day (21 Feb)', from: '2027-02-21', to: '2027-02-21', type: 'holiday' },
        { id: 'CL17', title: 'Eid panjabi ads', from: '2027-02-15', to: '2027-03-07', type: 'ad' },
        { id: 'CL18', title: 'Eid ul-Fitr (expected)', from: '2027-03-10', to: '2027-03-10', type: 'holiday' },
      ],
      feed: { ownBrand: false, updated: new Date(A.TODAY - 50 * 6e4).toISOString(), fb: true, google: true },
      calMonth: '2026-11',
    };
    return D.mkt;
  }

  /* ---------- helpers ---------- */
  function pinAsk(title, text, okLabel, onOk) {
    const m = U().modal(title, `<p style="margin:0">${text}</p>${U().field(t('Owner PIN', 'মালিকের PIN'), '<input class="inp" id="mk-pin" type="password" inputmode="numeric" maxlength="8" placeholder="••••" autocomplete="off">', t('Money changes need your PIN.', 'টাকার পরিবর্তনে আপনার PIN লাগে।'))}<div class="small" id="mk-pin-e" style="color:var(--bad)"></div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="mk-pin-ok">${okLabel}</button>` });
    const go = () => { const v = m.querySelector('#mk-pin').value.trim(); if (!/^\d{4,8}$/.test(v)) { m.querySelector('#mk-pin-e').textContent = t('Enter your 4-digit PIN.', 'আপনার 4 সংখ্যার PIN দিন।'); return; } U().close(); onOk(); };
    m.querySelector('#mk-pin-ok').onclick = go;
    m.querySelector('#mk-pin').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    setTimeout(() => m.querySelector('#mk-pin').focus(), 30);
  }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
  const dayT = (ymd) => new Date(ymd + 'T12:00:00+06:00').getTime();
  const ymdAdd = (ymd, n) => F().ymd(dayT(ymd) + n * DAY);
  const CHCOL = { Facebook: '#1877f2', Google: '#ea4335', TikTok: '#111111', Merchant: '#34a853' };
  // Same attribution as Reports: website orders count 1 for their ad source; Facebook/Instagram/WhatsApp orders count 0.6 for Facebook (click-to-message ads).
  const W8 = { AD1: 1, AD2: 1.25, AD3: 1.6, AD4: 1.9, AD5: 0.45, AD6: 1 };
  const SRC = { 'Facebook ads': 'Facebook', Google: 'Google', TikTok: 'TikTok' };
  const orderAd = (o) => { if (o.channel === 'Website') return SRC[o.source] ? [SRC[o.source], 1] : null; if (['Facebook', 'Instagram', 'WhatsApp'].includes(o.channel)) return ['Facebook', 0.6]; return null; };
  const oVal = (o) => o.subtotal - o.discount + o.delivery;
  /** Ad sales (delivered only), orders and delivered orders per channel for a period, weighted. */
  function chStats(from, to) {
    const z = () => ({ sales: 0, orders: 0, delivered: 0, returned: 0, profit: 0, list: [] });
    const out = { Facebook: z(), Google: z(), TikTok: z() };
    for (const o of A.calc.ordersIn(from, to)) { const a = orderAd(o); if (!a || o.status === 'cancelled') continue; const x = out[a[0]]; x.orders += a[1]; x.list.push([o, a[1]]); x.profit += A.calc.orderProfit(o) * a[1]; if (o.status === 'returned') x.returned += a[1]; if (A.calc.isDelivered(o)) { x.delivered += a[1]; x.sales += oVal(o) * a[1]; } }
    return out;
  }
  const inR = (a, from, to) => { const tt = dayT(a.date); return tt >= from && tt < to; };
  /** One campaign's share of its channel = clicks × weight, against all campaigns of that channel in the period. */
  function campStats(c, from, to, ch) {
    ch = ch || chStats(from, to);
    const sp = A.D.adSpend.filter((a) => a.cid === c.id && inR(a, from, to));
    const wOf = (cc) => A.sum(A.D.adSpend.filter((a) => a.cid === cc.id && inR(a, from, to)), (a) => a.clicks) * (W8[cc.id] || 1);
    const tot = A.sum(A.D.campaigns.filter((cc) => cc.ch === c.ch), wOf);
    const share = tot ? wOf(c) / tot : 0; const cs = ch[c.ch] || { sales: 0, orders: 0, delivered: 0 };
    const spend = A.sum(sp, (a) => a.spend); const sales = cs.sales * share; const delivered = cs.delivered * share;
    return { spend, share, impressions: A.sum(sp, (a) => a.impressions), clicks: A.sum(sp, (a) => a.clicks), orders: cs.orders * share, delivered, returned: (cs.returned || 0) * share, profit: (cs.profit || 0) * share - spend, list: cs.list || [], sales, roas: spend ? sales / spend : 0, cpd: delivered ? spend / delivered : 0 };
  }
  function verdict(c, s) {
    const R = s.roas.toFixed(1);
    if (c.status !== 'on') return { k: 'paused', tone: '', en: 'Paused', bn: 'বন্ধ আছে', why: ['No money is being spent.', 'কোনো টাকা খরচ হচ্ছে না।'] };
    if (!s.spend) return { k: 'new', tone: 'info', en: 'Too new', bn: 'একদম নতুন', why: ['Wait 3–4 days for results.', 'ফলাফলের জন্য 3–4 দিন অপেক্ষা করুন।'] };
    if (s.roas >= 4) return { k: 'scale', tone: 'good', en: 'Scale', bn: 'বাজেট বাড়ান', why: [`Brings ৳${R} for every ৳1 — give it more budget.`, `৳1 খরচে ৳${R} বিক্রি — বাজেট বাড়ান।`] };
    if (s.roas >= 2.5) return { k: 'keep', tone: 'info', en: 'Keep', bn: 'চালু রাখুন', why: [`Pays well (৳${R} per ৳1). Test new photos to grow.`, `ভালো চলছে (৳1-এ ৳${R})। নতুন ছবি দিয়ে টেস্ট করুন।`] };
    if (s.roas >= 1.5) return { k: 'fix', tone: 'warn', en: 'Fix', bn: 'ঠিক করুন', why: [`Weak (৳${R} per ৳1). Change audience or photos, or cut budget.`, `দুর্বল (৳1-এ ৳${R})। অডিয়েন্স বা ছবি বদলান, নয়তো বাজেট কমান।`] };
    return { k: 'stop', tone: 'bad', en: 'Stop', bn: 'বন্ধ করুন', why: [`Losing money: only ৳${R} per ৳1, ${F().tk(s.cpd || s.spend)} per delivered order.`, `লস হচ্ছে: ৳1-এ মাত্র ৳${R}, প্রতি ডেলিভারি অর্ডারে ${F().tk(s.cpd || s.spend)}।`] };
  }

  /* ================= Ad campaigns ================= */
  let campCh = 'all';
  function renderCampaigns(el) {
    const D = A.D; const r = A.calc.range('30d'); const chC = chStats(r.from, r.to), chP = chStats(r.prevFrom, r.prevTo);
    const rows = D.campaigns.map((c) => { const s = campStats(c, r.from, r.to, chC); const p = campStats(c, r.prevFrom, r.prevTo, chP); return { _id: c.id, c, s, p, v: verdict(c, s) }; });
    const dayCh = {}; const chD = (d) => (dayCh[d] = dayCh[d] || chStats(dayT(d) - 12 * 36e5, dayT(d) + 12 * 36e5));
    const tot = (k, list) => A.sum(list, (x) => x.s[k]); const totP = (k) => A.sum(rows, (x) => x.p[k]);
    const spend = tot('spend', rows), sales = tot('sales', rows), orders = tot('orders', rows), del = tot('delivered', rows);
    const roas = spend ? sales / spend : 0, roasP = totP('spend') ? totP('sales') / totP('spend') : 0;
    const daily = D.campaigns.filter((c) => c.status === 'on').reduce((s, c) => s + c.daily, 0);
    const list = rows.filter((x) => campCh === 'all' || x.c.ch === campCh || (campCh === 'action' && ['fix', 'stop', 'scale'].includes(x.v.k)));
    // charts: daily spend vs ad sales
    const days = A.calc.daily(r.from, r.to, (d) => d);
    const spendD = days.map((d) => A.sum(D.adSpend.filter((a) => a.date === d.date), (a) => a.spend));
    const salesD = days.map((d) => { const c = chD(d.date); return Math.round(c.Facebook.sales + c.Google.sales + c.TikTok.sales); });
    const best = rows.filter((x) => x.c.status === 'on').sort((a, b) => b.s.roas - a.s.roas)[0];
    const worst = rows.filter((x) => x.c.status === 'on' && x.s.spend).sort((a, b) => a.s.roas - b.s.roas)[0];
    const wasted = A.sum(rows.filter((x) => x.v.k === 'stop'), (x) => x.s.spend);
    const insight = [
      best ? t(`<b>${A.esc(best.c.name)}</b> brings the most per taka: ৳${best.s.roas.toFixed(1)} sales for every ৳1.`, `<b>${A.esc(best.c.name)}</b> সবচেয়ে ভালো: ৳1 খরচে ৳${best.s.roas.toFixed(1)} বিক্রি।`) : '',
      worst && worst !== best ? t(`<b>${A.esc(worst.c.name)}</b> is the weakest (৳${worst.s.roas.toFixed(1)} per ৳1).`, `<b>${A.esc(worst.c.name)}</b> সবচেয়ে দুর্বল (৳1-এ ৳${worst.s.roas.toFixed(1)})।`) : '',
      wasted ? t(`Campaigns marked Stop used ${F().tk(wasted)} in 30 days.`, `"বন্ধ করুন" ক্যাম্পেইনগুলো 30 দিনে ${F().tk(wasted)} খরচ করেছে।`) : '',
      t('Rule used: Scale at ৳4+ sales per ৳1, Keep at ৳2.5+, Fix at ৳1.5+, Stop below.', 'নিয়ম: ৳1-এ ৳4+ বিক্রি হলে বাজেট বাড়ান, ৳2.5+ চালু রাখুন, ৳1.5+ ঠিক করুন, এর নিচে বন্ধ করুন।'),
    ].filter(Boolean);
    const cols = [
      { h: t('Campaign', 'ক্যাম্পেইন'), f: (x) => `<div class="cellmain"><span class="dotk" style="background:${CHCOL[x.c.ch]};width:10px;height:10px"></span><div style="min-width:0"><b class="ellip" style="max-width:240px">${A.esc(x.c.name)}</b><span class="muted small">${x.c.ch} · ${F().tk(x.c.daily)}${t('/day', '/দিন')} · ${x.c.status === 'on' ? t('Running', 'চলছে') : t('Paused', 'বন্ধ')}</span></div></div>` },
      { h: t('Spend 30d', 'খরচ 30 দিন'), r: 1, f: (x) => F().tk(x.s.spend) },
      { h: t('Orders', 'অর্ডার'), r: 1, f: (x) => (x.s.orders).toFixed(1), hide: 1 },
      { h: t('Sales', 'বিক্রি'), r: 1, f: (x) => F().tk(x.s.sales), hide: 1 },
      { h: 'ROAS', r: 1, f: (x) => `<b>${x.s.roas.toFixed(1)}x</b>` },
      { h: t('Per delivered order', 'প্রতি ডেলিভারি অর্ডারে'), r: 1, f: (x) => (x.s.delivered ? F().tk(x.s.cpd) : '—'), hide: 1 },
      { h: t('Trend', 'ট্রেন্ড'), f: (x) => A.chart.spark(A.calc.daily(r.to - 14 * DAY, r.to, (d) => campStats(x.c, dayT(d) - 12 * 36e5, dayT(d) + 12 * 36e5, chD(d)).sales).map((z) => z.v), x.v.k === 'stop' ? 'var(--bad)' : 'var(--good)', 80, 26), hide: 1 },
      { h: t('What to do', 'কী করবেন'), f: (x) => `<div class="mkt-verdict">${U().badge(t(x.v.en, x.v.bn), x.v.tone)}<small>${t(x.v.why[0], x.v.why[1])}</small></div>` },
    ];
    const chips = [['all', t('All', 'সব'), rows.length], ['action', t('Needs action', 'কাজ দরকার'), rows.filter((x) => ['fix', 'stop', 'scale'].includes(x.v.k)).length], ['Facebook', 'Facebook', rows.filter((x) => x.c.ch === 'Facebook').length], ['Google', 'Google', rows.filter((x) => x.c.ch === 'Google').length], ['TikTok', 'TikTok', rows.filter((x) => x.c.ch === 'TikTok').length]];
    el.innerHTML = A.pageHead(t('Ad campaigns', 'বিজ্ঞাপন ক্যাম্পেইন'), t('Every taka on ads, the orders it brought and what to do next. Last 30 days vs the 30 days before.', 'বিজ্ঞাপনের প্রতিটা টাকা, তা থেকে কত অর্ডার এল আর এখন কী করবেন। গত 30 দিন বনাম তার আগের 30 দিন।'),
      `<button class="btn" id="mk-sync">${A.icon('sync')}${t('Refresh from ad accounts', 'অ্যাকাউন্ট থেকে আপডেট')}</button><button class="btn primary" id="mk-new">${A.icon('plus')}${t('New campaign', 'নতুন ক্যাম্পেইন')}</button>`) + A.tabsBar('marketing', 'campaigns') +
      `<div class="grid g5">
        ${U().card('', U().kpi({ label: t('Ad spend', 'বিজ্ঞাপন খরচ'), value: F().tk(spend), delta: A.delta(spend, totP('spend'), true), sub: t(`${F().tk(daily)}/day now`, `এখন ${F().tk(daily)}/দিন`) }))}
        ${U().card('', U().kpi({ label: t('Orders from ads', 'বিজ্ঞাপন থেকে অর্ডার'), value: F().num(orders), delta: A.delta(orders, totP('orders')), sub: t(`${F().num(del)} delivered`, `${F().num(del)}টি ডেলিভারি`) }))}
        ${U().card('', U().kpi({ label: t('Sales from ads', 'বিজ্ঞাপন থেকে বিক্রি'), value: F().tk(sales), delta: A.delta(sales, totP('sales')) }))}
        ${U().card('', U().kpi({ label: t('ROAS (sales per ৳1)', 'ROAS (৳1-এ বিক্রি)'), value: roas.toFixed(2) + 'x', delta: A.delta(roas, roasP), sub: t('Scale at 4x, stop under 1.5x', '4x-এ বাড়ান, 1.5x-এর নিচে বন্ধ') }))}
        ${U().card('', U().kpi({ label: t('Ad cost per delivered order', 'প্রতি ডেলিভারি অর্ডারে খরচ'), value: del ? F().tk(spend / del) : '—', delta: A.delta(del ? spend / del : 0, A.sum(rows, (x) => x.p.delivered) ? totP('spend') / A.sum(rows, (x) => x.p.delivered) : 0, true) }))}
      </div>
      <div class="grid g3">
        ${U().card(t('Ad spend vs sales from ads', 'বিজ্ঞাপন খরচ বনাম বিক্রি'), A.chart.line({ labels: days.map((d) => F().date(d.date)), series: [{ name: t('Sales from ads', 'বিজ্ঞাপন থেকে বিক্রি'), color: 'var(--good)', values: salesD }, { name: t('Ad spend', 'বিজ্ঞাপন খরচ'), color: 'var(--c1)', values: spendD }], height: 210 }), { cls: 'span2', sub: t('Per day, last 30 days', 'প্রতিদিন, গত 30 দিন') })}
        ${U().card(t('What this means', 'এর মানে কী'), `<div class="stack small">${insight.map((s) => `<div class="row" style="align-items:flex-start;flex-wrap:nowrap;gap:8px">${A.icon('info')}<span>${s}</span></div>`).join('')}</div>`)}
      </div>
      ${U().card(t('All campaigns', 'সব ক্যাম্পেইন'), `<div class="row between" style="margin-bottom:10px"><div class="chips" id="mk-chips">${chips.map((c) => `<button class="chip ${campCh === c[0] ? 'on' : ''}" data-v="${c[0]}">${c[1]}<span class="c">${c[2]}</span></button>`).join('')}</div></div>` + U().table(cols, list, { onRow: true }) + `<div class="guide-note" style="margin-top:10px">${A.icon('info')} ${t('Same counting as Reports: delivered website orders from the ad link count fully; Messenger, Instagram and WhatsApp orders count 60% for Facebook (click-to-message ads). Each channel is split between its campaigns by clicks. Tap a campaign to pause it or change its budget.', 'রিপোর্টের মতোই হিসাব: বিজ্ঞাপনের লিংক থেকে আসা ডেলিভারি হওয়া ওয়েবসাইট অর্ডার পুরো ধরা হয়; Messenger, Instagram ও WhatsApp অর্ডার Facebook-এর জন্য 60% ধরা হয় (মেসেজ বিজ্ঞাপন)। প্রতিটা চ্যানেল ক্লিক অনুযায়ী ক্যাম্পেইনে ভাগ হয়। পজ বা বাজেট বদলাতে ক্যাম্পেইনে চাপ দিন।')}</div>`, { sub: t('Sorted as your ad accounts show them', 'অ্যাকাউন্টে যেভাবে আছে') })}`;
    A.on(el, '#mk-chips .chip', 'click', (e, b) => { campCh = b.dataset.v; A.render(); });
    A.on(el, 'tr[data-row]', 'click', (e, tr) => campDrawer(rows.find((x) => x._id === tr.dataset.row)));
    el.querySelector('#mk-sync').onclick = () => { for (const k in M().accounts) if (M().accounts[k].connected) M().accounts[k].lastImport = A.TODAY.toISOString(); A.commit('Ad data refreshed from ad accounts'); A.toast(t('Ad spend and results refreshed from Facebook, Google and TikTok', 'Facebook, Google ও TikTok থেকে খরচ ও ফলাফল আপডেট হয়েছে'), 'good'); A.render(); };
    el.querySelector('#mk-new').onclick = newCampaign;
  }
  function campDrawer(x) {
    const c = x.c; const s = x.s;
    const body = `
      <div class="card"><div class="row between"><div><div class="muted small">${c.ch}</div><h3>${A.esc(c.name)}</h3></div>${U().badge(t(x.v.en, x.v.bn), x.v.tone)}</div>
      ${U().callout(t(x.v.why[0], x.v.why[1]), x.v.tone === 'bad' ? 'bad' : x.v.tone === 'warn' ? 'warn' : x.v.tone === 'good' ? 'good' : '')}</div>
      <div class="grid g3">
        ${U().card('', U().kpi({ label: t('Spend 30d', 'খরচ 30 দিন'), value: F().tk(s.spend), delta: A.delta(s.spend, x.p.spend, true) }))}
        ${U().card('', U().kpi({ label: t('Orders', 'অর্ডার'), value: F().num(s.orders), delta: A.delta(s.orders, x.p.orders), sub: t(`${F().num(s.delivered)} delivered`, `${F().num(s.delivered)}টি ডেলিভারি`) }))}
        ${U().card('', U().kpi({ label: t('Sales (delivered)', 'বিক্রি (ডেলিভারি)'), value: F().tk(s.sales), sub: 'ROAS ' + s.roas.toFixed(2) + 'x' }))}
      </div>
      ${U().card(t('Funnel', 'ফানেল'), A.chart.funnel([{ label: t('People who saw the ad', 'বিজ্ঞাপন দেখেছে'), value: s.impressions }, { label: t('Clicked', 'ক্লিক করেছে'), value: s.clicks }, { label: t('Ordered', 'অর্ডার করেছে'), value: Math.round(s.orders) }, { label: t('Delivered', 'ডেলিভারি হয়েছে'), value: Math.round(s.delivered) }]))}
      ${U().card(t('Daily budget', 'দৈনিক বাজেট'), `<div class="formgrid">${U().field(t('Budget per day', 'প্রতিদিনের বাজেট'), U().money('mk-bud', c.daily), t(`About ${F().tk(c.daily * 30)} a month. Raising it needs your PIN.`, `মাসে প্রায় ${F().tk(c.daily * 30)}। বাড়াতে PIN লাগবে।`))}</div><div class="row" style="margin-top:10px"><button class="btn" id="mk-bud-ok">${t('Save budget', 'বাজেট সেভ')}</button><button class="btn sm ghost" data-q="-20">−20%</button><button class="btn sm ghost" data-q="20">+20%</button></div>`)}`;
    const d = U().drawer(t('Campaign', 'ক্যাম্পেইন'), body, { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button><button class="btn ${c.status === 'on' ? 'dark' : 'primary'}" id="mk-tog">${c.status === 'on' ? t('Pause campaign', 'ক্যাম্পেইন পজ') : t('Resume campaign', 'আবার চালু')}</button>` });
    d.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { const i = d.querySelector('#mk-bud'); i.value = Math.round(c.daily * (1 + Number(b.dataset.q) / 100) / 10) * 10; }));
    d.querySelector('#mk-bud-ok').onclick = () => {
      const v = Math.round(Number(d.querySelector('#mk-bud').value)); if (!v || v < 100) { A.toast(t('Budget must be at least ৳100', 'বাজেট অন্তত ৳100 হতে হবে'), 'bad'); return; }
      if (v === c.daily) { A.toast(t('Budget not changed', 'বাজেট বদলায়নি')); return; }
      const apply = () => { const old = c.daily; c.daily = v; A.commit(`Ad budget ${c.name}: ${F().tk(old)} → ${F().tk(v)}/day`); U().close(); A.toast(t(`Budget set to ${F().tk(v)}/day`, `বাজেট ${F().tk(v)}/দিন করা হলো`), 'good'); A.render(); };
      if (v > c.daily) pinAsk(t('Raise ad budget?', 'বিজ্ঞাপন বাজেট বাড়াবেন?'), t(`${A.esc(c.name)}: ${F().tk(c.daily)} → <b>${F().tk(v)}</b> per day. That is about ${F().tk((v - c.daily) * 30)} more a month.`, `${A.esc(c.name)}: ${F().tk(c.daily)} → <b>${F().tk(v)}</b> প্রতিদিন। মাসে প্রায় ${F().tk((v - c.daily) * 30)} বেশি।`), t('Raise budget', 'বাজেট বাড়ান'), apply);
      else apply();
    };
    d.parentElement.querySelector('#mk-tog').onclick = () => {
      const go = () => { c.status = c.status === 'on' ? 'off' : 'on'; A.commit(`Ad campaign ${c.name} ${c.status === 'on' ? 'resumed' : 'paused'}`); U().close(); A.toast(c.status === 'on' ? t('Campaign is running again', 'ক্যাম্পেইন আবার চালু') : t('Campaign paused — no more spend today', 'ক্যাম্পেইন পজ — আজ আর খরচ হবে না'), 'good'); A.render(); };
      if (c.status === 'on') go(); else pinAsk(t('Resume campaign?', 'ক্যাম্পেইন চালু করবেন?'), t(`It will spend about ${F().tk(c.daily)} a day again.`, `আবার প্রতিদিন প্রায় ${F().tk(c.daily)} খরচ হবে।`), t('Resume', 'চালু করুন'), go);
    };
  }
  function newCampaign() {
    const m = U().modal(t('New ad campaign', 'নতুন বিজ্ঞাপন ক্যাম্পেইন'), `<div class="formgrid">
      ${U().field(t('Where', 'কোথায়'), U().select('nc-ch', [['Facebook', 'Facebook & Instagram'], ['Google', 'Google'], ['TikTok', 'TikTok']], 'Facebook'))}
      ${U().field(t('Campaign name', 'ক্যাম্পেইনের নাম'), U().input('nc-name', '', `placeholder="${t('e.g. Panjabi pre-order', 'যেমন: পাঞ্জাবি প্রি-অর্ডার')}"`))}
      ${U().field(t('Budget per day', 'প্রতিদিনের বাজেট'), U().money('nc-bud', 500))}
      ${U().field(t('Products', 'প্রোডাক্ট'), U().select('nc-cat', [['all', t('All products (catalog)', 'সব প্রোডাক্ট (ক্যাটালগ)')]].concat(A.CATS.map((c) => [c.id, A.t(c.en, c.bn)])), 'all'))}
    </div>${U().callout(t('The campaign is created in your ad account with the shop’s pixel and catalog already linked. Starting spend needs your PIN.', 'ক্যাম্পেইন আপনার অ্যাড অ্যাকাউন্টে তৈরি হবে, দোকানের পিক্সেল ও ক্যাটালগ আগেই যুক্ত থাকবে। খরচ শুরু করতে PIN লাগবে।'))}`,
    { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="nc-ok">${t('Create and start', 'তৈরি করে চালু করুন')}</button>` });
    m.querySelector('#nc-ok').onclick = () => {
      const name = m.querySelector('#nc-name').value.trim(); const bud = Math.round(Number(m.querySelector('#nc-bud').value)); const ch = m.querySelector('#nc-ch').value;
      if (!name) { A.toast(t('Give the campaign a name', 'ক্যাম্পেইনের নাম দিন'), 'bad'); return; }
      if (!bud || bud < 100) { A.toast(t('Budget must be at least ৳100', 'বাজেট অন্তত ৳100 হতে হবে'), 'bad'); return; }
      pinAsk(t('Start spending?', 'খরচ শুরু করবেন?'), t(`${A.esc(name)} on ${ch}: ${F().tk(bud)} a day (about ${F().tk(bud * 30)} a month).`, `${ch}-এ ${A.esc(name)}: প্রতিদিন ${F().tk(bud)} (মাসে প্রায় ${F().tk(bud * 30)})।`), t('Start campaign', 'ক্যাম্পেইন চালু'), () => {
        A.D.campaigns.push({ id: A.uid('AD'), ch, name, status: 'on', daily: bud });
        A.commit(`New ad campaign ${name} (${ch}, ${F().tk(bud)}/day)`); A.toast(t('Campaign created. Results show after the first day.', 'ক্যাম্পেইন তৈরি হয়েছে। প্রথম দিনের পরে ফলাফল দেখাবে।'), 'good'); A.render();
      });
    };
  }

  /* ================= Message campaigns ================= */
  function groups() {
    const cs = A.D.customers; const now = A.TODAY.getTime();
    const ago = (c) => (c.lastOrder ? (now - new Date(c.lastOrder)) / DAY : 999);
    return [
      { id: 'all', en: 'All customers', bn: 'সব কাস্টমার', f: () => true },
      { id: 'vip', en: 'VIP (3+ delivered or ৳6,000+)', bn: 'VIP (3+ ডেলিভারি বা ৳6,000+)', f: (c) => c.delivered >= 3 || c.spent >= 6000 },
      { id: 'risk', en: 'At risk (no order in 30+ days)', bn: 'হারানোর ঝুঁকি (30+ দিন অর্ডার নেই)', f: (c) => c.delivered >= 1 && ago(c) > 30 },
      { id: 'dhaka', en: 'Dhaka repeat buyers', bn: 'ঢাকার রিপিট কাস্টমার', f: (c) => c.zone === 'inside' && c.delivered >= 2 },
      { id: 'outside', en: 'Outside Dhaka buyers', bn: 'ঢাকার বাইরের কাস্টমার', f: (c) => c.zone === 'outside' && c.delivered >= 1 },
      { id: 'one', en: 'Bought once, not again', bn: 'একবার কিনেছে, আর না', f: (c) => c.delivered === 1 && ago(c) > 14 },
      { id: 'never', en: 'Never received an order', bn: 'কখনো অর্ডার নেয়নি', f: (c) => c.orders > 0 && c.delivered === 0 },
    ].map((g) => ({ ...g, list: cs.filter(g.f) }));
  }
  const isBn = (s) => /[ঀ-৿]/.test(s);
  function smsParts(text) { const n = [...text].length; const uni = isBn(text) || /[^\x00-\x7F]/.test(text); const one = uni ? 70 : 160, multi = uni ? 67 : 153; return { n, parts: n <= one ? 1 : Math.ceil(n / multi), uni, one }; }
  function renderMessages(el) {
    const mk = M(); const gs = groups();
    const sent = mk.msgs.filter((m) => m.status === 'sent');
    const tot = (k) => A.sum(sent, (m) => m[k]);
    const cost = tot('cost');
    const cols = [
      { h: t('Campaign', 'ক্যাম্পেইন'), f: (m) => `<b>${A.esc(m.name)}</b><div class="muted small">${m.channel} · ${A.esc(t((gs.find((g) => g.id === m.group) || gs[0]).en, (gs.find((g) => g.id === m.group) || gs[0]).bn))} · ${F().date(m.date)}</div>` },
      { h: t('Status', 'অবস্থা'), f: (m) => (m.status === 'sent' ? U().badge(t('Sent', 'পাঠানো হয়েছে'), 'good') : U().badge(t('Scheduled', 'সময় ঠিক করা'), 'info')) },
      { h: t('Sent', 'পাঠানো'), r: 1, f: (m) => F().num(m.sent), hide: 1 },
      { h: t('Delivered', 'পৌঁছেছে'), r: 1, f: (m) => (m.sent ? F().pct(m.delivered / m.sent * 100, 0) : '—'), hide: 1 },
      { h: t('Clicks', 'ক্লিক'), r: 1, f: (m) => F().num(m.clicks), hide: 1 },
      { h: t('Orders', 'অর্ডার'), r: 1, f: (m) => F().num(m.orders) },
      { h: t('Sales', 'বিক্রি'), r: 1, f: (m) => F().tk(m.sales) },
    ];
    el.innerHTML = A.pageHead(t('Message campaigns', 'মেসেজ ক্যাম্পেইন'), t('SMS and WhatsApp offers to your own customers — the cheapest sales you can get.', 'নিজের কাস্টমারদের SMS ও WhatsApp অফার — সবচেয়ে কম খরচের বিক্রি।'), `<button class="btn primary" id="ms-new">${A.icon('send')}${t('New message campaign', 'নতুন মেসেজ ক্যাম্পেইন')}</button>`) + A.tabsBar('marketing', 'messages') +
      `<div class="grid g4">
        ${U().card('', U().kpi({ label: t('Messages sent', 'মেসেজ পাঠানো'), value: F().num(tot('sent')), sub: t(`${sent.length} campaigns`, `${sent.length}টি ক্যাম্পেইন`) }))}
        ${U().card('', U().kpi({ label: t('Orders from messages', 'মেসেজ থেকে অর্ডার'), value: F().num(tot('orders')), sub: t(`${F().pct(tot('clicks') ? tot('orders') / tot('clicks') * 100 : 0, 0)} of clicks ordered`, `ক্লিকের ${F().pct(tot('clicks') ? tot('orders') / tot('clicks') * 100 : 0, 0)} অর্ডার করেছে`) }))}
        ${U().card('', U().kpi({ label: t('Sales from messages', 'মেসেজ থেকে বিক্রি'), value: F().tk(tot('sales')) }))}
        ${U().card('', U().kpi({ label: t('Sales per ৳1 spent', '৳1 খরচে বিক্রি'), value: cost ? '৳' + Math.round(tot('sales') / cost) : '—', sub: t(`SMS cost ${F().tk(cost)}`, `SMS খরচ ${F().tk(cost)}`) }))}
      </div>
      ${U().callout(t(`<b>${gs.find((g) => g.id === 'risk').list.length} customers</b> have not ordered in 30+ days. A "we miss you" SMS to them costs about ${F().tk(gs.find((g) => g.id === 'risk').list.length * 0.35 * 2)}.`, `<b>${gs.find((g) => g.id === 'risk').list.length} জন কাস্টমার</b> 30+ দিন অর্ডার করেননি। তাদের "আপনাকে মিস করছি" SMS পাঠাতে খরচ প্রায় ${F().tk(gs.find((g) => g.id === 'risk').list.length * 0.35 * 2)}।`) + ` <button class="linkbtn" id="ms-risk">${t('Write it now', 'এখনই লিখুন')} →</button>`, 'warn', 'warn')}
      ${U().card(t('Campaigns', 'ক্যাম্পেইন'), U().table(cols, mk.msgs.map((m) => ({ ...m, _id: m.id })), { onRow: true }))}
      ${U().card(t('Automatic messages', 'অটোমেটিক মেসেজ'), `<div class="list">${mk.autos.map((a) => `<div class="li"><div class="grow"><b>${t(a.en, a.bn)}</b><div class="muted small">${t(a.when[0], a.when[1])} · ${a.ch}</div></div>${U().badge(a.on ? t('On', 'চালু') : t('Off', 'বন্ধ'), a.on ? 'good' : '')}${U().switch('au-' + a.id, a.on, `data-au="${a.id}"`)}</div>`).join('')}</div><div class="guide-note" style="margin-top:8px">${A.icon('info')} ${t('The wording of each message is in Settings › Customer messages.', 'প্রতিটা মেসেজের লেখা সেটিংস › কাস্টমার মেসেজ-এ।')} <a class="linkbtn" href="${A.href('settings', 'messages')}">${t('Edit wording', 'লেখা এডিট')} →</a></div>`, { sub: t('Sent by themselves at the right moment', 'ঠিক সময়ে নিজে থেকেই যায়') })}`;
    el.querySelector('#ms-new').onclick = () => msgWizard('vip');
    el.querySelector('#ms-risk').onclick = () => msgWizard('risk');
    A.on(el, '[data-au]', 'change', (e, i) => { const a = mk.autos.find((x) => x.id === i.dataset.au); a.on = i.checked; A.commit(`Automatic message "${a.en}" ${a.on ? 'on' : 'off'}`); A.toast(a.on ? t('Turned on', 'চালু হলো') : t('Turned off', 'বন্ধ হলো'), 'good'); A.render(); });
    A.on(el, 'tr[data-row]', 'click', (e, tr) => {
      const m = mk.msgs.find((x) => x.id === tr.dataset.row);
      const d = U().drawer(A.esc(m.name), `${U().card('', `<div class="grid g3">${U().kpi({ label: t('Sent', 'পাঠানো'), value: F().num(m.sent) })}${U().kpi({ label: t('Orders', 'অর্ডার'), value: F().num(m.orders) })}${U().kpi({ label: t('Sales', 'বিক্রি'), value: F().tk(m.sales) })}</div>`)}${m.sent ? U().card(t('Funnel', 'ফানেল'), A.chart.funnel([{ label: t('Sent', 'পাঠানো'), value: m.sent }, { label: t('Delivered', 'পৌঁছেছে'), value: m.delivered }, { label: t('Clicked', 'ক্লিক'), value: m.clicks }, { label: t('Ordered', 'অর্ডার'), value: m.orders }])) : U().callout(t(`Goes out on ${F().dateY(m.date)} at 11 AM.`, `${F().dateY(m.date)} সকাল 11টায় যাবে।`))}`,
        { foot: m.status === 'scheduled' ? `<button class="btn danger" id="ms-cancel">${t('Cancel this send', 'পাঠানো বাতিল')}</button>` : `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>` });
      const cb = d.parentElement.querySelector('#ms-cancel');
      if (cb) cb.onclick = () => U().confirm(t('Cancel the scheduled send?', 'নির্ধারিত মেসেজ বাতিল করবেন?'), t('Nothing will be sent and no SMS cost is charged.', 'কিছু যাবে না, SMS খরচও হবে না।'), t('Yes, cancel it', 'হ্যাঁ, বাতিল'), () => { mk.msgs = mk.msgs.filter((x) => x !== m); A.commit(`Message campaign ${m.name} cancelled`); A.toast(t('Scheduled send cancelled', 'নির্ধারিত মেসেজ বাতিল হলো'), 'good'); A.render(); });
    });
  }
  function msgWizard(gid) {
    const gs = groups(); const coupons = A.D.coupons.filter((c) => c.on);
    const tpl = {
      vip: 'প্রিয় {name}, EXTAS-এর নতুন উইন্টার কালেকশন এসেছে! আপনার জন্য কুপন {coupon} — আজই দেখুন: extas.com.bd',
      risk: 'প্রিয় {name}, অনেক দিন দেখা নেই! আপনার জন্য {coupon} কুপনে বিশেষ ছাড়। ক্যাশ অন ডেলিভারি। extas.com.bd',
      def: 'প্রিয় {name}, EXTAS-এ নতুন অফার! কুপন {coupon} ব্যবহার করুন। extas.com.bd',
    };
    const st = { g: gid, text: tpl[gid] || tpl.def, coupon: coupons[0] ? coupons[0].code : '', ch: 'SMS', when: 'now', date: F().ymd(A.TODAY.getTime() + DAY) };
    const m = U().modal(t('New message campaign', 'নতুন মেসেজ ক্যাম্পেইন'), '<div id="mw"></div>', { wide: true, foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="mw-send">${A.icon('send')}${t('Review and send', 'দেখে পাঠান')}</button>` });
    const box = m.querySelector('#mw');
    const draw = () => {
      const g = gs.find((x) => x.id === st.g); const n = g.list.length;
      const sample = st.text.replace('{name}', (g.list[0] || { name: 'Rahim' }).name.split(' ')[0]).replace('{coupon}', st.coupon || '');
      const sp = smsParts(sample); const cost = st.ch === 'SMS' ? n * sp.parts * 0.35 : 0;
      box.innerHTML = `
        <div class="steps"><span class="st done"><b>1</b>${t('Who', 'কাকে')}</span><span class="st done"><b>2</b>${t('Message', 'মেসেজ')}</span><span class="st on"><b>3</b>${t('When', 'কখন')}</span></div>
        <div class="lbl">1 · ${t('Pick customers', 'কাস্টমার বাছাই')}</div>
        <div class="mkt-grp">${gs.map((x) => `<button data-g="${x.id}" class="${x.id === st.g ? 'on' : ''}"><b>${t(x.en, x.bn)}</b><span>${x.list.length} ${t('people', 'জন')}</span></button>`).join('')}</div>
        <div class="lbl">2 · ${t('Write the message', 'মেসেজ লিখুন')}</div>
        <div class="grid g2">
          <div class="stack">${U().seg('mw-ch', [['SMS', 'SMS'], ['WhatsApp', 'WhatsApp']], st.ch)}
            <textarea class="inp" id="mw-text" rows="5">${A.esc(st.text)}</textarea>
            <div class="row small"><span class="muted">${t('Insert:', 'যোগ করুন:')}</span><button class="chip" data-ins="{name}">${t('Customer name', 'কাস্টমারের নাম')}</button><button class="chip" data-ins="{coupon}">${t('Coupon', 'কুপন')}</button></div>
            ${U().field(t('Coupon', 'কুপন'), U().select('mw-cp', [['', t('No coupon', 'কুপন ছাড়া')]].concat(coupons.map((c) => [c.code, `${c.code} · ${c.type === 'percent' ? c.value + '%' : c.type === 'flat' ? '৳' + c.value : t('free delivery', 'ফ্রি ডেলিভারি')}`])), st.coupon))}
          </div>
          <div class="stack"><div class="muted small">${t('Preview on phone', 'ফোনে যেমন দেখাবে')}</div><div class="mkt-ph">${A.esc(sample)}</div>
            <div class="mkt-sms"><span>${t('Letters', 'অক্ষর')}: <b>${sp.n}</b></span>${st.ch === 'SMS' ? `<span>${t('SMS per person', 'জনপ্রতি SMS')}: <b>${sp.parts}</b></span><span>${sp.uni ? t('Bengali: 70 letters = 1 SMS', 'বাংলা: 70 অক্ষর = 1 SMS') : t('English: 160 letters = 1 SMS', 'ইংরেজি: 160 অক্ষর = 1 SMS')}</span>` : ''}</div>
            ${U().callout(st.ch === 'SMS' ? t(`<b>${n} people × ${sp.parts} SMS × ৳0.35 = ${F().tk(Math.ceil(cost))}</b>. If 1 in 25 orders (average ${F().tk(1650)}), that is about ${F().tk(Math.round(n / 25) * 1650)} in sales.`, `<b>${n} জন × ${sp.parts} SMS × ৳0.35 = ${F().tk(Math.ceil(cost))}</b>। 25 জনে 1 জন অর্ডার করলে (গড় ${F().tk(1650)}) প্রায় ${F().tk(Math.round(n / 25) * 1650)} বিক্রি।`) : t(`WhatsApp goes free to ${n} people who chatted with you before.`, `আগে চ্যাট করেছেন এমন ${n} জনের কাছে WhatsApp ফ্রি যাবে।`), 'good', 'info')}
            ${sp.parts > 2 && st.ch === 'SMS' ? U().callout(t('Long message — shorten it to save money.', 'মেসেজ লম্বা — ছোট করলে খরচ কমবে।'), 'warn', 'warn') : ''}
          </div>
        </div>
        <div class="lbl">3 · ${t('When to send', 'কখন পাঠাবেন')}</div>
        <div class="row">${U().seg('mw-when', [['now', t('Send now', 'এখনই')], ['later', t('Schedule', 'পরে')]], st.when)}${st.when === 'later' ? `<input class="inp" type="date" id="mw-date" value="${st.date}" style="max-width:180px">` : ''}<span class="muted small">${t('Best time: 11 AM–1 PM or 8–10 PM', 'ভালো সময়: সকাল 11টা–দুপুর 1টা বা রাত 8–10টা')}</span></div>`;
      box.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { st.g = b.dataset.g; draw(); }));
      box.querySelectorAll('#mw-ch button').forEach((b) => (b.onclick = () => { st.ch = b.dataset.v; draw(); }));
      box.querySelectorAll('#mw-when button').forEach((b) => (b.onclick = () => { st.when = b.dataset.v; draw(); }));
      const ta = box.querySelector('#mw-text'); ta.oninput = () => { st.text = ta.value; const pos = ta.selectionStart; draw(); const n2 = box.querySelector('#mw-text'); n2.focus(); n2.setSelectionRange(pos, pos); };
      box.querySelector('#mw-cp').onchange = (e) => { st.coupon = e.target.value; draw(); };
      const dt = box.querySelector('#mw-date'); if (dt) dt.onchange = () => { st.date = dt.value; };
      box.querySelectorAll('[data-ins]').forEach((b) => (b.onclick = () => { st.text += ' ' + b.dataset.ins; draw(); }));
      st._n = n; st._cost = Math.ceil(cost); st._sample = sample;
    };
    draw();
    m.parentElement.querySelector('#mw-send').onclick = () => {
      if (!st.text.trim()) { A.toast(t('Write a message first', 'আগে মেসেজ লিখুন'), 'bad'); return; }
      if (!st._n) { A.toast(t('This group has nobody in it', 'এই গ্রুপে কেউ নেই'), 'bad'); return; }
      const g = gs.find((x) => x.id === st.g);
      U().confirm(t('Send this message?', 'মেসেজটি পাঠাবেন?'), t(`${st.ch} to <b>${st._n} people</b> (${A.esc(g.en)}) ${st.when === 'now' ? 'now' : 'on ' + F().dateY(st.date)}. Cost: <b>${F().tk(st._cost)}</b>. Messages cannot be taken back once sent.`, `<b>${st._n} জনকে</b> (${A.esc(g.bn)}) ${st.ch} ${st.when === 'now' ? 'এখনই' : F().dateY(st.date) + ' তারিখে'}। খরচ: <b>${F().tk(st._cost)}</b>। পাঠানোর পরে ফেরত নেওয়া যায় না।`), t('Yes, send', 'হ্যাঁ, পাঠান'), () => {
        const now = st.when === 'now'; const del = Math.round(st._n * (st.ch === 'SMS' ? 0.96 : 1));
        M().msgs.unshift({ id: A.uid('MS'), name: (st._sample.slice(0, 38) + '…'), channel: st.ch, group: st.g, date: now ? F().ymd(A.TODAY) : st.date, status: now ? 'sent' : 'scheduled', sent: now ? st._n : 0, delivered: now ? del : 0, clicks: 0, orders: 0, sales: 0, coupon: st.coupon, cost: now ? st._cost : 0 });
        if (!now) M().cal.push({ id: A.uid('CL'), title: (st.ch + ': ' + g.en), from: st.date, to: st.date, type: 'msg' });
        A.commit(`Message campaign to ${g.en} (${st._n}) ${now ? 'sent' : 'scheduled ' + st.date}`);
        A.toast(now ? t(`Sent to ${st._n} people`, `${st._n} জনকে পাঠানো হয়েছে`) : t('Scheduled — also added to the marketing calendar', 'সময় ঠিক হয়েছে — মার্কেটিং ক্যালেন্ডারেও যোগ হলো'), 'good'); A.render();
      });
    };
  }

  /* ================= Ad accounts ================= */
  function renderAccounts(el) {
    const mk = M(); const ac = mk.accounts;
    const st = (s, ok, warn, off) => `<div class="mkt-st"><i style="background:${s === 'ok' ? 'var(--good)' : s === 'warn' ? 'var(--warn)' : 'var(--line2)'}"></i><span>${s === 'ok' ? ok : s === 'warn' ? warn : off}</span></div>`;
    const info = {
      facebook: { lg: 'f', name: 'Facebook & Instagram', what: t('Ads, catalog, Messenger orders', 'বিজ্ঞাপন, ক্যাটালগ, Messenger অর্ডার'),
        p: [t('Pixel: sees views, add to cart and purchases on the site.', 'পিক্সেল: সাইটে ভিউ, কার্টে যোগ ও কেনা দেখতে পায়।'), t('Pixel: some steps are missing.', 'পিক্সেল: কিছু ধাপ ধরা পড়ছে না।'), t('Pixel: not installed.', 'পিক্সেল: বসানো নেই।')],
        c: [t('Server-side tracking: on — purchases are counted even when browsers block the pixel.', 'সার্ভার থেকে ট্র্যাকিং: চালু — ব্রাউজার পিক্সেল আটকালেও কেনা হিসাব হয়।'), t('Server-side tracking: partly working.', 'সার্ভার থেকে ট্র্যাকিং: আংশিক চলছে।'), t('Server-side tracking: off.', 'সার্ভার থেকে ট্র্যাকিং: বন্ধ।')] },
      google: { lg: 'G', name: 'Google Ads', what: t('Search and Shopping ads', 'সার্চ ও শপিং বিজ্ঞাপন'),
        p: [t('Google tag: counts purchases with value.', 'গুগল ট্যাগ: কেনা ও টাকার অঙ্ক গোনে।'), t('Google tag: some steps missing.', 'গুগল ট্যাগ: কিছু ধাপ নেই।'), t('Google tag: not installed.', 'গুগল ট্যাগ: বসানো নেই।')],
        c: [t('Better matching of buyers: on.', 'কাস্টমার মেলানো আরও ভালো: চালু।'), t('Better matching of buyers is off — turning it on usually finds 5–10% more sales.', 'কাস্টমার মেলানো আরও ভালো: বন্ধ — চালু করলে সাধারণত 5–10% বেশি বিক্রি ধরা পড়ে।'), t('Off.', 'বন্ধ।')] },
      tiktok: { lg: 'T', name: 'TikTok', what: t('Video ads', 'ভিডিও বিজ্ঞাপন'),
        p: [t('Pixel: all steps seen.', 'পিক্সেল: সব ধাপ দেখছে।'), t('Pixel sees visits but not purchases — TikTok cannot learn who buys.', 'পিক্সেল ভিজিট দেখছে কিন্তু কেনা দেখছে না — TikTok বুঝতে পারছে না কে কেনে।'), t('Pixel: not installed.', 'পিক্সেল: বসানো নেই।')],
        c: [t('Server-side tracking: on.', 'সার্ভার থেকে ট্র্যাকিং: চালু।'), t('Partly working.', 'আংশিক চলছে।'), t('Server-side tracking: off.', 'সার্ভার থেকে ট্র্যাকিং: বন্ধ।')] },
      merchant: { lg: 'M', name: 'Google Merchant Center', what: t('Product list for Google Shopping', 'গুগল শপিং-এর প্রোডাক্ট তালিকা'),
        p: [t('Products sent from the shop automatically.', 'দোকান থেকে প্রোডাক্ট নিজে থেকেই যায়।'), t('Some products rejected.', 'কিছু প্রোডাক্ট বাতিল হয়েছে।'), t('Not linked.', 'যুক্ত নেই।')],
        c: [t('Free listings on Google: on.', 'গুগলে ফ্রি লিস্টিং: চালু।'), t('Free listings partly on.', 'ফ্রি লিস্টিং আংশিক।'), t('Free listings: off.', 'ফ্রি লিস্টিং: বন্ধ।')] },
    };
    const cards = Object.keys(info).map((k) => {
      const a = ac[k], i = info[k];
      const fix = a.connected && (a.pixel === 'warn' || a.capi === 'warn' || a.capi === 'off');
      return U().card('', `<div class="mkt-acc"><div class="row" style="flex-wrap:nowrap"><span class="lg" style="background:${CHCOL[k === 'facebook' ? 'Facebook' : k === 'google' ? 'Google' : k === 'tiktok' ? 'TikTok' : 'Merchant']}">${i.lg}</span><div class="grow" style="min-width:0"><b>${i.name}</b><div class="muted small">${i.what}</div></div>${a.connected ? U().badge(t('Connected', 'যুক্ত'), 'good') : U().badge(t('Not connected', 'যুক্ত নয়'), '')}</div>
        ${a.connected ? `<div class="small muted">${A.esc(a.name)} · ${t('last data', 'শেষ ডেটা')} ${F().ago(a.lastImport)}</div>${st(a.pixel, i.p[0], i.p[1], i.p[2])}${st(a.capi, i.c[0], i.c[1], i.c[2])}` : `<div class="small muted">${t('Connect to see spend and results here and send purchases back to the ad platform.', 'যুক্ত করলে খরচ ও ফলাফল এখানে দেখবেন, আর কেনার তথ্য প্ল্যাটফর্মে যাবে।')}</div>`}
        <div class="row">${a.connected ? `<button class="btn sm" data-imp="${k}">${A.icon('sync')}${t('Import now', 'এখনই আনুন')}</button>${fix ? `<button class="btn sm primary" data-fix="${k}">${t('Fix tracking', 'ট্র্যাকিং ঠিক করুন')}</button>` : ''}<button class="btn sm ghost danger" data-dis="${k}">${t('Disconnect', 'বিচ্ছিন্ন')}</button>` : `<button class="btn sm primary" data-con="${k}">${t('Connect', 'যুক্ত করুন')}</button>`}</div></div>`);
    }).join('');
    const issues = Object.keys(info).filter((k) => ac[k].connected && (ac[k].pixel !== 'ok' || ac[k].capi !== 'ok')).length;
    el.innerHTML = A.pageHead(t('Ad accounts', 'বিজ্ঞাপন অ্যাকাউন্ট'), t('Which ad platforms are linked, and whether they can see your sales correctly.', 'কোন প্ল্যাটফর্ম যুক্ত আর তারা আপনার বিক্রি ঠিকমতো দেখছে কি না।')) + toolsBar('accounts') +
      (issues ? U().callout(t(`<b>${issues} account${issues > 1 ? 's' : ''}</b> cannot see every sale. Ads learn from purchases — fixing tracking usually lowers the cost per order.`, `<b>${issues}টি অ্যাকাউন্ট</b> সব বিক্রি দেখতে পাচ্ছে না। বিজ্ঞাপন কেনা দেখে শেখে — ট্র্যাকিং ঠিক করলে সাধারণত প্রতি অর্ডারের খরচ কমে।`), 'warn', 'warn') : U().callout(t('All accounts see every sale correctly.', 'সব অ্যাকাউন্ট সব বিক্রি ঠিকমতো দেখছে।'), 'good', 'check')) +
      `<div class="grid g2">${cards}</div>`;
    A.on(el, '[data-imp]', 'click', (e, b) => { ac[b.dataset.imp].lastImport = A.TODAY.toISOString(); A.commit(`Imported data from ${info[b.dataset.imp].name}`); A.toast(t('Latest spend and results imported', 'সর্বশেষ খরচ ও ফলাফল আনা হয়েছে'), 'good'); A.render(); });
    A.on(el, '[data-fix]', 'click', (e, b) => { const a = ac[b.dataset.fix]; a.pixel = 'ok'; a.capi = 'ok'; A.commit(`Tracking fixed for ${info[b.dataset.fix].name}`); A.toast(t('Tracking fixed — purchases are now sent', 'ট্র্যাকিং ঠিক হয়েছে — এখন কেনার তথ্য যাচ্ছে'), 'good'); A.render(); });
    A.on(el, '[data-dis]', 'click', (e, b) => U().confirm(t('Disconnect this account?', 'অ্যাকাউন্ট বিচ্ছিন্ন করবেন?'), t('Ads keep running in the platform, but this admin will stop showing spend and sending purchases.', 'প্ল্যাটফর্মে বিজ্ঞাপন চলতেই থাকবে, কিন্তু এখানে খরচ দেখাবে না আর কেনার তথ্য যাবে না।'), t('Disconnect', 'বিচ্ছিন্ন করুন'), () => { ac[b.dataset.dis].connected = false; A.commit(`Disconnected ${info[b.dataset.dis].name}`); A.toast(t('Disconnected', 'বিচ্ছিন্ন হয়েছে'), 'good'); A.render(); }, true));
    A.on(el, '[data-con]', 'click', (e, b) => { const k = b.dataset.con; const m = U().modal(t('Connect ', 'যুক্ত করুন: ') + info[k].name, `<p style="margin:0">${t('A sign-in window opens. Log in with the account that owns the ads and press Allow. Nothing else to type.', 'একটা সাইন-ইন উইন্ডো খুলবে। যে অ্যাকাউন্টে বিজ্ঞাপন আছে তা দিয়ে লগইন করে Allow চাপুন। আর কিছু লিখতে হবে না।')}</p>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="cn-ok">${t('Sign in and allow', 'সাইন-ইন করে অনুমতি দিন')}</button>` }); m.parentElement.querySelector('#cn-ok').onclick = () => { Object.assign(ac[k], { connected: true, lastImport: A.TODAY.toISOString(), pixel: 'ok', capi: 'ok' }); U().close(); A.commit(`Connected ${info[k].name}`); A.toast(t('Connected', 'যুক্ত হয়েছে'), 'good'); A.render(); }; });
  }

  /* ================= Landing pages ================= */
  const TPL = { collection: ['Collection page', 'কালেকশন পেজ'], product: ['Single product', 'একটি প্রোডাক্ট'], offer: ['Offer with countdown', 'কাউন্টডাউন অফার'], preorder: ['Pre-order', 'প্রি-অর্ডার'] };
  function renderLanding(el) {
    const mk = M(); const L = mk.landing;
    const live = L.filter((x) => x.status === 'live');
    const visits = A.sum(L, (x) => x.visits), orders = A.sum(L, (x) => x.orders);
    const r = A.calc.range('30d'); const k = A.calc.kpis(r).cur;
    const best = L.filter((x) => x.visits).sort((a, b) => b.orders / b.visits - a.orders / a.visits)[0];
    const cols = [
      { h: t('Page', 'পেজ'), f: (x) => `<b>${A.esc(x.name)}</b><div class="muted small mono">extas.com.bd/lp/${A.esc(x.slug)}</div>` },
      { h: t('Type', 'ধরন'), f: (x) => t(TPL[x.template][0], TPL[x.template][1]), hide: 1 },
      { h: t('Status', 'অবস্থা'), f: (x) => U().badge({ live: t('Live', 'লাইভ'), draft: t('Draft', 'খসড়া'), ended: t('Ended', 'শেষ') }[x.status], { live: 'good', draft: '', ended: 'warn' }[x.status]) },
      { h: t('Visits', 'ভিজিট'), r: 1, f: (x) => F().num(x.visits) },
      { h: t('Orders', 'অর্ডার'), r: 1, f: (x) => F().num(x.orders), hide: 1 },
      { h: t('Conversion', 'কনভার্সন'), r: 1, f: (x) => (x.visits ? `<b>${F().pct(x.orders / x.visits * 100)}</b>` : '—') },
      { h: t('Sales', 'বিক্রি'), r: 1, f: (x) => F().tk(x.sales), hide: 1 },
    ];
    el.innerHTML = A.pageHead(t('Landing pages', 'ল্যান্ডিং পেজ'), t('One focused page per campaign — ads send people here instead of the home page.', 'প্রতি ক্যাম্পেইনে একটা আলাদা পেজ — বিজ্ঞাপনের লোক হোমপেজে না গিয়ে এখানে আসে।'), `<button class="btn primary" id="lp-new">${A.icon('plus')}${t('Create from template', 'টেমপ্লেট থেকে তৈরি')}</button>`) + toolsBar('landing') +
      `<div class="grid g4">
        ${U().card('', U().kpi({ label: t('Live pages', 'লাইভ পেজ'), value: live.length, sub: t(`${L.length} in total`, `মোট ${L.length}টি`) }))}
        ${U().card('', U().kpi({ label: t('Visits', 'ভিজিট'), value: F().num(visits) }))}
        ${U().card('', U().kpi({ label: t('Orders', 'অর্ডার'), value: F().num(orders), sub: F().tk(A.sum(L, (x) => x.sales)) }))}
        ${U().card('', U().kpi({ label: t('Conversion', 'কনভার্সন'), value: F().pct(visits ? orders / visits * 100 : 0), sub: t(`whole site: ${F().pct(k.conv)}`, `পুরো সাইট: ${F().pct(k.conv)}`) }))}
      </div>
      ${best ? U().callout(t(`<b>${A.esc(best.name)}</b> turns ${F().pct(best.orders / best.visits * 100)} of visitors into buyers — ${(best.orders / best.visits * 100 / Math.max(0.1, k.conv)).toFixed(1)}× the rest of the site. Use its template for the next campaign.`, `<b>${A.esc(best.name)}</b> ভিজিটরের ${F().pct(best.orders / best.visits * 100)} কে ক্রেতা বানায় — বাকি সাইটের ${(best.orders / best.visits * 100 / Math.max(0.1, k.conv)).toFixed(1)} গুণ। পরের ক্যাম্পেইনে এই টেমপ্লেট নিন।`), 'good', 'check') : ''}
      ${U().card(t('Pages', 'পেজ'), U().table(cols, L.map((x) => ({ ...x, _id: x.id })), { onRow: true }))}`;
    el.querySelector('#lp-new').onclick = () => {
      const m = U().modal(t('New landing page', 'নতুন ল্যান্ডিং পেজ'), `<div class="mkt-grp" id="lp-t">${Object.keys(TPL).map((k2, i) => `<button data-t="${k2}" class="${i === 0 ? 'on' : ''}"><b>${t(TPL[k2][0], TPL[k2][1])}</b><span>${{ collection: t('Grid of one category', 'একটা ক্যাটাগরির গ্রিড'), product: t('Big photos, size help, order button', 'বড় ছবি, সাইজ সাহায্য, অর্ডার বাটন'), offer: t('Timer, offer price, combos', 'টাইমার, অফার দাম, কম্বো'), preorder: t('Take orders before stock arrives', 'স্টক আসার আগে অর্ডার নিন') }[k2]}</span></button>`).join('')}</div>
        <div class="formgrid">${U().field(t('Page name', 'পেজের নাম'), U().input('lp-name', '', `placeholder="${t('e.g. Victory Day collection', 'যেমন: বিজয় দিবস কালেকশন')}"`))}${U().field(t('Products from', 'প্রোডাক্ট'), U().select('lp-cat', A.CATS.map((c) => [c.id, A.t(c.en, c.bn)]), 'polo'))}</div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="lp-ok">${t('Create draft', 'খসড়া তৈরি')}</button>` });
      let tp = 'collection';
      m.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tp = b.dataset.t; m.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); }));
      m.parentElement.querySelector('#lp-ok').onclick = () => {
        const name = m.querySelector('#lp-name').value.trim(); if (!name) { A.toast(t('Give the page a name', 'পেজের নাম দিন'), 'bad'); return; }
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'page-' + (L.length + 1);
        L.unshift({ id: A.uid('LP'), name, slug, template: tp, cat: m.querySelector('#lp-cat').value, status: 'draft', visits: 0, orders: 0, sales: 0, created: F().ymd(A.TODAY) });
        U().close(); A.commit(`Landing page ${name} created`); A.toast(t('Draft created — publish when ready', 'খসড়া তৈরি — তৈরি হলে পাবলিশ করুন'), 'good'); A.render();
      };
    };
    A.on(el, 'tr[data-row]', 'click', (e, tr) => {
      const x = L.find((p) => p.id === tr.dataset.row); const cat = A.byId(A.CATS, x.cat);
      const prods = A.D.products.filter((p) => p.cat === x.cat && p.status === 'live').slice(0, 6);
      const d = U().drawer(A.esc(x.name), `${U().card('', `<div class="grid g3">${U().kpi({ label: t('Visits', 'ভিজিট'), value: F().num(x.visits) })}${U().kpi({ label: t('Orders', 'অর্ডার'), value: F().num(x.orders) })}${U().kpi({ label: t('Conversion', 'কনভার্সন'), value: x.visits ? F().pct(x.orders / x.visits * 100) : '—' })}</div>`)}
        ${U().card(t('On this page', 'এই পেজে আছে'), `<div class="muted small" style="margin-bottom:8px">${t(TPL[x.template][0], TPL[x.template][1])} · ${cat ? A.t(cat.en, cat.bn) : ''}</div><div class="list">${prods.map((p) => `<a class="li" style="text-decoration:none" href="${A.href('products', 'all', p.id)}">${U().thumb(p, 34)}<span class="grow ellip">${A.esc(p.name)}</span><b>${F().tk(p.price)}</b></a>`).join('')}</div>`)}
        <div class="row"><button class="btn sm" id="lp-copy">${t('Copy link for ads', 'বিজ্ঞাপনের লিংক কপি')}</button></div>`,
      { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>${x.status === 'live' ? `<button class="btn dark" id="lp-tog">${t('End page', 'পেজ শেষ করুন')}</button>` : `<button class="btn primary" id="lp-tog">${t('Publish', 'পাবলিশ')}</button>`}` });
      d.querySelector('#lp-copy').onclick = () => U().copy(`https://extas.com.bd/lp/${x.slug}?utm_source=facebook`);
      d.parentElement.querySelector('#lp-tog').onclick = () => { x.status = x.status === 'live' ? 'ended' : 'live'; U().close(); A.commit(`Landing page ${x.name} ${x.status === 'live' ? 'published' : 'ended'}`); A.toast(x.status === 'live' ? t('Page is live', 'পেজ লাইভ হয়েছে') : t('Page ended — visitors go to the collection', 'পেজ শেষ — ভিজিটর কালেকশনে যাবে'), 'good'); A.render(); };
    });
  }

  /* ================= Refer a friend ================= */
  function renderReferrals(el) {
    const mk = M(); const R = mk.ref; const cs = A.D.customers;
    const sharers = cs.filter((c) => c.delivered >= 2).length;
    const ready = R.giver !== '' && R.friend !== '';
    el.innerHTML = A.pageHead(t('Refer a friend', 'রেফারেল'), t('Happy customers share a link; the friend gets a discount on the first order and the sharer gets a reward after delivery.', 'খুশি কাস্টমার লিংক শেয়ার করেন; বন্ধু প্রথম অর্ডারে ছাড় পান, আর ডেলিভারির পরে শেয়ারকারী রিওয়ার্ড পান।')) + toolsBar('referrals') +
      `<div class="grid g3">
        ${U().card('', U().kpi({ label: t('Referral program', 'রেফারেল প্রোগ্রাম'), value: R.on ? t('On', 'চালু') : t('Off', 'বন্ধ'), sub: R.on ? t('Link shows in My account', 'মাই অ্যাকাউন্টে লিংক দেখায়') : t('Customers do not see it', 'কাস্টমার দেখতে পান না') }))}
        ${U().card('', U().kpi({ label: t('Referrals this month', 'এই মাসে রেফারেল'), value: F().num(R.joined.length), sub: R.on ? t(`${R.joined.filter((j) => j.done).length} rewarded`, `${R.joined.filter((j) => j.done).length} জন রিওয়ার্ড পেয়েছেন`) : t('starts when you turn it on', 'চালু করলে শুরু হবে') }))}
        ${U().card('', U().kpi({ label: t('Customers who could share', 'যারা শেয়ার করতে পারেন'), value: F().num(sharers), sub: t('2+ delivered orders', '2+ অর্ডার ডেলিভারি পেয়েছেন') }))}
      </div>
      ${U().card(t('How it works', 'কীভাবে কাজ করে'), `<div class="mkt-flow"><div><b>1</b>${t('Customer shares their link from My account or the thank-you SMS.', 'কাস্টমার মাই অ্যাকাউন্ট বা ধন্যবাদ SMS থেকে লিংক শেয়ার করেন।')}</div><div><b>2</b>${t('Friend gets the discount on their first order.', 'বন্ধু প্রথম অর্ডারে ছাড় পান।')}</div><div><b>3</b>${t('After the friend’s parcel is delivered (not just ordered), the reward goes to the sharer’s wallet.', 'বন্ধুর পার্সেল ডেলিভারি হলে (শুধু অর্ডার নয়) শেয়ারকারীর ওয়ালেটে রিওয়ার্ড যায়।')}</div><div><b>4</b>${t('Same phone or address cannot refer itself — checked automatically.', 'একই ফোন বা ঠিকানা নিজেকে রেফার করতে পারে না — নিজে থেকেই যাচাই হয়।')}</div></div>`)}
      ${U().card(t('Reward settings', 'রিওয়ার্ড সেটিংস'), `<div class="row between" style="margin-bottom:12px"><div><b>${t('Turn on refer-a-friend', 'রেফারেল চালু করুন')}</b><div class="muted small">${t('Fill both rewards first. Off by default.', 'আগে দুটো রিওয়ার্ড লিখুন। শুরুতে বন্ধ।')}</div></div>${U().switch('rf-on', R.on)}</div>
        <div class="formgrid">
          ${U().field(t('Reward for the sharer (wallet)', 'শেয়ারকারীর রিওয়ার্ড (ওয়ালেট)'), U().money('rf-giver', R.giver, `placeholder="${t('not set', 'দেওয়া নেই')}"`))}
          ${U().field(t('Friend’s discount on first order', 'বন্ধুর প্রথম অর্ডারে ছাড়'), U().money('rf-friend', R.friend, `placeholder="${t('not set', 'দেওয়া নেই')}"`))}
          ${U().field(t('Friend’s minimum order', 'বন্ধুর ন্যূনতম অর্ডার'), U().money('rf-min', R.min, `placeholder="${t('no minimum', 'সীমা নেই')}"`))}
          ${U().field(t('Most rewards per customer per month', 'মাসে একজনের সর্বোচ্চ রিওয়ার্ড'), U().input('rf-limit', R.limit, `type="number" placeholder="${t('no limit', 'সীমা নেই')}"`))}
        </div>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="rf-save">${t('Save settings', 'সেটিংস সেভ')}</button>${ready ? `<span class="muted small">${t(`Cost per new customer: ${F().tk(Number(R.giver) + Number(R.friend))}`, `প্রতি নতুন কাস্টমারে খরচ: ${F().tk(Number(R.giver) + Number(R.friend))}`)}</span>` : ''}</div>`)}`;
    el.querySelector('#rf-save').onclick = () => {
      const v = (id) => el.querySelector(id).value.trim();
      const nv = { giver: v('#rf-giver'), friend: v('#rf-friend'), min: v('#rf-min'), limit: v('#rf-limit') };
      const changed = nv.giver !== String(R.giver) || nv.friend !== String(R.friend);
      const apply = () => { Object.assign(R, nv); A.commit('Referral rewards saved'); A.toast(t('Referral settings saved', 'রেফারেল সেটিংস সেভ হয়েছে'), 'good'); A.render(); };
      if (changed && (nv.giver || nv.friend)) pinAsk(t('Save reward amounts?', 'রিওয়ার্ডের টাকা সেভ করবেন?'), t(`Sharer gets ${nv.giver ? '৳' + nv.giver : 'nothing'}, friend gets ${nv.friend ? '৳' + nv.friend : 'nothing'} off.`, `শেয়ারকারী পাবেন ${nv.giver ? '৳' + nv.giver : 'কিছু না'}, বন্ধু ছাড় পাবেন ${nv.friend ? '৳' + nv.friend : 'কিছু না'}।`), t('Save', 'সেভ'), apply);
      else apply();
    };
    el.querySelector('#rf-on').onchange = (e) => {
      if (e.target.checked && !(R.giver && R.friend)) { e.target.checked = false; A.toast(t('Set both rewards and save first', 'আগে দুটো রিওয়ার্ড লিখে সেভ করুন'), 'bad'); return; }
      R.on = e.target.checked; A.commit(`Refer-a-friend ${R.on ? 'on' : 'off'}`); A.toast(R.on ? t('Refer-a-friend is on — customers see their link', 'রেফারেল চালু — কাস্টমাররা লিংক দেখছেন') : t('Refer-a-friend is off', 'রেফারেল বন্ধ'), 'good'); A.render();
    };
  }

  /* ================= Marketing calendar ================= */
  const MONTHS = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
  const TYPES = { holiday: ['Holiday', 'ছুটি/উৎসব'], day: ['Shopping day', 'শপিং দিবস'], ad: ['Ads', 'বিজ্ঞাপন'], msg: ['SMS/WhatsApp', 'SMS/WhatsApp'], offer: ['Offer', 'অফার'], post: ['Post/blog', 'পোস্ট/ব্লগ'] };
  function renderCalendar(el) {
    const mk = M(); const ym = mk.calMonth || '2026-11';
    const [y, mo] = ym.split('-').map(Number);
    const first = Date.UTC(y, mo - 1, 1); const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const off = (new Date(first).getUTCDay() + 1) % 7; // week starts Saturday
    const today = F().ymd(A.TODAY);
    const cells = []; for (let i = 0; i < off; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`); while (cells.length % 7) cells.push(null);
    const evOn = (d) => mk.cal.filter((e) => e.from <= d && e.to >= d);
    const mname = new Date(first).toLocaleDateString(A.lang === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' });
    const wd = A.lang === 'bn' ? ['শনি', 'রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র'] : ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const inMonth = mk.cal.filter((e) => e.to >= ym + '-01' && e.from <= ym + '-31').sort((a, b) => a.from.localeCompare(b.from));
    const upcoming = mk.cal.filter((e) => e.type === 'holiday' && e.from > today).sort((a, b) => a.from.localeCompare(b.from))[0];
    const daysTo = upcoming ? Math.round((dayT(upcoming.from) - dayT(today)) / DAY) : 0;
    const prepared = upcoming ? mk.cal.some((e) => e !== upcoming && ['ad', 'offer', 'msg'].includes(e.type) && e.to >= ymdAdd(upcoming.from, -14) && e.from <= upcoming.from) : true;
    const idx = MONTHS.indexOf(ym);
    el.innerHTML = A.pageHead(t('Marketing calendar', 'মার্কেটিং ক্যালেন্ডার'), t('Holidays, offers, ads and messages on one calendar, so nothing big comes as a surprise.', 'ছুটি, অফার, বিজ্ঞাপন ও মেসেজ এক ক্যালেন্ডারে — বড় কোনো দিন হঠাৎ এসে পড়বে না।'), `<button class="btn primary" id="cal-add">${A.icon('plus')}${t('Add to calendar', 'ক্যালেন্ডারে যোগ')}</button>`) + A.tabsBar('marketing', 'calendar') +
      (upcoming ? U().callout(t(`Next big day: <b>${A.esc(upcoming.title)}</b> in ${daysTo} days (${F().date(upcoming.from)}). ${prepared ? 'Ads or an offer are already planned before it.' : 'Nothing is planned for the 2 weeks before it yet — plan stock, ads and an SMS now.'}`, `পরের বড় দিন: <b>${A.esc(upcoming.title)}</b>, ${daysTo} দিন পরে (${F().date(upcoming.from)})। ${prepared ? 'এর আগে বিজ্ঞাপন বা অফার ঠিক করা আছে।' : 'এর আগের 2 সপ্তাহে এখনো কিছু ঠিক করা নেই — এখনই স্টক, বিজ্ঞাপন ও SMS প্ল্যান করুন।'}`), prepared ? 'good' : 'warn', prepared ? 'check' : 'warn') : '') +
      U().card('', `<div class="row between" style="margin-bottom:10px"><div class="row"><button class="btn sm" id="cal-prev" ${idx <= 0 ? 'disabled' : ''}>‹</button><h3 style="min-width:150px;text-align:center">${mname}</h3><button class="btn sm" id="cal-next" ${idx >= MONTHS.length - 1 ? 'disabled' : ''}>›</button></div><div class="legend">${Object.keys(TYPES).map((k) => `<span><span class="mkt-ev ${k}" style="width:12px;height:12px;padding:0;display:inline-block"></span>${t(TYPES[k][0], TYPES[k][1])}</span>`).join('')}</div></div>
        <div class="mkt-cal">${wd.map((w) => `<div class="hd">${w}</div>`).join('')}${cells.map((d) => (d ? `<div class="dc ${d === today ? 'today' : ''}"><span class="dn">${Number(d.slice(8))}</span>${evOn(d).slice(0, 3).map((e) => `<div class="mkt-ev ${e.type}" data-ev="${e.id}" title="${A.esc(e.title)}"><span>${A.esc(e.title)}</span></div>`).join('')}${evOn(d).length > 3 ? `<span class="muted" style="font-size:10px">+${evOn(d).length - 3}</span>` : ''}</div>` : '<div class="dc out"></div>')).join('')}</div>`) +
      U().card(t('This month, in order', 'এই মাসে, ক্রমানুসারে'), inMonth.length ? `<div class="list">${inMonth.map((e) => `<div class="li" data-ev="${e.id}" style="cursor:pointer"><span class="mkt-ev ${e.type}" style="width:10px;height:28px;padding:0;flex:none"></span><div class="grow"><b>${A.esc(e.title)}</b><div class="muted small">${F().date(e.from)}${e.to !== e.from ? ' – ' + F().date(e.to) : ''} · ${t(TYPES[e.type][0], TYPES[e.type][1])}</div></div>›</div>`).join('')}</div>` : U().empty(t('Nothing planned this month', 'এই মাসে কিছু ঠিক করা নেই')));
    const nav = (n) => { mk.calMonth = MONTHS[idx + n]; A.save(); A.render(); };
    el.querySelector('#cal-prev').onclick = () => nav(-1); el.querySelector('#cal-next').onclick = () => nav(1);
    el.querySelector('#cal-add').onclick = () => calEdit(null, ym);
    A.on(el, '[data-ev]', 'click', (e, b) => calEdit(mk.cal.find((x) => x.id === b.dataset.ev), ym));
  }
  function calEdit(ev, ym) {
    const mk = M(); const isNew = !ev; const e = ev || { title: '', from: ym + '-15', to: ym + '-15', type: 'offer' };
    const m = U().modal(isNew ? t('Add to calendar', 'ক্যালেন্ডারে যোগ') : t('Calendar item', 'ক্যালেন্ডার আইটেম'), `<div class="formgrid">${U().field(t('Title', 'শিরোনাম'), U().input('ce-t', e.title, `placeholder="${t('e.g. Winter hoodie SMS', 'যেমন: শীতের হুডি SMS')}"`))}${U().field(t('Type', 'ধরন'), U().select('ce-k', Object.keys(TYPES).map((k) => [k, t(TYPES[k][0], TYPES[k][1])]), e.type))}${U().field(t('From', 'শুরু'), `<input class="inp" type="date" id="ce-f" value="${e.from}">`)}${U().field(t('To', 'শেষ'), `<input class="inp" type="date" id="ce-to" value="${e.to}">`)}</div>`,
      { foot: `${isNew ? '' : `<button class="btn danger" id="ce-del">${t('Remove', 'সরান')}</button>`}<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ce-ok">${t('Save', 'সেভ')}</button>` });
    const f = m.parentElement;
    f.querySelector('#ce-ok').onclick = () => {
      const title = m.querySelector('#ce-t').value.trim(); let from = m.querySelector('#ce-f').value, to = m.querySelector('#ce-to').value || from;
      if (!title || !from) { A.toast(t('Add a title and date', 'শিরোনাম ও তারিখ দিন'), 'bad'); return; }
      if (to < from) to = from;
      Object.assign(e, { title, from, to, type: m.querySelector('#ce-k').value });
      if (isNew) mk.cal.push({ id: A.uid('CL'), ...e });
      U().close(); A.commit(`Calendar: ${title} ${isNew ? 'added' : 'updated'}`); A.toast(t('Saved to calendar', 'ক্যালেন্ডারে সেভ হয়েছে'), 'good'); A.render();
    };
    const del = f.querySelector('#ce-del');
    if (del) del.onclick = () => { mk.cal = mk.cal.filter((x) => x !== ev); U().close(); A.commit(`Calendar: ${ev.title} removed`); A.toast(t('Removed from calendar', 'ক্যালেন্ডার থেকে সরানো হলো'), 'good'); A.render(); };
  }

  /* ================= Shopping feed ================= */
  function feedIssues() {
    const fd = M().feed; const live = A.D.products.filter((p) => p.status === 'live');
    const out = [];
    for (const p of live) {
      const stock = A.sum(p.variants, (v) => v.stock);
      if (!p.seo.desc) out.push({ p, k: 'desc', sev: 'bad', en: 'No description — Google rejects it', bn: 'বিবরণ নেই — গুগল বাতিল করে' });
      if (p.photos < 4) out.push({ p, k: 'photo', sev: 'warn', en: `Only ${p.photos} photos — 4+ get more clicks`, bn: `মাত্র ${p.photos}টি ছবি — 4+ ছবিতে বেশি ক্লিক` });
      if (!stock) out.push({ p, k: 'stock', sev: 'warn', en: 'Out of stock — hidden from ads', bn: 'স্টক নেই — বিজ্ঞাপনে দেখাবে না' });
    }
    return { live, out, gtin: !fd.ownBrand };
  }
  let feedF = 'all';
  function renderFeed(el) {
    const fd = M().feed; const { live, out, gtin } = feedIssues();
    const bad = new Set(out.filter((x) => x.sev === 'bad').map((x) => x.p.id));
    const ok = live.length - bad.size - (gtin ? 0 : 0);
    const list = out.filter((x) => feedF === 'all' || x.k === feedF);
    const cnt = (k) => out.filter((x) => x.k === k).length;
    el.innerHTML = A.pageHead(t('Google Shopping & Facebook catalog', 'গুগল শপিং ও Facebook ক্যাটালগ'), t('Your products go to Google and Facebook automatically, so they can show them in ads with photo and price.', 'আপনার প্রোডাক্ট নিজে থেকেই গুগল ও Facebook-এ যায়, যাতে ছবি ও দাম সহ বিজ্ঞাপনে দেখাতে পারে।'), `<button class="btn" id="fd-up">${A.icon('sync')}${t('Update feed now', 'এখনই ফিড আপডেট')}</button>`) + toolsBar('feed') +
      `<div class="grid g4">
        ${U().card('', U().kpi({ label: t('Products in feed', 'ফিডে প্রোডাক্ট'), value: F().num(live.length), sub: t('all live products', 'সব লাইভ প্রোডাক্ট') }))}
        ${U().card('', U().kpi({ label: t('Approved', 'অনুমোদিত'), value: F().num(ok), sub: F().pct(live.length ? ok / live.length * 100 : 0, 0) }))}
        ${U().card('', U().kpi({ label: t('Rejected', 'বাতিল'), value: F().num(bad.size), sub: t('must fix', 'ঠিক করতেই হবে') }))}
        ${U().card('', U().kpi({ label: t('Last updated', 'শেষ আপডেট'), value: F().ago(fd.updated), sub: t('every hour, with stock', 'প্রতি ঘণ্টায়, স্টক সহ') }))}
      </div>
      <div class="grid g2">
        ${U().card(t('Where the feed goes', 'ফিড কোথায় যায়'), `<div class="list"><div class="li"><b class="grow">Google Merchant Center</b>${U().badge(fd.google ? t('Sending', 'যাচ্ছে') : t('Stopped', 'বন্ধ'), fd.google ? 'good' : '')}${U().switch('fd-g', fd.google)}</div><div class="li"><b class="grow">Facebook & Instagram ${t('catalog', 'ক্যাটালগ')}</b>${U().badge(fd.fb ? t('Sending', 'যাচ্ছে') : t('Stopped', 'বন্ধ'), fd.fb ? 'good' : '')}${U().switch('fd-f', fd.fb)}</div></div>`)}
        ${U().card(t('Brand barcode (GTIN)', 'ব্র্যান্ড বারকোড (GTIN)'), gtin ? `${U().callout(t(`Google asks for a barcode on <b>${live.length} products</b>. EXTAS makes its own clothes, so mark them as your own brand — then no barcode is needed.`, `গুগল <b>${live.length}টি প্রোডাক্টে</b> বারকোড চাইছে। EXTAS নিজের কাপড় বানায়, তাই "নিজের ব্র্যান্ড" চিহ্ন দিন — তাহলে বারকোড লাগবে না।`), 'warn', 'warn')}<div class="row" style="margin-top:10px"><button class="btn primary" id="fd-own">${t('Mark all as own brand', 'সব নিজের ব্র্যান্ড হিসেবে চিহ্ন দিন')}</button></div>` : U().callout(t('All products are marked as your own brand (EXTAS). No barcode needed.', 'সব প্রোডাক্ট নিজের ব্র্যান্ড (EXTAS) হিসেবে চিহ্নিত। বারকোড লাগবে না।'), 'good', 'check'))}
      </div>
      ${U().card(t('Problems to fix', 'যা ঠিক করতে হবে'), `<div class="row between" style="margin-bottom:10px"><div class="chips" id="fd-ch">${[['all', t('All', 'সব'), out.length], ['desc', t('No description', 'বিবরণ নেই'), cnt('desc')], ['photo', t('Few photos', 'কম ছবি'), cnt('photo')], ['stock', t('Out of stock', 'স্টক নেই'), cnt('stock')]].map((c) => `<button class="chip ${feedF === c[0] ? 'on' : ''}" data-v="${c[0]}">${c[1]}<span class="c">${c[2]}</span></button>`).join('')}</div>${cnt('desc') ? `<button class="btn sm" id="fd-desc">${t(`Fill ${cnt('desc')} descriptions from template`, `${cnt('desc')}টি বিবরণ টেমপ্লেট থেকে লিখুন`)}</button>` : ''}</div>` +
        U().table([
          { h: t('Product', 'প্রোডাক্ট'), f: (x) => `<div class="cellmain">${U().thumb(x.p, 34)}<div style="min-width:0"><b class="ellip" style="max-width:220px">${A.esc(x.p.name)}</b><span class="muted small mono">${x.p.styleCode}</span></div></div>` },
          { h: t('Problem', 'সমস্যা'), f: (x) => `${U().badge(x.sev === 'bad' ? t('Rejected', 'বাতিল') : t('Warning', 'সতর্কতা'), x.sev)} <span class="small">${t(x.en, x.bn)}</span>` },
          { h: '', r: 1, f: (x) => `<a class="btn sm" href="${A.href('products', 'all', x.p.id)}">${t('Fix', 'ঠিক করুন')} →</a>` },
        ], list.slice(0, 40), { empty: t('No problems — every product is approved', 'কোনো সমস্যা নেই — সব প্রোডাক্ট অনুমোদিত') }) + (list.length > 40 ? `<div class="muted small" style="margin-top:8px">${t(`Showing 40 of ${list.length}`, `${list.length}টির মধ্যে 40টি দেখানো হচ্ছে`)}</div>` : ''))}`;
    el.querySelector('#fd-up').onclick = () => { fd.updated = A.TODAY.toISOString(); A.commit('Shopping feed updated'); A.toast(t(`Feed sent: ${live.length} products with today’s price and stock`, `ফিড পাঠানো হলো: আজকের দাম ও স্টক সহ ${live.length}টি প্রোডাক্ট`), 'good'); A.render(); };
    const own = el.querySelector('#fd-own'); if (own) own.onclick = () => { fd.ownBrand = true; A.commit('Feed: all products marked as own brand'); A.toast(t('Done — barcode warning cleared', 'হয়ে গেছে — বারকোড সতর্কতা নেই'), 'good'); A.render(); };
    const fdesc = el.querySelector('#fd-desc'); if (fdesc) fdesc.onclick = () => { let n = 0; for (const x of out.filter((z) => z.k === 'desc')) { const p = x.p; p.seo.desc = `Buy ${p.name} online in Bangladesh. ${p.fabric}, sizes ${p.sizes[0]}–${p.sizes[p.sizes.length - 1]}. Cash on delivery, easy exchange.`; n++; } const iss = (A.D.seoIssues || []).find((s) => s.id === 'S2'); if (iss) { iss.count = A.D.products.filter((p) => !p.seo.desc).length; if (!iss.count) iss.sev = 'good'; } A.commit(`Feed: ${n} product descriptions filled from template`); A.toast(t(`${n} descriptions written — products go to Google in the next update`, `${n}টি বিবরণ লেখা হলো — পরের আপডেটে গুগলে যাবে`), 'good'); A.render(); };
    A.on(el, '#fd-ch .chip', 'click', (e, b) => { feedF = b.dataset.v; A.render(); });
    el.querySelector('#fd-g').onchange = (e) => { fd.google = e.target.checked; A.commit(`Google feed ${fd.google ? 'on' : 'off'}`); A.toast(fd.google ? t('Sending to Google again', 'আবার গুগলে যাচ্ছে') : t('Google feed stopped — Shopping ads will stop showing products', 'গুগল ফিড বন্ধ — শপিং বিজ্ঞাপনে প্রোডাক্ট দেখাবে না'), 'good'); A.render(); };
    el.querySelector('#fd-f').onchange = (e) => { fd.fb = e.target.checked; A.commit(`Facebook catalog ${fd.fb ? 'on' : 'off'}`); A.toast(fd.fb ? t('Sending to Facebook again', 'আবার Facebook-এ যাচ্ছে') : t('Facebook catalog stopped — catalog ads will stop', 'Facebook ক্যাটালগ বন্ধ — ক্যাটালগ বিজ্ঞাপন থামবে'), 'good'); A.render(); };
  }

  /* ================= v2: period, overview, campaign page, audiences, plan, tools ================= */
  A.css('mkt2', `
  .mk2-per{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
  .mk2-ai{display:flex;gap:10px;align-items:flex-start;background:var(--accent-soft);border-radius:12px;padding:10px 12px;font-size:13.5px;margin-bottom:12px}
  .mk2-ai b.tag{background:var(--accent);color:var(--card);border-radius:6px;padding:1px 7px;font-size:11.5px;flex:none}
  .mk2-eye{display:flex;flex-direction:column;gap:8px}
  .mk2-eye a{display:flex;gap:10px;align-items:center;padding:9px 10px;border:1px solid var(--line);border-radius:10px;color:var(--ink);text-decoration:none;font-size:13px;min-width:0}
  .mk2-eye a:hover{border-color:var(--accent)}
  .mk2-trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  .mk2-trio div{background:var(--card2);border-radius:12px;padding:12px;min-width:0}
  .mk2-trio b{display:block;font:700 24px var(--f-head);font-variant-numeric:tabular-nums}
  .mk2-trio span{font-size:12px;color:var(--muted)}
  .mk2-ad{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);min-width:0}
  .mk2-ad:last-child{border-bottom:0}
  .mk2-ad .tx{flex:1;min-width:0}
  .mk2-ad .tx b{display:block;font-size:13.5px}
  .mk2-ad .tx span{font-size:12px;color:var(--muted)}
  .mk2-shareb{display:flex;flex-direction:column;gap:7px}
  .mk2-shareb .r{display:grid;grid-template-columns:minmax(0,120px) 1fr auto;gap:8px;align-items:center;font-size:12.5px}
  .mk2-phone{border:8px solid var(--ink);border-radius:26px;padding:14px 10px;background:var(--card2);max-width:280px;margin:0 auto;min-height:260px}
  .mk2-bub{background:var(--card);border-radius:12px 12px 12px 3px;padding:9px 11px;font-size:13px;white-space:pre-wrap;box-shadow:0 1px 2px rgba(0,0,0,.08);overflow-wrap:anywhere}
  .mk2-sum{display:grid;grid-template-columns:minmax(0,130px) 1fr;gap:6px 12px;font-size:13px}
  .mk2-sum dt{color:var(--muted)} .mk2-sum dd{margin:0;min-width:0;overflow-wrap:anywhere}
  .mk2-sub{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
  .mk2-prop{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .mk2-prop:last-child{border-bottom:0}
  .mk2-prop .tx{flex:1;min-width:200px}
  @media (max-width:700px){.mk2-trio{grid-template-columns:1fr}.mk2-trio b{font-size:20px}.mk2-sum{grid-template-columns:1fr}}
  `);
  let per = '30d';
  const PLAT = { AD1: 'Facebook', AD2: 'Facebook', AD3: 'Instagram', AD4: 'Google Search', AD5: 'Google Shopping', AD6: 'TikTok' };
  const plat = (c) => c.plat || PLAT[c.id] || c.ch;
  const PCOL = { Facebook: '#1877f2', Instagram: '#c13584', 'Google Search': '#ea4335', 'Google Shopping': '#34a853', YouTube: '#ff0000', 'Google PMax': '#fbbc04', TikTok: '#111111' };
  const CCAT = { AD1: 'polo', AD2: 'shirt', AD3: 'panjabi', AD4: 'polo', AD5: 'tshirt', AD6: 'hoodie' };
  const perName = () => (U().rangeOpts().find((o) => o[0] === per) || ['', ''])[1];
  const perBar = (extra = '') => `<div class="mk2-per">${U().seg('mk2-per', U().rangeOpts(), per)}<span class="muted small">${t('compared with the period before', 'আগের সমান সময়ের সাথে তুলনা')}</span>${extra}</div>`;
  const wirePer = (el) => A.on(el, '#mk2-per button', 'click', (e, b) => { per = b.dataset.v; A.render(); });
  const VERD = (s) => (s.roas >= 4 ? 'scale' : s.roas >= 2.5 ? 'keep' : s.roas >= 1.5 ? 'fix' : 'stop');
  function allRows(r) {
    const chC = chStats(r.from, r.to), chP = chStats(r.prevFrom, r.prevTo);
    return A.D.campaigns.map((c) => { const s = campStats(c, r.from, r.to, chC); const p = campStats(c, r.prevFrom, r.prevTo, chP); return { _id: c.id, c, s, p, v: verdict(c, s) }; });
  }
  const sumK = (rows, k, w = 's') => A.sum(rows, (x) => x[w][k]);
  const aiBox = (html) => `<div class="mk2-ai"><b class="tag">AI</b><span>${html}</span></div>`;
  function needsEye(rows) {
    const out = [];
    for (const x of rows) {
      if (x.c.status !== 'on' || !x.s.spend) continue;
      const rr = x.s.orders ? x.s.returned / x.s.orders : 0;
      if (x.v.k === 'stop') out.push([x, 'bad', t('Stop', 'বন্ধ করুন'), t(`${A.esc(x.c.name)}: ${F().tk(x.s.spend)} spent, ${F().num(Math.round(x.s.delivered))} delivered`, `${A.esc(x.c.name)}: ${F().tk(x.s.spend)} খরচ, ${F().num(Math.round(x.s.delivered))}টি ডেলিভারি`)]);
      else if (rr > 0.2) out.push([x, 'warn', t('Fix', 'ঠিক করুন'), t(`${A.esc(x.c.name)}: ${F().pct(rr * 100, 0)} of orders come back`, `${A.esc(x.c.name)}: ${F().pct(rr * 100, 0)} অর্ডার ফেরত আসে`)]);
      else if (x.v.k === 'scale') out.push([x, 'good', t('Scale', 'বাড়ান'), t(`${A.esc(x.c.name)}: ৳${x.s.roas.toFixed(1)} per ৳1, budget only ${F().tk(x.c.daily)}/day`, `${A.esc(x.c.name)}: ৳1-এ ৳${x.s.roas.toFixed(1)}, বাজেট মাত্র ${F().tk(x.c.daily)}/দিন`)]);
      else if (x.v.k === 'fix') out.push([x, 'warn', t('Fix', 'ঠিক করুন'), t(`${A.esc(x.c.name)}: only ৳${x.s.roas.toFixed(1)} per ৳1`, `${A.esc(x.c.name)}: ৳1-এ মাত্র ৳${x.s.roas.toFixed(1)}`)]);
    }
    return out;
  }
  function aiLine(rows) {
    const on = rows.filter((x) => x.s.spend);
    const best = on.slice().sort((a, b) => b.s.profit - a.s.profit)[0]; const worst = on.slice().sort((a, b) => a.s.profit - b.s.profit)[0];
    const hiRet = on.filter((x) => x.s.orders > 2).sort((a, b) => b.s.returned / b.s.orders - a.s.returned / a.s.orders)[0];
    const parts = [];
    if (best) parts.push(t(`${A.esc(best.c.name)} brings the most profit after ads (${F().tk(best.s.profit)}).`, `${A.esc(best.c.name)} বিজ্ঞাপন খরচ বাদে সবচেয়ে বেশি লাভ দিচ্ছে (${F().tk(best.s.profit)})।`));
    if (worst && worst !== best && worst.s.profit < 0) parts.push(t(`${A.esc(worst.c.name)} lost ${F().tk(-worst.s.profit)} — pause it or change the video.`, `${A.esc(worst.c.name)} ${F().tk(-worst.s.profit)} লস করেছে — পজ করুন বা ভিডিও বদলান।`));
    else if (worst && worst !== best) parts.push(t(`${A.esc(worst.c.name)} earns the least (${F().tk(worst.s.profit)}).`, `${A.esc(worst.c.name)} সবচেয়ে কম লাভ দিচ্ছে (${F().tk(worst.s.profit)})।`));
    if (hiRet) parts.push(t(`${A.esc(hiRet.c.name)}: ${F().pct(hiRet.s.returned / hiRet.s.orders * 100, 0)} of orders come back.`, `${A.esc(hiRet.c.name)}: ${F().pct(hiRet.s.returned / hiRet.s.orders * 100, 0)} অর্ডার ফেরত আসে।`));
    return `${perName()} · ` + parts.join(' ');
  }

  /* ---------- Overview ---------- */
  function renderOverview(el) {
    const r = A.calc.range(per); const rows = allRows(r);
    const spend = sumK(rows, 'spend'), spendP = sumK(rows, 'spend', 'p'), sales = sumK(rows, 'sales'), salesP = sumK(rows, 'sales', 'p');
    const del = sumK(rows, 'delivered'), delP = sumK(rows, 'delivered', 'p'); const prof = sumK(rows, 'profit'), profP = sumK(rows, 'profit', 'p');
    const roas = spend ? sales / spend : 0, roasP = spendP ? salesP / spendP : 0;
    const byPlat = {}; for (const x of rows) { const k = plat(x.c); byPlat[k] = byPlat[k] || { spend: 0, sales: 0 }; byPlat[k].spend += x.s.spend; byPlat[k].sales += x.s.sales; }
    const plats = Object.keys(byPlat).map((k) => ({ k, roas: byPlat[k].spend ? byPlat[k].sales / byPlat[k].spend : 0 })).sort((a, b) => b.roas - a.roas);
    const eye = needsEye(rows);
    const days = A.calc.daily(r.from, r.to, (d) => d);
    const dch = {}; const chD = (d) => (dch[d] = dch[d] || chStats(dayT(d) - 12 * 36e5, dayT(d) + 12 * 36e5));
    const mk = M(); const msgs = mk.msgs.filter((m) => m.status === 'sent' && inR(m, r.from, r.to));
    el.innerHTML = A.pageHead(t('Marketing', 'মার্কেটিং'), t('From ad money to real profit. Every figure uses delivered orders, not just placed ones.', 'বিজ্ঞাপনের টাকা থেকে আসল লাভ পর্যন্ত। সব হিসাব ডেলিভারি হওয়া অর্ডার দিয়ে।'),
      `<a class="btn" href="${A.href('marketing', 'plan')}">${t('Plan & ideas', 'পরিকল্পনা ও আইডিয়া')}</a><a class="btn primary" href="${A.href('marketing', 'campaigns')}">${t('All campaigns', 'সব ক্যাম্পেইন')}</a>`) + A.tabsBar('marketing', 'overview') +
      perBar() + aiBox(aiLine(rows)) +
      `<div class="grid g5">
        ${U().card('', U().kpi({ label: t('Ad spend', 'বিজ্ঞাপন খরচ'), value: F().tk(spend), delta: A.delta(spend, spendP, true) }))}
        ${U().card('', U().kpi({ label: t('Delivered sales from ads', 'বিজ্ঞাপন থেকে ডেলিভারি বিক্রি'), value: F().tk(sales), delta: A.delta(sales, salesP) }))}
        ${U().card('', U().kpi({ label: t('Sales per ৳1', '৳1-এ বিক্রি'), value: '৳' + roas.toFixed(1), delta: A.delta(roas, roasP) }))}
        ${U().card('', U().kpi({ label: t('Cost per delivered order', 'প্রতি ডেলিভারি অর্ডারে খরচ'), value: del ? F().tk(spend / del) : '—', delta: A.delta(del ? spend / del : 0, delP ? spendP / delP : 0, true) }))}
        ${U().card('', U().kpi({ label: t('Profit after ads', 'বিজ্ঞাপন বাদে লাভ'), value: F().tk(prof), delta: A.delta(prof, profP), sub: t('after product, courier, COD, packet and ads', 'প্রোডাক্ট, কুরিয়ার, COD, প্যাকেট ও বিজ্ঞাপন বাদে') }))}
      </div>
      <div class="grid g3">
        ${U().card(t('By channel · sales per ৳1', 'চ্যানেল অনুযায়ী · ৳1-এ বিক্রি'), A.chart.bars({ money: false, items: plats.map((p) => ({ label: p.k, value: +p.roas.toFixed(1), text: '৳' + p.roas.toFixed(1), color: p.roas >= 4 ? 'var(--good)' : p.roas >= 2.5 ? 'var(--c1)' : p.roas >= 1.5 ? 'var(--warn)' : 'var(--bad)' })) }))}
        ${U().card(t('Needs your eye', 'আপনার নজর দরকার'), eye.length ? `<div class="mk2-eye">${eye.map((e) => `<a href="${A.href('marketing', 'campaigns', e[0].c.id)}">${U().badge(e[2], e[1])}<span class="ellip">${e[3]}</span></a>`).join('')}</div>` : U().empty(t('Nothing urgent — every campaign is paying.', 'জরুরি কিছু নেই — সব ক্যাম্পেইন লাভে।')))}
        ${U().card(t('Message campaigns', 'মেসেজ ক্যাম্পেইন'), `<div class="stack small"><div class="row between"><span>${t('Sent', 'পাঠানো')}</span><b>${F().num(A.sum(msgs, (m) => m.sent))}</b></div><div class="row between"><span>${t('Orders', 'অর্ডার')}</span><b>${F().num(A.sum(msgs, (m) => m.orders))}</b></div><div class="row between"><span>${t('Sales', 'বিক্রি')}</span><b>${F().tk(A.sum(msgs, (m) => m.sales))}</b></div><div class="row between"><span>${t('Cost', 'খরচ')}</span><b>${F().tk(A.sum(msgs, (m) => m.cost))}</b></div><a class="btn sm" href="${A.href('marketing', 'messages')}">${t('Open message campaigns', 'মেসেজ ক্যাম্পেইন খুলুন')}</a></div>`)}
      </div>
      ${U().card(t('Spend vs delivered sales per day', 'প্রতিদিন খরচ বনাম ডেলিভারি বিক্রি'), A.chart.line({ labels: days.map((d) => F().date(d.date)), series: [{ name: t('Delivered sales from ads', 'ডেলিভারি বিক্রি'), color: 'var(--good)', values: days.map((d) => { const c = chD(d.date); return Math.round(c.Facebook.sales + c.Google.sales + c.TikTok.sales); }) }, { name: t('Ad spend', 'বিজ্ঞাপন খরচ'), color: 'var(--c1)', values: days.map((d) => A.sum(A.D.adSpend.filter((a) => a.date === d.date), (a) => a.spend)) }], height: 220 }))}
      ${U().guide(t('Verdict rule (change it in Rules): ৳4+ sales per ৳1 = Scale, ৳2.5+ = Keep, ৳1.5+ = Fix, below = Stop.', 'রায়ের নিয়ম (Rules-এ বদলানো যায়): ৳1-এ ৳4+ বিক্রি = বাড়ান, ৳2.5+ = চালু রাখুন, ৳1.5+ = ঠিক করুন, নিচে = বন্ধ।'))}`;
    wirePer(el);
  }

  /* ---------- Campaign list ---------- */
  let campQ = '', campSort = 'spend';
  function renderCampaigns2(el, rr) {
    if (rr && rr.id) return renderCampaignPage(el, rr.id);
    const r = A.calc.range(per); const rows = allRows(r);
    const P = ['all', 'Facebook', 'Instagram', 'Google', 'YouTube', 'TikTok', 'action'];
    const pm = (x, k) => k === 'all' || (k === 'action' ? ['fix', 'stop', 'scale'].includes(x.v.k) : k === 'Google' ? plat(x.c).startsWith('Google') : plat(x.c) === k);
    let list = rows.filter((x) => pm(x, campCh) && (!campQ || x.c.name.toLowerCase().includes(campQ.toLowerCase())));
    list.sort((a, b) => (campSort === 'roas' ? b.s.roas - a.s.roas : campSort === 'profit' ? b.s.profit - a.s.profit : b.s.spend - a.s.spend));
    const daily = A.sum(A.D.campaigns.filter((c) => c.status === 'on'), (c) => c.daily);
    const spend = sumK(rows, 'spend'), sales = sumK(rows, 'sales'), del = sumK(rows, 'delivered');
    const cols = [
      { h: t('Campaign', 'ক্যাম্পেইন'), f: (x) => `<div class="cellmain"><span class="dotk" style="background:${PCOL[plat(x.c)] || CHCOL[x.c.ch]};width:10px;height:10px"></span><div style="min-width:0"><b class="ellip" style="max-width:220px">${A.esc(x.c.name)}</b><span class="muted small">${plat(x.c)} · ${F().tk(x.c.daily)}${t('/day', '/দিন')}</span></div></div>` },
      { h: t('Status', 'অবস্থা'), f: (x) => U().badge(x.c.status === 'on' ? t('Running', 'চলছে') : t('Paused', 'পজ'), x.c.status === 'on' ? 'good' : ''), hide: 1 },
      { h: t('Spend', 'খরচ'), r: 1, f: (x) => F().tk(x.s.spend) },
      { h: t('Clicks', 'ক্লিক'), r: 1, f: (x) => F().num(x.s.clicks), hide: 1 },
      { h: t('Orders', 'অর্ডার'), r: 1, f: (x) => F().num(Math.round(x.s.orders)), hide: 1 },
      { h: t('Delivered', 'ডেলিভারি'), r: 1, f: (x) => F().num(Math.round(x.s.delivered)), hide: 1 },
      { h: t('Returned', 'ফেরত'), r: 1, f: (x) => F().num(Math.round(x.s.returned)), hide: 1 },
      { h: t('Delivered sales', 'ডেলিভারি বিক্রি'), r: 1, f: (x) => F().tk(x.s.sales), hide: 1 },
      { h: t('Per ৳1', '৳1-এ'), r: 1, f: (x) => `<b>৳${x.s.roas.toFixed(1)}</b>` },
      { h: t('Profit after ads', 'বিজ্ঞাপন বাদে লাভ'), r: 1, f: (x) => `<b style="color:${x.s.profit < 0 ? 'var(--bad)' : 'var(--good)'}">${F().tk(x.s.profit)}</b>` },
      { h: t('Verdict', 'রায়'), f: (x) => `<div class="mkt-verdict">${U().badge(t(x.v.en, x.v.bn), x.v.tone)}<small class="hide-sm">${t(x.v.why[0], x.v.why[1])}</small></div>` },
    ];
    el.innerHTML = A.pageHead(t('Ad campaigns', 'বিজ্ঞাপন ক্যাম্পেইন'), t('Every platform in one table. Tap a campaign to see inside it.', 'সব প্ল্যাটফর্ম এক টেবিলে। ভেতরে দেখতে ক্যাম্পেইনে চাপুন।'),
      `<button class="btn" id="mk-sync">${A.icon('sync')}${t('Refresh', 'আপডেট')}</button><button class="btn primary" id="mk-new">${A.icon('plus')}${t('New campaign', 'নতুন ক্যাম্পেইন')}</button>`) + A.tabsBar('marketing', 'campaigns') + perBar() + aiBox(aiLine(rows)) +
      `<div class="grid g4">
        ${U().card('', U().kpi({ label: t('Ad spend', 'বিজ্ঞাপন খরচ'), value: F().tk(spend), delta: A.delta(spend, sumK(rows, 'spend', 'p'), true), sub: t(`${F().tk(daily)}/day now`, `এখন ${F().tk(daily)}/দিন`) }))}
        ${U().card('', U().kpi({ label: t('Delivered orders', 'ডেলিভারি অর্ডার'), value: F().num(Math.round(del)), delta: A.delta(del, sumK(rows, 'delivered', 'p')) }))}
        ${U().card('', U().kpi({ label: t('Sales per ৳1', '৳1-এ বিক্রি'), value: '৳' + (spend ? sales / spend : 0).toFixed(1) }))}
        ${U().card('', U().kpi({ label: t('Profit after ads', 'বিজ্ঞাপন বাদে লাভ'), value: F().tk(sumK(rows, 'profit')), delta: A.delta(sumK(rows, 'profit'), sumK(rows, 'profit', 'p')) }))}
      </div>` +
      U().card(t('All campaigns', 'সব ক্যাম্পেইন'), `<div class="row between" style="margin-bottom:10px;gap:8px"><div class="chips" id="mk-chips">${P.map((k) => `<button class="chip ${campCh === k ? 'on' : ''}" data-v="${k}">${k === 'all' ? t('All', 'সব') : k === 'action' ? t('Needs action', 'কাজ দরকার') : k}<span class="c">${rows.filter((x) => pm(x, k)).length}</span></button>`).join('')}</div><div class="row" style="gap:8px"><input class="inp" id="mk-q" placeholder="${t('Search campaigns…', 'ক্যাম্পেইন খুঁজুন…')}" value="${A.esc(campQ)}" style="max-width:200px">${U().select('mk-sort', [['spend', t('Sort: spend', 'সাজান: খরচ')], ['roas', t('Sort: per ৳1', 'সাজান: ৳1-এ')], ['profit', t('Sort: profit', 'সাজান: লাভ')]], campSort, 'style="max-width:160px"')}</div></div>` +
        (list.length ? U().table(cols, list, { onRow: true }) : U().empty(t('No campaign on this platform yet.', 'এই প্ল্যাটফর্মে এখনো কোনো ক্যাম্পেইন নেই।'))) +
        U().guide(t('“Profit after ads” = delivered sales − product cost, courier, COD fee, packet and return cost − ad spend. Website orders from an ad link count fully; Messenger, Instagram and WhatsApp orders count 60% for Facebook.', '“বিজ্ঞাপন বাদে লাভ” = ডেলিভারি বিক্রি − প্রোডাক্টের দাম, কুরিয়ার, COD, প্যাকেট ও ফেরতের খরচ − বিজ্ঞাপন খরচ। বিজ্ঞাপনের লিংকের ওয়েবসাইট অর্ডার পুরো ধরা হয়; Messenger, Instagram ও WhatsApp অর্ডার Facebook-এর জন্য 60% ধরা হয়।')));
    wirePer(el);
    A.on(el, '#mk-chips .chip', 'click', (e, b) => { campCh = b.dataset.v; A.render(); });
    const q = el.querySelector('#mk-q'); q.oninput = () => { campQ = q.value; A.render(); const n = document.querySelector('#mk-q'); n.focus(); n.setSelectionRange(campQ.length, campQ.length); };
    el.querySelector('#mk-sort').onchange = (e) => { campSort = e.target.value; A.render(); };
    A.on(el, 'tr[data-row]', 'click', (e, tr) => A.go('marketing', 'campaigns', tr.dataset.row));
    el.querySelector('#mk-sync').onclick = () => { for (const k in M().accounts) if (M().accounts[k].connected) M().accounts[k].lastImport = A.TODAY.toISOString(); A.commit('Ad data refreshed from ad accounts'); A.toast(t('Spend and results refreshed from every ad account', 'সব অ্যাড অ্যাকাউন্ট থেকে খরচ ও ফলাফল আপডেট হয়েছে'), 'good'); A.render(); };
    el.querySelector('#mk-new').onclick = newCampaign;
  }

  /* ---------- Campaign page ---------- */
  function adsOf(c, s) {
    const p = A.D.products.find((x) => x.cat === CCAT[c.id] && x.status === 'live') || A.D.products[0];
    const p2 = A.D.products.filter((x) => x.cat === p.cat)[1] || p;
    const base = [[t(`${p.colors[0] || 'Black'} + ${p.colors[1] || 'Navy'} video`, `${p.colors[0] || 'Black'} + ${p.colors[1] || 'Navy'} ভিডিও`), 'video', 0.46, 1.3, 1.6 + hash(c.id) * 0.6, p], [t(`${p.colors.length} colours carousel`, `${p.colors.length} রঙের ক্যারোসেল`), 'carousel', 0.34, 1.0, 2.1 + hash(c.id + 'b') * 0.8, p2], [t('Price drop photo', 'দাম কমার ছবি'), 'photo', 0.2, 0.5, 3.6 + hash(c.id + 'c') * 1.2, p]];
    const norm = A.sum(base, (b) => b[2] * b[3]);
    return base.map((b, i) => { const roas = s.roas * b[3] / norm; const sp = s.spend * b[2]; const tired = b[4] > 3.5; return { i, name: b[0], kind: b[1], spend: sp, delivered: s.delivered * b[2] * b[3] / norm, roas, freq: b[4], tired, p: b[5], k: tired ? 'tired' : VERD({ roas }) }; });
  }
  function renderCampaignPage(el, id) {
    const c = A.byId(A.D.campaigns, id);
    if (!c) { el.innerHTML = A.pageHead(t('Campaign not found', 'ক্যাম্পেইন পাওয়া যায়নি'), '') + A.tabsBar('marketing', 'campaigns') + U().empty(`<a href="${A.href('marketing', 'campaigns')}">${t('Back to all campaigns', 'সব ক্যাম্পেইনে ফিরুন')}</a>`); return; }
    const r = A.calc.range(per); const chC = chStats(r.from, r.to);
    const s = campStats(c, r.from, r.to, chC); const p = campStats(c, r.prevFrom, r.prevTo); const v = verdict(c, s);
    const claimed = Math.round(s.orders * (1.1 + hash(c.id) * 0.15));
    const ads = adsOf(c, s);
    const days = A.calc.daily(r.from, r.to, (d) => d); const dch = {}; const chD = (d) => (dch[d] = dch[d] || chStats(dayT(d) - 12 * 36e5, dayT(d) + 12 * 36e5));
    const dist = {}, prod = {};
    for (const [o, w] of s.list) { if (!A.calc.isDelivered(o)) continue; dist[o.district] = (dist[o.district] || 0) + w * s.share; for (const l of o.lines) prod[l.name] = (prod[l.name] || 0) + l.qty * w * s.share; }
    const dTot = A.sum(Object.values(dist)) || 1;
    const topD = Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 6); const topP = Object.entries(prod).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const views = Math.round(s.clicks * 0.87), bag = Math.round(views * 0.08);
    const tired = ads.find((a) => a.tired);
    const kTone = { scale: 'good', keep: 'info', fix: 'warn', stop: 'bad', tired: 'warn' };
    const kName = { scale: t('Scale', 'বাড়ান'), keep: t('Keep', 'চালু রাখুন'), fix: t('Fix', 'ঠিক করুন'), stop: t('Stop', 'বন্ধ করুন'), tired: t('Tired', 'ক্লান্ত') };
    el.innerHTML = A.pageHead(`<span class="dotk" style="background:${PCOL[plat(c)] || CHCOL[c.ch]};width:12px;height:12px;display:inline-block;margin-right:6px"></span>${A.esc(c.name)}`, `${plat(c)} · ${F().tk(c.daily)}${t('/day', '/দিন')} · ${c.status === 'on' ? t('Running', 'চলছে') : t('Paused', 'পজ')}`,
      `<a class="btn ghost" href="${A.href('marketing', 'campaigns')}">← ${t('All campaigns', 'সব ক্যাম্পেইন')}</a><button class="btn" id="cp-pause">${c.status === 'on' ? t('Pause', 'পজ') : t('Resume', 'চালু করুন')}</button><button class="btn" id="cp-dup">${t('Duplicate', 'ডুপ্লিকেট')}</button><button class="btn primary" id="cp-bud">${t('Change budget', 'বাজেট বদলান')}</button>`) + A.tabsBar('marketing', 'campaigns') +
      U().callout(`<b>${t('Ads learn from delivered orders', 'বিজ্ঞাপন শেখে ডেলিভারি হওয়া অর্ডার থেকে')}</b> — ${t(`each parcel that reaches the customer is sent back to ${plat(c)} as a purchase, so it finds more buyers who keep the parcel, not people who refuse it.`, `কাস্টমারের কাছে পৌঁছানো প্রতিটা পার্সেল ${plat(c)} কে কেনা হিসেবে জানানো হয়, তাই এটা এমন ক্রেতা খোঁজে যারা পার্সেল রাখেন, ফেরত দেন না।`)}`, 'good', 'check') +
      perBar(`<span class="badge warn">${t('Budget, resume and duplicate need your OK + PIN', 'বাজেট, চালু ও ডুপ্লিকেটে আপনার OK + PIN লাগে')}</span>`) +
      `<div class="grid g3">
        ${U().card(t('Who counts the orders', 'কে কত অর্ডার গোনে'), `<div class="mk2-trio"><div><span>${t(`${plat(c)} says purchases`, `${plat(c)} বলছে কেনা`)}</span><b>${F().num(claimed)}</b></div><div><span>${t('Our orders', 'আমাদের অর্ডার')}</span><b>${F().num(Math.round(s.orders))}</b></div><div><span>${t('Delivered', 'ডেলিভারি')}</span><b style="color:var(--good)">${F().num(Math.round(s.delivered))}</b></div></div><p class="muted small" style="margin:8px 0 0">${t('Platforms count a purchase when someone clicks “Order”. We count only parcels that reached the customer.', 'প্ল্যাটফর্ম "অর্ডার" চাপলেই কেনা ধরে। আমরা শুধু কাস্টমারের হাতে পৌঁছানো পার্সেল ধরি।')}</p>`, { cls: 'span2' })}
        ${U().card(t('Verdict', 'রায়'), `${U().badge(t(v.en, v.bn), v.tone)}<p style="margin:8px 0">${t(v.why[0], v.why[1])}</p><div class="stack small"><div class="row between"><span>${t('Spend', 'খরচ')}</span><b>${F().tk(s.spend)}</b> ${A.delta(s.spend, p.spend, true)}</div><div class="row between"><span>${t('Delivered sales', 'ডেলিভারি বিক্রি')}</span><b>${F().tk(s.sales)}</b></div><div class="row between"><span>${t('Per ৳1', '৳1-এ')}</span><b>৳${s.roas.toFixed(1)}</b> ${A.delta(s.roas, p.roas)}</div><div class="row between"><span>${t('Profit after ads', 'বিজ্ঞাপন বাদে লাভ')}</span><b style="color:${s.profit < 0 ? 'var(--bad)' : 'var(--good)'}">${F().tk(s.profit)}</b></div></div>`)}
      </div>
      ${U().card(t('Ads inside this campaign', 'এই ক্যাম্পেইনের বিজ্ঞাপন'), ads.map((a) => `<div class="mk2-ad">${U().thumb(a.p, 52)}<div class="tx"><b>${a.name} <span class="badge">${a.kind}</span></b><span>${t(`Spend ${F().tk(a.spend)} · ${F().num(Math.round(a.delivered))} delivered · ৳${a.roas.toFixed(1)} per ৳1 · seen ${a.freq.toFixed(1)}× each`, `খরচ ${F().tk(a.spend)} · ${F().num(Math.round(a.delivered))}টি ডেলিভারি · ৳1-এ ৳${a.roas.toFixed(1)} · প্রতিজন ${a.freq.toFixed(1)} বার দেখেছে`)}</span></div>${U().badge(kName[a.k], kTone[a.k])}</div>`).join('') +
        (tired ? aiBox(t(`“${tired.name}”: the same people have seen it ${tired.freq.toFixed(1)} times and results are falling. Swap the picture or pause it.`, `“${tired.name}”: একই মানুষ ${tired.freq.toFixed(1)} বার দেখেছে, ফল কমছে। ছবি বদলান বা পজ করুন।`)) : ''))}
      <div class="grid g3">
        ${U().card(t('Daily · spend vs delivered sales', 'প্রতিদিন · খরচ বনাম ডেলিভারি বিক্রি'), A.chart.line({ labels: days.map((d) => F().date(d.date)), series: [{ name: t('Delivered sales', 'ডেলিভারি বিক্রি'), color: 'var(--good)', values: days.map((d) => Math.round(campStats(c, dayT(d.date) - 12 * 36e5, dayT(d.date) + 12 * 36e5, chD(d.date)).sales)) }, { name: t('Spend', 'খরচ'), color: 'var(--c1)', values: days.map((d) => A.sum(A.D.adSpend.filter((a) => a.cid === c.id && a.date === d.date), (a) => a.spend)) }], height: 210 }), { cls: 'span2' })}
        ${U().card(t('Funnel', 'ফানেল'), A.chart.funnel([{ label: t('Clicks', 'ক্লিক'), value: s.clicks || 1 }, { label: t('Product views', 'প্রোডাক্ট দেখা'), value: views }, { label: t('Add to bag', 'ব্যাগে যোগ'), value: bag }, { label: t('Orders', 'অর্ডার'), value: Math.round(s.orders) }, { label: t('Delivered', 'ডেলিভারি'), value: Math.round(s.delivered) }]))}
      </div>
      <div class="grid g2">
        ${U().card(t('Where it sold', 'কোথায় বিক্রি হলো'), topD.length ? `<div class="mk2-shareb">${topD.map((d) => `<div class="r"><span class="ellip">${A.esc(d[0])}</span>${U().bar(d[1] / dTot * 100)}<b>${F().pct(d[1] / dTot * 100, 0)}</b></div>`).join('')}</div>` : U().empty(t('No delivered orders in this period.', 'এই সময়ে কোনো ডেলিভারি অর্ডার নেই।')))}
        ${U().card(t('What it sold (pieces)', 'কী বিক্রি হলো (পিস)'), topP.length ? A.chart.bars({ money: false, items: topP.map((x) => ({ label: x[0], value: Math.max(1, Math.round(x[1])), text: F().num(Math.max(1, Math.round(x[1]))) })) }) : U().empty(t('No delivered orders in this period.', 'এই সময়ে কোনো ডেলিভারি অর্ডার নেই।')))}
      </div>`;
    wirePer(el);
    el.querySelector('#cp-pause').onclick = () => {
      const go = () => { c.status = c.status === 'on' ? 'off' : 'on'; A.commit(`Ad campaign ${c.name} ${c.status === 'on' ? 'resumed' : 'paused'}`); A.toast(c.status === 'on' ? t('Campaign is running again', 'ক্যাম্পেইন আবার চালু') : t('Campaign paused — no more spend today', 'ক্যাম্পেইন পজ — আজ আর খরচ হবে না'), 'good'); A.render(); };
      if (c.status === 'on') U().confirm(t('Pause this campaign?', 'ক্যাম্পেইন পজ করবেন?'), t('Spending stops within a few minutes. You can resume later.', 'কয়েক মিনিটের মধ্যে খরচ বন্ধ হবে। পরে আবার চালু করা যায়।'), t('Pause', 'পজ'), go);
      else pinAsk(t('Resume campaign?', 'ক্যাম্পেইন চালু করবেন?'), t(`It will spend about ${F().tk(c.daily)} a day again.`, `আবার প্রতিদিন প্রায় ${F().tk(c.daily)} খরচ হবে।`), t('Resume', 'চালু করুন'), go);
    };
    el.querySelector('#cp-dup').onclick = () => pinAsk(t('Duplicate this campaign?', 'ক্যাম্পেইন ডুপ্লিকেট করবেন?'), t(`A copy starts paused with the same ads and ${F().tk(c.daily)}/day budget. Turn it on when ready.`, `একই বিজ্ঞাপন ও ${F().tk(c.daily)}/দিন বাজেট নিয়ে পজ অবস্থায় কপি তৈরি হবে। প্রস্তুত হলে চালু করুন।`), t('Duplicate', 'ডুপ্লিকেট'), () => {
      const n = { id: A.uid('AD'), ch: c.ch, plat: plat(c), name: c.name + ' (copy)', status: 'off', daily: c.daily }; A.D.campaigns.push(n); A.commit(`Campaign duplicated: ${c.name}`); A.toast(t('Copy created (paused)', 'কপি তৈরি হয়েছে (পজ)'), 'good'); A.go('marketing', 'campaigns', n.id);
    });
    el.querySelector('#cp-bud').onclick = () => {
      const m = U().modal(t('Change daily budget', 'দৈনিক বাজেট বদলান'), `${U().field(t('Budget per day', 'প্রতিদিনের বাজেট'), U().money('cp-b', c.daily), t(`Now ${F().tk(c.daily)}/day (about ${F().tk(c.daily * 30)} a month).`, `এখন ${F().tk(c.daily)}/দিন (মাসে প্রায় ${F().tk(c.daily * 30)})।`))}<div class="row" style="margin-top:8px">${[-20, 20, 50].map((q) => `<button class="btn sm ghost" data-q="${q}">${q > 0 ? '+' : ''}${q}%</button>`).join('')}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="cp-b-ok">${t('Continue', 'পরের ধাপ')}</button>` });
      m.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { m.querySelector('#cp-b').value = Math.round(c.daily * (1 + Number(b.dataset.q) / 100) / 10) * 10; }));
      m.parentElement.querySelector('#cp-b-ok').onclick = () => {
        const val = Math.round(Number(m.querySelector('#cp-b').value)); if (!val || val < 100) { A.toast(t('Budget must be at least ৳100', 'বাজেট অন্তত ৳100 হতে হবে'), 'bad'); return; }
        if (val === c.daily) { A.toast(t('Budget not changed', 'বাজেট বদলায়নি')); return; }
        pinAsk(t('Your OK: change budget?', 'আপনার OK: বাজেট বদলাবেন?'), t(`${A.esc(c.name)}: ${F().tk(c.daily)} → <b>${F().tk(val)}</b> per day (${val > c.daily ? '+' : ''}${F().tk((val - c.daily) * 30)} a month).`, `${A.esc(c.name)}: ${F().tk(c.daily)} → <b>${F().tk(val)}</b> প্রতিদিন (মাসে ${val > c.daily ? '+' : ''}${F().tk((val - c.daily) * 30)})।`), t('Approve', 'অনুমোদন'), () => { const old = c.daily; c.daily = val; A.commit(`Ad budget ${c.name}: ${F().tk(old)} → ${F().tk(val)}/day`); A.toast(t(`Budget set to ${F().tk(val)}/day`, `বাজেট ${F().tk(val)}/দিন করা হলো`), 'good'); A.render(); });
      };
    };
  }

  /* ---------- Message campaigns ---------- */
  const CHN = { WhatsApp: { rate: 0.66, cost: 2.4, short: 'WA' }, SMS: { rate: 0.88, cost: 0.35, short: 'SMS' }, Email: { rate: 0.42, cost: 0, short: 'Email' }, Messenger: { rate: 0.31, cost: 0, short: 'MSG' } };
  const TEMPLATES = {
    WhatsApp: [['winter_combo_v2', 'Hi {name}, your Gold price is here: any polo 2-piece combo ৳1,600 (was ৳2,200). Use {coupon} till 30 Nov. extas.com.bd/c/winter\nReply STOP to opt out'], ['new_arrival_v1', 'Hi {name}, new winter hoodies just landed at EXTAS. Cash on delivery all over Bangladesh. extas.com.bd/c/hoodie\nReply STOP to opt out']],
    SMS: [['sms_offer_bn', 'প্রিয় {name}, EXTAS-এ আপনার জন্য {coupon} কুপনে বিশেষ ছাড়। ক্যাশ অন ডেলিভারি। extas.com.bd STOP 2'], ['sms_miss_you', 'প্রিয় {name}, অনেক দিন দেখা নেই! {coupon} কুপনে ছাড়। extas.com.bd STOP 2']],
    Email: [['email_new_in', 'Subject: New in — winter polos\n\nHi {name}, the winter polo line is here in 6 colours. Use {coupon} at checkout.\n\nShop now: extas.com.bd/c/polo\nUnsubscribe'], ['email_combo', 'Subject: 2 polos, one price\n\nHi {name}, pick any 2 polos for ৳1,600 with {coupon}.\nUnsubscribe']],
    Messenger: [['msgr_restock', 'Hi {name}! The polo you asked about is back in stock. Want us to keep one for you? Use {coupon} for a little extra off.']],
  };
  function MM() {
    const mk = M();
    if (!mk.v2) {
      for (const m of mk.msgs) { m.read = m.channel === 'WhatsApp' ? Math.round(m.delivered * 0.85) : m.channel === 'SMS' ? null : Math.round(m.delivered * 0.34); m.optedOut = 0; }
      mk.msgs.push({ id: 'MS5', name: 'New in: denim', channel: 'Email', group: 'all', date: '2026-11-04', status: 'sent', sent: 310, delivered: 304, read: 103, clicks: 22, orders: 3, sales: 5970, coupon: '', cost: 0 });
      mk.msgs.push({ id: 'MS6', name: 'Restock alert · polo', channel: 'Messenger', group: 'vip', date: '2026-11-09', status: 'sent', sent: 46, delivered: 46, read: 39, clicks: 14, orders: 5, sales: 7450, coupon: 'EXTAS10', cost: 0 });
      mk.aud = [
        { id: 'vip', meta: true, google: true, look: true }, { id: 'risk', meta: false, google: false, look: false }, { id: 'dhaka', meta: true, google: false, look: false },
        { id: 'outside', meta: false, google: false, look: false }, { id: 'one', meta: true, google: false, look: false },
      ];
      mk.custom = []; mk.excludeRefused = true; mk.audSynced = new Date(A.TODAY - 3 * 36e5).toISOString();
      mk.proposals = [
        { id: 'P1', kind: 'budget', cid: 'AD3', from: 400, to: 600, en: 'Raise Instagram retargeting from ৳400 to ৳600 a day', bn: 'Instagram রিটার্গেটিং ৳400 থেকে ৳600/দিন করা', why: ['It returns the most per ৳1 and spends its full budget by 3 PM.', '৳1-এ সবচেয়ে বেশি দেয়, আর দুপুর 3টার মধ্যেই পুরো বাজেট শেষ।'], st: 'wait' },
        { id: 'P2', kind: 'pause', cid: 'AD5', en: 'Pause Google Shopping for outside-Dhaka districts', bn: 'ঢাকার বাইরের জেলায় Google Shopping বন্ধ রাখা', why: ['Returns from outside Dhaka are high on this campaign.', 'এই ক্যাম্পেইনে ঢাকার বাইরে থেকে ফেরত অনেক।'], st: 'wait' },
        { id: 'P3', kind: 'msg', en: 'WhatsApp “we miss you” to at-risk customers on Friday 8 PM', bn: 'শুক্রবার রাত 8টায় ঝুঁকির কাস্টমারদের WhatsApp “আপনাকে মিস করছি”', why: ['Last time a similar message brought ৳1 sales for every ৳0.02 cost.', 'গতবার এরকম মেসেজে খুব কম খরচে ভালো বিক্রি হয়েছিল।'], st: 'wait' },
      ];
      mk.ideas = [
        { id: 'I1', en: 'Before/after wash video of the piqué polo (no shrink)', bn: 'পিকে পোলো ধোয়ার আগে/পরে ভিডিও (ছোট হয় না)', tag: 'Video' },
        { id: 'I2', en: 'Size finder reel: “5’8” · 70 kg = L”', bn: 'সাইজ ফাইন্ডার রিল: “5’8” · 70 kg = L”', tag: 'Reel' },
        { id: 'I3', en: 'Carousel: one panjabi, 4 ways to wear for Eid', bn: 'ক্যারোসেল: এক পাঞ্জাবি, ঈদে 4 ভাবে পরা', tag: 'Carousel' },
        { id: 'I4', en: 'Customer photo wall from 5-star reviews', bn: '5 স্টার রিভিউয়ের কাস্টমার ছবি', tag: 'Photo' },
      ];
      mk.comp = [
        { id: 'C1', name: t('Competitor 1 · polo brand', 'প্রতিযোগী 1 · পোলো ব্র্যান্ড'), note: ['Running “2 polos ৳1,499” since 8 Nov; 14 new ads this week.', '8 নভেম্বর থেকে “2 পোলো ৳1,499” চালাচ্ছে; এ সপ্তাহে 14টি নতুন বিজ্ঞাপন।'] },
        { id: 'C2', name: t('Competitor 2 · panjabi shop', 'প্রতিযোগী 2 · পাঞ্জাবি দোকান'), note: ['Started Eid pre-order with free delivery over ৳2,500.', '৳2,500-এর ওপর ফ্রি ডেলিভারিসহ ঈদ প্রি-অর্ডার শুরু করেছে।'] },
        { id: 'C3', name: t('Competitor 3 · denim', 'প্রতিযোগী 3 · ডেনিম'), note: ['Uses short try-on videos; comments ask about size a lot.', 'ছোট ট্রাই-অন ভিডিও দিচ্ছে; কমেন্টে সাইজ নিয়ে অনেক প্রশ্ন।'] },
      ];
      mk.v2 = 1;
    }
    return mk;
  }
  function audiences() {
    const gs = groups(); const mk = MM(); const cs = A.D.customers;
    const cat = {}; for (const o of A.D.orders) { if (!A.calc.isDelivered(o)) continue; for (const l of o.lines) { const p = A.byId(A.D.products, l.pid); if (p) (cat[o.customerId] = cat[o.customerId] || new Set()).add(p.cat); } }
    const out = gs.map((g) => ({ id: g.id, en: g.en, bn: g.bn, list: g.list || cs.filter(g.f), kind: 'base' }));
    for (const c of mk.custom) out.push({ id: c.id, en: c.en, bn: c.bn, kind: 'custom', list: cs.filter((x) => (c.zone === 'any' || x.zone === c.zone) && (c.cat === 'any' || (cat[x.id] && cat[x.id].has(c.cat))) && (!c.days || (x.lastOrder && (A.TODAY - new Date(x.lastOrder)) / DAY <= c.days)) && (!c.vip || x.delivered >= 3 || x.spent >= 6000)) });
    return out;
  }
  const reach = (list, ch) => { const ok = list.filter((c) => hash(c.id + ch) < CHN[ch].rate && !(c.refused > 0 && MM().excludeRefused)); return { ok, out: list.length - ok.length }; };
  function renderMessages2(el) {
    const mk = MM(); const gs = audiences(); const r = A.calc.range(per);
    const sentIn = mk.msgs.filter((m) => m.status === 'sent' && inR(m, r.from, r.to));
    const tot = (k) => A.sum(sentIn, (m) => m[k] || 0);
    const cols = [
      { h: t('Campaign', 'ক্যাম্পেইন'), f: (m) => `<div class="cellmain"><span class="badge info">${CHN[m.channel] ? CHN[m.channel].short : m.channel}</span><div style="min-width:0"><b class="ellip" style="max-width:220px">${A.esc(m.name)}</b><span class="muted small">${A.esc(t(((gs.find((g) => g.id === m.group) || gs[0]).en), ((gs.find((g) => g.id === m.group) || gs[0]).bn)))} · ${F().date(m.date)}</span></div></div>` },
      { h: t('Status', 'অবস্থা'), f: (m) => (m.status === 'sent' ? U().badge(t('Sent', 'পাঠানো'), 'good') : m.status === 'approval' ? U().badge(t('Needs your OK', 'আপনার OK দরকার'), 'warn') : U().badge(t('Scheduled', 'নির্ধারিত'), 'info')), hide: 1 },
      { h: t('Sent', 'পাঠানো'), r: 1, f: (m) => F().num(m.sent) },
      { h: t('Delivered', 'পৌঁছেছে'), r: 1, f: (m) => F().num(m.delivered), hide: 1 },
      { h: t('Read / opened', 'পড়েছে / খুলেছে'), r: 1, f: (m) => (m.read == null ? '—' : F().num(m.read)), hide: 1 },
      { h: t('Clicked', 'ক্লিক'), r: 1, f: (m) => F().num(m.clicks), hide: 1 },
      { h: t('Orders', 'অর্ডার'), r: 1, f: (m) => F().num(m.orders) },
      { h: t('Sales', 'বিক্রি'), r: 1, f: (m) => F().tk(m.sales) },
      { h: t('Cost', 'খরচ'), r: 1, f: (m) => F().tk(m.cost), hide: 1 },
      { h: t('Per ৳1', '৳1-এ'), r: 1, f: (m) => (m.cost ? (m.sales / m.cost).toFixed(1) : '—'), hide: 1 },
    ];
    const risk = gs.find((g) => g.id === 'risk');
    el.innerHTML = A.pageHead(t('Message campaigns', 'মেসেজ ক্যাম্পেইন'), t('WhatsApp, SMS, Email and Messenger offers to customers who agreed to hear from you.', 'যারা মেসেজ পেতে রাজি, তাদের WhatsApp, SMS, Email ও Messenger অফার।'), `<button class="btn primary" id="ms-new">${A.icon('plus')}${t('New campaign', 'নতুন ক্যাম্পেইন')}</button>`) + A.tabsBar('marketing', 'messages') + perBar() +
      `<div class="grid g4">
        ${U().card('', U().kpi({ label: t('Messages sent', 'মেসেজ পাঠানো'), value: F().num(tot('sent')), sub: t(`${sentIn.length} campaigns`, `${sentIn.length}টি ক্যাম্পেইন`) }))}
        ${U().card('', U().kpi({ label: t('Orders', 'অর্ডার'), value: F().num(tot('orders')), sub: t(`${F().pct(tot('clicks') ? tot('orders') / tot('clicks') * 100 : 0, 0)} of clicks`, `ক্লিকের ${F().pct(tot('clicks') ? tot('orders') / tot('clicks') * 100 : 0, 0)}`) }))}
        ${U().card('', U().kpi({ label: t('Sales', 'বিক্রি'), value: F().tk(tot('sales')) }))}
        ${U().card('', U().kpi({ label: t('Cost', 'খরচ'), value: F().tk(tot('cost')), sub: tot('cost') ? t(`৳${(tot('sales') / tot('cost')).toFixed(0)} sales per ৳1`, `৳1-এ ৳${(tot('sales') / tot('cost')).toFixed(0)} বিক্রি`) : '' }))}
      </div>
      ${risk ? U().callout(t(`<b>${risk.list.length} customers</b> have not ordered in 30+ days. A WhatsApp “we miss you” is the cheapest way back.`, `<b>${risk.list.length} জন কাস্টমার</b> 30+ দিন অর্ডার করেননি। WhatsApp-এ “আপনাকে মিস করছি” সবচেয়ে কম খরচে ফেরানোর উপায়।`) + ` <button class="btn sm" id="ms-risk">${t('Write to them', 'তাদের লিখুন')}</button>`, 'info') : ''}
      ${U().card(t('Campaigns', 'ক্যাম্পেইন'), U().table(cols, mk.msgs.map((m) => ({ ...m, _id: m.id })), { onRow: true }))}
      ${U().card(t('Automatic messages', 'অটোমেটিক মেসেজ'), `<div class="list">${mk.autos.map((a) => `<div class="li"><div class="grow"><b>${t(a.en, a.bn)}</b><div class="muted small">${t(a.when[0], a.when[1])} · ${a.ch}</div></div>${U().switch('au-' + a.id, a.on, `data-au="${a.id}"`)}</div>`).join('')}</div>`)}`;
    wirePer(el);
    el.querySelector('#ms-new').onclick = () => msgForm('vip');
    const rb = el.querySelector('#ms-risk'); if (rb) rb.onclick = () => msgForm('risk');
    A.on(el, '[data-au]', 'change', (e, i) => { const a = mk.autos.find((x) => x.id === i.dataset.au); a.on = i.checked; A.commit(`Automatic message "${a.en}" ${a.on ? 'on' : 'off'}`); A.toast(a.on ? t('Turned on', 'চালু হলো') : t('Turned off', 'বন্ধ হলো'), 'good'); A.render(); });
    A.on(el, 'tr[data-row]', 'click', (e, tr) => {
      const m = mk.msgs.find((x) => x.id === tr.dataset.row);
      const d = U().drawer(A.esc(m.name), `${U().card('', `<div class="grid g3">${U().kpi({ label: t('Sent', 'পাঠানো'), value: F().num(m.sent) })}${U().kpi({ label: t('Orders', 'অর্ডার'), value: F().num(m.orders) })}${U().kpi({ label: t('Sales', 'বিক্রি'), value: F().tk(m.sales) })}</div>`)}${m.sent ? U().card(t('Funnel', 'ফানেল'), A.chart.funnel([{ label: t('Sent', 'পাঠানো'), value: m.sent }, { label: t('Delivered', 'পৌঁছেছে'), value: m.delivered || 1 }, { label: t('Clicked', 'ক্লিক'), value: m.clicks || 0 }, { label: t('Orders', 'অর্ডার'), value: m.orders || 0 }])) : U().callout(m.status === 'approval' ? t('Waiting for your OK. Nothing is sent until you approve with your PIN.', 'আপনার OK-এর অপেক্ষায়। PIN দিয়ে অনুমোদন না দিলে কিছু যাবে না।') : t(`Goes out on ${F().dateY(m.date)}${m.time ? ', ' + m.time : ''}.`, `${F().dateY(m.date)}${m.time ? ', ' + m.time : ''}-এ যাবে।`), 'info')}`,
        { foot: m.status === 'sent' ? `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>` : `<button class="btn" id="ms-cancel">${t('Cancel this send', 'পাঠানো বাতিল')}</button>${m.status === 'approval' ? `<button class="btn primary" id="ms-ok">${t('Approve', 'অনুমোদন')}</button>` : ''}` });
      const cb = d.parentElement.querySelector('#ms-cancel');
      if (cb) cb.onclick = () => U().confirm(t('Cancel the send?', 'পাঠানো বাতিল করবেন?'), t('Nothing will be sent and nothing is charged. It stays in the list as cancelled.', 'কিছু যাবে না, খরচও হবে না। তালিকায় বাতিল হিসেবে থাকবে।'), t('Yes, cancel', 'হ্যাঁ, বাতিল'), () => { m.status = 'sent'; m.name += ' (cancelled)'; A.commit(`Message campaign cancelled: ${m.name}`); A.toast(t('Cancelled', 'বাতিল হয়েছে'), 'good'); A.render(); });
      const ok = d.parentElement.querySelector('#ms-ok');
      if (ok) ok.onclick = () => pinAsk(t('Approve this send?', 'পাঠানো অনুমোদন করবেন?'), t(`${m.channel} to ${F().num(m.planned || 0)} people. Cost about ${F().tk(m.est || 0)}.`, `${F().num(m.planned || 0)} জনকে ${m.channel}। খরচ প্রায় ${F().tk(m.est || 0)}।`), t('Approve', 'অনুমোদন'), () => { m.status = 'scheduled'; A.commit(`Message campaign approved: ${m.name}`); A.toast(t('Approved — it will go out on time', 'অনুমোদিত — সময়মতো যাবে'), 'good'); A.render(); });
    });
  }
  function msgForm(gid) {
    const mk = MM(); const gs = audiences(); const coupons = A.D.coupons.filter((c) => c.on);
    const st = { g: gid, ch: 'WhatsApp', tpl: TEMPLATES.WhatsApp[0][0], coupon: coupons[0] ? coupons[0].code : '', date: F().ymd(A.TODAY.getTime() + 2 * DAY), time: '19:30', rate: 200, name: '' };
    const m = U().modal(t('New message campaign', 'নতুন মেসেজ ক্যাম্পেইন'), '<div id="mf"></div>', { wide: true, foot: `<button class="btn" id="mf-test">${t('Send test to me', 'আমাকে টেস্ট পাঠান')}</button><button class="btn primary" id="mf-go">${t('Schedule · needs your OK', 'শিডিউল · আপনার OK লাগবে')}</button>` });
    const box = m.querySelector('#mf');
    const draw = () => {
      const g = gs.find((x) => x.id === st.g) || gs[0]; const rc = reach(g.list, st.ch);
      const tp = (TEMPLATES[st.ch].find((x) => x[0] === st.tpl) || TEMPLATES[st.ch][0]); st.tpl = tp[0];
      const sample = tp[1].replace('{name}', (rc.ok[0] || g.list[0] || { name: 'Sakib' }).name.split(' ')[0]).replace('{coupon}', st.coupon || 'EXTAS10');
      const parts = st.ch === 'SMS' ? smsParts(sample).parts : 1; const cost = Math.ceil(rc.ok.length * CHN[st.ch].cost * parts);
      const mins = Math.ceil(rc.ok.length / st.rate);
      box.innerHTML = `<div class="grid g3"><div class="span2 stack">
        ${U().field(t('Channel', 'চ্যানেল'), U().seg('mf-ch', Object.keys(CHN).map((k) => [k, k]), st.ch))}
        ${U().field(t('Audience', 'অডিয়েন্স'), U().select('mf-g', gs.map((x) => [x.id, `${t(x.en, x.bn)} · ${x.list.length}`]), st.g))}
        <div class="callout good">${A.icon('check')}<div>${t(`<b>${F().num(rc.ok.length)} opted in</b> · ${F().num(rc.out)} left out (no consent${mk.excludeRefused ? ' or refused a parcel before' : ''})`, `<b>${F().num(rc.ok.length)} জন রাজি</b> · ${F().num(rc.out)} জন বাদ (সম্মতি নেই${mk.excludeRefused ? ' বা আগে পার্সেল নেননি' : ''})`)}</div></div>
        ${U().field(t('Template', 'টেমপ্লেট'), U().select('mf-tpl', TEMPLATES[st.ch].map((x) => [x[0], x[0] + (st.ch === 'WhatsApp' ? ' · ' + t('approved by Meta', 'Meta অনুমোদিত') : ' · ' + t('approved', 'অনুমোদিত'))]), st.tpl))}
        ${U().field(t('Offer', 'অফার'), U().select('mf-cp', [['', t('No coupon', 'কুপন ছাড়া')]].concat(coupons.map((c) => [c.code, `${c.code}${c.ends ? ' · ' + t('ends', 'শেষ') + ' ' + F().date(c.ends) : ''}`])), st.coupon))}
        <div class="formgrid">${U().field(t('Send on', 'পাঠানোর দিন'), `<input class="inp" type="date" id="mf-d" value="${st.date}">`)}${U().field(t('Time', 'সময়'), `<input class="inp" type="time" id="mf-t" value="${st.time}">`)}${U().field(t('Speed', 'গতি'), U().select('mf-r', [[100, t('100 per minute', 'মিনিটে 100')], [200, t('200 per minute', 'মিনিটে 200')], [500, t('500 per minute', 'মিনিটে 500')]], st.rate), t(`Takes about ${mins} min`, `প্রায় ${mins} মিনিট লাগবে`))}</div>
        <dl class="mk2-sum"><dt>${t('Cost estimate', 'খরচের হিসাব')}</dt><dd><b>${F().tk(cost)}</b> ${st.ch === 'SMS' ? t(`(${parts} SMS × ৳0.35 each)`, `(${parts} SMS × ৳0.35)`) : st.ch === 'WhatsApp' ? t('(৳2.40 per message)', '(প্রতি মেসেজ ৳2.40)') : t('(free)', '(ফ্রি)')}</dd><dt>${t('Likely result', 'সম্ভাব্য ফল')}</dt><dd>${t(`about ${Math.max(1, Math.round(rc.ok.length * 0.04))} orders`, `প্রায় ${Math.max(1, Math.round(rc.ok.length * 0.04))}টি অর্ডার`)}</dd></dl>
      </div><div><div class="muted small" style="text-align:center;margin-bottom:6px">${t('Preview', 'প্রিভিউ')}</div><div class="mk2-phone"><div class="mk2-bub">${A.esc(sample)}</div></div></div></div>`;
      box.querySelectorAll('#mf-ch button').forEach((b) => (b.onclick = () => { st.ch = b.dataset.v; st.tpl = TEMPLATES[st.ch][0][0]; draw(); }));
      box.querySelector('#mf-g').onchange = (e) => { st.g = e.target.value; draw(); };
      box.querySelector('#mf-tpl').onchange = (e) => { st.tpl = e.target.value; draw(); };
      box.querySelector('#mf-cp').onchange = (e) => { st.coupon = e.target.value; draw(); };
      box.querySelector('#mf-r').onchange = (e) => { st.rate = Number(e.target.value); draw(); };
      box.querySelector('#mf-d').onchange = (e) => { st.date = e.target.value; };
      box.querySelector('#mf-t').onchange = (e) => { st.time = e.target.value; };
      st._n = rc.ok.length; st._cost = cost; st._g = g;
    };
    draw();
    m.parentElement.querySelector('#mf-test').onclick = () => { A.toast(t(`Test ${st.ch} sent to your phone (${A.D.store.whatsapp})`, `টেস্ট ${st.ch} আপনার ফোনে পাঠানো হয়েছে (${A.D.store.whatsapp})`), 'good'); };
    m.parentElement.querySelector('#mf-go').onclick = () => {
      if (!st._n) { A.toast(t('Nobody in this audience has agreed to messages', 'এই অডিয়েন্সে কেউ মেসেজে রাজি নন'), 'bad'); return; }
      pinAsk(t('Your OK: schedule this send?', 'আপনার OK: পাঠানো শিডিউল করবেন?'), t(`${st.ch} to <b>${F().num(st._n)} people</b> on ${F().dateY(st.date)}, ${st.time}. Cost about <b>${F().tk(st._cost)}</b>. Messages cannot be taken back once sent.`, `<b>${F().num(st._n)} জনকে</b> ${st.ch}, ${F().dateY(st.date)} ${st.time}-এ। খরচ প্রায় <b>${F().tk(st._cost)}</b>। পাঠানোর পর ফেরানো যায় না।`), t('Approve & schedule', 'অনুমোদন ও শিডিউল'), () => {
        mk.msgs.unshift({ id: A.uid('MS'), name: `${st.tpl} · ${st._g.en}`, channel: st.ch, group: st.g, date: st.date, time: st.time, status: 'scheduled', sent: 0, delivered: 0, read: null, clicks: 0, orders: 0, sales: 0, coupon: st.coupon, cost: 0, planned: st._n, est: st._cost });
        mk.cal.push({ id: A.uid('CL'), title: `${st.ch}: ${st._g.en}`, from: st.date, to: st.date, type: 'msg' });
        A.commit(`Message campaign scheduled: ${st.ch} to ${st._n} on ${st.date}`); A.toast(t('Scheduled — also on the marketing calendar', 'শিডিউল হয়েছে — মার্কেটিং ক্যালেন্ডারেও আছে'), 'good'); A.render();
      });
    };
  }

  /* ---------- Audiences ---------- */
  function renderAudiences(el) {
    const mk = MM(); const gs = audiences(); const st = (id) => mk.aud.find((a) => a.id === id) || (mk.aud.push({ id, meta: false, google: false, look: false }), mk.aud[mk.aud.length - 1]);
    const refused = A.D.customers.filter((c) => c.refused > 0).length;
    el.innerHTML = A.pageHead(t('Audiences', 'অডিয়েন্স'), t('Customer groups built from your own orders. Use them for messages, or send them to Meta and Google to find people like them.', 'নিজের অর্ডার থেকে তৈরি কাস্টমার গ্রুপ। মেসেজে ব্যবহার করুন, বা Meta ও Google-এ পাঠিয়ে এদের মতো নতুন মানুষ খুঁজুন।'),
      `<button class="btn" id="au-sync">${A.icon('sync')}${t('Update now', 'এখনই আপডেট')}</button><button class="btn primary" id="au-new">${A.icon('plus')}${t('New audience', 'নতুন অডিয়েন্স')}</button>`) + A.tabsBar('marketing', 'audiences') +
      `<div class="grid g3">
        ${U().card('', U().kpi({ label: t('Audiences', 'অডিয়েন্স'), value: F().num(gs.length), sub: t(`${mk.aud.filter((a) => a.meta || a.google).length} sent to ad platforms`, `${mk.aud.filter((a) => a.meta || a.google).length}টি বিজ্ঞাপনে পাঠানো`) }))}
        ${U().card('', U().kpi({ label: t('Last update', 'শেষ আপডেট'), value: F().ago(mk.audSynced), sub: t('Updates by itself every day', 'প্রতিদিন নিজে আপডেট হয়') }))}
        ${U().card(t('Refused-parcel list', 'পার্সেল না নেওয়ার লিস্ট'), `<div class="row between"><div><b>${F().num(refused)}</b> ${t('people', 'জন')}<div class="muted small">${t('Left out of every ad and message', 'সব বিজ্ঞাপন ও মেসেজ থেকে বাদ')}</div></div>${U().switch('au-ex', mk.excludeRefused)}</div>`)}
      </div>` +
      U().card(t('Your audiences', 'আপনার অডিয়েন্স'), U().table([
        { h: t('Audience', 'অডিয়েন্স'), f: (g) => `<b>${t(g.en, g.bn)}</b><div class="muted small">${g.kind === 'custom' ? t('Made by you', 'আপনার তৈরি') : t('Ready-made', 'আগে থেকে তৈরি')}</div>` },
        { h: t('People', 'জন'), r: 1, f: (g) => F().num(g.list.length) },
        { h: t('WhatsApp OK', 'WhatsApp রাজি'), r: 1, f: (g) => F().num(reach(g.list, 'WhatsApp').ok.length), hide: 1 },
        { h: 'Meta', f: (g) => U().switch('au-m-' + g.id, st(g.id).meta, `data-au="${g.id}" data-k="meta"`) },
        { h: 'Google', f: (g) => U().switch('au-g-' + g.id, st(g.id).google, `data-au="${g.id}" data-k="google"`), hide: 1 },
        { h: t('Find look-alikes', 'এদের মতো খুঁজুন'), f: (g) => U().switch('au-l-' + g.id, st(g.id).look, `data-au="${g.id}" data-k="look"`), hide: 1 },
        { h: '', f: (g) => `<button class="btn sm" data-msg="${g.id}">${t('Message', 'মেসেজ')}</button>` },
      ], gs.map((g) => ({ ...g, _id: g.id })))) +
      U().guide(t('Only customers who agreed to messages get them. Phone numbers are sent to Meta and Google in locked (hashed) form; they never see the numbers themselves.', 'শুধু রাজি কাস্টমাররাই মেসেজ পান। Meta ও Google-এ ফোন নম্বর লক করা (হ্যাশ) অবস্থায় যায়; তারা আসল নম্বর দেখে না।'));
    A.on(el, '[data-au]', 'change', (e, i) => { const a = st(i.dataset.au); a[i.dataset.k] = i.checked; A.commit(`Audience ${i.dataset.au} ${i.dataset.k} ${i.checked ? 'on' : 'off'}`); A.toast(i.checked ? t('Will be sent with the next daily update', 'পরের দৈনিক আপডেটে পাঠানো হবে') : t('Removed from the ad platform', 'বিজ্ঞাপন প্ল্যাটফর্ম থেকে সরানো হলো'), 'good'); });
    el.querySelector('#au-ex').onchange = (e) => { mk.excludeRefused = e.target.checked; A.commit(`Refused-parcel exclusion ${mk.excludeRefused ? 'on' : 'off'}`); A.toast(mk.excludeRefused ? t('Refused-parcel people are left out everywhere', 'পার্সেল না নেওয়া মানুষ সব জায়গা থেকে বাদ') : t('Exclusion turned off', 'বাদ দেওয়া বন্ধ'), mk.excludeRefused ? 'good' : 'bad'); A.render(); };
    el.querySelector('#au-sync').onclick = () => { mk.audSynced = A.TODAY.toISOString(); A.commit('Audiences updated'); A.toast(t('Audiences updated and sent', 'অডিয়েন্স আপডেট করে পাঠানো হয়েছে'), 'good'); A.render(); };
    A.on(el, '[data-msg]', 'click', (e, b) => msgForm(b.dataset.msg));
    el.querySelector('#au-new').onclick = () => {
      const m = U().modal(t('New audience', 'নতুন অডিয়েন্স'), `<div class="formgrid">${U().field(t('Name', 'নাম'), U().input('an-n', '', `placeholder="${t('e.g. Gold · Dhaka · polo in 90 days', 'যেমন: Gold · ঢাকা · 90 দিনে পোলো')}"`))}${U().field(t('Area', 'এলাকা'), U().select('an-z', [['any', t('Anywhere', 'যেকোনো জায়গা')], ['inside', t('Inside Dhaka', 'ঢাকার ভেতরে')], ['sub', t('Dhaka suburbs', 'ঢাকার আশেপাশে')], ['outside', t('Outside Dhaka', 'ঢাকার বাইরে')]], 'any'))}${U().field(t('Bought', 'কিনেছেন'), U().select('an-c', [['any', t('Any category', 'যেকোনো ক্যাটাগরি')]].concat(A.CATS.map((c) => [c.id, A.t(c.en, c.bn)])), 'any'))}${U().field(t('Last order within (days)', 'শেষ অর্ডার কত দিনের মধ্যে'), U().input('an-d', '90', 'type="number"'))}</div><label class="row small" style="margin-top:8px"><input type="checkbox" id="an-v"> ${t('Only VIP (3+ delivered or ৳6,000+)', 'শুধু VIP (3+ ডেলিভারি বা ৳6,000+)')}</label>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="an-ok">${t('Create audience', 'অডিয়েন্স তৈরি')}</button>` });
      m.parentElement.querySelector('#an-ok').onclick = () => {
        const n = m.querySelector('#an-n').value.trim(); if (!n) { A.toast(t('Give it a name', 'নাম দিন'), 'bad'); return; }
        mk.custom.push({ id: A.uid('AU'), en: n, bn: n, zone: m.querySelector('#an-z').value, cat: m.querySelector('#an-c').value, days: Number(m.querySelector('#an-d').value) || 0, vip: m.querySelector('#an-v').checked });
        U().close(); A.commit(`Audience created: ${n}`); A.toast(t('Audience created', 'অডিয়েন্স তৈরি হয়েছে'), 'good'); A.render();
      };
    };
  }

  /* ---------- Calendar (adds clash alerts) ---------- */
  function renderCalendar2(el) {
    renderCalendar(el);
    const cal = M().cal; const alerts = [];
    const offers = cal.filter((e) => e.type === 'offer');
    for (let i = 0; i < offers.length; i++) for (let j = i + 1; j < offers.length; j++) if (offers[i].from <= offers[j].to && offers[j].from <= offers[i].to && offers[j].to >= F().ymd(A.TODAY)) alerts.push(t(`“${A.esc(offers[i].title)}” and “${A.esc(offers[j].title)}” overlap — customers may stack both.`, `“${A.esc(offers[i].title)}” ও “${A.esc(offers[j].title)}” একই দিনে — কাস্টমার দুটোই একসাথে নিতে পারেন।`));
    const low = A.calc.lowStock ? A.calc.lowStock(3) : [];
    if (low.length) alerts.push(t(`Ads are running while ${A.esc(low[0].name || low[0].p?.name || 'a product')} is low on stock.`, `${A.esc(low[0].name || low[0].p?.name || 'একটি প্রোডাক্ট')}-এর স্টক কম, অথচ বিজ্ঞাপন চলছে।`));
    const tabs = el.querySelector('.tabs');
    if (tabs && alerts.length) tabs.insertAdjacentHTML('afterend', alerts.slice(0, 3).map((a) => U().callout(a, 'warn', 'warn')).join(''));
  }

  /* ---------- Plan & ideas ---------- */
  function renderPlan(el) {
    const mk = MM(); const r = A.calc.range(per); const rows = allRows(r);
    const byPlat = {}; for (const x of rows) { const k = plat(x.c); const b = (byPlat[k] = byPlat[k] || { spend: 0, sales: 0, profit: 0, daily: 0 }); b.spend += x.s.spend; b.sales += x.s.sales; b.profit += x.s.profit; if (x.c.status === 'on') b.daily += x.c.daily; }
    const totalNow = A.sum(Object.values(byPlat), (b) => b.daily) * 30;
    const plan = Object.entries(byPlat).map(([k, b]) => { const roas = b.spend ? b.sales / b.spend : 0; const f = roas >= 4 ? 1.25 : roas >= 2.5 ? 1 : roas >= 1.5 ? 0.7 : 0.3; return { k, roas, now: b.daily * 30, next: Math.round(b.daily * 30 * f / 100) * 100 }; });
    const nextTot = A.sum(plan, (p) => p.next);
    const dist = {}; for (const o of A.calc.ordersIn(r.from, r.to)) { if (o.status === 'cancelled') continue; const d = (dist[o.district] = dist[o.district] || { n: 0, del: 0, ret: 0, profit: 0 }); d.n++; if (A.calc.isDelivered(o)) d.del++; if (o.status === 'returned') d.ret++; d.profit += A.calc.orderProfit(o); }
    const dl = Object.entries(dist).map(([k, d]) => ({ _id: k, k, ...d, rr: d.n ? d.ret / d.n : 0, ppo: d.n ? d.profit / d.n : 0 })).filter((d) => d.n >= 3).sort((a, b) => b.n - a.n).slice(0, 10);
    const dv = (d) => (d.rr > 0.25 ? [t('Avoid COD-only ads', 'শুধু COD বিজ্ঞাপন নয়'), 'bad'] : d.rr > 0.15 ? [t('Ask delivery charge first', 'আগে ডেলিভারি চার্জ নিন'), 'warn'] : [t('Spend more here', 'এখানে বেশি খরচ করুন'), 'good']);
    const waiting = mk.proposals.filter((p) => p.st === 'wait');
    el.innerHTML = A.pageHead(t('Plan & ideas', 'পরিকল্পনা ও আইডিয়া'), t('Next month’s budget, where to spend, what to post, what others are doing — and AI suggestions waiting for your OK.', 'আগামী মাসের বাজেট, কোথায় খরচ করবেন, কী পোস্ট করবেন, অন্যরা কী করছে — আর আপনার OK-এর অপেক্ষায় থাকা AI প্রস্তাব।')) + A.tabsBar('marketing', 'plan') + perBar() +
      U().card(t(`AI proposals waiting for your OK (${waiting.length})`, `আপনার OK-এর অপেক্ষায় AI প্রস্তাব (${waiting.length})`), mk.proposals.map((p) => `<div class="mk2-prop"><div class="tx"><b>${t(p.en, p.bn)}</b><div class="muted small">${t(p.why[0], p.why[1])}</div></div>${p.st === 'wait' ? `<button class="btn sm" data-no="${p.id}">${t('No', 'না')}</button><button class="btn sm primary" data-ok="${p.id}">${t('Approve', 'অনুমোদন')}</button>` : U().badge(p.st === 'ok' ? t('Approved', 'অনুমোদিত') : t('Declined', 'বাতিল'), p.st === 'ok' ? 'good' : '')}</div>`).join('')) +
      `<div class="grid g2">
        ${U().card(t('Budget plan for next month', 'আগামী মাসের বাজেট পরিকল্পনা'), U().table([
          { h: t('Channel', 'চ্যানেল'), f: (p) => `<b>${p.k}</b>` }, { h: t('Per ৳1', '৳1-এ'), r: 1, f: (p) => '৳' + p.roas.toFixed(1) },
          { h: t('Now / month', 'এখন / মাস'), r: 1, f: (p) => F().tk(p.now) }, { h: t('Suggested', 'প্রস্তাবিত'), r: 1, f: (p) => `<b>${F().tk(p.next)}</b> ${A.delta(p.next, p.now)}` },
        ], plan.map((p) => ({ ...p, _id: p.k }))) + `<div class="row between" style="margin-top:10px"><span class="small">${t(`Total ${F().tk(totalNow)} → ${F().tk(nextTot)}`, `মোট ${F().tk(totalNow)} → ${F().tk(nextTot)}`)}</span><button class="btn sm primary" id="pl-apply">${t('Use this plan', 'এই পরিকল্পনা নিন')}</button></div>`)}
        ${U().card(t('Where to spend by district', 'কোন জেলায় খরচ করবেন'), U().table([
          { h: t('District', 'জেলা'), f: (d) => `<b>${A.esc(d.k)}</b>` }, { h: t('Orders', 'অর্ডার'), r: 1, f: (d) => F().num(d.n) },
          { h: t('Return rate', 'ফেরতের হার'), r: 1, f: (d) => `<span style="color:${d.rr > 0.25 ? 'var(--bad)' : d.rr > 0.15 ? 'var(--warn)' : 'var(--good)'}">${F().pct(d.rr * 100, 0)}</span>` },
          { h: t('Profit / order', 'লাভ / অর্ডার'), r: 1, f: (d) => F().tk(d.ppo), hide: 1 }, { h: t('Advice', 'পরামর্শ'), f: (d) => U().badge(...dv(d)) },
        ], dl), { sub: t('From your own return rates', 'আপনার নিজের ফেরতের হার থেকে') })}
      </div>
      <div class="grid g2">
        ${U().card(t('Creative ideas', 'বিজ্ঞাপনের আইডিয়া'), `<div class="list">${mk.ideas.map((i) => `<div class="li"><span class="badge info">${i.tag}</span><div class="grow">${t(i.en, i.bn)}</div><button class="btn sm" data-idea="${i.id}">${i.cal ? t('On calendar', 'ক্যালেন্ডারে আছে') : t('Add to calendar', 'ক্যালেন্ডারে যোগ')}</button></div>`).join('')}</div><button class="btn sm ghost" id="pl-more" style="margin-top:8px">✦ ${t('More ideas with AI', 'AI দিয়ে আরও আইডিয়া')}</button>`)}
        ${U().card(t('Competitor watch', 'প্রতিযোগীর খবর'), `<div class="list">${mk.comp.map((c) => `<div class="li"><div class="grow"><b>${c.name}</b><div class="muted small">${t(c.note[0], c.note[1])}</div></div></div>`).join('')}</div>`, { sub: t('From their public ad library pages, checked weekly', 'তাদের পাবলিক অ্যাড লাইব্রেরি থেকে, সপ্তাহে একবার') })}
      </div>`;
    wirePer(el);
    A.on(el, '[data-ok]', 'click', (e, b) => {
      const p = mk.proposals.find((x) => x.id === b.dataset.ok);
      const done = () => { p.st = 'ok'; if (p.kind === 'budget') { const c = A.byId(A.D.campaigns, p.cid); if (c) c.daily = p.to; } if (p.kind === 'pause') { const c = A.byId(A.D.campaigns, p.cid); if (c) c.status = 'off'; } A.commit(`AI proposal approved: ${p.en}`); A.toast(t('Approved and applied', 'অনুমোদিত ও চালু হয়েছে'), 'good'); A.render(); };
      if (p.kind === 'budget') pinAsk(t('Approve budget raise?', 'বাজেট বাড়ানো অনুমোদন?'), t(p.en, p.bn), t('Approve', 'অনুমোদন'), done); else U().confirm(t('Approve this?', 'অনুমোদন দেবেন?'), t(p.en, p.bn), t('Approve', 'অনুমোদন'), done);
    });
    A.on(el, '[data-no]', 'click', (e, b) => { const p = mk.proposals.find((x) => x.id === b.dataset.no); p.st = 'no'; A.commit(`AI proposal declined: ${p.en}`); A.toast(t('Declined — AI will not suggest it again this month', 'বাতিল — এ মাসে AI আর এটা বলবে না'), 'good'); A.render(); });
    A.on(el, '[data-idea]', 'click', (e, b) => { const i = mk.ideas.find((x) => x.id === b.dataset.idea); if (i.cal) return; i.cal = true; const d = F().ymd(A.TODAY.getTime() + 3 * DAY); mk.cal.push({ id: A.uid('CL'), title: i.en, from: d, to: d, type: 'post' }); A.commit(`Idea added to calendar: ${i.en}`); A.toast(t('Added to the calendar', 'ক্যালেন্ডারে যোগ হয়েছে'), 'good'); A.render(); });
    el.querySelector('#pl-more').onclick = () => { mk.ideas.push({ id: A.uid('I'), en: 'Winter layering: polo under a jacket, 3 looks', bn: 'শীতের লেয়ারিং: জ্যাকেটের নিচে পোলো, 3টি লুক', tag: 'Carousel' }); A.commit('AI idea added'); A.toast(t('New idea added', 'নতুন আইডিয়া যোগ হয়েছে'), 'good'); A.render(); };
    el.querySelector('#pl-apply').onclick = () => pinAsk(t('Use this budget plan?', 'এই বাজেট পরিকল্পনা নেবেন?'), t(`Monthly ad budget ${F().tk(totalNow)} → <b>${F().tk(nextTot)}</b>. Each campaign’s daily budget changes from the 1st.`, `মাসিক বিজ্ঞাপন বাজেট ${F().tk(totalNow)} → <b>${F().tk(nextTot)}</b>। 1 তারিখ থেকে প্রতিটা ক্যাম্পেইনের দৈনিক বাজেট বদলাবে।`), t('Approve plan', 'পরিকল্পনা অনুমোদন'), () => {
      A.D.campaigns.forEach((c) => { const p = plan.find((x) => x.k === plat(c)); if (p && p.now) c.daily = Math.max(100, Math.round(c.daily * p.next / p.now / 10) * 10); }); A.commit(`Budget plan approved: ${F().tk(nextTot)}/month`); A.toast(t('Plan saved — budgets updated', 'পরিকল্পনা সেভ — বাজেট আপডেট হয়েছে'), 'good'); A.render();
    });
  }

  /* ---------- Studio (virtual photoshoot, video, social posts) ---------- */
  const SK = { photo: ['Virtual photoshoot', 'ভার্চুয়াল ফটোশুট', 60], video: ['Video', 'ভিডিও', 180], post: ['Social post', 'সোশ্যাল পোস্ট', 20] };
  const SST = { wait: ['Waiting for your OK', 'আপনার OK এর অপেক্ষায়', 'warn'], making: ['Making', 'তৈরি হচ্ছে', 'info'], ok: ['Approved', 'অনুমোদিত', 'good'], redo: ['Changes asked', 'বদল চাওয়া হয়েছে', 'accent'], archived: ['Archived', 'আর্কাইভ', 'dark'] };
  function studioData() {
    if (!A.D.studio) { const ps = A.D.products.filter((p) => p.status === 'live').slice(0, 6);
      A.D.studio = { cap: 6000, jobs: [
        { id: 'SJ1', kind: 'photo', pid: ps[0].id, brief: 'On a model, rooftop at sunset, 4 angles', out: 4, st: 'wait', t: new Date(A.TODAY - 2 * 36e5).toISOString() },
        { id: 'SJ2', kind: 'video', pid: ps[1].id, brief: '15-second reel from product photos, Bangla caption', out: 1, st: 'wait', t: new Date(A.TODAY - 5 * 36e5).toISOString() },
        { id: 'SJ3', kind: 'post', pid: ps[2].id, brief: 'Square + story sizes, “Winter polo week” offer', out: 3, st: 'ok', t: new Date(A.TODAY - 26 * 36e5).toISOString() },
        { id: 'SJ4', kind: 'photo', pid: ps[3].id, brief: 'Plain white background, ghost mannequin', out: 4, st: 'making', t: new Date(A.TODAY - 20 * 6e4).toISOString() },
        { id: 'SJ5', kind: 'post', pid: ps[4].id, brief: 'Carousel: 3 ways to wear', out: 5, st: 'redo', t: new Date(A.TODAY - 50 * 36e5).toISOString() },
      ] }; }
    return A.D.studio;
  }
  function renderStudio(el) {
    const S = studioData(); const J = S.jobs.filter((j) => j.st !== 'archived'); const spent = A.sum(S.jobs.filter((j) => j.st !== 'archived'), (j) => SK[j.kind][2] * j.out);
    const wait = J.filter((j) => j.st === 'wait');
    el.innerHTML = A.pageHead(t('Studio', 'স্টুডিও'), t('Make product photos, short videos and social posts with AI. Nothing goes on the shop or a page until you approve it.', 'AI দিয়ে প্রোডাক্টের ছবি, ছোট ভিডিও ও সোশ্যাল পোস্ট বানান। আপনি অনুমোদন না দিলে দোকানে বা পেজে কিছুই যায় না।'), `<button class="btn primary" id="st-new">${A.icon('plus')}${t('New job', 'নতুন কাজ')}</button>`) + toolsBar('studio') +
      `<div class="grid g4">${U().kpi({ label: t('Waiting for your OK', 'আপনার OK এর অপেক্ষায়'), value: wait.length })}${U().kpi({ label: t('Approved this month', 'এ মাসে অনুমোদিত'), value: J.filter((j) => j.st === 'ok').length })}${U().kpi({ label: t('Spent this month', 'এ মাসে খরচ'), value: F().tk(spent), sub: t(`limit ${F().tk(S.cap)}`, `সীমা ${F().tk(S.cap)}`) })}${U().kpi({ label: t('Files made', 'তৈরি ফাইল'), value: A.sum(J, (j) => j.out), sub: t('a studio day costs about ৳15,000', 'স্টুডিওর একদিন প্রায় ৳15,000') })}</div>
      <div class="grid g3" style="margin-top:14px">${Object.entries(SK).map(([k, v]) => U().card(t(v[0], v[1]), `<div class="muted small">${{ photo: t('Your product on a model or a clean background, from 2 flat photos.', '2টি সাধারণ ছবি থেকে মডেলের গায়ে বা পরিষ্কার ব্যাকগ্রাউন্ডে প্রোডাক্ট।'), video: t('A 15-second reel or ad video from product photos, with music and captions.', 'প্রোডাক্টের ছবি থেকে 15 সেকেন্ডের রিল বা বিজ্ঞাপন ভিডিও, মিউজিক ও ক্যাপশনসহ।'), post: t('Feed, story and carousel posts with price and offer, in your brand look.', 'দাম ও অফারসহ ফিড, স্টোরি ও ক্যারোসেল পোস্ট, আপনার ব্র্যান্ডের লুকে।') }[k]}</div><div class="row between" style="margin-top:8px"><span class="small">${F().tk(v[2])} ${t('each', 'প্রতিটা')}</span><button class="btn sm" data-stk="${k}">${t('Start', 'শুরু')}</button></div>`)).join('')}</div>
      ${U().card(t('Jobs', 'কাজগুলো'), `<div class="list">${S.jobs.filter((j) => j.st !== 'archived').map((j) => { const p = A.byId(A.D.products, j.pid); return `<div class="li" style="gap:10px;flex-wrap:wrap;align-items:flex-start">${p ? U().thumb(p, 44) : ''}<div class="grow" style="min-width:160px"><b>${t(SK[j.kind][0], SK[j.kind][1])}</b> · ${A.esc(p ? p.name : '')}<div class="muted small">${A.esc(j.brief)} · ${j.out} ${t('files', 'ফাইল')} · ${F().ago(j.t)}</div><div style="margin-top:4px">${U().badge(t(SST[j.st][0], SST[j.st][1]), SST[j.st][2])}</div></div><div class="row" style="gap:6px;flex-wrap:wrap">${j.st === 'wait' ? `<button class="btn sm" data-redo="${j.id}">${t('Ask for changes', 'বদল চান')}</button><button class="btn sm primary" data-sok="${j.id}">${t('Approve', 'অনুমোদন')}</button>` : j.st === 'making' ? `<button class="btn sm ghost" data-ready="${j.id}">${t('Check now', 'এখন দেখুন')}</button>` : ''}<button class="btn sm ghost" data-sarc="${j.id}">${t('Archive', 'আর্কাইভ')}</button></div></div>`; }).join('')}</div>`, { sub: t('Approved photos go to the product’s photo slots; approved posts go to the Calendar.', 'অনুমোদিত ছবি প্রোডাক্টের ছবির ঘরে যায়; অনুমোদিত পোস্ট ক্যালেন্ডারে যায়।') })}`;
    const J0 = (id) => S.jobs.find((j) => j.id === id);
    const newJob = (kind) => { const ps = A.D.products.filter((p) => p.status === 'live').slice(0, 30); const m = U().modal(t('New Studio job', 'স্টুডিওর নতুন কাজ'), `<div class="formgrid">${U().field(t('Type', 'ধরন'), U().select('sj-k', Object.entries(SK).map(([k, v]) => [k, t(v[0], v[1])]), kind || 'photo'))}${U().field(t('Product', 'প্রোডাক্ট'), U().select('sj-p', ps.map((p) => [p.id, p.name]), ps[0].id))}${U().field(t('How many files', 'কয়টা ফাইল'), U().input('sj-n', 4, 'type="number" min="1" max="10"'))}</div>${U().field(t('What you want', 'কী চান'), U().input('sj-b', '', `placeholder="${t('e.g. on a model, Dhaka street, evening light', 'যেমন মডেলের গায়ে, ঢাকার রাস্তা, সন্ধ্যার আলো')}"`))}`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="sj-ok">${t('Start', 'শুরু')}</button>` });
      m.querySelector('#sj-ok').onclick = () => { const k = m.querySelector('#sj-k').value; const n = Math.max(1, Math.min(10, +m.querySelector('#sj-n').value || 1)); if (spent + SK[k][2] * n > S.cap) { A.toast(t('This would pass the monthly Studio limit', 'এতে মাসের স্টুডিও সীমা ছাড়িয়ে যাবে'), 'bad'); return; } S.jobs.unshift({ id: A.uid('SJ'), kind: k, pid: m.querySelector('#sj-p').value, brief: m.querySelector('#sj-b').value.trim() || t('Standard look', 'সাধারণ লুক'), out: n, st: 'making', t: A.TODAY.toISOString() }); U().close(); A.commit(`Studio job started: ${SK[k][0]}`); A.toast(t('Started — you get a note when it is ready', 'শুরু হয়েছে — তৈরি হলে জানাব'), 'good'); A.render(); }; };
    el.querySelector('#st-new').onclick = () => newJob();
    A.on(el, '[data-stk]', 'click', (e, b) => newJob(b.dataset.stk));
    A.on(el, '[data-sok]', 'click', (e, b) => { const j = J0(b.dataset.sok); j.st = 'ok'; if (j.kind === 'post') { const d = F().ymd(A.TODAY.getTime() + 2 * DAY); (MM().cal || []).push({ id: A.uid('CL'), title: 'Studio post: ' + j.brief, from: d, to: d, type: 'post' }); } A.commit(`Studio job approved: ${SK[j.kind][0]}`); A.toast(j.kind === 'post' ? t('Approved — added to the Calendar', 'অনুমোদিত — ক্যালেন্ডারে যোগ হয়েছে') : t('Approved — added to the product’s photos', 'অনুমোদিত — প্রোডাক্টের ছবিতে যোগ হয়েছে'), 'good'); A.render(); });
    A.on(el, '[data-redo]', 'click', (e, b) => { const j = J0(b.dataset.redo); j.st = 'making'; A.commit('Studio job sent back for changes'); A.toast(t('Sent back — a new version is being made', 'ফেরত পাঠানো হলো — নতুন ভার্সন তৈরি হচ্ছে'), 'good'); A.render(); });
    A.on(el, '[data-ready]', 'click', (e, b) => { const j = J0(b.dataset.ready); j.st = 'wait'; A.commit('Studio job ready for review'); A.toast(t('Ready — please check and approve', 'তৈরি — দেখে অনুমোদন দিন'), 'good'); A.render(); });
    A.on(el, '[data-sarc]', 'click', (e, b) => { const j = J0(b.dataset.sarc); j.st = 'archived'; A.commit('Studio job archived'); A.toast(t('Archived', 'আর্কাইভ হলো'), 'good'); A.render(); });
  }

  /* ---------- Influencers & affiliates ---------- */
  function affData() {
    if (!A.D.affiliates) A.D.affiliates = { list: [{ id: 'AF1', name: 'Tanvir Vlogs', handle: '@tanvirvlogs', plat: 'YouTube', code: 'TANVIR10', pct: 8, st: 'on' }, { id: 'AF2', name: 'Dhaka Style Diary', handle: '@dhakastylediary', plat: 'Instagram', code: 'DSD10', pct: 10, st: 'on' }, { id: 'AF3', name: 'Rafsan Fits', handle: '@rafsanfits', plat: 'TikTok', code: 'RAFSAN', pct: 7, st: 'on' }, { id: 'AF4', name: 'Campus Deals BD', handle: 'facebook.com/campusdeals', plat: 'Facebook', code: 'CAMPUS5', pct: 5, st: 'paused' }], payouts: [{ id: 'PO1', d: F().ymd(A.TODAY.getTime() - 12 * DAY), aid: 'AF1', amt: 3200, how: 'bKash', by: 'Mehadi Hasan' }, { id: 'PO2', d: F().ymd(A.TODAY.getTime() - 12 * DAY), aid: 'AF2', amt: 4100, how: 'bKash', by: 'Mehadi Hasan' }] };
    return A.D.affiliates;
  }
  const affStats = (a, i) => { const os = A.calc.ordersIn(A.calc.range('30d').from, A.calc.range('30d').to).filter((o, k) => (k * 7 + i * 3) % 19 === 0 || o.coupon === a.code); const del = os.filter(A.calc.isDelivered); const sales = A.sum(del, (o) => o.subtotal - o.discount); const com = Math.round(sales * a.pct / 100); const paid = A.sum(affData().payouts.filter((p) => p.aid === a.id), (p) => p.amt); return { orders: os.length, del: del.length, ret: os.filter((o) => o.status === 'returned').length, sales, com, paid, due: Math.max(0, com + 2400 - paid) }; };
  function renderInfluencers(el) {
    const AF = affData(); const rows = AF.list.filter((a) => a.st !== 'archived').map((a, i) => ({ _id: a.id, a, s: affStats(a, i) }));
    const due = A.sum(rows, (r) => r.s.due); const top = rows.slice().sort((x, y) => y.s.sales - x.s.sales)[0];
    el.innerHTML = A.pageHead(t('Influencers & affiliates', 'ইনফ্লুয়েন্সার ও অ্যাফিলিয়েট'), t('Each partner gets a personal code. They earn commission only on delivered orders — returned parcels earn nothing.', 'প্রত্যেক পার্টনার একটা নিজস্ব কোড পান। শুধু ডেলিভারি হওয়া অর্ডারে কমিশন — ফেরত পার্সেলে কিছু নয়।'), `<button class="btn primary" id="af-add">${A.icon('plus')}${t('Add partner', 'পার্টনার যোগ')}</button>`) + toolsBar('influencers') +
      `<div class="grid g4">${U().kpi({ label: t('Delivered sales (30 days)', 'ডেলিভারি বিক্রি (30 দিন)'), value: F().tk(A.sum(rows, (r) => r.s.sales)) })}${U().kpi({ label: t('Commission earned', 'কমিশন হয়েছে'), value: F().tk(A.sum(rows, (r) => r.s.com)) })}${U().kpi({ label: t('Due to pay', 'দেওয়া বাকি'), value: F().tk(due) })}${U().kpi({ label: t('Best partner', 'সেরা পার্টনার'), value: top ? A.esc(top.a.name) : '—', sub: top ? F().tk(top.s.sales) : '' })}</div>
      <div class="card" style="margin-top:14px">${U().table([
        { h: t('Partner', 'পার্টনার'), f: (r) => `<b>${A.esc(r.a.name)}</b><div class="muted small">${r.a.plat} · ${A.esc(r.a.handle)}</div>` },
        { h: t('Code', 'কোড'), f: (r) => `<span class="mono">${r.a.code}</span>${r.a.st === 'paused' ? ' ' + U().badge(t('Paused', 'পজ'), 'dark') : ''}` },
        { h: t('Orders', 'অর্ডার'), r: 1, hide: 1, f: (r) => `${r.s.orders} <span class="muted small">(${r.s.ret} ${t('back', 'ফেরত')})</span>` },
        { h: t('Delivered sales', 'ডেলিভারি বিক্রি'), r: 1, f: (r) => F().tk(r.s.sales) },
        { h: t('Commission', 'কমিশন'), r: 1, hide: 1, f: (r) => `${F().tk(r.s.com)} <span class="muted small">${r.a.pct}%</span>` },
        { h: t('Due', 'বাকি'), r: 1, f: (r) => `<b>${F().tk(r.s.due)}</b>` },
        { h: '', r: 1, f: (r) => `<span class="row" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap">${r.s.due ? `<button class="btn sm primary" data-pay="${r.a.id}">${t('Pay', 'পেমেন্ট')}</button>` : ''}<button class="btn sm ghost" data-afp="${r.a.id}">${r.a.st === 'on' ? t('Pause', 'পজ') : t('Resume', 'চালু')}</button></span>` },
      ], rows)}</div>
      ${U().card(t('Payout ledger', 'পেমেন্টের খাতা'), U().table([{ h: t('Date', 'তারিখ'), f: (p) => F().date(p.d + 'T12:00:00+06:00') }, { h: t('Partner', 'পার্টনার'), f: (p) => A.esc((AF.list.find((a) => a.id === p.aid) || {}).name || '') }, { h: t('Paid by', 'যেভাবে'), hide: 1, f: (p) => p.how }, { h: t('Amount', 'টাকা'), r: 1, f: (p) => F().tk(p.amt) }, { h: t('By', 'যিনি দিলেন'), hide: 1, f: (p) => A.esc(p.by) }], AF.payouts.slice().reverse().map((p) => ({ ...p, _id: p.id }))), { sub: t('Every payout is also an expense in Finance (Marketing).', 'প্রতিটা পেমেন্ট ফাইন্যান্সে খরচ হিসেবেও যায় (মার্কেটিং)।') })}`;
    A.on(el, '[data-pay]', 'click', (e, b) => { const i = AF.list.findIndex((a) => a.id === b.dataset.pay); const a = AF.list[i]; const s = affStats(a, AF.list.filter((x) => x.st !== 'archived').indexOf(a)); pinAsk(t(`Pay ${a.name}?`, `${a.name} কে পেমেন্ট দেবেন?`), t(`${F().tk(s.due)} by bKash for delivered orders with code ${a.code}.`, `কোড ${a.code} এর ডেলিভারি অর্ডারের জন্য bKash এ ${F().tk(s.due)}।`), t('Pay', 'পেমেন্ট দিন'), () => { AF.payouts.push({ id: A.uid('PO'), d: F().ymd(A.TODAY.getTime()), aid: a.id, amt: s.due, how: 'bKash', by: 'Mehadi Hasan' }); (A.D.expenses || []).unshift({ id: A.uid('EXP'), date: F().ymd(A.TODAY.getTime()), name: `Affiliate payout — ${a.name}`, cat: 'Marketing', amount: s.due, fixed: false }); A.commit(`Affiliate payout ${a.name} ${s.due}`); A.toast(t('Paid — added to the ledger and Finance', 'পেমেন্ট হলো — খাতা ও ফাইন্যান্সে যোগ হয়েছে'), 'good'); A.render(); }); });
    A.on(el, '[data-afp]', 'click', (e, b) => { const a = AF.list.find((x) => x.id === b.dataset.afp); a.st = a.st === 'on' ? 'paused' : 'on'; A.commit(`Affiliate ${a.name} ${a.st}`); A.toast(a.st === 'on' ? t('Code works again', 'কোড আবার চালু') : t('Paused — the code stops giving a discount', 'পজ — কোডে আর ছাড় মিলবে না'), 'good'); A.render(); });
    el.querySelector('#af-add').onclick = () => { const m = U().modal(t('Add partner', 'পার্টনার যোগ'), `<div class="formgrid">${U().field(t('Name', 'নাম'), U().input('af-n', ''))}${U().field(t('Page or handle', 'পেজ বা হ্যান্ডেল'), U().input('af-h', '', 'placeholder="@name"'))}${U().field(t('Platform', 'প্ল্যাটফর্ম'), U().select('af-pl', [['Facebook', 'Facebook'], ['Instagram', 'Instagram'], ['YouTube', 'YouTube'], ['TikTok', 'TikTok']], 'Instagram'))}${U().field(t('Personal code', 'নিজস্ব কোড'), U().input('af-c', '', 'placeholder="NAME10"'))}${U().field(t('Commission on delivered sales (%)', 'ডেলিভারি বিক্রিতে কমিশন (%)'), U().input('af-p', 8, 'type="number" min="1" max="30"'))}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="af-ok">${t('Save · PIN', 'সেভ · PIN')}</button>` });
      m.querySelector('#af-ok').onclick = () => { const n = m.querySelector('#af-n').value.trim(); const c = m.querySelector('#af-c').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!n || !c) { A.toast(t('Fill in name and code', 'নাম ও কোড দিন'), 'bad'); return; } if (AF.list.some((a) => a.code === c)) { A.toast(t('This code is already used', 'এই কোড আগেই আছে'), 'bad'); return; } const nv = { id: A.uid('AF'), name: n, handle: m.querySelector('#af-h').value.trim(), plat: m.querySelector('#af-pl').value, code: c, pct: +m.querySelector('#af-p').value || 8, st: 'on' }; U().close(); pinAsk(t('Add this partner?', 'এই পার্টনার যোগ করবেন?'), `${A.esc(n)} · ${c} · ${nv.pct}%`, t('Add', 'যোগ করুন'), () => { AF.list.push(nv); A.commit(`Affiliate added ${n} ${c}`); A.toast(t('Partner added — share the code with them', 'পার্টনার যোগ হলো — কোডটা তাকে দিন'), 'good'); A.render(); }); }; };
  }

  /* ---------- Accounts & tools ---------- */
  const TOOLS = [['accounts', ['Ad accounts', 'অ্যাড অ্যাকাউন্ট'], renderAccounts], ['studio', ['Studio', 'স্টুডিও'], renderStudio], ['influencers', ['Influencers & affiliates', 'ইনফ্লুয়েন্সার ও অ্যাফিলিয়েট'], renderInfluencers], ['landing', ['Landing pages', 'ল্যান্ডিং পেজ'], renderLanding], ['referrals', ['Refer a friend', 'রেফারেল'], renderReferrals], ['feed', ['Shopping feed', 'শপিং ফিড'], renderFeed]];
  let toolSub = 'accounts';
  function toolsBar(k) { return A.tabsBar('marketing', 'tools') + `<div class="mk2-sub chips" id="mk2-tools">${TOOLS.map((x) => `<button class="chip ${x[0] === k ? 'on' : ''}" data-v="${x[0]}">${t(x[1][0], x[1][1])}</button>`).join('')}</div>`; }
  function renderTools(el, r) {
    if (r && r.id && TOOLS.some((x) => x[0] === r.id)) toolSub = r.id;
    const x = TOOLS.find((y) => y[0] === toolSub) || TOOLS[0]; x[2](el);
    A.on(el, '#mk2-tools .chip', 'click', (e, b) => { toolSub = b.dataset.v; A.render(); });
  }

  /* ================= register ================= */
  const G = (en, bn) => ({ en, bn });
  A.mod('marketing', {
    overview: { render: (el) => renderOverview(el), guide: G('<p><b>What:</b> ad spend, delivered sales, sales per ৳1, cost per delivered order and profit after ads — for the period you pick.</p><p><b>Why:</b> a campaign can show 200 orders and still lose money when 30% come back. Example: TikTok denim spent ৳18,000 for 12 delivered parcels.</p><p><b>How:</b> pick a period, read the AI line, open anything under “Needs your eye”.</p>', '<p><b>কী:</b> বেছে নেওয়া সময়ের বিজ্ঞাপন খরচ, ডেলিভারি বিক্রি, ৳1-এ বিক্রি, প্রতি ডেলিভারি অর্ডারে খরচ আর বিজ্ঞাপন বাদে লাভ।</p><p><b>কেন:</b> একটা ক্যাম্পেইনে 200 অর্ডার দেখালেও 30% ফেরত এলে লস হতে পারে। যেমন TikTok ডেনিমে ৳18,000 খরচে মাত্র 12টি পার্সেল ডেলিভারি।</p><p><b>কীভাবে:</b> সময় বেছে নিন, AI লাইন পড়ুন, “আপনার নজর দরকার”-এর যেকোনোটা খুলুন।</p>') },
    campaigns: { render: (el, r) => renderCampaigns2(el, r), guide: G('<p><b>What:</b> every ad campaign on Facebook, Instagram, Google, YouTube and TikTok in one table with a verdict: Scale, Keep, Fix or Stop.</p><p><b>Why:</b> the platform counts clicks on “Order”; we count parcels that reached the customer.</p><p><b>How:</b> tap a campaign to see its ads, districts and products. Pause, Duplicate or Change budget there — budget and resume need your PIN.</p>', '<p><b>কী:</b> Facebook, Instagram, Google, YouTube ও TikTok-এর সব ক্যাম্পেইন এক টেবিলে, সাথে রায়: বাড়ান, চালু রাখুন, ঠিক করুন বা বন্ধ করুন।</p><p><b>কেন:</b> প্ল্যাটফর্ম "অর্ডার" চাপলেই গোনে; আমরা গুনি কাস্টমারের হাতে পৌঁছানো পার্সেল।</p><p><b>কীভাবে:</b> ক্যাম্পেইনে চাপলে ভেতরের বিজ্ঞাপন, জেলা ও প্রোডাক্ট দেখবেন। সেখানে পজ, ডুপ্লিকেট বা বাজেট বদল — বাজেট ও চালুতে PIN লাগে।</p>') },
    messages: { render: (el) => renderMessages2(el), guide: G('<p><b>What:</b> WhatsApp, SMS, Email and Messenger campaigns with results, plus automatic messages.</p><p><b>Why:</b> your own customers are the cheapest sales. Example: a WhatsApp combo offer to 1,240 Gold customers cost ৳2,980 and sold ৳1,15,200.</p><p><b>How:</b> New campaign → channel → audience (only opted-in people) → approved template → offer → time and speed → send a test → schedule with your OK.</p>', '<p><b>কী:</b> WhatsApp, SMS, Email ও Messenger ক্যাম্পেইন ও তার ফল, আর অটোমেটিক মেসেজ।</p><p><b>কেন:</b> নিজের কাস্টমারই সবচেয়ে সস্তা বিক্রি। যেমন 1,240 জন Gold কাস্টমারকে WhatsApp কম্বো অফারে খরচ ৳2,980, বিক্রি ৳1,15,200।</p><p><b>কীভাবে:</b> নতুন ক্যাম্পেইন → চ্যানেল → অডিয়েন্স (শুধু রাজি মানুষ) → অনুমোদিত টেমপ্লেট → অফার → সময় ও গতি → টেস্ট → আপনার OK দিয়ে শিডিউল।</p>') },
    audiences: { render: (el) => renderAudiences(el), guide: G('<p><b>What:</b> customer groups from your own data (grade, area, what they bought, when).</p><p><b>Why:</b> “Gold · Dhaka · polo in 90 days” buys again far more than strangers, and Meta can find people like them.</p><p><b>How:</b> switch Meta or Google on to send a group; keep the refused-parcel list on so those people never see your ads.</p>', '<p><b>কী:</b> নিজের ডেটা থেকে কাস্টমার গ্রুপ (গ্রেড, এলাকা, কী কিনেছেন, কবে)।</p><p><b>কেন:</b> “Gold · ঢাকা · 90 দিনে পোলো” অচেনা মানুষের চেয়ে অনেক বেশি আবার কেনেন, আর Meta এদের মতো মানুষ খুঁজে দিতে পারে।</p><p><b>কীভাবে:</b> গ্রুপ পাঠাতে Meta বা Google চালু করুন; পার্সেল না নেওয়ার লিস্ট চালু রাখুন যাতে তারা বিজ্ঞাপন না দেখে।</p>') },
    calendar: { render: (el) => renderCalendar2(el), guide: G('<p><b>What:</b> ads, messages, posts, sales and holidays on one month view, with warnings when offers overlap.</p><p><b>Why:</b> Victory Day or Eid sales are won 2–3 weeks before.</p><p><b>How:</b> tap a day to add an event; fix any yellow warning on top.</p>', '<p><b>কী:</b> বিজ্ঞাপন, মেসেজ, পোস্ট, সেল ও ছুটি এক মাসের ছকে; অফার মিশে গেলে সতর্কতা।</p><p><b>কেন:</b> বিজয় দিবস বা ঈদের বিক্রি 2–3 সপ্তাহ আগে থেকেই ঠিক হয়।</p><p><b>কীভাবে:</b> দিনে চাপ দিয়ে ইভেন্ট যোগ করুন; ওপরের হলুদ সতর্কতা ঠিক করুন।</p>') },
    plan: { render: (el) => renderPlan(el), guide: G('<p><b>What:</b> next month’s budget by channel, districts worth spending on, creative ideas, competitor notes and AI proposals.</p><p><b>Why:</b> a district with 30% returns eats the profit of three good ones.</p><p><b>How:</b> approve or decline each AI proposal; budget raises always need your PIN.</p>', '<p><b>কী:</b> চ্যানেল অনুযায়ী আগামী মাসের বাজেট, কোন জেলায় খরচ করবেন, বিজ্ঞাপনের আইডিয়া, প্রতিযোগীর খবর ও AI প্রস্তাব।</p><p><b>কেন:</b> 30% ফেরতের একটা জেলা তিনটা ভালো জেলার লাভ খেয়ে ফেলে।</p><p><b>কীভাবে:</b> প্রতিটা AI প্রস্তাবে হ্যাঁ বা না দিন; বাজেট বাড়াতে সবসময় PIN লাগে।</p>') },
    tools: { render: (el, r) => renderTools(el, r), guide: G('<p><b>What:</b> ad accounts, landing pages, refer-a-friend and the Shopping feed in one place.</p><p><b>Why:</b> if an ad account cannot see your sales, it learns wrong and wastes money.</p><p><b>How:</b> pick a tool from the row of buttons on top. “Studio” makes photos, videos and posts with AI (you approve each one); “Influencers & affiliates” gives partners a personal code and pays commission only on delivered orders.</p>', '<p><b>কী:</b> অ্যাড অ্যাকাউন্ট, ল্যান্ডিং পেজ, রেফারেল ও শপিং ফিড এক জায়গায়।</p><p><b>কেন:</b> অ্যাড অ্যাকাউন্ট বিক্রি দেখতে না পেলে ভুল শেখে আর টাকা নষ্ট হয়।</p><p><b>কীভাবে:</b> ওপরের বোতামের সারি থেকে টুল বেছে নিন।</p>') },
  });
})();
