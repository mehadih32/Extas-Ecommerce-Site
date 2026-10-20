/* =====================================================================
   89u-bag-offers.js — Admin › Settings rows for the owner's bag review
   Sawdagor সওদাগর A360-04 · Shilpi শিল্পী A360-05 · 19 Oct 2026
     "Bag page words"     item 8 — every heading / offer label on the bag,
                          English + Bengali (values read by bag_w(), 50-bag.js)
     "Bag offer tiers"    item 9 — the "take more, pay less" box: on/off,
                          dates, and per price rule: where it applies
                          (categories or products), up to 4 tiers with
                          pieces, price and an optional label.
   The tier prices ARE the "Build your own set" rules (ST.setRulesOverride,
   the same store Admin › Combos writes), so the box, the set builder and the
   bag total can never show three different prices.
   ===================================================================== */
(function(){
  if(typeof ZS_SETTINGS==='undefined' || typeof ZS_GROUPS==='undefined' || typeof BAG_WORDS==='undefined') return;
  var rows = [];
  var NAMES = {
    'bag.w.alsoLike':['Suggestions heading', 'সাজেশনের শিরোনাম'], 'bag.w.sameCat':['Suggestions line under it', 'তার নিচের লাইন'],
    'bag.w.buyN':['Multi-buy name ({n} = pieces)', 'একসাথে কেনার নাম ({n} = কয়টা)'], 'bag.w.buyNSub':['Multi-buy line ({n}, {price}, {save})', 'একসাথে কেনার লাইন'],
    'bag.w.applied':['Tag on an item when the multi-buy price is used', 'দাম কমলে পণ্যের পাশে ট্যাগ'],
    'bag.w.addOne':['"Add one more" offer — heading', '"আরেকটা নিন" অফার — শিরোনাম'], 'bag.w.addOneSub':['"Add one more" offer — line ({price}, {size})', '"আরেকটা নিন" অফার — লাইন'],
    'bag.w.setTitle':['Ready-made set offer — heading ({n}, {save})', 'রেডি সেট অফার — শিরোনাম'], 'bag.w.setSub':['Ready-made set offer — line ({what}, {price}, {n})', 'রেডি সেট অফার — লাইন'],
    'bag.w.setAuto':['Ready-made set — "price drops by itself" ({k})', 'রেডি সেট — "দাম নিজে কমবে"'], 'bag.w.setGo':['Ready-made set — button', 'রেডি সেট — বাটন'],
    'bag.w.tiersTitle':['Tier box — heading ({cat})', 'ধাপের বক্স — শিরোনাম'], 'bag.w.tier':['Tier box — one tier ({n})', 'ধাপের বক্স — এক ধাপ'],
    'bag.w.tierSave':['Tier box — saving ({save})', 'ধাপের বক্স — সাশ্রয়'], 'bag.w.tiersGo':['Tier box — link ({cat})', 'ধাপের বক্স — লিংক']
  };
  Object.keys(BAG_WORDS).forEach(function(k){
    var nm = NAMES[k] || [k, k];
    [[k, ' (English)', ' — ইংরেজি'], [k+'Bn', ' (Bengali)', ' — বাংলা']].forEach(function(x){
      var id = x[0];
      rows.push({id:'opt.'+id, g:'bagwords', en:nm[0]+x[1], bn:nm[1]+x[2], type:'text', where:'Bag page', see:'#/bag',
        get:function(){ return OPT(id); }, set:function(v){ optSet(id, v); }, def:function(){ return SHOP_OPT_DEF[id]; }, reset:function(){ optReset(id); }});
    });
  });

  /* ---- tiers ---- */
  var cfg = function(){ ST.bagTiers = ST.bagTiers || {}; return ST.bagTiers; };
  var rule = function(id){ return setRules().filter(function(r){ return r.id===id; })[0]; };
  var patch = function(id, p){ ST.setRulesOverride[id] = Object.assign({}, ST.setRulesOverride[id] || {}, p); saveState(); };
  var writeTiers = function(id, list){ var o = {}; list.forEach(function(t){ if(t.n>0 && t.price>0) o[t.n] = t.price; }); patch(id, {tiers:o}); };
  var list = function(id){ var r = rule(id); return r ? bag_tierList(r) : []; };
  rows.push({id:'tiers.on', g:'bagtiers', en:'Show the "take more, pay less" box on the bag', bn:'ব্যাগে "বেশি নিলে কম দাম" বক্স দেখাবে', type:'sw', where:'Bag (desktop)', see:'#/bag',
    get:function(){ return bag_tierCfg().on; }, set:function(v){ cfg().on = !!v; saveState(); }, def:function(){ return true; }, reset:function(){ delete cfg().on; saveState(); }});
  [['start', 'Starts on (YYYY-MM-DD, empty = now)', 'শুরু (খালি = এখন থেকেই)'], ['end', 'Ends after (YYYY-MM-DD, empty = no end)', 'শেষ (খালি = শেষ নেই)']].forEach(function(x){
    rows.push({id:'tiers.'+x[0], g:'bagtiers', en:x[1], bn:x[2], type:'text', where:'Bag (desktop)', see:'#/bag',
      get:function(){ return bag_tierCfg()[x[0]] || ''; }, set:function(v){ v = String(v||'').trim(); if(v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return; cfg()[x[0]] = v; saveState(); }, def:function(){ return ''; }, reset:function(){ delete cfg()[x[0]]; saveState(); }});
  });
  (DB.customSetRules||[]).forEach(function(r0){
    var id = r0.id, nm = r0.name;
    rows.push({id:'tiers.'+id+'.show', g:'bagtiers', en:nm+' — show its tiers on the bag', bn:nm+' — ব্যাগে এর ধাপ দেখাবে', type:'sw', where:'Bag (desktop)', see:'#/bag',
      get:function(){ return !(bag_tierCfg().off||{})[id]; }, set:function(v){ var c = cfg(); c.off = Object.assign({}, c.off||{}); if(v) delete c.off[id]; else c.off[id] = true; saveState(); }, def:function(){ return true; }, reset:function(){ var c = cfg(); if(c.off) delete c.off[id]; saveState(); }});
    rows.push({id:'tiers.'+id+'.cats', g:'bagtiers', en:nm+' — categories it applies to (comma list, e.g. polos,tshirts)', bn:nm+' — কোন ক্যাটাগরিতে (কমা দিয়ে)', type:'text', where:'Bag · Set builder', see:'#/set/'+id,
      get:function(){ var r = rule(id); return r ? (r.categories||[]).join(',') : ''; },
      set:function(v){ var a = String(v||'').split(',').map(function(x){ return x.trim(); }).filter(function(x){ return !!CAT(x); }); patch(id, a.length ? {categories:a, mode:'category'} : {categories:[], mode:(rule(id).skus||[]).length ? 'sku' : 'category'}); },
      def:function(){ return (r0.categories||[]).join(','); }, reset:function(){ var o = ST.setRulesOverride[id]; if(o){ delete o.categories; delete o.mode; } saveState(); }});
    rows.push({id:'tiers.'+id+'.skus', g:'bagtiers', en:nm+' — or these products only (comma list of product ids)', bn:nm+' — অথবা শুধু এই পণ্যগুলো (কমা দিয়ে)', type:'text', where:'Bag · Set builder', see:'#/set/'+id,
      get:function(){ var r = rule(id); return r ? (r.skus||[]).join(',') : ''; },
      set:function(v){ var a = String(v||'').split(',').map(function(x){ return x.trim(); }).filter(function(x){ return !!P(x); }); var r = rule(id); patch(id, {skus:a, mode:(a.length && !(r.categories||[]).length) ? 'sku' : 'category'}); },
      def:function(){ return (r0.skus||[]).join(','); }, reset:function(){ var o = ST.setRulesOverride[id]; if(o){ delete o.skus; delete o.mode; } saveState(); }});
    [0,1,2,3].forEach(function(i){
      var L = 'Tier '+(i+1), LB = 'ধাপ '+(i+1);
      rows.push({id:'tiers.'+id+'.'+i+'.n', g:'bagtiers', en:nm+' — '+L+': pieces (0 = no tier)', bn:nm+' — '+LB+': কয়টা (০ = নেই)', type:'num', where:'Bag · Set builder', see:'#/set/'+id,
        get:function(){ var t = list(id)[i]; return t ? t.n : 0; },
        set:function(v){ var l = list(id); if(l[i]) l[i].n = v; else if(v>0) l.push({n:v, price:0}); writeTiers(id, l); },
        def:function(){ var t = bag_tierList(r0)[i]; return t ? t.n : 0; }, reset:function(){ var o = ST.setRulesOverride[id]; if(o) delete o.tiers; saveState(); }});
      rows.push({id:'tiers.'+id+'.'+i+'.price', g:'bagtiers', en:nm+' — '+L+': price for all of them (৳)', bn:nm+' — '+LB+': সবগুলোর দাম (৳)', type:'num', where:'Bag · Set builder', see:'#/set/'+id,
        get:function(){ var t = list(id)[i]; return t ? t.price : 0; },
        set:function(v){ var l = list(id); if(l[i]) l[i].price = v; else if(v>0) l.push({n:(l.length ? l[l.length-1].n+1 : 2), price:v}); writeTiers(id, l); },
        def:function(){ var t = bag_tierList(r0)[i]; return t ? t.price : 0; }, reset:function(){ var o = ST.setRulesOverride[id]; if(o) delete o.tiers; saveState(); }});
      rows.push({id:'tiers.'+id+'.'+i+'.label', g:'bagtiers', en:nm+' — '+L+': own words (empty = "Take {n}")', bn:nm+' — '+LB+': নিজের লেখা (খালি = "{n}টা নিন")', type:'text', where:'Bag (desktop)', see:'#/bag',
        get:function(){ var t = list(id)[i]; return t ? ((bag_tierCfg().labels||{})[id+':'+t.n] || '') : ''; },
        set:function(v){ var t = list(id)[i]; if(!t) return; var c = cfg(); c.labels = Object.assign({}, c.labels||{}); if(String(v||'').trim()) c.labels[id+':'+t.n] = String(v); else delete c.labels[id+':'+t.n]; saveState(); },
        def:function(){ return ''; }, reset:function(){ var t = list(id)[i], c = cfg(); if(t && c.labels) delete c.labels[id+':'+t.n]; saveState(); }});
    });
  });
  rows.forEach(function(r){ if(!zs_S(r.id)) ZS_SETTINGS.push(r); });
  var groups = [
    ['bagwords', 'Bag page words', 'ব্যাগ পেজের লেখা — সহজ ইংরেজি আর বাংলা', 'owner bag review 8'],
    ['bagtiers', 'Bag offer tiers — take more, pay less', 'ব্যাগের ধাপের অফার — বেশি নিলে কম দাম', 'owner bag review 9']
  ];
  var at = -1; ZS_GROUPS.forEach(function(g, i){ if(g[0]==='install') at = i; });
  groups.forEach(function(g){ if(ZS_GROUPS.some(function(x){ return x[0]===g[0]; })) return; if(at >= 0){ ZS_GROUPS.splice(at, 0, g); at++; } else ZS_GROUPS.push(g); });
})();
