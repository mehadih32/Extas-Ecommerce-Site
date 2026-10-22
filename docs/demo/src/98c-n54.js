/* =====================================================================
   98c-n54.js — owner's review of V12.1 (ROUND15 Note 54, CN-012), 20 Oct.
   Sawdagor সওদাগর · Shilpi শিল্পী.
     #1  desktop footer: a small line icon on every link
     #2  desktop footer: real social icons (list from Site builder › Footer)
     #6  checkout words + field order are Admin › Settings rows
     #13 payment methods at checkout: switches and lists in Admin › Settings
   Every value has its row in Admin › Settings (English + Bengali). The phone
   footer and the phone checkout are untouched except for wording.
   ===================================================================== */

/* ---------- shop options (defaults) ---------- */
if(typeof SHOP_OPT_DEF !== 'undefined'){
  var N54_DEF = {
    'co.fieldOrder'   : 'name,phone,address',
    'co.pay.cod'      : true,
    'co.pay.mb'       : true,
    'co.pay.mbList'   : 'bkash,nagad,rocket',
    'co.pay.card'     : true,
    'co.pay.cardList' : 'visa,mastercard,amex,bank',
    'co.pay.online'   : true,
    'co.pay.gateway'  : 'SSLCommerz',
    'ftr.deskIcons'   : true
  };
  Object.keys(N54_DEF).forEach(function(k){ if(SHOP_OPT_DEF[k] === undefined) SHOP_OPT_DEF[k] = N54_DEF[k]; });
}
/* the new payment ids read well everywhere an order is shown */
(function(){
  try{ if(typeof AO_PAY !== 'undefined'){ AO_PAY.rocket = 'Rocket'; AO_PAY.upay = 'Upay'; AO_PAY.online = 'Online'; } }catch(e){}
  try{ if(typeof INVOICE_TPL !== 'undefined' && INVOICE_TPL.methods){ INVOICE_TPL.methods.rocket = 'Rocket'; INVOICE_TPL.methods.upay = 'Upay'; INVOICE_TPL.methods.online = 'Online payment'; } }catch(e){}
  if(typeof acc_payLabel === 'function'){ var a0 = acc_payLabel; acc_payLabel = function(p){ return ({rocket:'Rocket', upay:'Upay', online:'Online payment'})[p] || a0(p); }; }
})();

