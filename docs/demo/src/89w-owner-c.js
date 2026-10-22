/* =====================================================================
   89w-owner-c.js — owner's desktop review of V12 (R15 Note 51), part C:
   the Added-to-bag DRAWER (B1–B3), the BAG page offer area (G1–G3) and
   the CHECKOUT look (K1–K8). Sawdagor সওদাগর · Shilpi শিল্পী · 20 Oct.

   Every new look is an EXTRA option in Admin › Settings; the look the shop
   had stays the default, except K1 (the owner asked for the new checkout
   widths as the default, the old ones stay one click away):
     atb.style        A (default) — the drawer shows the item just added
                      B           — every bag item, newest on top
     atb.bMax         how many bag lines Style B lists before "+N more"
     atb.crossTitle   heading over the products in the drawer (+ Bengali)
     co.layout        wide (default, K1) | classic (the widths before)
     bag.upsellStyle  current (default) | cards | side   (G3, desktop)
   Desktop only (min-width 1024 px): the phone draws exactly what it drew.
   Totals are never computed here — every figure comes from bagTotals(),
   the same call the bag, the summary, checkout and the invoice use.
   ===================================================================== */
if(typeof SHOP_OPT_DEF!=='undefined'){
  var OWNC_DEF = {
    'atb.style'        : 'B',      /* CN-009 (Note 52): the whole-bag drawer is the default; A stays one click away */
    'atb.bMax'         : 'auto',   /* Note 54 #4: as many bag lines as fit (a number = at most that many) */
    'atb.crossTitle'   : 'Complete the look',
    'atb.crossTitleBn' : 'সাথে মানাবে',
    'atb.justAdded'    : 'Just added',
    'atb.justAddedBn'  : 'এইমাত্র যোগ হলো',
    'atb.bagHead'      : 'Bag',
    'atb.bagHeadBn'    : 'ব্যাগ',
    'co.layout'        : 'wide',
    'bag.upsellStyle'  : 'side'    /* CN-009: ONE "You may also like" by default (offer list + 3 products); the others stay selectable */
  };
  Object.keys(OWNC_DEF).forEach(function(k){ if(SHOP_OPT_DEF[k]===undefined) SHOP_OPT_DEF[k] = OWNC_DEF[k]; });
}
function ownc_desk(){ return typeof dkb_desk==='function' && dkb_desk(); }
function atbC_style(){ return String(OPT('atb.style'))==='B' ? 'B' : 'A'; }
function coC_layout(){ return String(OPT('co.layout'))==='classic' ? 'classic' : 'wide'; }
function bagC_upsStyle(){ var v = String(OPT('bag.upsellStyle')); return v==='cards' || v==='side' ? v : 'current'; }

