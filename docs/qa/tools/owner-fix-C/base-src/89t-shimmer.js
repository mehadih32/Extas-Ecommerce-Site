/* =====================================================================
   89t-shimmer.js — Shimmer / ঝিলিক  (owner review of the bag page, item 5)
   Sawdagor সওদাগর A360-04 · Shilpi শিল্পী A360-05 · 19 Oct 2026

   Every travelling light ("shimmer") on the shop, in ONE list, with three
   controls each — on/off, speed, strength — and one master switch, in
   Admin › Settings › "Shimmer / ঝিলিক". Registered into Prohori's settings
   list the same way 89s-shop-settings.js registers its rows.

   How it works: the shimmers themselves stay where they were drawn (styles,
   r11/r12 files, r12-zzdesk-b.css for the three new ones). This file only
   writes a small <style id="shim-css"> AFTER all of them, from the owner's
   values in ST.shimmer. With every value at its default that style is EMPTY,
   so nothing on the shop changes until the owner changes something.
     off      → the light is not drawn at all
     speed    → slow ×1.5 / fast ×0.65 of the designed pass time
     strength → full (as designed) / medium 75% / soft 50%. Never stronger
                than designed: the designed level is the one measured to keep
                the words under the light at 4.5:1 or better.
   Reduced motion: when the visitor's device asks for less motion, every
   shimmer is off whatever the switches say (each shimmer's own CSS already
   does this; nothing here can switch one back on under reduced motion).
   ===================================================================== */
