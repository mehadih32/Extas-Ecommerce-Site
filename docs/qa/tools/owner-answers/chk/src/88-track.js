/* ================= EXTAS demo — analytics event layer (88-track.js) =================
   Records what shoppers do, in the browser, so the owner can read it on
   #/admin/analytics (87-admin-analytics.js).

   HOW IT ATTACHES — no other file is edited:
   - existing global functions (bagAdd, bagRemove, placeOrder, login, logout,
     render) are wrapped at load time: the original is always called first with
     the same arguments and its return value is passed back untouched;
   - a few ACT handlers are wrapped the same way (ty-add, bag-save);
   - document-level CAPTURE listeners watch clicks and form submits (they run
     before the shop's own handlers and never cancel or change anything).
   Every hook is inside try/catch: tracking can fail, the shop cannot.

   TO ADD AN EVENT: add a row to TRACK_EVENTS (and, if it is a plain tap on a
   data-act button, one row to TRACK_TAPS). The owner page reads both tables.
   BACKEND HOOK: EXTRACK.log() is the one place every event passes through —
   send the same object to the server / Meta CAPI / GA4 there later.
   ==================================================================================== */

/* ---------- 1. the event catalogue (one place) ----------
   name     — stored event name
   label    — short owner-facing label
   trigger  — what fires it
   fields   — extra fields on top of the common ones
   Common fields on EVERY event: t (time), ev (name), page (CUR.page), path (route),
   pid + cat (product + category, when known), src (button / place), auth
   ('member' = logged in, 'guest'), sid (browser session). */
var TRACK_EVENTS = [
  {name:'product_view',      label:'Product views',        trigger:'A product page opens (#/p/<id>)',                                   fields:'price, from (page before)'},
  {name:'search',            label:'Searches',             trigger:'Search submitted (header box or search page) or a suggestion tapped', fields:'term, method (submit | suggestion), results'},
  {name:'whatsapp_click',    label:'WhatsApp clicks',      trigger:'Any link to wa.me / WhatsApp is clicked (shop pages only)',         fields:'btn (stable button id), btn_label, kind (chat | share)'},
  {name:'add_to_bag',        label:'Add to bag',           trigger:'bagAdd() really added something (or an add-on was added to an order)', fields:'qty, size, colour, price, line (item | set), set_id, set_name, items, from_offer, offer'},
  {name:'order_now',         label:'Order Now (direct)',   trigger:'An Order Now button sends the shopper straight to checkout / order', fields:'qty, size, colour, price, line, lines, from_offer, offer'},
  {name:'remove_from_bag',   label:'Removed from bag',     trigger:'Shopper removes a bag line (bag, checkout, save for later, 2-size fix)', fields:'qty, size, colour, price, line, reason'},
  {name:'re_add',            label:'Re-added after remove', trigger:'A product removed earlier in this session is added again',          fields:'qty, size, colour, price'},
  {name:'new_add_after_remove', label:'New add after remove', trigger:'A different product is added after a removal in this session', fields:'qty, size, colour, price, after (removed pid)'},
  {name:'checkout_start',    label:'Checkout started',     trigger:'The checkout page opens from another page',                          fields:'via (bag | order_now), items, total, from'},
  {name:'purchase',          label:'Purchases',            trigger:'An order is placed (checkout or landing page)',                      fields:'order_id, total, items, via (bag | order_now | landing), payment, pay_label, new_customer'},
  {name:'all_colours_click', label:'All colours taps',     trigger:'data-act="pdp-allcolors"',                                            fields:'colours (how many)'},
  {name:'size_chart_click',  label:'Size chart taps',      trigger:'data-act="pdp-open-chart"',                                           fields:''},
  {name:'wishlist_add',      label:'Wishlist saves',       trigger:'data-act="wish" on an unsaved item, or Save for later in the bag',    fields:''},
  {name:'wishlist_remove',   label:'Wishlist removes',     trigger:'data-act="wish" on a saved item',                                     fields:''},
  {name:'login',             label:'Logins',               trigger:'login() succeeds',                                                    fields:'method'},
  {name:'signup',            label:'New accounts',         trigger:'An order creates a new customer account',                            fields:'method, order_id'},
  {name:'guest_checkout',    label:'Guest checkouts',      trigger:'An order is placed by a shopper who was not logged in',              fields:'order_id, via'},
  {name:'logout',            label:'Logouts',              trigger:'logout() is called',                                                  fields:''}
];

/* ---------- 2. plain taps on data-act buttons ---------- */
var TRACK_TAPS = {
  'pdp-allcolors':  {ev:'all_colours_click'},
  'pdp-open-chart': {ev:'size_chart_click'},
  'wish':           {ev:function(el){ var id = el.getAttribute('data-id'); return (ST.wishlist||[]).indexOf(id)>=0 ? 'wishlist_remove' : 'wishlist_add'; }}
};

/* ---------- 3. where an add came from (keyed by the data-act / data-submit that ran) ----------
   src    — place name; bar = name used when the button sits in the sticky phone bar
   offer  — set when the add came from an offer (combo, set, nudge, upsell)
   direct — true for Order Now style buttons (logged as order_now, not add_to_bag) */