/* ---------- Admin › Settings rows (English + Bengali, like 89s) ---------- */
setTimeout(function(){
  if(typeof ZS_SETTINGS==='undefined' || typeof ZS_GROUPS==='undefined' || typeof zs_S!=='function') return;
  var row = function(id, g, en, bn, type, where, see, extra){
    var s = {id:'opt.'+id, g:g, en:en, bn:bn, type:type, where:where, see:see||'',
      get:function(){ return OPT(id); }, set:function(v){ optSet(id, v); },
      def:function(){ return SHOP_OPT_DEF[id]; }, reset:function(){ optReset(id); }};
    if(extra) for(var k in extra) s[k] = extra[k];
    return s;
  };
  [
    row('atb.style', 'ownc', 'Added-to-bag drawer style (desktop)', '"ব্যাগে যোগ হয়েছে" ডানের প্যানেলের স্টাইল (ডেস্কটপ)', 'sel', 'Product page · combo and set pages, after Add to bag', '#/p/heavyweight-hoodie',
      {opts:[['B', 'B — every item in the bag, newest on top (default)'], ['A', 'A — only the item just added']]}),
    row('atb.bMax', 'ownc', 'Style B: bag lines shown before "+N more"', 'স্টাইল B: "+N more" এর আগে কয়টা পণ্য দেখাবে', 'sel', 'Added-to-bag drawer, style B', '#/p/heavyweight-hoodie',
      {opts:[['auto','As many as fit the screen (default)'], ['3','At most 3'], ['4','At most 4'], ['5','At most 5'], ['6','At most 6'], ['8','At most 8']]}),
    row('atb.crossTitle', 'ownc', 'Heading over the products in the drawer (English)', 'প্যানেলের নিচের পণ্যগুলোর শিরোনাম — ইংরেজি', 'text', 'Added-to-bag drawer', '#/p/heavyweight-hoodie'),
    row('atb.crossTitleBn', 'ownc', 'Same heading (Bengali)', 'একই শিরোনাম — বাংলা', 'text', 'Added-to-bag drawer in বাং', '#/p/heavyweight-hoodie'),
    row('atb.justAdded', 'ownc', 'Style B: tag on the item just added (English)', 'স্টাইল B: এইমাত্র যোগ হওয়া পণ্যের ট্যাগ — ইংরেজি', 'text', 'Added-to-bag drawer, style B', '#/p/heavyweight-hoodie'),
    row('atb.justAddedBn', 'ownc', 'Same tag (Bengali)', 'একই ট্যাগ — বাংলা', 'text', 'Added-to-bag drawer, style B, in বাং', '#/p/heavyweight-hoodie'),
    row('atb.bagHead', 'ownc', 'Word before the item count in the drawer (English)', 'প্যানেলে পণ্যের সংখ্যার আগের শব্দ — ইংরেজি', 'text', 'Added-to-bag drawer', '#/p/heavyweight-hoodie'),
    row('atb.bagHeadBn', 'ownc', 'Same word (Bengali)', 'একই শব্দ — বাংলা', 'text', 'Added-to-bag drawer in বাং', '#/p/heavyweight-hoodie'),
    row('co.layout', 'ownc', 'Checkout widths (desktop)', 'চেকআউটের মাপ (ডেস্কটপ)', 'sel', 'Checkout', '#/checkout',
      {opts:[['wide', 'New — form 70 px narrower, order summary 60 px wider'], ['classic', 'Before — the earlier widths']]}),
    row('bag.upsellStyle', 'ownc', 'Bag page: offers and "You may also like" (desktop)', 'ব্যাগ পেজ: অফার আর "You may also like" অংশ (ডেস্কটপ)', 'sel', 'Bag page, under the bag', '#/bag',
      {opts:[['side', 'Side by side — offer list on the left, 3 products on the right (default)'], ['cards', 'Offer cards — one card per offer, then 4 products'], ['current', 'Offer box over 4 products (earlier)']]})
  ].forEach(function(r){ if(!zs_S(r.id)) ZS_SETTINGS.push(r); });
  if(!ZS_GROUPS.some(function(g){ return g[0]==='ownc'; })){
    var at = -1; ZS_GROUPS.forEach(function(g, i){ if(g[0]==='install') at = i; });
    var grp = ['ownc', 'Bag drawer, bag offers and checkout look (desktop)', 'ব্যাগ প্যানেল, ব্যাগের অফার আর চেকআউটের চেহারা (ডেস্কটপ)', 'Note 51'];
    if(at >= 0) ZS_GROUPS.splice(at, 0, grp); else ZS_GROUPS.push(grp);
  }
}, 0);

/* =====================================================================
   B1–B3 · the Added-to-bag drawer (desktop). One builder for the product
   page drawer and the combo / set drawer.
     o.testid  'bag-modal' (product page) | 'bag-drawer' (combo / set)
     o.top     the "just added" row(s), as each page draws them (Style A)
     o.extra   the product page's duo offer / two-size note
     o.added   ids of the bag lines just added (Style B marks them)
     o.rel     products that go with it (cross-sell)
   Rule 35 (owner): the drawer never says "add ৳X more" — free → say so,
   loudly, right above Checkout; not free → Cash on Delivery + size exchange.
   ===================================================================== */
