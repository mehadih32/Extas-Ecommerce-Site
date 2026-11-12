/* EXTAS admin prototype — core: store, sample data (60 days), business maths, UI helpers, charts, router, shell.
   Every module registers with A.mod(sectionId, { tabId: { render(el, ctx), guide: {en, bn} } }). */
(function () {
  'use strict';
  const A = (window.A = window.A || {});
  A.version = 'proto-5';
  A.TODAY = new Date('2026-11-12T20:00:00+06:00');
  const DAY = 864e5;
  const KEY = 'extas-admin-proto-v1';

  /* ---------------- language ---------------- */
  A.lang = 'en';
  try { A.lang = localStorage.getItem(KEY + ':lang') || 'en'; } catch (e) {}
  A.t = (en, bn) => (A.lang === 'bn' && bn ? bn : en);
  A.setLang = (l) => { A.lang = l; try { localStorage.setItem(KEY + ':lang', l); } catch (e) {} document.body.classList.toggle('bn', l === 'bn'); A.render(); };

  /* ---------------- helpers ---------------- */
  A.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nfIN = new Intl.NumberFormat('en-IN');
  A.fmt = {
    tk: (n) => (n < 0 ? '−৳' : '৳') + nfIN.format(Math.round(Math.abs(n || 0))),
    tkShort: (n) => { const a = Math.abs(n || 0), s = n < 0 ? '−৳' : '৳'; if (a >= 1e7) return s + (a / 1e7).toFixed(2) + ' Cr'; if (a >= 1e5) return s + (a / 1e5).toFixed(2) + ' L'; if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k'; return s + Math.round(a); },
    num: (n) => nfIN.format(Math.round(n || 0)),
    pct: (n, d = 1) => (n == null || !isFinite(n) ? '—' : (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) + '%'),
    date: (d) => { d = new Date(d); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Dhaka' }); },
    dateY: (d) => { d = new Date(d); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' }); },
    time: (d) => { d = new Date(d); return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' }); },
    dt: (d) => A.fmt.date(d) + ', ' + A.fmt.time(d),
    ago: (d) => { const m = Math.round((A.TODAY - new Date(d)) / 6e4); if (m < 1) return A.t('just now', 'এইমাত্র'); if (m < 60) return m + A.t(' min ago', ' মিনিট আগে'); const h = Math.round(m / 60); if (h < 24) return h + A.t(' h ago', ' ঘণ্টা আগে'); const dd = Math.round(h / 24); return dd + A.t(' d ago', ' দিন আগে'); },
    ymd: (d) => { d = new Date(new Date(d).getTime() + 6 * 36e5); return d.toISOString().slice(0, 10); },
  };
  A.delta = (cur, prev, inverse) => {
    if (!prev) return '<span class="delta flat">—</span>';
    const p = (cur - prev) / Math.abs(prev) * 100; const good = inverse ? p < 0 : p > 0;
    const cls = Math.abs(p) < 0.5 ? 'flat' : good ? 'up' : 'down';
    return `<span class="delta ${cls}">${p > 0 ? '▲' : p < 0 ? '▼' : ''} ${Math.abs(p).toFixed(1)}%</span>`;
  };
  A.sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  A.groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
  A.uid = (p) => p + '-' + Math.random().toString(36).slice(2, 8);
  A.byId = (list, id) => list.find((x) => x.id === id);
  A.css = (id, css) => { if (document.getElementById('css-' + id)) return; const st = document.createElement('style'); st.id = 'css-' + id; st.textContent = css; document.head.appendChild(st); };
  A.on = (root, sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(e, el)));

  /* ---------------- seeded random ---------------- */
  let seed = 20261112;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const wpick = (pairs) => { const t = A.sum(pairs, (p) => p[1]); let r = rnd() * t; for (const p of pairs) { if ((r -= p[1]) <= 0) return p[0]; } return pairs[0][0]; };

  /* ---------------- sample data ---------------- */
  const COLORS = { Navy: '#1f2a4d', Black: '#1b1b1b', White: '#f4f4f2', Olive: '#5d6b3a', Maroon: '#6d1f2a', Grey: '#8a8f99', Sky: '#8fb8de', Beige: '#d8c7a6', Bottle: '#1f4d3a', Rust: '#a4502a', Mint: '#a8d5c2', Charcoal: '#3a3d44', Khaki: '#b7a57a', Cream: '#efe6d2', Indigo: '#33407a', Mustard: '#c99a2e' };
  const CATS = [
    { id: 'polo', en: 'Polo shirts', bn: 'পোলো শার্ট', n: 25, price: [850, 1490], code: 'PL', shape: 'top', names: ['Essential Piqué Polo', 'Contrast Collar Polo', 'Jersey Zip Polo', 'Striped Rib Polo', 'Textured Knit Polo', 'Long Sleeve Polo', 'Classic Fit Polo', 'Tipped Polo', 'Waffle Polo', 'Slim Stretch Polo', 'Mercerised Polo', 'Pocket Polo', 'Heritage Polo'] },
    { id: 'tshirt', en: 'T-shirts', bn: 'টি-শার্ট', n: 20, price: [450, 790], code: 'TS', shape: 'top', names: ['Everyday Crew Tee', 'Heavy Cotton Tee', 'Pocket Tee', 'Oversized Tee', 'Henley Tee', 'Raglan Tee', 'Graphic Tee', 'V-neck Tee', 'Striped Tee', 'Organic Tee'] },
    { id: 'shirt', en: 'Shirts', bn: 'শার্ট', n: 15, price: [1150, 1890], code: 'SH', shape: 'top', names: ['Oxford Cotton Shirt', 'Linen Blend Shirt', 'Chambray Shirt', 'Check Flannel Shirt', 'Poplin Formal Shirt', 'Mandarin Collar Shirt', 'Denim Shirt', 'Printed Casual Shirt'] },
    { id: 'panjabi', en: 'Panjabi', bn: 'পাঞ্জাবি', n: 12, price: [1650, 3450], code: 'PJ', shape: 'long', names: ['Classic Cotton Panjabi', 'Embroidered Panjabi', 'Silk Blend Panjabi', 'Kabli Panjabi', 'Festive Jacquard Panjabi', 'Short Panjabi'] },
    { id: 'trouser', en: 'Trousers', bn: 'ট্রাউজার', n: 10, price: [1250, 1750], code: 'TR', shape: 'bottom', names: ['Slim Chino Trousers', 'Relaxed Twill Trousers', 'Formal Trousers', 'Cargo Trousers', 'Stretch Chino'] },
    { id: 'denim', en: 'Denim', bn: 'ডেনিম', n: 8, price: [1590, 2290], code: 'DN', shape: 'bottom', names: ['Slim Fit Jeans', 'Straight Jeans', 'Tapered Jeans', 'Stretch Denim'] },
    { id: 'jogger', en: 'Joggers', bn: 'জগার', n: 8, price: [890, 1290], code: 'JG', shape: 'bottom', names: ['French Terry Jogger', 'Tech Jogger', 'Cargo Jogger', 'Fleece Jogger'] },
    { id: 'hoodie', en: 'Hoodies & sweatshirts', bn: 'হুডি ও সোয়েটশার্ট', n: 10, price: [1450, 2250], code: 'HD', shape: 'top', names: ['Heavyweight Hoodie 320 GSM', 'Zip Hoodie', 'Crew Sweatshirt', 'Half-zip Sweatshirt', 'Fleece Hoodie'] },
    { id: 'jacket', en: 'Jackets', bn: 'জ্যাকেট', n: 4, price: [2450, 3950], code: 'JK', shape: 'top', names: ['Bomber Jacket', 'Denim Jacket', 'Puffer Jacket', 'Shacket'] },
    { id: 'katua', en: 'Katua', bn: 'ফতুয়া', n: 4, price: [790, 1150], code: 'KT', shape: 'top', names: ['Cotton Katua', 'Printed Katua', 'Khadi Katua'] },
    { id: 'extras', en: 'Caps & extras', bn: 'ক্যাপ ও অন্যান্য', n: 4, price: [350, 650], code: 'EX', shape: 'cap', names: ['Baseball Cap', 'Cotton Socks, 3 pairs', 'Boxer, 2 pack', 'Leather-look Belt'] },
  ];
  A.CATS = CATS;
  A.COLORS = COLORS;
  const FN = ['Rahim', 'Karim', 'Sakib', 'Tanvir', 'Rafiq', 'Imran', 'Nayeem', 'Shuvo', 'Arif', 'Hasan', 'Mahmud', 'Fahim', 'Rakib', 'Sajid', 'Tamim', 'Rasel', 'Jubayer', 'Mehedi', 'Asif', 'Sabbir', 'Nafis', 'Ridwan', 'Shakil', 'Rony', 'Zahid', 'Ashik', 'Farhan', 'Anik', 'Shahriar', 'Mizan', 'Nusrat', 'Sadia', 'Farzana', 'Tasnim', 'Mim', 'Riya'];
  const LN = ['Ahmed', 'Hossain', 'Islam', 'Rahman', 'Chowdhury', 'Uddin', 'Khan', 'Mia', 'Sarkar', 'Talukder', 'Sheikh', 'Biswas', 'Das', 'Akter', 'Kabir', 'Haque'];
  const DHAKA = ['Mirpur', 'Uttara', 'Dhanmondi', 'Mohammadpur', 'Gulshan', 'Banani', 'Badda', 'Bashundhara', 'Motijheel', 'Old Dhaka', 'Jatrabari', 'Khilgaon', 'Rampura', 'Tejgaon', 'Farmgate', 'Malibagh'];
  const SUB = [['Gazipur', 'Tongi'], ['Gazipur', 'Board Bazar'], ['Narayanganj', 'Fatullah'], ['Dhaka', 'Savar'], ['Dhaka', 'Keraniganj'], ['Narayanganj', 'Siddhirganj']];
  const OUT = [['Chattogram', 'Agrabad'], ['Chattogram', 'Halishahar'], ['Sylhet', 'Zindabazar'], ['Rajshahi', 'Shaheb Bazar'], ['Khulna', 'Sonadanga'], ['Cumilla', 'Kandirpar'], ['Mymensingh', 'Ganginarpar'], ['Bogura', 'Satmatha'], ['Rangpur', 'Jahaj Company'], ['Barishal', 'Nathullabad'], ['Cox\'s Bazar', 'Kolatoli'], ['Jessore', 'Doratana'], ['Feni', 'Trunk Road'], ['Noakhali', 'Maijdee']];

  function garmentSvg(shape, hex, size = 38) {
    const s = { top: 'M14 8 L20 5 Q24 9 28 5 L34 8 L39 15 L34 18 L33 34 L15 34 L14 18 L9 15 Z', long: 'M15 6 L20 4 Q24 8 28 4 L33 6 L38 14 L34 16 L34 40 L14 40 L14 16 L10 14 Z', bottom: 'M15 6 L33 6 L35 40 L27 40 L24 16 L21 40 L13 40 Z', cap: 'M10 28 Q11 13 24 13 Q37 13 38 28 L42 30 L10 30 Z' }[shape] || '';
    const light = ['#f4f4f2', '#efe6d2', '#d8c7a6', '#a8d5c2', '#8fb8de'].includes(hex);
    return `<svg viewBox="0 0 48 44" width="${size}" height="${size}" aria-hidden="true"><path d="${s}" fill="${hex}" stroke="${light ? '#b9bcc6' : 'rgba(255,255,255,.25)'}" stroke-width="1"/></svg>`;
  }
  A.garmentSvg = garmentSvg;

  function makeData() {
    seed = 20261112;
    const D = { meta: { created: A.TODAY.toISOString(), version: A.version } };
    // ---- products
    const products = []; let n = 1000;
    for (const c of CATS) {
      for (let i = 0; i < c.n; i++) {
        const base = c.names[i % c.names.length];
        const name = i < c.names.length ? base : base + ' ' + ['II', 'Plus', 'Lite', 'Pro', 'Classic'][i % 5];
        const cols = Object.keys(COLORS).sort(() => rnd() - 0.5).slice(0, ri(2, 4));
        const sizes = c.shape === 'bottom' ? ['30', '32', '34', '36', '38'] : c.shape === 'cap' ? ['Free'] : ['S', 'M', 'L', 'XL', 'XXL'];
        const price = Math.round(ri(c.price[0], c.price[1]) / 10) * 10 - 10;
        const cost = Math.round(price * (0.36 + rnd() * 0.12));
        const styleCode = `EXT-${c.code}-${n++}`;
        const variants = [];
        for (const col of cols) for (const sz of sizes) {
          const hot = sz === 'M' || sz === 'L' || sz === '32' || sz === '34';
          variants.push({ sku: `${styleCode}-${col.slice(0, 3).toUpperCase()}-${sz}`, color: col, size: sz, stock: Math.max(0, ri(hot ? 4 : 3, hot ? 26 : 30) - (rnd() < 0.05 ? 30 : 0)), reserved: 0 });
        }
        const idx = products.length;
        const status = idx % 29 === 7 ? 'archived' : idx % 17 === 3 ? 'draft' : idx % 13 === 5 ? 'ready' : 'live';
        const photos = status === 'live' ? ri(3, 7) : ri(0, 3);
        products.push({
          id: 'P' + (100 + idx), styleCode, name, cat: c.id, price, compareAt: rnd() < 0.25 ? Math.round(price * 1.2 / 10) * 10 : null, cost, colors: cols, sizes, variants,
          status, photos, source: rnd() < 0.85 ? 'ERP' : 'Manual', erpSyncedAt: new Date(A.TODAY - ri(5, 70) * 6e4).toISOString(),
          created: new Date(A.TODAY - ri(10, 200) * DAY).toISOString(), fabric: pick(['100% cotton piqué 220 GSM', 'Cotton jersey 180 GSM', 'Cotton-lycra 95/5', 'Linen-cotton 55/45', 'Twill 260 GSM', 'Denim 12 oz', 'French terry 300 GSM', 'Fleece 320 GSM', 'Viscose-cotton']),
          fit: pick(['Regular', 'Slim', 'Relaxed']), desc: '', tags: [], rating: 0, reviews: 0,
          seo: { title: '', desc: '', slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), score: ri(48, 96) },
          pin: false, views30: 0, carts30: 0, sold30: 0, revenue30: 0,
        });
        const p = products[products.length - 1];
        p.desc = `${p.name} in ${p.fabric}. ${p.fit} fit, made for Bangladeshi weather.`;
        p.seo.title = `${p.name} for Men | EXTAS`; p.seo.desc = rnd() < 0.8 ? `Buy ${p.name} online in Bangladesh. ${p.fabric}, sizes ${sizes[0]}–${sizes[sizes.length - 1]}. Cash on delivery, 72-hour exchange.` : '';
      }
    }
    D.products = products;
    // ---- customers
    const customers = [];
    for (let i = 0; i < 420; i++) {
      const name = pick(FN) + ' ' + pick(LN);
      const zone = wpick([['inside', 56], ['sub', 16], ['outside', 28]]);
      const loc = zone === 'inside' ? ['Dhaka', pick(DHAKA)] : zone === 'sub' ? pick(SUB) : pick(OUT);
      customers.push({ id: 'C' + (500 + i), name, phone: '01' + pick(['7', '8', '9', '3', '5', '6']) + String(ri(10000000, 99999999)), district: loc[0], area: loc[1], zone, created: new Date(A.TODAY - ri(5, 400) * DAY).toISOString(), points: 0, wallet: rnd() < 0.08 ? ri(1, 5) * 100 : 0, tags: [], email: rnd() < 0.4 ? name.split(' ')[0].toLowerCase() + ri(10, 99) + '@gmail.com' : '' });
    }
    D.customers = customers;
    // ---- rules (sample values the owner can change)
    D.rules = {
      delivery: { inside: { fee: 80, days: '1–2' }, sub: { fee: 100, days: '2–3' }, outside: { fee: 130, days: '3–5' } },
      freeDelivery: { on: true, over: 3000 },
      cod: { on: true, max: 10000 },
      advance: { on: true, newOver: 4000, type: 'delivery', percent: 20 },
      wallets: { bkash: '01711-000000', nagad: '01811-000000', prepaidOn: false, prepaidOff: 0 },
      exchange: { on: true, hours: 72, who: 'customer', excluded: ['extras'] },
      returns: { on: false, days: 7 },
      buyMore: { on: true, tiers: [{ qty: 2, off: 5 }, { qty: 3, off: 10 }] },
      eid: { on: false, eidDate: '2027-03-10', insideLast: '2027-03-07', outsideLast: '2027-03-05' },
      orderEdit: { maxEdits: 2 },
      fraud: { level: 'normal' },
      notice: { on: true, text: 'Free delivery on orders over ৳3,000', from: '2026-11-01', to: '2026-11-30', popup: false },
    };
    D.coupons = [
      { id: 'CP1', code: 'EXTAS10', type: 'percent', value: 10, min: 1500, maxOff: 300, uses: 0, limit: 500, perCustomer: 1, who: 'all', on: true, ends: '2026-11-30' },
      { id: 'CP2', code: 'WELCOME100', type: 'flat', value: 100, min: 1000, uses: 0, limit: 0, perCustomer: 1, who: 'first', on: true, ends: '' },
      { id: 'CP3', code: 'FREESHIP', type: 'freeship', value: 0, min: 1200, uses: 0, limit: 200, perCustomer: 1, who: 'all', on: true, ends: '2026-11-20' },
      { id: 'CP4', code: 'PUJA15', type: 'percent', value: 15, min: 2000, maxOff: 500, uses: 0, limit: 300, perCustomer: 1, who: 'all', on: false, ends: '2026-10-25' },
    ];
    D.discounts = [
      { id: 'DS1', name: 'Winter polo week', type: 'percent', value: 12, on: 'cat', target: 'polo', from: '2026-11-08', to: '2026-11-15', active: true },
      { id: 'DS2', name: 'Panjabi pre-order offer', type: 'flat', value: 200, on: 'cat', target: 'panjabi', from: '2026-11-20', to: '2026-12-10', active: false },
    ];
    // ---- couriers
    D.couriers = [
      { id: 'pathao', name: 'Pathao', share: 45, fee: { inside: 60, sub: 80, outside: 110 }, codPct: 1, returnPct: 50, connected: true },
      { id: 'steadfast', name: 'Steadfast', share: 40, fee: { inside: 60, sub: 70, outside: 110 }, codPct: 1, returnPct: 50, connected: true },
      { id: 'redx', name: 'RedX', share: 15, fee: { inside: 65, sub: 85, outside: 120 }, codPct: 1, returnPct: 50, connected: false },
    ];
    // ---- costs (sample — owner sets real numbers)
    D.expenseSettings = { packaging: 25, gatewayPct: 1.5 };
    D.expenses = [];
    const fixed = [['Office & store rent', 'Rent', 30000], ['Staff salaries (5)', 'Salaries', 85000], ['Internet & phone', 'Utilities', 4500], ['Server & software', 'Software', 12000], ['Photography', 'Content', 8000], ['Electricity', 'Utilities', 6500]];
    for (const m of ['2026-10', '2026-11']) for (const f of fixed) D.expenses.push({ id: A.uid('EXP'), date: m + '-05', name: f[0], cat: f[1], amount: f[2], fixed: true });
    D.expenses.push({ id: A.uid('EXP'), date: '2026-10-21', name: 'Shopping bags (2,000 pcs)', cat: 'Packaging', amount: 18000, fixed: false });
    D.expenses.push({ id: A.uid('EXP'), date: '2026-11-03', name: 'Model shoot, winter line', cat: 'Content', amount: 12000, fixed: false });
    // ---- ads (60 days)
    D.campaigns = [
      { id: 'AD1', ch: 'Facebook', name: 'Winter Polo Launch', status: 'on', daily: 1400 },
      { id: 'AD2', ch: 'Facebook', name: 'Catalog sales — all products', status: 'on', daily: 900 },
      { id: 'AD3', ch: 'Facebook', name: 'Panjabi retargeting', status: 'on', daily: 400 },
      { id: 'AD4', ch: 'Google', name: 'Search — brand', status: 'on', daily: 250 },
      { id: 'AD5', ch: 'Google', name: 'Shopping — polo & tees', status: 'on', daily: 450 },
      { id: 'AD6', ch: 'TikTok', name: 'Hoodie reels', status: 'on', daily: 350 },
    ];
    D.adSpend = []; // {date, cid, spend, clicks, impressions}
    for (let d = 59; d >= 0; d--) {
      const date = A.fmt.ymd(A.TODAY - d * DAY);
      for (const c of D.campaigns) {
        if (c.id === 'AD6' && d > 35) continue;
        const spend = Math.round(c.daily * (0.75 + rnd() * 0.5));
        D.adSpend.push({ date, cid: c.id, spend, impressions: Math.round(spend * (9 + rnd() * 6)), clicks: Math.round(spend / (6 + rnd() * 6)) });
      }
    }
    // ---- orders (60 days)
    const orders = []; let on = 10180;
    const live = products.filter((p) => p.status === 'live' || p.status === 'archived');
    const popular = live.slice().sort(() => rnd() - 0.5);
    for (let d = 69; d >= 0; d--) {
      const dt = new Date(A.TODAY - d * DAY);
      const wd = new Date(dt.getTime() + 6 * 36e5).getUTCDay();
      let cnt = Math.round((d < 30 ? 13 : 10.5) * (wd === 5 ? 1.4 : wd === 4 ? 1.2 : 1) * (0.7 + rnd() * 0.6));
      if (d === 0) cnt = 9;
      for (let k = 0; k < cnt; k++) {
        const repeat = rnd() < 0.3 && orders.length > 20;
        const cust = repeat ? A.byId(customers, pick(orders).customerId) : pick(customers);
        const hour = d === 0 ? ri(9, 19) : ri(9, 23);
        const created = new Date(new Date(A.fmt.ymd(dt) + 'T00:00:00+06:00').getTime() + hour * 36e5 + ri(0, 59) * 6e4);
        const lines = []; const nl = wpick([[1, 62], [2, 28], [3, 10]]);
        for (let l = 0; l < nl; l++) {
          const p = rnd() < 0.55 ? popular[Math.floor(Math.pow(rnd(), 2) * 30)] : pick(live);
          const v = pick(p.variants); const qty = rnd() < 0.85 ? 1 : 2;
          lines.push({ pid: p.id, sku: v.sku, name: p.name, color: v.color, size: v.size, qty, price: p.price, cost: p.cost });
        }
        const subtotal = A.sum(lines, (x) => x.price * x.qty);
        let discount = 0, coupon = '';
        const cr = rnd();
        if (cr < 0.12 && subtotal >= 1500) { coupon = 'EXTAS10'; discount = Math.min(300, Math.round(subtotal * 0.1)); }
        else if (cr < 0.17 && subtotal >= 1000) { coupon = 'WELCOME100'; discount = 100; }
        const pieces = A.sum(lines, (x) => x.qty);
        if (!coupon && pieces >= 3) discount = Math.round(subtotal * 0.1); else if (!coupon && pieces === 2) discount = Math.round(subtotal * 0.05);
        const fee = D.rules.delivery[cust.zone].fee;
        const delivery = subtotal - discount >= 3000 ? 0 : fee;
        const total = subtotal - discount + delivery;
        const payment = wpick([['COD', 78], ['bKash', 14], ['Nagad', 5], ['Card', 3]]);
        const channel = wpick([['Website', 46], ['Facebook', 30], ['Instagram', 8], ['Phone', 10], ['WhatsApp', 6]]);
        const source = channel === 'Website' ? wpick([['Facebook ads', 40], ['Google', 22], ['Organic search', 20], ['Direct', 13], ['TikTok', 5]]) : channel;
        const courier = wpick([['pathao', 45], ['steadfast', 40], ['redx', 15]]);
        const age = d + (20 - hour) / 24;
        let status;
        if (age < 0.5) status = wpick([['new', 70], ['confirmed', 30]]);
        else if (age < 1.5) status = wpick([['confirmed', 35], ['packed', 35], ['shipped', 25], ['cancelled', 5]]);
        else if (age < 4) status = wpick([['shipped', 55], ['delivered', 38], ['returned', 3], ['cancelled', 4]]);
        else status = wpick([['delivered', 83], ['returned', 9], ['cancelled', 6], ['exchanged', 2]]);
        const risk = cust.zone === 'outside' && total > 3000 ? wpick([['medium', 60], ['high', 15], ['low', 25]]) : wpick([['low', 82], ['medium', 14], ['high', 4]]);
        const o = { id: 'EX-' + on++, created: created.toISOString(), customerId: cust.id, name: cust.name, phone: cust.phone, district: cust.district, area: cust.area, zone: cust.zone, address: `House ${ri(1, 120)}, Road ${ri(1, 30)}, ${cust.area}, ${cust.district}`, lines, subtotal, discount, coupon, delivery, total, payment, paid: payment !== 'COD', channel, source, courier: ['new', 'confirmed', 'cancelled'].includes(status) ? '' : courier, tracking: '', status, risk, notes: '', timeline: [], erp: { pushed: false }, deliveredAt: null, settled: false, returnReason: '' };
        const t0 = created.getTime();
        o.timeline.push({ t: o.created, text: 'Order placed on ' + channel, by: 'Customer' });
        if (status !== 'new') {
          if (status === 'cancelled') o.timeline.push({ t: new Date(t0 + 3 * 36e5).toISOString(), text: pick(['Cancelled — customer did not answer 3 calls', 'Cancelled — customer changed mind', 'Cancelled — duplicate order']), by: 'Rafi' });
          else {
            o.timeline.push({ t: new Date(t0 + ri(1, 4) * 36e5).toISOString(), text: 'Confirmed on call', by: pick(['Rafi', 'Nusrat']) });
            o.erp = { pushed: true, at: new Date(t0 + 5 * 36e5).toISOString(), no: 'SO-' + (60000 + on) };
            o.timeline.push({ t: o.erp.at, text: 'Sent to ERP as sales order ' + o.erp.no, by: 'System' });
          }
        }
        if (['packed', 'shipped', 'delivered', 'returned', 'exchanged'].includes(status)) o.timeline.push({ t: new Date(t0 + 20 * 36e5).toISOString(), text: 'Packed and checked (photo taken)', by: 'Sohel' });
        if (['shipped', 'delivered', 'returned', 'exchanged'].includes(status)) {
          o.tracking = (courier === 'pathao' ? 'PTH' : courier === 'steadfast' ? 'SF' : 'RX') + ri(1000000, 9999999);
          o.timeline.push({ t: new Date(t0 + 26 * 36e5).toISOString(), text: 'Handed to ' + A.byId(D.couriers, courier).name + ' · ' + o.tracking, by: 'Sohel' });
          o.timeline.push({ t: new Date(t0 + 26.5 * 36e5).toISOString(), text: 'ERP billed the shop at buying price', by: 'ERP' });
        }
        if (status === 'delivered' || status === 'exchanged') {
          const dd = cust.zone === 'inside' ? ri(1, 2) : cust.zone === 'sub' ? ri(2, 3) : ri(3, 5);
          o.deliveredAt = new Date(t0 + (26 + dd * 24) * 36e5).toISOString();
          if (new Date(o.deliveredAt) > A.TODAY) o.deliveredAt = new Date(A.TODAY - 2 * 36e5).toISOString();
          o.timeline.push({ t: o.deliveredAt, text: 'Delivered' + (payment === 'COD' ? ' · cash collected ' + A.fmt.tk(total) : ''), by: 'Courier' });
          o.paid = true; o.settled = (A.TODAY - new Date(o.deliveredAt)) / DAY > 3;
          if (o.settled && payment === 'COD') o.timeline.push({ t: new Date(new Date(o.deliveredAt).getTime() + 3 * DAY).toISOString(), text: 'Courier paid out the cash', by: 'Courier' });
          if (status === 'exchanged') o.timeline.push({ t: new Date(new Date(o.deliveredAt).getTime() + 1.5 * DAY).toISOString(), text: 'Size exchange: ' + o.lines[0].size + ' → next size', by: 'Nusrat' });
        }
        if (status === 'returned') { o.returnReason = pick(['Customer refused at door', 'Customer not reachable', 'Wrong size, refused', 'Changed mind', 'Address not found']); o.timeline.push({ t: new Date(t0 + 4 * DAY).toISOString(), text: 'Returned to shop — ' + o.returnReason, by: 'Courier' }); o.returnChecked = rnd() < 0.7; }
        orders.push(o);
      }
    }
    D.orders = orders.reverse();
    // product stats from last 30 days
    const from30 = A.TODAY - 30 * DAY;
    for (const o of D.orders) {
      if (new Date(o.created) < from30) continue;
      for (const l of o.lines) { const p = A.byId(products, l.pid); if (!p) continue; if (!['cancelled'].includes(o.status)) { p.sold30 += l.qty; p.revenue30 += l.price * l.qty; } }
    }
    for (const p of products) { p.views30 = p.status === 'live' ? Math.round(p.sold30 * (28 + rnd() * 30) + ri(20, 140)) : 0; p.carts30 = Math.round(p.views30 * (0.06 + rnd() * 0.06)); }
    // customers stats
    for (const c of customers) {
      const os = D.orders.filter((o) => o.customerId === c.id);
      c.orders = os.length; c.delivered = os.filter((o) => o.status === 'delivered' || o.status === 'exchanged').length; c.refused = os.filter((o) => o.status === 'returned').length;
      c.spent = A.sum(os.filter((o) => o.status === 'delivered' || o.status === 'exchanged'), (o) => o.total);
      c.lastOrder = os.length ? os[0].created : null; c.points = Math.floor(c.spent / 100);
    }
    // reviews & questions
    D.reviews = [];
    const RV = ['Fabric is very comfortable, fits well.', 'Colour exactly like the picture. Will buy again.', 'Delivery was quick, packaging good.', 'Size L was a bit tight, exchanged easily.', 'Good quality for the price.', 'Stitching is neat. Recommended.', 'Collar shape lost after 2 washes.', 'Too thin for winter.', 'Excellent panjabi for Eid.', 'Cotton feels premium.'];
    for (let i = 0; i < 64; i++) { const o = pick(D.orders.filter((x) => x.status === 'delivered')); const l = o.lines[0]; const r = wpick([[5, 52], [4, 30], [3, 10], [2, 5], [1, 3]]); D.reviews.push({ id: 'R' + i, pid: l.pid, name: o.name, rating: r, text: r <= 2 ? pick(RV.slice(6, 8)) : pick(RV), date: new Date(new Date(o.created).getTime() + ri(4, 10) * DAY).toISOString(), status: i < 6 ? 'pending' : 'published', photo: rnd() < 0.25, reply: '' }); }
    for (const p of products) { const rs = D.reviews.filter((r) => r.pid === p.id && r.status === 'published'); p.reviews = rs.length; p.rating = rs.length ? A.sum(rs, (r) => r.rating) / rs.length : 0; }
    D.questions = [
      { id: 'Q1', pid: products[0].id, name: 'Rakib', text: 'Is this available in XXL in navy?', date: new Date(A.TODAY - 5 * 36e5).toISOString(), answer: '' },
      { id: 'Q2', pid: products[3].id, name: 'Tamim', text: 'Will the colour fade after washing?', date: new Date(A.TODAY - 26 * 36e5).toISOString(), answer: '' },
      { id: 'Q3', pid: products[30].id, name: 'Arif', text: 'What is the chest size of L?', date: new Date(A.TODAY - 50 * 36e5).toISOString(), answer: 'L chest is 42 inches. Size chart is on the page.' },
      { id: 'Q4', pid: products[72].id, name: 'Sabbir', text: 'Can I get this before Friday in Sylhet?', date: new Date(A.TODAY - 3 * 36e5).toISOString(), answer: '' },
    ];
    // abandoned checkouts
    D.abandoned = [];
    for (let i = 0; i < 38; i++) { const c = pick(customers); const p = pick(live); D.abandoned.push({ id: 'AB' + i, name: rnd() < 0.7 ? c.name : '', phone: c.phone, district: c.district, item: p.name, pid: p.id, value: p.price * ri(1, 2), step: pick(['Address', 'Payment', 'Delivery', 'Phone']), at: new Date(A.TODAY - ri(1, 29 * 24) * 36e5).toISOString(), recovered: rnd() < 0.22, messaged: rnd() < 0.3 }); }
    D.abandoned.sort((a, b) => new Date(b.at) - new Date(a.at));
    // inbox
    const CH = ['Messenger', 'WhatsApp', 'Instagram', 'Website chat'];
    const ASK = [['Bhai L size e chest koto?', 'L size chest 42", length 29". Size chart pathalam.'], ['Order ta kobe pabo? Order no EX-10372', 'Apnar parcel Pathao te ache, kal delivery hobe inshallah.'], ['Cash on delivery hobe Sylhet e?', 'Ji, sara Bangladesh e cash on delivery ache.'], ['Navy polo XL stock ache?', 'Ji ache. Link pathacchi.'], ['Size exchange korte chai', 'Obosshoi. 72 ghontar moddhe exchange kora jay, amra rider pathabo.'], ['Panjabi te discount ache?', 'Ekhon 2 ta nile 5% off, 3 ta nile 10% off.']];
    D.conversations = [];
    for (let i = 0; i < 26; i++) {
      const c = pick(customers); const q = pick(ASK); const t = new Date(A.TODAY - ri(2, 60 * 30) * 6e4);
      const open = i < 9; const msgs = [{ from: 'c', text: q[0], t: t.toISOString() }];
      if (!open) msgs.push({ from: 's', text: q[1], t: new Date(t.getTime() + ri(3, 40) * 6e4).toISOString(), by: pick(['Nusrat', 'Rafi']) });
      D.conversations.push({ id: 'CV' + i, customerId: c.id, name: c.name, channel: pick(CH), status: open ? 'open' : 'done', unread: open, assignee: open ? (i % 3 ? 'Nusrat' : '') : 'Nusrat', last: msgs[msgs.length - 1].t, msgs });
    }
    D.conversations.sort((a, b) => new Date(b.last) - new Date(a.last));
    D.quickReplies = [
      { id: 'QR1', key: 'size', text: 'আমাদের সাইজ চার্ট: S 38", M 40", L 42", XL 44", XXL 46" (বুকের মাপ)। আপনার মাপ বললে মিলিয়ে দিই।' },
      { id: 'QR2', key: 'cod', text: 'সারা বাংলাদেশে ক্যাশ অন ডেলিভারি আছে। ঢাকার ভেতরে 1-2 দিন, বাইরে 3-5 দিন।' },
      { id: 'QR3', key: 'exchange', text: 'ডেলিভারির 72 ঘণ্টার মধ্যে সাইজ এক্সচেঞ্জ করা যায়। আমরা রাইডার পাঠাব।' },
      { id: 'QR4', key: 'track', text: 'আপনার অর্ডার নম্বর দিলে পার্সেল কোথায় আছে জানিয়ে দিচ্ছি।' },
    ];
    // ERP
    D.erp = {
      connected: true, url: 'https://erp.extasbd.com', company: 'EXTAS', warehouse: 'Nikunja Warehouse', contract: 'v6', mode: 'live', lastHealth: new Date(A.TODAY - 4 * 6e4).toISOString(),
      lastStockSync: new Date(A.TODAY - 11 * 6e4).toISOString(), lastProductSync: new Date(A.TODAY - 3 * 36e5).toISOString(),
      styleCodesInErp: 134, notImported: ['EXT-PL-1031', 'EXT-PL-1032', 'EXT-HD-1097', 'EXT-PJ-1071', 'EXT-SH-1060', 'EXT-JK-1107'].map((c, i) => ({ styleCode: c, name: ['Ribbed Collar Polo', 'Mesh Sport Polo', 'Sherpa Hoodie', 'Wedding Panjabi', 'Corduroy Shirt', 'Varsity Jacket'][i], price: [1190, 1090, 2450, 3950, 1690, 3450][i], cost: [520, 470, 1150, 1720, 760, 1580][i], colors: ri(2, 4), stock: ri(20, 140) })),
      payments: [],
    };
    // ERP ledger: bills when shipped (at cost), credits for returned & checked, payments weekly
    D.erp.payments = [];
    for (let w = 8; w >= 1; w--) D.erp.payments.push({ id: 'PAY' + w, date: A.fmt.ymd(A.TODAY - w * 7 * DAY + 2 * DAY), amount: ri(6, 8) * 10000, method: 'Bank transfer', ref: 'DBBL-' + ri(100000, 999999) });
    D.erpEvents = [];
    const ev = (mins, kind, text, ok = true) => D.erpEvents.push({ t: new Date(A.TODAY - mins * 6e4).toISOString(), kind, text, ok });
    ev(4, 'health', 'Health check passed · EXTAS · Nikunja Warehouse');
    ev(11, 'stock', 'Stock pulled from ERP · 1,318 SKUs · 9 changed');
    ev(42, 'order', 'Sales order SO-60412 created for EX-10471');
    ev(71, 'stock', 'Stock pulled from ERP · 1,318 SKUs · 4 changed');
    ev(95, 'price', 'Buying price changed in ERP: EXT-PL-1003 ৳540 → ৳565 (selling price unchanged, margin 54% → 52%)');
    ev(130, 'bill', 'ERP bill BL-22981 · 6 parcels handed to courier · ৳4,960 at buying price');
    ev(180, 'return', 'Return check sent to ERP: EX-10398 · 1 piece A-grade · credit ৳610');
    ev(190, 'order', 'Sales order failed for EX-10466 — SKU EXT-JG-1092-OLI-34 not in ERP', false);
    ev(195, 'order', 'Retry OK · SO-60409 created for EX-10466');
    ev(260, 'product', 'Imported from ERP by style code: EXT-HD-1095 (3 colours, 15 sizes)');
    ev(2880, 'payment', 'Payment to ERP recorded · ৳1,20,000 · DBBL transfer');
    D.erpEvents.sort((a, b) => new Date(b.t) - new Date(a.t));
    // traffic per day
    D.traffic = [];
    for (let d = 59; d >= 0; d--) { const date = A.fmt.ymd(A.TODAY - d * DAY); const os = D.orders.filter((o) => A.fmt.ymd(o.created) === date && o.channel === 'Website').length; const sessions = Math.round((d < 30 ? 1250 : 1050) * (0.75 + rnd() * 0.5)); const views = Math.round(sessions * (2.1 + rnd() * 0.6)); const carts = Math.round(sessions * (0.055 + rnd() * 0.02)); const checkouts = Math.max(os + 2, Math.round(carts * (0.38 + rnd() * 0.1))); D.traffic.push({ date, sessions, users: Math.round(sessions * 0.82), views, carts, checkouts, orders: os, mobile: 0.86 }); }
    // SEO
    D.keywords = [
      ['polo shirt price in bangladesh', 7, 11, 5400], ['men polo shirt bd', 4, 6, 2900], ['panjabi for men', 14, 19, 8100], ['cotton panjabi price in bd', 9, 9, 2400], ['premium t shirt bd', 12, 15, 1900], ['oxford shirt men bd', 18, 24, 880], ['hoodie price in bangladesh', 23, 31, 6600], ['jogger pant bd', 16, 15, 3600], ['chino pant price bd', 11, 13, 1300], ['extas', 1, 1, 720], ['extas polo', 1, 1, 210], ['men jacket bd', 34, 41, 4400], ['eid panjabi 2027', 0, 0, 900], ['denim jeans men bd', 27, 22, 5200], ['linen shirt bd', 15, 20, 1100], ['katua for men', 8, 12, 1600], ['heavyweight hoodie', 19, 26, 700], ['oversized t shirt bd', 21, 18, 4100], ['baseball cap bd', 30, 38, 1700], ['formal trouser men bd', 25, 29, 1400],
    ].map((k, i) => ({ id: 'K' + i, kw: k[0], pos: k[1], prev: k[2], volume: k[3], clicks: k[1] ? Math.round(k[3] * (k[1] <= 3 ? 0.18 : k[1] <= 10 ? 0.05 : 0.008)) : 0, page: k[0].includes('panjabi') ? '/collections/panjabi' : k[0].includes('polo') ? '/collections/polo' : '/' }));
    D.seoIssues = [
      { id: 'S1', sev: 'bad', text: 'Product photos without alt text', count: 214, fix: 'Write alt text with AI' },
      { id: 'S2', sev: 'warn', text: 'Products with no meta description', count: products.filter((p) => !p.seo.desc).length, fix: 'Fill from template' },
      { id: 'S3', sev: 'warn', text: 'Collection pages with thin text (under 120 words)', count: 6, fix: 'Add collection text' },
      { id: 'S4', sev: 'good', text: 'Sitemap sent to Google · 1 Nov', count: 0, fix: '' },
      { id: 'S5', sev: 'warn', text: 'Old WordPress links without redirect (404)', count: 12, fix: 'Add redirects' },
      { id: 'S6', sev: 'good', text: 'Page speed on phones: good (LCP 1.9 s)', count: 0, fix: '' },
    ];
    D.blog = [
      { id: 'B1', title: 'How to choose the right polo size', status: 'published', date: '2026-10-28', views: 1840, sales: 6 },
      { id: 'B2', title: 'Panjabi styles for Eid 2027', status: 'draft', date: '', views: 0, sales: 0 },
      { id: 'B3', title: '5 ways to wear a white tee', status: 'published', date: '2026-10-12', views: 960, sales: 2 },
      { id: 'B4', title: 'Cotton vs linen in Dhaka summer', status: 'scheduled', date: '2026-11-18', views: 0, sales: 0 },
    ];
    D.staff = [
      { id: 'U1', name: 'Mehadi Hasan', role: 'Owner', email: 'owner@extas.com.bd', twofa: true, last: new Date(A.TODAY - 5 * 6e4).toISOString() },
      { id: 'U2', name: 'Rafi', role: 'Order manager', email: 'rafi@extas.com.bd', twofa: true, last: new Date(A.TODAY - 40 * 6e4).toISOString() },
      { id: 'U3', name: 'Nusrat', role: 'Customer care', email: 'nusrat@extas.com.bd', twofa: false, last: new Date(A.TODAY - 12 * 6e4).toISOString() },
      { id: 'U4', name: 'Sohel', role: 'Packing', email: 'sohel@extas.com.bd', twofa: false, last: new Date(A.TODAY - 3 * 36e5).toISOString() },
      { id: 'U5', name: 'Tania', role: 'Marketing', email: 'tania@extas.com.bd', twofa: true, last: new Date(A.TODAY - 26 * 36e5).toISOString() },
    ];
    D.store = { name: 'EXTAS', phone: '09610-000000', whatsapp: '01700-000000', email: 'hello@extas.com.bd', address: 'House 12, Road 5, Nikunja-2, Dhaka 1229', tradeLicence: 'TRAD/DNCC/037119/2023', bin: '', domain: 'extas.com.bd', currency: 'BDT', timezone: 'Asia/Dhaka' };
    D.audit = [];
    D.home = { design: 'A', target: 750000 };
    return D;
  }

  /* ---------------- store ---------------- */
  A.load = () => {
    let d = null;
    try { const raw = localStorage.getItem(KEY); if (raw) d = JSON.parse(raw); } catch (e) { d = null; }
    if (!d || !d.meta || d.meta.version !== A.version) d = makeData();
    A.D = d;
  };
  A.save = () => { try { localStorage.setItem(KEY, JSON.stringify(A.D)); } catch (e) {} };
  A.reset = () => { try { localStorage.removeItem(KEY); } catch (e) {} A.D = makeData(); A.save(); A.toast(A.t('Demo data reset', 'ডেমো ডেটা নতুন করে শুরু হলো'), 'good'); A.render(); };
  A.log = (text, by = 'You') => { A.D.audit.unshift({ t: new Date().toISOString(), text, by }); A.D.audit = A.D.audit.slice(0, 200); };
  A.commit = (msg) => { if (msg) A.log(msg); A.save(); };

  /* ---------------- business maths ---------------- */
  const C = (A.calc = {});
  C.isDelivered = (o) => o.status === 'delivered' || o.status === 'exchanged';
  C.isOpen = (o) => ['new', 'confirmed', 'booked', 'packed', 'shipped'].includes(o.status);
  C.cogs = (o) => A.sum(o.lines, (l) => l.cost * l.qty);
  C.pieces = (o) => A.sum(o.lines, (l) => l.qty);
  C.courierFee = (o) => { const c = A.byId(A.D.couriers, o.courier || 'pathao'); return c ? c.fee[o.zone] : 70; };
  C.codFee = (o) => (o.payment === 'COD' && C.isDelivered(o) ? Math.round(o.total * 0.01) : 0);
  C.gatewayFee = (o) => (o.payment !== 'COD' && o.status !== 'cancelled' ? Math.round(o.total * A.D.expenseSettings.gatewayPct / 100) : 0);
  C.returnCost = (o) => (o.status === 'returned' ? Math.round(C.courierFee(o) * 1.5) + A.D.expenseSettings.packaging : 0);
  /** Profit of one order before ads and fixed costs. Delivered: sale − product cost − courier − COD fee − packaging − gateway. Returned: −return cost. */
  C.orderProfit = (o) => {
    if (C.isDelivered(o)) return o.subtotal - o.discount + o.delivery - C.cogs(o) - C.courierFee(o) - C.codFee(o) - A.D.expenseSettings.packaging - C.gatewayFee(o);
    if (o.status === 'returned') return -C.returnCost(o);
    return 0;
  };
  C.range = (key, custom) => {
    const end = A.TODAY.getTime(); const sod = new Date(A.fmt.ymd(A.TODAY) + 'T00:00:00+06:00').getTime();
    let from, to = end;
    if (key === 'today') from = sod;
    else if (key === 'yesterday') { from = sod - DAY; to = sod; }
    else if (key === '7d') from = sod - 6 * DAY;
    else if (key === '30d') from = sod - 29 * DAY;
    else if (key === 'month') from = new Date('2026-11-01T00:00:00+06:00').getTime();
    else if (key === 'lastmonth') { from = new Date('2026-10-01T00:00:00+06:00').getTime(); to = new Date('2026-11-01T00:00:00+06:00').getTime(); }
    else if (key === 'custom' && custom) { from = new Date(custom.from + 'T00:00:00+06:00').getTime(); to = new Date(custom.to + 'T23:59:59+06:00').getTime(); }
    else from = sod - 29 * DAY;
    const len = to - from;
    return { key, from, to, prevFrom: key === 'month' ? new Date('2026-10-01T00:00:00+06:00').getTime() : from - len, prevTo: key === 'month' ? new Date('2026-10-12T20:00:00+06:00').getTime() : from, days: Math.max(1, Math.round(len / DAY)) };
  };
  C.inRange = (iso, from, to) => { const t = new Date(iso).getTime(); return t >= from && t < to; };
  C.ordersIn = (from, to) => A.D.orders.filter((o) => C.inRange(o.created, from, to));
  C.adSpendIn = (from, to, ch) => A.sum(A.D.adSpend.filter((a) => { const t = new Date(a.date + 'T12:00:00+06:00').getTime(); return t >= from && t < to && (!ch || A.byId(A.D.campaigns, a.cid).ch === ch); }), (a) => a.spend);
  C.fixedIn = (from, to) => { // fixed monthly costs spread per day
    const days = (to - from) / DAY; const monthly = A.sum(A.D.expenses.filter((e) => e.fixed && e.date.startsWith('2026-11')), (e) => e.amount);
    return Math.round(monthly / 30 * days);
  };
  C.otherExpIn = (from, to) => A.sum(A.D.expenses.filter((e) => !e.fixed && C.inRange(e.date + 'T12:00:00+06:00', from, to)), (e) => e.amount);
  /** Full profit & loss for a period: sales by delivery date, returns by return date, ads and fixed costs by day. */
  C.pnl = (from, to) => {
    const os = C.ordersIn(from, to);
    // Sales count when the parcel is delivered (delivery date in the period); returns when they come back.
    const del = A.D.orders.filter((o) => C.isDelivered(o) && o.deliveredAt && C.inRange(o.deliveredAt, from, to));
    const ret = A.D.orders.filter((o) => o.status === 'returned' && C.inRange(new Date(new Date(o.created).getTime() + 4 * DAY).toISOString(), from, to));
    const productSales = A.sum(del, (o) => o.subtotal);
    const discounts = A.sum(del, (o) => o.discount);
    const deliveryIncome = A.sum(del, (o) => o.delivery);
    const revenue = productSales - discounts + deliveryIncome;
    const cogs = A.sum(del, C.cogs);
    const courier = A.sum(del, C.courierFee);
    const cod = A.sum(del, C.codFee);
    const packaging = (del.length + ret.length) * A.D.expenseSettings.packaging;
    const gateway = A.sum(os, C.gatewayFee);
    const returns = A.sum(ret, (o) => Math.round(C.courierFee(o) * 1.5));
    const gross = revenue - cogs - courier - cod - packaging - gateway - returns;
    const ads = C.adSpendIn(from, to);
    const fixed = C.fixedIn(from, to);
    const other = C.otherExpIn(from, to);
    const net = gross - ads - fixed - other;
    return { orders: os.length, delivered: del.length, returned: ret.length, productSales, discounts, deliveryIncome, revenue, cogs, courier, cod, packaging, gateway, returns, gross, ads, fixed, other, net, margin: revenue ? net / revenue * 100 : 0 };
  };
  /** Headline numbers for a range + the previous range (for ▲▼). */
  C.kpis = (r) => {
    const f = (from, to) => {
      const os = C.ordersIn(from, to); const live = os.filter((o) => o.status !== 'cancelled');
      const del = os.filter(C.isDelivered); const ret = os.filter((o) => o.status === 'returned');
      const finished = del.length + ret.length;
      const traffic = A.D.traffic.filter((t) => { const x = new Date(t.date + 'T12:00:00+06:00').getTime(); return x >= from && x < to; });
      const sessions = A.sum(traffic, (t) => t.sessions);
      const p = C.pnl(from, to);
      return { orders: live.length, orderValue: A.sum(live, (o) => o.total), aov: live.length ? A.sum(live, (o) => o.total) / live.length : 0, delivered: p.delivered, sales: p.revenue, profit: p.net, gross: p.gross, returnRate: finished ? ret.length / finished * 100 : 0, cancelled: os.length - live.length, ads: p.ads, roas: p.ads ? p.revenue / p.ads : 0, sessions, conv: sessions ? os.filter((o) => o.channel === 'Website').length / sessions * 100 : 0, pieces: A.sum(live, C.pieces) };
    };
    return { cur: f(r.from, r.to), prev: f(r.prevFrom, r.prevTo) };
  };
  C.daily = (from, to, fn) => { const out = []; for (let t = from; t < to; t += DAY) { const d = A.fmt.ymd(t); out.push({ date: d, v: fn(d) }); } return out; };
  C.codWithCouriers = () => A.D.orders.filter((o) => C.isDelivered(o) && o.payment === 'COD' && !o.settled);
  C.lowStock = (limit = 3) => { const out = []; for (const p of A.D.products) { if (p.status !== 'live') continue; for (const v of p.variants) if (v.stock <= limit) out.push({ p, v }); } return out; };
  C.stockDays = (p) => { const per = p.sold30 / 30; const stock = A.sum(p.variants, (v) => v.stock); return per ? Math.round(stock / per) : 999; };
  C.erpBalance = () => {
    const shipped = A.D.orders.filter((o) => ['shipped', 'delivered', 'returned', 'exchanged'].includes(o.status));
    const bills = A.sum(shipped, C.cogs); const credits = A.sum(A.D.orders.filter((o) => o.status === 'returned' && o.returnChecked), (o) => (o.returnCredit != null ? o.returnCredit : C.cogs(o)));
    const paid = A.sum(A.D.erp.payments, (p) => p.amount);
    return { bills, credits, paid, owed: bills - credits - paid };
  };
  C.deliveryFee = (zone, subtotal) => { const r = A.D.rules; if (r.freeDelivery.on && subtotal >= r.freeDelivery.over) return 0; return r.delivery[zone].fee; };
  C.counts = () => {
    const D = A.D;
    return {
      confirm: A.ordersApi && A.ordersApi.processingCount ? A.ordersApi.processingCount() : D.orders.filter((o) => o.status === 'new').length,
      pack: D.orders.filter((o) => o.status === 'confirmed' || o.status === 'booked').length,
      ship: D.orders.filter((o) => o.status === 'packed').length,
      returns: D.orders.filter((o) => o.status === 'returned' && !o.returnChecked).length,
      inbox: D.conversations.filter((c) => c.status === 'open').length,
      ai: D.ai && D.ai.queue ? D.ai.queue.filter((x) => x.status === 'open').length : 0,
      publish: D.products.filter((p) => p.status === 'ready').length,
      reviews: D.reviews.filter((r) => r.status === 'pending').length + D.questions.filter((q) => !q.answer).length,
      low: C.lowStock(1).length,
      highRisk: D.orders.filter((o) => o.status === 'new' && o.risk === 'high').length,
    };
  };

  /* ---------------- UI helpers ---------------- */
  /* Icon set: one 24px box, glyph drawn inside a 20px grid (2px margin), 1.75 stroke, round caps.
     A.icon(name, size?) — size defaults to 18; CSS sets the size per context (nav 18, buttons 16, tiles 20). */
  const ICONS = {
    home: 'M3.5 10.4 12 3.5l8.5 6.9V19a1.5 1.5 0 0 1-1.5 1.5h-4.25v-5.75h-5.5v5.75H5A1.5 1.5 0 0 1 3.5 19z',
    orders: 'M5.2 8h13.6l-1 11.1a1.5 1.5 0 0 1-1.5 1.4H7.7a1.5 1.5 0 0 1-1.5-1.4zM9 10.5V6.75a3 3 0 0 1 6 0v3.75',
    products: 'M9 3.5 4.2 5.6 2.5 10.2l3.3 1.4V20.5h12.4v-8.9l3.3-1.4-1.7-4.6L15 3.5a3 3 0 0 1-6 0z',
    customers: 'M9 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5zM2.5 20.5a6.5 6.5 0 0 1 13 0M15.5 4.3a3.75 3.75 0 0 1 0 7M18 14.6a6.5 6.5 0 0 1 3.5 5.9',
    inbox: 'M20.5 11.5a8 8 0 0 1-11.6 7.2L3.5 20.5l1.6-4.7A8 8 0 1 1 20.5 11.5zM8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01',
    rules: 'M4 6.5h8.5M16.5 6.5H20M4 12h2.5M10.5 12H20M4 17.5h10M18 17.5h2M14.5 4.5v4M8.5 10v4M16 15.5v4',
    marketing: 'M3.5 10v4a1 1 0 0 0 1 1h2.6L14 19.5v-15L7.1 9H4.5a1 1 0 0 0-1 1zM17.5 9a4.2 4.2 0 0 1 0 6M7.5 15.2l1.3 4.8',
    website: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM3.5 12h17M12 3.5c2.4 2.3 3.5 5.2 3.5 8.5s-1.1 6.2-3.5 8.5M12 3.5C9.6 5.8 8.5 8.7 8.5 12s1.1 6.2 3.5 8.5',
    finance: 'M19.5 8V6.5a1.5 1.5 0 0 0-1.5-1.5H5.5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v8.5a1.5 1.5 0 0 1-1.5 1.5H5.5a2 2 0 0 1-2-2V7M16.5 14.25h.01',
    reports: 'M3.5 20.5h17M6.5 17v-5M11 17V6.5M15.5 17v-8M20 17v-3',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM10.3 3.5h3.4l.5 2.3 1.6.9 2.2-.8 1.7 2.9-1.8 1.6v1.2l1.8 1.6-1.7 2.9-2.2-.8-1.6.9-.5 2.3h-3.4l-.5-2.3-1.6-.9-2.2.8-1.7-2.9 1.8-1.6v-1.2L4.3 9.2 6 6.3l2.2.8 1.6-.9z',
    search: 'M10.75 18a7.25 7.25 0 1 0 0-14.5 7.25 7.25 0 0 0 0 14.5zM20.5 20.5l-4.6-4.6',
    bell: 'M6 9.5a6 6 0 1 1 12 0c0 5.5 2.5 7.5 2.5 7.5h-17S6 15 6 9.5M10 20.5h4',
    help: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM9.6 9.4a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.4-2.5 2.4M12 16.5h.01',
    moon: 'M20.3 13.4A8.5 8.5 0 1 1 10.6 3.7a6.6 6.6 0 0 0 9.7 9.7z',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
    menu: 'M4 7h16M4 12h16M4 17h16', x: 'M17.5 6.5l-11 11M6.5 6.5l11 11',
    ext: 'M14 3.5h6.5V10M10.5 13.5l10-10M19 14v4.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2H10',
    check: 'M4.5 12.5l5 5 10-11', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', down: 'M12 4.5v13M18 12l-6 6-6-6',
    up: 'M12 19.5v-13M6 12l6-6 6 6', chev: 'M9.5 6l6 6-6 6', chevdown: 'M6 9.5l6 6 6-6',
    info: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 16v-4.5M12 8h.01',
    warn: 'M10.3 4.3 2.9 17.3a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0zM12 9.5v4M12 17h.01',
    phone: 'M20.5 16.4v2.6a1.6 1.6 0 0 1-1.8 1.6A16 16 0 0 1 3.4 5.3 1.6 1.6 0 0 1 5 3.5h2.6a1.6 1.6 0 0 1 1.6 1.3l.5 2.6a1.6 1.6 0 0 1-.5 1.5l-1.3 1.2a13 13 0 0 0 6 6l1.2-1.3a1.6 1.6 0 0 1 1.5-.5l2.6.5a1.6 1.6 0 0 1 1.3 1.6z',
    truck: 'M2.5 6.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1V16h-12zM14.5 9.5h3.6l3.4 3.6V16h-7M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    box: 'M20.5 7.8 12 3.5 3.5 7.8v8.4l8.5 4.3 8.5-4.3zM3.5 7.8 12 12l8.5-4.2M12 12v8.5M7.8 5.6l8.4 4.3',
    sync: 'M20.5 12a8.5 8.5 0 0 1-14.7 5.8L3.5 15.5M3.5 12a8.5 8.5 0 0 1 14.7-5.8l2.3 2.3M20.5 3.5v5h-5M3.5 20.5v-5h5',
    print: 'M6.5 9V3.5h11V9M6.5 17.5h-2a1 1 0 0 1-1-1v-6.5A1.5 1.5 0 0 1 5 8.5h14a1.5 1.5 0 0 1 1.5 1.5v6.5a1 1 0 0 1-1 1h-2M6.5 14h11v6.5h-11z',
    star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
    edit: 'M12.5 20.5h8M16.3 4.2a2 2 0 0 1 2.9 2.9L7.5 18.8l-4 1 1-4z',
    send: 'M20.5 3.5 10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4z',
    reset: 'M3.5 12a8.5 8.5 0 1 0 2.5-6l-2.5 2.5M3.5 3.5v5h5',
    clock: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 7.5V12l3 2',
    map: 'M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2zM9 4.5v13M15 6.5v13',
    pin: 'M12 20.5s-6.5-5.6-6.5-10.8a6.5 6.5 0 0 1 13 0c0 5.2-6.5 10.8-6.5 10.8zM12 12a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5z',
    trend: 'M3.5 16.5l5.5-5.5 4 4 7.5-7.5M15 7.5h5.5V13', trenddown: 'M3.5 7.5 9 13l4-4 7.5 7.5M15 16.5h5.5V11',
    exchange: 'M4 8.5h14l-3.5-3.5M20 15.5H6l3.5 3.5',
    tag: 'M3.5 12.4V4.5a1 1 0 0 1 1-1h7.9l8.2 8.2a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0zM8 8h.01',
    calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19zM4 10h16M8.5 3.5v3M15.5 3.5v3',
    bolt: 'M13 3.5 5 13.5h6l-1 7 8-10h-6z', user: 'M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
    cash: 'M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 10v.01M18 14v.01',
    layers: 'M12 3.5 2.5 8.5 12 13.5l9.5-5zM2.5 12.5 12 17.5l9.5-5M2.5 16.5 12 21.5l9.5-5',
    list: 'M8.5 6.5h12M8.5 12h12M8.5 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01',
    eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5z',
    grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
    sparkle: 'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  };
  const I = (A.icon = (name, size = 18) => `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ICONS.info}"/></svg>`);
  A.ICONS = ICONS;
  const U = (A.ui = {});
  U.badge = (text, tone = '') => `<span class="badge ${tone}">${A.esc(text)}</span>`;
  U.statusBadge = (s) => {
    const m = { new: ['New', 'নতুন', 'accent'], confirmed: ['Confirmed', 'কনফার্মড', 'info'], packed: ['Packed', 'প্যাকড', 'info'], shipped: ['With courier', 'কুরিয়ারে', 'warn'], delivered: ['Delivered', 'ডেলিভারি হয়েছে', 'good'], returned: ['Returned', 'ফেরত এসেছে', 'bad'], cancelled: ['Cancelled', 'বাতিল', ''], exchanged: ['Exchanged', 'এক্সচেঞ্জ হয়েছে', 'good'], live: ['On the shop', 'সাইটে লাইভ', 'good'], ready: ['Ready to publish', 'পাবলিশের অপেক্ষায়', 'info'], draft: ['Draft', 'খসড়া', ''], archived: ['Archived', 'আর্কাইভ', ''] }[s] || [s, s, ''];
    return U.badge(A.t(m[0], m[1]), m[2]);
  };
  U.riskBadge = (r) => U.badge(A.t({ low: 'Low risk', medium: 'Check', high: 'High risk' }[r], { low: 'ঝুঁকি কম', medium: 'যাচাই করুন', high: 'ঝুঁকি বেশি' }[r]), { low: 'good', medium: 'warn', high: 'bad' }[r]);
  U.kpi = ({ label, value, delta = '', sub = '', icon = '' }) => `<div class="kpi"><div class="kpi-l">${icon ? I(icon) : ''}${label}</div><div class="kpi-v">${value}</div><div class="kpi-s">${delta}${sub ? `<span>${sub}</span>` : ''}</div></div>`;
  U.card = (title, body, { sub = '', more = '', moreHref = '', cls = '', id = '' } = {}) => `<section class="card ${cls}" ${id ? `id="${id}"` : ''}>${title ? `<div class="card-h"><div><h3>${title}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${more ? `<a class="more" href="${moreHref}">${more} →</a>` : ''}</div>` : ''}${body}</section>`;
  U.table = (cols, rows, { onRow = '', empty = '' } = {}) => {
    if (!rows.length) return `<div class="tbl-wrap"><div class="empty">${empty || A.t('Nothing here yet', 'এখানে এখনো কিছু নেই')}</div></div>`;
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th class="${c.r ? 'r' : ''} ${c.hide ? 'hide-sm' : ''}">${c.h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr class="${onRow ? 'click' : ''}" ${onRow ? `data-row="${A.esc(r._id || '')}"` : ''}>${cols.map((c) => `<td class="${c.r ? 'r' : ''} ${c.hide ? 'hide-sm' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  U.thumb = (p, size = 38) => { const hex = COLORS[p.colors ? p.colors[0] : 'Navy'] || '#1f2a4d'; const cat = A.byId(CATS, p.cat) || CATS[0]; return `<span class="thumb" style="background:color-mix(in srgb, ${hex} 14%, var(--card2));width:${size}px;height:${size}px">${garmentSvg(cat.shape, hex, size - 6)}</span>`; };
  U.sw = (col) => `<span class="dotk" title="${A.esc(col)}" style="background:${COLORS[col] || '#999'};border:1px solid var(--line2)"></span>`;
  U.sw2 = (cols) => cols.map(U.sw).join('');
  U.switch = (id, on, attrs = '') => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${attrs}><span></span></label>`;
  U.field = (label, input, hint = '') => `<div class="field"><label>${label}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  U.input = (id, value = '', attrs = '') => `<input class="inp" id="${id}" value="${A.esc(value)}" ${attrs}>`;
  U.money = (id, value = '', attrs = '') => `<div class="money"><input class="inp" id="${id}" type="number" inputmode="numeric" value="${A.esc(value)}" ${attrs}></div>`;
  U.select = (id, options, value, attrs = '') => `<select class="inp" id="${id}" ${attrs}>${options.map((o) => { const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return `<option value="${A.esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${A.esc(l)}</option>`; }).join('')}</select>`;
  U.callout = (html, tone = '', icon = 'info') => `<div class="callout ${tone}">${I(icon)}<div>${html}</div></div>`;
  U.empty = (t) => `<div class="empty">${t}</div>`;
  U.seg = (id, opts, val) => `<div class="seg" id="${id}">${opts.map((o) => `<button data-v="${o[0]}" class="${o[0] === val ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`;
  U.bar = (pct, color) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%;${color ? `background:${color}` : ''}"></i></div>`;
  U.rangeOpts = () => [['today', A.t('Today', 'আজ')], ['7d', A.t('7 days', '7 দিন')], ['30d', A.t('30 days', '30 দিন')], ['month', A.t('This month', 'এই মাস')], ['lastmonth', A.t('Last month', 'গত মাস')]];
  U.guide = (text) => `<div class="guide-note">${I('info')} ${text}</div>`;

  // overlays
  let overlayEl = null;
  U.modal = (title, body, { foot = '', wide = false, onOpen } = {}) => {
    U.close();
    overlayEl = document.createElement('div'); overlayEl.className = 'overlay';
    overlayEl.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-h"><h3>${title}</h3><button class="iconbtn" data-close aria-label="Close">${I('x')}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
    overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl || e.target.closest('[data-close]')) U.close(); });
    document.body.appendChild(overlayEl);
    if (onOpen) onOpen(overlayEl.querySelector('.modal'));
    return overlayEl.querySelector('.modal');
  };
  U.drawer = (title, body, { foot = '', onOpen } = {}) => {
    U.close();
    overlayEl = document.createElement('div'); overlayEl.className = 'overlay drawer-o';
    overlayEl.innerHTML = `<div class="drawer" role="dialog" aria-modal="true"><div class="modal-h"><h3>${title}</h3><button class="iconbtn" data-close aria-label="Close">${I('x')}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f" style="background:var(--card)">${foot}</div>` : ''}</div>`;
    overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl || e.target.closest('[data-close]')) U.close(); });
    document.body.appendChild(overlayEl);
    if (onOpen) onOpen(overlayEl.querySelector('.drawer'));
    return overlayEl.querySelector('.drawer');
  };
  U.close = () => { if (overlayEl) { overlayEl.remove(); overlayEl = null; } };
  U.confirm = (title, text, okLabel, onOk, danger) => {
    const m = U.modal(title, `<p style="margin:0">${text}</p>`, { foot: `<button class="btn" data-close>${A.t('Cancel', 'বাতিল')}</button><button class="btn ${danger ? 'dark' : 'primary'}" id="cf-ok">${okLabel}</button>` });
    m.querySelector('#cf-ok').onclick = () => { U.close(); onOk(); };
  };
  A.toast = (msg, tone = '') => { let h = document.querySelector('.toasts'); if (!h) { h = document.createElement('div'); h.className = 'toasts'; document.body.appendChild(h); } const t = document.createElement('div'); t.className = 'toast ' + tone; t.textContent = msg; h.appendChild(t); setTimeout(() => t.remove(), 2600); };
  U.copy = (text) => { try { navigator.clipboard.writeText(text).then(() => A.toast(A.t('Copied', 'কপি হয়েছে'))).catch(() => A.toast(text)); } catch (e) { A.toast(text); } };
  U.download = (name) => A.toast(A.t(`${name} is ready — in the real admin it downloads as a file`, `${name} তৈরি — আসল অ্যাডমিনে ফাইল হিসেবে ডাউনলোড হবে`), 'good');

  /* ---------------- charts (SVG) ---------------- */
  const CH = (A.chart = {});
  const nice = (max) => { if (max <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(max))); const f = max / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; };
  let chId = 0;
  const r1 = (v) => Math.round(v * 10) / 10;
  /* Smooth line that never overshoots (monotone cubic, Fritsch–Carlson). */
  const smoothPath = (P) => {
    const n = P.length; if (n < 2) return n ? `M${r1(P[0][0])},${r1(P[0][1])}` : ''; if (n === 2) return `M${r1(P[0][0])},${r1(P[0][1])}L${r1(P[1][0])},${r1(P[1][1])}`;
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = P[i + 1][0] - P[i][0]; m[i] = dx[i] ? (P[i + 1][1] - P[i][1]) / dx[i] : 0; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
    let d = `M${r1(P[0][0])},${r1(P[0][1])}`;
    for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += `C${r1(P[i][0] + h)},${r1(P[i][1] + t[i] * h)} ${r1(P[i + 1][0] - h)},${r1(P[i + 1][1] - t[i + 1] * h)} ${r1(P[i + 1][0])},${r1(P[i + 1][1])}`; }
    return d;
  };
  /* Hover data travels with the chart as JSON; one document listener (see boot) draws the tooltip. */
  const tipData = (labels, series) => A.esc(JSON.stringify({ l: labels.map(String), s: series.map((s) => ({ n: s.name || '', c: s.color, d: !!s.dashed, v: s.text })) }));
  CH.line = ({ labels, series, height = 220, money = true, area = true }) => {
    const W = 640, H = height, L = 50, R = 16, T = 22, B = 26; const n = labels.length; const id = 'lg' + ++chId;
    const max = nice(Math.max(1, ...series.flatMap((s) => s.values)));
    const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)); const y = (v) => T + (H - T - B) * (1 - Math.max(0, v) / max);
    const fmtv = (v) => (money ? A.fmt.tkShort(v) : A.fmt.num(v)); const full = (v) => (money ? A.fmt.tk(v) : A.fmt.num(v));
    let defs = '', g = '';
    g += [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${r1(y(f * max))}" y2="${r1(y(f * max))}" class="${f ? 'gl' : 'gl0'}"/><text x="${L - 8}" y="${r1(y(f * max) + 4)}" text-anchor="end">${fmtv(f * max)}</text>`).join('');
    const every = Math.max(1, Math.ceil(n / 7));
    g += labels.map((l, i) => (i % every === 0 && (n - 1 - i >= every * 0.6 || i === n - 1) || i === n - 1 ? `<text x="${r1(x(i))}" y="${H - 6}" text-anchor="${i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'}">${l}</text>` : '')).join('');
    const order = series.map((s, i) => [s, i]).sort((a, b) => (b[0].dashed ? 1 : 0) - (a[0].dashed ? 1 : 0));
    const main = series.find((s) => !s.dashed);
    for (const [s] of order) {
      const P = s.values.map((v, i) => [x(i), y(v)]); const d = smoothPath(P);
      if (area && !s.dashed && s === main) { defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:.24"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient>`; g += `<path d="${d}L${r1(x(n - 1))},${r1(y(0))}L${r1(x(0))},${r1(y(0))}Z" fill="url(#${id})" stroke="none"/>`; }
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.dashed ? 1.6 : s === main ? 2.4 : 2}" ${s.dashed ? 'stroke-dasharray="4 5" opacity=".7"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    for (const s of series) if (!s.dashed && n) { const lx = x(n - 1), ly = y(s.values[n - 1]); g += s === main ? `<circle cx="${r1(lx)}" cy="${r1(ly)}" r="8" fill="${s.color}" opacity=".16"/><circle cx="${r1(lx)}" cy="${r1(ly)}" r="4.2" fill="${s.color}" stroke="var(--card)" stroke-width="2"/>` : `<circle cx="${r1(lx)}" cy="${r1(ly)}" r="3.2" fill="${s.color}" stroke="var(--card)" stroke-width="1.5"/>`; }
    if (main && n) { const v = main.values[n - 1]; const txt = fmtv(v); const w = txt.length * 6.6 + 14; const lx = Math.min(W - R - w / 2, x(n - 1)); const ly = Math.max(10, y(v) - 20); g += `<g class="ch-last"><rect x="${r1(lx - w / 2)}" y="${r1(ly - 10)}" width="${r1(w)}" height="19" rx="6" fill="${main.color}"/><text x="${r1(lx)}" y="${r1(ly + 4)}" text-anchor="middle">${txt}</text></g>`; }
    // hover zones + guide
    const step = n > 1 ? (W - L - R) / (n - 1) : W - L - R;
    g += `<line class="ch-guide" x1="0" x2="0" y1="${T}" y2="${H - B}"/>`;
    g += labels.map((l, i) => `<rect class="ch-hz" data-i="${i}" data-x="${r1(x(i))}" x="${r1(x(i) - step / 2)}" y="${T}" width="${r1(step)}" height="${H - T - B}"/>`).join('');
    const tip = tipData(labels, series.map((s) => ({ ...s, text: s.values.map(full) })));
    const leg = series.length > 1 ? `<div class="legend">${series.map((s) => `<span>${s.dashed ? `<i class="lk dash" style="border-color:${s.color}"></i>` : `<i class="lk" style="background:${s.color}"></i>`}${s.name}</span>`).join('')}</div>` : '';
    return `${leg}<div class="chart-w" data-tip="${tip}" data-w="${W}"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><defs>${defs}</defs>${g}</svg><div class="ch-tip"></div></div>`;
  };
  CH.bars = ({ items, money = true, color = 'var(--accent)', max }) => {
    const m = max || Math.max(1, ...items.map((i) => i.value));
    return `<div class="list ch-bars">${items.map((it) => `<div class="ch-bar"><div class="row between"><span class="ellip">${it.label}</span><b class="num">${it.text || (money ? A.fmt.tk(it.value) : A.fmt.num(it.value))}</b></div>${U.bar(it.value / m * 100, it.color || color)}</div>`).join('')}</div>`;
  };
  const colPath = (x, y0, w, h, rad) => { if (h <= 0.5) return ''; const r = Math.min(rad, w / 2, h); return `M${r1(x)},${r1(y0)}V${r1(y0 - h + r)}Q${r1(x)},${r1(y0 - h)} ${r1(x + r)},${r1(y0 - h)}H${r1(x + w - r)}Q${r1(x + w)},${r1(y0 - h)} ${r1(x + w)},${r1(y0 - h + r)}V${r1(y0)}Z`; };
  CH.columns = ({ labels, values, height = 180, money = true, color = 'var(--accent)', values2, color2 = 'var(--c2)' }) => {
    const W = 640, H = height, L = 46, B = 24, T = 18, R = 6; const n = labels.length; const max = nice(Math.max(1, ...values, ...(values2 || [])));
    const bw = (W - L - R) / n; const y = (v) => T + (H - T - B) * (1 - Math.max(0, v) / max); const y0 = y(0);
    const fs = (v) => (money ? A.fmt.tkShort(v) : A.fmt.num(v));
    let g = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${r1(y(f * max))}" y2="${r1(y(f * max))}" class="${f ? 'gl' : 'gl0'}"/><text x="${L - 8}" y="${r1(y(f * max) + 4)}" text-anchor="end">${fs(f * max)}</text>`).join('');
    const every = Math.max(1, Math.ceil(n / 10)); const showVals = n <= 12 && !values2;
    const peak = values.indexOf(Math.max(...values));
    values.forEach((v, i) => {
      const w = values2 ? Math.min(26, bw * 0.36) : Math.min(44, bw * 0.62); const x0 = L + i * bw + (bw - (values2 ? w * 2 + 2 : w)) / 2;
      g += `<path d="${colPath(x0, y0, w, y0 - y(v), 5)}" fill="${color}" ${showVals && i !== peak && i !== n - 1 ? 'opacity=".78"' : ''}/>`;
      if (values2) g += `<path d="${colPath(x0 + w + 2, y0, w, y0 - y(values2[i]), 5)}" fill="${color2}"/>`;
      if (showVals && v > 0) g += `<text x="${r1(x0 + w / 2)}" y="${r1(y(v) - 5)}" text-anchor="middle" class="vl">${fs(v)}</text>`;
      if (i % every === 0) g += `<text x="${r1(L + i * bw + bw / 2)}" y="${H - 6}" text-anchor="middle">${labels[i]}</text>`;
    });
    g += labels.map((l, i) => `<rect class="ch-hz" data-i="${i}" data-x="${r1(L + i * bw + bw / 2)}" x="${r1(L + i * bw)}" y="${T}" width="${r1(bw)}" height="${r1(H - T - B)}"/>`).join('');
    const full = (v) => (money ? A.fmt.tk(v) : A.fmt.num(v));
    const ser = [{ name: '', color, text: values.map(full) }]; if (values2) ser.push({ name: '', color: color2, text: values2.map(full) });
    return `<div class="chart-w" data-tip="${tipData(labels, ser)}" data-w="${W}"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${g}</svg><div class="ch-tip"></div></div>`;
  };
  CH.donut = ({ parts, size = 140, center = '', sub = '' }) => {
    const tot = A.sum(parts, (p) => p.value) || 1; const r = 54, cx = 70, cy = 70, C2 = 2 * Math.PI * r; const gap = parts.filter((p) => p.value > 0).length > 1 ? 2.5 : 0;
    let off = 0, g = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--card2)" stroke-width="14"/>`;
    for (const p of parts) { const len = p.value / tot * C2; if (len <= 0) continue; g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.color}" stroke-width="14" stroke-dasharray="${r1(Math.max(0.5, len - gap))} ${r1(C2)}" stroke-dashoffset="${r1(-off)}" transform="rotate(-90 ${cx} ${cy})"><title>${A.esc(p.label)}: ${Math.round(p.value / tot * 100)}%</title></circle>`; off += len; }
    const cs = String(center).replace(/<[^>]+>/g, ''); const fsz = cs.length > 9 ? 15 : cs.length > 6 ? 18 : 21;
    g += `<text x="70" y="${sub ? 72 : 77}" text-anchor="middle" class="dc">${center}</text>`;
    if (sub) g += `<text x="70" y="90" text-anchor="middle" class="ds">${sub}</text>`;
    return `<div class="ch-donut"><svg viewBox="0 0 140 140" width="${size}" height="${size}" style="flex:none;--dfs:${fsz}px">${g}</svg><div class="legend" style="flex-direction:column;gap:7px">${parts.map((p) => `<span><i class="lk" style="background:${p.color}"></i><span class="grow">${p.label}</span><b class="num" style="color:var(--ink)">${Math.round(p.value / tot * 100)}%</b></span>`).join('')}</div></div>`;
  };
  CH.spark = (values, color = 'var(--accent)', w = 90, h = 28) => {
    if (!values.length) return ''; const max = Math.max(1, ...values); const n = values.length; const id = 'sp' + ++chId;
    const P = values.map((v, i) => [n > 1 ? (i / (n - 1)) * (w - 4) + 2 : w / 2, h - 3 - (Math.max(0, v) / max) * (h - 7)]); const d = smoothPath(P); const last = P[n - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${color};stop-opacity:.25"/><stop offset="1" style="stop-color:${color};stop-opacity:0"/></linearGradient></defs><path d="${d}L${r1(last[0])},${h}L${r1(P[0][0])},${h}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${r1(last[0])}" cy="${r1(last[1])}" r="2.4" fill="${color}"/></svg>`;
  };
  /* Tooltip for every .chart-w (wired once in boot). */
  function chartTips() {
    const hide = (w) => { const tip = w.querySelector('.ch-tip'); if (tip) tip.classList.remove('on'); const gl = w.querySelector('.ch-guide'); if (gl) gl.classList.remove('on'); };
    document.addEventListener('pointerover', (e) => {
      const z = e.target.closest && e.target.closest('.ch-hz'); if (!z) return; const w = z.closest('.chart-w'); if (!w) return;
      let d; try { d = JSON.parse(w.dataset.tip); } catch (err) { return; }
      const i = +z.dataset.i; const tip = w.querySelector('.ch-tip'); const gl = w.querySelector('.ch-guide'); const xv = +z.dataset.x;
      if (gl) { gl.setAttribute('x1', xv); gl.setAttribute('x2', xv); gl.classList.add('on'); }
      tip.innerHTML = `<b>${A.esc(d.l[i])}</b>` + d.s.map((s) => `<div><i style="background:${s.c};${s.d ? 'opacity:.55' : ''}"></i>${s.n ? `<span>${A.esc(s.n)}</span>` : ''}<b class="num">${A.esc(s.v[i])}</b></div>`).join('');
      const W = +w.dataset.w || 640; const px = (xv / W) * w.clientWidth; tip.classList.add('on');
      const tw = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(w.clientWidth - tw, px - tw / 2)) + 'px';
    });
    document.addEventListener('pointerout', (e) => { const w = e.target.closest && e.target.closest('.chart-w'); if (w && !w.contains(e.relatedTarget)) hide(w); });
  }
  CH.funnel = (steps) => { const max = steps[0].value || 1; return `<div class="list">${steps.map((s, i) => `<div class="li" style="flex-direction:column;align-items:stretch;gap:6px;border:0;padding:6px 0"><div class="row between small"><span>${s.label}</span><span><b class="num">${A.fmt.num(s.value)}</b>${i ? ` <span class="muted">· ${A.fmt.pct(s.value / steps[i - 1].value * 100)} ${A.t('of previous', 'আগের ধাপের')}</span>` : ''}</span></div><div class="bar" style="height:22px;border-radius:6px"><i style="width:${Math.max(1.5, s.value / max * 100)}%;background:var(--c${(i % 6) + 1});border-radius:6px"></i></div></div>`).join('')}</div>`; };
  CH.waterfall = (steps) => { // [{label, value, total?}]
    const W = 640, H = 240, L = 10, B = 54, T = 10; const n = steps.length; let run = 0; const bars = [];
    for (const s of steps) { if (s.total) { bars.push({ ...s, a: 0, b: s.value }); run = s.value; } else { const a = run, b = run + s.value; bars.push({ ...s, a, b }); run = b; } }
    const max = nice(Math.max(...bars.map((b) => Math.max(b.a, b.b)))); const min = Math.min(0, ...bars.map((b) => Math.min(b.a, b.b)));
    const y = (v) => T + (H - T - B) * (1 - (v - min) / (max - min)); const bw = (W - L * 2) / n;
    let g = `<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line2)"/>`;
    bars.forEach((b, i) => { const x0 = L + i * bw + bw * 0.12; const top = y(Math.max(b.a, b.b)); const hh = Math.max(1, Math.abs(y(b.a) - y(b.b))); const col = b.total ? 'var(--navy2)' : b.value >= 0 ? 'var(--good)' : 'var(--bad)'; g += `<rect x="${x0}" y="${top}" width="${bw * 0.76}" height="${hh}" rx="3" fill="${col}"><title>${b.label}: ${A.fmt.tk(b.value)}</title></rect><text x="${x0 + bw * 0.38}" y="${top - 4}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${A.fmt.tkShort(b.value)}</text><text x="${x0 + bw * 0.38}" y="${H - 34}" text-anchor="middle">${b.label.split(' ')[0]}</text>${b.label.split(' ')[1] ? `<text x="${x0 + bw * 0.38}" y="${H - 20}" text-anchor="middle">${b.label.split(' ').slice(1).join(' ')}</text>` : ''}`; });
    return `<div style="overflow-x:auto"><svg class="chart" viewBox="0 0 ${W} ${H}" style="min-width:560px">${g}</svg></div>`;
  };

  /* ---------------- navigation model ---------------- */
  const T = (en, bn) => ({ en, bn });
  A.NAV = [
    { id: 'home', icon: 'home', name: T('Home', 'ড্যাশবোর্ড'), tabs: [] },
    { id: 'orders', icon: 'orders', name: T('Orders', 'অর্ডার'), count: 'confirm', tabs: [['batch', T('Batch', 'ব্যাচ')], ['all', T('All orders', 'সব অর্ডার')], ['processing', T('Processing', 'প্রসেসিং')], ['ship', T('To ship', 'পাঠানো বাকি')], ['courier', T('With courier', 'কুরিয়ারে')], ['returns', T('Returns & exchanges', 'রিটার্ন ও এক্সচেঞ্জ')], ['incomplete', T('Incomplete orders', 'অসম্পূর্ণ অর্ডার')]] },
    { id: 'couriers', icon: 'truck', name: T('Couriers', 'কুরিয়ার'), tabs: [['overview', T('All couriers', 'সব কুরিয়ার')], ['c360', T('Courier 360', 'কুরিয়ার 360')], ['claims', T('Claims & payouts', 'ক্লেইম ও পেআউট')], ['setup', T('Setup', 'সেটআপ')]] },
    { id: 'products', icon: 'products', name: T('Products', 'প্রোডাক্ট'), count: 'publish', tabs: [['all', T('All products', 'সব প্রোডাক্ট')], ['add', T('Add product', 'নতুন প্রোডাক্ট')], ['stock', T('Stock', 'স্টক')], ['ranking', T('Shop ranking', 'দোকানে সাজানো')], ['combos', T('Combos', 'কম্বো')], ['sets', T('Sets', 'সেট')], ['reviews', T('Reviews & questions', 'রিভিউ ও প্রশ্ন')], ['sizecharts', T('Size charts', 'সাইজ চার্ট')]] },
    { id: 'customers', icon: 'customers', name: T('Customers', 'কাস্টমার'), tabs: [['all', T('All customers', 'সব কাস্টমার')], ['groups', T('Customer groups', 'কাস্টমার গ্রুপ')], ['loyalty', T('Loyalty & wallet', 'লয়্যালটি ও ওয়ালেট')], ['merge', T('Duplicates to merge', 'ডুপ্লিকেট মার্জ')]] },
    { id: 'inbox', icon: 'inbox', name: T('Inbox', 'ইনবক্স'), count: 'inbox', tabs: [['chats', T('Conversations', 'কথোপকথন')], ['replies', T('Quick replies', 'দ্রুত উত্তর')], ['stats', T('Response times', 'উত্তরের সময়')]] },
    { id: 'rules', icon: 'rules', name: T('Rules', 'নিয়ম'), tabs: [['all', T('All rules', 'সব নিয়ম')], ['coupons', T('Offers & discounts', 'অফার ও ডিসকাউন্ট')], ['popups', T('Pop-ups & notices', 'পপ-আপ ও নোটিশ')]] },
    { id: 'marketing', icon: 'marketing', name: T('Marketing', 'মার্কেটিং'), tabs: [['overview', T('Overview', 'সারসংক্ষেপ')], ['campaigns', T('Ad campaigns', 'বিজ্ঞাপন ক্যাম্পেইন')], ['messages', T('Message campaigns', 'মেসেজ ক্যাম্পেইন')], ['audiences', T('Audiences', 'অডিয়েন্স')], ['calendar', T('Calendar', 'ক্যালেন্ডার')], ['plan', T('Plan & ideas', 'পরিকল্পনা ও আইডিয়া')], ['tools', T('Accounts & tools', 'অ্যাকাউন্ট ও টুল')]] },
    { id: 'website', icon: 'website', name: T('Website', 'ওয়েবসাইট'), tabs: [['layout', T('Page layouts', 'পেজ লেআউট')], ['text', T('Shop text', 'দোকানের লেখা')], ['policies', T('Policies', 'পলিসি')], ['blog', T('Blog', 'ব্লগ')], ['analytics', T('Analytics', 'অ্যানালিটিক্স')], ['seo', T('SEO & Google ranking', 'SEO ও গুগল র‍্যাঙ্কিং')]] },
    { id: 'finance', icon: 'finance', name: T('Finance', 'হিসাব'), tabs: [['overview', T('Overview', 'সারসংক্ষেপ')], ['cash', T('Money in & out', 'টাকার আসা-যাওয়া')], ['pnl', T('Profit & loss', 'লাভ-ক্ষতি')], ['costs', T('Costs & budgets', 'খরচ ও বাজেট')], ['erp', T('ERP account', 'ERP হিসাব')], ['couriers', T('Couriers', 'কুরিয়ার')], ['wallet', T('Wallet & refunds', 'ওয়ালেট ও রিফান্ড')], ['vat', T('VAT', 'ভ্যাট')]] },
    { id: 'reports', icon: 'reports', name: T('Reports', 'রিপোর্ট'), tabs: [['overview', T('Report library', 'রিপোর্ট লাইব্রেরি')], ['sales', T('Sales', 'বিক্রি')], ['profit', T('Profit', 'লাভ')], ['products', T('Products', 'প্রোডাক্ট')], ['customers', T('Customers', 'কাস্টমার')], ['delivery', T('Delivery & returns', 'ডেলিভারি ও রিটার্ন')], ['couriers', T('Couriers', 'কুরিয়ার')], ['marketing', T('Marketing & ads', 'মার্কেটিং ও বিজ্ঞাপন')], ['areas', T('Areas', 'এলাকা')], ['team', T('Team', 'টিম')], ['review', T('Monthly review', 'মাসের রিভিউ')]] },
    { id: 'ai', icon: 'sparkle', name: T('AI Center', 'AI সেন্টার'), count: 'ai', tabs: [['approvals', T('Approvals', 'অনুমোদন')], ['agents', T('AI agents', 'AI এজেন্ট')], ['costs', T('Costs & limits', 'খরচ ও সীমা')], ['train', T('Training', 'ট্রেনিং')]] },
    { id: 'settings', icon: 'settings', name: T('Settings', 'সেটিংস'), tabs: [['store', T('Business settings', 'ব্যবসার সেটিংস')], ['keys', T('System (owner only)', 'সিস্টেম (শুধু মালিক)')]] },
  ];
  A.sec = (id) => A.NAV.find((s) => s.id === id);
  A.nm = (o) => A.t(o.en, o.bn);
  A.mods = {};
  A.mod = (sec, tabs) => { A.mods[sec] = Object.assign(A.mods[sec] || {}, tabs); if (A.ready) A.render(); };

  /* ---------------- router ---------------- */
  A.route = () => { const h = (location.hash || '#home').slice(1); const [sec, tab, id] = h.split('--'); const s = A.sec(sec) ? sec : 'home'; const S = A.sec(s); return { sec: s, tab: tab || (S.tabs[0] ? S.tabs[0][0] : ''), id: id || '' }; };
  A.href = (sec, tab, id) => '#' + [sec, tab, id].filter(Boolean).join('--');
  A.go = (sec, tab, id) => { const h = A.href(sec, tab, id); if (location.hash === h) A.render(); else location.hash = h; };

  /* ---------------- shell ---------------- */
  let navClosed = null; let navT = 0; let navFrom = '';
  function shell() {
    const r = A.route(); const cnt = C.counts();
    if (navClosed && navClosed !== r.sec) navClosed = null;
    const nav = A.NAV.map((s) => {
      const on = s.id === r.sec; const c = s.count ? cnt[s.count] : 0; const shut = on && navClosed === s.id;
      const sub = on && s.tabs.length ? `<div class="nav-sub ${shut ? 'shut' : ''}" id="nav-sub-${s.id}"><div>${s.tabs.map((t) => `<a href="${A.href(s.id, t[0])}" class="${t[0] === r.tab ? 'on' : ''}">${A.nm(t[1])}</a>`).join('')}</div></div>` : '';
      const chev = s.tabs.length ? `<span class="nav-chev ${on && !shut ? 'open' : ''}">${I('chevdown', 14)}</span>` : '';
      return `<a class="nav-item ${on ? 'on' : ''}" href="${A.href(s.id)}" data-sec="${s.id}" ${s.tabs.length ? `aria-expanded="${on && !shut}"` : ''}>${I(s.icon)}<span class="nl">${A.nm(s.name)}</span>${c ? `<span class="cnt">${c}</span>` : ''}${chev}</a>${sub}`;
    }).join('');
    const S = A.sec(r.sec); const tabName = S.tabs.find((t) => t[0] === r.tab);
    const bottom = [['home', 'home'], ['orders', 'orders', cnt.confirm], ['products', 'products'], ['inbox', 'inbox', cnt.inbox], ['reports', 'reports']].map((b) => `<a href="${A.href(b[0])}" class="${r.sec === b[0] ? 'on' : ''}">${I(b[1])}<span>${A.nm(A.sec(b[0]).name)}</span>${b[2] ? `<span class="cnt">${b[2]}</span>` : ''}</a>`).join('');
    return `<div class="app">
      <aside class="side" aria-label="Menu">
        <div class="brand"><div class="brand-logo">E</div><div><b>EXTAS</b><small>${A.t('Admin · demo data', 'অ্যাডমিন · ডেমো ডেটা')}</small></div></div>
        <button class="searchbtn" id="open-search">${I('search')}<span>${A.t('Search orders, products…', 'অর্ডার, প্রোডাক্ট খুঁজুন…')}</span><kbd>/</kbd></button>
        <nav class="nav">${nav}<button class="nav-item" id="open-map" style="margin-top:6px;color:var(--muted)">${I('menu')}<span>${A.t('Admin map', 'অ্যাডমিন ম্যাপ')}</span></button></nav>
        <div class="side-foot"><div class="avatar">M</div><div style="min-width:0"><b class="ellip" style="display:block">Mehadi Hasan</b><span class="muted small">${A.t('Owner', 'মালিক')}</span></div></div>
      </aside>
      <div class="scrim" id="scrim"></div>
      <div class="main">
        <header class="top">
          <button class="iconbtn menu-btn" id="menu-btn" aria-label="Menu">${I('menu')}</button>
          <div class="crumb">${A.nm(S.name)}${tabName ? ' › ' + A.nm(tabName[1]) : ''}</div>
          <span class="sp"></span>
          <span class="demo-pill hide-sm">${A.t('Prototype · sample data', 'প্রোটোটাইপ · নমুনা ডেটা')}</span>
          <button class="iconbtn hide-sm" id="view-shop" aria-label="View shop" title="${A.t('View shop', 'দোকান দেখুন')}">${I('ext')}</button>
          <button class="iconbtn" id="open-help" aria-label="Help" title="${A.t('Help for this page', 'এই পেজের সাহায্য')}">${I('help')}</button>
          <button class="iconbtn" id="open-notes" aria-label="Notifications">${I('bell')}<span class="dot"></span></button>
          <button class="iconbtn hide-sm" id="theme-btn" aria-label="Dark mode">${I('moon')}</button>
          <div class="lang" role="group" aria-label="Language"><button class="${A.lang === 'en' ? 'on' : ''}" data-lang="en">EN</button><button class="${A.lang === 'bn' ? 'on' : ''}" data-lang="bn">বাং</button></div>
        </header>
        <main class="content" id="page"></main>
      </div>
      <nav class="bottombar" aria-label="Quick menu">${bottom}</nav>
    </div>`;
  }

  A.pageHead = (title, sub, acts = '') => `<div class="phead"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
  A.tabsBar = (sec, tab) => { const S = A.sec(sec); if (!S.tabs.length) return ''; return `<nav class="tabs" aria-label="Tabs">${S.tabs.map((t) => `<a href="${A.href(sec, t[0])}" class="${t[0] === tab ? 'on' : ''}">${A.nm(t[1])}</a>`).join('')}</nav>`; };

  A.render = () => {
    if (!A.D) return;
    if (location.hash === '#map' && A.renderMapPage) { document.body.classList.toggle('bn', A.lang === 'bn'); A.renderMapPage(document.getElementById('root')); return; } // Admin map: full page in its own window
    const root = document.getElementById('root'); const scrollY = window.scrollY; const keep = root.dataset.k === location.hash;
    root.innerHTML = shell(); root.dataset.k = location.hash;
    document.body.classList.toggle('bn', A.lang === 'bn'); document.body.classList.remove('menu-open');
    const r = A.route(); const el = document.getElementById('page'); const S = A.sec(r.sec);
    const m = A.mods[r.sec]; const tabKey = r.tab || 'main'; const h = m && (m[tabKey] || m.main);
    try {
      if (h && h.render) h.render(el, r);
      else el.innerHTML = A.pageHead(A.nm(S.name), '') + A.tabsBar(r.sec, r.tab) + U.card('', `<div class="empty">${A.t('This section arrives in the next update tonight.', 'এই অংশ আজ রাতের পরের আপডেটে আসছে।')}</div>`);
    } catch (err) {
      console.error(err);
      el.innerHTML = A.pageHead(A.nm(S.name), '') + A.tabsBar(r.sec, r.tab) + U.callout(A.t('This page hit a problem in the prototype: ', 'প্রোটোটাইপের এই পেজে সমস্যা: ') + A.esc(err.message), 'bad', 'warn');
    }
    if (keep) window.scrollTo(0, scrollY); else window.scrollTo(0, 0);
    wire();
  };

  function wire() {
    const $ = (s) => document.querySelector(s);
    $('#menu-btn').onclick = () => document.body.classList.add('menu-open');
    $('#scrim').onclick = () => document.body.classList.remove('menu-open');
    // Menu: a click on the open menu (or a double-click) folds its sub-menu; a click on another menu opens that page.
    document.querySelectorAll('.nav-item[data-sec]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const sec = a.dataset.sec; const cur = A.route().sec; const S = A.sec(sec);
        if (sec !== cur || !S.tabs.length) { navT = Date.now(); navFrom = sec; return; }
        e.preventDefault();
        if (Date.now() - navT < 400) return; // second click of a double-click: one fold only
        navT = Date.now(); navFrom = sec;
        navClosed = navClosed === sec ? null : sec;
        const sub = document.getElementById('nav-sub-' + sec); if (sub) sub.classList.toggle('shut', navClosed === sec);
        const ch = a.querySelector('.nav-chev'); if (ch) ch.classList.toggle('open', navClosed !== sec);
        a.setAttribute('aria-expanded', String(navClosed !== sec));
      });
      a.addEventListener('dblclick', (e) => e.preventDefault());
    });
    document.querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => A.setLang(b.dataset.lang)));
    $('#theme-btn').onclick = () => { const r = document.documentElement; const dark = r.dataset.theme === 'dark' || (!r.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches); r.dataset.theme = dark ? 'light' : 'dark'; };
    $('#open-search').onclick = palette;
    $('#open-help').onclick = () => (A.helpPanel ? A.helpPanel() : help());
    $('#open-notes').onclick = notes;
    $('#open-map').onclick = () => { document.body.classList.remove('menu-open'); A.openMap(); };
    $('#view-shop').onclick = () => A.toast(A.t('Opens extas.com.bd in a new tab', 'নতুন ট্যাবে extas.com.bd খুলবে'));
  }

  function palette() {
    const items = [];
    for (const s of A.NAV) { items.push({ l: A.nm(s.name), h: A.href(s.id), k: 'page' }); for (const t of s.tabs) items.push({ l: A.nm(s.name) + ' › ' + A.nm(t[1]), h: A.href(s.id, t[0]), k: 'page' }); }
    const m = U.modal(A.t('Search', 'খুঁজুন'), `<input class="inp" id="pal-q" placeholder="${A.t('Order no., phone, product, page…', 'অর্ডার নম্বর, ফোন, প্রোডাক্ট, পেজ…')}" autocomplete="off"><div class="pal-list" id="pal-l"></div>`);
    const q = m.querySelector('#pal-q'); const list = m.querySelector('#pal-l');
    const draw = () => {
      const s = q.value.trim().toLowerCase(); let res = [];
      if (s) {
        res = res.concat(A.D.orders.filter((o) => o.id.toLowerCase().includes(s) || o.phone.includes(s) || o.name.toLowerCase().includes(s)).slice(0, 6).map((o) => ({ l: `${o.id} · ${o.name} · ${A.fmt.tk(o.total)}`, h: A.href('orders', 'all', o.id), k: A.t('Order', 'অর্ডার') })));
        res = res.concat(A.D.products.filter((p) => p.name.toLowerCase().includes(s) || p.styleCode.toLowerCase().includes(s)).slice(0, 6).map((p) => ({ l: `${p.name} · ${p.styleCode}`, h: A.href('products', 'all', p.id), k: A.t('Product', 'প্রোডাক্ট') })));
        res = res.concat(A.D.customers.filter((c) => c.name.toLowerCase().includes(s) || c.phone.includes(s)).slice(0, 4).map((c) => ({ l: `${c.name} · ${c.phone}`, h: A.href('customers', 'all', c.id), k: A.t('Customer', 'কাস্টমার') })));
        res = res.concat(items.filter((i) => i.l.toLowerCase().includes(s)).slice(0, 8).map((i) => ({ ...i, k: A.t('Page', 'পেজ') })));
      } else res = items.slice(0, 12).map((i) => ({ ...i, k: A.t('Page', 'পেজ') }));
      list.innerHTML = res.map((r) => `<a href="${r.h}"><span class="badge">${r.k}</span><span class="ellip">${A.esc(r.l)}</span></a>`).join('') || U.empty(A.t('Nothing found', 'কিছু পাওয়া যায়নি'));
      list.querySelectorAll('a').forEach((a) => (a.onclick = () => U.close()));
    };
    q.oninput = draw; draw(); setTimeout(() => q.focus(), 30);
  }
  function help() {
    const r = A.route(); const m = A.mods[r.sec]; const h = m && (m[r.tab || 'main'] || m.main); const S = A.sec(r.sec); const tab = S.tabs.find((t) => t[0] === r.tab);
    const g = h && h.guide ? A.t(h.guide.en, h.guide.bn) : A.t('Guide for this page comes with the final build.', 'এই পেজের গাইড আসল বিল্ডে থাকবে।');
    U.drawer(A.t('Help: ', 'সাহায্য: ') + A.nm(S.name) + (tab ? ' › ' + A.nm(tab[1]) : ''), `<div class="card stack">${g}</div><button class="btn" id="help-map">${I('menu')} ${A.t('See the whole admin map', 'পুরো অ্যাডমিন ম্যাপ দেখুন')}</button>${U.callout(A.t('Every page in the real admin has this guide in simple Bengali, with marked screenshots.', 'আসল অ্যাডমিনে প্রতিটা পেজে এই গাইড থাকবে সহজ বাংলায়, ছবিতে দাগ দিয়ে।'))}`, { onOpen: (d) => { d.querySelector('#help-map').onclick = () => A.openMap && A.openMap(); } });
  }
  function notes() {
    const c = C.counts();
    const items = [
      [A.t(`${c.confirm} new orders waiting for a call`, `${c.confirm}টি নতুন অর্ডার কলের অপেক্ষায়`), A.href('orders', 'confirm'), 'accent'],
      [A.t(`${c.inbox} customer messages not answered`, `${c.inbox}টি মেসেজের উত্তর বাকি`), A.href('inbox'), 'warn'],
      [A.t(`${c.low} sizes almost out of stock`, `${c.low}টি সাইজ প্রায় শেষ`), A.href('products', 'stock'), 'warn'],
      [A.t('ERP stock synced 11 min ago', 'ERP থেকে স্টক এসেছে 11 মিনিট আগে'), A.href('settings', 'erp'), 'good'],
      [A.t('Backup to Google Drive finished at 3:00 AM', 'রাত 3টায় গুগল ড্রাইভে ব্যাকআপ হয়েছে'), A.href('settings', 'system'), 'good'],
    ];
    U.drawer(A.t('Notifications', 'নোটিফিকেশন'), `<div class="card list">${items.map((i) => `<a class="li" href="${i[1]}" style="text-decoration:none" data-close>${U.badge('•', i[2])}<span class="grow">${i[0]}</span>›</a>`).join('')}</div>`);
  }

  /* ---------------- boot ---------------- */
  A.boot = () => {
    A.load(); A.save(); A.ready = true; chartTips();
    window.addEventListener('hashchange', () => { U.close(); A.render(); });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); palette(); } if (e.key === 'Escape') U.close(); });
    A.render();
  };
})();
