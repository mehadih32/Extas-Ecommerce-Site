/* module rules — Delivery, Payment & COD, Exchange & returns, Discounts & coupons, Order rules, Notice & pop-up.
   Every rule is a simple card: current value · fields · "Customer sees" (text made by the system) · Save (PIN for money) · More options. */
(function () {
  'use strict';
  const A = window.A; const U = A.ui; const t = A.t; const tk = A.fmt.tk; const esc = A.esc;
  const R = () => A.D.rules;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const TODAY = () => A.fmt.ymd(A.TODAY);
  const Z = { inside: ['Inside Dhaka', 'ঢাকার ভেতরে'], sub: ['Dhaka sub-area', 'ঢাকার আশেপাশে'], outside: ['Outside Dhaka', 'ঢাকার বাইরে'] };
  const zn = (z) => t(Z[z][0], Z[z][1]);
  const dshort = (ymd) => (ymd ? A.fmt.date(ymd + 'T12:00:00+06:00') : '');
  const last30 = () => { const r = A.calc.range('30d'); return A.calc.ordersIn(r.from, r.to).filter((o) => o.status !== 'cancelled'); };
  const catName = (id) => { const c = A.byId(A.CATS, id); return c ? t(c.en, c.bn) : id; };
  const catNameBoth = (id) => { const c = A.byId(A.CATS, id); return c ? [c.en, c.bn] : [id, id]; };

  A.css('rules', `
    .rl-card{display:flex;flex-direction:column;gap:14px;scroll-margin-top:80px}
    .rl-card.hl{outline:2px solid var(--accent);outline-offset:2px}
    .rl-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
    .rl-head h3{font-size:16px;margin:0}
    .rl-cur{color:var(--muted);font-size:13px;margin-top:3px}
    .rl-zones{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .rl-zone{border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;background:var(--card2)}
    .rl-zone b{font-size:13.5px}
    .rl-prev{border:1px dashed var(--line2);border-radius:12px;padding:10px 12px;background:var(--card2)}
    .rl-prev-h{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:5px}
    .rl-prev-b .bn{font-family:var(--f-bn);font-size:14.5px;color:var(--ink);line-height:1.5}
    .rl-prev-b .en{font-size:12.5px;color:var(--muted);margin-top:3px}
    .rl-more summary{cursor:pointer;font-weight:600;font-size:13px;color:var(--accent);list-style:none}
    .rl-more summary::-webkit-details-marker{display:none}
    .rl-more[open] summary{margin-bottom:10px}
    .rl-more-b{display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--line);padding-top:12px}
    .rl-sub{font-weight:600;font-size:13px;margin-bottom:6px}
    .rl-hist{display:flex;flex-direction:column;gap:6px}
    .rl-hist .li{padding:6px 0}
    .rl-check{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13.5px}
    .rl-check input[type=checkbox]{width:17px;height:17px;accent-color:var(--accent)}
    .rl-check .money,.rl-check .inp.sm{width:120px}
    .rl-hub{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
    .rl-mini{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--ink);background:var(--card)}
    .rl-mini:hover{border-color:var(--accent)}
    .rl-mini .row{flex-wrap:nowrap}
    .rl-mini b{font-size:14px}
    .rl-mini span.v{font-size:13px;color:var(--ink2)}
    .rl-grp h2{font-size:14px;margin:4px 0 8px;color:var(--ink2);display:flex;gap:6px;align-items:center}
    .rl-grp h2 svg{width:16px;height:16px}
    .rl-rcpt{display:flex;flex-direction:column;gap:0}
    .rl-rcpt .ln{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13.5px}
    .rl-rcpt .ln.tot{font-weight:700;font-size:16px;border-bottom:0;padding-top:10px}
    .rl-rcpt .ln .g{color:var(--good)}
    .rl-bar{background:var(--navy);color:#fff;text-align:center;padding:8px 12px;font-size:13px;border-radius:8px 8px 0 0}
    .rl-shop{border:1px solid var(--line2);border-radius:10px;overflow:hidden}
    .rl-shop .hd{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--card);font-weight:700;letter-spacing:.08em}
    .rl-shop .bd{height:70px;background:linear-gradient(90deg,var(--card2),var(--bg2))}
    .rl-pop{position:relative;height:250px;border:1px solid var(--line2);border-radius:14px;background:var(--bg2);display:grid;place-items:center;overflow:hidden;max-width:300px}
    .rl-pop .box{width:82%;background:var(--card);border-radius:12px;padding:12px;box-shadow:var(--shadow);text-align:center;display:flex;flex-direction:column;gap:8px}
    .rl-pop .img{height:70px;border-radius:8px;background:repeating-linear-gradient(45deg,var(--card2),var(--card2) 8px,var(--bg2) 8px,var(--bg2) 16px);display:grid;place-items:center;color:var(--muted);font-size:12px}
    .rl-lvl{border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:13px;background:var(--card2)}
    .rl-chipcats .chip{cursor:pointer}
    @media (max-width:760px){.rl-zones{grid-template-columns:1fr}}
    .rl-l{display:grid;grid-template-columns:190px minmax(0,1fr) 400px;gap:14px;align-items:start}
    .rl-nav{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:2px;position:sticky;top:70px}
    .rl-nav button{display:flex;justify-content:space-between;align-items:center;gap:8px;font:inherit;font-size:13.5px;font-weight:500;color:var(--ink);background:none;border:0;text-align:left;padding:7px 10px;border-radius:8px;cursor:pointer}
    .rl-nav button span{font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums}
    .rl-nav button.on{background:var(--accent-soft,var(--card2));color:var(--accent);font-weight:600}
    .rl-main{display:flex;flex-direction:column;gap:12px;min-width:0}
    .rl-search{display:flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:0 12px;color:var(--muted)}
    .rl-search svg{width:16px;height:16px;flex:none}
    .rl-search input{flex:1;min-width:0;border:0;background:none;font:inherit;font-size:14px;color:var(--ink);padding:10px 0;outline:none}
    .rl-strip{display:flex;flex-wrap:wrap;gap:8px}
    .rl-sp{font:inherit;font-size:12.5px;font-weight:600;border-radius:999px;padding:4px 11px;border:0;cursor:default}
    button.rl-sp{cursor:pointer}
    .rl-sp.warn{background:var(--warn-bg,var(--card2));color:var(--warn)} .rl-sp.info{background:var(--info-bg,var(--card2));color:var(--info)} .rl-sp.good{background:var(--good-bg,var(--card2));color:var(--good)}
    .rl-grp2{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:12px;scroll-margin-top:80px}
    .rl-grp2 h3{display:flex;align-items:center;gap:6px;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:12px 14px 8px;margin:0}
    .rl-grp2 h3 svg{width:15px;height:15px}
    .rl-rr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;width:100%;padding:11px 14px;border:0;border-top:1px solid var(--line);background:none;font:inherit;color:var(--ink);text-align:left;cursor:pointer;text-decoration:none}
    .rl-rr:hover{background:var(--card2)} .rl-rr.sel{background:var(--accent-soft,var(--card2));box-shadow:inset 3px 0 0 var(--accent)}
    .rl-rr>div:first-child{min-width:0}
    .rl-rr b{font-size:14.5px;font-weight:600}
    .rl-rr p{margin:2px 0 0;font-size:13.5px;color:var(--muted);overflow-wrap:anywhere}
    .rl-st{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:none}
    .rl-pl{font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 9px;white-space:nowrap}
    .rl-pl.on{background:var(--good-bg,var(--card2));color:var(--good)} .rl-pl.off{background:var(--card2);color:var(--muted)} .rl-pl.smp{background:var(--warn-bg,var(--card2));color:var(--warn)} .rl-pl.sch{background:var(--info-bg,var(--card2));color:var(--info)}
    .rl-ed-l{font-size:12.5px;font-weight:600;color:var(--accent)}
    .rl-side{position:sticky;top:70px;max-height:calc(100vh - 86px);overflow:auto;min-width:0}
    .rl-edp{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:var(--shadow)}
    .rl-wc{display:flex;flex-direction:column;gap:6px}
    .rl-ba{display:flex;flex-direction:column;gap:2px;font-size:13px}
    .rl-ba s{color:var(--muted)}
    .rl-eff{display:flex;gap:6px;align-items:flex-start;background:var(--card2);border-radius:8px;padding:8px 10px}
    .rl-eff svg{width:15px;height:15px;flex:none;margin-top:2px}
    .rl-ct{display:flex;flex-direction:column;gap:6px}
    .rl-ctr{display:grid;grid-template-columns:minmax(0,1fr) 170px;gap:8px;align-items:center;font-size:13.5px}
    .rl-ctr select{width:100%}
    .rl-sct .inp.sm{width:60px;text-align:right;padding-left:6px;padding-right:6px}
    .rl-sct td,.rl-sct th{padding-left:5px;padding-right:5px}
    .rl-ex{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:10px;padding:6px 10px;background:var(--card2)}
    .rl-ex .ln{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:3px 0}
    .rl-ex .ln.tot{border-top:1px solid var(--line);margin-top:3px;padding-top:6px;font-weight:700;font-size:13.5px}
    @media (max-width:1180px){.rl-l{grid-template-columns:minmax(0,1fr) 380px}.rl-nav{grid-column:1 / -1;position:static;flex-direction:row;flex-wrap:wrap}}
    @media (max-width:860px){.rl-l{grid-template-columns:minmax(0,1fr)}.rl-nav{flex-wrap:nowrap;overflow-x:auto}.rl-nav button{white-space:nowrap}.rl-side{position:static;max-height:none}
      .rl-l.has-ed .rl-side{position:fixed;left:0;right:0;bottom:0;top:auto;max-height:86vh;z-index:60;border-radius:16px 16px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.25)}
      .rl-l.has-ed .rl-edp{border-radius:16px 16px 0 0;border-bottom:0}
      .rl-ctr{grid-template-columns:1fr}}

  `);

  /* ---------- small helpers ---------- */
  const pinAsk = (title, html, okLabel, onOk) => {
    const m = U.modal(title, `${html}<div class="field" style="margin-top:14px"><label>${t('Owner PIN (4 digits)', 'মালিকের PIN (4 ডিজিট)')}</label><input class="inp" id="rl-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" style="max-width:160px;letter-spacing:.3em"><div class="hint" id="rl-pin-e">${t('Money and price changes always ask for the owner PIN.', 'টাকা ও দামের পরিবর্তনে সবসময় মালিকের PIN লাগে।')}</div></div>`,
      { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="rl-pin-ok">${okLabel}</button>` });
    const inp = m.querySelector('#rl-pin'); setTimeout(() => inp.focus(), 30);
    const go = () => { if (!/^\d{4}$/.test(inp.value)) { const e = m.querySelector('#rl-pin-e'); e.textContent = t('Type any 4 digits (demo).', 'যেকোনো 4টি সংখ্যা লিখুন (ডেমো)।'); e.style.color = 'var(--bad)'; return; } U.close(); onOk(); };
    m.querySelector('#rl-pin-ok').onclick = go; inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  };
  const num = (root, id) => { const el = root.querySelector('#' + id); return el ? Number(el.value) : 0; };
  const val = (root, id) => { const el = root.querySelector('#' + id); return el ? el.value.trim() : ''; };
  const chk = (root, id) => { const el = root.querySelector('#' + id); return !!(el && el.checked); };
  const segv = (root, id) => { const b = root.querySelector('#' + id + ' button.on'); return b ? b.dataset.v : ''; };
  const onBadge = (on) => (on ? U.badge(t('On', 'চালু'), 'good') : U.badge(t('Off', 'বন্ধ'), ''));
  const tog = (id, on, label) => `<label class="rl-check">${U.switch(id, on)} <span>${label}</span></label>`;
  const store = () => { const D = A.D; D.ruleLog = D.ruleLog || seedLog(); D.ruleText = D.ruleText || {}; D.ruleSched = D.ruleSched || {}; if (!R().autoCancel) R().autoCancel = { on: false, calls: 3 }; if (!R().popup) R().popup = { on: !!R().notice.popup, title: 'Winter collection is here', text: 'Get 10% off your first order with code WELCOME100', seconds: 8 }; if (!R().notice.textBn) R().notice.textBn = '৳3,000 এর বেশি অর্ডারে ফ্রি ডেলিভারি'; if (!R().advance.when) R().advance.when = ['new']; if (!R().wallets.prepaidType) R().wallets.prepaidType = 'flat'; ensureR3(); };
  function seedLog() {
    return {
      fees: [{ t: '2026-09-01T11:00:00+06:00', val: { inside: { fee: 70, days: '1–2' }, sub: { fee: 100, days: '2–3' }, outside: { fee: 120, days: '3–5' } }, by: 'Mehadi Hasan' }],
      free: [{ t: '2026-10-05T10:30:00+06:00', val: { on: true, over: 2500 }, by: 'Mehadi Hasan' }],
      buymore: [{ t: '2026-10-15T16:10:00+06:00', val: { on: true, tiers: [{ qty: 2, off: 5 }, { qty: 3, off: 8 }] }, by: 'Mehadi Hasan' }],
    };
  }

  /* ---------- simulation helpers ---------- */
  const simDelivery = (fees, free) => {
    const os = last30(); let n = 0, amt = 0;
    for (const o of os) { const after = o.subtotal - o.discount; const nd = free.on && after >= free.over ? 0 : fees[o.zone].fee; if (nd !== o.delivery) { n++; amt += nd - o.delivery; } }
    return { n, total: os.length, amt };
  };
  const simLine = (s) => (s.n ? (s.amt >= 0
    ? [`${s.n} of ${s.total} orders change · customers pay ${tk(s.amt)} more in delivery`, `${s.total}টির মধ্যে ${s.n}টি অর্ডার বদলাবে · কাস্টমার ডেলিভারিতে ${tk(s.amt)} বেশি দেবেন`]
    : [`${s.n} of ${s.total} orders change · customers pay ${tk(-s.amt)} less in delivery (your income drops by that)`, `${s.total}টির মধ্যে ${s.n}টি অর্ডার বদলাবে · কাস্টমার ডেলিভারিতে ${tk(-s.amt)} কম দেবেন (আপনার আয় ততটা কমবে)`])
    : [`No order of the last 30 days (${s.total}) would change.`, `গত 30 দিনের কোনো অর্ডার (${s.total}টি) বদলাবে না।`]);
  const firstOrderIds = () => { const seen = {}; const ids = new Set(); A.D.orders.slice().reverse().forEach((o) => { if (!seen[o.customerId]) { seen[o.customerId] = 1; ids.add(o.id); } }); return ids; };
  const needsAdvance = (o, v, firsts) => v.on && o.payment === 'COD' && ((v.when.includes('new') && firsts.has(o.id) && o.total > v.newOver) || (v.when.includes('outside') && o.zone === 'outside') || (v.when.includes('risk') && o.risk === 'high'));

  /* ---------- the rules ---------- */
  const SPECS = [
    { key: 'fees', tab: 'delivery', title: ['Delivery charges', 'ডেলিভারি চার্জ'], money: true,
      get: () => clone(R().delivery), set: (v) => { R().delivery = v; },
      summary: (v) => t(`Inside ${tk(v.inside.fee)} · Sub-area ${tk(v.sub.fee)} · Outside ${tk(v.outside.fee)}`, `ভেতরে ${tk(v.inside.fee)} · আশেপাশে ${tk(v.sub.fee)} · বাইরে ${tk(v.outside.fee)}`),
      form: (v) => `<div class="rl-zones">${['inside', 'sub', 'outside'].map((z) => `<div class="rl-zone"><b>${zn(z)}</b>${U.field(t('Charge', 'চার্জ'), U.money(`f-${z}-fee`, v[z].fee, 'min="0"'))}${U.field(t('Days to deliver', 'কত দিনে পৌঁছাবে'), U.input(`f-${z}-days`, v[z].days))}</div>`).join('')}</div>
        <div class="muted small">${t('Sub-area = Savar, Gazipur, Narayanganj, Keraniganj and similar places just outside the city.', 'আশেপাশে = সাভার, গাজীপুর, নারায়ণগঞ্জ, কেরানীগঞ্জের মতো শহরের পাশের এলাকা।')}</div>`,
      read: (el) => { const o = {}; for (const z of ['inside', 'sub', 'outside']) o[z] = { fee: num(el, `f-${z}-fee`), days: val(el, `f-${z}-days`) || '—' }; return o; },
      check: (v) => (['inside', 'sub', 'outside'].some((z) => !(v[z].fee >= 0)) ? t('Charges must be 0 or more.', 'চার্জ 0 বা বেশি হতে হবে।') : ''),
      text: (v) => ({ en: ['inside', 'sub', 'outside'].map((z) => `${Z[z][0]} ${tk(v[z].fee)} (${v[z].days} days)`).join(' · '), bn: ['inside', 'sub', 'outside'].map((z) => `${Z[z][1]} ডেলিভারি চার্জ ${tk(v[z].fee)}, ${v[z].days} দিনে`).join(' · ') }),
      sim: (v) => simLine(simDelivery(v, R().freeDelivery)) },
    { key: 'free', tab: 'delivery', title: ['Free delivery', 'ফ্রি ডেলিভারি'], money: true, onOff: true,
      get: () => clone(R().freeDelivery), set: (v) => { R().freeDelivery = v; },
      summary: (v) => (v.on ? t(`On orders over ${tk(v.over)}`, `${tk(v.over)} এর বেশি অর্ডারে`) : t('Off', 'বন্ধ')),
      form: (v) => `<div class="formgrid">${tog('f-free-on', v.on, t('Give free delivery', 'ফ্রি ডেলিভারি দিন'))}${U.field(t('When the order is over', 'অর্ডার এর বেশি হলে'), U.money('f-free-over', v.over, 'min="0"'), t('Counted after discounts.', 'ছাড় বাদ দিয়ে হিসাব হবে।'))}</div>`,
      read: (el) => ({ on: chk(el, 'f-free-on'), over: num(el, 'f-free-over') }),
      text: (v) => (v.on ? { en: `Free delivery on orders over ${tk(v.over)}.`, bn: `${tk(v.over)} এর বেশি অর্ডারে ডেলিভারি ফ্রি` } : { en: 'A delivery charge applies to every order.', bn: 'সব অর্ডারে ডেলিভারি চার্জ লাগবে' }),
      sim: (v) => { const s = simDelivery(R().delivery, v); const got = last30().filter((o) => v.on && o.subtotal - o.discount >= v.over).length; const l = simLine(s); return [l[0] + ` · ${got} orders would get it free`, l[1] + ` · ${got}টি অর্ডার ফ্রি পেত`]; } },
    { key: 'eid', tab: 'delivery', title: ['Eid last order dates', 'ঈদের শেষ অর্ডারের তারিখ'], onOff: true,
      get: () => clone(R().eid), set: (v) => { R().eid = v; },
      summary: (v) => (v.on ? t(`Eid ${dshort(v.eidDate)} · last day ${dshort(v.insideLast)} / ${dshort(v.outsideLast)}`, `ঈদ ${dshort(v.eidDate)} · শেষ দিন ${dshort(v.insideLast)} / ${dshort(v.outsideLast)}`) : t('Off', 'বন্ধ')),
      form: (v) => `<div class="formgrid">${tog('f-eid-on', v.on, t('Show Eid dates on the shop', 'দোকানে ঈদের তারিখ দেখান'))}${U.field(t('Eid date', 'ঈদের তারিখ'), U.input('f-eid-d', v.eidDate, 'type="date"'))}${U.field(t('Last order day, inside Dhaka', 'শেষ অর্ডার, ঢাকার ভেতরে'), U.input('f-eid-in', v.insideLast, 'type="date"'))}${U.field(t('Last order day, outside Dhaka', 'শেষ অর্ডার, ঢাকার বাইরে'), U.input('f-eid-out', v.outsideLast, 'type="date"'))}</div>`,
      read: (el) => ({ on: chk(el, 'f-eid-on'), eidDate: val(el, 'f-eid-d'), insideLast: val(el, 'f-eid-in'), outsideLast: val(el, 'f-eid-out') }),
      check: (v) => (v.insideLast > v.eidDate || v.outsideLast > v.eidDate ? t('Last order days must be before Eid.', 'শেষ অর্ডারের দিন ঈদের আগে হতে হবে।') : ''),
      text: (v) => (v.on ? { en: `Want it before Eid? Order by ${dshort(v.insideLast)} inside Dhaka, by ${dshort(v.outsideLast)} outside Dhaka.`, bn: `ঈদের আগে পেতে ঢাকার ভেতরে ${dshort(v.insideLast)}, ঢাকার বাইরে ${dshort(v.outsideLast)} এর মধ্যে অর্ডার করুন` } : { en: 'Nothing shown.', bn: 'কিছু দেখানো হবে না' }) },
    { key: 'cod', tab: 'payment', title: ['Cash on delivery', 'ক্যাশ অন ডেলিভারি'], money: true, onOff: true, kw: 'cod cash limit call',
      get: () => { const c = R().cod; return { on: c.on, callAbove: c.callAbove || 5000, payOnlineAbove: c.payOnlineAbove || c.max || 15000 }; },
      set: (v) => { R().cod = { on: v.on, callAbove: v.callAbove, payOnlineAbove: v.payOnlineAbove, max: v.payOnlineAbove }; },
      summary: (v) => (v.on ? t(`Call above ${tk(v.callAbove)} · pay online first above ${tk(v.payOnlineAbove)}`, `${tk(v.callAbove)} এর বেশি হলে কল · ${tk(v.payOnlineAbove)} এর বেশি হলে আগে অনলাইনে পেমেন্ট`) : t('Off · online payment only', 'বন্ধ · শুধু অনলাইন পেমেন্ট')),
      form: (v) => `${tog('f-cod-on', v.on, t('Allow cash on delivery', 'ক্যাশ অন ডেলিভারি চালু'))}<div class="formgrid">${U.field(t('Call the customer when the order is over', 'অর্ডার এর বেশি হলে কল করে কনফার্ম'), U.money('f-cod-call', v.callAbove, 'min="0"'), t('Goes to the call list, even for trusted customers.', 'বিশ্বস্ত কাস্টমার হলেও কল লিস্টে যাবে।'))}${U.field(t('Must pay online first when over', 'এর বেশি হলে আগে অনলাইনে পেমেন্ট'), U.money('f-cod-max', v.payOnlineAbove, 'min="0"'), t('Checkout hides cash on delivery above this.', 'এর বেশি হলে চেকআউটে ক্যাশ অন ডেলিভারি দেখাবে না।'))}</div>`,
      read: (el) => ({ on: chk(el, 'f-cod-on'), callAbove: num(el, 'f-cod-call'), payOnlineAbove: num(el, 'f-cod-max') }),
      check: (v) => (v.payOnlineAbove < v.callAbove ? t('The pay-online limit must be higher than the call limit.', 'অনলাইন পেমেন্টের সীমা কলের সীমার চেয়ে বেশি হতে হবে।') : ''),
      text: (v) => (v.on ? { en: `Cash on delivery on orders up to ${tk(v.payOnlineAbove)}. Above ${tk(v.callAbove)} we call you to confirm.`, bn: `${tk(v.payOnlineAbove)} পর্যন্ত অর্ডারে ক্যাশ অন ডেলিভারি আছে। ${tk(v.callAbove)} এর বেশি হলে আমরা কল করে কনফার্ম করব।` } : { en: 'Pay online with bKash, Nagad or card.', bn: 'bKash, Nagad বা কার্ডে আগে পেমেন্ট করুন।' }),
      sim: (v) => { const os = last30().filter((o) => o.payment === 'COD'); const call = os.filter((o) => o.total > v.callAbove && o.total <= v.payOnlineAbove); const over = os.filter((o) => !v.on || o.total > v.payOnlineAbove); return [`Last 30 days: ${call.length} of ${os.length} cash orders would go to the call list · ${over.length} would have had to pay online first (${tk(A.sum(over, (o) => o.total))}).`, `গত 30 দিন: ${os.length}টি ক্যাশ অর্ডারের ${call.length}টি কল লিস্টে যেত · ${over.length}টিকে আগে অনলাইনে পেমেন্ট করতে হতো (${tk(A.sum(over, (o) => o.total))})।`]; } },
    { key: 'advance', tab: 'payment', title: ['Advance payment', 'অগ্রিম পেমেন্ট'], money: true, onOff: true,
      get: () => clone(R().advance), set: (v) => { R().advance = v; },
      summary: (v) => (v.on ? t(`${v.type === 'delivery' ? 'Delivery charge' : v.percent + '%'} · ${v.when.length} case(s)`, `${v.type === 'delivery' ? 'ডেলিভারি চার্জ' : v.percent + '%'} · ${v.when.length}টি ক্ষেত্রে`) : t('Off', 'বন্ধ')),
      form: (v) => `${tog('f-adv-on', v.on, t('Ask for advance on some cash orders', 'কিছু ক্যাশ অর্ডারে অগ্রিম চান'))}
        <div><div class="rl-sub">${t('Ask when', 'কখন চাইবেন')}</div><div class="stack">
          <label class="rl-check"><input type="checkbox" id="f-adv-new" ${v.when.includes('new') ? 'checked' : ''}> ${t('New customer, order over', 'নতুন কাস্টমার, অর্ডার এর বেশি')} ${U.money('f-adv-over', v.newOver)}</label>
          <label class="rl-check"><input type="checkbox" id="f-adv-out" ${v.when.includes('outside') ? 'checked' : ''}> ${t('Every order outside Dhaka', 'ঢাকার বাইরের সব অর্ডার')}</label>
          <label class="rl-check"><input type="checkbox" id="f-adv-risk" ${v.when.includes('risk') ? 'checked' : ''}> ${t('High-risk orders (past refusals)', 'ঝুঁকি বেশি এমন অর্ডার (আগে ফেরত দিয়েছে)')}</label></div></div>
        <div class="formgrid"><div class="field"><label>${t('How much', 'কত টাকা')}</label>${U.seg('f-adv-type', [['delivery', t('Delivery charge', 'ডেলিভারি চার্জ')], ['percent', t('Part of the order (%)', 'অর্ডারের অংশ (%)')]], v.type)}</div>${U.field(t('Percent', 'শতাংশ'), U.input('f-adv-pct', v.percent, 'type="number" min="1" max="100"'), t('Used only with "Part of the order".', 'শুধু "অর্ডারের অংশ" বেছে নিলে।'))}</div>`,
      read: (el) => ({ on: chk(el, 'f-adv-on'), newOver: num(el, 'f-adv-over'), type: segv(el, 'f-adv-type'), percent: num(el, 'f-adv-pct'), when: [chk(el, 'f-adv-new') && 'new', chk(el, 'f-adv-out') && 'outside', chk(el, 'f-adv-risk') && 'risk'].filter(Boolean) }),
      check: (v) => (v.on && !v.when.length ? t('Tick at least one case, or turn it off.', 'অন্তত একটি ক্ষেত্র বেছে নিন, না হলে বন্ধ করুন।') : ''),
      text: (v) => { if (!v.on) return { en: 'No advance needed for cash on delivery.', bn: 'ক্যাশ অন ডেলিভারিতে অগ্রিম লাগবে না' }; const amt = v.type === 'delivery' ? ['the delivery charge', 'ডেলিভারি চার্জ'] : [v.percent + '% of the order', 'অর্ডারের ' + v.percent + '%']; const w = { new: [`new customers over ${tk(v.newOver)}`, `নতুন কাস্টমারের ${tk(v.newOver)} এর বেশি অর্ডারে`], outside: ['orders outside Dhaka', 'ঢাকার বাইরের অর্ডারে'], risk: ['some orders after a call from us', 'কিছু অর্ডারে আমাদের কলের পর'] }; return { en: `Pay ${amt[0]} in advance by bKash or Nagad for ${v.when.map((k) => w[k][0]).join(', ')}.`, bn: `${v.when.map((k) => w[k][1]).join(', ')} ${amt[1]} অগ্রিম bKash বা Nagad এ দিতে হবে` }; },
      sim: (v) => { const f = firstOrderIds(); const os = last30().filter((o) => needsAdvance(o, v, f)); const ret = os.filter((o) => o.status === 'returned'); const saved = A.sum(ret, (o) => A.calc.returnCost(o)); return [`${os.length} orders would have needed advance. ${ret.length} of them came back unpaid, costing ${tk(saved)} in return delivery that the advance would have covered.`, `${os.length}টি অর্ডারে অগ্রিম লাগত। এর ${ret.length}টি ফেরত এসেছে, রিটার্ন খরচ ${tk(saved)} — অগ্রিম থাকলে এটা উঠে আসত।`]; } },
    { key: 'wallets', tab: 'payment', title: ['bKash & Nagad numbers', 'bKash ও Nagad নম্বর'], money: true,
      get: () => ({ bkash: R().wallets.bkash, nagad: R().wallets.nagad }), set: (v) => { Object.assign(R().wallets, v); },
      summary: (v) => `bKash ${v.bkash} · Nagad ${v.nagad}`,
      form: (v) => `<div class="formgrid">${U.field('bKash ' + t('merchant number', 'মার্চেন্ট নম্বর'), U.input('f-w-bk', v.bkash, 'inputmode="tel"'))}${U.field('Nagad ' + t('merchant number', 'মার্চেন্ট নম্বর'), U.input('f-w-ng', v.nagad, 'inputmode="tel"'))}</div>`,
      read: (el) => ({ bkash: val(el, 'f-w-bk'), nagad: val(el, 'f-w-ng') }),
      check: (v) => ([v.bkash, v.nagad].some((n) => n.replace(/\D/g, '').length !== 11) ? t('Each number needs 11 digits.', 'প্রতিটা নম্বরে 11টি সংখ্যা লাগবে।') : ''),
      text: (v) => ({ en: `Send payment to bKash ${v.bkash} or Nagad ${v.nagad} (merchant). Write your order number in the reference.`, bn: `bKash ${v.bkash} বা Nagad ${v.nagad} (মার্চেন্ট) এ পেমেন্ট করুন। রেফারেন্সে অর্ডার নম্বর লিখুন।` }) },
    { key: 'prepaid', tab: 'payment', title: ['Discount for paying online', 'অনলাইনে পেমেন্টে ছাড়'], money: true, onOff: true,
      get: () => ({ on: !!R().wallets.prepaidOn, type: R().wallets.prepaidType || 'flat', value: R().wallets.prepaidOff || 0 }), set: (v) => { Object.assign(R().wallets, { prepaidOn: v.on, prepaidType: v.type, prepaidOff: v.value }); },
      summary: (v) => (v.on ? (v.type === 'flat' ? tk(v.value) : v.value + '%') + t(' off', ' ছাড়') : t('Off', 'বন্ধ')),
      form: (v) => `<div class="formgrid">${tog('f-pp-on', v.on, t('Give a discount for paying before delivery', 'আগে পেমেন্ট করলে ছাড় দিন'))}<div class="field"><label>${t('Discount type', 'ছাড়ের ধরন')}</label>${U.seg('f-pp-type', [['flat', '৳'], ['percent', '%']], v.type)}</div>${U.field(t('Amount', 'পরিমাণ'), U.input('f-pp-v', v.value, 'type="number" min="0"'))}</div>`,
      read: (el) => ({ on: chk(el, 'f-pp-on'), type: segv(el, 'f-pp-type'), value: num(el, 'f-pp-v') }),
      check: (v) => (v.on && !(v.value > 0) ? t('Enter the discount amount.', 'ছাড়ের পরিমাণ দিন।') : ''),
      text: (v) => (v.on ? { en: `Pay online with bKash, Nagad or card and get ${v.type === 'flat' ? tk(v.value) : v.value + '%'} off.`, bn: `bKash, Nagad বা কার্ডে আগে পেমেন্ট করলে ${v.type === 'flat' ? tk(v.value) : v.value + '%'} ছাড়` } : { en: 'Same price for cash and online payment.', bn: 'ক্যাশ ও অনলাইনে একই দাম' }),
      sim: (v) => { const os = last30(); const on = os.filter((o) => o.payment !== 'COD'); const cost = A.sum(on, (o) => (v.type === 'flat' ? v.value : Math.round(o.total * v.value / 100))); const ret = os.filter((o) => o.payment === 'COD' && o.status === 'returned').length; return [`${on.length} of ${os.length} orders paid online (${A.fmt.pct(on.length / (os.length || 1) * 100, 0)}). The discount would have cost ${tk(v.on ? cost : 0)} on those. Cash orders that came back: ${ret}.`, `${os.length}টির মধ্যে ${on.length}টি অর্ডার অনলাইনে পেমেন্ট হয়েছে (${A.fmt.pct(on.length / (os.length || 1) * 100, 0)})। এগুলোতে ছাড় দিলে খরচ ${tk(v.on ? cost : 0)}। ক্যাশ অর্ডার ফেরত এসেছে: ${ret}টি।`]; } },
    { key: 'exchange', tab: 'exchange', title: ['Exchange', 'এক্সচেঞ্জ'], money: true, onOff: true, kw: 'exchange size defect wallet 72',
      get: () => { const e = R().exchange; return { on: e.on, hours: e.hours, reasons: (e.reasons || ['size']).filter((x) => x !== 'defect'), charge: e.charge == null ? 80 : e.charge, shopFaultFree: e.shopFaultFree !== false, lowerToWallet: e.lowerToWallet !== false, oldPieceDays: e.oldPieceDays || 4, checkDays: e.checkDays || 7, excluded: e.excluded || [] }; },
      set: (v) => { R().exchange = Object.assign({}, v, { who: v.charge > 0 ? 'customer' : 'shop' }); },
      summary: (v) => (v.on ? t(`${v.hours} hours after delivery · ${v.reasons.map((x) => ({ size: 'size', defect: 'defect', colour: 'colour' }[x])).join(' or ')} only · ${tk(v.charge)} charge${v.lowerToWallet ? ' · lower price goes to wallet' : ''}`, `ডেলিভারির ${v.hours} ঘণ্টার মধ্যে · শুধু ${v.reasons.map((x) => ({ size: 'সাইজ', defect: 'ত্রুটি', colour: 'কালার' }[x])).join(' বা ')} · ${tk(v.charge)} চার্জ${v.lowerToWallet ? ' · কম দামের বাকি টাকা ওয়ালেটে' : ''}`) : t('Off', 'বন্ধ')),
      form: (v) => `${tog('f-ex-on', v.on, t('Allow exchange after delivery', 'ডেলিভারির পর এক্সচেঞ্জ চালু'))}
        <div class="formgrid">${U.field(t('Within (hours after delivery)', 'ডেলিভারির পর কত ঘণ্টার মধ্যে'), U.input('f-ex-h', v.hours, 'type="number" min="1"'))}${U.field(t('Exchange charge', 'এক্সচেঞ্জ চার্জ'), U.money('f-ex-ch', v.charge, 'min="0"'))}</div>
        <div class="field"><label>${t('Allowed reasons', 'কোন কারণে')}</label><div class="chips" id="f-ex-rs">${[['size', t('Wrong size', 'সাইজ ভুল')], ['colour', t('Change colour', 'কালার বদল')]].map((x) => `<button type="button" class="chip rl-tg ${v.reasons.includes(x[0]) ? 'on' : ''}" data-v="${x[0]}">${x[1]}</button>`).join('')}</div></div>
        <div class="muted small">${t('Defective or wrong item is not an exchange: see "Defective or wrong item" — we send the right product again, free.', 'ত্রুটি বা ভুল পণ্য এক্সচেঞ্জ নয়: "ত্রুটি বা ভুল পণ্য" নিয়ম দেখুন — সঠিক পণ্য আবার পাঠাই, ফ্রি।')}</div>
        ${tog('f-ex-w', v.lowerToWallet, t('Size exchange to a cheaper item: the rest goes to the customer\'s wallet after the old piece passes the check', 'সাইজ এক্সচেঞ্জে নতুন পণ্যের দাম কম হলে: পুরনো পিস চেক পাস করার পর বাকি টাকা কাস্টমারের ওয়ালেটে'))}
        <div class="formgrid">${U.field(t('Old piece must come back within (days)', 'পুরনো পিস কত দিনের মধ্যে ফেরত আসবে'), U.input('f-ex-od', v.oldPieceDays, 'type="number" min="1" max="15"'))}<div class="field"><label>${t('ERP check within (days)', 'ERP চেক কত দিনের মধ্যে')}</label>${U.seg('f-ex-cd', [['7', '7'], ['10', '10'], ['15', '15']], String(v.checkDays))}</div></div>
        <div class="field"><label>${t('Not for these categories', 'এই ক্যাটাগরিতে এক্সচেঞ্জ নেই')}</label><div class="chips rl-chipcats" id="f-ex-cats">${A.CATS.map((c) => `<button type="button" class="chip ${v.excluded.includes(c.id) ? 'on' : ''}" data-cat="${c.id}">${t(c.en, c.bn)}</button>`).join('')}</div></div>
        <div class="muted small">${t('Higher price: the customer pays the difference on delivery. No cash refunds after delivery.', 'দাম বেশি হলে: পার্থক্যটা কাস্টমার ডেলিভারিতে দেবেন। ডেলিভারির পর ক্যাশ ফেরত নেই।')}</div>`,
      read: (el) => ({ on: chk(el, 'f-ex-on'), hours: num(el, 'f-ex-h'), reasons: [...el.querySelectorAll('#f-ex-rs .chip.on')].map((b) => b.dataset.v), charge: num(el, 'f-ex-ch'), shopFaultFree: chk(el, 'f-ex-sf'), lowerToWallet: chk(el, 'f-ex-w'), oldPieceDays: num(el, 'f-ex-od'), checkDays: Number(segv(el, 'f-ex-cd') || 7), excluded: [...el.querySelectorAll('#f-ex-cats .chip.on')].map((b) => b.dataset.cat) }),
      check: (v) => (v.on && !(v.hours > 0) ? t('Enter the hours.', 'ঘণ্টা দিন।') : v.on && !v.reasons.length ? t('Pick at least one reason.', 'অন্তত একটি কারণ বাছুন।') : ''),
      text: (v) => (v.on ? { en: `Exchange within ${v.hours} hours of delivery for ${v.reasons.join(' or ')}. Exchange charge ${tk(v.charge)}${v.shopFaultFree ? ' (free if it is our mistake)' : ''}. If the new item costs less, the rest goes to your EXTAS wallet.`, bn: `ডেলিভারির ${v.hours} ঘণ্টার মধ্যে ${v.reasons.map((x) => ({ size: 'সাইজ', defect: 'ত্রুটি', colour: 'কালার' }[x])).join(' বা ')} এর জন্য এক্সচেঞ্জ করা যাবে। চার্জ ${tk(v.charge)}${v.shopFaultFree ? ' (আমাদের ভুল হলে ফ্রি)' : ''}। নতুন পণ্যের দাম কম হলে বাকি টাকা আপনার EXTAS ওয়ালেটে যাবে।` } : { en: 'Exchange is not available.', bn: 'এক্সচেঞ্জ হয় না।' }),
      sim: (v) => { const exn = last30().filter((o) => o.status === 'exchanged'); return [`${exn.length} exchanges in the last 30 days → about ${tk(exn.length * v.charge)} in exchange charges.`, `গত 30 দিনে ${exn.length}টি এক্সচেঞ্জ → প্রায় ${tk(exn.length * v.charge)} এক্সচেঞ্জ চার্জ।`]; } },
    { key: 'returns', tab: 'exchange', title: ['Returns (money back)', 'রিটার্ন (টাকা ফেরত)'], money: true, onOff: true,
      get: () => clone(R().returns), set: (v) => { R().returns = v; },
      summary: (v) => (v.on ? t(`Within ${v.days} days`, `${v.days} দিনের মধ্যে`) : t('Off · exchange only', 'বন্ধ · শুধু এক্সচেঞ্জ')),
      form: (v) => `<div class="formgrid">${tog('f-rt-on', v.on, t('Allow money-back returns', 'টাকা ফেরত রিটার্ন চালু'))}${U.field(t('Within (days after delivery)', 'ডেলিভারির পর কত দিনের মধ্যে'), U.input('f-rt-d', v.days, 'type="number" min="1"'))}</div>`,
      read: (el) => ({ on: chk(el, 'f-rt-on'), days: num(el, 'f-rt-d') }),
      text: (v) => (v.on ? { en: `Return unused items with tags within ${v.days} days of delivery for your money back (to bKash or your shop wallet).`, bn: `ডেলিভারির ${v.days} দিনের মধ্যে না পরা, ট্যাগসহ পণ্য ফেরত দিলে টাকা ফেরত পাবেন (bKash বা ওয়ালেটে)` } : { en: 'No money-back returns. Exchange only.', bn: 'টাকা ফেরত হয় না, শুধু এক্সচেঞ্জ' }),
      sim: (v) => { const d = last30().filter(A.calc.isDelivered); return [`${d.length} delivered orders (${tk(A.sum(d, (o) => o.total))}) would have had a ${v.days}-day return window.`, `${d.length}টি ডেলিভারি হওয়া অর্ডারে (${tk(A.sum(d, (o) => o.total))}) ${v.days} দিনের রিটার্ন সুযোগ থাকত।`]; } },
    { key: 'buymore', tab: 'discounts', title: ['Buy more, save', 'বেশি কিনলে ছাড়'], money: true, onOff: true,
      get: () => clone(R().buyMore), set: (v) => { R().buyMore = v; },
      summary: (v) => (v.on ? t(`2 pcs ${v.tiers[0].off}% · 3+ pcs ${v.tiers[1].off}%`, `2 পিস ${v.tiers[0].off}% · 3+ পিস ${v.tiers[1].off}%`) : t('Off', 'বন্ধ')),
      form: (v) => `<div class="formgrid">${tog('f-bm-on', v.on, t('Give a discount for more pieces', 'বেশি পিসে ছাড় দিন'))}${U.field(t('2 pieces: % off', '2 পিস: % ছাড়'), U.input('f-bm-2', v.tiers[0].off, 'type="number" min="0" max="90"'))}${U.field(t('3 or more pieces: % off', '3 বা বেশি পিস: % ছাড়'), U.input('f-bm-3', v.tiers[1].off, 'type="number" min="0" max="90"'))}</div><div class="muted small">${t('A coupon and this discount do not add up: the customer gets the bigger one.', 'কুপন আর এই ছাড় একসাথে হয় না: কাস্টমার বড়টা পাবেন।')}</div>`,
      read: (el) => ({ on: chk(el, 'f-bm-on'), tiers: [{ qty: 2, off: num(el, 'f-bm-2') }, { qty: 3, off: num(el, 'f-bm-3') }] }),
      check: (v) => (v.tiers[1].off < v.tiers[0].off ? t('3 pieces should get at least the 2-piece discount.', '3 পিসের ছাড় 2 পিসের চেয়ে কম হতে পারবে না।') : ''),
      text: (v) => (v.on ? { en: `Buy 2 pieces, get ${v.tiers[0].off}% off. Buy 3 or more, get ${v.tiers[1].off}% off.`, bn: `2 পিস কিনলে ${v.tiers[0].off}% ছাড়, 3 পিস বা বেশি কিনলে ${v.tiers[1].off}% ছাড়` } : { en: 'No multi-piece discount.', bn: 'বেশি পিসে আলাদা ছাড় নেই' }),
      sim: (v) => { const os = last30().filter((o) => !o.coupon && A.calc.pieces(o) >= 2); const nd = A.sum(os, (o) => { const p = A.calc.pieces(o); const off = !v.on ? 0 : p >= 3 ? v.tiers[1].off : v.tiers[0].off; return Math.round(o.subtotal * off / 100); }); const od = A.sum(os, (o) => o.discount); return [`${os.length} multi-piece orders. Discount given would be ${tk(nd)} instead of ${tk(od)} (${nd >= od ? '+' : '−'}${tk(Math.abs(nd - od))}).`, `${os.length}টি একাধিক পিসের অর্ডার। ছাড় হতো ${tk(nd)}, আগে ছিল ${tk(od)} (${nd >= od ? '+' : '−'}${tk(Math.abs(nd - od))})।`]; } },
    { key: 'edits', tab: 'orders', title: ['Order changes by the customer', 'কাস্টমারের অর্ডার এডিট'],
      get: () => clone(R().orderEdit), set: (v) => { R().orderEdit = v; },
      summary: (v) => (v.maxEdits ? t(`Up to ${v.maxEdits} times before packing`, `প্যাকের আগে ${v.maxEdits} বার পর্যন্ত`) : t('Not allowed', 'করা যাবে না')),
      form: (v) => `<div class="formgrid">${U.field(t('How many times can an order be changed', 'অর্ডার কত বার বদলানো যাবে'), U.input('f-ed-n', v.maxEdits, 'type="number" min="0" max="10"'), t('0 = the customer cannot change it; your team still can.', '0 = কাস্টমার বদলাতে পারবেন না; আপনার টিম পারবে।'))}</div>`,
      read: (el) => ({ maxEdits: num(el, 'f-ed-n') }),
      text: (v) => (v.maxEdits ? { en: `You can change size, colour or address up to ${v.maxEdits} times before your order is packed.`, bn: `প্যাক হওয়ার আগে সাইজ, কালার বা ঠিকানা ${v.maxEdits} বার পর্যন্ত বদলাতে পারবেন` } : { en: 'To change your order, call us.', bn: 'অর্ডার বদলাতে আমাদের কল করুন' }) },
    { key: 'fraud', tab: 'orders', title: ['Fraud check', 'ফ্রড চেক'],
      get: () => clone(R().fraud), set: (v) => { R().fraud = v; },
      summary: (v) => ({ low: t('Low', 'কম'), normal: t('Normal', 'সাধারণ'), strict: t('Strict', 'কড়া') }[v.level]),
      form: (v) => { const os = last30(); const hi = os.filter((o) => o.risk === 'high'), md = os.filter((o) => o.risk === 'medium'); const rr = (l) => l.length ? Math.round(l.filter((o) => o.status === 'returned').length / l.length * 100) : 0;
        return `<div class="field"><label>${t('Level', 'লেভেল')}</label>${U.seg('f-fr-l', [['low', t('Low', 'কম')], ['normal', t('Normal', 'সাধারণ')], ['strict', t('Strict', 'কড়া')]], v.level)}</div><div class="rl-lvl" id="f-fr-x"></div>
        <div class="muted small">${t(`Last 30 days: ${hi.length} high-risk orders (${rr(hi)}% came back) · ${md.length} "Check" orders (${rr(md)}% came back).`, `গত 30 দিন: ঝুঁকি বেশি ${hi.length}টি অর্ডার (${rr(hi)}% ফেরত) · "যাচাই" ${md.length}টি (${rr(md)}% ফেরত)।`)}</div>`; },
      live: (el, v) => { const x = el.querySelector('#f-fr-x'); if (!x) return; x.innerHTML = { low: t('<b>Low:</b> only numbers that refused 2 or more parcels are stopped. Every other order goes to the normal confirm call. Fewer lost sales, more returns.', '<b>কম:</b> শুধু যারা 2 বা বেশি পার্সেল ফেরত দিয়েছে তাদের অর্ডার আটকাবে। বাকি সব অর্ডার সাধারণ কনফার্ম কলে যাবে। বিক্রি কম হারাবে, রিটার্ন বেশি হবে।'), normal: t('<b>Normal:</b> "Check" and "High risk" orders (past refusals, new number with a big order, far area) wait in "Processing" until someone calls. Recommended.', '<b>সাধারণ:</b> "যাচাই করুন" ও "ঝুঁকি বেশি" অর্ডার (আগে ফেরত, নতুন নম্বরে বড় অর্ডার, দূরের এলাকা) কল না করা পর্যন্ত "কনফার্ম বাকি" তে থাকবে। এটাই ভালো।'), strict: t('<b>Strict:</b> high-risk orders must pay the delivery charge in advance; "Check" orders wait for a call; numbers that refused 2+ parcels cannot use cash on delivery.', '<b>কড়া:</b> ঝুঁকি বেশি অর্ডারে অগ্রিম ডেলিভারি চার্জ লাগবে; "যাচাই" অর্ডার কলের অপেক্ষায় থাকবে; যারা 2+ পার্সেল ফেরত দিয়েছে তারা ক্যাশ অন ডেলিভারি পাবে না।') }[v.level]; },
      read: (el) => ({ level: segv(el, 'f-fr-l') }),
      text: (v) => ({ low: { en: 'Nothing extra shown.', bn: 'আলাদা কিছু দেখানো হবে না' }, normal: { en: 'We call to confirm your order before sending it.', bn: 'পাঠানোর আগে আমরা কল করে অর্ডার কনফার্ম করব' }, strict: { en: 'Some orders need the delivery charge paid in advance. We will tell you after you order.', bn: 'কিছু অর্ডারে ডেলিভারি চার্জ আগে দিতে হবে। অর্ডারের পর জানিয়ে দেব।' } }[v.level]),
      sim: (v) => { const os = last30(); const held = os.filter((o) => (v.level === 'low' ? false : v.level === 'normal' ? o.risk !== 'low' : o.risk !== 'low')); const adv = v.level === 'strict' ? os.filter((o) => o.risk === 'high') : []; return [`${held.length} orders would have waited for a call${adv.length ? `, ${adv.length} would have needed advance` : ''}.`, `${held.length}টি অর্ডার কলের অপেক্ষায় থাকত${adv.length ? `, ${adv.length}টিতে অগ্রিম লাগত` : ''}।`]; } },
    { key: 'autocancel', tab: 'orders', title: ['Cancel when the customer does not answer', 'কল না ধরলে অর্ডার বাতিল'], onOff: true,
      get: () => clone(R().autoCancel), set: (v) => { R().autoCancel = v; },
      summary: (v) => (v.on ? t(`After ${v.calls} unanswered calls`, `${v.calls} বার কল না ধরলে`) : t('Off', 'বন্ধ')),
      form: (v) => `<div class="formgrid">${tog('f-ac-on', v.on, t('Cancel by itself', 'নিজে থেকে বাতিল'))}${U.field(t('After how many unanswered calls', 'কত বার কল না ধরলে'), U.input('f-ac-n', v.calls, 'type="number" min="1" max="10"'), t('An SMS goes to the customer before the order is cancelled.', 'বাতিলের আগে কাস্টমারকে SMS যাবে।'))}</div>`,
      read: (el) => ({ on: chk(el, 'f-ac-on'), calls: num(el, 'f-ac-n') }),
      text: (v) => (v.on ? { en: `If we cannot reach you after ${v.calls} calls, the order is cancelled. We send an SMS first.`, bn: `${v.calls} বার কল করে না পেলে অর্ডার বাতিল হবে। আগে SMS পাঠানো হবে।` } : { en: 'Nothing shown.', bn: 'কিছু দেখানো হবে না' }),
      sim: () => { const c = A.D.orders.filter((o) => o.status === 'cancelled' && o.timeline.some((x) => /did not answer/.test(x.text))); return [`${c.length} orders in the last 60 days were cancelled for not answering.`, `গত 60 দিনে ${c.length}টি অর্ডার কল না ধরায় বাতিল হয়েছে।`]; } },
    { key: 'notice', tab: 'notice', title: ['Notice bar', 'নোটিশ বার'], onOff: true, ownText: true,
      get: () => clone(R().notice), set: (v) => { Object.assign(R().notice, v); },
      summary: (v) => (v.on ? `${esc(v.text)} · ${dshort(v.from)}–${dshort(v.to)}` : t('Off', 'বন্ধ')),
      form: (v) => `${tog('f-nt-on', v.on, t('Show the notice bar', 'নোটিশ বার দেখান'))}<div class="formgrid">${U.field(t('Text in English', 'ইংরেজিতে লেখা'), U.input('f-nt-t', v.text, 'maxlength="90"'))}${U.field(t('Text in Bengali', 'বাংলায় লেখা'), U.input('f-nt-tb', v.textBn || '', 'maxlength="90"'))}${U.field(t('From', 'শুরু'), U.input('f-nt-f', v.from, 'type="date"'))}${U.field(t('Until', 'শেষ'), U.input('f-nt-u', v.to, 'type="date"'))}</div>`,
      read: (el) => ({ on: chk(el, 'f-nt-on'), text: val(el, 'f-nt-t'), textBn: val(el, 'f-nt-tb'), from: val(el, 'f-nt-f'), to: val(el, 'f-nt-u') }),
      check: (v) => (v.on && !v.text ? t('Write the notice text.', 'নোটিশের লেখা দিন।') : v.to < v.from ? t('"Until" must be after "From".', '"শেষ" তারিখ "শুরু" র পরে হতে হবে।') : ''),
      preview: (v) => { const live = v.on && v.from <= TODAY() && v.to >= TODAY(); return `<div class="rl-shop">${v.on ? `<div class="rl-bar">${esc(A.lang === 'bn' && v.textBn ? v.textBn : v.text)}</div>` : ''}<div class="hd"><span>☰</span><span>EXTAS</span><span>🛒</span></div><div class="bd"></div></div><div class="small muted" style="margin-top:6px">${!v.on ? t('Bar is hidden.', 'বার লুকানো।') : live ? t(`Showing now, until ${dshort(v.to)}.`, `এখন দেখাচ্ছে, ${dshort(v.to)} পর্যন্ত।`) : t(`Shows from ${dshort(v.from)}.`, `${dshort(v.from)} থেকে দেখাবে।`)}</div>`; } },
    { key: 'popup', tab: 'notice', title: ['Pop-up', 'পপ-আপ'], onOff: true, ownText: true,
      get: () => clone(R().popup), set: (v) => { R().popup = v; R().notice.popup = v.on; },
      summary: (v) => (v.on ? t(`On · after ${v.seconds} s`, `চালু · ${v.seconds} সেকেন্ড পর`) : t('Off', 'বন্ধ')),
      form: (v) => `${tog('f-pu-on', v.on, t('Show a pop-up on the shop', 'দোকানে পপ-আপ দেখান'))}<div class="formgrid">${U.field(t('Heading', 'শিরোনাম'), U.input('f-pu-h', v.title, 'maxlength="50"'))}${U.field(t('Text', 'লেখা'), U.input('f-pu-t', v.text, 'maxlength="120"'))}${U.field(t('Show after (seconds)', 'কত সেকেন্ড পর দেখাবে'), U.input('f-pu-s', v.seconds, 'type="number" min="0" max="120"'), t('Shown once per visitor per day.', 'প্রতি ভিজিটরকে দিনে একবার।'))}<div class="field"><label>${t('Picture', 'ছবি')}</label><button class="btn" type="button" data-pu-img>${A.icon('plus')} ${t('Choose picture', 'ছবি বাছুন')}</button></div></div>`,
      read: (el) => ({ on: chk(el, 'f-pu-on'), title: val(el, 'f-pu-h'), text: val(el, 'f-pu-t'), seconds: num(el, 'f-pu-s') }),
      preview: (v) => `<div class="rl-pop">${v.on ? `<div class="box"><div class="img">${t('Your picture', 'আপনার ছবি')}</div><b>${esc(v.title)}</b><div class="small">${esc(v.text)}</div><span class="btn primary sm" style="justify-content:center">${t('Shop now', 'এখনই কিনুন')}</span></div>` : `<span class="muted small">${t('No pop-up', 'পপ-আপ নেই')}</span>`}</div><div class="small muted" style="margin-top:6px">${v.on ? t(`Appears ${v.seconds} seconds after the visitor opens the shop.`, `ভিজিটর দোকান খোলার ${v.seconds} সেকেন্ড পর আসবে।`) : ''}</div>` },
  ];
  const spec = (k) => SPECS.find((s) => s.key === k);

  /* ---------- rule card ---------- */
  const custText = (s, v) => A.D.ruleText[s.key] || s.text(v);
  function prevHtml(s, v) {
    if (s.preview) return s.preview(v);
    const own = A.D.ruleText[s.key]; const x = own || s.text(v);
    return `<div class="bn">${esc(x.bn)}</div><div class="en">${esc(x.en)}</div>${own ? `<div class="small" style="margin-top:4px;color:var(--warn)">${t('Your own text is used. Numbers above will not change it until you go back to automatic text.', 'আপনার নিজের লেখা দেখাচ্ছে। উপরের সংখ্যা বদলালেও এটা বদলাবে না, যতক্ষণ না অটো লেখায় ফেরেন।')}</div>` : ''}`;
  }
  function cardHtml(s) {
    const v = s.get(); const sc = A.D.ruleSched[s.key];
    return `<section class="card rl-card" id="rc-${s.key}" data-k="${s.key}">
      <div class="rl-head"><div><h3>${t(s.title[0], s.title[1])}</h3><div class="rl-cur">${t('Now: ', 'এখন: ')}<b style="color:var(--ink)">${s.summary(v)}</b></div></div>${s.onOff ? onBadge(v.on) : ''}</div>
      ${sc ? U.callout(`${t('Scheduled: from', 'নির্ধারিত: শুরু')} <b>${dshort(sc.from)}</b> ${t('this becomes', 'থেকে হবে')} <b>${s.summary(sc.val)}</b>. <button class="linkbtn" data-unsched>${t('Cancel schedule', 'শিডিউল বাতিল')}</button>`, 'info', 'info') : ''}
      <div class="stack" data-fields>${s.form(v)}</div>
      <div class="rl-prev"><div class="rl-prev-h">${t('Customer sees', 'কাস্টমার দেখবেন')}</div><div class="rl-prev-b" data-prev>${prevHtml(s, v)}</div></div>
      <div class="row between"><span class="muted small">${s.money ? '🔒 ' + t('Needs owner PIN to save', 'সেভ করতে মালিকের PIN লাগবে') : t('Saves at once', 'সাথে সাথে সেভ হবে')}</span><button class="btn primary" data-save>${A.icon('check')} ${t('Save', 'সেভ')}</button></div>
      <details class="rl-more"><summary>${t('More options', 'আরও অপশন')} ▾</summary><div class="rl-more-b" data-more></div></details>
    </section>`;
  }
  function moreHtml(s) {
    const v = s.get(); const own = A.D.ruleText[s.key]; const x = s.ownText ? null : custText(s, v); const hist = (A.D.ruleLog[s.key] || []).slice(0, 6);
    return `${s.ownText ? '' : `<div><div class="rl-sub">${t('Edit the customer text', 'কাস্টমারের লেখা এডিট')}</div><div class="formgrid"><textarea class="inp" rows="2" data-tbn>${esc(x.bn)}</textarea><textarea class="inp" rows="2" data-ten>${esc(x.en)}</textarea></div><div class="row" style="margin-top:6px"><button class="btn sm" data-owntext>${t('Use my text', 'আমার লেখা ব্যবহার করুন')}</button>${own ? `<button class="btn sm ghost" data-autotext>${A.icon('reset')} ${t('Back to automatic text', 'অটো লেখায় ফিরুন')}</button>` : ''}</div></div>`}
      <div><div class="rl-sub">${t('Start on a later date', 'পরের কোনো তারিখে শুরু')}</div><div class="row"><input class="inp" type="date" data-from min="${TODAY()}" style="max-width:190px"><span class="muted small">${t('Leave empty to change it now. With a date, Save schedules it.', 'খালি রাখলে এখনই বদলাবে। তারিখ দিলে সেভ চাপলে শিডিউল হবে।')}</span></div></div>
      ${s.sim ? `<div><div class="rl-sub">${t("Try on last 30 days' orders", 'গত 30 দিনের অর্ডারে পরীক্ষা')}</div><button class="btn sm" data-try>${A.icon('sync')} ${t('Try the numbers above', 'উপরের সংখ্যা দিয়ে দেখুন')}</button><div data-tryout style="margin-top:8px"></div></div>` : ''}
      <div><div class="rl-sub">${t('History', 'আগের মান')}</div>${hist.length ? `<div class="list rl-hist">${hist.map((h, i) => `<div class="li"><span class="grow small"><b>${s.summary(h.val)}</b><br><span class="muted">${t('until', 'চলেছে')} ${A.fmt.dt(h.t)} · ${esc(h.by)}</span></span><button class="btn sm ghost" data-undo="${i}">${A.icon('reset')} ${t('Undo to this', 'এটায় ফেরত')}</button></div>`).join('')}</div>` : `<div class="muted small">${t('No changes yet.', 'এখনো কোনো পরিবর্তন নেই।')}</div>`}</div>`;
  }
  function applyChange(s, nv, how) {
    const old = s.get(); (A.D.ruleLog[s.key] = A.D.ruleLog[s.key] || []).unshift({ t: A.TODAY.toISOString(), val: old, by: 'Mehadi Hasan' });
    s.set(nv); if (A.D.ruleSample) delete A.D.ruleSample[s.key]; A.commit(`Rule changed: ${s.title[0]} — ${how || 'saved'}`);
    A.toast(t(`${s.title[0]} saved. The shop shows it now.`, `${s.title[1]} সেভ হয়েছে। দোকানে এখনই দেখাবে।`), 'good'); A.render();
  }
  function wireCard(card) {
    const s = spec(card.dataset.k); const fields = card.querySelector('[data-fields]'); const prev = card.querySelector('[data-prev]');
    const cur = () => { try { return s.read(fields, s.get()); } catch (e) { return s.get(); } };
    const wc = card.querySelector('[data-wc]'); const upd = () => { const v = cur(); prev.innerHTML = prevHtml(s, v); if (s.live) s.live(fields, v); if (wc) { try { wc.innerHTML = wcHtml(s, v); } catch (e) { /* half-typed value */ } } };
    A.on(card, '.seg button', 'click', (e, b) => { e.preventDefault(); b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); upd(); });
    A.on(card, '#f-ex-cats .chip', 'click', (e, b) => { e.preventDefault(); b.classList.toggle('on'); upd(); });
    fields.addEventListener('input', upd); fields.addEventListener('change', upd);
    if (s.live) s.live(fields, s.get());
    const img = card.querySelector('[data-pu-img]'); if (img) img.onclick = () => A.toast(t('Picture picker opens here (shop photos or upload)', 'এখানে ছবি বাছাই খুলবে (দোকানের ছবি বা আপলোড)'));
    fields.addEventListener('focusin', (e) => { if (e.target.tagName === 'TEXTAREA') card._ta = e.target; });
    A.on(card, '[data-ph]', 'click', (e, b) => { e.preventDefault(); const ta = card._ta || fields.querySelector('textarea'); if (!ta) return; const a = ta.selectionStart == null ? ta.value.length : ta.selectionStart, z = ta.selectionEnd == null ? a : ta.selectionEnd; ta.value = ta.value.slice(0, a) + b.dataset.ph + ta.value.slice(z); ta.focus(); ta.setSelectionRange(a + b.dataset.ph.length, a + b.dataset.ph.length); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    A.on(card, '[data-phrase]', 'click', (e, b) => { e.preventDefault(); const en = fields.querySelector('#f-cm-en'), bn = fields.querySelector('#f-cm-bn'); if (en) en.value = (en.value.trim() + ' ' + b.dataset.en).trim(); if (bn) bn.value = (bn.value.trim() + ' ' + b.dataset.bn).trim(); fields.dispatchEvent(new Event('input')); });
    const un = card.querySelector('[data-unsched]'); if (un) un.onclick = () => { delete A.D.ruleSched[s.key]; A.commit('Schedule cancelled: ' + s.title[0]); A.toast(t('Schedule cancelled', 'শিডিউল বাতিল হয়েছে')); A.render(); };
    const det = card.querySelector('details'); const mb = card.querySelector('[data-more]');
    det.addEventListener('toggle', () => { if (!det.open) return; mb.innerHTML = moreHtml(s); wireMore(); });
    function wireMore() {
      const ot = mb.querySelector('[data-owntext]'); if (ot) ot.onclick = () => { A.D.ruleText[s.key] = { bn: mb.querySelector('[data-tbn]').value.trim(), en: mb.querySelector('[data-ten]').value.trim() }; A.commit('Own customer text: ' + s.title[0]); A.toast(t('Your text is saved and shown on the shop', 'আপনার লেখা সেভ হয়েছে, দোকানে দেখাবে'), 'good'); A.render(); };
      const at = mb.querySelector('[data-autotext]'); if (at) at.onclick = () => { delete A.D.ruleText[s.key]; A.commit('Automatic text: ' + s.title[0]); A.toast(t('Back to automatic text', 'অটো লেখায় ফেরত'), 'good'); A.render(); };
      const tr = mb.querySelector('[data-try]'); if (tr) tr.onclick = () => { const r = s.sim(cur()); mb.querySelector('[data-tryout]').innerHTML = U.callout(t(r[0], r[1]), 'info', 'info'); };
      A.on(mb, '[data-undo]', 'click', (e, b) => { const h = A.D.ruleLog[s.key][+b.dataset.undo]; const go = () => applyChange(s, clone(h.val), 'undo'); if (s.money) pinAsk(t('Go back to this value?', 'এই মানে ফেরত যাবেন?'), `<p>${t(s.title[0], s.title[1])}: <b>${s.summary(s.get())}</b> → <b>${s.summary(h.val)}</b></p>`, t('Undo', 'ফেরত যান'), go); else U.confirm(t('Go back to this value?', 'এই মানে ফেরত যাবেন?'), `${s.summary(s.get())} → ${s.summary(h.val)}`, t('Undo', 'ফেরত যান'), go); });
    }
    card.querySelector('[data-save]').onclick = () => {
      const nv = cur(); const err = s.check ? s.check(nv) : ''; if (err) return A.toast(err, 'bad');
      const fromEl = mb.querySelector('[data-from]'); const from = fromEl && fromEl.value;
      if (JSON.stringify(nv) === JSON.stringify(s.get())) return A.toast(t('Nothing changed', 'কিছু বদলায়নি'));
      const body = `<p style="margin:0 0 6px">${t(s.title[0], s.title[1])}</p><div class="small">${t('Now', 'এখন')}: <b>${s.summary(s.get())}</b></div><div class="small">${t('New', 'নতুন')}: <b>${s.summary(nv)}</b></div>${from && from > TODAY() ? `<div class="small" style="margin-top:6px">${t('Starts on', 'শুরু')} <b>${dshort(from)}</b></div>` : ''}`;
      const go = () => {
        if (from && from > TODAY()) { A.D.ruleSched[s.key] = { from, val: nv }; A.commit(`Rule scheduled: ${s.title[0]} from ${from}`); A.toast(t(`Scheduled for ${dshort(from)}`, `${dshort(from)} থেকে শিডিউল হয়েছে`), 'good'); A.render(); }
        else applyChange(s, nv);
      };
      if (s.money) pinAsk(t('Save this change?', 'এই পরিবর্তন সেভ করবেন?'), body, t('Save', 'সেভ'), go); else go();
    };
  }
  function runScheds() { for (const k of Object.keys(A.D.ruleSched || {})) { const sc = A.D.ruleSched[k]; const s = spec(k); if (s && sc.from <= TODAY()) { s.set(sc.val); delete A.D.ruleSched[k]; A.commit('Scheduled rule started: ' + s.title[0]); } } }
  function tabPage(el, r, tab, sub, extra) {
    store(); runScheds();
    const cards = SPECS.filter((s) => s.tab === tab);
    el.innerHTML = A.pageHead(t('Rules', 'নিয়ম'), sub) + A.tabsBar('rules', tab) + `<div class="grid ${cards.length > 1 ? 'g2' : ''}" style="align-items:start">${cards.map(cardHtml).join('')}</div>${extra ? extra() : ''}`;
    el.querySelectorAll('.rl-card').forEach(wireCard);
    if (r.id) { const c = el.querySelector('#rc-' + r.id); if (c) { c.classList.add('hl'); setTimeout(() => c.scrollIntoView({ block: 'start' }), 40); } }
  }

  /* ---------- checkout simulator ---------- */
  const couponOk = (c) => c.on && (!c.ends || c.ends >= TODAY()) && (!c.limit || usage(c.code).n < c.limit);
  const usage = (code) => { const os = A.D.orders.filter((o) => o.coupon === code && o.status !== 'cancelled'); return { n: os.length, sales: A.sum(os, (o) => o.total), off: A.sum(os, (o) => o.discount) }; };
  function checkout(q) {
    const rr = R(); const lines = []; let sub = q.cart;
    const dsc = A.D.discounts.find((d) => discStatus(d) === 'run' && (d.on === 'all' || (d.on === 'cat' && d.target === q.cat)));
    let dOff = 0; if (dsc) { dOff = dsc.type === 'percent' ? Math.round(sub * dsc.value / 100) : dsc.type === 'flat' ? dsc.value * q.pcs : 0; if (dOff) lines.push([t('Sale price: ', 'সেল: ') + dsc.name, -dOff]); }
    const base = sub - dOff;
    let bm = 0; if (rr.buyMore.on && q.pcs >= 2) { const off = q.pcs >= 3 ? rr.buyMore.tiers[1].off : rr.buyMore.tiers[0].off; bm = Math.round(base * off / 100); }
    let cp = 0, cpNote = '', freeShip = false; const c = q.coupon && A.D.coupons.find((x) => x.code === q.coupon);
    if (c) { if (!couponOk(c)) cpNote = t('Coupon is off or ended', 'কুপন বন্ধ বা মেয়াদ শেষ'); else if (base < c.min) cpNote = t(`Needs order over ${tk(c.min)}`, `${tk(c.min)} এর বেশি অর্ডার লাগবে`); else if (c.who === 'first' && !q.isNew) cpNote = t('Only for first order', 'শুধু প্রথম অর্ডারে'); else if (c.type === 'percent') cp = Math.min(c.maxOff || 1e9, Math.round(base * c.value / 100)); else if (c.type === 'flat') cp = c.value; else if (c.type === 'freeship') freeShip = true; }
    if (cp && bm) { if (cp >= bm) { bm = 0; cpNote = t('Bigger than buy-more discount, so coupon used', 'বেশি কিনলে ছাড়ের চেয়ে বড়, তাই কুপন'); } else { cp = 0; cpNote = t('Buy-more discount is bigger, so coupon not used', 'বেশি কিনলে ছাড় বড়, তাই কুপন লাগেনি'); } }
    if (bm) lines.push([t(`Buy more, save (${q.pcs} pcs)`, `বেশি কিনলে ছাড় (${q.pcs} পিস)`), -bm]);
    if (cp) lines.push([t('Coupon ', 'কুপন ') + c.code, -cp]);
    const after = base - bm - cp;
    let del = freeShip ? 0 : A.calc.deliveryFee(q.zone, after); const zoneFee = rr.delivery[q.zone].fee;
    let pp = 0; if (q.pay !== 'COD' && rr.wallets.prepaidOn) { pp = rr.wallets.prepaidType === 'percent' ? Math.round(after * rr.wallets.prepaidOff / 100) : rr.wallets.prepaidOff; if (pp) lines.push([t('Paid online discount', 'অনলাইন পেমেন্ট ছাড়'), -pp]); }
    const total = after + del - pp;
    const codOk = rr.cod.on && total <= rr.cod.max;
    const firsts = { has: () => q.isNew };
    const adv = q.pay === 'COD' && codOk && needsAdvance({ payment: 'COD', id: 'x', total, zone: q.zone, risk: q.risk ? 'high' : 'low' }, rr.advance, firsts) ? (rr.advance.type === 'delivery' ? (del || zoneFee) : Math.round(total * rr.advance.percent / 100)) : 0;
    return { sub, lines, after, del, zoneFee, freeShip, total, codOk, adv, cpNote, dsc };
  }
  function simulator() {
    const cs = A.D.coupons.map((c) => [c.code, c.code + (couponOk(c) ? '' : t(' (off)', ' (বন্ধ)'))]);
    return U.card(t('Checkout simulator', 'চেকআউট সিমুলেটর'), `<div class="grid g2" style="align-items:start"><div class="stack">
      <div class="formgrid">${U.field(t('Delivery area', 'ডেলিভারি এলাকা'), U.select('cs-zone', [['inside', zn('inside')], ['sub', zn('sub')], ['outside', zn('outside')]], 'inside'))}${U.field(t('Cart value', 'কার্টের দাম'), U.money('cs-cart', 2400))}${U.field(t('Pieces', 'পিস'), U.input('cs-pcs', 2, 'type="number" min="1" max="20"'))}${U.field(t('Category', 'ক্যাটাগরি'), U.select('cs-cat', A.CATS.map((c) => [c.id, t(c.en, c.bn)]), 'tshirt'))}${U.field(t('Payment', 'পেমেন্ট'), U.select('cs-pay', [['COD', t('Cash on delivery', 'ক্যাশ অন ডেলিভারি')], ['bKash', 'bKash'], ['Nagad', 'Nagad'], ['Card', t('Card', 'কার্ড')]], 'COD'))}${U.field(t('Coupon', 'কুপন'), U.select('cs-cp', [['', t('No coupon', 'কুপন নেই')]].concat(cs), ''))}</div>
      <label class="rl-check"><input type="checkbox" id="cs-new" checked> ${t('New customer (first order)', 'নতুন কাস্টমার (প্রথম অর্ডার)')}</label>
      <label class="rl-check"><input type="checkbox" id="cs-risk"> ${t('Phone number refused parcels before', 'এই নম্বর আগে পার্সেল ফেরত দিয়েছে')}</label></div>
      <div id="cs-out"></div></div>`, { sub: t('Pick a customer and cart: see exactly what they pay with all your rules working together.', 'কাস্টমার ও কার্ট বেছে নিন: সব নিয়ম মিলিয়ে কাস্টমার ঠিক কত দেবেন দেখুন।') });
  }
  function wireSim(el) {
    const out = el.querySelector('#cs-out'); if (!out) return;
    const draw = () => {
      const q = { zone: el.querySelector('#cs-zone').value, cart: +el.querySelector('#cs-cart').value || 0, pcs: Math.max(1, +el.querySelector('#cs-pcs').value || 1), cat: el.querySelector('#cs-cat').value, pay: el.querySelector('#cs-pay').value, coupon: el.querySelector('#cs-cp').value, isNew: el.querySelector('#cs-new').checked, risk: el.querySelector('#cs-risk').checked };
      const x = checkout(q); const rr = R();
      const delLine = x.del ? [t(`Delivery (${zn(q.zone)}, ${rr.delivery[q.zone].days} days)`, `ডেলিভারি (${zn(q.zone)}, ${rr.delivery[q.zone].days} দিন)`), tk(x.del)] : [t('Delivery', 'ডেলিভারি'), `<span class="g">${t('Free', 'ফ্রি')}</span> <s class="muted">${tk(x.zoneFee)}</s>`];
      const toFree = rr.freeDelivery.on && x.del ? rr.freeDelivery.over - x.after : 0;
      out.innerHTML = `<div class="rl-rcpt card flat tight"><div class="ln"><span>${t('Products', 'প্রোডাক্ট')} (${q.pcs} ${t('pcs', 'পিস')})</span><b>${tk(x.sub)}</b></div>${x.lines.map((l) => `<div class="ln"><span>${l[0]}</span><b class="g">−${tk(-l[1]).replace('৳', '৳')}</b></div>`).join('')}<div class="ln"><span>${delLine[0]}</span><b>${delLine[1]}</b></div><div class="ln tot"><span>${t('Customer pays', 'কাস্টমার দেবেন')}</span><span>${tk(x.total)}</span></div></div>
        <div class="stack" style="margin-top:10px">
        ${q.pay === 'COD' ? (x.codOk ? U.callout(x.adv ? t(`Cash on delivery allowed, but <b>${tk(x.adv)} advance</b> is needed by bKash/Nagad first. Rest ${tk(x.total - x.adv)} cash at the door.`, `ক্যাশ অন ডেলিভারি হবে, কিন্তু আগে <b>${tk(x.adv)} অগ্রিম</b> bKash/Nagad এ লাগবে। বাকি ${tk(x.total - x.adv)} দরজায় ক্যাশ।`) : t('Cash on delivery allowed. No advance needed.', 'ক্যাশ অন ডেলিভারি হবে। অগ্রিম লাগবে না।'), x.adv ? 'warn' : 'good', x.adv ? 'warn' : 'check') : U.callout(t(`Cash on delivery not offered (${rr.cod.on ? 'over ' + tk(rr.cod.max) : 'turned off'}). Customer must pay online.`, `ক্যাশ অন ডেলিভারি হবে না (${rr.cod.on ? tk(rr.cod.max) + ' এর বেশি' : 'বন্ধ'})। অনলাইনে পেমেন্ট লাগবে।`), 'bad', 'warn')) : U.callout(t('Paid online — no advance or cash collection needed.', 'অনলাইনে পেমেন্ট — অগ্রিম বা ক্যাশ লাগবে না।'), 'good', 'check')}
        ${x.cpNote ? `<div class="small muted">${t('Coupon', 'কুপন')}: ${x.cpNote}</div>` : ''}
        ${toFree > 0 ? `<div class="small">💡 ${t(`Add ${tk(toFree)} more for free delivery — the shop shows this to the customer.`, `আর ${tk(toFree)} কিনলে ফ্রি ডেলিভারি — দোকান কাস্টমারকে এটা দেখাবে।`)}</div>` : ''}
        ${rr.eid.on ? `<div class="small">${t('Eid: last order day', 'ঈদ: শেষ অর্ডার')} ${dshort(q.zone === 'outside' ? rr.eid.outsideLast : rr.eid.insideLast)}</div>` : ''}</div>`;
    };
    el.querySelectorAll('#cs-zone,#cs-cart,#cs-pcs,#cs-cat,#cs-pay,#cs-cp,#cs-new,#cs-risk').forEach((i) => { i.addEventListener('input', draw); i.addEventListener('change', draw); });
    draw();
  }

  /* ---------- discounts & coupons ---------- */
  const discStatus = (d) => (!d.active ? 'off' : d.to < TODAY() ? 'ended' : d.from > TODAY() ? 'soon' : 'run');
  const discBadge = (d) => ({ off: U.badge(t('Off', 'বন্ধ')), ended: U.badge(t('Ended', 'শেষ')), soon: U.badge(t('Starts ' + dshort(d.from), dshort(d.from) + ' থেকে'), 'info'), run: U.badge(t('Running', 'চলছে'), 'good') }[discStatus(d)]);
  const discOffer = (d) => (d.type === 'percent' ? d.value + t('% off', '% ছাড়') : d.type === 'flat' ? tk(d.value) + t(' off each', ' ছাড় প্রতি পিসে') : t(`Buy ${d.x || 2} get ${d.y || 1} free`, `${d.x || 2}টা কিনলে ${d.y || 1}টা ফ্রি`));
  const discTarget = (d) => (d.on === 'all' ? t('All products', 'সব প্রোডাক্ট') : d.on === 'cat' ? catName(d.target) : (d.pids || []).length + t(' products', 'টি প্রোডাক্ট'));
  const discProducts = (d) => A.D.products.filter((p) => p.status === 'live' && (d.on === 'all' || (d.on === 'cat' && p.cat === d.target) || (d.on === 'products' && (d.pids || []).includes(p.id))));
  const salePrice = (d, p) => (d.type === 'percent' ? Math.round(p.price * (1 - d.value / 100)) : d.type === 'flat' ? p.price - d.value : Math.round(p.price * (d.x || 2) / ((d.x || 2) + (d.y || 1))));
  function marginCheck(d) {
    const ps = discProducts(d); if (!ps.length) return U.callout(t('No live products picked yet.', 'এখনো কোনো লাইভ প্রোডাক্ট বাছা হয়নি।'), 'warn', 'warn');
    const rows = ps.map((p) => { const sp = salePrice(d, p); return { p, sp, m: sp > 0 ? (sp - p.cost) / sp * 100 : -100 }; }).sort((a, b) => a.m - b.m);
    const loss = rows.filter((x) => x.m < 0).length, thin = rows.filter((x) => x.m >= 0 && x.m < 20).length, w = rows[0];
    const txt = t(`${ps.length} products. Lowest margin: <b>${esc(w.p.name)}</b> ${tk(w.p.price)} → ${tk(w.sp)}, buying price ${tk(w.p.cost)}, margin ${A.fmt.pct(w.m, 0)}.`, `${ps.length}টি প্রোডাক্ট। সবচেয়ে কম লাভ: <b>${esc(w.p.name)}</b> ${tk(w.p.price)} → ${tk(w.sp)}, কেনা দাম ${tk(w.p.cost)}, লাভ ${A.fmt.pct(w.m, 0)}।`);
    if (loss) return U.callout(txt + '<br>' + t(`<b>${loss} products would sell below buying price.</b>`, `<b>${loss}টি প্রোডাক্ট কেনা দামের নিচে বিক্রি হবে।</b>`), 'bad', 'warn');
    if (thin) return U.callout(txt + '<br>' + t(`${thin} products would keep less than 20% margin (before delivery and ads).`, `${thin}টি প্রোডাক্টে লাভ 20% এর কম থাকবে (ডেলিভারি ও বিজ্ঞাপনের আগে)।`), 'warn', 'warn');
    return U.callout(txt + ' ' + t('Margins look safe.', 'লাভ ঠিক আছে।'), 'good', 'check');
  }
  function discountModal(d0) {
    const d = d0 ? clone(d0) : { id: A.uid('DS'), name: '', type: 'percent', value: 10, x: 2, y: 1, on: 'cat', target: 'polo', pids: [], from: TODAY(), to: A.fmt.ymd(A.TODAY.getTime() + 7 * 864e5), active: true };
    const live = A.D.products.filter((p) => p.status === 'live');
    const m = U.modal(d0 ? t('Edit discount', 'ছাড় এডিট') : t('New discount', 'নতুন ছাড়'), `<div class="stack">
      <div class="field"><label>${t('Type', 'ধরন')}</label>${U.seg('dm-type', [['percent', '% ' + t('off', 'ছাড়')], ['flat', '৳ ' + t('off', 'ছাড়')], ['bxgy', t('Buy X get Y', 'X কিনলে Y ফ্রি')]], d.type)}</div>
      <div class="formgrid"><div data-v1>${U.field(t('Amount', 'পরিমাণ'), U.input('dm-v', d.value, 'type="number" min="1"'))}</div><div data-v2>${U.field(t('Buy', 'কিনলে'), U.input('dm-x', d.x || 2, 'type="number" min="1"'))}</div><div data-v2>${U.field(t('Get free', 'ফ্রি'), U.input('dm-y', d.y || 1, 'type="number" min="1"'))}</div></div>
      <div class="field"><label>${t('On', 'কোথায়')}</label>${U.seg('dm-on', [['all', t('All products', 'সব প্রোডাক্ট')], ['cat', t('A category', 'একটি ক্যাটাগরি')], ['products', t('Chosen products', 'বাছাই প্রোডাক্ট')]], d.on)}</div>
      <div data-oncat>${U.select('dm-cat', A.CATS.map((c) => [c.id, t(c.en, c.bn)]), d.target || 'polo')}</div>
      <div data-onprod><input class="inp" id="dm-q" placeholder="${t('Search products…', 'প্রোডাক্ট খুঁজুন…')}"><div id="dm-pl" class="list" style="max-height:180px;overflow:auto;margin-top:6px"></div></div>
      <div class="formgrid">${U.field(t('From', 'শুরু'), U.input('dm-from', d.from, 'type="date"'))}${U.field(t('Until', 'শেষ'), U.input('dm-to', d.to, 'type="date"'))}${U.field(t('Name (optional)', 'নাম (ঐচ্ছিক)'), U.input('dm-name', d.name, `placeholder="${t('Made automatically', 'নিজে থেকে তৈরি হবে')}"`))}</div>
      <div class="rl-prev"><div class="rl-prev-h">${t('Customer sees', 'কাস্টমার দেখবেন')}</div><div id="dm-prev"></div></div><div id="dm-margin"></div></div>`,
      { wide: true, foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="dm-save">${t('Save discount', 'ছাড় সেভ')}</button>` });
    const rd = () => { d.type = segv(m, 'dm-type'); d.value = num(m, 'dm-v'); d.x = num(m, 'dm-x'); d.y = num(m, 'dm-y'); d.on = segv(m, 'dm-on'); d.target = val(m, 'dm-cat'); d.from = val(m, 'dm-from'); d.to = val(m, 'dm-to'); d.name = val(m, 'dm-name'); };
    const drawList = () => { const q = val(m, 'dm-q').toLowerCase(); m.querySelector('#dm-pl').innerHTML = live.filter((p) => !q || p.name.toLowerCase().includes(q) || p.styleCode.toLowerCase().includes(q)).slice(0, 40).map((p) => `<label class="li rl-check"><input type="checkbox" data-pid="${p.id}" ${d.pids.includes(p.id) ? 'checked' : ''}>${U.thumb(p, 28)}<span class="grow ellip">${esc(p.name)}</span><span class="muted small">${tk(p.price)}</span></label>`).join(''); m.querySelectorAll('[data-pid]').forEach((c) => (c.onchange = () => { d.pids = c.checked ? d.pids.concat(c.dataset.pid) : d.pids.filter((x) => x !== c.dataset.pid); upd(); })); };
    const upd = () => { rd(); m.querySelector('[data-v1]').style.display = d.type === 'bxgy' ? 'none' : ''; m.querySelectorAll('[data-v2]').forEach((x) => (x.style.display = d.type === 'bxgy' ? '' : 'none')); m.querySelector('[data-oncat]').style.display = d.on === 'cat' ? '' : 'none'; m.querySelector('[data-onprod]').style.display = d.on === 'products' ? '' : 'none';
      const tg = d.on === 'all' ? ['everything', 'সব প্রোডাক্টে'] : d.on === 'cat' ? catNameBoth(d.target) : ['selected items', 'বাছাই করা প্রোডাক্টে'];
      const off = d.type === 'percent' ? [`${d.value}% off`, `${d.value}% ছাড়`] : d.type === 'flat' ? [`${tk(d.value)} off`, `${tk(d.value)} ছাড়`] : [`buy ${d.x} get ${d.y} free`, `${d.x}টা কিনলে ${d.y}টা ফ্রি`];
      m.querySelector('#dm-prev').innerHTML = `<div class="bn" style="font-family:var(--f-bn)">${tg[1]} ${off[1]} · ${dshort(d.to)} পর্যন্ত</div><div class="small muted">${off[0]} on ${tg[0]} · until ${dshort(d.to)}. ${t('Old price is shown crossed out.', 'পুরনো দাম কাটা দাগে দেখাবে।')}</div>`;
      m.querySelector('#dm-margin').innerHTML = marginCheck(d); };
    A.on(m, '.seg button', 'click', (e, b) => { b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); upd(); });
    m.addEventListener('input', (e) => { if (e.target.id === 'dm-q') drawList(); upd(); }); m.addEventListener('change', upd);
    drawList(); upd();
    m.querySelector('#dm-save').onclick = () => { rd(); if (d.type !== 'bxgy' && !(d.value > 0)) return A.toast(t('Enter the amount', 'পরিমাণ দিন'), 'bad'); if (d.to < d.from) return A.toast(t('"Until" must be after "From"', '"শেষ" তারিখ "শুরু" র পরে হতে হবে'), 'bad'); if (d.on === 'products' && !d.pids.length) return A.toast(t('Pick at least one product', 'অন্তত একটি প্রোডাক্ট বাছুন'), 'bad');
      if (!d.name) d.name = `${d.type === 'percent' ? d.value + '% off' : d.type === 'flat' ? '৳' + d.value + ' off' : `Buy ${d.x} get ${d.y}`} · ${d.on === 'all' ? 'All products' : d.on === 'cat' ? catNameBoth(d.target)[0] : d.pids.length + ' products'}`;
      pinAsk(t('Save this discount?', 'এই ছাড় সেভ করবেন?'), `<p><b>${esc(d.name)}</b><br>${discOffer(d)} · ${discTarget(d)} · ${dshort(d.from)}–${dshort(d.to)}</p>`, t('Save', 'সেভ'), () => { const i = A.D.discounts.findIndex((x) => x.id === d.id); if (i >= 0) A.D.discounts[i] = d; else A.D.discounts.unshift(d); A.commit('Discount saved: ' + d.name); A.toast(t('Discount saved. Prices on the shop update now.', 'ছাড় সেভ হয়েছে। দোকানে দাম এখনই বদলাবে।'), 'good'); A.render(); }); };
  }
  const couponOffer = (c) => (c.type === 'percent' ? `${c.value}%${c.maxOff ? t(` (up to ${tk(c.maxOff)})`, ` (সর্বোচ্চ ${tk(c.maxOff)})`) : ''}` : c.type === 'flat' ? tk(c.value) : t('Free delivery', 'ফ্রি ডেলিভারি'));
  const whoName = (w) => ({ all: t('Everyone', 'সবাই'), first: t('First order', 'প্রথম অর্ডার'), members: t('Members', 'মেম্বার') }[w] || w);
  const couponText = (c) => { const off = c.type === 'percent' ? [`${c.value}% off${c.maxOff ? ` (up to ${tk(c.maxOff)})` : ''}`, `${c.value}% ছাড়${c.maxOff ? ` (সর্বোচ্চ ${tk(c.maxOff)})` : ''}`] : c.type === 'flat' ? [`${tk(c.value)} off`, `${tk(c.value)} ছাড়`] : ['free delivery', 'ফ্রি ডেলিভারি']; const who = { all: ['', ''], first: [' on your first order', ' প্রথম অর্ডারে'], members: [' for members', ' মেম্বারদের জন্য'] }[c.who]; return { en: `Use code ${c.code || '…'}: ${off[0]}${who[0]} on orders over ${tk(c.min)}${c.ends ? `. Ends ${dshort(c.ends)}` : ''}.`, bn: `কোড ${c.code || '…'} দিলে${who[1]} ${tk(c.min)} এর বেশি অর্ডারে ${off[1]}${c.ends ? `। ${dshort(c.ends)} পর্যন্ত` : ''}` }; };
  function couponModal() {
    const c = { id: A.uid('CP'), code: '', type: 'percent', value: 10, maxOff: 300, min: 1500, uses: 0, limit: 200, perCustomer: 1, who: 'all', on: true, ends: A.fmt.ymd(A.TODAY.getTime() + 14 * 864e5) };
    const p30 = A.calc.pnl(A.calc.range('30d').from, A.calc.range('30d').to); const avgProfit = p30.delivered ? p30.gross / p30.delivered : 0; const k = A.calc.kpis(A.calc.range('30d')).cur;
    const m = U.modal(t('New coupon', 'নতুন কুপন'), `<div class="stack"><div class="formgrid">${U.field(t('Code', 'কোড'), U.input('cm-code', '', 'placeholder="WINTER15" style="text-transform:uppercase"'))}<div class="field"><label>${t('Type', 'ধরন')}</label>${U.seg('cm-type', [['percent', '%'], ['flat', '৳'], ['freeship', t('Free delivery', 'ফ্রি ডেলিভারি')]], 'percent')}</div></div>
      <div class="formgrid"><div data-cv>${U.field(t('Amount', 'পরিমাণ'), U.input('cm-v', 10, 'type="number" min="1"'))}</div><div data-cmax>${U.field(t('Most off per order', 'অর্ডারে সর্বোচ্চ ছাড়'), U.money('cm-max', 300))}</div>${U.field(t('Minimum order', 'সর্বনিম্ন অর্ডার'), U.money('cm-min', 1500))}${U.field(t('Total uses (0 = no limit)', 'মোট কত বার (0 = সীমা নেই)'), U.input('cm-lim', 200, 'type="number" min="0"'))}${U.field(t('Uses per customer', 'প্রতি কাস্টমার কত বার'), U.input('cm-per', 1, 'type="number" min="1"'))}${U.field(t('Ends', 'শেষ'), U.input('cm-end', c.ends, 'type="date"'))}</div>
      <div class="field"><label>${t('Who can use it', 'কে ব্যবহার করতে পারবে')}</label>${U.seg('cm-who', [['all', whoName('all')], ['first', whoName('first')], ['members', whoName('members')]], 'all')}</div>
      <div class="rl-prev"><div class="rl-prev-h">${t('Customer sees', 'কাস্টমার দেখবেন')}</div><div id="cm-prev"></div></div><div id="cm-hint"></div></div>`,
      { wide: true, foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="cm-save">${t('Create coupon', 'কুপন তৈরি')}</button>` });
    const rd = () => { c.code = val(m, 'cm-code').toUpperCase().replace(/[^A-Z0-9]/g, ''); c.type = segv(m, 'cm-type'); c.value = num(m, 'cm-v'); c.maxOff = c.type === 'percent' ? num(m, 'cm-max') : 0; c.min = num(m, 'cm-min'); c.limit = num(m, 'cm-lim'); c.perCustomer = num(m, 'cm-per') || 1; c.ends = val(m, 'cm-end'); c.who = segv(m, 'cm-who'); };
    const upd = () => { rd(); m.querySelector('[data-cv]').style.display = c.type === 'freeship' ? 'none' : ''; m.querySelector('[data-cmax]').style.display = c.type === 'percent' ? '' : 'none'; const x = couponText(c); m.querySelector('#cm-prev').innerHTML = `<div class="bn" style="font-family:var(--f-bn)">${esc(x.bn)}</div><div class="small muted">${esc(x.en)}</div>`;
      const aov = Math.max(k.aov, c.min); const off = c.type === 'percent' ? Math.min(c.maxOff || 1e9, Math.round(aov * c.value / 100)) : c.type === 'flat' ? c.value : R().delivery.inside.fee; const share = avgProfit ? off / avgProfit * 100 : 0;
      m.querySelector('#cm-hint').innerHTML = U.callout(t(`On a typical order of ${tk(aov)} this gives ${tk(off)} off — ${A.fmt.pct(share, 0)} of your average profit per delivered order (${tk(avgProfit)}).`, `${tk(aov)} এর সাধারণ অর্ডারে ${tk(off)} ছাড় — ডেলিভারি হওয়া অর্ডারে আপনার গড় লাভের (${tk(avgProfit)}) ${A.fmt.pct(share, 0)}।`), share > 50 ? 'warn' : 'info', share > 50 ? 'warn' : 'info'); };
    A.on(m, '.seg button', 'click', (e, b) => { b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); upd(); });
    m.addEventListener('input', upd); upd();
    m.querySelector('#cm-save').onclick = () => { rd(); if (c.code.length < 3) return A.toast(t('Code needs at least 3 letters or numbers', 'কোডে অন্তত 3টি অক্ষর বা সংখ্যা লাগবে'), 'bad'); if (A.D.coupons.some((x) => x.code === c.code)) return A.toast(t('This code already exists', 'এই কোড আগেই আছে'), 'bad'); if (c.type !== 'freeship' && !(c.value > 0)) return A.toast(t('Enter the amount', 'পরিমাণ দিন'), 'bad');
      pinAsk(t('Create this coupon?', 'এই কুপন তৈরি করবেন?'), `<p><b class="mono">${c.code}</b> · ${couponOffer(c)} · ${t('min', 'সর্বনিম্ন')} ${tk(c.min)}</p>`, t('Create', 'তৈরি করুন'), () => { A.D.coupons.unshift(c); A.commit('Coupon created: ' + c.code); A.toast(t(`Coupon ${c.code} is live`, `কুপন ${c.code} চালু হয়েছে`), 'good'); A.render(); }); };
  }
  function couponDrawer(c) {
    const u = usage(c.code); const st = !c.on ? t('Off', 'বন্ধ') : c.ends && c.ends < TODAY() ? t('Ended', 'শেষ') : t('Running', 'চলছে'); const x = couponText(c);
    const os = A.D.orders.filter((o) => o.coupon === c.code && o.status !== 'cancelled').slice(0, 8);
    const dr = U.drawer(t('Coupon ', 'কুপন ') + c.code, `<div class="stack"><div class="grid g2">${U.kpi({ label: t('Used', 'ব্যবহার'), value: A.fmt.num(u.n) + (c.limit ? ' / ' + c.limit : ''), sub: st })}${U.kpi({ label: t('Sales with this code', 'এই কোডে বিক্রি'), value: tk(u.sales) })}${U.kpi({ label: t('Discount given', 'ছাড় দেওয়া হয়েছে'), value: tk(u.off) })}${U.kpi({ label: t('Average order', 'গড় অর্ডার'), value: tk(u.n ? u.sales / u.n : 0) })}</div>
      <div class="rl-prev"><div class="rl-prev-h">${t('Customer sees', 'কাস্টমার দেখবেন')}</div><div class="bn" style="font-family:var(--f-bn)">${esc(x.bn)}</div><div class="small muted">${esc(x.en)}</div></div>
      ${U.card(t('Latest orders with this code', 'এই কোডের সাম্প্রতিক অর্ডার'), os.length ? `<div class="list">${os.map((o) => `<a class="li" href="${A.href('orders', 'all', o.id)}" data-close style="text-decoration:none;color:inherit"><span class="mono small">${o.id}</span><span class="grow ellip small">${esc(o.name)}</span><b class="small">${tk(o.total)}</b></a>`).join('')}</div>` : U.empty(t('Not used yet', 'এখনো ব্যবহার হয়নি')), { cls: 'flat' })}</div>`,
      { foot: `<button class="btn" id="cd-copy">${t('Copy code', 'কোড কপি')}</button>${c.on ? `<button class="btn danger" id="cd-off">${t('Turn off', 'বন্ধ করুন')}</button>` : `<button class="btn primary" id="cd-on">${t('Turn on', 'চালু করুন')}</button>`}` });
    dr.parentNode.querySelector('#cd-copy').onclick = () => U.copy(c.code);
    const off = dr.parentNode.querySelector('#cd-off'); if (off) off.onclick = () => setCoupon(c, false);
    const on = dr.parentNode.querySelector('#cd-on'); if (on) on.onclick = () => setCoupon(c, true);
  }
  function setCoupon(c, on) {
    const go = () => { c.on = on; A.commit(`Coupon ${c.code} turned ${on ? 'on' : 'off'}`); A.toast(on ? t(`${c.code} is on`, `${c.code} চালু`) : t(`${c.code} is off. Customers can no longer use it.`, `${c.code} বন্ধ। কাস্টমার আর ব্যবহার করতে পারবেন না।`), 'good'); U.close(); A.render(); };
    if (on) pinAsk(t('Turn this coupon on?', 'এই কুপন চালু করবেন?'), `<p><b class="mono">${c.code}</b> · ${couponOffer(c)}</p>`, t('Turn on', 'চালু করুন'), go); else go();
  }
  function setDiscount(d, on) {
    const go = () => { d.active = on; A.commit(`Discount ${d.name} turned ${on ? 'on' : 'off'}`); A.toast(on ? t('Discount on', 'ছাড় চালু') : t('Discount off. Normal prices are back.', 'ছাড় বন্ধ। আগের দাম ফিরেছে।'), 'good'); A.render(); };
    if (on) pinAsk(t('Turn this discount on?', 'এই ছাড় চালু করবেন?'), `<p><b>${esc(d.name)}</b><br>${discOffer(d)} · ${discTarget(d)}</p>`, t('Turn on', 'চালু করুন'), go); else go();
  }
  function discountsPage(el, r) {
    store(); runScheds();
    const st = A._rlCpF || 'all';
    const cps = A.D.coupons.filter((c) => st === 'all' || (st === 'on' ? c.on && (!c.ends || c.ends >= TODAY()) : !c.on || (c.ends && c.ends < TODAY())));
    const r30 = A.calc.range('30d'); const os30 = A.calc.ordersIn(r30.from, r30.to).filter((o) => o.status !== 'cancelled'); const withCp = os30.filter((o) => o.coupon); const disc30 = A.sum(os30, (o) => o.discount);
    const best = A.D.coupons.map((c) => ({ c, u: usage(c.code) })).sort((a, b) => b.u.sales - a.u.sales)[0];
    el.innerHTML = A.pageHead(t('Rules', 'নিয়ম'), t('Sale prices, coupon codes and buy-more savings.', 'সেল দাম, কুপন কোড ও বেশি কিনলে ছাড়।'), `<button class="btn" id="rl-newd">${A.icon('plus')} ${t('New discount', 'নতুন ছাড়')}</button><button class="btn primary" id="rl-newc">${A.icon('plus')} ${t('New coupon', 'নতুন কুপন')}</button>`) + A.tabsBar('rules', 'coupons') +
      `<div class="grid g4" style="margin-bottom:14px">${U.card('', U.kpi({ label: t('Discount given, 30 days', 'ছাড় দেওয়া, 30 দিন'), value: tk(disc30), sub: A.fmt.pct(disc30 / (A.sum(os30, (o) => o.subtotal) || 1) * 100) + t(' of product sales', ' প্রোডাক্ট বিক্রির') }))}${U.card('', U.kpi({ label: t('Orders with a coupon', 'কুপনসহ অর্ডার'), value: A.fmt.num(withCp.length), sub: A.fmt.pct(withCp.length / (os30.length || 1) * 100) + t(' of orders', ' অর্ডারের') }))}${U.card('', U.kpi({ label: t('Running discounts', 'চলমান ছাড়'), value: A.D.discounts.filter((d) => discStatus(d) === 'run').length }))}${U.card('', U.kpi({ label: t('Best coupon', 'সেরা কুপন'), value: best ? best.c.code : '—', sub: best ? tk(best.u.sales) + t(' sales', ' বিক্রি') : '' }))}</div>` +
      U.card(t('Discounts (sale prices)', 'ছাড় (সেল দাম)'), U.table([
        { h: t('Discount', 'ছাড়'), f: (d) => `<b>${esc(d.name)}</b><div class="muted small">${discOffer(d)}</div>` },
        { h: t('On', 'কোথায়'), f: (d) => discTarget(d), hide: true },
        { h: t('Dates', 'তারিখ'), f: (d) => `${dshort(d.from)} – ${dshort(d.to)}`, hide: true },
        { h: t('Status', 'অবস্থা'), f: discBadge },
        { h: '', r: true, f: (d) => U.switch('ds-' + d.id, d.active, `data-dsw="${d.id}"`) },
      ], A.D.discounts.map((d) => ({ ...d, _id: d.id })), { onRow: true }), { sub: t('Shown on the shop as the old price crossed out. Click a row to edit.', 'দোকানে পুরনো দাম কেটে দেখাবে। এডিট করতে সারিতে ক্লিক করুন।') }) +
      `<div style="height:14px"></div>` +
      U.card(t('Coupon codes', 'কুপন কোড'), `<div class="chips" style="margin-bottom:10px">${[['all', t('All', 'সব')], ['on', t('Running', 'চলছে')], ['off', t('Off or ended', 'বন্ধ বা শেষ')]].map((c) => `<button class="chip ${st === c[0] ? 'on' : ''}" data-cpf="${c[0]}">${c[1]}</button>`).join('')}</div>` + U.table([
        { h: t('Code', 'কোড'), f: (c) => `<b class="mono">${c.code}</b><div class="muted small">${whoName(c.who)}</div>` },
        { h: t('Gives', 'ছাড়'), f: couponOffer },
        { h: t('Min order', 'সর্বনিম্ন'), r: true, f: (c) => tk(c.min), hide: true },
        { h: t('Used', 'ব্যবহার'), r: true, f: (c) => { const u = usage(c.code); return `${u.n}${c.limit ? ' / ' + c.limit : ''}${c.limit ? U.bar(u.n / c.limit * 100) : ''}`; } },
        { h: t('Ends', 'শেষ'), f: (c) => (c.ends ? (c.ends < TODAY() ? U.badge(t('Ended ', 'শেষ ') + dshort(c.ends)) : dshort(c.ends)) : t('No end', 'শেষ নেই')), hide: true },
        { h: '', r: true, f: (c) => U.switch('cp-' + c.id, c.on, `data-csw="${c.id}"`) },
      ], cps.map((c) => ({ ...c, _id: c.id })), { onRow: true }), { sub: t('Usage is counted from real orders. Click a code for its sales.', 'ব্যবহার আসল অর্ডার থেকে হিসাব হয়। বিক্রি দেখতে কোডে ক্লিক করুন।') }) +
      `<div style="height:14px"></div><div class="grid g2" style="align-items:start">${cardHtml(spec('buymore'))}<div></div></div>`;
    el.querySelector('#rl-newd').onclick = () => discountModal();
    el.querySelector('#rl-newc').onclick = () => couponModal();
    A.on(el, '[data-cpf]', 'click', (e, b) => { A._rlCpF = b.dataset.cpf; A.render(); });
    A.on(el, '.switch', 'click', (e) => e.stopPropagation());
    A.on(el, '[data-dsw]', 'change', (e, i) => { const d = A.byId(A.D.discounts, i.dataset.dsw); i.checked = d.active; setDiscount(d, !d.active); });
    A.on(el, '[data-csw]', 'change', (e, i) => { const c = A.byId(A.D.coupons, i.dataset.csw); i.checked = c.on; setCoupon(c, !c.on); });
    el.querySelectorAll('tr[data-row]').forEach((tr) => (tr.onclick = () => { const id = tr.dataset.row; const d = A.byId(A.D.discounts, id); if (d) discountModal(d); else { const c = A.byId(A.D.coupons, id); if (c) couponDrawer(c); } }));
    el.querySelectorAll('.rl-card').forEach(wireCard);
    if (r.id) { const c = el.querySelector('#rc-' + r.id); if (c) { c.classList.add('hl'); setTimeout(() => c.scrollIntoView({ block: 'start' }), 40); } }
  }

  /* ---------- order flow, courier score, customers, messages (v2) ---------- */
  const CASES = [
    ['prepaid', 'Paid in full online', 'পুরো টাকা অনলাইনে পেমেন্ট'],
    ['delivery', 'Only the delivery charge paid first', 'শুধু ডেলিভারি চার্জ আগে দেওয়া'],
    ['trusted', 'Old customer, every parcel delivered', 'পুরনো কাস্টমার, সব পার্সেল নিয়েছেন'],
    ['goodScore', 'New to us, good courier score', 'আমাদের কাছে নতুন, কুরিয়ার স্কোর ভালো'],
    ['brandNew', 'Brand-new number, no history anywhere', 'একদম নতুন নম্বর, কোথাও রেকর্ড নেই'],
    ['refused', 'Refused a parcel before', 'আগে পার্সেল ফেরত দিয়েছেন'],
    ['refusedPaid', 'Refused before, paid delivery charge at checkout', 'আগে ফেরত দিয়েছেন, এবার ডেলিভারি চার্জ আগে দিয়েছেন'],
    ['bigCod', 'Big cash order (over the COD call limit)', 'বড় ক্যাশ অর্ডার (COD কলের সীমার বেশি)'],
    ['suspicious', 'Looks fake or a duplicate', 'ভুয়া বা ডুপ্লিকেট মনে হচ্ছে'],
  ];
  const ACTS = { auto: ['Confirm by itself', 'নিজে কনফার্ম'], call: ['Call list', 'কল লিস্ট'], person: ['Red tag · a person decides', 'লাল ট্যাগ · মানুষ ঠিক করবে'] };
  const PRESETS = {
    low: { prepaid: 'auto', delivery: 'auto', trusted: 'auto', goodScore: 'auto', brandNew: 'auto', refused: 'call', refusedPaid: 'auto', bigCod: 'call', suspicious: 'person' },
    normal: { prepaid: 'auto', delivery: 'auto', trusted: 'auto', goodScore: 'auto', brandNew: 'call', refused: 'call', refusedPaid: 'auto', bigCod: 'call', suspicious: 'person' },
    strict: { prepaid: 'auto', delivery: 'call', trusted: 'auto', goodScore: 'call', brandNew: 'call', refused: 'person', refusedPaid: 'call', bigCod: 'call', suspicious: 'person' },
  };
  const METRICS = { success: ['Delivery success rate (%)', 'ডেলিভারি সফলতার হার (%)'], parcels: ['Total parcels', 'মোট পার্সেল'], returns: ['Total returns', 'মোট ফেরত'], worst: ['Worst courier success rate (%)', 'সবচেয়ে খারাপ কুরিয়ারে সফলতা (%)'], couriers: ['Couriers with a record', 'কয়টা কুরিয়ারে রেকর্ড'], fraud: ['Fraud reports by other shops', 'অন্য দোকানের ফ্রড রিপোর্ট'] };
  const DEF_SCORE = () => ({ upper: 7.5, lower: 5, metrics: [{ k: 'success', w: 30, good: 90, ok: 70 }, { k: 'parcels', w: 15, good: 10, ok: 3 }, { k: 'returns', w: 15, good: 1, ok: 3, inv: true }, { k: 'worst', w: 15, good: 80, ok: 50 }, { k: 'couriers', w: 10, good: 2, ok: 1 }, { k: 'fraud', w: 15, good: 0, ok: 1, inv: true }] });
  const EXAMPLE = { phone: '01712-345678', vals: { success: 86, parcels: 14, returns: 2, worst: 60, couriers: 3, fraud: 0 } };
  const pts = (m, x) => (m.inv ? (x <= m.good ? 10 : x <= m.ok ? 5 : 0) : (x >= m.good ? 10 : x >= m.ok ? 5 : 0));
  const scoreOf = (cs, vals) => { const W = A.sum(cs.metrics, (m) => m.w) || 1; return Math.round(A.sum(cs.metrics, (m) => pts(m, vals[m.k]) * m.w) / W * 10) / 10; };
  const hash = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 100003; return h; };
  const metricsFor = (phone) => { const h = hash(phone); const parcels = h % 23; const success = parcels ? 55 + (h % 45) : 0; return { success, parcels, returns: Math.round(parcels * (100 - success) / 100), worst: parcels ? Math.max(0, success - (h % 30)) : 0, couriers: parcels ? 1 + (h % 3) : 0, fraud: h % 17 === 0 ? 1 + (h % 2) : 0 }; };
  const bandOf = (sc, cs) => (sc >= cs.upper ? 'auto' : sc >= cs.lower ? 'call' : 'person');
  function classify(o) {
    const prior = A.D.orders.filter((x) => x.customerId === o.customerId && x.created < o.created);
    const refused = prior.filter((x) => x.status === 'returned').length; const deliv = prior.filter(A.calc.isDelivered).length;
    const cs = R().courierScore; const sc = scoreOf(cs, metricsFor(o.phone)); const cod = R().cod;
    let k;
    if (o.payment !== 'COD') k = 'prepaid';
    else if (o.risk === 'high' && !deliv) k = 'suspicious';
    else if (refused) k = 'refused';
    else if (o.total > (cod.callAbove || 5000)) k = 'bigCod';
    else if (deliv) k = 'trusted';
    else if (metricsFor(o.phone).parcels === 0) k = 'brandNew';
    else k = bandOf(sc, cs) === 'auto' ? 'goodScore' : bandOf(sc, cs) === 'person' ? 'suspicious' : 'brandNew';
    return { case: k, action: R().autoConfirm[k], score: sc };
  }
  const gradeOf = (c) => { const p = R().priority; if (!p || !p.on) return null; let g = null; p.grades.forEach((x, i) => { if ((c.spent || 0) >= x.spend && (c.delivered || 0) >= x.parcels) g = Object.assign({ idx: i }, x); }); return g; };
  const ens = () => { if (A.D && A.D.rules) ensureR3(); if (A.D && (!R().courierScore || !R().priority || !R().autoConfirm)) { store(); initV2(); } };
  A.rulesApi = { classify: (o) => { ens(); return classify(o); }, scoreOf: (vals) => { ens(); return scoreOf(R().courierScore, vals); }, metricsFor, gradeOf: (c) => { ens(); return gradeOf(c); }, band: (sc) => { ens(); return bandOf(sc, R().courierScore); }, presets: PRESETS, cases: CASES,
    courierMsg: (key, ctx) => { ens(); const AL = { booking_note: 'booking', delivery_instruction: 'delivery', cod_line: 'cod', return_pickup: 'returnpick', return_pick_up: 'returnpick', payout_note: 'payout', payout_request: 'payout' }; const m = R().courierMsgs[AL[key] || key]; if (!m) return { en: '', bn: '' }; const c = cmCtx(ctx); return { en: fillPh(m.en, c), bn: fillPh(m.bn, c) }; },
    _x: { pinAsk, couponModal, couponDrawer, discountModal, setCoupon, setDiscount, usage, couponOk, discStatus, discOffer, discTarget, couponOffer, whoName, marginCheck, cardHtml, wireCard, spec, runScheds, store, initV2, catName, popSample: () => null },
    courierMsgKeys: () => CM.map((c) => [c[0], c[1]]),
    orderFlow: () => { ens(); const r = R(); return { dupDays: r.dup.days, autoMerge: r.dup.autoMerge, autoMergeHours: r.dup.mergeHours, noMergeAfterPacked: true, adjustLimits: clone(r.adjust.roles), advanceReminderHours: r.advRemind.hours, advanceAutoCancel: r.advRemind.autoCancel, advanceCancelHours: r.advRemind.cancelHours }; },
    adjustLimit: (role) => { ens(); if (role === 'Owner') return { amount: Infinity, percent: 100 }; const x = R().adjust.roles.find((y) => y.role === role); return x ? { amount: x.amount, percent: x.percent } : { amount: 0, percent: 0 }; } };

  const actSel = (id, v, noAuto) => U.select(id, Object.keys(ACTS).filter((a) => !(noAuto && a === 'auto')).map((a) => [a, t(ACTS[a][0], ACTS[a][1])]), v);
  SPECS.push(
    { key: 'autoconfirm', tab: 'flow', title: ['Auto-confirm', 'অটো কনফার্ম'], kw: 'confirm call list trusted prepaid fraud',
      get: () => clone(R().autoConfirm), set: (v) => { R().autoConfirm = v; },
      summary: (v) => { const n = (a) => CASES.filter((c) => v[c[0]] === a).length; return t(`${n('auto')} cases confirm by themselves · ${n('call')} go to the call list · ${n('person')} get a red tag`, `${n('auto')}টি ক্ষেত্রে নিজে কনফার্ম · ${n('call')}টি কল লিস্টে · ${n('person')}টিতে লাল ট্যাগ`); },
      form: (v) => `<div class="rl-ct">${CASES.map((c) => `<div class="rl-ctr"><span>${t(c[1], c[2])}</span>${actSel('f-ac-' + c[0], v[c[0]], c[0] === 'suspicious')}</div>`).join('')}</div><div class="muted small">${t('Nothing is ever blocked by itself. The fraud level presets fill this table.', 'কোনো অর্ডার নিজে থেকে ব্লক হয় না। ফ্রড লেভেল বাছলে এই টেবিল নিজে ভরে যায়।')}</div>`,
      read: (el) => { const o = {}; CASES.forEach((c) => { o[c[0]] = val(el, 'f-ac-' + c[0]); }); return o; },
      text: () => ({ en: 'Paid orders are confirmed at once. Others may get a short call from us.', bn: 'পেমেন্ট করা অর্ডার সাথে সাথে কনফার্ম হয়। বাকিগুলোতে আমরা ছোট একটা কল করতে পারি।' }),
      sim: (v) => { const os = last30(); const c = { auto: 0, call: 0, person: 0 }; os.forEach((o) => { c[v[classify(o).case]]++; }); return [`Last 30 days (${os.length} orders): ${c.auto} would confirm by themselves · ${c.call} call list · ${c.person} red tag.`, `গত 30 দিন (${os.length}টি অর্ডার): ${c.auto}টি নিজে কনফার্ম · ${c.call}টি কল লিস্ট · ${c.person}টি লাল ট্যাগ।`]; } },
    { key: 'score', tab: 'flow', title: ['Courier score', 'কুরিয়ার স্কোর'], kw: 'score risk courier history fraud bands weight',
      get: () => clone(R().courierScore), set: (v) => { R().courierScore = v; },
      summary: (v) => t(`${v.upper}+ confirms · ${v.lower}–${(v.upper - 0.1).toFixed(1)} call list · below ${v.lower} red tag`, `${v.upper}+ নিজে কনফার্ম · ${v.lower}–${(v.upper - 0.1).toFixed(1)} কল লিস্ট · ${v.lower} এর নিচে লাল ট্যাগ`),
      form: (v) => `<div class="formgrid">${U.field(t('Confirm by itself at or above', 'এত বা বেশি হলে নিজে কনফার্ম'), U.input('f-sc-up', v.upper, 'type="number" step="0.5" min="0" max="10"'))}${U.field(t('Red tag below', 'এর নিচে লাল ট্যাগ'), U.input('f-sc-lo', v.lower, 'type="number" step="0.5" min="0" max="10"'))}</div>
        <div class="rl-sub">${t('6 checks from courier history', 'কুরিয়ার ইতিহাসের 6টি চেক')}</div>
        <div class="tbl-wrap"><table class="tbl rl-sct"><thead><tr><th>${t('Check', 'চেক')}</th><th class="r">${t('Weight', 'গুরুত্ব')}</th><th class="r">${t('10 points', '10 পয়েন্ট')}</th><th class="r">${t('5 points', '5 পয়েন্ট')}</th></tr></thead><tbody>${v.metrics.map((m, i) => `<tr><td>${t(METRICS[m.k][0], METRICS[m.k][1])}<div class="muted small">${m.inv ? t('lower is better', 'কম হলে ভালো') : t('higher is better', 'বেশি হলে ভালো')}</div></td><td class="r"><input class="inp sm" id="f-sc-w${i}" type="number" min="0" max="100" value="${m.w}"></td><td class="r"><input class="inp sm" id="f-sc-g${i}" type="number" value="${m.good}"></td><td class="r"><input class="inp sm" id="f-sc-o${i}" type="number" value="${m.ok}"></td></tr>`).join('')}</tbody></table></div>
        <div class="rl-sub">${t('Worked example', 'উদাহরণ')} · <span class="mono">${EXAMPLE.phone}</span></div><div id="f-sc-ex"></div>
        <div class="muted small">${t('Shown to your staff only, next to an AI one-line opinion. Customers never see it.', 'শুধু আপনার স্টাফ দেখবেন, পাশে AI এর এক লাইনের মত। কাস্টমার কখনো দেখবেন না।')}</div>`,
      live: (el, v) => { const x = el.querySelector('#f-sc-ex'); if (!x) return; const sc = scoreOf(v, EXAMPLE.vals); const b = bandOf(sc, v); const W = A.sum(v.metrics, (m) => m.w) || 1;
        x.innerHTML = `<div class="rl-ex">${v.metrics.map((m) => `<div class="ln"><span>${t(METRICS[m.k][0], METRICS[m.k][1])}: <b class="mono">${EXAMPLE.vals[m.k]}</b></span><span class="mono">${pts(m, EXAMPLE.vals[m.k])} × ${Math.round(m.w / W * 100)}%</span></div>`).join('')}<div class="ln tot"><span>${t('Score', 'স্কোর')}</span><span class="mono" style="color:var(--${b === 'auto' ? 'good' : b === 'call' ? 'warn' : 'bad'})">${sc}/10 · ${t(ACTS[b][0], ACTS[b][1])}</span></div></div>`; },
      read: (el, old) => ({ upper: num(el, 'f-sc-up'), lower: num(el, 'f-sc-lo'), metrics: old.metrics.map((m, i) => Object.assign({}, m, { w: num(el, 'f-sc-w' + i), good: num(el, 'f-sc-g' + i), ok: num(el, 'f-sc-o' + i) })) }),
      check: (v) => (v.lower > v.upper ? t('The red tag limit must be below the confirm limit.', 'লাল ট্যাগের সীমা কনফার্মের সীমার নিচে হতে হবে।') : !A.sum(v.metrics, (m) => m.w) ? t('Give at least one check a weight.', 'অন্তত একটি চেকে গুরুত্ব দিন।') : ''),
      text: () => ({ en: 'Customers do not see this.', bn: 'কাস্টমার এটা দেখেন না।' }),
      sim: (v) => { const os = last30().filter((o) => o.payment === 'COD'); const c = { auto: 0, call: 0, person: 0 }; const ret = { auto: 0, call: 0, person: 0 }; os.forEach((o) => { const b = bandOf(scoreOf(v, metricsFor(o.phone)), v); c[b]++; if (o.status === 'returned') ret[b]++; }); const rr = (k) => (c[k] ? Math.round(ret[k] / c[k] * 100) : 0); return [`Last 30 days, ${os.length} cash orders: ${c.auto} confirm (${rr('auto')}% came back) · ${c.call} call list (${rr('call')}%) · ${c.person} red tag (${rr('person')}%).`, `গত 30 দিন, ${os.length}টি ক্যাশ অর্ডার: ${c.auto}টি কনফার্ম (${rr('auto')}% ফেরত) · ${c.call}টি কল লিস্ট (${rr('call')}%) · ${c.person}টি লাল ট্যাগ (${rr('person')}%)।`]; } },
    { key: 'holds', tab: 'flow', title: ['Out of stock & holds', 'স্টক শেষ ও হোল্ড'], kw: 'stock hold wait erp',
      get: () => clone(R().holds), set: (v) => { R().holds = v; },
      summary: (v) => t(`Stock held when confirmed · hold and call · after ${v.waitHours} hours ${v.after === 'shipRest' ? 'the rest ships' : v.after === 'cancel' ? 'the missing item is cancelled' : 'keep waiting'}`, `কনফার্ম হলে স্টক ধরে রাখা · হোল্ড করে কল · ${v.waitHours} ঘণ্টা পর ${v.after === 'shipRest' ? 'বাকিটা পাঠানো' : v.after === 'cancel' ? 'না থাকা পণ্য বাতিল' : 'অপেক্ষা চলবে'}`),
      form: (v) => `<div class="muted small">${t('Stock is held only when an order is confirmed, never when it is placed.', 'স্টক শুধু কনফার্ম হলে ধরে রাখা হয়, অর্ডার আসার সময় নয়।')}</div><div class="formgrid">${U.field(t('Wait for the missing item (hours)', 'না থাকা পণ্যের জন্য অপেক্ষা (ঘণ্টা)'), U.input('f-ho-h', v.waitHours, 'type="number" min="1" max="168"'))}<div class="field"><label>${t('After the wait', 'অপেক্ষার পর')}</label>${U.seg('f-ho-a', [['shipRest', t('Send the rest', 'বাকিটা পাঠান')], ['cancel', t('Cancel missing', 'না থাকাটা বাতিল')], ['wait', t('Keep waiting', 'অপেক্ষা')]], v.after)}</div></div>${tog('f-ho-r', v.releaseOnErp, t('Release the hold by itself when ERP stock arrives', 'ERP তে স্টক এলে হোল্ড নিজে ছেড়ে দিন'))}`,
      read: (el) => ({ waitHours: num(el, 'f-ho-h'), after: segv(el, 'f-ho-a'), releaseOnErp: chk(el, 'f-ho-r') }),
      text: (v) => ({ en: `If an item runs out after you order, we call you. After ${v.waitHours} hours ${v.after === 'shipRest' ? 'we send the rest' : v.after === 'cancel' ? 'that item is cancelled' : 'we keep it for you'}.`, bn: `অর্ডারের পর কোনো পণ্য শেষ হলে আমরা কল করব। ${v.waitHours} ঘণ্টা পর ${v.after === 'shipRest' ? 'বাকিটা পাঠিয়ে দেব' : v.after === 'cancel' ? 'ওই পণ্য বাতিল হবে' : 'আপনার জন্য রেখে দেব'}।` }) },
    { key: 'courier', tab: 'flow', title: ['Courier & batch', 'কুরিয়ার ও ব্যাচ'], kw: 'courier pathao steadfast redx batch pickup',
      get: () => clone(R().courier), set: (v) => { R().courier = v; },
      summary: (v) => { const c = A.byId(A.D.couriers, v.def); return t(`${c ? c.name : v.def} for every parcel${v.zoneRouting ? ' (zone routing on)' : ''} · ${v.batchAuto ? 'new batch after the last pickup' : `batch closes at ${v.closeAt}`}`, `সব পার্সেল ${c ? c.name : v.def} দিয়ে${v.zoneRouting ? ' (এলাকা অনুযায়ী চালু)' : ''} · ${v.batchAuto ? 'শেষ পিকআপের পর নতুন ব্যাচ' : `${v.closeAt} এ ব্যাচ বন্ধ`}`); },
      form: (v) => `<div class="formgrid">${U.field(t('Default courier', 'ডিফল্ট কুরিয়ার'), U.select('f-co-d', A.D.couriers.map((c) => [c.id, c.name + (c.connected ? '' : t(' (not connected)', ' (কানেক্ট নেই)'))]), v.def), t('Booking happens by itself when an order is confirmed.', 'অর্ডার কনফার্ম হলে বুকিং নিজে হয়ে যায়।'))}${U.field(t('Close the batch at (if not by pickup)', 'ব্যাচ বন্ধের সময় (পিকআপ ছাড়া)'), U.input('f-co-t', v.closeAt, 'type="time"'))}</div>${tog('f-co-b', v.batchAuto, t('Start a new batch by itself when the courier picks up the last parcel', 'কুরিয়ার শেষ পার্সেল নিলে নতুন ব্যাচ নিজে শুরু'))}${tog('f-co-z', v.zoneRouting, t('Use a different courier per area (off = one courier for all)', 'এলাকা অনুযায়ী আলাদা কুরিয়ার (বন্ধ = সবার জন্য একটা)'))}`,
      read: (el) => ({ def: val(el, 'f-co-d'), closeAt: val(el, 'f-co-t'), batchAuto: chk(el, 'f-co-b'), zoneRouting: chk(el, 'f-co-z') }),
      text: (v) => { const c = A.byId(A.D.couriers, v.def); return { en: `Your parcel comes by ${c ? c.name : v.def}. You get the tracking number by SMS.`, bn: `আপনার পার্সেল ${c ? c.name : v.def} দিয়ে যাবে। ট্র্যাকিং নম্বর SMS এ পাবেন।` }; },
      sim: (v) => { const os = last30().filter((o) => o.courier); const c = A.byId(A.D.couriers, v.def); const now = A.sum(os, (o) => A.calc.courierFee(o)); const nw = A.sum(os, (o) => (c ? c.fee[o.zone] : 0)); return [`${os.length} parcels in 30 days: courier cost ${tk(now)} now → ${tk(nw)} with ${c ? c.name : v.def} for all (${nw >= now ? '+' : '−'}${tk(Math.abs(nw - now))}).`, `30 দিনে ${os.length}টি পার্সেল: কুরিয়ার খরচ এখন ${tk(now)} → সব ${c ? c.name : v.def} দিয়ে ${tk(nw)} (${nw >= now ? '+' : '−'}${tk(Math.abs(nw - now))})।`]; } },
    { key: 'priority', tab: 'customers', title: ['Customer priority', 'কাস্টমার প্রায়োরিটি'], money: true, onOff: true, kw: 'grade silver gold platinum vip loyal',
      get: () => clone(R().priority), set: (v) => { R().priority = v; },
      summary: (v) => (v.on ? v.grades.map((g) => t(`${g.name} from ${tk(g.spend)}`, `${g.name} ${tk(g.spend)} থেকে`)).join(' · ') : t('Off', 'বন্ধ')),
      form: (v) => `${tog('f-pr-on', v.on, t('Give grades to customers', 'কাস্টমারদের গ্রেড দিন'))}<div class="tbl-wrap"><table class="tbl rl-sct"><thead><tr><th>${t('Grade', 'গ্রেড')}</th><th class="r">${t('Spent from', 'খরচ থেকে')}</th><th class="r">${t('Delivered parcels', 'ডেলিভারি পার্সেল')}</th><th class="r">${t('Discount %', 'ছাড় %')}</th></tr></thead><tbody>${v.grades.map((g, i) => `<tr><td><input class="inp sm" id="f-pr-n${i}" value="${esc(g.name)}" style="width:90px"></td><td class="r"><input class="inp sm" id="f-pr-s${i}" type="number" value="${g.spend}"></td><td class="r"><input class="inp sm" id="f-pr-p${i}" type="number" value="${g.parcels}"></td><td class="r"><input class="inp sm" id="f-pr-o${i}" type="number" value="${g.off}"></td></tr>`).join('')}</tbody></table></div><div class="muted small">${t('Spent = delivered orders only. Grade customers also skip the call list.', 'খরচ = শুধু ডেলিভারি হওয়া অর্ডার। গ্রেডের কাস্টমার কল লিস্টে যান না।')}</div>`,
      read: (el, old) => ({ on: chk(el, 'f-pr-on'), grades: old.grades.map((g, i) => ({ name: val(el, 'f-pr-n' + i) || g.name, spend: num(el, 'f-pr-s' + i), parcels: num(el, 'f-pr-p' + i), off: num(el, 'f-pr-o' + i) })) }),
      check: (v) => (v.grades.some((g, i) => i && g.spend <= v.grades[i - 1].spend) ? t('Each grade must start higher than the one before.', 'প্রতিটা গ্রেড আগেরটার চেয়ে বেশি থেকে শুরু হবে।') : ''),
      text: (v) => (v.on ? { en: v.grades.map((g) => `${g.name}: ${g.off}% off every order`).join(' · '), bn: v.grades.map((g) => `${g.name}: প্রতি অর্ডারে ${g.off}% ছাড়`).join(' · ') } : { en: 'No grades shown.', bn: 'কোনো গ্রেড দেখাবে না।' }),
      sim: (v) => { const n = v.grades.map(() => 0); let cost = 0; const r30 = last30(); A.D.customers.forEach((c) => { let gi = -1; v.grades.forEach((g, i) => { if (c.spent >= g.spend && c.delivered >= g.parcels) gi = i; }); if (gi >= 0) { n[gi]++; cost += A.sum(r30.filter((o) => o.customerId === c.id), (o) => Math.round(o.subtotal * v.grades[gi].off / 100)); } }); return [`${v.grades.map((g, i) => `${g.name} ${n[i]}`).join(' · ')} customers · their discount on the last 30 days would be about ${tk(cost)}.`, `${v.grades.map((g, i) => `${g.name} ${n[i]}`).join(' · ')} জন কাস্টমার · গত 30 দিনে তাদের ছাড় হতো প্রায় ${tk(cost)}।`]; } },
    { key: 'messages', tab: 'messages', title: ['Order messages', 'অর্ডারের মেসেজ'], kw: 'sms whatsapp invoice message remind',
      get: () => clone(R().messages), set: (v) => { R().messages = v; },
      summary: (v) => [v.placedSms && t('SMS when ordered', 'অর্ডারে SMS'), (v.confirmSms || v.confirmWa) && t(`${[v.confirmSms && 'SMS', v.confirmWa && 'WhatsApp invoice'].filter(Boolean).join(' + ')} when confirmed`, `কনফার্মে ${[v.confirmSms && 'SMS', v.confirmWa && 'WhatsApp ইনভয়েস'].filter(Boolean).join(' + ')}`), v.shippedSms && t('SMS with tracking', 'ট্র্যাকিংসহ SMS')].filter(Boolean).join(' · ') || t('Off', 'বন্ধ'),
      form: (v) => `<div class="stack">${tog('f-ms-p', v.placedSms, t('SMS when the order is placed', 'অর্ডার আসলে SMS'))}${tog('f-ms-c', v.confirmSms, t('SMS when confirmed', 'কনফার্ম হলে SMS'))}${tog('f-ms-w', v.confirmWa, t('WhatsApp invoice picture when confirmed', 'কনফার্ম হলে WhatsApp এ ইনভয়েসের ছবি'))}${tog('f-ms-s', v.shippedSms, t('SMS with tracking when the courier takes it', 'কুরিয়ার নিলে ট্র্যাকিংসহ SMS'))}${tog('f-ms-d', v.deliveredSms, t('Thank-you SMS after delivery', 'ডেলিভারির পর ধন্যবাদ SMS'))}</div>${U.field(t('Incomplete orders: messages per person, at most', 'অসম্পূর্ণ অর্ডার: একজনকে সর্বোচ্চ কয়টা মেসেজ'), U.input('f-ms-r', v.remindMax, 'type="number" min="0" max="2"'), t('Never more than 2, ever.', 'কখনো 2টার বেশি নয়।'))}`,
      read: (el) => ({ placedSms: chk(el, 'f-ms-p'), confirmSms: chk(el, 'f-ms-c'), confirmWa: chk(el, 'f-ms-w'), shippedSms: chk(el, 'f-ms-s'), deliveredSms: chk(el, 'f-ms-d'), remindMax: Math.min(2, num(el, 'f-ms-r')) }),
      text: (v) => ({ en: v.confirmSms ? 'EXTAS: Your order EX-10231 is confirmed. Total ৳2,480 (cash on delivery). Arrives in 1–2 days.' : 'No SMS when confirmed.', bn: v.confirmSms ? 'EXTAS: আপনার অর্ডার EX-10231 কনফার্ম হয়েছে। মোট ৳2,480 (ক্যাশ অন ডেলিভারি)। 1–2 দিনে পৌঁছাবে।' : 'কনফার্মে কোনো SMS যাবে না।' }),
      sim: (v) => { const n = last30().length; const per = [v.placedSms, v.confirmSms, v.shippedSms, v.deliveredSms].filter(Boolean).length; return [`About ${n * per} SMS in 30 days (${per} per order) · about ${tk(Math.round(n * per * 0.35))} SMS cost.`, `30 দিনে প্রায় ${n * per}টি SMS (অর্ডার প্রতি ${per}টি) · SMS খরচ প্রায় ${tk(Math.round(n * per * 0.35))}।`]; } },
  );
  // fraud level = preset that fills the auto-confirm table
  Object.assign(spec('fraud'), { tab: 'flow', kw: 'fraud low normal strict preset',
    set: (v) => { R().fraud = v; R().autoConfirm = clone(PRESETS[v.level] || PRESETS.normal); },
    live: (el, v) => { const x = el.querySelector('#f-fr-x'); if (!x) return; const p = PRESETS[v.level] || PRESETS.normal; x.innerHTML = `<div class="small" style="margin-bottom:6px">${t('This level fills the Auto-confirm table like this:', 'এই লেভেল অটো কনফার্ম টেবিল এভাবে ভরবে:')}</div>${CASES.map((c) => `<div class="row between small" style="flex-wrap:nowrap;gap:8px"><span>${t(c[1], c[2])}</span><b style="white-space:nowrap">${t(ACTS[p[c[0]]][0], ACTS[p[c[0]]][1])}</b></div>`).join('')}`; },
    sim: (v) => { const p = PRESETS[v.level]; const os = last30(); const c = { auto: 0, call: 0, person: 0 }; os.forEach((o) => { c[p[classify(o).case]]++; }); return [`Last 30 days: ${c.auto} confirm by themselves · ${c.call} call list · ${c.person} red tag.`, `গত 30 দিন: ${c.auto}টি নিজে কনফার্ম · ${c.call}টি কল লিস্ট · ${c.person}টি লাল ট্যাগ।`]; } });
  /* ---------- Round 2: checkout & payments, stock hold, peak mode, routing, message limits, templates, replacement ---------- */
  const r2 = () => { const r = R();
    if (!r.payLink) r.payLink = { on: true, ask: 'delivery', percent: 20, expiryMin: 60, confirmOnPay: true, cancelHours: 24, wallets: ['bkash', 'nagad'] };
    if (!r.gift) r.gift = { on: false, wrapFee: 50, hidePrice: true, note: true };
    if (!r.stockHold) r.stockHold = { checkoutMin: 10, placedHours: 12, soldOut: true };
    if (!r.peak) r.peak = { on: false, capacity: 250, insideCut: '2027-03-17', outsideCut: '2027-03-15', after: 'after Eid' };
    if (!r.routing) r.routing = { on: false };
    if (!r.msgLimits) r.msgLimits = { quietFrom: '22:00', quietTo: '08:00', perOrder: 4, promoPerWeek: 2 };
    if (!r.waTpl) r.waTpl = [{ name: 'Order confirmed + invoice', kind: 'utility', cost: 1.4, on: true }, { name: 'Parcel with courier', kind: 'utility', cost: 1.4, on: true }, { name: 'Pay delivery charge (link)', kind: 'utility', cost: 1.4, on: true }, { name: 'Cart reminder', kind: 'marketing', cost: 8.9, on: true }, { name: 'New collection', kind: 'marketing', cost: 8.9, on: false }];
    if (!r.smsSenders) r.smsSenders = { trans: { sender: 'EXTAS', cost: 0.35 }, promo: { sender: '09617-112233', cost: 0.3, from: '10:00', to: '20:00', cap: 2000 } };
    if (!r.replace) r.replace = { on: true, hours: 72, pickupFree: true, oldPieceDays: 4 };
    return r; };
  const ymdShort = (d) => dshort(d);
  const routingSave = () => { const r = A.calc.range('lastmonth'); const os = A.calc.ordersIn(r.from, r.to).filter((o) => o.courier && o.status !== 'cancelled'); const cs = A.D.couriers.filter((c) => c.connected);
    let now = 0, best = 0; os.forEach((o) => { now += A.calc.courierFee(o); best += cs.length ? Math.min(A.calc.courierFee(o), ...cs.map((c) => c.fee[o.zone])) : A.calc.courierFee(o); }); return { n: os.length, now, best, save: Math.max(0, now - best) }; };
  SPECS.push(
    { key: 'payLink', tab: 'checkout', title: ['Advance by payment link', 'পেমেন্ট লিংকে অগ্রিম'], money: true, onOff: true, kw: 'bkash nagad link advance confirm prepaid',
      get: () => clone(r2().payLink), set: (v) => { R().payLink = v; },
      summary: (v) => (v.on ? t(`bKash/Nagad link for ${v.ask === 'delivery' ? 'the delivery charge' : v.ask === 'full' ? 'the full amount' : v.percent + '%'} · ${v.confirmOnPay ? 'paying confirms the order by itself' : 'staff confirms'}`, `${v.ask === 'delivery' ? 'ডেলিভারি চার্জের' : v.ask === 'full' ? 'পুরো টাকার' : v.percent + '% এর'} bKash/Nagad লিংক · ${v.confirmOnPay ? 'পেমেন্ট হলেই অর্ডার নিজে কনফার্ম' : 'স্টাফ কনফার্ম করবেন'}`) : t('Off', 'বন্ধ')),
      form: (v) => `${tog('f-pl-on', v.on, t('Send a bKash / Nagad payment link when advance is needed', 'অগ্রিম লাগলে bKash / Nagad পেমেন্ট লিংক পাঠান'))}
        <div class="field"><label>${t('The link asks for', 'লিংকে কত টাকা চাইবে')}</label>${U.seg('f-pl-ask', [['delivery', t('Delivery charge', 'ডেলিভারি চার্জ')], ['percent', t('Part (%)', 'অংশ (%)')], ['full', t('Full amount', 'পুরো টাকা')]], v.ask)}</div>
        <div class="formgrid">${U.field(t('Percent', 'শতাংশ'), U.input('f-pl-pct', v.percent, 'type="number" min="1" max="100"'))}${U.field(t('Link works for (minutes)', 'লিংক কত মিনিট চলবে'), U.input('f-pl-exp', v.expiryMin, 'type="number" min="10"'))}${U.field(t('Not paid in (hours) → call list', 'এত ঘণ্টায় পেমেন্ট না হলে → কল লিস্ট'), U.input('f-pl-c', v.cancelHours, 'type="number" min="1"'))}</div>
        ${tog('f-pl-auto', v.confirmOnPay, t('When the money arrives, confirm the order by itself (no call)', 'টাকা আসলেই অর্ডার নিজে কনফার্ম (কল লাগবে না)'))}
        <div class="muted small">${t('Who gets a link is set in "Advance payment". Nothing is cancelled by itself: unpaid orders go to the call list.', 'কে লিংক পাবে তা "অগ্রিম পেমেন্ট" নিয়মে ঠিক হয়। কিছুই নিজে বাতিল হয় না: পেমেন্ট না হলে কল লিস্টে যায়।')}</div>`,
      read: (el, old) => ({ on: chk(el, 'f-pl-on'), ask: segv(el, 'f-pl-ask'), percent: num(el, 'f-pl-pct'), expiryMin: num(el, 'f-pl-exp'), cancelHours: num(el, 'f-pl-c'), confirmOnPay: chk(el, 'f-pl-auto'), wallets: old.wallets }),
      text: (v) => (v.on ? { en: `Pay ${v.ask === 'delivery' ? '৳130 delivery charge' : v.ask === 'full' ? 'the full ৳2,480' : v.percent + '% (৳' + Math.round(2480 * v.percent / 100) + ')'} with bKash or Nagad: pay.extas.com.bd/EX-10231. ${v.confirmOnPay ? 'Your order is confirmed as soon as you pay.' : 'We confirm it after the payment.'}`, bn: `bKash বা Nagad এ ${v.ask === 'delivery' ? '৳130 ডেলিভারি চার্জ' : v.ask === 'full' ? 'পুরো ৳2,480' : v.percent + '% (৳' + Math.round(2480 * v.percent / 100) + ')'} দিন: pay.extas.com.bd/EX-10231। ${v.confirmOnPay ? 'পেমেন্ট হলেই আপনার অর্ডার কনফার্ম।' : 'পেমেন্টের পর আমরা কনফার্ম করব।'}` } : { en: 'We send our bKash number; you send the money and the reference by message.', bn: 'আমরা bKash নম্বর পাঠাব; আপনি টাকা ও রেফারেন্স মেসেজে পাঠাবেন।' }),
      sim: (v) => { const f = firstOrderIds(); const os = last30().filter((o) => needsAdvance(o, R().advance, f)); const calls = v.on && v.confirmOnPay ? Math.round(os.length * 0.7) : 0; return [`${os.length} orders needed advance in 30 days. With the link about ${calls} would have confirmed themselves — that many fewer calls.`, `30 দিনে ${os.length}টি অর্ডারে অগ্রিম লেগেছে। লিংক থাকলে প্রায় ${calls}টি নিজে কনফার্ম হতো — ততগুলো কল কম।`]; } },
    { key: 'gift', tab: 'checkout', title: ['Gift mode', 'গিফট মোড'], money: true, onOff: true, kw: 'gift wrap message hide price',
      get: () => clone(r2().gift), set: (v) => { R().gift = v; },
      summary: (v) => (v.on ? t(`Gift wrap ${tk(v.wrapFee)}${v.hidePrice ? ' · no prices on the parcel' : ''}${v.note ? ' · gift note' : ''}`, `গিফট র‍্যাপ ${tk(v.wrapFee)}${v.hidePrice ? ' · পার্সেলে দাম থাকবে না' : ''}${v.note ? ' · গিফট নোট' : ''}`) : t('Off', 'বন্ধ')),
      form: (v) => `${tog('f-gf-on', v.on, t('Show "This is a gift" at checkout', 'চেকআউটে "এটা গিফট" অপশন দেখান'))}<div class="formgrid">${U.field(t('Gift wrap charge', 'গিফট র‍্যাপ চার্জ'), U.money('f-gf-fee', v.wrapFee, 'min="0"'), t('0 = free', '0 = ফ্রি'))}</div>${tog('f-gf-hp', v.hidePrice, t('Hide prices on the invoice inside the parcel', 'পার্সেলের ভেতরের ইনভয়েসে দাম লুকান'))}${tog('f-gf-n', v.note, t('Let the buyer write a short gift note', 'ক্রেতা ছোট একটা গিফট নোট লিখতে পারবেন'))}`,
      read: (el) => ({ on: chk(el, 'f-gf-on'), wrapFee: num(el, 'f-gf-fee'), hidePrice: chk(el, 'f-gf-hp'), note: chk(el, 'f-gf-n') }),
      text: (v) => (v.on ? { en: `Sending a gift? Add gift wrap (${v.wrapFee ? tk(v.wrapFee) : 'free'})${v.note ? ' and a note' : ''}.${v.hidePrice ? ' Prices stay hidden inside the parcel.' : ''}`, bn: `গিফট পাঠাচ্ছেন? গিফট র‍্যাপ (${v.wrapFee ? tk(v.wrapFee) : 'ফ্রি'})${v.note ? ' ও নোট' : ''} যোগ করুন।${v.hidePrice ? ' পার্সেলের ভেতরে দাম দেখা যাবে না।' : ''}` } : { en: 'No gift option at checkout.', bn: 'চেকআউটে গিফট অপশন নেই।' }) },
    { key: 'stockhold', tab: 'flow', title: ['Stock hold at checkout', 'চেকআউটে স্টক হোল্ড'], kw: 'stock hold checkout minutes hours sold out last piece',
      get: () => clone(r2().stockHold), set: (v) => { R().stockHold = v; },
      summary: (v) => t(`${v.checkoutMin} min while paying · ${v.placedHours} h after the order until confirmed · then released`, `পেমেন্টের সময় ${v.checkoutMin} মিনিট · অর্ডারের পর কনফার্ম পর্যন্ত ${v.placedHours} ঘণ্টা · তারপর ছেড়ে দেওয়া`),
      form: (v) => `<div class="formgrid">${U.field(t('Hold while the customer is in checkout (minutes)', 'কাস্টমার চেকআউটে থাকলে হোল্ড (মিনিট)'), U.input('f-sh-m', v.checkoutMin, 'type="number" min="1" max="60"'))}${U.field(t('Hold after the order is placed (hours)', 'অর্ডার আসার পর হোল্ড (ঘণ্টা)'), U.input('f-sh-h', v.placedHours, 'type="number" min="1" max="72"'))}</div>${tog('f-sh-so', v.soldOut, t('While held, the size shows "Sold out" so the last piece is not ordered twice', 'হোল্ডে থাকলে সাইজটা "স্টক শেষ" দেখাবে, যাতে শেষ পিস দুজন অর্ডার না করেন'))}
        <div class="muted small">${t('Not confirmed in time → the hold is released and the size shows again. On confirm the ERP holds the piece.', 'সময়ের মধ্যে কনফার্ম না হলে → হোল্ড ছেড়ে দেওয়া হয়, সাইজ আবার দেখায়। কনফার্ম হলে ERP পিসটা ধরে রাখে।')}</div>`,
      read: (el) => ({ checkoutMin: num(el, 'f-sh-m'), placedHours: num(el, 'f-sh-h'), soldOut: chk(el, 'f-sh-so') }),
      check: (v) => (!(v.checkoutMin > 0) || !(v.placedHours > 0) ? t('Enter minutes and hours.', 'মিনিট ও ঘণ্টা দিন।') : ''),
      text: (v) => ({ en: `Only 1 left — we hold it for you for ${v.checkoutMin} minutes while you check out.`, bn: `মাত্র 1টা বাকি — চেকআউটের সময় ${v.checkoutMin} মিনিট আপনার জন্য রাখা আছে।` }),
      sim: (v) => { const n = A.D.products.reduce((s, p) => s + p.variants.filter((x) => x.stock - x.reserved === 1).length, 0); return [`${n} sizes have just 1 piece left right now — these are the ones a hold protects.`, `এই মুহূর্তে ${n}টি সাইজে মাত্র 1 পিস বাকি — হোল্ড এগুলোকেই বাঁচায়।`]; } },
    { key: 'peak', tab: 'delivery', title: ['Peak / Eid mode', 'পিক / ঈদ মোড'], onOff: true, kw: 'eid peak capacity cut off promise rush',
      get: () => clone(r2().peak), set: (v) => { R().peak = v; },
      summary: (v) => (v.on ? t(`On · up to ${v.capacity} orders a day · before-Eid cut-off ${ymdShort(v.insideCut)} / ${ymdShort(v.outsideCut)}`, `চালু · দিনে সর্বোচ্চ ${v.capacity}টি অর্ডার · ঈদের আগে শেষ দিন ${ymdShort(v.insideCut)} / ${ymdShort(v.outsideCut)}`) : t(`Off · ready: ${v.capacity} orders a day`, `বন্ধ · প্রস্তুত: দিনে ${v.capacity}টি অর্ডার`)),
      form: (v) => `${tog('f-pk-on', v.on, t('Turn on peak mode', 'পিক মোড চালু'))}<div class="formgrid">${U.field(t('Most orders we can pack a day', 'দিনে সর্বোচ্চ কত অর্ডার প্যাক করা যাবে'), U.input('f-pk-cap', v.capacity, 'type="number" min="10"'), t('Above this, new orders get the later delivery promise.', 'এর বেশি হলে নতুন অর্ডারে পরের ডেলিভারির কথা দেখাবে।'))}${U.field(t('Before-Eid cut-off, inside Dhaka', 'ঈদের আগে শেষ দিন, ঢাকার ভেতরে'), U.input('f-pk-in', v.insideCut, 'type="date"'))}${U.field(t('Before-Eid cut-off, outside Dhaka', 'ঈদের আগে শেষ দিন, ঢাকার বাইরে'), U.input('f-pk-out', v.outsideCut, 'type="date"'))}</div>
        <div class="muted small">${t('After a cut-off date the delivery promise on product pages and checkout changes by itself to "after Eid".', 'শেষ দিনের পর প্রোডাক্ট পেজ ও চেকআউটে ডেলিভারির কথা নিজে বদলে "ঈদের পর" হয়ে যায়।')}</div>`,
      read: (el, old) => ({ on: chk(el, 'f-pk-on'), capacity: num(el, 'f-pk-cap'), insideCut: val(el, 'f-pk-in'), outsideCut: val(el, 'f-pk-out'), after: old.after }),
      text: (v) => (v.on ? { en: `Get it before Eid: order by ${ymdShort(v.insideCut)} (Dhaka) or ${ymdShort(v.outsideCut)} (outside Dhaka). Orders after that arrive after Eid.`, bn: `ঈদের আগে পেতে ${ymdShort(v.insideCut)} (ঢাকা) বা ${ymdShort(v.outsideCut)} (ঢাকার বাইরে) এর মধ্যে অর্ডার করুন। এরপরের অর্ডার ঈদের পর পৌঁছাবে।` } : { en: 'Normal delivery promise.', bn: 'স্বাভাবিক ডেলিভারির কথা।' }),
      sim: (v) => { const days = {}; last30().forEach((o) => { const d = o.created.slice(0, 10); days[d] = (days[d] || 0) + 1; }); const mx = Math.max(0, ...Object.values(days)); return [`Busiest day in the last 30 days: ${mx} orders (cap ${v.capacity}).`, `গত 30 দিনে সবচেয়ে ব্যস্ত দিন: ${mx}টি অর্ডার (সীমা ${v.capacity})।`]; } },
    { key: 'routing', tab: 'courier', title: ['Courier per area', 'এলাকা অনুযায়ী কুরিয়ার'], onOff: true, kw: 'routing cheapest courier area save',
      get: () => clone(r2().routing), set: (v) => { R().routing = v; R().courier.zoneRouting = v.on; },
      summary: (v) => { const s = routingSave(); return (v.on ? t('On · cheapest courier per area · ', 'চালু · এলাকা অনুযায়ী সস্তা কুরিয়ার · ') : t('Off · ', 'বন্ধ · ')) + t(`With per-area routing you would have saved ${tk(s.save)} last month`, `এলাকা অনুযায়ী কুরিয়ার দিলে গত মাসে ${tk(s.save)} বাঁচত`); },
      form: (v) => { const s = routingSave(); return `${tog('f-rt2-on', v.on, t('Pick the cheapest connected courier for each area', 'প্রতি এলাকায় কানেক্ট করা সবচেয়ে সস্তা কুরিয়ার'))}<div class="rl-ex"><div class="ln"><span>${t('Last month parcels', 'গত মাসের পার্সেল')}</span><b class="mono">${s.n}</b></div><div class="ln"><span>${t('Courier cost (one courier)', 'কুরিয়ার খরচ (একটা কুরিয়ার)')}</span><b class="mono">${tk(s.now)}</b></div><div class="ln"><span>${t('With per-area routing', 'এলাকা অনুযায়ী দিলে')}</span><b class="mono">${tk(s.best)}</b></div><div class="ln tot"><span>${t('You would have saved', 'বাঁচত')}</span><b class="mono" style="color:var(--good)">${tk(s.save)}</b></div></div><div class="muted small">${t('Off by default: one courier is simpler to pack and hand over. Turn on when the saving is worth it.', 'ডিফল্টে বন্ধ: একটা কুরিয়ারে প্যাক ও হ্যান্ডওভার সহজ। বাঁচতি যথেষ্ট হলে চালু করুন।')}</div>`; },
      read: (el) => ({ on: chk(el, 'f-rt2-on') }),
      text: () => ({ en: 'You get the tracking number by SMS.', bn: 'ট্র্যাকিং নম্বর SMS এ পাবেন।' }) },
    { key: 'msgLimits', tab: 'messages', title: ['Quiet hours & limits', 'চুপ থাকার সময় ও সীমা'], kw: 'quiet night limit cap per order',
      get: () => clone(r2().msgLimits), set: (v) => { R().msgLimits = v; },
      summary: (v) => t(`No messages ${v.quietFrom}–${v.quietTo} · max ${v.perOrder} per order · offers max ${v.promoPerWeek} a week`, `${v.quietFrom}–${v.quietTo} কোনো মেসেজ নয় · অর্ডারে সর্বোচ্চ ${v.perOrder}টি · অফার সপ্তাহে সর্বোচ্চ ${v.promoPerWeek}টি`),
      form: (v) => `<div class="formgrid">${U.field(t('Quiet from', 'চুপ শুরু'), U.input('f-ml-f', v.quietFrom, 'type="time"'))}${U.field(t('Quiet until', 'চুপ শেষ'), U.input('f-ml-t', v.quietTo, 'type="time"'))}${U.field(t('Most messages per order', 'অর্ডারে সর্বোচ্চ মেসেজ'), U.input('f-ml-o', v.perOrder, 'type="number" min="1" max="10"'))}${U.field(t('Most offer messages per person a week', 'জনপ্রতি সপ্তাহে সর্বোচ্চ অফার মেসেজ'), U.input('f-ml-p', v.promoPerWeek, 'type="number" min="0" max="7"'))}</div><div class="muted small">${t('Messages due in quiet hours wait until the morning. Payment links and OTPs still go at once.', 'চুপ থাকার সময়ের মেসেজ সকালে যাবে। পেমেন্ট লিংক ও OTP সাথে সাথেই যাবে।')}</div>`,
      read: (el) => ({ quietFrom: val(el, 'f-ml-f'), quietTo: val(el, 'f-ml-t'), perOrder: num(el, 'f-ml-o'), promoPerWeek: num(el, 'f-ml-p') }),
      text: () => ({ en: 'No offer messages late at night.', bn: 'রাতে কোনো অফার মেসেজ যাবে না।' }) },
    { key: 'waTpl', tab: 'messages', title: ['WhatsApp templates', 'WhatsApp টেমপ্লেট'], money: true, kw: 'whatsapp template utility marketing cost',
      get: () => clone(r2().waTpl), set: (v) => { R().waTpl = v; },
      summary: (v) => { const u = v.filter((x) => x.kind === 'utility' && x.on).length, m = v.filter((x) => x.kind === 'marketing' && x.on).length; return t(`${u} utility (order updates) · ${m} marketing on`, `${u}টি ইউটিলিটি (অর্ডারের খবর) · ${m}টি মার্কেটিং চালু`); },
      form: (v) => `<div class="stack">${v.map((x, i) => `<div class="rl-ex"><div class="row between" style="gap:8px"><b style="font-size:13.5px">${esc(x.name)}</b>${U.badge(x.kind === 'utility' ? t('Utility', 'ইউটিলিটি') : t('Marketing', 'মার্কেটিং'), x.kind === 'utility' ? 'info' : 'accent')}</div><div class="row between" style="gap:8px;margin-top:6px"><label class="rl-check">${U.switch('f-wt-on' + i, x.on)} <span>${t('On', 'চালু')}</span></label><label class="rl-check">${t('Cost per message', 'মেসেজ প্রতি খরচ')} <input class="inp sm" id="f-wt-c${i}" type="number" step="0.1" min="0" value="${x.cost}"></label></div></div>`).join('')}</div><div class="muted small">${t('Utility = about an order the customer placed (cheaper). Marketing = offers and reminders (costs more, needs opt-in).', 'ইউটিলিটি = কাস্টমারের নিজের অর্ডারের খবর (কম খরচ)। মার্কেটিং = অফার ও রিমাইন্ডার (বেশি খরচ, সম্মতি লাগে)।')}</div>`,
      read: (el, old) => old.map((x, i) => Object.assign({}, x, { on: chk(el, 'f-wt-on' + i), cost: num(el, 'f-wt-c' + i) })),
      text: () => ({ en: 'Your order EX-10231 is confirmed. Invoice attached.', bn: 'আপনার অর্ডার EX-10231 কনফার্ম হয়েছে। ইনভয়েস সাথে দেওয়া হলো।' }),
      sim: (v) => { const n = last30().length; const u = v.filter((x) => x.kind === 'utility' && x.on); const cost = A.sum(u, (x) => x.cost * n); return [`About ${tk(Math.round(cost))} a month for order updates on WhatsApp (${n} orders × ${u.length} messages).`, `WhatsApp এ অর্ডারের খবরে মাসে প্রায় ${tk(Math.round(cost))} (${n}টি অর্ডার × ${u.length}টি মেসেজ)।`]; } },
    { key: 'smsSenders', tab: 'messages', title: ['SMS senders', 'SMS সেন্ডার'], money: true, kw: 'sms sender masking transactional promotional window cap',
      get: () => clone(r2().smsSenders), set: (v) => { R().smsSenders = v; },
      summary: (v) => t(`Order SMS from "${v.trans.sender}" · offers from ${v.promo.sender}, ${v.promo.from}–${v.promo.to}, max ${v.promo.cap} a day`, `অর্ডারের SMS "${v.trans.sender}" থেকে · অফার ${v.promo.sender} থেকে, ${v.promo.from}–${v.promo.to}, দিনে সর্বোচ্চ ${v.promo.cap}টি`),
      form: (v) => `<div class="rl-sub">${t('Transactional (order updates)', 'ট্রানজেকশনাল (অর্ডারের খবর)')}</div><div class="formgrid">${U.field(t('Sender name', 'সেন্ডারের নাম'), U.input('f-ss-ts', v.trans.sender))}${U.field(t('Cost per SMS', 'SMS প্রতি খরচ'), U.input('f-ss-tc', v.trans.cost, 'type="number" step="0.01" min="0"'))}</div>
        <div class="rl-sub">${t('Promotional (offers)', 'প্রমোশনাল (অফার)')}</div><div class="formgrid">${U.field(t('Sender number', 'সেন্ডার নম্বর'), U.input('f-ss-ps', v.promo.sender))}${U.field(t('Cost per SMS', 'SMS প্রতি খরচ'), U.input('f-ss-pc', v.promo.cost, 'type="number" step="0.01" min="0"'))}${U.field(t('Send from', 'পাঠানো শুরু'), U.input('f-ss-pf', v.promo.from, 'type="time"'))}${U.field(t('Send until', 'পাঠানো শেষ'), U.input('f-ss-pt', v.promo.to, 'type="time"'))}${U.field(t('Most offer SMS a day', 'দিনে সর্বোচ্চ অফার SMS'), U.input('f-ss-cap', v.promo.cap, 'type="number" min="0"'))}</div>`,
      read: (el) => ({ trans: { sender: val(el, 'f-ss-ts'), cost: num(el, 'f-ss-tc') }, promo: { sender: val(el, 'f-ss-ps'), cost: num(el, 'f-ss-pc'), from: val(el, 'f-ss-pf'), to: val(el, 'f-ss-pt'), cap: num(el, 'f-ss-cap') } }),
      text: (v) => ({ en: `${v.trans.sender}: Your order EX-10231 is confirmed.`, bn: `${v.trans.sender}: আপনার অর্ডার EX-10231 কনফার্ম হয়েছে।` }) },
    { key: 'replace', tab: 'exchange', title: ['Defective or wrong item', 'ত্রুটি বা ভুল পণ্য'], onOff: true, kw: 'defect wrong item replacement free damaged',
      get: () => clone(r2().replace), set: (v) => { R().replace = v; },
      summary: (v) => (v.on ? t(`Tell us within ${v.hours} h · we send the right product again, free · no refund or wallet`, `${v.hours} ঘণ্টার মধ্যে জানালে · সঠিক পণ্য আবার পাঠাই, ফ্রি · টাকা ফেরত বা ওয়ালেট নেই`) : t('Off', 'বন্ধ')),
      form: (v) => `${tog('f-rp-on', v.on, t('Replace defective or wrong items for free', 'ত্রুটি বা ভুল পণ্য ফ্রিতে বদলে দিন'))}<div class="formgrid">${U.field(t('Customer tells us within (hours)', 'কাস্টমার কত ঘণ্টার মধ্যে জানাবেন'), U.input('f-rp-h', v.hours, 'type="number" min="1"'))}${U.field(t('Old piece comes back within (days)', 'পুরনো পিস কত দিনে ফেরত আসবে'), U.input('f-rp-d', v.oldPieceDays, 'type="number" min="1" max="15"'))}</div>${tog('f-rp-p', v.pickupFree, t('Courier collects the old piece for free', 'কুরিয়ার পুরনো পিস ফ্রিতে নিয়ে আসবে'))}<div class="muted small">${t('Also for prepaid orders. The customer gets the right product, never money back or wallet credit.', 'আগে পেমেন্ট করা অর্ডারেও একই। কাস্টমার সঠিক পণ্য পাবেন, টাকা ফেরত বা ওয়ালেট ক্রেডিট নয়।')}</div>`,
      read: (el) => ({ on: chk(el, 'f-rp-on'), hours: num(el, 'f-rp-h'), oldPieceDays: num(el, 'f-rp-d'), pickupFree: chk(el, 'f-rp-p') }),
      text: (v) => (v.on ? { en: `Got a defective or wrong item? Tell us within ${v.hours} hours. We collect it and send you the right product again — free.`, bn: `ত্রুটি বা ভুল পণ্য পেয়েছেন? ${v.hours} ঘণ্টার মধ্যে জানান। আমরা ওটা নিয়ে আসব আর সঠিক পণ্য আবার পাঠাব — ফ্রি।` } : { en: 'Not available.', bn: 'চালু নেই।' }) },
  );
  // prepaid reward: free delivery / amount / %
  Object.assign(spec('prepaid'), { tab: 'checkout', title: ['Reward for paying online', 'অনলাইনে পেমেন্টে রিওয়ার্ড'], kw: 'prepaid reward free delivery discount online',
    summary: (v) => (v.on ? (v.type === 'free' ? t('Free delivery', 'ফ্রি ডেলিভারি') : (v.type === 'flat' ? tk(v.value) : v.value + '%') + t(' off', ' ছাড়')) + t(' for paying before delivery', ' আগে পেমেন্টে') : t('Off', 'বন্ধ')),
    form: (v) => `<div class="formgrid">${tog('f-pp-on', v.on, t('Reward customers who pay before delivery', 'ডেলিভারির আগে পেমেন্ট করলে রিওয়ার্ড দিন'))}<div class="field"><label>${t('Reward', 'রিওয়ার্ড')}</label>${U.seg('f-pp-type', [['free', t('Free delivery', 'ফ্রি ডেলিভারি')], ['flat', t('Amount ৳', 'টাকা ৳')], ['percent', '%']], v.type)}</div>${U.field(t('Amount', 'পরিমাণ'), U.input('f-pp-v', v.value, 'type="number" min="0"'), t('Not used for free delivery.', 'ফ্রি ডেলিভারিতে লাগবে না।'))}</div>`,
    check: (v) => (v.on && v.type !== 'free' && !(v.value > 0) ? t('Enter the amount.', 'পরিমাণ দিন।') : ''),
    text: (v) => (v.on ? { en: `Pay with bKash, Nagad or card now and get ${v.type === 'free' ? 'free delivery' : (v.type === 'flat' ? tk(v.value) : v.value + '%') + ' off'}.`, bn: `এখনই bKash, Nagad বা কার্ডে পেমেন্ট করলে ${v.type === 'free' ? 'ডেলিভারি ফ্রি' : (v.type === 'flat' ? tk(v.value) : v.value + '%') + ' ছাড়'}` } : { en: 'Same price for cash and online payment.', bn: 'ক্যাশ ও অনলাইনে একই দাম' }),
    sim: (v) => { const os = last30(); const on = os.filter((o) => o.payment !== 'COD'); const cost = A.sum(on, (o) => (v.type === 'free' ? o.delivery : v.type === 'flat' ? v.value : Math.round(o.total * v.value / 100))); return [`${on.length} of ${os.length} orders paid online. This reward would have cost ${tk(v.on ? cost : 0)} on those; every prepaid order skips the call and is never refused.`, `${os.length}টির মধ্যে ${on.length}টি অনলাইনে পেমেন্ট। এই রিওয়ার্ডে খরচ হতো ${tk(v.on ? cost : 0)}; আগে পেমেন্টের অর্ডারে কল লাগে না, ফেরতও আসে না।`]; } });
  // exchange: size only (defect/wrong → replacement rule)
  Object.assign(spec('exchange'), {
    text: (v) => (v.on ? { en: `Wrong size? Exchange within ${v.hours} hours of delivery. Exchange charge ${tk(v.charge)}. If the new item costs less, the rest goes to your EXTAS wallet. Defective or wrong item: we send the right product again, free.`, bn: `সাইজ মেলেনি? ডেলিভারির ${v.hours} ঘণ্টার মধ্যে এক্সচেঞ্জ করুন। চার্জ ${tk(v.charge)}। নতুন পণ্যের দাম কম হলে বাকি টাকা আপনার EXTAS ওয়ালেটে যাবে। ত্রুটি বা ভুল পণ্য হলে: সঠিক পণ্য আবার পাঠাব, ফ্রি।` } : { en: 'Exchange is not available.', bn: 'এক্সচেঞ্জ হয় না।' }) });
  // courier score: where each number comes from
  const SRC = { success: ['Steadfast + Pathao (official)', 'Steadfast + Pathao (অফিশিয়াল)', 35], parcels: ['Steadfast + Pathao (official)', 'Steadfast + Pathao (অফিশিয়াল)', 35], returns: ['Steadfast + Pathao (official)', 'Steadfast + Pathao (অফিশিয়াল)', 35], worst: ['Pathao (official)', 'Pathao (অফিশিয়াল)', 120], couriers: ['Steadfast + Pathao + RedX', 'Steadfast + Pathao + RedX', null], fraud: ['Steadfast fraud reports (official)', 'Steadfast ফ্রড রিপোর্ট (অফিশিয়াল)', 180] };
  const srcHtml = (v) => `<div class="rl-sub">${t('Where each number comes from', 'প্রতিটা সংখ্যা কোথা থেকে আসে')}</div><div class="rl-ex">${v.metrics.map((m) => { const s = SRC[m.k] || ['—', '—', null]; return `<div class="ln"><span>${t(METRICS[m.k][0], METRICS[m.k][1])}<br><span class="muted">${t(s[0], s[1])}</span></span><span style="text-align:right">${s[2] == null ? `${U.badge(t('Unknown', 'অজানা'), 'dark')}<br><span class="muted">${t('RedX gave no answer → call list', 'RedX উত্তর দেয়নি → কল লিস্ট')}</span>` : `${U.badge(t('Fresh', 'নতুন'), 'good')}<br><span class="muted">${t(s[2] < 60 ? s[2] + ' min ago' : Math.round(s[2] / 60) + ' h ago', s[2] < 60 ? s[2] + ' মিনিট আগে' : Math.round(s[2] / 60) + ' ঘণ্টা আগে')}</span>`}</span></div>`; }).join('')}</div><div class="muted small">${t('Missing data is shown as "Unknown" and the order goes to the call list — never a red tag.', 'তথ্য না থাকলে "অজানা" দেখায় আর অর্ডার কল লিস্টে যায় — কখনো লাল ট্যাগ নয়।')}</div>`;
  { const sc = spec('score'); const f0 = sc.form; sc.form = (v) => f0(v) + srcHtml(v); }

  /* score accuracy (last 30 days, flagged orders by band) */
  const hsh = (id) => { let x = 7; for (const c of id) x = (x * 31 + c.charCodeAt(0)) % 9973; return x; };
  const fakeScore = (o) => { const x = hsh(o.id); if (o.risk === 'high') return 2.5 + (x % 25) / 10; if (o.risk === 'low') return 7.5 + (x % 23) / 10; if (o.status !== 'returned' && x % 3 === 0) return 7 + (x % 5) / 10; return 5 + (x % 20) / 10; };
  function accStats() {
    const rg = A.calc.range('30d'); const os = A.calc.ordersIn(rg.from, rg.to); const up = R().courierScore.upper, lo = R().courierScore.lower;
    const B = [[t(`${up}+ · confirms by itself`, `${up}+ · নিজে কনফার্ম`), (s) => s >= up], [t(`7.0–${(up - 0.1).toFixed(1)} · near the line`, `7.0–${(up - 0.1).toFixed(1)} · সীমার কাছে`), (s) => s >= 7 && s < up], [t(`${lo}–6.9 · call list`, `${lo}–6.9 · কল লিস্ট`), (s) => s >= lo && s < Math.min(7, up)], [t(`Below ${lo} · red tag`, `${lo} এর নিচে · লাল ট্যাগ`), (s) => s < lo]];
    return B.map((b) => { const g = os.filter((o) => b[1](fakeScore(o))); const del = g.filter(A.calc.isDelivered).length, ref = g.filter((o) => o.status === 'returned').length; return { label: b[0], n: g.length, conf: g.filter((o) => !['new', 'cancelled'].includes(o.status)).length, del, ref, can: g.filter((o) => o.status === 'cancelled').length, adv: g.filter((o) => o.payment !== 'COD').length, rate: del + ref ? Math.round(ref / (del + ref) * 100) : 0, okRate: del + ref ? Math.round(del / (del + ref) * 100) : 0 }; });
  }
  function accHtml() {
    const st = accStats(); const up = R().courierScore.upper; const near = st[1]; const red = st[3];
    const sug = up > 7 && near.n && near.okRate >= 90 ? `<div class="row between" style="gap:8px;margin-top:8px"><span class="small">${A.icon('info')} ${t(`Move the upper limit from ${up} to 7.0 — ${near.okRate}% of 7–${up} orders were delivered. About ${near.n} fewer calls a month.`, `উপরের সীমা ${up} থেকে 7.0 করুন — 7–${up} এর ${near.okRate}% অর্ডার ডেলিভারি হয়েছে। মাসে প্রায় ${near.n}টি কল কম।`)}</span><button class="btn sm primary" data-acc-apply>${t('Use 7.0', '7.0 করুন')}</button></div>` : `<div class="small" style="margin-top:8px">${A.icon('check')} ${t(`Limits look right. Red-tag band: ${red.rate}% refused — keep asking for the delivery charge in advance.`, `সীমা ঠিক আছে। লাল ট্যাগে ${red.rate}% ফেরত — অগ্রিম ডেলিভারি চার্জ চাওয়া চালু রাখুন।`)}</div>`;
    return `<div class="rl-acc" data-txt="score accuracy refused delivered band suggestion"><div class="row between" style="gap:8px"><b style="font-size:14.5px">${t('Score accuracy', 'স্কোর কতটা ঠিক')}</b>${U.badge(t('Last 30 days', 'গত 30 দিন'), 'info')}</div><p class="muted small" style="margin:2px 0 8px">${t('What really happened to scored orders, by band.', 'স্কোর পাওয়া অর্ডারগুলোর আসলে কী হলো, ভাগ অনুযায়ী।')}</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Band', 'ভাগ')}</th><th class="r">${t('Orders', 'অর্ডার')}</th><th class="r hide-sm">${t('Confirmed', 'কনফার্ম')}</th><th class="r">${t('Refused', 'ফেরত')}</th><th class="r hide-sm">${t('Cancelled', 'বাতিল')}</th><th class="r hide-sm">${t('Paid advance', 'অগ্রিম দিয়েছে')}</th><th class="r">${t('Refusal rate', 'ফেরতের হার')}</th></tr></thead><tbody>${st.map((b) => `<tr><td>${b.label}</td><td class="r mono">${b.n}</td><td class="r mono hide-sm">${b.conf}</td><td class="r mono">${b.ref}</td><td class="r mono hide-sm">${b.can}</td><td class="r mono hide-sm">${b.adv}</td><td class="r mono" style="color:var(--${b.rate >= 25 ? 'bad' : b.rate >= 12 ? 'warn' : 'good'})">${b.rate}%</td></tr>`).join('')}</tbody></table></div>${sug}</div>`;
  }
  /* message log */
  function msgLog() {
    if (!A.D.msgLog) { const tpl = [['SMS', 'Order confirmed'], ['WhatsApp', 'Invoice picture'], ['SMS', 'Tracking number'], ['WhatsApp', 'Pay delivery charge (link)'], ['Email', 'Order confirmed']]; A.D.msgLog = A.D.orders.slice(0, 24).map((o, i) => { const tp = tpl[i % tpl.length]; const st = i % 9 === 4 ? 'failed' : i % 7 === 2 ? 'retried' : i % 3 === 0 ? 'read' : 'delivered'; return { id: 'm' + i, t: o.created, order: o.id, ch: tp[0], tpl: tp[1], st, tries: st === 'retried' ? 2 : st === 'failed' ? 3 : 1, cost: tp[0] === 'SMS' ? 0.35 : tp[0] === 'WhatsApp' ? 1.4 : 0 }; }); }
    return A.D.msgLog;
  }
  const MST = { delivered: ['Delivered', 'পৌঁছেছে', 'good'], read: ['Read', 'পড়েছে', 'good'], retried: ['Delivered on retry', 'আবার চেষ্টায় পৌঁছেছে', 'warn'], failed: ['Failed', 'যায়নি', 'bad'] };
  function openMsgLog() {
    const L = msgLog(); const body = () => { const f = L.filter((m) => m.st === 'failed').length; return `<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">${U.badge(t(`${L.length} sent today`, `আজ ${L.length}টি পাঠানো`), 'info')}${U.badge(t(`${f} failed`, `${f}টি যায়নি`), f ? 'bad' : 'good')}${U.badge(t(`Cost ${tk(Math.round(A.sum(L, (m) => m.cost * m.tries)))}`, `খরচ ${tk(Math.round(A.sum(L, (m) => m.cost * m.tries)))}`), 'dark')}</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Order', 'অর্ডার')}</th><th>${t('Message', 'মেসেজ')}</th><th>${t('Status', 'অবস্থা')}</th><th class="r hide-sm">${t('Tries', 'চেষ্টা')}</th><th class="r hide-sm">${t('Cost', 'খরচ')}</th><th></th></tr></thead><tbody>${L.map((m) => `<tr><td class="mono">${m.order}<div class="muted small">${A.fmt.time(m.t)}</div></td><td>${m.ch}<div class="muted small">${m.tpl}</div></td><td>${U.badge(t(MST[m.st][0], MST[m.st][1]), MST[m.st][2])}</td><td class="r mono hide-sm">${m.tries}</td><td class="r mono hide-sm">৳${(m.cost * m.tries).toFixed(2)}</td><td>${m.st === 'failed' ? `<button class="btn sm" data-retry="${m.id}">${t('Retry', 'আবার')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`; };
    const m = U.modal(t('Message log', 'মেসেজ লগ'), `<div id="rl-ml">${body()}</div>`, { wide: true });
    const wire = () => A.on(m, '[data-retry]', 'click', (e, b) => { const x = L.find((y) => y.id === b.dataset.retry); x.st = 'retried'; x.tries++; A.commit(`Message to ${x.order} sent again`); A.toast(t('Sent again — delivered.', 'আবার পাঠানো হয়েছে — পৌঁছেছে।'), 'good'); m.querySelector('#rl-ml').innerHTML = body(); wire(); });
    wire();
  }
  const XROW = {
    _accuracy: () => accHtml(),
    _popups: () => { const sh = POP.filter((p) => popStatus(p)[0] === 'on').length; return `<a class="rl-rr" href="${A.href('rules', 'popups')}" data-txt="pop-ups popups notices notice bar welcome holiday banner checkout product low stock thank you"><div><b>${t('Pop-ups & notices', 'পপ-আপ ও নোটিশ')}</b><p>${t(`${sh} of ${POP.length} showing · notice bar, welcome pop-up, holiday banner, checkout and product notices, thank-you`, `${POP.length}টির মধ্যে ${sh}টি দেখাচ্ছে · নোটিশ বার, স্বাগত পপ-আপ, উৎসবের ব্যানার, চেকআউট ও প্রোডাক্টের নোটিশ, ধন্যবাদ`)}</p></div><div class="rl-st"><span class="rl-pl on">${t('Hub', 'এক জায়গায়')}</span><span class="rl-ed-l">${t('Open', 'খুলুন')}</span></div></a>`; },
    _msglog: () => { const L = msgLog(); const f = L.filter((m) => m.st === 'failed').length; return `<button type="button" class="rl-rr" data-x="msglog" data-txt="message log status cost retries failed"><div><b>${t('Message log', 'মেসেজ লগ')}</b><p>${t(`${L.length} sent today · ${f} failed · status, cost and retries of every message`, `আজ ${L.length}টি পাঠানো · ${f}টি যায়নি · প্রতিটা মেসেজের অবস্থা, খরচ ও আবার চেষ্টা`)}</p></div><div class="rl-st"><span class="rl-pl ${f ? 'smp' : 'on'}">${f ? t(`${f} failed`, `${f}টি ব্যর্থ`) : t('All sent', 'সব গেছে')}</span><span class="rl-ed-l">${t('Open', 'খুলুন')}</span></div></button>`; },
  };
  function wireX(list) {
    A.on(list, '[data-x="msglog"]', 'click', () => openMsgLog());
    A.on(list, '[data-acc-apply]', 'click', () => { const s = spec('score'); const v = s.get(); U.confirm(t('Move the upper limit to 7.0?', 'উপরের সীমা 7.0 করবেন?'), t(`Orders scoring 7.0 or more will confirm by themselves (now ${v.upper}+).`, `7.0 বা বেশি স্কোরের অর্ডার নিজে কনফার্ম হবে (এখন ${v.upper}+)।`), t('Use 7.0', '7.0 করুন'), () => applyChange(s, Object.assign(v, { upper: 7 }), 'from score accuracy')); });
  }
  A.css('rules-r2', `.rl-acc{padding:12px 14px;border-top:1px solid var(--line);background:var(--card2)} .rl-acc .tbl td,.rl-acc .tbl th{padding:6px 8px;font-size:12.5px}`);
  const GRP = [
    ['delivery', 'truck', ['Delivery', 'ডেলিভারি'], ['fees', 'free', 'eid', 'peak']],
    ['payment', 'finance', ['Payment & COD', 'পেমেন্ট ও COD'], ['cod', 'advance', 'wallets']],
    ['checkout', 'check', ['Checkout & payments', 'চেকআউট ও পেমেন্ট'], ['prepaid', 'payLink', 'gift']],
    ['flow', 'orders', ['Order flow', 'অর্ডার ফ্লো'], ['autoconfirm', 'score', '_accuracy', 'fraud', 'stockhold', 'holds', 'autocancel', 'dupMerge', 'adjust', 'advRemind']],
    ['courier', 'box', ['Courier', 'কুরিয়ার'], ['courier', 'routing']],
    ['couriermsg', 'send', ['Courier messages', 'কুরিয়ার মেসেজ'], ['cm_booking', 'cm_delivery', 'cm_cod', 'cm_reattempt', 'cm_hold', 'cm_cancel', 'cm_returnpick', 'cm_claim', 'cm_payout']],
    ['exchange', 'reset', ['Exchange', 'এক্সচেঞ্জ'], ['exchange', 'replace']],
    ['customers', 'customers', ['Customers', 'কাস্টমার'], ['priority', 'edits']],
    ['discounts', 'star', ['Discounts', 'ছাড়'], ['buymore', '_coupons', '_sales']],
    ['messages', 'send', ['Messages', 'মেসেজ'], ['messages', '_msglog', 'msgLimits', 'waTpl', 'smsSenders', '_popups']],
  ];
  const grpOf = (k) => GRP.find((g) => g[3].includes(k));
  function initV2() {
    const D = A.D; const r = R(); D.ruleSample = D.ruleSample || { prepaid: 1, score: 1, priority: 1 }; D.ruleDef = D.ruleDef || {}; ensureR3();
    if (!r.autoConfirm) r.autoConfirm = clone(PRESETS[r.fraud.level] || PRESETS.normal);
    if (!r.courierScore) r.courierScore = DEF_SCORE();
    if (!r.holds) r.holds = { waitHours: 24, after: 'shipRest', releaseOnErp: true };
    if (!r.courier) r.courier = { def: 'pathao', zoneRouting: false, batchAuto: true, closeAt: '17:00' };
    if (!r.priority) r.priority = { on: true, grades: [{ name: 'Silver', spend: 10000, parcels: 3, off: 3 }, { name: 'Gold', spend: 25000, parcels: 6, off: 5 }, { name: 'Platinum', spend: 50000, parcels: 12, off: 8 }] };
    if (!r.messages) r.messages = { placedSms: true, confirmSms: true, confirmWa: true, shippedSms: true, deliveredSms: false, remindMax: 2 };
    if (r.cod.callAbove == null) { r.cod.callAbove = 5000; r.cod.payOnlineAbove = 15000; r.cod.max = 15000; }
    if (r.exchange.charge == null) Object.assign(r.exchange, { reasons: ['size', 'defect'], charge: 80, shopFaultFree: true, lowerToWallet: true, oldPieceDays: 4, checkDays: 7 });
    if (!r.adVerdict) r.adVerdict = { scale: 4, keep: 2.5, fix: 1.5 };
    if (!D._rlV2) { D._rlV2 = 1; r.autoCancel = { on: false, calls: 3 }; if (!D.ruleSched.cod) D.ruleSched.cod = { from: '2026-11-20', val: { on: true, callAbove: 5000, payOnlineAbove: 12000, max: 12000 } }; (D.ruleLog.cod = D.ruleLog.cod || []).unshift({ t: '2026-11-11T18:20:00+06:00', val: { on: true, callAbove: 4000, payOnlineAbove: 15000, max: 15000 }, by: 'Mehadi Hasan' }); }
    SPECS.forEach((s) => { if (!(s.key in D.ruleDef)) D.ruleDef[s.key] = s.get(); });
  }
  const pill = (k) => {
    const sc = A.D.ruleSched[k]; if (sc) return `<span class="rl-pl sch">${t('From ', '')}${dshort(sc.from)}${t('', ' থেকে')}</span>`;
    if (A.D.ruleSample[k]) return `<span class="rl-pl smp">${t('Sample', 'নমুনা')}</span>`;
    const s = spec(k); const v = s.get(); const on = s.onOff ? v.on : true;
    return on ? `<span class="rl-pl on">${t('On', 'চালু')}</span>` : `<span class="rl-pl off">${t('Off', 'বন্ধ')}</span>`;
  };
  function rowHtml(k, sel) {
    if (XROW[k]) return XROW[k]();
    if (k === '_coupons') { const n = A.D.coupons.filter(couponOk); const top = A.D.coupons.map((c) => ({ c, n: usage(c.code).n })).sort((a, b) => b.n - a.n)[0]; return `<a class="rl-rr" href="${A.href('rules', 'coupons')}" data-txt="coupons codes ${A.D.coupons.map((c) => c.code).join(' ').toLowerCase()}"><div><b>${t('Coupons', 'কুপন')}</b><p>${t(`${n.length} running`, `${n.length}টি চলছে`)}${top ? ` · ${top.c.code} ${t(`used ${top.n} times`, `${top.n} বার ব্যবহার`)}` : ''}</p></div><div class="rl-st"><span class="rl-pl ${n.length ? 'on' : 'off'}">${n.length ? t('On', 'চালু') : t('Off', 'বন্ধ')}</span><span class="rl-ed-l">${t('Open', 'খুলুন')}</span></div></a>`; }
    if (k === '_sales') { const n = A.D.discounts.filter((d) => discStatus(d) === 'run'); return `<a class="rl-rr" href="${A.href('rules', 'coupons')}" data-txt="sale prices discount ${A.D.discounts.map((d) => d.name).join(' ').toLowerCase()}"><div><b>${t('Sale prices', 'সেল দাম')}</b><p>${n.length ? n.map((d) => esc(d.name)).join(', ') : t('None running', 'কোনোটা চলছে না')}</p></div><div class="rl-st"><span class="rl-pl ${n.length ? 'on' : 'off'}">${n.length ? t('On', 'চালু') : t('Off', 'বন্ধ')}</span><span class="rl-ed-l">${t('Open', 'খুলুন')}</span></div></a>`; }
    const s = spec(k); const v = s.get();
    return `<button type="button" class="rl-rr ${sel === k ? 'sel' : ''}" data-rk="${k}" data-txt="${esc((s.title[0] + ' ' + s.title[1] + ' ' + (s.kw || '') + ' ' + String(s.summary(v)).replace(/<[^>]+>/g, '')).toLowerCase())}"><div><b>${t(s.title[0], s.title[1])}</b><p>${s.summary(v)}</p></div><div class="rl-st">${pill(k)}<span class="rl-ed-l">${t('Edit', 'এডিট')}</span></div></button>`;
  }
  function wcHtml(s, v) {
    const old = s.get(); const same = JSON.stringify(old) === JSON.stringify(v);
    const r = s.sim ? s.sim(v) : null;
    return `<div class="rl-sub">${t('What changes', 'কী বদলাবে')}</div>${same ? `<div class="muted small">${t('Nothing yet. Change a value above.', 'এখনো কিছু না। উপরে কোনো মান বদলান।')}</div>` : `<div class="rl-ba"><s>${s.summary(old)}</s><span>→ <b>${s.summary(v)}</b></span></div>`}${r ? `<div class="small rl-eff">${A.icon('info')} <span>${t(r[0], r[1])}</span></div>` : `<div class="muted small">${t('Applies to new orders from the moment you save.', 'সেভ করার পর থেকে নতুন অর্ডারে লাগবে।')}</div>`}`;
  }
  function edHtml(s) {
    const v = s.get(); const sc = A.D.ruleSched[s.key]; const n = (A.D.ruleLog[s.key] || []).length;
    return `<section class="rl-card rl-edp" data-k="${s.key}">
      <div class="row between" style="flex-wrap:nowrap"><h3 style="margin:0">${t(s.title[0], s.title[1])}</h3><button class="btn sm ghost" data-close-ed aria-label="${t('Close', 'বন্ধ')}">${A.icon('x')}</button></div>
      ${A.D.ruleSample[s.key] ? U.callout(t('This rule still uses sample values. Check the numbers and press Save to make them yours.', 'এই নিয়মে এখনো নমুনা সংখ্যা। সংখ্যাগুলো দেখে সেভ চাপুন, তাহলে আপনার হবে।'), 'warn', 'warn') : ''}
      ${sc ? U.callout(`${t('Starts on', 'শুরু')} <b>${dshort(sc.from)}</b>: <b>${s.summary(sc.val)}</b>. <button class="linkbtn" data-unsched>${t('Cancel schedule', 'শিডিউল বাতিল')}</button>`, 'info', 'info') : ''}
      <div class="stack" data-fields>${s.form(v)}</div>
      <div class="rl-prev"><div class="rl-prev-h">${t('Customer sees', 'কাস্টমার দেখবেন')}</div><div class="rl-prev-b" data-prev>${prevHtml(s, v)}</div></div>
      <div class="rl-wc" data-wc>${wcHtml(s, v)}</div>
      <div class="row between"><button class="btn" data-close-ed>${t('Cancel', 'বাতিল')}</button><button class="btn primary" data-save>${A.icon('check')} ${s.money ? t('Save · PIN', 'সেভ · PIN') : t('Save', 'সেভ')}</button></div>
      <details class="rl-more"><summary>${t('More options', 'আরও অপশন')} · ${t('start on a date, try on last month, history', 'তারিখ থেকে শুরু, গত মাসে পরীক্ষা, ইতিহাস')} (${n}) ▾</summary><div class="rl-more-b" data-more></div><div style="margin-top:10px"><button class="btn sm ghost" data-def>${A.icon('reset')} ${t('Back to default', 'ডিফল্টে ফেরত')}</button></div></details>
    </section>`;
  }
  function onePage(el, r) {
    store(); initV2(); runScheds();
    if (r.id && spec(r.id)) A._rlSel = r.id; else if (!r.id) A._rlSel = null;
    const grp = A._rlGrp || 'all'; const q = A._rlQ || '';
    const nSample = Object.keys(A.D.ruleSample).length; const sch = Object.entries(A.D.ruleSched).sort((a, b) => (a[1].from < b[1].from ? -1 : 1));
    let last = null; for (const k of Object.keys(A.D.ruleLog)) { const h = A.D.ruleLog[k][0]; if (h && (!last || h.t > last.t)) last = Object.assign({ k }, h); }
    const lastS = last && spec(last.k);
    const strip = `<div class="rl-strip">${nSample ? `<button class="rl-sp warn" data-flt="sample">${t(`${nSample} rules still use sample values`, `${nSample}টি নিয়মে এখনো নমুনা সংখ্যা`)}</button>` : `<span class="rl-sp good">${t('All rules use your own values', 'সব নিয়মে আপনার নিজের সংখ্যা')}</span>`}${sch.length ? `<button class="rl-sp info" data-rk="${sch[0][0]}">${t(`${sch.length} change starts on ${dshort(sch[0][1].from)}`, `${sch.length}টি বদল ${dshort(sch[0][1].from)} থেকে শুরু`)}</button>` : ''}${lastS ? `<span class="rl-sp good">${t(`Last change: ${lastS.title[0]} · ${A.fmt.ago(last.t)} by ${last.by.split(' ')[0]}`, `শেষ বদল: ${lastS.title[1]} · ${A.fmt.ago(last.t)}, ${last.by.split(' ')[0]}`)}</span>` : ''}</div>`;
    const total = A.sum(GRP, (g) => g[3].length);
    const nav = `<nav class="rl-nav" aria-label="${t('Rule groups', 'নিয়মের ভাগ')}"><button class="${grp === 'all' ? 'on' : ''}" data-g="all">${t('All rules', 'সব নিয়ম')} <span>${total}</span></button>${GRP.map((g) => `<button class="${grp === g[0] ? 'on' : ''}" data-g="${g[0]}">${t(g[2][0], g[2][1])} <span>${g[3].length}</span></button>`).join('')}</nav>`;
    const os = last30(); const outRet = os.filter((o) => o.zone === 'outside' && o.status === 'returned').length, outAll = os.filter((o) => o.zone === 'outside' && (A.calc.isDelivered(o) || o.status === 'returned')).length;
    const cl = { auto: 0, call: 0, person: 0 }; os.forEach((o) => { cl[R().autoConfirm[classify(o).case]]++; });
    const ins = U.callout(t(`Last 30 days: ${cl.auto} of ${os.length} orders confirmed by themselves under these rules, ${cl.call} needed a call. Outside Dhaka ${outAll ? Math.round(outRet / outAll * 100) : 0}% of finished orders came back.`, `গত 30 দিন: এই নিয়মে ${os.length}টির মধ্যে ${cl.auto}টি অর্ডার নিজে কনফার্ম হতো, ${cl.call}টিতে কল লাগত। ঢাকার বাইরে শেষ হওয়া অর্ডারের ${outAll ? Math.round(outRet / outAll * 100) : 0}% ফেরত এসেছে।`), 'info', 'info');
    el.innerHTML = A.pageHead(t('Rules', 'নিয়ম'), t('Every rule of your shop as one plain line. Press Edit to change it — the shop follows at once.', 'দোকানের প্রতিটা নিয়ম এক লাইনে। বদলাতে এডিট চাপুন — দোকানে সাথে সাথে বদলাবে।')) + A.tabsBar('rules', 'all') +
      `<div class="rl-l ${A._rlSel ? 'has-ed' : ''}">${nav}<div class="rl-main"><label class="rl-search">${A.icon('search')}<input id="rl-q" type="search" value="${esc(q)}" placeholder="${t('Search rules — e.g. COD, exchange, free delivery', 'নিয়ম খুঁজুন — যেমন COD, এক্সচেঞ্জ, ফ্রি ডেলিভারি')}"></label>${strip}${ins}<div id="rl-list"></div></div><aside class="rl-side" id="rl-side"></aside></div>`;
    const list = el.querySelector('#rl-list'); const side = el.querySelector('#rl-side');
    const drawList = () => {
      const qq = (A._rlQ || '').toLowerCase().trim(); const onlySample = A._rlFlt === 'sample';
      const html = GRP.filter((g) => (A._rlGrp || 'all') === 'all' || g[0] === A._rlGrp).map((g) => {
        const rows = g[3].filter((k) => !onlySample || A.D.ruleSample[k]).map((k) => rowHtml(k, A._rlSel)).filter((h) => !qq || (h.match(/data-txt="([^"]*)"/) || [])[1].includes(qq) || h.toLowerCase().includes(qq));
        return rows.length ? `<div class="rl-grp2" id="rg-${g[0]}"><h3>${A.icon(g[1])} ${t(g[2][0], g[2][1])}</h3>${rows.join('')}</div>` : '';
      }).join('');
      list.innerHTML = (onlySample ? `<div class="row" style="margin-bottom:8px">${U.badge(t('Showing rules with sample values', 'নমুনা সংখ্যার নিয়ম দেখাচ্ছে'), 'warn')} <button class="linkbtn" data-clr>${t('Show all', 'সব দেখান')}</button></div>` : '') + (html || U.empty(t('No rule matches your search.', 'খোঁজার সাথে কোনো নিয়ম মেলেনি।')));
      A.on(list, '[data-rk]', 'click', (e, b) => openEd(b.dataset.rk));
      wireX(list);
      const c = list.querySelector('[data-clr]'); if (c) c.onclick = () => { A._rlFlt = null; drawList(); };
    };
    const drawSide = () => {
      const k = A._rlSel; el.querySelector('.rl-l').classList.toggle('has-ed', !!k);
      if (!k) { side.innerHTML = simulator(); wireSim(side); return; }
      const s = spec(k); side.innerHTML = edHtml(s); const card = side.querySelector('.rl-card'); wireCard(card);
      A.on(card, '.rl-tg', 'click', (e, b) => { e.preventDefault(); b.classList.toggle('on'); card.querySelector('[data-fields]').dispatchEvent(new Event('input')); });
      A.on(card, '[data-close-ed]', 'click', () => openEd(null));
      card.querySelector('[data-def]').onclick = () => { const d = A.D.ruleDef[k]; if (JSON.stringify(d) === JSON.stringify(s.get())) return A.toast(t('Already on the default', 'ইতিমধ্যে ডিফল্টে আছে')); const go = () => applyChange(s, clone(d), 'back to default'); if (s.money) pinAsk(t('Back to default?', 'ডিফল্টে ফেরত যাবেন?'), `<p>${s.summary(s.get())} → <b>${s.summary(d)}</b></p>`, t('Go back', 'ফেরত যান'), go); else U.confirm(t('Back to default?', 'ডিফল্টে ফেরত যাবেন?'), `${s.summary(s.get())} → ${s.summary(d)}`, t('Go back', 'ফেরত যান'), go); };
    };
    function openEd(k) {
      A._rlSel = k; history.replaceState(null, '', A.href('rules', 'all', k || undefined)); document.getElementById('root').dataset.k = location.hash;
      list.querySelectorAll('.rl-rr').forEach((x) => x.classList.toggle('sel', x.dataset.rk === k)); drawSide();
      if (k && window.innerWidth > 860) side.scrollIntoView({ block: 'nearest' });
    }
    drawList(); drawSide();
    el.querySelector('#rl-q').addEventListener('input', (e) => { A._rlQ = e.target.value; drawList(); });
    A.on(el, '.rl-nav [data-g]', 'click', (e, b) => { A._rlGrp = b.dataset.g; el.querySelectorAll('.rl-nav [data-g]').forEach((x) => x.classList.toggle('on', x === b)); drawList(); window.scrollTo({ top: 0 }); });
    A.on(el, '.rl-strip [data-flt]', 'click', () => { A._rlFlt = 'sample'; A._rlGrp = 'all'; drawList(); });
    A.on(el, '.rl-strip [data-rk]', 'click', (e, b) => openEd(b.dataset.rk));
  }

  const G = (whatEn, whatBn, whyEn, whyBn, howEn, howBn) => ({ en: `<p><b>What:</b> ${whatEn}</p><p><b>Why:</b> ${whyEn}</p><p><b>How:</b></p><ol>${howEn.map((x) => `<li>${x}</li>`).join('')}</ol>`, bn: `<p><b>কী:</b> ${whatBn}</p><p><b>কেন:</b> ${whyBn}</p><p><b>কীভাবে:</b></p><ol>${howBn.map((x) => `<li>${x}</li>`).join('')}</ol>` });

  const gAll = G('Every shop rule as one plain line with a pill: On, Off, Sample (your number is not set yet) or the date it starts. Search, or pick a group on the left.', 'দোকানের প্রতিটা নিয়ম এক লাইনে, পাশে চিহ্ন: চালু, বন্ধ, নমুনা (আপনার সংখ্যা এখনো বসেনি) বা কবে থেকে শুরু। সার্চ করুন বা বাম পাশে ভাগ বাছুন।',
    'Pathao raised its outside-Dhaka rate to ৳150. Type "delivery", press Edit, change 130 to 150 and read "What changes": the last 30 days show how much more customers would have paid.', 'Pathao ঢাকার বাইরের রেট ৳150 করল। "delivery" লিখে খুঁজুন, এডিট চাপুন, 130 কে 150 করুন, "কী বদলাবে" পড়ুন: গত 30 দিনে কাস্টমার কত বেশি দিতেন দেখাবে।',
    ['Search or pick a group (Delivery, Payment & COD, Order flow…).', 'Press Edit on a rule: the editor opens on the right (a sheet on phone).', 'Change the numbers and check "Customer sees" and "What changes".', 'Press Save; money rules ask for your PIN.', 'More options: start on a date, try on last month, history with undo, back to default.'],
    ['সার্চ করুন বা একটা ভাগ বাছুন (ডেলিভারি, পেমেন্ট ও COD, অর্ডার ফ্লো…)।', 'নিয়মের পাশে এডিট চাপুন: ডান পাশে ফর্ম খুলবে (ফোনে নিচ থেকে)।', 'সংখ্যা বদলান, "কাস্টমার দেখবেন" ও "কী বদলাবে" মিলিয়ে নিন।', 'সেভ চাপুন; টাকার নিয়মে PIN লাগবে।', 'আরও অপশন: তারিখ থেকে শুরু, গত মাসে পরীক্ষা, ইতিহাস থেকে ফেরত, ডিফল্টে ফেরত।']);
  const gCp = G('Sale prices on products, coupon codes and buy-more savings.', 'প্রোডাক্টে সেল দাম, কুপন কোড ও বেশি কিনলে ছাড়।', 'Winter polo week: 12% off all polos for 7 days. The margin check warns you if any polo would sell below its ERP buying price.', 'শীতের পোলো সপ্তাহ: 7 দিন সব পোলোতে 12% ছাড়। কোনো পোলো ERP কেনা দামের নিচে গেলে লাভের চেক সতর্ক করবে।', ['Press "New discount" or "New coupon".', 'Choose type, amount, products and dates.', 'Read the margin warning and "Customer sees".', 'Save with your PIN. Click a coupon to see its sales.'], ['"নতুন ছাড়" বা "নতুন কুপন" চাপুন।', 'ধরন, পরিমাণ, প্রোডাক্ট ও তারিখ দিন।', 'লাভের সতর্কতা ও "কাস্টমার দেখবেন" পড়ুন।', 'PIN দিয়ে সেভ করুন। বিক্রি দেখতে কুপনে ক্লিক করুন।']);
  /* ================= ROUND 3: order-flow additions, courier messages, pop-ups hub ================= */
  const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const fillPh = (s, c) => String(s == null ? '' : s).replace(/\{(\w+)\}/g, (m, k) => (c[k] != null ? c[k] : m));
  const CM = [
    ['booking', ['Booking note', 'বুকিং নোট'], 'Order {order} for {name} ({phone}). Cash to collect: {cod}. Please handle with care.', 'অর্ডার {order}, {name} ({phone})। ক্যাশ নেবেন: {cod}। সাবধানে হ্যান্ডেল করবেন।'],
    ['delivery', ['Delivery instruction', 'ডেলিভারির নির্দেশনা'], 'Please call {name} on {phone} before delivery. The customer may try the item at the door.', 'ডেলিভারির আগে {name} কে {phone} নম্বরে কল করবেন। কাস্টমার দরজায় পণ্য ট্রাই করে দেখতে পারবেন।'],
    ['cod', ['COD amount line', 'COD টাকার লাইন'], 'Collect {cod} in cash. Do not hand over the parcel without payment.', '{cod} ক্যাশ নেবেন। টাকা ছাড়া পার্সেল দেবেন না।'],
    ['reattempt', ['Re-attempt request', 'আবার ডেলিভারির অনুরোধ'], 'Customer {name} ({phone}) is ready now. Please try delivery of {tracking} again today.', 'কাস্টমার {name} ({phone}) এখন রেডি। আজ {tracking} পার্সেলটা আবার ডেলিভারি করুন।'],
    ['hold', ['Hold request', 'হোল্ড অনুরোধ'], 'Please hold parcel {tracking} (order {order}) at your hub. Do not return it yet.', 'পার্সেল {tracking} (অর্ডার {order}) আপনাদের হাবে হোল্ড করে রাখুন। এখনই ফেরত পাঠাবেন না।'],
    ['cancel', ['Cancel request', 'ক্যানসেল অনুরোধ'], 'Please cancel booking {tracking} for order {order}. Do not deliver it.', 'অর্ডার {order} এর বুকিং {tracking} ক্যানসেল করুন। ডেলিভারি করবেন না।'],
    ['returnpick', ['Return pick-up request', 'রিটার্ন পিক-আপ অনুরোধ'], 'Please pick up the return of order {order} from {name} ({phone}) and bring it to our shop.', 'অর্ডার {order} এর রিটার্ন {name} ({phone}) এর কাছ থেকে নিয়ে আমাদের দোকানে পৌঁছে দিন।'],
    ['claim', ['Claim message', 'ক্লেইম মেসেজ'], 'Claim for parcel {tracking} (order {order}): it is lost or damaged. {cod} is due to us. Please settle.', 'পার্সেল {tracking} (অর্ডার {order}) এর ক্লেইম: হারিয়েছে বা নষ্ট হয়েছে। {cod} আমাদের পাওনা। দয়া করে মিটিয়ে দিন।'],
    ['payout', ['Payout request note', 'পেআউট অনুরোধের নোট'], 'Please send the COD payout for delivered parcels. Example: order {order} ({tracking}), {cod}.', 'ডেলিভারি হওয়া পার্সেলের COD পেআউট পাঠিয়ে দিন। যেমন: অর্ডার {order} ({tracking}), {cod}।'],
  ];
  const PH_CM = ['order', 'name', 'phone', 'cod', 'tracking'];
  const cmSample = () => { const o = A.D.orders.find((x) => x.courier && x.tracking) || A.D.orders[0] || {}; return { order: o.id || 'EX-10231', name: o.name || 'Rahim Uddin', phone: o.phone || '01712-345678', cod: tk(o.total || 2480), tracking: o.tracking || 'PT2611234' }; };
  const cmCtx = (x) => { x = x || {}; if (x.lines || x.total != null) return { order: x.id, name: x.name, phone: x.phone, cod: tk(x.paid ? 0 : x.total), tracking: x.tracking || x.consignment || '—' }; const c = Object.assign({}, x); if (c.order && typeof c.order === 'object') { const o = c.order; c.order = o.id; c.name = c.name || o.name; c.phone = c.phone || o.phone; c.cod = c.cod != null ? c.cod : tk(o.paid ? 0 : o.total); c.tracking = c.tracking || o.tracking; } if (typeof c.cod === 'number') c.cod = tk(c.cod); return c; };
  const POPD = {
    holiday: { on: false, from: '2027-02-25', to: '2027-03-07', en: 'Eid is coming! Order by {date} to get it before Eid.', bn: 'ঈদ আসছে! ঈদের আগে পেতে {date} এর মধ্যে অর্ডার করুন।' },
    freebar: { on: true, from: '', to: '', en: 'Add {amount} more to get free delivery.', bn: 'আর {amount} কিনলে ডেলিভারি ফ্রি।' },
    dup: { on: true, from: '', to: '', en: 'It looks like you ordered this {days} days ago (order {order}). Add to that order instead?', bn: 'মনে হচ্ছে {days} দিন আগে এটা অর্ডার করেছেন (অর্ডার {order})। আগের অর্ডারেই যোগ করবেন?' },
    advance: { on: true, from: '', to: '', en: 'To keep your order safe we ask for {amount} in advance by bKash or Nagad. You pay the rest in cash at the door.', bn: 'অর্ডার নিরাপদ রাখতে আমরা bKash বা Nagad এ {amount} অগ্রিম চাই। বাকিটা দরজায় ক্যাশে দেবেন।' },
    stockhold: { on: true, from: '', to: '', en: 'We are holding your size for {minutes} minutes. Please finish your order.', bn: 'আপনার সাইজটা {minutes} মিনিট ধরে রাখা হয়েছে। অর্ডারটা শেষ করুন।' },
    oos: { on: true, from: '', to: '', en: 'Sorry, size {size} was just taken. Please pick another size or colour.', bn: 'দুঃখিত, সাইজ {size} এইমাত্র শেষ হয়ে গেছে। অন্য সাইজ বা কালার বেছে নিন।' },
    lowstock: { on: true, from: '', to: '', n: 3, en: 'Only {n} left — order soon.', bn: 'মাত্র {n}টা বাকি — তাড়াতাড়ি অর্ডার করুন।' },
    thanks: { on: true, from: '', to: '', en: 'Thank you, {name}! Your order {order} is placed. We will call you soon to confirm.', bn: 'ধন্যবাদ, {name}! আপনার অর্ডার {order} হয়েছে। কনফার্ম করতে শিগগির কল করব।' },
    promise: { on: true, from: '', to: '', en: 'Arrives in {days} days.', bn: 'পৌঁছাতে {days} দিন লাগবে।' },
  };
  function ensureR3() {
    const r = R(); if (!r) return;
    if (!r.dup) r.dup = { days: 5, autoMerge: false, mergeHours: 2 };
    if (!r.adjust) r.adjust = { roles: [{ role: 'Order manager', amount: 300, percent: 10 }, { role: 'Customer care', amount: 150, percent: 5 }, { role: 'Marketing', amount: 0, percent: 0 }, { role: 'Packing', amount: 0, percent: 0 }] };
    if (!r.advRemind) r.advRemind = { hours: 6, autoCancel: false, cancelHours: 24 };
    if (!r.courierMsgs) { r.courierMsgs = {}; CM.forEach((c) => { r.courierMsgs[c[0]] = { en: c[2], bn: c[3] }; }); }
    if (!r.pops) { r.pops = {}; Object.keys(POPD).forEach((k) => { r.pops[k] = clone(POPD[k]); }); }
    if (r.popup && !('titleBn' in r.popup)) Object.assign(r.popup, { titleBn: 'শীতের কালেকশন এসে গেছে', textBn: 'প্রথম অর্ডারে WELCOME100 কোডে 10% ছাড় নিন', from: '', to: '' });
    if (A.D.ruleSample && !A.D._r3s) { A.D._r3s = 1; A.D.ruleSample.adjust = 1; }
  }
  const roleOpts = () => R().adjust.roles;

  /* ----- Order flow additions (the Orders pages read these) ----- */
  SPECS.push(
    { key: 'dupMerge', tab: 'flow', title: ['Duplicate orders & merging', 'ডুপ্লিকেট অর্ডার ও মার্জ'], kw: 'duplicate merge same phone address look back packed',
      get: () => clone(R().dup), set: (v) => { R().dup = v; },
      summary: (v) => t(`Look back ${v.days} days · auto-merge ${v.autoMerge ? `on (same phone and address within ${v.mergeHours} h)` : 'off'} · no merge once packed`, `${v.days} দিন পেছনে দেখে · অটো মার্জ ${v.autoMerge ? `চালু (একই ফোন ও ঠিকানা ${v.mergeHours} ঘণ্টার মধ্যে)` : 'বন্ধ'} · প্যাক হলে আর মার্জ নয়`),
      form: (v) => `<div class="formgrid">${U.field(t('Look back (days)', 'কত দিন পেছনে দেখবে'), U.input('f-dm-d', v.days, 'type="number" min="1" max="30"'), t('An order from the same phone inside this window is marked "Merge needed".', 'এই সময়ের মধ্যে একই ফোনের আরেক অর্ডার আসলে "মার্জ লাগবে" ট্যাগ পড়ে।'))}</div>
        ${tog('f-dm-a', v.autoMerge, t('Merge by itself when phone and address are the same', 'ফোন ও ঠিকানা একই হলে নিজে থেকে মার্জ'))}
        <div class="formgrid">${U.field(t('Only if the second order comes within (hours)', 'দ্বিতীয় অর্ডার এত ঘণ্টার মধ্যে এলে'), U.input('f-dm-h', v.mergeHours, 'type="number" min="1" max="72"'))}</div>
        <div class="rl-lvl">${A.icon('check')} <b>${t('Fixed rule:', 'স্থায়ী নিয়ম:')}</b> ${t('No merge once an order is packed. A different address always asks a person.', 'প্যাক হয়ে গেলে আর মার্জ হবে না। ঠিকানা আলাদা হলে সবসময় একজন মানুষ ঠিক করবে।')}</div>`,
      read: (el) => ({ days: num(el, 'f-dm-d'), autoMerge: chk(el, 'f-dm-a'), mergeHours: num(el, 'f-dm-h') }),
      check: (v) => (!(v.days >= 1) ? t('Enter the number of days.', 'দিনের সংখ্যা দিন।') : v.autoMerge && !(v.mergeHours >= 1) ? t('Enter the hours for auto-merge.', 'অটো মার্জের ঘণ্টা দিন।') : ''),
      text: () => ({ en: 'Customers do not see this. Your team sees "Merge needed" on the order.', bn: 'কাস্টমার এটা দেখেন না। আপনার টিম অর্ডারে "মার্জ লাগবে" দেখবে।' }),
      sim: (v) => { const os = A.D.orders.filter((o) => o.status !== 'cancelled'); let n = 0; os.forEach((o) => { if (os.some((x) => x !== o && x.phone === o.phone && x.created < o.created && new Date(o.created) - new Date(x.created) <= v.days * 864e5)) n++; }); return [`${n} orders in the last 60 days came from a phone that ordered in the ${v.days} days before.`, `গত 60 দিনে ${n}টি অর্ডার এমন ফোন থেকে এসেছে যে আগের ${v.days} দিনে অর্ডার করেছিল।`]; } },
    { key: 'adjust', tab: 'flow', title: ['Price-adjust limits by role', 'রোল অনুযায়ী দাম কমানোর সীমা'], money: true, kw: 'price adjust discount limit role staff approval owner',
      get: () => clone(R().adjust), set: (v) => { R().adjust = v; },
      summary: (v) => v.roles.filter((x) => x.amount || x.percent).map((x) => `${x.role} ${tk(x.amount)} / ${x.percent}%`).join(' · ') + t(' · above the limit the owner approves', ' · সীমার বেশি হলে মালিক অনুমোদন দেন'),
      form: (v) => `<div class="muted small">${t('How much staff can take off an order price (on the phone or in the order). Above the limit the order waits for the owner. 0 = not allowed.', 'অর্ডারের দাম স্টাফ কতটা কমাতে পারবেন (ফোনে বা অর্ডারে)। সীমার বেশি হলে মালিকের অপেক্ষায় থাকে। 0 = অনুমতি নেই।')}</div>
        <div class="tbl-wrap"><table class="tbl rl-sct"><thead><tr><th>${t('Role', 'রোল')}</th><th class="r">${t('Most ৳ off', 'সর্বোচ্চ ৳')}</th><th class="r">${t('Most % off', 'সর্বোচ্চ %')}</th></tr></thead><tbody>
        <tr><td>${t('Owner', 'মালিক')}</td><td colspan="2" class="r muted">${t('No limit', 'সীমা নেই')}</td></tr>
        ${v.roles.map((x, i) => `<tr><td>${esc(x.role)}</td><td class="r"><input class="inp sm" id="f-aj-a${i}" type="number" min="0" value="${x.amount}"></td><td class="r"><input class="inp sm" id="f-aj-p${i}" type="number" min="0" max="100" value="${x.percent}"></td></tr>`).join('')}</tbody></table></div>`,
      read: (el, old) => ({ roles: old.roles.map((x, i) => Object.assign({}, x, { amount: num(el, 'f-aj-a' + i), percent: num(el, 'f-aj-p' + i) })) }),
      text: () => ({ en: 'Customers do not see this.', bn: 'কাস্টমার এটা দেখেন না।' }) },
    { key: 'advRemind', tab: 'flow', title: ['Advance request reminder', 'অগ্রিম অনুরোধের রিমাইন্ডার'], onOff: false, kw: 'advance reminder auto cancel hours unpaid',
      get: () => clone(R().advRemind), set: (v) => { R().advRemind = v; },
      summary: (v) => t(`Remind after ${v.hours} h · auto-cancel ${v.autoCancel ? `on after ${v.cancelHours} h` : 'off'}`, `${v.hours} ঘণ্টা পর রিমাইন্ডার · অটো ক্যানসেল ${v.autoCancel ? `চালু (${v.cancelHours} ঘণ্টা পর)` : 'বন্ধ'}`),
      form: (v) => `<div class="formgrid">${U.field(t('Remind the customer after (hours)', 'কত ঘণ্টা পর কাস্টমারকে রিমাইন্ডার'), U.input('f-ar-h', v.hours, 'type="number" min="1" max="72"'), t('Sent by SMS and WhatsApp if the advance is still unpaid.', 'অগ্রিম না দিলে SMS ও WhatsApp এ যাবে।'))}</div>
        ${tog('f-ar-a', v.autoCancel, t('Cancel the order by itself if the advance never comes', 'অগ্রিম না এলে অর্ডার নিজে বাতিল'))}
        <div class="formgrid">${U.field(t('Cancel after (hours)', 'কত ঘণ্টা পর বাতিল'), U.input('f-ar-c', v.cancelHours, 'type="number" min="1" max="240"'))}</div>`,
      read: (el) => ({ hours: num(el, 'f-ar-h'), autoCancel: chk(el, 'f-ar-a'), cancelHours: num(el, 'f-ar-c') }),
      check: (v) => (!(v.hours >= 1) ? t('Enter the reminder hours.', 'রিমাইন্ডারের ঘণ্টা দিন।') : v.autoCancel && v.cancelHours <= v.hours ? t('Cancel time must be after the reminder.', 'বাতিলের সময় রিমাইন্ডারের পরে হতে হবে।') : ''),
      text: (v) => ({ en: `Reminder: your order is waiting for the advance payment. Pay now to confirm it.${v.autoCancel ? ` Unpaid orders are cancelled after ${v.cancelHours} hours.` : ''}`, bn: `রিমাইন্ডার: আপনার অর্ডার অগ্রিম পেমেন্টের অপেক্ষায় আছে। কনফার্ম করতে এখনই পেমেন্ট করুন।${v.autoCancel ? ` ${v.cancelHours} ঘণ্টার মধ্যে পেমেন্ট না এলে অর্ডার বাতিল হবে।` : ''}` }) },
  );
  /* ----- Courier messages ----- */
  CM.forEach((c) => SPECS.push({ key: 'cm_' + c[0], tab: 'couriermsg', title: c[1], ownText: true, kw: 'courier message ' + c[0] + ' ' + c[1][0].toLowerCase(),
    get: () => clone(R().courierMsgs[c[0]]), set: (v) => { R().courierMsgs[c[0]] = v; },
    summary: (v) => esc(trunc(v.en, 70)),
    form: (v) => `<div class="field"><label>${t('Put in a detail', 'তথ্য বসান')}</label><div class="chips">${PH_CM.map((p) => `<button type="button" class="chip" data-ph="{${p}}">{${p}}</button>`).join('')}</div><div class="hint">${t('Click one to add it where you are typing. It is filled with the real order when sent.', 'যেখানে লিখছেন সেখানে বসাতে একটায় ক্লিক করুন। পাঠানোর সময় আসল অর্ডারের তথ্য বসে যাবে।')}</div></div>
      ${c[0] === 'delivery' ? `<div class="field"><label>${t('Quick lines', 'দ্রুত লাইন')}</label><div class="chips"><button type="button" class="chip" data-phrase data-en="Please call the customer before delivery." data-bn="ডেলিভারির আগে কাস্টমারকে কল করবেন।">${t('Call before delivery', 'ডেলিভারির আগে কল')}</button><button type="button" class="chip" data-phrase data-en="The customer may try the item at the door." data-bn="কাস্টমার দরজায় পণ্য ট্রাই করতে পারবেন।">${t('Trial at door allowed', 'দরজায় ট্রাই করা যাবে')}</button></div></div>` : ''}
      <div class="field"><label>${t('Text in English', 'ইংরেজিতে লেখা')}</label><textarea class="inp" id="f-cm-en" rows="3" maxlength="300">${esc(v.en)}</textarea></div>
      <div class="field"><label>${t('Text in Bengali', 'বাংলায় লেখা')}</label><textarea class="inp" id="f-cm-bn" rows="3" maxlength="300">${esc(v.bn)}</textarea></div>`,
    read: (el) => ({ en: val(el, 'f-cm-en'), bn: val(el, 'f-cm-bn') }),
    check: (v) => (!v.en || !v.bn ? t('Write the text in English and Bengali.', 'ইংরেজি ও বাংলা দুই ভাষাতেই লিখুন।') : ''),
    preview: (v) => { const x = cmSample(); return `<div class="po-msg"><div class="po-msg-h">${t('To the courier', 'কুরিয়ারকে')} · ${t('sample order', 'নমুনা অর্ডার')} ${esc(x.order)}</div><div class="po-bub">${esc(fillPh(v.en, x))}</div><div class="po-bub bn">${esc(fillPh(v.bn, x))}</div></div>`; } }));

  /* ----- Pop-ups & notices hub ----- */
  const PGN = { home: ['Shop home', 'দোকানের হোম'], product: ['Product page', 'প্রোডাক্ট পেজ'], checkout: ['Checkout', 'চেকআউট'], thanks: ['After order', 'অর্ডারের পর'] };
  const PGROUPS = [['shop', 'website', ['On the shop', 'দোকানে'], 'home'], ['checkout', 'check', ['At checkout', 'চেকআউটে'], 'checkout'], ['product', 'products', ['Product pages', 'প্রোডাক্ট পেজে'], 'product'], ['after', 'send', ['After order', 'অর্ডারের পর'], 'thanks']];
  const dlink = (k) => A.href('rules', 'all', k);
  const POP = [
    { n: 1, key: 'notice', g: 'shop', spec: 'notice', page: 'home', kind: 'bar', pos: [50, 3], name: ['Notice bar', 'নোটিশ বার'], where: ['Top of every page', 'প্রতিটা পেজের ওপরে'], who: ['Every visitor', 'সব ভিজিটর'], kw: 'notice bar top announcement' },
    { n: 2, key: 'popup', g: 'shop', spec: 'popup', page: 'home', kind: 'modal', pos: [50, 50], name: ['Welcome / offer pop-up', 'স্বাগত / অফার পপ-আপ'], where: ['Home page, a few seconds after opening', 'হোম পেজে, খোলার কয়েক সেকেন্ড পর'], who: ['Every visitor, once a day', 'সব ভিজিটর, দিনে একবার'], kw: 'welcome offer popup first visit' },
    { n: 3, key: 'holiday', g: 'shop', page: 'home', kind: 'banner', pos: [50, 19], name: ['Holiday banner', 'উৎসবের ব্যানার'], where: ['Under the menu on every page', 'প্রতিটা পেজে মেনুর নিচে'], who: ['Every visitor', 'সব ভিজিটর'], phs: ['date'], managed: [['Eid last order dates', 'ঈদের শেষ অর্ডারের তারিখ'], dlink('eid')], kw: 'holiday eid banner' },
    { n: 4, key: 'freebar', g: 'shop', page: 'home', kind: 'toast', pos: [50, 90], name: ['Free-delivery bar', 'ফ্রি ডেলিভারি বার'], where: ['In the bag, above the total', 'ব্যাগে, মোটের ওপরে'], who: ['Customers whose bag is below the free-delivery amount', 'যাদের ব্যাগ ফ্রি ডেলিভারির পরিমাণের নিচে'], phs: ['amount'], dep: [() => R().freeDelivery.on, ['Free delivery rule', 'ফ্রি ডেলিভারি নিয়ম'], dlink('free')], kw: 'free delivery bar bag amount' },
    { n: 5, key: 'dup', g: 'checkout', page: 'checkout', kind: 'modal', pos: [50, 47], name: ['Duplicate-order pop-up', 'ডুপ্লিকেট অর্ডার পপ-আপ'], where: ['Checkout, when pressing Place order', 'চেকআউটে, অর্ডার করার সময়'], who: ['Customers who ordered the same item recently', 'যারা সম্প্রতি একই পণ্য অর্ডার করেছেন'], phs: ['days', 'order'], managed: [['Duplicate look-back (Order flow)', 'ডুপ্লিকেট লুক-ব্যাক (অর্ডার ফ্লো)'], dlink('dupMerge')], kw: 'duplicate order popup merge' },
    { n: 6, key: 'advance', g: 'checkout', page: 'checkout', kind: 'inline', pos: [50, 72], name: ['Advance-payment notice', 'অগ্রিম পেমেন্টের নোটিশ'], where: ['Checkout, next to the payment choice', 'চেকআউটে, পেমেন্ট অপশনের পাশে'], who: ['Customers who must pay an advance', 'যাদের অগ্রিম দিতে হবে'], phs: ['amount'], dep: [() => R().advance.on, ['Advance payment rule', 'অগ্রিম পেমেন্ট নিয়ম'], dlink('advance')], kw: 'advance payment notice' },
    { n: 7, key: 'stockhold', g: 'checkout', page: 'checkout', kind: 'inline', pos: [86, 14], name: ['Stock-hold notice', 'স্টক হোল্ডের নোটিশ'], where: ['Checkout, at the top while the customer fills the form', 'চেকআউটে, ফর্ম পূরণের সময় ওপরে'], who: ['Customers whose size is on hold', 'যাদের সাইজ হোল্ডে আছে'], phs: ['minutes'], managed: [['Stock hold (Order flow)', 'স্টক হোল্ড (অর্ডার ফ্লো)'], dlink('stockhold')], kw: 'stock hold notice minutes' },
    { n: 8, key: 'oos', g: 'checkout', page: 'checkout', kind: 'inline', pos: [14, 30], name: ['Out-of-stock size notice', 'সাইজ শেষ হওয়ার নোটিশ'], where: ['Checkout, on the item line', 'চেকআউটে, পণ্যের লাইনে'], who: ['Customers whose size was taken meanwhile', 'যাদের সাইজ এর মধ্যে অন্য কেউ নিয়ে নিয়েছে'], phs: ['size'], dep: [() => R().stockHold.soldOut, ['Stock hold: show sold out', 'স্টক হোল্ড: শেষ দেখানো'], dlink('stockhold')], kw: 'out of stock size sold out notice' },
    { n: 9, key: 'demo', g: 'product', page: 'product', kind: 'modal', pos: [50, 45], ro: true, name: ['Demo-product "coming soon" pop-up', 'ডেমো প্রোডাক্টের "শিগগির আসছে" পপ-আপ'], where: ['Product page, when Add to bag or Order now is tapped on a demo design', 'প্রোডাক্ট পেজে, ডেমো ডিজাইনে ব্যাগে যোগ বা অর্ডার চাপলে'], who: ['Visitors who tap a demo product', 'যারা ডেমো প্রোডাক্টে চাপেন'], managed: [['Settings › Demo products', 'সেটিংস › ডেমো প্রোডাক্ট'], A.href('settings', 'demo')], kw: 'demo coming soon popup' },
    { n: 10, key: 'lowstock', g: 'product', page: 'product', kind: 'inline', pos: [30, 68], name: ['Low-stock notice', 'কম স্টকের নোটিশ'], where: ['Product page, next to the size picker', 'প্রোডাক্ট পেজে, সাইজ বাছাইয়ের পাশে'], who: ['Everyone, when a size is nearly gone', 'সবাই, যখন কোনো সাইজ প্রায় শেষ'], phs: ['n'], num: ['Show when this many are left or fewer', 'এতটা বা কম বাকি থাকলে দেখাবে'], kw: 'low stock only few left' },
    { n: 11, key: 'thanks', g: 'after', page: 'thanks', kind: 'inline', pos: [50, 32], name: ['Thank-you notice', 'ধন্যবাদের নোটিশ'], where: ['Order done page', 'অর্ডার সম্পন্ন পেজে'], who: ['Every customer who orders', 'যে কাস্টমার অর্ডার করেন'], phs: ['name', 'order'], kw: 'thank you order placed' },
    { n: 12, key: 'promise', g: 'after', page: 'thanks', kind: 'inline', pos: [50, 62], altPos: [['product', 50, 85]], name: ['Delivery promise', 'ডেলিভারির প্রতিশ্রুতি'], where: ['Order done page (also under Order now on product pages)', 'অর্ডার সম্পন্ন পেজে (প্রোডাক্ট পেজে অর্ডার বাটনের নিচেও)'], who: ['Every customer', 'সব কাস্টমার'], phs: ['days'], managed: [['Delivery days (Delivery charges)', 'ডেলিভারির দিন (ডেলিভারি চার্জ)'], dlink('fees')], kw: 'delivery promise days arrives' },
  ];
  const popOf = (k) => POP.find((p) => p.key === k);
  const demoOn = () => (A.D.demo ? A.D.demo.on !== false : true);
  function popState(p) {
    if (p.key === 'notice') { const n = R().notice; return { on: !!n.on, from: n.from, to: n.to, en: n.text, bn: n.textBn }; }
    if (p.key === 'popup') { const u = R().popup; return { on: !!u.on, from: u.from || '', to: u.to || '', en: u.title + ' — ' + u.text, bn: (u.titleBn || '') + ' — ' + (u.textBn || '') }; }
    if (p.key === 'demo') { const d = (A.D.demo && A.D.demo.popup) || {}; return { on: demoOn(), from: '', to: '', en: d.en || 'This design is coming soon — see what is available in this category.', bn: d.bn || 'এই ডিজাইন শিগগির আসছে — এই ক্যাটাগরিতে যা আছে দেখুন।' }; }
    return R().pops[p.key];
  }
  function setPopOn(p, on) {
    if (p.key === 'notice') R().notice.on = on; else if (p.key === 'popup') { R().popup.on = on; R().notice.popup = on; } else R().pops[p.key].on = on;
    A.commit(`${p.name[0]} turned ${on ? 'on' : 'off'}`); A.toast(on ? t(`${p.name[0]} is on`, `${p.name[1]} চালু`) : t(`${p.name[0]} is off`, `${p.name[1]} বন্ধ`), 'good'); A.render();
  }
  function popStatus(p) {
    const s = popState(p); const d = TODAY();
    if (!s.on) return ['off', t('Off', 'বন্ধ')];
    if (p.dep && !p.dep[0]()) return ['smp', t('Waiting', 'অপেক্ষায়')];
    if (s.from && s.from > d) return ['sch', t('From ', '') + dshort(s.from) + t('', ' থেকে')];
    if (s.to && s.to < d) return ['off', t('Ended', 'শেষ')];
    return ['on', t('Showing', 'দেখাচ্ছে')];
  }
  const phSample = (key) => ({ date: dshort(R().eid.insideLast), amount: tk(Math.max(0, R().freeDelivery.over - 1800)), days: key === 'dup' ? R().dup.days : (R().delivery.inside.days || '1–2'), order: 'EX-10231', minutes: R().stockHold.checkoutMin, size: 'L', n: (R().pops.lowstock || {}).n || 3, name: 'Rahim' });
  const thumbB = { home: '<i class="hero"></i><i class="ln"></i><i class="ln s"></i>', product: '<i class="im"></i><i class="ln"></i><i class="ln s"></i><i class="bt"></i>', checkout: '<i class="ln a"></i><i class="ln b"></i><i class="ln s"></i><i class="bt"></i>', thanks: '<i class="ck"></i><i class="ln"></i><i class="ln s"></i>' };
  const thumb = (page, kind) => `<span class="po-th pg-${page}"><i class="hd"></i>${thumbB[page]}${kind ? `<i class="hl k-${kind}"></i>` : ''}</span>`;
  const popText = (p, v) => { const c = phSample(p.key); return { en: fillPh(v.en, c), bn: fillPh(v.bn, c) }; };
  function popPreview(p, v) {
    const x = popText(p, v); const tx = A.lang === 'bn' && x.bn ? x.bn : x.en; let mock = '';
    if (p.kind === 'bar' || p.kind === 'banner') mock = `<div class="rl-shop">${p.kind === 'bar' && v.on ? `<div class="rl-bar">${esc(tx)}</div>` : ''}<div class="hd"><span>☰</span><span>EXTAS</span><span>🛒</span></div>${p.kind === 'banner' ? `<div class="po-ban">${esc(tx)}</div>` : ''}<div class="bd"></div></div>`;
    else if (p.kind === 'modal') mock = `<div class="rl-pop"><div class="box"><div class="img">${t('Picture', 'ছবি')}</div><div class="small" style="color:var(--ink)">${esc(tx)}</div><span class="btn primary sm" style="justify-content:center">${p.key === 'dup' ? t('Add to my earlier order', 'আগের অর্ডারে যোগ করুন') : t('OK', 'ঠিক আছে')}</span></div></div>`;
    else if (p.kind === 'toast') mock = `<div class="po-bag"><div class="ln"><span>${t('Products', 'প্রোডাক্ট')}</span><b>${tk(1200)}</b></div><div class="po-note">${esc(tx)}</div><div class="ln"><span>${t('Total', 'মোট')}</span><b>${tk(1200)}</b></div></div>`;
    else mock = `<div class="po-bag"><div class="ln"><span>${t('Panjabi, size L × 1', 'পাঞ্জাবি, সাইজ L × 1')}</span><b>${tk(2480)}</b></div><div class="po-note">${esc(tx)}</div></div>`;
    return `${mock}<div class="po-both"><div><span class="muted small">EN</span> ${esc(x.en)}</div><div class="bn"><span class="muted small">বাং</span> ${esc(x.bn)}</div></div><div class="small muted" style="margin-top:6px">${t('Sample values are used for the {details}.', '{details} এর জায়গায় নমুনা মান বসানো হয়েছে।')}</div>`;
  }
  const popForm = (p, v) => {
    const ml = p.managed ? `<div class="callout info"><span>${A.icon('info')} ${t('Set in', 'ঠিক হয়')} <b>${t(p.managed[0][0], p.managed[0][1])}</b>. <a class="linkbtn" href="${p.managed[1]}">${t('Open', 'খুলুন')} →</a></span></div>` : '';
    const dp = p.dep && !p.dep[0]() ? `<div class="callout warn"><span>${A.icon('warn')} ${t('This only shows when', 'এটা তখনই দেখাবে যখন')} <b>${t(p.dep[1][0], p.dep[1][1])}</b> ${t('is on.', 'চালু থাকবে।')} <a class="linkbtn" href="${p.dep[2]}">${t('Open', 'খুলুন')} →</a></span></div>` : '';
    return `${ml}${dp}${tog('f-po-on', v.on, t('Show this', 'এটা দেখান'))}
      ${p.phs ? `<div class="field"><label>${t('Put in a detail', 'তথ্য বসান')}</label><div class="chips">${p.phs.map((x) => `<button type="button" class="chip" data-ph="{${x}}">{${x}}</button>`).join('')}</div></div>` : ''}
      <div class="field"><label>${t('Text in English', 'ইংরেজিতে লেখা')}</label><textarea class="inp" id="f-po-en" rows="2" maxlength="200">${esc(v.en)}</textarea></div>
      <div class="field"><label>${t('Text in Bengali', 'বাংলায় লেখা')}</label><textarea class="inp" id="f-po-bn" rows="2" maxlength="200">${esc(v.bn)}</textarea></div>
      <div class="formgrid">${U.field(t('Show from', 'শুরু'), U.input('f-po-f', v.from || '', 'type="date"'), t('Empty = always', 'খালি = সবসময়'))}${U.field(t('Until', 'শেষ'), U.input('f-po-u', v.to || '', 'type="date"'))}${p.num ? U.field(t(p.num[0], p.num[1]), U.input('f-po-n', v.n, 'type="number" min="1" max="50"')) : ''}</div>`;
  };
  POP.filter((p) => !p.spec && !p.ro).forEach((p) => SPECS.push({ key: 'pop_' + p.key, tab: 'popups', title: p.name, onOff: true, ownText: true, kw: p.kw,
    get: () => clone(R().pops[p.key]), set: (v) => { R().pops[p.key] = v; },
    summary: (v) => (v.on ? esc(trunc(v.en, 60)) + (v.from || v.to ? ` · ${v.from ? dshort(v.from) : ''}–${v.to ? dshort(v.to) : ''}` : '') : t('Off', 'বন্ধ')),
    form: (v) => popForm(p, v),
    read: (el, old) => Object.assign({}, old, { on: chk(el, 'f-po-on'), en: val(el, 'f-po-en'), bn: val(el, 'f-po-bn'), from: val(el, 'f-po-f'), to: val(el, 'f-po-u') }, p.num ? { n: num(el, 'f-po-n') } : {}),
    check: (v) => (v.on && (!v.en || !v.bn) ? t('Write the text in English and Bengali.', 'ইংরেজি ও বাংলা দুই ভাষাতেই লিখুন।') : v.to && v.from && v.to < v.from ? t('"Until" must be after "From".', '"শেষ" তারিখ "শুরু" র পরে হতে হবে।') : ''),
    preview: (v) => popPreview(p, v) }));
  /* notice & welcome pop-up specs now live in the hub: use the same item layout */
  Object.assign(spec('notice'), { tab: 'popups', form: (v) => `${tog('f-nt-on', v.on, t('Show the notice bar', 'নোটিশ বার দেখান'))}<div class="formgrid">${U.field(t('Text in English', 'ইংরেজিতে লেখা'), U.input('f-nt-t', v.text, 'maxlength="90"'))}${U.field(t('Text in Bengali', 'বাংলায় লেখা'), U.input('f-nt-tb', v.textBn || '', 'maxlength="90"'))}${U.field(t('From', 'শুরু'), U.input('f-nt-f', v.from, 'type="date"'))}${U.field(t('Until', 'শেষ'), U.input('f-nt-u', v.to, 'type="date"'))}</div>` });
  Object.assign(spec('popup'), { tab: 'popups', title: ['Welcome / offer pop-up', 'স্বাগত / অফার পপ-আপ'],
    summary: (v) => (v.on ? t(`On · after ${v.seconds} s${v.from ? ' · ' + dshort(v.from) + '–' + dshort(v.to) : ''}`, `চালু · ${v.seconds} সেকেন্ড পর${v.from ? ' · ' + dshort(v.from) + '–' + dshort(v.to) : ''}`) : t('Off', 'বন্ধ')),
    form: (v) => `${tog('f-pu-on', v.on, t('Show a pop-up on the shop', 'দোকানে পপ-আপ দেখান'))}<div class="formgrid">${U.field(t('Heading (English)', 'শিরোনাম (ইংরেজি)'), U.input('f-pu-h', v.title, 'maxlength="50"'))}${U.field(t('Heading (Bengali)', 'শিরোনাম (বাংলা)'), U.input('f-pu-hb', v.titleBn || '', 'maxlength="50"'))}${U.field(t('Text (English)', 'লেখা (ইংরেজি)'), U.input('f-pu-t', v.text, 'maxlength="120"'))}${U.field(t('Text (Bengali)', 'লেখা (বাংলা)'), U.input('f-pu-tb', v.textBn || '', 'maxlength="120"'))}${U.field(t('Show after (seconds)', 'কত সেকেন্ড পর দেখাবে'), U.input('f-pu-s', v.seconds, 'type="number" min="0" max="120"'), t('Shown once per visitor per day.', 'প্রতি ভিজিটরকে দিনে একবার।'))}${U.field(t('Show from', 'শুরু'), U.input('f-pu-f', v.from || '', 'type="date"'), t('Empty = always', 'খালি = সবসময়'))}${U.field(t('Until', 'শেষ'), U.input('f-pu-u', v.to || '', 'type="date"'))}<div class="field"><label>${t('Picture', 'ছবি')}</label><button class="btn" type="button" data-pu-img>${A.icon('plus')} ${t('Choose picture', 'ছবি বাছুন')}</button></div></div>`,
    read: (el) => ({ on: chk(el, 'f-pu-on'), title: val(el, 'f-pu-h'), titleBn: val(el, 'f-pu-hb'), text: val(el, 'f-pu-t'), textBn: val(el, 'f-pu-tb'), seconds: num(el, 'f-pu-s'), from: val(el, 'f-pu-f'), to: val(el, 'f-pu-u') }),
    check: (v) => (v.from && v.to && v.to < v.from ? t('"Until" must be after "From".', '"শেষ" তারিখ "শুরু" র পরে হতে হবে।') : v.on && !v.title ? t('Write a heading.', 'শিরোনাম লিখুন।') : ''),
    preview: (v) => { const h = A.lang === 'bn' && v.titleBn ? v.titleBn : v.title; const x = A.lang === 'bn' && v.textBn ? v.textBn : v.text; return `<div class="rl-pop">${v.on ? `<div class="box"><div class="img">${t('Your picture', 'আপনার ছবি')}</div><b>${esc(h)}</b><div class="small">${esc(x)}</div><span class="btn primary sm" style="justify-content:center">${t('Shop now', 'এখনই কিনুন')}</span></div>` : `<span class="muted small">${t('No pop-up', 'পপ-আপ নেই')}</span>`}</div><div class="small muted" style="margin-top:6px">${v.on ? t(`Appears ${v.seconds} seconds after the visitor opens the shop.`, `ভিজিটর দোকান খোলার ${v.seconds} সেকেন্ড পর আসবে।`) : ''}</div>`; } });

  A.css('rules-r3', `
    .po-th{position:relative;display:block;width:62px;height:48px;border:1px solid var(--line2);border-radius:7px;background:var(--bg2);overflow:hidden;flex:none}
    .po-th i{position:absolute;display:block;border-radius:2px;background:var(--line2)}
    .po-th i.hd{left:0;right:0;top:0;height:13%;border-radius:0;background:var(--card);border-bottom:1px solid var(--line2)}
    .po-th i.hero{left:8%;right:8%;top:20%;height:30%}
    .po-th i.im{left:8%;top:20%;width:38%;height:48%}
    .po-th i.ln{left:8%;right:8%;top:58%;height:6%} .po-th i.ln.s{top:70%;right:42%} .po-th i.ln.a{top:22%} .po-th i.ln.b{top:36%}
    .po-th.pg-product i.ln{left:52%;right:8%;top:24%} .po-th.pg-product i.ln.s{top:36%;right:24%}
    .po-th i.bt{left:8%;right:8%;bottom:8%;height:12%;background:var(--navy2,var(--ink2));opacity:.55}
    .po-th i.ck{left:38%;top:20%;width:24%;height:24%;border-radius:50%;background:var(--good)}
    .po-th.pg-thanks i.ln{top:56%}
    .po-th i.hl{background:var(--accent);opacity:.92;box-shadow:0 0 0 1px var(--card)}
    .po-th i.hl.k-bar{left:0;right:0;top:0;height:13%;border-radius:0}
    .po-th i.hl.k-banner{left:0;right:0;top:14%;height:11%;border-radius:0}
    .po-th i.hl.k-modal{left:20%;right:20%;top:26%;bottom:24%;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.35)}
    .po-th i.hl.k-inline{left:8%;right:8%;top:47%;height:14%}
    .po-th i.hl.k-toast{left:14%;right:14%;bottom:5%;height:13%;border-radius:6px}
    .po-leg{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    .po-fw{display:flex;flex-direction:column;gap:6px;align-items:center}
    .po-fw>b{font-size:12.5px;text-align:center}
    .po-fr{position:relative;width:100%;max-width:170px;height:200px;border:1px solid var(--line2);border-radius:10px;background:var(--bg2);overflow:hidden}
    .po-fr i{position:absolute;display:block;border-radius:2px;background:var(--line2)}
    .po-fr i.hd{left:0;right:0;top:0;height:8%;border-radius:0;background:var(--card);border-bottom:1px solid var(--line2)}
    .po-fr i.hero{left:8%;right:8%;top:12%;height:26%} .po-fr i.im{left:8%;top:12%;width:38%;height:40%}
    .po-fr i.ln{left:8%;right:8%;top:44%;height:4%} .po-fr i.ln.s{top:52%;right:44%} .po-fr i.ln.a{top:14%;height:5%} .po-fr i.ln.b{top:24%;height:5%}
    .po-fr.pg-product i.ln{left:52%;right:8%;top:14%} .po-fr.pg-product i.ln.s{top:22%;right:24%}
    .po-fr i.bt{left:8%;right:8%;bottom:6%;height:8%;background:var(--navy2,var(--ink2));opacity:.5}
    .po-fr i.ck{left:38%;top:14%;width:24%;height:15%;border-radius:50%;background:var(--good)}
    .po-fr.pg-thanks i.ln{top:40%}
    .po-mk{position:absolute;width:21px;height:21px;border-radius:50%;background:var(--accent);color:#fff;font:700 11px/1 var(--f-sans,inherit);display:grid;place-items:center;transform:translate(-50%,-50%);border:2px solid var(--card);cursor:pointer;padding:0;box-shadow:0 1px 4px rgba(0,0,0,.3)}
    .po-mk:hover,.po-mk.on{background:var(--ink);transform:translate(-50%,-50%) scale(1.15)}
    .po-l{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:14px;align-items:start}
    .po-row{display:grid;grid-template-columns:26px 62px minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 14px;border-top:1px solid var(--line);cursor:pointer}
    .po-row:hover{background:var(--card2)} .po-row.sel{background:var(--accent-soft,var(--card2));box-shadow:inset 3px 0 0 var(--accent)}
    .po-n{width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-weight:700;font-size:12px;display:grid;place-items:center}
    .po-main{min-width:0;display:flex;flex-direction:column;gap:3px}
    .po-main b{font-size:14.5px;font-weight:600}
    .po-meta{font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}
    .po-meta .lb{font-weight:600;color:var(--ink2)}
    .po-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
    .po-chip svg{width:12px;height:12px;flex:none}.po-chip{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;border-radius:999px;padding:2px 9px;background:var(--card2);color:var(--ink2);border:1px solid var(--line);text-decoration:none;white-space:nowrap}
    a.po-chip{color:var(--accent);border-color:var(--accent)}
    .po-st{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
    .po-ban{background:var(--accent-soft,var(--card2));color:var(--accent);text-align:center;font-size:12.5px;font-weight:600;padding:7px 10px}
    .po-bag{border:1px solid var(--line2);border-radius:10px;padding:10px;background:var(--card);display:flex;flex-direction:column;gap:8px;font-size:13px}
    .po-bag .ln{display:flex;justify-content:space-between;gap:8px}
    .po-note{background:var(--info-bg,var(--card2));color:var(--info,var(--ink));border-radius:8px;padding:8px 10px;font-size:12.5px;line-height:1.45}
    .po-both{margin-top:8px;font-size:12.5px;display:flex;flex-direction:column;gap:4px;color:var(--ink2)} .po-both .bn{font-family:var(--f-bn)}
    .po-msg{display:flex;flex-direction:column;gap:6px} .po-msg-h{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
    .po-bub{background:var(--card);border:1px solid var(--line);border-radius:12px 12px 12px 3px;padding:9px 12px;font-size:13.5px;line-height:1.5} .po-bub.bn{font-family:var(--f-bn)}
    .po-lk{display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap}
    @media (max-width:1180px){.po-l{grid-template-columns:minmax(0,1fr) 380px}}
    @media (max-width:860px){.po-l{grid-template-columns:minmax(0,1fr)}.po-leg{grid-template-columns:repeat(2,minmax(0,1fr))}
      .po-l.has-ed .rl-side{position:fixed;left:0;right:0;bottom:0;top:auto;max-height:86vh;z-index:60;border-radius:16px 16px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.25)}
      .po-l.has-ed .rl-edp{border-radius:16px 16px 0 0;border-bottom:0}}
    @media (max-width:520px){.po-row{grid-template-columns:24px 54px minmax(0,1fr);}.po-row .po-st{grid-column:3;flex-direction:row;align-items:center;justify-content:space-between}.po-th{width:54px;height:42px}}
  `);

  function legendHtml() {
    const frames = ['home', 'product', 'checkout', 'thanks'];
    return `<div class="po-leg">${frames.map((f) => {
      const mk = []; POP.forEach((p) => { if (p.page === f) mk.push([p, p.pos[0], p.pos[1]]); (p.altPos || []).forEach((a) => { if (a[0] === f) mk.push([p, a[1], a[2]]); }); });
      return `<div class="po-fw"><div class="po-fr pg-${f}"><i class="hd"></i>${thumbB[f]}${mk.map((m) => `<button type="button" class="po-mk ${A._poSel === m[0].key ? 'on' : ''}" data-mk="${m[0].key}" style="left:${m[1]}%;top:${m[2]}%" title="${esc(t(m[0].name[0], m[0].name[1]))}" aria-label="${esc(t(m[0].name[0], m[0].name[1]))}">${m[0].n}</button>`).join('')}</div><b>${t(PGN[f][0], PGN[f][1])}</b></div>`;
    }).join('')}</div>`;
  }
  function popRow(p) {
    const s = popState(p); const st = popStatus(p); const live = !p.ro;
    const sched = s.from || s.to ? `${s.from ? dshort(s.from) : t('now', 'এখন')} – ${s.to ? dshort(s.to) : t('no end', 'শেষ নেই')}` : t('Always', 'সবসময়');
    return `<div class="po-row ${A._poSel === p.key ? 'sel' : ''}" data-pk="${p.key}" role="button" tabindex="0">
      <span class="po-n">${p.n}</span>${thumb(p.page, p.kind)}
      <div class="po-main"><b>${t(p.name[0], p.name[1])}</b>
        <div class="po-meta"><span class="lb">${t('Where', 'কোথায়')}:</span> ${t(p.where[0], p.where[1])}<br><span class="lb">${t('Who sees it', 'কে দেখে')}:</span> ${t(p.who[0], p.who[1])}</div>
        <div class="po-chips"><span class="po-chip">${A.icon('check')} ${sched}</span>${p.managed ? `<a class="po-chip" href="${p.managed[1]}">${t('Managed in', 'ঠিক হয়')} ${t(p.managed[0][0], p.managed[0][1])} →</a>` : ''}${p.dep && !p.dep[0]() ? `<a class="po-chip" style="color:var(--warn);border-color:var(--warn)" href="${p.dep[2]}">${t('Needs', 'লাগবে')} ${t(p.dep[1][0], p.dep[1][1])} →</a>` : ''}</div></div>
      <div class="po-st"><span class="rl-pl ${st[0]}">${st[1]}</span>${live ? U.switch('po-sw-' + p.key, s.on, `data-psw="${p.key}"`) : `<span class="rl-ed-l">${t('See', 'দেখুন')}</span>`}</div></div>`;
  }
  function popupsPage(el, r) {
    store(); initV2(); runScheds();
    if (r.id && popOf(r.id)) A._poSel = r.id; else if (!r.id) A._poSel = null;
    const all = POP.map(popStatus); const showing = all.filter((x) => x[0] === 'on').length, sch = all.filter((x) => x[0] === 'sch').length, off = all.filter((x) => x[0] === 'off').length;
    const strip = `<div class="rl-strip"><span class="rl-sp good">${t(`${showing} showing now`, `${showing}টি এখন দেখাচ্ছে`)}</span>${sch ? `<span class="rl-sp info">${t(`${sch} scheduled`, `${sch}টি শিডিউল করা`)}</span>` : ''}<span class="rl-sp" style="background:var(--card2);color:var(--muted)">${t(`${off} off`, `${off}টি বন্ধ`)}</span></div>`;
    el.innerHTML = A.pageHead(t('Pop-ups & notices', 'পপ-আপ ও নোটিশ'), t('Every pop-up and notice your shop can show, in one place: where it appears, who sees it, when, and what it says.', 'দোকানে যত পপ-আপ ও নোটিশ দেখানো যায়, এক জায়গায়: কোথায় আসে, কে দেখে, কখন, আর কী লেখা।')) + A.tabsBar('rules', 'popups') +
      `<div class="po-l ${A._poSel ? 'has-ed' : ''}"><div class="rl-main">${strip}
        ${U.card(t('Where each one appears', 'কোনটা কোথায় আসে'), legendHtml(), { sub: t('Tap a number to open that item. The same number is on its row below.', 'নম্বরে চাপলে সেই আইটেম খুলবে। নিচের সারিতেও একই নম্বর।') })}
        ${PGROUPS.map((g) => { const items = POP.filter((p) => p.g === g[0]); const on = items.filter((p) => popStatus(p)[0] === 'on').length; return `<div class="rl-grp2"><h3>${A.icon(g[1])} ${t(g[2][0], g[2][1])} <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· ${t(`${on} of ${items.length} showing`, `${items.length}টির মধ্যে ${on}টি দেখাচ্ছে`)}</span></h3>${items.map(popRow).join('')}</div>`; }).join('')}
      </div><div class="rl-side" id="po-side"></div></div>`;
    const side = el.querySelector('#po-side'); const lay = el.querySelector('.po-l');
    const drawSide = () => {
      const k = A._poSel; lay.classList.toggle('has-ed', !!k);
      if (!k) { side.innerHTML = `<div class="rl-edp"><h3 style="margin:0 0 6px">${t('Pick one to edit', 'এডিট করতে একটা বাছুন')}</h3><p class="muted small" style="margin:0 0 10px">${t('Click a row (or a number in the picture) to change its text in English and Bengali, set dates, see a preview and turn it on or off.', 'একটা সারিতে (বা ছবির নম্বরে) ক্লিক করুন: ইংরেজি ও বাংলা লেখা বদলান, তারিখ দিন, প্রিভিউ দেখুন, চালু বা বন্ধ করুন।')}</p>${U.callout(t('Things like the free-delivery amount or the duplicate look-back are set in their own rule. Those rows have a "Managed in" link so nothing is set twice.', 'ফ্রি ডেলিভারির পরিমাণ বা ডুপ্লিকেটের দিনের মতো সংখ্যা নিজের নিয়মে ঠিক হয়। সেই সারিতে "ঠিক হয়" লিংক আছে, তাই কিছু দুইবার সেট করতে হয় না।'), 'info', 'info')}</div>`; return; }
      const p = popOf(k);
      if (p.ro) { const s = popState(p); side.innerHTML = `<section class="rl-card rl-edp"><div class="row between" style="flex-wrap:nowrap"><h3 style="margin:0">${t(p.name[0], p.name[1])}</h3><button class="btn sm ghost" data-close-ed aria-label="${t('Close', 'বন্ধ')}">${A.icon('x')}</button></div>${U.callout(`${t('This pop-up is part of Demo products. Its switch and text are set there.', 'এই পপ-আপ ডেমো প্রোডাক্টের অংশ। এর সুইচ ও লেখা সেখানেই ঠিক হয়।')} <a class="linkbtn" href="${p.managed[1]}">${t('Open Settings › Demo products', 'সেটিংস › ডেমো প্রোডাক্ট খুলুন')} →</a>`, 'info', 'info')}<div class="rl-prev"><div class="rl-prev-h">${t('Customer sees', 'কাস্টমার দেখবেন')}</div>${popPreview(p, s)}</div></section>`; A.on(side, '[data-close-ed]', 'click', () => openEd(null)); return; }
      const s = spec(p.spec || 'pop_' + p.key); side.innerHTML = edHtml(s); const card = side.querySelector('.rl-card'); wireCard(card);
      A.on(card, '[data-close-ed]', 'click', () => openEd(null));
      card.querySelector('[data-def]').onclick = () => { const d = A.D.ruleDef[s.key]; if (JSON.stringify(d) === JSON.stringify(s.get())) return A.toast(t('Already on the default', 'ইতিমধ্যে ডিফল্টে আছে')); U.confirm(t('Back to default?', 'ডিফল্টে ফেরত যাবেন?'), `${s.summary(s.get())} → ${s.summary(d)}`, t('Go back', 'ফেরত যান'), () => applyChange(s, clone(d), 'back to default')); };
    };
    function openEd(k) {
      A._poSel = k; history.replaceState(null, '', A.href('rules', 'popups', k || undefined)); document.getElementById('root').dataset.k = location.hash;
      el.querySelectorAll('.po-row').forEach((x) => x.classList.toggle('sel', x.dataset.pk === k)); el.querySelectorAll('.po-mk').forEach((x) => x.classList.toggle('on', x.dataset.mk === k)); drawSide();
      if (k && window.innerWidth > 860) side.scrollIntoView({ block: 'nearest' });
    }
    drawSide();
    A.on(el, '.po-row', 'click', (e, row) => { if (e.target.closest('a,.switch')) return; openEd(row.dataset.pk); });
    A.on(el, '.po-row', 'keydown', (e, row) => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('a,.switch')) { e.preventDefault(); openEd(row.dataset.pk); } });
    A.on(el, '.po-mk', 'click', (e, b) => openEd(b.dataset.mk));
    A.on(el, '.switch', 'click', (e) => e.stopPropagation());
    A.on(el, '[data-psw]', 'change', (e, i) => { const p = popOf(i.dataset.psw); i.checked = popState(p).on; setPopOn(p, !popState(p).on); });
  }
  const gPop = G('Every pop-up and notice the shop can show, in four groups (On the shop, At checkout, Product pages, After order). Each row says where it appears, who sees it, when, and has an on/off switch. The picture at the top shows where every number appears.', 'দোকানে যত পপ-আপ ও নোটিশ দেখানো যায়, চারটা ভাগে (দোকানে, চেকআউটে, প্রোডাক্ট পেজে, অর্ডারের পর)। প্রতিটা সারিতে আছে কোথায় আসে, কে দেখে, কখন, আর চালু-বন্ধের সুইচ। ওপরের ছবিতে প্রতিটা নম্বর কোথায় আসে দেখানো আছে।',
    'Eid is two weeks away. Turn on the Holiday banner, write "Order by 7 Mar to get it before Eid", set the dates, and check the preview. A customer whose size was just taken sees the Out-of-stock size notice instead of a confusing error.', 'ঈদের দুই সপ্তাহ বাকি। উৎসবের ব্যানার চালু করুন, লিখুন "ঈদের আগে পেতে 7 মার্চের মধ্যে অর্ডার করুন", তারিখ দিন, প্রিভিউ দেখুন। কারও সাইজ হঠাৎ শেষ হয়ে গেলে ভুল মেসেজের বদলে "সাইজ শেষ" নোটিশ দেখবেন।',
    ['Look at the picture and find the number you want, or scroll to its group.', 'Click the row. The editor opens on the right (a sheet on phone).', 'Write the text in English and Bengali. Use the {…} buttons to put in details like the amount or days.', 'Set "Show from" and "Until" if it is for a limited time, then check the preview and press Save.', 'Use the switch on the row to turn it on or off at once. A row with "Managed in…" has its numbers in another rule: press that link.'],
    ['ছবিতে নম্বরটা খুঁজুন, বা সেই গ্রুপ পর্যন্ত স্ক্রল করুন।', 'সারিতে ক্লিক করুন। ডান পাশে এডিটর খুলবে (ফোনে নিচ থেকে)।', 'ইংরেজি ও বাংলায় লেখা লিখুন। পরিমাণ বা দিনের মতো তথ্য বসাতে {…} বাটন চাপুন।', 'সীমিত সময়ের জন্য হলে "শুরু" ও "শেষ" দিন, প্রিভিউ দেখে সেভ চাপুন।', 'সারির সুইচ দিয়ে সাথে সাথে চালু বা বন্ধ করুন। "ঠিক হয়" লেখা সারির সংখ্যা অন্য নিয়মে থাকে: সেই লিংকে চাপুন।']);

  const old = (el, r) => onePage(el, Object.assign({}, r, { tab: 'all' }));
  A.mod('rules', {
    all: { render: onePage, guide: gAll },
    coupons: { render: discountsPage, guide: gCp },
    discounts: { render: discountsPage, guide: gCp },
    delivery: { render: old, guide: gAll }, payment: { render: old, guide: gAll }, exchange: { render: old, guide: gAll }, orders: { render: old, guide: gAll }, notice: { render: popupsPage, guide: gPop }, popups: { render: popupsPage, guide: gPop },
  });
})();