/* ---------- Admin › Settings rows ---------- */
setTimeout(function(){
  if(typeof ZS_SETTINGS === 'undefined' || typeof ZS_GROUPS === 'undefined' || typeof zs_S !== 'function') return;
  var grp = function(id, en, bn){ if(!ZS_GROUPS.some(function(g){ return g[0] === id; })){ var at = -1; ZS_GROUPS.forEach(function(g, i){ if(g[0] === 'install') at = i; }); var G = [id, en, bn, 'Note 54']; if(at >= 0) ZS_GROUPS.splice(at, 0, G); else ZS_GROUPS.push(G); } };
  grp('n54co', 'Checkout words and field order', 'চেকআউটের লেখা আর ঘরের ক্রম');
  grp('n54pay', 'Payment at checkout', 'চেকআউটে পেমেন্টের উপায়');
  var opt = function(id, g, en, bn, type, where, see, extra){
    var s = {id:'opt.'+id, g:g, en:en, bn:bn, type:type, where:where, see:see || '',
      get:function(){ return OPT(id); }, set:function(v){ optSet(id, type === 'sw' ? !!v : v); },
      def:function(){ return SHOP_OPT_DEF[id]; }, reset:function(){ optReset(id); }};
    if(extra) for(var k in extra) s[k] = extra[k];
    return s;
  };
  /* a checkout word: English + Bengali, each its own row (ST.coLbl) */
  var word = function(k, en, bn){
    var mk = function(key, def, lang){ return {id:'co.lbl.'+key, g:'n54co', en:en+(lang ? ' (Bengali)' : ' (English)'), bn:bn+(lang ? ' — বাংলা' : ' — ইংরেজি'), type:'text', where:'Checkout', see:'#/checkout',
      get:function(){ var o = ST.coLbl || {}; return o[key] != null ? o[key] : def; },
      set:function(v){ ST.coLbl = ST.coLbl || {}; ST.coLbl[key] = v; }, def:function(){ return def; }, reset:function(){ if(ST.coLbl) delete ST.coLbl[key]; }}; };
    return [mk(k, CO_LABELS[k], false), mk('bn.'+k, CO_LABELS_BN[k] || '', true)];
  };
  var rows = [
    opt('co.fieldOrder', 'n54co', 'Order of the three boxes', 'তিনটা ঘরের ক্রম', 'sel', 'Checkout · step 1', '#/checkout',
      {opts:[['name,phone,address', 'Name · Phone · Address (default)'], ['phone,name,address', 'Phone · Name · Address']]})
  ];
  [['heading', 'Step 1 title', 'ধাপ ১-এর শিরোনাম'], ['name', 'Name box label', 'নামের ঘরের লেবেল'], ['phone', 'Phone box label', 'মোবাইলের ঘরের লেবেল'],
   ['phonePh', 'Phone box hint', 'মোবাইলের ঘরের ভেতরের লেখা'], ['address', 'Address box label', 'ঠিকানার ঘরের লেবেল'], ['addressPh', 'Address box hint', 'ঠিকানার ঘরের ভেতরের লেখা'],
   ['delivery', 'Step 2 title', 'ধাপ ২-এর শিরোনাম'], ['payment', 'Step 3 title', 'ধাপ ৩-এর শিরোনাম'], ['note', 'Delivery note label', 'ডেলিভারি নোটের লেবেল'],
   ['confirm', 'Confirm button', 'কনফার্ম বাটন'], ['exch', 'Exchange link at the bottom', 'নিচের বদলের লিংক'], ['terms', 'Terms link at the bottom (empty = none)', 'নিচের শর্তাবলির লিংক (খালি = নেই)'],
   ['helpQ', 'Help box question', 'সাহায্যের বক্সের প্রশ্ন'], ['helpA', 'Help box words', 'সাহায্যের বক্সের লেখা'],
   ['payCod', 'Cash on Delivery name', 'ক্যাশ অন ডেলিভারির নাম'], ['payCodSub', 'Cash on Delivery line', 'ক্যাশ অন ডেলিভারির লাইন'], ['payMb', 'Mobile banking name', 'মোবাইল ব্যাংকিংয়ের নাম'],
   ['payCard', 'Card & bank name', 'কার্ড ও ব্যাংকের নাম'], ['payOnline', 'Online payment name', 'অনলাইন পেমেন্টের নাম'], ['payOnlineSub', 'Online payment line', 'অনলাইন পেমেন্টের লাইন']
  ].forEach(function(w){ rows = rows.concat(word(w[0], w[1], w[2])); });
  rows = rows.concat([
    opt('co.pay.cod', 'n54pay', 'Cash on Delivery', 'ক্যাশ অন ডেলিভারি', 'sw', 'Checkout · payment', '#/checkout'),
    opt('co.pay.mb', 'n54pay', 'Mobile banking', 'মোবাইল ব্যাংকিং', 'sw', 'Checkout · payment', '#/checkout'),
    opt('co.pay.mbList', 'n54pay', 'Wallets shown, in order (bkash, nagad, rocket, upay)', 'কোন কোন ওয়ালেট, ক্রমে (bkash, nagad, rocket, upay)', 'text', 'Checkout · Mobile banking', '#/checkout'),
    opt('co.pay.card', 'n54pay', 'Card & bank', 'কার্ড ও ব্যাংক', 'sw', 'Checkout · payment', '#/checkout'),
    opt('co.pay.cardList', 'n54pay', 'Cards shown, in order (visa, mastercard, amex, bank)', 'কোন কোন কার্ড, ক্রমে (visa, mastercard, amex, bank)', 'text', 'Checkout · Card & bank', '#/checkout'),
    opt('co.pay.online', 'n54pay', 'Online payment (gateway page)', 'অনলাইন পেমেন্ট (গেটওয়ে পেজ)', 'sw', 'Checkout · payment', '#/checkout'),
    opt('co.pay.gateway', 'n54pay', 'Gateway name', 'গেটওয়ের নাম', 'text', 'Checkout · Online payment', '#/checkout'),
    opt('ftr.deskIcons', 'n54pay', 'Desktop footer: small icon before every link', 'ডেস্কটপ ফুটার: প্রতিটা লিংকের আগে ছোট আইকন', 'sw', 'Footer, desktop', '#/', {g:'ownc'})
  ]);
  rows.forEach(function(r){ if(!zs_S(r.id)) ZS_SETTINGS.push(r); });
}, 0);

/* =====================================================================
   #2 · real social marks (filled, 16 px, currentColor). Used by the
   desktop footer, the phone footer and Site builder › Footer. The phone
   footer shows a network only once its address is set, as before.
   ===================================================================== */
