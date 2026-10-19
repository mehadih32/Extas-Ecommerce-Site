/* ================= EXTAS demo — seed data (demo only) ================= */
var DB = {};

DB.colors = {
  navy:{name:'Navy',hex:'#1F2A44'}, black:{name:'Black',hex:'#1E1E20'}, white:{name:'White',hex:'#F4F2EC'},
  olive:{name:'Olive',hex:'#4A5240'}, red:{name:'Red',hex:'#9E2B2B'}, maroon:{name:'Maroon',hex:'#5C1F27'},
  sky:{name:'Sky Blue',hex:'#9DB8D3'}, pink:{name:'Pink',hex:'#E3B7B9'}, khaki:{name:'Khaki',hex:'#C3A97E'},
  charcoal:{name:'Charcoal',hex:'#3A3B3E'}, ecru:{name:'Ecru',hex:'#E6DCC8'}, bottle:{name:'Bottle Green',hex:'#1F4A3A'},
  grey:{name:'Grey Melange',hex:'#9A9A9A'}, sand:{name:'Sand',hex:'#CDBB9C'}, mustard:{name:'Mustard',hex:'#C99A2E'},
  brown:{name:'Brown',hex:'#6B4A32'}, mixed:{name:'Mixed',hex:'#7D8A96'}
};

DB.colorNotes = {
  navy:'Deep navy. Can look almost black in low light — see the daylight photo.',
  black:'True black, no blue tint.', white:'Clean white, slightly soft — not optic bright.',
  olive:'Muted army green. Looks a little browner indoors.', red:'Rich brick red, not bright fire-engine red.',
  sky:'Soft pale blue, classic office shade.', khaki:'Warm sandy khaki.', charcoal:'Deep grey, not black.',
  ecru:'Natural off-white with a warm tone.', bottle:'Dark bottle green.', maroon:'Deep wine maroon.'
};

DB.categories = [
  {id:'polos',   name:'Polos',    bn:'পোলো',     garment:'polo',    group:'top',    chart:'polo-regular', blurb:'Piqué, knit and jersey polos in regular and slim fits.'},
  {id:'tshirts', name:'T-Shirts', bn:'টি-শার্ট',  garment:'tee',     group:'top',    chart:'tee-regular',  blurb:'Everyday cotton tees — crew, pocket and heavyweight.'},
  {id:'shirts',  name:'Shirts',   bn:'শার্ট',     garment:'shirt',   group:'top',    chart:'shirt-regular',blurb:'Oxford and linen-blend shirts for office and weekends.'},
  {id:'panjabi', name:'Panjabi',  bn:'পাঞ্জাবি',  garment:'panjabi', group:'top',    chart:'panjabi-classic', blurb:'Classic cotton panjabi for Eid, Puja and every celebration.'},
  {id:'trousers',name:'Trousers', bn:'ট্রাউজার',  garment:'trouser', group:'bottom', chart:'chino-slim',   blurb:'Slim chinos and relaxed twill trousers.'},
  {id:'hoodies', name:'Hoodies',  bn:'হুডি',      garment:'hoodie',  group:'top',    chart:'hoodie-regular', blurb:'Heavyweight hoodies built for Bangladeshi winters.'},
  {id:'extras',  name:'Extras',   bn:'অন্যান্য',  garment:'socks',   group:'acc',    chart:null, hidden:true, blurb:'Socks and belts.'}
];

/* stock helper: s(S,M,L,XL,XXL) */
function _s(a,b,c,d,e){return {S:a,M:b,L:c,XL:d,XXL:e};}
function _w(a,b,c,d){return {'30':a,'32':b,'34':c,'36':d};}

