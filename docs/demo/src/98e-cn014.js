/* =====================================================================
   98e-cn014.js — eight optional features (ROUND15 Note 54 item 19, CN-014).
   Each one is OFF by default, has its own switch, every number in it can be
   edited, and it sits inside the admin section it belongs to (no new menu):
     a  WhatsApp self-confirm ............ Orders            (#/admin/orders)
     b  Exact-amount line ................ Messages log      (#/admin/comms) + sticker + tracking page
     c  Packing proof photo .............. Fulfilment        (#/admin/fulfilment)
     d  RTO cost book .................... Analytics/Reports (#/admin/analytics)
     e  One-trip size swap ............... Exchanges         (#/admin/exchanges) + customer exchange page
     f  Day-1 care + Day-3 review ........ Messages log      (#/admin/comms)
     g  Eid order-by dates per district .. Hero & campaigns  (#/admin/hero) + home banner + bag line
     h  Gift mode ........................ Settings          (#/admin/settings) + checkout + invoice
   State: ST.feat (this browser, demo). Nothing is sent anywhere.
   ===================================================================== */
var FT_DEF = {
  selfConfirm:{on:false, waitHours:3, applies:'cod', msg:'Hi {name}, your EXTAS order {order} ({total}) is ready to pack. Reply 1, 2 or 3.',
    r1:'1 — Yes, send it', r2:'2 — I want to change something', r3:'3 — Cancel the order', after1:'Thank you! Your order is confirmed.'},
  exactAmount:{on:false, text:'Pay exactly {amount} — the rider may not ask for more. Asked for more? Tell us: {link}', link:'extas.com.bd/report', sticker:true, sms:true, tracking:true},
  packPhoto:{on:false, mode:'required', keepDays:30, minPhotos:1},
  rtoBook:{on:false, courier:110, packaging:35, staff:40, lostSale:true},
  swap:{on:false, charge:80, areas:'Dhaka city, Gazipur, Narayanganj, Savar', maxDays:3},
  care:{on:false, day1Hour:11, day1Text:'Hi {name}, did your EXTAS order fit well? Wrong size? Reply here and we sort it within {windowHours} hours.',
    reviewOn:true, reviewDay:3, reviewText:'Hi {name}, how do you like your {product}? A short review helps other buyers: {link}'},
  eidDates:{on:false, eid:'2027-03-10', bandIn:'2027-03-06', bandSub:'2027-03-05', bandOut:'2027-03-03',
    banner:'Eid delivery — last day to order', preorder:false, advance:200},
  gift:{on:false, hidePrices:true, receiver:true, noteMax:150, dateOn:true, minDays:1}
};
function ft(k){
  var d = FT_DEF[k], o = (ST.feat && ST.feat[k]) || {}, r = {};
  for(var a in d) r[a] = d[a]; for(var b in o) if(o[b] !== undefined) r[b] = o[b];
  return r;
}
function ftOn(k){ return !!ft(k).on; }
function ftSet(k, f, v){ ST.feat = ST.feat || {}; ST.feat[k] = ST.feat[k] || {}; ST.feat[k][f] = v; saveState(); }
function ftFill(s, v){ return String(s || '').replace(/\{(\w+)\}/g, function(m, k){ return v && v[k] != null ? String(v[k]) : m; }); }