var TRACK_ADD_SOURCES = {
  'pdp-add':     {src:'pdp_cta', bar:'pdp_bar'},
  'pdp-order':   {src:'pdp_cta', bar:'pdp_bar', direct:true},
  'pdp-duo-add': {src:'pdp_duo_popup', offer:'duo_offer'},
  'cb-add':      {src:'combo_page', offer:'combo'},
  'ca-add':      {src:'auto-combo', offer:'auto_combo'},
  'ca-order':    {src:'auto-combo', offer:'auto_combo', direct:true},
  'cb-order':    {src:'combo_page', offer:'combo', direct:true},
  'bs-bag':      {src:'set_builder', offer:'custom_set'},
  'bag-duo':     {src:'bag_duo_offer', offer:'duo_offer'},
  'co-ups':      {src:'checkout_upsell', offer:'upsell'},
  'ty-add':      {src:'thanks_add_on', offer:'upsell'},
  'lp-order':    {src:'landing_page', direct:true}
};
/* an add with no row above: a button inside a product card is a quick add */
var TRACK_ADD_FALLBACK = [ {sel:'.pcard', src:'card_quick_add'}, {sel:'.ups', src:'upsell_block', offer:'upsell'} ];

/* ---------- 4. offer blocks that lead to another page ----------
   A tap here is remembered; an add on the page it opened counts as from_offer. */
var TRACK_OFFER_ENTRIES = [
  {sel:'.pdp-nudge',          offer:'pdp_nudge'},
  {sel:'.ups-set',            offer:'upsell_set_line'},
  {sel:'.ups .pcard',         offer:'upsell_card'},
  {sel:'#pdp-pairs .pcard',   offer:'complete_the_look'},
  {sel:'[class*="hm-band"] a[href*="#/combo"], [class*="hm-band"] a[href*="#/set"]', offer:'home_sets_band'}
];

/* ---------- 5. removals that count (anything else is the shop reshuffling lines) ---------- */
var TRACK_REMOVE_SOURCES = {
  'bag-remove':  {src:'bag', reason:'removed'},
  'co-remove':   {src:'checkout', reason:'removed'},
  'bag-save':    {src:'bag', reason:'save_for_later'},
  'bag-brk-one': {src:'bag', reason:'kept_one_size'}
};

/* ---------- 6. WhatsApp buttons — first match wins; anything else gets a derived id ---------- */
var TRACK_WA_BUTTONS = [
  {sel:'.hdr-wa',        id:'header_icon',        label:'Header icon'},
  {sel:'.ftr-wa',        id:'footer',             label:'Footer button'},
  {sel:'.wa-fab',        id:'floating_disc',      label:'Floating disc'},
  {sel:'.pdp-wafab',     id:'pdp_floating',       label:'Product · floating'},
  {sel:'.pdp-act.wa',    id:'pdp_icon_rail',      label:'Product · icon rail'},
  {sel:'.pdp-qa-wa a',   id:'pdp_questions',      label:'Product · Q&A'},
  {sel:'.chart-opt.wa',  id:'size_chart_help',    label:'Size chart · still unsure'},
  {sel:'.co-sidehelp',   id:'checkout_side_help', label:'Checkout · side help'},
  {sel:'.co-wa',         id:'checkout_help',      label:'Checkout · help'},
  {sel:'.shr-b',         id:'share_whatsapp',     label:'Share to WhatsApp'},
  {sel:'.mn-foot a',     id:'menu',               label:'Menu'},
  {sel:'.ckh a, .hdr .iconbtn', id:'slim_header_icon', label:'Slim header icon'},
  {sel:'.cb-wabtn',      id:'combo_help',         label:'Combo · help'},
  {sel:'.pg-ch',         id:'contact_page',       label:'Contact page'}
];
var TRACK_PAGE_LABEL = { home:'Home', category:'Category', search:'Search', product:'Product', combo:'Combo', set:'Build a set', bag:'Bag',
  checkout:'Checkout', thanks:'Thank you', login:'Login', account:'Account', journal:'Journal', page:'Info page', order:'Order', exchange:'Exchange', landing:'Landing page' };

/* ====================================================================================
   ENGINE
   ==================================================================================== */
var TRACK_KEY = 'extas-events', TRACK_CAP = 3000, TRACK_SKEY = 'extas-track-session';
var TRACK_MEM = null;          /* in-memory copy; works with no storage at all */
var TRACK_CTX = null;          /* the click / submit being handled right now */
var TRACK_LAST = {page:null, path:null};