var N54_SOC = {
  facebook:'<path d="M13.6 21.5v-8.2h2.8l.4-3.3h-3.2V7.9c0-.9.3-1.6 1.6-1.6h1.7V3.4a22 22 0 0 0-2.5-.1c-2.5 0-4.2 1.5-4.2 4.3V10H7.5v3.3h2.7v8.2Z"/>',
  instagram:'<path fill-rule="evenodd" d="M12 3.2c2.4 0 2.7 0 3.6.1 2.4.1 3.5 1.2 3.6 3.6.1.9.1 1.2.1 3.6v3c0 2.4 0 2.7-.1 3.6-.1 2.4-1.2 3.5-3.6 3.6-.9.1-1.2.1-3.6.1h-3c-2.4 0-2.7 0-3.6-.1-2.4-.1-3.5-1.2-3.6-3.6-.1-.9-.1-1.2-.1-3.6v-3c0-2.4 0-2.7.1-3.6.1-2.4 1.2-3.5 3.6-3.6.9-.1 1.2-.1 3.6-.1Zm0 4.4a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Zm0 1.7a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Zm4.6-2.9a1.05 1.05 0 1 0 0 2.1 1.05 1.05 0 0 0 0-2.1Z"/>',
  youtube:'<path fill-rule="evenodd" d="M21.6 7.3a2.6 2.6 0 0 0-1.8-1.9C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.6 2.6 0 0 0-1.8 1.9A27 27 0 0 0 2 12a27 27 0 0 0 .4 4.7 2.6 2.6 0 0 0 1.8 1.9C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.9A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.7ZM10 15.1V8.9l5.3 3.1Z"/>',
  tiktok:'<path d="M16.4 2.5h-3.2v12.9a2.8 2.8 0 1 1-2.8-2.8c.3 0 .6 0 .8.1V9.4a6.1 6.1 0 1 0 5.2 6V8.8a7.8 7.8 0 0 0 4.3 1.3V6.9a4.4 4.4 0 0 1-4.3-4.4Z"/>',
  x:'<path d="M17.6 3.3h3l-6.6 7.5 7.8 10.3h-6.1l-4.8-6.2-5.4 6.2h-3l7-8L2.1 3.3h6.2l4.3 5.7Zm-1 16h1.7L7.5 5H5.7Z"/>',
  linkedin:'<path d="M4.5 3.5h15a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Zm2.2 6.7v7.4h2.4v-7.4Zm1.2-3.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Zm3.5 3.8v7.4h2.4v-3.9c0-1 .2-2 1.5-2s1.3 1.2 1.3 2.1v3.8H19v-4.3c0-2.1-.5-3.7-2.9-3.7a2.5 2.5 0 0 0-2.3 1.3v-1.1Z"/>',
  pinterest:'<path d="M12 2.5a9.5 9.5 0 0 0-3.5 18.3c0-.8 0-1.7.2-2.5l1.2-5.2s-.3-.6-.3-1.6c0-1.5.9-2.6 1.9-2.6.9 0 1.3.7 1.3 1.5 0 .9-.6 2.2-.9 3.4-.2 1 .5 1.9 1.6 1.9 1.9 0 3.1-2.4 3.1-5.3 0-2.2-1.5-3.8-4.1-3.8a4.7 4.7 0 0 0-4.9 4.7c0 .9.3 1.5.7 2 .2.2.2.3.1.6l-.2.8c-.1.3-.3.3-.5.2-1.4-.6-2-2.1-2-3.8 0-2.8 2.4-6.2 7.1-6.2 3.8 0 6.3 2.8 6.3 5.7 0 3.9-2.2 6.8-5.4 6.8-1.1 0-2.1-.6-2.4-1.2l-.7 2.6c-.2.8-.7 1.7-1.1 2.3A9.5 9.5 0 1 0 12 2.5Z"/>',
  messenger:'<path d="M12 2.5c-5.4 0-9.5 3.9-9.5 9.2 0 2.8 1.1 5.2 3 6.8v3l2.8-1.5c1.1.3 2.4.5 3.7.5 5.4 0 9.5-3.9 9.5-9.2S17.4 2.5 12 2.5Zm1 12.3-2.4-2.6-4.8 2.6L11 9l2.5 2.6L18.2 9Z"/>'
};
function n54Soc(id, px){ return '<svg class="soc-g" width="'+(px||16)+'" height="'+(px||16)+'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'+N54_SOC[id]+'</svg>'; }
(function(){
  if(typeof SOC_LIB === 'undefined') return;
  Object.keys(N54_SOC).forEach(function(id){ if(SOC_LIB[id]) SOC_LIB[id].icon = function(){ return n54Soc(id, 16); }; });
})();
/* WhatsApp joins the default list for the desktop footer only (the phone footer has its own WhatsApp button) */
(function(){
  if(typeof ftrDefault !== 'function') return;
  var d0 = ftrDefault;
  ftrDefault = function(){ var d = d0(); if(d.social && !d.social.some(function(x){ return x.id === 'whatsapp'; })) d.social.push({id:'whatsapp', on:true, url:'', dev:'desk'}); return d; };
  if(typeof ftrSocial === 'function'){ var s0 = ftrSocial; ftrSocial = function(){ var keep = (ftrData().social || []).filter(function(x){ return x && x.dev === 'desk'; }).map(function(x){ return x.id; });
    return s0().filter(function(x){ return keep.indexOf(x.id) < 0; }); }; }
})();
/* desktop footer social row: round marks; a network without an address yet is shown, not linked */
ftrDeskSocial = function(){
  var s = SITE('social') || {};
  return (ftrData().social || []).map(function(x){
    if(!x || x.on === false || x.removed || x.dev === 'phone') return '';
    var L = SOC_LIB[x.id]; if(!L && !x.img) return '';
    var url = String(x.url || s[x.id] || (x.id === 'whatsapp' ? waLink('Hi EXTAS') : '')), name = x.label || (L ? L.label : 'Link');
    var ic = x.img ? '<img class="sb-socimg" src="'+esc(x.img)+'" alt="" width="17" height="17">' : (N54_SOC[x.id] ? n54Soc(x.id, 17) : (x.id === 'whatsapp' ? waGlyph(17) : L.icon()));
    return /^https?:\/\//.test(url)
      ? '<a class="fdr-si fdr-si-'+esc(x.id)+'" href="'+esc(url)+'" target="_blank" rel="noopener" aria-label="'+esc(sbBrand())+' on '+esc(name)+'" title="'+esc(name)+'">'+ic+'</a>'
      : '<span class="fdr-si fdr-si-'+esc(x.id)+' fdr-soc-off" role="img" aria-label="'+esc(name)+'" title="'+esc(name)+' · '+esc(t('Address not added yet'))+'">'+ic+'</span>';
  }).join('');
};

