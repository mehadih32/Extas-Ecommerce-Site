/* =====================================================================
   90-admin-catalog.js — ভান্ডারী Bhandari A360-03 · Products (S01, PR 19–29, 90, 571)
   #/admin/products            product list (search, category, combo tick)
   #/admin/products/new        upload form
   #/admin/products/<id>       edit form
   ALSO the small shared layer for the wave-2 admin pages (90–94 and 85):
     · ZO_LINKS + one adminShell wrapper → "Operations" group in the sidebar
       (replaces the greyed "In the full build" items, same way 89 does)
     · zo_applyAll() — puts the owner's saved edits (ST.ops) back onto DB
       after every load and after "Reset all demo data", so the storefront
       reads the edited products / colours / combo rules / journal at once.
   DEMO ONLY: everything is saved in this browser (ST.ops). Nothing is sent.
   Prefixes: zo_ (shared), zp_ (products). CSS: r12-zadmin2.css.
   ===================================================================== */

/* ---------- routes ---------- */
function zo_route(re, name){ try{ if(!ROUTES.some(function(r){ return r[1]===name; })) ROUTES.push([re, name]); }catch(e){} }
zo_route(/^\/admin\/products$/, 'zp-list');
zo_route(/^\/admin\/products\/([\w-]+)$/, 'zp-edit');