/* ---------- the admin card (one per feature) ---------- */
var FT_META = {
  selfConfirm:{t:'WhatsApp self-confirm', bn:'WhatsApp-এ নিজে কনফার্ম', where:'Orders › Confirmation',
    what:'Before a call, the customer gets one WhatsApp and confirms with 1, 2 or 3. No answer in time → the order goes to the call queue.',
    f:[['waitHours','num','Hours to wait before the call queue',1,48,1], ['applies','sel','Which orders',[['cod','Cash on Delivery orders'],['all','Every order'],['new','First orders from new customers']]],
       ['msg','area','The message ({name}, {order}, {total})'], ['r1','text','Reply 1'], ['r2','text','Reply 2'], ['r3','text','Reply 3'], ['after1','text','Answer after 1']]},
  exactAmount:{t:'Exact-amount line', bn:'ঠিক টাকার লাইন', where:'Messages + shipping labels',
    what:'One line on the sticker, the SMS and the tracking page: the exact amount to pay and where to report a rider who asks for more.',
    f:[['text','area','The line ({amount}, {link})'], ['link','text','Report link'], ['sticker','sw','On the courier sticker'], ['sms','sw','In the SMS'], ['tracking','sw','On the tracking page']]},
  packPhoto:{t:'Packing proof photo', bn:'প্যাকিংয়ের প্রমাণ ছবি', where:'Fulfilment',
    what:'Staff take a photo of the open parcel before sealing it. It settles "wrong item" or "missing item" claims.',
    f:[['mode','sel','Photo is',[['required','Required — the parcel cannot be marked packed without it'],['optional','Optional — a reminder only']]], ['minPhotos','num','Photos per parcel',1,5,1], ['keepDays','num','Keep photos for (days)',7,365,1]]},
  rtoBook:{t:'RTO cost book', bn:'ফেরত পার্সেলের খরচের খাতা', where:'Reports',
    what:'What each returned (RTO) parcel really costs: courier charge both ways, packaging and staff time — by district, campaign, product, courier and reason.',
    f:[['courier','num','Courier charge per RTO (৳)',0,1000,5], ['packaging','num','Packaging lost per RTO (৳)',0,500,5], ['staff','num','Staff time per RTO (৳)',0,500,5], ['lostSale','sw','Also show the sale that was lost']]},
  swap:{t:'One-trip size swap', bn:'এক যাত্রায় সাইজ বদল', where:'Exchanges',
    what:'The rider brings the new size and takes the old one back in the same visit — no second trip for the customer.',
    f:[['charge','num','Swap charge (৳)',0,500,5], ['maxDays','num','Ask within (days of delivery)',1,14,1], ['areas','text','Areas where it works (comma between)']]},
  care:{t:'Day-1 WhatsApp care + Day-3 review', bn:'১ম দিনের খোঁজ + ৩য় দিনের রিভিউ', where:'Messages',
    what:'The day after delivery one friendly WhatsApp asks if the fit is right; on day 3 a short review request.',
    f:[['day1Hour','num','Day-1 message at (hour, 24 h)',8,21,1], ['day1Text','area','Day-1 text ({name}, {windowHours})'], ['reviewOn','sw','Send the review request'], ['reviewDay','num','Review request on day',2,10,1], ['reviewText','area','Review text ({name}, {product}, {link})']]},
  eidDates:{t:'Eid order-by dates per district', bn:'জেলাভিত্তিক ঈদের শেষ অর্ডারের তারিখ', where:'Campaigns',
    what:'The last day to order for delivery before Eid, per delivery band. A banner on the shop says it; pre-order can take an advance.',
    f:[['eid','date','Eid day'], ['bandIn','date','Order by — Dhaka city'], ['bandSub','date','Order by — near Dhaka'], ['bandOut','date','Order by — outside Dhaka'],
       ['banner','text','Banner words (the dates follow it)'], ['preorder','sw','Pre-order after the date'], ['advance','num','Pre-order advance (৳)',0,5000,50]]},
  gift:{t:'Gift mode', bn:'উপহার হিসেবে পাঠানো', where:'Checkout settings',
    what:'At checkout the customer can send the order as a gift: the receiver\'s name and phone, a gift note, a "deliver on or after" date, and an invoice without prices.',
    f:[['receiver','sw','Ask the receiver\'s name and phone'], ['hidePrices','sw','Invoice without prices'], ['noteMax','num','Gift note — most letters',20,500,10], ['dateOn','sw','"Deliver on or after" date'], ['minDays','num','Earliest date (days from today)',0,30,1]]}
};
function ftCard(k){
  var M = FT_META[k], c = ft(k);
  var field = function(f){
    var id = 'ft-'+k+'-'+f[0], v = c[f[0]], lab = '<label class="label" for="'+id+'">'+esc(f[2])+'</label>';
    if(f[1] === 'sw') return '<div class="ft-f ft-sw"><span>'+esc(f[2])+'</span>'+zs_sw(!!v, 'ft-sw', f[2], 'data-k="'+k+'" data-f="'+f[0]+'"')+'</div>';
    /* round 3: choices are radio rows, so a long choice wraps instead of being cut in a box */
    if(f[1] === 'sel') return '<div class="ft-f ft-wide" role="radiogroup" aria-label="'+esc(f[2])+'"><span class="label">'+esc(f[2])+'</span><div class="ft-rad">'+f[3].map(function(o){ return '<label class="ft-ro'+(String(v) === o[0] ? ' on' : '')+'"><input type="radio" name="'+id+'" value="'+esc(o[0])+'" data-change="ft-in" data-k="'+k+'" data-f="'+f[0]+'"'+(String(v) === o[0] ? ' checked' : '')+'><span>'+esc(o[1])+'</span></label>'; }).join('')+'</div></div>';
    if(f[1] === 'area') return '<div class="ft-f ft-wide">'+lab+'<textarea id="'+id+'" class="input" rows="2" data-input="ft-in" data-k="'+k+'" data-f="'+f[0]+'">'+esc(v)+'</textarea></div>';
    if(f[1] === 'num') return '<div class="ft-f">'+lab+'<input id="'+id+'" class="input" type="number" min="'+f[3]+'" max="'+f[4]+'" step="'+f[5]+'" value="'+esc(v)+'" data-input="ft-in" data-k="'+k+'" data-f="'+f[0]+'" data-num="1"></div>';
    return '<div class="ft-f'+(f[1] === 'text' && String(v).length > 30 ? ' ft-wide' : '')+'">'+lab+'<input id="'+id+'" class="input" type="'+(f[1] === 'date' ? 'date' : 'text')+'" value="'+esc(v)+'" data-input="ft-in" data-k="'+k+'" data-f="'+f[0]+'"></div>';
  };
  return '<section class="zs-card ft-card'+(c.on ? '' : ' ft-off')+'" id="ft-'+k+'" data-testid="ft-'+k+'">'+
    '<div class="ft-hd"><div class="ft-tl"><span class="ft-tag">'+esc(M.where)+' · optional</span><h2 class="h3">'+esc(M.t)+' <span class="ft-bn">'+esc(M.bn)+'</span></h2><p class="small text2">'+esc(M.what)+'</p></div>'+
      '<div class="ft-sw0"><span class="xs muted">'+(c.on ? 'On' : 'Off')+'</span>'+zs_sw(c.on, 'ft-sw', M.t+' on or off', 'data-k="'+k+'" data-f="on"')+'</div></div>'+
    '<div class="ft-body">'+M.f.map(field).join('')+'</div>'+(FT_EXTRA[k] ? FT_EXTRA[k](c) : '')+'</section>';
}
INPUT['ft-in'] = function(el){ var v = el.value; if(el.getAttribute('data-num')) v = +v; ftSet(el.getAttribute('data-k'), el.getAttribute('data-f'), v); };
CHANGE['ft-in'] = function(el){ ftSet(el.getAttribute('data-k'), el.getAttribute('data-f'), el.value); rerender(); };
ACT['ft-sw'] = function(el){ var k = el.getAttribute('data-k'), f = el.getAttribute('data-f'); ftSet(k, f, !ft(k)[f]); rerender(); if(f === 'on') toast(FT_META[k].t+(ft(k).on ? ' is on' : ' is off')); };