var SHIM_ITEMS = [
  {id:'checkout', en:'Checkout button (bag, checkout)', bn:'চেকআউট বাটন (ব্যাগ, চেকআউট)', see:'#/bag', dur:7,
   sel:['[data-testid="bag-summary"] .btn-primary:not(:disabled)::after', '.bg-mbar .btn-primary:not(:disabled)::after', '.co-confirm.btn-primary:not(:disabled)::after'], parent:'primary', anim:['ctaSheenBg','ease-in-out 2s infinite']},
  {id:'cont', en:'"Continue shopping" on the bag (desktop)', bn:'ব্যাগে কেনাকাটা চালিয়ে যাওয়ার লিংক (ডেস্কটপ)', see:'#/bag', dur:7,
   sel:['.bg-title .bg-cont::after']},
  {id:'free', en:'"FREE" delivery label (desktop)', bn:'ফ্রি ডেলিভারির লেবেল (ডেস্কটপ)', see:'#/bag', dur:7,
   sel:['.bg-freeb::after']},
  {id:'addbag', en:'Add to Bag button (desktop) — off at the start', bn:'ব্যাগে রাখুন বাটন (ডেস্কটপ) — শুরুতে বন্ধ', see:'#/p/essential-pique-polo', dur:7, def:false,
   sel:['.pdp-ctas .btn-addbag::after', '.dkb-bar .btn-addbag::after']},
  {id:'order', en:'Order Now button', bn:'এখনই অর্ডার বাটন', see:'#/p/essential-pique-polo', dur:7,
   sel:['.pdp-ctas .btn-primary:not(:disabled)::after', '.pdp-mbar .btn-primary:not(:disabled)::after', '.dkb-bar .btn-primary:not(:disabled)::after'], parent:'primary', anim:['ctaSheenBg','ease-in-out 2s infinite']},
  {id:'primary', en:'All other green buttons', bn:'বাকি সব সবুজ বাটন', see:'#/', dur:7,
   sel:['.btn-primary:not(:disabled)::after']},
  {id:'logo', en:'EXTAS logo in the header', bn:'হেডারের লোগো', see:'#/', dur:3.4,
   sel:['.hdr .logo::after']},
  {id:'words', en:'Product page words (Free home delivery, Colour, Size, All colours, In stock)', bn:'প্রোডাক্ট পেজের লেখা (ফ্রি ডেলিভারি, রং, সাইজ, সব রং, স্টকে আছে)', see:'#/p/essential-pique-polo', dur:3.2,
   sel:['.sweep.sweep.sweep::after']},
  {id:'pills', en:'Size boxes on the product page', bn:'প্রোডাক্ট পেজের সাইজের ঘর', see:'#/p/essential-pique-polo', dur:4.6,
   sel:['.pdp-page .pdp-pills.shine .size-pill::after']},
  {id:'cohelp', en:'Checkout help strip ("Need help with your order?")', bn:'চেকআউটের সাহায্যের লাইন', see:'#/checkout', dur:7,
   sel:['.co-help.co-help::after']},
  {id:'coneed', en:'Checkout button while something is still missing', bn:'কিছু বাকি থাকলে চেকআউট বাটন', see:'#/checkout', dur:5.5,
   sel:['.co-confirm.co-need-on::after']},
  {id:'accoffer', en:'My account offer banner', bn:'মাই অ্যাকাউন্টের অফার ব্যানার', see:'#/account', dur:9,
   sel:['.acc-ob::after']},
  {id:'announce', en:'Top announcement strip', bn:'সবার উপরের ঘোষণার লাইন', see:'#/', dur:9,
   sel:['.announce::after']},
  {id:'footerpay', en:'Footer payment row', bn:'ফুটারের পেমেন্ট লাইন', see:'#/', dur:7,
   sel:['.ftr-pay-sheen']}
];
var SHIM_SPEED = {slow:1.5, normal:1, fast:0.65};
var SHIM_STRENGTH = {full:1, medium:0.75, soft:0.5};
function shim_item(id){ for(var i=0;i<SHIM_ITEMS.length;i++) if(SHIM_ITEMS[i].id===id) return SHIM_ITEMS[i]; return null; }
function shim_state(){ var s = (typeof ST!=='undefined' && ST && ST.shimmer) || {}; return {on:s.on!==false, items:s.items||{}}; }
function shim_val(id, k){
  var s = shim_state().items[id] || {}, it = shim_item(id) || {};
  if(k==='on') return s.on!==undefined ? !!s.on : it.def!==false;
  if(k==='speed') return SHIM_SPEED[s.speed] ? s.speed : 'normal';
  return SHIM_STRENGTH[s.strength] ? s.strength : 'full';
}
function shim_set(id, k, v){
  ST.shimmer = ST.shimmer || {}; ST.shimmer.items = ST.shimmer.items || {};
  if(id==='*'){ ST.shimmer.on = !!v; }
  else { var o = ST.shimmer.items[id] = ST.shimmer.items[id] || {}; o[k] = v; }
  if(typeof saveState==='function') saveState(); shim_apply();
}
function shim_reset(id, k){ if(id==='*'){ if(ST.shimmer) delete ST.shimmer.on; } else if(ST.shimmer && ST.shimmer.items && ST.shimmer.items[id]) delete ST.shimmer.items[id][k]; if(typeof saveState==='function') saveState(); shim_apply(); }
/* the style written after everything else; '' when every value is default */
function shim_css(){
  var st = shim_state(), off = [], tune = [], back = [];
  var P = function(sels){ return sels.map(function(s){ return 'html body '+s; }).join(','); };
  SHIM_ITEMS.forEach(function(it){
    var on = st.on && shim_val(it.id, 'on');
    if(!on){ if(it.def!==false) off.push(P(it.sel)); return; }      /* a shimmer that starts off is already not drawn */
    if(it.def===false) back.push(P(it.sel)+'{display:block!important}');
    var sp = SHIM_SPEED[shim_val(it.id, 'speed')], str = SHIM_STRENGTH[shim_val(it.id, 'strength')], d = [];
    if(sp!==1) d.push('animation-duration:'+(it.dur*sp).toFixed(2)+'s!important');
    if(str!==1) d.push('opacity:'+str+'!important');
    if(d.length) tune.push(P(it.sel)+'{'+d.join(';')+'}');
    /* a button with its own switch stays lit when "all other green buttons" are off */
    if(it.parent && !(st.on && shim_val(it.parent, 'on'))) back.push(P(it.sel)+'{display:block!important;animation:'+it.anim[0]+' '+(it.dur*sp).toFixed(2)+'s '+it.anim[1]+'!important}');
  });
  var css = '';
  if(off.length) css += off.join(',')+'{display:none!important;animation:none!important}\n';
  if(tune.length) css += tune.join('\n')+'\n';
  if(back.length) css += '@media (prefers-reduced-motion:no-preference){'+back.join('\n')+'}\n';
  return css;
}
function shim_apply(){
  var css = shim_css(), el = document.getElementById('shim-css');
  if(!css){ if(el) el.remove(); return; }
  if(!el){ el = document.createElement('style'); el.id = 'shim-css'; }
  el.textContent = css;
  document.head.appendChild(el);                 /* always the last style in <head> */
}
try{ shim_apply(); }catch(e){}

