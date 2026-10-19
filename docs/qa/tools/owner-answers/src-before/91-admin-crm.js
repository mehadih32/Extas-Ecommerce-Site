/* =====================================================================
   91-admin-crm.js — দূত Doot A360-06 · Customers & CRM (S14, PR 284–303, 533–535, 561)
   #/admin/customers            list, segments, search, review flags, message rule
   #/admin/customers/<id>       one customer: orders, tags, notes, consent, flags
   RULES (owner):
   · PR 561 — a phone number alone NEVER puts an address on screen. The
     profile has no address at all; an address shows only inside one order
     ("Show address for this order"), and every view is logged.
   · No automatic blocking. Flags are for the owner to review — nothing else.
   · Messages per order: SMS when placed, SMS when confirmed/booked, one
     WhatsApp when processed — nothing more from us (PR 148/505; the switch
     lives in Settings › SMS & WhatsApp, read here).
   Real data: ST.accounts + ST.orders. "Imported" customers (legacy import,
   PR 535) are simulated and marked so. Tags/notes/consent: ST.ops.crm.
   Prefix zr_. CSS: r12-zadmin2.css.
   ===================================================================== */
zo_route(/^\/admin\/customers$/, 'zr-list');
zo_route(/^\/admin\/customers\/([\w-]+)$/, 'zr-one');
zo_link(['Customers','#/admin/customers','user','Customers & CRM']);

function zr_st(){ var o = zo_ops(); if(!o.crm) o.crm = {c:{}, reveals:[]}; return o.crm; }
function zr_ext(id){ var s = zr_st(); if(!s.c[id]) s.c[id] = {tags:[], notes:[], optOut:{sms:false, wa:false}, reviewed:{}}; return s.c[id]; }

/* ---------- simulated imported customers (PR 535) ---------- */
var ZR_NAMES = ['Nusrat Jahan','Shahriar Kabir','Farhan Ahmed','Imran Hossain','Sadia Islam','Rafiq Uddin','Tahmid Chowdhury','Jannatul Ferdous','Mehedi Hasan','Sakib Al Mamun','Ayesha Siddiqua','Nayeem Khan','Rubel Mia','Fahim Reza'];
var ZR_PLACES = [['Uttara, Dhaka','in'],['Mirpur 2, Dhaka','in'],['Savar, Dhaka','sub'],['Agrabad, Chattogram','out'],['Zindabazar, Sylhet','out'],['Dhanmondi, Dhaka','in'],['Gazipur Sadar','sub'],['Rajshahi Sadar','out'],['Bashundhara, Dhaka','in'],['Khulna Sadar','out'],['Cumilla Sadar','out'],['Mohammadpur, Dhaka','in'],['Bogura Sadar','out'],['Narayanganj Sadar','sub']];
var ZR_IMPORT = null;
function zr_import(){
  if(ZR_IMPORT) return ZR_IMPORT;
  var D = 86400000, now = Date.now(), prods = ['essential-pique-polo','oxford-cotton-shirt','heavyweight-hoodie','slim-chino-trousers','classic-cotton-panjabi','everyday-crew-tee','linen-blend-shirt'];
  ZR_IMPORT = ZR_NAMES.map(function(n, i){
    var seed = 'zr'+i, k = zo_rnd(seed+'n', 1, 7), phone = '01'+[3,5,6,7,8,9][i%6]+('0000000'+(zs_hash(seed+'phone') % 100000000)).slice(-8);
    var orders = [];
    for(var j=0;j<k;j++){
      var r = zs_rnd(seed+'o'+j), st = r<0.12 ? 'refused' : r<0.2 ? 'exchanged' : 'delivered';
      if(i===4 && j<2) st = 'refused';
      if(i===9 && j<3) st = 'refused';
      var p = prods[zo_rnd(seed+'pp'+j, 0, prods.length-1)], pp = P(p), qty = zo_rnd(seed+'q'+j, 1, 3);
      var place = ZR_PLACES[i];
      orders.push({id:'OLD-'+(5200 + i*9 + j), at:now - (zo_rnd(seed+'d'+j, 4, 40) + (k-j)*zo_rnd(seed+'g', 14, 70))*D, total:(pp ? pp.price : 1000)*qty, items:qty, product:p, status:st,
        courier:['Steadfast','Pathao','RedX'][zo_rnd(seed+'c'+j, 0, 2)], address:'House '+zo_rnd(seed+'h'+j, 2, 88)+', Road '+zo_rnd(seed+'r'+j, 1, 19)+', '+place[0], zone:place[1]});
    }
    orders.sort(function(a,b){ return b.at - a.at; });
    return {id:'imp-'+(i+1), name:n, phone:phone, orders:orders, imported:true, since:orders[orders.length-1].at, source:i%3===0 ? 'Facebook page (old shop)' : i%3===1 ? 'WhatsApp orders' : 'Website (old)'};
  });
  return ZR_IMPORT;
}