DB.products = [
  {id:'essential-pique-polo', freeDelivery:true, name:'Essential Piqué Polo', cat:'polos', collection:'Essentials', price:850, compareAt:0, fit:'Regular fit', chart:'polo-regular',
   colors:['navy','black','white','olive','red'], sizes:['S','M','L','XL','XXL'],
   stock:{navy:_s(5,6,2,4,0), black:_s(4,7,6,3,2), white:_s(3,5,4,4,1), olive:_s(2,4,3,0,1), red:_s(3,2,0,2,1)},
   rating:4.6, reviews:128, tag:'Bestseller', hasModel:true, model:'Model 5\'9" · 68 kg · wears M', template:'T1',
   fabric:'100% combed cotton piqué · 220 GSM', care:'Wash inside out, cold · Do not bleach · Dry in shade',
   desc:'Our everyday polo in breathable cotton piqué. Ribbed collar that stays flat, 2-button placket, side vents.', fitNote:'Fits true to size.'},
  {id:'textured-knit-polo', name:'Textured Knit Polo', cat:'polos', collection:'Knitwear', price:1150, compareAt:0, fit:'Regular fit', chart:'polo-regular',
   colors:['charcoal','ecru','bottle'], sizes:['S','M','L','XL','XXL'],
   stock:{charcoal:_s(3,5,4,2,0), ecru:_s(2,3,3,2,1), bottle:_s(1,4,2,2,0)},
   rating:4.7, reviews:64, tag:'New', hasModel:true, model:'Model 6\'0" · 72 kg · wears L', template:'T2',
   fabric:'100% cotton textured knit · 260 GSM', care:'Hand wash or gentle cycle · Dry flat',
   desc:'A refined knit polo with a soft waffle texture. Dresses up with chinos, down with denim.', fitNote:'Fits true to size.'},
  {id:'contrast-collar-polo', name:'Contrast Collar Polo', cat:'polos', collection:'Essentials', price:950, compareAt:1190, fit:'Regular fit', chart:'polo-regular',
   colors:['navy','white','black'], sizes:['S','M','L','XL','XXL'],
   stock:{navy:_s(2,3,3,1,0), white:_s(1,2,2,2,0), black:_s(2,2,1,1,1)},
   rating:4.4, reviews:41, tag:'', hasModel:false, template:'T3',
   fabric:'Cotton piqué with contrast tipping', care:'Wash cold · Iron medium',
   desc:'Classic polo with contrast-tipped collar and cuffs.', fitNote:'Runs slightly small — between sizes, go up.'},
  {id:'jersey-zip-polo', name:'Jersey Zip Polo', cat:'polos', collection:'Weekend', price:1050, compareAt:0, fit:'Slim fit', chart:'polo-slim',
   colors:['black','grey','navy'], sizes:['S','M','L','XL','XXL'],
   stock:{black:_s(3,4,2,2,0), grey:_s(2,3,3,1,0), navy:_s(1,2,2,1,0)},
   rating:4.5, reviews:22, tag:'', hasModel:true, model:'Model 5\'10" · 70 kg · wears M', template:'T1',
   fabric:'Cotton-rich jersey with stretch', care:'Wash cold',
   desc:'Smooth jersey polo with a short zip neck. Slim through the body.', fitNote:'Slim fit — take one size up for a relaxed look.'},
  {id:'striped-rib-polo', name:'Striped Rib Polo', cat:'polos', collection:'Weekend', price:990, compareAt:0, fit:'Regular fit', chart:'polo-regular',
   colors:['navy','mustard'], sizes:['S','M','L','XL','XXL'],
   stock:{navy:_s(2,3,0,2,1), mustard:_s(1,2,0,1,0)},
   rating:4.3, reviews:18, tag:'', hasModel:false, template:'T1',
   fabric:'Ribbed cotton with yarn-dyed stripes', care:'Wash cold · Dry flat',
   desc:'Yarn-dyed stripes on a soft rib knit.', fitNote:'Fits true to size.'},
  {id:'long-sleeve-polo', name:'Long Sleeve Polo', cat:'polos', collection:'Essentials', price:1190, compareAt:0, fit:'Regular fit', chart:'polo-regular',
   colors:['white','navy','olive'], sizes:['S','M','L','XL','XXL'],
   stock:{white:_s(2,3,3,2,1), navy:_s(2,4,3,2,0), olive:_s(1,2,2,1,0)},
   rating:4.5, reviews:27, tag:'New', hasModel:false, template:'T1',
   fabric:'Cotton piqué · long sleeves with ribbed cuffs', care:'Wash cold',
   desc:'The Essential polo with long sleeves for cooler evenings.', fitNote:'Fits true to size.'},

  {id:'everyday-crew-tee', name:'Everyday Crew T-Shirt', cat:'tshirts', collection:'Essentials', price:550, compareAt:0, fit:'Regular fit', chart:'tee-regular',
   colors:['white','black','navy','grey'], sizes:['S','M','L','XL','XXL'],
   stock:{white:_s(8,9,7,6,3), black:_s(6,8,8,5,3), navy:_s(4,6,5,4,2), grey:_s(3,5,4,3,2)},
   rating:4.6, reviews:210, tag:'Bestseller', hasModel:true, model:'Model 5\'9" · 68 kg · wears M', template:'T1',
   fabric:'100% cotton single jersey · 180 GSM', care:'Machine wash cold',
   desc:'The tee you reach for every day. Soft, breathable, keeps its shape.', fitNote:'Fits true to size.'},
  {id:'heavy-cotton-tee', name:'Heavy Cotton Tee', cat:'tshirts', collection:'Essentials', price:650, compareAt:0, fit:'Relaxed fit', chart:'tee-regular',
   colors:['ecru','black','olive'], sizes:['S','M','L','XL','XXL'],
   stock:{ecru:_s(3,4,4,3,2), black:_s(4,5,5,4,2), olive:_s(2,3,3,2,1)},
   rating:4.7, reviews:88, tag:'', hasModel:false, template:'T1',
   fabric:'Heavyweight cotton · 240 GSM', care:'Machine wash cold',
   desc:'A thick, structured tee with a slightly boxy shape.', fitNote:'Relaxed fit — size down for a closer fit.'},
  {id:'pocket-tee', name:'Pocket Tee', cat:'tshirts', collection:'Weekend', price:600, compareAt:0, fit:'Regular fit', chart:'tee-regular',
   colors:['sky','white','sand'], sizes:['S','M','L','XL','XXL'],
   stock:{sky:_s(2,3,3,2,1), white:_s(3,3,2,2,1), sand:_s(1,2,2,1,0)},
   rating:4.4, reviews:35, tag:'', hasModel:false, template:'T1',
   fabric:'Cotton slub jersey', care:'Machine wash cold', desc:'Easy pocket tee in a soft slub cotton.', fitNote:'Fits true to size.'},

  {id:'oxford-cotton-shirt', name:'Oxford Cotton Shirt', cat:'shirts', collection:'Office', price:1250, compareAt:0, fit:'Regular fit', chart:'shirt-regular',
   colors:['sky','white','pink'], sizes:['S','M','L','XL','XXL'],
   stock:{sky:_s(3,4,5,3,1), white:_s(4,5,5,4,2), pink:_s(1,2,2,1,0)},
   rating:4.6, reviews:96, tag:'', hasModel:true, model:'Model 5\'10" · 72 kg · wears L', template:'T1',
   fabric:'100% cotton Oxford weave', care:'Wash cold · Iron medium',
   desc:'Button-down Oxford shirt that works from office to dinner.', fitNote:'Fits true to size.'},
  {id:'linen-blend-shirt', name:'Linen Blend Shirt', cat:'shirts', collection:'Weekend', price:1450, compareAt:1690, fit:'Relaxed fit', chart:'shirt-regular',
   colors:['white','sand','olive'], sizes:['S','M','L','XL','XXL'],
   stock:{white:_s(2,3,3,2,1), sand:_s(2,2,3,1,0), olive:_s(1,2,1,1,0)},
   rating:4.5, reviews:31, tag:'', hasModel:false, template:'T2',
   fabric:'55% linen, 45% cotton', care:'Wash cold · Line dry', desc:'Breathable linen-cotton for hot days.', fitNote:'Relaxed fit.'},

  {id:'classic-cotton-panjabi', name:'Classic Cotton Panjabi', cat:'panjabi', collection:'Eid Edit', price:1850, compareAt:0, fit:'Classic fit', chart:'panjabi-classic',
   colors:['white','sky','maroon'], sizes:['S','M','L','XL','XXL'],
   stock:{white:_s(3,5,5,4,2), sky:_s(2,3,4,2,1), maroon:_s(1,3,3,2,1)},
   rating:4.8, reviews:73, tag:'Eid edit', hasModel:true, model:'Model 5\'9" · 70 kg · wears L', template:'T2',
   fabric:'Fine cotton voile with self-stripe', care:'Gentle wash · Iron low',
   desc:'A soft, breathable panjabi with a neat mandarin collar.', fitNote:'Classic fit, knee length.'},

  {id:'slim-chino-trousers', name:'Slim Chino Trousers', cat:'trousers', collection:'Office', price:1450, compareAt:0, fit:'Slim fit', chart:'chino-slim',
   colors:['khaki','navy','charcoal'], sizes:['30','32','34','36'],
   stock:{khaki:_w(3,4,3,0), navy:_w(2,3,3,1), charcoal:_w(2,2,2,1)},
   rating:4.5, reviews:59, tag:'', hasModel:true, model:'Model 5\'10" · 70 kg · wears 32', template:'T1',
   fabric:'Cotton twill with 2% stretch', care:'Wash cold · Iron medium',
   desc:'Slim chinos with a touch of stretch. Tapered leg, 4 pockets.', fitNote:'Fits true to waist size.'},
  {id:'relaxed-twill-trousers', name:'Relaxed Twill Trousers', cat:'trousers', collection:'Weekend', price:1350, compareAt:1600, fit:'Relaxed fit', chart:'chino-slim',
   colors:['olive','black'], sizes:['30','32','34','36'],
   stock:{olive:_w(2,3,2,1), black:_w(3,3,3,2)},
   rating:4.3, reviews:19, tag:'', hasModel:false, template:'T1',
   fabric:'Brushed cotton twill', care:'Wash cold', desc:'Easy relaxed trousers with a soft brushed finish.', fitNote:'Relaxed through the leg.'},

  {id:'heavyweight-hoodie', name:'Heavyweight Hoodie 320 GSM', cat:'hoodies', collection:'Winter 2026', price:1650, compareAt:2100, fit:'Regular fit', chart:'hoodie-regular',
   colors:['black','grey','olive'], sizes:['S','M','L','XL','XXL'],
   stock:{black:_s(2,4,4,3,0), grey:_s(2,3,3,2,0), olive:_s(1,2,2,1,0)},
   rating:4.7, reviews:142, tag:'Winter 2026', hasModel:true, model:'Model 5\'9" · 72 kg · wears L', template:'T1',
   fabric:'320 GSM cotton fleece · 80% cotton, 20% polyester', care:'Wash inside out, cold',
   desc:'Thick brushed fleece, double-layer hood, kangaroo pocket.', fitNote:'Fits true to size.'},

  {id:'cotton-socks-3', name:'Cotton Socks, 3 pairs', cat:'extras', collection:'Extras', price:350, compareAt:0, fit:'One size', chart:null,
   colors:['mixed'], sizes:['One size'], stock:{mixed:{'One size':40}}, rating:4.5, reviews:51, tag:'', hasModel:false, template:'T1',
   fabric:'Combed cotton with stretch', care:'Machine wash', desc:'Soft everyday socks, pack of 3.', fitNote:'Fits UK 6–10.'},
  {id:'leather-look-belt', name:'Classic Leather-look Belt', cat:'extras', garment:'belt', collection:'Extras', price:650, compareAt:0, fit:'One size', chart:null,
   colors:['brown'], sizes:['One size'], stock:{brown:{'One size':20}}, rating:4.2, reviews:12, tag:'', hasModel:false, template:'T1',
   fabric:'PU with metal buckle', care:'Wipe clean', desc:'Smart belt that goes with chinos and denim.', fitNote:'Adjustable 30–38.'}
];

