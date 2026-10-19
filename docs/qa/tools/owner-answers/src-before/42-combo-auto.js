/* =====================================================================
   EXTAS demo — AUTO COLOUR-PAIR COMBOS (the owner's model) · PR 571–575
   ---------------------------------------------------------------------
   Data: DB.comboRules (01y-combo-auto-data.js). Nothing is typed in per
   pair: every colour pair / triple is GENERATED from a rule each time a
   page is drawn, so a colour added to the product, a colour left out, a
   size that sells out or a price change shows everywhere at once.

   Routes (registered from this file):
     #/combos                     hub of every active rule (L3 look)
     #/combos/<ruleId>            the owner's promoted page — ONLY the
                                  generated combo cards (L1 default; ?tpl=L1..L5)
     #/combo-pair/<id>            one pair's own product page (P1 default;
                                  ?tpl=P1..P5). id = <rule>~black-navy
                                  P3 top + bottom set · P4 mixed set (wave 2)
     #/combo/<rule>~<colours>     same page — the bag's "Change size or
                                  colour" link lands here (?sizes=&from=)

   One adapter puts a combo in the bag (ca_bagLine / ca_bagAdd). One
   function draws every combo picture (ca_setPhoto). No single piece is
   offered anywhere in this section, and nothing here links to a single
   product page.
   Prefix: ca_ (functions), ca- (actions and CSS classes).
   ===================================================================== */
var CA = {cache:{}, viewed:{}, SIZE_ORDER:['XS','S','M','L','XL','XXL','3XL','4XL']};
var CA_HOUSE_BG = '#ECE9E3';   /* the one photo background (house standard) */

/* ---------- rules ---------- */
function ca_rule(id){
  var base = null; (DB.comboRules||[]).forEach(function(r){ if(r.id===id) base = r; });
  if(!base) return null;
  var ov = (ST && ST.comboAutoOverride && ST.comboAutoOverride[id]) || null;
  var r = JSON.parse(JSON.stringify(base));
  if(ov) for(var k in ov) r[k] = ov[k];
  r.bind = r.bind || {categories:[], products:[]};
  r.pieces = r.pieces===3 ? 3 : 2;
  r.pairing = r.pairing || 'style';
  r.price = r.price || {mode:'percent', value:10};
  r.label = r.label || (r.pieces+'-piece combo');
  return r;
}
function ca_rules(){ return (DB.comboRules||[]).map(function(r){ return ca_rule(r.id); }); }
function ca_activeRules(){ return ca_rules().filter(function(r){ return r.active; }); }
function ca_setting(k){ var s = (ST && ST.comboAuto) || {}; return s[k]; }

/* ---------- binding: which products a rule takes in (live) ---------- */
function ca_inPath(p, path){
  if(p.cat===path) return true;
  var sub = p.sub || '';
  return sub===path || sub.indexOf(path+'/')===0;
}
function ca_productsFor(rule){
  var out = [], seen = {};
  var add = function(p){ if(p && !seen[p.id] && p.colors && p.colors.length){ seen[p.id] = 1; out.push(p); } };
  (rule.bind.products||[]).forEach(function(id){ add(P(id)); });
  (rule.bind.categories||[]).forEach(function(path){ DB.products.forEach(function(p){ if(ca_inPath(p, path)) add(p); }); });
  return out.filter(function(p){ return !p.comboOff; }); /* admin 'Use in combos' tick */
}
function ca_coloursOf(rule, p){ var ex = rule.excludeColours||[]; return p.colors.filter(function(c){ return ex.indexOf(c)<0; }); }
function ca_short(p){ return p.short || p.style || p.name; }
function ca_garment(p){ var c = CAT(p.cat); return p.garment || (c && c.garment) || 'tee'; }

/* k-combinations (order kept), with or without repeats */
function ca_choose(arr, k, rep){
  var out = [];
  (function rec(start, acc){
    if(acc.length===k){ out.push(acc.slice()); return; }
    for(var i=start;i<arr.length;i++){ acc.push(arr[i]); rec(rep ? i : i+1, acc); acc.pop(); }
  })(0, []);
  return out;
}
function ca_cartesian(lists){
  return lists.reduce(function(acc, list){ var o = []; acc.forEach(function(a){ list.forEach(function(x){ o.push(a.concat([x])); }); }); return o; }, [[]]);
}

/* ---------- best-seller signals ---------- */
function ca_orderStats(){
  var n = Object.keys(ST.orders||{}).length;
  if(CA.stats && CA.stats.n===n) return CA.stats;
  var s = {n:n, colour:{}, set:{}};
  Object.keys(ST.orders||{}).forEach(function(id){
    (ST.orders[id].lines||[]).forEach(function(l){
      var k = l.product+'|'+l.color; s.colour[k] = (s.colour[k]||0) + (l.qty||1);
      if(l.setLabel) s.set[l.setLabel] = (s.set[l.setLabel]||0) + 1;
    });
  });
  CA.stats = s; return s;
}
function ca_colourSales(p, c){
  var st = ca_orderStats(), base = p.sold && p.sold[c] != null ? p.sold[c] : 0;
  var v = base + (st.colour[p.id+'|'+c]||0);
  if(!v) v = (p.reviews||0) / (1 + p.colors.indexOf(c));   /* no sales data: reviews, owner's colour order */
  return v;
}

/* ---------- one generated combo listing ---------- */
function ca_build(rule, pieces, multi){
  var prods = pieces.map(function(pc){ return pc.p; });
  var same = prods.every(function(p){ return p.id===prods[0].id; });
  var regular = prods.reduce(function(s, p){ return s + (p.price||0); }, 0);
  var price = rule.price.mode==='percent' ? Math.round(regular*(1 - (Number(rule.price.value)||0)/100)/10)*10 : Number(rule.price.value)||regular;
  if(price > regular || price <= 0) price = regular;            /* guard: never above the regular total */
  var colours = pieces.map(function(pc){ return pc.color; });
  var key;
  if(rule.pairing==='any' && !same) key = pieces.map(function(pc){ return (pc.p.comboCode||pc.p.id)+'.'+pc.color; }).join('-');
  else key = (multi && rule.pairing==='style' ? (prods[0].comboCode||prods[0].id)+'~' : '') + colours.join('-');
  var id = rule.id+'~'+key;
  /* sizes every piece is made in, in the product's order */
  var sizes = prods[0].sizes.filter(function(s){ return prods.every(function(p){ return p.sizes.indexOf(s)>=0; }); });
  var avail = {}, okCount = 0;
  sizes.forEach(function(s){
    var need = {}; pieces.forEach(function(pc){ var k = pc.p.id+'|'+pc.color; need[k] = (need[k]||0)+1; });
    var out = [], low = 99;
    pieces.forEach(function(pc){
      var st = stockOf(pc.p.id, pc.color, s), n = need[pc.p.id+'|'+pc.color];
      if(st < n){ if(!out.some(function(o){ return o.color===pc.color && o.p.id===pc.p.id; })) out.push(pc); }
      else low = Math.min(low, Math.floor(st/n));
    });
    var reason = out.length ? out.map(function(pc){ return COL(pc.color).name+(same ? '' : ' '+ca_short(pc.p).toLowerCase()); }).join(' + ')+' sold out' : '';
    avail[s] = {ok:!out.length, out:out, reason:reason, low:out.length ? 0 : low};
    if(!out.length) okCount++;
  });
  var title = colours.map(function(c){ return COL(c).name; }).join(' + ');
  var styleName = same ? (prods[0].style || prods[0].name) : (rule.title || prods.map(ca_short).join(' + '));
  var full = same ? prods[0].name : (rule.title || styleName);
  var isNew = pieces.some(function(pc){ var t = pc.p.colorAdded && pc.p.colorAdded[pc.color]; return t && (Date.now()-t) < 14*86400000; });
  var L = {id:id, rule:rule, ruleId:rule.id, pieces:pieces, n:pieces.length, same:same, colours:colours, colorKey:colours.join('-'),
    styleKey: same ? prods[0].id : 'mix', styleName:styleName, title:title,
    name: full+' — '+title+' · '+rule.label,
    sub: styleName+' · '+pieces.length+' pcs',
    regular:regular, price:price, save:regular-price, each:Math.round(price/pieces.length),
    sizes:sizes, avail:avail, availCount:okCount, isNew:isNew};
  /* best-seller score: owner pin > pair sales > colours' single sales > sizes in stock */
  var st = ca_orderStats();
  var pinned = (rule.pins||[]).indexOf(L.colorKey)>=0 || (rule.pins||[]).indexOf(id)>=0;
  L.pairSales = ((DB.comboAutoSales||{})[id]||0) + (st.set[L.name]||0)/pieces.length;
  L.colourSales = pieces.reduce(function(s, pc){ return s + ca_colourSales(pc.p, pc.color); }, 0);
  L.colourIdx = pieces.map(function(pc){ return ('0'+pc.p.colors.indexOf(pc.color)).slice(-2); }).join('');
  L.pinned = pinned;
  return L;
}

/* ---------- the generator (PR 571) ----------
   Returns {rule, all, visible, byId}. Re-run whenever the rule, the bound
   products' colours or their stock change (signature check), so a new
   colour makes its pairs at once and a sold-out colour hides them. */
function ca_generate(rule){
  if(typeof rule==='string') rule = ca_rule(rule);
  if(!rule) return {rule:null, all:[], visible:[], byId:{}};
  var prods = ca_productsFor(rule);
  var sig = JSON.stringify([rule, prods.map(function(p){ return [p.id, p.price, p.colors, p.stock, p.sold||0]; }), Object.keys(ST.orders||{}).length]);
  var c = CA.cache[rule.id]; if(c && c.sig===sig) return c.res;
  var sets = [], multi = prods.length > 1;
  if(rule.pairing==='across'){
    ca_choose(prods, rule.pieces, false).forEach(function(group){
      ca_cartesian(group.map(function(p){ return ca_coloursOf(rule, p).map(function(col){ return {p:p, color:col}; }); })).forEach(function(s){ sets.push(s); });
    });
  } else if(rule.pairing==='any'){
    var pool = []; prods.forEach(function(p){ ca_coloursOf(rule, p).forEach(function(col){ pool.push({p:p, color:col}); }); });
    ca_choose(pool, rule.pieces, !!rule.sameColour).forEach(function(s){ sets.push(s); });
  } else {
    prods.forEach(function(p){
      ca_choose(ca_coloursOf(rule, p), rule.pieces, !!rule.sameColour).forEach(function(cols){ sets.push(cols.map(function(col){ return {p:p, color:col}; })); });
    });
  }
  var all = sets.map(function(s){ return ca_build(rule, s, multi); });
  ca_sort(all, rule.order==='colour' ? 'colour' : 'best');
  var byId = {}; all.forEach(function(L){ byId[L.id] = L; });
  var res = {rule:rule, products:prods, all:all, visible:all.filter(function(L){ return L.availCount>0; }), byId:byId};
  CA.cache[rule.id] = {sig:sig, res:res};
  return res;
}
function ca_sort(list, how){
  var cmpIdx = function(a, b){ return a.colourIdx < b.colourIdx ? -1 : a.colourIdx > b.colourIdx ? 1 : 0; };
  list.sort(function(a, b){
    if(how==='colour') return cmpIdx(a, b);
    if(how==='sizes') return (b.availCount - a.availCount) || (b.pairSales - a.pairSales) || (b.colourSales - a.colourSales) || cmpIdx(a, b);
    if(how==='new') return (b.isNew - a.isNew) || (b.pairSales - a.pairSales) || (b.colourSales - a.colourSales) || cmpIdx(a, b);
    if(how==='price') return (a.price - b.price) || cmpIdx(a, b);
    return (b.pinned - a.pinned) || (b.pairSales - a.pairSales) || (b.colourSales - a.colourSales) || (b.availCount - a.availCount) || cmpIdx(a, b);
  });
  return list;
}
function ca_listing(id){
  var rid = String(id||'').split('~')[0], r = ca_rule(rid); if(!r) return null;
  return ca_generate(r).byId[id] || null;
}
/* the 3-piece rule a pair can grow into ("add 1 more"), and back */
function ca_upsellRule(rule){
  if(!rule || !rule.allowUpsell3 || rule.pieces!==2) return null;
  var r3 = rule.upsell ? ca_rule(rule.upsell) : null;
  if(!r3) r3 = ca_rules().filter(function(x){ return x.pieces===3 && x.pairing===rule.pairing && JSON.stringify(x.bind)===JSON.stringify(rule.bind); })[0] || null;
  return r3 && r3.active ? r3 : null;
}
function ca_tierRules(rule){
  if(!rule) return null;
  if(rule.pieces===2){ var r3 = ca_upsellRule(rule); return r3 ? {two:rule, three:r3} : null; }
  var r2 = ca_activeRules().filter(function(x){ var u = ca_upsellRule(x); return u && u.id===rule.id; })[0];
  return r2 ? {two:r2, three:rule} : null;
}
/* the listing of `rule` made of exactly these (product, colour) pieces */
function ca_findBy(rule, pieces){
  var want = pieces.map(function(pc){ return pc.p.id+'|'+pc.color; }).sort().join(',');
  var g = ca_generate(rule);
  for(var i=0;i<g.all.length;i++){ var k = g.all[i].pieces.map(function(pc){ return pc.p.id+'|'+pc.color; }).sort().join(','); if(k===want) return g.all[i]; }
  return null;
}
function ca_sizeLine(L){
  var ok = L.sizes.filter(function(s){ return L.avail[s].ok; });
  if(!ok.length) return 'Sold out';
  if(ok.length===L.sizes.length) return L.sizes[0]+'–'+L.sizes[L.sizes.length-1];
  var idx = ok.map(function(s){ return L.sizes.indexOf(s); });
  if(ok.length>=3 && idx[idx.length-1]-idx[0]===idx.length-1) return ok[0]+'–'+ok[ok.length-1];
  return ok.join(' · ')+(ok.length<=3 ? ' left' : '');
}
function ca_freeDelivery(price){ var f = SET('delivery','freeOver'); return f && price >= f; }

