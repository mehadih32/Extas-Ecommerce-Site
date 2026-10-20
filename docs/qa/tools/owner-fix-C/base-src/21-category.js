/* ================= EXTAS demo — category + search pages (21-category.js) ================= */
(function(){
  var css = [
  '@media(max-width:1023px){.cat-dt{display:none!important}}',
  '@media(min-width:1024px){.cat-ph{display:none!important}}',
  '.cat-hd{padding:16px 0 4px}',
  '.cat-hd .h1{margin-top:14px}',
  '.cat-hd p{margin:8px 0 0;max-width:640px}',
  '@media(min-width:1024px){.cat-hd{padding:24px 0 4px}.cat-hd .h1{font-size:40px;margin-top:18px}}',
  '.cat-layout{display:block;margin-top:14px}',
  '@media(min-width:1024px){.cat-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:40px;align-items:start;margin-top:32px}}',
  '.cat-side{padding:2px 4px 24px 2px}',
  '.cat-side-hd{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid var(--line);margin-bottom:4px}',
  '.cat-fg{padding:18px 0;border-bottom:1px solid var(--line)}',
  '.cat-fg:last-child{border-bottom:0}',
  '.cat-fg-h{font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;font-weight:700;color:var(--ink);margin:0 0 12px}',
  '.cat-fg-sub{font-size:11.5px;color:var(--muted);margin:10px 0 6px}',
  '.cat-sizes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}',
  '@media(max-width:1023px){.cat-sizes{grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}}',
  '.cat-sz{min-height:40px;border:1px solid var(--input);background:var(--surface);border-radius:var(--radius);font-weight:600;font-size:13px;cursor:pointer;color:var(--ink);padding:0 4px}',
  '@media(max-width:1023px){.cat-sz{min-height:44px}}',
  '.cat-sz:hover{border-color:var(--ink)}',
  '.cat-sz.on{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}',
  '.cat-sz[disabled]{background:var(--bg);border-style:dashed;color:var(--strike);text-decoration:line-through;cursor:not-allowed}',
  '.cat-opt{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:14px;cursor:pointer;min-height:34px;color:var(--ink)}',
  '@media(max-width:1023px){.cat-opt{min-height:44px}}',
  '.cat-opt input{width:18px;height:18px;accent-color:var(--brand);margin:0;flex-shrink:0}',
  '.cat-opt .n{margin-left:auto;font-size:12px;color:var(--muted)}',
  '.cat-cols{display:grid;grid-template-columns:1fr;column-gap:14px}',
  '@media(max-width:1023px){.cat-cols{grid-template-columns:1fr 1fr}}',
  '.cat-sw{width:16px;height:16px;border-radius:50%;border:1px solid var(--input);flex-shrink:0}',
  '.cat-tgl{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;background:none;border:0;padding:6px 0;cursor:pointer;font-size:14px;font-weight:500;text-align:left;color:var(--ink);min-height:40px}',
  '.cat-tgl .switch{display:inline-block;pointer-events:none}',
  '.cat-tgl small{display:block;font-size:12px;color:var(--muted);font-weight:400;margin-top:1px}',
  '.cat-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:16px;margin-bottom:18px;border-bottom:1px solid var(--line)}',
  '.cat-actives{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:-4px 0 18px}',
  '.cat-x{display:inline-flex;align-items:center;gap:6px;padding:6px 10px 6px 12px;border-radius:20px;border:1px solid var(--line);background:var(--surface);font-size:12.5px;font-weight:600;cursor:pointer;color:var(--ink)}',
  '.cat-x:hover{border-color:var(--ink)}',
  /* 18. the row's layout lives in r11-cat.css — only the sticky shell here */
  '.cat-ptools{position:sticky;top:61px;z-index:20;background:var(--bg);margin:0 -16px;padding:10px 16px;border-bottom:1px solid var(--line)}',
  '@media(min-width:768px){.cat-ptools{margin:0 -24px;padding:10px 24px}}',
  /* 15. the chip row's grid lives in r12-cat.css so it can stay one tidy set */
  '.cat-count{background:var(--brand);color:var(--brand-ink);font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;padding:0 5px}',
  /* 20. the card's inner layout lives in r11-cat.css */
  '.cat-banner{grid-column:1/-1;background:var(--brand);color:var(--brand-ink)!important;border-radius:var(--card-radius);margin:6px 0}',
  '.cat-banner .eyebrow{color:var(--brand-ink);opacity:.72}',
  '.cat-banner-t{font-family:var(--font-display);font-weight:700;font-size:20px;line-height:1.25}',
  '.cat-banner-ico{border-radius:50%;border:1px solid color-mix(in srgb, var(--brand-ink) 40%, transparent);display:flex;align-items:center;justify-content:center;flex-shrink:0}',
  '.cat-banner .btn{background:var(--brand-ink);color:var(--brand)!important;border-color:var(--brand-ink)}',
  '.cat-nw{white-space:nowrap}',   /* a price never splits: "৳ 2,100" stays on one line (phone banner) */
  '.cat-more{margin:40px auto 0;max-width:300px;text-align:center}',
  '.cat-more .bar-progress{margin-top:10px}',
  '.cat-info{display:grid;gap:36px;margin-top:48px;padding-top:36px;border-top:1px solid var(--line)}',
  '@media(min-width:1024px){.cat-info{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:72px;margin-top:72px;padding-top:56px}}',
  '.cat-seo-txt{color:var(--text2);font-size:14.5px;line-height:1.75;margin-top:12px}',
  '.cat-seo-txt p{margin:0 0 10px}',
  '.cat-seo-txt.clamp{max-height:5.3em;overflow:hidden;-webkit-mask-image:linear-gradient(#000 45%,transparent);mask-image:linear-gradient(#000 45%,transparent)}',
  '.cat-faq{margin-top:10px;border-top:1px solid var(--line)}',
  '.cat-faq-item{border-bottom:1px solid var(--line)}',
  '.cat-faq-q{display:flex;width:100%;justify-content:space-between;align-items:center;gap:12px;background:none;border:0;padding:18px 0;font-size:15px;font-weight:600;text-align:left;cursor:pointer;color:var(--ink);min-height:44px}',
  '.cat-faq-a{padding:0 0 20px;color:var(--text2);font-size:14px;line-height:1.7}',
  '.cat-faq-a p{margin:0 0 8px}',
  '.cat-mfoot{position:sticky;bottom:-22px;margin:18px -20px -22px;padding:12px 20px 14px;background:var(--surface);border-top:1px solid var(--line);display:flex;gap:10px;z-index:3}',
  '.cat-mfoot .btn{flex:1}',
  '.cat-empty{grid-column:1/-1;text-align:center;padding:48px 16px;background:var(--surface);border:1px solid var(--line);border-radius:var(--card-radius)}',
  /* search */
  '.srch-form{display:flex;gap:8px;max-width:640px;margin-top:16px}',
  '.srch-form .input{flex:1;min-width:0}',
  '.srch-empty{background:var(--surface);border:1px solid var(--line);border-radius:var(--card-radius);padding:36px 20px;text-align:center}',
  '@media(min-width:1024px){.srch-empty{padding:56px 32px}}',
  '.srch-empty-ico{width:60px;height:60px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:inline-flex;align-items:center;justify-content:center}',
  ':root[data-theme="festive"] .srch-empty-ico{color:var(--gold)}'
  ].join('\n');
  var s = document.createElement('style'); s.id = 'cat-css'; s.textContent = css; document.head.appendChild(s);
})();

/* ---------- data helpers ---------- */
var CAT_SIZE_ORDER = ['XS','S','M','L','XL','XXL','3XL','4XL','5XL','28','30','32','34','36','38','40','One size'];   /* R15: 3XL and up sort in place · Desktop A (owner 18:38): 5XL added */
var CAT_SORTS = [['rec','Recommended'],['low','Price: low to high'],['high','Price: high to low'],['top','Top rated']];

/* =====================================================================
   14.3 + 14.4  THE PHONE TOOLBAR IS DATA, NOT MARKUP.
   ---------------------------------------------------------------------
   Two rows sit above the product grid on a phone:
     top   — Filter · sort ("Recommended") · On sale        (owner point 14.4)
     chips — the quick-filter row underneath                (owner point 14.3)
   Both are drawn from the config below. Nothing in the render code names a
   button or a chip any more.

   BACKEND HOOK — Dashboard › Category page › Toolbar.
   The dashboard writes the whole object to DB.catToolbar (01-data.js / the
   API). If DB.catToolbar exists it wins; until then CAT_TOOLBAR below is the
   shop's default. Shape:

   {
     top: {
       on: true,                       // master switch for the top row
       items: [                        // ORDER HERE = order on screen
         {id:'filter', on:true, label:'Filter'},
         {id:'sort',   on:true, label:'Sort by',          // label = what a screen reader says
          options:['rec','low','high','top'],            // which sorts are offered, in order
          optionLabels:{rec:'Recommended'}},             // rename any sort
         {id:'sale',   on:true, label:'On sale'}
       ]
     },
     chips: {
       on: false|true,                 // master switch: off = the row is gone, no gap
       chosen: ['fits'],               // THE TICKED SUBSET, in display order —
                                       // "when I tick it, ask me which ones I want"
       library: [ {id, kind, label?, ...} ]   // every chip the owner can tick
     },
     perCategory: { panjabi: { chips:{on:false} } }   // optional, per category
   }

   Chip kinds the library understands (add / edit / remove entries freely):
     mine        My size only — appears only once the customer saved a size
     setOnly     Set price available
     sale        On sale
     priceBands  one chip per price band this category really has (computed, K1)
     priceBand   one band: {band:'lo'|'mid'|'hi'}
     fits        one chip per fit this category really has — {labels:{'Slim fit':'Slim'}}
     fit         one fit:  {value:'Slim fit'}
     priceUnder  {max:1000}   → price up to ৳1,000
     priceOver   {min:1500}   → price from ৳1,500
     color       {value:'navy'}
     size        {value:'XL'} → that size in stock
     tag         {value:'New'} → products carrying that tag
   A chip whose filter would match every product or none in the category is
   left out automatically (unless the customer has it switched on), so the
   owner can tick a chip once and it only shows where it means something.
   ===================================================================== */
var CAT_TOOLBAR = {
  top: {
    on: true,
    items: [
      {id:'filter', on:true, label:'Filter'},
      {id:'sort',   on:true, label:'Sort by', options:['rec','low','high','top'], optionLabels:{}},
      {id:'sale',   on:true, label:'On sale'}
    ]
  },
  chips: {
    on: true,
    /* the owner did not ask for the price chips — they start un-ticked.
       The fit chips stay. Tick 'set' or 'price' in the dashboard to bring
       those back. */
    chosen: ['mine', 'fits'],
    library: [
      {id:'mine',  kind:'mine',       label:'My size only'},
      {id:'set',   kind:'setOnly',    label:'Set price'},
      {id:'price', kind:'priceBands'},
      {id:'fits',  kind:'fits',       labels:{}},
      {id:'sale',  kind:'sale',       label:'On sale'}
      /* owner-added chips look like this:
      {id:'u1000', kind:'priceUnder', max:1000, label:'Under ৳1,000'},
      {id:'navy',  kind:'color', value:'navy'},
      {id:'xl',    kind:'size',  value:'XL', label:'XL in stock'},
      {id:'new',   kind:'tag',   value:'New', label:'New in'} */
    ]
  },
  perCategory: {}
};
function cat_toolbar(id){
  var base = (typeof DB !== 'undefined' && DB.catToolbar) ? DB.catToolbar : CAT_TOOLBAR;
  var over = (base.perCategory || {})[id] || {};
  var top = Object.assign({on:true, items:[]}, base.top || {}, over.top || {});
  var chips = Object.assign({on:false, chosen:[], library:[]}, base.chips || {}, over.chips || {});
  return {top:top, chips:chips};
}
function cat_topItems(id){ var t = cat_toolbar(id).top; return t.on === false ? [] : (t.items || []).filter(function(x){ return x && x.on !== false; }); }
function cat_topItem(id, key){ return cat_topItems(id).filter(function(x){ return x.id === key; })[0] || null; }
/* the sorts offered on this page, [value, label], in the owner's order */
function cat_sortOpts(id){
  var it = (cat_toolbar(id).top.items || []).filter(function(x){ return x && x.id === 'sort'; })[0] || {};
  var names = {}; CAT_SORTS.forEach(function(x){ names[x[0]] = x[1]; });
  var lab = it.optionLabels || {};
  var opts = (it.options && it.options.length ? it.options : CAT_SORTS.map(function(x){ return x[0]; }))
    .filter(function(v){ return names[v]; });
  return opts.map(function(v){ return [v, lab[v] || names[v]]; });
}
/* the library entries the owner ticked, expanded into concrete chips:
   {key, kind, label, group, v, test(p)} */