DB.sizeCharts = {
  'polo-regular':   {name:'Polo · Regular fit', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:4, defaultFor:['Polos'],
                     rows:{S:[38,27,16.5,7.5], M:[40,28,17,8], L:[42,29,18,8.25], XL:[44,30,19,8.5], XXL:[46,31,20,8.75]}},
  'polo-slim':      {name:'Polo · Slim fit', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:2, defaultFor:['Polos › Slim'],
                     rows:{S:[37,27,16,7.5], M:[39,28,16.5,7.75], L:[41,29,17.5,8], XL:[43,30,18.5,8.25], XXL:[45,31,19.5,8.5]}},
  'tee-regular':    {name:'T-shirt · Regular', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:4, defaultFor:['T-Shirts'],
                     rows:{S:[38,27,17,7.5], M:[40,28,17.5,8], L:[42,29,18.5,8.25], XL:[44,30,19.5,8.5], XXL:[46,31,20.5,9]}},
  'shirt-regular':  {name:'Shirt · Regular', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:5, defaultFor:['Shirts'],
                     rows:{S:[39,28.5,17,24], M:[41,29.5,17.5,24.5], L:[43,30.5,18,25], XL:[45,31.5,18.5,25.5], XXL:[47,32.5,19,26]}},
  'panjabi-classic':{name:'Panjabi · Classic', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:5, defaultFor:['Panjabi'],
                     rows:{S:[39,40,17,23.5], M:[41,41,17.5,24], L:[43,42,18,24.5], XL:[45,43,18.5,25], XXL:[47,44,19,25.5]}},
  'hoodie-regular': {name:'Hoodie · Regular', type:'top', fields:['Chest','Length','Shoulder','Sleeve'], ease:6, defaultFor:['Hoodies'],
                     rows:{S:[40,26.5,17.5,24], M:[42,27.5,18,24.5], L:[44,28.5,19,25], XL:[46,29.5,20,25.5], XXL:[48,30.5,21,26]}},
  'chino-slim':     {name:'Chino · Slim', type:'bottom', fields:['Waist','Hip','Thigh','Length','Leg opening'], ease:1, defaultFor:['Trousers'],
                     rows:{'30':[30,39,23,40,13], '32':[32,41,24,40.5,13.5], '34':[34,43,25,41,14], '36':[36,45,26,41.5,14.5]}}
};

