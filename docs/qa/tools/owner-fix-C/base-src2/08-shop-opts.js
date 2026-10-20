/* =====================================================================
   08-shop-opts.js — সওদাগর Sawdagor · owner answers, round 15 note 23
   Shop options the owner decides, read through OPT() the same way the shop
   reads SET(): a default here, the owner's value in ST (ST.shopOpt), and
   Admin › Settings writes it (rows registered in 89s-shop-settings.js).
     23.1  two separate offer ticks — SMS (ticked) and WhatsApp (empty)
     23.9  trial at delivery — try it on in front of the rider (on)
     23.13 same size added twice — 'block' (as now) or 'qty' (+1)
   Every word a customer sees is a setting, in English and Bengali; an empty
   Bengali line falls back to the English one.
   ===================================================================== */
var SHOP_OPT_DEF = {
  /* 23.1 — offer messages need a tick; order messages always go */
  'consent.smsOn'  : true,
  'consent.waOn'   : false,
  'consent.sms'    : 'Send me offers by SMS. Stop anytime.',
  'consent.smsBn'  : 'SMS-এ অফার পাঠান। যেকোনো সময় বন্ধ করা যাবে।',
  'consent.wa'     : 'Also send me offers on WhatsApp.',
  'consent.waBn'   : 'WhatsApp-এও অফার পাঠান।',
  /* 23.9 — trial at the door */
  'trial.on'       : true,
  'trial.line'     : 'Try it on in front of the rider',
  'trial.lineBn'   : 'রাইডারের সামনে পরে দেখে নিতে পারবেন',
  'trial.help'     : 'You may try your order on at the door, in front of the rider, before you pay. If it doesn\'t suit you, hand it back to the rider and pay only the delivery charge.',
  'trial.helpBn'   : 'দরজায় রাইডারের সামনে পরে দেখে তারপর টাকা দিতে পারবেন। পছন্দ বা মাপ না হলে রাইডারকে ফেরত দিন — শুধু ডেলিভারি চার্জ দিতে হবে।',
  /* 23.13 — the same size added a second time */
  'bag.duplicateAdd': 'block',
  'bag.qtyToast'   : 'Size {size} — now {qty} in your bag',
  'bag.qtyToastBn' : 'সাইজ {size} — ব্যাগে এখন {qty}টা',
  /* a combo offer that ended while it sat in the bag keeps its price (Claude's call, owner's pick-and-apply rule) */
  'bag.endedNote'  : 'This offer has ended — you can still buy it at the price in your bag',
  'bag.endedNoteBn': 'এই অফার শেষ হয়ে গেছে — ব্যাগে থাকা দামে এখনো কিনতে পারবেন'
};
function OPT(k){
  var o = (typeof ST!=='undefined' && ST && ST.shopOpt) || null;
  if(o && Object.prototype.hasOwnProperty.call(o, k)) return o[k];
  return SHOP_OPT_DEF[k];
}
/* the customer's language: '<key>Bn' in Bengali when it has words, else the English line */
function OPTL(k){
  if(ST.lang==='bn'){ var b = OPT(k+'Bn'); if(b!=null && String(b).trim()) return String(b); }
  var v = OPT(k); return v==null ? '' : String(v);
}
function optSet(k, v){ ST.shopOpt = ST.shopOpt || {}; ST.shopOpt[k] = v; }
function optReset(k){ if(ST.shopOpt) delete ST.shopOpt[k]; }

/* ---------- 23.1 · offer consent, two channels kept apart ----------
   order.consent and account.consent are {sms, wa, at, src, order}. The
   checkout ticks start from what the customer chose last time; a new
   customer gets the owner's defaults (SMS ticked, WhatsApp empty). */
function consentDefaults(){ return {sms:!!OPT('consent.smsOn'), wa:!!OPT('consent.waOn')}; }
function acctConsent(acc){
  if(!acc) return null;
  if(acc.consent && typeof acc.consent.sms==='boolean') return acc.consent;
  /* older records: the single "offers" switch (off = both off) */
  if(acc.offersOptIn===false) return {sms:false, wa:false, src:'old single switch'};
  /* else the newest order that recorded a choice */
  var ids = acc.orders || [];
  for(var i=0;i<ids.length;i++){ var o = ST.orders && ST.orders[ids[i]]; if(o && o.consent) return o.consent; }
  return null;
}
function consentStart(acc){ var c = acctConsent(acc); return c ? {sms:!!c.sms, wa:!!c.wa} : consentDefaults(); }
function consentRecord(sms, wa, src, orderId){ return {sms:!!sms, wa:!!wa, at:Date.now(), src:src||'checkout', order:orderId||null}; }
function setAcctConsent(acc, rec){
  if(!acc || !rec) return;
  acc.consent = rec;
  acc.offersOptIn = !!(rec.sms || rec.wa);          /* the old single switch, kept in step */
}
/* the two ticks — used by checkout and the ad landing order form */
function consentTicksHTML(sms, wa, act, idp){
  idp = idp || 'ct';
  return '<label class="check ct-tick" data-testid="'+idp+'-sms"><input type="checkbox" data-change="'+act+'" data-k="sms"'+(sms?' checked':'')+'><span>'+esc(OPTL('consent.sms'))+'</span></label>'+
         '<label class="check ct-tick" data-testid="'+idp+'-wa"><input type="checkbox" data-change="'+act+'" data-k="wa"'+(wa?' checked':'')+'><span>'+esc(OPTL('consent.wa'))+'</span></label>';
}

