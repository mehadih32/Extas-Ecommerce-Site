/* =====================================================================
   96f-admin-ops.js — the money and team side of the admin (owner fix E, 20 Oct)
   S16 PR 342–355 · 504 · 536 · 537 · 568 (finance, expenses, P&L)
   S00 PR 16 · 495 (roles) · PR 139 (audit log) · S05 PR 140 · 148 · 149 · 152
   S08 PR 165 · 166 · 174 (courier money check on the demo's own orders)
   B7.2 rule 3 (tab strips show a fade and an arrow)
   ---------------------------------------------------------------------
   #/admin/finance              P&L: revenue, COGS, courier, gateway, ads,
                                expenses, salaries → gross / net; by day,
                                style, category, combo; delivered vs booked; CSV
   #/admin/expenses             expenses + staff salaries (mirror; ERP = master)
   #/admin/team                 roles & permissions · acting as · audit log
   #/admin/comms                every SMS / WhatsApp / email per order (mock)
   #/admin/bulk                 bulk confirm · book courier · print documents
   Couriers → Money check       now starts with the demo's own parcels
   RULES: every action that changes data asks first and writes the audit
   log; nothing moves real money; every number comes from the demo's own
   orders, parcels and the settings on these pages. Prefix zy_.
   96g-admin-care.js (review queue, exchanges, support, coupons, customer
   side) uses the shared helpers below.
   ===================================================================== */
zo_route(/^\/admin\/finance$/, 'zy-fin');
zo_route(/^\/admin\/expenses$/, 'zy-exp');
zo_route(/^\/admin\/team$/, 'zy-team');
zo_route(/^\/admin\/comms$/, 'zy-comms');
zo_route(/^\/admin\/bulk$/, 'zy-bulk');
zo_link(['Bulk actions','#/admin/bulk','grid', null]);
zo_link(['Messages log','#/admin/comms','mail', null]);
zo_link(['Finance & P&L','#/admin/finance','cash', null]);
zo_link(['Expenses & salaries','#/admin/expenses','wallet', null]);
zo_link(['Team & audit log','#/admin/team','shield', null]);

/* ---------- language: English by default, Bengali in Bengali mode ---------- */
function zy(en, bn){ try{ if(typeof al_lang==='function' && al_lang()==='bn' && bn!=null) return bn; }catch(e){} return en; }
function zy_e(en, bn){ return esc(zy(en, bn)); }