/* ---------- everyone, in one shape ---------- */
function zr_status(o){
  var cp = typeof zk_parcelOf==='function' ? zk_parcelOf(o.id) : null;
  if(cp && cp.st==='refused') return 'refused';
  if(o.exchanges && o.exchanges.length) return 'exchanged';
  return o.status;
}
function zr_all(){
  if(typeof ao_ensureDemo==='function') try{ ao_ensureDemo(); }catch(e){}
  var by = {};
  Object.keys(ST.orders||{}).forEach(function(k){ var o = ST.orders[k], ph = normPhone(o.phone) || o.phone; (by[ph] = by[ph] || []).push(o); });
  Object.keys(ST.accounts||{}).forEach(function(ph){ if(!by[ph]) by[ph] = []; });
  var live = Object.keys(by).map(function(ph){
    var acc = ST.accounts[ph] || null, os = by[ph].slice().sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); });
    var orders = os.map(function(o){ return {id:o.id, at:o.createdAt, total:o.total, items:(o.lines||[]).reduce(function(s,l){ return s + (l.qty||1); }, 0), product:(o.lines&&o.lines[0]||{}).product, status:zr_status(o), courier:o.courier, address:o.address, zone:o.zone, flags:o.flags||[], live:true}; });
    return {id:ph, name:(acc && acc.name) || (os[0] && os[0].name) || 'Customer', phone:ph, orders:orders, acc:acc, tier:acc && acc.tier, since:orders.length ? orders[orders.length-1].at : Date.now(), source:'This website'};
  });
  return live.concat(zr_import()).map(zr_enrich);
}
function zr_enrich(c){
  var del = c.orders.filter(function(o){ return o.status==='delivered' || o.status==='exchanged'; }).length;
  var ref = c.orders.filter(function(o){ return o.status==='refused'; }).length;
  var exc = c.orders.filter(function(o){ return o.status==='exchanged'; }).length;
  var ltv = c.orders.filter(function(o){ return o.status==='delivered' || o.status==='exchanged'; }).reduce(function(s,o){ return s + (o.total||0); }, 0);
  var last = c.orders.length ? c.orders[0].at : 0, days = last ? Math.floor((Date.now()-last)/86400000) : null;
  var x = zr_ext(c.id);
  c.n = c.orders.length; c.del = del; c.ref = ref; c.exc = exc; c.ltv = ltv; c.last = last; c.days = days; c.ext = x;
  c.grade = ref>=2 ? ['Watch','warn','নজরে রাখুন'] : del>=3 && !ref ? ['Gold','ok','নিয়মিত, ভালো'] : del>=1 && ref/Math.max(1,c.n) < .34 ? ['Verified','info','ডেলিভারি নেয়'] : ['New','','নতুন'];
  var seg = [];
  if(c.n===1) seg.push('new'); if(c.n>=2) seg.push('returning');
  if(c.tier==='VIP' || ltv>=8000) seg.push('vip');
  if(days!=null && days>60 && del) seg.push('atrisk');
  if(ref) seg.push('refused'); if(exc) seg.push('exchange');
  if(x.optOut.sms && x.optOut.wa) seg.push('optout');
  c.seg = seg;
  c.flags = zr_flags(c);
  return c;
}
var ZR_SEGS = [['all','All','সবাই'],['new','New','নতুন — ১টা অর্ডার'],['returning','Returning','আবার কিনেছে'],['vip','VIP','বড় কাস্টমার'],['atrisk','At risk','৬০ দিনে কেনেনি'],['refused','Refused before','আগে পার্সেল ফেরত দিয়েছে'],['exchange','Exchanged','এক্সচেঞ্জ করেছে'],['optout','No offers','অফার চায় না']];
function zr_flags(c){
  var f = [];
  if(c.ref>=2) f.push({k:'ref', t:c.ref+' refused parcels', bn:'২+ বার পার্সেল নেয়নি'});
  var lastLive = c.orders.filter(function(o){ return o.live; })[0];
  if(lastLive && (lastLive.flags||[]).length) f.push({k:'ord-'+lastLive.id, t:'Order '+lastLive.id+': '+lastLive.flags.join(', '), bn:'অর্ডারে চেক দরকার'});
  var day = {}; c.orders.forEach(function(o){ var d = new Date(o.at).toDateString(); day[d] = (day[d]||0)+1; });
  if(Object.keys(day).some(function(d){ return day[d]>=3; })) f.push({k:'day', t:'3+ orders in one day', bn:'এক দিনে ৩+ অর্ডার'});
  return f.filter(function(x){ return !c.ext.reviewed[x.k]; });
}
function zr_find(id){ return zr_all().filter(function(c){ return c.id===id; })[0] || null; }
function zr_av(c){ var cols = ['#2A7AB0','#1F4E46','#7A5A2E','#8A3D5A','#5B4A8A','#A0522D']; return '<span class="zr-av" style="background:'+cols[zs_hash(c.id)%cols.length]+'">'+esc(c.name.charAt(0))+'</span>'; }
function zr_stLabel(s){ return {delivered:['Delivered','ok'], exchanged:['Exchanged','info'], refused:['Refused','bad'], confirmed:['To confirm','warn'], packed:['Packed','info'], shipped:['With courier','info']}[s] || [s,'']; }