/* ---------- PR 575 · the set photo, from each piece's photo ----------
   layout 'card'  : pair = staggered overlap (A top-left, B bottom-right in front)
                    triple = fan of 3
            'hero'  : pair = side-by-side halves with colour chips
                    triple = one large left + two stacked right
            'fan'   : fixed-colour pack, all pieces fanned in a row
            'thumb' : bag / strip thumbnail (overlap, square)
            'tb'    : top + bottom outfit flat-lay (P3), a name chip per piece
   A piece is {p, color} — or null for an empty slot ("Pick colour 2").
   Uses the backend's cut-out photo when it exists
   (product.photos[colour].front.cut / .src), otherwise the drawing. */
function ca_pieceArt(pc, view){
  var ph = pc.p.photos && pc.p.photos[pc.color] && pc.p.photos[pc.color][view||'front'];
  if(ph && (ph.cut || ph.src)) return '<img src="'+esc(ph.cut || ph.src)+'" alt="" draggable="false">';
  return garmentSVG(ca_garment(pc.p), COL(pc.color).hex, view||'front');
}
function ca_setPhoto(pieces, opts){
  opts = opts||{}; var lay = opts.layout||'card', n = pieces.length;
  var alt = pieces.filter(Boolean).map(function(pc){ return COL(pc.color).name+' '+ca_short(pc.p).toLowerCase(); }).join(', ');
  var cls = 'ca-ph ca-ph-'+lay+' n'+n+(opts.cls ? ' '+opts.cls : '');
  var inner = '';
  if(lay==='hero'){
    inner = pieces.map(function(pc, i){
      if(!pc) return '<div class="ca-half empty"><span>Pick colour '+(i+1)+'</span></div>';
      return '<div class="ca-half"><div class="ca-art">'+ca_pieceArt(pc)+'</div>'+(opts.chips===false ? '' : '<span class="ca-chip"><i style="background:'+COL(pc.color).hex+'"></i>'+esc(COL(pc.color).name)+'</span>')+'</div>';
    }).join('');
  } else {
    inner = pieces.map(function(pc, i){ if(!pc) return ''; return '<div class="ca-pc p'+i+'"><div class="ca-art">'+ca_pieceArt(pc)+'</div></div>'; }).join('');
    if(lay==='tb') inner += '<div class="ca-tbchips">'+pieces.filter(Boolean).map(function(pc){ return '<span class="ca-chip"><i style="background:'+COL(pc.color).hex+'"></i>'+esc(COL(pc.color).name+' '+ca_noun(pc.p).toLowerCase())+'</span>'; }).join('')+'</div>';
  }
  return '<div class="'+cls+'" role="img" aria-label="'+esc('Picture shows '+alt)+'" style="background:'+CA_HOUSE_BG+'">'+inner+(opts.inner||'')+'</div>';
}
function ca_piecesOf(items){ return (items||[]).map(function(it){ var p = P(it.product); return p ? {p:p, color:it.color} : null; }).filter(Boolean); }

/* ---------- PR 574 · THE ONE BAG ADAPTER ----------
   A combo goes in the bag as ONE set line. The shape follows bagAdd() in
   02-core.js (kind 'set', items at their real colour/size, one set price);
   the bag stores real piece prices + one set discount itself (bagTotals /
   placeOrder), so nothing is split per piece here. */
function ca_bagLine(L, sizes){
  return {kind:'set', source:'auto', refId:L.id, rule:L.ruleId, name:L.name,
    items:L.pieces.map(function(pc, i){ return {product:pc.p.id, color:pc.color, size:sizes[i]}; }),
    price:L.price, regular:L.regular};
}
function ca_bagAdd(L, sizes, opts){ return bagAdd(ca_bagLine(L, sizes), opts||{}); }
/* bag price and bag thumbnail hooks now live in 02-core.js bagSetPrice and 50-bag.js (R15) */

/* ---------- analytics ---------- */
function ca_track(ev, f){
  try{ if(window.EXTRACK && EXTRACK.log){ f = f||{}; f.source = 'auto-combo'; if(!f.src) f.src = 'auto-combo'; EXTRACK.log(ev, f); } }catch(e){}
}
function ca_trackSetup(){
  try{
    if(typeof TRACK_ADD_SOURCES!=='undefined' && TRACK_ADD_SOURCES && !TRACK_ADD_SOURCES['ca-add']){
      TRACK_ADD_SOURCES['ca-add'] = {src:'auto-combo', bar:'auto-combo', offer:'auto_combo'};
      TRACK_ADD_SOURCES['ca-order'] = {src:'auto-combo', offer:'auto_combo', direct:true};
    }
  }catch(e){}
}
function ca_bagWrapped(){ try{ return typeof TRACK_HOOKS!=='undefined' && TRACK_HOOKS && !!TRACK_HOOKS.bagAdd; }catch(e){ return false; } }
window.addEventListener('hashchange', function(){ CA.viewed = {}; ca_zoomClose(); });

/* ---------- small shared bits ---------- */
function ca_qs(q){ var a = []; for(var k in q) if(q[k]!=null && q[k]!=='') a.push(encodeURIComponent(k)+'='+encodeURIComponent(q[k])); return a.length ? '?'+a.join('&') : ''; }
function ca_pairHref(L, extra){ return '#/combo-pair/'+L.id+ca_qs(extra||{}); }
function ca_dots(cols, cls){ return '<span class="ca-dots'+(cls?' '+cls:'')+'" aria-hidden="true">'+cols.map(function(c){ return '<i style="background:'+COL(c).hex+'"></i>'; }).join('')+'</span>'; }
function ca_listTpl(rule, q){ var t = (q && q.tpl) || (rule && rule.listTpl) || ca_setting('listTpl') || 'L1'; return /^L[1-5]$/.test(t) ? t : 'L1'; }
function ca_pageTpl(L, q){
  var t = (q && q.tpl) || L.rule.pageTpl || ca_setting('pageTpl') || 'auto';
  if(t==='auto'){ /* R15 ranking: P3 for top+bottom / mixed sets, P1 for same-product packs (P2 for very long same-product lists) */
    var mixed = (L.pieces||[]).some(function(pc){ return pc.p && L.pieces[0].p && pc.p.id!==L.pieces[0].p.id; });
    t = mixed ? 'P3' : (ca_generate(L.rule).visible.length > 28 ? 'P2' : 'P1');
  }
  return /^P[1-5]$/.test(t) ? t : 'P1';
}
function ca_crumbs(items){
  return '<nav class="ca-crumbs xs" aria-label="Breadcrumb"><a href="#/">Home</a>'+items.map(function(it){ return '<span aria-hidden="true">›</span>'+(it[1] ? '<a href="'+it[1]+'">'+esc(it[0])+'</a>' : '<span>'+esc(it[0])+'</span>'); }).join('')+'</nav>';
}
function ca_tplBar(kind, cur, base){
  var list = kind==='list' ? ['L1','L2','L3','L4','L5'] : ['P1','P2','P3','P4','P5'];
  var names = {L1:'Pair grid', L2:'Style cards', L3:'Hub', L4:'Big list', L5:'2 or 3 first', P1:'Pair page', P2:'Pick colours', P3:'Top + bottom', P4:'Mixed set', P5:'Fixed pack'};
  var key = kind==='list' ? 'listTpl' : 'pageTpl';
  return '<div class="ca-tplbar" data-testid="ca-tplbar"><div class="xs muted">Demo · '+(kind==='list' ? 'page' : 'product page')+' template</div><div class="ca-tplrow">'+
    list.map(function(t){ return '<a class="chip'+(t===cur?' on':'')+'" href="'+base+'?tpl='+t+'" aria-current="'+(t===cur)+'">'+t+' · '+names[t]+'</a>'; }).join('')+
    '<button type="button" class="link xs" data-act="ca-tpldefault" data-k="'+key+'" data-v="'+cur+'">Make '+cur+' the default</button></div></div>';
}
ACT['ca-tpldefault'] = function(el){ ST.comboAuto = ST.comboAuto || {}; ST.comboAuto[el.getAttribute('data-k')] = el.getAttribute('data-v'); saveState(); toast(el.getAttribute('data-v')+' is now the default'); };

/* ---------- list cards ---------- */
function ca_badges(L, opts){
  opts = opts||{};
  return (L.save>0 ? '<span class="ca-bdg save">Save '+fmt(L.save)+'</span>' : '')+'<span class="ca-bdg pcs">'+L.n+' pcs</span>'+(L.isNew ? '<span class="ca-bdg new">New colour</span>' : '');
}
function ca_card(L, opts){
  opts = opts||{}; var ms = opts.size;
  var sz = ms ? (L.avail[ms] && L.avail[ms].ok ? '<span class="ca-ok">'+ico('check',12)+' '+esc(ms)+' in stock</span>' : esc(ms)+' sold out') : esc(ca_sizeLine(L));
  var price = opts.each ? '<b class="price">'+fmt(L.each)+'</b> <span class="xs muted">each · '+fmt(L.price)+'</span>' : '<b class="price">'+fmt(L.price)+'</b>'+(L.save>0 ? ' <span class="strike xs">'+fmt(L.regular)+'</span>' : '');
  return '<a class="ca-card" href="'+ca_pairHref(L, opts.q)+'" data-testid="ca-card" data-id="'+esc(L.id)+'">'+
    ca_setPhoto(L.pieces, {layout:'card', inner:ca_badges(L)})+
    '<div class="ca-cinfo"><div class="ca-ctitle">'+esc(L.title)+'</div><div class="ca-csub">'+esc(L.sub)+'</div>'+
    '<div class="ca-cprice">'+price+'</div>'+
    '<div class="ca-csz">'+ca_dots(L.colours)+'<span>'+sz+'</span></div></div></a>';
}
function ca_builderCard(rule, L){
  return '<a class="ca-card ca-build" href="'+ca_pairHref(L, {tpl:'P2'})+'" data-testid="ca-builder">'+
    '<div class="ca-ph ca-ph-card n2 ca-ph-empty" style="background:'+CA_HOUSE_BG+'"><span class="ca-plus">'+ico('plus',28)+'</span></div>'+
    '<div class="ca-cinfo"><div class="ca-ctitle">Pick your own '+rule.pieces+' colours</div><div class="ca-csub">Any colours</div><div class="ca-cprice"><b class="price">'+fmt(L.price)+'</b> <span class="xs muted">for '+rule.pieces+'</span></div><div class="ca-csz"><span class="brandc bold">Start '+ico('right',12)+'</span></div></div></a>';
}

