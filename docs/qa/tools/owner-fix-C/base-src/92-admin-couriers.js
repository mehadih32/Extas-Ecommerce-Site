/* =====================================================================
   92-admin-couriers.js — ভান্ডারী Bhandari A360-03 · Couriers (S08, PR 175–193, 525, 526, 550, 564)
   #/admin/couriers               overview: delivery bands + couriers + today
   #/admin/couriers?tab=parcels   auto-entry of a parcel from an order, tracking
   #/admin/couriers?tab=returns   refused / returned parcels, reasons, restock
   #/admin/couriers?tab=money     COD + courier-charge reconciliation, mismatch log
   #/admin/couriers?tab=accounts  courier accounts, API keys, the shop's rates
   RULES: the customer's delivery charge is the owner's band figure from
   SET('delivery') — it never depends on the courier (PR 550/178). The courier
   choice only changes the shop's own cost. A charge mismatch is recorded,
   nothing is changed and nobody is messaged (PR 564).
   DEMO: courier accounts, rates and the last-30-days parcels are simulated;
   bookings live in ST.ops.cour (this browser). Prefix zk_.
   ===================================================================== */
zo_route(/^\/admin\/couriers$/, 'zk-page');
zo_link(['Couriers','#/admin/couriers','truck','Couriers']);

var ZK_COURIERS = [
  {id:'steadfast', name:'Steadfast', rates:{in:60, sub:90, out:110}, codPct:1, ret:50, key:'SF-LIVE-7c21…', on:true},
  {id:'pathao', name:'Pathao', rates:{in:65, sub:80, out:115}, codPct:1, ret:55, key:'PT-9f02…', on:true},
  {id:'redx', name:'RedX', rates:{in:70, sub:85, out:105}, codPct:1, ret:50, key:'RX-31aa…', on:true},
  {id:'paperfly', name:'Paperfly', rates:{in:70, sub:95, out:120}, codPct:1, ret:60, key:'', on:false}
];
var ZK_FLOW = ['booked','picked','transit','delivered'];
var ZK_ST = {booked:['Booked','info','বুক হয়েছে'], picked:['Picked up','info','কুরিয়ার নিয়েছে'], transit:['On the way','info','পথে'], delivered:['Delivered','ok','পৌঁছেছে'], refused:['Refused','bad','নেয়নি'], returned:['Back at shop','warn','দোকানে ফেরত'], restocked:['Restocked','ok','স্টকে ফেরত']};
var ZK_REASONS = ["Didn't like it",'Size did not fit','Not as expected','Ordered by mistake','Not at home / phone off','Price too high'];

function zk_st(){
  var o = zo_ops();
  if(!o.cour) o.cour = {acc:{}, parcels:{}, pick:{in:'auto', sub:'auto', out:'auto'}, tested:{}};
  return o.cour;
}
function zk_c(id){
  var b = ZK_COURIERS.filter(function(c){ return c.id===id; })[0]; if(!b) return null;
  var ov = zk_st().acc[id] || {};
  var c = JSON.parse(JSON.stringify(b)); if(ov.rates) c.rates = Object.assign(c.rates, ov.rates); if(ov.on!=null) c.on = ov.on; if(ov.key!=null) c.key = ov.key;
  return c;
}
function zk_list(){ return ZK_COURIERS.map(function(c){ return zk_c(c.id); }); }
function zk_band(zone){ return typeof zoneEff==='function' ? zoneEff(zone||'out') : (zone||'out'); }
function zk_bandName(b){ return b==='in' ? 'Inside Dhaka city' : b==='sub' ? 'Dhaka sub-area' : 'Outside Dhaka'; }
function zk_bandBn(b){ return b==='in' ? 'ঢাকা সিটি' : b==='sub' ? 'ঢাকার আশেপাশে' : 'ঢাকার বাইরে'; }
function zk_charge(b){ return b==='in' ? SET('delivery','inside') : b==='sub' ? SET('delivery','sub') : SET('delivery','outside'); }
function zk_hours(b){ return b==='in' ? SET('delivery','insideHours') : b==='sub' ? SET('delivery','subHours') : SET('delivery','outsideHours'); }
/* PR 178: cheapest connected courier for the band (or the owner's fixed pick) */
function zk_pick(b){
  var p = zk_st().pick[b];
  if(p && p!=='auto'){ var c = zk_c(p); if(c && c.on) return c; }
  return zk_list().filter(function(c){ return c.on; }).sort(function(x, y){ return x.rates[b] - y.rates[b]; })[0] || null;
}
function zk_parcelOf(orderId){ var s = ST && ST.ops && ST.ops.cour; return s && s.parcels ? s.parcels[orderId] || null : null; }
function zk_orders(){ if(typeof ao_ensureDemo==='function') try{ ao_ensureDemo(); }catch(e){} return Object.keys(ST.orders||{}).map(function(k){ return ST.orders[k]; }).sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); }); }
function zk_cod(o){ return o.payment==='cod' ? (o.total||0) : 0; }
function zk_weight(o){ return Math.round((o.lines||[]).reduce(function(s,l){ var p = P(l.product), g = p ? ((CAT(p.cat)||{}).garment || p.garment) : ''; return s + (l.qty||1)*(/hoodie|puffer|jacket|sweat|track/.test(g||'') ? .7 : /trouser|jogger|panjabi/.test(g||'') ? .5 : .3); }, 0.1)*10)/10; }

