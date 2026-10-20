/* ================= EXTAS demo — Bag page (50-bag.js) ================= */
/* small style injector used by the bag / checkout / thank-you modules */
function bag_css(id, css){ if(document.getElementById(id)) return; var s = document.createElement('style'); s.id = id; s.textContent = css; document.head.appendChild(s); }
bag_css('css-bag', [
  '.bg-wrap{padding-top:18px;padding-bottom:28px}',
  '@media(min-width:1024px){.bg-wrap{padding-top:36px;padding-bottom:48px}}',
  '.bg-title{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:16px}',
  '.bg-title .cnt{font-family:var(--font-body);font-size:14px;font-weight:500;color:var(--muted);letter-spacing:0;text-transform:none;margin-left:8px}',
  '.bg-lines{padding:0 16px}',
  '@media(min-width:1024px){.bg-lines{padding:0 24px}}',
  '.bg-line{display:grid;grid-template-columns:88px minmax(0,1fr);gap:14px;padding:16px 0;border-bottom:1px solid var(--line2)}',
  '.bg-lines>:last-child{border-bottom:0}',
  '@media(min-width:1024px){.bg-line{grid-template-columns:112px minmax(0,1fr);gap:20px;padding:20px 0}}',
  '.bg-thumb{display:block}',
  '.bg-thumb .pimg-label{display:none}',
  '.bg-name{color:var(--ink)!important;font-weight:600;font-size:15px;line-height:1.35}',
  'a.bg-name:hover{text-decoration:underline}',
  '.bg-qty button{width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center}',
  '.bg-qty button[disabled]{opacity:.3;cursor:not-allowed}',
  '.bg-acts{display:flex;gap:18px;flex-wrap:wrap;align-items:center}',
  '.bg-acts .link{font-weight:500;color:var(--text2);padding:8px 0}',
  '.bg-setitems{list-style:none;margin:0;padding:0;font-size:13px;display:flex;flex-direction:column;gap:3px}',
  '.bg-setitems li{padding-left:12px;position:relative}',
  '.bg-setitems li:before{content:"";position:absolute;left:0;top:9px;width:5px;height:1.5px;background:var(--muted)}',
  '.bg-inl{margin:0 0 16px}',
  '@media(min-width:1024px){.bg-inl{margin-left:132px}}',
  '.bg-ic{width:34px;height:34px;border-radius:50%;background:var(--surface);border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--brand)}',
  '.bg-offer .bg-ic{background:var(--surface);border-color:var(--brand-line)}',
  '.bg-brk{border:1px solid var(--line)}',
  '.bg-ok{color:var(--brand);flex-shrink:0}',
  '.bg-sr{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:5px 0}',
  '.bg-sr.disc{color:var(--brand)}',
  ':root[data-theme="festive"] .bg-sr.disc{color:var(--gold)}',
  '.bg-tot{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid var(--line);margin-top:10px;padding-top:12px;font-weight:700;font-size:16px}',
  '.bg-tot .price{font-size:24px}',
  '.bg-trust{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line2)}',
  '.bg-trust>div{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;font-size:11.5px;color:var(--text2);line-height:1.3}',
  '.bg-trust svg{color:var(--brand)}',
  '.bg-free .bar-progress{height:6px;border-radius:3px}.bg-free .bar-progress>div{height:6px}',
  '.bg-wa{background:var(--brand-tint);border:1px solid var(--brand-line);border-radius:12px 12px 12px 3px;padding:12px 14px;white-space:pre-line;font-size:14px;line-height:1.55;color:var(--ink)}',
  '.bg-wa.me{background:var(--surface);border-color:var(--line);border-radius:12px 12px 3px 12px;margin-left:auto;max-width:80%}',
  '.bg-empty{max-width:620px;margin:16px auto;padding:44px 20px}',
  '.bg-emptyic{width:72px;height:72px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;margin:0 auto}',
  '@media(max-width:1023px){.bg-mbar{bottom:57px}}',
  '.bg-mbar .btn{min-height:58px;font-size:17px;font-weight:800}'
].join('\n'));

/* ================= 36. ONE free-delivery rule for the whole journey =========
   The owner's single most important point: when delivery is already free, no
   charge may be shown anywhere. Three things can make it free, and until now
   only one of them (the cart threshold) was read on the bag and the checkout:
     1. the owner's running free-delivery campaign  (SET('delivery','freeCampaign'))
     2. a product that carries free delivery of its own (p.freeDelivery)
     3. the cart passing the free-delivery threshold (SET('delivery','freeOver'))
   Every delivery line on the bag, the checkout, the thank-you page and My
   account goes through bag_freeDel() so they can never disagree again. */
function bag_freeProduct(lines){
  lines = lines || ST.bag;
  return lines.some(function(l){
    if(l.kind==='set') return (l.items||[]).some(function(it){ var p = P(it.product); return !!(p && p.freeDelivery); });
    var p = P(l.product); return !!(p && p.freeDelivery);
  });
}
function bag_freeDel(total){
  var over = Number(SET('delivery','freeOver')) || 0;
  if(total==null) total = bagTotals().total;
  if(SET('delivery','freeCampaign')) return {free:true, why:'campaign', left:0};
  if(bag_freeProduct()) return {free:true, why:'product', left:0};
  if(total >= over) return {free:true, why:'threshold', left:0};
  return {free:false, why:'', left:Math.max(0, over-total)};
}
/* D-043 (Desktop Batch B, shared bug fix). "This item ships free" was said
   for a bag of three or five pieces. It now follows the BAG: one piece →
   "This item ships free"; more than one → the owner's own line for the whole
   order (setting bag.freeOrder / bag.freeOrderBn, Admin › Settings › Bag). */
if(typeof SHOP_OPT_DEF!=='undefined'){
  if(SHOP_OPT_DEF['bag.freeOrder']===undefined) SHOP_OPT_DEF['bag.freeOrder'] = 'Free delivery on this order, anywhere in Bangladesh.';
  if(SHOP_OPT_DEF['bag.freeOrderBn']===undefined) SHOP_OPT_DEF['bag.freeOrderBn'] = 'এই অর্ডারের ডেলিভারি সারা দেশে ফ্রি।';
  /* the one-line form for the Added-to-bag sheet / drawer */
  if(SHOP_OPT_DEF['bag.freeShort']===undefined) SHOP_OPT_DEF['bag.freeShort'] = 'Free delivery on this order';
  if(SHOP_OPT_DEF['bag.freeShortBn']===undefined) SHOP_OPT_DEF['bag.freeShortBn'] = 'এই অর্ডারে ডেলিভারি ফ্রি';
}
/* =====================================================================
   OWNER REVIEW · BAG PAGE (19 Oct, Sawdagor · Shilpi) — item 8.
   Every heading and offer label on the bag page in plain everyday English,
   each one a setting with a Bengali line (Admin › Settings › "Bag page
   words", 89u-bag-offers.js). {n} {price} {save} {size} {cat} {k} are
   filled in by the page. No combo nick-names ("Polo Duo") in the bag.
   ===================================================================== */
var BAG_WORDS = {
  'bag.w.alsoLike'  : ['You may also like', 'আপনার পছন্দ হতে পারে'],
  'bag.w.sameCat'   : ['From the same category as your bag.', 'আপনার ব্যাগের পণ্যের মতোই।'],
  'bag.w.buyN'      : ['Buy {n} and save', '{n}টা কিনলে সাশ্রয়'],
  'bag.w.buyNSub'   : ['{n} for {price} · you save {save}', '{n}টা {price}-এ · সাশ্রয় {save}'],
  'bag.w.applied'   : ['Buy {n} and save · applied', '{n}টা কিনলে সাশ্রয় · যোগ হয়েছে'],
  'bag.w.addOne'    : ['Add one more and save', 'আরেকটা নিলে সাশ্রয়'],
  'bag.w.addOneSub' : ['2 for {price} · size {size}', '২টা {price}-এ · সাইজ {size}'],
  'bag.w.setTitle'  : ['Buy these {n} together and save {save}', 'এই {n}টা একসাথে কিনলে সাশ্রয় {save}'],
  'bag.w.setSub'    : ['{what} · {price} for all {n}', '{what} · {n}টা মিলে {price}'],
  'bag.w.setAuto'   : ['Add {k} more and the lower price is used by itself.', 'আরও {k}টা যোগ করলে কম দাম নিজে থেকেই বসবে।'],
  'bag.w.setGo'     : ['See the set', 'সেটটা দেখুন'],
  'bag.w.tiersTitle': ['Any {cat}: the more you take, the less you pay', 'যেকোনো {cat}: যত বেশি নেবেন, তত কম দাম'],
  'bag.w.tier'      : ['Take {n}', '{n}টা নিন'],
  'bag.w.tierSave'  : ['save {save}', 'সাশ্রয় {save}'],
  'bag.w.tiersGo'   : ['Choose your {cat}', '{cat} বেছে নিন']
};
if(typeof SHOP_OPT_DEF!=='undefined') Object.keys(BAG_WORDS).forEach(function(k){
  if(SHOP_OPT_DEF[k]===undefined) SHOP_OPT_DEF[k] = BAG_WORDS[k][0];
  if(SHOP_OPT_DEF[k+'Bn']===undefined) SHOP_OPT_DEF[k+'Bn'] = BAG_WORDS[k][1];
});
function bag_w(k, v){
  var s = typeof OPTL==='function' ? OPTL(k) : (BAG_WORDS[k] ? BAG_WORDS[k][0] : k);
  return String(s).replace(/\{(\w+)\}/g, function(m, x){ return v && v[x]!=null ? v[x] : m; });
}
/* a combo's saving, said plainly: "Buy 2 and save" (summary, checkout) */
function bag_saveLabel(d){
  var c = d && d.combo && typeof COMBO==='function' ? COMBO(d.combo) : null;
  return c && c.items ? bag_w('bag.w.buyN', {n:c.items.length}) : (d ? d.label : '');
}

/* ---- item 9 · the "take more, pay less" tiers ----------------------------
   The tiers ARE the owner's own "Build your own set" price rules (Admin ›
   Combos, Admin › Settings › "Bag offer tiers") — the same numbers the set
   builder charges and the bag reprices with (02-core), so a tier shown here
   is always the price the customer pays. Default: 3 tiers. The two seed
   rules had 2; their 3rd tier below is a SUGGESTED price for the owner to
   confirm (৳675 each for 4 polos, ৳437.50 each for 4 tees) and is editable. */