function trk_load(){
  if(TRACK_MEM) return TRACK_MEM;
  TRACK_MEM = [];
  try{ var raw = localStorage.getItem(TRACK_KEY); if(raw){ var a = JSON.parse(raw); if(Array.isArray(a)) TRACK_MEM = a; } }catch(e){}
  return TRACK_MEM;
}
function trk_save(){ try{ localStorage.setItem(TRACK_KEY, JSON.stringify(TRACK_MEM||[])); }catch(e){} }
var TRACK_S = (function(){
  var s = null;
  try{ var raw = sessionStorage.getItem(TRACK_SKEY); if(raw) s = JSON.parse(raw); }catch(e){}
  if(!s || !s.sid) s = {sid:'s'+Math.random().toString(36).slice(2,9), removed:[], lastRemoved:null, directAt:0, via:'', arrival:null};
  return s;
})();
function trk_sSave(){ try{ sessionStorage.setItem(TRACK_SKEY, JSON.stringify(TRACK_S)); }catch(e){} }

function trk_auth(){ try{ return (typeof currentAccount==='function' && currentAccount()) ? 'member' : 'guest'; }catch(e){ return 'guest'; } }
function trk_catOf(pid){ try{ var p = P(pid); return p ? p.cat : null; }catch(e){ return null; } }
/* product of the page the shopper is on, when the event names none */
function trk_pagePid(){ try{ if(CUR && CUR.page==='product' && CUR.params && CUR.params[0] && P(CUR.params[0])) return CUR.params[0]; }catch(e){} return null; }

function trk_log(name, fields){
  try{
    fields = fields || {};
    var e = {id:Math.random().toString(36).slice(2,10), t:Date.now(), ev:String(name),
      page:(typeof CUR!=='undefined' && CUR && CUR.page) || null, path:(typeof CUR!=='undefined' && CUR && CUR.path) || null,
      pid:null, cat:null, src:null, auth:trk_auth(), sid:TRACK_S.sid};
    for(var k in fields) if(fields[k]!==undefined) e[k] = fields[k];
    if(!e.pid && fields.pid!==null) e.pid = trk_pagePid();
    if(e.pid && !e.cat) e.cat = trk_catOf(e.pid);
    var list = trk_load(); list.push(e);
    if(list.length > TRACK_CAP) list.splice(0, list.length - TRACK_CAP);
    trk_save();
    return e;
  }catch(err){ return null; }
}

/* ---------- names for buttons and places ---------- */
var TRK_SKIP_CLS = /^(btn|link|row|stack|grow|container|section|card|panel|tint|soft|chip|tag|small|xs|muted|bold|on|sweep|wa-real|wa-btn|wa-glyph|mbar|split|split-side|sticky-d|tbl-wrap|has-bnav|hide-m|hide-d|dm-hide|dm-only|scroll-x|page|iconbtn|top|between|wrap)$|^(btn-|mt|mb|p\d|s\d|g\d|pdp-fx|fit-)/;
function trk_cls(el){ if(!el || !el.classList) return ''; for(var i=0;i<el.classList.length;i++){ var c = el.classList[i]; if(!TRK_SKIP_CLS.test(c)) return c; } return ''; }
function trk_slug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40); }
/* ids and test ids often carry a product id (pcard-<id>); strip it so the name stays the same for every product */
function trk_noPid(s){ s = String(s||''); try{ DB.products.forEach(function(p){ if(s.indexOf(p.id)>=0) s = s.split(p.id).join(''); }); }catch(e){} return s.replace(/[-_]+$/,''); }
/* nearest named place: modal title, an id, a test id, or a component class */
function trk_place(el){
  try{
    var m = el.closest('.modal'); if(m) return 'modal_'+trk_slug(m.getAttribute('aria-label'));
    var n = el.parentElement, hops = 0;
    while(n && n.id!=='app' && n!==document.body && hops<14){
      var isCard = n.classList && n.classList.contains('pcard');          /* cards: name the section they sit in */
      if(!isCard){
        if(n.id && n.id!=='app') return trk_slug(trk_noPid(n.id));
        var tid = n.getAttribute && n.getAttribute('data-testid'); if(tid) return trk_slug(trk_noPid(tid));
        var c = trk_cls(n); if(c && c.indexOf('-')>0) return trk_slug(c);
      }
      if(/^(HEADER|FOOTER|ASIDE)$/.test(n.tagName)) return n.tagName.toLowerCase();
      n = n.parentElement; hops++;
    }
  }catch(e){}
  return (typeof CUR!=='undefined' && CUR && CUR.page) ? CUR.page+'_page' : 'page';
}
/* a stable id for the tapped control itself */
function trk_btnId(el){
  try{
    var tid = el.getAttribute('data-testid'); if(tid && !/^pcard-/.test(tid)) return trk_slug(trk_noPid(tid));
    var act = el.getAttribute('data-act'); var c = trk_cls(el);
    return trk_slug(act || c || el.tagName.toLowerCase())+'@'+trk_place(el);
  }catch(e){ return 'tap@'+trk_place(el); }
}

/* ---------- the click / submit context ---------- */
function trk_setCtx(c){ TRACK_CTX = c; setTimeout(function(){ if(TRACK_CTX===c) TRACK_CTX = null; }, 0); }
function trk_ctx(){ return (TRACK_CTX && Date.now()-TRACK_CTX.t < 3000) ? TRACK_CTX : {act:null, el:null, t:0}; }