/* ---------- simulated last 30 days (for returns + reconciliation) ---------- */
var ZK_HIST = null;
function zk_hist(){
  if(ZK_HIST) return ZK_HIST;
  var D = 86400000, now = Date.now(), out = [], names = ['Rakib','Nusrat','Farhan','Imran','Sadia','Tanvir','Mitu','Arif','Sumon','Joya','Hasan','Rumana'];
  for(var i=0;i<42;i++){
    var s = 'zk'+i, cid = ['steadfast','pathao','redx'][i%3], band = ['in','in','sub','out','out'][zo_rnd(s+'b',0,4)];
    var r = zs_rnd(s+'r'), st = (r<0.13 && i!==11 && i!==26) ? 'refused' : 'delivered', cod = [850,1500,1650,2200,1250,2450,990,1800][zo_rnd(s+'c',0,7)];
    var c = zk_c(cid), rate = c.rates[band], charged = rate + (i===5||i===17||i===30 ? 20 : i===22 ? 10 : 0);
    var trueRet = st==='delivered' && (i===11 || i===26);
    out.push({id:'H-'+(8100+i), courier:cid, band:band, name:names[i%names.length], at:now-(1+zo_rnd(s+'d',0,29))*D, cod:st==='refused'?0:cod, codDue:cod, st:st, rate:rate, charged:st==='refused'? c.ret : charged,
      reason: st==='refused' ? ZK_REASONS[zo_rnd(s+'x',0,ZK_REASONS.length-1)] : '', paid: zs_rnd(s+'p') > .18, trueRet:trueRet, sim:true,
      bandMismatch: i===8 || i===33 ? (band==='in' ? 'sub' : 'in') : ''});
  }
  ZK_HIST = out.sort(function(a,b){ return b.at - a.at; });
  return ZK_HIST;
}