var BAG_TIER_SEED = {'any-polos':{4:2700}, 'any-tees':{4:1750}};
(function(){ try{ (DB.customSetRules||[]).forEach(function(r){ var s = BAG_TIER_SEED[r.id]; if(!s) return; r.tiers = r.tiers || {}; Object.keys(s).forEach(function(n){ if(r.tiers[n]===undefined) r.tiers[n] = s[n]; }); }); }catch(e){} })();
var BAG_TIERS_DEF = {on:true, start:'', end:'', off:{}, labels:{}};
function bag_tierCfg(){ var o = (typeof ST!=='undefined' && ST.bagTiers) || {}; var c = {}; for(var k in BAG_TIERS_DEF) c[k] = o[k]!==undefined ? o[k] : BAG_TIERS_DEF[k]; return c; }
function bag_tierToday(){ var d = new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
function bag_tierList(r){ return Object.keys(r.tiers||{}).map(Number).filter(function(n){ return n>0 && r.tiers[n]>0; }).sort(function(a,b){ return a-b; }).map(function(n){ return {n:n, price:r.tiers[n]}; }); }
function bag_tierOffer(){
  var cfg = bag_tierCfg(), today = bag_tierToday();
  if(!cfg.on || (cfg.start && today < cfg.start) || (cfg.end && today > cfg.end)) return null;
  var rules = (typeof setRules==='function' ? setRules() : []).filter(function(r){ return r.active && !(cfg.off||{})[r.id] && bag_tierList(r).length; });
  for(var i=0; i<ST.bag.length; i++){ var l = ST.bag[i]; if(l.kind!=='item') continue; var p = P(l.product); if(!p) continue;
    for(var j=0; j<rules.length; j++){ var r = rules[j];
      var hit = r.mode==='sku' ? (r.skus||[]).indexOf(p.id)>=0 : (r.categories||[]).indexOf(p.cat)>=0;
      if(hit) return {rule:r, base:p, cat:CAT(p.cat), tiers:bag_tierList(r).slice(0, 4), labels:cfg.labels||{}};
    } }
  return null;
}
function bag_tierBox(cls){
  var o = bag_tierOffer(); if(!o) return '';
  var catName = (o.cat ? t(o.cat.name) : 'items').toLowerCase();
  var cells = o.tiers.map(function(x){
    var save = o.base.price * x.n - x.price, lab = o.labels[o.rule.id+':'+x.n];
    return '<span class="bg-tier"><b>'+esc(lab || bag_w('bag.w.tier', {n:x.n}))+'</b><span class="bg-tdot"> · </span><b class="bg-tier-p">'+fmt(x.price)+'</b>'+
      (save>0 ? '<span class="bg-tdot"> · </span><span class="bg-tier-s">'+esc(bag_w('bag.w.tierSave', {save:fmt(save)}))+'</span>' : '')+'</span>';
  }).join('<span class="bg-tbar" aria-hidden="true"></span>');
  return '<div class="bg-tiers'+(cls ? ' '+cls : '')+'" data-testid="bag-tiers" data-rule="'+esc(o.rule.id)+'">'+
    '<div class="bg-tiers-h"><span class="bg-tiers-t">'+esc(bag_w('bag.w.tiersTitle', {cat:catName}))+'</span>'+
    '<a class="link bg-tiers-go" href="#/set/'+esc(o.rule.id)+'">'+esc(bag_w('bag.w.tiersGo', {cat:catName}))+ico('right',14)+'</a></div>'+
    '<div class="bg-tiers-row">'+cells+'</div></div>';
}
setTimeout(function(){
  if(typeof ZS_SETTINGS==='undefined' || typeof zs_S!=='function' || typeof OPT!=='function') return;
  [['bag.freeOrder', 'Free delivery line for a bag of more than one piece (English)', 'একাধিক পণ্যের ব্যাগে ফ্রি ডেলিভারির লেখা — ইংরেজি'],
   ['bag.freeOrderBn', 'Same line (Bengali)', 'একই লেখা — বাংলা'],
   ['bag.freeShort', 'Short free-delivery line in the Added-to-bag sheet (English)', '"ব্যাগে যোগ হয়েছে" শিটে ফ্রি ডেলিভারির ছোট লেখা — ইংরেজি'],
   ['bag.freeShortBn', 'Same short line (Bengali)', 'একই ছোট লেখা — বাংলা']].forEach(function(r){
    var id = r[0]; if(zs_S('opt.'+id)) return;
    ZS_SETTINGS.push({id:'opt.'+id, g:'bagopt', en:r[1], bn:r[2], type:'text', where:'Bag · Checkout · Added-to-bag sheet', see:'#/bag',
      get:function(){ return OPT(id); }, set:function(v){ optSet(id, v); }, def:function(){ return SHOP_OPT_DEF[id]; }, reset:function(){ optReset(id); }});
  });
}, 0);
function bag_pieces(){ return (ST.bag||[]).reduce(function(s, l){ return s + (l.kind==='set' ? (l.items||[]).length : (l.qty||1)); }, 0); }
function bag_freeOrderLine(f){
  f = f || bag_freeDel();
  if(f.why==='threshold') return 'Free delivery unlocked';
  return typeof OPTL==='function' ? OPTL('bag.freeShort') : 'Free delivery on this order';
}
/* why it is free, in the customer's words — used on the bag and the checkout */
function bag_freeWhy(f){
  if(!f || !f.free) return '';
  if(f.why==='product') return bag_pieces() > 1 && typeof OPTL==='function' ? OPTL('bag.freeOrder') : 'This item ships free, anywhere in Bangladesh.';
  if(f.why==='campaign') return 'Free delivery is running on every order right now.';
  return 'Your order is over '+fmt(SET('delivery','freeOver'))+', so delivery is on us.';
}
/* 37. The one return note the owner wants seen once in the journey. His ruling:
   it belongs on the thank-you page and in My account → Orders, never on the
   checkout. Both pages call this, so the wording lives in one place. */
function bag_returnNote(cls){
  return '<div class="bag-retnote '+(cls||'')+'">'+ico('info',15)+
    '<span><b>If you take the parcel and then send it back</b>, the delivery charge applies — '+
    'the return is made with that charge paid.<span class="bn">পার্সেল নেওয়ার পর ফেরত দিলে ডেলিভারি চার্জ প্রযোজ্য হবে।</span></span></div>';
}

/* ---------- offers & codes (also used by checkout) ---------- */
/* (an offer past its end never applies by itself — see bag_offerExpired) */
function bag_offers(){ var a = currentAccount(); return (a && a.offers) ? a.offers.filter(function(o){ return !bag_offerExpired(o); }) : []; }
function bag_findCode(code){
  code = String(code||'').trim().toUpperCase(); if(!code) return null;
  var a0 = currentAccount(), l = (a0 && a0.offers) || []; for(var i=0;i<l.length;i++) if(l[i].code && String(l[i].code).toUpperCase()===code) return l[i];
  return null;
}
/* R15 wave 2 (E05): an offer can carry an end — `expires` (time in ms) or
   `ends` ('2026-10-31', the last day it works). A code past its end is not
   applied and the shopper is told plainly. */
function bag_offerEnd(o){
  if(!o) return null;
  if(typeof o.expires === 'number') return o.expires;
  if(o.ends){ var d = new Date(String(o.ends) + (String(o.ends).length <= 10 ? 'T23:59:59' : '')); if(!isNaN(d)) return d.getTime(); }
  return null;
}
function bag_offerExpired(o){ var e = bag_offerEnd(o); return e != null && Date.now() > e; }
function bag_offerMin(o){ if(!o) return 0; if(o.min) return o.min; var m = /over\s*৳\s*([\d,]+)/i.exec(o.title||''); return m ? Number(m[1].replace(/,/g,'')) : 0; }
function bag_offerAmount(o, total){ if(!o || total < bag_offerMin(o)) return 0; if(o.pct) return Math.round(total*o.pct/100); return Math.min(o.amount||0, total); }
function bag_offerLabel(o){ var head = String(o.title||o.code||'Offer').split(' · ')[0]; return head+' · '+(o.pct ? o.pct+'% off' : fmt(o.amount||0)+' off'); }
/* ---------- R16 (6) · set price OR member offer — never both ----------
   The owner's rule: "Set prices are not combined with other offers." The VIP
   15% used to come off a total that already had the set price in it. Now:
   for every candidate offer (the account's automatic % offer and any code),
   each set is checked on its own — the set price, or the offer on that set's
   regular price, whichever saves the shopper more. Loose items not in a set
   always get the offer. The best plan wins, the losing discount is removed,
   and the bag/checkout say which one was used. Called from bagTotals(). */
function bag_offerCands(){
  var acc = currentAccount(), cands = [], codeO = null, note = '';
  if(acc && acc.offers){ var vip = bag_offers().filter(function(o){ return o.pct; })[0]; if(vip) cands.push({o:vip, auto:true}); }
  if(ST.appliedCode){
    codeO = bag_findCode(ST.appliedCode);
    if(codeO && bag_offerExpired(codeO)){ note = 'Code '+ST.appliedCode+' has expired, so it is not used.'; codeO = null; }
    else if(codeO){ var dup = cands.filter(function(c){ return c.o===codeO; })[0]; if(dup) dup.code = true; else cands.push({o:codeO, code:true}); }
    else if(!note) note = acc ? 'Code '+ST.appliedCode+' is not valid for this account.' : 'Code '+ST.appliedCode+' works after you log in.';
  }
  return {list:cands, codeO:codeO, note:note};
}
function bag_offerPlan(tot){
  var C = bag_offerCands(), groups = tot.groups||[];
  var allSave = groups.reduce(function(s, g){ return s + g.save; }, 0);
  var best = {save:allSave, cand:null, amount:0, switched:[], base:tot.looseRegular};
  C.list.forEach(function(c){
    var o = c.o, plans = [{sw:[], base:tot.looseRegular, kept:allSave}, {sw:groups.slice(), base:tot.subtotal, kept:0}];
    if(o.pct){
      var sw = [], base = tot.looseRegular, kept = 0;
      groups.forEach(function(g){ if(Math.round(g.regular*o.pct/100) > g.save){ sw.push(g); base += g.regular; } else kept += g.save; });
      plans.push({sw:sw, base:base, kept:kept});
    }
    plans.forEach(function(pl){
      var amt = bag_offerAmount(o, pl.base), s = pl.kept + amt;
      if(amt>0 && s > best.save){ best = {save:s, cand:c, amount:amt, switched:pl.sw, base:pl.base}; }
    });
  });
  best.switched.forEach(function(g){
    tot.discount -= g.save;
    var ix = tot.setDiscounts.indexOf(g.d); if(ix>=0) tot.setDiscounts.splice(ix, 1);
    if(g.kind==='auto'){ var ai = tot.autoApplied.indexOf(g.combo); if(ai>=0) tot.autoApplied.splice(ai, 1); }
    if(g.row){ g.row.price = g.row.regular; g.row.offerWins = true; }
    g.switched = true;
  });
  var kept = groups.filter(function(g){ return !g.switched; });
  tot.offer = best.cand ? {o:best.cand.o, auto:!!best.cand.auto && !best.cand.code, code:!!best.cand.code, amount:best.amount, base:best.base} : null;
  tot.offerPlan = {cands:C, switched:best.switched, kept:kept, best:best};
}
/* which offer applies, and why — read from the plan bagTotals() made.
   The argument is kept for older callers; the amount always comes from the
   plan, so it can never be taken twice off a set. */
function bag_bestOffer(total){
  var tot = bagTotals(), res = {amount:0, label:'', offer:null, auto:false, code:false, note:'', notes:[]};
  var plan = tot.offerPlan || {cands:{list:[], note:''}, switched:[], kept:[]}, of = tot.offer;
  if(of){ res.amount = of.amount; res.offer = of.o; res.auto = of.auto; res.code = of.code; res.label = bag_offerLabel(of.o); }
  var names = function(gs){ var seen = {}, out = []; gs.forEach(function(g){ if(!seen[g.label]){ seen[g.label] = 1; out.push(g.label); } }); return out.join(' + '); };
  var lead = plan.cands.list.length ? (of ? bag_offerLabel(of.o) : bag_offerLabel(plan.cands.list[0].o)) : '';
  if(plan.cands.list.length && plan.switched.length) res.notes.push(lead+' saves you more than the '+names(plan.switched)+' set price, so we used it instead. Set prices are not combined with other offers.');
  if(plan.cands.list.length && plan.kept.length) res.notes.push('The '+names(plan.kept)+' set price saves you at least as much as '+lead+', so the set price is used'+(of && of.amount ? ' and '+bag_offerLabel(of.o).split(' · ')[0]+' applies to your other items' : '')+'. Set prices are not combined with other offers.');
  if(plan.cands.note) res.notes.push(plan.cands.note);
  var codeO = plan.cands.codeO;
  if(codeO && (!of || of.o!==codeO)){
    var min = bag_offerMin(codeO), base = tot.looseRegular;
    if(tot.subtotal < min) res.notes.push('Add '+fmt(min-tot.subtotal)+' more to use '+codeO.code+'.');
    else if(of) res.notes.push(bag_offerLabel(of.o)+' saves you more, so we used that instead of '+codeO.code+'.');
  }
  res.note = res.notes.join(' ');
  return res;
}

/* ---------- helpers ---------- */
/* productImg, but belts get the belt drawing (the "extras" category draws socks) */
function bag_img(p, color, opts){
  if(p && /belt/.test(p.id)){
    opts = opts||{}; var c = COL(color||p.colors[0]);
    return '<div class="pimg '+(opts.ratio||'ratio-45')+'" style="background:'+mixHex(c.hex,'#EFEDE8',isLight(c.hex)?.55:.80)+'">'+garmentSVG('belt', c.hex, 'front')+'</div>';
  }
  return productImg(p, color, opts);
}
function bag_line(id){ for(var i=0;i<ST.bag.length;i++) if(ST.bag[i].id===id) return ST.bag[i]; return null; }
function bag_ft(h){ h = Math.round(Number(h)||0); return Math.floor(h/12)+'\''+(h%12)+'"'; }
/* which bag lines are covered by an auto-applied combo (mirrors bagTotals' matching order) */
function bag_comboTags(tot){
  var cap = {}, out = {};
  ST.bag.forEach(function(l){ if(l.kind==='item') cap[l.id] = l.qty; });
  (tot.setDiscounts||[]).forEach(function(d){
    if(!d.auto) return; var c = COMBO(d.combo); if(!c) return;
    c.items.forEach(function(pid){
      for(var i=0;i<ST.bag.length;i++){ var l = ST.bag[i];
        if(l.kind==='item' && l.product===pid && cap[l.id]>0){ cap[l.id]--; out[l.id] = out[l.id]||[]; var nm = bag_w('bag.w.applied', {n:c.items.length}); if(out[l.id].indexOf(nm)<0) out[l.id].push(nm); break; } }
    });
  });
  return out;
}
function bag_pairLines(b){ return ST.bag.filter(function(l){ return l.kind==='item' && l.product===b.product && l.color===b.color && b.sizes.indexOf(l.size)>=0; }); }
/* exactly one loose Essential Piqué Polo + Polo Duo active → offer a 2nd one */
function bag_duoOffer(){
  var c = COMBO('polo-duo'); if(!c || !c.active) return null;
  var pid = c.items[0], p = P(pid); if(!p) return null;
  var lines = ST.bag.filter(function(l){ return l.kind==='item' && l.product===pid; });
  var units = lines.reduce(function(s,l){ return s+l.qty; }, 0);
  if(units!==1) return null;
  return {combo:c, product:p, line:lines[0]};
}
function bag_lastKept(acc, p){
  var ids = acc.orders||[], byCat = null;
  for(var i=0;i<ids.length;i++){
    var o = ST.orders[ids[i]]; if(!o || o.status!=='delivered') continue;
    for(var j=0;j<o.lines.length;j++) if(o.lines[j].product===p.id) return {size:o.lines[j].size, product:p.id};
    if(!byCat) for(var k=0;k<o.lines.length;k++){ var q = P(o.lines[k].product); if(q && q.cat===p.cat){ byCat = {size:o.lines[k].size, product:q.id}; break; } }
  }
  return byCat;
}
function bag_evidence(b){
  var p = P(b.product), lines = [], sugg = null, ms = mySize(), mine = mySizeFor(p);
  if(ms && mine){
    var who = ms.heightIn ? ' ('+bag_ft(ms.heightIn)+(ms.weightKg ? ', '+ms.weightKg+' kg' : '')+')' : '';
    lines.push({icon:'ruler', text:'Find my size says '+mine+who}); sugg = mine;
  }
  var acc = currentAccount();
  if(acc){ var k = bag_lastKept(acc, p); if(k){ lines.push({icon:'box', text:'You kept '+k.size+(k.product!==p.id ? ' ('+P(k.product).name+')' : '')+' in your last order'}); if(!sugg) sugg = k.size; } }
  return {lines:lines, sugg:(sugg && b.sizes.indexOf(sugg)>=0) ? sugg : null};
}

/* ---------- R15 wave 2 · single items: size & colour right in the bag ----
   (B05/B06) The same inline control the set lines have: a size dropdown and
   a colour choice, each option checked against the stock still free after
   the rest of the bag. A change that the stock cannot cover is refused with
   a line saying why; a change onto a line already in the bag joins them. */
var BAG_ITEM_ERR = {};
function bag_itemCan(l, color, size){
  var use = bagStockUse(l.id), k = bagSku(l.product, color, size);
  return stockOf(l.product, color, size) - (use[k]||0) >= (l.qty||1);
}
function bag_itemPick(l, p){
  var sizes = p.sizes.map(function(s){ var ok = s===l.size || bag_itemCan(l, l.color, s);
    return '<option value="'+esc(s)+'"'+(s===l.size?' selected':'')+(ok?'':' disabled')+'>'+esc(s)+(ok?'':' — sold out')+'</option>'; }).join('');
  var cols = p.colors.length > 1 ? p.colors.map(function(c){ var ok = c===l.color || bag_itemCan(l, c, l.size);
    return '<option value="'+esc(c)+'"'+(c===l.color?' selected':'')+(ok?'':' disabled')+'>'+esc(COL(c).name)+(ok?'':' — sold out in '+esc(l.size))+'</option>'; }).join('') : '';
  return '<div class="bg-pick" data-testid="bag-item-pick">'+
    (cols ? '<span class="bg-pickc"><span class="swatch sm" style="background:'+COL(l.color).hex+'" aria-hidden="true"></span><label class="sr" for="bgc-'+l.id+'">Colour for '+esc(p.name)+'</label>'+
      '<select id="bgc-'+l.id+'" class="cbt-sel bg-sel" data-change="bag-item-color" data-act="bag-color-pick" data-id="'+l.id+'" data-testid="bag-color-sel">'+cols+'</select></span>'
      : '<span class="small muted">'+esc(COL(l.color).name)+'</span>')+
    '<span class="bg-picks"><label class="sr" for="bgs-'+l.id+'">Size for '+esc(p.name)+'</label>'+
      '<select id="bgs-'+l.id+'" class="cbt-sel bg-sel" data-change="bag-item-size" data-id="'+l.id+'" data-testid="bag-size-sel" aria-label="Size">'+sizes+'</select></span></div>';
}
function bag_itemChange(id, color, size){
  var l = bag_line(id); if(!l) return;
  var p = P(l.product), was = COL(l.color).name+' · '+l.size;
  if(!bag_itemCan(l, color, size)){ BAG_ITEM_ERR[id] = COL(color).name+' · '+size+' is not in stock for '+(l.qty||1)+' — your bag is unchanged.'; rerender(); return; }
  delete BAG_ITEM_ERR[id];
  var same = ST.bag.filter(function(x){ return x.kind==='item' && x.id!==id && x.product===l.product && x.color===color && x.size===size; })[0];
  if(same){ same.qty += (l.qty||1); ST.bag = ST.bag.filter(function(x){ return x.id!==id; }); }
  else { l.color = color; l.size = size; }
  saveState(); rerender(); toast(p.name+': '+was+' → '+COL(color).name+' · '+size);
}
CHANGE['bag-item-size'] = function(el){ var l = bag_line(el.getAttribute('data-id')); if(l) bag_itemChange(l.id, l.color, el.value); };
CHANGE['bag-item-color'] = function(el){ var l = bag_line(el.getAttribute('data-id')); if(l) bag_itemChange(l.id, el.value, l.size); };
/* R15 wave 2 (E04): a loose item whose price changed after it went in the bag
   says so, the same way a set line does */
function bag_priceNote(l, p){
  if(!p || l.addedPrice == null || Number(l.addedPrice) === Number(p.price)) return '';
  return '<div class="zc-note" data-testid="bag-item-repriced">'+ico('info',13)+'<span>Price changed from '+fmt(l.addedPrice)+' to '+fmt(p.price)+' — you pay the new price.</span></div>';
}

/* ---------- line markup ---------- */
function bag_itemLine(l, comboNames, issues){
  var p = P(l.product); if(!p) return '';
  var href = '#/p/'+p.id+'?color='+encodeURIComponent(l.color);
  var stock = stockOf(p.id, l.color, l.size), maxQ = bagMaxQty(l);
  var each = l.qty>1 ? '<div class="xs muted">'+fmt(p.price)+' each</div>' : '';
  var low = stock>0 && stock<=3 ? '<div class="xs bold" style="color:var(--warn);margin-top:3px">Only '+stock+' left</div>' : '';
  var tag = comboNames ? '<div><span class="tag" data-testid="combo-tag">'+esc(comboNames.join(' + '))+' '+ico('check',12)+'</span></div>' : '';
  return '<div class="bg-line" data-line="'+l.id+'">'+
    '<a class="bg-thumb" href="'+href+'" aria-label="'+esc(p.name)+'">'+bag_img(p, l.color, {ratio:'ratio-11', label:false})+'</a>'+
    '<div class="stack s8" style="min-width:0">'+
      '<div class="row between top" style="gap:12px">'+
        '<div class="grow"><a class="bg-name" href="'+href+'">'+esc(p.name)+'</a>'+low+'</div>'+
        '<div class="shrink0" style="text-align:right"><div class="price">'+fmt(p.price*l.qty)+'</div>'+each+'</div>'+
      '</div>'+bag_itemPick(l, p)+tag+bag_priceNote(l, p)+(BAG_ITEM_ERR[l.id] ? '<div class="zc-note bad" role="alert" data-testid="bag-item-err">'+ico('info',13)+'<span>'+esc(BAG_ITEM_ERR[l.id])+'</span></div>' : '')+(issues||[]).map(function(x){ return '<div class="zc-note bad" role="alert" data-testid="bag-stock-issue">'+ico('info',13)+'<span>'+esc(x.msg)+'</span></div>'; }).join('')+
      '<div class="row between wrap" style="gap:8px 12px">'+
        '<div class="qty bg-qty" role="group" aria-label="Quantity">'+
          '<button data-act="bag-qty" data-id="'+l.id+'" data-q="'+(l.qty-1)+'" aria-label="One less"'+(l.qty<=1?' disabled':'')+'>'+ico('minus',16)+'</button>'+
          '<span aria-live="polite">'+l.qty+'</span>'+
          '<button data-act="bag-qty" data-id="'+l.id+'" data-q="'+(l.qty+1)+'" aria-label="One more"'+(l.qty>=maxQ?' disabled':'')+'>'+ico('plus',16)+'</button>'+
        '</div>'+
        '<div class="bg-acts"><button class="link zc-wishbtn" data-act="bag-save" data-id="'+l.id+'">'+ico('heart',15)+'Move to wishlist</button><button class="link" data-act="bag-remove" data-id="'+l.id+'">Remove</button></div>'+
      '</div>'+
    '</div></div>';
}
/* R16 · the combo page link carries this set's own colours and sizes (12),
   and "Change size or colour" opens it in edit mode, replacing this line. */
function bag_setHref(l, cid, edit){
  if(!cid) return '#/set';
  var q = 'colors='+encodeURIComponent(l.items.map(function(it){ return it.color; }).join(','))+'&sizes='+encodeURIComponent(l.items.map(function(it){ return it.size; }).join(','));
  return '#/combo/'+cid+'?'+q+(edit ? '&from='+encodeURIComponent(l.id) : '');
}
/* 27. A set line used to fall back to the set builder when it had no combo
   id. Now it finds the combo by name; a build-your-own set goes back to its
   own group. (Wave 2: shared by every bag template, 43-combo-tpl.js.) */
function bag_setCid(l){
  var cid = l.source==='custom' ? null : l.refId;
  if(!cid && l.name && l.source!=='custom'){ var m = (DB.combos||[]).filter(function(c){ return c.name===l.name; })[0]; if(m) cid = m.id; }
  return cid;
}
function bag_setOpenHref(l, cid){ return l.source==='custom' ? '#/set/'+encodeURIComponent(l.refId||'') : bag_setHref(l, cid, false); }
function bag_setNotes(l, row, issues){
  var notes = '';
  if(row.offerWins) notes += '<div class="zc-note" data-testid="bag-set-offerwins">'+ico('tag',13)+'<span>Your member offer saves more here, so it is used instead of the set price.</span></div>';
  else if(row.changed && !row.capped) notes += '<div class="zc-note" data-testid="bag-set-repriced">'+ico('info',13)+'<span>Set price changed from '+fmt(row.addedPrice)+' to '+fmt(row.setPrice)+' — you pay the new price.</span></div>';
  if(row.capped) notes += '<div class="zc-note" data-testid="bag-set-capped">'+ico('info',13)+'<span>You pay the regular price of these items.</span></div>';
  (issues||[]).forEach(function(x){ notes += '<div class="zc-note bad" role="alert" data-testid="bag-stock-issue">'+ico('info',13)+'<span>'+esc(x.msg)+'</span></div>'; });
  return notes;
}
function bag_setLine(l, row, issues){
  var q = l.qty||1;
  row = row || {regular:0, price:l.price*q};
  var reg = row.regular, amt = row.price;
  var cid = bag_setCid(l);
  var href = bag_setOpenHref(l, cid);
  var items = l.items.map(function(it){ var p = P(it.product);
    if(!p) return '<li><span class="text2">'+esc(it.product)+'</span></li>';
    return '<li><span class="bg-setlink">'+esc(p.name)+'</span>'+
      ' <span class="muted">· '+esc(COL(it.color).name)+' · '+esc(it.size)+'</span></li>'; }).join('');
  var notes = bag_setNotes(l, row, issues);
  return '<div class="bg-line" data-line="'+l.id+'">'+
    '<a class="bg-thumb" href="'+href+'" aria-label="'+esc(l.name)+'">'+(l.source==='auto' && typeof ca_setPhoto==='function' ? ca_setPhoto(ca_piecesOf(l.items),{layout:'thumb'}) : setImg(l.items, {ratio:'ratio-11'}))+'</a>'+
    '<div class="stack s8" style="min-width:0">'+
      '<div class="row between top" style="gap:12px">'+
        '<div class="grow"><a class="bg-name" href="'+href+'">'+esc(l.name)+'</a><div class="xs muted" style="margin-top:2px">Set · '+plural(l.items.length,'piece')+'</div></div>'+
        '<div class="shrink0" style="text-align:right"><div class="price" data-testid="bag-set-price">'+fmt(amt)+'</div>'+(reg>amt?'<div class="strike xs">'+fmt(reg)+'</div>':'')+'</div>'+
      '</div>'+
      '<ul class="bg-setitems">'+items+'</ul>'+notes+
      '<div class="bg-acts cbt-fit">'+(cid ? '<a class="link" href="'+bag_setHref(l, cid, true)+'" data-testid="bag-set-change" aria-label="Change size or colour"><span class="cbt-f">Change size or colour</span><span class="cbt-s">Change</span></a>' : '')+'<button class="link zc-wishbtn" data-act="bag-save" data-id="'+l.id+'" data-testid="bag-set-save" aria-label="Move to wishlist">'+ico('heart',15)+'<span class="cbt-f">Move to wishlist</span><span class="cbt-s">Wishlist</span></button><button class="link" data-act="bag-remove" data-id="'+l.id+'">Remove</button></div>'+
    '</div></div>';
}
function bag_duoCard(d){
  var p = d.product, size = d.line.size, save = p.price*2 - d.combo.price;
  /* 26. Four colours across, not three. A sold-out colour keeps its place,
     shaded and not clickable — it carries no "Sold out" word, because that
     word is what made the button wide enough to break the row. */
  var chips = p.colors.filter(function(c){ return c!==d.line.color; }).map(function(c){
    var col = COL(c), ok = stockOf(p.id, c, size) > 0;
    return '<button class="chip bg-duoc'+(ok?'':' out')+'" data-act="bag-duo" data-color="'+c+'"'+
      (ok ? '' : ' disabled aria-disabled="true" title="Sold out in size '+esc(size)+'"')+
      ' aria-label="'+esc(col.name)+(ok?'':', sold out in size '+esc(size))+'">'+
      '<span class="swatch sm" style="background:'+col.hex+'"></span><span class="bg-duon">'+esc(col.name)+'</span></button>';
  }).join('');
  /* 27. The offer was one flat colour from end to end, so the money in it did
     not stand out at all. The saving is now the loud part of the line. */
  return '<div class="bg-inl bg-offer tint p16" data-testid="duo-offer"><div class="row top" style="gap:12px"><span class="bg-ic">'+ico('gift',18)+'</span><div class="grow">'+
    '<div class="h3">'+esc(bag_w('bag.w.addOne'))+'</div>'+
    '<div class="small text2 bg-duoline">'+esc(bag_w('bag.w.addOneSub', {price:fmt(d.combo.price), size:size}))+
      (save>0 ? ' <b class="bg-save" data-testid="bag-duo-save">save '+fmt(save)+'</b>' : '')+'</div>'+
    '<div class="bg-duo-cols">'+chips+'</div></div></div></div>';
}
function bag_brkCard(b){
  var p = P(b.product), ack = ST.bracketAck[b.key], a = b.sizes[0], c = b.sizes[1], k = esc(b.key);
  var title = 'Same '+esc(p.name)+' in '+esc(a)+' and '+esc(c);
  if(ack==='other' || ack==='keep'){
    return '<div class="bg-inl bg-brk soft row" style="padding:12px 14px;gap:10px" data-testid="brk-done"><span class="bg-ok">'+ico('check',18)+'</span>'+
      '<div class="grow small"><b>'+(ack==='other' ? 'Got it — both sizes stay.' : 'Keeping both sizes.')+'</b> <span class="muted">'+title+'</span></div>'+
      '<button class="link" data-act="bag-brk" data-key="'+k+'" data-v="">Change</button></div>';
  }
  var h = '<div class="bg-inl bg-brk soft p16" data-testid="brk-card"><div class="row top" style="gap:12px"><span class="bg-ic">'+ico('ruler',18)+'</span><div class="grow">'+
    '<div class="h3">'+title+'</div>';
  if(ack==='help'){
    var ev = bag_evidence(b);
    h += '<div class="stack s8 mt12">';
    if(ev.lines.length){
      h += ev.lines.map(function(x){ return '<div class="row small" style="gap:8px"><span class="brandc">'+ico(x.icon,16)+'</span><span>'+esc(x.text)+'</span></div>'; }).join('');
      h += '<div><a class="link" href="#/p/'+p.id+'?finder=1">Check again with Find my size</a></div>';
    } else {
      h += '<div class="small text2">Tell us your height and weight — Find my size picks the right one in '+CB_FINDER_SECS+' seconds.</div>'+
           '<div><a class="btn btn-secondary btn-sm" href="#/p/'+p.id+'?finder=1">'+ico('ruler',15)+'Find my size</a></div>';
    }
    h += '</div><div class="row wrap mt12" style="gap:8px">';
    var keepBtn = function(s, primary){ var o = s===a ? c : a; return '<button class="btn btn-sm '+(primary?'btn-primary':'btn-ghost')+'" data-act="bag-brk-one" data-key="'+k+'" data-keep="'+esc(s)+'">Keep '+esc(s)+', remove '+esc(o)+'</button>'; };
    h += ev.sugg ? keepBtn(ev.sugg, true) : keepBtn(a) + keepBtn(c);
    h += '<button class="btn btn-sm btn-ghost" data-act="bag-brk" data-key="'+k+'" data-v="keep">Keep both</button></div>'+
         '<button class="link mt8" data-act="bag-brk" data-key="'+k+'" data-v="other">One is for someone else</button>';
  } else {
    h += '<p class="small text2" style="margin:4px 0 0">Is one for someone else? Then you\'re all set. Not sure of your size? We\'ll help you pick.</p>'+
      '<div class="row wrap mt12" style="gap:8px"><button class="btn btn-sm btn-secondary" data-act="bag-brk" data-key="'+k+'" data-v="help">Help me pick my size</button>'+
      '<button class="btn btn-sm btn-ghost" data-act="bag-brk" data-key="'+k+'" data-v="other">One is for someone else</button></div>';
  }
  h += '<div class="xs muted mt12 row top" style="gap:6px">'+ico('info',14)+'<span>'+esc(ruleText('no-return','short'))+'</span></div></div></div></div>';
  return h;
}

/* ---------- summary ---------- */
/* wave 2: the summary names a combo the research way — "Solid Polo combo
   (2 pcs)". The long generated name ("Ralph Lauren Solid Polo — Black +
   Navy · 2-piece combo") was nowrap here and pushed the bag 200px wider
   than a 360 phone. */
function bag_setShort(l){
  var L = l.source==='auto' && typeof ca_listing==='function' ? ca_listing(l.refId) : null;
  return L ? L.styleName+(L.same ? ' combo' : '')+' ('+L.n+' pcs)' : bagSetName(l.name);
}
function bag_summary(tot, off, grand, issues){
  var u = ui('bag', {codeOpen:false, codeMsg:''}), fdel = bag_freeDel(tot.total), freeDel = fdel.free;
  var h = '<div class="h2" style="margin-bottom:12px">Order summary</div>';
  /* 23. The summary names what is in the bag. "Items (3)" tells the customer
     nothing; the product's own short name does. */
  /* R16 (7). A set is ONE row at what it costs ("Polo Duo set ৳1,500 ·
     save ৳200"), and the subtotal is the sum of these rows. It used to list
     the set at ৳1,500, then a ৳1,700 subtotal, then −৳200 again — which read
     as a double discount. Auto-applied sets (loose items that make a combo)
     still show their own discount row below the subtotal. */
  tot.lines.forEach(function(x){
    var l = x.line, nm, amt = x.price, sub = '';
    if(l.kind==='set'){ nm = bag_setShort(l); if(x.regular>x.price) sub = fmt(x.regular)+' separately · you save '+fmt(x.regular-x.price); else if(x.offerWins) sub = 'Member offer used instead of the set price'; }
    else { var pp = P(l.product); if(!pp) return;
      nm = pp.name + ' · ' + l.size + (l.qty>1 ? ' × '+l.qty : ''); }
    h += '<div class="bg-sr bg-sr-item"><span>'+esc(nm)+'</span><span class="b">'+fmt(amt)+'</span></div>'+(sub ? '<div class="zc-rsub2" data-testid="bag-set-sub">'+esc(sub)+'</div>' : '');
  });
  h += '<div class="bg-sr bg-sr-sub"><span>Subtotal ('+tot.count+')</span><span class="b" data-testid="bag-subtotal">'+fmt(tot.rowsSubtotal)+'</span></div>';
  /* 29. The set price is the best thing that happened in this bag, and it was
     set in the same grey as "Subtotal". It gets its own tinted row now, with
     the saving spelled out. */
  tot.setDiscounts.forEach(function(d){
    if(d.line) return;                       /* already inside its set row */
    h += '<div class="bg-sr bg-setdisc" data-testid="bag-setdisc"><span>'+ico('gift',15)+'<span>'+esc(bag_saveLabel(d))+'</span></span><span class="bg-setamt">'+fmt(-d.amount)+'</span></div>';
  });
  if(off.amount) h += '<div class="bg-sr disc" data-testid="bag-offer"><span>'+esc(off.label)+(off.code?' <span class="tag plain">'+esc(off.offer.code)+'</span>':'')+'</span><span>'+fmt(-off.amount)+'</span></div>';
  /* 30. Delivery is only worth a line when it is free — and then it has to be
     seen: the word FREE is a badge, not another grey number. */
  if(freeDel) h += '<div class="bg-sr bg-free" data-testid="bag-freerow"><span>'+ico('truck',16)+' Delivery</span><span class="bg-freeb">'+ico('check',13)+'FREE</span></div>';
  /* code */
  var code;
  if(ST.appliedCode) code = '<div class="row between small"><span>Code <b>'+esc(ST.appliedCode)+'</b> added</span><button class="link" data-act="bag-code-remove">Remove</button></div>';
  else if(!u.codeOpen) code = '<button class="link" data-act="bag-code-open">Have a code?</button>';
  /* R15 wave 2 (E05, AX13): the message sits inside the code form, is tied to
     the field (aria-invalid / aria-describedby) and the typed code stays */
  else code = '<form data-submit="bag-code" class="row wrap" style="gap:8px"><label class="sr" for="bag-code">Discount code</label>'+
    '<input id="bag-code" name="code" class="input" placeholder="Enter code" autocomplete="off" value="'+esc(u.codeRaw||'')+'" style="text-transform:uppercase;padding:10px 12px;flex:1 1 140px;min-width:0"'+(u.codeMsg ? ' aria-invalid="true" aria-describedby="bag-code-msg"' : '')+'><button class="btn btn-secondary btn-sm" style="min-height:44px">Apply</button>'+
    (u.codeMsg ? '<div class="xs" id="bag-code-msg" style="color:var(--sale);flex-basis:100%" role="alert">'+u.codeMsg+'</div>' : '')+'</form>';
  if(off.note) code += '<div class="xs muted mt8">'+esc(off.note)+'</div>';
  h += '<div style="padding:6px 0 2px">'+code+'</div>';
  h += '<div class="bg-tot"><span>Total</span><span class="price" data-testid="bag-total">'+fmt(grand)+'</span></div>';
  var save = tot.discount + off.amount;
  if(save>0) h += '<div class="xs bold brandc bg-yousave" style="text-align:right;margin-top:2px" data-testid="bag-yousave">You save '+fmt(save)+'</div>';
  if(issues && issues.length) h += '<div class="zc-stockbox mt12" role="alert" data-testid="bag-stock-block">'+ico('info',16)+'<span><b>Fix your bag to continue.</b> '+esc(issues[0].msg)+'</span></div><button class="btn btn-primary btn-block mt12" disabled data-testid="bag-checkout">'+esc(t('Checkout'))+ico('right',16)+'</button>';
  else h += '<a class="btn btn-primary btn-block mt16" href="#/checkout" data-testid="bag-checkout">'+esc(t('Checkout'))+ico('right',16)+'</a>';
  if(SHOW('bag','waSendBag')) h += '<button class="btn btn-ghost btn-block mt8" data-act="bag-wa">'+waGlyph(18)+'Send my bag on WhatsApp</button>';
  h += '<div class="bg-trust">'+[['cash','Cash on Delivery'],['swap','Size exchange in '+SET('exchange','windowHours')+' hours'],['lock','Secure payment']].map(function(x){ return '<div>'+ico(x[0],18)+'<span>'+esc(x[1])+'</span></div>'; }).join('')+'</div>';
  return h;
}
function bag_waMessage(){
  var tot = bagTotals(), off = bag_bestOffer(tot.total), grand = tot.total - off.amount, free = bag_freeDel(tot.total).free;
  var L = ['Hi EXTAS, I would like to order:', ''], n = 0;
  ST.bag.forEach(function(l){
    n++;
    if(l.kind==='item'){ var p = P(l.product); L.push(n+'. '+p.name+' — '+COL(l.color).name+', '+l.size+' × '+l.qty+' — '+fmt(p.price*l.qty)); }
    else { var row = tot.lines.filter(function(x){ return x.line===l; })[0]; L.push(n+'. '+bagSetName(l.name)+' — '+fmt(row ? row.price : l.price*(l.qty||1))); l.items.forEach(function(it){ L.push('    • '+P(it.product).name+' — '+COL(it.color).name+', '+it.size); }); }
  });
  L.push('');
  tot.setDiscounts.forEach(function(d){ if(d.auto) L.push(d.label+': '+fmt(-d.amount)); });
  if(off.amount) L.push(off.label+(off.code?' ('+off.offer.code+')':'')+': '+fmt(-off.amount));
  L.push('Delivery: '+(free ? 'Free' : 'as per my address'));
  L.push('Total: '+fmt(grand)+(free ? '' : ' + delivery'));
  L.push(''); L.push('Please place this order for me.');
  return L.join('\n');
}
function bag_empty(){
  var wl = ST.wishlist.length;
  var cats = DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){ return '<a class="chip" href="#/c/'+c.id+'">'+esc(t(c.name))+'</a>'; }).join('');
  return '<div class="container bg-wrap"><div class="card bg-empty center" data-testid="bag-empty">'+
    '<div class="bg-emptyic">'+ico('bag',32)+'</div><h1 class="h1 mt16">Your bag is empty</h1>'+
    '<p class="text2">Find something you like — Cash on Delivery all over Bangladesh.</p>'+
    '<div class="row wrap mt16" style="justify-content:center;gap:10px"><a class="btn btn-primary" href="#/c/new">Shop new in</a><a class="btn btn-ghost" href="#/combo/polo-duo">Sets &amp; combos</a></div>'+
    /* with saved items the category chips step aside, so "Saved for later"
       sits right under the message instead of below the fold */
    (bag_savedStrip() ? '' : '<div class="row wrap mt24" style="justify-content:center;gap:8px">'+cats+'</div>')+
  '</div>'+bag_savedStrip()+'</div>';
}