/* ---------- 23.9 · trial at the door ---------- */
function trialOn(){ return OPT('trial.on')!==false && !!String(OPTL('trial.line')||'').trim(); }
function trialLineHTML(cls, testid){
  if(!trialOn()) return '';
  return '<p class="trial-ln '+(cls||'')+'" data-testid="'+(testid||'trial-line')+'">'+ico('check',14)+'<span>'+esc(OPTL('trial.line'))+'</span></p>';
}
function trialHelpHTML(){
  if(OPT('trial.on')===false) return '';
  var h = String(OPTL('trial.help')||'').trim(); if(!h) return '';
  return '<p class="trial-help" data-testid="trial-help"><b>'+esc(OPTL('trial.line'))+'.</b> '+esc(h)+'</p>';
}

/* ---------- 23.13 · same size twice ---------- */
function bagDupMode(){ return OPT('bag.duplicateAdd')==='qty' ? 'qty' : 'block'; }
function bagQtyToast(size, qty){
  var msg = OPTL('bag.qtyToast').replace('{size}', size).replace('{qty}', qty);
  if(typeof cb_toast==='function') cb_toast(msg, '#/bag', ST.lang==='bn' ? 'ব্যাগ দেখুন' : 'View bag'); else toast(msg);
}

/* ---------- an offer that ended while it was in the bag ----------
   The set keeps the price it was added at and can still be checked out;
   the bag and checkout say so once, naming the set(s). */
function bagEndedSets(){
  return (ST.bag||[]).filter(function(l){
    if(l.kind!=='set' || !l.refId) return false;
    if(l.source==='auto' && typeof ca_rule==='function'){ var r = ca_rule(String(l.refId).split('~')[0]); return !!r && !r.active; }
    if(l.source==='combo' && typeof COMBO==='function'){ var c = COMBO(l.refId); return !!c && !c.active; }
    if(l.source==='custom' && typeof setRules==='function'){ var s = setRules().filter(function(x){ return x.id===l.refId; })[0]; return !!s && !s.active; }
    return false;
  });
}
function bagEndedNoteHTML(cls){
  var list = bagEndedSets(); if(!list.length) return '';
  var names = []; list.forEach(function(l){ if(names.indexOf(l.name)<0) names.push(l.name); });
  return '<div class="zc-note bag-ended '+(cls||'')+'" role="status" data-testid="bag-ended">'+ico('info',14)+'<span><b>'+esc(names.join(', '))+'</b> — '+esc(OPTL('bag.endedNote'))+'</span></div>';
}

/* styles for the pieces above (kept with them) */
(function(){
  var css = [
    '.trial-ln{display:flex;align-items:flex-start;gap:7px;margin:9px 0 0;font-size:12.5px;line-height:1.4;color:var(--text2);min-width:0}',
    '.trial-ln svg{color:var(--brand);flex-shrink:0;margin-top:1px}',
    '.trial-ln span{min-width:0;text-wrap:balance}',
    /* product page: one row under Delivery · Exchange · Returns, full width */
    '.pdp-page .pdp-rules .trial-ln,[data-testid="pdp-rules"] .trial-ln{grid-column:1/-1;flex-basis:100%;order:10;justify-content:center;text-align:left;margin:10px 10px 0;padding-top:9px;border-top:1px solid var(--line2)}',
    '.trial-help{margin:8px 0 0;padding:11px 13px;border-radius:var(--radius);background:var(--brand-tint);border:1px solid var(--brand-line);color:var(--ink)}',
    '.ct-tick span{min-width:0}',
    '.bag-ended{display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-radius:var(--radius);background:var(--warn-bg);color:var(--ink);font-size:13px;line-height:1.45;min-width:0}',
    '.bag-ended svg{flex-shrink:0;margin-top:2px}', '.bag-ended span{min-width:0;overflow-wrap:anywhere}'
  ].join('\n');
  try{ var s = document.createElement('style'); s.id = 'css-shopopt'; s.textContent = css; (document.head||document.documentElement).appendChild(s); }catch(e){}
})();