/* ---------- state (ST.zy) — demo data only; Reset demo data clears it ---------- */
var ZY_SECTIONS = [
  ['orders','Orders & bulk actions','অর্ডার ও একসাথে কাজ'],
  ['review','Duplicate & fraud review','ডুপ্লিকেট ও ফ্রড রিভিউ'],
  ['fulfil','Fulfilment & couriers','প্যাকিং ও কুরিয়ার'],
  ['exchange','Exchanges & returns','এক্সচেঞ্জ ও রিটার্ন'],
  ['support','Support inbox','সাপোর্ট ইনবক্স'],
  ['finance','Finance & P&L','হিসাব ও লাভ-ক্ষতি'],
  ['expenses','Expenses & salaries','খরচ ও বেতন'],
  ['coupons','Coupons & offers','কুপন ও অফার'],
  ['catalog','Products & stock','প্রোডাক্ট ও স্টক'],
  ['settings','Settings & rules','সেটিংস ও নিয়ম'],
  ['team','Team, roles & audit log','টিম, অনুমতি ও লগ']
];
function zy_perms(list){ var p = {}; ZY_SECTIONS.forEach(function(s){ p[s[0]] = 'none'; }); Object.keys(list).forEach(function(k){ p[k] = list[k]; }); return p; }
function zy_allPerm(l){ var p = {}; ZY_SECTIONS.forEach(function(s){ p[s[0]] = l; }); return p; }
function zy_defRoles(){
  return [
    {id:'owner', en:'Owner', bn:'মালিক', perms:zy_allPerm('edit'), locked:true},
    {id:'manager', en:'Manager', bn:'ম্যানেজার', perms:(function(){ var p = zy_allPerm('edit'); p.team = 'view'; p.finance = 'view'; return p; })()},
    {id:'orders', en:'Order desk', bn:'অর্ডার ডেস্ক', perms:zy_perms({orders:'edit', review:'edit', fulfil:'edit', exchange:'view', support:'view', catalog:'view'})},
    {id:'support', en:'Support employee', bn:'সাপোর্ট কর্মচারী', perms:zy_perms({support:'edit', exchange:'edit', orders:'view', review:'view', catalog:'view'})},
    {id:'accounts', en:'Accountant', bn:'হিসাবরক্ষক', perms:zy_perms({finance:'edit', expenses:'edit', orders:'view', fulfil:'view', coupons:'view'})},
    {id:'packer', en:'Packing & store', bn:'প্যাকিং ও স্টোর', perms:zy_perms({fulfil:'edit', exchange:'edit', orders:'view', catalog:'view'})}
  ];
}
var ZY_HEADS = [
  {id:'packaging', en:'Packaging', bn:'প্যাকেজিং'}, {id:'rent', en:'Shop / office rent', bn:'দোকান / অফিস ভাড়া'},
  {id:'utility', en:'Electricity & internet', bn:'বিদ্যুৎ ও ইন্টারনেট'}, {id:'office', en:'Office & supplies', bn:'অফিস ও জিনিসপত্র'},
  {id:'transport', en:'Local transport', bn:'যাতায়াত'}, {id:'photo', en:'Photos & content', bn:'ছবি ও কনটেন্ট'}, {id:'misc', en:'Other', bn:'অন্যান্য'}
];
function zy_dayStart(ts){ var d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); }
function zy_dk(ts){ var d = new Date(ts); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function zy_st(){
  if(!ST.zy) ST.zy = {};
  var z = ST.zy, now = Date.now(), D = 86400000;
  if(!z.audit) z.audit = [];
  if(!z.roles) z.roles = zy_defRoles();
  if(!z.actor) z.actor = 'owner';
  if(!z.emp) z.emp = [   /* sample staff — the owner edits these on Expenses → Staff & salaries */
    {id:'e1', name:'Sumon Mia', job:'Packing & store', role:'packer', salary:15000, start:zy_dk(now-120*D), active:true},
    {id:'e2', name:'Nadia Islam', job:'Support & order desk', role:'support', salary:18000, start:zy_dk(now-90*D), active:true},
    {id:'e3', name:'Rafiq Ahmed', job:'Accounts (part-time)', role:'accounts', salary:12000, start:zy_dk(now-60*D), active:true}
  ];
  if(!z.heads) z.heads = JSON.parse(JSON.stringify(ZY_HEADS));
  if(!z.exp) z.exp = [];
  if(!z.fin) z.fin = {};
  var F = z.fin, FD = {gwBkash:1.85, gwNagad:1.5, gwCard:2.5, pack:15, sms:0.35, wa:0.8, email:0, bigExtra:40, bigSizes:'XXL, 3XL, 40, 42', bPct:50, period:'today', scope:'delivered', view:'pl', settleDays:3};
  Object.keys(FD).forEach(function(k){ if(F[k]==null) F[k] = FD[k]; });
  if(!F.ads) F.ads = {};
  if(!z.cost) z.cost = {};
  if(!z.settle) z.settle = {};
  if(!z.erp) z.erp = {};
  if(!z.moves) z.moves = [];
  if(!z.qc) z.qc = [];
  if(!z.seq) z.seq = {exp:1, emp:4, ret:1, tk:1001, cpn:1};
  return z;
}
ZO_APPLY.push(function(){ if(ST) zy_st(); });

/* ---------- who is working (demo "acting as") + permissions ---------- */
function zy_role(id){ var r = zy_st().roles.filter(function(x){ return x.id===id; })[0]; return r || zy_st().roles[0]; }
function zy_emp(id){ return zy_st().emp.filter(function(e){ return e.id===id; })[0] || null; }
function zy_actor(){
  var z = zy_st(), e = z.actor!=='owner' ? zy_emp(z.actor) : null;
  if(!e) return {id:'owner', name:zy('Owner','মালিক'), en:'Owner', role:'owner', roleName:zy('Owner','মালিক')};
  var r = zy_role(e.role); return {id:e.id, name:e.name, en:e.name, role:r.id, roleName:zy(r.en, r.bn)};
}
function zy_can(sec, lvl){ var p = zy_role(zy_actor().role).perms[sec] || 'none'; return lvl==='edit' ? p==='edit' : p!=='none'; }
function zy_secName(sec){ var s = ZY_SECTIONS.filter(function(x){ return x[0]===sec; })[0]; return s ? zy(s[1], s[2]) : sec; }
/* every action checks the permission, not only the page (B6.5) */
function zy_guard(sec, what){
  if(zy_can(sec, 'edit')) return true;
  var a = zy_actor();
  zy_log(sec, 'Blocked — '+a.en+' ('+zy_role(a.role).en+') has no edit right: '+(what||sec));
  toast(zy('Your role ('+a.roleName+') cannot do this — ask the owner', 'আপনার ভূমিকা ('+a.roleName+') দিয়ে এটা করা যায় না — মালিককে বলুন'));
  return false;
}
/* the append-only audit log: who, when, what (B6.5, PR 139) */
function zy_log(sec, what, ref){
  var z = zy_st(), a = zy_actor();
  z.audit.push({at:Date.now(), who:a.en, role:zy_role(a.role).en, sec:sec, what:String(what), ref:ref||''});
}

/* ---------- confirm: every data change asks first (B7.2 rules 1 and 10) ---------- */
var ZY_ASK = null;
function zy_ask(o){
  ZY_ASK = o;
  var body = '<div class="zy-ask">'+(o.html||'')+'<div class="zs-actions mt16"><button type="button" class="btn '+(o.danger?'zx-danger':'btn-primary')+'" data-act="zy-ask-yes" data-testid="zy-yes">'+esc(o.yes || zy('Yes, save','হ্যাঁ, সেভ করুন'))+'</button>'+
    '<button type="button" class="btn btn-ghost" data-act="zy-ask-no">'+esc(o.back ? zy('Back','ফিরে যান') : zy('Cancel','বাতিল'))+'</button></div></div>';
  openModal(body, {title:o.title || zy('Please confirm','নিশ্চিত করুন')});
}
ACT['zy-ask-yes'] = function(){ var o = ZY_ASK; ZY_ASK = null; closeModal(); if(o && o.fn){ try{ o.fn(); }catch(e){ console.error(e); } saveState(); if(!o.noRender) rerender(); } };
ACT['zy-ask-no'] = function(){ var o = ZY_ASK; ZY_ASK = null; closeModal(); if(o && o.back) o.back(); };

/* ---------- page helpers ---------- */
function zy_head(eyebrow, en, bn, descEn, descBn, right){
  var isBn = typeof al_lang==='function' && al_lang()==='bn';
  return zo_head(eyebrow, esc(en), isBn ? esc(bn) : '', esc(isBn ? descBn : descEn), right);
}
function zy_noAccess(sec){
  return '<section class="zs-card zy-noacc" data-testid="zy-noaccess"><h2>'+zy_e('No access','অনুমতি নেই')+'</h2><p class="zs-mini">'+
    esc(zy('Your role ('+zy_actor().roleName+') cannot open '+zy_secName(sec)+'. The owner can change this on Team & audit log.', 'আপনার ভূমিকা ('+zy_actor().roleName+') দিয়ে '+zy_secName(sec)+' খোলা যায় না। মালিক Team & audit log থেকে বদলাতে পারেন।'))+'</p></section>';
}
function zy_actorBar(){
  var a = zy_actor();
  return '<button type="button" class="zy-actor" data-act="zy-actor-open" data-testid="zy-actor" title="'+zy_e('Demo: who is working now — tap to switch','ডেমো: এখন কে কাজ করছে — বদলাতে চাপুন')+'">'+ico('user',13)+esc(a.name)+(a.id==='owner' ? '' : ' · '+esc(a.roleName))+'</button>';
}
/* the switch is always reachable, even for a role with no Team access (demo only) */
function zy_actorList(){
  var z = zy_st(), a = zy_actor();
  return '<p class="zs-mini" style="margin:0 0 8px">'+zy_e('Demo only: in the real build each person has their own login.','শুধু ডেমো: আসল সাইটে প্রত্যেকের নিজের লগইন থাকবে।')+'</p><div class="zs-list">'+[{id:'owner', name:zy('Owner','মালিক'), role:'owner', active:true}].concat(z.emp).filter(function(e){ return e.active; }).map(function(e){ var r = zy_role(e.role), on = a.id===e.id;
    return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(e.name)+'</div><div class="m">'+esc(zy(r.en,r.bn))+'</div></div><div class="r">'+(on ? '<span class="zo-pill ok">'+ico('check',11)+zy_e('Working now','এখন কাজ করছেন')+'</span>' : '<button type="button" class="btn btn-sm btn-ghost" data-act="zy-actas" data-id="'+e.id+'" data-testid="zy-actas-'+e.id+'">'+zy_e('Act as','এই জন হয়ে কাজ')+'</button>')+'</div></div>'; }).join('')+'</div>';
}
ACT['zy-actor-open'] = function(){ openModal(zy_actorList(), {title:zy('Who is working now?','এখন কে কাজ করছে?')}); };
function zy_kpi(v, l, s, cls){ return '<div class="zs-k'+(cls?' '+cls:'')+'"><div class="v">'+v+'</div><div class="l">'+esc(l)+'</div>'+(s!=null?'<div class="s">'+esc(s)+'</div>':'')+'</div>'; }
function zy_csv(rows){ return rows.map(function(r){ return r.map(function(c){ c = String(c==null?'':c); return /[",\n]/.test(c) ? '"'+c.replace(/"/g,'""')+'"' : c; }).join(','); }).join('\n'); }
function zy_download(name, text){
  try{ var b = new Blob(['﻿'+text], {type:'text/csv;charset=utf-8'}), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 400); }catch(e){ console.error(e); }
}
function zy_num(v){ var n = Number(String(v==null?'':v).replace(/[^\d.\-]/g,'')); return isFinite(n) ? n : NaN; }
function zy_orders(){ if(typeof ao_ensureDemo==='function') try{ ao_ensureDemo(); }catch(e){} return ao_list(); }
function zy_first(n){ return String(n||'').split(' ')[0] || ''; }

/* =====================================================================
   COSTS — variant cost (ERP mirror), fees and per-order costs
   ===================================================================== */
function zy_baseCost(pid){ var z = zy_st(), p = P(pid); if(z.cost[pid]!=null) return +z.cost[pid]; return p ? Math.round(p.price*0.46/10)*10 : 0; }   /* sample ERP cost until the ERP sync sends the real one */
function zy_bigSizes(){ return String(zy_st().fin.bigSizes||'').split(/[,\s]+/).filter(Boolean).map(function(s){ return s.toUpperCase(); }); }
function zy_cost(pid, size){ return zy_baseCost(pid) + (zy_bigSizes().indexOf(String(size||'').toUpperCase())>=0 ? (+zy_st().fin.bigExtra||0) : 0); }
function zy_cogs(o){ return (o.lines||[]).reduce(function(s,l){ return s + (l.qty||1)*zy_cost(l.product, l.size); }, 0); }
function zy_cour(id){ if(!id) return null; var k = String(id).toLowerCase(); return (typeof zk_c==='function') ? (zk_c(k) || zk_c(({sf:'steadfast'})[k]||'')) : null; }
/* what the courier costs us for one order: {charge, fee, ret, est, name} */
function zy_courierCost(o, delivered){
  var p = zk_parcelOf(o.id), c;
  if(p){ c = zk_c(p.courier) || {codPct:1, ret:0, name:p.courier};
    if(['refused','returned','restocked'].indexOf(p.st)>=0) return {charge:0, fee:0, ret:c.ret, est:false, name:c.name, refused:true};
    return {charge:p.charge, fee:Math.round((p.cod||0)*(c.codPct||0)/100), ret:0, est:p.st!=='delivered', name:c.name}; }
  var band = zk_band(o.zone);
  c = zy_cour(o.courier);
  if(c && o.status==='delivered') return {charge:c.rates[band], fee:Math.round(zk_cod(o)*(c.codPct||0)/100), ret:0, est:false, name:c.name, old:true};
  c = zk_pick(band);
  return c ? {charge:c.rates[band], fee:Math.round(zk_cod(o)*(c.codPct||0)/100), ret:0, est:true, name:c.name} : {charge:0, fee:0, ret:0, est:true, name:''};
}
function zy_gwRate(m){ var F = zy_st().fin; return m==='bkash' ? +F.gwBkash : m==='nagad' ? +F.gwNagad : m==='card' ? +F.gwCard : 0; }
function zy_gw(o){ return o.payment==='cod' ? 0 : Math.round(ty_paid(o)*zy_gwRate(o.payment)/100); }
function zy_msgCost(n){ var F = zy_st().fin; return n.ch==='SMS' ? +F.sms : n.ch==='WhatsApp' ? +F.wa : n.ch==='Email' ? +F.email : 0; }

/* stock movements (exchanges and QC) sit on top of the ERP mirror */
function zy_moveSum(pid, c, s){ var n = 0, m = (ST && ST.zy && ST.zy.moves) || []; for(var i=0;i<m.length;i++){ var x = m[i]; if(x.pid===pid && x.color===c && x.size===s && x.sellable!==false) n += x.qty; } return n; }
function zy_move(pid, color, size, qty, why, ref, sellable){ zy_st().moves.push({pid:pid, color:color, size:size, qty:qty, why:why, ref:ref||'', at:Date.now(), sellable:sellable!==false}); }
(function(){
  if(typeof stockOf!=='function' || stockOf._zy) return;
  var prev = stockOf, erp = prev._erp || prev;
  var f = function(pid, c, s){ var b = prev.apply(this, arguments); try{ return Math.max(0, b + zy_moveSum(pid, c, s)); }catch(e){ return b; } };
  f._zy = true; f._erp = function(pid, c, s){ return Math.max(0, erp(pid, c, s) + zy_moveSum(pid, c, s)); }; window.stockOf = f;
})();

/* =====================================================================
   PERIODS + THE P&L ENGINE (one function; every screen and the CSV read it)
   ===================================================================== */
var ZY_PERIODS = [['today','Today','আজ'],['yesterday','Yesterday','গতকাল'],['d7','Last 7 days','গত ৭ দিন'],['month','This month','এই মাস'],['all','All time','সব সময়']];
function zy_period(k){
  var now = Date.now(), t0 = zy_dayStart(now), D = 86400000, from, to = now;
  if(k==='yesterday'){ from = t0 - D; to = t0 - 1; }
  else if(k==='d7') from = t0 - 6*D;
  else if(k==='month'){ var d = new Date(now); from = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
  else if(k==='all'){ from = t0; Object.keys(ST.orders||{}).forEach(function(id){ var o = ST.orders[id]; if(o.createdAt) from = Math.min(from, zy_dayStart(o.createdAt)); }); zy_st().exp.forEach(function(e){ var x = new Date(e.date+'T12:00').getTime(); if(x) from = Math.min(from, zy_dayStart(x)); }); }
  else from = t0;
  var days = []; for(var x = zy_dayStart(from); x <= to; x += D){ days.push(x); var dd = new Date(x); dd.setDate(dd.getDate()+1); x = dd.getTime() - D; }
  return {k:k, from:from, to:to, days:days};
}
function zy_in(ts, P){ return ts && ts >= P.from && ts <= P.to; }
function zy_dim(ts){ var d = new Date(ts); return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }
function zy_salaryDay(e, day){ if(!e.active && !e.end) return 0; var s = new Date(e.start+'T00:00').getTime(); if(isNaN(s) || day < zy_dayStart(s)) return 0; if(e.end && day > new Date(e.end+'T23:59').getTime()) return 0; if(!e.active && !e.end) return 0; return (+e.salary||0)/zy_dim(day); }
function zy_adsDay(day){
  var F = zy_st().fin, k = zy_dk(day);
  if(F.ads[k]!=null) return {amt:+F.ads[k].amt||0, src:'entered'};
  if(k===zy_dk(Date.now()) && typeof zd_t==='function' && typeof zd_spendToday==='function'){ try{ return {amt:Math.round(zd_spendToday(zd_t())), src:'ads'}; }catch(e){} }
  return {amt:0, src:'none'};
}
/* the line's share of the order's discounts: a set saving stays with its set, the rest is spread by value */
function zy_lineNet(o){
  var lines = (o.lines||[]).map(function(l){ return {l:l, gross:(l.unitPrice||0)*(l.qty||1), disc:0}; });
  var setSum = 0;
  (o.setDiscounts||[]).forEach(function(d){
    var lab = String(d.label||'').replace(/\s*set price$/i,'').trim().toLowerCase();
    var g = lines.filter(function(x){ return x.l.setLabel && (lab && String(x.l.setLabel).toLowerCase().indexOf(lab)===0 || String(d.label||'').toLowerCase().indexOf(String(x.l.setLabel).toLowerCase())===0); });
    /* an auto-applied combo (two loose polos → Polo Duo) has no set label on its lines: find them by the combo's items */
    if(!g.length && d.combo){ var cb = (typeof combos==='function' ? combos() : []).filter(function(c){ return c.id===d.combo; })[0];
      if(cb && cb.items){ g = lines.filter(function(x){ return !x.l.setLabel && !x.combo && cb.items.indexOf(x.l.product)>=0; }); g.forEach(function(x){ x.combo = cb.name || String(d.label||'').replace(/\s*set price$/i,''); }); } }
    if(!g.length) return; setSum += d.amount||0; var gs = g.reduce(function(s,x){ return s + x.gross; }, 0) || 1; g.forEach(function(x){ x.disc += (d.amount||0)*x.gross/gs; });
  });
  var goods = (o.total||0) - (o.delivery||0), allGross = lines.reduce(function(s,x){ return s + x.gross; }, 0) || 1;
  var rest = allGross - lines.reduce(function(s,x){ return s + x.disc; }, 0) - goods;   /* everything else that came off: codes, offers, wallet */
  lines.forEach(function(x){ x.disc += rest*x.gross/allGross; x.net = x.gross - x.disc; });
  return lines;
}
function zy_pl(pk, scope){
  var z = zy_st(), F = z.fin, PER = zy_period(pk), all = zy_orders();
  var inc = all.filter(function(o){ return scope==='booked' ? (o.status!=='cancelled' && zy_in(o.createdAt, PER)) : (o.status==='delivered' && zy_in(o.deliveredAt, PER)); });
  var R = {P:PER, scope:scope, orders:inc, n:inc.length, units:0, sales:0, delivery:0, exRev:0, cogs:0, exCogs:0, writeoff:0, courier:0, codFee:0, ret:0, gw:0, pack:0, msgs:0, ads:0, adsSrc:{}, exp:0, expBy:{}, sal:0, salBy:{}, est:0,
    byDay:{}, byStyle:{}, byCat:{}, byCombo:{}, refused:[], exch:[]};
  var day = function(ts){ var k = zy_dk(ts); return R.byDay[k] = R.byDay[k] || {k:k, n:0, rev:0, cogs:0, ops:0}; };
  inc.forEach(function(o){
    var cc = zy_courierCost(o, scope!=='booked'), cg = zy_cogs(o), gw = zy_gw(o), d = day(scope==='booked' ? o.createdAt : o.deliveredAt);
    R.sales += (o.total||0) - (o.delivery||0); R.delivery += o.delivery||0; R.cogs += cg;
    R.courier += cc.charge; R.codFee += cc.fee; R.ret += cc.ret; if(cc.est) R.est++; R.gw += gw; R.pack += +F.pack||0;
    d.n++; d.rev += o.total||0; d.cogs += cg; d.ops += cc.charge + cc.fee + cc.ret + gw + (+F.pack||0);
    zy_lineNet(o).forEach(function(x){
      var l = x.l, p = P(l.product), q = l.qty||1, c = q*zy_cost(l.product, l.size); R.units += q;
      var add = function(map, key, name){ var r = map[key] = map[key] || {key:key, name:name, units:0, gross:0, disc:0, net:0, cogs:0, orders:{}}; r.units += q; r.gross += x.gross; r.disc += x.disc; r.net += x.net; r.cogs += c; r.orders[o.id] = 1; };
      add(R.byStyle, l.product, p ? p.name : l.product);
      add(R.byCat, p ? p.cat : '?', p ? ((CAT(p.cat)||{}).name || p.cat) : '?');
      var cmb = l.setLabel || x.combo; add(R.byCombo, cmb || '—', cmb ? bagSetName(cmb)+(x.combo && !l.setLabel ? zy(' (auto)',' (নিজে থেকে)') : '') : zy('Single items (no set)','আলাদা আইটেম (সেট নয়)'));
    });
  });
  /* parcels that came back in the period: the return charge is ours (delivered view; the booked view already has it) */
  if(scope!=='booked'){
    all.forEach(function(o){ var p = zk_parcelOf(o.id); if(!p || ['refused','returned','restocked'].indexOf(p.st)<0) return;
      var h = (p.hist||[]).filter(function(x){ return x.s==='refused'; })[0], at = h ? h.at : p.at; if(!zy_in(at, PER)) return;
      var c = zk_c(p.courier) || {ret:0}; R.ret += c.ret; R.refused.push({o:o, ret:c.ret}); day(at).ops += c.ret; });
  }
  /* exchanges finished in the period (rider swapped the items, old item checked) */
  all.forEach(function(o){ (o.exchanges||[]).forEach(function(x){ if(x.status!=='completed' || !zy_in(x.doneAt, PER) || !x.zy) return;
    var l = o.lines[x.lineIdx] || {}, oldC = zy_cost(l.product, l.size), rec = x.qc==='good' ? 1 : x.qc==='b' ? (+F.bPct||0)/100 : 0, newC = zy_cost(x.newItem.product, x.newItem.size);
    var rev = (x.codDue||0) - (x.walletPosted ? (x.walletCredit||0) : 0), cogs = newC - Math.round(oldC*rec), cour = (x.swap && x.swap.charge) || 0;
    R.exRev += rev; R.exCogs += cogs; R.courier += cour; R.exch.push({o:o, x:x, rev:rev, cogs:cogs, cour:cour});
    var d = day(x.doneAt); d.rev += rev; d.cogs += cogs; d.ops += cour; }); });
  /* QC write-offs on parcels that came back (B-grade / damaged) */
  z.qc.forEach(function(q){ if(!zy_in(q.at, PER)) return; R.writeoff += q.loss; day(q.at).cogs += q.loss; });
  /* period costs: messages, ad spend, expenses, salaries */
  all.forEach(function(o){ (o.notif||[]).forEach(function(n){ if(!/^sent/.test(n.st||'') || !zy_in(n.at, PER)) return; var c = zy_msgCost(n); R.msgs += c; day(n.at).ops += c; }); });
  PER.days.forEach(function(dd){
    var a = zy_adsDay(dd); R.ads += a.amt; R.adsSrc[a.src] = 1; day(dd).ops += a.amt;
    z.emp.forEach(function(e){ var s = zy_salaryDay(e, dd); if(!s) return; R.sal += s; R.salBy[e.id] = (R.salBy[e.id]||0) + s; day(dd).ops += s; });
  });
  z.exp.forEach(function(e){ if(e.void) return; var at = new Date(e.date+'T12:00').getTime(); var ad = zy_dayStart(at); if(!(ad >= zy_dayStart(PER.from) && ad <= zy_dayStart(PER.to))) return; R.exp += +e.amt; R.expBy[e.head] = (R.expBy[e.head]||0) + (+e.amt); day(at).ops += +e.amt; });
  R.sal = Math.round(R.sal); Object.keys(R.salBy).forEach(function(k){ R.salBy[k] = Math.round(R.salBy[k]); });
  R.msgs = Math.round(R.msgs*100)/100;
  R.revenue = R.sales + R.delivery + R.exRev;
  R.cogsAll = R.cogs + R.exCogs + R.writeoff;
  R.gross = R.revenue - R.cogsAll;
  R.opsOrder = R.courier + R.codFee + R.ret + R.gw + R.pack;
  R.opsPeriod = Math.round(R.msgs) + R.ads + R.exp + R.sal;
  R.net = R.gross - R.opsOrder - R.opsPeriod;
  return R;
}

/* =====================================================================
   FINANCE PAGE
   ===================================================================== */
PAGES['zy-fin'] = { layout:'admin', title:'Finance & P&L', render:function(params, q){
  var z = zy_st(), F = z.fin, tab = (q && q.tab) || 'pl';
  var head = zy_head('Admin · Finance '+zs_pr('342–355 · 504 · 536 · 537 · 568'), 'Finance & P&L', 'হিসাব ও লাভ-ক্ষতি',
    'Profit and loss from this shop\'s own orders, parcels, costs and expenses. The ERP keeps the real books; this is the owner\'s dashboard view.',
    'দোকানের নিজের অর্ডার, পার্সেল, খরচ আর বেতন থেকে লাভ-ক্ষতি। আসল হিসাবের খাতা ERP-তে থাকে; এটা মালিকের ড্যাশবোর্ড।', zs_simTag(zy('Demo · no real money','ডেমো · আসল টাকা নয়'))+zy_actorBar());
  if(!zy_can('finance','view')) return '<div class="zs-page zy-page">'+head+zy_noAccess('finance')+'</div>';
  var tabs = zo_tabs('#/admin/finance', [['pl',zy('Profit & loss','লাভ-ক্ষতি')],['day',zy('By day','দিন অনুযায়ী')],['style',zy('By style','স্টাইল অনুযায়ী')],['cat',zy('By category','ক্যাটাগরি অনুযায়ী')],['combo',zy('By combo / set','কম্বো / সেট অনুযায়ী')],['costs',zy('Costs & fees','খরচ ও ফি')],['ads',zy('Ad spend','বিজ্ঞাপন খরচ')]], tab);
  var R = zy_pl(F.period, F.scope);
  var filt = '<div class="zy-filt" role="group" aria-label="'+zy_e('Period and view','সময় আর হিসাবের ধরন')+'"><div class="zs-pages">'+ZY_PERIODS.map(function(p){ return '<button type="button" class="chip'+(F.period===p[0]?' on':'')+'" data-act="zy-fin-p" data-v="'+p[0]+'" aria-pressed="'+(F.period===p[0])+'">'+zy_e(p[1],p[2])+'</button>'; }).join('')+'</div>'+
    '<div class="zs-pages"><button type="button" class="chip'+(F.scope==='delivered'?' on':'')+'" data-act="zy-fin-s" data-v="delivered" aria-pressed="'+(F.scope==='delivered')+'">'+zy_e('Delivered only','শুধু ডেলিভারি হওয়া')+'</button><button type="button" class="chip'+(F.scope==='booked'?' on':'')+'" data-act="zy-fin-s" data-v="booked" aria-pressed="'+(F.scope==='booked')+'">'+zy_e('All booked orders','সব বুক হওয়া অর্ডার')+'</button>'+
    '<button type="button" class="btn btn-sm btn-secondary" data-act="zy-fin-csv" data-testid="zy-csv">'+ico('share',14)+zy_e('Export CSV','CSV ডাউনলোড')+'</button></div></div>'+
    '<div class="zs-mini mb12">'+esc(F.scope==='delivered' ? zy('Delivered only: orders delivered in the period (cash really earned). Returns, exchanges and write-offs count on the day they happen.','শুধু ডেলিভারি: এই সময়ে যে অর্ডার পৌঁছেছে (আসল আয়)। ফেরত, এক্সচেঞ্জ আর নষ্ট মাল যেদিন হয় সেদিন ধরা হয়।') : zy('All booked: every order placed in the period except cancelled ones — what the day looks like if everything is delivered. Courier cost is an estimate until booked.','সব বুক: এই সময়ে আসা সব অর্ডার (বাতিল বাদে) — সব ডেলিভারি হলে কেমন দাঁড়ায়। কুরিয়ার বুক না হওয়া পর্যন্ত খরচ আনুমানিক।'))+'</div>';
  var body = tab==='day' ? zy_finDay(R) : tab==='style' ? zy_finBreak(R, 'byStyle', zy('Style','স্টাইল')) : tab==='cat' ? zy_finBreak(R, 'byCat', zy('Category','ক্যাটাগরি')) : tab==='combo' ? zy_finBreak(R, 'byCombo', zy('Combo / set','কম্বো / সেট')) : tab==='costs' ? zy_finCosts() : tab==='ads' ? zy_finAds(R) : zy_finPL(R);
  return '<div class="zs-page zy-page">'+head+tabs+(tab==='costs' ? '' : filt)+body+'</div>';
}};
function zy_m(n){ return esc(fmt(n)); }
function zy_plRow(label, v, cls, sub, neg){ return '<tr class="'+(cls||'')+'"><td>'+esc(label)+(sub?'<div class="zs-mini">'+esc(sub)+'</div>':'')+'</td><td>'+(neg && v ? '−' : '')+zy_m(Math.abs(v))+'</td></tr>'; }
function zy_finPL(R){
  var z = zy_st(), pct = function(a){ return R.revenue ? Math.round(a/R.revenue*1000)/10+'%' : '—'; };
  var kp = '<div class="zs-kpis k6">'+zy_kpi(R.n, zy('Orders','অর্ডার'), R.units+' '+zy('pieces','পিস'))+zy_kpi(zy_m(R.revenue), zy('Revenue','আয়'), zy('incl. delivery charges','ডেলিভারি চার্জসহ'))+
    zy_kpi(zy_m(R.cogsAll), zy('Cost of goods','মালের দাম (COGS)'), pct(R.cogsAll))+zy_kpi(zy_m(R.gross), zy('Gross profit','মোট লাভ'), pct(R.gross), R.gross>=0?'ok':'bad')+
    zy_kpi(zy_m(R.opsOrder+R.opsPeriod), zy('Running costs','চালানোর খরচ'), zy('courier, fees, ads, staff','কুরিয়ার, ফি, বিজ্ঞাপন, বেতন'))+zy_kpi(zy_m(R.net), R.net>=0 ? zy('Net profit','নিট লাভ') : zy('Net loss','নিট ক্ষতি'), pct(R.net), R.net>=0?'ok':'bad')+'</div>';
  var heads = Object.keys(R.expBy).map(function(h){ var x = z.heads.filter(function(y){ return y.id===h; })[0]; return zy_plRow('   '+(x ? zy(x.en, x.bn) : h), R.expBy[h], 'sub', null, true); }).join('');
  var sal = Object.keys(R.salBy).map(function(id){ var e = zy_emp(id); return zy_plRow('   '+(e ? e.name : id), R.salBy[id], 'sub', null, true); }).join('');
  var t = '<table class="zo-tbl zy-pl" data-testid="zy-pl"><tbody>'+
    '<tr class="hd"><td colspan="2">'+zy_e('Revenue','আয়')+'</td></tr>'+
    zy_plRow(zy('Product sales (after set prices, codes and offers)','প্রোডাক্ট বিক্রি (সেট দাম, কোড আর অফার বাদে)'), R.sales)+
    zy_plRow(zy('Delivery charges paid by customers','কাস্টমারের দেওয়া ডেলিভারি চার্জ'), R.delivery)+
    (R.exRev ? zy_plRow(zy('Exchanges (price difference + exchange charge − wallet credit)','এক্সচেঞ্জ (দামের পার্থক্য + চার্জ − ওয়ালেট ক্রেডিট)'), R.exRev) : '')+
    zy_plRow(zy('Total revenue','মোট আয়'), R.revenue, 'tot')+
    '<tr class="hd"><td colspan="2">'+zy_e('Cost of goods','মালের দাম')+'</td></tr>'+
    zy_plRow(zy('Products sold (variant cost from the ERP)','বিক্রি হওয়া মাল (ERP-র ভ্যারিয়েন্ট দাম)'), R.cogs, '', null, true)+
    (R.exCogs ? zy_plRow(zy('Exchanges (new item − value of the item back)','এক্সচেঞ্জ (নতুন মাল − ফেরত মালের দাম)'), R.exCogs, '', null, true) : '')+
    (R.writeoff ? zy_plRow(zy('Write-offs (B-grade / damaged returns)','নষ্ট / বি-গ্রেড ফেরত মাল'), R.writeoff, '', null, true) : '')+
    zy_plRow(zy('Gross profit','মোট লাভ'), R.gross, 'tot '+(R.gross<0?'bad':''))+
    '<tr class="hd"><td colspan="2">'+zy_e('Order costs','অর্ডারের খরচ')+'</td></tr>'+
    zy_plRow(zy('Courier delivery charges','কুরিয়ার ডেলিভারি চার্জ'), R.courier, '', R.est ? zy(R.est+' order(s) estimated — not booked yet', R.est+'টা অর্ডার আনুমানিক — এখনো বুক হয়নি') : null, true)+
    zy_plRow(zy('Courier COD fee','কুরিয়ারের COD ফি'), R.codFee, '', null, true)+
    (R.ret ? zy_plRow(zy('Return charges (refused parcels)','ফেরত চার্জ (পার্সেল নেয়নি)'), R.ret, '', null, true) : '')+
    zy_plRow(zy('Payment gateway fees (bKash, Nagad, card)','পেমেন্ট গেটওয়ে ফি (বিকাশ, নগদ, কার্ড)'), R.gw, '', null, true)+
    zy_plRow(zy('Packaging (per parcel)','প্যাকেজিং (প্রতি পার্সেল)'), R.pack, '', null, true)+
    '<tr class="hd"><td colspan="2">'+zy_e('Period costs','সময়ের খরচ')+'</td></tr>'+
    zy_plRow(zy('SMS, WhatsApp and email','SMS, হোয়াটসঅ্যাপ আর ইমেইল'), Math.round(R.msgs), '', null, true)+
    zy_plRow(zy('Ad spend','বিজ্ঞাপন খরচ'), R.ads, '', R.adsSrc.ads ? zy('today from the Ads page (sample) — enter the real figure on Ad spend','আজকেরটা Ads পেজ থেকে (নমুনা) — আসলটা Ad spend-এ লিখুন') : null, true)+
    zy_plRow(zy('Expenses','খরচ'), R.exp, '', null, true)+heads+
    zy_plRow(zy('Salaries (monthly salary ÷ days in the month, per day)','বেতন (মাসিক বেতন ÷ মাসের দিন, প্রতিদিন)'), R.sal, '', null, true)+sal+
    zy_plRow(R.net>=0 ? zy('Net profit','নিট লাভ') : zy('Net loss','নিট ক্ষতি'), R.net, 'tot big '+(R.net<0?'bad':'ok'))+
    '</tbody></table>';
  return kp+'<div class="zs-g2"><section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Profit & loss','লাভ-ক্ষতি')+'</h2>'+zs_pr('342 · 504')+'</div><div class="zo-tw mt8">'+t+'</div></section>'+
    '<section class="zs-card"><h2>'+zy_e('Where the numbers come from','সংখ্যাগুলো কোথা থেকে আসে')+'</h2><div class="zs-list mt8">'+
      [[zy('Orders','অর্ডার'), zy('Revenue = each order\'s total as charged (after set prices, codes, wallet and free delivery).','আয় = প্রতিটা অর্ডারের মোট টাকা (সেট দাম, কোড, ওয়ালেট আর ফ্রি ডেলিভারির পরে)।'), '#/admin/orders'],
       [zy('Variant cost','ভ্যারিয়েন্টের দাম'), zy('From the ERP mirror; big sizes can cost more. Edit on Costs & fees.','ERP থেকে; বড় সাইজের দাম বেশি হতে পারে। Costs & fees-এ বদলান।'), '#/admin/finance?tab=costs'],
       [zy('Courier','কুরিয়ার'), zy('The booked parcel\'s rate + the courier\'s COD fee; return charge if refused.','বুক করা পার্সেলের রেট + COD ফি; না নিলে ফেরত চার্জ।'), '#/admin/couriers?tab=money'],
       [zy('Expenses & salaries','খরচ ও বেতন'), zy('Entered on Expenses & salaries; salary is spread over the days of the month.','Expenses & salaries-এ লেখা; বেতন মাসের দিনে ভাগ হয়।'), '#/admin/expenses'],
       [zy('Messages','মেসেজ'), zy('Every SMS / WhatsApp in the Messages log × the price per message.','Messages log-এর প্রতিটা SMS / হোয়াটসঅ্যাপ × প্রতি মেসেজের দাম।'), '#/admin/comms']].map(function(x){ return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(x[0])+'</div><div class="m">'+esc(x[1])+'</div></div><div class="r"><a class="btn btn-sm btn-ghost" href="'+x[2]+'">'+zy_e('Open','খুলুন')+'</a></div></div>'; }).join('')+
    '</div><div class="zs-note mt12">'+ico('info',16)+'<span>'+zy_e('The ERP is the master of the books (B3.7). This page never posts journals; expenses go to the ERP as one document per head per month.','হিসাবের মূল খাতা ERP (B3.7)। এই পেজ কোনো জার্নাল লেখে না; খরচ মাসে খাত-প্রতি একটা ডকুমেন্ট হয়ে ERP-তে যায়।')+'</span></div></section></div>';
}
function zy_finDay(R){
  var rows = Object.keys(R.byDay).sort().reverse().map(function(k){ var d = R.byDay[k]; return {k:k, n:d.n, rev:d.rev, cogs:d.cogs, gross:d.rev-d.cogs, ops:Math.round(d.ops), net:Math.round(d.rev-d.cogs-d.ops)}; });
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('By day','দিন অনুযায়ী')+'</h2>'+zs_pr('342 · 504')+'</div><div class="zo-tw mt8"><table class="zo-tbl"><thead><tr><th>'+zy_e('Day','দিন')+'</th><th>'+zy_e('Orders','অর্ডার')+'</th><th>'+zy_e('Revenue','আয়')+'</th><th>'+zy_e('Cost of goods','মালের দাম')+'</th><th>'+zy_e('Gross','মোট লাভ')+'</th><th>'+zy_e('Running costs','চালানোর খরচ')+'</th><th>'+zy_e('Net','নিট')+'</th></tr></thead><tbody>'+
    (rows.length ? rows.map(function(r){ return '<tr><td>'+esc(dateStr(new Date(r.k+'T12:00').getTime()))+'</td><td>'+r.n+'</td><td>'+zy_m(r.rev)+'</td><td>'+zy_m(r.cogs)+'</td><td>'+zy_m(r.gross)+'</td><td>'+zy_m(r.ops)+'</td><td class="'+(r.net<0?'bad':'ok')+'">'+zy_m(r.net)+'</td></tr>'; }).join('') : '<tr><td colspan="7">'+zy_e('Nothing in this period.','এই সময়ে কিছু নেই।')+'</td></tr>')+
    '<tr class="tot"><td>'+zy_e('Total','মোট')+'</td><td>'+R.n+'</td><td>'+zy_m(R.revenue)+'</td><td>'+zy_m(R.cogsAll)+'</td><td>'+zy_m(R.gross)+'</td><td>'+zy_m(R.opsOrder+R.opsPeriod)+'</td><td class="'+(R.net<0?'bad':'ok')+'">'+zy_m(R.net)+'</td></tr></tbody></table></div></section>';
}
function zy_finBreak(R, key, label){
  var rows = Object.keys(R[key]).map(function(k){ return R[key][k]; }).sort(function(a,b){ return b.net - a.net; });
  var tot = rows.reduce(function(a,r){ a.u += r.units; a.g += r.gross; a.d += r.disc; a.n += r.net; a.c += r.cogs; return a; }, {u:0,g:0,d:0,n:0,c:0});
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Profit by ','লাভ — ')+esc(label.toLowerCase ? label : label)+'</h2>'+zs_pr('536 · 537')+'</div><div class="zs-sub">'+zy_e('Gross profit per line: sales after its share of the set saving and codes, minus its variant cost. Courier, ads and staff are on the P&L tab.','প্রতি লাইনের মোট লাভ: সেট-ছাড় আর কোডের ভাগ বাদে বিক্রি, বিয়োগ মালের দাম। কুরিয়ার, বিজ্ঞাপন আর বেতন P&L ট্যাবে।')+'</div>'+
    '<div class="zo-tw"><table class="zo-tbl" data-testid="zy-break"><thead><tr><th>'+esc(label)+'</th><th>'+zy_e('Orders','অর্ডার')+'</th><th>'+zy_e('Pieces','পিস')+'</th><th>'+zy_e('Full price','পুরো দাম')+'</th><th>'+zy_e('Discounts','ছাড়')+'</th><th>'+zy_e('Sales','বিক্রি')+'</th><th>'+zy_e('Cost','দাম')+'</th><th>'+zy_e('Gross profit','মোট লাভ')+'</th><th>'+zy_e('Margin','মার্জিন')+'</th></tr></thead><tbody>'+
    (rows.length ? rows.map(function(r){ var gp = r.net - r.cogs; return '<tr><td><b>'+esc(r.name)+'</b></td><td>'+Object.keys(r.orders).length+'</td><td>'+r.units+'</td><td>'+zy_m(r.gross)+'</td><td>'+(Math.round(r.disc) ? '−'+zy_m(r.disc) : '—')+'</td><td>'+zy_m(r.net)+'</td><td>'+zy_m(r.cogs)+'</td><td class="'+(gp<0?'bad':'ok')+'">'+zy_m(gp)+'</td><td>'+(r.net ? Math.round(gp/r.net*100)+'%' : '—')+'</td></tr>'; }).join('') : '<tr><td colspan="9">'+zy_e('Nothing in this period.','এই সময়ে কিছু নেই।')+'</td></tr>')+
    '<tr class="tot"><td>'+zy_e('Total','মোট')+'</td><td>'+R.n+'</td><td>'+tot.u+'</td><td>'+zy_m(tot.g)+'</td><td>'+(Math.round(tot.d)?'−'+zy_m(tot.d):'—')+'</td><td>'+zy_m(tot.n)+'</td><td>'+zy_m(tot.c)+'</td><td>'+zy_m(tot.n-tot.c)+'</td><td>'+(tot.n?Math.round((tot.n-tot.c)/tot.n*100)+'%':'—')+'</td></tr></tbody></table></div>'+
    '<div class="zs-mini mt8">'+zy_e('Sales here are goods only (no delivery charge), so the total matches “Product sales” on the P&L.','এখানে বিক্রি মানে শুধু মাল (ডেলিভারি চার্জ নয়), তাই মোট P&L-এর “Product sales”-এর সাথে মেলে।')+'</div></section>';
}
function zy_finCosts(){
  var F = zy_st().fin, rows = DB.products.map(function(p){ return '<tr><td><b>'+esc(p.name)+'</b><div class="zs-mini">'+esc((CAT(p.cat)||{}).name||p.cat)+' · '+zy_e('price','দাম')+' '+zy_m(p.price)+'</div></td><td><input class="input zs-in zy-cin" type="number" inputmode="numeric" min="1" max="100000" step="10" value="'+zy_baseCost(p.id)+'" data-change="zy-cost" data-id="'+esc(p.id)+'" aria-label="'+esc(zy('Cost of ','দাম: ')+p.name)+'"></td><td>'+Math.round((p.price-zy_baseCost(p.id))/p.price*100)+'%</td></tr>'; }).join('');
  var fld = function(k, en, bn, unit, min, max, step){ return '<label class="zy-fld"><span>'+zy_e(en,bn)+'</span><span class="zy-fin"><input class="input zs-in" type="number" min="'+min+'" max="'+max+'" step="'+(step||'any')+'" value="'+esc(F[k])+'" data-change="zy-fset" data-k="'+k+'" data-min="'+min+'" data-max="'+max+'" aria-label="'+zy_e(en,bn)+'"><i>'+esc(unit)+'</i></span></label>'; };
  return '<div class="zs-g2"><section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Fees and per-order costs','ফি আর অর্ডার-প্রতি খরচ')+'</h2>'+zs_pr('346 · B3.9')+'</div><div class="zs-sub">'+zy_e('Used by the P&L at once. Courier rates live on Couriers → Courier accounts.','P&L সাথে সাথে এগুলো ব্যবহার করে। কুরিয়ারের রেট Couriers → Courier accounts-এ।')+'</div><div class="zy-flds">'+
    fld('gwBkash','bKash fee','বিকাশ ফি','%',0,10,0.01)+fld('gwNagad','Nagad fee','নগদ ফি','%',0,10,0.01)+fld('gwCard','Card fee','কার্ড ফি','%',0,10,0.01)+fld('pack','Packaging per parcel','প্রতি পার্সেলে প্যাকেজিং','৳',0,500,1)+
    fld('sms','Price per SMS','প্রতি SMS-এর দাম','৳',0,10,0.01)+fld('wa','Price per WhatsApp message','প্রতি হোয়াটসঅ্যাপ মেসেজের দাম','৳',0,20,0.01)+fld('email','Price per email','প্রতি ইমেইলের দাম','৳',0,10,0.01)+
    fld('bigExtra','Extra cost for big sizes','বড় সাইজে বাড়তি দাম','৳',0,2000,5)+fld('bPct','B-grade item keeps this much of its cost','বি-গ্রেড মালের দাম যতটা থাকে','%',0,100,1)+fld('settleDays','Courier pays COD within','কুরিয়ার COD দেয় এর মধ্যে','days',1,30,1)+
    '<label class="zy-fld"><span>'+zy_e('Big sizes (comma list)','বড় সাইজ (কমা দিয়ে)')+'</span><input class="input zs-in" value="'+esc(F.bigSizes)+'" data-change="zy-fset-t" data-k="bigSizes" aria-label="'+zy_e('Big sizes','বড় সাইজ')+'"></label></div></section>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Variant cost (ERP mirror)','ভ্যারিয়েন্টের দাম (ERP থেকে)')+'</h2>'+zs_simTag(zy('Sample costs','নমুনা দাম'))+'</div><div class="zs-sub">'+zy_e('The ERP owns cost prices; the real sync overwrites these. A variant costs the base cost, plus the big-size extra for the sizes listed.','মালের কেনা দাম ERP-র; আসল সিঙ্ক এগুলো বদলে দেবে। ভ্যারিয়েন্টের দাম = মূল দাম, তালিকার বড় সাইজে বাড়তি যোগ হয়।')+'</div>'+
    '<div class="zo-tw"><table class="zo-tbl"><thead><tr><th>'+zy_e('Product','প্রোডাক্ট')+'</th><th>'+zy_e('Base cost ৳','মূল দাম ৳')+'</th><th>'+zy_e('Margin at full price','পুরো দামে মার্জিন')+'</th></tr></thead><tbody>'+rows+'</tbody></table></div></section></div>';
}
function zy_finAds(R){
  var F = zy_st().fin, P = R.P;
  var rows = P.days.slice().reverse().map(function(d){ var k = zy_dk(d), a = zy_adsDay(d); return '<tr><td>'+esc(dateStr(d))+'</td><td>'+zy_m(a.amt)+'</td><td>'+esc(a.src==='entered' ? zy('Entered by ','লিখেছেন ')+(F.ads[k].by||'') : a.src==='ads' ? zy('Ads page today (sample)','আজ Ads পেজ থেকে (নমুনা)') : zy('Nothing entered','কিছু লেখা নেই'))+'</td><td><button type="button" class="btn btn-sm btn-ghost" data-act="zy-ads-edit" data-k="'+k+'">'+ico('edit',14)+zy_e('Enter','লিখুন')+'</button></td></tr>'; }).join('');
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Ad spend per day','দিনে বিজ্ঞাপন খরচ')+'</h2>'+zs_pr('B3.10 · 504')+'</div><div class="zs-sub">'+zy_e('Meta, Google, YouTube and TikTok together. Today uses the Ads page until you enter the real figure; past days count only what you enter — nothing is invented.','মেটা, গুগল, ইউটিউব আর টিকটক মিলিয়ে। আসল সংখ্যা না লেখা পর্যন্ত আজকেরটা Ads পেজ থেকে আসে; আগের দিন শুধু যা লিখবেন — কিছু বানানো হয় না।')+'</div>'+
    '<div class="zo-tw"><table class="zo-tbl"><thead><tr><th>'+zy_e('Day','দিন')+'</th><th>'+zy_e('Spend','খরচ')+'</th><th>'+zy_e('Source','কোথা থেকে')+'</th><th></th></tr></thead><tbody>'+rows+'<tr class="tot"><td>'+zy_e('Total','মোট')+'</td><td>'+zy_m(R.ads)+'</td><td></td><td></td></tr></tbody></table></div></section>';
}
ACT['zy-fin-p'] = function(el){ zy_st().fin.period = el.getAttribute('data-v'); saveState(); rerender(); };
ACT['zy-fin-s'] = function(el){ zy_st().fin.scope = el.getAttribute('data-v'); saveState(); rerender(); };
ACT['zy-fin-csv'] = function(){
  var z = zy_st(), R = zy_pl(z.fin.period, z.fin.scope), per = (ZY_PERIODS.filter(function(p){ return p[0]===z.fin.period; })[0]||[])[1];
  var rows = [['EXTAS · Profit & loss', per, z.fin.scope==='booked' ? 'All booked orders' : 'Delivered only', 'exported '+dateTimeStr(Date.now())], [], ['Line','Amount (BDT)'],
    ['Orders', R.n], ['Pieces', R.units], ['Product sales', R.sales], ['Delivery charges', R.delivery], ['Exchanges (net)', R.exRev], ['Total revenue', R.revenue],
    ['Cost of goods sold', R.cogs], ['Exchange cost (net)', R.exCogs], ['Write-offs', R.writeoff], ['Gross profit', R.gross],
    ['Courier charges', R.courier], ['COD fee', R.codFee], ['Return charges', R.ret], ['Gateway fees', R.gw], ['Packaging', R.pack], ['Messages', Math.round(R.msgs)], ['Ad spend', R.ads], ['Expenses', R.exp], ['Salaries', R.sal], ['Net profit', R.net], [],
    ['By style','Orders','Pieces','Full price','Discounts','Sales','Cost','Gross profit']];
  Object.keys(R.byStyle).forEach(function(k){ var r = R.byStyle[k]; rows.push([r.name, Object.keys(r.orders).length, r.units, Math.round(r.gross), Math.round(r.disc), Math.round(r.net), r.cogs, Math.round(r.net-r.cogs)]); });
  rows.push([], ['By category','Orders','Pieces','Full price','Discounts','Sales','Cost','Gross profit']);
  Object.keys(R.byCat).forEach(function(k){ var r = R.byCat[k]; rows.push([r.name, Object.keys(r.orders).length, r.units, Math.round(r.gross), Math.round(r.disc), Math.round(r.net), r.cogs, Math.round(r.net-r.cogs)]); });
  rows.push([], ['By combo / set','Orders','Pieces','Full price','Discounts','Sales','Cost','Gross profit']);
  Object.keys(R.byCombo).forEach(function(k){ var r = R.byCombo[k]; rows.push([r.name, Object.keys(r.orders).length, r.units, Math.round(r.gross), Math.round(r.disc), Math.round(r.net), r.cogs, Math.round(r.net-r.cogs)]); });
  rows.push([], ['Order','Status','Total','Delivery','Cost of goods','Courier','COD fee','Gateway']);
  R.orders.forEach(function(o){ var c = zy_courierCost(o); rows.push([o.id, o.status, o.total, o.delivery||0, zy_cogs(o), c.charge, c.fee, zy_gw(o)]); });
  zy_download('extas-pl-'+z.fin.period+'-'+zy_dk(Date.now())+'.csv', zy_csv(rows));
  zy_log('finance', 'Exported the P&L as CSV ('+per+')');
  saveState(); toast(zy('CSV downloaded','CSV ডাউনলোড হয়েছে'));
};
CHANGE['zy-cost'] = function(el){
  var id = el.getAttribute('data-id'), v = zy_num(el.value), p = P(id), old = zy_baseCost(id);
  if(!(v>=1 && v<=100000)){ el.value = old; toast(zy('Enter a cost between ৳1 and ৳100,000','৳১ থেকে ৳১,০০,০০০-এর মধ্যে দাম লিখুন')); return; }
  if(!zy_guard('finance', 'change cost of '+(p?p.name:id))){ el.value = old; return; }
  zy_ask({title:zy('Change cost price?','কেনা দাম বদলাবেন?'), html:'<p class="small">'+esc((p?p.name:id)+': '+fmt(old)+' → '+fmt(v))+'</p><p class="zs-mini">'+zy_e('Every report uses the new cost at once. The ERP sync will overwrite it with the ERP\'s figure.','সব রিপোর্ট সাথে সাথে নতুন দাম ধরবে। ERP সিঙ্ক এলে ERP-র দাম বসবে।')+'</p>',
    fn:function(){ zy_st().cost[id] = Math.round(v); zy_log('finance', 'Cost of '+(p?p.name:id)+' '+fmt(old)+' → '+fmt(v)); toast(zy('Cost saved','দাম সেভ হয়েছে')); }, back:function(){ rerender(); }});
};
CHANGE['zy-fset'] = function(el){
  var k = el.getAttribute('data-k'), v = zy_num(el.value), mn = +el.getAttribute('data-min'), mx = +el.getAttribute('data-max'), F = zy_st().fin, old = F[k];
  if(!(v>=mn && v<=mx)){ el.value = old; toast(zy('Enter a number from '+mn+' to '+mx,''+mn+' থেকে '+mx+'-এর মধ্যে লিখুন')); return; }   /* B7.2 rule 2: min and max on every number */
  if(!zy_guard('finance', 'change '+k)){ el.value = old; return; }
  zy_ask({title:zy('Save this setting?','এই সেটিং সেভ করবেন?'), html:'<p class="small">'+esc(k+': '+old+' → '+v)+'</p>', fn:function(){ F[k] = v; zy_log('finance', 'Finance setting '+k+' '+old+' → '+v); toast(zy('Saved','সেভ হয়েছে')); }, back:function(){ rerender(); }});
};
CHANGE['zy-fset-t'] = function(el){ var k = el.getAttribute('data-k'), F = zy_st().fin, old = F[k], v = String(el.value).trim().slice(0,80); if(!zy_guard('finance','change '+k)){ el.value = old; return; }
  zy_ask({title:zy('Save this setting?','এই সেটিং সেভ করবেন?'), html:'<p class="small">'+esc(old+' → '+v)+'</p>', fn:function(){ F[k] = v; zy_log('finance', 'Finance setting '+k+' → '+v); }, back:function(){ rerender(); }}); };
function zy_adsForm(k){
  var F = zy_st().fin, cur = F.ads[k] ? F.ads[k].amt : '';
  return '<form data-submit="zy-ads" data-k="'+k+'"><label class="label" for="zy-ads-v">'+esc(zy('Ad spend on ','বিজ্ঞাপন খরচ — ')+dateStr(new Date(k+'T12:00').getTime()))+' (৳)</label><input id="zy-ads-v" name="v" class="input" type="number" min="0" max="10000000" step="1" value="'+esc(cur)+'" required>'+
    '<div class="zs-mini mt8">'+zy_e('All platforms together, from their billing pages.','সব প্ল্যাটফর্ম মিলিয়ে, তাদের বিলিং পেজ থেকে।')+'</div><div class="zs-actions mt16"><button class="btn btn-primary">'+zy_e('Next','পরের ধাপ')+'</button></div></form>';
}
ACT['zy-ads-edit'] = function(el){ if(!zy_guard('finance','enter ad spend')) return; var k = el.getAttribute('data-k'); openModal(zy_adsForm(k), {title:zy('Enter ad spend','বিজ্ঞাপন খরচ লিখুন')}); };
SUBMIT['zy-ads'] = function(f){
  var k = f.getAttribute('data-k'), v = zy_num(f.querySelector('[name=v]').value);
  if(!(v>=0 && v<=10000000)){ toast(zy('Enter an amount from ৳0','৳০ বা তার বেশি লিখুন')); return; }
  zy_ask({title:zy('Save ad spend?','বিজ্ঞাপন খরচ সেভ করবেন?'), html:'<p class="small">'+esc(dateStr(new Date(k+'T12:00').getTime())+' · '+fmt(v))+'</p>', back:function(){ openModal(zy_adsForm(k), {title:zy('Enter ad spend','বিজ্ঞাপন খরচ লিখুন')}); },
    fn:function(){ zy_st().fin.ads[k] = {amt:Math.round(v), by:zy_actor().en, at:Date.now()}; zy_log('finance', 'Ad spend for '+k+' set to '+fmt(v)); toast(zy('Ad spend saved','বিজ্ঞাপন খরচ সেভ হয়েছে')); }});
};

/* =====================================================================
   EXPENSES & SALARIES (mirror for the dashboard; the ERP is the master)
   ===================================================================== */
PAGES['zy-exp'] = { layout:'admin', title:'Expenses & salaries', render:function(params, q){
  var z = zy_st(), tab = (q && q.tab) || 'exp';
  var head = zy_head('Admin · Expenses '+zs_pr('B3.8 · 342–355'), 'Expenses & salaries', 'খরচ ও বেতন',
    'Quick entries for the dashboard: packaging, rent, bills, staff salaries. This is a mirror — the ERP is the master of the books and gets one expense document per head per month.',
    'ড্যাশবোর্ডের জন্য ছোট এন্ট্রি: প্যাকেজিং, ভাড়া, বিল, কর্মচারীর বেতন। এটা আয়না — হিসাবের মূল খাতা ERP, সেখানে মাসে খাত-প্রতি একটা ডকুমেন্ট যায়।', zs_simTag(zy('Mirror · ERP is the master','আয়না · মূল খাতা ERP'))+zy_actorBar());
  if(!zy_can('expenses','view')) return '<div class="zs-page zy-page">'+head+zy_noAccess('expenses')+'</div>';
  var tabs = zo_tabs('#/admin/expenses', [['exp',zy('Expenses','খরচ'), z.exp.filter(function(e){ return !e.void; }).length || ''],['staff',zy('Staff & salaries','কর্মচারী ও বেতন'), z.emp.filter(function(e){ return e.active; }).length],['heads',zy('Expense heads','খরচের খাত')],['erp',zy('ERP push','ERP-তে পাঠানো')]], tab);
  var body = tab==='staff' ? zy_expStaff() : tab==='heads' ? zy_expHeads() : tab==='erp' ? zy_expErp() : zy_expList();
  return '<div class="zs-page zy-page">'+head+'<div class="zs-note mb16">'+ico('info',16)+'<span>'+zy_e('Mirror for the dashboard — the ERP is the master. Nothing here moves money; it only records what was spent.','ড্যাশবোর্ডের আয়না — মূল খাতা ERP। এখানে কোনো টাকা নড়ে না; শুধু খরচ লেখা থাকে।')+'</span></div>'+tabs+body+'</div>';
}};
function zy_headName(id){ var h = zy_st().heads.filter(function(x){ return x.id===id; })[0]; return h ? zy(h.en, h.bn) : id; }
function zy_expList(){
  var z = zy_st(), list = z.exp.slice().sort(function(a,b){ return b.date.localeCompare(a.date) || b.at - a.at; });
  var mk = zy_dk(Date.now()).slice(0,7), month = z.exp.filter(function(e){ return !e.void && e.date.slice(0,7)===mk; }).reduce(function(s,e){ return s + (+e.amt); }, 0);
  var salM = Math.round(z.emp.filter(function(e){ return e.active; }).reduce(function(s,e){ return s + (+e.salary||0); }, 0));
  return '<div class="zs-kpis k4">'+zy_kpi(zy_m(month), zy('Expenses this month','এই মাসের খরচ'), z.exp.filter(function(e){ return !e.void && e.date.slice(0,7)===mk; }).length+' '+zy('entries','এন্ট্রি'))+zy_kpi(zy_m(salM), zy('Salaries per month','মাসিক বেতন'), z.emp.filter(function(e){ return e.active; }).length+' '+zy('people','জন'))+
    zy_kpi(zy_m(Math.round(salM/zy_dim(Date.now()))), zy('Salary per day','দিনে বেতন'), zy('goes into each day\'s P&L','প্রতিদিনের P&L-এ যায়'))+zy_kpi(z.exp.filter(function(e){ return !e.void && !(z.erp[e.date.slice(0,7)+'|'+e.head]); }).length, zy('Not in the ERP yet','এখনো ERP-তে যায়নি'), zy('pushed at month end','মাস শেষে যায়'), 'warn')+'</div>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Expenses','খরচ')+'</h2><button type="button" class="btn btn-sm btn-primary" data-act="zy-exp-new" data-testid="zy-exp-new">'+ico('plus',14)+zy_e('Add expense','খরচ যোগ করুন')+'</button></div>'+
    (list.length ? '<div class="zo-tw mt8"><table class="zo-tbl" data-testid="zy-exp-tbl"><thead><tr><th>'+zy_e('Date · head','তারিখ · খাত')+'</th><th>'+zy_e('Amount','টাকা')+'</th><th>'+zy_e('Paid from','কোথা থেকে')+'</th><th>'+zy_e('By','কে লিখেছে')+'</th><th>'+zy_e('ERP','ERP')+'</th><th></th></tr></thead><tbody>'+
      list.map(function(e){ var pushed = z.erp[e.date.slice(0,7)+'|'+e.head]; return '<tr class="'+(e.void?'zy-void':'')+'"><td><b>'+esc(zy_headName(e.head))+'</b><div class="zs-mini">'+esc(dateStr(new Date(e.date+'T12:00').getTime()))+(e.note?' · '+esc(e.note):'')+(e.void?' · '+zy_e('voided','বাতিল')+' ('+esc(e.void.reason)+')':'')+'</div></td><td>'+zy_m(e.amt)+'</td><td>'+esc(e.from)+'</td><td>'+esc(e.by)+'</td><td><span class="zo-pill '+(pushed?'ok':'warn')+'">'+(pushed?zy_e('Sent (mock)','পাঠানো (ডেমো)'):zy_e('Waiting','অপেক্ষায়'))+'</span></td><td>'+(e.void||pushed ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-act="zy-exp-edit" data-id="'+e.id+'">'+zy_e('Edit','বদলান')+'</button><button type="button" class="btn btn-sm btn-ghost" data-act="zy-exp-void" data-id="'+e.id+'">'+zy_e('Void','বাতিল')+'</button>')+'</td></tr>'; }).join('')+
      '</tbody></table></div>' : '<div class="zs-mini mt8">'+zy_e('No expenses yet. Add packaging, rent, bills or anything else the shop pays for.','এখনো কোনো খরচ নেই। প্যাকেজিং, ভাড়া, বিল বা দোকানের যেকোনো খরচ যোগ করুন।')+'</div>')+
    '<div class="zs-mini mt8">'+zy_e('Nothing is deleted: a wrong entry is voided with a reason and stays in the list, struck through.','কিছু মোছা হয় না: ভুল এন্ট্রি কারণসহ বাতিল হয় আর কাটা দাগ দিয়ে তালিকায় থাকে।')+'</div></section>';
}
var ZY_FROM = [['Cash','নগদ'],['Bank','ব্যাংক'],['bKash','বিকাশ'],['Nagad','নগদ (মোবাইল)']];
function zy_expForm(e){
  var z = zy_st(); e = e || {date:zy_dk(Date.now()), head:z.heads[0].id, amt:'', from:'Cash', note:''};
  return '<form data-submit="zy-exp" data-id="'+esc(e.id||'')+'" class="zy-form"><div class="zy-g2"><div><label class="label" for="zy-e-d">'+zy_e('Date','তারিখ')+'</label><input id="zy-e-d" name="date" class="input" type="date" value="'+esc(e.date)+'" required></div>'+
    '<div><label class="label" for="zy-e-h">'+zy_e('Head','খাত')+'</label><select id="zy-e-h" name="head" class="input">'+z.heads.map(function(h){ return '<option value="'+esc(h.id)+'"'+(h.id===e.head?' selected':'')+'>'+esc(zy(h.en,h.bn))+'</option>'; }).join('')+'</select></div>'+
    '<div><label class="label" for="zy-e-a">'+zy_e('Amount (৳)','টাকা (৳)')+'</label><input id="zy-e-a" name="amt" class="input" type="number" inputmode="numeric" min="1" max="10000000" step="1" value="'+esc(e.amt)+'" required></div>'+
    '<div><label class="label" for="zy-e-f">'+zy_e('Paid from','কোথা থেকে দেওয়া')+'</label><select id="zy-e-f" name="from" class="input">'+ZY_FROM.map(function(f){ return '<option value="'+f[0]+'"'+(f[0]===e.from?' selected':'')+'>'+esc(zy(f[0],f[1]))+'</option>'; }).join('')+'</select></div></div>'+
    '<label class="label mt12" for="zy-e-n">'+zy_e('Note (optional)','নোট (ইচ্ছা হলে)')+'</label><input id="zy-e-n" name="note" class="input" maxlength="120" value="'+esc(e.note)+'">'+
    '<div class="zs-actions mt16"><button class="btn btn-primary" data-testid="zy-exp-next">'+zy_e('Next','পরের ধাপ')+'</button></div></form>';
}
ACT['zy-exp-new'] = function(){ if(!zy_guard('expenses','add an expense')) return; openModal(zy_expForm(), {title:zy('Add expense','খরচ যোগ করুন')}); };
ACT['zy-exp-edit'] = function(el){ if(!zy_guard('expenses','edit an expense')) return; var e = zy_st().exp.filter(function(x){ return x.id===el.getAttribute('data-id'); })[0]; if(e) openModal(zy_expForm(e), {title:zy('Edit expense','খরচ বদলান')}); };
SUBMIT['zy-exp'] = function(f){
  var z = zy_st(), id = f.getAttribute('data-id'), g = function(n){ return f.querySelector('[name='+n+']').value; };
  var e = {date:g('date'), head:g('head'), amt:zy_num(g('amt')), from:g('from'), note:String(g('note')).trim()};
  if(!/^\d{4}-\d\d-\d\d$/.test(e.date)){ toast(zy('Choose a date','তারিখ বাছুন')); return; }
  if(new Date(e.date+'T00:00').getTime() > Date.now()){ toast(zy('An expense cannot be in the future','ভবিষ্যতের তারিখে খরচ লেখা যায় না')); return; }
  if(!(e.amt>=1 && e.amt<=10000000)){ toast(zy('Enter an amount from ৳1','৳১ বা তার বেশি লিখুন')); return; }
  var old = id ? z.exp.filter(function(x){ return x.id===id; })[0] : null, form = f.outerHTML;
  zy_ask({title:id ? zy('Save the change?','বদলটা সেভ করবেন?') : zy('Save this expense?','এই খরচ সেভ করবেন?'),
    html:'<div class="zo-kv"><span>'+zy_e('Date','তারিখ')+'</span><span>'+esc(dateStr(new Date(e.date+'T12:00').getTime()))+'</span><span>'+zy_e('Head','খাত')+'</span><span>'+esc(zy_headName(e.head))+'</span><span>'+zy_e('Amount','টাকা')+'</span><span>'+zy_m(e.amt)+'</span><span>'+zy_e('Paid from','কোথা থেকে')+'</span><span>'+esc(e.from)+'</span></div>'+(old ? '<p class="zs-mini mt8">'+esc(zy('Was: ','আগে ছিল: ')+fmt(old.amt)+' · '+zy_headName(old.head)+' · '+old.date)+'</p>' : ''),
    back:function(){ openModal(form, {title:zy('Add expense','খরচ যোগ করুন')}); },
    fn:function(){
      if(old){ zy_log('expenses', 'Edited expense '+old.id+': '+fmt(old.amt)+' '+old.head+' '+old.date+' → '+fmt(e.amt)+' '+e.head+' '+e.date, old.id); old.hist = (old.hist||[]).concat([{at:Date.now(), was:{date:old.date, head:old.head, amt:old.amt, from:old.from, note:old.note}, by:zy_actor().en}]); Object.keys(e).forEach(function(k){ old[k] = k==='amt' ? Math.round(e[k]) : e[k]; }); toast(zy('Expense updated','খরচ বদলানো হয়েছে')); }
      else { var n = {id:'XP-'+(z.seq.exp++), date:e.date, head:e.head, amt:Math.round(e.amt), from:e.from, note:e.note, by:zy_actor().en, at:Date.now()}; z.exp.push(n); zy_log('expenses', 'Added expense '+n.id+': '+fmt(n.amt)+' · '+zy_headName(n.head)+' · '+n.date, n.id); toast(zy('Expense saved — in the P&L now','খরচ সেভ হয়েছে — P&L-এ চলে গেছে')); }
    }});
};
ACT['zy-exp-void'] = function(el){
  if(!zy_guard('expenses','void an expense')) return;
  var e = zy_st().exp.filter(function(x){ return x.id===el.getAttribute('data-id'); })[0]; if(!e) return;
  UI.zyVoid = '';
  zy_ask({title:zy('Void this expense?','এই খরচ বাতিল করবেন?'), danger:true, yes:zy('Yes, void it','হ্যাঁ, বাতিল করুন'),
    html:'<p class="small">'+esc(zy_headName(e.head)+' · '+fmt(e.amt)+' · '+e.date)+'</p><label class="label" for="zy-void-r">'+zy_e('Reason','কারণ')+'</label><input id="zy-void-r" class="input" data-input="zy-void-r" maxlength="80" placeholder="'+zy_e('e.g. entered twice','যেমন: দুবার লেখা হয়েছে')+'"><p class="zs-mini mt8">'+zy_e('It stays in the list, struck through, and leaves the P&L.','তালিকায় কাটা দাগসহ থাকবে, P&L থেকে বাদ যাবে।')+'</p>',
    fn:function(){ e.void = {reason:UI.zyVoid || zy('No reason given','কারণ লেখা হয়নি'), at:Date.now(), by:zy_actor().en}; zy_log('expenses', 'Voided expense '+e.id+' ('+fmt(e.amt)+'): '+e.void.reason, e.id); toast(zy('Expense voided','খরচ বাতিল হয়েছে')); }});
};
INPUT['zy-void-r'] = function(el){ UI.zyVoid = String(el.value).trim(); };
function zy_expStaff(){
  var z = zy_st();
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Staff & salaries','কর্মচারী ও বেতন')+'</h2><button type="button" class="btn btn-sm btn-primary" data-act="zy-emp-new" data-testid="zy-emp-new">'+ico('plus',14)+zy_e('Add person','কর্মচারী যোগ করুন')+'</button></div>'+
    '<div class="zs-sub">'+zy_e('Monthly salary is spread over the days of the month (salary ÷ days in that month) and goes into every day\'s P&L. The same people are the support assignees and get the role shown.','মাসিক বেতন মাসের দিনে ভাগ হয় (বেতন ÷ সেই মাসের দিন) আর প্রতিদিনের P&L-এ যায়। এই মানুষরাই সাপোর্টে কাজ পান আর পাশের ভূমিকা অনুযায়ী অনুমতি পান।')+'</div>'+
    '<div class="zo-tw"><table class="zo-tbl" data-testid="zy-emp-tbl"><thead><tr><th>'+zy_e('Name · job','নাম · কাজ')+'</th><th>'+zy_e('Role','ভূমিকা')+'</th><th>'+zy_e('Monthly salary','মাসিক বেতন')+'</th><th>'+zy_e('Per day now','এখন দিনে')+'</th><th>'+zy_e('Since','কবে থেকে')+'</th><th>'+zy_e('Status','অবস্থা')+'</th><th></th></tr></thead><tbody>'+
    z.emp.map(function(e){ var r = zy_role(e.role); return '<tr><td><b>'+esc(e.name)+'</b><div class="zs-mini">'+esc(e.job||'')+'</div></td><td>'+esc(zy(r.en,r.bn))+'</td><td>'+zy_m(e.salary)+'</td><td>'+zy_m(Math.round((+e.salary||0)/zy_dim(Date.now())))+'</td><td>'+esc(dateStr(new Date(e.start+'T12:00').getTime()))+'</td><td><span class="zo-pill '+(e.active?'ok':'')+'">'+(e.active?zy_e('Working','কাজে আছে'):zy_e('Left','চলে গেছে'))+'</span></td><td><button type="button" class="btn btn-sm btn-ghost" data-act="zy-emp-edit" data-id="'+e.id+'">'+zy_e('Edit','বদলান')+'</button></td></tr>'; }).join('')+
    '</tbody></table></div><div class="zs-mini mt8">'+zy_e('The sample staff are demo data. The owner\'s real payroll stays in the ERP.','নমুনা কর্মচারীরা ডেমো ডেটা। মালিকের আসল বেতনের খাতা ERP-তে থাকে।')+'</div></section>';
}
function zy_empForm(e){
  var z = zy_st(); e = e || {name:'', job:'', role:'support', salary:'', start:zy_dk(Date.now()), active:true};
  return '<form data-submit="zy-emp" data-id="'+esc(e.id||'')+'" class="zy-form"><div class="zy-g2"><div><label class="label" for="zy-p-n">'+zy_e('Name','নাম')+'</label><input id="zy-p-n" name="name" class="input" maxlength="60" value="'+esc(e.name)+'" required></div>'+
    '<div><label class="label" for="zy-p-j">'+zy_e('Job','কাজ')+'</label><input id="zy-p-j" name="job" class="input" maxlength="60" value="'+esc(e.job)+'"></div>'+
    '<div><label class="label" for="zy-p-r">'+zy_e('Role (what they may do)','ভূমিকা (কী করতে পারবে)')+'</label><select id="zy-p-r" name="role" class="input">'+z.roles.filter(function(r){ return r.id!=='owner'; }).map(function(r){ return '<option value="'+r.id+'"'+(r.id===e.role?' selected':'')+'>'+esc(zy(r.en,r.bn))+'</option>'; }).join('')+'</select></div>'+
    '<div><label class="label" for="zy-p-s">'+zy_e('Monthly salary (৳)','মাসিক বেতন (৳)')+'</label><input id="zy-p-s" name="salary" class="input" type="number" inputmode="numeric" min="0" max="1000000" step="100" value="'+esc(e.salary)+'" required></div>'+
    '<div><label class="label" for="zy-p-d">'+zy_e('Working since','কবে থেকে কাজে')+'</label><input id="zy-p-d" name="start" class="input" type="date" value="'+esc(e.start)+'" required></div>'+
    '<div><label class="label" for="zy-p-a">'+zy_e('Status','অবস্থা')+'</label><select id="zy-p-a" name="active" class="input"><option value="1"'+(e.active?' selected':'')+'>'+zy_e('Working','কাজে আছে')+'</option><option value="0"'+(!e.active?' selected':'')+'>'+zy_e('Left','চলে গেছে')+'</option></select></div></div>'+
    '<div class="zs-actions mt16"><button class="btn btn-primary" data-testid="zy-emp-next">'+zy_e('Next','পরের ধাপ')+'</button></div></form>';
}
ACT['zy-emp-new'] = function(){ if(!zy_guard('expenses','add a person')) return; openModal(zy_empForm(), {title:zy('Add person','কর্মচারী যোগ করুন')}); };
ACT['zy-emp-edit'] = function(el){ if(!zy_guard('expenses','edit a person')) return; var e = zy_emp(el.getAttribute('data-id')); if(e) openModal(zy_empForm(e), {title:zy('Edit person','কর্মচারীর তথ্য বদলান')}); };
SUBMIT['zy-emp'] = function(f){
  var z = zy_st(), id = f.getAttribute('data-id'), g = function(n){ return f.querySelector('[name='+n+']').value; };
  var e = {name:String(g('name')).trim(), job:String(g('job')).trim(), role:g('role'), salary:zy_num(g('salary')), start:g('start'), active:g('active')==='1'};
  if(e.name.length<2){ toast(zy('Write the person\'s name','নাম লিখুন')); return; }
  if(!(e.salary>=0 && e.salary<=1000000)){ toast(zy('Salary must be ৳0 to ৳10,00,000','বেতন ৳০ থেকে ৳১০,০০,০০০-এর মধ্যে')); return; }
  if(!/^\d{4}-\d\d-\d\d$/.test(e.start)){ toast(zy('Choose the start date','শুরুর তারিখ বাছুন')); return; }
  var old = id ? zy_emp(id) : null, form = f.outerHTML, r = zy_role(e.role);
  zy_ask({title:old ? zy('Save the change?','বদলটা সেভ করবেন?') : zy('Add this person?','এই কর্মচারী যোগ করবেন?'), back:function(){ openModal(form, {title:zy('Add person','কর্মচারী যোগ করুন')}); },
    html:'<div class="zo-kv"><span>'+zy_e('Name','নাম')+'</span><span>'+esc(e.name)+'</span><span>'+zy_e('Role','ভূমিকা')+'</span><span>'+esc(zy(r.en,r.bn))+'</span><span>'+zy_e('Monthly salary','মাসিক বেতন')+'</span><span>'+zy_m(e.salary)+'</span><span>'+zy_e('Per day this month','এই মাসে দিনে')+'</span><span>'+zy_m(Math.round(e.salary/zy_dim(Date.now())))+'</span></div>'+(old && old.salary!==e.salary ? '<p class="zs-mini mt8">'+esc(zy('Salary was ','আগের বেতন ')+fmt(old.salary))+'</p>' : ''),
    fn:function(){
      if(old){ var was = {name:old.name, role:old.role, salary:old.salary, active:old.active}; old.hist = (old.hist||[]).concat([{at:Date.now(), was:was, by:zy_actor().en}]);
        if(old.active && !e.active) old.end = zy_dk(Date.now()); if(e.active) delete old.end;
        Object.keys(e).forEach(function(k){ old[k] = k==='salary' ? Math.round(e[k]) : e[k]; }); zy_log('expenses', 'Edited '+old.name+': salary '+fmt(was.salary)+' → '+fmt(old.salary)+', role '+was.role+' → '+old.role+(was.active!==old.active ? ', '+(old.active?'back at work':'left') : ''), old.id); toast(zy('Saved','সেভ হয়েছে')); }
      else { var n = {id:'e'+(z.seq.emp++), name:e.name, job:e.job, role:e.role, salary:Math.round(e.salary), start:e.start, active:e.active}; z.emp.push(n); zy_log('expenses', 'Added '+n.name+' ('+zy_role(n.role).en+') with salary '+fmt(n.salary)+' a month', n.id); toast(zy('Person added — salary is in the P&L from '+dateStr(new Date(n.start+'T12:00').getTime()),'কর্মচারী যোগ হয়েছে — বেতন P&L-এ যাবে')); }
    }});
};
function zy_expHeads(){
  var z = zy_st();
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Expense heads','খরচের খাত')+'</h2><button type="button" class="btn btn-sm btn-secondary" data-act="zy-head-new">'+ico('plus',14)+zy_e('Add head','খাত যোগ করুন')+'</button></div><div class="zs-sub">'+zy_e('Each head becomes one expense document a month in the ERP. Heads are never deleted.','প্রতিটা খাত মাসে ERP-তে একটা খরচের ডকুমেন্ট হয়। খাত কখনো মোছা হয় না।')+'</div>'+
    '<div class="zs-list">'+z.heads.map(function(h){ var n = z.exp.filter(function(e){ return e.head===h.id && !e.void; }).length; return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(zy(h.en,h.bn))+'</div><div class="m">'+n+' '+zy_e('entries','এন্ট্রি')+'</div></div></div>'; }).join('')+'</div></section>';
}
ACT['zy-head-new'] = function(){ if(!zy_guard('expenses','add a head')) return; openModal('<form data-submit="zy-head"><label class="label" for="zy-h-en">'+zy_e('Name in English','ইংরেজিতে নাম')+'</label><input id="zy-h-en" name="en" class="input" maxlength="40" required><label class="label mt12" for="zy-h-bn">'+zy_e('Name in Bengali','বাংলায় নাম')+'</label><input id="zy-h-bn" name="bn" class="input" maxlength="40"><div class="zs-actions mt16"><button class="btn btn-primary">'+zy_e('Next','পরের ধাপ')+'</button></div></form>', {title:zy('Add expense head','খরচের খাত যোগ করুন')}); };
SUBMIT['zy-head'] = function(f){ var en = String(f.querySelector('[name=en]').value).trim(), bn = String(f.querySelector('[name=bn]').value).trim() || en; if(en.length<2){ toast(zy('Write a name','নাম লিখুন')); return; }
  var id = zo_slug(en) || ('h'+Date.now()); if(zy_st().heads.some(function(h){ return h.id===id; })){ toast(zy('This head already exists','এই খাত আগেই আছে')); return; }
  zy_ask({title:zy('Add this head?','এই খাত যোগ করবেন?'), html:'<p class="small">'+esc(en+' · '+bn)+'</p>', fn:function(){ zy_st().heads.push({id:id, en:en, bn:bn}); zy_log('expenses', 'Added expense head '+en); }}); };
function zy_expErp(){
  var z = zy_st(), groups = {};
  z.exp.forEach(function(e){ if(e.void) return; var k = e.date.slice(0,7)+'|'+e.head; var g = groups[k] = groups[k] || {k:k, month:e.date.slice(0,7), head:e.head, n:0, amt:0}; g.n++; g.amt += +e.amt; });
  var mk = zy_dk(Date.now()).slice(0,7);
  z.emp.forEach(function(){});
  var rows = Object.keys(groups).sort().reverse().map(function(k){ return groups[k]; });
  var salK = mk+'|salary', salAmt = Math.round(z.emp.reduce(function(s,e){ var t = 0; zy_period('month').days.forEach(function(d){ t += zy_salaryDay(e, d); }); return s + t; }, 0));
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('What goes to the ERP','ERP-তে কী যায়')+'</h2><span class="row" style="gap:6px">'+zs_pr('B3.8 · 205')+zs_simTag(zy('ERP on a mock','ERP ডেমো'))+'</span></div><div class="zs-sub">'+zy_e('At month end the shop sends one expense document per head per month. The ERP posts its own journals. Each document has one key, so sending twice never books twice.','মাস শেষে দোকান খাত-প্রতি মাসে একটা খরচের ডকুমেন্ট পাঠায়। জার্নাল ERP নিজে লেখে। প্রতিটা ডকুমেন্টের একটা চাবি, তাই দুবার পাঠালেও দুবার হিসাব হয় না।')+'</div>'+
    '<div class="zo-tw"><table class="zo-tbl"><thead><tr><th>'+zy_e('Month · head','মাস · খাত')+'</th><th>'+zy_e('Entries','এন্ট্রি')+'</th><th>'+zy_e('Amount','টাকা')+'</th><th>'+zy_e('Status','অবস্থা')+'</th><th>'+zy_e('Key','চাবি')+'</th></tr></thead><tbody>'+
    rows.map(function(g){ var p = z.erp[g.k]; return '<tr><td><b>'+esc(g.month)+'</b> · '+esc(zy_headName(g.head))+'</td><td>'+g.n+'</td><td>'+zy_m(g.amt)+'</td><td><span class="zo-pill '+(p?'ok':'warn')+'">'+(p?zy_e('Sent (mock)','পাঠানো (ডেমো)')+' · '+esc(dateStr(p.at)):zy_e('Waiting for month end','মাস শেষের অপেক্ষায়'))+'</span></td><td class="zs-mini mono">'+esc('EXP-'+g.k.replace(/\W/g,''))+'</td></tr>'; }).join('')+
    '<tr><td><b>'+esc(mk)+'</b> · '+zy_e('Salaries (this month so far)','বেতন (এই মাসে এ পর্যন্ত)')+'</td><td>'+z.emp.filter(function(e){ return e.active; }).length+'</td><td>'+zy_m(salAmt)+'</td><td><span class="zo-pill '+(z.erp[salK]?'ok':'warn')+'">'+(z.erp[salK]?zy_e('Sent (mock)','পাঠানো (ডেমো)'):zy_e('Waiting for month end','মাস শেষের অপেক্ষায়'))+'</span></td><td class="zs-mini mono">EXP-'+esc(salK.replace(/\W/g,''))+'</td></tr>'+
    '</tbody></table></div><div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zy-erp-push" data-testid="zy-erp-push">'+ico('share',14)+zy_e('Send this month now (mock)','এই মাস এখনই পাঠান (ডেমো)')+'</button><span class="zs-mini">'+zy_e('Normally automatic at month end. Nothing leaves the browser.','সাধারণত মাস শেষে নিজে যায়। ব্রাউজার থেকে কিছু বের হয় না।')+'</span></div></section>';
}
ACT['zy-erp-push'] = function(){
  if(!zy_guard('expenses','send expenses to the ERP')) return;
  var z = zy_st(), mk = zy_dk(Date.now()).slice(0,7), keys = {};
  z.exp.forEach(function(e){ if(!e.void && e.date.slice(0,7)===mk) keys[mk+'|'+e.head] = 1; }); keys[mk+'|salary'] = 1;
  var todo = Object.keys(keys).filter(function(k){ return !z.erp[k]; });
  zy_ask({title:zy('Send this month to the ERP?','এই মাস ERP-তে পাঠাবেন?'), html:'<p class="small">'+esc(zy(todo.length+' document(s) for '+mk+'. Demo: marked as sent, nothing leaves this browser.', mk+'-এর '+todo.length+'টা ডকুমেন্ট। ডেমো: পাঠানো দেখাবে, ব্রাউজার থেকে কিছু যাবে না।'))+'</p>',
    fn:function(){ todo.forEach(function(k){ z.erp[k] = {at:Date.now(), by:zy_actor().en}; }); zy_log('expenses', 'Sent '+todo.length+' expense document(s) for '+mk+' to the ERP (mock)'); toast(zy(todo.length+' document(s) sent (mock)', todo.length+'টা ডকুমেন্ট পাঠানো হয়েছে (ডেমো)')); }});
};

/* =====================================================================
   TEAM: roles & permissions, acting as, audit log
   ===================================================================== */
PAGES['zy-team'] = { layout:'admin', title:'Team & audit log', render:function(params, q){
  var z = zy_st(), tab = (q && q.tab) || 'roles';
  var head = zy_head('Admin · Team '+zs_pr('16 · 495 · 139'), 'Team & audit log', 'টিম, অনুমতি ও অডিট লগ',
    'Who may do what, section by section, and the list of every change: who, when and what. The log is append-only — nothing in it can be edited or removed.',
    'কে কোন অংশে কী করতে পারবে, আর প্রতিটা বদলের তালিকা: কে, কখন, কী। লগে শুধু যোগ হয় — কিছু বদলানো বা মোছা যায় না।', zy_actorBar());
  if(!zy_can('team','view')) return '<div class="zs-page zy-page">'+head+zy_noAccess('team')+'</div>';
  var tabs = zo_tabs('#/admin/team', [['roles',zy('Roles & permissions','ভূমিকা ও অনুমতি')],['people',zy('People & acting as','কর্মচারী ও কে কাজ করছে')],['log',zy('Audit log','অডিট লগ'), z.audit.length || '']], tab);
  var body = tab==='people' ? zy_teamPeople() : tab==='log' ? zy_teamLog() : zy_teamRoles();
  return '<div class="zs-page zy-page">'+head+tabs+body+'</div>';
}};
var ZY_LV = [['none','No access','নেই'],['view','View','দেখা'],['edit','Edit','বদলানো']];
function zy_teamRoles(){
  var z = zy_st();
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Roles & permissions','ভূমিকা ও অনুমতি')+'</h2>'+zs_pr('495')+'</div><div class="zs-sub">'+zy_e('Every button checks the role before it acts, not only the page. The owner role always has everything and cannot be changed.','প্রতিটা বোতাম কাজের আগে ভূমিকা দেখে, শুধু পেজ নয়। মালিকের সব অনুমতি থাকে, বদলানো যায় না।')+'</div>'+
    '<div class="zo-tw"><table class="zo-tbl zy-perm" data-testid="zy-perm"><thead><tr><th>'+zy_e('Section','অংশ')+'</th>'+z.roles.map(function(r){ return '<th>'+esc(zy(r.en,r.bn))+'</th>'; }).join('')+'</tr></thead><tbody>'+
    ZY_SECTIONS.map(function(s){ return '<tr><td><b>'+esc(zy(s[1],s[2]))+'</b></td>'+z.roles.map(function(r){ var v = r.perms[s[0]]||'none';
      return '<td>'+(r.locked ? '<span class="zo-pill ok">'+zy_e('Edit','বদলানো')+'</span>' : '<select class="input zs-in zy-psel lv-'+v+'" data-change="zy-perm" data-r="'+r.id+'" data-s="'+s[0]+'" aria-label="'+esc(zy(r.en,r.bn)+' · '+zy(s[1],s[2]))+'">'+ZY_LV.map(function(l){ return '<option value="'+l[0]+'"'+(l[0]===v?' selected':'')+'>'+esc(zy(l[1],l[2]))+'</option>'; }).join('')+'</select>')+'</td>'; }).join('')+'</tr>'; }).join('')+
    '</tbody></table></div><div class="zs-mini mt8">'+zy_e('2FA, session timeout and the device list come with the real login (B6.5); the owner decides on 2FA.','2FA, সেশন টাইমআউট আর ডিভাইস তালিকা আসল লগইনের সাথে আসবে (B6.5); 2FA মালিক ঠিক করবেন।')+'</div></section>';
}
CHANGE['zy-perm'] = function(el){
  var z = zy_st(), r = zy_role(el.getAttribute('data-r')), s = el.getAttribute('data-s'), v = el.value, old = r.perms[s]||'none';
  if(r.locked || !zy_guard('team', 'change permissions')){ el.value = old; return; }
  zy_ask({title:zy('Change this permission?','এই অনুমতি বদলাবেন?'), html:'<p class="small">'+esc(zy(r.en,r.bn)+' · '+zy_secName(s)+': '+old+' → '+v)+'</p>', back:function(){ rerender(); },
    fn:function(){ r.perms[s] = v; zy_log('team', 'Role '+r.en+': '+s+' '+old+' → '+v); toast(zy('Permission saved','অনুমতি সেভ হয়েছে')); }});
};
function zy_teamPeople(){
  return '<div class="zs-g2"><section class="zs-card"><h2>'+zy_e('Who is working now (demo)','এখন কে কাজ করছে (ডেমো)')+'</h2><div class="zs-sub">'+zy_e('Act as one of the team to see their permissions at work. The name chip at the top of every new page switches back.','টিমের কারো হয়ে কাজ করে দেখুন তার অনুমতি কেমন। প্রতিটা নতুন পেজের উপরের নামের বোতাম দিয়ে আবার বদলানো যায়।')+'</div>'+zy_actorList()+'</section>'+
    '<section class="zs-card"><h2>'+zy_e('People','কর্মচারী')+'</h2><div class="zs-sub">'+zy_e('Add people and their salary on Expenses & salaries; the role decides what they may do.','কর্মচারী আর বেতন Expenses & salaries-এ যোগ করুন; ভূমিকা ঠিক করে কে কী করতে পারবে।')+'</div><a class="btn btn-sm btn-secondary" href="#/admin/expenses?tab=staff">'+ico('user',14)+zy_e('Staff & salaries','কর্মচারী ও বেতন')+'</a></section></div>';
}
ACT['zy-actas'] = function(el){
  var id = el.getAttribute('data-id'), e = id==='owner' ? null : zy_emp(id), r = zy_role(e ? e.role : 'owner');
  zy_ask({title:zy('Switch who is working?','কে কাজ করছে বদলাবেন?'), html:'<p class="small">'+esc((e ? e.name : zy('Owner','মালিক'))+' · '+zy(r.en,r.bn))+'</p><p class="zs-mini">'+zy_e('Demo only: in the real build each person has their own login.','শুধু ডেমো: আসল সাইটে প্রত্যেকের নিজের লগইন থাকবে।')+'</p>',
    fn:function(){ var was = zy_actor().en; zy_st().actor = id; zy_log('team', 'Now working: '+(e ? e.name : 'Owner')+' (was '+was+')'); toast(zy('Now working as ','এখন কাজ করছেন: ')+(e ? e.name : zy('Owner','মালিক'))); }});
};
function zy_teamLog(){
  var z = zy_st(), u = ui('zy-log', {sec:'all', q:''}), s = String(u.q||'').toLowerCase();
  var list = z.audit.slice().reverse().filter(function(x){ return (u.sec==='all' || x.sec===u.sec) && (!s || (x.what+' '+x.who+' '+x.ref).toLowerCase().indexOf(s)>=0); });
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Audit log','অডিট লগ')+'</h2><div class="zs-actions"><button type="button" class="btn btn-sm btn-secondary" data-act="zy-log-csv">'+ico('share',14)+zy_e('Export CSV','CSV ডাউনলোড')+'</button></div></div>'+
    '<div class="zs-sub">'+zy_e('Append-only: every change made in the admin, with who, when and what. Blocked attempts are listed too.','শুধু যোগ হয়: অ্যাডমিনে প্রতিটা বদল — কে, কখন, কী। আটকে দেওয়া চেষ্টাও লেখা থাকে।')+'</div>'+
    '<div class="zy-logf"><select class="input zs-in" data-change="zy-log-sec" aria-label="'+zy_e('Section','অংশ')+'"><option value="all">'+zy_e('All sections','সব অংশ')+'</option>'+ZY_SECTIONS.map(function(x){ return '<option value="'+x[0]+'"'+(u.sec===x[0]?' selected':'')+'>'+esc(zy(x[1],x[2]))+'</option>'; }).join('')+'</select>'+
    '<input class="input zs-in" type="search" value="'+esc(u.q||'')+'" data-input="zy-log-q" placeholder="'+zy_e('Search: order, name, word','খুঁজুন: অর্ডার, নাম, শব্দ')+'" aria-label="'+zy_e('Search the log','লগে খুঁজুন')+'"></div>'+
    (list.length ? '<div class="zo-tw mt8"><table class="zo-tbl zy-logt" data-testid="zy-log"><thead><tr><th>'+zy_e('What','কী')+'</th><th>'+zy_e('Who','কে')+'</th><th>'+zy_e('When','কখন')+'</th><th>'+zy_e('Section','অংশ')+'</th></tr></thead><tbody>'+
      list.slice(0, 300).map(function(x){ return '<tr class="'+(/^Blocked/.test(x.what)?'zy-blk':'')+'"><td translate="no">'+esc(x.what)+(x.ref?' <span class="zs-mini mono">'+esc(x.ref)+'</span>':'')+'</td><td>'+esc(x.who)+'<div class="zs-mini">'+esc(x.role)+'</div></td><td>'+esc(dateTimeStr(x.at))+'</td><td>'+esc(zy_secName(x.sec))+'</td></tr>'; }).join('')+'</tbody></table></div>'+(list.length>300 ? '<div class="zs-mini mt8">'+zy_e('Showing the newest 300 — export for all.','নতুন ৩০০টা দেখানো হচ্ছে — সব পেতে CSV নিন।')+'</div>' : '')
      : '<div class="zs-mini mt8">'+zy_e('Nothing logged yet.','এখনো কিছু লেখা হয়নি।')+'</div>')+'</section>';
}
CHANGE['zy-log-sec'] = function(el){ ui('zy-log', {sec:'all', q:''}).sec = el.value; rerender(); };
INPUT['zy-log-q'] = function(el){ var u = ui('zy-log', {sec:'all', q:''}); u.q = el.value; clearTimeout(INPUT['zy-log-q']._t); INPUT['zy-log-q']._t = setTimeout(function(){ var pos = el.selectionStart; rerender(); var n = document.querySelector('[data-input="zy-log-q"]'); if(n){ n.focus(); try{ n.setSelectionRange(pos, pos); }catch(e){} } }, 250); };
ACT['zy-log-csv'] = function(){ var z = zy_st(); zy_download('extas-audit-log-'+zy_dk(Date.now())+'.csv', zy_csv([['When','Who','Role','Section','What','Ref']].concat(z.audit.map(function(x){ return [new Date(x.at).toISOString(), x.who, x.role, x.sec, x.what, x.ref]; })))); toast(zy('CSV downloaded','CSV ডাউনলোড হয়েছে')); };

/* ---------- the existing admin buttons: permission check first, then the audit line ---------- */
var ZY_WRAP = {
  'ao-next':['orders', function(el){ var o = ST.orders[el.getAttribute('data-id')]; return o ? 'Order '+o.id+' moved to '+(AO_STATUS[o.status]||o.status) : ''; }],
  'ao-clear':['orders', function(el){ return 'Cleared flag “'+el.getAttribute('data-flag')+'” on '+el.getAttribute('data-id'); }],
  'ao-clearall':['orders', function(el){ return 'Cleared all flags on '+el.getAttribute('data-id'); }],
  'ao-zone':['orders', function(el){ return 'Set delivery zone of '+el.getAttribute('data-id')+' to '+el.getAttribute('data-v'); }],
  'ao-keep':['orders', function(el){ return 'Two sizes on '+el.getAttribute('data-id')+': kept '+el.getAttribute('data-v'); }],
  'zx-cancel-go':['orders', function(el){ var o = ST.orders[el.getAttribute('data-id')]; return o && o.cancel ? 'Cancelled order '+o.id+': '+o.cancel.reason : ''; }],
  'zk-confirm':['fulfil', function(el){ var p = zk_parcelOf(el.getAttribute('data-id')); return p ? 'Booked '+el.getAttribute('data-id')+' with '+((zk_c(p.courier)||{}).name||p.courier)+' '+p.cid : ''; }],
  'zk-bookall':['fulfil', function(){ return 'Booked all waiting parcels (Couriers)'; }],
  'zx-bookall':['fulfil', function(){ return 'Booked all waiting parcels (Fulfilment)'; }],
  'zk-next':['fulfil', function(el){ var p = zk_parcelOf(el.getAttribute('data-id')); return p ? 'Parcel '+el.getAttribute('data-id')+' → '+((ZK_ST[p.st]||[p.st])[0]) : ''; }],
  'zk-refuse':['fulfil', function(el){ return 'Parcel '+el.getAttribute('data-id')+' refused at the door'; }],
  'zk-back':['fulfil', function(el){ return 'Parcel '+el.getAttribute('data-id')+' back at the shop'; }],
  'zk-restock':['fulfil', function(el){ return 'Parcel '+el.getAttribute('data-id')+' checked (QC good) and restocked'; }],
  'zk-claim':['fulfil', function(el){ return 'Charge claim sent to the courier for '+el.getAttribute('data-id'); }],
  'zx-print':['fulfil', function(el){ return 'Printed '+(el.getAttribute('data-doc')||'document'); }],
  'zx-wa-send':['orders', function(el){ return 'WhatsApp invoice sent for '+el.getAttribute('data-id')+' (demo)'; }],
  'zk-on':['settings', function(el){ return 'Courier '+el.getAttribute('data-id')+' switched on/off'; }],
  'zx-use':['settings', function(el){ return 'Invoice design '+el.getAttribute('data-n')+' put in use'; }]
};
(function(){
  Object.keys(ZY_WRAP).forEach(function(name){
    var f = ACT[name]; if(typeof f!=='function' || f._zy) return; var sec = ZY_WRAP[name][0], say = ZY_WRAP[name][1];
    var g = function(el){ if(!zy_guard(sec, name)) return; var r = f.apply(this, arguments); try{ var t = say(el); if(t){ zy_log(sec, t, el && el.getAttribute ? (el.getAttribute('data-id')||'') : ''); saveState(); } }catch(e){} return r; };
    g._zy = true; ACT[name] = g;
  });
  /* every Settings change is logged too */
  if(typeof zs_commit==='function' && !zs_commit._zy){ var oc = zs_commit; var nc = function(s, v){ var was; try{ was = s.get(); }catch(e){} var r = oc.apply(this, arguments); try{ zy_log('settings', 'Setting “'+s.en+'” changed'+(typeof v!=='object' ? ': '+String(was).slice(0,40)+' → '+String(v).slice(0,40) : ''), s.id); saveState(); }catch(e){} return r; }; nc._zy = true; window.zs_commit = nc; }
})();

/* =====================================================================
   MESSAGES — the owner's send rule (B2.5): SMS at order, SMS + one
   WhatsApp when processed, then nothing; a 3rd SMS / 2nd WhatsApp is
   blocked and logged. Texts come from Settings → SMS & WhatsApp messages.
   ===================================================================== */
(function(){
  try{
    if(typeof ZS_SETTINGS==='undefined' || zs_S('msg.waText')) return;
    var at = 0; ZS_SETTINGS.forEach(function(s, i){ if(s.g==='messages') at = i+1; });
    var def = {wa:'Hi {name}, your EXTAS order {orderId} is confirmed and being packed. Your invoice is attached. Total {total}. Reply here if you need anything.',
      email:'EXTAS order {orderId} — thank you, {name}. Total {total}. We will SMS you when it is packed.'};
    ZS_SETTINGS.splice(at, 0,
      {id:'msg.waText', g:'messages', en:'Processing WhatsApp text (the one WhatsApp)', bn:'প্রসেসিংয়ের হোয়াটসঅ্যাপের লেখা (একটাই হোয়াটসঅ্যাপ)', type:'text', where:'WhatsApp · simulated · with the invoice', see:'#/admin/comms',
        get:function(){ return zs_ensure().waText || def.wa; }, set:function(v){ zs_ensure().waText = v; }, def:function(){ return def.wa; }, reset:function(){ delete zs_ensure().waText; }},
      {id:'msg.emailText', g:'messages', en:'Order email text (only if the customer gave an email)', bn:'অর্ডারের ইমেইলের লেখা (কাস্টমার ইমেইল দিলে)', type:'text', where:'Email · simulated', see:'#/admin/comms',
        get:function(){ return zs_ensure().emailText || def.email; }, set:function(v){ zs_ensure().emailText = v; }, def:function(){ return def.email; }, reset:function(){ delete zs_ensure().emailText; }}
    );
  }catch(e){ console.error(e); }
})();
var ZY_STEP = {placed:['Order placed','অর্ডার হয়েছে'], confirmed:['Confirmed / processing','কনফার্ম / প্রসেসিং'], processing:['Processing (WhatsApp)','প্রসেসিং (হোয়াটসঅ্যাপ)'], shipped:['Handed to courier','কুরিয়ারে দেওয়া'], out:['Out for delivery','ডেলিভারিতে বের হয়েছে'], delivered:['Delivered','ডেলিভারি হয়েছে'], invoice:['WhatsApp invoice (by hand)','হোয়াটসঅ্যাপ ইনভয়েস (হাতে)']};
function zy_msgRule(){ try{ return zs_S('msg.rule').get(); }catch(e){ return {placed:true, confirmed:true, processing:true}; } }
function zy_tplText(step, o){
  var s = step==='placed' ? 'msg.placedText' : step==='processing' || step==='invoice' ? 'msg.waText' : step==='email' ? 'msg.emailText' : 'msg.confirmText', t = '';
  try{ t = zs_S(s).get(); }catch(e){}
  if(step==='shipped' || step==='out' || step==='delivered') t = 'EXTAS: Order {orderId} — '+ZY_STEP[step][0].toLowerCase()+'. {tracking}';
  var p = zk_parcelOf(o.id), V = {orderId:o.id, total:fmt(o.total), name:zy_first(o.name), whatsapp:(typeof waNumber==='function' ? waNumber() : DB.whatsapp||''), promise:(zoneHours(o.zone) ? 'within '+zoneHours(o.zone)+' hours' : ''), tracking:p ? ((zk_c(p.courier)||{}).name+' '+p.cid) : '', courier:p ? (zk_c(p.courier)||{}).name : ''};
  return String(t).replace(/\{(\w+)\}/g, function(m, k){ return V[k]!=null ? V[k] : m; });
}
function zy_sent(o, ch){ return (o.notif||[]).filter(function(n){ return n.ch===ch && /^sent/.test(n.st||''); }).length; }
/* one place sends every automatic message: the guard counts per order */
function zy_send(o, step, ch, opts){
  opts = opts || {}; if(!o) return null; o.notif = o.notif || [];
  if(!opts.force && o.notif.some(function(n){ return n.step===step && n.ch===ch; })) return null;          /* never the same thing twice */
  var n = {ch:ch, step:step, what:ZY_STEP[step] ? ZY_STEP[step][0] : step, text:zy_tplText(ch==='Email' ? 'email' : step, o), at:Date.now(), to:ch==='Email' ? (o.email||'') : o.phone};
  if(ch==='SMS' && zy_sent(o, 'SMS')>=2){ n.st = 'blocked'; n.why = 'A third SMS is blocked — owner rule: 2 SMS per order'; }
  else if(ch==='WhatsApp' && zy_sent(o, 'WhatsApp')>=1){ n.st = 'blocked'; n.why = 'A second WhatsApp is blocked — owner rule: 1 WhatsApp per order'; }
  else if(ch!=='Email' && checkPhone(o.phone).state!=='ok'){ n.st = 'failed'; n.why = 'The phone number is not valid — fix it on the order, then retry'; }
  else n.st = 'sent (demo)';
  o.notif.push(n); return n;
}
function zy_onProcessed(o){ if(!o || o.status==='cancelled') return; var r = zy_msgRule(); if(r.confirmed) zy_send(o, 'confirmed', 'SMS'); if(r.processing) zy_send(o, 'processing', 'WhatsApp'); }
(function(){
  /* 1 · order placed (after the checkout has finished correcting the order) */
  if(typeof placeOrder==='function' && !placeOrder._zyc){ var op = placeOrder; var np = function(){ var id = op.apply(this, arguments); if(id) setTimeout(function(){ try{ var o = ST.orders[id]; if(!o) return; var r = zy_msgRule(); if(r.placed) zy_send(o, 'placed', 'SMS'); if(o.email) zy_send(o, 'placed', 'Email'); if(typeof zy_afterPlace==='function') zy_afterPlace(o); saveState(); }catch(e){ console.error(e); } }, 0); return id; }; np._zyc = true; np._zx = placeOrder._zx; window.placeOrder = np; }
  /* 2 · confirmed / processing: the order leaves "To confirm", or the courier is booked */
  if(typeof advanceOrder==='function' && !advanceOrder._zyc){ var oa = advanceOrder; var na = function(id){ var o = ST.orders[id], was = o && o.status; var r = oa.apply(this, arguments); try{ if(o && was!==o.status){ if(was==='confirmed') zy_onProcessed(o); var rr = zy_msgRule(); if(o.status==='shipped' && rr.shipped) zy_send(o, 'shipped', 'SMS'); if(o.status==='delivered' && rr.delivered) zy_send(o, 'delivered', 'SMS'); saveState(); } }catch(e){ console.error(e); } return r; }; na._zyc = true; na._zx = advanceOrder._zx; window.advanceOrder = na; }
  if(typeof zk_doBook==='function' && !zk_doBook._zyc){ var ob = zk_doBook; var nb = function(o){ var p = ob.apply(this, arguments); try{ if(p && o){ zy_onProcessed(o); } }catch(e){ console.error(e); } return p; }; nb._zyc = true; window.zk_doBook = nb; }
  /* the WhatsApp invoice button counts as the one WhatsApp */
  var ws = ACT['zx-wa-send'];
  if(typeof ws==='function' && !ws._zyc){ var g = function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(o && zy_sent(o, 'WhatsApp')>=1){ o.notif = o.notif || []; o.notif.push({ch:'WhatsApp', step:'invoice', what:ZY_STEP.invoice[0], text:zy_tplText('invoice', o), at:Date.now(), to:o.phone, st:'blocked', why:'A second WhatsApp is blocked — owner rule: 1 WhatsApp per order'}); zy_log('orders', 'Blocked a second WhatsApp to '+o.id, o.id); saveState(); closeModal(); toast(zy('Not sent — this order already had its one WhatsApp (owner rule)','পাঠানো হয়নি — এই অর্ডারে একটা হোয়াটসঅ্যাপ আগেই গেছে (মালিকের নিয়ম)')); return; }
    var r = ws.apply(this, arguments); try{ if(o && o.notif && o.notif.length){ var n = o.notif[o.notif.length-1]; if(n.ch==='WhatsApp' && !n.step){ n.step = 'invoice'; n.text = zy_tplText('invoice', o); n.to = o.phone; } } saveState(); }catch(e){} return r; }; g._zyc = true; g._zy = ws._zy; ACT['zx-wa-send'] = g; }
})();
ACT['zy-msg-retry'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')], i = +el.getAttribute('data-i'); if(!o || !o.notif || !o.notif[i]) return; var n = o.notif[i];
  if(!zy_guard('orders','retry a message')) return;
  zy_ask({title:zy('Send this message again?','মেসেজটা আবার পাঠাবেন?'), html:'<p class="small">'+esc(n.ch+' · '+n.what+' → '+ao_phone(o))+'</p>', fn:function(){
    var m = zy_send(o, n.step, n.ch, {force:true}); n.retried = Date.now(); zy_log('orders', 'Retried '+n.ch+' “'+n.what+'” for '+o.id+': '+(m?m.st:''), o.id);
    toast(m && /^sent/.test(m.st) ? zy('Sent (demo)','পাঠানো হয়েছে (ডেমো)') : zy('Still not sent: ','এখনো যায়নি: ')+(m?m.why:'')); }});
};
function zy_msgRows(list, withOrder){
  return list.map(function(x){ var n = x.n, o = x.o, cls = /^sent/.test(n.st) ? 'ok' : n.st==='blocked' ? 'warn' : 'bad';
    return '<div class="zy-msg"><div class="zy-msgh"><span class="zo-pill '+cls+'">'+esc(n.st==='blocked' ? zy('Blocked','আটকানো') : n.st==='failed' ? zy('Failed','যায়নি') : zy('Sent (demo)','পাঠানো (ডেমো)'))+'</span><b>'+esc(n.ch)+'</b> · '+esc(ZY_STEP[n.step] ? zy(ZY_STEP[n.step][0], ZY_STEP[n.step][1]) : (n.what||''))+(withOrder ? ' · <button type="button" class="ao-idbtn" data-act="ao-open" data-id="'+esc(o.id)+'">'+esc(o.id)+'</button>' : '')+'<span class="zs-mini">'+esc(dateTimeStr(n.at))+(n.to?' · '+esc(n.ch==='Email'?n.to:ao_phone(o)):'')+'</span></div>'+
      (n.text ? '<div class="zy-msgt" translate="no">'+esc(n.text)+'</div>' : '')+(n.why ? '<div class="zs-mini">'+esc(n.why)+'</div>' : '')+
      (n.st==='failed' && !n.retried ? '<button type="button" class="btn btn-sm btn-ghost mt8" data-act="zy-msg-retry" data-id="'+esc(o.id)+'" data-i="'+x.i+'">'+zy_e('Retry','আবার চেষ্টা')+'</button>' : '')+'</div>'; }).join('');
}
PAGES['zy-comms'] = { layout:'admin', title:'Messages log', render:function(params, q){
  var u = ui('zy-comms', {ch:'all'}), all = [];
  zy_orders().forEach(function(o){ (o.notif||[]).forEach(function(n, i){ all.push({o:o, n:n, i:i}); }); });
  all.sort(function(a,b){ return b.n.at - a.n.at; });
  var cnt = function(ch, st){ return all.filter(function(x){ return x.n.ch===ch && (st ? x.n.st===st : /^sent/.test(x.n.st||'')); }).length; };
  var list = all.filter(function(x){ return u.ch==='all' || (u.ch==='blocked' ? x.n.st==='blocked' || x.n.st==='failed' : x.n.ch===u.ch); });
  var r = zy_msgRule(), cost = all.filter(function(x){ return /^sent/.test(x.n.st||''); }).reduce(function(s,x){ return s + zy_msgCost(x.n); }, 0);
  return '<div class="zs-page zy-page">'+zy_head('Admin · Messages '+zs_pr('148 · 149 · 505'), 'Messages log', 'মেসেজের খাতা',
      'Every SMS, WhatsApp and email the shop sent for each order, with the text from Settings. The owner\'s rule: an SMS when the order is placed, an SMS and one WhatsApp when it is processed — then nothing from the shop.',
      'প্রতিটা অর্ডারে দোকান যত SMS, হোয়াটসঅ্যাপ আর ইমেইল পাঠিয়েছে, সেটিংসের লেখাসহ। মালিকের নিয়ম: অর্ডার হলে একটা SMS, প্রসেস হলে একটা SMS আর একটা হোয়াটসঅ্যাপ — এরপর দোকান থেকে আর কিছু না।', zs_simTag(zy('Mock · nothing is sent','ডেমো · কিছু পাঠানো হয় না'))+zy_actorBar())+
    '<div class="zs-kpis k4">'+zy_kpi(cnt('SMS'), zy('SMS sent','SMS গেছে'), zy('max 2 per order','অর্ডারে সর্বোচ্চ ২টা'))+zy_kpi(cnt('WhatsApp'), zy('WhatsApp sent','হোয়াটসঅ্যাপ গেছে'), zy('max 1 per order','অর্ডারে সর্বোচ্চ ১টা'))+zy_kpi(all.filter(function(x){ return x.n.st==='blocked' || x.n.st==='failed'; }).length, zy('Blocked or failed','আটকানো বা যায়নি'), zy('see why below','কেন — নিচে দেখুন'), 'warn')+zy_kpi(zy_m(Math.round(cost*100)/100), zy('Message cost','মেসেজের খরচ'), zy('goes into the P&L','P&L-এ যায়'))+'</div>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('The send rule now','এখনকার নিয়ম')+'</h2><a class="btn btn-sm btn-ghost" href="#/admin/settings">'+ico('settings',14)+zy_e('Texts and switches in Settings','লেখা আর সুইচ সেটিংসে')+'</a></div>'+
      '<div class="zy-rule">'+[['placed','SMS'],['confirmed','SMS'],['processing','WhatsApp'],['shipped','SMS'],['out','SMS'],['delivered','SMS']].map(function(s){ return '<span class="zo-pill '+(r[s[0]]?'ok':'')+'">'+esc(s[1]+' · '+zy(ZY_STEP[s[0]][0], ZY_STEP[s[0]][1]))+' · '+(r[s[0]]?zy_e('on','চালু'):zy_e('off','বন্ধ'))+'</span>'; }).join('')+'</div>'+
      '<div class="zs-mini mt8">'+zy_e('Later steps are switches, off by default. If one is switched on, the guard still blocks a third SMS or a second WhatsApp and logs it here.','পরের ধাপগুলো সুইচ, শুরুতে বন্ধ। চালু করলেও তৃতীয় SMS বা দ্বিতীয় হোয়াটসঅ্যাপ আটকে যায় আর এখানে লেখা থাকে।')+'</div></section>'+
    '<div class="zs-pages zo-mt" role="group" aria-label="'+zy_e('Channel','চ্যানেল')+'">'+[['all',zy('All','সব')],['SMS','SMS'],['WhatsApp','WhatsApp'],['Email','Email'],['blocked',zy('Blocked / failed','আটকানো / যায়নি')]].map(function(c){ return '<button type="button" class="chip'+(u.ch===c[0]?' on':'')+'" data-act="zy-comms-ch" data-v="'+c[0]+'" aria-pressed="'+(u.ch===c[0])+'">'+esc(c[1])+'</button>'; }).join('')+'</div>'+
    '<section class="zs-card zo-mt" data-testid="zy-comms">'+(list.length ? zy_msgRows(list.slice(0, 200), true) : '<div class="zs-mini">'+zy_e('No messages yet — they appear when orders are placed and processed.','এখনো কোনো মেসেজ নেই — অর্ডার হলে আর প্রসেস হলে দেখা যাবে।')+'</div>')+'</section></div>';
}};
ACT['zy-comms-ch'] = function(el){ ui('zy-comms', {ch:'all'}).ch = el.getAttribute('data-v'); rerender(); };

/* =====================================================================
   BULK ORDER ACTIONS (PR 140 · 152)
   ===================================================================== */
function zy_bulkList(f){
  return zy_orders().filter(function(o){
    if(o.status==='cancelled' || o.status==='returned' || o.status==='delivered') return false;
    var p = zk_parcelOf(o.id);
    if(f==='confirm') return o.status==='confirmed';
    if(f==='packed') return o.status==='packed';
    if(f==='nobook') return !p && o.status!=='shipped';
    return true;
  });
}
function zy_reviewOpen(o){ return typeof zq_pending==='function' ? zq_pending(o) : false; }
PAGES['zy-bulk'] = { layout:'admin', title:'Bulk actions', render:function(params, q){
  var u = ui('zy-bulk', {f:'all', sel:{}}), list = zy_bulkList(u.f), sel = list.filter(function(o){ return u.sel[o.id]; });
  var head = zy_head('Admin · Orders '+zs_pr('140 · 152 · 179–182'), 'Bulk actions', 'একসাথে অনেক অর্ডারে কাজ',
    'Tick orders, then confirm them, book the courier or print stickers, the picking list or invoices in one go. Orders waiting for a duplicate / fraud review are skipped until someone decides.',
    'অর্ডারে টিক দিন, তারপর একসাথে কনফার্ম, কুরিয়ার বুক বা স্টিকার, পিকিং লিস্ট, ইনভয়েস প্রিন্ট করুন। ডুপ্লিকেট / ফ্রড রিভিউ বাকি থাকলে সেই অর্ডার বাদ যায়।', '<a class="btn btn-sm btn-ghost" href="#/admin/orders">'+ico('back',14)+zy_e('Orders','অর্ডার')+'</a>'+zy_actorBar());
  if(!zy_can('orders','view')) return '<div class="zs-page zy-page">'+head+zy_noAccess('orders')+'</div>';
  var chips = [['all',zy('All open','সব খোলা')],['confirm',zy('To confirm','কনফার্ম বাকি')],['packed',zy('Packed','প্যাক হয়েছে')],['nobook',zy('Courier not booked','কুরিয়ার বুক হয়নি')]];
  var allOn = list.length && sel.length===list.length;
  var bar = '<div class="zy-bulkbar" data-testid="zy-bulkbar"><span class="small"><b>'+sel.length+'</b> '+zy_e('selected','টা বাছা')+'</span>'+
    '<button type="button" class="btn btn-sm btn-primary" data-act="zy-bulk-do" data-v="confirm"'+(sel.length?'':' disabled')+'>'+ico('check',14)+zy_e('Confirm','কনফার্ম')+'</button>'+
    '<button type="button" class="btn btn-sm btn-secondary" data-act="zy-bulk-do" data-v="book"'+(sel.length?'':' disabled')+'>'+ico('truck',14)+zy_e('Book courier','কুরিয়ার বুক')+'</button>'+
    '<button type="button" class="btn btn-sm btn-secondary" data-act="zy-bulk-do" data-v="stickers"'+(sel.length?'':' disabled')+'>'+ico('doc',14)+zy_e('Stickers','স্টিকার')+'</button>'+
    '<button type="button" class="btn btn-sm btn-secondary" data-act="zy-bulk-do" data-v="picking"'+(sel.length?'':' disabled')+'>'+ico('doc',14)+zy_e('Picking list','পিকিং লিস্ট')+'</button>'+
    '<button type="button" class="btn btn-sm btn-secondary" data-act="zy-bulk-do" data-v="invoices"'+(sel.length?'':' disabled')+'>'+ico('doc',14)+zy_e('Invoices','ইনভয়েস')+'</button></div>';
  return '<div class="zs-page zy-page">'+head+
    '<div class="zs-pages mb12" role="group" aria-label="'+zy_e('Filter','ফিল্টার')+'">'+chips.map(function(c){ return '<button type="button" class="chip'+(u.f===c[0]?' on':'')+'" data-act="zy-bulk-f" data-v="'+c[0]+'" aria-pressed="'+(u.f===c[0])+'">'+esc(c[1])+' <span class="zo-cnt">'+zy_bulkList(c[0]).length+'</span></button>'; }).join('')+'</div>'+bar+
    '<section class="zs-card zo-mt">'+(list.length ? '<div class="zo-tw"><table class="zo-tbl zy-bulkt" data-testid="zy-bulk"><thead><tr><th><label class="zy-ck"><input type="checkbox" data-change="zy-bulk-all" '+(allOn?'checked':'')+' aria-label="'+zy_e('Select all','সব বাছুন')+'"><span>'+zy_e('Order','অর্ডার')+'</span></label></th><th>'+zy_e('Customer','কাস্টমার')+'</th><th>'+zy_e('Pieces','পিস')+'</th><th>'+zy_e('Total','মোট')+'</th><th>'+zy_e('Status','অবস্থা')+'</th><th>'+zy_e('Courier','কুরিয়ার')+'</th><th>'+zy_e('Check','চেক')+'</th></tr></thead><tbody>'+
      list.map(function(o){ var p = zk_parcelOf(o.id), rv = zy_reviewOpen(o); return '<tr><td><label class="zy-ck"><input type="checkbox" data-change="zy-bulk-one" data-id="'+esc(o.id)+'" '+(u.sel[o.id]?'checked':'')+' aria-label="'+esc(zy('Select ','বাছুন ')+o.id)+'"><button type="button" class="ao-idbtn" data-act="ao-open" data-id="'+esc(o.id)+'">'+esc(o.id)+'</button></label><div class="zs-mini">'+esc(ao_when(o.createdAt))+'</div></td><td>'+esc(o.name)+'<div class="zs-mini">'+esc(ao_zone(o))+'</div></td><td>'+ao_items(o)+'</td><td>'+zy_m(o.total)+'<div class="zs-mini">'+esc(AO_PAY[o.payment]||o.payment)+'</div></td><td>'+esc(AO_STATUS[o.status]||o.status)+'</td><td>'+(p ? esc((zk_c(p.courier)||{}).name)+' <span class="zs-mini">'+esc(p.cid)+'</span>' : '<span class="zs-mini">'+zy_e('not booked','বুক হয়নি')+'</span>')+'</td><td>'+(rv ? '<a class="zo-pill warn" href="#/admin/review">'+zy_e('Review first','আগে রিভিউ')+'</a>' : '<span class="zo-pill ok">'+zy_e('Ready','তৈরি')+'</span>')+'</td></tr>'; }).join('')+
      '</tbody></table></div>' : '<div class="zs-mini">'+zy_e('No open orders here.','এখানে কোনো খোলা অর্ডার নেই।')+'</div>')+'</section><div id="zy-printsrc" hidden></div></div>';
}};
ACT['zy-bulk-f'] = function(el){ var u = ui('zy-bulk', {f:'all', sel:{}}); u.f = el.getAttribute('data-v'); u.sel = {}; rerender(); };
CHANGE['zy-bulk-one'] = function(el){ var u = ui('zy-bulk', {f:'all', sel:{}}); if(el.checked) u.sel[el.getAttribute('data-id')] = 1; else delete u.sel[el.getAttribute('data-id')]; rerender(); };
CHANGE['zy-bulk-all'] = function(el){ var u = ui('zy-bulk', {f:'all', sel:{}}); u.sel = {}; if(el.checked) zy_bulkList(u.f).forEach(function(o){ u.sel[o.id] = 1; }); rerender(); };
function zy_print(title, html){
  var css = ''; try{ css = Array.prototype.map.call(document.querySelectorAll('style'), function(s){ return /zx-|ivd/.test(s.textContent) ? s.textContent : ''; }).join('\n'); }catch(e){}
  var f = document.createElement('iframe'); f.setAttribute('aria-hidden','true'); f.tabIndex = -1; f.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:1200px;border:0';
  f.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+css+(typeof ZX_PRINT_CSS!=='undefined'?ZX_PRINT_CSS:'')+'.zy-pb{page-break-after:always;margin-bottom:10mm}</style></head><body class="zx-printing">'+html+'</body></html>';
  f.onload = function(){ try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){} setTimeout(function(){ if(f.parentNode) f.parentNode.removeChild(f); }, 1500); };
  document.body.appendChild(f);
}
ACT['zy-bulk-do'] = function(el){
  var v = el.getAttribute('data-v'), u = ui('zy-bulk', {f:'all', sel:{}}), sel = zy_bulkList(u.f).filter(function(o){ return u.sel[o.id]; }); if(!sel.length) return;
  var sec = v==='confirm' ? 'orders' : 'fulfil'; if(!zy_guard(sec, 'bulk '+v)) return;
  var held = sel.filter(zy_reviewOpen), ok = sel.filter(function(o){ return !zy_reviewOpen(o); });
  if(v==='confirm'){
    var todo = ok.filter(function(o){ return o.status==='confirmed'; });
    zy_ask({title:zy('Confirm '+todo.length+' order(s)?', todo.length+'টা অর্ডার কনফার্ম করবেন?'), html:'<p class="small">'+esc(zy('They move to Packed. The customer gets the confirm SMS and the one WhatsApp (owner rule).','অর্ডারগুলো Packed-এ যাবে। কাস্টমার কনফার্মের SMS আর একটা হোয়াটসঅ্যাপ পাবে (মালিকের নিয়ম)।'))+'</p>'+(todo.length ? '<div class="zs-mini">'+esc(todo.map(function(o){ return o.id; }).join(', '))+'</div>' : '')+zy_skipNote(held, sel.length - held.length - todo.length),
      fn:function(){ todo.forEach(function(o){ advanceOrder(o.id); zy_log('orders', 'Bulk confirm: '+o.id+' → Packed', o.id); }); u.sel = {}; toast(zy(todo.length+' confirmed', todo.length+'টা কনফার্ম হয়েছে')); }});
    return;
  }
  if(v==='book'){
    var tb = ok.filter(function(o){ return !zk_parcelOf(o.id) && o.status!=='confirmed'; });
    zy_ask({title:zy('Book the courier for '+tb.length+' order(s)?', tb.length+'টা অর্ডারে কুরিয়ার বুক করবেন?'), html:'<p class="small">'+esc(zy('Cheapest connected courier per delivery band (or your fixed pick). Orders still “To confirm” are confirmed first, so they are skipped here.','প্রতিটা এলাকায় সবচেয়ে কম খরচের কুরিয়ার (বা আপনার ঠিক করা)। “To confirm” অর্ডার আগে কনফার্ম করতে হয়, তাই বাদ।'))+'</p>'+zy_skipNote(held, sel.length - held.length - tb.length),
      fn:function(){ var n = 0; tb.forEach(function(o){ var p = zk_doBook(o); if(p){ n++; if(typeof zx_syncTracking==='function') zx_syncTracking(o); zy_log('fulfil', 'Bulk book: '+o.id+' with '+((zk_c(p.courier)||{}).name)+' '+p.cid, o.id); } }); u.sel = {}; toast(zy(n+' parcel(s) booked (demo)', n+'টা পার্সেল বুক হয়েছে (ডেমো)')); }});
    return;
  }
  var docs = ok.slice(), html = '', title = '';
  if(v==='stickers'){ docs = docs.filter(function(o){ return zk_parcelOf(o.id); }); var S = zx_sortRun(docs); html = S.list.map(function(x){ return zx_stickerHTML(x.o, x.lines, zx_cfg().sticker); }).join(''); title = zy('Courier stickers','কুরিয়ার স্টিকার'); }
  else if(v==='picking'){ html = zx_pickHTML(zx_pickData(docs)); title = zy('Picking list','পিকিং লিস্ট'); }
  else { html = docs.map(function(o){ return '<div class="zy-pb">'+zx_sheetFor(o, zx_design())+'</div>'; }).join(''); title = zy('Invoices','ইনভয়েস'); }
  if(!docs.length){ toast(v==='stickers' ? zy('Book the courier first — stickers need the courier\'s number','আগে কুরিয়ার বুক করুন — স্টিকারে কুরিয়ারের নম্বর লাগে') : zy('Nothing to print','প্রিন্ট করার কিছু নেই')); return; }
  zy_ask({title:zy('Print '+title.toLowerCase()+' for '+docs.length+' order(s)?', docs.length+'টা অর্ডারের '+title+' প্রিন্ট করবেন?'), yes:zy('Print','প্রিন্ট'), html:'<div class="zs-mini">'+esc(docs.map(function(o){ return o.id; }).join(', '))+'</div>'+zy_skipNote(held, sel.length - held.length - docs.length), noRender:false,
    fn:function(){ zy_print(title, html); if(v==='stickers') docs.forEach(function(o){ o.docs = o.docs || {}; o.docs.sticker = Date.now(); }); zy_log('fulfil', 'Bulk print: '+title+' for '+docs.map(function(o){ return o.id; }).join(', ')); toast(zy('Sent to the printer (demo)','প্রিন্টারে পাঠানো হয়েছে (ডেমো)')); }});
};
function zy_skipNote(held, other){
  var t = '';
  if(held.length) t += '<div class="zs-note warn mt8">'+ico('info',16)+'<span>'+esc(zy(held.length+' skipped — waiting for the duplicate / fraud review: ', held.length+'টা বাদ — ডুপ্লিকেট / ফ্রড রিভিউ বাকি: ')+held.map(function(o){ return o.id; }).join(', '))+'</span></div>';
  if(other>0) t += '<div class="zs-mini mt8">'+esc(zy(other+' other selected order(s) do not fit this action and are left as they are.', 'বাছা আরও '+other+'টা অর্ডারে এই কাজ খাটে না, যেমন আছে থাকবে।'))+'</div>';
  return t;
}

/* =====================================================================
   COURIERS → MONEY CHECK on the demo's own parcels (PR 165 · 166 · 174)
   ===================================================================== */
function zy_moneyRows(){
  var z = zy_st(), s = zk_st(), out = [];
  Object.keys(s.parcels).forEach(function(oid){
    var p = s.parcels[oid], o = ST.orders[oid]; if(!o) return; var c = zk_c(p.courier) || {codPct:1, ret:0, name:p.courier};
    var back = ['refused','returned','restocked'].indexOf(p.st)>=0, del = p.st==='delivered';
    if(!back && !del) return;
    var st = z.settle[oid], fee = del ? Math.round((p.cod||0)*(c.codPct||0)/100) : 0, charge = del ? p.charge : c.ret;
    var due = (del ? (p.cod||0) : 0) - charge - fee, dAt = ((p.hist||[]).filter(function(h){ return h.s==='delivered' || h.s==='refused'; })[0] || {}).at || p.at;
    var flags = [];
    if(del && zk_cod(o)!==(p.cod||0)) flags.push(zy('COD on the parcel ('+fmt(p.cod)+') is not the order\'s COD now ('+fmt(zk_cod(o))+')','পার্সেলের COD ('+fmt(p.cod)+') আর অর্ডারের COD ('+fmt(zk_cod(o))+') মেলে না'));
    if(st && st.paid!==due) flags.push(zy('Courier paid '+fmt(st.paid)+', we expected '+fmt(due),'কুরিয়ার দিয়েছে '+fmt(st.paid)+', পাওয়ার কথা '+fmt(due)));
    if(!st && del && Date.now()-dAt > (+z.fin.settleDays||3)*86400000) flags.push(zy('Not paid after '+z.fin.settleDays+' days', z.fin.settleDays+' দিনেও টাকা আসেনি'));
    out.push({oid:oid, o:o, p:p, c:c, del:del, cod:del ? (p.cod||0) : 0, charge:charge, fee:fee, due:due, st:st, flags:flags, at:dAt});
  });
  return out.sort(function(a,b){ return b.at - a.at; });
}
function zy_moneyReal(){
  var rows = zy_moneyRows(), by = {};
  rows.forEach(function(r){ var k = r.p.courier; var b = by[k] = by[k] || {c:r.c, n:0, cod:0, charge:0, fee:0, due:0, paid:0, open:0, mism:0}; b.n++; b.cod += r.cod; b.charge += r.charge; b.fee += r.fee; b.due += r.due; if(r.st) b.paid += r.st.paid; else b.open += r.due; if(r.flags.length) b.mism++; });
  var T = Object.keys(by).reduce(function(a,k){ var b = by[k]; ['n','cod','charge','fee','due','paid','open','mism'].forEach(function(x){ a[x] = (a[x]||0) + b[x]; }); return a; }, {n:0, cod:0, charge:0, fee:0, due:0, paid:0, open:0, mism:0});
  var orphan = zy_orders().filter(function(o){ return o.status==='delivered' && !zk_parcelOf(o.id); }).length;
  return '<section class="zs-card zy-money" data-testid="zy-money"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('This demo\'s own parcels','এই ডেমোর নিজের পার্সেল')+'</h2><span class="row" style="gap:6px">'+zs_pr('165 · 166 · 174')+'</span></div>'+
    '<div class="zs-sub">'+zy_e('From the parcels booked here: cash the courier collected against what we expected, minus its charge and COD fee. Load the courier\'s statement (mock), or type what it really paid — every difference is flagged.','এখানে বুক করা পার্সেল থেকে: কুরিয়ার কত টাকা তুলেছে আর আমরা কত পাওয়ার কথা, চার্জ আর COD ফি বাদে। কুরিয়ারের স্টেটমেন্ট আনুন (ডেমো), বা আসলে কত দিয়েছে লিখুন — যেকোনো পার্থক্য লাল হবে।')+'</div>'+
    '<div class="zs-kpis k4">'+zy_kpi(zy_m(T.cod), zy('COD collected','COD তোলা হয়েছে'), T.n+' '+zy('parcels','পার্সেল'))+zy_kpi(zy_m(T.charge+T.fee), zy('Courier charges + fee','কুরিয়ার চার্জ + ফি'))+zy_kpi(zy_m(T.paid), zy('Paid to us','আমাদের দিয়েছে'), zy('of ','মোট ')+fmt(T.due)+zy(' due',' পাওনা'), 'ok')+zy_kpi(T.mism, zy('Mismatches','গরমিল'), zy('need a look','দেখতে হবে'), T.mism?'bad':'')+'</div>'+
    (rows.length ? '<div class="zo-tw"><table class="zo-tbl"><thead><tr><th>'+zy_e('Courier','কুরিয়ার')+'</th><th>'+zy_e('Parcels','পার্সেল')+'</th><th>'+zy_e('COD collected','COD তোলা')+'</th><th>'+zy_e('Charge','চার্জ')+'</th><th>'+zy_e('COD fee','COD ফি')+'</th><th>'+zy_e('Due to us','আমাদের পাওনা')+'</th><th>'+zy_e('Paid','দিয়েছে')+'</th><th>'+zy_e('Still due','বাকি')+'</th><th></th></tr></thead><tbody>'+
      Object.keys(by).map(function(k){ var b = by[k]; return '<tr><td><b>'+esc(b.c.name)+'</b>'+(b.mism?' <span class="zo-pill bad">'+b.mism+'</span>':'')+'</td><td>'+b.n+'</td><td>'+zy_m(b.cod)+'</td><td>'+zy_m(b.charge)+'</td><td>'+zy_m(b.fee)+'</td><td>'+zy_m(b.due)+'</td><td class="ok">'+zy_m(b.paid)+'</td><td>'+zy_m(b.open)+'</td><td>'+(b.open ? '<button type="button" class="btn btn-sm btn-secondary" data-act="zy-settle" data-c="'+esc(k)+'" data-testid="zy-settle">'+zy_e('Load statement (mock)','স্টেটমেন্ট আনুন (ডেমো)')+'</button>' : '')+'</td></tr>'; }).join('')+
      '<tr class="tot"><td>'+zy_e('Total','মোট')+'</td><td>'+T.n+'</td><td>'+zy_m(T.cod)+'</td><td>'+zy_m(T.charge)+'</td><td>'+zy_m(T.fee)+'</td><td>'+zy_m(T.due)+'</td><td>'+zy_m(T.paid)+'</td><td>'+zy_m(T.open)+'</td><td></td></tr></tbody></table></div>'+
      '<h3 class="zy-h3">'+zy_e('Parcel by parcel','প্রতিটা পার্সেল')+'</h3><div class="zo-tw"><table class="zo-tbl"><thead><tr><th>'+zy_e('Parcel','পার্সেল')+'</th><th>'+zy_e('Status','অবস্থা')+'</th><th>'+zy_e('COD','COD')+'</th><th>'+zy_e('Charge + fee','চার্জ + ফি')+'</th><th>'+zy_e('Due','পাওনা')+'</th><th>'+zy_e('Courier paid','কুরিয়ার দিয়েছে')+'</th><th>'+zy_e('Check','চেক')+'</th></tr></thead><tbody>'+
      rows.map(function(r){ return '<tr class="'+(r.flags.length?'zy-flag':'')+'"><td><button type="button" class="ao-idbtn" data-act="ao-open" data-id="'+esc(r.oid)+'">'+esc(r.oid)+'</button><div class="zs-mini">'+esc(r.c.name+' '+r.p.cid)+'</div></td><td>'+esc((ZK_ST[r.p.st]||[r.p.st])[0])+'</td><td>'+zy_m(r.cod)+'</td><td>'+zy_m(r.charge+r.fee)+'</td><td>'+zy_m(r.due)+'</td><td>'+(r.st ? zy_m(r.st.paid) : '<span class="zs-mini">'+zy_e('not yet','এখনো না')+'</span>')+' <button type="button" class="zs-link" data-act="zy-settle-one" data-id="'+esc(r.oid)+'">'+zy_e('Enter','লিখুন')+'</button></td><td>'+(r.flags.length ? r.flags.map(function(f){ return '<div class="bad zy-fl">'+esc(f)+'</div>'; }).join('')+(r.st && r.st.claim ? '<span class="zo-pill info">'+zy_e('Claim sent','ক্লেইম পাঠানো')+'</span>' : (r.st && r.st.paid!==r.due ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zy-claim" data-id="'+esc(r.oid)+'">'+zy_e('Send claim','ক্লেইম পাঠান')+'</button>' : '')) : '<span class="zo-pill ok">'+ico('check',11)+zy_e('OK','ঠিক আছে')+'</span>')+'</td></tr>'; }).join('')+'</tbody></table></div>'
      : '<div class="zs-mini">'+zy_e('No parcel delivered or returned yet in this demo. Book parcels and move them to Delivered first.','এই ডেমোতে এখনো কোনো পার্সেল ডেলিভারি বা ফেরত হয়নি। আগে পার্সেল বুক করে Delivered করুন।')+'</div>')+
    (orphan ? '<div class="zs-mini mt8">'+esc(zy(orphan+' order(s) were delivered before this demo started and have no parcel record here — they are left out.', orphan+'টা অর্ডার ডেমো শুরুর আগে ডেলিভারি হয়েছে, এখানে পার্সেলের রেকর্ড নেই — বাদ রাখা হলো।'))+'</div>' : '')+'</section>'+
    '<div class="zy-simhd"><span class="zs-sim">'+ico('info',12)+zy_e('Below: the sample 30-day history (simulated)','নিচে: ৩০ দিনের নমুনা হিসাব (সিমুলেটেড)')+'</span></div>';
}
(function(){ if(typeof zk_money!=='function' || zk_money._zy) return; var om = zk_money; var nm = function(){ var real = ''; try{ real = zy_moneyReal(); }catch(e){ console.error(e); } return real + om.apply(this, arguments); }; nm._zy = true; window.zk_money = nm; })();
ACT['zy-settle'] = function(el){
  if(!zy_guard('fulfil','load a courier statement')) return;
  var k = el.getAttribute('data-c'), rows = zy_moneyRows().filter(function(r){ return r.p.courier===k && !r.st; }), c = zk_c(k) || {name:k};
  zy_ask({title:zy('Load '+c.name+'\'s statement?', c.name+'-এর স্টেটমেন্ট আনবেন?'), html:'<p class="small">'+esc(zy(rows.length+' parcel(s), '+fmt(rows.reduce(function(s,r){ return s + r.due; }, 0))+' due. Demo: the mock courier pays exactly what is due; type a different figure per parcel to test a short payment.', rows.length+'টা পার্সেল, পাওনা '+fmt(rows.reduce(function(s,r){ return s + r.due; }, 0))+'। ডেমো: ডেমো কুরিয়ার ঠিক পাওনাটাই দেয়; কম দেওয়া পরীক্ষা করতে পার্সেলে অন্য সংখ্যা লিখুন।'))+'</p>',
    fn:function(){ var z = zy_st(); rows.forEach(function(r){ z.settle[r.oid] = {paid:r.due, at:Date.now(), by:zy_actor().en, src:'statement (mock)'}; }); zy_log('fulfil', 'Loaded '+c.name+' statement (mock): '+rows.length+' parcels'); toast(zy('Statement loaded (mock)','স্টেটমেন্ট এসেছে (ডেমো)')); }});
};
ACT['zy-settle-one'] = function(el){
  if(!zy_guard('fulfil','enter a courier payment')) return;
  var id = el.getAttribute('data-id'), r = zy_moneyRows().filter(function(x){ return x.oid===id; })[0]; if(!r) return;
  openModal('<form data-submit="zy-settle1" data-id="'+esc(id)+'"><p class="small">'+esc(zy('Parcel '+id+' · due to us ','পার্সেল '+id+' · আমাদের পাওনা ')+fmt(r.due))+'</p><label class="label" for="zy-s1">'+zy_e('What the courier actually paid (৳)','কুরিয়ার আসলে কত দিয়েছে (৳)')+'</label><input id="zy-s1" name="v" class="input" type="number" step="1" min="-100000" max="1000000" value="'+esc(r.st ? r.st.paid : r.due)+'" required><div class="zs-actions mt16"><button class="btn btn-primary">'+zy_e('Next','পরের ধাপ')+'</button></div></form>', {title:zy('Courier payment','কুরিয়ারের টাকা')});
};
SUBMIT['zy-settle1'] = function(f){
  var id = f.getAttribute('data-id'), v = zy_num(f.querySelector('[name=v]').value), r = zy_moneyRows().filter(function(x){ return x.oid===id; })[0]; if(!r || !isFinite(v) || isNaN(v)){ toast(zy('Enter a number','সংখ্যা লিখুন')); return; }
  zy_ask({title:zy('Save the courier payment?','কুরিয়ারের টাকা সেভ করবেন?'), html:'<p class="small">'+esc(id+': '+fmt(v)+(v!==r.due ? zy(' — differs from '+fmt(r.due)+' due, it will be flagged',' — পাওনা '+fmt(r.due)+'-এর সাথে মেলে না, লাল দেখাবে') : ''))+'</p>',
    fn:function(){ zy_st().settle[id] = {paid:Math.round(v), at:Date.now(), by:zy_actor().en, src:'entered'}; zy_log('fulfil', 'Courier payment for '+id+' entered: '+fmt(v)+' (due '+fmt(r.due)+')', id); toast(zy('Saved','সেভ হয়েছে')); }});
};
ACT['zy-claim'] = function(el){ var id = el.getAttribute('data-id'), s = zy_st().settle[id]; if(!s || !zy_guard('fulfil','send a claim')) return;
  zy_ask({title:zy('Send a claim to the courier?','কুরিয়ারকে ক্লেইম পাঠাবেন?'), html:'<p class="small">'+esc(id)+'</p><p class="zs-mini">'+zy_e('Demo: nothing is sent; the claim is recorded.','ডেমো: কিছু যায় না; ক্লেইম লেখা থাকে।')+'</p>', fn:function(){ s.claim = Date.now(); zy_log('fulfil', 'Claim sent to the courier for '+id+' (mock)', id); }}); };

/* =====================================================================
   ORDERS PAGE + ORDER SCREEN: links to the new tools, messages sent
   ===================================================================== */
(function(){
  var pg = PAGES['admin-orders']; if(!pg || pg._zy) return; var or = pg.render;
  pg.render = function(){ var h = or.apply(this, arguments);
    try{ var nrev = typeof zq_queue==='function' ? zq_queue().length : 0;
      var links = '<a class="btn btn-sm btn-ghost" href="#/admin/bulk" data-testid="zy-bulk-link">'+ico('grid',15)+zy_e('Bulk actions','একসাথে কাজ')+'</a>'+(typeof zq_queue==='function' ? '<a class="btn btn-sm btn-ghost" href="#/admin/review">'+ico('shield',15)+zy_e('Review queue','রিভিউ তালিকা')+(nrev?' <span class="zo-cnt">'+nrev+'</span>':'')+'</a>' : '')+zy_actorBar();
      h = h.replace(/(<a class="btn btn-sm btn-ghost" href="#\/admin\/fulfilment">[\s\S]*?<\/a>)/, function(m){ return m+links; });
    }catch(e){ console.error(e); }
    return h; };
  pg._zy = true;
})();
(function(){
  if(typeof ao_modalHTML!=='function' || ao_modalHTML._zy) return;
  var om = ao_modalHTML;
  var nm = function(id){
    var h = om.apply(this, arguments), o = ST.orders[id]; if(!o) return h;
    try{
      var list = (o.notif||[]).map(function(n, i){ return {o:o, n:n, i:i}; });
      var extra = (typeof zq_orderBlock==='function' ? zq_orderBlock(o) : '')+
        '<div class="ao-sec mt16">'+zy_e('Messages to the customer','কাস্টমারকে মেসেজ')+' · '+list.length+'</div>'+(list.length ? '<div class="zy-msgs">'+zy_msgRows(list, false)+'</div>' : '<div class="zs-mini">'+zy_e('None yet.','এখনো কিছু না।')+'</div>');
      h = h.replace('<div class="ao-actions">', function(){ return extra+'<div class="ao-actions">'; });
    }catch(e){ console.error(e); }
    return h;
  };
  nm._zy = true; window.ao_modalHTML = nm;
})();

/* =====================================================================
   B7.2 RULE 3 — scrolling tab strips show a fade and an arrow
   ===================================================================== */
function zy_tabUpd(w){ var s = w.querySelector('.admin-tabs,.za-tabs'); if(!s) return; var l = s.scrollLeft > 2, r = s.scrollLeft + s.clientWidth < s.scrollWidth - 2;
  w.classList.toggle('zy-l', l); w.classList.toggle('zy-r', r);
  var t = s.offsetTop, hh = s.clientHeight; w.querySelectorAll('.zy-ta').forEach(function(b){ b.style.top = t+'px'; b.style.height = Math.max(hh, 36)+'px'; }); }
function zy_tabsEnhance(){
  if(!/^#\/admin/.test(location.hash||'')) return;
  document.querySelectorAll('#app .admin-tabs, #app .za-tabs').forEach(function(s){
    var w = s.parentNode; if(!w.classList || !w.classList.contains('zy-tw')){
      w = document.createElement('div'); w.className = 'zy-tw'; s.parentNode.insertBefore(w, s); w.appendChild(s);
      w.insertAdjacentHTML('beforeend', '<button type="button" class="zy-ta zy-tl" data-act="zy-tab-go" data-d="-1" aria-label="'+zy_e('Scroll tabs left','ট্যাব বাঁয়ে সরান')+'" tabindex="-1">'+ico('back',16)+'</button><button type="button" class="zy-ta zy-tr" data-act="zy-tab-go" data-d="1" aria-label="'+zy_e('Scroll tabs right','ট্যাব ডানে সরান')+'" tabindex="-1">'+ico('right',16)+'</button>');
      s.addEventListener('scroll', function(){ zy_tabUpd(w); }, {passive:true});
      /* keep the chosen tab in view */
      var on = s.querySelector('.chip.on'); if(on && s.scrollWidth > s.clientWidth){ var x = on.offsetLeft - s.clientWidth/2 + on.offsetWidth/2; s.scrollLeft = Math.max(0, x); }
    }
    zy_tabUpd(w);
  });
}
ACT['zy-tab-go'] = function(el){ var w = el.closest('.zy-tw'), s = w && w.querySelector('.admin-tabs,.za-tabs'); if(!s) return; var d = +el.getAttribute('data-d'); try{ s.scrollBy({left:d*Math.max(160, s.clientWidth*0.7), behavior:'smooth'}); }catch(e){ s.scrollLeft += d*200; } setTimeout(function(){ zy_tabUpd(w); }, 400); };
(function(){
  if(typeof render==='function' && !render._zy){ var r0 = render; render = function(){ var x = r0.apply(this, arguments); try{ zy_tabsEnhance(); }catch(e){ console.error(e); } return x; }; render._zy = true; }
  var t; window.addEventListener('resize', function(){ clearTimeout(t); t = setTimeout(function(){ document.querySelectorAll('.zy-tw').forEach(zy_tabUpd); }, 120); });
})();