/* ----- the offer slot -----
   One slot, directly under the list of items, never between two products.
   That way it cannot scroll out of sight between item three and item four,
   and the customer always finds it in the same place.
   It is never empty: if there is no set offer to make, it falls back to the
   free-delivery gap, and then to a standing member offer. */
function bag_offerSlot(tot, duo){
  if(duo) return bag_duoCard(duo);
  /* a set that matches something already in the bag */
  /* R16 (10): never advertise a set that is already applied — either as a
     set line or auto-applied to loose items — or one that is switched off. */
  var inBag = {}, applied = {};
  ST.bag.forEach(function(l){ if(l.kind==='item') inBag[l.product] = true; else if(l.source==='combo' && l.refId) applied[l.refId] = true; });
  (tot.autoApplied||[]).forEach(function(id){ applied[id] = true; });
  (tot.groups||[]).forEach(function(g){ if(g.combo) applied[g.combo] = true; });
  var c = combos().filter(function(x){
    if(!x.active || applied[x.id] || (typeof cb_valid==='function' && !cb_valid(x))) return false;
    if((typeof cb_regular==='function' ? cb_regular(x) : 0) <= x.price) return false;
    return (x.items||[]).some(function(it){ return inBag[it.product || it]; });
  })[0];
  if(c){
    var full = (c.items||[]).reduce(function(s,it){ var pp = P(it.product||it); return s + (pp?pp.price:0); }, 0);
    var have = {}, need = (c.items||[]).filter(function(pid){ if(inBag[pid] && !have[pid]){ have[pid] = 1; return false; } return true; }).length;
    var save = full - c.price;
    return '<div class="bg-offer-slot bg-offer tint" data-testid="bag-offer-slot">'+
      '<span class="bg-ic">'+ico('gift',18)+'</span>'+
      '<div class="grow"><div class="h3">'+esc(save>0 ? bag_w('bag.w.setTitle', {n:(c.items||[]).length, save:fmt(save)}) : bag_w('bag.w.setSub', {what:c.blurb||c.name, price:fmt(c.price), n:(c.items||[]).length}))+'</div>'+
      '<div class="small text2">'+esc(bag_w('bag.w.setSub', {what:c.blurb||c.name, price:fmt(c.price), n:(c.items||[]).length}))+(need && c.autoApply ? ' · '+esc(bag_w('bag.w.setAuto', {k:need})) : '')+'</div></div>'+
      '<a class="btn btn-secondary btn-sm shrink0" href="#/combo/'+esc(c.id)+'">'+esc(bag_w('bag.w.setGo'))+'</a></div>';
  }
  /* 36. Never ask for more money towards free delivery when delivery is
     already free — a free-delivery product or a running campaign makes the
     gap meaningless. */
  if(tot.freeLeft>0 && !bag_freeDel(tot.total).free){
    return '<div class="bg-offer-slot bg-offer tint" data-testid="bag-offer-slot">'+
      '<span class="bg-ic">'+ico('truck',18)+'</span>'+
      '<div class="grow"><div class="h3">Add '+fmt(tot.freeLeft)+' more and delivery is free</div>'+
      '<div class="small text2">Anywhere in Bangladesh, Cash on Delivery.</div></div>'+
      '<a class="btn btn-secondary btn-sm shrink0" href="#/c/new">Add something</a></div>';
  }
  return '<div class="bg-offer-slot bg-offer tint" data-testid="bag-offer-slot">'+
    '<span class="bg-ic">'+ico('gift',18)+'</span>'+
    '<div class="grow"><div class="h3">Free delivery is already on this order</div>'+
    /* R16 (13): "Order before 5 pm and it ships today" had no setting behind
       it. The line now comes from the delivery rule the owner edits. */
    '<div class="small text2">'+esc(deliveryPromise(currentAccount() ? currentAccount().zone : null))+'.</div></div>'+
    '<a class="btn btn-secondary btn-sm shrink0" href="#/checkout">Checkout</a></div>';
}