function cat_chipList(id, base){
  var cfg = cat_toolbar(id).chips;
  if(cfg.on === false) return [];
  var lib = {}; (cfg.library || []).forEach(function(c){ if(c && c.id) lib[c.id] = c; });
  var out = [];
  (cfg.chosen || []).forEach(function(cid){
    var c = lib[cid]; if(!c) return;
    var k = c.kind;
    if(k === 'mine'){ if(cat_hasMySize(base)) out.push({key:cid, label:c.label || 'My size only', group:'mine'}); }
    else if(k === 'setOnly') out.push({key:cid, label:c.label || 'Set price', group:'setOnly', test:cat_inSet});
    else if(k === 'sale') out.push({key:cid, label:c.label || 'On sale', group:'sale', test:cat_onSale});
    else if(k === 'priceBands' || k === 'priceBand'){
      cat_priceBands(id).forEach(function(b){ if(k === 'priceBand' && b[0] !== c.band) return;
        out.push({key:cid+':'+b[0], label:(k === 'priceBand' && c.label) || b[1], group:'prices', v:b[0], test:function(p){ return cat_priceBand(p, id) === b[0]; }}); });
    }
    else if(k === 'fits' || k === 'fit'){
      var fits = k === 'fit' ? [c.value] : cat_options(base).fits;
      fits.forEach(function(f){ out.push({key:cid+':'+f, label:(k === 'fit' ? c.label : (c.labels || {})[f]) || f, group:'fits', v:f, test:function(p){ return p.fit === f; }}); });
    }
    else if(k === 'color') out.push({key:cid, label:c.label || COL(c.value).name, group:'colors', v:c.value, test:function(p){ return p.colors.indexOf(c.value) >= 0; }});
    else if(k === 'size') out.push({key:cid, label:c.label || ('Size '+c.value), group:'sizes', v:c.value, test:function(p){ return p.sizes.indexOf(c.value) >= 0 && cat_sizeInStock(p, c.value); }});
    else if(k === 'priceUnder' || k === 'priceOver' || k === 'tag'){
      var t = k === 'priceUnder' ? function(p){ return p.price <= c.max; }
            : k === 'priceOver'  ? function(p){ return p.price >= c.min; }
            : function(p){ return p.tag === c.value; };
      var lbl = c.label || (k === 'priceUnder' ? 'Under '+fmt(c.max) : k === 'priceOver' ? 'Over '+fmt(c.min) : c.value);
      out.push({key:cid, label:lbl, group:'xc', v:cid, test:t});
    }
  });
  return out;
}
/* the predicate behind an owner-added chip (group 'xc'), by its id */
function cat_xcTest(id, cid){
  var lib = cat_toolbar(id).chips.library || [];
  for(var i=0;i<lib.length;i++){ var c = lib[i]; if(c.id !== cid) continue;
    if(c.kind === 'priceUnder') return function(p){ return p.price <= c.max; };
    if(c.kind === 'priceOver')  return function(p){ return p.price >= c.min; };
    if(c.kind === 'tag')        return function(p){ return p.tag === c.value; };
  }
  return null;
}
function cat_xcLabel(id, cid){
  var lib = cat_toolbar(id).chips.library || [];
  for(var i=0;i<lib.length;i++){ var c = lib[i]; if(c.id === cid)
    return c.label || (c.kind === 'priceUnder' ? 'Under '+fmt(c.max) : c.kind === 'priceOver' ? 'Over '+fmt(c.min) : c.value); }
  return cid;
}

/* =====================================================================
   K1. THE PRICE FILTER IS COMPUTED FROM THE CATEGORY, NOT HARD-CODED.
   ---------------------------------------------------------------------
   It used to be the same three bands everywhere:
     Under ৳800 / ৳800–1,200 / Over ৳1,200
   On Polos (৳850–৳1,190) that put all six styles in the middle band and
   offered two bands that matched nothing. On Caps at ৳400 or Jackets at
   ৳4,000 it would have been worse than useless.
   Now the two cut points are worked out from the category's own cheapest
   and dearest style, pushed out to round numbers a shopper recognises, and
   recomputed every render — so they follow the catalogue by themselves.

   BACKEND HOOK — hand-set bands per category.
   Put an entry in CAT_PRICE_OVERRIDE and it wins over the computed ones:
     CAT_PRICE_OVERRIDE['caps'] = [300, 600];     // two cut points, in taka
     CAT_PRICE_OVERRIDE['jackets'] = [2500, 4000];
   Set it to [] to show no price filter at all for that category.
   ===================================================================== */
var CAT_PRICE_OVERRIDE = {
  /* 'caps': [300, 600], */
};
/* round up to the next "nice" number: 50 below ৳500, 100 below ৳2,000,
   250 below ৳10,000, 500 above — the steps a price list actually uses */
function cat_priceStep(v){ return v < 500 ? 50 : (v < 2000 ? 100 : (v < 10000 ? 250 : 500)); }
function cat_priceRound(v){ var st = cat_priceStep(v); return Math.max(st, Math.round(v / st) * st); }
/* the two cut points for one category, lowest and highest price in hand.
   Memoised on a key made of the category's own prices, so an edited, added
   or removed product recomputes the bands on the next render and nothing
   else does the work twice. */
var CAT_CUTS_CACHE = {};
function cat_priceCuts(id){
  if(CAT_PRICE_OVERRIDE[id]) return CAT_PRICE_OVERRIDE[id].slice();
  var list = cat_base(id);
  var key = id+':'+list.map(function(p){ return p.price; }).join(',');
  if(CAT_CUTS_CACHE[key]) return CAT_CUTS_CACHE[key].slice();
  var out = cat_priceCutsCalc(list);
  CAT_CUTS_CACHE[key] = out;
  return out.slice();
}
function cat_priceCutsCalc(list){
  var prices = list.map(function(p){ return p.price; }).filter(function(v){ return v > 0; });
  if(prices.length < 2) return [];                 /* one style: no bands worth showing */
  /* (list is the category's products; the caller memoises the result) */
  var lo = Math.min.apply(null, prices), hi = Math.max.apply(null, prices);
  if(hi - lo < cat_priceStep(lo)) return [];       /* everything at one price */
  /* thirds of the real range, rounded to a number a shopper recognises */
  var a = cat_priceRound(lo + (hi - lo) / 3);
  var b = cat_priceRound(lo + (hi - lo) * 2 / 3);
  if(b <= a) b = a + cat_priceStep(a);
  /* a cut that sits on or past the top price would make an empty band */
  if(a <= lo) a = lo + cat_priceStep(lo);
  if(b >= hi) b = Math.max(a + cat_priceStep(a), cat_priceRound(hi - cat_priceStep(hi) / 2));
  return (b > a && a > lo && a < hi) ? [a, b] : [];
}
/* the band list the filters are drawn from: [value, label] per band.
   (The old fixed CAT_PRICES array is gone — nothing outside this file used
   it; grep across src/ and tools/ before this edit returned no other use.) */
function cat_priceBands(id){
  var cuts = cat_priceCuts(id);
  if(!cuts.length) return [];
  return [['lo','Under '+fmt(cuts[0])], ['mid', fmt(cuts[0])+'–'+fmt(cuts[1]).replace(/^৳\u2009?/, '')], ['hi','Over '+fmt(cuts[1])]];
}
/* fmt() prefixes a thin space after the taka sign; stripping only the sign
   left "৳ 800– 1,200" with a hole after the dash. */
function cat_priceLabel(v, id){
  var bands = cat_priceBands(id || CAT_CUR);
  for(var i=0;i<bands.length;i++){ if(bands[i][0]===v) return bands[i][1]; }
  return v;
}
/* which band a product falls in, for the category being drawn */
var CAT_CUR = 'new';                               /* set at the top of render() */
function cat_priceBand(p, id){
  var cuts = cat_priceCuts(id || CAT_CUR);
  if(!cuts.length) return null;
  return p.price < cuts[0] ? 'lo' : (p.price <= cuts[1] ? 'mid' : 'hi');
}
function cat_base(id){
  if(id==='search') return SRCH_BASE.slice();      /* Desktop A · D-016: the results being filtered */
  if(id==='new'){
    var list = DB.products.filter(function(p){ return p.cat!=='extras'; });
    var score = function(p){ return p.tag==='New' ? 2 : (p.tag==='Winter 2026' ? 1 : 0); };
    return list.slice().sort(function(a,b){ return score(b)-score(a) || list.indexOf(a)-list.indexOf(b); });
  }
  return productsIn(id);
}
function cat_ui(id){ var u = ui('cat:'+id, {sizes:[], colors:[], fits:[], prices:[], xc:[], setOnly:false, mine:false, sale:false, sort:'rec', seo:false, faq:0, allColors:false});
  if(u.sale===undefined) u.sale = false; if(!u.xc) u.xc = [];
  /* a sort the owner has since switched off falls back to his first one */
  var so = cat_sortOpts(id); if(so.length && !so.some(function(x){ return x[0] === u.sort; })) u.sort = so[0][0];
  return u; }
/* 14. A native <select> hands its option list to the browser, and on a phone
   the browser draws that list as a sheet glued to the bottom of the screen —
   nowhere near the control and impossible to style. So the sort control is an
   ordinary button with our own menu under it. {cat:id, loc:'p'|'d'} or null. */
