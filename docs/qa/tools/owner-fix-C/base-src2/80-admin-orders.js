/* ================= 80-admin-orders.js — owner: orders with flags  #/admin, #/admin/orders ================= */
(function(){
  if(document.getElementById('ao-css')) return;
  var s = document.createElement('style'); s.id = 'ao-css';
  s.textContent = [
    '.ao-hd{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:18px}',
    '.ao-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:18px}',
    '@media(min-width:1024px){.ao-kpis{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}}',
    '.ao-kpi{background:#fff;border:1px solid #E6E3DE;border-radius:8px;padding:14px 16px;text-align:left;cursor:pointer;font:inherit;color:#171715}',
    '.ao-kpi.on{border-color:#1F4E46;box-shadow:inset 0 0 0 1px #1F4E46}',
    '.ao-kpi .v{font-family:"Archivo",sans-serif;font-size:26px;font-weight:800;line-height:1.1;margin-top:4px}',
    '.ao-kpi .l{font-size:12.5px;font-weight:600;color:#54504A;display:flex;align-items:center;gap:6px}',
    '.ao-kpi.warn .v{color:#8A5A1E}',
    '.ao-tbl{width:100%;border-collapse:collapse;font-size:13px;background:#fff}',
    '.ao-tbl th{text-align:left;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:#6E675E;font-weight:600;padding:11px 10px;background:#FAFAF8;border-bottom:1px solid #E6E3DE;white-space:nowrap}',
    '.ao-tbl td{padding:12px 10px;border-bottom:1px solid #EFEDE8;vertical-align:top}',
    '.ao-tbl tbody tr{cursor:pointer}',
    '.ao-tbl tbody tr:hover td{background:#F7F6F3}',
    '.ao-tbl .num{text-align:right;white-space:nowrap}',
    '.ao-idbtn{background:none;border:0;padding:0;font:inherit;font-weight:700;color:#1F4E46;cursor:pointer;text-decoration:underline;text-underline-offset:2px}',
    '.ao-flags{display:flex;flex-wrap:wrap;gap:4px}',
    '.ao-cards{display:grid;gap:10px}',
    '.ao-card{display:block;width:100%;text-align:left;background:#fff;border:1px solid #E6E3DE;border-radius:8px;padding:14px;cursor:pointer;font:inherit;color:#171715}',
    '.ao-flag{border:1px solid #EAD9BC;background:#FBF6EC;border-radius:8px;padding:14px;margin-top:10px}',
    '.ao-flag.ok{border-color:#D5E1DC;background:#EEF3F1}',
    '.ao-script{font-size:14px;font-weight:600;padding:10px 12px;background:#fff;border-left:3px solid #1F4E46;border-radius:2px;margin-top:8px}',
    '.ao-wa{background:#E9E4DA;border-radius:8px;padding:12px;margin-top:10px}',
    '.ao-bubble{background:#fff;border-radius:2px 10px 10px 10px;padding:10px 12px;font-size:13.5px;max-width:420px;box-shadow:0 1px 1px rgba(0,0,0,.08)}',
    '.ao-qr{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;max-width:420px}',
    '.ao-qr span{flex:1;text-align:center;background:#fff;border-radius:8px;padding:7px 8px;font-size:12.5px;font-weight:600;color:#1F6E8C;box-shadow:0 1px 1px rgba(0,0,0,.08)}',
    '.ao-line{display:flex;gap:12px;align-items:center;padding:10px 0;border-top:1px solid #EFEDE8}',
    '.ao-line:first-child{border-top:0}',
    '.ao-mgrid{display:grid;gap:18px}',
    '@media(min-width:768px){.ao-mgrid{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr)}}',
    '@media(max-width:767px){.ao-fcol{order:-1}}',
    '.ao-sec{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#6E675E;margin-bottom:8px}',
    '.ao-desk{display:none}@media(min-width:1024px){.ao-desk{display:block}}',
    '.ao-actions{display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #EFEDE8;padding-top:16px;margin-top:18px}'
  ].join('\n');
  document.head.appendChild(s);
})();

var AO_STATUS = {confirmed:'To confirm', packed:'Packed', shipped:'With courier', delivered:'Delivered'};
var AO_PAY = {cod:'COD', bkash:'bKash', nagad:'Nagad', card:'Card'};