function atbC_lineHTML(x, isNew){
  var l = x.line, pic, name, sub;
  if(l.kind==='set'){
    pic = (l.source==='auto' && typeof ca_setPhoto==='function') ? ca_setPhoto(ca_piecesOf(l.items), {layout:'thumb'}) : setImg(l.items, {ratio:'ratio-11'});
    name = typeof bag_setShort==='function' ? bag_setShort(l) : bagSetName(l.name);
    sub = (l.items||[]).map(function(it){ return COL(it.color).name+' · '+it.size; }).join(' + ');
  } else {
    var p = P(l.product); if(!p) return '';
    pic = productImg(p, l.color, {ratio:'ratio-11', label:false}); name = p.name;
    sub = COL(l.color).name+' · '+l.size+(l.qty>1 ? ' · ×'+l.qty : '');
  }
  return '<div class="atbc-li'+(isNew ? ' new' : '')+'" data-testid="atbc-line"><div class="atbc-lth">'+pic+'</div>'+
    '<div class="atbc-lt"><div class="atbc-ln">'+(isNew ? '<span class="atbc-new">'+esc(OPTL('atb.justAdded'))+'</span>' : '')+esc(name)+'</div><div class="atbc-ls">'+esc(sub)+'</div></div>'+
    '<div class="atbc-lp"><span class="price">'+fmt(x.price)+'</span>'+(x.regular>x.price ? '<span class="strike">'+fmt(x.regular)+'</span>' : '')+'</div></div>';
}
function atbC_moreTxt(n){ return esc('+'+n+' '+(ST.lang==='bn' ? 'টি আরও' : (n===1 ? 'more item' : 'more items'))+' · '+(ST.lang==='bn' ? 'ব্যাগে দেখুন' : 'View bag')); }
/* "Bag · 5 items  ৳6,850" — strong, the count and the total clear (B2) */
function atbC_head(tot){
  var n = ST.lang==='bn' ? tot.count+'টি পণ্য' : plural(tot.count, 'item');
  return '<div class="atbc-sum" data-testid="atbc-sum"><span class="atbc-bag">'+esc(OPTL('atb.bagHead'))+' · <span class="atbc-cnt">'+esc(n)+'</span></span><span class="price atbc-tot" data-testid="atbc-total">'+fmt(atbC_grand(tot))+'</span></div>';
}
/* the same figure as the bag page's Total (a member offer comes off there too) */
function atbC_grand(tot){ var off = typeof bag_bestOffer==='function' ? bag_bestOffer(tot.total) : {amount:0}; return tot.total - (off.amount||0); }
function atbC_savings(tot){
  var off = typeof bag_bestOffer==='function' ? bag_bestOffer(tot.total) : {amount:0};
  return (tot.discount>0 ? '<div class="atbc-save"><span>'+esc(ST.lang==='bn' ? 'সেটে সাশ্রয়' : 'Set savings')+'</span><span>'+fmt(-tot.discount)+'</span></div>' : '')+
    (off.amount ? '<div class="atbc-save"><span>'+esc(off.label)+'</span><span>'+fmt(-off.amount)+'</span></div>' : ''); }
