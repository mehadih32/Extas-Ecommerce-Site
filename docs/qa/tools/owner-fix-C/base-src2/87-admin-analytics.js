/* ================= EXTAS demo — Admin · Analytics (87) =================
   The owner's numbers page at #/admin/analytics. It only READS the events that
   88-track.js records (window.EXTRACK) — this file loads first, so EXTRACK is
   used at render time only, never at load time.
   Registers its own route and adds itself to the admin menu by wrapping
   adminShell() — no other file is edited. */
(function(){
  var css = `
.an-page{color:var(--ink)}
.an-hd{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:16px}
.an-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.an-tools .btn{background:#fff}
.an-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:16px}
@media(min-width:700px){.an-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1180px){.an-kpis{grid-template-columns:repeat(6,minmax(0,1fr))}}
.an-k{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px 13px;min-width:0}
.an-k .v{font-family:var(--font-display);font-size:24px;font-weight:800;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.an-k .l{font-size:11px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;font-weight:700;margin-top:4px}
.an-g{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
@media(min-width:1024px){.an-g{grid-template-columns:repeat(2,minmax(0,1fr))}.an-wide{grid-column:1/-1}}
.an-c{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:16px;min-width:0}
@media(min-width:1024px){.an-c{padding:18px 20px}}
.an-c h2{font-family:var(--font-display);font-size:16px;font-weight:700;margin:0}
.an-c .an-sub{font-size:12.5px;color:var(--muted);margin:3px 0 12px}
.an-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center;padding:7px 0;border-top:1px solid var(--line2)}
.an-row:first-of-type{border-top:0}
.an-row .n{font-size:13.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.an-row .n small{color:var(--muted);font-size:11.5px;margin-left:6px}
.an-row .c{font-weight:700;font-size:13.5px;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.an-row .c small{color:var(--muted);font-weight:500;margin-left:5px}
.an-bar{grid-column:1/-1;height:7px;background:var(--line2);border-radius:4px;overflow:hidden}
.an-bar i{display:block;height:100%;background:var(--brand);border-radius:4px;min-width:2px}
.an-bar.alt i{background:#C08A3E}
.an-bar.split{display:flex}
.an-bar.split i{border-radius:0}
.an-bar.split i+i{background:#C9C3B8}
.an-mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
.an-mini>div{background:var(--surface2);border:1px solid var(--line2);border-radius:8px;padding:10px 11px;min-width:0}
.an-mini b{display:block;font-family:var(--font-display);font-size:20px;line-height:1.1}
.an-mini span{font-size:11.5px;color:var(--muted);font-weight:600}
.an-h3{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:14px 0 4px}
.an-tbl{width:100%;border-collapse:collapse;font-size:13px}
.an-tbl th,.an-tbl td{padding:8px 8px;border-bottom:1px solid var(--line2);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.an-tbl th{font-size:11.5px;font-weight:700;color:var(--muted);background:var(--surface2);text-transform:uppercase;letter-spacing:.04em}
.an-tbl th:first-child,.an-tbl td:first-child{text-align:left;position:sticky;left:0;background:var(--surface)}
.an-tbl th:first-child{background:var(--surface2)}
@media(max-width:600px){.an-tbl td:first-child{white-space:normal;min-width:118px;max-width:150px;line-height:1.3}}
.an-tbl td.z{color:#C9C3B8}
.an-tbl td.hot{font-weight:800;color:var(--brand-dark)}
.an-tbl tr.tot td{font-weight:700;border-bottom:0}
.an-tw{overflow-x:auto;border:1px solid var(--line2);border-radius:8px;overscroll-behavior-x:contain}
.an-empty{background:var(--surface);border:1px dashed var(--line);border-radius:8px;padding:28px 18px;text-align:center}
.an-tag{display:inline-block;font-size:10.5px;font-weight:700;border-radius:10px;padding:1px 7px;margin-left:6px;background:var(--brand-tint);color:var(--brand-dark);vertical-align:1px}
.an-tag.warn{background:var(--warn-bg);color:var(--warn)}
.an-legend{display:flex;gap:14px;font-size:12px;color:var(--text2);margin-bottom:6px}
.an-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--brand);margin-right:5px;vertical-align:-1px}
.an-legend i.g{background:#C9C3B8}
.an-log td{font-size:12.5px}
.an-note{font-size:12px;color:var(--muted);margin-top:10px}
`;
  var s = document.createElement('style'); s.setAttribute('data-mod', 'admin-analytics'); s.textContent = css; document.head.appendChild(s);
})();

