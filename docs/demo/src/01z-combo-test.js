/* ================= EXTAS demo — COMBO TEST DATA (test/demo only) =================
   Loads right after 01-data.js (file-name order) and ADDS to DB. Nothing in
   01-data.js is changed. Every record below is TEST / DEMO data for checking
   ready-made sets (combos) on winter and summer basics. Delete this file and
   02z-garments.js to remove it all.

   New garment drawings for these products live in 02z-garments.js
   (tracktop, trackpant, jogger, puffer, bomber, sweater, sweatshirt).
   New categories are hidden:true, so they never show in the main menu,
   home tiles, footer or category chips — they open only by link (#/c/<id>).

   ┌───────────────────────┬────────────┬──────────────────────────────────────────────┬─────────┬────────┐
   │ TEST PRODUCT id       │ cat        │ colours (6 each unless noted)                │ sizes   │ price  │
   ├───────────────────────┼────────────┼──────────────────────────────────────────────┼─────────┼────────┤
   │ ct-tracksuit-top      │ tracksuits │ black navy charcoal maroon bottle royal      │ S–3XL   │ ৳1,850 │
   │ ct-tracksuit-bottom   │ joggers    │ black navy charcoal maroon bottle royal      │ S–3XL   │ ৳1,450 │
   │ ct-puffer-jacket      │ jackets    │ black navy olive maroon sand rust            │ S–3XL   │ ৳3,450 (was ৳3,990) │
   │ ct-fleece-hoodie      │ hoodies    │ black grey navy maroon olive mustard         │ S–3XL   │ ৳1,550 │
   │ ct-fleece-jogger      │ joggers    │ black grey navy charcoal olive khaki         │ S–3XL   │ ৳1,250 │
   │ ct-crew-sweater       │ sweaters   │ navy charcoal maroon bottle ecru mustard     │ S–3XL   │ ৳1,390 │
   │ ct-basic-polo         │ polos      │ navy white black sky maroon bottle           │ S–3XL   │ ৳690   │
   │ ct-basic-tee          │ tshirts    │ white black navy grey olive mustard          │ S–3XL   │ ৳450   │
   └───────────────────────┴────────────┴──────────────────────────────────────────────┴─────────┴────────┘
   (S, M, L, XL, XXL, 3XL — each product has a few sold-out cells (0) and a few
    "only 1–2 left" cells, and a size chart with rows for all six sizes.)

   ┌──────────────────┬───────────────────────────┬─────────────────────────────────────────┬──────────┬────────┬────────┐
   │ TEST COMBO id    │ name                      │ items                                   │ separate │ set    │ save   │
   ├──────────────────┼───────────────────────────┼─────────────────────────────────────────┼──────────┼────────┼────────┤
   │ ct-tracksuit-set │ Tracksuit Set     (winter)│ ct-tracksuit-top + ct-tracksuit-bottom  │ ৳3,300   │ ৳2,890 │ ৳410   │
   │ ct-jacket-hoodie │ Jacket + Hoodie   (winter)│ ct-puffer-jacket + ct-fleece-hoodie     │ ৳5,000   │ ৳4,390 │ ৳610   │
   │ ct-hoodie-jogger │ Hoodie + Jogger Set (wint)│ ct-fleece-hoodie + ct-fleece-jogger     │ ৳2,800   │ ৳2,450 │ ৳350   │
   │ ct-polo-trio     │ Polo Trio         (summer)│ ct-basic-polo × 3                       │ ৳2,070   │ ৳1,790 │ ৳280   │
   │ ct-polo-duo-6    │ Polo Duo 6-colour (summer)│ ct-basic-polo × 2 (any 2 of 6)          │ ৳1,380   │ ৳1,250 │ ৳130   │
   │ ct-tee-trio      │ Tee Trio          (summer)│ ct-basic-tee × 3                        │ ৳1,350   │ ৳1,150 │ ৳200   │
   │ ct-sweater-duo   │ Sweater Duo       (winter)│ ct-crew-sweater × 2                     │ ৳2,780   │ ৳2,450 │ ৳330   │
   └──────────────────┴───────────────────────────┴─────────────────────────────────────────┴──────────┴────────┴────────┘
   Trios are listed BEFORE duos on purpose: the bag's auto-apply engine walks
   DB.combos in order, so three loose polos get the Trio price, not Duo + 1.

   customSetRules (test): ct-basic-tees — any 2 basic tees ৳820, any 3 ৳1,150.
   ================================================================================ */