/* ---------- describe a bag line ---------- */
function trk_lineFields(line){
  var f = {};
  try{
    if(line.kind==='set'){
      var its = line.items||[], first = its[0]||{};
      f.pid = first.product||null; f.line = 'set'; f.set_id = line.refId||null; f.set_name = line.name||null; f.items = its.length;
      f.qty = line.qty||1; f.size = its.map(function(x){ return x.size; }).join('+'); f.colour = its.map(function(x){ return x.color; }).join('+');
      f.price = Number(line.price)||0;
    } else {
      var p = P(line.product); f.pid = line.product; f.line = 'item'; f.qty = line.qty||1; f.size = line.size||null; f.colour = line.color||null;
      f.price = p ? p.price*(line.qty||1) : null;
    }
  }catch(e){}
  return f;
}
function trk_pids(line){ return line && line.kind==='set' ? (line.items||[]).map(function(x){ return x.product; }) : [line && line.product]; }

/* ---------- add_to_bag / order_now / re_add / new_add_after_remove ---------- */
function trk_addSource(ctx){
  var spec = ctx.act ? TRACK_ADD_SOURCES[ctx.act] : null, src = null, offer = null;
  if(spec){ src = (spec.bar && ctx.el && ctx.el.closest && ctx.el.closest('.mbar')) ? spec.bar : spec.src; offer = spec.offer||null; }
  else if(ctx.el && ctx.el.closest){
    for(var i=0;i<TRACK_ADD_FALLBACK.length;i++){ if(ctx.el.closest(TRACK_ADD_FALLBACK[i].sel)){ src = TRACK_ADD_FALLBACK[i].src; offer = TRACK_ADD_FALLBACK[i].offer||null; break; } }
    if(!src) src = trk_btnId(ctx.el);
  }
  if(!src) src = (CUR && CUR.page ? CUR.page : 'shop')+'_page';
  /* arrived through an offer block? */
  var a = TRACK_S.arrival;
  if(!offer && a && CUR && a.path===CUR.path && Date.now()-a.at < 30*60000) offer = a.offer;
  return {spec:spec, src:src, offer:offer};
}
function trk_afterAdd(line, f){
  var pids = trk_pids(line), removed = TRACK_S.removed||[];
  var back = pids.filter(function(id){ return removed.indexOf(id)>=0; })[0];
  if(back){ trk_log('re_add', {pid:back, src:f.src, qty:f.qty, size:f.size, colour:f.colour, price:f.price}); }
  else if(removed.length){ trk_log('new_add_after_remove', {pid:pids[0], src:f.src, qty:f.qty, size:f.size, colour:f.colour, price:f.price, after:TRACK_S.lastRemoved}); }
}
function trk_onAdd(line, res){
  var ctx = trk_ctx(), s = trk_addSource(ctx), direct = !!(s.spec && s.spec.direct);
  if(!direct && !(res && res.added)) return;                     /* refused repeat / already in bag */
  var f = trk_lineFields(line); f.src = s.src;
  if(line.kind==='set' && !s.offer) s.offer = line.source==='custom' ? 'custom_set' : 'combo';
  f.from_offer = !!s.offer; f.offer = s.offer || null;
  if(direct){
    if(ctx.orderNow){ ctx.orderNow.lines = (ctx.orderNow.lines||1)+1; trk_save(); }
    else { f.lines = 1; f.added = !!(res && res.added); ctx.orderNow = trk_log('order_now', f); }
    TRACK_S.directAt = Date.now(); trk_sSave();
  } else trk_log('add_to_bag', f);
  trk_afterAdd(line, f);
}

/* ---------- remove_from_bag ---------- */
function trk_onRemove(line){
  var ctx = trk_ctx(), spec = ctx.act ? TRACK_REMOVE_SOURCES[ctx.act] : null;
  if(!spec || !line) return;
  var f = trk_lineFields(line); f.src = spec.src; f.reason = spec.reason;
  trk_log('remove_from_bag', f);
  var r = TRACK_S.removed || (TRACK_S.removed = []);
  trk_pids(line).forEach(function(id){ if(id && r.indexOf(id)<0) r.push(id); });
  TRACK_S.lastRemoved = f.pid; trk_sSave();
}

/* ---------- wrap a global function: original first, result untouched ---------- */
function trk_wrapFn(name, before, after){
  try{
    var orig = window[name]; if(typeof orig!=='function' || orig._trk) return false;
    var w = function(){
      var memo; try{ memo = before ? before.apply(this, arguments) : undefined; }catch(e){}
      var out = orig.apply(this, arguments);
      try{ if(after) after(out, memo, arguments); }catch(e){}
      return out;
    };
    w._trk = true; w._orig = orig;
    window[name] = w;
    return window[name]===w;
  }catch(e){ return false; }
}
function trk_wrapAct(name, before, after){
  try{
    var orig = ACT[name]; if(typeof orig!=='function' || orig._trk) return false;
    var w = function(el, ev){
      var memo; try{ memo = before ? before(el, ev) : undefined; }catch(e){}
      var out = orig.apply(this, arguments);
      try{ if(after) after(el, memo); }catch(e){}
      return out;
    };
    w._trk = true; ACT[name] = w; return true;
  }catch(e){ return false; }
}