function atbC_free(tot){
  var f = bag_freeDel(tot.total);
  if(f.free) return '<div class="atbc-free" data-testid="atbc-free">'+ico('truck',20)+'<span>'+esc(bag_freeOrderLine(f))+'</span></div>';
  return '<div class="atb-reassure atbc-reas"><span>'+ico('cash',15)+esc(ST.lang==='bn' ? 'ক্যাশ অন ডেলিভারি' : 'Cash on Delivery')+'</span><span>'+ico('swap',15)+esc(SET('exchange','windowHours')+(ST.lang==='bn' ? ' ঘণ্টায় সাইজ বদল' : '-hour size exchange'))+'</span></div>';
}
function atbC_btns(){
  return '<div class="pdp-bagbtns"><button type="button" class="btn btn-ghost" data-act="close-modal">'+esc(t('Keep shopping'))+'</button><a class="btn btn-secondary" href="#/bag">'+esc(t('View bag'))+'</a><a class="btn btn-primary" href="#/checkout">'+esc(t('Checkout'))+'</a></div>';
}
/* B1: more products, as many as the drawer has room for (atbC_fit trims) */
function atbC_cross(list){
  var inBag = {}; (ST.bag||[]).forEach(function(l){ if(l.kind==='item') inBag[l.product] = 1; else (l.items||[]).forEach(function(it){ inBag[it.product] = 1; }); });
  var seen = {}, picks = (list||[]).concat(typeof ups_picks==='function' ? ups_picks(16) : []).filter(function(x){
    if(!x || x.hidden || inBag[x.id] || seen[x.id]) return false; seen[x.id] = 1; return true; }).slice(0, 24);   /* Note 54 #4: enough to fill a tall screen; atbC_fit trims */
  if(!picks.length) return '';
  return '<div class="atb-x atbc-x" data-testid="atb-cross"><div class="atb-xh">'+esc(OPTL('atb.crossTitle'))+'</div>'+picks.map(function(x){
    return '<a class="atb-xi" href="#/p/'+esc(x.id)+'">'+productImg(x, x.colors[0], {ratio:'ratio-11', label:false})+
      '<span class="atb-xn">'+esc(x.name)+'</span><span class="atb-xp price">'+fmt(x.price)+'</span></a>';
  }).join('')+'</div>';
}
function atbC_drawer(o){
  var tot = bagTotals(), st = atbC_style(), added = o.added || [], body;
  if(st==='B'){
    var isNew = function(x){ return added.indexOf(x.line.id)>=0; };
    var rows = tot.lines.slice().reverse();
    rows.sort(function(a, b){ return isNew(b) - isNew(a); });           /* just added first, then newest → oldest */
    /* Note 54 #4: every line that fits is listed (atbC_fit hides the ones that
       don't); "+N more · View bag" shows only when the next line would not fit */
    var cap = String(OPT('atb.bMax')), max = /^\d+$/.test(cap) ? Math.max(1, parseInt(cap, 10)) : 99, more = Math.max(0, rows.length - max);
    body = '<div class="atbc-card atbc-b">'+atbC_head(tot)+
      '<div class="atbc-list">'+rows.slice(0, max).map(function(x){ return atbC_lineHTML(x, isNew(x)); }).join('')+'</div>'+
      '<a class="atbc-more" href="#/bag" data-testid="atbc-more" data-extra="'+more+'"'+(more>0 ? '' : ' hidden')+'><span class="atbc-mt">'+atbC_moreTxt(more)+'</span>'+ico('right',14)+'</a>'+
      atbC_savings(tot)+'</div>'+(o.extra || '');
  } else {
    body = (o.top || '')+(o.extra || '')+'<div class="atbc-card">'+atbC_head(tot)+atbC_savings(tot)+'</div>';
  }
  return '<div class="stack s16 atbc atbc-'+st+'" data-testid="'+esc(o.testid || 'bag-modal')+'" data-style="'+st+'">'+body+
    atbC_free(tot)+atbC_btns()+atbC_cross(o.rel)+'</div>';
}
/* the product page's bag lines that the last Add to bag touched */
function atbC_pdpAdded(p, a){
  var cols = [a.color].concat(a.extras || []);
  return (ST.bag||[]).filter(function(l){ return l.kind==='item' && l.product===p.id && l.size===a.size && cols.indexOf(l.color)>=0; }).map(function(l){ return l.id; });
}
/* Note 54 #4 (owner): the drawer is filled, never left half empty and never
   cut. Measured on every open and every resize:
     1. Style B lists bag lines while the buttons still end >= 12 px above
        the drawer's bottom; the next line that would not fit becomes
        "+N more · View bag".
     2. The products under the buttons ("Complete the look") take the rest:
        whole rows of two, as many as fit with >= 12 px below the last row.
        No room for one row = no block (and no empty heading). */
