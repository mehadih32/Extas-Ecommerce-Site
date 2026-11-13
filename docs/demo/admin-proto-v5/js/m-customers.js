/* EXTAS admin prototype — Customers: list + profile, groups, loyalty & wallet, duplicates to merge. */
(function () {
  'use strict';
  const A = window.A, U = A.ui, C = A.calc, t = (e, b) => A.t(e, b), esc = A.esc, tk = (n) => A.fmt.tk(n);
  const DAY = 864e5;
  const NOW = () => A.TODAY.toISOString();
  const loyalty = () => (A.D.loyalty = A.D.loyalty || { on: true, perTk: 100, points: 100, worth: 50 });
  const llog = () => (A.D.loyaltyLog = A.D.loyaltyLog || []);
  const blocked = () => (A.D.blocked = A.D.blocked || []);
  const live = () => A.D.customers.filter((c) => !c.mergedInto);
  const INF = [['RAFI10', 'Rafi Ahmed', 'Instagram', 8], ['MITU15', 'Mitu Style', 'Facebook', 10], ['TANVIR10', 'Tanvir Vlogs', 'YouTube', 8], ['FIT12', 'Fit With Nadia', 'TikTok', 7]];
  const hsh = (x) => { let h = 2166136261; for (const ch of String(x)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  function infUse(c, os) {
    const list = (A.D.influencers && A.D.influencers.length) ? A.D.influencers.map((x) => [x.code, x.name, x.channel || '', x.commission || x.pct || 0]) : INF;
    const hit = os.find((o) => o.coupon && list.some((x) => x[0] === o.coupon));
    if (hit) return { inf: list.find((x) => x[0] === hit.coupon), o: hit };
    const first = os.filter((o) => o.status !== 'cancelled').slice(-1)[0];
    if (!first || hsh(c.id + 'inf') > 0.3) return null;
    return { inf: list[Math.floor(hsh(c.id + 'w') * list.length)], o: first };
  }
  const maskP = (p) => (A.ordersApi && A.ordersApi.maskPhone ? A.ordersApi.maskPhone(p) : String(p).slice(0, 3) + '•••••' + String(p).slice(-3));
  const daysSince = (iso) => (iso ? (A.TODAY - new Date(iso)) / DAY : 9999);
  function pin(title, text, ok, fn) {
    if (A.ordersApi) return A.ordersApi.pinModal(title, text, ok, fn);
    U.confirm(title, text, ok, fn, true);
  }

  A.css('customers', `
  .cus-seg{display:flex;gap:4px;flex-wrap:wrap}
  .cus-prof{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
  .cus-prof div{background:var(--card2);border-radius:10px;padding:8px 10px}
  .cus-prof b{display:block;font-size:16px}
  .cus-prof span{color:var(--muted);font-size:11.5px}
  .cus-tags{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .cus-tag{display:inline-flex;align-items:center;gap:4px;background:var(--accent-soft);color:var(--ink);border-radius:999px;padding:3px 9px;font-size:12px}
  .cus-tag button{border:0;background:none;cursor:pointer;color:var(--muted);padding:0;font-size:13px;line-height:1}
  .cus-grp{display:flex;flex-direction:column;gap:10px}
  .cus-grp .n{font:700 28px var(--f-head)}
  .cus-cond{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
  .cus-live{background:var(--card2);border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  .cus-pair{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:stretch}
  .cus-pair .side{border:1px solid var(--line);border-radius:12px;padding:10px;min-width:0}
  .cus-pair .mid{display:grid;place-items:center;color:var(--muted)}
  .cus-rule{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .cus-rule .inp{width:90px}
  @media (max-width:560px){.cus-prof{grid-template-columns:repeat(2,minmax(0,1fr))}.cus-pair{grid-template-columns:1fr}.cus-pair .mid{transform:rotate(90deg)}}
  .c3-back{margin-bottom:4px;font-size:13px}.c3-back a{color:var(--muted);text-decoration:none}
  .c3-head{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px 20px;align-items:start}
  .c3-who{display:flex;gap:12px;align-items:center;min-width:0}
  .c3-av{width:52px;height:52px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font:700 18px var(--f-head);flex:none}
  .c3-name{font:700 24px var(--f-head);line-height:1.2;margin-bottom:6px;overflow-wrap:anywhere}
  .c3-grade{display:inline-flex;align-items:center;font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 9px;background:var(--card2);color:var(--muted);white-space:nowrap}
  .c3-grade.g0{background:var(--card2);color:var(--ink2)} .c3-grade.g1{background:var(--warn-bg,var(--card2));color:var(--warn)} .c3-grade.g2{background:var(--ink);color:var(--card)}
  .c3-contact{display:flex;flex-direction:column;gap:4px;font-size:13.5px}
  .c3-contact>div{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding:3px 0}
  .c3-contact>div>span:first-child{min-width:0;overflow-wrap:anywhere}
  .c3-contact .btn.sm{padding:3px 8px}
  .c3-acts{grid-column:1 / -1;display:flex;gap:8px;flex-wrap:wrap}
  .c3-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px;align-items:start}
  .c3-grid.one{grid-template-columns:minmax(0,1fr)}
  .c3-sec h3{font-size:15px;margin:0}
  .c3-figs{grid-template-columns:repeat(5,minmax(0,1fr))}
  .c3-figs b{font-variant-numeric:tabular-nums}
  .c3-figs em{display:block;font-style:normal;font-size:11px;color:var(--muted)}
  .c3-own{outline:1px dashed var(--line2,var(--line))}
  .c3-ord{border:1px solid var(--line);border-radius:10px;margin-bottom:6px}
  .c3-ord summary{display:flex;gap:8px;align-items:center;padding:8px 10px;cursor:pointer;list-style:none}
  .c3-ord summary::-webkit-details-marker{display:none}
  .c3-ordb{border-top:1px solid var(--line);padding:8px 10px;display:flex;flex-direction:column;gap:8px}
  .c3-ln{display:flex;gap:10px;align-items:center}
  .c3-size{display:inline-grid;place-items:center;min-width:26px;height:22px;padding:0 6px;border-radius:6px;background:var(--ink);color:var(--card);font-size:12px;font-weight:700}
  .c3-score{display:flex;flex-direction:column;gap:8px}
  .c3-big{font:700 40px var(--f-head);line-height:1}.c3-big small{font-size:16px;color:var(--muted)}
  .c3-bars{display:flex;flex-direction:column;gap:4px}
  .c3-bar{display:grid;grid-template-columns:110px minmax(0,1fr) 44px;gap:8px;align-items:center;font-size:12.5px}
  .c3-bar b{text-align:right}
  .c3-ai{display:flex;gap:6px;align-items:flex-start;background:var(--card2);border-radius:8px;padding:8px 10px;font-size:13px}
  .c3-ai svg{width:15px;height:15px;flex:none;margin-top:2px}
  @media (max-width:1100px){.c3-figs{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media (max-width:860px){.c3-head,.c3-grid{grid-template-columns:minmax(0,1fr)}.c3-figs{grid-template-columns:repeat(2,minmax(0,1fr))}.c3-name{font-size:20px}}
  `);

  /* ---------- derived per-customer facts ---------- */
  function facts() {
    const by = {};
    for (const o of A.D.orders) {
      const f = (by[o.customerId] = by[o.customerId] || { first: o.created, cats: new Set(), sizes: {}, catsN: {} });
      if (new Date(o.created) < new Date(f.first)) f.first = o.created;
      if (o.status === 'cancelled') continue;
      for (const l of o.lines) { const p = A.byId(A.D.products, l.pid); if (p) { f.cats.add(p.cat); f.catsN[p.cat] = (f.catsN[p.cat] || 0) + l.qty; } f.sizes[l.size] = (f.sizes[l.size] || 0) + l.qty; }
    }
    return by;
  }
  const SEG = {
    vip: { en: 'VIP', bn: 'VIP', tone: 'accent', f: (c) => c.spent >= 8000 || c.orders >= 4 },
    risk: { en: 'At risk', bn: 'হারানোর ঝুঁকি', tone: 'warn', f: (c) => c.orders >= 2 && daysSince(c.lastOrder) >= 45 },
    repeat: { en: 'Repeat', bn: 'নিয়মিত', tone: 'good', f: (c) => c.orders >= 2 },
    new: { en: 'New', bn: 'নতুন', tone: 'info', f: (c) => c.orders <= 1 },
    refuser: { en: 'Refuser', bn: 'ফেরত দেন', tone: 'bad', f: (c) => c.refused >= 1 },
  };
  const segOf = (c) => (SEG.vip.f(c) ? 'vip' : SEG.risk.f(c) ? 'risk' : SEG.repeat.f(c) ? 'repeat' : 'new');
  const segBadges = (c) => U.badge(t(SEG[segOf(c)].en, SEG[segOf(c)].bn), SEG[segOf(c)].tone) + (c.refused ? ' ' + U.badge(t(`Refused ${c.refused}`, `${c.refused} ফেরত`), 'bad') : '') + (c.blocked ? ' ' + U.badge(t('Blocked', 'ব্লক'), 'dark') : '');
  const catName = (id) => { const c = A.byId(A.CATS, id); return c ? t(c.en, c.bn) : id; };

  /* ================= ALL CUSTOMERS ================= */
  const F = { q: '', seg: 'all', sort: 'spent', limit: 40, opened: '' };
  function renderAll(el, r) {
    if (r.id && !panelMode()) { const pc = A.byId(A.D.customers, r.id); if (pc) return renderProfile(el, pc); }
    const L = live(); const fx = facts();
    const mStart = new Date('2026-11-01T00:00:00+06:00'), lmStart = new Date('2026-10-01T00:00:00+06:00');
    const buyers = L.filter((c) => c.orders >= 1);
    const newM = buyers.filter((c) => fx[c.id] && new Date(fx[c.id].first) >= mStart).length;
    const newLM = buyers.filter((c) => fx[c.id] && new Date(fx[c.id].first) >= lmStart && new Date(fx[c.id].first) < new Date('2026-10-13T00:00:00+06:00')).length;
    const rep = buyers.length ? buyers.filter((c) => c.orders >= 2).length / buyers.length * 100 : 0;
    const spenders = L.filter((c) => c.delivered > 0);
    const avg = spenders.length ? A.sum(spenders, (c) => c.spent) / spenders.length : 0;
    let list = L.slice(); const q = F.q.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.district.toLowerCase().includes(q) || c.area.toLowerCase().includes(q));
    const counts = { all: list.length }; Object.keys(SEG).forEach((k) => (counts[k] = list.filter(SEG[k].f).length));
    if (F.seg !== 'all') list = list.filter(SEG[F.seg].f);
    const S = { spent: (a, b) => b.spent - a.spent, orders: (a, b) => b.orders - a.orders, recent: (a, b) => daysSince(a.lastOrder) - daysSince(b.lastOrder), refused: (a, b) => b.refused - a.refused, name: (a, b) => a.name.localeCompare(b.name) };
    list.sort(S[F.sort]);
    const vip = L.filter(SEG.vip.f); const atRisk = L.filter(SEG.risk.f);
    const allSpent = A.sum(L, (c) => c.spent); const top10 = allSpent ? A.sum(L.slice().sort((a, b) => b.spent - a.spent).slice(0, 10), (c) => c.spent) / allSpent * 100 : 0;
    const refusers = L.filter(SEG.refuser.f);
    el.innerHTML = A.pageHead(t('Customers', 'কাস্টমার'), t('Everyone who ordered, with what they bought, what they spent and how reliable they are.', 'যারা অর্ডার দিয়েছেন সবাই — কী কিনেছেন, কত খরচ করেছেন, কতটা ভরসাযোগ্য।'), `<button class="btn" id="cu-exp">${A.icon('down')} ${t('Export', 'এক্সপোর্ট')}</button>`) + A.tabsBar('customers', 'all') +
      `<div class="grid g4" style="margin-bottom:14px">
        <div class="card">${U.kpi({ label: t('Customers', 'কাস্টমার'), value: A.fmt.num(buyers.length), sub: t(`${L.length - buyers.length} without orders`, `${L.length - buyers.length} জনের অর্ডার নেই`), icon: 'customers' })}</div>
        <div class="card">${U.kpi({ label: t('New this month', 'এই মাসে নতুন'), value: newM, delta: A.delta(newM, newLM), sub: t('vs same days last month', 'গত মাসের একই দিনের তুলনায়') })}</div>
        <div class="card">${U.kpi({ label: t('Repeat customers', 'আবার কিনেছেন'), value: A.fmt.pct(rep), sub: t('ordered 2 or more times', '2 বা বেশি বার অর্ডার') })}</div>
        <div class="card">${U.kpi({ label: t('Average spend', 'গড় খরচ'), value: tk(avg), sub: t('per customer, delivered orders', 'প্রতি কাস্টমার, ডেলিভারি হওয়া অর্ডার') })}</div></div>
      <div style="margin-bottom:12px">${U.callout(t(`Your top 10 customers bring ${A.fmt.pct(top10, 0)} of all sales. ${atRisk.length ? `${atRisk.length} regular buyers have not ordered in 45+ days — a personal message now usually wins them back.` : 'No regular buyer has gone quiet yet.'} ${refusers.length} customers refused a parcel at least once — ask them for the delivery charge in advance.`, `আপনার সেরা 10 জন কাস্টমার মোট বিক্রির ${A.fmt.pct(top10, 0)} আনেন। ${atRisk.length ? `${atRisk.length} জন নিয়মিত ক্রেতা 45 দিনের বেশি অর্ডার দেননি — এখন একটা ব্যক্তিগত মেসেজ দিলে সাধারণত ফিরে আসেন।` : 'এখনো কোনো নিয়মিত ক্রেতা চুপ হয়ে যাননি।'} ${refusers.length} জন কাস্টমার অন্তত একবার পার্সেল ফেরত দিয়েছেন — তাদের কাছে ডেলিভারি চার্জ অ্যাডভান্স নিন।`))}</div>
      <div class="card">
        <div class="row between" style="margin-bottom:10px"><input class="inp" id="cu-q" placeholder="${t('Search name, phone or area', 'নাম, ফোন বা এলাকা দিয়ে খুঁজুন')}" value="${esc(F.q)}" style="flex:1;min-width:200px">${U.select('cu-sort', [['spent', t('Most spent', 'বেশি খরচ আগে')], ['orders', t('Most orders', 'বেশি অর্ডার আগে')], ['recent', t('Ordered recently', 'সম্প্রতি অর্ডার')], ['refused', t('Most refused', 'বেশি ফেরত আগে')], ['name', t('Name A–Z', 'নাম A–Z')]], F.sort, 'style="width:auto"')}</div>
        <div class="chips" style="margin-bottom:10px">${[['all', t('All', 'সব')], ...Object.keys(SEG).map((k) => [k, t(SEG[k].en, SEG[k].bn)])].map((c) => `<button class="chip ${F.seg === c[0] ? 'on' : ''}" data-seg="${c[0]}">${c[1]}<span class="c">${counts[c[0]]}</span></button>`).join('')}</div>
        ${U.table([
          { h: t('Customer', 'কাস্টমার'), f: (x) => `<b>${esc(x.c.name)}</b><div class="small muted mono">${esc(x.c.phone)}</div>` },
          { h: t('District', 'জেলা'), hide: true, f: (x) => `${esc(x.c.district)}<div class="small muted">${esc(x.c.area)}</div>` },
          { h: t('Orders', 'অর্ডার'), r: true, f: (x) => x.c.orders },
          { h: t('Delivered / refused', 'ডেলিভারি / ফেরত'), r: true, hide: true, f: (x) => `${x.c.delivered} / <span style="${x.c.refused ? 'color:var(--bad);font-weight:600' : ''}">${x.c.refused}</span>` },
          { h: t('Spent', 'খরচ'), r: true, f: (x) => `<b>${tk(x.c.spent)}</b>` },
          { h: t('Last order', 'শেষ অর্ডার'), hide: true, f: (x) => `<span class="small">${x.c.lastOrder ? A.fmt.ago(x.c.lastOrder) : '—'}</span>` },
          { h: t('Group', 'গ্রুপ'), f: (x) => { const g = A.rulesApi && A.rulesApi.gradeOf(x.c); return `<div class="cus-seg">${g ? `<span class="c3-grade g${g.idx}">${esc(g.name)}</span>` : ''}${segBadges(x.c)}</div>`; } },
        ], list.slice(0, F.limit).map((c) => ({ c, _id: c.id })), { onRow: true, empty: t('No customers match.', 'কোনো কাস্টমার মেলেনি।') })}
        ${list.length > F.limit ? `<div style="text-align:center;margin-top:10px"><button class="btn" id="cu-more">${t(`Show more (${list.length - F.limit} left)`, `আরও দেখুন (${list.length - F.limit} জন বাকি)`)}</button></div>` : ''}
      </div>`;
    const $ = (s) => el.querySelector(s);
    const qi = $('#cu-q'); qi.oninput = () => { F.q = qi.value; const p = qi.selectionStart; A.render(); const n = document.getElementById('cu-q'); n.focus(); n.setSelectionRange(p, p); };
    $('#cu-sort').onchange = (e) => { F.sort = e.target.value; A.render(); };
    A.on(el, '[data-seg]', 'click', (e, b) => { F.seg = b.dataset.seg; F.limit = 40; A.render(); });
    if ($('#cu-more')) $('#cu-more').onclick = () => { F.limit += 60; A.render(); };
    $('#cu-exp').onclick = () => U.download(`customers-${list.length}.csv`);
    A.on(el, 'tr.click', 'click', (e, tr) => (panelMode() ? openProfile(tr.dataset.row) : A.go('customers', 'all', tr.dataset.row)));
    if (r.id && F.opened !== r.id) { F.opened = r.id; openProfile(r.id); }
    if (!r.id) F.opened = '';
  }

  /* ================= CUSTOMER 360 ================= */
  const panelMode = () => { try { return localStorage.getItem('extas.c360.panel') === '1'; } catch (e) { return false; } };
  const setPanelMode = (on) => { try { localStorage.setItem('extas.c360.panel', on ? '1' : '0'); } catch (e) { /* private window */ } };
  const mrpOf = (l) => { const p = A.byId(A.D.products, l.pid); return Math.max(l.price, (p && p.compareAt) || l.price) * l.qty; };
  function life(c, os) {
    const live = os.filter((o) => o.status !== 'cancelled'); const del = os.filter(A.calc.isDelivered);
    const mrp = A.sum(live, (o) => A.sum(o.lines, mrpOf)); const sold = A.sum(live, (o) => o.subtotal);
    return { orders: os.length, pieces: A.sum(live, A.calc.pieces), mrp, disc: mrp - sold + A.sum(live, (o) => o.discount), delivered: A.sum(del, (o) => o.total), collected: A.sum(del, (o) => (o.paid == null ? o.total : o.paid || o.total)), returns: os.filter((o) => o.status === 'returned').length, exch: os.filter((o) => o.status === 'exchanged').length, aov: live.length ? A.sum(live, (o) => o.total) / live.length : 0, profit: A.sum(del, A.calc.orderProfit) };
  }
  function scorePanel(c) {
    const api = A.rulesApi; if (!api) return '';
    const m = api.metricsFor(c.phone); const sc = api.scoreOf(m); const b = api.band(sc); const col = b === 'auto' ? 'good' : b === 'call' ? 'warn' : 'bad';
    const rows = [['success', t('Success rate', 'সফলতার হার'), m.success + '%', m.success], ['parcels', t('Parcels', 'পার্সেল'), m.parcels, Math.min(100, m.parcels * 5)], ['returns', t('Returns', 'ফেরত'), m.returns, Math.max(0, 100 - m.returns * 20)], ['worst', t('Worst courier', 'খারাপ কুরিয়ার'), m.worst + '%', m.worst], ['couriers', t('Couriers', 'কুরিয়ার'), m.couriers, m.couriers * 33], ['fraud', t('Fraud reports', 'ফ্রড রিপোর্ট'), m.fraud, m.fraud ? 10 : 100]];
    const ai = b === 'auto' ? t(`Safe to send: ${m.parcels} parcels across ${m.couriers} couriers, ${m.success}% taken.`, `পাঠানো নিরাপদ: ${m.couriers}টি কুরিয়ারে ${m.parcels}টি পার্সেল, ${m.success}% নিয়েছেন।`) : b === 'call' ? t(`Call first: ${m.parcels ? `${m.returns} parcels came back elsewhere` : 'no courier history yet'}.`, `আগে কল করুন: ${m.parcels ? `অন্য জায়গায় ${m.returns}টি পার্সেল ফেরত` : 'কোনো কুরিয়ার রেকর্ড নেই'}।`) : t('Ask the delivery charge in advance before sending.', 'পাঠানোর আগে ডেলিভারি চার্জ অগ্রিম চান।');
    return `<div class="c3-score"><div class="c3-big" style="color:var(--${col})">${sc}<small>/10</small></div><div class="c3-bars">${rows.map((r) => `<div class="c3-bar"><span>${r[1]}</span>${U.bar(r[3], `var(--${r[3] >= 70 ? 'good' : r[3] >= 40 ? 'warn' : 'bad'})`)}<b class="mono">${r[2]}</b></div>`).join('')}</div><div class="c3-ai">${A.icon('star')} <span><b>AI:</b> ${ai}</span></div><div class="muted small">${t('Staff only · from courier history', 'শুধু স্টাফ · কুরিয়ার ইতিহাস থেকে')} · <a href="${A.href('rules', 'all', 'score')}">${t('Score rule', 'স্কোরের নিয়ম')}</a></div></div>`;
  }
  function c360Body(c, mode) {
    const os = A.D.orders.filter((o) => o.customerId === c.id);
    const fx = facts()[c.id] || { sizes: {}, catsN: {} }; const lf = life(c, os);
    const g = A.rulesApi ? A.rulesApi.gradeOf(c) : null; const L = loyalty(); const ptsWorth = Math.floor(c.points / L.points) * L.worth;
    // usual size per category
    const sz = {}; os.filter((o) => o.status !== 'cancelled').forEach((o) => o.lines.forEach((l) => { const p = A.byId(A.D.products, l.pid); const k = p ? p.cat : 'other'; sz[k] = sz[k] || {}; sz[k][l.size] = (sz[k][l.size] || 0) + l.qty; }));
    const usual = Object.entries(sz).map(([cat, m]) => { const e = Object.entries(m).sort((a, b) => b[1] - a[1]); const tot = A.sum(e, (x) => x[1]); return { cat, size: e[0][0], always: e[0][1] === tot, n: tot }; }).sort((a, b) => b.n - a.n);
    const cats = Object.entries(fx.catsN).sort((a, b) => b[1] - a[1]); const catMax = cats.length ? cats[0][1] : 1;
    const src = {}; os.forEach((o) => { const k = o.source || o.channel || 'Website'; src[k] = (src[k] || 0) + 1; });
    const convs = A.D.conversations.filter((v) => v.customerId === c.id || v.phone === c.phone);
    const cps = os.filter((o) => o.coupon);
    const revs = A.D.reviews.filter((r) => r.name === c.name);
    const inc = A.D.abandoned.filter((a) => a.phone === c.phone);
    const wl = llog().filter((x) => x.cid === c.id).slice(0, 4);
    const fig = (l, v, x) => `<div><span>${l}</span><b>${v}</b>${x ? `<em>${x}</em>` : ''}</div>`;
    const line = (l) => { const p = A.byId(A.D.products, l.pid); return `<div class="c3-ln">${p ? U.thumb(p, 40) : ''}<div class="grow" style="min-width:0"><div class="ellip">${esc(l.name)}</div><div class="row" style="gap:6px">${U.sw(l.color)}<span class="small muted">${esc(l.color)}</span><span class="c3-size">${esc(l.size)}</span><span class="small muted">× ${l.qty}</span></div></div><b class="mono small">${tk(l.price * l.qty)}</b></div>`; };
    const orderRow = (o, i) => `<details class="c3-ord" ${i === 0 ? 'open' : ''}><summary><span class="mono strong">${o.id}</span><span class="small muted hide-sm">${A.fmt.date(o.created)}</span><span class="grow small ellip">${A.calc.pieces(o)} ${t('pcs', 'পিস')} · ${o.payment}${o.coupon ? ' · ' + esc(o.coupon) : ''}</span>${U.statusBadge(o.status)}<b class="mono small">${tk(o.total)}</b></summary><div class="c3-ordb">${o.lines.map(line).join('')}<div class="row between small"><span class="muted">${t('Discount', 'ছাড়')} ${tk(o.discount)} · ${t('Delivery', 'ডেলিভারি')} ${tk(o.delivery)}${o.courier ? ' · ' + esc((A.byId(A.D.couriers, o.courier) || {}).name || o.courier) : ''}</span><a href="${A.href('orders', 'all', o.id)}" data-close>${t('Open order', 'অর্ডার খুলুন')} ›</a></div></div></details>`;
    const sec = (title, body, extra) => `<section class="card c3-sec"><div class="row between" style="margin-bottom:8px"><h3>${title}</h3>${extra || ''}</div>${body}</section>`;
    const head = `<section class="card c3-head"><div class="c3-who"><div class="c3-av">${esc(c.name.split(' ').map((x) => x[0]).join('').slice(0, 2))}</div><div style="min-width:0"><div class="c3-name">${esc(c.name)}</div><div class="cus-seg">${g ? `<span class="c3-grade g${g.idx}">${esc(g.name)} · ${g.off}% ${t('off', 'ছাড়')}</span>` : `<span class="c3-grade">${t('No grade yet', 'এখনো গ্রেড নেই')}</span>`}${segBadges(c)}</div></div></div>
      <div class="c3-contact"><div><span class="mono">${esc(c.phone)}</span><span><a class="btn sm ghost" href="tel:${esc(c.phone)}">${A.icon('phone')} ${t('Call', 'কল')}</a><button class="btn sm ghost" data-copy="${esc(c.phone)}">${t('Copy', 'কপি')}</button></span></div><div><span>${esc(c.area)}, ${esc(c.district)}</span><span><button class="btn sm ghost" data-copy="${esc(c.area + ', ' + c.district)}">${t('Copy', 'কপি')}</button><a class="btn sm ghost" target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent(c.area + ', ' + c.district)}">${t('Map', 'ম্যাপ')}</a></span></div><div><span>${c.email ? esc(c.email) : `<span class="muted">${t('No email', 'ইমেইল নেই')}</span>`}</span><span>${c.email ? `<button class="btn sm ghost" data-copy="${esc(c.email)}">${t('Copy', 'কপি')}</button>` : ''}</span></div><div class="small muted">${A.icon('info')} ${t(`Packers see only <b class="mono">${esc(maskP(c.phone))}</b> · ${esc(c.area)}, ${esc(c.district)} — phone and full address are hidden from the Packer role.`, `প্যাকাররা শুধু দেখেন <b class="mono">${esc(maskP(c.phone))}</b> · ${esc(c.area)}, ${esc(c.district)} — প্যাকার রোলে ফোন ও পুরো ঠিকানা লুকানো।`)}</div></div>
      <div class="c3-acts"><button class="btn primary" id="pf-msg">${A.icon('send')} ${t('Send message', 'মেসেজ পাঠান')}</button><button class="btn" id="pf-wal">${t('Give wallet credit', 'ওয়ালেট ক্রেডিট দিন')}</button><button class="btn ${c.blocked ? '' : 'ghost'}" id="pf-blk">${c.blocked ? t('Unblock', 'আনব্লক') : t('Block', 'ব্লক')}</button>${mode === 'page' ? `<button class="btn ghost" id="pf-panel">${t('Open as side panel', 'পাশের প্যানেলে খুলুন')}</button>` : `<a class="btn ghost" id="pf-full" href="${A.href('customers', 'all', c.id)}" target="_blank" rel="noopener">${A.icon('ext')} ${t('Open full page', 'পুরো পেজে খুলুন')}</a>`}</div></section>`;
    const figs = `<div class="cus-prof c3-figs">${fig(t('Orders', 'অর্ডার'), lf.orders)}${fig(t('Pieces', 'পিস'), lf.pieces)}${fig(t('MRP value', 'MRP মূল্য'), tk(lf.mrp))}${fig(t('Discount received', 'ছাড় পেয়েছেন'), tk(lf.disc))}${fig(t('Delivered value', 'ডেলিভারি মূল্য'), tk(lf.delivered))}${fig(t('Collected', 'টাকা পেয়েছি'), tk(lf.collected))}${fig(t('Returns', 'ফেরত'), lf.returns)}${fig(t('Exchanges', 'এক্সচেঞ্জ'), lf.exch)}${fig(t('Average order', 'গড় অর্ডার'), tk(lf.aov))}<div class="c3-own"><span>${t('Profit', 'লাভ')} · ${t('owner only', 'শুধু মালিক')}</span><b style="color:var(--${lf.profit >= 0 ? 'good' : 'bad'})">${tk(lf.profit)}</b></div></div>`;
    const prefs = `<div class="stack">${usual.length ? usual.slice(0, 4).map((u) => `<div class="row" style="gap:8px"><span class="c3-size">${esc(u.size)}</span><span class="small">${catName(u.cat)} · ${u.always ? t(`always ${u.size}`, `সবসময় ${u.size}`) : t(`mostly ${u.size}`, `বেশিরভাগ ${u.size}`)} <span class="muted">(${u.n} ${t('pcs', 'পিস')})</span></span></div>`).join('') : U.empty(t('No pieces bought yet.', 'এখনো কিছু কেনেননি।'))}<div class="rl-sub small muted" style="margin-top:6px">${t('Favourite categories', 'পছন্দের ক্যাটাগরি')}</div>${cats.slice(0, 4).map((x) => `<div class="c3-bar"><span>${catName(x[0])}</span>${U.bar(x[1] / catMax * 100)}<b class="mono">${x[1]}</b></div>`).join('') || '—'}</div>`;
    const sources = Object.entries(src).sort((a, b) => b[1] - a[1]).map((s) => U.badge(`${esc(s[0])} · ${s[1]}`, 'info')).join(' ') || '—';
    const conv = convs.length ? `<div class="list">${convs.slice(0, 4).map((v) => `<a class="li" href="${A.href('inbox', 'chats', v.id)}" data-close style="text-decoration:none;color:inherit">${U.badge(esc(v.channel), v.channel === 'Instagram' ? 'accent' : 'info')}<span class="grow small ellip">${esc(v.msgs[v.msgs.length - 1].text)}</span><span class="small muted">${A.fmt.ago(v.last)}</span></a>`).join('')}</div>` : U.empty(t('No chats yet.', 'এখনো কোনো চ্যাট নেই।'));
    const money = `<div class="cus-prof" style="grid-template-columns:repeat(2,minmax(0,1fr))">${fig(t('Wallet', 'ওয়ালেট'), tk(c.wallet || 0))}${fig(t('Points', 'পয়েন্ট'), A.fmt.num(c.points), t(`worth ${tk(ptsWorth)}`, `${tk(ptsWorth)} সমান`))}</div>${wl.length ? `<div class="list" style="margin-top:8px">${wl.map((x) => `<div class="li small"><span class="grow">${esc(x.reason || x.kind)}</span><b>${tk(x.amount)}</b><span class="muted">${A.fmt.ago(x.t)}</span></div>`).join('')}</div>` : ''}`;
    const coup = cps.length ? cps.slice(0, 5).map((o) => `<div class="row between small"><span class="mono strong">${esc(o.coupon)}</span><span class="muted">${o.id} · ${A.fmt.date(o.created)}</span><b>−${tk(o.discount)}</b></div>`).join('') : `<span class="muted small">${t('Never used a coupon.', 'কখনো কুপন ব্যবহার করেননি।')}</span>`;
    const rv = revs.length ? revs.slice(0, 3).map((r) => `<div class="small"><b>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</b> ${esc(r.text)}</div>`).join('') : `<span class="muted small">${t('No reviews yet.', 'এখনো রিভিউ নেই।')}</span>`;
    const ic = inc.length ? inc.slice(0, 4).map((a) => `<div class="row between small"><span class="ellip" style="min-width:0;flex:1">${esc(a.item)}</span><span class="muted">${t('stopped at', 'থেমেছেন')} ${esc(a.step)}</span><b>${tk(a.value)}</b>${a.recovered ? U.badge(t('Ordered later', 'পরে অর্ডার'), 'good') : ''}</div>`).join('') : `<span class="muted small">${t('None.', 'নেই।')}</span>`;
    const notes = `<div class="cus-tags" style="margin-bottom:8px">${(c.tags || []).map((g2) => `<span class="cus-tag">${esc(g2)}<button data-untag="${esc(g2)}" aria-label="${t('Remove', 'সরান')}">×</button></span>`).join('')}<input class="inp" id="pf-tag" placeholder="${t('Add tag + Enter', 'ট্যাগ লিখে Enter')}" style="width:150px;padding:5px 9px"></div><textarea class="inp" id="pf-note" rows="2" placeholder="${t('e.g. Prefers delivery after 6 PM', 'যেমন: সন্ধ্যা 6টার পরে ডেলিভারি চান')}">${esc(c.note || '')}</textarea>`;
    const insight = U.callout(t(`Customer since ${A.fmt.dateY(c.created)}. ${usual.length ? `${catName(usual[0].cat)} ${usual[0].always ? 'always' : 'mostly'} ${usual[0].size}. ` : ''}${lf.returns ? `${lf.returns} parcel(s) came back — consider asking the delivery charge first.` : lf.orders >= 2 ? 'Every parcel taken — a good customer to reward.' : ''}`, `${A.fmt.dateY(c.created)} থেকে কাস্টমার। ${usual.length ? `${catName(usual[0].cat)} ${usual[0].always ? 'সবসময়' : 'বেশিরভাগ'} ${usual[0].size}। ` : ''}${lf.returns ? `${lf.returns}টি পার্সেল ফেরত এসেছে — আগে ডেলিভারি চার্জ চাইতে পারেন।` : lf.orders >= 2 ? 'সব পার্সেল নিয়েছেন — পুরস্কার দেওয়ার মতো কাস্টমার।' : ''}`), 'info', 'info');
    const iu = infUse(c, os);
    const infBox = iu ? `<div class="row between" style="flex-wrap:wrap;gap:6px"><div><span class="mono strong">${esc(iu.inf[0])}</span> ${U.badge(esc(iu.inf[2]), 'accent')}<div class="small">${esc(iu.inf[1])}</div></div><div class="r small"><a href="${A.href('orders', 'all', iu.o.id)}" data-close>${esc(iu.o.id)}</a><div class="muted">${A.fmt.date(iu.o.created)}</div></div></div><div class="small muted" style="margin-top:6px">${t(`First came with this code. The influencer earns ${iu.inf[3]}% only on delivered orders.`, `এই কোড দিয়ে প্রথম এসেছেন। ইনফ্লুয়েন্সার শুধু ডেলিভারি হওয়া অর্ডারে ${iu.inf[3]}% পান।`)}</div>` : `<span class="muted small">${t('No influencer code used.', 'কোনো ইনফ্লুয়েন্সার কোড ব্যবহার করেননি।')}</span>`;
    const left = `${sec(t('Lifetime', 'সব মিলিয়ে'), figs)}${sec(t(`All orders (${os.length})`, `সব অর্ডার (${os.length})`), os.length ? os.map(orderRow).join('') : U.empty(t('No orders yet.', 'এখনো কোনো অর্ডার নেই।')))}${sec(t('Sizes & favourites', 'সাইজ ও পছন্দ'), prefs)}${sec(t('Incomplete orders', 'অসম্পূর্ণ অর্ডার'), ic)}`;
    const right = `${sec(t('Courier score', 'কুরিয়ার স্কোর'), scorePanel(c))}${sec(t('Conversations', 'কথোপকথন'), conv)}${sec(t('Wallet & points', 'ওয়ালেট ও পয়েন্ট'), money)}${sec(t('Where they come from', 'কোথা থেকে আসেন'), `<div class="cus-tags">${sources}</div>`)}${sec(t('Influencer code', 'ইনফ্লুয়েন্সার কোড'), infBox)}${sec(t('Coupons used', 'ব্যবহার করা কুপন'), `<div class="stack">${coup}</div>`)}${sec(t('Reviews', 'রিভিউ'), `<div class="stack">${rv}</div>`)}${sec(t('Staff notes & tags', 'স্টাফ নোট ও ট্যাগ'), notes)}`;
    return `${head}${insight}<div class="c3-grid ${mode === 'page' ? '' : 'one'}"><div class="stack">${left}</div><div class="stack">${right}</div></div>`;
  }
  function wire360(d, c, re) {
    const id = c.id;
    d.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => U.copy(b.dataset.copy)));
    d.querySelectorAll('a[data-close]').forEach((a) => a.addEventListener('click', () => U.close()));
    const tg = d.querySelector('#pf-tag'); tg.onkeydown = (e) => { if (e.key === 'Enter' && tg.value.trim()) { c.tags = Array.from(new Set([...(c.tags || []), tg.value.trim()])); A.commit(`Tagged ${c.name}`); A.toast(t('Tag added', 'ট্যাগ যোগ হয়েছে'), 'good'); re(); } };
    d.querySelectorAll('[data-untag]').forEach((b) => (b.onclick = () => { c.tags = c.tags.filter((x) => x !== b.dataset.untag); A.commit(`Untagged ${c.name}`); A.toast(t('Tag removed', 'ট্যাগ সরানো হয়েছে')); re(); }));
    d.querySelector('#pf-note').onchange = (e) => { c.note = e.target.value; A.commit(`Note on ${c.name}`); A.toast(t('Note saved', 'নোট সেভ হয়েছে'), 'good'); };
    const pp = d.querySelector('#pf-panel'); if (pp) pp.onclick = () => { setPanelMode(true); A.toast(t('Customers will open in a side panel from now', 'এখন থেকে কাস্টমার পাশের প্যানেলে খুলবে'), 'good'); F.opened = c.id; A.go('customers', 'all'); setTimeout(() => openProfile(id), 30); };
    const pf = d.querySelector('#pf-full'); if (pf) pf.addEventListener('click', () => setPanelMode(false));
    d.querySelector('#pf-msg').onclick = () => {
      const tpl = { SMS: t(`Hi ${c.name.split(' ')[0]}, thank you for shopping with EXTAS! New winter polos are in.`, `হ্যালো ${c.name.split(' ')[0]}, EXTAS থেকে কেনার জন্য ধন্যবাদ! নতুন শীতের পোলো এসেছে।`), WhatsApp: t(`Hi ${c.name.split(' ')[0]} 👋 your favourite size is back in stock at EXTAS. Reply to order.`, `হ্যালো ${c.name.split(' ')[0]} 👋 আপনার পছন্দের সাইজ EXTAS এ আবার এসেছে। অর্ডার করতে রিপ্লাই দিন।`), Email: t(`Dear ${c.name},\n\nThank you for being an EXTAS customer. Here is something new for you.`, `প্রিয় ${c.name},\n\nEXTAS এর কাস্টমার হওয়ার জন্য ধন্যবাদ। আপনার জন্য নতুন কিছু আছে।`) };
      const m = U.modal(t(`Message ${c.name}`, `${c.name}-কে মেসেজ`), `${U.field(t('Send by', 'যেভাবে পাঠাবেন'), U.seg('pm-ch', [['SMS', 'SMS'], ['WhatsApp', 'WhatsApp'], ['Email', t('Email', 'ইমেইল')]], 'SMS'))}${U.field(t('Template', 'টেমপ্লেট'), U.select('pm-tp', [['hi', t('Thank you + new arrivals', 'ধন্যবাদ + নতুন পণ্য')], ['back', t('We miss you', 'আপনাকে মিস করছি')], ['size', t('Your size is back', 'আপনার সাইজ এসেছে')]], 'hi'))}${U.field(t('Message', 'মেসেজ'), `<textarea class="inp" id="pm-t" rows="4">${esc(tpl.SMS)}</textarea>`)}`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="pm-ok">${A.icon('send')} ${t('Send', 'পাঠান')}</button>` });
      let ch = 'SMS'; m.querySelectorAll('#pm-ch button').forEach((b) => (b.onclick = () => { ch = b.dataset.v; m.querySelectorAll('#pm-ch button').forEach((x) => x.classList.toggle('on', x === b)); m.querySelector('#pm-t').value = tpl[ch]; if (ch === 'Email' && !c.email) A.toast(t('No email saved for this customer', 'এই কাস্টমারের ইমেইল নেই'), 'bad'); }));
      m.querySelector('#pm-ok').onclick = () => { if (ch === 'Email' && !c.email) return A.toast(t('No email saved for this customer', 'এই কাস্টমারের ইমেইল নেই'), 'bad'); U.close(); A.commit(`Sent ${ch} to ${c.name}`); A.toast(t(`${ch} sent to ${c.name}`, `${c.name}-কে ${ch} গেছে`), 'good'); };
    };
    d.querySelector('#pf-wal').onclick = () => {
      const m = U.modal(t('Give wallet credit', 'ওয়ালেট ক্রেডিট দিন'), `${U.field(t('Amount', 'টাকা'), U.money('wc-a', 200))}${U.field(t('Reason', 'কারণ'), U.select('wc-r', [['Sorry for late delivery', t('Sorry for late delivery', 'দেরিতে ডেলিভারির জন্য দুঃখিত')], ['Exchange: lower price', t('Exchange: lower price', 'এক্সচেঞ্জ: কম দাম')], ['Thank you gift', t('Thank you gift', 'ধন্যবাদ উপহার')]], 'Sorry for late delivery'))}${U.field(t('Owner PIN', 'মালিকের PIN'), `<input class="inp" id="wc-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••" style="max-width:150px">`)}`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="wc-ok">${t('Add credit', 'ক্রেডিট দিন')}</button>` });
      m.querySelector('#wc-ok').onclick = () => {
        const a = Math.round(+m.querySelector('#wc-a').value || 0); if (a <= 0 || a > 5000) { A.toast(t('Amount must be ৳1–৳5,000', 'টাকা ৳1–৳5,000 এর মধ্যে দিন'), 'bad'); return; }
        if (!/^\d{4,6}$/.test(m.querySelector('#wc-pin').value)) { A.toast(t('Type your 4-digit PIN', '4 সংখ্যার PIN দিন'), 'bad'); return; }
        c.wallet = (c.wallet || 0) + a; llog().unshift({ t: NOW(), cid: c.id, name: c.name, kind: 'wallet', amount: a, reason: m.querySelector('#wc-r').value, by: 'You' });
        U.close(); A.commit(`Wallet credit ${tk(a)} to ${c.name}`); A.toast(t(`${tk(a)} added to ${c.name}'s wallet`, `${c.name}-এর ওয়ালেটে ${tk(a)} যোগ হয়েছে`), 'good'); re();
      };
    };
    d.querySelector('#pf-blk').onclick = () => {
      if (c.blocked) return pin(t('Unblock this customer?', 'এই কাস্টমার আনব্লক করবেন?'), t(`${esc(c.name)} can order with cash on delivery again.`, `${esc(c.name)} আবার COD অর্ডার দিতে পারবেন।`), t('Unblock', 'আনব্লক'), () => { c.blocked = false; c.tags = (c.tags || []).filter((x) => x !== 'Blocked'); A.commit(`Unblocked ${c.name}`); A.toast(t('Customer unblocked', 'কাস্টমার আনব্লক হয়েছে'), 'good'); re(); });
      pin(t('Block this customer?', 'এই কাস্টমার ব্লক করবেন?'), t(`${esc(c.name)} (${esc(c.phone)}) will not be able to place cash on delivery orders. Past orders stay as they are.`, `${esc(c.name)} (${esc(c.phone)}) আর COD অর্ডার দিতে পারবেন না। আগের অর্ডার যেমন আছে থাকবে।`), t('Block', 'ব্লক করুন'), () => { c.blocked = true; c.tags = Array.from(new Set([...(c.tags || []), 'Blocked'])); blocked().unshift({ phone: c.phone, name: c.name, reason: 'Blocked from profile', t: NOW(), by: 'You' }); A.commit(`Blocked ${c.name}`); A.toast(t('Customer blocked', 'কাস্টমার ব্লক হয়েছে'), 'good'); re(); });
    };
  }
  function openProfile(id) {
    const c = A.byId(A.D.customers, id); if (!c) return;
    const d = U.drawer(t('Customer 360', 'কাস্টমার 360'), `<div class="c3 stack">${c360Body(c, 'panel')}</div>`);
    wire360(d, c, () => { A.render(); openProfile(id); });
  }
  function renderProfile(el, c) {
    el.innerHTML = `<div class="c3-back"><a href="${A.href('customers', 'all')}">‹ ${t('All customers', 'সব কাস্টমার')}</a></div>` + A.pageHead(t('Customer 360', 'কাস্টমার 360'), t('Everything we know about this customer, from every channel.', 'এই কাস্টমার সম্পর্কে সব চ্যানেলের সব তথ্য।')) + A.tabsBar('customers', 'all') + `<div class="c3 stack">${c360Body(c, 'page')}</div>`;
    wire360(el, c, () => A.render());
  }

  /* ================= GROUPS ================= */
  function matcher(g, fx) {
    return (c) => (!g.district || c.district === g.district) && (!g.spentOver || c.spent > g.spentOver) && (!g.ordersOver || c.orders > g.ordersOver) && (!g.olderThan || (c.orders && daysSince(c.lastOrder) > g.olderThan)) && (!g.cat || (fx[c.id] && fx[c.id].cats.has(g.cat))) && (!g.seg || SEG[g.seg].f(c));
  }
  function condText(g) {
    const p = [];
    if (g.seg) p.push(t(SEG[g.seg].en, SEG[g.seg].bn));
    if (g.district) p.push(t('in ', '') + g.district + t('', '-এ'));
    if (g.spentOver) p.push(t('spent over ', 'খরচ ') + tk(g.spentOver) + t('', '-এর বেশি'));
    if (g.ordersOver) p.push(t(`more than ${g.ordersOver} orders`, `${g.ordersOver}টির বেশি অর্ডার`));
    if (g.olderThan) p.push(t(`no order in ${g.olderThan}+ days`, `${g.olderThan} দিনের বেশি অর্ডার নেই`));
    if (g.cat) p.push(t('bought ', '') + catName(g.cat) + t('', ' কিনেছেন'));
    return p.join(' · ') || t('Everyone', 'সবাই');
  }
  const BUILT = [
    { id: 'g-vip', en: 'VIP', bn: 'VIP', seg: 'vip' },
    { id: 'g-risk', en: 'At risk', bn: 'হারানোর ঝুঁকি', seg: 'risk' },
    { id: 'g-dhaka', en: 'Dhaka repeat buyers', bn: 'ঢাকার নিয়মিত ক্রেতা', district: 'Dhaka', ordersOver: 1 },
    { id: 'g-panjabi', en: 'Panjabi buyers', bn: 'পাঞ্জাবি ক্রেতা', cat: 'panjabi' },
    { id: 'g-ref', en: 'Refusers', bn: 'ফেরত দেন', seg: 'refuser' },
  ];
  function renderGroups(el) {
    const fx = facts(); const L = live(); const custom = (A.D.custGroups = A.D.custGroups || []);
    const all = BUILT.map((g) => ({ ...g, built: true })).concat(custom);
    const card = (g) => { const m = L.filter(matcher(g, fx)); return `<div class="card cus-grp"><div class="row between"><b>${esc(g.built ? t(g.en, g.bn) : g.name)}</b>${g.built ? U.badge(t('Ready-made', 'তৈরি করা'), '') : U.badge(t('Yours', 'আপনার'), 'accent')}</div><div><span class="n">${m.length}</span> <span class="muted small">${t('customers', 'জন কাস্টমার')} · ${tk(A.sum(m, (c) => c.spent))} ${t('spent', 'খরচ')}</span></div><div class="small muted">${condText(g)}</div><div class="row"><a class="btn sm primary" href="${A.href('marketing', 'messages')}" data-camp="${g.id}">${A.icon('send')} ${t('Send campaign', 'ক্যাম্পেইন পাঠান')}</a><button class="btn sm" data-gexp="${g.id}">${A.icon('down')} ${t('Export', 'এক্সপোর্ট')}</button>${g.built ? '' : `<button class="btn sm ghost" data-gdel="${g.id}">${t('Remove', 'সরান')}</button>`}</div></div>`; };
    el.innerHTML = A.pageHead(t('Customer groups', 'কাস্টমার গ্রুপ'), t('Groups update by themselves as people order. Use them for messages, offers and ads.', 'মানুষ অর্ডার দিলে গ্রুপ নিজেই আপডেট হয়। মেসেজ, অফার ও বিজ্ঞাপনে ব্যবহার করুন।'), `<button class="btn primary" id="gr-new">${A.icon('plus')} ${t('Create group', 'নতুন গ্রুপ')}</button>`) + A.tabsBar('customers', 'groups') +
      `<div class="grid g3">${all.map(card).join('')}</div>`;
    const find = (id) => all.find((g) => g.id === id);
    A.on(el, '[data-camp]', 'click', (e, b) => { const g = find(b.dataset.camp); A.D.campaignAudience = { id: g.id, name: g.built ? g.en : g.name }; A.commit(`Picked group ${g.built ? g.en : g.name} for a message campaign`); });
    A.on(el, '[data-gexp]', 'click', (e, b) => { const g = find(b.dataset.gexp); U.download(`${(g.built ? g.en : g.name).toLowerCase().replace(/\W+/g, '-')}-${L.filter(matcher(g, fx)).length}.csv`); });
    A.on(el, '[data-gdel]', 'click', (e, b) => U.confirm(t('Remove this group?', 'গ্রুপটি সরাবেন?'), t('Only the saved group goes away. Customers stay as they are.', 'শুধু সেভ করা গ্রুপ যাবে। কাস্টমাররা যেমন আছে থাকবেন।'), t('Remove', 'সরান'), () => { const g = find(b.dataset.gdel); g.removed = true; A.D.custGroups = custom.filter((x) => x.id !== g.id); A.commit(`Removed group ${g.name}`); A.toast(t('Group removed', 'গ্রুপ সরানো হয়েছে'), 'good'); A.render(); }));
    el.querySelector('#gr-new').onclick = () => {
      const districts = Array.from(new Set(L.map((c) => c.district))).sort();
      const m = U.modal(t('Create group', 'নতুন গ্রুপ'), `${U.field(t('Group name', 'গ্রুপের নাম'), U.input('ng-n', '', `placeholder="${t('e.g. Chattogram hoodie buyers', 'যেমন: চট্টগ্রামের হুডি ক্রেতা')}"`))}
        <div class="cus-cond">${U.field(t('District', 'জেলা'), U.select('ng-d', [['', t('Any', 'যেকোনো')], ...districts.map((d) => [d, d])], ''))}${U.field(t('Spent over', 'খরচ এর বেশি'), U.money('ng-s', ''))}${U.field(t('Orders over', 'অর্ডার এর বেশি'), U.input('ng-o', '', 'type="number" min="0"'))}${U.field(t('Last order older than (days)', 'শেষ অর্ডার কত দিনের বেশি আগে'), U.input('ng-l', '', 'type="number" min="0"'))}${U.field(t('Bought category', 'যে ক্যাটাগরি কিনেছেন'), U.select('ng-c', [['', t('Any', 'যেকোনো')], ...A.CATS.map((c) => [c.id, t(c.en, c.bn)])], ''))}</div>
        <div class="cus-live" style="margin-top:12px" id="ng-live"></div>`, { wide: true, foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="ng-ok">${t('Save group', 'গ্রুপ সেভ করুন')}</button>` });
      const read = () => ({ district: m.querySelector('#ng-d').value, spentOver: +m.querySelector('#ng-s').value || 0, ordersOver: +m.querySelector('#ng-o').value || 0, olderThan: +m.querySelector('#ng-l').value || 0, cat: m.querySelector('#ng-c').value });
      const upd = () => { const g = read(); const ms = L.filter(matcher(g, fx)); m.querySelector('#ng-live').innerHTML = `<div><b style="font-size:20px">${ms.length}</b> ${t('customers match', 'জন কাস্টমার মিলেছে')} · ${tk(A.sum(ms, (c) => c.spent))}</div><div class="small muted ellip" style="max-width:100%">${ms.slice(0, 4).map((c) => esc(c.name)).join(', ')}${ms.length > 4 ? '…' : ''}</div>`; };
      m.querySelectorAll('input,select').forEach((x) => (x.oninput = upd)); upd();
      m.querySelector('#ng-ok').onclick = () => { const n = m.querySelector('#ng-n').value.trim(); if (!n) { A.toast(t('Give the group a name', 'গ্রুপের নাম দিন'), 'bad'); return; } custom.push({ id: A.uid('G'), name: n, ...read() }); U.close(); A.commit(`Created group ${n}`); A.toast(t('Group saved', 'গ্রুপ সেভ হয়েছে'), 'good'); A.render(); };
    };
  }

  /* ================= LOYALTY & WALLET ================= */
  function renderLoyalty(el) {
    const L = loyalty(); const cs = live();
    const wal = cs.filter((c) => c.wallet > 0).sort((a, b) => b.wallet - a.wallet);
    const top = cs.slice().sort((a, b) => b.points - a.points).slice(0, 8);
    const totalPts = A.sum(cs, (c) => c.points); const owed = Math.floor(totalPts / L.points) * L.worth;
    const back = L.perTk && L.points ? L.worth / L.points / L.perTk * 100 : 0;
    const log = llog();
    el.innerHTML = A.pageHead(t('Loyalty & wallet', 'লয়্যালটি ও ওয়ালেট'), t('Customers earn points on delivered orders and spend them as a discount. Wallet money comes from size exchanges at a lower price, rider overcharges given back, or your gifts.', 'ডেলিভারি হওয়া অর্ডারে কাস্টমার পয়েন্ট পান, পরে ছাড় হিসেবে খরচ করেন। ওয়ালেটের টাকা আসে কম দামের সাইজ এক্সচেঞ্জ, রাইডারের বাড়তি নেওয়া টাকা ফেরত বা আপনার উপহার থেকে।'), `<button class="btn" id="ly-adj">${A.icon('edit')} ${t('Adjust points', 'পয়েন্ট ঠিক করুন')}</button>`) + A.tabsBar('customers', 'loyalty') +
      `<div class="grid g4" style="margin-bottom:14px">
        <div class="card">${U.kpi({ label: t('Points with customers', 'কাস্টমারদের পয়েন্ট'), value: A.fmt.num(totalPts), sub: t(`worth ${tk(owed)} in discounts`, `${tk(owed)} ছাড়ের সমান`) })}</div>
        <div class="card">${U.kpi({ label: t('Wallet balances', 'ওয়ালেটে টাকা'), value: tk(A.sum(wal, (c) => c.wallet)), sub: t(`${wal.length} customers`, `${wal.length} জন কাস্টমার`) })}</div>
        <div class="card">${U.kpi({ label: t('Money back to customers', 'কাস্টমার যা ফেরত পান'), value: A.fmt.pct(back, 2), sub: t('of what they spend', 'খরচের') })}</div>
        <div class="card">${U.kpi({ label: t('Members with points', 'পয়েন্ট আছে এমন'), value: cs.filter((c) => c.points > 0).length })}</div></div>
      <div class="grid g3"><div class="span2 stack" style="gap:14px">
        ${U.card(t('Points rule', 'পয়েন্টের নিয়ম'), `<div class="stack"><div class="row between"><span>${t('Loyalty points on', 'লয়্যালটি পয়েন্ট চালু')}</span>${U.switch('ly-on', L.on)}</div>
          <div class="cus-rule">${t('Customer gets 1 point for every', 'প্রতি')} <div class="money"><input class="inp" id="ly-per" type="number" value="${L.perTk}"></div> ${t('spent on a delivered order', 'টাকা খরচে (ডেলিভারি হওয়া অর্ডারে) 1 পয়েন্ট')}</div>
          <div class="cus-rule"><input class="inp" id="ly-pts" type="number" value="${L.points}"> ${t('points =', 'পয়েন্ট =')} <div class="money"><input class="inp" id="ly-worth" type="number" value="${L.worth}"></div> ${t('off the next order', 'পরের অর্ডারে ছাড়')}</div>
          <div id="ly-ex"></div><div><button class="btn primary" id="ly-save">${t('Save rule', 'নিয়ম সেভ করুন')}</button></div></div>`, { sub: t('Changes apply to new orders. Points already earned stay.', 'নতুন অর্ডার থেকে বদল খাটবে। আগের পয়েন্ট থাকবে।') })}
        ${U.card(t('Adjustment history', 'পরিবর্তনের ইতিহাস'), log.length ? `<div class="list">${log.slice(0, 15).map((x) => `<div class="li"><div class="grow"><b>${esc(x.name)}</b> <span class="small muted">· ${esc(x.reason)}</span><div class="small muted">${A.fmt.dt(x.t)} · ${esc(x.by === 'You' ? t('You', 'আপনি') : x.by)}</div></div><b style="color:${x.amount < 0 ? 'var(--bad)' : 'var(--good)'}">${x.amount > 0 ? '+' : ''}${x.kind === 'wallet' ? tk(x.amount) : A.fmt.num(x.amount) + ' ' + t('pts', 'পয়েন্ট')}</b></div>`).join('')}</div>` : U.empty(t('No manual changes yet. Wallet credits and point changes you make show here.', 'এখনো হাতে কোনো পরিবর্তন নেই। আপনার দেওয়া ওয়ালেট ক্রেডিট ও পয়েন্ট বদল এখানে দেখাবে।')))}
      </div><div class="stack" style="gap:14px">
        ${U.card(t('Wallet balances', 'ওয়ালেট ব্যালান্স'), wal.length ? `<div class="list">${wal.map((c) => `<a class="li" href="${A.href('customers', 'all', c.id)}" style="text-decoration:none;color:inherit"><span class="grow ellip">${esc(c.name)}<div class="small muted mono">${esc(c.phone)}</div></span><b>${tk(c.wallet)}</b></a>`).join('')}</div>` : U.empty(t('Nobody has wallet money.', 'কারও ওয়ালেটে টাকা নেই।')))}
        ${U.card(t('Top point earners', 'সবচেয়ে বেশি পয়েন্ট'), `<div class="list">${top.map((c, i) => `<a class="li" href="${A.href('customers', 'all', c.id)}" style="text-decoration:none;color:inherit"><span class="muted small" style="width:16px">${i + 1}</span><span class="grow ellip">${esc(c.name)}</span><b>${A.fmt.num(c.points)}</b></a>`).join('')}</div>`)}
      </div></div>`;
    const $ = (s) => el.querySelector(s);
    const ex = () => { const per = +$('#ly-per').value || 0, pts = +$('#ly-pts').value || 0, w = +$('#ly-worth').value || 0; const earned = per ? Math.floor(2000 / per) : 0; $('#ly-ex').innerHTML = U.callout(t(`Example: a ${tk(2000)} order earns ${earned} points. ${pts} points give ${tk(w)} off — about ${A.fmt.pct(per && pts ? w / pts / per * 100 : 0, 2)} back on spending.`, `উদাহরণ: ${tk(2000)}-এর অর্ডারে ${earned} পয়েন্ট। ${pts} পয়েন্টে ${tk(w)} ছাড় — খরচের প্রায় ${A.fmt.pct(per && pts ? w / pts / per * 100 : 0, 2)} ফেরত।`)); };
    ['#ly-per', '#ly-pts', '#ly-worth'].forEach((s) => ($(s).oninput = ex)); ex();
    $('#ly-save').onclick = () => {
      const per = Math.round(+$('#ly-per').value), pts = Math.round(+$('#ly-pts').value), w = Math.round(+$('#ly-worth').value);
      if (!(per > 0 && pts > 0 && w >= 0)) { A.toast(t('Numbers must be above 0', 'সংখ্যা 0-এর বেশি দিন'), 'bad'); return; }
      pin(t('Save points rule?', 'পয়েন্টের নিয়ম সেভ করবেন?'), t(`1 point per ${tk(per)} · ${pts} points = ${tk(w)} off. This changes how much discount customers get.`, `প্রতি ${tk(per)}-এ 1 পয়েন্ট · ${pts} পয়েন্ট = ${tk(w)} ছাড়। এতে কাস্টমারের ছাড় বদলাবে।`), t('Save', 'সেভ করুন'), () => { Object.assign(L, { on: $('#ly-on') ? $('#ly-on').checked : L.on, perTk: per, points: pts, worth: w }); A.commit(`Loyalty rule: 1 pt per ৳${per}, ${pts} pts = ৳${w}`); A.toast(t('Points rule saved', 'পয়েন্টের নিয়ম সেভ হয়েছে'), 'good'); A.render(); });
    };
    $('#ly-on').onchange = (e) => { L.on = e.target.checked; A.commit(`Loyalty points ${L.on ? 'on' : 'off'}`); A.toast(L.on ? t('Loyalty points on', 'লয়্যালটি পয়েন্ট চালু') : t('Loyalty points off — customers keep what they have', 'লয়্যালটি পয়েন্ট বন্ধ — আগের পয়েন্ট থাকবে'), 'good'); };
    $('#ly-adj').onclick = () => {
      const opts = cs.filter((c) => c.orders).sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.id, `${c.name} · ${c.phone} · ${c.points} ${t('pts', 'পয়েন্ট')}`]);
      const m = U.modal(t('Adjust points', 'পয়েন্ট ঠিক করুন'), `${U.field(t('Customer', 'কাস্টমার'), U.select('pa-c', opts, opts[0][0]))}${U.field(t('Points (+ to add, − to take away)', 'পয়েন্ট (+ যোগ, − বাদ)'), U.input('pa-n', '50', 'type="number"'))}${U.field(t('Reason', 'কারণ'), U.input('pa-r', t('Birthday gift', 'জন্মদিনের উপহার')))}`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="pa-ok">${t('Save', 'সেভ করুন')}</button>` });
      m.querySelector('#pa-ok').onclick = () => { const c = A.byId(A.D.customers, m.querySelector('#pa-c').value); const n = Math.round(+m.querySelector('#pa-n').value || 0); if (!n) return; if (c.points + n < 0) { A.toast(t('Not enough points', 'যথেষ্ট পয়েন্ট নেই'), 'bad'); return; } c.points += n; llog().unshift({ t: NOW(), cid: c.id, name: c.name, kind: 'points', amount: n, reason: m.querySelector('#pa-r').value || '—', by: 'You' }); U.close(); A.commit(`Points ${n > 0 ? '+' : ''}${n} for ${c.name}`); A.toast(t('Points updated', 'পয়েন্ট আপডেট হয়েছে'), 'good'); A.render(); };
    };
  }

  /* ================= DUPLICATES ================= */
  function dupes() {
    if (A.D.dupes) return A.D.dupes;
    const cs = A.D.customers; const out = [];
    const byName = A.groupBy(cs.filter((c) => c.orders), (c) => c.name);
    Object.values(byName).filter((g) => g.length > 1).slice(0, 4).forEach((g) => out.push({ id: 'D' + out.length, kind: 'name', a: g[0].id, b: g[1].id, done: '' }));
    // records left by chats / abandoned checkouts with the same phone but a different spelling
    const pickC = cs.filter((c) => c.orders >= 2).slice(0, 3);
    const variants = (n) => { const [f, l] = n.split(' '); return [f, `${f.slice(0, -1)}${f.slice(-1) === 'm' ? 'mm' : f.slice(-1) + 'h'} ${l}`, `Md ${n}`]; };
    pickC.forEach((c, i) => out.push({ id: 'D' + out.length, kind: 'phone', a: c.id, guest: { name: variants(c.name)[i % 3], phone: c.phone, from: ['Messenger chat', 'Abandoned checkout', 'Phone order'][i], at: new Date(A.TODAY - (i + 2) * 5 * DAY).toISOString() }, done: '' }));
    A.D.dupes = out; return out;
  }
  function renderMerge(el) {
    const list = dupes(); const open = list.filter((d) => !d.done); const done = list.filter((d) => d.done);
    const side = (c, label) => `<div class="side"><div class="small muted">${label}</div><b>${esc(c.name)}</b><div class="mono small">${esc(c.phone)}</div><div class="small muted">${esc(c.district || '')}${c.area ? ', ' + esc(c.area) : ''}</div>${c.orders != null ? `<div class="small">${c.orders} ${t('orders', 'অর্ডার')} · ${tk(c.spent)} · ${c.points} ${t('pts', 'পয়েন্ট')}</div>` : `<div class="small">${t('From', 'যেখান থেকে')}: ${esc(c.from)} · ${A.fmt.date(c.at)}</div>`}</div>`;
    const card = (d) => {
      const a = A.byId(A.D.customers, d.a); const b = d.kind === 'name' ? A.byId(A.D.customers, d.b) : d.guest;
      if (!a || !b) return '';
      const why = d.kind === 'name' ? t('Same name, different phone', 'একই নাম, ভিন্ন ফোন') : t('Same phone, different name', 'একই ফোন, ভিন্ন নাম');
      return U.card('', `<div class="row between" style="margin-bottom:10px">${U.badge(why, d.kind === 'phone' ? 'warn' : 'info')}<span class="small muted">${d.kind === 'phone' ? t('Very likely the same person', 'খুব সম্ভবত একই মানুষ') : t('Check before merging — could be two people', 'মার্জের আগে দেখুন — দুজন আলাদা মানুষও হতে পারেন')}</span></div><div class="cus-pair">${side(a, t('Keep', 'রাখুন'))}<div class="mid">←</div>${side(b, t('Merge into it', 'এর সাথে মেলান'))}</div><div class="row" style="margin-top:10px"><button class="btn sm primary" data-mg="${d.id}">${t('Merge', 'মার্জ করুন')}</button><button class="btn sm ghost" data-nd="${d.id}">${t('Not the same person', 'একই মানুষ নন')}</button></div>`);
    };
    el.innerHTML = A.pageHead(t('Duplicates to merge', 'ডুপ্লিকেট মার্জ'), t('The same person sometimes appears twice — from a chat, a guest checkout or a second phone. Merging joins their orders, points and wallet.', 'একই মানুষ কখনো দুবার থাকেন — চ্যাট, গেস্ট চেকআউট বা দ্বিতীয় ফোন থেকে। মার্জ করলে অর্ডার, পয়েন্ট ও ওয়ালেট এক হয়।')) + A.tabsBar('customers', 'merge') +
      `<div class="grid g3" style="margin-bottom:14px"><div class="card">${U.kpi({ label: t('Possible duplicates', 'সম্ভাব্য ডুপ্লিকেট'), value: open.length })}</div><div class="card">${U.kpi({ label: t('Merged', 'মার্জ হয়েছে'), value: done.filter((d) => d.done === 'merged').length })}</div><div class="card">${U.kpi({ label: t('Marked different', 'আলাদা হিসেবে রাখা'), value: done.filter((d) => d.done === 'different').length })}</div></div>
      ${open.length ? `<div class="grid g2">${open.map(card).join('')}</div>` : U.card('', U.empty(t('No duplicates left. New ones show up here by themselves.', 'আর কোনো ডুপ্লিকেট নেই। নতুন হলে এখানে নিজেই আসবে।')))}
      ${done.length ? U.card(t('Done', 'সম্পন্ন'), `<div class="list">${done.map((d) => { const a = A.byId(A.D.customers, d.a); const b = d.kind === 'name' ? A.byId(A.D.customers, d.b) : d.guest; return `<div class="li"><span class="grow small">${esc(a.name)} + ${esc(b.name)}</span>${U.badge(d.done === 'merged' ? t('Merged', 'মার্জ হয়েছে') : t('Different people', 'আলাদা মানুষ'), d.done === 'merged' ? 'good' : '')}</div>`; }).join('')}</div>`, { cls: '' }) : ''}`;
    A.on(el, '[data-nd]', 'click', (e, b) => { const d = list.find((x) => x.id === b.dataset.nd); d.done = 'different'; A.commit('Marked customers as different people'); A.toast(t('Kept as two customers', 'দুজন আলাদা কাস্টমার হিসেবে থাকলো'), 'good'); A.render(); });
    A.on(el, '[data-mg]', 'click', (e, btn) => {
      const d = list.find((x) => x.id === btn.dataset.mg); const a = A.byId(A.D.customers, d.a);
      const b = d.kind === 'name' ? A.byId(A.D.customers, d.b) : d.guest;
      U.confirm(t('Merge these two?', 'এই দুটি মার্জ করবেন?'), t(`${esc(b.name)} (${esc(b.phone)}) joins ${esc(a.name)}. Orders, points and wallet are added together; the other phone is kept as a second number. Nothing is deleted.`, `${esc(b.name)} (${esc(b.phone)}) ${esc(a.name)}-এর সাথে যুক্ত হবে। অর্ডার, পয়েন্ট ও ওয়ালেট যোগ হবে; অন্য ফোন দ্বিতীয় নম্বর হিসেবে থাকবে। কিছু মুছবে না।`), t('Merge', 'মার্জ করুন'), () => {
        if (d.kind === 'name') {
          A.D.orders.filter((o) => o.customerId === b.id).forEach((o) => { o.customerId = a.id; });
          ['orders', 'delivered', 'refused', 'spent', 'points', 'wallet'].forEach((k) => { a[k] = (a[k] || 0) + (b[k] || 0); });
          if (!a.lastOrder || (b.lastOrder && new Date(b.lastOrder) > new Date(a.lastOrder))) a.lastOrder = b.lastOrder;
          a.altPhones = Array.from(new Set([...(a.altPhones || []), b.phone])); a.tags = Array.from(new Set([...(a.tags || []), ...(b.tags || [])]));
          b.mergedInto = a.id;
        } else { a.altNames = Array.from(new Set([...(a.altNames || []), b.name])); }
        d.done = 'merged'; A.commit(`Merged ${b.name} into ${a.name}`); A.toast(t('Merged', 'মার্জ হয়েছে'), 'good'); A.render();
      });
    });
  }

  A.mod('customers', {
    all: { render: renderAll, guide: {
      en: `<p><b>What:</b> every customer with orders, delivered vs refused, money spent and a group badge.</p><p><b>Why:</b> you treat a VIP who spent ৳12,000 on panjabis differently from someone who refused 2 parcels in Bogura.</p><p><b>How:</b> 1) Search by name, phone or area. 2) Use the chips: VIP (spent ৳8,000+ or 4+ orders), Repeat, New, At risk (2+ orders, none in 45 days), Refusers. 3) Click a customer to see their sizes, favourite items, wallet and points. 4) From the profile: send a message, give wallet credit (needs PIN) or block. The 360 profile also shows the influencer code they came with, and what a Packer sees (phone and address hidden).</p>`,
      bn: `<p><b>কী:</b> প্রত্যেক কাস্টমার — অর্ডার, ডেলিভারি বনাম ফেরত, খরচ ও গ্রুপ ব্যাজ।</p><p><b>কেন:</b> পাঞ্জাবিতে ৳12,000 খরচ করা VIP আর বগুড়ায় 2টি পার্সেল ফেরত দেওয়া কাস্টমারকে আলাদা ভাবে দেখতে হয়।</p><p><b>কীভাবে:</b> 1) নাম, ফোন বা এলাকা দিয়ে খুঁজুন। 2) চিপ ব্যবহার করুন: VIP (৳8,000+ খরচ বা 4+ অর্ডার), নিয়মিত, নতুন, হারানোর ঝুঁকি (2+ অর্ডার, 45 দিন কোনো অর্ডার নেই), ফেরত দেন। 3) কাস্টমারে চাপ দিলে সাইজ, পছন্দের আইটেম, ওয়ালেট ও পয়েন্ট দেখবেন। 4) প্রোফাইল থেকে মেসেজ পাঠান, ওয়ালেট ক্রেডিট দিন (PIN লাগবে) বা ব্লক করুন। 360 প্রোফাইলে কোন ইনফ্লুয়েন্সার কোডে এসেছেন আর প্যাকার কী দেখেন (ফোন ও ঠিকানা লুকানো) — সেটাও থাকে।</p>` } },
    groups: { render: renderGroups, guide: {
      en: `<p><b>What:</b> saved groups of customers that update by themselves.</p><p><b>Why:</b> send the new Eid panjabi only to panjabi buyers, or a "we miss you" offer only to regulars who went quiet — fewer SMS, more sales.</p><p><b>How:</b> 1) Use a ready-made group or press "Create group". 2) Pick conditions — district, spent over, orders over, last order older than, category bought — and watch the live count. 3) Save. 4) "Send campaign" opens Message campaigns with this group; "Export" gives a list for Facebook ads.</p>`,
      bn: `<p><b>কী:</b> কাস্টমারদের সেভ করা গ্রুপ, যা নিজেই আপডেট হয়।</p><p><b>কেন:</b> নতুন ঈদের পাঞ্জাবির খবর শুধু পাঞ্জাবি ক্রেতাদের দিন, বা চুপ হয়ে যাওয়া নিয়মিত ক্রেতাদের "আপনাকে মিস করছি" অফার — কম SMS, বেশি বিক্রি।</p><p><b>কীভাবে:</b> 1) তৈরি করা গ্রুপ ব্যবহার করুন বা "নতুন গ্রুপ" চাপুন। 2) শর্ত বাছুন — জেলা, কত টাকার বেশি খরচ, কতটির বেশি অর্ডার, শেষ অর্ডার কত দিন আগে, কোন ক্যাটাগরি কিনেছেন — সাথে সাথে সংখ্যা দেখবেন। 3) সেভ করুন। 4) "ক্যাম্পেইন পাঠান" চাপলে এই গ্রুপ নিয়ে মেসেজ ক্যাম্পেইন খুলবে; "এক্সপোর্ট" দিলে ফেসবুক বিজ্ঞাপনের জন্য তালিকা পাবেন।</p>` } },
    loyalty: { render: renderLoyalty, guide: {
      en: `<p><b>What:</b> the points rule, wallet balances, top earners and every manual change.</p><p><b>Why:</b> points bring people back — a customer with 180 points knows ৳90 is waiting on the next order.</p><p><b>How:</b> 1) Set how many taka earn 1 point and what points are worth. The example line shows how much you give back. 2) Save with your PIN. 3) Use "Adjust points" for gifts or corrections; it is logged. 4) Wallet credit is given from a customer's profile.</p>`,
      bn: `<p><b>কী:</b> পয়েন্টের নিয়ম, ওয়ালেট ব্যালান্স, বেশি পয়েন্টের কাস্টমার আর হাতে করা প্রতিটা বদল।</p><p><b>কেন:</b> পয়েন্ট মানুষকে ফিরিয়ে আনে — 180 পয়েন্ট থাকলে কাস্টমার জানেন পরের অর্ডারে ৳90 অপেক্ষা করছে।</p><p><b>কীভাবে:</b> 1) কত টাকায় 1 পয়েন্ট আর পয়েন্টের দাম কত ঠিক করুন। উদাহরণ লাইনে দেখবেন কত ফেরত দিচ্ছেন। 2) PIN দিয়ে সেভ করুন। 3) উপহার বা ভুল ঠিক করতে "পয়েন্ট ঠিক করুন" ব্যবহার করুন; সব লেখা থাকে। 4) ওয়ালেট ক্রেডিট দিন কাস্টমারের প্রোফাইল থেকে।</p>` } },
    merge: { render: renderMerge, guide: {
      en: `<p><b>What:</b> customers who look like the same person twice.</p><p><b>Why:</b> if Rahim orders from two phones, you would miss that he is a VIP — or that he refused before.</p><p><b>How:</b> 1) "Same phone, different name" is almost always one person — merge. 2) "Same name, different phone" — check the area and orders first. 3) Press "Merge": orders, points and wallet add up and the second phone is kept. Nothing is deleted. 4) "Not the same person" hides the pair.</p>`,
      bn: `<p><b>কী:</b> যেসব কাস্টমার দেখে মনে হয় একই মানুষ দুবার আছেন।</p><p><b>কেন:</b> রহিম দুই ফোন থেকে অর্ডার দিলে বুঝবেন না তিনি VIP — বা আগে পার্সেল ফেরত দিয়েছেন।</p><p><b>কীভাবে:</b> 1) "একই ফোন, ভিন্ন নাম" প্রায় সবসময় একজন — মার্জ করুন। 2) "একই নাম, ভিন্ন ফোন" — আগে এলাকা ও অর্ডার মিলিয়ে দেখুন। 3) "মার্জ করুন" চাপলে অর্ডার, পয়েন্ট ও ওয়ালেট যোগ হবে, দ্বিতীয় ফোন রাখা থাকবে। কিছু মুছবে না। 4) "একই মানুষ নন" চাপলে জোড়াটি সরে যাবে।</p>` } },
  });
})();