var CAT_SORT_OPEN = null;
function cat_sortLabel(v, id){ var so = cat_sortOpts(id || CAT_CUR); for(var i=0;i<so.length;i++){ if(so[i][0]===v) return so[i][1]; } return so.length ? so[0][1] : CAT_SORTS[0][1]; }
function cat_sortIsOpen(id, loc){ return !!CAT_SORT_OPEN && CAT_SORT_OPEN.cat===id && CAT_SORT_OPEN.loc===loc; }
function cat_sortCtl(id, loc){
  var u = cat_ui(id), open = cat_sortIsOpen(id, loc), cur = cat_sortLabel(u.sort, id), sortCfg = cat_topItem(id, 'sort') || {};
  var h = '<div class="cat-sortwrap'+(open?' is-open':'')+'">'+
    '<button type="button" class="btn btn-ghost cat-sortbtn" data-act="cat-sortopen" data-cat="'+esc(id)+'" data-loc="'+loc+'"'+
    ' data-fk="'+loc+'-sort" data-testid="cat-sort-btn-'+loc+'" aria-haspopup="listbox" aria-expanded="'+open+'" aria-label="'+esc(sortCfg.label || 'Sort by')+': '+esc(cur)+'">'+
    '<span class="cat-sortv">'+esc(cur)+'</span>'+ico('down',15)+'</button>';
  if(open){
    /* the veil only has to catch the next tap anywhere else on the page */
    h += '<div class="cat-sortveil" data-act="cat-sortclose" aria-hidden="true"></div>'+
      '<div class="cat-sortmenu" role="listbox" aria-label="Sort by" data-testid="cat-sort-menu">'+
      cat_sortOpts(id).map(function(s){ var on = u.sort===s[0];
        return '<button type="button" class="cat-sortopt'+(on?' on':'')+'" role="option" aria-selected="'+on+'" data-act="cat-sortpick" data-cat="'+esc(id)+'" data-v="'+s[0]+'">'+
          '<span>'+esc(s[1])+'</span>'+(on?ico('check',17):'')+'</button>'; }).join('')+'</div>';
  }
  return h+'</div>';
}
/* 18. third control in the phone filter row — on-sale styles only. */
function cat_onSale(p){ return p.compareAt > p.price; }
function cat_saleCount(list){ return list.filter(cat_onSale).length; }
function cat_sizeInStock(p, size, colors){
  var cs = colors && colors.length ? p.colors.filter(function(c){ return colors.indexOf(c)>=0; }) : p.colors;
  return cs.some(function(c){ return stockOf(p.id, c, size)>0; });
}
function cat_inSet(p){
  var inCombo = combos().some(function(c){ return c.active && c.items.indexOf(p.id)>=0; });
  var inRule = setRules().some(function(r){ return r.active && (r.mode==='category' ? r.categories.indexOf(p.cat)>=0 : r.skus.indexOf(p.id)>=0); });
  return inCombo || inRule;
}
function cat_hasMySize(list){ if(!mySize()) return false; return list.some(function(p){ return !!mySizeFor(p); }); }
function cat_activeCount(u){ return u.sizes.length + u.colors.length + u.fits.length + u.prices.length + (u.xc ? u.xc.length : 0) + (u.setOnly?1:0) + (u.mine?1:0) + (u.sale?1:0); }
function cat_apply(list, u, id){
  id = id || CAT_CUR;
  var out = list.filter(function(p){
    if(u.colors.length && !p.colors.some(function(c){ return u.colors.indexOf(c)>=0; })) return false;
    if(u.sizes.length && !u.sizes.some(function(s){ return p.sizes.indexOf(s)>=0 && cat_sizeInStock(p, s, u.colors); })) return false;
    if(u.fits.length && u.fits.indexOf(p.fit)<0) return false;
    if(u.prices.length && u.prices.indexOf(cat_priceBand(p, id))<0) return false;
    if(u.setOnly && !cat_inSet(p)) return false;
    if(u.xc && u.xc.length && !u.xc.every(function(cid){ var t = cat_xcTest(id, cid); return !t || t(p); })) return false;
    if(u.sale && !cat_onSale(p)) return false;
    if(u.mine){ var ms = mySizeFor(p); if(ms && !(p.sizes.indexOf(ms)>=0 && cat_sizeInStock(p, ms, u.colors))) return false; }
    return true;
  });
  if(u.sort==='low') out.sort(function(a,b){ return a.price-b.price; });
  else if(u.sort==='high') out.sort(function(a,b){ return b.price-a.price; });
  else if(u.sort==='top') out.sort(function(a,b){ return (b.rating-a.rating) || (b.reviews-a.reviews); });
  return out;
}
function cat_options(list){
  var sizes = [], colors = [], fits = [];
  list.forEach(function(p){
    p.sizes.forEach(function(s){ if(sizes.indexOf(s)<0) sizes.push(s); });
    p.colors.forEach(function(c){ if(colors.indexOf(c)<0) colors.push(c); });
    if(fits.indexOf(p.fit)<0) fits.push(p.fit);
  });
  var cc = function(c){ return list.filter(function(p){ return p.colors.indexOf(c)>=0; }).length; };
  colors.sort(function(a,b){ return cc(b)-cc(a); });
  sizes.sort(function(a,b){ var ia = CAT_SIZE_ORDER.indexOf(a), ib = CAT_SIZE_ORDER.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib); });
  return {sizes:sizes, colors:colors, fits:fits};
}
function cat_name(id){ if(id==='new') return t('New in'); var c = CAT(id); return c ? t(c.name) : ''; }
function cat_rule(id){ return setRules().filter(function(r){ return r.active && r.mode==='category' && r.categories.indexOf(id)>=0; })[0] || null; }

/* ---------- filter panel (sidebar + phone modal share it) ---------- */
function cat_filtersHTML(id, loc){
  CAT_CUR = id;
  var list = cat_base(id), u = cat_ui(id), o = cat_options(list), h = '';
  var attrs = function(group, v){ return ' data-cat="'+esc(id)+'" data-group="'+group+'"'+(v!=null?' data-v="'+esc(v)+'"':'')+' data-fk="'+loc+'-'+group+'-'+esc(v==null?'':v)+'"'; };
  var opt = function(group, v, label, n, pre){
    var on = u[group].indexOf(v)>=0;
    return '<label class="cat-opt"><input type="checkbox" data-change="cat-chk"'+attrs(group, v)+(on?' checked':'')+'>'+(pre||'')+'<span>'+label+'</span><span class="n">'+n+'</span></label>';
  };
  // set price + my size
  var tg = '<button type="button" class="cat-tgl" data-act="cat-tog" role="switch" aria-checked="'+u.setOnly+'"'+attrs('setOnly')+'><span>Set price available<small>Part of a combo or build-your-own set</small></span><span class="switch'+(u.setOnly?' on':'')+'"></span></button>';
  if(cat_hasMySize(list)){
    var ms = mySize();
    tg += '<button type="button" class="cat-tgl" data-act="cat-tog" role="switch" aria-checked="'+u.mine+'"'+attrs('mine')+'><span>My size only<small>Saved: '+esc([ms.top, ms.bottom].filter(Boolean).join(' / '))+' · off by default</small></span><span class="switch'+(u.mine?' on':'')+'"></span></button>';
  }
  h += '<div class="cat-fg">'+tg+'</div>';
  // sizes
  var letters = o.sizes.filter(function(s){ return !/^\d+$/.test(s) && s!=='One size'; }), waists = o.sizes.filter(function(s){ return /^\d+$/.test(s); });
  var pills = function(arr){ return '<div class="cat-sizes">'+arr.map(function(s){
      var n = list.filter(function(p){ return p.sizes.indexOf(s)>=0 && cat_sizeInStock(p, s); }).length, on = u.sizes.indexOf(s)>=0;
      return '<button type="button" class="cat-sz'+(on?' on':'')+'" data-act="cat-tog" aria-pressed="'+on+'"'+attrs('sizes', s)+(n||on?'':' disabled')+' title="'+n+' in stock">'+esc(s)+'</button>'; }).join('')+'</div>'; };
  if(letters.length || waists.length){
    h += '<div class="cat-fg"><div class="cat-fg-h">Size</div>'+
      (letters.length && waists.length ? '<div class="cat-fg-sub" style="margin-top:0">Tops</div>'+pills(letters)+'<div class="cat-fg-sub">Waist (inches)</div>'+pills(waists) : pills(letters.length?letters:waists))+
      '<div class="xs muted mt8">Shows styles in stock in at least one colour.</div></div>';
  }
  // colours
  var LIM = 6, hiddenOn = o.colors.slice(LIM).some(function(c){ return u.colors.indexOf(c)>=0; });
  var showAll = u.allColors || hiddenOn || o.colors.length<=LIM+1;
  var cols = showAll ? o.colors : o.colors.slice(0, LIM);
  h += '<div class="cat-fg"><div class="cat-fg-h">Colour</div><div class="cat-cols">'+cols.map(function(c){
    var n = list.filter(function(p){ return p.colors.indexOf(c)>=0; }).length;
    return opt('colors', c, esc(COL(c).name), n, '<span class="cat-sw" style="background:'+COL(c).hex+'"></span>');
  }).join('')+'</div>'+
  (o.colors.length>LIM+1 && !hiddenOn ? '<button type="button" class="link" data-act="cat-morecol" data-cat="'+esc(id)+'" data-fk="'+loc+'-morecol" aria-expanded="'+!!u.allColors+'">'+(u.allColors?'Show fewer colours':'+ '+(o.colors.length-LIM)+' more colours')+'</button>' : '')+'</div>';
  // fit
  if(o.fits.length>1 || u.fits.length){
    h += '<div class="cat-fg"><div class="cat-fg-h">Fit</div>'+o.fits.map(function(f){ return opt('fits', f, esc(f), list.filter(function(p){ return p.fit===f; }).length); }).join('')+'</div>';
  }
  // price — the bands are this category's own (K1), so a category whose
  // prices all sit together simply shows no price filter at all
  var bands = cat_priceBands(id);
  if(bands.length){
    h += '<div class="cat-fg"><div class="cat-fg-h">Price</div>'+bands.map(function(pr){
      var n = list.filter(function(p){ return cat_priceBand(p, id)===pr[0]; }).length;
      return (n || u.prices.indexOf(pr[0])>=0) ? opt('prices', pr[0], esc(pr[1]), n) : '';
    }).join('')+'</div>';
  }
  return h;
}
function cat_modalHTML(id){
  CAT_CUR = id;
  var u = cat_ui(id), n = cat_apply(cat_base(id), u, id).length;
  return cat_filtersHTML(id, 'm')+
    '<div class="cat-mfoot"><button type="button" class="btn btn-ghost" data-act="cat-clear" data-cat="'+esc(id)+'"'+(cat_activeCount(u)?'':' disabled')+'>Clear all</button>'+
    '<button type="button" class="btn btn-primary" data-act="close-modal" data-testid="cat-show">Show '+plural(n,'product')+'</button></div>';
}

/* ---------- category page ---------- */
var CAT_SEO = {
  polos:['EXTAS polos are made in Bangladesh from breathable cotton piqué and soft knit fabrics that stay comfortable in our humid weather.','Choose a regular fit for everyday wear or a slim fit for a sharper office look — every product page has a size chart in inches and a Find my size tool.','Pair a polo with our slim chinos for work, or with denim and sneakers for weekends and adda with friends.'],
  tshirts:['Our men’s T-shirts are knitted from 100% cotton, from light everyday crews to heavyweight tees that hold their shape wash after wash.','White, black, navy and earthy colours make it easy to build a full week of outfits — the colour note on each page tells you how the shade looks in daylight.','Not sure about your size? Enter your height and weight in Find my size and we suggest the right one in seconds.'],
  shirts:['EXTAS shirts come in classic cotton Oxford for the office and breathable linen blends for hot Dhaka days.','Each shirt lists chest, length, shoulder and sleeve in inches, so you can compare with a shirt you already own.','Wear them tucked into slim chinos for meetings, or open over a tee on weekends.'],
  panjabi:['Our cotton panjabis are made for Eid, Puja, weddings and every family occasion, with soft fabric that breathes in the heat.','The classic fit falls to the knee with a neat mandarin collar, and the size chart shows chest and length in inches.','Order early before festivals — couriers get busy all over Bangladesh in the last week.'],
  trousers:['EXTAS chinos and twill trousers are cut from cotton twill, many with a touch of stretch for all-day comfort.','Sizes follow your waist in inches, and every product shows hip, thigh, length and leg opening so you know the fit before you order.','Wear them to the office with an Oxford shirt, or dress down with a polo or tee.'],
  hoodies:['Our heavyweight hoodies use thick brushed cotton fleece, made for Bangladeshi winters from Dhaka to Sylhet and Rangpur.','A double-layer hood and kangaroo pocket keep you warm without feeling bulky.','Check chest and length in the size chart, or use Find my size for a quick suggestion.'],
  'new':['New arrivals land at EXTAS every week — polos, T-shirts, shirts, panjabi, chinos and winter hoodies, all made for Bangladeshi weather.','Every style shows real measurements in inches and a true-colour daylight photo, so you know exactly what you are getting.','Order online with Cash on Delivery anywhere in Bangladesh, or pay with bKash, Nagad or card.']
};
function cat_seoTitle(id){ if(id==='new') return 'New arrivals for men in Bangladesh'; var c = CAT(id); return (c?c.name:'Menswear')+' for men in Bangladesh'; }
/* =====================================================================
   K4. THE QUESTIONS ARE THE ONES A BUYER OF THIS CATEGORY ACTUALLY ASKS.
   ---------------------------------------------------------------------
   Every category used to show the same three: how do I choose my size,
   is COD available, how do exchanges work. True, but not about the
   garment — a man looking at polos wants to know what the piqué is like
   and how many fabrics he is choosing between.
   Each entry below is written against the real catalogue: the fabric and
   GSM lines in 01-data.js, the fits each category carries, and the size
   charts behind them. When the catalogue changes, the count of fabrics in
   the answer is counted live (cat_fabrics) rather than typed in.
   The third question stays practical — delivery or exchange — because the
   owner's shop sells on Cash on Delivery and that is the other thing
   every buyer asks.
   ===================================================================== */