var ATBC_GAP = 12;
function atbC_fit(){
  var m = document.querySelector('.modal.atb-d'); if(!m) return;
  var bd = m.lastElementChild; if(!bd) return;
  var box = m.querySelector('.atbc-x'), its = box ? [].slice.call(box.querySelectorAll('.atb-xi')) : [];
  var lines = [].slice.call(m.querySelectorAll('.atbc-B .atbc-list .atbc-li')), more = m.querySelector('.atbc-B .atbc-more'), btns = m.querySelector('.atbc .pdp-bagbtns');
  var show = function(el, on){ if(el) el.style.display = on ? '' : 'none'; };
  lines.forEach(function(l){ show(l, true); }); its.forEach(function(i){ show(i, true); });
  [].forEach.call(m.querySelectorAll('.atbc-xs'), function(x){ x.remove(); });
  var bottom = function(){ return bd.getBoundingClientRect().top + bd.clientHeight; };
  var fitsTo = function(el){ return !el || (bd.scrollHeight <= bd.clientHeight + 1 && el.getBoundingClientRect().bottom + ATBC_GAP <= bottom() + 0.5); };
  var st = bd.scrollTop; bd.scrollTop = 0;
  /* 1 · the bag lines (the products are out of the way while we measure) */
  show(box, false);
  var extra = more ? (+more.getAttribute('data-extra') || 0) : 0, hid = 0;
  for(var i = lines.length - 1; i > 0 && !fitsTo(btns); i--){
    show(lines[i], false); hid++;
    if(more){ more.hidden = false; more.querySelector('.atbc-mt').innerHTML = atbC_moreTxt(extra + hid); }
  }
  if(more && !hid){ more.hidden = !(extra > 0); if(extra > 0) more.querySelector('.atbc-mt').innerHTML = atbC_moreTxt(extra); }
  /* 2 · the products fill what is left, in whole rows of two */
  if(box && its.length){
    show(box, true);
    var vis = its.length;
    var last = function(){ return its[vis - 1]; };
    while(vis > 0 && !fitsTo(last())){ vis--; show(its[vis], false); }
    if(vis % 2 && vis > 1){ vis--; show(its[vis], false); }
    if(vis < 2){ vis = 0; its.forEach(function(i){ show(i, false); }); show(box, false); }
    /* 3 · Note 54 #4 (round 2): room left under the last row but not enough for a whole row →
       one compact strip of small pictures and prices takes it, so the space is never left blank */
    var hid = its.filter(function(i){ return i.style.display === 'none'; });
    if(hid.length){
      var strip = document.createElement('div'); strip.className = 'atbc-xs'; strip.setAttribute('data-testid', 'atb-strip');
      if(!vis) strip.innerHTML = '<div class="atbc-xsh">'+esc(OPTL('atb.crossTitle'))+'</div>';
      var row = document.createElement('div'); row.className = 'atbc-xsr'; strip.appendChild(row);
      hid.slice(0, 5).forEach(function(i){ var c = i.cloneNode(true); c.style.display = ''; c.className = 'atbc-xsi'; c.setAttribute('aria-label', (c.querySelector('.atb-xn') || {}).textContent || ''); row.appendChild(c); });
      box.parentNode.insertBefore(strip, box.nextSibling);
      while(row.children.length > 2 && strip.getBoundingClientRect().width && strip.querySelector('.atbc-xsi:last-child').getBoundingClientRect().right > strip.getBoundingClientRect().right + 1) row.removeChild(row.lastChild);
      if(!fitsTo(strip)) strip.remove();
    }
  }
  bd.scrollTop = st;
}
/* B3: which style each visit saw, for the reports (Admin › Analytics) */
var ATBC_SEEN = null;
(function(){
  if(typeof MutationObserver==='undefined') return;
  new MutationObserver(function(){
    var m = document.querySelector('.modal.atb-d'); if(!m) return;
    requestAnimationFrame(atbC_fit);
    var root = m.querySelector('.atbc'); if(!root || typeof MODAL==='undefined' || !MODAL || MODAL._atbcLogged) return;
    MODAL._atbcLogged = true;
    try{ if(window.EXTRACK && EXTRACK.log) EXTRACK.log('atb_drawer_view', {style:root.getAttribute('data-style'), src:root.getAttribute('data-testid')==='bag-drawer' ? 'combo_set' : 'product'}); }catch(e){}
  }).observe(document.body, {childList:true});
  window.addEventListener('resize', function(){ if(document.querySelector('.modal.atb-d')) atbC_fit(); });
})();
if(typeof TRACK_EVENTS!=='undefined' && !TRACK_EVENTS.some(function(e){ return e.name==='atb_drawer_view'; }))
  TRACK_EVENTS.push({name:'atb_drawer_view', label:'Added-to-bag drawer seen', trigger:'The desktop Added-to-bag drawer opens', fields:'style (A | B), src (product | combo_set)'});