/* ---------- route + admin menu (from this file) ---------- */
try{ if(!ROUTES.some(function(r){ return r[1]==='admin-analytics'; })) ROUTES.push([/^\/admin\/analytics$/, 'admin-analytics']); }catch(e){}
function an_icon(size){
  size = size || 18;
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16"/><path d="M7 16v-5M12 16V6M17 16v-8"/></svg>';
}
(function(){
  try{
    var orig = window.adminShell; if(typeof orig!=='function' || orig._an) return;
    var w = function(body, cur){
      var out = orig.apply(this, arguments);
      try{
        if(out.indexOf('#/admin/analytics')>=0) return out;          /* already in the menu (e.g. added in 03-layout.js later) */
        var on = cur && cur.path==='/admin/analytics';
        out = out.replace(/(<a class="[^"]*" href="#\/admin\/reviews">[\s\S]*?<\/a>)/g, function(m){
          if(/class="chip/.test(m)) return m+'<a class="chip'+(on?' on':'')+'" href="#/admin/analytics">Analytics</a>';
          return m+'<a class="'+(on?'on':'')+'" href="#/admin/analytics">'+an_icon(18)+'Analytics</a>';
        });
      }catch(e){}
      return out;
    };
    w._an = true; window.adminShell = w;
  }catch(e){}
})();

/* ---------- helpers ---------- */
var AN_SRC = {pdp_bar:'Product · sticky bar', pdp_cta:'Product · buttons', pdp_duo_popup:'Duo offer pop-up', combo_page:'Combo page', set_builder:'Build a set',
  bag_duo_offer:'Bag · duo offer', checkout_upsell:'Checkout upsell', thanks_add_on:'Thank-you add-on', landing_page:'Landing page', card_quick_add:'Card quick add', upsell_block:'Upsell block'};
