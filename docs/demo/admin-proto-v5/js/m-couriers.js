/* m-couriers: Couriers section (All couriers, Courier 360, Claims & payouts, Setup) + Finance > Couriers + Reports > Couriers.
   One set of functions feeds all three places, so the numbers agree. Tracking is derived from each order (status + dates + courier + zone),
   never random at render. What the courier APIs really give is in courier-research.md. */
(function () {
  'use strict';
  const A = window.A, U = A.ui, esc = A.esc, DAY = 864e5, HR = 36e5;
  const t = (en, bn) => A.t(en, bn);
  const tk = (n) => A.fmt.tk(n);
  const C = () => A.calc;
  const WITH = ['shipped', 'delivered', 'returned', 'exchanged'];

  A.css('couriers', `
  .cr-chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 4px}
  .cr-chips a.chip{text-decoration:none}.cr-chips .chip small{opacity:.75;margin-left:5px;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em}
  .cr-card{display:flex;flex-direction:column;gap:12px}
  .cr-card h3{margin:0;font-size:17px}
  .cr-mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  .cr-mini div{min-width:0}.cr-mini b{display:block;font:650 17px/1.2 var(--f-num)}.cr-mini span{font-size:11.5px;color:var(--muted)}
  .cr-sec{margin:10px 0 2px}
  .cr-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600;margin:14px 0 6px}
  .cr-lbl:first-child{margin-top:0}
  .cr-kv{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;font-size:13.5px}
  .cr-kv span:nth-child(odd){color:var(--muted)}.cr-kv span:nth-child(even){text-align:right;font-weight:600;min-width:0;overflow-wrap:anywhere}
  .cr-tl{font-size:13.5px}.cr-tl .tl{padding-bottom:14px}.cr-tl .tl i.bad{background:var(--bad)}.cr-tl .tl i.good{background:var(--good)}.cr-tl .tl i.warn{background:var(--warn)}
  .cr-tl .t{font-size:11.5px;color:var(--muted)}
  .cr-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .cr-bar{display:grid;grid-template-columns:90px minmax(0,1fr) auto;gap:10px;align-items:center;font-size:13px;margin:7px 0}
  .cr-hl{font-weight:700;color:var(--good)}
  .cr-pill{cursor:pointer}
  .cr-sticky{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
  @media (max-width:560px){.cr-mini{grid-template-columns:repeat(2,minmax(0,1fr))}.cr-bar{grid-template-columns:70px minmax(0,1fr) auto}}
  `);

  /* ---------------- tiny helpers ---------------- */
  const H = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
  const NOW = () => A.TODAY.getTime();
  const cs = () => A.D.couriers || [];
  const cget = (id) => cs().find((c) => c.id === id) || { id, name: id || '—', fee: { inside: 70, sub: 80, outside: 110 }, codPct: 1, returnPct: 50, connected: false };
  const cname = (id) => cget(id).name;
  const sdata = () => (A.setData ? A.setData() : A.D.set || {});
  const defId = () => (sdata() && sdata().defCourier) || (cs()[0] || {}).id;
  const ordered = () => { const d = defId(); return cs().slice().sort((a, b) => (a.id === d ? -1 : b.id === d ? 1 : 0)); };
  const href360 = (id) => '#couriers--c360--' + id;
  const num = (n) => A.fmt.num(n);
  const pc = (n, d = 0) => (n == null || !isFinite(n) ? '—' : A.fmt.pct(n, d));
  const days1 = (n) => (n == null ? '—' : (Math.round(n * 10) / 10) + t(' days', ' দিন'));
  const dshort = (d) => A.fmt.date(d);
  const BNP = { Dhaka: 'ঢাকা', Chattogram: 'চট্টগ্রাম', Rangpur: 'রংপুর', Gazipur: 'গাজীপুর', Noakhali: 'নোয়াখালী', Rajshahi: 'রাজশাহী', Sylhet: 'সিলেট', "Cox's Bazar": 'কক্সবাজার', Narayanganj: 'নারায়ণগঞ্জ', Feni: 'ফেনী', Bogura: 'বগুড়া', Barishal: 'বরিশাল', Mymensingh: 'ময়মনসিংহ', Jessore: 'যশোর', Khulna: 'খুলনা', Cumilla: 'কুমিল্লা' };
  const bnp = (d) => BNP[d] || d;
  const place = (d) => t(d, bnp(d));
  const ZONE = () => ({ inside: t('Inside Dhaka', 'ঢাকার ভেতরে'), sub: t('Dhaka suburbs', 'ঢাকার আশেপাশে'), outside: t('Outside Dhaka', 'ঢাকার বাইরে') });
  const isDel = (o) => o.status === 'delivered' || o.status === 'exchanged';
  const byIdO = (id) => A.D.orders.find((o) => o.id === id);
  const age = (iso) => (NOW() - new Date(iso).getTime()) / DAY;

  /* ---------------- data: settings, payouts, claims ---------------- */
  function X() {
    const D = A.D;
    if (!D.courierX) D.courierX = { sim: 0, cfg: {}, claimed: {}, backup: '', stuckH: 24 };
    const x = D.courierX; x.cfg = x.cfg || {}; x.claimed = x.claimed || {}; if (x.stuckH == null) x.stuckH = 24;
    for (const c of cs()) if (!x.cfg[c.id]) x.cfg[c.id] = { minPayout: 500, payDays: c.id === 'steadfast' ? 2 : 3 };
    if (!D.courierPay) seedPay();
    return x;
  }
  const cfg = (cid) => X().cfg[cid] || { minPayout: 500, payDays: 3 };
  const payout = (o) => (o.payment === 'COD' ? o.total : 0) - C().courierFee(o) - C().codFee(o);
  const heldList = (cid) => C().codWithCouriers().filter((o) => (o.courier || 'pathao') === cid);
  const owed = (cid) => A.sum(heldList(cid), payout);

  function seedPay() {
    const D = A.D; D.courierPay = []; const day = (o) => (o.settledAt ? new Date(o.settledAt).getTime() : new Date(o.deliveredAt).getTime() + 3 * DAY);
    let n = 1001;
    for (const c of cs()) {
      const os = D.orders.filter((o) => (o.courier || 'pathao') === c.id && isDel(o) && o.payment === 'COD' && o.settled && o.deliveredAt);
      const g = A.groupBy(os, (o) => Math.floor(day(o) / (7 * DAY)));
      Object.keys(g).sort().forEach((k) => {
        const L = g[k]; const paidAt = Math.max(...L.map(day)); if (paidAt > NOW()) return;
        const amt = A.sum(L, payout);
        D.courierPay.push({ id: 'CP-' + n++, courier: c.id, requestedAt: new Date(paidAt - 2 * DAY).toISOString(), amount: amt, parcels: L.length, status: 'paid', paidAt: new Date(paidAt).toISOString(), ref: (c.id === 'steadfast' ? 'SFP-' : c.id === 'pathao' ? 'PTP-' : 'RXP-') + Math.floor(H(c.id + k) * 900000 + 100000), method: c.id === 'steadfast' ? 'bKash merchant' : 'Bank transfer', oids: [] });
      });
    }
    // one request still in progress at Steadfast, made about a day ago
    const sf = D.orders.filter((o) => (o.courier || 'pathao') === 'steadfast' && isDel(o) && o.payment === 'COD' && !o.settled && o.deliveredAt && NOW() - new Date(o.deliveredAt) > 26 * HR);
    if (sf.length) D.courierPay.push({ id: 'CP-' + n++, courier: 'steadfast', requestedAt: new Date(NOW() - 26 * HR).toISOString(), amount: A.sum(sf, payout), parcels: sf.length, status: 'processing', paidAt: '', ref: '', method: 'bKash merchant', oids: sf.map((o) => o.id) });
    D.courierPay.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }
  const pnow = () => NOW() + (X().sim || 0) * DAY;
  function effStatus(p) {
    if (p.status === 'paid' || p.status === 'rejected') return p.status;
    const a = pnow() - new Date(p.requestedAt).getTime();
    if (a < 6 * HR) return 'requested';
    if (a < cfg(p.courier).payDays * DAY) return 'processing';
    return 'paid';
  }
  function sync() {
    X(); let ch = false;
    for (const p of A.D.courierPay) {
      if (p.status === 'paid' || p.status === 'rejected') continue;
      const e = effStatus(p);
      if (e !== p.status) {
        ch = true; p.status = e;
        if (e === 'paid') {
          p.paidAt = new Date(Math.min(pnow(), new Date(p.requestedAt).getTime() + cfg(p.courier).payDays * DAY)).toISOString();
          p.ref = (p.courier === 'steadfast' ? 'SFP-' : p.courier === 'pathao' ? 'PTP-' : 'RXP-') + Math.floor(H(p.id) * 900000 + 100000);
          for (const id of p.oids || []) { const o = byIdO(id); if (o && !o.settled) { o.settled = true; o.settledAt = p.paidAt; o.timeline.push({ t: p.paidAt, text: 'Courier paid out the cash · ' + p.ref, by: 'Courier' }); } }
        }
      }
    }
    if (ch) A.save();
  }
  const pays = (cid) => { sync(); return A.D.courierPay.filter((p) => !cid || p.courier === cid).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)); };
  const pending = (cid) => pays(cid).filter((p) => p.status === 'requested' || p.status === 'processing');
  const eligible = (cid) => { const used = new Set(); pending(cid).forEach((p) => (p.oids || []).forEach((i) => used.add(i))); const L = heldList(cid).filter((o) => !used.has(o.id)); return { list: L, amount: A.sum(L, payout) }; };
  const PST = () => ({ requested: [t('Requested', 'রিকোয়েস্ট করা হয়েছে'), 'info'], processing: [t('Processing', 'প্রসেসিং চলছে'), 'warn'], paid: [t('Paid', 'পেইড'), 'good'], rejected: [t('Rejected', 'বাতিল'), 'bad'] });
  const pbadge = (s) => U.badge(PST()[s][0], PST()[s][1]);

  function seedClaims(L) {
    const ship = A.D.orders.filter((o) => ['shipped', 'delivered', 'returned'].includes(o.status) && o.courier);
    const mk = (o, type, amt, d, status, rec, note) => o && L.push({ id: 'CL-' + (401 + L.length), oid: o.id, courier: o.courier, type, amount: amt, at: new Date(NOW() - d * DAY).toISOString(), deadline: new Date(NOW() - d * DAY + 10 * DAY).toISOString(), status, recovered: rec || 0, note: note || '' });
    mk(ship[5], 'lost', C().cogs(ship[5] || { lines: [] }) || 1150, 3, 'sent', 0, 'Not at the courier hub after 4 days');
    mk(ship[9], 'damaged', 690, 12, 'won', 690, 'Customer photo sent, courier accepted');
    mk(ship.find((o) => isDel(o) && o.payment === 'COD'), 'short_cod', 200, 6, 'open', 0, 'Cash handed over ৳200 short');
  }
  function claimsAll() {
    X(); let L = A.ordersApi && A.ordersApi.claims ? A.ordersApi.claims() : A.D.claims;
    if (!Array.isArray(L)) { A.D.claims = A.D.claims || []; L = A.D.claims; }
    if (!L.length) { seedClaims(L); A.save(); }
    return L;
  }
  const cst = (c) => (c.status === 'paid' ? 'won' : c.status === 'rejected' ? 'lost' : c.status);
  const cty = (c) => (c.type === 'short' ? 'short_cod' : c.type === 'count' ? 'return_short' : c.type);
  const CTY = () => ({ lost: t('Lost parcel', 'হারানো পার্সেল'), damaged: t('Damaged', 'ক্ষতিগ্রস্ত'), short_cod: t('COD short', 'COD কম'), rider: t('Rider overcharge', 'রাইডারের বাড়তি টাকা'), return_short: t('Return short', 'ফেরতে পিস কম') });
  const CST = () => ({ open: [t('Open', 'খোলা'), 'warn'], sent: [t('Sent', 'পাঠানো'), 'info'], won: [t('Won', 'আদায় হয়েছে'), 'good'], lost: [t('Lost', 'পাওয়া যায়নি'), 'bad'] });
  const isOpenC = (c) => cst(c) === 'open' || cst(c) === 'sent';
  const claimsOf = (cid) => claimsAll().filter((c) => !cid || c.courier === cid);
  const toGet = (L) => A.sum(L.filter(isOpenC), (c) => Math.max(0, (c.amount || 0) - (c.recovered || 0)));
  function addClaim(c) { if (A.ordersApi && A.ordersApi.addClaim) A.ordersApi.addClaim(c); else claimsAll().unshift(c); }
  function newClaim(o, type, amount, note) {
    const L = claimsAll(); const id = 'CL-' + (401 + L.length);
    const c = { id, oid: o.id, courier: o.courier || 'pathao', type, amount, at: A.TODAY.toISOString(), deadline: new Date(NOW() + 10 * DAY).toISOString(), status: 'open', recovered: 0, note: note || '' };
    addClaim(c); return c;
  }

  /* ---------------- tracking (derived, deterministic) ---------------- */
  const CODE_RAW = { picked_up: ['Picked up', 'পিকআপ হয়েছে', 'info'], in_transit: ['In transit', 'রাস্তায়', 'info'], at_hub: ['At hub', 'হাবে', 'info'], out_for_delivery: ['Out for delivery', 'ডেলিভারিতে', 'accent'], attempt_failed: ['Attempt failed', 'ডেলিভারি হয়নি', 'bad'], on_hold: ['On hold', 'হোল্ডে', 'warn'], delivered: ['Delivered', 'ডেলিভারি হয়েছে', 'good'], returning: ['Returning', 'ফেরত আসছে', 'warn'], returned: ['Returned', 'ফেরত এসেছে', 'warn'] };
  const CODE = () => Object.fromEntries(Object.keys(CODE_RAW).map((k) => [k, [t(CODE_RAW[k][0], CODE_RAW[k][1]), CODE_RAW[k][2]]]));
  const RSN = { 'Customer refused at door': 'কাস্টমার দরজায় নিতে রাজি হননি', 'Customer not reachable': 'কাস্টমারকে ফোনে পাওয়া যায়নি', 'Wrong size, refused': 'সাইজ ঠিক হয়নি, নেননি', 'Changed mind': 'কাস্টমার মত বদলেছেন', 'Address not found': 'ঠিকানা খুঁজে পাওয়া যায়নি' };
  const handedAt = (o) => { const x = (o.timeline || []).find((l) => /Handed (to|over)/i.test(l.text)); return Math.min(x ? new Date(x.t).getTime() : new Date(o.created).getTime() + 26 * HR, NOW() - HR); };
  const returnAt = (o) => { const x = (o.timeline || []).find((l) => /Returned to shop/i.test(l.text)); return x ? new Date(x.t).getTime() : new Date(o.created).getTime() + 4 * DAY; };
  const memo = new Map();
  function build(o) {
    if (!WITH.includes(o.status)) return [];
    const key = [o.id, o.status, o.deliveredAt, o.courier, o.tracking].join('|'); if (memo.has(key)) return memo.get(key);
    const t0 = handedAt(o), now = NOW(), zone = o.zone, d = o.district, bd = bnp(d); const ev = [];
    const add = (ts, code, en, bn, we, wb) => { if (ts <= now) ev.push({ t: new Date(ts).toISOString(), code, text: [en, bn], where: [we, wb || we] }); };
    const fr = (f, span) => t0 + f * span;
    const inside = zone === 'inside';
    const R = o.returnReason || 'Customer not reachable'; const Rb = RSN[R] || R;
    const hubEn = inside ? 'Received at delivery hub' : 'Received at ' + d + ' hub', hubBn = inside ? 'ডেলিভারি হাবে পৌঁছেছে' : bd + ' হাবে পৌঁছেছে';
    const hubWe = inside ? o.area : d, hubWb = inside ? o.area : bd;
    if (o.status === 'returned') {
      const span = Math.max(returnAt(o) - t0, 12 * HR);
      add(t0, 'picked_up', 'Parcel picked up from EXTAS', 'EXTAS থেকে পার্সেল নেওয়া হয়েছে', 'Nikunja, Dhaka', 'নিকুঞ্জ, ঢাকা');
      add(fr(0.15, span), 'at_hub', 'Arrived at sorting hub', 'সর্টিং হাবে পৌঁছেছে', 'Dhaka hub', 'ঢাকা হাব');
      if (!inside) add(fr(0.32, span), 'in_transit', 'On the way to ' + d, bd + '-এর পথে', 'Dhaka', 'ঢাকা');
      add(fr(0.45, span), 'at_hub', hubEn, hubBn, hubWe, hubWb);
      add(fr(0.55, span), 'out_for_delivery', 'Out for delivery', 'ডেলিভারির জন্য বের হয়েছে', o.area);
      add(fr(0.63, span), 'attempt_failed', 'Delivery failed: ' + R, 'ডেলিভারি হয়নি: ' + Rb, o.area);
      add(fr(0.7, span), 'on_hold', 'On hold, waiting for EXTAS to decide', 'হোল্ডে, EXTAS-এর সিদ্ধান্তের অপেক্ষা', hubWe, hubWb);
      add(fr(0.82, span), 'returning', 'Returning to EXTAS', 'EXTAS-এ ফেরত আসছে', hubWe, hubWb);
      add(returnAt(o), 'returned', 'Returned to EXTAS warehouse', 'EXTAS গুদামে ফেরত এসেছে', 'Nikunja, Dhaka', 'নিকুঞ্জ, ঢাকা');
    } else {
      const done = isDel(o); let tEnd;
      if (done) tEnd = Math.max(new Date(o.deliveredAt).getTime(), t0 + 10 * HR);
      else tEnd = t0 + ({ inside: 36, sub: 60, outside: 96 }[zone] || 60) * (0.8 + 0.4 * H(o.id + 'p')) * HR;
      const span = tEnd - t0;
      const stall = !done && now - t0 > 30 * HR && H(o.id + 's') < 0.14; // stuck at a hub
      const failed = done && span > 30 * HR && H(o.id + 'f') < 0.12;
      const g = (f) => (stall && f > 0.4 ? Infinity : fr(f, span));
      add(t0, 'picked_up', 'Parcel picked up from EXTAS', 'EXTAS থেকে পার্সেল নেওয়া হয়েছে', 'Nikunja, Dhaka', 'নিকুঞ্জ, ঢাকা');
      add(g(0.15), 'at_hub', 'Arrived at sorting hub', 'সর্টিং হাবে পৌঁছেছে', 'Dhaka hub', 'ঢাকা হাব');
      if (!inside) add(g(0.35), 'in_transit', 'On the way to ' + d, bd + '-এর পথে', 'Dhaka', 'ঢাকা');
      add(g(inside ? 0.38 : 0.6), 'at_hub', hubEn, hubBn, hubWe, hubWb);
      if (failed) { add(g(0.62), 'out_for_delivery', 'Out for delivery', 'ডেলিভারির জন্য বের হয়েছে', o.area); add(g(0.7), 'attempt_failed', 'Delivery failed: Customer not reachable', 'ডেলিভারি হয়নি: কাস্টমারকে ফোনে পাওয়া যায়নি', o.area); add(g(0.88), 'out_for_delivery', 'Out for delivery again', 'আবার ডেলিভারির জন্য বের হয়েছে', o.area); }
      else add(g(0.86), 'out_for_delivery', 'Out for delivery', 'ডেলিভারির জন্য বের হয়েছে', o.area);
      if (done) add(tEnd, 'delivered', 'Delivered' + (o.payment === 'COD' ? ' · cash ' + tk(o.total) + ' collected' : ''), 'ডেলিভারি হয়েছে' + (o.payment === 'COD' ? ' · ' + tk(o.total) + ' ক্যাশ নেওয়া হয়েছে' : ''), o.area);
    }
    ev.sort((a, b) => a.t.localeCompare(b.t)); const out = ev.reverse(); memo.set(key, out); return out;
  }
  const history = (o) => build(o);
  function status(o) {
    const h = build(o); if (!h.length) return null; const L = h[0]; const m = CODE()[L.code];
    return { code: L.code, label: [CODE_RAW[L.code][0], CODE_RAW[L.code][1]], tone: m[1], at: L.t, rider: null, attempts: h.filter((e) => e.code === 'out_for_delivery').length, consignment: o.tracking || '', cod: o.payment === 'COD' ? o.total : 0 };
  }
  const lbl = (code) => CODE()[code][0];
  const sbadge = (o, click) => { const s = status(o); if (!s) return '<span class="muted small">—</span>'; return `<span class="${click ? 'cr-pill' : ''}" ${click ? `data-trk="${esc(o.id)}"` : ''}>${U.badge(lbl(s.code), s.tone)}</span>`; };
  const lastMoveH = (o) => { const h = build(o); return h.length ? (NOW() - new Date(h[0].t).getTime()) / HR : 0; };
  const isStuck = (o) => o.status === 'shipped' && lastMoveH(o) >= X().stuckH;

  function trackHtml(o) {
    const s = status(o), h = history(o), c = cget(o.courier), zn = ZONE();
    const fee = C().courierFee(o), codFee = C().codFee(o);
    const retCh = o.status === 'returned' ? Math.round(fee * (c.returnPct || 50) / 100) : 0;
    const payRec = A.D.courierPay.find((p) => (p.oids || []).includes(o.id));
    let money;
    if (isDel(o) && o.payment === 'COD') money = o.settled ? t('Paid out to us', 'আমাদের দিয়ে দিয়েছে') + (o.settledAt ? ' · ' + dshort(o.settledAt) : '') : payRec ? t('In payout request ', 'পেআউট রিকোয়েস্টে ') + payRec.id + ' · ' + PST()[effStatus(payRec)][0] : t('Courier holds ', 'কুরিয়ারের কাছে ') + tk(payout(o));
    else money = o.payment === 'COD' ? t('Not collected yet', 'এখনো নেওয়া হয়নি') : t('Prepaid, no cash to collect', 'আগেই পেইড, ক্যাশ নেই');
    const dot = (e) => (e.code === 'delivered' ? 'good' : e.code === 'attempt_failed' ? 'bad' : e.code === 'on_hold' || e.code === 'returning' ? 'warn' : '');
    return `
      <div class="cr-row" style="justify-content:space-between"><div><b style="font-size:16px">${esc(c.name)}</b> <span class="mono small">${esc(o.tracking || '—')}</span></div>${s ? U.badge(lbl(s.code), s.tone) : ''}</div>
      <div class="muted small" style="margin-top:4px">${t('Last update', 'শেষ আপডেট')}: ${s ? A.fmt.dt(s.at) + ' · ' + A.fmt.ago(s.at) : '—'}</div>
      ${isStuck(o) ? U.callout(t(`No movement for ${Math.round(lastMoveH(o))} hours. Check with ${esc(c.name)}.`, `${Math.round(lastMoveH(o))} ঘণ্টা ধরে নড়ছে না। ${esc(c.name)}-কে জিজ্ঞেস করুন।`), 'warn', 'warn') : ''}
      <div class="cr-lbl">${t('From the courier', 'কুরিয়ারের তথ্য')}</div>
      <div class="cr-kv">
        <span>${t('Delivery attempts', 'ডেলিভারির চেষ্টা')}</span><span>${s ? s.attempts : 0}</span>
        <span>${t('Cash on delivery', 'ক্যাশ অন ডেলিভারি')}</span><span>${o.payment === 'COD' ? tk(o.total) : t('None (prepaid)', 'নেই (আগেই পেইড)')}</span>
        <span>${t('Delivery charge', 'ডেলিভারি চার্জ')}</span><span>${tk(fee)}</span>
        ${isDel(o) && o.payment === 'COD' ? `<span>${t('Cash-collection fee', 'ক্যাশ সংগ্রহের ফি')}</span><span>${tk(codFee)}</span>` : ''}
        ${o.status === 'returned' ? `<span>${t('Return charge', 'রিটার্ন চার্জ')}</span><span>${tk(retCh)}</span><span>${t('Return reason', 'ফেরতের কারণ')}</span><span>${esc(t(o.returnReason || '—', RSN[o.returnReason] || o.returnReason || '—'))}</span>` : ''}
        <span>${t('Payment status', 'টাকার অবস্থা')}</span><span>${money}</span>
      </div>
      <div class="cr-lbl">${t('Tracking steps', 'ট্র্যাকিং ধাপ')}</div>
      <div class="timeline cr-tl">${h.map((e) => `<div class="tl"><i class="${dot(e)}"></i><div><div><b>${esc(t(e.text[0], e.text[1]))}</b></div><div class="t">${A.fmt.dt(e.t)} · ${esc(t(e.where[0], e.where[1]))}</div></div></div>`).join('') || U.empty(t('No steps yet', 'এখনো কোনো ধাপ নেই'))}</div>
      <div class="cr-lbl">${t('From our records', 'আমাদের হিসাব')}</div>
      <div class="cr-kv">
        <span>${t('Order', 'অর্ডার')}</span><span><a href="${A.href('orders', 'all', o.id)}">${esc(o.id)}</a></span>
        <span>${t('Customer', 'কাস্টমার')}</span><span>${esc(o.name)}</span>
        <span>${t('Area', 'এলাকা')}</span><span>${esc(o.area)}, ${esc(place(o.district))} · ${zn[o.zone]}</span>
        <span>${t('Handed over', 'কুরিয়ারে দেওয়া')}</span><span>${A.fmt.dt(handedAt(o))}</span>
      </div>`;
  }
  function openTrack(o) {
    if (typeof o === 'string') o = byIdO(o); if (!o) return;
    const c = cget(o.courier);
    U.drawer(t('Parcel tracking · ', 'পার্সেল ট্র্যাকিং · ') + esc(o.id), trackHtml(o), {
      foot: `<a class="btn" href="${href360(c.id)}">${t('Open Courier 360', 'Courier 360 খুলুন')}</a><button class="btn" id="cr-tcopy">${t('Copy tracking no.', 'ট্র্যাকিং নম্বর কপি')}</button><button class="btn primary" data-close>${t('Close', 'বন্ধ')}</button>`,
      onOpen: (d) => { d.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', () => U.close())); const b = d.querySelector('#cr-tcopy'); if (b) b.onclick = () => U.copy(o.tracking || ''); },
    });
  }

  /* ---------------- courier numbers (shared by Couriers, Finance, Reports) ---------------- */
  function stats(cid, from, to) {
    const r = C().range('30d'); from = from == null ? r.from : from; to = to == null ? r.to : to;
    const c = cget(cid); const all = A.D.orders.filter((o) => (o.courier || '') === cid && WITH.includes(o.status));
    const set = all.filter((o) => C().inRange(o.created, from, to));
    const del = set.filter(isDel), ret = set.filter((o) => o.status === 'returned'); const fin = del.length + ret.length;
    const dd = del.filter((o) => o.deliveredAt).map((o) => (new Date(o.deliveredAt) - handedAt(o)) / DAY);
    const att = del.concat(ret).map((o) => (status(o) || {}).attempts || 0);
    const delivery = A.sum(del, (o) => C().courierFee(o)), codFee = A.sum(del, (o) => C().codFee(o));
    const retCh = A.sum(ret, (o) => Math.round(C().courierFee(o) * (c.returnPct || 50) / 100));
    const cl = claimsOf(cid);
    return {
      parcels: set.length, delivered: del.length, returned: ret.length, inTransit: all.filter((o) => o.status === 'shipped').length,
      success: fin ? del.length / fin * 100 : null, returnPct: fin ? ret.length / fin * 100 : null, avgDays: dd.length ? A.sum(dd) / dd.length : null, attempts: att.length ? A.sum(att) / att.length : null,
      delivery, codFee, retCh, cost: delivery + codFee + retCh, perParcel: fin ? (delivery + codFee + retCh) / fin : null, collected: A.sum(del.filter((o) => o.payment === 'COD'), (o) => o.total),
      held: owed(cid), heldN: heldList(cid).length, oldest: heldList(cid).length ? Math.max(...heldList(cid).map((o) => age(o.deliveredAt))) : 0,
      openClaims: cl.filter(isOpenC).length, claimAmt: toGet(cl), stuck: all.filter(isStuck).length,
    };
  }
  const p30 = () => { const r = C().range('30d'); return { from: r.from, to: r.to }; };

  /* statement for one month: delivered and returned parcels of a courier */
  const MONTHS = () => [['2026-11', t('This month (Nov)', 'এই মাস (নভেম্বর)')], ['2026-10', t('Last month (Oct)', 'গত মাস (অক্টোবর)')]];
  function stmt(cid, ym) {
    const c = cget(cid); const rows = [];
    for (const o of A.D.orders) {
      if ((o.courier || '') !== cid) continue;
      if (isDel(o) && o.deliveredAt && A.fmt.ymd(o.deliveredAt).startsWith(ym)) { const cod = o.payment === 'COD' ? o.total : 0, dl = C().courierFee(o), cf = C().codFee(o); rows.push({ o, date: o.deliveredAt, kind: 'delivered', cod, dl, cf, rt: 0, net: cod - dl - cf }); }
      else if (o.status === 'returned' && A.fmt.ymd(returnAt(o)).startsWith(ym)) { const rt = Math.round(C().courierFee(o) * (c.returnPct || 50) / 100); rows.push({ o, date: new Date(returnAt(o)).toISOString(), kind: 'returned', cod: 0, dl: 0, cf: 0, rt, net: -rt }); }
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return { rows, cod: A.sum(rows, (r) => r.cod), dl: A.sum(rows, (r) => r.dl), cf: A.sum(rows, (r) => r.cf), rt: A.sum(rows, (r) => r.rt), net: A.sum(rows, (r) => r.net) };
  }
  /* lines where the courier's statement and ours disagree (same rules as Finance's courier match) */
  function misOf(o) {
    const n = Number(String(o.id).replace(/\D/g, '')); const fee = C().courierFee(o); const c = cget(o.courier);
    if (isDel(o) && o.payment === 'COD' && o.settled && o.deliveredAt && age(o.deliveredAt) <= 16) {
      if (n % 41 === 3) return { kind: 'fee', diff: 20, text: t(`Courier charged ${tk(fee + 20)} delivery, our rate is ${tk(fee)}`, `কুরিয়ার ডেলিভারি চার্জ কেটেছে ${tk(fee + 20)}, আমাদের রেট ${tk(fee)}`) };
      if (n % 53 === 7) return { kind: 'missing', diff: o.total, text: t(`Marked delivered, but ${tk(o.total)} cash is not in the statement`, `ডেলিভারি দেখাচ্ছে, কিন্তু ${tk(o.total)} ক্যাশ স্টেটমেন্টে নেই`) };
      if (n % 37 === 5) { const s = 50 + (n % 4) * 50; return { kind: 'short', diff: s, text: t(`Cash handed over ${tk(s)} short`, `ক্যাশ ${tk(s)} কম দিয়েছে`) }; }
    }
    if (o.status === 'returned' && n % 5 === 1 && age(new Date(returnAt(o)).toISOString()) <= 16) { const ours = Math.round(fee * (c.returnPct || 50) / 100); return { kind: 'ret', diff: fee - ours, text: t(`Return charge ${tk(fee)}, agreed ${tk(ours)}`, `রিটার্ন চার্জ ${tk(fee)}, ঠিক ছিল ${tk(ours)}`) }; }
    return null;
  }
  const misList = (cid) => A.D.orders.filter((o) => (!cid || o.courier === cid) && WITH.includes(o.status)).map((o) => { const m = misOf(o); return m ? Object.assign({ o, key: o.id + '|' + m.kind }, m) : null; }).filter(Boolean);

  /* money we would save with per-area routing: cheapest connected courier for each area */
  function routing(ym) {
    const live = cs().filter((c) => c.connected); const Z = ZONE(); const rows = [];
    for (const z of Object.keys(Z)) {
      const os = A.D.orders.filter((o) => isDel(o) && o.zone === z && o.deliveredAt && o.courier && A.fmt.ymd(o.deliveredAt).startsWith(ym));
      if (!live.length) continue; const best = live.slice().sort((a, b) => a.fee[z] - b.fee[z])[0];
      const save = A.sum(os, (o) => Math.max(0, C().courierFee(o) - best.fee[z]));
      rows.push({ z, label: Z[z], n: os.length, best: best.name, fee: best.fee[z], save });
    }
    return { rows, total: A.sum(rows, (r) => r.save) };
  }

  /* ---------------- shared UI pieces ---------------- */
  function pin(title, text, okLabel, onOk) {
    const m = U.modal(title, `<p style="margin:0 0 12px">${text}</p>${U.field(t('Owner PIN', 'মালিকের PIN'), U.input('cr-pin', '', 'type="password" inputmode="numeric" maxlength="6" placeholder="••••"'), t('Any 4 digits work in this prototype.', 'এই প্রোটোটাইপে যেকোনো 4 সংখ্যা দিলেই হবে।'))}`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="cr-pin-ok">${okLabel}</button>` });
    const go = () => { if (!/^\d{4,6}$/.test(m.querySelector('#cr-pin').value)) return A.toast(t('Type your 4-digit PIN', '4 সংখ্যার PIN দিন'), 'bad'); U.close(); onOk(); };
    m.querySelector('#cr-pin-ok').onclick = go; m.querySelector('#cr-pin').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    setTimeout(() => { const i = m.querySelector('#cr-pin'); if (i) i.focus(); }, 30);
  }
  const kcard = (o) => `<div class="card">${U.kpi(o)}</div>`;
  function chipsFor(cur, mk) { // courier switch chips, default first
    const d = defId();
    return `<div class="cr-chips">${ordered().map((c) => `<a class="chip ${c.id === cur ? 'on' : ''}" href="${mk(c.id)}" data-c="${c.id}">${esc(c.name)}${c.id === d ? `<small>${t('Default', 'ডিফল্ট')}</small>` : ''}</a>`).join('')}</div>`;
  }
  function wireTrack(el) { A.on(el, '[data-trk]', 'click', (e, b) => { e.stopPropagation(); openTrack(b.dataset.trk); }); }

  function doRequest(cid) {
    const c = cget(cid), e = eligible(cid), min = cfg(cid).minPayout;
    if (!c.connected) return A.toast(t(`${c.name} is not connected. Add its keys first.`, `${c.name} যুক্ত নেই। আগে কি দিন।`), 'bad');
    if (pending(cid).length) return A.toast(t('A payout request is already in progress', 'একটা পেআউট রিকোয়েস্ট আগে থেকেই চলছে'), 'bad');
    if (!e.list.length || e.amount < min) return A.toast(t(`Nothing to request yet (minimum ${tk(min)})`, `এখনো রিকোয়েস্ট করার মতো কিছু নেই (সর্বনিম্ন ${tk(min)})`), 'bad');
    pin(t(`Request payout from ${c.name}?`, `${c.name}-এর কাছে পেআউট রিকোয়েস্ট করবেন?`), t(`${e.list.length} delivered parcels, <b>${tk(e.amount)}</b> after the courier's charges. This goes through ${esc(c.name)}'s own payment request. Its status comes back here by itself.`, `ডেলিভারি হওয়া ${e.list.length}টি পার্সেল, কুরিয়ারের চার্জ কেটে <b>${tk(e.amount)}</b>। এটা ${esc(c.name)}-এর নিজের পেমেন্ট রিকোয়েস্টে যাবে। স্ট্যাটাস নিজে থেকেই এখানে আসবে।`), t('Request payout', 'পেআউট রিকোয়েস্ট'), () => {
      const n = A.D.courierPay.length + 1001;
      A.D.courierPay.unshift({ id: 'CP-' + n, courier: cid, requestedAt: A.TODAY.toISOString(), amount: e.amount, parcels: e.list.length, status: 'requested', paidAt: '', ref: '', method: cid === 'steadfast' ? 'bKash merchant' : 'Bank transfer', oids: e.list.map((o) => o.id) });
      A.commit(`Payout requested from ${c.name}: ${tk(e.amount)}`); A.toast(t(`Payout of ${tk(e.amount)} requested from ${c.name}`, `${c.name}-এর কাছে ${tk(e.amount)} পেআউট রিকোয়েস্ট হয়েছে`), 'good'); A.render();
    });
  }
  function doRefresh() { X().sim += 1; sync(); A.commit('Checked courier payment status'); A.toast(t('Status updated from the courier', 'কুরিয়ার থেকে স্ট্যাটাস আপডেট হয়েছে'), 'good'); A.render(); }
  function makeDefault(cid) {
    const c = cget(cid); if (!c.connected) return A.toast(t(`${c.name} is not connected`, `${c.name} যুক্ত নেই`), 'bad');
    pin(t(`Make ${c.name} the default?`, `${c.name}-কে ডিফল্ট করবেন?`), t('New orders will be booked with this courier. Parcels already booked stay where they are.', 'নতুন অর্ডার এই কুরিয়ারে বুক হবে। আগে বুক হওয়া পার্সেল যেখানে আছে সেখানেই থাকবে।'), t('Make default', 'ডিফল্ট করুন'), () => { sdata().defCourier = cid; A.commit(c.name + ' is now the default courier'); A.toast(t(`${c.name} is now the default courier`, `${c.name} এখন ডিফল্ট কুরিয়ার`), 'good'); A.render(); });
  }

  function payTimeline(p) {
    const st = effStatus(p) === 'rejected' ? 'rejected' : p.status; const rank = { requested: 0, processing: 1, paid: 2, rejected: 2 }[st];
    const stp = [[t('Requested', 'রিকোয়েস্ট'), 0], [t('Processing', 'প্রসেসিং'), 1], [t('Paid', 'পেইড'), 2]];
    return `<div class="steps">${stp.map((s, i) => `<div class="st ${i < rank || (i === rank && st === 'paid') ? 'done' : i === rank ? 'on' : ''}"><b>${i < rank || (i === rank && st === 'paid') ? '✓' : i + 1}</b>${s[0]}</div>`).join('')}</div>`;
  }
  function payTable(list, withC) {
    return U.table([
      { h: t('Requested', 'রিকোয়েস্ট'), f: (p) => `<b>${dshort(p.requestedAt)}</b><div class="muted small mono">${esc(p.id)}</div>` },
      ...(withC ? [{ h: t('Courier', 'কুরিয়ার'), f: (p) => `<a href="${href360(p.courier)}">${esc(cname(p.courier))}</a>` }] : []),
      { h: t('Amount', 'টাকা'), r: true, f: (p) => `<b>${tk(p.amount)}</b><div class="muted small">${p.parcels} ${t('parcels', 'পার্সেল')}</div>` },
      { h: t('Status', 'স্ট্যাটাস'), f: (p) => pbadge(p.status) },
      { h: t('Paid on', 'পেইড হয়েছে'), hide: true, f: (p) => (p.paidAt ? dshort(p.paidAt) : '—') },
      { h: t('Reference', 'রেফারেন্স'), hide: true, f: (p) => (p.ref ? `<span class="mono small">${esc(p.ref)}</span><div class="muted small">${esc(p.method || '')}</div>` : '—') },
    ], list, { empty: t('No payout requests yet', 'এখনো কোনো পেআউট রিকোয়েস্ট নেই') });
  }
  function payoutBox(cid) {
    const c = cget(cid), e = eligible(cid), pd = pending(cid), last = pays(cid)[0], min = cfg(cid).minPayout;
    const can = c.connected && !pd.length && e.list.length && e.amount >= min;
    return `<div class="grid g2">
      ${U.card(t('Request a payout', 'পেআউট রিকোয়েস্ট'), `<div class="cr-kv" style="margin-bottom:12px"><span>${t('Ready to request', 'রিকোয়েস্ট করা যাবে')}</span><span>${tk(e.amount)}</span><span>${t('Delivered parcels', 'ডেলিভারি হওয়া পার্সেল')}</span><span>${e.list.length}</span><span>${t('Minimum to request', 'সর্বনিম্ন রিকোয়েস্ট')}</span><span>${tk(min)}</span></div>
        <div class="cr-row"><button class="btn primary" data-pay="${cid}" ${can ? '' : 'disabled'}>${t('Request payout', 'পেআউট রিকোয়েস্ট করুন')}</button><button class="btn" id="cr-refresh">${A.icon('sync', 15)} ${t('Refresh status', 'স্ট্যাটাস রিফ্রেশ')}</button></div>
        <div class="muted small" style="margin-top:8px">${!c.connected ? t(`${c.name} is not connected yet.`, `${c.name} এখনো যুক্ত নেই।`) : pd.length ? t('A request is in progress. A new one can be made after it is paid.', 'একটা রিকোয়েস্ট চলছে। পেইড হলে নতুন করা যাবে।') : !e.list.length ? t('No delivered cash is waiting.', 'অপেক্ষায় থাকা কোনো ডেলিভারির ক্যাশ নেই।') : e.amount < min ? t('Below the minimum amount.', 'সর্বনিম্ন টাকার নিচে।') : t('This uses the courier\'s own payment request. The answer comes back here by itself.', 'এটা কুরিয়ারের নিজের পেমেন্ট রিকোয়েস্ট দিয়ে হয়। উত্তর নিজে থেকেই এখানে আসে।')}</div>`, { sub: t('Goes through the courier\'s own payment request', 'কুরিয়ারের নিজের পেমেন্ট রিকোয়েস্ট দিয়ে') })}
      ${U.card(t('Latest request', 'শেষ রিকোয়েস্ট'), last ? `<div class="cr-row" style="justify-content:space-between;margin-bottom:10px"><b style="font-size:18px">${tk(last.amount)}</b>${pbadge(last.status)}</div>${payTimeline(last)}<div class="cr-kv" style="margin-top:12px"><span>${t('Requested', 'রিকোয়েস্ট')}</span><span>${A.fmt.dt(last.requestedAt)}</span><span>${t('Parcels', 'পার্সেল')}</span><span>${last.parcels}</span>${last.paidAt ? `<span>${t('Paid on', 'পেইড হয়েছে')}</span><span>${A.fmt.dt(last.paidAt)}</span><span>${t('Reference', 'রেফারেন্স')}</span><span class="mono">${esc(last.ref)}</span>` : ''}</div>` : U.empty(t('No requests yet', 'এখনো কোনো রিকোয়েস্ট নেই')))}
    </div>`;
  }
  function wirePay(el) {
    A.on(el, '[data-pay]', 'click', (e, b) => doRequest(b.dataset.pay));
    const r = el.querySelector('#cr-refresh'); if (r) r.onclick = doRefresh;
  }

  /* statement + mismatch cards (used in Courier 360 and Finance) */
  let stmtMonth = '2026-11';
  function stmtCard(cid) {
    const c = cget(cid), s = stmt(cid, stmtMonth); const shown = s.rows.slice(0, 25);
    return U.card(t('Monthly statement', 'মাসের স্টেটমেন্ট'), `<div class="cr-sticky" style="margin-bottom:10px"><div class="chips" id="cr-sm">${MONTHS().map((m) => `<button class="chip ${m[0] === stmtMonth ? 'on' : ''}" data-m="${m[0]}">${m[1]}</button>`).join('')}</div><button class="btn sm" id="cr-dl">${A.icon('down', 14)} ${t('Download statement', 'স্টেটমেন্ট ডাউনলোড')}</button></div>
      <div class="grid g4" style="margin-bottom:10px">${kcard({ label: t('Cash collected', 'ক্যাশ নেওয়া'), value: tk(s.cod) })}${kcard({ label: t('Delivery charges', 'ডেলিভারি চার্জ'), value: '−' + tk(s.dl) })}${kcard({ label: t('Cash-collection fee', 'ক্যাশ সংগ্রহের ফি'), value: '−' + tk(s.cf) })}${kcard({ label: t('Return charges', 'রিটার্ন চার্জ'), value: '−' + tk(s.rt) })}</div>
      ${U.table([
        { h: t('Date', 'তারিখ'), f: (r) => dshort(r.date) },
        { h: t('Parcel', 'পার্সেল'), f: (r) => `<a href="${A.href('orders', 'all', r.o.id)}">${esc(r.o.id)}</a><div class="muted small mono">${esc(r.o.tracking || '')}</div>` },
        { h: t('Result', 'ফলাফল'), hide: true, f: (r) => U.badge(r.kind === 'delivered' ? t('Delivered', 'ডেলিভারি') : t('Returned', 'ফেরত'), r.kind === 'delivered' ? 'good' : 'warn') },
        { h: t('Cash', 'ক্যাশ'), r: true, hide: true, f: (r) => (r.cod ? tk(r.cod) : '—') },
        { h: t('Charges', 'চার্জ'), r: true, hide: true, f: (r) => '−' + tk(r.dl + r.cf + r.rt) },
        { h: t('Net to us', 'আমরা পাব'), r: true, f: (r) => `<b>${r.net < 0 ? '−' : ''}${tk(Math.abs(r.net))}</b>` },
      ], shown, { empty: t('No parcels in this month', 'এই মাসে কোনো পার্সেল নেই') })}
      <div class="cr-row" style="justify-content:space-between;margin-top:10px"><span class="muted small">${s.rows.length > shown.length ? t(`Showing 25 of ${s.rows.length} lines. The download has all of them.`, `${s.rows.length}টির মধ্যে 25টি দেখাচ্ছে। ডাউনলোডে সব আছে।`) : t(`${s.rows.length} lines`, `${s.rows.length}টি লাইন`)}</span><b>${t('Net to us', 'মোট আমরা পাব')}: ${s.net < 0 ? '−' : ''}${tk(Math.abs(s.net))}</b></div>`, { sub: c.name });
  }
  function misCard(cid) {
    const L = misList(cid); const cl = X().claimed;
    return U.card(t('Lines that do not match', 'যে লাইনগুলো মিলছে না'), U.table([
      { h: t('Parcel', 'পার্সেল'), f: (m) => `<a href="${A.href('orders', 'all', m.o.id)}">${esc(m.o.id)}</a><div class="muted small">${esc(cname(m.o.courier))}</div>` },
      { h: t('What is different', 'কী মিলছে না'), f: (m) => esc(m.text) },
      { h: t('Difference', 'ফারাক'), r: true, f: (m) => `<b>${tk(m.diff)}</b>` },
      { h: '', r: true, f: (m) => (cl[m.key] ? `<span class="muted small">${t('Claimed', 'ক্লেইম করা')} ${esc(cl[m.key])}</span>` : `<button class="btn sm" data-mis="${esc(m.key)}">${t('Claim', 'ক্লেইম')}</button>`) },
    ], L, { empty: t('Everything matches ✓', 'সব মিলেছে ✓') }), { sub: t('Our parcels vs what the courier paid or charged', 'আমাদের পার্সেল বনাম কুরিয়ারের দেওয়া বা কাটা টাকা') });
  }
  function wireStmt(el) {
    A.on(el, '#cr-sm [data-m]', 'click', (e, b) => { stmtMonth = b.dataset.m; A.render(); });
    const d = el.querySelector('#cr-dl'); if (d) d.onclick = () => { const cid = d.dataset.c; U.download(`${cname(cid)}-statement-${stmtMonth}.csv`); };
    A.on(el, '[data-mis]', 'click', (e, b) => {
      const m = misList().find((x) => x.key === b.dataset.mis); if (!m) return;
      const type = 'short_cod'; const c = newClaim(m.o, type, m.diff, m.text);
      X().claimed[m.key] = c.id; A.commit('Claim ' + c.id + ' for ' + m.o.id); A.toast(t(`Claim ${c.id} added to Claims & payouts`, `ক্লেইম ${c.id} “ক্লেইম ও পেআউট”-এ যোগ হয়েছে`), 'good'); A.render();
    });
  }

  /* claims table used in Courier 360 and Claims tab */
  function claimActions(c) {
    const s = cst(c);
    if (s === 'open') return `<button class="btn sm" data-cl="sent" data-id="${esc(c.id)}">${t('Mark sent', 'পাঠানো হয়েছে')}</button>`;
    if (s === 'sent') return `<button class="btn sm primary" data-cl="won" data-id="${esc(c.id)}">${t('Won', 'আদায়')}</button> <button class="btn sm ghost" data-cl="lost" data-id="${esc(c.id)}">${t('Lost', 'পাইনি')}</button>`;
    return '';
  }
  const dleft = (c) => { const d = Math.ceil((new Date(c.deadline) - NOW()) / DAY); return d < 0 ? U.badge(t('Past deadline', 'সময় শেষ'), 'bad') : `<span class="${d <= 3 ? 'cr-hl' : ''}" style="${d <= 3 ? 'color:var(--bad)' : ''}">${t(`${d} days left`, `${d} দিন বাকি`)}</span>`; };
  function claimTable(L, opts = {}) {
    return U.table([
      { h: t('Claim', 'ক্লেইম'), f: (c) => `<b class="mono">${esc(c.id)}</b><div class="muted small"><a href="${A.href('orders', 'all', c.oid)}">${esc(c.oid)}</a>${opts.noC ? '' : ' · ' + esc(cname(c.courier))}</div>` },
      { h: t('Type', 'ধরন'), hide: true, f: (c) => esc(CTY()[cty(c)] || cty(c)) + (c.note ? `<div class="muted small">${esc(c.note)}</div>` : '') },
      { h: t('Amount', 'টাকা'), r: true, f: (c) => `<b>${tk(c.amount)}</b>${c.recovered ? `<div class="small" style="color:var(--good)">${tk(c.recovered)} ${t('back', 'এসেছে')}</div>` : ''}` },
      { h: t('Deadline', 'শেষ সময়'), hide: true, f: (c) => (isOpenC(c) ? dleft(c) : '—') },
      { h: t('Status', 'স্ট্যাটাস'), f: (c) => U.badge(CST()[cst(c)][0], CST()[cst(c)][1]) },
      { h: '', r: true, f: claimActions },
    ], L, { empty: t('No claims', 'কোনো ক্লেইম নেই') });
  }
  function wireClaims(el) {
    A.on(el, '[data-cl]', 'click', (e, b) => {
      const c = claimsAll().find((x) => x.id === b.dataset.id); if (!c) return; const k = b.dataset.cl;
      if (k === 'sent') { c.status = 'sent'; A.commit('Claim ' + c.id + ' sent'); A.toast(t(`Claim ${c.id} sent to ${cname(c.courier)}`, `ক্লেইম ${c.id} ${cname(c.courier)}-কে পাঠানো হয়েছে`), 'good'); return A.render(); }
      if (k === 'lost') return U.confirm(t('Mark as lost?', 'পাইনি হিসেবে মার্ক করবেন?'), t(`${cname(c.courier)} did not pay claim ${c.id}. It stays in the list for the record.`, `${cname(c.courier)} ক্লেইম ${c.id} দেয়নি। রেকর্ডের জন্য তালিকায় থাকবে।`), t('Mark lost', 'পাইনি মার্ক'), () => { c.status = 'lost'; A.commit('Claim ' + c.id + ' lost'); A.toast(t('Marked as lost', 'পাইনি হিসেবে মার্ক হয়েছে')); A.render(); });
      const m = U.modal(t('Money received from the courier', 'কুরিয়ার থেকে টাকা এসেছে'), U.field(t('Amount received', 'যত টাকা এসেছে'), U.money('cr-rec', c.amount), t(`Claimed ${tk(c.amount)}`, `ক্লেইম ${tk(c.amount)}`)), { foot: `<button class="btn" data-close>${t('Back', 'ফিরে যান')}</button><button class="btn primary" id="cr-rec-ok">${t('Save', 'সেভ')}</button>` });
      m.querySelector('#cr-rec-ok').onclick = () => { const v = Math.max(0, Math.round(+m.querySelector('#cr-rec').value || 0)); pin(t('Record money received?', 'টাকা আসার হিসাব তুলবেন?'), t(`${tk(v)} from ${cname(c.courier)} goes to the courier's account.`, `${cname(c.courier)} থেকে ${tk(v)} কুরিয়ারের অ্যাকাউন্টে জমা হবে।`), t('Save', 'সেভ'), () => { c.recovered = v; c.status = 'won'; A.commit(`Claim ${c.id}: ${tk(v)} recovered`); A.toast(t(`${tk(v)} recovered`, `${tk(v)} আদায় হয়েছে`), 'good'); A.render(); }); };
    });
  }
  function newClaimModal(cid) {
    const pool = A.D.orders.filter((o) => o.courier && (!cid || o.courier === cid) && ['shipped', 'delivered', 'returned'].includes(o.status)).slice(0, 80);
    if (!pool.length) return A.toast(t('No parcels to claim on', 'ক্লেইম করার মতো পার্সেল নেই'), 'bad');
    const m = U.modal(t('New claim', 'নতুন ক্লেইম'), `<div class="formgrid">${U.field(t('Parcel', 'পার্সেল'), U.select('cr-no', pool.map((o) => [o.id, `${o.id} · ${o.name} · ${cname(o.courier)}`]), pool[0].id))}${U.field(t('Type', 'ধরন'), U.select('cr-nt', Object.keys(CTY()).map((k) => [k, CTY()[k]]), 'lost'))}${U.field(t('Amount', 'টাকা'), U.money('cr-na', C().cogs(pool[0])))}${U.field(t('Note', 'নোট'), U.input('cr-nn', '', 'placeholder="' + t('What happened', 'কী হয়েছে') + '"'))}</div>`, { foot: `<button class="btn" data-close>${t('Cancel', 'বাতিল')}</button><button class="btn primary" id="cr-nok">${t('Add claim', 'ক্লেইম যোগ করুন')}</button>` });
    const so = m.querySelector('#cr-no'); so.onchange = () => { m.querySelector('#cr-na').value = C().cogs(byIdO(so.value)); };
    m.querySelector('#cr-nok').onclick = () => { const o = byIdO(so.value); const a = Math.round(+m.querySelector('#cr-na').value || 0); if (!o || a <= 0) return A.toast(t('Pick a parcel and an amount', 'পার্সেল ও টাকা দিন'), 'bad'); const c = newClaim(o, m.querySelector('#cr-nt').value, a, m.querySelector('#cr-nn').value.trim()); U.close(); A.commit('New claim ' + c.id); A.toast(t(`Claim ${c.id} added`, `ক্লেইম ${c.id} যোগ হয়েছে`), 'good'); A.render(); };
  }

  /* setup card (connection, pickup, rates, payout settings) */
  function setupCard(cid) {
    const c = cget(cid), z = ZONE(), s = sdata(), x = X(), cf = cfg(cid); const main = defId() === cid;
    const others = cs().filter((q) => q.id !== cid);
    return U.card(c.name, `<div class="cr-row" style="justify-content:space-between;margin-bottom:8px">${U.badge(c.connected ? t('Connected', 'যুক্ত আছে') : t('Not connected', 'যুক্ত নেই'), c.connected ? 'good' : 'bad')}${main ? U.badge(t('Default', 'ডিফল্ট'), 'accent') : x.backup === cid ? U.badge(t('Backup', 'ব্যাকআপ'), 'info') : ''}<button class="btn sm" data-test="${cid}">${A.icon('sync', 14)} ${t('Test connection', 'কানেকশন টেস্ট')}</button></div>
      <div class="cr-lbl">${t('Pickup', 'পিকআপ')}</div>
      <div class="cr-kv"><span>${t('From', 'কোথা থেকে')}</span><span>${esc(s.pickup === 'warehouse' || !s.pickup ? t('Warehouse', 'গুদাম') : s.pickup)}</span><span>${t('Pickup time', 'পিকআপের সময়')}</span><span>${esc(s.pickupTime || '17:00')}</span></div>
      <div class="cr-lbl">${t('Rate card (what the courier charges us)', 'রেট কার্ড (কুরিয়ার আমাদের কাছে কত নেয়)')}</div>
      <div class="cr-kv">${Object.keys(z).map((k) => `<span>${z[k]}</span><span>${tk(c.fee[k])}</span>`).join('')}<span>${t('Cash-collection fee', 'ক্যাশ সংগ্রহের ফি')}</span><span>${c.codPct}%</span><span>${t('Return charge', 'রিটার্ন চার্জ')}</span><span>${c.returnPct}% ${t('of delivery', 'ডেলিভারি চার্জের')}</span></div>
      <div class="cr-lbl">${t('Payout and alerts', 'পেআউট ও সতর্কতা')}</div>
      <div class="formgrid">${U.field(t('Smallest payout to request', 'সর্বনিম্ন পেআউট রিকোয়েস্ট'), U.money('cs-min-' + cid, cf.minPayout))}${U.field(t('Days the courier takes to pay', 'কুরিয়ার কত দিনে টাকা দেয়'), U.input('cs-days-' + cid, cf.payDays, 'type="number" min="1" max="14"'), t('Used to show the expected date', 'সম্ভাব্য তারিখ দেখাতে ব্যবহার হয়'))}</div>
      <div class="cr-row" style="margin-top:10px"><button class="btn sm primary" data-savecfg="${cid}">${t('Save', 'সেভ')}</button>${!main && c.connected ? `<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-bk="${cid}" ${x.backup === cid ? 'checked' : ''}> ${t('Use as backup courier', 'ব্যাকআপ কুরিয়ার হিসেবে রাখুন')}</label>` : ''}<a class="btn sm ghost" href="${A.href('settings', 'store', 'couriers')}">${t('Edit rates in Settings', 'সেটিংসে রেট বদলান')} →</a></div>`, { sub: others.length ? '' : '' });
  }
  function wireSetup(el) {
    A.on(el, '[data-test]', 'click', (e, b) => { const c = cget(b.dataset.test); if (!c.connected) return A.toast(t(`${c.name} is not connected. Add the keys in Settings › System › Keys & connections.`, `${c.name} যুক্ত নেই। সেটিংস › সিস্টেম › কি ও কানেকশনে কি দিন।`), 'bad'); A.toast(t(`${c.name}: connected, replied in ${Math.round(120 + H(c.id) * 260)} ms`, `${c.name}: যুক্ত আছে, ${Math.round(120 + H(c.id) * 260)} মিলিসেকেন্ডে উত্তর দিয়েছে`), 'good'); });
    A.on(el, '[data-savecfg]', 'click', (e, b) => { const id = b.dataset.savecfg; const mn = Math.max(0, Math.round(+el.querySelector('#cs-min-' + id).value || 0)); const dy = Math.max(1, Math.min(14, Math.round(+el.querySelector('#cs-days-' + id).value || 3))); X().cfg[id] = { minPayout: mn, payDays: dy }; A.commit('Courier payout settings saved: ' + cname(id)); A.toast(t('Saved', 'সেভ হয়েছে'), 'good'); A.render(); });
    A.on(el, '[data-bk]', 'change', (e, b) => { X().backup = b.checked ? b.dataset.bk : ''; A.commit('Backup courier: ' + (b.checked ? cname(b.dataset.bk) : 'none')); A.toast(t('Saved', 'সেভ হয়েছে'), 'good'); A.render(); });
  }

  /* ================= PAGE: All couriers ================= */
  function renderOverview(el) {
    X(); sync(); const d = defId(); const L = ordered(); const S = Object.fromEntries(L.map((c) => [c.id, stats(c.id)]));
    const best = L.filter((c) => S[c.id].success != null).sort((a, b) => S[b.id].success - S[a.id].success)[0];
    const slow = L.filter((c) => S[c.id].avgDays != null).sort((a, b) => S[b.id].avgDays - S[a.id].avgDays)[0];
    const stuck = A.D.orders.filter(isStuck); const heldAll = A.sum(L, (c) => S[c.id].held);
    const needs = [];
    if (stuck.length) needs.push([`${t(`${stuck.length} parcel(s) have not moved for ${X().stuckH}+ hours`, `${stuck.length}টি পার্সেল ${X().stuckH}+ ঘণ্টা ধরে নড়ছে না`)}`, href360((cget(stuck[0].courier)).id), 'bad']);
    L.forEach((c) => { const e = eligible(c.id); if (c.connected && !pending(c.id).length && e.amount >= cfg(c.id).minPayout) needs.push([t(`${tk(e.amount)} ready to request from ${c.name}`, `${c.name}-এর কাছে ${tk(e.amount)} রিকোয়েস্ট করা যায়`), href360(c.id), 'warn']); });
    const soon = claimsAll().filter((c) => isOpenC(c) && (new Date(c.deadline) - NOW()) / DAY <= 3);
    if (soon.length) needs.push([t(`${soon.length} claim(s) end within 3 days`, `${soon.length}টি ক্লেইমের সময় 3 দিনের মধ্যে শেষ`), A.href('couriers', 'claims'), 'warn']);
    const mm = misList().length; if (mm) needs.push([t(`${mm} statement line(s) do not match`, `স্টেটমেন্টের ${mm}টি লাইন মিলছে না`), A.href('finance', 'couriers'), 'warn']);
    el.innerHTML = A.pageHead(t('Couriers', 'কুরিয়ার'), t('Every courier you use: parcels, cash they hold, how well they deliver and what they owe.', 'আপনার সব কুরিয়ার: পার্সেল, তাদের কাছে থাকা ক্যাশ, ডেলিভারি কেমন এবং কত পাওনা।'), `<a class="btn" href="${href360(d)}">${t('Open Courier 360', 'Courier 360 খুলুন')}</a>`) + A.tabsBar('couriers', 'overview') +
      `<div class="grid g4" style="margin-top:14px">${kcard({ label: t('Parcels with couriers', 'কুরিয়ারের কাছে পার্সেল'), value: num(A.sum(L, (c) => S[c.id].inTransit)), sub: t('on the way now', 'এখন রাস্তায়'), icon: 'truck' })}${kcard({ label: t('Cash they hold for us', 'আমাদের ক্যাশ তাদের কাছে'), value: tk(heldAll), sub: t('after their charges', 'তাদের চার্জ কেটে') })}${kcard({ label: t('Open claims', 'খোলা ক্লেইম'), value: num(claimsAll().filter(isOpenC).length), sub: tk(toGet(claimsAll())) + ' ' + t('to get back', 'ফেরত পাব') })}${kcard({ label: t('Best success rate', 'সেরা সাফল্যের হার'), value: best ? pc(S[best.id].success) : '—', sub: best ? best.name + ' · 30 ' + t('days', 'দিন') : '' })}</div>
      ${needs.length ? `<div style="height:14px"></div>${U.card(t('What needs you', 'যা দেখা দরকার'), `<div class="list">${needs.map((n) => `<a class="li" href="${n[1]}" style="color:inherit;text-decoration:none"><span class="grow">${esc(n[0])}</span>${U.badge(t('Open', 'দেখুন'), n[2])}</a>`).join('')}</div>`)}` : ''}
      <div class="grid g3" style="margin-top:14px">${L.map((c) => { const s = S[c.id]; const pd = pending(c.id)[0]; const e = eligible(c.id); const ps = pd ? pbadge(pd.status) + ' ' + tk(pd.amount) : e.amount >= cfg(c.id).minPayout && c.connected ? U.badge(t('Ready to request', 'রিকোয়েস্ট করা যাবে'), 'info') + ' ' + tk(e.amount) : t('Nothing due', 'কিছু বাকি নেই');
        return `<div class="card cr-card"><div class="cr-row" style="justify-content:space-between"><h3>${esc(c.name)}</h3><span class="cr-row">${c.id === d ? U.badge(t('Default', 'ডিফল্ট'), 'accent') : ''}${U.badge(c.connected ? t('Connected', 'যুক্ত') : t('Not connected', 'যুক্ত নেই'), c.connected ? 'good' : 'bad')}</span></div>
          <div class="cr-mini"><div><b>${s.inTransit}</b><span>${t('In transit', 'রাস্তায়')}</span></div><div><b>${tk(s.held)}</b><span>${t('Cash held', 'ক্যাশ আছে')}</span></div><div><b>${pc(s.success)}</b><span>${t('Success rate', 'সাফল্যের হার')}</span></div><div><b>${s.avgDays == null ? '—' : (Math.round(s.avgDays * 10) / 10)}</b><span>${t('Avg days', 'গড় দিন')}</span></div><div><b>${s.openClaims}</b><span>${t('Open claims', 'খোলা ক্লেইম')}</span></div><div><b>${s.stuck}</b><span>${t('Stuck', 'আটকে')}</span></div></div>
          <div class="small"><span class="muted">${t('Payout', 'পেআউট')}:</span> ${ps}</div>
          <div class="cr-row"><a class="btn primary sm" href="${href360(c.id)}">${t('Open Courier 360', 'Courier 360 খুলুন')}</a>${c.id !== d ? `<button class="btn sm" data-def="${c.id}">${t('Make default', 'ডিফল্ট করুন')}</button>` : ''}</div></div>`; }).join('')}</div>
      <div style="height:14px"></div>
      ${U.card(t('Compare couriers', 'কুরিয়ার তুলনা'), compareTable(S, L), { sub: t('Last 30 days', 'গত 30 দিন') })}
      ${best && slow ? `<div style="height:12px"></div>${U.guide(t(`${esc(best.name)} has the best success rate (${pc(S[best.id].success)}). ${esc(slow.name)} takes longest (${days1(S[slow.id].avgDays)} on average).`, `${esc(best.name)}-এর সাফল্যের হার সবচেয়ে ভালো (${pc(S[best.id].success)})। ${esc(slow.name)} সবচেয়ে বেশি সময় নেয় (গড়ে ${days1(S[slow.id].avgDays)})।`))}` : ''}`;
    A.on(el, '[data-def]', 'click', (e, b) => makeDefault(b.dataset.def));
  }
  function compareTable(S, L) {
    const hi = (key, hiBest) => { const v = L.map((c) => S[c.id][key]).filter((x) => x != null); return v.length ? (hiBest ? Math.max(...v) : Math.min(...v)) : null; };
    const bs = hi('success', true), bd = hi('avgDays', false), bc = hi('perParcel', false), br = hi('returnPct', false);
    const cell = (v, best, f) => `<span class="${v != null && v === best && L.length > 1 ? 'cr-hl' : ''}">${v == null ? '—' : f(v)}</span>`;
    return U.table([
      { h: t('Courier', 'কুরিয়ার'), f: (c) => `<a href="${href360(c.id)}"><b>${esc(c.name)}</b></a>` },
      { h: t('Parcels', 'পার্সেল'), r: true, f: (c) => num(S[c.id].parcels) },
      { h: t('Success', 'সাফল্য'), r: true, f: (c) => cell(S[c.id].success, bs, pc) },
      { h: t('Returned', 'ফেরত'), r: true, hide: true, f: (c) => cell(S[c.id].returnPct, br, pc) },
      { h: t('Avg days', 'গড় দিন'), r: true, f: (c) => cell(S[c.id].avgDays, bd, (v) => (Math.round(v * 10) / 10) + '') },
      { h: t('Cost per parcel', 'প্রতি পার্সেল খরচ'), r: true, hide: true, f: (c) => cell(S[c.id].perParcel, bc, (v) => tk(Math.round(v))) },
      { h: t('Cash held', 'ক্যাশ আছে'), r: true, hide: true, f: (c) => tk(S[c.id].held) },
      { h: t('Open claims', 'খোলা ক্লেইম'), r: true, hide: true, f: (c) => S[c.id].openClaims },
    ], L);
  }

  /* ================= PAGE: Courier 360 ================= */
  let sec360 = 'overview'; const pf = { q: '', st: 'all', n: 40 };
  const SECS = () => [['overview', t('Overview', 'ওভারভিউ')], ['parcels', t('Parcels', 'পার্সেল')], ['money', t('Money', 'টাকা')], ['payouts', t('Payouts', 'পেআউট')], ['perf', t('Performance', 'পারফরম্যান্স')], ['claims', t('Claims', 'ক্লেইম')], ['msgs', t('Messages', 'মেসেজ')], ['setup', t('Setup', 'সেটআপ')]];
  function renderC360(el, r) {
    X(); sync(); const id = cs().some((c) => c.id === r.id) ? r.id : defId(); const c = cget(id);
    if (!SECS().some((s) => s[0] === sec360)) sec360 = 'overview';
    const nav = `<div class="chips" id="cr-secs" style="margin:12px 0">${SECS().map((s) => `<button class="chip ${s[0] === sec360 ? 'on' : ''}" data-s="${s[0]}">${s[1]}</button>`).join('')}</div>`;
    el.innerHTML = A.pageHead(t('Courier 360', 'কুরিয়ার 360'), t('Everything about one courier in one place.', 'একটা কুরিয়ারের সবকিছু এক জায়গায়।'), `${c.id !== defId() ? `<button class="btn" id="cr-mkdef">${t('Make default', 'ডিফল্ট করুন')}</button>` : ''}`) + A.tabsBar('couriers', 'c360') + chipsFor(id, href360) + nav + `<div id="cr-body"></div>`;
    A.on(el, '#cr-secs [data-s]', 'click', (e, b) => { sec360 = b.dataset.s; pf.n = 40; A.render(); });
    const md = el.querySelector('#cr-mkdef'); if (md) md.onclick = () => makeDefault(id);
    const box = el.querySelector('#cr-body'); const fn = { overview: secOverview, parcels: secParcels, money: secMoney, payouts: secPayouts, perf: secPerf, claims: secClaims, msgs: secMsgs, setup: secSetup }[sec360];
    fn(box, id);
  }
  function secOverview(box, id) {
    const c = cget(id), s = stats(id), e = eligible(id), pd = pending(id)[0], others = cs().filter((q) => q.id !== id);
    const avgO = others.map((q) => stats(q.id).success).filter((v) => v != null); const oAvg = avgO.length ? A.sum(avgO) / avgO.length : null;
    const days = []; for (let k = 13; k >= 0; k--) { const day = A.fmt.ymd(NOW() - k * DAY); days.push({ day, d: A.D.orders.filter((o) => o.courier === id && isDel(o) && o.deliveredAt && A.fmt.ymd(o.deliveredAt) === day).length, r: A.D.orders.filter((o) => o.courier === id && o.status === 'returned' && A.fmt.ymd(returnAt(o)) === day).length }); }
    const now = [];
    if (!c.connected) now.push([t(`${c.name} is not connected. Statuses are from our own entries and payouts cannot be requested.`, `${c.name} যুক্ত নেই। স্ট্যাটাস আমাদের নিজেদের এন্ট্রি থেকে এবং পেআউট রিকোয়েস্ট করা যাবে না।`), 'bad', 'setup']);
    if (s.stuck) now.push([t(`${s.stuck} parcel(s) have not moved for ${X().stuckH}+ hours.`, `${s.stuck}টি পার্সেল ${X().stuckH}+ ঘণ্টা ধরে নড়ছে না।`), 'warn', 'parcels']);
    if (pd) now.push([t(`Payout of ${tk(pd.amount)} is ${PST()[pd.status][0].toLowerCase()}.`, `${tk(pd.amount)} পেআউট এখন: ${PST()[pd.status][0]}।`), 'info', 'payouts']);
    else if (c.connected && e.amount >= cfg(id).minPayout) now.push([t(`${tk(e.amount)} from ${e.list.length} delivered parcels is ready to request.`, `ডেলিভারি হওয়া ${e.list.length}টি পার্সেলের ${tk(e.amount)} রিকোয়েস্ট করা যায়।`), 'warn', 'payouts']);
    const cl = claimsOf(id).filter(isOpenC); if (cl.length) now.push([t(`${cl.length} open claim(s), ${tk(toGet(cl))} to get back.`, `${cl.length}টি খোলা ক্লেইম, ${tk(toGet(cl))} ফেরত পাব।`), 'warn', 'claims']);
    const ml = misList(id).length; if (ml) now.push([t(`${ml} statement line(s) do not match our records.`, `স্টেটমেন্টের ${ml}টি লাইন আমাদের হিসাবের সাথে মিলছে না।`), 'warn', 'money']);
    if (s.success != null && oAvg != null) now.push([t(`Success rate ${pc(s.success)}, ${s.success >= oAvg ? 'above' : 'below'} the other couriers (${pc(oAvg)}).`, `সাফল্যের হার ${pc(s.success)}, অন্য কুরিয়ারের (${pc(oAvg)}) ${s.success >= oAvg ? 'চেয়ে বেশি' : 'চেয়ে কম'}।`), s.success >= oAvg ? 'good' : 'warn', 'perf']);
    box.innerHTML = `<div class="grid g4">${kcard({ label: t('In transit', 'রাস্তায়'), value: s.inTransit, sub: s.stuck ? t(`${s.stuck} stuck`, `${s.stuck}টি আটকে`) : t('none stuck', 'কোনোটা আটকে নেই'), icon: 'truck' })}${kcard({ label: t('Cash held', 'ক্যাশ আছে'), value: tk(s.held), sub: t(`${s.heldN} parcels, after charges`, `${s.heldN}টি পার্সেল, চার্জ কেটে`) })}${kcard({ label: t('Success rate', 'সাফল্যের হার'), value: pc(s.success), sub: t('last 30 days', 'গত 30 দিন') })}${kcard({ label: t('Average delivery', 'গড় ডেলিভারি'), value: days1(s.avgDays), sub: t('door to door', 'গুদাম থেকে দরজা') })}</div>
      <div class="grid g2" style="margin-top:14px">${U.card(t('What to do now', 'এখন কী করবেন'), now.length ? `<div class="list">${now.map((n) => `<div class="li"><span class="grow">${esc(n[0])}</span><button class="btn sm ghost" data-go="${n[2]}">${t('Open', 'দেখুন')}</button></div>`).join('')}</div>` : U.empty(t('All good. Nothing needs you.', 'সব ঠিক আছে। কিছু করার নেই।')))}
      ${U.card(t('Last 14 days', 'গত 14 দিন'), A.chart.columns({ labels: days.map((x) => x.day.slice(8)), values: days.map((x) => x.d), values2: days.map((x) => x.r), money: false, height: 170 }), { sub: t('Delivered (bars) and returned per day', 'দিনে ডেলিভারি ও ফেরত') })}</div>
      <div class="grid g2" style="margin-top:14px">${U.card(t('Payout', 'পেআউট'), pd ? `<div class="cr-row" style="justify-content:space-between;margin-bottom:10px"><b style="font-size:18px">${tk(pd.amount)}</b>${pbadge(pd.status)}</div>${payTimeline(pd)}` : `<div class="cr-kv"><span>${t('Ready to request', 'রিকোয়েস্ট করা যাবে')}</span><span>${tk(e.amount)}</span></div>`, { more: t('Payouts', 'পেআউট'), moreHref: 'javascript:void(0)' })}
      ${U.card(t('Cost of this courier', 'এই কুরিয়ারের খরচ'), `<div class="cr-kv"><span>${t('Delivery charges', 'ডেলিভারি চার্জ')}</span><span>${tk(s.delivery)}</span><span>${t('Cash-collection fee', 'ক্যাশ সংগ্রহের ফি')}</span><span>${tk(s.codFee)}</span><span>${t('Return charges', 'রিটার্ন চার্জ')}</span><span>${tk(s.retCh)}</span><span><b>${t('Total, last 30 days', 'মোট, গত 30 দিন')}</b></span><span>${tk(s.cost)}</span><span>${t('Per parcel', 'প্রতি পার্সেল')}</span><span>${s.perParcel == null ? '—' : tk(Math.round(s.perParcel))}</span></div>`)}</div>`;
    A.on(box, '[data-go]', 'click', (e, b) => { sec360 = b.dataset.go; A.render(); });
    A.on(box, 'a.more', 'click', (e) => { e.preventDefault(); sec360 = 'payouts'; A.render(); });
  }
  function parcelsFor(id) {
    let L = A.D.orders.filter((o) => (o.courier || '') === id && WITH.includes(o.status)).sort((a, b) => handedAt(b) - handedAt(a));
    const f = pf.st;
    if (f !== 'all') L = L.filter((o) => { const s = status(o); if (f === 'stuck') return isStuck(o); if (f === 'transit') return o.status === 'shipped' && s && !['out_for_delivery', 'attempt_failed', 'on_hold'].includes(s.code); if (f === 'ofd') return s && s.code === 'out_for_delivery'; if (f === 'issue') return s && ['attempt_failed', 'on_hold'].includes(s.code); if (f === 'delivered') return isDel(o); if (f === 'returns') return o.status === 'returned'; return true; });
    const q = pf.q.trim().toLowerCase(); if (q) L = L.filter((o) => (o.id + ' ' + (o.tracking || '') + ' ' + o.name + ' ' + o.phone + ' ' + o.district).toLowerCase().includes(q));
    return L;
  }
  function parcelTable(id) {
    const L = parcelsFor(id); const shown = L.slice(0, pf.n);
    return U.table([
      { h: t('Order', 'অর্ডার'), f: (o) => `<a href="${A.href('orders', 'all', o.id)}"><b>${esc(o.id)}</b></a><div class="muted small mono">${esc(o.tracking || '')}</div>` },
      { h: t('Customer', 'কাস্টমার'), hide: true, f: (o) => `${esc(o.name)}<div class="muted small">${esc(place(o.district))}</div>` },
      { h: t('Courier status', 'কুরিয়ারের স্ট্যাটাস'), f: (o) => sbadge(o, true) + (isStuck(o) ? ' ' + U.badge(t('Stuck', 'আটকে'), 'bad') : '') },
      { h: t('Last update', 'শেষ আপডেট'), hide: true, f: (o) => { const s = status(o); return s ? `<span class="small">${A.fmt.ago(s.at)}</span>` : '—'; } },
      { h: t('Cash', 'ক্যাশ'), r: true, f: (o) => (o.payment === 'COD' ? tk(o.total) : '<span class="muted small">' + t('Prepaid', 'পেইড') + '</span>') },
    ], shown.map((o) => Object.assign({ _id: o.id }, o)), { onRow: true, empty: t('No parcels match', 'কোনো পার্সেল মেলেনি') }) + `<div class="cr-row" style="justify-content:space-between;margin-top:10px"><span class="muted small">${t(`Showing ${shown.length} of ${L.length}`, `${L.length}টির মধ্যে ${shown.length}টি দেখাচ্ছে`)}</span>${L.length > shown.length ? `<button class="btn sm" id="cr-more">${t('Show more', 'আরও দেখান')}</button>` : ''}</div>`;
  }
  function secParcels(box, id) {
    const FS = [['all', t('All', 'সব')], ['transit', t('In transit', 'রাস্তায়')], ['ofd', t('Out for delivery', 'ডেলিভারিতে')], ['issue', t('Failed / on hold', 'ফেইলড / হোল্ড')], ['stuck', t('Stuck', 'আটকে')], ['delivered', t('Delivered', 'ডেলিভারি হয়েছে')], ['returns', t('Returned', 'ফেরত')]];
    box.innerHTML = U.card(t('Parcels', 'পার্সেল'), `<div class="cr-row" style="margin-bottom:10px"><input class="inp" id="cr-q" type="search" style="max-width:300px" placeholder="${t('Search order, tracking no., name', 'অর্ডার, ট্র্যাকিং নম্বর, নাম খুঁজুন')}" value="${esc(pf.q)}"></div><div class="chips" id="cr-pf" style="margin-bottom:10px">${FS.map((f) => `<button class="chip ${pf.st === f[0] ? 'on' : ''}" data-f="${f[0]}">${f[1]}</button>`).join('')}</div><div id="cr-ptbl">${parcelTable(id)}</div>`, { sub: t('Click a parcel to see its full tracking', 'পুরো ট্র্যাকিং দেখতে পার্সেলে ক্লিক করুন') });
    const draw = () => { const w = box.querySelector('#cr-ptbl'); w.innerHTML = parcelTable(id); wireTbl(); };
    const wireTbl = () => { wireTrack(box); A.on(box, '#cr-ptbl tr[data-row]', 'click', (e, tr) => { if (e.target.closest('a,button')) return; openTrack(tr.dataset.row); }); const m = box.querySelector('#cr-more'); if (m) m.onclick = () => { pf.n += 40; draw(); }; };
    box.querySelector('#cr-q').oninput = (e) => { pf.q = e.target.value; pf.n = 40; draw(); };
    A.on(box, '#cr-pf [data-f]', 'click', (e, b) => { pf.st = b.dataset.f; pf.n = 40; A.render(); });
    wireTbl();
  }
  function secMoney(box, id) {
    const c = cget(id), s = stats(id), L = heldList(id); const gross = A.sum(L, (o) => o.total), dl = A.sum(L, (o) => C().courierFee(o)), cf = A.sum(L, (o) => C().codFee(o));
    box.innerHTML = `<div class="grid g4">${kcard({ label: t('Cash they hold', 'তাদের কাছে ক্যাশ'), value: tk(s.held), sub: t(`${L.length} parcels, after charges`, `${L.length}টি পার্সেল, চার্জ কেটে`) })}${kcard({ label: t('Collected, 30 days', 'ক্যাশ নেওয়া, 30 দিন'), value: tk(s.collected) })}${kcard({ label: t('Charges, 30 days', 'চার্জ, 30 দিন'), value: tk(s.cost), sub: t('delivery + cash fee + return', 'ডেলিভারি + ক্যাশ ফি + রিটার্ন') })}${kcard({ label: t('Oldest unpaid', 'সবচেয়ে পুরোনো বাকি'), value: s.heldN ? t(`${Math.round(s.oldest)} days`, `${Math.round(s.oldest)} দিন`) : '—', sub: t('since delivery', 'ডেলিভারির পর থেকে') })}</div>
      <div class="grid g2" style="margin-top:14px">${U.card(t('What they owe us now', 'এখন তারা আমাদের কত দেবে'), `<div class="cr-kv"><span>${t('Cash collected from customers', 'কাস্টমারের কাছ থেকে নেওয়া ক্যাশ')}</span><span>${tk(gross)}</span><span>${t('Delivery charges', 'ডেলিভারি চার্জ')}</span><span>−${tk(dl)}</span><span>${t('Cash-collection fee', 'ক্যাশ সংগ্রহের ফি')}</span><span>−${tk(cf)}</span><span><b>${t('They will pay us', 'তারা আমাদের দেবে')}</b></span><span>${tk(gross - dl - cf)}</span></div><div class="muted small" style="margin-top:10px">${t('Same figure as Finance and Home.', 'Finance ও Home-এর সাথে একই অঙ্ক।')}</div>`, { sub: t('Delivered parcels whose cash is not paid out yet', 'ডেলিভারি হয়েছে কিন্তু ক্যাশ এখনো দেয়নি') })}
      ${U.card(t('Charges, last 30 days', 'চার্জ, গত 30 দিন'), `<div class="cr-kv"><span>${t(`Delivery (${s.delivered} parcels)`, `ডেলিভারি (${s.delivered}টি পার্সেল)`)}</span><span>${tk(s.delivery)}</span><span>${t('Cash-collection fee', 'ক্যাশ সংগ্রহের ফি')} (${c.codPct}%)</span><span>${tk(s.codFee)}</span><span>${t(`Returns (${s.returned} parcels)`, `রিটার্ন (${s.returned}টি পার্সেল)`)}</span><span>${tk(s.retCh)}</span><span><b>${t('Total', 'মোট')}</b></span><span>${tk(s.cost)}</span></div>`)}</div>
      <div style="height:14px"></div>${stmtCard(id)}<div style="height:14px"></div>${misCard(id)}`;
    const dl2 = box.querySelector('#cr-dl'); if (dl2) dl2.dataset.c = id; wireStmt(box);
  }
  function secPayouts(box, id) {
    box.innerHTML = payoutBox(id) + `<div style="height:14px"></div>` + U.card(t('All payout requests', 'সব পেআউট রিকোয়েস্ট'), payTable(pays(id)), { sub: t('Status comes from the courier by itself: Requested, Processing, Paid', 'স্ট্যাটাস কুরিয়ার থেকে নিজে থেকেই আসে: রিকোয়েস্ট, প্রসেসিং, পেইড') });
    wirePay(box);
  }
  function secPerf(box, id) {
    const s = stats(id), c = cget(id), r = p30(); const os = A.D.orders.filter((o) => o.courier === id && WITH.includes(o.status) && C().inRange(o.created, r.from, r.to)); const Z = ZONE();
    const grp = (keyf) => { const g = A.groupBy(os, keyf); return Object.keys(g).map((k) => { const L = g[k], dl = L.filter(isDel), rt = L.filter((o) => o.status === 'returned'), f = dl.length + rt.length; const dd = dl.filter((o) => o.deliveredAt).map((o) => (new Date(o.deliveredAt) - handedAt(o)) / DAY); return { k, n: L.length, success: f ? dl.length / f * 100 : null, days: dd.length ? A.sum(dd) / dd.length : null, ret: rt.length }; }); };
    const zr = grp((o) => o.zone), dr = grp((o) => o.district).sort((a, b) => b.n - a.n).slice(0, 8);
    const stuck = A.D.orders.filter((o) => o.courier === id && isStuck(o));
    const L = ordered(); const S = Object.fromEntries(L.map((q) => [q.id, stats(q.id)]));
    const tb = (rows, nm) => U.table([{ h: nm, f: (x) => esc(x.lab) }, { h: t('Parcels', 'পার্সেল'), r: true, f: (x) => x.n }, { h: t('Success', 'সাফল্য'), r: true, f: (x) => pc(x.success) }, { h: t('Avg days', 'গড় দিন'), r: true, f: (x) => (x.days == null ? '—' : Math.round(x.days * 10) / 10) }, { h: t('Returned', 'ফেরত'), r: true, hide: true, f: (x) => x.ret }], rows);
    box.innerHTML = `<div class="grid g4">${kcard({ label: t('Success rate', 'সাফল্যের হার'), value: pc(s.success), sub: t('delivered of finished parcels', 'শেষ হওয়া পার্সেলের মধ্যে ডেলিভারি') })}${kcard({ label: t('Average delivery', 'গড় ডেলিভারি'), value: days1(s.avgDays) })}${kcard({ label: t('Returned', 'ফেরত'), value: pc(s.returnPct), sub: t(`${s.returned} parcels`, `${s.returned}টি পার্সেল`) })}${kcard({ label: t('Attempts per parcel', 'প্রতি পার্সেলে চেষ্টা'), value: s.attempts == null ? '—' : (Math.round(s.attempts * 10) / 10) })}</div>
      <div class="grid g2" style="margin-top:14px">${U.card(t('By area', 'এলাকা অনুযায়ী'), tb(zr.map((x) => Object.assign(x, { lab: Z[x.k] || x.k })), t('Area', 'এলাকা')), { sub: t('Last 30 days', 'গত 30 দিন') })}${U.card(t('By district', 'জেলা অনুযায়ী'), tb(dr.map((x) => Object.assign(x, { lab: place(x.k) })), t('District', 'জেলা')), { sub: t('Top 8 by parcels', 'পার্সেল বেশি এমন 8টি') })}</div>
      <div style="height:14px"></div>${U.card(t('Stuck parcels', 'আটকে থাকা পার্সেল'), stuck.length ? U.table([{ h: t('Order', 'অর্ডার'), f: (o) => `<b>${esc(o.id)}</b><div class="muted small mono">${esc(o.tracking)}</div>` }, { h: t('Status', 'স্ট্যাটাস'), f: (o) => sbadge(o, true) }, { h: t('No movement', 'নড়েনি'), r: true, f: (o) => `<b style="color:var(--bad)">${Math.round(lastMoveH(o))} ${t('hours', 'ঘণ্টা')}</b>` }], stuck) : U.empty(t(`No parcel stuck for ${X().stuckH}+ hours ✓`, `কোনো পার্সেল ${X().stuckH}+ ঘণ্টা আটকে নেই ✓`)), { sub: t(`No movement for ${X().stuckH}+ hours (set in Setup)`, `${X().stuckH}+ ঘণ্টা না নড়লে (সেটআপে বদলানো যায়)`) })}
      <div style="height:14px"></div>${U.card(t(`${c.name} vs the others`, `${c.name} বনাম অন্যরা`), compareTable(S, L), { sub: t('Last 30 days. Green is best.', 'গত 30 দিন। সবুজ মানে সেরা।') })}`;
    wireTrack(box);
  }
  function secClaims(box, id) {
    const L = claimsOf(id);
    box.innerHTML = U.card(t('Claims', 'ক্লেইম'), `<div class="cr-row" style="justify-content:space-between;margin-bottom:10px"><span class="small">${t(`${L.filter(isOpenC).length} open, ${tk(toGet(L))} to get back`, `${L.filter(isOpenC).length}টি খোলা, ${tk(toGet(L))} ফেরত পাব`)}</span><span class="cr-row"><button class="btn sm primary" id="cr-nc">${A.icon('plus', 14)} ${t('New claim', 'নতুন ক্লেইম')}</button><a class="btn sm" href="${A.href('couriers', 'claims')}">${t('All claims & payouts', 'সব ক্লেইম ও পেআউট')} →</a></span></div>${claimTable(L, { noC: true })}`, { sub: t('The same list as in Claims & payouts', '“ক্লেইম ও পেআউট”-এর একই তালিকা') });
    box.querySelector('#cr-nc').onclick = () => newClaimModal(id); wireClaims(box);
  }
  const MSG = () => [['booking_note', t('Booking note', 'বুকিং নোট')], ['delivery_instruction', t('Delivery instruction', 'ডেলিভারি নির্দেশ')], ['cod_line', t('Cash amount line', 'ক্যাশ অ্যামাউন্ট লাইন')], ['reattempt', t('Ask to try again', 'আবার চেষ্টার অনুরোধ')], ['hold', t('Hold the parcel', 'পার্সেল হোল্ড')], ['cancel', t('Cancel the booking', 'বুকিং বাতিল')], ['return_pickup', t('Return pick-up', 'রিটার্ন পিকআপ')], ['claim', t('Claim message', 'ক্লেইমের মেসেজ')]];
  function secMsgs(box, id) {
    const c = cget(id); const o = A.D.orders.find((x) => x.courier === id && x.status === 'shipped') || A.D.orders.find((x) => x.courier === id);
    const ctx = o ? { order: o, o, courier: c.name, name: o.name, phone: o.phone, address: o.address, cod: o.payment === 'COD' ? o.total : 0, amount: o.total, tracking: o.tracking, consignment: o.tracking, id: o.id } : { courier: c.name };
    const get = (k) => { try { if (A.rulesApi && A.rulesApi.courierMsg) { const m = A.rulesApi.courierMsg(k, ctx); if (m && (m.en || m.bn)) return t(m.en || m.bn, m.bn || m.en); } } catch (e) {} return ''; };
    box.innerHTML = U.card(t('Messages we send this courier', 'এই কুরিয়ারকে আমরা যে মেসেজ পাঠাই'), `<div class="list">${MSG().map((m) => { const x = get(m[0]); return `<div class="li" style="align-items:flex-start;flex-wrap:wrap"><div class="grow" style="min-width:200px"><b>${m[1]}</b><div class="small ${x ? '' : 'muted'}" style="margin-top:3px;white-space:pre-wrap;overflow-wrap:anywhere">${x ? esc(x) : t('Not set yet', 'এখনো সেট করা হয়নি')}</div></div></div>`; }).join('')}</div>
      <div class="cr-row" style="margin-top:12px"><a class="btn sm" href="${A.href('rules', 'all')}">${t('Edit in Rules › Courier messages', 'নিয়ম › কুরিয়ার মেসেজে এডিট করুন')} →</a></div>`, { sub: o ? t(`Shown with parcel ${o.id} as the example`, `উদাহরণ হিসেবে পার্সেল ${o.id}`) : '' });
  }
  function secSetup(box, id) { box.innerHTML = `<div class="grid g2">${setupCard(id)}${U.card(t('Alerts', 'সতর্কতা'), `${U.field(t('Parcel stuck after (hours)', 'কত ঘণ্টা না নড়লে আটকে ধরা হবে'), U.input('cs-stuck', X().stuckH, 'type="number" min="6" max="240"'))}<button class="btn sm primary" id="cs-stuck-ok">${t('Save', 'সেভ')}</button>`, { sub: t('Applies to every courier', 'সব কুরিয়ারের জন্য') })}</div>`; wireSetup(box); const b = box.querySelector('#cs-stuck-ok'); if (b) b.onclick = () => { X().stuckH = Math.max(6, Math.round(+box.querySelector('#cs-stuck').value || 24)); A.commit('Stuck parcel alert hours'); A.toast(t('Saved', 'সেভ হয়েছে'), 'good'); A.render(); }; }

  /* ================= PAGE: Claims & payouts ================= */
  const cf = { st: 'all', c: 'all', q: '' };
  function renderClaims(el) {
    X(); sync(); const all = claimsAll();
    let L = all.filter((c) => (cf.st === 'all' || (cf.st === 'active' ? isOpenC(c) : cst(c) === cf.st)) && (cf.c === 'all' || c.courier === cf.c));
    const q = cf.q.trim().toLowerCase(); if (q) L = L.filter((c) => (c.id + ' ' + c.oid + ' ' + (c.note || '')).toLowerCase().includes(q));
    const rec = A.sum(all, (c) => c.recovered || 0), soon = all.filter((c) => isOpenC(c) && (new Date(c.deadline) - NOW()) / DAY <= 3);
    const FS = [['all', t('All', 'সব')], ['open', t('Open', 'খোলা')], ['sent', t('Sent', 'পাঠানো')], ['won', t('Won', 'আদায়')], ['lost', t('Lost', 'পাইনি')]];
    const P = pays(); const pend = P.filter((p) => p.status === 'requested' || p.status === 'processing');
    el.innerHTML = A.pageHead(t('Claims & payouts', 'ক্লেইম ও পেআউট'), t('Every claim against a courier and every payout request, in one place.', 'কুরিয়ারের বিরুদ্ধে সব ক্লেইম ও সব পেআউট রিকোয়েস্ট এক জায়গায়।'), `<button class="btn primary" id="cr-nc">${A.icon('plus', 15)} ${t('New claim', 'নতুন ক্লেইম')}</button>`) + A.tabsBar('couriers', 'claims') +
      `<div class="grid g4" style="margin-top:14px">${kcard({ label: t('Open claims', 'খোলা ক্লেইম'), value: all.filter(isOpenC).length, sub: tk(toGet(all)) + ' ' + t('to get back', 'ফেরত পাব') })}${kcard({ label: t('Money recovered', 'আদায় হয়েছে'), value: tk(rec) })}${kcard({ label: t('Ending in 3 days', '3 দিনে শেষ'), value: soon.length, sub: soon.length ? tk(toGet(soon)) : '' })}${kcard({ label: t('Payouts in progress', 'চলমান পেআউট'), value: pend.length, sub: tk(A.sum(pend, (p) => p.amount)) })}</div>
      <div style="height:14px"></div>${U.card(t('Claims ledger', 'ক্লেইমের খাতা'), `<div class="cr-row" style="margin-bottom:10px"><input class="inp" id="cf-q" type="search" style="max-width:240px" placeholder="${t('Search claim or order', 'ক্লেইম বা অর্ডার খুঁজুন')}" value="${esc(cf.q)}">${U.select('cf-c', [['all', t('All couriers', 'সব কুরিয়ার')]].concat(cs().map((c) => [c.id, c.name])), cf.c)}</div><div class="chips" id="cf-st" style="margin-bottom:10px">${FS.map((f) => `<button class="chip ${cf.st === f[0] ? 'on' : ''}" data-v="${f[0]}">${f[1]}</button>`).join('')}</div><div id="cf-tbl">${claimTable(L)}</div>`, { sub: t('Lost, damaged, short cash and more. Orders and Finance read this same list.', 'হারানো, ক্ষতিগ্রস্ত, ক্যাশ কম ইত্যাদি। Orders ও Finance এই একই তালিকা পড়ে।') })}
      <div style="height:14px"></div>${U.card(t('Payouts across couriers', 'সব কুরিয়ারের পেআউট'), `<div class="grid g3" style="margin-bottom:12px">${ordered().map((c) => { const e = eligible(c.id), pd = pending(c.id)[0]; return `<div class="card flat"><div class="cr-row" style="justify-content:space-between"><b>${esc(c.name)}</b>${pd ? pbadge(pd.status) : c.connected ? U.badge(t('Ready', 'তৈরি'), e.amount >= cfg(c.id).minPayout ? 'info' : '') : U.badge(t('Not connected', 'যুক্ত নেই'), 'bad')}</div><div class="small muted" style="margin:4px 0 8px">${pd ? t(`${tk(pd.amount)} requested ${A.fmt.ago(pd.requestedAt)}`, `${tk(pd.amount)} রিকোয়েস্ট ${A.fmt.ago(pd.requestedAt)}`) : t(`${tk(e.amount)} ready to request`, `${tk(e.amount)} রিকোয়েস্ট করা যায়`)}</div><div class="cr-row"><button class="btn sm primary" data-pay="${c.id}" ${c.connected && !pd && e.list.length && e.amount >= cfg(c.id).minPayout ? '' : 'disabled'}>${t('Request payout', 'পেআউট রিকোয়েস্ট')}</button><a class="btn sm ghost" href="${href360(c.id)}">360</a></div></div>`; }).join('')}</div><div class="cr-row" style="margin-bottom:8px"><button class="btn sm" id="cr-refresh">${A.icon('sync', 14)} ${t('Refresh status', 'স্ট্যাটাস রিফ্রেশ')}</button></div>${payTable(P.slice(0, 12), true)}`, { sub: t('Each courier pays through its own payment request', 'প্রতিটা কুরিয়ার নিজের পেমেন্ট রিকোয়েস্টে টাকা দেয়') })}`;
    el.querySelector('#cr-nc').onclick = () => newClaimModal(cf.c === 'all' ? '' : cf.c);
    const draw = () => { el.querySelector('#cf-tbl').innerHTML = claimTable(all.filter((c) => (cf.st === 'all' || cst(c) === cf.st) && (cf.c === 'all' || c.courier === cf.c) && (!cf.q.trim() || (c.id + ' ' + c.oid + ' ' + (c.note || '')).toLowerCase().includes(cf.q.trim().toLowerCase())))); wireClaims(el); };
    el.querySelector('#cf-q').oninput = (e) => { cf.q = e.target.value; draw(); };
    el.querySelector('#cf-c').onchange = (e) => { cf.c = e.target.value; A.render(); };
    A.on(el, '#cf-st [data-v]', 'click', (e, b) => { cf.st = b.dataset.v; A.render(); });
    wireClaims(el); wirePay(el);
  }

  /* ================= PAGE: Setup ================= */
  function renderSetup(el) {
    X(); const x = X(); const L = ordered();
    el.innerHTML = A.pageHead(t('Courier setup', 'কুরিয়ার সেটআপ'), t('Connection, pickup, rates and payout settings for each courier.', 'প্রতিটা কুরিয়ারের কানেকশন, পিকআপ, রেট ও পেআউট সেটিংস।'), `<a class="btn" href="${A.href('settings', 'keys')}">${t('Keys & connections', 'কি ও কানেকশন')} →</a>`) + A.tabsBar('couriers', 'setup') +
      `<div style="height:14px"></div><div class="grid g3">${L.map((c) => setupCard(c.id)).join('')}</div><div style="height:14px"></div>
      <div class="grid g2">${U.card(t('Alerts', 'সতর্কতা'), `${U.field(t('Parcel stuck after (hours)', 'কত ঘণ্টা না নড়লে আটকে ধরা হবে'), U.input('cs-stuck', x.stuckH, 'type="number" min="6" max="240"'))}<button class="btn sm primary" id="cs-stuck-ok">${t('Save', 'সেভ')}</button>`, { sub: t('Applies to every courier', 'সব কুরিয়ারের জন্য') })}
      ${U.card(t('Default courier', 'ডিফল্ট কুরিয়ার'), `<div class="cr-kv"><span>${t('New orders go to', 'নতুন অর্ডার যায়')}</span><span>${esc(cname(defId()))}</span><span>${t('Backup', 'ব্যাকআপ')}</span><span>${x.backup ? esc(cname(x.backup)) : '—'}</span></div><div class="muted small" style="margin-top:10px">${t('Change the default on All couriers (needs your PIN).', '“সব কুরিয়ার” পেজে ডিফল্ট বদলান (PIN লাগবে)।')}</div>`)}</div>`;
    wireSetup(el); el.querySelector('#cs-stuck-ok').onclick = () => { x.stuckH = Math.max(6, Math.round(+el.querySelector('#cs-stuck').value || 24)); A.commit('Stuck parcel alert hours'); A.toast(t('Saved', 'সেভ হয়েছে'), 'good'); A.render(); };
  }

  /* ================= PAGE: Finance > Couriers ================= */
  let fcur = '';
  function renderFinance(el) {
    X(); sync(); if (!cs().some((c) => c.id === fcur)) fcur = defId(); const id = fcur; const L = ordered(); const S = Object.fromEntries(L.map((c) => [c.id, stats(c.id)]));
    const heldAll = A.sum(L, (c) => S[c.id].held); const maxH = Math.max(1, ...L.map((c) => S[c.id].held)); const all = claimsAll();
    const timeline = pays().slice(0, 8);
    el.innerHTML = A.pageHead(t('Finance', 'হিসাব'), t('Cash couriers hold, payouts, statements and claims.', 'কুরিয়ারের কাছে ক্যাশ, পেআউট, স্টেটমেন্ট ও ক্লেইম।'), `<a class="btn" href="${href360(id)}">${t('Open Courier 360', 'Courier 360 খুলুন')}</a>`) + A.tabsBar('finance', 'couriers') + chipsFor(id, () => 'javascript:void(0)') +
      `<div class="grid g4">${kcard({ label: t('Cash with couriers', 'কুরিয়ারের কাছে ক্যাশ'), value: tk(heldAll), sub: t('all couriers, after charges', 'সব কুরিয়ার, চার্জ কেটে') })}${kcard({ label: cname(id) + ' · ' + t('holds', 'কাছে আছে'), value: tk(S[id].held), sub: t(`${S[id].heldN} parcels`, `${S[id].heldN}টি পার্সেল`) })}${kcard({ label: t('Claims to receive', 'ক্লেইমে পাব'), value: tk(toGet(all)), sub: t(`${all.filter(isOpenC).length} open`, `${all.filter(isOpenC).length}টি খোলা`) })}${kcard({ label: t('Recovered from claims', 'ক্লেইমে আদায়'), value: tk(A.sum(all, (c) => c.recovered || 0)) })}</div>
      <div class="grid g2" style="margin-top:14px">${U.card(t('Cash held per courier', 'কুরিয়ার অনুযায়ী ক্যাশ'), L.map((c) => `<div class="cr-bar"><span>${esc(c.name)}</span>${U.bar(S[c.id].held / maxH * 100, c.id === id ? 'var(--accent)' : 'var(--navy2)')}<b>${tk(S[c.id].held)}</b></div>`).join(''), { sub: t('Delivered cash not paid out yet', 'ডেলিভারি হয়েছে, ক্যাশ এখনো দেয়নি') })}
      ${U.card(t('Payouts timeline', 'পেআউটের টাইমলাইন'), `<div class="timeline cr-tl">${timeline.map((p) => `<div class="tl"><i class="${p.status === 'paid' ? 'good' : p.status === 'rejected' ? 'bad' : 'warn'}"></i><div><div><b>${esc(cname(p.courier))} · ${tk(p.amount)}</b> ${pbadge(p.status)}</div><div class="t">${p.paidAt ? t('Paid ', 'পেইড ') + dshort(p.paidAt) + ' · ' + esc(p.ref) : t('Requested ', 'রিকোয়েস্ট ') + A.fmt.dt(p.requestedAt)}</div></div></div>`).join('') || U.empty(t('No payouts yet', 'এখনো কোনো পেআউট নেই'))}</div>`, { sub: t('Request payouts in Courier 360 › Payouts', 'পেআউট রিকোয়েস্ট: Courier 360 › পেআউট') })}</div>
      <div style="height:14px"></div>${stmtCard(id)}<div style="height:14px"></div>${misCard('')}`;
    A.on(el, '.cr-chips .chip', 'click', (e, b) => { e.preventDefault(); fcur = b.dataset.c; A.render(); });
    const dl = el.querySelector('#cr-dl'); if (dl) dl.dataset.c = id; wireStmt(el);
  }

  /* ================= PAGE: Reports > Couriers ================= */
  let rr = '30d';
  function renderReports(el) {
    X(); const L = ordered(); const rg = C().range(rr); const S = Object.fromEntries(L.map((c) => [c.id, stats(c.id, rg.from, rg.to)]));
    const dist = A.groupBy(A.D.orders.filter((o) => o.courier && WITH.includes(o.status) && C().inRange(o.created, rg.from, rg.to)), (o) => o.district);
    const drows = Object.keys(dist).map((k) => ({ k, n: dist[k].length })).sort((a, b) => b.n - a.n).slice(0, 10);
    const cell = (k, cid) => { const L2 = dist[k].filter((o) => o.courier === cid); const dl = L2.filter(isDel).length, rt = L2.filter((o) => o.status === 'returned').length, f = dl + rt; return { n: L2.length, s: f ? dl / f * 100 : null }; };
    // weekly success trend, last 8 weeks
    const labels = [], series = L.map((c, i) => ({ name: c.name, color: 'var(--c' + (i + 1) + ')', values: [] })); const last = {};
    for (let w = 7; w >= 0; w--) {
      const to = NOW() - w * 7 * DAY, from = to - 7 * DAY; labels.push(A.fmt.date(from));
      L.forEach((c, i) => { const os = A.D.orders.filter((o) => o.courier === c.id && WITH.includes(o.status) && C().inRange(o.created, from, to)); const dl = os.filter(isDel).length, rt = os.filter((o) => o.status === 'returned').length; const v = dl + rt >= 3 ? dl / (dl + rt) * 100 : (last[c.id] != null ? last[c.id] : 90); last[c.id] = v; series[i].values.push(Math.round(v * 10) / 10); });
    }
    const rn = routing('2026-11'), ro = routing('2026-10');
    const RO = [['7d', t('7 days', '7 দিন')], ['30d', t('30 days', '30 দিন')], ['month', t('This month', 'এই মাস')], ['lastmonth', t('Last month', 'গত মাস')]];
    el.innerHTML = A.pageHead(t('Reports', 'রিপোর্ট'), t('How each courier performs and what it costs.', 'প্রতিটা কুরিয়ার কেমন করছে ও কত খরচ।'), `<button class="btn" id="cr-rdl">${A.icon('down', 15)} ${t('Download', 'ডাউনলোড')}</button>`) + A.tabsBar('reports', 'couriers') +
      `<div class="chips" id="cr-rr" style="margin:12px 0">${RO.map((o) => `<button class="chip ${rr === o[0] ? 'on' : ''}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>
      ${U.card(t('Courier comparison', 'কুরিয়ার তুলনা'), compareTable(S, L), { sub: t('Green is best in each column', 'প্রতি কলামে সবুজ মানে সেরা') })}
      <div class="grid g2" style="margin-top:14px">${U.card(t('Success rate, week by week', 'সাফল্যের হার, সপ্তাহ ধরে'), A.chart.line({ labels, series, money: false, height: 210 }), { sub: t('Delivered of finished parcels, %', 'শেষ হওয়া পার্সেলের মধ্যে ডেলিভারি, %') })}
      ${U.card(t('Cost per parcel', 'প্রতি পার্সেল খরচ'), A.chart.bars({ items: L.map((c, i) => ({ label: c.name, value: Math.round(S[c.id].perParcel || 0), text: S[c.id].perParcel == null ? '—' : tk(Math.round(S[c.id].perParcel)), color: 'var(--c' + (i + 1) + ')' })), money: true }), { sub: t('Delivery + cash fee + return charges', 'ডেলিভারি + ক্যাশ ফি + রিটার্ন চার্জ') })}</div>
      <div style="height:14px"></div>${U.card(t('By district', 'জেলা অনুযায়ী'), U.table([{ h: t('District', 'জেলা'), f: (r) => esc(place(r.k)) }, { h: t('Parcels', 'পার্সেল'), r: true, f: (r) => r.n }].concat(L.map((c) => ({ h: c.name, r: true, f: (r) => { const x = cell(r.k, c.id); const best = Math.max(...L.map((q) => (cell(r.k, q.id).s == null ? -1 : cell(r.k, q.id).s))); return x.n ? `<span class="${x.s != null && x.s === best && L.length > 1 ? 'cr-hl' : ''}">${pc(x.s)}</span><div class="muted small">${x.n}</div>` : '—'; } }))), drows), { sub: t('Success rate and parcels per courier', 'কুরিয়ার অনুযায়ী সাফল্যের হার ও পার্সেল') })}
      <div style="height:14px"></div>${U.card(t('Money we would save with per-area routing', 'এলাকা অনুযায়ী কুরিয়ার দিলে যত টাকা বাঁচত'), `<div class="grid g2" style="margin-bottom:12px">${kcard({ label: t('This month so far', 'এই মাসে এখন পর্যন্ত'), value: tk(rn.total) })}${kcard({ label: t('Last month', 'গত মাস'), value: tk(ro.total) })}</div>${U.table([{ h: t('Area', 'এলাকা'), f: (r) => r.label }, { h: t('Cheapest courier', 'সবচেয়ে সস্তা কুরিয়ার'), f: (r) => `${esc(r.best)} · ${tk(r.fee)}` }, { h: t('Parcels this month', 'এই মাসে পার্সেল'), r: true, f: (r) => r.n }, { h: t('Would save', 'বাঁচত'), r: true, f: (r) => `<b>${tk(r.save)}</b>` }], rn.rows)}<div class="muted small" style="margin-top:8px">${t('Only looks at the delivery charge. Success rate and speed matter too, so check the comparison above before changing.', 'শুধু ডেলিভারি চার্জ ধরা হয়েছে। সাফল্যের হার ও গতিও দরকার, তাই বদলানোর আগে উপরের তুলনা দেখুন।')}</div>`, { sub: t('If each area went with the cheapest connected courier', 'প্রতিটা এলাকা সবচেয়ে সস্তা যুক্ত কুরিয়ারে গেলে') })}`;
    A.on(el, '#cr-rr [data-v]', 'click', (e, b) => { rr = b.dataset.v; A.render(); });
    el.querySelector('#cr-rdl').onclick = () => U.download('courier-report-' + rr + '.xlsx');
  }

  /* ================= guides ================= */
  const G = {
    overview: { en: '<p><b>What:</b> one card for every courier you use, with parcels on the way, cash they hold, success rate and payout status.</p><p><b>Why:</b> e.g. Pathao holds ৳38,000 of your cash while Steadfast delivers faster to Chattogram. You see it at a glance and decide.</p><p><b>How:</b> 1) Read “What needs you” first. 2) Open Courier 360 for the full story of one courier. 3) Use “Make default” to change where new orders go (PIN needed). 4) Compare couriers in the table below.</p>', bn: '<p><b>কী:</b> আপনার প্রতিটা কুরিয়ারের একটা কার্ড: রাস্তায় কত পার্সেল, তাদের কাছে কত ক্যাশ, সাফল্যের হার ও পেআউটের অবস্থা।</p><p><b>কেন:</b> যেমন Pathao-র কাছে ৳38,000 ক্যাশ আছে, আর চট্টগ্রামে Steadfast দ্রুত দেয়। এক নজরে দেখে সিদ্ধান্ত নিতে পারবেন।</p><p><b>কীভাবে:</b> 1) আগে “যা দেখা দরকার” পড়ুন। 2) একটা কুরিয়ারের পুরো খবর দেখতে Courier 360 খুলুন। 3) নতুন অর্ডার কোথায় যাবে বদলাতে “ডিফল্ট করুন” চাপুন (PIN লাগবে)। 4) নিচের টেবিলে কুরিয়ার তুলনা করুন।</p>' },
    c360: { en: '<p><b>What:</b> everything about one courier: parcels with live status, money, payouts, performance, claims, the messages we send them and setup.</p><p><b>Why:</b> when Steadfast says “payment in 3 days”, you can check parcels, ask for the payout and raise a claim without leaving this page.</p><p><b>How:</b> 1) The default courier opens first. Use the chips on top to switch. 2) Pick a section: Overview, Parcels, Money, Payouts, Performance, Claims, Messages, Setup. 3) Click any parcel to see its full tracking. 4) In Payouts press “Request payout”. The status (Requested, Processing, Paid) comes back by itself.</p>', bn: '<p><b>কী:</b> একটা কুরিয়ারের সবকিছু: লাইভ স্ট্যাটাসসহ পার্সেল, টাকা, পেআউট, পারফরম্যান্স, ক্লেইম, তাদের পাঠানো মেসেজ ও সেটআপ।</p><p><b>কেন:</b> Steadfast যখন বলে “3 দিনে পেমেন্ট”, তখন এই পেজ থেকেই পার্সেল দেখে, পেআউট চেয়ে, ক্লেইম করতে পারবেন।</p><p><b>কীভাবে:</b> 1) ডিফল্ট কুরিয়ার আগে খোলে। উপরের চিপ দিয়ে বদলান। 2) একটা অংশ বাছুন: ওভারভিউ, পার্সেল, টাকা, পেআউট, পারফরম্যান্স, ক্লেইম, মেসেজ, সেটআপ। 3) যেকোনো পার্সেলে ক্লিক করলে পুরো ট্র্যাকিং দেখা যাবে। 4) পেআউটে “পেআউট রিকোয়েস্ট করুন” চাপুন। স্ট্যাটাস (রিকোয়েস্ট, প্রসেসিং, পেইড) নিজে থেকেই আপডেট হবে।</p>' },
    claims: { en: '<p><b>What:</b> one ledger of every claim against a courier (lost, damaged, short cash, rider overcharge) plus the payout requests of all couriers.</p><p><b>Why:</b> a lost parcel worth ৳1,150 has 10 days to claim. Here you see the deadline and the money you get back.</p><p><b>How:</b> 1) “New claim” and pick the parcel. 2) Press “Mark sent” after you send it. 3) When the courier pays press “Won” and type the amount (PIN). If it refuses, press “Lost”. 4) Below, request a payout from any courier.</p>', bn: '<p><b>কী:</b> কুরিয়ারের বিরুদ্ধে সব ক্লেইমের একটা খাতা (হারানো, ক্ষতিগ্রস্ত, ক্যাশ কম, রাইডারের বাড়তি টাকা) এবং সব কুরিয়ারের পেআউট রিকোয়েস্ট।</p><p><b>কেন:</b> ৳1,150 দামের হারানো পার্সেলের ক্লেইম করতে 10 দিন সময়। এখানে শেষ সময় ও ফেরত পাওয়া টাকা দেখা যায়।</p><p><b>কীভাবে:</b> 1) “নতুন ক্লেইম” চাপুন, পার্সেল বাছুন। 2) পাঠানোর পর “পাঠানো হয়েছে” চাপুন। 3) কুরিয়ার টাকা দিলে “আদায়” চাপুন ও টাকা লিখুন (PIN)। না দিলে “পাইনি” চাপুন। 4) নিচে যেকোনো কুরিয়ার থেকে পেআউট রিকোয়েস্ট করুন।</p>' },
    setup: { en: '<p><b>What:</b> connection status, pickup, rate card and payout settings for each courier.</p><p><b>Why:</b> a wrong rate or a dead connection means parcels are booked at the wrong price or not at all.</p><p><b>How:</b> 1) “Test connection” checks the courier answers. 2) Set the smallest payout and how many days the courier takes to pay. 3) Tick “Use as backup courier” for one courier. 4) Rates are edited in Settings.</p>', bn: '<p><b>কী:</b> প্রতিটা কুরিয়ারের কানেকশনের অবস্থা, পিকআপ, রেট কার্ড ও পেআউট সেটিংস।</p><p><b>কেন:</b> রেট ভুল বা কানেকশন বন্ধ থাকলে পার্সেল ভুল দামে বুক হয় বা হয়ই না।</p><p><b>কীভাবে:</b> 1) “কানেকশন টেস্ট” চাপলে কুরিয়ার উত্তর দেয় কিনা দেখা যায়। 2) সর্বনিম্ন পেআউট ও কুরিয়ার কত দিনে টাকা দেয় ঠিক করুন। 3) একটা কুরিয়ারে “ব্যাকআপ কুরিয়ার হিসেবে রাখুন” টিক দিন। 4) রেট সেটিংসে এডিট হয়।</p>' },
    finance: { en: '<p><b>What:</b> the money side of couriers: cash they hold, payouts, the monthly statement and lines that do not match.</p><p><b>Why:</b> e.g. Pathao charged ৳20 extra on 6 parcels. Claim it in one click so the money comes back.</p><p><b>How:</b> 1) The default courier is first. Switch with the chips. 2) Check “Cash held per courier”. 3) Pick the month and press “Download statement”. 4) On a mismatch line press “Claim”. It goes to Claims & payouts.</p>', bn: '<p><b>কী:</b> কুরিয়ারের টাকার দিক: তাদের কাছে থাকা ক্যাশ, পেআউট, মাসের স্টেটমেন্ট ও যে লাইন মিলছে না।</p><p><b>কেন:</b> যেমন Pathao 6টি পার্সেলে ৳20 করে বেশি কেটেছে। এক ক্লিকে ক্লেইম করলে টাকা ফেরত আসবে।</p><p><b>কীভাবে:</b> 1) ডিফল্ট কুরিয়ার আগে থাকে। চিপ দিয়ে বদলান। 2) “কুরিয়ার অনুযায়ী ক্যাশ” দেখুন। 3) মাস বেছে “স্টেটমেন্ট ডাউনলোড” চাপুন। 4) না-মেলা লাইনে “ক্লেইম” চাপুন। এটা ক্লেইম ও পেআউটে যাবে।</p>' },
    reports: { en: '<p><b>What:</b> courier comparison, success by district, week-by-week trend, cost per parcel and the money you would save by routing each area to the cheapest courier.</p><p><b>Why:</b> if Steadfast is ৳10 cheaper in the suburbs you can move those parcels.</p><p><b>How:</b> 1) Pick the period on top. 2) Green numbers are best in the column. 3) Read the saving line at the bottom. 4) Press “Download” for a file.</p>', bn: '<p><b>কী:</b> কুরিয়ার তুলনা, জেলা অনুযায়ী সাফল্য, সপ্তাহের ট্রেন্ড, প্রতি পার্সেল খরচ এবং প্রতিটা এলাকা সবচেয়ে সস্তা কুরিয়ারে দিলে কত টাকা বাঁচত।</p><p><b>কেন:</b> শহরতলিতে Steadfast ৳10 সস্তা হলে ওই পার্সেল সেখানে দিতে পারবেন।</p><p><b>কীভাবে:</b> 1) উপরে সময় বাছুন। 2) সবুজ সংখ্যা মানে কলামে সেরা। 3) নিচের সাশ্রয়ের লাইন পড়ুন। 4) ফাইলের জন্য “ডাউনলোড” চাপুন।</p>' },
  };
  A.mod('couriers', {
    overview: { render: renderOverview, guide: G.overview },
    c360: { render: renderC360, guide: G.c360 },
    claims: { render: renderClaims, guide: G.claims },
    setup: { render: renderSetup, guide: G.setup },
  });
  A.mod('finance', { couriers: { render: renderFinance, guide: G.finance } });
  A.mod('reports', { couriers: { render: renderReports, guide: G.reports } });

  A.couriersApi = {
    status: (o) => { try { return status(o); } catch (e) { return null; } },
    history: (o) => { try { return history(o); } catch (e) { return []; } },
    openTrack: (o) => openTrack(o),
    href: (id) => href360(id),
    owed: (id) => { X(); return owed(id); },
    payouts: () => { X(); sync(); return A.D.courierPay; },
  };
})();