var TRACK_HOOKS = {};   /* name -> attached? (read by the owner page) */
(function(){
  TRACK_HOOKS.bagAdd = trk_wrapFn('bagAdd', null, function(res, m, args){ trk_onAdd(args[0]||{}, res); });

  TRACK_HOOKS.bagRemove = trk_wrapFn('bagRemove', function(id){
    for(var i=0;i<ST.bag.length;i++) if(ST.bag[i].id===id) return JSON.parse(JSON.stringify(ST.bag[i]));
    return null;
  }, function(out, line){ if(line && !ST.bag.some(function(l){ return l.id===line.id; })) trk_onRemove(line); });

  TRACK_HOOKS.placeOrder = trk_wrapFn('placeOrder', function(form){
    var ph = ''; try{ ph = normPhone(form && form.phone); }catch(e){}
    var ctx = trk_ctx();
    return {auth:trk_auth(), isNew:!!(ph && !ST.accounts[ph]), page:CUR.page, path:CUR.path, items:bagCount(),
      via: (ctx.act && TRACK_ADD_SOURCES[ctx.act] && TRACK_ADD_SOURCES[ctx.act].src==='landing_page') || /^landing/.test(String(form && form.source||'')) ? 'landing' : (TRACK_S.via || 'bag')};
  }, function(id, m){
    if(!id || !m) return;
    var done = function(){
      try{
        var o = ST.orders[id] || {}, l0 = (o.lines||[])[0] || {};
        var base = {page:m.page, path:m.path, auth:m.auth, pid:l0.product||null};
        trk_log('purchase', Object.assign({order_id:id, total:o.total, items:m.items, via:m.via, payment:o.payment||null, pay_label:o.payLabel||null, new_customer:m.isNew, src:m.via==='landing'?'landing_page':'checkout'}, base));
        if(m.auth==='guest') trk_log('guest_checkout', Object.assign({order_id:id, via:m.via, src:m.via==='landing'?'landing_page':'checkout'}, base));
        if(m.isNew) trk_log('signup', Object.assign({order_id:id, method:'auto_at_checkout', src:m.via==='landing'?'landing_page':'checkout'}, base));
        TRACK_S.via = ''; TRACK_S.directAt = 0; TRACK_S.removed = []; TRACK_S.lastRemoved = null; trk_sSave();
      }catch(e){}
    };
    /* the checkout corrects delivery / offer on the order right after placeOrder returns — read it once that code has run */
    try{ Promise.resolve().then(done); }catch(e){ setTimeout(done, 0); }
  });

  TRACK_HOOKS.login = trk_wrapFn('login', function(){ return trk_auth(); }, function(ok, pre){
    if(ok) trk_log('login', {method:'password', src:trk_ctx().act || 'login', auth:'member', pid:null});
  });
  TRACK_HOOKS.logout = trk_wrapFn('logout', function(){ return trk_auth(); }, function(o, pre){
    if(pre==='member') trk_log('logout', {src:trk_ctx().act || 'account', auth:'member', pid:null});
  });

  /* product_view + checkout_start, read off every page render */
  TRACK_HOOKS.render = trk_wrapFn('render', null, function(){
    var prev = TRACK_LAST; TRACK_LAST = {page:CUR.page, path:CUR.path};
    if(CUR.page==='product' && prev.path!==CUR.path){
      var p = P(CUR.params[0]); if(p) trk_log('product_view', {pid:p.id, price:p.price, from:prev.page, src:prev.page ? prev.page+'_page' : 'direct_link'});
    }
    if(CUR.page!=='checkout' && CUR.page!=='thanks' && TRACK_S.via && prev.page==='checkout'){ TRACK_S.via = ''; trk_sSave(); }
    if(CUR.page==='checkout' && prev.page!=='checkout'){
      var direct = TRACK_S.directAt && Date.now()-TRACK_S.directAt < 15000;
      var tot = null; try{ tot = bagTotals(); }catch(e){}
      TRACK_S.via = direct ? 'order_now' : 'bag'; TRACK_S.directAt = 0; trk_sSave();
      var first = ST.bag[0] ? trk_pids(ST.bag[0])[0] : null;
      trk_log('checkout_start', {via:TRACK_S.via, items:tot?tot.count:null, total:tot?tot.total:null, from:prev.page, src:direct?'order_now':(prev.page||'direct')+'_page', pid:first});
    }
  });

  /* thank-you page add-on writes straight into the order */
  TRACK_HOOKS['ACT ty-add'] = trk_wrapAct('ty-add', function(el){
    var o = ST.orders[el.getAttribute('data-id')]; return o ? (o.lines||[]).length : -1;
  }, function(el, n){
    var o = ST.orders[el.getAttribute('data-id')]; if(!o || n<0 || (o.lines||[]).length<=n) return;
    var l = o.lines[o.lines.length-1], f = trk_lineFields({kind:'item', product:l.product, color:l.color, size:l.size, qty:l.qty||1});
    f.src = 'thanks_add_on'; f.from_offer = true; f.offer = 'upsell'; f.order_id = o.id;
    trk_log('add_to_bag', f); trk_afterAdd({kind:'item', product:l.product}, f);
  });
  /* Save for later also saves to the wishlist */
  TRACK_HOOKS['ACT bag-save'] = trk_wrapAct('bag-save', function(el){
    var id = el.getAttribute('data-id'), l = ST.bag.filter(function(x){ return x.id===id; })[0];
    return l && l.kind==='item' ? {pid:l.product, had:ST.wishlist.indexOf(l.product)>=0} : null;
  }, function(el, m){ if(m && !m.had && ST.wishlist.indexOf(m.pid)>=0) trk_log('wishlist_add', {pid:m.pid, src:'bag_save_for_later'}); });
})();