/* the distinct fabric families this category actually carries, counted from
   the products themselves so the copy cannot go stale */
function cat_fabrics(id){
  var seen = [], out = [];
  cat_base(id).forEach(function(p){
    var f = String(p.fabric || '').toLowerCase(), name = null;
    if(f.indexOf('piqu') >= 0) name = 'piqué';
    else if(f.indexOf('fleece') >= 0) name = 'brushed fleece';
    else if(f.indexOf('oxford') >= 0) name = 'Oxford weave';
    else if(f.indexOf('linen') >= 0) name = 'linen-cotton';
    else if(f.indexOf('voile') >= 0) name = 'cotton voile';
    else if(f.indexOf('rib') >= 0) name = 'rib knit';
    else if(f.indexOf('knit') >= 0) name = 'textured knit';
    else if(f.indexOf('slub') >= 0) name = 'slub jersey';
    else if(f.indexOf('jersey') >= 0) name = 'jersey';
    else if(f.indexOf('twill') >= 0) name = 'cotton twill';
    else if(f.indexOf('cotton') >= 0) name = 'cotton';
    if(name && seen.indexOf(name) < 0){ seen.push(name); out.push(name); }
  });
  return out;
}
function cat_fabricLine(id){
  var f = cat_fabrics(id);
  if(!f.length) return '';
  if(f.length === 1) return 'one fabrication: ' + f[0];
  var n = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'][f.length] || f.length;
  return n + ' fabrications: ' + f.slice(0, -1).join(', ') + ' and ' + f[f.length - 1];
}
/* the two questions that are about the garment, per category */
var CAT_QA = {
  polos: function(id){ return [
    {q:'What is your polo quality like?', a:'<p>Our everyday polo is <b>100% combed cotton piqué at 220 GSM</b> — combed means the short fibres are taken out before spinning, so the surface stays smooth and does not pill after a few washes. The collar is ribbed and knitted to shape, not cut from fabric, which is why it stays flat instead of curling at the points.</p><p>Heavier pieces go up to <b>260 GSM</b>. All of them are side-vented and cut for Dhaka heat rather than for a European winter.</p>'},
    {q:'Which fabrics do your polos come in?', a:'<p>This category carries '+esc(cat_fabricLine(id))+'.</p><p><b>Piqué</b> is the classic waffle-textured polo cloth — crisp, airy, best for daily wear. <b>Textured knit</b> is softer and dressier, good with chinos. <b>Rib</b> holds its shape and reads smarter. <b>Jersey</b> is the stretchiest and the most casual. Every product page prints the exact fabric and GSM.</p>'},
    {q:'Regular fit or slim fit?', a:'<p>Regular fit is a straight body with a little room through the chest and waist — the safe choice, and what most of our customers buy. Slim fit takes about an inch and a half out of the body and the sleeve.</p><p>Both fit true to size. If you are between sizes or carry weight at the waist, take regular. The size chart on each page gives chest, length, shoulder and sleeve in inches so you can lay it over a polo you already own.</p>'}
  ]; },
  tshirts: function(id){ return [
    {q:'How heavy is the cotton?', a:'<p>Three weights, and the page tells you which one you are buying. <b>180 GSM single jersey</b> is the light everyday crew. <b>240 GSM</b> is the heavy tee — it hangs straight instead of clinging and it does not go see-through. <b>Slub jersey</b> sits in between with a slightly uneven, textured surface.</p><p>All three are 100% cotton. Nothing here is a polyester blend.</p>'},
    {q:'Will the black and navy fade?', a:'<p>Not quickly, but how you wash them decides it. Cold water, inside out, dried in the shade — that is the whole trick. Hot water and direct Dhaka sun are what turn black into grey in six months.</p><p>Expect a small amount of shrinkage in the first wash; the sizes are cut with that allowed for.</p>'},
    {q:'Regular or relaxed?', a:'<p>Regular is a normal straight tee. Relaxed is wider through the body and a little shorter in the sleeve — it is the one to pick if you wear your tees loose or layer them under a shirt.</p><p>Chest and length are printed in inches on every page, and Find my size suggests one from your height and weight.</p>'}
  ]; },
  shirts: function(id){ return [
    {q:'Which shirt fabric should I buy?', a:'<p>This category carries '+esc(cat_fabricLine(id))+'.</p><p><b>100% cotton Oxford</b> is the office shirt — a slightly basket-like weave that holds a press and survives daily wear. <b>Linen-cotton, 55/45</b>, is for the hot months: it breathes far better, and it creases, which is part of how linen is supposed to look.</p><p>Every page prints the exact composition, so you are never guessing.</p>'},
    {q:'Do they need ironing?', a:'<p>The Oxford presses easily and keeps a crease all day. The linen blend will crease as you wear it — that is the fabric, not a fault, and it is the reason it is cooler than the Oxford in April.</p><p>Wash cold and iron on medium; hang the linen straight off the line and most of it drops out on its own.</p>'},
    {q:'How do I check the fit before I order?', a:'<p>Every shirt page lists <b>chest, length, shoulder and sleeve in inches</b>. Lay a shirt you already wear flat, measure it the same way, and compare — that is more reliable than any label.</p><p>If you would rather not measure, Find my size takes your height and weight and suggests one in about ten seconds.</p>'}
  ]; },
  panjabi: function(id){ return [
    {q:'What is the fabric, and is it comfortable in the heat?', a:'<p>Our classic panjabi is <b>fine cotton voile with a self-stripe</b> — a light, open cotton weave made for exactly this. It moves air, which matters when you are in it from the Eid jamaat through a full day of visits.</p><p>The self-stripe is woven in, not printed, so it does not wash out.</p>'},
    {q:'How long should a panjabi be?', a:'<p>Classic length falls to about the knee or a touch below, and the sleeve should end at the wrist bone. Both are printed in inches on the product page along with the chest.</p><p>If you want it shorter for a casual day, take the length one size down and keep the chest at your usual size — the tailor can shorten but cannot add.</p>'},
    {q:'Will it arrive before Eid?', a:'<p>Order early. Couriers all over Bangladesh slow down in the last week before Eid and the Eid edit sells out in the popular sizes first.</p><p>'+esc(ruleText('delivery','short'))+' Cash on Delivery is available everywhere.</p>'}
  ]; },
  trousers: function(id){ return [
    {q:'What is the difference between the chino and the twill?', a:'<p>The slim chino is <b>cotton twill with 2% stretch</b> — it holds a crease, sits close through the thigh and is the one for the office. The relaxed trouser is <b>brushed cotton twill</b>, softer on the hand, wider through the leg, better for a long hot day.</p><p>Both are cotton-led; the stretch in the chino is there for sitting all day, not for a sporty look.</p>'},
    {q:'How do I pick my waist size?', a:'<p>Sizes are your waist in inches — 30, 32, 34, 36. Measure a pair of trousers you already wear across the waistband and double it, rather than measuring your body over a shirt.</p><p>Every page also prints <b>hip, thigh, inseam and leg opening</b>, so you can see the whole shape before you order, not just the waist.</p>'},
    {q:'Will they shrink or need hemming?', a:'<p>Cotton twill settles a little in the first cold wash; the inseam is cut with that allowed for. Wash cold and iron medium and the length stays where it is.</p><p>Inseam is listed per size, so you can decide on hemming before the parcel arrives.</p>'}
  ]; },
  hoodies: function(id){ return [
    {q:'How warm is a 320 GSM hoodie?', a:'<p>Warm enough for a Bangladeshi winter and not more. <b>320 GSM brushed cotton fleece (80% cotton, 20% polyester)</b> is thick, and the inside is brushed so it holds air against you. The hood is double-layered and there is a kangaroo pocket.</p><p>From December to February in Dhaka, Sylhet or Rangpur this is one layer over a tee and that is the whole outfit.</p>'},
    {q:'Does it fit over a shirt or a polo?', a:'<p>Yes — it is cut regular, with room through the chest for one layer underneath. It is not an oversized street fit.</p><p>If you plan to wear it over a collared shirt most days, take your usual size; the chest and length in inches are on the product page.</p>'},
    {q:'How should I wash it so it keeps its shape?', a:'<p>Cold water, inside out, and no tumble dryer. The brushing on the inside is what makes it warm, and a hot wash flattens it.</p><p>Dry it flat or on a wide hanger — hanging a wet heavyweight hoodie by the shoulders is what stretches the neck out.</p>'}
  ]; },
  'new': function(id){ return [
    {q:'What is new this week?', a:'<p>New arrivals land every week across polos, T-shirts, shirts, panjabi, chinos and winter hoodies. The newest styles carry a <b>NEW</b> tag on the card, and the Winter 2026 pieces carry their own.</p><p>Everything here is menswear made in Bangladesh and cut for this weather, not imported sizing.</p>'},
    {q:'Are the colours true to the photos?', a:'<p>Every product page has a daylight colour note that tells you how the shade actually reads outside — "navy that looks near-black indoors", and so on. Screens differ; the note does not.</p><p>If you are still unsure, message us on WhatsApp and we will send a photo of the real piece.</p>'},
    {q:'How do I find my size across so many styles?', a:'<p>Save it once. Find my size takes your height and weight and suggests a size, and we then show "your size in stock" on every product in the shop.</p><p>Each page still prints the full chart in inches (cm if you prefer), because the final choice is yours.</p>'}
  ]; }
};
function cat_faqs(id){
  var first = cat_base(id).filter(function(p){ return p.chart; })[0] || P('essential-pique-polo');
  var sizeQ = {q:'How do I choose my size?', a:'<p>Tap <b>Find my size</b> on any product page — enter your height and weight and we suggest a size in about 10 seconds. You can also open the <b>size chart</b> (inches, or cm if you prefer) and compare with a piece you already own.</p><a class="cat-fms" href="#/p/'+first.id+'?finder=1">'+ico('ruler',18)+'Find my size</a>'};
  var codQ  = {q:'Is Cash on Delivery available everywhere?', a:'<p>Yes — Cash on Delivery works all over Bangladesh. You can also pay with bKash, Nagad or card.</p><p>'+esc(ruleText('delivery','short'))+'</p>'};
  var exQ   = {q:'How do exchanges work?', a:'<p>'+esc(ruleText('exchange','short'))+'.</p><p>Start it from My account → Orders. We show you which sizes are in stock before you confirm.</p>'};
  var own = CAT_QA[id] ? CAT_QA[id](id) : null;
  /* a category with no copy of its own falls back to the three general ones
     rather than showing nothing — and the owner can add a CAT_QA entry */
  if(!own) return [sizeQ, codQ, exQ];
  return own.concat([exQ]);
}
/* 21. What the shopper can actually mix in this set: one tile per style and
   colour, because the card promises "styles and colours". Colours are taken
   round-robin so the first pass covers every style before repeating one. */