/* ---------- list page state + filters ---------- */
function ca_listState(rule){ return ui('ca-list:'+rule.id, {has:[], size:null, sort:'best', all:false, l4:{}, tier:rule.pieces}); }
function ca_filtered(rule, u, q){
  var g = ca_generate(rule), list = g.visible.slice();
  if(q && q.style) list = list.filter(function(L){ return L.styleKey===q.style; });
  if(u.has.length) list = list.filter(function(L){ return u.has.every(function(c){ return L.colours.indexOf(c)>=0; }); });
  if(u.size) list = list.filter(function(L){ return L.avail[u.size] && L.avail[u.size].ok; });
  if(u.sort && u.sort!=='best') ca_sort(list, u.sort);
  return list;
}
function ca_offerStrip(rule, g){
  var L = g.visible[0] || g.all[0]; if(!L) return '';
  var prices = g.all.map(function(x){ return x.price; }), one = Math.min.apply(null, prices)===Math.max.apply(null, prices);
  var regs = g.all.map(function(x){ return x.regular; });
  var line1 = esc(rule.title)+' combos · '+(one ? 'any '+rule.pieces+' for '+fmt(L.price) : rule.pieces+' pcs from '+fmt(Math.min.apply(null, prices)));
  /* AUTO ADJUST: one line — "Pay on delivery", then "Free delivery" step aside when it would wrap (ca_fit) */
  var line2 = '<span class="ca-tseg">'+rule.pieces+' pcs regular '+fmt(one ? L.regular : Math.min.apply(null, regs))+(L.save>0 ? ' · Save '+fmt(L.save) : '')+'</span>'+
    (ca_freeDelivery(L.price) ? '<span class="ca-tseg" data-drop="1">&nbsp;· Free delivery</span>' : '')+'<span class="ca-tseg" data-drop="2">&nbsp;· Pay on delivery</span>';
  return '<div class="ca-strip" data-testid="ca-strip"><div class="ca-strip1">'+line1+'</div><div class="ca-strip2 ca-fit">'+line2+'</div></div>';
}
function ca_tierSeg(rule, q, inPage){
  var tr = ca_tierRules(rule); if(!tr) return '';
  var g2 = ca_generate(tr.two), g3 = ca_generate(tr.three), a = g2.all[0], b = g3.all[0]; if(!a || !b) return '';
  var cur = inPage ? (inPage.tier===3 ? tr.three.id : tr.two.id) : rule.id;
  var btn = function(r, L){
    var on = cur===r.id, lbl = L.n+' pcs · '+fmt(L.price)+(L.n===3 ? '<span class="ca-best">best value</span>' : '');
    var sub = '<span class="ca-segsub">'+fmt(L.each)+' each</span>';
    if(inPage) return '<button type="button" class="ca-segb'+(on?' on':'')+'" data-act="ca-tier" data-rule="'+esc(inPage.rule)+'" data-t="'+L.n+'" aria-pressed="'+on+'">'+lbl+sub+'</button>';
    return '<a class="ca-segb'+(on?' on':'')+'" href="#/combos/'+r.id+ca_qs({tpl:q && q.tpl})+'" aria-current="'+on+'">'+lbl+sub+'</a>';
  };
  return '<div class="ca-seg'+(inPage ? ' big' : '')+'" role="group" aria-label="Pieces in the combo">'+btn(tr.two, a)+btn(tr.three, b)+'</div>';
}
function ca_filterBar(rule, u, g){
  var cols = []; g.visible.forEach(function(L){ L.colours.forEach(function(c){ if(cols.indexOf(c)<0) cols.push(c); }); });
  var colOrder = []; g.products.forEach(function(p){ p.colors.forEach(function(c){ if(cols.indexOf(c)>=0 && colOrder.indexOf(c)<0) colOrder.push(c); }); });
  var chips = colOrder.map(function(c){ var on = u.has.indexOf(c)>=0; return '<button type="button" class="chip ca-colchip'+(on?' on':'')+'" data-act="ca-has" data-rule="'+rule.id+'" data-c="'+c+'" aria-pressed="'+on+'"><i style="background:'+COL(c).hex+'"></i>'+esc(COL(c).name)+'</button>'; }).join('');
  var ms = mySizeFor(g.products[0]||{}) ;
  var sizeChip = u.size ? '<button type="button" class="chip on" data-act="ca-size-clear" data-rule="'+rule.id+'" aria-label="Clear size '+esc(u.size)+'">Size '+esc(u.size)+' '+ico('close',13)+'</button>'
    : '<button type="button" class="chip" data-act="ca-size-pick" data-rule="'+rule.id+'">'+(ms ? 'My size '+esc(ms) : 'My size')+' '+ico('down',13)+'</button>';
  var prices = g.all.map(function(x){ return x.price; }), varied = Math.min.apply(null, prices)!==Math.max.apply(null, prices);
  var sorts = [['best','Best selling'],['sizes','Most sizes in stock'],['new','New colours first']].concat(varied ? [['price','Price: low to high']] : []);
  return '<div class="ca-filters"><div class="ca-hasrow" role="group" aria-label="Has colour"><span class="ca-haslbl">Has:</span>'+chips+'</div>'+
    '<div class="ca-tools">'+sizeChip+(u.has.length ? '<button type="button" class="link xs" data-act="ca-has-clear" data-rule="'+rule.id+'">Clear colours</button>' : '')+
    '<label class="ca-sort"><span class="sr">Sort</span><select data-change="ca-sort" data-rule="'+rule.id+'" aria-label="Sort">'+sorts.map(function(s){ return '<option value="'+s[0]+'"'+(u.sort===s[0]?' selected':'')+'>'+s[1]+'</option>'; }).join('')+'</select></label></div></div>';
}
function ca_grid(rule, u, list, q, opts){
  opts = opts||{};
  if(!list.length) return '<div class="ca-empty" data-testid="ca-empty"><div class="h3">No combo has all of these</div><p class="small muted mt8">Try fewer colours or another size.</p><button type="button" class="btn btn-secondary btn-sm mt12" data-act="ca-has-clear" data-rule="'+rule.id+'" data-all="1">Clear filters</button></div>';
  var g = ca_generate(rule), total = list.length, big = total > 15;
  var shown = (big && !u.all) ? list.slice(0, 8) : list;
  var cards = shown.map(function(L){ return ca_card(L, {size:u.size, each:opts.each}); });
  if(!u.has.length && !u.size && rule.pairing!=='any'){ var b = ca_builderCard(rule, list[0]); if(big) cards.unshift(b); else cards.push(b); }
  return '<div class="ca-grid" data-testid="ca-grid" data-count="'+total+'">'+cards.join('')+'</div>'+
    (big && !u.all ? '<div class="center mt16"><button type="button" class="btn btn-secondary" data-act="ca-all" data-rule="'+rule.id+'" data-testid="ca-seeall">See all '+total+' combos</button></div>' : '');
}
function ca_countLine(rule, list){ return '<div class="ca-count xs muted" data-testid="ca-count">'+plural(list.length, 'combo')+' · '+(rule.order==='colour' ? 'in colour order' : 'best sellers first')+'</div>'; }
function ca_singles(rule, g){
  if(rule.noSingle!==false) return '';
  return '<section class="mt32"><div class="h3">Also sold one at a time</div><div class="row wrap mt8">'+g.products.map(function(p){ return '<a class="chip" href="#/p/'+p.id+'">'+esc(p.name)+' · '+fmt(p.price)+'</a>'; }).join('')+'</div></section>';
}

/* ---------- category templates (PR 572) ---------- */
function ca_L1(rule, u, q){
  var g = ca_generate(rule), list = ca_filtered(rule, u, q);
  return ca_offerStrip(rule, g)+ca_tierSeg(rule, q)+ca_filterBar(rule, u, g)+ca_countLine(rule, list)+ca_grid(rule, u, list, q)+ca_singles(rule, g);
}
function ca_styleGroups(rule){
  var g = ca_generate(rule), groups = {}, order = [];
  g.visible.forEach(function(L){ if(!groups[L.styleKey]){ groups[L.styleKey] = []; order.push(L.styleKey); } groups[L.styleKey].push(L); });
  return order.map(function(k){ return {rule:rule, key:k, list:groups[k]}; });
}
function ca_styleCard(sg, q){
  var L = sg.list[0], rule = sg.rule, cols = [];
  sg.list.forEach(function(x){ x.colours.forEach(function(c){ if(cols.indexOf(c)<0) cols.push(c); }); });
  var href = '#/combos/'+rule.id+ca_qs({tpl:'L1', style: sg.key!=='mix' && ca_generate(rule).products.length>1 ? sg.key : ''});
  /* AUTO ADJUST: the grey sub-line is one short line ("15 pairs · pick any") */
  var word = rule.pieces===3 ? 'sets' : 'pairs';
  return '<a class="ca-card ca-style" href="'+href+'" data-testid="ca-style">'+ca_setPhoto(L.pieces, {layout:'card', inner:ca_badges(L)})+
    '<div class="ca-cinfo"><div class="ca-ctitle">'+esc(L.styleName)+' combo</div><div class="ca-csub">'+sg.list.length+' '+word+' · pick any</div>'+
    /* one line: the saving is already the photo badge (it wrapped "Save ৳ / 400" in a 174px card) */
    '<div class="ca-cprice"><b class="price">'+fmt(L.price)+'</b> <span class="xs muted">for '+L.n+'</span></div>'+
    '<div class="ca-csz">'+ca_dots(cols.slice(0,6), 'many')+(cols.length>6 ? '<span class="xs muted">+'+(cols.length-6)+'</span>' : '')+'</div></div></a>';
}
function ca_L2(rule, u, q){
  var mine = ca_styleGroups(rule), others = [];
  ca_activeRules().forEach(function(r){ if(r.id!==rule.id) ca_styleGroups(r).forEach(function(sg){ others.push(sg); }); });
  return ca_offerStrip(rule, ca_generate(rule))+
    '<div class="ca-grid mt16" data-testid="ca-grid-l2">'+mine.map(function(sg){ return ca_styleCard(sg, q); }).join('')+'</div>'+
    (others.length ? '<div class="h2 mt32">More combo styles</div><div class="ca-grid mt12">'+others.map(function(sg){ return ca_styleCard(sg, q); }).join('')+'</div>' : '');
}
function ca_season(){ var m = new Date().getMonth()+1; return (m>=11 || m<=2) ? 'winter' : 'summer'; }
function ca_L3(rule, u, q){
  var hu = ui('ca-hub', {season:null});
  var season = hu.season || (rule && rule.season) || ca_season();
  var rules = ca_activeRules().filter(function(r){ return (r.season||'summer')===season; });
  if(rule){ rules.sort(function(a, b){ return (b.id===rule.id) - (a.id===rule.id); }); }
  var rail = function(title, cards, testid){
    if(!cards.length) return '';
    return '<section class="ca-rail" data-testid="'+testid+'"><div class="row between"><div class="h2">'+esc(title)+'</div></div><div class="ca-railtrk">'+cards.slice(0,8).join('')+'</div></section>';
  };
  var two = [], three = [], tb = [];
  rules.forEach(function(r){ ca_styleGroups(r).forEach(function(sg){ var c = ca_styleCard(sg, q); if(r.pairing==='across') tb.push(c); else if(r.pieces===3) three.push(c); else two.push(c); }); });
  /* ready-made sets of two different items (tracksuits, hoodie + jogger) live in 40-combo.js */
  (typeof combos==='function' ? combos() : []).forEach(function(c){
    if(!c || !c.active || !c.items || c.items[0]===c.items[1]) return;
    var ps = c.items.map(P); if(ps.some(function(p){ return !p; })) return;
    var win = ps.some(function(p){ return /winter/i.test(p.collection||''); }) || ps.some(function(p){ var g = ca_garment(p); return /hoodie|puffer|tracktop|jogger|sweater|trackpant/.test(g); });
    if((win ? 'winter' : 'summer')!==season) return;
    var reg = ps.reduce(function(s, p){ return s+p.price; }, 0);
    var pcs = ps.map(function(p){ return {p:p, color:p.colors[0]}; });
    tb.push('<a class="ca-card ca-style" href="#/combo/'+c.id+'">'+ca_setPhoto(pcs, {layout:'card', inner:(reg>c.price ? '<span class="ca-bdg save">Save '+fmt(reg-c.price)+'</span>' : '')+'<span class="ca-bdg pcs">'+ps.length+' pcs</span>'})+
      '<div class="ca-cinfo"><div class="ca-ctitle">'+esc(c.name)+'</div><div class="ca-csub">'+esc(ps.map(ca_noun).join(' + '))+'</div><div class="ca-cprice"><b class="price">'+fmt(c.price)+'</b>'+(reg>c.price ? ' <span class="strike xs">'+fmt(reg)+'</span>' : '')+'</div></div></a>');
  });
  var build = '<a class="ca-card ca-build" href="#/set"><div class="ca-ph ca-ph-card n2 ca-ph-empty" style="background:'+CA_HOUSE_BG+'"><span class="ca-plus">'+ico('plus',28)+'</span></div><div class="ca-cinfo"><div class="ca-ctitle">Build your own set</div><div class="ca-csub">Any 2 or 3 pieces</div></div></a>';
  return '<div class="ca-hubtabs" role="tablist">'+['winter','summer'].map(function(s){ var on = s===season; return '<button type="button" role="tab" class="ca-hubtab'+(on?' on':'')+'" data-act="ca-season" data-s="'+s+'" aria-selected="'+on+'">'+(s==='winter' ? 'Winter' : 'Summer')+'</button>'; }).join('')+'</div>'+
    rail('2-piece packs', two, 'ca-rail-2')+rail('3-piece packs', three, 'ca-rail-3')+rail('Top + bottom sets', tb, 'ca-rail-tb')+
    rail('Build your own', [build], 'ca-rail-build')+
    (!two.length && !three.length && !tb.length ? '<div class="ca-empty">No '+season+' combos are switched on.</div>' : '');
}
function ca_l4card(L, u){
  var st = u.l4[L.id] || (u.l4[L.id] = {size:null, err:null});
  var pills = L.sizes.map(function(s){ var a = L.avail[s], on = st.size===s;
    return '<button type="button" class="size-pill'+(on?' on':'')+(a.ok?'':' out')+'" data-act="'+(a.ok?'ca-l4size':'ca-sizeout')+'" data-id="'+esc(L.id)+'" data-s="'+esc(s)+'" aria-pressed="'+on+'"'+(a.ok?'':' aria-label="'+esc(s+': '+a.reason+' — see options')+'"')+'>'+esc(s)+'</button>'; }).join('');
  var outs = L.sizes.filter(function(s){ return !L.avail[s].ok; }).map(function(s){ return s+': '+L.avail[s].reason; }).join(' · ');
  var verb = L.n===3 ? 'Add all 3 to bag' : 'Add both to bag';
  return '<article class="ca-l4" data-testid="ca-l4" id="ca4-'+esc(L.id)+'">'+
    '<a class="ca-l4ph" href="'+ca_pairHref(L)+'" aria-label="'+esc(L.title)+' — see this combo">'+ca_setPhoto(L.pieces, {layout:'hero', inner:ca_badges(L)})+'</a>'+
    '<div class="ca-l4b"><div class="ca-l4t">'+esc(L.title)+'</div><div class="xs muted">'+esc(L.sub)+'</div>'+
    '<div class="ca-pline mt8">'+L.n+' pcs <span class="strike">'+fmt(L.regular)+'</span> → <b class="price">'+fmt(L.price)+'</b>'+(L.save>0 ? ' · <b class="ca-savetxt">Save '+fmt(L.save)+'</b>' : '')+'</div>'+
    '<div class="ca-lbl mt12">Size for '+(L.n===3 ? 'all 3' : 'both')+'</div><div class="ca-sizes n'+L.sizes.length+'">'+pills+'</div>'+
    (outs ? '<div class="ca-why">'+esc(outs)+'</div>' : '')+
    (st.err ? '<div class="ca-err" role="alert">'+ico('info',14)+esc(st.err)+'</div>' : '')+
    '<button type="button" class="btn btn-primary btn-block mt12" data-act="ca-add" data-id="'+esc(L.id)+'" data-ctx="l4">'+(st.size ? verb+' · '+fmt(L.price) : 'Choose a size')+'</button></div></article>';
}
function ca_L4(rule, u, q){
  var g = ca_generate(rule), list = ca_filtered(rule, u, q), lim = u.all ? list.length : 6;
  return ca_offerStrip(rule, g)+ca_filterBar(rule, u, g)+ca_countLine(rule, list)+
    (list.length ? '<div class="ca-l4list" data-testid="ca-grid" data-count="'+list.length+'">'+list.slice(0, lim).map(function(L){ return ca_l4card(L, u); }).join('')+'</div>' : ca_grid(rule, u, list, q))+
    (list.length > lim ? '<div class="center mt16"><button type="button" class="btn btn-secondary" data-act="ca-all" data-rule="'+rule.id+'" data-testid="ca-seeall">Show '+(list.length-lim)+' more combos</button></div>' : '');
}
function ca_L5(rule, u, q){
  var tr = ca_tierRules(rule);
  if(!tr) return '<div class="ca-note xs muted">This combo comes in one size of pack only, so the 2 / 3 switch is hidden.</div>'+ca_L1(rule, u, q);
  var cur = u.tier===3 ? tr.three : tr.two, cu = ca_listState(cur);
  var g = ca_generate(cur), list = ca_filtered(cur, cu, q);
  return '<div class="ca-l5top">'+ca_tierSeg(rule, q, {tier:cur.pieces, rule:rule.id})+'</div>'+ca_offerStrip(cur, g)+ca_filterBar(cur, cu, g)+ca_countLine(cur, list)+ca_grid(cur, cu, list, q, {each:true});
}