/* sample orders so the owner sees every kind of flag (added once; Reset demo data brings them back) */
function ao_ensureDemo(){
  if(ST.aoDemo) return; ST.aoDemo = true;
  var now = Date.now(), H = 3600000, D = 24*H;
  function mk(o){
    if(ST.orders[o.id]) return;
    var sub = 0; o.lines.forEach(function(l){ sub += l.unitPrice*l.qty; });
    o.subtotal = sub; o.discount = o.discount||0; o.setDiscounts = o.setDiscounts||[];
    var items = sub - o.discount; o.delivery = deliveryCharge(o.zone, items); o.total = items + o.delivery;
    var idx = STATUS_FLOW.indexOf(o.status);
    o.timeline = STATUS_FLOW.slice(0, idx+1).map(function(s, i){ return {s:s, at:(s==='delivered' && o.deliveredAt) ? o.deliveredAt : o.createdAt + i*5*H}; });
    o.deliveredAt = o.deliveredAt || null; o.edits = 0; o.reviewed = {}; o.exchanges = o.exchanges||[]; o.addOns = []; o.note = ''; o.offersOptIn = false;
    o.courier = o.zone==='in' ? 'Steadfast' : 'Pathao'; o.tracking = (o.zone==='in'?'SF-':'PT-')+(300000+Math.floor(Math.random()*600000));
    o.source = o.source || 'website';
    ST.orders[o.id] = o;
  }
  mk({id:'EX-1042', name:'Arif Rahman', phone:'01812345671', address:'Flat 4B, Shanti Niketan, beside the big mosque', zone:'out', flags:['Address check'], status:'confirmed', payment:'cod', createdAt:now-40*60000, source:'landing:polo-duo',
      lines:[{product:'essential-pique-polo', color:'navy', size:'M', qty:1, unitPrice:850, setLabel:'Polo Duo'},{product:'essential-pique-polo', color:'white', size:'M', qty:1, unitPrice:850, setLabel:'Polo Duo'}]});
  mk({id:'EX-1041', name:'Mahmud Hasan', phone:'0171234567', address:'House 7, Road 11, Banani, Dhaka', zone:'in', flags:['2 sizes — check','Phone check'], status:'confirmed', payment:'bkash', createdAt:now-2*H-15*60000,
      lines:[{product:'essential-pique-polo', color:'black', size:'L', qty:1, unitPrice:850},{product:'essential-pique-polo', color:'black', size:'XL', qty:1, unitPrice:850}],
      discount:200, setDiscounts:[{label:'Polo Duo set price', amount:200, auto:true, combo:'polo-duo'}]});
  mk({id:'EX-1040', name:'Sabbir Rahman', phone:'01912345670', address:'Agrabad C/A, Chattogram', zone:'out', flags:[], status:'packed', payment:'cod', createdAt:now-26*H, source:'landing:winter-hoodie',
      lines:[{product:'heavyweight-hoodie', color:'black', size:'L', qty:1, unitPrice:1650}]});
  mk({id:'EX-1039', name:'Tanvir Ahmed', phone:'01612345679', address:'Road 3, Dhanmondi, Dhaka', zone:'in', flags:[], status:'delivered', payment:'nagad', createdAt:now-4*D, deliveredAt:now-22*H,
      lines:[{product:'oxford-cotton-shirt', color:'sky', size:'M', qty:1, unitPrice:1250}],
      exchanges:[{lineIdx:0, from:'M', size:'L', reason:'small', status:'requested', at:now-3*H}]});
  saveState();
}

