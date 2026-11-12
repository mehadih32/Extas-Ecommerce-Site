/* EXTAS admin prototype — Orders: all orders + order page, call queue, pack & ship, returns, abandoned checkouts, fraud checks. */
(function () {
  'use strict';
  const A = window.A, U = A.ui, C = A.calc, t = (e, b) => A.t(e, b), esc = A.esc, tk = (n) => A.fmt.tk(n);
  const DAY = 864e5;
  const NOW = () => A.TODAY.toISOString();
  const SOD = () => new Date(A.fmt.ymd(A.TODAY) + 'T00:00:00+06:00').getTime();
  const cust = (o) => A.byId(A.D.customers, o.customerId);
  const prod = (id) => A.byId(A.D.products, id);
  const pcsTxt = (n) => n + ' ' + t(n === 1 ? 'pc' : 'pcs', 'পিস');
  const cname = (id) => { const c = A.byId(A.D.couriers, id); return c ? c.name : ''; };
  const blocked = () => (A.D.blocked = A.D.blocked || []);
  const isBlocked = (phone) => blocked().some((b) => b.phone === phone && !b.removed);

  A.css('orders', `
  .ord-bulk{position:sticky;top:64px;z-index:5;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--ink);color:var(--card);padding:8px 12px;border-radius:12px;margin-bottom:10px}
  .ord-bulk .btn{background:var(--card);color:var(--ink);border-color:transparent}
  .ord-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:10px}
  .ord-items{display:flex;align-items:center;gap:8px;min-width:0}
  .ord-items .thumb{flex:none}
  .ord-sub{color:var(--muted);font-size:12px}
  .ord-cb{width:17px;height:17px;accent-color:var(--accent);cursor:pointer}
  .ord-steps{display:flex;gap:0;align-items:center;flex-wrap:wrap;row-gap:8px}
  .ord-steps .st{flex:1 1 auto;min-width:96px}
  .ord-steps .st:not(:last-child)::after{content:"";flex:1;height:2px;background:var(--line2);margin:0 8px;min-width:12px}
  .ord-steps .st.done:not(:last-child)::after{background:var(--good)}
  .ord-money .li{padding:7px 0}
  .ord-money .tot{font-weight:700;font-size:15px}
  .ord-profit{background:var(--card2);border-radius:12px;padding:10px 12px;margin-top:10px}
  .ord-line{display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
  .ord-line:last-child{border-bottom:0}
  .ord-lane{background:var(--card2);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:8px;min-width:0}
  .ord-lane h4{margin:0;font-size:14px;display:flex;justify-content:space-between;align-items:center}
  .ord-pc{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;gap:10px;align-items:flex-start}
  .ord-pc .grow{flex:1;min-width:0}
  .ord-qcard{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--card);display:flex;flex-direction:column;gap:10px}
  .ord-qcard.high{border-color:var(--bad)}
  .ord-why{display:flex;gap:6px;flex-wrap:wrap}
  .ord-labels{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
  .ord-label{border:1.5px dashed var(--ink2);border-radius:10px;padding:10px;font-size:12px;display:flex;flex-direction:column;gap:4px;background:var(--card)}
  .ord-bar{height:34px;background:repeating-linear-gradient(90deg,var(--ink) 0 2px,transparent 2px 4px,var(--ink) 4px 5px,transparent 5px 8px);border-radius:2px}
  .ord-inv{background:var(--card);border:1px solid var(--line2);border-radius:6px;padding:22px;max-width:640px;margin:0 auto;font-size:12.5px;box-shadow:var(--shadow)}
  .ord-inv h2{margin:0;font-size:22px;letter-spacing:.06em}
  .ord-inv table{width:100%;border-collapse:collapse;margin-top:12px}
  .ord-inv th,.ord-inv td{border-bottom:1px solid var(--line);padding:6px 4px;text-align:left}
  .ord-inv .r{text-align:right}
  .ord-scan{display:flex;gap:8px;flex-wrap:wrap}
  .ord-scan .inp{flex:1;min-width:180px}
  .ord-mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;text-align:center}
  .ord-mini div{background:var(--card2);border-radius:10px;padding:8px 4px}
  .ord-mini b{display:block;font-size:17px}
  .ord-pick td,.ord-pick th{padding:6px 8px}
  @media (max-width:560px){.ord-steps .st{min-width:0}.ord-steps .st:not(:last-child)::after{display:none}.ord-inv{padding:12px}}
  `);

  /* ---------- labels ---------- */
  const STEPN = { new: ['New', 'নতুন'], processing: ['Processing', 'প্রসেসিং'], confirmed: ['Confirmed', 'কনফার্মড'], booked: ['Booked', 'বুকড'], packed: ['Packed', 'প্যাকড'], shipped: ['Handed over', 'কুরিয়ারকে দেওয়া'], delivered: ['Delivered', 'ডেলিভারি'], paid: ['Paid', 'টাকা এসেছে'] };
  const payBadge = (o) => U.badge(o.payment === 'COD' ? (o.paid ? t('COD · paid', 'COD · পেইড') : 'COD') : o.payment + (o.paid ? ' ✓' : ''), o.payment === 'COD' ? (o.paid ? 'good' : '') : 'info');
  const CANCEL_R = [['Customer did not answer 3 calls', 'কাস্টমার 3 বার কল ধরেননি'], ['Customer changed mind', 'কাস্টমার মত পাল্টেছেন'], ['Duplicate order', 'একই অর্ডার দুবার'], ['Fake or wrong address', 'ভুয়া বা ভুল ঠিকানা'], ['Out of stock', 'স্টক নেই'], ['Advance not paid', 'অ্যাডভান্স দেননি']];
  const RETURN_R = [['Customer refused at door', 'দরজায় কাস্টমার নেননি'], ['Customer not reachable', 'কাস্টমারকে পাওয়া যায়নি'], ['Wrong size, refused', 'সাইজ ভুল, নেননি'], ['Changed mind', 'মত পাল্টেছেন'], ['Address not found', 'ঠিকানা পাওয়া যায়নি']];
  const rLabel = (list, en) => { const r = list.find((x) => x[0] === en); return r ? t(r[0], r[1]) : en; };

  /* timeline text: seeded lines are English — translate the common ones for Bengali view */
  function tlText(e) {
    if (A.lang !== 'bn') return esc(e.text);
    if (e.bn) return esc(e.bn);
    const s = e.text; let m;
    if ((m = s.match(/^Order placed on (.+)$/))) return esc(m[1] + ' থেকে অর্ডার এসেছে');
    if (s === 'Confirmed on call') return 'কলে কনফার্ম করা হয়েছে';
    if ((m = s.match(/^Sent to ERP as sales order (.+)$/))) return esc('ERP-তে সেলস অর্ডার ' + m[1] + ' হিসেবে গেছে');
    if (s.startsWith('Packed and checked')) return 'প্যাক ও চেক করা হয়েছে (ছবি তোলা হয়েছে)';
    if ((m = s.match(/^Handed to (\S+) · (.+)$/))) return esc(m[1] + '-কে দেওয়া হয়েছে · ' + m[2]);
    if (s.startsWith('ERP billed the shop')) return 'ERP কেনা দামে বিল করেছে';
    if ((m = s.match(/^Delivered · cash collected (.+)$/))) return esc('ডেলিভারি হয়েছে · ক্যাশ নেওয়া হয়েছে ' + m[1]);
    if (s === 'Delivered') return 'ডেলিভারি হয়েছে';
    if (s === 'Courier paid out the cash') return 'কুরিয়ার টাকা পাঠিয়েছে';
    if ((m = s.match(/^Returned to shop — (.+)$/))) return esc('দোকানে ফেরত এসেছে — ' + rLabel(RETURN_R, m[1]));
    if ((m = s.match(/^Cancelled — (.+)$/))) return esc('বাতিল — ' + (CANCEL_R.find((x) => x[0].toLowerCase() === m[1].toLowerCase()) || [0, m[1]])[1]);
    if ((m = s.match(/^Size exchange: (.+)$/))) return esc('সাইজ এক্সচেঞ্জ: ' + m[1]);
    return esc(s);
  }

  /* ---------- shared actions (change A.D) ---------- */
  function tl(o, en, bn, by = 'You') { o.timeline.push({ t: NOW(), text: en, bn, by }); }
  function erpEv(kind, text, ok = true) { A.D.erpEvents.unshift({ t: NOW(), kind, text, ok }); }
  function variant(l) { const p = prod(l.pid); return p ? p.variants.find((v) => v.sku === l.sku) : null; }
  function reserve(o, on) { if (on === !!o.rsv) return; for (const l of o.lines) { const v = variant(l); if (v) v.reserved = Math.max(0, (v.reserved || 0) + (on ? l.qty : -l.qty)); } o.rsv = on; }
  function confirmOrder(o, how) {
    if (o.status !== 'new') return false;
    o.status = 'confirmed'; o.hold = false;
    tl(o, how || 'Confirmed on call', how ? '' : 'কলে কনফার্ম করা হয়েছে');
    const no = 'SO-' + (60500 + Math.floor(Math.random() * 9000));
    o.erp = { pushed: true, at: NOW(), no };
    tl(o, 'Sent to ERP as sales order ' + no, 'ERP-তে সেলস অর্ডার ' + no + ' হিসেবে গেছে', 'System');
    erpEv('order', `Sales order ${no} created for ${o.id}`);
    reserve(o, true);
    return true;
  }
  function cancelOrder(o, reason, atCourier) {
    o.cancelStage = o.status === 'new' ? dstat(o) : o.status; o.cancelBy = 'You';
    const hadBooking = ['booked', 'packed'].includes(o.status) && o.tracking;
    o.status = 'cancelled'; o.hold = false; reserve(o, false);
    const r = CANCEL_R.find((x) => x[0] === reason) || [reason, reason];
    tl(o, 'Cancelled — ' + r[0], 'বাতিল — ' + r[1]);
    if (hadBooking) {
      if (atCourier) tl(o, `Cancel request sent to ${cname(o.courier)} by API · ${o.tracking}`, `${cname(o.courier)}-কে API দিয়ে বাতিলের অনুরোধ গেছে · ${o.tracking}`, 'System');
      else { o.courierEnteredCancelled = true; o.courierCxDone = false; tl(o, `Still booked at ${cname(o.courier)} (${o.tracking}) — tell the courier`, `${cname(o.courier)}-এ এখনো বুক (${o.tracking}) — কুরিয়ারকে জানান`, 'System'); }
    }
    if (o.erp && o.erp.pushed) erpEv('order', `Sales order ${o.erp.no} cancelled for ${o.id} — stock released`);
  }
  function bookCourier(o, cid, sent) {
    o.courier = cid;
    if (!o.tracking || o.trackingCourier !== cid) { o.tracking = (cid === 'pathao' ? 'PTH' : cid === 'steadfast' ? 'SF' : 'RX') + (1000000 + Math.floor(hash(o.id + cid) * 8999999)); o.trackingCourier = cid; }
    tl(o, `Booked with ${cname(cid)} · ${o.tracking}${sent ? ' — sent to the courier' : ''}`, `${cname(cid)}-এ বুক হয়েছে · ${o.tracking}${sent ? ' — কুরিয়ারে পাঠানো হয়েছে' : ''}`, sent ? 'System' : 'You');
  }
  function bestCourier(o) { const list = A.D.couriers.filter((c) => c.connected).sort((a, b) => a.fee[o.zone] - b.fee[o.zone]); return list[0] ? list[0].id : 'pathao'; }
  /* one order = one booking: only a Confirmed order can be booked; this sets Booked + the tracking number */
  function bookOrder(o, cid) { if (o.status !== 'confirmed' || o.tracking) return false; bookCourier(o, cid, true); o.status = 'booked'; o.bookedAt = NOW(); return true; }
  function handOver(o) {
    if (o.status !== 'packed') return false;
    if (!o.courier || !o.tracking) bookCourier(o, o.courier || bestCourier(o));
    o.status = 'shipped';
    for (const l of o.lines) { const v = variant(l); if (v) v.stock = Math.max(0, v.stock - l.qty); }
    reserve(o, false);
    tl(o, `Handed to ${cname(o.courier)} · ${o.tracking}`, `${cname(o.courier)}-কে দেওয়া হয়েছে · ${o.tracking}`);
    tl(o, 'ERP billed the shop at buying price ' + tk(C.cogs(o)), 'ERP কেনা দামে বিল করেছে ' + tk(C.cogs(o)), 'ERP');
    erpEv('bill', `ERP bill for ${o.id} · handed to ${cname(o.courier)} · ${tk(C.cogs(o))} at buying price`);
    return true;
  }
  function markDelivered(o) {
    o.status = 'delivered'; o.deliveredAt = NOW(); o.paid = true; o.settled = false;
    tl(o, 'Delivered' + (o.payment === 'COD' ? ' · cash collected ' + tk(o.total) : ''), 'ডেলিভারি হয়েছে' + (o.payment === 'COD' ? ' · ক্যাশ নেওয়া হয়েছে ' + tk(o.total) : ''), 'Courier');
    const c = cust(o); if (c) { c.delivered++; c.spent += o.total; c.points += Math.floor(o.total / ((A.D.loyalty && A.D.loyalty.perTk) || 100)); }
  }
  function markReturned(o, reason) {
    o.status = 'returned'; o.returnReason = reason; o.returnChecked = false;
    tl(o, 'Returned to shop — ' + reason, 'দোকানে ফেরত এসেছে — ' + rLabel(RETURN_R, reason), 'Courier');
    const c = cust(o); if (c) c.refused++;
  }
  function recalc(o) {
    o.subtotal = A.sum(o.lines, (l) => l.price * l.qty);
    const pcs = C.pieces(o); let d = 0;
    if (o.coupon === 'EXTAS10') { if (o.subtotal >= 1500) d = Math.min(300, Math.round(o.subtotal * 0.1)); else o.coupon = ''; }
    else if (o.coupon === 'WELCOME100') { if (o.subtotal >= 1000) d = 100; else o.coupon = ''; }
    if (!o.coupon && A.D.rules.buyMore.on) { const tier = A.D.rules.buyMore.tiers.filter((x) => pcs >= x.qty).sort((a, b) => b.qty - a.qty)[0]; if (tier) d = Math.round(o.subtotal * tier.off / 100); }
    const adj = o.adj || []; const manual = A.sum(adj.filter((a) => a.kind !== 'freedel'), (a) => a.amount);
    o.discount = Math.min(o.subtotal, d + manual);
    o.delivery = adj.some((a) => a.kind === 'freedel') ? 0 : C.deliveryFee(o.zone, o.subtotal - d);
    o.total = o.subtotal - o.discount + o.delivery;
  }
  /* expected profit if the order gets delivered (same maths as A.calc.orderProfit) */
  function profitParts(o) {
    const sale = o.subtotal - o.discount + o.delivery;
    const cogs = C.cogs(o), courier = C.courierFee(o), cod = o.payment === 'COD' ? Math.round(o.total * 0.01) : 0;
    const pack = A.D.expenseSettings.packaging, gw = o.payment !== 'COD' ? Math.round(o.total * A.D.expenseSettings.gatewayPct / 100) : 0;
    return { sale, cogs, courier, cod, pack, gw, profit: sale - cogs - courier - cod - pack - gw };
  }
  function riskReasons(o, skipRefused) {
    const c = cust(o) || { orders: 1, refused: 0, delivered: 0 }; const out = [];
    const firstTime = c.orders <= 1;
    if (firstTime) out.push(['New customer', 'নতুন কাস্টমার', 'info']);
    if (o.zone === 'outside') out.push(['Outside Dhaka', 'ঢাকার বাইরে', '']);
    if (o.total > 3000) out.push(['High value ' + A.fmt.tkShort(o.total), 'বেশি টাকার অর্ডার ' + A.fmt.tkShort(o.total), 'warn']);
    if (c.refused > 0 && !skipRefused) out.push([`Refused ${c.refused} of ${c.orders - 1 || c.refused} before`, `আগে ${c.orders - 1 || c.refused}টির মধ্যে ${c.refused}টি নেননি`, 'bad']);
    const same = A.D.orders.filter((x) => x.phone === o.phone && x.id !== o.id && C.isOpen(x)).length;
    if (same) out.push([`${same + 1} open orders on this phone`, `এই ফোনে ${same + 1}টি চালু অর্ডার`, 'bad']);
    if (isBlocked(o.phone)) out.push(['Blocked number', 'ব্লক করা নম্বর', 'bad']);
    if (o.payment === 'COD' && A.D.rules.advance.on && firstTime && o.total >= A.D.rules.advance.newOver) out.push(['Advance rule applies', 'অ্যাডভান্সের নিয়ম খাটে', 'warn']);
    return out;
  }
  function advanceAmount(o) { const r = A.D.rules.advance; return r.type === 'percent' ? Math.round(o.total * r.percent / 100) : (o.delivery || A.D.rules.delivery[o.zone].fee); }
  function pastRecord(o) {
    const c = cust(o); if (!c) return '';
    const prev = A.D.orders.filter((x) => x.customerId === c.id && x.id !== o.id);
    if (!prev.length) return U.badge(t('First order', 'প্রথম অর্ডার'), 'info');
    const del = prev.filter(C.isDelivered).length, ref = prev.filter((x) => x.status === 'returned').length;
    if (ref) return U.badge(t(`Refused ${ref} of ${prev.length} — ask advance`, `${prev.length}টির মধ্যে ${ref}টি নেননি — অ্যাডভান্স নিন`), 'bad');
    return U.badge(t(`${prev.length} orders, ${del} delivered, 0 refused`, `${prev.length}টি অর্ডার, ${del}টি ডেলিভারি, ০ ফেরত`.replace('০', '0')), 'good');
  }
  function itemsCell(o) {
    const p = prod(o.lines[0].pid) || { colors: [o.lines[0].color], cat: 'polo' };
    return `<div class="ord-items">${U.thumb({ colors: [o.lines[0].color], cat: p.cat }, 32)}<div style="min-width:0"><div class="ellip" style="max-width:190px">${esc(o.lines[0].name)}</div><div class="ord-sub">${pcsTxt(C.pieces(o))}${o.lines.length > 1 ? ' · ' + o.lines.length + t(' items', 'টি আইটেম') : ''}</div></div></div>`;
  }

  /* ---------- modals used from several tabs ---------- */
  function reasonModal(title, list, okLabel, onOk) {
    const m = U.modal(title, U.field(t('Reason', 'কারণ'), U.select('rs-sel', list.map((r) => [r[0], t(r[0], r[1])]), list[0][0])), { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn dark" id="rs-ok">${okLabel}</button>` });
    m.querySelector('#rs-ok').onclick = () => { const v = m.querySelector('#rs-sel').value; U.close(); onOk(v); };
  }
  function pinModal(title, text, okLabel, onOk) {
    const m = U.modal(title, `<p style="margin:0 0 12px">${text}</p>${U.field(t('Owner PIN', 'মালিকের PIN'), U.input('pin-in', '', `type="password" inputmode="numeric" maxlength="6" placeholder="••••"`), t('Any 4 digits work in this prototype.', 'এই প্রোটোটাইপে যেকোনো ৪ সংখ্যা দিলেই হবে।').replace('৪', '4'))}`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn dark" id="pin-ok">${okLabel}</button>` });
    const go = () => { const v = m.querySelector('#pin-in').value; if (!/^\d{4,6}$/.test(v)) { A.toast(t('Type your 4-digit PIN', '৪ সংখ্যার PIN দিন').replace('৪', '4'), 'bad'); return; } U.close(); onOk(); };
    m.querySelector('#pin-ok').onclick = go; m.querySelector('#pin-in').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    setTimeout(() => m.querySelector('#pin-in').focus(), 30);
  }
  function askAdvance(o, after) {
    const amt = advanceAmount(o); const r = A.D.rules.advance;
    const msg = `EXTAS: ${o.name}, ${t('your order', 'আপনার অর্ডার')} ${o.id} (${tk(o.total)}). ${t(`Please send ${tk(amt)} advance by bKash to ${A.D.rules.wallets.bkash} (Send Money) with reference ${o.id}. We ship as soon as it arrives.`, `অনুগ্রহ করে ${tk(amt)} অ্যাডভান্স বিকাশে ${A.D.rules.wallets.bkash} নম্বরে (Send Money) পাঠান, রেফারেন্স ${o.id}। টাকা পেলেই পাঠিয়ে দেব।`)}`;
    const m = U.modal(t('Ask for advance', 'অ্যাডভান্স চান'), `${U.callout(t(`Your rule: ${r.type === 'percent' ? r.percent + '% of the order' : 'the delivery charge'} as advance for new customers over ${tk(r.newOver)} on cash on delivery.`, `আপনার নিয়ম: ${tk(r.newOver)}-এর বেশি COD অর্ডারে নতুন কাস্টমারের কাছে ${r.type === 'percent' ? 'অর্ডারের ' + r.percent + '%' : 'ডেলিভারি চার্জ'} অ্যাডভান্স।`))}
      <div class="ord-mini" style="margin:12px 0"><div><span class="small muted">${t('Advance', 'অ্যাডভান্স')}</span><b>${tk(amt)}</b></div><div><span class="small muted">${t('COD after', 'পরে COD')}</span><b>${tk(o.total - amt)}</b></div><div><span class="small muted">bKash</span><b class="small">${esc(A.D.rules.wallets.bkash)}</b></div></div>
      ${U.field(t('Send by', 'যেভাবে পাঠাবেন'), `<div class="row" style="gap:16px;flex-wrap:wrap"><label class="row small" style="gap:6px"><input type="checkbox" id="adv-sms" checked> SMS</label><label class="row small" style="gap:6px"><input type="checkbox" id="adv-wa" checked> WhatsApp</label></div>`, t('You can pick one or both.', 'একটি বা দুটোই বাছতে পারেন।'))}
      ${U.field(t('Message to customer', 'কাস্টমারকে মেসেজ'), `<textarea class="inp" id="adv-msg" rows="4">${esc(msg)}</textarea>`)}`,
    { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn" id="adv-ph">${A.icon('phone')} ${t('I asked on the phone', 'ফোনে চেয়েছি')}</button><button class="btn primary" id="adv-ok">${A.icon('send')} ${t('Send request', 'অনুরোধ পাঠান')}</button>` });
    const mark = (via, en, bn, toast) => {
      o.advanceAsked = amt; o.advanceAskedAt = NOW(); o.advanceVia = via; o.hold = true;
      tl(o, en, bn); U.close(); A.commit(`Asked advance ${tk(amt)} for ${o.id}`); A.toast(toast, 'good'); (after || A.render)();
    };
    m.querySelector('#adv-ok').onclick = () => {
      const ch = []; if (m.querySelector('#adv-sms').checked) ch.push('SMS'); if (m.querySelector('#adv-wa').checked) ch.push('WhatsApp');
      if (!ch.length) return A.toast(t('Pick SMS, WhatsApp or both', 'SMS, WhatsApp বা দুটোই বাছুন'), 'bad');
      mark(ch.join(' + '), `Asked ${tk(amt)} advance by ${ch.join(' + ')} — tagged “Advance asked”, waiting for the money`, `${ch.join(' + ')}-এ ${tk(amt)} অ্যাডভান্স চাওয়া হয়েছে — “অ্যাডভান্স চাওয়া” ট্যাগ, টাকার অপেক্ষা`, t(`Advance request sent by ${ch.join(' + ')}`, `${ch.join(' + ')}-এ অ্যাডভান্সের অনুরোধ গেছে`));
    };
    m.querySelector('#adv-ph').onclick = () => mark('phone', `Asked ${tk(amt)} advance on the phone — tagged “Advance asked”`, `ফোনে ${tk(amt)} অ্যাডভান্স চাওয়া হয়েছে — “অ্যাডভান্স চাওয়া” ট্যাগ`, t('Saved — tagged “Advance asked”', 'সেভ হয়েছে — “অ্যাডভান্স চাওয়া” ট্যাগ'));
  }
  function blockPhone(o, after) {
    pinModal(t('Block this phone number?', 'এই নম্বর ব্লক করবেন?'), t(`${esc(o.phone)} (${esc(o.name)}) will not be able to place cash on delivery orders. Open orders on this number get cancelled. You can unblock later.`, `${esc(o.phone)} (${esc(o.name)}) আর ক্যাশ অন ডেলিভারি অর্ডার দিতে পারবেন না। এই নম্বরের চালু অর্ডার বাতিল হবে। পরে আনব্লক করা যাবে।`), t('Block number', 'নম্বর ব্লক করুন'), () => {
      blocked().unshift({ phone: o.phone, name: o.name, reason: riskReasons(o).map((r) => r[0]).join(', ') || 'Owner decision', at: NOW(), by: 'You' });
      for (const x of A.D.orders.filter((x) => x.phone === o.phone && ['new', 'confirmed'].includes(x.status))) cancelOrder(x, 'Fake or wrong address');
      const c = cust(o); if (c) { c.blocked = true; c.tags = Array.from(new Set([...(c.tags || []), 'Blocked'])); }
      A.commit(`Blocked phone ${o.phone}`); A.toast(t('Number blocked and open orders cancelled', 'নম্বর ব্লক হয়েছে, চালু অর্ডার বাতিল'), 'good'); (after || A.render)();
    });
  }
  function labelsModal(list, reprint) {
    if (!list.length) { A.toast(t('Pick orders first', 'আগে অর্ডার বাছুন'), 'bad'); return; }
    const body = `<div class="ord-labels">${list.map((o) => `<div class="ord-label"><div class="row between"><b>${esc(cname(o.courier) || t('Courier not booked', 'কুরিয়ার বুক হয়নি'))}</b><span class="mono">${esc(o.id)}</span></div><div class="ord-bar"></div><div class="mono small">${esc(o.tracking || '—')}</div><div><b>${esc(o.name)}</b> · ${esc(VIEW === 'packer' ? maskPhone(o.phone) : o.phone)}</div><div class="muted">${esc(VIEW === 'packer' ? maskAddr(o) : o.address)}</div><div class="row between"><span>${C.pieces(o)} ${t('pcs', 'পিস')}</span><b>${o.paid ? t('PAID', 'পেইড') : 'COD ' + tk(o.total)}</b></div></div>`).join('')}</div>`;
    const m = U.modal(t(`Courier labels (${list.length})`, `কুরিয়ার লেবেল (${list.length})`), body, { wide: true, foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button><button class="btn primary" id="lb-print">${A.icon('print')} ${t('Print labels', 'লেবেল প্রিন্ট')}</button>` });
    m.querySelector('#lb-print').onclick = () => { const n = reprint ? 0 : list.filter(packOne).length; U.close(); A.commit(`Printed ${list.length} courier labels`); A.toast(reprint ? t('Sticker sent to the printer (reprint logged)', 'স্টিকার প্রিন্টারে গেছে (আবার প্রিন্ট লগে আছে)') : t(`${list.length} labels sent to the printer · ${n} orders are now Packed`, `${list.length}টি লেবেল প্রিন্টারে গেছে · ${n}টি অর্ডার এখন প্যাকড`), 'good'); A.render(); };
  }
  function courierModal(list, after) {
    const zones = Array.from(new Set(list.map((o) => o.zone)));
    const rows = A.D.couriers.map((c) => {
      const fee = A.sum(list, (o) => c.fee[o.zone]); const cod = A.sum(list.filter((o) => o.payment === 'COD' && !o.paid), (o) => Math.round(o.total * c.codPct / 100));
      const finished = A.D.orders.filter((o) => o.courier === c.id && (C.isDelivered(o) || o.status === 'returned'));
      const rr = finished.length ? finished.filter((o) => o.status === 'returned').length / finished.length * 100 : 0;
      return `<label class="li" style="cursor:${c.connected ? 'pointer' : 'not-allowed'};opacity:${c.connected ? 1 : 0.6}"><input type="radio" name="cr" value="${c.id}" ${c.connected ? '' : 'disabled'} ${c.id === bestCourier(list[0]) ? 'checked' : ''}><div class="grow"><b>${c.name}</b> ${c.connected ? '' : U.badge(t('Not connected', 'কানেক্ট করা নেই'), 'warn')}<div class="ord-sub">${zones.map((z) => `${t({ inside: 'Inside Dhaka', sub: 'Dhaka suburbs', outside: 'Outside Dhaka' }[z], { inside: 'ঢাকার ভেতরে', sub: 'ঢাকার আশেপাশে', outside: 'ঢাকার বাইরে' }[z])} ${tk(c.fee[z])}`).join(' · ')} · COD ${c.codPct}% · ${t('return rate', 'রিটার্ন রেট')} ${A.fmt.pct(rr)}</div></div><div class="r"><b>${tk(fee + cod)}</b><div class="ord-sub">${t('total cost', 'মোট খরচ')}</div></div></label>`;
    }).join('');
    const m = U.modal(t(`Book courier for ${list.length} order${list.length > 1 ? 's' : ''}`, `${list.length}টি অর্ডারের কুরিয়ার বুক`), `<div class="list">${rows}</div>${U.callout(t('RedX is switched off until you connect it in Settings › Couriers.', 'RedX চালু হবে সেটিংস › কুরিয়ার থেকে কানেক্ট করলে।'))}`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="cr-ok">${A.icon('truck')} ${t('Book', 'বুক করুন')}</button>` });
    m.querySelector('#cr-ok').onclick = () => { const v = (m.querySelector('input[name=cr]:checked') || {}).value; if (!v) return; list.forEach((o) => bookCourier(o, v)); U.close(); A.commit(`Booked ${list.length} order(s) with ${cname(v)}`); A.toast(t(`${list.length} booked with ${cname(v)}`, `${list.length}টি ${cname(v)}-এ বুক হয়েছে`), 'good'); (after || A.render)(); };
  }
  function invoiceModal(o) {
    let lang = A.lang;
    const T = (e, b) => (lang === 'bn' ? b : e);
    const S = A.D.store;
    const draw = () => `<div class="row between" style="margin-bottom:12px">${U.seg('inv-lang', [['en', 'English'], ['bn', 'বাংলা']], lang)}<span class="muted small">A4</span></div>
      <div class="ord-inv"><div class="row between" style="align-items:flex-start"><div><h2>EXTAS</h2><div class="muted">${esc(S.address)}<br>${esc(S.phone)} · ${esc(S.email)}</div></div><div style="text-align:right"><b>${T('INVOICE', 'ইনভয়েস')}</b><div class="mono">${esc(o.id)}</div><div class="muted">${A.fmt.dateY(o.created)}</div></div></div>
      <div class="row between" style="margin-top:14px;align-items:flex-start"><div><div class="muted">${T('Bill to', 'যার কাছে')}</div><b>${esc(o.name)}</b><div>${esc(o.phone)}</div><div class="muted">${esc(o.address)}</div></div><div style="text-align:right"><div class="muted">${T('Payment', 'পেমেন্ট')}</div><b>${o.payment}${o.paid ? ' · ' + T('Paid', 'পরিশোধিত') : ''}</b><div class="muted">${esc(cname(o.courier) || '')} ${esc(o.tracking || '')}</div></div></div>
      <table><thead><tr><th>${T('Item', 'আইটেম')}</th><th>${T('Size / colour', 'সাইজ / রং')}</th><th class="r">${T('Qty', 'পরিমাণ')}</th><th class="r">${T('Price', 'দাম')}</th><th class="r">${T('Amount', 'টাকা')}</th></tr></thead><tbody>${o.lines.map((l) => `<tr><td>${esc(l.name)}<div class="muted mono" style="font-size:10.5px">${esc(l.sku)}</div></td><td>${esc(l.size)} / ${esc(l.color)}</td><td class="r">${l.qty}</td><td class="r">${tk(l.price)}</td><td class="r">${tk(l.price * l.qty)}</td></tr>`).join('')}</tbody></table>
      <table style="max-width:280px;margin-left:auto"><tbody><tr><td>${T('Subtotal', 'সাবটোটাল')}</td><td class="r">${tk(o.subtotal)}</td></tr>${o.discount ? `<tr><td>${T('Discount', 'ছাড়')}${o.coupon ? ' (' + esc(o.coupon) + ')' : ''}</td><td class="r">−${tk(o.discount)}</td></tr>` : ''}<tr><td>${T('Delivery', 'ডেলিভারি')}</td><td class="r">${o.delivery ? tk(o.delivery) : T('Free', 'ফ্রি')}</td></tr><tr><td><b>${T('Total', 'মোট')}</b></td><td class="r"><b>${tk(o.total)}</b></td></tr><tr><td><b>${T('Cash to collect', 'নিতে হবে')}</b></td><td class="r"><b>${tk(o.paid ? 0 : o.total - (o.advancePaid || 0))}</b></td></tr></tbody></table>
      <p class="muted" style="margin:16px 0 0">${T(`Thank you for shopping with EXTAS. Size exchange within ${A.D.rules.exchange.hours} hours of delivery — call ${S.phone}.`, `EXTAS থেকে কেনার জন্য ধন্যবাদ। ডেলিভারির ${A.D.rules.exchange.hours} ঘণ্টার মধ্যে সাইজ এক্সচেঞ্জ করা যায় — কল করুন ${S.phone}।`)}</p></div>`;
    const m = U.modal(t('Invoice', 'ইনভয়েস'), `<div id="inv-b">${draw()}</div>`, { wide: true, foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button><button class="btn" id="inv-dl">${A.icon('down')} PDF</button><button class="btn primary" id="inv-pr">${A.icon('print')} ${t('Print', 'প্রিন্ট')}</button>` });
    const wire = () => m.querySelectorAll('#inv-lang button').forEach((b) => (b.onclick = () => { lang = b.dataset.v; m.querySelector('#inv-b').innerHTML = draw(); wire(); }));
    wire();
    m.querySelector('#inv-dl').onclick = () => U.download(`invoice-${o.id}.pdf`);
    m.querySelector('#inv-pr').onclick = () => { U.close(); A.toast(t('Invoice sent to the printer', 'ইনভয়েস প্রিন্টারে গেছে'), 'good'); };
  }
  function smsModal(o, after) {
    const S = {
      new: [`EXTAS: Dear ${o.name}, we got your order ${o.id} (${tk(o.total)}). We will call you soon to confirm.`, `EXTAS: প্রিয় ${o.name}, আপনার অর্ডার ${o.id} (${tk(o.total)}) পেয়েছি। কনফার্ম করতে শিগগিরই কল দেব।`],
      confirmed: [`EXTAS: Your order ${o.id} is confirmed. We will pack it today.`, `EXTAS: আপনার অর্ডার ${o.id} কনফার্ম হয়েছে। আজই প্যাক করব।`],
      booked: [`EXTAS: Your order ${o.id} is booked with ${cname(o.courier)} (${o.tracking}). We will pack it today.`, `EXTAS: আপনার অর্ডার ${o.id} ${cname(o.courier)}-এ বুক হয়েছে (${o.tracking})। আজই প্যাক করব।`],
      packed: [`EXTAS: Your order ${o.id} is packed and goes to the courier today.`, `EXTAS: আপনার অর্ডার ${o.id} প্যাক হয়েছে, আজ কুরিয়ারে যাবে।`],
      shipped: [`EXTAS: Your order ${o.id} is with ${cname(o.courier)} (${o.tracking}). Please keep ${tk(o.paid ? 0 : o.total)} ready.`, `EXTAS: আপনার অর্ডার ${o.id} ${cname(o.courier)}-এ আছে (${o.tracking})। ${tk(o.paid ? 0 : o.total)} রেডি রাখুন।`],
      delivered: [`EXTAS: Thank you ${o.name}! How was your order ${o.id}? Size exchange is free within ${A.D.rules.exchange.hours} hours.`, `EXTAS: ধন্যবাদ ${o.name}! অর্ডার ${o.id} কেমন লাগলো? ${A.D.rules.exchange.hours} ঘণ্টার মধ্যে সাইজ এক্সচেঞ্জ ফ্রি।`],
    };
    const msg = S[o.status] || S.delivered;
    const m = U.modal(t('Send SMS update', 'SMS আপডেট পাঠান'), `${U.field(t('To', 'যাকে'), `<div class="strong">${esc(o.name)} · ${esc(o.phone)}</div>`)}${U.field(t('Message', 'মেসেজ'), `<textarea class="inp" id="sms-t" rows="4">${esc(t(msg[0], msg[1]))}</textarea>`, t('About 1 SMS · ৳0.35', 'প্রায় 1টি SMS · ৳0.35'))}`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="sms-ok">${A.icon('send')} ${t('Send', 'পাঠান')}</button>` });
    m.querySelector('#sms-ok').onclick = () => { const txt = m.querySelector('#sms-t').value; tl(o, 'SMS sent: ' + txt, 'SMS গেছে: ' + txt); U.close(); A.commit(`SMS sent for ${o.id}`); A.toast(t('SMS sent', 'SMS পাঠানো হয়েছে'), 'good'); (after || A.render)(); };
  }
  function editLinesModal(o) {
    const rows = o.lines.map((l, i) => { const p = prod(l.pid); const sizes = p ? p.sizes : [l.size]; return `<div class="ord-line">${U.thumb({ colors: [l.color], cat: p ? p.cat : 'polo' }, 34)}<div class="grow" style="flex:1;min-width:0"><b class="ellip" style="display:block">${esc(l.name)}</b><span class="ord-sub">${esc(l.color)} · ${tk(l.price)}</span></div>${U.select('el-s' + i, sizes.map((s) => { const v = p && p.variants.find((x) => x.color === l.color && x.size === s); return [s, `${s} (${v ? v.stock : 0} ${t('left', 'আছে')})`]; }), l.size, 'style="width:auto"')}<input class="inp" id="el-q${i}" type="number" min="0" max="9" value="${l.qty}" style="width:64px"></div>`; }).join('');
    const m = U.modal(t(`Edit items · ${o.id}`, `আইটেম এডিট · ${o.id}`), `${rows}<div id="el-sum" style="margin-top:12px"></div>${U.callout(t('Set quantity to 0 to remove an item. Discount, delivery charge and total update by your rules.', 'আইটেম বাদ দিতে পরিমাণ 0 দিন। ছাড়, ডেলিভারি চার্জ ও মোট আপনার নিয়মে নিজেই বদলাবে।'))}`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="el-ok">${t('Save changes', 'সেভ করুন')}</button>` });
    const preview = () => {
      const copy = JSON.parse(JSON.stringify(o)); apply(copy);
      m.querySelector('#el-sum').innerHTML = copy.lines.length ? `<div class="row between"><span>${t('New total', 'নতুন মোট')}</span><b>${tk(copy.total)} <span class="muted small">(${t('was', 'আগে')} ${tk(o.total)})</span></b></div>` : U.callout(t('At least one item must stay. To drop all, cancel the order.', 'অন্তত একটি আইটেম রাখতে হবে। সব বাদ দিতে অর্ডার বাতিল করুন।'), 'warn', 'warn');
    };
    const apply = (x) => {
      x.lines.forEach((l, i) => { const p = prod(l.pid); const s = m.querySelector('#el-s' + i).value; l.qty = Math.max(0, parseInt(m.querySelector('#el-q' + i).value, 10) || 0); if (s !== l.size) { l.size = s; const v = p && p.variants.find((v) => v.color === l.color && v.size === s); if (v) l.sku = v.sku; } });
      x.lines = x.lines.filter((l) => l.qty > 0); if (x.lines.length) recalc(x);
    };
    m.querySelectorAll('select,input').forEach((e) => (e.oninput = preview)); preview();
    m.querySelector('#el-ok').onclick = () => {
      const copy = JSON.parse(JSON.stringify(o)); apply(copy); if (!copy.lines.length) return;
      const was = o.total; const hadRsv = o.rsv; if (hadRsv) reserve(o, false);
      o.lines = copy.lines; recalc(o); o.edits = (o.edits || 0) + 1; if (hadRsv) reserve(o, true);
      tl(o, `Items edited · total ${tk(was)} → ${tk(o.total)}`, `আইটেম এডিট · মোট ${tk(was)} → ${tk(o.total)}`);
      if (o.erp && o.erp.pushed) erpEv('order', `Sales order ${o.erp.no} updated for ${o.id}`);
      U.close(); A.commit(`Edited items on ${o.id}`); A.toast(t('Order updated', 'অর্ডার আপডেট হয়েছে'), 'good'); A.render();
    };
  }

  function phoneOrderModal() {
    const live = A.D.products.filter((p) => p.status === 'live');
    const m = U.modal(t('New phone order', 'নতুন ফোন অর্ডার'), `<div class="formgrid">
      ${U.field(t('Phone', 'ফোন'), U.input('po-ph', '', 'inputmode="tel" placeholder="017XXXXXXXX"'), '<span id="po-known"></span>')}
      ${U.field(t('Name', 'নাম'), U.input('po-nm', ''))}
      ${U.field(t('Area', 'এলাকা'), U.select('po-zone', [['inside', t('Inside Dhaka', 'ঢাকার ভেতরে')], ['sub', t('Dhaka suburbs', 'ঢাকার আশেপাশে')], ['outside', t('Outside Dhaka', 'ঢাকার বাইরে')]], 'inside'))}
      ${U.field(t('Address', 'ঠিকানা'), U.input('po-ad', ''))}
      ${U.field(t('Product', 'প্রোডাক্ট'), U.select('po-p', live.map((p) => [p.id, `${p.name} · ${tk(p.price)}`]), live[0].id))}
      ${U.field(t('Colour · size', 'রং · সাইজ'), '<select class="inp" id="po-v"></select>')}
      ${U.field(t('Quantity', 'পরিমাণ'), U.input('po-q', '1', 'type="number" min="1" max="9"'))}
      ${U.field(t('Payment', 'পেমেন্ট'), U.select('po-pay', [['COD', 'COD'], ['bKash', 'bKash'], ['Nagad', 'Nagad']], 'COD'))}
    </div><div id="po-sum" style="margin-top:12px"></div>`, { wide: true, foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="po-ok">${t('Create order', 'অর্ডার তৈরি করুন')}</button>` });
    const $ = (s) => m.querySelector(s);
    const fillV = () => { const p = prod($('#po-p').value); $('#po-v').innerHTML = p.variants.map((v) => `<option value="${v.sku}" ${v.stock ? '' : 'disabled'}>${v.color} · ${v.size} (${v.stock} ${t('left', 'আছে')})</option>`).join(''); const first = p.variants.find((v) => v.stock); if (first) $('#po-v').value = first.sku; };
    const sum = () => { const p = prod($('#po-p').value); const q = Math.max(1, +$('#po-q').value || 1); const o = { lines: [{ price: p.price, qty: q }], zone: $('#po-zone').value, coupon: '' }; recalc(o); $('#po-sum').innerHTML = `<div class="row between"><span>${t('Subtotal', 'সাবটোটাল')} ${tk(o.subtotal)}${o.discount ? ' · ' + t('discount', 'ছাড়') + ' −' + tk(o.discount) : ''} · ${t('delivery', 'ডেলিভারি')} ${o.delivery ? tk(o.delivery) : t('free', 'ফ্রি')}</span><b>${t('Total', 'মোট')} ${tk(o.total)}</b></div>`; };
    $('#po-ph').oninput = () => { const c = A.D.customers.find((c) => c.phone === $('#po-ph').value.trim()); $('#po-known').innerHTML = c ? `${c.name} · ${c.orders} ${t('orders', 'অর্ডার')}, ${c.refused} ${t('refused', 'ফেরত')}` : ''; if (c) { $('#po-nm').value = c.name; $('#po-zone').value = c.zone; $('#po-ad').value = c.area + ', ' + c.district; sum(); } };
    $('#po-p').onchange = () => { fillV(); sum(); }; $('#po-q').oninput = sum; $('#po-zone').onchange = sum;
    fillV(); sum();
    $('#po-ok').onclick = () => {
      const ph = $('#po-ph').value.trim(), nm = $('#po-nm').value.trim();
      if (!/^01\d{9}$/.test(ph)) { A.toast(t('Type an 11-digit phone number', '11 সংখ্যার ফোন নম্বর দিন'), 'bad'); return; }
      if (!nm) { A.toast(t('Type the name', 'নাম দিন'), 'bad'); return; }
      const p = prod($('#po-p').value); const v = p.variants.find((x) => x.sku === $('#po-v').value) || p.variants[0]; const q = Math.max(1, +$('#po-q').value || 1);
      let c = A.D.customers.find((x) => x.phone === ph); const zone = $('#po-zone').value;
      if (!c) { c = { id: 'C' + (500 + A.D.customers.length + Math.floor(Math.random() * 900)), name: nm, phone: ph, district: zone === 'outside' ? 'Chattogram' : 'Dhaka', area: $('#po-ad').value || 'Mirpur', zone, created: NOW(), points: 0, wallet: 0, tags: [], email: '', orders: 0, delivered: 0, refused: 0, spent: 0, lastOrder: null }; A.D.customers.push(c); }
      const maxNo = Math.max(...A.D.orders.map((o) => +o.id.slice(3)));
      const o = { id: 'EX-' + (maxNo + 1), created: NOW(), customerId: c.id, name: nm, phone: ph, district: c.district, area: c.area, zone, address: $('#po-ad').value || c.area + ', ' + c.district, lines: [{ pid: p.id, sku: v.sku, name: p.name, color: v.color, size: v.size, qty: q, price: p.price, cost: p.cost }], coupon: '', payment: $('#po-pay').value, paid: false, channel: 'Phone', source: 'Phone', courier: '', tracking: '', status: 'new', risk: c.refused ? 'high' : zone === 'outside' && p.price * q > 3000 ? 'medium' : 'low', notes: '', timeline: [{ t: NOW(), text: 'Order placed on Phone', by: 'You' }], erp: { pushed: false }, deliveredAt: null, settled: false, returnReason: '' };
      recalc(o); A.D.orders.unshift(o); c.orders++; c.lastOrder = o.created;
      U.close(); A.commit(`Created phone order ${o.id}`); A.toast(t(`Order ${o.id} created`, `অর্ডার ${o.id} তৈরি হয়েছে`), 'good'); A.go('orders', 'all', o.id);
    };
  }

  /* =====================================================================
     v2 — batch flow, courier score, auto-confirm rules, print all, courier
     check, returns paths. Extra sample states are derived from A.D once,
     seeded by order id, and saved with the data (A.D.ordx).
     ===================================================================== */
  A.css('orders2', `
  .o2-pipe{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px}
  .o2-pc{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:2px;min-width:0;cursor:pointer;position:relative}
  .o2-pc:hover{border-color:var(--accent)}
  .o2-pc b{font-size:26px;font-variant-numeric:tabular-nums;line-height:1.1}
  .o2-pc .l{font-size:13px;font-weight:600}
  .o2-pc .s{font-size:12px;color:var(--muted)}
  .o2-pc.stuck{border-color:var(--bad);background:color-mix(in srgb,var(--bad) 6%,var(--card))}
  .o2-pc:not(:last-child)::after{content:"›";position:absolute;right:-9px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:16px}
  .o2-pc.stuck::after{display:none}
  .o2-li{display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line);min-width:0}
  .o2-li:last-child{border-bottom:0}
  .o2-li .grow{flex:1;min-width:0}
  .o2-li a{color:inherit}
  .o2-tag{display:inline-block;font-size:11px;font-weight:600;border-radius:5px;padding:1px 6px;background:var(--card2);color:var(--muted);white-space:nowrap}
  .o2-tag.last{background:color-mix(in srgb,var(--warn) 16%,var(--card));color:var(--warn)}
  .o2-score{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
  .o2-big{font-size:34px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1}
  .o2-big small{font-size:15px;color:var(--muted);font-weight:600}
  .o2-big.good{color:var(--good)}.o2-big.warn{color:var(--warn)}.o2-big.bad{color:var(--bad)}
  .o2-ms{flex:1;min-width:220px;display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}
  .o2-m{font-size:12px;min-width:0}
  .o2-m .row{gap:6px}
  .o2-m .bar{height:5px;margin-top:3px}
  .o2-ai{background:var(--card2);border-radius:10px;padding:8px 10px;font-size:13px;margin-top:10px;display:flex;gap:8px;align-items:flex-start}
  .o2-ai .badge{flex:none}
  .o2-cust{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
  .o2-cust h2{margin:0;font-size:24px}
  .o2-cl{display:flex;align-items:center;gap:8px;font-size:14px;padding:3px 0;min-width:0;flex-wrap:wrap}
  .o2-cl .ellip{min-width:0;max-width:100%}
  .o2-cl .btn{padding:3px 8px;font-size:12px}
  .o2-pl{display:flex;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}
  .o2-pl:last-child{border-bottom:0}
  .o2-pl .grow{flex:1;min-width:0}
  .o2-dot{display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:-2px;border:1px solid var(--line2)}
  .o2-size{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:28px;border-radius:8px;background:var(--ink);color:var(--card);font-weight:700;font-size:14px;padding:0 6px}
  .o2-life{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
  .o2-life div{background:var(--card2);border-radius:10px;padding:8px 10px;min-width:0}
  .o2-life span{display:block;font-size:11.5px;color:var(--muted)}
  .o2-life b{font-size:15px;font-variant-numeric:tabular-nums}
  .o2-prev details{border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:6px}
  .o2-prev summary{cursor:pointer;display:flex;gap:8px;align-items:center;flex-wrap:wrap;list-style:none}
  .o2-prev summary::-webkit-details-marker{display:none}
  .o2-q{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--card);display:flex;flex-direction:column;gap:10px;min-width:0}
  .o2-q.red{border-color:var(--bad)}
  .o2-pick{width:100%;border-collapse:collapse;font-size:12.5px}
  .o2-pick td,.o2-pick th{border-bottom:1px solid var(--line);padding:5px 6px;text-align:left}
  .o2-pick .cat td{background:var(--card2);font-weight:700}
  .o2-pick .r{text-align:right}
  .o2-paper{background:var(--card);border:1px solid var(--line2);border-radius:6px;padding:16px;font-size:12.5px;box-shadow:var(--shadow);margin-bottom:14px;overflow-x:auto}
  .o2-lh{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid var(--ink);padding-bottom:6px;margin-bottom:8px;gap:8px;flex-wrap:wrap}
  .o2-lh h2{margin:0;letter-spacing:.08em;font-size:20px}
  .o2-stk{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
  .o2-stk>div{border:1.5px dashed var(--ink2);border-radius:8px;padding:8px;font-size:11.5px;display:flex;flex-direction:column;gap:3px}
  .o2-tick{display:inline-block;width:13px;height:13px;border:1.5px solid var(--ink);border-radius:3px;vertical-align:-2px}
  .o2-rem{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:14px}
  .o2-rem a{display:flex;gap:8px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--warn);border-radius:10px;padding:9px 11px;font-size:13px;color:inherit;text-decoration:none;min-width:0}
  .o2-rem a.bad{border-left-color:var(--bad)}
  .o2-rem a.ok{border-left-color:var(--good);opacity:.75}
  .o2-rem b{font-variant-numeric:tabular-nums}
  .o2-clock{font-variant-numeric:tabular-nums;font-weight:700}
  .o2-tier{display:flex;flex-direction:column;gap:6px}
  .o2-tier label{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:8px 10px;cursor:pointer}
  .o2-tier label:has(input:checked){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,var(--card))}
  .o2-moneybox{background:var(--card2);border-radius:12px;padding:10px 12px;margin-top:10px}
  .o2-moneybox .li{padding:5px 0}
  .o2-two{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px;align-items:start}
  .o2-half{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
  @media (max-width:1100px){.o2-pipe{grid-template-columns:repeat(3,minmax(0,1fr))}.o2-pc::after{display:none}.o2-life{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media (max-width:860px){.o2-two,.o2-half{grid-template-columns:minmax(0,1fr)}.o2-rem{grid-template-columns:minmax(0,1fr)}}
  @media (max-width:560px){.o2-pipe{grid-template-columns:repeat(2,minmax(0,1fr))}.o2-ms{grid-template-columns:minmax(0,1fr);min-width:0}.o2-life{grid-template-columns:repeat(2,minmax(0,1fr))}.o2-cust h2{font-size:20px}}
  `);

  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const H = (o, k) => hash(o.id + ':' + k);
  const HOUR = 36e5;
  const ageH = (iso) => (A.TODAY - new Date(iso)) / HOUR;
  const COLHEX = { Navy: '#1f2a4d', Black: '#16181d', White: '#f4f4f2', Grey: '#8a8f98', 'Light Grey': '#c6c9cf', Maroon: '#6d1f2b', Olive: '#5d6236', 'Sky Blue': '#7fb3e0', Blue: '#2d5fa8', Green: '#2f6b4a', Beige: '#d8c6a5', Khaki: '#b3a27a', Red: '#b3262f', Mustard: '#c99a2e', Brown: '#6b4a32', Charcoal: '#3a3d44', Cream: '#efe6d2', Teal: '#1f6f72', Purple: '#5a3e8a', Pink: '#e3a6b4', Orange: '#d9772b', Yellow: '#e2c547' };
  const dot = (c) => `<span class="o2-dot" title="${esc(c)}" style="background:${COLHEX[c] || 'var(--muted)'}"></span>`;
  const plural = (n, en) => n + ' ' + t(en + (n === 1 ? '' : 's'), '');
  const nOrd = (n) => t(`${n} order${n === 1 ? '' : 's'}`, `${n}টি অর্ডার`);

  /* ---------- settings with safe defaults (Rules › Order flow may override) ---------- */
  function OF() {
    const r = A.D.rules; const cs = r.courierScore || {}; const f = Object.assign({ upper: cs.upper, lower: cs.lower, bigCod: r.cod && r.cod.callAbove, courier: r.courier && r.courier.def, stockWaitDays: r.holds && r.holds.waitHours ? r.holds.waitHours / 24 : undefined }, r.orderFlow || {});
    const conn = A.D.couriers.filter((c) => c.connected);
    let dc = f.courier || r.defaultCourier || 'pathao';
    if (!conn.some((c) => c.id === dc)) dc = conn[0] ? conn[0].id : 'pathao';
    return { upper: f.upper != null ? f.upper : 7, lower: f.lower != null ? f.lower : 4, bigCod: f.bigCod != null ? f.bigCod : 5000, waitDays: f.stockWaitDays || 2, courier: dc, erpDays: (r.returns && r.returns.erpDays) || f.erpDays || 7, backDays: (r.exchange && r.exchange.backDays) || 4, exHours: (r.exchange && r.exchange.hours) || 72, exCharge: (r.exchange && r.exchange.charge != null) ? r.exchange.charge : 60 };
  }
  const X = () => A.D.ordx;
  function nextId() { return 'EX-' + (Math.max(...A.D.orders.map((o) => +o.id.slice(3))) + 1); }

  /* ---------- courier score (one score, 6 metrics) ---------- */
  const METRICS = [
    ['success', 'Success rate', 'সফল ডেলিভারির হার', 30],
    ['parcels', 'Total parcels', 'মোট পার্সেল', 15],
    ['returns', 'Total returns', 'মোট রিটার্ন', 15],
    ['worst', 'Worst courier rate', 'সবচেয়ে খারাপ কুরিয়ারে হার', 15],
    ['couriers', 'Couriers with record', 'কয়টি কুরিয়ারে রেকর্ড', 10],
    ['fraud', 'Fraud reports by other shops', 'অন্য শপের ফ্রড রিপোর্ট', 15],
  ];
  const band = (v, steps) => { for (const s of steps) if (v >= s[0]) return s[1]; return 0; };
  const SCACHE = {};
  function score(o) {
    const key = o.phone + '|' + ((cust(o) || {}).delivered || 0) + '|' + ((cust(o) || {}).refused || 0);
    if (SCACHE[key]) return SCACHE[key];
    const c = cust(o) || { delivered: 0, refused: 0 };
    const h = hash(o.phone);
    const own = c.delivered + c.refused;
    let m;
    if (!own && h < 0.2) m = { success: 0, parcels: 0, returns: 0, worst: 0, couriers: 0, fraud: 0, none: true };
    else {
      const other = Math.floor(hash(o.phone + 'p') * 16);
      const badShopper = h > 0.9;
      const otherRet = Math.round(other * (badShopper ? 0.5 : hash(o.phone + 'r') * 0.16));
      const parcels = own + other, returns = c.refused + otherRet;
      const success = parcels ? Math.round((parcels - returns) / parcels * 100) : 0;
      const couriers = parcels ? Math.min(4, 1 + Math.floor(hash(o.phone + 'c') * Math.min(4, parcels))) : 0;
      const worst = Math.max(0, Math.round(success - hash(o.phone + 'w') * (badShopper ? 35 : 14)));
      const fraud = h > 0.96 ? 2 : h > 0.93 ? 1 : 0;
      m = { success, parcels, returns, worst, couriers, fraud, none: false };
    }
    const s = {
      success: m.parcels ? band(m.success, [[92, 10], [85, 8], [75, 6], [60, 4], [45, 2]]) : 0,
      parcels: band(m.parcels, [[20, 10], [10, 8], [5, 6], [2, 4], [1, 2]]),
      returns: m.parcels ? (m.returns === 0 ? 10 : m.returns === 1 ? 8 : m.returns === 2 ? 6 : m.returns <= 4 ? 4 : m.returns <= 6 ? 2 : 0) : 0,
      worst: m.parcels ? band(m.worst, [[85, 10], [70, 7], [50, 4], [1, 1]]) : 0,
      couriers: band(m.couriers, [[3, 10], [2, 7], [1, 5]]),
      fraud: m.parcels ? (m.fraud === 0 ? 10 : m.fraud === 1 ? 3 : 0) : 5,
    };
    const tw = A.sum(METRICS, (x) => x[3]);
    const total = Math.round(A.sum(METRICS, (x) => s[x[0]] * x[3]) / tw * 10) / 10;
    return (SCACHE[key] = { m, s, total, none: m.none });
  }
  const scoreTone = (sc) => { const f = OF(); return sc.none ? 'warn' : sc.total >= f.upper ? 'good' : sc.total < f.lower ? 'bad' : 'warn'; };
  function aiLine(o, sc) {
    const m = sc.m;
    if (sc.none) return t('No parcel record anywhere yet. A short call is enough — ask the size and the address landmark.', 'কোথাও কোনো পার্সেলের রেকর্ড নেই। একটা ছোট কলই যথেষ্ট — সাইজ আর ঠিকানার ল্যান্ডমার্ক জেনে নিন।');
    if (m.fraud >= 1) return t(`${m.fraud} other shop${m.fraud > 1 ? 's' : ''} reported this number. Ask for the delivery charge in advance before you send.`, `অন্য ${m.fraud}টি শপ এই নম্বর রিপোর্ট করেছে। পাঠানোর আগে ডেলিভারি চার্জ অগ্রিম নিন।`);
    if (sc.total >= OF().upper) return t(`Takes almost every parcel (${m.success}% of ${m.parcels} on ${m.couriers} courier${m.couriers > 1 ? 's' : ''}). Safe to send.`, `প্রায় সব পার্সেল নেন (${m.couriers}টি কুরিয়ারে ${m.parcels}টির ${m.success}%)। নিশ্চিন্তে পাঠাতে পারেন।`);
    if (sc.total < OF().lower) return t(`Refused ${m.returns} of ${m.parcels} parcels. Ask for the delivery charge first; ship when it arrives.`, `${m.parcels}টির মধ্যে ${m.returns}টি পার্সেল নেননি। আগে ডেলিভারি চার্জ নিন, টাকা এলে পাঠান।`);
    return t(`Mixed record: ${m.returns} return${m.returns === 1 ? '' : 's'} in ${m.parcels} parcels. A call to confirm the size usually saves the parcel.`, `মিশ্র রেকর্ড: ${m.parcels}টি পার্সেলে ${m.returns}টি রিটার্ন। সাইজ কনফার্ম করে একটা কল দিলে সাধারণত পার্সেল বাঁচে।`);
  }
  function metricText(k, m) {
    if (k === 'success') return m.parcels ? m.success + '%' : '—';
    if (k === 'worst') return m.parcels ? m.worst + '%' : '—';
    return String(m[k]);
  }
  function scorePanel(o, compact) {
    const sc = score(o); const tone = scoreTone(sc);
    const bars = METRICS.map((x) => `<div class="o2-m"><div class="row between"><span class="ellip">${t(x[1], x[2])}</span><b>${metricText(x[0], sc.m)}</b></div>${U.bar(sc.s[x[0]] * 10, `var(--${sc.s[x[0]] >= 7 ? 'good' : sc.s[x[0]] >= 4 ? 'warn' : 'bad'})`)}</div>`).join('');
    return `<div class="o2-score"><div><div class="o2-big ${tone}">${sc.none ? '—' : sc.total.toFixed(1)}<small>/10</small></div><div class="small muted" style="margin-top:4px">${t('Courier score', 'কুরিয়ার স্কোর')}</div>${sc.none ? U.badge(t('No record', 'রেকর্ড নেই'), 'warn') : ''}</div><div class="o2-ms">${bars}</div></div>
      <div class="o2-ai">${U.badge('AI', 'accent')}<span>${aiLine(o, sc)}</span></div>${compact ? '' : `<div class="small muted" style="margin-top:6px">${t('Shown to staff only. Limits and weights are in Rules › Order flow.', 'শুধু স্টাফরা দেখেন। সীমা ও গুরুত্ব রুলস › অর্ডার ফ্লো-তে।')}</div>`}`;
  }

  /* ---------- stock, duplicates, auto-confirm decision ---------- */
  function noStock(o) { if (o.rsv) return false; return o.lines.some((l) => { const v = variant(l); return !v || v.stock - (v.reserved || 0) < l.qty; }); }
  const flowR = () => (A.rulesApi && A.rulesApi.orderFlow ? A.rulesApi.orderFlow() : null);
  const lookDays = () => { const f = flowR(); if (f && +f.dupDays) return +f.dupDays; const m = A.D.rules.merge || {}; return +m.days || +m.lookBackDays || +A.D.rules.dupDays || 5; };
  const autoMergeOn = () => { const f = flowR(); if (f) return !!f.autoMerge; const m = A.D.rules.merge || {}; return !!(m.auto || m.autoMerge || A.D.rules.autoMerge); };
  function dupes(o) { if (!['new', 'confirmed'].includes(o.status)) return []; const lim = lookDays() * DAY; return A.D.orders.filter((x) => x.id !== o.id && x.phone === o.phone && ['new', 'confirmed'].includes(x.status) && Math.abs(new Date(x.created) - new Date(o.created)) <= lim); }
  function decide(o) {
    const c = cust(o) || { delivered: 0, refused: 0 };
    const f = OF(); const sc = score(o);
    if (o.payment !== 'COD' && o.paid) return { k: 'auto', en: `Paid in full by ${o.payment}`, bn: `${o.payment}-এ পুরো টাকা দেওয়া` };
    if (o.advancePaid) return { k: 'auto', en: 'Delivery charge paid in advance', bn: 'ডেলিভারি চার্জ অগ্রিম দেওয়া' };
    if (o.status === 'new' && dupes(o).length) return { k: 'red', why: 'merge', en: 'Same phone has another open order', bn: 'একই ফোনে আরেকটি চালু অর্ডার' };
    if (sc.m.fraud >= 2 || (!sc.none && sc.total < f.lower)) return { k: 'red', why: 'suspicious', en: `Low courier score ${sc.total.toFixed(1)}`, bn: `কুরিয়ার স্কোর কম ${sc.total.toFixed(1)}` };
    if (c.refused > 0) return { k: 'call', en: `Refused ${c.refused} before`, bn: `আগে ${c.refused}টি নেননি` };
    if (o.payment === 'COD' && o.total >= f.bigCod) return { k: 'call', en: `Big cash on delivery (${tk(o.total)})`, bn: `বড় COD (${tk(o.total)})` };
    const prev = A.D.orders.filter((x) => x.customerId === o.customerId && x.id !== o.id && C.isDelivered(x)).length;
    if (prev && c.refused === 0) return { k: 'auto', en: 'Trusted customer — all delivered', bn: 'বিশ্বস্ত কাস্টমার — সব ডেলিভারি নিয়েছেন' };
    if (sc.none) return { k: 'call', en: 'Brand-new, no record anywhere', bn: 'একদম নতুন, কোথাও রেকর্ড নেই' };
    if (sc.total >= f.upper) return { k: 'auto', en: `New to shop, good courier score ${sc.total.toFixed(1)}`, bn: `শপে নতুন, কুরিয়ার স্কোর ভালো ${sc.total.toFixed(1)}` };
    return { k: 'call', en: `Courier score in the middle (${sc.total.toFixed(1)})`, bn: `কুরিয়ার স্কোর মাঝামাঝি (${sc.total.toFixed(1)})` };
  }
  /* why an order sits in Processing (one order can have several reasons; the first is shown as its main tag) */
  function stuckTags(o) {
    if (o.status !== 'new') return [];
    const a = [];
    if (o.advanceAsked && !o.advancePaid) a.push('advance');
    if (noStock(o)) a.push('stock');
    if (dupes(o).length) a.push('merge');
    const d = decide(o); if (d.k === 'red' && d.why === 'suspicious') a.push('suspicious');
    if (o.calls) a.push('noanswer');
    return a;
  }
  const stuckWhy = (o) => stuckTags(o)[0] || '';
  const STUCK = { stock: ['No stock', 'স্টক নেই', 'bad'], noanswer: ['No answer', 'ফোন ধরেননি', 'warn'], suspicious: ['Suspicious', 'সন্দেহজনক', 'bad'], merge: ['Merge needed', 'মার্জ করতে হবে', 'info'], advance: ['Advance asked', 'অ্যাডভান্স চাওয়া', 'info'] };

  /* full confirm path: stock held, ERP books, SMS 2 + WhatsApp invoice. The courier is booked later, in To ship. */
  function doConfirm(o, by, why) {
    if (!confirmOrder(o, by === 'rules' ? `Confirmed by rules — ${why.en}` : 'Confirmed on call')) return false;
    if (by === 'rules') { const e = o.timeline[o.timeline.length - 2]; if (e) { e.by = 'Rules'; e.bn = 'নিয়মে কনফার্ম — ' + why.bn; } const e2 = o.timeline[o.timeline.length - 1]; if (e2) e2.by = 'System'; }
    o.cBy = by; o.autoWhy = by === 'rules' ? why : null; o.calls = 0;
    tl(o, 'SMS 2 sent: order confirmed · WhatsApp invoice image sent', 'SMS 2 গেছে: অর্ডার কনফার্ম · WhatsApp-এ ইনভয়েসের ছবি গেছে', 'System');
    return true;
  }

  /* ---------- one-time sample states ---------- */
  function init() {
    const D = A.D;
    if (D.ordx && D.ordx.v === 4) return;
    const sod = SOD();
    D.ordx = { v: 4, batchStart: new Date(sod - 7 * HOUR).toISOString(), batchNo: 214, closed: [{ no: 213, start: new Date(sod - 31 * HOUR).toISOString(), end: new Date(sod - 7 * HOUR).toISOString(), count: 0 }], exReq: [], courierRun: null };
    // who confirmed the already-confirmed orders
    for (const o of D.orders) {
      if (['new', 'cancelled'].includes(o.status) || o.cBy) continue;
      const d = decide(o);
      if (d.k === 'auto') { o.cBy = 'rules'; o.autoWhy = { en: d.en, bn: d.bn }; const e = o.timeline.find((x) => x.text === 'Confirmed on call'); if (e) { e.text = 'Confirmed by rules — ' + d.en; e.bn = 'নিয়মে কনফার্ম — ' + d.bn; e.by = 'Rules'; } }
      else o.cBy = 'staff';
    }
    D.ordx.closed[0].count = D.orders.filter((o) => new Date(o.created) >= new Date(D.ordx.closed[0].start) && new Date(o.created) < new Date(D.ordx.closed[0].end)).length;
    // two extra sample orders today: a second order on the same phone, and one for a sold-out size
    const mk = (base, line, mins) => { const n = JSON.parse(JSON.stringify(base)); Object.assign(n, { id: nextId(), created: new Date(A.TODAY.getTime() - mins * 6e4).toISOString(), lines: [line], coupon: '', status: 'new', courier: '', tracking: '', erp: { pushed: false }, rsv: false, cBy: null, autoWhy: null, calls: 0, timeline: [{ t: new Date(A.TODAY.getTime() - mins * 6e4).toISOString(), text: 'Order placed on Website', by: 'Customer' }], deliveredAt: null, settled: false }); recalc(n); A.D.orders.unshift(n); const c = cust(n); if (c) c.orders++; return n; };
    const today = D.orders.filter((o) => new Date(o.created) >= sod && ['new', 'confirmed'].includes(o.status) && o.payment === 'COD');
    if (today[0]) { const p = D.products.filter((q) => q.status === 'live')[3]; const v = p.variants.find((x) => x.stock > 2) || p.variants[0]; mk(today[0], { pid: p.id, sku: v.sku, name: p.name, color: v.color, size: v.size, qty: 1, price: p.price, cost: p.cost }, 95); }
    const out = C.lowStock(0).find((x) => x.v.stock - (x.v.reserved || 0) <= 0) || null;
    const base2 = today[1] || today[0];
    if (base2 && out) mk(base2, { pid: out.p.id, sku: out.v.sku, name: out.p.name, color: out.v.color, size: out.v.size, qty: 1, price: out.p.price, cost: out.p.cost }, 150);
    // run the rules on new orders (older than 20 minutes); seed unanswered calls on the rest
    for (const o of D.orders.filter((x) => x.status === 'new')) {
      const d = decide(o);
      if (d.k === 'auto' && ageH(o.created) > 0.34 && !noStock(o)) { doConfirm(o, 'rules', d); continue; }
      if (d.k === 'call' && (H(o, 'na') < 0.35 || !D.ordx.na)) { D.ordx.na = 1; o.calls = 1; tl(o, 'Called — no answer', 'কল দেওয়া হয়েছে — ধরেননি', 'Nusrat'); o.timeline[o.timeline.length - 1].t = new Date(new Date(o.created).getTime() + HOUR).toISOString(); }
    }
    // a cancelled order the courier still entered
    const cx = D.orders.find((o) => o.status === 'cancelled' && ageH(o.created) < 72);
    if (cx) { cx.courierEnteredCancelled = true; cx.courier = OF().courier; cx.tracking = 'SF' + Math.floor(1000000 + hash(cx.id) * 8999999); }
    // refused parcels: hand-back and ERP check states
    for (const o of D.orders.filter((x) => x.status === 'returned')) {
      const back = new Date(new Date(o.created).getTime() + 4 * DAY);
      const ago = (A.TODAY - back) / DAY;
      if (o.returnChecked) {
        o.handBack = { count: C.pieces(o), note: '', at: new Date(back.getTime() + 2 * HOUR).toISOString(), by: 'Sohel' };
        o.checkedAt = new Date(back.getTime() + 2 * DAY).toISOString();
        if (H(o, 'dec') < 0.14) { o.returnDeclined = H(o, 'dr') < 0.5 ? 'Stain on the front' : 'Tag removed, worn'; o.returnCredit = 0; }
      } else if (ago > 6.5) { o.returnChecked = true; o.handBack = { count: C.pieces(o), note: '', at: new Date(back.getTime() + 2 * HOUR).toISOString(), by: 'Sohel' }; o.checkedAt = new Date(back.getTime() + 3 * DAY).toISOString();
      } else if (ago > 1.2) {
        const short = H(o, 'sh') < 0.2;
        o.handBack = { count: Math.max(0, C.pieces(o) - (short ? 1 : 0)), note: short ? '1 piece missing from the parcel' : '', at: new Date(back.getTime() + 3 * HOUR).toISOString(), by: 'Sohel' };
        if (short) o.handBack.short = 1;
      }
    }
    // customer exchange requests (within 72h of delivery)
    const recent = D.orders.filter((o) => o.status === 'delivered' && o.deliveredAt && ageH(o.deliveredAt) < 60 && ageH(o.deliveredAt) > 2);
    recent.slice(0, 4).forEach((o, i) => {
      if (i > 0 && H(o, 'xr') < 0.35) return;
      D.ordx.exReq.push({ id: 'XR' + (300 + i), oid: o.id, li: 0, reason: H(o, 'rs') < 0.75 ? 'size' : 'defect', note: H(o, 'rs') < 0.75 ? (H(o, 'big') < 0.5 ? 'Too tight at the chest' : 'Too long') : 'Stitch open at the side', at: new Date(new Date(o.deliveredAt).getTime() + (4 + i * 5) * HOUR).toISOString(), status: 'waiting' });
    });
    // partial delivery at the door (box to fill)
    D.orders.filter((o) => o.status === 'shipped' && C.pieces(o) >= 2).slice(0, 2).forEach((o) => { o.partialAtDoor = new Date(A.TODAY - (3 + H(o, 'pd') * 10) * HOUR).toISOString(); tl(o, 'Courier: customer kept part of the parcel', 'কুরিয়ার: কাস্টমার পার্সেলের কিছু অংশ রেখেছেন', 'Courier'); });
    // incomplete orders: messages sent so far
    for (const a of D.abandoned) if (a.msgs == null) a.msgs = a.messaged ? 1 : 0;
    A.save ? A.save() : A.commit();
  }

  /* ---------- display steps: New, Processing, Confirmed, Booked, Packed, Handed over, Delivered, Paid ---------- */
  function dstat(o) {
    if (o.status === 'new') return (!o.calls && ageH(o.created) < 0.34 && decide(o).k === 'auto' && !noStock(o)) ? 'new' : 'processing';
    if (C.isDelivered(o)) return (o.settled || o.payment !== 'COD') ? 'paid' : 'delivered';
    return o.status;
  }
  const DST = { new: ['New', 'নতুন', 'accent'], processing: ['Processing', 'প্রসেসিং', 'warn'], confirmed: ['Confirmed', 'কনফার্মড', 'info'], booked: ['Booked', 'বুকড', 'info'], packed: ['Packed', 'প্যাকড', 'info'], shipped: ['Handed over', 'কুরিয়ারকে দেওয়া', 'warn'], delivered: ['Delivered', 'ডেলিভারি হয়েছে', 'good'], paid: ['Paid', 'টাকা এসেছে', 'good'], returned: ['Returned', 'ফেরত এসেছে', 'bad'], cancelled: ['Cancelled', 'বাতিল', ''], exchanged: ['Exchanged', 'এক্সচেঞ্জড', 'info'] };
  const dBadge = (o) => { if (o.mergedInto) return U.badge(t(`Merged into ${o.mergedInto}`, `${o.mergedInto}-এ মার্জ হয়েছে`), 'info'); const s = DST[dstat(o)] || [o.status, o.status, '']; return U.badge(t(s[0], s[1]), s[2]); };

  /* ---------- batch: current = every order not yet handed over; a past batch is made by each courier pickup ---------- */
  const OPEN_S = ['new', 'confirmed', 'booked', 'packed'];
  const pastB = () => (X().pastBatches = X().pastBatches || []);
  const lastPick = () => { const b = pastB()[0]; return b ? new Date(b.at).getTime() : 0; };
  const inBatch = (o) => OPEN_S.includes(o.status);
  const fromLast = (o) => inBatch(o) && new Date(o.created).getTime() < lastPick();
  const dtTxt = (iso) => (A.fmt.dt ? A.fmt.dt(iso) : A.fmt.date(iso) + ' ' + A.fmt.time(iso));
  const codOf = (list) => A.sum(list.filter((o) => !o.paid && o.payment === 'COD'), (o) => o.total - (o.advancePaid || 0));

  function oRow(o, extra, btn) {
    const l = o.lines[0]; const p = prod(l.pid) || { cat: 'polo' };
    return `<div class="o2-li">${U.thumb({ colors: [l.color], cat: p.cat }, 34)}<div class="grow"><div class="row" style="gap:6px;flex-wrap:wrap"><a href="${A.href('orders', 'all', o.id)}" class="strong mono">${esc(o.id)}</a>${fromLast(o) ? `<span class="o2-tag last">${t('From last batch', 'আগের ব্যাচের')}</span>` : ''}<span class="ellip" style="max-width:160px">${esc(o.name)}</span></div><div class="ord-sub ellip">${extra || ''}</div></div>${btn || ''}<div class="r"><b>${tk(o.total)}</b><div class="ord-sub">${A.fmt.ago(o.created)}</div></div></div>`;
  }

  const FB = { v: 'current', open: 0 };
  function renderBatch(el) {
    const all = A.D.orders.filter(inBatch);
    const toC = all.filter((o) => o.status === 'new');
    const proc = toC.filter((o) => dstat(o) === 'processing');
    const conf = all.filter((o) => o.status === 'confirmed'), booked = all.filter((o) => o.status === 'booked'), packed = all.filter((o) => o.status === 'packed');
    const stuck = toC.filter(stuckWhy);
    const byRules = A.D.orders.filter((o) => o.cBy === 'rules' && inBatch(o)).length;
    const decided = A.D.orders.filter((o) => o.cBy && inBatch(o)).length;
    const head = A.pageHead(t('Batch', 'ব্যাচ'), t(`${all.length} orders not yet handed to the courier · ${pastB().length} past batches`, `${all.length}টি অর্ডার এখনো কুরিয়ারকে দেওয়া হয়নি · ${pastB().length}টি আগের ব্যাচ`), `<button class="btn primary" id="b-print" ${booked.length ? '' : 'disabled'}>${A.icon('print')} ${t('Print all', 'সব প্রিন্ট')}</button>`) + A.tabsBar('orders', 'batch') + `<div class="chips" id="b-v" style="margin-bottom:12px">${[['current', 'Current', 'চলতি', all.length], ['past', 'Past', 'আগের', pastB().length]].map((c) => `<button class="chip ${FB.v === c[0] ? 'on' : ''}" data-v="${c[0]}">${t(c[1], c[2])} <span class="muted">${c[3]}</span></button>`).join('')}</div>`;
    const wireTop = () => {
      el.querySelectorAll('#b-v [data-v]').forEach((b) => (b.onclick = () => { FB.v = b.dataset.v; FB.open = 0; A.render(); }));
      const bp = el.querySelector('#b-print'); if (bp) bp.onclick = () => printAllModal(booked.filter((o) => !(o.hold || o.stockWait)), booked.filter((o) => o.hold || o.stockWait));
    };
    if (FB.v === 'past') { el.innerHTML = head + pastView(); wireTop(); return pastWire(el); }
    const pc = (key, n, en, bn, sub, cls = '') => `<a class="o2-pc ${cls}" data-go="${key}"><span class="l">${t(en, bn)}</span><b>${n}</b><span class="s">${sub || '&nbsp;'}</span></a>`;
    const pct = decided ? Math.round(byRules / decided * 100) : 0;
    const ins = [];
    if (decided) ins.push(t(`Rules confirmed ${pct}% of these orders by themselves — ${decided - byRules} needed a person.`, `এই অর্ডারগুলোর ${pct}% নিয়ম নিজেই কনফার্ম করেছে — ${decided - byRules}টিতে মানুষ লেগেছে।`));
    if (stuck.length) ins.push(t(`${stuck.length} stuck in Processing: clear them so they can be booked.`, `${stuck.length}টি প্রসেসিংয়ে আটকে: ঠিক করুন, তাহলে বুক করা যাবে।`));
    const fl = all.filter(fromLast).length; if (fl) ins.push(t(`${fl} older orders from before the last pickup are still here — they are on top of your list.`, `শেষ পিকআপের আগের ${fl}টি পুরনো অর্ডার এখনো আছে — আপনার লিস্টের ওপরে।`));
    const stuckCounts = Object.keys(STUCK).map((k) => [k, stuck.filter((o) => stuckTags(o).includes(k)).length]);
    const work = toC.slice().sort((a, b) => (fromLast(b) - fromLast(a)) || new Date(a.created) - new Date(b.created));
    const moved = all.filter((o) => o.cBy === 'rules').sort((a, b) => new Date(b.created) - new Date(a.created));
    el.innerHTML = head + `
      <div class="o2-pipe">
        ${pc('all', all.length, 'Not handed over', 'এখনো দেওয়া হয়নি', t('every open order', 'সব চালু অর্ডার'))}
        ${pc('processing', proc.length, 'Processing', 'প্রসেসিং', t(`${stuck.length} stuck`, `${stuck.length}টি আটকে`))}
        ${pc('confirmed', conf.length, 'Confirmed', 'কনফার্মড', t('ready to book', 'বুকের অপেক্ষায়'))}
        ${pc('booked', booked.length, 'Booked', 'বুকড', t('ready to print', 'প্রিন্টের অপেক্ষায়'))}
        ${pc('packed', packed.length, 'Packed', 'প্যাকড', t('waiting for pickup', 'পিকআপের অপেক্ষায়'))}
        ${pc('stuck', stuck.length, 'Stuck', 'আটকে আছে', stuckCounts.filter((s) => s[1]).map((s) => t(STUCK[s[0]][0], STUCK[s[0]][1]) + ' ' + s[1]).join(' · '), 'stuck')}
      </div>
      ${ins.length ? U.callout(ins.join('<br>'), '', 'info') : ''}
      <div style="height:14px"></div>
      ${stuck.length ? U.card(t('Stuck', 'আটকে আছে'), `<div class="chips" style="margin-bottom:8px">${stuckCounts.filter((s) => s[1]).map((s) => `<span class="chip">${t(STUCK[s[0]][0], STUCK[s[0]][1])} · ${s[1]}</span>`).join('')}</div>${stuck.map((o) => oRow(o, `${stuckTags(o).map((k) => U.badge(t(STUCK[k][0], STUCK[k][1]), STUCK[k][2])).join(' ')} ${esc(stuckLine(o))}`, stuckTags(o).includes('merge') ? `<button class="btn sm" data-merge="${o.id}">${t('Merge', 'মার্জ')}</button>` : '')).join('')}`, { sub: t('A person decides each of these. Nothing is ever blocked by itself.', 'এগুলো একজন মানুষ ঠিক করবেন। কিছুই নিজে থেকে ব্লক হয় না।'), more: t('Open Processing', 'প্রসেসিং খুলুন'), moreHref: A.href('orders', 'processing') }) + '<div style="height:14px"></div>' : ''}
      <div class="o2-half">
        ${U.card(t(`Your work (${work.length})`, `আপনার কাজ (${work.length})`), work.length ? work.slice(0, 12).map((o) => { const d = decide(o); const sw = stuckWhy(o); return oRow(o, `${sw ? U.badge(t(STUCK[sw][0], STUCK[sw][1]), STUCK[sw][2]) + ' ' : ''}${esc(t(d.en, d.bn))}`); }).join('') : U.empty(t('Nothing waits for a person. Well done.', 'কারো জন্য কিছু অপেক্ষায় নেই। দারুণ!')), { sub: t('Needs a person · oldest first', 'মানুষ লাগবে · পুরনোটা আগে') })}
        ${U.card(t(`Moved on by itself (${moved.length})`, `নিজে থেকে এগিয়েছে (${moved.length})`), moved.slice(0, 14).map((o) => oRow(o, `${U.badge(t('Rules', 'নিয়ম'), 'good')} ${esc(o.autoWhy ? t(o.autoWhy.en, o.autoWhy.bn) : '')} · ${t((DST[dstat(o)] || ['', ''])[0], (DST[dstat(o)] || ['', ''])[1])}`)).join('') || U.empty(t('No order moved on by itself yet.', 'এখনো কোনো অর্ডার নিজে এগোয়নি।')), { sub: t('Rules confirm up to “Confirmed”, never further', 'নিয়ম শুধু “কনফার্মড” পর্যন্ত এগোয়, তার বেশি না'), more: t('Change the rules', 'নিয়ম বদলান'), moreHref: A.href('rules', 'all') })}
      </div>
      <p class="small muted" style="margin-top:12px">${t('This batch holds every order that is not yet handed to the courier. When the courier pickup is recorded, those parcels move to “Past”.', 'এই ব্যাচে সেই সব অর্ডার, যেগুলো এখনো কুরিয়ারকে দেওয়া হয়নি। কুরিয়ারের পিকআপ রেকর্ড হলে সেই পার্সেলগুলো “আগের”-তে চলে যায়।')}</p>`;
    wireTop();
    el.querySelectorAll('[data-go]').forEach((a) => (a.onclick = () => {
      const k = a.dataset.go;
      if (k === 'confirmed' || k === 'booked' || k === 'packed') { FS.c = k; return A.go('orders', 'ship'); }
      if (k === 'processing' || k === 'stuck') { FC.f = 'all'; return A.go('orders', 'processing'); }
      Object.assign(F, { st: 'all', batch: true, stuck: false, q: '' }); A.go('orders', 'all');
    }));
    el.querySelectorAll('[data-merge]').forEach((b) => (b.onclick = () => mergeModal(A.byId(A.D.orders, b.dataset.merge), A.render)));
  }
  function pastView() {
    const list = pastB(); const b = list.find((x) => x.no === FB.open);
    if (b) {
      const os = b.ids.map((id) => A.byId(A.D.orders, id)).filter(Boolean);
      return `<div class="row between" style="flex-wrap:wrap;gap:8px;margin-bottom:10px"><button class="btn" id="pb-back">← ${t('All past batches', 'সব আগের ব্যাচ')}</button><span class="muted small">${t('Batch', 'ব্যাচ')} ${b.no} · ${dtTxt(b.at)}</span></div>
        <div class="grid g4" style="margin-bottom:12px"><div class="card">${U.kpi({ label: t('Parcels taken', 'নেওয়া পার্সেল'), value: os.length, icon: 'truck' })}</div><div class="card">${U.kpi({ label: t('COD total', 'COD মোট'), value: tk(codOf(os)), icon: 'finance' })}</div><div class="card">${U.kpi({ label: t('Missing', 'পাওয়া যায়নি'), value: b.missing.length, sub: b.missing.length ? t('not in the courier’s report', 'কুরিয়ারের রিপোর্টে নেই') : '', icon: 'warn' })}</div><div class="card">${U.kpi({ label: t('Courier', 'কুরিয়ার'), value: esc(b.courier ? cname(b.courier) : [...new Set(os.map((o) => cname(o.courier)))].filter(Boolean).join(', ') || '—'), icon: 'truck' })}</div></div>
        ${b.missing.length ? U.callout(t(`Not taken at this pickup: ${b.missing.map(esc).join(', ')}. They stay in the current batch until the courier takes them.`, `এই পিকআপে নেওয়া হয়নি: ${b.missing.map(esc).join(', ')}। কুরিয়ার না নেওয়া পর্যন্ত এগুলো চলতি ব্যাচে থাকে।`), 'warn', 'warn') + '<div style="height:10px"></div>' : ''}
        ${U.table([{ h: t('Order', 'অর্ডার'), f: (x) => `<b class="mono">${esc(x.o.id)}</b><div class="ord-sub">${esc(x.o.name)}</div>` }, { h: t('Courier', 'কুরিয়ার'), hide: true, f: (x) => `${esc(cname(x.o.courier))}<div class="ord-sub mono">${esc(x.o.tracking || '')}</div>` }, { h: t('Cash', 'ক্যাশ'), r: true, f: (x) => (x.o.paid ? U.badge(t('Paid', 'পেইড'), 'good') : `<b>${tk(x.o.total - (x.o.advancePaid || 0))}</b>`) }, { h: t('Status', 'স্ট্যাটাস'), f: (x) => dBadge(x.o) }], os.map((o) => ({ _id: o.id, o })), { onRow: true })}`;
    }
    return U.card(t('Past batches', 'আগের ব্যাচ'), U.table([
      { h: t('Batch', 'ব্যাচ'), f: (b) => '<b>' + b.no + '</b>' },
      { h: t('Date & time', 'তারিখ ও সময়'), f: (b) => dtTxt(b.at) },
      { h: t('Parcels', 'পার্সেল'), r: true, f: (b) => b.ids.length },
      { h: t('COD total', 'COD মোট'), r: true, hide: true, f: (b) => tk(codOf(b.ids.map((id) => A.byId(A.D.orders, id)).filter(Boolean))) },
      { h: t('Taken / missing', 'নেওয়া / নেই'), f: (b) => `${U.badge(t(`${b.ids.length} taken`, `${b.ids.length}টি নেওয়া`), 'good')} ${b.missing.length ? U.badge(t(`${b.missing.length} missing`, `${b.missing.length}টি নেই`), 'bad') : ''}` },
    ], list.map((b) => Object.assign({ _id: String(b.no) }, b)), { onRow: true, empty: t('No pickup recorded yet.', 'এখনো কোনো পিকআপ রেকর্ড হয়নি।') }), { sub: t('A batch is made each time the courier pickup is recorded. Click one to open its orders.', 'কুরিয়ারের পিকআপ রেকর্ড হলেই একটি ব্যাচ তৈরি হয়। খুলতে ক্লিক করুন।') });
  }
  function pastWire(el) {
    const bk = el.querySelector('#pb-back'); if (bk) bk.onclick = () => { FB.open = 0; A.render(); };
    el.querySelectorAll('tr[data-row]').forEach((tr) => (tr.onclick = () => { if (FB.open) return A.go('orders', 'all', tr.dataset.row); FB.open = +tr.dataset.row; A.render(); }));
  }
  function stuckLine(o) {
    const w = stuckWhy(o);
    if (w === 'stock') { const l = o.lines.find((l) => { const v = variant(l); return !v || v.stock - (v.reserved || 0) < l.qty; }); return t(`${l.name} ${l.color} ${l.size} — none left`, `${l.name} ${l.color} ${l.size} — স্টক শেষ`); }
    if (w === 'merge') return t(`${dupes(o).length + 1} open orders on ${o.phone}`, `${o.phone} নম্বরে ${dupes(o).length + 1}টি চালু অর্ডার`);
    if (w === 'noanswer') return t(`Called ${o.calls} time${o.calls > 1 ? 's' : ''}, no answer`, `${o.calls} বার কল, ধরেননি`);
    const d = decide(o); return t(d.en, d.bn);
  }

  /* ================= ALL ORDERS ================= */
  const F = { q: '', st: 'all', pay: '', range: 'all', from: '', to: '', sort: 'new', limit: 40, batch: false, stuck: false };
  const CHIPS = [['all', 'All', 'সব'], ['new', 'New', 'নতুন'], ['processing', 'Processing', 'প্রসেসিং'], ['confirmed', 'Confirmed', 'কনফার্মড'], ['booked', 'Booked', 'বুকড'], ['packed', 'Packed', 'প্যাকড'], ['shipped', 'Handed over', 'কুরিয়ারকে দেওয়া'], ['delivered', 'Delivered', 'ডেলিভারি হয়েছে'], ['paid', 'Paid', 'টাকা এসেছে']];
  const CHIPS2 = [['returned', 'Returned', 'ফেরত'], ['cancelled', 'Cancelled', 'বাতিল'], ['bulk', 'Bulk / corporate', 'বাল্ক / কর্পোরেট']];
  function stOk(o, s) {
    if (s === 'all') return true;
    if (s === 'confirmedAll') return !!o.cBy && o.status !== 'cancelled';
    if (s === 'bulk') return false;
    return dstat(o) === s;
  }
  function renderAll(el, r) {
    if (r.id) { const o = A.byId(A.D.orders, r.id); if (o) return renderOrder(el, o); }
    let list = A.D.orders.slice();
    if (F.batch) list = list.filter(inBatch);
    list = list.filter((o) => inSel(F, o.created));
    const base = list;
    if (F.q) { const q = F.q.toLowerCase(); list = list.filter((o) => o.id.toLowerCase().includes(q) || o.name.toLowerCase().includes(q) || o.phone.includes(q) || o.district.toLowerCase().includes(q)); }
    if (F.pay) list = list.filter((o) => o.payment === F.pay);
    list = list.filter((o) => stOk(o, F.st));
    if (F.stuck) list = list.filter(stuckWhy);
    if (F.sort === 'old') list.reverse(); else if (F.sort === 'value') list.sort((a, b) => b.total - a.total); else if (F.sort === 'score') list.sort((a, b) => score(a).total - score(b).total);
    const cnt = (s) => base.filter((o) => stOk(o, s)).length;
    const rows = list.slice(0, F.limit).map((o) => Object.assign({ _id: o.id }, { o }));
    const value = A.sum(list.filter((o) => o.status !== 'cancelled'), (o) => o.total);
    el.innerHTML = A.pageHead(t('All orders', 'সব অর্ডার'), t(`${list.length} orders · ${tk(value)}`, `${list.length}টি অর্ডার · ${tk(value)}`), `<button class="btn" id="a-exp">${A.icon('down')} ${t('Export', 'এক্সপোর্ট')}</button><button class="btn" id="a-bulk">${A.icon('plus')} ${t('New bulk order', 'নতুন বাল্ক অর্ডার')}</button><button class="btn primary" id="a-new">${A.icon('plus')} ${t('Phone order', 'ফোন অর্ডার')}</button>`) + A.tabsBar('orders', 'all') + `
      ${F.batch ? `<div class="callout info" style="margin-bottom:10px">${A.icon('info')}<div class="row between" style="flex:1;flex-wrap:wrap;gap:8px"><span>${t(`Showing the current batch only (not yet handed to the courier)${F.stuck ? ' · stuck orders' : ''}`, `শুধু চলতি ব্যাচ দেখাচ্ছে (এখনো কুরিয়ারকে দেওয়া হয়নি)${F.stuck ? ' · আটকে থাকা' : ''}`)}</span><button class="btn sm" id="a-allb">${t('Show all orders', 'সব অর্ডার দেখুন')}</button></div></div>` : ''}
      <div class="chips" id="a-chips">${CHIPS.map((c) => `<button class="chip ${F.st === c[0] ? 'on' : ''}" data-st="${c[0]}">${t(c[1], c[2])} <span class="muted">${cnt(c[0])}</span></button>`).join('')}<span class="muted small" style="align-self:center">|</span>${CHIPS2.map((c) => `<button class="chip ${F.st === c[0] ? 'on' : ''}" data-st="${c[0]}">${t(c[1], c[2])} <span class="muted">${c[0] === 'bulk' ? R2().bulk.length : cnt(c[0])}</span></button>`).join('')}</div>
      ${F.st === 'bulk' ? '<div style="height:10px"></div>' + bulkView() : `${dateBar(F, 'a-dr')}<div class="ord-filters"><input class="inp" id="a-q" placeholder="${t('Search order, name, phone, district', 'অর্ডার, নাম, ফোন, জেলা খুঁজুন')}" value="${esc(F.q)}">
        ${U.select('a-pay', [['', t('Any payment', 'যেকোনো পেমেন্ট')], ['COD', 'COD'], ['bKash', 'bKash'], ['Nagad', 'Nagad'], ['Card', t('Card', 'কার্ড')]], F.pay)}
        ${U.select('a-sort', [['new', t('Newest first', 'নতুন আগে')], ['old', t('Oldest first', 'পুরনো আগে')], ['value', t('Highest value', 'বেশি টাকা আগে')], ['score', t('Lowest score', 'কম স্কোর আগে')]], F.sort)}</div>
      <div style="height:10px"></div>
      ${U.table([
        { h: t('Order', 'অর্ডার'), f: (x) => `<b class="mono">${esc(x.o.id)}</b><div class="ord-sub">${A.fmt.date(x.o.created)} · ${A.fmt.time(x.o.created)}</div>` },
        { h: t('Customer', 'কাস্টমার'), f: (x) => `<div class="ellip" style="max-width:150px">${esc(x.o.name)}</div><div class="ord-sub">${esc(x.o.district)}</div>` },
        { h: t('Items', 'আইটেম'), hide: true, f: (x) => itemsCell(x.o) },
        { h: t('Total', 'মোট'), r: true, f: (x) => `<b>${tk(x.o.total)}</b><div class="ord-sub">${esc(x.o.payment)}</div>` },
        { h: t('Score', 'স্কোর'), r: true, hide: true, f: (x) => { const sc = score(x.o); return `<b style="color:var(--${scoreTone(sc)})">${sc.none ? '—' : sc.total.toFixed(1)}</b>`; } },
        { h: t('Status', 'স্ট্যাটাস'), f: (x) => dBadge(x.o) + (stuckWhy(x.o) ? ' ' + U.badge(t(STUCK[stuckWhy(x.o)][0], STUCK[stuckWhy(x.o)][1]), STUCK[stuckWhy(x.o)][2]) : '') + (fromLast(x.o) ? ` <span class="o2-tag last">${t('From last batch', 'আগের ব্যাচের')}</span>` : '') },
      ], rows, { onRow: true, empty: t('No orders match these filters.', 'এই ফিল্টারে কোনো অর্ডার নেই।') })}
      ${list.length > F.limit ? `<div style="text-align:center;margin-top:10px"><button class="btn" id="a-more">${t(`Show more (${list.length - F.limit} left)`, `আরও দেখুন (${list.length - F.limit}টি বাকি)`)}</button></div>` : ''}`}`;
    el.querySelector('#a-bulk').onclick = bulkDrawer;
    if (F.st === 'bulk') { el.querySelectorAll('#a-chips [data-st]').forEach((b) => (b.onclick = () => { F.st = b.dataset.st; F.stuck = false; F.limit = 40; A.render(); })); const ab = el.querySelector('#a-allb'); if (ab) ab.onclick = () => { F.batch = false; A.render(); }; el.querySelector('#a-new').onclick = phoneOrderModal; el.querySelector('#a-exp').onclick = () => U.download(`bulk-orders-${A.fmt.ymd(A.TODAY)}.xlsx`); return bulkWire(el); }
    el.querySelectorAll('#a-chips [data-st]').forEach((b) => (b.onclick = () => { F.st = b.dataset.st; F.stuck = false; F.limit = 40; A.render(); }));
    const q = el.querySelector('#a-q'); q.oninput = A.debounce ? A.debounce(() => { F.q = q.value; A.render(); setTimeout(() => { const n = document.querySelector('#a-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 0); }, 250) : () => {};
    if (!A.debounce) q.onchange = () => { F.q = q.value; A.render(); };
    dateWire(el, F, 'a-dr');
    el.querySelector('#a-pay').onchange = (e) => { F.pay = e.target.value; A.render(); };
    el.querySelector('#a-sort').onchange = (e) => { F.sort = e.target.value; A.render(); };
    const allb = el.querySelector('#a-allb'); if (allb) allb.onclick = () => { F.batch = false; F.stuck = false; if (F.st === 'confirmedAll') F.st = 'all'; A.render(); };
    const more = el.querySelector('#a-more'); if (more) more.onclick = () => { F.limit += 60; A.render(); };
    el.querySelector('#a-new').onclick = phoneOrderModal;
    el.querySelector('#a-exp').onclick = () => U.download(`orders-${A.fmt.ymd(A.TODAY)}.xlsx`);
    el.querySelectorAll('tr[data-row]').forEach((tr) => (tr.onclick = () => A.go('orders', 'all', tr.dataset.row)));
  }

  /* ================= ORDER PAGE ================= */
  const TEMPL = [
    ['received', 'Order received', 'অর্ডার পেয়েছি', (o) => [`EXTAS: Dear ${o.name}, we got your order ${o.id} (${tk(o.total)}). We will confirm it soon.`, `EXTAS: প্রিয় ${o.name}, আপনার অর্ডার ${o.id} (${tk(o.total)}) পেয়েছি। শিগগিরই কনফার্ম করব।`]],
    ['confirmed', 'Order confirmed', 'অর্ডার কনফার্ম', (o) => [`EXTAS: Your order ${o.id} is confirmed and will reach you in 1-3 days.`, `EXTAS: আপনার অর্ডার ${o.id} কনফার্ম হয়েছে, 1-3 দিনে পৌঁছে যাবে।`]],
    ['call', 'Could not reach you', 'ফোনে পাইনি', (o) => [`EXTAS: We tried to call about order ${o.id}. Please call us back at ${A.D.store.phone} or reply YES to confirm.`, `EXTAS: অর্ডার ${o.id} নিয়ে কল দিয়েছিলাম। ${A.D.store.phone} নম্বরে কল দিন বা কনফার্ম করতে YES লিখুন।`]],
    ['advance', 'Ask delivery charge in advance', 'ডেলিভারি চার্জ অগ্রিম চান', (o) => [`EXTAS: Please send ${tk(advanceAmount(o))} by bKash to ${A.D.rules.wallets.bkash} with reference ${o.id}. We ship as soon as it arrives.`, `EXTAS: অনুগ্রহ করে ${tk(advanceAmount(o))} বিকাশে ${A.D.rules.wallets.bkash} নম্বরে পাঠান, রেফারেন্স ${o.id}। টাকা এলেই পাঠিয়ে দেব।`]],
    ['shipped', 'With courier', 'কুরিয়ারে আছে', (o) => [`EXTAS: Your order ${o.id} is with ${cname(o.courier) || 'the courier'} (${o.tracking || '—'}). Please keep ${tk(o.paid ? 0 : o.total)} ready.`, `EXTAS: আপনার অর্ডার ${o.id} ${cname(o.courier) || 'কুরিয়ার'}-এ আছে (${o.tracking || '—'})। ${tk(o.paid ? 0 : o.total)} রেডি রাখুন।`]],
    ['thanks', 'Thank you + exchange', 'ধন্যবাদ + এক্সচেঞ্জ', (o) => [`EXTAS: Thank you ${o.name}! Wrong size? Ask for an exchange within ${OF().exHours} hours from your order page.`, `EXTAS: ধন্যবাদ ${o.name}! সাইজ মেলেনি? ${OF().exHours} ঘণ্টার মধ্যে অর্ডার পেজ থেকে এক্সচেঞ্জ চান।`]],
  ];
  function messageModal(o) {
    let ch = 'sms'; const c = cust(o) || {};
    const def = { new: 'call', confirmed: 'confirmed', booked: 'confirmed', packed: 'confirmed', shipped: 'shipped', delivered: 'thanks' }[o.status] || 'received';
    const m = U.modal(t('Send message', 'মেসেজ পাঠান'), `${U.seg('mm-ch', [['sms', 'SMS'], ['wa', 'WhatsApp'], ['email', t('Email', 'ইমেইল')]], ch)}
      <div style="height:10px"></div>${U.field(t('To', 'যাকে'), `<div class="strong" id="mm-to">${esc(o.name)} · ${esc(o.phone)}</div>`)}
      ${U.field(t('Template', 'টেমপ্লেট'), U.select('mm-tp', TEMPL.map((x) => [x[0], t(x[1], x[2])]), def))}
      ${U.field(t('Message', 'মেসেজ'), `<textarea class="inp" id="mm-tx" rows="4"></textarea>`, `<span id="mm-cost"></span>`)}`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="mm-ok">${A.icon('send')} ${t('Send', 'পাঠান')}</button>` });
    const fill = () => { const tp = TEMPL.find((x) => x[0] === m.querySelector('#mm-tp').value); m.querySelector('#mm-tx').value = t(...tp[3](o)); m.querySelector('#mm-to').textContent = ch === 'email' ? (c.email || t('No email saved — add one on the customer', 'ইমেইল নেই — কাস্টমারে যোগ করুন')) : o.name + ' · ' + o.phone; m.querySelector('#mm-cost').textContent = ch === 'sms' ? t('About 1 SMS · ৳0.35', 'প্রায় 1টি SMS · ৳0.35') : ch === 'wa' ? t('WhatsApp template · ৳0.90', 'WhatsApp টেমপ্লেট · ৳0.90') : t('Free', 'ফ্রি'); };
    m.querySelectorAll('#mm-ch button').forEach((b) => (b.onclick = () => { ch = b.dataset.v; m.querySelectorAll('#mm-ch button').forEach((x) => x.classList.toggle('on', x === b)); fill(); }));
    m.querySelector('#mm-tp').onchange = fill; fill();
    m.querySelector('#mm-ok').onclick = () => { if (ch === 'email' && !c.email) { A.toast(t('No email saved for this customer', 'এই কাস্টমারের ইমেইল নেই'), 'bad'); return; } const nm = { sms: 'SMS', wa: 'WhatsApp', email: 'Email' }[ch]; const txt = m.querySelector('#mm-tx').value; tl(o, `${nm} sent: ${txt}`, `${nm} গেছে: ${txt}`); U.close(); A.commit(`${nm} sent for ${o.id}`); A.toast(t(`${nm} sent`, `${nm} পাঠানো হয়েছে`), 'good'); A.render(); };
  }
  function open360(c, panel) {
    if (!c) return;
    if (!panel) { const w = window.open(location.pathname + A.href('customers', 'all', c.id), '_blank'); if (!w) A.go('customers', 'all', c.id); return; }
    const os = A.D.orders.filter((x) => x.customerId === c.id);
    U.drawer(t('Customer 360', 'কাস্টমার 360'), `<h3 style="margin:0">${esc(c.name)}</h3><div class="muted small">${esc(c.phone)} · ${esc(c.district)}</div><div style="height:10px"></div>${lifeGrid(c)}<div style="height:12px"></div><div class="o2-prev">${os.map(prevItem).join('')}</div>`, { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button><a class="btn primary" href="${A.href('customers', 'all', c.id)}" target="_blank">${A.icon('ext')} ${t('Open full page', 'পুরো পেজ খুলুন')}</a>` });
  }
  function life(c) {
    const os = A.D.orders.filter((x) => x.customerId === c.id && x.status !== 'cancelled');
    const del = os.filter(C.isDelivered);
    return { orders: os.length, pieces: A.sum(os, C.pieces), mrp: A.sum(os, (o) => A.sum(o.lines, (l) => { const p = prod(l.pid); return (p && p.compareAt > l.price ? p.compareAt : l.price) * l.qty; })), disc: A.sum(os, (o) => o.discount + A.sum(o.lines, (l) => { const p = prod(l.pid); return p && p.compareAt > l.price ? (p.compareAt - l.price) * l.qty : 0; })), delivered: A.sum(del, (o) => o.total), collected: A.sum(del.filter((o) => o.settled || o.payment !== 'COD'), (o) => o.total), returns: os.filter((o) => o.status === 'returned').length, exch: os.filter((o) => o.status === 'exchanged' || o.exchange).length, aov: os.length ? A.sum(os, (o) => o.total) / os.length : 0, profit: A.sum(del, C.orderProfit) };
  }
  function lifeGrid(c) {
    const L = life(c);
    const it = (en, bn, v) => `<div><span>${t(en, bn)}</span><b>${v}</b></div>`;
    return `<div class="o2-life">${it('Orders', 'অর্ডার', L.orders)}${it('Pieces', 'পিস', L.pieces)}${it('MRP value', 'MRP মূল্য', tk(L.mrp))}${it('Discount received', 'ছাড় পেয়েছেন', tk(L.disc))}${it('Delivered value', 'ডেলিভারি মূল্য', tk(L.delivered))}${it('Collected', 'টাকা এসেছে', tk(L.collected))}${it('Returns', 'রিটার্ন', L.returns)}${it('Exchanges', 'এক্সচেঞ্জ', L.exch)}${it('Average order', 'গড় অর্ডার', tk(L.aov))}<div><span>${t('Profit', 'লাভ')} ${U.badge(t('Owner', 'মালিক'), 'dark')}</span><b>${tk(L.profit)}</b></div></div>`;
  }
  function prevItem(o) {
    return `<details><summary><b class="mono">${esc(o.id)}</b><span class="muted small">${A.fmt.dateY(o.created)}</span>${dBadge(o)}<span style="margin-left:auto"><b>${tk(o.total)}</b></span></summary><div style="margin-top:8px">${o.lines.map((l) => `<div class="row" style="gap:8px;padding:3px 0">${dot(l.color)}<span class="grow ellip" style="flex:1;min-width:0">${esc(l.name)}</span><span class="o2-size" style="height:22px;min-width:28px;font-size:12px">${esc(l.size)}</span><span class="small">×${l.qty}</span></div>`).join('')}<div class="row between small muted" style="margin-top:4px"><span>${esc(o.payment)} · ${esc(cname(o.courier) || '—')}</span><a href="${A.href('orders', 'all', o.id)}">${t('Open', 'খুলুন')} →</a></div></div></details>`;
  }
  function grade(c) {
    const L = life(c);
    if (c.refused > 1) return [t('Watch', 'সাবধান'), 'bad'];
    if (L.delivered >= 15000 || c.delivered >= 6) return [t('Gold', 'গোল্ড'), 'accent'];
    if (L.delivered >= 5000 || c.delivered >= 3) return [t('Silver', 'সিলভার'), 'info'];
    if (c.delivered >= 1) return [t('Regular', 'নিয়মিত'), 'good'];
    return [t('New', 'নতুন'), ''];
  }

  function renderOrder(el, o) {
    const c = cust(o) || { id: '', name: o.name, phone: o.phone, email: '', delivered: 0, refused: 0 };
    const g = grade(c); const d = decide(o); const sw = stuckWhy(o); const pp = profitParts(o);
    const prev = A.D.orders.filter((x) => x.customerId === o.customerId && x.id !== o.id);
    const S7 = ['new', 'processing', 'confirmed', 'booked', 'packed', 'shipped', 'delivered', 'paid'];
    const cur = S7.indexOf(dstat(o));
    const steps = `<div class="steps ord-steps">${S7.map((s, i) => `<div class="st ${i < cur ? 'done' : i === cur ? 'on' : ''}">${t(DST[s][0], DST[s][1])}</div>`).join('')}</div>`;
    const acts = [];
    if (o.status === 'new') {
      acts.push(`<button class="btn primary" data-a="confirm">${A.icon('check')} ${t('Approve', 'অ্যাপ্রুভ')}</button>`, `<button class="btn" data-a="noans">${A.icon('phone')} ${t('No answer', 'ফোন ধরেননি')}</button>`);
      if (o.advanceAsked && !o.advancePaid) acts.push(`<button class="btn" data-a="advpaid">${t('Advance received', 'অ্যাডভান্স এসেছে')}</button>`); else if (!o.paid) acts.push(`<button class="btn" data-a="adv">${t('Ask for advance', 'অ্যাডভান্স চান')}</button>`);
    }
    if (['new', 'confirmed'].includes(o.status) && dupes(o).length) acts.push(`<button class="btn" data-a="merge">${t('Merge', 'মার্জ')}</button>`);
    if (o.status === 'confirmed') acts.push(`<button class="btn primary" data-a="book">${A.icon('truck')} ${t('Book courier', 'কুরিয়ার বুক')}</button>`);
    if (o.status === 'booked') acts.push(`<button class="btn primary" data-a="sticker">${A.icon('print')} ${t('Print sticker', 'স্টিকার প্রিন্ট')}</button>`);
    if (o.status === 'packed') acts.push(`<button class="btn" data-a="reprint">${A.icon('print')} ${t('Print again (PIN)', 'আবার প্রিন্ট (PIN)')}</button>`);
    if (o.status === 'shipped') acts.push(`<button class="btn primary" data-a="deliv">${t('Delivered', 'ডেলিভারি হয়েছে')}</button>`, `<button class="btn" data-a="partial">${t('Partial at the door', 'দরজায় আংশিক')}</button>`, `<button class="btn" data-a="refused">${t('Refused at the door', 'দরজায় নেননি')}</button>`);
    if (o.status === 'delivered' && ageH(o.deliveredAt) < OF().exHours && !o.exchange) acts.push(`<button class="btn" data-a="exreq">${t('Size exchange', 'সাইজ এক্সচেঞ্জ')}</button>`);
    if (o.status === 'delivered' && !o.replacement && o.channel !== 'Replacement') acts.push(`<button class="btn" data-a="defect">${t('Defective / wrong item', 'ত্রুটিপূর্ণ / ভুল আইটেম')}</button>`);
    if (o.status === 'delivered' && o.payment === 'COD' && !o.overcharge) acts.push(`<button class="btn ghost" data-a="over">${t('Rider took extra', 'রাইডার বেশি নিয়েছেন')}</button>`);
    if (['new', 'confirmed'].includes(o.status)) acts.push(`<button class="btn" data-a="edit">${A.icon('edit')} ${t('Edit items', 'আইটেম এডিট')}</button>`);
    if (['new', 'confirmed', 'booked', 'packed'].includes(o.status)) acts.push(`<button class="btn ghost" data-a="cancel">${t(['booked', 'packed'].includes(o.status) ? 'Cancel order (and at the courier)' : 'Cancel order', ['booked', 'packed'].includes(o.status) ? 'অর্ডার বাতিল (কুরিয়ারেও)' : 'অর্ডার বাতিল')}</button>`);
    acts.push(`<button class="btn" data-a="msg">${A.icon('send')} ${t('Send message', 'মেসেজ পাঠান')}</button>`, `<button class="btn" data-a="inv">${t('Invoice', 'ইনভয়েস')}</button>`);
    const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address);
    el.innerHTML = A.pageHead(`${esc(o.id)} ${dBadge(o)}`, t(`${A.fmt.dateY(o.created)} · ${A.fmt.time(o.created)} · from ${o.channel}`, `${A.fmt.dateY(o.created)} · ${A.fmt.time(o.created)} · ${o.channel} থেকে`), `<a class="btn" href="${A.href('orders', 'all')}">← ${t('All orders', 'সব অর্ডার')}</a>`) + `
      ${U.card('', `<div class="o2-cust"><div style="flex:1;min-width:220px"><div class="row" style="gap:8px;flex-wrap:wrap"><h2>${esc(o.name)}</h2>${U.badge(g[0], g[1])}${fromLast(o) ? `<span class="o2-tag last">${t('From last batch', 'আগের ব্যাচের')}</span>` : ''}</div>
          <div class="o2-cl">${A.icon('phone')}<b class="mono">${esc(o.phone)}</b><a class="btn sm" href="tel:${esc(o.phone)}">${t('Call', 'কল')}</a><button class="btn sm" data-copy="${esc(o.phone)}">${t('Copy', 'কপি')}</button></div>
          <div class="o2-cl">${A.icon('home')}<span class="ellip">${esc(o.address)}</span><a class="btn sm" href="${mapUrl}" target="_blank" rel="noopener">${t('Map', 'ম্যাপ')}</a><button class="btn sm" data-copy="${esc(o.address)}">${t('Copy', 'কপি')}</button></div>
          <div class="o2-cl">${A.icon('send')}<span class="ellip">${esc(c.email || t('No email', 'ইমেইল নেই'))}</span>${c.email ? `<button class="btn sm" data-copy="${esc(c.email)}">${t('Copy', 'কপি')}</button>` : ''}</div></div>
        <div class="stack" style="gap:6px;align-items:flex-end"><button class="btn dark" id="o-360">${A.icon('ext')} ${t('Customer 360', 'কাস্টমার 360')}</button><button class="btn sm ghost" id="o-360p">${t('Open in side panel', 'পাশের প্যানেলে খুলুন')}</button></div></div>`)}
      <div style="height:12px"></div>
      ${U.card('', steps + `<div class="row" style="flex-wrap:wrap;gap:8px;margin-top:12px">${acts.join('')}</div>${o.status === 'new' ? `<div style="margin-top:10px">${U.callout(`<b>${d.k === 'auto' ? t('Rules would confirm this', 'নিয়মে এটি কনফার্ম হবে') : d.k === 'red' ? t('Red tag — a person decides', 'লাল ট্যাগ — মানুষ ঠিক করবেন') : t('Call list', 'কল লিস্ট')}:</b> ${esc(t(d.en, d.bn))}${sw ? ' · ' + esc(stuckLine(o)) : ''}`, d.k === 'red' ? 'bad' : 'warn', 'info')}</div>` : ''}${o.partialAtDoor ? `<div style="margin-top:10px">${U.callout(t('The courier says the customer kept part of this parcel. Fill the partial delivery box.', 'কুরিয়ার বলছে কাস্টমার পার্সেলের কিছু অংশ রেখেছেন। আংশিক ডেলিভারির বক্স পূরণ করুন।'), 'warn', 'warn')}</div>` : ''}${o.replacement ? `<div style="margin-top:10px">${U.callout(t(`Replacement sent free as <a href="${A.href('orders', 'all', o.replacement.newOid)}">${esc(o.replacement.newOid)}</a> · ${esc(o.replacement.note)} · old piece due back by ${A.fmt.date(o.replacement.backBy)}.`, `ফ্রি রিপ্লেসমেন্ট গেছে <a href="${A.href('orders', 'all', o.replacement.newOid)}">${esc(o.replacement.newOid)}</a> · ${esc(o.replacement.note)} · পুরনো পিস ${A.fmt.date(o.replacement.backBy)}-এর মধ্যে ফেরত আসবে।`), 'info', 'info')}</div>` : ''}${o.linkedTo && o.channel === 'Replacement' ? `<div style="margin-top:10px">${U.callout(t(`Free replacement for <a href="${A.href('orders', 'all', o.linkedTo)}">${esc(o.linkedTo)}</a> — the customer pays nothing.`, `<a href="${A.href('orders', 'all', o.linkedTo)}">${esc(o.linkedTo)}</a>-এর ফ্রি রিপ্লেসমেন্ট — কাস্টমার কিছু দেবেন না।`), 'info', 'info')}</div>` : ''}${o.overcharge ? `<div style="margin-top:10px">${U.callout(t(`Rider took ${tk(o.overcharge.amount)} extra — returned to the customer’s wallet ${A.fmt.ago(o.overcharge.at)} (PIN, logged). The claim is in With courier › Claims.`, `রাইডার ${tk(o.overcharge.amount)} বাড়তি নিয়েছিলেন — ${A.fmt.ago(o.overcharge.at)} কাস্টমারের ওয়ালেটে ফেরত (PIN, লগ করা)। ক্লেইম আছে কুরিয়ারে › ক্লেইম-এ।`), 'warn', 'warn')}</div>` : ''}`)}
      ${courierBlock(o)}
      <div style="height:12px"></div>
      <div class="o2-two"><div class="stack" style="gap:12px">
        ${U.card(t(`Products (${pcsTxt(C.pieces(o))})`, `প্রোডাক্ট (${pcsTxt(C.pieces(o))})`), holdLine(o) + o.lines.map((l) => { const p = prod(l.pid) || { cat: 'polo', styleCode: '' }; const v = variant(l); return `<div class="o2-pl">${U.thumb({ colors: [l.color], cat: p.cat }, 56)}<div class="grow"><b class="ellip" style="display:block">${esc(l.name)}</b><div class="row" style="gap:8px;margin-top:4px;flex-wrap:wrap">${dot(l.color)}<span class="strong">${esc(l.color)}</span><span class="o2-size">${esc(l.size)}</span><span class="small muted mono">${esc(l.sku)}</span></div><div class="ord-sub" style="margin-top:3px">${v ? t(`${v.stock} in stock · ${v.reserved || 0} held`, `${v.stock} স্টকে · ${v.reserved || 0} হোল্ড`) : ''}</div></div><div class="r"><b>${tk(l.price * l.qty)}</b><div class="ord-sub">${l.qty} × ${tk(l.price)}</div></div></div>`; }).join('') + `<div class="ord-money" style="margin-top:8px"><div class="li"><span class="grow">${t('Subtotal', 'সাবটোটাল')}</span><b>${tk(o.subtotal)}</b></div>${o.discount ? `<div class="li"><span class="grow">${t('Discount', 'ছাড়')} ${o.coupon ? '(' + esc(o.coupon) + ')' : ''}</span><b>−${tk(o.discount)}</b></div>` : ''}<div class="li"><span class="grow">${t('Delivery', 'ডেলিভারি')}</span><b>${o.delivery ? tk(o.delivery) : t('Free', 'ফ্রি')}</b></div><div class="li tot"><span class="grow">${t('Total', 'মোট')} · ${esc(o.payment)}${o.paid ? ' ✓' : ''}</span><b>${tk(o.total)}</b></div></div>`)}
        ${adjustCard(o)}
        ${U.card(t('Profit on this order', 'এই অর্ডারে লাভ'), `<div class="ord-money">${[['Sale', 'বিক্রি', pp.sale], ['Buying price (ERP)', 'কেনা দাম (ERP)', -pp.cogs], ['Courier', 'কুরিয়ার', -pp.courier], ['COD charge', 'COD চার্জ', -pp.cod], ['Packaging', 'প্যাকেজিং', -pp.pack], ['Payment fee', 'পেমেন্ট ফি', -pp.gw]].filter((x) => x[2]).map((x) => `<div class="li"><span class="grow">${t(x[0], x[1])}</span><span>${x[2] < 0 ? '−' + tk(-x[2]) : tk(x[2])}</span></div>`).join('')}<div class="li tot"><span class="grow">${t('Profit if delivered', 'ডেলিভারি হলে লাভ')}</span><b style="color:var(--${pp.profit > 0 ? 'good' : 'bad'})">${tk(pp.profit)} · ${A.fmt.pct(pp.sale ? pp.profit / pp.sale * 100 : 0)}</b></div></div>`, { sub: t('Owner only', 'শুধু মালিক') })}
        ${U.card(t('Timeline', 'টাইমলাইন'), `<div class="timeline">${o.timeline.slice().reverse().map((e) => `<div class="tl"><b>${tlText(e)}</b><span class="muted small">${A.fmt.dt ? A.fmt.dt(e.t) : A.fmt.date(e.t)} · ${esc(e.by)}</span></div>`).join('')}</div><div class="row" style="gap:8px;margin-top:10px"><input class="inp" id="o-note" placeholder="${t('Add a staff note', 'স্টাফ নোট লিখুন')}"><button class="btn" id="o-note-b">${t('Add', 'যোগ')}</button></div>`)}
      </div><div class="stack" style="gap:12px">
        ${U.card(t('Courier score', 'কুরিয়ার স্কোর'), scorePanel(o))}
        ${U.card(t('Lifetime', 'সব মিলিয়ে'), lifeGrid(c))}
        ${U.card(t(`Previous orders (${prev.length})`, `আগের অর্ডার (${prev.length})`), prev.length ? `<div class="o2-prev">${prev.slice(0, 8).map(prevItem).join('')}</div>` : U.empty(t('First order from this customer.', 'এই কাস্টমারের প্রথম অর্ডার।')))}
      </div></div>`;
    el.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => U.copy(b.dataset.copy)));
    el.querySelector('#o-360').onclick = () => open360(c, false);
    el.querySelector('#o-360p').onclick = () => open360(c, true);
    el.querySelector('#o-note-b').onclick = () => { const v = el.querySelector('#o-note').value.trim(); if (!v) return; tl(o, 'Note: ' + v, 'নোট: ' + v); A.commit(`Note on ${o.id}`); A.toast(t('Note added', 'নোট যোগ হয়েছে'), 'good'); A.render(); };
    el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => act(o, b.dataset.a)));
    el.querySelectorAll('[data-adj]').forEach((b) => (b.onclick = () => adjustModal(o, b.dataset.adj)));
    el.querySelectorAll('[data-ct]').forEach((b) => (b.onclick = () => openTrack(o)));
  }
  function adjustCard(o) {
    const c = cust(o); const wal = c ? Math.max(0, c.wallet || 0) : 0; const live = ['new', 'confirmed', 'booked', 'packed'].includes(o.status); const ap = o.adj || [];
    return U.card(t('Adjust price', 'দাম বদল'), (live ? `<div class="ord-adj"><button class="btn sm" data-adj="amount">৳ ${t('Amount off', 'টাকা ছাড়')}</button><button class="btn sm" data-adj="percent">% ${t('off', 'ছাড়')}</button>${wal > 0 ? `<button class="btn sm" data-adj="wallet">${t('Use wallet', 'ওয়ালেট ব্যবহার')} · ${tk(wal)}</button>` : ''}${o.delivery && !ap.some((a) => a.kind === 'freedel') ? `<button class="btn sm" data-adj="freedel">${t('Free delivery', 'ফ্রি ডেলিভারি')}</button>` : ''}</div>` : `<p class="small muted" style="margin:0">${t('The price is locked once the parcel is with the courier.', 'পার্সেল কুরিয়ারের কাছে গেলে দাম আর বদলানো যায় না।')}</p>`) + (ap.length ? `<div style="margin-top:10px">${ap.map((a) => `<div class="o2-li"><span class="grow small"><b>${t(ADJ_K[a.kind][0], ADJ_K[a.kind][1])}${a.kind === 'percent' ? ' ' + a.value + '%' : ''}</b> · ${esc(a.why)}${a.note ? ' (' + esc(a.note) + ')' : ''}<div class="ord-sub">${esc(a.by)} · ${A.fmt.ago(a.at)}${a.pin ? ' · PIN' : ''}</div></span><b>−${tk(a.amount)}</b></div>`).join('')}</div>` : `<p class="small muted" style="margin:10px 0 0">${t('No adjustment yet.', 'এখনো কোনো বদল নেই।')}</p>`), { sub: t('Reason required, logged on the timeline. Above your limit needs the owner PIN.', 'কারণ লাগে, টাইমলাইনে লগ হয়। সীমার বেশি হলে মালিকের PIN লাগে।') });
  }
  function courierBlock(o) {
    if (!o.courier || !o.tracking || !['booked', 'packed', 'shipped', 'delivered', 'returned', 'exchanged'].includes(o.status)) return '';
    const handed = ['shipped', 'delivered', 'returned', 'exchanged'].includes(o.status);
    return `<div style="height:12px"></div>` + U.card(t('Courier', 'কুরিয়ার'), `<div class="grid g3"><div><div class="small muted">${t('Shop step', 'শপের ধাপ')}</div><div style="margin-top:4px">${dBadge(o)}</div></div><div><div class="small muted">${t('Courier status', 'কুরিয়ারের স্ট্যাটাস')}</div><div style="margin-top:4px">${handed ? (cBadge(o) || U.badge(t('Handed over', 'কুরিয়ারকে দেওয়া'), 'warn')) : U.badge(t('Sent to courier', 'কুরিয়ারে পাঠানো হয়েছে'), 'info')}</div></div><div><div class="small muted">${esc(cname(o.courier))}</div><div class="mono strong" style="margin-top:4px">${esc(o.tracking)}</div></div></div>${handed && cApi() ? `<div style="margin-top:10px"><button class="btn sm" data-ct="${o.id}">${A.icon('truck')} ${t('Tracking history', 'ট্র্যাকিং হিস্ট্রি')}</button></div>` : ''}`);
  }

  /* ---------- actions shared by pages ---------- */
  function act(o, a, after) {
    const done = (msg, toast) => { A.commit(msg); A.toast(toast, 'good'); (after || A.render)(); };
    if (a === 'confirm') { if (noStock(o)) return stockModal(o, after); doConfirm(o, 'staff'); return done(`Confirmed ${o.id}`, t(`${o.id} confirmed · stock held · booked with ${cname(o.courier)}`, `${o.id} কনফার্ম · স্টক হোল্ড · ${cname(o.courier)}-এ বুক`)); }
    if (a === 'noans') { logCall(o, 'noanswer'); o.calls = (o.calls || 0) + 1; tl(o, `Called — no answer (${o.calls})`, `কল দেওয়া হয়েছে — ধরেননি (${o.calls})`); if (o.calls === 1) tl(o, 'SMS sent: could not reach you', 'SMS গেছে: ফোনে পাইনি', 'System'); return done(`No answer on ${o.id}`, t('Saved. SMS sent to call back.', 'সেভ হয়েছে। কল ব্যাক করতে SMS গেছে।')); }
    if (a === 'adv') return askAdvance(o, after);
    if (a === 'advpaid') { o.advancePaid = o.advanceAsked; o.hold = false; tl(o, `Advance ${tk(o.advancePaid)} received`, `অ্যাডভান্স ${tk(o.advancePaid)} এসেছে`); if (noStock(o)) { A.commit(`Advance received on ${o.id}`); return stockModal(o, after); } doConfirm(o, 'rules', { en: 'Advance received', bn: 'অ্যাডভান্স এসেছে' }); return done(`Advance received on ${o.id}`, t('Advance received — order is Confirmed', 'অ্যাডভান্স এসেছে — অর্ডার কনফার্মড')); }
    if (a === 'merge') return mergeModal(o, after);
    if (a === 'cancel') return cancelFlow(o, after);
    if (a === 'edit') return editLinesModal(o);
    if (a === 'msg') return messageModal(o);
    if (a === 'inv') return invoiceModal(o);
    if (a === 'book') { if (!bookOrder(o, defCourier())) return; return done(`Booked ${o.id}`, t(`Booked with ${cname(o.courier)} · ${o.tracking} · sent to the courier`, `${cname(o.courier)}-এ বুক · ${o.tracking} · কুরিয়ারে পাঠানো হয়েছে`)); }
    if (a === 'sticker') return labelsModal([o]);
    if (a === 'reprint') return reprintModal(o, after);
    if (a === 'deliv') { markDelivered(o); o.partialAtDoor = null; return done(`${o.id} delivered`, t('Marked delivered', 'ডেলিভারি হয়েছে')); }
    if (a === 'refused') return reasonModal(t('Refused at the door', 'দরজায় নেননি'), RETURN_R, t('Save', 'সেভ'), (r) => { markReturned(o, r); o.partialAtDoor = null; done(`${o.id} refused at door`, t('Saved — the parcel is now in “Coming back”', 'সেভ হয়েছে — পার্সেল এখন “ফেরত আসছে”-তে')); });
    if (a === 'partial') return partialModal(o, after);
    if (a === 'defect') return startReplace(o);
    if (a === 'over') return overchargeModal(o);
    if (a === 'call') return callModal(o);
    if (a === 'exreq') { const xr = { id: 'XR' + (300 + X().exReq.length + Math.floor(hash(o.id) * 50)), oid: o.id, li: 0, reason: 'size', note: t('Asked on the phone', 'ফোনে চেয়েছেন'), at: NOW(), status: 'waiting' }; X().exReq.unshift(xr); return exchangeModal2(xr, after); }
  }
  /* ---------- stickers: print once (Booked -> Packed); a second print needs the owner PIN + a reason and is logged ---------- */
  const printLog = () => (X().printLog = X().printLog || []);
  function packOne(o) {
    if (o.status !== 'booked') return false;
    o.status = 'packed'; o.packedAt = NOW(); o.printed = 1;
    printLog().unshift({ oid: o.id, at: NOW(), by: 'You', why: 'First print', n: 1 });
    tl(o, 'Sticker printed (first print) — packed', 'স্টিকার প্রিন্ট (প্রথমবার) — প্যাকড');
    return true;
  }
  const PRINT_WHY = [['Sticker torn or smudged', 'স্টিকার ছেঁড়া বা ধেবড়ে গেছে'], ['Printer problem', 'প্রিন্টারে সমস্যা'], ['Lost sticker', 'স্টিকার হারিয়ে গেছে'], ['Other', 'অন্য কারণ']];
  function reprintModal(o, after) {
    const n = printLog().filter((x) => x.oid === o.id).length || 1;
    const m = U.modal(t('Print the sticker again?', 'স্টিকার আবার প্রিন্ট করবেন?'), `${U.callout(t(`The sticker of ${o.id} was already printed ${n} time${n > 1 ? 's' : ''}. A new print uses the same booking (${esc(o.tracking)}) — nothing is booked again. It needs your PIN and a reason, and it is saved in the print log.`, `${o.id}-এর স্টিকার আগেই ${n} বার প্রিন্ট হয়েছে। নতুন প্রিন্টে একই বুকিং (${esc(o.tracking)}) ব্যবহার হয় — নতুন করে বুক হয় না। এর জন্য PIN ও কারণ লাগে, আর প্রিন্ট লগে সেভ হয়।`), 'warn', 'warn')}
      <div style="height:10px"></div>${U.field(t('Reason', 'কারণ'), U.select('rp-why', PRINT_WHY.map((r) => [r[0], t(r[0], r[1])]), PRINT_WHY[0][0]))}
      ${U.field(t('Owner PIN', 'মালিকের PIN'), U.input('rp-pin', '', 'type="password" inputmode="numeric" maxlength="6" placeholder="••••"'), t('Any 4 digits work in this prototype.', 'এই প্রোটোটাইপে যেকোনো 4 সংখ্যা দিলেই হবে।'))}`,
    { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn dark" id="rp-ok">${A.icon('print')} ${t('Print again', 'আবার প্রিন্ট')}</button>` });
    m.querySelector('#rp-ok').onclick = () => {
      if (!/^\d{4,6}$/.test(m.querySelector('#rp-pin').value)) return A.toast(t('Type your 4-digit PIN', '4 সংখ্যার PIN দিন'), 'bad');
      const why = m.querySelector('#rp-why').value; const w = PRINT_WHY.find((r) => r[0] === why) || [why, why];
      printLog().unshift({ oid: o.id, at: NOW(), by: 'You (PIN)', why, n: n + 1 }); o.printed = n + 1;
      tl(o, `Sticker printed again (#${n + 1}) — ${why} · PIN`, `স্টিকার আবার প্রিন্ট (#${n + 1}) — ${w[1]} · PIN`);
      U.close(); A.commit(`Reprinted sticker for ${o.id}: ${why}`); labelsModal([o], true);
    };
  }
  /* ---------- cancel (after Booked the courier must hear about it too) ---------- */
  function cancelFlow(o, after) {
    const hasB = ['booked', 'packed'].includes(o.status) && o.tracking;
    const m = U.modal(t('Cancel this order?', 'অর্ডার বাতিল করবেন?'), U.field(t('Reason', 'কারণ'), U.select('rs-sel', CANCEL_R.map((r) => [r[0], t(r[0], r[1])]), CANCEL_R[0][0])) + (hasB ? `${U.callout(t(`This parcel is already booked with ${cname(o.courier)} (${esc(o.tracking)}). Tell the courier not to pick it up.`, `এই পার্সেল ${cname(o.courier)}-এ বুক করা আছে (${esc(o.tracking)})। কুরিয়ারকে জানান যেন পিকআপ না করে।`), 'warn', 'warn')}<label class="row small" style="gap:6px;margin-top:8px"><input type="checkbox" id="cx-cr" checked> ${t('Cancel at the courier too', 'কুরিয়ারেও বাতিল করুন')}</label>` : ''), { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn dark" id="rs-ok">${t('Cancel order', 'অর্ডার বাতিল')}</button>` });
    m.querySelector('#rs-ok').onclick = () => {
      const r = m.querySelector('#rs-sel').value; const atC = hasB && m.querySelector('#cx-cr').checked; U.close();
      cancelOrder(o, r, atC); A.commit(`Cancelled ${o.id}`); A.toast(atC ? t('Order cancelled · the courier is told too', 'অর্ডার বাতিল · কুরিয়ারকেও জানানো হয়েছে') : t('Order cancelled · stock released', 'অর্ডার বাতিল · স্টক ছেড়ে দেওয়া হয়েছে'), 'good'); (after || A.render)();
    };
  }
  /* ---------- the courier's pickup report: Packed -> Handed over, and a Past batch is made ---------- */
  function handOverOne(o) {
    if (o.status !== 'packed') return false;
    o.status = 'shipped'; o.handedAt = NOW(); o.enteredAt = o.handedAt;
    for (const l of o.lines) { const v = variant(l); if (v) v.stock = Math.max(0, v.stock - l.qty); }
    reserve(o, false);
    tl(o, `Courier pickup report: ${cname(o.courier)} took the parcel · ${o.tracking}`, `কুরিয়ার পিকআপ রিপোর্ট: ${cname(o.courier)} পার্সেল নিয়েছে · ${o.tracking}`, 'Courier');
    tl(o, 'ERP billed the shop at buying price ' + tk(C.cogs(o)), 'ERP কেনা দামে বিল করেছে ' + tk(C.cogs(o)), 'ERP');
    erpEv('bill', `ERP bill for ${o.id} · handed to ${cname(o.courier)} · ${tk(C.cogs(o))} at buying price`);
    return true;
  }
  function pickupReport() {
    const packed = A.D.orders.filter((o) => o.status === 'packed');
    if (!packed.length) { A.toast(t('No packed parcels waiting — nothing new in the report', 'কোনো প্যাকড পার্সেল অপেক্ষায় নেই — রিপোর্টে নতুন কিছু নেই')); return; }
    const miss = packed.length > 1 ? [packed.slice().sort((a, b) => H(a, 'mi') - H(b, 'mi'))[0].id] : [];
    const taken = packed.filter((o) => !miss.includes(o.id)); taken.forEach(handOverOne);
    const x = X(); x.courierRun = { at: NOW(), missing: miss };
    x.pastBatches = x.pastBatches || []; x.pastBatches.unshift({ no: x.batchNo++, at: NOW(), ids: taken.map((o) => o.id), missing: miss, courier: taken[0] ? taken[0].courier : '' });
    A.commit(`Courier pickup recorded: ${taken.length} handed over, ${miss.length} missing — batch ${x.batchNo - 1}`);
    A.toast(t(`Pickup recorded · ${taken.length} handed over${miss.length ? `, ${miss.length} missing` : ''} · Past batch ${x.batchNo - 1} made`, `পিকআপ রেকর্ড · ${taken.length}টি দেওয়া হয়েছে${miss.length ? `, ${miss.length}টি নেই` : ''} · আগের ব্যাচ ${x.batchNo - 1} তৈরি`), miss.length ? 'bad' : 'good');
    A.render();
  }
  /* ---------- price adjust (every order page, also on the phone): amount, % off, wallet, free delivery ---------- */
  const ADJ_WHY = [['Customer asked on the call', 'কাস্টমার কলে চেয়েছেন'], ['Price match', 'দাম মিলিয়ে দেওয়া'], ['Service problem, sorry gesture', 'সার্ভিসে সমস্যা, দুঃখপ্রকাশ'], ['Loyal customer', 'নিয়মিত কাস্টমার'], ['Other', 'অন্য কারণ']];
  const adjLimit = () => { const L = A.rulesApi && A.rulesApi.adjustLimit ? A.rulesApi.adjustLimit('Order manager') : null; if (L && (+L.amount || +L.percent)) return { pct: Math.max(1, +L.percent || 10), amt: isFinite(L.amount) ? +L.amount : 500 }; const l = A.D.set && A.D.set.limits && A.D.set.limits['Order manager']; return { pct: l && l.disc != null ? Math.max(1, +l.disc) : 10, amt: 500 }; };
  const ADJ_K = { amount: ['Amount off', 'টাকা ছাড়'], percent: ['% off', '% ছাড়'], wallet: ['Use wallet', 'ওয়ালেট ব্যবহার'], freedel: ['Free delivery', 'ফ্রি ডেলিভারি'] };
  function adjustModal(o, kind) {
    const c = cust(o); const lim = adjLimit(); const maxOff = Math.max(0, o.subtotal - o.discount);
    const wal = c ? Math.max(0, c.wallet || 0) : 0;
    const amtOf = (v) => kind === 'freedel' ? (o.delivery || 0) : kind === 'percent' ? Math.round(o.subtotal * (+v || 0) / 100) : Math.round(+v || 0);
    const inp = kind === 'amount' ? U.field(t('Amount off (৳)', 'কত টাকা ছাড় (৳)'), U.money('aj-v', '')) : kind === 'percent' ? U.field(t('Percent off (%)', 'কত % ছাড়'), `<input class="inp" id="aj-v" type="number" min="1" max="100" inputmode="numeric">`) : kind === 'wallet' ? U.field(t(`Wallet to use (balance ${tk(wal)})`, `কত ওয়ালেট ব্যবহার (ব্যালেন্স ${tk(wal)})`), U.money('aj-v', Math.min(wal, o.total))) : U.callout(t(`The delivery charge of ${tk(o.delivery)} is removed from this order.`, `এই অর্ডার থেকে ${tk(o.delivery)} ডেলিভারি চার্জ বাদ যাবে।`));
    const m = U.modal(t(ADJ_K[kind][0], ADJ_K[kind][1]) + ' · ' + o.id, `${inp}${U.field(t('Reason (required)', 'কারণ (বাধ্যতামূলক)'), U.select('aj-why', [['', t('— pick a reason —', '— কারণ বাছুন —')], ...ADJ_WHY.map((r) => [r[0], t(r[0], r[1])])], ''))}${U.field(t('Note', 'নোট'), U.input('aj-note', '', `placeholder="${t('optional', 'ঐচ্ছিক')}"`))}<div id="aj-pin"></div><div id="aj-sum" class="ord-profit"></div>`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="aj-ok">${t('Apply', 'প্রয়োগ করুন')}</button>` });
    const need = (a, v) => kind !== 'wallet' && (a > lim.amt || (kind === 'percent' && (+v || 0) > lim.pct) || (a > o.subtotal * lim.pct / 100));
    const upd = () => {
      const v = m.querySelector('#aj-v') ? m.querySelector('#aj-v').value : ''; const a = Math.min(maxOff + (kind === 'freedel' ? o.delivery : 0), amtOf(v));
      const cp = JSON.parse(JSON.stringify(o)); cp.adj = (cp.adj || []).concat([{ kind, amount: a }]); recalc(cp); const pp = profitParts(cp);
      m.querySelector('#aj-sum').innerHTML = `<div class="row between"><span>${t('Off', 'ছাড়')}</span><b>−${tk(a)}</b></div><div class="row between"><span>${t('New total', 'নতুন মোট')}</span><b>${tk(cp.total)} <span class="muted small">(${t('was', 'আগে')} ${tk(o.total)})</span></b></div><div class="row between small"><span>${t('Profit if delivered', 'ডেলিভারি হলে লাভ')}</span><span style="color:var(--${pp.profit > 0 ? 'good' : 'bad'})">${tk(pp.profit)}</span></div>`;
      m.querySelector('#aj-pin').innerHTML = need(a, v) ? U.callout(t(`This is above your limit (${tk(lim.amt)} or ${lim.pct}%). The owner PIN is needed.`, `এটি আপনার সীমার বেশি (${tk(lim.amt)} বা ${lim.pct}%)। মালিকের PIN লাগবে।`), 'warn', 'warn') + U.field(t('Owner PIN', 'মালিকের PIN'), U.input('aj-pin-in', '', 'type="password" inputmode="numeric" maxlength="6" placeholder="••••"')) : '';
    };
    m.querySelectorAll('#aj-v').forEach((e) => (e.oninput = upd)); upd();
    m.querySelector('#aj-ok').onclick = () => {
      const v = m.querySelector('#aj-v') ? m.querySelector('#aj-v').value : ''; let a = Math.min(maxOff + (kind === 'freedel' ? o.delivery : 0), amtOf(v));
      if (kind === 'wallet') a = Math.min(a, wal);
      const why = m.querySelector('#aj-why').value; if (!why) return A.toast(t('Pick a reason first', 'আগে কারণ বাছুন'), 'bad');
      if (a <= 0) return A.toast(t('Type an amount above ৳0', '৳0-এর বেশি টাকা দিন'), 'bad');
      const pin = need(a, v); if (pin && !/^\d{4,6}$/.test((m.querySelector('#aj-pin-in') || {}).value || '')) return A.toast(t('Type the owner PIN', 'মালিকের PIN দিন'), 'bad');
      const note = m.querySelector('#aj-note').value.trim(); const was = o.total;
      o.adj = (o.adj || []).concat([{ kind, value: kind === 'percent' ? +v : a, amount: a, why, note, by: 'You', at: NOW(), pin }]);
      if (kind === 'wallet' && c) { c.wallet = Math.max(0, (c.wallet || 0) - a); (A.D.loyaltyLog = A.D.loyaltyLog || []).unshift({ t: NOW(), cid: c.id, name: c.name, kind: 'wallet', amount: -a, reason: `Used on ${o.id}`, by: 'You' }); }
      recalc(o);
      const w = ADJ_WHY.find((r) => r[0] === why) || [why, why];
      tl(o, `Price adjusted — ${ADJ_K[kind][0]}${kind === 'percent' ? ' ' + v + '%' : ''} −${tk(a)} · ${why}${note ? ' (' + note + ')' : ''} · total ${tk(was)} → ${tk(o.total)}${pin ? ' · owner PIN' : ''}`, `দাম বদল — ${ADJ_K[kind][1]}${kind === 'percent' ? ' ' + v + '%' : ''} −${tk(a)} · ${w[1]}${note ? ' (' + note + ')' : ''} · মোট ${tk(was)} → ${tk(o.total)}${pin ? ' · মালিকের PIN' : ''}`);
      if (o.erp && o.erp.pushed) erpEv('order', `Sales order ${o.erp.no} price updated for ${o.id}`);
      U.close(); A.commit(`Price adjusted on ${o.id}: −${tk(a)}`); A.toast(t(`Done · new total ${tk(o.total)}`, `হয়ে গেছে · নতুন মোট ${tk(o.total)}`), 'good'); A.render();
    };
  }
  function stockModal(o, after) {
    const miss = o.lines.filter((l) => { const v = variant(l); return !v || v.stock - (v.reserved || 0) < l.qty; });
    const m = U.modal(t('No stock for this order', 'এই অর্ডারের স্টক নেই'), `${U.callout(t(`Missing: ${miss.map((l) => `${l.name} ${l.color} ${l.size}`).join(', ')}. Call the customer and pick one:`, `নেই: ${miss.map((l) => `${l.name} ${l.color} ${l.size}`).join(', ')}। কাস্টমারকে কল দিয়ে একটি বাছুন:`), 'warn', 'warn')}
      <div class="o2-tier" style="margin-top:10px">${[['wait', t(`Wait for ERP stock (up to ${OF().waitDays} days, then the rest ships)`, `ERP স্টকের অপেক্ষা (সর্বোচ্চ ${OF().waitDays} দিন, তারপর বাকিটা যাবে)`)], ['swap', t('Swap to another size or colour', 'অন্য সাইজ বা রং দিন')], ['rest', t('Send the rest now', 'বাকিটা এখনই পাঠান')], ['cancel', t('Cancel the order', 'অর্ডার বাতিল')]].filter((x) => x[0] !== 'rest' || miss.length < o.lines.length).map((x, i) => `<label><input type="radio" name="sk" value="${x[0]}" ${i ? '' : 'checked'}>${x[1]}</label>`).join('')}</div>`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="sk-ok">${t('Save', 'সেভ')}</button>` });
    m.querySelector('#sk-ok').onclick = () => {
      const v = m.querySelector('input[name=sk]:checked').value; U.close();
      if (v === 'swap') return editLinesModal(o);
      if (v === 'cancel') { cancelOrder(o, 'Out of stock'); A.commit(`Cancelled ${o.id} — no stock`); A.toast(t('Order cancelled', 'অর্ডার বাতিল'), 'good'); return (after || A.render)(); }
      if (v === 'wait') { o.stockWait = NOW(); tl(o, `Waiting for ERP stock — the rest ships after ${OF().waitDays} days`, `ERP স্টকের অপেক্ষা — ${OF().waitDays} দিন পর বাকিটা যাবে`); A.commit(`${o.id} waits for stock`); A.toast(t('Saved — it releases by itself when ERP stock arrives', 'সেভ হয়েছে — ERP স্টক এলে নিজেই ছাড়া পাবে'), 'good'); return (after || A.render)(); }
      o.lines = o.lines.filter((l) => !miss.includes(l)); recalc(o); tl(o, 'Missing items removed — sending the rest', 'না থাকা আইটেম বাদ — বাকিটা যাচ্ছে'); doConfirm(o, 'staff'); A.commit(`${o.id} confirmed without missing items`); A.toast(t('Confirmed with the items in stock', 'স্টকে থাকা আইটেম নিয়ে কনফার্ম'), 'good'); (after || A.render)();
    };
  }
  /* ---------- merge: compare side by side, pick the main order, edit the merged order, then Merge (+ call) ---------- */
  function mergeDo(main, others, lines, gone, call, after) {
    const hadR = main.rsv; if (hadR) reserve(main, false);
    for (const x of others) {
      reserve(x, false);
      if (gone[x.id]) cancelOrder(x, gone[x.id]);
      else { x.status = 'cancelled'; x.mergedInto = main.id; x.hold = false; tl(x, `Merged into ${main.id}`, `${main.id}-এ মার্জ হয়েছে`); }
    }
    main.lines = lines.map((l) => { const c = Object.assign({}, l); delete c.from; return c; }); recalc(main);
    if (hadR || main.status === 'confirmed') reserve(main, true);
    main.merged = (main.merged || []).concat(others.filter((x) => !gone[x.id]).map((x) => x.id)); main.edits = (main.edits || 0) + 1;
    const mg = others.filter((x) => !gone[x.id]).map((x) => x.id), cx = others.filter((x) => gone[x.id]).map((x) => x.id);
    tl(main, `Merged ${mg.length ? mg.join(', ') : 'nothing'} into this order${cx.length ? ' · cancelled ' + cx.join(', ') : ''} · new total ${tk(main.total)}`, `${mg.length ? mg.join(', ') : 'কিছু না'} এই অর্ডারে মার্জ${cx.length ? ' · বাতিল ' + cx.join(', ') : ''} · নতুন মোট ${tk(main.total)}`);
    if (main.erp && main.erp.pushed) erpEv('order', `Sales order ${main.erp.no} updated for ${main.id} (merged)`);
    A.commit(`Merged orders into ${main.id}`); A.toast(t(`Merged into ${main.id}`, `${main.id}-এ মার্জ হয়েছে`), 'good');
    if (call) { A.go('orders', 'all', main.id); setTimeout(() => callModal(main), 60); return; }
    if (after) after(); else A.go('orders', 'all', main.id);
  }
  function mergeModal(o, after) {
    const all = [o, ...dupes(o)].sort((a, b) => new Date(a.created) - new Date(b.created));
    if (all.length < 2) return A.toast(t('Nothing to merge with', 'মার্জ করার মতো অর্ডার নেই'), 'bad');
    if (all.some((x) => ['booked', 'packed', 'shipped'].includes(x.status))) return A.toast(t('Cannot merge: one of these orders is already Booked or Packed', 'মার্জ করা যাবে না: একটি অর্ডার আগেই বুক বা প্যাকড হয়েছে'), 'bad');
    let mainId = all[0].id, step = 1, together = true; let lines = []; const gone = {}; const add = { pid: '', color: '', size: '', qty: 1 };
    const sameAddr = all.every((x) => x.address === all[0].address);
    const live = A.D.products.filter((p) => p.status === 'live');
    const m = U.modal(t('Merge orders', 'অর্ডার মার্জ'), '<div id="mg-b"></div>', { wide: true, foot: '<div id="mg-f" class="row" style="gap:8px;justify-content:flex-end;width:100%;flex-wrap:wrap"></div>' });
    const main = () => all.find((x) => x.id === mainId);
    const others = () => all.filter((x) => x.id !== mainId);
    const stockTxt = (l) => { const v = variant(l); const left = v ? v.stock - (v.reserved || 0) : 0; return left < l.qty ? `<span style="color:var(--bad)">${t('only', 'মাত্র')} ${Math.max(0, left)} ${t('left', 'আছে')}</span>` : `${left} ${t('in stock', 'স্টকে')}`; };
    const startEdit = () => { lines = [].concat(...all.filter((x) => !gone[x.id]).map((x) => x.lines.map((l) => Object.assign({}, l, { from: x.id })))); };
    const preview = () => { const cp = JSON.parse(JSON.stringify(main())); cp.lines = lines.map((l) => Object.assign({}, l)); recalc(cp); return cp; };
    const draw = () => {
      const body = m.querySelector('#mg-b'), foot = m.querySelector('#mg-f');
      if (step === 1) {
        body.innerHTML = `<p style="margin:0 0 10px">${t(`${all.length} open orders on ${esc(o.phone)} within ${lookDays()} days. One parcel saves ${tk(C.courierFee(o) * (all.length - 1))} courier charge and one delivery charge for the customer. Pick the main order — the others merge into it.`, `${esc(o.phone)} নম্বরে ${lookDays()} দিনের মধ্যে ${all.length}টি চালু অর্ডার। এক পার্সেলে ${tk(C.courierFee(o) * (all.length - 1))} কুরিয়ার খরচ বাঁচে, কাস্টমারেরও একটি ডেলিভারি চার্জ লাগে। মূল অর্ডার বাছুন — বাকিগুলো এতে মার্জ হবে।`)}</p>
          <div class="ord-mg">${all.map((x) => `<label class="ord-mgc ${x.id === mainId ? 'on' : ''}"><div class="row between"><span class="row" style="gap:6px"><input type="radio" name="mg-main" value="${x.id}" ${x.id === mainId ? 'checked' : ''}><b class="mono">${esc(x.id)}</b></span>${dBadge(x)}</div><div class="ord-sub">${A.fmt.date(x.created)} · ${A.fmt.ago(x.created)} · ${esc(x.payment)}</div>${x.lines.map((l) => `<div class="small">${dot(l.color)} ${esc(l.name)} <b>${esc(l.size)}</b> ×${l.qty}</div>`).join('')}<div class="ord-sub ellip" title="${esc(x.address)}">${esc(x.address)}</div><div class="row between"><span class="small muted">${t('Main order', 'মূল অর্ডার')}</span><b>${tk(x.total)}</b></div></label>`).join('')}</div>
          ${sameAddr ? '' : `<div style="margin-top:12px">${U.callout(t('The addresses are different. Send together to the main order’s address, or keep them as separate parcels?', 'ঠিকানা আলাদা। মূল অর্ডারের ঠিকানায় একসাথে পাঠাবেন, নাকি আলাদা পার্সেলে রাখবেন?'), 'warn', 'warn')}<div style="margin-top:8px">${U.seg('mg-tg', [['together', t('Send together', 'একসাথে পাঠান')], ['separate', t('Send separately', 'আলাদা পাঠান')]], together ? 'together' : 'separate')}</div></div>`}`;
        foot.innerHTML = `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="mg-next">${together || sameAddr ? t('Continue', 'এগিয়ে যান') : t('Keep separate', 'আলাদা রাখুন')}</button>`;
        body.querySelectorAll('input[name=mg-main]').forEach((r) => (r.onchange = () => { mainId = r.value; draw(); }));
        body.querySelectorAll('#mg-tg button').forEach((b) => (b.onclick = () => { together = b.dataset.v === 'together'; draw(); }));
        foot.querySelector('#mg-next').onclick = () => {
          if (!sameAddr && !together) { tl(o, `Kept separate from ${all.filter((x) => x.id !== o.id).map((x) => x.id).join(', ')} — different addresses`, 'আলাদা রাখা হয়েছে — ঠিকানা আলাদা'); U.close(); A.commit(`Kept ${o.id} separate`); A.toast(t('Kept as separate parcels', 'আলাদা পার্সেলে রাখা হয়েছে'), 'good'); return (after || A.render)(); }
          step = 2; startEdit(); draw();
        };
        return;
      }
      const cp = preview();
      const lineRow = (l, i) => { const p = prod(l.pid); const cols = p ? p.colors : [l.color]; const sizes = p ? p.sizes : [l.size]; return `<div class="ord-line">${U.thumb({ colors: [l.color], cat: p ? p.cat : 'polo' }, 34)}<div class="grow" style="flex:1;min-width:140px"><b class="ellip" style="display:block">${esc(l.name)}</b><span class="ord-sub">${esc(l.from)} · ${tk(l.price)} · ${stockTxt(l)}</span></div>${U.select('mg-c' + i, cols.map((c) => [c, c]), l.color, 'style="width:auto"')}${U.select('mg-s' + i, sizes.map((s) => [s, s]), l.size, 'style="width:auto"')}<input class="inp" id="mg-q${i}" type="number" min="1" max="9" value="${l.qty}" style="width:60px"><button class="btn sm ghost" data-rm="${i}" aria-label="${t('Remove', 'বাদ দিন')}">${A.icon('x')}</button></div>`; };
      const ap = prod(add.pid) || live[0]; if (!add.pid && ap) { add.pid = ap.id; add.color = ap.colors[0]; add.size = ap.sizes[0]; }
      const co = others();
      body.innerHTML = `<div class="row between" style="flex-wrap:wrap;gap:6px"><div><b class="mono">${esc(main().id)}</b> <span class="muted small">${t('is the main order', 'মূল অর্ডার')}</span></div><span class="muted small">${t('Edit the merged order, then merge', 'মার্জ করা অর্ডার এডিট করুন, তারপর মার্জ')}</span></div>
        ${lines.length ? lines.map(lineRow).join('') : U.callout(t('No item left. Add a product or undo a cancelled order.', 'কোনো আইটেম নেই। প্রোডাক্ট যোগ করুন বা বাতিল অর্ডার ফেরান।'), 'warn', 'warn')}
        <div class="ord-line" style="flex-wrap:wrap"><b class="small" style="min-width:90px">${t('Add a product', 'প্রোডাক্ট যোগ')}</b>${U.select('mg-ap', live.map((p) => [p.id, p.name]), add.pid, 'style="width:auto;max-width:210px"')}${U.select('mg-ac', (ap ? ap.colors : []).map((c) => [c, c]), add.color, 'style="width:auto"')}${U.select('mg-as', (ap ? ap.sizes : []).map((s) => [s, s]), add.size, 'style="width:auto"')}<input class="inp" id="mg-aq" type="number" min="1" max="9" value="${add.qty}" style="width:60px"><button class="btn sm" id="mg-add">${A.icon('plus')} ${t('Add', 'যোগ')}</button></div>
        <div class="ord-line" style="flex-wrap:wrap"><b class="small" style="min-width:90px">${t('Cancel one order', 'একটি অর্ডার বাতিল')}</b>${co.map((x) => gone[x.id] ? `<span class="small">${esc(x.id)}: ${U.badge(rLabel(CANCEL_R, gone[x.id]), '')} <button class="btn sm ghost" data-undo="${x.id}">${t('Undo', 'ফেরান')}</button></span>` : `<span class="row" style="gap:6px">${U.select('mg-cr-' + x.id, CANCEL_R.map((r) => [r[0], t(r[0], r[1])]), CANCEL_R[2][0], 'style="width:auto;max-width:200px"')}<button class="btn sm ghost" data-cx="${x.id}">${t('Cancel', 'বাতিল')} ${esc(x.id)}</button></span>`).join('')}</div>
        <div class="ord-profit"><div class="row between"><span>${t('Merged total', 'মার্জ করা মোট')}</span><b>${tk(cp.total)} <span class="muted small">(${all.map((x) => tk(x.total)).join(' + ')})</span></b></div><div class="row between small"><span>${t('Delivery charge', 'ডেলিভারি চার্জ')}</span><span>${cp.delivery ? tk(cp.delivery) : t('Free', 'ফ্রি')}</span></div></div>`;
      foot.innerHTML = `<button class="btn" id="mg-back">${t('Back', 'ফিরে যান')}</button><button class="btn" id="mg-go" ${lines.length ? '' : 'disabled'}>${t('Merge', 'মার্জ')}</button><button class="btn primary" id="mg-call" ${lines.length ? '' : 'disabled'}>${A.icon('phone')} ${t('Merge + call', 'মার্জ + কল')}</button>`;
      lines.forEach((l, i) => {
        const p = prod(l.pid);
        const ch = () => { const c = body.querySelector('#mg-c' + i).value, s = body.querySelector('#mg-s' + i).value; const v = p && p.variants.find((x) => x.color === c && x.size === s); l.color = c; l.size = s; if (v) l.sku = v.sku; l.qty = Math.max(1, parseInt(body.querySelector('#mg-q' + i).value, 10) || 1); draw(); };
        body.querySelector('#mg-c' + i).onchange = ch; body.querySelector('#mg-s' + i).onchange = ch; body.querySelector('#mg-q' + i).onchange = ch;
      });
      body.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { lines.splice(+b.dataset.rm, 1); draw(); }));
      body.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = () => { delete gone[b.dataset.undo]; const keep = lines.filter((l) => l.from !== b.dataset.undo); startEdit(); lines = lines.filter((l) => l.from === b.dataset.undo).concat(keep); draw(); }));
      body.querySelectorAll('[data-cx]').forEach((b) => (b.onclick = () => { gone[b.dataset.cx] = body.querySelector('#mg-cr-' + b.dataset.cx).value; lines = lines.filter((l) => l.from !== b.dataset.cx); draw(); }));
      body.querySelector('#mg-ap').onchange = (e) => { const p = prod(e.target.value); add.pid = p.id; add.color = p.colors[0]; add.size = p.sizes[0]; draw(); };
      body.querySelector('#mg-ac').onchange = (e) => { add.color = e.target.value; }; body.querySelector('#mg-as').onchange = (e) => { add.size = e.target.value; };
      body.querySelector('#mg-add').onclick = () => { const p = prod(add.pid); if (!p) return; const q = Math.max(1, parseInt(body.querySelector('#mg-aq').value, 10) || 1); const v = p.variants.find((x) => x.color === body.querySelector('#mg-ac').value && x.size === body.querySelector('#mg-as').value) || p.variants[0]; lines.push({ pid: p.id, sku: v.sku, name: p.name, color: v.color, size: v.size, qty: q, price: p.price, cost: p.cost, from: main().id }); add.qty = 1; draw(); };
      foot.querySelector('#mg-back').onclick = () => { step = 1; draw(); };
      const go = (call) => () => { U.close(); mergeDo(main(), others(), lines, gone, call, after); };
      foot.querySelector('#mg-go').onclick = go(false); foot.querySelector('#mg-call').onclick = go(true);
    };
    draw();
  }

  /* ================= PROCESSING (orders that failed the Rules and need a person) ================= */
  const FC = { f: 'all' };
  function renderProcessing(el) {
    const q = A.D.orders.filter((o) => o.status === 'new' && dstat(o) === 'processing').sort((a, b) => (fromLast(b) - fromLast(a)) || new Date(a.created) - new Date(b.created));
    const CH = [['all', 'All', 'সব'], ['stock', 'No stock', 'স্টক নেই'], ['noanswer', 'No answer', 'ফোন ধরেননি'], ['suspicious', 'Suspicious', 'সন্দেহজনক'], ['merge', 'Merge needed', 'মার্জ করতে হবে'], ['advance', 'Advance asked', 'অ্যাডভান্স চাওয়া']];
    const cnt = (k) => (k === 'all' ? q.length : q.filter((o) => stuckTags(o).includes(k)).length);
    if (!CH.some((c) => c[0] === FC.f)) FC.f = 'all';
    const list = FC.f === 'all' ? q : q.filter((o) => stuckTags(o).includes(FC.f));
    const autoToday = A.D.orders.filter((o) => o.cBy === 'rules' && inBatch(o)).length;
    el.innerHTML = A.pageHead(t('Processing', 'প্রসেসিং'), t(`${q.length} need a person · rules already confirmed ${autoToday} of the current batch`, `${q.length}টিতে মানুষ লাগবে · চলতি ব্যাচে নিয়ম ${autoToday}টি কনফার্ম করেছে`), `<a class="btn" href="${A.href('rules', 'all')}">${t('Auto-confirm rules', 'অটো-কনফার্মের নিয়ম')}</a>`) + A.tabsBar('orders', 'processing') + `
      ${callDesk(q)}<div style="height:12px"></div>
      <div class="row between" style="flex-wrap:wrap;gap:8px"><div class="chips" id="c-chips">${CH.map((c) => `<button class="chip ${FC.f === c[0] ? 'on' : ''}" data-f="${c[0]}">${t(c[1], c[2])} <span class="muted">${cnt(c[0])}</span></button>`).join('')}</div><span class="small muted">${t(`Merge looks back ${lookDays()} days · auto-merge is ${autoMergeOn() ? 'on' : 'off'}`, `মার্জ ${lookDays()} দিন পেছনে দেখে · অটো-মার্জ ${autoMergeOn() ? 'চালু' : 'বন্ধ'}`)}</span></div>
      <div style="height:10px"></div>
      ${list.length ? `<div class="grid g2">${list.map((o) => { const d = decide(o); const tags = stuckTags(o); const dp = dupes(o); const asked = o.advanceAsked && !o.advancePaid; return `<div class="o2-q ${tags.includes('suspicious') ? 'red' : ''}" data-o="${o.id}">
        <div class="row between" style="flex-wrap:wrap;gap:6px"><div><a class="strong mono" href="${A.href('orders', 'all', o.id)}">${esc(o.id)}</a> ${fromLast(o) ? `<span class="o2-tag last">${t('From last batch', 'আগের ব্যাচের')}</span>` : ''}<div class="strong" style="font-size:16px">${esc(o.name)}</div><div class="ord-sub">${esc(o.phone)} · ${esc(o.district)} · ${A.fmt.ago(o.created)}</div></div><div class="r"><b style="font-size:17px">${tk(o.total)}</b><div class="ord-sub">${esc(o.payment)} · ${pcsTxt(C.pieces(o))}</div></div></div>
        <div class="ord-why">${tags.map((k) => U.badge(k === 'noanswer' ? t(`No answer × ${o.calls}`, `ধরেননি × ${o.calls}`) : k === 'advance' ? t(`Advance ${tk(o.advanceAsked)} asked`, `অ্যাডভান্স ${tk(o.advanceAsked)} চাওয়া`) : t(STUCK[k][0], STUCK[k][1]), STUCK[k][2])).join('')}<span class="small">${esc(t(d.en, d.bn))}</span></div>
        <div class="small">${o.lines.map((l) => `${dot(l.color)} ${esc(l.name)} <span class="o2-size" style="height:20px;min-width:26px;font-size:11.5px">${esc(l.size)}</span> ×${l.qty}`).join('<br>')}${holdLine(o)}</div>
        ${scorePanel(o, true)}
        ${dp.length ? U.callout(t(`${dp.length + 1} open orders on this phone — merge them into one parcel?`, `এই ফোনে ${dp.length + 1}টি চালু অর্ডার — এক পার্সেলে মার্জ করবেন?`) + ` <button class="btn sm primary" data-a="merge">${A.icon('plus')} ${t('Merge', 'মার্জ')}</button>`, 'info') : ''}
        ${asked ? U.callout(t(`Advance ${tk(o.advanceAsked)} asked${o.advanceVia ? ' by ' + o.advanceVia : ''} ${A.fmt.ago(o.advanceAskedAt || o.created)}. Waiting for the money.`, `অ্যাডভান্স ${tk(o.advanceAsked)} চাওয়া হয়েছে${o.advanceVia ? ' (' + o.advanceVia + ')' : ''} ${A.fmt.ago(o.advanceAskedAt || o.created)}। টাকার অপেক্ষা।`), 'info', 'info') : ''}
        <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn primary sm" data-a="confirm">${A.icon('check')} ${t('Approve', 'অ্যাপ্রুভ')}</button>${asked ? `<button class="btn sm" data-a="advpaid">${t('Advance received', 'অ্যাডভান্স এসেছে')}</button>` : `<button class="btn sm" data-a="adv">${t('Ask for advance', 'অ্যাডভান্স চান')}</button>`}<button class="btn sm" data-a="noans">${t('No answer', 'ধরেননি')}</button><button class="btn sm" data-a="call">${A.icon('phone')} ${t('Call', 'কল')}</button><button class="btn sm ghost" data-a="cancel">${t('Cancel', 'বাতিল')}</button>${nextTxt(o)}</div></div>`; }).join('')}</div>` : U.empty(t('Nothing needs a person here. The rules handled the rest.', 'এখানে মানুষ লাগার মতো কিছু নেই। বাকিটা নিয়ম সামলেছে।'))}`;
    el.querySelectorAll('#c-chips [data-f]').forEach((b) => (b.onclick = () => { FC.f = b.dataset.f; A.render(); }));
    el.querySelectorAll('.o2-q [data-a]').forEach((b) => (b.onclick = () => act(A.byId(A.D.orders, b.closest('[data-o]').dataset.o), b.dataset.a)));
    el.querySelector('#cd-who').onchange = (e) => { R2().caller = e.target.value; A.commit(`Calling as ${R2().caller}`); A.toast(t(`Calling as ${R2().caller}`, `${R2().caller} হিসেবে কল`), 'good'); A.render(); };
    el.querySelectorAll('[data-cdo]').forEach((b) => (b.onclick = () => callModal(A.byId(A.D.orders, b.dataset.cdo))));
  }

  /* ================= TO PACK ================= */
  function pickRows(list) {
    const m = new Map();
    for (const o of list) for (const l of o.lines) {
      const p = prod(l.pid) || { cat: 'other', styleCode: l.sku.split('-')[0] };
      const key = [p.cat, p.styleCode || l.name, l.color, l.size].join('|');
      const r = m.get(key) || { cat: p.cat, style: p.styleCode || '', name: l.name, color: l.color, size: l.size, qty: 0, orders: [] };
      r.qty += l.qty; r.orders.push(o.id); m.set(key, r);
    }
    const rows = Array.from(m.values());
    const catQ = {}; const styQ = {};
    rows.forEach((r) => { catQ[r.cat] = (catQ[r.cat] || 0) + r.qty; styQ[r.style + r.name] = (styQ[r.style + r.name] || 0) + r.qty; });
    rows.sort((a, b) => (catQ[b.cat] - catQ[a.cat]) || a.cat.localeCompare(b.cat) || (styQ[b.style + b.name] - styQ[a.style + a.name]) || a.name.localeCompare(b.name) || a.color.localeCompare(b.color) || b.qty - a.qty);
    return { rows, catQ };
  }
  const catName = (c) => { const x = A.CATS ? A.byId(A.CATS, c) : null; return x ? A.t(x.en, x.bn) : c.charAt(0).toUpperCase() + c.slice(1); };
  function shortages(list) {
    const need = {};
    for (const o of list) for (const l of o.lines) need[l.sku] = (need[l.sku] || 0) + l.qty;
    const out = []; for (const sku in need) { const l = list.find((o) => o.lines.some((x) => x.sku === sku)).lines.find((x) => x.sku === sku); const v = variant(l); if (v && v.stock < need[sku]) out.push({ l, need: need[sku], have: v.stock }); }
    return out;
  }
  function printAllModal(list, problems) {
    const ok = list.filter((o) => !problems.includes(o));
    const { rows, catQ } = pickRows(ok); const sh = shortages(ok);
    const pcs = A.sum(ok, C.pieces);
    let lastCat = '';
    const pick = `<table class="o2-pick"><thead><tr><th></th><th>${t('Style', 'স্টাইল')}</th><th>${t('Colour', 'রং')}</th><th>${t('Size', 'সাইজ')}</th><th class="r">${t('Pieces', 'পিস')}</th></tr></thead><tbody>${rows.map((r) => { const head = r.cat !== lastCat ? `<tr class="cat"><td colspan="5">${esc(catName(r.cat))} · ${catQ[r.cat]} ${t('pcs', 'পিস')}</td></tr>` : ''; lastCat = r.cat; return head + `<tr><td><span class="o2-tick"></span></td><td>${esc(r.name)} <span class="muted mono">${esc(r.style)}</span></td><td>${dot(r.color)} ${esc(r.color)}</td><td><b>${esc(r.size)}</b></td><td class="r"><b>${r.qty}</b></td></tr>`; }).join('')}</tbody></table>`;
    const stk = `<div class="o2-stk">${ok.map((o) => `<div><div class="row between"><b>${esc(cname(o.courier) || cname(OF().courier))}</b><span class="mono">${esc(o.id)}</span></div><div class="ord-bar"></div><div class="mono">${esc(o.tracking || '—')}</div><div><b>${esc(o.name)}</b> · ${esc(VIEW === 'packer' ? maskPhone(o.phone) : o.phone)}</div><div class="muted">${esc(VIEW === 'packer' ? maskAddr(o) : o.address)}</div><div class="row between"><span>${pcsTxt(C.pieces(o))}</span><b>${o.paid ? t('PAID', 'পেইড') : 'COD ' + tk(o.total - (o.advancePaid || 0))}</b></div></div>`).join('')}</div>`;
    const cats = Object.keys(catQ).map((c) => `${catName(c)} ${catQ[c]}`).join(' · ');
    const body = `<div class="o2-paper"><b>1 · ${t('Today’s summary', 'আজকের সারাংশ')}</b><p style="margin:6px 0 0">${t(`${ok.length} orders · ${pcs} pieces · ${cats}`, `${ok.length}টি অর্ডার · ${pcs} পিস · ${cats}`)}</p>${sh.length ? `<p style="margin:6px 0 0;color:var(--bad)">${t('Short:', 'কম আছে:')} ${sh.map((s) => esc(`${s.l.name} ${s.l.color} ${s.l.size} (${t('need', 'লাগবে')} ${s.need}, ${t('have', 'আছে')} ${s.have})`)).join('; ')}</p>` : ''}${problems.length ? `<p style="margin:6px 0 0">${t('Kept apart (problem orders):', 'আলাদা রাখা (সমস্যার অর্ডার):')} ${problems.map((o) => esc(o.id)).join(', ')}</p>` : ''}</div>
      <div class="o2-paper"><div class="o2-lh"><h2>EXTAS</h2><span class="small muted">${t('Picking list', 'পিকিং লিস্ট')} · ${A.fmt.dateY(A.TODAY)} · ${t('batch', 'ব্যাচ')} ${X().batchNo}</span></div><div class="small muted" style="margin-bottom:6px">${esc(A.D.store.address)} · ${esc(A.D.store.phone)}</div>${pick}</div>
      <div class="o2-paper"><b>3 · ${t('Stickers (same order)', 'স্টিকার (একই ক্রমে)')}</b><div style="height:8px"></div>${stk}</div>`;
    const m = U.modal(t(`Print all · ${ok.length} orders`, `সব প্রিন্ট · ${ok.length}টি অর্ডার`), body, { wide: true, foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button><button class="btn" id="pa-pdf">${A.icon('down')} PDF</button><button class="btn primary" id="pa-ok">${A.icon('print')} ${t('Print all', 'সব প্রিন্ট')}</button>` });
    m.querySelector('#pa-pdf').onclick = () => U.download(`picking-list-${A.fmt.ymd(A.TODAY)}.pdf`);
    m.querySelector('#pa-ok').onclick = () => { ok.forEach((o) => packOne(o)); U.close(); A.commit(`Printed summary, picking list and ${ok.length} stickers — ${ok.length} orders packed`); A.toast(t(`Printed · ${ok.length} orders are now Packed`, `প্রিন্ট হয়েছে · ${ok.length}টি অর্ডার এখন প্যাকড`), 'good'); A.render(); };
  }
  /* ================= TO SHIP: Confirmed -> Book courier, Booked -> Print stickers, Packed ================= */
  const FS = { c: 'confirmed' };
  function bookMany(list, cid) {
    let n = 0; list.forEach((o) => { if (bookOrder(o, cid)) { n++; if (o.erp && o.erp.pushed) erpEv('order', `${o.id} booked with ${cname(cid)} · ${o.tracking}`); } });
    A.commit(`Booked ${n} order(s) with ${cname(cid)}`);
    A.toast(t(`${n} order${n === 1 ? '' : 's'} booked with ${cname(cid)} · sent to the courier`, `${n}টি অর্ডার ${cname(cid)}-এ বুক · কুরিয়ারে পাঠানো হয়েছে`), 'good');
    A.render();
  }
  function dayEnd(packedToday, handedToday, packedNow) {
    return `<div class="grid g3">${[[t('Packed today', 'আজ প্যাকড'), packedToday, 'box'], [t('Handed over', 'কুরিয়ারকে দেওয়া'), handedToday, 'truck'], [t('Not handed over yet', 'এখনো দেওয়া হয়নি'), packedNow, 'warn']].map((k) => `<div>${U.kpi({ label: k[0], value: k[1], icon: k[2] })}</div>`).join('')}</div>`;
  }
  function renderShip(el) {
    const by = (s) => A.D.orders.filter((o) => o.status === s).sort((a, b) => new Date(a.created) - new Date(b.created));
    const conf = by('confirmed'), booked = by('booked'), packed = by('packed');
    const CH = [['confirmed', 'Confirmed', 'কনফার্মড', conf.length], ['booked', 'Booked', 'বুকড', booked.length], ['packed', 'Packed', 'প্যাকড', packed.length]];
    if (!CH.some((c) => c[0] === FS.c)) FS.c = 'confirmed';
    const sod = SOD(); const packedToday = A.D.orders.filter((o) => o.packedAt && new Date(o.packedAt) >= sod || o.status === 'packed').length; const handedToday = A.D.orders.filter((o) => o.handedAt && new Date(o.handedAt) >= sod).length;
    const chips = `<div class="chips" id="s-chips" style="margin-bottom:12px">${CH.map((c) => `<button class="chip ${FS.c === c[0] ? 'on' : ''}" data-c="${c[0]}">${t(c[1], c[2])} <span class="muted">${c[3]}</span></button>`).join('')}</div>`;
    const dc = defCourier(); const conn = A.D.couriers.filter((c) => c.connected);
    const chk = (id) => `<input type="checkbox" class="ord-cb" data-sel="${id}" aria-label="select">`;
    const cell = (x) => `<b class="mono"><a href="${A.href('orders', 'all', x.o.id)}">${esc(x.o.id)}</a></b>${fromLast(x.o) ? ` <span class="o2-tag last">${t('From last batch', 'আগের ব্যাচের')}</span>` : ''}<div class="ord-sub">${esc(x.o.name)}</div>`;
    const itemsC = (x) => x.o.lines.map((l) => `${dot(l.color)} <span class="ellip" style="display:inline-block;max-width:140px;vertical-align:middle">${esc(l.name)}</span> <b>${esc(l.size)}</b>×${l.qty}`).join('<br>');
    const cashC = (x) => (x.o.paid ? U.badge(t('Paid', 'পেইড'), 'good') : `<b>${tk(x.o.total - (x.o.advancePaid || 0))}</b>`);
    let body = '', head = A.pageHead(t('To ship', 'পাঠানো বাকি'), t(`${conf.length} to book · ${booked.length} to print · ${packed.length} packed, waiting for the courier`, `${conf.length}টি বুক বাকি · ${booked.length}টি প্রিন্ট বাকি · ${packed.length}টি প্যাকড, কুরিয়ারের অপেক্ষায়`)) + A.tabsBar('orders', 'ship');
    if (FS.c === 'confirmed') {
      const problems = conf.filter((o) => o.hold || o.stockWait);
      body = `${U.callout(t('Pick the orders and press “Book courier”: every order is sent to the courier by API in one click and gets its tracking number. An order is booked only once.', 'অর্ডার বাছুন আর “কুরিয়ার বুক” চাপুন: এক ক্লিকে সব অর্ডার API দিয়ে কুরিয়ারে যায় আর ট্র্যাকিং নম্বর পায়। একটি অর্ডার মাত্র একবার বুক হয়।'))}
        <div class="ord-bulk" id="s-bar"><label class="row small" style="gap:6px;color:var(--card)"><input type="checkbox" class="ord-cb" id="s-all"> ${t('Select all', 'সব বাছুন')}</label><span id="s-n" class="small">0 ${t('selected', 'বাছা')}</span><span class="grow" style="flex:1"></span><span class="small">${t('Courier', 'কুরিয়ার')}</span>${U.select('s-cr', conn.map((c) => [c.id, c.name + (c.id === dc ? ' · ' + t('default', 'ডিফল্ট') : '')]), dc, 'style="width:auto;color:var(--ink)"')}<button class="btn" id="s-book">${A.icon('truck')} ${t('Book courier', 'কুরিয়ার বুক')}</button></div>
        ${U.table([{ h: '', f: (x) => (problems.includes(x.o) ? '' : chk(x.o.id)) }, { h: t('Order', 'অর্ডার'), f: cell }, { h: t('Items', 'আইটেম'), hide: true, f: itemsC }, { h: t('Deliver to', 'যেখানে যাবে'), hide: true, f: (x) => `<span class="mono">${esc(x.o.phone)}</span><div class="ord-sub ellip" style="max-width:200px">${esc(x.o.district)}</div>` }, { h: t('Cash', 'ক্যাশ'), r: true, f: cashC }, { h: '', r: true, f: (x) => (problems.includes(x.o) ? U.badge(x.o.stockWait ? t('Waiting stock', 'স্টকের অপেক্ষা') : t('On hold', 'হোল্ডে'), 'warn') : '') }], conf.map((o) => ({ _id: o.id, o })), { empty: t('Nothing to book. New Confirmed orders appear here.', 'বুক করার কিছু নেই। নতুন কনফার্মড অর্ডার এখানে আসবে।') })}`;
    } else if (FS.c === 'booked') {
      const problems = booked.filter((o) => o.hold || o.stockWait); const ok = booked.filter((o) => !problems.includes(o));
      const { catQ } = pickRows(ok); const sh = shortages(ok);
      body = `<div class="o3-row" style="justify-content:flex-end;margin-bottom:10px"><span class="small muted">${t('Viewing as', 'যেভাবে দেখছেন')}</span>${U.seg('pk-view', [['owner', t('Owner', 'মালিক')], ['packer', t('Packer', 'প্যাকার')]], VIEW)}</div>
        ${VIEW === 'packer' ? U.callout(t('Packer view: phone numbers and full addresses are hidden. Only the area shows. The printed sticker carries the full address for the courier.', 'প্যাকার ভিউ: ফোন নম্বর ও পুরো ঠিকানা লুকানো। শুধু এলাকা দেখায়। প্রিন্ট করা স্টিকারে কুরিয়ারের জন্য পুরো ঠিকানা থাকে।'), 'info', 'info') + '<div style="height:10px"></div>' : ''}
        ${peakBanner(ok)}
        <div class="grid g4" style="margin-bottom:14px">
          <div class="card">${U.kpi({ label: t('Stickers to print', 'প্রিন্ট বাকি'), value: ok.length, sub: t(`${packedToday} packed today`, `আজ ${packedToday}টি প্যাকড`), icon: 'print' })}</div>
          <div class="card">${U.kpi({ label: t('Pieces', 'পিস'), value: A.sum(ok, C.pieces), sub: Object.keys(catQ).slice(0, 3).map((c) => catName(c) + ' ' + catQ[c]).join(' · '), icon: 'products' })}</div>
          <div class="card">${U.kpi({ label: t('Short in stock', 'স্টকে কম'), value: sh.length, sub: sh.length ? esc(sh[0].l.name + ' ' + sh[0].l.size) : t('All pieces are there', 'সব পিস আছে'), icon: 'warn' })}</div>
          <div class="card">${U.kpi({ label: t('Problem orders', 'সমস্যার অর্ডার'), value: problems.length, sub: t('kept apart', 'আলাদা রাখা'), icon: 'info' })}</div>
        </div>
        ${U.callout(t('“Print all” gives (1) the summary, (2) the picking list by category → style → colour → size, most pieces first, and (3) the stickers with the courier barcode, in the same order. A sticker prints once: printing makes the order Packed. Handing over to the courier comes from the courier’s pickup report.', '“সব প্রিন্ট” দেয় (1) সারাংশ, (2) ক্যাটাগরি → স্টাইল → রং → সাইজ ধরে পিকিং লিস্ট, বেশি পিস আগে, (3) একই ক্রমে কুরিয়ারের বারকোডসহ স্টিকার। স্টিকার একবারই প্রিন্ট হয়: প্রিন্ট হলেই অর্ডার প্যাকড। কুরিয়ারকে দেওয়া হয়েছে কি না তা কুরিয়ারের পিকআপ রিপোর্ট থেকে আসে।'))}
        <div class="ord-bulk" id="s-bar"><label class="row small" style="gap:6px;color:var(--card)"><input type="checkbox" class="ord-cb" id="s-all"> ${t('Select all', 'সব বাছুন')}</label><span id="s-n" class="small">0 ${t('selected', 'বাছা')}</span><span class="grow" style="flex:1"></span><button class="btn" id="s-pr">${A.icon('print')} ${t('Print stickers', 'স্টিকার প্রিন্ট')}</button><button class="btn" id="s-pa" ${ok.length ? '' : 'disabled'}>${A.icon('print')} ${t('Print all', 'সব প্রিন্ট')}</button></div>
        ${U.table([{ h: '', f: (x) => (problems.includes(x.o) ? '' : chk(x.o.id)) }, { h: t('Order', 'অর্ডার'), f: cell }, { h: t('Items', 'আইটেম'), f: itemsC }, { h: t('Deliver to', 'যেখানে যাবে'), hide: true, f: (x) => (VIEW === 'packer' ? `<span class="o3-mask mono">${esc(maskPhone(x.o.phone))}</span><div class="ord-sub">${esc(maskAddr(x.o))}</div>` : `<span class="mono">${esc(x.o.phone)}</span><div class="ord-sub ellip" style="max-width:200px">${esc(x.o.address)}</div>`) }, { h: t('Courier', 'কুরিয়ার'), hide: true, f: (x) => `${esc(cname(x.o.courier) || '—')}<div class="ord-sub mono">${esc(x.o.tracking || '')}</div>` }, { h: t('Cash', 'ক্যাশ'), r: true, f: cashC }, { h: '', r: true, f: (x) => (problems.includes(x.o) ? U.badge(x.o.stockWait ? t('Waiting stock', 'স্টকের অপেক্ষা') : t('On hold', 'হোল্ডে'), 'warn') : '') }], booked.map((o) => ({ _id: o.id, o })), { empty: t('No booked order waits for a sticker. Book Confirmed orders first.', 'স্টিকারের অপেক্ষায় কোনো বুকড অর্ডার নেই। আগে কনফার্মড অর্ডার বুক করুন।') })}`;
    } else {
      const log = printLog().slice(0, 12);
      body = `${U.card(t('Day-end check', 'দিন শেষের চেক'), dayEnd(packedToday, handedToday, packed.length) + `<p class="small muted" style="margin:10px 0 0">${packed.length ? t(`${packed.length} packed parcel(s) wait for the courier’s pickup report. If a parcel is still here after the pickup, ask the courier.`, `${packed.length}টি প্যাকড পার্সেল কুরিয়ারের পিকআপ রিপোর্টের অপেক্ষায়। পিকআপের পরও থেকে গেলে কুরিয়ারকে জানান।`) : t('Every packed parcel is handed over.', 'সব প্যাকড পার্সেল কুরিয়ারকে দেওয়া হয়েছে।')}</p>`, { more: t('With courier', 'কুরিয়ারে'), moreHref: A.href('orders', 'courier') })}
        <div style="height:12px"></div>
        ${U.table([{ h: t('Order', 'অর্ডার'), f: cell }, { h: t('Items', 'আইটেম'), hide: true, f: itemsC }, { h: t('Courier', 'কুরিয়ার'), f: (x) => `${esc(cname(x.o.courier) || '—')}<div class="ord-sub mono">${esc(x.o.tracking || '')}</div>` }, { h: t('Printed', 'প্রিন্ট'), hide: true, f: (x) => `${x.o.printed || 1}× ${x.o.packedAt ? '· ' + A.fmt.ago(x.o.packedAt) : ''}` }, { h: t('Cash', 'ক্যাশ'), r: true, f: cashC }, { h: '', r: true, f: (x) => `<button class="btn sm" data-rp="${x.o.id}">${A.icon('print')} ${t('Print again (PIN)', 'আবার প্রিন্ট (PIN)')}</button>` }], packed.map((o) => ({ _id: o.id, o })), { empty: t('No packed parcel waits.', 'কোনো প্যাকড পার্সেল অপেক্ষায় নেই।') })}
        <div style="height:12px"></div>
        ${U.card(t('Print log', 'প্রিন্ট লগ'), log.length ? U.table([{ h: t('Order', 'অর্ডার'), f: (l) => `<b class="mono">${esc(l.oid)}</b>` }, { h: t('Print', 'প্রিন্ট'), f: (l) => '#' + l.n }, { h: t('Who', 'কে'), f: (l) => esc(l.by) }, { h: t('When', 'কখন'), hide: true, f: (l) => A.fmt.ago(l.at) }, { h: t('Why', 'কেন'), f: (l) => esc(l.n > 1 ? t(l.why, (PRINT_WHY.find((r) => r[0] === l.why) || [0, l.why])[1]) : t('First print', 'প্রথম প্রিন্ট')) }], log.map((l, i) => Object.assign({ _id: 'pl' + i }, l))) : U.empty(t('No print yet.', 'এখনো প্রিন্ট হয়নি।')), { sub: t('Every print: who, when, why. A second print needs the owner PIN.', 'প্রতিটি প্রিন্ট: কে, কখন, কেন। দ্বিতীয়বার প্রিন্টে মালিকের PIN লাগে।') })}`;
    }
    el.innerHTML = head + chips + body;
    el.querySelectorAll('#s-chips [data-c]').forEach((b) => (b.onclick = () => { FS.c = b.dataset.c; A.render(); }));
    const sel = () => Array.from(el.querySelectorAll('[data-sel]:checked')).map((c) => A.byId(A.D.orders, c.dataset.sel));
    const upd = () => { const n = sel().length; const sn = el.querySelector('#s-n'); if (sn) sn.textContent = n + ' ' + t('selected', 'বাছা'); const sa = el.querySelector('#s-all'); if (sa) sa.checked = n > 0 && n === el.querySelectorAll('[data-sel]').length; };
    el.querySelectorAll('[data-sel]').forEach((c) => (c.onchange = upd));
    const sa = el.querySelector('#s-all'); if (sa) sa.onchange = () => { el.querySelectorAll('[data-sel]').forEach((c) => (c.checked = sa.checked)); upd(); };
    const bk = el.querySelector('#s-book'); if (bk) bk.onclick = () => { const l = sel(); if (!l.length) return A.toast(t('Pick orders first', 'আগে অর্ডার বাছুন'), 'bad'); bookMany(l, el.querySelector('#s-cr').value); };
    const pr = el.querySelector('#s-pr'); if (pr) pr.onclick = () => { const l = sel(); if (!l.length) return A.toast(t('Pick orders first', 'আগে অর্ডার বাছুন'), 'bad'); labelsModal(l); };
    const pa = el.querySelector('#s-pa'); if (pa) pa.onclick = () => printAllModal(booked.filter((o) => !(o.hold || o.stockWait)), booked.filter((o) => o.hold || o.stockWait));
    peakWire(el, booked, booked.filter((o) => o.hold || o.stockWait), booked.filter((o) => !(o.hold || o.stockWait)));
    el.querySelectorAll('#pk-view button').forEach((b) => (b.onclick = () => { VIEW = b.dataset.v; try { localStorage.setItem('extas.ord.viewAs', VIEW); } catch (e) { /* private window */ } A.toast(VIEW === 'packer' ? t('Packer view — phone and address hidden', 'প্যাকার ভিউ — ফোন ও ঠিকানা লুকানো') : t('Owner view', 'মালিকের ভিউ'), 'good'); A.render(); }));
    el.querySelectorAll('[data-rp]').forEach((b) => (b.onclick = () => reprintModal(A.byId(A.D.orders, b.dataset.rp))));
  }

  /* ================= WITH COURIER (handed-over parcels, live courier status) ================= */
  const FW = { s: 'all' };
  const cApi = () => (A.couriersApi && typeof A.couriersApi.status === 'function' ? A.couriersApi : null);
  const cStat = (o) => { try { return cApi() ? cApi().status(o) : null; } catch (e) { return null; } };
  const cBadge = (o) => { const s = cStat(o); if (!s) return ''; return `<button class="btn sm ${''}" data-ct="${o.id}" title="${t('Open the courier’s tracking history', 'কুরিয়ারের ট্র্যাকিং হিস্ট্রি খুলুন')}" style="gap:6px">${U.badge(t(s.label[0], s.label[1]), s.tone || '')}<span class="ord-sub">${s.at ? A.fmt.ago(s.at) : ''}</span></button>`; };
  const openTrack = (o) => { try { if (A.couriersApi && A.couriersApi.openTrack) return A.couriersApi.openTrack(o); } catch (e) { /* guarded */ } A.toast(t('Tracking history is not ready yet', 'ট্র্যাকিং হিস্ট্রি এখনো তৈরি নয়')); };
  function renderCourier(el) {
    const sod = SOD();
    const packed = A.D.orders.filter((o) => o.status === 'packed');
    const packedToday = A.D.orders.filter((o) => (o.packedAt && new Date(o.packedAt) >= sod) || o.status === 'packed');
    const handedToday = A.D.orders.filter((o) => o.handedAt && new Date(o.handedAt) >= sod);
    const run = X().courierRun;
    const missing = run ? packed.filter((o) => run.missing.includes(o.id)) : [];
    const cxEntered = A.D.orders.filter((o) => o.courierEnteredCancelled && !o.courierCxDone);
    const withC = A.D.orders.filter((o) => o.status === 'shipped').sort((a, b) => new Date(a.created) - new Date(b.created));
    const cod = A.sum(withC.filter((o) => !o.paid), (o) => o.total - (o.advancePaid || 0));
    const codes = {}; withC.forEach((o) => { const s = cStat(o); if (s) { codes[s.code] = codes[s.code] || { n: 0, l: s.label }; codes[s.code].n++; } });
    if (FW.s !== 'all' && !codes[FW.s]) FW.s = 'all';
    const rows = withC.filter((o) => FW.s === 'all' || (cStat(o) || {}).code === FW.s);
    el.innerHTML = A.pageHead(t('With courier', 'কুরিয়ারে'), t(`${withC.length} parcels handed over · ${tk(cod)} cash to collect`, `${withC.length}টি পার্সেল কুরিয়ারকে দেওয়া · ${tk(cod)} ক্যাশ আসবে`), `<button class="btn primary" id="cr-run">${A.icon('sync')} ${t('Record courier pickup', 'কুরিয়ার পিকআপ রেকর্ড')}</button>`) + A.tabsBar('orders', 'courier') + `
      ${U.card(t('Day-end check', 'দিন শেষের চেক'), dayEnd(packedToday.length, handedToday.length, packed.length) + (missing.length ? `<div style="margin-top:10px">${U.callout(t(`Packed today ${packedToday.length}, handed over ${handedToday.length}. The courier’s pickup report does not have these parcels:`, `আজ প্যাকড ${packedToday.length}, কুরিয়ারকে দেওয়া ${handedToday.length}। কুরিয়ারের পিকআপ রিপোর্টে এই পার্সেলগুলো নেই:`), 'bad', 'warn')}${missing.map((o) => `<div class="o2-li"><b class="mono">${esc(o.id)}</b><span class="grow ellip">${esc(o.name)} · ${esc(o.tracking || '')}</span><button class="btn sm" data-ask="${o.id}">${t('Ask courier', 'কুরিয়ারকে জানান')}</button></div>`).join('')}</div>` : packed.length ? `<p class="small muted" style="margin:10px 0 0">${t(`${packed.length} packed parcel(s) wait for the courier’s pickup.`, `${packed.length}টি প্যাকড পার্সেল কুরিয়ারের পিকআপের অপেক্ষায়।`)}</p>` : `<p class="small" style="margin:10px 0 0;color:var(--good)">${t('All packed parcels are handed over.', 'সব প্যাকড পার্সেল কুরিয়ারকে দেওয়া হয়েছে।')}</p>`)
        + cxEntered.map((o) => `<div style="margin-top:10px">${U.callout(t(`Cancelled order ${o.id} is still booked at the courier (${o.tracking}). Ask them to send it back.`, `বাতিল অর্ডার ${o.id} কুরিয়ারে এখনো বুক আছে (${o.tracking})। ফেরত পাঠাতে বলুন।`) + ` <button class="btn sm" data-cx="${o.id}">${t('Ask to send back', 'ফেরত চান')}</button>`, 'warn', 'warn')}</div>`).join(''), { sub: t('Handed over starts only when the courier’s pickup report says it took the parcel.', 'কুরিয়ারের পিকআপ রিপোর্টে নেওয়ার কথা থাকলে তবেই “কুরিয়ারকে দেওয়া” শুরু হয়।') })}
      <div style="height:12px"></div>
      ${U.card(t(`Parcels with courier (${rows.length})`, `কুরিয়ারে থাকা পার্সেল (${rows.length})`), (Object.keys(codes).length ? `<div class="chips" id="w-chips" style="margin-bottom:10px"><button class="chip ${FW.s === 'all' ? 'on' : ''}" data-s="all">${t('All', 'সব')} <span class="muted">${withC.length}</span></button>${Object.keys(codes).map((k) => `<button class="chip ${FW.s === k ? 'on' : ''}" data-s="${k}">${t(codes[k].l[0], codes[k].l[1])} <span class="muted">${codes[k].n}</span></button>`).join('')}</div>` : '') + U.table([
        { h: t('Order', 'অর্ডার'), f: (x) => `<b class="mono">${esc(x.o.id)}</b><div class="ord-sub">${esc(x.o.name)}</div>` },
        { h: t('Tracking', 'ট্র্যাকিং'), hide: true, f: (x) => `${esc(cname(x.o.courier))}<div class="ord-sub mono">${esc(x.o.tracking)}</div>` },
        { h: t('Courier status', 'কুরিয়ারের স্ট্যাটাস'), f: (x) => cBadge(x.o) || U.badge(t('Handed over', 'কুরিয়ারকে দেওয়া'), 'warn') },
        { h: t('Days', 'দিন'), r: true, hide: true, f: (x) => Math.max(0, Math.floor(ageH(x.o.handedAt || x.o.enteredAt || x.o.created) / 24)) },
        { h: t('Cash', 'ক্যাশ'), r: true, f: (x) => (x.o.paid ? U.badge(t('Paid', 'পেইড'), 'good') : `<b>${tk(x.o.total - (x.o.advancePaid || 0))}</b>`) },
        { h: '', r: true, f: (x) => (x.o.partialAtDoor ? U.badge(t('Partial', 'আংশিক'), 'warn') : '') },
      ], rows.slice(0, 60).map((o) => ({ _id: o.id, o })), { onRow: true, empty: t('No parcel with a courier right now.', 'এখন কুরিয়ারে কোনো পার্সেল নেই।') }), { sub: t('Click a row to open the order. Click the courier status to see the courier’s full history.', 'অর্ডার খুলতে লাইনে ক্লিক করুন। কুরিয়ারের পুরো হিস্ট্রি দেখতে কুরিয়ারের স্ট্যাটাসে ক্লিক করুন।') })}
      ${courierSafety(withC)}`;
    el.querySelectorAll('tr[data-row]').forEach((tr) => (tr.onclick = (e) => { if (e.target.closest('[data-ct]')) return; A.go('orders', 'all', tr.dataset.row); }));
    el.querySelectorAll('[data-ct]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); openTrack(A.byId(A.D.orders, b.dataset.ct)); }));
    el.querySelectorAll('#w-chips [data-s]').forEach((b) => (b.onclick = () => { FW.s = b.dataset.s; A.render(); }));
    courierWire(el);
    el.querySelector('#cr-run').onclick = pickupReport;
    el.querySelectorAll('[data-ask]').forEach((b) => (b.onclick = () => { const o = A.byId(A.D.orders, b.dataset.ask); tl(o, `Asked ${cname(o.courier)} about the missing parcel`, `${cname(o.courier)}-কে হারানো পার্সেলের কথা জানানো হয়েছে`); A.commit(`Asked courier about ${o.id}`); A.toast(t('Message sent to the courier', 'কুরিয়ারকে মেসেজ গেছে'), 'good'); }));
    el.querySelectorAll('[data-cx]').forEach((b) => (b.onclick = () => { const o = A.byId(A.D.orders, b.dataset.cx); o.courierCxDone = true; tl(o, `Asked ${cname(o.courier)} to send the cancelled parcel back`, `${cname(o.courier)}-কে বাতিল পার্সেল ফেরত দিতে বলা হয়েছে`); A.commit(`Asked courier to return ${o.id}`); A.toast(t('Courier asked to send it back', 'কুরিয়ারকে ফেরত দিতে বলা হয়েছে'), 'good'); A.render(); }));
  }

  /* ================= RETURNS & EXCHANGES ================= */
  const leftTxt = (ms) => { const neg = ms < 0; ms = Math.abs(ms); const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / HOUR); const s = d ? `${d}${t('d', ' দিন')} ${h}${t('h', ' ঘণ্টা')}` : `${h}${t('h', ' ঘণ্টা')}`; return neg ? t(`${s} late`, `${s} দেরি`) : t(`${s} left`, `${s} বাকি`); };
  const clock = (ms) => `<span class="o2-clock" style="color:var(--${ms < 0 ? 'bad' : ms < DAY ? 'warn' : 'good'})">${leftTxt(ms)}</span>`;
  function rItems() {
    const out = [];
    for (const o of A.D.orders) {
      if (o.status === 'returned') out.push({ o, kind: 'refused', ref: o, pcs: C.pieces(o) });
      if (o.partial && o.partial.backPcs) out.push({ o, kind: 'partial', ref: o.partial, pcs: o.partial.backPcs });
      if (o.exchange) out.push({ o, kind: 'exchange', ref: o.exchange, pcs: 1 });
      if (o.replacement) out.push({ o, kind: 'replace', ref: o.replacement, pcs: 1 });
    }
    return out;
  }
  function rState(it) {
    const r = it.ref;
    if (it.kind === 'refused') return r.returnChecked ? (r.returnDeclined ? 'declined' : 'approved') : r.handBack ? 'waiting' : 'coming';
    return r.checked ? (r.declined ? 'declined' : 'approved') : r.handBack ? 'waiting' : 'coming';
  }
  const KIND = { refused: ['Refused at the door', 'দরজায় নেননি', 'bad'], partial: ['Partial at the door', 'দরজায় আংশিক', 'warn'], exchange: ['Exchange — old piece', 'এক্সচেঞ্জ — পুরনো পিস', 'info'], replace: ['Replacement — old piece', 'রিপ্লেসমেন্ট — পুরনো পিস', 'accent'] };
  const erpDue = (it) => new Date(it.ref.handBack.at).getTime() + OF().erpDays * DAY - A.TODAY.getTime();
  const FR = { tab: 'requests', range: 'all', from: '', to: '' };
  const lastT = (o) => (o.timeline.length ? o.timeline[o.timeline.length - 1].t : o.created);
  const evDate = (it) => (it.ref && it.ref.handBack && it.ref.handBack.at) || lastT(it.o);
  function retSummary(S) {
    const os = A.D.orders.filter((o) => o.status === 'returned' && inSel(S, lastT(o)));
    const m = {}; os.forEach((o) => { const k = o.returnReason || 'Other'; m[k] = (m[k] || 0) + 1; });
    const top = Object.keys(m).sort((a, b) => m[b] - m[a])[0];
    return `<div class="grid g4" style="margin-bottom:12px"><div class="card">${U.kpi({ label: t('Returned parcels', 'ফেরত আসা পার্সেল'), value: os.length, icon: 'reset' })}</div><div class="card">${U.kpi({ label: t('Order value', 'অর্ডারের টাকা'), value: tk(A.sum(os, (o) => o.total)), sub: t('buying price ', 'কেনা দাম ') + tk(A.sum(os, C.cogs)), icon: 'finance' })}</div><div class="card">${U.kpi({ label: t('Most common reason', 'সবচেয়ে বেশি কারণ'), value: top ? esc(rLabel(RETURN_R, top)) : '—', sub: top ? t(`${m[top]} parcels`, `${m[top]}টি পার্সেল`) : '', icon: 'info' })}</div><div class="card"><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn" id="rt-xl">${A.icon('down')} Excel</button><button class="btn" id="rt-pdf">${A.icon('down')} PDF</button></div></div></div>${os.length ? U.card(t('Return reasons', 'ফেরতের কারণ'), barsOf(m, (k) => rLabel(RETURN_R, k))) + '<div style="height:12px"></div>' : ''}`;
  }
  function handBackModal(it) {
    const exp = expectedSkus(it); const scanned = [];
    const m = U.modal(t('Hand back to the shop', 'শপে বুঝে নিন'), `<p style="margin:0 0 10px">${t(`${it.o.id} · expected ${it.pcs} piece(s). Scan each piece’s barcode (or count by hand) and write a note. Do not grade them — the ERP checker does that.`, `${it.o.id} · আসার কথা ${it.pcs} পিস। প্রতিটি পিসের বারকোড স্ক্যান করুন (বা হাতে গুনুন) আর নোট লিখুন। গ্রেড দেবেন না — ERP-তে চেকার দেবেন।`)}</p>
      <div class="o3-scan"><input class="inp" id="hb-scan" placeholder="${t('Scan or type barcode, then Enter', 'বারকোড স্ক্যান বা টাইপ করে Enter')}" autocomplete="off"><button class="btn sm" id="hb-sim">${t('Test scan', 'টেস্ট স্ক্যান')}</button></div>
      <div class="row between" style="margin-top:10px;align-items:flex-end"><div><div class="small muted">${t('Scanned vs expected', 'স্ক্যান বনাম আসার কথা')}</div><div class="o3-count" id="hb-cnt">0 / ${it.pcs}</div></div><div style="width:120px">${U.field(t('Pieces counted', 'গোনা পিস'), U.input('hb-n', it.pcs, 'type="number" min="0" max="20"'))}</div></div>
      <div class="o3-scl" id="hb-list"></div>
      ${U.field(t('Note', 'নোট'), `<textarea class="inp" id="hb-note" rows="2" placeholder="${t('e.g. packet torn, tag on', 'যেমন: প্যাকেট ছেঁড়া, ট্যাগ আছে')}"></textarea>`)}<div id="hb-w"></div>`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="hb-ok">${t('Save hand-back', 'হ্যান্ড-ব্যাক সেভ')}</button>` });
    const w = () => { const n = +m.querySelector('#hb-n').value; m.querySelector('#hb-w').innerHTML = n < it.pcs ? U.callout(t(`${it.pcs - n} piece(s) short — claim from the courier today.`, `${it.pcs - n} পিস কম — আজই কুরিয়ারের কাছে ক্লেইম করুন।`), 'bad', 'warn') : ''; };
    const draw = () => { const left = exp.slice(); const ok = []; const bad = []; scanned.forEach((c) => { const i = left.indexOf(c); if (i >= 0) { left.splice(i, 1); ok.push(c); } else bad.push(c); }); m.querySelector('#hb-cnt').textContent = `${ok.length} / ${it.pcs}`; m.querySelector('#hb-cnt').style.color = ok.length === it.pcs ? 'var(--good)' : ''; if (scanned.length) { m.querySelector('#hb-n').value = ok.length; } m.querySelector('#hb-list').innerHTML = ok.map((c) => `<div>${U.badge('✓', 'good')}<span class="mono ellip">${esc(c)}</span></div>`).join('') + bad.map((c) => `<div>${U.badge(t('Not in this parcel', 'এই পার্সেলের নয়'), 'bad')}<span class="mono ellip">${esc(c)}</span></div>`).join('') + (scanned.length && left.length ? `<div class="muted">${t(`Still missing: ${left.join(', ')}`, `এখনো বাকি: ${left.join(', ')}`)}</div>` : ''); w(); };
    const sc = m.querySelector('#hb-scan');
    sc.onkeydown = (e) => { if (e.key === 'Enter' && sc.value.trim()) { scanned.push(sc.value.trim().toUpperCase()); sc.value = ''; draw(); } };
    m.querySelector('#hb-sim').onclick = () => { const left = exp.slice(); scanned.forEach((c) => { const i = left.indexOf(c); if (i >= 0) left.splice(i, 1); }); scanned.push(left[0] || 'EX-UNKNOWN-01'); draw(); sc.focus(); };
    m.querySelector('#hb-n').oninput = w;
    setTimeout(() => sc.focus(), 30);
    m.querySelector('#hb-ok').onclick = () => { const n = Math.max(0, +m.querySelector('#hb-n').value || 0); it.ref.handBack = { count: n, expected: it.pcs, scanned: scanned.length, note: m.querySelector('#hb-note').value, at: NOW(), by: 'You', short: n < it.pcs ? it.pcs - n : 0 }; tl(it.o, `Handed back to shop: ${n} of ${it.pcs} piece(s) counted${scanned.length ? ' (scanned)' : ''}`, `শপে বুঝে নেওয়া হয়েছে: ${it.pcs}টির মধ্যে ${n} পিস${scanned.length ? ' (স্ক্যান করে)' : ''}`);
      if (it.kind === 'replace') { const nw = A.byId(A.D.orders, it.ref.newOid); if (nw && nw.hold) { nw.hold = false; tl(nw, 'Old piece is back — replacement released to pack', 'পুরনো পিস ফেরত এসেছে — রিপ্লেসমেন্ট প্যাকে গেছে'); } }
      U.close(); A.commit(`Hand-back for ${it.o.id}`); A.toast(t(`Saved — waiting for the ERP check (${OF().erpDays} days)`, `সেভ হয়েছে — ERP চেকের অপেক্ষা (${OF().erpDays} দিন)`), 'good'); A.render(); };
  }
  function erpResult(it, ok, why) {
    const r = it.ref;
    if (it.kind === 'refused') { r.returnChecked = true; r.checkedAt = NOW(); if (!ok) { r.returnDeclined = why; r.returnCredit = 0; } }
    else { r.checked = true; r.checkedAt = NOW(); if (!ok) r.declined = why; }
    if (ok && it.kind === 'exchange' && r.walletLater) { const c = cust(it.o); if (c) c.wallet = (c.wallet || 0) + r.walletLater; tl(it.o, `Old piece passed the check — ${tk(r.walletLater)} added to wallet`, `পুরনো পিস চেকে পাস — ${tk(r.walletLater)} ওয়ালেটে গেছে`, 'ERP'); }
    else tl(it.o, ok ? 'ERP check: approved — credit back from ERP' : `ERP check: declined (our loss) — ${why}`, ok ? 'ERP চেক: অ্যাপ্রুভড — ERP থেকে ক্রেডিট' : `ERP চেক: ডিক্লাইন (আমাদের লস) — ${why}`, 'ERP');
    erpEv('return', `${it.o.id} return ${ok ? 'approved' : 'declined'} in ERP`, ok);
  }
  function exOptions(o, l) {
    const p = prod(l.pid); if (!p) return [];
    const mk = (tier, q, v) => ({ tier, pid: q.id, sku: v.sku, name: q.name, color: v.color, size: v.size, price: q.price, cat: q.cat, stock: v.stock - (v.reserved || 0) });
    const out = [];
    p.variants.filter((v) => v.color === l.color && v.size !== l.size && v.stock - (v.reserved || 0) > 0).slice(0, 3).forEach((v) => out.push(mk(1, p, v)));
    p.variants.filter((v) => v.color !== l.color && v.size === l.size && v.stock - (v.reserved || 0) > 0).slice(0, 3).forEach((v) => out.push(mk(2, p, v)));
    A.D.products.filter((q) => q.status === 'live' && q.cat === p.cat && q.id !== p.id).sort((a, b) => Math.abs(a.price - p.price) - Math.abs(b.price - p.price)).slice(0, 6).forEach((q) => { const v = q.variants.find((v) => v.size === l.size && v.stock > 0); if (v && out.filter((x) => x.tier === 3).length < 3) out.push(mk(3, q, v)); });
    A.D.products.filter((q) => q.status === 'live' && q.cat !== p.cat).slice(0, 8).forEach((q) => { const v = q.variants.find((v) => v.size === l.size && v.stock > 0); if (v && out.filter((x) => x.tier === 4).length < 2) out.push(mk(4, q, v)); });
    return out;
  }
  const TIERS = { 1: ['Same product, other size', 'একই প্রোডাক্ট, অন্য সাইজ'], 2: ['Same product, other colour', 'একই প্রোডাক্ট, অন্য রং'], 3: ['Same category, other product', 'একই ক্যাটাগরি, অন্য প্রোডাক্ট'], 4: ['Other category', 'অন্য ক্যাটাগরি'] };
  function exchangeModal2(xr, after) {
    const o = A.byId(A.D.orders, xr.oid); const l = o.lines[xr.li] || o.lines[0];
    const opts = exOptions(o, l); const left = new Date(o.deliveredAt).getTime() + OF().exHours * HOUR - A.TODAY.getTime();
    const body = `<div class="row between" style="flex-wrap:wrap;gap:6px"><div><b>${esc(o.name)}</b> · <span class="mono">${esc(o.id)}</span><div class="small">${dot(l.color)} ${esc(l.name)} · ${esc(l.color)} <span class="o2-size" style="height:20px;min-width:26px;font-size:11.5px">${esc(l.size)}</span> · ${tk(l.price)}</div></div><div class="r">${clock(left)}<div class="ord-sub">${t(`of ${OF().exHours}h after delivery`, `ডেলিভারির ${OF().exHours} ঘণ্টার মধ্যে`)}</div></div></div>
      <div class="small" style="margin:8px 0">${U.badge(xr.reason === 'defect' ? t('Defect', 'ত্রুটি') : t('Size', 'সাইজ'), xr.reason === 'defect' ? 'bad' : 'info')} ${esc(xr.note || '')}</div>
      <div class="o2-tier">${[1, 2, 3, 4].map((ti) => { const os = opts.filter((x) => x.tier === ti); return `<div class="small strong" style="margin-top:6px">${ti} · ${t(TIERS[ti][0], TIERS[ti][1])}</div>` + (os.length ? os.map((x) => `<label><input type="radio" name="xo" value="${opts.indexOf(x)}">${U.thumb({ colors: [x.color], cat: x.cat }, 30)}<span class="grow ellip" style="flex:1;min-width:0">${esc(x.name)} · ${esc(x.color)} <b>${esc(x.size)}</b></span><span class="small muted">${x.stock} ${t('left', 'আছে')}</span><b>${tk(x.price)}</b></label>`).join('') : `<div class="small muted">${t('None in stock', 'স্টকে নেই')}</div>`); }).join('')}</div>
      <label class="row small" style="gap:6px;margin-top:10px"><input type="checkbox" id="xo-fault"> ${t('Waive the exchange charge (our size chart was wrong)', 'এক্সচেঞ্জ চার্জ মাফ (আমাদের সাইজ চার্ট ভুল ছিল)')}</label>
      <div class="o2-moneybox" id="xo-money"></div>`;
    const m = U.modal(t('Exchange request', 'এক্সচেঞ্জ রিকোয়েস্ট'), body, { wide: true, foot: `<button class="btn ghost" id="xo-no">${t('Decline request', 'রিকোয়েস্ট বাতিল')}</button><button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="xo-ok">${t('Accept exchange', 'এক্সচেঞ্জ গ্রহণ')}</button>` });
    const first = m.querySelector('input[name=xo]'); if (first) first.checked = true;
    const calc = () => { const i = (m.querySelector('input[name=xo]:checked') || {}).value; const x = opts[i]; if (!x) return null; const charge = m.querySelector('#xo-fault').checked ? 0 : OF().exCharge; const diff = x.price - l.price; return { x, charge, diff, cod: Math.max(diff, 0) + charge, wallet: Math.max(-diff, 0) }; };
    const draw = () => { const c = calc(); m.querySelector('#xo-money').innerHTML = !c ? U.empty(t('Pick a new piece', 'নতুন পিস বাছুন')) : `<div class="li"><span class="grow">${t('Price difference', 'দামের পার্থক্য')}</span><b>${c.diff >= 0 ? tk(c.diff) : '−' + tk(-c.diff)}</b></div><div class="li"><span class="grow">${t('Exchange charge', 'এক্সচেঞ্জ চার্জ')}</span><b>${c.charge ? tk(c.charge) : t('None', 'নেই')}</b></div><div class="li"><span class="grow strong">${t('Customer pays on delivery (COD)', 'কাস্টমার ডেলিভারিতে দেবেন (COD)')}</span><b>${tk(c.cod)}</b></div>${c.wallet ? `<div class="li"><span class="grow">${t('Leftover to wallet after the old piece passes the check', 'পুরনো পিস চেকে পাস করলে বাকি টাকা ওয়ালেটে')}</span><b style="color:var(--good)">${tk(c.wallet)}</b></div>` : ''}<div class="small muted" style="margin-top:4px">${t(`Size exchange only. A lower price leaves the difference in the wallet. The old piece must come back within ${OF().backDays} days. Defective or wrong item? Use Replacement instead.`, `শুধু সাইজ এক্সচেঞ্জ। কম দামের হলে পার্থক্য ওয়ালেটে থাকে। পুরনো পিস ${OF().backDays} দিনের মধ্যে ফেরত আসতে হবে। ত্রুটিপূর্ণ বা ভুল আইটেম? রিপ্লেসমেন্ট ব্যবহার করুন।`)}</div>`; };
    m.querySelectorAll('input').forEach((i) => (i.onchange = draw)); draw();
    m.querySelector('#xo-no').onclick = () => { xr.status = 'rejected'; tl(o, 'Exchange request declined', 'এক্সচেঞ্জ রিকোয়েস্ট বাতিল'); U.close(); A.commit(`Exchange request ${xr.id} declined`); A.toast(t('Request declined — SMS sent to the customer', 'রিকোয়েস্ট বাতিল — কাস্টমারকে SMS গেছে'), 'good'); (after || A.render)(); };
    m.querySelector('#xo-ok').onclick = () => {
      const c = calc(); if (!c) { A.toast(t('Pick a new piece', 'নতুন পিস বাছুন'), 'bad'); return; }
      const n = { id: nextId(), created: NOW(), customerId: o.customerId, name: o.name, phone: o.phone, district: o.district, area: o.area, zone: o.zone, address: o.address, lines: [{ pid: c.x.pid, sku: c.x.sku, name: c.x.name, color: c.x.color, size: c.x.size, qty: 1, price: c.x.price, cost: (prod(c.x.pid) || {}).cost || 0 }], subtotal: c.x.price, discount: c.x.price - Math.max(c.diff, 0), coupon: '', delivery: c.charge, total: c.cod, payment: 'COD', paid: c.cod === 0, channel: 'Exchange', source: 'Exchange', courier: '', tracking: '', status: 'new', risk: 'low', notes: '', timeline: [{ t: NOW(), text: `Exchange for ${o.id}`, bn: `${o.id}-এর এক্সচেঞ্জ`, by: 'You' }], erp: { pushed: false }, deliveredAt: null, settled: false, returnReason: '', linkedTo: o.id };
      A.D.orders.unshift(n); doConfirm(n, 'staff');
      o.exchange = { xr: xr.id, newOid: n.id, pcs: 1, backBy: new Date(A.TODAY.getTime() + OF().backDays * DAY).toISOString(), walletLater: c.wallet, handBack: null };
      xr.status = 'accepted'; xr.newOid = n.id;
      tl(o, `Exchange accepted → new order ${n.id} · old piece due back in ${OF().backDays} days`, `এক্সচেঞ্জ গ্রহণ → নতুন অর্ডার ${n.id} · পুরনো পিস ${OF().backDays} দিনে ফেরত আসবে`);
      U.close(); A.commit(`Exchange ${xr.id} accepted → ${n.id}`); A.toast(t(`New order ${n.id} created and confirmed`, `নতুন অর্ডার ${n.id} তৈরি ও কনফার্ম`), 'good'); (after || A.render)();
    };
  }
  function partialModal(o, after) {
    const m = U.modal(t('Partial delivery box', 'আংশিক ডেলিভারির বক্স'), `<p class="small muted" style="margin:0 0 8px">${t('Tick the pieces the customer kept. Everything here is required.', 'কাস্টমার যে পিস রেখেছেন সেগুলো টিক দিন। সব ঘর পূরণ করতে হবে।')}</p>${o.lines.map((l, i) => `<label class="o2-li" style="cursor:pointer"><input type="checkbox" class="pd-k" data-i="${i}" ${i === 0 ? 'checked' : ''}>${dot(l.color)}<span class="grow ellip">${esc(l.name)} · ${esc(l.color)} <b>${esc(l.size)}</b> ×${l.qty}</span><b>${tk(l.price * l.qty)}</b></label>`).join('')}
      <div class="formgrid" style="margin-top:10px">${U.field(t('Amount paid to courier', 'কুরিয়ারকে দেওয়া টাকা'), U.money('pd-paid', ''))}${U.field(t('Discount given on the phone', 'ফোনে দেওয়া ছাড়'), U.money('pd-disc', 0))}</div>
      <label class="row small" style="gap:6px;margin:8px 0"><input type="checkbox" id="pd-ph"> ${t('Confirmed with the customer on the phone', 'ফোনে কাস্টমারের সাথে কনফার্ম করা হয়েছে')}</label>
      ${U.field(t('Note', 'নোট'), `<textarea class="inp" id="pd-note" rows="2" placeholder="${t('e.g. kept the polo, size L did not fit', 'যেমন: পোলো রেখেছেন, L সাইজ মেলেনি')}"></textarea>`)}`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="pd-ok">${t('Save', 'সেভ')}</button>` });
    const sug = () => { const kept = [...m.querySelectorAll('.pd-k:checked')].map((x) => o.lines[+x.dataset.i]); m.querySelector('#pd-paid').value = Math.max(0, A.sum(kept, (l) => l.price * l.qty) - Math.round(o.discount * A.sum(kept, (l) => l.price * l.qty) / (o.subtotal || 1)) + o.delivery - (o.advancePaid || 0)); };
    m.querySelectorAll('.pd-k').forEach((x) => (x.onchange = sug)); sug();
    m.querySelector('#pd-ok').onclick = () => {
      const kept = [...m.querySelectorAll('.pd-k:checked')].map((x) => +x.dataset.i); const note = m.querySelector('#pd-note').value.trim();
      if (!kept.length) return A.toast(t('Tick at least one kept piece — or use “Refused at the door”', 'অন্তত একটি রাখা পিস টিক দিন — নইলে “দরজায় নেননি”'), 'bad');
      if (!m.querySelector('#pd-ph').checked || !note) return A.toast(t('Phone confirmation and a note are required', 'ফোনে কনফার্ম ও নোট দুটোই লাগবে'), 'bad');
      const back = A.sum(o.lines.filter((l, i) => !kept.includes(i)), (l) => l.qty);
      o.partial = { kept, backPcs: back, paid: +m.querySelector('#pd-paid').value || 0, discount: +m.querySelector('#pd-disc').value || 0, confirmed: true, note, at: NOW(), handBack: null };
      o.status = 'delivered'; o.deliveredAt = NOW(); o.paid = true; o.settled = false; o.partialAtDoor = null;
      tl(o, `Partial delivery: kept ${C.pieces(o) - back} pc, ${back} coming back · paid ${tk(o.partial.paid)} · ${note}`, `আংশিক ডেলিভারি: ${C.pieces(o) - back} পিস রেখেছেন, ${back} পিস ফেরত আসছে · দিয়েছেন ${tk(o.partial.paid)} · ${note}`);
      const c = cust(o); if (c) c.delivered++;
      U.close(); A.commit(`Partial delivery saved for ${o.id}`); A.toast(t('Saved — counts as delivered, shown separately', 'সেভ হয়েছে — ডেলিভারি হিসেবে গোনা হবে, আলাদা দেখাবে'), 'good'); (after || A.render)();
    };
  }
  function sendRightSize(o) {
    const back = o.lines.filter((l, i) => !o.partial.kept.includes(i));
    const lines = back.map((l) => { const p = prod(l.pid); const sz = p ? p.sizes : [l.size]; const nx = sz[Math.min(sz.length - 1, sz.indexOf(l.size) + 1)] || l.size; const v = p && p.variants.find((v) => v.color === l.color && v.size === nx); return Object.assign({}, l, { size: nx, sku: v ? v.sku : l.sku }); });
    const n = { id: nextId(), created: NOW(), customerId: o.customerId, name: o.name, phone: o.phone, district: o.district, area: o.area, zone: o.zone, address: o.address, lines, coupon: '', payment: 'COD', paid: false, channel: 'Phone', source: 'Partial delivery', courier: '', tracking: '', status: 'new', risk: 'low', notes: '', timeline: [{ t: NOW(), text: `Right size for ${o.id}`, bn: `${o.id}-এর সঠিক সাইজ`, by: 'You' }], erp: { pushed: false }, deliveredAt: null, settled: false, returnReason: '', linkedTo: o.id };
    recalc(n); A.D.orders.unshift(n); doConfirm(n, 'staff'); o.partial.rightSize = n.id;
    tl(o, `Right size sent as ${n.id}`, `সঠিক সাইজ পাঠানো হচ্ছে ${n.id}`);
    A.commit(`Right size order ${n.id} for ${o.id}`); A.toast(t(`Linked order ${n.id} created`, `লিংক করা অর্ডার ${n.id} তৈরি`), 'good'); A.render();
  }
  function renderReturns(el) {
    const items = rItems().filter((it) => inSel(FR, evDate(it))); const xs = X().exReq.filter((x) => inSel(FR, x.at)); const f = OF();
    const reqW = xs.filter((x) => x.status === 'waiting');
    const pd = A.D.orders.filter((o) => o.partialAtDoor && o.status === 'shipped' && inSel(FR, o.partialAtDoor));
    const pdDone = A.D.orders.filter((o) => o.partial && inSel(FR, o.partial.at)).sort((a, b) => new Date(b.partial.at) - new Date(a.partial.at));
    const by = (s) => items.filter((it) => rState(it) === s);
    const coming = by('coming'), waiting = by('waiting'), approved = by('approved'), declined = by('declined');
    const handed = items.filter((it) => it.ref.handBack && ageH(it.ref.handBack.at) < 24 * 10).sort((a, b) => new Date(b.ref.handBack.at) - new Date(a.ref.handBack.at));
    const oldDue = items.filter((it) => it.kind === 'exchange' && rState(it) === 'coming' && new Date(it.ref.backBy) - A.TODAY < DAY);
    const erpSoon = waiting.filter((it) => erpDue(it) < 2 * DAY);
    const shortC = items.filter((it) => it.ref.handBack && it.ref.handBack.short && !it.ref.handBack.claimed);
    const moneyMiss = C.codWithCouriers().filter((o) => ageH(o.deliveredAt) > 5 * 24);
    const rem = [
      ['requests', reqW.length, 'Exchange requests waiting', 'এক্সচেঞ্জ রিকোয়েস্ট অপেক্ষায়', 'warn'],
      ['partial', pd.length, 'Partial delivery box empty', 'আংশিক ডেলিভারির বক্স খালি', 'warn'],
      ['coming', oldDue.length, `Old piece ${f.backDays}-day clock ending`, `পুরনো পিসের ${f.backDays} দিনের সময় শেষ হচ্ছে`, 'warn'],
      ['waiting', erpSoon.length, `${f.erpDays}-day ERP check due`, `${f.erpDays} দিনের ERP চেক বাকি`, 'warn'],
      ['handed', shortC.length, 'Short count — claim from courier today', 'পিস কম — আজই কুরিয়ারে ক্লেইম', 'bad'],
      ['money', moneyMiss.length, 'Courier says Delivered, money not in', 'কুরিয়ার বলছে ডেলিভারি, টাকা আসেনি', 'bad'],
    ];
    const TABS = [['requests', 'Exchange requests', 'এক্সচেঞ্জ রিকোয়েস্ট', reqW.length], ['partial', 'Partial deliveries', 'আংশিক ডেলিভারি', pd.length], ['coming', 'Coming back', 'ফেরত আসছে', coming.length], ['handed', 'Handed back', 'বুঝে নেওয়া', handed.length], ['waiting', 'Waiting ERP check', 'ERP চেকের অপেক্ষায়', waiting.length], ['replace', 'Replacements', 'রিপ্লেসমেন্ট', items.filter((it) => it.kind === 'replace' && rState(it) === 'coming').length], ['approved', 'Approved', 'অ্যাপ্রুভড', approved.length], ['declined', 'Declined (our loss)', 'ডিক্লাইন (আমাদের লস)', declined.length], ['cancelled', 'Cancelled', 'বাতিল', A.D.orders.filter((o) => o.status === 'cancelled' && !o.mergedInto && inSel(FR, cancelAt(o))).length]];
    if (FR.tab === 'money') FR.tab = 'coming';
    const itRow = (it, extra, btn) => `<div class="o2-li">${U.thumb({ colors: [it.o.lines[0].color], cat: (prod(it.o.lines[0].pid) || { cat: 'polo' }).cat }, 34)}<div class="grow"><div class="row" style="gap:6px;flex-wrap:wrap"><a class="strong mono" href="${A.href('orders', 'all', it.o.id)}">${esc(it.o.id)}</a>${U.badge(t(KIND[it.kind][0], KIND[it.kind][1]), KIND[it.kind][2])}<span class="ellip" style="max-width:140px">${esc(it.o.name)}</span></div><div class="ord-sub">${pcsTxt(it.pcs)}${extra ? ' · ' + extra : ''}</div></div><div class="r">${btn || ''}</div></div>`;
    const lossVal = A.sum(declined, (it) => it.kind === 'refused' ? C.cogs(it.o) : Math.round(C.cogs(it.o) / Math.max(1, C.pieces(it.o)) * it.pcs));
    let body = '';
    if (FR.tab === 'requests') body = xs.length ? xs.slice().sort((a, b) => (a.status !== 'waiting') - (b.status !== 'waiting')).map((x) => { const o = A.byId(A.D.orders, x.oid); if (!o) return ''; const l = o.lines[x.li] || o.lines[0]; const left = new Date(o.deliveredAt).getTime() + f.exHours * HOUR - A.TODAY.getTime(); return `<div class="o2-li">${U.thumb({ colors: [l.color], cat: (prod(l.pid) || { cat: 'polo' }).cat }, 34)}<div class="grow"><div class="row" style="gap:6px;flex-wrap:wrap"><a class="strong mono" href="${A.href('orders', 'all', o.id)}">${esc(o.id)}</a>${U.badge(x.reason === 'defect' ? t('Defect → Replacement', 'ত্রুটি → রিপ্লেসমেন্ট') : t('Size', 'সাইজ'), x.reason === 'defect' ? 'bad' : 'info')}<span class="ellip" style="max-width:140px">${esc(o.name)}</span></div><div class="ord-sub">${dot(l.color)} ${esc(l.name)} <b>${esc(l.size)}</b> · ${esc(x.note || '')}</div></div><div class="r">${x.status === 'waiting' ? `${clock(left)}<div style="margin-top:4px"><button class="btn sm primary" data-xr="${x.id}">${t('Open', 'খুলুন')}</button></div>` : x.status === 'accepted' ? U.badge(t(`New order ${x.newOid}`, `নতুন অর্ডার ${x.newOid}`), 'good') : U.badge(t('Declined', 'বাতিল'), '')}</div></div>`; }).join('') : U.empty(t('No exchange requests.', 'কোনো এক্সচেঞ্জ রিকোয়েস্ট নেই।'));
    else if (FR.tab === 'partial') body = (pd.length ? pd.map((o) => `<div class="o2-li"><div class="grow"><a class="strong mono" href="${A.href('orders', 'all', o.id)}">${esc(o.id)}</a> · ${esc(o.name)}<div class="ord-sub">${t('Courier report', 'কুরিয়ার রিপোর্ট')} ${A.fmt.ago(o.partialAtDoor)} · ${pcsTxt(C.pieces(o))} · ${tk(o.total)}</div></div><button class="btn sm primary" data-pd="${o.id}">${t('Fill the box', 'বক্স পূরণ করুন')}</button></div>`).join('') : U.empty(t('No partial delivery waits for the box.', 'কোনো আংশিক ডেলিভারির বক্স বাকি নেই।'))) + (pdDone.length ? `<h4 style="margin:16px 0 4px">${t('Done — counted as delivered, shown separately', 'হয়ে গেছে — ডেলিভারি হিসেবে গোনা, আলাদা দেখানো')}</h4>` + pdDone.map((o) => `<div class="o2-li"><div class="grow"><a class="strong mono" href="${A.href('orders', 'all', o.id)}">${esc(o.id)}</a> · ${esc(o.name)}<div class="ord-sub">${t(`kept ${C.pieces(o) - o.partial.backPcs} pc · paid ${tk(o.partial.paid)} · phone discount ${tk(o.partial.discount)}`, `রেখেছেন ${C.pieces(o) - o.partial.backPcs} পিস · দিয়েছেন ${tk(o.partial.paid)} · ফোনে ছাড় ${tk(o.partial.discount)}`)} · ${esc(o.partial.note)}</div></div>${o.partial.rightSize ? U.badge(t(`Linked ${o.partial.rightSize}`, `লিংক ${o.partial.rightSize}`), 'good') : `<button class="btn sm" data-rs="${o.id}">${t('Send right size', 'সঠিক সাইজ পাঠান')}</button>`}</div>`).join('') : '');
    else if (FR.tab === 'coming') body = coming.length ? coming.map((it) => itRow(it, it.kind === 'exchange' ? t('due back', 'ফেরত আসার কথা') + ' ' + clock(new Date(it.ref.backBy) - A.TODAY) : it.kind === 'refused' ? esc(rLabel(RETURN_R, it.o.returnReason || '')) : esc(it.ref.note || ''), `<button class="btn sm primary" data-hb="${items.indexOf(it)}">${t('Hand back', 'বুঝে নিন')}</button>`)).join('') : U.empty(t('Nothing on the way back.', 'ফেরতের পথে কিছু নেই।'));
    else if (FR.tab === 'handed') body = `<div class="o3-scan" style="margin-bottom:10px">${A.icon('box')}<input class="inp" id="r-scan" placeholder="${t('Scan the parcel’s tracking barcode or type the order number, then Enter', 'পার্সেলের ট্র্যাকিং বারকোড স্ক্যান করুন বা অর্ডার নম্বর লিখে Enter')}" autocomplete="off"></div><div class="small muted" style="margin-bottom:8px">${t(`${coming.length} parcel(s) on the way back. Scanning opens the count: each piece’s barcode is checked against what should be inside. Counting only — no grading here.`, `${coming.length}টি পার্সেল ফেরতের পথে। স্ক্যান করলে গোনা শুরু হয়: প্রতিটি পিসের বারকোড মিলিয়ে দেখা হয়। শুধু গোনা — এখানে গ্রেড নয়।`)}</div>` + (handed.length ? handed.map((it) => itRow(it, `${t('counted', 'গোনা')} <b>${it.ref.handBack.count} / ${it.ref.handBack.expected || it.pcs}</b>${it.ref.handBack.scanned ? ' ' + U.badge(t('scanned', 'স্ক্যান'), 'info') : ''} · ${A.fmt.ago(it.ref.handBack.at)} · ${esc(it.ref.handBack.by)}${it.ref.handBack.note ? ' · ' + esc(it.ref.handBack.note) : ''}`, it.ref.handBack.short && !it.ref.handBack.claimed ? `<button class="btn sm danger" data-claim="${items.indexOf(it)}">${t('Claim from courier', 'কুরিয়ারে ক্লেইম')}</button>` : it.ref.handBack.claimed ? U.badge(t('Claimed', 'ক্লেইম করা'), 'info') : U.badge(t((rState(it) === 'waiting' ? 'Waiting check' : 'Checked'), (rState(it) === 'waiting' ? 'চেকের অপেক্ষা' : 'চেক হয়েছে')), rState(it) === 'waiting' ? 'warn' : 'good'))).join('') : U.empty(t('No hand-backs in the last 10 days.', 'গত 10 দিনে কিছু বুঝে নেওয়া হয়নি।')));
    else if (FR.tab === 'waiting') body = `<div class="row between" style="margin-bottom:8px;flex-wrap:wrap;gap:8px"><span class="small muted">${t(`The owner approves or declines each return in the ERP within ${f.erpDays} days. The shop does not grade pieces.`, `মালিক ${f.erpDays} দিনের মধ্যে ERP-তে প্রতিটি রিটার্ন অ্যাপ্রুভ বা ডিক্লাইন করেন। শপ পিসের গ্রেড দেয় না।`)}</span><button class="btn sm" id="r-erp">${A.icon('sync')} ${t('Get ERP results', 'ERP রেজাল্ট আনুন')}</button></div>` + (waiting.length ? waiting.sort((a, b) => erpDue(a) - erpDue(b)).map((it) => itRow(it, `${t('handed back', 'বুঝে নেওয়া')} ${A.fmt.ago(it.ref.handBack.at)} · ${clock(erpDue(it))}`, `<button class="btn sm" data-rmd="${items.indexOf(it)}">${t('Remind checker', 'চেকারকে মনে করান')}</button>`)).join('') : U.empty(t('Nothing waits for the ERP check.', 'ERP চেকের অপেক্ষায় কিছু নেই।')));
    else if (FR.tab === 'replace') { const rp = items.filter((it) => it.kind === 'replace'); const dW = xs.filter((x) => x.status === 'waiting' && x.reason === 'defect'); body = `${U.callout(t('Defective or wrong item: the customer sends it back and we send the right product again, free. No money back and no wallet credit — the right piece is the fix.', 'ত্রুটিপূর্ণ বা ভুল আইটেম: কাস্টমার ফেরত পাঠান, আমরা সঠিক প্রোডাক্টটা আবার ফ্রি পাঠাই। টাকা ফেরত বা ওয়ালেট ক্রেডিট নেই — সঠিক পিসই সমাধান।'), 'info', 'info')}<div style="height:8px"></div>` + dW.map((x) => { const o = A.byId(A.D.orders, x.oid); return o ? `<div class="o2-li"><div class="grow"><a class="strong mono" href="${A.href('orders', 'all', o.id)}">${esc(o.id)}</a> · ${esc(o.name)}<div class="ord-sub">${esc(x.note || '')}</div></div><button class="btn sm primary" data-rpx="${x.id}">${t('Send replacement', 'রিপ্লেসমেন্ট পাঠান')}</button></div>` : ''; }).join('') + (rp.length ? rp.map((it) => itRow(it, `${esc(it.ref.note || '')} · ${t('new piece', 'নতুন পিস')} <a href="${A.href('orders', 'all', it.ref.newOid)}">${esc(it.ref.newOid)}</a>${rState(it) === 'coming' ? ' · ' + clock(new Date(it.ref.backBy) - A.TODAY) : ''}`, rState(it) === 'coming' ? `<button class="btn sm primary" data-hb="${items.indexOf(it)}">${t('Hand back', 'বুঝে নিন')}</button>` : U.badge(t(rState(it) === 'waiting' ? 'Waiting check' : rState(it) === 'approved' ? 'Approved' : 'Declined', rState(it) === 'waiting' ? 'চেকের অপেক্ষা' : rState(it) === 'approved' ? 'অ্যাপ্রুভড' : 'ডিক্লাইন'), rState(it) === 'declined' ? 'bad' : rState(it) === 'waiting' ? 'warn' : 'good'))).join('') : (dW.length ? '' : U.empty(t('No replacements yet.', 'এখনো কোনো রিপ্লেসমেন্ট নেই।')))); }
    else if (FR.tab === 'approved') body = approved.length ? approved.slice(0, 40).map((it) => itRow(it, `${t('credit', 'ক্রেডিট')} ${tk(it.kind === 'refused' ? C.cogs(it.o) : Math.round(C.cogs(it.o) / Math.max(1, C.pieces(it.o)) * it.pcs))}${it.kind === 'exchange' && it.ref.walletLater ? ' · ' + t('wallet', 'ওয়ালেট') + ' ' + tk(it.ref.walletLater) : ''}`, U.badge(t('Approved', 'অ্যাপ্রুভড'), 'good'))).join('') : U.empty(t('No approved returns yet.', 'এখনো কোনো অ্যাপ্রুভড রিটার্ন নেই।'));
    else if (FR.tab === 'cancelled') body = cancelledView(FR);
    else body = `${U.callout(t(`Declined pieces stay as our loss: ${tk(lossVal)} at buying price.`, `ডিক্লাইন হওয়া পিস আমাদের লস: কেনা দামে ${tk(lossVal)}।`), 'bad', 'warn')}<div style="height:8px"></div>` + (declined.length ? declined.map((it) => itRow(it, esc(it.kind === 'refused' ? it.ref.returnDeclined : it.ref.declined), U.badge(t('Our loss', 'আমাদের লস'), 'bad'))).join('') : U.empty(t('Nothing declined.', 'কিছু ডিক্লাইন হয়নি।')));
    el.innerHTML = A.pageHead(t('Returns & exchanges', 'রিটার্ন ও এক্সচেঞ্জ'), t('Separate paths: refused at the door, partial at the door, size exchange, and free replacement for a defective or wrong item', 'আলাদা পথ: দরজায় নেননি, দরজায় আংশিক, সাইজ এক্সচেঞ্জ, আর ত্রুটিপূর্ণ বা ভুল আইটেমের ফ্রি রিপ্লেসমেন্ট')) + A.tabsBar('orders', 'returns') + dateBar(FR, 'r-dr') + (FR.tab === 'cancelled' ? '' : retSummary(FR)) + `
      <div class="o2-rem">${rem.map((r) => `<a class="${r[1] ? r[4] : 'ok'}" data-rt="${r[0]}">${A.icon(r[1] ? 'bell' : 'check')}<span><b>${r[1]}</b> · ${t(r[2], r[3])}</span></a>`).join('')}</div>
      <div class="chips" id="r-tabs">${TABS.map((x) => `<button class="chip ${FR.tab === x[0] ? 'on' : ''}" data-t="${x[0]}">${t(x[1], x[2])} <span class="muted">${x[3]}</span></button>`).join('')}</div>
      <div style="height:10px"></div>${U.card('', body)}`;
    dateWire(el, FR, 'r-dr');
    [['rt-xl', 'returns', 'xlsx'], ['rt-pdf', 'returns', 'pdf'], ['cx-xl', 'cancelled-orders', 'xlsx'], ['cx-pdf', 'cancelled-orders', 'pdf']].forEach((d) => { const b = el.querySelector('#' + d[0]); if (b) b.onclick = () => U.download(`${d[1]}-${A.fmt.ymd(A.TODAY)}.${d[2]}`); });
    el.querySelectorAll('#r-tabs [data-t]').forEach((b) => (b.onclick = () => { FR.tab = b.dataset.t; A.render(); }));
    el.querySelectorAll('[data-rt]').forEach((b) => (b.onclick = () => { if (b.dataset.rt === 'money') { A.go('finance'); return; } FR.tab = b.dataset.rt; A.render(); }));
    el.querySelectorAll('[data-xr]').forEach((b) => (b.onclick = () => { const xr = xs.find((x) => x.id === b.dataset.xr); return xr.reason === 'defect' ? replaceModal(xr) : exchangeModal2(xr); }));
    el.querySelectorAll('[data-rpx]').forEach((b) => (b.onclick = () => replaceModal(xs.find((x) => x.id === b.dataset.rpx))));
    const hs = el.querySelector('#r-scan'); if (hs) hs.onkeydown = (e) => { if (e.key !== 'Enter' || !hs.value.trim()) return; const v = hs.value.trim().toUpperCase(); const it = coming.find((x) => x.o.id.toUpperCase() === v || String(x.o.tracking || '').toUpperCase() === v); if (!it) { A.toast(t('No parcel on the way back with that code', 'এই কোডে ফেরতের পথে কোনো পার্সেল নেই'), 'bad'); return; } handBackModal(it); };
    el.querySelectorAll('[data-pd]').forEach((b) => (b.onclick = () => partialModal(A.byId(A.D.orders, b.dataset.pd))));
    el.querySelectorAll('[data-rs]').forEach((b) => (b.onclick = () => sendRightSize(A.byId(A.D.orders, b.dataset.rs))));
    el.querySelectorAll('[data-hb]').forEach((b) => (b.onclick = () => handBackModal(items[+b.dataset.hb])));
    el.querySelectorAll('[data-claim]').forEach((b) => (b.onclick = () => { const it = items[+b.dataset.claim]; it.ref.handBack.claimed = NOW(); addClaim({ oid: it.o.id, courier: it.o.courier, type: 'return_short', amount: Math.round(C.cogs(it.o) / Math.max(1, C.pieces(it.o)) * it.ref.handBack.short), deadline: new Date(A.TODAY.getTime() + 7 * DAY).toISOString(), status: 'sent', note: `${it.ref.handBack.short} piece(s) missing from the returned parcel` }); tl(it.o, `Claimed ${it.ref.handBack.short} missing piece(s) from ${cname(it.o.courier)}`, `${cname(it.o.courier)}-এর কাছে ${it.ref.handBack.short} পিসের ক্লেইম`); A.commit(`Courier claim for ${it.o.id}`); A.toast(t('Claim sent to the courier', 'কুরিয়ারকে ক্লেইম পাঠানো হয়েছে'), 'good'); A.render(); }));
    el.querySelectorAll('[data-rmd]').forEach((b) => (b.onclick = () => { const it = items[+b.dataset.rmd]; A.commit(`Reminded ERP checker about ${it.o.id}`); A.toast(t('Reminder sent to the ERP checker', 'ERP চেকারকে রিমাইন্ডার গেছে'), 'good'); }));
    const re = el.querySelector('#r-erp'); if (re) re.onclick = () => { const ready = waiting.filter((it) => ageH(it.ref.handBack.at) > 20); if (!ready.length) { A.toast(t('No new results from the ERP yet', 'ERP থেকে এখনো নতুন রেজাল্ট আসেনি')); return; } let dn = 0; ready.forEach((it) => { const bad = H(it.o, 'erp' + it.kind) < 0.18; if (bad) dn++; erpResult(it, !bad, bad ? 'Washed, smell of perfume' : ''); }); A.commit(`ERP results: ${ready.length - dn} approved, ${dn} declined`); A.toast(t(`ERP: ${ready.length - dn} approved, ${dn} declined`, `ERP: ${ready.length - dn}টি অ্যাপ্রুভড, ${dn}টি ডিক্লাইন`), 'good'); A.render(); };
  }

  /* ================= INCOMPLETE ORDERS ================= */
  const FI = { f: 'open' };
  function renderIncomplete(el) {
    const L = A.D.abandoned; const MAX = 2;
    const sentBy = {}; L.forEach((a) => (sentBy[a.phone] = (sentBy[a.phone] || 0) + (a.msgs || 0)));
    const open = L.filter((a) => !a.recovered);
    const fresh = open.filter((a) => !a.msgs && sentBy[a.phone] < MAX && a.phone);
    const rec = L.filter((a) => a.recovered);
    const list = FI.f === 'open' ? open : FI.f === 'fresh' ? fresh : rec;
    const stepC = {}; open.forEach((a) => (stepC[a.step] = (stepC[a.step] || 0) + 1));
    const topStep = Object.keys(stepC).sort((a, b) => stepC[b] - stepC[a])[0];
    const STEPS = { Address: ['Address', 'ঠিকানা'], Payment: ['Payment', 'পেমেন্ট'], Delivery: ['Delivery', 'ডেলিভারি'], Phone: ['Phone', 'ফোন'] };
    el.innerHTML = A.pageHead(t('Incomplete orders', 'অসম্পূর্ণ অর্ডার'), t('People who started checkout but did not finish', 'যারা চেকআউট শুরু করে শেষ করেননি'), `<button class="btn primary" id="i-all" ${fresh.length ? '' : 'disabled'} title="${t('not messaged yet', 'এখনো মেসেজ পাঠানো হয়নি')}">${A.icon('send')} ${t(`Remind all (${fresh.length})`, `সবাইকে মনে করান (${fresh.length})`)}</button>`) + A.tabsBar('orders', 'incomplete') + `
      <div class="grid g4" style="margin-bottom:14px">
        <div class="card">${U.kpi({ label: t('Incomplete', 'অসম্পূর্ণ'), value: open.length, sub: tk(A.sum(open, (a) => a.value)), icon: 'orders' })}</div>
        <div class="card">${U.kpi({ label: t('Not messaged yet', 'এখনো মেসেজ যায়নি'), value: fresh.length, sub: t('“Remind all” sends to these', '“সবাইকে মনে করান” এদের কাছে যায়'), icon: 'send' })}</div>
        <div class="card">${U.kpi({ label: t('Came back and ordered', 'ফিরে এসে অর্ডার'), value: rec.length, sub: A.fmt.pct(L.length ? rec.length / L.length * 100 : 0), icon: 'check' })}</div>
        <div class="card">${U.kpi({ label: t('Most stop at', 'বেশিরভাগ থামেন'), value: topStep ? t(STEPS[topStep][0], STEPS[topStep][1]) : '—', sub: topStep ? t(`${stepC[topStep]} people`, `${stepC[topStep]} জন`) : '', icon: 'info' })}</div>
      </div>
      ${U.callout(t(`Each person gets at most ${MAX} messages ever — never more, so nobody feels chased.`, `প্রত্যেকে সব মিলিয়ে সর্বোচ্চ ${MAX}টি মেসেজ পান — এর বেশি কখনো না, যাতে কেউ বিরক্ত না হন।`))}
      <div style="height:10px"></div>
      <div class="chips" id="i-f">${[['open', 'Open', 'চালু', open.length], ['fresh', 'Not messaged yet', 'মেসেজ যায়নি', fresh.length], ['rec', 'Ordered later', 'পরে অর্ডার দিয়েছেন', rec.length]].map((c) => `<button class="chip ${FI.f === c[0] ? 'on' : ''}" data-f="${c[0]}">${t(c[1], c[2])} <span class="muted">${c[3]}</span></button>`).join('')}</div><div style="height:10px"></div>
      ${U.table([
        { h: t('Person', 'ব্যক্তি'), f: (a) => `<b>${esc(a.name || t('No name', 'নাম নেই'))}</b><div class="ord-sub mono">${esc(a.phone)}</div>` },
        { h: t('Item', 'আইটেম'), hide: true, f: (a) => `<span class="ellip" style="display:inline-block;max-width:180px">${esc(a.item)}</span>` },
        { h: t('Value', 'মূল্য'), r: true, f: (a) => `<b>${tk(a.value)}</b>` },
        { h: t('Stopped at', 'যেখানে থেমেছেন'), hide: true, f: (a) => t(STEPS[a.step][0], STEPS[a.step][1]) },
        { h: t('When', 'কখন'), hide: true, f: (a) => A.fmt.ago(a.at) },
        { h: t('Messages', 'মেসেজ'), r: true, f: (a) => `${sentBy[a.phone] || 0}/${MAX}` },
        { h: '', r: true, f: (a) => a.recovered ? U.badge(t('Ordered', 'অর্ডার দিয়েছেন'), 'good') : sentBy[a.phone] >= MAX ? U.badge(t('Limit reached', 'সীমা শেষ'), '') : `<button class="btn sm" data-rm="${a.id}">${t('Remind', 'মনে করান')}</button>` },
      ], list.map((a) => Object.assign({ _id: a.id }, a)), { empty: t('Nobody here.', 'এখানে কেউ নেই।') })}`;
    const send = (a) => { a.msgs = (a.msgs || 0) + 1; a.messaged = true; a.lastMsg = NOW(); };
    el.querySelectorAll('#i-f [data-f]').forEach((b) => (b.onclick = () => { FI.f = b.dataset.f; A.render(); }));
    el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { const a = L.find((x) => x.id === b.dataset.rm); send(a); A.commit(`Reminder sent to ${a.phone}`); A.toast(t('Reminder sent by SMS with a link back to the cart', 'কার্টে ফেরার লিংকসহ SMS গেছে'), 'good'); A.render(); }));
    const ia = el.querySelector('#i-all'); if (ia) ia.onclick = () => U.confirm(t(`Remind ${fresh.length} people?`, `${fresh.length} জনকে মনে করাবেন?`), t(`Only people not messaged yet get one SMS with a link back to their cart. Cost about ৳${(fresh.length * 0.35).toFixed(2)}.`, `শুধু যাদের এখনো মেসেজ যায়নি, তারা কার্টে ফেরার লিংকসহ একটি SMS পাবেন। খরচ প্রায় ৳${(fresh.length * 0.35).toFixed(2)}।`), t('Send', 'পাঠান'), () => { fresh.forEach(send); A.commit(`Reminded ${fresh.length} incomplete orders`); A.toast(t(`${fresh.length} reminders sent`, `${fresh.length}টি রিমাইন্ডার গেছে`), 'good'); A.render(); });
  }

  /* ================= ROUND 2: replacement, holds, bulk, call desk, peak, courier safety ================= */
  A.css('orders3', `
  .o3-hold{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:4px}
  .o3-hold b{color:var(--ink)}
  .o3-desk{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:14px;align-items:start}
  .o3-st{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,auto);gap:4px 14px;font-size:13px;align-items:center}
  .o3-st b{font-variant-numeric:tabular-nums;text-align:right}
  .o3-st .h{font-size:11.5px;color:var(--muted);font-weight:600}
  .o3-outs{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:10px}
  .o3-outs button{justify-content:center}
  .o3-banner{border:1px solid var(--warn);background:color-mix(in srgb,var(--warn) 8%,var(--card));border-radius:14px;padding:14px;margin-bottom:14px}
  .o3-banner.off{border-color:var(--line);background:var(--card)}
  .o3-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .o3-row>*{min-width:0}
  .o3-roster{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
  .o3-roster label{display:flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:5px 9px;font-size:13px;cursor:pointer;background:var(--card)}
  .o3-parts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .o3-scan{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .o3-scan .inp{flex:1;min-width:160px;font-family:var(--mono,monospace)}
  .o3-scl{display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:13px}
  .o3-scl div{display:flex;gap:8px;align-items:center;min-width:0}
  .o3-count{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums}
  .o3-bk{border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--card);display:flex;flex-direction:column;gap:8px;min-width:0}
  .o3-bt{display:flex;gap:8px;align-items:center;font-size:13px;padding:5px 0;border-top:1px dashed var(--line);flex-wrap:wrap}
  .o3-sz{display:grid;grid-template-columns:repeat(auto-fit,minmax(58px,1fr));gap:6px}
  .o3-sz label{display:flex;flex-direction:column;gap:2px;font-size:12px;font-weight:600;text-align:center}
  .o3-sz .inp{text-align:center;padding:6px 4px}
  .o3-q{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
  .o3-q table{width:100%;border-collapse:collapse;font-size:13px}
  .o3-q td,.o3-q th{padding:5px 4px;border-bottom:1px solid var(--line);text-align:left}
  .o3-q .r{text-align:right}
  .o3-mask{letter-spacing:.5px;color:var(--muted)}
  @media (max-width:860px){.o3-desk{grid-template-columns:minmax(0,1fr)}}
  `);
  const R2 = () => {
    const x = X();
    if (!x.r2) x.r2 = { calls: [], caller: 'Nusrat', peak: { on: false, cap: 250, part: 25, roster: [{ name: 'Sohel', shift: '10 AM – 6 PM', on: true }, { name: 'Jamal', shift: '2 PM – 10 PM', on: true }, { name: 'Rakib', shift: '6 PM – 2 AM', on: false }] }, fallback: { on: false, to: '' }, claims: [], bulk: [], stuckH: 48, seeded: false };
    return x.r2;
  };
  const STAFF = () => { const n = (A.D.staff || []).filter((s) => !/Owner|Marketing/.test(s.role)).map((s) => s.name); return n.length ? n : ['Nusrat', 'Rafi']; };
  const hm = (ms) => { const d = new Date(ms + 6 * HOUR); let h = d.getUTCHours(); const m = String(d.getUTCMinutes()).padStart(2, '0'); const pm = h >= 12; h = h % 12 || 12; return `${h}:${m} ${pm ? 'PM' : 'AM'}`; };
  const holdHours = () => (A.D.rules.stockHold && A.D.rules.stockHold.placedHours) || (A.D.rules.holds && A.D.rules.holds.orderHours) || 12;
  const defCourier = () => (R2().fallback.on && R2().fallback.to ? R2().fallback.to : OF().courier);
  const maskPhone = (p) => String(p || '').slice(0, 3) + '•••••' + String(p || '').slice(-3);
  const maskAddr = (o) => `${o.area || ''}${o.area ? ', ' : ''}${o.district || ''}`;
  let VIEW = 'owner'; try { VIEW = localStorage.getItem('extas.ord.viewAs') || 'owner'; } catch (e) { /* private window */ }

  /* --- seed sample states once --- */
  function r2Init() {
    const r = R2(); if (r.seeded) return; r.seeded = true;
    const sod = SOD(); const st = STAFF();
    for (const o of A.D.orders) {
      if (new Date(o.created) < sod - DAY) continue;
      o.timeline.filter((e) => /^Called — no answer/.test(e.text)).forEach((e) => r.calls.push({ oid: o.id, at: e.t, by: e.by || st[0], out: 'noanswer' }));
      if (o.cBy === 'staff') r.calls.push({ oid: o.id, at: new Date(Math.min(A.TODAY.getTime(), new Date(o.created).getTime() + (0.3 + H(o, 'cl')) * HOUR)).toISOString(), by: st[Math.floor(H(o, 'who') * st.length)], out: 'confirmed' });
    }
    const ship = A.D.orders.filter((o) => ['shipped', 'returned', 'delivered'].includes(o.status) && o.courier);
    const cl = claimsArr(); const mk = (o, type, amt, daysAgo, status, rec, note) => o && cl.push({ id: 'CL-' + (401 + cl.length), oid: o.id, courier: o.courier, type, amount: amt, at: new Date(A.TODAY - daysAgo * DAY).toISOString(), deadline: new Date(A.TODAY - daysAgo * DAY + 10 * DAY).toISOString(), status, recovered: rec || 0, note: note || '' });
    if (!cl.length && !A.D.claimsSeeded) {
      A.D.claimsSeeded = true;
      mk(ship[5], 'lost', C.cogs(ship[5] || { lines: [] }) || 1150, 3, 'sent', 0, 'Not moving for 4 days');
      mk(ship[9], 'damaged', 690, 12, 'won', 690, 'Parcel arrived torn');
      mk(ship.find((o) => o.status === 'delivered' && o.payment === 'COD'), 'short_cod', 200, 6, 'open', 0, 'Rider gave back less cash');
    }
    const p = A.D.products.find((q) => q.status === 'live' && q.cat === 'polo') || A.D.products[0];
    const sizes = (p.sizes || ['M', 'L', 'XL']).slice(0, 4);
    const sz = {}; sizes.forEach((s, i) => (sz[s] = [20, 40, 30, 10][i] || 10));
    r.bulk.push({ id: 'BK-101', created: new Date(A.TODAY - 4 * DAY).toISOString(), company: 'Northwind Garments Ltd', contact: 'Arif Chowdhury (Admin)', phone: '01711-220044', items: [{ pid: p.id, name: p.name, color: p.colors[0], sizes: sz }], mode: 'tier', price: 650, tiers: [[50, 720], [100, 650], [200, 610]], advPct: 50, advPaid: true, balPaid: false, batches: [{ no: 1, pcs: 50, date: new Date(A.TODAY - 1 * DAY).toISOString(), status: 'delivered' }, { no: 2, pcs: 50, date: new Date(A.TODAY.getTime() + 2 * DAY).toISOString(), status: 'waiting' }], logo: true });
    A.save ? A.save() : A.commit();
  }

  /* --- 2. stock hold line --- */
  function holdLine(o) {
    const what = o.lines.map((l) => `${l.qty} × ${esc(l.color)} ${esc(l.size)}`).join(', ');
    if (o.rsv && ['confirmed', 'booked', 'packed'].includes(o.status)) return `<div class="o3-hold">${U.badge(t('Held in ERP', 'ERP-তে হোল্ড'), 'good')}<span>${t(`${what} — kept for this order until the courier takes it`, `${what} — কুরিয়ার নেওয়া পর্যন্ত এই অর্ডারের জন্য রাখা`)}</span></div>`;
    if (o.status !== 'new') return '';
    if (noStock(o)) return `<div class="o3-hold">${U.badge(t('No stock', 'স্টক নেই'), 'bad')}<span>${t('Nothing to hold — call the customer (wait, swap, send the rest or cancel)', 'হোল্ড করার মতো স্টক নেই — কাস্টমারকে কল দিন (অপেক্ষা, বদল, বাকিটা পাঠানো বা বাতিল)')}</span></div>`;
    const until = new Date(o.created).getTime() + holdHours() * HOUR;
    if (until > A.TODAY.getTime()) return `<div class="o3-hold">${U.badge(t('Holding', 'হোল্ডে'), 'info')}<span>${t(`Holding <b>${what}</b> until <b>${hm(until)}</b> (released if not confirmed)`, `<b>${what}</b> হোল্ডে <b>${hm(until)}</b> পর্যন্ত (কনফার্ম না হলে ছেড়ে দেওয়া হবে)`)}</span></div>`;
    return `<div class="o3-hold">${U.badge(t('Hold ended', 'হোল্ড শেষ'), 'warn')}<span>${t(`Hold on ${what} ended at ${hm(until)} — the size shows on the site again. Confirming holds it again if stock is there.`, `${what}-এর হোল্ড ${hm(until)}-এ শেষ — সাইটে সাইজটা আবার দেখাচ্ছে। স্টক থাকলে কনফার্ম করলে আবার হোল্ড হবে।`)}</span></div>`;
  }

  /* --- 1. replacement for defective / wrong item --- */
  function replaceModal(xr, after) {
    const o = A.byId(A.D.orders, xr.oid); const l = o.lines[xr.li] || o.lines[0];
    const p = prod(l.pid); const v0 = variant(l);
    const opts = [];
    if (v0 && v0.stock - (v0.reserved || 0) > 0) opts.push({ tier: 0, pid: l.pid, sku: l.sku, name: l.name, color: l.color, size: l.size, price: l.price, cat: (p || { cat: 'polo' }).cat, stock: v0.stock - (v0.reserved || 0) });
    exOptions(o, l).filter((x) => x.tier <= 2 && x.size === l.size).forEach((x) => opts.push(x));
    let why = xr.why || (xr.reason === 'wrong' ? 'wrong' : 'defect');
    const fee = C.courierFee(o) || 60;
    const body = `<div class="row between" style="flex-wrap:wrap;gap:6px"><div><b>${esc(o.name)}</b> · <span class="mono">${esc(o.id)}</span><div class="small">${dot(l.color)} ${esc(l.name)} · ${esc(l.color)} <span class="o2-size" style="height:20px;min-width:26px;font-size:11.5px">${esc(l.size)}</span></div></div>${U.badge(t('Replacement', 'রিপ্লেসমেন্ট'), 'accent')}</div>
      <div style="margin:10px 0">${U.seg('rp-why', [['defect', t('Defective piece', 'ত্রুটিপূর্ণ পিস')], ['wrong', t('Wrong item sent', 'ভুল আইটেম গেছে')]], why)}</div>
      ${U.field(t('What went wrong', 'কী সমস্যা'), `<input class="inp" id="rp-note" value="${esc(xr.note || '')}" placeholder="${t('e.g. stitch open at the side', 'যেমন: পাশের সেলাই খোলা')}">`)}
      <div class="small strong" style="margin:8px 0 4px">${t('Send the right piece', 'সঠিক পিস পাঠান')}</div>
      <div class="o2-tier">${opts.length ? opts.map((x, i) => `<label><input type="radio" name="rp" value="${i}" ${i ? '' : 'checked'}>${U.thumb({ colors: [x.color], cat: x.cat }, 30)}<span class="grow ellip" style="flex:1;min-width:0">${esc(x.name)} · ${esc(x.color)} <b>${esc(x.size)}</b>${x.tier === 0 ? ` <span class="muted">· ${t('same as ordered', 'অর্ডারের মতোই')}</span>` : ''}</span><span class="small muted">${x.stock} ${t('left', 'আছে')}</span></label>`).join('') : U.callout(t('This size is out of stock in every colour. Save it as waiting — it goes out by itself when ERP stock arrives.', 'এই সাইজ কোনো রঙেই স্টকে নেই। অপেক্ষায় সেভ করুন — ERP স্টক এলে নিজেই যাবে।'), 'warn', 'warn')}</div>
      <label class="row small" style="gap:6px;margin-top:10px"><input type="checkbox" id="rp-now" checked> ${t('Send the new piece now (don’t wait for the old one)', 'নতুন পিস এখনই পাঠান (পুরনোটার জন্য অপেক্ষা নয়)')}</label>
      <div class="o2-moneybox"><div class="li"><span class="grow strong">${t('Customer pays', 'কাস্টমার দেবেন')}</span><b>${tk(0)}</b></div><div class="li"><span class="grow">${t('Delivery both ways', 'দুই দিকের ডেলিভারি')}</span><b>${t('Free — shop pays', 'ফ্রি — শপ দেবে')}</b></div><div class="li"><span class="grow">${t('Our courier cost', 'আমাদের কুরিয়ার খরচ')}</span><b>${tk(fee * 2)}</b></div>
      <div class="small muted" style="margin-top:4px">${t(`The customer sends the old piece back (within ${OF().backDays} days) and gets the right product again, free. No money back and no wallet credit for this — the right piece is the fix.`, `কাস্টমার পুরনো পিস ফেরত পাঠাবেন (${OF().backDays} দিনের মধ্যে) আর সঠিক প্রোডাক্টটা আবার ফ্রি পাবেন। এতে টাকা ফেরত বা ওয়ালেট ক্রেডিট নেই — সঠিক পিসই সমাধান।`)}</div></div>`;
    const m = U.modal(t('Defective or wrong item', 'ত্রুটিপূর্ণ বা ভুল আইটেম'), body, { wide: true, foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="rp-ok">${t('Send replacement', 'রিপ্লেসমেন্ট পাঠান')}</button>` });
    m.querySelectorAll('#rp-why button').forEach((b) => (b.onclick = () => { why = b.dataset.v; m.querySelectorAll('#rp-why button').forEach((x) => x.classList.toggle('on', x === b)); }));
    m.querySelector('#rp-ok').onclick = () => {
      const i = (m.querySelector('input[name=rp]:checked') || {}).value; const x = opts[i];
      const note = m.querySelector('#rp-note').value.trim() || (why === 'wrong' ? 'Wrong item sent' : 'Defective piece');
      const now = m.querySelector('#rp-now').checked;
      const line = x ? { pid: x.pid, sku: x.sku, name: x.name, color: x.color, size: x.size, qty: 1, price: x.price, cost: (prod(x.pid) || {}).cost || 0 } : Object.assign({}, l, { qty: 1 });
      const n = { id: nextId(), created: NOW(), customerId: o.customerId, name: o.name, phone: o.phone, district: o.district, area: o.area, zone: o.zone, address: o.address, lines: [line], subtotal: line.price, discount: line.price, coupon: '', delivery: 0, total: 0, payment: o.payment, paid: true, channel: 'Replacement', source: 'Replacement', courier: '', tracking: '', status: 'new', risk: 'low', notes: '', timeline: [{ t: NOW(), text: `Replacement for ${o.id} — ${note}`, bn: `${o.id}-এর রিপ্লেসমেন্ট — ${note}`, by: 'You' }], erp: { pushed: false }, deliveredAt: null, settled: false, returnReason: '', linkedTo: o.id };
      A.D.orders.unshift(n);
      if (x) { doConfirm(n, 'staff'); if (!now) { n.hold = true; tl(n, 'Waits until the old piece is handed back', 'পুরনো পিস বুঝে নেওয়া পর্যন্ত অপেক্ষা'); } } else { n.stockWait = NOW(); tl(n, 'Waiting for ERP stock', 'ERP স্টকের অপেক্ষা'); }
      o.replacement = { xr: xr.id, newOid: n.id, why, note, pcs: 1, backBy: new Date(A.TODAY.getTime() + OF().backDays * DAY).toISOString(), handBack: null };
      xr.status = 'accepted'; xr.newOid = n.id; xr.why = why;
      tl(o, `Replacement sent free → ${n.id} · ${note} · old piece due back in ${OF().backDays} days`, `ফ্রি রিপ্লেসমেন্ট → ${n.id} · ${note} · পুরনো পিস ${OF().backDays} দিনে ফেরত আসবে`);
      U.close(); A.commit(`Replacement ${n.id} for ${o.id}`); A.toast(t(`Replacement ${n.id} created — free for the customer`, `রিপ্লেসমেন্ট ${n.id} তৈরি — কাস্টমারের জন্য ফ্রি`), 'good'); (after || A.render)();
    };
  }
  function startReplace(o) {
    const xr = { id: 'XR' + (400 + X().exReq.length), oid: o.id, li: 0, reason: 'defect', note: '', at: NOW(), status: 'waiting' };
    X().exReq.unshift(xr); replaceModal(xr);
  }

  /* --- 8. rider overcharge --- */
  function overchargeModal(o) {
    const c = cust(o);
    const m = U.modal(t('Rider took extra money', 'রাইডার বেশি টাকা নিয়েছেন'), `${U.callout(t(`The customer paid the rider more than ${tk(o.total)}. Return the extra to the customer’s wallet now and claim it from ${cname(o.courier) || 'the courier'}.`, `কাস্টমার রাইডারকে ${tk(o.total)}-এর বেশি দিয়েছেন। বাড়তি টাকা এখনই কাস্টমারের ওয়ালেটে দিন আর ${cname(o.courier) || 'কুরিয়ার'}-এর কাছে ক্লেইম করুন।`), 'warn', 'warn')}
      <div class="formgrid" style="margin-top:10px">${U.field(t('Rider took (extra)', 'রাইডার বাড়তি নিয়েছেন'), U.money('oc-a', 50))}${U.field(t('How we know', 'কীভাবে জানলাম'), U.select('oc-src', [['call', t('Customer called', 'কাস্টমার কল দিয়েছেন')], ['msg', t('Customer messaged', 'কাস্টমার মেসেজ দিয়েছেন')], ['review', t('Review', 'রিভিউ')]], 'call'))}</div>
      ${U.field(t('Owner PIN', 'মালিকের PIN'), U.input('oc-pin', '', 'type="password" inputmode="numeric" maxlength="6" placeholder="••••"'), t('Any 4 digits work in this prototype.', 'এই প্রোটোটাইপে যেকোনো 4 সংখ্যা দিলেই হবে।'))}`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="oc-ok">${t('Return to wallet', 'ওয়ালেটে ফেরত দিন')}</button>` });
    m.querySelector('#oc-ok').onclick = () => {
      const a = Math.round(+m.querySelector('#oc-a').value || 0);
      if (a <= 0 || a > 2000) return A.toast(t('Type an amount between ৳1 and ৳2,000', '৳1 থেকে ৳2,000-এর মধ্যে টাকা দিন'), 'bad');
      if (!/^\d{4,6}$/.test(m.querySelector('#oc-pin').value)) return A.toast(t('Type your 4-digit PIN', '4 সংখ্যার PIN দিন'), 'bad');
      o.overcharge = { amount: a, at: NOW(), by: 'You' };
      if (c) { c.wallet = (c.wallet || 0) + a; (A.D.loyaltyLog = A.D.loyaltyLog || []).unshift({ t: NOW(), cid: c.id, name: c.name, kind: 'wallet', amount: a, reason: `Rider overcharge on ${o.id}`, by: 'You' }); }
      addClaim({ oid: o.id, courier: o.courier, type: 'rider', amount: a, note: 'Rider took extra from the customer' });
      tl(o, `Rider took ${tk(a)} extra — returned to the customer’s wallet (PIN) · claim opened with ${cname(o.courier)}`, `রাইডার ${tk(a)} বাড়তি নিয়েছেন — কাস্টমারের ওয়ালেটে ফেরত (PIN) · ${cname(o.courier)}-এ ক্লেইম খোলা হয়েছে`);
      U.close(); A.commit(`Rider overcharge ${tk(a)} on ${o.id} returned to wallet`); A.toast(t(`${tk(a)} added to the wallet · claim opened`, `ওয়ালেটে ${tk(a)} যোগ হয়েছে · ক্লেইম খোলা হয়েছে`), 'good'); A.render();
    };
  }

  /* --- 4. call desk --- */
  const OUTS = { confirmed: ['Confirmed', 'কনফার্মড', 'good'], noanswer: ['No answer', 'ধরেননি', 'warn'], wrong: ['Wrong number', 'ভুল নম্বর', 'bad'], change: ['Wants change', 'বদল চান', 'info'], cancelled: ['Cancelled', 'বাতিল', ''] };
  const RETRY = [30, 120, 'next'];
  function logCall(o, out) { R2().calls.push({ oid: o.id, at: NOW(), by: R2().caller, out }); }
  function nextCall(o) {
    const n = o.calls || 0; if (!n || o.status !== 'new') return null;
    if (n > RETRY.length) return { done: true };
    const last = R2().calls.filter((x) => x.oid === o.id && x.out === 'noanswer').map((x) => new Date(x.at).getTime()).sort((a, b) => b - a)[0] || new Date(o.created).getTime() + HOUR;
    const r = RETRY[n - 1];
    if (r === 'next') { const d = new Date(SOD() + DAY + 5 * HOUR); return { at: d.getTime(), next: true }; }
    return { at: last + r * 6e4 };
  }
  function nextTxt(o) {
    const nc = nextCall(o); if (!nc) return '';
    if (nc.done) return `<span class="small" style="color:var(--bad)">${t('3 tries done — a person decides (auto-cancel is off)', '3 বার চেষ্টা শেষ — মানুষ ঠিক করবেন (অটো-বাতিল বন্ধ)')}</span>`;
    const due = nc.at <= A.TODAY.getTime();
    return `<span class="small" style="color:var(--${due ? 'bad' : 'muted'})">${due ? t('Call again now', 'এখনই আবার কল দিন') : t(`Next call ${nc.next ? 'tomorrow ' : ''}${hm(nc.at)}`, `পরের কল ${nc.next ? 'আগামীকাল ' : ''}${hm(nc.at)}`)}</span>`;
  }
  function callModal(o) {
    const log = R2().calls.filter((x) => x.oid === o.id);
    const m = U.modal(t(`Call ${o.name}`, `${o.name}-কে কল`), `<div class="o3-row" style="justify-content:space-between"><div><div class="strong mono" style="font-size:20px">${esc(o.phone)}</div><div class="small muted">${esc(o.id)} · ${tk(o.total)} · ${esc(o.payment)}</div></div><a class="btn primary" href="tel:${esc(o.phone)}" id="cm-dial">${A.icon('phone')} ${t('Call now', 'এখনই কল')}</a></div>
      <div class="small muted" style="margin-top:8px">${t(`Calling as ${R2().caller}`, `${R2().caller} হিসেবে কল`)} · ${nextTxt(o) || t('first call', 'প্রথম কল')}</div>
      <div class="small strong" style="margin-top:12px">${t('How did the call go?', 'কল কেমন হলো?')}</div>
      <div class="o3-outs">${Object.keys(OUTS).map((k) => `<button class="btn ${k === 'confirmed' ? 'primary' : k === 'cancelled' ? 'ghost' : ''}" data-out="${k}">${t(OUTS[k][0], OUTS[k][1])}</button>`).join('')}</div>
      <div class="small strong" style="margin-top:14px">${t(`Attempts (${log.length})`, `চেষ্টা (${log.length})`)}</div>
      ${log.length ? log.slice().reverse().map((x) => `<div class="o2-li">${U.badge(t(OUTS[x.out][0], OUTS[x.out][1]), OUTS[x.out][2])}<span class="grow small">${esc(x.by)}</span><span class="small muted">${A.fmt.ago(x.at)}</span></div>`).join('') : `<div class="small muted">${t('No calls yet.', 'এখনো কল হয়নি।')}</div>`}
      <div class="small muted" style="margin-top:8px">${t('Retry after no answer: 30 minutes → 2 hours → next day 11 AM. Change it in Rules › Order flow.', 'ধরেননি হলে আবার কল: 30 মিনিট → 2 ঘণ্টা → পরদিন সকাল 11টা। রুলস › অর্ডার ফ্লো-তে বদলান।')}</div>`, { foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button>` });
    m.querySelector('#cm-dial').addEventListener('click', () => A.toast(t('Calling from your phone…', 'আপনার ফোন থেকে কল হচ্ছে…')));
    m.querySelectorAll('[data-out]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.out; U.close();
      if (k === 'confirmed') { if (noStock(o)) { logCall(o, 'confirmed'); return stockModal(o); } logCall(o, 'confirmed'); return act(o, 'confirm'); }
      if (k === 'noanswer') return act(o, 'noans');
      if (k === 'wrong') { logCall(o, 'wrong'); o.wrongNumber = true; tl(o, 'Wrong number — SMS sent asking for the right number', 'ভুল নম্বর — সঠিক নম্বর চেয়ে SMS গেছে'); A.commit(`Wrong number on ${o.id}`); A.toast(t('Saved · SMS sent asking for the right number', 'সেভ হয়েছে · সঠিক নম্বর চেয়ে SMS গেছে'), 'good'); return A.render(); }
      if (k === 'change') { logCall(o, 'change'); tl(o, 'Customer wants a change (call)', 'কাস্টমার বদল চান (কল)'); A.commit(`${o.id} wants a change`); return editLinesModal(o); }
      if (k === 'cancelled') return reasonModal(t('Cancel this order?', 'অর্ডার বাতিল করবেন?'), CANCEL_R, t('Cancel order', 'অর্ডার বাতিল'), (rr) => { logCall(o, 'cancelled'); cancelOrder(o, rr); A.commit(`Cancelled ${o.id} on call`); A.toast(t('Order cancelled · hold released', 'অর্ডার বাতিল · হোল্ড ছেড়ে দেওয়া হয়েছে'), 'good'); A.render(); });
    }));
  }
  function callDesk(q) {
    const r = R2(); const sod = SOD(); const today = r.calls.filter((x) => new Date(x.at) >= sod);
    const st = Array.from(new Set([...STAFF(), ...today.map((x) => x.by)]));
    const rows = st.map((s) => { const m = today.filter((x) => x.by === s); return [s, m.length, m.filter((x) => x.out === 'confirmed').length, m.filter((x) => x.out === 'noanswer').length]; });
    const due = q.filter((o) => { const nc = nextCall(o); return nc && !nc.done && nc.at <= A.TODAY.getTime(); });
    return `<div class="o3-desk">${U.card(t('Call desk', 'কল ডেস্ক'), `<div class="o3-row" style="margin-bottom:10px"><span class="small strong">${t('Calling as', 'যে কল দিচ্ছেন')}</span>${U.select('cd-who', st.map((s) => [s, s]), r.caller, 'style="width:auto"')}</div>
        <div class="o3-st"><span class="h">${t('Staff today', 'আজ স্টাফ')}</span><span class="h">${t('Calls', 'কল')}</span><span class="h">${t('Confirmed', 'কনফার্ম')}</span><span class="h">${t('No answer', 'ধরেননি')}</span>${rows.map((x) => `<span>${esc(x[0])}${x[0] === r.caller ? ` ${U.badge(t('you', 'আপনি'), 'accent')}` : ''}</span><b>${x[1]}</b><b>${x[2]}</b><b>${x[3]}</b>`).join('')}</div>`, { sub: t('Click “Call” on an order, then pick how the call went.', 'অর্ডারে “কল” চাপুন, তারপর কল কেমন হলো বাছুন।') })}
      ${U.card(t(`Call again now (${due.length})`, `এখনই আবার কল (${due.length})`), due.length ? due.slice(0, 6).map((o) => `<div class="o2-li"><b class="mono">${esc(o.id)}</b><span class="grow ellip">${esc(o.name)} · ${t(`${o.calls} tries`, `${o.calls} বার`)}</span><button class="btn sm primary" data-cdo="${o.id}">${A.icon('phone')} ${t('Call', 'কল')}</button></div>`).join('') : U.empty(t('No call is due right now.', 'এখন কোনো কল বাকি নেই।')), { sub: t('Retry: 30 min → 2 hours → next day 11 AM', 'আবার কল: 30 মিনিট → 2 ঘণ্টা → পরদিন সকাল 11টা') })}</div>`;
  }

  /* --- 3. bulk & corporate --- */
  const bkPcs = (b) => A.sum(b.items, (it) => A.sum(Object.values(it.sizes), (n) => +n || 0));
  const bkUnit = (b) => { if (b.mode !== 'tier') return b.price; const n = bkPcs(b); let u = b.tiers[0][1]; for (const tr of b.tiers) if (n >= tr[0]) u = tr[1]; return u; };
  const bkTotal = (b) => bkPcs(b) * bkUnit(b);
  const bkAdv = (b) => Math.round(bkTotal(b) * b.advPct / 100);
  const BST = { waiting: ['Waiting', 'অপেক্ষায়', 'warn'], packed: ['Packed', 'প্যাকড', 'info'], shipped: ['With courier', 'কুরিয়ারে', 'info'], delivered: ['Delivered', 'ডেলিভারি হয়েছে', 'good'] };
  const BNEXT = { waiting: 'packed', packed: 'shipped', shipped: 'delivered' };
  function bkState(b) { if (b.balPaid) return [t('Done', 'শেষ'), 'good']; if (!b.advPaid) return [t('Quote sent', 'কোটেশন গেছে'), 'warn']; if (b.batches.every((x) => x.status === 'delivered')) return [t('Balance due', 'বাকি টাকা পাওনা'), 'bad']; return [t('In delivery', 'ডেলিভারি চলছে'), 'info']; }
  function quotePaper(b, invoice) {
    const no = (invoice ? 'INV-' : 'Q-') + b.id.slice(3);
    return `<div class="o3-q"><div class="o2-lh"><h2>EXTAS</h2><span class="small muted">${invoice ? t('Company invoice', 'কোম্পানি ইনভয়েস') : t('Quotation', 'কোটেশন')} ${no} · ${A.fmt.dateY(invoice ? A.TODAY : b.created)}</span></div>
      <div class="small" style="margin:6px 0 10px"><b>${esc(b.company)}</b><br>${esc(b.contact)} · ${esc(b.phone)}</div>
      <table><thead><tr><th>${t('Item', 'আইটেম')}</th><th>${t('Sizes', 'সাইজ')}</th><th class="r">${t('Pieces', 'পিস')}</th><th class="r">${t('Price', 'দাম')}</th><th class="r">${t('Amount', 'টাকা')}</th></tr></thead><tbody>${b.items.map((it) => { const n = A.sum(Object.values(it.sizes), (x) => +x || 0); return `<tr><td>${esc(it.name)} · ${esc(it.color)}</td><td>${Object.entries(it.sizes).filter((x) => +x[1]).map((x) => `${esc(x[0])} ${x[1]}`).join(', ')}</td><td class="r">${n}</td><td class="r">${tk(bkUnit(b))}</td><td class="r">${tk(n * bkUnit(b))}</td></tr>`; }).join('')}</tbody></table>
      <div class="ord-money" style="margin-top:8px"><div class="li tot"><span class="grow">${t('Total', 'মোট')} · ${bkPcs(b)} ${t('pcs', 'পিস')}</span><b>${tk(bkTotal(b))}</b></div><div class="li"><span class="grow">${t(`Advance (${b.advPct}%)`, `অ্যাডভান্স (${b.advPct}%)`)}${b.advPaid ? ' ✓' : ''}</span><b>${tk(bkAdv(b))}</b></div><div class="li"><span class="grow">${t('Balance', 'বাকি')}${b.balPaid ? ' ✓' : ''}</span><b>${tk(bkTotal(b) - bkAdv(b))}</b></div></div>
      ${b.mode === 'tier' ? `<div class="small muted" style="margin-top:6px">${t('Price by quantity', 'পরিমাণ অনুযায়ী দাম')}: ${b.tiers.map((x) => `${x[0]}+ → ${tk(x[1])}`).join(' · ')}</div>` : ''}
      <div class="small muted" style="margin-top:6px">${t(`Delivery in ${b.batches.length} batch${b.batches.length > 1 ? 'es' : ''}. ${invoice ? 'Paid by bank transfer or bKash Merchant.' : 'Quote valid for 15 days.'}`, `${b.batches.length} ব্যাচে ডেলিভারি। ${invoice ? 'ব্যাংক ট্রান্সফার বা বিকাশ মার্চেন্টে পেমেন্ট।' : 'কোটেশন 15 দিন চলবে।'}`)}</div></div>`;
  }
  function bulkCard(b) {
    const s = bkState(b);
    return `<div class="o3-bk"><div class="row between" style="flex-wrap:wrap;gap:6px"><div style="min-width:0"><b class="mono">${esc(b.id)}</b> ${U.badge(s[0], s[1])}<div class="strong ellip" style="font-size:15px">${esc(b.company)}</div><div class="ord-sub">${esc(b.contact)} · ${esc(b.phone)}</div></div><div class="r"><b style="font-size:17px">${tk(bkTotal(b))}</b><div class="ord-sub">${bkPcs(b)} ${t('pcs', 'পিস')} · ${tk(bkUnit(b))}/${t('pc', 'পিস')}</div></div></div>
      <div class="small">${b.items.map((it) => `${dot(it.color)} ${esc(it.name)} · ${Object.entries(it.sizes).filter((x) => +x[1]).map((x) => `${esc(x[0])} ${x[1]}`).join(' · ')}`).join('<br>')}</div>
      <div class="ord-money"><div class="li"><span class="grow">${t(`Advance ${b.advPct}%`, `অ্যাডভান্স ${b.advPct}%`)}</span><b>${tk(bkAdv(b))}</b>${b.advPaid ? U.badge(t('Received', 'পেয়েছি'), 'good') : `<button class="btn sm" data-bk="adv" data-id="${b.id}">${t('Advance received', 'অ্যাডভান্স পেয়েছি')}</button>`}</div><div class="li"><span class="grow">${t('Balance', 'বাকি')}</span><b>${tk(bkTotal(b) - bkAdv(b))}</b>${b.balPaid ? U.badge(t('Received', 'পেয়েছি'), 'good') : b.advPaid && b.batches.every((x) => x.status === 'delivered') ? `<button class="btn sm primary" data-bk="bal" data-id="${b.id}">${t('Balance received', 'বাকি টাকা পেয়েছি')}</button>` : `<span class="small muted">${t('after last batch', 'শেষ ব্যাচের পর')}</span>`}</div></div>
      <div>${b.batches.map((x, i) => `<div class="o3-bt"><b>${t(`Batch ${x.no}`, `ব্যাচ ${x.no}`)}</b><span>${x.pcs} ${t('pcs', 'পিস')}</span><span class="muted grow">${A.fmt.date(x.date)}</span>${U.badge(t(BST[x.status][0], BST[x.status][1]), BST[x.status][2])}${BNEXT[x.status] && b.advPaid ? `<button class="btn sm" data-bk="next" data-id="${b.id}" data-i="${i}">→ ${t(BST[BNEXT[x.status]][0], BST[BNEXT[x.status]][1])}</button>` : ''}</div>`).join('')}</div>
      <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm" data-bk="quote" data-id="${b.id}">${t('Quote PDF', 'কোটেশন PDF')}</button><button class="btn sm" data-bk="inv" data-id="${b.id}">${t('Company invoice', 'কোম্পানি ইনভয়েস')}</button></div></div>`;
  }
  function bulkWire(el) {
    el.querySelectorAll('[data-bk]').forEach((btn) => (btn.onclick = (e) => {
      e.stopPropagation(); const b = R2().bulk.find((x) => x.id === btn.dataset.id); const k = btn.dataset.bk;
      if (k === 'quote' || k === 'inv') { const m = U.modal(k === 'inv' ? t('Company invoice', 'কোম্পানি ইনভয়েস') : t('Quote preview', 'কোটেশন প্রিভিউ'), quotePaper(b, k === 'inv'), { wide: true, foot: `<button class="btn" data-close>${t('Close', 'বন্ধ')}</button><button class="btn primary" id="bq-dl">${A.icon('down')} PDF</button>` }); m.querySelector('#bq-dl').onclick = () => U.download(`${k === 'inv' ? 'invoice' : 'quote'}-${b.id}.pdf`); return; }
      if (k === 'adv' || k === 'bal') return pinModal(k === 'adv' ? t('Advance received?', 'অ্যাডভান্স পেয়েছেন?') : t('Balance received?', 'বাকি টাকা পেয়েছেন?'), t(`${esc(b.company)} paid ${tk(k === 'adv' ? bkAdv(b) : bkTotal(b) - bkAdv(b))}. This goes to Finance as money received.`, `${esc(b.company)} ${tk(k === 'adv' ? bkAdv(b) : bkTotal(b) - bkAdv(b))} দিয়েছেন। এটা ফিন্যান্সে টাকা পাওয়া হিসেবে যাবে।`), t('Save', 'সেভ'), () => { if (k === 'adv') b.advPaid = NOW(); else b.balPaid = NOW(); A.commit(`${b.id} ${k === 'adv' ? 'advance' : 'balance'} received`); A.toast(t('Payment saved', 'পেমেন্ট সেভ হয়েছে'), 'good'); A.render(); });
      if (k === 'next') { const x = b.batches[+btn.dataset.i]; x.status = BNEXT[x.status]; if (x.status === 'shipped') x.tracking = 'PTH' + Math.floor(1000000 + hash(b.id + x.no) * 8999999); A.commit(`${b.id} batch ${x.no} → ${x.status}`); A.toast(t(`Batch ${x.no}: ${BST[x.status][0]}`, `ব্যাচ ${x.no}: ${BST[x.status][1]}`), 'good'); A.render(); }
    }));
  }
  function bulkDrawer() {
    const live = A.D.products.filter((p) => p.status === 'live');
    const st = { items: [], pid: live[0].id, mode: 'piece' };
    const formItem = () => { const p = A.byId(A.D.products, st.pid); return `${U.field(t('Style', 'স্টাইল'), U.select('bd-p', live.map((q) => [q.id, q.name]), st.pid))}${U.field(t('Colour', 'রং'), U.select('bd-c', p.colors.map((c) => [c, c]), p.colors[0]))}<div class="small strong" style="margin:4px 0">${t('Pieces per size', 'সাইজ অনুযায়ী পিস')}</div><div class="o3-sz">${p.sizes.map((s) => `<label>${esc(s)}<input class="inp bd-s" data-s="${esc(s)}" type="number" min="0" value="0"></label>`).join('')}</div><button class="btn sm" id="bd-add" style="margin-top:8px">${A.icon('plus')} ${t('Add to order', 'অর্ডারে যোগ')}</button>`; };
    const body = `<div class="formgrid">${U.field(t('Company', 'কোম্পানি'), U.input('bd-co', '', `placeholder="${t('e.g. Northwind Ltd', 'যেমন: Northwind Ltd')}"`))}${U.field(t('Contact person', 'যোগাযোগের মানুষ'), U.input('bd-ct', ''))}${U.field(t('Phone', 'ফোন'), U.input('bd-ph', '', 'inputmode="tel"'))}</div>
      <div class="card" style="margin:10px 0;padding:12px" id="bd-item">${formItem()}</div>
      <div id="bd-lines"></div>
      ${U.field(t('Price', 'দাম'), U.seg('bd-mode', [['piece', t('One price per piece', 'প্রতি পিস একই দাম')], ['tier', t('Price by quantity', 'পরিমাণ অনুযায়ী দাম')]], 'piece'))}
      <div id="bd-price"></div>
      <div class="formgrid">${U.field(t('Advance', 'অ্যাডভান্স'), U.select('bd-adv', [['30', '30%'], ['50', '50%'], ['100', t('100% before delivery', 'ডেলিভারির আগে 100%')]], '50'))}${U.field(t('Deliver in batches', 'কয় ব্যাচে ডেলিভারি'), U.select('bd-bt', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']], '2'))}</div>
      <div class="o2-moneybox" id="bd-sum"></div>`;
    const d = U.drawer(t('New bulk order', 'নতুন বাল্ক অর্ডার'), body, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn" id="bd-q">${t('Quote PDF', 'কোটেশন PDF')}</button><button class="btn primary" id="bd-ok">${t('Save & send quote', 'সেভ করে কোটেশন পাঠান')}</button>` });
    const $ = (s) => d.querySelector(s);
    const price = () => { $('#bd-price').innerHTML = st.mode === 'piece' ? U.field(t('Agreed price per piece', 'প্রতি পিসের ঠিক করা দাম'), U.money('bd-pr', 650)) : `<div class="formgrid">${[[50, 720], [100, 650], [200, 610]].map((x, i) => U.field(t(`From pieces`, `কত পিস থেকে`), `<div class="o3-row" style="flex-wrap:nowrap"><input class="inp bd-tq" type="number" value="${x[0]}" style="width:70px"><input class="inp bd-tp" type="number" value="${x[1]}" style="width:90px"></div>`, i ? '' : t('pieces · price', 'পিস · দাম'))).join('')}</div>`; d.querySelectorAll('#bd-price input').forEach((i) => (i.oninput = sum)); };
    const draft = () => ({ id: 'BK-' + (101 + R2().bulk.length), created: NOW(), company: $('#bd-co').value.trim(), contact: $('#bd-ct').value.trim(), phone: $('#bd-ph').value.trim(), items: st.items, mode: st.mode, price: +(($('#bd-pr') || {}).value || 0), tiers: [...d.querySelectorAll('.bd-tq')].map((q, i) => [+q.value || 0, +d.querySelectorAll('.bd-tp')[i].value || 0]).sort((a, b) => a[0] - b[0]), advPct: +$('#bd-adv').value, advPaid: false, balPaid: false, batches: [] });
    const sum = () => { const b = draft(); if (!b.tiers.length) b.tiers = [[0, 0]]; const n = bkPcs(b); $('#bd-lines').innerHTML = st.items.length ? st.items.map((it, i) => `<div class="o2-li">${dot(it.color)}<span class="grow ellip">${esc(it.name)} · ${esc(it.color)} · ${Object.entries(it.sizes).filter((x) => +x[1]).map((x) => `${esc(x[0])} ${x[1]}`).join(', ')}</span><button class="btn sm ghost" data-rm="${i}">×</button></div>`).join('') : `<div class="small muted">${t('No styles added yet.', 'এখনো কোনো স্টাইল যোগ হয়নি।')}</div>`; d.querySelectorAll('[data-rm]').forEach((x) => (x.onclick = () => { st.items.splice(+x.dataset.rm, 1); sum(); })); const nb = +$('#bd-bt').value; $('#bd-sum').innerHTML = `<div class="li"><span class="grow">${t('Pieces', 'পিস')}</span><b>${n}</b></div><div class="li"><span class="grow">${t('Price per piece', 'প্রতি পিস')}</span><b>${tk(bkUnit(b))}</b></div><div class="li tot"><span class="grow">${t('Total', 'মোট')}</span><b>${tk(bkTotal(b))}</b></div><div class="li"><span class="grow">${t('Advance', 'অ্যাডভান্স')}</span><b>${tk(bkAdv(b))}</b></div><div class="li"><span class="grow">${t('Balance', 'বাকি')}</span><b>${tk(bkTotal(b) - bkAdv(b))}</b></div><div class="small muted">${t(`${nb} batch${nb > 1 ? 'es' : ''} of about ${Math.ceil(n / nb)} pcs`, `${nb}টি ব্যাচ, প্রতিটায় প্রায় ${Math.ceil(n / nb)} পিস`)}</div>`; };
    const wireItem = () => { $('#bd-p').onchange = (e) => { st.pid = e.target.value; $('#bd-item').innerHTML = formItem(); wireItem(); }; $('#bd-add').onclick = () => { const p = A.byId(A.D.products, st.pid); const sizes = {}; d.querySelectorAll('.bd-s').forEach((i) => { if (+i.value > 0) sizes[i.dataset.s] = +i.value; }); if (!Object.keys(sizes).length) return A.toast(t('Type pieces for at least one size', 'অন্তত একটি সাইজে পিস লিখুন'), 'bad'); st.items.push({ pid: p.id, name: p.name, color: $('#bd-c').value, sizes }); d.querySelectorAll('.bd-s').forEach((i) => (i.value = 0)); sum(); }; };
    wireItem(); price(); sum();
    d.querySelectorAll('#bd-mode button').forEach((b) => (b.onclick = () => { st.mode = b.dataset.v; d.querySelectorAll('#bd-mode button').forEach((x) => x.classList.toggle('on', x === b)); price(); sum(); }));
    $('#bd-adv').onchange = sum; $('#bd-bt').onchange = sum;
    const ready = () => { const b = draft(); if (!b.company || !b.phone) { A.toast(t('Company and phone are needed', 'কোম্পানি ও ফোন লাগবে'), 'bad'); return null; } if (!st.items.length) { A.toast(t('Add at least one style', 'অন্তত একটি স্টাইল যোগ করুন'), 'bad'); return null; } if (!bkUnit(b)) { A.toast(t('Type the agreed price', 'ঠিক করা দাম লিখুন'), 'bad'); return null; } const nb = +$('#bd-bt').value; const n = bkPcs(b); let left = n; b.batches = Array.from({ length: nb }, (_, i) => { const pc = i === nb - 1 ? left : Math.ceil(n / nb); left -= pc; return { no: i + 1, pcs: pc, date: new Date(A.TODAY.getTime() + (3 + i * 4) * DAY).toISOString(), status: 'waiting' }; }); return b; };
    $('#bd-q').onclick = () => { const b = ready(); if (!b) return; const w = window.open('', '_blank'); if (w) { w.document.write(`<title>${b.id}</title><body style="font-family:sans-serif;padding:24px">${quotePaper(b, false)}</body>`); w.document.close(); } else A.toast(t('Quote ready — allow pop-ups to preview', 'কোটেশন রেডি — প্রিভিউ দেখতে পপ-আপ চালু করুন')); };
    $('#bd-ok').onclick = () => { const b = ready(); if (!b) return; R2().bulk.unshift(b); U.close(); A.commit(`Bulk order ${b.id} for ${b.company}`); A.toast(t(`${b.id} saved · quote sent to ${b.company}`, `${b.id} সেভ · ${b.company}-কে কোটেশন গেছে`), 'good'); F.st = 'bulk'; A.render(); };
  }
  function bulkView() {
    const L = R2().bulk; const open = L.filter((b) => !b.balPaid);
    const due = A.sum(L.filter((b) => b.advPaid && !b.balPaid), (b) => bkTotal(b) - bkAdv(b));
    return `<div class="grid g3" style="margin-bottom:12px"><div class="card">${U.kpi({ label: t('Open bulk orders', 'চালু বাল্ক অর্ডার'), value: open.length, sub: t(`${A.sum(open, bkPcs)} pieces`, `${A.sum(open, bkPcs)} পিস`), icon: 'box' })}</div><div class="card">${U.kpi({ label: t('Order value', 'অর্ডারের মূল্য'), value: tk(A.sum(open, bkTotal)), icon: 'finance' })}</div><div class="card">${U.kpi({ label: t('Balance to collect', 'বাকি টাকা আদায়'), value: tk(due), icon: 'warn' })}</div></div>
      ${L.length ? `<div class="grid g2">${L.map(bulkCard).join('')}</div>` : U.empty(t('No bulk orders yet. Press “New bulk order”.', 'এখনো বাল্ক অর্ডার নেই। “নতুন বাল্ক অর্ডার” চাপুন।'))}`;
  }

  /* --- 5. peak / Eid mode in To pack --- */
  function peakBanner(ok) {
    const p = R2().peak; const e = A.D.rules.eid || {}; const sod = SOD();
    const confToday = A.D.orders.filter((o) => o.cBy && new Date(o.created) >= sod && o.status !== 'cancelled').length;
    const cut = (d) => { if (!d) return ['—', '']; const left = Math.ceil((new Date(d + 'T23:59:00+06:00') - A.TODAY) / DAY); return [A.fmt.date(d), left < 0 ? 'bad' : left <= 3 ? 'warn' : 'good', left]; };
    const ci = cut(e.insideLast), co = cut(e.outsideLast);
    const parts = Math.ceil(ok.length / (p.part || 25));
    return `<div class="o3-banner ${p.on ? '' : 'off'}"><div class="row between" style="flex-wrap:wrap;gap:8px"><div class="o3-row"><b>${t('Peak / Eid mode', 'পিক / ঈদ মোড')}</b>${p.on ? U.badge(t('On', 'চালু'), 'warn') : U.badge(t('Off', 'বন্ধ'), '')}</div>${U.switch('pk-on', p.on)}</div>
      ${p.on ? `<div class="grid g3" style="margin-top:10px"><div><div class="small muted">${t('Daily capacity', 'দিনের ক্ষমতা')}</div><div class="o3-row"><b style="font-size:20px">${confToday} / ${p.cap}</b><input class="inp" id="pk-cap" type="number" value="${p.cap}" style="width:80px"></div>${U.bar(confToday / p.cap * 100, confToday >= p.cap ? 'var(--bad)' : 'var(--warn)')}<div class="small muted">${confToday >= p.cap ? t('Cap reached — new orders say “ships tomorrow” on the site', 'সীমা পূর্ণ — সাইটে নতুন অর্ডারে “আগামীকাল যাবে” দেখাবে') : t(`${p.cap - confToday} more today, then “ships tomorrow”`, `আজ আরও ${p.cap - confToday}টি, তারপর “আগামীকাল যাবে”`)}</div></div>
        <div><div class="small muted">${t('Delivery before Eid — cut-off', 'ঈদের আগে ডেলিভারি — শেষ সময়')}</div><div class="small" style="margin-top:4px">${t('Inside Dhaka', 'ঢাকার ভেতরে')}: <b style="color:var(--${ci[1]})">${ci[0]}</b></div><div class="small">${t('Outside Dhaka', 'ঢাকার বাইরে')}: <b style="color:var(--${co[1]})">${co[0]}</b></div><div class="small muted">${t('After the cut-off the site says “Delivery after Eid”', 'শেষ সময়ের পর সাইটে “ঈদের পরে ডেলিভারি” দেখাবে')} · <a href="${A.href('rules', 'all')}">${t('Change', 'বদলান')}</a></div></div>
        <div><div class="small muted">${t('Packers on shift', 'শিফটে প্যাকার')}</div><div class="o3-roster">${p.roster.map((r, i) => `<label><input type="checkbox" data-ro="${i}" ${r.on ? 'checked' : ''}>${esc(r.name)} <span class="muted">${esc(r.shift)}</span></label>`).join('')}</div></div></div>
        <div class="o3-row" style="margin-top:10px"><span class="small strong">${t('Print all in parts of', 'সব প্রিন্ট, প্রতি ভাগে')}</span>${U.select('pk-part', [['10', '10'], ['25', '25'], ['50', '50'], ['100', '100']], String(p.part), 'style="width:auto"')}<span class="small muted">${t('orders', 'অর্ডার')}</span></div>
        ${ok.length ? `<div class="o3-parts">${Array.from({ length: parts }, (_, i) => `<button class="btn sm" data-part="${i}">${A.icon('print')} ${t(`Part ${i + 1}`, `ভাগ ${i + 1}`)} · ${i * p.part + 1}–${Math.min(ok.length, (i + 1) * p.part)}</button>`).join('')}</div>` : ''}` : `<div class="small muted" style="margin-top:6px">${t('Turn on before Eid or a big sale: a daily cap, delivery cut-off dates on the site, printing in parts and a packer roster.', 'ঈদ বা বড় সেলের আগে চালু করুন: দিনের সীমা, সাইটে ডেলিভারির শেষ তারিখ, ভাগে ভাগে প্রিন্ট আর প্যাকারের রোস্টার।')}</div>`}</div>`;
  }
  function peakWire(el, list, problems, ok) {
    const p = R2().peak;
    const sw = el.querySelector('#pk-on'); if (sw) sw.onchange = () => { p.on = sw.checked; A.commit(`Peak mode ${p.on ? 'on' : 'off'}`); A.toast(p.on ? t('Peak mode on — cap and cut-off show on the site', 'পিক মোড চালু — সীমা ও শেষ সময় সাইটে দেখাবে') : t('Peak mode off', 'পিক মোড বন্ধ'), 'good'); A.render(); };
    const cap = el.querySelector('#pk-cap'); if (cap) cap.onchange = () => { p.cap = Math.max(1, +cap.value || 1); A.commit(`Daily cap ${p.cap}`); A.toast(t(`Daily cap set to ${p.cap}`, `দিনের সীমা ${p.cap}`), 'good'); A.render(); };
    const pt = el.querySelector('#pk-part'); if (pt) pt.onchange = () => { p.part = +pt.value; A.commit(`Print parts of ${p.part}`); A.render(); };
    el.querySelectorAll('[data-ro]').forEach((c) => (c.onchange = () => { const r = p.roster[+c.dataset.ro]; r.on = c.checked; A.commit(`${r.name} ${r.on ? 'on' : 'off'} shift`); A.toast(t(`${r.name} ${r.on ? 'on shift' : 'off shift'}`, `${r.name} ${r.on ? 'শিফটে' : 'শিফটে নেই'}`), 'good'); }));
    el.querySelectorAll('[data-part]').forEach((b) => (b.onclick = () => { const i = +b.dataset.part; printAllModal(ok.slice(i * p.part, (i + 1) * p.part), []); }));
  }

  /* --- 6. with courier: stuck parcels, fallback, claims summary (the full ledger lives in Couriers › Claims & payouts) --- */
  const lastMoveH = (o) => (o.stuckAsked ? 1 : H(o, 'mv') < 0.18 ? 40 + H(o, 'mv2') * 50 : H(o, 'mv2') * 30);
  const HUBS = ['Mirpur hub', 'Tejgaon sorting', 'Chattogram hub', 'Out for delivery', 'Sylhet hub'];
  const CT = { lost: ['Lost parcel', 'হারানো পার্সেল'], damaged: ['Damaged', 'ক্ষতিগ্রস্ত'], short_cod: ['Short COD', 'COD কম'], rider: ['Rider overcharge', 'রাইডারের বাড়তি টাকা'], return_short: ['Short count on return', 'ফেরতে পিস কম'] };
  const claimsArr = () => (A.D.claims = A.D.claims || []);
  function addClaim(c) {
    const list = claimsArr(); const id = c.id || 'CL-' + (401 + list.length);
    const cl = Object.assign({ id, oid: '', courier: '', type: 'lost', amount: 0, at: NOW(), deadline: new Date(A.TODAY.getTime() + 10 * DAY).toISOString(), status: 'open', recovered: 0, note: '' }, c, { id });
    list.unshift(cl); return cl;
  }
  function courierSafety(withC) {
    const r = R2(); const N = r.stuckH;
    const stuck = withC.filter((o) => lastMoveH(o) >= N).sort((a, b) => lastMoveH(b) - lastMoveH(a));
    const main = OF().courier; const others = A.D.couriers.filter((c) => c.id !== main);
    const moveable = A.D.orders.filter((o) => ['booked', 'packed'].includes(o.status));
    const cl = claimsArr(); const live = cl.filter((c) => c.status === 'open' || c.status === 'sent'); const openAmt = A.sum(live, (c) => Math.max(0, c.amount - (c.recovered || 0))); const rec = A.sum(cl, (c) => c.recovered || 0);
    const stuckCard = U.card(t(`Stuck parcels (${stuck.length})`, `আটকে থাকা পার্সেল (${stuck.length})`), `<div class="o3-row" style="margin-bottom:6px"><span class="small">${t('Alert when a parcel has no movement for', 'পার্সেল কত ঘণ্টা না নড়লে সতর্ক করবে')}</span>${U.select('cs-n', [['24', t('24 hours', '24 ঘণ্টা')], ['48', t('48 hours', '48 ঘণ্টা')], ['72', t('72 hours', '72 ঘণ্টা')]], String(N), 'style="width:auto"')}</div>${stuck.length ? stuck.slice(0, 8).map((o) => `<div class="o2-li">${A.icon('warn')}<div class="grow"><b class="mono">${esc(o.id)}</b> <span class="small">${esc(o.tracking)}</span><div class="ord-sub">${esc(HUBS[Math.floor(H(o, 'hub') * HUBS.length)])} · ${t(`no movement ${Math.round(lastMoveH(o))}h`, `${Math.round(lastMoveH(o))} ঘণ্টা নড়েনি`)}</div></div><button class="btn sm" data-stk2="${o.id}">${t('Ask courier', 'কুরিয়ারকে জানান')}</button>${lastMoveH(o) > 72 ? `<button class="btn sm danger" data-lost="${o.id}">${t('Claim as lost', 'হারানো হিসেবে ক্লেইম')}</button>` : ''}</div>`).join('') : U.empty(t('Every parcel moved recently.', 'সব পার্সেল সম্প্রতি নড়েছে।'))}`, { sub: t('From the courier’s tracking', 'কুরিয়ারের ট্র্যাকিং থেকে') });
    const fbCard = U.card(t('Courier fallback', 'বিকল্প কুরিয়ার'), `<div class="small">${t('Main courier', 'মূল কুরিয়ার')}: <b>${esc(cname(main))}</b> · ${r.fallback.on ? U.badge(t(`Using ${cname(r.fallback.to)} today`, `আজ ${cname(r.fallback.to)} চলছে`), 'warn') : U.badge(t('Normal', 'স্বাভাবিক'), 'good')}</div>
      <div class="o3-row" style="margin-top:8px"><span class="small">${t('Backup', 'ব্যাকআপ')}</span>${U.select('fb-to', others.map((c) => [c.id, c.name + (c.connected ? '' : ' · ' + t('not connected', 'সংযুক্ত নয়'))]), r.fallback.to || (others.find((c) => c.connected) || others[0] || {}).id)}</div>
      <div class="small muted" style="margin:6px 0">${t(`If ${cname(main)} is down or refuses pickups, move today’s ${moveable.length} booking(s) to the backup in one step. New orders also go to the backup until you switch back.`, `${cname(main)} বন্ধ থাকলে বা পিকআপ না নিলে আজকের ${moveable.length}টি বুকিং এক ক্লিকে ব্যাকআপে নিন। ফিরিয়ে না আনা পর্যন্ত নতুন অর্ডারও ব্যাকআপে যাবে।`)}</div>
      ${r.fallback.on ? `<button class="btn" id="fb-back">${t(`Switch back to ${cname(main)}`, `${cname(main)}-এ ফিরে যান`)}</button>` : `<button class="btn dark" id="fb-go" ${moveable.length ? '' : 'disabled'}>${A.icon('truck')} ${t("Move today's bookings", 'আজকের বুকিং সরান')}</button>`}`, { sub: t('Owner PIN needed', 'মালিকের PIN লাগবে') });
    const clCard = U.card(t('Claims', 'ক্লেইম'), `<div class="grid g3" style="margin-bottom:8px"><div>${U.kpi({ label: t('Open claims', 'খোলা ক্লেইম'), value: live.length, sub: tk(openAmt) })}</div><div>${U.kpi({ label: t('Money recovered', 'টাকা আদায়'), value: tk(rec) })}</div><div>${U.kpi({ label: t('Deadline in 3 days', '3 দিনে শেষ সময়'), value: live.filter((c) => new Date(c.deadline) - A.TODAY < 3 * DAY).length })}</div></div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn primary" href="${A.href('couriers', 'claims')}">${t('Open the claims ledger', 'ক্লেইম লেজার খুলুন')} →</a><button class="btn" id="cl-new">${A.icon('plus')} ${t('New claim', 'নতুন ক্লেইম')}</button></div>`, { sub: t('One ledger for lost, damaged, short COD, rider overcharge and short returns — in Couriers › Claims & payouts', 'হারানো, ক্ষতিগ্রস্ত, COD কম, রাইডারের বাড়তি টাকা ও ফেরতে পিস কম — সব একটি লেজারে: কুরিয়ার › ক্লেইম ও পেআউট') });
    return `<div class="o2-half" style="margin-top:12px">${stuckCard}${fbCard}</div><div style="height:12px"></div>${clCard}`;
  }
  function claimModal(oid, type) {
    const pool = A.D.orders.filter((o) => o.courier && ['shipped', 'delivered', 'returned'].includes(o.status)).slice(0, 60);
    const m = U.modal(t('New claim', 'নতুন ক্লেইম'), `${U.field(t('Order', 'অর্ডার'), U.select('nc-o', pool.map((o) => [o.id, `${o.id} · ${o.name} · ${cname(o.courier)}`]), oid || (pool[0] || {}).id))}${U.field(t('Type', 'ধরন'), U.select('nc-t', Object.keys(CT).map((k) => [k, t(CT[k][0], CT[k][1])]), type || 'lost'))}${U.field(t('Amount', 'টাকা'), U.money('nc-a', oid ? C.cogs(A.byId(A.D.orders, oid)) : 500))}`, { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="nc-ok">${t('Open claim', 'ক্লেইম খুলুন')}</button>` });
    m.querySelector('#nc-ok').onclick = () => { const o = A.byId(A.D.orders, m.querySelector('#nc-o').value); const a = Math.round(+m.querySelector('#nc-a').value || 0); if (!o || a <= 0) return A.toast(t('Pick an order and an amount', 'অর্ডার ও টাকা দিন'), 'bad'); const ty = m.querySelector('#nc-t').value; addClaim({ oid: o.id, courier: o.courier, type: ty, amount: a }); tl(o, `Claim opened with ${cname(o.courier)}: ${CT[ty][0]} ${tk(a)}`, `${cname(o.courier)}-এ ক্লেইম: ${CT[ty][1]} ${tk(a)}`); U.close(); A.commit(`Claim for ${o.id}`); A.toast(t('Claim opened', 'ক্লেইম খোলা হয়েছে'), 'good'); A.render(); };
  }
  function courierWire(el) {
    const r = R2();
    const n = el.querySelector('#cs-n'); if (n) n.onchange = () => { r.stuckH = +n.value; A.commit(`Stuck-parcel alert after ${r.stuckH}h`); A.toast(t(`Alert after ${r.stuckH} hours without movement`, `${r.stuckH} ঘণ্টা না নড়লে সতর্ক`), 'good'); A.render(); };
    el.querySelectorAll('[data-stk2]').forEach((b) => (b.onclick = () => { const o = A.byId(A.D.orders, b.dataset.stk2); o.stuckAsked = NOW(); tl(o, `Asked ${cname(o.courier)} why the parcel is not moving`, `${cname(o.courier)}-কে জিজ্ঞেস করা হয়েছে পার্সেল কেন নড়ছে না`); A.commit(`Asked courier about stuck ${o.id}`); A.toast(t('Message sent to the courier', 'কুরিয়ারকে মেসেজ গেছে'), 'good'); A.render(); }));
    el.querySelectorAll('[data-lost]').forEach((b) => (b.onclick = () => claimModal(b.dataset.lost, 'lost')));
    const nc = el.querySelector('#cl-new'); if (nc) nc.onclick = () => claimModal();
    const go = el.querySelector('#fb-go'); if (go) go.onclick = () => { const to = el.querySelector('#fb-to').value; const list = A.D.orders.filter((o) => ['booked', 'packed'].includes(o.status)); pinModal(t(`Move ${list.length} booking(s) to ${cname(to)}?`, `${list.length}টি বুকিং ${cname(to)}-এ সরাবেন?`), t(`Today’s booked and packed orders get new ${cname(to)} tracking numbers. Reprint the stickers of packed parcels (PIN and reason).`, `আজকের বুকড ও প্যাকড অর্ডার ${cname(to)}-এর নতুন ট্র্যাকিং নম্বর পাবে। প্যাকড পার্সেলের স্টিকার আবার প্রিন্ট করুন (PIN ও কারণসহ)।`), t('Move bookings', 'বুকিং সরান'), () => { r.fallback = { on: true, to }; list.forEach((o) => { bookCourier(o, to, true); o.timeline[o.timeline.length - 1].text += ' (fallback)'; }); A.commit(`Fallback: ${list.length} bookings moved to ${cname(to)}`); A.toast(t(`${list.length} bookings moved to ${cname(to)}`, `${list.length}টি বুকিং ${cname(to)}-এ গেছে`), 'good'); A.render(); }); };
    const bk = el.querySelector('#fb-back'); if (bk) bk.onclick = () => pinModal(t('Switch back?', 'ফিরে যাবেন?'), t(`New orders go to ${cname(OF().courier)} again. Parcels already booked stay with ${cname(r.fallback.to)}.`, `নতুন অর্ডার আবার ${cname(OF().courier)}-এ যাবে। আগে বুক হওয়া পার্সেল ${cname(r.fallback.to)}-এই থাকবে।`), t('Switch back', 'ফিরে যান'), () => { r.fallback.on = false; A.commit('Courier fallback off'); A.toast(t('Back to the main courier', 'মূল কুরিয়ারে ফেরা হয়েছে'), 'good'); A.render(); });
  }

  /* --- 7. barcode scan at hand-back --- */
  function expectedSkus(it) {
    if (it.kind === 'partial') return it.o.lines.filter((l, i) => !it.o.partial.kept.includes(i)).flatMap((l) => Array(l.qty).fill(l.sku));
    if (it.kind === 'exchange' || it.kind === 'replace') { const l = it.o.lines[0]; return [l.sku]; }
    return it.o.lines.flatMap((l) => Array(l.qty).fill(l.sku));
  }

  /* ================= ROUND 3: date filters, cancelled view, one-time migration ================= */
  A.css('orders4', `
  .ord-mg{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
  .ord-mgc{display:flex;flex-direction:column;gap:6px;border:1.5px solid var(--line);border-radius:14px;padding:12px;background:var(--card);cursor:pointer;min-width:0}
  .ord-mgc.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,var(--card))}
  .ord-dr{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}
  .ord-dr .inp{width:auto}
  .ord-adj{display:flex;gap:6px;flex-wrap:wrap}
  `);
  const DR = [['all', 'Any date', 'যেকোনো তারিখ'], ['today', 'Today', 'আজ'], ['yesterday', 'Yesterday', 'গতকাল'], ['7d', '7 days', '7 দিন'], ['month', 'This month', 'এই মাস'], ['lastmonth', 'Last month', 'গত মাস'], ['custom', 'Custom', 'কাস্টম']];
  function dateBar(S, id) {
    return `<div class="ord-dr"><div class="chips" id="${id}">${DR.map((c) => `<button class="chip ${S.range === c[0] ? 'on' : ''}" data-dr="${c[0]}">${t(c[1], c[2])}</button>`).join('')}</div>${S.range === 'custom' ? `<span class="small muted">${t('From', 'থেকে')}</span><input type="date" class="inp" id="${id}-f" value="${esc(S.from || '')}"><span class="small muted">${t('to', 'পর্যন্ত')}</span><input type="date" class="inp" id="${id}-t" value="${esc(S.to || '')}">` : ''}</div>`;
  }
  function dateWire(el, S, id) {
    el.querySelectorAll(`#${id} [data-dr]`).forEach((b) => (b.onclick = () => { S.range = b.dataset.dr; if (S.range === 'custom' && !S.from) { S.to = A.fmt.ymd(A.TODAY); S.from = A.fmt.ymd(new Date(A.TODAY.getTime() - 7 * DAY)); } if (S.limit) S.limit = 40; A.render(); }));
    const f = el.querySelector(`#${id}-f`), to = el.querySelector(`#${id}-t`);
    if (f) f.onchange = () => { S.from = f.value; A.render(); }; if (to) to.onchange = () => { S.to = to.value; A.render(); };
  }
  function inSel(S, iso) {
    if (!S.range || S.range === 'all') return true;
    const rg = C.range(S.range, { from: S.from || A.fmt.ymd(A.TODAY), to: S.to || A.fmt.ymd(A.TODAY) });
    return C.inRange(iso, rg.from, rg.to + 1);
  }
  const cEntry = (o) => { for (let i = o.timeline.length - 1; i >= 0; i--) if (/^Cancelled/.test(o.timeline[i].text)) return o.timeline[i]; return null; };
  const cancelAt = (o) => (cEntry(o) || { t: o.created }).t;
  const cancelWho = (o) => (cEntry(o) || {}).by || 'You';
  const cancelWhy = (o) => { const e = cEntry(o); const m = e && e.text.match(/^Cancelled — (.+)$/); return m ? (CANCEL_R.find((r) => r[0].toLowerCase() === m[1].toLowerCase()) || [m[1]])[0] : 'Other'; };
  const STAGES = { new: ['New', 'নতুন'], processing: ['Processing', 'প্রসেসিং'], confirmed: ['Confirmed', 'কনফার্মড'], booked: ['Booked', 'বুকড'], packed: ['Packed', 'প্যাকড'] };
  function cancelStage(o) {
    if (o.cancelStage) return o.cancelStage;
    const s = o.timeline.map((e) => e.text).join('|');
    if (/Packed/.test(s)) return 'packed'; if (/Booked with/.test(s)) return 'booked'; if (/Confirmed/.test(s)) return 'confirmed';
    const h = H(o, 'cs'); return h < 0.55 ? 'processing' : h < 0.8 ? 'new' : 'confirmed';
  }
  const barsOf = (map, labelFn) => A.chart.bars({ items: Object.keys(map).sort((a, b) => map[b] - map[a]).map((k) => ({ label: labelFn(k), value: map[k], text: String(map[k]) })), money: false });
  function cancelledView(S) {
    const list = A.D.orders.filter((o) => o.status === 'cancelled' && !o.mergedInto && inSel(S, cancelAt(o))).sort((a, b) => new Date(cancelAt(b)) - new Date(cancelAt(a)));
    const money = A.sum(list, (o) => o.total);
    const cnt = (fn) => { const m = {}; list.forEach((o) => { const k = fn(o); m[k] = (m[k] || 0) + 1; }); return m; };
    const why = cnt(cancelWhy), stage = cnt(cancelStage), who = cnt(cancelWho);
    const topWhy = Object.keys(why).sort((a, b) => why[b] - why[a])[0];
    return `<div class="grid g4" style="margin-bottom:12px"><div class="card">${U.kpi({ label: t('Cancelled orders', 'বাতিল অর্ডার'), value: list.length, icon: 'x' })}</div><div class="card">${U.kpi({ label: t('Order value lost', 'বাতিল অর্ডারের টাকা'), value: tk(money), icon: 'finance' })}</div><div class="card">${U.kpi({ label: t('Most common reason', 'সবচেয়ে বেশি কারণ'), value: topWhy ? esc(rLabel(CANCEL_R, topWhy)) : '—', sub: topWhy ? t(`${why[topWhy]} orders`, `${why[topWhy]}টি অর্ডার`) : '', icon: 'info' })}</div><div class="card"><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn" id="cx-xl">${A.icon('down')} Excel</button><button class="btn" id="cx-pdf">${A.icon('down')} PDF</button></div></div></div>
      <div class="grid g3" style="margin-bottom:12px">${U.card(t('Reasons', 'কারণ'), list.length ? barsOf(why, (k) => rLabel(CANCEL_R, k)) : U.empty(t('Nothing cancelled in this period.', 'এই সময়ে কিছু বাতিল হয়নি।')))}${U.card(t('Stage when cancelled', 'কোন ধাপে বাতিল'), list.length ? barsOf(stage, (k) => t(STAGES[k][0], STAGES[k][1])) : U.empty('—'))}${U.card(t('Who cancelled', 'কে বাতিল করেছেন'), list.length ? barsOf(who, (k) => k) : U.empty('—'))}</div>
      ${U.table([{ h: t('Order', 'অর্ডার'), f: (o) => `<b class="mono">${esc(o.id)}</b><div class="ord-sub">${esc(o.name)}</div>` }, { h: t('Total', 'মোট'), r: true, f: (o) => `<b>${tk(o.total)}</b>` }, { h: t('Reason', 'কারণ'), f: (o) => esc(rLabel(CANCEL_R, cancelWhy(o))) }, { h: t('Stage', 'ধাপ'), hide: true, f: (o) => esc(t(STAGES[cancelStage(o)][0], STAGES[cancelStage(o)][1])) }, { h: t('Who', 'কে'), hide: true, f: (o) => esc(cancelWho(o)) }, { h: t('When', 'কখন'), hide: true, f: (o) => A.fmt.ago(cancelAt(o)) }], list.slice(0, 60).map((o) => Object.assign({ _id: o.id }, o)), { onRow: true, empty: t('No cancelled order in this period.', 'এই সময়ে কোনো বাতিল অর্ডার নেই।') })}`;
  }

  /* one-time migration to the Round 3 flow (Confirmed is not booked; Booked -> Packed -> Handed over; past batches) */
  function init5() {
    const x = X(); if (x.v5) return; x.v5 = true;
    const D = A.D;
    for (const o of D.orders) {
      if (o.status === 'packed') {
        if (!o.tracking) {
          const cid = o.courier || OF().courier; o.courier = ''; bookCourier(o, cid, true);
          const e = o.timeline.pop(); const i = o.timeline.findIndex((z) => /^Packed/.test(z.text));
          o.timeline.splice(i < 0 ? o.timeline.length : i, 0, Object.assign(e, { t: new Date(new Date(o.created).getTime() + 19 * HOUR).toISOString() }));
        }
        if (!o.packedAt) o.packedAt = new Date(new Date(o.created).getTime() + 20 * HOUR).toISOString();
        o.printed = o.printed || 1;
      } else if (o.status === 'confirmed') {
        o.courier = ''; o.tracking = '';
        if (!o.hold && !o.stockWait && H(o, 'bk') < 0.45) bookOrder(o, OF().courier);
      }
    }
    const done = D.orders.filter((o) => ['shipped', 'delivered', 'returned', 'exchanged'].includes(o.status) && o.courier);
    const byDay = {};
    done.forEach((o) => { const at = new Date(new Date(o.created).getTime() + 26 * HOUR); if (!o.handedAt) { o.handedAt = at.toISOString(); o.enteredAt = o.enteredAt || o.handedAt; } const d = A.fmt.ymd(at); (byDay[d] = byDay[d] || []).push([o, at]); });
    const today = A.fmt.ymd(A.TODAY);
    const days = Object.keys(byDay).sort().reverse().filter((d) => d < today).slice(0, 8);
    x.pastBatches = days.map((d, i) => {
      const g = byDay[d].sort((a, b) => a[1] - b[1]).slice(0, 26); const ids = g.map((z) => z[0].id);
      const missing = (i % 3 === 1 && ids.length > 1) ? [ids.pop()] : [];
      return { no: 213 - i, at: g[g.length - 1][1].toISOString(), ids, missing, courier: '' };
    });
    x.batchNo = 214;
    A.save ? A.save() : A.commit();
  }
  /* ================= register ================= */
  const W = (fn) => (el, r) => { init(); init5(); r2Init(); autoMerge(); return fn(el, r); };
  function autoMerge() {
    if (!autoMergeOn()) return;
    for (const o of A.D.orders.filter((x) => x.status === 'new')) {
      const d = dupes(o).filter((x) => x.status === 'new' && x.address === o.address);
      if (d.length && !o.mergedInto && o.status === 'new') { const all = [o, ...d].sort((a, b) => new Date(a.created) - new Date(b.created)); const keep = all[0]; if (keep.id === o.id) mergeDo(keep, all.slice(1), [].concat(...all.map((z) => z.lines.map((l) => Object.assign({}, l)))), {}, false, () => {}); }
    }
  }
  const claimsApi = () => { init(); init5(); r2Init(); return claimsArr(); };
  A.ordersApi = { pinModal, maskPhone, maskAddr, processingCount: () => A.D.orders.filter((o) => dstat(o) === 'processing').length, claims: claimsApi, addClaim: (c) => { claimsApi(); return addClaim(c); } };
  const redirect = (tab) => ({ render: (el) => { el.innerHTML = ''; setTimeout(() => A.go('orders', tab), 0); }, guide: { en: '<p>This page moved. You are being taken to the new page.</p>', bn: '<p>এই পেজ সরে গেছে। আপনাকে নতুন পেজে নেওয়া হচ্ছে।</p>' } });
  A.mod('orders', {
    batch: { render: W(renderBatch), guide: {
      en: '<p><b>What:</b> every order that is not yet handed to the courier — the “Current” batch — and “Past” batches, one for each courier pickup.</p><p><b>Why:</b> one look tells you what still needs a person before parcels can go — e.g. 3 stuck because size L Navy polo ran out. Older leftovers stay on top, tagged “From last batch”.</p><p><b>How:</b> 1) Clear “Stuck” first; “Merge” sits right on the rows that need it. 2) Work “Your work” from the oldest. 3) “Moved on by itself” shows what the rules did (only up to Confirmed) and why. 4) “Print all” prints the summary, picking list and stickers of Booked orders. 5) Open “Past”: each row is a pickup — parcels, COD total, taken vs missing — and opens its orders.</p>',
      bn: '<p><b>কী:</b> যেসব অর্ডার এখনো কুরিয়ারকে দেওয়া হয়নি তার সবই — “চলতি” ব্যাচ — আর “আগের” ব্যাচ, প্রতিটি কুরিয়ার পিকআপের জন্য একটি।</p><p><b>কেন:</b> এক নজরে বোঝা যায় পার্সেল যাওয়ার আগে কোনগুলোতে মানুষ লাগবে — যেমন নেভি পোলো L শেষ বলে 3টি আটকে আছে। পুরনো বাকি অর্ডার ওপরে থাকে, “আগের ব্যাচের” ট্যাগসহ।</p><p><b>কীভাবে:</b> 1) আগে “আটকে আছে” ঠিক করুন; যেসব লাইনে দরকার সেখানেই “মার্জ” বোতাম আছে। 2) “আপনার কাজ” পুরনোটা থেকে ধরুন। 3) “নিজে থেকে এগিয়েছে”-তে নিয়ম কী করেছে (শুধু কনফার্মড পর্যন্ত) আর কেন, দেখা যায়। 4) “সব প্রিন্ট” বুকড অর্ডারের সারাংশ, পিকিং লিস্ট ও স্টিকার প্রিন্ট করে। 5) “আগের” খুলুন: প্রতিটি লাইন একটি পিকআপ — পার্সেল, COD মোট, নেওয়া বনাম নেই — ক্লিক করলে সেই অর্ডারগুলো খোলে।</p>' } },
    all: { render: W(renderAll), guide: {
      en: '<p><b>What:</b> every order with the steps as filters: New, Processing, Confirmed, Booked, Packed, Handed over, Delivered, Paid — plus Returned, Cancelled and Bulk.</p><p><b>Why:</b> find any order fast — by phone, name or district — and see its courier score.</p><p><b>How:</b> pick a step chip, a date (Today, Yesterday, 7 days, This month, Last month or Custom from–to), search, sort by “Lowest score” to see risky ones first. Click a row to open the order page: adjust the price (amount, % off, wallet, free delivery — with a reason, logged), book, print, cancel. “Bulk / corporate” lists company orders: quote, agreed price, advance and balance, company invoice and delivery in batches.</p>',
      bn: '<p><b>কী:</b> সব অর্ডার, ধাপগুলো ফিল্টার হিসেবে: নতুন, প্রসেসিং, কনফার্মড, বুকড, প্যাকড, কুরিয়ারকে দেওয়া, ডেলিভারি, টাকা এসেছে — সাথে ফেরত, বাতিল ও বাল্ক।</p><p><b>কেন:</b> ফোন, নাম বা জেলা দিয়ে যেকোনো অর্ডার দ্রুত খুঁজে কুরিয়ার স্কোর দেখা যায়।</p><p><b>কীভাবে:</b> ধাপের চিপ বাছুন, তারিখ বাছুন (আজ, গতকাল, 7 দিন, এই মাস, গত মাস বা কাস্টম থেকে–পর্যন্ত), খুঁজুন, “কম স্কোর আগে” দিয়ে ঝুঁকির অর্ডার আগে দেখুন। লাইনে চাপলে অর্ডার পেজ খোলে: সেখানে দাম বদল (টাকা, % ছাড়, ওয়ালেট, ফ্রি ডেলিভারি — কারণসহ, লগ হয়), বুক, প্রিন্ট, বাতিল। “বাল্ক / কর্পোরেট”-এ কোম্পানির অর্ডার: কোটেশন, ঠিক করা দাম, অ্যাডভান্স ও বাকি, কোম্পানি ইনভয়েস আর ব্যাচে ডেলিভারি।</p>' } },
    processing: { render: W(renderProcessing), guide: {
      en: '<p><b>What:</b> orders the Rules could not confirm by themselves. Rules confirm up to “Confirmed” only; everything else lands here.</p><p><b>Why:</b> paid and trusted orders move on alone; only brand-new, refused-before, big cash, low-score, no-stock and duplicate orders need a person.</p><p><b>How:</b> filter by chip: No stock, No answer, Suspicious, Merge needed, Advance asked. Read the score (out of 10) and the AI line, call, then press “Approve” (→ Confirmed), “Cancel” (with a reason) or “Ask for advance”. “Ask for advance” sends SMS, WhatsApp or both; the order gets an “Advance asked” tag and stays here until you press “Advance received” (→ Confirmed) — also use it when you asked by phone. Two orders on one phone? “Merge” shows them side by side, lets you edit the merged order, then “Merge” or “Merge + call”. The call desk logs every attempt and shows the next call time.</p>',
      bn: '<p><b>কী:</b> যেসব অর্ডার নিয়ম নিজে কনফার্ম করতে পারেনি। নিয়ম শুধু “কনফার্মড” পর্যন্ত এগোয়; বাকি সব এখানে আসে।</p><p><b>কেন:</b> পেইড ও বিশ্বস্ত অর্ডার নিজেই এগোয়; শুধু একদম নতুন, আগে ফেরত দেওয়া, বড় COD, কম স্কোর, স্টক নেই আর ডুপ্লিকেট অর্ডারে মানুষ লাগে।</p><p><b>কীভাবে:</b> চিপ দিয়ে ফিল্টার করুন: স্টক নেই, ফোন ধরেননি, সন্দেহজনক, মার্জ করতে হবে, অ্যাডভান্স চাওয়া। স্কোর (10-এর মধ্যে) আর AI লাইন পড়ে কল দিন, তারপর “অ্যাপ্রুভ” (→ কনফার্মড), “বাতিল” (কারণসহ) বা “অ্যাডভান্স চান”। “অ্যাডভান্স চান” SMS, WhatsApp বা দুটোতেই পাঠায়; অর্ডারে “অ্যাডভান্স চাওয়া” ট্যাগ পড়ে আর “অ্যাডভান্স এসেছে” চাপা পর্যন্ত (→ কনফার্মড) এখানেই থাকে — ফোনে চাইলেও এটি ব্যবহার করুন। এক ফোনে দুটি অর্ডার? “মার্জ” দুটো পাশাপাশি দেখায়, মার্জ করা অর্ডার এডিট করা যায়, তারপর “মার্জ” বা “মার্জ + কল”। কল ডেস্ক প্রতিটি চেষ্টা লিখে রাখে আর পরের কলের সময় দেখায়।</p>' } },
    ship: { render: W(renderShip), guide: {
      en: '<p><b>What:</b> everything between Confirmed and handing over, in three chips: Confirmed, Booked, Packed.</p><p><b>Why:</b> booking comes first so every sticker carries the courier’s own barcode; printing the sticker is then the last packing step.</p><p><b>How:</b> 1) <b>Confirmed:</b> tick orders (or “Select all”), keep the default courier or pick another, press “Book courier” — one click sends all by API and gives each a tracking number (one order = one booking). 2) <b>Booked:</b> “Print stickers” for the ticked ones or “Print all” (summary, picking list, stickers; in parts when Peak mode is on). A sticker prints once and the order becomes Packed. 3) <b>Packed:</b> the day-end check (packed vs handed over). A second print needs the owner PIN and a reason and is saved in the print log; it reuses the same booking. Cancelling a booked order shows “Cancel at the courier too”. Handing over comes from the courier’s pickup report — nobody ticks it by hand.</p>',
      bn: '<p><b>কী:</b> কনফার্মড থেকে কুরিয়ারকে দেওয়া পর্যন্ত সব কাজ, তিনটি চিপে: কনফার্মড, বুকড, প্যাকড।</p><p><b>কেন:</b> আগে বুক হয় বলে প্রতিটি স্টিকারে কুরিয়ারের নিজের বারকোড থাকে; স্টিকার প্রিন্টই তখন প্যাকিংয়ের শেষ ধাপ।</p><p><b>কীভাবে:</b> 1) <b>কনফার্মড:</b> অর্ডার টিক দিন (বা “সব বাছুন”), ডিফল্ট কুরিয়ার রাখুন বা অন্যটি বাছুন, “কুরিয়ার বুক” চাপুন — এক ক্লিকে সব API দিয়ে যায় আর প্রতিটি ট্র্যাকিং নম্বর পায় (একটি অর্ডার = একটি বুকিং)। 2) <b>বুকড:</b> টিক দেওয়াগুলোর “স্টিকার প্রিন্ট” বা “সব প্রিন্ট” (সারাংশ, পিকিং লিস্ট, স্টিকার; পিক মোডে ভাগে ভাগে)। স্টিকার একবারই প্রিন্ট হয় আর অর্ডার প্যাকড হয়। 3) <b>প্যাকড:</b> দিন শেষের চেক (প্যাকড বনাম কুরিয়ারকে দেওয়া)। দ্বিতীয়বার প্রিন্টে মালিকের PIN ও কারণ লাগে, প্রিন্ট লগে সেভ হয়, আর একই বুকিং ব্যবহার হয়। বুকড অর্ডার বাতিল করলে “কুরিয়ারেও বাতিল করুন” দেখায়। কুরিয়ারকে দেওয়া হয়েছে কি না তা কুরিয়ারের পিকআপ রিপোর্ট থেকে আসে — কেউ হাতে টিক দেয় না।</p>' } },
    courier: { render: W(renderCourier), guide: {
      en: '<p><b>What:</b> parcels handed over to the courier, with the courier’s live status, and the day-end check.</p><p><b>Why:</b> “Packed today 10, handed over 9” tells you at once a parcel is missing before it becomes a loss.</p><p><b>How:</b> press “Record courier pickup” when the courier collects: packed parcels become “Handed over” and a Past batch is made. Missing parcels are listed — ask the courier. Click a row to open the order; click the courier status to see the courier’s full history (rider, attempts, notes). Filter by courier status. A cancelled order that is still booked at the courier is flagged. Stuck parcels (no movement in 48 hours) get an alert; if the courier is down, move today’s bookings to the backup (PIN). Claims: see the summary here; the full ledger is in Couriers › Claims &amp; payouts.</p>',
      bn: '<p><b>কী:</b> কুরিয়ারকে দেওয়া পার্সেল, কুরিয়ারের লাইভ স্ট্যাটাসসহ, আর দিন শেষের চেক।</p><p><b>কেন:</b> “আজ প্যাকড 10, কুরিয়ারকে দেওয়া 9” দেখলেই বোঝা যায় একটা পার্সেল নেই — লস হওয়ার আগেই।</p><p><b>কীভাবে:</b> কুরিয়ার নিলে “কুরিয়ার পিকআপ রেকর্ড” চাপুন: প্যাকড পার্সেল “কুরিয়ারকে দেওয়া” হয় আর একটি আগের ব্যাচ তৈরি হয়। না পাওয়া পার্সেলের লিস্ট আসে — কুরিয়ারকে জানান। লাইনে ক্লিক করলে অর্ডার খোলে; কুরিয়ারের স্ট্যাটাসে ক্লিক করলে কুরিয়ারের পুরো হিস্ট্রি (রাইডার, চেষ্টা, নোট) দেখা যায়। কুরিয়ারের স্ট্যাটাস দিয়ে ফিল্টার করা যায়। বাতিল অর্ডার কুরিয়ারে বুক থাকলে সেটাও দেখায়। 48 ঘণ্টা না নড়া পার্সেলে সতর্ক করে; কুরিয়ার বন্ধ থাকলে আজকের বুকিং ব্যাকআপে সরান (PIN)। ক্লেইম: এখানে সারাংশ; পুরো লেজার কুরিয়ার › ক্লেইম ও পেআউটে।</p>' } },
    returns: { render: W(renderReturns), guide: {
      en: '<p><b>What:</b> refused parcels, partial deliveries, size exchanges, replacements and the Cancelled view — with a date filter (Today, Yesterday, 7 days, This month, Last month, Custom).</p><p><b>Why:</b> every piece that comes back must be counted and checked, or money leaks — e.g. a short count must be claimed from the courier the same day. The summary shows counts, money, reasons, the stage an order was cancelled at and who cancelled it.</p><p><b>How:</b> answer exchange requests within 72 hours (lower price goes to the wallet after the check), fill the partial box, scan or count pieces at hand-back with a note (no grading here). The owner approves or declines in the ERP within 7 days. Defective or wrong item? Use Replacement: the customer sends it back and gets the right product again, free. Use “Excel” or “PDF” to download the Cancelled list.</p>',
      bn: '<p><b>কী:</b> দরজায় না নেওয়া পার্সেল, আংশিক ডেলিভারি, সাইজ এক্সচেঞ্জ, রিপ্লেসমেন্ট আর বাতিল অর্ডারের ভিউ — তারিখ ফিল্টারসহ (আজ, গতকাল, 7 দিন, এই মাস, গত মাস, কাস্টম)।</p><p><b>কেন:</b> ফেরত আসা প্রতিটি পিস গুনে চেক না করলে টাকা হারায় — যেমন পিস কম হলে সেদিনই কুরিয়ারে ক্লেইম করতে হয়। সারাংশে সংখ্যা, টাকা, কারণ, কোন ধাপে বাতিল আর কে বাতিল করেছেন দেখা যায়।</p><p><b>কীভাবে:</b> 72 ঘণ্টার মধ্যে এক্সচেঞ্জ রিকোয়েস্টের উত্তর দিন (কম দামের হলে চেকের পর বাকি টাকা ওয়ালেটে), আংশিক বক্স পূরণ করুন, হ্যান্ড-ব্যাকে পিস গুনে নোট লিখুন (এখানে গ্রেড নয়)। মালিক 7 দিনের মধ্যে ERP-তে অ্যাপ্রুভ বা ডিক্লাইন করেন। ত্রুটিপূর্ণ বা ভুল আইটেম? রিপ্লেসমেন্ট: কাস্টমার ফেরত পাঠান, সঠিক প্রোডাক্টটা আবার ফ্রি পান। বাতিল তালিকা ডাউনলোডে “Excel” বা “PDF” চাপুন।</p>' } },
    incomplete: { render: W(renderIncomplete), guide: {
      en: '<p><b>What:</b> people who started checkout but stopped.</p><p><b>Why:</b> a short reminder brings many back — the cart is still there.</p><p><b>How:</b> press “Remind all” to message only those not messaged yet. Each person gets at most 2 messages ever.</p>',
      bn: '<p><b>কী:</b> যারা চেকআউট শুরু করে থেমে গেছেন।</p><p><b>কেন:</b> ছোট একটা রিমাইন্ডারে অনেকে ফিরে আসেন — কার্ট তখনো থাকে।</p><p><b>কীভাবে:</b> “সবাইকে মনে করান” চাপলে শুধু যাদের এখনো মেসেজ যায়নি তারা পাবেন। একজন সব মিলিয়ে সর্বোচ্চ 2টি মেসেজ পান।</p>' } },
    confirm: redirect('processing'),
    pack: redirect('ship'),
  });
})();