function cat_bundlePicks(r){
  var pool = r.mode==='category'
    ? DB.products.filter(function(p){ return r.categories.indexOf(p.cat)>=0; })
    : r.skus.map(function(s){ return P(s); }).filter(Boolean);
  var picks = [], CAP = 12, COLS = 2;                /* two colours per style */
  for(var i=0; i<pool.length && picks.length<CAP; i++){
    for(var k=0; k<COLS && picks.length<CAP; k++){
      var c = pool[i].colors[k];
      if(c) picks.push({p:pool[i], color:c});
    }
  }
  return picks;
}
function cat_pickTile(x){
  return '<a class="cat-pick" href="#/p/'+x.p.id+'" tabindex="-1">'+
    productImg(x.p, x.color, {ratio:'ratio-45', label:false})+
    '<div class="cat-pick-n">'+esc(x.p.name)+'</div><div class="cat-pick-p">'+fmt(x.p.price)+' · '+esc(COL(x.color).name)+'</div></a>';
}
/* 16/17. ONE row only — two rows read as a wall of thumbnails. The tiles are
   wide enough that two fill the phone, and the row is a continuous conveyor
   (SMOOTH), so the list of products underneath is the thing that grows down. */
var CAT_SL_ID = 'cat-bn-sl';
function cat_bundlePicksHTML(r){
  var picks = cat_bundlePicks(r); if(!picks.length) return '';
  return '<div class="cat-bn-picks"><div class="cat-bn-pickh">Pick any of these</div>'+
    '<div class="cat-sl" id="'+CAT_SL_ID+'">'+picks.map(cat_pickTile).join('')+'</div></div>';
}
/* 20. The icon sits inline with the heading instead of on a line of its own,
   so there is no empty strip to the right of it. */
function cat_banner(id){
  var r = cat_rule(id); if(!r || (id!=='polos' && id!=='tshirts')) return '';
  return '<div class="cat-banner" data-testid="cat-set-banner">'+
    '<div class="cat-bn-row"><div class="cat-bn-main">'+
      '<div class="cat-bn-top"><span class="cat-banner-ico">'+ico('layers',22)+'</span>'+
      '<div class="cat-bn-txt"><div class="eyebrow">Build your own set</div>'+
      '<div class="cat-banner-t">'+cat_nw(esc(cat_tierText(r)))+'</div></div></div>'+
      '<div class="cat-bn-sub">Mix any '+esc(cat_name(id).toLowerCase())+' — styles and colours. Set price shows before you order.</div>'+
    '</div>'+
    '<a class="btn" href="#/set/'+r.id+'">Start building'+ico('right',16)+'</a></div>'+
    cat_bundlePicksHTML(r)+
  '</div>';
}
function cat_tierText(r){ return Object.keys(r.tiers).sort(function(a,b){return a-b;}).map(function(k){ return 'Any '+k+' for '+fmt(r.tiers[k]); }).join(' · '); }
/* keep every price in escaped banner text on one line: the taka sign and its number never part */
function cat_nw(h){ return String(h).replace(/৳[\s\u2009\u202F\u00A0]*[0-9][0-9,.]*/g, function(m){ return '<span class="cat-nw">'+m+'</span>'; }); }

/* =====================================================================
   K3. THE IN-GRID BANNER SLOT — driven by data, not by markup.
   ---------------------------------------------------------------------
   One slot, after the first two rows of products. It can carry a shop-wide
   offer, an offer for this category only, or an occasion / campaign. It is
   ONE standard size on every device (see .cat-ob in r12-cat.css): the grid's
   full width, a fixed 104px on a phone and 120px from 768px up, so it never
   reflows the rows around it and never has to be re-cropped per screen.

   WITH NOTHING CONFIGURED, NOTHING RENDERS AND NO GAP IS LEFT — the array
   below is empty, cat_offerBanner() returns '' and the grid is untouched.

   ---------------------------------------------------------------------
   THE CONFIG SHAPE. This belongs in 01-data.js as DB.catBanners (that file
   belongs to another agent this round — see HANDOFF-A.md). Until it moves,
   it lives here and DB.catBanners wins if it exists, so the move is a
   cut-and-paste with no other edit.

   {
     id:      'eid-10',            // the owner's own reference, must be unique
     scope:   'all',               // 'all', or ['panjabi','shirts'] — category ids
     kind:    'offer',             // 'offer' | 'occasion' | 'campaign' — styling only
     eyebrow: 'Eid offer',         // small line above, optional
     title:   '10% off every panjabi',          // the one line that must read
     sub:     'Applied in the bag. Until the 24th.',  // optional second line
     cta:     {label:'Shop the Eid edit', href:'#/c/panjabi'},   // optional
     from:    '2026-03-01',        // optional, inclusive, YYYY-MM-DD
     to:      '2026-03-24',        // optional, inclusive
     active:  true                 // optional, defaults to true
   }

   If more than one banner matches a category, the first still-running one
   in the array wins — so the owner orders them by priority.
   ===================================================================== */
var CAT_BANNERS = [
  /* EXAMPLES — left commented so the demo shows nothing, which is the
     correct empty state. Uncomment one to see the slot.
  {id:'free-delivery', scope:'all', kind:'offer',
   eyebrow:'This week', title:'Free delivery over ' + 1500,
   sub:'Anywhere in Bangladesh, Cash on Delivery included.',
   cta:{label:'Shop new in', href:'#/c/new'}},
  {id:'eid-panjabi', scope:['panjabi'], kind:'occasion',
   eyebrow:'Eid edit', title:'Order your panjabi before the 20th',
   sub:'Couriers slow down in the last week.',
   cta:{label:'See the Eid edit', href:'#/c/panjabi'}, from:'2026-03-01', to:'2026-03-24'},
  */
];
function cat_bannerList(){ return (typeof DB !== 'undefined' && DB.catBanners) ? DB.catBanners : CAT_BANNERS; }
function cat_bannerLive(b, today){
  if(b.active === false) return false;
  if(b.from && today < b.from) return false;
  if(b.to   && today > b.to)   return false;
  return true;
}
function cat_bannerFor(id){
  var list = cat_bannerList(); if(!list || !list.length) return null;
  var d = new Date(), today = d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
  for(var i=0;i<list.length;i++){
    var b = list[i];
    if(!cat_bannerLive(b, today)) continue;
    var sc = b.scope || 'all';
    if(sc === 'all' || (sc.indexOf && sc.indexOf(id) >= 0)) return b;
  }
  return null;
}
function cat_offerBanner(id){
  var b = cat_bannerFor(id);
  if(!b) return '';                                  /* nothing configured: no slot, no gap */
  var cta = b.cta && b.cta.href
    ? '<a class="btn cat-ob-cta" href="'+esc(b.cta.href)+'">'+esc(b.cta.label || 'Shop now')+ico('right',16)+'</a>' : '';
  return '<div class="cat-ob cat-ob-'+esc(b.kind || 'offer')+'" data-testid="cat-offer-banner" data-banner="'+esc(b.id || '')+'">'+
    '<div class="cat-ob-txt">'+
      (b.eyebrow ? '<div class="eyebrow cat-ob-e">'+esc(b.eyebrow)+'</div>' : '')+
      '<div class="cat-ob-t">'+cat_nw(esc(b.title || ''))+'</div>'+
      (b.sub ? '<div class="cat-ob-s">'+cat_nw(esc(b.sub))+'</div>' : '')+
    '</div>'+cta+'</div>';
}

/* Desktop A · D-012 / D-026. Tiles that fill a short last row: the best combo
   that holds this category (auto colour-pair combos first, then fixed sets),
   "Build your own set", then the best-reviewed styles of other categories.
   All read from the data; nothing is typed here. */
function cat_dtile(href, items, eyebrow, title, line){
  return '<a class="cat-dtile" href="'+href+'">'+setImg(items, {ratio:'ratio-45'})+
    '<div class="cat-dtile-i"><div class="eyebrow">'+esc(eyebrow)+'</div><div class="cat-dtile-t">'+esc(title)+'</div><div class="small text2">'+line+'</div></div></a>';
}
function cat_fillTiles(id, need, shown){
  var out = [], seen = {};
  shown.forEach(function(p){ seen[p.id] = 1; });
  var inCat = function(p){ return p && (id==='new' ? true : p.cat===id); };
  try{
    if(typeof ca_activeRules === 'function') ca_activeRules().forEach(function(r){
      if(out.length >= need) return;
      var L = ca_generate(r).visible[0]; if(!L || !L.pieces.some(function(pc){ return inCat(pc.p); })) return;
      out.push(cat_dtile('#/combo-pair/'+L.id, L.pieces.map(function(pc){ return {product:pc.p.id, color:pc.color}; }), t('Complete the look'), L.styleName+' · '+L.n+' pcs',
        fmt(L.price)+(L.save>0?' · <b class="brandc">Save '+fmt(L.save)+'</b>':'')));
    });
  }catch(e){}
  combos().filter(function(c){ return c.active && c.items.some(function(pid){ return inCat(P(pid)); }); }).forEach(function(c){
    if(out.length >= need) return;
    var reg = c.items.reduce(function(s2, pid){ var pp = P(pid); return s2 + (pp ? pp.price : 0); }, 0);
    out.push(cat_dtile('#/combo/'+c.id, c.items.map(function(pid, i){ var pp = P(pid); return {product:pid, color:pp ? pp.colors[i % pp.colors.length] : null}; }).filter(function(x){ return P(x.product); }),
      t('Complete the look'), c.name, fmt(c.price)+(reg>c.price?' · <b class="brandc">Save '+fmt(reg-c.price)+'</b>':'')));
  });
  if(out.length < need){
    var r0 = cat_rule(id) || setRules().filter(function(r){ return r.active; })[0];
    var demo = (id!=='new' ? productsIn(id) : DB.products).filter(function(p){ return !(CAT(p.cat)||{}).hidden; }).slice(0, 3);
    if(demo.length) out.push(cat_dtile(r0 ? '#/set/'+r0.id : '#/set', demo.map(function(p){ return {product:p.id, color:p.colors[0]}; }), t('Build your own set'),
      r0 ? r0.name : t('Build your own set'), r0 ? esc(cat_tierText(r0)) : 'Mix styles and colours — the set price shows first'));
  }
  DB.products.filter(function(p){ return !seen[p.id] && !(CAT(p.cat)||{}).hidden && p.cat!==id; }).sort(function(a,b){ return b.reviews-a.reviews; }).forEach(function(p){
    if(out.length < need) out.push(productCard(p));
  });
  return out.slice(0, need);
}
/* =====================================================================
   LAYOUT-BUILDER HOOK (PR 595/596). A category page is an ordered list of
   section renderers, each called with the page context
   {id, name, base, list, few, hd, side, main, info}. Default order (header ·
   filter rail + grid · after-grid slot · SEO/FAQ) gives exactly today's page.
   CAT_SLOTS.afterGrid is the insertion point between the grid and the
   footer: push function(ctx){ return html; } into it (empty = nothing drawn).
   ===================================================================== */
var CAT_SLOTS = { afterGrid:[] };
var CAT_SECTIONS = [
  {id:'header', render:function(c){ return c.hd; }},
  {id:'grid', render:function(c){ return '<div class="cat-layout'+(c.few?' cat-few':'')+'">'+c.side+c.main+'</div>'; }},
  {id:'after-grid', render:function(c){ return CAT_SLOTS.afterGrid.map(function(f){ try{ return f(c) || ''; }catch(e){ console.error(e); return ''; } }).join(''); }},
  {id:'info', render:function(c){ return c.info; }}
];
/* =====================================================================
   PR 598 · THE CATEGORY DATA SOURCE (Site builder › Categories, Shilpi).
   DB.categories / DB.subcats stay the one list every page reads (menus,
   footer, tiles, filters, search). The owner's published category data is
   laid over the seed list IN PLACE before each page is drawn:
     name / bn (rename) · order · garment (icon + drawing) · blurb (intro text)
     · seoTitle / seoMeta · menu:false (left out of every menu) · hidden (only
     under "More" on the desktop row) · unlisted (NOT LISTED: out of menus,
     footer, tiles and search, but its page and every product link stay live,
     PR 527) · img {product, colour} for its tile · new categories.
   Nothing is ever deleted: a category is hidden or not listed, never removed;
   product links (#/p/<id>) and category links (#/c/<id>) never change.
   With nothing published the list is the seed list, untouched.
   ===================================================================== */