/* ---------- helpers ---------- */
function ao_list(){ return Object.keys(ST.orders).map(function(k){ return ST.orders[k]; }).sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); }); }
function ao_hasEx(o){ return (o.exchanges||[]).length > 0; }
function ao_flags(o){ var f = (o.flags||[]).slice(); if(ao_hasEx(o) && !o.aoExCleared && f.indexOf('Exchange requested')<0) f.push('Exchange requested'); return f; }
function ao_items(o){ return (o.lines||[]).reduce(function(s,l){ return s + (l.qty||1); }, 0); }
function ao_today(ts){ return new Date(ts).toDateString() === new Date().toDateString(); }
function ao_when(ts){
  var d = new Date(ts), t = d.toLocaleTimeString('en-US',{hour:'numeric', minute:'2-digit'}).toLowerCase();
  if(ao_today(ts)) return 'Today, '+t;
  var y = new Date(); y.setDate(y.getDate()-1); if(d.toDateString()===y.toDateString()) return 'Yesterday, '+t;
  return dateStr(ts);
}
function ao_src(o){ var s = o.source||'website'; if(s.indexOf('landing:')===0) return 'Ad page · '+s.slice(8); return s==='website' ? 'Website' : s; }
function ao_phone(o){ var r = checkPhone(o.phone); return r.state==='ok' ? r.nice : String(o.phone||''); }
function ao_statusTag(o){
  var s = o.status, l = AO_STATUS[s] || s;
  if(s==='confirmed') return '<span class="tag warn">'+esc(l)+'</span>';
  if(s==='delivered') return '<span class="tag">'+ico('check',12)+esc(l)+'</span>';
  if(s==='shipped') return '<span class="tag plain">'+ico('truck',12)+esc(l)+'</span>';
  return '<span class="tag plain">'+esc(l)+'</span>';
}
function ao_flagTags(o){ var f = ao_flags(o); if(!f.length) return '<span class="xs muted">—</span>'; return '<span class="ao-flags">'+f.map(function(x){ return '<span class="tag warn">'+esc(x)+'</span>'; }).join('')+'</span>'; }
function ao_zone(o){ return zoneName(o.zone); }
function ao_match(o, f){
  if(f==='today') return ao_today(o.createdAt);
  if(f==='flagged') return ao_flags(o).length>0;
  if(f==='confirm') return o.status==='confirmed';
  if(f==='delivered') return o.status==='delivered';
  if(f==='exchange') return ao_hasEx(o);
  return true;
}
function ao_pair(o){
  var L = o.lines||[];
  for(var i=0;i<L.length;i++) for(var j=i+1;j<L.length;j++){
    var a = L[i], b = L[j]; if(a.product!==b.product || a.color!==b.color) continue;
    var p = P(a.product); if(!p) continue; var ia = p.sizes.indexOf(a.size), ib = p.sizes.indexOf(b.size);
    if(Math.abs(ia-ib)===1) return ia<ib ? {i:i, j:j, p:p, color:a.color, sizes:[a.size, b.size]} : {i:j, j:i, p:p, color:a.color, sizes:[b.size, a.size]};
  }
  return null;
}
function ao_waHref(o, text){ var d = String(o.phone||'').replace(/\D/g,''); if(d.indexOf('0')===0) d = '88'+d; return 'https://wa.me/'+d+'?text='+encodeURIComponent(text); }
function ao_waBtn(o, label, text){ return '<a class="wa-btn" href="'+ao_waHref(o, text)+'" target="_blank" rel="noopener">'+ico('chat',17)+esc(label)+'</a>'; }
function ao_first(o){ return String(o.name||'').split(' ')[0] || 'there'; }
function ao_recalc(o){ var items = o.subtotal - o.discount; o.delivery = deliveryCharge(o.zone, items); o.total = items + o.delivery; }