/* ---------- page ---------- */
function bag_render(){
  if(!ST.bag.length) return bag_empty();
  var tot = bagTotals(), off = bag_bestOffer(tot.total), grand = tot.total - off.amount;
  var tags = bag_comboTags(tot), pairs = bracketPairs(), duo = bag_duoOffer(), after = {};
  pairs.forEach(function(b){ var mx = -1; bag_pairLines(b).forEach(function(l){ mx = Math.max(mx, ST.bag.indexOf(l)); }); (after[mx] = after[mx]||[]).push(b); });
  var issues = bagStockIssues(), lineIssues = {};
  issues.forEach(function(x){ (x.lines||[]).forEach(function(id){ (lineIssues[id] = lineIssues[id]||[]).push(x); }); });
  var rows = ST.bag.map(function(l, i){
    var row = tot.lines.filter(function(x){ return x.line===l; })[0];
    /* wave 2 (PR 574): the combo-in-bag template (setting + ?btpl=) draws set lines */
    var h = l.kind==='set' ? (typeof cbt_line==='function' ? cbt_line(l, row, lineIssues[l.id]) : bag_setLine(l, row, lineIssues[l.id])) : bag_itemLine(l, tags[l.id], lineIssues[l.id]);
    (after[i]||[]).forEach(function(b){ h += bag_brkCard(b); });
    return h;
  }).join('');
  /* 28+30+36. When delivery is already free there is nothing to work towards:
     the progress bar comes off and the line simply says so, loudly — which
     also gives back the ~70px that kept Checkout below the fold. */
  var fdel = bag_freeDel(tot.total), pct = Math.min(100, Math.round(tot.total/tot.free*100));
  var free = fdel.free
    ? '<div class="bg-freebar" data-testid="bag-free">'+ico('truck',20)+
        '<span class="grow"><b>Free home delivery</b><span>'+esc(bag_freeWhy(fdel))+'</span></span>'+
        '<span class="bg-freeb">'+ico('check',13)+'FREE</span></div>'
    : '<div class="card p16 bg-free" data-testid="bag-free"><div class="row small" style="gap:10px"><span class="brandc">'+ico('truck',20)+'</span>'+
        '<span>Add <b>'+fmt(tot.freeLeft)+'</b> more for free delivery</span>'+
      '</div><div class="bar-progress mt8" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><div style="width:'+pct+'%"></div></div></div>';
  var help = '<div class="card bg-help"><div class="h3">Questions about size or delivery?</div>'+
    cb_waBtn('Message us on WhatsApp', 'Hi EXTAS, I have a question about my bag', 'bg-wa')+'</div>';
  return '<div class="bg-page">'+
    '<div class="container bg-wrap">'+
      '<div class="bg-title"><h1 class="h1">Your bag<span class="cnt"><bdi class="hide-m bg-cdash">— </bdi>'+plural(tot.count,'item')+'</span></h1><a class="link hide-m bg-cont" href="#/c/new">Continue shopping</a></div>'+
      '<div class="split-side">'+
        '<div class="stack s16" style="min-width:0">'+free+(typeof bagEndedNoteHTML==='function' ? bagEndedNoteHTML('bg-ended') : '')+'<div class="card bg-lines">'+rows+'</div>'+
          bag_offerSlot(tot, duo)+bag_savedStrip()+(typeof cbt_tplBar==='function' ? cbt_tplBar() : '')+
          (SHOW('bag','waAboveTotal') ? help : '')+'</div>'+
        '<aside class="sticky-d"><div class="card p20" data-testid="bag-summary">'+bag_summary(tot, off, grand, issues)+'</div></aside>'+
      '</div>'+
    '</div>'+
    upsellBlock('bag')+
    '<div class="mbar dm-hide bg-mbar">'+(issues.length ? '<button class="btn btn-primary btn-block" disabled data-testid="bag-mbar">Fix your bag to continue</button>' : '<a class="btn btn-primary btn-block" href="#/checkout" data-testid="bag-mbar">Total '+fmt(grand)+' · '+esc(t('Checkout'))+ico('right',16)+'</a>')+'</div>'+
  '</div>';
}
/* ----- 41/42. the "Goes well with your bag" row glides -----
   Every sliding row on the site has to glide rather than jump. The row is
   built by the shared upsell block, which has no id of its own, so the page
   names it after render and hands it to the one slider engine. */