DB.combos = [
  {id:'polo-duo', name:'Polo Duo', blurb:'Any 2 colours of our Essential Piqué Polo', items:['essential-pique-polo','essential-pique-polo'], price:1500, autoApply:true, active:true, template:'C1'},
  {id:'office-trio', name:'Office Trio', blurb:'Oxford shirt + slim chino + knit polo', items:['oxford-cotton-shirt','slim-chino-trousers','textured-knit-polo'], price:3100, autoApply:true, active:true, template:'C1'}  /* R16 (15): C1 for every combo; C2 stays as a switch in Admin */,
  {id:'polo-chino', name:'Polo + Chino', blurb:'Essential polo with slim chinos', items:['essential-pique-polo','slim-chino-trousers'], price:2050, autoApply:false, active:true, template:'C1'}
];

/* what customers may combine themselves (owner-controlled) */
DB.customSetRules = [
  {id:'any-polos', name:'Any polos', mode:'category', categories:['polos'], skus:[], tiers:{2:1500, 3:2100}, active:true},
  {id:'any-tees',  name:'Any T-shirts', mode:'category', categories:['tshirts'], skus:[], tiers:{2:950, 3:1350}, active:true},
  {id:'office-skus', name:'Shirt + chino (selected styles)', mode:'sku', categories:[], skus:['oxford-cotton-shirt','linen-blend-shirt','slim-chino-trousers'], tiers:{2:2400}, active:false}
];

