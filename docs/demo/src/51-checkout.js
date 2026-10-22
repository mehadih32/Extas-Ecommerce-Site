/* ================= EXTAS demo — Checkout (51-checkout.js) ================= */
bag_css('css-co', [
  '.co-help .container{padding-top:8px;padding-bottom:8px}',
  '.co-wrap{padding-top:12px;padding-bottom:28px}',
  '@media(min-width:1024px){.co-wrap{padding-top:32px;padding-bottom:56px}}',
  '.co-sec{padding:14px 16px}',
  '@media(min-width:1024px){.co-sec{padding:24px}}',
  '.co-hd{display:flex;align-items:center;gap:12px}',
  '.co-num{width:28px;height:28px;border-radius:50%;background:var(--ink);color:var(--bg);display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0}',
  '.co-off .h2{color:var(--muted)} .co-off .co-num{background:var(--line);color:var(--muted)}',
  '.co-sub{margin:6px 0 0}',
  '.co-hint{font-size:12.5px;margin-top:6px;min-height:18px;display:flex;gap:6px;align-items:flex-start;line-height:1.4}',
  '.co-hint svg{flex-shrink:0;margin-top:1px}',
  '.co-zone{display:flex;align-items:center;gap:10px;border:1.5px solid var(--brand);background:var(--brand-tint);border-radius:var(--radius);padding:10px 12px}',
  '.co-zone>svg{color:var(--brand);flex-shrink:0}',
  '.co-po{border:1px solid var(--input);border-radius:var(--radius);background:var(--surface)}',
  '.co-po.on{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)}',
  '.co-po-hd{display:flex;align-items:center;gap:10px;width:100%;background:none;border:0;padding:9px 12px;cursor:pointer;text-align:left;min-height:52px;color:var(--ink)}',
  '.co-po-hd>svg{color:var(--text2);flex-shrink:0}',
  '.co-po-bd{padding:0 12px 12px 42px}',
  '.co-radio{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--input);flex-shrink:0;position:relative;background:var(--surface)}',
  '.co-po.on .co-radio{border-color:var(--brand)}',
  '.co-po.on .co-radio::after{content:"";position:absolute;inset:4px;border-radius:50%;background:var(--brand)}',
  '.co-badge{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:4px;padding:1px 6px;font-size:10.5px;font-weight:700;color:var(--text2);background:var(--surface2);margin:4px 4px 0 0}',
  '.co-side{display:none}',
  '@media(min-width:1024px){.co-side{display:block}}',
  '.co-msum{background:var(--surface);border-bottom:1px solid var(--line)}',
  '.co-msum-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;background:none;border:0;padding:12px 16px;color:var(--brand);cursor:pointer}',
  '.co-msum-btn .price{color:var(--ink)}',
  '@media(min-width:1024px){.co-msum{display:none}}',
  ':root[data-theme="festive"] .co-msum-btn{color:var(--gold)}',
  '.co-msum-bd{padding:2px 16px 18px}',
  '.co-it{display:flex;align-items:center;gap:12px;padding:7px 0}',
  '.co-th{width:56px;flex-shrink:0;position:relative}',
  '.co-th .pimg-label{display:none}',
  '.co-qb{position:absolute;top:-6px;right:-6px;background:var(--ink);color:var(--bg);font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 5px}',
  '.co-rows{border-top:1px solid var(--line2);margin-top:8px;padding-top:10px}',
  '.co-r{display:flex;justify-content:space-between;gap:12px;padding:4px 0}',
  '.co-r.disc{color:var(--brand)}',
  ':root[data-theme="festive"] .co-r.disc{color:var(--gold)}',
  '.co-tot{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid var(--line);margin-top:8px;padding-top:12px;font-weight:700;font-size:16px}',
  '.co-tot .price{font-size:22px}',
  '.co-donly{display:none}',
  '@media(min-width:1024px){.co-donly{display:block}}',
  '.co-mbar .btn{min-height:52px}',
  '.co-ups .co-th{width:52px}',
  '.co-offrow{align-items:flex-start}',
  '.co-empty{max-width:620px;margin:16px auto;padding:44px 20px}',
  /* --- round 2: help bar and order summary must be noticed --- */
  '.co-msum{background:var(--surface);border-bottom:1px solid var(--line);box-shadow:0 2px 10px rgba(0,0,0,.05)}',
  '.co-msum-chev{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--brand-tint);color:var(--brand)}',
  '.co-rates{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--text2);background:var(--surface2);border:1px solid var(--line2);border-radius:var(--radius);padding:9px 11px}',
  '.co-rates b{color:var(--ink)}',
  '.co-rsep{margin:0 8px;opacity:.5}',
  '.co-addr{min-height:58px;resize:vertical}',
  '.co-zpick{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
  '.co-zbtn{display:flex;flex-direction:column;gap:3px;align-items:flex-start;text-align:left;min-height:62px;padding:10px 12px;border:1.5px solid var(--input);border-radius:var(--radius);background:var(--surface);color:var(--ink);cursor:pointer}',
  '.co-zbtn:hover{border-color:var(--brand);background:var(--brand-tint)}',
  '.co-zbtn b{font-size:13.5px}',
  '.co-zbtn span{font-size:12px;color:var(--text2)}',
  '.co-zchg{font-size:12px;margin-left:6px}',
  '.co-door{margin:8px 0 0;font-size:12.5px;font-weight:700;color:var(--ink);line-height:1.35}',
  /* confirm button: bigger, the amount louder, one slow sheen so the eye finds it */
  '.co-confirm{min-height:58px!important;font-size:17px;font-weight:800;letter-spacing:.01em;position:relative;overflow:hidden}',
  '.co-confirm .co-amt{font-size:19px;font-weight:800;margin-left:2px}',
  '.co-confirm:not(:disabled)::after{content:"";position:absolute;top:0;bottom:0;width:38%;left:-45%;'
    +'background:linear-gradient(100deg,transparent,rgba(255,255,255,.22),transparent);'
    +'animation:coSheen 6.5s ease-in-out 1.5s infinite;pointer-events:none}',
  '@keyframes coSheen{0%{left:-45%}16%{left:115%}100%{left:115%}}',
  '@media(prefers-reduced-motion:reduce){.co-confirm::after{display:none}}',
  /* --- round 2: fit more of the checkout on one phone screen --- */
  '@media(max-width:1023px){',
  '  .co-sec{padding:12px 14px}',
  '  .co-wrap .stack.s16{gap:9px}',
  '  .co-sec .stack.s16{gap:10px}',
  '  .co-sec .input{padding:10px 12px}',
  '  .co-sec .label{font-size:12.5px;margin-bottom:3px;display:block}',
  '  .co-hd{gap:10px}',
  '  .co-num{width:24px;height:24px;font-size:12px}',
  '  .co-hd .h2{font-size:16px}',
  '  .co-sec .mt16{margin-top:10px}',
  '  .co-hint{font-size:12px;margin-top:4px;min-height:0}',
  '  .co-hint:empty{display:none}',
  '  .co-po+.co-po{margin-top:8px}',
  '  .co-po-bd{padding:0 12px 10px 42px;font-size:12.5px}',
  '  .co-sec.stack.s12{gap:8px}',
  '  .co-ups{padding:10px 14px}',
  '  .co-sec.stack.s12 .xs.muted{font-size:11.5px;line-height:1.45}',
  '  .co-zone .small{font-size:12.5px}',
  '  .co-po-bd .stack{gap:6px}',
  '  .check{gap:8px;align-items:flex-start}',
  '}'


].join('\n'));

/* ===================== OWNER'S DASHBOARD SETTINGS ========================
   34. Every label on the checkout form is written here and nowhere else, so
   the owner can put his own words on the page without touching any code.
   This object is what the dashboard (Smart Rules → Checkout → Labels) will
   write to; change a line, reload, and the form says it. Leave a value empty
   and the field simply loses its label. */
var CO_LABELS = {
  heading : 'Delivery details',          /* step 1 title (Note 54 #6: simple words) */
  name    : 'Full name',
  phone   : 'Phone number',
  address : 'Full address',
  delivery: 'Delivery',                   /* step 2 title  */
  payment : 'Payment',                    /* step 3 title  */
  note    : 'Delivery note (optional)',
  noteAdd : 'Add a delivery note (optional)',
  confirm : 'Confirm Order',
  namePh  : '',                           /* placeholders — blank = none */
  phonePh : '01XXX-XXXXXX',
  /* Note 54 #8 (owner): no sample address — one clear Bengali line, also in English mode */
  addressPh: 'বাসা/রোড নম্বর, এলাকা, থানা ও জেলা লিখুন — রাইডার যেন সহজে খুঁজে পায়',
  /* Note 54 #11 / #12 — the last words on the page */
  exch    : 'Items can be exchanged for size',
  terms   : 'Terms',
  payCod  : 'Cash on Delivery',
  payCodSub: 'Pay when it reaches you',
  payMb   : 'Mobile banking',
  payCard : 'Card & bank',
  payOnline: 'Pay online',
  payOnlineSub: 'Cards, bKash, Nagad and net banking — one secure page',
  helpQ   : 'Need help?',
  helpA   : 'Message us on WhatsApp'
};
/* R15 wave 1 (bug 8). The same labels in Bengali — what the form says when
   the shop is switched to বাং. Also owner-editable; an empty line falls back
   to the English one. */