function bag_after(){
  bag_stickyWatch();
  if(typeof cbt_fit==='function') cbt_fit();
  if(typeof SMOOTH === 'undefined') return;
  SMOOTH.stopAll();                               /* every render rebuilds the DOM */
  var row = document.querySelector('.bg-page .ups-row');
  if(row){ row.id = 'bg-upsrow'; SMOOTH.start('bg-upsrow', {dir:-1, speed:20}); }
}
/* ----- 28. one Checkout button on screen at a time -----
   With one product in the bag the whole page now ends at the Checkout button
   inside the summary — but the sticky bar was parked on top of it, so the
   owner saw two Checkouts, one covering the other. The sticky bar is for when
   the real button is NOT on screen: it steps aside the moment the summary's
   own button is visible, and comes back as soon as it scrolls away. */
var BAG_STICKY = {obs:null, onScroll:null};
function bag_stickyWatch(){
  if(BAG_STICKY.obs){ BAG_STICKY.obs.disconnect(); BAG_STICKY.obs = null; }
  if(BAG_STICKY.onScroll){ window.removeEventListener('scroll', BAG_STICKY.onScroll); BAG_STICKY.onScroll = null; }
  var btn = document.querySelector('[data-testid="bag-checkout"]'), bar = document.querySelector('.bg-mbar');
  if(!btn || !bar) return;
  var set = function(hide){ bar.classList.toggle('bg-mbar-off', !!hide); };
  if(window.IntersectionObserver){
    /* -12px: the button has to be clear of the bar's own shadow, not merely
       touching the bottom edge of the screen */
    BAG_STICKY.obs = new IntersectionObserver(function(es){ set(es[0].isIntersecting); }, {threshold:0.9, rootMargin:'0px 0px -12px 0px'});
    BAG_STICKY.obs.observe(btn);
  } else {
    BAG_STICKY.onScroll = function(){ var r = btn.getBoundingClientRect(); set(r.top >= 0 && r.bottom <= window.innerHeight - 12); };
    window.addEventListener('scroll', BAG_STICKY.onScroll, {passive:true});
    BAG_STICKY.onScroll();
  }
}
PAGES.bag = { layout:'store', title:function(){ return t('Bag'); }, render:bag_render, after:bag_after };