/* ---- Admin › Settings › "Shimmer / ঝিলিক" ---- */
(function(){
  if(typeof ZS_SETTINGS==='undefined' || typeof ZS_GROUPS==='undefined') return;
  var SP = [['slow','Slow · ধীরে'], ['normal','Normal — as designed · যেমন আছে'], ['fast','Fast · দ্রুত']];
  var STR = [['full','Full — as designed · পুরো'], ['medium','Medium · মাঝারি'], ['soft','Soft · হালকা']];
  var rows = [{id:'shim.on', g:'shimmer', en:'All shimmers on the shop (master switch; always off on devices set to reduce motion)',
    bn:'সাইটের সব ঝিলিক — একসাথে চালু/বন্ধ (যে ফোনে "কম নড়াচড়া" চালু, সেখানে সবসময় বন্ধ)', type:'sw', where:'Whole shop', see:'#/',
    get:function(){ return shim_state().on; }, set:function(v){ shim_set('*', 'on', !!v); }, def:function(){ return true; }, reset:function(){ shim_reset('*'); }}];
  SHIM_ITEMS.forEach(function(it){
    rows.push({id:'shim.'+it.id+'.on', g:'shimmer', en:it.en+' — on', bn:it.bn+' — চালু', type:'sw', where:it.en, see:it.see,
      get:function(){ return shim_val(it.id, 'on'); }, set:function(v){ shim_set(it.id, 'on', !!v); }, def:function(){ return it.def!==false; }, reset:function(){ shim_reset(it.id, 'on'); }});
    rows.push({id:'shim.'+it.id+'.speed', g:'shimmer', en:it.en+' — speed', bn:it.bn+' — গতি', type:'sel', opts:SP, where:it.en, see:it.see,
      get:function(){ return shim_val(it.id, 'speed'); }, set:function(v){ shim_set(it.id, 'speed', v); }, def:function(){ return 'normal'; }, reset:function(){ shim_reset(it.id, 'speed'); }});
    rows.push({id:'shim.'+it.id+'.strength', g:'shimmer', en:it.en+' — strength', bn:it.bn+' — কতটা উজ্জ্বল', type:'sel', opts:STR, where:it.en, see:it.see,
      get:function(){ return shim_val(it.id, 'strength'); }, set:function(v){ shim_set(it.id, 'strength', v); }, def:function(){ return 'full'; }, reset:function(){ shim_reset(it.id, 'strength'); }});
  });
  rows.forEach(function(r){ if(!zs_S(r.id)) ZS_SETTINGS.push(r); });
  var g = ['shimmer', 'Shimmer / ঝিলিক', 'ঝিলিক — সাইটের চকচকে আলো: চালু/বন্ধ, গতি, উজ্জ্বলতা', 'owner bag review 5'];
  if(!ZS_GROUPS.some(function(x){ return x[0]===g[0]; })){
    var at = -1; ZS_GROUPS.forEach(function(x, i){ if(x[0]==='install') at = i; });
    if(at >= 0) ZS_GROUPS.splice(at, 0, g); else ZS_GROUPS.push(g);
  }
})();