var CO_LABELS_BN = {
  heading : 'ডেলিভারির তথ্য',
  name    : 'পুরো নাম',
  phone   : 'মোবাইল নম্বর',
  address : 'পুরো ঠিকানা',
  delivery: 'ডেলিভারি',
  payment : 'পেমেন্ট',
  note    : 'ডেলিভারি নোট (না দিলেও চলবে)',
  noteAdd : 'ডেলিভারি নোট দিন (না দিলেও চলবে)',
  confirm : 'অর্ডার কনফার্ম করুন',
  namePh  : '',
  phonePh : '01XXX-XXXXXX',
  addressPh: 'বাসা/রোড নম্বর, এলাকা, থানা ও জেলা লিখুন — রাইডার যেন সহজে খুঁজে পায়',
  exch    : 'সাইজ না মিললে বদলে নিতে পারবেন',
  terms   : 'শর্তাবলি',
  payCod  : 'ক্যাশ অন ডেলিভারি',
  payCodSub: 'হাতে পেয়ে টাকা দিন',
  payMb   : 'মোবাইল ব্যাংকিং',
  payCard : 'কার্ড ও ব্যাংক',
  payOnline: 'অনলাইনে পেমেন্ট',
  payOnlineSub: 'কার্ড, বিকাশ, নগদ, নেট ব্যাংকিং — এক নিরাপদ পেজে',
  helpQ   : 'সাহায্য লাগবে?',
  helpA   : 'WhatsApp-এ মেসেজ দিন'
};
/* Note 54 #6: the owner's own words (Admin › Settings › Checkout words) sit in
   ST.coLbl — 'heading' for English, 'bn.heading' for Bengali — over the lines above */
function COLBL(k){
  var o = (typeof ST!=='undefined' && ST.coLbl) || {}, bn = ST.lang==='bn', v;
  if(bn && o['bn.'+k] != null && String(o['bn.'+k]).trim()) v = o['bn.'+k];
  else if(bn && CO_LABELS_BN[k]) v = CO_LABELS_BN[k];
  else if(o[k] != null) v = o[k];
  else v = CO_LABELS[k];
  return v==null ? '' : String(v);
}
/* every other line on checkout, in Bengali (simple চলতি words) */
var CO_BN = {
  'Checkout':'চেকআউট', 'Need help with your order?':'অর্ডার নিয়ে সাহায্য লাগবে?', 'Need help?':'সাহায্য লাগবে?',
  'Show order summary':'অর্ডারের হিসাব দেখুন', 'Hide order summary':'অর্ডারের হিসাব লুকান', 'Hide summary':'হিসাব লুকান',
  'Order summary':'অর্ডারের হিসাব', 'Subtotal':'সাবটোটাল', 'Delivery':'ডেলিভারি', 'Total':'মোট', 'You save':'আপনার সাশ্রয়',
  'After your address':'ঠিকানা দেওয়ার পর', '+ delivery':'+ ডেলিভারি', 'Remove':'বাদ দিন',
  'Free home delivery':'ফ্রি হোম ডেলিভারি', 'Inside Dhaka':'ঢাকার ভেতরে', 'Outside Dhaka':'ঢাকার বাইরে',
  'Reading your address — your charge appears here in a moment.':'ঠিকানা পড়ছি — একটু পরেই এখানে চার্জ দেখাবে।',
  'Write your address above and your charge appears here.':'ওপরে ঠিকানা লিখুন, এখানে ডেলিভারি চার্জ দেখাবে।',
  'Where is this address?':'এই ঠিকানা কোথায়?', 'change':'বদলান',
  'Returning at the door? Pay only the delivery charge to the rider.':'দরজায় ফেরত দিলে রাইডারকে শুধু ডেলিভারি চার্জ দিন।',
  'Opens as you write your address. Cash on Delivery is ready by default.':'ঠিকানা লিখলেই খুলবে। ক্যাশ অন ডেলিভারি আগে থেকেই বাছাই করা আছে।',
  'Cash on Delivery':'ক্যাশ অন ডেলিভারি', 'Pay when it reaches you':'হাতে পেয়ে টাকা দিন', 'Mobile Banking':'মোবাইল ব্যাংকিং', 'Card & Bank':'কার্ড ও ব্যাংক',
  'Total due':'মোট দিতে হবে', 'pay the rider at your door.':'দরজায় রাইডারকে দিন।',
  'Your offers':'আপনার অফার', 'Use my wallet':'আমার ওয়ালেট ব্যবহার করুন', 'Goes in the same parcel':'একই পার্সেলে যাবে',
  'Order confirmation and tracking link by SMS.':'অর্ডার কনফার্মেশন আর ট্র্যাকিং লিংক SMS-এ পাবেন।',
  'Send me offers by SMS and WhatsApp. Stop anytime.':'SMS আর WhatsApp-এ অফার পাঠান। যেকোনো সময় বন্ধ করা যাবে।',
  'By placing this order you agree to our Terms.':'অর্ডার দিলে আপনি আমাদের শর্তে রাজি হচ্ছেন।',
  'Secure payment':'নিরাপদ পেমেন্ট', 'Size exchange in':'সাইজ এক্সচেঞ্জ', 'hours':'ঘণ্টার মধ্যে',
  'then this button confirms your order':'তারপর এই বাটনে অর্ডার কনফার্ম হবে',
  'your name':'আপনার নাম', 'your phone number':'আপনার মোবাইল নম্বর', 'your address':'আপনার ঠিকানা', 'above':'ওপরে লিখুন',
  'Your bag is empty':'আপনার ব্যাগ খালি', 'Start shopping':'কেনাকাটা শুরু করুন', 'Go to bag':'ব্যাগে যান',
  'Add something to your bag first, then come back to check out.':'আগে ব্যাগে কিছু রাখুন, তারপর চেকআউটে আসুন।',
  'looks right':'ঠিক আছে', 'We\'ll call':'এই নম্বরে কল করব', 'Wallet':'ওয়ালেট', 'items':'টি পণ্য'
};
function cot(en){ return (ST.lang==='bn' && CO_BN[en]) ? CO_BN[en] : en; }
/* the delivery lines come from the owner's settings (English wording); in
   Bengali the shop's default sentences are given in Bengali, with the hours
   and amounts from the same settings. Wording the owner changed shows as typed. */