/* previews / reports under some cards */
var FT_EXTRA = {};
FT_EXTRA.selfConfirm = function(c){
  return '<div class="ft-prev"><div class="ft-wa"><b>WhatsApp preview</b><p>'+esc(ftFill(c.msg, {name:'Rafiq', order:'EX-1042', total:fmt(2350)}))+'</p><p class="ft-r">'+esc(c.r1)+'<br>'+esc(c.r2)+'<br>'+esc(c.r3)+'</p></div>'+
    '<p class="xs muted">No reply within '+esc(c.waitHours)+' h → the order joins the call queue. Reply 2 or 3 → it goes to a person at once.</p></div>';
};
FT_EXTRA.exactAmount = function(c){ return '<div class="ft-prev"><div class="ft-line">'+ico('cash',15)+'<span>'+esc(ftExactText(2350))+'</span></div></div>'; };
FT_EXTRA.packPhoto = function(c){ return '<p class="xs muted ft-prev">With it on, the packing step in Fulfilment asks for '+esc(c.minPhotos)+' photo(s)'+(c.mode === 'required' ? ' and will not mark the parcel packed without them' : '')+'. Photos are deleted after '+esc(c.keepDays)+' days.</p>'; };
FT_EXTRA.swap = function(c){ return '<p class="xs muted ft-prev">Customers in these areas see "One-trip swap · '+esc(fmt(+c.charge || 0))+'" on their exchange page.</p>'; };
FT_EXTRA.care = function(c){ return '<div class="ft-prev"><div class="ft-wa"><b>Day 1 · '+esc(c.day1Hour)+':00</b><p>'+esc(ftFill(c.day1Text, {name:'Rafiq', windowHours:SET('exchange','windowHours')}))+'</p></div>'+
  (c.reviewOn ? '<div class="ft-wa"><b>Day '+esc(c.reviewDay)+'</b><p>'+esc(ftFill(c.reviewText, {name:'Rafiq', product:'Essential Piqué Polo', link:'extas.com.bd/r/EX-1042'}))+'</p></div>' : '')+'</div>'; };