/* ----- 35. the add-to-bag sheet never raises the delivery charge -----
   The sheet used to say "Add ৳650 more for free delivery" with a progress bar
   whenever the order did not qualify. At the moment someone has just said yes,
   that line prices the purchase upward and invites second thoughts. What is
   actually on their mind then is "can I trust this, and what if the size is
   wrong" — so the slot answers that instead: Cash on Delivery and the size
   exchange window. When delivery IS free the sheet still says so, because
   that line only ever adds to the order.

   The sheet itself lives in another module. Rather than edit that file this
   wraps it: if the "more for free delivery" block is not found the original
   markup is returned untouched. */
if(typeof pdp_bagModalHTML === 'function'){
  var bag_sheetBase = pdp_bagModalHTML;
  pdp_bagModalHTML = function(){
    var html = bag_sheetBase.apply(this, arguments);
    if(!html) return html;
    try{
      var box = document.createElement('div'); box.innerHTML = html;
      var bar = box.querySelector('.bar-progress');
      if(!bar) return html;                        /* already qualifies — leave it */
      var host = bar.parentNode, prev = bar.previousElementSibling;
      if(prev && /free delivery/i.test(prev.textContent || '')) host.removeChild(prev);
      host.removeChild(bar);
      var hrs = SET('exchange','windowHours');
      var rea = document.createElement('div');
      rea.className = 'atb-reassure';
      rea.innerHTML = '<span>'+ico('cash',15)+'Cash on Delivery</span>'+
                      '<span>'+ico('swap',15)+esc(hrs+'-hour size exchange')+'</span>';
      host.appendChild(rea);
      return box.innerHTML;
    }catch(e){ return html; }
  };
}