DB.rules = [
  {id:'exchange', topic:'Exchange', title:'Size exchange only', status:'Active', version:3, edited:'16 Oct',
   short:'Size exchange within {windowHours} hours of delivery · delivery charge applies · free if our mistake',
   full:'You can exchange for a different SIZE within {windowHours} hours after delivery, from My account → Orders.\nItems must be unworn and unwashed, with tags on.\nColour changes or "didn\'t like it" are not exchangeable.\nIf the item is faulty, damaged or we sent the wrong item, we replace it free of charge.\nExchange delivery charge: ৳{chargeInside} inside Dhaka, ৳{chargeOutside} outside. No charge if the mistake is ours.\nIf the new item costs more, pay the difference on delivery. If it costs less, the difference goes to your wallet.',
   settings:{windowHours:72, chargeInside:80, chargeOutside:120, perItem:1},
   settingLabels:{windowHours:'Exchange window (hours)', chargeInside:'Exchange charge inside Dhaka (৳)', chargeOutside:'Exchange charge outside Dhaka (৳)', perItem:'Exchanges per item'},
   applies:['All categories'], except:['Boxers & underwear'], shownOn:['Product page','Bag','Checkout','Thank you','My account','SMS & WhatsApp','EXTAS AI','FAQ']},
  {id:'no-return', topic:'Exchange', title:'No returns after delivery', status:'Active', version:2, edited:'16 Oct',
   short:'Once delivered, items can be exchanged for size — not returned or refunded',
   full:'After you receive an order, returns and refunds are not available.\nYou can still exchange for a different size (see the exchange rule), or get a free replacement if the item is faulty.\nAt the door, you may refuse the parcel; a return delivery charge applies unless the mistake is ours.',
   settings:{}, settingLabels:{}, applies:['All categories'], except:[], shownOn:['Product page','Checkout','My account','EXTAS AI','FAQ']},
  {id:'exchange-order', topic:'Exchange', title:'Exchange options order', status:'Active', version:1, edited:'16 Oct',
   short:'Same item first → same style other colours → same category → other categories',
   full:'When you ask for a new size we check stock in this order, and you choose from the first group that has stock:\n1. The same item in the same colour.\n2. The same item in another colour.\n3. Another product in the same category (same measurements).\n4. Only if nothing above is in stock: products from other categories.\nThese are the only options available for an exchange.',
   settings:{}, settingLabels:{}, applies:['All categories'], except:[], shownOn:['My account','EXTAS AI']},
  {id:'hygiene', topic:'Exchange', title:'No exchange on hygiene items', status:'Active', version:1, edited:'12 Oct',
   short:'Boxers and underwear cannot be exchanged', full:'For hygiene reasons, boxers and underwear cannot be exchanged unless faulty.',
   settings:{}, settingLabels:{}, applies:['Boxers','Underwear'], except:[], shownOn:['Product page','My account']},
  {id:'delivery', topic:'Delivery', title:'Delivery charge', status:'Active', version:4, edited:'10 Oct',
   short:'Inside Dhaka ৳{inside} · Outside Dhaka ৳{outside} · Free over ৳{freeOver}',
   full:'Inside Dhaka City: ৳{inside}, within {insideHours} hours.\nOutside Dhaka City: ৳{outside}, within {outsideHours} hours.\nFree delivery on orders over ৳{freeOver}.\nIf you refuse the parcel at the door, a return delivery charge applies. No charge if the mistake is ours.',
   settings:{inside:80, sub:100, outside:120, freeOver:1500, freeCampaign:'', insideDays:'1–2', subDays:'2–3', outsideDays:'2–4', subMode:'own', insideHours:'24–48', subHours:'24–48', outsideHours:'48–72', promise:'You\'ll get your order within {hours} hours', promiseAny:'Delivery anywhere in Bangladesh within {hours} hours'},
   settingLabels:{insideHours:'Inside Dhaka delivery time (hours)', subHours:'Dhaka sub-area delivery time (hours)', outsideHours:'Outside Dhaka delivery time (hours)', promise:'Delivery promise sentence ({hours} = the hours)', promiseAny:'Delivery promise before the address is known', inside:'Inside Dhaka (৳)', sub:'Dhaka sub-area (৳)', subDays:'Dhaka sub-area days', subMode:'Sub-area charge: own / city / outside', outside:'Outside Dhaka (৳)', freeOver:'Free delivery over (৳)', insideDays:'Inside Dhaka days', outsideDays:'Outside Dhaka days'},
   applies:['All categories'], except:[], shownOn:['Product page','Bag','Checkout','FAQ','EXTAS AI']},
  {id:'order-edit', topic:'Orders', title:'Order edits', status:'Active', version:1, edited:'16 Oct',
   short:'Edit your order up to {maxEdits} times before we start processing it',
   full:'Log in → My orders → Edit order. You can change address, phone or sizes until the order goes into processing, up to {maxEdits} times.',
   settings:{maxEdits:2}, settingLabels:{maxEdits:'Edits allowed per order'}, applies:['All orders'], except:[], shownOn:['Thank you','My account']},
  {id:'custom-sets', topic:'Combos', title:'What customers can combine', status:'Active', version:2, edited:'16 Oct',
   short:'Any 2 polos ৳1,500 · Any 3 ৳2,100 · Any 2 tees ৳950',
   full:'Customers can build their own set only inside these groups:\nPolos (category ↔ category): 2 for ৳1,500, 3 for ৳2,100.\nT-shirts: 2 for ৳950, 3 for ৳1,350.\nSet prices are not combined with other offers.',
   settings:{}, settingLabels:{}, applies:['Polos','T-Shirts'], except:[], shownOn:['Product page','Build a set','Bag']},
  {id:'reviews', topic:'Reviews', title:'Reviews & rewards', status:'Active', version:1, edited:'16 Oct',
   short:'Reviews appear after our check · photo review reward ৳{photoReward}',
   full:'Only buyers can review, after delivery.\nEvery review is checked before it appears.\nApproved photo review: ৳{photoReward} wallet credit. Approved Facebook share link: ৳{fbReward}.',
   settings:{photoReward:50, fbReward:50, rewardsOn:'Yes'}, settingLabels:{photoReward:'Photo review reward (৳)', fbReward:'Facebook share reward (৳)', rewardsOn:'Rewards on'},
   applies:['All products'], except:[], shownOn:['My account']},
  {id:'referral', topic:'Offers', title:'Referral', status:'Active', version:1, edited:'16 Oct',
   short:'Give ৳{give}, get ৳{get} after your friend\'s first delivered order',
   full:'Share your code. Your friend gets ৳{give} off the first order; you get ৳{get} in your wallet after it is delivered. One reward per new phone number and address.',
   settings:{give:100, get:100, on:'Yes'}, settingLabels:{give:'Friend gets (৳)', get:'You get (৳)', on:'Referral on'},
   applies:['Logged-in customers'], except:[], shownOn:['My account']},
  {id:'festive', topic:'Delivery', title:'Eid delivery cutoff', status:'Draft', version:1, edited:'16 Oct',
   short:'Order by {cutoff} for delivery before Eid (inside Dhaka)',
   full:'Inside Dhaka: order by {cutoff}. Outside Dhaka: order by {cutoffOutside}. Orders after that arrive after Eid.',
   settings:{cutoff:'Wed 9 pm', cutoffOutside:'Tue 9 pm'}, settingLabels:{cutoff:'Cutoff inside Dhaka', cutoffOutside:'Cutoff outside Dhaka'},
   applies:['All categories'], except:[], shownOn:['Announcement bar','Product page','Checkout']}
];