/* ---------- capture listeners ---------- */
function trk_waHref(h){ return /^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com|wa\.link)\b/i.test(String(h||'')); }
function trk_waButton(a){
  for(var i=0;i<TRACK_WA_BUTTONS.length;i++){ var b = TRACK_WA_BUTTONS[i]; try{ if(a.closest(b.sel)) return {id:b.id, label:b.label}; }catch(e){} }
  var tid = a.getAttribute('data-testid'), place = trk_place(a), base = tid ? trk_slug(tid) : (a.classList.contains('wa-btn') ? 'wa_button' : (trk_cls(a) || 'link'));
  var txt = (a.textContent||'').replace(/\s+/g,' ').trim().slice(0,40) || a.getAttribute('aria-label') || 'WhatsApp';
  return {id:trk_slug(base)+'@'+place, label:txt};
}
function trk_searchCount(q){ try{ return typeof srch_run==='function' ? srch_run(q).length : null; }catch(e){ return null; } }
function trk_hashPath(h){ h = String(h||''); var i = h.indexOf('#'); if(i<0) return null; h = h.slice(i+1); var q = h.indexOf('?'); return q>=0 ? h.slice(0,q) : h; }

document.addEventListener('click', function(ev){
  try{
    var t = ev.target; if(!t || !t.closest) return;
    var actEl = t.closest('[data-act]');
    trk_setCtx({act:actEl ? actEl.getAttribute('data-act') : null, el:actEl || t, t:Date.now()});
    if(CUR && /^admin/.test(String(CUR.page||''))) return;   /* the owner's own clicks are not shopper data */

    /* WhatsApp */
    var a = t.closest('a[href]');
    if(a && trk_waHref(a.getAttribute('href'))){
      var b = trk_waButton(a), share = /wa\.me\/\?|whatsapp\.com\/send\?(?!.*phone)/i.test(a.getAttribute('href'));
      trk_log('whatsapp_click', {src:b.id, btn:b.id, btn_label:b.label, kind:share?'share':'chat'});
    }
    /* plain taps */
    if(actEl){
      var name = actEl.getAttribute('data-act'), tap = TRACK_TAPS[name];
      if(tap && typeof ACT!=='undefined' && ACT[name]){
        var evName = typeof tap.ev==='function' ? tap.ev(actEl) : tap.ev;
        var pid = actEl.getAttribute('data-id') || actEl.getAttribute('data-pid') || trk_pagePid();
        var extra = {pid:pid, src:trk_btnId(actEl)};
        if(evName==='all_colours_click'){ var pp = pid && P(pid); if(pp) extra.colours = pp.colors.length; }
        trk_log(evName, extra);
      }
    }
    /* search suggestion */
    var sg = t.closest('[data-href*="#/search?q="], a[href*="#/search?q="]');
    if(sg){
      var href = sg.getAttribute('data-href') || sg.getAttribute('href'), m = href.match(/[?&]q=([^&]*)/);
      var term = m ? decodeURIComponent(m[1].replace(/\+/g,' ')).trim() : '';
      if(term) trk_log('search', {term:term.toLowerCase(), method:'suggestion', results:trk_searchCount(term), src:sg.closest('.modal') ? 'search_box_chip' : trk_btnId(sg), pid:null});
    }
    /* offer block that opens another page */
    for(var i=0;i<TRACK_OFFER_ENTRIES.length;i++){
      var o = t.closest(TRACK_OFFER_ENTRIES[i].sel);
      if(o){
        var link = o.matches('a[href]') ? o : (o.closest('a[href]') || o.querySelector('a[href]'));
        var path = link ? trk_hashPath(link.getAttribute('href')) : null;
        if(actEl && actEl!==o && o.contains(actEl)) break;      /* a button inside the block (e.g. a heart) is not a visit */
        if(path){ TRACK_S.arrival = {offer:TRACK_OFFER_ENTRIES[i].offer, path:path, at:Date.now()}; trk_sSave(); }
        break;
      }
    }
  }catch(e){}
}, true);

document.addEventListener('submit', function(ev){
  try{
    var f = ev.target && ev.target.closest ? ev.target.closest('[data-submit]') : null; if(!f) return;
    var name = f.getAttribute('data-submit');
    trk_setCtx({act:name, el:(ev.submitter || f), t:Date.now()});
    if(name==='search' && typeof SUBMIT!=='undefined' && SUBMIT.search){
      var inp = f.querySelector('[name=q]'), q = inp ? String(inp.value||'').trim() : '';
      if(q) trk_log('search', {term:q.toLowerCase(), method:'submit', results:trk_searchCount(q), src:f.closest('.modal') ? 'search_box' : 'search_page', pid:null});
    }
  }catch(e){}
}, true);