/* the report card: per visit (sid) — which style, and did that visit go on */
function atbC_anCard(E){
  var V = {};
  E.forEach(function(e){ if(e.ev==='atb_drawer_view' && e.sid){ var v = V[e.sid] = V[e.sid] || {style:e.style, co:false, buy:false}; if(!v.style) v.style = e.style; } });
  E.forEach(function(e){ var v = e.sid && V[e.sid]; if(!v) return; if(e.ev==='checkout_start') v.co = true; if(e.ev==='purchase') v.buy = true; });
  var S = {A:{n:0, co:0, buy:0}, B:{n:0, co:0, buy:0}};
  Object.keys(V).forEach(function(k){ var v = V[k], s = S[v.style==='B' ? 'B' : 'A']; s.n++; if(v.co) s.co++; if(v.buy) s.buy++; });
  var pct = function(a, b){ return b ? Math.round(a/b*100)+'%' : '—'; };
  var tr = function(k, lab){ var s = S[k]; return '<tr><td style="text-align:left;white-space:normal">'+esc(lab)+(atbC_style()===k ? ' <span class="xs muted">(on now)</span>' : '')+'</td><td>'+s.n+'</td><td>'+s.co+'<br><span class="xs muted">'+pct(s.co, s.n)+'</span></td><td>'+s.buy+'<br><span class="xs muted">'+pct(s.buy, s.n)+'</span></td></tr>'; };
  var body = '<table class="an-tbl" data-testid="an-atb" style="table-layout:fixed"><colgroup><col style="width:44%"><col><col><col></colgroup><thead><tr><th style="text-align:left">Style</th><th>Visits</th><th>Checkout</th><th>Ordered</th></tr></thead><tbody>'+
    tr('A', 'A · the item just added')+tr('B', 'B · the whole bag')+'</tbody></table>';
  return typeof an_card==='function' ? an_card('Added-to-bag drawer · A vs B', 'One row per visit that saw the desktop drawer. Switch the style in Admin › Settings to compare.', body) : '';
}

/* =====================================================================
   G2 + G3 · the bag page's offer box and "You may also like" (desktop)
   ===================================================================== */
