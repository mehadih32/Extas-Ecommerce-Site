/* =====================================================================
   95-admin-naming.js — ভান্ডারী Bhandari A360-03 (with দূত Doot A360-06)
   PR 590 · Product naming and URL control (owner 19 Oct 12:04, changed 12:07)
   #/admin/naming              Naming & links: products · templates · bulk
                               rename · redirects · settings
   + a "Name, link & Google" section in the product form (90-admin-catalog.js)

   OWNER'S DECISION (12:07): brand names STAY. EXTAS sells other brands'
   products and names the brand. Each product has a `brand` field (its real
   brand, e.g. "Ralph Lauren"); no brand = own label (the shop's own brand,
   a setting, default "EXTAS"). The brand feeds the brand line on cards and
   the product page (a setting), the Product markup and the Google/Meta feed.
   The "other brand's name" warning is a setting, OFF by default, and never
   blocks a save.

   Nothing fixed in code: per product the owner sets the name on the site,
   the link (slug), SEO title, meta description, feed/ad title and brand;
   shop-wide templates with tokens ({brand} {name} {style} {type} {cat}
   {colour} {colours} {price} {fit} {shop}) fill them, with a preview of
   every change before saving.

   A CHANGED LINK NEVER BREAKS: the old slug is kept and forwards to the new
   one (301 in the real build; here the demo route forwards). Redirect
   targets point at the PRODUCT, not at a slug, so there are never chains.
   The same list holds the WordPress migration map (PR 587, PR 235).

   DEMO ONLY: everything lives in ST.naming (this browser). Visits, orders
   and redirect hits are simulated and say so.
   Hooks (integrated into the shop by Sawdagor, 19 Oct — no wrappers left):
     · parseHash (02-core.js) calls nm_resolve — old links and slugs land on the product page
     · productCard (02-core.js) / pdp_header (30-product.js) print nm_brandLine
     · PAGES.product.after (30-product.js) calls nm_ldPut — Product JSON-LD (demo)
   Prefix nm_. CSS: r12-zname.css.
   ===================================================================== */

zo_route(/^\/admin\/naming$/, 'nm-page');
zo_link(['Naming & links','#/admin/naming','link', null]);

/* ---------- defaults (all editable in Settings › Naming & links) ---------- */
var NM_DEF = {
  showBrand:true,                 /* brand line above the name on cards + product page */
  showOwn:false,                  /* ...also for own-label items */
  ownBrand:'EXTAS',               /* own-label brand = {shop} */
  domain:'extas.com.bd',          /* shown in link and Google previews */
  warnOn:false,                   /* owner 12:07: off by default */
  warnList:'Ralph Lauren, Polo Ralph Lauren, Tommy Hilfiger, Lacoste, Hugo Boss, Boss, Calvin Klein, Levi\'s, Zara, H&M, Gucci, Prada, Armani, Diesel, Nike, Adidas, Puma, Uniqlo',
  tplSlug:'{brand}-{style}',
  tplSeo:'{name} — {price} | {shop}',
  tplMeta:'{name} in {colours}. {fit}. Cash on delivery all over Bangladesh, size exchange.',
  tplFeed:'{brand} {name} {colour}'
};
var NM_TOKENS = [['{brand}','brand'],['{name}','name on site'],['{style}','style'],['{type}','type (Polo)'],['{cat}','category'],['{colour}','first colour'],['{colours}','all colours'],['{price}','price'],['{fit}','fit'],['{shop}','shop name']];
var NM_FIELDS = [
  ['slug','Link (slug)','লিংক','tplSlug'],
  ['seoTitle','SEO title','গুগলের শিরোনাম','tplSeo'],
  ['metaDesc','Meta description','গুগলের ছোট লেখা','tplMeta'],
  ['feedTitle','Feed / ad title','গুগল/ফেসবুক ফিডের নাম','tplFeed']
];
var NM_LIM = {seoTitle:60, metaDesc:155, feedTitle:150};
var NM_DAY = 86400000;

/* ---------- state ---------- */
function nm_st(){
  if(!ST.naming) ST.naming = {opt:{}, redirects:nm_seedRedirects(), renames:nm_seedRenames()};
  var n = ST.naming; n.opt = n.opt || {}; n.redirects = n.redirects || []; n.renames = n.renames || [];
  return n;
}
function nm_opt(k){ var o = (ST && ST.naming && ST.naming.opt) || {}; return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : NM_DEF[k]; }
function nm_optSet(k, v){ nm_st().opt[k] = v; saveState(); }
function nm_optReset(k){ delete nm_st().opt[k]; saveState(); }
/* write through the Settings framework when it is there, so badges stay right */
function nm_setOpt(k, v){ var s = (typeof zs_S==='function') ? zs_S('nm.'+k) : null; if(s && typeof zs_commit==='function') zs_commit(s, v); else nm_optSet(k, v); }
function nm_seedRedirects(){
  var t = Date.now();
  return [
    {from:'/product/ralph-lauren-polo-black/', pid:'rl-solid-polo', kind:'wp', demo:true, at:t, hits:0, on:true},
    {from:'/product/lacoste-polo-white/', pid:'lc-classic-polo', kind:'wp', demo:true, at:t, hits:0, on:true},
    {from:'/product-category/polo-shirts/ralph-lauren-polo/', to:'/polo-shirts', hash:'#/c/polos', kind:'wp', demo:true, at:t, hits:0, on:true},
    {from:'/product-category/t-shirt/combo/', to:'/combos', hash:'#/combos', kind:'wp', demo:true, at:t, hits:0, on:true},
    {from:'/p/rl-pique-polo-slim', pid:'rl-pique-polo', kind:'slug', demo:true, at:t - 21*NM_DAY, hits:0, on:true}
  ];
}
function nm_seedRenames(){
  return [{pid:'rl-pique-polo', at:Date.now() - 21*NM_DAY, oldName:'RL Pique Polo Slim', newName:'Ralph Lauren Piqué Polo', oldSlug:'rl-pique-polo-slim', newSlug:'rl-pique-polo', demo:true}];
}