(function(){
  if(typeof DB === 'undefined' || !DB.products) return;
  /* stock helper for six sizes: S, M, L, XL, XXL, 3XL (same shape as _s(), one more size) */
  function s6(a,b,c,d,e,f){ return {S:a, M:b, L:c, XL:d, XXL:e, '3XL':f}; }
  var SIX = ['S','M','L','XL','XXL','3XL'];

  /* TEST: two extra colours so six-colour products have real variety */
  DB.colors.royal = DB.colors.royal || {name:'Royal Blue', hex:'#2D4E9C'};
  DB.colors.rust  = DB.colors.rust  || {name:'Rust',       hex:'#A0522D'};
  DB.colorNotes = DB.colorNotes || {};
  if(!DB.colorNotes.royal) DB.colorNotes.royal = 'Bright royal blue — brighter than navy.';
  if(!DB.colorNotes.rust)  DB.colorNotes.rust  = 'Warm burnt orange-brown.';

  /* TEST: categories for the new garments. hidden:true keeps them out of the
     main menu, home tiles, footer and chips; #/c/<id> still works. */
  var cats = [
    {id:'jackets',    name:'Jackets',    bn:'জ্যাকেট',     garment:'puffer',   group:'top',    chart:'ct-puffer',   hidden:true, blurb:'Puffer and bomber jackets for Bangladeshi winters. (test category)'},
    {id:'sweaters',   name:'Sweaters',   bn:'সোয়েটার',    garment:'sweater',  group:'top',    chart:'ct-sweater',  hidden:true, blurb:'Crew-neck knit sweaters. (test category)'},
    {id:'tracksuits', name:'Tracksuits', bn:'ট্র্যাকস্যুট', garment:'tracktop', group:'top',    chart:'ct-tracktop', hidden:true, blurb:'Zip track tops — buy alone or as a set with the bottom. (test category)'},
    {id:'joggers',    name:'Joggers',    bn:'জগার',       garment:'jogger',   group:'bottom', chart:'ct-jogger',   hidden:true, blurb:'Cuffed joggers and track bottoms. (test category)'}
  ];
  cats.forEach(function(c){ if(!DB.categories.some(function(x){ return x.id===c.id; })) DB.categories.push(c); });

  /* TEST: size charts — every chart has rows for all six sizes */
  var charts = {
    'ct-tracktop':{name:'Track top · Regular (test)', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:5, defaultFor:[],
      rows:{S:[39,26.5,17,24], M:[41,27.5,17.5,24.5], L:[43,28.5,18.5,25], XL:[45,29.5,19.5,25.5], XXL:[47,30.5,20.5,26], '3XL':[49,31.5,21.5,26.5]}},
    'ct-jogger':{name:'Jogger · Elastic waist (test)', type:'bottom', fields:['Waist','Hip','Thigh','Length','Leg opening'], ease:1, defaultFor:[],
      rows:{S:[28,39,23,38.5,9], M:[30,41,24,39,9.5], L:[32,43,25,39.5,10], XL:[34,45,26,40,10.5], XXL:[36,47,27,40.5,11], '3XL':[38,49,28,41,11.5]}},
    'ct-puffer':{name:'Puffer jacket · Regular (test)', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:8, defaultFor:[],
      rows:{S:[42,26.5,18,25], M:[44,27.5,18.5,25.5], L:[46,28.5,19.5,26], XL:[48,29.5,20.5,26.5], XXL:[50,30.5,21.5,27], '3XL':[52,31.5,22.5,27.5]}},
    'ct-hoodie6':{name:'Hoodie · Regular S–3XL (test)', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:6, defaultFor:[],
      rows:{S:[40,26.5,17.5,24], M:[42,27.5,18,24.5], L:[44,28.5,19,25], XL:[46,29.5,20,25.5], XXL:[48,30.5,21,26], '3XL':[50,31.5,22,26.5]}},
    'ct-sweater':{name:'Sweater · Crew neck (test)', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:4, defaultFor:[],
      rows:{S:[38,26,17,24], M:[40,27,17.5,24.5], L:[42,28,18.5,25], XL:[44,29,19.5,25.5], XXL:[46,30,20.5,26], '3XL':[48,31,21.5,26.5]}},
    'ct-polo6':{name:'Polo · Basic S–3XL (test)', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:4, defaultFor:[],
      rows:{S:[38,27,16.5,7.5], M:[40,28,17,8], L:[42,29,18,8.25], XL:[44,30,19,8.5], XXL:[46,31,20,8.75], '3XL':[48,32,21,9]}},
    'ct-tee6':{name:'T-shirt · Basic S–3XL (test)', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:4, defaultFor:[],
      rows:{S:[38,27,17,7.5], M:[40,28,17.5,8], L:[42,29,18.5,8.25], XL:[44,30,19.5,8.5], XXL:[46,31,20.5,9], '3XL':[48,32,21.5,9.25]}}
  };
  for(var k in charts) if(!DB.sizeCharts[k]) DB.sizeCharts[k] = charts[k];

  /* TEST: products — same fields as the products in 01-data.js.
     PR 590: `brand` = the product's real brand (two labelled here so a brand line
     shows on cards whose name does not say it); no `brand` = own label. */
  var prods = [
    {id:'ct-tracksuit-top', name:'Tracksuit Zip Top', cat:'tracksuits', garment:'tracktop', collection:'Winter 2026', price:1850, compareAt:0, fit:'Regular fit', chart:'ct-tracktop',
     colors:['black','navy','charcoal','maroon','bottle','royal'], sizes:SIX,
     stock:{black:s6(4,7,8,6,3,2), navy:s6(3,6,5,4,2,1), charcoal:s6(2,4,4,3,0,1), maroon:s6(1,3,2,0,1,0), bottle:s6(2,3,3,2,1,0), royal:s6(0,2,3,2,1,1)},
     rating:4.6, reviews:38, tag:'Winter 2026', hasModel:true, model:'Model 5\'9" · 70 kg · wears L', template:'T1',
     fabric:'Polyester-cotton interlock · 280 GSM · brushed inside', care:'Wash cold, inside out · Do not tumble dry · Dry in shade',
     desc:'Full-zip track top with a stand collar, contrast sleeve stripes and zip-free side pockets. Pairs with the Tracksuit Trousers as a set. (test product)', fitNote:'Fits true to size.'},
    {id:'ct-tracksuit-bottom', name:'Tracksuit Trousers', cat:'joggers', garment:'trackpant', collection:'Winter 2026', price:1450, compareAt:0, fit:'Regular fit', chart:'ct-jogger',
     colors:['black','navy','charcoal','maroon','bottle','royal'], sizes:SIX,
     stock:{black:s6(5,8,8,6,3,2), navy:s6(3,5,5,3,2,0), charcoal:s6(2,4,3,3,1,1), maroon:s6(1,2,3,1,0,0), bottle:s6(1,3,2,2,1,1), royal:s6(2,2,2,0,1,1)},
     rating:4.5, reviews:29, tag:'Winter 2026', hasModel:true, model:'Model 5\'9" · 70 kg · wears L', template:'T1',
     fabric:'Polyester-cotton interlock · 280 GSM · brushed inside', care:'Wash cold, inside out · Do not tumble dry',
     desc:'Elastic waist with drawcord, side stripes and ribbed cuffs. Same fabric and colours as the Tracksuit Zip Top. (test product)', fitNote:'Elastic waist — pick your usual top size.'},
    {id:'ct-puffer-jacket', name:'Quilted Puffer Jacket', brand:'Hugo Boss', cat:'jackets', garment:'puffer', collection:'Winter 2026', price:3450, compareAt:3990, fit:'Regular fit', chart:'ct-puffer',
     colors:['black','navy','olive','maroon','sand','rust'], sizes:SIX,
     stock:{black:s6(3,5,6,4,2,1), navy:s6(2,4,4,3,1,0), olive:s6(1,3,3,2,0,1), maroon:s6(0,2,2,1,1,0), sand:s6(1,2,2,1,0,0), rust:s6(1,1,2,2,1,1)},
     rating:4.7, reviews:54, tag:'Winter 2026', hasModel:true, model:'Model 6\'0" · 76 kg · wears L', template:'T1',
     fabric:'Water-repellent nylon shell · polyester wadding · 180 GSM fill', care:'Gentle wash cold · Do not iron · Dry flat',
     desc:'Light, warm quilted jacket with a high collar and two zip pockets. Packs into its own pocket. (test product)', fitNote:'Room for a hoodie underneath — take your usual size.'},
    {id:'ct-fleece-hoodie', name:'Fleece Hoodie 6-Colour', cat:'hoodies', collection:'Winter 2026', price:1550, compareAt:0, fit:'Regular fit', chart:'ct-hoodie6',
     colors:['black','grey','navy','maroon','olive','mustard'], sizes:SIX,
     stock:{black:s6(4,8,9,6,4,2), grey:s6(3,6,6,4,2,1), navy:s6(3,5,5,3,1,0), maroon:s6(1,3,4,2,0,1), olive:s6(2,3,2,2,1,0), mustard:s6(0,2,2,1,1,1)},
     rating:4.6, reviews:77, tag:'Winter 2026', hasModel:true, model:'Model 5\'9" · 72 kg · wears L', template:'T1',
     fabric:'300 GSM cotton fleece · 80% cotton, 20% polyester · brushed inside', care:'Wash inside out, cold · Dry in shade',
     desc:'Everyday pullover hoodie with a lined hood and kangaroo pocket, in six colours. (test product)', fitNote:'Fits true to size.'},
    {id:'ct-fleece-jogger', name:'Fleece Cuffed Jogger', cat:'joggers', collection:'Winter 2026', price:1250, compareAt:0, fit:'Regular fit', chart:'ct-jogger',
     colors:['black','grey','navy','charcoal','olive','khaki'], sizes:SIX,
     stock:{black:s6(4,7,7,5,3,2), grey:s6(3,5,6,4,2,1), navy:s6(2,4,4,3,1,0), charcoal:s6(2,3,3,0,1,1), olive:s6(1,2,3,2,0,0), khaki:s6(1,2,2,1,1,1)},
     rating:4.5, reviews:46, tag:'', hasModel:true, model:'Model 5\'9" · 72 kg · wears L', template:'T1',
     fabric:'300 GSM cotton fleece · brushed inside', care:'Wash cold · Dry in shade',
     desc:'Soft fleece jogger with elastic waist, drawcord, side pockets and ribbed cuffs. (test product)', fitNote:'Elastic waist — pick your usual top size.'},
    {id:'ct-crew-sweater', name:'Crew-Neck Knit Sweater', brand:'Zara', cat:'sweaters', collection:'Winter 2026', price:1390, compareAt:0, fit:'Regular fit', chart:'ct-sweater',
     colors:['navy','charcoal','maroon','bottle','ecru','mustard'], sizes:SIX,
     stock:{navy:s6(3,5,6,4,2,1), charcoal:s6(2,5,5,3,1,1), maroon:s6(2,3,3,2,0,0), bottle:s6(1,3,2,2,1,0), ecru:s6(2,2,3,1,1,1), mustard:s6(0,1,2,2,1,0)},
     rating:4.6, reviews:33, tag:'New', hasModel:false, template:'T1',
     fabric:'Acrylic-cotton blend · 12 gauge cable knit', care:'Hand wash or gentle cycle cold · Dry flat',
     desc:'Classic crew-neck sweater with a cable front and ribbed neck, cuffs and hem. (test product)', fitNote:'Fits true to size.'},
    {id:'ct-basic-polo', name:'Summer Basic Polo', cat:'polos', collection:'Essentials', price:690, compareAt:0, fit:'Regular fit', chart:'ct-polo6',
     colors:['navy','white','black','sky','maroon','bottle'], sizes:SIX,
     stock:{navy:s6(6,9,10,7,4,2), white:s6(5,8,8,6,3,1), black:s6(5,8,9,6,3,2), sky:s6(2,4,5,3,1,0), maroon:s6(1,3,3,0,1,1), bottle:s6(0,2,3,2,1,1)},
     rating:4.5, reviews:96, tag:'Summer basic', hasModel:true, model:'Model 5\'9" · 68 kg · wears M', template:'T1',
     fabric:'Cotton-rich piqué · 200 GSM', care:'Wash cold · Do not bleach · Dry in shade',
     desc:'Light piqué polo for hot days, in six everyday colours. Buy two or three and save. (test product)', fitNote:'Fits true to size.'},
    {id:'ct-basic-tee', name:'Basic Crew Tee', cat:'tshirts', collection:'Essentials', price:450, compareAt:0, fit:'Regular fit', chart:'ct-tee6',
     colors:['white','black','navy','grey','olive','mustard'], sizes:SIX,
     stock:{white:s6(8,10,12,8,5,3), black:s6(7,10,11,8,4,2), navy:s6(4,6,7,5,2,1), grey:s6(3,5,5,3,0,1), olive:s6(2,3,3,2,1,0), mustard:s6(0,2,2,1,1,0)},
     rating:4.4, reviews:132, tag:'Summer basic', hasModel:true, model:'Model 5\'9" · 68 kg · wears M', template:'T1',
     fabric:'100% cotton single jersey · 160 GSM', care:'Machine wash cold',
     desc:'Light everyday crew tee in six colours. Three for less in the Tee Trio. (test product)', fitNote:'Fits true to size.'}
  ];
  prods.forEach(function(p){ if(!DB.products.some(function(x){ return x.id===p.id; })) DB.products.push(p); });

  /* TEST: ready-made sets — same shape as DB.combos in 01-data.js.
     Trios before duos (see the note at the top). */
  var cmb = [
    {id:'ct-tracksuit-set', name:'Tracksuit Set', blurb:'Zip top + trousers in the same colour — winter set (test)', items:['ct-tracksuit-top','ct-tracksuit-bottom'], price:2890, autoApply:true, active:true, template:'C1'},
    {id:'ct-jacket-hoodie', name:'Jacket + Hoodie', blurb:'Quilted puffer with a fleece hoodie underneath (test)', items:['ct-puffer-jacket','ct-fleece-hoodie'], price:4390, autoApply:true, active:true, template:'C1'},
    {id:'ct-hoodie-jogger', name:'Hoodie + Jogger Set', blurb:'Fleece hoodie and cuffed jogger — any colours (test)', items:['ct-fleece-hoodie','ct-fleece-jogger'], price:2450, autoApply:true, active:true, template:'C1'},
    {id:'ct-polo-trio', name:'Polo Trio', blurb:'Any 3 colours of the Summer Basic Polo (test)', items:['ct-basic-polo','ct-basic-polo','ct-basic-polo'], price:1790, autoApply:true, active:true, template:'C1'},
    {id:'ct-polo-duo-6', name:'Polo Duo 6-colour', blurb:'Any 2 of 6 colours of the Summer Basic Polo (test)', items:['ct-basic-polo','ct-basic-polo'], price:1250, autoApply:true, active:true, template:'C1'},
    {id:'ct-tee-trio', name:'Tee Trio', blurb:'Any 3 colours of the Basic Crew Tee (test)', items:['ct-basic-tee','ct-basic-tee','ct-basic-tee'], price:1150, autoApply:true, active:true, template:'C1'},
    {id:'ct-sweater-duo', name:'Sweater Duo', blurb:'Any 2 colours of the Crew-Neck Knit Sweater (test)', items:['ct-crew-sweater','ct-crew-sweater'], price:2450, autoApply:true, active:true, template:'C1'}
  ];
  cmb.forEach(function(c){ if(!DB.combos.some(function(x){ return x.id===c.id; })) DB.combos.push(c); });

  /* TEST: build-your-own tier for the basic tee (any 2 / any 3 colours) */
  if(DB.customSetRules && !DB.customSetRules.some(function(r){ return r.id==='ct-basic-tees'; }))
    DB.customSetRules.push({id:'ct-basic-tees', name:'Basic tees, any colours (test)', mode:'sku', categories:[], skus:['ct-basic-tee'], tiers:{2:820, 3:1150}, active:true});

  /* flat list of every test product + combo id; the groups ride along as properties */
  var ids = prods.map(function(p){ return p.id; }).concat(cmb.map(function(c){ return c.id; }));
  ids.products = prods.map(function(p){ return p.id; });
  ids.combos = cmb.map(function(c){ return c.id; });
  ids.categories = cats.map(function(c){ return c.id; });
  ids.setRules = ['ct-basic-tees'];
  ids.garments = ['tracktop','trackpant','jogger','puffer','bomber','sweater','sweatshirt'];
  window.COMBO_TEST_IDS = ids;
})();
