/* =====================================================================
   97m-adm2-data.js — NEW EXTAS ADMIN (phase 1) · data layer
   Follows docs/BACKEND-ARCHITECTURE.md (CN-022): §6.5.0 four separate status
   dimensions (order · courier · payment · return/refund), §10.2 one metric
   definition per figure (Sales = delivered only, D3).
   One store: the demo's own ST.orders, ST.accounts, the CRM (zr_all), the
   courier book (ZK_COURIERS / zk_st), expenses (zy_st) and the settings
   registry (zs_S / ft). The new admin only ADDS fields:
     o.a2   = {ost, ship, cour, cid, pay[], risk{}, ret{}, refunds[], ev[] …}
     ST.a2  = new-admin state (role, notifications, approvals, payouts,
              journey, templates, campaigns, risk rules, settings …)
   Sample orders are added once (ST.a2Demo), like ao_ensureDemo(); "Reset all
   demo data" brings them back. Sample data never ships (PR 509).
   ===================================================================== */
var A2 = A2 || {};
A2.H = 3600000; A2.D = 86400000;

/* ---------- language ---------- */
function a2bn(){ return typeof ST !== 'undefined' && ST && ST.adminLang === 'bn'; }
function L(en, bn){ return a2bn() && bn != null ? bn : en; }
function Le(en, bn){ return esc(L(en, bn)); }

