/* =====================================================================
   89-admin-system.js — প্রহরী Prohori · admin demos (Version 12)
   #/admin/settings  Settings framework, two tiers (PR 491/492/509/510)
   #/admin/backup    Google Drive backup + restore (PR 395/396/507)
   #/admin/audit     Checklist audit runner (PR 570 on S21 413–424, gate PR 420)
   #/admin/health    Server health + Telegram alerts (PR 423)
   DEMO ONLY: every value lives in ST.sys (this browser). Nothing is sent
   anywhere — no Drive, no Telegram, no server. Editing a setting writes to
   the same place the shop already reads (SET(), SHOWN, HDR_WA_PAGES,
   ST.pdpPayLine, ST.heroBtns, ST.invoiceTpl, ST.thanksMsg, DB.whatsapp),
   so the storefront changes at once.
   Routes and sidebar links are registered from this file (no shared file edited).
   ===================================================================== */

/* ---------- routes ---------- */
(function(){
  var add = function(re, name){ try{ if(!ROUTES.some(function(r){ return r[1]===name; })) ROUTES.push([re, name]); }catch(e){} };
  add(/^\/admin\/settings$/, 'admin-settings');
  add(/^\/admin\/backup$/, 'admin-backup');
  add(/^\/admin\/audit$/, 'admin-audit');
  add(/^\/admin\/health$/, 'admin-health');
})();