/* ---------- category page ---------- */
function ca_listPage(rule, q){
  var tpl = ca_listTpl(rule, q), u = ca_listState(rule);
  var g = ca_generate(rule);
  if(!g.all.length) return '<div class="container ca-page"><div class="ca-empty"><div class="h2">No combos yet</div><p class="muted mt8">This combo has no products with colours right now.</p><a class="btn btn-primary mt16" href="#/combos">See all combos</a></div></div>';
  var body = tpl==='L1' ? ca_L1(rule, u, q) : tpl==='L2' ? ca_L2(rule, u, q) : tpl==='L3' ? ca_L3(rule, u, q) : tpl==='L4' ? ca_L4(rule, u, q) : ca_L5(rule, u, q);
  var p0 = g.products[0], cat = p0 && CAT(p0.cat);
  return '<div class="container ca-page ca-list ca-'+tpl+'" data-testid="ca-list" data-tpl="'+tpl+'" data-rule="'+rule.id+'">'+
    ca_crumbs([['Combos','#/combos'],[rule.title, null]])+
    '<header class="ca-head"><div class="eyebrow">'+esc((cat ? cat.name+' · ' : '')+rule.label)+'</div><h1 class="h1">'+esc(rule.title)+' combos</h1></header>'+
    body+ca_tplBar('list', tpl, '#/combos/'+rule.id)+'</div>';
}

/* ---------- list actions ---------- */
function ca_ruleState(el){ var r = ca_rule(el.getAttribute('data-rule')); return r ? ca_listState(r) : null; }
ACT['ca-has'] = function(el){ var u = ca_ruleState(el); if(!u) return; var c = el.getAttribute('data-c'), i = u.has.indexOf(c); if(i>=0) u.has.splice(i,1); else u.has.push(c); u.all = false; rerender(); };
ACT['ca-has-clear'] = function(el){ var u = ca_ruleState(el); if(!u) return; u.has = []; if(el.getAttribute('data-all')) u.size = null; rerender(); };
ACT['ca-size-clear'] = function(el){ var u = ca_ruleState(el); if(!u) return; u.size = null; rerender(); };
ACT['ca-all'] = function(el){ var u = ca_ruleState(el); if(!u) return; u.all = true; rerender(); };
ACT['ca-season'] = function(el){ ui('ca-hub', {}).season = el.getAttribute('data-s'); rerender(); };
ACT['ca-tier'] = function(el){ var r = ca_rule(el.getAttribute('data-rule')); if(!r) return; ca_listState(r).tier = +el.getAttribute('data-t'); rerender(); };
CHANGE['ca-sort'] = function(el){ var u = ca_ruleState(el); if(!u) return; u.sort = el.value; rerender(); };
ACT['ca-size-pick'] = function(el){
  var r = ca_rule(el.getAttribute('data-rule')); if(!r) return; var g = ca_generate(r), u = ca_listState(r);
  var sizes = (g.all[0] && g.all[0].sizes) || [], ms = mySizeFor(g.products[0]||{});
  openModal('<p class="small text2">Show only combos you can get in this size — for every piece.</p><div class="ca-sizes n'+sizes.length+' mt12">'+sizes.map(function(s){ var n = g.visible.filter(function(L){ return L.avail[s].ok; }).length;
      return '<button type="button" class="size-pill'+(s===ms?' on':'')+'" data-act="ca-size-set" data-rule="'+r.id+'" data-s="'+esc(s)+'"'+(n?'':' disabled')+'>'+esc(s)+'</button>'; }).join('')+'</div>'+
    (ms ? '<div class="xs muted mt12">Your saved size: '+esc(ms)+'</div>' : '<button type="button" class="link mt12" data-act="size-guide">Not sure? Find my size</button>'), {title:'My size'});
};
ACT['ca-size-set'] = function(el){ var u = ca_ruleState(el); if(!u) return; u.size = el.getAttribute('data-s'); closeModal(); rerender(); };
ACT['ca-l4size'] = function(el){ var L = ca_listing(el.getAttribute('data-id')); if(!L) return; var u = ca_listState(L.rule); var st = u.l4[L.id] || (u.l4[L.id] = {}); st.size = el.getAttribute('data-s'); st.err = null; rerender(); };

/* =====================================================================
   PAIR PRODUCT PAGE (PR 573) — P1 pair page · P2 pick colours · P5 pack
   ===================================================================== */