/* ---------- R16 · Move to wishlist / Saved for later ----------
   "Save for later" took the line out of the bag and the page then said
   "Your bag is empty" — a guest thought the item had vanished. Now the line
   moves to the wishlist (kept on this phone for a guest — no login wall,
   which would lose the sale), the toast offers Undo, and the bag page (empty
   or not) shows the saved items with "Move to bag". The colour and size the
   shopper had are remembered in ST.savedFor so moving back is one tap. */
var BAG_UNDO = null;
function bag_undoToast(msg){
  var t0 = document.querySelector('.toast'); if(t0) t0.remove();
  var d = document.createElement('div'); d.className = 'toast cb-toast'; d.setAttribute('role','status');
  d.innerHTML = '<span>'+esc(msg)+'</span><a href="#/bag" data-act="bag-undo" data-testid="bag-undo">Undo</a>';
  document.body.appendChild(d); toastArm(d, 6000);   /* T7: holds under the mouse / keyboard (02-core) */
}
function bag_takeOut(id, toWish){
  var ix = -1; for(var i=0;i<ST.bag.length;i++) if(ST.bag[i].id===id) ix = i;
  if(ix<0) return null;
  var l = ST.bag[ix], u = {line:JSON.parse(JSON.stringify(l)), index:ix, wishAdded:false, savedPrev:null, pid:null};
  if(toWish && l.kind==='item'){
    ST.savedFor = ST.savedFor || {};
    u.pid = l.product; u.savedPrev = ST.savedFor[l.product] || null;
    if(ST.wishlist.indexOf(l.product)<0){ ST.wishlist.push(l.product); u.wishAdded = true; }
    ST.savedFor[l.product] = {color:l.color, size:l.size};
  }
  /* wave 2: a combo moves to "Saved for later" whole (its pieces, colours,
     sizes and set) — never split into single pieces in the wishlist */
  if(toWish && l.kind==='set'){ ST.savedSets = ST.savedSets || []; ST.savedSets.unshift(JSON.parse(JSON.stringify(l))); u.savedSet = l.id; }
  bagRemove(id); BAG_UNDO = u; saveState();
  return u;
}
function bag_savedStrip(){
  var ids = (ST.wishlist||[]).filter(function(id){ return !!P(id); });
  var sets = (ST.savedSets||[]).filter(function(l){ return (l.items||[]).every(function(it){ return !!P(it.product); }); });
  if(!ids.length && !sets.length) return '';
  var sf = ST.savedFor || {}, guest = !currentAccount();
  var rows = ids.map(function(id){
    var p = P(id), s = sf[id], col = s && s.color && p.colors.indexOf(s.color)>=0 ? s.color : (typeof cb_firstColor==='function' ? cb_firstColor(p) : p.colors[0]);
    var sub = s && s.size ? esc(COL(col).name)+' · '+esc(s.size) : esc(COL(col).name)+' · <span class="muted">size not chosen</span>';
    return '<div class="zc-saved" data-pid="'+esc(id)+'"><div class="zc-savedimg">'+bag_img(p, col, {ratio:'ratio-11', label:false})+'</div>'+
      '<div class="grow" style="min-width:0"><div class="small bold zc-savednm">'+esc(p.name)+'</div><div class="xs text2">'+sub+'</div><div class="small price" style="margin-top:2px">'+fmt(p.price)+'</div></div>'+
      '<button type="button" class="btn btn-secondary btn-sm shrink0" data-act="bag-unsave" data-pid="'+esc(id)+'">'+ico('bag',15)+'Move to bag</button></div>';
  }).join('');
  rows = sets.map(function(l){
    var pr = bagSetPrice(l), sub = l.items.map(function(it){ return COL(it.color).name+' · '+it.size; }).join(' + ');
    var pic = l.source==='auto' && typeof ca_setPhoto==='function' ? ca_setPhoto(ca_piecesOf(l.items), {layout:'thumb'}) : setImg(l.items, {ratio:'ratio-11'});
    return '<div class="zc-saved" data-set="'+esc(l.id)+'" data-testid="bag-saved-set"><div class="zc-savedimg">'+pic+'</div>'+
      '<div class="grow" style="min-width:0"><div class="small bold zc-savednm">'+esc(bagSetName(l.name))+'</div><div class="xs text2">'+esc(sub)+'</div><div class="small price" style="margin-top:2px">'+fmt(pr.price)+'</div></div>'+
      '<button type="button" class="btn btn-secondary btn-sm shrink0" data-act="bag-unsave-set" data-id="'+esc(l.id)+'">'+ico('bag',15)+'Move to bag</button></div>';
  }).join('')+rows;
  return '<section class="card zc-savedbox" data-testid="bag-saved"><div class="row between"><div class="h3">'+ico('heart',16)+' Saved for later ('+(ids.length+sets.length)+')</div><a class="link xs" href="#/account/wishlist">Wishlist</a></div>'+
    '<div class="zc-savedlist">'+rows+'</div>'+
    (guest ? '<div class="xs muted mt8" data-testid="bag-saved-guest">Saved on this phone. <a class="link" href="#/login?next=%23%2Fbag">Log in</a> to keep it on every device.</div>' : '')+
  '</section>';
}
function bag_unsave(pid, color, size){
  var p = P(pid); if(!p) return false;
  var res = bagAdd({kind:'item', product:pid, color:color, size:size, qty:1}, {quiet:true});
  if(!res.added && res.reason==='stock'){ toast(res.msg); return false; }
  if(!res.added && res.reason==='repeat') return false;
  var i = ST.wishlist.indexOf(pid); if(i>=0) ST.wishlist.splice(i, 1);
  if(ST.savedFor) delete ST.savedFor[pid];
  saveState(); rerender();
  toast(res.added ? p.name+' moved to your bag' : p.name+' is already in your bag');
  return true;
}
function bag_pickHTML(){
  var u = UI['bag:pick']; if(!u) return ''; var p = P(u.pid); if(!p) return '';
  var sw = p.colors.map(function(c){ var out = totalStock(p.id, c)<=0, on = c===u.color;
    return '<button type="button" class="swatch'+(on?' on':'')+'" style="background:'+COL(c).hex+(out?';opacity:.35':'')+'" data-act="bag-pick-col" data-c="'+c+'" aria-label="'+esc(COL(c).name)+'" aria-pressed="'+on+'"'+(out?' disabled':'')+'></button>'; }).join('');
  var pills = p.sizes.map(function(s){ var out = stockOf(p.id, u.color, s)<=0;
    return '<button type="button" class="size-pill'+(out?' out':'')+'" data-act="bag-pick-size" data-s="'+esc(s)+'"'+(out?' disabled':'')+'>'+esc(s)+'</button>'; }).join('');
  return '<div class="row" style="gap:12px"><div style="width:64px;flex-shrink:0">'+bag_img(p, u.color, {ratio:'ratio-11', label:false})+'</div><div><div class="bold">'+esc(p.name)+'</div><div class="small price">'+fmt(p.price)+'</div></div></div>'+
    '<div class="small mt16"><b>Colour:</b> '+esc(COL(u.color).name)+'</div><div class="row wrap mt8" style="gap:10px">'+sw+'</div>'+
    '<div class="small mt16"><b>Size</b> — tap one to move it to your bag</div><div class="row wrap mt8" style="gap:8px">'+pills+'</div>';
}