/* =====================================================================
   #1 · desktop footer links carry their small line icon (the phone footer
   always had them). The icon is the link's own (Site builder › Footer);
   a category link takes its garment icon.
   ===================================================================== */
(function(){
  if(typeof ftrDeskLinks !== 'function') return;
  var L0 = ftrDeskLinks;
  ftrDeskLinks = function(col){
    var html = L0(col);
    if(OPT('ftr.deskIcons') === false) return html;
    var ls = (col.links || []).filter(function(l){ return l && l.on !== false && !l.removed && l.dev !== 'phone'; });
    var byHref = {};
    ls.forEach(function(l){ var h = l.cat ? '#/c/'+l.cat : l.href; if(!h) return; byHref[h] = l.cat ? catIcon((CAT(l.cat) || {}).garment, 15) : ico(l.icon || 'right', 15); });
    return html.replace(/<a href="([^"]+)"([^>]*)>([^<]*)<\/a>/g, function(m, h, rest, lab){
      var ic = byHref[h]; if(!ic) return m;
      return '<a href="'+h+'"'+rest+'><span class="fdr-ic" aria-hidden="true">'+ic+'</span><span>'+lab+'</span></a>';
    });
  };
})();

/* Note 54 #2 (round 2): the phone footer — the same round marks, centred; a network without its address is shown, not linked */
function ftrPhoneSoc(){
  var s = SITE('social') || {};
  var list = (ftrData().social || []).filter(function(x){ return x && x.on !== false && !x.removed && x.dev !== 'phone-off' && (SOC_LIB[x.id] || x.img); });
  if(!list.length) return '';
  return '<div class="ftr-soc2" data-testid="ftr-soc-phone" style="--n:'+list.length+'">'+list.map(function(x){
    var L = SOC_LIB[x.id], name = x.label || (L ? L.label : 'Link'), url = String(x.url || s[x.id] || (x.id === 'whatsapp' ? waLink('Hi EXTAS') : ''));
    var ic = x.img ? '<img src="'+esc(x.img)+'" alt="" width="18" height="18">' : (N54_SOC[x.id] ? n54Soc(x.id, 18) : L.icon());
    return /^https?:\/\//.test(url) ? '<a class="fs2 fs2-'+esc(x.id)+'" href="'+esc(url)+'" target="_blank" rel="noopener" aria-label="'+esc(sbBrand())+' on '+esc(name)+'">'+ic+'</a>'
      : '<span class="fs2 fs2-'+esc(x.id)+' off" role="img" aria-label="'+esc(name)+'" title="'+esc(name)+'">'+ic+'</span>';
  }).join('')+'</div>';
}