function ca_pageState(L, q){
  var u = ui('ca:'+L.id, {mode:'both', size:null, sizes:[], up:false, upColor:null, err:null, chart:false, seeded:false});
  if(!u.seeded){
    u.seeded = true;
    var qs = q && q.sizes ? String(q.sizes).split(',') : null;
    if(qs && qs.length){
      var allSame = qs.every(function(s){ return s===qs[0]; });
      if(allSame && L.avail[qs[0]] && L.avail[qs[0]].ok) u.size = qs[0]; else { u.mode = 'each'; u.sizes = L.pieces.map(function(pc, i){ return qs[i]||null; }); }
    } else {
      var ms = mySizeFor(L.pieces[0].p);
      if(ms && L.avail[ms] && L.avail[ms].ok){ u.size = ms; u.fromSaved = true; }
    }
  }
  return u;
}
/* what the main button will add right now */
function ca_target(L, u){
  if(u.up && u.upColor){ var r3 = ca_upsellRule(L.rule); var T = r3 && ca_findBy(r3, L.pieces.concat([{p:L.pieces[0].p, color:u.upColor}])); if(T) return T; }
  return L;
}
function ca_sizesFor(T, L, u){
  if(u.mode==='each'){ return T.pieces.map(function(pc, i){ var j = -1; L.pieces.forEach(function(x, k){ if(x.color===pc.color && x.p.id===pc.p.id) j = k; }); return j>=0 ? (u.sizes[j]||null) : (u.sizes[0]||null); }); }
  return T.pieces.map(function(){ return u.size; });
}
function ca_missing(T, L, u){
  if(u.up && !u.upColor) return {what:'colour', label:'Pick a 3rd colour', at:'ca-upsell'};
  var sz = ca_sizesFor(T, L, u);
  if(sz.some(function(s){ return !s; })) return {what:'size', label:u.mode==='each' ? 'Choose a size for each' : 'Choose a size', at:'ca-sizes'};
  for(var i=0;i<T.pieces.length;i++){ if(stockOf(T.pieces[i].p.id, T.pieces[i].color, sz[i]) < 1) return {what:'stock', label:'Choose a size', at:'ca-sizes', msg:COL(T.pieces[i].color).name+' '+sz[i]+' is sold out — choose another size.'}; }
  return null;
}
function ca_cta(T, L, u){
  var miss = ca_missing(T, L, u);
  var verb = T.n===3 ? 'Add all 3 to bag' : 'Add both to bag';
  return miss ? miss.label : verb+' · '+fmt(T.price);
}
function ca_priceLine(T){
  return '<div class="ca-pline" data-testid="ca-price">'+T.n+' pcs <span class="strike">'+fmt(T.regular)+'</span> → <b class="price">'+fmt(T.price)+'</b>'+(T.save>0 ? ' · <b class="ca-savetxt">Save '+fmt(T.save)+'</b>' : '')+'</div>';
}
function ca_sizeRow(L, u, T){
  var pieceRow = function(pc, i){
    return '<div class="ca-eachrow"><div class="ca-lbl"><i class="ca-dot" style="background:'+COL(pc.color).hex+'"></i>'+esc(COL(pc.color).name)+(L.same ? '' : ' '+esc(ca_short(pc.p).toLowerCase()))+'</div><div class="ca-sizes n'+pc.p.sizes.length+'">'+
      L.sizes.map(function(s){ var ok = stockOf(pc.p.id, pc.color, s) > 0, on = u.sizes[i]===s;
        return '<button type="button" class="size-pill'+(on?' on':'')+(ok?'':' out')+'" data-act="'+(ok?'ca-psize':'ca-noop')+'" data-id="'+esc(L.id)+'" data-i="'+i+'" data-s="'+esc(s)+'" aria-pressed="'+on+'"'+(ok?'':' aria-disabled="true" title="'+esc(COL(pc.color).name+' '+s+' sold out')+'"')+'>'+esc(s)+'</button>'; }).join('')+'</div></div>';
  };
  var err = u.err ? '<div class="ca-err" role="alert" data-testid="ca-err">'+ico('info',14)+'<span>'+esc(u.err)+'</span></div>' : '';
  if(u.mode==='each'){
    var rows = L.pieces.map(pieceRow).join('');
    if(T!==L){ var extra = T.pieces.filter(function(pc){ return !L.pieces.some(function(x){ return x.color===pc.color; }); })[0]; if(extra) rows += '<div class="xs muted">'+esc(COL(extra.color).name)+' comes in the '+esc(COL(L.pieces[0].color).name)+' size.</div>'; }
    return '<div id="ca-sizes" class="ca-sizebox'+(u.err?' err':'')+'"><div class="ca-lbl">Size for each piece</div>'+rows+err+'<button type="button" class="link xs" data-act="ca-mode" data-id="'+esc(L.id)+'" data-m="both">Same size for '+(T.n===3?'all 3':'both')+'</button></div>';
  }
  var A = T; /* availability of what will be added (pair, or the triple once ticked) */
  var pills = A.sizes.map(function(s){ var a = A.avail[s], on = u.size===s;
    return '<button type="button" class="size-pill'+(on?' on':'')+(a.ok?'':' out')+'" data-act="'+(a.ok?'ca-size':'ca-sizeout')+'" data-id="'+esc(L.id)+'" data-s="'+esc(s)+'" data-each="1" aria-pressed="'+on+'"'+(a.ok?'':' aria-label="'+esc(s+': '+a.reason+' — see options')+'"')+'>'+esc(s)+'</button>'; }).join('');
  var outs = A.sizes.filter(function(s){ return !A.avail[s].ok; }).map(function(s){ return '<b>'+esc(s)+'</b>: '+esc(A.avail[s].reason); }).join(' · ');
  var low = u.size && A.avail[u.size] && A.avail[u.size].ok && A.avail[u.size].low <= 2 ? '<div class="ca-low">Only '+A.avail[u.size].low+' left in '+esc(u.size)+'</div>' : '';
  var saved = u.fromSaved && u.size ? '<span class="xs muted"> · Your size: '+esc(u.size)+'</span>' : '';
  return '<div id="ca-sizes" class="ca-sizebox'+(u.err?' err':'')+'"><div class="ca-lbl">Size for '+(T.n===3 ? 'all 3' : 'both')+saved+'</div><div class="ca-sizes n'+A.sizes.length+'" role="group" aria-label="Size">'+pills+'</div>'+
    (outs ? '<div class="ca-why" data-testid="ca-why">'+outs+'</div>' : '')+low+err+
    '<button type="button" class="link xs" data-act="ca-mode" data-id="'+esc(L.id)+'" data-m="each" data-testid="ca-each">Different size for each?</button></div>';
}
function ca_upsell(L, u){
  var r3 = ca_upsellRule(L.rule); if(!r3 || !L.same) return '';
  var p = L.pieces[0].p;
  var cands = ca_coloursOf(r3, p).filter(function(c){ return L.colours.indexOf(c)<0; }).map(function(c){ return {c:c, T:ca_findBy(r3, L.pieces.concat([{p:p, color:c}]))}; }).filter(function(x){ return x.T && x.T.availCount>0; });
  if(!cands.length) return '';
  var T0 = cands[0].T, add = T0.price - L.price;
  var head = 'Make it 3 pcs — add 1 more for '+fmt(add)+' → '+fmt(T0.price)+' total ('+fmt(T0.each)+' each, save '+fmt(T0.save)+')';
  var sw = u.up ? '<div class="ca-upcols" role="group" aria-label="3rd colour">'+cands.map(function(x){ var ok = !u.size || (x.T.avail[u.size] && x.T.avail[u.size].ok), on = u.upColor===x.c;
      return '<button type="button" class="ca-sw'+(on?' on':'')+(ok?'':' out')+'" data-act="'+(ok?'ca-upcol':'ca-noop')+'" data-id="'+esc(L.id)+'" data-c="'+x.c+'" aria-pressed="'+on+'"'+(ok?'':' aria-disabled="true"')+'><i style="background:'+COL(x.c).hex+'"></i><span>'+esc(COL(x.c).name)+'</span>'+(ok?'':'<em>'+esc(u.size)+' sold out</em>')+'</button>'; }).join('')+'</div>' : '';
  return '<div id="ca-upsell" class="ca-up'+(u.up?' on':'')+'" data-testid="ca-upsell"><button type="button" class="ca-uptick" data-act="ca-up" data-id="'+esc(L.id)+'" aria-pressed="'+!!u.up+'"><span class="ca-box">'+(u.up?ico('check',14):'')+'</span><span>'+esc(head)+'</span></button>'+sw+'</div>';
}
function ca_otherPairs(L, q){
  var g = ca_generate(L.rule), list = g.visible.filter(function(x){ return x.styleKey===L.styleKey; }).slice(0, 14);
  if(list.length < 2) return '';
  return '<section class="ca-sec"><div class="h3">Other '+(L.n===3 ? 'sets' : 'pairs')+' in '+esc(L.styleName)+'</div><div class="ca-strip3" data-testid="ca-others">'+list.map(function(x){
    var on = x.id===L.id;
    return '<a class="ca-mini'+(on?' on':'')+'" href="'+ca_pairHref(x, {tpl:q && q.tpl})+'"'+(on?' aria-current="page"':'')+'>'+ca_setPhoto(x.pieces, {layout:'thumb'})+'<span>'+esc(x.title)+'</span></a>'; }).join('')+'</div></section>';
}
function ca_gallery(T){
  var tiles = [], i = 1;
  T.pieces.forEach(function(pc){ ['front','back'].forEach(function(v){
    tiles.push('<button type="button" class="ca-gt" data-act="ca-zoom" data-id="'+esc(T.id)+'" data-i="'+(i++)+'" aria-label="'+esc(COL(pc.color).name+' '+v+' — bigger')+'"><div class="ca-ph ca-ph-one" style="background:'+CA_HOUSE_BG+'"><div class="ca-art">'+ca_pieceArt(pc, v)+'</div></div><span>'+esc(COL(pc.color).name)+' · '+v+'</span></button>');
  }); });
  return '<section class="ca-sec"><div class="h3">Each colour</div><div class="ca-gal">'+tiles.join('')+'</div></section>';
}
function ca_chart(L, u){
  var seen = {}, prods = []; L.pieces.forEach(function(pc){ if(!seen[pc.p.id]){ seen[pc.p.id] = 1; prods.push(pc.p); } });
  var body = u.chart ? prods.map(function(p){ var ch = chartFor(p); if(!ch) return '';
    return (prods.length>1 ? '<div class="xs bold mt12">'+esc(ca_short(p))+'</div>' : '')+'<div class="tbl-wrap mt8"><table class="tbl"><thead><tr><th>Size</th>'+ch.fields.map(function(f){ return '<th>'+esc(f)+'</th>'; }).join('')+'</tr></thead><tbody>'+
      Object.keys(ch.rows).map(function(s){ return '<tr'+(s===u.size?' class="sel"':'')+'><td>'+esc(s)+'</td>'+ch.rows[s].map(function(v){ return '<td>'+v+'"</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table></div>'; }).join('') : '';
  return '<section class="ca-sec"><button type="button" class="ca-acc" data-act="ca-chart" data-id="'+esc(L.id)+'" aria-expanded="'+!!u.chart+'">'+ico('ruler',18)+'<span class="grow">Size chart'+(prods.length===1 ? ' (one chart for all pieces)' : '')+'</span>'+ico(u.chart?'up':'down',16)+'</button>'+body+
    '<button type="button" class="link xs mt8" data-act="size-guide">Not sure? Find my size</button></section>';
}
/* AUTO ADJUST (wave 2): the trust line is ONE line. Segments carry a drop
   order; ca_fit() hides the highest one while the line would wrap. */
function ca_trust(T){
  return '<div class="ca-trust ca-fit" data-testid="ca-trust"><span class="ca-tseg">'+ico('cash',15)+'<span>Pay '+fmt(T.price)+' when it arrives</span></span>'+
    (ca_freeDelivery(T.price) ? '<span class="ca-tseg" data-drop="1"><span class="ca-sep">·</span>'+ico('truck',15)+'<span>Free delivery</span></span>' : '')+
    '<span class="ca-tseg" data-drop="2"><span class="ca-sep">·</span>'+ico('swap',15)+'<span>Size swap '+esc(SET('exchange','windowHours'))+' h</span></span></div>';
}
function ca_fit(root){
  [].forEach.call((root||document).querySelectorAll('.ca-fit'), function(el){
    [].forEach.call(el.querySelectorAll('[data-drop]'), function(x){ x.hidden = false; });
    var one = function(){ var k = el.children, t = null, bad = false; for(var i=0;i<k.length;i++){ if(k[i].hidden) continue; var r = k[i].getBoundingClientRect(); if(t===null) t = r.top; else if(Math.abs(r.top - t) > 4) bad = true; } return !bad && el.scrollWidth <= el.clientWidth + 1; };
    var drops = [].slice.call(el.querySelectorAll('[data-drop]')).sort(function(a, b){ return b.getAttribute('data-drop') - a.getAttribute('data-drop'); });
    for(var i=0; i<drops.length && !one(); i++) drops[i].hidden = true;
  });
}
window.addEventListener('resize', function(){ ca_fit(); });
function ca_mbar(T, L, u, ctx){
  return '<div class="mbar dm-hide ca-mbar" data-testid="ca-mbar"><div class="ca-mprice"><b class="price">'+fmt(T.price)+'</b>'+(T.save>0 ? '<span class="ca-savetxt">Save '+fmt(T.save)+'</span>' : '')+'</div>'+
    '<button type="button" class="btn btn-primary ca-mbtn" data-act="ca-add" data-id="'+esc(L.id)+'" data-ctx="'+(ctx||'page')+'" data-testid="ca-cta">'+esc(ca_cta(T, L, u))+'</button></div>';
}
function ca_ctaBlock(T, L, u, ctx){
  return '<div class="ca-ctas"><button type="button" class="btn btn-primary btn-block hide-m" data-act="ca-add" data-id="'+esc(L.id)+'" data-ctx="'+(ctx||'page')+'" data-testid="ca-cta-d">'+esc(ca_cta(T, L, u))+'</button>'+
    '<button type="button" class="btn btn-secondary btn-block" data-act="ca-add" data-id="'+esc(L.id)+'" data-ctx="'+(ctx||'page')+'" data-go="checkout" data-testid="ca-order">Order now — pay on delivery</button></div>';
}
function ca_soldOut(L, q){
  var g = ca_generate(L.rule), ms = mySizeFor(L.pieces[0].p);
  var alt = g.visible.filter(function(x){ return !ms || (x.avail[ms] && x.avail[ms].ok); }).slice(0, 6);
  return '<div class="ca-soldout" data-testid="ca-soldout"><div class="h2">This combo is sold out right now</div><p class="small text2 mt8">'+esc(L.title)+' will come back when we restock. These are in stock'+(ms ? ' in your size '+esc(ms) : '')+':</p></div>'+
    '<div class="ca-grid mt16">'+alt.map(function(x){ return ca_card(x, {size:ms}); }).join('')+'</div>';
}
function ca_heroBox(T, L){
  return '<button type="button" class="ca-hero" data-act="ca-zoom" data-id="'+esc(T.id)+'" data-i="0" aria-label="See the picture bigger">'+ca_setPhoto(T.pieces, {layout:'hero', inner:ca_badges(T)})+'<span class="ca-zoomhint">'+ico('search',14)+'</span></button>';
}
function ca_editNote(q){ return q && q.from ? '<div class="ca-editnote">'+ico('edit',14)+'<span>Changing a combo in your bag — the button replaces it.</span></div>' : ''; }

function ca_P1(L, q){
  var u = ca_pageState(L, q), T = ca_target(L, u);
  var info = '<div class="ca-info">'+ca_editNote(q)+
    '<div class="eyebrow">'+esc(T.styleName+' · '+T.rule.label)+'</div><h1 class="h1 ca-h1">'+esc(T.title)+'</h1>'+ca_priceLine(T)+
    ca_sizeRow(L, u, T)+ca_trust(T)+ca_ctaBlock(T, L, u)+ca_upsell(L, u)+'</div>';
  return '<div class="ca-pp"><div class="ca-left">'+ca_heroBox(T, L)+'</div>'+info+'</div>'+
    ca_otherPairs(L, q)+ca_gallery(T)+ca_chart(L, u)+
    '<section class="ca-sec">'+ruleBlock('exchange', {key:'ca', title:'Swap a size in your combo'})+'<div class="xs muted mt8">You pay only the delivery charge for a size swap.</div></section>'+
    '<section class="ca-sec">'+waButton('Ask about this combo', 'Hi EXTAS, about the combo '+T.styleName+' '+T.title+(u.size ? ' ('+T.pieces.map(function(){ return u.size; }).join('/')+')' : ''))+'</section>'+
    ca_mbar(T, L, u);
}

/* P2 — pick your colours (when there are many pairs) */
function ca_p2State(L){
  var u = ui('ca2:'+L.ruleId+':'+L.styleKey, {n:L.n, picks:null, size:null, err:null, note:null, chart:false});
  if(!u.picks){
    u.picks = L.pieces.map(function(pc){ return pc.p.id+'|'+pc.color; });
    var qs = CUR.query && CUR.query.sizes ? String(CUR.query.sizes).split(',') : null;
    if(qs && qs.every(function(x){ return x===qs[0]; }) && L.avail[qs[0]] && L.avail[qs[0]].ok) u.size = qs[0];
  }
  return u;
}
function ca_p2Groups(L, n){
  var rule = L.rule, g = ca_generate(rule);
  if(rule.pairing==='across') return L.pieces.map(function(pc){ return {p:pc.p, colours:ca_coloursOf(rule, pc.p), pick:1}; });
  var p = L.pieces[0].p; return [{p:p, colours:ca_coloursOf(rule, p), pick:n}];
}
function ca_p2Resolve(L, u){
  var tr = ca_tierRules(L.rule), rule = (tr && u.n===3) ? tr.three : (tr ? tr.two : L.rule);
  var pieces = u.picks.map(function(k){ var a = k.split('|'); return {p:P(a[0]), color:a[1]}; }).filter(function(pc){ return pc.p; });
  var need = rule.pieces;
  var T = pieces.length===need ? ca_findBy(rule, pieces) : null;
  return {rule:rule, pieces:pieces, need:need, T:T};
}
function ca_P2(L, q){
  var u = ca_p2State(L), tr = ca_tierRules(L.rule);
  if(!tr) u.n = L.n;
  var res = ca_p2Resolve(L, u), T = res.T, groups = ca_p2Groups(L, res.need);
  var slots = []; for(var i=0;i<res.need;i++) slots.push(res.pieces[i] || null);
  var hero = '<button type="button" class="ca-hero" data-act="ca-zoom" data-id="'+esc((T||L).id)+'" data-i="0" aria-label="See the picture bigger">'+ca_setPhoto(slots, {layout:'hero'})+'</button>';
  var tier = tr ? '<div class="ca-tiers" role="radiogroup" aria-label="How many pieces">'+[tr.two, tr.three].map(function(r){ var X = ca_generate(r).all[0]; if(!X) return ''; var on = res.rule.id===r.id;
      return '<button type="button" role="radio" class="ca-tierc'+(on?' on':'')+'" data-act="ca-p2tier" data-id="'+esc(L.id)+'" data-n="'+r.pieces+'" aria-checked="'+on+'"><span class="ca-radio"></span><span><b>'+r.pieces+' pcs '+fmt(X.price)+'</b><span class="xs">Save '+fmt(X.save)+'</span></span></button>'; }).join('')+'</div>' : '';
  var pickers = groups.map(function(gr, gi){
    var title = res.rule.pairing==='across' ? esc(ca_short(gr.p))+' colour' : 'Pick '+gr.pick+' colours';
    return '<div class="ca-pickg" id="ca-pick"><div class="ca-lbl">'+title+'</div><div class="ca-swgrid">'+gr.colours.map(function(c){
      var k = gr.p.id+'|'+c, ix = u.picks.indexOf(k), any = gr.p.sizes.some(function(s){ return stockOf(gr.p.id, c, s)>0; });
      if(res.rule.pairing==='across') ix = (u.picks[gi]===k) ? gi : -1;
      return '<button type="button" class="ca-swb'+(ix>=0?' on':'')+(any?'':' out')+'" data-act="'+(any?'ca-p2pick':'ca-noop')+'" data-id="'+esc(L.id)+'" data-k="'+k+'" data-g="'+gi+'" aria-pressed="'+(ix>=0)+'"><i style="background:'+COL(c).hex+'">'+(ix>=0 && res.rule.pairing!=='across' ? '<b>'+(ix+1)+'</b>' : '')+'</i><span>'+esc(COL(c).name)+'</span></button>'; }).join('')+'</div></div>';
  }).join('');
  var sizeBox = '';
  var A = T, sizes = (T ? T.sizes : L.sizes);
  sizeBox = '<div id="ca-sizes" class="ca-sizebox'+(u.err?' err':'')+'"><div class="ca-lbl">Size for '+(res.need===3?'all 3':'both')+'</div><div class="ca-sizes n'+sizes.length+'">'+sizes.map(function(s){
      var a = A ? A.avail[s] : {ok:res.pieces.every(function(pc){ return stockOf(pc.p.id, pc.color, s)>0; }), reason:''}, on = u.size===s;
      return '<button type="button" class="size-pill'+(on?' on':'')+(a.ok?'':' out')+'" data-act="'+(a.ok?'ca-p2size':(T?'ca-sizeout':'ca-noop'))+'" data-id="'+esc((T||L).id)+'" data-src="'+esc(L.id)+'" data-s="'+esc(s)+'" aria-pressed="'+on+'"'+(a.ok?'':' aria-label="'+esc(s+' sold out')+'"')+'>'+esc(s)+'</button>'; }).join('')+'</div>'+
    (A ? (function(){ var o = A.sizes.filter(function(s){ return !A.avail[s].ok; }).map(function(s){ return '<b>'+esc(s)+'</b>: '+esc(A.avail[s].reason); }).join(' · '); return o ? '<div class="ca-why">'+o+'</div>' : ''; })() : '')+
    (u.err ? '<div class="ca-err" role="alert" data-testid="ca-err">'+ico('info',14)+'<span>'+esc(u.err)+'</span></div>' : '')+'</div>';
  var left = res.need - res.pieces.length;
  var label = left>0 ? 'Pick '+left+' more colour'+(left>1?'s':'') : (!u.size || (T && !T.avail[u.size].ok) ? 'Choose a size' : (res.need===3 ? 'Add all 3 to bag' : 'Add both to bag')+' · '+fmt(T ? T.price : 0));
  var priceT = T || ca_generate(res.rule).all[0];
  var info = '<div class="ca-info">'+ca_editNote(q)+'<div class="eyebrow">'+esc(L.styleName+' · pick your colours')+'</div><h1 class="h1 ca-h1">'+esc(T ? T.title : 'Pick your colours')+'</h1>'+(priceT ? ca_priceLine(priceT) : '')+
    tier+(u.note ? '<div class="ca-low">'+esc(u.note)+'</div>' : '')+pickers+sizeBox+(priceT ? ca_trust(priceT) : '')+
    '<div class="ca-ctas"><button type="button" class="btn btn-primary btn-block hide-m" data-act="ca-p2add" data-id="'+esc(L.id)+'" data-testid="ca-cta-d">'+esc(label)+'</button>'+
    '<button type="button" class="btn btn-secondary btn-block" data-act="ca-p2add" data-id="'+esc(L.id)+'" data-go="checkout" data-testid="ca-order">Order now — pay on delivery</button></div></div>';
  return '<div class="ca-pp"><div class="ca-left">'+hero+'</div>'+info+'</div>'+(T ? ca_gallery(T) : '')+ca_chart(L, u)+
    '<div class="mbar dm-hide ca-mbar" data-testid="ca-mbar"><div class="ca-mprice"><b class="price">'+fmt(priceT ? priceT.price : 0)+'</b>'+(priceT && priceT.save>0 ? '<span class="ca-savetxt">Save '+fmt(priceT.save)+'</span>' : '')+'</div><button type="button" class="btn btn-primary ca-mbtn" data-act="ca-p2add" data-id="'+esc(L.id)+'" data-testid="ca-cta">'+esc(label)+'</button></div>';
}

/* P5 — fixed-colour pack (the owner pre-matches the colours) */
function ca_P5(L, q){
  var u = ca_pageState(L, q), g = ca_generate(L.rule);
  var packs = g.visible.filter(function(x){ return x.styleKey===L.styleKey && x.id!==L.id; }).slice(0, 4);
  if(L.availCount>0) packs.unshift(L);
  var sw = packs.map(function(x){ var on = x.id===L.id, stops = x.colours.map(function(c, i){ var a = Math.round(i*100/x.n), b = Math.round((i+1)*100/x.n); return COL(c).hex+' '+a+'% '+b+'%'; }).join(',');
    return '<a class="ca-pack'+(on?' on':'')+'" href="'+ca_pairHref(x, {tpl:'P5'})+'" aria-current="'+on+'" aria-label="'+esc(x.title)+'"><i style="background:conic-gradient('+stops+')"></i><span>'+esc(x.colours.map(function(c){ return COL(c).name.split(' ')[0]; }).join(' + '))+'</span></a>'; }).join('')+
    (g.visible.length > packs.length ? '<a class="ca-pack ca-packmore" href="#/combos/'+L.rule.id+'"><i>'+ico('right',16)+'</i><span>All '+g.visible.length+' packs</span></a>' : '');
  var info = '<div class="ca-info">'+ca_editNote(q)+'<div class="eyebrow">'+esc(L.n+' pcs · fixed colours')+'</div><h1 class="h1 ca-h1">'+esc(L.styleName+' Pack — '+L.colours.map(function(c){ return COL(c).name; }).join(', '))+'</h1>'+ca_priceLine(L)+
    '<div class="ca-lbl">Pack colours</div><div class="ca-packs" data-testid="ca-packs">'+sw+'</div>'+ca_sizeRow(L, u, L)+ca_trust(L)+ca_ctaBlock(L, L, u)+'</div>';
  return '<div class="ca-pp"><div class="ca-left"><button type="button" class="ca-hero" data-act="ca-zoom" data-id="'+esc(L.id)+'" data-i="0" aria-label="See the picture bigger">'+ca_setPhoto(L.pieces, {layout:'fan', inner:ca_badges(L)})+'</button></div>'+info+'</div>'+ca_gallery(L)+ca_chart(L, u)+ca_mbar(L, L, u);
}

/* =====================================================================
   P3 TOP + BOTTOM SET · P4 MIXED SET (PR 573, wave 2)
   One colour and one size per piece. Colours start from the combo the
   shopper opened; changing a colour picks the generated combo made of
   those colours (ca_findBy) — the page never links to a single product.
   P3 (COMBO-RESEARCH §7): set colour first, then a size row per piece;
       the top's size pre-fills the bottom ("Same as top").
   P4: a compact row per piece (photo, colour, size); a finished piece
       folds to one line; "Same size for all tops" tick.
   The button always says what is missing, and tapping it scrolls to it.
   ===================================================================== */
function ca_noun(p){
  if(p.short) return p.short;
  var c = CAT(p.cat), n = c ? String(c.name) : ca_garment(p);
  return /(trousers|pants|shorts|jeans)$/i.test(n) ? n : n.replace(/s$/,'');
}
function ca_isBottom(p){ var c = CAT(p.cat), ch = chartFor(p); return (c && c.group==='bottom') || !!(ch && ch.type==='bottom'); }
function ca_mxState(L, q){
  q = q||{};
  var u = ui('ca-mx:'+L.ruleId+':'+L.styleKey, {seed:'', cols:[], sizes:[], auto:[], mix:false, same:false, open:-1, err:null, errAt:-1, chart:false});
  var key = L.id+'|'+(q.sizes||'')+'|'+(q.from||'');
  if(u.seed!==key){
    var prev = u.sizes.slice(), qs = q.sizes ? String(q.sizes).split(',') : null;
    u.seed = key; u.cols = L.colours.slice(); u.err = null; u.errAt = -1; u.open = -1;
    u.auto = L.pieces.map(function(){ return false; });
    u.sizes = L.pieces.map(function(pc, i){
      var s = qs ? qs[i] : (prev[i] || mySizeFor(pc.p));
      return s && pc.p.sizes.indexOf(s)>=0 && stockOf(pc.p.id, pc.color, s)>0 ? s : null;
    });
    u.fromSaved = !qs && !prev.some(Boolean) && u.sizes.some(Boolean);
    u.mix = !L.colours.every(function(c){ return c===L.colours[0]; });
  }
  return u;
}
/* row label noun: "Hoodie", or "Polo 1" / "Polo 2" when the set repeats a product */
function ca_mxNoun(pcs, i){ var n = ca_noun(pcs[i].p), dup = pcs.filter(function(x){ return ca_noun(x.p)===n; }).length > 1;
  if(!dup) return n; var k = 0; for(var j=0;j<=i;j++) if(ca_noun(pcs[j].p)===n) k++; return n+' '+k; }
function ca_mxPieces(L, u){ return L.pieces.map(function(pc, i){ return {p:pc.p, color:u.cols[i] || pc.color}; }); }
function ca_mxNeed(pcs, i){ return pcs.filter(function(x){ return x.p.id===pcs[i].p.id && x.color===pcs[i].color; }).length; }
function ca_mxSizeOk(pcs, i, s){ return pcs[i].p.sizes.indexOf(s)>=0 && stockOf(pcs[i].p.id, pcs[i].color, s) >= ca_mxNeed(pcs, i); }
/* the first thing still missing, in page order */
function ca_mxMissing(L, u, pcs, T, tpl){
  if(!T) return {at:0, label:'Choose another colour', msg:'This colour mix is not offered — choose another colour.'};
  var miss = []; pcs.forEach(function(pc, i){ if(!u.sizes[i] || !ca_mxSizeOk(pcs, i, u.sizes[i])) miss.push(i); });
  if(!miss.length) return null;
  var i = miss[0], noun = ca_noun(pcs[i].p).toLowerCase();
  var label = tpl==='P3' ? 'Choose '+ca_mxNoun(pcs, i).toLowerCase()+' size' : (miss.length===pcs.length ? 'Choose '+miss.length+' sizes' : 'Choose '+miss.length+' more size'+(miss.length>1?'s':''));
  if(pcs.length===1) label = 'Choose a size';
  var bad = u.sizes[i] && !ca_mxSizeOk(pcs, i, u.sizes[i]);
  return {at:i, label:label, msg: bad ? COL(pcs[i].color).name+' '+noun+' '+u.sizes[i]+' is sold out — choose another size.' : 'Choose a size for the '+noun+'.'};
}
function ca_mxCta(L, u, pcs, T, tpl){ var m = ca_mxMissing(L, u, pcs, T, tpl); return m ? m.label : (pcs.length===3 ? 'Add all 3 to bag' : 'Add both to bag')+' · '+fmt(T.price); }
/* colours offered for piece i, given the other pieces' colours */
function ca_mxColours(L, u, pcs, i){
  return ca_coloursOf(L.rule, pcs[i].p).map(function(c){
    var alt = pcs.map(function(x, k){ return k===i ? {p:x.p, color:c} : x; }), X = ca_findBy(L.rule, alt);
    return {c:c, ok:!!(X && X.availCount>0)};
  });
}
function ca_mxSw(L, i, c, on, ok, act){
  return '<button type="button" class="ca-mxc'+(on?' on':'')+(ok?'':' out')+'" data-act="'+(ok?act:'ca-noop')+'" data-id="'+esc(L.id)+'" data-i="'+i+'" data-c="'+esc(c)+'" aria-pressed="'+on+'" aria-label="'+esc(COL(c).name+(ok?'':' — not available'))+'"'+(ok?'':' aria-disabled="true"')+'><i style="background:'+COL(c).hex+'"></i></button>';
}
function ca_mxColourRow(L, u, pcs, i, label){
  var list = ca_mxColours(L, u, pcs, i);
  return '<div class="ca-mxblk"><div class="ca-lbl">'+esc(label)+' <span class="ca-mxv">· '+esc(COL(pcs[i].color).name)+'</span></div><div class="ca-mxsw" role="group" aria-label="'+esc(label)+'">'+
    list.map(function(x){ return ca_mxSw(L, i, x.c, x.c===pcs[i].color, x.ok, 'ca-mxcol'); }).join('')+'</div></div>';
}
function ca_mxSizeRow(L, u, pcs, i, label, note){
  var pc = pcs[i], noun = ca_noun(pc.p).toLowerCase();
  var pills = pc.p.sizes.map(function(s){ var ok = ca_mxSizeOk(pcs, i, s), on = u.sizes[i]===s;
    return '<button type="button" class="size-pill'+(on?' on':'')+(ok?'':' out')+'" data-act="'+(ok?'ca-mxsize':'ca-mxout')+'" data-id="'+esc(L.id)+'" data-i="'+i+'" data-s="'+esc(s)+'" aria-pressed="'+on+'"'+(ok?'':' aria-label="'+esc(s+': '+COL(pc.color).name+' '+noun+' sold out')+'"')+'>'+esc(s)+'</button>'; }).join('');
  var outs = pc.p.sizes.filter(function(s){ return !ca_mxSizeOk(pcs, i, s); });
  var low = u.sizes[i] && ca_mxSizeOk(pcs, i, u.sizes[i]) ? stockOf(pc.p.id, pc.color, u.sizes[i]) : 0;
  return '<div class="ca-mxblk ca-sizebox'+(u.errAt===i?' err':'')+'" id="ca-mx-'+i+'"><div class="ca-lbl">'+esc(label)+(u.sizes[i] ? ' <span class="ca-mxv">· '+esc(u.sizes[i])+'</span>' : '')+'</div>'+
    '<div class="ca-sizes n'+pc.p.sizes.length+'" role="group" aria-label="'+esc(label)+'">'+pills+'</div>'+
    (outs.length ? '<div class="ca-why"><b>'+esc(outs.join(' · '))+'</b>: '+esc(COL(pc.color).name)+' sold out</div>' : '')+
    (low && low<=2 ? '<div class="ca-low">Only '+low+' left in '+esc(u.sizes[i])+'</div>' : '')+
    (note ? '<div class="xs muted mt4">'+esc(note)+'</div>' : '')+
    (u.errAt===i && u.err ? '<div class="ca-err" role="alert" data-testid="ca-err">'+ico('info',14)+'<span>'+esc(u.err)+'</span></div>' : '')+'</div>';
}
function ca_mxBar(L, u, pcs, T, tpl){
  var V = T || L;
  return '<div class="mbar dm-hide ca-mbar" data-testid="ca-mbar"><div class="ca-mprice"><b class="price">'+fmt(V.price)+'</b>'+(V.save>0 ? '<span class="ca-savetxt">Save '+fmt(V.save)+'</span>' : '')+'</div>'+
    '<button type="button" class="btn btn-primary ca-mbtn" data-act="ca-mxadd" data-id="'+esc(L.id)+'" data-testid="ca-cta">'+esc(ca_mxCta(L, u, pcs, T, tpl))+'</button></div>';
}
function ca_mxCtas(L, u, pcs, T, tpl){
  return '<div class="ca-ctas"><button type="button" class="btn btn-primary btn-block hide-m" data-act="ca-mxadd" data-id="'+esc(L.id)+'" data-testid="ca-cta-d">'+esc(ca_mxCta(L, u, pcs, T, tpl))+'</button>'+
    '<button type="button" class="btn btn-secondary btn-block" data-act="ca-mxadd" data-id="'+esc(L.id)+'" data-go="checkout" data-testid="ca-order">Order now — pay on delivery</button></div>';
}
function ca_mxBelow(L, u, T, tpl){
  var V = T || L;
  return ca_gallery(V)+ca_chart(L, u)+
    '<section class="ca-sec">'+ruleBlock('exchange', {key:'ca', title:'Swap a size in your combo'})+'<div class="xs muted mt8">You pay only the delivery charge for a size swap.</div></section>'+
    '<section class="ca-sec">'+waButton('Ask about this combo', 'Hi EXTAS, about the combo '+V.styleName+' '+V.title+(u.sizes.some(Boolean) ? ' ('+u.sizes.map(function(s){ return s||'?'; }).join('/')+')' : ''))+'</section>';
}
/* H1 = the set's name ("Black Hoodie + Jogger" when every piece shares the
   colour); the colours of each piece are in the photo chips and the rows,
   so the eyebrow is desktop-only (it cost a size row on a 360 phone). */
function ca_mxHead(L, T, pcs){
  var V = T || L, nouns = pcs.map(function(pc){ return ca_noun(pc.p); });
  var same = pcs.every(function(pc){ return pc.color===pcs[0].color; });
  var name = (same ? COL(pcs[0].color).name+' ' : '')+(L.rule.title || nouns.join(' + '));
  return '<div class="eyebrow hide-m">'+esc(nouns.join(' + ')+' · set of '+pcs.length)+'</div><h1 class="h1 ca-h1" data-testid="ca-h1">'+esc(name)+'</h1>'+ca_priceLine(V);
}
/* colours every piece comes in, whose all-same set is on sale */
function ca_mxCommon(L){
  var lists = L.pieces.map(function(pc){ return ca_coloursOf(L.rule, pc.p); });
  return lists[0].filter(function(c){ return lists.every(function(l){ return l.indexOf(c)>=0; }); }).filter(function(c){
    var X = ca_findBy(L.rule, L.pieces.map(function(pc){ return {p:pc.p, color:c}; })); return X && X.availCount>0; });
}

function ca_P3(L, q){
  var u = ca_mxState(L, q), pcs = ca_mxPieces(L, u), T = ca_findBy(L.rule, pcs), V = T || L;
  var hero = '<button type="button" class="ca-hero" data-act="ca-zoom" data-id="'+esc(V.id)+'" data-i="0" aria-label="See the picture bigger">'+ca_setPhoto(pcs, {layout:'tb', inner:T ? ca_badges(T) : ''})+'<span class="ca-zoomhint">'+ico('search',14)+'</span></button>';
  var common = ca_mxCommon(L), allSame = pcs.every(function(pc){ return pc.color===pcs[0].color; });
  var colour;
  if(!u.mix && allSame && common.length>=2){
    colour = '<div class="ca-mxblk"><div class="ca-lblrow"><div class="ca-lbl">Set colour <span class="ca-mxv">· '+esc(COL(pcs[0].color).name)+'</span></div>'+
      '<button type="button" class="link xs" data-act="ca-mxmix" data-id="'+esc(L.id)+'" data-testid="ca-mxmix">Mix colours?</button></div><div class="ca-mxsw" role="group" aria-label="Set colour">'+
      common.map(function(c){ return ca_mxSw(L, -1, c, c===pcs[0].color, true, 'ca-mxset'); }).join('')+'</div></div>';
  } else {
    colour = pcs.map(function(pc, i){ return ca_mxColourRow(L, u, pcs, i, ca_mxNoun(pcs, i)+' colour'); }).join('')+
      (common.length>=2 ? '<button type="button" class="link xs" data-act="ca-mxmix" data-id="'+esc(L.id)+'">Same colour for '+(pcs.length===3?'all 3':'both')+'</button>' : '');
  }
  var sizes = pcs.map(function(pc, i){
    var note = i>0 && u.auto[i] && u.sizes[i] ? 'Same as '+ca_mxNoun(pcs, 0).toLowerCase()+' — change if needed' : (i===0 && u.fromSaved && u.sizes[0] ? 'Your size' : '');
    return ca_mxSizeRow(L, u, pcs, i, ca_mxNoun(pcs, i)+' size', note);
  }).join('');
  var err = !T ? '<div class="ca-err" role="alert">'+ico('info',14)+'<span>This colour mix is not offered — choose another colour.</span></div>' : '';
  var info = '<div class="ca-info">'+ca_editNote(q)+ca_mxHead(L, T, pcs)+colour+err+sizes+ca_trust(V)+ca_mxCtas(L, u, pcs, T, 'P3')+'</div>';
  return '<div class="ca-pp ca-pp3"><div class="ca-left">'+hero+'</div>'+info+'</div>'+ca_mxBelow(L, u, T, 'P3')+ca_mxBar(L, u, pcs, T, 'P3');
}

function ca_P4(L, q){
  var u = ca_mxState(L, q), pcs = ca_mxPieces(L, u), T = ca_findBy(L.rule, pcs), V = T || L;
  var hero = '<button type="button" class="ca-hero" data-act="ca-zoom" data-id="'+esc(V.id)+'" data-i="0" aria-label="See the picture bigger">'+ca_setPhoto(pcs, {layout:'hero', cls:'ca-ph-short', inner:T ? ca_badges(T) : ''})+'<span class="ca-zoomhint">'+ico('search',14)+'</span></button>';
  var tops = []; pcs.forEach(function(pc, i){ if(!ca_isBottom(pc.p)) tops.push(i); });
  var shared = tops.length>=2 && tops.every(function(i){ return pcs[i].p.sizes.join()===pcs[tops[0]].p.sizes.join(); });
  var rows = pcs.map(function(pc, i){
    var noun = ca_noun(pc.p), done = u.sizes[i] && ca_mxSizeOk(pcs, i, u.sizes[i]) && T;
    var thumb = '<div class="ca-prth"><div class="ca-ph ca-ph-one" style="background:'+CA_HOUSE_BG+'"><div class="ca-art">'+ca_pieceArt(pc)+'</div></div></div>';
    if(done && u.open!==i){
      return '<div class="ca-prow done" id="ca-mx-'+i+'" data-testid="ca-prow">'+thumb+'<div class="ca-prdone"><span class="ca-prok">'+ico('check',14)+'</span><span class="ca-prtxt"><b>'+esc(noun)+'</b> · '+esc(COL(pc.color).name)+' · '+esc(u.sizes[i])+'</span>'+
        '<button type="button" class="link xs" data-act="ca-mxopen" data-id="'+esc(L.id)+'" data-i="'+i+'">Change</button></div></div>';
    }
    var cols = ca_mxColours(L, u, pcs, i);
    return '<div class="ca-prow" data-testid="ca-prow"><div class="ca-prhd">'+thumb+'<div class="ca-prnm"><b>'+esc(noun)+'</b><span class="xs muted">'+esc(COL(pc.color).name)+'</span></div></div>'+
      '<div class="ca-mxsw" role="group" aria-label="'+esc(noun+' colour')+'">'+cols.map(function(x){ return ca_mxSw(L, i, x.c, x.c===pc.color, x.ok, 'ca-mxcol'); }).join('')+'</div>'+
      ca_mxSizeRow(L, u, pcs, i, noun+' size', '')+'</div>';
  }).join('');
  var same = shared ? '<button type="button" class="ca-uptick ca-mxsame" data-act="ca-mxsame" data-id="'+esc(L.id)+'" aria-pressed="'+!!u.same+'"><span class="ca-box">'+(u.same?ico('check',14):'')+'</span><span>Same size for all tops</span></button>' : '';
  var err = !T ? '<div class="ca-err" role="alert">'+ico('info',14)+'<span>This colour mix is not offered — choose another colour.</span></div>' : '';
  var info = '<div class="ca-info">'+ca_editNote(q)+ca_mxHead(L, T, pcs)+err+same+'<div class="ca-prows">'+rows+'</div>'+ca_trust(V)+ca_mxCtas(L, u, pcs, T, 'P4')+'</div>';
  return '<div class="ca-pp ca-pp4"><div class="ca-left">'+hero+'</div>'+info+'</div>'+ca_mxBelow(L, u, T, 'P4')+ca_mxBar(L, u, pcs, T, 'P4');
}

/* P3 / P4 actions */
function ca_mxCtx(el){ var L = ca_listing(el.getAttribute('data-id')); if(!L) return null; var u = ca_mxState(L, CUR.query); return {L:L, u:u, tpl:ca_pageTpl(L, CUR.query)}; }
ACT['ca-mxcol'] = function(el){
  var c = ca_mxCtx(el); if(!c) return; var i = +el.getAttribute('data-i'); c.u.cols[i] = el.getAttribute('data-c'); c.u.err = null; c.u.errAt = -1;
  var pcs = ca_mxPieces(c.L, c.u); pcs.forEach(function(pc, k){ if(c.u.sizes[k] && !ca_mxSizeOk(pcs, k, c.u.sizes[k])) c.u.sizes[k] = null; });
  rerender();
};
ACT['ca-mxset'] = function(el){ var c = ca_mxCtx(el); if(!c) return; var col = el.getAttribute('data-c'); c.u.cols = c.L.pieces.map(function(){ return col; }); c.u.err = null; c.u.errAt = -1;
  var pcs = ca_mxPieces(c.L, c.u); pcs.forEach(function(pc, k){ if(c.u.sizes[k] && !ca_mxSizeOk(pcs, k, c.u.sizes[k])) c.u.sizes[k] = null; }); rerender(); };
ACT['ca-mxmix'] = function(el){ var c = ca_mxCtx(el); if(!c) return; c.u.mix = !c.u.mix;
  if(!c.u.mix){ var common = ca_mxCommon(c.L), col = common.indexOf(c.u.cols[0])>=0 ? c.u.cols[0] : common[0]; if(col) c.u.cols = c.L.pieces.map(function(){ return col; }); }
  rerender(); };
ACT['ca-mxsize'] = function(el){
  var c = ca_mxCtx(el); if(!c) return; var i = +el.getAttribute('data-i'), s = el.getAttribute('data-s'), u = c.u, pcs = ca_mxPieces(c.L, u);
  u.sizes[i] = s; u.auto[i] = false; u.err = null; u.errAt = -1; u.fromSaved = false; if(u.open===i) u.open = -1;
  if(c.tpl==='P3' && i===0) pcs.forEach(function(pc, k){ if(k>0 && (u.auto[k] || !u.sizes[k]) && ca_mxSizeOk(pcs, k, s)){ u.sizes[k] = s; u.auto[k] = true; } });
  if(c.tpl==='P4' && u.same && !ca_isBottom(pcs[i].p)) pcs.forEach(function(pc, k){ if(k!==i && !ca_isBottom(pc.p) && ca_mxSizeOk(pcs, k, s)) u.sizes[k] = s; });
  rerender();
};
ACT['ca-mxout'] = function(el){ var c = ca_mxCtx(el); if(!c) return; var i = +el.getAttribute('data-i'), pcs = ca_mxPieces(c.L, c.u);
  c.u.errAt = i; c.u.err = COL(pcs[i].color).name+' '+ca_noun(pcs[i].p).toLowerCase()+' '+el.getAttribute('data-s')+' is sold out — choose another size or colour.'; rerender(); };
ACT['ca-mxsame'] = function(el){ var c = ca_mxCtx(el); if(!c) return; c.u.same = !c.u.same;
  if(c.u.same){ var pcs = ca_mxPieces(c.L, c.u), s = null; pcs.forEach(function(pc, k){ if(!s && !ca_isBottom(pc.p) && c.u.sizes[k]) s = c.u.sizes[k]; });
    if(s) pcs.forEach(function(pc, k){ if(!ca_isBottom(pc.p) && ca_mxSizeOk(pcs, k, s)) c.u.sizes[k] = s; }); }
  rerender(); };
ACT['ca-mxopen'] = function(el){ var c = ca_mxCtx(el); if(!c) return; c.u.open = +el.getAttribute('data-i'); rerender(); };
ACT['ca-mxadd'] = function(el){
  var c = ca_mxCtx(el); if(!c) return; var u = c.u, pcs = ca_mxPieces(c.L, u), T = ca_findBy(c.L.rule, pcs), from = CUR.query && CUR.query.from;
  var m = ca_mxMissing(c.L, u, pcs, T, c.tpl);
  if(m){ u.err = m.msg; u.errAt = m.at; if(c.tpl==='P4') u.open = -1; rerender(); ca_scrollTo('ca-mx-'+m.at); return; }
  var res = ca_bagAdd(T, u.sizes.slice(), from ? {replace:from} : {});
  if(res.added){ u.err = null; u.errAt = -1; ca_added(T, res, el.getAttribute('data-go')==='checkout', !!from); }
  else if(res.reason==='stock'){ u.err = res.msg; u.errAt = 0; rerender(); ca_scrollTo('ca-mx-0'); }
};

function ca_pairPage(id, q){
  var L = ca_listing(id);
  if(!L || !L.rule.active){
    var r = ca_rule(String(id).split('~')[0]);
    return '<div class="container ca-page"><div class="ca-empty" data-testid="ca-gone"><h1 class="h2">This combo is not available</h1><p class="muted mt8">It may have been switched off or a colour was removed.</p>'+
      '<a class="btn btn-primary mt16" href="'+(r && r.active ? '#/combos/'+r.id : '#/combos')+'">See the combos</a></div></div>';
  }
  var tpl = ca_pageTpl(L, q);
  var body = L.availCount===0 ? ca_soldOut(L, q) : tpl==='P2' ? ca_P2(L, q) : tpl==='P3' ? ca_P3(L, q) : tpl==='P4' ? ca_P4(L, q) : tpl==='P5' ? ca_P5(L, q) : ca_P1(L, q);
  return '<div class="container ca-page ca-pair ca-'+tpl+'" data-testid="ca-pair" data-tpl="'+tpl+'" data-id="'+esc(L.id)+'">'+
    ca_crumbs([['Combos','#/combos'],[L.rule.title, '#/combos/'+L.rule.id],[L.title, null]])+body+ca_tplBar('page', tpl, '#/combo-pair/'+L.id)+'</div>';
}

/* ---------- pair page actions ---------- */
function ca_ctxOf(el){ var L = ca_listing(el.getAttribute('data-id')); if(!L) return null; return {L:L, u:ca_pageState(L, CUR.query)}; }
ACT['ca-noop'] = function(){};
ACT['ca-size'] = function(el){ var c = ca_ctxOf(el); if(!c) return; c.u.size = el.getAttribute('data-s'); c.u.err = null; c.u.fromSaved = false; rerender(); };
ACT['ca-psize'] = function(el){ var c = ca_ctxOf(el); if(!c) return; c.u.sizes[+el.getAttribute('data-i')] = el.getAttribute('data-s'); c.u.err = null; rerender(); };
ACT['ca-mode'] = function(el){ var c = ca_ctxOf(el); if(!c) return; var m = el.getAttribute('data-m');
  if(m==='each'){ c.u.sizes = c.L.pieces.map(function(pc){ return c.u.size && stockOf(pc.p.id, pc.color, c.u.size)>0 ? c.u.size : (c.u.sizes[0]||null); }); }
  else { var s = c.u.sizes[0]; c.u.size = s && c.L.avail[s] && c.L.avail[s].ok ? s : null; }
  c.u.mode = m; c.u.err = null; rerender(); };
ACT['ca-up'] = function(el){ var c = ca_ctxOf(el); if(!c) return; c.u.up = !c.u.up; if(!c.u.up) c.u.upColor = null; c.u.err = null; rerender(); };
ACT['ca-upcol'] = function(el){ var c = ca_ctxOf(el); if(!c) return; c.u.upColor = el.getAttribute('data-c'); c.u.err = null; rerender(); };
ACT['ca-chart'] = function(el){ var L = ca_listing(el.getAttribute('data-id')); if(!L) return; var tpl = ca_pageTpl(L, CUR.query); var u = tpl==='P2' ? ca_p2State(L) : (tpl==='P3' || tpl==='P4') ? ca_mxState(L, CUR.query) : ca_pageState(L, CUR.query); u.chart = !u.chart; rerender(); };
/* a greyed size is never a dead end */
ACT['ca-sizeout'] = function(el){
  var L = ca_listing(el.getAttribute('data-id')); if(!L) return; var s = el.getAttribute('data-s'), a = L.avail[s]; if(!a) return;
  var out = a.out.map(function(pc){ return COL(pc.color).name+(L.same ? '' : ' '+ca_short(pc.p).toLowerCase()); }).join(' and ');
  var n = ca_generate(L.rule).visible.filter(function(x){ return x.avail[s] && x.avail[s].ok; }).length;
  openModal('<p class="small">'+esc(out+' '+s)+' is sold out.</p><div class="stack s8 mt12">'+
    (n ? '<a class="btn btn-secondary btn-block" href="#/combos/'+L.rule.id+'?size='+encodeURIComponent(s)+'" data-act="ca-seesize" data-rule="'+L.rule.id+'" data-s="'+esc(s)+'">See '+plural(n, 'combo')+' in stock in '+esc(s)+'</a>' : '')+
    (el.getAttribute('data-each') ? '<button type="button" class="btn btn-ghost btn-block" data-act="ca-each-from" data-id="'+esc(L.id)+'">Choose a different size for '+esc(out)+'</button>' : '')+
    '</div>', {title:'Size '+s});
};
ACT['ca-seesize'] = function(el){ var r = ca_rule(el.getAttribute('data-rule')); if(!r) return; var u = ca_listState(r); u.size = el.getAttribute('data-s'); u.has = []; closeModal(); go('#/combos/'+r.id); };
ACT['ca-each-from'] = function(el){ var c = ca_ctxOf(el); closeModal(); if(!c) return; c.u.mode = 'each'; c.u.sizes = c.L.pieces.map(function(){ return c.u.size||null; }); rerender(); var b = document.getElementById('ca-sizes'); if(b) b.scrollIntoView({block:'center'}); };

function ca_scrollTo(id){ var e = document.getElementById(id); if(!e) return; e.scrollIntoView({block:'center', behavior:'smooth'}); e.classList.remove('ca-pulse'); void e.offsetWidth; e.classList.add('ca-pulse'); }
function ca_added(T, res, goCheckout, editing){
  ca_trackSetup();
  if(!ca_bagWrapped()) ca_track('add_to_bag', {line:'set', set_id:T.id, set_name:T.name, items:T.n, price:T.price, colour:T.colours.join('+')});
  if(goCheckout){ go('#/checkout'); return; }
  if(editing){ go('#/bag'); toast('Combo changed in your bag'); return; }
  rerender();
  toast('Added to bag: '+T.title+' · '+fmt(T.price));
}
ACT['ca-add'] = function(el){
  var L = ca_listing(el.getAttribute('data-id')); if(!L) return;
  var goCo = el.getAttribute('data-go')==='checkout', from = CUR.query && CUR.query.from;
  if(el.getAttribute('data-ctx')==='l4'){
    var lu = ca_listState(L.rule), st = lu.l4[L.id] || (lu.l4[L.id] = {});
    if(!st.size){ st.err = 'Choose a size first.'; rerender(); ca_scrollTo('ca4-'+L.id); return; }
    var r4 = ca_bagAdd(L, L.pieces.map(function(){ return st.size; }));
    if(r4.added){ st.err = null; ca_added(L, r4, goCo, false); }
    else if(r4.reason==='stock'){ st.err = r4.msg; rerender(); }
    return;
  }
  var u = ca_pageState(L, CUR.query), T = ca_target(L, u), miss = ca_missing(T, L, u);
  if(miss){ u.err = miss.msg || (miss.what==='colour' ? 'Pick the 3rd colour.' : (u.mode==='each' ? 'Choose a size for each piece.' : 'Choose a size for '+(T.n===3?'all 3':'both')+'.')); rerender(); ca_scrollTo(miss.at); return; }
  var res = ca_bagAdd(T, ca_sizesFor(T, L, u), from ? {replace:from} : {});
  if(res.added){ u.err = null; ca_added(T, res, goCo, !!from); }
  else if(res.reason==='stock'){ u.err = res.msg; rerender(); ca_scrollTo('ca-sizes'); }
  else if(res.reason==='repeat'){ /* a double tap — already added */ }
};
ACT['ca-order'] = ACT['ca-add'];
/* P2 actions */
ACT['ca-p2tier'] = function(el){ var L = ca_listing(el.getAttribute('data-id')); if(!L) return; var u = ca_p2State(L); u.n = +el.getAttribute('data-n'); while(u.picks.length > u.n) u.picks.pop(); u.note = null; u.err = null; rerender(); };
ACT['ca-p2pick'] = function(el){
  var L = ca_listing(el.getAttribute('data-id')); if(!L) return; var u = ca_p2State(L), k = el.getAttribute('data-k'), gi = +el.getAttribute('data-g');
  var res = ca_p2Resolve(L, u); u.note = null; u.err = null;
  if(res.rule.pairing==='across'){ u.picks[gi] = k; }
  else {
    var i = u.picks.indexOf(k);
    if(i>=0) u.picks.splice(i, 1);
    else if(u.picks.length >= res.need){ var old = u.picks.shift(); u.picks.push(k); u.note = 'Changed: '+COL(old.split('|')[1]).name+' → '+COL(k.split('|')[1]).name; }
    else u.picks.push(k);
  }
  var r2 = ca_p2Resolve(L, u); if(u.size && r2.T && !r2.T.avail[u.size].ok) u.size = null;
  rerender();
};
ACT['ca-p2size'] = function(el){ var L = ca_listing(el.getAttribute('data-src')); if(!L) return; var u = ca_p2State(L); u.size = el.getAttribute('data-s'); u.err = null; rerender(); };
ACT['ca-p2add'] = function(el){
  var L = ca_listing(el.getAttribute('data-id')); if(!L) return; var u = ca_p2State(L), res = ca_p2Resolve(L, u), from = CUR.query && CUR.query.from;
  var left = res.need - res.pieces.length;
  if(left>0){ u.err = null; u.note = 'Pick '+left+' more colour'+(left>1?'s':'')+'.'; rerender(); ca_scrollTo('ca-pick'); return; }
  if(!res.T){ u.err = 'This colour mix is not offered.'; rerender(); return; }
  if(!u.size || !res.T.avail[u.size].ok){ u.err = 'Choose a size for '+(res.need===3?'all 3':'both')+'.'; rerender(); ca_scrollTo('ca-sizes'); return; }
  var r = ca_bagAdd(res.T, res.T.pieces.map(function(){ return u.size; }), from ? {replace:from} : {});
  if(r.added){ u.err = null; ca_added(res.T, r, el.getAttribute('data-go')==='checkout', !!from); }
  else if(r.reason==='stock'){ u.err = r.msg; rerender(); }
};

/* ---------- full-screen photo viewer (same look as 31-zoom.js .zm) ---------- */
function ca_zoomSlides(L){
  var s = ['<div class="ca-zoomset">'+ca_setPhoto(L.pieces, {layout:'hero'})+'</div>'];
  L.pieces.forEach(function(pc){ ['front','back'].forEach(function(v){ s.push('<div class="zm-draw" style="background:'+CA_HOUSE_BG+'">'+ca_pieceArt(pc, v)+'</div>'); }); });
  return s;
}
function ca_zoomOpen(L, i0){
  ca_zoomClose();
  var slides = ca_zoomSlides(L), el = document.createElement('div');
  el.className = 'zm ca-zm'; el.setAttribute('role','dialog'); el.setAttribute('aria-label', L.title+' photos');
  el.innerHTML = '<div class="zm-top"><span class="zm-n" aria-live="polite"></span><button type="button" class="zm-x" aria-label="Close">'+ico('close',22)+'</button></div>'+
    '<div class="zm-trk">'+slides.map(function(h){ return '<div class="zm-slide"><div class="zm-pan">'+h+'</div></div>'; }).join('')+'</div><div class="zm-hint">Double-tap to zoom · swipe for more</div>';
  document.body.appendChild(el); document.body.style.overflow = 'hidden';
  var trk = el.querySelector('.zm-trk'), n = el.querySelector('.zm-n'), s = 1;
  var idx = function(){ return Math.round(trk.scrollLeft / Math.max(1, trk.clientWidth)); };
  var count = function(){ n.textContent = (idx()+1)+' / '+slides.length; };
  trk.scrollLeft = (i0||0) * trk.clientWidth; count();
  trk.addEventListener('scroll', count, {passive:true});
  var pan = function(){ return trk.children[idx()].querySelector('.zm-pan'); };
  var zoom = function(on){ s = on ? 2.5 : 1; var p = pan(); if(p){ p.style.transition = 'transform .2s ease'; p.style.transform = 'scale('+s+')'; } trk.classList.toggle('zoomed', s>1); };
  el.querySelector('.zm-x').addEventListener('click', ca_zoomClose);
  var last = 0, y0 = null;
  el.addEventListener('touchstart', function(e){ if(e.touches.length===1) y0 = {x:e.touches[0].clientX, y:e.touches[0].clientY, t:Date.now()}; }, {passive:true});
  el.addEventListener('touchend', function(e){
    if(!y0 || e.target.closest('.zm-x')) return; var t = e.changedTouches[0], dx = t.clientX-y0.x, dy = t.clientY-y0.y;
    if(s===1 && dy>90 && Math.abs(dx)<60){ ca_zoomClose(); return; }
    if(Math.abs(dx)<8 && Math.abs(dy)<8){ var now = Date.now(); if(now-last<300){ zoom(s===1); last = 0; } else last = now; }
    y0 = null;
  });
  el.addEventListener('dblclick', function(e){ if(!e.target.closest('.zm-x')) zoom(s===1); });
  CA.zkey = function(e){ if(e.key==='Escape') ca_zoomClose(); if(s===1 && (e.key==='ArrowRight' || e.key==='ArrowLeft')) trk.scrollBy({left:(e.key==='ArrowRight'?1:-1)*trk.clientWidth}); };
  document.addEventListener('keydown', CA.zkey);
  setTimeout(function(){ var h = el.querySelector('.zm-hint'); if(h) h.classList.add('off'); }, 2200);
}
function ca_zoomClose(){ var el = document.querySelector('.ca-zm'); if(el){ el.remove(); document.body.style.overflow = ''; } if(CA.zkey){ document.removeEventListener('keydown', CA.zkey); CA.zkey = null; } }
ACT['ca-zoom'] = function(el){ var L = ca_listing(el.getAttribute('data-id')); if(L) ca_zoomOpen(L, +el.getAttribute('data-i')||0); };

/* ---------- routes + pages ---------- */
if(typeof ROUTES !== 'undefined'){
  ROUTES.push([/^\/combos$/, 'ca-hub']);
  ROUTES.push([/^\/combos\/([\w-]+)$/, 'ca-list']);
  ROUTES.push([/^\/combo-pair\/([\w.~-]+)$/, 'ca-pair']);
  ROUTES.push([/^\/combo\/([\w-]+~[\w.~-]+)$/, 'ca-pair']);   /* the bag's "Change size or colour" link */
}
if(typeof PAGES !== 'undefined'){
  PAGES['ca-hub'] = {
    title:'Combos',
    render:function(params, q){
      return '<div class="container ca-page ca-list ca-L3" data-testid="ca-list" data-tpl="L3">'+ca_crumbs([['Combos', null]])+
        '<header class="ca-head"><div class="eyebrow">2 or 3 pieces · one price</div><h1 class="h1">Combos</h1></header>'+ca_L3(null, {}, q||{})+'</div>';
    },
    after:function(){ ca_fit(); if(!CA.viewed.hub){ CA.viewed.hub = 1; ca_track('combo_view', {kind:'hub'}); } }
  };
  PAGES['ca-list'] = {
    title:function(params){ var r = ca_rule(params[0]); return r ? r.title+' combos' : 'Combos'; },
    render:function(params, q){
      var r = ca_rule(params[0]);
      if(!r || !r.active) return '<div class="container ca-page"><div class="ca-empty" data-testid="ca-gone"><h1 class="h2">These combos are switched off</h1><a class="btn btn-primary mt16" href="#/combos">See all combos</a></div></div>';
      if(q && q.size){ var u = ca_listState(r); if(!u.sizeQ){ u.sizeQ = 1; u.size = q.size; } }
      return ca_listPage(r, q||{});
    },
    after:function(params, q){ ca_fit(); var r = ca_rule(params[0]); if(r && !CA.viewed.list){ CA.viewed.list = 1; ca_track('combo_view', {kind:'list', set_id:r.id, tpl:ca_listTpl(r, q), combos:ca_generate(r).visible.length}); } }
  };
  PAGES['ca-pair'] = {
    title:function(params){ var L = ca_listing(params[0]); return L ? L.styleName+' Combo — '+L.title+' ('+L.n+' pcs)' : 'Combo'; },
    render:function(params, q){ return ca_pairPage(params[0], q||{}); },
    after:function(params, q){
      ca_trackSetup(); ca_fit();
      var L = ca_listing(params[0]);
      if(L && !CA.viewed.pair){ CA.viewed.pair = 1; ca_track('combo_view', {kind:'pair', set_id:L.id, set_name:L.name, price:L.price, pid:L.pieces[0].p.id, tpl:ca_pageTpl(L, q)}); }
    }
  };
}
