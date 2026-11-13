/* EXTAS admin prototype — Settings: one page with a searchable left list in two groups.
   Business: store, erp, couriers, payments, messages, team. System (owner only): keys, backups, health, ai, updates,
   security, activity, privacy, telegram, manual. Each item is its own route (#settings--<item>). */
(function () {
  'use strict';
  const t = (en, bn) => A.t(en, bn);
  const U = () => A.ui;
  const F = () => A.fmt;
  const DAY = 864e5;
  const I = (n) => A.icon(n);

  A.css('set', `
  .set-wrap{display:grid;grid-template-columns:250px minmax(0,1fr);gap:18px;align-items:start}
  .set-side{position:sticky;top:70px;display:flex;flex-direction:column;gap:10px}
  .set-side .inp{width:100%}
  .set-grp{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:8px 4px 2px;display:flex;justify-content:space-between;align-items:center}
  .set-nav{display:flex;flex-direction:column;gap:1px}
  .set-nav a{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;color:var(--ink2);text-decoration:none;font-size:13.5px}
  .set-nav a svg{width:17px;height:17px;flex:none;opacity:.75}
  .set-nav a:hover{background:var(--card2)}
  .set-nav a.on{background:var(--accent-soft,var(--card2));color:var(--accent);font-weight:600}
  .set-nav a .set-hit{display:block;font-size:11.5px;color:var(--muted);font-weight:400}
  .set-pick{display:none}
  .set-main{min-width:0}
  .set-main .phead{margin-top:0}
  .set-hero{display:flex;gap:16px;align-items:center;padding:18px;border-radius:16px;background:var(--card2);border:1px solid var(--line)}
  .set-hero .big{font:700 22px var(--f-head)}
  .set-dot{width:16px;height:16px;border-radius:50%;flex:none;background:var(--good);box-shadow:0 0 0 6px var(--good-soft)}
  .set-dot.warn{background:var(--warn);box-shadow:0 0 0 6px var(--warn-soft)} .set-dot.bad{background:var(--bad);box-shadow:0 0 0 6px var(--bad-soft)} .set-dot.off{background:var(--muted);box-shadow:0 0 0 6px var(--card)}
  .set-logo{width:72px;height:72px;border-radius:16px;background:var(--accent);color:#fff;display:grid;place-items:center;font:700 28px var(--f-head);flex:none}
  .set-logos{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
  .set-logos .slot{border:1px dashed var(--line2);border-radius:12px;padding:10px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px}
  .set-logos .mk{height:44px;display:grid;place-items:center;border-radius:10px;background:var(--accent);color:#fff;font:700 18px var(--f-head);width:44px}
  .set-logos .mk.wide{width:100%;font-size:14px;letter-spacing:.2em}
  .set-logos .mk.dark{background:var(--ink);color:var(--card)} .set-logos .mk.fav{width:24px;height:24px;font-size:12px;border-radius:6px;margin:10px 0}
  .set-flow{display:grid;grid-template-columns:170px minmax(0,1fr) 170px;gap:14px;align-items:stretch}
  .set-node{border-radius:14px;padding:16px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:6px}
  .set-node.erp{background:linear-gradient(135deg,var(--navy),var(--navy2));color:#fff}
  .set-node.shop{background:var(--accent);color:#fff}
  .set-node b{font:700 17px var(--f-head)} .set-node small{opacity:.85;font-size:11.5px}
  .set-node svg{width:28px;height:28px}
  .set-lanes{display:flex;flex-direction:column;gap:12px}
  .set-lane{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--card2)}
  .set-lane h4{font-size:12.5px;display:flex;align-items:center;gap:8px;margin-bottom:6px}
  .set-lane h4 .ar{font-size:18px;color:var(--accent);letter-spacing:-2px}
  .set-lane.back h4 .ar{color:var(--navy2)}
  .set-it{display:flex;gap:10px;align-items:center;padding:6px 0;border-top:1px dashed var(--line2);font-size:13px}
  .set-it:first-of-type{border-top:0}
  .set-it .line{flex:1;height:2px;min-width:16px;background:linear-gradient(90deg,var(--accent) 50%,transparent 0) 0/10px 2px repeat-x}
  .set-lane.back .set-it .line{background:linear-gradient(90deg,var(--navy2) 50%,transparent 0) 0/10px 2px repeat-x}
  .set-it .w{color:var(--muted);font-size:11.5px;white-space:nowrap}
  .set-var{display:inline-block;background:var(--info-soft);color:var(--info);border-radius:6px;padding:0 6px;font-size:12px;font-weight:600;margin:0 1px}
  .set-light{display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:12px;background:var(--card2)}
  .set-light i{width:12px;height:12px;border-radius:50%;margin-top:4px;flex:none;box-shadow:0 0 0 4px var(--good-soft);background:var(--good)}
  .set-light i.warn{background:var(--warn);box-shadow:0 0 0 4px var(--warn-soft)} .set-light i.bad{background:var(--bad);box-shadow:0 0 0 4px var(--bad-soft)}
  .set-light b{display:block}
  .set-tree{display:flex;flex-direction:column;gap:6px}
  .set-tree details{border:1px solid var(--line);border-radius:10px;padding:6px 10px;background:var(--card)}
  .set-tree summary{display:flex;gap:8px;align-items:center;cursor:pointer;font-weight:600;list-style:none}
  .set-tree summary::-webkit-details-marker{display:none}
  .set-tree .kids{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px 12px;padding:8px 0 4px 26px}
  .set-tree label{display:flex;gap:8px;align-items:center;font-size:13px}
  .set-tree input{width:16px;height:16px;accent-color:var(--accent)}
  .set-key{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
  .set-key:first-child{border-top:0}
  .set-agent{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1.3fr) minmax(0,.9fr) auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
  .set-agent:first-child{border-top:0}
  .set-agent .av{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--card2);font-weight:700;flex:none}
  .set-man details{border-bottom:1px solid var(--line);padding:10px 0}
  .set-man summary{cursor:pointer;font-weight:600;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .set-man .body{padding:8px 0 0;font-size:13.5px;line-height:1.65}
  .set-flash{animation:setfl 1.6s ease}
  @keyframes setfl{0%,40%{box-shadow:0 0 0 3px var(--accent)}100%{box-shadow:0 0 0 0 transparent}}
  .set-g6 b{font-weight:600}
  @media (max-width:960px){.set-flow{grid-template-columns:1fr}.set-node{flex-direction:row;justify-content:flex-start;text-align:left;padding:12px}.set-lane h4 .ar{transform:rotate(90deg);display:inline-block}.set-lane.back h4 .ar{transform:rotate(-90deg)}
    .set-wrap{grid-template-columns:1fr}.set-side{display:none}.set-pick{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
    .set-agent{grid-template-columns:1fr 1fr}.set-key{grid-template-columns:1fr auto}.set-key .k2{display:none}}
  @media (max-width:560px){.set-it{flex-wrap:wrap}.set-it .line{display:none}.set-logos{grid-template-columns:repeat(2,minmax(0,1fr))}.set-hero{flex-wrap:wrap}.set-agent{grid-template-columns:1fr}}
  `);

  A.css('set-demo', `
  .dm-tree details{border-bottom:1px solid var(--line);padding:6px 0}
  .dm-tree summary{display:flex;gap:10px;align-items:center;cursor:pointer;list-style:none}
  .dm-tree summary .grow{min-width:0}
  .dm-kids{display:flex;flex-direction:column;gap:2px;padding:6px 0 4px 14px}
  .dm-row{display:flex;gap:10px;align-items:center;font-size:13px;padding:3px 0}
  .dm-row.dm-l{padding-left:18px;color:var(--ink2)}
  .dm-row .grow,.dm-tree summary .grow{display:flex;flex:1 1 auto;min-width:0;flex-wrap:wrap;gap:4px 8px;align-items:baseline}
  .dm-tree summary .switch,.dm-row .switch{margin-left:auto;flex:none}
  .dm-pop{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--card);box-shadow:0 8px 24px rgba(0,0,0,.08);max-width:320px}
  `);
  /* ---------------- the list of settings ---------------- */
  const ITEMS = [
    { id: 'store', g: 'b', ic: 'home', en: 'Store details', bn: 'দোকানের তথ্য', kw: 'name logo legal licence trade ubid dbid tin bin vat ecab complaint officer data protection address warehouse pickup returns hotline whatsapp email hours social facebook instagram colour invoice sticker order number money format language holiday targets' },
    { id: 'erp', g: 'b', ic: 'sync', en: 'ERP connection', bn: 'ERP কানেকশন', kw: 'erp stock buying price sync connection test warehouse bill' },
    { id: 'couriers', g: 'b', ic: 'truck', en: 'Couriers', bn: 'কুরিয়ার', kw: 'courier pathao steadfast redx default pickup fee charge parcel booking' },
    { id: 'payments', g: 'b', ic: 'finance', en: 'Payments', bn: 'পেমেন্ট', kw: 'bkash nagad card gateway sslcommerz settlement bank account payment' },
    { id: 'messages', g: 'b', ic: 'send', en: 'Customer messages', bn: 'কাস্টমার মেসেজ', kw: 'sms whatsapp template message text customer' },
    { id: 'team', g: 'b', ic: 'customers', en: 'Team & roles', bn: 'টিম ও রোল', kw: 'staff role access permission invite activity' },
    { id: 'demo', g: 'b', ic: 'products', en: 'Demo products', bn: 'ডেমো প্রোডাক্ট', kw: 'demo sample dummy placeholder coming soon empty category' },
    { id: 'keys', g: 's', ic: 'check', en: 'Keys & connections', bn: 'কি ও কানেকশন', kw: 'key password api connection meta google ads tiktok search console drive telegram ai claude openai gemini sms vault' },
    { id: 'backups', g: 's', ic: 'down', en: 'Backups & restore', bn: 'ব্যাকআপ ও রিস্টোর', kw: 'backup restore drive drill schedule' },
    { id: 'health', g: 's', ic: 'reports', en: 'Site health', bn: 'সাইটের অবস্থা', kw: 'uptime speed error disk memory domain ssl optimise optimize diagnose health audit' },
    { id: 'ai', g: 's', ic: 'star', en: 'AI control', bn: 'AI কন্ট্রোল', kw: 'ai agent budget model provider proposal training gyani center approvals' },
    { id: 'updates', g: 's', ic: 'reset', en: 'Updates & versions', bn: 'আপডেট ও ভার্সন', kw: 'version update roll back changelog staging' },
    { id: 'security', g: 's', ic: 'warn', en: 'Security', bn: 'নিরাপত্তা', kw: '2-step login session block password' },
    { id: 'activity', g: 's', ic: 'menu', en: 'Activity log', bn: 'অ্যাক্টিভিটি লগ', kw: 'log history who changed viewed customer data audit' },
    { id: 'privacy', g: 's', ic: 'customers', en: 'Data & privacy', bn: 'ডেটা ও প্রাইভেসি', kw: 'export erase copy request privacy media import old customers own data' },
    { id: 'telegram', g: 's', ic: 'phone', en: 'Telegram control', bn: 'Telegram কন্ট্রোল', kw: 'telegram bot daily report 22:00 pairing alert' },
    { id: 'manual', g: 's', ic: 'help', en: 'Help & manual', bn: 'সাহায্য ও ম্যানুয়াল', kw: 'manual guide help blueprint register project files' },
  ];
  A.SET_ITEMS = ITEMS;
  A.setData = () => S();
  // things people look for here that live elsewhere
  const ELSEWHERE = [
    ['delivery charge', 'ডেলিভারি চার্জ', 'rules', 'all', 'Rules › Delivery', 'নিয়ম › ডেলিভারি'],
    ['free delivery', 'ফ্রি ডেলিভারি', 'rules', 'all', 'Rules › Delivery', 'নিয়ম › ডেলিভারি'],
    ['cod', 'ক্যাশ অন ডেলিভারি', 'rules', 'all', 'Rules › Payment & COD', 'নিয়ম › পেমেন্ট ও COD'],
    ['auto confirm', 'অটো কনফার্ম', 'rules', 'all', 'Rules › Order flow', 'নিয়ম › অর্ডার ফ্লো'],
    ['exchange', 'এক্সচেঞ্জ', 'rules', 'all', 'Rules › Exchange', 'নিয়ম › এক্সচেঞ্জ'],
    ['coupon', 'কুপন', 'rules', 'coupons', 'Rules › Coupons & sales', 'নিয়ম › কুপন ও সেল'],
    ['policy', 'পলিসি', 'website', 'policies', 'Website › Policies', 'ওয়েবসাইট › পলিসি'],
    ['shop text', 'দোকানের লেখা', 'website', 'text', 'Website › Shop text', 'ওয়েবসাইট › দোকানের লেখা'],
    ['size chart', 'সাইজ চার্ট', 'products', 'sizecharts', 'Products › Size charts', 'প্রোডাক্ট › সাইজ চার্ট'],
    ['expense', 'খরচ', 'finance', 'costs', 'Finance › Costs & budgets', 'হিসাব › খরচ ও বাজেট'],
  ];

  /* ---------------- settings data (kept in A.D.set) ---------------- */
  function S() {
    const D = A.D; const ago = (m) => new Date(A.TODAY - m * 6e4).toISOString();
    const st = D.store;
    const sd = {
      legalName: 'EXTAS Fashion Ltd.', ownerName: 'Mehadi Hasan', tlExpiry: '2026-12-31', ubid: '', tin: '', ecab: '', complaintOfficer: 'Nusrat Jahan · 01700-000001', dpo: 'Mehadi Hasan · privacy@extas.com.bd',
      officeAddr: st.address, warehouseAddr: 'Nikunja Warehouse, Plot 7, Road 14, Nikunja-2, Dhaka 1229', returnsAddr: 'Nikunja Warehouse (Returns desk), Road 14, Nikunja-2, Dhaka 1229', pin: false,
      supportEmail: 'help@extas.com.bd', ordersEmail: 'orders@extas.com.bd', accountsEmail: 'accounts@extas.com.bd',
      fb: 'facebook.com/extasbd', ig: 'instagram.com/extasbd', tt: 'tiktok.com/@extasbd', yt: '',
      color1: '#E2552B', color2: '#1F2A44', invHead: 'EXTAS · Menswear made in Bangladesh', invFoot: 'Thank you for shopping with EXTAS. Exchange within 72 hours of delivery.', stHead: 'EXTAS', stFoot: 'Hotline 09610-000000', stSize: '4x3',
      onPrefix: 'EX-', onNext: 10473, moneyFmt: 'bd', custLang: 'both', holiday: false, holidayMsg: 'Eid holiday: orders placed now ship on 18 June.', holidayUntil: '', showVat: false, targets: { monthSales: 1800000, monthProfit: 260000, maxAdPct: 12 },
    };
    for (const k in sd) if (st[k] === undefined) st[k] = sd[k];
    if (D.set && D.set.v === 2) return D.set;
    const old = D.set || {};
    const access = {};
    const per = old.perms || { 'Order manager': { orders: 'edit', products: 'view', customers: 'edit', inbox: 'edit', rules: 'view', reports: 'view' }, 'Customer care': { orders: 'view', products: 'view', customers: 'edit', inbox: 'edit', rules: 'view' }, Packing: { orders: 'view', products: 'view' }, Marketing: { products: 'edit', customers: 'view', inbox: 'view', rules: 'view', marketing: 'edit', website: 'edit', reports: 'view' } };
    for (const r in per) { access[r] = {}; for (const s of A.NAV) if (per[r][s.id] && per[r][s.id] !== 'none') s.tabs.forEach((tb) => { access[r][s.id + '.' + tb[0]] = 1; }); }
    access['Order manager']['x.cost'] = 1; access['Packing'] = Object.assign(access['Packing'] || {}, { 'orders.batch': 1, 'orders.pack': 1 });
    D.set = Object.assign({
      hours: { open: '10:00', close: '22:00', closed: 'none' },
      erpMap: { warehouse: 'Nikunja Warehouse', cod: 'Courier cash (Pathao, Steadfast, RedX)', bkash: 'bKash merchant', nagad: 'Nagad merchant', card: 'Card gateway', erpPay: 'DBBL current account' },
      evF: 'all', autoBook: true,
      templates: [], force2fa: false, blocked: [{ ip: '45.142.212.61', why: '12 wrong passwords in 10 minutes', when: ago(3 * 1440) }],
      logins: [{ who: 'Mehadi Hasan', when: ago(5), dev: 'Chrome · Windows', place: 'Dhaka', ok: true }, { who: 'Nusrat', when: ago(12), dev: 'Chrome · Android', place: 'Dhaka', ok: true }, { who: '—', when: ago(95), dev: 'Unknown · Linux', place: 'Outside Bangladesh', ok: false, ip: '185.220.101.4' }, { who: 'Rafi', when: ago(40), dev: 'Chrome · Windows', place: 'Dhaka', ok: true }, { who: 'Sohel', when: ago(180), dev: 'Chrome · Android', place: 'Dhaka', ok: true }],
      sessions: [{ id: 'SE1', who: 'Mehadi Hasan', dev: 'Chrome · Windows', place: 'Dhaka', since: ago(5), me: true }, { id: 'SE3', who: 'Nusrat', dev: 'Chrome · Android', place: 'Dhaka', since: ago(12) }, { id: 'SE4', who: 'Rafi', dev: 'Chrome · Windows', place: 'Dhaka', since: ago(40) }],
      backups: [ago(5 * 60), ago(17 * 60), ago(29 * 60), ago(41 * 60)].map((d, i) => ({ id: 'BK' + i, at: d, size: (418 - i * 2) + ' MB', drive: i < 3 })),
    }, old, {
      v: 2,
      defCourier: (old.defCourier && old.defCourier.inside) || 'pathao', zoneRouting: false, pickup: 'warehouse', pickupTime: '17:00',
      pay: { bkash: { on: true, acc: '01711-000000 (merchant)', settle: 'DBBL current account', days: 1 }, nagad: { on: true, acc: '01811-000000 (merchant)', settle: 'DBBL current account', days: 1 }, card: { on: false, acc: '', settle: 'DBBL current account', days: 2 }, cod: { settle: 'DBBL current account' } },
      accounts: ['DBBL current account', 'City Bank savings', 'bKash merchant wallet', 'Cash in hand'],
      access, roleNote: {},
      keys: [
        { id: 'bkash', grp: 'pay', name: 'bKash', st: 'ok', last: ago(9), mask: '••••7A2C' }, { id: 'nagad', grp: 'pay', name: 'Nagad', st: 'ok', last: ago(52), mask: '••••91DE' }, { id: 'ssl', grp: 'pay', name: 'SSLCommerz (cards)', st: 'none' },
        { id: 'sms', grp: 'msg', name: 'SMS gateway', st: 'ok', last: ago(3), mask: '••••0F11', note: ['1,240 SMS left', '1,240 SMS বাকি'] }, { id: 'wa', grp: 'msg', name: 'WhatsApp Business', st: 'none' }, { id: 'mail', grp: 'msg', name: 'Email sending', st: 'ok', last: ago(41), mask: '••••c3b9' },
        { id: 'meta', grp: 'ads', name: 'Meta (Facebook & Instagram ads)', st: 'ok', last: ago(15), mask: '••••88QK' }, { id: 'gads', grp: 'ads', name: 'Google Ads', st: 'ok', last: ago(64), mask: '••••5521' }, { id: 'tiktok', grp: 'ads', name: 'TikTok Ads', st: 'err', last: ago(3 * 1440), mask: '••••LL0P', note: ['Key expired 3 days ago — replace it', 'কি 3 দিন আগে মেয়াদ শেষ — নতুন দিন'] }, { id: 'gsc', grp: 'ads', name: 'Google Search Console', st: 'ok', last: ago(6 * 60), mask: '••••search' }, { id: 'gmc', grp: 'ads', name: 'Google Merchant Center', st: 'none' },
        { id: 'drive', grp: 'safe', name: 'Google Drive (backups)', st: 'ok', last: ago(5 * 60), mask: 'owner@gmail.com' }, { id: 'tg', grp: 'safe', name: 'Telegram bot', st: 'ok', last: ago(22 * 60), mask: '@extas_shop_bot' },
        { id: 'claude', grp: 'ai', name: 'Claude', st: 'ok', last: ago(35), mask: '••••x9Wq' }, { id: 'openai', grp: 'ai', name: 'OpenAI', st: 'none' }, { id: 'gemini', grp: 'ai', name: 'Gemini', st: 'ok', last: ago(2 * 1440), mask: '••••Gm4a' },
        { id: 'erpkey', grp: 'erp', name: 'Extas ERP link', st: 'ok', last: ago(11), mask: '••••erp1' },
      ],
      bk: { every: 12, keep: 4, drive: 3, drill: { at: ago(12 * 1440), ok: true, min: 14, rows: '18,420 orders · 6,112 customers · 1,284 photos' } },
      health: { audit: 'daily', tg: true, lastOpt: ago(9 * 1440), check: { at: ago(17 * 60), pages: 142, bad: 0 }, uptime: [100, 100, 100, 99.9, 100, 100, 100, 100, 99.7, 100, 100, 100, 100, 100] },
      aiOn: !!old.ai, aiCap: 10000,
      agents: [
        { id: 'gyani', n: ['Gyani', 'জ্ঞানী'], job: ['Chief: finds out "why", assigns work, daily report', 'প্রধান: "কেন" খুঁজে বের করে, কাজ ভাগ করে, দৈনিক রিপোর্ট'], on: true, keep: false, prov: 'Claude', model: 'Sonnet', sched: 'always', today: 42, month: 1860, now: ['Writing tonight’s 22:00 report', 'আজ রাত 22:00-র রিপোর্ট লিখছে'] },
        { id: 'prohori', n: ['Prohori', 'প্রহরী'], job: ['Site health, security, backups', 'সাইটের অবস্থা, নিরাপত্তা, ব্যাকআপ'], on: true, keep: true, prov: 'Gemini', model: 'Flash', sched: 'hourly', today: 8, month: 310, now: ['Watching the site — all green', 'সাইট দেখছে — সব সবুজ'] },
        { id: 'bhandari', n: ['Bhandari', 'ভান্ডারী'], job: ['Products, photos, couriers, returns, ERP link', 'প্রোডাক্ট, ছবি, কুরিয়ার, রিটার্ন, ERP সংযোগ'], on: true, keep: false, prov: 'Claude', model: 'Haiku', sched: 'hourly', today: 21, month: 940, now: ['Checking 3 returns waiting for the ERP', 'ERP-র অপেক্ষায় থাকা 3টি রিটার্ন দেখছে'] },
        { id: 'sawdagor', n: ['Sawdagor', 'সওদাগর'], job: ['Orders, checkout, combos, payments', 'অর্ডার, চেকআউট, কম্বো, পেমেন্ট'], on: true, keep: false, prov: 'Claude', model: 'Haiku', sched: 'always', today: 30, month: 1210, now: ['Scoring 12 new orders', '12টি নতুন অর্ডারের স্কোর করছে'] },
        { id: 'shilpi', n: ['Shilpi', 'শিল্পী'], job: ['Page design and photo checks', 'পেজ ডিজাইন ও ছবি যাচাই'], on: false, keep: false, prov: 'Claude', model: 'Sonnet', sched: 'weekly', today: 0, month: 420, now: ['Paused by owner', 'মালিক পজ করেছেন'] },
        { id: 'doot', n: ['Doot', 'দূত'], job: ['Blog, SEO, messages to customers (drafts)', 'ব্লগ, SEO, কাস্টমার মেসেজ (খসড়া)'], on: true, keep: false, prov: 'Claude', model: 'Sonnet', sched: 'daily', today: 64, month: 2380, now: ['Drafting a blog post: "Polo size guide"', 'ব্লগ লিখছে: "পোলো সাইজ গাইড"'] },
        { id: 'tirondaj', n: ['Tirondaj', 'তীরন্দাজ'], job: ['Paid ads only — never raises a budget without you', 'শুধু পেইড বিজ্ঞাপন — আপনার অনুমতি ছাড়া বাজেট বাড়ায় না'], on: true, keep: false, prov: 'OpenAI', model: 'GPT mini', sched: 'daily', today: 25, month: 1120, now: ['Waiting for your OK on 2 proposals', 'আপনার অনুমতির অপেক্ষায় 2টি প্রস্তাব'] },
      ],
      proposals: [
        { id: 'P1', by: 'tirondaj', en: 'Raise "Polo Winter" Facebook budget from ৳1,500 to ৳2,000 a day (earned ৳4.6 per ৳1 on delivered orders)', bn: '"Polo Winter" ফেসবুক বাজেট দিনে ৳1,500 থেকে ৳2,000 (ডেলিভারি অর্ডারে ৳1-এ ৳4.6 আয়)', money: true },
        { id: 'P2', by: 'tirondaj', en: 'Stop "Hoodie TikTok test" — ৳1.1 back per ৳1 for 9 days', bn: '"Hoodie TikTok test" বন্ধ — 9 দিন ধরে ৳1-এ ৳1.1 ফেরত', money: false },
        { id: 'P3', by: 'doot', en: 'Publish blog post "How to pick your polo size" (SEO score 86)', bn: 'ব্লগ পাবলিশ: "কীভাবে পোলোর সাইজ বাছবেন" (SEO স্কোর 86)', money: false },
      ],
      training: [{ t: ago(3 * 1440), text: 'Never offer more than 10% discount in chat replies.' }, { t: ago(9 * 1440), text: 'Customers outside Dhaka must pay the delivery charge first if they refused a parcel before.' }],
      asks: [],
      version: { no: '1.4.2', at: ago(16 * 60 + 50) }, autoUpdate: true,
      changes: [
        { no: '1.4.2', at: ago(16 * 60 + 50), en: ['Orders open on "This batch"', 'Size charts can be copied between categories', 'Faster product photos on phones'], bn: ['অর্ডার এখন "এই ব্যাচ" দিয়ে খোলে', 'সাইজ চার্ট এক ক্যাটাগরি থেকে আরেকটায় কপি করা যায়', 'ফোনে প্রোডাক্টের ছবি আরও দ্রুত'] },
        { no: '1.4.1', at: ago(4 * 1440), en: ['Partial delivery box on returns', 'Fixed: wrong delivery charge shown for Gazipur'], bn: ['রিটার্নে আংশিক ডেলিভারির বক্স', 'ঠিক করা হয়েছে: গাজীপুরে ভুল ডেলিভারি চার্জ দেখাত'] },
        { no: '1.4.0', at: ago(11 * 1440), en: ['New Rules page with plain sentences', 'Courier score out of 10 on every order'], bn: ['সহজ বাক্যে নতুন নিয়ম পেজ', 'প্রতি অর্ডারে 10-এর মধ্যে কুরিয়ার স্কোর'] },
      ],
      views: [],
      privacy: { mediaKeep: 24, chatKeep: 12, requests: [] },
      tg: { ids: [{ id: '5218840193', who: 'Mehadi Hasan', role: 'Owner' }, { id: '6630127745', who: 'Rafi', role: 'Order manager' }], report: true, time: '22:00', email: true, weekly: true, alerts: { down: true, backup: true, bigOrder: true, erp: true, login: true }, pair: null },
    });
    const C = D.customers.slice(0, 8); const who = ['Nusrat', 'Rafi', 'Nusrat', 'Tania', 'Rafi', 'Nusrat', 'Sohel', 'Rafi'];
    D.set.views = C.map((c, i) => ({ who: who[i], cust: c.name, cid: c.id, what: i === 3 ? 'export' : i % 2 ? 'phone' : 'address', t: ago(20 + i * 97) }));
    const C2 = D.customers.slice(10, 12);
    D.set.privacy.requests = [{ id: 'RQ1', cust: C2[0].name, cid: C2[0].id, kind: 'copy', at: ago(2 * 1440), status: 'open' }, { id: 'RQ2', cust: C2[1].name, cid: C2[1].id, kind: 'erase', at: ago(5 * 1440), status: 'open' }];
    if (!D.set.templates || !D.set.templates.length) D.set.templates = DEF_TPL();
    return D.set;
  }
  const DEF_TPL = () => [
    { id: 'confirmed', en: 'Order confirmed', bn: 'অর্ডার কনফার্ম', text: 'প্রিয় {name}, আপনার অর্ডার {order} কনফার্ম হয়েছে। মোট {total}। ধন্যবাদ — EXTAS', sms: true, wa: true },
    { id: 'advance', en: 'Pay delivery charge first', bn: 'আগে ডেলিভারি চার্জ', text: 'অর্ডার {order} কনফার্ম করতে {delivery} ডেলিভারি চার্জ bKash-এ পাঠান: {bkash}', sms: true, wa: true },
    { id: 'shipped', en: 'Handed to courier, with tracking', bn: 'কুরিয়ারে দেওয়া হয়েছে, ট্র্যাকিং সহ', text: '{name}, আপনার অর্ডার {order} {courier}-এ দেওয়া হয়েছে। ট্র্যাকিং: {tracking} {link}', sms: true, wa: true },
    { id: 'delivered', en: 'Delivered + review request', bn: 'ডেলিভারি হয়েছে + রিভিউ চাওয়া', text: 'আপনার অর্ডার {order} পৌঁছে গেছে। কেমন লাগল? রিভিউ দিন: {link}', sms: false, wa: true },
    { id: 'cancelled', en: 'Order cancelled', bn: 'অর্ডার বাতিল', text: 'আপনার অর্ডার {order} বাতিল হয়েছে। প্রশ্ন থাকলে কল করুন {phone}।', sms: true, wa: false },
  ];

  function pinAsk(title, text, okLabel, onOk, danger) {
    const m = U().modal(title, `<p style="margin:0">${text}</p>${U().field(t('Owner PIN', 'মালিকের PIN'), '<input class="inp" id="st-pin" type="password" inputmode="numeric" maxlength="8" placeholder="••••" autocomplete="off">')}<div class="small" id="st-pin-e" style="color:var(--bad)"></div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn ${danger ? 'dark' : 'primary'}" id="st-pin-ok">${okLabel}</button>` });
    const go = () => { const v = m.querySelector('#st-pin').value.trim(); if (!/^\d{4,8}$/.test(v)) { m.querySelector('#st-pin-e').textContent = t('Enter your 4-digit PIN.', 'আপনার 4 সংখ্যার PIN দিন।'); return; } U().close(); onOk(); };
    m.parentElement.querySelector('#st-pin-ok').onclick = go;
    m.querySelector('#st-pin').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    setTimeout(() => m.querySelector('#st-pin').focus(), 30);
  }
  const ROLE_BN = { Owner: 'মালিক', 'Order manager': 'অর্ডার ম্যানেজার', 'Customer care': 'কাস্টমার কেয়ার', Packing: 'প্যাকিং', Marketing: 'মার্কেটিং' };
  const roleName = (r) => t(r, ROLE_BN[r] || r);
  const done = (msg, en, bn) => { A.commit(msg); A.toast(t(en, bn), 'good'); A.render(); };
  const sw = (id, on, label, sub) => `<div class="row between" style="flex-wrap:nowrap;gap:12px"><div><b>${label}</b>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>${U().switch(id, on)}</div>`;
  const inp = (k, label, hint, attrs = '') => U().field(label, `<input class="inp" data-k="${k}" value="${A.esc(A.D.store[k] || '')}" ${attrs}>`, hint);
  const area = (k, label, hint) => U().field(label, `<textarea class="inp" data-k="${k}" rows="2">${A.esc(A.D.store[k] || '')}</textarea>`, hint);

  /* ---------------- frame: left list + search ---------------- */
  let q = '';
  function frame(el, id, fn) {
    S();
    const it = ITEMS.find((x) => x.id === id) || ITEMS[0];
    const s = q.trim().toLowerCase();
    const match = (x) => !s || (x.en + ' ' + x.bn + ' ' + x.kw).toLowerCase().includes(s);
    const hitWord = (x) => { if (!s) return ''; const w = x.kw.split(' ').find((k) => k.includes(s)); return w && !(x.en + x.bn).toLowerCase().includes(s) ? `<span class="set-hit">${t('has', 'আছে')}: ${A.esc(w)}</span>` : ''; };
    const grp = (g, en, bn, badge) => { const L = ITEMS.filter((x) => x.g === g && match(x)); return L.length ? `<div class="set-grp"><span>${t(en, bn)}</span>${badge || ''}</div><nav class="set-nav">${L.map((x) => `<a href="${A.href('settings', x.id)}" class="${x.id === it.id ? 'on' : ''}">${I(x.ic)}<span>${t(x.en, x.bn)}${hitWord(x)}</span></a>`).join('')}</nav>` : ''; };
    const away = s.length > 2 ? ELSEWHERE.filter((e) => e[0].includes(s) || e[1].includes(s) || s.includes(e[0])) : [];
    const awayH = away.length ? `<div class="guide-note small">${t('Looking for', 'খুঁজছেন')} “${A.esc(q)}”? ${away.map((e) => `<a class="linkbtn" href="${A.href(e[2], e[3])}">${t(e[4], e[5])} →</a>`).join(' ')}</div>` : '';
    const none = s && !ITEMS.some(match) && !away.length ? `<div class="muted small" style="padding:6px">${t('Nothing here. Try the Admin map search.', 'এখানে নেই। অ্যাডমিন ম্যাপে খুঁজে দেখুন।')}</div>` : '';
    const ownerB = U().badge(t('Owner', 'মালিক'), 'dark');
    el.innerHTML = `<div class="set-wrap">
      <aside class="set-side" aria-label="${t('Settings list', 'সেটিংসের তালিকা')}">
        <input class="inp" id="set-q" type="search" placeholder="${t('Search settings… e.g. BIN, bKash, backup', 'সেটিংস খুঁজুন… যেমন BIN, bKash, ব্যাকআপ')}" value="${A.esc(q)}">
        ${awayH}${grp('b', 'Business', 'ব্যবসা')}${grp('s', 'System', 'সিস্টেম', ownerB)}${none}
      </aside>
      <div class="set-main">
        <div class="set-pick">${U().select('set-sel', ITEMS.map((x) => [x.id, (x.g === 's' ? '🔒 ' : '') + t(x.en, x.bn)]), it.id)}<input class="inp" id="set-q2" type="search" placeholder="${t('Search settings…', 'সেটিংস খুঁজুন…')}" value="${A.esc(q)}">${awayH}</div>
        ${it.g === 's' ? U().callout(t('<b>Owner only.</b> Staff never see the System group, even with full access.', '<b>শুধু মালিক।</b> পুরো অ্যাক্সেস থাকলেও স্টাফ সিস্টেম অংশ দেখতে পান না।'), '', 'info') : ''}
        <div id="set-body"></div>
      </div></div>`;
    fn(el.querySelector('#set-body'));
    // search keeps focus while typing
    const bindQ = (sel) => { const qi = el.querySelector(sel); if (!qi) return; qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; frame(el, id, fn); const n = el.querySelector(sel); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }; qi.onkeydown = (e) => { if (e.key === 'Enter') { const f = ITEMS.find(match); if (f) { q = ''; A.go('settings', f.id); } } }; };
    bindQ('#set-q'); bindQ('#set-q2');
    el.querySelector('#set-sel').onchange = (e) => A.go('settings', e.target.value);
    // sidebar + breadcrumb follow the item
    const sub = document.querySelectorAll('#nav-sub-settings a'); sub.forEach((a, i) => a.classList.toggle('on', (i === 0 && it.g === 'b') || (i === 1 && it.g === 's')));
    const cr = document.querySelector('.crumb'); if (cr) cr.textContent = t('Settings', 'সেটিংস') + ' › ' + t(it.en, it.bn);
    if (A.route().id) { const tg = el.querySelector('#' + A.route().id); if (tg) { tg.scrollIntoView({ block: 'center' }); tg.classList.add('set-flash'); } }
  }

  /* ================= Store details ================= */
  function renderStore(el) {
    const s = A.D.store; const h = S().hours; const tg = s.targets || {};
    const daysLeft = s.tlExpiry ? Math.round((new Date(s.tlExpiry) - A.TODAY) / DAY) : null;
    const k = A.calc.kpis('month').cur; const pnl = A.calc.pnl(A.calc.range('month').from, A.calc.range('month').to);
    const prog = (v, goal) => goal ? Math.min(100, v / goal * 100) : 0;
    const days = [['none', t('Open every day', 'প্রতিদিন খোলা')], ['Friday', t('Friday', 'শুক্রবার')], ['Saturday', t('Saturday', 'শনিবার')]];
    const nextNo = s.onPrefix + s.onNext;
    el.innerHTML = A.pageHead(t('Store details', 'দোকানের তথ্য'), t('Who you are, how customers reach you, and what prints on invoices and stickers.', 'আপনি কে, কাস্টমার কীভাবে যোগাযোগ করবেন, আর ইনভয়েস ও স্টিকারে কী ছাপা হবে।'), `<button class="btn primary" id="sd-save">${t('Save changes', 'পরিবর্তন সেভ')}</button>`) +
      (daysLeft !== null && daysLeft < 60 ? U().callout(t(`<b>Trade licence expires in ${daysLeft} days</b> (${F().dateY(s.tlExpiry)}). Renew it at the city corporation; we remind you again 15 days before.`, `<b>ট্রেড লাইসেন্সের মেয়াদ ${daysLeft} দিনে শেষ</b> (${F().dateY(s.tlExpiry)})। সিটি কর্পোরেশনে নবায়ন করুন; 15 দিন আগে আবার মনে করিয়ে দেব।`), 'warn', 'warn') : '') +
      `<div class="grid g2">
        ${U().card(t('Business & legal', 'ব্যবসা ও আইনি তথ্য'), `<div class="formgrid">${inp('name', t('Shop name', 'দোকানের নাম'))}${inp('legalName', t('Legal name', 'আইনি নাম'))}${inp('ownerName', t('Owner name', 'মালিকের নাম'))}${inp('tradeLicence', t('Trade licence no.', 'ট্রেড লাইসেন্স নম্বর'))}${inp('tlExpiry', t('Licence expiry (reminder)', 'লাইসেন্সের মেয়াদ (রিমাইন্ডার)'), '', 'type="date"')}${inp('ubid', 'UBID / DBID', t('Shown on policy pages', 'পলিসি পেজে দেখায়'))}${inp('tin', 'TIN')}${inp('ecab', t('e-CAB no. (optional)', 'e-CAB নম্বর (ঐচ্ছিক)'))}${inp('complaintOfficer', t('Complaint officer', 'অভিযোগ কর্মকর্তা'), t('Shown on policy pages', 'পলিসি পেজে দেখায়'))}${inp('dpo', t('Data-protection officer', 'ডেটা সুরক্ষা কর্মকর্তা'), t('Shown on Privacy policy', 'প্রাইভেসি পলিসিতে দেখায়'))}</div>`, { cls: 'span2' })}
      </div>
      <div class="grid g2">
        ${U().card(t('Addresses', 'ঠিকানা'), `<div class="stack">${area('officeAddr', t('Office (on invoices)', 'অফিস (ইনভয়েসে)'))}${area('warehouseAddr', t('Warehouse — courier pickup', 'গুদাম — কুরিয়ার পিকআপ'))}${area('returnsAddr', t('Returns address', 'রিটার্নের ঠিকানা'))}<div class="row"><button class="btn sm" id="sd-pin">${I('website')} ${s.pin ? t('Map pin set · move it', 'ম্যাপ পিন সেট · সরান') : t('Pin warehouse on map', 'ম্যাপে গুদাম পিন করুন')}</button><span class="muted small">${t('Couriers use the pin to find you.', 'কুরিয়ার পিন দেখে আপনাকে খুঁজে পায়।')}</span></div></div>`)}
        ${U().card(t('Contact', 'যোগাযোগ'), `<div class="formgrid">${inp('phone', t('Hotline', 'হটলাইন'))}${inp('whatsapp', 'WhatsApp')}${inp('supportEmail', t('Support email', 'সাপোর্ট ইমেইল'))}${inp('ordersEmail', t('Orders email', 'অর্ডার ইমেইল'))}${inp('accountsEmail', t('Accounts email', 'হিসাব ইমেইল'))}${inp('email', t('Public email', 'পাবলিক ইমেইল'))}${U().field(t('Support opens', 'সাপোর্ট খোলে'), `<input class="inp" type="time" id="sd-open" value="${h.open}">`)}${U().field(t('Support closes', 'সাপোর্ট বন্ধ হয়'), `<input class="inp" type="time" id="sd-close" value="${h.close}">`)}${U().field(t('Weekly closed day', 'সাপ্তাহিক বন্ধ'), U().select('sd-off', days, h.closed))}</div>`)}
      </div>
      <div class="grid g2">
        ${U().card(t('Logo set & brand colours', 'লোগো সেট ও ব্র্যান্ড রং'), `<div class="set-logos">${[['sq', t('Square', 'চারকোনা'), ''], ['wide', t('Wide', 'চওড়া'), 'wide'], ['dark', t('For dark', 'ডার্কের জন্য'), 'dark'], ['fav', t('Tab icon', 'ট্যাব আইকন'), 'fav']].map((l) => `<div class="slot"><div class="mk ${l[2]}">${l[0] === 'wide' ? 'EXTAS' : 'E'}</div><b>${l[1]}</b><button class="btn sm" data-logo="${l[0]}">${t('Replace', 'বদলান')}</button></div>`).join('')}</div><div class="formgrid" style="margin-top:10px">${U().field(t('Main colour', 'প্রধান রং'), `<input class="inp" type="color" data-k="color1" value="${s.color1}">`)}${U().field(t('Second colour', 'দ্বিতীয় রং'), `<input class="inp" type="color" data-k="color2" value="${s.color2}">`)}</div>`)}
        ${U().card(t('Social links', 'সোশ্যাল লিংক'), `<div class="formgrid">${inp('fb', 'Facebook')}${inp('ig', 'Instagram')}${inp('tt', 'TikTok')}${inp('yt', 'YouTube')}${inp('domain', t('Web address', 'ওয়েব ঠিকানা'), t('Changing it needs your PIN', 'বদলাতে PIN লাগবে'))}</div>`)}
      </div>
      <div class="grid g2">
        ${U().card(t('Invoice & sticker', 'ইনভয়েস ও স্টিকার'), `<div class="formgrid">${inp('invHead', t('Invoice header', 'ইনভয়েসের হেডার'))}${inp('invFoot', t('Invoice footer', 'ইনভয়েসের ফুটার'))}${inp('stHead', t('Sticker header', 'স্টিকারের হেডার'))}${inp('stFoot', t('Sticker footer', 'স্টিকারের ফুটার'))}${U().field(t('Sticker size', 'স্টিকারের সাইজ'), `<select class="inp" data-k="stSize">${[['4x3', '4 × 3 in'], ['4x6', '4 × 6 in'], ['a6', 'A6'], ['75x50', '75 × 50 mm']].map((o) => `<option value="${o[0]}" ${s.stSize === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`)}<div class="row" style="align-items:flex-end"><button class="btn sm" id="sd-prev">${I('print')} ${t('Preview sticker', 'স্টিকার প্রিভিউ')}</button></div></div>`)}
        ${U().card(t('Numbers, money & language', 'নম্বর, টাকা ও ভাষা'), `<div class="formgrid">${inp('onPrefix', t('Order number starts with', 'অর্ডার নম্বরের শুরু'), t(`Next order: ${nextNo}`, `পরের অর্ডার: ${nextNo}`))}${U().field(t('Money format', 'টাকার ফরম্যাট'), `<select class="inp" data-k="moneyFmt"><option value="bd" ${s.moneyFmt === 'bd' ? 'selected' : ''}>৳1,23,450</option><option value="intl" ${s.moneyFmt === 'intl' ? 'selected' : ''}>৳123,450</option></select>`)}${U().field(t('Shop language for customers', 'কাস্টমারের জন্য দোকানের ভাষা'), `<select class="inp" data-k="custLang"><option value="both" ${s.custLang === 'both' ? 'selected' : ''}>${t('English + বাংলা (customer picks)', 'English + বাংলা (কাস্টমার বাছবেন)')}</option><option value="bn" ${s.custLang === 'bn' ? 'selected' : ''}>${t('বাংলা first', 'আগে বাংলা')}</option><option value="en" ${s.custLang === 'en' ? 'selected' : ''}>${t('English first', 'আগে English')}</option></select>`)}</div><div style="margin-top:12px">${sw('sd-hol', s.holiday, t('Holiday mode', 'ছুটির মোড'), t('Shop stays open; a banner tells customers when orders ship.', 'দোকান খোলা থাকে; ব্যানারে কাস্টমারকে জানানো হয় কবে অর্ডার যাবে।'))}${s.holiday ? `<div class="formgrid" style="margin-top:8px">${inp('holidayMsg', t('Banner text', 'ব্যানারের লেখা'))}${inp('holidayUntil', t('Until', 'পর্যন্ত'), '', 'type="date"')}</div>` : ''}</div>`)}
      </div>
      <div class="grid g2">
        ${U().card(t('Tax & VAT', 'ট্যাক্স ও ভ্যাট'), `${sw('sd-vat', !!s.showVat, t('Show VAT', 'ভ্যাট দেখান'), s.showVat ? t(`On · BIN ${A.esc(s.bin)} · VAT tab is visible in Finance and VAT prints on invoices.`, `চালু · BIN ${A.esc(s.bin)} · হিসাবে ভ্যাট ট্যাব দেখায়, ইনভয়েসে ভ্যাট ছাপা হয়।`) : t('Off — most small online shops start without VAT. Turn on when you have a BIN.', 'বন্ধ — বেশিরভাগ ছোট অনলাইন দোকান ভ্যাট ছাড়া শুরু করে। BIN হলে চালু করুন।'))}${s.showVat ? `<a class="linkbtn" href="${A.href('finance', 'vat')}">${t('Open VAT in Finance', 'হিসাবে ভ্যাট খুলুন')} →</a>` : ''}`, { cls: '', sub: t('Off by default', 'শুরুতে বন্ধ') })}
        ${U().card(t('Targets', 'টার্গেট'), `<div class="formgrid">${U().field(t('Sales this month', 'এই মাসের বিক্রি'), U().money('tg-s', tg.monthSales || 0))}${U().field(t('Profit this month', 'এই মাসের লাভ'), U().money('tg-p', tg.monthProfit || 0))}${U().field(t('Max ad spend (% of sales)', 'বিজ্ঞাপনে সর্বোচ্চ (বিক্রির %)'), U().input('tg-a', tg.maxAdPct || 0, 'type="number" min="0" max="100"'))}</div><div class="stack small" style="margin-top:10px"><div>${t('Sales so far', 'এখন পর্যন্ত বিক্রি')}: <b>${F().tk(k.sales)}</b> · ${F().pct(prog(k.sales, tg.monthSales))}</div>${U().bar(prog(k.sales, tg.monthSales), 'var(--c1)')}<div>${t('Profit so far', 'এখন পর্যন্ত লাভ')}: <b>${F().tk(pnl.net)}</b> · ${F().pct(prog(pnl.net, tg.monthProfit))}</div>${U().bar(prog(Math.max(0, pnl.net), tg.monthProfit), 'var(--good)')}</div><div class="hint">${t('Home, Finance and the daily Telegram report compare against these.', 'ড্যাশবোর্ড, হিসাব ও দৈনিক Telegram রিপোর্ট এগুলোর সাথে তুলনা করে।')}</div>`)}
      </div>`;
    el.querySelectorAll('[data-logo]').forEach((b) => (b.onclick = () => A.toast(t('Opens your files to pick the logo — PNG or SVG', 'লোগো বাছতে ফাইল খুলবে — PNG বা SVG'))));
    el.querySelector('#sd-pin').onclick = () => { s.pin = true; done('Warehouse map pin set', 'Pin saved — couriers will see it on pickup requests', 'পিন সেভ — পিকআপে কুরিয়ার এটা দেখবে'); };
    el.querySelector('#sd-prev').onclick = () => U().modal(t('Sticker preview', 'স্টিকার প্রিভিউ'), `<div class="card" style="max-width:320px;margin:auto;border:2px dashed var(--line2)"><b style="font-size:18px">${A.esc(s.stHead)}</b><div class="small" style="margin:8px 0">${t('To', 'প্রাপক')}: Rahim · 01712-345678<br>House 4, Mirpur 10, Dhaka</div><div class="row between"><span class="mono">${nextNo}</span><b>COD ৳1,650</b></div><div class="muted small" style="margin-top:8px">${A.esc(s.stFoot)}</div></div>`);
    el.querySelector('#sd-hol').onchange = (e) => { s.holiday = e.target.checked; done('Holiday mode ' + (s.holiday ? 'on' : 'off'), s.holiday ? 'Holiday banner is on' : 'Holiday banner is off', s.holiday ? 'ছুটির ব্যানার চালু' : 'ছুটির ব্যানার বন্ধ'); };
    el.querySelector('#sd-vat').onchange = (e) => {
      if (e.target.checked) {
        e.target.checked = false;
        const m = U().modal(t('Turn on VAT', 'ভ্যাট চালু করুন'), `<p style="margin:0 0 10px">${t('VAT will show on invoices and the VAT tab opens in Finance. Your BIN prints on every invoice.', 'ইনভয়েসে ভ্যাট দেখাবে আর হিসাবে ভ্যাট ট্যাব খুলবে। প্রতিটা ইনভয়েসে BIN ছাপা হবে।')}</p>${U().field(t('BIN (13 digits)', 'BIN (13 সংখ্যা)'), U().input('vt-bin', s.bin || '', 'inputmode="numeric"'))}<div class="small" id="vt-e" style="color:var(--bad)"></div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="vt-ok">${t('Turn on', 'চালু করুন')}</button>` });
        m.parentElement.querySelector('#vt-ok').onclick = () => { const b = m.querySelector('#vt-bin').value.replace(/\D/g, ''); if (b.length !== 13) { m.querySelector('#vt-e').textContent = t('BIN must have 13 digits', 'BIN 13 সংখ্যার হতে হবে'); return; } U().close(); s.bin = b; s.showVat = true; done('VAT turned on (BIN ' + b + ')', 'VAT is on — Finance now shows the VAT tab', 'ভ্যাট চালু — হিসাবে এখন ভ্যাট ট্যাব দেখাচ্ছে'); };
      } else U().confirm(t('Turn off VAT?', 'ভ্যাট বন্ধ করবেন?'), t('New invoices will not show VAT. Past invoices stay as they were.', 'নতুন ইনভয়েসে ভ্যাট দেখাবে না। আগের ইনভয়েস যেমন ছিল থাকবে।'), t('Turn off', 'বন্ধ'), () => { s.showVat = false; done('VAT turned off', 'VAT is off', 'ভ্যাট বন্ধ'); });
    };
    el.querySelector('#sd-save').onclick = () => {
      const vals = {}; el.querySelectorAll('[data-k]').forEach((i) => { vals[i.dataset.k] = i.value.trim(); });
      if (!vals.name) { A.toast(t('Shop name cannot be empty', 'দোকানের নাম খালি রাখা যাবে না'), 'bad'); return; }
      const apply = () => {
        Object.assign(s, vals); s.address = vals.officeAddr;
        s.targets = { monthSales: +el.querySelector('#tg-s').value || 0, monthProfit: +el.querySelector('#tg-p').value || 0, maxAdPct: +el.querySelector('#tg-a').value || 0 };
        Object.assign(S().hours, { open: el.querySelector('#sd-open').value, close: el.querySelector('#sd-close').value, closed: el.querySelector('#sd-off').value });
        done('Store details saved', 'Store details saved — invoices, stickers and policy pages updated', 'দোকানের তথ্য সেভ — ইনভয়েস, স্টিকার ও পলিসি পেজ আপডেট হয়েছে');
      };
      if (vals.domain !== s.domain) pinAsk(t('Change web address?', 'ওয়েব ঠিকানা বদলাবেন?'), t(`The shop moves to <b>${A.esc(vals.domain)}</b>. Old links are sent to the new address.`, `দোকান <b>${A.esc(vals.domain)}</b>-এ যাবে। পুরনো লিংক নতুন ঠিকানায় যাবে।`), t('Change', 'বদলান'), apply);
      else apply();
    };
  }

  /* ================= Payments ================= */
  function renderPayments(el) {
    const set = S(); const P = set.pay; const r30 = A.calc.range('30d'); const os = A.calc.ordersIn(r30.from, r30.to);
    const by = (m) => os.filter((o) => o.payment === m); const sum = (m) => A.sum(by(m), (o) => o.paid || 0);
    const rows = [['bkash', 'bKash', 'bKash'], ['nagad', 'Nagad', 'Nagad'], ['card', t('Card (SSLCommerz)', 'কার্ড (SSLCommerz)'), 'Card']];
    el.innerHTML = A.pageHead(t('Payments', 'পেমেন্ট'), t('How customers pay online, and which of your accounts the money lands in.', 'কাস্টমার অনলাইনে কীভাবে পে করেন, আর টাকা আপনার কোন অ্যাকাউন্টে আসে।')) +
      `<div class="grid g3">${rows.map((r) => { const p = P[r[0]]; const n = by(r[2]).length; return U().card('', `<div class="row between" style="flex-wrap:nowrap"><b style="font-size:16px">${r[1]}</b>${p.on ? U().badge(t('On at checkout', 'চেকআউটে চালু'), 'good') : U().badge(t('Off', 'বন্ধ'), '')}</div><div class="muted small" style="margin:6px 0">${p.acc ? A.esc(p.acc) : t('Not set up yet', 'এখনো সেটআপ হয়নি')}</div><div class="small">${t(`${n} orders · ${F().tk(sum(r[2]))} in 30 days`, `30 দিনে ${n}টি অর্ডার · ${F().tk(sum(r[2]))}`)}</div><div class="row" style="margin-top:10px">${p.acc ? `${U().switch('py-' + r[0], p.on)}<button class="btn sm" data-ptest="${r[0]}">${t('Test', 'টেস্ট')}</button>` : `<a class="btn sm primary" href="${A.href('settings', 'keys')}">${t('Set up in Keys', 'কি-তে সেটআপ')}</a>`}</div>`); }).join('')}</div>` +
      U().card(t('Where the money lands', 'টাকা কোথায় জমা হয়'), `<div class="formgrid">${[['bkash', 'bKash'], ['nagad', 'Nagad'], ['card', t('Card', 'কার্ড')], ['cod', t('Cash from couriers', 'কুরিয়ারের ক্যাশ')]].map((r) => U().field(r[1], U().select('st-' + r[0], set.accounts.map((a) => [a, a]), P[r[0]].settle), r[0] === 'cod' ? t('Couriers pay weekly', 'কুরিয়ার সাপ্তাহিক পে করে') : t(`Arrives in ${P[r[0]].days} working day(s)`, `${P[r[0]].days} কর্মদিবসে আসে`))).join('')}</div><div class="row between" style="margin-top:10px"><span class="muted small">${t('Changing where money lands needs your PIN. Finance › Money in & out matches every payment against these accounts.', 'টাকা কোথায় আসবে বদলাতে PIN লাগে। হিসাব › টাকার আসা-যাওয়া প্রতিটা পেমেন্ট এই অ্যাকাউন্টের সাথে মেলায়।')}</span><button class="btn primary sm" id="st-save">${t('Save', 'সেভ')}</button></div>`) +
      U().callout(t('Cash on delivery, advance payment and wallet rules live in <b>Rules › Payment & COD</b>.', 'ক্যাশ অন ডেলিভারি, অগ্রিম পেমেন্ট ও ওয়ালেটের নিয়ম <b>নিয়ম › পেমেন্ট ও COD</b>-এ।') + ` <a class="linkbtn" href="${A.href('rules', 'all')}">${t('Open', 'খুলুন')} →</a>`);
    rows.forEach((r) => { const i = el.querySelector('#py-' + r[0]); if (i) i.onchange = () => { P[r[0]].on = i.checked; done(`${r[1]} at checkout ${i.checked ? 'on' : 'off'}`, i.checked ? 'Customers can pay this way now' : 'Hidden at checkout', i.checked ? 'কাস্টমার এখন এভাবে পে করতে পারবেন' : 'চেকআউটে লুকানো হলো'); }; });
    A.on(el, '[data-ptest]', 'click', () => A.toast(t('Test payment of ৳1 went through and was reversed', '৳1-এর টেস্ট পেমেন্ট হয়েছে ও ফেরত গেছে'), 'good'));
    el.querySelector('#st-save').onclick = () => pinAsk(t('Change where money lands?', 'টাকা কোথায় আসবে বদলাবেন?'), t('New payments go to the accounts you picked.', 'নতুন পেমেন্ট আপনার বাছাই করা অ্যাকাউন্টে যাবে।'), t('Save', 'সেভ'), () => { ['bkash', 'nagad', 'card', 'cod'].forEach((k) => { P[k].settle = el.querySelector('#st-' + k).value; }); done('Settlement accounts changed', 'Saved', 'সেভ হয়েছে'); });
  }

  /* ================= Team & roles ================= */
  let role = 'Order manager'; let pendA = null;
  const SPECIAL = [['x.cost', 'See buying price & profit', 'কেনা দাম ও লাভ দেখা'], ['x.money', 'Record money received or paid', 'টাকা পাওয়া বা দেওয়া লেখা'], ['x.export', 'Export customer lists', 'কাস্টমার তালিকা এক্সপোর্ট'], ['x.refund', 'Ask for refunds (owner approves)', 'রিফান্ড চাওয়া (মালিক অনুমোদন করেন)']];
  function renderTeam(el) {
    const set = S(); const st = A.D.staff; const roles = Object.keys(set.access); if (!set.access[role]) role = roles[0];
    const acc = pendA || set.access[role];
    const secs = A.NAV.filter((s) => s.id !== 'home' && s.id !== 'settings' && s.tabs.length);
    const tree = secs.map((s) => { const on = s.tabs.filter((tb) => acc[s.id + '.' + tb[0]]).length; return `<details ${on && on < s.tabs.length ? 'open' : ''}><summary><input type="checkbox" data-par="${s.id}" ${on === s.tabs.length ? 'checked' : ''} data-ind="${on && on < s.tabs.length ? 1 : ''}">${A.nm(s.name)} <span class="muted small">${on}/${s.tabs.length}</span></summary><div class="kids">${s.tabs.map((tb) => `<label><input type="checkbox" data-kid="${s.id}.${tb[0]}" ${acc[s.id + '.' + tb[0]] ? 'checked' : ''}>${A.nm(tb[1])}</label>`).join('')}</div></details>`; }).join('') +
      `<details open><summary><input type="checkbox" disabled>${t('Settings › Business', 'সেটিংস › ব্যবসা')} <span class="muted small">${t('owner gives per page', 'মালিক পেজ ধরে দেন')}</span></summary><div class="kids">${ITEMS.filter((x) => x.g === 'b').map((x) => `<label><input type="checkbox" data-kid="settings.${x.id}" ${acc['settings.' + x.id] ? 'checked' : ''}>${t(x.en, x.bn)}</label>`).join('')}</div></details><details><summary><input type="checkbox" disabled>${t('Settings › System', 'সেটিংস › সিস্টেম')} ${U().badge(t('Owner only', 'শুধু মালিক'), 'dark')}</summary></details>` +
      `<details open><summary>${t('Special permissions', 'বিশেষ অনুমতি')}</summary><div class="kids">${SPECIAL.map((x) => `<label><input type="checkbox" data-kid="${x[0]}" ${acc[x[0]] ? 'checked' : ''}>${t(x[1], x[2])}</label>`).join('')}</div></details>`;
    const no2 = st.filter((s) => !s.twofa && s.active !== false);
    el.innerHTML = A.pageHead(t('Team & roles', 'টিম ও রোল'), t('Who can sign in, which role they have, and exactly which pages each role can open.', 'কে লগইন করতে পারেন, কার কোন রোল, আর কোন রোল ঠিক কোন পেজ খুলতে পারে।'), `<button class="btn primary" id="tm-inv">${I('plus')}${t('Invite staff', 'স্টাফ যোগ')}</button>`) +
      (no2.length ? U().callout(t(`<b>${no2.map((s) => A.esc(s.name)).join(', ')}</b> sign in with a password only. Turn on 2-step login in Security.`, `<b>${no2.map((s) => A.esc(s.name)).join(', ')}</b> শুধু পাসওয়ার্ড দিয়ে ঢোকেন। নিরাপত্তা-তে 2-ধাপের লগইন চালু করুন।`) + ` <a class="linkbtn" href="${A.href('settings', 'security')}">${t('Open', 'খুলুন')} →</a>`, 'warn', 'warn') : '') +
      U().card(t('Staff', 'স্টাফ'), U().table([
        { h: t('Name', 'নাম'), f: (s) => `<div class="cellmain"><span class="avatar" style="width:30px;height:30px;font-size:12px">${A.esc(s.name[0])}</span><div style="min-width:0"><b>${A.esc(s.name)}</b><span class="muted small ellip" style="display:block">${A.esc(s.email)}</span></div></div>` },
        { h: t('Role', 'রোল'), f: (s) => U().badge(roleName(s.role), s.role === 'Owner' ? 'dark' : '') },
        { h: t('2-step login', '2-ধাপের লগইন'), f: (s) => (s.twofa ? U().badge(t('On', 'চালু'), 'good') : U().badge(t('Off', 'বন্ধ'), 'warn')), hide: 1 },
        { h: t('Last active', 'শেষ সক্রিয়'), f: (s) => (s.active === false ? U().badge(t('Access off', 'অ্যাক্সেস বন্ধ'), 'bad') : `<span class="small">${F().ago(s.last)}</span>`), hide: 1 },
        { h: '', r: 1, f: () => `<span class="muted small">${t('Activity', 'কাজ')} ›</span>`, hide: 1 },
      ], st.map((s) => ({ ...s, _id: s.id })), { onRow: true })) +
      U().card(t('What each role can open', 'কোন রোল কী খুলতে পারে'), `<div class="row between" style="margin-bottom:10px"><div class="chips">${roles.map((r) => `<button class="chip ${r === role ? 'on' : ''}" data-role="${A.esc(r)}">${roleName(r)} <span class="c">${st.filter((s) => s.role === r).length}</span></button>`).join('')}<button class="chip" id="rl-new">${I('plus')} ${t('New role', 'নতুন রোল')}</button></div><span class="muted small">${t('Owner can always do everything', 'মালিক সবসময় সব করতে পারেন')}</span></div><div class="set-tree">${tree}</div><div class="row between" style="margin-top:10px"><span class="muted small">${t('Tick a section to give all its pages; a half box means some pages only.', 'পুরো সেকশন দিতে টিক দিন; অর্ধেক বক্স মানে কিছু পেজ।')}</span><div class="row"><button class="btn sm ghost" id="rl-def">${I('reset')} ${t('Back to default', 'ডিফল্টে ফেরান')}</button>${pendA ? `<button class="btn sm" id="pm-undo">${t('Undo', 'আগের মতো')}</button><button class="btn sm primary" id="pm-save">${t('Save changes', 'পরিবর্তন সেভ')}</button>` : ''}</div></div>`);
    el.querySelectorAll('[data-ind="1"]').forEach((c) => { c.indeterminate = true; });
    const edit = () => { if (!pendA) pendA = JSON.parse(JSON.stringify(set.access[role])); return pendA; };
    A.on(el, '[data-par]', 'click', (e, c) => { e.stopPropagation(); const a = edit(); const s = A.sec(c.dataset.par); const all = s.tabs.every((tb) => a[s.id + '.' + tb[0]]); s.tabs.forEach((tb) => { if (all) delete a[s.id + '.' + tb[0]]; else a[s.id + '.' + tb[0]] = 1; }); A.render(); });
    A.on(el, '[data-kid]', 'change', (e, c) => { const a = edit(); if (c.checked) a[c.dataset.kid] = 1; else delete a[c.dataset.kid]; A.render(); });
    A.on(el, '[data-role]', 'click', (e, b) => { if (pendA) { A.toast(t('Save or undo the changes first', 'আগে পরিবর্তন সেভ বা বাতিল করুন'), 'bad'); return; } role = b.dataset.role; A.render(); });
    const u = el.querySelector('#pm-undo'); if (u) u.onclick = () => { pendA = null; A.render(); };
    const sv = el.querySelector('#pm-save'); if (sv) sv.onclick = () => pinAsk(t('Save role access?', 'রোলের অ্যাক্সেস সেভ করবেন?'), t(`${roleName(role)}: staff see the new access when their next page loads.`, `${roleName(role)}: পরের পেজ খুললেই স্টাফ নতুন অ্যাক্সেস পাবেন।`), t('Save', 'সেভ'), () => { set.access[role] = pendA; pendA = null; done(`Role access changed: ${role}`, 'Role access saved', 'রোলের অ্যাক্সেস সেভ হয়েছে'); });
    el.querySelector('#rl-def').onclick = () => U().confirm(t('Back to default?', 'ডিফল্টে ফেরাবেন?'), t(`${roleName(role)} gets the access it had when the shop was set up.`, `${roleName(role)} শুরুর সময়ের অ্যাক্সেস ফিরে পাবে।`), t('Reset', 'রিসেট'), () => { pendA = { 'orders.batch': 1, 'orders.all': 1, 'products.all': 1 }; A.render(); A.toast(t('Default loaded — press Save changes', 'ডিফল্ট এসেছে — "পরিবর্তন সেভ" চাপুন')); });
    el.querySelector('#rl-new').onclick = () => { const m = U().modal(t('New role', 'নতুন রোল'), `<div class="formgrid">${U().field(t('Role name', 'রোলের নাম'), U().input('nr-n', '', `placeholder="${t('e.g. Photo editor', 'যেমন ফটো এডিটর')}"`))}${U().field(t('Start from', 'যেটা থেকে শুরু'), U().select('nr-f', roles.map((r) => [r, roleName(r)]), roles[0]))}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="nr-ok">${t('Create', 'তৈরি করুন')}</button>` }); m.parentElement.querySelector('#nr-ok').onclick = () => { const n = m.querySelector('#nr-n').value.trim(); if (!n || set.access[n]) { A.toast(t('Type a new role name', 'নতুন রোলের নাম লিখুন'), 'bad'); return; } set.access[n] = JSON.parse(JSON.stringify(set.access[m.querySelector('#nr-f').value])); role = n; U().close(); done(`Role created: ${n}`, `Role "${n}" created — tick its pages`, `"${n}" রোল তৈরি — পেজে টিক দিন`); }; };
    el.querySelector('#tm-inv').onclick = () => {
      const m = U().modal(t('Invite staff', 'স্টাফ যোগ'), `<div class="formgrid">${U().field(t('Name', 'নাম'), U().input('iv-n', ''))}${U().field(t('Email or phone', 'ইমেইল বা ফোন'), U().input('iv-e', ''))}${U().field(t('Role', 'রোল'), U().select('iv-r', roles.map((r) => [r, roleName(r)]), 'Customer care'))}</div><div class="hint">${t('They get a link to set a password and 2-step login. The link works for 48 hours.', 'তাঁরা পাসওয়ার্ড ও 2-ধাপের লগইন সেট করার লিংক পাবেন। লিংক 48 ঘণ্টা কাজ করে।')}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="iv-ok">${t('Send invite', 'ইনভাইট পাঠান')}</button>` });
      m.parentElement.querySelector('#iv-ok').onclick = () => { const n = m.querySelector('#iv-n').value.trim(), e = m.querySelector('#iv-e').value.trim(); if (!n || !e) { A.toast(t('Add a name and email or phone', 'নাম আর ইমেইল বা ফোন দিন'), 'bad'); return; } st.push({ id: A.uid('U'), name: n, role: m.querySelector('#iv-r').value, email: e, twofa: false, last: A.TODAY.toISOString(), invited: true }); U().close(); done(`Invited ${n}`, `Invite sent to ${n}`, `${n}-কে ইনভাইট পাঠানো হয়েছে`); };
    };
    A.on(el, 'tr[data-row]', 'click', (e, tr) => {
      const s = st.find((x) => x.id === tr.dataset.row); const acts = staffActs(s.name);
      const actH = `<div class="list">${acts.slice(0, 12).map((a) => `<div class="li"><span class="grow small">${A.esc(a.text)}</span><span class="muted small">${F().ago(a.t)}</span></div>`).join('') || U().empty(t('No activity yet', 'এখনো কোনো কাজ নেই'))}</div>`;
      if (s.role === 'Owner') { U().drawer(A.esc(s.name), U().card(t('Recent activity', 'সাম্প্রতিক কাজ'), actH)); return; }
      const d = U().drawer(A.esc(s.name), `${U().card('', `<div class="formgrid">${U().field(t('Role', 'রোল'), U().select('sf-r', roles.map((r) => [r, roleName(r)]), s.role))}</div><div class="list" style="margin-top:10px"><div class="li"><span class="grow">${t('2-step login', '2-ধাপের লগইন')}</span>${s.twofa ? U().badge(t('On', 'চালু'), 'good') : U().badge(t('Off', 'বন্ধ'), 'warn')}</div><div class="li"><span class="grow">${t('Last active', 'শেষ সক্রিয়')}</span><span>${F().ago(s.last)}</span></div></div>`)}${U().card(t('Recent activity', 'সাম্প্রতিক কাজ'), actH)}${U().callout(t('Turning off access signs them out everywhere. Their past work stays in the log — nothing is deleted.', 'অ্যাক্সেস বন্ধ করলে সব জায়গা থেকে সাইন-আউট হয়। আগের কাজ লগে থেকে যায় — কিছু মোছা হয় না।'))}`,
        { foot: `<button class="btn danger" id="sf-off">${s.active === false ? t('Turn access back on', 'অ্যাক্সেস আবার চালু') : t('Turn off access', 'অ্যাক্সেস বন্ধ')}</button><button class="btn primary" id="sf-ok">${t('Save', 'সেভ')}</button>` });
      d.querySelector('#sf-ok').onclick = () => { const r = d.querySelector('#sf-r').value; if (r !== s.role) pinAsk(t('Change role?', 'রোল বদলাবেন?'), `${A.esc(s.name)}: ${roleName(s.role)} → <b>${roleName(r)}</b>`, t('Change role', 'রোল বদলান'), () => { s.role = r; done(`${s.name} role → ${r}`, 'Role changed', 'রোল বদলানো হয়েছে'); }); else U().close(); };
      d.querySelector('#sf-off').onclick = () => { const on = s.active === false; pinAsk(on ? t('Turn access back on?', 'অ্যাক্সেস আবার চালু করবেন?') : t('Turn off access?', 'অ্যাক্সেস বন্ধ করবেন?'), A.esc(s.name), on ? t('Turn on', 'চালু') : t('Turn off', 'বন্ধ'), () => { s.active = on; if (!on) set.sessions = (set.sessions || []).filter((x) => x.who !== s.name); done(`${s.name} access ${on ? 'on' : 'off'}`, on ? 'Access is back on' : 'Access off — signed out everywhere', on ? 'অ্যাক্সেস চালু হলো' : 'অ্যাক্সেস বন্ধ — সব জায়গা থেকে সাইন-আউট'); }, !on); };
    });
    teamExtra(el, set);
  }
  function staffActs(name) {
    const L = [];
    A.D.orders.slice(0, 400).forEach((o) => (o.timeline || []).forEach((x) => { if (x.by === name) L.push({ t: x.t, text: `${o.id}: ${x.text}`, who: name, area: 'orders' }); }));
    (A.D.audit || []).forEach((a) => { if ((a.by === 'You' && name === 'Mehadi Hasan') || a.by === name) L.push({ t: a.t, text: a.text, who: name, area: 'settings' }); });
    S().views.filter((v) => v.who === name).forEach((v) => L.push({ t: v.t, text: viewText(v), who: name, area: 'privacy' }));
    return L.sort((a, b) => new Date(b.t) - new Date(a.t));
  }
  const viewText = (v) => (v.what === 'export' ? t(`Exported a customer list (${v.cust} included)`, `কাস্টমার তালিকা এক্সপোর্ট (${v.cust} সহ)`) : v.what === 'phone' ? t(`Saw the phone number of ${v.cust}`, `${v.cust}-এর ফোন নম্বর দেখেছেন`) : t(`Saw the address of ${v.cust}`, `${v.cust}-এর ঠিকানা দেখেছেন`));

  /* ================= Keys & connections ================= */
  const KG = [['pay', 'Payments', 'পেমেন্ট'], ['cour', 'Couriers', 'কুরিয়ার'], ['msg', 'Messages', 'মেসেজ'], ['ads', 'Ads & Google', 'বিজ্ঞাপন ও গুগল'], ['safe', 'Backups & alerts', 'ব্যাকআপ ও অ্যালার্ট'], ['ai', 'AI providers', 'AI প্রোভাইডার'], ['erp', 'ERP', 'ERP']];
  function renderKeys(el) {
    const set = S();
    const cour = A.D.couriers.map((c) => ({ id: 'c-' + c.id, grp: 'cour', name: c.name, st: c.connected ? 'ok' : 'none', last: c.connected ? new Date(A.TODAY - 7 * 6e4).toISOString() : '', mask: c.connected ? '••••' + c.id.slice(0, 3).toUpperCase() + '9' : '', courier: c }));
    const all = set.keys.concat(cour);
    const n = (s) => all.filter((k) => k.st === s).length;
    const stB = (k) => (k.st === 'ok' ? U().badge(t('Working', 'চালু'), 'good') : k.st === 'err' ? U().badge(t('Problem', 'সমস্যা'), 'bad') : U().badge(t('Not set up', 'সেটআপ হয়নি'), ''));
    el.innerHTML = A.pageHead(t('Keys & connections', 'কি ও কানেকশন'), t('Every outside service the shop talks to, in one locked place.', 'দোকান যত বাইরের সার্ভিসের সাথে কথা বলে, সব এক তালাবদ্ধ জায়গায়।')) +
      U().callout(t('<b>Type keys only here.</b> Never send a key or password in chat, email, WhatsApp or to a developer. Keys are locked the moment you save them and are never shown again — only the last 4 characters.', '<b>কি শুধু এখানেই লিখুন।</b> চ্যাট, ইমেইল, WhatsApp-এ বা ডেভেলপারকে কখনো কি বা পাসওয়ার্ড পাঠাবেন না। সেভ করার সাথে সাথে কি তালাবদ্ধ হয়, আর কখনো দেখানো হয় না — শুধু শেষ 4টি অক্ষর।'), 'warn', 'warn') +
      `<div class="grid g3">${U().card('', U().kpi({ label: t('Working', 'চালু'), value: n('ok') }))}${U().card('', U().kpi({ label: t('Need attention', 'দেখতে হবে'), value: n('err'), sub: n('err') ? t('replace the key', 'কি বদলান') : '' }))}${U().card('', U().kpi({ label: t('Not set up', 'সেটআপ হয়নি'), value: n('none'), sub: t('the shop hides these options', 'দোকানে এগুলো লুকানো থাকে') }))}</div>` +
      KG.map((g) => { const L = all.filter((k) => k.grp === g[0]); return L.length ? U().card(t(g[1], g[2]), `<div>${L.map((k) => `<div class="set-key" id="k-${k.id}"><div style="min-width:0"><b>${A.esc(k.name)}</b><div class="muted small">${k.note ? t(k.note[0], k.note[1]) : k.mask ? `<span class="mono">${A.esc(k.mask)}</span>` : t('No key yet', 'এখনো কি নেই')}</div></div><div class="k2 small muted">${stB(k)}<br>${k.last ? t('used', 'ব্যবহার') + ' ' + F().ago(k.last) : '—'}</div><div class="row" style="flex-wrap:nowrap">${k.st !== 'none' ? `<button class="btn sm" data-kt="${k.id}">${t('Test', 'টেস্ট')}</button>` : ''}<button class="btn sm ${k.st === 'ok' ? '' : 'primary'}" data-ks="${k.id}">${k.st === 'none' ? t('Add key', 'কি দিন') : t('Replace', 'বদলান')}</button></div></div>`).join('')}</div>`) : ''; }).join('');
    const find = (id) => all.find((k) => k.id === id);
    A.on(el, '[data-kt]', 'click', (e, b) => { const k = find(b.dataset.kt); if (k.st === 'err') { A.toast(t(`${k.name}: the key is no longer accepted — press Replace`, `${k.name}: কি আর কাজ করছে না — "বদলান" চাপুন`), 'bad'); return; } k.last = A.TODAY.toISOString(); A.save(); A.toast(t(`${k.name} answered — working`, `${k.name} উত্তর দিয়েছে — চালু আছে`), 'good'); });
    A.on(el, '[data-ks]', 'click', (e, b) => {
      const k = find(b.dataset.ks);
      const m = U().modal(t('Key for ', 'কি: ') + A.esc(k.name), `<div class="formgrid">${U().field(t('Account ID / username', 'অ্যাকাউন্ট আইডি / ইউজারনেম'), U().input('ky-u', ''))}${U().field(t('Key or password', 'কি বা পাসওয়ার্ড'), '<input class="inp" id="ky-k" type="password" autocomplete="off">')}</div><div class="hint">${t('Copy it from the service’s own panel. It is checked first, then locked.', 'সার্ভিসের নিজের প্যানেল থেকে কপি করুন। আগে যাচাই হয়, তারপর তালাবদ্ধ হয়।')}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ky-ok">${t('Check & save', 'যাচাই করে সেভ')}</button>` });
      m.parentElement.querySelector('#ky-ok').onclick = () => { const v = m.querySelector('#ky-k').value.trim(); if (!m.querySelector('#ky-u').value.trim() || v.length < 6) { A.toast(t('Fill both boxes (key at least 6 characters)', 'দুটো ঘর পূরণ করুন (কি অন্তত 6 অক্ষর)'), 'bad'); return; } U().close(); pinAsk(t('Save this key?', 'এই কি সেভ করবেন?'), A.esc(k.name), t('Save', 'সেভ'), () => { if (k.courier) k.courier.connected = true; else { k.st = 'ok'; k.mask = '••••' + v.slice(-4); k.last = A.TODAY.toISOString(); delete k.note; } done(`Key saved: ${k.name}`, `${k.name} is working`, `${k.name} চালু হয়েছে`); }); };
    });
  }

  /* ================= Backups & restore ================= */
  function renderBackups(el) {
    const set = S(); const B = set.bk; const last = set.backups[0]; const age = (A.TODAY - new Date(last.at)) / 36e5;
    el.innerHTML = A.pageHead(t('Backups & restore', 'ব্যাকআপ ও রিস্টোর'), t('A full copy of the shop — orders, customers, products, photos, settings — kept on the server and in your Google Drive.', 'দোকানের পুরো কপি — অর্ডার, কাস্টমার, প্রোডাক্ট, ছবি, সেটিংস — সার্ভারে ও আপনার গুগল ড্রাইভে রাখা।'), `<button class="btn primary" id="bk-now">${I('down')}${t('Back up now', 'এখনই ব্যাকআপ')}</button>`) +
      `<div class="set-hero"><span class="set-dot ${age < B.every * 1.5 ? '' : 'bad'}"></span><div class="grow"><div class="big">${age < B.every * 1.5 ? t('Your data is safe', 'আপনার ডেটা নিরাপদ') : t('Backup is late', 'ব্যাকআপ দেরি হয়েছে')}</div><div class="muted">${t(`Last backup ${F().ago(last.at)} · ${last.size} · copied to Google Drive`, `শেষ ব্যাকআপ ${F().ago(last.at)} · ${last.size} · গুগল ড্রাইভে কপি হয়েছে`)}</div></div></div>
      <div class="grid g2" style="margin-top:14px">
        ${U().card(t('Schedule', 'সময়সূচি'), `<div class="formgrid">${U().field(t('Back up every', 'ব্যাকআপ হবে প্রতি'), U().select('bk-ev', [[6, t('6 hours', '6 ঘণ্টায়')], [12, t('12 hours (twice a day)', '12 ঘণ্টায় (দিনে 2 বার)')], [24, t('day, at 3 AM', 'দিনে, রাত 3টায়')]], B.every))}${U().field(t('Keep on the server', 'সার্ভারে রাখুন'), U().select('bk-kp', [3, 4, 5, 6, 7].map((n) => [n, t(`newest ${n}`, `সর্বশেষ ${n}টি`)]), B.keep))}</div><div class="hint">${t('Google Drive always keeps the newest 3. A new one replaces the oldest only after Google has checked it.', 'গুগল ড্রাইভে সবসময় সর্বশেষ 3টি থাকে। গুগল যাচাই করার পরেই নতুনটি সবচেয়ে পুরনোটির জায়গা নেয়।')}</div><button class="btn sm" id="bk-save" style="margin-top:8px">${t('Save schedule', 'সময়সূচি সেভ')}</button>`)}
        ${U().card(t('Monthly restore drill', 'মাসিক রিস্টোর মহড়া'), `<div class="set-light"><i class="${B.drill.ok ? '' : 'bad'}"></i><div><b>${B.drill.ok ? t('Passed', 'পাস') : t('Failed', 'ফেল')} · ${F().dateY(B.drill.at)}</b><span class="muted small">${t(`The newest backup was opened on a spare copy in ${B.drill.min} minutes: ${B.drill.rows}. The live shop was not touched.`, `সর্বশেষ ব্যাকআপ একটা আলাদা কপিতে ${B.drill.min} মিনিটে খোলা হয়েছে: ${B.drill.rows}। লাইভ দোকানে হাত দেওয়া হয়নি।`)}</span></div></div><div class="row" style="margin-top:10px"><button class="btn sm" id="bk-drill">${t('Run drill now', 'এখনই মহড়া')}</button><button class="btn sm ghost" id="bk-guide">${I('down')} ${t('Restore guide (PDF)', 'রিস্টোর গাইড (PDF)')}</button></div>`)}
      </div>` +
      U().card(t('Backups', 'ব্যাকআপ'), `<div class="list">${set.backups.map((b) => `<div class="li"><div class="grow"><b>${F().dt(b.at)}</b><div class="muted small">${b.size} · ${b.drive ? t('server + Google Drive', 'সার্ভার + গুগল ড্রাইভ') : t('server only', 'শুধু সার্ভার')}</div></div>${b.drive ? U().badge('Drive', 'good') : ''}<button class="btn sm" data-rs="${b.id}">${t('Restore', 'রিস্টোর')}</button></div>`).join('')}</div>`, { sub: t('Restore needs your PIN and takes a safety copy first', 'রিস্টোরে PIN লাগে, আগে নিরাপত্তা কপি নেয়') });
    el.querySelector('#bk-now').onclick = () => { set.backups.unshift({ id: A.uid('BK'), at: A.TODAY.toISOString(), size: '419 MB', drive: true }); set.backups.forEach((b, i) => { b.drive = i < B.drive; }); set.backups = set.backups.slice(0, B.keep); done('Backup made by owner', 'Backup finished and copied to Google Drive', 'ব্যাকআপ শেষ, গুগল ড্রাইভে কপি হয়েছে'); };
    el.querySelector('#bk-save').onclick = () => { B.every = +el.querySelector('#bk-ev').value; B.keep = +el.querySelector('#bk-kp').value; set.backups = set.backups.slice(0, B.keep); done('Backup schedule changed', 'Schedule saved', 'সময়সূচি সেভ হয়েছে'); };
    el.querySelector('#bk-drill').onclick = () => { B.drill = { at: A.TODAY.toISOString(), ok: true, min: 13, rows: B.drill.rows }; done('Restore drill run', 'Drill passed — the newest backup opens fine', 'মহড়া পাস — সর্বশেষ ব্যাকআপ ঠিকমতো খোলে'); };
    el.querySelector('#bk-guide').onclick = () => U().download(t('Restore guide (Bengali + English)', 'রিস্টোর গাইড (বাংলা + English)'));
    A.on(el, '[data-rs]', 'click', (e, b) => { const bk = set.backups.find((x) => x.id === b.dataset.rs); pinAsk(t('Restore this backup?', 'এই ব্যাকআপ রিস্টোর করবেন?'), t(`The shop goes back to <b>${F().dt(bk.at)}</b>. A safety copy of now is taken first, so nothing is lost. The shop pauses for about 5 minutes.`, `দোকান <b>${F().dt(bk.at)}</b>-এ ফিরে যাবে। আগে এখনকার নিরাপত্তা কপি নেওয়া হবে, তাই কিছু হারাবে না। প্রায় 5 মিনিট দোকান থেমে থাকবে।`), t('Restore', 'রিস্টোর'), () => { A.commit(`Restore started from ${F().dt(bk.at)}`); A.toast(t('Restore started — safety copy taken first', 'রিস্টোর শুরু — আগে নিরাপত্তা কপি নেওয়া হয়েছে'), 'good'); }, true); });
  }

  /* ================= Site health ================= */
  function renderHealth(el) {
    const set = S(); const H = set.health; const E = A.D.erp; const up = H.uptime; const avg = A.sum(up) / up.length;
    const erpBad = A.D.erpEvents.slice(0, 5).some((e) => !e.ok);
    const lights = [
      ['good', t('Shop is up', 'দোকান চালু'), t(`${avg.toFixed(2)}% of the last 14 days`, `গত 14 দিনের ${avg.toFixed(2)}%`)],
      ['good', t('Speed on phones', 'ফোনে গতি'), t('Pages open in 1.9 seconds (goal under 2.5)', 'পেজ 1.9 সেকেন্ডে খোলে (লক্ষ্য 2.5-এর কম)')],
      ['good', t('Errors today', 'আজ সমস্যা'), t('None seen by customers', 'কাস্টমার কোনো সমস্যা দেখেননি')],
      [H.check.bad ? 'bad' : 'good', t('Nightly page check', 'রাতের পেজ চেক'), t(`${H.check.pages} pages opened ${F().ago(H.check.at)} · ${H.check.bad} broken`, `${F().ago(H.check.at)} ${H.check.pages}টি পেজ খোলা হয়েছে · ${H.check.bad}টি ভাঙা`)],
      [erpBad ? 'warn' : 'good', t('ERP link', 'ERP সংযোগ'), t(`Checked ${F().ago(E.lastHealth)}`, `যাচাই ${F().ago(E.lastHealth)}`)],
      ['good', t('Domain & SSL lock', 'ডোমেইন ও SSL তালা'), t(`${A.D.store.domain} · lock renews by itself (next 8 Jan 2027)`, `${A.D.store.domain} · তালা নিজে নবায়ন হয় (পরের বার 8 Jan 2027)`)],
    ];
    el.innerHTML = A.pageHead(t('Site health', 'সাইটের অবস্থা'), t('Is the shop up, fast and error-free? Green means nothing to do.', 'দোকান কি চালু, দ্রুত আর সমস্যাহীন? সবুজ মানে কিছু করতে হবে না।'), `<button class="btn" id="hl-diag">${I('star')}${t('AI Diagnose', 'AI দিয়ে খুঁজুন')}</button><button class="btn primary" id="hl-opt">${I('sync')}${t('Optimise now', 'এখনই অপটিমাইজ')}</button>`) +
      U().card('', `<div class="grid g3">${lights.map((l) => `<div class="set-light"><i class="${l[0] === 'good' ? '' : l[0]}"></i><div><b>${l[1]}</b><span class="muted small">${l[2]}</span></div></div>`).join('')}</div>`) +
      `<div class="grid g2">
        ${U().card(t('Uptime, last 14 days', 'চালু থাকার হার, গত 14 দিন'), A.chart.columns({ labels: up.map((v, i) => F().date(new Date(A.TODAY - (13 - i) * DAY))), values: up.map((v) => +(v - 99).toFixed(2)) }) + `<div class="hint">${t('Bars show how far above 99% each day was. Short dips were planned updates at night.', 'বার দেখায় প্রতিদিন 99%-এর কত উপরে ছিল। ছোট নামাগুলো রাতের পরিকল্পিত আপডেট।')}</div>`)}
        ${U().card(t('Server room', 'সার্ভারের জায়গা'), `<div class="stack small"><div class="row between"><span>${t('Disk', 'ডিস্ক')}</span><b>38%</b></div>${U().bar(38, 'var(--good)')}<div class="row between"><span>${t('Memory', 'মেমরি')}</span><b>46%</b></div>${U().bar(46, 'var(--good)')}<div class="row between"><span>${t('Photos', 'ছবি')}</span><b>11.2 GB</b></div>${U().bar(22, 'var(--c2)')}</div><div class="hint">${t('Room for about 2 years at today’s growth.', 'এখনকার হারে প্রায় 2 বছরের জায়গা আছে।')}</div>`)}
      </div>
      <div class="grid g2">
        ${U().card(t('Alerts & checks', 'অ্যালার্ট ও চেক'), `<div class="stack">${sw('hl-tg', H.tg, t('Telegram alert when something breaks', 'কিছু ভাঙলে Telegram অ্যালার্ট'), t('Shop down, backup failed, many errors, ERP link lost', 'দোকান বন্ধ, ব্যাকআপ ব্যর্থ, অনেক সমস্যা, ERP সংযোগ নেই'))}${U().field(t('Full health & audit check runs', 'পুরো স্বাস্থ্য ও অডিট চেক চলে'), U().select('hl-au', [['hourly', t('every hour', 'প্রতি ঘণ্টায়')], ['daily', t('every night', 'প্রতি রাতে')], ['weekly', t('every week', 'প্রতি সপ্তাহে')]], H.audit), t('A deeper audit also runs every Sunday.', 'প্রতি রবিবার আরও গভীর অডিট চলে।'))}</div>`)}
        ${U().card(t('Last optimise', 'শেষ অপটিমাইজ'), `<div class="small">${F().ago(H.lastOpt)}</div><div class="muted small" style="margin-top:6px">${t('One button: shrinks new photos, refreshes saved pages, checks broken links and slow pages. Safe — it never changes products, prices or orders.', 'এক বোতাম: নতুন ছবি ছোট করে, সেভ করা পেজ রিফ্রেশ করে, ভাঙা লিংক ও ধীর পেজ খোঁজে। নিরাপদ — প্রোডাক্ট, দাম বা অর্ডার বদলায় না।')}</div>`)}
      </div>`;
    el.querySelector('#hl-tg').onchange = (e) => { H.tg = e.target.checked; done('Health Telegram alerts ' + (H.tg ? 'on' : 'off'), H.tg ? 'Alerts on' : 'Alerts off', H.tg ? 'অ্যালার্ট চালু' : 'অ্যালার্ট বন্ধ'); };
    el.querySelector('#hl-au').onchange = (e) => { H.audit = e.target.value; done('Audit schedule: ' + H.audit, 'Check schedule saved', 'চেকের সময় সেভ হয়েছে'); };
    el.querySelector('#hl-opt').onclick = () => { const m = U().modal(t('Optimise now', 'এখনই অপটিমাইজ'), `<div class="list">${[t('23 new photos made smaller (−4.1 MB)', '23টি নতুন ছবি ছোট করা হলো (−4.1 MB)'), t('Saved pages refreshed', 'সেভ করা পেজ রিফ্রেশ'), t('2 broken links found → sent to old pages’ new address', '2টি ভাঙা লিংক পাওয়া গেছে → নতুন ঠিকানায় পাঠানো হলো'), t('Slowest page: /collections/panjabi 2.4 s → 1.8 s', 'সবচেয়ে ধীর পেজ: /collections/panjabi 2.4 সে → 1.8 সে')].map((x) => `<div class="li">${U().badge('✓', 'good')}<span class="grow">${x}</span></div>`).join('')}</div>`, { foot: `<button class="btn primary" data-close>${t('Done', 'ঠিক আছে')}</button>` }); H.lastOpt = A.TODAY.toISOString(); A.commit('Site optimised'); A.toast(t('Optimised — phone pages 0.2 s faster', 'অপটিমাইজ হয়েছে — ফোনে পেজ 0.2 সে দ্রুত'), 'good'); };
    el.querySelector('#hl-diag').onclick = () => U().drawer(t('AI Diagnose', 'AI দিয়ে খুঁজুন'), (set.aiOn ? '' : U().callout(t('AI is off, so this is the rule-based check. Turn AI on in AI control for a written diagnosis.', 'AI বন্ধ, তাই এটা নিয়ম-ভিত্তিক চেক। লিখিত বিশ্লেষণের জন্য AI কন্ট্রোলে AI চালু করুন।'), 'warn', 'info')) + `<div class="card stack small"><b>${t('What I checked', 'যা দেখেছি')}</b><div>${t('Uptime, error log, page speed by page type, disk, memory, backups, ERP link, SSL.', 'চালু থাকা, সমস্যার লগ, পেজের ধরন অনুযায়ী গতি, ডিস্ক, মেমরি, ব্যাকআপ, ERP সংযোগ, SSL।')}</div><b>${t('Finding', 'যা পেলাম')}</b><div>${erpBad ? t('One ERP stock sync failed today and fixed itself on retry. Nothing for you to do.', 'আজ একবার ERP স্টক সিঙ্ক ব্যর্থ হয়ে আবার চেষ্টায় ঠিক হয়েছে। আপনার কিছু করতে হবে না।') : t('Everything is healthy.', 'সব ঠিক আছে।')} ${t('Panjabi page is the slowest (big photos) — "Optimise now" fixes it.', 'পাঞ্জাবি পেজ সবচেয়ে ধীর (বড় ছবি) — "এখনই অপটিমাইজ" ঠিক করবে।')}</div></div>`);
  }

  /* ================= AI control ================= */
  const MODELS = { Claude: ['Haiku', 'Sonnet', 'Opus'], OpenAI: ['GPT mini', 'GPT'], Gemini: ['Flash', 'Pro'] };
  /* ================= Updates & versions ================= */
  function renderUpdates(el) {
    const set = S(); const v = set.version;
    el.innerHTML = A.pageHead(t('Updates & versions', 'আপডেট ও ভার্সন'), t('Which version runs now, what changed in plain words, and a safe way back.', 'এখন কোন ভার্সন চলছে, সহজ কথায় কী বদলেছে, আর নিরাপদে ফেরার উপায়।')) +
      `<div class="set-hero"><span class="set-dot"></span><div class="grow"><div class="big">${t('Version', 'ভার্সন')} ${v.no}</div><div class="muted small">${t(`Installed ${F().ago(v.at)} · all checks passed · a safety copy was taken first`, `${F().ago(v.at)} ইনস্টল · সব চেক পাস · আগে নিরাপত্তা কপি নেওয়া হয়েছে`)}</div></div><a class="btn" href="#" id="up-stg">${I('ext')} ${t('Open test shop', 'টেস্ট দোকান খুলুন')}</a></div>
      <div class="grid g2" style="margin-top:14px">
        ${U().card(t('How updates arrive', 'আপডেট কীভাবে আসে'), `${sw('up-auto', set.autoUpdate, t('Install updates by themselves', 'আপডেট নিজে ইনস্টল হবে'), t('Only after every check passes on the test shop; at night; goes back by itself if anything fails.', 'টেস্ট দোকানে সব চেক পাস হলেই; রাতে; কিছু ভুল হলে নিজে আগের ভার্সনে ফেরে।'))}<div class="row" style="margin-top:10px"><button class="btn sm" id="up-chk">${t('Check for updates', 'আপডেট আছে কিনা দেখুন')}</button><button class="btn sm danger" id="up-back">${I('reset')} ${t('Go back to previous version', 'আগের ভার্সনে ফিরুন')}</button></div>`)}
        ${U().card(t('What changed', 'কী বদলেছে'), set.changes.map((c) => `<div style="margin-bottom:10px"><div class="row between"><b>${c.no}${c.no === v.no ? ' ' + U().badge(t('running', 'চলছে'), 'good') : ''}</b><span class="muted small">${F().dateY(c.at)}</span></div><ul class="small" style="margin:4px 0 0 18px;padding:0">${c.en.map((x, i) => `<li>${t(x, c.bn[i])}</li>`).join('')}</ul></div>`).join(''))}
      </div>`;
    el.querySelector('#up-stg').onclick = (e) => { e.preventDefault(); A.toast(t('Opens new.extas.com.bd — the test shop with password', 'new.extas.com.bd খুলবে — পাসওয়ার্ডসহ টেস্ট দোকান')); };
    el.querySelector('#up-auto').onchange = (e) => { set.autoUpdate = e.target.checked; done('Auto-update ' + (set.autoUpdate ? 'on' : 'off'), set.autoUpdate ? 'Updates install by themselves' : 'Updates wait for you', set.autoUpdate ? 'আপডেট নিজে ইনস্টল হবে' : 'আপডেট আপনার অপেক্ষায় থাকবে'); };
    el.querySelector('#up-chk').onclick = () => A.toast(t(`You are on the newest version (${v.no})`, `আপনি সর্বশেষ ভার্সনে আছেন (${v.no})`), 'good');
    el.querySelector('#up-back').onclick = () => { const prev = set.changes.find((c) => c.no !== v.no); if (!prev) return; pinAsk(t('Go back a version?', 'আগের ভার্সনে ফিরবেন?'), t(`The shop goes back to ${prev.no}. Orders and data stay — only the screens change. About 2 minutes.`, `দোকান ${prev.no}-এ ফিরবে। অর্ডার ও ডেটা থাকবে — শুধু স্ক্রিন বদলাবে। প্রায় 2 মিনিট।`), t('Go back', 'ফিরুন'), () => { set.changes = set.changes.filter((c) => c.no !== v.no).concat([set.changes.find((c) => c.no === v.no)]); set.version = { no: prev.no, at: A.TODAY.toISOString() }; done(`Rolled back to ${prev.no}`, `Now running ${prev.no}`, `এখন ${prev.no} চলছে`); }, true); };
  }

  /* ================= Activity log ================= */
  let actWho = 'all'; let actQ = '';
  function renderActivity(el) {
    const set = S(); const names = A.D.staff.map((s) => s.name);
    let L = [].concat(...names.map(staffActs)); L.sort((a, b) => new Date(b.t) - new Date(a.t));
    const L2 = L.filter((a) => (actWho === 'all' || a.who === actWho) && (!actQ || a.text.toLowerCase().includes(actQ.toLowerCase())));
    el.innerHTML = A.pageHead(t('Activity log', 'অ্যাক্টিভিটি লগ'), t('Who changed what, and who looked at customer data. Nothing here can be edited or removed.', 'কে কী বদলেছেন, আর কে কাস্টমারের তথ্য দেখেছেন। এখানের কিছুই এডিট বা মোছা যায় না।'), `<button class="btn" id="ac-dl">${I('down')}${t('Download', 'ডাউনলোড')}</button>`) +
      `<div class="grid g2">${U().card(t('Changes', 'পরিবর্তন'), `<div class="row" style="margin-bottom:10px"><input class="inp" id="ac-q" type="search" placeholder="${t('Search the log…', 'লগে খুঁজুন…')}" value="${A.esc(actQ)}" style="max-width:260px"><div class="chips">${[['all', t('Everyone', 'সবাই')]].concat(names.map((n) => [n, n])).map((c) => `<button class="chip ${actWho === c[0] ? 'on' : ''}" data-who="${A.esc(c[0])}">${A.esc(c[1])}</button>`).join('')}</div></div>${U().table([
        { h: t('When', 'কখন'), f: (a) => `<span class="small">${F().dt(a.t)}</span>` },
        { h: t('Who', 'কে'), f: (a) => `<b class="small">${A.esc(a.who)}</b>`, hide: 1 },
        { h: t('What', 'কী'), f: (a) => `<span class="small">${A.esc(a.text)}</span>` },
      ], L2.slice(0, 40), { empty: t('Nothing found', 'কিছু পাওয়া যায়নি') })}`, { cls: 'span2' })}</div>` +
      U().card(t('Who viewed customer data', 'কে কাস্টমারের তথ্য দেখেছেন'), U().table([
        { h: t('When', 'কখন'), f: (v) => `<span class="small">${F().ago(v.t)}</span>` },
        { h: t('Staff', 'স্টাফ'), f: (v) => `<b>${A.esc(v.who)}</b>` },
        { h: t('What', 'কী'), f: (v) => `<span class="small">${viewText(v)}</span>${v.what === 'export' ? ' ' + U().badge(t('export', 'এক্সপোর্ট'), 'warn') : ''}` },
      ], set.views), { sub: t('Every phone number or address opened is recorded', 'প্রতিটা ফোন নম্বর বা ঠিকানা দেখা লেখা থাকে') });
    const qi = el.querySelector('#ac-q'); qi.oninput = () => { actQ = qi.value; const p = qi.selectionStart; A.render(); const n = document.querySelector('#ac-q'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } };
    A.on(el, '[data-who]', 'click', (e, b) => { actWho = b.dataset.who; A.render(); });
    el.querySelector('#ac-dl').onclick = () => U().download(t('Activity log', 'অ্যাক্টিভিটি লগ'));
  }

  /* ================= Data & privacy ================= */
  function renderPrivacy(el) {
    const set = S(); const P = set.privacy; const open = P.requests.filter((r) => r.status === 'open');
    el.innerHTML = A.pageHead(t('Data & privacy', 'ডেটা ও প্রাইভেসি'), t('Your data in and out, customers’ privacy requests, and how long things are kept.', 'আপনার ডেটা আনা-নেওয়া, কাস্টমারের প্রাইভেসি অনুরোধ, আর কতদিন রাখা হয়।')) +
      (open.length ? U().callout(t(`<b>${open.length} customer request(s)</b> waiting. Answer within 30 days.`, `<b>${open.length}টি কাস্টমার অনুরোধ</b> অপেক্ষায়। 30 দিনের মধ্যে উত্তর দিন।`), 'warn', 'warn') : '') +
      `<div class="grid g2">
        ${U().card(t('Customer requests', 'কাস্টমারের অনুরোধ'), P.requests.length ? `<div class="list">${P.requests.map((r) => `<div class="li" style="flex-wrap:wrap"><div class="grow"><b>${A.esc(r.cust)}</b> · ${r.kind === 'copy' ? t('wants a copy of their data', 'নিজের ডেটার কপি চান') : t('wants their data erased', 'নিজের ডেটা মুছতে চান')}<div class="muted small">${F().ago(r.at)} · ${r.status === 'open' ? t(`${30 - Math.round((A.TODAY - new Date(r.at)) / DAY)} days left`, `${30 - Math.round((A.TODAY - new Date(r.at)) / DAY)} দিন বাকি`) : t('done', 'শেষ')}</div></div>${r.status === 'open' ? `<button class="btn sm primary" data-rq="${r.id}">${r.kind === 'copy' ? t('Send copy', 'কপি পাঠান') : t('Erase', 'মুছুন')}</button>` : U().badge(t('Done', 'শেষ'), 'good')}</div>`).join('')}</div>` : U().empty(t('No requests', 'কোনো অনুরোধ নেই')))}
        ${U().card(t('Export your data', 'আপনার ডেটা এক্সপোর্ট'), `<div class="stack">${[['orders', t('Orders', 'অর্ডার')], ['customers', t('Customers (needs PIN)', 'কাস্টমার (PIN লাগে)')], ['products', t('Products & stock', 'প্রোডাক্ট ও স্টক')], ['all', t('Everything (one ZIP)', 'সব কিছু (একটা ZIP)')]].map((x) => `<div class="row between"><span>${x[1]}</span><button class="btn sm" data-ex="${x[0]}">${I('down')} ${t('Export', 'এক্সপোর্ট')}</button></div>`).join('')}</div>`)}
      </div>
      <div class="grid g2">
        ${U().card(t('How long things are kept', 'কতদিন রাখা হয়'), `<div class="formgrid">${U().field(t('Old product photos and videos', 'পুরনো প্রোডাক্টের ছবি ও ভিডিও'), U().select('pv-m', [[12, t('1 year', '1 বছর')], [24, t('2 years', '2 বছর')], [60, t('5 years', '5 বছর')]], P.mediaKeep))}${U().field(t('Chat messages', 'চ্যাট মেসেজ'), U().select('pv-c', [[6, t('6 months', '6 মাস')], [12, t('1 year', '1 বছর')], [24, t('2 years', '2 বছর')]], P.chatKeep))}</div><div class="hint">${t('Orders and money records are always kept for accounts — they are never removed.', 'অর্ডার ও টাকার হিসাব সবসময় রাখা হয় — কখনো মোছা হয় না।')}</div><button class="btn sm" id="pv-save" style="margin-top:8px">${t('Save', 'সেভ')}</button>`)}
        ${U().card(t('Import old customers', 'পুরনো কাস্টমার আনুন'), `<div class="muted small">${t('Bring customers from the old WordPress shop or a spreadsheet (name, phone, district). Duplicates by phone are merged, not doubled.', 'পুরনো WordPress দোকান বা স্প্রেডশিট থেকে কাস্টমার আনুন (নাম, ফোন, জেলা)। একই ফোন হলে মার্জ হয়, দুবার হয় না।')}</div><div class="row" style="margin-top:10px"><button class="btn sm primary" id="pv-imp">${t('Choose file', 'ফাইল বাছুন')}</button><button class="btn sm ghost" id="pv-tpl">${t('Sample sheet', 'নমুনা শিট')}</button></div>`)}
      </div>` +
      U().card(t('“My own data” — never copied to a new shop', '“আমার নিজের ডেটা” — নতুন দোকানে কখনো কপি হয় না'), `<div class="chips">${[t('Shop name & logo', 'দোকানের নাম ও লোগো'), t('Keys', 'কি'), t('Phone & address', 'ফোন ও ঠিকানা'), t('Bank & bKash numbers', 'ব্যাংক ও bKash নম্বর'), t('Social links', 'সোশ্যাল লিংক'), t('Customers & orders', 'কাস্টমার ও অর্ডার'), t('Delivery area list', 'ডেলিভারি এলাকার তালিকা')].map((x) => `<span class="chip">${x}</span>`).join('')}</div><div class="hint" style="margin-top:8px">${t('If this system is ever set up for another shop, these stay yours. Every setting also has “Back to default”.', 'এই সিস্টেম কখনো অন্য দোকানে বসানো হলে এগুলো আপনারই থাকে। প্রতিটা সেটিংসে “ডিফল্টে ফেরান”-ও আছে।')}</div>`);
    A.on(el, '[data-rq]', 'click', (e, b) => { const r = P.requests.find((x) => x.id === b.dataset.rq); if (r.kind === 'copy') { r.status = 'done'; done(`Data copy sent to ${r.cust}`, `Copy sent to ${r.cust} by email/SMS link`, `${r.cust}-কে ইমেইল/SMS লিংকে কপি পাঠানো হয়েছে`); } else pinAsk(t('Erase this customer’s data?', 'এই কাস্টমারের ডেটা মুছবেন?'), t(`${A.esc(r.cust)}: name, phone and address are replaced with “Erased customer”. Orders stay for accounts, without personal details.`, `${A.esc(r.cust)}: নাম, ফোন ও ঠিকানার জায়গায় “মুছে ফেলা কাস্টমার” বসবে। অর্ডার হিসাবের জন্য থাকবে, ব্যক্তিগত তথ্য ছাড়া।`), t('Erase', 'মুছুন'), () => { r.status = 'done'; const c = A.byId(A.D.customers, r.cid); if (c) { c.name = 'Erased customer'; c.phone = '—'; c.email = ''; } done(`Customer data erased on request (${r.cust})`, 'Personal details erased — orders kept for accounts', 'ব্যক্তিগত তথ্য মুছে ফেলা হলো — অর্ডার হিসাবে থাকল'); }, true); });
    A.on(el, '[data-ex]', 'click', (e, b) => { const go = () => { if (b.dataset.ex === 'customers') set.views.unshift({ who: 'Mehadi Hasan', cust: t('all customers', 'সব কাস্টমার'), what: 'export', t: A.TODAY.toISOString() }); A.commit('Export: ' + b.dataset.ex); U().download(b.dataset.ex + '.csv'); }; if (b.dataset.ex === 'customers' || b.dataset.ex === 'all') pinAsk(t('Export customer data?', 'কাস্টমার ডেটা এক্সপোর্ট করবেন?'), t('This file has phone numbers and addresses. Keep it safe. The export is recorded in the activity log.', 'এই ফাইলে ফোন নম্বর ও ঠিকানা আছে। নিরাপদে রাখুন। এক্সপোর্ট লগে লেখা থাকবে।'), t('Export', 'এক্সপোর্ট'), go); else go(); });
    el.querySelector('#pv-save').onclick = () => { P.mediaKeep = +el.querySelector('#pv-m').value; P.chatKeep = +el.querySelector('#pv-c').value; done('Keep times changed', 'Saved', 'সেভ হয়েছে'); };
    el.querySelector('#pv-imp').onclick = () => A.toast(t('Opens your files — you see a preview before anything is added', 'ফাইল খুলবে — কিছু যোগ হওয়ার আগে প্রিভিউ দেখবেন'));
    el.querySelector('#pv-tpl').onclick = () => U().download('customers-sample.csv');
    freshStart(el, set);
  }

  /* ================= AI control (short card — the full screens live in AI Center) ================= */
  function renderAi(el) {
    const set = S(); const G = set.agents; const used = A.sum(G, (a) => a.month); const pct = used / set.aiCap * 100;
    const waiting = A.D.ai ? A.D.ai.queue.filter((x) => x.status === 'open').length : 0;
    el.innerHTML = A.pageHead(t('AI control', 'AI কন্ট্রোল'), t('AI now has its own menu: AI Center. This is a quick look.', 'AI-এর এখন নিজের মেনু আছে: AI সেন্টার। এখানে শুধু এক নজরে।')) +
      `<div class="set-hero"><span class="set-dot ${set.aiOn ? '' : 'off'}"></span><div class="grow"><div class="big">${set.aiOn ? t('AI is on', 'AI চালু') : t('AI is off', 'AI বন্ধ')}</div><div class="muted small">${t(`${G.filter((a) => a.on && (set.aiOn || a.keep)).length} of ${G.length} agents running · ${F().tk(used)} of ${F().tk(set.aiCap)} this month (${Math.round(pct)}%) · ${waiting} waiting for your OK`, `${G.length}টির মধ্যে ${G.filter((a) => a.on && (set.aiOn || a.keep)).length}টি এজেন্ট চলছে · এই মাসে ${F().tk(set.aiCap)}-এর ${F().tk(used)} (${Math.round(pct)}%) · ${waiting}টি আপনার অনুমতির অপেক্ষায়`)}</div></div><a class="btn primary" href="${A.href('ai', 'approvals')}">${I('sparkle')}${t('Open AI Center', 'AI সেন্টার খুলুন')}</a></div>` +
      `<div class="grid g4" style="margin-top:14px">${[['approvals', 'Approvals', 'অনুমোদন', 'One queue of everything AI proposes', 'AI-এর সব প্রস্তাব এক তালিকায়'], ['agents', 'AI agents', 'AI এজেন্ট', 'Pause, model, schedule', 'পজ, মডেল, সময়'], ['costs', 'Costs & limits', 'খরচ ও সীমা', 'AI, SMS and WhatsApp ceilings', 'AI, SMS ও WhatsApp-এর সীমা'], ['train', 'Training', 'ট্রেনিং', 'Rules, examples, sandbox, versions', 'নিয়ম, উদাহরণ, স্যান্ডবক্স, ভার্সন']].map((x) => `<a class="card" style="text-decoration:none;color:inherit" href="${A.href('ai', x[0])}"><b>${t(x[1], x[2])} →</b><div class="muted small">${t(x[3], x[4])}</div></a>`).join('')}</div>`;
  }

  /* ================= Demo products ================= */
  function renderDemo(el) {
    if (!A.demo) { el.innerHTML = U().empty(t('Open Products once to load demo products', 'ডেমো প্রোডাক্ট আনতে একবার প্রোডাক্ট খুলুন')); return; }
    const DM = A.demo; const d = DM.data(); const all = d.items; const shown = all.filter(DM.shown).length;
    const emptyCats = A.CATS.filter((c) => !DM.realIn(c.id)).length;
    const cnt = (key) => { const L = DM.inKey(key); return `<span class="muted small">${t('demo', 'ডেমো')} ${L.filter(DM.shown).length}${L.filter(DM.shown).length !== L.length ? '/' + L.length : ''} · ${t('real', 'আসল')} ${DM.realIn(key)}</span>`; };
    const sw2 = (key) => U().switch('dn-' + key.replace(/[^a-z0-9]/gi, '_'), !d.off[key], `data-dn="${A.esc(key)}" aria-label="${t('Show demo here', 'এখানে ডেমো দেখান')}"`);
    const tree = A.CATS.map((c) => `<details ${c.id === 'polo' ? 'open' : ''}><summary><span class="grow"><b>${DM.catNm(c.id)}</b> ${cnt(c.id)}</span>${sw2(c.id)}</summary><div class="dm-kids">${DM.subs(c.id).map((s) => { const k = c.id + '/' + s; return `<div class="dm-row"><span class="grow">${A.esc(s)} ${cnt(k)}</span>${sw2(k)}</div>${DM.leaves(c.id).map((l) => `<div class="dm-row dm-l"><span class="grow">${DM.nodeNm(l)} ${cnt(k + '/' + l)}</span>${sw2(k + '/' + l)}</div>`).join('')}`; }).join('')}</div></details>`).join('');
    el.innerHTML = A.pageHead(t('Demo products', 'ডেমো প্রোডাক্ট'), t('Sample products that fill every category, sub-category and sub-sub-category, so the shop never looks empty while real products arrive.', 'নমুনা প্রোডাক্ট প্রতিটা ক্যাটাগরি, সাব-ক্যাটাগরি ও তার নিচের ভাগ ভরিয়ে রাখে, যাতে আসল প্রোডাক্ট আসা পর্যন্ত দোকান ফাঁকা না লাগে।'), `<a class="btn" href="${A.href('products', 'all')}" id="dm-see">${I('products')}${t('See demo products', 'ডেমো প্রোডাক্ট দেখুন')}</a>`) +
      `<div class="set-hero"><span class="set-dot ${d.on ? '' : 'off'}"></span><div class="grow"><div class="big">${d.on ? t(`${shown} demo products showing`, `${shown}টি ডেমো প্রোডাক্ট দেখাচ্ছে`) : t('Demo products are off', 'ডেমো প্রোডাক্ট বন্ধ')}</div><div class="muted small">${t(`${all.length} made in total · ${emptyCats} categories have no real product yet`, `মোট ${all.length}টি তৈরি · ${emptyCats}টি ক্যাটাগরিতে এখনো আসল প্রোডাক্ট নেই`)}</div></div>${U().switch('dm-on', d.on, `aria-label="${t('All demo products', 'সব ডেমো প্রোডাক্ট')}"`)}</div>` +
      `<div class="grid g2" style="margin-top:14px">
        ${U().card(t('Where demo products show', 'ডেমো প্রোডাক্ট কোথায় দেখাবে'), `<div class="set-tree dm-tree">${tree}</div>`, { sub: t('Category › sub-category › sub-sub-category. Turn any part off.', 'ক্যাটাগরি › সাব-ক্যাটাগরি › তার নিচের ভাগ। যেকোনো অংশ বন্ধ করুন।') })}
        <div class="stack">
          ${U().card(t('Hide by itself', 'নিজে লুকাবে'), `<div class="stack">${sw('dm-auto', d.auto, t('Hide demo when a category has enough real products', 'যথেষ্ট আসল প্রোডাক্ট হলে ডেমো লুকান'), t('Checked on the smallest category each demo item sits in', 'প্রতিটা ডেমো যে সবচেয়ে ছোট ভাগে আছে সেখানে দেখা হয়'))}${U().field(t('Number of real products', 'আসল প্রোডাক্টের সংখ্যা'), `<input class="inp" type="number" min="1" id="dm-n" value="${d.autoN}" style="max-width:120px">`)}</div>`)}
          ${U().card(t('Demo products never…', 'ডেমো প্রোডাক্ট কখনো…'), `<div class="list small">${[['go to Google (hidden from search, not in the sitemap)', 'গুগলে যায় না (সার্চে লুকানো, সাইটম্যাপে নেই)'], ['go to Shopping or Facebook product feeds', 'Shopping বা Facebook প্রোডাক্ট ফিডে যায় না'], ['appear in ads or audiences', 'বিজ্ঞাপন বা অডিয়েন্সে আসে না'], ['count as stock', 'স্টক হিসেবে গোনা হয় না'], ['appear in reports or the dashboard', 'রিপোর্ট বা ড্যাশবোর্ডে আসে না'], ['touch Finance or profit', 'হিসাব বা লাভে আসে না'], ['go to the ERP', 'ERP-তে যায় না']].map((x) => `<div class="li">${I('check', 15)}<span class="grow">${t(x[0], x[1])}</span></div>`).join('')}</div>`)}
          ${U().card(t('Pop-up on the shop', 'দোকানের পপ-আপ'), `<div class="stack"><div class="muted small">${t('Shown when a customer taps Add to bag or Order now on a demo product, before any address is asked.', 'ডেমো প্রোডাক্টে Add to bag বা Order now চাপলে, ঠিকানা চাওয়ার আগেই দেখায়।')}</div>${U().field('English', `<textarea class="inp" id="dm-pen" rows="2">${A.esc(d.popup.en)}</textarea>`)}${U().field('বাংলা', `<textarea class="inp" id="dm-pbn" rows="2">${A.esc(d.popup.bn)}</textarea>`)}<div class="dm-pop"><b>${A.esc(t(d.popup.en, d.popup.bn))}</b><div class="row" style="gap:6px;margin-top:8px"><span class="btn sm primary">${t('See what’s available', 'যা আছে দেখুন')}</span><span class="btn sm">${t('Close', 'বন্ধ')}</span></div></div><div class="row"><button class="btn primary" id="dm-psave">${t('Save', 'সেভ')}</button></div></div>`)}
        </div>
      </div>`;
    el.querySelector('#dm-on').onchange = (e) => { d.on = e.target.checked; done('Demo products ' + (d.on ? 'on' : 'off'), d.on ? 'Demo products are showing' : 'All demo products hidden', d.on ? 'ডেমো প্রোডাক্ট দেখাচ্ছে' : 'সব ডেমো প্রোডাক্ট লুকানো হলো'); };
    A.on(el, '[data-dn]', 'change', (e, i) => { const k = i.dataset.dn; if (i.checked) delete d.off[k]; else d.off[k] = 1; done(`Demo ${k} ${i.checked ? 'on' : 'off'}`, i.checked ? 'Demo showing here' : 'Demo hidden here', i.checked ? 'এখানে ডেমো দেখাচ্ছে' : 'এখানে ডেমো লুকানো'); });
    A.on(el, '[data-dn]', 'click', (e) => e.stopPropagation());
    el.querySelector('#dm-auto').onchange = (e) => { d.auto = e.target.checked; done('Demo auto-hide ' + d.auto, 'Saved', 'সেভ হয়েছে'); };
    el.querySelector('#dm-n').onchange = (e) => { d.autoN = Math.max(1, +e.target.value || 1); done('Demo auto-hide at ' + d.autoN, `Hides at ${d.autoN} real products`, `${d.autoN}টি আসল প্রোডাক্ট হলে লুকাবে`); };
    el.querySelector('#dm-psave').onclick = () => { d.popup.en = el.querySelector('#dm-pen').value.trim() || d.popup.en; d.popup.bn = el.querySelector('#dm-pbn').value.trim() || d.popup.bn; done('Demo pop-up text changed', 'Pop-up text saved', 'পপ-আপের লেখা সেভ হয়েছে'); };
    el.querySelector('#dm-see').onclick = (e) => { e.preventDefault(); if (A.setProductsFilter) A.setProductsFilter('demo'); A.go('products', 'all'); };
  }

  /* ================= Team: staff limits + end-of-day handover ================= */
  function limitsOf(set) {
    if (!set.limits) set.limits = { 'Order manager': { disc: 10, exp: false, hide: false }, 'Customer care': { disc: 5, exp: false, hide: false }, Packing: { disc: 0, exp: false, hide: true }, Marketing: { disc: 0, exp: true, hide: false } };
    Object.keys(set.access).forEach((r) => { if (!set.limits[r]) set.limits[r] = { disc: 0, exp: false, hide: false }; });
    if (!set.handover) set.handover = { on: true, time: '21:30', got: {} };
    return set.limits;
  }
  let pendL = null;
  function teamExtra(el, set) {
    const L = pendL || limitsOf(set); const roles = Object.keys(set.access); const H = set.handover; const day = F().ymd(A.TODAY);
    const desk = A.D.staff.filter((s) => s.role !== 'Owner' && s.active !== false && s.role !== 'Packing').slice(0, 4);
    const todays = A.D.orders.filter((o) => F().ymd(o.created) === day);
    const rows = desk.map((s, i) => { const mine = todays.filter((o, k) => k % Math.max(1, desk.length) === i); const bk = A.sum(mine.filter((o) => o.payment === 'bKash' || o.payment === 'Nagad'), (o) => o.paid || o.delivery || 0); const cash = (i === 0 ? 2 : 1) * 650 * ((i % 2) + 1); const got = (H.got[day] || {})[s.id]; return { _id: s.id, s, cash, bk, exp: cash + bk, got }; });
    const short = rows.filter((r) => r.got !== undefined && r.got < r.exp);
    const html = U().card(t('Staff limits', 'স্টাফের সীমা'), `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Role', 'রোল')}</th><th class="r">${t('Max discount', 'সর্বোচ্চ ছাড়')}</th><th>${t('Can export', 'এক্সপোর্ট পারবে')}</th><th>${t('Hide phone & address', 'ফোন ও ঠিকানা লুকান')}</th></tr></thead><tbody>${roles.map((r) => `<tr><td><b>${roleName(r)}</b></td><td class="r"><input class="inp" type="number" min="0" max="100" style="width:80px;text-align:right" data-ldisc="${A.esc(r)}" value="${L[r].disc}" aria-label="${t('Max discount %', 'সর্বোচ্চ ছাড় %')}"> %</td><td>${U().switch('lx-' + r.replace(/\W/g, ''), L[r].exp, `data-lexp="${A.esc(r)}" aria-label="${t('Can export', 'এক্সপোর্ট পারবে')}"`)}</td><td>${U().switch('lh-' + r.replace(/\W/g, ''), L[r].hide, `data-lhide="${A.esc(r)}" aria-label="${t('Hide phone & address', 'ফোন ও ঠিকানা লুকান')}"`)}</td></tr>`).join('')}</tbody></table></div><div class="hint" style="margin-top:6px">${t('A bigger discount than the limit goes to you for OK. Hidden phone and address show as “01•••••4521” and “Dhanmondi, Dhaka” — enough to pack, never enough to copy.', 'সীমার বেশি ছাড় দিলে আপনার অনুমতিতে যায়। লুকানো ফোন ও ঠিকানা দেখায় “01•••••4521” ও “ধানমন্ডি, ঢাকা” — প্যাক করতে যথেষ্ট, কপি করতে নয়।')}</div><div class="row" style="justify-content:flex-end;margin-top:8px;gap:8px">${pendL ? `<button class="btn" id="lm-undo">${t('Undo', 'বাতিল')}</button>` : ''}<button class="btn primary" id="lm-save" ${pendL ? '' : 'disabled'}>${t('Save limits', 'সীমা সেভ')}</button></div>`, { sub: t('Discount, export and what each role may see', 'ছাড়, এক্সপোর্ট আর কোন রোল কী দেখবে') }) +
      U().card(t('End-of-day cash & bKash handover', 'দিন শেষে ক্যাশ ও bKash হিসাব বুঝিয়ে দেওয়া'), `<div class="row between" style="gap:10px;margin-bottom:10px">${sw('ho-on', H.on, t(`Ask each desk staff for a handover sheet at ${H.time}`, `${H.time}-এ প্রত্যেক ডেস্ক স্টাফের কাছে হিসাবের শিট চাওয়া`), t('Counter cash and bKash/Nagad advances they took today', 'আজ তাঁরা যে কাউন্টার ক্যাশ ও bKash/Nagad অ্যাডভান্স নিয়েছেন'))}<input class="inp" type="time" id="ho-time" value="${H.time}" style="max-width:130px" aria-label="${t('Time', 'সময়')}"></div>` +
        (short.length ? U().callout(t(`<b>${short.map((r) => A.esc(r.s.name)).join(', ')}</b> handed over less than expected today.`, `<b>${short.map((r) => A.esc(r.s.name)).join(', ')}</b> আজ যা হওয়ার কথা তার চেয়ে কম বুঝিয়ে দিয়েছেন।`), 'bad', 'warn') : '') +
        U().table([
          { h: t('Staff', 'স্টাফ'), f: (r) => `<b>${A.esc(r.s.name)}</b><div class="muted small">${roleName(r.s.role)}</div>` },
          { h: t('Cash', 'ক্যাশ'), r: 1, hide: 1, f: (r) => F().tk(r.cash) },
          { h: 'bKash/Nagad', r: 1, hide: 1, f: (r) => F().tk(r.bk) },
          { h: t('Expected', 'হওয়ার কথা'), r: 1, f: (r) => `<b>${F().tk(r.exp)}</b>` },
          { h: t('Handed over', 'বুঝিয়ে দিয়েছেন'), r: 1, f: (r) => (r.got !== undefined ? `${F().tk(r.got)}${r.got < r.exp ? `<div class="small" style="color:var(--bad)">${t('short', 'কম')} ${F().tk(r.exp - r.got)}</div>` : `<div class="small" style="color:var(--good)">${t('matches', 'মিলেছে')}</div>`}` : `<button class="btn sm" data-ho="${r.s.id}">${t('Record', 'লিখুন')}</button>`) },
        ], rows) + `<div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn" id="ho-dl">${I('down')}${t('Download today’s sheet', 'আজকের শিট ডাউনলোড')}</button></div>`, { sub: F().date(A.TODAY) });
    el.insertAdjacentHTML('beforeend', html);
    const edit = () => { if (!pendL) pendL = JSON.parse(JSON.stringify(limitsOf(set))); return pendL; };
    A.on(el, '[data-ldisc]', 'change', (e, i) => { edit()[i.dataset.ldisc].disc = Math.max(0, Math.min(100, +i.value || 0)); setTimeout(() => A.render(), 0); });
    A.on(el, '[data-lexp]', 'change', (e, i) => { edit()[i.dataset.lexp].exp = i.checked; A.render(); });
    A.on(el, '[data-lhide]', 'change', (e, i) => { edit()[i.dataset.lhide].hide = i.checked; A.render(); });
    const u = el.querySelector('#lm-undo'); if (u) u.onclick = () => { pendL = null; A.render(); };
    el.querySelector('#lm-save').onclick = () => pinAsk(t('Save staff limits?', 'স্টাফের সীমা সেভ করবেন?'), t('Discount limits touch money, so your PIN is needed.', 'ছাড়ের সীমায় টাকা জড়িত, তাই PIN লাগবে।'), t('Save', 'সেভ'), () => { set.limits = pendL; pendL = null; done('Staff limits changed', 'Staff limits saved', 'স্টাফের সীমা সেভ হয়েছে'); });
    el.querySelector('#ho-on').onchange = (e) => { H.on = e.target.checked; done('Handover sheet ' + (H.on ? 'on' : 'off'), 'Saved', 'সেভ হয়েছে'); };
    el.querySelector('#ho-time').onchange = (e) => { H.time = e.target.value; done('Handover time ' + H.time, 'Saved', 'সেভ হয়েছে'); };
    el.querySelector('#ho-dl').onclick = () => U().download(`handover-${day}.pdf`);
    A.on(el, '[data-ho]', 'click', (e, b) => { const r = rows.find((x) => x._id === b.dataset.ho); const m = U().modal(t('Record handover', 'হিসাব লিখুন'), `<div class="stack"><div>${A.esc(r.s.name)} · ${t('expected', 'হওয়ার কথা')} <b>${F().tk(r.exp)}</b></div>${U().field(t('Amount handed over (৳)', 'বুঝিয়ে দেওয়া টাকা (৳)'), `<input class="inp" type="number" id="ho-v" value="${r.exp}">`)}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ho-ok">${t('Save', 'সেভ')}</button>` }); m.querySelector('#ho-ok').onclick = () => { const v = Math.max(0, +m.querySelector('#ho-v').value || 0); (H.got[day] = H.got[day] || {})[r.s.id] = v; U().close(); done(`Handover ${r.s.name} ${v}`, v < r.exp ? `Saved — short by ${F().tk(r.exp - v)}` : 'Saved — it matches', v < r.exp ? `সেভ — ${F().tk(r.exp - v)} কম` : 'সেভ — মিলেছে'); }; });
  }

  /* ================= Telegram: urgent approvals ================= */
  function tgUrgent(el, set) {
    const T = set.tg; if (!T.urgent) T.urgent = { on: true, refund: true, price: true, cod: true, codOver: 8000, wait: 30 };
    const U2 = T.urgent;
    const html = U().card(t('Urgent approvals on Telegram', 'Telegram-এ জরুরি অনুমোদন'), `<div class="stack">${sw('tu-on', U2.on, t('Send urgent approvals to my Telegram', 'জরুরি অনুমোদন আমার Telegram-এ পাঠান'), t('Tap Approve or Reject, then type your PIN in the chat. The PIN message is deleted at once.', 'Approve বা Reject চাপুন, তারপর চ্যাটে PIN লিখুন। PIN-এর মেসেজ সাথে সাথে মুছে যায়।'))}
      <div class="list">${[['refund', 'Refund of a prepaid order that was cancelled', 'প্রিপেইড অর্ডার বাতিল হলে টাকা ফেরত'], ['price', 'Price changes', 'দাম বদলানো'], ['cod', `Big COD orders (over ${F().tk(U2.codOver)})`, `বড় COD অর্ডার (${F().tk(U2.codOver)}-এর বেশি)`]].map((x) => `<div class="li"><span class="grow">${t(x[1], x[2])}</span>${U().switch('tu-' + x[0], U2[x[0]], `data-tu="${x[0]}"`)}</div>`).join('')}</div>
      <div class="formgrid">${U().field(t('Big COD means over (৳)', 'বড় COD মানে (৳)-এর বেশি'), `<input class="inp" type="number" id="tu-cod" value="${U2.codOver}" step="500">`)}${U().field(t('If no answer in (minutes)', 'উত্তর না এলে (মিনিট)'), `<input class="inp" type="number" id="tu-wait" value="${U2.wait}" step="5">`, t('It waits in AI Center › Approvals; nothing happens by itself.', 'AI সেন্টার › অনুমোদন-এ অপেক্ষা করে; নিজে কিছু হয় না।'))}</div>
      <div class="row"><button class="btn" id="tu-prev">${I('phone')}${t('See an example', 'উদাহরণ দেখুন')}</button><span class="muted small">${t('Only the owner’s Telegram can approve. 5 wrong PINs in a day stop Telegram approvals until you unlock them here.', 'শুধু মালিকের Telegram অনুমোদন দিতে পারে। দিনে 5 বার ভুল PIN দিলে এখান থেকে খোলা পর্যন্ত Telegram অনুমোদন বন্ধ থাকে।')}</span></div></div>`, { sub: t('Money decisions from your phone, with your PIN', 'ফোন থেকেই টাকার সিদ্ধান্ত, আপনার PIN দিয়ে') });
    el.insertAdjacentHTML('beforeend', html);
    el.querySelector('#tu-on').onchange = (e) => { U2.on = e.target.checked; done('Telegram urgent approvals ' + U2.on, 'Saved', 'সেভ হয়েছে'); };
    A.on(el, '[data-tu]', 'change', (e, i) => { U2[i.dataset.tu] = i.checked; done('Telegram urgent ' + i.dataset.tu + ' ' + i.checked, 'Saved', 'সেভ হয়েছে'); });
    el.querySelector('#tu-cod').onchange = (e) => { U2.codOver = Math.max(0, +e.target.value || 0); done('Telegram big COD over ' + U2.codOver, 'Saved', 'সেভ হয়েছে'); };
    el.querySelector('#tu-wait').onchange = (e) => { U2.wait = Math.max(5, +e.target.value || 30); done('Telegram approval wait ' + U2.wait, 'Saved', 'সেভ হয়েছে'); };
    el.querySelector('#tu-prev').onclick = () => { const o = A.D.orders.find((x) => x.payment === 'COD' && x.total > 3000) || A.D.orders[0]; U().modal(t('Example on Telegram', 'Telegram-এ উদাহরণ'), `<div class="card flat small" style="white-space:pre-wrap;line-height:1.7">🔔 EXTAS · ${t('Needs your OK', 'আপনার অনুমতি লাগবে')}\n${t('Big COD order', 'বড় COD অর্ডার')} ${o ? o.id : ''} · ${o ? F().tk(o.total) : ''}\n${o ? A.esc(o.name) + ', ' + A.esc(o.district) : ''} · ${t('courier score', 'কুরিয়ার স্কোর')} 7.4/10\n\n[ ${t('Approve', 'অনুমোদন')} ]  [ ${t('Reject', 'না')} ]\n${t('After Approve the bot asks: “Type your PIN”.', 'অনুমোদনের পরে বট জিজ্ঞেস করে: “PIN লিখুন”।')}</div>`, { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>` }); };
  }

  /* ================= Data & privacy: Start fresh (one time only) ================= */
  function freshCounts() {
    const D = A.D; const n = (x) => (x || []).length;
    return [
      ['orders', 'Orders', 'অর্ডার', n(D.orders)],
      ['customers', 'Customers', 'কাস্টমার', n(D.customers)],
      ['money', 'Payments & money records', 'পেমেন্ট ও টাকার হিসাব', n(D.expenses) + n(D.erp && D.erp.payments)],
      ['courier', 'Courier bookings', 'কুরিয়ার বুকিং', D.orders.filter((o) => o.tracking || o.courier).length],
      ['returns', 'Returns & exchanges', 'রিটার্ন ও এক্সচেঞ্জ', D.orders.filter((o) => ['returned', 'exchanged'].includes(o.status)).length],
      ['inbox', 'Inbox chats', 'ইনবক্সের চ্যাট', n(D.conversations)],
      ['reviews', 'Reviews & questions', 'রিভিউ ও প্রশ্ন', n(D.reviews) + n(D.questions)],
      ['coupons', 'Coupon usage', 'কুপন ব্যবহার', A.sum(D.coupons || [], (c) => c.uses || 0)],
      ['reports', 'Reports history (ad spend, sales history)', 'রিপোর্টের ইতিহাস (বিজ্ঞাপন খরচ, বিক্রির ইতিহাস)', n(D.adSpend) + n(D.erpEvents)],
      ['analytics', 'Analytics events (visits, incomplete orders)', 'অ্যানালিটিক্স (ভিজিট, অসম্পূর্ণ অর্ডার)', n(D.traffic) + n(D.abandoned)],
      ['ai', 'AI history', 'AI-এর ইতিহাস', D.ai ? n(D.ai.queue) + n(D.ai.asks) : 0],
    ];
  }
  function freshStart(el, set) {
    const st = A.D.store; const done0 = st.freshStartDone;
    const C = freshCounts(); const real = A.D.products.filter((p) => p.status !== 'archived').length; const demoN = A.D.demo ? A.D.demo.items.length : 0;
    const KEEP = [['Settings & rules', 'সেটিংস ও নিয়ম'], ['Policies & shop text', 'পলিসি ও দোকানের লেখা'], ['Staff accounts', 'স্টাফ অ্যাকাউন্ট'], ['Connections & keys', 'কানেকশন ও কি'], [`Demo products (${demoN})`, `ডেমো প্রোডাক্ট (${demoN})`], ['Size charts, combos, coupons themselves', 'সাইজ চার্ট, কম্বো, কুপন নিজে']];
    const html = done0 ? U().card(t('Start fresh', 'নতুন করে শুরু'), U().callout(t(`<b>Started fresh on ${F().dt(done0.at)} by ${A.esc(done0.by)}</b> · backup ${A.esc(done0.backup)}. This can only be done once.`, `<b>${F().dt(done0.at)}-এ ${A.esc(done0.by)} নতুন করে শুরু করেছেন</b> · ব্যাকআপ ${A.esc(done0.backup)}। এটা একবারই করা যায়।`), 'good', 'check')) :
      U().card(t('Start fresh (one time only)', 'নতুন করে শুরু (শুধু একবার)'), `<div class="muted small" style="margin-bottom:10px">${t('Clears all test and sample business data so the live shop starts from zero. Use it once, on go-live day.', 'সব টেস্ট ও নমুনা ব্যবসার ডেটা মুছে দোকান শূন্য থেকে শুরু হয়। লাইভে যাওয়ার দিন একবার ব্যবহার করুন।')}</div>
        <div class="grid g2"><div><b class="small">${t('Will be cleared', 'যা মুছে যাবে')}</b><div class="list small">${C.map((c) => `<div class="li"><span class="grow">${t(c[1], c[2])}</span><b>${F().num(c[3])}</b></div>`).join('')}</div></div>
        <div><b class="small">${t('Will be kept', 'যা থাকবে')}</b><div class="list small">${KEEP.map((k) => `<div class="li">${I('check', 15)}<span class="grow">${t(k[0], k[1])}</span></div>`).join('')}<div class="li"><span class="grow">${t(`Real products (${real})`, `আসল প্রোডাক্ট (${real})`)}</span>${U().badge(t('You choose', 'আপনি বাছবেন'), 'info')}</div></div></div></div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" id="fs-dry">${t('Preview (nothing changes)', 'প্রিভিউ (কিছু বদলাবে না)')}</button><button class="btn danger" id="fs-go">${t('Start fresh…', 'নতুন করে শুরু…')}</button></div>`, { sub: t('Owner only · full backup first · type START FRESH + PIN', 'শুধু মালিক · আগে পুরো ব্যাকআপ · START FRESH লিখুন + PIN') });
    el.insertAdjacentHTML('beforeend', html);
    if (done0) return;
    const total = A.sum(C, (c) => c[3]);
    el.querySelector('#fs-dry').onclick = () => U().modal(t('Preview — nothing has changed', 'প্রিভিউ — কিছুই বদলায়নি'), `<div class="stack"><div>${t(`${F().num(total)} records would be cleared:`, `${F().num(total)}টি রেকর্ড মুছে যাবে:`)}</div><div class="list small">${C.map((c) => `<div class="li"><span class="grow">${t(c[1], c[2])}</span><b>${F().num(c[3])}</b></div>`).join('')}</div><div class="guide-note small">${t(`Kept: settings, rules, policies, shop text, staff, keys, ${demoN} demo products and your ${real} real products (unless you choose to remove them).`, `থাকবে: সেটিংস, নিয়ম, পলিসি, দোকানের লেখা, স্টাফ, কি, ${demoN}টি ডেমো প্রোডাক্ট ও আপনার ${real}টি আসল প্রোডাক্ট (সরাতে না বললে)।`)}</div></div>`, { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>` });
    el.querySelector('#fs-go').onclick = () => {
      const driveOk = (set.keys.find((k) => k.id === 'drive') || {}).st === 'ok'; let backup = '';
      const m = U().modal(t('Start fresh', 'নতুন করে শুরু'), `<div class="stack">
        <div class="li" style="display:flex;gap:10px;align-items:center"><b class="grow">1 · ${t('Full backup to Google Drive', 'Google Drive-এ পুরো ব্যাকআপ')}</b><span id="fs-bk">${driveOk ? `<button class="btn sm primary" id="fs-bkgo">${t('Back up now', 'এখনই ব্যাকআপ')}</button>` : U().badge(t('Connect Google Drive first', 'আগে Google Drive যুক্ত করুন'), 'bad')}</span></div>
        <div><b>2 · ${t('Real products', 'আসল প্রোডাক্ট')}</b><label class="row small" style="gap:6px;margin-top:6px"><input type="radio" name="fs-p" value="keep" checked> ${t(`Keep all ${real} (sales counters go back to 0)`, `${real}টিই রাখুন (বিক্রির সংখ্যা 0 হবে)`)}</label><label class="row small" style="gap:6px"><input type="radio" name="fs-p" value="remove"> ${t('Remove from the shop (archived, can be brought back)', 'দোকান থেকে সরান (আর্কাইভ, পরে ফেরানো যায়)')}</label></div>
        ${U().field(`3 · ${t('Type START FRESH', 'START FRESH লিখুন')}`, '<input class="inp" id="fs-word" autocomplete="off" placeholder="START FRESH">')}
        ${U().field(`4 · ${t('Owner PIN', 'মালিকের PIN')}`, '<input class="inp" id="fs-pin" type="password" inputmode="numeric" maxlength="8" placeholder="••••" autocomplete="off">')}
        ${U().callout(t('This runs once. After it, the button is gone for ever.', 'এটা একবারই চলে। এরপর বোতামটা আর কখনো থাকবে না।'), 'warn', 'warn')}</div>`,
        { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn danger" id="fs-run" disabled>${t('Start fresh now', 'এখনই নতুন করে শুরু')}</button>` });
      const check = () => { m.querySelector('#fs-run').disabled = !(backup && m.querySelector('#fs-word').value.trim() === 'START FRESH' && /^\d{4,8}$/.test(m.querySelector('#fs-pin').value.trim())); };
      m.querySelector('#fs-word').oninput = check; m.querySelector('#fs-pin').oninput = check;
      const bk = m.querySelector('#fs-bkgo'); if (bk) bk.onclick = () => { backup = `extas-full-${F().ymd(A.TODAY)}-2000.zip`; set.backups.unshift({ id: A.uid('BK'), at: A.TODAY.toISOString(), size: '421 MB', drive: true }); m.querySelector('#fs-bk').innerHTML = U().badge(t('Backed up · ', 'ব্যাকআপ হয়েছে · ') + backup, 'good'); A.toast(t('Backup is safe in Google Drive', 'ব্যাকআপ Google Drive-এ নিরাপদ'), 'good'); check(); };
      m.querySelector('#fs-run').onclick = () => {
        const rm = (m.querySelector('input[name="fs-p"]:checked') || {}).value === 'remove';
        const D = A.D; const cleared = total;
        D.orders = []; D.customers = []; D.expenses = []; if (D.erp) { D.erp.payments = []; } D.erpEvents = []; D.conversations = []; D.reviews = []; D.questions = []; D.adSpend = []; D.traffic = []; D.abandoned = [];
        (D.coupons || []).forEach((c) => (c.uses = 0));
        if (D.ai) { D.ai.queue = []; D.ai.asks = []; } set.asks = []; set.views = []; set.privacy.requests = [];
        D.products.forEach((p) => { p.sold30 = 0; p.revenue30 = 0; p.views30 = 0; p.carts30 = 0; p.rating = 0; p.reviews = 0; if (rm && p.status !== 'archived') p.status = 'archived'; });
        st.freshStartDone = { at: A.TODAY.toISOString(), by: 'Mehadi Hasan', backup };
        U().close(); done(`Started fresh: ${cleared} test records cleared, backup ${backup}${rm ? ', real products archived' : ''}`, 'Started fresh — the shop starts from zero', 'নতুন করে শুরু হলো — দোকান শূন্য থেকে চলবে');
      };
    };
  }

  /* ================= Telegram control ================= */
  function renderTelegram(el) {
    const set = S(); const T = set.tg;
    const AL = [['down', 'Shop down or very slow', 'দোকান বন্ধ বা খুব ধীর'], ['backup', 'Backup failed', 'ব্যাকআপ ব্যর্থ'], ['bigOrder', 'Big order (over ৳10,000)', 'বড় অর্ডার (৳10,000-এর বেশি)'], ['erp', 'ERP link problem', 'ERP সংযোগে সমস্যা'], ['login', 'Strange sign-in attempts', 'সন্দেহজনক লগইন চেষ্টা']];
    el.innerHTML = A.pageHead(t('Telegram control', 'Telegram কন্ট্রোল'), t('Get reports and alerts on Telegram, and run the shop from your phone with simple commands.', 'Telegram-এ রিপোর্ট ও অ্যালার্ট পান, আর ফোন থেকে সহজ কমান্ডে দোকান চালান।'), `<button class="btn" id="tg-test">${I('send')}${t('Send test message', 'টেস্ট মেসেজ পাঠান')}</button>`) +
      `<div class="grid g2">
        ${U().card(t('Daily business report', 'দৈনিক ব্যবসার রিপোর্ট'), `<div class="stack">${sw('tg-rep', T.report, t('Every day at', 'প্রতিদিন') + ' ' + T.time, t('Sales, profit, orders stuck, returns, ad money, cash with couriers', 'বিক্রি, লাভ, আটকে থাকা অর্ডার, রিটার্ন, বিজ্ঞাপনের টাকা, কুরিয়ারের কাছে টাকা'))}${U().field(t('Time', 'সময়'), `<input class="inp" type="time" id="tg-time" value="${T.time}">`)}<label class="row small" style="gap:6px"><input type="checkbox" id="tg-mail" ${T.email ? 'checked' : ''}>${t('Also by email', 'ইমেইলেও')}</label><label class="row small" style="gap:6px"><input type="checkbox" id="tg-week" ${T.weekly ? 'checked' : ''}>${t('Weekly deeper audit on Sunday', 'রবিবারে সাপ্তাহিক গভীর অডিট')}</label><button class="btn sm" id="tg-prev">${t('Preview tonight’s report', 'আজ রাতের রিপোর্ট প্রিভিউ')}</button></div>`)}
        ${U().card(t('Alerts', 'অ্যালার্ট'), `<div class="stack">${AL.map((a) => `<div class="row between" style="flex-wrap:nowrap"><span>${t(a[1], a[2])}</span>${U().switch('al-' + a[0], T.alerts[a[0]], `data-al="${a[0]}"`)}</div>`).join('')}</div>`)}
      </div>
      <div class="grid g2">
        ${U().card(t('Allowed Telegram accounts', 'অনুমতিপ্রাপ্ত Telegram অ্যাকাউন্ট'), `<div class="list">${T.ids.map((x) => `<div class="li"><div class="grow"><b>${A.esc(x.who)}</b> ${U().badge(roleName(x.role), x.role === 'Owner' ? 'dark' : '')}<div class="muted small mono">${x.id}</div></div>${x.role === 'Owner' ? '' : `<button class="btn sm" data-tgx="${x.id}">${t('Remove', 'সরান')}</button>`}</div>`).join('')}</div><div style="margin-top:10px">${T.pair ? `<div class="guide-note">${t('Pairing code', 'পেয়ারিং কোড')}: <b class="mono" style="font-size:18px">${T.pair}</b> · ${t('send it to @extas_shop_bot within 10 minutes', '10 মিনিটের মধ্যে @extas_shop_bot-এ পাঠান')}</div>` : `<button class="btn sm primary" id="tg-pair">${I('plus')} ${t('Add a phone (pairing code)', 'ফোন যোগ করুন (পেয়ারিং কোড)')}</button>`}</div><div class="hint">${t('Only these accounts can talk to the bot. Staff get only what their role allows. Money actions on Telegram ask for your PIN.', 'শুধু এই অ্যাকাউন্টগুলো বটের সাথে কথা বলতে পারে। স্টাফ তাঁদের রোল অনুযায়ী পান। Telegram-এ টাকার কাজে PIN লাগে।')}</div>`)}
        ${U().card(t('Commands you can send', 'যে কমান্ড পাঠাতে পারেন'), `<div class="list small">${[['/report', 'Today’s report now', 'এখনই আজকের রিপোর্ট'], ['/orders', 'Orders waiting, by step', 'ধাপ অনুযায়ী অপেক্ষার অর্ডার'], ['/stock polo', 'Stock of a product', 'প্রোডাক্টের স্টক'], ['/pause ads', 'Pause all ads (PIN)', 'সব বিজ্ঞাপন পজ (PIN)'], ['/ai off', 'Turn AI off', 'AI বন্ধ'], ['/ask …', 'Ask Gyani anything', 'জ্ঞানীকে যেকোনো প্রশ্ন']].map((c) => `<div class="li"><span class="mono" style="min-width:110px">${c[0]}</span><span class="grow">${t(c[1], c[2])}</span></div>`).join('')}</div>`)}
      </div>`;
    el.querySelector('#tg-rep').onchange = (e) => { T.report = e.target.checked; done('Daily Telegram report ' + (T.report ? 'on' : 'off'), 'Saved', 'সেভ হয়েছে'); };
    el.querySelector('#tg-time').onchange = (e) => { T.time = e.target.value; done('Daily report time ' + T.time, `Report will come at ${T.time}`, `রিপোর্ট আসবে ${T.time}-এ`); };
    el.querySelector('#tg-mail').onchange = (e) => { T.email = e.target.checked; done('Report email ' + T.email, 'Saved', 'সেভ হয়েছে'); };
    el.querySelector('#tg-week').onchange = (e) => { T.weekly = e.target.checked; done('Weekly audit ' + T.weekly, 'Saved', 'সেভ হয়েছে'); };
    A.on(el, '[data-al]', 'change', (e, i) => { T.alerts[i.dataset.al] = i.checked; done('Telegram alert ' + i.dataset.al + ' ' + i.checked, 'Saved', 'সেভ হয়েছে'); });
    A.on(el, '[data-tgx]', 'click', (e, b) => pinAsk(t('Remove this Telegram account?', 'এই Telegram অ্যাকাউন্ট সরাবেন?'), b.dataset.tgx, t('Remove', 'সরান'), () => { T.ids = T.ids.filter((x) => x.id !== b.dataset.tgx); done('Telegram account removed', 'Removed — it can no longer use the bot', 'সরানো হলো — আর বট ব্যবহার করতে পারবে না'); }, true));
    const pr = el.querySelector('#tg-pair'); if (pr) pr.onclick = () => { T.pair = String(100000 + Math.floor(Math.random() * 899999)); done('Telegram pairing code made', 'Pairing code ready', 'পেয়ারিং কোড তৈরি'); };
    el.querySelector('#tg-test').onclick = () => A.toast(t('Test message sent to your Telegram', 'আপনার Telegram-এ টেস্ট মেসেজ গেছে'), 'good');
    el.querySelector('#tg-prev').onclick = () => { const k = A.calc.kpis('today').cur; const c = A.calc.counts(); U().modal(t('Tonight’s report', 'আজ রাতের রিপোর্ট'), `<div class="card flat mono small" style="white-space:pre-wrap;line-height:1.7">EXTAS · ${F().date(A.TODAY)} ${T.time}\n${t('Orders', 'অর্ডার')}: ${k.orders} · ${t('Sales', 'বিক্রি')} ${F().tk(k.sales)}\n${t('Profit', 'লাভ')}: ${F().tk(k.profit)}\n${t('Processing', 'প্রসেসিং')}: ${c.confirm || 0}\n${t('Ads', 'বিজ্ঞাপন')}: ${F().tk(k.ads)}\n${t('Cash with couriers', 'কুরিয়ারের কাছে টাকা')}: ${F().tk(A.calc.codWithCouriers().total || 0)}</div>`); };
    tgUrgent(el, set);
  }

  /* ================= Help & manual ================= */
  let manQ = ''; let manS = 'all';
  const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  function manualEntries() {
    const L = [];
    for (const s of A.NAV) {
      const m = A.mods[s.id] || {};
      const tabs = s.tabs.length ? s.tabs : [['main', s.name]];
      for (const tb of tabs) { const h = m[tb[0]] || (s.tabs.length ? null : m.main); if (h && h.guide) L.push({ sec: s, tab: tb, g: h.guide }); }
      if (s.id === 'settings') ITEMS.forEach((x) => { const h = m[x.id]; if (h && h.guide && !s.tabs.some((tb) => tb[0] === x.id)) L.push({ sec: s, tab: [x.id, { en: x.en, bn: x.bn }], g: h.guide }); });
    }
    return L;
  }
  function renderManual(el) {
    const all = manualEntries(); const s = manQ.trim().toLowerCase();
    const L = all.filter((e) => (manS === 'all' || e.sec.id === manS) && (!s || (A.nm(e.sec.name) + ' ' + A.nm(e.tab[1]) + ' ' + strip(e.g.en) + ' ' + strip(e.g.bn)).toLowerCase().includes(s)));
    const REG = [['S0A', 'Server setup', 'সার্ভার সেটআপ', 12, 12], ['S00', 'Foundations & settings', 'ভিত্তি ও সেটিংস', 19, 19], ['S02', 'Storefront pages', 'দোকানের পেজ', 31, 24], ['S05', 'Orders & checkout', 'অর্ডার ও চেকআউট', 28, 17], ['S08', 'Couriers & returns', 'কুরিয়ার ও রিটার্ন', 22, 9], ['S13', 'Marketing & ads', 'মার্কেটিং ও বিজ্ঞাপন', 40, 6], ['S15', 'AI 360', 'AI 360', 18, 0]];
    el.innerHTML = A.pageHead(t('Help & manual', 'সাহায্য ও ম্যানুয়াল'), t('The Site Manual: every page explained — what it is, why it exists, how to use it. It updates itself when a screen changes.', 'সাইট ম্যানুয়াল: প্রতিটা পেজের ব্যাখ্যা — কী, কেন, কীভাবে। স্ক্রিন বদলালে নিজে আপডেট হয়।'), `<button class="btn" id="mn-map">${I('map')}${t('Admin map', 'অ্যাডমিন ম্যাপ')}</button><button class="btn" id="mn-pdf">${I('down')}${t('Download PDF', 'PDF ডাউনলোড')}</button>`) +
      U().card('', `<input class="inp" id="mn-q" type="search" placeholder="${t('Search the manual… e.g. exchange, courier score, backup', 'ম্যানুয়ালে খুঁজুন… যেমন এক্সচেঞ্জ, কুরিয়ার স্কোর, ব্যাকআপ')}" value="${A.esc(manQ)}"><div class="chips" style="margin-top:10px">${[['all', t('All', 'সব')]].concat(A.NAV.map((x) => [x.id, A.nm(x.name)])).map((c) => `<button class="chip ${manS === c[0] ? 'on' : ''}" data-ms="${c[0]}">${c[1]}</button>`).join('')}</div><div class="muted small" style="margin-top:8px">${t(`${L.length} of ${all.length} pages · last rebuilt ${F().ago(S().version.at)} with version ${S().version.no}`, `${all.length}টির মধ্যে ${L.length}টি পেজ · শেষ তৈরি ${F().ago(S().version.at)}, ভার্সন ${S().version.no}`)}</div>`) +
      U().card('', `<div class="set-man">${L.map((e, i) => `<details ${s && i < 3 ? 'open' : ''}><summary>${U().badge(A.nm(e.sec.name), 'info')} ${A.nm(e.tab[1])}</summary><div class="body">${A.t(e.g.en, e.g.bn)}<a class="linkbtn" href="${A.href(e.sec.id, e.tab[0] === 'main' ? '' : e.tab[0])}">${t('Open this page', 'এই পেজ খুলুন')} →</a></div></details>`).join('') || U().empty(t('Nothing found — try fewer words', 'কিছু পাওয়া যায়নি — কম শব্দে খুঁজুন'))}</div>`) +
      U().card(t('Project files', 'প্রজেক্ট ফাইল'), `<div class="grid g3">${[['Blueprint V2.1', t('The full plan of the shop', 'দোকানের পুরো পরিকল্পনা'), '20 Oct 2026'], [t('PR register', 'PR রেজিস্টার'), t('Every planned piece of work and its status', 'প্রতিটা পরিকল্পিত কাজ ও তার অবস্থা'), '13 Nov 2026'], [t('Approved demo V12.4', 'অনুমোদিত ডেমো V12.4'), t('The look everything follows', 'যে চেহারা সবাই মেনে চলে'), '24 Oct 2026']].map((f) => `<div class="card flat tight"><b>${f[0]}</b><div class="muted small" style="margin:4px 0 8px">${f[1]} · ${f[2]}</div><div class="row"><button class="btn sm" data-pf="${A.esc(f[0])}">${t('Read', 'পড়ুন')}</button><button class="btn sm ghost" data-pd="${A.esc(f[0])}">${I('down')}</button></div></div>`).join('')}</div><div class="lbl" style="margin-top:12px">${t('Work by stage (read only)', 'ধাপ অনুযায়ী কাজ (শুধু দেখা)')}</div>${U().table([
        { h: t('Stage', 'ধাপ'), f: (r) => `<b>${r[0]}</b> <span class="small">${t(r[1], r[2])}</span>` },
        { h: t('Done', 'শেষ'), r: 1, f: (r) => `${r[4]}/${r[3]}` },
        { h: '', f: (r) => `<div style="min-width:80px">${U().bar(r[4] / r[3] * 100, r[4] === r[3] ? 'var(--good)' : 'var(--c1)')}</div>`, hide: 1 },
      ], REG)}<div class="hint">${t('Found a problem? Use AI control › Ask or report a problem — it goes to the right agent.', 'সমস্যা পেয়েছেন? AI কন্ট্রোল › প্রশ্ন বা সমস্যা জানান — সঠিক এজেন্টের কাছে যাবে।')}</div>`);
    const qi = el.querySelector('#mn-q'); qi.oninput = () => { manQ = qi.value; const p = qi.selectionStart; A.render(); const n = document.querySelector('#mn-q'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } };
    A.on(el, '[data-ms]', 'click', (e, b) => { manS = b.dataset.ms; A.render(); });
    el.querySelector('#mn-map').onclick = () => A.openMap && A.openMap();
    el.querySelector('#mn-pdf').onclick = () => U().download(t('Site Manual (Bengali)', 'সাইট ম্যানুয়াল (বাংলা)'));
    A.on(el, '[data-pf]', 'click', (e, b) => A.toast(t(`${b.dataset.pf} opens here, read-only, with contents and search`, `${b.dataset.pf} এখানে খুলবে, শুধু পড়ার জন্য, সূচি ও খোঁজসহ`)));
    A.on(el, '[data-pd]', 'click', (e, b) => U().download(b.dataset.pd));
  }
  A.setManualQuery = (s) => { manQ = s || ''; manS = 'all'; };
  /* ================= ERP connection ================= */
  const KIND = { health: ['Health check', 'হেলথ চেক'], stock: ['Stock', 'স্টক'], order: ['Orders', 'অর্ডার'], price: ['Buying price', 'কেনা দাম'], bill: ['Bills', 'বিল'], return: ['Returns', 'রিটার্ন'], product: ['Products', 'প্রোডাক্ট'], payment: ['Payments', 'পেমেন্ট'] };
  function renderErp(el) {
    const E = A.D.erp; const set = S(); const ev = A.D.erpEvents; const bal = A.calc.erpBalance();
    const now = A.TODAY.getTime();
    const lastOf = (k) => ev.find((e) => e.kind === k);
    const err24 = (k) => ev.filter((e) => e.kind === k && !e.ok && now - new Date(e.t) < DAY).length;
    const pushedToday = A.D.orders.filter((o) => o.erp && o.erp.pushed && now - new Date(o.erp.at) < DAY).length;
    const shippedToday = A.D.orders.filter((o) => o.status === 'shipped').length;
    const live = A.D.products.filter((p) => p.source === 'ERP').length;
    const skus = A.sum(A.D.products, (p) => p.variants.length);
    const retPending = A.D.orders.filter((o) => o.status === 'returned' && !o.returnChecked).length;
    const streams = [
      { dir: 'in', en: 'Products by style code', bn: 'স্টাইল কোড ধরে প্রোডাক্ট', last: E.lastProductSync, next: t('when you import', 'আপনি ইমপোর্ট করলে'), items: t(`${live} imported · ${E.notImported.length} new in ERP`, `${live}টি আনা · ERP-তে ${E.notImported.length}টি নতুন`), k: 'product' },
      { dir: 'in', en: 'Stock', bn: 'স্টক', last: E.lastStockSync, next: F().time(new Date(E.lastStockSync).getTime() + 36e5), items: t(`${F().num(skus)} sizes`, `${F().num(skus)}টি সাইজ`), k: 'stock' },
      { dir: 'in', en: 'Buying price changes', bn: 'কেনা দামের পরিবর্তন', last: (lastOf('price') || {}).t, next: t('as soon as ERP changes', 'ERP-তে বদলালেই'), items: t('1 change today', 'আজ 1টি পরিবর্তন'), k: 'price' },
      { dir: 'in', en: 'Return check results', bn: 'রিটার্ন যাচাইয়ের ফল', last: (lastOf('return') || {}).t, next: t('after each check', 'প্রতি যাচাইয়ের পরে'), items: t(`${retPending} waiting for check`, `${retPending}টি যাচাইয়ের অপেক্ষায়`), k: 'return' },
      { dir: 'out', en: 'Confirmed orders → sales orders', bn: 'কনফার্মড অর্ডার → সেলস অর্ডার', last: (lastOf('order') || {}).t, next: t('right after confirm', 'কনফার্মের সাথে সাথে'), items: t(`${pushedToday} in last 24 h`, `গত 24 ঘণ্টায় ${pushedToday}টি`), k: 'order' },
      { dir: 'out', en: 'Bill at buying price', bn: 'কেনা দামে বিল', last: (lastOf('bill') || {}).t, next: t('when parcel goes to courier', 'পার্সেল কুরিয়ারে গেলে'), items: t(`${shippedToday} parcels with courier`, `${shippedToday}টি পার্সেল কুরিয়ারে`), k: 'bill' },
      { dir: 'out', en: 'Payments to ERP', bn: 'ERP-কে পেমেন্ট', last: (lastOf('payment') || {}).t, next: t('when you pay', 'আপনি পে করলে'), items: t(`${F().tk(bal.owed)} still owed`, `${F().tk(bal.owed)} বাকি`), k: 'payment' },
    ];
    const kf = set.evF;
    const evl = ev.filter((e) => kf === 'all' || (kf === 'bad' ? !e.ok : e.kind === kf));
    const healthy = E.connected && !ev.slice(0, 5).some((e) => !e.ok);
    const lane = (cls, title, arrow, items) => `<div class="set-lane ${cls}"><h4><span class="ar">${arrow}</span>${title}</h4>${items.map((i) => `<div class="set-it"><b>${i[0]}</b><span class="line"></span><span class="w">${i[1]}</span></div>`).join('')}</div>`;
    el.innerHTML = A.pageHead(t('ERP connection', 'ERP কানেকশন'), t('Your shop and the Extas ERP work as one: the ERP owns stock and buying price, the shop owns customers and orders.', 'দোকান আর Extas ERP একসাথে চলে: স্টক ও কেনা দাম ERP-র, কাস্টমার ও অর্ডার দোকানের।'),
      `<button class="btn" id="erp-stock">${A.icon('sync')}${t('Sync stock now', 'এখনই স্টক সিঙ্ক')}</button><a class="btn" href="${A.href('products', 'add')}">${A.icon('down')}${t('Import products', 'প্রোডাক্ট ইমপোর্ট')}</a>`) +
      heroErp(E, healthy, ev) + `<div class="grid g4">
        ${U().card('', `<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="dotk" style="width:14px;height:14px;margin-top:4px;background:${healthy ? 'var(--good)' : 'var(--warn)'};box-shadow:0 0 0 5px ${healthy ? 'var(--good-soft)' : 'var(--warn-soft)'}"></span><div><b style="font-size:16px">${E.connected ? t('Connected', 'যুক্ত আছে') : t('Not connected', 'যুক্ত নয়')}</b><div class="muted small">${A.esc(E.url.replace('https://', ''))} · ${E.mode === 'live' ? t('live ERP', 'লাইভ ERP') : t('practice ERP', 'প্র্যাকটিস ERP')}</div><div class="muted small">${t('Checked', 'যাচাই')} ${F().ago(E.lastHealth)}</div></div></div>`)}
        ${U().card('', U().kpi({ label: t('Company · warehouse', 'কোম্পানি · গুদাম'), value: `<span style="font-size:18px">${A.esc(E.company)}</span>`, sub: A.esc(set.erpMap.warehouse) }))}
        ${U().card('', U().kpi({ label: t('Stock last synced', 'শেষ স্টক সিঙ্ক'), value: `<span style="font-size:18px">${F().ago(E.lastStockSync)}</span>`, sub: t('every hour by itself', 'প্রতি ঘণ্টায় নিজে থেকেই') }))}
        ${U().card('', U().kpi({ label: t('You owe the ERP', 'ERP-র কাছে বাকি'), value: F().tk(bal.owed), sub: `<a class="linkbtn" href="${A.href('finance', 'erp')}">${t('ERP account', 'ERP হিসাব')} →</a>` }))}
      </div>
      ${U().card(t('What moves between the ERP and the shop', 'ERP আর দোকানের মধ্যে কী আসা-যাওয়া করে'), `<div class="set-flow">
        <div class="set-node erp">${A.icon('box')}<div><b>Extas ERP</b><br><small>${t('stock · buying price · warehouse', 'স্টক · কেনা দাম · গুদাম')}</small></div></div>
        <div class="set-lanes">
          ${lane('', t('ERP → shop', 'ERP → দোকান'), '→→', [[t('Products by style code', 'স্টাইল কোড ধরে প্রোডাক্ট'), t('when you import', 'ইমপোর্ট করলে')], [t('Stock', 'স্টক'), t('every hour', 'প্রতি ঘণ্টায়')], [t('Buying price changes', 'কেনা দামের পরিবর্তন'), t('at once', 'সাথে সাথে')], [t('Return check results', 'রিটার্ন যাচাইয়ের ফল'), t('after the check', 'যাচাইয়ের পরে')]])}
          ${lane('back', t('Shop → ERP', 'দোকান → ERP'), '←←', [[t('Confirmed orders as sales orders', 'কনফার্মড অর্ডার, সেলস অর্ডার হিসেবে'), t('after the call', 'কলের পরে')], [t('Bill at buying price', 'কেনা দামে বিল'), t('parcel to courier', 'পার্সেল কুরিয়ারে')], [t('Returns to check', 'যাচাইয়ের জন্য রিটার্ন'), t('parcel back', 'পার্সেল ফেরত')], [t('Payments', 'পেমেন্ট'), t('when you pay', 'পে করলে')]])}
        </div>
        <div class="set-node shop">${A.icon('website')}<div><b>${A.esc(A.D.store.name)} ${t('shop', 'দোকান')}</b><br><small>${t('customers · orders · prices', 'কাস্টমার · অর্ডার · বিক্রির দাম')}</small></div></div>
      </div><div class="guide-note" style="margin-top:12px">${A.icon('info')} ${t('The selling price is yours: when the ERP changes a buying price, the shop price stays the same and only your margin changes — you get a note.', 'বিক্রির দাম আপনার: ERP কেনা দাম বদলালে দোকানের দাম একই থাকে, শুধু লাভের হার বদলায় — আপনি নোটিশ পান।')}</div>`)}
      ${U().card(t('Sync status', 'সিঙ্কের অবস্থা'), U().table([
        { h: t('What', 'কী'), f: (s) => `<span class="badge ${s.dir === 'in' ? 'dark' : 'accent'}">${s.dir === 'in' ? 'ERP →' : '→ ERP'}</span> <b>${t(s.en, s.bn)}</b>` },
        { h: t('Last run', 'শেষ চলেছে'), f: (s) => (s.last ? F().ago(s.last) : '—') },
        { h: t('Next', 'পরের বার'), f: (s) => `<span class="muted">${s.next}</span>`, hide: 1 },
        { h: t('Items', 'আইটেম'), f: (s) => `<span class="small">${s.items}</span>`, hide: 1 },
        { h: t('Problems (24 h)', 'সমস্যা (24 ঘণ্টা)'), r: 1, f: (s) => (err24(s.k) ? U().badge(t(`${err24(s.k)} failed, retried OK`, `${err24(s.k)}টি ব্যর্থ, আবার চেষ্টায় ঠিক`), 'warn') : U().badge(t('None', 'নেই'), 'good')) },
      ], streams))}
      <div class="grid g3">
        ${U().card(t('Activity log', 'কাজের লগ'), `<div class="chips" id="ev-f" style="margin-bottom:10px">${[['all', t('All', 'সব')]].concat(['order', 'stock', 'bill', 'return', 'product', 'price', 'payment'].map((k) => [k, t(KIND[k][0], KIND[k][1])])).concat([['bad', t('Problems', 'সমস্যা')]]).map((c) => `<button class="chip ${kf === c[0] ? 'on' : ''}" data-v="${c[0]}">${c[1]}</button>`).join('')}</div>` +
          U().table([
            { h: t('When', 'কখন'), f: (e) => `<span class="small">${F().dt(e.t)}</span>` },
            { h: t('Type', 'ধরন'), f: (e) => U().badge(t((KIND[e.kind] || [e.kind])[0], (KIND[e.kind] || [e.kind, e.kind])[1]), e.ok ? '' : 'bad'), hide: 1 },
            { h: t('What happened', 'কী হয়েছে'), f: (e) => `<span class="small">${A.esc(e.text)}</span>` },
            { h: '', r: 1, f: (e) => (e.ok ? `<span style="color:var(--good)">✓</span>` : `<span style="color:var(--bad)">✕</span>`) },
          ], evl.slice(0, 25), { empty: t('Nothing in this filter', 'এই ফিল্টারে কিছু নেই') }), { cls: 'span2' })}
        <div class="stack">
          ${U().card(t('Matching', 'মিলিয়ে রাখা'), `<div class="stack">${U().field(t('ERP warehouse for shop stock', 'দোকানের স্টকের ERP গুদাম'), U().select('mp-wh', [['Nikunja Warehouse', 'Nikunja Warehouse'], ['Gazipur Factory Store', 'Gazipur Factory Store']], set.erpMap.warehouse))}${U().field(t('Cash from couriers goes to', 'কুরিয়ারের ক্যাশ যায়'), U().select('mp-cod', [[set.erpMap.cod, set.erpMap.cod], ['Cash in hand', t('Cash in hand', 'হাতে নগদ')]], set.erpMap.cod))}${U().field(t('bKash payments go to', 'bKash পেমেন্ট যায়'), U().select('mp-bk', [['bKash merchant', 'bKash merchant'], ['DBBL current account', 'DBBL current account']], set.erpMap.bkash))}${U().field(t('Payments to the ERP from', 'ERP-কে পেমেন্ট যায়'), U().select('mp-pay', [['DBBL current account', 'DBBL current account'], ['bKash merchant', 'bKash merchant'], ['Cash in hand', t('Cash in hand', 'হাতে নগদ')]], set.erpMap.erpPay))}<button class="btn sm" id="mp-save">${t('Save matching', 'সেভ')}</button></div>`)}
          ${U().card(t('Safety', 'নিরাপত্তা'), `<div class="stack small"><div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:8px">${A.icon('check')}<span>${t('Nothing is ever deleted between the two. Mistakes are corrected with a reversing entry.', 'দুই দিকে কিছুই মোছা হয় না। ভুল হলে উল্টো এন্ট্রি দিয়ে ঠিক করা হয়।')}</span></div><div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:8px">${A.icon('check')}<span>${t('If the ERP is down, orders wait and are sent when it is back — none are lost.', 'ERP বন্ধ থাকলে অর্ডার অপেক্ষা করে, ফিরলে পাঠানো হয় — কোনোটাই হারায় না।')}</span></div><div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:8px">${A.icon('warn')}<span>${t('Changing the ERP address or switching to the practice ERP needs your PIN.', 'ERP ঠিকানা বদলাতে বা প্র্যাকটিস ERP-তে যেতে PIN লাগে।')}</span></div><button class="btn sm" id="erp-switch">${t('Change ERP connection', 'ERP কানেকশন বদলান')}</button></div>`)}
        </div>
      </div>`;
    const addEv = (kind, text, ok = true) => A.D.erpEvents.unshift({ t: A.TODAY.toISOString(), kind, text, ok });
    el.querySelectorAll('.erp-test').forEach((b) => b.onclick = () => testErp()); const testErp = () => { E.lastHealth = A.TODAY.toISOString(); addEv('health', `Health check passed · ${E.company} · ${set.erpMap.warehouse}`); A.commit('ERP connection tested'); A.toast(t('Connected — the ERP answered in 0.3 seconds', 'যুক্ত — ERP 0.3 সেকেন্ডে উত্তর দিয়েছে'), 'good'); A.render(); };
    el.querySelector('#erp-stock').onclick = () => { E.lastStockSync = A.TODAY.toISOString(); const ch = 3 + Math.floor(Math.random() * 6); addEv('stock', `Stock pulled from ERP · ${F().num(skus)} SKUs · ${ch} changed`); A.commit('Stock synced from ERP'); A.toast(t(`Stock updated — ${ch} sizes changed`, `স্টক আপডেট — ${ch}টি সাইজ বদলেছে`), 'good'); A.render(); };
    A.on(el, '#ev-f .chip', 'click', (e, b) => { set.evF = b.dataset.v; A.save(); A.render(); });
    el.querySelector('#mp-save').onclick = () => { Object.assign(set.erpMap, { warehouse: el.querySelector('#mp-wh').value, cod: el.querySelector('#mp-cod').value, bkash: el.querySelector('#mp-bk').value, erpPay: el.querySelector('#mp-pay').value }); E.warehouse = set.erpMap.warehouse; A.commit('ERP matching saved'); A.toast(t('Matching saved', 'সেভ হয়েছে'), 'good'); A.render(); };
    el.querySelector('#erp-switch').onclick = () => {
      const m = U().modal(t('Change ERP connection', 'ERP কানেকশন বদলান'), `${U().callout(t('Use this only when moving to a new ERP address, or to practise on the demo ERP. Orders waiting to be sent are kept.', 'শুধু নতুন ERP ঠিকানায় গেলে বা ডেমো ERP-তে প্র্যাকটিস করতে ব্যবহার করুন। পাঠানোর অপেক্ষায় থাকা অর্ডার থেকে যায়।'), 'warn', 'warn')}<div class="formgrid">${U().field(t('Which ERP', 'কোন ERP'), U().select('sw-m', [['live', t('Live ERP (erp.extasbd.com)', 'লাইভ ERP (erp.extasbd.com)')], ['demo', t('Practice ERP (demo.extasbd.com)', 'প্র্যাকটিস ERP (demo.extasbd.com)')]], E.mode))}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="sw-ok">${t('Continue', 'এগিয়ে যান')}</button>` });
      m.parentElement.querySelector('#sw-ok').onclick = () => {
        const mode = m.querySelector('#sw-m').value; if (mode === E.mode) { U().close(); A.toast(t('Already connected to that ERP', 'ওই ERP-তেই যুক্ত আছে')); return; }
        pinAsk(t('Switch ERP?', 'ERP বদলাবেন?'), mode === 'demo' ? t('The shop will use practice stock and send orders to the demo ERP. Real orders will wait until you switch back.', 'দোকান প্র্যাকটিস স্টক ব্যবহার করবে, অর্ডার যাবে ডেমো ERP-তে। আসল অর্ডার আবার ফেরানো পর্যন্ত অপেক্ষা করবে।') : t('The shop goes back to the live ERP. Waiting orders are sent now.', 'দোকান লাইভ ERP-তে ফিরবে। অপেক্ষায় থাকা অর্ডার এখন যাবে।'), t('Switch', 'বদলান'), () => {
          E.mode = mode; E.url = mode === 'demo' ? 'https://demo.extasbd.com' : 'https://erp.extasbd.com'; E.lastHealth = A.TODAY.toISOString();
          addEv('health', `Switched to ${mode === 'demo' ? 'practice' : 'live'} ERP · ${E.url.replace('https://', '')}`); A.commit(`ERP switched to ${mode}`); A.toast(mode === 'demo' ? t('Now on the practice ERP', 'এখন প্র্যাকটিস ERP-তে') : t('Back on the live ERP', 'লাইভ ERP-তে ফিরেছে'), 'good'); A.render();
        }, true);
      };
    };
  }
  /* ================= Couriers & connections ================= */
  function renderCouriers(el) {
    const set = S(); const C = A.D.couriers; const Z = [['inside', t('Inside Dhaka', 'ঢাকার ভেতরে')], ['sub', t('Dhaka suburbs', 'ঢাকার আশেপাশে')], ['outside', t('Outside Dhaka', 'ঢাকার বাইরে')]];
    const r30 = A.calc.range('30d'); const os = A.calc.ordersIn(r30.from, r30.to).filter((o) => o.courier);
    const stat = (c) => { const mine = os.filter((o) => o.courier === c.id); const fin = mine.filter((o) => A.calc.isDelivered(o) || o.status === 'returned'); return { n: mine.length, ret: fin.length ? mine.filter((o) => o.status === 'returned').length / fin.length * 100 : 0 }; };
    
    el.innerHTML = A.pageHead(t('Couriers', 'কুরিয়ার'), t('Courier accounts, what each one charges you, the default courier and where they pick up.', 'কুরিয়ার অ্যাকাউন্ট, প্রতিটা আপনার কাছ থেকে কত নেয়, ডিফল্ট কুরিয়ার আর কোথা থেকে পিকআপ।')) +
      U().card(t('Courier accounts', 'কুরিয়ার অ্যাকাউন্ট'), U().table([
        { h: t('Courier', 'কুরিয়ার'), f: (c) => `<b>${c.name}</b><div class="muted small">${t(`${stat(c).n} parcels in 30 days`, `30 দিনে ${stat(c).n}টি পার্সেল`)}</div>` },
        { h: t('Status', 'অবস্থা'), f: (c) => (c.connected ? U().badge(t('Connected', 'যুক্ত'), 'good') : U().badge(t('Not connected', 'যুক্ত নয়'), '')) },
        { h: t('Inside Dhaka', 'ঢাকার ভেতরে'), r: 1, f: (c) => F().tk(c.fee.inside) },
        { h: t('Suburbs', 'আশেপাশে'), r: 1, f: (c) => F().tk(c.fee.sub), hide: 1 },
        { h: t('Outside', 'বাইরে'), r: 1, f: (c) => F().tk(c.fee.outside), hide: 1 },
        { h: t('Cash fee', 'ক্যাশ চার্জ'), r: 1, f: (c) => c.codPct + '%', hide: 1 },
        { h: t('Returned', 'ফেরত'), r: 1, f: (c) => F().pct(stat(c).ret), hide: 1 },
        { h: '', r: 1, f: (c) => `<div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" data-fee="${c.id}">${t('Fees', 'চার্জ')}</button>${c.connected ? `<button class="btn sm ghost danger" data-dis="${c.id}">${t('Disconnect', 'বিচ্ছিন্ন')}</button>` : `<button class="btn sm primary" data-con="${c.id}">${t('Connect', 'যুক্ত করুন')}</button>`}</div>` },
      ], C) + `<div class="guide-note" style="margin-top:10px">${A.icon('info')} ${t('These are what the courier charges the shop. What the customer pays for delivery is set in Rules › Delivery.', 'এগুলো কুরিয়ার দোকানের কাছ থেকে যা নেয়। কাস্টমার ডেলিভারিতে কত দেবেন তা নিয়ম › ডেলিভারি-তে।')} <a class="linkbtn" href="${A.href('rules', 'delivery')}">${t('Open', 'খুলুন')} →</a></div>`, { sub: t('Shop’s cost per parcel', 'প্রতি পার্সেলে দোকানের খরচ') }) +
      `<div class="grid g2">
        ${U().card(t('Default courier', 'ডিফল্ট কুরিয়ার'), `<div class="stack">${U().field(t('All parcels go with', 'সব পার্সেল যাবে'), U().select('dc-one', C.filter((c) => c.connected).map((c) => [c.id, `${c.name} · ${F().tk(c.fee.inside)} / ${F().tk(c.fee.outside)}`]), set.defCourier), t('Same setting as Rules › Order flow.', 'নিয়ম › অর্ডার ফ্লো-র একই সেটিং।'))}${sw('dc-zone', set.zoneRouting, t('Different courier by area', 'এলাকা অনুযায়ী আলাদা কুরিয়ার'), t('Off: one courier for everything, one pickup a day.', 'বন্ধ: সবকিছু এক কুরিয়ারে, দিনে একবার পিকআপ।'))}${U().field(t('Pickup from', 'পিকআপ হবে'), U().select('dc-pk', [['warehouse', t('Warehouse', 'গুদাম') + ' — ' + A.D.store.warehouseAddr], ['office', t('Office', 'অফিস') + ' — ' + A.D.store.officeAddr]], set.pickup), `<a class="linkbtn" href="${A.href('settings', 'store')}">${t('Edit addresses', 'ঠিকানা এডিট')} →</a>`)}${U().field(t('Daily pickup time', 'প্রতিদিন পিকআপের সময়'), `<input class="inp" type="time" id="dc-pt" value="${set.pickupTime}">`)}<button class="btn sm" id="dc-save">${t('Save', 'সেভ')}</button></div>`)}
        ${U().card(t('Book parcels by itself', 'নিজে থেকে পার্সেল বুক'), `<div class="row between" style="flex-wrap:nowrap"><div><b>${t('Auto-booking', 'অটো-বুকিং')}</b><div class="muted small">${t('When an order is packed, the parcel is booked with the default courier and the label prints. Off: staff press "Book courier" on each order.', 'অর্ডার প্যাক হলেই ডিফল্ট কুরিয়ারে পার্সেল বুক হয় আর লেবেল প্রিন্ট হয়। বন্ধ থাকলে প্রতি অর্ডারে স্টাফ "কুরিয়ার বুক" চাপেন।')}</div></div>${U().switch('ab-on', set.autoBook)}</div>${U().callout(t(`${A.calc.counts().ship} packed orders are waiting for a courier right now.`, `এখন ${A.calc.counts().ship}টি প্যাকড অর্ডার কুরিয়ারের অপেক্ষায়।`) + ` <a class="linkbtn" href="${A.href('orders', 'pack')}">${t('Open', 'খুলুন')} →</a>`)}`)}
      </div>` +
      U().callout(t('Courier keys, payment, SMS and other services are in <b>Keys & connections</b>.', 'কুরিয়ারের কি, পেমেন্ট, SMS ও অন্যান্য সার্ভিস <b>কি ও কানেকশন</b>-এ।') + ` <a class="linkbtn" href="${A.href('settings', 'keys')}">${t('Open', 'খুলুন')} →</a>`);
    A.on(el, '[data-fee]', 'click', (e, b) => {
      const c = A.byId(C, b.dataset.fee);
      const m = U().modal(t(`${c.name} fees`, `${c.name}-এর চার্জ`), `<div class="formgrid">${Z.map((z) => U().field(z[1], U().money('fe-' + z[0], c.fee[z[0]]))).join('')}${U().field(t('Cash collection fee (%)', 'ক্যাশ সংগ্রহের চার্জ (%)'), U().input('fe-cod', c.codPct, 'type="number" step="0.1"'))}</div><div class="hint">${t('Used in profit for every order. Change it when the courier sends a new rate card. Needs your PIN.', 'প্রতি অর্ডারের লাভের হিসাবে লাগে। কুরিয়ার নতুন রেট দিলে বদলান। PIN লাগবে।')}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="fe-ok">${t('Save fees', 'চার্জ সেভ')}</button>` });
      m.parentElement.querySelector('#fe-ok').onclick = () => {
        const nf = {}; for (const z of Z) { nf[z[0]] = Math.round(Number(m.querySelector('#fe-' + z[0]).value)); if (!(nf[z[0]] >= 0)) { A.toast(t('Enter every fee', 'সব চার্জ লিখুন'), 'bad'); return; } }
        const cod = Number(m.querySelector('#fe-cod').value);
        pinAsk(t('Save new courier fees?', 'কুরিয়ারের নতুন চার্জ সেভ করবেন?'), t(`${c.name}: ${Z.map((z) => `${z[1]} ${F().tk(c.fee[z[0]])} → <b>${F().tk(nf[z[0]])}</b>`).join(', ')}. Profit on every order changes.`, `${c.name}: ${Z.map((z) => `${z[1]} ${F().tk(c.fee[z[0]])} → <b>${F().tk(nf[z[0]])}</b>`).join(', ')}। প্রতি অর্ডারের লাভ বদলাবে।`), t('Save', 'সেভ'), () => { c.fee = nf; c.codPct = cod; A.commit(`Courier fees changed: ${c.name}`); A.toast(t('Courier fees saved — profit figures updated', 'কুরিয়ার চার্জ সেভ — লাভের হিসাব আপডেট হয়েছে'), 'good'); A.render(); });
      };
    });
    A.on(el, '[data-dis]', 'click', (e, b) => { const c = A.byId(C, b.dataset.dis); if (set.defCourier === c.id) { A.toast(t(`${c.name} is a default courier — pick another default first`, `${c.name} ডিফল্ট কুরিয়ার — আগে অন্য ডিফল্ট বাছুন`), 'bad'); return; } U().confirm(t(`Disconnect ${c.name}?`, `${c.name} বিচ্ছিন্ন করবেন?`), t('Parcels already with them keep their tracking. New parcels cannot be booked with them.', 'যে পার্সেল তাদের কাছে আছে তার ট্র্যাকিং থাকবে। নতুন পার্সেল বুক করা যাবে না।'), t('Disconnect', 'বিচ্ছিন্ন'), () => { c.connected = false; A.commit(`Courier ${c.name} disconnected`); A.toast(t('Disconnected', 'বিচ্ছিন্ন হয়েছে'), 'good'); A.render(); }, true); });
    A.on(el, '[data-con]', 'click', (e, b) => { const c = A.byId(C, b.dataset.con); const m = U().modal(t(`Connect ${c.name}`, `${c.name} যুক্ত করুন`), `<div class="formgrid">${U().field(t('Merchant account phone or email', 'মার্চেন্ট অ্যাকাউন্টের ফোন বা ইমেইল'), U().input('cc-u', ''))}${U().field(t('Access code from the courier panel', 'কুরিয়ার প্যানেলের অ্যাক্সেস কোড'), '<input class="inp" id="cc-k" type="password">')}</div><div class="hint">${t('Stored locked. Staff never see it.', 'তালাবদ্ধ অবস্থায় রাখা হয়। স্টাফ কখনো দেখেন না।')}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="cc-ok">${t('Connect', 'যুক্ত করুন')}</button>` }); m.parentElement.querySelector('#cc-ok').onclick = () => { if (!m.querySelector('#cc-u').value.trim() || !m.querySelector('#cc-k').value.trim()) { A.toast(t('Fill both boxes', 'দুটো ঘরই পূরণ করুন'), 'bad'); return; } c.connected = true; U().close(); A.commit(`Courier ${c.name} connected`); A.toast(t(`${c.name} connected`, `${c.name} যুক্ত হয়েছে`), 'good'); A.render(); }; });
    el.querySelector('#dc-save').onclick = () => { set.defCourier = el.querySelector('#dc-one').value; set.pickup = el.querySelector('#dc-pk').value; set.pickupTime = el.querySelector('#dc-pt').value; A.commit('Default courier and pickup saved'); A.toast(t('Saved — new parcels go with this courier', 'সেভ — নতুন পার্সেল এই কুরিয়ারে যাবে'), 'good'); A.render(); };
    el.querySelector('#dc-zone').onchange = (e) => { set.zoneRouting = e.target.checked; A.commit('Courier by area ' + set.zoneRouting); A.toast(t('Saved', 'সেভ হয়েছে'), 'good'); A.render(); };
    A.on(el, '[data-ctest]', 'click', () => {});
    el.querySelector('#ab-on').onchange = (e) => { set.autoBook = e.target.checked; A.commit(`Courier auto-booking ${set.autoBook ? 'on' : 'off'}`); A.toast(set.autoBook ? t('Packed orders will be booked by themselves', 'প্যাকড অর্ডার নিজে থেকেই বুক হবে') : t('Auto-booking off', 'অটো-বুকিং বন্ধ'), 'good'); A.render(); };
  }
  /* ================= Customer messages ================= */
  const VARS = { name: ['Customer name', 'কাস্টমারের নাম', 'Rahim'], order: ['Order no.', 'অর্ডার নম্বর', 'EX-10472'], total: ['Total', 'মোট', '৳1,650'], delivery: ['Delivery charge', 'ডেলিভারি চার্জ', '৳130'], courier: ['Courier', 'কুরিয়ার', 'Pathao'], tracking: ['Tracking no.', 'ট্র্যাকিং নম্বর', 'PTH4821093'], link: ['Tracking/review link', 'ট্র্যাকিং/রিভিউ লিংক', 'extas.com.bd/t/4821'], date: ['Date', 'তারিখ', '14 Nov'], phone: ['Hotline', 'হটলাইন', '09610-000000'], bkash: ['bKash number', 'bKash নম্বর', '01711-000000'] };
  const chipify = (s) => A.esc(s).replace(/\{(\w+)\}/g, (m, k) => (VARS[k] ? `<span class="set-var">${t(VARS[k][0], VARS[k][1])}</span>` : m));
  const sample = (s) => s.replace(/\{(\w+)\}/g, (m, k) => (k === 'bkash' ? A.D.rules.wallets.bkash : k === 'phone' ? A.D.store.phone : VARS[k] ? VARS[k][2] : m));
  function renderMsgs(el) {
    const set = S(); const T = set.templates;
    const smsOn = T.filter((x) => x.sms).length;
    const perMonth = Math.round(A.calc.kpis(A.calc.range('30d')).cur.orders * smsOn * 0.8);
    el.innerHTML = A.pageHead(t('Customer messages', 'কাস্টমার মেসেজ'), t('What customers receive by SMS or WhatsApp at each step of an order. Grey boxes fill in by themselves.', 'অর্ডারের প্রতিটা ধাপে কাস্টমার SMS বা WhatsApp-এ যা পান। নীল ঘরগুলো নিজে থেকেই বসে যায়।')) +
      U().callout(t(`About <b>${F().num(perMonth)} SMS a month</b> (≈ ${F().tk(perMonth * 0.35)}) at your current orders. WhatsApp messages are free.`, `এখনকার অর্ডারে মাসে প্রায় <b>${F().num(perMonth)}টি SMS</b> (≈ ${F().tk(perMonth * 0.35)})। WhatsApp মেসেজ ফ্রি।`)) +
      U().card('', `<div class="list">${T.map((x) => `<div class="li" style="align-items:flex-start;flex-wrap:wrap"><div class="grow" style="min-width:220px"><b>${t(x.en, x.bn)}</b><div class="small" style="margin-top:4px;line-height:1.7">${chipify(x.text)}</div></div><div class="row" style="flex-wrap:nowrap"><label class="row small" style="gap:6px;flex-wrap:nowrap">SMS ${U().switch('ms-s-' + x.id, x.sms, `data-sms="${x.id}"`)}</label><label class="row small" style="gap:6px;flex-wrap:nowrap">WhatsApp ${U().switch('ms-w-' + x.id, x.wa, `data-wa="${x.id}"`)}</label><button class="btn sm" data-ed="${x.id}">${A.icon('edit')}${t('Edit', 'এডিট')}</button></div></div>`).join('')}</div>`);
    const tog = (k, i) => { const x = T.find((z) => z.id === i.dataset[k]); x[k] = i.checked; A.commit(`Message "${x.en}" ${k === 'sms' ? 'SMS' : 'WhatsApp'} ${i.checked ? 'on' : 'off'}`); A.toast(i.checked ? t('Turned on', 'চালু হলো') : t('Turned off', 'বন্ধ হলো'), 'good'); A.render(); };
    A.on(el, '[data-sms]', 'change', (e, i) => tog('sms', i));
    A.on(el, '[data-wa]', 'change', (e, i) => tog('wa', i));
    A.on(el, '[data-ed]', 'click', (e, b) => {
      const x = T.find((z) => z.id === b.dataset.ed);
      const m = U().modal(t(x.en, x.bn), `<textarea class="inp" id="te-x" rows="4">${A.esc(x.text)}</textarea><div class="row small"><span class="muted">${t('Insert:', 'যোগ করুন:')}</span>${Object.keys(VARS).map((k) => `<button class="chip" data-v="${k}">${t(VARS[k][0], VARS[k][1])}</button>`).join('')}</div><div class="lbl">${t('Preview', 'প্রিভিউ')}</div><div class="card flat tight" id="te-p" style="background:var(--card2)"></div><div class="muted small" id="te-c"></div>`,
        { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="te-ok">${t('Save', 'সেভ')}</button>` });
      const ta = m.querySelector('#te-x');
      const upd = () => { const s = sample(ta.value); m.querySelector('#te-p').textContent = s; const n = [...s].length; const uni = /[^\x00-\x7F]/.test(s); const parts = n <= (uni ? 70 : 160) ? 1 : Math.ceil(n / (uni ? 67 : 153)); m.querySelector('#te-c').textContent = t(`${n} letters · ${parts} SMS per customer`, `${n} অক্ষর · কাস্টমারপ্রতি ${parts}টি SMS`); };
      ta.oninput = upd; upd();
      m.querySelectorAll('[data-v]').forEach((c) => (c.onclick = () => { const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + `{${c.dataset.v}}` + ta.value.slice(p); upd(); ta.focus(); }));
      m.parentElement.querySelector('#te-ok').onclick = () => { if (!ta.value.trim()) { A.toast(t('Message cannot be empty', 'মেসেজ খালি রাখা যাবে না'), 'bad'); return; } x.text = ta.value.trim(); U().close(); A.commit(`Message template "${x.en}" edited`); A.toast(t('Message saved', 'মেসেজ সেভ হয়েছে'), 'good'); A.render(); };
    });
  }
  /* ================= Security ================= */
  function renderSecurity(el) {
    const set = S(); const fails = set.logins.filter((l) => !l.ok).length;
    el.innerHTML = A.pageHead(t('Security', 'নিরাপত্তা'), t('Keep the admin safe: 2-step login, who signed in, open sessions and blocked addresses.', 'অ্যাডমিন নিরাপদ রাখুন: 2-ধাপের লগইন, কে ঢুকেছেন, খোলা সেশন আর ব্লক করা ঠিকানা।')) +
      `<div class="grid g3">
        ${U().card('', `<div class="row between" style="flex-wrap:nowrap"><div><b>${t('2-step login required', '2-ধাপের লগইন বাধ্যতামূলক')}</b><div class="muted small">${t('Everyone types a code from their phone after the password.', 'পাসওয়ার্ডের পরে সবাই ফোনের একটা কোড দেন।')}</div></div>${U().switch('sc-2fa', set.force2fa)}</div>`)}
        ${U().card('', U().kpi({ label: t('Failed sign-ins (24 h)', 'ব্যর্থ লগইন (24 ঘণ্টা)'), value: fails, sub: fails ? t('from outside Bangladesh', 'বাংলাদেশের বাইরে থেকে') : '' }))}
        ${U().card('', U().kpi({ label: t('Open sessions', 'খোলা সেশন'), value: set.sessions.length }))}
      </div>
      <div class="grid g2">
        ${U().card(t('Sign-in history', 'লগইনের ইতিহাস'), U().table([
          { h: t('Who', 'কে'), f: (l) => `<b>${A.esc(l.who === '—' ? t('Unknown', 'অজানা') : l.who)}</b><div class="muted small">${A.esc(l.dev)}</div>` },
          { h: t('Where', 'কোথা থেকে'), f: (l) => `<span class="small">${A.esc(l.place === 'Outside Bangladesh' ? t('Outside Bangladesh', 'বাংলাদেশের বাইরে') : l.place)}${l.ip ? `<br><span class="mono muted">${l.ip}</span>` : ''}</span>`, hide: 1 },
          { h: t('When', 'কখন'), f: (l) => `<span class="small">${F().ago(l.when)}</span>` },
          { h: '', r: 1, f: (l) => (l.ok ? U().badge(t('OK', 'ঠিক'), 'good') : U().badge(t('Wrong password', 'ভুল পাসওয়ার্ড'), 'bad') + (l.ip && !set.blocked.some((b) => b.ip === l.ip) ? ` <button class="btn sm" data-blk="${l.ip}">${t('Block', 'ব্লক')}</button>` : '')) },
        ], set.logins))}
        <div class="stack">
          ${U().card(t('Signed in now', 'এখন লগইন আছে'), `<div class="list">${set.sessions.map((s) => `<div class="li"><div class="grow"><b>${A.esc(s.who)}</b>${s.me ? ' ' + U().badge(t('This device', 'এই ডিভাইস'), 'info') : ''}<div class="muted small">${A.esc(s.dev)} · ${A.esc(s.place)} · ${t('since', 'থেকে')} ${F().ago(s.since)}</div></div>${s.me ? '' : `<button class="btn sm" data-out="${s.id}">${t('Sign out', 'সাইন-আউট')}</button>`}</div>`).join('')}</div>`)}
          ${U().card(t('Blocked addresses', 'ব্লক করা ঠিকানা'), (set.blocked.length ? `<div class="list">${set.blocked.map((b) => `<div class="li"><div class="grow"><span class="mono">${A.esc(b.ip)}</span><div class="muted small">${A.esc(b.why)} · ${F().ago(b.when)}</div></div><button class="btn sm" data-unb="${A.esc(b.ip)}">${t('Unblock', 'আনব্লক')}</button></div>`).join('')}</div>` : U().empty(t('No blocked addresses', 'কোনো ব্লক নেই'))) + `<div class="hint" style="margin-top:8px">${t('An address is blocked by itself after 10 wrong passwords in 10 minutes. Staff accounts are never locked — only that address waits.', '10 মিনিটে 10 বার ভুল পাসওয়ার্ড দিলে ঠিকানা নিজে থেকেই ব্লক হয়। স্টাফের অ্যাকাউন্ট কখনো লক হয় না — শুধু ওই ঠিকানা অপেক্ষা করে।')}</div>`)}
        </div>
      </div>`;
    el.querySelector('#sc-2fa').onchange = (e) => {
      if (e.target.checked) { set.force2fa = true; const no = A.D.staff.filter((s) => !s.twofa).map((s) => s.name); A.commit('2-step login required for everyone'); A.toast(no.length ? t(`On — ${no.join(', ')} will set it up at next sign-in`, `চালু — ${no.join(', ')} পরের লগইনে সেট করবেন`) : t('On for everyone', 'সবার জন্য চালু'), 'good'); A.render(); }
      else { e.target.checked = true; pinAsk(t('Turn off 2-step login?', '2-ধাপের লগইন বন্ধ করবেন?'), t('Staff could sign in with a password only. Not recommended.', 'স্টাফ শুধু পাসওয়ার্ড দিয়ে ঢুকতে পারবেন। ঠিক নয়।'), t('Turn off', 'বন্ধ করুন'), () => { set.force2fa = false; A.commit('2-step login no longer required'); A.toast(t('2-step login is now optional', '2-ধাপের লগইন এখন ঐচ্ছিক'), 'good'); A.render(); }, true); }
    };
    A.on(el, '[data-out]', 'click', (e, b) => { const s = set.sessions.find((x) => x.id === b.dataset.out); set.sessions = set.sessions.filter((x) => x !== s); A.commit(`Signed out ${s.who} (${s.dev})`); A.toast(t(`${s.who} signed out on ${s.dev}`, `${s.dev}-এ ${s.who} সাইন-আউট হলেন`), 'good'); A.render(); });
    A.on(el, '[data-unb]', 'click', (e, b) => U().confirm(t('Unblock this address?', 'এই ঠিকানা আনব্লক করবেন?'), A.esc(b.dataset.unb), t('Unblock', 'আনব্লক'), () => { set.blocked = set.blocked.filter((x) => x.ip !== b.dataset.unb); A.commit(`Unblocked ${b.dataset.unb}`); A.toast(t('Unblocked', 'আনব্লক হয়েছে'), 'good'); A.render(); }));
    A.on(el, '[data-blk]', 'click', (e, b) => pinAsk(t('Block this address?', 'এই ঠিকানা ব্লক করবেন?'), t(`<span class="mono">${b.dataset.blk}</span> will not be able to open the admin sign-in page.`, `<span class="mono">${b.dataset.blk}</span> আর অ্যাডমিন লগইন পেজ খুলতে পারবে না।`), t('Block', 'ব্লক'), () => { set.blocked.unshift({ ip: b.dataset.blk, why: 'Blocked by owner after wrong passwords', when: A.TODAY.toISOString() }); A.commit(`Blocked ${b.dataset.blk}`); A.toast(t('Address blocked', 'ঠিকানা ব্লক হয়েছে'), 'good'); A.render(); }, true));
  }

  /* ERP: big plain-language status card + problems with what to do */
  function heroErp(E, healthy, ev) {
    const bad = ev.filter((e) => !e.ok).slice(0, 3);
    const plain = (e) => ({ stock: ['Stock did not arrive once', 'একবার স্টক আসেনি', 'It retried by itself 5 minutes later. Nothing to do unless it repeats.', '5 মিনিট পরে নিজে আবার চেষ্টা করেছে। বারবার না হলে কিছু করতে হবে না।'], order: ['An order could not reach the ERP', 'একটা অর্ডার ERP-তে যায়নি', 'It waits and is sent again every 5 minutes. If it is still waiting after 1 hour, press "Test connection".', 'অপেক্ষায় থাকে, প্রতি 5 মিনিটে আবার পাঠানো হয়। 1 ঘণ্টা পরেও আটকে থাকলে "কানেকশন টেস্ট" চাপুন।'] }[e.kind] || ['The ERP did not answer once', 'ERP একবার উত্তর দেয়নি', 'Retried by itself. If the light stays yellow for an hour, call the ERP admin.', 'নিজে আবার চেষ্টা করেছে। এক ঘণ্টা হলুদ থাকলে ERP অ্যাডমিনকে ফোন করুন।']);
    return `<div class="set-hero"><span class="set-dot ${healthy ? '' : 'warn'}"></span><div class="grow"><div class="big">${E.connected ? t('Connected', 'যুক্ত আছে') : t('Not connected', 'যুক্ত নয়')} · ${t('last sync', 'শেষ সিঙ্ক')} ${F().ago(E.lastStockSync)}</div><div class="muted small">${A.esc(E.company)} · ${E.mode === 'demo' ? t('practice ERP', 'প্র্যাকটিস ERP') : t('live ERP', 'লাইভ ERP')} · ${t('If the ERP is down, nothing is lost — orders wait and go by themselves when it is back.', 'ERP বন্ধ থাকলে কিছু হারায় না — অর্ডার অপেক্ষা করে, ফিরলে নিজে যায়।')}</div></div><button class="btn primary erp-test" style="font-size:15px;padding:10px 18px">${I('check')}${t('Test connection', 'কানেকশন টেস্ট')}</button></div>` +
      (bad.length ? U().card(t('Problems, in plain words', 'সমস্যা, সহজ কথায়'), `<div class="list">${bad.map((e) => { const p = plain(e); return `<div class="li" style="align-items:flex-start"><span class="set-dot warn" style="width:10px;height:10px;margin-top:5px"></span><div class="grow"><b>${t(p[0], p[1])}</b> <span class="muted small">${F().ago(e.t)}</span><div class="small">${t('What to do', 'কী করবেন')}: ${t(p[2], p[3])}</div></div><a class="linkbtn small" href="${A.href('settings', 'manual')}" data-man="erp">${t('Manual', 'ম্যানুয়াল')}</a></div>`; }).join('')}</div>`) : '') + '<div style="height:14px"></div>';
  }

  /* ---------------- guides: What · Why · How · Buttons · Common mistakes · What happens next ---------------- */
  const G = (w, y, h, b, m, n) => ({
    en: `<p><b>What:</b> ${w[0]}</p><p><b>Why:</b> ${y[0]}</p><p><b>How:</b> ${h[0]}</p><p><b>Buttons:</b> ${b[0]}</p><p><b>Common mistakes:</b> ${m[0]}</p><p><b>What happens next:</b> ${n[0]}</p>`,
    bn: `<p><b>কী:</b> ${w[1]}</p><p><b>কেন:</b> ${y[1]}</p><p><b>কীভাবে:</b> ${h[1]}</p><p><b>বোতাম:</b> ${b[1]}</p><p><b>সাধারণ ভুল:</b> ${m[1]}</p><p><b>এরপর কী হয়:</b> ${n[1]}</p>`,
  });
  const GUIDES = {
    demo: G(['sample products that fill every category, sub-category and sub-sub-category; one master switch, a switch per part of the tree, counts of demo and real products, and the shop pop-up text.', 'নমুনা প্রোডাক্ট যা প্রতিটা ক্যাটাগরি, সাব-ক্যাটাগরি ও তার নিচের ভাগ ভরায়; একটা মূল সুইচ, ট্রির প্রতিটা অংশে সুইচ, ডেমো ও আসল প্রোডাক্টের সংখ্যা, আর দোকানের পপ-আপের লেখা।'], ['a new shop with 3 jackets looks empty. Example: Jackets › Bomber has no real product yet — demo items fill it until the factory delivers.', 'নতুন দোকানে 3টা জ্যাকেট থাকলে ফাঁকা লাগে। যেমন: জ্যাকেট › Bomber-এ এখনো আসল প্রোডাক্ট নেই — ফ্যাক্টরি মাল দেওয়া পর্যন্ত ডেমো ভরিয়ে রাখে।'], ['turn off a part of the tree when enough real products are there, or turn on “Hide by itself” with a number. Add product also asks at the last step.', 'যথেষ্ট আসল প্রোডাক্ট হলে ট্রির সেই অংশ বন্ধ করুন, বা সংখ্যা দিয়ে “নিজে লুকাবে” চালু করুন। Add product-এর শেষ ধাপেও জিজ্ঞেস করে।'], ['master switch · tree switches · Hide by itself · Save · See demo products.', 'মূল সুইচ · ট্রির সুইচ · নিজে লুকাবে · সেভ · ডেমো প্রোডাক্ট দেখুন।'], ['leaving demo on in a full category — customers tap a design that is not for sale.', 'ভরা ক্যাটাগরিতে ডেমো চালু রাখা — কাস্টমার এমন ডিজাইনে চাপেন যা বিক্রি হয় না।'], ['the shop updates at once; demo items never reach Google, ads, stock, reports, money or the ERP.', 'দোকান সাথে সাথে বদলায়; ডেমো কখনো গুগল, বিজ্ঞাপন, স্টক, রিপোর্ট, হিসাব বা ERP-তে যায় না।']),
    store: G(['your shop’s legal details, addresses, contact, logo set, invoice and sticker text, order numbers, VAT and targets.', 'দোকানের আইনি তথ্য, ঠিকানা, যোগাযোগ, লোগো সেট, ইনভয়েস ও স্টিকারের লেখা, অর্ডার নম্বর, ভ্যাট ও টার্গেট।'], ['they print on invoices, stickers and policy pages. Example: the complaint officer’s name must show on the Terms page under Bangladesh e-commerce rules.', 'এগুলো ইনভয়েস, স্টিকার ও পলিসি পেজে ছাপা হয়। যেমন: বাংলাদেশের ই-কমার্স নিয়মে অভিযোগ কর্মকর্তার নাম শর্তাবলি পেজে থাকতে হয়।'], ['change any box, then press “Save changes”. Turn “Show VAT” on only when you have a BIN.', 'যেকোনো ঘর বদলে “পরিবর্তন সেভ” চাপুন। BIN থাকলে তবেই “ভ্যাট দেখান” চালু করুন।'], ['Save changes · Pin warehouse on map · Preview sticker · Replace (logo) · Show VAT · Holiday mode.', 'পরিবর্তন সেভ · ম্যাপে গুদাম পিন · স্টিকার প্রিভিউ · বদলান (লোগো) · ভ্যাট দেখান · ছুটির মোড।'], ['leaving the warehouse address as the office — couriers then go to the wrong place; forgetting the licence expiry date.', 'গুদামের ঠিকানায় অফিসের ঠিকানা রাখা — কুরিয়ার ভুল জায়গায় যায়; লাইসেন্সের মেয়াদ না দেওয়া।'], ['new invoices, stickers and policy pages use the new details at once; targets show on Home and in the 22:00 report.', 'নতুন ইনভয়েস, স্টিকার ও পলিসি পেজ সাথে সাথে নতুন তথ্য নেয়; টার্গেট ড্যাশবোর্ড ও রাত 22:00-র রিপোর্টে দেখায়।']),
    erp: G(['the link to the Extas ERP: a big status light, problems in plain words, what moves each way and a log.', 'Extas ERP-র সাথে সংযোগ: বড় অবস্থা-বাতি, সহজ কথায় সমস্যা, কোন দিকে কী যায়, আর লগ।'], ['the ERP owns stock and buying price. Example: when a parcel goes to Pathao, the ERP bills the shop at buying price.', 'স্টক ও কেনা দাম ERP-র। যেমন: পার্সেল Pathao-তে গেলে ERP কেনা দামে দোকানকে বিল করে।'], ['green = all good. Yellow = read the problem card; most fix themselves. Press “Test connection” any time.', 'সবুজ = সব ঠিক। হলুদ = সমস্যার কার্ড পড়ুন; বেশিরভাগ নিজে ঠিক হয়। যেকোনো সময় “কানেকশন টেস্ট” চাপুন।'], ['Test connection · Sync stock now · Import products · Save matching · Change ERP connection (PIN).', 'কানেকশন টেস্ট · এখনই স্টক সিঙ্ক · প্রোডাক্ট ইমপোর্ট · সেভ · ERP কানেকশন বদলান (PIN)।'], ['switching to the practice ERP and forgetting to switch back — real orders then wait.', 'প্র্যাকটিস ERP-তে গিয়ে ফেরাতে ভুলে যাওয়া — তখন আসল অর্ডার আটকে থাকে।'], ['orders waiting are sent by themselves when the link is back; you get a Telegram note if it stays down for an hour.', 'সংযোগ ফিরলে অপেক্ষার অর্ডার নিজে যায়; এক ঘণ্টা বন্ধ থাকলে Telegram-এ জানানো হয়।']),
    couriers: G(['courier accounts, what each charges, the one default courier and the pickup place and time.', 'কুরিয়ার অ্যাকাউন্ট, প্রতিটার চার্জ, একটা ডিফল্ট কুরিয়ার, আর পিকআপের জায়গা ও সময়।'], ['courier fees come out of profit on every order. Example: ৳10 cheaper on 300 parcels a month saves ৳3,000.', 'প্রতি অর্ডারে কুরিয়ার চার্জ লাভ থেকে কাটে। যেমন: মাসে 300 পার্সেলে ৳10 কম মানে ৳3,000 বাঁচে।'], ['pick the default courier and pickup, press Save. Use “Fees” when a courier sends a new rate card.', 'ডিফল্ট কুরিয়ার ও পিকআপ বেছে সেভ চাপুন। কুরিয়ার নতুন রেট দিলে “চার্জ” ব্যবহার করুন।'], ['Fees (PIN) · Connect · Disconnect · Save · Auto-booking.', 'চার্জ (PIN) · যুক্ত করুন · বিচ্ছিন্ন · সেভ · অটো-বুকিং।'], ['disconnecting the default courier — pick another default first.', 'ডিফল্ট কুরিয়ার বিচ্ছিন্ন করা — আগে অন্য ডিফল্ট বাছুন।'], ['confirmed orders are booked with the default courier by themselves; profit figures use the new fees.', 'কনফার্ম অর্ডার নিজে ডিফল্ট কুরিয়ারে বুক হয়; লাভের হিসাবে নতুন চার্জ ধরা হয়।']),
    payments: G(['bKash, Nagad and card payments at checkout, and which account each one’s money lands in.', 'চেকআউটে bKash, Nagad ও কার্ড পেমেন্ট, আর প্রতিটার টাকা কোন অ্যাকাউন্টে আসে।'], ['so every taka can be matched. Example: bKash money lands in DBBL the next working day; Finance checks it arrived.', 'যাতে প্রতিটা টাকা মেলানো যায়। যেমন: bKash-এর টাকা পরের কর্মদিবসে DBBL-এ আসে; হিসাব দেখে টাকা এসেছে কিনা।'], ['switch a method on or off; pick the account; press Save (PIN).', 'পেমেন্ট চালু/বন্ধ করুন; অ্যাকাউন্ট বাছুন; সেভ চাপুন (PIN)।'], ['Test · Save · Set up in Keys.', 'টেস্ট · সেভ · কি-তে সেটআপ।'], ['turning a method on before its key works — set it up in Keys first.', 'কি কাজ করার আগে পেমেন্ট চালু করা — আগে কি-তে সেটআপ করুন।'], ['checkout shows only the methods that are on; Finance matches payments to these accounts.', 'চেকআউটে শুধু চালু পেমেন্টগুলো দেখায়; হিসাব এই অ্যাকাউন্টের সাথে মেলায়।']),
    messages: G(['the SMS and WhatsApp texts customers get at each order step.', 'অর্ডারের প্রতি ধাপে কাস্টমার যে SMS ও WhatsApp পান।'], ['a clear “handed to Pathao, tracking PTH…” cuts “where is my parcel?” calls.', 'পরিষ্কার “Pathao-তে দেওয়া হয়েছে, ট্র্যাকিং PTH…” থাকলে “পার্সেল কোথায়?” কল কমে।'], ['switch SMS or WhatsApp per message; “Edit” to change words; blue boxes fill in by themselves.', 'প্রতি মেসেজে SMS বা WhatsApp চালু/বন্ধ; লেখা বদলাতে “এডিট”; নীল ঘর নিজে বসে।'], ['SMS / WhatsApp switches · Edit · Save.', 'SMS / WhatsApp সুইচ · এডিট · সেভ।'], ['very long Bengali SMS — 70 letters = 1 SMS, so cost doubles quickly.', 'অনেক লম্বা বাংলা SMS — 70 অক্ষর = 1 SMS, তাই খরচ দ্রুত দ্বিগুণ হয়।'], ['the next order step sends the new text.', 'পরের অর্ডার ধাপ থেকে নতুন লেখা যায়।']),
    team: G(['staff, their roles, a tick-box tree of which pages each role can open, and each person’s activity.', 'স্টাফ, তাঁদের রোল, কোন রোল কোন পেজ খুলতে পারবে তার টিক-বক্স ট্রি, আর প্রত্যেকের কাজ।'], ['packing staff should not see buying prices or profit. Example: Sohel (Packing) sees only This batch and To pack.', 'প্যাকিং স্টাফের কেনা দাম বা লাভ দেখার দরকার নেই। যেমন: সোহেল (প্যাকিং) শুধু এই ব্যাচ ও প্যাক বাকি দেখেন।'], ['pick a role chip, tick pages (a half box = some pages), press “Save changes” (PIN). Tap a person for role and activity.', 'রোল চিপ বাছুন, পেজে টিক দিন (অর্ধেক বক্স = কিছু পেজ), “পরিবর্তন সেভ” (PIN)। রোল ও কাজ দেখতে কারো নামে চাপুন।'], ['Invite staff · New role · Back to default · Save changes · Turn off access.', 'স্টাফ যোগ · নতুন রোল · ডিফল্টে ফেরান · পরিবর্তন সেভ · অ্যাক্সেস বন্ধ।'], ['sharing one login between two people — then the log cannot tell who did what.', 'দুজন একই লগইন ব্যবহার করা — তখন লগে বোঝা যায় না কে কী করেছে।'], ['staff see their new access on the next page they open; System pages stay owner-only.', 'পরের পেজ খুললেই স্টাফ নতুন অ্যাক্সেস পান; সিস্টেম পেজ শুধু মালিকের থাকে।']),
    keys: G(['every outside service key in one locked place: couriers, payments, SMS, WhatsApp, ads, Google, Drive, Telegram, AI.', 'সব বাইরের সার্ভিসের কি এক তালাবদ্ধ জায়গায়: কুরিয়ার, পেমেন্ট, SMS, WhatsApp, বিজ্ঞাপন, গুগল, ড্রাইভ, Telegram, AI।'], ['a key sent in chat can be stolen. Example: TikTok’s key expired — the red card tells you before ads stop reporting.', 'চ্যাটে পাঠানো কি চুরি হতে পারে। যেমন: TikTok-এর কি মেয়াদ শেষ — বিজ্ঞাপনের রিপোর্ট থামার আগে লাল কার্ড জানিয়ে দেয়।'], ['press “Add key” or “Replace”, paste the key from the service’s panel, “Check & save”, PIN.', '“কি দিন” বা “বদলান” চাপুন, সার্ভিসের প্যানেল থেকে কি পেস্ট করুন, “যাচাই করে সেভ”, PIN।'], ['Test · Add key · Replace.', 'টেস্ট · কি দিন · বদলান।'], ['sending a key to a developer on WhatsApp; leaving an expired key red for days.', 'WhatsApp-এ ডেভেলপারকে কি পাঠানো; মেয়াদ শেষ কি দিনের পর দিন লাল রেখে দেওয়া।'], ['the service starts working at once; a service with no key simply stays hidden on the shop.', 'সার্ভিস সাথে সাথে চালু হয়; যার কি নেই তা দোকানে শুধু লুকানো থাকে।']),
    backups: G(['full copies of the shop on the server and in your Google Drive, the schedule, restore and the monthly drill.', 'সার্ভারে ও গুগল ড্রাইভে দোকানের পুরো কপি, সময়সূচি, রিস্টোর ও মাসিক মহড়া।'], ['if the server breaks, the shop comes back from the newest copy. The drill proves the copy really opens.', 'সার্ভার নষ্ট হলে সর্বশেষ কপি থেকে দোকান ফেরে। মহড়া প্রমাণ করে কপি সত্যিই খোলে।'], ['leave the schedule at twice a day. Press “Back up now” before big changes.', 'সময়সূচি দিনে 2 বার রাখুন। বড় পরিবর্তনের আগে “এখনই ব্যাকআপ” চাপুন।'], ['Back up now · Save schedule · Run drill now · Restore guide (PDF) · Restore (PIN).', 'এখনই ব্যাকআপ · সময়সূচি সেভ · এখনই মহড়া · রিস্টোর গাইড (PDF) · রিস্টোর (PIN)।'], ['restoring to undo one small mistake — fix that one thing instead; a restore takes the whole shop back.', 'একটা ছোট ভুল ঠিক করতে রিস্টোর করা — শুধু ওটাই ঠিক করুন; রিস্টোর পুরো দোকান পিছিয়ে দেয়।'], ['a failed backup sends a Telegram alert; restore takes a safety copy first.', 'ব্যাকআপ ব্যর্থ হলে Telegram অ্যালার্ট যায়; রিস্টোর আগে নিরাপত্তা কপি নেয়।']),
    health: G(['lights for uptime, phone speed, errors, the nightly page check, ERP, domain and SSL, plus server room.', 'চালু থাকা, ফোনে গতি, সমস্যা, রাতের পেজ চেক, ERP, ডোমেইন ও SSL-এর বাতি, আর সার্ভারের জায়গা।'], ['you should hear about a problem before a customer does.', 'কাস্টমারের আগে আপনার সমস্যার কথা জানা দরকার।'], ['green = nothing to do. “Optimise now” is safe any time. “AI Diagnose” explains a yellow or red light.', 'সবুজ = কিছু করতে হবে না। “এখনই অপটিমাইজ” যেকোনো সময় নিরাপদ। হলুদ বা লাল বাতি “AI দিয়ে খুঁজুন” বুঝিয়ে দেয়।'], ['AI Diagnose · Optimise now · Telegram alert switch · check schedule.', 'AI দিয়ে খুঁজুন · এখনই অপটিমাইজ · Telegram অ্যালার্ট সুইচ · চেকের সময়।'], ['turning off Telegram alerts — then nobody hears about a night-time problem.', 'Telegram অ্যালার্ট বন্ধ করা — তখন রাতের সমস্যা কেউ জানে না।'], ['problems go to Telegram and the inbox; Prohori opens a fix for the team.', 'সমস্যা Telegram ও ইনবক্সে যায়; প্রহরী টিমের জন্য সমাধানের কাজ খোলে।']),
    ai: G(['a quick look at AI: on or off, agents running, this month’s spend and what waits for you. Everything else is in AI Center.', 'AI এক নজরে: চালু না বন্ধ, কতগুলো এজেন্ট চলছে, এই মাসের খরচ আর কী আপনার অপেক্ষায়। বাকি সব AI সেন্টারে।'], ['one place for AI so nothing is set twice. Example: to pause Tirondaj, go to AI Center › AI agents.', 'AI-এর জন্য এক জায়গা, যাতে কিছু দুবার সেট করতে না হয়। যেমন: তীরন্দাজ পজ করতে AI সেন্টার › AI এজেন্ট-এ যান।'], ['press Open AI Center or one of the four cards.', '“AI সেন্টার খুলুন” বা চারটা কার্ডের একটায় চাপুন।'], ['Open AI Center · Approvals · AI agents · Costs & limits · Training.', 'AI সেন্টার খুলুন · অনুমোদন · AI এজেন্ট · খরচ ও সীমা · ট্রেনিং।'], ['looking for agent switches here — they moved to AI Center.', 'এজেন্টের সুইচ এখানে খোঁজা — সেগুলো AI সেন্টারে গেছে।'], ['nothing changes on this card; it only shows and links.', 'এই কার্ডে কিছু বদলায় না; শুধু দেখায় ও লিংক দেয়।']),
    updates: G(['the version running, what changed in plain words, the auto-update switch and going back a version.', 'কোন ভার্সন চলছে, সহজ কথায় কী বদলেছে, অটো-আপডেট সুইচ, আর আগের ভার্সনে ফেরা।'], ['updates arrive often; you should know what changed and be able to undo it.', 'আপডেট প্রায়ই আসে; কী বদলেছে জানা আর ফেরানো যাওয়া দরকার।'], ['leave auto-update on. If something looks wrong after an update, press “Go back to previous version”.', 'অটো-আপডেট চালু রাখুন। আপডেটের পর কিছু ভুল লাগলে “আগের ভার্সনে ফিরুন” চাপুন।'], ['Open test shop · Check for updates · Go back to previous version (PIN).', 'টেস্ট দোকান খুলুন · আপডেট আছে কিনা দেখুন · আগের ভার্সনে ফিরুন (PIN)।'], ['going back without telling the team — tell them what to report.', 'টিমকে না জানিয়ে ফেরা — কী জানাতে হবে বলে দিন।'], ['orders and data stay the same; only screens change.', 'অর্ডার ও ডেটা একই থাকে; শুধু স্ক্রিন বদলায়।']),
    security: G(['2-step login, sign-in history, open sessions and blocked addresses.', '2-ধাপের লগইন, লগইনের ইতিহাস, খোলা সেশন আর ব্লক করা ঠিকানা।'], ['one stolen password could expose every customer’s phone and address.', 'একটা চুরি হওয়া পাসওয়ার্ডে সব কাস্টমারের ফোন ও ঠিকানা বেরিয়ে যেতে পারে।'], ['turn on “2-step login required”; sign out a lost phone; block a strange address (PIN).', '“2-ধাপের লগইন বাধ্যতামূলক” চালু করুন; হারানো ফোন সাইন-আউট করুন; অচেনা ঠিকানা ব্লক করুন (PIN)।'], ['2-step switch · Sign out · Block · Unblock.', '2-ধাপের সুইচ · সাইন-আউট · ব্লক · আনব্লক।'], ['blocking your own office address after typing a wrong password.', 'ভুল পাসওয়ার্ড দিয়ে নিজের অফিসের ঠিকানা ব্লক করা।'], ['staff without 2-step set it up at their next sign-in.', 'যাঁদের 2-ধাপ নেই তাঁরা পরের লগইনে সেট করবেন।']),
    activity: G(['who changed what, and who looked at customer phone numbers and addresses.', 'কে কী বদলেছেন, আর কে কাস্টমারের ফোন নম্বর ও ঠিকানা দেখেছেন।'], ['to answer “who did this?” quickly. Example: a delivery fee changed — the log shows who and when.', '“কে করল?” দ্রুত জানতে। যেমন: ডেলিভারি চার্জ বদলেছে — লগে দেখায় কে, কখন।'], ['pick a person chip or type in the search box.', 'কারো নামের চিপ বাছুন বা খোঁজার ঘরে লিখুন।'], ['search · person chips · Download.', 'খোঁজ · নামের চিপ · ডাউনলোড।'], ['expecting to edit the log — it can never be changed, on purpose.', 'লগ এডিট করতে চাওয়া — ইচ্ছা করেই এটা কখনো বদলানো যায় না।'], ['nothing changes; it is a record only.', 'কিছু বদলায় না; এটা শুধু রেকর্ড।']),
    privacy: G(['exports, customers’ copy and erase requests, how long media and chats are kept, importing old customers, and “my own data”.', 'এক্সপোর্ট, কাস্টমারের কপি ও মুছে ফেলার অনুরোধ, ছবি ও চ্যাট কতদিন থাকে, পুরনো কাস্টমার আনা, আর “আমার নিজের ডেটা”।'], ['customers can ask what you hold about them. Example: a customer asks to be erased — orders stay for accounts, personal details go.', 'কাস্টমার জানতে চাইতে পারেন আপনার কাছে তাঁর কী তথ্য আছে। যেমন: কেউ মুছতে বললে — অর্ডার হিসাবে থাকে, ব্যক্তিগত তথ্য যায়।'], ['answer requests within 30 days; export with PIN for customer lists.', '30 দিনের মধ্যে অনুরোধের উত্তর দিন; কাস্টমার তালিকা এক্সপোর্টে PIN।'], ['Send copy · Erase (PIN) · Export · Save · Choose file · Sample sheet.', 'কপি পাঠান · মুছুন (PIN) · এক্সপোর্ট · সেভ · ফাইল বাছুন · নমুনা শিট।'], ['emailing an exported customer file — keep it on your computer only.', 'এক্সপোর্ট করা কাস্টমার ফাইল ইমেইলে পাঠানো — শুধু নিজের কম্পিউটারে রাখুন।'], ['every export and erase is written in the activity log.', 'প্রতিটা এক্সপোর্ট ও মুছে ফেলা অ্যাক্টিভিটি লগে লেখা থাকে।']),
    telegram: G(['the Telegram bot: daily 22:00 report, alerts, allowed accounts and commands.', 'Telegram বট: প্রতিদিন রাত 22:00-র রিপোর্ট, অ্যালার্ট, অনুমতিপ্রাপ্ত অ্যাকাউন্ট ও কমান্ড।'], ['you can run the shop from your phone. Example: send /report at a wedding and see today’s sales.', 'ফোন থেকেই দোকান চালাতে পারেন। যেমন: বিয়েবাড়িতে বসে /report পাঠিয়ে আজকের বিক্রি দেখুন।'], ['press “Add a phone”, send the code to the bot within 10 minutes.', '“ফোন যোগ করুন” চাপুন, 10 মিনিটের মধ্যে কোডটা বটে পাঠান।'], ['Send test message · Preview tonight’s report · Add a phone · Remove (PIN) · alert switches.', 'টেস্ট মেসেজ পাঠান · আজ রাতের রিপোর্ট প্রিভিউ · ফোন যোগ করুন · সরান (PIN) · অ্যালার্ট সুইচ।'], ['adding a staff member’s Telegram and forgetting to remove it when they leave.', 'স্টাফের Telegram যোগ করে চলে যাওয়ার পর সরাতে ভুলে যাওয়া।'], ['the report arrives every night; alerts arrive the moment something breaks.', 'রিপোর্ট প্রতি রাতে আসে; কিছু ভাঙলেই সাথে সাথে অ্যালার্ট আসে।']),
    manual: G(['the searchable Site Manual made from every page’s guide, plus the project files (Blueprint, PR register, approved demo).', 'প্রতিটা পেজের গাইড দিয়ে বানানো খোঁজা যায় এমন সাইট ম্যানুয়াল, আর প্রজেক্ট ফাইল (ব্লুপ্রিন্ট, PR রেজিস্টার, অনুমোদিত ডেমো)।'], ['a new staff member can learn the admin alone. The AI helper reads the same manual.', 'নতুন স্টাফ একাই অ্যাডমিন শিখতে পারেন। AI সহকারীও একই ম্যানুয়াল পড়ে।'], ['type a word like “exchange”, open a page’s guide, press “Open this page”.', '“এক্সচেঞ্জ”-এর মতো শব্দ লিখুন, পেজের গাইড খুলুন, “এই পেজ খুলুন” চাপুন।'], ['search · section chips · Open this page · Admin map · Download PDF · Read.', 'খোঁজ · সেকশন চিপ · এই পেজ খুলুন · অ্যাডমিন ম্যাপ · PDF ডাউনলোড · পড়ুন।'], ['typing a full sentence — one or two words find more.', 'পুরো বাক্য লেখা — এক-দুই শব্দে বেশি পাওয়া যায়।'], ['the manual rebuilds itself after every update.', 'প্রতিটা আপডেটের পর ম্যানুয়াল নিজে আবার তৈরি হয়।']),
  };

  const R = { store: renderStore, erp: renderErp, couriers: renderCouriers, payments: renderPayments, messages: renderMsgs, team: renderTeam, demo: renderDemo, keys: renderKeys, backups: renderBackups, health: renderHealth, ai: renderAi, updates: renderUpdates, security: renderSecurity, activity: renderActivity, privacy: renderPrivacy, telegram: renderTelegram, manual: renderManual };
  const reg = {};
  ITEMS.forEach((x) => { reg[x.id] = { render: (el) => frame(el, x.id, R[x.id]), guide: GUIDES[x.id] }; });
  reg.system = { render: (el) => frame(el, 'health', R.health), guide: GUIDES.health }; // old address
  A.mod('settings', reg);
})();