/* ---------- small text helpers ---------- */
function nm_re(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function nm_slug(s){
  s = String(s||''); try{ s = s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }catch(e){}
  return s.toLowerCase().replace(/['’`]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/-{2,}/g,'-').replace(/^-+|-+$/g,'').slice(0,70).replace(/-+$/,'');
}
function nm_has(text, word){ if(!word) return false; return new RegExp('(^|[^a-z0-9])'+nm_re(String(word).toLowerCase())+'($|[^a-z0-9])').test(String(text||'').toLowerCase()); }
function nm_single(n){ n = String(n||''); if(/ies$/i.test(n)) return n.slice(0,-3)+'y'; if(/[^s]s$/i.test(n)) return n.slice(0,-1); return n; }
function nm_count(n){ return zs_bnNum(n); }

/* ---------- a product's brand, link and titles ---------- */
function nm_own(){ return String(nm_opt('ownBrand')||'').trim() || 'EXTAS'; }
function nm_brand(p){ return String((p && p.brand)||'').trim() || nm_own(); }
function nm_isOwn(p){ return !p || !String(p.brand||'').trim() || String(p.brand).trim().toLowerCase()===nm_own().toLowerCase(); }
function nm_slugOf(p){ return (p && p.slug) || (p && p.id) || ''; }
function nm_stripBrand(name, brand){ var n = String(name||''); if(brand && n.toLowerCase().indexOf(brand.toLowerCase()+' ')===0) n = n.slice(brand.length+1); return n; }
function nm_tokens(p){
  var cat = CAT(p.cat) || {name:''}, brand = nm_brand(p);
  var style = String(p.style || (p.sub && typeof zp_subName==='function' ? zp_subName(p.sub) : '') || nm_stripBrand(p.name, brand) || '');
  if(p.sub && !p.style && typeof zp_subName==='function' && /\//.test(p.sub) && zp_subName(p.sub).toLowerCase()===brand.toLowerCase()) style = nm_stripBrand(p.name, brand);
  var cols = (p.colors||[]).map(function(c){ return COL(c).name; });
  return {brand:brand, name:String(p.name||''), style:style, type:nm_single(cat.name), cat:cat.name, colour:cols[0]||'',
    colours: cols.length>3 ? cols.slice(0,3).join(', ')+' +'+(cols.length-3) : cols.join(', '),
    price: p.price ? fmt(p.price) : '', fit:String(p.fit||''), shop:nm_own()};
}
/* fill a template; "Ralph Lauren Ralph Lauren Solid Polo" collapses to one brand */
function nm_tpl(t, p, asSlug){
  var tk = nm_tokens(p);
  var out = String(t||'').replace(/\{(\w+)\}/g, function(m, k){ return Object.prototype.hasOwnProperty.call(tk, k) ? tk[k] : m; });
  if(tk.brand){ var b = nm_re(tk.brand); out = out.replace(new RegExp('('+b+')[\\s\\-]+'+b+'(?=$|[^A-Za-z0-9])', 'gi'), '$1'); }
  /* a word twice in a row ("Pique Polo Polo", "polo-polo") is said once */
  if(asSlug){ var s = nm_slug(out), bs = nm_slug(tk.brand); if(bs) s = s.replace(new RegExp('(^|-)'+nm_re(bs)+'-'+nm_re(bs)+'(?=-|$)'), '$1'+bs); return s.replace(/(^|-)((?:[a-z0-9]+-){0,2}[a-z0-9]+)(?:-\2)+(?=-|$)/g, '$1$2'); }
  out = out.replace(/(^|\s)(\S+(?:\s\S+){0,2})(?:\s+\2)+(?=\s|$)/gi, '$1$2');
  return out.replace(/\s{2,}/g,' ').replace(/\s+([,.])/g,'$1').replace(/^[\s,.|—-]+|[\s,|—-]+$/g,'').trim();
}
function nm_val(p, k){
  if(k==='slug') return nm_slugOf(p);
  if(p[k]) return p[k];
  var f = NM_FIELDS.filter(function(x){ return x[0]===k; })[0];
  return f ? nm_tpl(nm_opt(f[3]), p) : '';
}
function nm_src(p, k){ if(k==='slug') return p.slug ? 'own' : 'id'; return p[k] ? 'own' : 'tpl'; }
function nm_url(slug){ return (String(nm_opt('domain')||'').trim() || 'yoursite.com').replace(/^https?:\/\//,'').replace(/\/+$/,'')+'/p/'+slug; }

/* ---------- the "other brand's name" warning (a setting, off by default) ---------- */
function nm_brandList(){ return String(nm_opt('warnList')||'').split(/[,\n]/).map(function(x){ return x.trim(); }).filter(Boolean); }
/* brands from the list found in the text — the product's own brand never counts */
function nm_brandHits(text, own, isSlug){
  if(!nm_opt('warnOn') || !text) return [];
  var ownS = nm_slug(own||''), hay = '-'+nm_slug(text)+'-', out = [];
  nm_brandList().forEach(function(b){
    var bs = nm_slug(b); if(!bs) return;
    if(ownS && (ownS.indexOf(bs)>=0 || bs.indexOf(ownS)>=0)) return;
    var hit = isSlug ? hay.indexOf('-'+bs+'-')>=0 : nm_has(String(text).replace(/['’]/g,''), String(b).replace(/['’]/g,''));
    if(hit && out.indexOf(b)<0) out.push(b);
  });
  return out;
}
function nm_warnsFor(p){
  if(!nm_opt('warnOn')) return [];
  var own = nm_brand(p), out = [];
  [['name','Name on site', p.name, false], ['slug','Link', nm_slugOf(p), true], ['seoTitle','SEO title', nm_val(p,'seoTitle'), false], ['feedTitle','Feed title', nm_val(p,'feedTitle'), false]].forEach(function(f){
    var h = nm_brandHits(f[2], own, f[3]); if(h.length) out.push({k:f[0], label:f[1], brands:h});
  });
  return out;
}
function nm_warnHTML(w){
  if(!w.length) return '';
  return '<div class="zs-note warn nm-warn" role="status">'+ico('info',17)+'<div class="zs-bnp"><b class="za-bn">অন্য ব্র্যান্ডের নাম আছে — শুধু জানিয়ে রাখা হলো, সেভ করতে পারবেন।</b>'+
    '<div class="zs-mini">'+w.map(function(x){ return esc(x.label)+': '+esc(x.brands.join(', ')); }).join(' · ')+' · the warning can be turned off in Settings</div></div></div>';
}

/* ---------- redirects ---------- */
function nm_norm(path){
  path = String(path||'').trim(); try{ path = decodeURIComponent(path); }catch(e){}
  path = path.replace(/^https?:\/\/[^\/]+/i,'').replace(/^#/,'').split('?')[0];
  if(path.charAt(0)!=='/') path = '/'+path;
  path = path.replace(/\/+$/,'');
  return (path || '/').toLowerCase();
}
function nm_rTo(r){ if(r.pid){ var p = P(r.pid); return p ? '/p/'+nm_slugOf(p) : ''; } return r.to || '/'; }
function nm_rHash(r){ if(r.pid){ var p = P(r.pid); return p ? '#/p/'+nm_slugOf(p) : ''; } return r.hash || ('#'+(r.to||'/')); }
function nm_findR(path){
  var n = nm_norm(path), list = (typeof ST!=='undefined' && ST) ? nm_st().redirects : []; /* R15d: set up the redirect list for customers too */
  for(var i=0;i<list.length;i++){ var r = list[i]; if(r.on!==false && nm_norm(r.from)===n) return r; }
  return null;
}
function nm_bySlug(s){ s = String(s||'').toLowerCase(); for(var i=0;i<DB.products.length;i++) if(DB.products[i].slug && DB.products[i].slug===s) return DB.products[i]; return null; }
/* the old link is kept and forwards to the product (whatever its link is now) */
function nm_moveSlug(pid, oldSlug, newSlug){
  if(!oldSlug || oldSlug===newSlug) return null;
  var st = nm_st(), now = Date.now();
  st.redirects.forEach(function(r){ if(r.on!==false && nm_norm(r.from)===nm_norm('/p/'+newSlug)){ r.on = false; r.note = 'Link in use again'; } });
  var ex = st.redirects.filter(function(r){ return nm_norm(r.from)===nm_norm('/p/'+oldSlug); })[0];
  if(ex){ ex.pid = pid; delete ex.to; delete ex.hash; ex.on = true; ex.at = now; ex.kind = ex.kind || 'slug'; delete ex.note; return ex; }
  var r = {from:'/p/'+oldSlug, pid:pid, kind:'slug', at:now, hits:0, on:true};
  st.redirects.unshift(r); return r;
}
/* a link may be used once: not another product's link or id, not a link forwarding elsewhere */
function nm_slugClash(slug, pid){
  if(!slug) return '';
  for(var i=0;i<DB.products.length;i++){ var q = DB.products[i]; if(q.id!==pid && (nm_slugOf(q)===slug || q.id===slug)) return 'This link is already used by “'+q.name+'”'; }
  var r = nm_findR('/p/'+slug); if(r && r.pid && r.pid!==pid){ var t = P(r.pid); return 'This old link already forwards to “'+(t?t.name:r.pid)+'”'; }
  return '';
}
function nm_uniqueSlug(base, pid){ var s = base || 'product', i = 2; while(nm_slugClash(s, pid)) s = base+'-'+(i++); return s; }
function nm_hits(r){
  var sim = r.kind==='wp' || r.demo ? zo_rnd('nmh'+r.from, 12, 140) : Math.round(Math.max(0, (Date.now() - (r.at||Date.now()))/NM_DAY) * zo_rnd('nmh'+r.from, 1, 6));
  return sim + (r.hits||0);
}

/* the router hook: an old link or a slug opens the right product page.
   history.replaceState, never a new entry — Back stays one step (lessons) */
function nm_resolve(r, depth){
  if(!ST || !r || depth>3 || /^\/admin(\/|$)/.test(r.path||'')) return null;
  if(r.page==='product' && !P(r.params[0])){
    var bs = nm_bySlug(r.params[0]); if(bs) return {page:'product', params:[bs.id], query:r.query, path:r.path};
  }
  if(r.page==='product' && P(r.params[0]) && !P(r.params[0]).slug) return null;
  if(r.page!=='notfound' && r.page!=='product') return null;
  var hit = nm_findR(r.path); if(!hit) return null;
  var to = nm_rHash(hit); if(!to || nm_norm(to)===nm_norm(r.path)) return null;
  hit.hits = (hit.hits||0) + 1;
  try{ history.replaceState(history.state, '', location.href.split('#')[0] + to); }catch(e){ return null; }
  try{ if(typeof NAVS!=='undefined' && NAVS.cur){ NAVS.cur.h = to; if(NAVS.E && NAVS.E[NAVS.cur.id]) NAVS.E[NAVS.cur.id].h = to; } }catch(e){}
  try{ saveState(); }catch(e){}
  if(UI.nmTry){ var was = UI.nmTry; delete UI.nmTry; setTimeout(function(){ toast('Old link '+was+' → forwarded to '+nm_rTo(hit)); }, 60); }
  var again = parseHashRaw();
  return nm_resolve(again, (depth||0)+1) || again;
}
/* (parseHash in 02-core.js calls nm_resolve itself — the wrapper is gone) */

/* ---------- brand line on cards + product page (setting) ---------- */
function nm_brandLine(p){
  if(!p || !nm_opt('showBrand')) return '';
  if(nm_isOwn(p) && !nm_opt('showOwn')) return '';
  var b = nm_brand(p);
  return nm_has(p.name, b) ? '' : b;   /* the name already says it */
}
/* productCard, pdp_header and PAGES.product.after print the brand line and
   call nm_ldPut themselves now (02-core.js, 30-product.js); only the clean-up
   of the Product markup when leaving a product page stays here. */
window.addEventListener('hashchange', function(){ if(CUR && CUR.page!=='product'){ var s = document.getElementById('nm-ld'); if(s) s.remove(); } });
function nm_ld(p){
  return {'@context':'https://schema.org', '@type':'Product', name:p.name, description:nm_val(p,'metaDesc'), sku:p.id,
    brand:{'@type':'Brand', name:nm_brand(p)}, url:'https://'+nm_url(nm_slugOf(p)),
    offers:{'@type':'Offer', priceCurrency:'BDT', price:String(p.price||0), availability:'https://schema.org/'+(typeof zp_totalStock==='function' && !zp_totalStock(p) ? 'OutOfStock' : 'InStock')}};
}
function nm_ldPut(p){
  var s = document.getElementById('nm-ld'); if(!p){ if(s) s.remove(); return; }
  if(!s){ s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'nm-ld'; document.head.appendChild(s); }
  s.textContent = JSON.stringify(nm_ld(p));
}

/* ---------- before / after a rename (simulated) ---------- */
function nm_ba(rn){
  var seed = 'nmba|'+rn.pid+'|'+rn.at, base = zo_rnd(seed+'b', 14, 46), lift = 0.96 + zs_rnd(seed+'l')*0.22, days = [];
  for(var i=0;i<28;i++) days.push(Math.max(1, Math.round(base * (i<14 ? 1 : lift) * (0.8 + zs_rnd(seed+'|'+i)*0.4))));
  var sum = function(a){ return a.reduce(function(s,x){ return s+x; }, 0); };
  var vb = sum(days.slice(0,14)), va = sum(days.slice(14)), conv = 0.022 + zs_rnd(seed+'c')*0.018;
  var ob = Math.max(1, Math.round(vb*conv)), oa = Math.max(0, Math.round(va*conv*(0.95 + zs_rnd(seed+'o')*0.1)));
  return {days:days, vb:vb, va:va, ob:ob, oa:oa, elapsed:Math.min(14, Math.floor((Date.now()-rn.at)/NM_DAY))};
}
function nm_pct(a, b){ if(!a) return '—'; var d = Math.round((b-a)/a*1000)/10; return (d>0?'+':'')+d+'%'; }
function nm_lastRename(pid){ var l = nm_st().renames.filter(function(r){ return r.pid===pid; }); return l.length ? l[l.length-1] : null; }
function nm_baCard(rn){
  var p = P(rn.pid); if(!p) return '';
  var b = nm_ba(rn), lvl = (b.oa >= b.ob && b.va >= b.vb*0.97) ? 'ok' : (b.oa >= b.ob*0.85 && b.va >= b.vb*0.9) ? 'mid' : 'warn';
  var verd = {ok:'বিক্রি কমেনি — নাম/লিংক বদলানোয় সমস্যা হয়নি।', mid:'সামান্য কম — এটুকু স্বাভাবিক ওঠানামা, আরো এক সপ্তাহ দেখুন।', warn:'পরের ১৪ দিনে বেশ কম — সার্চ কনসোলে পুরনো লিংকগুলো দেখে নিন।'}[lvl];
  return '<div class="nm-ba" data-testid="nm-ba-'+rn.pid+'"><div class="nm-bah"><div class="small bold nm-1l">'+esc(p.name)+'</div>'+
      '<div class="zs-mini nm-1l">'+esc(rn.oldName)+(rn.oldName!==rn.newName?' → '+esc(rn.newName):'')+(rn.oldSlug && rn.oldSlug!==rn.newSlug ? ' · link changed' : '')+'</div>'+
      '<div class="nm-bat"><span class="zs-mini">'+new Date(rn.at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})+'</span>'+zs_simTag(rn.demo ? 'Demo · example' : 'Demo · simulated')+'</div></div>'+
    '<div class="nm-bag"><div><div class="zs-mini">Organic visits</div><div class="nm-bav"><span>'+b.vb+'</span>'+ico('right',13)+'<b>'+b.va+'</b></div><div class="zs-mini '+(b.va>=b.vb?'nm-up':'nm-dn')+'">'+nm_pct(b.vb, b.va)+'</div></div>'+
      '<div><div class="zs-mini">Orders</div><div class="nm-bav"><span>'+b.ob+'</span>'+ico('right',13)+'<b>'+b.oa+'</b></div><div class="zs-mini '+(b.oa>=b.ob?'nm-up':'nm-dn')+'">'+nm_pct(b.ob, b.oa)+'</div></div></div>'+
    '<div class="nm-spk">'+zs_spark(b.days)+'<i aria-hidden="true"></i></div><div class="nm-spl zs-mini"><span>14 days before</span><span>14 days after</span></div>'+
    '<div class="zs-mini za-bn nm-verd '+lvl+'">'+verd+'</div></div>';
}

/* ---------- settings rows (Settings › Naming & links) ---------- */
(function(){
  if(typeof ZS_SETTINGS==='undefined' || typeof ZS_GROUPS==='undefined') return;
  var row = function(k, en, bn, type, where, see, extra){
    var s = {id:'nm.'+k, g:'naming', en:en, bn:bn, type:type, where:where, see:see||'',
      get:function(){ return nm_opt(k); }, set:function(v){ nm_optSet(k, type==='sw' ? !!v : v); }, def:function(){ return NM_DEF[k]; }, reset:function(){ nm_optReset(k); }};
    if(extra) for(var x in extra) s[x] = extra[x];
    return s;
  };
  [
    row('showBrand', 'Show the brand above the product name', 'কার্ড আর প্রোডাক্ট পেজে নামের উপরে ব্র্যান্ড দেখাবে (নামে আগে থেকেই থাকলে আর দেখায় না)', 'sw', 'Product cards · Product page', '#/c/sweaters'),
    row('showOwn', 'Also show it for own-label items', 'নিজের লেবেলের প্রোডাক্টেও ব্র্যান্ড (যেমন EXTAS) দেখাবে', 'sw', 'Product cards · Product page', '#/c/polos'),
    row('ownBrand', 'Own-label brand name', 'নিজের লেবেলের ব্র্যান্ড — যে প্রোডাক্টে ব্র্যান্ড দেওয়া নেই, সেখানে এটা বসে ({shop} টোকেনও এটা)', 'text', 'Feed · Product markup · Templates'),
    row('domain', 'Shop web address (for previews)', 'দোকানের ওয়েব ঠিকানা — লিংক আর গুগল প্রিভিউতে দেখায়', 'text', 'Admin previews only', '', {tier:'store'}),
    row('warnOn', 'Warn when another brand\'s name is in a name, link or title', 'নাম, লিংক বা শিরোনামে অন্য ব্র্যান্ডের নাম থাকলে হলুদ নোট — শুধু জানায়, আটকায় না (বন্ধ রাখা আছে)', 'sw', 'Product form · Naming & links'),
    row('warnList', 'Brand names to warn about (comma separated)', 'যে ব্র্যান্ডগুলোর নাম থাকলে নোট দেখাবে — কমা দিয়ে আলাদা', 'text', 'Product form · Naming & links'),
    row('tplSlug', 'Link template', 'লিংকের টেমপ্লেট — যেমন {brand}-{style}', 'text', 'Naming & links › Templates', '#/admin/naming?tab=templates'),
    row('tplSeo', 'SEO title template', 'গুগলের শিরোনামের টেমপ্লেট', 'text', 'Naming & links › Templates', '#/admin/naming?tab=templates'),
    row('tplMeta', 'Meta description template', 'গুগলের ছোট লেখার টেমপ্লেট', 'text', 'Naming & links › Templates', '#/admin/naming?tab=templates'),
    row('tplFeed', 'Feed / ad title template', 'গুগল/ফেসবুক ফিডের নামের টেমপ্লেট', 'text', 'Naming & links › Templates', '#/admin/naming?tab=templates')
  ].forEach(function(r){ if(!zs_S(r.id)) ZS_SETTINGS.push(r); });
  var g = ['naming', 'Naming & links', 'নাম, লিংক, ব্র্যান্ড আর গুগল/ফেসবুকের নাম', '590'];
  if(!ZS_GROUPS.some(function(x){ return x[0]===g[0]; })){
    var at = -1; ZS_GROUPS.forEach(function(x, i){ if(x[0]==='install') at = i; });
    if(at>=0) ZS_GROUPS.splice(at, 0, g); else ZS_GROUPS.push(g);
  }
})();

/* =====================================================================
   PRODUCT FORM SECTION (called from 90-admin-catalog.js)
   ===================================================================== */
function nm_draftInit(d){ if(d._nm) return; d._nm = true; d._slug0 = d._new ? '' : nm_slugOf(d); }
function nm_draftSlug(d){
  var typed = d.slug!=null && String(d.slug).trim()!=='' ? nm_slug(d.slug) : '';
  if(typed) return typed;
  if(d._new) return nm_tpl(nm_opt('tplSlug'), Object.assign({}, d, {name:d.name||'new product'}), true);
  return d._slug0 || nm_slugOf(d);
}
function nm_cnt(k, v){ var L = NM_LIM[k]; if(!L) return ''; var n = String(v||'').length; return '<span class="zs-mini zb-cnt'+(n>L?' nm-over':'')+'" id="nm-c-'+k+'">'+n+' / '+L+'</span>'; }
function nm_brands(){ var o = {}; DB.products.forEach(function(p){ if(p.brand) o[p.brand] = 1; }); nm_brandList().forEach(function(b){ o[b] = 1; }); delete o[nm_own()]; return Object.keys(o).sort(); }
function zp_secNaming(d){
  nm_draftInit(d);
  var tmp = Object.assign({}, d), ph = {};
  ['seoTitle','metaDesc','feedTitle'].forEach(function(k){ var f = NM_FIELDS.filter(function(x){ return x[0]===k; })[0]; ph[k] = nm_tpl(nm_opt(f[3]), Object.assign({}, tmp, {seoTitle:'', metaDesc:'', feedTitle:''})); });
  var slugVal = d.slug!=null && d.slug!=='' ? d.slug : (d._new ? '' : d._slug0);
  var lab = function(t, bn, k, v){ return '<label class="label" for="nm-'+k+'">'+esc(t)+' <span class="zs-mini za-bn">'+esc(bn)+'</span>'+(k in NM_LIM ? ' '+nm_cnt(k, v) : '')+'</label>'; };
  return '<section class="zs-card nm-sec" id="zp-naming" data-testid="nm-sec"><div class="row between wrap" style="gap:8px"><h2>Name, link &amp; Google</h2>'+zs_pr('590')+'</div>'+
    '<div class="zs-sub za-bn">সাইটে নাম ("Basics"-এ) কাস্টমার পড়ে · লিংক হলো পেজের ঠিকানা · ফিডের নাম গুগল/ফেসবুক দেখে। খালি রাখলে দোকানের টেমপ্লেট থেকে নিজে বসবে।</div>'+
    '<div id="nm-warnbox">'+nm_warnHTML(nm_warnsFor(Object.assign({}, d, {slug:nm_draftSlug(d)})))+'</div>'+
    '<div class="za-f2">'+
      '<div class="zp-f">'+lab('Brand','ব্র্যান্ড','brand')+'<input id="nm-brand" class="input zs-in" type="text" list="nm-brands" value="'+esc(d.brand||'')+'" placeholder="'+esc(nm_own())+' (own label)" data-input="nm-f" data-k="brand" autocomplete="off">'+
        '<datalist id="nm-brands">'+nm_brands().map(function(b){ return '<option value="'+esc(b)+'">'; }).join('')+'</datalist>'+
        '<div class="zs-mini za-bn mt4">প্রোডাক্টটা কোন ব্র্যান্ডের, যেমন Ralph Lauren। নিজের লেবেলের হলে খালি রাখুন — '+esc(nm_own())+' বসবে। গুগল আর ফেসবুক এটাকেই ব্র্যান্ড ধরে।</div></div>'+
      '<div class="zp-f">'+lab('Link (slug)','লিংক — পেজের ঠিকানা','slug')+'<div class="zb-slug"><span class="zs-mini">/p/</span><input id="nm-slug" class="input zs-in" type="text" value="'+esc(slugVal)+'" placeholder="'+esc(nm_draftSlug(Object.assign({}, d, {slug:''})))+'" data-input="nm-f" data-change="nm-slugfix" data-k="slug" autocomplete="off" spellcheck="false" data-testid="nm-slug"></div>'+zp_err(d,'slug')+
        '<div class="nm-url" id="nm-url" data-testid="nm-url">'+ico('link',13)+'<span>'+esc(nm_url(nm_draftSlug(d)))+'</span></div>'+
        '<div id="nm-redir">'+nm_redirNote(d)+'</div>'+
        '<div class="zs-mini za-bn mt4">শুধু ইংরেজি ছোট হাতের অক্ষর, সংখ্যা আর হাইফেন (-)। লিংক বদলানো নিরাপদ — পুরনো লিংকে কেউ এলে নিজে থেকেই নতুন পেজে চলে যাবে।</div></div>'+
    '</div>'+
    '<div class="zp-f">'+lab('SEO title','গুগলে নীল শিরোনাম','seoTitle', d.seoTitle||ph.seoTitle)+'<input id="nm-seoTitle" class="input zs-in" type="text" value="'+esc(d.seoTitle||'')+'" placeholder="'+esc(ph.seoTitle)+'" data-input="nm-f" data-k="seoTitle"></div>'+
    '<div class="zp-f">'+lab('Meta description','গুগলে শিরোনামের নিচের ছোট লেখা','metaDesc', d.metaDesc||ph.metaDesc)+'<textarea id="nm-metaDesc" class="input zs-in zp-ta" rows="3" placeholder="'+esc(ph.metaDesc)+'" data-input="nm-f" data-k="metaDesc">'+esc(d.metaDesc||'')+'</textarea></div>'+
    '<div class="zp-f">'+lab('Feed / ad title (Google, Facebook)','গুগল শপিং আর ফেসবুক/ইনস্টাগ্রাম বিজ্ঞাপনে যে নাম যায়','feedTitle', d.feedTitle||ph.feedTitle)+'<input id="nm-feedTitle" class="input zs-in" type="text" value="'+esc(d.feedTitle||'')+'" placeholder="'+esc(ph.feedTitle)+'" data-input="nm-f" data-k="feedTitle">'+
      '<div class="zs-mini mt4">The feed adds each colour and size as its own item; keep the start of the title clear — Meta cuts it after about 65 characters.</div></div>'+
    '<div class="zs-mini mb8 mt12">Google preview <span class="za-bn">· গুগলে যেমন দেখাবে</span></div><div id="nm-gprev">'+nm_gprev(d)+'</div>'+
    '<div class="zs-mini mb8 mt12">What Google and Facebook get <span class="za-bn">· ফিড আর প্রোডাক্ট মার্কআপ</span></div><div id="nm-feedprev">'+nm_feedPrev(d)+'</div>'+
  '</section>';
}
function nm_draftView(d){ var x = Object.assign({}, d); x.slug = nm_draftSlug(d); return x; }
function nm_gprev(d){
  var x = nm_draftView(d), dom = nm_url(x.slug).split('/p/')[0];
  return '<div class="zb-g" data-testid="nm-gprev"><div class="zb-gu">'+esc(dom)+' › p › '+esc(x.slug||'…')+'</div><div class="zb-gt">'+esc(nm_val(x,'seoTitle') || 'Product title')+'</div><div class="zb-gd">'+esc(nm_val(x,'metaDesc'))+'</div></div>';
}
function nm_feedPrev(d){
  var x = nm_draftView(d);
  return '<div class="zo-kv nm-kv"><span>Feed title</span><span>'+esc(nm_val(x,'feedTitle'))+'</span><span>Brand</span><span>'+esc(nm_brand(x))+(nm_isOwn(x)?' <span class="zs-mini">· own label</span>':'')+'</span><span>Link</span><span class="nm-mono">'+esc(nm_url(x.slug))+'</span></div>';
}
function nm_redirNote(d){
  if(d._new || !d._slug0) return '';
  var now = nm_draftSlug(d); if(!now || now===d._slug0) return '';
  var clash = nm_slugClash(now, d.id);
  if(clash) return '<div class="zp-errt" role="alert">'+esc(clash)+'</div>';
  return '<div class="nm-redirnote" data-testid="nm-redirnote">'+ico('swap',13)+'<span>On save: <span class="nm-mono">/p/'+esc(d._slug0)+'</span> → <span class="nm-mono">/p/'+esc(now)+'</span> <span class="za-bn">· পুরনো লিংক নতুন পেজে যাবে</span></span></div>';
}
function nm_patchForm(d){
  if(!d || !document.getElementById('zp-naming')) return;
  var set = function(id, html){ var e = document.getElementById(id); if(e) e.innerHTML = html; };
  set('nm-url', ico('link',13)+'<span>'+esc(nm_url(nm_draftSlug(d)))+'</span>');
  set('nm-redir', nm_redirNote(d)); set('nm-gprev', nm_gprev(d)); set('nm-feedprev', nm_feedPrev(d));
  set('nm-warnbox', nm_warnHTML(nm_warnsFor(nm_draftView(d))));
  var x = nm_draftView(d);
  ['seoTitle','metaDesc','feedTitle'].forEach(function(k){ var c = document.getElementById('nm-c-'+k); if(c){ var n = String(nm_val(x,k)).length; c.textContent = n+' / '+NM_LIM[k]; c.classList.toggle('nm-over', n>NM_LIM[k]); } });
  ['seoTitle','metaDesc','feedTitle'].forEach(function(k){ var e = document.getElementById('nm-'+k); if(e && !d[k]){ var t = Object.assign({}, x); t[k] = ''; e.placeholder = nm_val(t, k); } });
}
INPUT['nm-f'] = function(el){
  var d = typeof zp_cur==='function' ? zp_cur() : null; if(!d) return;
  var k = el.getAttribute('data-k'); d[k] = el.value; if(d._err) delete d._err[k];
  clearTimeout(INPUT['nm-f']._t); INPUT['nm-f']._t = setTimeout(function(){ nm_patchForm(d); }, 120);
};
CHANGE['nm-slugfix'] = function(el){ var d = typeof zp_cur==='function' ? zp_cur() : null; if(!d) return; var v = nm_slug(el.value); el.value = v; d.slug = v; nm_patchForm(d); };
/* errors for the product form's Save (only a link clash blocks — a brand name never does) */
function nm_check(d){
  nm_draftInit(d);
  var s = nm_draftSlug(d), err = {};
  if(d.slug && String(d.slug).trim() && !nm_slug(d.slug)) err.slug = 'Use English letters or numbers in the link';
  else if(!d._new || (d.slug && String(d.slug).trim())){ var c = nm_slugClash(s, d.id); if(c) err.slug = c+' — choose another link'; }
  return err;
}
/* runs just before the product is saved: settles the link, keeps the old one
   forwarding, and notes the rename for the before/after card */
function nm_onSave(rec, d){
  var old = P(rec.id), oldSlug = old ? nm_slugOf(old) : '', isNew = !old;
  var typed = rec.slug!=null && String(rec.slug).trim()!=='' ? nm_slug(rec.slug) : '';
  var slug = typed || (isNew ? nm_uniqueSlug(nm_tpl(nm_opt('tplSlug'), rec, true) || nm_slug(rec.name), rec.id) : oldSlug);
  if(slug===rec.id) delete rec.slug; else rec.slug = slug;
  ['brand','seoTitle','metaDesc','feedTitle'].forEach(function(k){ if(rec[k]!=null){ rec[k] = String(rec[k]).trim(); if(!rec[k]) delete rec[k]; } });
  var msg = '';
  if(!isNew){
    var newSlug = rec.slug || rec.id, moved = oldSlug!==newSlug, renamed = old.name!==rec.name;
    if(moved){ nm_moveSlug(rec.id, oldSlug, newSlug); msg = ' · old link forwards to the new one'; }
    if(moved || renamed) nm_st().renames.push({pid:rec.id, at:Date.now(), oldName:old.name, newName:rec.name, oldSlug:oldSlug, newSlug:newSlug});
  }
  return msg;
}
function zp_secBA(d){
  if(!d || d._new) return '';
  var rn = nm_lastRename(d.id); if(!rn) return '';
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Before / after rename</h2>'+zs_pr('590')+'</div><div class="zs-sub za-bn">নাম বা লিংক বদলানোর আগের ১৪ দিন আর পরের ১৪ দিন — গুগল থেকে আসা ভিজিট আর অর্ডার</div>'+nm_baCard(rn)+'</section>';
}

/* =====================================================================
   #/admin/naming
   ===================================================================== */
function nm_u(){ return ui('nm', {tpl:null, mode:'empty', fields:{slug:false, seoTitle:true, metaDesc:true, feedTitle:true}, prev:null, scope:'all', find:'', repl:'', relink:false, bprev:null, rFrom:'', rTo:'', ex:'', focus:'tplSlug'}); }
function nm_tplDraft(){ var u = nm_u(); if(!u.tpl) u.tpl = {tplSlug:nm_opt('tplSlug'), tplSeo:nm_opt('tplSeo'), tplMeta:nm_opt('tplMeta'), tplFeed:nm_opt('tplFeed')}; return u.tpl; }
PAGES['nm-page'] = { layout:'admin', title:'Naming & links', render:function(params, q){
  var st = nm_st(), tab = (q && q.tab) || 'products';
  var act = st.redirects.filter(function(r){ return r.on!==false; }).length;
  var tabs = zo_tabs('#/admin/naming', [['products','Products', DB.products.length],['templates','Templates'],['bulk','Bulk rename'],['redirects','Redirects', act],['settings','Settings']], tab);
  var body = tab==='templates' ? nm_tabTpl() : tab==='bulk' ? nm_tabBulk() : tab==='redirects' ? nm_tabRedir() : tab==='settings' ? nm_tabSet() : nm_tabProducts();
  return '<div class="zs-page nm-page" data-testid="nm-page">'+
    zo_head('Admin · Catalogue '+zs_pr('590 · 235 · 587'), 'Naming &amp; links', 'নাম, লিংক আর গুগল — সব আপনার হাতে',
      'প্রতিটা প্রোডাক্টের সাইটের নাম, লিংক, গুগলের শিরোনাম, ফিডের নাম আর ব্র্যান্ড এখান থেকে ঠিক করুন — কোডে কিছু বাঁধা নেই। লিংক বদলালে পুরনো লিংক নিজে থেকে নতুন পেজে যায়, তাই গুগলের র‍্যাংক আর বিক্রি নষ্ট হয় না।',
      zs_simTag('Demo · saved in this browser only'))+tabs+body+'</div>';
}};

/* ---- Products ---- */
function nm_tabProducts(){
  var st = nm_st(), all = DB.products.slice();
  var own = all.filter(function(p){ return !!p.slug; }).length, brands = {};
  all.forEach(function(p){ brands[nm_brand(p)] = 1; });
  var warnN = nm_opt('warnOn') ? all.filter(function(p){ return nm_warnsFor(p).length; }).length : null;
  var ren = {}; st.renames.forEach(function(r){ ren[r.pid] = r; });
  var renList = Object.keys(ren).map(function(k){ return ren[k]; }).filter(function(r){ return P(r.pid); }).sort(function(a,b){ return b.at - a.at; });
  return '<div class="zs-kpis k4">'+
      '<div class="zs-k"><div class="v">'+all.length+'</div><div class="l">Products</div><div class="s">'+Object.keys(brands).length+' brands</div></div>'+
      '<div class="zs-k ok"><div class="v">'+own+'</div><div class="l">Own link set</div><div class="s">the rest use their id</div></div>'+
      '<div class="zs-k"><div class="v">'+st.redirects.filter(function(r){ return r.on!==false; }).length+'</div><div class="l">Old links forwarding</div><div class="s">none break</div></div>'+
      '<div class="zs-k '+(warnN?'warn':'')+'"><div class="v">'+(warnN==null?'Off':warnN)+'</div><div class="l">Brand-name notes</div><div class="s">'+(warnN==null?'turn on in Settings':'never blocks')+'</div></div>'+
    '</div>'+
    '<div class="zs-note mb16">'+ico('info',17)+'<div class="zs-bnp za-bn"><b>সাইটে নাম</b> — কাস্টমার যা পড়ে। <b>লিংক (স্লাগ)</b> — পেজের ঠিকানা। <b>ফিডের নাম</b> — গুগল/ফেসবুক যা দেখে। লিংক বদলানো নিরাপদ: পুরনো লিংক নতুন পেজে চলে যায়।</div></div>'+
    (renList.length ? '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Renamed products — did sales hold?</h2>'+zs_pr('590')+'</div><div class="zs-sub za-bn">নাম বা লিংক বদলানোর আগের ১৪ দিন আর পরের ১৪ দিন</div><div class="nm-bagrid">'+renList.slice(0,6).map(nm_baCard).join('')+'</div></section>' : '')+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Every product</h2><span class="zs-mini">tap a product to edit its name and link</span></div>'+
      '<div class="nm-rows">'+all.map(nm_prodRow).join('')+'</div></section>';
}
function nm_pill(src){ return src==='own' ? '<span class="zo-pill ok">own</span>' : src==='id' ? '<span class="zo-pill">demo id</span>' : '<span class="zo-pill info">template</span>'; }
function nm_prodRow(p){
  var w = nm_warnsFor(p);
  return '<a class="nm-row" href="#/admin/products/'+p.id+'" data-testid="nm-row-'+p.id+'">'+
    '<div class="nm-rm"><div class="nm-rn"><b class="nm-1l">'+esc(p.name)+'</b><span class="zo-pill'+(nm_isOwn(p)?'':' info')+'">'+esc(nm_brand(p))+'</span>'+(w.length?'<span class="zo-pill warn">brand note</span>':'')+'</div>'+
      '<div class="zs-mini nm-rs"><span class="nm-mono nm-1l">/p/'+esc(nm_slugOf(p))+'</span>'+nm_pill(nm_src(p,'slug'))+'</div></div>'+
    '<div class="nm-rf"><span class="zs-mini">SEO</span><span class="nm-1l">'+esc(nm_val(p,'seoTitle'))+'</span>'+nm_pill(nm_src(p,'seoTitle'))+'</div>'+
    '<div class="nm-rf"><span class="zs-mini">Feed</span><span class="nm-1l">'+esc(nm_val(p,'feedTitle'))+'</span>'+nm_pill(nm_src(p,'feedTitle'))+'</div>'+
  '</a>';
}

/* ---- Templates ---- */
function nm_tabTpl(){
  var u = nm_u(), t = nm_tplDraft(), ex = P(u.ex) || DB.products[0];
  var fake = function(p){ var x = Object.assign({}, p); x.seoTitle = ''; x.metaDesc = ''; x.feedTitle = ''; return x; };
  var row = function(k, en, bn, help){
    var exv = k==='tplSlug' ? '/p/'+nm_tpl(t[k], ex, true) : nm_tpl(t[k], fake(ex));
    return '<div class="zp-f"><label class="label" for="nm-t-'+k+'">'+esc(en)+' <span class="zs-mini za-bn">'+esc(bn)+'</span></label>'+
      (k==='tplMeta' ? '<textarea id="nm-t-'+k+'" class="input zs-in zp-ta nm-mono" rows="2" data-input="nm-tpl" data-k="'+k+'" data-focus="'+k+'" spellcheck="false" data-testid="nm-t-'+k+'">'+esc(t[k])+'</textarea>'
        : '<input id="nm-t-'+k+'" class="input zs-in nm-mono" type="text" value="'+esc(t[k])+'" data-input="nm-tpl" data-k="'+k+'" data-focus="'+k+'" spellcheck="false" data-testid="nm-t-'+k+'">')+
      '<div class="nm-ex" id="nm-ex-'+k+'"><span class="zs-mini">e.g.</span> <span class="'+(k==='tplSlug'?'nm-mono':'')+'">'+esc(exv)+'</span></div>'+
      (help ? '<div class="zs-mini za-bn">'+help+'</div>' : '')+'</div>';
  };
  var changed = ['tplSlug','tplSeo','tplMeta','tplFeed'].some(function(k){ return t[k]!==nm_opt(k); });
  return '<div class="nm-g2">'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Shop-wide templates</h2>'+zs_pr('590')+'</div>'+
      '<div class="zs-sub za-bn">টোকেন দিয়ে নিয়ম বানান — খালি ঘরগুলো এই নিয়মে নিজে ভরে। লিংকে ব্র্যান্ড চাইলে {brand} রাখুন, না চাইলে মুছে দিন।</div>'+
      '<div class="nm-toks" role="group" aria-label="Tokens">'+NM_TOKENS.map(function(x){ return '<button type="button" class="chip nm-tok" data-act="nm-tok" data-t="'+x[0]+'" title="'+esc(x[1])+'">'+esc(x[0])+'</button>'; }).join('')+'</div>'+
      '<div class="zs-mini mb8">Tap a token to add it to the box you were last typing in.</div>'+
      row('tplSlug','Link (slug)','লিংক','যেমন {brand}-{style} → ralph-lauren-solid-polo। {colour} দিলে প্রথম রংটা লিংকে বসে — একটা স্টাইলের একটাই লিংক রাখাই ভালো।')+
      row('tplSeo','SEO title','গুগলের শিরোনাম','')+
      row('tplMeta','Meta description','গুগলের ছোট লেখা','')+
      row('tplFeed','Feed / ad title','গুগল/ফেসবুক ফিডের নাম','')+
      '<div class="zp-f"><label class="label" for="nm-ex">Example product <span class="zs-mini za-bn">কোন প্রোডাক্টে দেখাবে</span></label><select id="nm-ex" class="input zs-in" data-change="nm-ex">'+DB.products.map(function(p){ return '<option value="'+p.id+'"'+(p.id===ex.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></div>'+
      '<div class="row wrap" style="gap:8px"><button type="button" class="btn btn-secondary" data-act="nm-tplsave"'+(changed?'':' disabled')+' data-testid="nm-tplsave">'+ico('check',15)+'Save templates</button>'+
        '<button type="button" class="btn btn-ghost" data-act="nm-tplreset">Back to default</button></div>'+
      '<div class="zs-mini mt8">Saving a template changes only fields left empty. To write it into products, use “Apply to products”.</div>'+
    '</section>'+
    '<section class="zs-card"><h2>Apply to products</h2><div class="zs-sub za-bn">আগে দেখে নিন কী কী বদলাবে, তারপর সেভ করুন</div>'+
      '<div class="zs-mini mb8">Which fields</div><div class="nm-chks">'+NM_FIELDS.map(function(f){ var on = !!u.fields[f[0]]; return '<button type="button" class="zp-tick'+(on?' on':'')+'" data-act="nm-fld" data-k="'+f[0]+'" aria-pressed="'+on+'"><span class="zs-cb">'+ico('check',14)+'</span><span><b>'+esc(f[1])+'</b><span class="zs-mini za-bn" style="display:block">'+esc(f[2])+'</span></span></button>'; }).join('')+'</div>'+
      '<div class="zs-mini mb8 mt12">Which products</div><div class="zs-tier" role="group" aria-label="Apply to"><button type="button" class="'+(u.mode==='empty'?'on':'')+'" data-act="nm-mode" data-v="empty">Empty fields only</button><button type="button" class="'+(u.mode==='all'?'on':'')+'" data-act="nm-mode" data-v="all">All (overwrite)</button></div>'+
      '<div class="zs-mini za-bn mt8">'+(u.mode==='empty' ? 'যেসব ঘরে নিজের লেখা নেই শুধু সেগুলো ভরবে।' : 'সব প্রোডাক্টের লেখা বদলে যাবে — নিজের লেখা থাকলেও।')+(u.fields.slug ? ' লিংক বদলালে পুরনো লিংক নতুন পেজে যাবে।' : '')+'</div>'+
      '<button type="button" class="btn btn-primary mt12" data-act="nm-prev" data-testid="nm-prev">'+ico('eye',15)+'Preview changes</button>'+
      (u.prev ? nm_prevHTML(u.prev, 'nm-apply', 'Save '+u.prev.length+' change'+(u.prev.length===1?'':'s')) : '')+
    '</section></div>';
}
function nm_tplChanges(){
  var u = nm_u(), t = nm_tplDraft(), out = [];
  DB.products.forEach(function(p){
    NM_FIELDS.forEach(function(f){
      var k = f[0]; if(!u.fields[k]) return;
      var has = k==='slug' ? !!p.slug : !!p[k];
      if(u.mode==='empty' && has) return;
      var blank = Object.assign({}, p, {seoTitle:'', metaDesc:'', feedTitle:''});
      var nv = k==='slug' ? nm_tpl(t.tplSlug, p, true) : nm_tpl(t[f[3]], blank);
      var ov = k==='slug' ? nm_slugOf(p) : (p[k] || '');
      if(!nv || nv===ov) return;
      out.push({pid:p.id, k:k, label:f[1], from:ov, to:nv});
    });
  });
  /* links must stay one per product */
  var used = {};
  out.forEach(function(c){ if(c.k!=='slug') return; var s = c.to, i = 2; while(used[s] || nm_slugClash(s, c.pid)) s = c.to+'-'+(i++); c.to = s; used[s] = 1; });
  return out;
}
function nm_prevHTML(list, act, btn){
  if(!list.length) return '<div class="zs-empty mt12" data-testid="nm-prevlist">Nothing would change.</div>';
  var reds = list.filter(function(c){ return c.k==='slug' || c.slugTo; }).length;
  return '<div class="nm-prev mt12" data-testid="nm-prevlist"><div class="row between wrap" style="gap:8px"><b class="small">'+list.length+' change'+(list.length===1?'':'s')+'</b>'+(reds?'<span class="zo-pill ok">'+ico('swap',11)+reds+' old link'+(reds===1?'':'s')+' will forward</span>':'')+'</div>'+
    '<div class="nm-chgs">'+list.slice(0,80).map(function(c){ var p = P(c.pid);
      return '<div class="nm-chg"><div class="small bold nm-1l">'+esc(p?p.name:c.pid)+' <span class="zs-mini">· '+esc(c.label)+'</span></div>'+
        (c.nameTo!=null ? '<div class="nm-ft"><s>'+esc(c.nameFrom)+'</s>'+ico('right',12)+'<b>'+esc(c.nameTo)+'</b></div>' : '')+
        (c.k==='slug' || c.slugTo ? '<div class="nm-ft nm-mono"><s>/p/'+esc(c.slugTo ? c.slugFrom : c.from)+'</s>'+ico('right',12)+'<b>/p/'+esc(c.slugTo || c.to)+'</b></div><div class="zs-mini nm-okl">'+ico('check',11)+' redirect created</div>'
          : c.nameTo==null ? '<div class="nm-ft"><s>'+esc(c.from || '(empty)')+'</s>'+ico('right',12)+'<b>'+esc(c.to)+'</b></div>' : '<div class="zs-mini">link stays /p/'+esc(c.slugFrom)+'</div>')+
      '</div>'; }).join('')+(list.length>80?'<div class="zs-mini">…and '+(list.length-80)+' more</div>':'')+'</div>'+
    '<div class="row wrap mt12" style="gap:8px"><button type="button" class="btn btn-primary" data-act="'+act+'" data-testid="'+act+'">'+ico('check',15)+esc(btn)+'</button><button type="button" class="btn btn-ghost" data-act="nm-prevx">Cancel</button></div></div>';
}
function nm_commitP(p){ var rec = zp_record(p); return rec; }
function nm_saveRecs(recs){ var c = zo_ops().cat; recs.forEach(function(rec){ var isSeed = ZP_SNAP.products.some(function(x){ return x.id===rec.id; }); if(!isSeed) rec._added = true; c.prod[rec.id] = rec; }); zp_apply(); saveState(); }
INPUT['nm-tpl'] = function(el){
  var t = nm_tplDraft(), k = el.getAttribute('data-k'), u = nm_u(); t[k] = el.value; u.focus = k; u.prev = null;
  var ex = P(u.ex) || DB.products[0], e = document.getElementById('nm-ex-'+k);
  if(e){ var x = Object.assign({}, ex, {seoTitle:'', metaDesc:'', feedTitle:''}); e.innerHTML = '<span class="zs-mini">e.g.</span> <span class="'+(k==='tplSlug'?'nm-mono':'')+'">'+esc(k==='tplSlug' ? '/p/'+nm_tpl(t[k], ex, true) : nm_tpl(t[k], x))+'</span>'; }
  var b = document.querySelector('[data-act=nm-tplsave]'); if(b) b.disabled = !['tplSlug','tplSeo','tplMeta','tplFeed'].some(function(q){ return t[q]!==nm_opt(q); });
};
document.addEventListener('focusin', function(e){ var k = e.target && e.target.getAttribute && e.target.getAttribute('data-focus'); if(k) nm_u().focus = k; });
ACT['nm-tok'] = function(el){ var u = nm_u(), t = nm_tplDraft(), k = u.focus || 'tplSlug', tok = el.getAttribute('data-t'); t[k] = String(t[k]||'') + (k==='tplSlug' ? (t[k] && !/-$/.test(t[k]) ? '-' : '') : (t[k] && !/\s$/.test(t[k]) ? ' ' : '')) + tok; u.prev = null; rerender(); var i = document.getElementById('nm-t-'+k); if(i){ i.focus(); try{ i.setSelectionRange(i.value.length, i.value.length); }catch(e){} } };
CHANGE['nm-ex'] = function(el){ nm_u().ex = el.value; rerender(); };
ACT['nm-tplsave'] = function(){ var t = nm_tplDraft(); ['tplSlug','tplSeo','tplMeta','tplFeed'].forEach(function(k){ if(t[k]!==nm_opt(k)) nm_setOpt(k, t[k]); }); rerender(); toast('Templates saved — empty fields follow them now'); };
ACT['nm-tplreset'] = function(){ var u = nm_u(); u.tpl = {tplSlug:NM_DEF.tplSlug, tplSeo:NM_DEF.tplSeo, tplMeta:NM_DEF.tplMeta, tplFeed:NM_DEF.tplFeed}; u.prev = null; rerender(); toast('Default templates loaded — press Save to keep them'); };
ACT['nm-fld'] = function(el){ var u = nm_u(), k = el.getAttribute('data-k'); u.fields[k] = !u.fields[k]; u.prev = null; rerender(); };
ACT['nm-mode'] = function(el){ var u = nm_u(); u.mode = el.getAttribute('data-v'); u.prev = null; rerender(); };
ACT['nm-prev'] = function(){ var u = nm_u(); u.prev = nm_tplChanges(); rerender(); var e = document.querySelector('[data-testid=nm-prevlist]'); if(e) e.scrollIntoView({block:'nearest'}); };
ACT['nm-prevx'] = function(){ var u = nm_u(); u.prev = null; u.bprev = null; rerender(); };
ACT['nm-apply'] = function(){
  var u = nm_u(), list = u.prev || []; if(!list.length) return;
  var by = {}, moves = [];
  list.forEach(function(c){
    var p = P(c.pid); if(!p) return; var rec = by[c.pid] || (by[c.pid] = nm_commitP(p));
    if(c.k==='slug'){ moves.push([c.pid, nm_slugOf(p), c.to]); if(c.to===p.id) delete rec.slug; else rec.slug = c.to; } else rec[c.k] = c.to;
  });
  moves.forEach(function(m){ nm_moveSlug(m[0], m[1], m[2]); nm_st().renames.push({pid:m[0], at:Date.now(), oldName:P(m[0]).name, newName:P(m[0]).name, oldSlug:m[1], newSlug:m[2]}); });
  nm_saveRecs(Object.keys(by).map(function(k){ return by[k]; }));
  var n = list.length; u.prev = null; rerender(); toast(n+' change'+(n===1?'':'s')+' saved'+(moves.length ? ' · '+moves.length+' old link'+(moves.length===1?'':'s')+' forward' : ''));
};

/* ---- Bulk rename ---- */
function nm_bulkScope(){
  var u = nm_u(), s = u.scope;
  return DB.products.filter(function(p){ if(s==='all') return true; if(s.indexOf('cat:')===0) return p.cat===s.slice(4); if(s.indexOf('brand:')===0) return nm_brand(p)===s.slice(6); return true; });
}
function nm_bulkChanges(){
  var u = nm_u(), out = [], used = {};
  if(!String(u.find||'')) return out;
  var re = new RegExp(nm_re(u.find), 'gi');
  nm_bulkScope().forEach(function(p){
    if(!re.test(p.name)){ re.lastIndex = 0; return; } re.lastIndex = 0;
    var nn = p.name.replace(re, u.repl||'').replace(/\s{2,}/g,' ').trim(); if(!nn || nn===p.name) return;
    var c = {pid:p.id, label:'name', nameFrom:p.name, nameTo:nn, slugFrom:nm_slugOf(p)};
    if(u.relink){
      var base = nm_tpl(nm_opt('tplSlug'), Object.assign({}, p, {name:nn}), true), s = base, i = 2;
      while(used[s] || nm_slugClash(s, p.id)) s = base+'-'+(i++);
      if(s && s!==c.slugFrom){ c.slugTo = s; used[s] = 1; }
    }
    out.push(c);
  });
  return out;
}
function nm_tabBulk(){
  var u = nm_u(), cats = DB.categories.filter(function(c){ return DB.products.some(function(p){ return p.cat===c.id; }); });
  var brands = {}; DB.products.forEach(function(p){ brands[nm_brand(p)] = 1; });
  var opts = [['all','All products ('+DB.products.length+')']].concat(cats.map(function(c){ return ['cat:'+c.id, 'Category: '+c.name]; })).concat(Object.keys(brands).sort().map(function(b){ return ['brand:'+b, 'Brand: '+b]; }));
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Bulk rename</h2>'+zs_pr('590')+'</div>'+
    '<div class="zs-sub za-bn">একসাথে অনেক প্রোডাক্টের নাম বদলান — যেমন "Pique" লিখে "Piqué" দিয়ে বদলান। সেভ করার আগে পুরো তালিকা দেখাবে।</div>'+
    '<div class="za-f2">'+
      '<div class="zp-f"><label class="label" for="nm-bscope">Which products <span class="zs-mini za-bn">কোন প্রোডাক্ট</span></label><select id="nm-bscope" class="input zs-in" data-change="nm-bscope">'+opts.map(function(o){ return '<option value="'+esc(o[0])+'"'+(o[0]===u.scope?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select></div>'+
      '<div class="zp-f"><label class="label">Links <span class="zs-mini za-bn">লিংক</span></label><div class="zs-tier" role="group" aria-label="Links"><button type="button" class="'+(u.relink?'':'on')+'" data-act="nm-relink" data-v="0">Keep links</button><button type="button" class="'+(u.relink?'on':'')+'" data-act="nm-relink" data-v="1">New links from template</button></div></div>'+
      '<div class="zp-f"><label class="label" for="nm-find">Find <span class="zs-mini za-bn">যে লেখা খুঁজবে</span></label><input id="nm-find" class="input zs-in" type="text" value="'+esc(u.find)+'" placeholder="e.g. Pique" data-input="nm-bf" data-k="find" data-testid="nm-find"></div>'+
      '<div class="zp-f"><label class="label" for="nm-repl">Replace with <span class="zs-mini za-bn">যা দিয়ে বদলাবে (খালি = মুছে দেবে)</span></label><input id="nm-repl" class="input zs-in" type="text" value="'+esc(u.repl)+'" placeholder="e.g. Piqué" data-input="nm-bf" data-k="repl" data-testid="nm-repl"></div>'+
    '</div>'+
    '<div class="zs-mini za-bn">'+(u.relink ? 'নতুন লিংক লিংক-টেমপ্লেট ('+esc(nm_opt('tplSlug'))+') থেকে বানানো হবে — পুরনো লিংক নতুন পেজে যাবে।' : 'লিংক যেমন আছে তেমন থাকবে — শুধু নাম বদলাবে।')+'</div>'+
    '<button type="button" class="btn btn-primary mt12" data-act="nm-bprev" data-testid="nm-bprev">'+ico('eye',15)+'Preview rename</button>'+
    (u.bprev ? nm_prevHTML(u.bprev, 'nm-bapply', 'Rename '+u.bprev.length+' product'+(u.bprev.length===1?'':'s')) : '')+
  '</section>';
}
INPUT['nm-bf'] = function(el){ var u = nm_u(); u[el.getAttribute('data-k')] = el.value; u.bprev = null; var b = document.querySelector('[data-testid=nm-prevlist]'); if(b) b.remove(); };
CHANGE['nm-bscope'] = function(el){ var u = nm_u(); u.scope = el.value; u.bprev = null; rerender(); };
ACT['nm-relink'] = function(el){ var u = nm_u(); u.relink = el.getAttribute('data-v')==='1'; u.bprev = null; rerender(); };
ACT['nm-bprev'] = function(){ var u = nm_u(); if(!String(u.find||'').trim()){ toast('Write the text to find first'); return; } u.bprev = nm_bulkChanges(); rerender(); var e = document.querySelector('[data-testid=nm-prevlist]'); if(e) e.scrollIntoView({block:'nearest'}); };
ACT['nm-bapply'] = function(){
  var u = nm_u(), list = u.bprev || []; if(!list.length) return; var recs = [], moved = 0;
  list.forEach(function(c){
    var p = P(c.pid); if(!p) return; var rec = nm_commitP(p); rec.name = c.nameTo;
    if(c.slugTo){ nm_moveSlug(p.id, c.slugFrom, c.slugTo); if(c.slugTo===p.id) delete rec.slug; else rec.slug = c.slugTo; moved++; }
    nm_st().renames.push({pid:p.id, at:Date.now(), oldName:c.nameFrom, newName:c.nameTo, oldSlug:c.slugFrom, newSlug:c.slugTo || c.slugFrom});
    recs.push(rec);
  });
  nm_saveRecs(recs); u.bprev = null; rerender();
  toast(recs.length+' product'+(recs.length===1?'':'s')+' renamed'+(moved ? ' · '+moved+' old link'+(moved===1?'':'s')+' forward' : ''));
};

/* ---- Redirects ---- */
function nm_tabRedir(){
  var u = nm_u(), st = nm_st(), list = st.redirects;
  var on = list.filter(function(r){ return r.on!==false; });
  var hits = on.reduce(function(s,r){ return s + nm_hits(r); }, 0);
  return '<div class="zs-kpis k4">'+
      '<div class="zs-k ok"><div class="v">'+on.length+'</div><div class="l">Forwarding now</div><div class="s">301 in the real shop</div></div>'+
      '<div class="zs-k"><div class="v">'+on.filter(function(r){ return r.kind==='slug'; }).length+'</div><div class="l">From link changes</div><div class="s">made automatically</div></div>'+
      '<div class="zs-k"><div class="v">'+on.filter(function(r){ return r.kind==='wp'; }).length+'</div><div class="l">WordPress map</div><div class="s">PR 587 · keep ≥ 12 months</div></div>'+
      '<div class="zs-k"><div class="v">'+hits+'</div><div class="l">Hits</div><div class="s">simulated</div></div>'+
    '</div>'+
    '<div class="zs-note mb16">'+ico('swap',17)+'<div class="zs-bnp za-bn">লিংক বদলালে পুরনো লিংক এখানে জমা থাকে আর নতুন পেজে পাঠায়। পুরনো ওয়েবসাইটের (WordPress) লিংকগুলোও এখানেই — কেউ পুরনো লিংকে এলে নতুন সাইটের ঠিক পেজে চলে যাবে। কোনোটা মুছতে হয় না — দরকার না হলে সুইচ বন্ধ করুন।</div></div>'+
    '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>Redirects</h2><span class="zs-mini">old → new · date · hits (simulated)</span></div>'+
      '<div class="nm-rlist" data-testid="nm-rlist">'+(list.length ? list.map(nm_rRow).join('') : '<div class="zs-empty">No redirects yet. Change a product\'s link and the old one appears here.</div>')+'</div></section>'+
    '<section class="zs-card"><h2>Add a redirect</h2><div class="zs-sub za-bn">যেমন পুরনো সাইটের একটা লিংক — কোথায় যাবে সেটা বেছে দিন</div>'+
      '<div class="za-f2"><div class="zp-f"><label class="label" for="nm-rfrom">Old link <span class="zs-mini za-bn">পুরনো লিংক</span></label><input id="nm-rfrom" class="input zs-in nm-mono" type="text" value="'+esc(u.rFrom)+'" placeholder="/product/old-name/" data-input="nm-rf" data-k="rFrom" spellcheck="false"></div>'+
        '<div class="zp-f"><label class="label" for="nm-rto">Goes to <span class="zs-mini za-bn">কোথায় যাবে</span></label><select id="nm-rto" class="input zs-in" data-change="nm-rto"><option value="">— choose —</option>'+
          DB.products.map(function(p){ return '<option value="p:'+p.id+'"'+(u.rTo==='p:'+p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+
          DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){ return '<option value="c:'+c.id+'"'+(u.rTo==='c:'+c.id?' selected':'')+'>Category: '+esc(c.name)+'</option>'; }).join('')+
          '<option value="h:/"'+(u.rTo==='h:/'?' selected':'')+'>Home</option></select></div></div>'+
      '<button type="button" class="btn btn-secondary" data-act="nm-radd">'+ico('plus',15)+'Add redirect</button></section>';
}
function nm_rRow(r, i){
  var list = nm_st().redirects, idx = list.indexOf(r), on = r.on!==false, to = nm_rTo(r), p = r.pid ? P(r.pid) : null;
  var tag = r.kind==='wp' ? '<span class="zo-pill info">WordPress</span>' : r.kind==='slug' ? '<span class="zo-pill ok">Link change</span>' : '<span class="zo-pill">Added</span>';
  return '<div class="nm-r'+(on?'':' off')+'" data-testid="nm-r-'+idx+'">'+
    '<div class="nm-rft"><span class="nm-mono nm-from">'+esc(r.from)+'</span><span class="nm-tol">'+ico('right',13)+'<span class="nm-mono nm-to">'+esc(to || '(product removed)')+'</span></span></div>'+
    '<div class="nm-rmeta">'+tag+(r.demo ? '<span class="zs-sim">'+ico('info',11)+(r.kind==='wp'?'Demo · example':'Demo · example')+'</span>' : '')+
      '<span class="zs-mini">'+new Date(r.at||Date.now()).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+'</span>'+
      '<span class="zs-mini"><b>'+nm_hits(r)+'</b> hit'+(nm_hits(r)===1?'':'s')+'</span>'+(p?'<span class="zs-mini nm-1l">'+esc(p.name)+'</span>':'')+(r.note?'<span class="zs-mini">'+esc(r.note)+'</span>':'')+'</div>'+
    '<div class="nm-ract"><button type="button" class="btn btn-sm btn-secondary" data-act="nm-try" data-i="'+idx+'"'+(on?'':' disabled')+' data-testid="nm-try-'+idx+'">'+ico('eye',13)+'Try old link</button>'+
      zs_sw(on, 'nm-ron', 'Redirect '+r.from+' on or off', 'data-i="'+idx+'"')+'</div>'+
  '</div>';
}
INPUT['nm-rf'] = function(el){ nm_u()[el.getAttribute('data-k')] = el.value; };
CHANGE['nm-rto'] = function(el){ nm_u().rTo = el.value; };
ACT['nm-radd'] = function(){
  var u = nm_u(), from = String(u.rFrom||'').trim(), to = u.rTo;
  if(!from || nm_norm(from)==='/'){ toast('Write the old link first'); return; }
  if(!to){ toast('Choose where it goes'); return; }
  if(nm_findR(from)){ toast('That old link already forwards'); return; }
  var r = {from:(from.charAt(0)==='/'?'':'/')+from.replace(/^https?:\/\/[^\/]+/i,''), kind:'manual', at:Date.now(), hits:0, on:true};
  if(to.indexOf('p:')===0) r.pid = to.slice(2);
  else if(to.indexOf('c:')===0){ var c = CAT(to.slice(2)); r.to = '/'+(c ? nm_slug(c.name) : to.slice(2)); r.hash = '#/c/'+to.slice(2); }
  else { r.to = '/'; r.hash = '#/'; }
  if(r.pid && nm_norm(r.from)===nm_norm('/p/'+nm_slugOf(P(r.pid)))){ toast('That is the product\'s own link'); return; }
  nm_st().redirects.unshift(r); saveState(); u.rFrom = ''; u.rTo = ''; rerender(); toast('Redirect added — '+r.from+' → '+nm_rTo(r));
};
ACT['nm-ron'] = function(el){ var r = nm_st().redirects[+el.getAttribute('data-i')]; if(!r) return; r.on = r.on===false; if(r.on) delete r.note; saveState(); rerender(); toast(r.from+(r.on?' forwards again':' — switched off (kept in the list)')); };
ACT['nm-try'] = function(el){ var r = nm_st().redirects[+el.getAttribute('data-i')]; if(!r) return; UI.nmTry = r.from; location.hash = '#'+r.from; };

/* ---- Settings tab: the same rows as Admin › Settings ---- */
function nm_tabSet(){
  var rows = (typeof ZS_SETTINGS!=='undefined') ? ZS_SETTINGS.filter(function(s){ return s.g==='naming' && !/^nm\.tpl/.test(s.id); }) : [];
  return '<section class="zs-card zs-sgrp"><div class="zs-sgrp-h"><h2>Naming &amp; links settings</h2>'+zs_pr('590')+'</div>'+
    '<div class="zs-sub za-bn">ব্র্যান্ড কোথায় দেখাবে, নিজের লেবেলের নাম, আর অন্য ব্র্যান্ডের নামের নোট (বন্ধ রাখা আছে)। এগুলো Settings পেজেও আছে।</div>'+
    rows.map(zs_setRow).join('')+
    '<div class="mt12"><a class="zs-link" href="#/admin/settings">All settings</a></div></section>';
}
