/* EXTAS admin prototype — Incomplete orders (final): list by day, drawer, call, confirm as order, messages, report. Overrides orders--incomplete. */
(function () {
  'use strict';
  const A = window.A, U = A.ui, C = A.calc, t = (e, b) => A.t(e, b), esc = A.esc, tk = (n) => A.fmt.tk(n);
  const HR = 36e5, DAY = 864e5, MAXAUTO = 2;
  const NOW = () => A.TODAY.toISOString();
  const ymd = (d) => A.fmt.ymd(d);
  const norm = (p) => String(p || '').replace(/\D/g, '').slice(-10);
  const prod = (id) => A.byId(A.D.products, id);
  const guard = (fn, d) => { try { const v = fn(); return v == null ? d : v; } catch (e) { return d; } };
  const who = () => guard(() => A.D.ordx.r2.caller, 'Nusrat');

  /* ---------- stages (hotter the further they got) ---------- */
  const STAGES = ['cart', 'phone', 'address', 'payment'];
  const SN = { cart: ['In the bag', 'ব্যাগে'], phone: ['Gave phone', 'ফোন দিয়েছেন'], address: ['Gave address', 'ঠিকানা দিয়েছেন'], payment: ['At payment', 'পেমেন্টে'] };
  const FSTEPS = ['cart', 'phone', 'address', 'delivery', 'payment'];
  const FN = { cart: ['Added to bag', 'ব্যাগে নিয়েছেন', 'Bag', 'ব্যাগ'], phone: ['Gave phone number', 'ফোন নম্বর দিয়েছেন', 'Phone', 'ফোন'], address: ['Gave address', 'ঠিকানা দিয়েছেন', 'Address', 'ঠিকানা'], delivery: ['Chose delivery', 'ডেলিভারি বেছেছেন', 'Delivery', 'ডেলিভারি'], payment: ['Reached payment', 'পেমেন্টে পৌঁছেছেন', 'Payment', 'পেমেন্ট'] };
  const stepOf = (a) => a.lastStep || (a.stage === 'address' && a.step === 'Delivery' ? 'delivery' : a.stage);

  /* ---------- seed (lazy, deterministic) ---------- */
  function ensure() {
    const D = A.D; if (!D) return;
    if (D.incV === 3 && Array.isArray(D.abandoned)) return;
    let s = 20261113; const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)); const pick = (l) => l[Math.floor(rnd() * l.length)];
    const wp = (pairs) => { let r = rnd() * pairs.reduce((x, p) => x + p[1], 0); for (const p of pairs) { if ((r -= p[1]) <= 0) return p[0]; } return pairs[0][0]; };
    const live = D.products.filter((p) => p.status === 'live' && p.variants.length); const custs = D.customers;
    const phones = new Set(custs.map((c) => norm(c.phone)));
    const lastOrd = {}; D.orders.forEach((o) => { const k = norm(o.phone); lastOrd[k] = Math.max(lastOrd[k] || 0, new Date(o.created).getTime()); });
    const FN1 = ['Rakib', 'Tanvir', 'Sabbir', 'Nayeem', 'Imran', 'Shuvo', 'Fahim', 'Arif', 'Mahin', 'Rony', 'Sajid', 'Tamim', 'Jubayer', 'Rifat', 'Hasib', 'Nabil'];
    const LN1 = ['Hossain', 'Ahmed', 'Rahman', 'Islam', 'Khan', 'Uddin', 'Chowdhury', 'Sarkar', 'Mia', 'Biswas'];
    const camps = (D.campaigns || []).map((c) => c.name).filter(Boolean); const campL = camps.length ? camps : ['Eid collection', 'Polo sale'];
    const out = []; let n = 0;
    const mkItems = () => { const k = rnd() < 0.3 ? 2 : 1; const res = []; for (let i = 0; i < k; i++) { const p = pick(live); const v = pick(p.variants); res.push({ pid: p.id, name: p.name, color: v.color, size: v.size, qty: rnd() < 0.15 ? 2 : 1, price: p.price }); } return res; };
    const make = (o) => {
      const items = o.items || mkItems(); const value = items.reduce((x, i) => x + i.price * i.qty, 0);
      const src = o.source || wp([['Facebook ads', 36], ['Google', 18], ['Organic search', 16], ['Direct', 14], ['Instagram', 10], ['TikTok', 6]]);
      const p0 = prod(items[0].pid);
      const a = Object.assign({ id: 'AB' + n++, name: '', phone: '', email: '', address: '', district: '', stage: 'cart', lastStep: 'cart', items, value, item: items[0].name + (items[0].qty > 1 ? ' ×' + items[0].qty : '') + (items.length > 1 ? ' +' + (items.length - 1) : ''), pid: items[0].pid, source: src, campaign: src === 'Facebook ads' || src === 'Instagram' || src === 'TikTok' ? pick(campL) : '', device: wp([['Phone', 78], ['Desktop', 17], ['Tablet', 5]]), landing: wp([['/', 22], ['/collections/new', 18], ['/products/' + (p0 && p0.seo && p0.seo.slug || 'polo'), 40], ['/category/' + (p0 ? p0.cat : 'polo'), 20]]), browserId: 'b-' + ri(100000, 999999), known: false, matchedCustomerId: '', possibleMatch: null, msgs: 0, messaged: false, recovered: false, log: [], calls: [] }, o);
      a.step = a.lastStep === 'delivery' ? 'Delivery' : a.stage === 'payment' ? 'Payment' : a.stage === 'address' ? 'Address' : a.stage === 'phone' ? 'Phone' : 'Phone';
      a.lastAt = a.at; return a;
    };
    const stg = () => wp([['phone', 28], ['address', 34], ['payment', 28]]);
    const detail = (a, st, c) => {
      a.stage = st; a.lastStep = st === 'address' && rnd() < 0.45 ? 'delivery' : st;
      const nm = c ? c.name : pick(FN1) + ' ' + pick(LN1); a.name = st === 'cart' && !c ? '' : nm;
      if (st !== 'cart' || c) a.phone = c ? c.phone : '01' + pick(['7', '8', '9', '3', '5', '6']) + String(ri(10000000, 99999999));
      if (c || st !== 'cart') { if (st !== 'cart') a.name = nm; }
      const loc = c || pick(custs); if (st === 'address' || st === 'payment') { a.district = loc.district; a.address = `House ${ri(1, 120)}, Road ${ri(1, 30)}, ${loc.area}, ${loc.district}`; }
      if ((st !== 'cart' && rnd() < 0.4) || (c && c.email)) a.email = (c && c.email) || nm.split(' ')[0].toLowerCase() + ri(10, 99) + '@gmail.com';
    };
    for (let i = 0; i < 44; i++) {
      const kind = wp([['none', 22], ['poss', 6], ['known', 14], ['later', 14], ['fresh', 40]]);
      const at = new Date(A.TODAY.getTime() - ri(25, 14 * 24 * 60) * 6e4);
      if (kind === 'later') {
        const cand = D.orders.filter((o) => o.channel === 'Website' && new Date(o.created) < A.TODAY.getTime() - 3 * HR && new Date(o.created) > A.TODAY.getTime() - 12 * DAY);
        if (cand.length) { const o = pick(cand); const st = wp([['address', 5], ['payment', 4], ['phone', 2]]); const at2 = new Date(new Date(o.created).getTime() - ri(40, 1500) * 6e4);
          const a = make({ at: at2.toISOString(), items: o.lines.slice(0, 2).map((l) => ({ pid: l.pid, name: l.name, color: l.color, size: l.size, qty: l.qty, price: l.price })) }); detail(a, st, A.byId(custs, o.customerId) || null); a.phone = o.phone; a.name = o.name; out.push(a); continue; }
      }
      if (kind === 'none') { const a = make({ at: at.toISOString() }); out.push(a); continue; }
      if (kind === 'poss') { const c = pick(custs); const a = make({ at: at.toISOString() }); a.possibleMatch = { customerId: c.id, name: c.name, phone: c.phone }; out.push(a); continue; }
      if (kind === 'known') {
        const pool = custs.filter((c) => (lastOrd[norm(c.phone)] || 0) < at.getTime() - HR && (lastOrd[norm(c.phone)] || 0) > 0); const c = pool.length ? pick(pool) : null;
        if (c) { const a = make({ at: at.toISOString() }); detail(a, wp([['cart', 3], ['address', 4], ['payment', 4]]), c); a.known = true; a.matchedCustomerId = c.id; a.phone = c.phone; a.name = c.name; out.push(a); continue; }
      }
      const a = make({ at: at.toISOString() }); let ph; do { ph = '01' + pick(['7', '8', '9', '3', '5', '6']) + String(ri(10000000, 99999999)); } while (phones.has(norm(ph)));
      detail(a, stg()); if (a.phone) a.phone = ph; out.push(a);
    }
    out.forEach((a) => {
      if (!a.phone) return; const age = (A.TODAY - new Date(a.at)) / HR; const ch = rnd() < 0.7 ? 'SMS' : 'WhatsApp';
      if (age > 1 && rnd() < 0.75) a.log.push({ t: new Date(new Date(a.at).getTime() + HR + 6e4 * ri(1, 9)).toISOString(), kind: 'auto', ch, tpl: 'forgot', by: 'Auto' });
      if (age > 24 && a.log.length && rnd() < 0.55) a.log.push({ t: new Date(new Date(a.at).getTime() + 24 * HR + 6e4 * ri(1, 9)).toISOString(), kind: 'auto', ch, tpl: 'offer', by: 'Auto' });
      if (age > 3 && rnd() < 0.12) a.calls.push({ t: new Date(new Date(a.at).getTime() + 3 * HR).toISOString(), by: pick(['Nusrat', 'Rafi']), out: 'noanswer' });
    });
    out.sort((x, y) => new Date(y.at) - new Date(x.at)); out.forEach((a, i) => { a.id = 'AB' + (out.length - i); a.msgs = a.log.filter((l) => l.kind === 'auto').length; a.messaged = a.msgs > 0; });
    D.abandoned = out; D.incV = 3;
  }

  /* ---------- automatic rule: ANY later order (same phone or email) takes the person out of Open ---------- */
  function laterOrder(a) {
    const p = norm(a.phone), e = (a.email || '').toLowerCase(), at = new Date(a.at).getTime();
    if (!p && !e) return null;
    return A.D.orders.filter((o) => new Date(o.created).getTime() > at && ((p && norm(o.phone) === p) || (e && o.email && String(o.email).toLowerCase() === e))).sort((x, y) => new Date(x.created) - new Date(y.created))[0] || null;
  }
  function sweep() {
    ensure(); let ch = false;
    for (const a of A.D.abandoned) {
      if (a.orderedLater && a.orderedLater.oid) { const exists = A.D.orders.some((o) => o.id === a.orderedLater.oid); if (exists) continue; a.orderedLater = null; a.recovered = false; }
      const o = laterOrder(a); if (!o) continue;
      const ot = new Date(o.created).getTime();
      const call = a.calls.some((c) => c.out === 'confirmed' && new Date(c.t).getTime() <= ot) || a.orderId === o.id;
      const msg = a.log.some((l) => new Date(l.t).getTime() <= ot);
      a.orderedLater = { oid: o.id, at: o.created, by: call ? 'call' : msg ? 'message' : 'self', value: o.total };
      a.recovered = true; ch = true;
    }
    return ch;
  }
  const hasContact = (a) => !!(a.phone || a.possibleMatch);
  const isOpen = (a) => !a.orderedLater && hasContact(a);
  const noNumber = (a) => !a.phone && !a.possibleMatch && !a.orderedLater;
  const autoSent = (a) => a.log.filter((l) => l.kind === 'auto').length;
  const ownSent = (a) => a.log.filter((l) => l.kind === 'own').length;

  /* ---------- customer facts ---------- */
  const custOf = (a) => (a.matchedCustomerId && A.byId(A.D.customers, a.matchedCustomerId)) || (a.phone ? A.D.customers.find((c) => norm(c.phone) === norm(a.phone)) : null) || null;
  const ordersOf = (a) => (a.phone ? A.D.orders.filter((o) => norm(o.phone) === norm(a.phone)) : []);
  const scoreOf = (phone) => guard(() => { const s = A.rulesApi.scoreOf(A.rulesApi.metricsFor(phone)); return Math.round(s * 10) / 10; }, null);
  const metricsOf = (phone) => guard(() => A.rulesApi.metricsFor(phone), null);
  const knownChip = (a) => {
    if (!a.phone) return ''; const n = ordersOf(a).filter((o) => new Date(o.created) <= new Date(a.at) || true).length; if (!n && !a.known) return '';
    const sc = scoreOf(a.phone); return `<span class="inc-chip good" title="${esc(a.known ? t('Recognised by our own browser id', 'আমাদের নিজস্ব ব্রাউজার আইডিতে চেনা গেছে') : t('Existing customer', 'আগের কাস্টমার'))}">${A.icon('check')} ${t(`${n} order${n === 1 ? '' : 's'}`, `${n}টি অর্ডার`)}${sc != null ? ' · ' + t(`score ${sc}/10`, `স্কোর ${sc}/10`) : ''}</span>`;
  };
  const dayLabel = (d) => { const tY = ymd(A.TODAY); if (d === tY) return t('Today', 'আজ'); if (d === ymd(A.TODAY - DAY)) return t('Yesterday', 'গতকাল'); return new Date(d + 'T12:00:00+06:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };

  /* ---------- state ---------- */
  const S = { range: '7d', from: '', to: '', f: 'open', view: 'list', sel: new Set() };
  function rng() {
    const td = ymd(A.TODAY); const first = td.slice(0, 7) + '-01';
    if (S.range === 'today') return [td, td];
    if (S.range === 'yesterday') { const y = ymd(A.TODAY - DAY); return [y, y]; }
    if (S.range === '7d') return [ymd(A.TODAY - 6 * DAY), td];
    if (S.range === 'month') return [first, td];
    if (S.range === 'lastmonth') { const d = new Date(first + 'T12:00:00Z'); const le = new Date(d.getTime() - DAY).toISOString().slice(0, 10); return [le.slice(0, 7) + '-01', le]; }
    return [S.from || '2000-01-01', S.to || td];
  }
  const inRange = (a) => { const [f, to] = rng(); const d = ymd(a.at); return d >= f && d <= to; };

  A.css('inc', `
  .inc-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}
  .inc-kpis .card{padding:14px}
  .inc-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
  .inc-bar .grow{flex:1}
  .inc-cust{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .inc-cust .inp{width:auto}
  .inc-day{display:flex;align-items:baseline;gap:10px;margin:18px 2px 8px;font-weight:700;font-size:14px}
  .inc-day small{color:var(--muted);font-weight:500;font-size:12.5px}
  .inc-row{display:grid;grid-template-columns:22px minmax(0,1.6fr) minmax(0,1.3fr) auto auto minmax(0,.7fr) auto;gap:12px;align-items:center;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:14px;margin-bottom:8px}
  .inc-row:hover{border-color:var(--line2)}
  .inc-row>*{min-width:0}
  .inc-name{font-weight:700;background:none;border:0;padding:0;cursor:pointer;text-align:left;color:var(--ink);font-size:14.5px}
  .inc-name:hover{color:var(--accent);text-decoration:underline}
  .inc-sub{color:var(--muted);font-size:12.5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:3px}
  .inc-chip{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 8px;font-size:11.5px;font-weight:600;background:var(--card2);color:var(--ink2);white-space:nowrap}
  .inc-chip.good{background:color-mix(in srgb,var(--good) 14%,var(--card));color:var(--good)}
  .inc-chip.warn{background:color-mix(in srgb,var(--warn) 16%,var(--card));color:var(--ink)}
  .inc-chip svg{width:12px;height:12px}
  .inc-items{font-size:13px;display:flex;flex-direction:column;gap:2px}
  .inc-val{font-weight:700;text-align:right;white-space:nowrap}
  .inc-st{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px 3px 8px;font-size:12px;font-weight:700;white-space:nowrap}
  .inc-st i{display:inline-flex;gap:2px}
  .inc-st i b{width:5px;height:11px;border-radius:2px;background:currentColor;opacity:.22}
  .inc-st i b.on{opacity:1}
  .inc-st.s1{background:var(--card2);color:var(--muted)}
  .inc-st.s2{background:color-mix(in srgb,var(--c1) 14%,var(--card));color:var(--c1)}
  .inc-st.s3{background:color-mix(in srgb,var(--warn) 20%,var(--card));color:var(--ink)}
  .inc-st.s4{background:color-mix(in srgb,var(--bad) 15%,var(--card));color:var(--bad)}
  .inc-acts{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
  .inc-msgs{font-size:12.5px;color:var(--muted);white-space:nowrap}
  .inc-bulk{position:sticky;top:64px;z-index:5;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--ink);color:var(--card);padding:8px 12px;border-radius:12px;margin-bottom:10px}
  .inc-bulk .btn{background:var(--card);color:var(--ink);border-color:transparent}
  .inc-warn{display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px dashed var(--line2);border-radius:12px;padding:10px 14px;margin:6px 0 4px;font-size:13px;color:var(--ink2)}
  .inc-warn .grow{flex:1}
  .inc-dr .sec{margin-bottom:16px}
  .inc-dr h4{margin:0 0 8px;font-size:13px;color:var(--ink2);text-transform:none}
  .inc-line{display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}
  .inc-line:last-child{border-bottom:0}
  .inc-path{display:flex;gap:4px;flex-wrap:wrap}
  .inc-path span{padding:4px 9px;border-radius:999px;background:var(--card2);font-size:12px;color:var(--muted)}
  .inc-path span.done{background:color-mix(in srgb,var(--good) 14%,var(--card));color:var(--good)}
  .inc-path span.at{background:var(--bad);color:#fff;font-weight:700}
  .inc-tpl{display:flex;gap:6px;flex-wrap:wrap}
  .inc-flow{display:flex;align-items:stretch;gap:0;overflow-x:auto;padding:4px 0 8px}
  .inc-fb{flex:1 1 0;min-width:112px;border:1px solid var(--line);background:var(--card);border-radius:14px;padding:12px;text-align:center;position:relative}
  .inc-fb b.n{display:block;font-size:22px;font-variant-numeric:tabular-nums}
  .inc-fb .l{font-size:12.5px;color:var(--ink2);font-weight:600}
  .inc-fb .x{margin-top:8px;font-size:12px;color:var(--bad);font-weight:600}
  .inc-fb .x.g{color:var(--muted);font-weight:500}
  .inc-ar{align-self:center;width:22px;text-align:center;color:var(--muted);flex:none}
  .inc-sum{display:flex;flex-direction:column;gap:8px}
  .inc-sum p{margin:0;padding:10px 14px;border-radius:12px;background:var(--card2);font-size:14px;line-height:1.5}
  .inc-sum p b{font-weight:700}
  .inc-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .inc-rec{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px}
  .inc-rec div{background:var(--card2);border-radius:12px;padding:10px;text-align:center}
  .inc-rec b{display:block;font-size:20px}
  @media (max-width:980px){
    .inc-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
    .inc-row{grid-template-columns:22px minmax(0,1fr) auto;grid-template-areas:"cb who val" ". items st" ". when acts";row-gap:8px}
    .inc-row .c-cb{grid-area:cb}.inc-row .c-who{grid-area:who}.inc-row .c-items{grid-area:items}.inc-row .c-val{grid-area:val}.inc-row .c-st{grid-area:st;justify-self:end}.inc-row .c-msgs{grid-area:when}.inc-row .c-acts{grid-area:acts}.inc-row .c-when{display:none}
    .inc-split{grid-template-columns:minmax(0,1fr)}
  }
  @media (max-width:560px){.inc-kpis{gap:8px}.inc-rec{grid-template-columns:minmax(0,1fr)}.inc-row{padding:12px 10px}}
  `);

  const stBadge = (a) => { const i = STAGES.indexOf(a.stage); return `<span class="inc-st s${i + 1}"><i>${STAGES.map((s, k) => `<b class="${k <= i ? 'on' : ''}"></b>`).join('')}</i>${t(SN[a.stage][0], SN[a.stage][1])}</span>`; };

  /* ================= LIST ================= */
  function render(el) {
    ensure(); if (sweep()) A.save();
    const all = A.D.abandoned; const inR = all.filter(inRange);
    const open = inR.filter(isOpen); const later = inR.filter((a) => a.orderedLater); const nn = inR.filter(noNumber);
    const hot = open.filter((a) => a.stage === 'address' || a.stage === 'payment');
    const list = S.f === 'later' ? later : open;
    const rangeChips = [['today', 'Today', 'আজ'], ['yesterday', 'Yesterday', 'গতকাল'], ['7d', '7 days', '7 দিন'], ['month', 'This month', 'এই মাস'], ['lastmonth', 'Last month', 'গত মাস'], ['custom', 'Custom', 'কাস্টম']];
    el.innerHTML = A.pageHead(t('Incomplete orders', 'অসম্পূর্ণ অর্ডার'), t('People who started an order and stopped. Start from the top, one by one.', 'যারা অর্ডার শুরু করে থেমে গেছেন। উপর থেকে একটা একটা করে শুরু করুন।'), U.seg('inc-view', [['list', t('List', 'লিস্ট')], ['report', t('Report', 'রিপোর্ট')]], S.view)) + A.tabsBar('orders', 'incomplete') +
      `<div class="inc-bar"><div class="chips" id="inc-r">${rangeChips.map((c) => `<button class="chip ${S.range === c[0] ? 'on' : ''}" data-r="${c[0]}">${t(c[1], c[2])}</button>`).join('')}</div>${S.range === 'custom' ? `<div class="inc-cust"><input class="inp" type="date" id="inc-from" value="${S.from}"><span class="muted">→</span><input class="inp" type="date" id="inc-to" value="${S.to}"></div>` : ''}</div>`;
    if (S.view === 'report') return renderReport(el, inR);
    const rec = later.filter((a) => a.orderedLater.by !== 'self');
    el.innerHTML += `<div class="inc-kpis">
        <div class="card">${U.kpi({ label: t('Open now', 'এখন খোলা'), value: open.length, sub: tk(A.sum(open, (a) => a.value)) + ' ' + t('in bags', 'ব্যাগে'), icon: 'orders' })}</div>
        <div class="card">${U.kpi({ label: t('Hot (address or payment)', 'গরম (ঠিকানা বা পেমেন্ট)'), value: hot.length, sub: tk(A.sum(hot, (a) => a.value)), icon: 'info' })}</div>
        <div class="card">${U.kpi({ label: t('Ordered later', 'পরে অর্ডার দিয়েছেন'), value: later.length, sub: t(`${rec.length} after our call or message`, `${rec.length}টি আমাদের কল বা মেসেজের পর`), icon: 'check' })}</div>
        <div class="card">${U.kpi({ label: t('Left without a number', 'নম্বর না দিয়ে চলে গেছেন'), value: nn.length, sub: t('see the report', 'রিপোর্ট দেখুন'), icon: 'search' })}</div>
      </div>
      <div class="inc-bar"><div class="chips" id="inc-f">${[['open', 'Open', 'খোলা', open.length], ['later', 'Ordered later', 'পরে অর্ডার', later.length]].map((c) => `<button class="chip ${S.f === c[0] ? 'on' : ''}" data-f="${c[0]}">${t(c[1], c[2])} <span class="muted">${c[3]}</span></button>`).join('')}</div><span class="grow"></span>${open.length ? `<span class="small muted">${t('Automatic reminders: 1 hour after they leave, then 24 hours later with an offer. Never more than 2.', 'অটোমেটিক রিমাইন্ডার: চলে যাওয়ার 1 ঘণ্টা পরে, তারপর 24 ঘণ্টা পরে অফারসহ। 2টির বেশি কখনো না।')}</span>` : ''}</div>
      ${S.sel.size ? `<div class="inc-bulk"><b>${t(`${S.sel.size} selected`, `${S.sel.size}টি বাছাই`)}</b><span class="grow" style="flex:1"></span><button class="btn sm" id="inc-bm">${A.icon('send')} ${t('Send a message', 'মেসেজ পাঠান')}</button><button class="btn sm" id="inc-bc">${t('Clear', 'ক্লিয়ার')}</button></div>` : ''}
      <div id="inc-list"></div>
      ${nn.length ? `<div class="inc-warn"><span class="grow">${A.icon('info')} ${t(`${nn.length} left without a number — we cannot call them. They are kept for the report and for ad audiences.`, `${nn.length}জন নম্বর না দিয়ে চলে গেছেন — তাদের কল করা যাবে না। রিপোর্ট ও বিজ্ঞাপনের অডিয়েন্সের জন্য রাখা আছে।`)}</span><button class="btn sm" id="inc-nn">${t('Open the report', 'রিপোর্ট খুলুন')}</button></div>` : ''}`;
    const days = {}; list.forEach((a) => { (days[ymd(a.at)] = days[ymd(a.at)] || []).push(a); });
    const keys = Object.keys(days).sort().reverse();
    el.querySelector('#inc-list').innerHTML = keys.length ? keys.map((d) => { const L = days[d].slice().sort((x, y) => new Date(y.at) - new Date(x.at)); return `<div class="inc-day">${dayLabel(d)} <small>${t(`${L.length} · ${tk(A.sum(L, (a) => a.value))}`, `${L.length}টি · ${tk(A.sum(L, (a) => a.value))}`)}</small></div>${L.map(row).join('')}`; }).join('') : U.empty(S.f === 'later' ? t('Nobody here yet.', 'এখানে এখনো কেউ নেই।') : t('Nothing open in this period. Nice work.', 'এই সময়ে কিছু খোলা নেই। চমৎকার।'));
    wire(el);
  }
  function row(a) {
    const nm = a.name || (a.possibleMatch ? t('Unknown visitor', 'অজানা ভিজিটর') : t('No name yet', 'নাম এখনো নেই'));
    const later = a.orderedLater;
    const BY = { call: ['By call', 'কলে', 'good'], message: ['By message', 'মেসেজে', 'good'], self: ['On their own', 'নিজে নিজে', 'info'] };
    const mid = later ? `${U.badge(t(BY[later.by][0], BY[later.by][1]), BY[later.by][2])}` : stBadge(a);
    const acts = later ? `<a class="btn sm" href="${A.href('orders', 'all', later.oid)}">${esc(later.oid)}</a>` : a.phone
      ? `<a class="btn sm" href="tel:${esc(a.phone)}" data-call="${a.id}" title="${t('Call', 'কল')}">${A.icon('phone')}</a><button class="btn sm" data-msg="${a.id}" title="${t('Send message', 'মেসেজ')}">${A.icon('send')}</button><button class="btn sm primary" data-conf="${a.id}">${t('Confirm as order', 'অর্ডার কনফার্ম')}</button>`
      : `<button class="btn sm" data-open="${a.id}">${t('Details', 'বিস্তারিত')}</button>`;
    const lastCall = a.calls.length ? a.calls[a.calls.length - 1] : null;
    return `<div class="inc-row"><div class="c-cb">${later ? '' : a.phone ? `<input type="checkbox" class="ord-cb" data-sel="${a.id}" ${S.sel.has(a.id) ? 'checked' : ''} style="width:17px;height:17px">` : ''}</div>
      <div class="c-who"><button class="inc-name" data-open="${a.id}">${esc(nm)}</button><div class="inc-sub"><span class="mono">${esc(a.phone || (a.possibleMatch ? '—' : t('no number', 'নম্বর নেই')))}</span>${knownChip(a)}${a.possibleMatch && !a.phone ? `<span class="inc-chip warn" title="${t('Guessed from the network address only. Not attached.', 'শুধু নেটওয়ার্ক অ্যাড্রেস থেকে আন্দাজ। জোড়া হয়নি।')}">${t('Possible match', 'সম্ভাব্য মিল')}</span>` : ''}</div></div>
      <div class="c-items inc-items"><span class="ellip">${esc(a.item)}</span><span class="small muted">${a.items.map((i) => esc(i.color) + ' ' + esc(i.size)).join(' · ')}</span></div>
      <div class="c-val inc-val">${tk(a.value)}</div><div class="c-st">${mid}</div>
      <div class="c-msgs inc-msgs">${later ? t('Ordered ', 'অর্ডার ') + A.fmt.ago(later.at) : `${t('Left', 'ছেড়েছেন')} ${A.fmt.ago(a.at)}<br>${t('Messages', 'মেসেজ')} ${autoSent(a)}/${MAXAUTO}${ownSent(a) ? ' +' + ownSent(a) : ''}${lastCall ? ' · ' + t(OUTS[lastCall.out][0], OUTS[lastCall.out][1]) : ''}`}</div>
      <div class="c-acts inc-acts">${acts}</div></div>`;
  }
  function wire(el) {
    el.querySelectorAll('#inc-view [data-v]').forEach((b) => (b.onclick = () => { S.view = b.dataset.v; A.render(); }));
    el.querySelectorAll('#inc-r [data-r]').forEach((b) => (b.onclick = () => { S.range = b.dataset.r; if (S.range === 'custom' && !S.from) { S.from = ymd(A.TODAY - 13 * DAY); S.to = ymd(A.TODAY); } S.sel.clear(); A.render(); }));
    const fr = el.querySelector('#inc-from'), to = el.querySelector('#inc-to');
    if (fr) fr.onchange = () => { S.from = fr.value; A.render(); }; if (to) to.onchange = () => { S.to = to.value; A.render(); };
    el.querySelectorAll('#inc-f [data-f]').forEach((b) => (b.onclick = () => { S.f = b.dataset.f; S.sel.clear(); A.render(); }));
    const nn = el.querySelector('#inc-nn'); if (nn) nn.onclick = () => { S.view = 'report'; A.render(); };
    const by = (id) => A.D.abandoned.find((x) => x.id === id);
    el.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => drawer(by(b.dataset.open))));
    el.querySelectorAll('[data-call]').forEach((b) => (b.onclick = () => callModal(by(b.dataset.call))));
    el.querySelectorAll('[data-msg]').forEach((b) => (b.onclick = () => msgModal([by(b.dataset.msg)])));
    el.querySelectorAll('[data-conf]').forEach((b) => (b.onclick = () => confirmModal(by(b.dataset.conf))));
    el.querySelectorAll('[data-sel]').forEach((b) => (b.onchange = () => { if (b.checked) S.sel.add(b.dataset.sel); else S.sel.delete(b.dataset.sel); A.render(); }));
    const bm = el.querySelector('#inc-bm'); if (bm) bm.onclick = () => msgModal([...S.sel].map(by).filter(Boolean));
    const bc = el.querySelector('#inc-bc'); if (bc) bc.onclick = () => { S.sel.clear(); A.render(); };
  }

  /* ================= DRAWER ================= */
  function drawer(a) {
    const c = custOf(a); const os = ordersOf(a).sort((x, y) => new Date(y.created) - new Date(x.created));
    const m = metricsOf(a.phone); const sc = a.phone ? scoreOf(a.phone) : null;
    const others = A.D.abandoned.filter((x) => x.id !== a.id && ((a.phone && norm(x.phone) === norm(a.phone)) || x.browserId === a.browserId));
    const cur = FSTEPS.indexOf(stepOf(a));
    const path = `<div class="inc-path">${FSTEPS.map((s, i) => `<span class="${i < cur ? 'done' : i === cur ? 'at' : ''}">${t(FN[s][2], FN[s][3])}</span>`).join('')}</div>`;
    const lines = a.items.map((i) => { const p = prod(i.pid); const v = p && p.variants.find((x) => x.color === i.color && x.size === i.size); const left = v ? v.stock - (v.reserved || 0) : null; return `<div class="inc-line">${p ? U.thumb(p, 48) : ''}<div class="grow" style="min-width:0"><b class="ellip" style="display:block">${esc(i.name)}</b><div class="inc-sub">${U.sw ? U.sw(i.color) : ''}<span>${esc(i.color)}</span><span class="inc-chip">${esc(i.size)}</span><span>× ${i.qty}</span>${left != null ? `<span>${left > 0 ? t(`${left} in stock`, `${left}টি স্টকে`) : t('Out of stock', 'স্টক নেই')}</span>` : ''}</div></div><b>${tk(i.price * i.qty)}</b></div>`; }).join('');
    const body = `<div class="inc-dr">
      <div class="sec"><div class="row between" style="gap:8px;flex-wrap:wrap"><div><div class="strong" style="font-size:17px">${esc(a.name || t('No name yet', 'নাম এখনো নেই'))}</div><div class="mono muted">${esc(a.phone || '—')}${a.email ? ' · ' + esc(a.email) : ''}</div></div>${a.orderedLater ? U.badge(t('Ordered later', 'পরে অর্ডার দিয়েছেন'), 'good') : stBadge(a)}</div>
        <div class="inc-sub" style="margin-top:8px">${knownChip(a)}<span>${t('Left', 'ছেড়েছেন')} ${A.fmt.ago(a.at)}</span><span>· ${esc(a.source)}${a.campaign ? ' · ' + esc(a.campaign) : ''}</span><span>· ${esc(a.device)}</span></div>
        ${a.possibleMatch && !a.phone ? `<div class="callout" style="margin-top:10px">${A.icon('info')}<div>${t(`Possible match (same network, weak): ${esc(a.possibleMatch.name)}. We never attach this by ourselves.`, `সম্ভাব্য মিল (একই নেটওয়ার্ক, দুর্বল): ${esc(a.possibleMatch.name)}। আমরা নিজে থেকে কখনো জোড়া লাগাই না।`)} <button class="btn sm" id="dr-att" style="margin-left:6px">${t('This is them', 'ইনিই')}</button></div></div>` : ''}</div>
      <div class="sec"><h4>${t('In the bag', 'ব্যাগে যা আছে')} · ${tk(a.value)}</h4>${lines}</div>
      <div class="sec"><h4>${t('Where they stopped', 'যেখানে থেমেছেন')}</h4>${path}<div class="small muted" style="margin-top:6px">${t('Came in from', 'এসেছেন')} <span class="mono">${esc(a.landing)}</span></div></div>
      ${a.address ? `<div class="sec"><h4>${t('Address typed', 'লেখা ঠিকানা')}</h4><div>${esc(a.address)}</div></div>` : ''}
      <div class="sec"><h4>${t(`Earlier orders of this phone (${os.length})`, `এই ফোনের আগের অর্ডার (${os.length})`)}</h4>${os.length ? os.slice(0, 6).map((o) => `<a class="inc-line" href="${A.href('orders', 'all', o.id)}" style="text-decoration:none;color:inherit"><span class="mono strong">${esc(o.id)}</span><span class="small muted grow">${A.fmt.date(o.created)}</span>${U.statusBadge ? U.statusBadge(o.status) : ''}<b>${tk(o.total)}</b></a>`).join('') + (os.length > 6 ? `<div class="small muted">${t(`+${os.length - 6} more`, `আরও ${os.length - 6}টি`)}</div>` : '') : `<div class="small muted">${t('First time. No earlier orders.', 'প্রথমবার। আগের কোনো অর্ডার নেই।')}</div>`}</div>
      ${a.phone ? `<div class="sec"><h4>${t('Courier score', 'কুরিয়ার স্কোর')}</h4>${sc != null ? `<div class="row" style="gap:10px;flex-wrap:wrap"><b style="font-size:20px">${sc}/10</b>${m ? `<span class="small muted">${t(`${m.success}% delivered · ${m.parcels} parcels · ${m.returns} returns`, `${m.success}% ডেলিভারি · ${m.parcels}টি পার্সেল · ${m.returns}টি ফেরত`)}</span>` : ''}</div>` : `<div class="small muted">—</div>`}</div>` : ''}
      <div class="sec"><h4>${t(`Earlier incomplete attempts (${others.length})`, `আগের অসম্পূর্ণ চেষ্টা (${others.length})`)}</h4>${others.length ? others.slice(0, 5).map((x) => `<div class="inc-line"><span class="small muted">${A.fmt.date(x.at)}</span><span class="grow ellip">${esc(x.item)}</span>${x.orderedLater ? U.badge(t('Ordered', 'অর্ডার'), 'good') : stBadge(x)}</div>`).join('') : `<div class="small muted">${t('None.', 'নেই।')}</div>`}</div>
      <div class="sec"><h4>${t('Calls and messages', 'কল ও মেসেজ')}</h4>${[...a.calls.map((x) => ({ t: x.t, h: `${U.badge(t(OUTS[x.out][0], OUTS[x.out][1]), OUTS[x.out][2])} <span class="small">${t('Call by', 'কল করেছেন')} ${esc(x.by)}</span>` })), ...a.log.map((x) => ({ t: x.t, h: `${U.badge(x.ch, 'info')} <span class="small">${x.kind === 'auto' ? t('Automatic', 'অটোমেটিক') : t('By', 'পাঠিয়েছেন')} ${x.kind === 'auto' ? '' : esc(x.by)} · ${esc(TPLN(x.tpl))}</span>` }))].sort((p, q) => new Date(q.t) - new Date(p.t)).map((x) => `<div class="inc-line">${x.h}<span class="grow"></span><span class="small muted">${A.fmt.ago(x.t)}</span></div>`).join('') || `<div class="small muted">${t('Nothing yet.', 'এখনো কিছু নেই।')}</div>`}</div></div>`;
    const foot = a.orderedLater ? `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>` : a.phone ? `${c ? `<button class="btn" id="dr-360">${A.icon('ext')} ${t('Open Customer 360', 'কাস্টমার 360 খুলুন')}</button>` : ''}<button class="btn" id="dr-call">${A.icon('phone')} ${t('Call', 'কল')}</button><button class="btn" id="dr-msg">${A.icon('send')} ${t('Message', 'মেসেজ')}</button><button class="btn primary" id="dr-conf">${t('Confirm as order', 'অর্ডার কনফার্ম')}</button>` : `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>`;
    const d = U.drawer(esc(a.name || t('Incomplete order', 'অসম্পূর্ণ অর্ডার')), body, { foot });
    const q = (s) => d.querySelector(s);
    if (q('#dr-360')) q('#dr-360').onclick = () => { const w = window.open(location.pathname + A.href('customers', 'all', c.id), '_blank'); if (!w) A.go('customers', 'all', c.id); };
    if (q('#dr-call')) q('#dr-call').onclick = () => callModal(a);
    if (q('#dr-msg')) q('#dr-msg').onclick = () => msgModal([a]);
    if (q('#dr-conf')) q('#dr-conf').onclick = () => confirmModal(a);
    if (q('#dr-att')) q('#dr-att').onclick = () => { const p = a.possibleMatch; a.phone = p.phone; a.name = p.name; a.matchedCustomerId = p.customerId; a.possibleMatch = null; A.commit(`Attached ${p.name} to incomplete order ${a.id}`); U.close(); A.toast(t('Attached by you', 'আপনি জোড়া লাগালেন'), 'good'); A.render(); };
  }

  /* ================= CALL ================= */
  const OUTS = { confirmed: ['Confirmed', 'কনফার্মড', 'good'], noanswer: ['No answer', 'ধরেননি', 'warn'], wrong: ['Wrong number', 'ভুল নম্বর', 'bad'], change: ['Wants change', 'বদল চান', 'info'], cancelled: ['Cancelled', 'বাতিল', ''] };
  function callModal(a) {
    const m = U.modal(t(`Call ${a.name || a.phone}`, `${a.name || a.phone}-কে কল`), `<div class="row between" style="gap:10px;flex-wrap:wrap"><div><div class="strong mono" style="font-size:20px">${esc(a.phone)}</div><div class="small muted">${esc(a.item)} · ${tk(a.value)}</div></div><a class="btn primary" href="tel:${esc(a.phone)}" id="cl-dial">${A.icon('phone')} ${t('Call now', 'এখনই কল')}</a></div>
      <div class="small muted" style="margin-top:8px">${t(`Calling as ${who()}`, `${who()} হিসেবে কল`)}</div>
      <div class="small strong" style="margin-top:12px">${t('How did the call go?', 'কল কেমন হলো?')}</div>
      <div class="inc-tpl" style="margin-top:8px">${Object.keys(OUTS).map((k) => `<button class="btn ${k === 'confirmed' ? 'primary' : ''}" data-out="${k}">${t(OUTS[k][0], OUTS[k][1])}</button>`).join('')}</div>
      <div class="small strong" style="margin-top:14px">${t(`Attempts (${a.calls.length})`, `চেষ্টা (${a.calls.length})`)}</div>
      ${a.calls.length ? a.calls.slice().reverse().map((x) => `<div class="inc-line">${U.badge(t(OUTS[x.out][0], OUTS[x.out][1]), OUTS[x.out][2])}<span class="grow small">${esc(x.by)}</span><span class="small muted">${A.fmt.ago(x.t)}</span></div>`).join('') : `<div class="small muted">${t('No calls yet.', 'এখনো কল হয়নি।')}</div>`}`, { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>` });
    m.querySelector('#cl-dial').addEventListener('click', () => A.toast(t('Calling from your phone…', 'আপনার ফোন থেকে কল হচ্ছে…')));
    m.querySelectorAll('[data-out]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.out; a.calls.push({ t: NOW(), by: who(), out: k });
      if (k === 'wrong') a.wrong = true;
      A.commit(`Call on incomplete order ${a.id}: ${OUTS[k][0]}`); U.close();
      if (k === 'confirmed') return confirmModal(a);
      A.toast(t(`Saved: ${OUTS[k][0]}`, `সেভ হয়েছে: ${OUTS[k][1]}`), 'good'); A.render();
    }));
  }

  /* ================= CONFIRM AS ORDER ================= */
  const ZN = { inside: ['Inside Dhaka', 'ঢাকার ভেতরে'], sub: ['Dhaka suburbs', 'ঢাকার আশেপাশে'], outside: ['Outside Dhaka', 'ঢাকার বাইরে'] };
  function confirmModal(a) {
    const c = custOf(a); const items = a.items.map((i) => Object.assign({}, i));
    const dists = Array.from(new Set(A.D.customers.map((x) => x.district))).sort(); if (a.district && !dists.includes(a.district)) dists.unshift(a.district);
    const zoneFor = (d) => { const f = A.D.customers.find((x) => x.district === d); return f ? f.zone : d === 'Dhaka' ? 'inside' : 'outside'; };
    const d0 = a.district || (c && c.district) || 'Dhaka';
    const m = U.modal(t('Confirm as order', 'অর্ডার কনফার্ম করুন'), `<div class="small muted" style="margin-bottom:10px">${t('Fill in what the customer tells you on the call. The order is saved as a Phone order.', 'কলে কাস্টমার যা বলছেন তা লিখুন। অর্ডারটি ফোন অর্ডার হিসেবে সেভ হবে।')}</div>
      <div class="formgrid">${U.field(t('Name', 'নাম'), U.input('cf-name', a.name || (c && c.name) || ''))}${U.field(t('Phone', 'ফোন'), U.input('cf-phone', a.phone))}${U.field(t('District', 'জেলা'), U.select('cf-dist', dists, d0))}${U.field(t('Delivery area', 'ডেলিভারি এলাকা'), U.select('cf-zone', Object.keys(ZN).map((z) => [z, t(ZN[z][0], ZN[z][1])]), zoneFor(d0)))}${U.field(t('Payment', 'পেমেন্ট'), U.select('cf-pay', ['COD', 'bKash', 'Nagad'], 'COD'))}</div>
      <div style="margin-top:12px">${U.field(t('Full address', 'পুরো ঠিকানা'), `<textarea class="inp" id="cf-addr" rows="2" placeholder="${t('House, road, area', 'বাড়ি, রোড, এলাকা')}">${esc(a.address || (c ? c.area : ''))}</textarea>`)}</div>
      <div class="small strong" style="margin:14px 0 4px">${t('Items', 'আইটেম')}</div><div id="cf-items"></div><div id="cf-tot" style="margin-top:10px"></div><div id="cf-err" class="small" style="color:var(--bad);margin-top:6px"></div>`, { wide: true, foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="cf-ok">${t('Create order', 'অর্ডার তৈরি করুন')}</button>` });
    const q = (s) => m.querySelector(s);
    const vOf = (i) => { const p = prod(i.pid); return p && p.variants.find((v) => v.color === i.color && v.size === i.size); };
    const paint = () => {
      const sub = A.sum(items, (i) => i.price * i.qty); const fee = C.deliveryFee(q('#cf-zone').value, sub);
      q('#cf-items').innerHTML = items.map((i, k) => { const v = vOf(i); const left = v ? v.stock - (v.reserved || 0) : 99; return `<div class="inc-line"><div class="grow" style="min-width:0"><b class="ellip" style="display:block">${esc(i.name)}</b><div class="inc-sub"><span>${esc(i.color)}</span><span class="inc-chip">${esc(i.size)}</span>${left < i.qty ? `<span class="inc-chip warn">${t(`Only ${Math.max(0, left)} in stock`, `স্টকে আছে ${Math.max(0, left)}টি`)}</span>` : ''}</div></div><input class="inp" type="number" min="1" max="9" value="${i.qty}" data-q="${k}" style="width:64px"><b style="min-width:70px;text-align:right">${tk(i.price * i.qty)}</b></div>`; }).join('');
      q('#cf-tot').innerHTML = `<div class="row between"><span class="muted">${t('Items', 'আইটেম')}</span><b>${tk(sub)}</b></div><div class="row between"><span class="muted">${t('Delivery', 'ডেলিভারি')}</span><b>${fee ? tk(fee) : t('Free', 'ফ্রি')}</b></div><div class="row between" style="font-size:16px;margin-top:4px"><b>${t('Total', 'মোট')}</b><b>${tk(sub + fee)}</b></div>`;
      m.querySelectorAll('[data-q]').forEach((inp) => (inp.onchange = () => { items[+inp.dataset.q].qty = Math.max(1, Math.min(9, +inp.value || 1)); paint(); }));
    };
    q('#cf-dist').onchange = () => { q('#cf-zone').value = zoneFor(q('#cf-dist').value); paint(); }; q('#cf-zone').onchange = paint; paint();
    q('#cf-ok').onclick = () => {
      const name = q('#cf-name').value.trim(), phone = q('#cf-phone').value.trim(), addr = q('#cf-addr').value.trim();
      if (!name || !phone || !addr) { q('#cf-err').textContent = t('Name, phone and address are needed.', 'নাম, ফোন ও ঠিকানা লাগবে।'); return; }
      const o = makeOrder(a, { name, phone, addr, district: q('#cf-dist').value, zone: q('#cf-zone').value, payment: q('#cf-pay').value, items });
      A.commit(`Recovered incomplete order ${a.id} as ${o.id}`); U.close();
      A.toast(t(`Order ${o.id} created — ${o.status === 'confirmed' ? 'confirmed' : 'waiting in Processing'} · stock held`, `অর্ডার ${o.id} তৈরি — ${o.status === 'confirmed' ? 'কনফার্মড' : 'প্রসেসিংয়ে অপেক্ষায়'} · স্টক হোল্ড`), 'good'); A.render();
    };
  }
  function makeOrder(a, f) {
    const D = A.D; const by = who();
    let cu = D.customers.find((x) => norm(x.phone) === norm(f.phone));
    const area = f.addr.split(',').slice(-2, -1)[0] ? f.addr.split(',').slice(-2, -1)[0].trim() : f.district;
    if (!cu) { cu = { id: 'C' + (Math.max(...D.customers.map((x) => +String(x.id).slice(1) || 0)) + 1), name: f.name, phone: f.phone, district: f.district, area, zone: f.zone, created: NOW(), points: 0, wallet: 0, orders: 0, delivered: 0, refused: 0, spent: 0, lastOrder: null, email: a.email || '', tags: [] }; D.customers.push(cu); }
    const lines = f.items.map((i) => { const p = prod(i.pid); const v = p && p.variants.find((x) => x.color === i.color && x.size === i.size); return { pid: i.pid, sku: v ? v.sku : '', name: i.name, color: i.color, size: i.size, qty: i.qty, price: i.price, cost: p ? p.cost : 0 }; });
    const sub = A.sum(lines, (l) => l.price * l.qty); const fee = C.deliveryFee(f.zone, sub);
    const id = 'EX-' + (Math.max(...D.orders.map((x) => +x.id.slice(3) || 0)) + 1);
    const ev = (en, bn, b) => ({ t: NOW(), text: en, bn, by: b || by });
    const o = { id, created: NOW(), customerId: cu.id, name: f.name, phone: f.phone, email: a.email || cu.email || '', district: f.district, area, zone: f.zone, address: f.addr, lines, subtotal: sub, discount: 0, coupon: '', delivery: fee, total: sub + fee, payment: f.payment, paid: false, channel: 'Phone', source: 'Incomplete order', courier: '', tracking: '', status: 'new', risk: 'low', notes: '', tags: ['Recovered by phone'], recoveredFrom: a.id, timeline: [ev('Order taken by phone from an incomplete order', 'অসম্পূর্ণ অর্ডার থেকে ফোনে অর্ডার নেওয়া হয়েছে'), ev('Recovered by phone · ' + by, 'ফোনে উদ্ধার · ' + by)], erp: { pushed: false }, deliveredAt: null, settled: false, returnReason: '', rsv: false, calls: 0, cBy: null, autoWhy: null };
    const res = guard(() => A.rulesApi.classify(o), { action: 'call' });
    const stockOk = lines.every((l) => { const p = prod(l.pid); const v = p && p.variants.find((x) => x.sku === l.sku); return !v || v.stock - (v.reserved || 0) >= l.qty; });
    if (res.action === 'auto' && stockOk) {
      o.status = 'confirmed'; o.cBy = 'rules'; o.autoWhy = { en: 'Customer confirmed on the call; rules agree', bn: 'কলে কাস্টমার কনফার্ম করেছেন; নিয়মও একমত' };
      const no = 'SO-' + (60500 + Math.floor(Math.random() * 9000)); o.erp = { pushed: true, at: NOW(), no };
      o.timeline.push(ev('Confirmed on call', 'কলে কনফার্ম করা হয়েছে'), ev('Sent to ERP as sales order ' + no, 'ERP-তে সেলস অর্ডার ' + no + ' হিসেবে গেছে', 'System'));
      if (guard(() => A.ordersApi.reserve, null)) A.ordersApi.reserve(o, true); else { lines.forEach((l) => { const p = prod(l.pid); const v = p && p.variants.find((x) => x.sku === l.sku); if (v) v.reserved = (v.reserved || 0) + l.qty; }); o.rsv = true; }
      o.timeline.push(ev('Stock held for this order', 'এই অর্ডারের জন্য স্টক হোল্ড', 'System'));
    } else o.timeline.push(ev(stockOk ? 'Rules want a closer look — waiting in Processing' : 'Some pieces are short — waiting in Processing', stockOk ? 'নিয়ম আরেকটু দেখতে চায় — প্রসেসিংয়ে অপেক্ষায়' : 'কিছু পিস কম — প্রসেসিংয়ে অপেক্ষায়', 'System'));
    D.orders.unshift(o); cu.orders = (cu.orders || 0) + 1; cu.lastOrder = o.created;
    a.name = f.name; a.phone = f.phone; a.district = f.district; a.address = f.addr; a.items = f.items; a.value = sub; a.possibleMatch = null;
    if (!a.calls.some((x) => x.out === 'confirmed')) a.calls.push({ t: NOW(), by, out: 'confirmed' });
    a.orderId = o.id; a.orderedLater = { oid: o.id, at: o.created, by: 'call', value: o.total }; a.recovered = true;
    return o;
  }

  /* ================= MESSAGES ================= */
  const TPLS = [['forgot', 'Forgot something?', 'কিছু ভুলে গেছেন?'], ['size', 'Need help with size?', 'সাইজ নিয়ে সাহায্য লাগবে?'], ['delivery', 'Delivery charge question?', 'ডেলিভারি চার্জ নিয়ে প্রশ্ন?'], ['offer', 'Offer', 'অফার'], ['custom', 'Custom text', 'নিজের লেখা']];
  const TPLN = (k) => { const x = TPLS.find((p) => p[0] === k); return x ? t(x[1], x[2]) : k; };
  const offers = () => guard(() => A.offersApi.active(), []) || [];
  function tplText(k, a, offerId) {
    const nm = (a.name || '').split(' ')[0] || t('there', 'ভাই'); const it = a.item; const link = (A.D.store.domain || 'extas.com.bd') + '/bag';
    const z = a.district ? (A.D.customers.find((x) => x.district === a.district) || {}).zone : 'inside'; const dl = A.D.rules.delivery[z || 'inside'] || A.D.rules.delivery.inside; const fr = A.D.rules.freeDelivery;
    if (k === 'forgot') return t(`Hi ${nm}, you left ${it} in your bag at EXTAS. We saved it for you: ${link}`, `${nm}, আপনার ব্যাগে ${it} রেখে গেছেন। আমরা সেভ করে রেখেছি: ${link}`);
    if (k === 'size') return t(`Hi ${nm}, not sure about the size of ${it}? Reply with your height and weight and we will pick the right size for you.`, `${nm}, ${it}-এর সাইজ নিয়ে দ্বিধায়? আপনার উচ্চতা আর ওজন লিখে পাঠান, আমরা ঠিক সাইজটা বলে দেব।`);
    if (k === 'delivery') return t(`Hi ${nm}, delivery to you is ৳${dl.fee}${fr && fr.on ? ` and free above ৳${fr.over}` : ''}. Any question? Reply here and we will help. ${link}`, `${nm}, আপনার এলাকায় ডেলিভারি চার্জ ৳${dl.fee}${fr && fr.on ? `, ৳${fr.over}-এর বেশি হলে ফ্রি` : ''}। কোনো প্রশ্ন থাকলে এখানে লিখুন। ${link}`);
    if (k === 'offer') { const of = offers().find((x) => x.id === offerId) || offers()[0]; const on = of ? t(of.name[0], of.name[1] || of.name[0]) : ''; return t(`Hi ${nm}, a small gift for you: ${on}. Finish your order with ${it} here: ${link}`, `${nm}, আপনার জন্য ছোট উপহার: ${on}। ${it} নিয়ে অর্ডারটা শেষ করুন: ${link}`); }
    return '';
  }
  function msgModal(list0) {
    const list = list0.filter((a) => a && a.phone && !a.orderedLater); if (!list.length) { A.toast(t('Pick people who have a phone number', 'ফোন নম্বর আছে এমন মানুষ বাছাই করুন'), 'bad'); return; }
    const ofs = offers(); let tpl = 'forgot', ch = 'SMS', offerId = ofs[0] ? ofs[0].id : '';
    const over = list.filter((a) => autoSent(a) >= MAXAUTO).length;
    const m = U.modal(list.length === 1 ? t(`Message ${list[0].name || list[0].phone}`, `${list[0].name || list[0].phone}-কে মেসেজ`) : t(`Message ${list.length} people`, `${list.length} জনকে মেসেজ`), `
      <div class="small strong">${t('Send by', 'যেভাবে পাঠাবেন')}</div><div style="margin:6px 0 12px">${U.seg('ms-ch', [['SMS', 'SMS'], ['WhatsApp', 'WhatsApp']], ch)}</div>
      <div class="small strong">${t('Template', 'টেমপ্লেট')}</div><div class="inc-tpl" id="ms-tpl" style="margin:6px 0 10px">${TPLS.filter((p) => p[0] !== 'offer' || ofs.length).map((p) => `<button class="chip ${p[0] === tpl ? 'on' : ''}" data-k="${p[0]}">${t(p[1], p[2])}</button>`).join('')}</div>
      <div id="ms-off" style="display:none;margin-bottom:10px">${U.field(t('Offer to include', 'যে অফার দেবেন'), U.select('ms-offer', ofs.map((o) => [o.id, t(o.name[0], o.name[1] || o.name[0])]), offerId))}</div>
      <textarea class="inp" id="ms-txt" rows="4"></textarea><div class="small muted" id="ms-prev" style="margin-top:6px"></div>
      <div id="ms-warn" style="margin-top:10px"></div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ms-ok">${A.icon('send')} ${t('Send', 'পাঠান')}</button>` });
    const q = (s) => m.querySelector(s);
    const fill = () => { q('#ms-off').style.display = tpl === 'offer' ? '' : 'none'; if (tpl !== 'custom') q('#ms-txt').value = tplText(tpl, list[0], offerId); else if (!q('#ms-txt').dataset.c) q('#ms-txt').value = ''; q('#ms-prev').textContent = list.length > 1 ? t('Names and items are filled in for each person.', 'প্রতিজনের নাম ও আইটেম নিজে থেকে বসবে।') : ''; };
    q('#ms-warn').innerHTML = over ? U.callout(t(`${over} of ${list.length} already got ${MAXAUTO} automatic reminders. Your own message still goes — you can send as many as you like — but they may feel chased.`, `${list.length} জনের মধ্যে ${over} জন ইতিমধ্যে ${MAXAUTO}টি অটোমেটিক রিমাইন্ডার পেয়েছেন। আপনার নিজের মেসেজ যাবে — যত খুশি পাঠাতে পারেন — তবে তারা বিরক্ত হতে পারেন।`), 'warn', 'warn') : '';
    q('#ms-ch').querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { ch = b.dataset.v; q('#ms-ch').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); }));
    q('#ms-tpl').querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { tpl = b.dataset.k; q('#ms-tpl').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); q('#ms-txt').dataset.c = ''; fill(); }));
    q('#ms-offer').onchange = () => { offerId = q('#ms-offer').value; fill(); };
    q('#ms-txt').oninput = () => { q('#ms-txt').dataset.c = '1'; };
    fill();
    q('#ms-ok').onclick = () => {
      const base = q('#ms-txt').value.trim(); if (!base) { A.toast(t('Write a message first', 'আগে মেসেজ লিখুন'), 'bad'); return; }
      const edited = q('#ms-txt').dataset.c === '1' || tpl === 'custom';
      list.forEach((a) => { a.log.push({ t: NOW(), kind: 'own', ch, tpl: edited && tpl !== 'custom' ? 'custom' : tpl, text: edited || list.length === 1 ? base : tplText(tpl, a, offerId), by: who() }); });
      A.commit(`Message to ${list.length} incomplete order(s) by ${ch}`); U.close(); S.sel.clear();
      A.toast(t(`Sent to ${list.length} ${list.length === 1 ? 'person' : 'people'} by ${ch}`, `${list.length} জনকে ${ch}-এ পাঠানো হয়েছে`), 'good'); A.render();
    };
  }

  /* ================= REPORT ================= */
  const topOf = (arr, f) => { const m = {}; arr.forEach((a) => { const k = f(a); if (k) m[k] = (m[k] || 0) + 1; }); return Object.keys(m).map((k) => [k, m[k]]).sort((x, y) => y[1] - x[1]); };
  function renderReport(el, L) {
    const n = L.length; const nn = L.filter(noNumber); const later = L.filter((a) => a.orderedLater);
    const reach = FSTEPS.map((s, i) => L.filter((a) => FSTEPS.indexOf(stepOf(a)) >= i).length);
    const leftAt = FSTEPS.map((s, i) => L.filter((a) => FSTEPS.indexOf(stepOf(a)) === i).length);
    const worst = leftAt.indexOf(Math.max(...leftAt)); const pct = (x, y) => (y ? Math.round(x / y * 100) : 0);
    const by = { call: later.filter((a) => a.orderedLater.by === 'call'), message: later.filter((a) => a.orderedLater.by === 'message'), self: later.filter((a) => a.orderedLater.by === 'self') };
    const hrs = later.map((a) => (new Date(a.orderedLater.at) - new Date(a.at)) / HR); const avgH = hrs.length ? hrs.reduce((x, y) => x + y, 0) / hrs.length : 0;
    const topCamp = topOf(L.filter((a) => a.campaign), (a) => a.campaign)[0]; const topDev = topOf(L, (a) => a.device)[0];
    const money = A.sum(later, (a) => a.orderedLater.value || a.value);
    const sums = n ? [
      t(`<b>${n}</b> checkouts were left in this period, worth <b>${tk(A.sum(L, (a) => a.value))}</b>. The biggest drop is at <b>${FN[FSTEPS[worst]][2]}</b>: ${leftAt[worst]} people (${pct(leftAt[worst], n)}%) stopped there.`, `এই সময়ে <b>${n}টি</b> চেকআউট অসম্পূর্ণ থেকেছে, মোট <b>${tk(A.sum(L, (a) => a.value))}</b>। সবচেয়ে বেশি থেমেছেন <b>${FN[FSTEPS[worst]][3]}</b> ধাপে: ${leftAt[worst]} জন (${pct(leftAt[worst], n)}%)।`),
      t(`<b>${later.length}</b> came back and ordered (${pct(later.length, n)}%): ${by.call.length} after a call, ${by.message.length} after a message, ${by.self.length} on their own${hrs.length ? `. On average it took ${avgH < 48 ? Math.round(avgH) + ' hours' : Math.round(avgH / 24) + ' days'}` : ''}. That is ${tk(money)} of sales.`, `<b>${later.length}জন</b> ফিরে এসে অর্ডার দিয়েছেন (${pct(later.length, n)}%): ${by.call.length}জন কলের পর, ${by.message.length}জন মেসেজের পর, ${by.self.length}জন নিজে নিজে${hrs.length ? `। গড়ে ফিরতে সময় লেগেছে ${avgH < 48 ? Math.round(avgH) + ' ঘণ্টা' : Math.round(avgH / 24) + ' দিন'}` : ''}। বিক্রি ${tk(money)}।`),
      t(`<b>${nn.length}</b> left without a number, so we cannot call them. They only feed ad audiences and on-site follow-up.`, `<b>${nn.length}জন</b> নম্বর না দিয়ে চলে গেছেন, তাই তাদের কল করা যাবে না। তারা শুধু বিজ্ঞাপনের অডিয়েন্স ও সাইটের ফলো-আপে কাজে লাগে।`),
      topCamp || topDev ? t(`${topCamp ? `Most leavers from campaigns came from <b>${esc(topCamp[0])}</b> (${topCamp[1]}). ` : ''}${topDev ? `<b>${topDev[0]}</b> users are ${pct(topDev[1], n)}% of everyone who leaves.` : ''}`, `${topCamp ? `ক্যাম্পেইন থেকে আসা বেশিরভাগ <b>${esc(topCamp[0])}</b> থেকে (${topCamp[1]}জন)। ` : ''}${topDev ? `চলে যাওয়াদের ${pct(topDev[1], n)}% <b>${topDev[0]}</b> ইউজার।` : ''}`) : '',
    ].filter(Boolean) : [];
    const flow = FSTEPS.map((s, i) => `${i ? `<div class="inc-ar">›</div>` : ''}<div class="inc-fb"><div class="l">${i === 0 ? t('Landing → Bag', 'ল্যান্ডিং → ব্যাগ') : t(FN[s][2], FN[s][3])}</div><b class="n">${reach[i]}</b><div class="x ${leftAt[i] ? '' : 'g'}">${leftAt[i] ? t(`${leftAt[i]} left here · ${pct(leftAt[i], reach[i])}%`, `${leftAt[i]}জন এখানে ছেড়েছেন · ${pct(leftAt[i], reach[i])}%`) : t('no one left', 'কেউ ছাড়েননি')}</div></div>`).join('') + `<div class="inc-ar">›</div><div class="inc-fb" style="border-color:var(--bad)"><div class="l">${t('Left', 'চলে গেছেন')}</div><b class="n">${n}</b><div class="x g">${t(`${later.length} came back`, `${later.length}জন ফিরেছেন`)}</div></div>`;
    const split = (title, f, lab) => { const r = topOf(L, f).slice(0, 5); return U.card(title, r.length ? A.chart.bars({ money: false, items: r.map((x) => ({ label: (lab ? lab(x[0]) : x[0]), value: x[1], text: `${x[1]} · ${pct(x[1], n)}%` })) }) : U.empty('—')); };
    const cap = [[t('Saved as the visitor types', 'ভিজিটর লেখার সাথে সাথে সেভ হয়'), t('The draft is saved in the background while someone types, at every checkout step.', 'ভিজিটর যখন লেখেন তখন ব্যাকগ্রাউন্ডে ড্রাফট সেভ হতে থাকে, চেকআউটের প্রতিটি ধাপে।')], [t('Browser-filled values', 'ব্রাউজার যা ভরে দেয়'), t('If the browser fills the visible form on the first click, those values are saved too. Anything the visitor types replaces them.', 'প্রথম ক্লিকে ব্রাউজার যে ঘরগুলো ভরে দেয়, সেগুলোও সেভ হয়। ভিজিটর নিজে যা লেখেন তা আগেরটার জায়গায় বসে।')], [t('Known customers', 'চেনা কাস্টমার'), t('Our own browser id or login tells us the visitor ordered before, so their saved phone and address are attached. A matching network address alone is only a weak “possible match” and is never attached.', 'আমাদের নিজস্ব ব্রাউজার আইডি বা লগইন দেখে বোঝা যায় আগে অর্ডার দিয়েছেন, তাই তাদের সেভ করা ফোন ও ঠিকানা জোড়া লাগে। শুধু একই নেটওয়ার্ক হলে সেটা দুর্বল “সম্ভাব্য মিল” — কখনো নিজে থেকে জোড়া লাগে না।')], [t('Visitors who touch nothing', 'যারা কিছুই ছোঁননি'), t('They are not in this list. They only count here and go to ad audiences and on-site follow-up.', 'তারা এই লিস্টে নেই। এখানে শুধু গণনায় থাকেন এবং বিজ্ঞাপনের অডিয়েন্স ও সাইটের ফলো-আপে যান।')]];
    el.innerHTML += `<div class="row between" style="margin-bottom:12px;gap:8px;flex-wrap:wrap"><div class="small muted">${t('Based on the dates you picked above.', 'উপরে বাছাই করা তারিখ অনুযায়ী।')}</div><button class="btn" id="inc-dl">${A.icon('down')} ${t('Download', 'ডাউনলোড')}</button></div>
      ${n ? `<div class="inc-sum" style="margin-bottom:14px">${sums.map((s) => `<p>${s}</p>`).join('')}</div>
      ${U.card(t('The journey: where people leave', 'যাত্রা: কোথায় কোথায় মানুষ ছেড়ে যান'), `<div class="inc-flow">${flow}</div><div style="margin-top:12px">${A.chart.funnel(FSTEPS.map((s, i) => ({ label: t(FN[s][0], FN[s][1]), value: reach[i] })))}</div>`)}
      <div style="height:14px"></div><div class="inc-split">${split(t('By landing page', 'ল্যান্ডিং পেজ অনুযায়ী'), (a) => a.landing)}${split(t('By product', 'প্রোডাক্ট অনুযায়ী'), (a) => a.items[0].name)}${split(t('By campaign', 'ক্যাম্পেইন অনুযায়ী'), (a) => a.campaign || a.source)}${split(t('By device', 'ডিভাইস অনুযায়ী'), (a) => a.device)}</div>
      <div style="height:14px"></div><div class="inc-split">${U.card(t('Who came back', 'কারা ফিরে এসেছেন'), `<div class="inc-rec"><div><b>${by.call.length}</b><span class="small muted">${t('by our call', 'আমাদের কলে')}</span></div><div><b>${by.message.length}</b><span class="small muted">${t('by our message', 'আমাদের মেসেজে')}</span></div><div><b>${by.self.length}</b><span class="small muted">${t('by themselves', 'নিজে নিজে')}</span></div></div><div class="small muted">${hrs.length ? t(`Average time to come back: ${avgH < 48 ? Math.round(avgH) + ' hours' : Math.round(avgH / 24) + ' days'}`, `ফিরতে গড় সময়: ${avgH < 48 ? Math.round(avgH) + ' ঘণ্টা' : Math.round(avgH / 24) + ' দিন'}`) : t('No one has come back in this period.', 'এই সময়ে কেউ ফেরেননি।')}</div>`)}
      ${U.card(t('Left without a number', 'নম্বর না দিয়ে চলে গেছেন'), `<div class="strong" style="font-size:28px">${nn.length}</div><div class="small muted" style="margin-top:6px">${t('Kept for this report, ad audiences and on-site follow-up. Not in the list, because there is nobody to call.', 'এই রিপোর্ট, বিজ্ঞাপনের অডিয়েন্স ও সাইটের ফলো-আপের জন্য রাখা। লিস্টে নেই, কারণ কল করার মতো কেউ নেই।')}</div>`)}</div>` : U.card('', U.empty(t('No incomplete orders in this period.', 'এই সময়ে কোনো অসম্পূর্ণ অর্ডার নেই।')))}
      <div style="height:14px"></div>${U.card(t('How details are captured', 'তথ্য কীভাবে ধরা হয়'), `<div class="list">${cap.map((c) => `<div class="li" style="flex-direction:column;align-items:flex-start;gap:2px"><b>${c[0]}</b><span class="small muted">${c[1]}</span></div>`).join('')}</div>`)}`;
    wire(el); const dl = el.querySelector('#inc-dl'); if (dl) dl.onclick = () => U.download('incomplete-orders-report.xlsx');
  }

  /* ---------- public API ---------- */
  A.incompleteApi = {
    openCount: () => { sweep(); return A.D.abandoned.filter(isOpen).length; },
    leftWithoutNumber: () => { sweep(); return A.D.abandoned.filter(noNumber).length; },
    recoveredCount: () => { sweep(); return A.D.abandoned.filter((a) => a.orderedLater && a.orderedLater.by !== 'self').length; },
  };

  A.mod('orders', {
    incomplete: { render, guide: {
      en: '<p><b>What:</b> people who started an order and stopped, grouped by day, newest first.</p><p><b>Why:</b> a call or a short message often brings them back — e.g. someone who stopped at payment with a 3-piece bag.</p><p><b>How:</b> 1) Pick dates. 2) Start from the top: click the name to see the bag, where they stopped and their earlier orders. 3) Press the phone button, then log how the call went. 4) “Confirm as order” takes the address on the call and creates a real order with the stock held. 5) Or send a message by SMS or WhatsApp: use a template, an offer, or your own words. Automatic reminders stop at 2; your own messages are not limited, but you get a warning. 6) Anyone who orders later leaves the Open list by themselves. 7) “Report” shows where people leave, by landing page, product, campaign and device.</p>',
      bn: '<p><b>কী:</b> যারা অর্ডার শুরু করে থেমে গেছেন, দিন অনুযায়ী সাজানো, নতুন আগে।</p><p><b>কেন:</b> একটা কল বা ছোট মেসেজে অনেকে ফিরে আসেন — যেমন 3 পিসের ব্যাগ নিয়ে পেমেন্টে এসে থেমে যাওয়া কেউ।</p><p><b>কীভাবে:</b> 1) তারিখ বাছুন। 2) উপর থেকে শুরু করুন: নামে ক্লিক করলে ব্যাগ, কোথায় থেমেছেন আর আগের অর্ডার দেখা যায়। 3) ফোন বোতাম চাপুন, তারপর কল কেমন হলো লিখে রাখুন। 4) “Confirm as order” চাপলে কলে ঠিকানা নিয়ে আসল অর্ডার তৈরি হয়, স্টক হোল্ড থাকে। 5) অথবা SMS বা WhatsApp-এ মেসেজ পাঠান: টেমপ্লেট, অফার বা নিজের লেখা। অটোমেটিক রিমাইন্ডার 2টিতে থামে; আপনার নিজের মেসেজের সীমা নেই, তবে সতর্কতা দেখাবে। 6) পরে যিনি অর্ডার দেন তিনি নিজে থেকেই খোলা লিস্ট থেকে সরে যান। 7) “Report”-এ দেখা যায় কোথায় মানুষ ছেড়ে যান — ল্যান্ডিং পেজ, প্রোডাক্ট, ক্যাম্পেইন ও ডিভাইস অনুযায়ী।</p>' } },
  });
})();