DB.ai = {
  master:true, costSaver:true, monthlyCap:3000, spent:1240,
  providers:[
    {id:'anthropic', name:'Anthropic', connected:true, models:['Claude Opus 5.5','Claude Sonnet 5.5','Claude Haiku 5.5']},
    {id:'openai', name:'OpenAI', connected:false, models:['GPT-5','GPT-5 mini']},
    {id:'google', name:'Google', connected:false, models:['Gemini 2.5 Pro','Gemini 2.5 Flash']},
    {id:'openrouter', name:'OpenRouter (many companies)', connected:false, models:['Any model listed on OpenRouter']},
    {id:'local', name:'Your own server (Ollama)', connected:false, models:['Llama','Qwen']}
  ],
  agents:[
    {id:'support', name:'Customer Support Agent', what:'Answers WhatsApp and site chat from your rules and catalogue', on:true, keepOn:false, provider:'anthropic', model:'Claude Sonnet 5.5', schedule:'Always on', cap:1200, fallback:'Messages go to your team inbox with an instant auto-reply.'},
    {id:'size', name:'Size Advisor', what:'Learns from reviews and exchanges to tune Find my size', on:true, keepOn:false, provider:'anthropic', model:'Claude Haiku 5.5', schedule:'Every night 2 am', cap:150, fallback:'Size charts and fit rules keep working — customers see no difference.'},
    {id:'address', name:'Address Reader', what:'Reads free-text addresses for courier zones', on:true, keepOn:false, provider:'anthropic', model:'Claude Haiku 5.5', schedule:'On every order', cap:200, fallback:'Map lookup + area list; unsure orders get an "Address check" flag.'},
    {id:'reviews', name:'Review Screener', what:'Pre-checks reviews for spam, abuse and phone numbers', on:true, keepOn:false, provider:'anthropic', model:'Claude Haiku 5.5', schedule:'On every review', cap:80, fallback:'All reviews wait in your approval queue.'},
    {id:'seo', name:'Product SEO Writer', what:'Drafts product titles, descriptions and meta text', on:true, keepOn:false, provider:'anthropic', model:'Claude Sonnet 5.5', schedule:'When a product is added', cap:300, fallback:'You write them in the product form.'},
    {id:'blog', name:'Blog Writer', what:'Researches keywords and writes blog posts for Google', on:false, keepOn:true, provider:'anthropic', model:'Claude Opus 5.5', schedule:'Mon & Thu 9 am', cap:600, fallback:'Paused — scheduled posts stay scheduled.', perRun:true},
    {id:'research', name:'Research Agent', what:'Checks competitor prices and trends weekly', on:false, keepOn:true, provider:'anthropic', model:'Claude Sonnet 5.5', schedule:'Every Monday 8 am', cap:200, fallback:'Paused.', perRun:true},
    {id:'notes', name:'Notes Agent', what:'Summarises calls and chats into customer notes', on:true, keepOn:true, provider:'anthropic', model:'Claude Haiku 5.5', schedule:'After every chat', cap:100, fallback:'Team writes notes by hand.'},
    {id:'report', name:'Daily Report Agent', what:'Adds comments to the 10 pm Telegram report', on:true, keepOn:false, provider:'anthropic', model:'Claude Sonnet 5.5', schedule:'Every day 10 pm', cap:90, fallback:'Report still arrives with all numbers.'},
    {id:'fraud', name:'Fraud Analyst', what:'Adds extra signals to the fraud score', on:true, keepOn:false, provider:'anthropic', model:'Claude Haiku 5.5', schedule:'On every order', cap:120, fallback:'Rule-based fraud score keeps working.'},
    {id:'landing', name:'Landing Page Builder', what:'Builds ad landing pages from a product', on:true, keepOn:false, provider:'anthropic', model:'Claude Sonnet 5.5', schedule:'When you click Generate', cap:250, fallback:'Templates still work — you fill the text yourself.', perRun:true},
    {id:'twosize', name:'2-Size Follow-up', what:'Chats with customers who ordered two sizes', on:true, keepOn:false, provider:'anthropic', model:'Claude Haiku 5.5', schedule:'After such orders', cap:40, fallback:'Template WhatsApp message with reply buttons still goes out.'}
  ],
  services:[
    {id:'sms', name:'SMS', used:620, cap:1500, atLimit:'Only order & tracking SMS; offers pause.'},
    {id:'wa', name:'WhatsApp messages', used:410, cap:1000, atLimit:'Replies inside open chats only; broadcasts pause.'},
    {id:'maps', name:'Address & map lookups', used:90, cap:500, atLimit:'Area list matching + flag.'}
  ]
};