/* message rule as set in Settings (89-admin-system.js ZS_MSG); default 2 SMS + 1 WhatsApp */
function zr_msgRule(){
  var def = {placed:true, confirmed:true, processing:true, shipped:false, out:false, delivered:false, review:false};
  var v = (ST.sys && ST.sys.msgRule) || def, list = typeof ZS_MSG!=='undefined' ? ZS_MSG : [{k:'placed',en:'Order placed',ch:'SMS'},{k:'confirmed',en:'Order confirmed',ch:'SMS'},{k:'processing',en:'Processing / packed',ch:'WhatsApp'}];
  var on = list.filter(function(m){ return v[m.k]; });
  return {list:list, v:v, on:on, sms:on.filter(function(m){ return m.ch==='SMS'; }).length, wa:on.filter(function(m){ return m.ch==='WhatsApp'; }).length, isDef:Object.keys(def).every(function(k){ return !!v[k]===def[k]; })};
}
function zr_msgCard(){
  var m = zr_msgRule();
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Messages per order</h2>'+zs_pr('148 · 505')+'</div>'+
    '<div class="zs-sub za-bn">প্রতি অর্ডারে আমাদের থেকে '+zs_bnNum(m.sms)+'টা SMS + '+zs_bnNum(m.wa)+'টা হোয়াটসঅ্যাপ — এর পরে আর কিছু না। কুরিয়ার নিজের পিকআপ SMS পাঠায়।</div>'+
    '<div class="zr-msgs">'+m.list.map(function(x, i){ var on = !!m.v[x.k]; return '<div class="zr-msg'+(on?'':' off')+'"><span class="ch'+(x.ch==='WhatsApp'?' wa':'')+'">'+x.ch+'</span><span class="grow">'+esc(x.en)+'</span><span class="zo-pill '+(on?'ok':'')+'">'+(on?'Sends':'Off')+'</span></div>'; }).join('')+
      '<div class="zr-msg cour"><span class="ch">SMS</span><span class="grow">Courier pickup message <span class="zs-mini">(sent by the courier, not us)</span></span><span class="zo-pill info">Courier</span></div></div>'+
    '<div class="zs-mini mt8">'+(m.isDef ? 'Your rule: 2 SMS + 1 WhatsApp. ' : 'Changed from your 2 SMS + 1 WhatsApp rule. ')+'<a class="zs-link" href="#/admin/settings">Change in Settings</a></div></section>';
}