/* =====================================================================
   Note 54 E · "Build your own set" price style (desktop home tile).
   none (default, the original plain line) · underline · pill · strike ·
   chip (the earlier sale-colour chip, kept as a choice). The owner ticks
   one in Admin › Settings; only that one shows.
   ===================================================================== */
if(typeof SHOP_OPT_DEF !== 'undefined'){
  if(SHOP_OPT_DEF['home.setPriceStyle'] === undefined) SHOP_OPT_DEF['home.setPriceStyle'] = 'none';
  if(SHOP_OPT_DEF['home.setSaveMin'] === undefined) SHOP_OPT_DEF['home.setSaveMin'] = 100;   /* a saving under this many taka is not shown */
}
/* round 3 (owner): exactly four choices — none + three styles */
var SP_STYLES = [['none', 'None (original)', 'কিছু না (আগের মতো)'], ['underline', '1 · Bold price, thin accent underline', '1 · মোটা দাম, নিচে চিকন দাগ'],
  ['pill', '2 · Soft pill behind the set price, saving in muted green', '2 · দামের পেছনে নরম পিল, সাশ্রয় হালকা সবুজে'], ['strike', '3 · Separate price struck in grey, set price larger', '3 · আলাদা কিনলে যে দাম, সেটা কেটে ধূসর; সেটের দাম একটু বড়']];
function setPriceStyle(){ var v = String(OPT('home.setPriceStyle') || 'none'); return SP_STYLES.some(function(x){ return x[0] === v; }) ? v : 'none'; }
/* "was" = what the same pieces cost bought one by one: the sum of the k cheapest singles the set
   can be made of (demo data) — never an average, never more than a buyer could really save */