var AN_OFFER = {combo:'Combo', custom_set:'Own set', duo_offer:'Duo offer', upsell:'Upsell', pdp_nudge:'Product nudge', upsell_set_line:'Upsell set line', upsell_card:'Upsell card', complete_the_look:'Goes well with', home_sets_band:'Home sets band'};
function an_T(){ return window.EXTRACK || null; }
function an_cat(){ var T = an_T(); return T && T.events ? T.events : []; }
function an_label(ev){ var c = an_cat().filter(function(x){ return x.name===ev; })[0]; return c ? c.label : ev; }
function an_page(pg){ var T = an_T(), m = (T && T.pages) || {}; return m[pg] || (pg ? String(pg).replace(/[-_]/g,' ').replace(/^./, function(c){ return c.toUpperCase(); }) : '—'); }
function an_human(s){ return String(s||'—').replace(/@/g,' · ').replace(/[_-]+/g,' ').replace(/^./, function(c){ return c.toUpperCase(); }); }
function an_src(s){ return AN_SRC[s] || an_human(s); }
function an_btn(id, label){
  var T = an_T(), b = T && T.buttons ? T.buttons.filter(function(x){ return x.id===id; })[0] : null; if(b) return b.label;
  var at = String(id||'').indexOf('@'), place = at>=0 ? String(id).slice(at+1) : '';
  return label ? label+(place ? ' · '+an_human(place).toLowerCase() : '') : an_human(id);
}
function an_pname(pid){ var p = pid && P(pid); return p ? p.name : (pid || '—'); }
function an_n(n){ return Number(n||0).toLocaleString('en-US'); }
function an_pct(a, b){ return b ? Math.round(a/b*100) : 0; }
function an_count(list, key){ var m = {}; list.forEach(function(e){ var k = typeof key==='function' ? key(e) : e[key]; if(k==null || k==='') return; m[k] = (m[k]||0)+1; }); return m; }
function an_sorted(m){ return Object.keys(m).map(function(k){ return [k, m[k]]; }).sort(function(a,b){ return b[1]-a[1]; }); }
function an_bar(v, max, cls){ return '<div class="an-bar'+(cls?' '+cls:'')+'"><i style="width:'+(max ? Math.max(1, Math.round(v/max*100)) : 0)+'%"></i></div>'; }
function an_row(name, count, max, opts){
  opts = opts || {};
  return '<div class="an-row"><span class="n">'+name+'</span><span class="c">'+an_n(count)+(opts.extra?'<small>'+opts.extra+'</small>':'')+'</span>'+(opts.noBar?'':an_bar(count, max, opts.cls))+'</div>';
}
function an_rangeStart(r){
  if(r==='today'){ var d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
  if(r==='7d') return Date.now() - 7*86400000;
  return 0;
}
function an_events(){
  var T = an_T(); if(!T) return [];
  var u = ui('admin-analytics', {range:'7d'}), from = an_rangeStart(u.range);
  return T.all().filter(function(e){ return e && e.t >= from; });
}
function an_card(title, sub, body, wide){ return '<section class="an-c'+(wide?' an-wide':'')+'"><h2>'+esc(title)+'</h2>'+(sub?'<div class="an-sub">'+sub+'</div>':'<div style="height:10px"></div>')+body+'</section>'; }

/* ---------- blocks ---------- */
function an_funnel(E, by){
  var steps = [['Product view','product_view'],['Add to bag','add_to_bag'],['Checkout','checkout_start'],['Purchase','purchase']];
  var base = by.product_view || 0, top = Math.max.apply(null, steps.map(function(s){ return by[s[1]]||0; }).concat([1]));
  var prev = null, h = '';
  steps.forEach(function(s, i){
    var n = s[1]==='purchase' ? E.filter(function(e){ return e.ev==='purchase' && e.via==='bag'; }).length
          : s[1]==='checkout_start' ? E.filter(function(e){ return e.ev==='checkout_start' && e.via!=='order_now'; }).length : (by[s[1]]||0);
    var extra = i===0 ? '' : an_pct(n, prev)+'% of previous';
    h += an_row(esc(s[0]), n, top, {extra:extra}); prev = n;
  });
  var on = by.order_now || 0, onCk = E.filter(function(e){ return e.ev==='checkout_start' && e.via==='order_now'; }).length;
  var onBuy = E.filter(function(e){ return e.ev==='purchase' && (e.via==='order_now' || e.via==='landing'); }).length;
  var top2 = Math.max(on, onBuy, 1);
  var d = an_row('Order Now tapped', on, top2, {cls:'alt'}) + an_row('Checkout opened', onCk, top2, {cls:'alt', extra:an_pct(onCk, on)+'%'}) +
    an_row('Purchase <small>incl. landing pages</small>', onBuy, top2, {cls:'alt', extra:an_pct(onBuy, on)+'%'});
  var conv = base ? (Math.round(E.filter(function(e){ return e.ev==='purchase'; }).length/base*1000)/10) : 0;
  return an_card('Funnel', 'Bag route: product view to purchase. Each step shows the share of the step before.',
    h+'<div class="an-h3">Direct · Order Now</div>'+d+'<div class="an-note">All purchases per product view: <b>'+conv+'%</b></div>');
}
function an_totals(E, by){
  var names = an_cat().map(function(c){ return c.name; });
  Object.keys(by).forEach(function(k){ if(names.indexOf(k)<0) names.push(k); });
  var max = Math.max.apply(null, names.map(function(n){ return by[n]||0; }).concat([1]));
  return an_card('Totals per event', an_n(E.length)+' events in this period.', names.map(function(n){ return an_row(esc(an_label(n))+'<small>'+esc(n)+'</small>', by[n]||0, max); }).join(''));
}
function an_wa(E){
  var W = E.filter(function(e){ return e.ev==='whatsapp_click'; });
  if(!W.length) return an_card('WhatsApp clicks · page × button', 'Which button on which page opened WhatsApp.', '<div class="small muted">No WhatsApp clicks yet.</div>', true);
  var pages = an_sorted(an_count(W, 'page')).map(function(x){ return x[0]; });
  var btns = an_sorted(an_count(W, function(e){ return e.btn || e.src; }));
  var cell = {}, lab = {}; W.forEach(function(e){ var b = e.btn || e.src; cell[b+'|'+e.page] = (cell[b+'|'+e.page]||0)+1; if(e.btn_label) lab[b] = e.btn_label; });
  var hot = 0; for(var k in cell) hot = Math.max(hot, cell[k]);
  var colTot = pages.map(function(p){ return W.filter(function(e){ return e.page===p; }).length; });
  var t = '<div class="an-tw"><table class="an-tbl"><thead><tr><th>Button</th>'+pages.map(function(p){ return '<th>'+esc(an_page(p))+'</th>'; }).join('')+'<th>Total</th></tr></thead><tbody>'+
    btns.map(function(b){
      return '<tr><td>'+esc(an_btn(b[0], lab[b[0]]))+'</td>'+pages.map(function(p){ var v = cell[b[0]+'|'+p]||0; return '<td class="'+(v?(v===hot?'hot':''):'z')+'">'+(v||'·')+'</td>'; }).join('')+'<td><b>'+b[1]+'</b></td></tr>';
    }).join('')+
    '<tr class="tot"><td>All buttons</td>'+colTot.map(function(v){ return '<td>'+v+'</td>'; }).join('')+'<td>'+W.length+'</td></tr></tbody></table></div>';
  var share = W.filter(function(e){ return e.kind==='share'; }).length;
  return an_card('WhatsApp clicks · page × button', an_n(W.length)+' clicks'+(share?' · '+share+' were shares, not chats':'')+'. Biggest cell in bold.', t, true);
}
function an_search(E){
  var S = E.filter(function(e){ return e.ev==='search' && e.term; });
  if(!S.length) return an_card('Top search terms', '', '<div class="small muted">No searches yet.</div>');
  var cnt = an_count(S, 'term'), res = {}; S.forEach(function(e){ if(e.results!=null) res[e.term] = e.results; });
  var top = an_sorted(cnt).slice(0, 10), max = top[0][1];
  var zero = Object.keys(res).filter(function(k){ return res[k]===0; }).length;
  var sug = S.filter(function(e){ return e.method==='suggestion'; }).length;
  return an_card('Top search terms', an_n(S.length)+' searches · '+an_pct(sug, S.length)+'% from a suggestion'+(zero?' · <b>'+zero+' terms found nothing</b>':''),
    top.map(function(x){ var r = res[x[0]]; return an_row(esc(x[0])+(r===0?'<span class="an-tag warn">no results</span>':(r!=null?'<small>'+r+' results</small>':'')), x[1], max); }).join(''));
}
function an_bag(E, by){
  var R = E.filter(function(e){ return e.ev==='remove_from_bag'; });
  var mini = '<div class="an-mini"><div><b>'+an_n(by.remove_from_bag||0)+'</b><span>Removes</span></div><div><b>'+an_n(by.re_add||0)+'</b><span>Re-adds</span></div><div><b>'+an_n(by.new_add_after_remove||0)+'</b><span>New adds after</span></div></div>';
  var top = an_sorted(an_count(R, 'pid')).slice(0, 5), max = top.length ? top[0][1] : 1;
  return an_card('Bag changes', 'Removed items, the same item added back, and a different item added after a removal (same visit).',
    mini+(top.length ? '<div class="an-h3">Most removed</div>'+top.map(function(x){ return an_row(esc(an_pname(x[0])), x[1], max, {cls:'alt'}); }).join('') : '<div class="small muted">Nothing removed yet.</div>'));
}
function an_offers(E){
  var A = E.filter(function(e){ return e.ev==='add_to_bag' || e.ev==='order_now'; });
  var off = A.filter(function(e){ return e.from_offer; }).length, norm = A.length - off, max = Math.max(off, norm, 1);
  var bySrc = an_sorted(an_count(A, 'src')), m2 = bySrc.length ? bySrc[0][1] : 1;
  var byOffer = an_sorted(an_count(A.filter(function(e){ return e.from_offer; }), 'offer'));
  return an_card('Adds · from offers vs normal', 'Adds to bag and Order Now taps. Offer = combo, own set, duo, nudge, upsell or "goes well with".',
    an_row('From an offer', off, max, {extra:an_pct(off, A.length)+'%'}) + an_row('Normal', norm, max, {cls:'alt', extra:an_pct(norm, A.length)+'%'}) +
    (byOffer.length ? '<div class="an-h3">Which offer</div>'+byOffer.map(function(x){ return an_row(esc(AN_OFFER[x[0]] || an_human(x[0])), x[1], byOffer[0][1]); }).join('') : '')+
    (bySrc.length ? '<div class="an-h3">Which button</div>'+bySrc.map(function(x){ return an_row(esc(an_src(x[0])), x[1], m2); }).join('') : ''));
}
function an_taps(E, by){
  var part = function(ev, title){
    var L = E.filter(function(e){ return e.ev===ev; }), top = an_sorted(an_count(L, 'pid')).slice(0, 3);
    return '<div class="an-h3">'+esc(title)+' · top items</div>'+(top.length ? top.map(function(x){ return an_row(esc(an_pname(x[0])), x[1], top[0][1]); }).join('') : '<div class="small muted">None yet.</div>');
  };
  var mini = '<div class="an-mini"><div><b>'+an_n(by.all_colours_click||0)+'</b><span>All colours</span></div><div><b>'+an_n(by.size_chart_click||0)+'</b><span>Size chart</span></div><div><b>'+an_n(by.wishlist_add||0)+'</b><span>Wishlist saves</span></div></div>';
  return an_card('Product page taps', an_n(by.wishlist_remove||0)+' wishlist removes in this period.', mini + part('all_colours_click','All colours') + part('size_chart_click','Size chart') + part('wishlist_add','Wishlist'));
}
function an_auth(E, by){
  var names = an_cat().map(function(c){ return c.name; }).filter(function(n){ return by[n]; });
  if(!names.length) return an_card('Logged in vs guest', '', '<div class="small muted">No events yet.</div>', true);
  var rows = names.map(function(n){
    var L = E.filter(function(e){ return e.ev===n; }), m = L.filter(function(e){ return e.auth==='member'; }).length, g = L.length - m, pm = an_pct(m, L.length);
    return '<tr><td>'+esc(an_label(n))+'</td><td>'+m+' <span class="muted">('+pm+'%)</span></td><td>'+g+' <span class="muted">('+(100-pm)+'%)</span></td>'+
      '<td style="min-width:120px;width:30%"><div class="an-bar split"><i style="width:'+pm+'%"></i><i style="width:'+(100-pm)+'%"></i></div></td></tr>';
  }).join('');
  var all = E.filter(function(e){ return e.auth==='member'; }).length;
  return an_card('Logged in vs guest', 'Share of each event done by logged-in customers. Overall: '+an_pct(all, E.length)+'% logged in.',
    '<div class="an-legend"><span><i></i>Logged in</span><span><i class="g"></i>Guest</span></div>'+
    '<div class="an-tw"><table class="an-tbl"><thead><tr><th>Event</th><th>Logged in</th><th>Guest</th><th>Share</th></tr></thead><tbody>'+rows+'</tbody></table></div>', true);
}
function an_latest(E){
  var L = E.slice(-12).reverse();
  return an_card('Latest events', 'Newest first. Stored only in this browser (demo).',
    '<div class="an-tw"><table class="an-tbl an-log"><thead><tr><th>Event</th><th>Time</th><th>Page</th><th>Product</th><th>From</th><th>Who</th></tr></thead><tbody>'+
    L.map(function(e){ return '<tr><td>'+esc(an_label(e.ev))+'</td><td>'+esc(dateTimeStr(e.t))+'</td><td>'+esc(an_page(e.page))+'</td><td>'+esc(e.pid ? an_pname(e.pid) : (e.term ? '“'+e.term+'”' : '—'))+'</td><td>'+esc(e.btn ? an_btn(e.btn, e.btn_label) : an_src(e.src))+'</td><td>'+(e.auth==='member'?'Logged in':'Guest')+'</td></tr>'; }).join('')+
    '</tbody></table></div>', true);
}

/* ---------- page ---------- */
PAGES['admin-analytics'] = { layout:'admin', title:'Analytics', render:function(){
  var u = ui('admin-analytics', {range:'7d'}), T = an_T();
  var seg = '<div class="seg" role="group" aria-label="Date range">'+[['today','Today'],['7d','7 days'],['all','All']].map(function(o){
    return '<button data-act="an-range" data-v="'+o[0]+'" class="'+(u.range===o[0]?'on':'')+'" aria-pressed="'+(u.range===o[0])+'">'+o[1]+'</button>'; }).join('')+'</div>';
  var head = '<div class="an-hd"><div><div class="eyebrow">Admin · Insights</div><h1 class="h1" style="margin-top:6px">Analytics</h1>'+
      '<p class="small text2" style="margin:6px 0 0;max-width:620px">What shoppers do on the site: searches, WhatsApp, bag, checkout and orders.</p></div>'+
    '<div class="an-tools">'+seg+'<button class="btn btn-sm btn-ghost" data-act="an-demo">'+ico('spark',15)+'Fill demo data</button><button class="btn btn-sm btn-ghost" data-act="an-clear">'+ico('trash',15)+'Clear</button></div></div>';
  if(!T) return '<div class="an-page">'+head+'<div class="an-empty">Event tracking is not loaded.</div></div>';
  var E = an_events(), by = an_count(E, 'ev');
  if(!E.length){
    var any = T.all().length;
    return '<div class="an-page">'+head+'<div class="an-empty"><div class="h3">'+(any ? 'No events in this period' : 'No events yet')+'</div>'+
      '<p class="small text2" style="margin:6px 0 14px">'+(any ? 'Try "All", or use the shop and come back.' : 'Use the shop in another tab, or fill the page with sample data for the demo.')+'</p>'+
      '<button class="btn btn-primary btn-sm" data-act="an-demo">Fill demo data</button></div></div>';
  }
  var sales = E.filter(function(e){ return e.ev==='purchase'; }).reduce(function(s, e){ return s + (Number(e.total)||0); }, 0);
  var k = function(l, v){ return '<div class="an-k"><div class="v">'+v+'</div><div class="l">'+esc(l)+'</div></div>'; };
  var kpis = '<div class="an-kpis">'+k('Product views', an_n(by.product_view))+k('Add to bag', an_n(by.add_to_bag))+k('Checkouts', an_n(by.checkout_start))+
    k('Purchases', an_n(by.purchase))+k('Sales', fmt(sales))+k('WhatsApp clicks', an_n(by.whatsapp_click))+'</div>';
  return '<div class="an-page">'+head+kpis+'<div class="an-g">'+
    an_funnel(E, by)+an_totals(E, by)+an_wa(E)+an_search(E)+an_bag(E, by)+an_offers(E)+an_taps(E, by)+an_auth(E, by)+an_latest(E)+
  '</div></div>';
}};

ACT['an-range'] = function(el){ ui('admin-analytics', {range:'7d'}).range = el.getAttribute('data-v'); rerender(); };
ACT['an-demo'] = function(){ var T = an_T(); if(!T) return; var n = T.demo(300); rerender(); toast(n+' sample events added'); };
ACT['an-clear'] = function(){ var T = an_T(); if(!T) return; if(!confirm('Clear all recorded events?')) return; T.clear(); rerender(); toast('Events cleared'); };