/* ---------- actions ---------- */
ACT['bag-qty'] = function(el){ bagSetQty(el.getAttribute('data-id'), Number(el.getAttribute('data-q'))); rerender(); };
ACT['bag-remove'] = function(el){ if(!bag_takeOut(el.getAttribute('data-id'), false)) return; rerender(); bag_undoToast('Removed from your bag'); };
ACT['bag-save'] = function(el){ if(!bag_takeOut(el.getAttribute('data-id'), true)) return; rerender(); bag_undoToast('Moved to your wishlist'); };
ACT['bag-undo'] = function(){
  var u = BAG_UNDO; if(!u) return; BAG_UNDO = null;
  if(!ST.bag.some(function(l){ return l.id===u.line.id; })) ST.bag.splice(Math.min(u.index, ST.bag.length), 0, u.line);
  if(u.savedSet && ST.savedSets) ST.savedSets = ST.savedSets.filter(function(x){ return x.id!==u.savedSet; });
  if(u.pid){ if(u.wishAdded){ var i = ST.wishlist.indexOf(u.pid); if(i>=0) ST.wishlist.splice(i, 1); } ST.savedFor = ST.savedFor || {}; if(u.savedPrev) ST.savedFor[u.pid] = u.savedPrev; else delete ST.savedFor[u.pid]; }
  saveState(); var t0 = document.querySelector('.toast'); if(t0) t0.remove(); rerender();
};
ACT['bag-unsave'] = function(el){
  var pid = el.getAttribute('data-pid'), p = P(pid); if(!p) return;
  var s = (ST.savedFor||{})[pid];
  if(s && s.size && s.color && stockOf(pid, s.color, s.size)>0){ bag_unsave(pid, s.color, s.size); return; }
  var col = s && s.color && totalStock(pid, s.color)>0 ? s.color : (typeof cb_firstColor==='function' ? cb_firstColor(p) : p.colors[0]);
  UI['bag:pick'] = {pid:pid, color:col};
  openModal(bag_pickHTML(), {title:'Choose a size', rebuild:bag_pickHTML});
};
ACT['bag-unsave-set'] = function(el){
  var id = el.getAttribute('data-id'), l = (ST.savedSets||[]).filter(function(x){ return x.id===id; })[0]; if(!l) return;
  var copy = JSON.parse(JSON.stringify(l)); delete copy.id;
  var res = bagAdd(copy, {force:true});
  if(!res.added){ if(res.reason==='stock') toast(res.msg); return; }
  ST.savedSets = ST.savedSets.filter(function(x){ return x.id!==id; }); saveState(); rerender(); toast(bagSetName(l.name)+' moved to your bag');
};
ACT['bag-pick-col'] = function(el){ var u = UI['bag:pick']; if(!u) return; u.color = el.getAttribute('data-c'); refreshModal(); };
ACT['bag-pick-size'] = function(el){ var u = UI['bag:pick']; if(!u) return; closeModal(); bag_unsave(u.pid, u.color, el.getAttribute('data-s')); };
ACT['bag-brk'] = function(el){
  var k = el.getAttribute('data-key'), v = el.getAttribute('data-v');
  if(v) ST.bracketAck[k] = v; else delete ST.bracketAck[k];
  saveState(); rerender();
};
ACT['bag-brk-one'] = function(el){
  var k = el.getAttribute('data-key'), keep = el.getAttribute('data-keep');
  var b = bracketPairs().filter(function(x){ return x.key===k; })[0]; if(!b) return;
  var drop = b.sizes[0]===keep ? b.sizes[1] : b.sizes[0];
  var l = ST.bag.filter(function(x){ return x.kind==='item' && x.product===b.product && x.color===b.color && x.size===drop; })[0];
  if(l){ if(l.qty>1) bagSetQty(l.id, l.qty-1); else bagRemove(l.id); }
  delete ST.bracketAck[k]; saveState(); rerender(); toast('Kept '+keep+' — '+drop+' removed');
};
ACT['bag-duo'] = function(el){
  var d = bag_duoOffer(); if(!d) return;
  var res = bagAdd({kind:'item', product:d.product.id, color:el.getAttribute('data-color'), size:d.line.size, qty:1});
  if(!res.added){ if(res.reason==='already') toast('That colour is already in your bag'); return; }
  rerender(); toast('Added — '+d.combo.name+' price applied');
};
ACT['bag-code-open'] = function(){ var u = ui('bag', {}); u.codeOpen = true; u.codeMsg = ''; rerender(); var i = document.getElementById('bag-code'); if(i) i.focus(); };
ACT['bag-code-remove'] = function(){ ST.appliedCode = null; saveState(); rerender(); toast('Code removed'); };
SUBMIT['bag-code'] = function(f){
  var u = ui('bag', {}), raw = (f.querySelector('[name=code]').value||'').trim().toUpperCase();
  u.codeRaw = raw;
  if(!raw){ u.codeMsg = 'Type your code first.'; rerender(); return; }
  if(!currentAccount()){ u.codeMsg = 'Member codes work after you log in. <a href="#/login">Log in</a>'; rerender(); return; }
  var o = bag_findCode(raw);
  if(!o){ u.codeMsg = 'That code isn\'t valid. Check the spelling, or see your offers in <a href="#/account">My account</a>.'; rerender(); return; }
  if(bag_offerExpired(o)){ u.codeMsg = 'Code '+esc(String(o.code).toUpperCase())+' has expired — it ended on '+esc(dateStr(bag_offerEnd(o)))+'. See your current offers in <a href="#/account">My account</a>.'; rerender(); return; }
  ST.appliedCode = String(o.code).toUpperCase(); u.codeOpen = false; u.codeMsg = ''; u.codeRaw = ''; saveState(); rerender(); toast('Code '+ST.appliedCode+' added');
};
ACT['bag-wa'] = function(){
  var msg = bag_waMessage();
  openModal('<p class="small text2" style="margin:0 0 12px">We\'ll open WhatsApp with this message, ready to send:</p>'+
    '<div class="bg-wa" data-testid="wa-preview">'+esc(msg)+'</div>'+
    '<div class="row top soft p16 mt16" style="gap:10px"><span class="brandc">'+ico('spark',18)+'</span><div class="small">Our team (or EXTAS AI) replies and places the order for you — you just confirm.</div></div>'+
    '<a class="btn btn-primary btn-block mt16" href="'+waLink(msg)+'" target="_blank" rel="noopener">'+waGlyph(19)+'Open WhatsApp and send</a>'+
    '<button class="btn btn-ghost btn-block mt8" data-act="close-modal">Back to my bag</button>', {title:'Send my bag on WhatsApp'});
};

/* =====================================================================
   DESKTOP BATCH B — D-028 · "Added to bag" as a right-side drawer (§46.5)
   Used for combos and ready-made sets on a desktop (the product page has its
   own sheet, opened as the same drawer). openModal gives it everything a
   popup has here: Esc, a click outside and ✕ close it, focus moves in, Tab
   stays inside, and focus returns to the button that opened it (99-boot).
   The delivery line follows the owner's rule 35: free → say so; not free →
   Cash on Delivery and the size exchange, never "add ৳X more".
   ===================================================================== */
function bag_drawerHTML(id){
  var l = (ST.bag||[]).filter(function(x){ return x.id===id; })[0];
  if(!l) return '<p class="small text2">This item is no longer in your bag.</p><div class="pdp-bagbtns mt16"><a class="btn btn-primary" href="#/bag">View bag</a></div>';
  var tot = bagTotals(), row = tot.lines.filter(function(x){ return x.line===l; })[0] || {price:0, regular:0}, pic, name, sub, rel = [];
  if(l.kind==='set'){
    pic = (l.source==='auto' && typeof ca_setPhoto==='function') ? ca_setPhoto(ca_piecesOf(l.items), {layout:'thumb'}) : setImg(l.items, {ratio:'ratio-11'});
    name = typeof bag_setShort==='function' ? bag_setShort(l) : bagSetName(l.name);
    sub = (l.items||[]).map(function(it){ return COL(it.color).name+' · '+it.size; }).join(' + ');
    (l.items||[]).forEach(function(it){ var p = P(it.product); if(p && typeof pdp_pairs==='function') rel = rel.concat(pdp_pairs(p)); });
  } else {
    var p = P(l.product); if(!p) return '';
    pic = productImg(p, l.color, {ratio:'ratio-11', label:false}); name = p.name; sub = COL(l.color).name+' · Size '+l.size;
    if(typeof pdp_pairs==='function') rel = pdp_pairs(p);
  }
  var f = bag_freeDel(tot.total), hrs = SET('exchange','windowHours');
  var del = f.free ? '<div class="xs brandc bold row mt8" style="gap:6px">'+ico('truck',14)+esc(bag_freeOrderLine(f))+'</div>'
                   : '<div class="atb-reassure"><span>'+ico('cash',15)+'Cash on Delivery</span><span>'+ico('swap',15)+esc(hrs+'-hour size exchange')+'</span></div>';
  return '<div class="stack s16" data-testid="bag-drawer">'+
    '<div class="row atb-line" style="gap:12px"><div class="atb-lth">'+pic+'</div><div class="grow" style="min-width:0"><div class="small bold">'+esc(name)+'</div><div class="xs text2">'+esc(sub)+'</div></div>'+
      '<div style="text-align:right"><div class="price small">'+fmt(row.price)+'</div>'+(row.regular>row.price ? '<div class="strike xs">'+fmt(row.regular)+'</div>' : '')+'</div></div>'+
    '<div class="soft p16"><div class="row between small"><span class="text2">Bag · '+plural(tot.count,'item')+'</span><span class="price">'+fmt(tot.total)+'</span></div>'+
      (tot.discount>0 ? '<div class="row between xs brandc bold mt8"><span>Set savings</span><span>'+fmt(-tot.discount)+'</span></div>' : '')+del+'</div>'+
    '<div class="pdp-bagbtns"><button type="button" class="btn btn-ghost" data-act="close-modal">Keep shopping</button><a class="btn btn-secondary" href="#/bag">View bag</a><a class="btn btn-primary" href="#/checkout">'+esc(t('Checkout'))+'</a></div>'+
    (typeof dkb_crossSell==='function' ? dkb_crossSell(rel, 3) : '')+'</div>';
}
function bag_drawerOpen(id){
  openModal(bag_drawerHTML(id), {title:'Added to bag', rebuild:function(){ return bag_drawerHTML(id); }, cls:'atb-d'});
}