FT_EXTRA.eidDates = function(c){ return '<div class="ft-prev">'+ftEidBanner(true)+'</div>'; };
FT_EXTRA.rtoBook = function(c){ return ftRtoReport(c); };

/* ---------- (d) RTO cost book: sample data, real arithmetic ---------- */
var FT_RTO_SAMPLE = [
  ['Dhaka', 'Polo Duo · Facebook', 'Essential Piqué Polo', 'Pathao', 'Customer not reachable'],
  ['Dhaka', 'Winter hoodie · TikTok', 'Heavyweight Hoodie 320 GSM', 'Steadfast', 'Changed mind at the door'],
  ['Chattogram', 'Polo Duo · Facebook', 'Essential Piqué Polo', 'Steadfast', 'Size did not fit'],
  ['Gazipur', 'Panjabi · Google', 'Classic Cotton Panjabi', 'Pathao', 'Customer not reachable'],
  ['Sylhet', 'Winter hoodie · TikTok', 'Heavyweight Hoodie 320 GSM', 'RedX', 'Fake order'],
  ['Dhaka', 'Polo Duo · Facebook', 'Contrast Collar Polo', 'Pathao', 'Changed mind at the door'],
  ['Rajshahi', 'Panjabi · Google', 'Classic Cotton Panjabi', 'RedX', 'Customer not reachable'],
  ['Narayanganj', 'Winter hoodie · TikTok', 'Fleece Hoodie 6-Colour', 'Steadfast', 'Size did not fit'],
  ['Chattogram', 'Polo Duo · Facebook', 'Essential Piqué Polo', 'Pathao', 'Fake order'],
  ['Dhaka', 'Office set · Facebook', 'Oxford Cotton Shirt', 'Steadfast', 'Customer not reachable'],
  ['Khulna', 'Panjabi · Google', 'Classic Cotton Panjabi', 'Pathao', 'Changed mind at the door'],
  ['Dhaka', 'Winter hoodie · TikTok', 'Heavyweight Hoodie 320 GSM', 'Pathao', 'Customer not reachable']
];
function ftRtoReport(c){
  var per = (+c.courier || 0) + (+c.packaging || 0) + (+c.staff || 0);
  var dims = [['District',0], ['Campaign',1], ['Product',2], ['Courier',3], ['Reason',4]];
  var block = function(d){
    var m = {}; FT_RTO_SAMPLE.forEach(function(r){ m[r[d[1]]] = (m[r[d[1]]] || 0) + 1; });
    var rows = Object.keys(m).sort(function(a, b){ return m[b] - m[a]; }).map(function(k){ return '<tr><td>'+esc(k)+'</td><td class="r">'+m[k]+'</td><td class="r">'+fmt(m[k] * per)+'</td></tr>'; }).join('');
    return '<div class="ft-rtob"><b class="small">By '+d[0].toLowerCase()+'</b><table class="tbl ft-tbl"><thead><tr><th>'+d[0]+'</th><th class="r">RTO</th><th class="r">Cost</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  };
  return '<div class="ft-prev"><div class="ft-kpis"><span><b>'+FT_RTO_SAMPLE.length+'</b> RTO parcels (sample, last 30 days)</span><span><b>'+fmt(per)+'</b> per RTO</span><span><b>'+fmt(per * FT_RTO_SAMPLE.length)+'</b> total cost</span></div>'+
    '<div class="ft-rto">'+dims.map(block).join('')+'</div><p class="xs muted">Sample rows for the demo. In the live shop the rows come from returned parcels (Couriers › Returns & refused).</p></div>';
}

/* ---------- (b) exact-amount line on the sticker, SMS and tracking page ---------- */
function ftExactText(amount){ var c = ft('exactAmount'); return ftFill(c.text, {amount:fmt(amount), link:c.link}); }
if(typeof zx_stickerHTML === 'function'){
  var zx_sticker0 = zx_stickerHTML;
  zx_stickerHTML = function(o, lines, size){
    var h = zx_sticker0(o, lines, size), c = ft('exactAmount');
    if(!c.on || !c.sticker) return h;
    var amt = o.payment === 'cod' ? (o.total - (o.paid || 0)) : 0;
    return h.replace(/<\/div>$/, '<div class="zx-snote ft-stk">'+esc(ftExactText(amt))+'</div></div>');
  };
}
if(typeof PAGES !== 'undefined' && PAGES.order){
  (function(){ var pg = PAGES.order, r0 = pg.render;
    pg.render = function(params, q){
      var h = r0.apply(this, arguments), c = ft('exactAmount'), o = ST.orders && ST.orders[params && params[0]];
      if(!c.on || !c.tracking || !o || o.payment !== 'cod' || /deliver|cancel|return/i.test(o.status || '')) return h;
      return '<div class="container"><div class="ft-line ft-track" data-testid="ft-exact">'+ico('cash',16)+'<span>'+esc(ftExactText(o.total - (o.paid || 0)))+'</span></div></div>'+h;
    };
  })();
}

/* ---------- (g) Eid order-by banner (home + bag) ---------- */
function ftEidBand(){
  var c = ft('eidDates'), t = typeof hcToday === 'function' ? hcToday() : new Date().toISOString().slice(0, 10);
  var bands = [['Dhaka city', c.bandIn], ['near Dhaka', c.bandSub], ['outside Dhaka', c.bandOut]].filter(function(b){ return b[1]; });
  return {c:c, today:t, bands:bands};
}
function ftEidBanner(preview){
  var E = ftEidBand(), c = E.c; if(!preview && (!c.on || (c.eid && E.today > c.eid))) return '';
  var open = E.bands.filter(function(b){ return E.today <= b[1]; });
  var D = function(s){ return typeof hcFmtShort === 'function' ? hcFmtShort(s) : s; };
  /* the words once, then one short chip per band ("Dhaka city 6 Mar") */
  if(open.length){
    if(/\{date\}|\{band\}/.test(c.banner)) return '<div class="ft-eid" data-testid="ft-eid">'+ico('clock',16)+'<span>'+esc(open.map(function(b){ return ftFill(c.banner, {date:D(b[1]), band:b[0]}); }).join(' · '))+'</span></div>';
    return '<div class="ft-eid" data-testid="ft-eid">'+ico('clock',16)+'<span class="ft-eidt">'+esc(c.banner)+'</span><span class="ft-eidb">'+open.map(function(b){ return '<span>'+esc(b[0])+' <b>'+esc(D(b[1]))+'</b></span>'; }).join('')+'</span></div>';
  }
  if(!c.preorder) return '';
  return '<div class="ft-eid" data-testid="ft-eid">'+ico('clock',16)+'<span>'+esc('Eid dates have passed — pre-order now with '+fmt(+c.advance || 0)+' advance')+'</span></div>';
}
(function(){
  if(typeof hm_festive === 'function'){ var f0 = hm_festive; hm_festive = function(){ var b = ftEidBanner(false); return (b ? '<div class="container ft-eidwrap">'+b+'</div>' : '')+f0(); }; }
  if(typeof PAGES !== 'undefined' && PAGES.bag){ var pb = PAGES.bag, br = pb.render; pb.render = function(){ var h = br.apply(this, arguments), b = ftEidBanner(false); return b && (ST.bag || []).length ? '<div class="container ft-eidwrap ft-eidbag">'+b+'</div>'+h : h; }; }
})();

/* ---------- (e) one-trip swap on the customer's exchange page ---------- */
if(typeof PAGES !== 'undefined' && PAGES.exchange){
  (function(){ var pe = PAGES.exchange, er = pe.render; pe.render = function(params){
    var h = er.apply(this, arguments), c = ft('swap'); if(!c.on) return h;
    return '<div class="container"><div class="ft-line ft-swap" data-testid="ft-swap">'+ico('swap',16)+'<span><b>One-trip swap · '+esc(fmt(+c.charge || 0))+'</b> — the rider brings your new size and takes the old one in the same visit. Works in: '+esc(c.areas)+'. Ask within '+esc(c.maxDays)+' days of delivery.</span></div></div>'+h; };
  })();
}

/* ---------- (a) self-confirm: what the customer is told after ordering ---------- */
if(typeof PAGES !== 'undefined' && PAGES.thanks){
  (function(){ var pt = PAGES.thanks, tr = pt.render; pt.render = function(params){
    var h = tr.apply(this, arguments), c = ft('selfConfirm'), o = ST.orders && ST.orders[params && params[0]];
    if(!c.on || !o || (c.applies === 'cod' && o.payment !== 'cod')) return h;
    return '<div class="container"><div class="ft-line" data-testid="ft-selfconfirm">'+waGlyph(16)+'<span>We just sent you a WhatsApp — reply <b>1</b> to confirm your order. No reply in '+esc(c.waitHours)+' hours? We will call you.</span></div></div>'+h; };
  })();
}

/* ---------- (h) gift mode at checkout ---------- */
function ftGiftCard(u){
  var c = ft('gift'); if(!c.on) return '';
  var g = u.gift || {}, on = !!g.on, min = new Date(Date.now() + (+c.minDays || 0) * 864e5).toISOString().slice(0, 10);
  return '<section class="card co-sec ft-gift'+(on ? ' on' : '')+'" data-testid="ft-gift"><label class="check ft-gcheck"><input type="checkbox" data-change="ft-gift" data-f="on"'+(on ? ' checked' : '')+'><span class="ft-gl">'+ico('gift',17)+'<b>Send it as a gift</b><span class="ft-gsub">receiver, note and date</span></span></label>'+
    (on ? '<div class="ft-gbody">'+
      (c.receiver ? '<div class="ft-g2"><div><label class="label" for="ft-gname">Receiver\'s name</label><input id="ft-gname" class="input" data-input="ft-gift" data-f="name" value="'+esc(g.name || '')+'"></div>'+
        '<div><label class="label" for="ft-gphone">Receiver\'s phone</label><input id="ft-gphone" class="input" type="tel" inputmode="tel" data-input="ft-gift" data-f="phone" value="'+esc(g.phone || '')+'" placeholder="01XXX-XXXXXX"></div></div>' : '')+
      '<div><label class="label" for="ft-gnote">Gift note <span class="xs muted">(up to '+esc(c.noteMax)+' letters)</span></label><textarea id="ft-gnote" class="input" rows="2" maxlength="'+esc(c.noteMax)+'" data-input="ft-gift" data-f="note">'+esc(g.note || '')+'</textarea></div>'+
      (c.dateOn ? '<div><label class="label" for="ft-gdate">Deliver on or after</label><input id="ft-gdate" class="input" type="date" min="'+min+'" data-input="ft-gift" data-f="date" value="'+esc(g.date || '')+'"></div>' : '')+
      (c.hidePrices ? '<p class="xs muted ft-gnote">'+ico('check',14)+'<span>The invoice in the parcel shows no prices.</span></p>' : '')+'</div>' : '')+'</section>';
}
CHANGE['ft-gift'] = function(el){ var u = co_state(); u.gift = u.gift || {}; u.gift.on = el.checked; rerender(); };
INPUT['ft-gift'] = function(el){ var u = co_state(); u.gift = u.gift || {}; u.gift[el.getAttribute('data-f')] = el.value; };
if(typeof SUBMIT !== 'undefined' && SUBMIT['co-place']){
  (function(){ var s0 = SUBMIT['co-place']; SUBMIT['co-place'] = function(f, ev){
    var u = co_state(), g = u.gift, c = ft('gift'), before = Object.keys(ST.orders || {});
    s0.apply(this, arguments);
    if(!c.on || !g || !g.on) return;
    Object.keys(ST.orders || {}).forEach(function(id){ if(before.indexOf(id) < 0){ ST.orders[id].gift = {name:g.name || '', phone:g.phone || '', note:String(g.note || '').slice(0, +c.noteMax || 150), date:g.date || '', hidePrices:!!c.hidePrices}; } });
    saveState();
  }; })();
}
/* a gift parcel's invoice: the same document, no prices, the note on it */
if(typeof zx_invHTML === 'function'){
  var zx_inv0 = zx_invHTML;
  zx_invHTML = function(o, n){
    var h = zx_inv0(o, n); if(!o || !o.gift || !o.gift.hidePrices) return h;
    var d = document.createElement('div'); d.innerHTML = h;
    [].forEach.call(d.querySelectorAll('td.r, .sv, .tot, .pd, .cod, .was'), function(e){ e.textContent = ''; });
    var note = '<div class="ft-ginv"><b>A gift for '+esc(o.gift.name || o.name)+'</b>'+(o.gift.note ? '<p>“'+esc(o.gift.note)+'”</p>' : '')+'</div>';
    return note + d.innerHTML;
  };
}

/* ---------- where each card sits (inside its own section) ---------- */
var FT_PLACE = {'admin-orders':['selfConfirm'], 'zy-comms':['exactAmount', 'care'], 'zx-ful':['packPhoto'], 'admin-analytics':['rtoBook'], 'zq-exch':['swap'], 'admin-hero':['eidDates'], 'admin-settings':['gift']};
(function(){
  Object.keys(FT_PLACE).forEach(function(name){
    var pg = PAGES[name]; if(!pg || pg._ft) return; pg._ft = true;
    var r0 = pg.render, a0 = pg.after;
    pg.render = function(){ return r0.apply(this, arguments)+'<div class="ft-slot" hidden>'+FT_PLACE[name].map(ftCard).join('')+'</div>'; };
    pg.after = function(){
      if(a0) try{ a0.apply(this, arguments); }catch(e){ console.error(e); }
      var slot = document.querySelector('.admin-main .ft-slot'); if(!slot) return;
      var m = document.querySelector('.admin-main'), hd = m.querySelector('.zs-hd') || m.querySelector('h1');
      var at = hd ? (hd.classList && hd.classList.contains('zs-hd') ? hd : (hd.closest('.row') || hd)) : null;
      var box = document.createElement('div'); box.className = 'ft-place'; box.setAttribute('data-testid', 'ft-place');
      var openNow = UI.ftOpen && UI.ftOpen[name] != null ? UI.ftOpen[name] : FT_PLACE[name].some(ftOn);
      box.innerHTML = '<details class="ft-det" data-ftp="'+name+'"'+(openNow ? ' open' : '')+'><summary>'+ico('settings',15)+'<span>Optional features in this section</span><span class="ft-sum">'+FT_PLACE[name].map(function(k){ return esc(FT_META[k].t)+' · '+(ftOn(k) ? 'On' : 'Off'); }).join(' &nbsp;|&nbsp; ')+'</span></summary>'+slot.innerHTML+'</details>';
      slot.remove();
      if(at && at.parentNode) at.parentNode.insertBefore(box, at.nextSibling); else m.insertBefore(box, m.firstChild);
    };
  });
})();
document.addEventListener('toggle', function(ev){ var d = ev.target; if(!d || !d.matches || !d.matches('details.ft-det')) return; UI.ftOpen = UI.ftOpen || {}; UI.ftOpen[d.getAttribute('data-ftp')] = d.open; }, true);

/* (c) packing proof photo — visible in Fulfilment when on: a pill per parcel and a line over the list */
if(typeof zx_docCol === 'function'){
  var zx_doc0 = zx_docCol;
  zx_docCol = function(o){
    var h = zx_doc0(o), c = ft('packPhoto'); if(!c.on) return h;
    var n = (o.packPhotos || 0), need = Math.max(1, +c.minPhotos || 1), done = n >= need;
    return h+' <button type="button" class="zo-pill ft-pp'+(done ? ' ok' : (c.mode === 'required' ? ' need' : ''))+'" data-act="ft-pack" data-id="'+esc(o.id)+'" data-testid="ft-pack">'+ico(done ? 'check' : 'camera',11)+
      (done ? 'Packing photo · '+n : 'Packing photo '+n+'/'+need+(c.mode === 'required' ? ' · needed' : ''))+'</button>';
  };
}
if(typeof zx_tabRun === 'function'){
  var zx_run0 = zx_tabRun;
  zx_tabRun = function(run, d){
    var h = zx_run0(run, d), c = ft('packPhoto'); if(!c.on) return h;
    var miss = run.filter(function(o){ return (o.packPhotos || 0) < Math.max(1, +c.minPhotos || 1); }).length;
    return '<div class="ft-line ft-ppline" data-testid="ft-packline">'+ico('camera',16)+'<span><b>Packing proof photo is on</b> — '+(c.mode === 'required' ? 'take '+esc(c.minPhotos)+' photo of each open parcel before it is sealed; a parcel without it is not handed to the courier.' : 'a photo of each open parcel is suggested before sealing.')+' Kept '+esc(c.keepDays)+' days. '+(miss ? '<b>'+miss+' parcel'+(miss === 1 ? '' : 's')+' still need a photo.</b>' : 'Every parcel has its photo.')+'</span></div>'+h;
  };
}
ACT['ft-pack'] = function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; o.packPhotos = (o.packPhotos || 0) + 1; saveState(); rerender(); toast('Packing photo saved for '+o.id+' (demo)'); };