function setPriceWas(r, k){
  var ps = DB.products.filter(function(p){ return !p.hidden && (r.mode === 'sku' ? (r.skus || []).indexOf(p.id) >= 0 : (r.categories || []).indexOf(p.cat) >= 0); }).map(function(p){ return p.price; }).sort(function(a, b){ return a - b; });
  if(!ps.length) return 0;
  var sum = 0; for(var i = 0; i < k; i++) sum += ps[Math.min(i, ps.length - 1)];
  return sum;
}
function setSaveMin(){ var n = +OPT('home.setSaveMin'); return isNaN(n) ? 100 : Math.max(0, n); }
function setPriceTiers(r, st){
  var min = setSaveMin();
  var cells = Object.keys(r.tiers).sort(function(a, b){ return a - b; }).map(function(k){
    var price = r.tiers[k], was = setPriceWas(r, +k), save = was - price, real = save >= min && save > 0;
    if(st === 'underline') return '<span class="sp sp-u">'+esc(k+' for')+' <b>'+esc(fmt(price))+'</b></span>';
    if(st === 'pill') return '<span class="sp sp-p">'+esc(k+' for')+' <b>'+esc(fmt(price))+'</b>'+(real ? '<i>'+esc('save '+fmt(save))+'</i>' : '')+'</span>';
    return '<span class="sp sp-s">'+esc(k+' for')+' '+(real ? '<s>'+esc(fmt(was))+'</s> ' : '')+'<b>'+esc(fmt(price))+'</b></span>';
  }).join('');
  return st === 'underline' ? '<span class="sp-row">'+cells+'</span>' : cells;
}
/* the underline style stays on one line: the row's type steps down a little when the tile is narrow */
function spFit(){
  [].forEach.call(document.querySelectorAll('.sp-row'), function(r){
    r.style.fontSize = ''; var f = parseFloat(getComputedStyle(r).fontSize) || 14;
    while(r.scrollWidth > r.clientWidth + 0.5 && f > 10.5){ f -= 0.25; r.style.fontSize = f + 'px'; }
  });
}
(function(){
  var app = document.getElementById('app'); if(!app || !window.MutationObserver) return; var t = 0;
  new MutationObserver(function(){ if(t) return; t = requestAnimationFrame(function(){ t = 0; if(document.querySelector('.sp-row')) spFit(); }); }).observe(app, {childList:true});
  window.addEventListener('resize', function(){ if(document.querySelector('.sp-row')) spFit(); });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if(document.querySelector('.sp-row')) spFit(); });
})();
setTimeout(function(){
  if(typeof ZS_SETTINGS === 'undefined' || typeof zs_S !== 'function' || zs_S('opt.home.setSaveMin')) return;
  ZS_SETTINGS.push({id:'opt.home.setSaveMin', g:'n54co', en:'Build your own set: smallest saving shown (৳)', bn:'নিজের সেট: সবচেয়ে কম কত টাকা সাশ্রয় হলে দেখাবে (৳)', type:'num', where:'Home page, Build your own set tile', see:'#/',
    get:function(){ return OPT('home.setSaveMin'); }, set:function(v){ optSet('home.setSaveMin', +v); }, def:function(){ return SHOP_OPT_DEF['home.setSaveMin']; }, reset:function(){ optReset('home.setSaveMin'); }});
}, 0);
/* Admin › Settings: a radio list, each with a live preview of the tile's price lines */
function spCard(){
  var cur = setPriceStyle(), rules = (typeof setRules === 'function' ? setRules() : (DB.customSetRules || [])).filter(function(r){ return r.active !== false; }).slice(0, 2);
  var prev = function(st){
    var lines = rules.map(function(r){ var inner = st === 'none' || !rules.length ? Object.keys(r.tiers).sort(function(a,b){return a-b;}).map(function(k){ return '<span class="hm-tier-m">'+esc('Any '+k+' for '+fmt(r.tiers[k]))+'</span>'; }).join(' · ')
      : setPriceTiers(r, st);
      return '<div class="rl"><b>'+esc(r.name)+'</b><br>'+inner+'</div>'; }).join('');
    return '<div class="hm-set-diy sp-prev" data-sp="'+st+'">'+lines+'</div>';
  };
  return '<section class="zs-card sp-card" id="sp-card" data-testid="sp-card"><div class="ft-hd"><div class="ft-tl"><span class="ft-tag">Home page · desktop</span><h2 class="h3">"Build your own set" — price style <span class="ft-bn">নিজের সেট — দামের ধরন</span></h2>'+
    '<p class="small text2">Tick one. Only the ticked style shows on the home page. "None" keeps the original line. The struck price is what the same pieces cost bought one by one (the cheapest singles); a saving under the amount below is not shown.</p></div></div>'+
    '<div class="sp-min"><label class="label" for="sp-min">Smallest saving shown (৳)</label><input id="sp-min" class="input" type="number" min="0" step="10" value="'+esc(setSaveMin())+'" data-change="sp-min"></div>'+
    '<div class="sp-list" role="radiogroup">'+SP_STYLES.map(function(x){ var on = cur === x[0];
      return '<label class="sp-opt'+(on ? ' on' : '')+'"><span class="sp-h"><input type="radio" name="sp-style" value="'+x[0]+'" data-change="sp-style"'+(on ? ' checked' : '')+'><span><b>'+esc(x[1])+'</b><span class="xs muted"> '+esc(x[2])+'</span></span>'+(x[0] === 'none' ? '<span class="tag">Default</span>' : '')+'</span>'+prev(x[0])+'</label>'; }).join('')+'</div></section>';
}
CHANGE['sp-min'] = function(el){ optSet('home.setSaveMin', Math.max(0, +el.value || 0)); saveState(); rerender(); };
CHANGE['sp-style'] = function(el){ optSet('home.setPriceStyle', el.value); saveState(); rerender(); toast('Set price style saved — it shows on the home page now'); };
(function(){
  if(typeof PAGES === 'undefined' || !PAGES['admin-settings']) return;
  var pg = PAGES['admin-settings'], a0 = pg.after;
  pg.after = function(){
    if(a0) try{ a0.apply(this, arguments); }catch(e){ console.error(e); }
    var m = document.querySelector('.admin-main'); if(!m || m.querySelector('#sp-card')) return;
    var at = m.querySelector('.ft-place') || m.querySelector('.zs-hd'); var box = document.createElement('div'); box.innerHTML = spCard();
    if(at && at.parentNode) at.parentNode.insertBefore(box.firstChild, at.nextSibling); else m.insertBefore(box.firstChild, m.firstChild);
  };
})();