/* ---------- list ---------- */
PAGES['zr-list'] = { layout:'admin', title:'Customers', render:function(){
  var u = ui('zr-list', {seg:'all', q:''}), all = zr_all();
  var cnt = function(s){ return s==='all' ? all.length : all.filter(function(c){ return c.seg.indexOf(s)>=0; }).length; };
  var list = all.filter(function(c){ return u.seg==='all' || c.seg.indexOf(u.seg)>=0; }).sort(function(a,b){ return (b.last||0)-(a.last||0); });
  var flagged = all.filter(function(c){ return c.flags.length; });
  var ret = all.filter(function(c){ return c.n>=2; }).length;
  return '<div class="zs-page zr-page">'+
    zo_head('Admin · Customers '+zs_pr('284–303 · 533–535 · 561'), 'Customers', 'কাস্টমার — কে কী কিনেছে, কে ফেরত দিয়েছে',
      'ফোন নম্বর দিয়ে প্রতিটা কাস্টমারের এক জায়গায় সব: অর্ডার, ডেলিভারি, ফেরত, এক্সচেঞ্জ, ট্যাগ আর নোট। ঠিকানা এখানে কখনো দেখায় না — শুধু একটা অর্ডারের ভিতরে, সেই অর্ডারের ঠিকানা।',
      zs_simTag('Imported customers simulated'))+
    '<div class="zs-kpis k4">'+
      '<div class="zs-k"><div class="v">'+all.length+'</div><div class="l">Customers</div><div class="s">'+all.filter(function(c){ return !c.imported; }).length+' from this site · '+zr_import().length+' imported</div></div>'+
      '<div class="zs-k ok"><div class="v">'+Math.round(ret/Math.max(1,all.length)*100)+'%</div><div class="l">Bought again</div><div class="s">'+ret+' returning</div></div>'+
      '<div class="zs-k"><div class="v">'+cnt('vip')+'</div><div class="l">VIP</div><div class="s">VIP tier or ৳8,000+ delivered</div></div>'+
      '<div class="zs-k '+(flagged.length?'warn':'')+'"><div class="v">'+flagged.length+'</div><div class="l">To review</div><div class="s">flags only — nobody is blocked</div></div>'+
    '</div>'+
    '<div class="zs-note mb16">'+ico('shield',17)+'<div class="zs-bnp"><b>কাউকে নিজে থেকে ব্লক করা হয় না।</b> সন্দেহের কিছু থাকলে শুধু "To review" তে দেখায় — সিদ্ধান্ত আপনার। <span class="zs-mini">PR 533 · fraud rules never auto-block</span></div></div>'+
    '<div class="zr-g">'+
      '<div style="min-width:0">'+
        '<div class="zs-sbar"><div class="zs-search">'+ico('search',17)+'<input class="input zs-in" type="search" id="zr-q" placeholder="Search name or phone number" value="'+esc(u.q)+'" data-input="zr-q" aria-label="Search customers"></div></div>'+
        '<div class="zs-tabs">'+ZR_SEGS.map(function(s){ return '<button type="button" class="chip'+(u.seg===s[0]?' on':'')+'" data-act="zr-seg" data-s="'+s[0]+'" title="'+esc(s[2])+'">'+esc(s[1])+' <span class="zo-cnt">'+cnt(s[0])+'</span></button>'; }).join('')+'</div>'+
        '<section class="zs-card zr-listcard"><div id="zr-rows">'+(list.map(zr_row).join('') || '<div class="zs-empty">Nobody in this group.</div>')+'</div><div class="zs-empty zs-nores" id="zr-nores">No customer matches.</div></section>'+
      '</div>'+
      '<aside class="zr-side">'+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>To review</h2><span class="zo-pill warn">'+flagged.length+'</span></div><div class="zs-sub za-bn">শুধু দেখার জন্য — ব্লক হয় না</div>'+
          (flagged.length ? '<div class="zs-list">'+flagged.slice(0,6).map(function(c){ return '<div class="zs-li"><div style="min-width:0"><div class="t"><a href="#/admin/customers/'+c.id+'">'+esc(c.name)+'</a></div><div class="m">'+c.flags.map(function(f){ return esc(f.t); }).join(' · ')+'</div></div><div class="r"><a class="btn btn-sm btn-ghost" href="#/admin/customers/'+c.id+'">Review</a></div></div>'; }).join('')+'</div>' : '<div class="zs-mini">Nothing to review.</div>')+
        '</section>'+
        zr_msgCard()+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Segments</h2>'+zs_pr('287 · 262 · 264')+'</div><div class="zs-sub za-bn">আসল কেনাকাটা থেকে দল — অ্যাডের অডিয়েন্সেও যায়</div>'+
          ZR_SEGS.slice(1).map(function(s){ return '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(s[1])+'</div><div class="zs-mini za-bn">'+esc(s[2])+'</div></div><button type="button" class="btn btn-sm btn-ghost" data-act="zr-seg" data-s="'+s[0]+'">'+cnt(s[0])+' '+ico('right',13)+'</button></div>'; }).join('')+
          '<div class="zs-mini mt8">“Refused before” is the exclusion list sent to the ad platforms (hashed phone only). <a class="zs-link" href="#/admin/ads?tab=delivered">See in Ads</a></div></section>'+
      '</aside>'+
    '</div></div>';
}, after:function(){ zr_filter(ui('zr-list',{}).q||''); }};
function zr_row(c){
  var srch = (c.name+' '+c.phone).toLowerCase();
  return '<a class="zr-row" href="#/admin/customers/'+c.id+'" data-s="'+esc(srch)+'" data-testid="zr-row">'+zr_av(c)+
    '<div class="zr-main"><div class="zr-nm">'+esc(c.name)+(c.imported?' <span class="zo-pill">Imported</span>':'')+'</div><div class="zs-mini">'+esc(zo_mask(c.phone))+' · '+(c.last ? 'last order '+dateStr(c.last) : 'no orders yet')+'</div>'+
      ((c.ext.tags.length || c.flags.length) ? '<div class="zr-tags">'+c.flags.slice(0,1).map(function(){ return '<span class="zo-pill warn">'+ico('info',11)+'Review</span>'; }).join('')+c.ext.tags.slice(0,3).map(function(t){ return '<span class="zr-tag">'+esc(t)+'</span>'; }).join('')+'</div>' : '')+'</div>'+
    '<div class="zr-nums"><span class="zo-pill '+c.grade[1]+'">'+c.grade[0]+'</span><span class="zs-mini">'+c.n+' orders · '+c.del+' delivered'+(c.ref?' · <b class="zr-ref">'+c.ref+' refused</b>':'')+'</span><b>'+fmt(c.ltv)+'</b></div></a>';
}
function zr_filter(q){
  q = String(q||'').toLowerCase().replace(/[\s-]/g,'').trim(); var d = q.replace(/\D/g,''), n = 0;
  document.querySelectorAll('#zr-rows .zr-row').forEach(function(r){ var s = r.getAttribute('data-s'); var hit = !q || s.replace(/\s/g,'').indexOf(q)>=0 || (d.length>=3 && s.indexOf(d)>=0); r.style.display = hit?'':'none'; if(hit) n++; });
  var e = document.getElementById('zr-nores'); if(e) e.style.display = (n || !document.querySelector('#zr-rows .zr-row')) ? 'none' : 'block';
}
INPUT['zr-q'] = function(el){ ui('zr-list',{}).q = el.value; zr_filter(el.value); };
ACT['zr-seg'] = function(el){ var u = ui('zr-list',{}); u.seg = el.getAttribute('data-s'); if(CUR.page!=='zr-list'){ go('#/admin/customers'); return; } rerender(); };

/* ---------- one customer ---------- */
PAGES['zr-one'] = { layout:'admin', title:'Customer', render:function(params){
  var c = zr_find(params[0]);
  if(!c) return '<div class="zs-page"><a class="link xs" href="#/admin/customers">'+ico('back',13)+' All customers</a><div class="zs-empty mt16">This customer does not exist.</div></div>';
  var u = ui('zr-one:'+c.id, {phone:false, open:{}}), x = c.ext;
  var orders = c.orders.map(function(o){ return zr_orderRow(c, o, u); }).join('');
  return '<div class="zs-page zr-page">'+
    '<a class="link xs" href="#/admin/customers">'+ico('back',13)+' All customers</a>'+
    '<section class="zs-card zr-hero mt12">'+zr_av(c)+'<div style="min-width:0;flex:1"><h1 class="h1">'+esc(c.name)+'</h1>'+
      '<div class="zr-hl"><span class="zo-pill '+c.grade[1]+'" title="'+esc(c.grade[2])+'">'+c.grade[0]+'</span>'+(c.imported?'<span class="zo-pill">Imported · simulated</span>':'')+
        c.seg.map(function(s){ var d = ZR_SEGS.filter(function(z){ return z[0]===s; })[0]; return d ? '<span class="zr-tag">'+esc(d[1])+'</span>' : ''; }).join('')+'</div>'+
      '<div class="zr-ph"><span>'+ico('chat',14)+' '+(u.phone ? esc(c.phone) : esc(zo_mask(c.phone)))+'</span>'+(u.phone ? '' : '<button type="button" class="zs-link" data-act="zr-phone" data-id="'+c.id+'">Show number</button>')+'<span class="zs-mini">Customer since '+dateStr(c.since)+' · '+esc(c.source)+'</span></div></div></section>'+
    '<div class="zs-kpis k6 mt16">'+
      '<div class="zs-k"><div class="v">'+c.n+'</div><div class="l">Orders</div></div>'+
      '<div class="zs-k ok"><div class="v">'+c.del+'</div><div class="l">Truly delivered</div></div>'+
      '<div class="zs-k '+(c.ref?'bad':'')+'"><div class="v">'+c.ref+'</div><div class="l">Refused</div></div>'+
      '<div class="zs-k"><div class="v">'+c.exc+'</div><div class="l">Exchanges</div></div>'+
      '<div class="zs-k"><div class="v">'+fmt(c.ltv)+'</div><div class="l">Lifetime value</div></div>'+
      '<div class="zs-k"><div class="v">'+(c.days==null?'—':c.days+' d')+'</div><div class="l">Since last order</div></div>'+
    '</div>'+
    '<div class="zr-g">'+
      '<div style="min-width:0;display:flex;flex-direction:column;gap:16px">'+
        '<section class="zs-card zr-addr"><div class="row" style="gap:10px;align-items:flex-start">'+ico('lock',18)+'<div style="min-width:0"><div class="small bold">Address hidden on this page</div>'+
          '<div class="zs-bnp small">ফোন নম্বর দিয়ে কাস্টমার খুললে ঠিকানা দেখায় না (PR 561)। নিচে কোনো অর্ডারে "Show address for this order" চাপলে শুধু সেই অর্ডারের ঠিকানা দেখাবে — প্যাকিং আর কুরিয়ারের জন্য। প্রতিবার দেখা লগে থাকে।</div></div></div></section>'+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Order history</h2>'+zs_pr('286 · 525 · 533')+'</div><div class="zs-sub za-bn">প্রতিটা অর্ডার — ডেলিভারি, ফেরত, এক্সচেঞ্জ</div>'+
          (orders || '<div class="zs-empty">No orders yet.</div>')+'</section>'+
        zr_msgCard()+
      '</div>'+
      '<aside class="zr-side">'+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Review flags</h2>'+zs_pr('533')+'</div><div class="zs-sub za-bn">শুধু দেখার জন্য — অর্ডার আটকায় না, ব্লক হয় না</div>'+
          (c.flags.length ? c.flags.map(function(f){ return '<div class="zr-flag"><div style="min-width:0"><div class="small bold">'+esc(f.t)+'</div><div class="zs-mini za-bn">'+esc(f.bn)+'</div></div><button type="button" class="btn btn-sm btn-ghost" data-act="zr-reviewed" data-id="'+c.id+'" data-k="'+esc(f.k)+'">Mark reviewed</button></div>'; }).join('') : '<div class="zs-mini">'+ico('check',12)+' Nothing to review.</div>')+
        '</section>'+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Tags</h2>'+zs_pr('297')+'</div>'+
          '<div class="zr-tags mt8">'+(x.tags.length ? x.tags.map(function(t){ return '<span class="zr-tag on">'+esc(t)+'<button type="button" class="zp-x" data-act="zr-untag" data-id="'+c.id+'" data-t="'+esc(t)+'" aria-label="Remove tag '+esc(t)+'">'+ico('close',11)+'</button></span>'; }).join('') : '<span class="zs-mini">No tags yet.</span>')+'</div>'+
          '<div class="zr-tags mt8">'+['Size L','Prefers WhatsApp','Gift buyer','Office wear','Eid buyer'].filter(function(t){ return x.tags.indexOf(t)<0; }).map(function(t){ return '<button type="button" class="chip zr-sug" data-act="zr-tag" data-id="'+c.id+'" data-t="'+esc(t)+'">+ '+esc(t)+'</button>'; }).join('')+'</div>'+
          '<form class="zr-addf mt8" data-submit="zr-tag" data-id="'+c.id+'"><input class="input zs-in" name="t" placeholder="New tag" aria-label="New tag" maxlength="30"><button class="btn btn-sm btn-secondary">Add</button></form></section>'+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Notes</h2>'+zs_pr('297')+'</div><div class="zs-sub za-bn">শুধু আপনার টিম দেখে</div>'+
          '<form class="zr-addf" data-submit="zr-note" data-id="'+c.id+'"><input class="input zs-in" name="t" placeholder="e.g. Called — wants XL next time" aria-label="New note" maxlength="200"><button class="btn btn-sm btn-secondary">Save</button></form>'+
          (x.notes.length ? '<div class="zs-list mt8">'+x.notes.map(function(n){ return '<div class="zs-li"><div style="min-width:0"><div class="t" style="font-weight:500">'+esc(n.t)+'</div><div class="m">'+esc(zs_time(n.at))+' · Owner</div></div></div>'; }).join('')+'</div>' : '')+'</section>'+
        '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Offers & consent</h2>'+zs_pr('298')+'</div><div class="zs-sub za-bn">অর্ডারের মেসেজ সবসময় যায়; অফারের মেসেজ শুধু রাজি থাকলে</div>'+
          '<div class="zs-row"><div class="grow"><div class="small bold">Offers by SMS</div></div>'+zs_sw(!x.optOut.sms, 'zr-opt', 'Offers by SMS', 'data-id="'+c.id+'" data-k="sms"')+'</div>'+
          '<div class="zs-row"><div class="grow"><div class="small bold">Offers on WhatsApp</div></div>'+zs_sw(!x.optOut.wa, 'zr-opt', 'Offers on WhatsApp', 'data-id="'+c.id+'" data-k="wa"')+'</div></section>'+
        zr_revealLog(c)+
      '</aside>'+
    '</div></div>';
}};
function zr_orderRow(c, o, u){
  var st = zr_stLabel(o.status), p = P(o.product), open = !!u.open[o.id];
  return '<div class="zr-ord" data-testid="zr-ord">'+
    '<div class="zr-ordh"><div style="min-width:0"><div class="small bold">'+esc(o.id)+' <span class="zo-pill '+st[1]+'">'+st[0]+'</span></div>'+
      '<div class="zs-mini zr-ordm">'+dateStr(o.at)+' · '+o.items+' item'+(o.items===1?'':'s')+(p?' · '+esc(p.name):'')+' · '+esc(o.courier||'')+'</div></div><b class="zr-ordt">'+fmt(o.total)+'</b></div>'+
    '<div class="zr-orda">'+(open ? '<div class="zr-addrv" data-testid="zr-addr">'+ico('truck',14)+'<span>'+esc(o.address)+'</span><button type="button" class="zs-link" data-act="zr-addr" data-id="'+c.id+'" data-o="'+o.id+'">Hide</button></div>'
      : '<button type="button" class="zs-link" data-act="zr-addr" data-id="'+c.id+'" data-o="'+o.id+'" data-testid="zr-show-addr">'+ico('eye',12)+' Show address for this order</button>')+
      (o.live ? '<a class="zs-link" href="#/admin/orders">Open in Orders</a>' : '')+
      '<span class="zs-mini">'+zr_msgLine(o)+'</span></div></div>';
}
function zr_msgLine(o){ var m = zr_msgRule(); return 'Sent: '+m.sms+' SMS + '+m.wa+' WhatsApp'+(o.status==='confirmed' ? ' (1 SMS so far)' : ''); }
function zr_revealLog(c){
  var list = zr_st().reveals.filter(function(r){ return r.c===c.id; }).slice(0, 6);
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Who saw the address</h2>'+zs_pr('561 · 413')+'</div><div class="zs-sub za-bn">প্রতিবার ঠিকানা খোলা এখানে লেখা থাকে</div>'+
    (list.length ? '<div class="zs-list">'+list.map(function(r){ return '<div class="zs-li"><div style="min-width:0"><div class="t" style="font-weight:500">Owner · order '+esc(r.o)+'</div><div class="m">'+esc(zs_time(r.at))+'</div></div></div>'; }).join('')+'</div>' : '<div class="zs-mini">Nobody has opened an address yet.</div>')+'</section>';
}
ACT['zr-phone'] = function(el){ ui('zr-one:'+el.getAttribute('data-id'), {}).phone = true; rerender(); };
ACT['zr-addr'] = function(el){
  var id = el.getAttribute('data-id'), o = el.getAttribute('data-o'), u = ui('zr-one:'+id, {phone:false, open:{}}); u.open = u.open || {};
  u.open[o] = !u.open[o];
  if(u.open[o]){ zr_st().reveals.unshift({c:id, o:o, at:Date.now()}); zr_st().reveals = zr_st().reveals.slice(0, 200); saveState(); toast('Address for '+o+' shown — logged'); }
  rerender();
};
ACT['zr-reviewed'] = function(el){ var x = zr_ext(el.getAttribute('data-id')); x.reviewed[el.getAttribute('data-k')] = Date.now(); saveState(); rerender(); toast('Marked reviewed — nothing else changes'); };
ACT['zr-tag'] = function(el){ var x = zr_ext(el.getAttribute('data-id')), t = el.getAttribute('data-t'); if(x.tags.indexOf(t)<0) x.tags.push(t); saveState(); rerender(); toast('Tag added'); };
ACT['zr-untag'] = function(el){ var x = zr_ext(el.getAttribute('data-id')), t = el.getAttribute('data-t'); x.tags = x.tags.filter(function(y){ return y!==t; }); saveState(); rerender(); toast('Tag removed'); };
SUBMIT['zr-tag'] = function(f){ var t = (f.querySelector('[name=t]').value||'').trim(); if(!t){ toast('Write the tag first'); return; } var x = zr_ext(f.getAttribute('data-id')); if(x.tags.indexOf(t)<0) x.tags.push(t); saveState(); rerender(); toast('Tag added'); };
SUBMIT['zr-note'] = function(f){ var t = (f.querySelector('[name=t]').value||'').trim(); if(!t){ toast('Write the note first'); return; } zr_ext(f.getAttribute('data-id')).notes.unshift({t:t, at:Date.now()}); saveState(); rerender(); toast('Note saved'); };
ACT['zr-opt'] = function(el){ var x = zr_ext(el.getAttribute('data-id')), k = el.getAttribute('data-k'); x.optOut[k] = !x.optOut[k]; saveState(); rerender(); toast(x.optOut[k] ? 'No more offers by '+(k==='sms'?'SMS':'WhatsApp')+' — order messages still go' : 'Offers by '+(k==='sms'?'SMS':'WhatsApp')+' on'); };