/* G3 'cards': one card per tier, the same tier figures as the box */
function bagC_tierCards(cls){
  var o = typeof bag_tierOffer==='function' ? bag_tierOffer() : null; if(!o) return '';
  var catName = (o.cat ? t(o.cat.name) : 'items').toLowerCase();
  var have = ST.bag.reduce(function(s, l){ if(l.kind!=='item') return s; var p = P(l.product); return s + (p && (o.rule.mode==='sku' ? (o.rule.skus||[]).indexOf(p.id)>=0 : (o.rule.categories||[]).indexOf(p.cat)>=0) ? l.qty : 0); }, 0);
  var cards = o.tiers.map(function(x){
    var save = o.base.price * x.n - x.price, lab = o.labels[o.rule.id+':'+x.n] || bag_w('bag.w.tier', {n:x.n, cat:catName});
    return '<a class="bgc-tc" href="#/set/'+esc(o.rule.id)+'" data-testid="bagc-tier"><span class="bgc-tn">'+esc(lab)+'</span><span class="bgc-tp price">'+fmt(x.price)+'</span>'+
      (save>0 ? '<span class="bgc-ts">'+esc(bag_w('bag.w.tierSave', {save:fmt(save)}))+'</span>' : '')+
      '<span class="bgc-th">'+esc(have>=x.n ? (ST.lang==='bn' ? 'আপনার ব্যাগে হয়ে গেছে' : 'In your bag now') : (ST.lang==='bn' ? 'আরও '+(x.n-have)+'টা' : (x.n-have)+' more to go'))+'</span></a>';
  }).join('');
  return '<div class="bgc-tiers '+(cls||'')+'" data-testid="bag-tiers" data-rule="'+esc(o.rule.id)+'">'+
    '<div class="bgc-th1">'+esc(bag_w('bag.w.tiersTitle', {cat:catName}))+'</div>'+
    '<div class="bgc-trow">'+cards+'<a class="bgc-tgo" href="#/set/'+esc(o.rule.id)+'">'+esc(bag_w('bag.w.tiersGo', {cat:catName}))+ico('right',16)+'</a></div></div>';
}
/* G3 'side': a short ladder for the left column */
function bagC_tierLadder(cls){
  var o = typeof bag_tierOffer==='function' ? bag_tierOffer() : null; if(!o) return '';
  var catName = (o.cat ? t(o.cat.name) : 'items').toLowerCase();
  var rows = o.tiers.map(function(x){
    var save = o.base.price * x.n - x.price, lab = o.labels[o.rule.id+':'+x.n] || bag_w('bag.w.tier', {n:x.n, cat:catName});
    return '<div class="bgc-lr"><b>'+esc(lab)+'</b><span class="price">'+fmt(x.price)+'</span>'+(save>0 ? '<span class="bgc-ts">'+esc(bag_w('bag.w.tierSave', {save:fmt(save)}))+'</span>' : '<span></span>')+'</div>';
  }).join('');
  /* Note 54 #5 (round 2): what the bag already has, and the easy rule, fill the card's middle */
  var have = ST.bag.reduce(function(s, l){ if(l.kind!=='item') return s; var p = P(l.product); return s + (p && (o.rule.mode==='sku' ? (o.rule.skus||[]).indexOf(p.id)>=0 : (o.rule.categories||[]).indexOf(p.cat)>=0) ? l.qty : 0); }, 0);
  var next = o.tiers.filter(function(x){ return x.n > have; })[0];
  var bn = ST.lang==='bn';
  var prog = '<div class="bgc-lprog"><span class="bgc-lpb"><i style="width:'+Math.min(100, Math.round(have / Math.max(1, o.tiers[o.tiers.length-1].n) * 100))+'%"></i></span>'+
    '<span class="small">'+esc(bn ? 'আপনার ব্যাগে '+have+'টা' : 'In your bag: '+have)+(next ? ' · <b>'+esc(bn ? 'আর '+(next.n-have)+'টা নিলে '+fmt(next.price) : (next.n-have)+' more → '+next.n+' for '+fmt(next.price))+'</b>' : '')+'</span></div>';
  var tip = '<p class="bgc-ltip">'+ico('swap',14)+'<span>'+esc(bn ? 'যেকোনো রং আর সাইজ মেশাতে পারবেন — সেটের দাম নিজেই বসে যায়।' : 'Mix any colours and sizes — the set price comes off by itself.')+'</span></p>';
  return '<div class="bgc-ladder '+(cls||'')+'" data-testid="bag-tiers" data-rule="'+esc(o.rule.id)+'"><div class="bgc-th1">'+esc(bag_w('bag.w.tiersTitle', {cat:catName}))+'</div>'+rows+prog+tip+
    '<a class="btn btn-secondary btn-block bgc-lgo" href="#/set/'+esc(o.rule.id)+'">'+esc(bag_w('bag.w.tiersGo', {cat:catName}))+ico('right',16)+'</a></div>';
}
function bagC_tierBox(cls){
  var st = bagC_upsStyle();
  if(st==='cards') return bagC_tierCards(cls);
  if(st==='side') return bagC_tierLadder(cls);
  return typeof bag_tierBox==='function' ? bag_tierBox(cls) : '';
}

/* =====================================================================
   K1 + K4 · checkout (desktop): the summary column floats only while the
   whole card and the WhatsApp box fit the screen; when 5–6 items make it
   taller than the window it rides with the page instead, so nothing is
   ever cut off (it used to clip "Secure payment" and hide the help box).
   ===================================================================== */
function coC_fitFloat(){
  var fl = document.querySelector('.co-wrap .co-float'); if(!fl) return;
  fl.classList.remove('co-tall');
  if(!ownc_desk()) return;
  if(fl.scrollHeight > fl.clientHeight + 1) fl.classList.add('co-tall');
}