var CAT_SEED = JSON.parse(JSON.stringify(DB.categories || []));
var CAT_FIELDS = ['name','bn','garment','blurb','seoTitle','seoMeta','menu','hidden','unlisted','img','group','chart'];
var CAT_SIG = null;
/* bookkeeping on a sub-category object, hidden from JSON (the catalogue saves its sub-categories) */
function cat_hid(o, k, v){ try{ Object.defineProperty(o, k, {value:v, writable:true, configurable:true, enumerable:false}); }catch(e){ o[k] = v; } }
function cat_srcApply(){
  var d = (typeof sbArea==='function') ? sbArea('cats') : null;
  var sig = d ? JSON.stringify(d) : '';
  if(sig === CAT_SIG && (DB.subcats||[]).every(function(x){ return x._sbOk === sig; })) return;
  CAT_SIG = sig;
  var byId = {}; (DB.categories||[]).forEach(function(c){ byId[c.id] = c; });
  var seedIds = {}; CAT_SEED.forEach(function(c0){ seedIds[c0.id] = 1;
    var c = byId[c0.id] || (byId[c0.id] = {});
    CAT_FIELDS.forEach(function(k){ if(c0.hasOwnProperty(k)) c[k] = JSON.parse(JSON.stringify(c0[k])); else delete c[k]; });
    c.id = c0.id; });
  var order = [];
  ((d && d.list) || []).forEach(function(o){
    if(!o || !o.id) return;
    var c = byId[o.id];
    if(!c){ if(!o.isNew) return; c = byId[o.id] = {id:o.id, name:o.name || o.id, garment:'tee', group:'top', chart:null, blurb:''}; }
    CAT_FIELDS.forEach(function(k){ if(o[k] !== undefined && o[k] !== '' && o[k] !== null) c[k] = JSON.parse(JSON.stringify(o[k])); });
    if(o.menu === false) c.menu = false;
    if(o.unlisted){ c.unlisted = true; c.hidden = true; }      /* every list that skips hidden ones skips it too */
    order.push(c);
  });
  CAT_SEED.forEach(function(c0){ if(order.indexOf(byId[c0.id]) < 0) order.push(byId[c0.id]); });
  DB.categories.length = 0; order.forEach(function(c){ DB.categories.push(c); });
  /* sub-categories: rename, order, not listed (kept for links), new ones */
  var subs = (d && d.subs) || {};
  var list = DB.subcats || (DB.subcats = []);
  for(var i = list.length - 1; i >= 0; i--){ if(list[i]._sbNew && !(d && (d.subsNew||[]).some(function(n){ return n.id===list[i].id; }))) list.splice(i, 1); }
  ((d && d.subsNew) || []).forEach(function(n){ if(n && n.id && !list.some(function(x){ return x.id===n.id; })) { var nx = {id:n.id, name:n.name || n.id, parent:n.parent}; cat_hid(nx, '_sbNew', true); list.push(nx); } });
  list.forEach(function(x){
    if(x._sb0 === undefined) cat_hid(x, '_sb0', {name:x.name});
    x.name = x._sb0.name; delete x.unlisted; cat_hid(x, '_sbOrd', undefined);
    var o = subs[x.id]; if(o){ if(o.name) x.name = o.name; if(o.unlisted) cat_hid(x, 'unlisted', true); if(typeof o.order === 'number') x._sbOrd = o.order; }
    cat_hid(x, '_sbOk', sig);
  });
  if(list.some(function(x){ return x._sbOrd !== undefined; })){
    var pos = {}; list.forEach(function(x, k){ pos[x.id] = k; });
    list.sort(function(a, b){ var oa = a._sbOrd !== undefined ? a._sbOrd : pos[a.id], ob = b._sbOrd !== undefined ? b._sbOrd : pos[b.id]; return oa - ob || pos[a.id] - pos[b.id]; });
  }
}
/* before every page is drawn (the router's render) */
(function(){
  try{ var r0 = render; if(r0 && !r0._cat){ render = function(){ try{ cat_srcApply(); }catch(e){ console.error(e); } return r0.apply(this, arguments); }; render._cat = true; } }catch(e){}
})();
/* the "not listed" line on a category page (PR 527: the page stays live) */
function cat_unlistedNote(id){
  var c = id!=='new' && CAT(id); if(!c || !c.unlisted) return '';
  return '<div class="sb-unl" role="note" data-testid="cat-unlisted">'+ico('info',16)+'<span>'+esc(t('This category is not listed in the shop menus right now. Its styles can still be ordered from this page.'))+'</span></div>';
}
PAGES.category = {
  layout:'store',
  title:function(params){ var c = params[0]!=='new' && CAT(params[0]); if(c && c.seoTitle) return c.seoTitle; return cat_name(params[0]) || 'Shop'; },
  render:function(params){
    var id = params[0];
    CAT_CUR = id;                                   /* K1. the bands are per category */
    if(id!=='new' && !CAT(id)) return '<div class="container empty"><div class="h1">Category not found</div><p class="muted mt12">This category does not exist in the demo.</p><a class="btn btn-primary mt16" href="#/c/new">See all products</a></div>';
    var base = cat_base(id), u = cat_ui(id), name = cat_name(id), n = cat_activeCount(u);
    /* Desktop A · D-001: a sub-category link from the desktop menu
       (#/c/polos?sub=polos/ralph-lauren) narrows the page to that branch */
    var subQ = (arguments[1] && arguments[1].sub) || '', subC = subQ && (DB.subcats||[]).filter(function(x){ return x.id===subQ; })[0];
    if(subC && typeof ca_inPath==='function'){ base = base.filter(function(p){ return ca_inPath(p, subQ); }); name = name+' · '+subC.name; }
    var list = cat_apply(base, u, id);
    /* a band that no longer exists (the catalogue moved, or the owner set an
       override) must not keep filtering the grid invisibly */
    var liveBands = cat_priceBands(id).map(function(b){ return b[0]; });
    u.prices = u.prices.filter(function(v){ return liveBands.indexOf(v) >= 0; });
    var blurb = id==='new' ? 'All our latest menswear, from everyday polos to winter hoodies.' : CAT(id).blurb;
    var showMine = cat_hasMySize(base);

    /* 16. The visible breadcrumb is a Google feature, not decoration, so it
       stays on — but it now sits behind an owner switch (SHOW returns true
       until category:{breadcrumb:false} is added to SHOWN). */
    var crumbs = SHOW('category','breadcrumb')
      ? (subC ? '<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">/</span><a href="#/c/'+esc(id)+'">'+esc(cat_name(id))+'</a><span aria-hidden="true">/</span><span aria-current="page">'+esc(subC.name)+'</span></nav>'
        : '<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">/</span><span aria-current="page">'+esc(name)+'</span></nav>')
      : '';
    var hd = '<div class="cat-hd">'+crumbs+
      '<h1 class="h1">'+esc(name)+'</h1><p class="text2">'+plural(base.length,'style')+' · '+esc(blurb)+'</p>'+cat_unlistedNote(id)+'</div>';

    /* a menu left open on Polos must not reappear when you land on T-shirts */
    if(CAT_SORT_OPEN && CAT_SORT_OPEN.cat !== id) CAT_SORT_OPEN = null;

    // active chips (desktop)
    var actives = [];
    u.sizes.forEach(function(s){ actives.push(['sizes', s, 'Size '+s]); });
    u.colors.forEach(function(c){ actives.push(['colors', c, COL(c).name]); });
    u.fits.forEach(function(f){ actives.push(['fits', f, f]); });
    u.prices.forEach(function(p){ actives.push(['prices', p, cat_priceLabel(p, id)]); });
    (u.xc || []).forEach(function(cid){ actives.push(['xc', cid, cat_xcLabel(id, cid)]); });
    if(u.setOnly) actives.push(['setOnly', null, 'Set price available']);
    if(u.mine) actives.push(['mine', null, 'My size only']);
    if(u.sale) actives.push(['sale', null, 'On sale']);
    var activeRow = actives.length ? '<div class="cat-actives cat-dt">'+actives.map(function(a){
        return '<button type="button" class="cat-x" data-act="cat-tog" data-cat="'+esc(id)+'" data-group="'+a[0]+'"'+(a[1]!=null?' data-v="'+esc(a[1])+'"':'')+' aria-label="Remove filter '+esc(a[2])+'">'+esc(a[2])+ico('close',13)+'</button>'; }).join('')+
      '<button type="button" class="link" data-act="cat-clear" data-cat="'+esc(id)+'">Clear all</button></div>' : '';

    // phone tools
    var chip = function(group, v, label){ var on = v==null ? u[group] : u[group].indexOf(v)>=0;
      return '<button type="button" class="chip'+(on?' on':'')+'" data-act="cat-tog" aria-pressed="'+on+'" data-cat="'+esc(id)+'" data-group="'+group+'"'+(v!=null?' data-v="'+esc(v)+'"':'')+' data-fk="c-'+group+'-'+esc(v==null?'':v)+'">'+(on?ico('check',14):'')+esc(label)+'</button>'; };
    var rmChip = function(group, v, label){ return '<button type="button" class="chip on" data-act="cat-tog" data-cat="'+esc(id)+'" data-group="'+group+'" data-v="'+esc(v)+'" aria-label="Remove filter '+esc(label)+'">'+esc(label)+ico('close',13)+'</button>'; };
    /* 14.3. The chips the owner ticked (cat_chipList, from CAT_TOOLBAR). A chip
       that would match every style here or none of them says nothing, so it
       is left out — unless the shopper has it on, then it stays to be undone. */
    var chipDefs = cat_chipList(id, base);
    var isOn = function(c){ return c.group==='mine' || c.group==='setOnly' || c.group==='sale' ? !!u[c.group] : (u[c.group]||[]).indexOf(c.v) >= 0; };
    var shown = {};
    var chips = chipDefs.filter(function(c){
      if(isOn(c)) return true;
      if(!c.test) return true;
      var n2 = base.filter(c.test).length;
      return n2 > 0 && n2 < base.length;
    }).map(function(c){ shown[c.group+':'+(c.v==null?'':c.v)] = 1; return chip(c.group, c.v==null?null:c.v, c.label); }).join('');
    /* sizes and colours picked in the Filter sheet still show here, so they
       can be removed with one tap — unless a ticked chip already shows them */
    chips = u.sizes.filter(function(sz){ return !shown['sizes:'+sz]; }).map(function(sz){ return rmChip('sizes', sz, 'Size '+sz); }).join('') +
      u.colors.filter(function(cl){ return !shown['colors:'+cl]; }).map(function(cl){ return rmChip('colors', cl, COL(cl).name); }).join('') + chips;
    /* the badge used to count every sale item in the category, so it could
       promise 3 while the live filters left only 1. Count what the shopper
       would actually get. */
    var saleBase = cat_apply(base, {sizes:u.sizes, colors:u.colors, fits:u.fits, prices:u.prices, xc:u.xc, setOnly:u.setOnly, mine:u.mine, sale:false, sort:'rec'}, id);
    var saleN = cat_saleCount(saleBase);
    /* 14.4. The top row is drawn from the same config: each button can be
       switched off, renamed and reordered. The row is a flex row of whatever
       is left (r12-cat.css R14), and with nothing left there is no row and
       no gap.
       The bar is a direct child of .cat-main so it can stay sticky. */
    var topHTML = {
      filter:function(it){ return '<button type="button" class="btn btn-ghost cat-fbtn" data-act="cat-filter" data-cat="'+esc(id)+'" data-testid="cat-filter-btn">'+ico('settings',19)+'<span class="cat-tl">'+esc(it.label || 'Filter')+'</span>'+(n?'<span class="cat-count">'+n+'</span>':'')+'</button>'; },
      sort:function(){ return cat_sortCtl(id, 'p'); },
      sale:function(it){ return '<button type="button" class="btn btn-ghost cat-salebtn'+(u.sale?' on':'')+'" data-act="cat-tog" data-cat="'+esc(id)+'" data-group="sale" aria-pressed="'+u.sale+'" data-testid="cat-sale-btn"'+(saleN||u.sale?'':' disabled')+'>'+ico('tag',17)+'<span class="cat-tl">'+esc(it.label || 'On sale')+'</span>'+(saleN?'<span class="cat-count">'+saleN+'</span>':'')+'</button>'; }
    };
    var topItems = cat_topItems(id).filter(function(it){ return topHTML[it.id] && (it.id !== 'sort' || cat_sortOpts(id).length > 1); });
    var ptools = (topItems.length ? '<div class="cat-ptools cat-ph" data-n="'+topItems.length+'">'+
        topItems.map(function(it){ return topHTML[it.id](it); }).join('')+'</div>' : '')+
      (chips ? '<div class="cat-chiprow cat-ph" role="group" aria-label="Quick filters">'+chips+'</div>' : '');

    // grid
    var cards = list.map(function(p){ var col = u.colors.length ? (p.colors.filter(function(c){ return u.colors.indexOf(c)>=0; })[0]) : null; return productCard(p, col?{color:col}:{}); });
    /* K3. the configured offer / occasion banner goes in after the first two
       rows (4 cards on a phone, 4 on a tablet, 4 on a desktop); the set
       banner then moves down so the two never sit on top of each other.
       Both return '' when there is nothing to show, and an empty string
       spliced into the grid would still be a grid cell — so neither is
       spliced at all unless it has content. */
    var offer = cat_offerBanner(id);
    if(offer && cards.length) cards.splice(Math.min(4, cards.length), 0, offer);
    var banner = cat_banner(id);
    if(banner && cards.length) cards.splice(Math.min(offer ? 9 : 4, cards.length), 0, banner);
    /* Desktop A · D-012 / D-026 (desktop only; the phone grid is untouched):
       a category with 4 styles or fewer drops the filter rail (class cat-few)
       and fills its row with "Complete the look" tiles; a longer list whose
       last row is short gets the same tiles in the empty cells. */
    var few = deskOn() && base.length <= 4 && !n;
    if(deskOn() && list.length && !n){ var cols = 4, gap = (cols - list.length % cols) % cols; if(gap) cards = cards.concat(cat_fillTiles(id, gap, list)); }
    var grid = list.length ? '<div class="grid g4" data-testid="cat-grid">'+cards.join('')+'</div>'
      : '<div class="grid g4"><div class="cat-empty"><div class="h2">No styles match these filters</div><p class="muted small mt8">Try removing a filter — or message us and we will check stock for you.</p><div class="row wrap mt16" style="justify-content:center"><button type="button" class="btn btn-primary" data-act="cat-clear" data-cat="'+esc(id)+'">Clear filters</button>'+waButton('Ask on WhatsApp', 'Hi EXTAS, I am looking for '+name)+'</div></div></div>';

    var pct = base.length ? Math.round(list.length/base.length*100) : 0;
    var more = '<div class="cat-more"><div class="small text2">Showing '+list.length+' of '+base.length+'</div><div class="bar-progress"><div style="width:'+pct+'%"></div></div>'+
      (list.length<base.length?'<button type="button" class="link mt8" data-act="cat-clear" data-cat="'+esc(id)+'">Show all '+base.length+'</button>':'')+'</div>';

    var main = '<div class="cat-main">'+
      '<div class="cat-bar cat-dt"><div class="row between" style="width:100%"><span class="small text2"><b style="color:var(--ink)">'+plural(list.length,'product')+'</b>'+(n?' · '+plural(n,'filter')+' on':'')+'</span><span class="row" style="gap:10px"><span class="small muted">Sort by</span>'+cat_sortCtl(id, 'd')+'</span></div></div>'+
      activeRow + ptools + grid + more + '</div>';

    var side = '<aside class="cat-side cat-dt" aria-label="Filters"><div class="cat-side-hd"><span class="h3">Filters</span>'+(n?'<button type="button" class="link" data-act="cat-clear" data-cat="'+esc(id)+'">Clear all ('+n+')</button>':'')+'</div>'+cat_filtersHTML(id, 'd')+'</aside>';

    // SEO + FAQ
    var seo = CAT_SEO[id] || CAT_SEO['new'];
    var info = '<section class="cat-info"><div><h2 class="h2">'+esc(cat_seoTitle(id))+'</h2>'+
      '<div class="cat-seo-txt'+(u.seo?'':' clamp')+'" id="cat-seo-txt"><p>'+seo.map(esc).join(' ')+'</p></div>'+
      '<button type="button" class="link" data-act="cat-seo" data-cat="'+esc(id)+'" aria-expanded="'+u.seo+'" aria-controls="cat-seo-txt">'+(u.seo?'Read less':'Read more')+'</button></div>'+
      '<div><h2 class="h2">Questions</h2><div class="cat-faq">'+cat_faqs(id).map(function(f, i){ var open = u.faq===i;
        return '<div class="cat-faq-item"><button type="button" class="cat-faq-q" data-act="cat-faq" data-cat="'+esc(id)+'" data-i="'+i+'" aria-expanded="'+open+'" aria-controls="cat-faq-'+i+'">'+esc(f.q)+ico(open?'minus':'plus',18)+'</button>'+
          (open?'<div class="cat-faq-a" id="cat-faq-'+i+'">'+f.a+'</div>':'')+'</div>'; }).join('')+'</div></div></section>';

    var ctx = {id:id, name:name, base:base, list:list, few:few, hd:hd, side:(few?'':side), main:main, info:info};
    return (typeof lbGutters==='function' ? lbGutters() : '') + '<div class="container">'+CAT_SECTIONS.map(function(sec){ try{ return sec.render(ctx) || ''; }catch(e){ console.error('category section '+sec.id, e); return ''; } }).join('')+'</div>';
  },
  after:function(){
    /* 16. one continuous conveyor instead of a card-by-card jump */
    SMOOTH.stopAll();
    SMOOTH.start(CAT_SL_ID, {dir:-1, speed:22});
    cat_chiprowFade();
  }
};
/* K2. The chip row reserves 26px for the scroll fade (r12-cat.css). A row
   that cannot scroll has nothing to hint at, so it drops both the fade and
   the reserved strip and uses the full width. */
