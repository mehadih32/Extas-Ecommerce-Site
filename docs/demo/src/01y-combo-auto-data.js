/* ================= EXTAS demo — AUTO COLOUR-PAIR COMBOS: demo data (PR 571) =================
   The owner's model (round 15, notes 10–11): he uploads ONE product as usual
   (e.g. "Ralph Lauren Solid Polo", 6 colours) under Polo → Ralph Lauren →
   Solid Polo. In the Combo section he binds a category / sub-category /
   chosen products and picks 2-piece or 3-piece. Every colour pair (or
   triple) is then GENERATED as its own combo product — nothing is typed in.

   This file only ADDS data (DB.subcats, DB.comboRules, two products, one
   colour, one size chart, seed pair sales). The engine and pages are in
   42-combo-auto.js. Rules may point at products from 01z-combo-test.js
   (ct-fleece-hoodie, ct-crew-sweater, ct-fleece-jogger): those ids are only
   read when a page is drawn, so the load order does not matter and a rule
   whose products are missing simply makes no combos.

   RULE SHAPE (one record per "Combo maker" screen)
     id, name, label            'solid-polo-2', 'Solid Polo combos', '2-piece combo'
     title                      short style name used on cards ('Solid Polo')
     bind:{categories:[], products:[]}
                                categories: a category id ('polos') or a
                                sub-category path ('polos/ralph-lauren/solid-polo');
                                every product inside joins automatically.
                                products: product ids picked one by one.
     pieces                     2 | 3
     pairing                    'style'  (default) combos are made inside one style
                                'across' one piece from each bound product (hoodie + jogger)
                                'any'    any different (product, colour) pieces
     sameColour                 false (default) — Black + Black is a plain 2-pack, off
     excludeColours             ['olive'] — colours the owner left out
     price:{mode:'fixed'|'percent', value}
                                fixed = taka per pack (৳1,800); percent = % off the
                                regular total, rounded to ৳10. Never above regular.
     noSingle                   true → no single piece anywhere in this section
     allowUpsell3, upsell       "add 1 more → 3 pcs"; upsell = id of the 3-piece rule
                                (found automatically when left out)
     order                      'bestsellers' | 'colour'
     season                     'summer' | 'winter' (hub tabs)
     listTpl / pageTpl          optional per-rule template (L1–L5 / P1, P2, P5)
     pins                       ['black-navy'] — owner's drag-to-top (optional)
     active                     on / off switch
   ============================================================================================ */