/* ---------- page ---------- */
PAGES['admin-orders'] = {
  layout:'admin',
  title:'Orders',
  render:function(){
    ao_ensureDemo();
    var u = ui('admin-orders', {filter:'all'});
    var all = ao_list();
    var today = all.filter(function(o){ return ao_today(o.createdAt); });
    var todaySales = today.reduce(function(s,o){ return s + (o.total||0); }, 0);
    var counts = {all:all.length};
    ['today','flagged','confirm','delivered','exchange'].forEach(function(f){ counts[f] = all.filter(function(o){ return ao_match(o,f); }).length; });
    var kpi = function(f, label, v, sub, icon, warn){ return '<button class="ao-kpi'+(warn&&v?' warn':'')+(u.filter===f?' on':'')+'" data-act="ao-filter" data-f="'+f+'"><div class="l">'+ico(icon,15)+esc(label)+'</div><div class="v">'+v+'</div><div class="xs muted">'+sub+'</div></button>'; };
    var html = '<div class="ao-hd"><div><h1 class="h1">Orders</h1><div class="small text2" style="margin-top:4px;max-width:640px">Flags show which orders need a quick check before they go to the courier. Click an order to see what to do.</div></div>'+
      '<a class="btn btn-sm btn-ghost" href="#/l/polo-duo" style="background:#fff">'+ico('eye',16)+'Open an ad landing page</a></div>';
    html += '<div class="ao-kpis">'+
      kpi('today','Orders today', today.length, fmt(todaySales)+' in sales', 'box') +
      kpi('confirm','Waiting to confirm', counts.confirm, 'Call or WhatsApp, then pack', 'clock', true) +
      kpi('flagged','Flagged', counts.flagged, 'Need a quick check', 'info', true) +
      kpi('exchange','Exchanges requested', counts.exchange, 'Size exchange from My account', 'swap', true) +
    '</div>';
    var chips = [['all','All'],['flagged','Flagged'],['confirm','To confirm'],['delivered','Delivered'],['exchange','Exchange']];
    html += '<div class="row wrap mb16" style="gap:8px" role="group" aria-label="Filter orders">'+chips.map(function(c){ return '<button class="chip'+(u.filter===c[0]?' on':'')+'" data-act="ao-filter" data-f="'+c[0]+'" aria-pressed="'+(u.filter===c[0])+'">'+c[1]+' <span style="opacity:.7">'+counts[c[0]]+'</span></button>'; }).join('')+'</div>';
    var list = all.filter(function(o){ return ao_match(o, u.filter); });
    if(u.filter==='today') html += '<div class="xs muted mb12">Showing today\'s orders · <button class="link" data-act="ao-filter" data-f="all">Show all</button></div>';
    if(!list.length){ return html + '<div class="card empty">No orders here right now.</div>'; }
    /* desktop table */
    html += '<div class="tbl-wrap ao-desk" style="background:#fff;border-radius:8px"><table class="ao-tbl"><thead><tr>'+
      '<th>Order</th><th>Date</th><th>Customer</th><th>Phone</th><th>Area</th><th class="num">Items</th><th class="num">Total</th><th>Payment</th><th>Status</th><th>Flags</th></tr></thead><tbody>'+
      list.map(function(o){
        return '<tr data-act="ao-open" data-id="'+o.id+'"><td><button class="ao-idbtn" data-act="ao-open" data-id="'+o.id+'">'+esc(o.id)+'</button><div class="xs muted" style="margin-top:2px">'+esc(ao_src(o))+'</div></td>'+
          '<td style="white-space:nowrap">'+esc(ao_when(o.createdAt))+'</td><td class="bold">'+esc(o.name)+'</td>'+
          '<td style="white-space:nowrap">'+esc(ao_phone(o))+'</td><td style="white-space:nowrap">'+ao_zone(o)+'</td>'+
          '<td class="num">'+ao_items(o)+'</td><td class="num bold">'+fmt(o.total)+'</td><td>'+(AO_PAY[o.payment]||esc(o.payment))+'</td>'+
          '<td>'+ao_statusTag(o)+'</td><td>'+ao_flagTags(o)+'</td></tr>';
      }).join('')+'</tbody></table></div>';
    /* phone cards */
    html += '<div class="ao-cards hide-d">'+list.map(function(o){
      return '<button class="ao-card" data-act="ao-open" data-id="'+o.id+'"><div class="row between"><span class="bold">'+esc(o.id)+' <span class="xs muted" style="font-weight:400">· '+esc(ao_when(o.createdAt))+'</span></span>'+ao_statusTag(o)+'</div>'+
        '<div class="small mt8"><b>'+esc(o.name)+'</b> · '+esc(ao_phone(o))+'</div>'+
        '<div class="xs text2" style="margin-top:3px">'+ao_zone(o)+' · '+plural(ao_items(o),'item')+' · <b>'+fmt(o.total)+'</b> · '+(AO_PAY[o.payment]||'')+' · '+esc(ao_src(o))+'</div>'+
        (ao_flags(o).length?'<div class="mt8">'+ao_flagTags(o)+'</div>':'')+'</button>';
    }).join('')+'</div>';
    return html;
  }
};