function cat_chiprowFade(){
  var r = document.querySelector('.cat-chiprow.cat-ph'); if(!r) return;
  r.classList.remove('is-scrollable');
  /* measure with the reserve off, then put it back if it is really needed */
  var needs = r.scrollWidth > r.clientWidth + 1;
  if(needs) r.classList.add('is-scrollable');
}
window.addEventListener('resize', function(){ if(CUR && CUR.page==='category') cat_chiprowFade(); });

/* ---------- 21. bundle row: one continuous glide ----------
   The row used to step one tile at a time on a timer, which the owner read as
   a jump. SMOOTH (02-core.js) clones the tiles once and moves the scroll a
   fraction of a pixel per frame, so it drifts; it pauses under a finger and
   does nothing at all when the phone asks for reduced motion. Swiping by hand
   still works because it is an ordinary horizontal scroller. */

/* ---------- category actions ---------- */
var CAT_FOCUS = null;
function cat_refresh(el){
  CAT_FOCUS = el ? (typeof el==='string' ? el : el.getAttribute('data-fk')) : null;   /* TA-2: a data-fk string works too */
  rerender();
  if(MODAL){ var m = document.querySelector('.modal'), y = m ? m.scrollTop : 0; refreshModal(); var m2 = document.querySelector('.modal'); if(m2) m2.scrollTop = y; }
  if(CAT_FOCUS){ var f = document.querySelector((MODAL?'.modal ':'')+'[data-fk="'+CAT_FOCUS.replace(/"/g,'')+'"]'); if(f && f.offsetParent) try{ f.focus({preventScroll:true}); }catch(e){} }
}
function cat_toggle(id, group, v){
  var u = cat_ui(id);
  CAT_SORT_OPEN = null;                       /* any other tap closes the sort menu */
  if(group==='setOnly' || group==='mine' || group==='sale') u[group] = !u[group];
  else if(u[group]){ var i = u[group].indexOf(v); if(i>=0) u[group].splice(i,1); else u[group].push(v); }
}
ACT['cat-tog'] = function(el){ cat_toggle(el.getAttribute('data-cat'), el.getAttribute('data-group'), el.getAttribute('data-v')); cat_refresh(el); };
CHANGE['cat-chk'] = function(el){ cat_toggle(el.getAttribute('data-cat'), el.getAttribute('data-group'), el.getAttribute('data-v')); cat_refresh(el); };
/* 14. the sort menu: opens under its own button, closes on pick, on the veil,
   on Escape, and on any other filter tap. */
ACT['cat-sortopen'] = function(el){
  var id = el.getAttribute('data-cat'), loc = el.getAttribute('data-loc');
  CAT_SORT_OPEN = cat_sortIsOpen(id, loc) ? null : {cat:id, loc:loc};
  cat_refresh(el);
};
/* TA-2 (T10): closing the menu (veil, pick, Esc) puts focus back on its own Sort button,
   like every popup — it used to drop to <body> */
function cat_sortBack(){ var o = CAT_SORT_OPEN; CAT_SORT_OPEN = null; cat_refresh(o && o.loc ? o.loc+'-sort' : null); }
ACT['cat-sortclose'] = function(){ cat_sortBack(); };
ACT['cat-sortpick'] = function(el){
  var id = el.getAttribute('data-cat');
  cat_ui(id).sort = el.getAttribute('data-v');
  cat_sortBack();
};
document.addEventListener('keydown', function(ev){
  if(ev.key==='Escape' && CAT_SORT_OPEN && !document.querySelector('.modal-back')){ cat_sortBack(); }
});
ACT['cat-clear'] = function(el){ var u = cat_ui(el.getAttribute('data-cat')); u.sizes = []; u.colors = []; u.fits = []; u.prices = []; u.xc = []; u.setOnly = false; u.mine = false; u.sale = false; CAT_SORT_OPEN = null; cat_refresh(null); };
ACT['cat-filter'] = function(el){ var id = el.getAttribute('data-cat'); CAT_SORT_OPEN = null; openModal(cat_modalHTML(id), {title:'Filter', rebuild:function(){ return cat_modalHTML(id); }}); };
ACT['cat-morecol'] = function(el){ var u = cat_ui(el.getAttribute('data-cat')); u.allColors = !u.allColors; cat_refresh(el); };
ACT['cat-seo'] = function(el){ var u = cat_ui(el.getAttribute('data-cat')); u.seo = !u.seo; rerender(); };
ACT['cat-faq'] = function(el){ var u = cat_ui(el.getAttribute('data-cat')), i = +el.getAttribute('data-i'); u.faq = u.faq===i ? -1 : i; rerender(); };

/* ---------- search page ---------- */
function srch_norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9ঀ-৿\s]/g, ''); }
function srch_hay(p){ var c = CAT(p.cat) || {}; return srch_norm([p.name, c.name, c.bn, c.garment, c.id].concat(p.colors.map(function(x){ return COL(x).name; })).join(' ')); }
/* =====================================================================
   Desktop A · D-015. SEARCH UNDERSTANDS HOW PEOPLE TYPE (phone and desktop).
   "polo shirt", "pollo shrt" and "গেঞ্জি" found nothing. Same engine for every
   device (results must never differ by device), used by the results page and
   by the live suggestions (07-help-search.js) alike. Order of the steps:
     0. phrases are read as one word ("t shirt" → tshirt, "polo shirt" → polo);
     1. every word inside the product's words (as before);
     2. every word within one or two slips of a product word (as before);
     3. each word may also be one of its synonyms or its singular
        (গেঞ্জি → t-shirt / tee, chinos → chino, pant → trouser …);
     4. general words that only describe ("shirt", "গেঞ্জি", "for men" …,
        or a slip of one, like "shrt") are dropped and step 3 runs again.
   The three lists are the owner's (a dashboard setting later), not code.
   ===================================================================== */
