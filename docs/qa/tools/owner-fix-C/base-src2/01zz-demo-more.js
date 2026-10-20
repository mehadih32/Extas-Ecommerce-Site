/* =====================================================================
   01zz-demo-more.js — owner review 20 Oct (Note 51 · C5) · DEMO DATA ONLY
   The thin categories looked empty on a laptop (Panjabi had one style, so
   its page showed one card and three borrowed ones). These extra sample
   styles give every category two to three full rows:
     Panjabi +10 · Trousers +8 · Shirts +6 · Hoodies +6 · T-shirts +5
     Joggers +5 · Tracksuits +5 · Jackets +5 · Sweaters +5
   and two new "Build your own set" groups (Sets menu): a tracksuit set and
   a hoodie set, plus two ready-made sets (Combos).
   Same fields as 01-data.js. Loaded after 01z, so every existing product
   keeps its place and its SKU. Sample data never ships (PR 509): the real
   shop's products come from the owner's catalogue.
   ===================================================================== */
(function(){
  if(typeof DB === 'undefined' || !DB.products) return;
  var FIVE = ['S','M','L','XL','XXL'], SIX = ['S','M','L','XL','XXL','3XL'], WAIST = ['30','32','34','36'];
  /* a steady, made-up stock pattern (no randomness, so screenshots repeat) */
  function stockFor(colors, sizes, seed){
    var st = {};
    colors.forEach(function(c, ci){
      var row = {};
      sizes.forEach(function(s, si){ var v = (seed * 7 + ci * 5 + si * 3) % 9; row[s] = (si === sizes.length - 1 && ci === colors.length - 1) ? 0 : v; });
      st[c] = row;
    });
    return st;
  }
  var n = 0;
  function mk(o){
    n++;
    var p = {
      id:o.id, name:o.name, cat:o.cat, collection:o.col || 'Essentials', price:o.price, compareAt:o.was || 0,
      fit:o.fit || 'Regular fit', chart:o.chart, colors:o.colors, sizes:o.sizes || FIVE,
      rating:o.rating || (4.3 + (n % 5) / 10), reviews:o.reviews || (8 + (n * 7) % 40), tag:o.tag || '',
      hasModel:!!o.model, template:o.tpl || 'T1',
      fabric:o.fabric, care:o.care || 'Wash cold · Dry in shade', desc:o.desc, fitNote:o.fitNote || 'Fits true to size.'
    };
    if(o.model) p.model = o.model;
    if(o.garment) p.garment = o.garment;
    p.stock = stockFor(p.colors, p.sizes, n);
    if(!DB.products.some(function(x){ return x.id === p.id; })) DB.products.push(p);
  }
  var M9 = 'Model 5\'9" · 70 kg · wears L';

  /* ---------- Panjabi +10 ---------- */
  [
    ['eid-silk-blend-panjabi', 'Silk Blend Eid Panjabi', 2650, 0, ['ecru','maroon','bottle'], 'Silk-cotton blend with a soft sheen', 'Eid edit', 'Light sheen for Eid morning. Hidden placket and mandarin collar.'],
    ['embroidered-neck-panjabi', 'Embroidered Neck Panjabi', 2350, 2750, ['white','sky','sand'], 'Cotton voile · tone-on-tone neck embroidery', '', 'Fine thread work at the neck only. Smart, not loud.'],
    ['short-kurta-panjabi', 'Short Kurta Panjabi', 1450, 0, ['white','navy','olive'], 'Cotton slub', '', 'Hip length. Wear it with jeans or chinos.'],
    ['linen-panjabi', 'Linen Panjabi', 2150, 0, ['sand','white','sky'], '55% linen, 45% cotton', '', 'Cool linen for hot Eid days. It creases a little, like linen should.'],
    ['printed-panjabi', 'Block Print Panjabi', 1750, 0, ['ecru','navy'], 'Cotton · hand block print', '', 'Small block print all over. Made in Bangladesh.'],
    ['jacquard-panjabi', 'Jacquard Panjabi', 2950, 3400, ['maroon','black','ecru'], 'Cotton jacquard weave', 'Eid edit', 'Woven pattern in the fabric. For weddings and Eid.'],
    ['everyday-cotton-panjabi', 'Everyday Cotton Panjabi', 1250, 0, ['white','sky','grey'], '100% cotton poplin', '', 'Simple and light. For Friday prayers and daily wear.'],
    ['puja-festive-panjabi', 'Festive Panjabi', 2450, 0, ['mustard','maroon','white'], 'Cotton dobby', '', 'Bright festive colours with a neat collar.'],
    ['slim-cut-panjabi', 'Slim Cut Panjabi', 1950, 0, ['black','navy','white'], 'Cotton with a little stretch', '', 'Closer fit through the body. Knee length.'],
    ['kids-match-panjabi', 'Father-Son Panjabi', 1650, 0, ['white','sky'], 'Fine cotton voile', '', 'Same colour in a kids size too, so you can match on Eid.']
  ].forEach(function(r, i){ mk({id:r[0], name:r[1], cat:'panjabi', col:'Eid Edit', price:r[2], was:r[3], fit:i===8 ? 'Slim fit' : 'Classic fit', chart:'panjabi-classic',
    colors:r[4], fabric:r[5], tag:r[6], desc:r[7], care:'Gentle wash · Iron low', fitNote:i===2 ? 'Hip length.' : 'Classic fit, knee length.', model:i%2 ? '' : M9, tpl:'T2'}); });

  /* ---------- Trousers +8 ---------- */
  [
    ['stretch-office-trousers', 'Stretch Office Trousers', 1650, 0, ['charcoal','navy','black'], 'Poly-viscose with 3% stretch', 'Slim fit', 'Smart office trousers. Easy to iron.'],
    ['cargo-twill-trousers', 'Cargo Twill Trousers', 1550, 0, ['olive','khaki','black'], 'Cotton twill', 'Relaxed fit', 'Two side pockets with flaps. Weekend wear.'],
    ['pleated-chino-trousers', 'Pleated Chino Trousers', 1750, 1990, ['sand','navy'], 'Cotton twill with 2% stretch', 'Regular fit', 'One pleat in front. A little more room at the top.'],
    ['linen-drawstring-trousers', 'Linen Drawstring Trousers', 1450, 0, ['sand','white','olive'], '55% linen, 45% cotton', 'Relaxed fit', 'Soft waist with a cord. Cool for summer.'],
    ['slim-denim-jeans', 'Slim Denim Jeans', 1850, 0, ['navy','black'], 'Cotton denim with stretch · 11 oz', 'Slim fit', 'Classic five-pocket jeans.'],
    ['straight-denim-jeans', 'Straight Denim Jeans', 1790, 0, ['navy','charcoal'], 'Cotton denim · 12 oz', 'Regular fit', 'Straight leg. Not tight, not loose.'],
    ['corduroy-trousers', 'Corduroy Trousers', 1890, 0, ['brown','bottle','sand'], 'Cotton corduroy', 'Regular fit', 'Soft ribbed cotton for winter.'],
    ['travel-tech-trousers', 'Travel Trousers', 1990, 2300, ['black','charcoal'], 'Nylon blend · quick dry', 'Slim fit', 'Light and quick to dry. Zip pocket for your phone.']
  ].forEach(function(r, i){ mk({id:r[0], name:r[1], cat:'trousers', col:i%2 ? 'Weekend' : 'Office', price:r[2], was:r[3], fit:r[6], chart:'chino-slim', sizes:WAIST,
    colors:r[4], fabric:r[5], desc:r[7], care:'Wash cold · Iron medium', fitNote:'Fits true to waist size.', model:i%2 ? '' : 'Model 5\'10" · 70 kg · wears 32'}); });

  /* ---------- Shirts +6 ---------- */
  [
    ['poplin-office-shirt', 'Poplin Office Shirt', 1350, 0, ['white','sky','pink'], '100% cotton poplin', 'Regular fit', 'Smooth office shirt. Easy to iron.'],
    ['check-flannel-shirt', 'Check Flannel Shirt', 1550, 0, ['maroon','bottle','navy'], 'Brushed cotton flannel', 'Regular fit', 'Soft check shirt for winter.'],
    ['denim-shirt', 'Denim Shirt', 1690, 1890, ['navy','sky'], 'Light cotton denim', 'Regular fit', 'Wear it alone or open over a tee.'],
    ['mandarin-collar-shirt', 'Mandarin Collar Shirt', 1450, 0, ['white','black','olive'], 'Cotton-linen blend', 'Relaxed fit', 'Band collar, no tie needed.'],
    ['short-sleeve-camp-shirt', 'Short Sleeve Camp Shirt', 1250, 0, ['sand','sky','olive'], 'Cotton viscose', 'Relaxed fit', 'Open collar. For hot weekends.'],
    ['slim-stretch-shirt', 'Slim Stretch Shirt', 1490, 0, ['white','navy','charcoal'], 'Cotton with 3% stretch', 'Slim fit', 'Moves with you all day.']
  ].forEach(function(r, i){ mk({id:r[0], name:r[1], cat:'shirts', col:i%2 ? 'Weekend' : 'Office', price:r[2], was:r[3], fit:r[6], chart:'shirt-regular',
    colors:r[4], fabric:r[5], desc:r[7], care:'Wash cold · Iron medium', model:i%2 ? '' : 'Model 5\'10" · 72 kg · wears L'}); });

  /* ---------- Hoodies +6 ---------- */
  [
    ['zip-through-hoodie', 'Zip-Through Hoodie', 1750, 0, ['black','grey','navy'], '300 GSM cotton fleece · brushed inside', 'Full zip and two pockets.'],
    ['oversized-hoodie', 'Oversized Hoodie', 1850, 2200, ['charcoal','sand','olive'], '340 GSM cotton fleece', 'Wide and loose. Drop shoulder.'],
    ['light-summer-hoodie', 'Light Hoodie', 1290, 0, ['grey','navy','white'], '220 GSM French terry', 'Thin hoodie for cool evenings and AC rooms.'],
    ['sherpa-lined-hoodie', 'Sherpa Lined Hoodie', 2450, 0, ['black','brown'], 'Cotton fleece · sherpa lining', 'Extra warm. Soft lining inside.'],
    ['graphic-print-hoodie', 'Print Hoodie', 1690, 0, ['black','maroon'], '300 GSM cotton fleece', 'Small print on the chest.'],
    ['pullover-sweat-hoodie', 'Classic Pullover Hoodie', 1490, 0, ['grey','black','bottle'], '280 GSM cotton fleece', 'Plain everyday hoodie with a kangaroo pocket.']
  ].forEach(function(r, i){ mk({id:r[0], name:r[1], cat:'hoodies', col:'Winter 2026', price:r[2], was:r[3], fit:i===1 ? 'Relaxed fit' : 'Regular fit', chart:'hoodie-regular',
    colors:r[4], fabric:r[5], desc:r[6], care:'Wash inside out, cold', model:i%2 ? '' : 'Model 5\'9" · 72 kg · wears L'}); });

  /* ---------- T-shirts +5 ---------- */
  [
    ['v-neck-tee', 'V-Neck Tee', 550, 0, ['white','black','navy'], '100% cotton single jersey · 180 GSM', 'Regular fit', 'Clean V neck. Light and soft.'],
    ['oversized-heavy-tee', 'Oversized Heavy Tee', 790, 0, ['black','sand','olive'], '100% cotton · 260 GSM', 'Relaxed fit', 'Thick cotton. Loose fit.'],
    ['striped-breton-tee', 'Striped Tee', 690, 850, ['navy','white'], 'Cotton jersey · yarn-dyed stripe', 'Regular fit', 'Classic stripes. The colour does not wash out.'],
    ['henley-tee', 'Henley Tee', 750, 0, ['grey','olive','navy'], 'Cotton slub jersey', 'Regular fit', 'Three buttons at the neck.'],
    ['long-sleeve-tee', 'Long Sleeve Tee', 690, 0, ['white','black','maroon'], '100% cotton · 200 GSM', 'Regular fit', 'Full sleeves for cooler days.']
  ].forEach(function(r, i){ mk({id:r[0], name:r[1], cat:'tshirts', col:i%2 ? 'Weekend' : 'Essentials', price:r[2], was:r[3], fit:r[6], chart:'tee-regular',
    colors:r[4], fabric:r[5], desc:r[7], care:'Machine wash cold', model:i%2 ? '' : 'Model 5\'9" · 68 kg · wears M'}); });

  /* ---------- the hidden test categories (under "More") +5 each ---------- */
  var JOG = [
    ['slim-track-jogger', 'Slim Track Jogger', 1350, 0, ['black','navy','charcoal'], 'Poly-cotton interlock · 260 GSM', 'Slim leg with zip pockets.'],
    ['cargo-jogger', 'Cargo Jogger', 1490, 0, ['olive','black','khaki'], 'Cotton twill with stretch', 'Cargo pockets and cuffed ankles.'],
    ['light-terry-jogger', 'Light Jogger', 990, 0, ['grey','navy'], '220 GSM French terry', 'Light jogger for home and gym.'],
    ['winter-fleece-jogger', 'Winter Fleece Jogger', 1390, 1600, ['black','charcoal','bottle'], '320 GSM brushed fleece', 'Thick and warm. Ribbed cuffs.'],
    ['open-hem-trackpant', 'Open Hem Track Pant', 1290, 0, ['black','navy','maroon'], 'Poly-cotton interlock', 'Straight leg, no cuff.', 'trackpant']
  ];
  JOG.forEach(function(r){ mk({id:r[0], name:r[1], cat:'joggers', col:'Winter 2026', price:r[2], was:r[3], chart:'ct-jogger', sizes:SIX, colors:r[4], fabric:r[5], desc:r[6], garment:r[7], fitNote:'Elastic waist — pick your usual top size.'}); });
  var TRK = [
    ['classic-track-top', 'Classic Track Top', 1650, 0, ['navy','black','maroon'], 'Poly-cotton interlock · 260 GSM', 'Full zip with side stripes.'],
    ['hooded-track-top', 'Hooded Track Top', 1850, 0, ['black','charcoal','bottle'], 'Brushed poly-cotton', 'Track top with a hood.'],
    ['retro-stripe-track-top', 'Retro Stripe Track Top', 1750, 1990, ['royal','black','bottle'], 'Tricot knit', 'Bold stripes on the sleeves.'],
    ['half-zip-track-top', 'Half-Zip Track Top', 1450, 0, ['grey','navy'], 'Poly-cotton interlock', 'Pull-over top with a short zip.'],
    ['winter-track-jacket', 'Winter Track Jacket', 2150, 0, ['black','navy','olive'], 'Fleece-backed knit', 'Warm track jacket for winter mornings.']
  ];
  TRK.forEach(function(r){ mk({id:r[0], name:r[1], cat:'tracksuits', garment:'tracktop', col:'Winter 2026', price:r[2], was:r[3], chart:'ct-tracktop', sizes:SIX, colors:r[4], fabric:r[5], desc:r[6]}); });
  var JKT = [
    ['bomber-jacket', 'Bomber Jacket', 2950, 0, ['black','olive','navy'], 'Nylon shell · light padding', 'Classic bomber with ribbed cuffs.'],
    ['denim-jacket', 'Denim Jacket', 2650, 0, ['navy','sky'], 'Cotton denim · 12 oz', 'Classic denim jacket.', 'shirt'],
    ['light-puffer-vest', 'Light Puffer Jacket', 2450, 2900, ['black','sand'], 'Water-repellent nylon · light fill', 'Very light. Packs small.'],
    ['harrington-jacket', 'Harrington Jacket', 2750, 0, ['khaki','navy','bottle'], 'Cotton twill · check lining', 'Smart jacket with a short collar.'],
    ['hooded-parka', 'Hooded Parka', 3850, 0, ['olive','black'], 'Cotton blend · padded', 'Long warm jacket with a hood.']
  ];
  JKT.forEach(function(r){ mk({id:r[0], name:r[1], cat:'jackets', garment:r[7] || 'puffer', col:'Winter 2026', price:r[2], was:r[3], chart:'ct-puffer', sizes:SIX, colors:r[4], fabric:r[5], desc:r[6], fitNote:'Room for a hoodie underneath — take your usual size.'}); });
  var SWT = [
    ['v-neck-sweater', 'V-Neck Sweater', 1350, 0, ['navy','charcoal','maroon'], 'Acrylic-cotton blend · fine knit', 'Fine knit V neck. Wear it over a shirt.'],
    ['half-zip-sweater', 'Half-Zip Sweater', 1590, 0, ['ecru','navy','bottle'], 'Cotton blend knit', 'Short zip at the neck.'],
    ['cable-knit-sweater', 'Cable Knit Sweater', 1690, 1950, ['ecru','grey'], 'Acrylic-wool blend', 'Thick cable pattern. Very warm.'],
    ['striped-knit-sweater', 'Striped Sweater', 1450, 0, ['navy','maroon'], 'Cotton-acrylic knit', 'Wide stripes. Soft on the skin.'],
    ['knit-cardigan', 'Knit Cardigan', 1790, 0, ['charcoal','brown','navy'], 'Acrylic-cotton blend', 'Buttons down the front, two pockets.']
  ];
  SWT.forEach(function(r){ mk({id:r[0], name:r[1], cat:'sweaters', garment:'sweater', col:'Winter 2026', price:r[2], was:r[3], chart:'ct-sweater', sizes:SIX, colors:r[4], fabric:r[5], desc:r[6], care:'Hand wash or gentle cycle cold · Dry flat'}); });

  /* ---------- Sets: a tracksuit set and a hoodie set (Build your own set) ---------- */
  DB.customSetRules = DB.customSetRules || [];
  [
    {id:'tracksuit-set', name:'Tracksuit set', mode:'category', categories:['tracksuits','joggers'], skus:[], tiers:{2:2890, 3:4150}, active:true},
    {id:'hoodie-set', name:'Hoodie set', mode:'category', categories:['hoodies','joggers'], skus:[], tiers:{2:2590, 3:3690}, active:true}
  ].forEach(function(r){ if(!DB.customSetRules.some(function(x){ return x.id === r.id; })) DB.customSetRules.push(r); });
  /* ready-made sets (Combos) */
  DB.combos = DB.combos || [];
  [
    {id:'hoodie-jogger-set', name:'Hoodie + Jogger Set', blurb:'Fleece hoodie with the matching fleece jogger', items:['ct-fleece-hoodie','ct-fleece-jogger'], price:2490, autoApply:true, active:true, template:'C1'},
    {id:'classic-tracksuit-set', name:'Classic Tracksuit Set', blurb:'Classic track top with the slim track jogger', items:['classic-track-top','slim-track-jogger'], price:2690, autoApply:true, active:true, template:'C1'}
  ].forEach(function(c){ if(!DB.combos.some(function(x){ return x.id === c.id; })) DB.combos.push(c); });
})();
