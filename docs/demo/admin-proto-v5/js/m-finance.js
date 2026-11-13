/* module finance — v2 (owner-approved plan, 13 Nov 2026).
   Tabs: overview · cash (Money in & out) · pnl · costs · erp · wallet · vat (hidden unless A.D.store.showVat).
   All profit numbers come from A.calc (pnl, kpis, erpBalance, codWithCouriers) so they match Home and Reports. */
(function () {
  'use strict';
  const A = window.A; const U = A.ui; const t = A.t; const tk = A.fmt.tk; const esc = A.esc; const C = A.calc;
  const DAY = 864e5;
  const NOW = () => A.TODAY.getTime();
  const YMD = (x) => A.fmt.ymd(x);
  const TODAY = () => YMD(A.TODAY);
  const dshort = (ymd) => A.fmt.date(String(ymd).length === 10 ? ymd + 'T12:00:00+06:00' : ymd);
  const daysSince = (x) => Math.floor((NOW() - new Date(String(x).length === 10 ? x + 'T12:00:00+06:00' : x).getTime()) / DAY);
  const lakh = (n) => (Math.abs(n) >= 100000 ? '৳' + (n / 100000).toFixed(n >= 1000000 ? 1 : 2).replace(/\.?0+$/, '') + t(' lakh', ' লাখ') : tk(n));
  const pct = (n) => (Math.round(n * 10) / 10) + '%';
  const cname = (id) => { const c = A.byId(A.D.couriers, id); return c ? c.name : id; };
  const num = (root, id) => Number((root.querySelector('#' + id) || {}).value || 0);
  const val = (root, id) => ((root.querySelector('#' + id) || {}).value || '').trim();

  A.css('finance', `
    .fn-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    @media(max-width:1100px){.fn-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:520px){.fn-tiles{grid-template-columns:1fr}}
    .fn-tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;min-width:0;text-decoration:none;color:inherit}
    .fn-tile:hover{border-color:var(--line2)}
    .fn-tile .l{font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:6px;font-weight:600}
    .fn-tile .v{font:700 24px var(--f-head);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
    .fn-tile .s{font-size:12.5px;color:var(--ink2);line-height:1.45}
    .fn-tile.warn{border-color:color-mix(in srgb,var(--warn) 55%,var(--line))}
    .fn-tile.bad{border-color:color-mix(in srgb,var(--bad) 55%,var(--line))}
    .fn-mini{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--muted)}
    .fn-mini b{color:var(--ink);font-variant-numeric:tabular-nums}
    .fn-wf{display:flex;flex-direction:column;gap:7px}
    .fn-wf .r{display:grid;grid-template-columns:130px minmax(0,1fr) 92px;gap:10px;align-items:center;font-size:13px}
    .fn-wf .tr{position:relative;height:16px;background:var(--card2);border-radius:5px;overflow:hidden}
    .fn-wf .tr i{position:absolute;top:0;bottom:0;border-radius:4px}
    .fn-wf .r.tot{font-weight:700}
    .fn-wf .vv{text-align:right;font-variant-numeric:tabular-nums}
    @media(max-width:520px){.fn-wf .r{grid-template-columns:96px minmax(0,1fr) 78px;font-size:12px}}
    .fn-dec{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
    .fn-dc{border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:var(--card)}
    .fn-dc .h{display:flex;gap:8px;align-items:center;font-weight:700;font-size:13.5px}
    .fn-dc .h i{width:8px;height:8px;border-radius:50%;flex:none}
    .fn-dc p{margin:0;font-size:13px;line-height:1.5;color:var(--ink2)}
    .fn-dc .btn{align-self:flex-start}
    .fn-pl td,.fn-pl th{white-space:nowrap}
    .fn-pl td.lbl{white-space:normal;min-width:140px}
    .fn-pl tr.sum td{font-weight:700;background:var(--card2)}
    .fn-pl tr.big td{font-weight:800;font-size:15px;background:var(--accent-soft)}
    .fn-pl .ind{padding-left:20px;color:var(--ink2)}
    .fn-crumb{display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:13px;margin-bottom:10px}
    .fn-crumb button{background:none;border:0;color:var(--accent);cursor:pointer;padding:2px 4px;font:inherit}
    .fn-crumb span.cur{font-weight:700;padding:2px 4px}
    .fn-ue{display:flex;flex-direction:column}
    .fn-ue .r{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px dashed var(--line);font-size:13px}
    .fn-ue .r b{font-variant-numeric:tabular-nums}
    .fn-ue .r.tot{border-bottom:0;font-weight:800;font-size:15px;padding-top:9px}
    .fn-chk{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}
    .fn-chk:last-child{border-bottom:0}
    .fn-chk .ic{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;flex:none;color:var(--card);font-size:11px;font-weight:800}
    .fn-chk .ic.ok{background:var(--good)} .fn-chk .ic.no{background:var(--warn)} .fn-chk .ic.bad{background:var(--bad)}
    .fn-acc{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    @media(max-width:760px){.fn-acc{grid-template-columns:repeat(2,minmax(0,1fr))}}
    .fn-acc button{all:unset;cursor:pointer;border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--card);display:flex;flex-direction:column;gap:2px;min-width:0}
    .fn-acc button.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}
    .fn-acc .n{font-size:12px;color:var(--muted);font-weight:600}
    .fn-acc .b{font:700 18px var(--f-head);font-variant-numeric:tabular-nums}
    .fn-in{color:var(--good);font-variant-numeric:tabular-nums}
    .fn-out{color:var(--bad);font-variant-numeric:tabular-nums}
    .fn-rcpt{height:84px;border:1px dashed var(--line2);border-radius:10px;display:grid;place-items:center;color:var(--muted);font-size:12.5px;cursor:pointer;background:var(--card2);text-align:center;padding:6px}
    .fn-rcpt.on{border-style:solid;border-color:var(--good);color:var(--good)}
    .fn-hold{display:flex;gap:3px;margin-top:4px}
    .fn-hold i{flex:1;height:6px;border-radius:2px;background:var(--card2)}
    .fn-hold i.u{background:var(--good)} .fn-hold i.w{background:var(--warn)} .fn-hold i.x{background:var(--bad)}
    .fn-stmt{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px;border-color:color-mix(in srgb,var(--accent) 45%,var(--line));background:color-mix(in srgb,var(--accent-soft) 55%,var(--card))}
    .fn-stmt-t{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1 1 280px}
    .fn-stmt-t b{font:700 17px var(--f-head)}
    .btn.fn-big{padding:12px 20px;font-size:15px}
    .fn-g32{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}
    @media(max-width:900px){.fn-g32{grid-template-columns:minmax(0,1fr)}}
    @media(max-width:520px){.fn-st th,.fn-st td{padding:7px 5px;font-size:12px}.fn-st th{white-space:normal}.fn-st td.lbl{min-width:0}}
    .fn-clock{font-variant-numeric:tabular-nums;font-weight:700}
    .fn-snap{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    @media(max-width:700px){.fn-snap{grid-template-columns:1fr}}
    .fn-sn{display:flex;flex-direction:column;gap:6px;border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-decoration:none;color:inherit;background:var(--card);min-width:0}
    .fn-sn:hover{border-color:var(--accent)}
    .fn-sn .l{font-size:12.5px;color:var(--muted);font-weight:600;display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap}
    .fn-sn .v{font:700 24px var(--f-head);font-variant-numeric:tabular-nums;letter-spacing:-.01em;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
    .fn-sn .v.neg{color:var(--bad)}
    .fn-sn .sc{display:flex;height:8px;border-radius:6px;overflow:hidden;background:var(--card2)}
    .fn-sn .sc i{display:block;height:100%}
    .fn-sn .sd{font-size:12px;color:var(--muted);display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
    .fn-chips{display:flex;flex-wrap:wrap;gap:6px}
  `);

  /* ---------- small UI helpers ---------- */
  const pinAsk = (title, html, okLabel, onOk) => {
    const m = U.modal(title, `${html}<div class="field" style="margin-top:14px"><label>${t('Owner PIN (4 digits)', 'মালিকের PIN (4 ডিজিট)')}</label><input class="inp" id="fn-pin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off"><div class="hint" id="fn-pin-e"></div></div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="fn-pin-ok">${okLabel}</button>` });
    const inp = m.querySelector('#fn-pin'); setTimeout(() => inp.focus(), 30);
    const go = () => { if (!/^\d{4}$/.test(inp.value)) { m.querySelector('#fn-pin-e').textContent = t('Type any 4 digits (demo).', 'যেকোনো 4টি সংখ্যা লিখুন (ডেমো)।'); return; } U.close(); onOk(); };
    m.querySelector('#fn-pin-ok').onclick = go; inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  };
  const done = (msg, toast) => { A.commit(msg); A.toast(toast, 'good'); A.render(); };
  /* ---------- profit snapshot (shared with Home): same A.calc.pnl as Profit & loss and Reports ---------- */
  const rng = (key) => { const r = C.range(key); if (key === 'today') { const sod = r.from; return { ...r, prevFrom: sod - DAY, prevTo: sod - DAY + (r.to - r.from) }; } return r; };
  const SNAP = () => [['today', t('Today', 'আজ'), t('vs same hours yesterday', 'গতকালের একই সময়ের তুলনায়')], ['7d', t('Last 7 days', 'গত 7 দিন'), t('vs the 7 days before', 'আগের 7 দিনের তুলনায়')], ['month', t('This month', 'এই মাস'), t('vs same days of October', 'অক্টোবরের একই দিনের তুলনায়')]];
  function snapshotCard() {
    const cols = SNAP().map(([k, lab, vs]) => {
      const r = rng(k); const cur = C.pnl(r.from, r.to); const prev = C.pnl(r.prevFrom, r.prevTo); const cost = cur.revenue - cur.net;
      const cp = cur.revenue > 0 ? Math.min(100, Math.max(0, cost / cur.revenue * 100)) : (cur.net < 0 ? 100 : 0);
      return `<a class="fn-sn" href="${A.href('finance', 'pnl', k)}" title="${t('Open Profit & loss for this period', 'এই সময়ের লাভ-ক্ষতি খুলুন')}"><div class="l"><span>${lab}</span><span>${A.delta(cur.net, prev.net)}</span></div>
        <div class="v ${cur.net < 0 ? 'neg' : ''}">${cur.net < 0 ? '−' : ''}${tk(Math.abs(cur.net))}</div>
        <div class="sc" title="${t('Sales vs costs', 'বিক্রি বনাম খরচ')}"><i style="width:${cp}%;background:var(--warn)"></i><i style="width:${100 - cp}%;background:var(--good)"></i></div>
        <div class="sd"><span>${t('Sales', 'বিক্রি')} <b>${tk(cur.revenue)}</b></span><span>${t('Costs', 'খরচ')} <b>${tk(Math.max(0, cost))}</b></span></div>
        <div class="small muted">${vs}</div></a>`;
    }).join('');
    return U.card(t('Profit snapshot', 'লাভের সারসংক্ষেপ'), `<div class="fn-snap">${cols}</div><div class="muted small" style="margin-top:10px">${t('Net profit after every cost. Monthly fixed costs (rent, salaries) are spread per day, so "Today" is fair. Tap a number to open Profit & loss for that period.', 'সব খরচের পর নিট লাভ। মাসিক খরচ (ভাড়া, বেতন) দিনে ভাগ করে ধরা হয়, তাই "আজ" এর হিসাব ঠিক থাকে। যেকোনো সংখ্যায় চাপলে ওই সময়ের লাভ-ক্ষতি খুলবে।')}</div>`, { sub: t('Green = what you keep, orange = what it cost', 'সবুজ = যা থাকে, কমলা = যা খরচ হয়'), more: t('Profit & loss', 'লাভ-ক্ষতি'), moreHref: A.href('finance', 'pnl') });
  }
  A.profitSnapshot = snapshotCard;

  /* ---------- courier claims: ONE ledger (A.D.claims, written through A.ordersApi) ---------- */
  const claimsL = () => { let l = null; try { l = A.ordersApi && A.ordersApi.claims ? A.ordersApi.claims() : null; } catch (e) { l = null; } return Array.isArray(l) ? l : (A.D.claims || []); };
  const claimIsOpen = (c) => c.status === 'open' || c.status === 'sent';
  const claimOf = (oid, type) => claimsL().find((c) => c.oid === oid && c.type === type);
  function raiseClaim(o, type, amount, note) {
    const c = { id: 'CL-' + (401 + claimsL().length), oid: o.id, courier: o.courier || 'pathao', type, amount: Math.round(amount), at: A.TODAY.toISOString(), deadline: new Date(NOW() + 10 * DAY).toISOString(), status: 'open', recovered: 0, note: note || '' };
    if (A.ordersApi && A.ordersApi.addClaim) A.ordersApi.addClaim(c); else (A.D.claims = A.D.claims || []).unshift(c);
  }
  const c360 = (id) => { try { if (A.couriersApi && A.couriersApi.href) return A.couriersApi.href(id); } catch (e) {} return '#couriers--c360--' + id; };
  const payoutsL = () => { try { return (A.couriersApi && A.couriersApi.payouts && A.couriersApi.payouts()) || []; } catch (e) { return []; } };
  const PAYSTAT = { expected: ['Expected', 'আসবে', 'info'], due: ['Due', 'পাওনা', 'warn'], late: ['Late', 'দেরি', 'bad'], paid: ['Paid', 'পেয়েছি', 'good'], partial: ['Part paid', 'আংশিক', 'warn'], pending: ['Pending', 'অপেক্ষায়', 'info'], disputed: ['Disputed', 'বিতর্ক', 'bad'] };
  const payChip = (p) => { const st = String(p.status || 'pending').toLowerCase(); const m = PAYSTAT[st] || [st.charAt(0).toUpperCase() + st.slice(1), st, 'info']; return U.badge(`${cname(p.courier || p.cid || p.courierId || '')} · ${t(m[0], m[1])}${p.amount != null ? ' · ' + tk(p.amount) : ''}`, m[2]); };

  const tile = ({ label, value, sub, tone = '', href = '', extra = '', icon = '' }) => `<a class="fn-tile ${tone}" ${href ? `href="${href}"` : ''}><div class="l">${icon ? A.icon(icon, 16) : ''}${label}</div><div class="v">${value}</div><div class="s">${sub}</div>${extra}</a>`;
  const G = (whatEn, whatBn, whyEn, whyBn, howEn, howBn) => ({ en: `<p><b>What:</b> ${whatEn}</p><p><b>Why:</b> ${whyEn}</p><p><b>How:</b></p><ol>${howEn.map((x) => `<li>${x}</li>`).join('')}</ol>`, bn: `<p><b>কী:</b> ${whatBn}</p><p><b>কেন:</b> ${whyBn}</p><p><b>কীভাবে:</b></p><ol>${howBn.map((x) => `<li>${x}</li>`).join('')}</ol>` });


  /* ---------- downloads: Excel / PDF on letterhead / Print (prototype = preview + toast) ---------- */
  const expBtn = (id) => `<button class="btn" id="${id}">${A.icon('down', 16)} ${t('Download / Print', 'ডাউনলোড / প্রিন্ট')}</button>`;
  function exportDoc(title, rows, note) {
    const st = A.D.store || {};
    const body = `<div style="border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--card)">
      <div class="row between" style="border-bottom:2px solid var(--navy2);padding-bottom:8px;margin-bottom:10px;gap:8px;flex-wrap:wrap"><div><b style="font-size:18px;letter-spacing:.08em">${esc(st.name || 'EXTAS')}</b><div class="small muted">${esc(st.address || '')}</div></div><div class="small muted" style="text-align:right">${esc(st.phone || '')} · ${esc(st.email || '')}<br>${t('Trade licence', 'ট্রেড লাইসেন্স')} ${esc(st.tradeLicence || '')}</div></div>
      <div class="row between" style="margin-bottom:8px;gap:8px;flex-wrap:wrap"><b>${title}</b><span class="small muted">${t('Made', 'তৈরি')} ${A.fmt.dt(A.TODAY)}</span></div>
      <div class="tbl-wrap"><table class="tbl"><tbody>${rows.map((r) => `<tr class="${r[2] || ''}"><td>${r[0]}</td><td class="r">${r[1]}</td></tr>`).join('')}</tbody></table></div>
      ${note ? `<div class="small muted" style="margin-top:8px">${note}</div>` : ''}</div>`;
    const m = U.modal(t('Download or print', 'ডাউনলোড বা প্রিন্ট'), `<div class="small muted" style="margin-bottom:8px">${t('Preview of page 1', 'পেজ 1 এর প্রিভিউ')}</div>${body}`, { wide: true, foot: `<button class="btn" data-x="xlsx">${t('Excel', 'Excel')}</button><button class="btn" data-x="pdf">${t('PDF', 'PDF')}</button><button class="btn primary" data-x="print">${A.icon('print', 16)} ${t('Print', 'প্রিন্ট')}</button>` });
    m.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { const k = b.dataset.x; U.close(); A.log('Downloaded ' + title + ' (' + k + ')'); A.save(); A.toast(k === 'print' ? t(`${title} sent to the printer`, `${title} প্রিন্টে পাঠানো হয়েছে`) : t(`${title} (${k === 'xlsx' ? 'Excel' : 'PDF'}) is ready — in the real admin it downloads as a file`, `${title} (${k === 'xlsx' ? 'Excel' : 'PDF'}) তৈরি — আসল অ্যাডমিনে ফাইল হিসেবে ডাউনলোড হবে`), 'good'); }));
  }
  const plRows = (p) => [[t('Sales', 'বিক্রি'), tk(p.revenue), 'sum'], [t('Product cost', 'প্রোডাক্টের খরচ'), '−' + tk(p.cogs)], [t('Courier & COD', 'কুরিয়ার ও COD'), '−' + tk(p.courier + p.cod)], [t('Packing & gateway', 'প্যাকিং ও গেটওয়ে'), '−' + tk(p.packaging + p.gateway)], [t('Returns', 'রিটার্ন'), '−' + tk(p.returns)], [t('Gross profit', 'গ্রস লাভ'), tk(p.gross), 'sum'], [t('Ads', 'বিজ্ঞাপন'), '−' + tk(p.ads)], [t('Fixed costs', 'মাসিক খরচ'), '−' + tk(p.fixed)], [t('Other expenses', 'অন্যান্য খরচ'), '−' + tk(p.other)], [t('Net profit', 'নিট লাভ'), '<b>' + tk(p.net) + '</b>', 'sum']];

  /* ---------- VAT switch (hidden by default) ---------- */
  const NAVS = A.sec('finance'); const VAT_TAB = NAVS.tabs.find((x) => x[0] === 'vat') || ['vat', { en: 'VAT', bn: 'ভ্যাট' }];
  const vatOn = () => !!(A.D && A.D.store && A.D.store.showVat);
  const syncVat = () => {
    const S = A.sec('finance'); if (!S) return; const has = S.tabs.some((x) => x[0] === 'vat');
    if (vatOn() && !has) S.tabs.push(VAT_TAB); else if (!vatOn() && has) S.tabs.splice(S.tabs.findIndex((x) => x[0] === 'vat'), 1);
  };
  if (!A.__finVatWrap) { A.__finVatWrap = true; const orig = A.render; A.render = function () { try { syncVat(); if (A.D && A.D.orders) syncFixed(); } catch (e) { console.warn(e); } return orig.apply(this, arguments); }; }
  try { syncVat(); } catch (e) {}

  /* ---------- targets ---------- */
  const targets = () => {
    const s = (A.D.store.targets = A.D.store.targets || {});
    return { sales: s.sales || (A.D.home && A.D.home.target) || 750000, profit: s.profit || 90000, adsPct: s.adsPct || 20 };
  };
  function editTargets() {
    const g = targets();
    const m = U.modal(t('Monthly targets', 'মাসের টার্গেট'), `<div class="formgrid">
      ${U.field(t('Sales target (৳ per month)', 'বিক্রির টার্গেট (মাসে ৳)'), U.money('tg-s', g.sales))}
      ${U.field(t('Net profit target (৳ per month)', 'নিট লাভের টার্গেট (মাসে ৳)'), U.money('tg-p', g.profit))}
      ${U.field(t('Ads at most (% of sales)', 'বিজ্ঞাপন সর্বোচ্চ (বিক্রির %)'), U.input('tg-a', g.adsPct, 'type="number" inputmode="numeric"'), t('Home, Finance and Marketing warn you above this.', 'এর বেশি হলে Home, হিসাব ও মার্কেটিং সতর্ক করবে।'))}
    </div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="tg-ok">${t('Save targets', 'টার্গেট সেভ করুন')}</button>` });
    m.querySelector('#tg-ok').onclick = () => {
      const n = { sales: num(m, 'tg-s'), profit: num(m, 'tg-p'), adsPct: num(m, 'tg-a') };
      if (!(n.sales > 0) || !(n.adsPct > 0)) return A.toast(t('Enter the targets', 'টার্গেট লিখুন'), 'bad');
      A.D.store.targets = n; if (A.D.home) A.D.home.target = n.sales; U.close();
      done('Finance targets changed', t('Targets saved. Home and Finance use them now.', 'টার্গেট সেভ হয়েছে। Home ও হিসাব এখন এগুলো ধরে চলবে।'));
    };
  }

  /* ---------- finance state (seeded once, saved in A.D.fin) ---------- */
  function store() {
    const D = A.D;
    if (!D.fin || !D.fin.v2) {
      const f = { v2: true, opening: { cash: 45000, bank: 260000, bkash: 18000, nagad: 9000 }, moves: [], match: {}, closed: { '2026-09': { at: '2026-10-03T11:20:00+06:00', by: 'Mehadi Hasan' } }, receipts: {}, payDay: {}, fixedNext: {}, usdRate: 122, refundApprover: 'owner', erpFix: {}, summaryResent: {} };
      f.moves = [
        { id: 'MV1', date: '2026-10-01', acc: 'bank', amt: -40000, kind: 'owner', what: 'Owner took money (personal)', by: 'Mehadi Hasan' },
        { id: 'MV2', date: '2026-10-20', acc: 'bank', amt: -20000, kind: 'transfer', what: 'Moved to cash box', by: 'Mehadi Hasan' },
        { id: 'MV3', date: '2026-10-20', acc: 'cash', amt: 20000, kind: 'transfer', what: 'Moved from bank', by: 'Mehadi Hasan' },
        { id: 'MV4', date: '2026-11-02', acc: 'bkash', amt: -50000, kind: 'transfer', what: 'Moved to bank', by: 'Mehadi Hasan' },
        { id: 'MV5', date: '2026-11-02', acc: 'bank', amt: 50000, kind: 'transfer', what: 'Moved from bKash', by: 'Mehadi Hasan' },
        { id: 'MV6', date: '2026-11-08', acc: 'bank', amt: 100000, kind: 'capital', what: 'Owner put in money (winter stock)', by: 'Mehadi Hasan' },
      ];
      D.expenses.forEach((e) => { if (!e.fixed) f.receipts[e.id] = e.cat !== 'Content'; });
      D.fin = f;
    }
    if (!D.fin.refunds) {
      const pre = D.orders.filter((o) => o.status === 'cancelled' && o.payment !== 'COD').slice(0, 7);
      D.fin.refunds = pre.map((o, i) => {
        const waiting = i < 3; const req = waiting ? new Date(NOW() - [6, 31, 63][i] * 36e5).toISOString() : new Date(new Date(o.created).getTime() + 5 * 36e5).toISOString();
        return { id: 'RF' + (300 + i), orderId: o.id, customerId: o.customerId, name: o.name, method: o.payment, amount: o.total, reason: i % 3 === 1 ? 'cannot' : 'cancelled', requestedAt: req, status: waiting ? 'waiting' : 'done', doneAt: waiting ? null : new Date(Math.min(NOW(), new Date(req).getTime() + 20 * 36e5)).toISOString(), by: waiting ? '' : 'Mehadi Hasan' };
      });
    }
    if (!D.fin.wallet) {
      D.fin.wallet = D.orders.filter((o) => o.status === 'exchanged').slice(0, 8).map((o, i) => ({ id: 'WL' + i, orderId: o.id, customerId: o.customerId, name: o.name, amount: Math.round(o.lines[0].price * (0.08 + (i % 3) * 0.05) / 10) * 10, date: YMD(new Date(o.deliveredAt || o.created).getTime() + 2 * DAY), status: i < 2 ? 'waiting' : 'added' }));
      D.fin.wallet.forEach((w) => { if (w.date > TODAY()) w.date = TODAY(); });
    }
    if (!D.fin.fx) D.fin.fx = fxSeed();
    return D.fin;
  }

  /* ---------- accounts & cashbook ---------- */
  const ACC = [['cash', 'Cash box', 'ক্যাশ বক্স'], ['bank', 'Bank (DBBL)', 'ব্যাংক (DBBL)'], ['bkash', 'bKash merchant', 'বিকাশ মার্চেন্ট'], ['nagad', 'Nagad merchant', 'নগদ মার্চেন্ট']];
  const accName = (id) => { const a = ACC.find((x) => x[0] === id); return a ? t(a[1], a[2]) : id; };
  const settleDay = (o) => (o.settledAt ? YMD(o.settledAt) : YMD(new Date(o.deliveredAt).getTime() + 3 * DAY));
  const payout = (o) => (o.payment === 'COD' ? o.total : 0) - C.courierFee(o) - C.codFee(o);
  const KIND = () => ({ courier: t('Courier payout', 'কুরিয়ার পেমেন্ট'), gateway: t('Online payment', 'অনলাইন পেমেন্ট'), refund: t('Refund', 'রিফান্ড'), expense: t('Expense', 'খরচ'), ads: t('Ad bill', 'বিজ্ঞাপন বিল'), erp: t('ERP payment', 'ERP পেমেন্ট'), owner: t('Owner took', 'মালিক নিলেন'), capital: t('Owner put in', 'মালিক দিলেন'), transfer: t('Transfer', 'ট্রান্সফার'), other: t('Other', 'অন্যান্য') });
  function moves() {
    const f = store(); const out = [];
    // courier settlements (one per courier per day)
    const settled = A.D.orders.filter((o) => C.isDelivered(o) && o.settled && o.deliveredAt);
    const byKey = A.groupBy(settled, (o) => (o.courier || 'pathao') + '|' + settleDay(o));
    for (const k of Object.keys(byKey)) {
      const [cid, d] = k.split('|'); const os = byKey[k]; if (d > TODAY()) continue;
      const short = A.sum(os.filter((o) => f.match[o.id] !== 'paid' && misItem(o)), (o) => misItem(o).diff);
      out.push({ date: d, acc: 'bank', amt: A.sum(os, payout) - short, kind: 'courier', what: `${cname(cid)} · ${os.length} ${t('parcels', 'পার্সেল')}`, ref: cid });
    }
    // money recovered from claims counts as received from the courier (the claim list lives in A.D.claims)
    for (const c of claimsL().filter((x) => (x.recovered || 0) > 0)) { const d = YMD(Math.min(NOW(), new Date(c.at).getTime() + 3 * DAY)); out.push({ date: d, acc: 'bank', amt: c.recovered, kind: 'courier', what: `${cname(c.courier)} · ${t('claim recovered', 'ক্লেইমের টাকা')} ${c.oid}`, ref: c.courier }); }
    // online payments (bKash / Nagad land same day; card the next day)
    const online = A.D.orders.filter((o) => o.payment !== 'COD' && o.status !== 'cancelled');
    const byOn = A.groupBy(online, (o) => o.payment + '|' + (o.payment === 'Card' ? YMD(new Date(o.created).getTime() + DAY) : YMD(o.created)));
    for (const k of Object.keys(byOn)) {
      const [m, d] = k.split('|'); if (d > TODAY()) continue; const os = byOn[k];
      out.push({ date: d, acc: m === 'bKash' ? 'bkash' : m === 'Nagad' ? 'nagad' : 'bank', amt: A.sum(os, (o) => o.total - C.gatewayFee(o)), kind: 'gateway', what: `${m} · ${os.length} ${t('orders', 'অর্ডার')}` });
    }
    // refunds paid
    for (const r of f.refunds.filter((x) => x.status === 'done')) out.push({ date: YMD(r.doneAt), acc: r.method === 'bKash' ? 'bkash' : r.method === 'Nagad' ? 'nagad' : 'bank', amt: -r.amount, kind: 'refund', what: `${t('Refund', 'রিফান্ড')} ${r.orderId} · ${esc(r.name)}` });
    // expenses
    for (const e of A.D.expenses) { if (e.date > TODAY() || e.unpaid) continue; out.push({ date: e.date, acc: e.acc || (e.fixed && !/Utilities/.test(e.cat) ? 'bank' : 'cash'), amt: -(e.cashAmt != null ? e.cashAmt : e.amount), kind: 'expense', what: esc(e.name) + (e.fixed ? ' · ' + t('fixed', 'মাসিক') : ''), ref: e.id }); }
    // ad bills, weekly per platform, paid by card in USD
    const adW = A.groupBy(A.D.adSpend, (a) => { const c = A.byId(A.D.campaigns, a.cid); const d = new Date(a.date + 'T12:00:00+06:00'); const wk = YMD(d.getTime() - ((d.getDay() + 1) % 7) * DAY + 6 * DAY); return (c ? c.ch : 'Facebook') + '|' + wk; });
    for (const k of Object.keys(adW)) { const [ch, d] = k.split('|'); if (d > TODAY()) continue; const bdt = A.sum(adW[k], (a) => a.spend); out.push({ date: d, acc: 'bank', amt: -bdt, kind: 'ads', what: `${ch} ${t('ads', 'বিজ্ঞাপন')} · $${A.fmt.num(Math.round(bdt / f.usdRate))} @ ৳${f.usdRate}` }); }
    // ERP payments
    for (const p of A.D.erp.payments) out.push({ date: p.date, acc: 'bank', amt: -p.amount, kind: 'erp', what: `${t('Paid ERP', 'ERP কে পেমেন্ট')} · ${esc(p.ref || '')}` });
    for (const m of f.moves) out.push({ ...m, what: esc(m.what) });
    out.sort((a, b) => (a.date === b.date ? (a.amt > 0 ? -1 : 1) : a.date.localeCompare(b.date)));
    const bal = { ...f.opening }; out.forEach((m) => { bal[m.acc] = (bal[m.acc] || 0) + m.amt; m.bal = bal[m.acc]; });
    return { list: out, bal };
  }
  /* courier statement auto-match: a few parcels where the courier's statement does not match ours */
  function misItem(o) {
    const n = Number(String(o.id).replace(/\D/g, '')); if (!(o.payment === 'COD' && C.isDelivered(o) && o.settled && daysSince(o.deliveredAt) <= 16)) return null;
    if (n % 41 === 3) return { kind: 'fee', diff: 20, text: t(`Courier charged ${tk(C.courierFee(o) + 20)} delivery fee, our rate is ${tk(C.courierFee(o))}`, `কুরিয়ার ডেলিভারি চার্জ কেটেছে ${tk(C.courierFee(o) + 20)}, আমাদের রেট ${tk(C.courierFee(o))}`) };
    if (n % 53 === 7) return { kind: 'missing', diff: o.total, text: t(`Marked delivered, but ${tk(o.total)} cash is not in the statement`, `ডেলিভারি দেখাচ্ছে, কিন্তু ${tk(o.total)} ক্যাশ স্টেটমেন্টে নেই`) };
    return null;
  }
  const MIST = { fee: 'rider', missing: 'short_cod' };
  const misList = () => A.D.orders.filter((o) => misItem(o)).map((o) => { const m = misItem(o); return { o, ...m, ctype: MIST[m.kind], st: claimOf(o.id, MIST[m.kind]) ? 'claim' : (store().match[o.id] === 'accepted' ? 'accepted' : 'open') }; });

  /* ---------- ERP helpers ---------- */
  const lastPay = () => A.D.erp.payments.reduce((m, p) => (p.date > m ? p.date : m), '2000-01-01');
  const hold = () => { const d = daysSince(lastPay()); return { since: d, left: 30 - d, tone: d >= 30 ? 'bad' : d >= 15 ? 'warn' : 'good' }; };
  const avgPay = () => { const p = A.D.erp.payments.slice(-4); return p.length ? Math.round(A.sum(p, (x) => x.amount) / p.length / 1000) * 1000 : 70000; };
  function erpMismatch() {
    const f = store(); const out = [];
    const ret = A.D.orders.find((o) => o.status === 'returned' && o.returnChecked && daysSince(o.created) < 20);
    const ex = A.D.orders.find((o) => o.status === 'exchanged' && daysSince(o.created) < 25);
    if (ret) out.push({ id: 'EM1', orderId: ret.id, diff: C.cogs(ret), text: t(`Return ${ret.id} approved here (${tk(C.cogs(ret))} credit), ERP has not credited it yet`, `রিটার্ন ${ret.id} এখানে অ্যাপ্রুভড (${tk(C.cogs(ret))} ক্রেডিট), ERP এখনো ক্রেডিট দেয়নি`) });
    if (ex) out.push({ id: 'EM2', orderId: ex.id, diff: ex.lines[0].cost, text: t(`Exchange ${ex.id}: ERP billed the new piece twice (${tk(ex.lines[0].cost)})`, `এক্সচেঞ্জ ${ex.id}: ERP নতুন পিস দুইবার বিল করেছে (${tk(ex.lines[0].cost)})`) });
    return out.map((x) => ({ ...x, st: f.erpFix[x.id] || 'open' }));
  }
  const erpSays = () => C.erpBalance().owed + A.sum(erpMismatch().filter((x) => x.st === 'open'), (x) => x.diff);
  function payErp(suggest) {
    const b = C.erpBalance();
    const m = U.modal(t('Pay the ERP', 'ERP কে পেমেন্ট'), `<div class="stack">${U.callout(t(`You owe the ERP <b>${tk(b.owed)}</b>. Last payment ${daysSince(lastPay())} days ago.`, `ERP পাবে <b>${tk(b.owed)}</b>। শেষ পেমেন্ট ${daysSince(lastPay())} দিন আগে।`), 'info')}
      <div class="formgrid">${U.field(t('Amount', 'পরিমাণ'), U.money('rp-a', suggest || avgPay()))}${U.field(t('From account', 'কোন অ্যাকাউন্ট থেকে'), U.select('rp-acc', ACC.map((a) => [a[0], t(a[1], a[2])]), 'bank'))}
      ${U.field(t('Date', 'তারিখ'), U.input('rp-d', TODAY(), 'type="date"'))}${U.field(t('Bank reference', 'ব্যাংক রেফারেন্স'), U.input('rp-r', '', 'placeholder="DBBL-…"'))}</div></div>`,
    { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="rp-ok">${t('Continue', 'এগিয়ে যান')}</button>` });
    m.querySelector('#rp-ok').onclick = () => {
      const p = { id: A.uid('PAY'), date: val(m, 'rp-d') || TODAY(), amount: num(m, 'rp-a'), method: val(m, 'rp-acc') === 'bank' ? 'Bank transfer' : accName(val(m, 'rp-acc')), ref: val(m, 'rp-r') || 'DBBL-' + String(Date.now()).slice(-6) };
      if (!(p.amount > 0)) return A.toast(t('Enter the amount', 'পরিমাণ লিখুন'), 'bad');
      pinAsk(t('Pay the ERP?', 'ERP কে পেমেন্ট করবেন?'), `<p><b>${tk(p.amount)}</b> · ${dshort(p.date)}</p><p class="small muted">${t('It goes to the ERP at once and resets the 30-day hold clock.', 'এটা সাথে সাথে ERP তে যাবে, 30 দিনের হোল্ড ঘড়ি আবার শুরু হবে।')}</p>`, t('Pay', 'পেমেন্ট করুন'), () => {
        A.D.erp.payments.push(p); A.D.erp.payments.sort((a, b2) => a.date.localeCompare(b2.date));
        (A.D.erpEvents = A.D.erpEvents || []).unshift({ t: A.TODAY.toISOString(), kind: 'payment', text: `Payment to ERP sent · ${tk(p.amount)}`, ok: true });
        done('ERP payment ' + tk(p.amount), t(`${tk(p.amount)} paid. ERP is owed ${tk(C.erpBalance().owed)} now.`, `${tk(p.amount)} পেমেন্ট হয়েছে। ERP এখন পাবে ${tk(C.erpBalance().owed)}।`));
      });
    };
  }

  /* ---------- month maths (all from A.calc.pnl) ---------- */
  const MON = { from: () => C.range('month').from };
  function monthView() {
    const r = C.range('month'); const p = C.pnl(r.from, r.to); const elapsed = (r.to - r.from) / DAY; const dim = 30;
    const fixedMonth = A.sum(A.D.expenses.filter((e) => e.fixed && e.date.startsWith('2026-11')), (e) => e.amount);
    const per = (x) => x / elapsed * dim;
    const fcSales = per(p.revenue); const fcNet = per(p.gross) - per(p.ads) - fixedMonth - p.other;
    // break-even: the day contribution (gross − ads − other) covers the month's fixed costs
    let cum = 0, beDay = null; const day = C.daily(r.from, r.to, (d) => { const x = C.pnl(new Date(d + 'T00:00:00+06:00').getTime(), new Date(d + 'T00:00:00+06:00').getTime() + DAY); return x.gross - x.ads - x.other; });
    day.forEach((d) => { cum += d.v; if (beDay == null && cum >= fixedMonth) beDay = d.date; });
    let beFc = null; if (!beDay) { const rate = cum / elapsed; if (rate > 0) beFc = YMD(r.from + Math.ceil(fixedMonth / rate) * DAY); }
    return { r, p, elapsed, fcSales, fcNet, fixedMonth, beDay, beFc, contrib: cum };
  }
  function waterfall(p) {
    const rows = [[t('Sales', 'বিক্রি'), p.revenue, 'tot'], [t('Product cost', 'প্রোডাক্টের খরচ'), -p.cogs], [t('Courier & COD', 'কুরিয়ার ও COD'), -(p.courier + p.cod)], [t('Packing & gateway', 'প্যাকিং ও গেটওয়ে'), -(p.packaging + p.gateway)], [t('Returns', 'রিটার্ন'), -p.returns], [t('Ads', 'বিজ্ঞাপন'), -p.ads], [t('Fixed costs', 'মাসিক খরচ'), -p.fixed], [t('Other costs', 'অন্যান্য খরচ'), -p.other], [t('Net profit', 'নিট লাভ'), p.net, 'tot']];
    const max = Math.max(p.revenue, 1); let run = 0;
    return `<div class="fn-wf">${rows.map((x) => {
      let a, b; if (x[2]) { a = 0; b = x[1]; run = x[1]; } else { a = run + x[1]; b = run; run = a; }
      const l = Math.max(0, Math.min(a, b)) / max * 100; const w = Math.max(0.6, Math.abs(b - a) / max * 100);
      const col = x[2] ? (x[1] >= 0 ? 'var(--navy2)' : 'var(--bad)') : 'var(--bad)';
      return `<div class="r ${x[2] ? 'tot' : ''}"><span class="ellip">${x[0]}</span><span class="tr"><i style="left:${l}%;width:${w}%;background:${col};${x[2] ? '' : 'opacity:.75'}"></i></span><span class="vv">${x[2] ? tk(x[1]) : '−' + tk(-x[1])}</span></div>`;
    }).join('')}</div>`;
  }

  /* ---------- 14-day cash forecast ---------- */
  function forecast(days) {
    const f = store(); const start = A.sum(Object.values(moves().bal));
    const r14 = { from: NOW() - 14 * DAY, to: NOW() };
    const mv = moves().list.filter((m) => m.date >= YMD(r14.from) && m.date <= TODAY());
    const avgCourier = A.sum(mv.filter((m) => m.kind === 'courier'), (m) => m.amt) / 14;
    const avgOnline = A.sum(mv.filter((m) => m.kind === 'gateway'), (m) => m.amt) / 14;
    const adsDaily = A.sum(A.D.campaigns.filter((c) => c.status === 'on'), (c) => c.daily);
    const codNow = C.codWithCouriers(); const lp = lastPay(); const pay = avgPay();
    const fixed = A.D.expenses.filter((e) => e.fixed && e.date.startsWith('2026-11'));
    const refundsDue = f.refunds.filter((x) => x.status === 'waiting');
    let bal = start; const out = []; let tight = null;
    for (let i = 1; i <= days; i++) {
      const d = YMD(NOW() + i * DAY); const items = [];
      const cod = A.sum(codNow.filter((o) => { const sd = settleDay(o); return sd === d || (i === 1 && sd <= TODAY()); }), payout);
      const inC = i <= 3 ? cod + (i === 3 ? 0 : 0) : avgCourier; if (inC) items.push([t('Courier payouts', 'কুরিয়ার পেমেন্ট'), Math.round(inC)]);
      if (avgOnline) items.push([t('Online payments', 'অনলাইন পেমেন্ট'), Math.round(avgOnline)]);
      if (adsDaily) items.push([t('Ad bills', 'বিজ্ঞাপন বিল'), -adsDaily]);
      if ((daysSince(lp) + i) % 7 === 0) items.push([t('ERP payment (weekly)', 'ERP পেমেন্ট (সাপ্তাহিক)'), -pay]);
      const dom = Number(d.slice(8)); for (const e of fixed) { const pd = f.payDay[e.name] || Number(e.date.slice(8)); if (dom === pd) items.push([esc(e.name), -e.amount]); }
      if (i === 1 && refundsDue.length) items.push([t('Refunds due', 'রিফান্ড বাকি'), -A.sum(refundsDue, (x) => x.amount)]);
      const inn = A.sum(items.filter((x) => x[1] > 0), (x) => x[1]); const ou = -A.sum(items.filter((x) => x[1] < 0), (x) => x[1]);
      bal += inn - ou; const row = { d, inn, ou, bal, items }; out.push(row); if (!tight || bal < tight.bal) tight = row;
    }
    return { start, rows: out, tight };
  }

  /* ================= OVERVIEW ================= */
  function courierMoneyCard(codTot, n, topC) {
    const cl = claimsL(); const open = cl.filter(claimIsOpen); const openAmt = A.sum(open, (c) => c.amount - (c.recovered || 0)); const rec = A.sum(cl, (c) => c.recovered || 0);
    const pays = payoutsL(); const cid = (A.D.couriers.find((c) => c.connected) || A.D.couriers[0] || {}).id || 'pathao';
    return `<div style="margin-bottom:16px">${U.card(t('Courier money', 'কুরিয়ারের টাকা'), `<div class="grid g3" style="gap:12px">
      <div>${U.kpi({ label: t('COD with couriers', 'কুরিয়ারের কাছে COD'), value: tk(codTot), sub: t(`${n} delivered parcels, not paid yet`, `${n}টি ডেলিভারি হওয়া পার্সেলের টাকা আসেনি`) })}</div>
      <div>${U.kpi({ label: t('Courier claims to receive', 'কুরিয়ারের কাছে ক্লেইমের পাওনা'), value: `<span class="${openAmt ? 'fn-out' : ''}">${tk(openAmt)}</span>`, sub: t(`${open.length} open claim(s) · ${tk(rec)} recovered`, `${open.length}টি খোলা ক্লেইম · ${tk(rec)} আদায় হয়েছে`) })}</div>
      <div><div class="small muted" style="font-weight:600;margin-bottom:6px">${t('Payouts', 'পেআউট')}</div>${pays.length ? `<div class="fn-chips">${pays.slice(0, 6).map(payChip).join('')}</div>` : `<div class="small muted">${t('No payout is expected right now.', 'এখন কোনো পেআউট আসার নেই।')}</div>`}</div>
    </div>
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap"><a class="btn sm primary" href="${c360(topC ? topC.c : cid)}">${t('Open Courier 360', 'কুরিয়ার 360 খুলুন')}</a><a class="btn sm" href="${A.href('finance', 'couriers')}">${t('Courier account', 'কুরিয়ারের হিসাব')}</a><a class="btn sm ghost" href="${A.href('finance', 'cash', 'match')}">${t('Match courier statement', 'কুরিয়ারের স্টেটমেন্ট মেলান')}</a></div>`, { sub: t('One claims list for the whole shop: raise it here or in Orders, it shows everywhere.', 'পুরো শপের একটাই ক্লেইম তালিকা: এখানে বা অর্ডারে করলে সব জায়গায় দেখা যায়।') })}</div>`;
  }
  function overview(el) {
    const f = store(); const g = targets(); const { bal } = moves(); const inHand = A.sum(Object.values(bal));
    const cod = C.codWithCouriers(); const codTot = A.sum(cod, payout); const oldest = cod.length ? Math.max(...cod.map((o) => daysSince(o.deliveredAt))) : 0;
    const byC = A.groupBy(cod, (o) => o.courier || 'pathao'); const topC = Object.keys(byC).map((c) => ({ c, a: A.sum(byC[c], payout), d: Math.max(...byC[c].map((o) => daysSince(o.deliveredAt))), n: byC[c].length })).sort((a, b) => b.a - a.a)[0];
    const b = C.erpBalance(); const h = hold(); const wl = A.sum(A.D.customers, (c) => c.wallet || 0);
    const mv = monthView(); const p = mv.p; const adsPct = p.revenue ? p.ads / p.revenue * 100 : 0;
    const fc = forecast(14); const em = erpMismatch().filter((x) => x.st === 'open'); const mis = misList().filter((x) => x.st === 'open');
    const refW = f.refunds.filter((x) => x.status === 'waiting');
    const holdBar = `<div class="fn-hold">${Array.from({ length: 30 }, (_, i) => `<i class="${i < h.since ? (i >= 15 ? (i >= 25 ? 'x' : 'w') : 'u') : ''}"></i>`).join('')}</div>`;

    // decide today
    const dec = [];
    if (topC && topC.a > 0) dec.push({ tone: topC.d >= 3 ? 'var(--warn)' : 'var(--c2)', h: t(`${cname(topC.c)} holds ${lakh(topC.a)}`, `${cname(topC.c)} এর কাছে ${lakh(topC.a)}`), p: t(`${topC.n} delivered parcels, oldest ${topC.d} day(s). They usually pay in 3 days.`, `${topC.n}টি ডেলিভারি হওয়া পার্সেল, সবচেয়ে পুরনো ${topC.d} দিন। সাধারণত 3 দিনে পেমেন্ট দেয়।`), btn: `<a class="btn sm" href="${c360(topC.c)}">${t('Open Courier 360', 'কুরিয়ার 360 খুলুন')}</a>` });
    const safePay = Math.max(0, Math.round((b.owed - 7 * (b.bills / 60)) / 10000) * 10000);
    dec.push({ tone: h.tone === 'good' ? 'var(--c1)' : h.tone === 'warn' ? 'var(--warn)' : 'var(--bad)', h: h.tone === 'good' ? t(`Pay the ERP ${lakh(safePay || avgPay())} to stay safe`, `নিরাপদ থাকতে ERP কে ${lakh(safePay || avgPay())} দিন`) : t(`ERP orders stop in ${Math.max(0, h.left)} days`, `${Math.max(0, h.left)} দিন পর ERP অর্ডার বন্ধ`), p: t(`Owed ${tk(b.owed)}. Last payment ${h.since} days ago; orders stop after 30 days without a payment.`, `বাকি ${tk(b.owed)}। শেষ পেমেন্ট ${h.since} দিন আগে; 30 দিন পেমেন্ট না হলে অর্ডার বন্ধ।`), btn: `<button class="btn sm primary" data-payerp="${safePay || avgPay()}">${t('Pay', 'পেমেন্ট করুন')}</button>` });
    dec.push({ tone: adsPct > g.adsPct ? 'var(--bad)' : 'var(--good)', h: t(`Ads are ${pct(adsPct)} of sales`, `বিজ্ঞাপন বিক্রির ${pct(adsPct)}`), p: adsPct > g.adsPct ? t(`Above your ${g.adsPct}% target: ${tk(p.ads - p.revenue * g.adsPct / 100)} more than planned this month.`, `আপনার ${g.adsPct}% টার্গেটের বেশি: এই মাসে প্ল্যানের চেয়ে ${tk(p.ads - p.revenue * g.adsPct / 100)} বেশি।`) : t(`Inside your ${g.adsPct}% target. Room to spend ${tk(p.revenue * g.adsPct / 100 - p.ads)} more.`, `${g.adsPct}% টার্গেটের ভেতরে। আরও ${tk(p.revenue * g.adsPct / 100 - p.ads)} খরচ করা যায়।`), btn: `<a class="btn sm" href="${A.href('marketing', 'overview')}">${t('Open Marketing', 'মার্কেটিং খুলুন')}</a>` });
    if (refW.length) { const soon = Math.min(...refW.map((x) => 72 - (NOW() - new Date(x.requestedAt)) / 36e5)); dec.push({ tone: soon < 24 ? 'var(--bad)' : 'var(--warn)', h: t(`${refW.length} refunds wait for your OK`, `${refW.length}টি রিফান্ড আপনার OK এর অপেক্ষায়`), p: t(`${tk(A.sum(refW, (x) => x.amount))} in total. The first one must be paid within ${Math.max(0, Math.floor(soon))} hours.`, `মোট ${tk(A.sum(refW, (x) => x.amount))}। প্রথমটা ${Math.max(0, Math.floor(soon))} ঘণ্টার মধ্যে দিতে হবে।`), btn: `<a class="btn sm" href="${A.href('finance', 'wallet')}">${t('See refunds', 'রিফান্ড দেখুন')}</a>` }); }
    if (mis.length) dec.push({ tone: 'var(--warn)', h: t(`${mis.length} courier lines do not match`, `কুরিয়ারের ${mis.length}টি লাইন মিলছে না`), p: t(`${tk(A.sum(mis, (x) => x.diff))} less than our books. Claim it before the next statement.`, `আমাদের হিসাবের চেয়ে ${tk(A.sum(mis, (x) => x.diff))} কম। পরের স্টেটমেন্টের আগে ক্লেইম করুন।`), btn: `<a class="btn sm" href="${A.href('finance', 'cash')}#fn-match">${t('Check', 'দেখুন')}</a>` });
    if (fc.tight && fc.tight.bal < 150000) dec.push({ tone: 'var(--warn)', h: t(`Cash is tightest on ${dshort(fc.tight.d)}`, `${dshort(fc.tight.d)} তারিখে টাকা সবচেয়ে কম`), p: t(`About ${tk(fc.tight.bal)} left that day. Keep big payments after it.`, `সেদিন প্রায় ${tk(fc.tight.bal)} থাকবে। বড় পেমেন্ট এর পরে রাখুন।`), btn: '' });

    const fcRows = fc.rows; const tight = fc.tight;
    const nextBig = A.D.expenses.filter((e) => e.fixed && e.date.startsWith('2026-11'));
    const bigSum = A.sum(nextBig, (e) => e.amount);
    const salesPctT = Math.min(100, mv.fcSales / g.sales * 100);

    el.innerHTML = A.pageHead(t('Finance', 'হিসাব'), t(`Where your money is, as of ${A.fmt.dt(A.TODAY)}`, `${A.fmt.dt(A.TODAY)} পর্যন্ত আপনার টাকা কোথায়`), `<button class="btn" id="fn-tg">${A.icon('edit', 16)} ${t('Targets', 'টার্গেট')}</button><button class="btn" id="fn-bank">${A.icon('box', 16)} ${t('Bank / loan pack', 'ব্যাংক / লোন প্যাক')}</button>` + expBtn('fn-dl')) + A.tabsBar('finance', 'overview') +
      `<div style="margin-bottom:16px">${snapshotCard()}</div>
      <h3 style="margin:4px 0 10px;font-size:15px">${t('Where the money is now', 'টাকা এখন কোথায়')}</h3>
      <div class="fn-tiles" style="margin-bottom:16px">
        ${tile({ icon: 'finance', label: t('In hand', 'হাতে আছে'), value: tk(inHand), sub: t('Cash, bank, bKash and Nagad together', 'ক্যাশ, ব্যাংক, বিকাশ ও নগদ মিলিয়ে'), href: A.href('finance', 'cash'), extra: `<div class="fn-mini">${ACC.map((a) => `<span>${t(a[1].split(' ')[0], a[2].split(' ')[0])} <b>${tk(bal[a[0]])}</b></span>`).join('')}</div>` })}
        ${tile({ icon: 'truck', label: t('With couriers', 'কুরিয়ারের কাছে'), value: tk(codTot), sub: t(`${cod.length} delivered parcels not paid yet · oldest ${oldest} day(s)`, `${cod.length}টি ডেলিভারি হওয়া পার্সেলের টাকা আসেনি · সবচেয়ে পুরনো ${oldest} দিন`), tone: oldest > 4 ? 'warn' : '', href: A.href('finance', 'cash'), extra: `<div class="fn-mini">${Object.keys(byC).map((c) => `<span>${cname(c)} <b>${tk(A.sum(byC[c], payout))}</b></span>`).join('')}</div>` })}
        ${tile({ icon: 'sync', label: t('Owed to ERP', 'ERP পাবে'), value: tk(b.owed), sub: h.tone === 'good' ? t(`Paid ${h.since} days ago · orders stop in ${h.left} days without a payment`, `${h.since} দিন আগে পেমেন্ট · পেমেন্ট না হলে ${h.left} দিন পর অর্ডার বন্ধ`) : t(`No payment for ${h.since} days · orders stop in ${Math.max(0, h.left)} days`, `${h.since} দিন পেমেন্ট নেই · ${Math.max(0, h.left)} দিন পর অর্ডার বন্ধ`), tone: h.tone === 'good' ? '' : h.tone, href: A.href('finance', 'erp'), extra: holdBar })}
        ${tile({ icon: 'customers', label: t('Customer wallets', 'কাস্টমার ওয়ালেট'), value: tk(wl), sub: t(`Money we owe ${A.D.customers.filter((c) => c.wallet > 0).length} customers (they spend it on next orders)`, `${A.D.customers.filter((c) => c.wallet > 0).length} জন কাস্টমার পাবেন (পরের অর্ডারে খরচ করবেন)`), href: A.href('finance', 'wallet') })}
      </div>
      ${courierMoneyCard(codTot, cod.length, topC)}
      <div class="grid g2" style="margin-bottom:16px;align-items:start">
        ${U.card(t('This month so far', 'এই মাসে এখন পর্যন্ত'), `${waterfall(p)}
          <div class="grid g3" style="margin-top:14px;gap:10px">
            <div>${U.kpi({ label: t('Month-end sales (at this pace)', 'মাস শেষে বিক্রি (এই গতিতে)'), value: lakh(Math.round(mv.fcSales)), sub: t(`target ${lakh(g.sales)}`, `টার্গেট ${lakh(g.sales)}`) })}${U.bar(salesPctT, salesPctT >= 100 ? 'var(--good)' : 'var(--warn)')}</div>
            <div>${U.kpi({ label: t('Month-end net profit', 'মাস শেষে নিট লাভ'), value: `<span class="${mv.fcNet < 0 ? 'fn-out' : ''}">${lakh(Math.round(mv.fcNet))}</span>`, sub: t(`target ${lakh(g.profit)}`, `টার্গেট ${lakh(g.profit)}`) })}${U.bar(Math.max(0, mv.fcNet / g.profit * 100), mv.fcNet >= g.profit ? 'var(--good)' : 'var(--warn)')}</div>
            <div>${U.kpi({ label: t('Fixed costs covered', 'মাসিক খরচ উঠে গেছে'), value: mv.beDay ? dshort(mv.beDay) : mv.beFc ? `<span style="color:var(--warn)">${dshort(mv.beFc)}</span>` : '—', sub: mv.beDay ? t(`${tk(mv.fixedMonth)} covered ✓`, `${tk(mv.fixedMonth)} উঠে গেছে ✓`) : t(`expected · ${tk(mv.fixedMonth - mv.contrib)} to go`, `আশা করা হচ্ছে · আরও ${tk(mv.fixedMonth - mv.contrib)} বাকি`) })}</div>
          </div>
          <div class="muted small" style="margin-top:10px">${t(`1–${A.TODAY.getDate()} Nov · sales counted on delivery date · same numbers as Home and Reports.`, `1–${A.TODAY.getDate()} নভেম্বর · ডেলিভারির দিনে বিক্রি ধরা হয় · Home ও রিপোর্টের সাথে একই হিসাব।`)}</div>`, { more: t('Profit & loss', 'লাভ-ক্ষতি'), moreHref: A.href('finance', 'pnl') })}
        ${U.card(t('Next 14 days of cash', 'আগামী 14 দিনের টাকা'), `${A.chart.line({ labels: fcRows.map((x) => dshort(x.d)), series: [{ name: t('Money in hand', 'হাতে টাকা'), color: 'var(--c1)', values: fcRows.map((x) => Math.round(x.bal)), text: fcRows.map((x) => tk(Math.round(x.bal))) }], height: 170 })}
          ${U.callout(t(`Tightest day: <b>${dshort(tight.d)}</b>, about <b>${tk(Math.round(tight.bal))}</b> in hand.`, `সবচেয়ে টাইট দিন: <b>${dshort(tight.d)}</b>, হাতে থাকবে প্রায় <b>${tk(Math.round(tight.bal))}</b>।`), tight.bal < 150000 ? 'warn' : 'good', tight.bal < 150000 ? 'warn' : 'check')}
          <div class="row between small" style="margin-top:8px;flex-wrap:wrap;gap:6px"><span class="fn-in">+ ${tk(Math.round(A.sum(fcRows, (x) => x.inn)))} ${t('in', 'আসবে')}</span><span class="fn-out">− ${tk(Math.round(A.sum(fcRows, (x) => x.ou)))} ${t('out', 'যাবে')}</span><button class="btn sm ghost" id="fn-fc">${t('Day by day', 'দিন অনুযায়ী')}</button></div>
          <div class="muted small" style="margin-top:6px">${t(`Next big bills: salaries, rent and others ${tk(bigSum)} on 5 Dec.`, `পরের বড় বিল: বেতন, ভাড়া ও অন্যান্য ${tk(bigSum)}, 5 ডিসেম্বর।`)}</div>`)}
      </div>
      ${U.card(t('Decide today', 'আজকের সিদ্ধান্ত'), `<div class="fn-dec">${dec.map((d) => `<div class="fn-dc"><div class="h"><i style="background:${d.tone}"></i>${d.h}</div><p>${d.p}</p>${d.btn}</div>`).join('')}</div>`, { sub: t('Each card has one action. Done cards disappear.', 'প্রতিটা কার্ডে একটা কাজ। কাজ হলে কার্ড চলে যায়।') })}
      <div style="margin-top:16px">${U.card(t('Books match with the ERP', 'ERP এর সাথে হিসাব মিলছে কি না'), em.length ? `${U.callout(t(`<b>Not matching.</b> Our books: ${tk(b.owed)} · ERP says: ${tk(erpSays())} · ${em.length} line(s) to fix.`, `<b>মিলছে না।</b> আমাদের হিসাব: ${tk(b.owed)} · ERP বলছে: ${tk(erpSays())} · ${em.length}টি লাইন ঠিক করতে হবে।`), 'bad', 'warn')}<a class="btn sm" style="margin-top:8px" href="${A.href('finance', 'erp')}">${t('Fix the mismatch', 'অমিল ঠিক করুন')}</a>` : U.callout(t(`<b>Matching.</b> Both say ${tk(b.owed)}. Daily summary sent every night.`, `<b>মিলছে।</b> দুই দিকেই ${tk(b.owed)}। প্রতি রাতে দৈনিক সারাংশ যাচ্ছে।`), 'good', 'check'))}</div>`;

    el.querySelector('#fn-tg').onclick = editTargets;
    el.querySelector('#fn-dl').onclick = () => exportDoc(t('Finance summary, November 2026', 'হিসাবের সারাংশ, নভেম্বর 2026'), [[t('In hand', 'হাতে আছে'), tk(inHand)], [t('With couriers', 'কুরিয়ারের কাছে'), tk(codTot)], [t('Owed to ERP', 'ERP পাবে'), tk(b.owed)], [t('Customer wallets', 'কাস্টমার ওয়ালেট'), tk(wl)]].concat(plRows(p)));
    el.querySelector('#fn-bank').onclick = () => A.go('reports', 'overview');
    el.querySelectorAll('[data-payerp]').forEach((x) => (x.onclick = () => payErp(Number(x.dataset.payerp))));
    el.querySelector('#fn-fc').onclick = () => U.drawer(t('Cash forecast, day by day', 'টাকার পূর্বাভাস, দিন অনুযায়ী'), `<div class="small muted" style="margin-bottom:8px">${t(`Start: ${tk(Math.round(fc.start))} in hand. Courier payouts from parcels already delivered, then the daily average of the last 14 days.`, `শুরু: হাতে ${tk(Math.round(fc.start))}। ডেলিভারি হওয়া পার্সেলের কুরিয়ার পেমেন্ট, তারপর গত 14 দিনের দৈনিক গড়।`)}</div>` + U.table([
      { h: t('Day', 'দিন'), f: (x) => `${dshort(x.d)}${x === tight ? ' ' + U.badge(t('Tightest', 'সবচেয়ে কম'), 'warn') : ''}` },
      { h: t('In', 'আসবে'), r: true, f: (x) => `<span class="fn-in">${tk(Math.round(x.inn))}</span>` },
      { h: t('Out', 'যাবে'), r: true, f: (x) => `<span class="fn-out">${tk(Math.round(x.ou))}</span><div class="small muted">${x.items.filter((i) => i[1] < 0 && !/Ad|বিজ্ঞাপন/.test(i[0])).map((i) => i[0]).join(', ')}</div>` },
      { h: t('In hand', 'হাতে'), r: true, f: (x) => `<b>${tk(Math.round(x.bal))}</b>` },
    ], fcRows));
  }

  /* ================= MONEY IN & OUT ================= */
  let cbAcc = '', cbKind = '', cbQ = '', cbMore = 60;
  function cash(el) {
    const f = store(); const { list, bal } = moves(); const K = KIND(); const mis = misList();
    const rows = list.filter((m) => (!cbAcc || m.acc === cbAcc) && (!cbKind || m.kind === cbKind) && (!cbQ || (m.what + ' ' + m.date).toLowerCase().includes(cbQ.toLowerCase()))).reverse();
    const r = C.range('month'); const mList = list.filter((m) => m.date >= YMD(r.from));
    const inM = A.sum(mList.filter((m) => m.amt > 0 && m.kind !== 'transfer'), (m) => m.amt), outM = -A.sum(mList.filter((m) => m.amt < 0 && m.kind !== 'transfer'), (m) => m.amt);
    const stm = Object.entries(A.groupBy(list.filter((m) => m.kind === 'courier' && daysSince(m.date) <= 14), (m) => m.ref)).map(([c, ms]) => ({ c, n: ms.length, amt: A.sum(ms, (m) => m.amt), last: ms[ms.length - 1].date, bad: mis.filter((x) => (x.o.courier || 'pathao') === c && x.st === 'open').length }));
    el.innerHTML = A.pageHead(t('Money in & out', 'টাকার আসা-যাওয়া'), t('Every taka that came in or went out, by account.', 'প্রতিটা টাকা কোথা থেকে এল, কোথায় গেল, অ্যাকাউন্ট অনুযায়ী।'), expBtn('cb-dl') + `<button class="btn primary" id="cb-rec">${A.icon('plus', 16)} ${t('Record money', 'টাকা রেকর্ড')}</button>`) + A.tabsBar('finance', 'cash') +
      `<div class="fn-acc" style="margin-bottom:12px">${[['', t('All accounts', 'সব অ্যাকাউন্ট'), A.sum(Object.values(bal))]].concat(ACC.map((a) => [a[0], t(a[1], a[2]), bal[a[0]]])).map((a) => `<button data-acc="${a[0]}" class="${cbAcc === a[0] ? 'on' : ''}"><span class="n">${a[1]}</span><span class="b">${tk(a[2])}</span></button>`).join('')}</div>
      <div class="grid g2" style="margin-bottom:14px;align-items:start">
        ${U.card('', `<div class="grid g2" style="gap:10px">${U.kpi({ label: t('Came in this month', 'এই মাসে এসেছে'), value: `<span class="fn-in">${tk(inM)}</span>` })}${U.kpi({ label: t('Went out this month', 'এই মাসে গেছে'), value: `<span class="fn-out">${tk(outM)}</span>` })}</div><div class="muted small" style="margin-top:6px">${t('Transfers between your own accounts are not counted.', 'নিজের অ্যাকাউন্টের মধ্যে ট্রান্সফার ধরা হয়নি।')}</div>`)}
        ${reconCard()}
      </div>
      ${mis.some((x) => x.st === 'open' || x.st === 'claim') ? U.card(t('Not matching', 'মিলছে না'), U.table([
        { h: t('Order', 'অর্ডার'), f: (x) => `<a href="${A.href('orders', 'all', x.o.id)}">${x.o.id}</a><div class="small muted">${cname(x.o.courier)}</div>` },
        { h: t('What is wrong', 'সমস্যা'), f: (x) => `<span class="small">${x.text}</span>` },
        { h: t('Short by', 'কম'), r: true, f: (x) => `<b class="fn-out">${tk(x.diff)}</b>` },
        { h: '', r: true, f: (x) => (x.st === 'claim' ? U.badge(t('Claim raised', 'ক্লেইম করা হয়েছে'), 'info') : `<button class="btn sm primary" data-claim="${x.o.id}">${t('Claim', 'ক্লেইম')}</button> <button class="btn sm ghost" data-accept="${x.o.id}">${t('Accept', 'মেনে নিন')}</button>`) },
      ], mis.filter((x) => x.st === 'open' || x.st === 'claim')), { cls: 'fn-mis' }) + '<div style="height:14px"></div>' : ''}
      ${U.card(t('All movements', 'সব লেনদেন'), `<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px"><input class="inp" id="cb-q" placeholder="${t('Search movements…', 'লেনদেন খুঁজুন…')}" value="${esc(cbQ)}" style="max-width:260px"><div class="chips">${[['', t('All', 'সব')]].concat(Object.entries(K)).map((k) => `<button class="chip ${cbKind === k[0] ? 'on' : ''}" data-kind="${k[0]}">${k[1]}</button>`).join('')}</div></div>` +
        U.table([
          { h: t('Date', 'তারিখ'), f: (m) => `<span class="small">${dshort(m.date)}</span>` },
          { h: t('What', 'কী'), f: (m) => `${m.what}<div class="small muted">${K[m.kind] || ''}</div>` },
          { h: t('Account', 'অ্যাকাউন্ট'), hide: true, f: (m) => accName(m.acc) },
          { h: t('In', 'এসেছে'), r: true, f: (m) => (m.amt > 0 ? `<span class="fn-in">${tk(m.amt)}</span>` : '') },
          { h: t('Out', 'গেছে'), r: true, f: (m) => (m.amt < 0 ? `<span class="fn-out">${tk(-m.amt)}</span>` : '') },
          { h: t('Balance', 'ব্যালেন্স'), r: true, hide: true, f: (m) => `<span class="muted">${tk(m.bal)}</span>` },
        ], rows.slice(0, cbMore)) + (rows.length > cbMore ? `<button class="btn sm ghost" id="cb-more" style="margin-top:8px">${t(`Show more (${rows.length - cbMore})`, `আরও দেখুন (${rows.length - cbMore})`)}</button>` : ''), { sub: t('Balance = that account after the movement. Newest first.', 'ব্যালেন্স = লেনদেনের পরে ওই অ্যাকাউন্টে কত। নতুনগুলো আগে।') })}`;
    el.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = () => { cbAcc = b.dataset.acc; A.render(); }));
    el.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => { cbKind = b.dataset.kind; A.render(); }));
    const q = el.querySelector('#cb-q'); q.onchange = () => { cbQ = q.value; A.render(); };
    const more = el.querySelector('#cb-more'); if (more) more.onclick = () => { cbMore += 100; A.render(); };
    el.querySelector('#cb-dl').onclick = () => exportDoc(t('Cashbook', 'ক্যাশবুক') + (cbAcc ? ' · ' + accName(cbAcc) : ''), ACC.map((a) => [accName(a[0]), tk(bal[a[0]])]).concat([[t('Came in this month', 'এই মাসে এসেছে'), tk(inM), 'sum'], [t('Went out this month', 'এই মাসে গেছে'), tk(outM), 'sum']], rows.slice(0, 8).map((m) => [dshort(m.date) + ' · ' + m.what, (m.amt > 0 ? '+' : '−') + tk(Math.abs(m.amt))])), t(`${rows.length} movements in the file.`, `ফাইলে ${rows.length}টি লেনদেন।`));
    el.querySelectorAll('[data-claim]').forEach((b) => (b.onclick = () => { const x = mis.find((y) => y.o.id === b.dataset.claim); raiseClaim(x.o, x.ctype, x.diff, x.kind === 'fee' ? 'Delivery overcharged' : 'COD not in statement'); done('Courier claim ' + x.o.id, t('Claim raised. It is in the one claims list (Orders › With courier) and comes off their next payout.', 'ক্লেইম করা হয়েছে। এটা একটাই ক্লেইম তালিকায় (অর্ডার › কুরিয়ারের কাছে) আছে, পরের পেমেন্ট থেকে কাটা যাবে।')); }));
    el.querySelectorAll('[data-accept]').forEach((b) => (b.onclick = () => U.confirm(t('Accept the courier figure?', 'কুরিয়ারের হিসাব মেনে নেবেন?'), t('The difference is booked as a courier cost.', 'পার্থক্যটা কুরিয়ার খরচ হিসেবে ধরা হবে।'), t('Accept', 'মেনে নিন'), () => { f.match[b.dataset.accept] = 'accepted'; done('Courier figure accepted ' + b.dataset.accept, t('Accepted and booked.', 'মেনে নেওয়া হয়েছে।')); })));
    el.querySelector('#cb-rec').onclick = recordMoney;
  }
  function recordMoney() {
    const f = store(); const me = (A.D.staff || [])[0] || { name: 'Owner', role: 'Owner' };
    const m = U.modal(t('Record money', 'টাকা রেকর্ড'), `<div class="stack">${U.callout(t(`Only the Owner and Accounts can record money. You are signed in as <b>${esc(me.name)} (${esc(me.role)})</b>.`, `শুধু মালিক ও অ্যাকাউন্টস টাকা রেকর্ড করতে পারেন। আপনি <b>${esc(me.name)} (${esc(me.role)})</b> হিসেবে আছেন।`), 'info', 'info')}
      <div class="formgrid">${U.field(t('Type', 'ধরন'), U.select('rm-k', [['capital', t('Owner put in money', 'মালিক টাকা দিলেন')], ['owner', t('Owner took money', 'মালিক টাকা নিলেন')], ['other-in', t('Other money in', 'অন্যান্য টাকা এল')], ['other-out', t('Other money out', 'অন্যান্য টাকা গেল')], ['transfer', t('Move between accounts', 'অ্যাকাউন্ট থেকে অ্যাকাউন্টে')]], 'capital'))}
      ${U.field(t('Account', 'অ্যাকাউন্ট'), U.select('rm-a', ACC.map((a) => [a[0], t(a[1], a[2])]), 'bank'))}
      ${U.field(t('To account (for a move)', 'কোন অ্যাকাউন্টে (ট্রান্সফারে)'), U.select('rm-to', ACC.map((a) => [a[0], t(a[1], a[2])]), 'cash'))}
      ${U.field(t('Amount', 'পরিমাণ'), U.money('rm-amt', ''))}${U.field(t('Date', 'তারিখ'), U.input('rm-d', TODAY(), 'type="date"'))}${U.field(t('Note', 'নোট'), U.input('rm-n', '', `placeholder="${t('e.g. Eid stock money', 'যেমন ঈদের স্টকের টাকা')}"`))}</div></div>`,
    { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="rm-ok">${t('Continue', 'এগিয়ে যান')}</button>` });
    m.querySelector('#rm-ok').onclick = () => {
      const k = val(m, 'rm-k'), acc = val(m, 'rm-a'), to = val(m, 'rm-to'), amt = num(m, 'rm-amt'), d = val(m, 'rm-d') || TODAY(), note = val(m, 'rm-n');
      if (!(amt > 0)) return A.toast(t('Enter the amount', 'পরিমাণ লিখুন'), 'bad');
      if (k === 'transfer' && acc === to) return A.toast(t('Pick two different accounts', 'দুটো আলাদা অ্যাকাউন্ট বেছে নিন'), 'bad');
      pinAsk(t('Record this?', 'রেকর্ড করবেন?'), `<p><b>${tk(amt)}</b> · ${accName(acc)}${k === 'transfer' ? ' → ' + accName(to) : ''} · ${dshort(d)}</p>`, t('Record', 'রেকর্ড করুন'), () => {
        const by = (A.D.staff || [])[0] ? A.D.staff[0].name : 'Owner';
        if (k === 'transfer') { f.moves.push({ id: A.uid('MV'), date: d, acc, amt: -amt, kind: 'transfer', what: 'Moved to ' + accName(to) + (note ? ' · ' + note : ''), by }); f.moves.push({ id: A.uid('MV'), date: d, acc: to, amt, kind: 'transfer', what: 'Moved from ' + accName(acc) + (note ? ' · ' + note : ''), by }); }
        else { const sign = k === 'owner' || k === 'other-out' ? -1 : 1; f.moves.push({ id: A.uid('MV'), date: d, acc, amt: sign * amt, kind: k.startsWith('other') ? 'other' : k, what: note || (k === 'capital' ? 'Owner put in money' : k === 'owner' ? 'Owner took money' : 'Other'), by }); }
        done('Money recorded ' + tk(amt), t(`${tk(amt)} recorded. Balances updated.`, `${tk(amt)} রেকর্ড হয়েছে। ব্যালেন্স আপডেট হয়েছে।`));
      });
    };
  }

  /* ================= PROFIT & LOSS ================= */
  let plKey = 'month', plCmp = 'same', drill = []; const PLK = ['today', '7d', 'month', 'lastmonth', '30d'];
  const baseName = (n) => n.replace(/ (II|Plus|Lite|Pro|Classic)$/, '');
  function pnlPage(el, rt) {
    if (rt && rt.id && PLK.includes(rt.id) && plKey !== rt.id) { plKey = rt.id; drill = []; }
    const f = store(); const r = rng(plKey);
    const cmp = plKey === 'month' && plCmp === 'full' ? C.range('lastmonth') : null;
    const cur = C.pnl(r.from, r.to); const prev = cmp ? C.pnl(cmp.from, cmp.to) : C.pnl(r.prevFrom, r.prevTo);
    const vrate = Number((A.D.vat && A.D.vat.rate) || 0);
    const L = [
      [t('Product sales', 'প্রোডাক্ট বিক্রি'), 'productSales', 1, 'ind'], [t('Discounts', 'ডিসকাউন্ট'), 'discounts', -1, 'ind'], [t('Delivery charges collected', 'ডেলিভারি চার্জ আদায়'), 'deliveryIncome', 1, 'ind'],
      [t('Sales', 'বিক্রি'), 'revenue', 1, 'sum'],
      [t('Product cost (ERP price)', 'প্রোডাক্টের খরচ (ERP দাম)'), 'cogs', -1, 'ind'], [t('Courier charges', 'কুরিয়ার চার্জ'), 'courier', -1, 'ind'], [t('COD fee', 'COD ফি'), 'cod', -1, 'ind'], [t('Packaging', 'প্যাকেজিং'), 'packaging', -1, 'ind'], [t('Payment gateway', 'পেমেন্ট গেটওয়ে'), 'gateway', -1, 'ind'], [t('Returns (courier both ways)', 'রিটার্ন (কুরিয়ার আসা-যাওয়া)'), 'returns', -1, 'ind'],
      [t('Gross profit', 'গ্রস লাভ'), 'gross', 1, 'sum'],
      [t('Ads', 'বিজ্ঞাপন'), 'ads', -1, 'ind'], [t('Fixed costs (rent, salaries…)', 'মাসিক খরচ (ভাড়া, বেতন…)'), 'fixed', -1, 'ind'], [t('Other expenses', 'অন্যান্য খরচ'), 'other', -1, 'ind'],
      [t('Net profit', 'নিট লাভ'), 'net', 1, 'big'],
    ];
    const cell = (v, s) => (s < 0 && v ? '−' + tk(v) : tk(v));
    const chg = (k, s) => { const a = cur[k], b = prev[k]; if (!b) return '<span class="muted">—</span>'; return A.delta(a, b, s < 0); };
    const mo = r.from >= new Date('2026-11-01T00:00:00+06:00').getTime() ? '2026-11' : '2026-10';
    // unit economics (this period, per delivered order)
    const n = cur.delivered || 1; const per = (x) => Math.round(x / n);
    const ue = [[t('Average sale', 'গড় বিক্রি'), per(cur.revenue)], [t('Product cost', 'প্রোডাক্টের খরচ'), -per(cur.cogs)], [t('Courier', 'কুরিয়ার'), -per(cur.courier)], [t('COD fee', 'COD ফি'), -per(cur.cod)], [t('Packaging & gateway', 'প্যাকেজিং ও গেটওয়ে'), -per(cur.packaging + cur.gateway)], [t('Returns (share)', 'রিটার্ন (ভাগ)'), -per(cur.returns)], [t('Ads (share)', 'বিজ্ঞাপন (ভাগ)'), -per(cur.ads)], [t('Fixed & other (share)', 'মাসিক ও অন্যান্য (ভাগ)'), -per(cur.fixed + cur.other)]];
    const ueNet = A.sum(ue, (x) => x[1]);
    el.innerHTML = A.pageHead(t('Profit & loss', 'লাভ-ক্ষতি'), t('Line by line. A sale counts on the day it is delivered.', 'লাইন ধরে ধরে। ডেলিভারির দিনে বিক্রি ধরা হয়।'), `<div style="min-width:0;max-width:calc(100vw - 40px);overflow-x:auto">${U.seg('pl-k', [['today', t('Today', 'আজ')], ['7d', t('Last 7 days', 'গত 7 দিন')], ['month', t('This month', 'এই মাস')], ['lastmonth', t('Last month', 'গত মাস')], ['30d', t('30 days', '30 দিন')]], plKey)}</div><button class="btn" id="pl-cs">${A.icon('check', 16)} ${t('Month-end close sheet', 'মাস শেষের ক্লোজ শিট')}</button>` + expBtn('pl-dl')) + A.tabsBar('finance', 'pnl') +
      `<div class="grid g3" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start;margin-bottom:14px">
        ${U.card(t('Statement', 'স্টেটমেন্ট'), `${plKey === 'month' ? `<div style="margin-bottom:10px">${U.seg('pl-c', [['same', t(`vs 1–${A.TODAY.getDate()} Oct`, `বনাম 1–${A.TODAY.getDate()} অক্টো`)], ['full', t('vs all of October', 'বনাম পুরো অক্টোবর')]], plCmp)}</div>` : ''}
          <div class="tbl-wrap"><table class="tbl fn-pl"><thead><tr><th>${t('Line', 'লাইন')}</th><th class="r">${t('This period', 'এই সময়')}</th><th class="r hide-sm">${t('Compared', 'তুলনা')}</th><th class="r">${t('Change', 'পরিবর্তন')}</th></tr></thead><tbody>
          ${L.map((x) => `<tr class="${x[3] === 'ind' ? '' : x[3]}"><td class="lbl ${x[3] === 'ind' ? 'ind' : ''}">${x[0]}</td><td class="r">${x[3] === 'big' && cur.net < 0 ? `<span class="fn-out">${tk(cur.net)}</span>` : cell(cur[x[1]], x[2])}</td><td class="r hide-sm muted">${cell(prev[x[1]], x[2])}</td><td class="r">${chg(x[1], x[2])}</td></tr>`).join('')}
          <tr><td class="lbl">${t('Net margin', 'নিট মার্জিন')}</td><td class="r"><b>${pct(cur.margin)}</b></td><td class="r hide-sm muted">${pct(prev.margin)}</td><td></td></tr>
          ${vatOn() && vrate ? `<tr><td class="lbl ind">${t(`VAT inside sales (${vrate}%)`, `বিক্রির মধ্যে ভ্যাট (${vrate}%)`)}</td><td class="r">${tk(Math.round(cur.revenue * vrate / (100 + vrate)))}</td><td class="r hide-sm muted">${tk(Math.round(prev.revenue * vrate / (100 + vrate)))}</td><td></td></tr>` : ''}
          </tbody></table></div>
          <div class="muted small" style="margin-top:8px">${t(`${cur.delivered} delivered, ${cur.returned} returned. Fixed costs spread per day. Same maths as Home and Reports.`, `${cur.delivered}টি ডেলিভারি, ${cur.returned}টি রিটার্ন। মাসিক খরচ দিনে ভাগ করে ধরা। Home ও রিপোর্টের সাথে একই হিসাব।`)}</div>`)}
        <div class="stack">
          ${U.card(t('One average order', 'একটা গড় অর্ডার'), `<div class="fn-ue">${ue.map((x) => `<div class="r"><span>${x[0]}</span><b class="${x[1] < 0 ? 'fn-out' : ''}">${x[1] < 0 ? '−' + tk(-x[1]) : tk(x[1])}</b></div>`).join('')}<div class="r tot"><span>${t('Profit per order', 'অর্ডার প্রতি লাভ')}</span><b class="${ueNet < 0 ? 'fn-out' : 'fn-in'}">${tk(ueNet)}</b></div></div><div class="muted small" style="margin-top:6px">${t(`Per delivered order (${cur.delivered}).`, `প্রতি ডেলিভারি হওয়া অর্ডারে (${cur.delivered})।`)}</div>`)}
          ${closeCard(f)}
        </div>
      </div>
      ${U.card(t('Where the profit comes from', 'লাভ কোথা থেকে আসছে'), drillHtml(r), { sub: t('Click a row to go deeper: channel → category → style → product. Profit before ads.', 'গভীরে যেতে সারিতে ক্লিক করুন: চ্যানেল → ক্যাটাগরি → স্টাইল → প্রোডাক্ট। বিজ্ঞাপনের আগের লাভ।') })}`;
    el.querySelectorAll('#pl-k button').forEach((b) => (b.onclick = () => { plKey = b.dataset.v; drill = []; A.go('finance', 'pnl', plKey); }));
    el.querySelectorAll('#pl-c button').forEach((b) => (b.onclick = () => { plCmp = b.dataset.v; A.render(); }));
    el.querySelector('#pl-dl').onclick = () => exportDoc(t('Profit & loss statement', 'লাভ-ক্ষতির স্টেটমেন্ট'), plRows(cur), t(`${cur.delivered} delivered · ${cur.returned} returned · margin ${pct(cur.margin)}`, `${cur.delivered}টি ডেলিভারি · ${cur.returned}টি রিটার্ন · মার্জিন ${pct(cur.margin)}`));
    el.querySelector('#pl-cs').onclick = () => closeSheet(f);
    el.querySelectorAll('[data-drill]').forEach((x) => (x.onclick = () => { if (drill.length < 3) { drill.push(x.dataset.drill); A.render(); } else A.go('products', 'all', x.dataset.drill); }));
    el.querySelectorAll('[data-crumb]').forEach((x) => (x.onclick = () => { drill = drill.slice(0, Number(x.dataset.crumb)); A.render(); }));
    wireClose(el, f, mo);
  }
  function drillHtml(r) {
    const del = A.D.orders.filter((o) => C.isDelivered(o) && o.deliveredAt && C.inRange(o.deliveredAt, r.from, r.to));
    const lines = [];
    for (const o of del) {
      const sub = o.subtotal || 1; const extra = o.discount - o.delivery + C.courierFee(o) + C.codFee(o) + A.D.expenseSettings.packaging + C.gatewayFee(o);
      for (const l of o.lines) { const p = A.byId(A.D.products, l.pid) || {}; const share = l.price * l.qty / sub; lines.push({ ch: o.channel, cat: p.cat || '?', style: baseName(p.name || l.name), pid: l.pid, name: p.name || l.name, sales: l.price * l.qty - o.discount * share, cost: l.cost * l.qty, profit: l.price * l.qty - l.cost * l.qty - extra * share, qty: l.qty, o: o.id }); }
    }
    const lvl = drill.length; const keys = ['ch', 'cat', 'style', 'pid'];
    let sel = lines; drill.forEach((d, i) => { sel = sel.filter((x) => String(x[keys[i]]) === d); });
    const grp = A.groupBy(sel, (x) => x[keys[lvl]]);
    const catName = (id) => { const c = A.byId(A.CATS, id); return c ? t(c.en, c.bn) : id; };
    const label = (k, i) => (i === 1 ? catName(k) : i === 3 ? esc((A.byId(A.D.products, k) || {}).name || k) : esc(k));
    const rows = Object.keys(grp).map((k) => { const g = grp[k]; const s = A.sum(g, (x) => x.sales), pr = A.sum(g, (x) => x.profit); return { _id: k, k, s, pr, q: A.sum(g, (x) => x.qty), n: new Set(g.map((x) => x.o)).size, m: s ? pr / s * 100 : 0 }; }).sort((a, b) => b.pr - a.pr);
    const tot = A.sum(rows, (x) => x.pr) || 1; const names = [t('Channel', 'চ্যানেল'), t('Category', 'ক্যাটাগরি'), t('Style', 'স্টাইল'), t('Product', 'প্রোডাক্ট')];
    const crumb = `<div class="fn-crumb"><button data-crumb="0">${t('All channels', 'সব চ্যানেল')}</button>${drill.map((d, i) => ` › ${i === drill.length - 1 ? `<span class="cur">${label(d, i)}</span>` : `<button data-crumb="${i + 1}">${label(d, i)}</button>`}`).join('')}</div>`;
    const best = rows[0], worst = rows.slice().sort((a, b) => a.m - b.m)[0];
    const ins = best && rows.length > 1 ? `<div class="small" style="margin-bottom:8px">${t(`<b>${label(best.k, lvl)}</b> brings ${pct(best.pr / tot * 100)} of this profit. Lowest margin: <b>${label(worst.k, lvl)}</b> at ${pct(worst.m)}.`, `এই লাভের ${pct(best.pr / tot * 100)} আসে <b>${label(best.k, lvl)}</b> থেকে। সবচেয়ে কম মার্জিন: <b>${label(worst.k, lvl)}</b>, ${pct(worst.m)}।`)}</div>` : '';
    return crumb + ins + U.table([
      { h: names[lvl], f: (x) => `<a href="javascript:void 0" data-drill="${esc(x.k)}">${label(x.k, lvl)}</a>${lvl === 3 ? ' <span class="small muted">↗</span>' : ''}` },
      { h: t('Pieces', 'পিস'), r: true, hide: true, f: (x) => A.fmt.num(x.q) },
      { h: t('Sales', 'বিক্রি'), r: true, f: (x) => tk(Math.round(x.s)) },
      { h: t('Profit', 'লাভ'), r: true, f: (x) => `<b class="${x.pr < 0 ? 'fn-out' : ''}">${tk(Math.round(x.pr))}</b>` },
      { h: t('Margin', 'মার্জিন'), r: true, hide: true, f: (x) => pct(x.m) },
      { h: t('Share', 'ভাগ'), hide: true, f: (x) => `<div style="min-width:80px">${U.bar(x.pr / tot * 100)}</div>` },
    ], rows);
  }
  function closeCard(f) {
    const months = [['2026-09', t('September 2026', 'সেপ্টেম্বর 2026')], ['2026-10', t('October 2026', 'অক্টোবর 2026')], ['2026-11', t('November 2026', 'নভেম্বর 2026')]];
    const oct = '2026-10'; const octDone = f.closed[oct];
    const codOpen = C.codWithCouriers().filter((o) => o.deliveredAt.startsWith(oct)).length;
    const misOpen = misList().filter((x) => x.st === 'open').length; const emOpen = erpMismatch().filter((x) => x.st === 'open').length;
    const recMiss = A.D.expenses.filter((e) => !e.fixed && e.date.startsWith(oct) && !f.receipts[e.id]).length;
    const refOpen = f.refunds.filter((x) => x.status === 'waiting' && x.requestedAt.startsWith(oct)).length;
    const chk = [[codOpen === 0, t('All October COD paid by couriers', 'অক্টোবরের সব COD কুরিয়ার দিয়েছে')], [misOpen === 0, t(`Courier statements match${misOpen ? ` (${misOpen} open)` : ''}`, `কুরিয়ার স্টেটমেন্ট মিলেছে${misOpen ? ` (${misOpen}টি বাকি)` : ''}`)], [emOpen === 0, t(`Books match the ERP${emOpen ? ` (${emOpen} open)` : ''}`, `ERP এর সাথে হিসাব মিলেছে${emOpen ? ` (${emOpen}টি বাকি)` : ''}`)], [recMiss === 0, t(`Receipts attached${recMiss ? ` (${recMiss} missing)` : ''}`, `রসিদ যুক্ত${recMiss ? ` (${recMiss}টি নেই)` : ''}`)], [refOpen === 0, t('No refunds waiting', 'কোনো রিফান্ড বাকি নেই')]];
    return U.card(t('Close the month', 'মাস বন্ধ করুন'), `${months.map((m) => `<div class="row between small" style="padding:4px 0"><span>${m[1]}</span>${f.closed[m[0]] ? U.badge(t('Closed · locked', 'বন্ধ · লক'), 'dark') : m[0] === '2026-11' ? U.badge(t('Running', 'চলছে'), 'info') : U.badge(t('Ready to close', 'বন্ধ করা যাবে'), 'warn')}</div>`).join('')}
      ${octDone ? `<div class="small muted" style="margin-top:8px">${t(`October closed ${A.fmt.dt(octDone.at)} by ${esc(octDone.by)}. Summary sent to the ERP ✓. A refund now posts in November.`, `অক্টোবর বন্ধ হয়েছে ${A.fmt.dt(octDone.at)}, ${esc(octDone.by)}। ERP তে সারাংশ গেছে ✓। এখন কোনো রিফান্ড হলে নভেম্বরে যাবে।`)}</div>` : `<div style="margin:8px 0">${chk.map((c) => `<div class="fn-chk"><span class="ic ${c[0] ? 'ok' : 'no'}">${c[0] ? '✓' : '!'}</span><span>${c[1]}</span></div>`).join('')}</div><button class="btn primary sm" id="pl-close">${t('Close October', 'অক্টোবর বন্ধ করুন')}</button>`}`, { sub: t('Locks the month and sends its summary to the ERP.', 'মাসটা লক হয় ও সারাংশ ERP তে যায়।') });
  }

  function closeSheet(f) {
    const lm = C.range('lastmonth'); const p = C.pnl(lm.from, lm.to); const em = erpMismatch().filter((x) => x.st === 'open'); const mis = misList().filter((x) => x.st === 'open');
    const days = erpDays(); const oct = Object.keys(days).filter((d) => d.startsWith('2026-10')); const billsOct = A.sum(oct, (d) => days[d].bills), credOct = A.sum(oct, (d) => days[d].credits), payOct = A.sum(oct, (d) => days[d].payments);
    const unposted = A.D.expenses.filter((e) => !e.fixed && e.date.startsWith('2026-10') && !f.receipts[e.id]);
    const codOpen = C.codWithCouriers().filter((o) => o.deliveredAt.startsWith('2026-10'));
    exportDoc(t('Month-end close sheet · October 2026', 'মাস শেষের ক্লোজ শিট · অক্টোবর 2026'), plRows(p).concat([
      [`<b>${t('Sent to the ERP', 'ERP তে পাঠানো')}</b>`, f.closed['2026-10'] ? '✓' : t('not yet', 'এখনো না'), 'sum'], [t('Bills (pieces shipped)', 'বিল (পাঠানো পিস)'), tk(billsOct)], [t('Credits (approved returns)', 'ক্রেডিট (অ্যাপ্রুভড রিটার্ন)'), tk(credOct)], [t('Payments to ERP', 'ERP কে পেমেন্ট'), tk(payOct)],
      [`<b>${t('Still unposted', 'এখনো পোস্ট হয়নি')}</b>`, '', 'sum'], [t('Expenses without receipt', 'রসিদ ছাড়া খরচ'), unposted.length ? `${unposted.length} · ${tk(A.sum(unposted, (e) => e.amount))}` : '✓'], [t('COD not paid by couriers', 'কুরিয়ার দেয়নি এমন COD'), codOpen.length ? `${codOpen.length} · ${tk(A.sum(codOpen, payout))}` : '✓'],
      [`<b>${t('Differences', 'পার্থক্য')}</b>`, '', 'sum'], [t('Courier statement', 'কুরিয়ার স্টেটমেন্ট'), mis.length ? `<span class="fn-out">⚠ ${mis.length} · ${tk(A.sum(mis, (x) => x.diff))}</span>` : '✓'], [t('ERP books', 'ERP হিসাব'), em.length ? `<span class="fn-out">⚠ ${em.length} · ${tk(A.sum(em, (x) => x.diff))}</span>` : '✓'],
    ]), t('One page. Flagged lines need a decision before closing.', 'এক পেজ। ⚠ চিহ্নিত লাইনে বন্ধ করার আগে সিদ্ধান্ত লাগবে।'));
  }
  function wireClose(el, f) {
    const b = el.querySelector('#pl-close'); if (!b) return;
    b.onclick = () => {
      const p = C.pnl(C.range('lastmonth').from, C.range('lastmonth').to);
      pinAsk(t('Close October 2026?', 'অক্টোবর 2026 বন্ধ করবেন?'), `<p>${t(`Net profit ${tk(p.net)} on sales ${tk(p.revenue)}. After closing nobody can change October; a late refund or cost posts in November.`, `বিক্রি ${tk(p.revenue)}, নিট লাভ ${tk(p.net)}। বন্ধ করার পর অক্টোবরে কেউ কিছু বদলাতে পারবে না; দেরিতে আসা রিফান্ড বা খরচ নভেম্বরে যাবে।`)}</p>`, t('Close & send to ERP', 'বন্ধ করে ERP তে পাঠান'), () => {
        f.closed['2026-10'] = { at: A.TODAY.toISOString(), by: (A.D.staff[0] || {}).name || 'Owner' };
        (A.D.erpEvents = A.D.erpEvents || []).unshift({ t: A.TODAY.toISOString(), kind: 'close', text: 'October 2026 closed · monthly summary sent', ok: true });
        done('October 2026 closed', t('October is closed and locked. Summary sent to the ERP.', 'অক্টোবর বন্ধ ও লক হয়েছে। সারাংশ ERP তে গেছে।'));
      });
    };
  }

  /* ================= COSTS & BUDGETS ================= */
  const BUD = { Ads: 110000, Salaries: 110000, Rent: 30000, Utilities: 12000, Software: 12000, Content: 22000, Packaging: 15000 };
  const catLabel = (c) => ({ Ads: t('Ads', 'বিজ্ঞাপন'), Salaries: t('Salaries', 'বেতন'), Rent: t('Rent', 'ভাড়া'), Utilities: t('Utilities', 'বিদ্যুৎ ও ইন্টারনেট'), Software: t('Software', 'সফটওয়্যার'), Content: t('Photos & content', 'ছবি ও কনটেন্ট'), Packaging: t('Packaging', 'প্যাকেজিং'), Other: t('Other', 'অন্যান্য') }[c] || esc(c));
  function costs(el) {
    const f = store(); f.budgets = f.budgets || { ...BUD }; if (f.budgets.Salaries === 85000) f.budgets.Salaries = BUD.Salaries; if (f.budgets.Utilities === 11000) f.budgets.Utilities = BUD.Utilities;
    const r = C.range('month'); const elapsed = (r.to - r.from) / DAY;
    const fixed = A.D.expenses.filter((e) => e.fixed && e.date.startsWith('2026-11'));
    const upcoming = A.D.expenses.filter((e) => e.fixed && e.date > '2026-11-30');
    const other = A.D.expenses.filter((e) => !e.fixed).sort((a, b) => b.date.localeCompare(a.date));
    const spent = {}; A.D.expenses.filter((e) => e.date.startsWith('2026-11')).forEach((e) => { spent[e.cat] = (spent[e.cat] || 0) + e.amount; });
    spent.Ads = C.adSpendIn(r.from, r.to);
    const chs = ['Facebook', 'Google', 'TikTok']; const months = [['2026-11', C.range('month')], ['2026-10', C.range('lastmonth')]];
    const recMiss = other.filter((e) => !f.receipts[e.id]).length;
    syncFixed(); const FX = fixedSection();
    el.innerHTML = A.pageHead(t('Costs & budgets', 'খরচ ও বাজেট'), t('Fixed costs record themselves; you add the rest with a receipt.', 'মাসিক খরচ নিজে থেকে রেকর্ড হয়; বাকিগুলো রসিদসহ যোগ করুন।'), expBtn('cs-dl') + `<button class="btn" id="cs-fx">${A.icon('plus', 16)} ${t('Add cost head', 'খাত যোগ করুন')}</button><button class="btn primary" id="cs-add">${A.icon('plus', 16)} ${t('Add expense', 'খরচ যোগ করুন')}</button>`) + A.tabsBar('finance', 'costs') + FX.html +
      U.card(t('Budgets this month', 'এই মাসের বাজেট'), `<div class="grid g2" style="gap:10px 24px">${Object.keys(f.budgets).map((c) => { const s = spent[c] || 0; const b = f.budgets[c]; const fc = c === 'Ads' ? s / elapsed * 30 : s; const p = b ? s / b * 100 : 0; const over = fc > b; return `<div><div class="row between small" style="gap:8px"><b>${catLabel(c)}</b><span>${tk(s)} / ${tk(b)}</span></div>${U.bar(p, s > b ? 'var(--bad)' : over ? 'var(--warn)' : 'var(--good)')}<div class="small ${over ? '' : 'muted'}" style="${over ? 'color:var(--bad)' : ''}">${s > b ? t(`Over by ${tk(s - b)}`, `${tk(s - b)} বেশি`) : over ? t(`At this pace: ${tk(Math.round(fc))}, over by ${tk(Math.round(fc - b))}`, `এই গতিতে: ${tk(Math.round(fc))}, ${tk(Math.round(fc - b))} বেশি হবে`) : t(`${tk(b - s)} left`, `${tk(b - s)} বাকি`)}</div></div>`; }).join('')}</div><button class="btn sm" id="cs-bud" style="margin-top:12px">${A.icon('edit', 16)} ${t('Edit budgets', 'বাজেট এডিট')}</button>`) +
      `<div class="grid g2" style="margin-top:14px;align-items:start;grid-template-columns:minmax(0,1fr)">
        ${U.card(t('Other expenses', 'অন্যান্য খরচ'), (recMiss ? U.callout(t(`${recMiss} expense(s) have no receipt photo.`, `${recMiss}টি খরচের রসিদের ছবি নেই।`), 'warn', 'warn') : '') + U.table([
          { h: t('Date', 'তারিখ'), f: (e) => `<span class="small">${dshort(e.date)}</span>` },
          { h: t('What', 'কী'), f: (e) => `${esc(e.name)}<div class="small muted">${catLabel(e.cat)}</div>` },
          { h: t('Amount', 'পরিমাণ'), r: true, f: (e) => tk(e.amount) },
          { h: t('Receipt', 'রসিদ'), f: (e) => (f.receipts[e.id] ? U.badge('✓ ' + t('Photo', 'ছবি'), 'good') : `<button class="btn sm" data-rc="${e.id}">${t('Add photo', 'ছবি দিন')}</button>`) },
        ], other))}
      </div>
      <div style="margin-top:14px">${U.card(t('Ad spend (imported every day)', 'বিজ্ঞাপন খরচ (প্রতিদিন নিজে আসে)'), U.table([
        { h: t('Platform', 'প্ল্যাটফর্ম'), f: (x) => `<b>${x.ch}</b>` },
        ...months.map((m) => ({ h: m[0] === '2026-11' ? t('This month', 'এই মাস') : t('October', 'অক্টোবর'), r: true, f: (x) => { const b = C.adSpendIn(m[1].from, m[1].to, x.ch); return `${tk(b)}<div class="small muted">$${A.fmt.num(Math.round(b / f.usdRate))}</div>`; } })),
        { h: t('Share of sales', 'বিক্রির ভাগ'), r: true, hide: true, f: (x) => { const p = C.pnl(r.from, r.to); return pct(p.revenue ? C.adSpendIn(r.from, r.to, x.ch) / p.revenue * 100 : 0); } },
      ], chs.map((ch) => ({ ch }))) + `<div class="row between small" style="margin-top:8px;flex-wrap:wrap;gap:6px"><span class="muted">${t(`Paid by card in US dollars. Rate used: ৳${f.usdRate} per $1 (bank's card rate).`, `কার্ডে ডলারে পেমেন্ট। রেট: $1 = ৳${f.usdRate} (ব্যাংকের কার্ড রেট)।`)}</span><button class="btn sm" id="cs-usd">${t('Change rate', 'রেট বদলান')}</button></div>`)}</div>`;
    el.querySelector('#cs-dl').onclick = () => exportDoc(t('Costs & budgets, November 2026', 'খরচ ও বাজেট, নভেম্বর 2026'), Object.keys(f.budgets).map((c) => [catLabel(c), `${tk(spent[c] || 0)} / ${tk(f.budgets[c])}`]).concat([[t('Fixed per month', 'মাসিক নির্দিষ্ট খরচ'), tk(A.sum(fixed, (e) => e.amount)), 'sum']], other.slice(0, 6).map((e) => [dshort(e.date) + ' · ' + esc(e.name) + (f.receipts[e.id] ? '' : ' ⚠'), tk(e.amount)])), t('⚠ = no receipt photo.', '⚠ = রসিদের ছবি নেই।'));
    el.querySelector('#cs-add').onclick = () => {
      let ph = false;
      const m = U.modal(t('Add expense', 'খরচ যোগ করুন'), `<div class="formgrid">${U.field(t('What for', 'কিসের খরচ'), U.input('ex-n', '', `placeholder="${t('e.g. Courier bags', 'যেমন কুরিয়ার ব্যাগ')}"`))}${U.field(t('Category', 'ক্যাটাগরি'), U.select('ex-c', ['Packaging', 'Content', 'Utilities', 'Software', 'Other'].map((c) => [c, catLabel(c)]), 'Packaging'))}${U.field(t('Amount', 'পরিমাণ'), U.money('ex-a', ''))}${U.field(t('Date', 'তারিখ'), U.input('ex-d', TODAY(), 'type="date"'))}${U.field(t('Paid from', 'কোথা থেকে দিলেন'), U.select('ex-acc', ACC.map((a) => [a[0], t(a[1], a[2])]), 'cash'))}<div class="fn-rcpt" id="ex-r">${A.icon('plus', 16)} ${t('Tap to add the receipt photo', 'রসিদের ছবি দিতে চাপুন')}</div></div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ex-ok">${t('Save', 'সেভ')}</button>` });
      m.querySelector('#ex-r').onclick = (e) => { ph = true; e.currentTarget.classList.add('on'); e.currentTarget.textContent = '✓ ' + t('receipt.jpg attached', 'receipt.jpg যুক্ত হয়েছে'); };
      m.querySelector('#ex-ok').onclick = () => {
        const x = { id: A.uid('EXP'), date: val(m, 'ex-d') || TODAY(), name: val(m, 'ex-n'), cat: val(m, 'ex-c'), amount: num(m, 'ex-a'), fixed: false };
        if (!x.name || !(x.amount > 0)) return A.toast(t('Fill in what and how much', 'কিসের খরচ ও কত, লিখুন'), 'bad');
        pinAsk(t('Save this expense?', 'খরচটা সেভ করবেন?'), `<p>${esc(x.name)} · <b>${tk(x.amount)}</b></p>`, t('Save', 'সেভ'), () => { A.D.expenses.push(x); f.receipts[x.id] = ph; done('Expense ' + x.name + ' ' + tk(x.amount), t('Expense saved. Profit updated.', 'খরচ সেভ হয়েছে। লাভের হিসাব আপডেট হয়েছে।')); });
      };
    };
    el.querySelectorAll('[data-rc]').forEach((b) => (b.onclick = () => { f.receipts[b.dataset.rc] = true; done('Receipt added', t('Receipt photo attached.', 'রসিদের ছবি যুক্ত হয়েছে।')); }));
    el.querySelectorAll('[data-fx]').forEach((b) => (b.onclick = () => {
      const e = A.byId(A.D.expenses, b.dataset.fx);
      const m = U.modal(esc(e.name), `<div class="formgrid">${U.field(t('New amount (from next month)', 'নতুন পরিমাণ (পরের মাস থেকে)'), U.money('fx-a', f.fixedNext[e.name] || e.amount))}${U.field(t('Day of the month', 'মাসের কত তারিখ'), U.input('fx-d', f.payDay[e.name] || Number(e.date.slice(8)), 'type="number" min="1" max="28"'))}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="fx-ok">${t('Save', 'সেভ')}</button>` });
      m.querySelector('#fx-ok').onclick = () => { const a = num(m, 'fx-a'), d = Math.max(1, Math.min(28, num(m, 'fx-d'))); pinAsk(t('Change this fixed cost?', 'এই মাসিক খরচ বদলাবেন?'), `<p>${esc(e.name)}: ${tk(a)} · ${t('day', 'তারিখ')} ${d}</p>`, t('Save', 'সেভ'), () => { if (a !== e.amount) f.fixedNext[e.name] = a; else delete f.fixedNext[e.name]; f.payDay[e.name] = d; done('Fixed cost changed ' + e.name, t('Saved. It counts from next month.', 'সেভ হয়েছে। পরের মাস থেকে ধরা হবে।')); }); };
    }));
    el.querySelector('#cs-fx').onclick = addHead; FX.wire(el);
    el.querySelector('#cs-bud').onclick = () => {
      const m = U.modal(t('Monthly budgets', 'মাসের বাজেট'), `<div class="formgrid">${Object.keys(f.budgets).map((c) => U.field(catLabel(c), U.money('bd-' + c, f.budgets[c]))).join('')}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="bd-ok">${t('Save', 'সেভ')}</button>` });
      m.querySelector('#bd-ok').onclick = () => { const nb = {}; Object.keys(f.budgets).forEach((c) => { nb[c] = num(m, 'bd-' + c); }); pinAsk(t('Save budgets?', 'বাজেট সেভ করবেন?'), `<p>${t('Total', 'মোট')} ${tk(A.sum(Object.values(nb)))}</p>`, t('Save', 'সেভ'), () => { f.budgets = nb; done('Budgets changed', t('Budgets saved.', 'বাজেট সেভ হয়েছে।')); }); };
    };
    el.querySelector('#cs-usd').onclick = () => {
      const m = U.modal(t('Dollar rate for ad bills', 'বিজ্ঞাপন বিলের ডলার রেট'), U.field(t('৳ per $1', '$1 = কত ৳'), U.input('usd', f.usdRate, 'type="number"')), { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="usd-ok">${t('Save', 'সেভ')}</button>` });
      m.querySelector('#usd-ok').onclick = () => { const v = num(m, 'usd'); if (!(v > 50)) return A.toast(t('Enter a real rate', 'সঠিক রেট লিখুন'), 'bad'); pinAsk(t('Change the dollar rate?', 'ডলার রেট বদলাবেন?'), `<p>$1 = ৳${v}</p>`, t('Save', 'সেভ'), () => { f.usdRate = v; done('USD rate ' + v, t('Rate saved.', 'রেট সেভ হয়েছে।')); }); };
    };
  }

  /* ================= ERP ACCOUNT ================= */
  const billDay = (o) => { const x = o.timeline.find((l) => /ERP billed|Handed to|courier/i.test(l.text)); return YMD(x ? x.t : new Date(o.created).getTime() + 26.5 * 36e5); };
  const creditDay = (o) => YMD(Math.min(new Date(o.created).getTime() + 4 * DAY, NOW()));
  function erpDays() {
    const days = {}; const add = (d, k, v) => { (days[d] = days[d] || { bills: 0, credits: 0, payments: 0, nb: 0 })[k] += v; };
    for (const o of A.D.orders) {
      if (['shipped', 'delivered', 'returned', 'exchanged'].includes(o.status)) { add(billDay(o), 'bills', C.cogs(o)); days[billDay(o)].nb += C.pieces(o); }
      if (o.status === 'returned' && o.returnChecked) add(creditDay(o), 'credits', o.returnCredit != null ? o.returnCredit : C.cogs(o));
    }
    for (const p of A.D.erp.payments) add(p.date, 'payments', p.amount);
    return days;
  }
  function erp(el) {
    const f = store(); const b = C.erpBalance(); const h = hold(); const days = erpDays(); const em = erpMismatch();
    // ageing: payments + credits settle the oldest bills first
    let pool = b.paid + b.credits; const age = { a: 0, b: 0, c: 0, d: 0 };
    Object.keys(days).sort().forEach((d) => { let v = days[d].bills; const use = Math.min(v, pool); pool -= use; v -= use; if (v <= 0) return; const n = daysSince(d); age[n <= 7 ? 'a' : n <= 15 ? 'b' : n <= 30 ? 'c' : 'd'] += v; });
    const exr = A.D.orders.filter((o) => o.status === 'exchanged' && o.deliveredAt && daysSince(o.deliveredAt) <= 8).map((o) => ({ o, left: 4 - Math.max(0, daysSince(o.deliveredAt) - 1), amt: o.lines[0].cost }));
    const last14 = Array.from({ length: 10 }, (_, i) => YMD(NOW() - i * DAY));
    el.innerHTML = A.pageHead(t('ERP account', 'ERP হিসাব'), t('What the shop owes the ERP for the pieces it sells.', 'বিক্রি করা পিসের জন্য দোকান ERP কে কত দেবে।'), expBtn('er-dl') + `<button class="btn primary" id="er-pay">${t('Pay ERP', 'ERP কে পেমেন্ট')}</button>`) + A.tabsBar('finance', 'erp') +
      `<section class="card fn-stmt"><div class="fn-stmt-t"><b>${t('Monthly statement', 'মাসিক স্টেটমেন্ট')}</b><span class="small muted">${t('One click: opening, bills, approved returns, exchanges, payments and closing — our books next to the ERP, line by line, with what to fix.', 'এক ক্লিকে: শুরুর বাকি, বিল, অ্যাপ্রুভড রিটার্ন, এক্সচেঞ্জ, পেমেন্ট ও শেষের বাকি — আমাদের হিসাব ও ERP পাশাপাশি, লাইন ধরে, কী ঠিক করতে হবে সহ।')}</span></div><button class="btn primary fn-big" id="er-stmt">${A.icon('reports', 18)} ${t('Monthly statement', 'মাসিক স্টেটমেন্ট')}</button></section>
      <div class="fn-tiles" style="margin-bottom:14px">
        ${tile({ label: t('Bills (pieces shipped)', 'বিল (পাঠানো পিস)'), value: tk(b.bills), sub: t('At the shop buying price from the ERP', 'ERP থেকে দোকানের কেনা দামে') })}
        ${tile({ label: t('Credits (approved returns)', 'ক্রেডিট (অ্যাপ্রুভড রিটার্ন)'), value: tk(b.credits), sub: t('Pieces back and passed the ERP check', 'ফেরত এসে ERP চেকে পাস করেছে') })}
        ${tile({ label: t('Paid', 'পেমেন্ট হয়েছে'), value: tk(b.paid), sub: t(`${A.D.erp.payments.length} payments · last ${dshort(lastPay())}`, `${A.D.erp.payments.length}টি পেমেন্ট · শেষ ${dshort(lastPay())}`) })}
        ${tile({ label: t('Balance owed', 'বাকি'), value: tk(b.owed), tone: h.tone === 'good' ? '' : h.tone, sub: h.tone === 'bad' ? t('Orders are on hold until you pay', 'পেমেন্ট না করা পর্যন্ত অর্ডার বন্ধ') : t(`Orders stop in ${h.left} days without a payment${h.since >= 15 ? ' — pay soon' : ''}`, `পেমেন্ট না হলে ${h.left} দিন পর অর্ডার বন্ধ${h.since >= 15 ? ' — শিগগির দিন' : ''}`), extra: `<div class="fn-hold">${Array.from({ length: 30 }, (_, i) => `<i class="${i < h.since ? (i >= 15 ? (i >= 25 ? 'x' : 'w') : 'u') : ''}"></i>`).join('')}</div><div class="small muted">${t('Warning from day 15 · hold at day 30', '15 দিনে সতর্কতা · 30 দিনে হোল্ড')}</div>` })}
      </div>
      <div class="grid g2" style="align-items:start;margin-bottom:14px">
        ${U.card(t('How old is the balance', 'বাকি কত দিনের'), A.chart.bars({ items: [[t('0–7 days', '0–7 দিন'), age.a, 'var(--good)'], [t('8–15 days', '8–15 দিন'), age.b, 'var(--c2)'], [t('16–30 days', '16–30 দিন'), age.c, 'var(--warn)'], [t('Over 30 days', '30 দিনের বেশি'), age.d, 'var(--bad)']].map((x) => ({ label: x[0], value: x[1], text: tk(x[1]), color: x[2] })) }), { sub: t('Payments and credits clear the oldest bills first.', 'পেমেন্ট ও ক্রেডিট আগে পুরনো বিল শোধ করে।') })}
        ${U.card(t('Books match', 'হিসাব মিলছে কি না'), `${em.some((x) => x.st === 'open') ? U.callout(t(`Our books: <b>${tk(b.owed)}</b> · ERP says: <b>${tk(erpSays())}</b>`, `আমাদের হিসাব: <b>${tk(b.owed)}</b> · ERP বলছে: <b>${tk(erpSays())}</b>`), 'bad', 'warn') : U.callout(t(`Matching. Both say ${tk(b.owed)}.`, `মিলছে। দুই দিকেই ${tk(b.owed)}।`), 'good', 'check')}
          ${em.map((x) => `<div class="fn-chk"><span class="ic ${x.st === 'open' ? 'bad' : 'ok'}">${x.st === 'open' ? '!' : '✓'}</span><div style="flex:1;min-width:0"><div>${x.text}</div>${x.st === 'open' ? `<div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn sm primary" data-emfix="${x.id}">${t('Send to ERP again', 'আবার ERP তে পাঠান')}</button><button class="btn sm ghost" data-emacc="${x.id}">${t('Accept ERP figure', 'ERP এর হিসাব মেনে নিন')}</button></div>` : `<div class="small muted">${x.st === 'fixed' ? t('Fixed — ERP updated', 'ঠিক হয়েছে — ERP আপডেট') : t('ERP figure accepted', 'ERP এর হিসাব মেনে নেওয়া হয়েছে')}</div>`}</div></div>`).join('')}`)}
      </div>
      ${exr.length ? U.card(t('Exchanges at risk', 'ঝুঁকিতে থাকা এক্সচেঞ্জ'), U.table([
        { h: t('Order', 'অর্ডার'), f: (x) => `<a href="${A.href('orders', 'all', x.o.id)}">${x.o.id}</a> <span class="small muted">${esc(x.o.name)}</span>` },
        { h: t('Old piece back in', 'পুরনো পিস ফেরতের সময়'), f: (x) => (x.left > 0 ? U.badge(t(`${x.left} day(s) left`, `${x.left} দিন বাকি`), x.left <= 1 ? 'warn' : 'info') : U.badge(t('Late — new piece billed in full', 'দেরি — নতুন পিসের পুরো বিল'), 'bad')) },
        { h: t('At risk', 'ঝুঁকিতে'), r: true, f: (x) => tk(x.amt) },
      ], exr), { sub: t('If the old piece is not back in 4 days, the ERP bills the new piece in full.', 'পুরনো পিস 4 দিনে না ফিরলে ERP নতুন পিসের পুরো বিল করে।') }) + '<div style="height:14px"></div>' : ''}
      <div class="grid g2" style="align-items:start">
        ${U.card(t('Daily summary to the ERP', 'ERP তে দৈনিক সারাংশ'), U.table([
          { h: t('Day', 'দিন'), f: (d) => dshort(d) },
          { h: t('Pieces', 'পিস'), r: true, hide: true, f: (d) => (days[d] ? days[d].nb : 0) },
          { h: t('Bills', 'বিল'), r: true, f: (d) => tk(days[d] ? days[d].bills : 0) },
          { h: t('Credits', 'ক্রেডিট'), r: true, hide: true, f: (d) => tk(days[d] ? days[d].credits : 0) },
          { h: t('Sent', 'পাঠানো'), f: (d, i) => (d === TODAY() ? `<span class="small muted">${t('Sends 11:55 PM', 'রাত 11:55 এ যাবে')}</span>` : d === YMD(NOW() - 3 * DAY) && !f.summaryResent[d] ? `<span class="small" style="color:var(--warn)">${t('Not confirmed', 'নিশ্চিত হয়নি')}</span> <button class="btn sm" data-resend="${d}">${t('Send again', 'আবার পাঠান')}</button>` : `<span class="fn-in">✓</span> <span class="small muted">${f.summaryResent[d] ? t('resent', 'আবার পাঠানো') : '11:55 PM'}</span>`) },
        ], last14))}
        ${U.card(t('Payments', 'পেমেন্ট'), U.table([
          { h: t('Date', 'তারিখ'), f: (p) => dshort(p.date) },
          { h: t('Reference', 'রেফারেন্স'), hide: true, f: (p) => `<span class="mono small">${esc(p.ref)}</span>` },
          { h: t('Amount', 'পরিমাণ'), r: true, f: (p) => `<b>${tk(p.amount)}</b>` },
        ], A.D.erp.payments.slice().reverse()))}
      </div>`;
    el.querySelector('#er-pay').onclick = () => payErp(); el.querySelector('#er-stmt').onclick = pickStatement;
    el.querySelector('#er-dl').onclick = () => exportDoc(t('ERP account statement', 'ERP হিসাবের স্টেটমেন্ট'), [[t('Bills (pieces shipped)', 'বিল (পাঠানো পিস)'), tk(b.bills)], [t('Credits (approved returns)', 'ক্রেডিট (অ্যাপ্রুভড রিটার্ন)'), '−' + tk(b.credits)], [t('Paid', 'পেমেন্ট হয়েছে'), '−' + tk(b.paid)], [t('Balance owed', 'বাকি'), '<b>' + tk(b.owed) + '</b>', 'sum'], [t('0–7 days', '0–7 দিন'), tk(age.a)], [t('8–15 days', '8–15 দিন'), tk(age.b)], [t('16–30 days', '16–30 দিন'), tk(age.c)], [t('Over 30 days', '30 দিনের বেশি'), tk(age.d)]]);
    el.querySelectorAll('[data-emfix]').forEach((x) => (x.onclick = () => { f.erpFix[x.dataset.emfix] = 'fixed'; done('ERP mismatch sent again', t('Sent to the ERP. Books match on this line now.', 'ERP তে পাঠানো হয়েছে। এই লাইন এখন মিলছে।')); }));
    el.querySelectorAll('[data-emacc]').forEach((x) => (x.onclick = () => pinAsk(t('Accept the ERP figure?', 'ERP এর হিসাব মেনে নেবেন?'), `<p>${t('Our books will be adjusted to the ERP figure with an adjusting entry.', 'একটা অ্যাডজাস্টিং এন্ট্রি দিয়ে আমাদের হিসাব ERP এর মতো করা হবে।')}</p>`, t('Accept', 'মেনে নিন'), () => { f.erpFix[x.dataset.emacc] = 'accepted'; done('ERP figure accepted', t('Accepted and adjusted.', 'মেনে নেওয়া ও অ্যাডজাস্ট হয়েছে।')); })));
    el.querySelectorAll('[data-resend]').forEach((x) => (x.onclick = () => { f.summaryResent[x.dataset.resend] = true; done('Daily summary resent', t('Summary sent again. ERP confirmed ✓', 'সারাংশ আবার পাঠানো হয়েছে। ERP নিশ্চিত করেছে ✓')); }));
  }

  /* ================= WALLET & REFUNDS ================= */
  let rfF = 'waiting';
  function wallet(el) {
    const f = store(); const wl = A.sum(A.D.customers, (c) => c.wallet || 0); const holders = A.D.customers.filter((c) => c.wallet > 0).sort((a, b) => b.wallet - a.wallet);
    const rf = f.refunds.filter((x) => rfF === 'all' || x.status === rfF);
    const hrs = (x) => 72 - (NOW() - new Date(x.requestedAt)) / 36e5;
    const waitW = f.wallet.filter((w) => w.status === 'waiting');
    el.innerHTML = A.pageHead(t('Wallet & refunds', 'ওয়ালেট ও রিফান্ড'), t('Money we owe customers: wallet balance and refunds of prepaid orders.', 'কাস্টমারদের যা পাওনা: ওয়ালেট ব্যালেন্স ও আগে পেমেন্ট করা অর্ডারের রিফান্ড।'), expBtn('wl-dl') + `<button class="btn" id="wl-who">${t('Who approves', 'কে অ্যাপ্রুভ করবে')}: ${f.refundApprover === 'owner' ? t('Owner', 'মালিক') : t('Owner + Manager', 'মালিক + ম্যানেজার')}</button>`) + A.tabsBar('finance', 'wallet') +
      `<div class="fn-tiles" style="margin-bottom:14px">
        ${tile({ label: t('Wallet money we owe', 'ওয়ালেটে কাস্টমারের টাকা'), value: tk(wl), sub: t(`${holders.length} customers · they spend it on next orders`, `${holders.length} জন কাস্টমার · পরের অর্ডারে খরচ করবেন`) })}
        ${tile({ label: t('Exchange credits waiting', 'অপেক্ষায় এক্সচেঞ্জ ক্রেডিট'), value: tk(A.sum(waitW, (w) => w.amount)), sub: t(`${waitW.length} · added after the old piece passes the check`, `${waitW.length}টি · পুরনো পিস চেকে পাস করলে যোগ হবে`), tone: waitW.length ? 'warn' : '' })}
        ${tile({ label: t('Refunds waiting', 'রিফান্ড বাকি'), value: tk(A.sum(f.refunds.filter((x) => x.status === 'waiting'), (x) => x.amount)), sub: t(`${f.refunds.filter((x) => x.status === 'waiting').length} · must be paid within 72 hours`, `${f.refunds.filter((x) => x.status === 'waiting').length}টি · 72 ঘণ্টার মধ্যে দিতে হবে`), tone: f.refunds.some((x) => x.status === 'waiting' && hrs(x) < 24) ? 'bad' : '' })}
        ${tile({ label: t('Refunded this month', 'এই মাসে রিফান্ড'), value: tk(A.sum(f.refunds.filter((x) => x.status === 'done' && x.doneAt >= '2026-11'), (x) => x.amount)), sub: t('Only prepaid orders. No cash refund after delivery.', 'শুধু আগে পেমেন্ট করা অর্ডার। ডেলিভারির পর ক্যাশ রিফান্ড নেই।') })}
      </div>
      ${U.card(t('Refunds', 'রিফান্ড'), `<div class="chips" style="margin-bottom:10px">${[['waiting', t('Waiting', 'বাকি')], ['done', t('Paid', 'দেওয়া হয়েছে')], ['all', t('All', 'সব')]].map((c) => `<button class="chip ${rfF === c[0] ? 'on' : ''}" data-rf="${c[0]}">${c[1]}</button>`).join('')}</div>` + U.table([
        { h: t('Order', 'অর্ডার'), f: (x) => `<a href="${A.href('orders', 'all', x.orderId)}">${x.orderId}</a><div class="small muted">${esc(x.name)}</div>` },
        { h: t('Why', 'কেন'), hide: true, f: (x) => (x.reason === 'cannot' ? t('We cannot supply it', 'আমরা দিতে পারছি না') : t('Cancelled before dispatch', 'পাঠানোর আগে বাতিল')) },
        { h: t('Amount', 'পরিমাণ'), r: true, f: (x) => `<b>${tk(x.amount)}</b><div class="small muted">${t('to', 'ফেরত')} ${x.method}</div>` },
        { h: t('Deadline', 'সময়সীমা'), f: (x) => (x.status === 'done' ? U.badge(t('Paid', 'দেওয়া হয়েছে') + ' ' + A.fmt.date(x.doneAt), 'good') : `<span class="fn-clock" style="color:${hrs(x) < 24 ? 'var(--bad)' : 'var(--warn)'}">${Math.max(0, Math.floor(hrs(x)))}${t('h left', ' ঘণ্টা বাকি')}</span>`) },
        { h: '', r: true, f: (x) => (x.status === 'waiting' ? `<button class="btn sm primary" data-pay="${x.id}">${t('Approve & pay', 'অ্যাপ্রুভ ও পেমেন্ট')}</button>` : '') },
      ], rf, { empty: t('No refunds here', 'এখানে কোনো রিফান্ড নেই') }), { sub: t('Refunds only for prepaid orders cancelled before dispatch or that we cannot supply. Paid back the same way within 72 hours.', 'শুধু আগে পেমেন্ট করা অর্ডার, যা পাঠানোর আগে বাতিল হয়েছে বা আমরা দিতে পারছি না। একই মাধ্যমে 72 ঘণ্টার মধ্যে ফেরত।') })}
      <div class="grid g2" style="margin-top:14px;align-items:start">
        ${U.card(t('Credits from exchanges', 'এক্সচেঞ্জ থেকে ক্রেডিট'), U.table([
          { h: t('Customer', 'কাস্টমার'), f: (w) => `${esc(w.name)}<div class="small muted"><a href="${A.href('orders', 'all', w.orderId)}">${w.orderId}</a> · ${t('lower-priced new piece', 'কম দামের নতুন পিস')}</div>` },
          { h: t('Credit', 'ক্রেডিট'), r: true, f: (w) => tk(w.amount) },
          { h: '', r: true, f: (w) => (w.status === 'added' ? U.badge(t('In wallet', 'ওয়ালেটে'), 'good') : `<button class="btn sm" data-wadd="${w.id}">${t('Old piece passed · add', 'পুরনো পিস পাস · যোগ করুন')}</button>`) },
        ], f.wallet))}
        ${U.card(t('Biggest wallet balances', 'সবচেয়ে বেশি ওয়ালেট ব্যালেন্স'), U.table([
          { h: t('Customer', 'কাস্টমার'), f: (c) => `${esc(c.name)}<div class="small muted">${esc(c.district)}</div>` },
          { h: t('Wallet', 'ওয়ালেট'), r: true, f: (c) => `<b>${tk(c.wallet)}</b>` },
        ], holders.slice(0, 8)), { more: t('All customers', 'সব কাস্টমার'), moreHref: A.href('customers', 'loyalty') })}
      </div>`;
    el.querySelector('#wl-dl').onclick = () => exportDoc(t('Wallet & refunds', 'ওয়ালেট ও রিফান্ড'), [[t('Wallet money we owe', 'ওয়ালেটে কাস্টমারের টাকা'), tk(wl), 'sum']].concat(f.refunds.map((x) => [`${x.orderId} · ${esc(x.name)} · ${x.status === 'done' ? t('paid', 'দেওয়া হয়েছে') : t('waiting', 'বাকি')}`, tk(x.amount)])));
    el.querySelectorAll('[data-rf]').forEach((b) => (b.onclick = () => { rfF = b.dataset.rf; A.render(); }));
    el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => {
      const x = f.refunds.find((r) => r.id === b.dataset.pay);
      pinAsk(t('Approve this refund?', 'এই রিফান্ড অ্যাপ্রুভ করবেন?'), `<p><b>${tk(x.amount)}</b> ${t('back to', 'ফেরত যাবে')} ${x.method} · ${esc(x.name)} · ${x.orderId}</p><p class="small muted">${f.closed[x.requestedAt.slice(0, 7)] ? t('That month is closed, so this posts in November.', 'ওই মাস বন্ধ, তাই এটা নভেম্বরে যাবে।') : t('The customer gets an SMS when it is sent.', 'পাঠানো হলে কাস্টমার SMS পাবেন।')}</p>`, t('Approve & pay', 'অ্যাপ্রুভ ও পেমেন্ট'), () => {
        x.status = 'done'; x.doneAt = A.TODAY.toISOString(); x.by = (A.D.staff[0] || {}).name || 'Owner';
        done('Refund paid ' + x.orderId + ' ' + tk(x.amount), t(`${tk(x.amount)} sent to ${x.name} by ${x.method}.`, `${x.name} কে ${x.method} এ ${tk(x.amount)} পাঠানো হয়েছে।`));
      });
    }));
    el.querySelectorAll('[data-wadd]').forEach((b) => (b.onclick = () => {
      const w = f.wallet.find((x) => x.id === b.dataset.wadd); const c = A.byId(A.D.customers, w.customerId);
      pinAsk(t('Add to wallet?', 'ওয়ালেটে যোগ করবেন?'), `<p>${tk(w.amount)} → ${esc(w.name)}</p>`, t('Add', 'যোগ করুন'), () => { w.status = 'added'; if (c) c.wallet = (c.wallet || 0) + w.amount; done('Wallet credit ' + w.name, t(`${tk(w.amount)} added to ${w.name}'s wallet.`, `${w.name} এর ওয়ালেটে ${tk(w.amount)} যোগ হয়েছে।`)); });
    }));
    el.querySelector('#wl-who').onclick = () => {
      const m = U.modal(t('Who can approve refunds', 'কে রিফান্ড অ্যাপ্রুভ করতে পারবে'), U.seg('wl-ap', [['owner', t('Owner only', 'শুধু মালিক')], ['manager', t('Owner and Manager', 'মালিক ও ম্যানেজার')]], f.refundApprover) + `<p class="small muted" style="margin-top:10px">${t('Every refund is logged with who approved it.', 'প্রতিটা রিফান্ডে কে অ্যাপ্রুভ করল তা লেখা থাকে।')}</p>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ap-ok">${t('Save', 'সেভ')}</button>` });
      let v = f.refundApprover; m.querySelectorAll('#wl-ap button').forEach((b) => (b.onclick = () => { v = b.dataset.v; m.querySelectorAll('#wl-ap button').forEach((x) => x.classList.toggle('on', x === b)); }));
      m.querySelector('#ap-ok').onclick = () => pinAsk(t('Change who approves?', 'অ্যাপ্রুভার বদলাবেন?'), '', t('Save', 'সেভ'), () => { f.refundApprover = v; done('Refund approver ' + v, t('Saved.', 'সেভ হয়েছে।')); });
    };
  }

  /* ================= VAT (hidden by default) ================= */
  function vat(el) {
    if (!vatOn()) {
      el.innerHTML = A.pageHead(t('VAT', 'ভ্যাট'), '') + A.tabsBar('finance', 'overview') + U.card('', `${U.callout(t('VAT is off — turn it on in Settings. While it is off, no VAT line shows anywhere in Finance.', 'ভ্যাট বন্ধ — সেটিংস থেকে চালু করুন। বন্ধ থাকলে হিসাবের কোথাও ভ্যাট দেখাবে না।'), 'info', 'info')}<button class="btn primary" id="vt-on" style="margin-top:12px">${t('Turn VAT on', 'ভ্যাট চালু করুন')}</button>`);
      el.querySelector('#vt-on').onclick = () => pinAsk(t('Turn VAT on?', 'ভ্যাট চালু করবেন?'), `<p>${t('The VAT tab and VAT lines appear in Finance.', 'হিসাবে ভ্যাট ট্যাব ও ভ্যাট লাইন দেখাবে।')}</p>`, t('Turn on', 'চালু করুন'), () => { A.D.store.showVat = true; done('VAT turned on', t('VAT is on.', 'ভ্যাট চালু হয়েছে।')); });
      return;
    }
    const v = (A.D.vat = A.D.vat || { rate: 7.5, bin: '' }); const rate = Number(v.rate) || 0;
    const months = [['2026-11', t('November (so far)', 'নভেম্বর (এখন পর্যন্ত)'), C.range('month')], ['2026-10', t('October', 'অক্টোবর'), C.range('lastmonth')]].map((m) => { const p = C.pnl(m[2].from, m[2].to); return { m: m[1], rev: p.revenue, vat: Math.round(p.revenue * rate / (100 + rate)) }; });
    el.innerHTML = A.pageHead(t('VAT', 'ভ্যাট'), t('VAT included in your sales, month by month.', 'আপনার বিক্রির মধ্যে থাকা ভ্যাট, মাস অনুযায়ী।'), `<button class="btn" id="vt-off">${t('Turn VAT off', 'ভ্যাট বন্ধ করুন')}</button>`) + A.tabsBar('finance', 'vat') +
      `<div class="grid g2" style="align-items:start">${U.card(t('VAT setting', 'ভ্যাট সেটিং'), `<div class="formgrid">${U.field(t('VAT rate (%)', 'ভ্যাটের হার (%)'), U.input('vt-r', v.rate, 'type="number" step="0.5"'))}${U.field(t('BIN (13 digits)', 'BIN (13 সংখ্যা)'), U.input('vt-b', v.bin, 'inputmode="numeric"'))}</div><button class="btn primary sm" id="vt-save" style="margin-top:10px">${t('Save', 'সেভ')}</button><div class="small muted" style="margin-top:10px">${t('Later: a different rate per category or product (for example 0% on caps, 7.5% on clothing). The shop chooses one rate for now.', 'পরে: ক্যাটাগরি বা প্রোডাক্ট অনুযায়ী আলাদা হার (যেমন ক্যাপে 0%, কাপড়ে 7.5%)। এখন একটা হার।')}</div>`)}
      ${U.card(t('VAT per month', 'মাসে ভ্যাট'), U.table([{ h: t('Month', 'মাস'), f: (x) => x.m }, { h: t('Sales incl. VAT', 'ভ্যাটসহ বিক্রি'), r: true, f: (x) => tk(x.rev) }, { h: t('VAT', 'ভ্যাট'), r: true, f: (x) => `<b>${tk(x.vat)}</b>` }], months) + `<div class="small muted" style="margin-top:8px">${t(`VAT = sales × ${rate} ÷ ${100 + rate}. Delivered orders only.`, `ভ্যাট = বিক্রি × ${rate} ÷ ${100 + rate}। শুধু ডেলিভারি হওয়া অর্ডার।`)}</div>`)}</div>`;
    el.querySelector('#vt-save').onclick = () => { const r = Number(val(el, 'vt-r')); if (!(r >= 0)) return A.toast(t('Enter the rate', 'হার লিখুন'), 'bad'); pinAsk(t('Save VAT setting?', 'ভ্যাট সেটিং সেভ করবেন?'), `<p>${r}%</p>`, t('Save', 'সেভ'), () => { v.rate = r; v.bin = val(el, 'vt-b'); done('VAT setting saved', t('VAT setting saved.', 'ভ্যাট সেটিং সেভ হয়েছে।')); }); };
    el.querySelector('#vt-off').onclick = () => pinAsk(t('Turn VAT off?', 'ভ্যাট বন্ধ করবেন?'), '', t('Turn off', 'বন্ধ করুন'), () => { A.D.store.showVat = false; A.commit('VAT turned off'); A.toast(t('VAT is off.', 'ভ্যাট বন্ধ হয়েছে।'), 'good'); A.go('finance', 'overview'); });
  }

  /* ================= FIXED COSTS & SALARIES (model in A.D.fin.fx; feeds A.D.expenses → P&L, forecast) ================= */
  const CUR_YM = '2026-11';
  const pad2 = (n) => String(n).padStart(2, '0');
  const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1); };
  const monLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return t(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + y, ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'][m - 1] + ' ' + y); };
  const amtAt = (x, ym) => { let a = 0; x.hist.slice().sort((p, q) => p.from.localeCompare(q.from)).forEach((h) => { if (h.from <= ym) a = h.amt; }); return a; };
  const nextChange = (x, ym) => x.hist.filter((h) => h.from > ym).sort((p, q) => p.from.localeCompare(q.from))[0];
  const POSTS = () => [['Manager', t('Manager', 'ম্যানেজার')], ['Order confirmation caller', t('Order confirmation caller', 'অর্ডার কনফার্মেশন কলার')], ['Customer support', t('Customer support', 'কাস্টমার সাপোর্ট')], ['Packer', t('Packer', 'প্যাকার')], ['Content & photo', t('Content & photo', 'কনটেন্ট ও ফটো')], ['Ads manager', t('Ads manager', 'অ্যাডস ম্যানেজার')], ['Delivery helper', t('Delivery helper', 'ডেলিভারি হেল্পার')], ['Other', t('Other', 'অন্যান্য')]];
  const postName = (p) => { const x = POSTS().find((y) => y[0] === p); return x ? x[1] : esc(p); };
  function fxSeed() {
    const S = (id, name, post, amt, day, pay, extra, m) => ({ id, name, post, day, pay, hist: [{ from: '2026-01', amt }].concat(extra || []), m: m || {} });
    const paid = (o) => ({ paid: true, paidAt: '2026-11-07', ...o });
    const staff = [
      S('ST1', 'Arif Hossain', 'Manager', 24000, 7, 'DBBL A/C ••• 4471', [{ from: '2026-09', amt: 26000, at: '2026-08-28', by: 'Mehadi Hasan', note: 'Yearly raise' }], { '2026-11': paid({ acc: 'bank' }) }),
      S('ST2', 'Rafi Ahmed', 'Order confirmation caller', 13000, 7, 'bKash 01711-••••82', null, { '2026-11': paid({ bonus: 1000, note: 'Best confirm rate in Oct', acc: 'bkash' }) }),
      S('ST3', 'Nusrat Jahan', 'Customer support', 13000, 7, 'bKash 01819-••••40', null, { '2026-11': paid({ ded: 500, note: '1 day unpaid leave', acc: 'bkash' }) }),
      S('ST4', 'Sohel Rana', 'Packer', 11000, 10, 'Nagad 01923-••••15', null, { '2026-11': { adv: 3000 } }),
      S('ST5', 'Jahid Hasan', 'Content & photo', 16000, 15, 'bKash 01674-••••09'),
      S('ST6', 'Tania Akter', 'Ads manager', 22000, 15, 'DBBL A/C ••• 9026'),
    ];
    const H = (id, name, cat, amt, day, extra, sub) => ({ id, name, cat, day, hist: [{ from: '2026-01', amt }].concat(extra || []), sub: sub || null });
    const heads = [
      H('FH1', 'Office & warehouse rent', 'Rent', 28000, 5, [{ from: '2026-09', amt: 30000, at: '2026-08-20', by: 'Mehadi Hasan', note: 'New lease, +৳2,000' }]),
      H('FH2', 'Electricity', 'Utilities', 6500, 10),
      H('FH3', 'Internet', 'Utilities', 3000, 10),
      H('FH4', 'Mobile bills', 'Utilities', 2500, 10),
      H('FH5', 'Software & subscriptions', 'Software', 8200, 3, [{ from: '2026-10', amt: 9000, at: '2026-09-29', by: 'Mehadi Hasan', note: 'Bigger SMS package' }], [['Domain', 150], ['Server', 5500], ['SMS package', 1500], ['Email', 600], ['Design tools', 1250]]),
      H('FH6', 'Accountant fee', 'Other', 5000, 25),
      H('FH7', 'Transport & conveyance', 'Other', 4000, 28),
      H('FH8', 'Cleaning & maintenance', 'Other', 2500, 20),
      H('FH9', 'Eid bonus provision', 'Salaries', 8400, 28),
    ];
    return { rev: 1, synced: 0, staff, heads, log: [] };
  }
  const staffCost = (s, ym) => { const st = s.m[ym] || {}; const base = s.from && s.from > ym ? 0 : amtAt(s, ym); return base ? base + (st.bonus || 0) - (st.ded || 0) : 0; };
  const staffNet = (s, ym) => staffCost(s, ym) - ((s.m[ym] || {}).adv || 0);
  const isPaid = (s, ym) => ym < CUR_YM || !!(s.m[ym] || {}).paid;
  const fxTotals = (ym) => { const fx = store().fx; const sal = A.sum(fx.staff, (s) => staffCost(s, ym)); const oth = A.sum(fx.heads, (h) => amtAt(h, ym)); return { sal, oth, all: sal + oth }; };
  function syncFixed() {
    const f = store(); const fx = f.fx; if (fx.synced === fx.rev) return;
    A.D.expenses = A.D.expenses.filter((e) => !e.fixed);
    for (const ym of ['2026-10', CUR_YM]) {
      for (const s of fx.staff) {
        const c = staffCost(s, ym); if (!c) continue; const st = s.m[ym] || {}; const pd = isPaid(s, ym);
        A.D.expenses.push({ id: 'FX-' + s.id + '-' + ym, date: pd && st.paidAt ? st.paidAt : ym + '-' + pad2(s.day), name: 'Salary · ' + s.name, cat: 'Salaries', amount: c, cashAmt: c - (st.adv || 0), acc: st.acc || (/bKash/.test(s.pay) ? 'bkash' : /Nagad/.test(s.pay) ? 'nagad' : 'bank'), fixed: true, unpaid: !pd });
      }
      for (const h of fx.heads) { const a = amtAt(h, ym); if (a) A.D.expenses.push({ id: 'FX-' + h.id + '-' + ym, date: ym + '-' + pad2(h.day), name: h.name, cat: h.cat, amount: a, fixed: true }); }
    }
    fx.synced = fx.rev;
  }
  const fxDone = (msg, toast) => { const fx = store().fx; fx.rev++; syncFixed(); done(msg, toast); };
  const me = () => ((A.D.staff || [])[0] || {}).name || 'Owner';
  const fromOpts = () => [0, 1, 2].map((i) => { const ym = ymAdd(CUR_YM, i); return [ym, monLabel(ym) + (i === 0 ? t(' (this month)', ' (এই মাস)') : '')]; });

  function changeAmount(kind, x) {
    const cur = amtAt(x, CUR_YM);
    const m = U.modal(t('Change amount', 'পরিমাণ বদলান') + ' · ' + esc(x.name), `<div class="stack">${U.callout(t(`Now <b>${tk(cur)}</b> a month. Past months keep their old amount.`, `এখন মাসে <b>${tk(cur)}</b>। আগের মাসগুলোতে পুরনো পরিমাণই থাকবে।`), 'info', 'info')}
      <div class="formgrid">${U.field(t('New amount per month', 'মাসে নতুন পরিমাণ'), U.money('ca-a', cur))}${U.field(t('From which month?', 'কোন মাস থেকে?'), U.select('ca-f', fromOpts(), ymAdd(CUR_YM, 1)))}${U.field(t('Reason (for the history)', 'কারণ (হিস্টরির জন্য)'), U.input('ca-n', '', `placeholder="${t('e.g. Yearly raise', 'যেমন বছরের ইনক্রিমেন্ট')}"`))}</div></div>`,
    { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ca-ok">${t('Continue', 'এগিয়ে যান')}</button>` });
    m.querySelector('#ca-ok').onclick = () => {
      const a = num(m, 'ca-a'), from = val(m, 'ca-f'), note = val(m, 'ca-n');
      if (!(a > 0)) return A.toast(t('Enter the amount', 'পরিমাণ লিখুন'), 'bad');
      pinAsk(t('Save the new amount?', 'নতুন পরিমাণ সেভ করবেন?'), `<p>${esc(x.name)}: ${tk(amtAt(x, from))} → <b>${tk(a)}</b> ${t('from', 'শুরু')} ${monLabel(from)}</p>`, t('Save', 'সেভ'), () => {
        const old = amtAt(x, from); x.hist = x.hist.filter((h) => h.from !== from); x.hist.push({ from, amt: a, at: TODAY(), by: me(), note });
        store().fx.log.unshift({ t: A.TODAY.toISOString(), item: x.name, old, amt: a, from, by: me(), note });
        fxDone(`${kind === 'staff' ? 'Salary' : 'Fixed cost'} changed ${x.name} ${tk(old)} → ${tk(a)} from ${from}`, t(`Saved. ${monLabel(from)} onwards uses ${tk(a)}; earlier months stay ${tk(old)}.`, `সেভ হয়েছে। ${monLabel(from)} থেকে ${tk(a)} ধরা হবে; আগের মাসে ${tk(old)} ই থাকবে।`));
      });
    };
  }
  function historyDrawer(x) {
    const hs = x.hist.slice().sort((p, q) => q.from.localeCompare(p.from));
    U.drawer(t('Amount history', 'পরিমাণের হিস্টরি') + ' · ' + esc(x.name), `<div class="tl">${hs.map((h, i) => `<div class="fn-chk"><span class="ic ${h.from > CUR_YM ? 'no' : 'ok'}">${h.from > CUR_YM ? '→' : '✓'}</span><div style="flex:1;min-width:0"><b>${tk(h.amt)}</b> ${t('a month from', 'মাসে, শুরু')} ${monLabel(h.from)} ${i === 0 && h.from > CUR_YM ? U.badge(t('Coming', 'আসছে'), 'warn') : ''}<div class="small muted">${h.at ? `${t('Changed', 'বদলেছেন')} ${esc(h.by || '')} · ${dshort(h.at)}${h.note ? ' · ' + esc(h.note) : ''}` : t('Starting amount', 'শুরুর পরিমাণ')}</div></div></div>`).join('')}</div>
      <div class="small muted" style="margin-top:10px">${t('Each month uses the amount that was set for it. Changing today never rewrites a past month.', 'প্রতিটা মাস তার জন্য ঠিক করা পরিমাণ ধরে। আজ বদলালে আগের কোনো মাস বদলায় না।')}</div>`);
  }
  function staffDrawer(s) {
    const st = (s.m[CUR_YM] = s.m[CUR_YM] || {}); const pd = isPaid(s, CUR_YM);
    const d = U.drawer(esc(s.name) + ' · ' + postName(s.post), `<div class="stack">
      <div class="fn-ue"><div class="r"><span>${t('Monthly salary', 'মাসিক বেতন')}</span><b>${tk(amtAt(s, CUR_YM))}</b></div><div class="r"><span>${t('Pay day', 'বেতনের দিন')}</span><b>${s.day}</b></div><div class="r"><span>${t('Paid to', 'যেখানে পাঠানো হয়')}</span><b>${esc(s.pay)}</b></div></div>
      <h4 style="margin:6px 0 0">${monLabel(CUR_YM)}</h4>
      <div class="formgrid">${U.field(t('Advance taken', 'অ্যাডভান্স নিয়েছেন'), U.money('sd-adv', st.adv || 0, pd ? 'disabled' : ''))}${U.field(t('Bonus', 'বোনাস'), U.money('sd-bon', st.bonus || 0, pd ? 'disabled' : ''))}${U.field(t('Deductions', 'কর্তন'), U.money('sd-ded', st.ded || 0, pd ? 'disabled' : ''))}${U.field(t('Note', 'নোট'), U.input('sd-n', st.note || '', pd ? 'disabled' : `placeholder="${t('e.g. 1 day unpaid leave', 'যেমন 1 দিন বিনা বেতনে ছুটি')}"`))}</div>
      ${pd ? U.callout(t(`Paid ${tk(staffNet(s, CUR_YM))} on ${dshort(st.paidAt)}. Locked.`, `${dshort(st.paidAt)} তারিখে ${tk(staffNet(s, CUR_YM))} দেওয়া হয়েছে। লক।`), 'good', 'check') : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" id="sd-chg">${A.icon('edit', 16)} ${t('Change salary', 'বেতন বদলান')}</button><button class="btn sm ghost" id="sd-his">${t('History', 'হিস্টরি')}</button></div></div>`,
    { foot: pd ? `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>` : `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="sd-ok">${t('Save this month', 'এই মাস সেভ করুন')}</button>` });
    d.querySelector('#sd-chg').onclick = () => { U.close(); changeAmount('staff', s); };
    d.querySelector('#sd-his').onclick = () => { U.close(); historyDrawer(s); };
    const ok = d.querySelector('#sd-ok'); if (ok) ok.onclick = () => {
      const n = { adv: num(d, 'sd-adv'), bonus: num(d, 'sd-bon'), ded: num(d, 'sd-ded'), note: val(d, 'sd-n') }; const addAdv = n.adv - (st.adv || 0);
      pinAsk(t('Save salary changes?', 'বেতনের পরিবর্তন সেভ করবেন?'), `<p>${esc(s.name)} · ${t('net to pay', 'দিতে হবে')} <b>${tk(amtAt(s, CUR_YM) + n.bonus - n.ded - n.adv)}</b></p>${addAdv > 0 ? `<p class="small muted">${t(`New advance ${tk(addAdv)} is recorded as paid from the cash box today.`, `নতুন অ্যাডভান্স ${tk(addAdv)} আজ ক্যাশ বক্স থেকে দেওয়া হিসেবে রেকর্ড হবে।`)}</p>` : ''}`, t('Save', 'সেভ'), () => {
        Object.assign(st, n); if (addAdv > 0) store().moves.push({ id: A.uid('MV'), date: TODAY(), acc: 'cash', amt: -addAdv, kind: 'expense', what: 'Salary advance · ' + s.name, by: me() });
        fxDone('Salary adjusted ' + s.name, t('Saved. Net to pay updated.', 'সেভ হয়েছে। দিতে হবে আপডেট হয়েছে।'));
      });
    };
  }
  function paySalary(list) {
    const tot = A.sum(list, (s) => staffNet(s, CUR_YM));
    const m = U.modal(t('Pay salary', 'বেতন দিন'), `<div class="stack">${list.map((s) => `<div class="row between small" style="gap:8px"><span>${esc(s.name)} <span class="muted">· ${esc(s.pay)}</span></span><b>${tk(staffNet(s, CUR_YM))}</b></div>`).join('')}<div class="row between" style="border-top:1px solid var(--line);padding-top:8px"><b>${t('Total', 'মোট')}</b><b>${tk(tot)}</b></div>
      ${list.length === 1 ? U.field(t('Pay from', 'কোথা থেকে দেবেন'), U.select('ps-acc', ACC.map((a) => [a[0], t(a[1], a[2])]), /bKash/.test(list[0].pay) ? 'bkash' : /Nagad/.test(list[0].pay) ? 'nagad' : 'bank')) : `<div class="small muted">${t('Each person is paid from the account that matches their bKash, Nagad or bank.', 'প্রত্যেককে তার বিকাশ, নগদ বা ব্যাংকের সাথে মিলিয়ে সেই অ্যাকাউন্ট থেকে দেওয়া হবে।')}</div>`}</div>`,
    { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ps-ok">${t('Continue', 'এগিয়ে যান')}</button>` });
    m.querySelector('#ps-ok').onclick = () => {
      const acc = list.length === 1 ? val(m, 'ps-acc') : '';
      pinAsk(t('Pay salary now?', 'এখন বেতন দেবেন?'), `<p><b>${tk(tot)}</b> · ${list.length} ${t('person(s)', 'জন')}</p><p class="small muted">${t('It goes into Money in & out and this month\'s profit at once. A payslip SMS goes to each person.', 'সাথে সাথে টাকার আসা-যাওয়া ও এই মাসের লাভে যোগ হবে। প্রত্যেকে পে-স্লিপ SMS পাবেন।')}</p>`, t('Pay', 'পেমেন্ট করুন'), () => {
        list.forEach((s) => { const st = (s.m[CUR_YM] = s.m[CUR_YM] || {}); st.paid = true; st.paidAt = TODAY(); st.acc = acc || (/bKash/.test(s.pay) ? 'bkash' : /Nagad/.test(s.pay) ? 'nagad' : 'bank'); });
        fxDone('Salary paid ' + list.map((s) => s.name).join(', ') + ' ' + tk(tot), t(`${tk(tot)} salary paid. Payslips sent.`, `${tk(tot)} বেতন দেওয়া হয়েছে। পে-স্লিপ পাঠানো হয়েছে।`));
      });
    };
  }
  function addStaff() {
    const m = U.modal(t('Add staff', 'স্টাফ যোগ করুন'), `<div class="formgrid">${U.field(t('Name', 'নাম'), U.input('as-n', ''))}${U.field(t('Post', 'পদ'), U.select('as-p', POSTS(), 'Packer'))}${U.field(t('Monthly salary', 'মাসিক বেতন'), U.money('as-a', ''))}${U.field(t('Pay day', 'বেতনের দিন'), U.input('as-d', 7, 'type="number" min="1" max="28"'))}${U.field(t('bKash / Nagad / bank', 'বিকাশ / নগদ / ব্যাংক'), U.input('as-pay', '', 'placeholder="bKash 01XXXXXXXXX"'))}${U.field(t('Starts from', 'কবে থেকে'), U.select('as-f', fromOpts(), CUR_YM))}</div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="as-ok">${t('Continue', 'এগিয়ে যান')}</button>` });
    m.querySelector('#as-ok').onclick = () => {
      const s = { id: A.uid('ST'), name: val(m, 'as-n'), post: val(m, 'as-p'), day: Math.max(1, Math.min(28, num(m, 'as-d'))), pay: val(m, 'as-pay') || 'Cash', from: val(m, 'as-f'), m: {} }; const a = num(m, 'as-a');
      if (!s.name || !(a > 0)) return A.toast(t('Fill in name and salary', 'নাম ও বেতন লিখুন'), 'bad');
      s.hist = [{ from: s.from, amt: a, at: TODAY(), by: me(), note: 'Joined' }];
      pinAsk(t('Add this person to salaries?', 'এই জনকে বেতনের তালিকায় যোগ করবেন?'), `<p>${esc(s.name)} · ${postName(s.post)} · <b>${tk(a)}</b> ${t('from', 'শুরু')} ${monLabel(s.from)}</p>`, t('Add', 'যোগ করুন'), () => { store().fx.staff.push(s); fxDone('Staff added ' + s.name, t('Added to salaries.', 'বেতনের তালিকায় যোগ হয়েছে।')); });
    };
  }
  function addHead() {
    const m = U.modal(t('Add cost head', 'খরচের খাত যোগ করুন'), `<div class="formgrid">${U.field(t('Name', 'নাম'), U.input('ah-n', '', `placeholder="${t('e.g. Warehouse guard', 'যেমন গুদামের পাহারাদার')}"`))}${U.field(t('Category', 'ক্যাটাগরি'), U.select('ah-c', ['Rent', 'Utilities', 'Software', 'Salaries', 'Content', 'Other'].map((c) => [c, catLabel(c)]), 'Other'))}${U.field(t('Amount per month', 'মাসে পরিমাণ'), U.money('ah-a', ''))}${U.field(t('Day of the month', 'মাসের কত তারিখ'), U.input('ah-d', 5, 'type="number" min="1" max="28"'))}${U.field(t('From which month?', 'কোন মাস থেকে?'), U.select('ah-f', fromOpts(), CUR_YM))}</div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="ah-ok">${t('Continue', 'এগিয়ে যান')}</button>` });
    m.querySelector('#ah-ok').onclick = () => {
      const n = val(m, 'ah-n'), a = num(m, 'ah-a'), from = val(m, 'ah-f'); if (!n || !(a > 0)) return A.toast(t('Fill in name and amount', 'নাম ও পরিমাণ লিখুন'), 'bad');
      pinAsk(t('Add this cost head?', 'এই খাত যোগ করবেন?'), `<p>${esc(n)} · <b>${tk(a)}</b> ${t('a month from', 'মাসে, শুরু')} ${monLabel(from)}</p>`, t('Add', 'যোগ করুন'), () => {
        store().fx.heads.push({ id: A.uid('FH'), name: n, cat: val(m, 'ah-c'), day: Math.max(1, Math.min(28, num(m, 'ah-d'))), hist: [{ from, amt: a, at: TODAY(), by: me(), note: 'New head' }], sub: null });
        fxDone('Cost head added ' + n, t('Cost head added. Profit and forecast updated.', 'খাত যোগ হয়েছে। লাভ ও পূর্বাভাস আপডেট হয়েছে।'));
      });
    };
  }
  function fixedSection() {
    const f = store(); const fx = f.fx; const T = fxTotals(CUR_YM); const r = C.range('month'); const elapsed = (r.to - r.from) / DAY;
    const p = C.pnl(r.from, r.to); const delFc = Math.max(1, Math.round(p.delivered / elapsed * 30)); const share = Math.round(T.all / delFc);
    const months = Array.from({ length: 6 }, (_, i) => ymAdd(CUR_YM, i - 5)); const tr = months.map((ym) => fxTotals(ym));
    const prevT = tr[4].all; const day = A.TODAY.getDate();
    const due = fx.staff.filter((s) => staffCost(s, CUR_YM) && !isPaid(s, CUR_YM)); const late = due.filter((s) => s.day < day);
    const dueAmt = A.sum(due, (s) => staffNet(s, CUR_YM));
    const status = (s) => { if (!staffCost(s, CUR_YM)) return U.badge(t('Starts later', 'পরে শুরু'), 'info'); if (isPaid(s, CUR_YM)) return `${U.badge('✓ ' + t('Paid', 'দেওয়া হয়েছে'), 'good')}<div class="small muted">${dshort(s.m[CUR_YM].paidAt)}</div>`; return `<button class="btn sm primary" data-pay="${s.id}">${t('Pay', 'দিন')}</button>${s.day < day ? `<div class="small" style="color:var(--bad)">${t(`Late ${day - s.day} day(s)`, `${day - s.day} দিন দেরি`)}</div>` : `<div class="small muted">${t(`Due on ${s.day}`, `${s.day} তারিখে`)}</div>`}`; };
    const mv = (s, k) => { const v = (s.m[CUR_YM] || {})[k] || 0; return v ? (k === 'bonus' ? `<span class="fn-in">+${tk(v)}</span>` : `<span class="fn-out">−${tk(v)}</span>`) : '<span class="muted">—</span>'; };
    const salT = U.table([
      { h: t('Staff', 'স্টাফ'), f: (s) => `<b>${esc(s.name)}</b><div class="small muted">${postName(s.post)} · ${esc(s.pay)}</div>` },
      { h: t('Salary', 'বেতন'), r: true, f: (s) => { const nx = nextChange(s, CUR_YM); return `${tk(amtAt(s, CUR_YM) || amtAt(s, s.from || CUR_YM))}${nx ? `<div class="small" style="color:var(--warn)">${monLabel(nx.from)}: ${tk(nx.amt)}</div>` : ''}`; } },
      { h: t('Pay day', 'বেতনের দিন'), r: true, hide: true, f: (s) => s.day },
      { h: t('Advance', 'অ্যাডভান্স'), r: true, hide: true, f: (s) => mv(s, 'adv') },
      { h: t('Bonus', 'বোনাস'), r: true, hide: true, f: (s) => mv(s, 'bonus') },
      { h: t('Deductions', 'কর্তন'), r: true, hide: true, f: (s) => mv(s, 'ded') },
      { h: t('Net to pay', 'দিতে হবে'), r: true, f: (s) => `<b>${tk(staffNet(s, CUR_YM))}</b>` },
      { h: t('This month', 'এই মাস'), r: true, f: status },
      { h: '', r: true, f: (s) => `<button class="btn sm ghost" data-st="${s.id}" aria-label="${t('Edit', 'এডিট')}">${A.icon('edit', 16)}</button>` },
    ], fx.staff);
    const headT = U.table([
      { h: t('Cost head', 'খাত'), f: (h) => `<b>${esc(h.name)}</b><div class="small muted">${catLabel(h.cat)}${h.sub ? ' · ' + h.sub.map((x) => `${esc(x[0])} ${tk(x[1])}`).join(', ') : ''}</div>` },
      { h: t('Per month', 'মাসে'), r: true, f: (h) => { const nx = nextChange(h, CUR_YM); return `<b>${tk(amtAt(h, CUR_YM))}</b>${nx ? `<div class="small" style="color:var(--warn)">${monLabel(nx.from)}: ${tk(nx.amt)}</div>` : ''}`; } },
      { h: t('Day', 'তারিখ'), r: true, hide: true, f: (h) => h.day },
      { h: t('This month', 'এই মাস'), hide: true, f: (h) => (!amtAt(h, CUR_YM) ? U.badge(t('Starts later', 'পরে শুরু'), 'info') : h.day <= day ? U.badge('✓ ' + t('Recorded', 'রেকর্ড হয়েছে'), 'good') : `<span class="small muted">${t(`Records on ${h.day}`, `${h.day} তারিখে রেকর্ড হবে`)}</span>`) },
      { h: '', r: true, f: (h) => `<button class="btn sm ghost" data-hc="${h.id}">${t('Change', 'বদলান')}</button> <button class="btn sm ghost" data-hh="${h.id}">${t('History', 'হিস্টরি')}</button>` },
    ], fx.heads);
    const html = `<h3 style="margin:4px 0 10px;font-size:15px">${t('1 · Fixed costs & salaries', '1 · মাসিক খরচ ও বেতন')}</h3>
      <div class="fn-tiles" style="margin-bottom:12px">
        ${tile({ icon: 'finance', label: t('Fixed costs this month', 'এই মাসের মাসিক খরচ'), value: tk(T.all), sub: `${t('Salaries', 'বেতন')} ${tk(T.sal)} · ${t('Other', 'অন্যান্য')} ${tk(T.oth)} · ${A.delta(T.all, prevT, true)} ${t('vs last month', 'গত মাসের তুলনায়')}` })}
        ${tile({ icon: 'box', label: t('Per delivered order', 'প্রতি ডেলিভারি অর্ডারে'), value: tk(share), sub: t(`About ${delFc} deliveries this month at this pace. More orders = smaller share.`, `এই গতিতে এই মাসে প্রায় ${delFc}টি ডেলিভারি। অর্ডার বাড়লে ভাগ কমে।`) })}
        ${tile({ icon: 'customers', label: t('Salaries still to pay', 'বাকি বেতন'), value: tk(dueAmt), tone: late.length ? 'bad' : due.length ? 'warn' : '', sub: due.length ? t(`${due.length} person(s)${late.length ? `, ${late.length} late` : ''}`, `${due.length} জন${late.length ? `, ${late.length} জনের দেরি` : ''}`) : t('Everyone is paid ✓', 'সবাই পেয়েছেন ✓'), extra: due.length ? `<button class="btn sm primary" id="fx-payall" style="align-self:flex-start">${t('Pay all due', 'সব বাকি দিন')}</button>` : '' })}
        ${tile({ icon: 'reports', label: t('Last 6 months', 'গত 6 মাস'), value: `<span style="font-size:15px">${tk(tr[0].all)} → ${tk(T.all)}</span>`, sub: A.chart.spark(tr.map((x) => x.all), 'var(--c1)') })}
      </div>
      ${U.callout(t('These are the shop\'s own staff and costs. ERP staff are paid by the ERP payroll and never appear here. Every amount goes into Profit & loss (fixed costs) and the Overview forecast.', 'এগুলো দোকানের নিজের স্টাফ ও খরচ। ERP এর স্টাফ ERP এর বেতন থেকে পান, এখানে কখনো আসবে না। প্রতিটা পরিমাণ লাভ-ক্ষতি (মাসিক খরচ) ও Overview এর পূর্বাভাসে যায়।'), 'info', 'info')}
      <div style="height:12px"></div>
      ${U.card(t('Salaries', 'বেতন') + ' · ' + monLabel(CUR_YM), salT + `<div class="row between small" style="margin-top:8px;flex-wrap:wrap;gap:6px"><button class="btn sm" id="fx-addst">${A.icon('plus', 16)} ${t('Add staff', 'স্টাফ যোগ')}</button><span><span class="muted">${t('Salary cost this month (with bonus and deductions)', 'এই মাসের বেতন খরচ (বোনাস ও কর্তনসহ)')}</span> <b>${tk(T.sal)}</b></span></div>`, { more: '', sub: t('Tap ✎ for advance, bonus, deductions, a salary change and its history. Paying needs your PIN.', '✎ চাপলে অ্যাডভান্স, বোনাস, কর্তন, বেতন বদল ও হিস্টরি। পেমেন্টে PIN লাগবে।') })}
      <div style="height:12px"></div>
      <div class="grid fn-g32" style="align-items:start">
        ${U.card(t('Other fixed costs', 'অন্যান্য মাসিক খরচ'), headT + `<div class="row between" style="margin-top:8px;flex-wrap:wrap;gap:6px"><button class="btn sm" id="fx-addh">${A.icon('plus', 16)} ${t('Add cost head', 'খাত যোগ করুন')}</button><span class="small">${t('Total per month', 'মাসে মোট')} <b>${tk(T.oth)}</b></span></div>`, { sub: t('They record themselves on their day. A change asks "from which month?" and keeps the old amount for past months.', 'নিজের তারিখে নিজে রেকর্ড হয়। বদলালে "কোন মাস থেকে?" জিজ্ঞেস করে, আগের মাসে পুরনো পরিমাণ থাকে।') })}
        ${U.card(t('6-month trend', '6 মাসের ট্রেন্ড'), A.chart.columns({ labels: months.map((ym) => monLabel(ym).split(' ')[0].slice(0, 3)), values: tr.map((x) => x.sal), values2: tr.map((x) => x.oth), money: true }) + `<div class="small muted" style="margin-top:6px">${t('Dark = salaries, light = other fixed costs.', 'গাঢ় = বেতন, হালকা = অন্যান্য মাসিক খরচ।')}</div>` + (fx.log.length ? `<div style="margin-top:10px">${fx.log.slice(0, 3).map((l) => `<div class="small" style="padding:4px 0;border-top:1px dashed var(--line)">${esc(l.item)}: ${tk(l.old)} → <b>${tk(l.amt)}</b> ${t('from', 'শুরু')} ${monLabel(l.from)} <span class="muted">· ${esc(l.by)}</span></div>`).join('')}</div>` : ''))}
      </div>
      <h3 style="margin:22px 0 10px;font-size:15px">${t('2 · Budgets & other expenses', '2 · বাজেট ও অন্যান্য খরচ')}</h3>`;
    const wire = (el) => {
      el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = () => paySalary([A.byId(fx.staff, b.dataset.pay)])));
      el.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => staffDrawer(A.byId(fx.staff, b.dataset.st))));
      el.querySelectorAll('[data-hc]').forEach((b) => (b.onclick = () => changeAmount('head', A.byId(fx.heads, b.dataset.hc))));
      el.querySelectorAll('[data-hh]').forEach((b) => (b.onclick = () => historyDrawer(A.byId(fx.heads, b.dataset.hh))));
      const pa = el.querySelector('#fx-payall'); if (pa) pa.onclick = () => paySalary(due);
      el.querySelector('#fx-addst').onclick = addStaff; el.querySelector('#fx-addh').onclick = addHead;
    };
    return { html, wire, T };
  }

  /* ================= ERP MONTHLY STATEMENT ================= */
  const ymStart = (ym) => new Date(ym + '-01T00:00:00+06:00').getTime();
  function erpEntries() {
    const out = [];
    for (const o of A.D.orders) {
      if (['shipped', 'delivered', 'returned', 'exchanged'].includes(o.status)) {
        out.push({ d: billDay(o), k: 'bill', amt: C.cogs(o), pcs: C.pieces(o), o });
        if (o.status === 'exchanged') { const a = o.lines[0].cost; const d2 = YMD(Math.min(new Date(o.deliveredAt || o.created).getTime() + 2 * DAY, NOW())); out.push({ d: d2, k: 'exb', amt: a, pcs: 1, o }, { d: d2, k: 'exc', amt: a, pcs: 1, o }); }
      }
      if (o.status === 'returned' && o.returnChecked) out.push({ d: creditDay(o), k: 'cr', amt: o.returnCredit != null ? o.returnCredit : C.cogs(o), pcs: C.pieces(o), o });
    }
    for (const p of A.D.erp.payments) out.push({ d: p.date, k: 'pay', amt: p.amount, p });
    return out;
  }
  const SIGN = { bill: 1, exb: 1, cr: -1, exc: -1, pay: -1 };
  function stmtDiffs(ym) {
    const f = store(); f.stmt = f.stmt || { pick: {}, grade: {} }; const from = ymStart(ym), to = ymStart(ymAdd(ym, 1));
    const inM = (d) => d >= YMD(from) && d < YMD(to);
    const out = [];
    for (const x of erpMismatch()) {
      const o = A.byId(A.D.orders, x.orderId); if (!o) continue; const d = x.id === 'EM1' ? creditDay(o) : YMD(Math.min(new Date(o.deliveredAt || o.created).getTime() + 2 * DAY, NOW()));
      out.push({ id: x.id, d, k: x.id === 'EM1' ? 'cr' : 'exb', erpAdj: x.id === 'EM1' ? x.diff : x.diff, text: x.text, todo: x.id === 'EM1' ? t('The ERP decides returns. If its check passed the piece, ask it to post the credit; if it failed, accept its figure.', 'রিটার্নের সিদ্ধান্ত ERP এর। চেকে পাস হলে ক্রেডিট দিতে বলুন; ফেল হলে ERP এর হিসাব মেনে নিন।') : t('Ask the ERP to remove the extra bill.', 'বাড়তি বিলটা বাদ দিতে ERP কে বলুন।'), open: x.st === 'open', st: x.st, src: 'em' });
    }
    if (f.stmt.pick[ym] === undefined) { const c = erpEntries().filter((e) => e.k === 'cr' && inM(e.d) && e.o.returnCredit == null && !erpMismatch().some((m) => m.orderId === e.o.id)).sort((a, b) => a.o.id.localeCompare(b.o.id))[0]; f.stmt.pick[ym] = c ? c.o.id : null; }
    const gid = f.stmt.pick[ym];
    if (gid) { const o = A.byId(A.D.orders, gid); if (o) { const full = C.cogs(o); const diff = Math.round(full * 0.4 / 10) * 10; const st = f.stmt.grade[gid] || 'open'; out.push({ id: 'GR-' + gid, oid: gid, d: creditDay(o), k: 'cr', erpAdj: st === 'accepted' ? 0 : diff, diff, text: t(`Return ${gid}: the ERP graded it B-grade and credited ${tk(full - diff)}, we credited ${tk(full)}`, `রিটার্ন ${gid}: ERP B-গ্রেড ধরে ক্রেডিট দিয়েছে ${tk(full - diff)}, আমরা ধরেছি ${tk(full)}`), todo: t('The ERP is master for returns. Accept its grade (our books follow), or ask it to check the piece again.', 'রিটার্নে ERP ই চূড়ান্ত। ওর গ্রেড মেনে নিন (আমাদের হিসাব মিলিয়ে নেবে), নয়তো আবার চেক করতে বলুন।'), open: st !== 'accepted', st, src: 'gr' }); } }
    return out.map((x) => ({ ...x, cur: inM(x.d), before: x.d < YMD(from) }));
  }
  function stmtCalc(ym) {
    const from = ymStart(ym), to = Math.min(ymStart(ymAdd(ym, 1)), NOW() + DAY); const F = YMD(from), Tt = YMD(to);
    const es = erpEntries(); const diffs = stmtDiffs(ym);
    const open = es.filter((e) => e.d < F).reduce((s, e) => s + SIGN[e.k] * e.amt, 0);
    const mine = es.filter((e) => e.d >= F && e.d < Tt);
    const sumK = (k) => A.sum(mine.filter((e) => e.k === k), (e) => e.amt); const cnt = (k) => A.sum(mine.filter((e) => e.k === k), (e) => e.pcs || 1);
    const adj = (k, when) => A.sum(diffs.filter((x) => x.open && x.k === k && when(x)), (x) => x.erpAdj);
    const openAdj = adj('exb', (x) => x.before) - adj('cr', (x) => x.before);
    const L = [
      ['open', t('Opening balance', 'শুরুর বাকি'), open, open + openAdj, '', 0],
      ['bill', t(`Bills · ${cnt('bill')} pieces sent (shop price)`, `বিল · ${cnt('bill')} পিস পাঠানো (দোকানের দাম)`), sumK('bill'), sumK('bill'), '+', 1],
      ['cr', t(`Approved-return credits · ${cnt('cr')} pieces`, `অ্যাপ্রুভড রিটার্ন ক্রেডিট · ${cnt('cr')} পিস`), sumK('cr'), sumK('cr') - adj('cr', (x) => x.cur), '−', -1],
      ['exb', t(`Exchange bills · ${cnt('exb')} new pieces`, `এক্সচেঞ্জ বিল · ${cnt('exb')} নতুন পিস`), sumK('exb'), sumK('exb') + adj('exb', (x) => x.cur), '+', 1],
      ['exc', t(`Exchange credits · ${cnt('exc')} old pieces back`, `এক্সচেঞ্জ ক্রেডিট · ${cnt('exc')} পুরনো পিস ফেরত`), sumK('exc'), sumK('exc'), '−', -1],
      ['pay', t(`Payments · ${mine.filter((e) => e.k === 'pay').length}`, `পেমেন্ট · ${mine.filter((e) => e.k === 'pay').length}টি`), sumK('pay'), sumK('pay'), '−', -1],
    ];
    const close = (i) => L.reduce((s, l) => s + (l[5] === 0 ? l[i] : l[5] * l[i]), 0);
    L.push(['close', t('Closing balance', 'শেষের বাকি'), close(2), close(3), '', 0]);
    const byDay = A.groupBy(mine, (e) => e.d); let run = open;
    const days = Object.keys(byDay).sort().map((d) => { const g = byDay[d]; const v = (k) => A.sum(g.filter((e) => e.k === k), (e) => e.amt); const r = { _id: d, d, bill: v('bill'), cr: v('cr'), ex: v('exb') - v('exc'), pay: v('pay') }; run += r.bill - r.cr + r.ex - r.pay; r.bal = run; return r; });
    return { L, days, diffs: diffs.filter((x) => x.cur || (x.before && x.open)), last: to <= NOW() ? YMD(to - DAY) : TODAY() };
  }
  const STMT_MONTHS = () => [ymAdd(CUR_YM, -2), ymAdd(CUR_YM, -1), CUR_YM];
  function pickStatement() {
    let sel = ymAdd(CUR_YM, -1);
    const m = U.modal(t('Monthly statement', 'মাসিক স্টেটমেন্ট'), `<div class="stack"><div class="small muted">${t('Pick the month. The statement compares our books with what the ERP says, line by line.', 'মাস বেছে নিন। স্টেটমেন্ট আমাদের হিসাব আর ERP এর হিসাব লাইন ধরে মিলিয়ে দেখাবে।')}</div>${U.seg('st-m', STMT_MONTHS().map((ym) => [ym, monLabel(ym) + (ym === CUR_YM ? t(' (so far)', ' (এখন পর্যন্ত)') : '')]), sel)}</div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="st-go">${t('Make statement', 'স্টেটমেন্ট তৈরি করুন')}</button>` });
    m.querySelectorAll('#st-m button').forEach((b) => (b.onclick = () => { sel = b.dataset.v; m.querySelectorAll('#st-m button').forEach((x) => x.classList.toggle('on', x === b)); }));
    m.querySelector('#st-go').onclick = () => { U.close(); A.go('finance', 'erp', 'stmt-' + sel); };
  }
  function statement(el, ym) {
    if (!STMT_MONTHS().includes(ym)) ym = ymAdd(CUR_YM, -1);
    const f = store(); const S = stmtCalc(ym); const openD = S.diffs.filter((x) => x.open);
    const gap = S.L[S.L.length - 1][3] - S.L[S.L.length - 1][2]; const name = monLabel(ym);
    const ok = (l) => Math.round(l[2]) === Math.round(l[3]);
    el.innerHTML = A.pageHead(t('ERP statement', 'ERP স্টেটমেন্ট') + ' · ' + name, t(`1 ${name.split(' ')[0]} to ${dshort(S.last)} · the shop as a buyer of the ERP`, `1 তারিখ থেকে ${dshort(S.last)} · ERP এর ক্রেতা হিসেবে দোকান`), `<a class="btn" href="${A.href('finance', 'erp')}">← ${t('ERP account', 'ERP হিসাব')}</a>${U.seg('st-mm', STMT_MONTHS().map((x) => [x, monLabel(x).split(' ')[0]]), ym)}<button class="btn" id="st-x">${t('Excel', 'Excel')}</button><button class="btn" id="st-p">PDF</button><button class="btn primary" id="st-pr">${A.icon('print', 16)} ${t('Print', 'প্রিন্ট')}</button>`) + A.tabsBar('finance', 'erp') +
      (openD.length ? U.callout(t(`<b>${openD.length} line(s) differ.</b> Closing: our books ${tk(S.L[6][2])} · ERP says ${tk(S.L[6][3])} · ${tk(Math.abs(gap))} apart. Fix the list below so both ledgers agree.`, `<b>${openD.length}টি লাইন মিলছে না।</b> শেষের বাকি: আমাদের হিসাব ${tk(S.L[6][2])} · ERP বলছে ${tk(S.L[6][3])} · ${tk(Math.abs(gap))} পার্থক্য। নিচের তালিকা ঠিক করলে দুই হিসাব মিলবে।`), 'bad', 'warn') : U.callout(t(`<b>Both ledgers agree ✓</b> Closing balance ${tk(S.L[6][2])} on both sides.`, `<b>দুই হিসাব মিলেছে ✓</b> দুই দিকেই শেষের বাকি ${tk(S.L[6][2])}।`), 'good', 'check')) +
      `<div style="height:12px"></div><div class="grid fn-g32" style="align-items:start">
        ${U.card(t('Statement', 'স্টেটমেন্ট'), `<div class="tbl-wrap"><table class="tbl fn-pl fn-st"><thead><tr><th>${t('Line', 'লাইন')}</th><th class="r">${t('Our books', 'আমাদের হিসাব')}</th><th class="r">${t('ERP says', 'ERP বলছে')}</th><th class="r">✓</th></tr></thead><tbody>
          ${S.L.map((l) => `<tr class="${l[0] === 'open' || l[0] === 'close' ? 'sum' : ''}"><td class="lbl ${l[4] ? 'ind' : ''}">${l[4] ? `<span class="muted">${l[4]}</span> ` : ''}${l[1]}</td><td class="r">${tk(l[2])}</td><td class="r" style="${ok(l) ? '' : 'color:var(--bad);font-weight:700'}">${tk(l[3])}</td><td class="r">${ok(l) ? '<span class="fn-in">✓</span>' : '<span class="fn-out">✗</span>'}</td></tr>`).join('')}
          </tbody></table></div><div class="small muted" style="margin-top:8px">${t('Bills at the shop buying price. Credits only for returns the ERP approved. Closing = opening + bills − credits + exchange bills − exchange credits − payments.', 'বিল দোকানের কেনা দামে। ক্রেডিট শুধু ERP অ্যাপ্রুভ করা রিটার্নে। শেষের বাকি = শুরুর বাকি + বিল − ক্রেডিট + এক্সচেঞ্জ বিল − এক্সচেঞ্জ ক্রেডিট − পেমেন্ট।')}</div>`)}
        ${U.card(t('Differences & what to do', 'পার্থক্য ও কী করবেন'), S.diffs.length ? S.diffs.map((x) => `<div class="fn-chk"><span class="ic ${x.open ? 'bad' : 'ok'}">${x.open ? '!' : '✓'}</span><div style="flex:1;min-width:0"><div>${x.text}</div><div class="small muted" style="margin-top:3px">${x.open ? x.todo : x.st === 'fixed' ? t('Fixed — the ERP updated it', 'ঠিক হয়েছে — ERP আপডেট করেছে') : t('Settled — our books follow the ERP', 'মিটে গেছে — আমাদের হিসাব ERP এর মতো')}${x.before ? ' · ' + t('from an earlier month', 'আগের মাসের') : ''}</div>${x.open ? `<div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">${x.src === 'em' ? `<button class="btn sm primary" data-sfix="${x.id}">${t('Send to ERP again', 'আবার ERP তে পাঠান')}</button><button class="btn sm ghost" data-sacc="${x.id}">${t('Accept ERP figure', 'ERP এর হিসাব মেনে নিন')}</button>` : `<button class="btn sm primary" data-gacc="${x.oid}">${t('Accept ERP grade', 'ERP এর গ্রেড মেনে নিন')}</button>${x.st === 'asked' ? U.badge(t('Re-check asked', 'আবার চেক চাওয়া হয়েছে'), 'info') : `<button class="btn sm ghost" data-gask="${x.oid}">${t('Ask ERP to re-check', 'আবার চেক করতে বলুন')}</button>`}`}</div>` : ''}</div></div>`).join('') : U.empty(t('No differences this month.', 'এই মাসে কোনো পার্থক্য নেই।')))}
      </div>
      <div style="height:14px"></div>
      ${U.card(t('Day by day', 'দিন অনুযায়ী'), U.table([
        { h: t('Day', 'দিন'), f: (r) => dshort(r.d) },
        { h: t('Bills', 'বিল'), r: true, f: (r) => (r.bill ? tk(r.bill) : '—') },
        { h: t('Credits', 'ক্রেডিট'), r: true, hide: true, f: (r) => (r.cr ? '−' + tk(r.cr) : '—') },
        { h: t('Exchange', 'এক্সচেঞ্জ'), r: true, hide: true, f: (r) => (r.ex ? tk(r.ex) : '—') },
        { h: t('Payments', 'পেমেন্ট'), r: true, f: (r) => (r.pay ? `<span class="fn-in">−${tk(r.pay)}</span>` : '—') },
        { h: t('Balance', 'বাকি'), r: true, f: (r) => `<b>${tk(r.bal)}</b>` },
      ], S.days), { sub: t('Only days with a bill, credit, exchange or payment.', 'শুধু যে দিনগুলোতে বিল, ক্রেডিট, এক্সচেঞ্জ বা পেমেন্ট আছে।') })}`;
    el.querySelectorAll('#st-mm button').forEach((b) => (b.onclick = () => A.go('finance', 'erp', 'stmt-' + b.dataset.v)));
    const dl = (k) => { const title = t('ERP statement', 'ERP স্টেটমেন্ট') + ' · ' + name; const rows = S.L.map((l) => [l[1], `${tk(l[2])} · ${t('ERP', 'ERP')} ${tk(l[3])} ${ok(l) ? '✓' : '✗'}`, l[0] === 'open' || l[0] === 'close' ? 'sum' : '']); exportDoc(title, rows, openD.length ? openD.map((x) => '• ' + x.text).join('<br>') : t('Both ledgers agree.', 'দুই হিসাব মিলেছে।')); const b = document.querySelector(`[data-x="${k}"]`); if (b) b.focus(); };
    el.querySelector('#st-x').onclick = () => dl('xlsx'); el.querySelector('#st-p').onclick = () => dl('pdf'); el.querySelector('#st-pr').onclick = () => dl('print');
    el.querySelectorAll('[data-sfix]').forEach((x) => (x.onclick = () => { f.erpFix[x.dataset.sfix] = 'fixed'; done('ERP statement line sent again', t('Sent to the ERP. The line matches now.', 'ERP তে পাঠানো হয়েছে। লাইনটা এখন মিলছে।')); }));
    el.querySelectorAll('[data-sacc]').forEach((x) => (x.onclick = () => pinAsk(t('Accept the ERP figure?', 'ERP এর হিসাব মেনে নেবেন?'), `<p>${t('Our books get an adjusting entry so they match the ERP.', 'আমাদের হিসাবে একটা অ্যাডজাস্টিং এন্ট্রি দিয়ে ERP এর সাথে মেলানো হবে।')}</p>`, t('Accept', 'মেনে নিন'), () => { f.erpFix[x.dataset.sacc] = 'accepted'; done('ERP figure accepted on statement', t('Accepted and adjusted.', 'মেনে নেওয়া ও অ্যাডজাস্ট হয়েছে।')); })));
    el.querySelectorAll('[data-gacc]').forEach((x) => (x.onclick = () => { const o = A.byId(A.D.orders, x.dataset.gacc); const d = S.diffs.find((y) => y.oid === o.id); pinAsk(t('Accept the ERP grade?', 'ERP এর গ্রেড মেনে নেবেন?'), `<p>${o.id}: ${t('credit', 'ক্রেডিট')} ${tk(C.cogs(o))} → <b>${tk(C.cogs(o) - d.diff)}</b></p><p class="small muted">${t('The piece moves to B-grade stock. The ERP balance goes up by the difference.', 'পিসটা B-গ্রেড স্টকে যাবে। ERP এর বাকি পার্থক্যের সমান বাড়বে।')}</p>`, t('Accept', 'মেনে নিন'), () => { o.returnCredit = C.cogs(o) - d.diff; f.stmt.grade[o.id] = 'accepted'; (o.timeline = o.timeline || []).push({ t: A.TODAY.toISOString(), text: `Return credit set to ERP grade (B) ${tk(o.returnCredit)}`, by: me() }); done('ERP return grade accepted ' + o.id, t(`Accepted. Credit is ${tk(o.returnCredit)} now; both ledgers match on this line.`, `মেনে নেওয়া হয়েছে। ক্রেডিট এখন ${tk(o.returnCredit)}; এই লাইন দুই দিকে মিলছে।`)); }); }));
    el.querySelectorAll('[data-gask]').forEach((x) => (x.onclick = () => { f.stmt.grade[x.dataset.gask] = 'asked'; done('Asked ERP to re-check return ' + x.dataset.gask, t('Re-check request sent to the ERP. You will see its answer here.', 'ERP কে আবার চেক করতে বলা হয়েছে। উত্তর এখানে দেখবেন।')); }));
  }

  /* ================= COURIER RECONCILIATION ================= */
  const RP = () => [['7d', t('Last 7 days', 'গত 7 দিন')], ['15d', t('Last 15 days', 'গত 15 দিন')], ['month', t('This month', 'এই মাস')], ['lastmonth', t('Last month', 'গত মাস')]];
  const rRange = (k) => (k === '7d' ? { from: NOW() - 7 * DAY, to: NOW() + 1 } : k === '15d' ? { from: NOW() - 15 * DAY, to: NOW() + 1 } : C.range(k));
  const RK = () => ({ short: t('COD short', 'COD কম'), nomoney: t('Delivered, no money', 'ডেলিভারি, টাকা নেই'), fee: t('Delivery overcharged', 'ডেলিভারি চার্জ বেশি'), ret: t('Return charge wrong', 'রিটার্ন চার্জ ভুল'), payout: t('Payout missing', 'পেমেন্ট আসেনি'), never: t('Not in courier list', 'কুরিয়ারের তালিকায় নেই') });
  function reconRun(cid, pk) {
    const r = rRange(pk); const out = []; let matched = 0;
    const ps = A.D.orders.filter((o) => o.courier && (cid === 'all' || o.courier === cid) && ['shipped', 'delivered', 'returned', 'exchanged'].includes(o.status) && C.inRange(o.created, r.from, r.to));
    for (const o of ps) {
      const n = Number(String(o.id).replace(/\D/g, '')); const fee = C.courierFee(o); const del = C.isDelivered(o); const cod = o.payment === 'COD' && del ? o.total : 0; const cr = A.byId(A.D.couriers, o.courier) || { returnPct: 50 };
      const items = []; const mi = misItem(o);
      if (o.status === 'shipped' && n % 4 === 1) items.push({ k: 'never', ours: fee, theirs: 0, diff: 0 });
      if (mi && mi.kind === 'missing') items.push({ k: 'nomoney', ours: cod, theirs: 0, diff: cod });
      else if (cod && o.settled && n % 37 === 5) { const s = 50 + (n % 4) * 50; items.push({ k: 'short', ours: cod, theirs: cod - s, diff: s }); }
      if (mi && mi.kind === 'fee') items.push({ k: 'fee', ours: fee, theirs: fee + 20, diff: 20 });
      if (o.status === 'returned' && n % 5 === 1) { const ours = Math.round(fee * (cr.returnPct || 50) / 100); items.push({ k: 'ret', ours, theirs: fee, diff: fee - ours }); }
      if (cod && !o.settled && o.deliveredAt && daysSince(o.deliveredAt) >= 2) items.push({ k: 'payout', ours: payout(o), theirs: 0, diff: payout(o) });
      if (!items.length) matched++; items.forEach((x) => out.push({ ...x, o, key: o.id + '|' + x.k }));
    }
    const f = store(); f.recSt = f.recSt || {};
    const RT = { short: 'short_cod', nomoney: 'short_cod', payout: 'short_cod', fee: 'rider', ret: 'return_short', never: 'lost' };
    out.forEach((x) => { const s = f.recSt[x.key] || {}; x.ctype = RT[x.k]; x.st = claimOf(x.o.id, x.ctype) ? 'claim' : (s.st && s.st !== 'claim' ? s.st : 'open'); x.note = s.note || ''; });
    const S = (k) => A.sum(out.filter((x) => x.k === k), (x) => x.diff);
    return { parcels: ps.length, matched, rows: out, short: S('short'), over: S('fee') + S('ret'), payout: S('payout'), nomoney: out.filter((x) => x.k === 'nomoney'), never: out.filter((x) => x.k === 'never'), r };
  }
  function reconCard() {
    const f = store(); const L = f.recon || { cid: 'all', pk: 'month', src: 'pull', at: new Date(NOW() - 11 * 36e5).toISOString() }; const R = reconRun(L.cid, L.pk); const open = R.rows.filter((x) => x.st === 'open');
    return U.card(t('Match courier account', 'কুরিয়ারের হিসাব মেলান'), `<div class="small muted" style="margin-bottom:8px">${t(`Last match: ${L.cid === 'all' ? 'all couriers' : cname(L.cid)} · ${RP().find((p) => p[0] === L.pk)[1]} · ${A.fmt.ago(L.at)}`, `শেষ মিলানো: ${L.cid === 'all' ? 'সব কুরিয়ার' : cname(L.cid)} · ${RP().find((p) => p[0] === L.pk)[1]} · ${A.fmt.ago(L.at)}`)}</div>
      <div class="fn-mini" style="margin-bottom:10px"><span>${t('Matched', 'মিলেছে')} <b>${R.matched}/${R.parcels}</b></span><span>${t('Short', 'কম')} <b class="fn-out">${tk(R.short)}</b></span><span>${t('Overcharged', 'বেশি কেটেছে')} <b class="fn-out">${tk(R.over)}</b></span><span>${t('Payout missing', 'পেমেন্ট আসেনি')} <b class="fn-out">${tk(R.payout)}</b></span></div>
      <div class="row between" style="gap:8px;flex-wrap:wrap">${open.length ? U.badge(open.length + t(' to check', 'টি দেখতে হবে'), 'bad') : U.badge(t('All matched', 'সব মিলেছে'), 'good')}<a class="btn primary sm" href="${A.href('finance', 'cash', 'match')}">${t('Match courier account', 'কুরিয়ারের হিসাব মেলান')}</a></div>`, { id: 'fn-match', sub: t('One click checks every parcel: COD, delivery charge, return charge and payouts.', 'এক ক্লিকে প্রতিটা পার্সেল চেক: COD, ডেলিভারি চার্জ, রিটার্ন চার্জ ও পেমেন্ট।') });
  }
  let rcCid = null, rcPk = null, rcSrc = null, rcFile = '', rcF = 'open';
  function recon(el) {
    const f = store(); const L = (f.recon = f.recon || { cid: 'all', pk: 'month', src: 'pull', at: new Date(NOW() - 11 * 36e5).toISOString() });
    rcCid = rcCid || L.cid; rcPk = rcPk || L.pk; rcSrc = rcSrc || L.src;
    const R = reconRun(L.cid, L.pk); const K = RK(); const c = A.byId(A.D.couriers, rcCid);
    const rows = R.rows.filter((x) => (rcF === 'all' ? true : rcF === 'open' ? x.st === 'open' : x.st !== 'open'));
    el.innerHTML = A.pageHead(t('Match courier account', 'কুরিয়ারের হিসাব মেলান'), t('Our parcels vs the courier\'s statement, parcel by parcel.', 'আমাদের পার্সেল বনাম কুরিয়ারের স্টেটমেন্ট, পার্সেল ধরে ধরে।'), `<a class="btn" href="${A.href('finance', 'cash')}">← ${t('Money in & out', 'টাকার আসা-যাওয়া')}</a><button class="btn" id="rc-x">${t('Excel', 'Excel')}</button><button class="btn" id="rc-p">PDF</button>`) + A.tabsBar('finance', 'cash') +
      U.card(t('What to match', 'কী মেলাবেন'), `<div class="formgrid">${U.field(t('Courier', 'কুরিয়ার'), U.select('rc-c', [['all', t('All couriers', 'সব কুরিয়ার')]].concat(A.D.couriers.map((x) => [x.id, x.name])), rcCid))}
        ${U.field(t('Period', 'সময়'), U.seg('rc-pk', RP(), rcPk))}
        ${U.field(t('Courier statement', 'কুরিয়ারের স্টেটমেন্ট'), U.seg('rc-src', [['pull', t('Pull from courier', 'কুরিয়ার থেকে আনুন')], ['csv', t('Upload CSV', 'CSV আপলোড')]], rcSrc) + (rcSrc === 'csv' ? `<div class="fn-rcpt ${rcFile ? 'on' : ''}" id="rc-file" style="height:54px;margin-top:8px">${rcFile ? '✓ ' + esc(rcFile) : t('Tap to choose the CSV file', 'CSV ফাইল বাছতে চাপুন')}</div>` : c && !c.connected && rcCid !== 'all' ? `<div class="small" style="color:var(--warn);margin-top:6px">${t(`${c.name} is not connected. Upload its CSV instead.`, `${c.name} কানেক্ট করা নেই। এর CSV আপলোড করুন।`)}</div>` : ''))}</div>
        <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap"><button class="btn primary" id="rc-go">${A.icon('sync', 16)} ${t('Match now', 'এখন মেলান')}</button><span class="small muted">${t(`Last run ${A.fmt.ago(L.at)} · ${L.src === 'csv' ? 'from ' + esc(L.file || 'CSV') : 'pulled from the courier'}`, `শেষ ${A.fmt.ago(L.at)} · ${L.src === 'csv' ? esc(L.file || 'CSV') + ' থেকে' : 'কুরিয়ার থেকে আনা'}`)}</span></div>`) +
      `<div style="height:14px"></div><div class="fn-tiles" style="margin-bottom:14px">
        ${tile({ icon: 'check', label: t('Matched parcels', 'মিলেছে'), value: `${R.matched} / ${R.parcels}`, sub: t(`${L.cid === 'all' ? 'All couriers' : cname(L.cid)} · ${RP().find((p) => p[0] === L.pk)[1]}`, `${L.cid === 'all' ? 'সব কুরিয়ার' : cname(L.cid)} · ${RP().find((p) => p[0] === L.pk)[1]}`) })}
        ${tile({ icon: 'warn', label: t('COD short', 'COD কম'), value: `<span class="fn-out">${tk(R.short + A.sum(R.nomoney, (x) => x.diff))}</span>`, tone: R.short ? 'warn' : '', sub: t(`Less collected than expected · ${R.nomoney.length} delivered without money (${tk(A.sum(R.nomoney, (x) => x.diff))})`, `যা আসার কথা তার চেয়ে কম · ${R.nomoney.length}টি ডেলিভারি কিন্তু টাকা নেই (${tk(A.sum(R.nomoney, (x) => x.diff))})`) })}
        ${tile({ icon: 'truck', label: t('Overcharged', 'বেশি কেটেছে'), value: `<span class="fn-out">${tk(R.over)}</span>`, tone: R.over ? 'warn' : '', sub: t('Delivery and return charges above the rate card', 'রেট কার্ডের চেয়ে বেশি ডেলিভারি ও রিটার্ন চার্জ') })}
        ${tile({ icon: 'finance', label: t('Payout missing', 'পেমেন্ট আসেনি'), value: `<span class="fn-out">${tk(R.payout)}</span>`, tone: R.payout ? 'bad' : '', sub: t(`Delivered 2+ days ago, not paid yet · ${R.never.length} parcel(s) the courier never entered`, `2+ দিন আগে ডেলিভারি, পেমেন্ট আসেনি · ${R.never.length}টি পার্সেল কুরিয়ার এন্ট্রিই করেনি`) })}
      </div>` +
      U.card(t('Mismatches', 'অমিল'), `<div class="chips" style="margin-bottom:10px">${[['open', t('To check', 'দেখতে হবে')], ['done', t('Claimed or resolved', 'ক্লেইম বা মিটে গেছে')], ['all', t('All', 'সব')]].map((x) => `<button class="chip ${rcF === x[0] ? 'on' : ''}" data-rf="${x[0]}">${x[1]}</button>`).join('')}</div>` + (rows.length ? U.table([
        { h: t('Parcel', 'পার্সেল'), f: (x) => `<a href="${A.href('orders', 'all', x.o.id)}">${x.o.id}</a><div class="small muted">${cname(x.o.courier)} · ${dshort(x.o.created)}</div>` },
        { h: t('Problem', 'সমস্যা'), f: (x) => `${U.badge(K[x.k], x.k === 'never' || x.k === 'payout' ? 'warn' : 'bad')}${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}` },
        { h: t('We expected', 'আমাদের হিসাব'), r: true, hide: true, f: (x) => tk(x.ours) },
        { h: t('Courier says', 'কুরিয়ার বলছে'), r: true, hide: true, f: (x) => (x.k === 'never' ? t('not listed', 'তালিকায় নেই') : tk(x.theirs)) },
        { h: t('Difference', 'পার্থক্য'), r: true, f: (x) => (x.diff ? `<b class="fn-out">${tk(x.diff)}</b>` : '—') },
        { h: '', r: true, f: (x) => (x.st === 'open' ? `<button class="btn sm primary" data-rclaim="${x.key}">${t('Raise claim', 'ক্লেইম করুন')}</button> <button class="btn sm ghost" data-rres="${x.key}">${t('Mark resolved', 'মিটে গেছে')}</button>` : U.badge(x.st === 'claim' ? t('Claim raised', 'ক্লেইম করা হয়েছে') : t('Resolved', 'মিটে গেছে'), x.st === 'claim' ? 'info' : 'good')) },
      ], rows) : U.empty(rcF === 'open' ? t('Nothing to check. Every parcel matches ✓', 'দেখার কিছু নেই। সব পার্সেল মিলেছে ✓') : t('Nothing here yet.', 'এখানে এখনো কিছু নেই।'))), { sub: t('A claim goes to the courier and comes off their next payout. "Mark resolved" needs a short note.', 'ক্লেইম কুরিয়ারের কাছে যায়, পরের পেমেন্ট থেকে কাটা যায়। "মিটে গেছে" দিতে ছোট নোট লাগবে।') });
    el.querySelector('#rc-c').onchange = (e) => { rcCid = e.target.value; A.render(); };
    el.querySelectorAll('#rc-pk button').forEach((b) => (b.onclick = () => { rcPk = b.dataset.v; A.render(); }));
    el.querySelectorAll('#rc-src button').forEach((b) => (b.onclick = () => { rcSrc = b.dataset.v; A.render(); }));
    const fl = el.querySelector('#rc-file'); if (fl) fl.onclick = () => { rcFile = (rcCid === 'all' ? 'courier' : rcCid) + '-statement-' + YMD(NOW()) + '.csv'; A.render(); };
    el.querySelectorAll('[data-rf]').forEach((b) => (b.onclick = () => { rcF = b.dataset.rf; A.render(); }));
    el.querySelector('#rc-go').onclick = () => {
      if (rcSrc === 'csv' && !rcFile) return A.toast(t('Choose the CSV file first', 'আগে CSV ফাইল বেছে নিন'), 'bad');
      if (rcSrc === 'pull' && c && !c.connected && rcCid !== 'all') return A.toast(t(`${c.name} is not connected. Upload its CSV.`, `${c.name} কানেক্ট নেই। CSV আপলোড করুন।`), 'bad');
      f.recon = { cid: rcCid, pk: rcPk, src: rcSrc, file: rcFile, at: A.TODAY.toISOString() }; const R2 = reconRun(rcCid, rcPk);
      done('Courier account matched ' + rcCid + ' ' + rcPk, t(`${R2.parcels} parcels checked: ${R2.matched} matched, ${R2.rows.filter((x) => x.st === 'open').length} to check.`, `${R2.parcels}টি পার্সেল চেক: ${R2.matched}টি মিলেছে, ${R2.rows.filter((x) => x.st === 'open').length}টি দেখতে হবে।`));
    };
    const exp = (k) => { exportDoc(t('Courier match', 'কুরিয়ার মিলানো') + ' · ' + (L.cid === 'all' ? t('All couriers', 'সব কুরিয়ার') : cname(L.cid)), [[t('Parcels checked', 'চেক করা পার্সেল'), R.parcels], [t('Matched', 'মিলেছে'), R.matched], [t('COD short', 'COD কম'), tk(R.short)], [t('Delivered without money', 'ডেলিভারি, টাকা নেই'), `${R.nomoney.length} · ${tk(A.sum(R.nomoney, (x) => x.diff))}`], [t('Overcharged', 'বেশি কেটেছে'), tk(R.over)], [t('Payout missing', 'পেমেন্ট আসেনি'), tk(R.payout)], [t('Never entered by courier', 'কুরিয়ার এন্ট্রি করেনি'), R.never.length]].concat(R.rows.slice(0, 10).map((x) => [x.o.id + ' · ' + K[x.k], x.diff ? tk(x.diff) : '—'])), t(`${R.rows.length} mismatch lines in the file.`, `ফাইলে ${R.rows.length}টি অমিল।`)); };
    el.querySelector('#rc-x').onclick = () => exp('xlsx'); el.querySelector('#rc-p').onclick = () => exp('pdf');
    const setSt = (key, st, note) => { f.recSt = f.recSt || {}; f.recSt[key] = { st, note, at: A.TODAY.toISOString(), by: me() }; const [oid, k] = key.split('|'); if ((k === 'fee' || k === 'nomoney') && st !== 'claim') f.match[oid] = 'accepted'; };
    el.querySelectorAll('[data-rclaim]').forEach((b) => (b.onclick = () => { const x = R.rows.find((y) => y.key === b.dataset.rclaim); raiseClaim(x.o, x.ctype, x.diff || x.ours || 0, K[x.k]); done('Courier claim ' + x.key, t(`Claim for ${x.o.id} sent to ${cname(x.o.courier)}${x.diff ? ' · ' + tk(x.diff) : ''}.`, `${x.o.id} এর ক্লেইম ${cname(x.o.courier)} কে পাঠানো হয়েছে${x.diff ? ' · ' + tk(x.diff) : ''}। একটাই ক্লেইম তালিকায় আছে।`)); }));
    el.querySelectorAll('[data-rres]').forEach((b) => (b.onclick = () => {
      const x = R.rows.find((y) => y.key === b.dataset.rres);
      const m = U.modal(t('Mark resolved', 'মিটে গেছে'), `<div class="stack"><div>${x.o.id} · ${K[x.k]}</div>${U.field(t('Note (what happened)', 'নোট (কী হয়েছিল)'), U.input('rr-n', '', `placeholder="${t('e.g. Paid in the next payout', 'যেমন পরের পেমেন্টে দিয়েছে')}"`))}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="rr-ok">${t('Mark resolved', 'মিটে গেছে')}</button>` });
      m.querySelector('#rr-ok').onclick = () => { const n = val(m, 'rr-n'); if (!n) return A.toast(t('Write a short note', 'ছোট একটা নোট লিখুন'), 'bad'); U.close(); setSt(x.key, 'resolved', n); done('Courier mismatch resolved ' + x.key, t('Marked resolved with your note.', 'আপনার নোটসহ মিটে গেছে হিসেবে রাখা হয়েছে।')); };
    }));
  }

  A.mod('finance', {
    overview: { render: overview, guide: G('Where your money is right now (in hand, with couriers, owed to the ERP, customer wallets), this month\'s profit so far, the next 14 days of cash and what to decide today.', 'আপনার টাকা এখন কোথায় (হাতে, কুরিয়ারের কাছে, ERP পাবে, কাস্টমার ওয়ালেট), এই মাসে এখন পর্যন্ত লাভ, আগামী 14 দিনের টাকা ও আজকের সিদ্ধান্ত।',
      'Example: Pathao holds ৳1.2 lakh, the ERP payment is due and salaries come on the 5th. One look tells you which to chase first.', 'উদাহরণ: পাঠাওয়ের কাছে ৳1.2 লাখ, ERP পেমেন্টের সময় হয়েছে, 5 তারিখে বেতন। এক নজরে বুঝবেন আগে কোনটা ধরবেন।',
      ['Start with the Profit snapshot: Today, Last 7 days and This month. Tap a number to open Profit & loss for that period.', 'Read the four tiles below it.', 'Open Courier 360 from the courier money card to chase a payout or a claim.', 'Check the tightest day in the cash forecast.', 'Press the one button on each "Decide today" card.', 'Use "Targets" to set your monthly sales, profit and ads limit.'], ['শুরুতে “লাভের সারসংক্ষেপ” দেখুন: আজ, গত 7 দিন ও এই মাস। যেকোনো সংখ্যায় চাপলে ওই সময়ের লাভ-ক্ষতি খুলবে।', 'নিচের 4টা টাইল দেখুন।', 'পেআউট বা ক্লেইমের জন্য কুরিয়ারের টাকার কার্ড থেকে কুরিয়ার 360 খুলুন।', 'টাকার পূর্বাভাসে সবচেয়ে টাইট দিন দেখুন।', '"আজকের সিদ্ধান্ত" কার্ডের বোতাম চাপুন।', '"টার্গেট" থেকে মাসের বিক্রি, লাভ ও বিজ্ঞাপনের সীমা ঠিক করুন।']) },
    cash: { render: (el, r) => (r && r.id === 'match' ? recon(el) : cash(el)), guide: G('Every movement of money: courier payouts, online payments, refunds, expenses, ad bills, ERP payments and money the owner put in or took.', 'টাকার প্রতিটা আসা-যাওয়া: কুরিয়ার পেমেন্ট, অনলাইন পেমেন্ট, রিফান্ড, খরচ, বিজ্ঞাপন বিল, ERP পেমেন্ট আর মালিকের দেওয়া-নেওয়া।',
      'Example: Steadfast paid ৳20 less on one parcel. Auto-match finds it, you press Claim, it comes off their next payout.', 'উদাহরণ: স্টেডফাস্ট এক পার্সেলে ৳20 কম দিয়েছে। অটো মিলানো এটা ধরে, আপনি ক্লেইম চাপেন, পরের পেমেন্টে কাটা যায়।',
      ['Tap an account to see only its movements.', 'Fix the "Not matching" list first.', 'Use "Record money" (Owner or Accounts, with PIN) for money you put in or took.'], ['শুধু একটা অ্যাকাউন্টের লেনদেন দেখতে সেটা চাপুন।', 'আগে "মিলছে না" লিস্ট ঠিক করুন।', 'নিজের দেওয়া-নেওয়া টাকা "টাকা রেকর্ড" দিয়ে লিখুন (মালিক বা অ্যাকাউন্টস, PIN লাগবে)।']) },
    pnl: { render: pnlPage, guide: G('The profit and loss statement line by line, this month next to last month, profit by channel, category, style and product, one average order, and closing the month.', 'লাইন ধরে লাভ-ক্ষতি, এই মাস ও গত মাস পাশাপাশি, চ্যানেল, ক্যাটাগরি, স্টাইল ও প্রোডাক্ট অনুযায়ী লাভ, একটা গড় অর্ডার, আর মাস বন্ধ করা।',
      'Example: polo sells the most but the Jersey Zip Polo makes 9% margin. The drill-down shows it in three clicks.', 'উদাহরণ: পোলো বেশি বিক্রি হয়, কিন্তু জার্সি জিপ পোলোর মার্জিন 9%। তিন ক্লিকে ড্রিল-ডাউনে দেখা যায়।',
      ['Pick the period at the top (Today, Last 7 days, This month, Last month or 30 days).', 'Click rows to go deeper.', 'After all checks are green, close last month with your PIN; it locks and goes to the ERP.'], ['ওপর থেকে সময় বেছে নিন (আজ, গত 7 দিন, এই মাস, গত মাস বা 30 দিন)।', 'গভীরে যেতে সারিতে ক্লিক করুন।', 'সব চেক সবুজ হলে PIN দিয়ে গত মাস বন্ধ করুন; লক হয়ে ERP তে যাবে।']) },
    costs: { render: costs, guide: G('Fixed monthly costs that record themselves, other expenses with receipt photos, ad spend imported in dollars, and budgets per category.', 'নিজে রেকর্ড হওয়া মাসিক খরচ, রসিদসহ অন্যান্য খরচ, ডলারে আসা বিজ্ঞাপন খরচ আর ক্যাটাগরি অনুযায়ী বাজেট।',
      'Example: ad budget ৳1.1 lakh; at this pace you spend ৳1.3 lakh. The bar turns red before it happens.', 'উদাহরণ: বিজ্ঞাপনের বাজেট ৳1.1 লাখ; এই গতিতে খরচ হবে ৳1.3 লাখ। আগেই বার লাল হয়ে যায়।',
      ['Add each expense with its receipt photo.', 'Edit a fixed cost; it counts from next month.', 'Set budgets once; watch the bars.'], ['প্রতিটা খরচ রসিদের ছবিসহ যোগ করুন।', 'মাসিক খরচ এডিট করুন; পরের মাস থেকে ধরা হবে।', 'একবার বাজেট ঠিক করে বারগুলো দেখুন।']) },
    erp: { render: (el, r) => (r && r.id && String(r.id).startsWith('stmt-') ? statement(el, String(r.id).slice(5)) : erp(el)), guide: G('Your running account with the ERP: bills for pieces shipped, credits for approved returns, payments, balance, ageing and the 30-day hold clock.', 'ERP এর সাথে চলতি হিসাব: পাঠানো পিসের বিল, অ্যাপ্রুভড রিটার্নের ক্রেডিট, পেমেন্ট, বাকি, কত দিনের বাকি আর 30 দিনের হোল্ড ঘড়ি।',
      'Example: no payment for 15 days turns the clock yellow; at 30 days the ERP stops new orders until you pay.', 'উদাহরণ: 15 দিন পেমেন্ট না হলে ঘড়ি হলুদ; 30 দিনে পেমেন্ট না হওয়া পর্যন্ত ERP নতুন অর্ডার নেয় না।',
      ['Keep "Books match" green.', 'Watch exchanges at risk.', 'Press "Pay ERP" and enter your PIN.'], ['"হিসাব মিলছে" সবুজ রাখুন।', 'ঝুঁকিতে থাকা এক্সচেঞ্জ দেখুন।', '"ERP কে পেমেন্ট" চেপে PIN দিন।']) },
    wallet: { render: wallet, guide: G('Money we owe customers: wallet balances, exchange credits and refunds of prepaid orders.', 'কাস্টমারদের পাওনা: ওয়ালেট ব্যালেন্স, এক্সচেঞ্জ ক্রেডিট আর আগে পেমেন্ট করা অর্ডারের রিফান্ড।',
      'Example: a customer paid by bKash but the size ran out. You must refund within 72 hours; the clock shows how long is left.', 'উদাহরণ: কাস্টমার বিকাশে পেমেন্ট করেছেন কিন্তু সাইজ শেষ। 72 ঘণ্টার মধ্যে রিফান্ড দিতে হবে; ঘড়িতে বাকি সময় দেখায়।',
      ['Approve waiting refunds with your PIN.', 'Add exchange credits once the old piece passes.', 'Choose whether the Manager may approve too.'], ['বাকি রিফান্ড PIN দিয়ে অ্যাপ্রুভ করুন।', 'পুরনো পিস পাস করলে এক্সচেঞ্জ ক্রেডিট যোগ করুন।', 'ম্যানেজারও অ্যাপ্রুভ করতে পারবে কি না ঠিক করুন।']) },
    vat: { render: vat, guide: G('VAT included in your sales, shown only when VAT is turned on.', 'বিক্রির মধ্যে থাকা ভ্যাট, শুধু ভ্যাট চালু থাকলে দেখায়।', 'Most small online shops are not VAT-registered, so it stays hidden until you need it.', 'বেশিরভাগ ছোট অনলাইন দোকান ভ্যাট নিবন্ধিত নয়, তাই দরকার না হওয়া পর্যন্ত লুকানো থাকে।', ['Turn VAT on in Settings.', 'Set the rate and BIN.', 'Download the monthly VAT figure for your accountant.'], ['সেটিংস থেকে ভ্যাট চালু করুন।', 'হার ও BIN দিন।', 'হিসাবরক্ষকের জন্য মাসের ভ্যাট ডাউনলোড করুন।']) },
  });
})();
