/* =====================================================================
   97n-adm2-seed.js — NEW EXTAS ADMIN · sample data (demo only, PR 509)
   Added ONCE into the demo's own stores (ST.orders, zy_st().exp), never a
   copy: the classic admin, the CRM and the courier pages see the same orders.
   Deterministic (no Math.random) so screenshots repeat.
   ===================================================================== */
var A2_PEOPLE = [
  ['Rashed Karim', 'House 22, Road 7, Sector 4, Uttara, Dhaka', 'in'], ['Nusrat Jahan', 'Flat 3C, Lake Circus, Kalabagan, Dhaka', 'in'], ['Farhan Ahmed', 'Mirpur 11, Block C, Dhaka', 'in'],
  ['Imran Hossain', 'College Road, Savar, Dhaka', 'sub'], ['Sadia Islam', 'GEC Circle, Chattogram', 'out'], ['Rafiqul Islam', 'Zindabazar, Sylhet', 'out'], ['Tahmid Chowdhury', 'Road 27, Dhanmondi, Dhaka', 'in'],
  ['Jannatul Ferdous', 'Tongi Station Road, Gazipur', 'sub'], ['Mehedi Hasan', 'Shaheb Bazar, Rajshahi', 'out'], ['Anika Rahman', 'Bashundhara R/A, Block D, Dhaka', 'in'], ['Sajib Mia', 'Fatullah, Narayanganj', 'sub'],
  ['Kamrul Hasan', 'Sonadanga, Khulna', 'out'], ['Shanta Akter', 'Mohammadpur, Dhaka', 'in'], ['Rubel Sheikh', 'Kandirpar, Cumilla', 'out'], ['Tanjim Alam', 'Gulshan 1, Dhaka', 'in'], ['Mitu Begum', 'Ashulia, Savar', 'sub'],
  ['Habib Ullah', 'Station Road, Rangpur', 'out'], ['Sumaiya Khan', 'Banasree, Rampura, Dhaka', 'in'], ['Arman Hossain', 'Jessore Road, Jashore', 'out'], ['Riyad Hasan', 'Khilgaon, Dhaka', 'in'],
  ['Fahim Chowdhury', 'Board Bazar, Gazipur', 'sub'], ['Nafisa Tabassum', 'Wari, Old Dhaka', 'in'], ['Zahid Hasan', 'Sadar, Mymensingh', 'out'], ['Shuvo Das', 'Agrabad, Chattogram', 'out']
];
function a2PhoneOf(i){ return '01' + [7, 8, 9, 6, 5, 3][i % 6] + String(10000000 + (typeof zs_hash === 'function' ? zs_hash('a2p' + i) : i * 7919) % 89999999).slice(0, 8); }
function a2Lines(k, n){
  var pool = (DB.products || []).filter(function(p){ return p.price > 0 && !p.brand && p.colors && p.colors.length && p.sizes && p.sizes.length; }).slice(0, 34), out = [];
  for(var j = 0; j < n; j++){ var p = pool[a2ri(k + 'p' + j, 0, pool.length - 1)]; out.push({product:p.id, color:p.colors[a2ri(k + 'c' + j, 0, p.colors.length - 1)], size:p.sizes[Math.min(p.sizes.length - 1, a2ri(k + 's' + j, 1, 3))], qty:a2r(k + 'q' + j) < .85 ? 1 : 2, unitPrice:p.price}); }
  return out;
}
function a2Mk(o){
  var sub = 0; o.lines.forEach(function(l){ sub += l.unitPrice * l.qty; });
  o.subtotal = sub; o.discount = o.discount || 0; o.setDiscounts = o.setDiscounts || [];
  var items = sub - o.discount; o.delivery = o.delivery != null ? o.delivery : (typeof deliveryCharge === 'function' ? deliveryCharge(o.zone, items) : 80); o.total = items + o.delivery;
  o.flags = o.flags || []; o.edits = 0; o.reviewed = {}; o.exchanges = o.exchanges || []; o.addOns = []; o.note = o.note || ''; o.offersOptIn = !!o.offersOptIn; o.source = o.source || 'website';
  var a = o.a2 = Object.assign({pay:[], ev:[], refunds:[], notes:[], calls:[], risk:{score:8, band:'low', rules:[]}}, o.a2 || {});
  o.status = A2_OLD[a.ost] || 'confirmed';
  if(a.cour){ o.courier = a2CourName(a.cour); o.tracking = a.cid; }
  var tl = [{s:'confirmed', at:o.createdAt}];
  if(['PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED'].indexOf(a.ost) >= 0) tl.push({s:'packed', at:o.createdAt + 5 * A2.H});
  if(['HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED'].indexOf(a.ost) >= 0) tl.push({s:'shipped', at:a.pickedAt || o.createdAt + 20 * A2.H});
  if(o.deliveredAt) tl.push({s:'delivered', at:o.deliveredAt});
  o.timeline = tl;
  if(o.payment !== 'cod' && !a.pay.length && !a.noPay) a.pay.push({id:'PY-' + o.id.replace(/\D/g, ''), method:o.payment, purpose:'ORDER', amount:o.total, status:'PAID', at:o.createdAt + 4 * 60000, ref:'TX' + (8000000 + zs_hash(o.id) % 999999)});
  ST.orders[o.id] = o; return o;
}
function a2Msgs(o, steps){
  o.notif = o.notif || [];
  steps.forEach(function(s){ o.notif.push({ch:s[1], step:s[0], what:(typeof ZY_STEP !== 'undefined' && ZY_STEP[s[0]] ? ZY_STEP[s[0]][0] : s[0]), text:(typeof zy_tplText === 'function' ? zy_tplText(s[0], o) : ''), at:s[2], to:o.phone, st:s[3] || 'sent (demo)', why:s[4] || ''}); });
}
function a2Seed(){
  if(typeof ST === 'undefined' || !ST || ST.a2Demo) return;
  ST.a2Demo = 1;
  try{ a2SeedRun(); }catch(e){ console.error('a2 seed', e); }
}
function a2SeedRun(){
  try{ if(typeof ao_ensureDemo === 'function') ao_ensureDemo(); }catch(e){}
  var S = a2S(), now = Date.now(), H = A2.H, D = A2.D, i;
  /* ---- history: ~350 orders over the last ~60 days ---- */
  var ids = []; for(i = 680; i <= 1037; i++) if(!ST.orders['EX-' + i]) ids.push(i);
  ids.forEach(function(n, k){
    var key = 'h' + n, pi = (k * 7 + a2ri(key + 'who', 0, 5)) % A2_PEOPLE.length, pe = A2_PEOPLE[pi];
    var created = now - (1037 - n) * 0.165 * D - 0.4 * D - a2ri(key + 'm', 0, 300) * 60000;
    var r = a2r(key + 'out'), payR = a2r(key + 'pay');
    var pay = payR < .7 ? 'cod' : payR < .88 ? 'bkash' : payR < .95 ? 'nagad' : 'card';
    var zone = pe[2], cour = zone === 'in' ? (a2r(key + 'c') < .55 ? 'steadfast' : 'pathao') : zone === 'sub' ? (a2r(key + 'c') < .5 ? 'redx' : 'steadfast') : (a2r(key + 'c') < .55 ? 'pathao' : 'redx');
    var age = (now - created) / D, ost, ship, del = null, out = null;
    var transit = (zone === 'in' ? 1.2 : 2.6) + a2r(key + 't') * 1.4;
    if(r < .055){ ost = 'CANCELLED'; ship = 'NONE'; }
    else if(age < transit){ ost = 'IN_TRANSIT'; ship = a2r(key + 'o') < .5 ? 'OUT_FOR_DELIVERY' : 'IN_TRANSIT'; }
    else if(r < .125 && pay === 'cod' && age > transit + 3){ ost = 'RETURNED'; ship = 'RETURNED'; out = created + (transit + 2) * D; }
    else if(r < .125 && pay === 'cod'){ ost = 'IN_TRANSIT'; ship = 'RETURNING'; }
    else if(r < .135){ ost = 'PARTIALLY_DELIVERED'; ship = 'PARTIALLY_DELIVERED'; del = out = created + transit * D; }
    else if(n === 1003 || n === 902){ ost = 'IN_TRANSIT'; ship = 'LOST'; out = created + (transit + 3) * D; }
    else { ost = 'DELIVERED'; ship = 'DELIVERED'; del = out = created + transit * D; }
    var lines = a2Lines(key, a2r(key + 'n') < .6 ? 1 : a2r(key + 'n') < .9 ? 2 : 3);
    var o = {id:'EX-' + n, name:pe[0], phone:a2PhoneOf(pi), address:pe[1], zone:zone, payment:pay, createdAt:created, deliveredAt:del, lines:lines,
      source:a2r(key + 'src') < .58 ? 'website' : a2r(key + 'src') < .74 ? 'landing:polo-duo' : a2r(key + 'src') < .84 ? 'chat' : a2r(key + 'src') < .94 ? 'phone' : 'walk-in',
      discount:lines.length > 1 && a2r(key + 'd') < .3 ? 100 : 0,
      a2:{ost:ost, ship:ship, outAt:out, cour:ship === 'NONE' ? null : cour, cid:ship === 'NONE' ? '' : ({steadfast:'SF-', pathao:'PT-', redx:'RX-'})[cour] + (200000 + zs_hash(key) % 700000),
        pickedAt:created + 20 * H, lastMove:ost === 'IN_TRANSIT' ? now - a2ri(key + 'lm', 2, 20) * H : null, risk:{score:a2ri(key + 'rs', 4, 30), band:'low', rules:[]}}};
    if(ost === 'CANCELLED'){ o.a2.cancelReason = ['CUSTOMER_BEFORE_CONFIRM', 'DUPLICATE_ORDER', 'ADDRESS_UNREACHABLE'][a2ri(key + 'cr', 0, 2)]; if(pay !== 'cod') o.a2.noPay = true; }
    if(ost === 'PARTIALLY_DELIVERED') o.a2.keptShare = .5;
    if(ost === 'RETURNED'){
      o.a2.ourFault = a2r(key + 'of') < .2; o.a2.rtoReason = (typeof ZK_REASONS !== 'undefined' ? ZK_REASONS : ['Not at home'])[a2ri(key + 'rr', 0, 5)];
      var sellable = a2r(key + 'sl') < .75;
      o.a2.ret = {id:'RT-' + n, type:'refused', stage:'done', status:'CLOSED', at:out, recvAt:out + D, items:[{line:0, disp:sellable ? 'SELLABLE' : 'UNSELLABLE', erp:sellable ? 'confirmed' : null, reason:sellable ? '' : 'Stained, cannot be sold', at:out + D}], ev:[]};
    }
    a2Mk(o);
    a2Msgs(o, [['placed', 'SMS', created + 60000], ['confirmed', 'SMS', created + 1.5 * H], ['processing', 'WhatsApp', created + 5 * H]]);
  });
  /* a lost-parcel case keeps its order "in transit" until a claim is decided (§6.5.0) */
  /* failed messages (bad numbers) */
  var f1 = ST.orders['EX-1031']; if(f1){ f1.notif.push({ch:'SMS', step:'shipped', what:'Handed to courier', text:'', at:now - 7 * H, to:f1.phone, st:'failed', why:'The phone number is not valid — fix it on the order, then retry'}); }
  var f2 = ST.orders['EX-1034']; if(f2){ f2.notif.push({ch:'WhatsApp', step:'out', what:'Out for delivery', text:'', at:now - 5 * H, to:f2.phone, st:'failed', why:'WhatsApp not on this number — send as SMS instead'}); }

  /* ---- live scenarios (each one a real queue on the dashboard) ---- */
  var seq = Math.max(ST.seq || 1043, 1043), refusedPhone = (typeof zr_import === 'function' && zr_import()[9]) ? zr_import()[9].phone : '01811000999';
  var arif = ST.orders['EX-1042'], live = function(o){ o.id = 'EX-' + (seq++); return a2Mk(o); }, L1 = function(id, c, s, q){ var p = P(id) || DB.products[0]; return {product:p.id, color:c || p.colors[0], size:s || p.sizes[Math.min(2, p.sizes.length - 1)], qty:q || 1, unitPrice:p.price}; };
  var o;
  o = live({name:'Shahin Alam', phone:'01913400771', address:'Road 4, Block B, Banani, Dhaka', zone:'in', payment:'cod', createdAt:now - 26 * 60000, lines:[L1('oxford-cotton-shirt'), L1('slim-chino-trousers')],
    a2:{ost:'PLACED', ship:'NONE', sc:{state:'no-reply', callAt:now + 34 * 60000}, risk:{score:18, band:'low', rules:[]}}});
  a2Msgs(o, [['placed', 'SMS', o.createdAt + 60000]]);
  o = live({name:'Kawsar Ahmed', phone:'01712004355', address:'(voice) near the Kazipara metro, the yellow building, 3rd floor', zone:'in', payment:'cod', createdAt:now - 58 * 60000, flags:['Address check'], lines:[L1('heavyweight-hoodie', null, 'L')],
    a2:{ost:'PLACED', ship:'NONE', voice:{conf:.54, text:'Kazipara metro er pashe, holud building, tin tola'}, risk:{score:22, band:'low', rules:[{id:'address', w:10}]}}});
  o = live({name:arif ? arif.name : 'Arif Rahman', phone:arif ? arif.phone : '01812345671', address:arif ? arif.address : 'Shanti Niketan', zone:arif ? arif.zone : 'out', payment:'cod', createdAt:now - 34 * 60000, lines:[L1('essential-pique-polo', 'black', 'M')],
    a2:{ost:'PLACED', ship:'NONE', risk:{score:58, band:'medium', section:'duplicate', review:true, match:[arif ? arif.id : 'EX-1042'], rules:[{id:'dup', w:25}, {id:'value', w:15}, {id:'address', w:10}], ai:'Same customer, same day, a different colour: merge into one parcel and save one delivery charge.'}}});
  var inTr = ST.orders['EX-1036'] || ST.orders['EX-1035'];
  o = live({name:inTr ? inTr.name : 'Rashed Karim', phone:inTr ? inTr.phone : a2PhoneOf(0), address:inTr ? inTr.address : A2_PEOPLE[0][1], zone:inTr ? inTr.zone : 'in', payment:'cod', createdAt:now - 2.4 * H, lines:[L1('everyday-crew-tee', null, 'L', 2)],
    a2:{ost:'PLACED', ship:'NONE', risk:{score:41, band:'medium', section:'reorder', review:true, match:[inTr ? inTr.id : ''], rules:[{id:'transit', w:20}, {id:'dup', w:25}], ai:'A parcel is already on its way to this number. Ask if this is an add-on; if yes, it can go as a second parcel after the first is received.'}}});
  o = live({name:'Monir Hossain', phone:refusedPhone, address:'Kalibari Road, Mymensingh', zone:'out', payment:'cod', createdAt:now - 5.2 * H, lines:[L1('classic-cotton-panjabi', null, 'XL'), L1('slim-chino-trousers', null, '34')],
    a2:{ost:'AWAITING_ADVANCE', ship:'NONE', adv:{level:'hard', need:0, sent:now - 5 * H, channel:'WhatsApp + SMS'}, risk:{score:78, band:'high', section:'high', review:false, decided:{by:'Mehadi Hasan', what:'Asked for full advance (Hard)', at:now - 5 * H}, rules:[{id:'refusals', w:30}, {id:'noanswer', w:15}, {id:'value', w:15}, {id:'address', w:10}]}}});
  o.a2.adv.need = o.total;
  o = live({name:'Sharmin Akter', phone:'01615778802', address:'Station Road, Tangail', zone:'out', payment:'cod', createdAt:now - 7 * H, lines:[L1('essential-pique-polo', 'navy', 'L')],
    a2:{ost:'AWAITING_ADVANCE', ship:'NONE', adv:{level:'soft', need:0, sent:now - 6.8 * H, channel:'SMS'}, risk:{score:39, band:'medium', section:'newid', decided:{by:'Shakil Ahmed', what:'Asked for the delivery charge in advance (Soft)', at:now - 6.8 * H}, rules:[{id:'newid', w:20}, {id:'value', w:15}]}}});
  o.a2.adv.need = o.delivery;
  o = live({name:'Rakibul Hasan', phone:'01518234007', address:'Mirpur 2, Dhaka', zone:'in', payment:'cod', createdAt:now - 3.1 * H, lines:[L1('heavyweight-hoodie', 'black', 'XL'), L1('heavyweight-hoodie', null, 'L')],
    a2:{ost:'PLACED', ship:'NONE', risk:{score:72, band:'high', section:'newid', review:true, match:['EX-1012'], rules:[{id:'newid', w:20}, {id:'value', w:15}, {id:'refusals', w:30}, {id:'courierfraud', w:0, na:true}],
      links:[['Phone', 'new'], ['Device', 'seen on 2 other numbers'], ['Address', 'matches EX-1012 (refused)'], ['IP', '103.92.x.x · Dhaka']], ai:'Two numbers share this device; one of them refused a parcel. Ask for the delivery charge in advance (Soft).'}}});
  o = live({name:'Asif Iqbal', phone:'01977112290', address:'Road 12, Nikunja 2, Dhaka', zone:'in', payment:'bkash', createdAt:now - 1.2 * H, lines:[L1('oxford-cotton-shirt', null, 'L')], a2:{ost:'CONFIRMED', ship:'NONE'}});
  a2Ev(o, 'Paid by bKash — confirmed by itself (prepaid never enters the call queue)', 'ok', 'System');
  o = live({name:'Tareq Aziz', phone:'01811902233', address:'Sector 10, Uttara, Dhaka', zone:'in', payment:'cod', createdAt:now - 3.6 * H, lines:[L1('everyday-crew-tee', null, 'M'), L1('everyday-crew-tee', null, 'L')], a2:{ost:'CONFIRMED', ship:'NONE', calls:[{at:now - 3.3 * H, r:'reached', who:'Nadia Islam'}]}});
  o = live({name:'Mahin Chowdhury', phone:'01712660114', address:'Nasirabad, Chattogram', zone:'out', payment:'cod', createdAt:now - 9 * H, lines:[L1('slim-chino-trousers', null, '32')], a2:{ost:'PACKED', ship:'NONE', packedAt:now - 2 * H}});
  o = live({name:'Lamia Haque', phone:'01556773310', address:'Road 2, Dhanmondi, Dhaka', zone:'in', payment:'nagad', createdAt:now - 10 * H, lines:[L1('classic-cotton-panjabi', null, 'L')],
    a2:{ost:'PACKED', ship:'NONE', packedAt:now - 1.5 * H, gift:{to:'Abbu (Mostafa Haque)', phone:'01711223344', note:'Eid Mubarak, Abbu', after:a2dk(now + 2 * D)}}});
  var old = live({name:'Rumana Yasmin', phone:'01913005566', address:'Shibbari, Khulna', zone:'out', payment:'cod', createdAt:now - 30 * H, lines:[L1('linen-blend-shirt', null, 'M')],
    a2:{ost:'HANDED_OVER', ship:'CANCEL_REQUESTED', cour:'pathao', cid:'PT-718233', pickedAt:now - 8 * H, cancelPending:true, customerWantsChange:true, cancelReason:'CUSTOMER_CHANGE_AFTER_BOOKING', cancelAsked:now - 2 * H}});
  a2Ev(old, 'Customer asked for size L instead of M after booking', 'warn', 'Nadia Islam'); a2Ev(old, 'Cancel after booking pressed — reason: customer wants a change. Waiting for Pathao to confirm.', 'warn', 'Nadia Islam');
  var rep = live({name:old.name, phone:old.phone, address:old.address, zone:old.zone, payment:'cod', createdAt:now - 1.9 * H, source:'phone', lines:[L1('linen-blend-shirt', null, 'L')], a2:{ost:'CONFIRMED', ship:'NONE', replacesId:old.id}});
  old.a2.replacedById = rep.id; a2Ev(rep, 'Replacement of ' + old.id + ' — booking waits until the old parcel is confirmed cancelled', 'info', 'Nadia Islam');
  o = live({name:'Selim Reza', phone:'01714223098', address:'Upashahar, Bogura', zone:'out', payment:'cod', createdAt:now - 4.2 * D, lines:[L1('relaxed-twill-trousers', null, '34')], a2:{ost:'IN_TRANSIT', ship:'IN_TRANSIT', cour:'redx', cid:'RX-441902', pickedAt:now - 3.4 * D, lastMove:now - 61 * H}});
  o = live({name:'Nabil Kabir', phone:'01821004477', address:'Chashara, Narayanganj', zone:'sub', payment:'cod', createdAt:now - 2.6 * D, lines:[L1('everyday-crew-tee', null, 'XL')], a2:{ost:'IN_TRANSIT', ship:'ATTEMPT_FAILED', cour:'steadfast', cid:'SF-510392', pickedAt:now - 2 * D, lastMove:now - 5 * H, exNote:'Customer phone off at the door'}});
  o = live({name:'Pritom Saha', phone:'01675009911', address:'Ambarkhana, Sylhet', zone:'out', payment:'cod', createdAt:now - 3 * D, lines:[L1('oxford-cotton-shirt', null, 'XL')], a2:{ost:'IN_TRANSIT', ship:'ADDRESS_PROBLEM', cour:'pathao', cid:'PT-733021', pickedAt:now - 2.5 * D, lastMove:now - 9 * H, exNote:'Rider cannot find “near the big pond” — needs a landmark'}});
  o = live({name:'Junaid Hasan', phone:'01790221144', address:'Mirpur 6, Dhaka', zone:'in', payment:'cod', createdAt:now - 6 * H, lines:[L1('heavyweight-hoodie', null, 'M')], a2:{ost:'ON_HOLD', ship:'NONE', hold:'Customer asked to wait for his salary day (25th)'}});
  o = live({name:'Ayesha Siddiqua', phone:'01550998877', address:'Bashabo, Dhaka', zone:'in', payment:'cod', createdAt:now - 1.6 * H, lines:[L1('linen-blend-shirt', null, 'S')], a2:{ost:'PLACED', ship:'NONE', cancelReq:{at:now - 40 * 60000, why:'Ordered the wrong size by mistake'}}});
  o = live({name:'Robiul Awal', phone:'01722330019', address:'Kotwali, Barishal', zone:'out', payment:'cod', createdAt:now - 6 * D, lines:[L1('classic-cotton-panjabi', null, 'M')],
    a2:{ost:'RETURNED', ship:'RETURNING', cour:'redx', cid:'RX-401184', pickedAt:now - 5.5 * D, outAt:now - 1 * D, rtoReason:'Not at home / phone off', ret:{id:'RT-R1', type:'refused', stage:'approved', status:'EXPECTED', at:now - 1 * D, items:[{line:0}], ev:[]}}});
  o = live({name:'Mizanur Rahman', phone:'01611445566', address:'Kaliakair, Gazipur', zone:'sub', payment:'cod', createdAt:now - 7 * D, lines:[L1('essential-pique-polo', 'red', 'L'), L1('everyday-crew-tee', null, 'L')],
    a2:{ost:'RETURNED', ship:'RETURNED', cour:'steadfast', cid:'SF-498120', pickedAt:now - 6.5 * D, outAt:now - 2 * D, rtoReason:'Size did not fit', chargePaid:true, ret:{id:'RT-R2', type:'refused', stage:'approved', status:'RECEIVED', at:now - 2 * D, recvAt:now - 20 * H, items:[{line:0}, {line:1}], ev:[]}}});
  var pickDel = function(minDays, maxDays, skip){ var l = Object.keys(ST.orders).map(function(k){ return ST.orders[k]; }).filter(function(x){ return x.a2 && x.a2.ost === 'DELIVERED' && !x.a2.ret && !(x.a2.refunds || []).length && x.deliveredAt && now - x.deliveredAt > minDays * D && now - x.deliveredAt < maxDays * D && (skip || []).indexOf(x.id) < 0; }).sort(function(a, b){ return b.deliveredAt - a.deliveredAt; }); return l[0] || null; };
  var dEx = pickDel(1, 2.5);
  if(dEx){ dEx.a2.ret = {id:'RT-' + dEx.id.replace(/\D/g, ''), type:'wrong', stage:'requested', status:'REQUESTED', at:now - 4 * H, claim:{note:'Sent navy, I ordered black', photo:true}, items:[{line:0}], ev:[]}; }
  var dQ = pickDel(4, 9);
  if(dQ){ dQ.a2.ret = {id:'RT-' + dQ.id.replace(/\D/g, ''), type:'size', stage:'done', status:'QC_DONE', at:now - 5 * D, recvAt:now - 2 * D, items:[{line:0, disp:'SELLABLE', erp:'pending', at:now - 26 * H}], ev:[]}; }
  var dF = pickDel(5, 12);
  if(dF){ dF.a2.ret = {id:'RT-' + dF.id.replace(/\D/g, ''), type:'fault', stage:'done', status:'QC_DONE', at:now - 6 * D, recvAt:now - 3 * D, items:[{line:0, disp:'SELLABLE', erp:'failed', err:'ERP said “SKU not found” — the size code in the ERP is “XXL”, the shop sent “2XL”. Fix the size map, then Send again.', at:now - 2 * D}], ev:[]}; }
  /* a cancelled prepaid order → refund request (F-041); an approved refund not yet paid */
  o = live({name:'Tasnim Hossain', phone:'01914556677', address:'Kakrail, Dhaka', zone:'in', payment:'bkash', createdAt:now - 28 * H, lines:[L1('heavyweight-hoodie', null, 'L')], a2:{ost:'CANCELLED', ship:'NONE', cancelReason:'OUT_OF_STOCK'}});
  o.a2.refunds.push({id:'RF-301', amount:o.total, method:'original', source:'cancel', status:'REQUESTED', at:now - 26 * H, by:'Nadia Islam'});
  var dR = pickDel(2, 6);
  if(dR){ dR.a2.refunds.push({id:'RF-298', amount:150, method:'wallet', source:'rider', status:'APPROVED', at:now - 2 * D, by:'Nadia Islam', approvedBy:'Mehadi Hasan', why:'Rider asked ৳150 more than the COD amount'}); }
  var dD = pickDel(12, 20);
  if(dD){ dD.a2.refunds.push({id:'RF-280', amount:dD.lines[0].unitPrice, method:'original', source:'return', status:'COMPLETED', at:now - 12 * D, doneAt:now - 11 * D, by:'Nadia Islam', approvedBy:'Mehadi Hasan', ref:'BK-8812'}); }
  /* a customer who uses two numbers (merge suggestion) */
  var fa = ST.orders['EX-1025'] || ST.orders['EX-1024'];
  o = live({name:'Farhan Ahmed', phone:'01611990033', address:'Mirpur 11, Block C, Dhaka', zone:'in', payment:'cod', createdAt:now - 12 * D, deliveredAt:now - 10.8 * D, lines:[L1('striped-rib-polo', null, 'L')], a2:{ost:'DELIVERED', ship:'DELIVERED', cour:'steadfast', cid:'SF-400118', outAt:now - 10.8 * D}});
  ST.seq = seq;

  /* ---- COD payouts (settlements), each with how the money arrived ---- */
  var byC = {};
  a2Orders().forEach(function(x){ var a = x.a2; if(x.payment === 'cod' && (a.ost === 'DELIVERED' || a.ost === 'PARTIALLY_DELIVERED') && x.deliveredAt && now - x.deliveredAt > 4 * D){ var wk = Math.floor((now - x.deliveredAt) / (7 * D)); (byC[a.cour + '|' + wk] = byC[a.cour + '|' + wk] || []).push(x); } });
  var recv = {steadfast:'BANK', pathao:'BKASH', redx:'CASH_AT_COURIER_OFFICE'}, pn = 501, mis = 0;
  Object.keys(byC).sort().forEach(function(k){
    var p = k.split('|'), list = byC[k], cid = p[0], wk = +p[1];
    var lines = list.map(function(x){ var exp = x.total, fee = a2Rate(cid, x.zone) + Math.round(a2Goods(x) * .01), rec = exp - fee, st = 'MATCHED', reason = '';
      if(mis < 3 && a2r(x.id + 'mm') < .14){ mis++; reason = ['DOUBLE_DEDUCTION', 'PARTIAL', 'RIDER_OVERCHARGE'][mis - 1]; rec -= mis === 1 ? fee : mis === 2 ? 200 : 150; st = 'MISMATCH'; }
      return {order:x.id, exp:exp, fee:fee, rec:rec, st:st, reason:reason}; });
    S.payouts.push({id:'PO-' + (pn++), cour:cid, at:now - (wk * 7 + 3) * D, recv:wk === 2 && cid === 'redx' ? 'BANK' : recv[cid], file:'statement-' + cid + '-w' + wk + '.csv', lines:lines, matchedAt:now - (wk * 7 + 2) * D});
  });
  /* ---- ad spend imported per day (two days not imported yet → shown as missing) ---- */
  for(i = 1; i <= 64; i++){ var t = now - i * D; if(i === 3 || i === 17) continue; S.ad[a2dk(t)] = 1300 + a2ri('ad' + i, 0, 14) * 100; }
  S.ad[a2dk(now)] = 900;
  /* ---- expenses (the demo's own expense book) ---- */
  if(typeof zy_st === 'function'){ var z = zy_st(); if(!z.exp.length){ [['rent', 18000, 21], ['utility', 4200, 18], ['packaging', 6500, 12], ['photo', 8000, 9], ['transport', 1450, 4], ['office', 2300, 2], ['packaging', 5200, 40], ['rent', 18000, 51], ['utility', 3900, 47]].forEach(function(e, j){ z.exp.push({id:'XP-' + (z.seq.exp++), date:a2dk(now - e[2] * D), head:e[0], amt:e[1], from:j % 2 ? 'bKash' : 'Cash', note:'', by:'Rafiq Ahmed', at:now - e[2] * D}); }); } }
  /* ---- months for the month-end close ---- */
  var mk = function(back){ var d = new Date(); return a2mk(new Date(d.getFullYear(), d.getMonth() - back, 15).getTime()); };
  S.months[mk(2)] = {st:'pushed', at:now - 50 * D, by:'Rafiq Ahmed', key:'close:' + mk(2)};
  S.months[mk(1)] = {st:'closed', at:now - 20 * D, by:'Rafiq Ahmed', tries:1, err:'ERP said 503 (busy). Nothing was posted. Push again — the same key, so nothing doubles.'};
  /* ---- notifications (bell) ---- */
  S.ntf = [
    {id:'n1', lvl:'urgent', t:'Backup failed at 02:00', bn:'রাত 2টার ব্যাকআপ হয়নি', s:'Google Drive said “quota full”. The Azure copy is fine.', at:now - 9 * H, href:'/admin/settings'},
    {id:'n2', lvl:'important', t:'Refund approval requested', bn:'রিফান্ড অনুমোদন চাওয়া হয়েছে', s:'Nadia asked to refund EX-' + (seq - 3) + ' (cancelled, bKash).', at:now - 26 * H, href:'/admin/money/payments?tab=refunds'},
    {id:'n3', lvl:'important', t:'ERP sync failed for a return', bn:'একটা ফেরত ERP-তে যায়নি', s:'Size code mismatch — see the plain reason on the return card.', at:now - 2 * D, href:'/admin/orders/returns?stage=done'},
    {id:'n4', lvl:'fyi', t:'Pathao paid ' + a2tk(48600), bn:'Pathao টাকা দিয়েছে', s:'Received as bKash · matched 31 of 31 parcels.', at:now - 3 * D, href:'/admin/money/cod', read:true},
    {id:'n5', lvl:'fyi', t:'Shakil mentioned you on EX-' + (seq - 13), bn:'শাকিল আপনাকে একটা অর্ডারে উল্লেখ করেছে', s:'“Can we waive the charge? Our mistake.”', at:now - 4 * H, href:'/admin/orders/EX-' + (seq - 13)},
    {id:'n6', lvl:'important', t:'COD-off proposal for a number', bn:'একটা নম্বরে COD বন্ধের প্রস্তাব', s:'Nadia proposed COD off for ' + a2ph(refusedPhone) + ' (3 refusals).', at:now - 3 * H, href:'/admin/customers/review?tab=approvals'}
  ];
  S.appr = [
    {id:'ap1', kind:'codOff', kindEn:'COD off for a number', kindBn:'নম্বরে COD বন্ধ', phone:refusedPhone, why:'3 refusals in 4 months, did not answer calls', by:'Nadia Islam', at:now - 3 * H, st:'waiting'},
    {id:'ap2', kind:'refund', kindEn:'Refund ' + a2tk(ST.orders['EX-' + (seq - 3)] ? ST.orders['EX-' + (seq - 3)].total : 1650), kindBn:'রিফান্ড', ref:'EX-' + (seq - 3), why:'Cancelled — out of stock, paid by bKash', by:'Nadia Islam', at:now - 26 * H, st:'waiting'}
  ];
  /* ---- campaigns, segments, bulk enquiries ---- */
  S.camps = [
    {id:'c1', name:'Puja offer — polos', type:'blast', seg:'returning', ch:'SMS', st:'sent', at:now - 12 * D, reach:412, skipped:38, cost:144, orders:23, value:31450},
    {id:'c2', name:'Win-back · 60 days quiet', type:'winback', seg:'atrisk', ch:'WhatsApp', st:'running', at:now - 3 * D, reach:96, skipped:11, cost:77, orders:5, value:6890, cap:'1 per 30 days'},
    {id:'c3', name:'Abandoned bag · 2 h later', type:'abandoned', seg:'all', ch:'WhatsApp', st:'running', at:now - 20 * D, reach:188, skipped:64, cost:150, orders:17, value:20110, cap:'1 per bag'},
    {id:'c4', name:'Back in stock · Heavyweight Hoodie', type:'bis', seg:'all', ch:'SMS', st:'scheduled', at:now + 1 * D, reach:57, skipped:3, cost:20, orders:0, value:0},
    {id:'c5', name:'Winter drop teaser', type:'blast', seg:'vip', ch:'SMS', st:'draft', at:0, reach:0, skipped:0, cost:0, orders:0, value:0}
  ];
  S.segs = [{id:'s1', name:'Dhaka polo buyers', bn:'ঢাকার পোলো ক্রেতা', rules:[['district', 'Dhaka'], ['category', 'polos']], at:now - 8 * D, used:'Puja offer — polos'}, {id:'s2', name:'Big spenders, quiet 45 days', bn:'বড় ক্রেতা, 45 দিন চুপ', rules:[['spend', '5000'], ['last', '45']], at:now - 4 * D, used:''}];
  S.bulk = [{id:'BQ-11', company:'Nexus Telecom Ltd', contact:'Sabrina (HR)', phone:'01711555000', qty:120, item:'Polo with logo', deadline:a2dk(now + 18 * D), st:'quote', price:'', logo:true, at:now - 2 * D},
    {id:'BQ-12', company:'Green Valley School', contact:'Mr. Alam', phone:'01819000222', qty:60, item:'Panjabi for annual day', deadline:a2dk(now + 30 * D), st:'new', price:'', logo:false, at:now - 5 * H}];
  saveState();
}