/* ---------- page ---------- */
PAGES['zk-page'] = { layout:'admin', title:'Couriers', render:function(params, q){
  var tab = (q && q.tab) || 'overview', os = zk_orders(), s = zk_st();
  var toBook = os.filter(function(o){ return !s.parcels[o.id] && o.status!=='delivered'; }).length;
  var refusedLive = Object.keys(s.parcels).filter(function(k){ return s.parcels[k].st==='refused'; }).length;
  var tabs = zo_tabs('#/admin/couriers', [['overview','Overview'],['parcels','Parcels', toBook || ''],['returns','Returns & refused', refusedLive || ''],['money','Money check'],['accounts','Courier accounts']], tab);
  var body = tab==='parcels' ? zk_parcels(os) : tab==='returns' ? zk_returns(os) : tab==='money' ? zk_money() : tab==='accounts' ? zk_accounts() : zk_overview(os);
  return '<div class="zs-page zk-page">'+
    zo_head('Admin · Delivery '+zs_pr('175–193 · 525 · 550 · 564'), 'Couriers', 'কুরিয়ার — পার্সেল বুকিং, ট্র্যাকিং, ফেরত আর টাকার হিসাব',
      'অর্ডার থেকে এক চাপে পার্সেল কুরিয়ারে চলে যায় — নাম, ফোন, ঠিকানা, COD টাকা সব নিজে বসে। কাস্টমারের ডেলিভারি চার্জ আপনার ঠিক করা তিন ব্যান্ড থেকেই আসে, কোন কুরিয়ার সেটা কাস্টমারের দামে কিছু বদলায় না।',
      zs_simTag('Courier accounts simulated'))+tabs+body+'</div>';
}};
function zk_bandsCard(){
  var sub = SET('delivery','subMode');
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Three delivery bands</h2>'+zs_pr('550 · 551')+'</div>'+
    '<div class="zs-sub za-bn">কাস্টমার যা দেয় — ঠিকানা থেকে ব্যান্ড নিজে ঠিক হয়</div>'+
    '<div class="zk-bands">'+['in','sub','out'].map(function(b){ var pk = zk_pick(b), eff = zk_band(b);
      return '<div class="zk-band"><div class="zs-mini za-bn">'+zk_bandBn(b)+'</div><div class="small bold">'+zk_bandName(b)+'</div><div class="zk-bv">'+fmt(zk_charge(eff))+'</div>'+
        '<div class="zs-mini">'+esc(zk_hours(eff)||'')+' hours'+(b==='sub' && sub!=='own' ? ' · charged as '+(sub==='city'?'city':'outside') : '')+'</div>'+
        '<div class="zk-pk">'+ico('truck',13)+' '+(pk ? esc(pk.name)+' · costs us '+fmt(pk.rates[b]) : 'no courier on')+'</div></div>'; }).join('')+'</div>'+
    '<div class="zs-mini mt8">Free delivery over '+fmt(SET('delivery','freeOver'))+'. <a class="zs-link" href="#/admin/settings">Change charges and hours in Settings</a> — the shop, bag and checkout change at once.</div></section>';
}
function zk_overview(os){
  var s = zk_st(), ps = Object.keys(s.parcels).map(function(k){ return s.parcels[k]; });
  var h = zk_hist(), del = h.filter(function(x){ return x.st==='delivered'; }).length, ref = h.filter(function(x){ return x.st==='refused'; }).length;
  var codOpen = h.filter(function(x){ return x.st==='delivered' && !x.paid; }).reduce(function(a,x){ return a + x.cod - x.charged; }, 0);
  var toBook = os.filter(function(o){ return !s.parcels[o.id] && o.status!=='delivered'; });
  return '<div class="zs-kpis k4">'+
      '<div class="zs-k '+(toBook.length?'warn':'')+'"><div class="v">'+toBook.length+'</div><div class="l">Ready to book</div><div class="s">orders without a parcel</div></div>'+
      '<div class="zs-k"><div class="v">'+ps.filter(function(p){ return ['booked','picked','transit'].indexOf(p.st)>=0; }).length+'</div><div class="l">On the way</div><div class="s">booked in this demo</div></div>'+
      '<div class="zs-k ok"><div class="v">'+Math.round(del/Math.max(1,del+ref)*100)+'%</div><div class="l">Delivered (30 d)</div><div class="s">'+ref+' refused · simulated</div></div>'+
      '<div class="zs-k"><div class="v">'+fmt(codOpen)+'</div><div class="l">COD still with couriers</div><div class="s">not paid out yet</div></div>'+
    '</div>'+
    '<div class="zs-g2">'+zk_bandsCard()+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Couriers</h2>'+zs_pr('175–178')+'</div><div class="zs-sub za-bn">কোন ব্যান্ডে কোন কুরিয়ার সবচেয়ে কম খরচে — সেটা নিজে বাছে</div>'+
        zk_list().map(function(c){ var n = zk_hist().filter(function(x){ return x.courier===c.id; }), d = n.filter(function(x){ return x.st==='delivered'; }).length;
          return '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(c.name)+' <span class="zo-pill '+(c.on?'ok':'')+'">'+(c.on?'Connected':'Off')+'</span></div><div class="zs-mini">Costs us '+fmt(c.rates.in)+' / '+fmt(c.rates.sub)+' / '+fmt(c.rates.out)+(n.length?' · '+Math.round(d/n.length*100)+'% delivered':'')+'</div></div><a class="btn btn-sm btn-ghost" href="#/admin/couriers?tab=accounts">Settings</a></div>'; }).join('')+
        '<div class="zs-mini mt8">Courier picks the cheapest per band (PR 178). Rates are demo values — the real ones sync from each courier.</div></section>'+
    '</div>'+
    (toBook.length ? '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2>Ready to book</h2><a class="btn btn-sm btn-primary" href="#/admin/couriers?tab=parcels">'+ico('truck',14)+'Go to parcels</a></div>'+
      '<div class="zs-list mt8">'+toBook.slice(0,4).map(function(o){ return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(o.id)+' · '+esc(o.name)+'</div><div class="m">'+zk_bandName(zk_band(o.zone))+' · COD '+fmt(zk_cod(o))+'</div></div><div class="r"><button type="button" class="btn btn-sm btn-secondary" data-act="zk-book" data-id="'+o.id+'">Book parcel</button></div></div>'; }).join('')+'</div></section>' : '');
}
function zk_parcels(os){
  var s = zk_st();
  var ready = os.filter(function(o){ return !s.parcels[o.id] && o.status!=='delivered'; });
  var booked = os.filter(function(o){ return s.parcels[o.id]; });
  var done = os.filter(function(o){ return !s.parcels[o.id] && o.status==='delivered'; });
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Ready to book</h2>'+(ready.length>1 ? '<button type="button" class="btn btn-sm btn-primary" data-act="zk-bookall">'+ico('truck',14)+'Book all '+ready.length+'</button>' : zs_pr('176 · 179'))+'</div>'+
      '<div class="zs-sub za-bn">"Book parcel" চাপলে অর্ডার থেকে সব তথ্য কুরিয়ারের ফর্মে নিজে বসে যায় — আপনি শুধু দেখে কনফার্ম করবেন</div>'+
      (ready.length ? '<div class="zs-list">'+ready.map(function(o){ var b = zk_band(o.zone), pk = zk_pick(b);
        return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(o.id)+' · '+esc(o.name)+(o.flags && o.flags.length ? ' <span class="zo-pill warn">'+esc(o.flags[0])+'</span>' : '')+'</div><div class="m">'+zk_bandName(b)+' · COD '+fmt(zk_cod(o))+' · '+(pk?esc(pk.name):'no courier')+' · '+zk_weight(o)+' kg</div></div>'+
          '<div class="r"><button type="button" class="btn btn-sm btn-secondary" data-act="zk-book" data-id="'+o.id+'" data-testid="zk-book">'+ico('truck',14)+'Book parcel</button></div></div>'; }).join('')+'</div>' : '<div class="zs-mini">Nothing waiting — every open order has a parcel.</div>')+
    '</section>'+
    '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2>Booked parcels</h2>'+zs_pr('184')+'</div><div class="zs-sub za-bn">কুরিয়ারের স্ট্যাটাস নিজে আপডেট হয় — ডেমোতে "Next step" চেপে দেখুন</div>'+
      (booked.length ? booked.map(function(o){ return zk_parcelRow(o, s.parcels[o.id]); }).join('') : '<div class="zs-mini">No parcel booked yet in this demo.</div>')+
    '</section>'+
    (done.length ? '<section class="zs-card zo-mt"><h2>Delivered before this demo</h2><div class="zs-list mt8">'+done.map(function(o){ return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(o.id)+' · '+esc(o.name)+'</div><div class="m">'+esc(o.courier||'')+' · '+esc(o.tracking||'')+' · delivered '+(o.deliveredAt?dateStr(o.deliveredAt):'')+'</div></div><div class="r"><span class="zo-pill ok">Delivered</span></div></div>'; }).join('')+'</div></section>' : '');
}
function zk_parcelRow(o, p){
  var st = ZK_ST[p.st] || [p.st,''], i = ZK_FLOW.indexOf(p.st), c = zk_c(p.courier);
  var steps = '<div class="zk-steps">'+ZK_FLOW.map(function(f, j){ var on = p.st==='refused' || p.st==='returned' || p.st==='restocked' ? j<=2 : j<=i; return '<span class="'+(on?'on':'')+'">'+ZK_ST[f][0]+'</span>'; }).join('')+(p.st==='refused'||p.st==='returned'||p.st==='restocked' ? '<span class="bad on">'+st[0]+'</span>' : '')+'</div>';
  var acts = i>=0 && i<3 ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zk-next" data-id="'+o.id+'">Next step (demo)'+ico('right',13)+'</button>'+(i>=1 ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zk-refuse" data-id="'+o.id+'">Refused at door</button>' : '') : '';
  return '<div class="zk-par" data-testid="zk-parcel"><div class="zk-parh"><div style="min-width:0"><div class="small bold">'+esc(o.id)+' · '+esc(o.name)+' <span class="zo-pill '+st[1]+'">'+st[0]+'</span></div>'+
    '<div class="zs-mini">'+esc(c?c.name:p.courier)+' · '+esc(p.cid)+' · COD '+fmt(p.cod)+' · costs us '+fmt(p.charge)+'</div></div><button type="button" class="btn btn-sm btn-ghost" data-act="zk-sticker" data-id="'+o.id+'">'+ico('doc',14)+'Sticker</button></div>'+
    steps+(acts?'<div class="zs-actions mt8">'+acts+'</div>':'')+'</div>';
}
/* the auto-entry: everything comes from the order (order context → the address may show) */
function zk_entryHTML(o){
  var u = UI['zk-entry'] || {}, b = zk_band(o.zone), pk = u.courier ? zk_c(u.courier) : zk_pick(b), cod = zk_cod(o);
  return '<div class="zk-entry"><div class="zs-note mb12">'+ico('bolt',17)+'<div class="zs-bnp">সব তথ্য অর্ডার '+esc(o.id)+' থেকে নিজে বসেছে। ঠিক থাকলে "Book with '+esc(pk?pk.name:'courier')+'" চাপুন।</div></div>'+
    '<div class="zo-kv">'+
      '<span>Recipient</span><span>'+esc(o.name)+'</span>'+
      '<span>Phone</span><span>'+esc(o.phone)+'</span>'+
      '<span>Address</span><span class="zk-addr">'+esc(o.address)+'</span>'+
      '<span>Band</span><span>'+zk_bandName(b)+'</span>'+
      '<span>Cash to collect (COD)</span><span>'+fmt(cod)+(o.payment!=='cod'?' <span class="zs-mini">· paid by '+esc(o.payment)+'</span>':'')+'</span>'+
      '<span>Weight</span><span>'+zk_weight(o)+' kg</span>'+
      '<span>Items</span><span>'+(o.lines||[]).reduce(function(s,l){ return s + (l.qty||1); }, 0)+' pcs</span>'+
    '</div>'+
    '<div class="label mt12">Courier</div><div class="zs-pages">'+zk_list().filter(function(c){ return c.on; }).map(function(c){ var on = pk && pk.id===c.id; return '<button type="button" class="chip'+(on?' on':'')+'" data-act="zk-ecour" data-c="'+c.id+'">'+(on?ico('check',13):'')+esc(c.name)+' · '+fmt(c.rates[b])+'</button>'; }).join('')+'</div>'+
    '<div class="zs-mini mt8">'+(o.delivery ? 'The customer still pays '+fmt(o.delivery)+' delivery' : 'Free delivery for the customer (over '+fmt(SET('delivery','freeOver'))+')')+' — the courier only changes our cost (PR 178).</div>'+
    '<div class="zs-actions mt16"><button type="button" class="btn btn-primary" data-act="zk-confirm" data-id="'+o.id+'" data-testid="zk-confirm">'+ico('check',16)+'Book with '+esc(pk?pk.name:'courier')+'</button><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button></div></div>';
}
function zk_doBook(o, cid){
  var b = zk_band(o.zone), c = cid ? zk_c(cid) : zk_pick(b); if(!c) return null;
  var p = {courier:c.id, cid:(c.id==='steadfast'?'SF-':c.id==='pathao'?'PT-':c.id==='redx'?'RX-':'PF-')+(100000+zs_hash(o.id+c.id)%899999), st:'booked', at:Date.now(), cod:zk_cod(o), charge:c.rates[b], band:b, hist:[{s:'booked', at:Date.now()}]};
  zk_st().parcels[o.id] = p; return p;
}
ACT['zk-book'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; UI['zk-entry'] = {id:o.id, courier:null};
  openModal(zk_entryHTML(o), {title:'Courier entry · '+o.id, rebuild:function(){ return zk_entryHTML(o); }});
};
ACT['zk-ecour'] = function(el){ var u = UI['zk-entry']; if(!u) return; u.courier = el.getAttribute('data-c'); refreshModal(); };
ACT['zk-confirm'] = function(el){ var o = ST.orders[el.getAttribute('data-id')], u = UI['zk-entry'] || {}; if(!o) return; var p = zk_doBook(o, u.courier); closeModal(); saveState(); rerender(); if(p) toast('Booked with '+zk_c(p.courier).name+' · '+p.cid+' — SMS ② goes to the customer'); };
ACT['zk-bookall'] = function(){ var s = zk_st(), n = 0; zk_orders().forEach(function(o){ if(!s.parcels[o.id] && o.status!=='delivered'){ if(zk_doBook(o)) n++; } }); saveState(); rerender(); toast(n+' parcels booked with the cheapest courier per band'); };
ACT['zk-next'] = function(el){ var p = zk_st().parcels[el.getAttribute('data-id')]; if(!p) return; var i = ZK_FLOW.indexOf(p.st); if(i>=0 && i<3){ p.st = ZK_FLOW[i+1]; p.hist.push({s:p.st, at:Date.now()}); } saveState(); rerender(); toast('Tracking: '+ZK_ST[p.st][0]); };
ACT['zk-refuse'] = function(el){ var p = zk_st().parcels[el.getAttribute('data-id')]; if(!p) return; p.st = 'refused'; p.reason = ''; p.hist.push({s:'refused', at:Date.now()}); saveState(); rerender(); toast('Marked refused — see Returns & refused'); };
ACT['zk-sticker'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')], p = zk_parcelOf(o && o.id); if(!o || !p) return; var c = zk_c(p.courier);
  openModal('<div class="zk-stk"><div class="row between"><b class="logo" style="font-size:18px">EXTAS</b><b>'+esc(c.name)+'</b></div><div class="zk-bar" aria-hidden="true"></div><div class="mono small" style="text-align:center">'+esc(p.cid)+'</div>'+
    '<div class="zo-kv mt12"><span>To</span><span>'+esc(o.name)+'</span><span>Phone</span><span>'+esc(o.phone)+'</span><span>Address</span><span class="zk-addr">'+esc(o.address)+'</span><span>COD</span><span><b>'+fmt(p.cod)+'</b></span><span>Order</span><span>'+esc(o.id)+'</span></div>'+
    '<div class="zs-mini mt8">'+(o.lines||[]).map(function(l){ var pp = P(l.product); return esc((pp?pp.name:l.product)+' · '+COL(l.color).name+' · '+l.size+' × '+(l.qty||1)); }).join('<br>')+'</div>'+
    '<div class="zs-actions mt16"><button type="button" class="btn btn-primary" data-act="zk-print">'+ico('doc',15)+'Print sticker</button></div></div>', {title:'Courier sticker (PR 179)'});
};
ACT['zk-print'] = function(){ toast('Sticker sent to the printer (demo)'); closeModal(); };

/* ---------- returns ---------- */
function zk_returns(os){
  var s = zk_st();
  var live = os.filter(function(o){ var p = s.parcels[o.id]; return p && ['refused','returned','restocked'].indexOf(p.st)>=0; });
  var hist = zk_hist().filter(function(x){ return x.st==='refused'; });
  var reasons = {}; hist.forEach(function(x){ reasons[x.reason] = (reasons[x.reason]||0)+1; }); live.forEach(function(o){ var r = s.parcels[o.id].reason; if(r) reasons[r] = (reasons[r]||0)+1; });
  var rmax = Math.max.apply(null, [1].concat(Object.keys(reasons).map(function(k){ return reasons[k]; })));
  return '<div class="zs-g2"><section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Refused in this demo</h2>'+zs_pr('189 · 191 · 526')+'</div><div class="zs-sub za-bn">রাইডার কী কারণ লিখেছে সেটা দিন — কাস্টমারের হিস্ট্রিতে যায়; পার্সেল ফিরলে QC করে স্টকে তুলুন</div>'+
      (live.length ? live.map(function(o){ var p = s.parcels[o.id], st = ZK_ST[p.st];
        return '<div class="zk-par"><div class="zk-parh"><div style="min-width:0"><div class="small bold">'+esc(o.id)+' · '+esc(o.name)+' <span class="zo-pill '+st[1]+'">'+st[0]+'</span></div><div class="zs-mini">'+esc(zk_c(p.courier).name)+' · return charge '+fmt(zk_c(p.courier).ret)+'</div></div></div>'+
          '<div class="zk-why"><select class="input zs-in" data-change="zk-reason" data-id="'+o.id+'" aria-label="Refusal reason"><option value="">Rider\'s reason…</option>'+ZK_REASONS.map(function(r){ return '<option'+(p.reason===r?' selected':'')+'>'+esc(r)+'</option>'; }).join('')+'</select>'+
          (p.st==='refused' ? '<button type="button" class="btn btn-sm btn-secondary" data-act="zk-back" data-id="'+o.id+'">Parcel is back</button>' : p.st==='returned' ? '<button type="button" class="btn btn-sm btn-primary" data-act="zk-restock" data-id="'+o.id+'">QC ok → restock</button>' : '<span class="zo-pill ok">'+ico('check',11)+'Back in stock</span>')+'</div></div>'; }).join('')
        : '<div class="zs-mini">None yet. In Parcels, a parcel on the way can be marked “Refused at door”.</div>')+
    '</section>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Why parcels come back</h2>'+zs_simTag('Last 30 days simulated')+'</div><div class="zs-sub za-bn">গত ৩০ দিনে '+zs_bnNum(hist.length)+'টা পার্সেল নেয়নি</div>'+
      Object.keys(reasons).sort(function(a,b){ return reasons[b]-reasons[a]; }).map(function(k){ return '<div class="zs-rep-g"><span class="small">'+esc(k)+'</span><b class="small">'+reasons[k]+'</b>'+zs_bar(reasons[k]/rmax*100, 'warn')+'</div>'; }).join('')+
      '<div class="zs-note mt12">'+ico('shield',17)+'<div class="zs-bnp small">যারা পার্সেল নেয়নি তাদের ফোন নম্বর (হ্যাশ করে) অ্যাড প্ল্যাটফর্মে বাদ-তালিকায় যায় — তাদের আর অ্যাড দেখানো হয় না। কাউকে অর্ডার থেকে ব্লক করা হয় না। <a class="zs-link" href="#/admin/ads?tab=delivered">Ads</a> · <a class="zs-link" href="#/admin/customers">Customers</a></div></div>'+
    '</section></div>'+
    '<section class="zs-card zo-mt"><h2>Refused parcels · last 30 days</h2><div class="zo-tw mt8"><table class="zo-tbl"><thead><tr><th>Parcel</th><th>Courier</th><th>Band</th><th>COD lost</th><th>Return charge</th><th>Reason</th></tr></thead><tbody>'+
      hist.map(function(x){ return '<tr><td>'+esc(x.id)+' · '+esc(x.name)+'<div class="zs-mini">'+dateStr(x.at)+'</div></td><td>'+esc(zk_c(x.courier).name)+'</td><td>'+zk_bandName(x.band)+'</td><td>'+fmt(x.codDue)+'</td><td class="bad">'+fmt(x.charged)+'</td><td>'+esc(x.reason)+'</td></tr>'; }).join('')+'</tbody></table></div></section>';
}
CHANGE['zk-reason'] = function(el){ var p = zk_st().parcels[el.getAttribute('data-id')]; if(!p) return; p.reason = el.value; saveState(); toast('Reason saved to the customer\'s history'); };
ACT['zk-back'] = function(el){ var p = zk_st().parcels[el.getAttribute('data-id')]; if(!p) return; p.st = 'returned'; p.hist.push({s:'returned', at:Date.now()}); saveState(); rerender(); toast('Parcel back at the shop — check it, then restock'); };
ACT['zk-restock'] = function(el){ var p = zk_st().parcels[el.getAttribute('data-id')]; if(!p) return; p.st = 'restocked'; p.hist.push({s:'restocked', at:Date.now()}); saveState(); rerender(); toast('Back in stock (demo — the ERP gets the stock movement in the full build)'); };

/* ---------- money check (reconciliation) ---------- */
function zk_money(){
  var h = zk_hist(), s = zk_st();
  var live = Object.keys(s.parcels).map(function(k){ var p = s.parcels[k]; return p.st==='delivered' ? {id:k, courier:p.courier, band:p.band, cod:p.cod, codDue:p.cod, st:'delivered', rate:p.charge, charged:p.charge, paid:false, at:p.at} : null; }).filter(Boolean);
  var all = h.concat(live);
  var rows = zk_list().filter(function(c){ return all.some(function(x){ return x.courier===c.id; }); }).map(function(c){
    var mine = all.filter(function(x){ return x.courier===c.id; });
    var cod = mine.reduce(function(a,x){ return a + x.cod; }, 0), exp = mine.reduce(function(a,x){ return a + (x.st==='refused' ? c.ret : x.rate); }, 0), chg = mine.reduce(function(a,x){ return a + x.charged; }, 0);
    var fee = mine.reduce(function(a,x){ return a + Math.round(x.cod*c.codPct/100); }, 0), pay = cod - chg - fee, paid = mine.filter(function(x){ return x.paid; }).reduce(function(a,x){ return a + x.cod - x.charged - Math.round(x.cod*c.codPct/100); }, 0);
    return {c:c, n:mine.length, cod:cod, exp:exp, chg:chg, fee:fee, pay:pay, paid:paid, diff:chg-exp};
  });
  var T = rows.reduce(function(a,r){ ['n','cod','exp','chg','fee','pay','paid','diff'].forEach(function(k){ a[k] = (a[k]||0) + r[k]; }); return a; }, {});
  var mism = h.filter(function(x){ return x.st==='delivered' && x.charged!==x.rate; });
  var bandMis = h.filter(function(x){ return x.bandMismatch; });
  var trueRet = h.filter(function(x){ return x.trueRet; });
  return '<div class="zs-kpis k4">'+
      '<div class="zs-k"><div class="v">'+fmt(T.cod)+'</div><div class="l">COD collected</div><div class="s">'+T.n+' parcels · 30 days</div></div>'+
      '<div class="zs-k"><div class="v">'+fmt(T.chg)+'</div><div class="l">Courier charges</div><div class="s">we expected '+fmt(T.exp)+'</div></div>'+
      '<div class="zs-k ok"><div class="v">'+fmt(T.paid)+'</div><div class="l">Paid out to us</div><div class="s">of '+fmt(T.pay)+' due</div></div>'+
      '<div class="zs-k '+(T.diff>0?'bad':'')+'"><div class="v">'+fmt(T.diff)+'</div><div class="l">Charged above rate</div><div class="s">'+mism.length+' parcels</div></div>'+
    '</div>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Courier by courier</h2><span class="row" style="gap:6px">'+zs_pr('166 · 174 · 525')+zs_simTag()+'</span></div><div class="zs-sub za-bn">কুরিয়ার কত টাকা তুলেছে, কত কেটেছে, কত দিয়েছে — আর কত বাকি</div>'+
      '<div class="zo-tw"><table class="zo-tbl"><thead><tr><th>Courier</th><th>Parcels</th><th>COD collected</th><th>Charge expected</th><th>Charged</th><th>COD fee</th><th>Due to us</th><th>Paid</th><th>Still due</th></tr></thead><tbody>'+
      rows.map(function(r){ return '<tr><td><b>'+esc(r.c.name)+'</b></td><td>'+r.n+'</td><td>'+fmt(r.cod)+'</td><td>'+fmt(r.exp)+'</td><td class="'+(r.diff>0?'bad':'')+'">'+fmt(r.chg)+'</td><td>'+fmt(r.fee)+'</td><td>'+fmt(r.pay)+'</td><td class="ok">'+fmt(r.paid)+'</td><td>'+fmt(r.pay-r.paid)+'</td></tr>'; }).join('')+
      '<tr class="tot"><td>Total</td><td>'+T.n+'</td><td>'+fmt(T.cod)+'</td><td>'+fmt(T.exp)+'</td><td>'+fmt(T.chg)+'</td><td>'+fmt(T.fee)+'</td><td>'+fmt(T.pay)+'</td><td>'+fmt(T.paid)+'</td><td>'+fmt(T.pay-T.paid)+'</td></tr></tbody></table></div></section>'+
    '<div class="zs-g2 zo-mt">'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Charged above our rate</h2>'+zs_pr('174')+'</div><div class="zs-sub za-bn">কুরিয়ার চুক্তির চেয়ে বেশি কেটেছে — ক্লেইম করার জন্য</div>'+
        (mism.length ? '<div class="zs-list">'+mism.map(function(x){ var k = s.claim && s.claim[x.id]; return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(x.id)+' · '+esc(zk_c(x.courier).name)+'</div><div class="m">'+zk_bandName(x.band)+' · rate '+fmt(x.rate)+' · charged '+fmt(x.charged)+' (+'+fmt(x.charged-x.rate)+')</div></div><div class="r">'+(k ? '<span class="zo-pill info">Claim sent</span>' : '<button type="button" class="btn btn-sm btn-ghost" data-act="zk-claim" data-id="'+x.id+'">Send claim</button>')+'</div></div>'; }).join('')+'</div>' : '<div class="zs-mini">None.</div>')+'</section>'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Band mismatch log</h2>'+zs_pr('564')+'</div><div class="zs-sub za-bn">কুরিয়ার অন্য এলাকা ধরেছে — কিছু বদলানো হয় না, কাউকে মেসেজ যায় না, শুধু লেখা থাকে</div>'+
        (bandMis.length ? '<div class="zs-list">'+bandMis.map(function(x){ return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(x.id)+'</div><div class="m">Customer paid '+zk_bandName(x.band)+' · courier read '+zk_bandName(x.bandMismatch)+' · gap '+fmt(Math.abs(zk_charge(x.band)-zk_charge(x.bandMismatch)))+'</div></div></div>'; }).join('')+'</div>' : '<div class="zs-mini">None.</div>')+
        '<div class="zs-mini mt8">'+bandMis.length+' cases this month · '+fmt(bandMis.reduce(function(a,x){ return a + Math.abs(zk_charge(x.band)-zk_charge(x.bandMismatch)); }, 0))+' in all.</div></section>'+
      '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>“Delivered” but came back</h2>'+zs_pr('525')+'</div><div class="zs-sub za-bn">কুরিয়ার "Delivered" দেখিয়েছে, কিন্তু চার্জ দিয়ে ফেরত এসেছে — আসল ডেলিভারি না</div>'+
        (trueRet.length ? '<div class="zs-list">'+trueRet.map(function(x){ return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(x.id)+' · '+esc(zk_c(x.courier).name)+'</div><div class="m">Counted as a refusal in the customer\'s history, not a delivery</div></div><div class="r"><span class="zo-pill warn">Not a true delivery</span></div></div>'; }).join('')+'</div>' : '<div class="zs-mini">None.</div>')+'</section>'+
    '</div>';
}
ACT['zk-claim'] = function(el){ var s = zk_st(); s.claim = s.claim || {}; s.claim[el.getAttribute('data-id')] = Date.now(); saveState(); rerender(); toast('Claim sent to the courier (demo)'); };

/* ---------- accounts ---------- */
function zk_accounts(){
  var s = zk_st();
  return '<section class="zs-card mb16"><div class="row between wrap" style="gap:8px"><h2>Which courier per band</h2>'+zs_pr('178')+'</div><div class="zs-sub za-bn">"Cheapest" দিলে প্রতিটা পার্সেলে সবচেয়ে কম খরচের কুরিয়ার নিজে বাছবে</div>'+
      '<div class="zk-bands">'+['in','sub','out'].map(function(b){ var cur = s.pick[b]||'auto';
        return '<div class="zk-band"><div class="small bold">'+zk_bandName(b)+'</div><select class="input zs-in mt8" data-change="zk-pick" data-b="'+b+'" aria-label="Courier for '+zk_bandName(b)+'"><option value="auto"'+(cur==='auto'?' selected':'')+'>Cheapest (now '+esc((zk_pick(b)||{}).name||'—')+')</option>'+
          zk_list().filter(function(c){ return c.on; }).map(function(c){ return '<option value="'+c.id+'"'+(cur===c.id?' selected':'')+'>'+esc(c.name)+' · '+fmt(c.rates[b])+'</option>'; }).join('')+'</select></div>'; }).join('')+'</div></section>'+
    '<div class="zs-g3">'+zk_list().map(function(c){ var t = s.tested[c.id];
      return '<section class="zs-card zk-acc'+(c.on?'':' off')+'"><div class="row between" style="gap:8px"><h2>'+esc(c.name)+'</h2>'+zs_sw(c.on, 'zk-on', c.name+' on or off', 'data-id="'+c.id+'"')+'</div>'+
        '<div class="zs-sub">'+(c.on?'Connected · demo account':'Not connected')+'</div>'+
        '<div class="zp-f"><label class="label" for="zk-key-'+c.id+'">API key</label><input id="zk-key-'+c.id+'" class="input zs-in" type="password" value="'+esc(c.key)+'" placeholder="Paste the key from '+esc(c.name)+'" data-change="zk-key" data-id="'+c.id+'" autocomplete="off"><div class="zs-mini mt8">'+ico('lock',11)+' Kept in the credential vault (PR 493), never shown again.</div></div>'+
        '<div class="small bold mb8">What it costs us (৳)</div><div class="zk-rates">'+['in','sub','out'].map(function(b){ return '<label class="zp-sk"><span>'+(b==='in'?'City':b==='sub'?'Sub-area':'Outside')+'</span><input class="input zs-in" type="number" inputmode="numeric" min="0" step="5" value="'+c.rates[b]+'" data-change="zk-rate" data-id="'+c.id+'" data-b="'+b+'" aria-label="'+esc(c.name)+' rate '+b+'"></label>'; }).join('')+'</div>'+
        '<div class="zs-mini mt8">COD fee '+c.codPct+'% · return '+fmt(c.ret)+'</div>'+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zk-test" data-id="'+c.id+'">'+ico('link',14)+'Test connection</button>'+(t?'<span class="zs-mini">OK · '+esc(zs_time(t))+'</span>':'')+'</div></section>'; }).join('')+'</div>';
}
function zk_acc(id){ var s = zk_st(); s.acc[id] = s.acc[id] || {}; return s.acc[id]; }
ACT['zk-on'] = function(el){ var id = el.getAttribute('data-id'), c = zk_c(id); zk_acc(id).on = !c.on; saveState(); rerender(); toast(c.name+(c.on?' turned off':' turned on')); };
CHANGE['zk-key'] = function(el){ zk_acc(el.getAttribute('data-id')).key = el.value ? el.value.slice(0,6)+'…' : ''; saveState(); toast('Key saved (demo — masked)'); };
CHANGE['zk-rate'] = function(el){ var a = zk_acc(el.getAttribute('data-id')); a.rates = a.rates || {}; a.rates[el.getAttribute('data-b')] = Math.max(0, zo_int(el.value)); ZK_HIST = null; saveState(); rerender(); toast('Rate saved — the customer\'s charge does not change'); };
CHANGE['zk-pick'] = function(el){ zk_st().pick[el.getAttribute('data-b')] = el.value; saveState(); rerender(); toast('Saved — new parcels follow this'); };
ACT['zk-test'] = function(el){ var id = el.getAttribute('data-id'), c = zk_c(id); if(!c.on || !c.key){ toast(c.name+': add the API key and turn it on first'); return; } zk_st().tested[id] = Date.now(); saveState(); rerender(); toast(c.name+' answered — connection OK (demo)'); };