/* ---------- numbers and dates (taka with lakh grouping, Western digits, Asia/Dhaka) ---------- */
function a2tk(n, opt){
  n = Math.round(Number(n) || 0); var neg = n < 0; n = Math.abs(n);
  var s = String(n), out = s;
  if(s.length > 3){ var last = s.slice(-3), rest = s.slice(0, -3), parts = []; while(rest.length > 2){ parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); } if(rest) parts.unshift(rest); out = parts.concat([last]).join(','); }
  return (neg ? '−' : '') + '৳' + out;
}
function a2tkS(n){ n = Number(n) || 0; var a = Math.abs(n); if(a >= 100000) return '৳' + (n / 100000).toFixed(a >= 1000000 ? 1 : 2).replace(/\.?0+$/, '') + ' ' + L('lakh', 'লাখ'); if(a >= 10000) return '৳' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'; return a2tk(n); }
function a2pct(x, d){ if(x == null || !isFinite(x)) return '—'; return (x * 100).toFixed(d == null ? 1 : d) + '%'; }
function a2n(n){ return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function a2ago(ts){ if(!ts) return '—'; var d = Date.now() - ts, m = Math.round(d / 60000); if(m < 1) return L('just now', 'এইমাত্র'); if(m < 60) return m + L(' min', ' মিনিট'); var h = Math.floor(m / 60); if(h < 24) return h + L(' h ', ' ঘ ') + (m % 60 ? (m % 60) + L(' min', ' মি') : '').trim(); var dd = Math.floor(h / 24); return dd + L(dd === 1 ? ' day' : ' days', ' দিন'); }
function a2date(ts){ return ts ? new Date(ts).toLocaleDateString('en-GB', {day:'numeric', month:'short'}) : '—'; }
function a2dt(ts){ return ts ? a2date(ts) + ', ' + new Date(ts).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'}) : '—'; }
function a2hm(ts){ return new Date(ts).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}); }
function a2day0(ts){ var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function a2dk(ts){ var d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function a2mk(ts){ var d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function a2mname(k){ var p = k.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('en-GB', {month:'long', year:'numeric'}); }
function a2r(k){ return typeof zs_rnd === 'function' ? zs_rnd('a2·' + k) : 0.5; }
function a2ri(k, a, b){ return a + Math.floor(a2r(k) * (b - a + 1)); }
function a2ph(p){ var d = String(p || '').replace(/\D/g, ''); return d.length === 11 ? d.slice(0, 5) + '-' + d.slice(5) : String(p || ''); }

/* ---------- the new-admin store (inside ST, saved with it) ---------- */
function a2S(){
  if(!ST.a2) ST.a2 = {};
  var s = ST.a2;
  ['ntf', 'appr', 'payouts', 'camps', 'segs', 'bulk', 'views', 'log', 'imports'].forEach(function(k){ if(!s[k]) s[k] = []; });
  ['set', 'months', 'tpl', 'ad', 'pal', 'cards'].forEach(function(k){ if(!s[k]) s[k] = {}; });
  if(!s.role) s.role = 'owner';
  if(!s.journey) s.journey = a2JourneyDefault();
  if(!s.risk) s.risk = a2RiskDefault();
  return s;
}
/* every setting has a default here; screens read a2Set(key) and never hard-code a value */
var A2_SET_DEF = {
  'orders.selfConfirm':false, 'orders.callAttempts':3, 'orders.newCustomerCheck':true, 'orders.cancelCutoff':'confirmed', 'orders.editWindowMin':60,
  'orders.editCap':2, 'orders.numberFormat':'EX-{n}', 'orders.prepaidAutoConfirm':true, 'orders.twoSizeFollowUp':true, 'orders.dupLayers':true,
  'orders.packPhoto':false, 'orders.swap':false, 'orders.bulkOn':false, 'orders.bulkMin':'', 'orders.bulkLogo':'', 'orders.bulkAdvance':'',
  'orders.stickerSize':'100 × 150 mm', 'orders.invoiceDesign':3, 'orders.pickSort':'category', 'orders.holdReasons':'Customer asked to wait · Waiting for stock · Address unclear · Payment check',
  'orders.cancelReasons':'Changed mind · Found cheaper · Ordered by mistake · Delivery too slow · Other',
  'delivery.bookAfterPack':true, 'delivery.stuckHours':48, 'delivery.trial':false, 'delivery.suggest':'cost', 'delivery.holidayNote':'',
  'customers.maskPhone':false, 'customers.retentionDays':180, 'customers.smsPreTick':true, 'customers.waPreTick':false,
  'money.vat':false, 'money.adAlloc':true, 'money.refundLimit':'', 'money.pack':15, 'money.usd':121,
  'messages.master':true, 'messages.capSms':2, 'messages.capWa':1, 'messages.capTotal':3, 'messages.quietFrom':'22:00', 'messages.quietTo':'08:00',
  'messages.campCap':'1 per 7 days', 'messages.campCostConfirm':'', 'messages.sender':'EXTAS',
  'dash.telegram':false, 'dash.telegramAt':'21:00', 'dash.contribWho':'owner'
};
function a2Set(k){ var s = a2S().set; return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : A2_SET_DEF[k]; }
function a2SetV(k, v){ a2S().set[k] = v; a2Log('Setting “' + k + '” → ' + (typeof v === 'boolean' ? (v ? 'on' : 'off') : v)); saveState(); }
function a2SetReset(keys){ var s = a2S().set; keys.forEach(function(k){ delete s[k]; }); saveState(); }
function a2Log(what, ref){ var s = a2S(); s.log.unshift({at:Date.now(), who:a2Who(), role:a2S().role, what:what, ref:ref || ''}); s.log = s.log.slice(0, 300); }
function a2Who(){ var r = A2_ROLES[a2S().role] || A2_ROLES.owner; return r.person; }

/* ---------- roles (BACKEND-ARCHITECTURE §5.1 default roles, §19.5 start pages) ---------- */
var A2_ROLES = {
  owner:{en:'Owner', bn:'মালিক', sub:'Super admin', person:'Mehadi Hasan', ini:'MH', start:'/admin', keys:'*'},
  manager:{en:'Manager', bn:'ম্যানেজার', sub:'Manager', person:'Shakil Ahmed', ini:'SA', start:'/admin',
    keys:'*', deny:['settings.team', 'settings.keys', 'settings.system', 'build.read', 'money.refunds.approve', 'dash.contribution', 'risk.block.confirm', 'customers.privacy', 'money.close']},
  packer:{en:'Packer', bn:'প্যাকার', sub:'Packing & store', person:'Sumon Mia', ini:'SM', start:'/admin/orders/packing',
    keys:['dashboard.read', 'orders.packing', 'returns.qc', 'products.read', 'help.read']},
  support:{en:'Support agent', bn:'সাপোর্ট', sub:'Support & chats', person:'Nadia Islam', ini:'NI', start:'/admin/support',
    keys:['dashboard.read', 'support.read', 'customers.read', 'customers.notes', 'orders.read', 'orders.notes', 'orders.create', 'messages.log', 'money.refunds.request', 'risk.codOff.propose', 'help.read']},
  accounts:{en:'Accounts', bn:'হিসাব', sub:'Accounts', person:'Rafiq Ahmed', ini:'RA', start:'/admin/money',
    keys:['dashboard.read', 'money.read', 'money.cod', 'money.payments', 'money.refunds.execute', 'money.expenses', 'money.close', 'money.costs', 'payments.record', 'reports.read', 'orders.read', 'delivery.returned', 'help.read']}
};
/* plain names for the permission keys (shown on the "no access" page) */
var A2_PERM_NAME = {
  'dashboard.read':['See the dashboard', 'ড্যাশবোর্ড দেখা'], 'orders.read':['See orders', 'অর্ডার দেখা'], 'orders.confirm':['Confirm orders', 'অর্ডার কনফার্ম'],
  'orders.risk':['Review risky orders', 'ঝুঁকির অর্ডার দেখা'], 'risk.rules':['Change risk rules', 'ঝুঁকির নিয়ম বদলানো'], 'orders.packing':['Pack and print', 'প্যাক আর প্রিন্ট'],
  'orders.returns':['Handle returns and exchanges', 'ফেরত আর বদল'], 'returns.qc':['Receive and check returns', 'ফেরত মাল চেক'], 'orders.create':['Create orders', 'অর্ডার বানানো'],
  'orders.settings':['Change order settings', 'অর্ডারের সেটিং'], 'orders.bulk':['Bulk & corporate enquiries', 'বাল্ক আর কর্পোরেট'],
  'delivery.read':['See delivery', 'ডেলিভারি দেখা'], 'delivery.book':['Book couriers', 'কুরিয়ার বুক'], 'delivery.returned':['See returned parcels', 'ফেরত পার্সেল দেখা'],
  'delivery.couriers':['Manage couriers', 'কুরিয়ার'], 'delivery.charges':['Change delivery charges', 'ডেলিভারি চার্জ বদলানো'],
  'customers.read':['See customers', 'কাস্টমার দেখা'], 'customers.segments':['Edit segments', 'সেগমেন্ট'], 'customers.loyalty':['Loyalty and wallet', 'লয়্যালটি আর ওয়ালেট'],
  'customers.merge':['Merge customers', 'কাস্টমার একসাথে করা'], 'customers.import':['Import customers', 'কাস্টমার ইমপোর্ট'], 'customers.privacy':['Consent and data', 'সম্মতি আর ডেটা'],
  'money.read':['See money', 'টাকার হিসাব দেখা'], 'money.cod':['Reconcile COD', 'COD মেলানো'], 'money.payments':['Payments and refunds', 'পেমেন্ট আর রিফান্ড'],
  'money.expenses':['Expenses and salaries', 'খরচ আর বেতন'], 'money.close':['Month-end close', 'মাস শেষের হিসাব'], 'money.costs':['Costs and fees', 'খরচ আর ফি'],
  'money.refunds.approve':['Approve refunds', 'রিফান্ড অনুমোদন'], 'messages.journey':['Edit the order journey', 'অর্ডারের মেসেজ'], 'messages.campaigns':['Run campaigns', 'ক্যাম্পেইন'],
  'messages.templates':['Edit message templates', 'মেসেজের লেখা'], 'messages.log':['See the message log', 'মেসেজ লগ'], 'messages.channels':['Channels and limits', 'চ্যানেল আর সীমা']
};
function a2Role(){ return A2_ROLES[a2S().role] || A2_ROLES.owner; }
function a2Can(key){
  if(!key) return true; if(Array.isArray(key)) return key.some(a2Can); var r = a2Role();
  if(r.deny && r.deny.indexOf(key) >= 0) return false;
  if(r.keys === '*') return true;
  if(r.keys.indexOf(key) >= 0) return true;
  /* a section read key is held when any key of that section is held */
  if(/\.read$/.test(key)){ var p = key.replace(/\.read$/, '.'); return r.keys.some(function(k){ return k.indexOf(p) === 0; }); }
  return false;
}
function a2CanAny(keys){ return (keys || []).some(a2Can); }

/* ---------- couriers (the demo's own courier book) ---------- */
function a2Couriers(){ return (typeof zk_list === 'function' ? zk_list() : []).filter(function(c){ return c.on; }); }
function a2Cour(id){ return (typeof zk_c === 'function' && id) ? zk_c(id) : null; }
function a2CourName(id){ var c = a2Cour(id); return c ? c.name : (id || '—'); }
function a2Band(z){ return typeof zoneEff === 'function' ? zoneEff(z || 'out') : (z || 'out'); }
function a2BandName(z){ var b = a2Band(z); return b === 'in' ? L('Dhaka city', 'ঢাকা সিটি') : b === 'sub' ? L('Near Dhaka', 'ঢাকার আশেপাশে') : L('Outside Dhaka', 'ঢাকার বাইরে'); }
function a2Rate(cid, zone){ var c = a2Cour(cid); return c ? c.rates[a2Band(zone)] || 0 : 0; }

/* ---------- order adapter: four separate dimensions ---------- */
var A2_OST = {
  PLACED:['New · to confirm', 'নতুন · কনফার্ম বাকি', 'warn'], AWAITING_ADVANCE:['Waiting for advance', 'অগ্রিমের অপেক্ষা', 'warn'], CONFIRMED:['Confirmed', 'কনফার্ম', 'info'],
  ON_HOLD:['On hold', 'হোল্ডে', 'mute'], PROCESSING:['Picking', 'পিকিং', 'info'], PACKED:['Packed', 'প্যাক হয়েছে', 'info'], HANDED_OVER:['Handed over', 'কুরিয়ারে দেওয়া', 'g'],
  IN_TRANSIT:['In transit', 'পথে', 'g'], DELIVERED:['Delivered', 'ডেলিভারি হয়েছে', 'ok'], PARTIALLY_DELIVERED:['Partly delivered', 'আংশিক ডেলিভারি', 'ok'],
  RETURNED:['Returned', 'ফেরত', 'bad'], CANCELLED:['Cancelled', 'বাতিল', 'mute']
};
var A2_SHIP = {
  NONE:['Not booked', 'বুক হয়নি', 'line'], BOOKING:['Booking…', 'বুক হচ্ছে', 'info'], BOOKING_FAILED:['Booking failed', 'বুকিং হয়নি', 'bad'], IN_REVIEW:['Courier review', 'কুরিয়ার দেখছে', 'info'],
  PENDING_PICKUP:['Booked · pickup due', 'বুক · পিকআপ বাকি', 'info'], PICKED_UP:['Picked up', 'কুরিয়ার নিয়েছে', 'g'], IN_TRANSIT:['In transit', 'পথে', 'g'],
  OUT_FOR_DELIVERY:['Out for delivery', 'ডেলিভারিতে বের হয়েছে', 'g'], ATTEMPT_FAILED:['Attempt failed', 'ডেলিভারি চেষ্টা ব্যর্থ', 'bad'], ADDRESS_PROBLEM:['Address problem', 'ঠিকানার সমস্যা', 'bad'],
  DELIVERED:['Delivered', 'পৌঁছেছে', 'ok'], PARTIALLY_DELIVERED:['Partly delivered', 'আংশিক', 'ok'], RETURNING:['Coming back', 'ফেরত আসছে', 'warn'], RETURNED:['Back at shop', 'দোকানে ফেরত', 'warn'],
  LOST:['Lost', 'হারিয়েছে', 'bad'], DAMAGED:['Damaged', 'নষ্ট', 'bad'], CANCEL_REQUESTED:['Cancel requested', 'বাতিলের অনুরোধ', 'warn'], CANCELLED:['Cancelled', 'বাতিল', 'mute']
};
var A2_PAY = {
  UNPAID:['Unpaid', 'টাকা আসেনি', 'line'], PARTLY_PAID:['Partly paid', 'আংশিক পেমেন্ট', 'info'], PAID:['Paid', 'পেমেন্ট হয়েছে', 'ok'], OWED_BACK:['Owed back', 'ফেরত দিতে হবে', 'bad'],
  COD_TO_COLLECT:['COD to collect', 'COD বাকি', 'warn'], COD_COLLECTED:['COD collected', 'COD নেওয়া হয়েছে', 'info'], COD_SETTLED:['COD settled', 'COD বুঝে পাওয়া', 'ok']
};
var A2_RET = {
  REQUESTED:['Return requested', 'ফেরতের অনুরোধ', 'warn'], APPROVED:['Return approved', 'ফেরত অনুমোদিত', 'info'], EXPECTED:['Return on the way', 'ফেরত আসছে', 'warn'],
  RECEIVED:['Return received · QC due', 'ফেরত এসেছে · চেক বাকি', 'warn'], QC_DONE:['QC done', 'চেক হয়েছে', 'info'], CLOSED:['Return closed', 'ফেরত শেষ', 'mute'],
  REFUSED:['Return refused', 'ফেরত নেওয়া হয়নি', 'mute'], REFUND_REQUESTED:['Refund requested', 'রিফান্ডের অনুরোধ', 'warn'], REFUND_APPROVED:['Refund approved · unpaid', 'রিফান্ড অনুমোদিত · বাকি', 'bad'],
  REFUND_DONE:['Refunded', 'রিফান্ড হয়েছে', 'ok']
};
var A2_OLD = {PLACED:'confirmed', AWAITING_ADVANCE:'confirmed', CONFIRMED:'confirmed', ON_HOLD:'confirmed', PROCESSING:'packed', PACKED:'packed', HANDED_OVER:'shipped', IN_TRANSIT:'shipped',
  DELIVERED:'delivered', PARTIALLY_DELIVERED:'delivered', RETURNED:'returned', CANCELLED:'cancelled'};
var A2_RANK = ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED'];
function a2Goods(o){ return Math.max(0, (o.subtotal || 0) - (o.discount || 0)); }
function a2Units(o){ return (o.lines || []).reduce(function(s, l){ return s + (l.qty || 1); }, 0); }
/* the a2 block of an order; derived from the classic status when missing or when the classic admin moved the order */
function a2O(o){
  if(!o) return {};
  var a = o.a2;
  if(!a || A2_OLD[a.ost] !== o.status){
    var prev = a || {};
    a = o.a2 = Object.assign({pay:[], ev:[], refunds:[], notes:[], calls:[]}, prev);
    var map = {confirmed:(o.payment !== 'cod' && o.payment ? 'CONFIRMED' : 'PLACED'), packed:'PACKED', shipped:'IN_TRANSIT', delivered:'DELIVERED', returned:'RETURNED', cancelled:'CANCELLED'};
    a.ost = map[o.status] || 'PLACED';
    var cp = typeof zk_parcelOf === 'function' ? zk_parcelOf(o.id) : null;
    if(!a.ship || a.ship === 'NONE'){
      if(cp){ a.cour = cp.courier; a.cid = cp.cid; a.ship = {booked:'PENDING_PICKUP', picked:'PICKED_UP', transit:'IN_TRANSIT', delivered:'DELIVERED', refused:'RETURNING', returned:'RETURNED', restocked:'RETURNED'}[cp.st] || 'PENDING_PICKUP'; }
      else if(o.status === 'shipped'){ a.ship = 'IN_TRANSIT'; }
      else if(o.status === 'delivered'){ a.ship = 'DELIVERED'; }
      else if(o.status === 'returned'){ a.ship = 'RETURNED'; }
      else a.ship = 'NONE';
      if(!a.cour && a.ship !== 'NONE') a.cour = String(o.courier || '').toLowerCase() || 'steadfast';
      if(!a.cid && a.ship !== 'NONE') a.cid = o.tracking || '';
    }
    if(!a.pay.length && o.payment && o.payment !== 'cod') a.pay.push({id:'PY-' + o.id.replace(/\D/g, ''), method:o.payment, purpose:'ORDER', amount:o.total, status:'PAID', at:o.createdAt, ref:'TX' + (zs_hash ? zs_hash(o.id) % 9000000 : 1)});
    if(!a.risk) a.risk = {score:12, band:'low', rules:[]};
    if(!a.ret && o.exchanges && o.exchanges.length){
      var x = o.exchanges[0];
      a.ret = {id:'RT-' + o.id.replace(/\D/g, ''), type:x.reason === 'problem' ? 'fault' : 'size', stage:x.status === 'requested' ? 'requested' : 'approved', status:'REQUESTED', at:x.at || Date.now(), items:[{line:x.lineIdx || 0, from:x.from, to:x.size}], ev:[]};
    }
  }
  return a;
}
function a2Sync(o){ var a = o.a2 || a2O(o); var old = A2_OLD[a.ost]; if(old && o.status !== old){ o.status = old; o.timeline = o.timeline || []; if(['packed', 'shipped', 'delivered'].indexOf(old) >= 0) o.timeline.push({s:old, at:Date.now()}); if(old === 'delivered' && !o.deliveredAt) o.deliveredAt = Date.now(); } }
function a2Ev(o, text, tone, who){ var a = a2O(o); a.ev.push({at:Date.now(), t:text, k:tone || '', who:who || a2Who()}); }
function a2Paid(o){ return (a2O(o).pay || []).filter(function(p){ return p.status === 'PAID'; }).reduce(function(s, p){ return s + (p.amount || 0); }, 0); }
function a2Due(o){ return Math.max(0, (o.total || 0) - a2Paid(o)); }
function a2Settled(o){ var s = a2S(); for(var i = 0; i < s.payouts.length; i++){ var L0 = s.payouts[i].lines; for(var j = 0; j < L0.length; j++) if(L0[j].order === o.id) return {payout:s.payouts[i], line:L0[j]}; } return null; }
function a2PayState(o){
  var a = a2O(o), paid = a2Paid(o);
  if((a.refunds || []).some(function(r){ return r.status === 'APPROVED' || r.status === 'REQUESTED' || r.status === 'FAILED'; })) return 'OWED_BACK';
  if(o.payment === 'cod'){
    if(a.ost === 'DELIVERED' || a.ost === 'PARTIALLY_DELIVERED'){ return a2Settled(o) ? 'COD_SETTLED' : 'COD_COLLECTED'; }
    if(a.ost === 'CANCELLED' || a.ost === 'RETURNED') return paid ? 'PARTLY_PAID' : 'UNPAID';
    return paid ? 'PARTLY_PAID' : 'COD_TO_COLLECT';
  }
  return paid >= (o.total || 0) ? 'PAID' : paid ? 'PARTLY_PAID' : 'UNPAID';
}
function a2RetState(o){
  var a = a2O(o), rf = (a.refunds || [])[0];
  if(a.ret){
    if(a.ret.stage === 'refused') return 'REFUSED';
    if(a.ret.stage === 'requested') return 'REQUESTED';
    if(a.ret.stage === 'approved' && a.ret.status === 'REQUESTED') return 'APPROVED';
    return a.ret.status || 'EXPECTED';
  }
  if(rf) return rf.status === 'COMPLETED' ? 'REFUND_DONE' : rf.status === 'APPROVED' ? 'REFUND_APPROVED' : 'REFUND_REQUESTED';
  return null;
}
function a2Pill(map, code, extra, ic, tip){ var d = map[code]; if(!d) return ''; return '<span class="a2-pill ' + d[2] + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + (ic && typeof a2i === 'function' ? a2i(ic, 12, 2) : '') + esc(L(d[0], d[1])) + (extra ? ' · ' + esc(extra) : '') + '</span>'; }
var A2_PAYM = {cod:'COD', bkash:'bKash', nagad:'Nagad', card:'Card', bank:'Bank', cash:'Cash'};
function a2PayM(m){ return A2_PAYM[m] || m; }
/* the four status chips, always separate (§6.5.0) */
function a2Chips(o, opt){
  var a = a2O(o), r = a2RetState(o), ps = a2PayState(o), set = a2Settled(o);
  var h = '<span class="a2-st4">' + a2Pill(A2_OST, a.ost);
  if(a.cancelPending) h += '<span class="a2-pill warn">' + Le('Cancel pending courier', 'কুরিয়ারের বাতিল-নিশ্চয়তা বাকি') + '</span>';
  if(!opt || !opt.noShip) h += a2Pill(A2_SHIP, a.ship || 'NONE', '', 'truck', L('Courier status', 'কুরিয়ারের অবস্থা'));
  h += a2Pill(A2_PAY, ps, ps === 'COD_SETTLED' && set ? a2RecvLabel(set.payout.recv) : '', 'wallet', L('Payment status', 'পেমেন্টের অবস্থা'));
  if(r) h += a2Pill(A2_RET, r, '', 'uturn', L('Return / refund status', 'ফেরত / রিফান্ডের অবস্থা'));
  return h + '</span>';
}
function a2RecvLabel(k){ return k === 'BANK' ? L('received as bank', 'ব্যাংকে এসেছে') : k === 'BKASH' ? L('received as bKash', 'বিকাশে এসেছে') : k === 'CASH_AT_COURIER_OFFICE' ? L('received as cash at courier office', 'কুরিয়ার অফিসে ক্যাশ') : ''; }
function a2Orders(){ a2Seed(); return Object.keys(ST.orders || {}).map(function(k){ var o = ST.orders[k]; a2O(o); return o; }).sort(function(a, b){ return (b.createdAt || 0) - (a.createdAt || 0); }); }
function a2Order(id){ a2Seed(); var o = ST.orders[id]; if(o) a2O(o); return o || null; }
function a2Booked(o){ var s = a2O(o).ship; return s && s !== 'NONE' && s !== 'BOOKING_FAILED' && s !== 'CANCELLED'; }
function a2Open(o){ var s = a2O(o).ost; return ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED'].indexOf(s) < 0; }
function a2PhoneOrders(phone){ var p = String(phone || '').replace(/\D/g, ''); return a2Orders().filter(function(o){ return String(o.phone || '').replace(/\D/g, '') === p; }); }
/* per-phone history (CN-021 P12): our orders + legacy orders imported into the CRM */
function a2PhoneHist(phone, skipId){
  var p = String(phone || '').replace(/\D/g, ''), h = {orders:0, delivered:0, refused:0, ourFault:0, chargeOnly:0, cancelled:0, noAnswer:0, open:0, spend:0, last:0};
  a2PhoneOrders(p).forEach(function(o){
    if(o.id === skipId) return; var a = a2O(o); h.orders++;
    if(a.ost === 'DELIVERED' || a.ost === 'PARTIALLY_DELIVERED'){ h.delivered++; h.spend += a2Goods(o); }
    else if(a.ost === 'RETURNED'){ if(a.ourFault) h.ourFault++; else h.refused++; if(a.chargePaid) h.chargeOnly++; }
    else if(a.ost === 'CANCELLED') h.cancelled++; else h.open++;
    h.noAnswer += (a.calls || []).filter(function(c){ return c.r === 'no-answer'; }).length;
    h.last = Math.max(h.last, o.createdAt || 0);
  });
  if(typeof zr_import === 'function') zr_import().forEach(function(c){ if(String(c.phone).replace(/\D/g, '') !== p) return; c.orders.forEach(function(x){ h.orders++; if(x.status === 'refused') h.refused++; else { h.delivered++; h.spend += x.total || 0; } h.last = Math.max(h.last, x.at || 0); }); });
  return h;
}
function a2HistLine(h){ return h.orders ? L(h.orders + (h.orders === 1 ? ' order · ' : ' orders · ') + h.delivered + ' delivered · ' + h.refused + ' refused' + (h.ourFault ? ' (+' + h.ourFault + ' our fault, not counted)' : '') + ' · ' + h.cancelled + ' cancelled · ' + h.noAnswer + ' no answer',
  h.orders + 'টা অর্ডার · ' + h.delivered + 'টা ডেলিভারি · ' + h.refused + 'টা ফেরত · ' + h.cancelled + 'টা বাতিল · ' + h.noAnswer + ' বার ফোন ধরেনি') : L('First order from this number', 'এই নম্বরে প্রথম অর্ডার'); }

/* ---------- cost (ERP cost snapshot; missing cost is never 0 — §10.2 M9) ---------- */
var A2_NO_COST = ['linen-blend-shirt', 'textured-knit-polo'];
function a2Cost(pid, size){ if(A2_NO_COST.indexOf(pid) >= 0 && !(typeof zy_st === 'function' && zy_st().cost[pid] != null)) return null; return typeof zy_cost === 'function' ? zy_cost(pid, size) : Math.round(((P(pid) || {}).price || 0) * .46); }

/* ---------- the ONE metric function (§10.2). Every KPI on every screen reads it. ---------- */
A2.mc = {};
function a2M(days, offsetDays){
  days = days || 30; offsetDays = offsetDays || 0;
  var key = days + '/' + offsetDays; if(A2.mc[key]) return A2.mc[key];
  var now = Date.now(), end = a2day0(now) + A2.D - offsetDays * A2.D, start = end - days * A2.D;
  var inR = function(t){ return t && t >= start && t < end; };
  var m = {days:days, start:start, end:end, sales:0, salesN:0, ordered:0, ordersN:0, cancelled:0, cancelledAfterBooking:0, delN:0, partN:0, rtoN:0, lostN:0,
    returnsN:0, returnsV:0, refundsGoods:0, refundsOther:0, cogs:0, cogsMissing:0, cogsLines:0, cogsCovered:0, delivCollected:0, courier:0, payFees:0, pack:0, msg:0,
    retLoss:0, goodwill:0, ad:0, adMissing:0, exp:0, codPending:0, codInTransit:0, unsettled:0, byCour:{}, byProd:{}, byDay:{}, byCat:{}, bySrc:{}, owed:0, rtoCost:0, dhakaDays:[], outDays:[]};
  var pack = +a2Set('money.pack') || 0, rto = typeof ft === 'function' ? ft('rtoBook') : {courier:110, packaging:35, staff:40};
  a2Orders().forEach(function(o){
    var a = a2O(o), goods = a2Goods(o);
    if(inR(o.createdAt)){ m.ordered += goods; m.ordersN++; if(a.ost === 'CANCELLED'){ m.cancelled++; if(a.cancelAfterBooking) m.cancelledAfterBooking++; } (m.bySrc[o.source || 'website'] = m.bySrc[o.source || 'website'] || {n:0, v:0}).n++; }
    var out = a.outAt || o.deliveredAt;
    var final = ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED'].indexOf(a.ost) >= 0 || a.ship === 'LOST';
    if(final && inR(out) && a.cour){
      var c = m.byCour[a.cour] = m.byCour[a.cour] || {den:0, ok:0, rto:0};
      c.den++;
      if(a.ost === 'DELIVERED' || a.ost === 'PARTIALLY_DELIVERED') c.ok++; else c.rto++;
    }
    if((a.ost === 'DELIVERED' || a.ost === 'PARTIALLY_DELIVERED') && inR(o.deliveredAt)){
      var kept = a.ost === 'PARTIALLY_DELIVERED' ? (a.keptShare || .5) : 1, v = Math.round(goods * kept);
      m.sales += v; m.salesN++; if(a.ost === 'PARTIALLY_DELIVERED') m.partN++; else m.delN++;
      var dk = a2dk(o.deliveredAt); m.byDay[dk] = (m.byDay[dk] || 0) + v;
      (o.lines || []).forEach(function(l){
        var lv = Math.round((l.unitPrice || 0) * (l.qty || 1) * (goods / Math.max(1, o.subtotal || goods)) * kept), cost = a2Cost(l.product, l.size);
        m.cogsLines++; if(cost == null){ m.cogsMissing += lv; } else { m.cogs += cost * (l.qty || 1) * kept; m.cogsCovered++; }
        var bp = m.byProd[l.product] = m.byProd[l.product] || {n:0, v:0}; bp.n += (l.qty || 1); bp.v += lv;
        var pp = P(l.product), cat = pp ? pp.cat : 'other'; var bc = m.byCat[cat] = m.byCat[cat] || {n:0, v:0, cost:0}; bc.n += l.qty || 1; bc.v += lv; bc.cost += cost == null ? 0 : cost * (l.qty || 1);
      });
      if(o.delivery) m.delivCollected += o.delivery;
      m.pack += pack;
      if(o.payment === 'cod' && !a2Settled(o)) m.unsettled++;
      var dd = (o.deliveredAt - o.createdAt) / A2.D; (a2Band(o.zone) === 'in' ? m.dhakaDays : m.outDays).push(dd);
    }
    if(final && inR(out)){ m.courier += a.charge || a2Rate(a.cour, o.zone); if(o.payment === 'cod' && a.ost !== 'RETURNED') m.courier += Math.round(goods * .01); }
    if(a.ost === 'RETURNED' && inR(out)){ m.rtoN++; m.pack += pack; m.rtoCost += (a.retFee || (a2Cour(a.cour) || {}).ret || rto.courier) + a2Rate(a.cour, o.zone) + pack + (+rto.staff || 0) - (a.chargePaid ? o.delivery || 0 : 0); }
    if(a.ship === 'LOST' && inR(out)) m.lostN++;
    (a.pay || []).forEach(function(p){ if(p.status === 'PAID' && p.method !== 'cod' && inR(p.at)) m.payFees += Math.round(p.amount * (typeof zy_gwRate === 'function' ? zy_gwRate(p.method) : 1.85) / 100); });
    (a.refunds || []).forEach(function(r){
      if(r.status === 'COMPLETED' && inR(r.doneAt)){ if(r.source === 'return' || r.source === 'exchange') m.refundsGoods += r.amount; else if(r.source !== 'cancel') m.refundsOther += r.amount; }
      if(r.status === 'APPROVED' || r.status === 'REQUESTED' || r.status === 'FAILED') m.owed += r.amount;
    });
    if(a.ret && a.ret.items) a.ret.items.forEach(function(it){
      if(it.disp === 'UNSELLABLE' && inR(it.at)){ var l = o.lines[it.line] || {}; var cst = a2Cost(l.product, l.size); m.retLoss += cst == null ? 0 : cst; }
      if(it.at && inR(it.at) && a.ret.type !== 'refused'){ m.returnsN++; var l2 = o.lines[it.line] || {}; m.returnsV += l2.unitPrice || 0; }
    });
    (o.notif || []).forEach(function(n){ if(inR(n.at) && /^sent/.test(n.st || '')) m.msg += n.ch === 'SMS' ? .35 : n.ch === 'WhatsApp' ? .8 : 0; });
    if(o.payment === 'cod' && (a.ost === 'DELIVERED' || a.ost === 'PARTIALLY_DELIVERED') && !a2Settled(o)) m.codInTransit += a2Due(o) || goods + (o.delivery || 0);
    if(o.payment === 'cod' && a2Open(o) && a2Booked(o)) m.codPending += a2Due(o);
  });
  /* ads: imported per day; a day not imported is "missing", never 0 */
  for(var t = start; t < end; t += A2.D){ var k = a2dk(t), v = a2S().ad[k]; if(t > now) break; if(v == null) m.adMissing++; else m.ad += v; }
  /* month-end expenses of the period: the expense book + salaries for the period's days only */
  if(typeof zy_st === 'function'){ var z = zy_st(); z.exp.forEach(function(e){ var ts = new Date(e.date + 'T12:00:00').getTime(); if(inR(ts)) m.exp += +e.amt || 0; }); z.emp.forEach(function(e){ if(e.active) m.exp += Math.round((+e.salary || 0) * days / 30); }); }
  m.goodwill = m.refundsOther;
  m.netSales = m.sales - m.refundsGoods;
  m.cogs = Math.round(m.cogs);
  m.coverage = m.cogsLines ? m.cogsCovered / m.cogsLines : 1;
  m.gross = m.netSales - m.cogsMissing - m.cogs;   /* lines without an ERP cost are left out of gross profit, never costed at 0 */
  m.contribution = Math.round(m.gross + m.delivCollected - m.courier - m.payFees - m.pack - m.msg - m.retLoss - m.goodwill);
  m.net = Math.round(m.contribution - m.ad - m.exp);
  m.aov = m.salesN ? m.sales / m.salesN : 0;
  m.den = m.delN + m.partN + m.rtoN + m.lostN;
  m.success = m.den ? (m.delN + m.partN) / m.den : null;
  m.rtoRate = m.den ? m.rtoN / m.den : null;
  Object.keys(m.byCour).forEach(function(k){ var c = m.byCour[k]; c.rate = c.den ? c.ok / c.den : null; });
  var avg = function(a){ return a.length ? a.reduce(function(s, x){ return s + x; }, 0) / a.length : null; };
  m.dhakaAvg = avg(m.dhakaDays); m.outAvg = avg(m.outDays);
  /* status: a total takes the weakest status of its parts (§10.1) */
  m.salesStatus = m.unsettled ? 'provisional' : 'reconciled';
  m.contribStatus = m.coverage < 1 || m.unsettled ? 'estimated' : 'provisional';
  m.netStatus = 'provisional';
  m.margin = m.netSales ? m.net / m.netSales : null;
  A2.mc[key] = m; return m;
}
/* daily series for charts: delivered sales (by delivered mark) and ordered value (by placed time) — never mixed */
function a2Series(days){
  var key = 'series' + days; if(A2.mc[key]) return A2.mc[key];
  var end = a2day0(Date.now()) + A2.D, start = end - days * A2.D, sales = [], ordered = [], labels = [];
  var idx = {}; for(var i = 0; i < days; i++){ var t = start + i * A2.D; idx[a2dk(t)] = i; sales.push(0); ordered.push(0); labels.push(a2date(t)); }
  a2Orders().forEach(function(o){
    var a = a2O(o), g = a2Goods(o);
    if(o.createdAt >= start && o.createdAt < end){ var k = idx[a2dk(o.createdAt)]; if(k != null) ordered[k] += g; }
    if((a.ost === 'DELIVERED' || a.ost === 'PARTIALLY_DELIVERED') && o.deliveredAt >= start && o.deliveredAt < end){ var k2 = idx[a2dk(o.deliveredAt)]; if(k2 != null) sales[k2] += Math.round(g * (a.ost === 'PARTIALLY_DELIVERED' ? (a.keptShare || .5) : 1)); }
  });
  return (A2.mc[key] = {sales:sales, ordered:ordered, labels:labels});
}
function a2Trend(cur, prev){ if(prev == null || !isFinite(prev) || prev === 0) return null; return (cur - prev) / Math.abs(prev); }

/* ---------- needs-you-now queues (one list for the dashboard, badges and the drawer) ---------- */
function a2Queues(){
  if(A2.mc.queues) return A2.mc.queues;
  var os = a2Orders(), q = [], now = Date.now();
  var SG = {orders:'order', requests:'request', addresses:'address', parcels:'parcel', returns:'return', pushes:'push', approvals:'approval', mismatches:'mismatch', refunds:'refund', messages:'message', sizes:'size'};
  var add = function(id, n, oldest, t, tb, sub, subBn, tone, icon, href, perm, sec){ if(n === 1) t = t.replace(/\b(orders|requests|addresses|parcels|returns|pushes|approvals|mismatches|refunds|messages|sizes)\b/, function(w){ return SG[w]; }); if(n > 0 && a2Can(perm)) q.push({id:id, n:n, oldest:oldest, t:t, tb:tb, sub:sub, subBn:subBn, tone:tone, icon:icon, href:href, sec:sec}); };
  var f = function(fn){ return os.filter(fn); };
  var oldest = function(list){ return list.reduce(function(m, o){ return Math.min(m, o.createdAt || now); }, now); };
  var toConf = f(function(o){ var a = a2O(o); return a.ost === 'PLACED' && !(a.risk && a.risk.review) && !a.cancelReq; });
  var risky = f(function(o){ var a = a2O(o); return a.risk && a.risk.review && !a.risk.decided && a2Open(o); });
  var adv = f(function(o){ return a2O(o).ost === 'AWAITING_ADVANCE'; });
  var cancelReq = f(function(o){ return a2O(o).cancelReq && a2O(o).ost !== 'CANCELLED'; });
  var voice = f(function(o){ return a2O(o).voice && a2O(o).ost === 'PLACED'; });
  var toBook = a2ReadyToBook().ready;
  var stuck = f(function(o){ var a = a2O(o); return (a.ship === 'IN_TRANSIT' || a.ship === 'PICKED_UP') && a.lastMove && now - a.lastMove > a2Set('delivery.stuckHours') * A2.H; });
  var exc = f(function(o){ var a = a2O(o); return a.ship === 'ATTEMPT_FAILED' || a.ship === 'ADDRESS_PROBLEM' || a.ship === 'LOST' || a.ship === 'DAMAGED'; });
  var rets = f(function(o){ var a = a2O(o); return a.ret && (a.ret.stage === 'requested' || a.ret.status === 'RECEIVED'); });
  var cancelPend = f(function(o){ return a2O(o).cancelPending; });
  var erpRet = f(function(o){ var a = a2O(o); return a.ret && (a.ret.items || []).some(function(i){ return i.erp === 'pending'; }); });
  var erpFail = f(function(o){ var a = a2O(o); return a.erpFail || (a.ret && (a.ret.items || []).some(function(i){ return i.erp === 'failed'; })); });
  var lowStock = 0; try{ DB.products.slice(0, 26).forEach(function(p){ p.colors.forEach(function(c){ p.sizes.forEach(function(s){ var n = stockOf(p.id, c, s); if(n > 0 && n <= 2) lowStock++; }); }); }); }catch(e){}
  var appr = a2S().appr.filter(function(x){ return x.st === 'waiting'; });
  var mism = a2CodMismatches();
  var failedMsg = 0; os.forEach(function(o){ (o.notif || []).forEach(function(n){ if(n.st === 'failed' && !n.retried) failedMsg++; }); });
  var owedRf = f(function(o){ return (a2O(o).refunds || []).some(function(r){ return r.status === 'APPROVED'; }); });
  var lastM = a2mk(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15).getTime()), mst = a2S().months[lastM] || {};
  add('urgent', 1, now - 52 * 60000, 'Urgent customer problem', 'জরুরি সমস্যা', 'Payment page slow on 3G · 23 visitors hit it', 'পেমেন্ট পেজ 3G-তে ধীর · 23 জন ভিজিটর', 'bad', 'alert', '/admin-classic/health', 'dashboard.read', 'Site health');
  add('confirm', toConf.length, oldest(toConf), toConf.length + ' orders to confirm', toConf.length + 'টা অর্ডার কনফার্ম বাকি', 'Oldest waiting ' + a2ago(oldest(toConf)), 'সবচেয়ে পুরনোটা ' + a2ago(oldest(toConf)), 'warn', 'bag', '/admin/orders/confirm', 'orders.confirm', 'Orders');
  add('risk', risky.length, oldest(risky), risky.length + ' risky orders to review', risky.length + 'টা ঝুঁকির অর্ডার', a2RiskSummary(risky), a2RiskSummary(risky, true), 'warn', 'shield', '/admin/orders/risk', 'orders.risk', 'Risk review');
  add('advance', adv.length, oldest(adv), adv.length + ' waiting for advance', adv.length + 'টা অগ্রিমের অপেক্ষায়', 'Payment link sent; cancels by itself only per your rule', 'পেমেন্ট লিংক পাঠানো হয়েছে', 'mute', 'wallet', '/admin/orders?view=advance', 'orders.read', 'Orders');
  add('cancelreq', cancelReq.length, oldest(cancelReq), cancelReq.length + ' cancel requests', cancelReq.length + 'টা বাতিলের অনুরোধ', 'Customer asked before booking', 'বুকিংয়ের আগে কাস্টমার চেয়েছে', 'warn', 'uturn', '/admin/orders/confirm?chip=cancel', 'orders.confirm', 'Orders');
  add('voice', voice.length, oldest(voice), voice.length + ' voice addresses to call', voice.length + 'টা ভয়েস ঠিকানা — কল করুন', 'Low-confidence address from the mic', 'মাইকে বলা ঠিকানা পরিষ্কার না', 'mute', 'phone', '/admin/orders/confirm?chip=voice', 'orders.confirm', 'Orders');
  var toPack = f(function(o){ var a = a2O(o); return a.ost === 'CONFIRMED' || a.ost === 'PROCESSING'; }), toQc = f(function(o){ var a = a2O(o); return a.ret && (a.ret.status === 'RECEIVED' || a.ret.status === 'EXPECTED'); });
  if(!a2Can('orders.confirm')){ add('pack', toPack.length, oldest(toPack), toPack.length + ' orders to pick and pack', toPack.length + 'টা অর্ডার প্যাক বাকি', 'Scan each item, then mark packed', 'প্রতিটা পণ্য স্ক্যান করে প্যাক', 'info', 'box', '/admin/orders/packing', 'orders.packing', 'Packing'); add('qc', toQc.length, oldest(toQc), toQc.length + ' returned parcels to check', toQc.length + 'টা ফেরত পার্সেল চেক বাকি', 'Sellable or not — stock rises only when the ERP confirms', 'বিক্রি করা যাবে কিনা দেখুন', 'warn', 'scan', '/admin/orders/returns/qc', 'returns.qc', 'Returns'); }
  add('book', toBook.length, oldest(toBook), toBook.length + ' parcels ready to book', toBook.length + 'টা পার্সেল বুক করা বাকি', a2SuggestLine(toBook), a2SuggestLine(toBook), 'info', 'truck', '/admin/delivery/book', 'delivery.book', 'Delivery');
  add('cancelpend', cancelPend.length, oldest(cancelPend), cancelPend.length + ' cancel waiting for courier confirmation', cancelPend.length + 'টা বাতিল — কুরিয়ারের নিশ্চয়তা বাকি', 'Phone the courier, then record the answer', 'কুরিয়ারকে ফোন করে উত্তর লিখুন', 'bad', 'uturn', '/admin/orders?view=cancelpend', 'orders.read', 'Orders');
  add('stuck', stuck.length + exc.length, now - 60 * A2.H, (stuck.length + exc.length) + ' stuck or problem parcels', (stuck.length + exc.length) + 'টা আটকে থাকা বা সমস্যার পার্সেল', stuck.length + ' no movement · ' + exc.length + ' exceptions', stuck.length + 'টা নড়ছে না · ' + exc.length + 'টা সমস্যা', 'bad', 'clock', '/admin/delivery/transit?chip=exceptions', 'delivery.read', 'Delivery');
  add('returns', rets.length, oldest(rets), rets.length + ' exchange and return requests', rets.length + 'টা বদল আর ফেরতের অনুরোধ', 'Window from the courier’s delivered mark', 'সময় গোনা হয় ডেলিভারির সময় থেকে', 'mute', 'uturn', '/admin/orders/returns', 'orders.returns', 'Returns');
  add('erpret', erpRet.length, now - 5 * A2.H, erpRet.length + ' returns waiting for ERP confirmation', erpRet.length + 'টা ফেরত — ERP-এর নিশ্চয়তা বাকি', 'Stock rises only when the ERP confirms', 'ERP নিশ্চিত করলে তবেই স্টক বাড়ে', 'mute', 'box', '/admin/orders/returns?stage=done', 'orders.returns', 'Returns');
  add('erpfail', erpFail.length, now - 9 * A2.H, erpFail.length + ' ERP pushes failed', erpFail.length + 'টা ERP-তে পাঠানো যায়নি', 'Plain reason and Send again on each', 'কারণ দেখে আবার পাঠান', 'bad', 'alert', '/admin/orders/returns?stage=done', 'orders.read', 'ERP');
  add('appr', appr.length, now - 3 * A2.H, appr.length + ' approvals waiting', appr.length + 'টা অনুমোদন বাকি', appr.map(function(x){ return x.kindEn; }).join(' · '), appr.map(function(x){ return x.kindBn || x.kindEn; }).join(' · '), 'warn', 'check', '/admin/customers/review?tab=approvals', 'dashboard.read', 'Approvals');
  add('cod', mism.length, now - 4 * A2.D, mism.length + ' COD mismatches', mism.length + 'টা COD গরমিল', 'Courier paid less than expected', 'কুরিয়ার কম টাকা দিয়েছে', 'bad', 'wallet', '/admin/money/cod?view=mismatch', 'money.cod', 'Money');
  add('refund', owedRf.length, now - 26 * A2.H, owedRf.length + ' approved refunds to pay', owedRf.length + 'টা রিফান্ড দেওয়া বাকি', 'Money owed to customers', 'কাস্টমারের পাওনা টাকা', 'warn', 'wallet', '/admin/money/payments?tab=refunds', 'money.payments', 'Money');
  add('msgs', failedMsg, now - 7 * A2.H, failedMsg + ' failed messages', failedMsg + 'টা মেসেজ যায়নি', 'Fix the number, then retry', 'নম্বর ঠিক করে আবার পাঠান', 'mute', 'msg', '/admin/messages/log?view=failed', 'messages.log', 'Messages');
  add('low', lowStock, now - 2 * A2.D, lowStock + ' low-stock sizes', lowStock + 'টা সাইজে স্টক কম', '2 or fewer left (from the ERP)', '২টা বা কম বাকি (ERP থেকে)', 'mute', 'box', '/admin/products', 'products.read', 'Products');
  if(new Date().getDate() >= 1 && mst.st !== 'pushed') add('month', 1, now - 22 * A2.D, a2mname(lastM) + ' not pushed to the ERP', a2mname(lastM) + ' ERP-তে যায়নি', 'Month-end close is waiting', 'মাস শেষের হিসাব বাকি', 'warn', 'file', '/admin/money/close', 'money.close', 'Money');
  A2.mc.queues = q; return q;
}
function a2RiskSummary(list, bn){ var d = list.filter(function(o){ return a2O(o).risk.section === 'duplicate'; }).length, h = list.filter(function(o){ return a2O(o).risk.band === 'high'; }).length; return bn ? d + 'টা ডুপ্লিকেট · ' + h + 'টা বেশি ঝুঁকি' : d + (d === 1 ? ' duplicate' : ' duplicates') + ' · ' + h + ' high risk'; }
function a2SuggestLine(list){ var c = {}; list.forEach(function(o){ var s = a2Suggest(o); if(s) c[s.name] = (c[s.name] || 0) + 1; }); return L('Suggested: ', 'প্রস্তাব: ') + Object.keys(c).map(function(k){ return k + ' ' + c[k]; }).join(' · '); }
function a2Suggest(o){ var b = a2Band(o.zone), best = null; a2Couriers().forEach(function(c){ var sc = c.rates[b] - (a2M(30).byCour[c.id] && a2M(30).byCour[c.id].rate ? a2M(30).byCour[c.id].rate * 40 : 0); if(!best || sc < best.sc) best = {id:c.id, name:c.name, cost:c.rates[b], sc:sc}; }); return best; }
/* who can be booked now, and who is skipped and why (F-002, F-014, D5) */
function a2ReadyToBook(){
  var ready = [], skipped = [], packFirst = a2Set('delivery.bookAfterPack');
  a2Orders().forEach(function(o){
    var a = a2O(o); if(a2Booked(o) || !a2Open(o) || a.ost === 'HANDED_OVER' || a.ost === 'IN_TRANSIT') return;
    var why = null;
    if(a.ost === 'ON_HOLD') why = L('on hold', 'হোল্ডে');
    else if(a.ost === 'AWAITING_ADVANCE') why = L('waiting for advance', 'অগ্রিম বাকি');
    else if(a.risk && a.risk.review && !a.risk.decided) why = L('in risk review', 'ঝুঁকি যাচাইয়ে');
    else if(a.replacesId && a2O(ST.orders[a.replacesId] || {}).cancelPending) why = L('waiting for the old parcel to be cancelled', 'পুরনো পার্সেল বাতিল হওয়ার অপেক্ষা');
    else if(a.ost === 'PLACED') why = L('not confirmed yet', 'এখনো কনফার্ম হয়নি');
    else if(packFirst && a.ost !== 'PACKED') why = L('not packed yet', 'এখনো প্যাক হয়নি');
    if(why) skipped.push({o:o, why:why}); else ready.push(o);
  });
  return {ready:ready, skipped:skipped};
}
function a2CodMismatches(){ var out = []; a2S().payouts.forEach(function(p){ p.lines.forEach(function(l){ if(l.st === 'MISMATCH' && !l.resolved) out.push({p:p, l:l}); }); }); return out; }

/* ---------- default journey, risk rules ---------- */
function a2JourneyDefault(){
  return {steps:{
    placed:{on:true, ch:'SMS', fb:'None', when:'now', who:'all'}, selfconfirm:{on:false, ch:'WhatsApp', fb:'SMS', when:'now', who:'cod'},
    confirmed:{on:true, ch:'SMS', fb:'None', when:'now', who:'all'}, packed:{on:true, ch:'WhatsApp', fb:'SMS', when:'now', who:'all'},
    booked:{on:false, ch:'SMS', fb:'None', when:'now', who:'all'}, out:{on:false, ch:'SMS', fb:'None', when:'08:30', who:'all'},
    delivered:{on:false, ch:'SMS', fb:'None', when:'now', who:'all'}, day1:{on:true, ch:'WhatsApp', fb:'None', when:'11:00', who:'all'}, day3:{on:true, ch:'WhatsApp', fb:'None', when:'11:00', who:'all'},
    cancelled:{on:true, ch:'SMS', fb:'None', when:'now', who:'all'}, advreq:{on:true, ch:'WhatsApp', fb:'SMS', when:'now', who:'all'}, advlate:{on:true, ch:'SMS', fb:'None', when:'after 12 h', who:'all'},
    refundok:{on:true, ch:'SMS', fb:'None', when:'now', who:'all'}, refundpaid:{on:true, ch:'SMS', fb:'None', when:'now', who:'all'}, exchange:{on:true, ch:'WhatsApp', fb:'SMS', when:'now', who:'all'},
    gift:{on:true, ch:'SMS', fb:'None', when:'now', who:'gift-receiver'}
  }, published:Date.now() - 6 * A2.D, ver:4};
}
function a2RiskDefault(){
  return {ver:7, published:Date.now() - 9 * A2.D, rules:[
    {id:'refusals', en:'Refused parcels before (not our fault)', bn:'আগে পার্সেল ফেরত দিয়েছে', w:30, on:true, hits:9, fp:.11},
    {id:'dup', en:'Same phone ordered in the last 24 h', bn:'২৪ ঘণ্টায় একই ফোনে আবার অর্ডার', w:25, on:true, hits:14, fp:.29},
    {id:'transit', en:'Re-order while a parcel is in transit', bn:'পার্সেল পথে থাকতেই আবার অর্ডার', w:20, on:true, hits:6, fp:.17},
    {id:'newid', en:'New phone + shared device or address', bn:'নতুন ফোন, কিন্তু ডিভাইস বা ঠিকানা মেলে', w:20, on:true, hits:5, fp:.4},
    {id:'value', en:'High order value for a first order', bn:'প্রথম অর্ডারেই বেশি টাকা', w:15, on:true, hits:11, fp:.45},
    {id:'noanswer', en:'Did not answer calls on earlier orders', bn:'আগে ফোন ধরেনি', w:15, on:true, hits:7, fp:.14},
    {id:'address', en:'Address could not be resolved', bn:'ঠিকানা মেলানো যায়নি', w:10, on:true, hits:12, fp:.5},
    {id:'blocked', en:'Matches a blocked number or address', bn:'ব্লক করা নম্বর বা ঠিকানার সাথে মেলে', w:60, on:true, hits:1, fp:0},
    {id:'courierfraud', en:'Courier fraud check (shared data)', bn:'কুরিয়ারের ফ্রড ডেটা', w:20, on:false, hits:0, fp:null}
  ], levels:{soft:{min:35, en:'Soft — delivery-charge advance', bn:'সফট — ডেলিভারি চার্জ অগ্রিম'}, hard:{min:65, en:'Hard — full advance', bn:'হার্ড — পুরো টাকা অগ্রিম'}, partial:{on:false, pct:'', en:'Partial — part of the price', bn:'আংশিক — দামের একটা অংশ'}},
  layers:{on:false, soft:true, hard:true}, protect:{good:true, weekly:true, learn:false, report:true}, block:[{id:'b1', what:'01700-000999', reason:'Three refusals, abusive to the rider', by:'Mehadi Hasan', at:Date.now() - 40 * A2.D}], draft:false};
}