(function(){
  if(typeof DB === 'undefined' || !DB.products) return;
  function s6(a,b,c,d,e,f){ return {S:a, M:b, L:c, XL:d, XXL:e, '3XL':f}; }
  var SIX = ['S','M','L','XL','XXL','3XL'];
  var DAY = 86400000;
  function catChart(id){ var c = (DB.categories||[]).filter(function(x){ return x.id===id; })[0]; return c ? c.chart : ''; }

  DB.colors.yellow = DB.colors.yellow || {name:'Yellow', hex:'#E0B53A'};
  DB.colorNotes = DB.colorNotes || {};
  if(!DB.colorNotes.yellow) DB.colorNotes.yellow = 'Warm sunflower yellow — not neon.';

  /* sub-categories: Polo → Ralph Lauren → Solid Polo / Piqué Polo.
     path = parent path + '/' + slug; products carry `sub` = their deepest path. */
  DB.subcats = DB.subcats || [];
  [
    {id:'polos/ralph-lauren',            name:'Ralph Lauren', parent:'polos'},
    {id:'polos/ralph-lauren/solid-polo', name:'Solid Polo',   parent:'polos/ralph-lauren'},
    {id:'polos/ralph-lauren/pique-polo', name:'Piqué Polo',   parent:'polos/ralph-lauren'},
    /* PR 590 (owner, 19 Oct 12:07): EXTAS sells other brands' products and names
       the brand — one more brand sub-category so the brand handling is visible */
    {id:'polos/lacoste',                 name:'Lacoste',      parent:'polos'}
  ].forEach(function(s){ if(!DB.subcats.some(function(x){ return x.id===s.id; })) DB.subcats.push(s); });

  if(!DB.sizeCharts['ca-polo6']) DB.sizeCharts['ca-polo6'] = {name:'Polo · Regular S–3XL', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:4, defaultFor:[],
    rows:{S:[38,27,16.5,7.5], M:[40,28,17,8], L:[42,29,18,8.25], XL:[44,30,19,8.5], XXL:[46,31,20,8.75], '3XL':[48,32,21,9]}};

  /* the owner's single product, uploaded as usual. `sold` = single-piece sales
     per colour (last 30 days) — the tie-breaker for a new style's combos.
     colorAdded = when a colour was added (a "New colour" tag for 14 days). */
  var prods = [
    {id:'rl-solid-polo', name:'Ralph Lauren Solid Polo', style:'Solid Polo', brand:'Ralph Lauren', cat:'polos', sub:'polos/ralph-lauren/solid-polo',
     collection:'Essentials', price:1100, compareAt:0, fit:'Regular fit', chart:'ca-polo6', garment:'polo',
     colors:['black','navy','white','olive','yellow','grey'], sizes:SIX,
     stock:{black:s6(6,9,10,8,5,3), navy:s6(5,8,9,6,4,0), white:s6(4,7,8,6,3,2), olive:s6(3,5,5,4,1,1), yellow:s6(0,3,4,3,2,1), grey:s6(2,4,2,3,0,1)},
     sold:{black:142, navy:131, white:96, olive:58, yellow:41, grey:37},
     colorAdded:{yellow:Date.now() - 3*DAY},
     rating:4.7, reviews:88, tag:'', hasModel:true, model:'Model 5\'9" · 68 kg · wears M', template:'T1',
     fabric:'100% combed cotton piqué · 220 GSM', care:'Wash cold, inside out · Do not bleach · Dry in shade',
     desc:'Solid-colour piqué polo with a flat-knit collar and two-button placket, in six colours. Sold as 2 or 3 in our combos.', fitNote:'Fits true to size.'},
    {id:'rl-pique-polo', name:'Ralph Lauren Piqué Polo', style:'Piqué Polo', brand:'Ralph Lauren', cat:'polos', sub:'polos/ralph-lauren/pique-polo',
     collection:'Essentials', price:1100, compareAt:0, fit:'Slim fit', chart:'ca-polo6', garment:'polo',
     colors:['sky','maroon','bottle'], sizes:SIX,
     stock:{sky:s6(2,4,4,3,2,1), maroon:s6(1,3,3,2,1,0), bottle:s6(2,3,3,2,0,0)},
     sold:{sky:44, maroon:31, bottle:22},
     rating:4.6, reviews:27, tag:'New', hasModel:true, model:'Model 5\'9" · 68 kg · wears M', template:'T1',
     fabric:'Cotton piqué with stretch · 210 GSM', care:'Wash cold · Dry in shade',
     desc:'Slim piqué polo with tipped collar, in three colours.', fitNote:'Slim — take one size up if between sizes.'},
    /* PR 590 — more brands in the demo (names only: no logos, no brand artwork;
       the usual garment drawings). `brand` is the product's real brand — it
       feeds the brand line on cards, the Product markup and the Google/Meta
       feed. Products with no `brand` are own-label (the shop's own brand,
       set in Admin › Naming & links). None of these is bound to a combo rule. */
    {id:'lc-classic-polo', name:'Lacoste Classic Piqué Polo', style:'Classic Piqué Polo', brand:'Lacoste', cat:'polos', sub:'polos/lacoste',
     collection:'Brands', price:2450, compareAt:0, fit:'Regular fit', chart:'ca-polo6', garment:'polo',
     colors:['white','navy','bottle'], sizes:SIX,
     stock:{white:s6(2,4,4,3,1,0), navy:s6(1,3,4,2,1,1), bottle:s6(1,2,2,1,0,0)},
     rating:4.8, reviews:19, tag:'', hasModel:true, model:'Model 5\'9" · 68 kg · wears M', template:'T1',
     fabric:'100% cotton petit piqué · 210 GSM', care:'Wash cold · Dry in shade',
     desc:'Classic short-sleeve piqué polo with a ribbed collar and two-button placket. (demo brand product)', fitNote:'Fits true to size.'},
    {id:'th-oxford-shirt', name:'Tommy Hilfiger Oxford Shirt', style:'Oxford Shirt', brand:'Tommy Hilfiger', cat:'shirts',
     collection:'Brands', price:2850, compareAt:3200, fit:'Regular fit', chart:catChart('shirts'), garment:'shirt',
     colors:['white','sky','navy'], sizes:['S','M','L','XL','XXL'],
     stock:{white:{S:2,M:4,L:4,XL:3,XXL:1}, sky:{S:1,M:3,L:3,XL:2,XXL:1}, navy:{S:1,M:2,L:2,XL:1,XXL:0}},
     rating:4.7, reviews:12, tag:'', hasModel:true, model:'Model 5\'10" · 72 kg · wears L', template:'T1',
     fabric:'100% cotton Oxford weave', care:'Wash cold · Iron medium',
     desc:'Button-down Oxford shirt with a chest pocket. (demo brand product)', fitNote:'Fits true to size.'},
    {id:'ck-crew-tee', name:'Calvin Klein Crew Tee', style:'Crew Tee', brand:'Calvin Klein', cat:'tshirts',
     collection:'Brands', price:1650, compareAt:0, fit:'Slim fit', chart:catChart('tshirts'), garment:'tee',
     colors:['black','white','grey'], sizes:SIX,
     stock:{black:s6(2,4,5,3,2,1), white:s6(2,3,4,3,1,0), grey:s6(1,2,2,2,0,0)},
     rating:4.6, reviews:21, tag:'New', hasModel:true, model:'Model 5\'9" · 68 kg · wears M', template:'T1',
     fabric:'Cotton-elastane jersey · 180 GSM', care:'Wash cold, inside out',
     desc:'Slim crew-neck tee in soft stretch jersey. (demo brand product)', fitNote:'Slim — take one size up if between sizes.'},
    {id:'lv-slim-jeans', name:'Levi\'s Slim Fit Jeans', style:'Slim Fit Jeans', brand:'Levi\'s', cat:'trousers',
     collection:'Brands', price:3950, compareAt:0, fit:'Slim fit', chart:catChart('trousers'), garment:'trouser',
     colors:['navy','black'], sizes:['30','32','34','36'],
     stock:{navy:{'30':2,'32':4,'34':3,'36':1}, black:{'30':1,'32':2,'34':2,'36':1}},
     rating:4.7, reviews:15, tag:'', hasModel:true, model:'Model 5\'10" · 72 kg · wears 32', template:'T1',
     fabric:'Stretch denim · 99% cotton, 1% elastane', care:'Wash cold, inside out · Dry in shade',
     desc:'Slim-fit five-pocket jeans with a little stretch. (demo brand product)', fitNote:'Slim through the thigh — take your usual waist.'}
  ];
  prods.forEach(function(p){ if(!DB.products.some(function(x){ return x.id===p.id; })) DB.products.push(p); });

  /* the rules — what the owner sets on the Combo maker screen */
  DB.comboRules = DB.comboRules || [];
  [
    {id:'solid-polo-2', name:'Solid Polo combos', title:'Solid Polo', label:'2-piece combo', season:'summer',
     bind:{categories:['polos/ralph-lauren/solid-polo'], products:[]}, pieces:2, pairing:'style',
     price:{mode:'fixed', value:1800}, noSingle:true, allowUpsell3:true, upsell:'solid-polo-3', order:'bestsellers', pins:[], active:true},
    {id:'solid-polo-3', name:'Solid Polo 3-piece combos', title:'Solid Polo', label:'3-piece combo', season:'summer',
     bind:{categories:['polos/ralph-lauren/solid-polo'], products:[]}, pieces:3, pairing:'style',
     price:{mode:'fixed', value:2550}, noSingle:true, allowUpsell3:false, order:'bestsellers', active:true},
    {id:'rl-polos-2', name:'Ralph Lauren polo combos', title:'Ralph Lauren Polo', label:'2-piece combo', season:'summer',
     bind:{categories:['polos/ralph-lauren'], products:[]}, pieces:2, pairing:'style',
     price:{mode:'percent', value:15}, noSingle:true, allowUpsell3:false, order:'bestsellers', active:true},
    {id:'hoodie-2', name:'Fleece Hoodie combos', title:'Fleece Hoodie', label:'2-piece combo', season:'winter',
     bind:{categories:[], products:['ct-fleece-hoodie']}, pieces:2, pairing:'style',
     price:{mode:'fixed', value:2700}, noSingle:true, allowUpsell3:true, upsell:'hoodie-3', order:'bestsellers', active:true},
    {id:'hoodie-3', name:'Fleece Hoodie 3-piece combos', title:'Fleece Hoodie', label:'3-piece combo', season:'winter',
     bind:{categories:[], products:['ct-fleece-hoodie']}, pieces:3, pairing:'style',
     price:{mode:'fixed', value:3850}, noSingle:true, allowUpsell3:false, order:'bestsellers', active:true},
    {id:'sweater-2', name:'Knit Sweater combos', title:'Knit Sweater', label:'2-piece combo', season:'winter',
     bind:{categories:[], products:['ct-crew-sweater']}, pieces:2, pairing:'style',
     price:{mode:'percent', value:12}, noSingle:true, allowUpsell3:false, order:'colour', active:true, pageTpl:'P5'},
    {id:'hoodie-jogger', name:'Hoodie + Jogger combos', title:'Hoodie + Jogger', label:'2-piece combo', season:'winter',
     bind:{categories:[], products:['ct-fleece-hoodie','ct-fleece-jogger']}, pieces:2, pairing:'across',
     price:{mode:'fixed', value:2450}, noSingle:true, allowUpsell3:false, order:'bestsellers', active:true}
  ].forEach(function(r){ if(!DB.comboRules.some(function(x){ return x.id===r.id; })) DB.comboRules.push(r); });

  /* pair sales in the last 30 days (key = generated combo id). In the live
     shop this comes from orders; the demo seeds a few so "best selling" has
     something to sort on. Orders placed in the demo are counted on top. */
  DB.comboAutoSales = DB.comboAutoSales || {
    'solid-polo-2~black-navy':41, 'solid-polo-2~black-white':33, 'solid-polo-2~navy-white':27, 'solid-polo-2~navy-yellow':12,
    'solid-polo-3~black-navy-white':18, 'hoodie-2~black-grey':22, 'hoodie-2~black-navy':19, 'hoodie-jogger~black-black':15, 'hoodie-jogger~grey-black':9
  };
})();