DB.landingTemplates = {
  top:[
    {id:'offer-first', name:'Offer first', note:'Big offer, combo price, order form above the fold', score:'Best for cold ad traffic'},
    {id:'fit-first', name:'Fit & size first', note:'Find my size and fit reviews first, then offer', score:'Lowest exchanges'},
    {id:'story', name:'Story & fabric', note:'Video, fabric close-ups, then the form', score:'Best for premium styles'},
    {id:'combo-push', name:'Combo push', note:'Shows the 2-pack and 3-pack price ladder', score:'Highest order value'}
  ],
  bottom:[
    {id:'offer-first', name:'Offer first', note:'Price, waist sizes and order form first', score:'Best for cold ad traffic'},
    {id:'fit-first', name:'Waist & fit first', note:'Waist finder, inseam and fit reviews first', score:'Lowest exchanges'},
    {id:'story', name:'Story & fabric', note:'Stretch, fabric and styling looks', score:'Best for premium styles'}
  ]
};
DB.landingCategories = [
  {id:'polos',name:'Polos',group:'top'},{id:'tshirts',name:'T-Shirts',group:'top'},{id:'shirts',name:'Shirts',group:'top'},
  {id:'panjabi',name:'Panjabi',group:'top'},{id:'hoodies',name:'Hoodies',group:'top'},{id:'trousers',name:'Chinos & trousers',group:'bottom'},
  {id:'denim',name:'Denim',group:'bottom',soon:true},{id:'sweaters',name:'Sweaters',group:'top',soon:true},{id:'sweatshirts',name:'Sweatshirts',group:'top',soon:true}
];

DB.reviewsSample = [
  {name:'Rakib H.', h:'5\'9"', w:'70 kg', size:'L', fit:'Just right', stars:5, text:'Used Find my size and took L — perfect fit. Colour is exactly like the daylight photo.', photo:true},
  {name:'Tanvir A.', h:'5\'7"', w:'64 kg', size:'M', fit:'Just right', stars:5, text:'Collar stays flat after many washes. Ordering another colour.', photo:false},
  {name:'Sabbir R.', h:'5\'11"', w:'82 kg', size:'XL', fit:'A bit small', stars:4, text:'Good fabric. I have broad shoulders, XL is snug — go up if you like it loose.', photo:true},
  {name:'Mehedi K.', h:'5\'10"', w:'74 kg', size:'L', fit:'Just right', stars:5, text:'Ordered Thursday, got it Saturday in Uttara. Cash on delivery, no trouble.', photo:true},
  {name:'Arif S.', h:'5\'6"', w:'61 kg', size:'M', fit:'Just right', stars:4, text:'Good cotton, holds the shape. Sleeve a touch long for me but fine.', photo:false},
  {name:'Nahid I.', h:'6\'0"', w:'82 kg', size:'XL', fit:'Just right', stars:5, text:'XL fits properly, not tight at the chest like other local brands.', photo:true},
  {name:'Shuvo D.', h:'5\'8"', w:'68 kg', size:'L', fit:'Just right', stars:5, text:'Took the size swap once — they exchanged it in two days, no questions.', photo:false},
  {name:'Imran H.', h:'5\'9"', w:'71 kg', size:'L', fit:'Just right', stars:5, text:'Bought the set. Paid less than buying the two separately.', photo:true},
  {name:'Faisal R.', h:'5\'7"', w:'66 kg', size:'M', fit:'Runs small', stars:4, text:'Ordered M, a little snug. Next time I will take L as the chart suggested.', photo:false},
  {name:'Tahsin M.', h:'5\'11"', w:'78 kg', size:'XL', fit:'Just right', stars:5, text:'Colour in the photo is the colour that arrived. That is rare here.', photo:true},
  {name:'Rifat A.', h:'5\'5"', w:'58 kg', size:'S', fit:'Just right', stars:5, text:'Small actually fits small. Finally a brand that does not start at M.', photo:false},
  {name:'Jubayer N.', h:'5\'10"', w:'76 kg', size:'L', fit:'Just right', stars:5, text:'Delivered to Chattogram in three days. Rider called before coming.', photo:true}
];