var SRCH_PHRASES = [['t shirt','tshirt'],['tee shirt','tshirt'],['টি শার্ট','টিশার্ট'],['polo shirt','polo'],['polo tshirt','polo'],['পোলো শার্ট','পোলো'],['পোলো গেঞ্জি','পোলো'],['track suit','tracksuit'],['sweat shirt','sweatshirt']];
var SRCH_SYNONYMS = {
  'গেঞ্জি':['tshirt','tee'], 'গেঞ্জী':['tshirt','tee'], 'genji':['tshirt','tee'], 'ganji':['tshirt','tee'], 'gengi':['tshirt','tee'], 'genje':['tshirt','tee'],
  'tee':['tshirt'], 'tees':['tshirt'], 'tshirt':['tee'], 'টিশার্ট':['tshirt'],
  'পোলো':['polo'], 'পাঞ্জাবি':['panjabi'], 'পাঞ্জাবী':['panjabi'], 'punjabi':['panjabi'], 'kurta':['panjabi'],
  'pant':['trouser','chino','jeans','jogger'], 'pants':['trouser','chino','jeans','jogger'], 'প্যান্ট':['trouser','chino','jeans','jogger'], 'trousers':['trouser'],
  'jeans':['jeans'], 'জিন্স':['jeans'], 'denim':['jeans'], 'hoody':['hoodie'], 'হুডি':['hoodie'], 'শার্ট':['shirt'],
  'jacket':['jacket','puffer'], 'জ্যাকেট':['jacket','puffer'], 'sweater':['sweater','knit'], 'সোয়েটার':['sweater'], 'jogger':['jogger'], 'জগার':['jogger'],
  'sock':['socks'], 'মোজা':['socks'], 'belt':['belt'], 'বেল্ট':['belt']
};
var SRCH_GENERIC = ['shirt','shirts','শার্ট','গেঞ্জি','গেঞ্জী','genji','ganji','item','items','dress','cloth','clothes','clothing','wear','for','men','mens','man','boys','boy','the','a','an','and','with','buy','price','dam','new','কত','দাম','ছেলেদের','জামা','কাপড়'];
function srch_phrases(n){
  var s = ' '+n+' ';
  SRCH_PHRASES.forEach(function(ph){ var a = ' '+srch_norm(ph[0])+' '; while(s.indexOf(a)>=0) s = s.replace(a, ' '+srch_norm(ph[1])+' '); });
  return s.trim();
}
/* one word against one product: inside its words, or one or two slips from one (step 2's rule) */
function srch_tokHit(tk, hay, words, dist){
  if(hay.indexOf(tk)>=0) return true;
  if(!dist) return false;
  var cap = tk.length >= 7 ? 2 : (tk.length >= 4 ? 1 : 0);
  if(!cap) return false;
  return words.some(function(w){ return w.indexOf(tk) === 0 || dist(tk, w, cap) <= cap || (w.length > tk.length && dist(tk, w.slice(0, tk.length), cap) <= cap - (cap > 1 ? 1 : 0) && tk.length >= 5); });
}
function srch_alts(tk){
  var out = [tk].concat(SRCH_SYNONYMS[tk] || []);
  if(tk.length >= 4 && /es$/.test(tk)) out.push(tk.slice(0, -2));
  if(tk.length >= 4 && /s$/.test(tk)) out.push(tk.slice(0, -1));
  return out;
}
function srch_isGeneric(tk, dist){
  if(SRCH_GENERIC.indexOf(tk) >= 0) return true;
  if(!dist || tk.length < 4) return false;
  return SRCH_GENERIC.some(function(g){ return g.length >= 4 && dist(tk, g, 1) <= 1; });
}
function srch_byAlts(toks, dist){
  return DB.products.filter(function(p){
    var h = srch_hay(p), words = h.split(/\s+/).filter(Boolean);
    /* the word itself may carry a slip; a synonym or a singular must match as written (tshirt is not a slip of shirt) */
    return toks.every(function(tk){ return srch_alts(tk).some(function(a, i){ return srch_tokHit(a, h, words, i ? null : dist); }); });
  });
}
function srch_run(q){
  var r = srch_run0(srch_phrases(srch_norm(q)));
  if(r.length) return r;
  var toks = srch_phrases(srch_norm(q)).split(/\s+/).filter(Boolean); if(!toks.length) return [];
  var dist = typeof hs_dist === 'function' ? hs_dist : null;
  r = srch_byAlts(toks, dist);                                   /* 3. synonyms and singulars */
  if(r.length) return r;
  var keep = toks.filter(function(tk){ return !srch_isGeneric(tk, dist); });
  if(!keep.length || keep.length === toks.length) return [];
  return srch_run0(keep.join(' ')).length ? srch_run0(keep.join(' ')) : srch_byAlts(keep, dist);   /* 4. without the general words */
}
function srch_run0(q){
  var toks = srch_norm(q).split(/\s+/).filter(Boolean); if(!toks.length) return [];
  var exact = DB.products.filter(function(p){ var h = srch_hay(p); return toks.every(function(tk){ return h.indexOf(tk)>=0; }); });
  if(exact.length) return exact;
  /* R15 wave 1 (bug 8): a typo still finds the product — "pollo" → polo,
     "panjbi" → panjabi, "hoddie" → hoodie. Each word may be one slip away
     (two for words of 7+ letters) from a word in the product's name,
     category or colours. Uses the help search's own edit distance. */
  var dist = typeof hs_dist === 'function' ? hs_dist : null; if(!dist) return [];
  return DB.products.filter(function(p){
    var words = srch_hay(p).split(/\s+/).filter(Boolean);
    return toks.every(function(tk){
      var cap = tk.length >= 7 ? 2 : (tk.length >= 4 ? 1 : 0);
      return words.some(function(w){ return w.indexOf(tk) === 0 || (cap && dist(tk, w, cap) <= cap) || (cap && w.length > tk.length && dist(tk, w.slice(0, tk.length), cap) <= cap - (cap > 1 ? 1 : 0) && tk.length >= 5); });
    });
  });
}
var SRCH_BASE = [];
PAGES.search = {
  layout:'store',
  title:function(params, query){ return query.q ? 'Search: '+query.q : 'Search'; },
  render:function(params, query){
    var q = (query.q||'').trim(), res = srch_run(q), toks = srch_norm(q).split(/\s+/).filter(Boolean);
    /* Desktop A · D-016: on a desktop the results get the category's filter
       rail and sort (the same cat_* helpers, pseudo-category 'search'). The
       filters reset when the words change. The phone page is unchanged. */
    var dsk = deskOn() && q && res.length > 1, du = null, all = res;
    if(dsk){
      SRCH_BASE = res; CAT_CUR = 'search'; du = cat_ui('search');
      if(du.q !== q){ du.q = q; du.sizes = []; du.colors = []; du.fits = []; du.prices = []; du.xc = []; du.setOnly = false; du.mine = false; du.sale = false; du.sort = 'rec'; }
      res = cat_apply(res, du, 'search');
    }
    var sugg = ['polo','t-shirt','panjabi','hoodie','chino','oxford'];
    var chips = '<div class="row wrap" style="gap:8px;justify-content:center">'+sugg.map(function(s){ return '<a class="chip" href="#/search?q='+encodeURIComponent(s)+'">'+ico('search',14)+esc(s)+'</a>'; }).join('')+'</div>';
    var form = '<form class="srch-form" data-submit="search" role="search"><label class="sr" for="srch-q">Search products</label><input id="srch-q" name="q" class="input" value="'+esc(q)+'" placeholder="Try: polo, panjabi, hoodie" autocomplete="off"><button class="btn btn-primary" aria-label="Search">'+ico('search',18)+'<span class="hide-m">Search</span></button></form>';
    var hd = '<div class="cat-hd"><nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">/</span><span aria-current="page">Search</span></nav>'+
      '<h1 class="h1">'+(q ? 'Results for “'+esc(q)+'”' : 'Search EXTAS')+'</h1>'+
      (q ? '<p class="text2">'+plural(all.length,'product')+' found</p>' : '')+form+'</div>';
    var body;
    if(dsk){
      var nOn = cat_activeCount(du);
      var gridD = res.length ? '<div class="grid g4 mt24" data-testid="search-grid">'+res.map(function(p){
          var col = p.colors.filter(function(c){ var n = srch_norm(COL(c).name); return toks.some(function(tk){ return n.indexOf(tk)>=0; }); })[0];
          return productCard(p, col?{color:col}:{}); }).join('')+'</div>'
        : '<div class="cat-empty mt24"><div class="h2">No results match these filters</div><p class="muted small mt8">Try removing a filter.</p><button type="button" class="btn btn-primary mt16" data-act="cat-clear" data-cat="search">Clear filters</button></div>';
      body = '<div class="cat-layout srch-layout"><aside class="cat-side cat-dt" aria-label="Filters"><div class="cat-side-hd"><span class="h3">Filters</span>'+(nOn?'<button type="button" class="link" data-act="cat-clear" data-cat="search">Clear all ('+nOn+')</button>':'')+'</div>'+cat_filtersHTML('search', 'd')+'</aside>'+
        '<div class="cat-main"><div class="cat-bar cat-dt"><div class="row between" style="width:100%"><span class="small text2"><b style="color:var(--ink)">'+plural(res.length,'product')+'</b>'+(nOn?' of '+all.length+' · '+plural(nOn,'filter')+' on':'')+'</span><span class="row" style="gap:10px"><span class="small muted">Sort by</span>'+cat_sortCtl('search', 'd')+'</span></div></div>'+gridD+'</div></div>';
    } else if(q && res.length){
      body = '<div class="grid g4 mt24" data-testid="search-grid">'+res.map(function(p){
        var col = p.colors.filter(function(c){ var n = srch_norm(COL(c).name); return toks.some(function(tk){ return n.indexOf(tk)>=0; }); })[0];
        return productCard(p, col?{color:col}:{}); }).join('')+'</div>';
    } else {
      var popular = DB.products.filter(function(p){ return p.cat!=='extras'; }).slice().sort(function(a,b){ return b.reviews-a.reviews; }).slice(0,4);
      var cats = DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){ return '<a class="chip" href="#/c/'+c.id+'">'+esc(t(c.name))+'</a>'; }).join('');
      body = '<div class="srch-empty mt24" data-testid="search-empty"><span class="srch-empty-ico">'+ico('search',26)+'</span>'+
        (q ? '<div class="h2 mt16">No results for “'+esc(q)+'”</div><p class="text2 small mt8" style="margin-bottom:18px">Check the spelling, or try one of these:</p>'
           : '<div class="h2 mt16">What are you looking for?</div><p class="text2 small mt8" style="margin-bottom:18px">Popular searches:</p>')+chips+
        '<div class="small muted mt24" style="margin-bottom:10px">Or browse a category</div><div class="row wrap" style="gap:8px;justify-content:center">'+cats+'</div>'+
        '<div class="mt24">'+waButton('Can’t find it? Ask us on WhatsApp', 'Hi EXTAS, I am looking for '+(q||'something'))+'</div></div>'+
        '<section class="section"><div class="sec-hd"><h2 class="h2">Popular right now</h2><a class="hm-more" href="#/c/new">View all'+ico('right',14)+'</a></div><div class="grid g4">'+popular.map(function(p){ return productCard(p); }).join('')+'</div></section>';
    }
    return '<div class="container">'+hd+body+'</div>';
  }
};

/* AUTO-FIT (03-layout.js): the top row scales as ONE box, so Filter, the sort
   control and On sale always keep the same type size. If even the floor is
   too big — a long label the owner typed, a 320px phone — the row collapses
   its two leading icons (.fit-x in r12-cat.css) and fits again. */
fitRule('.cat-ptools.cat-ph', {min:10.5, collapse:true, box:true});
/* product cards are drawn by productCard() in 02-core.js; their two tight
   spots fit themselves on every page that shows cards */
fitRule('.pcard .pinfo>.row.between', {min:10, collapse:true});
fitRule('.pcard .badge-img', {min:8.5, collapse:true});