/* ====================================================================================
   PUBLIC API + demo data
   ==================================================================================== */
function trk_demo(target){
  target = target || 300;
  var prods = DB.products.filter(function(p){ return !p.hidden; });
  var main = prods.filter(function(p){ return p.cat!=='extras'; }); if(!main.length) main = prods;
  var pick = function(a){ return a[Math.floor(Math.random()*a.length)]; };
  var chance = function(x){ return Math.random() < x; };
  var terms = ['polo','panjabi','hoodie','chino','oxford shirt','black polo','t-shirt','eid panjabi','jogger','navy polo','white shirt','denim'];
  DB.categories.filter(function(c){ return !c.hidden; }).forEach(function(c){ terms.push(String(c.name).toLowerCase()); });
  var waPages = {product:['header_icon','pdp_questions','size_chart_help'], home:['floating_disc','footer'], category:['floating_disc','footer'],
    bag:['floating_disc','wa_button@bag_page'], checkout:['checkout_side_help','checkout_help'], landing:['slim_header_icon','wa_button@landing_page'], search:['wa_button@search_empty']};
  var waLabel = {}; TRACK_WA_BUTTONS.forEach(function(b){ waLabel[b.id] = b.label; });
  var addSrc = [['pdp_bar',30],['pdp_cta',22],['combo_page',12],['set_builder',7],['pdp_duo_popup',8],['bag_duo_offer',5],['checkout_upsell',4],['thanks_add_on',3]];
  var offerOf = {combo_page:'combo', set_builder:'custom_set', pdp_duo_popup:'duo_offer', bag_duo_offer:'duo_offer', checkout_upsell:'upsell', thanks_add_on:'upsell'};
  var wpick = function(list){ var tot = list.reduce(function(s,x){ return s+x[1]; },0), r = Math.random()*tot; for(var i=0;i<list.length;i++){ r -= list[i][1]; if(r<=0) return list[i][0]; } return list[0][0]; };
  var pays = [['cod',62],['bkash',24],['nagad',9],['card',5]];
  var sizesOf = function(p){ return p.sizes && p.sizes.length ? p.sizes : ['M']; };
  var out = [], now = Date.now(), seq = 0, D = 86400000;
  var mk = function(sess, t, ev, page, path, f){
    var e = {id:'d'+(seq++)+Math.random().toString(36).slice(2,6), t:t, ev:ev, page:page, path:path, pid:null, cat:null, src:null, auth:sess.auth, sid:sess.sid, demo:true};
    for(var k in f) e[k] = f[k]; if(e.pid && !e.cat) e.cat = trk_catOf(e.pid); out.push(e); return e;
  };
  var guard = 0;
  while(out.length < target && guard++ < 400){
    var dayAgo = chance(.2) ? 0 : Math.floor(Math.random()*(chance(.85)?7:30));
    var start = now - dayAgo*D - Math.floor(Math.random()*(dayAgo===0 ? Math.min(D, now % D || D) * .9 : D));
    var s = {sid:'demo'+Math.random().toString(36).slice(2,8), auth:chance(.3)?'member':'guest'}, t = start;
    var step = function(){ t += 20000 + Math.floor(Math.random()*90000); return t; };
    var prevPage = chance(.35) ? 'landing' : 'home';
    if(s.auth==='member' && chance(.35)) mk(s, step(), 'login', 'login', '/login', {method:'password', src:'login-form'});
    if(chance(.45)){ var term = pick(terms); mk(s, step(), 'search', prevPage==='landing'?'home':prevPage, '/', {term:term, method:chance(.7)?'submit':'suggestion', results:trk_searchCount(term), src:chance(.6)?'search_box':'search_page'}); prevPage = 'search'; }
    if(chance(.25)){ var wp0 = pick(['home','category','search']); var wb0 = pick(waPages[wp0]); mk(s, step(), 'whatsapp_click', wp0, '/', {src:wb0, btn:wb0, btn_label:waLabel[wb0] || 'WhatsApp button', kind:'chat'}); }
    var views = 1 + Math.floor(Math.random()*4), bagged = [], direct = null;
    for(var v=0; v<views; v++){
      var p = pick(main), path = '/p/'+p.id;
      mk(s, step(), 'product_view', 'product', path, {pid:p.id, price:p.price, from:prevPage, src:prevPage+'_page'}); prevPage = 'product';
      if(chance(.22)) mk(s, step(), 'all_colours_click', 'product', path, {pid:p.id, colours:p.colors.length, src:'pdp-allcolors@pdp_colour'});
      if(chance(.28)) mk(s, step(), 'size_chart_click', 'product', path, {pid:p.id, src:'open_chart'});
      if(chance(.12)){ mk(s, step(), 'wishlist_add', 'product', path, {pid:p.id, src:'pdp_wish'}); if(chance(.2)) mk(s, step(), 'wishlist_remove', 'product', path, {pid:p.id, src:'pdp_wish'}); }
      if(chance(.14)){ var wb = pick(waPages.product); mk(s, step(), 'whatsapp_click', 'product', path, {pid:p.id, src:wb, btn:wb, btn_label:waLabel[wb] || 'WhatsApp button', kind:'chat'}); }
      var sz = pick(sizesOf(p)), col = pick(p.colors);
      if(!direct && chance(.07)){ direct = mk(s, step(), 'order_now', 'product', path, {pid:p.id, src:chance(.6)?'pdp_bar':'pdp_cta', qty:1, size:sz, colour:col, price:p.price, line:'item', lines:1, from_offer:false, offer:null, added:true}); continue; }
      if(chance(.34)){
        var src = wpick(addSrc), offer = offerOf[src] || (chance(.08)?'complete_the_look':null);
        var pg = src==='combo_page'?'combo':src==='set_builder'?'set':src==='bag_duo_offer'?'bag':src==='checkout_upsell'?'checkout':src==='thanks_add_on'?'thanks':'product';
        mk(s, step(), 'add_to_bag', pg, pg==='product'?path:'/'+pg, {pid:p.id, src:src, qty:1, size:sz, colour:col, price:p.price, line:(src==='combo_page'||src==='set_builder')?'set':'item', from_offer:!!offer, offer:offer});
        bagged.push(p);
      }
    }
    if(bagged.length && chance(.18)){
      var rp = pick(bagged); mk(s, step(), 'remove_from_bag', 'bag', '/bag', {pid:rp.id, src:'bag', reason:'removed', qty:1, price:rp.price, line:'item'});
      if(chance(.45)) mk(s, step(), 're_add', 'product', '/p/'+rp.id, {pid:rp.id, src:'pdp_bar', qty:1, price:rp.price});
      else if(chance(.5)){ var np = pick(main); mk(s, step(), 'new_add_after_remove', 'product', '/p/'+np.id, {pid:np.id, src:'pdp_bar', qty:1, price:np.price, after:rp.id}); }
    }
    var buy = function(via, pid, items, total){
      var pay = wpick(pays), oid = 'EX-D'+Math.floor(1000+Math.random()*8999);
      mk(s, step(), 'purchase', via==='landing'?'landing':'checkout', via==='landing'?'/l/polo-duo':'/checkout', {pid:pid, order_id:oid, total:total, items:items, via:via, payment:pay, pay_label:null, new_customer:s.auth==='guest', src:via==='landing'?'landing_page':'checkout'});
      if(s.auth==='guest'){ mk(s, t, 'guest_checkout', 'checkout', '/checkout', {pid:pid, order_id:oid, via:via, src:'checkout'}); if(chance(.8)) mk(s, t, 'signup', 'checkout', '/checkout', {pid:pid, order_id:oid, method:'auto_at_checkout', src:'checkout'}); }
    };
    if(direct){
      mk(s, step(), 'checkout_start', 'checkout', '/checkout', {pid:direct.pid, via:'order_now', items:1, total:direct.price, from:'product', src:'order_now'});
      if(chance(.62)) buy('order_now', direct.pid, 1, direct.price + 80);
    } else if(bagged.length && chance(.58)){
      var total = bagged.reduce(function(x,p){ return x+p.price; },0);
      mk(s, step(), 'checkout_start', 'checkout', '/checkout', {pid:bagged[0].id, via:'bag', items:bagged.length, total:total, from:'bag', src:'bag_page'});
      if(chance(.66)) buy('bag', bagged[0].id, bagged.length, total + (total>=1500?0:80));
      else if(chance(.3)){ var wb2 = pick(waPages.checkout); mk(s, step(), 'whatsapp_click', 'checkout', '/checkout', {src:wb2, btn:wb2, btn_label:waLabel[wb2] || 'WhatsApp button', kind:'chat'}); }
    }
    if(prevPage!=='product' && chance(.04)){ var lp = pick(main); buy('landing', lp.id, 1, lp.price); }
  }
  out = out.filter(function(e){ return e.t <= now; });
  var list = trk_load();
  for(var i=0;i<out.length;i++) list.push(out[i]);
  list.sort(function(a,b){ return a.t-b.t; });
  if(list.length > TRACK_CAP) list.splice(0, list.length - TRACK_CAP);
  trk_save();
  return out.length;
}

window.EXTRACK = {
  log: function(name, fields){ return trk_log(name, fields); },
  all: function(){ return trk_load().slice(); },
  clear: function(){ TRACK_MEM = []; try{ localStorage.removeItem(TRACK_KEY); }catch(e){} TRACK_S.removed = []; TRACK_S.lastRemoved = null; TRACK_S.arrival = null; trk_sSave(); },
  demo: function(n){ try{ return trk_demo(n); }catch(e){ return 0; } },
  events: TRACK_EVENTS, buttons: TRACK_WA_BUTTONS, pages: TRACK_PAGE_LABEL, hooks: TRACK_HOOKS
};