/* ---------- admin menu: System group + Agents link (wraps adminShell like 87 does) ---------- */
var ZS_SYS_LINKS = [['Settings','#/admin/settings','settings'],['Backup','#/admin/backup','shield'],['Site audit','#/admin/audit','check'],['Server health','#/admin/health','bolt']];
var ZS_AGENT_LINK = ['Agents','#/admin/agents','user'];
(function(){
  try{
    var orig = window.adminShell; if(typeof orig!=='function' || orig._zs) return;
    var w = function(body, cur){
      var out = orig.apply(this, arguments);
      try{
        var p = (cur && cur.path) || '';
        var isOn = function(h){ var x = h.slice(1); return p===x || p.indexOf(x+'/')===0; };
        var side = function(l, mk){ return '<a class="'+(isOn(l[1])?'on':'')+'" href="'+l[1]+'" '+(mk||'data-zs')+'>'+ico(l[2],18)+esc(l[0])+'</a>'; };
        var chip = function(l, mk){ return '<a class="chip'+(isOn(l[1])?' on':'')+'" href="'+l[1]+'" '+(mk||'data-zs')+'>'+esc(l[0])+'</a>'; };
        if(out.indexOf('data-zs-ag')<0){
          out = out.replace(/(<a class="[^"]*" href="#\/admin\/ai">[\s\S]*?<\/a>)/g, function(m){ return m + (/class="chip/.test(m) ? chip(ZS_AGENT_LINK, 'data-zs-ag') : side(ZS_AGENT_LINK, 'data-zs-ag')); });
        }
        if(out.indexOf('data-zs-sys')<0){
          var mark = '<div class="xs" style="color:#9FBDB4;padding:16px 12px 6px">In the full build</div>';
          out = out.replace(mark, function(m){ return '<div class="zs-sidegrp" data-zs-sys>System</div>'+ZS_SYS_LINKS.map(function(l){ return side(l); }).join('')+m; });
          out = out.replace(/(<div class="admin-tabs hide-d mb16">[\s\S]*?)(<\/div>)/, function(m, a, b){ return a+ZS_SYS_LINKS.map(function(l){ return chip(l); }).join('')+b; });
          out = out.replace(/<a class="soon">(?:(?!<\/a>)[\s\S])*?Server health<\/a>/, '');
        }
      }catch(e){}
      return out;
    };
    w._zs = true; window.adminShell = w;
  }catch(e){}
})();

/* ---------- shared helpers (89b uses them too) ---------- */
function zs_sw(on, act, label, extra){
  return '<button type="button" class="switch'+(on?' on':'')+'" role="switch" aria-checked="'+(on?'true':'false')+'" aria-label="'+esc(label)+'" data-act="'+act+'" '+(extra||'')+'></button>';
}
function zs_head(eyebrow, title, bn, desc, right){
  return '<div class="zs-hd row between top wrap" style="gap:12px"><div style="min-width:0;flex:1 1 320px"><div class="eyebrow">'+eyebrow+'</div><h1 class="h1">'+title+'</h1>'+(bn?'<div class="zs-bn">'+bn+'</div>':'')+
    (desc?'<p class="text2 zs-bnp">'+desc+'</p>':'')+'</div>'+(right?'<div class="zs-actions">'+right+'</div>':'')+'</div>';
}
function zs_pr(s){ return '<span class="zs-pr">PR '+esc(s)+'</span>'; }
function zs_simTag(t){ return '<span class="zs-sim">'+ico('info',12)+esc(t||'Demo · simulated')+'</span>'; }
function zs_bar(pct, cls){ pct = Math.max(0, Math.min(100, Math.round(pct))); return '<div class="zs-bar'+(cls?' '+cls:'')+'"><i style="width:'+pct+'%"></i></div>'; }
function zs_hash(s){ var h = 2166136261; s = String(s); for(var i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0); }
function zs_rnd(seed){ return (zs_hash(seed) % 100000) / 100000; }
function zs_bnNum(n){ var d = '০১২৩৪৫৬৭৮৯'; return String(n).replace(/[0-9]/g, function(c){ return d[+c]; }); }
function zs_time(ts){ var d = new Date(ts); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' · '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); }
var ZS_AGENTS = [
  {id:'prohori', en:'Prohori', bn:'প্রহরী', role:'Foundation · server, settings, security, backup, audit', col:'#2E4A62'},
  {id:'bhandari', en:'Bhandari', bn:'ভান্ডারী', role:'Warehouse · catalogue, courier, ERP, documents', col:'#7A5A2E'},
  {id:'sawdagor', en:'Sawdagor', bn:'সওদাগর', role:'Shop · pages, combos, cart, checkout, payments', col:'#1F4E46'},
  {id:'shilpi', en:'Shilpi', bn:'শিল্পী', role:'Design · every customer-facing screen', col:'#8A3D5A'},
  {id:'doot', en:'Doot', bn:'দূত', role:'Promotion · SEO, content, CRM, social, analytics', col:'#2A7AB0'},
  {id:'gyani', en:'Gyani', bn:'জ্ঞানী', role:'Brain · AI 360, fraud, rules, finance, support', col:'#5B4A8A'},
  {id:'tirondaj', en:'Tirondaj', bn:'তীরন্দাজ', role:'Ads · Google, Facebook, Instagram, YouTube, TikTok', col:'#A0522D'}
];
function zs_agent(id){ for(var i=0;i<ZS_AGENTS.length;i++) if(ZS_AGENTS[i].id===id) return ZS_AGENTS[i]; return null; }
function zs_av(a, cls){ var p = (typeof za_prof==='function') ? za_prof(a.id) : null; if(p && p.photo && /^data:image\//.test(p.photo)) return '<span class="'+(cls||'av')+'" style="background:'+a.col+' center/cover no-repeat url('+p.photo+')" aria-hidden="true"></span>'; var c = (p && p.avatar) || a.col; return '<span class="'+(cls||'av')+'" style="background:'+c+'">'+esc(((p && p.name) || a.bn).charAt(0))+'</span>'; }
function zs_steps(list, phase){
  return '<div class="zs-steps">'+list.map(function(s, i){ var n = i+1, st = n<phase ? 'done' : (n===phase ? 'now' : '');
    return '<div class="zs-step '+st+'"><span class="zs-sdot">'+(st==='done'?ico('check',13):'')+'</span><span>'+esc(s)+(st==='now'?'…':'')+'</span></div>'; }).join('')+'</div>';
}
/* run a list of steps in a modal (shared by backup, restore, audit, re-tests) */
function zs_runSteps(key, steps, ms, done){
  var u = UI[key]; if(!u) return; var tok = u.tok = Date.now(); u.phase = 1; refreshModal();
  steps.forEach(function(s, i){
    setTimeout(function(){
      if(UI[key]!==u || u.tok!==tok) return;
      u.phase = i+2;
      if(u.phase>steps.length){ try{ done(u); }catch(e){ console.error(e); } }
      if(MODAL && MODAL.opts && MODAL.opts.zsKey===key) refreshModal();
    }, (i+1)*ms);
  });
}
function zs_ensure(){
  if(!ST.sys) ST.sys = {};
  var s = ST.sys;
  if(!s.inst) s.inst = {}; if(!s.store) s.store = {}; if(!s.tier) s.tier = 'store';
  return s;
}

/* =====================================================================
   1. SETTINGS — typed registry, two tiers (installation → store)
   ===================================================================== */
var ZS_DEF = {
  header: SHOWN.header.whatsapp, fab: SHOWN.fab.whatsapp, payFree: SHOWN.pdp.payLineWithFree,
  waPages: JSON.parse(JSON.stringify(typeof HDR_WA_PAGES!=='undefined' ? HDR_WA_PAGES : {'*':true})),
  waTip: (typeof HDR_WA_TIP!=='undefined' ? HDR_WA_TIP : 'Need help? Chat with us'),
  wa: DB.whatsapp, hot: DB.hotline
};
function zs_deliv(k){ var r = null; DB.rules.forEach(function(x){ if(x.id==='delivery') r = x; }); return r ? r.settings[k] : ''; }
function zs_setDeliv(k, v){
  var o = ST.rulesOverride.delivery = ST.rulesOverride.delivery || {}; o.settings = o.settings || {}; o.settings[k] = v;
}
function zs_invGet(grp, k){ var T = inv_tpl(); return grp ? (T[grp]||{})[k] : T[k]; }
function zs_invDef(grp, k){ return grp ? (INVOICE_TPL[grp]||{})[k] : INVOICE_TPL[k]; }
function zs_invSet(grp, k, v){
  var o = ST.invoiceTpl = ST.invoiceTpl || {};
  if(grp){ o[grp] = o[grp] || {}; o[grp][k] = v; } else o[k] = v;
}
var ZS_WA_PAGES = [['home','Home'],['category','Category'],['search','Search'],['product','Product'],['combo','Combo'],['set','Build a set'],['bag','Bag'],['thanks','Thank you'],['account','Account'],['order','Order'],['page','Help pages'],['journal','Journal'],['landing','Ad landing']];
var ZS_MSG = [
  {k:'placed', en:'Order placed', bn:'অর্ডার দেওয়ার সাথে সাথে', ch:'SMS'},
  {k:'confirmed', en:'Order confirmed', bn:'অর্ডার কনফার্ম হলে', ch:'SMS'},
  {k:'processing', en:'Processing / packed', bn:'প্যাক হওয়ার সময়', ch:'WhatsApp'},
  {k:'shipped', en:'Handed to courier', bn:'কুরিয়ারে দিলে', ch:'SMS'},
  {k:'out', en:'Out for delivery', bn:'ডেলিভারিতে বের হলে', ch:'SMS'},
  {k:'delivered', en:'Delivered', bn:'ডেলিভারি হলে', ch:'SMS'},
  {k:'review', en:'Review request', bn:'রিভিউ চাওয়া', ch:'WhatsApp'}
];
var ZS_MSG_DEF = {placed:true, confirmed:true, processing:true, shipped:false, out:false, delivered:false, review:false};
function zs_msgApply(v){
  v = v || ZS_MSG_DEF; var c = !!v.confirmed, p = !!v.processing;
  var isDef = Object.keys(ZS_MSG_DEF).every(function(k){ return !!v[k]===ZS_MSG_DEF[k]; });
  var m = ST.thanksMsg = ST.thanksMsg || {};
  if(isDef){ delete m.smsSent; delete m.smsNext; delete m.confirmNote; delete m.courierNote; return; }
  m.smsSent = v.placed ? 'We\'ve sent your order details by SMS to {phone}.' : 'Your order is placed — we\'ll contact {phone} when we confirm it.';
  var next = c && p ? 'You\'ll get one more SMS (and a WhatsApp) when we confirm and pack your order.' : c ? 'You\'ll get one more SMS when we confirm your order.' : p ? 'You\'ll get a WhatsApp when we pack your order.' : '';
  var later = []; if(v.shipped) later.push('when it\'s with the courier'); if(v.out) later.push('when it\'s out for delivery'); if(v.delivered) later.push('when it\'s delivered');
  if(later.length) next += (next?' ':'')+'We\'ll also SMS you '+later.join(', ')+'.';
  m.smsNext = next;
  m.confirmNote = c && p ? 'You get an SMS and a WhatsApp from us.' : c ? 'You get an SMS from us.' : p ? 'You get a WhatsApp from us.' : 'We call you only if something needs checking.';
  m.courierNote = v.shipped ? 'We SMS you, and {courier} sends the tracking link by SMS.' : '{courier} sends the tracking link by SMS.';
}
var ZS_LINK_OPTS = [['#/c/hoodies','Hoodies'],['#/c/polos','Polos'],['#/c/new','New in'],['#/combo/polo-duo','Polo Duo combo'],['#/set','Build your own set'],['#/c/panjabi','Panjabi'],['#/l/polo-duo','Ad landing · Polo Duo']];

/* type: num | text | sel | sw | pages | hero | msg ;  tier: both | inst | store(own data) */
var ZS_SETTINGS = [
  /* Delivery */
  {id:'del.inside', g:'delivery', en:'Inside Dhaka city charge (৳)', bn:'ঢাকা সিটির ভিতরে ডেলিভারি চার্জ', type:'num', where:'Product page · Bag · Checkout · FAQ', see:'#/checkout',
    get:function(){ return SET('delivery','inside'); }, set:function(v){ zs_setDeliv('inside', v); }, def:function(){ return zs_deliv('inside'); }},
  {id:'del.sub', g:'delivery', en:'Dhaka sub-area charge (৳)', bn:'ঢাকার আশেপাশের এলাকা (সাব-এরিয়া) চার্জ', type:'num', where:'Checkout (when the address is in a sub-area)', see:'#/checkout',
    get:function(){ return SET('delivery','sub'); }, set:function(v){ zs_setDeliv('sub', v); }, def:function(){ return zs_deliv('sub'); }},
  {id:'del.subMode', g:'delivery', en:'Sub-area is charged as', bn:'সাব-এরিয়ার চার্জ কোনটা ধরবে — নিজের, সিটির, না বাইরের', type:'sel', opts:[['own','Its own charge'],['city','Same as Dhaka city'],['outside','Same as outside Dhaka']], where:'Checkout · delivery band', see:'#/checkout',
    get:function(){ return SET('delivery','subMode'); }, set:function(v){ zs_setDeliv('subMode', v); }, def:function(){ return zs_deliv('subMode'); }},
  {id:'del.outside', g:'delivery', en:'Outside Dhaka charge (৳)', bn:'ঢাকার বাইরে ডেলিভারি চার্জ', type:'num', where:'Product page · Bag · Checkout', see:'#/checkout',
    get:function(){ return SET('delivery','outside'); }, set:function(v){ zs_setDeliv('outside', v); }, def:function(){ return zs_deliv('outside'); }},
  {id:'del.free', g:'delivery', en:'Free delivery over (৳)', bn:'কত টাকার উপরে ফ্রি ডেলিভারি', type:'num', where:'Announcement bar · Product page · Bag', see:'#/bag',
    get:function(){ return SET('delivery','freeOver'); }, set:function(v){ zs_setDeliv('freeOver', v); }, def:function(){ return zs_deliv('freeOver'); }},
  /* Delivery time */
  {id:'del.inH', g:'hours', en:'Inside Dhaka — hours', bn:'ঢাকা সিটিতে কত ঘণ্টায় পৌঁছায়', type:'text', where:'Checkout promise · Thank-you page', see:'#/checkout',
    get:function(){ return SET('delivery','insideHours'); }, set:function(v){ zs_setDeliv('insideHours', v); }, def:function(){ return zs_deliv('insideHours'); }},
  {id:'del.subH', g:'hours', en:'Sub-area — hours', bn:'সাব-এরিয়ায় কত ঘণ্টায়', type:'text', where:'Checkout promise', see:'#/checkout',
    get:function(){ return SET('delivery','subHours'); }, set:function(v){ zs_setDeliv('subHours', v); }, def:function(){ return zs_deliv('subHours'); }},
  {id:'del.outH', g:'hours', en:'Outside Dhaka — hours', bn:'ঢাকার বাইরে কত ঘণ্টায়', type:'text', where:'Checkout promise · Thank-you page', see:'#/checkout',
    get:function(){ return SET('delivery','outsideHours'); }, set:function(v){ zs_setDeliv('outsideHours', v); }, def:function(){ return zs_deliv('outsideHours'); }},
  {id:'del.promise', g:'hours', en:'Promise sentence ({hours} = the hours)', bn:'ঠিকানা জানার পর যে কথাটা দেখায়', type:'text', where:'Checkout · Bag', see:'#/checkout',
    get:function(){ return SET('delivery','promise'); }, set:function(v){ zs_setDeliv('promise', v); }, def:function(){ return zs_deliv('promise'); }},
  {id:'del.promiseAny', g:'hours', en:'Promise before the address is known', bn:'ঠিকানা জানার আগে যে কথাটা দেখায়', type:'text', where:'Bag · Checkout (empty address)', see:'#/bag',
    get:function(){ return SET('delivery','promiseAny'); }, set:function(v){ zs_setDeliv('promiseAny', v); }, def:function(){ return zs_deliv('promiseAny'); }},
  /* Payment line */
  {id:'pay.words', g:'payment', en:'Payment line words (split with | )', bn:'প্রোডাক্ট পেজে দামের পাশে পেমেন্টের লাইন', type:'text', where:'Product page, price row', see:'#/p/textured-knit-polo',
    get:function(){ var c = payLineCfg(); return (c.text && String(c.text).trim()) ? c.text : c.methods.join(' | '); },
    set:function(v){ var o = ST.pdpPayLine = ST.pdpPayLine || {}; var parts = String(v||'').split('|').map(function(x){ return x.trim(); }).filter(Boolean); o.text = ''; o.methods = parts.length ? parts : PDP_PAYLINE_DEFAULT.methods.slice(); o.separator = '|'; },
    def:function(){ return PDP_PAYLINE_DEFAULT.methods.join(' | '); }},
  {id:'pay.on', g:'payment', en:'Show the payment line', bn:'পেমেন্টের লাইন দেখাবে কিনা', type:'sw', where:'Product page, price row (products without a discount or free delivery)', see:'#/p/textured-knit-polo',
    get:function(){ return payLineCfg().on!==false; }, set:function(v){ var o = ST.pdpPayLine = ST.pdpPayLine || {}; o.on = !!v; }, def:function(){ return PDP_PAYLINE_DEFAULT.on!==false; }},
  {id:'pay.withFree', g:'payment', en:'Also show it on free-delivery products', bn:'ফ্রি ডেলিভারির প্রোডাক্টেও দেখাবে', type:'sw', global:true, where:'Product page, under the price', see:'#/p/essential-pique-polo',
    get:function(){ return SHOWN.pdp.payLineWithFree!==false; }, set:function(v){ SHOWN.pdp.payLineWithFree = !!v; }, def:function(){ return ZS_DEF.payFree!==false; }},
  /* WhatsApp */
  {id:'wa.header', g:'whatsapp', en:'WhatsApp icon in the header', bn:'হেডারে হোয়াটসঅ্যাপ আইকন', type:'sw', global:true, where:'Header, every page you tick below', see:'#/c/polos',
    get:function(){ return SHOWN.header.whatsapp!==false; }, set:function(v){ SHOWN.header.whatsapp = !!v; }, def:function(){ return ZS_DEF.header!==false; }},
  {id:'wa.pages', g:'whatsapp', en:'Pages that show the header WhatsApp', bn:'কোন কোন পেজে হেডারের হোয়াটসঅ্যাপ দেখাবে', type:'pages', global:true, where:'Header (checkout always uses its own help button)', see:'#/',
    get:function(){ var o = {}; ZS_WA_PAGES.forEach(function(p){ o[p[0]] = HDR_WA_PAGES.hasOwnProperty(p[0]) ? !!HDR_WA_PAGES[p[0]] : !!HDR_WA_PAGES['*']; }); return o; },
    set:function(v){ ZS_WA_PAGES.forEach(function(p){ if(v && v.hasOwnProperty(p[0])) HDR_WA_PAGES[p[0]] = !!v[p[0]]; }); },
    def:function(){ var o = {}; ZS_WA_PAGES.forEach(function(p){ o[p[0]] = ZS_DEF.waPages.hasOwnProperty(p[0]) ? !!ZS_DEF.waPages[p[0]] : !!ZS_DEF.waPages['*']; }); return o; }},
  {id:'wa.tip', g:'whatsapp', en:'Line under the header icon', bn:'আইকনের নিচে ছোট লেখা', type:'text', global:true, where:'Header (hover / press)', see:'#/',
    get:function(){ return HDR_WA_TIP; }, set:function(v){ HDR_WA_TIP = String(v||''); }, def:function(){ return ZS_DEF.waTip; }},
  {id:'wa.fab', g:'whatsapp', en:'Floating WhatsApp button', bn:'ভাসমান (ফ্লোটিং) হোয়াটসঅ্যাপ বাটন — বন্ধ রাখা আছে', type:'sw', global:true, where:'Bottom corner of category, bag, account… (never on Home / Product)', see:'#/c/polos',
    get:function(){ return SHOWN.fab.whatsapp!==false; }, set:function(v){ SHOWN.fab.whatsapp = !!v; }, def:function(){ return ZS_DEF.fab!==false; }},
  {id:'wa.number', g:'whatsapp', en:'WhatsApp number', bn:'হোয়াটসঅ্যাপ নম্বর — আপনার নিজের তথ্য', type:'text', tier:'store', global:true, where:'Every WhatsApp button', see:'#/page/contact',
    get:function(){ return DB.whatsapp; }, set:function(v){ DB.whatsapp = String(v||''); }, def:function(){ return ZS_DEF.wa; }},
  {id:'wa.hotline', g:'whatsapp', en:'Hotline number', bn:'হটলাইন নম্বর — আপনার নিজের তথ্য', type:'text', tier:'store', global:true, where:'Menu · Footer · Contact', see:'#/page/contact',
    get:function(){ return DB.hotline; }, set:function(v){ DB.hotline = String(v||''); }, def:function(){ return ZS_DEF.hot; }},
  /* Home */
  {id:'home.hero', g:'home', en:'Hero buttons', bn:'হোম পেজের বড় ছবির উপর বাটন (১–২টা)', type:'hero', where:'Home, first screen', see:'#/',
    get:function(){ return JSON.parse(JSON.stringify(ST.heroBtns || HERO_BTNS)); }, set:function(v){ ST.heroBtns = JSON.parse(JSON.stringify(v)); },
    def:function(){ return JSON.parse(JSON.stringify(HERO_BTNS)); }, reset:function(){ delete ST.heroBtns; }},
  /* Invoice */
  {id:'inv.title', g:'invoice', en:'Invoice title', bn:'ইনভয়েসের মাথার লেখা', type:'text', where:'Invoice (download / print)', see:'#/account/orders',
    get:function(){ return zs_invGet('labels','title'); }, set:function(v){ zs_invSet('labels','title', v); }, def:function(){ return zs_invDef('labels','title'); }},
  {id:'inv.tagline', g:'invoice', en:'Line under the logo', bn:'লোগোর নিচের লাইন', type:'text', where:'Invoice header', see:'#/account/orders',
    get:function(){ return zs_invGet('shop','tagline'); }, set:function(v){ zs_invSet('shop','tagline', v); }, def:function(){ return zs_invDef('shop','tagline'); }},
  {id:'inv.cod', g:'invoice', en:'Cash on delivery sentence ({total})', bn:'ক্যাশ অন ডেলিভারির লাইন', type:'text', where:'Invoice · payment box', see:'#/account/orders',
    get:function(){ return zs_invGet('labels','codDue'); }, set:function(v){ zs_invSet('labels','codDue', v); }, def:function(){ return zs_invDef('labels','codDue'); }},
  {id:'inv.return', g:'invoice', en:'Exchange note in the footer', bn:'নিচে এক্সচেঞ্জের লাইন', type:'text', where:'Invoice footer', see:'#/account/orders',
    get:function(){ return zs_invGet(null,'returnNote'); }, set:function(v){ zs_invSet(null,'returnNote', v); }, def:function(){ return zs_invDef(null,'returnNote'); }},
  /* Messages */
  {id:'msg.rule', g:'messages', en:'Which step sends which message', bn:'কোন ধাপে SMS / হোয়াটসঅ্যাপ যাবে — অর্ডারে ২টা SMS + প্রসেসিংয়ে ১টা হোয়াটসঅ্যাপ, এর পরে আর কিছু না', type:'msg', where:'SMS & WhatsApp · Thank-you page wording', see:'#/thanks/EX-1038',
    get:function(){ var v = ST.sys && ST.sys.msgRule; return JSON.parse(JSON.stringify(v || ZS_MSG_DEF)); },
    set:function(v){ zs_ensure().msgRule = JSON.parse(JSON.stringify(v)); zs_msgApply(v); },
    def:function(){ return JSON.parse(JSON.stringify(ZS_MSG_DEF)); }, reset:function(){ if(ST.sys) delete ST.sys.msgRule; zs_msgApply(null); }},
  {id:'msg.placedText', g:'messages', en:'Order-placed SMS text', bn:'অর্ডারের SMS-এর লেখা (নমুনা — কিছু পাঠানো হয় না)', type:'text', where:'SMS · simulated', see:'',
    get:function(){ return zs_ensure().smsPlaced || zs_smsDef('placed'); }, set:function(v){ zs_ensure().smsPlaced = v; }, def:function(){ return zs_smsDef('placed'); }, reset:function(){ delete zs_ensure().smsPlaced; }},
  {id:'msg.confirmText', g:'messages', en:'Order-confirmed SMS text', bn:'কনফার্মের SMS-এর লেখা', type:'text', where:'SMS · simulated', see:'',
    get:function(){ return zs_ensure().smsConfirm || zs_smsDef('confirmed'); }, set:function(v){ zs_ensure().smsConfirm = v; }, def:function(){ return zs_smsDef('confirmed'); }, reset:function(){ delete zs_ensure().smsConfirm; }},
  /* Installation-level */
  {id:'inst.currency', g:'install', en:'Currency', bn:'মুদ্রা', type:'sel', tier:'inst', opts:[['BDT','৳ Bangladeshi taka (BDT)']], where:'Everywhere',
    get:function(){ return zs_ensure().inst['inst.currency'] || 'BDT'; }, set:function(){}, def:function(){ return 'BDT'; }},
  {id:'inst.tz', g:'install', en:'Time zone', bn:'সময় অঞ্চল', type:'sel', tier:'inst', opts:[['Asia/Dhaka','Asia/Dhaka (GMT+6)']], where:'Order times · reports · schedules',
    get:function(){ return zs_ensure().inst['inst.tz'] || 'Asia/Dhaka'; }, set:function(){}, def:function(){ return 'Asia/Dhaka'; }},
  {id:'inst.units', g:'install', en:'Size chart units', bn:'সাইজ চার্টের মাপ', type:'sel', tier:'inst', opts:[['in','Inches (cm on tap)'],['cm','Centimetres']], where:'Size charts · Find my size',
    get:function(){ return zs_ensure().inst['inst.units'] || 'in'; }, set:function(){}, def:function(){ return 'in'; }},
  {id:'inst.backup', g:'install', en:'Backup destination', bn:'ব্যাকআপ কোথায় যাবে — শুধু গুগল ড্রাইভ', type:'sel', tier:'inst', locked:true, opts:[['gdrive','Google Drive (fixed)']], where:'Backup page', see:'#/admin/backup',
    get:function(){ return 'gdrive'; }, set:function(){}, def:function(){ return 'gdrive'; }}
];
var ZS_GROUPS = [
  ['delivery','Delivery charges','ডেলিভারি চার্জ — তিনটা ব্যান্ড','491 · 550'],
  ['hours','Delivery time & promise','ডেলিভারির সময় আর প্রতিশ্রুতির কথা','491'],
  ['payment','Payment line','পেমেন্টের লাইন','491'],
  ['whatsapp','WhatsApp & contact','হোয়াটসঅ্যাপ আর যোগাযোগ','491 · 509'],
  ['home','Home page','হোম পেজ','491'],
  ['invoice','Invoice wording','ইনভয়েসের লেখা','407 · 409'],
  ['messages','SMS & WhatsApp messages','SMS আর হোয়াটসঅ্যাপ মেসেজ','505'],
  ['install','Installation (all stores)','ইনস্টলেশন — সব স্টোরের জন্য','492']
];
function zs_smsDef(k){
  if(k==='placed') return 'EXTAS: Order {orderId} placed, total {total}. We will confirm it soon. Help: WhatsApp {whatsapp}';
  return 'EXTAS: Order {orderId} confirmed and packed. Delivery {promise}. Pay {total} on delivery.';
}
function zs_S(id){ for(var i=0;i<ZS_SETTINGS.length;i++) if(ZS_SETTINGS[i].id===id) return ZS_SETTINGS[i]; return null; }
function zs_tierOf(s){ return s.tier || 'both'; }
function zs_has(map, id){ return map && Object.prototype.hasOwnProperty.call(map, id); }
/* effective value = store override → installation value → code default */
function zs_eff(s){ var y = zs_ensure(); if(zs_has(y.store, s.id)) return y.store[s.id]; if(zs_has(y.inst, s.id)) return y.inst[s.id]; return s.def(); }
function zs_badge(s){
  var y = zs_ensure(), t = zs_tierOf(s);
  if(t==='store') return '<span class="zs-badge own">'+ico('lock',11)+'Own data · never copied</span>'+(zs_has(y.store, s.id)?' <span class="zs-badge store">Changed for this store</span>':'');
  if(zs_has(y.store, s.id)) return '<span class="zs-badge store">Changed for this store</span>';
  if(zs_has(y.inst, s.id)) return '<span class="zs-badge inst">Installation value</span>';
  return '<span class="zs-badge">Default</span>';
}
function zs_canReset(s){ var y = zs_ensure(); return y.tier==='inst' ? zs_has(y.inst, s.id) : zs_has(y.store, s.id); }
function zs_locked(s){ var y = zs_ensure(), t = zs_tierOf(s); return s.locked || (t==='inst' && y.tier!=='inst') || (t==='store' && y.tier==='inst'); }
function zs_commit(s, v){
  var y = zs_ensure();
  if(zs_tierOf(s)==='inst'){ y.inst[s.id] = v; saveState(); return; }
  if(y.tier==='inst' && zs_tierOf(s)!=='store'){ y.inst[s.id] = v; if(!zs_has(y.store, s.id)) s.set(v); }
  else { y.store[s.id] = v; s.set(v); }
  saveState();
}
function zs_resetOne(s){
  var y = zs_ensure();
  if(y.tier==='inst'){ delete y.inst[s.id]; if(!zs_has(y.store, s.id)){ if(s.reset && !zs_has(y.inst, s.id)) s.reset(); else s.set(zs_eff(s)); } }
  else { delete y.store[s.id]; if(zs_has(y.inst, s.id)) s.set(y.inst[s.id]); else if(s.reset) s.reset(); else s.set(s.def()); }
  saveState();
}
/* globals (not inside ST) are put back after every load, and to defaults on "Reset all demo data" */
function zs_applyGlobals(){
  if(!ST || !ST.sys) return;
  ZS_SETTINGS.forEach(function(s){ if(s.global && (zs_has(ST.sys.store, s.id) || zs_has(ST.sys.inst, s.id))) try{ s.set(zs_eff(s)); }catch(e){} });
}
function zs_restoreGlobals(){
  SHOWN.header.whatsapp = ZS_DEF.header; SHOWN.fab.whatsapp = ZS_DEF.fab; SHOWN.pdp.payLineWithFree = ZS_DEF.payFree; HDR_WA_TIP = ZS_DEF.waTip; DB.whatsapp = ZS_DEF.wa; DB.hotline = ZS_DEF.hot;
  Object.keys(HDR_WA_PAGES).forEach(function(k){ delete HDR_WA_PAGES[k]; }); Object.keys(ZS_DEF.waPages).forEach(function(k){ HDR_WA_PAGES[k] = ZS_DEF.waPages[k]; });
}
(function(){
  try{
    var oL = window.loadState; if(typeof oL==='function' && !oL._zs){ var nl = function(){ var r = oL.apply(this, arguments); try{ zs_applyGlobals(); }catch(e){} return r; }; nl._zs = true; window.loadState = nl; }
    var oR = window.resetState; if(typeof oR==='function' && !oR._zs){ var nr = function(){ try{ zs_restoreGlobals(); }catch(e){} return oR.apply(this, arguments); }; nr._zs = true; window.resetState = nr; }
  }catch(e){}
})();

function zs_ctl(s){
  var v = s.get(), dis = zs_locked(s) ? ' disabled' : '', id = 'zs-c-'+s.id.replace(/\W/g,'-');
  if(s.type==='num') return '<input id="'+id+'" class="input zs-in" type="number" inputmode="numeric" min="0" step="10" value="'+esc(v)+'" data-input="zs-set" data-id="'+s.id+'" aria-label="'+esc(s.en)+'"'+dis+'>';
  if(s.type==='text') return '<input id="'+id+'" class="input zs-in" type="text" value="'+esc(v)+'" data-input="zs-set" data-id="'+s.id+'" aria-label="'+esc(s.en)+'"'+dis+'>';
  if(s.type==='sel') return '<select id="'+id+'" class="input zs-in" data-change="zs-set" data-id="'+s.id+'" aria-label="'+esc(s.en)+'"'+dis+'>'+s.opts.map(function(o){ return '<option value="'+esc(o[0])+'"'+(String(v)===String(o[0])?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>';
  if(s.type==='sw') return '<div class="row" style="gap:10px">'+zs_sw(!!v, dis?'':'zs-sw', s.en, 'data-id="'+s.id+'"'+dis)+'<span class="small bold">'+(v?'On':'Off')+'</span></div>';
  if(s.type==='pages') return '<div class="zs-pages">'+ZS_WA_PAGES.map(function(p){ return '<button type="button" class="chip'+(v[p[0]]?' on':'')+'" data-act="zs-page" data-id="'+s.id+'" data-p="'+p[0]+'" aria-pressed="'+(!!v[p[0]])+'"'+dis+'>'+(v[p[0]]?ico('check',13):'')+esc(p[1])+'</button>'; }).join('')+'</div>';
  if(s.type==='hero') return '<div class="zs-hero">'+[0,1].map(function(i){
      var b = v[i] || {on:false, label:'', href:'#/', style:i?'sets':'fill'};
      var opts = ZS_LINK_OPTS.some(function(o){ return o[0]===b.href; }) ? ZS_LINK_OPTS : [[b.href, b.href]].concat(ZS_LINK_OPTS);
      return '<div class="zs-hero-b"><div class="row between"><span class="small bold">Button '+(i+1)+'</span>'+zs_sw(b.on!==false && !!b.label, 'zs-hero-on', 'Button '+(i+1)+' on or off', 'data-i="'+i+'"')+'</div>'+
        '<input class="input zs-in" type="text" value="'+esc(b.label)+'" placeholder="Button text" data-input="zs-hero" data-i="'+i+'" data-f="label" aria-label="Button '+(i+1)+' text">'+
        '<select class="input zs-in" data-change="zs-hero" data-i="'+i+'" data-f="href" aria-label="Button '+(i+1)+' goes to">'+opts.map(function(o){ return '<option value="'+esc(o[0])+'"'+(o[0]===b.href?' selected':'')+'>Goes to: '+esc(o[1])+'</option>'; }).join('')+'</select></div>';
    }).join('')+'</div>';
  if(s.type==='msg') return '<div class="zs-msg">'+ZS_MSG.map(function(m){ var on = !!v[m.k];
      return '<div class="zs-msg-r'+(on?'':' off')+'"><span class="ch'+(m.ch==='WhatsApp'?' wa':'')+'">'+m.ch+'</span><span class="grow" style="min-width:0">'+esc(m.en)+'<span class="zs-mini za-bn" style="display:block">'+esc(m.bn)+'</span></span>'+zs_sw(on, 'zs-msg', m.en+' '+m.ch, 'data-k="'+m.k+'"')+'</div>'; }).join('')+'</div>';
  return '';
}
function zs_setRow(s){
  var search = (s.en+' '+s.bn+' '+s.id+' '+(s.where||'')+' '+s.g).toLowerCase();
  var lock = zs_locked(s), y = zs_ensure();
  var lockMsg = s.locked ? 'Fixed — Google Drive is the only destination' : (zs_tierOf(s)==='inst' && y.tier!=='inst') ? 'Set at installation level — switch to "Installation" to change' : (zs_tierOf(s)==='store' && y.tier==='inst') ? 'Your own data — never part of the installation' : '';
  return '<div class="zs-set'+(lock?' locked':'')+'" data-s="'+esc(search)+'" id="zs-row-'+s.id.replace(/\W/g,'-')+'">'+
    '<div style="min-width:0"><div class="lab">'+esc(s.en)+'</div><div class="bn">'+esc(s.bn)+'</div>'+
      '<div class="meta"><span id="zs-b-'+s.id.replace(/\W/g,'-')+'">'+zs_badge(s)+'</span>'+
        (s.where?'<span>'+ico('eye',12,'style="vertical-align:-2px"')+' '+esc(s.where)+'</span>':'')+
        (s.see?'<a class="zs-link" href="'+s.see+'">See it on the shop</a>':'')+
        (zs_canReset(s)?'<button type="button" class="zs-link" data-act="zs-reset" data-id="'+s.id+'">Reset to default</button>':'')+
      '</div>'+(lockMsg?'<div class="zs-mini" style="margin-top:4px">'+ico('lock',11,'style="vertical-align:-1px"')+' '+esc(lockMsg)+'</div>':'')+
    '</div>'+
    '<div class="ctl">'+zs_ctl(s)+'</div>'+
  '</div>';
}
PAGES['admin-settings'] = { layout:'admin', title:'Settings', render:function(){
  var y = zs_ensure(), q = (UI['zs-q']||'');
  var changed = Object.keys(y.store).length, instCh = Object.keys(y.inst).length;
  var nav = ZS_GROUPS.map(function(g){ var n = ZS_SETTINGS.filter(function(s){ return s.g===g[0]; }).length; return '<a href="#/admin/settings" data-act="zs-jump" data-g="'+g[0]+'">'+esc(g[1])+'<span>'+n+'</span></a>'; }).join('');
  var groups = ZS_GROUPS.map(function(g){
    var rows = ZS_SETTINGS.filter(function(s){ return s.g===g[0]; });
    return '<section class="zs-card zs-sgrp" id="zs-g-'+g[0]+'" data-grp="'+g[0]+'"><div class="zs-sgrp-h"><h2>'+esc(g[1])+'</h2>'+zs_pr(g[3])+'</div><div class="zs-sub za-bn">'+esc(g[2])+'</div>'+rows.map(zs_setRow).join('')+'</section>';
  }).join('');
  return '<div class="zs-page">'+
    zs_head('Admin · Foundation '+zs_pr('491–510'), 'Settings', 'সেটিংস — দুই স্তর: ইনস্টলেশন → স্টোর',
      'দোকানের যত কথা, চার্জ আর সুইচ — সব এক জায়গায়, কোডে কিছু বাঁধা নেই। এখানে কিছু বদলালে সাথে সাথে দোকানে বদলে যায়। "Installation" হল সব স্টোরের ডিফল্ট; "This store" সেটার উপর আপনার স্টোরের নিজের মান।',
      zs_simTag('Demo · saved in this browser only'))+
    '<div class="zs-sbar"><div class="zs-search">'+ico('search',17)+'<input class="input zs-in" type="search" placeholder="Search settings — e.g. delivery, WhatsApp, invoice, SMS" value="'+esc(q)+'" data-input="zs-q" aria-label="Search settings" id="zs-q"></div>'+
      '<div class="zs-tier" role="group" aria-label="Which level you are editing"><button type="button" class="'+(y.tier==='store'?'on':'')+'" data-act="zs-tier" data-v="store">This store (EXTAS)</button><button type="button" class="'+(y.tier==='inst'?'on':'')+'" data-act="zs-tier" data-v="inst">Installation (all stores)</button></div></div>'+
    '<div class="zs-note mb16">'+ico('layers',17)+'<div class="zs-bnp"><b>'+(y.tier==='store'?'আপনি এখন এই স্টোরের মান বদলাচ্ছেন।':'আপনি এখন ইনস্টলেশনের ডিফল্ট বদলাচ্ছেন।')+'</b> '+
      (y.tier==='store'?'যে সেটিং এখানে বদলাবেন সেটা ইনস্টলেশনের মানের উপর বসে যাবে ("Changed for this store")। "Reset to default" চাপলে আবার ইনস্টলেশনের মানে ফিরে যাবে।':'নতুন স্টোর খুললে এই মান পাবে। যে সেটিং এই স্টোরে আলাদা করে বদলানো আছে, সেটা স্টোরের মানই রাখবে। আপনার নিজের তথ্য (নম্বর, ঠিকানা) কখনও ইনস্টলেশনে যায় না।')+
      ' <span class="zs-mini">'+changed+' changed for this store · '+instCh+' installation values</span></div></div>'+
    '<div class="zs-sgrid"><nav class="zs-snav" aria-label="Setting groups">'+nav+'</nav><div id="zs-groups">'+groups+
      '<div class="zs-empty zs-nores" id="zs-nores">No setting matches. Try "delivery", "WhatsApp" or "invoice".</div></div></div>'+
  '</div>';
}, after:function(){ zs_filter(UI['zs-q']||''); }};
function zs_filter(q){
  q = String(q||'').toLowerCase().trim(); var any = 0;
  document.querySelectorAll('#zs-groups .zs-sgrp').forEach(function(g){
    var n = 0; g.querySelectorAll('.zs-set').forEach(function(r){ var hit = !q || r.getAttribute('data-s').indexOf(q)>=0; r.style.display = hit ? '' : 'none'; if(hit) n++; });
    g.style.display = n ? '' : 'none'; any += n;
  });
  var e = document.getElementById('zs-nores'); if(e) e.style.display = any ? 'none' : 'block';
}
INPUT['zs-q'] = function(el){ UI['zs-q'] = el.value; zs_filter(el.value); };
ACT['zs-jump'] = function(el){ var g = document.getElementById('zs-g-'+el.getAttribute('data-g')); if(!g) return; g.scrollIntoView({behavior:'smooth', block:'start'}); g.classList.remove('zs-flash'); void g.offsetWidth; g.classList.add('zs-flash'); };
ACT['zs-tier'] = function(el){ zs_ensure().tier = el.getAttribute('data-v'); saveState(); rerender(); toast(el.getAttribute('data-v')==='inst' ? 'Editing installation defaults (all stores)' : 'Editing this store'); };
function zs_patchBadge(s){
  var b = document.getElementById('zs-b-'+s.id.replace(/\W/g,'-')); if(b) b.innerHTML = zs_badge(s);
}
INPUT['zs-set'] = function(el){
  var s = zs_S(el.getAttribute('data-id')); if(!s || zs_locked(s)) return;
  var v = el.value; if(s.type==='num'){ v = parseInt(v, 10); if(isNaN(v) || v<0) return; }
  zs_commit(s, v); zs_patchBadge(s);
  clearTimeout(zs_set._t); zs_set._t = setTimeout(function(){ toast('Saved — live on the shop now'); }, 700);
};
function zs_set(){}
CHANGE['zs-set'] = function(el){ var s = zs_S(el.getAttribute('data-id')); if(!s || zs_locked(s)) return; zs_commit(s, el.value); rerender(); toast('Saved — '+s.en+': '+el.options[el.selectedIndex].text); };
ACT['zs-sw'] = function(el){ var s = zs_S(el.getAttribute('data-id')); if(!s || zs_locked(s)) return; var v = !s.get(); zs_commit(s, v); rerender(); toast(s.en+(v?' — on':' — off')); };
ACT['zs-page'] = function(el){ var s = zs_S(el.getAttribute('data-id')); if(!s || zs_locked(s)) return; var v = s.get(), p = el.getAttribute('data-p'); v[p] = !v[p]; zs_commit(s, v); rerender(); toast('Header WhatsApp '+(v[p]?'shown':'hidden')+' on '+p); };
ACT['zs-reset'] = function(el){ var s = zs_S(el.getAttribute('data-id')); if(!s) return; zs_resetOne(s); rerender(); toast(s.en+' — back to default'); };
function zs_heroV(){ var s = zs_S('home.hero'), v = s.get(); while(v.length<2) v.push({on:false, label:'', href:'#/set', style:'line', id:'hero-btn-'+v.length}); return v; }
INPUT['zs-hero'] = function(el){ var s = zs_S('home.hero'), v = zs_heroV(), i = +el.getAttribute('data-i'); v[i][el.getAttribute('data-f')] = el.value; if(el.value && v[i].on===false && !v[i]._touched){ v[i].on = true; } v[i]._touched = true; zs_commit(s, v); zs_patchBadge(s); };
CHANGE['zs-hero'] = function(el){ var s = zs_S('home.hero'), v = zs_heroV(), i = +el.getAttribute('data-i'); v[i][el.getAttribute('data-f')] = el.value; zs_commit(s, v); rerender(); toast('Button '+(i+1)+' now goes to '+el.options[el.selectedIndex].text.replace('Goes to: ','')); };
ACT['zs-hero-on'] = function(el){ var s = zs_S('home.hero'), v = zs_heroV(), i = +el.getAttribute('data-i'); var on = !(v[i].on!==false && v[i].label); v[i].on = on; if(on && !v[i].label) v[i].label = i ? 'Shop sets' : 'Shop now'; zs_commit(s, v); rerender(); toast('Hero button '+(i+1)+(on?' on':' off')); };
ACT['zs-msg'] = function(el){ var s = zs_S('msg.rule'), v = s.get(), k = el.getAttribute('data-k'); v[k] = !v[k]; zs_commit(s, v); rerender();
  var m = ZS_MSG.filter(function(x){ return x.k===k; })[0]; toast(m.ch+' at "'+m.en+'" '+(v[k]?'on':'off')+' — thank-you page wording updated'); };

/* =====================================================================
   2. BACKUP — Google Drive (never Azure), schedule, retention, restore
   ===================================================================== */
function zs_bk(){
  var y = zs_ensure();
  if(!y.backup){
    var now = Date.now(), D = 86400000, runs = [];
    var day0 = new Date(); day0.setHours(2,0,0,0); if(day0.getTime()>now) day0 = new Date(day0.getTime()-D);
    for(var i=0;i<9;i++){
      var at = day0.getTime() - i*D, size = 1.84 - i*0.012;
      runs.push({id:'BK-'+(2410-i), at:at, kind:'Scheduled', size:Math.round(size*100)/100, mins:3 + (i%3), st: i===4 ? 'warn' : 'ok',
        note: i===4 ? '2 upload files were busy — retried and saved' : 'Database, uploads, settings, agent library · checksum verified'});
    }
    y.backup = {schedule:'daily', time:'02:00', keepDaily:7, keepWeekly:4, keepMonthly:3, encrypt:true, tgFail:true, tgOk:false, drill:true,
      include:{db:true, uploads:true, config:true, library:true}, folder:'EXTAS-Backups', runs:runs, lastDrill:now - 12*D};
  }
  return y.backup;
}
var ZS_BK_INC = [['db','Database','অর্ডার, কাস্টমার, প্রোডাক্ট, সব হিসাব'],['uploads','Uploads','ছবি, ইনভয়েস, ফাইল'],['config','Settings & configuration','সব সেটিংস আর নিয়ম'],['library','Agent library','সাত এজেন্টের স্কিল, লেসন, ওয়ার্ক লগ']];
function zs_bkNext(b){
  var d = new Date(), t = String(b.time||'02:00').split(':'); d.setHours(+t[0], +t[1], 0, 0); if(d.getTime()<=Date.now()) d = new Date(d.getTime()+86400000);
  if(b.schedule==='weekly'){ while(d.getDay()!==5) d = new Date(d.getTime()+86400000); }
  if(b.schedule==='twice'){ var h = new Date(); h.setHours(14,0,0,0); if(h.getTime()>Date.now() && h<d) d = h; }
  return d.getTime();
}
PAGES['admin-backup'] = { layout:'admin', title:'Backup', render:function(){
  var b = zs_bk(), last = b.runs[0], used = b.runs.slice(0, b.keepDaily).reduce(function(s,r){ return s + r.size; }, 0) + b.keepWeekly*1.7 + b.keepMonthly*1.6;
  var inc = ZS_BK_INC.map(function(x, i){ return '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(x[1])+'</div><div class="zs-mini za-bn">'+esc(x[2])+'</div></div>'+zs_sw(b.include[x[0]], 'zs-bk-inc', x[1], 'data-k="'+x[0]+'"')+'</div>'; }).join('');
  var runs = b.runs.slice(0, 12).map(function(r){
    return '<div class="zs-li"><div style="min-width:0"><div class="t"><span class="zs-dot'+(r.st==='warn'?' warn':r.st==='bad'?' bad':'')+'" style="margin-right:7px"></span>'+esc(zs_time(r.at))+' <span class="zs-mini" style="font-weight:500">· '+esc(r.kind)+' · '+r.size.toFixed(2)+' GB · '+r.mins+' min</span></div><div class="m">'+esc(r.id)+' · '+esc(r.note)+'</div></div>'+
      '<div class="r"><button type="button" class="btn btn-sm btn-ghost" data-act="zs-bk-restore" data-id="'+r.id+'">'+ico('swap',14)+'Restore</button></div></div>';
  }).join('');
  return '<div class="zs-page">'+
    zs_head('Admin · Foundation '+zs_pr('395 · 396 · 507'), 'Backup', 'ব্যাকআপ — প্রতিদিন গুগল ড্রাইভে',
      'আপনার পুরো দোকান (ডাটাবেস, ছবি, সেটিংস আর এজেন্টদের লাইব্রেরি) প্রতি রাতে এনক্রিপ্ট করে আপনার গুগল ড্রাইভে রাখা হয়। কিছু হলে এক চাপে ফিরিয়ে আনা যায় — আগে টেস্ট সার্ভারে, তারপর লাইভে।',
      zs_simTag()+'<button type="button" class="btn btn-primary" data-act="zs-bk-now" data-testid="zs-bk-now">'+ico('shield',16)+'Back up now</button>')+
    '<div class="zs-kpis k4">'+
      '<div class="zs-k ok"><div class="v">'+(last.st==='ok'?'OK':'Check')+'</div><div class="l">Last backup</div><div class="s">'+esc(zs_time(last.at))+'</div></div>'+
      '<div class="zs-k"><div class="v">'+esc(zs_time(zs_bkNext(b)).split(' · ')[1])+'</div><div class="l">Next backup</div><div class="s">'+esc(zs_time(zs_bkNext(b)).split(' · ')[0])+'</div></div>'+
      '<div class="zs-k"><div class="v">'+used.toFixed(1)+' GB</div><div class="l">Kept on Drive</div><div class="s">'+(b.keepDaily+b.keepWeekly+b.keepMonthly)+' copies</div></div>'+
      '<div class="zs-k"><div class="v">'+Math.max(1, Math.round((Date.now()-b.lastDrill)/86400000))+' d</div><div class="l">Since restore drill</div><div class="s">monthly test restore</div></div>'+
    '</div>'+
    '<div class="zs-g2">'+
      '<section class="zs-card"><div class="row between"><h2>Destination</h2><span class="tag">'+ico('check',12)+'Connected</span></div>'+
        '<div class="zs-sub za-bn">শুধু গুগল ড্রাইভ — অন্য কোথাও না।</div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold">Google Drive · your Google account</div><div class="zs-mini">Folder: <b id="zs-bk-folder">'+esc(b.folder)+'</b> · 1.62 TB free</div></div><span class="zs-pr">fixed</span></div>'+
        '<div class="zs-row"><div class="grow"><label class="small bold" for="zs-bk-f">Folder name</label><input id="zs-bk-f" class="input zs-in mt8" style="width:100%" value="'+esc(b.folder)+'" data-input="zs-bk-folder"></div></div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold">Encrypted before upload</div><div class="zs-mini">The key lives in your credential vault (PR 493), not on Drive</div></div>'+zs_sw(b.encrypt, 'zs-bk-tog', 'Encrypt backups', 'data-k="encrypt"')+'</div>'+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zs-bk-test">'+ico('link',14)+'Test connection</button></div>'+
      '</section>'+
      '<section class="zs-card"><div class="row between"><h2>Schedule &amp; retention</h2>'+zs_pr('507')+'</div>'+
        '<div class="zs-sub za-bn">কখন ব্যাকআপ হবে আর কতগুলো কপি রাখা হবে।</div>'+
        '<div class="grid g2" style="gap:10px">'+
          '<div><label class="label" for="zs-bk-s">How often</label><select id="zs-bk-s" class="input zs-in" data-change="zs-bk-sel" data-k="schedule">'+[['daily','Every night'],['twice','Twice a day (2 am + 2 pm)'],['weekly','Every Friday']].map(function(o){ return '<option value="'+o[0]+'"'+(b.schedule===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select></div>'+
          '<div><label class="label" for="zs-bk-t">Time</label><select id="zs-bk-t" class="input zs-in" data-change="zs-bk-sel" data-k="time">'+['01:00','02:00','03:00','04:00'].map(function(o){ return '<option'+(b.time===o?' selected':'')+'>'+o+'</option>'; }).join('')+'</select></div>'+
          '<div><label class="label" for="zs-bk-kd">Keep daily copies</label><select id="zs-bk-kd" class="input zs-in" data-change="zs-bk-sel" data-k="keepDaily">'+[7,14,30].map(function(o){ return '<option value="'+o+'"'+(b.keepDaily===o?' selected':'')+'>'+o+' days</option>'; }).join('')+'</select></div>'+
          '<div><label class="label" for="zs-bk-kw">Keep weekly / monthly</label><select id="zs-bk-kw" class="input zs-in" data-change="zs-bk-sel" data-k="keepWeekly">'+[[4,'4 weeks · 3 months'],[8,'8 weeks · 6 months'],[12,'12 weeks · 12 months']].map(function(o){ return '<option value="'+o[0]+'"'+(b.keepWeekly===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select></div>'+
        '</div>'+
        '<div class="zs-row mt8"><div class="grow"><div class="small bold">Telegram me if a backup fails</div></div>'+zs_sw(b.tgFail, 'zs-bk-tog', 'Telegram on failure', 'data-k="tgFail"')+'</div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold">Telegram me every morning it worked</div></div>'+zs_sw(b.tgOk, 'zs-bk-tog', 'Telegram on success', 'data-k="tgOk"')+'</div>'+
        '<div class="zs-row"><div class="grow"><div class="small bold">Monthly restore drill</div><div class="zs-mini">Restores last night\'s copy to staging and checks it opens</div></div>'+zs_sw(b.drill, 'zs-bk-tog', 'Monthly restore drill', 'data-k="drill"')+'</div>'+
      '</section>'+
    '</div>'+
    '<div class="zs-g2 mt24">'+
      '<section class="zs-card"><div class="row between"><h2>Last runs</h2><span class="zs-mini">'+b.runs.length+' runs</span></div><div class="zs-sub za-bn">প্রতিটা কপি থেকে "Restore" চাপা যায় — আগে একবার নিশ্চিত করতে হবে।</div><div class="zs-list">'+runs+'</div></section>'+
      '<section class="zs-card"><h2>What is in each backup</h2><div class="zs-sub za-bn">কোন কোন জিনিস ব্যাকআপে যাবে।</div>'+inc+
        '<div class="zs-note mt12">'+ico('shield',16)+'<div class="zs-bnp">সার্ভার নষ্ট হলেও কিছু হারাবে না: নতুন সার্ভারে শেষ রাতের কপি ফিরিয়ে আনলেই দোকান আগের মতো চলবে। <span class="zs-mini">One-command restore, tested (PR 396).</span></div></div>'+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zs-bk-drill">'+ico('play',13)+'Run restore drill now</button></div>'+
      '</section>'+
    '</div>'+
  '</div>';
}};
ACT['zs-bk-tog'] = function(el){ var b = zs_bk(), k = el.getAttribute('data-k'); b[k] = !b[k]; saveState(); rerender(); toast((b[k]?'On':'Off')+' — saved'); };
ACT['zs-bk-inc'] = function(el){ var b = zs_bk(), k = el.getAttribute('data-k'); if(k==='db' && b.include.db){ toast('The database is always backed up'); return; } b.include[k] = !b.include[k]; saveState(); rerender(); toast((b.include[k]?'Included':'Left out')+' from the next backup'); };
CHANGE['zs-bk-sel'] = function(el){ var b = zs_bk(), k = el.getAttribute('data-k'), v = el.value; b[k] = /^keep/.test(k) ? +v : v; if(k==='keepWeekly') b.keepMonthly = {4:3, 8:6, 12:12}[+v] || 3; saveState(); rerender(); toast('Backup schedule saved'); };
INPUT['zs-bk-folder'] = function(el){ var b = zs_bk(); b.folder = el.value.trim() || 'EXTAS-Backups'; saveState(); var f = document.getElementById('zs-bk-folder'); if(f) f.textContent = b.folder; };
ACT['zs-bk-test'] = function(){ toast('Google Drive reachable · folder '+zs_bk().folder+' · write test OK (demo)'); };
var ZS_BK_STEPS = ['Dumping the database','Collecting uploads','Adding settings and the agent library','Encrypting','Uploading to Google Drive','Checking the copy (checksum)'];
function zs_bkHTML(){
  var u = UI['zs-bk']; if(!u) return '';
  if(u.phase>ZS_BK_STEPS.length) return '<div class="stack s16" style="text-align:center"><span class="zs-okc">'+ico('check',26)+'</span><div><div class="h2">Backup saved to Google Drive</div><div class="small text2 mt8">'+esc(u.id)+' · '+u.size+' GB · folder '+esc(zs_bk().folder)+'</div></div><div class="xs muted">Demo — nothing was really uploaded.</div><button type="button" class="btn btn-primary btn-block" data-act="close-modal">Done</button></div>';
  return '<div class="stack s16"><div class="small text2 za-bn">পুরো দোকানের একটা কপি গুগল ড্রাইভে যাচ্ছে। দোকান চালু থাকবে।</div>'+zs_steps(ZS_BK_STEPS, u.phase)+zs_bar((u.phase-1)/ZS_BK_STEPS.length*100)+'</div>';
}
ACT['zs-bk-now'] = function(){
  UI['zs-bk'] = {phase:1}; openModal(zs_bkHTML(), {title:'Back up now', rebuild:zs_bkHTML, zsKey:'zs-bk'});
  zs_runSteps('zs-bk', ZS_BK_STEPS, 550, function(u){
    var b = zs_bk(), n = b.runs.length ? +String(b.runs[0].id).replace(/\D/g,'')+1 : 2411;
    u.id = 'BK-'+n; u.size = Math.round((b.runs[0] ? b.runs[0].size + 0.01 : 1.85)*100)/100;
    b.runs.unshift({id:u.id, at:Date.now(), kind:'Manual (you)', size:u.size, mins:3, st:'ok', note:'Database, uploads, settings, agent library · checksum verified'});
    saveState(); rerender(); toast('Backup saved — '+u.id);
  });
};
function zs_rsHTML(){
  var u = UI['zs-rs']; if(!u) return ''; var b = zs_bk(), r = b.runs.filter(function(x){ return x.id===u.id; })[0]; if(!r) return '';
  var steps = ['Downloading '+r.id+' from Google Drive','Decrypting','Restoring the database','Restoring uploads and settings','Opening the site and checking it'];
  if(u.phase>steps.length) return '<div class="stack s16" style="text-align:center"><span class="zs-okc">'+ico('check',26)+'</span><div><div class="h2">Restored to '+(u.where==='staging'?'the test server':'the live shop')+'</div><div class="small text2 mt8 za-bn">'+(u.where==='staging'?'টেস্ট সার্ভারে খুলে দেখুন সব ঠিক আছে কিনা, তারপর "Make live" চাপুন।':'দোকান '+esc(zs_time(r.at))+' এর অবস্থায় ফিরে গেছে।')+'</div></div>'+
    '<div class="xs muted">Demo — nothing was really restored.</div>'+
    '<div class="row" style="gap:10px">'+(u.where==='staging'?'<button type="button" class="btn btn-ghost grow" data-act="close-modal">Later</button><button type="button" class="btn btn-primary grow" data-act="zs-rs-live">Make live</button>':'<button type="button" class="btn btn-primary btn-block" data-act="close-modal">Done</button>')+'</div></div>';
  if(u.phase>0) return '<div class="stack s16">'+zs_steps(steps, u.phase)+zs_bar((u.phase-1)/steps.length*100)+'<div class="xs muted">The live shop keeps running while this works.</div></div>';
  var ok = String(u.typed||'').trim().toUpperCase()==='RESTORE';
  return '<div class="stack s16">'+
    '<div class="zs-note warn">'+ico('info',17)+'<div class="zs-bnp"><b>সাবধান:</b> লাইভে ফিরিয়ে আনলে '+esc(zs_time(r.at))+' এর পরের অর্ডার আর বদল চলে যাবে। তাই আগে টেস্ট সার্ভারে ফিরিয়ে দেখা ভাল।</div></div>'+
    '<div><div class="label">What to bring back</div><div class="zs-chipset">'+[['all','Everything'],['db','Database only'],['config','Settings only']].map(function(o){ return '<button type="button" class="chip'+(u.what===o[0]?' on':'')+'" data-act="zs-rs-opt" data-k="what" data-v="'+o[0]+'">'+o[1]+'</button>'; }).join('')+'</div></div>'+
    '<div><div class="label">Where</div><div class="zs-chipset">'+[['staging','Test server first (recommended)'],['live','Live shop']].map(function(o){ return '<button type="button" class="chip'+(u.where===o[0]?' on':'')+'" data-act="zs-rs-opt" data-k="where" data-v="'+o[0]+'">'+o[1]+'</button>'; }).join('')+'</div></div>'+
    '<div><label class="label" for="zs-rs-type">Type RESTORE to confirm</label><input id="zs-rs-type" class="input" autocomplete="off" value="'+esc(u.typed||'')+'" data-input="zs-rs-type" placeholder="RESTORE"></div>'+
    '<div class="row end" style="gap:8px"><button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button><button type="button" class="btn btn-primary" id="zs-rs-go" data-act="zs-rs-go"'+(ok?'':' disabled')+'>'+ico('swap',15)+'Restore '+esc(r.id)+'</button></div>'+
  '</div>';
}
ACT['zs-bk-restore'] = function(el){ UI['zs-rs'] = {id:el.getAttribute('data-id'), what:'all', where:'staging', typed:'', phase:0}; openModal(zs_rsHTML(), {title:'Restore a backup', rebuild:zs_rsHTML, zsKey:'zs-rs'}); };
ACT['zs-rs-opt'] = function(el){ var u = UI['zs-rs']; if(!u) return; u[el.getAttribute('data-k')] = el.getAttribute('data-v'); refreshModal(); };
INPUT['zs-rs-type'] = function(el){ var u = UI['zs-rs']; if(!u) return; u.typed = el.value; var b = document.getElementById('zs-rs-go'); if(b) b.disabled = el.value.trim().toUpperCase()!=='RESTORE'; };
ACT['zs-rs-go'] = function(){ var u = UI['zs-rs']; if(!u || String(u.typed).trim().toUpperCase()!=='RESTORE') return; zs_runSteps('zs-rs', [1,2,3,4,5], 600, function(){ toast('Restore finished (demo)'); }); };
ACT['zs-rs-live'] = function(){ closeModal(); toast('Test copy made live (demo) — the shop is back to that backup'); };
ACT['zs-bk-drill'] = function(){
  UI['zs-dr'] = {phase:1};
  var steps = ['Taking last night\'s copy from Drive','Restoring on the test server','Opening Home, a product and checkout','Comparing order counts'];
  var html = function(){ var u = UI['zs-dr']; if(u.phase>steps.length) return '<div class="stack s16" style="text-align:center"><span class="zs-okc">'+ico('check',26)+'</span><div class="h2">Drill passed</div><div class="small text2 za-bn">শেষ রাতের কপি দিয়ে দোকান ঠিকঠাক খোলে।</div><button type="button" class="btn btn-primary btn-block" data-act="close-modal">Done</button></div>'; return zs_steps(steps, u.phase); };
  openModal(html(), {title:'Restore drill', rebuild:html, zsKey:'zs-dr'});
  zs_runSteps('zs-dr', steps, 550, function(){ zs_bk().lastDrill = Date.now(); saveState(); rerender(); });
};

/* =====================================================================
   3. SITE AUDIT — the checklist, grouped and prioritised (PR 570)
   ===================================================================== */
var ZS_GPRI = {1:1, 2:1, 6:1, 7:1, 8:1, 9:1, 10:1, 20:1, 22:1, 3:2, 4:2, 5:2, 11:2, 12:2, 13:2, 14:2, 15:2, 17:2, 16:3, 18:3, 19:3, 21:3, 23:3};
var ZS_GOWNER = {1:'sawdagor', 2:'shilpi', 3:'shilpi', 4:'sawdagor', 5:'sawdagor', 6:'shilpi', 7:'sawdagor', 8:'sawdagor', 9:'sawdagor', 10:'bhandari', 11:'sawdagor', 12:'doot', 13:'prohori', 14:'shilpi', 15:'sawdagor', 16:'shilpi', 17:'doot', 18:'doot', 19:'doot', 20:'prohori', 21:'prohori', 22:'prohori', 23:'gyani'};
var ZS_DEVICES = [['1280','Desktop 1280×800'],['1440','Desktop 1440×900'],['393','iPhone 15 Pro 393×852'],['440','iPhone Pro Max 440×956'],['360','Android 360×800'],['320','Small phone 320×640']];
function zs_gItems(g){ var out = []; g.subs.forEach(function(s){ s.items.forEach(function(it){ out.push(it); }); }); return out; }
function zs_gPri(g){ return ZS_GPRI[g.n] || 2; }
function zs_au(){
  var y = zs_ensure();
  if(!y.audit){
    var groups = {}; ZS_CHECK.forEach(function(g){ groups[g.n] = zs_gPri(g)===1; });
    y.audit = {groups:groups, agents:['prohori','shilpi','sawdagor'], devices:['1280','393','320'], sched:{on:true, freq:'weekly', day:'Fri', time:'09:00', tg:true}, runs:[]};
    /* two earlier (simulated) runs so the history has something to compare */
    var now = Date.now(), D = 86400000;
    y.audit.runs.push(zs_auMake({at:now - 3*D - 5*3600000, trigger:'Scheduled · Fri 09:00', agents:['prohori','shilpi'], devices:['1280','393'], groups:ZS_CHECK.filter(function(g){ return zs_gPri(g)===1; }).map(function(g){ return g.n; }), seed:'r2'}));
    y.audit.runs.push(zs_auMake({at:now - 10*D - 5*3600000, trigger:'Scheduled · Fri 09:00', agents:['prohori','shilpi','sawdagor'], devices:['1280','393','320'], groups:ZS_CHECK.map(function(g){ return g.n; }), seed:'r1'}));
  }
  return y.audit;
}
function zs_auNA(text){ return /real (iPhone|phone|Android)|network|offline|server error|\(500\)|Telegram|e-?mail|password reset|login \(not public\)/i.test(text); }
function zs_auMake(o){
  var res = {}, bugs = [], pass = 0, fail = 0, na = 0, nBug = 0;
  o.groups.forEach(function(n){
    var g = ZS_CHECK.filter(function(x){ return x.n===n; })[0]; if(!g) return;
    var r = {p:0, f:0, na:0}, pr = zs_gPri(g), rate = pr===1 ? 0.035 : pr===2 ? 0.05 : 0.06;
    zs_gItems(g).forEach(function(it){
      if(zs_auNA(it[1])){ r.na++; return; }
      if(zs_rnd(o.seed+'|'+it[0]) < rate){ r.f++;
        var dev = o.devices[zs_hash(o.seed+it[0]) % o.devices.length];
        bugs.push({id:'B'+String(++nBug).padStart(2,'0'), item:it[0], text:it[1], g:n, dev:dev, owner:ZS_GOWNER[n]||'prohori', st:'open'});
      } else r.p++;
    });
    res[n] = r; pass += r.p; fail += r.f; na += r.na;
  });
  return {id:'AU-'+String(o.at).slice(-5), at:o.at, trigger:o.trigger, agents:o.agents.slice(), devices:o.devices.slice(), groups:o.groups.slice(), res:res, bugs:bugs, pass:pass, fail:fail, na:na};
}
function zs_devName(d){ var x = ZS_DEVICES.filter(function(v){ return v[0]===d; })[0]; return x ? x[1] : d; }
PAGES['admin-audit'] = { layout:'admin', title:'Site audit', render:function(){
  var a = zs_au(), tab = UI['zs-au-tab'] || 'run';
  var selN = ZS_CHECK.filter(function(g){ return a.groups[g.n]; }), selItems = selN.reduce(function(s,g){ return s + zs_gItems(g).length; }, 0);
  var total = ZS_CHECK.reduce(function(s,g){ return s + zs_gItems(g).length; }, 0);
  var last = a.runs[0], openBugs = a.runs.length ? a.runs[0].bugs.filter(function(b){ return b.st==='open' || b.st==='proposed'; }).length : 0;
  var tabs = '<div class="zs-tabs" role="tablist">'+[['run','Run & schedule'],['history','Report history ('+a.runs.length+')'],['bugs','Bugs ('+openBugs+' open)']].map(function(t){ return '<button type="button" class="chip'+(tab===t[0]?' on':'')+'" data-act="zs-au-tab" data-v="'+t[0]+'" role="tab" aria-selected="'+(tab===t[0])+'">'+t[1]+'</button>'; }).join('')+'</div>';
  var kpis = '<div class="zs-kpis k4">'+
    '<div class="zs-k"><div class="v">'+total+'</div><div class="l">Checks in the list</div><div class="s">'+ZS_CHECK.length+' groups · from the QA checklist</div></div>'+
    '<div class="zs-k '+(last && last.fail ? 'warn' : 'ok')+'"><div class="v">'+(last ? Math.round(last.pass/Math.max(1,last.pass+last.fail)*100)+'%' : '—')+'</div><div class="l">Passed last run</div><div class="s">'+(last ? esc(zs_time(last.at)) : 'not run yet')+'</div></div>'+
    '<div class="zs-k '+(openBugs?'bad':'ok')+'"><div class="v">'+openBugs+'</div><div class="l">Bugs waiting</div><div class="s">fixes need your approval</div></div>'+
    '<div class="zs-k"><div class="v">'+(a.sched.on ? esc(a.sched.day+' '+a.sched.time) : 'Off')+'</div><div class="l">Next scheduled run</div><div class="s">'+(a.sched.on && a.sched.tg ? 'report to Telegram' : 'no Telegram')+'</div></div></div>';
  var body = tab==='history' ? zs_auHistory(a) : tab==='bugs' ? zs_auBugsTab(a) : zs_auRunTab(a, selN, selItems);
  return '<div class="zs-page">'+
    zs_head('Admin · Site health '+zs_pr('570 · 413–424'), 'Site audit', 'সাইট অডিট — চেকলিস্ট ধরে এজেন্টরা পুরো দোকান পরীক্ষা করে',
      'পুরো ই-কমার্স চেকলিস্ট (৪০৪টা চেক) এখানে গ্রুপ আর গুরুত্ব অনুযায়ী সাজানো। কোন গ্রুপ, কয়জন এজেন্ট, কোন ডিভাইস — আপনি ঠিক করবেন। বাগ পেলে এজেন্ট ঠিক করার প্রস্তাব দেবে, আপনি অনুমতি দিলে তবেই ঠিক হবে।',
      zs_simTag()+'<button type="button" class="btn btn-primary" data-act="zs-au-run" data-testid="zs-au-run">'+ico('play',15)+'Run now</button>')+
    kpis+tabs+body+'</div>';
}};
function zs_auRunTab(a, selN, selItems){
  var groups = [1,2,3].map(function(p){
    var list = ZS_CHECK.filter(function(g){ return zs_gPri(g)===p; });
    return '<div class="mt12"><div class="row between"><span class="small bold"><span class="zs-pri p'+p+'">P'+p+'</span> '+(p===1?'Must pass before launch':p===2?'Important':'Good to have')+'</span><button type="button" class="zs-link" data-act="zs-au-pri" data-p="'+p+'">'+(list.every(function(g){ return a.groups[g.n]; })?'Clear':'Select all')+'</button></div>'+
      list.map(function(g){ var on = !!a.groups[g.n];
        return '<div class="zs-grp'+(on?' on':'')+'" data-act="zs-au-g" data-n="'+g.n+'" role="checkbox" aria-checked="'+on+'" tabindex="0"><span class="zs-cb">'+ico('check',14)+'</span><span style="min-width:0"><span class="small bold">'+g.n+'. '+esc(g.name)+'</span><span class="zs-mini" style="display:block">'+g.subs.filter(function(s){ return s.name; }).map(function(s){ return esc(s.name); }).join(' · ')+'</span></span><span class="zs-mini">'+zs_gItems(g).length+' checks</span></div>'; }).join('')+'</div>';
  }).join('');
  var ags = ZS_AGENTS.map(function(g){ var on = a.agents.indexOf(g.id)>=0; return '<button type="button" class="zs-ag'+(on?' on':'')+'" data-act="zs-au-ag" data-id="'+g.id+'" aria-pressed="'+on+'">'+zs_av(g)+'<span class="nm">'+esc(g.en)+'<small>'+esc(g.bn)+'</small></span></button>'; }).join('');
  var devs = ZS_DEVICES.map(function(d){ var on = a.devices.indexOf(d[0])>=0; return '<button type="button" class="chip'+(on?' on':'')+'" data-act="zs-au-dev" data-d="'+d[0]+'" aria-pressed="'+on+'">'+(on?ico('check',13):'')+esc(d[1])+'</button>'; }).join('');
  var s = a.sched;
  return '<div class="zs-g2">'+
    '<section class="zs-card"><div class="row between"><h2>Which groups</h2><span class="zs-mini" id="zs-au-count">'+selN.length+' groups · '+selItems+' checks</span></div>'+
      '<div class="zs-sub za-bn">P1 = লঞ্চের আগে অবশ্যই পাস করতে হবে। P2 = জরুরি। P3 = থাকলে ভাল।</div>'+groups+'</section>'+
    '<div class="stack s16">'+
      '<section class="zs-card"><div class="row between"><h2>Who runs it</h2><span class="zs-mini">'+a.agents.length+' of max 3</span></div><div class="zs-sub za-bn">১ থেকে ৩ জন এজেন্ট বেছে নিন — একসাথে আলাদা আলাদা গ্রুপ চালাবে, তাই তাড়াতাড়ি শেষ হয়।</div><div class="zs-agpick">'+ags+'</div></section>'+
      '<section class="zs-card"><h2>On which screens</h2><div class="zs-sub za-bn">কোন কোন ডিভাইসে পরীক্ষা হবে।</div><div class="zs-chipset">'+devs+'</div></section>'+
      '<section class="zs-card"><div class="row between"><h2>Schedule</h2>'+zs_sw(s.on, 'zs-au-sched', 'Scheduled audit on or off')+'</div><div class="zs-sub za-bn">নিজে থেকে নিয়মিত চলবে, রিপোর্ট আপনার টেলিগ্রামে যাবে।</div>'+
        '<div class="grid g2" style="gap:10px">'+
          '<div><label class="label" for="zs-au-f">How often</label><select id="zs-au-f" class="input zs-in" data-change="zs-au-s" data-k="freq">'+[['daily','Every day'],['weekly','Every week'],['monthly','First day of the month']].map(function(o){ return '<option value="'+o[0]+'"'+(s.freq===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select></div>'+
          '<div><label class="label" for="zs-au-d">Day</label><select id="zs-au-d" class="input zs-in" data-change="zs-au-s" data-k="day">'+['Sat','Sun','Mon','Tue','Wed','Thu','Fri'].map(function(o){ return '<option'+(s.day===o?' selected':'')+'>'+o+'</option>'; }).join('')+'</select></div>'+
          '<div><label class="label" for="zs-au-t">Time</label><select id="zs-au-t" class="input zs-in" data-change="zs-au-s" data-k="time">'+['07:00','09:00','12:00','18:00','23:00'].map(function(o){ return '<option'+(s.time===o?' selected':'')+'>'+o+'</option>'; }).join('')+'</select></div>'+
          '<div class="row" style="gap:10px;align-items:flex-end;padding-bottom:6px">'+zs_sw(s.tg, 'zs-au-tg', 'Send report to Telegram')+'<span class="small bold">Send report to Telegram</span></div>'+
        '</div>'+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zs-au-save">'+ico('check',14)+'Save schedule</button><button type="button" class="btn btn-sm btn-ghost" data-act="zs-au-tgprev">'+ico('chat',14)+'Preview Telegram report</button></div>'+
      '</section>'+
    '</div></div>';
}
function zs_auSummary(r){
  return r.groups.length+' groups · '+r.agents.map(function(x){ return zs_agent(x).en; }).join(', ')+' · '+r.devices.length+' screens';
}
function zs_auHistory(a){
  if(!a.runs.length) return '<div class="zs-empty">No runs yet — tap "Run now".</div>';
  return '<section class="zs-card"><h2>Report history</h2><div class="zs-sub za-bn">প্রতিবারের রিপোর্ট — আগের সপ্তাহের সাথে তুলনা করা যায় (PR 421)।</div><div class="zs-list">'+a.runs.map(function(r, i){
    var tot = r.pass + r.fail, pct = Math.round(r.pass/Math.max(1,tot)*100), prev = a.runs[i+1], d = prev ? r.fail - prev.fail : null;
    return '<div class="zs-li"><div style="min-width:0"><div class="t">'+esc(zs_time(r.at))+' <span class="zs-mini" style="font-weight:500">· '+esc(r.trigger)+'</span></div><div class="m">'+esc(zs_auSummary(r))+'</div>'+
      '<div class="row mt8" style="gap:10px"><div class="zs-bar split grow" style="max-width:320px"><i style="width:'+(r.pass/(tot+r.na)*100)+'%"></i><i class="f" style="width:'+(r.fail/(tot+r.na)*100)+'%"></i><i class="n" style="width:'+(r.na/(tot+r.na)*100)+'%"></i></div><span class="small bold">'+pct+'% pass · '+r.fail+' fail</span>'+(d!==null?'<span class="zs-mini">'+(d>0?'+'+d+' vs last':d<0?d+' vs last':'same as last')+'</span>':'')+'</div></div>'+
      '<div class="r"><button type="button" class="btn btn-sm btn-secondary" data-act="zs-au-open" data-id="'+r.id+'">Open report</button><button type="button" class="btn btn-sm btn-ghost" data-act="zs-au-send" data-id="'+r.id+'" aria-label="Send to Telegram">'+ico('chat',14)+'Telegram</button></div></div>';
  }).join('')+'</div></section>';
}
function zs_auBugsTab(a){
  var r = a.runs[0]; if(!r) return '<div class="zs-empty">No runs yet.</div>';
  return '<section class="zs-card"><div class="row between"><h2>Bugs from the last run</h2><span class="zs-mini">'+esc(zs_time(r.at))+'</span></div>'+
    '<div class="zs-note mt8">'+ico('shield',16)+'<div class="zs-bnp"><b>অনুমতি ছাড়া কিছু বদলায় না (PR 420)।</b> এজেন্ট প্রস্তাব দেয় → আপনি "Approve" চাপেন → আগে টেস্ট সার্ভারে ঠিক হয় → একই চেক আবার পাস করলে তবেই লাইভে।</div></div>'+
    (r.bugs.length ? r.bugs.map(function(b){ return zs_bugCard(r, b); }).join('') : '<div class="zs-empty mt12">No bugs — every chosen check passed.</div>')+'</section>';
}
function zs_bugFix(b){
  var ag = zs_agent(b.owner), g = ZS_CHECK.filter(function(x){ return x.n===b.g; })[0];
  return ag.bn+' ('+ag.en+') নিজের ফাইলে নিয়মটা ঠিক করবে — শুধু এই জায়গা না, একই ধরনের সব জায়গায় ("fix the rule, not the instance")। তারপর '+zs_devName(b.dev)+' আর বাকি ১৫টা ফোন সাইজে "'+b.item+'" চেক আবার চালাবে। ঝুঁকি: কম · '+(g?esc(g.name):'')+' গ্রুপের বাইরে কিছু ছোঁবে না।';
}
var ZS_ST_LABEL = {open:'Open', proposed:'Fix proposed', approved:'Approved — fixing on test server', fixed:'Fixed · re-test passed', rejected:'Rejected'};
function zs_bugCard(r, b){
  var ag = zs_agent(b.owner), g = ZS_CHECK.filter(function(x){ return x.n===b.g; })[0];
  var acts = b.st==='open' ? '<button type="button" class="btn btn-sm btn-secondary" data-act="zs-bug" data-r="'+r.id+'" data-b="'+b.id+'" data-v="propose">'+ico('spark',14)+'Propose fix</button>'
    : b.st==='proposed' ? '<button type="button" class="btn btn-sm btn-primary" data-act="zs-bug" data-r="'+r.id+'" data-b="'+b.id+'" data-v="approve">'+ico('check',14)+'Approve</button><button type="button" class="btn btn-sm btn-ghost" data-act="zs-bug" data-r="'+r.id+'" data-b="'+b.id+'" data-v="reject">Reject</button>'
    : b.st==='rejected' ? '<button type="button" class="btn btn-sm btn-ghost" data-act="zs-bug" data-r="'+r.id+'" data-b="'+b.id+'" data-v="reopen">Reopen</button>' : '';
  return '<div class="zs-bug" id="zs-bug-'+r.id+'-'+b.id+'"><div class="row between top" style="gap:8px"><div style="min-width:0"><span class="id">'+esc(b.id)+' · '+esc(b.item)+'</span> <span class="zs-mini">'+(g?esc(g.name):'')+' · '+esc(zs_devName(b.dev))+'</span><div class="small mt8" style="font-weight:600">'+esc(b.text)+'</div></div><span class="zs-st '+b.st+'">'+esc(ZS_ST_LABEL[b.st])+'</span></div>'+
    '<div class="row mt8" style="gap:8px">'+zs_av(ag, 'av')+'<span class="zs-mini">Owner: <b>'+esc(ag.en)+' · '+esc(ag.bn)+'</b></span></div>'+
    (b.st!=='open' ? '<div class="zs-fix zs-bnp"><b>প্রস্তাব:</b> '+zs_bugFix(b)+'</div>' : '')+
    (acts ? '<div class="zs-actions mt12">'+acts+'</div>' : '')+'</div>';
}
ACT['zs-au-tab'] = function(el){ UI['zs-au-tab'] = el.getAttribute('data-v'); rerender(); };
ACT['zs-au-g'] = function(el){ var a = zs_au(), n = +el.getAttribute('data-n'); a.groups[n] = !a.groups[n]; saveState(); rerender(); };
ACT['zs-au-pri'] = function(el){ var a = zs_au(), p = +el.getAttribute('data-p'), list = ZS_CHECK.filter(function(g){ return zs_gPri(g)===p; }), all = list.every(function(g){ return a.groups[g.n]; }); list.forEach(function(g){ a.groups[g.n] = !all; }); saveState(); rerender(); };
ACT['zs-au-ag'] = function(el){ var a = zs_au(), id = el.getAttribute('data-id'), i = a.agents.indexOf(id);
  if(i>=0){ if(a.agents.length===1){ toast('At least one agent must run the audit'); return; } a.agents.splice(i,1); }
  else { if(a.agents.length>=3){ toast('Up to 3 agents at once — take one off first'); return; } a.agents.push(id); }
  saveState(); rerender(); };
ACT['zs-au-dev'] = function(el){ var a = zs_au(), d = el.getAttribute('data-d'), i = a.devices.indexOf(d); if(i>=0){ if(a.devices.length===1){ toast('Pick at least one screen'); return; } a.devices.splice(i,1); } else a.devices.push(d); saveState(); rerender(); };
ACT['zs-au-sched'] = function(){ var a = zs_au(); a.sched.on = !a.sched.on; saveState(); rerender(); toast(a.sched.on ? 'Scheduled audit on' : 'Scheduled audit off'); };
ACT['zs-au-tg'] = function(){ var a = zs_au(); a.sched.tg = !a.sched.tg; saveState(); rerender(); toast(a.sched.tg ? 'Reports will go to Telegram' : 'Telegram report off'); };
CHANGE['zs-au-s'] = function(el){ var a = zs_au(); a.sched[el.getAttribute('data-k')] = el.value; saveState(); rerender(); };
ACT['zs-au-save'] = function(){ var a = zs_au(), s = a.sched; toast(s.on ? 'Saved — audit runs '+(s.freq==='daily'?'every day':s.freq==='monthly'?'on the 1st':'every '+s.day)+' at '+s.time+(s.tg?', report to Telegram':'') : 'Saved — schedule is off'); };
function zs_auTgText(r){
  if(!r) return 'এখনও কোন রিপোর্ট নেই।';
  var tot = r.pass + r.fail;
  return 'প্রহরী · সাইট অডিট রিপোর্ট\n'+zs_time(r.at)+'\n\nপাস: '+zs_bnNum(r.pass)+' / '+zs_bnNum(tot)+' ('+zs_bnNum(Math.round(r.pass/Math.max(1,tot)*100))+'%)\nফেল: '+zs_bnNum(r.fail)+' · টেস্ট করা যায়নি: '+zs_bnNum(r.na)+'\n\n'+
    (r.bugs.slice(0,3).map(function(b){ return '• '+b.item+' — '+b.text; }).join('\n'))+(r.bugs.length>3?'\n… আরও '+zs_bnNum(r.bugs.length-3)+'টা':'')+'\n\nঠিক করার প্রস্তাব অনুমতির অপেক্ষায় → ড্যাশবোর্ড › Site audit';
}
ACT['zs-au-tgprev'] = function(){ var r = zs_au().runs[0]; openModal('<div class="zs-tg"><div class="zs-tg-h">EXTAS Owner bot · Telegram</div><div class="zs-tg-b">'+esc(zs_auTgText(r))+'</div></div><div class="xs muted mt12">Demo preview — nothing is sent.</div>', {title:'Telegram report (preview)'}); };
ACT['zs-au-send'] = function(el){ var r = zs_au().runs.filter(function(x){ return x.id===el.getAttribute('data-id'); })[0]; openModal('<div class="zs-tg"><div class="zs-tg-h">EXTAS Owner bot · Telegram</div><div class="zs-tg-b">'+esc(zs_auTgText(r))+'</div></div><div class="small text2 mt12">'+ico('check',14,'style="vertical-align:-2px;color:var(--brand)"')+' Sent to your Telegram (demo — nothing really sent).</div>', {title:'Report sent'}); };
function zs_auRunHTML(){
  var u = UI['zs-aur']; if(!u) return '';
  if(u.done){ var r = zs_au().runs.filter(function(x){ return x.id===u.id; })[0]; return zs_reportHTML(r); }
  var a = zs_au(), lanes = u.lanes;
  return '<div class="stack s16"><div class="small text2 za-bn">'+zs_bnNum(lanes.length)+' জন এজেন্ট একসাথে কাজ করছে · '+zs_bnNum(u.devices.length)+'টা স্ক্রিন</div><div class="zs-lanes">'+lanes.map(function(l){
    var ag = zs_agent(l.agent), pct = Math.min(100, Math.round(u.tick/u.ticks*100));
    var cur = l.groups[Math.min(l.groups.length-1, Math.floor(u.tick/u.ticks*l.groups.length))];
    var g = ZS_CHECK.filter(function(x){ return x.n===cur; })[0];
    return '<div class="zs-lane"><div class="row between"><span class="row" style="gap:8px">'+zs_av(ag)+'<span class="small bold">'+esc(ag.en)+' · '+esc(ag.bn)+'</span></span><span class="zs-mini">'+pct+'%</span></div><div class="zs-mini mt8">'+(pct<100 && g ? 'Checking: '+esc(g.name) : 'Done')+' · '+l.groups.length+' groups</div><div class="mt8">'+zs_bar(pct)+'</div></div>';
  }).join('')+'</div><div class="xs muted">You can close this — the report is saved when it finishes.</div></div>';
}
ACT['zs-au-run'] = function(){
  var a = zs_au(), gs = ZS_CHECK.filter(function(g){ return a.groups[g.n]; }).map(function(g){ return g.n; });
  if(!gs.length){ toast('Pick at least one group first'); return; }
  var lanes = a.agents.map(function(id){ return {agent:id, groups:[]}; });
  gs.forEach(function(n, i){ lanes[i % lanes.length].groups.push(n); });
  var u = UI['zs-aur'] = {lanes:lanes, devices:a.devices.slice(), tick:0, ticks:6, done:false, tok:Date.now()};
  openModal(zs_auRunHTML(), {title:'Site audit running', rebuild:zs_auRunHTML, zsKey:'zs-aur', wide:true});
  var tok = u.tok;
  for(var i=1;i<=u.ticks;i++) (function(i){ setTimeout(function(){
    if(UI['zs-aur']!==u || u.tok!==tok) return; u.tick = i;
    if(i===u.ticks){
      var r = zs_auMake({at:Date.now(), trigger:'Run now (you)', agents:a.agents, devices:a.devices, groups:gs, seed:'m'+Date.now()});
      a.runs.unshift(r); a.runs = a.runs.slice(0, 12); u.id = r.id; u.done = true; saveState(); UI['zs-au-tab'] = 'history'; rerender();
      toast('Audit finished — '+r.fail+' bug'+(r.fail===1?'':'s')+' found'+(a.sched.tg?' · report sent to Telegram (demo)':''));
    }
    if(MODAL && MODAL.opts && MODAL.opts.zsKey==='zs-aur') refreshModal();
  }, i*450); })(i);
};
function zs_reportHTML(r){
  if(!r) return '';
  var tot = r.pass + r.fail;
  var rows = r.groups.map(function(n){ var g = ZS_CHECK.filter(function(x){ return x.n===n; })[0], x = r.res[n] || {p:0,f:0,na:0}, all = x.p+x.f+x.na || 1;
    return '<div class="zs-rep-g"><span class="small"><span class="zs-pri p'+zs_gPri(g)+'">P'+zs_gPri(g)+'</span> '+esc(g.name)+'</span><span class="small bold" style="white-space:nowrap">'+(x.f?'<span style="color:var(--sale)">'+x.f+' fail</span> · ':'')+x.p+' pass'+(x.na?' · <span class="zs-mini">'+x.na+' n/a</span>':'')+'</span>'+
      '<div class="zs-bar split"><i style="width:'+(x.p/all*100)+'%"></i><i class="f" style="width:'+(x.f/all*100)+'%"></i><i class="n" style="width:'+(x.na/all*100)+'%"></i></div></div>'; }).join('');
  return '<div class="stack s16" data-testid="zs-report">'+
    '<div class="zs-kpis k4" style="margin:0"><div class="zs-k ok"><div class="v">'+r.pass+'</div><div class="l">Pass</div></div><div class="zs-k '+(r.fail?'bad':'ok')+'"><div class="v">'+r.fail+'</div><div class="l">Fail</div></div><div class="zs-k"><div class="v">'+r.na+'</div><div class="l">Not testable</div><div class="s">needs real phone / server</div></div><div class="zs-k"><div class="v">'+Math.round(r.pass/Math.max(1,tot)*100)+'%</div><div class="l">Score</div></div></div>'+
    '<div class="zs-mini">'+esc(zs_time(r.at))+' · '+esc(r.trigger)+' · '+esc(zs_auSummary(r))+' · '+r.devices.map(zs_devName).join(', ')+'</div>'+
    '<div><div class="h3" style="font-size:15px;margin-bottom:4px">By group</div>'+rows+'</div>'+
    '<div><div class="h3" style="font-size:15px">Bugs ('+r.bugs.length+')</div>'+(r.bugs.length ? r.bugs.map(function(b){ return zs_bugCard(r, b); }).join('') : '<div class="zs-empty mt8">No bugs.</div>')+'</div>'+
    '<div class="xs muted">Simulated run for the demo — the real runner walks the shop with Playwright on each chosen screen.</div></div>';
}
ACT['zs-au-open'] = function(el){ var id = el.getAttribute('data-id'); UI['zs-aur'] = {done:true, id:id}; openModal(zs_auRunHTML(), {title:'Audit report', rebuild:zs_auRunHTML, zsKey:'zs-aur', wide:true}); };
ACT['zs-bug'] = function(el){
  var a = zs_au(), r = a.runs.filter(function(x){ return x.id===el.getAttribute('data-r'); })[0]; if(!r) return;
  var b = r.bugs.filter(function(x){ return x.id===el.getAttribute('data-b'); })[0]; if(!b) return;
  var v = el.getAttribute('data-v');
  if(v==='propose'){ b.st = 'proposed'; toast(zs_agent(b.owner).en+' proposed a fix — waiting for your approval'); }
  else if(v==='approve'){ b.st = 'approved'; toast('Approved — fixing on the test server'); setTimeout(function(){ if(b.st!=='approved') return; b.st = 'fixed'; saveState(); if(MODAL) refreshModal(); rerender(); toast(b.item+' fixed — re-test passed (demo)'); }, 1400); }
  else if(v==='reject'){ b.st = 'rejected'; toast('Rejected — nothing changes'); }
  else if(v==='reopen'){ b.st = 'open'; }
  saveState(); if(MODAL) refreshModal(); rerender();
};

/* =====================================================================
   4. SERVER HEALTH — simulated numbers + Telegram alerts (PR 423)
   ===================================================================== */
function zs_hl(){
  var y = zs_ensure();
  if(!y.health) y.health = {seed:1, spike:false, alerts:{down:true, cpu:true, ram:true, disk:true, resp:true, backup:true, ssl:true}, thr:{cpu:85, ram:90, disk:80, resp:1500}, quiet:true, log:[
    {at:Date.now()-2*86400000-3600000*7, t:'Response time 1.9 s for 6 min (image-heavy winter page) — back to normal', lv:'warn'},
    {at:Date.now()-9*86400000, t:'SSL certificate renewed automatically (90 days)', lv:'ok'}]};
  return y.health;
}
function zs_hlSeries(key, base, amp, n){ var h = zs_hl(), out = []; for(var i=0;i<n;i++){ out.push(Math.max(1, base + amp*(Math.sin((i+h.seed)*0.7) + (zs_rnd(key+h.seed+'|'+i)-0.5)*1.4))); } return out; }
function zs_spark(vals, max){
  var n = vals.length, w = 100, h = 30, mx = max || Math.max.apply(null, vals)*1.15;
  var pts = vals.map(function(v, i){ return (i/(n-1)*w).toFixed(1)+','+(h - v/mx*h).toFixed(1); }).join(' ');
  return '<svg class="zs-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polygon class="ar" points="0,30 '+pts+' 100,30"/><polyline points="'+pts+'"/></svg>';
}
function zs_hlNow(){
  var h = zs_hl();
  var cpu = zs_hlSeries('cpu', 22, 9, 24), ram = zs_hlSeries('ram', 41, 3, 24), resp = zs_hlSeries('resp', 190, 45, 24);
  if(h.spike){ cpu[23] = 93; resp[23] = 1680; }
  return {cpu:cpu, ram:ram, resp:resp, disk:32 + (h.seed%3), up:'41 d 6 h', avail:'99.98%'};
}
PAGES['admin-health'] = { layout:'admin', title:'Server health', render:function(){
  var h = zs_hl(), n = zs_hlNow(), t = h.thr;
  var cpu = Math.round(n.cpu[23]), ram = Math.round(n.ram[23]), resp = Math.round(n.resp[23]);
  var cl = function(v, thr){ return v>=thr ? 'bad' : v>=thr*0.85 ? 'warn' : 'ok'; };
  var svc = [['Website (Next.js)','ok','2 containers · healthy'],['Database (PostgreSQL)','ok','38 connections · 0 slow queries'],['Cache (Redis)','ok','hit rate 94%'],['Job queue','ok','3 waiting · 0 failed'],['Backups','ok','last '+zs_time(zs_bk().runs[0].at)],['SSL certificate','ok','63 days left · auto-renew'],['Cloudflare','ok','cache 71% · no attacks today']];
  var alerts = [['down','Site is down (always on)','সাইট বন্ধ হলে সাথে সাথে',null],['cpu','CPU above','প্রসেসর বেশি ব্যস্ত হলে','cpu','%'],['ram','Memory above','মেমরি ভরে এলে','ram','%'],['disk','Disk above','ডিস্ক ভরে এলে','disk','%'],['resp','Response slower than','সাইট ধীর হলে','resp','ms'],['backup','A backup fails','ব্যাকআপ ব্যর্থ হলে',null],['ssl','SSL ends in under 14 days','SSL শেষ হওয়ার আগে',null]];
  return '<div class="zs-page">'+
    zs_head('Admin · Site health '+zs_pr('423 · 399 · 400'), 'Server health', 'সার্ভারের অবস্থা',
      'সার্ভার কেমন চলছে — প্রসেসর, মেমরি, ডিস্ক, কত তাড়াতাড়ি সাইট খোলে। কিছু সীমা ছাড়ালে টেলিগ্রামে সাথে সাথে খবর যাবে, আর প্রহরী কারণ খুঁজে প্রস্তাব দেবে।',
      zs_simTag()+'<button type="button" class="btn btn-secondary" data-act="zs-hl-refresh">'+ico('swap',15)+'Refresh</button>')+
    (h.spike ? '<div class="zs-note warn mb16">'+ico('info',17)+'<div class="zs-bnp"><b>CPU '+cpu+'% — সীমা '+t.cpu+'% ছাড়িয়েছে।</b> টেলিগ্রামে খবর গেছে (ডেমো)। <button type="button" class="zs-link" data-act="zs-hl-diag">প্রহরীর বিশ্লেষণ দেখুন</button> · <button type="button" class="zs-link" data-act="zs-hl-calm">স্বাভাবিক করুন</button></div></div>' : '')+
    '<div class="zs-kpis k6">'+
      '<div class="zs-k '+cl(cpu, t.cpu)+'"><div class="v">'+cpu+'%</div><div class="l">CPU</div><div class="s">8 vCPU · last 24 h</div>'+zs_spark(n.cpu, 100)+'</div>'+
      '<div class="zs-k '+cl(ram, t.ram)+'"><div class="v">'+ram+'%</div><div class="l">Memory</div><div class="s">'+Math.round(ram*0.64)+' of 64 GB</div>'+zs_spark(n.ram, 100)+'</div>'+
      '<div class="zs-k '+cl(n.disk, t.disk)+'"><div class="v">'+n.disk+'%</div><div class="l">Disk</div><div class="s">'+Math.round(n.disk*3)+' of 300 GB SSD</div>'+zs_bar(n.disk, n.disk>=t.disk?'bad':'')+'</div>'+
      '<div class="zs-k '+cl(resp, t.resp)+'"><div class="v">'+resp+' ms</div><div class="l">Response time</div><div class="s">p95 '+Math.round(resp*2.2)+' ms</div>'+zs_spark(n.resp)+'</div>'+
      '<div class="zs-k ok"><div class="v">'+n.up+'</div><div class="l">Uptime</div><div class="s">since last update</div></div>'+
      '<div class="zs-k ok"><div class="v">'+n.avail+'</div><div class="l">Last 30 days</div><div class="s">8 min down in total</div></div>'+
    '</div>'+
    '<div class="zs-g2">'+
      '<section class="zs-card"><div class="row between"><h2>Services</h2><span class="tag">'+ico('check',12)+'All running</span></div><div class="zs-sub">Azure E8ds v4 · Docker · Caddy · Cloudflare</div>'+
        svc.map(function(s){ return '<div class="zs-row"><div class="grow"><div class="small bold"><span class="zs-dot" style="margin-right:7px"></span>'+esc(s[0])+'</div><div class="zs-mini">'+esc(s[2])+'</div></div></div>'; }).join('')+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zs-hl-diag">'+ico('spark',14)+'Ask Prohori to check</button><button type="button" class="btn btn-sm btn-ghost" data-act="zs-hl-spike">'+ico('bolt',14)+'Simulate a spike</button></div></section>'+
      '<section class="zs-card"><div class="row between"><h2>Telegram alerts</h2><span class="tag plain">'+ico('chat',13)+'EXTAS Owner bot</span></div><div class="zs-sub za-bn">কোন অবস্থায় আপনাকে টেলিগ্রামে জানাবে।</div>'+
        alerts.map(function(x){ var on = !!h.alerts[x[0]];
          return '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(x[1])+'</div><div class="zs-mini za-bn">'+esc(x[2])+'</div>'+(x[3]?'<div class="zs-thr mt8"><input class="input zs-in" type="number" inputmode="numeric" min="1" value="'+esc(t[x[3]])+'" data-input="zs-hl-thr" data-k="'+x[3]+'" aria-label="'+esc(x[1])+' threshold"><span class="zs-mini">'+x[4]+' for 5 minutes</span></div>':'')+'</div>'+
            (x[0]==='down' ? '<span class="tag">Always</span>' : zs_sw(on, 'zs-hl-al', x[1], 'data-k="'+x[0]+'"'))+'</div>'; }).join('')+
        '<div class="zs-row"><div class="grow"><div class="small bold">Quiet hours 23:00–08:00</div><div class="zs-mini za-bn">রাতে শুধু "সাইট বন্ধ" খবর আসবে</div></div>'+zs_sw(h.quiet, 'zs-hl-quiet', 'Quiet hours')+'</div>'+
        '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-secondary" data-act="zs-hl-test">'+ico('chat',14)+'Send test alert</button></div></section>'+
    '</div>'+
    '<section class="zs-card mt24"><h2>Alert log</h2><div class="zs-sub za-bn">আগে কী কী খবর গেছে।</div><div class="zs-list">'+h.log.map(function(l){ return '<div class="zs-li"><div style="min-width:0"><div class="t"><span class="zs-dot'+(l.lv==='warn'?' warn':l.lv==='bad'?' bad':'')+'" style="margin-right:7px"></span>'+esc(l.t)+'</div><div class="m">'+esc(zs_time(l.at))+'</div></div></div>'; }).join('')+'</div></section>'+
  '</div>';
}};
ACT['zs-hl-refresh'] = function(){ var h = zs_hl(); h.seed++; saveState(); rerender(); toast('Updated just now (demo numbers)'); };
ACT['zs-hl-al'] = function(el){ var h = zs_hl(), k = el.getAttribute('data-k'); h.alerts[k] = !h.alerts[k]; saveState(); rerender(); toast('Alert '+(h.alerts[k]?'on':'off')); };
ACT['zs-hl-quiet'] = function(){ var h = zs_hl(); h.quiet = !h.quiet; saveState(); rerender(); toast(h.quiet ? 'Quiet hours on' : 'Quiet hours off'); };
INPUT['zs-hl-thr'] = function(el){ var h = zs_hl(), n = parseInt(el.value, 10); if(isNaN(n) || n<1) return; h.thr[el.getAttribute('data-k')] = n; saveState(); };
ACT['zs-hl-test'] = function(){
  var msg = 'প্রহরী · টেস্ট অ্যালার্ট\nসব ঠিক আছে — এটা শুধু দেখার জন্য।\nCPU '+Math.round(zs_hlNow().cpu[23])+'% · Memory '+Math.round(zs_hlNow().ram[23])+'% · Disk '+zs_hlNow().disk+'%';
  openModal('<div class="zs-tg"><div class="zs-tg-h">EXTAS Owner bot · Telegram</div><div class="zs-tg-b">'+esc(msg)+'</div></div><div class="small text2 mt12">This is what an alert looks like. Demo — nothing is sent.</div>', {title:'Test alert'});
  var h = zs_hl(); h.log.unshift({at:Date.now(), t:'Test alert sent to Telegram (demo)', lv:'ok'}); saveState(); rerender();
};
ACT['zs-hl-spike'] = function(){ var h = zs_hl(); h.spike = true; h.log.unshift({at:Date.now(), t:'CPU 93% for 5 min — Telegram alert sent (demo)', lv:'bad'}); saveState(); rerender(); toast('Spike simulated — alert sent to Telegram (demo)'); };
ACT['zs-hl-calm'] = function(){ var h = zs_hl(); h.spike = false; h.log.unshift({at:Date.now(), t:'CPU back to normal', lv:'ok'}); saveState(); rerender(); toast('Back to normal'); };
ACT['zs-hl-diag'] = function(){
  var h = zs_hl();
  var txt = h.spike
    ? 'কী দেখলাম: গত ৫ মিনিটে CPU ৯৩%। একই সময়ে ফেসবুক অ্যাড থেকে হঠাৎ অনেক ভিজিটর এসেছে (ল্যান্ডিং পেজ · Polo Duo)।\nকারণ: নতুন শীতের ৩টা প্রোডাক্টের ছবি ৯০০ KB-এর বেশি, প্রতিবার ছোট করতে হচ্ছে।\nপ্রস্তাব: ছবিগুলো আগে থেকেই ছোট করে রাখা (WebP)। ঝুঁকি কম, দোকান বন্ধ হবে না।'
    : 'সব স্বাভাবিক। গত ৭ দিনে সাইট খোলার সময় ১২% বেড়েছে — কারণ নতুন শীতের প্রোডাক্টের বড় ছবি।\nপ্রস্তাব: ৩টা ছবি WebP করে ছোট করা। ঝুঁকি কম।';
  openModal('<div class="stack s16"><div class="row" style="gap:10px">'+zs_av(zs_agent('prohori'), 'av')+'<div><div class="small bold">Prohori · প্রহরী</div><div class="zs-mini">AI diagnosis (PR 423) · demo text</div></div></div><div class="zs-fix zs-bnp" style="white-space:pre-line">'+esc(txt)+'</div>'+
    '<div class="zs-note">'+ico('shield',16)+'<div class="zs-bnp">আপনার অনুমতি ছাড়া কিছু বদলাবে না (PR 420)।</div></div>'+
    '<div class="row end" style="gap:8px"><button type="button" class="btn btn-ghost" data-act="close-modal">Not now</button><button type="button" class="btn btn-primary" data-act="zs-hl-approve">'+ico('check',15)+'Approve the fix</button></div></div>', {title:'Prohori checked the server'});
};
ACT['zs-hl-approve'] = function(){ closeModal(); var h = zs_hl(); h.spike = false; h.log.unshift({at:Date.now(), t:'Approved: product photos converted to WebP — response time back to normal (demo)', lv:'ok'}); saveState(); rerender(); toast('Approved — Prohori applied the fix (demo)'); };

/* ---- the e-commerce checklist (qa/ECOMMERCE-CHECKLIST.md, embedded at build time; 404 checks in 23 groups) ---- */
var ZS_CHECK = [{"n":1,"name":"Navigation & history","subs":[{"name":"Back / forward","items":[["N01","Browser Back from any page returns to the page before it (one step, never two). *(browser Back/Forward alone are correct (desktop run, 14/14 steps))*"],["N02","Browser Forward after a Back returns to the page you came back from. *(browser Back/Forward alone are correct (desktop run, 14/14 steps))*"],["N03","Edge swipe back (iPhone) from any page returns to the page before it."],["N04","A slow edge swipe (finger held 0.7–1.5 s) still goes back. *(bug #13)*"],["N05","Edge swipe back never goes back two pages. *(bug #4)*"],["N06","Edge swipe back on a page with a photo slider goes back (does not just move the photo)."],["N07","After an edge swipe back, the browser Back button still goes further back (not forward). *(bug #2)*"],["N08","After an edge swipe back, the browser Forward button returns to the page you left. *(bug #2)*"],["N09","Backspace (outside a text field) goes back one page."],["N10","Backspace inside a text field deletes a character and never leaves the page."],["N11","Alt+← goes back; Alt+→ goes forward."],["N12","Back with a popup open closes the popup first and stays on the page. *(bug #11)*"],["N13","Back from the first page of the visit never shows a blank page."],["N14","Back/forward repeated 10+ times across 8 pages never shows a blank page."],["N15","Back/forward repeated never skips a page. *(bug #2)*"],["N16","The shop never jumps to Home by itself after a back/forward (wait 3 s, no touch)."],["N17","Back from the thank-you page does not re-place the order or show a filled checkout."],["N18","Back from checkout returns to the bag with the bag unchanged."],["N19","Back from a product reached from search returns to the same search results."],["N20","Back from a product reached from a filtered/sorted category keeps the filter and sort."],["N21","Opening a popup (menu, search, size finder) does not add a history step that needs an extra Back."],["N22","Changing colour/size on a product does not add history steps (Back leaves the product)."],["N23","Category → product → header bag icon → bag → back lands on the product."],["N24","…→ back again lands on the category."],["N25","…→ forward returns to the product. *(bug #2)*"],["N26","Back still works after a pull-to-refresh. *(bug #12)*"],["N27","Back still works after a full page reload (F5). *(bug #12)*"]]},{"name":"Scroll position","items":[["N28","Home → scroll to footer → tap Contact → back lands at the footer position, not the top. *(bug #1)*"],["N29","Category scrolled to row 4 → product → back returns to row 4 (same product on screen). *(bug #1)*"],["N30","Search results scrolled → product → back keeps the scroll. *(kept 500 px — by browser luck, no code does it (see bug #1))*"],["N31","Journal scrolled → article → back keeps the scroll. *(bug #1)*"],["N32","Bag scrolled → product → back keeps the scroll. *(bug #1)*"],["N33","Forward to a page you had scrolled restores that scroll too. *(bug #1)*"],["N34","A NEW page (tapped link) always opens at the top."],["N35","Scroll restore lands on the final spot directly (no visible jump from top, no \"slide down\"). *(bug #1)*"],["N36","Changing size/colour/quantity on a page keeps the scroll where it is."],["N37","Opening and closing a popup keeps the page scroll where it was."]]},{"name":"Gestures, refresh, deep links, 404","items":[["N38","Pull-to-refresh at the top of Home reloads and stays on Home."],["N39","Pull-to-refresh works at the top of: category, product, combo, set builder, bag, checkout, thank-you, account, order, help page, journal, search, landing, admin."],["N40","Pull-to-refresh shows \"Pull to refresh\" → \"Release to refresh\" → \"Refreshing…\"."],["N41","A short pull (below the line) does not reload."],["N42","Pulling while scrolled down just scrolls (no refresh)."],["N43","Pulling inside a popup/menu does not refresh the page."],["N44","Refresh keeps the bag, the login and the page you were on."],["N45","Pull-to-refresh never appears on desktop."],["N46","Every page opened directly from a pasted link (deep link) renders fully."],["N47","A deep link to a product with ?finder=1 opens the size finder once."],["N48","An unknown address shows a friendly \"Page not found\" with a way home."],["N49","A product/combo/order/landing that does not exist shows \"not found\", never a crash or blank."],["N50","Home has no blank history step before it (Back from Home stays in the shop or leaves cleanly)."],["N51","Page transitions have no jolt: main content position is stable 0/300/800/1500 ms after every navigation. *(bug #10 (header at 360 px); page content itself: 0 px movement on every nav)*"],["N52","No \"slide down from the top\" movement after landing on a page. *(no slide seen in Chromium; needs a real iPhone (WebKit not installed))*"]]}]},{"n":2,"name":"Layout & responsiveness","subs":[{"name":"","items":[["L01","No page scrolls sideways at 320 px."],["L02","No page scrolls sideways at 360, 375, 393, 430, 440 px."],["L03","No page scrolls sideways at 1280 and 1440 px."],["L04","Nothing sticks out past the right edge on any phone width. *(demo-only 'Demo controls' tab pokes past 1280 px (bug #22))*"],["L05","Text is never cut off mid-word inside buttons, pills or price rows."],["L06","Rotating a phone to landscape keeps every page usable (no overflow, bars fit)."],["L07","Rotating back to portrait restores the layout without a reload."],["L08","The browser toolbar hiding/showing while scrolling does not move the page content (no jolt)."],["L09","No layout shift after the page has drawn (CLS < 0.1 per page, ideally < 0.02)."],["L10","Late web fonts do not make text jump."],["L11","Images reserve their space before they load (no jump when they appear). *(needs real photos / a real iPhone)*"],["L12","iPhone safe areas: bottom bars clear the home indicator (viewport-fit=cover + env()). *(needs real photos / a real iPhone)*"],["L13","iPhone safe areas: nothing hides under the notch / Dynamic Island in landscape. *(needs real photos / a real iPhone)*"],["L14","The sticky header stays put while scrolling and never covers the page title after a jump."],["L15","The bottom nav / buy bar never covers the last item on the page."],["L16","The buy bar on the product page is always fully on screen (never half sunk)."],["L17","Only one sticky bottom bar shows at a time (buy bar OR bottom nav, not stacked)."],["L18","Desktop: content has a max width and does not stretch edge-to-edge at 1440."],["L19","Desktop: hover states exist on links, cards and buttons."],["L20","Grids drop to 2 columns on phones, 3–4 on desktop, with even gaps."],["L21","The page has no rubber-band that drags fixed bars off screen."],["L22","Zoom (pinch) is allowed; text stays readable at 200 % zoom."],["L23","Dark mode (if offered) has no white flashes or unreadable text. *(needs real photos / a real iPhone)*"],["L24","Every page has a minimum height (footer never floats mid-screen on short pages)."],["L25","Popups fit the screen at 320×640 and scroll inside themselves."],["L26","Popups on iPhone do not let the page behind scroll."],["L27","Horizontal carousels scroll with a swipe and snap cleanly."],["L28","Carousels do not drag the whole page sideways."],["L29","Long product names wrap cleanly on 320 px cards."],["L30","Bengali text (taller glyphs) fits the same boxes without clipping."],["L31","Every page keeps the 16 px side gutter on phones (text never touches the screen edge). *(bug #15)*"]]}]},{"n":3,"name":"Header, footer, menus","subs":[{"name":"","items":[["H01","Logo tap goes Home from every page."],["H02","Bag icon shows the correct item count and updates instantly after add/remove."],["H03","Bag icon tap opens the bag."],["H04","Search icon opens search with the keyboard up."],["H05","Menu (phone) opens, lists every category, and closes with ✕, backdrop tap, Esc and Back. *(Back with menu open leaves the page — bug #11)*"],["H06","Menu links go to the right pages and the menu closes after tapping."],["H07","Wishlist heart shows when there is room and never overlaps the logo."],["H08","Account icon goes to login when logged out, account when logged in."],["H09","WhatsApp icon in the header opens WhatsApp with a prefilled message (product named on a product page)."],["H10","Desktop nav highlights the current section."],["H11","Announcement bar text is short, readable and not cut."],["H12","Footer → Help → \"Size guide\" opens the height/weight size finder (not a product page). *(bug #5)*"],["H13","Footer → Contact opens the contact page."],["H14","Footer → Careers opens a careers page (not Contact). *(bug #6)*"],["H15","Footer → Track my order opens order tracking (asks to log in if needed)."],["H16","Footer → Delivery, Exchange & returns, FAQ, Privacy, Terms each open their own page."],["H17","Footer → \"Ways to pay\" opens a payment page (not Terms). *(bug #6)*"],["H18","Footer → Journal opens the journal."],["H19","Footer social links open the real social pages (not Home). *(bug #6)*"],["H20","Footer phone-number signup raises the number pad and validates the number."],["H21","Footer hotline is a tap-to-call link."],["H22","Footer shows payment marks (bKash, Nagad, Visa, Mastercard, COD)."],["H23","Footer shows DBID and trade licence numbers (real numbers before launch). *(bug #9)*"],["H24","Bottom nav (phone) highlights the current tab and every tab works."],["H25","Footer link columns line up and have tap targets ≥ 44 px tall."]]}]},{"n":4,"name":"Search","subs":[{"name":"","items":[["SR01","Searching \"polo\" shows polo products."],["SR02","A search with no results shows a friendly empty state with suggestions."],["SR03","An empty search does not crash and shows suggestions or popular items."],["SR04","Search is not case-sensitive."],["SR05","Search tolerates a typo (\"pollo\", \"panjbi\"). *(bug #8)*"],["SR06","Search finds by Bengali word (পোলো, পাঞ্জাবি)."],["SR07","Search finds by colour (\"navy polo\")."],["SR08","Search suggestions appear while typing."],["SR09","Search can answer help questions (delivery, exchange, size)."],["SR10","The search term stays in the box on the results page."],["SR11","The results page address can be shared (#/search?q=…)."],["SR12","Back from a result returns to the results at the same scroll."],["SR13","Pressing Enter / the keyboard's Search key submits."],["SR14","The search input raises a keyboard with a \"Search\" key (type=search / enterkeyhint)."],["SR15","Special characters (<script>, %, &) in the search do not break the page."]]}]},{"n":5,"name":"Category / listing","subs":[{"name":"","items":[["C01","Every category in the menu opens and shows products."],["C02","Product cards show photo, name, price in ৳ and colour count."],["C03","Sale price shows the old price struck through."],["C04","Sort (price low→high, high→low, new) reorders correctly."],["C05","Filters (size, colour, price) narrow the list and show a count."],["C06","Clearing filters restores the full list."],["C07","A filter combination with no products shows an empty state with \"Clear filters\"."],["C08","Filter/sort choices survive Back from a product."],["C09","Filter/sort are in the address (shareable) or at least kept for the session."],["C10","Out-of-stock items are marked or moved to the end."],["C11","Wishlist heart on a card saves without opening the product."],["C12","Tapping anywhere on the card photo or name opens the product."],["C13","Long lists load more (paging or \"show more\") without losing the scroll."],["C14","The category page has a title and a short description."],["C15","An empty category shows an empty state (not a blank grid)."],["C16","The category page has no layout shift as images load."],["C17","Category banners (offers, sets) link to working pages."],["C18","Category FAQ / SEO text opens and closes."],["C19","\"New in\" lists the newest items."],["C20","Card prices match the product page prices."],["C21","The filter sheet fits 320×640 and its Apply button is always reachable."],["C22","Chip rows scroll sideways without dragging the page."]]}]},{"n":6,"name":"Product page","subs":[{"name":"","items":[["P01","The product page shows name, price (৳), colour, sizes, add to bag, and photos above the fold on a phone."],["P02","Photo gallery swipes left/right on a phone."],["P03","Gallery arrows/dots/thumbnails show which photo is on."],["P04","Photo zoom (tap or pinch) works and closes."],["P05","Choosing a colour changes the photos and the name of the colour."],["P06","Choosing a size marks it selected."],["P07","Out-of-stock sizes are shown crossed out and cannot be added."],["P08","Low stock shows \"only N left\"."],["P09","Add to bag without a size asks for a size (no silent failure)."],["P10","Add to bag with a size adds exactly one item and updates the bag count."],["P11","Adding twice increases quantity (or adds a line) — never loses the first."],["P12","After adding, a confirmation shows with \"View bag\" and \"Keep shopping\"."],["P13","\"Order now\" / buy now goes straight to checkout with that item."],["P14","Size chart opens, shows cm/inch, and closes."],["P15","Find my size (height + weight) recommends a size and can select it."],["P16","The recommended size is remembered for other products."],["P17","Price shows the sale price and the saving when on sale."],["P18","Delivery charge and delivery time are shown on the page."],["P19","COD and exchange promise are shown near the buy button."],["P20","Fabric, GSM, fit and care details are present."],["P21","Reviews show stars, count and real-looking text; empty state if none."],["P22","Questions & answers open."],["P23","\"Pairs well with\" / combo upsell links work."],["P24","Recently viewed shows the last products."],["P25","Share / copy link works."],["P26","Wishlist heart on the product page toggles and shows a message."],["P27","WhatsApp \"ask about this\" names the product and SKU."],["P28","The sticky buy bar appears and its button works."],["P29","The selected size/colour is kept after Back and Forward to the same product."],["P30","A one-size item (socks, belt) does not ask for a size."],["P31","Product page loads with no layout shift."],["P32","Product URL with an unknown id shows \"not found\"."],["P33","Swiping the gallery does not trigger edge-swipe back unless it starts at the edge."],["P34","Photo alt text names the product and colour. *(demo uses drawn placeholders, no photos)*"],["P35","Price never shows NaN, undefined or ৳0."]]}]},{"n":7,"name":"Combos & sets","subs":[{"name":"","items":[["CB01","Each combo page opens and lists the items in the set."],["CB02","The combo price and the saving vs buying separately are correct."],["CB03","Every item in the combo needs a size before adding."],["CB04","The size finder can fill sizes for all items at once."],["CB05","Adding a combo puts one set line in the bag with the set price."],["CB06","Changing a size inside a set in the bag keeps the set price."],["CB07","Build-your-own set: picking items updates the running price."],["CB08","Build-your-own set: the \"add\" button is disabled until the set is complete."],["CB09","Combo with an out-of-stock item explains what to do."],["CB10","Combo page has no layout shift and no horizontal scroll at 320."],["CB11","Unknown combo id shows \"not found\"."],["CB12","Back from a combo step returns to the previous page (steps are not history entries)."]]}]},{"n":8,"name":"Bag","subs":[{"name":"","items":[["B01","Empty bag shows an empty state with a \"Shop\" button."],["B02","Each line shows photo, name, colour, size, quantity, price."],["B03","Quantity + / − updates the line and the totals instantly."],["B04","Quantity cannot go below 1 (removing is a separate action) or above stock."],["B05","Changing size in the bag works and re-checks stock."],["B06","Changing colour in the bag works."],["B07","Remove shows \"Undo\"; Undo restores the line in the same place."],["B08","Save for later moves the line out of the totals; it can be moved back."],["B09","Subtotal = sum of lines; total = subtotal − discounts + delivery."],["B10","Delivery band (Dhaka / outside) and free-delivery threshold are shown."],["B11","\"Add ৳X for free delivery\" is correct and updates."],["B12","Offer codes apply, show the saving, and can be removed."],["B13","A wrong offer code shows a clear error."],["B14","An out-of-stock line blocks checkout with a clear message."],["B15","The bag survives a reload and a new tab."],["B16","The bag count in the header matches the bag."],["B17","Checkout button is always reachable (sticky on phones)."],["B18","Two sizes of the same item asks \"for someone else?\" (owner rule)."],["B19","Send bag on WhatsApp works."],["B20","Bag page has no jolt when quantity changes."],["B21","Bag totals never show NaN or negative numbers."],["B22","Bag lines link back to their product page."]]}]},{"n":9,"name":"Checkout","subs":[{"name":"","items":[["CO01","Checkout with an empty bag shows an empty state, not a form."],["CO02","Name, phone and address fields have labels."],["CO03","Phone field raises the number pad (type=tel / inputmode)."],["CO04","Phone accepts 01XXXXXXXXX, +8801…, 8801… and spaces/dashes."],["CO05","Phone rejects too short / wrong operator numbers with a clear message."],["CO06","Address field accepts Bengali text."],["CO07","Address picks the delivery zone (inside / outside Dhaka) and updates the charge."],["CO08","Delivery charge, discount and total are correct and match the bag."],["CO09","Cash on Delivery is the default and is clearly explained."],["CO10","bKash / Nagad / card options show (and say what happens next)."],["CO11","Submitting with a missing field scrolls to it and says what to write."],["CO12","Pressing Enter in a field does not place the order. *(bug #3)*"],["CO13","Double-tapping \"Confirm order\" places only one order."],["CO14","After placing, the bag is empty and the thank-you page shows."],["CO15","A returning customer's name/phone/address are prefilled."],["CO16","Saved addresses can be picked."],["CO17","The order summary can be opened/collapsed on phones."],["CO18","Quantity can be changed or a line removed from checkout."],["CO19","Order note is optional and saved with the order."],["CO20","Marketing opt-in is unticked by default. *(bug #7)*"],["CO21","Checkout header is slim (no distractions) with a way back to the bag."],["CO22","\"Need help?\" WhatsApp is reachable on checkout."],["CO23","Checkout keeps typed details after a reload / pull-to-refresh. *(bug #14)*"],["CO24","Checkout keyboard does not cover the focused field on iPhone. *(needs a real phone keyboard / real gateway / server)*"],["CO25","Autofill (name, tel, street-address) works."],["CO26","The confirm button shows the total to pay."],["CO27","Wallet credit can be applied and shown."],["CO28","Checkout has no horizontal scroll at 320 px."],["CO29","Real payment gateway success/fail/cancel return pages work. *(needs a real phone keyboard / real gateway / server)*"],["CO30","Server re-checks stock and price at order time. *(needs a real phone keyboard / real gateway / server)*"]]}]},{"n":10,"name":"Thank-you, order tracking, invoice","subs":[{"name":"","items":[["T01","Thank-you page shows the order number, items, total and delivery estimate."],["T02","Thank-you page explains what happens next (call/SMS, courier)."],["T03","Order number can be copied."],["T04","Refreshing the thank-you page keeps showing the order."],["T05","An unknown order id on thanks/order shows \"not found\"."],["T06","Order page shows a status timeline."],["T07","Order page shows the courier and tracking number."],["T08","Invoice opens, prints and downloads."],["T09","Invoice totals match the order."],["T10","The customer can edit size before the order ships (owner rule)."],["T11","Exchange request flow opens from a delivered order and respects the window."],["T12","SMS / WhatsApp confirmation is sent. *(needs SMS / backend)*"],["T13","Track my order without logging in (phone + order number). *(needs SMS / backend)*"],["T14","Review request appears after delivery."]]}]},{"n":11,"name":"Account","subs":[{"name":"","items":[["A01","Login with phone + password works for the demo customer."],["A02","Wrong password shows a clear error (no page change)."],["A03","Login phone field raises the number pad."],["A04","Show/hide password works."],["A05","Forgot password explains the next step (OTP)."],["A06","OTP login/sign-up by SMS. *(needs SMS / backend)*"],["A07","Account home shows orders, wishlist, addresses, profile."],["A08","Orders list shows each order with status and total."],["A09","Wishlist shows saved items and lets you add to bag or remove."],["A10","Wishlist works logged out (saved on this phone) and merges on login."],["A11","Addresses can be added and removed."],["A12","Profile name / password can be changed."],["A13","My size is saved and used on product pages."],["A14","Logout logs out and returns to a sensible page."],["A15","Account pages need login (redirect to login, then back to the page asked for)."],["A16","Account tabs are real addresses (#/account/orders) and Back moves between them."],["A17","Referral code / wallet balance shows."],["A18","Account page has no horizontal scroll at 320."],["A19","Language switch is in the account/menu and remembered."],["A20","Delete my account / data request is possible. *(needs SMS / backend)*"]]}]},{"n":12,"name":"Messages & WhatsApp","subs":[{"name":"","items":[["M01","WhatsApp links use a real number in international format (wa.me/8801…). *(placeholder numbers/email — bug #9)*"],["M02","WhatsApp message is prefilled and names the product/order."],["M03","WhatsApp opens in a new tab/app, the shop stays open."],["M04","The floating WhatsApp button never covers the buy button or bag total."],["M05","Hotline is tap-to-call with a real number. *(placeholder numbers/email — bug #9)*"],["M06","Support hours are shown."],["M07","Contact page has phone, WhatsApp, email and address. *(placeholder numbers/email — bug #9)*"],["M08","Facebook Messenger link (if offered) works."]]}]},{"n":13,"name":"Performance","subs":[{"name":"","items":[["PF01","First screen shows in < 2.5 s on a mid phone on 4G. *(needs real hosting / photos / network)*"],["PF02","Page HTML + JS + CSS is small (< 500 KB compressed for the first page). *(bug #21)*"],["PF03","Images are WebP/AVIF, sized per screen (srcset), and lazy below the fold. *(needs real hosting / photos / network)*"],["PF04","Fonts use font-display: swap and are preloaded or self-hosted."],["PF05","No console errors on any page."],["PF06","Navigating between pages draws in < 200 ms."],["PF07","Scrolling stays smooth (no heavy work on every scroll event)."],["PF08","No timers running forever that wake the phone (setInterval). *(bug #20)*"],["PF09","Infinite CSS animations are few and stop when off screen / reduced motion."],["PF10","The page works on a 4× slower CPU without double navigations. *(bug #4)*"],["PF11","Caching: repeat visit loads from cache. *(needs real hosting / photos / network)*"],["PF12","No layout thrash (forced reflow) loops."]]}]},{"n":14,"name":"Accessibility","subs":[{"name":"","items":[["AX01","Every tap target is at least 44×44 px (32 px minimum for inline text links). *(bug #17)*"],["AX02","Text contrast ≥ 4.5:1 (body) and ≥ 3:1 (large text, icons)."],["AX03","Every icon-only button has a screen-reader name (aria-label). *(bug #18)*"],["AX04","Every image has alt text (empty alt for decoration). *(no real photos yet)*"],["AX05","Every form field has a visible label tied to it."],["AX06","Keyboard Tab reaches every control in order, with a visible focus ring."],["AX07","Popups trap focus, close with Esc, and return focus to the opener. *(bug #16)*"],["AX08","Popups have role=dialog and a name."],["AX09","Each page has one h1 and a sensible heading order. *(bug #19)*"],["AX10","The page language is set (lang=\"en\" / \"bn\")."],["AX11","Reduced motion: shimmering/sweeping/bouncing animations stop."],["AX12","Toasts are announced (role=status)."],["AX13","Errors are announced and tied to the field (aria-invalid / aria-describedby)."],["AX14","Selected size/colour state is exposed (aria-pressed / aria-checked)."],["AX15","Text can be enlarged to 200 % without loss."],["AX16","Colour is never the only signal (stock, errors)."],["AX17","Skip-to-content link exists. *(bug #19)*"],["AX18","Page title changes on every navigation (announced by screen readers)."]]}]},{"n":15,"name":"Forms & keyboards","subs":[{"name":"","items":[["F01","Every phone field opens the number pad."],["F02","Email fields open the email keyboard. *(no email fields)*"],["F03","Search field shows a \"Search\" key."],["F04","Bengali digits (০১৭…) in a phone field are accepted and converted. *(bug #8)*"],["F05","Pasting a number with spaces/dashes/+880 is cleaned."],["F06","Inputs are at least 16 px font (no iPhone auto-zoom on focus)."],["F07","Errors appear next to the field, in plain words."],["F08","Typed text is never lost on re-render."],["F09","The keyboard \"Next\" moves to the next field."],["F10","Autocomplete attributes are set (name, tel, street-address, current-password)."]]}]},{"n":16,"name":"Language (English / Bengali)","subs":[{"name":"","items":[["LG01","The language switch shows its current state."],["LG02","Switching to Bengali changes menus, buttons and headings. *(bug #8)*"],["LG03","The choice is remembered after reload."],["LG04","Prices and numbers stay correct in Bengali (৳ and digits)."],["LG05","Bengali text uses a Bengali font and never shows boxes (tofu)."],["LG06","Bengali never overflows buttons at 320 px."],["LG07","html lang changes to \"bn\"."],["LG08","Product names/descriptions have Bengali versions (or a clear plan)."]]}]},{"n":17,"name":"Trust & legal","subs":[{"name":"","items":[["TR01","Privacy policy page exists and is real text."],["TR02","Terms page exists and is real text."],["TR03","Delivery policy states charges and days for Dhaka and outside."],["TR04","Exchange/return policy states the window and conditions."],["TR05","Contact page with phone, WhatsApp, email, physical address. *(bug #9)*"],["TR06","DBID (Digital Business ID) number shown. *(bug #9)*"],["TR07","Trade licence number shown. *(bug #9)*"],["TR08","No placeholder text left ([your DBID], 01XXXX, [support email]). *(bug #9)*"],["TR09","Real reviews only; review photos credited."],["TR10","Payment security marks are honest (only methods actually accepted)."],["TR11","\"About / Our story\" page exists."],["TR12","Social links go to real, active pages. *(bug #6)*"]]}]},{"n":18,"name":"Analytics & tracking","subs":[{"name":"","items":[["AN01","Page view fires on every route change (SPA). *(needs real Pixel/GA/CAPI)*"],["AN02","view_item fires on product pages. *(needs real Pixel/GA/CAPI)*"],["AN03","add_to_cart fires with product, size, price. *(needs real Pixel/GA/CAPI)*"],["AN04","begin_checkout fires. *(needs real Pixel/GA/CAPI)*"],["AN05","purchase fires once (not again on refresh/back). *(needs real Pixel/GA/CAPI)*"],["AN06","Meta Pixel + Conversions API dedup with event_id. *(needs real Pixel/GA/CAPI)*"],["AN07","UTM / fbclid kept through to the order source. *(needs real Pixel/GA/CAPI)*"],["AN08","Search terms are logged. *(needs real Pixel/GA/CAPI)*"],["AN09","Errors are logged (client error reporting). *(needs real Pixel/GA/CAPI)*"],["AN10","Consent for tracking is respected. *(needs real Pixel/GA/CAPI)*"]]}]},{"n":19,"name":"SEO basics","subs":[{"name":"","items":[["SE01","Every page has a unique, descriptive <title>. *(bug #9b titles)*"],["SE02","Every page has a meta description. *(bug #21b)*"],["SE03","Canonical URLs are set. *(bug #21b)*"],["SE04","Open Graph / WhatsApp preview tags (og:title, og:image) are set. *(bug #21b)*"],["SE05","Product structured data (JSON-LD Product with price in BDT, availability). *(bug #21b)*"],["SE06","Breadcrumb structured data. *(bug #21b)*"],["SE07","Organization / LocalBusiness structured data. *(bug #21b)*"],["SE08","Real URLs (/p/slug) instead of #hash routes, so pages can be indexed. *(bug #21b)*"],["SE09","sitemap.xml and robots.txt. *(needs real hosting)*"],["SE10","One h1 per page containing the main keyword. *(bug #21b)*"],["SE11","Image alt text is descriptive. *(needs real hosting)*"],["SE12","404 pages return a real 404 status. *(needs real hosting)*"]]}]},{"n":20,"name":"Security & privacy","subs":[{"name":"","items":[["SC01","The site is HTTPS only. *(needs the real backend)*"],["SC02","Passwords are never stored in plain text or in the browser. *(needs the real backend)*"],["SC03","The customer's data is not readable by other customers (order ids not guessable). *(needs the real backend)*"],["SC04","Text typed by users (search, names, reviews) is escaped (no script injection)."],["SC05","Admin is behind a login. *(needs the real backend)*"],["SC06","OTP / login attempts are rate-limited. *(needs the real backend)*"],["SC07","COD fraud checks (phone verified, repeat no-shows flagged)."],["SC08","External links use rel=\"noopener\"."],["SC09","No secrets/API keys in the page source."],["SC10","Cookie / storage use is explained in the privacy policy."]]}]},{"n":21,"name":"Offline & slow network","subs":[{"name":"","items":[["OF01","On a slow network the page shows content progressively (no long white screen). *(needs real network / server)*"],["OF02","Offline: a clear message instead of a browser error. *(needs real network / server)*"],["OF03","Placing an order with a dropped connection does not double-order and tells the customer. *(needs real network / server)*"],["OF04","Images show a placeholder until loaded. *(needs real network / server)*"],["OF05","Failed image loads show a fallback, not a broken icon. *(needs real network / server)*"],["OF06","Fonts failing to load leave readable text."],["OF07","The bag is not lost if the network drops. *(needs real network / server)*"],["OF08","Retry is offered after a failed request. *(needs real network / server)*"]]}]},{"n":22,"name":"Error handling","subs":[{"name":"","items":[["E01","A page that throws shows a friendly message with a way home (never blank)."],["E02","No JavaScript errors in the console on any route."],["E03","Stock changed while in the bag is explained at checkout."],["E04","Price changed while in the bag is explained at checkout."],["E05","An expired offer code is explained."],["E06","Server errors (500) show a friendly page. *(needs server)*"],["E07","Storage blocked / private mode still lets you shop."],["E08","Malformed addresses (#/p/, #/c/%%%) do not crash."]]}]},{"n":23,"name":"Admin basics","subs":[{"name":"","items":[["AD01","Admin orders list opens and shows orders with status."],["AD02","Order status can be advanced."],["AD03","Flags (address check, phone check, two sizes) show on orders."],["AD04","Rules / offers page opens and saves."],["AD05","Size charts page opens and edits."],["AD06","Combos page opens."],["AD07","Reviews moderation page opens."],["AD08","Landing page builder opens."],["AD09","Analytics page opens."],["AD10","Admin is usable on a phone (no horizontal scroll at 393)."],["AD11","Admin needs a login (not public). *(needs the real backend)*"]]}]}];