function cotLine(en){
  if(ST.lang!=='bn') return en;
  var s = String(en||''), m;
  if(CO_BN[s]) return CO_BN[s];
  if((m = s.match(/^You'll get your order within (.+) hours$/))) return m[1]+' ঘণ্টার মধ্যে অর্ডার পেয়ে যাবেন';
  if((m = s.match(/^Delivery anywhere in Bangladesh within (.+) hours$/))) return 'সারা দেশে '+m[1]+' ঘণ্টার মধ্যে ডেলিভারি';
  if(s === 'This item ships free, anywhere in Bangladesh.') return 'এই পণ্যের ডেলিভারি সারা দেশে ফ্রি।';
  if(s === 'Free delivery is running on every order right now.') return 'এখন সব অর্ডারে ফ্রি ডেলিভারি চলছে।';
  if((m = s.match(/^Your order is over (.+), so delivery is on us\.$/))) return 'অর্ডার '+m[1]+'-এর বেশি, তাই ডেলিভারি ফ্রি।';
  return s;
}

/* 42. Two ways of handling a form that is not finished yet. The owner will
   run one, then the other, and read the analytics.
     'a' — the confirm button is disabled and says what is missing (English).
     'b' — the button is tappable. Tapping does NOT place the order: it
           highlights the field that is missing and says, in Bengali, from
           inside that field's own box, what to write there.
   Default 'b', which is the owner's version. One line to switch. */
var CO_BLOCKED_STYLE = 'b';

/* 42 (the wider problem). Nobody may ever be stopped on this page without
   being told why in a language they read. EVERY blocked state on checkout —
   not only the address — carries a Bengali line and points at its own field. */
var CO_ASK = {
  'co-name'   : {bn:'এখানে আপনার নামটি লিখে অর্ডারটি নিশ্চিত করুন',        en:'Write your name here to confirm the order'},
  'co-phone'  : {bn:'এখানে আপনার মোবাইল নম্বরটি লিখে অর্ডারটি নিশ্চিত করুন', en:'Write your mobile number here to confirm the order'},
  'co-address': {bn:'এখানে আপনার ঠিকানাটি লিখে অর্ডারটি নিশ্চিত করুন',      en:'Write your address here to confirm the order'}
};
/* K10: a number that is there but wrong gets its own line */
CO_ASK['co-phone-bad'] = {bn:'এখানে 11 সংখ্যার সঠিক মোবাইল নম্বর লিখুন, যেমন 01712345678', en:'Enter an 11-digit mobile number, like 01712345678'};
function co_askHTML(field){
  var a = CO_ASK[field]; if(!a) return '';
  if(field==='co-phone' && UI['checkout'] && checkPhone(UI['checkout'].phone).state==='warn') a = CO_ASK['co-phone-bad'];
  return '<div class="co-askmsg" role="alert" data-testid="co-ask-'+field+'">'+ico('info',15)+
    '<span><b lang="bn">'+esc(a.bn)+'</b><span>'+esc(a.en)+'</span></span></div>';
}

/* 35. The delivery zone is never decided from the first word. "Gabtoli" is a
   Dhaka neighbourhood and "Gabtali" is a town in Bogura — reading word one
   and then raising the charge when "Bogura" arrives is exactly how a
   customer stops trusting the price. Two things must be true before the line
   is read at all: it holds two real words, and typing has stopped for a
   moment. A comma or a space after one word changes nothing. */
var CO_SETTLE = 900;                       /* ms of quiet before we read it */
var CO_ADDR_TIMER = null;
function co_words(s){
  return String(s||'').split(/[^A-Za-z0-9ঀ-৿]+/).filter(function(w){ return w.length>=2; });
}
/* 39. Payment opens after ONE finished word — a word of three letters or more
   followed by a space or a comma. Not after eight letters. */
function co_wordDone(s){
  var m = String(s||'').match(/[A-Za-z0-9ঀ-৿]{3,}[\s,]/);
  return !!m;
}

/* 35 (the real danger behind the timing). "Gabtoli, Bogura" is a Dhaka word
   and a district word in the same line, and the matcher picks whichever is
   LONGER — which made that address Inside Dhaka at ৳80 and would have cost
   the customer ৳40 more at the door. When both halves of the country appear
   in one address we do not guess at all: we ask, naming what we found. The
   zone list itself lives in the engine and is not touched here. */
function co_zoneRead(addr){
  /* R15: the national-list resolver reads the whole line (06-resolver.js) */
  if(typeof gzResolve === 'function') return gzResolve(addr);
  var base = zoneOf(addr);
  var t = ' '+String(addr||'').toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g,' ')+' ';
  var hit = function(list){
    if(!list) return null;
    var best = null;
    for(var i=0;i<list.length;i++){ var k = list[i];
      if(t.indexOf(' '+k+' ')>=0 || t.indexOf(' '+k+',')>=0 || t.indexOf(k)>=0){ if(!best || k.length>best.length) best = k; } }
    return best;
  };
  var dh = (typeof DHAKA_CITY!=='undefined') ? hit(DHAKA_CITY) : null;
  var ou = (typeof OUTSIDE!=='undefined') ? hit(OUTSIDE) : null;
  if(dh && ou) return {zone:null, sure:false, both:[dh, ou]};
  return base;
}
function co_titleCase(s){ return String(s||'').replace(/\b[a-z]/g, function(m){ return m.toUpperCase(); }); }

/* ---------- state & money ---------- */
var CO_DEFAULTS = {name:'', phone:'', address:'', payment:'cod', mb:'bkash', cardType:'visa', wallet:false, noteOpen:false, note:'', sumOpen:false, zonePick:null, prefillFor:null, addrRead:'', ask:'', addrPick:null};
/* R15 wave 1 (bug 14). Typed details survive a pull-to-refresh / reload:
   the draft is kept in this tab's sessionStorage (never sent anywhere, gone
   when the tab closes) and cleared the moment the order is placed. */
var CO_DRAFT_KEY = 'extas-co-draft';
var CO_DRAFT_FIELDS = ['name','phone','address','note','noteOpen','payment','mb','cardType','optSms','optWa','wallet','zonePick'];
function co_saveDraft(){
  var u = UI['checkout']; if(!u) return;
  var d = {}; CO_DRAFT_FIELDS.forEach(function(k){ d[k] = u[k]; });
  try{ sessionStorage.setItem(CO_DRAFT_KEY, JSON.stringify(d)); }catch(e){}
}
function co_loadDraft(u){
  try{ var d = JSON.parse(sessionStorage.getItem(CO_DRAFT_KEY) || 'null'); if(!d) return;
    CO_DRAFT_FIELDS.forEach(function(k){ if(d[k] !== undefined) u[k] = d[k]; });
    if(u.address) u.addrRead = u.address;
  }catch(e){}
}
function co_clearDraft(){ try{ sessionStorage.removeItem(CO_DRAFT_KEY); }catch(e){} }
window.addEventListener('pagehide', co_saveDraft);
function co_state(){
  var fresh = !UI['checkout'];
  var u = ui('checkout', CO_DEFAULTS);
  if(fresh) co_loadDraft(u);
  /* ui() only seeds defaults the first time a key is made. Anything else that
     touched UI['checkout'] first (a deep link, a test harness) left it half
     empty and the page rendered with NO payment method selected, so top up any
     key that is missing rather than trusting the first caller. */
  for(var k in CO_DEFAULTS) if(!(k in u)) u[k] = CO_DEFAULTS[k];
  var acc = currentAccount();
  if(acc && u.prefillFor!==acc.phone){
    if(!u.name) u.name = acc.name||''; if(!u.phone) u.phone = acc.phone||'';
    /* 46. One saved address fills itself in; two or more are offered as a
       choice and nothing is filled in until he picks one. */
    var bk = co_addrBook(acc);
    if(!u.address && bk.length===1){ u.address = bk[0]; u.addrPick = 0; }
    u.prefillFor = acc.phone;
  }
  /* R15 note 23.1: two offer ticks, kept apart — they start from what this
     customer chose last time, else the owner's defaults (SMS on, WhatsApp off) */
  if(typeof u.optSms!=='boolean' || typeof u.optWa!=='boolean'){ var cs = typeof consentStart==='function' ? consentStart(acc) : {sms:true, wa:false}; if(typeof u.optSms!=='boolean') u.optSms = cs.sms; if(typeof u.optWa!=='boolean') u.optWa = cs.wa; }
  /* an address we did not type (saved, or picked from the book) is finished
     the moment it arrives — there is nothing to wait for */
  if(u.address && !u.addrRead && u.addrPick!=null) u.addrRead = u.address;
  return u;
}
/* 46. The customer's address book. Older accounts carry a single `address`
   string; both shapes are read here so nothing has to be migrated. */
function co_addrBook(acc){
  if(!acc) return [];
  var list = (acc.addresses || []).slice();
  if(!list.length && acc.address) list = [acc.address];
  return list.filter(function(a){ return String(a||'').trim().length>=8; });
}
function co_calc(u){
  var tot = bagTotals(), off = bag_bestOffer(tot.total), acc = currentAccount();
  var addr = String(u.address||'').trim();
  var hasAddr = addr.length >= 8;
  /* 39: payment opens after one finished word. 35: the ZONE waits for the
     second word and for typing to stop. The two gates are deliberately
     different — one opens the next step, the other spends the customer's
     money, so it is the slow one. */
  var oneWord = co_wordDone(addr) || (co_words(addr).length >= 2);
  var settled = !!u.addrRead && String(u.addrRead).trim()===addr && co_words(addr).length >= 2;
  var zr = settled ? co_zoneRead(addr) : {zone:null, sure:false};
  var zone = u.zonePick || zr.zone;
  var zoneSure = !!u.zonePick || (settled && zr.sure);
  /* 36. One rule, shared with the bag: campaign, free-delivery product, or
     the cart over the threshold. When it is free, no charge is computed at
     all — so none can be shown. */
  var fdel = bag_freeDel(tot.total), free = fdel.free;
  var delivery = free ? 0 : ((zone && zoneSure) ? deliveryCharge(zone, tot.total) : null);
  var base = tot.total - off.amount + (delivery||0);
  var walletUsed = (u.wallet && acc && acc.wallet>0) ? Math.min(acc.wallet, base) : 0;
  var regular = tot.subtotal + (delivery||0);       /* 33: before every discount */
  var saved = tot.discount + off.amount;
  return {tot:tot, off:off, acc:acc, hasAddr:hasAddr, oneWord:oneWord, settled:settled,
    zone:zone, zoneSure:zoneSure, zonePicked:!!u.zonePick, zoneBoth:(zr.both||null), zoneBands:(zr.bands||null), free:free, fdel:fdel,
    delivery:delivery, walletUsed:walletUsed, grand:base-walletUsed, regular:regular, saved:saved};
}
/* 47. The disabled button has to answer two questions at once: what is still
   missing, and what happens when it is filled in. "Add your name to continue"
   answered neither — a customer could not tell that confirming the order was
   the next step at all. */
function co_ready(u){
  if(String(u.name||'').trim().length<2) return {ok:false, what:'your name', msg:'Add your name to confirm your order', field:'co-name'};
  /* K10 (owner, 20 Oct): any digits used to pass — even one. Only a real
     Bangladeshi mobile number (01[3-9] + 8 digits; +880 / 880, spaces,
     dashes and Bengali digits are read the same way) confirms the order. */
  var ph0 = checkPhone(u.phone);
  if(ph0.state==='empty') return {ok:false, what:'your phone number', msg:'Add your phone number to confirm your order', field:'co-phone'};
  if(ph0.state!=='ok') return {ok:false, what:'an 11-digit mobile number', msg:ph0.msg, field:'co-phone', bad:true};
  if(String(u.address||'').trim().length<8) return {ok:false, what:'your address', msg:'Add your address to confirm your order', field:'co-address'};
  return {ok:true};
}
function co_payment(u){ return u.payment==='mb' ? (u.mb||'bkash') : (u.payment==='card' ? 'card' : (u.payment==='online' ? 'online' : 'cod')); }
function co_payLabel(u){
  if(u.payment==='mb') return ({nagad:'Nagad', rocket:'Rocket', upay:'Upay'})[u.mb] || 'bKash';
  if(u.payment==='card') return ({visa:'Visa card', mastercard:'Mastercard', amex:'Amex card', bank:'internet banking'})[u.cardType||'visa'];
  if(u.payment==='online') return 'Online payment ('+(typeof co_pmName==='function' ? co_pmName('ssl') : 'SSLCommerz')+')';
  return 'Cash on Delivery';
}

/* The real WhatsApp mark on every WhatsApp control in checkout, thank-you and
   My account — the line-art speech bubble read as a generic chat icon. `rich`
   lets the label carry its own markup; everything else is escaped. */
function co_waBtn(label, text, cls, rich){
  return '<a class="wa-btn wa-real '+(cls||'')+'" href="'+waLink(text)+'" target="_blank" rel="noopener">'+
    waGlyph(18)+'<span class="wa-lbl">'+(rich ? label : esc(label||'Message us on WhatsApp'))+'</span></a>';
}

/* ---------- pieces ---------- */
function co_hd(n, title, off){ return '<div class="co-hd"><span class="co-num">'+n+'</span><h2 class="h2">'+esc(title)+'</h2></div>'; }
/* K10: the "wrong number" line shows after the field is left (blur) or after
   a Confirm press — not on the first digit typed. Once shown it follows the
   typing, so it goes away the moment the number is right. */
function co_phoneShow(){ var u = UI['checkout']; return !!(u && (u.phoneChecked || u.tried)); }
/* Note 54 #9 (owner): the hint is a small chip INSIDE the phone box, on its
   right edge — it never pushes the address down. A wrong number shows only
   after the cursor leaves the box (or after Confirm), as a short "8/11 digits";
   the full sentence stays for screen readers. It clears the moment the number
   is right, and then says the cleaned number back (K10). */
function co_phoneShort(ph){
  var n = String(ph.digits||'').replace(/\D/g, '').length, bn = ST.lang==='bn';
  if(n && n < 11) return bn ? zs_bnNumSafe(n)+'/১১ সংখ্যা' : n+'/11 digits';
  if(n > 11) return bn ? 'সংখ্যা বেশি' : 'Too many digits';
  return bn ? 'নম্বরটা দেখুন' : 'Check the number';
}
function zs_bnNumSafe(n){ return typeof zs_bnNum==='function' ? zs_bnNum(n) : String(n); }
function co_phoneHint(ph){
  if(ph.state==='warn' && (!co_phoneShow() || UI['checkout'].ask==='co-phone')) return '';   /* the boxed line says it then */
  /* K10: the cleaned number is said back ("We'll call 01712-345678"); what was typed stays in the box */
  if(ph.state==='ok') return '<span class="co-chip ok">'+ico('check',13)+'<span class="co-chip-t"><span class="co-chip-w">'+esc(cot('We\'ll call'))+' </span><b data-testid="co-phone-clean">'+esc(ph.nice)+'</b></span></span>';
  if(ph.state==='warn') return '<span class="co-chip warn" aria-hidden="true">'+ico('info',13)+'<span class="co-chip-t">'+esc(co_phoneShort(ph))+'</span></span><span class="sr">'+esc(ph.msg)+'</span>';
  return '';
}
/* the typed number never runs under the chip: the box keeps room on its right */
function co_chipPad(){
  var inp = document.getElementById('co-phone'), h = document.getElementById('co-phone-hint'); if(!inp || !h) return;
  var c = h.querySelector('.co-chip'); inp.style.paddingRight = c ? (Math.ceil(c.getBoundingClientRect().width) + 18)+'px' : '';
}
function co_delivery(c){
  var days = String(SET('delivery','insideDays')).split(/[^0-9]/)[0]+'–'+String(SET('delivery','outsideDays')).replace(/^[^0-9]*[0-9]+[^0-9]+/,'');
  /* ---- 36. FREE: not one charge anywhere on this block --------------------
     The owner's single most important point. Whether it is free because the
     item carries free delivery, because a campaign is running, or because
     the bag passed the threshold, this block says one thing and no number. */
  if(c.free){
    return '<section class="card co-sec" data-testid="co-delivery">'+co_hd(2,COLBL('delivery'))+
      '<div class="co-freebox mt12" data-testid="co-free">'+ico('truck',24)+
        '<div class="grow"><div class="h3">'+esc(cot('Free home delivery'))+'</div>'+
        '<div class="small text2">'+esc(cotLine(bag_freeWhy(c.fdel)))+'</div></div>'+
        '<span class="bg-freeb">'+ico('check',13)+(ST.lang==='bn'?'ফ্রি':'FREE')+'</span></div>'+
      /* R15 · 4.2. Hours, for THIS address's band once it is known (owner's
         settings insideHours / outsideHours / promise) — not "1–4 days". */
      /* Note 54 #10: on a desktop "Try it on in front of the rider" sits on the
         right of the promise row (one row, not two); the phone keeps its own line */
      '<div class="co-promrow"><p class="co-fdays co-promise">'+ico('clock',14)+'<span>'+esc(cotLine(deliveryPromise(c.zoneSure ? c.zone : null)))+'</span></p>'+co_trialChip()+'</div>'+
      co_trial('hide-d')+'</section>';
  }
  /* ---- not free: the rates, and what happens next ------------------------
     This box used to be empty until an address appeared, which told the
     customer nothing at all about the step he was looking at. */
  if(!c.hasAddr || !c.settled){
    return '<section class="card co-sec" data-testid="co-delivery">'+co_hd(2,COLBL('delivery'))+
      '<div class="co-rates">'+ico('truck',16)+'<span>'+esc(cot('Inside Dhaka'))+' <b>'+fmt(SET('delivery','inside'))+'</b>'+
        '<span class="co-rsep">·</span>'+esc(cot('Outside Dhaka'))+' <b>'+fmt(SET('delivery','outside'))+'</b></span></div>'+
      '<p class="co-fdays">'+ico('info',14)+'<span>'+(c.hasAddr
        ? cot('Reading your address — your charge appears here in a moment.')
        : cot('Write your address above and your charge appears here.'))+'</span></p>'+
      (c.fdel.left>0 ? '<p class="co-fdays">'+ico('gift',14)+'<span>Add '+fmt(c.fdel.left)+' more to the bag and delivery is free.</span></p>' : '')+
      co_trial()+'</section>';
  }
  if(!c.zoneSure){
    /* R15: the buttons are the bands that are actually in doubt (two places
       named → those two; nothing to go on → all three), each with its charge */
    var zb = (c.zoneBands && c.zoneBands.length) ? c.zoneBands.slice() : ['in','sub','out'];
    if(zb.indexOf('in')<0 && zb.indexOf('out')<0) zb.push('out');
    var zbtn = function(z){ return '<button type="button" class="co-zbtn" data-act="co-zone" data-v="'+z+'"><b>'+esc(zoneName(z))+'</b><span>'+fmt(zoneFee(z))+' · '+esc(zoneHours(z))+' hours</span></button>'; };
    var seenZ = {}; zb = zb.filter(function(z){ var e = zoneEff(z); if(seenZ[e]) return false; seenZ[e] = 1; return true; });
    /* 38. One line, in words anyone reads. The old sentence ran to two. */
    return '<section class="card co-sec" data-testid="co-delivery">'+co_hd(2,COLBL('delivery'))+
      '<p class="co-zask">'+esc(cot('Where is this address?'))+'</p>'+
      (c.zoneBoth ? '<p class="co-zboth">'+ico('info',14)+'<span>We can see <b>'+esc(co_titleCase(c.zoneBoth[0]))+'</b> and <b>'+esc(co_titleCase(c.zoneBoth[1]))+'</b> in it \u2014 which one is right?</span></p>' : '')+
      '<div class="co-zpick'+(zb.length>2?' z3':'')+'">'+zb.map(zbtn).join('')+'</div></section>';
  }
  var inside = c.zone==='in';
  var charge = zoneFee(c.zone);
  var zdays = zoneDays(c.zone);
  return '<section class="card co-sec" data-testid="co-delivery">'+co_hd(2,COLBL('delivery'))+
    '<div class="co-zone mt16">'+ico('truck',22)+'<div class="grow"><div class="h3" data-testid="co-zone">'+esc(zoneName(c.zone))+'</div><div class="small text2">'+esc(deliveryPromise(c.zone))+' <button type="button" class="link co-zchg" data-act="co-zone" data-v="ask">'+esc(cot('change'))+'</button></div></div><div class="shrink0"><b class="price">'+fmt(charge)+'</b></div></div>'+
    co_trial()+(SHOW('checkout','doorNote') ? '<p class="co-door">'+esc(cot('Returning at the door? Pay only the delivery charge to the rider.'))+'</p>' : '')+'</section>';
}
/* R15 note 23.9: trial at the door, next to the delivery promise (owner's setting) */
function co_trial(extra){ return typeof trialLineHTML==='function' ? trialLineHTML('co-trial'+(extra ? ' '+extra : ''), 'co-trial') : ''; }
function co_trialChip(){
  if(typeof trialOn!=='function' || !trialOn()) return '';
  return '<span class="co-trialchip hide-m" data-testid="co-trial-d" title="'+esc(OPTL('trial.help'))+'">'+ico('check',14)+'<span>'+esc(OPTL('trial.line'))+'</span><i class="co-flit" aria-hidden="true"></i></span>';
}
function co_pay(c, u){
  /* 39. It opens after ONE finished word of the address — a word of three
     letters or more and a space — not after eight letters.
     And until it opens it is not an empty box: it names what can be paid
     with, so the customer knows what is coming. */
  /* K9 (owner, 20 Oct) — ROOT CAUSE of "sometimes one line, sometimes boxes":
     rule 39 drew this block as one row of name tags until the ADDRESS had a
     finished word, and the address itself comes back from this tab's saved
     draft (bug 14) or a logged-in account. So the same page showed the tags
     (nothing to choose) on a fresh visit and the boxes after any earlier
     visit or a refresh. On a desktop the boxes now always show and every
     method can be chosen before the address; the phone keeps rule 39. */
  var soon = !c.oneWord ? '<section class="card co-sec co-soon" data-testid="co-pay">'+co_hd(3,COLBL('payment'))+
    '<div class="co-soonrow">'+['Cash on Delivery','bKash','Nagad','Visa','Mastercard'].map(function(x){ return '<span class="co-badge">'+esc(x)+'</span>'; }).join('')+'</div>'+
    '<p class="co-fdays">'+ico('lock',14)+'<span>'+esc(cot('Opens as you write your address. Cash on Delivery is ready by default.'))+'</span></p></section>' : '';
  var due = fmt(c.grand);
  /* Note 54 #13 (owner): Cash on Delivery is open; the others stay closed until
     tapped. Real brand marks (bKash, Nagad, Rocket, Visa, Mastercard, Amex,
     bank) and the online payment gateway are back. Which methods show, their
     words and the wallet / card lists are the owner's (Admin › Settings ›
     Payment at checkout) — co_payCfg() below. */
  var P = co_payCfg(), cur = co_payCur(u, P);
  var opt = function(v, title, sub, mark, body){
    var on = cur===v;
    return '<div class="co-po co-po-'+v+(on?' on':'')+'"><button type="button" class="co-po-hd" data-act="co-pay" data-v="'+v+'" aria-pressed="'+on+'" aria-expanded="'+on+'"><span class="co-radio" aria-hidden="true"></span>'+
      '<span class="grow co-po-tx"><span class="h3" style="display:block">'+title+'</span><span class="xs muted co-po-sub" style="display:block">'+sub+'</span></span><span class="co-po-mk">'+mark+'</span></button>'+
      (on && body ? '<div class="co-po-bd">'+body+'</div>' : '')+'</div>';
  };
  var tiles = function(act, curV, list){ return '<div class="co-pmt" role="group">'+list.map(function(id){ var on = curV===id;
    return '<button type="button" class="co-pmtb'+(on?' on':'')+'" data-act="'+act+'" data-v="'+id+'" aria-pressed="'+on+'">'+co_pmk(id)+'<span>'+esc(co_pmName(id))+'</span></button>'; }).join('')+'</div>'; };
  var marks = function(list, n){ return '<span class="co-pmks">'+list.slice(0, n||4).map(co_pmk).join('')+'</span>'; };
  var h = '';
  if(P.cod) h += opt('cod', esc(COLBL('payCod')), esc(COLBL('payCodSub')), co_pmk('cod'),
      '<div class="small" data-testid="co-cod-note"><b>'+esc(cot('Total due'))+' '+due+'</b> — '+esc(cot('pay the rider at your door.'))+'</div>');
  if(P.mb) h += opt('mb', esc(COLBL('payMb')), marks(P.mbList, 3), '',
      tiles('co-mb', u.mb, P.mbList)+'<div class="xs muted mt8">Approve '+due+' in the '+esc(co_pmName(u.mb))+' app. (Demo)</div>');
  if(P.card) h += opt('card', esc(COLBL('payCard')), marks(P.cardList, 4), '',
      tiles('co-card', u.cardType, P.cardList)+'<div class="xs muted mt8">Secure payment of '+due+' on the next step. (Demo)</div>');
  if(P.online) h += opt('online', esc(COLBL('payOnline')), esc(COLBL('payOnlineSub')), co_pmk('ssl'),
      '<div class="small">'+esc(cot('You go to the secure payment page to pay'))+' <b>'+due+'</b>. '+esc(cot('Cards, mobile banking and net banking.'))+' (Demo)</div>');
  return (soon ? '<div class="hide-d">'+soon+'</div><div class="hide-m">' : '')+'<section class="card co-sec co-paysec" data-testid="'+(soon ? 'co-pay-desk' : 'co-pay')+'">'+co_hd(3,COLBL('payment'))+'<div class="stack s8 mt12">'+h+
  '</div></section>'+(soon ? '</div>' : '');
}
/* ---- Note 54 #13 · payment methods: the owner's switches and lists ---- */
var CO_PM = {
  cod:{n:'Cash on Delivery'}, bkash:{n:'bKash'}, nagad:{n:'Nagad'}, rocket:{n:'Rocket'}, upay:{n:'Upay'},
  visa:{n:'Visa'}, mastercard:{n:'Mastercard'}, amex:{n:'Amex'}, bank:{n:'Internet banking'}, ssl:{n:'SSLCommerz'}
};
function co_pmName(id){ return id==='ssl' ? String(OPT('co.pay.gateway')||'SSLCommerz') : (CO_PM[id] ? CO_PM[id].n : String(id||'')); }
/* a brand mark drawn in CSS + SVG (no image files, no network) */
function co_pmk(id){
  var t = '';
  if(id==='mastercard') t = '<svg viewBox="0 0 40 24" width="30" height="18" aria-hidden="true"><circle cx="15" cy="12" r="9" fill="#EB001B"/><circle cx="25" cy="12" r="9" fill="#F79E1B"/><path d="M20 4.5a9 9 0 0 1 0 15 9 9 0 0 1 0-15Z" fill="#FF5F00"/></svg>';
  else if(id==='bank') t = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 9.5 12 4l9 5.5v1.5H3Z" fill="currentColor"/><path d="M5 12.5h2.4v5H5Zm5.8 0h2.4v5h-2.4Zm5.8 0H19v5h-2.4ZM3 18.5h18V20H3Z" fill="currentColor"/></svg><b>BANK</b>';
  else if(id==='cod') t = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v.01M18 14.5v.01" stroke-linecap="round" stroke-width="2.4"/></svg><b>COD</b>';
  else if(id==='ssl') t = '<b>SSL</b><i>COMMERZ</i>';
  else if(id==='visa') t = '<b>VISA</b>';
  else if(id==='amex') t = '<b>AMEX</b>';
  else t = '<b>'+esc(co_pmName(id))+'</b>';
  return '<span class="pmk pmk-'+esc(id)+'" title="'+esc(co_pmName(id))+'" role="img" aria-label="'+esc(co_pmName(id))+'">'+t+'</span>';
}
function co_payList(k, def){ var ok = {bkash:1, nagad:1, rocket:1, upay:1, visa:1, mastercard:1, amex:1, bank:1};
  var l = String(OPT(k)==null ? def : OPT(k)).split(',').map(function(x){ return x.trim().toLowerCase(); }).filter(function(x){ return ok[x]; });
  return l.length ? l : def.split(','); }
function co_payCfg(){
  return {cod:OPT('co.pay.cod')!==false, mb:OPT('co.pay.mb')!==false, card:OPT('co.pay.card')!==false, online:OPT('co.pay.online')!==false,
    mbList:co_payList('co.pay.mbList', 'bkash,nagad,rocket'), cardList:co_payList('co.pay.cardList', 'visa,mastercard,amex,bank')};
}
/* the chosen method, falling back to the first one switched on */
function co_payCur(u, P){
  P = P || co_payCfg(); var on = ['cod','mb','card','online'].filter(function(k){ return P[k]; });
  if(!on.length) on = ['cod'];
  if(on.indexOf(u.payment)<0) u.payment = on[0];
  if(u.payment==='mb' && P.mbList.indexOf(u.mb)<0) u.mb = P.mbList[0];
  if(u.payment==='card' && P.cardList.indexOf(u.cardType)<0) u.cardType = P.cardList[0];
  return u.payment;
}
function co_offers(c, u){
  var acc = c.acc; if(!acc) return '';
  var h = '';
  if(c.off.amount) h += '<div class="row between small co-offrow" data-testid="co-offer"><span class="row top" style="gap:10px"><span class="brandc">'+ico('tag',17)+'</span><span><b>'+esc(c.off.offer.title)+'</b><br><span class="xs muted">'+(c.off.code ? 'Code '+esc(c.off.offer.code)+' applied' : 'Applied automatically')+'</span></span></span><b class="brandc shrink0">'+fmt(-c.off.amount)+'</b></div>';
  if(c.off.note) h += '<div class="xs muted">'+esc(c.off.note)+'</div>';
  if(acc.wallet>0) h += '<label class="check"><input type="checkbox" data-change="co-wallet"'+(u.wallet?' checked':'')+'><span>'+esc(cot('Use my wallet'))+' <b>'+fmt(acc.wallet)+'</b>'+(c.walletUsed ? ' <span class="brandc">· '+fmt(-c.walletUsed)+' on this order</span>' : '')+'</span></label>';
  /* R15 wave 2 (CO27): the wallet amount taken off is a visible line here too
     (on a phone the order summary is folded away) */
  if(c.walletUsed) h += '<div class="row between small" data-testid="co-wallet-row"><span>'+esc(cot('Wallet'))+'</span><b class="brandc">'+fmt(-c.walletUsed)+'</b></div>';
  if(!h) return '';
  return '<section class="card co-sec"><div class="h3">'+esc(cot('Your offers'))+'</div><div class="stack s12 mt12">'+h+'</div></section>';
}
function co_upsell(){
  var p = P('cotton-socks-3'); if(!p) return '';
  var inBag = ST.bag.some(function(l){ return l.kind==='item' && l.product===p.id; });
  return '<div class="card co-sec co-ups row" style="gap:12px" data-testid="co-upsell"><div class="co-th">'+bag_img(p, p.colors[0], {ratio:'ratio-11', label:false})+'</div>'+
    '<div class="grow"><div class="small bold">'+esc(p.name)+' <span class="price" style="margin-left:4px">'+fmt(p.price)+'</span></div><div class="xs muted">'+esc(cot('Goes in the same parcel'))+'</div></div>'+
    (inBag ? '<span class="tag">'+ico('check',13)+'Added</span>' : '<button type="button" class="btn btn-secondary btn-sm" data-act="co-ups">'+ico('plus',15)+'Add</button>')+'</div>';
}
function co_summary(c){
  var tot = c.tot;
  var items = tot.lines.map(function(x){
    var l = x.line;
    if(l.kind==='item'){ var p = P(l.product);
      /* 41. Quantity is editable here, so nobody has to walk back to the bag.
         When somebody takes three or more of one thing the total jumps, and a
         jumping total is the most common reason an order is abandoned — so the
         per-piece price is spelled out and we say plainly that sizes can be
         mixed, which is usually what they actually wanted. */
      var many = l.qty >= 3;
      return '<div class="co-it"><div class="co-th">'+bag_img(p, l.color, {ratio:'ratio-11', label:false})+(l.qty>1?'<span class="co-qb">'+l.qty+'</span>':'')+'</div>'+
        '<div class="grow" style="min-width:0"><div class="small bold">'+esc(p.name)+'</div>'+
          '<div class="xs muted">'+esc(COL(l.color).name)+' · '+esc(l.size)+(l.qty>1?' · '+fmt(p.price)+' each':'')+'</div>'+
          (typeof bag_priceNote==='function' ? bag_priceNote(l, p) : '')+
          '<div class="co-qrow">'+
            '<span class="qty qty-xs" role="group" aria-label="Quantity">'+
              '<button type="button" data-act="co-qty" data-id="'+l.id+'" data-q="'+(l.qty-1)+'" aria-label="One less"'+(l.qty<=1?' disabled':'')+'>'+ico('minus',14)+'</button>'+
              '<span aria-live="polite">'+l.qty+'</span>'+
              '<button type="button" data-act="co-qty" data-id="'+l.id+'" data-q="'+(l.qty+1)+'" aria-label="One more">'+ico('plus',14)+'</button>'+
            '</span>'+
            '<button type="button" class="link xs" data-act="co-remove" data-id="'+l.id+'">'+esc(cot('Remove'))+'</button>'+
          '</div>'+
          (many ? '<div class="co-many">'+ico('info',13)+'<span>'+l.qty+' of the same size. Buying for others? <a class="link" href="#/bag">Mix the sizes in your bag</a> — same price.</span></div>' : '')+
        '</div><div class="small price">'+fmt(x.price)+'</div></div>'; }
    return '<div class="co-it"><div class="co-th">'+setImg(l.items, {ratio:'ratio-11'})+'</div>'+
      '<div class="grow" style="min-width:0"><div class="small bold">'+esc(typeof bag_setShort==='function' && l.kind==='set' ? bag_setShort(l) : l.name)+'</div><div class="xs muted">'+l.items.map(function(it){ return esc(COL(it.color).name)+' · '+esc(it.size); }).join(', ')+'</div></div>'+
      '<div style="text-align:right"><div class="small price">'+fmt(x.price)+'</div>'+(x.regular>x.price?'<div class="strike xs">'+fmt(x.regular)+'</div>':'')+'</div></div>';
  });
  /* D-044 (desktop): with more than 3 lines the side summary shows the first 3
     and a "+N more" switch, so Confirm order always stays on the screen. The
     wrapper is a plain block (the phone summary draws it exactly as before)
     and the switch carries hide-m. */
  var CO_SHOW = 3;
  if(items.length > CO_SHOW){
    var open = !!(UI['checkout'] && UI['checkout'].sumMore), more = items.length - CO_SHOW;
    items = items.slice(0, CO_SHOW).join('')+'<div class="co-xtra'+(open?' open':'')+'">'+items.slice(CO_SHOW).join('')+'</div>'+
      '<button type="button" class="link co-xbtn hide-m" data-act="co-sum-more" aria-expanded="'+open+'">'+(open ? ico('up',14)+esc(cot('Show less')) : ico('down',14)+'+'+more+' '+esc(cot(more===1 ? 'more item' : 'more items')))+'</button>';
  } else items = items.join('');
  var r = function(k, v, cls){ return '<div class="co-r'+(cls?' '+cls:'')+'"><span>'+k+'</span><span>'+v+'</span></div>'; };
  /* R16 (7): a set is ONE row at its price; the subtotal is the sum of the rows */
  var rows = r(esc(cot('Subtotal')), fmt(tot.rowsSubtotal!=null ? tot.rowsSubtotal : tot.subtotal));
  /* owner review (bag page, item 8): the same plain words as the bag — "Buy 2 and save" */
  tot.setDiscounts.forEach(function(d){ if(d.line) return; rows += r(esc(typeof bag_saveLabel==='function' ? bag_saveLabel(d) : d.label), fmt(-d.amount), 'disc'); });
  if(c.off.amount) rows += r(esc(c.off.label), fmt(-c.off.amount), 'disc');
  if(c.walletUsed) rows += r('Wallet', fmt(-c.walletUsed), 'disc');
  /* 36. A free delivery line carries NO figure — not even a struck-out one.
     The owner was plain about it: "why would you show me a charge?" */
  var del;
  if(c.free) del = '<span class="bg-freeb" data-testid="co-sum-free">'+ico('check',13)+'FREE</span>';
  else if(c.delivery===null) del = '<span class="muted">'+esc(cot('After your address'))+'</span>';
  else del = fmt(c.delivery);
  rows += r(esc(cot('Delivery')), del);
  var save = c.saved;
  /* 33. The regular price, struck through, beside the total — so the saving
     is visible at the one moment the customer is deciding. */
  var struck = save>0 ? '<span class="co-was"><span class="strike">'+fmt(c.regular)+'</span><span class="co-saved">'+esc(cot('You save'))+' '+fmt(save)+'</span></span>' : '';
  return '<div class="h3" style="margin-bottom:6px">'+esc(cot('Order summary'))+' · <span class="co-cnt" data-testid="co-count">'+(ST.lang==='bn' ? tot.count+' '+cot('items') : plural(tot.count,'item'))+'</span></div><div>'+items+'</div><div class="co-rows">'+rows+'</div>'+
    '<div class="co-tot"><span>'+esc(cot('Total'))+'</span><span class="co-totv"><span class="price" data-testid="co-total">'+fmt(c.grand)+'</span>'+(c.delivery===null && !c.free?' <span class="xs muted">'+esc(cot('+ delivery'))+'</span>':'')+'</span></div>'+
    struck;
}
function co_confirmLabel(c, r){
  /* the amount is not final until we know the zone — say so rather than
     quoting a total the customer will not actually be charged */
  var amt = fmt(c.grand) + ((c.delivery===null && !c.free) ? ' + delivery' : '');
  /* 42(b), the owner's version: the button never looks switched off, so it is
     always obvious what it is for. Tapping it says what is missing, in
     Bengali, from inside the field itself. */
  if(r.ok || CO_BLOCKED_STYLE==='b') return ico('lock',18)+esc(COLBL('confirm'))+'<span class="co-amt">· '+amt+'</span>';
  /* 42(a): two lines — the missing piece on top, what comes next below */
  return '<span class="co-need"><b>'+esc(ST.lang==='bn' ? cot(r.what)+' '+cot('above') : 'Add '+r.what+' above')+'</b><span>'+ico('lock',13)+' '+esc(cot('then this button confirms your order'))+' · '+amt+'</span></span>';
}
function co_confirm(c, r, extra){
  var b = CO_BLOCKED_STYLE==='b';
  var off = !r.ok && !b;                                    /* only (a) disables */
  return '<button type="submit" class="btn btn-primary btn-block co-confirm'+(off?' co-need-on':'')+(extra?' '+extra:'')+'"'+(off?' disabled':'')+' data-testid="co-confirm">'+co_confirmLabel(c, r)+'</button>';
}
function co_empty(){
  return '<div class="container co-wrap"><div class="card center co-empty" data-testid="co-empty"><div class="bg-emptyic">'+ico('bag',32)+'</div>'+
    '<h1 class="h1 mt16">'+esc(cot('Your bag is empty'))+'</h1><p class="text2">'+esc(cot('Add something to your bag first, then come back to check out.'))+'</p>'+
    '<div class="row wrap mt16" style="justify-content:center;gap:10px"><a class="btn btn-primary" href="#/c/new">'+esc(cot('Start shopping'))+'</a><a class="btn btn-ghost" href="#/bag">'+esc(cot('Go to bag'))+'</a></div></div></div>';
}

/* ---------- page ---------- */
/* Note 54 #6: the three fields in the owner's order (Admin › Settings › Checkout words) */
function co_fieldOrder(){
  var v = String(typeof OPT==='function' ? (OPT('co.fieldOrder')||'') : ''), ok = {name:1, phone:1, address:1}, out = [];
  v.split(',').forEach(function(k){ k = k.trim(); if(ok[k] && out.indexOf(k)<0) out.push(k); });
  ['name','phone','address'].forEach(function(k){ if(out.indexOf(k)<0) out.push(k); });
  return out;
}
function co_fields(u, ph, fld){
  var F = {
    name: fld('co-name','<label class="label" for="co-name">'+esc(COLBL('name'))+'</label><input id="co-name" class="input" data-input="co-name" enterkeyhint="next" autocomplete="name"'+(COLBL('namePh')?' placeholder="'+esc(COLBL('namePh'))+'"':'')+' value="'+esc(u.name)+'">'),
    phone: fld('co-phone','<label class="label" for="co-phone">'+esc(COLBL('phone'))+'</label><div class="co-inwrap"><input id="co-phone" class="input'+(ph.state==='ok'?' ok':(ph.state==='warn' && co_phoneShow()?' warn':''))+'" type="tel" inputmode="tel" enterkeyhint="next" data-input="co-phone" autocomplete="tel" placeholder="'+esc(COLBL('phonePh'))+'" value="'+esc(u.phone)+'" aria-describedby="co-phone-hint">'+
        '<div id="co-phone-hint" class="co-hint co-hint-in" aria-live="polite">'+co_phoneHint(ph)+'</div></div>'),
    address: fld('co-address','<label class="label" for="co-address">'+esc(COLBL('address'))+'</label><textarea id="co-address" class="input co-addr" rows="2" data-input="co-address" autocomplete="street-address" placeholder="'+esc(COLBL('addressPh'))+'">'+esc(u.address)+'</textarea>')
  };
  return co_fieldOrder().map(function(k){ return F[k]; }).join('');
}
function co_render(){
  if(!ST.bag.length) return co_empty();
  var u = co_state(), c = co_calc(u), r = co_ready(u), ph = checkPhone(u.phone);
  /* 43+48. No slab behind it any more — it reads as part of the page, the
     wording is spelled out on both sides and one slow light runs across it,
     the same rhythm as the logo sheen and the primary buttons. */
  var help = '<div class="co-help"><div class="container row between" style="gap:12px">'+
    '<span class="co-helpt"><span class="co-hl">'+esc(cot('Need help with your order?'))+'</span><span class="co-hs">'+esc(cot('Need help?'))+'</span></span>'+
    co_waBtn('<b>WhatsApp</b> <span class="co-wa-s">us</span>', 'Hi EXTAS, I need help with my order', 'co-wa', true)+
    '</div></div>';
  var msum = '<div class="co-msum'+(u.sumOpen?' open':'')+'" data-act="co-sum-area"><button type="button" class="co-msum-btn" data-act="co-sum" aria-expanded="'+(!!u.sumOpen)+'">'+
    '<span class="row" style="gap:8px">'+ico('bag',18)+'<span>'+esc(cot(u.sumOpen?'Hide order summary':'Show order summary'))+'</span>'+'<span class="co-msum-chev">'+ico(u.sumOpen?'up':'down',14)+'</span></span>'+'<span class="co-msum-amt"><span class="price" id="co-msum-total">'+fmt(c.grand)+'</span>'+
      (c.saved>0 ? '<span class="co-msum-was"><span class="strike">'+fmt(c.regular)+'</span><span class="co-msum-save">\u2212'+fmt(c.saved)+'</span></span>' : '')+'</span></button>'+
    (u.sumOpen ? '<div class="co-msum-bd" id="co-sum-m">'+co_summary(c)+
      '<button type="button" class="co-msum-close" data-act="co-sum">'+ico('up',14)+esc(cot('Hide summary'))+'</button></div>' : '')+'</div>'+
    /* 46. A tap anywhere outside closes it. A transparent sheet behind the panel
       does that without a document-wide click handler, so the inputs, the links
       and the sticky confirm bar (which sit above it) keep working normally. */
    (u.sumOpen ? '<div class="co-sumback" data-act="co-sum" aria-hidden="true"></div>' : '');
  /* 42. A field the customer has been sent back to is wrapped in its own box
     and carries the Bengali line inside that box. Everything else is
     untouched, so nothing moves on the page when it appears. */
  var fld = function(id, inner){ return '<div class="co-f'+(u.ask===id?' ask':'')+'" data-field="'+id+'">'+inner+(u.ask===id?co_askHTML(id):'')+'</div>'; };
  var book = co_addrBook(c.acc);
  /* 46. Two saved addresses are offered as a choice; one fills itself in. */
  var picker = (book.length>1) ? '<div class="co-book" role="group" aria-label="Your saved addresses">'+
      book.map(function(a, i){
        var on = u.addrPick===i;
        return '<button type="button" class="co-bookb'+(on?' on':'')+'" data-act="co-addrpick" data-i="'+i+'" aria-pressed="'+on+'">'+
          ico(i===0?'home':'box',15)+'<span>'+esc(a)+'</span></button>';
      }).join('')+
      '<a class="link co-bookadd" href="#/account/profile">'+ico('plus',14)+'Manage addresses</a></div>' : '';
  var address = '<section class="card co-sec">'+co_hd(1,COLBL('heading'))+
    (c.acc ? '' : (SHOW('checkout','loginNudge') ? '<p class="xs muted co-sub">Ordered before? <a href="#/login">Log in</a> for your saved address and offers.</p>' : ''))+
    picker+
    '<div class="stack s16 mt16">'+
      co_fields(u, ph, fld)+
    '</div></section>';
  /* C12. The one control that was loose on the page now lives in a card like
     everything else. */
  /* K6 (owner, desktop): the delivery note is always open, in bigger text — the
     phone keeps its "+ Add a delivery note" button (the open box is hide-m) */
  var note = '<div class="card co-sec co-notecard">'+(u.noteOpen
    ? '<label class="label" for="co-note">'+esc(COLBL('note'))+'</label><input id="co-note" class="input" data-input="co-note" value="'+esc(u.note)+'" placeholder="e.g. Leave it with the guard if I\'m out">'
    : '<button type="button" class="co-noteadd hide-d" data-act="co-note">'+ico('plus',16)+'<span>'+esc(COLBL('noteAdd'))+'</span></button>'+
      '<div class="hide-m co-note-d"><label class="label" for="co-note-d">'+esc(COLBL('note'))+'</label><input id="co-note-d" class="input" data-input="co-note" value="'+esc(u.note)+'" placeholder="e.g. Leave it with the guard if I\'m out"></div>')+'</div>';
  /* R15 wave 2 (E03): stock that ran short while the item sat in the bag is
     said at the top of checkout, before Confirm — with the way back to fix it */
  var sIssues = typeof bagStockIssues==='function' ? bagStockIssues() : [];
  var stockNote = sIssues.length ? '<div class="zc-note bad co-stocknote" role="alert" data-testid="co-stock-issue">'+ico('info',14)+'<span>'+esc(sIssues[0].msg)+' <a class="link" href="#/bag">Fix it in your bag</a></span></div>' : '';
  /* Note 54 #11 (owner): the SMS line and the long "not returned or refunded"
     sentence are gone; "Items can be exchanged for size" opens the policy */
  var msgs = '<section class="card co-sec stack s12 co-msgs">'+
    consentTicksHTML(u.optSms, u.optWa, 'co-consent', 'co-consent')+
    '<p class="xs muted co-terms" style="margin:0"><a class="link" href="#/page/exchange" data-testid="co-exch-link">'+esc(COLBL('exch'))+'</a>'+
      (COLBL('terms') ? '<span class="co-tsep" aria-hidden="true"> · </span><a class="link" href="#/page/terms">'+esc(COLBL('terms'))+'</a>' : '')+'</p></section>';
  var trust = '<div class="row wrap xs muted mt12" style="justify-content:center;gap:6px 14px"><span class="row" style="gap:5px">'+ico('cash',14)+esc(cot('Cash on Delivery'))+'</span><span class="row" style="gap:5px">'+ico('swap',14)+esc(cot('Size exchange in'))+' '+esc(SET('exchange','windowHours'))+' '+esc(cot('hours'))+'</span><span class="row" style="gap:5px">'+ico('lock',14)+esc(cot('Secure payment'))+'</span></div>';
  return '<form data-submit="co-place" id="co-form" novalidate>'+
    (SHOW('checkout','helpStripDesktop') ? help : '<div class="co-help-m">'+help+'</div>')+msum+
    '<div class="container co-wrap co-lay-'+(typeof coC_layout==='function' ? coC_layout() : 'classic')+'"><div class="split-side">'+
      '<div class="stack s16" style="min-width:0">'+
        '<h1 class="h1 co-donly">'+esc(cot('Checkout'))+'</h1>'+stockNote+(typeof bagEndedNoteHTML==='function' ? bagEndedNoteHTML('co-ended') : '')+
        address+
        '<div id="co-delivery">'+co_delivery(c)+'</div>'+
        '<div id="co-pay">'+co_pay(c, u)+'</div>'+
        '<div id="co-offers">'+co_offers(c, u)+'</div>'+
        co_upsell()+note+(typeof ftGiftCard==='function' ? ftGiftCard(u) : '')+msgs+
      '</div>'+
      '<aside class="co-side"><div class="co-float">'+
        '<div class="card p20"><div id="co-sum-d">'+co_summary(c)+'</div><div class="mt16">'+co_confirm(c, r)+'</div>'+trust+'</div>'+
        '<a class="co-sidehelp" href="'+waLink('Hi EXTAS, I need help with my order')+'" target="_blank" rel="noopener">'+
          waGlyph(19)+'<span class="co-sh-t"><span class="co-sh-q">'+esc(COLBL('helpQ'))+'</span> <b>'+esc(COLBL('helpA'))+'</b></span>'+ico('right',15)+'<i class="co-flit" aria-hidden="true"></i></a>'+
      '</div></aside>'+
    '</div></div>'+
    '<div class="mbar dm-hide co-mbar">'+co_confirm(c, r)+'</div>'+
  '</form>';
}
PAGES.checkout = { layout:'checkout', title:function(){ return cot('Checkout'); }, render:co_render, after:function(){ try{ co_chipPad(); }catch(e){} try{ if(ST.bag.length && UI['checkout'] && UI['checkout'].tried) co_markInvalid(); }catch(e){} co_deskAlign(); setTimeout(co_deskAlign, 120); } };
/* D-044 (desktop). The summary box starts on the same pixel line as the first
   form card — measured, not a fixed 74px (it was 19px low) — and the column
   it rides in runs the full height of the form, so it really floats (CSS in
   r12-zzdesk-b.css). The sticky top follows the header's real height. */
function co_deskAlign(){
  var side = document.querySelector('.co-wrap .co-side'); if(!side) return;
  var fl = side.querySelector('.co-float');
  if(!(typeof dkb_desk==='function' && dkb_desk())){ side.style.paddingTop = ''; if(fl){ fl.style.top = ''; fl.style.maxHeight = ''; } return; }
  var first = document.querySelector('.co-wrap .split-side > .stack > .card');
  side.style.paddingTop = '0px';
  if(first){ var d = first.getBoundingClientRect().top - side.getBoundingClientRect().top; side.style.paddingTop = Math.max(0, Math.round(d))+'px'; }
  var hdr = document.querySelector('.hdr'), top = 16;
  if(hdr && /sticky|fixed/.test(getComputedStyle(hdr).position)) top += Math.round(hdr.getBoundingClientRect().height);
  if(fl){ fl.style.top = top+'px'; fl.style.maxHeight = 'calc(100vh - '+(top+16)+'px)'; }
  if(typeof coC_fitFloat==='function') coC_fitFloat();   /* K4: never clip the card or the help box */
}
window.addEventListener('resize', function(){ if(document.querySelector('.co-wrap .co-side')) co_deskAlign(); });
ACT['co-sum-more'] = function(){ var u = co_state(); u.sumMore = !u.sumMore; co_patch(); co_deskAlign(); };

/* patch the live parts without re-rendering (keeps focus while typing) */
function co_set(id, html){ var el = document.getElementById(id); if(!el || el._h===html) return; el._h = html; el.innerHTML = html; }
/* R15 wave 2 (AX13): after a refused Confirm, every field that is still
   wrong carries aria-invalid="true" and aria-describedby → the line that
   says what to fix (the Bengali prompt, the phone hint, or a short line
   for a screen reader). Fixed fields lose the mark as they are typed. */
function co_markInvalid(u){
  u = u || co_state(); if(!u.tried) return;
  var bad = {
    'co-name': String(u.name||'').trim().length<2 ? 'Add your name to confirm the order.' : '',
    'co-phone': checkPhone(u.phone).state!=='ok' ? (checkPhone(u.phone).msg || 'Add your mobile number to confirm the order.') : '',
    'co-address': String(u.address||'').trim().length<8 ? 'Add your full address to confirm the order.' : ''
  };
  Object.keys(bad).forEach(function(id){
    var el = document.getElementById(id); if(!el) return;
    var wrap = el.closest('.co-f'), old = document.getElementById('co-err-'+id);
    if(!bad[id]){ el.removeAttribute('aria-invalid'); if(old && old.classList.contains('sr')) old.remove(); el.setAttribute('aria-describedby', id==='co-phone' ? 'co-phone-hint' : ''); if(!el.getAttribute('aria-describedby')) el.removeAttribute('aria-describedby'); return; }
    el.setAttribute('aria-invalid', 'true');
    var ask = wrap && wrap.querySelector('.co-askmsg'), ids = [];
    if(ask){ ask.id = 'co-err-'+id; ids.push(ask.id); }
    else if(id==='co-phone' && (document.getElementById('co-phone-hint')||{}).textContent){ ids.push('co-phone-hint'); }
    else { if(!old){ old = document.createElement('span'); old.className = 'sr'; old.id = 'co-err-'+id; old.setAttribute('role','alert'); el.insertAdjacentElement('afterend', old); } old.textContent = bad[id]; ids.push(old.id); }
    el.setAttribute('aria-describedby', ids.join(' '));
  });
}
function co_patch(){
  var u = co_state(), c = co_calc(u), r = co_ready(u);
  co_saveDraft(); if(u.tried) co_markInvalid(u);
  co_set('co-delivery', co_delivery(c));
  co_set('co-pay', co_pay(c, u));
  co_set('co-offers', co_offers(c, u));
  co_set('co-sum-d', co_summary(c));
  co_set('co-sum-m', co_summary(c));
  var mt = document.getElementById('co-msum-total'); if(mt) mt.textContent = fmt(c.grand);
  /* the "what is missing" skin has to come off the moment the form is valid —
     patching only .disabled left a filled-in form showing the amber button */
  Array.prototype.forEach.call(document.querySelectorAll('.co-confirm'), function(b){
    /* R15 wave 2: in the owner's style 'b' the button is never switched off
       (a tap says, in Bengali, what is missing) — typing used to disable it */
    var off = !r.ok && CO_BLOCKED_STYLE !== 'b';
    b.disabled = off;
    b.classList.toggle('co-need-on', off);
    b.innerHTML = co_confirmLabel(c, r);
  });
}

/* ---------- inputs & actions ---------- */
/* 42. The moment he starts writing in the field we sent him to, the Bengali
   prompt has done its job and comes off again. */
function co_clearAsk(u, id){ if(u.ask===id){ u.ask = ''; var w = document.querySelector('.co-f[data-field="'+id+'"]'); if(w){ w.classList.remove('ask'); var m = w.querySelector('.co-askmsg'); if(m) m.parentNode.removeChild(m); } } }
INPUT['co-name'] = function(el){ var u = co_state(); u.name = el.value; co_clearAsk(u,'co-name'); co_patch(); };
INPUT['co-phone'] = function(el){
  /* R15 wave 1 (bug 8): Bengali digits (০১৭…) become 0–9 as they are typed */
  if(/[০-৯]/.test(el.value)){ var pos = el.selectionStart; el.value = bnDigits(el.value); try{ el.setSelectionRange(pos, pos); }catch(e){} }
  var u = co_state(); u.phone = el.value; var ph = checkPhone(el.value);
  co_clearAsk(u,'co-phone');
  var hint = document.getElementById('co-phone-hint'); if(hint) hint.innerHTML = co_phoneHint(ph);
  el.classList.toggle('ok', ph.state==='ok'); el.classList.toggle('warn', ph.state==='warn' && co_phoneShow());
  co_chipPad();
  co_patch();
};
/* K10: checked when the customer leaves the field (and again on Confirm).
   What was typed is never cleared or rewritten. */
document.addEventListener('focusout', function(ev){
  var el = ev.target; if(!el || el.id!=='co-phone' || !UI['checkout']) return;
  var u = co_state(); if(!String(el.value||'').trim()) return;
  u.phoneChecked = true;
  var ph = checkPhone(el.value), hint = document.getElementById('co-phone-hint');
  if(hint) hint.innerHTML = co_phoneHint(ph);
  el.classList.toggle('ok', ph.state==='ok'); el.classList.toggle('warn', ph.state==='warn');
  co_chipPad();
  if(ph.state==='warn'){ el.setAttribute('aria-invalid','true'); el.setAttribute('aria-describedby','co-phone-hint'); }
  else el.removeAttribute('aria-invalid');
}, true);
ACT['co-zone'] = function(el){ var v = el.getAttribute('data-v'); var u = co_state();
  u.zonePick = (v==='ask') ? null : v; render(); };
/* 35. Typing never decides anything. The line is only read when it holds two
   real words AND the keyboard has been quiet for CO_SETTLE ms — so "Gabtoli"
   cannot price the order before "Bogura" has had its chance to arrive. */
INPUT['co-address'] = function(el){
  var u = co_state(); u.address = el.value; u.zonePick = null; u.addrRead = ''; u.addrPick = null;
  co_clearAsk(u,'co-address');
  if(CO_ADDR_TIMER) clearTimeout(CO_ADDR_TIMER);
  var val = el.value;
  CO_ADDR_TIMER = setTimeout(function(){
    CO_ADDR_TIMER = null;
    var s = co_state();
    if(String(s.address)!==String(val)) return;              /* he kept typing */
    if(co_words(val).length < 2) return;                     /* still one word */
    s.addrRead = val; co_patch();
  }, CO_SETTLE);
  co_patch();
};
/* 46. Pick one of the saved addresses — a saved address needs no settling
   time, it is already finished. */
ACT['co-addrpick'] = function(el){
  var u = co_state(), acc = currentAccount(), book = co_addrBook(acc), i = Number(el.getAttribute('data-i'));
  if(!book[i]) return;
  u.address = book[i]; u.addrRead = book[i]; u.addrPick = i; u.zonePick = null; u.ask = '';
  rerender();
};
INPUT['co-note'] = function(el){ co_state().note = el.value; co_saveDraft(); };
CHANGE['co-wallet'] = function(el){ co_state().wallet = el.checked; co_patch(); };
CHANGE['co-consent'] = function(el){ var u = co_state(); if(el.getAttribute('data-k')==='wa') u.optWa = el.checked; else u.optSms = el.checked; co_saveDraft(); };
ACT['co-pay'] = function(el){ co_state().payment = el.getAttribute('data-v'); rerender(); };
ACT['co-mb'] = function(el){ var u = co_state(); u.payment = 'mb'; u.mb = el.getAttribute('data-v'); rerender(); };
ACT['co-card'] = function(el){ var u = co_state(); u.payment = 'card'; u.cardType = el.getAttribute('data-v'); rerender(); };
ACT['co-qty'] = function(el){
  var id = el.getAttribute('data-id'), q = Number(el.getAttribute('data-q'));
  if(q < 1) return; bagSetQty(id, q); saveState(); rerender();
};
ACT['co-remove'] = function(el){
  bagRemove(el.getAttribute('data-id')); saveState();
  if(!ST.bag.length){ toast('Your bag is empty'); go('#/bag'); return; }
  rerender(); toast('Removed');
};
ACT['co-sum'] = function(){ var u = co_state(); u.sumOpen = !u.sumOpen; rerender(); };
/* 32. Tapping the panel itself closes it too — not only the small chevron.
   Anything interactive inside keeps working, because those handle their own click. */
ACT['co-sum-area'] = function(el, ev){
  var u = co_state(); if(!u.sumOpen) return;
  if(ev.target.closest('a,button,input,select,textarea,label')) return;
  u.sumOpen = false; rerender();
};
ACT['co-note'] = function(){ co_state().noteOpen = true; rerender(); var i = document.getElementById('co-note'); if(i) i.focus(); };
ACT['co-ups'] = function(){
  var p = P('cotton-socks-3'); if(!p) return;
  /* bagAdd can refuse (already there, or a double tap inside 1.2s) — it used
     to say "added" either way, which is how a customer ends up tapping again */
  var res = bagAdd({kind:'item', product:p.id, color:p.colors[0], size:p.sizes[0], qty:1});
  rerender();
  toast(res && res.added ? p.name+' added to your order' : p.name+' is already in your order');
};
/* R15 wave 1 (bug 3). Enter — or the phone keyboard's Go / Next — in a
   checkout field NEVER places the order. It moves to the next field (the
   last one just closes the keyboard). The browser's "implicit submission"
   presses the first submit button, which IS Confirm, so the old submitter
   check could not tell the two apart; the key is now stopped before it can
   submit, and only a real press of the Confirm button reaches SUBMIT. */
document.addEventListener('keydown', function(ev){
  if(ev.key !== 'Enter' || ev.isComposing) return;
  var el = ev.target; if(!el || !el.closest || !el.closest('#co-form')) return;
  if(el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;
  ev.preventDefault();
  var list = [].filter.call(document.querySelectorAll('#co-form input:not([type=checkbox]):not([type=radio]):not([type=hidden]), #co-form textarea, #co-form select'), function(x){ return !x.disabled && x.getClientRects().length; });
  var i = list.indexOf(el);
  if(i >= 0 && i < list.length - 1) list[i+1].focus(); else el.blur();
}, true);
SUBMIT['co-place'] = function(f, ev){
  if(ev && ev.submitter && !ev.submitter.classList.contains('co-confirm')) return;
  var u = co_state(), r = co_ready(u);
  /* R16 (3): never place an order the stock cannot cover (sets + loose items) */
  var sIss = typeof bagStockIssues==='function' ? bagStockIssues() : [];
  if(sIss.length){ toast(sIss[0].msg); go('#/bag'); return; }
  if(!r.ok){
    u.tried = true;
    /* 42(b). The order is not placed — but nobody is left guessing either.
       The field lights up, the page scrolls to it, and the line inside the
       box says in Bengali what to write there. */
    if(CO_BLOCKED_STYLE==='b'){
      u.ask = r.field; rerender(); co_markInvalid(u);
      var w = document.querySelector('.co-f[data-field="'+r.field+'"]');
      if(w && w.scrollIntoView) try{ w.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){ w.scrollIntoView(); }
      var el2 = document.getElementById(r.field);
      if(el2) setTimeout(function(){ try{ el2.focus({preventScroll:true}); }catch(e){ el2.focus(); } }, 240);
      toast((r.bad && CO_ASK['co-phone-bad'].bn) || (CO_ASK[r.field] && CO_ASK[r.field].bn) || r.msg);
      return;
    }
    co_markInvalid(u); toast(r.msg); var fe = document.getElementById(r.field); if(fe) fe.focus(); return;
  }
  var c = co_calc(u), payment = co_payment(u);
  var pairs = bracketPairs().map(function(b){ return {key:b.key, product:b.product, color:b.color, sizes:b.sizes.slice(), ack:ST.bracketAck[b.key]||''}; });
  var id = placeOrder({name:String(u.name).trim(), phone:u.phone, address:String(u.address).trim(), payment:payment, offers:!!(u.optSms || u.optWa), consent:{sms:!!u.optSms, wa:!!u.optWa, src:'checkout'}, note:u.note||'',
    walletUsed:c.walletUsed, extraDiscount:c.off.amount + c.walletUsed, source:'website'});
  if(!id){ toast('Your bag is empty'); return; }
  var o = ST.orders[id];
  /* 36. placeOrder() prices delivery from the zone and the cart total alone,
     so an order that was promised free delivery for its PRODUCT (or under a
     campaign) came out of it carrying ৳80. The promise on the checkout page
     is the one that counts — the order is corrected here before anything is
     shown, so the thank-you page, My orders and the invoice all agree. */
  if(c.free && o.delivery){ o.total -= o.delivery; o.delivery = 0; }
  o.freeDelivery = !!c.free;
  o.offer = c.off.amount ? {label:c.off.label, title:c.off.offer.title, amount:c.off.amount, code:c.off.code ? c.off.offer.code : null} : null;
  o.walletUsed = c.walletUsed;
  o.payLabel = co_payLabel(u);
  o.paid = payment==='cod' ? 0 : o.total;
  o.bracket = pairs;
  if(c.off.code) ST.appliedCode = null;
  saveState();
  delete UI['checkout']; co_clearDraft();
  go('#/thanks/'+id);
};