/* Journal posts for the home page slider. Newest last — the home page shows
   the last ten, so a new post appears at the front of the slider on its own. */
DB.journal = [
  {t:'How to pick your polo size', e:'Size guide \u00b7 3 min read', x:'Measure a polo you already own, or just give us height and weight. Here is what the chest and length numbers really mean.', p:'essential-pique-polo', c:'navy'},
  {t:'Oxford shirt: office to dinner', e:'Style \u00b7 3 min read', x:'One shirt, three ways \u2014 with chinos for work, over a tee on Friday, sleeves rolled for dinner.', p:'oxford-cotton-shirt', c:'sky'},
  {t:'Cotton GSM, in plain words', e:'Fabric \u00b7 4 min read', x:'180, 220, 320 GSM \u2014 what the number changes in how a tee or hoodie feels, and which one suits Dhaka weather.', p:'heavy-cotton-tee', c:'ecru'},
  {t:'Chino or twill: which trouser', e:'Fit guide \u00b7 3 min read', x:'Slim chinos hold a crease and suit the office. Relaxed twill breathes more. How to choose by waist and use.', p:'slim-chino-trousers', c:'khaki'},
  {t:'What to wear for Eid 2026', e:'Style \u00b7 4 min read', x:'From a crisp panjabi for prayers to an easy polo for family visits \u2014 five outfits for the whole Eid weekend.', p:'classic-cotton-panjabi', c:'white'},
  {t:'Panjabi length and sleeve guide', e:'Size guide \u00b7 3 min read', x:'Knee length or a touch below? Sleeve to the wrist bone? The three measurements that decide how a panjabi sits.', p:'classic-cotton-panjabi', c:'maroon'},
  {t:'Layering for a Dhaka winter', e:'Winter \u00b7 4 min read', x:'It never gets truly cold, so one heavy layer beats three thin ones. Tee, knit polo, hoodie \u2014 in that order.', p:'heavyweight-hoodie', c:'black'},
  {t:'Washing dark colours so they stay dark', e:'Care \u00b7 2 min read', x:'Cold water, inside out, dry in shade. Four habits that keep navy and black from going grey in six months.', p:'everyday-crew-tee', c:'black'},
  {t:'Five ways to wear a knit polo', e:'Style \u00b7 3 min read', x:'The knit polo is the one top that works at a wedding, at work and at a tea stall. Here is how.', p:'textured-knit-polo', c:'bottle'},
  {t:'Why we only exchange for size', e:'Behind EXTAS \u00b7 3 min read', x:'Size exchange in 72 hours, no returns \u2014 why that policy keeps our prices where they are, explained honestly.', p:'long-sleeve-polo', c:'white'},
  {t:'Linen in the hot months', e:'Fabric \u00b7 3 min read', x:'Linen creases, and that is the point. How a linen-cotton blend keeps the look neat while staying cool.', p:'linen-blend-shirt', c:'sand'},
  {t:'Building a ten-piece menswear capsule', e:'Style \u00b7 5 min read', x:'Ten pieces that make about thirty outfits \u2014 the shortlist we would buy first, in order.', p:'pocket-tee', c:'sky'}
];

DB.campaigns = ['Meta · Polo Duo · Oct', 'Meta · Winter hoodies', 'TikTok · Eid panjabi', 'Google · Polo shirts BD'];
DB.whatsapp = '8801XXXXXXXXX';
DB.hotline = '09XXX-XXXXXX';
/* R15 wave 1 (bugs 6, 9). The shop's contact, legal and social details — ONE
   place, which the dashboard writes (Settings › Shop details; an owner edit
   lands in ST.siteOverride). An EMPTY value hides its line everywhere: the
   footer, Contact, Terms, Privacy and the invoice never print a placeholder
   and nothing is invented here. */
DB.site = {
  supportEmail:'', address:'', registeredName:'', dbid:'', tradeLicence:'',
  social:{ facebook:'', instagram:'', youtube:'', tiktok:'' },
  hours:'10 am – 10 pm, every day'
};