/* ---------- sidebar: one "Operations" group for every wave-2 page ---------- */
/* [label, href, icon, the greyed "In the full build" item it replaces] */
var ZO_LINKS = [];
function zo_link(l){ if(!ZO_LINKS.some(function(x){ return x[1]===l[1]; })) ZO_LINKS.push(l); }
zo_link(['Products','#/admin/products','box','Products (from ERP)']);
(function(){
  try{
    var orig = window.adminShell; if(typeof orig!=='function' || orig._zo) return;
    var reEsc = function(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    var w = function(body, cur){
      var out = orig.apply(this, arguments);
      try{
        if(out.indexOf('data-zo-grp')>=0) return out;
        var p = (cur && cur.path) || '';
        var isOn = function(h){ var x = h.slice(1); return p===x || p.indexOf(x+'/')===0; };
        var side = ZO_LINKS.map(function(l){ return '<a class="'+(isOn(l[1])?'on':'')+'" href="'+l[1]+'" data-zo>'+ico(l[2],18)+esc(l[0])+'</a>'; }).join('');
        var chips = ZO_LINKS.map(function(l){ return '<a class="chip'+(isOn(l[1])?' on':'')+'" href="'+l[1]+'" data-zo>'+esc(l[0])+'</a>'; }).join('');
        var grp = '<div class="zs-sidegrp" data-zo-grp>Operations</div>'+side;
        var sys = '<div class="zs-sidegrp" data-zs-sys>';
        var mark = '<div class="xs" style="color:#9FBDB4;padding:16px 12px 6px">In the full build</div>';
        if(out.indexOf(sys)>=0) out = out.replace(sys, grp+sys);
        else if(out.indexOf(mark)>=0) out = out.replace(mark, grp+mark);
        ZO_LINKS.forEach(function(l){ if(l[3]) out = out.replace(new RegExp('<a class="soon">(?:(?!</a>)[\\s\\S])*?'+reEsc(esc(l[3]))+'</a>'), ''); });
        if(out.indexOf('<a class="soon">')<0) out = out.replace(mark, '');
        out = out.replace(/(<div class="admin-tabs hide-d mb16">[\s\S]*?)(<\/div>)/, function(m, a, b){ return a+chips+b; });
      }catch(e){}
      return out;
    };
    w._zo = true; window.adminShell = w;
  }catch(e){}
})();

/* ---------- state + re-apply after load / reset ---------- */
function zo_ops(){
  if(!ST.ops) ST.ops = {};
  var o = ST.ops;
  if(!o.cat) o.cat = {prod:{}, colors:{}, subcats:[]};
  return o;
}
var ZO_APPLY = [];
function zo_applyAll(){
  if(!ST) return;
  ['zp_apply','acw_apply'].concat(ZO_APPLY).forEach(function(n){ var f = typeof n==='function' ? n : window[n]; if(typeof f==='function') try{ f(); }catch(e){ console.error(e); } });
}
(function(){
  try{
    var oL = window.loadState; if(typeof oL==='function' && !oL._zo){ var nl = function(){ var r = oL.apply(this, arguments); try{ zo_applyAll(); }catch(e){} return r; }; nl._zo = true; window.loadState = nl; }
    var oR = window.resetState; if(typeof oR==='function' && !oR._zo){ var nr = function(){ var h = location.hash; var r = oR.apply(this, arguments); try{ zo_applyAll(); if(location.hash===h || h==='#/' || h==='') render(); }catch(e){} return r; }; nr._zo = true; window.resetState = nr; }
  }catch(e){}
})();

/* ---------- small shared helpers (91–94 and 85 use them) ---------- */
function zo_tabs(base, tabs, cur, extra){
  return '<div class="za-tabs zo-tabs" role="tablist">'+tabs.map(function(t){
    return '<a class="chip'+(t[0]===cur?' on':'')+'" role="tab" aria-selected="'+(t[0]===cur)+'" href="'+base+'?tab='+t[0]+(extra||'')+'">'+esc(t[1])+(t[2]!=null && t[2]!=='' ? ' <span class="zo-cnt">'+t[2]+'</span>' : '')+'</a>';
  }).join('')+'</div>';
}
function zo_mask(phone){ var d = String(phone||'').replace(/\D/g,''); if(d.length<7) return '•••'; return d.slice(0,3)+'•••••'+d.slice(-3); }
function zo_copy(text, msg){
  var done = function(){ toast(msg || 'Link copied'); };
  try{ if(navigator.clipboard && window.isSecureContext){ navigator.clipboard.writeText(text).then(done, function(){ zo_copyOld(text); done(); }); return; } }catch(e){}
  zo_copyOld(text); done();
}
function zo_copyOld(text){ try{ var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly',''); t.style.position = 'fixed'; t.style.left = '-9999px'; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }catch(e){} }
function zo_shopUrl(hash){ return location.href.split('#')[0] + hash; }
function zo_slug(s){ s = String(s||''); try{ s = s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }catch(e){} return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48); }
function zo_int(v){ var n = parseInt(String(v).replace(/[^\d-]/g,''), 10); return isNaN(n) ? 0 : n; }
function zo_rnd(seed, a, b){ return a + Math.floor(zs_rnd(seed) * (b - a + 1)); }
function zo_head(eyebrow, title, bn, desc, right){ return zs_head(eyebrow, title, bn, desc, right); }
ACT['zo-copy'] = function(el){ zo_copy(el.getAttribute('data-text'), el.getAttribute('data-msg')); };

/* =====================================================================
   PRODUCTS
   ===================================================================== */
var ZP_LETTER = ['S','M','L','XL','XXL','3XL'];
var ZP_WAIST = ['28','30','32','34','36','38','40'];
var ZP_SHOTS = [['back','Back'],['detail','Detail'],['model','On model']];
/* snapshot of the seed catalogue, so an edit can be undone by "Reset all demo data" */
var ZP_SNAP = {
  products: JSON.parse(JSON.stringify(DB.products)),
  colors: Object.keys(DB.colors),
  subcats: JSON.parse(JSON.stringify(DB.subcats || []))
};
function zp_apply(){
  var c = zo_ops().cat, base = {};
  ZP_SNAP.products.forEach(function(p){ base[p.id] = p; });
  /* products: reset seed ones in place (keeps object identity), drop added ones */
  for(var i=DB.products.length-1;i>=0;i--){
    var p = DB.products[i], b = base[p.id];
    if(!b){ DB.products.splice(i,1); continue; }
    Object.keys(p).forEach(function(k){ if(!(k in b)) delete p[k]; });
    var cp = JSON.parse(JSON.stringify(b)); Object.keys(cp).forEach(function(k){ p[k] = cp[k]; });
  }
  Object.keys(DB.colors).forEach(function(k){ if(ZP_SNAP.colors.indexOf(k)<0) delete DB.colors[k]; });
  Object.keys(c.colors||{}).forEach(function(k){ DB.colors[k] = {name:c.colors[k].name, hex:c.colors[k].hex}; });
  DB.subcats = JSON.parse(JSON.stringify(ZP_SNAP.subcats)).concat((c.subcats||[]).filter(function(s){ return !ZP_SNAP.subcats.some(function(x){ return x.id===s.id; }); }));
  Object.keys(c.prod||{}).forEach(function(id){
    var rec = JSON.parse(JSON.stringify(c.prod[id])), p = P(id);
    if(p){ Object.keys(rec).forEach(function(k){ p[k] = rec[k]; }); }
    else DB.products.push(rec);
  });
  if(typeof CA!=='undefined') CA.cache = {};
}
/* the "Use in combos" tick: a product with comboOff is left out of every
   auto colour-pair rule. RUNTIME HOOK — the explicit version of this is the
   one-line patch to ca_productsFor() in 42-combo-auto.js listed in the report. */
/* (hook now explicit in 42-combo-auto.js ca_productsFor) */

function zp_isLetter(sizes){ return !sizes || !sizes.length || sizes.every(function(s){ return /[A-Z]/.test(s); }); }
function zp_subName(id){ var s = (DB.subcats||[]).filter(function(x){ return x.id===id; })[0]; return s ? s.name : id.split('/').pop(); }
function zp_path(p){
  var c = CAT(p.cat), out = [c ? c.name : p.cat];
  if(p.sub){ var parts = p.sub.split('/'); for(var i=2;i<=parts.length;i++) out.push(zp_subName(parts.slice(0,i).join('/'))); }
  return out.join(' › ');
}
function zp_subsOf(cat){ return (DB.subcats||[]).filter(function(s){ return s.id.indexOf(cat+'/')===0; }); }
function zp_totalStock(p){ var t = 0; (p.colors||[]).forEach(function(c){ var s = (p.stock||{})[c] || {}; (p.sizes||[]).forEach(function(z){ t += s[z]||0; }); }); return t; }
function zp_photoCount(p){
  var n = 0, ph = p.photos || {};
  if((p.colors||[]).some(function(c){ return ph[c] && ph[c].front && ph[c].front.src; })) n++;
  ZP_SHOTS.forEach(function(s){ if(ph._shared && ph._shared[s[0]] && ph._shared[s[0]].src) n++; });
  return n;
}
function zp_health(p){
  var miss = [];
  if(zp_photoCount(p)<4) miss.push(['photos', (4 - zp_photoCount(p))+' photo'+(4 - zp_photoCount(p)===1?'':'s')+' missing', 'ছবি কম']);
  if(!p.chart && CAT(p.cat) && CAT(p.cat).group!=='acc') miss.push(['chart','No size chart','সাইজ চার্ট নেই']);
  if(!p.fabric) miss.push(['fabric','No fabric note','কাপড়ের তথ্য নেই']);
  if(!zp_totalStock(p)) miss.push(['stock','No stock','স্টক নেই']);
  return miss;
}
function zp_thumb(p, col){
  col = col || (p.colors||[])[0];
  var ph = p.photos && p.photos[col] && p.photos[col].front;
  if(ph && ph.src) return '<div class="pimg ratio-11 zp-thimg"><img src="'+esc(ph.src)+'" alt=""></div>';
  if(!col) return '<div class="pimg ratio-11 zp-thimg"></div>';
  return productImg(p, col, {ratio:'ratio-11', label:false});
}

/* ---------- combos a product is in / would be in ---------- */
function zp_bound(rule, p){
  if((rule.bind.products||[]).indexOf(p.id)>=0) return true;
  return (rule.bind.categories||[]).some(function(path){ return ca_inPath(p, path); });
}
function zp_hasPiece(L, pid){ return L.pieces.some(function(pc){ return pc.p.id===pid; }); }
/* runs the real generator with the draft product in the catalogue, then puts
   everything back — so the count is exactly what saving would make */
function zp_simulate(draft){
  if(typeof ca_rules!=='function') return [];
  var rules = ca_rules().filter(function(r){ return zp_bound(r, draft); });
  if(!rules.length) return [];
  var real = P(draft.id), idx = real ? DB.products.indexOf(real) : -1;
  var tmp = JSON.parse(JSON.stringify(draft)); tmp.comboOff = false;
  if(idx>=0) DB.products[idx] = tmp; else DB.products.push(tmp);
  var out = [];
  try{
    rules.forEach(function(r){
      var rr = JSON.parse(JSON.stringify(r)); rr.id = '__zp_'+r.id;
      var g = ca_generate(rr);
      var mine = g.all.filter(function(L){ return zp_hasPiece(L, tmp.id); });
      out.push({rule:r, all:mine.length, vis:mine.filter(function(L){ return L.availCount>0; }).length, total:g.all.length});
      delete CA.cache[rr.id];
    });
  }catch(e){ console.error(e); }
  if(idx>=0) DB.products[idx] = real; else DB.products.splice(DB.products.indexOf(tmp), 1);
  return out;
}
function zp_inCombos(p){
  if(typeof ca_rules!=='function') return [];
  return ca_rules().filter(function(r){ return zp_bound(r, p); }).map(function(r){
    var g = ca_generate(r), mine = g.all.filter(function(L){ return zp_hasPiece(L, p.id); });
    return {rule:r, all:mine.length, vis:mine.filter(function(L){ return L.availCount>0; }).length};
  });
}
function zp_bindPath(p){ return p.sub || p.cat; }

/* ---------- list ---------- */
PAGES['zp-list'] = { layout:'admin', title:'Products', render:function(){
  var u = ui('zp-list', {cat:'all', combo:false, q:''});
  var all = DB.products.slice();
  var inCombo = all.filter(function(p){ return !p.comboOff && zp_inCombos(p).some(function(x){ return x.all>0; }); }).length;
  var low = 0, noPh = 0;
  all.forEach(function(p){ (p.colors||[]).forEach(function(c){ (p.sizes||[]).forEach(function(z){ var n = ((p.stock||{})[c]||{})[z]||0; if(n>0 && n<=2) low++; }); }); if(zp_photoCount(p)<4) noPh++; });
  var cats = DB.categories.filter(function(c){ return all.some(function(p){ return p.cat===c.id; }); });
  var list = all.filter(function(p){ return (u.cat==='all' || p.cat===u.cat) && (!u.combo || (!p.comboOff && zp_inCombos(p).length)); });
  var rows = list.map(zp_row).join('');
  return '<div class="zs-page zp-page">'+
    zo_head('Admin · Catalogue '+zs_pr('19–29 · 571'), 'Products', 'প্রোডাক্ট — ছবি, রং, সাইজ, স্টক আর কম্বো',
      'নতুন প্রোডাক্ট আপলোড করুন বা পুরনোটা বদলান। "কম্বোতে দিন" টিক দিলে প্রোডাক্টটা নিজের ক্যাটাগরির অটো কম্বো রুলে ঢুকে যায় — রঙের জোড়াগুলো নিজে থেকেই তৈরি হয়। সেভ করলে দোকানে সাথে সাথে বদলায়।',
      zs_simTag('Demo · saved in this browser only')+'<a class="btn btn-primary" href="#/admin/products/new" data-testid="zp-new">'+ico('plus',16)+'New product</a>')+
    '<div class="zs-kpis k4">'+
      '<div class="zs-k"><div class="v">'+all.length+'</div><div class="l">Products</div><div class="s">'+cats.length+' categories</div></div>'+
      '<div class="zs-k ok"><div class="v">'+inCombo+'</div><div class="l">In auto combos</div><div class="s">ticked + a rule binds them</div></div>'+
      '<div class="zs-k '+(low?'warn':'')+'"><div class="v">'+low+'</div><div class="l">Sizes almost out</div><div class="s">1–2 pieces left</div></div>'+
      '<div class="zs-k '+(noPh?'warn':'')+'"><div class="v">'+noPh+'</div><div class="l">Need photos</div><div class="s">fewer than 4 (PR 25)</div></div>'+
    '</div>'+
    '<div class="zs-sbar"><div class="zs-search">'+ico('search',17)+'<input class="input zs-in" type="search" id="zp-q" placeholder="Search name, category or colour" value="'+esc(u.q)+'" data-input="zp-q" aria-label="Search products"></div>'+
      '<button type="button" class="chip'+(u.combo?' on':'')+'" data-act="zp-fcombo" aria-pressed="'+u.combo+'">'+(u.combo?ico('check',13):'')+'In combos only</button></div>'+
    '<div class="zs-tabs zp-cats"><button type="button" class="chip'+(u.cat==='all'?' on':'')+'" data-act="zp-fcat" data-c="all">All '+all.length+'</button>'+
      cats.map(function(c){ var n = all.filter(function(p){ return p.cat===c.id; }).length; return '<button type="button" class="chip'+(u.cat===c.id?' on':'')+'" data-act="zp-fcat" data-c="'+c.id+'">'+esc(c.name)+' '+n+'</button>'; }).join('')+'</div>'+
    '<section class="zs-card zp-listcard"><div class="zp-rows" id="zp-rows">'+(rows || '<div class="zs-empty">No products here.</div>')+'</div><div class="zs-empty zs-nores" id="zp-nores">No product matches.</div></section>'+
  '</div>';
}, after:function(){ zp_filter(ui('zp-list',{}).q||''); }};
function zp_row(p){
  var ic = zp_inCombos(p), n = ic.reduce(function(s,x){ return s + x.all; }, 0), h = zp_health(p);
  var srch = (p.name+' '+zp_path(p)+' '+(p.colors||[]).map(function(c){ return COL(c).name; }).join(' ')).toLowerCase();
  var sz = (p.sizes||[]).length ? (p.sizes[0]+'–'+p.sizes[p.sizes.length-1]) : 'no sizes';
  var comboTxt = p.comboOff ? '<span class="zs-mini">Not in combos</span>' : !ic.length ? '<span class="zs-mini">No combo rule for this category</span>' : '<span class="zp-in">'+n+' combo'+(n===1?'':'s')+'</span>';
  return '<div class="zp-row" data-s="'+esc(srch)+'" data-testid="zp-row-'+p.id+'">'+
    '<a class="zp-th" href="#/admin/products/'+p.id+'" aria-label="Edit '+esc(p.name)+'">'+zp_thumb(p)+'</a>'+
    '<div class="zp-main"><a class="zp-nm" href="#/admin/products/'+p.id+'">'+esc(p.name)+'</a><div class="zs-mini zp-path">'+(typeof nm_isOwn==='function' && !nm_isOwn(p) ? '<b>'+esc(nm_brand(p))+'</b> · ' : '')+esc(zp_path(p))+'</div>'+
      '<div class="zp-meta">'+ca_dots(p.colors||[])+'<span>'+(p.colors||[]).length+' colours · '+esc(sz)+'</span></div>'+
      (h.length ? '<div class="zp-health">'+h.slice(0,2).map(function(x){ return '<span class="zp-miss">'+esc(x[1])+'</span>'; }).join('')+'</div>' : '')+'</div>'+
    '<div class="zp-num"><b>'+fmt(p.price)+'</b><span class="zs-mini">'+zp_totalStock(p)+' in stock</span></div>'+
    '<div class="zp-cmb"><div class="row" style="gap:8px">'+zs_sw(!p.comboOff, 'zp-combo-tog', 'Use '+p.name+' in combos', 'data-id="'+p.id+'"')+'<span class="small bold">Combos</span></div>'+comboTxt+'</div>'+
    '<div class="zp-act"><a class="btn btn-sm btn-secondary" href="#/admin/products/'+p.id+'">'+ico('edit',14)+'Edit</a><a class="btn btn-sm btn-ghost" href="#/p/'+p.id+'" aria-label="See '+esc(p.name)+' on the shop">'+ico('eye',14)+'<span class="zo-hide-s">Shop</span></a></div>'+
  '</div>';
}
function zp_filter(q){
  q = String(q||'').toLowerCase().trim(); var n = 0;
  document.querySelectorAll('#zp-rows .zp-row').forEach(function(r){ var hit = !q || r.getAttribute('data-s').indexOf(q)>=0; r.style.display = hit?'':'none'; if(hit) n++; });
  var e = document.getElementById('zp-nores'); if(e) e.style.display = (n || !document.querySelector('#zp-rows .zp-row')) ? 'none' : 'block';
}
INPUT['zp-q'] = function(el){ ui('zp-list',{}).q = el.value; zp_filter(el.value); };
ACT['zp-fcat'] = function(el){ ui('zp-list',{}).cat = el.getAttribute('data-c'); rerender(); };
ACT['zp-fcombo'] = function(){ var u = ui('zp-list',{}); u.combo = !u.combo; rerender(); };
ACT['zp-combo-tog'] = function(el){
  var p = P(el.getAttribute('data-id')); if(!p) return;
  var rec = zp_record(p); rec.comboOff = !p.comboOff; zp_commit(rec);
  var ic = zp_inCombos(P(rec.id)), n = ic.reduce(function(s,x){ return s + x.all; }, 0);
  rerender(); toast(rec.comboOff ? p.name+' left out of combos — its pairs are hidden on the shop' : (ic.length ? p.name+' is in combos — '+n+' pairs on the shop now' : 'Ticked — make a combo rule for '+zp_path(p)+' to create pairs'));
};

/* ---------- save ---------- */
function zp_record(p){ var r = JSON.parse(JSON.stringify(p)); return r; }
function zp_commit(rec){
  var c = zo_ops().cat;
  var isSeed = ZP_SNAP.products.some(function(x){ return x.id===rec.id; });
  if(!isSeed) rec._added = true;
  c.prod[rec.id] = rec;
  zp_apply(); saveState();
}

/* ---------- editor ---------- */
function zp_draft(id){
  var key = 'zp-ed:'+id;
  if(UI[key]) return UI[key];
  var d;
  if(id==='new'){
    var cat = (CUR.query && CUR.query.cat) || 'polos';
    d = {id:'', name:'', cat:cat, sub:'', collection:'', price:0, compareAt:0, fit:'Regular fit', chart:(CAT(cat)||{}).chart || '', fabric:'', care:'', desc:'',
      colors:[], sizes:ZP_LETTER.slice(), stock:{}, photos:{}, rating:0, reviews:0, tag:'New', template:'T1', _new:true};
    d.comboOff = false;   /* ticked by default; with no rule for the category nothing is made and the form says so */
  } else {
    var p = P(id); if(!p) return null;
    d = zp_record(p); d.photos = d.photos || {}; d.stock = d.stock || {};
  }
  d._subNew = ''; d._colName = ''; d._colHex = '#2F6B5A'; d._err = {};
  UI[key] = d; return d;
}
PAGES['zp-edit'] = { layout:'admin', title:function(params){ return params[0]==='new' ? 'New product' : 'Edit product'; }, render:function(params){
  var id = params[0], d = zp_draft(id);
  if(!d) return '<div class="zs-page"><div class="zs-empty">This product does not exist. <a class="link" href="#/admin/products">All products</a></div></div>';
  var isNew = id==='new';
  return '<div class="zs-page zp-page zp-edpage">'+
    '<a class="link xs" href="#/admin/products">'+ico('back',13)+' All products</a>'+
    zo_head('Admin · Catalogue '+zs_pr(isNew?'21 · 22 · 25 · 571':'21 · 571'), isNew ? 'New product' : esc(d.name||'Product'), isNew ? 'নতুন প্রোডাক্ট আপলোড' : 'প্রোডাক্ট বদলান',
      isNew ? 'নাম, ক্যাটাগরি, দাম, রং, সাইজ আর প্রতিটা সাইজের স্টক দিন। ছবি দিলে কম্বোর ছবিতেও সেটা বসে যায়। নিচে "কম্বোতে দিন" টিক দিলে কয়টা জোড়া তৈরি হবে সেটা সাথে সাথে দেখাবে।' : 'যা বদলাবেন, "Save" চাপলে দোকানে আর কম্বোতে সাথে সাথে বদলে যাবে।',
      zs_simTag('Demo · saved in this browser only'))+
    '<div class="zp-ed">'+
      '<div class="zp-edmain">'+zp_secBasics(d)+(typeof zp_secNaming==='function' ? zp_secNaming(d) : '')+zp_secColours(d)+zp_secSizes(d)+zp_secStock(d)+zp_secPhotos(d)+'</div>'+
      '<aside class="zp-edside">'+zp_secCombo(d)+zp_secHealth(d)+(typeof zp_secBA==='function' ? zp_secBA(d) : '')+'</aside>'+
    '</div>'+
    '<div class="zp-savebar"><div class="zp-savein"><span class="zs-mini zo-hide-s" id="zp-dirty">'+(isNew?'Not saved yet':'Changes are saved only when you press Save')+'</span>'+
      '<a class="btn btn-ghost" href="#/admin/products" data-act="zp-cancel" data-id="'+id+'">Cancel</a>'+
      '<button type="button" class="btn btn-primary" data-act="zp-save" data-id="'+id+'" data-testid="zp-save">'+ico('check',16)+(isNew?'Save product':'Save changes')+'</button></div></div>'+
  '</div>';
}};
function zp_err(d, k){ return d._err && d._err[k] ? '<div class="zp-errt" role="alert">'+esc(d._err[k])+'</div>' : ''; }
function zp_field(lab, html, bn){ return '<div class="zp-f"><label class="label">'+esc(lab)+(bn?' <span class="zs-mini za-bn">'+esc(bn)+'</span>':'')+'</label>'+html+'</div>'; }
function zp_inp(d, k, type, ph, extra){ return '<input class="input zs-in" type="'+(type||'text')+'" value="'+esc(d[k]==null?'':d[k])+'" placeholder="'+esc(ph||'')+'" data-input="zp-f" data-k="'+k+'" aria-label="'+esc(k)+'"'+(type==='number'?' inputmode="numeric" min="0" step="10"':'')+(extra||'')+'>'; }
function zp_secBasics(d){
  var subs = zp_subsOf(d.cat);
  var charts = Object.keys(DB.sizeCharts||{});
  return '<section class="zs-card"><h2>Basics</h2><div class="zs-sub za-bn">নাম, ক্যাটাগরি আর দাম</div>'+
    '<div class="za-f2">'+
      zp_field('Name on site', zp_inp(d,'name','text','e.g. Ralph Lauren Solid Polo')+zp_err(d,'name')+'<div class="zs-mini za-bn mt4">কাস্টমার এই নামটাই পড়ে — কার্ড, প্রোডাক্ট পেজ, ব্যাগে।</div>', 'সাইটে নাম')+
      zp_field('Category', '<select class="input zs-in" data-change="zp-cat" aria-label="Category">'+DB.categories.map(function(c){ return '<option value="'+c.id+'"'+(c.id===d.cat?' selected':'')+'>'+esc(c.name)+'</option>'; }).join('')+'</select>', 'ক্যাটাগরি')+
      zp_field('Sub-category', '<select class="input zs-in" data-change="zp-sub" aria-label="Sub-category"><option value="">— none —</option>'+subs.map(function(s){ return '<option value="'+esc(s.id)+'"'+(s.id===d.sub?' selected':'')+'>'+esc(zp_path({cat:d.cat, sub:s.id}).split(' › ').slice(1).join(' › '))+'</option>'; }).join('')+'<option value="__new"'+(d.sub==='__new'?' selected':'')+'>+ New sub-category…</option></select>'+
        (d.sub==='__new' ? '<input class="input zs-in mt8" type="text" value="'+esc(d._subNew)+'" placeholder="New sub-category name, e.g. Solid Polo" data-input="zp-f" data-k="_subNew" aria-label="New sub-category name">'+zp_err(d,'sub') : ''), 'সাব-ক্যাটাগরি / স্টাইল')+
      zp_field('Size chart', '<select class="input zs-in" data-change="zp-chart" aria-label="Size chart"><option value="">— none —</option>'+charts.map(function(k){ return '<option value="'+esc(k)+'"'+(k===d.chart?' selected':'')+'>'+esc(DB.sizeCharts[k].name||k)+'</option>'; }).join('')+'</select>', 'সাইজ চার্ট')+
      zp_field('Price (৳)', zp_inp(d,'price','number','1100')+zp_err(d,'price'), 'দাম')+
      zp_field('Old price (৳, optional)', zp_inp(d,'compareAt','number','0 = no strike price'), 'আগের দাম')+
      zp_field('Fit', zp_inp(d,'fit','text','Regular fit'), 'ফিট')+
      zp_field('Fabric', zp_inp(d,'fabric','text','100% cotton piqué · 220 GSM'), 'কাপড়')+
    '</div>'+
    zp_field('Description', '<textarea class="input zs-in zp-ta" rows="3" data-input="zp-f" data-k="desc" aria-label="Description">'+esc(d.desc||'')+'</textarea>', 'বর্ণনা')+
  '</section>';
}
function zp_secColours(d){
  var chosen = d.colors.map(function(c){ var C = COL(c); return '<span class="zp-col on"><i style="background:'+C.hex+'"></i>'+esc(C.name)+'<button type="button" class="zp-x" data-act="zp-col" data-c="'+c+'" aria-label="Remove '+esc(C.name)+'">'+ico('close',12)+'</button></span>'; }).join('');
  var rest = Object.keys(DB.colors).filter(function(c){ return d.colors.indexOf(c)<0 && c!=='mixed'; }).map(function(c){ var C = COL(c); return '<button type="button" class="zp-col" data-act="zp-col" data-c="'+c+'"><i style="background:'+C.hex+'"></i>'+esc(C.name)+'</button>'; }).join('');
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Colours</h2><span class="zs-mini">'+d.colors.length+' chosen</span></div><div class="zs-sub za-bn">যে যে রঙে প্রোডাক্টটা আছে — কম্বোর জোড়া এই রং থেকেই তৈরি হয়</div>'+
    '<div class="zp-cols" data-testid="zp-chosen">'+(chosen || '<span class="zs-mini">No colour yet — tap one below.</span>')+'</div>'+zp_err(d,'colors')+
    '<div class="zs-mini mt12 mb8">Add a colour</div><div class="zp-cols">'+rest+'</div>'+
    '<div class="zp-newcol"><input class="input zs-in" type="text" value="'+esc(d._colName)+'" placeholder="New colour name, e.g. Teal" data-input="zp-f" data-k="_colName" aria-label="New colour name">'+
      '<input class="zp-hex" type="color" value="'+esc(d._colHex)+'" data-input="zp-f" data-k="_colHex" aria-label="New colour shade">'+
      '<button type="button" class="btn btn-sm btn-secondary" data-act="zp-newcol">'+ico('plus',14)+'Add</button></div>'+
  '</section>';
}
function zp_secSizes(d){
  var letter = zp_isLetter(d.sizes), set = letter ? ZP_LETTER : ZP_WAIST;
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Sizes</h2>'+
    '<div class="zs-tier" role="group" aria-label="Size type"><button type="button" class="'+(letter?'on':'')+'" data-act="zp-stype" data-v="letter">S – 3XL</button><button type="button" class="'+(letter?'':'on')+'" data-act="zp-stype" data-v="waist">Waist 28 – 40</button></div></div>'+
    '<div class="zs-sub za-bn">যে সাইজগুলো বানানো হয় সেগুলো চালু রাখুন</div>'+
    '<div class="zp-sizes">'+set.map(function(s){ var on = d.sizes.indexOf(s)>=0; return '<button type="button" class="size-pill'+(on?' on':'')+'" data-act="zp-size" data-s="'+s+'" aria-pressed="'+on+'">'+s+'</button>'; }).join('')+'</div>'+zp_err(d,'sizes')+
  '</section>';
}
function zp_secStock(d){
  if(!d.colors.length || !d.sizes.length) return '<section class="zs-card"><h2>Stock</h2><div class="zs-sub za-bn">রং আর সাইজ দিলে এখানে প্রতিটার স্টক দিতে পারবেন</div><div class="zs-empty">Choose colours and sizes first.</div></section>';
  var blocks = d.colors.map(function(c){
    var st = d.stock[c] || {}, C = COL(c), tot = d.sizes.reduce(function(s,z){ return s + (st[z]||0); }, 0);
    return '<div class="zp-stk"><div class="zp-stkh"><i style="background:'+C.hex+'"></i><b>'+esc(C.name)+'</b><span class="zs-mini" id="zp-tot-'+c+'">'+tot+' pcs</span></div><div class="zp-stkg">'+
      d.sizes.map(function(z){ return '<label class="zp-sk"><span>'+z+'</span><input class="input zs-in" type="number" inputmode="numeric" min="0" step="1" value="'+(st[z]||0)+'" data-input="zp-stock" data-c="'+c+'" data-s="'+z+'" aria-label="'+esc(C.name)+' '+z+' stock"></label>'; }).join('')+'</div></div>';
  }).join('');
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Stock per size</h2>'+zs_pr('19 · 195')+'</div><div class="zs-sub za-bn">প্রতিটা রঙের প্রতিটা সাইজে কয়টা আছে — ০ দিলে সেই সাইজ "Sold out" দেখাবে, কম্বোতেও</div>'+
    '<div class="zp-stks">'+blocks+'</div><div class="zs-mini mt8">In the full build this comes from the ERP by SKU (PR 195); typing here is the fallback when the ERP is off.</div></section>';
}
function zp_slot(d, key, label, col){
  var ph = col ? (d.photos[col] && d.photos[col].front) : (d.photos._shared && d.photos._shared[key]);
  var img = ph && ph.src ? '<img src="'+esc(ph.src)+'" alt="">' : (col || d.colors[0] ? garmentSVG((CAT(d.cat)||{}).garment || 'tee', COL(col || d.colors[0]).hex, key==='back'?'back':key==='detail'?'detail':'front') : '');
  var id = 'zp-up-'+(col||key);
  return '<div class="zp-slot'+(ph && ph.src?' has':'')+'"><div class="zp-slotimg">'+img+'</div><div class="zp-slotf"><span class="xs bold">'+esc(label)+'</span>'+
    '<label class="zs-link" for="'+id+'">'+(ph && ph.src?'Replace':'Upload')+'</label><input id="'+id+'" class="zp-file" type="file" accept="image/*" data-change="zp-photo" data-k="'+key+'" data-c="'+(col||'')+'" data-testid="'+id+'">'+
    (ph && ph.src ? '<button type="button" class="zs-link" data-act="zp-unphoto" data-k="'+key+'" data-c="'+(col||'')+'">Remove</button>' : '')+'</div></div>';
}
function zp_secPhotos(d){
  var n = zp_photoCount(d);
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Photos</h2><span class="zs-mini">'+n+' of 4 · '+zs_pr('22 · 25 · 575')+'</span></div>'+
    '<div class="zs-sub za-bn">প্রতিটা রঙের সামনের ছবি — কম্বোর জোড়ার ছবি এগুলো দিয়েই তৈরি হয়। আর পিছন, ক্লোজআপ, মডেলের ছবি একবার দিলেই হবে।</div>'+
    (d.colors.length ? '<div class="zs-mini mb8">Front photo per colour (used in combo pictures)</div><div class="zp-slots">'+d.colors.map(function(c){ return zp_slot(d, 'front', COL(c).name, c); }).join('')+'</div>' : '')+
    '<div class="zs-mini mt12 mb8">Other shots</div><div class="zp-slots">'+ZP_SHOTS.map(function(s){ return zp_slot(d, s[0], s[1]); }).join('')+'</div>'+
    '<div class="zs-mini mt8">Photos are shrunk in this browser for the demo. Without a photo the shop shows the drawing.</div></section>';
}
function zp_comboBlock(d){
  var sim = zp_simulate(Object.assign({}, d, {id:d.id || '__new'}));
  if(!sim.length){
    return '<div class="zp-cmbline none" data-testid="zp-pairs"><span class="za-bn">এই ক্যাটাগরিতে ('+esc(zp_path(Object.assign({}, d, {sub:d.sub==='__new'?'':d.sub})))+') এখনো কোনো অটো কম্বো রুল নেই।</span>'+
      '<a class="btn btn-sm btn-secondary mt8" href="#/admin/combos?tab=new&bind='+encodeURIComponent(d.sub && d.sub!=='__new' ? d.sub : d.cat)+'">'+ico('layers',14)+'Make a combo rule</a></div>';
  }
  return '<div class="zp-cmblines" data-testid="zp-pairs">'+sim.map(function(s){
    var on = !d.comboOff && s.rule.active;
    return '<div class="zp-cmbline'+(on?'':' off')+'"><b class="zp-big">'+s.all+'</b><div style="min-width:0"><div class="small bold za-bn">'+(d.comboOff ? 'টিক দিলে ' : '')+esc(zs_bnNum(s.all))+'টা জোড়া তৈরি '+(d.comboOff?'হবে':'হচ্ছে')+'</div>'+
      '<div class="zs-mini">in rule “'+esc(s.rule.name)+'” · '+s.rule.pieces+'-piece · '+s.vis+' with stock now'+(s.rule.active?'':' · rule is off')+'</div></div></div>';
  }).join('')+'</div>';
}
function zp_secCombo(d){
  return '<section class="zs-card zp-cmbcard"><div class="row between wrap" style="gap:8px"><h2>Combos</h2>'+zs_pr('571')+'</div>'+
    '<button type="button" class="zp-tick'+(d.comboOff?'':' on')+'" data-act="zp-tick" aria-pressed="'+(!d.comboOff)+'" data-testid="zp-tick"><span class="zs-cb">'+ico('check',14)+'</span><span><b>Use in combos</b><span class="zs-mini za-bn" style="display:block">কম্বোতে দিন — নিজের ক্যাটাগরির অটো জোড়ায় যোগ হবে</span></span></button>'+
    '<div id="zp-pairs-wrap">'+zp_comboBlock(d)+'</div>'+
    '<div class="zs-mini mt8">The number updates as you add colours, sizes or stock. A colour with no stock hides its pairs on the shop.</div></section>';
}
function zp_secHealth(d){
  var h = zp_health(d);
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Ready to go live?</h2>'+zs_pr('26 · 29')+'</div>'+
    (h.length ? '<div class="zp-hl">'+h.map(function(x){ return '<div class="zp-hli"><span class="zs-dot warn"></span><span>'+esc(x[1])+' <span class="zs-mini za-bn">· '+esc(x[2])+'</span></span></div>'; }).join('')+'</div><div class="zs-mini mt8">You can still save — these are reminders, not blocks.</div>'
      : '<div class="zp-hli"><span class="zs-dot"></span><span class="small bold">All set — photos, size chart, fabric, stock</span></div>')+
  '</section>';
}
function zp_cur(){ var id = CUR.params && CUR.params[0]; return id ? UI['zp-ed:'+id] : null; }
function zp_patchPairs(){ var d = zp_cur(), w = document.getElementById('zp-pairs-wrap'); if(d && w) w.innerHTML = zp_comboBlock(d); }
INPUT['zp-f'] = function(el){
  var d = zp_cur(); if(!d) return; var k = el.getAttribute('data-k'), v = el.value;
  if(k==='price' || k==='compareAt') v = Math.max(0, zo_int(v));
  d[k] = v; if(d._err) delete d._err[k];
  if(k==='name' || k==='price'){ clearTimeout(INPUT['zp-f']._t); INPUT['zp-f']._t = setTimeout(function(){ zp_patchPairs(); if(typeof nm_patchForm==='function') nm_patchForm(d); }, 250); }
};
INPUT['zp-stock'] = function(el){
  var d = zp_cur(); if(!d) return; var c = el.getAttribute('data-c'), s = el.getAttribute('data-s');
  d.stock[c] = d.stock[c] || {}; d.stock[c][s] = Math.max(0, zo_int(el.value));
  var t = document.getElementById('zp-tot-'+c); if(t) t.textContent = d.sizes.reduce(function(a,z){ return a + (d.stock[c][z]||0); }, 0)+' pcs';
  clearTimeout(INPUT['zp-stock']._t); INPUT['zp-stock']._t = setTimeout(zp_patchPairs, 250);
};
CHANGE['zp-cat'] = function(el){ var d = zp_cur(); if(!d) return; d.cat = el.value; d.sub = ''; var c = CAT(d.cat); if(c && c.chart && !d.chart) d.chart = c.chart; if(c && c.group==='bottom' && zp_isLetter(d.sizes) && d._new){ d.sizes = ['30','32','34','36']; d.stock = {}; } rerender(); };
CHANGE['zp-sub'] = function(el){ var d = zp_cur(); if(!d) return; d.sub = el.value; rerender(); };
CHANGE['zp-chart'] = function(el){ var d = zp_cur(); if(!d) return; d.chart = el.value; rerender(); };
ACT['zp-col'] = function(el){ var d = zp_cur(); if(!d) return; var c = el.getAttribute('data-c'), i = d.colors.indexOf(c); if(i>=0) d.colors.splice(i,1); else { d.colors.push(c); if(!d.stock[c]) d.stock[c] = {}; } if(d._err) delete d._err.colors; rerender(); };
ACT['zp-newcol'] = function(){
  var d = zp_cur(); if(!d) return; var name = String(d._colName||'').trim(); if(!name){ toast('Write the colour name first'); return; }
  var id = zo_slug(name).replace(/-/g,''); if(!id){ toast('Use English letters for the colour name'); return; }
  if(DB.colors[id] && DB.colors[id].name.toLowerCase()!==name.toLowerCase()) id = id+'2';
  zo_ops().cat.colors[id] = {name:name, hex:d._colHex||'#777777'}; DB.colors[id] = {name:name, hex:d._colHex||'#777777'}; saveState();
  if(d.colors.indexOf(id)<0) d.colors.push(id); d.stock[id] = d.stock[id] || {}; d._colName = ''; rerender(); toast(name+' added — set its stock below');
};
ACT['zp-stype'] = function(el){ var d = zp_cur(); if(!d) return; var letter = el.getAttribute('data-v')==='letter'; if(letter===zp_isLetter(d.sizes)) return; d.sizes = letter ? ZP_LETTER.slice() : ['30','32','34','36']; rerender(); };
ACT['zp-size'] = function(el){ var d = zp_cur(); if(!d) return; var s = el.getAttribute('data-s'), set = zp_isLetter(d.sizes) && /[A-Z]/.test(s) ? ZP_LETTER : ZP_WAIST, i = d.sizes.indexOf(s);
  if(i>=0) d.sizes.splice(i,1); else { d.sizes.push(s); d.sizes.sort(function(a,b){ return set.indexOf(a)-set.indexOf(b); }); } if(d._err) delete d._err.sizes; rerender(); };
ACT['zp-tick'] = function(){ var d = zp_cur(); if(!d) return; d.comboOff = !d.comboOff; rerender(); };
CHANGE['zp-photo'] = function(el){
  var d = zp_cur(); if(!d || !el.files || !el.files[0]) return;
  var k = el.getAttribute('data-k'), c = el.getAttribute('data-c'), f = el.files[0];
  if(!/^image\//.test(f.type)){ toast('That file is not a picture'); return; }
  var rd = new FileReader();
  rd.onload = function(){
    var img = new Image();
    img.onload = function(){
      var max = 480, s = Math.min(1, max/Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width*s)); cv.height = Math.max(1, Math.round(img.height*s));
      var x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,cv.width,cv.height); x.drawImage(img, 0, 0, cv.width, cv.height);
      var src = cv.toDataURL('image/jpeg', .78);
      if(c){ d.photos[c] = d.photos[c] || {}; d.photos[c].front = {src:src}; } else { d.photos._shared = d.photos._shared || {}; d.photos._shared[k] = {src:src}; }
      rerender(); toast('Photo added — press Save to put it on the shop');
    };
    img.onerror = function(){ toast('Could not read that picture'); };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
};
ACT['zp-unphoto'] = function(el){ var d = zp_cur(); if(!d) return; var k = el.getAttribute('data-k'), c = el.getAttribute('data-c'); if(c){ if(d.photos[c]) delete d.photos[c].front; } else if(d.photos._shared) delete d.photos._shared[k]; rerender(); };
ACT['zp-cancel'] = function(el){ delete UI['zp-ed:'+el.getAttribute('data-id')]; go('#/admin/products'); };
ACT['zp-save'] = function(el){
  var id = el.getAttribute('data-id'), d = UI['zp-ed:'+id]; if(!d) return;
  var err = {};
  if(!String(d.name||'').trim()) err.name = 'Give the product a name';
  if(!(d.price>0)) err.price = 'Enter the price';
  if(!d.colors.length) err.colors = 'Choose at least one colour';
  if(!d.sizes.length) err.sizes = 'Choose at least one size';
  if(d.sub==='__new' && !String(d._subNew||'').trim()) err.sub = 'Write the new sub-category name';
  /* PR 590: only a link already in use blocks; a brand name never does */
  if(typeof nm_check==='function'){ var ne = nm_check(d); Object.keys(ne).forEach(function(k){ err[k] = ne[k]; }); }
  d._err = err;
  if(Object.keys(err).length){ rerender(); toast('Please fill the marked boxes'); var e = document.querySelector('.zp-errt'); if(e) e.scrollIntoView({block:'center'}); return; }
  var c = zo_ops().cat;
  if(d.sub==='__new'){
    var sid = d.cat+'/'+zo_slug(d._subNew);
    if(!(DB.subcats||[]).some(function(s){ return s.id===sid; })) c.subcats.push({id:sid, name:String(d._subNew).trim(), parent:d.cat});
    d.sub = sid;
  }
  var rec = {};
  Object.keys(d).forEach(function(k){ if(k.charAt(0)!=='_') rec[k] = d[k]; });
  rec.name = String(rec.name).trim(); rec.price = +rec.price||0; rec.compareAt = +rec.compareAt||0;
  if(!rec.style && rec.sub) rec.style = zp_subName(rec.sub);
  if(id==='new'){
    var base = 'np-'+(zo_slug(rec.name)||uid()), nid = base, i = 2; while(P(nid)) nid = base+'-'+(i++);
    rec.id = nid; delete rec._new;
  }
  /* stock only for the chosen colours and sizes */
  var st = {}; rec.colors.forEach(function(col){ st[col] = {}; rec.sizes.forEach(function(z){ st[col][z] = ((d.stock||{})[col]||{})[z]||0; }); }); rec.stock = st;
  /* PR 590: settle the link; a changed link keeps the old one forwarding */
  var nmMsg = typeof nm_onSave==='function' ? nm_onSave(rec, d) : '';
  zp_commit(rec);
  delete UI['zp-ed:'+id];
  var ic = zp_inCombos(P(rec.id)), n = ic.reduce(function(s,x){ return s + x.all; }, 0);
  go('#/admin/products'); toast('Saved — live on the shop'+(ic.length && !rec.comboOff ? ' · '+n+' combo pairs' : '')+nmMsg);
};