/* ---------- order modal ---------- */
function ao_flagBlock(o, f){
  var clear = '<button class="btn btn-sm btn-ghost" data-act="ao-clear" data-id="'+o.id+'" data-flag="'+esc(f)+'" style="background:#fff">'+ico('check',15)+'Clear flag</button>';
  var head = function(title, icon){ return '<div class="row between" style="gap:8px"><span class="row bold small" style="gap:7px;color:#8A5A1E">'+ico(icon||'info',17)+esc(title)+'</span></div>'; };
  if(f==='2 sizes — check'){
    var pr = ao_pair(o);
    if(!pr) return '<div class="ao-flag">'+head(f)+'<div class="small mt8">Two neighbouring sizes of the same item. Ask the customer which one to keep.</div><div class="row wrap mt12">'+clear+'</div></div>';
    var item = pr.p.name+' ('+COL(pr.color).name+')', a = pr.sizes[0], b = pr.sizes[1];
    var waText = 'Hi '+ao_first(o)+', this is EXTAS. You ordered '+item+' in '+a+' and '+b+'. Do you want to keep both, or only one?\nReply 1 = Keep both · 2 = Only '+a+' · 3 = Only '+b;
    return '<div class="ao-flag">'+head('2 sizes — check', 'ruler')+
      '<div class="small text2 mt8">Same item in two sizes next to each other — usually the customer is unsure of the size. Ask before packing.</div>'+
      '<div class="xs bold mt12" style="color:#6E675E">Call script</div><div class="ao-script">“You ordered '+esc(item)+' in '+esc(a)+' and '+esc(b)+' — keep both, or only one?”</div>'+
      '<div class="xs bold mt12" style="color:#6E675E">WhatsApp template (sent automatically after the order)</div>'+
      '<div class="ao-wa"><div class="ao-bubble" style="white-space:pre-line">'+esc(waText)+'</div><div class="ao-qr"><span>Keep both</span><span>Only '+esc(a)+'</span><span>Only '+esc(b)+'</span></div></div>'+
      '<div class="xs bold mt12" style="color:#6E675E">Customer answered?</div>'+
      '<div class="row wrap mt8" style="gap:8px"><button class="btn btn-sm btn-primary" data-act="ao-keep" data-id="'+o.id+'" data-v="both">Keep both</button>'+
      '<button class="btn btn-sm btn-secondary" data-act="ao-keep" data-id="'+o.id+'" data-v="'+esc(a)+'">Only '+esc(a)+'</button>'+
      '<button class="btn btn-sm btn-secondary" data-act="ao-keep" data-id="'+o.id+'" data-v="'+esc(b)+'">Only '+esc(b)+'</button>'+clear+'</div></div>';
  }
  if(f==='2 sizes — for someone else'){
    return '<div class="ao-flag ok">'+head('2 sizes — for someone else','user')+'<div class="small mt8">The customer told us at checkout that the second size is for someone else. No call needed — pack both.</div><div class="row wrap mt12">'+clear+'</div></div>';
  }
  if(f==='Address check'){
    return '<div class="ao-flag">'+head('Address check','home')+
      '<div class="small mt8"><b>Area could not be read automatically — check the address on the confirmation call.</b></div>'+
      '<div class="small text2 mt8">Ask for the area / thana and a landmark. Courier zone for now: <b>'+ao_zone(o)+'</b> ('+fmt(SET('delivery', o.zone==='in'?'inside':'outside'))+').</div>'+
      '<div class="row wrap mt12" style="gap:8px"><button class="btn btn-sm btn-secondary" data-act="ao-zone" data-id="'+o.id+'" data-v="in">It is Inside Dhaka</button><button class="btn btn-sm btn-secondary" data-act="ao-zone" data-id="'+o.id+'" data-v="out">It is Outside Dhaka</button>'+clear+'</div></div>';
  }
  if(f==='Phone check'){
    var r = checkPhone(o.phone);
    return '<div class="ao-flag">'+head('Phone check','info')+
      '<div class="small mt8">The number <b>'+esc(o.phone)+'</b> does not look right'+(r.msg?': '+esc(r.msg):'.')+'</div>'+
      '<div class="small text2 mt8">Try WhatsApp first. If it does not reach, wait for the customer to message — do not send to the courier yet.</div><div class="row wrap mt12">'+clear+'</div></div>';
  }
  if(f==='Exchange requested'){
    var ex = (o.exchanges||[])[o.exchanges.length-1] || {};
    var li = ex.lineIdx!=null ? ex.lineIdx : (ex.line!=null ? ex.line : 0), line = o.lines[li] || o.lines[0], p = line && P(line.product);
    var to = ex.size || ex.newSize || ex.to || '';
    if(to && typeof to==='object') to = to.size || '';
    var charge = SET('exchange', o.zone==='in' ? 'chargeInside' : 'chargeOutside');
    return '<div class="ao-flag">'+head('Exchange requested','swap')+
      '<div class="small mt8">'+(p ? '<b>'+esc(p.name)+'</b> · '+esc(COL(line.color).name)+' · size '+esc(line.size)+(to?' → <b>'+esc(to)+'</b>':'') : 'Size exchange')+(ex.reason?' <span class="muted">(reason: '+esc(ex.reason==='small'?'too small':ex.reason==='big'?'too big':ex.reason)+')</span>':'')+'</div>'+
      '<div class="small text2 mt8">Book the swap with the courier: rider brings the new size and collects the old one. Exchange charge '+fmt(charge)+' ('+ao_zone(o)+') unless the mistake is ours.</div><div class="row wrap mt12">'+clear+'</div></div>';
  }
  return '<div class="ao-flag">'+head(f)+'<div class="row wrap mt12">'+clear+'</div></div>';
}
function ao_modalHTML(id){
  var o = ST.orders[id]; if(!o) return '<div class="empty">Order not found</div>';
  var flags = ao_flags(o);
  var lines = (o.lines||[]).map(function(l){ var p = P(l.product); if(!p) return ''; return '<div class="ao-line"><div style="width:52px;flex-shrink:0">'+productImg(p, l.color, {ratio:'ratio-11', label:false})+'</div><div class="grow"><div class="small bold">'+esc(p.name)+'</div><div class="xs text2">'+esc(COL(l.color).name)+' · Size <b>'+esc(l.size)+'</b> · Qty '+(l.qty||1)+(l.setLabel?' · <span class="tag plain">'+esc(l.setLabel)+'</span>':'')+'</div></div><div class="small bold">'+fmt(l.unitPrice*(l.qty||1))+'</div></div>'; }).join('');
  var totals = '<div class="stack s6 small mt12" style="border-top:1px solid #E6E3DE;padding-top:10px">'+
    '<div class="row between"><span class="text2">Items</span><span>'+fmt(o.subtotal)+'</span></div>'+
    (o.discount?'<div class="row between"><span class="text2">'+esc(((o.setDiscounts||[])[0]||{}).label||'Discount')+'</span><span>−'+fmt(o.discount)+'</span></div>':'')+
    '<div class="row between"><span class="text2">Delivery ('+ao_zone(o)+')</span><span>'+(o.delivery?fmt(o.delivery):'Free')+'</span></div>'+
    '<div class="row between bold"><span>Total · '+(AO_PAY[o.payment]||o.payment)+'</span><span>'+fmt(o.total)+'</span></div></div>';
  var nextI = STATUS_FLOW.indexOf(o.status), next = STATUS_FLOW[nextI+1];
  var tl = '<div class="row wrap xs" style="gap:6px;margin-top:6px">'+STATUS_FLOW.map(function(s, i){ var done = i<=nextI; return '<span class="tag '+(done?'':'plain')+'" style="'+(done?'':'opacity:.7')+'">'+(done?ico('check',11):'')+esc(AO_STATUS[s])+'</span>'; }).join('')+'</div>';
  var waText = 'Hi '+ao_first(o)+', this is EXTAS about your order '+o.id+' ('+fmt(o.total)+').';
  return '<div class="row wrap" style="gap:8px">'+ao_statusTag(o)+'<span class="xs muted">'+esc(ao_when(o.createdAt))+' · '+esc(ao_src(o))+' · '+esc(o.courier||'')+' '+esc(o.tracking||'')+'</span></div>'+
    '<div class="ao-mgrid mt16"><div>'+
      '<div class="ao-sec">Customer</div><div class="bold">'+esc(o.name)+'</div><div class="small">'+esc(ao_phone(o))+' · <span class="tag plain">'+ao_zone(o)+'</span></div>'+
      '<div class="ao-sec mt16">Address</div><div class="small" style="line-height:1.5">'+esc(o.address)+'</div>'+
      '<div class="ao-sec mt16">Items</div>'+lines+totals+
      '<div class="ao-sec mt16">Status</div>'+tl+
    '</div><div class="ao-fcol">'+
      '<div class="ao-sec">Flags · what to do</div>'+(flags.length ? flags.map(function(f){ return ao_flagBlock(o, f); }).join('') : '<div class="ao-flag ok"><span class="row small bold" style="gap:7px;color:#1F4E46">'+ico('check',17)+'No flags — this order is ready to go.</span></div>')+
    '</div></div>'+
    '<div class="ao-actions">'+(next ? '<button class="btn btn-primary btn-sm" data-act="ao-next" data-id="'+o.id+'">'+ico('right',15)+'Move to next status: '+esc(AO_STATUS[next])+'</button>' : '<button class="btn btn-sm" disabled>Delivered — nothing next</button>')+
      ao_waBtn(o, 'Message on WhatsApp', waText)+
      (flags.length>1?'<button class="btn btn-sm btn-ghost" data-act="ao-clearall" data-id="'+o.id+'">Clear all flags</button>':'')+'</div>';
}
function ao_refresh(){ rerender(); refreshModal(); }
function ao_removeFlag(o, f){ if(f==='Exchange requested') o.aoExCleared = true; o.flags = (o.flags||[]).filter(function(x){ return x!==f; }); }
ACT['ao-filter'] = function(el){ ui('admin-orders',{filter:'all'}).filter = el.getAttribute('data-f'); rerender(); };
ACT['ao-open'] = function(el, ev){ if(ev) ev.stopPropagation(); var id = el.getAttribute('data-id'); openModal(ao_modalHTML(id), {title:'Order '+id, wide:true, rebuild:function(){ return ao_modalHTML(id); }}); };
ACT['ao-clear'] = function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; ao_removeFlag(o, el.getAttribute('data-flag')); saveState(); toast('Flag cleared'); ao_refresh(); };
ACT['ao-clearall'] = function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; ao_flags(o).forEach(function(f){ ao_removeFlag(o, f); }); saveState(); toast('All flags cleared'); ao_refresh(); };
ACT['ao-next'] = function(el){ var id = el.getAttribute('data-id'); advanceOrder(id); toast(id+' → '+AO_STATUS[ST.orders[id].status]); ao_refresh(); };
ACT['ao-zone'] = function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; o.zone = el.getAttribute('data-v'); o.courier = o.zone==='in' ? 'Steadfast' : 'Pathao'; ao_recalc(o); ao_removeFlag(o, 'Address check'); saveState(); toast('Zone set to '+ao_zone(o)+' · flag cleared'); ao_refresh(); };
ACT['ao-keep'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; var v = el.getAttribute('data-v'), pr = ao_pair(o);
  if(v==='both' || !pr){ ao_removeFlag(o, '2 sizes — check'); saveState(); toast('Keeping both sizes — flag cleared'); ao_refresh(); return; }
  var drop = pr.sizes[0]===v ? pr.j : pr.i, line = o.lines[drop];
  o.lines.splice(drop, 1);
  o.subtotal -= line.unitPrice*(line.qty||1);
  o.lines.forEach(function(l){ if(l.setLabel && l.product===line.product){ delete l.setLabel; l.unitPrice = (P(l.product)||{}).price || l.unitPrice; } });
  o.subtotal = o.lines.reduce(function(s,l){ return s + l.unitPrice*(l.qty||1); }, 0);
  o.discount = 0; o.setDiscounts = [];
  ao_recalc(o); ao_removeFlag(o, '2 sizes — check'); saveState();
  toast('Order updated — only '+v+' kept · new total '+fmt(o.total)); ao_refresh();
};
