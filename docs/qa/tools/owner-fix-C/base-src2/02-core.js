/* ================= EXTAS demo — core engine ================= */
var PAGES = {}, ACT = {}, INPUT = {}, CHANGE = {}, SUBMIT = {};
var UI = {};               // per-page temporary UI state (not saved)
var STORE_KEY = 'extas-demo-v4';

/* ---------- state ---------- */
function seedState(){
  var now = Date.now(), H = 3600000, D = 24*H;
  var st = {
    v:4, seq:1043, theme:'classic', lang:'en', pdpTemplate:'auto', comboTemplate:'auto', festive:false,
    bag:[], bracketAck:{}, user:null, guestSize:null, wishlist:[], recent:[],
    rulesOverride:{}, chartsOverride:{}, setRulesOverride:{}, combosOverride:{},
    ai:JSON.parse(JSON.stringify(DB.ai)), landingPages:[
      {id:'lp-1', slug:'polo-duo', product:'essential-pique-polo', template:'combo-push', cat:'polos', title:'Polo Duo — any 2 colours for ৳1,500', visits:2140, orders:96, campaign:'Meta · Polo Duo · Oct', status:'Live', ai:true, created:'12 Oct'},
      {id:'lp-2', slug:'winter-hoodie', product:'heavyweight-hoodie', template:'offer-first', cat:'hoodies', title:'Heavyweight Hoodie — 320 GSM, ৳1,650', visits:860, orders:31, campaign:'Meta · Winter hoodies', status:'Live', ai:true, created:'14 Oct'}
    ],
    accounts:{}, orders:{}
  };
  st.accounts['01712345678'] = {
    name:'Rakib Hasan', phone:'01712345678', password:'01712345678', tier:'VIP',
    address:'House 12, Road 5, Mirpur 10, Dhaka', zone:'in',
    wallet:350, walletTx:[{label:'Exchange credit · #EX-1021', amount:350, at:now-20*D}],
    mySize:{top:'L', bottom:'32', heightIn:69, weightKg:70},
    offers:[
      {id:'vip15', title:'VIP · Flat 15% off everything', note:'Ends 31 Oct · applied automatically at checkout', code:'VIP15', pct:15},
      {id:'bday', title:'Birthday gift · ৳200 off over ৳1,500', note:'This month only', code:'BDAY200', amount:200}
    ],
    orders:['EX-1038','EX-1021'], reviews:[], referralCode:'RAKIB100', fbShares:[]
  };
  st.orders['EX-1038'] = {
    id:'EX-1038', phone:'01712345678', name:'Rakib Hasan', address:'House 12, Road 5, Mirpur 10, Dhaka', zone:'in', flags:[],
    lines:[
      {product:'essential-pique-polo', color:'red', size:'XL', qty:1, unitPrice:850},
      {product:'striped-rib-polo', color:'navy', size:'M', qty:1, unitPrice:990},
      {product:'heavyweight-hoodie', color:'black', size:'XL', qty:1, unitPrice:1650},
      {product:'slim-chino-trousers', color:'khaki', size:'32', qty:1, unitPrice:1450}
    ],
    setDiscounts:[], subtotal:4940, discount:0, delivery:0, total:4940, payment:'cod', status:'delivered',
    createdAt:now-3*D, deliveredAt:now-20*H, edits:0, courier:'Steadfast', tracking:'SF-2210-8841',
    timeline:[{s:'confirmed',at:now-3*D},{s:'packed',at:now-3*D+5*H},{s:'shipped',at:now-2*D},{s:'delivered',at:now-20*H}],
    reviewed:{}, exchanges:[]
  };
  st.orders['EX-1021'] = {
    id:'EX-1021', phone:'01712345678', name:'Rakib Hasan', address:'House 12, Road 5, Mirpur 10, Dhaka', zone:'in', flags:[],
    lines:[
      {product:'essential-pique-polo', color:'navy', size:'M', qty:1, unitPrice:850, setLabel:'Polo Duo'},
      {product:'essential-pique-polo', color:'white', size:'M', qty:1, unitPrice:850, setLabel:'Polo Duo'}
    ],
    setDiscounts:[{label:'Polo Duo set price', amount:200}], subtotal:1700, discount:200, delivery:0, total:1500, payment:'bkash', status:'delivered',
    createdAt:now-32*D, deliveredAt:now-30*D, edits:0, courier:'Pathao', tracking:'PT-77812',
    timeline:[{s:'confirmed',at:now-32*D},{s:'packed',at:now-32*D+4*H},{s:'shipped',at:now-31*D},{s:'delivered',at:now-30*D}],
    reviewed:{0:'approved'}, exchanges:[]
  };
  return st;
}
var ST;
function loadState(){
  try{ var raw = localStorage.getItem(STORE_KEY); if(raw){ var s = JSON.parse(raw); if(s && s.v===4){ ST = s; return; } } }catch(e){}
  ST = seedState();
}
function saveState(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(ST)); }catch(e){} }
function resetState(){ ST = seedState(); saveState(); UI = {}; applyTheme(); go('#/'); toast('Demo data reset'); }

/* ---------- small helpers ---------- */
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function fmt(n){ n = Math.round(Number(n)||0); var neg = n<0; n = Math.abs(n); return (neg?'−':'')+'৳\u2009'+n.toLocaleString('en-US'); }
function P(id){ for(var i=0;i<DB.products.length;i++) if(DB.products[i].id===id) return DB.products[i]; return null; }
function CAT(id){ for(var i=0;i<DB.categories.length;i++) if(DB.categories[i].id===id) return DB.categories[i]; return null; }
function COL(id){ return DB.colors[id] || {name:id, hex:'#999'}; }
function productsIn(cat){ return DB.products.filter(function(p){ return p.cat===cat; }); }
function stockOf(pid, color, size){ var p = P(pid); if(!p) return 0; var c = p.stock[color]; return c ? (c[size]||0) : 0; }
function totalStock(pid, color){ var p = P(pid), c = p && p.stock[color], t=0; if(c) for(var k in c) t+=c[k]; return t; }
function uid(){ return Math.random().toString(36).slice(2,9); }
function ui(key, defaults){ if(!UI[key]) UI[key] = JSON.parse(JSON.stringify(defaults||{})); return UI[key]; }
function plural(n, w){ return n+' '+w+(n===1?'':'s'); }
function timeAgo(ts){ var d = Date.now()-ts, h = Math.floor(d/3600000); if(h<1) return 'just now'; if(h<24) return h+' hours ago'; var days=Math.floor(h/24); return days+(days===1?' day ago':' days ago'); }
function dateStr(ts){ var d = new Date(ts); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}); }
function dateTimeStr(ts){ var d = new Date(ts); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+', '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); }
function mixHex(a, b, t){ function p(h){h=h.replace('#','');return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];} var x=p(a), y=p(b); var r=x.map(function(v,i){return Math.round(v*(1-t)+y[i]*t);}); return '#'+r.map(function(v){return ('0'+v.toString(16)).slice(-2);}).join(''); }
function isLight(hex){ var h=hex.replace('#',''); var r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16); return (r*299+g*587+b*114)/1000 > 170; }

/* ---------- rules, charts, settings (owner-editable) ---------- */
function RULE(id){
  var base = null; for(var i=0;i<DB.rules.length;i++) if(DB.rules[i].id===id) base = DB.rules[i];
  if(!base) return null;
  var ov = ST.rulesOverride[id] || {};
  var r = JSON.parse(JSON.stringify(base));
  for(var k in ov){ if(k==='settings'){ for(var s in ov.settings) r.settings[s] = ov.settings[s]; } else r[k] = ov[k]; }
  return r;
}
function allRules(){ return DB.rules.map(function(r){ return RULE(r.id); }); }
function SET(ruleId, key){ var r = RULE(ruleId); return r ? r.settings[key] : undefined; }
/* R15: money in rule text gets its comma (৳1,500, not ৳1500) — any whole number of 1,000 or more */
function fillRule(text, r){ return String(text||'').replace(/\{(\w+)\}/g, function(m,k){ var v = r.settings[k]; if(v===undefined) return m; return (typeof v==='number' && v>=1000 && v%1===0) ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : v; }); }
function ruleText(id, which){ var r = RULE(id); if(!r) return ''; return fillRule(which==='full'?r.full:r.short, r); }
function CHART(id){ if(!id) return null; var c = ST.chartsOverride[id] || DB.sizeCharts[id]; return c ? c : null; }
function chartFor(p){ return p && p.chart ? CHART(p.chart) : null; }
function setRules(){ return DB.customSetRules.map(function(r){ var o = ST.setRulesOverride[r.id]; return o ? Object.assign({}, r, o) : r; }); }
function COMBO(id){ for(var i=0;i<DB.combos.length;i++) if(DB.combos[i].id===id){ var o = ST.combosOverride[id]; return o ? Object.assign({}, DB.combos[i], o) : DB.combos[i]; } return null; }
function combos(){ return DB.combos.map(function(c){ return COMBO(c.id); }); }
function pdpTemplateFor(p){ return ST.pdpTemplate!=='auto' ? ST.pdpTemplate : (p.template || 'T1'); }
function comboTemplateFor(c){ return ST.comboTemplate!=='auto' ? ST.comboTemplate : (c.template || 'C1'); }

/* ---------- i18n (key UI strings only) ---------- */
var T = {
  bn:{ 'Home':'হোম','Shop':'শপ','Sets':'সেট','Bag':'ব্যাগ','Account':'অ্যাকাউন্ট','Add to Bag':'ব্যাগে রাখুন','Order Now':'এখনই অর্ডার','Checkout':'চেকআউট',
       'New in':'নতুন এসেছে','Shop by category':'ক্যাটাগরি','Flash sale':'ফ্ল্যাশ সেল','What customers say':'কাস্টমাররা যা বলছেন','Shop now':'এখনই দেখুন','Shop sets':'সেট দেখুন',
       'New collection':'নতুন কালেকশন','Winter 2026':'শীত ২০২৬','heroSub':'হুডি, সোয়েটশার্ট আর জ্যাকেট। ৩৯টি নতুন ডিজাইন, বাংলাদেশের শীতের জন্য।',
       'announce':'৳{freeOverBn}-এর উপরে ফ্রি ডেলিভারি · সারা দেশে ক্যাশ অন ডেলিভারি','Search':'সার্চ','My account':'আমার অ্যাকাউন্ট','Polos':'পোলো','T-Shirts':'টি-শার্ট','Shirts':'শার্ট','Panjabi':'পাঞ্জাবি','Trousers':'ট্রাউজার','Hoodies':'হুডি',
       /* R15 wave 1 (bug 8): product page labels, help pages and footer */
       'Colour':'রং','Size':'সাইজ','Choose your size':'সাইজ বাছুন','Choose size':'সাইজ','Size chart':'সাইজ চার্ট','Find my size':'আমার সাইজ',
       'Free home delivery':'ফ্রি হোম ডেলিভারি','Free delivery':'ফ্রি ডেলিভারি','Checkout':'চেকআউট','Menu':'মেনু','Wishlist':'উইশলিস্ট',
       'Help':'সাহায্য','Track my order':'অর্ডার ট্র্যাক','Size guide':'সাইজ গাইড','Delivery':'ডেলিভারি','Exchange & returns':'এক্সচেঞ্জ ও রিটার্ন',
       'Ways to pay':'পেমেন্টের উপায়','FAQ':'প্রশ্ন-উত্তর','Our story':'আমাদের গল্প','Contact':'যোগাযোগ','Careers':'চাকরি','Journal':'জার্নাল',
       'Privacy':'প্রাইভেসি','Terms':'শর্তাবলি','Text us on WhatsApp':'WhatsApp-এ মেসেজ দিন','Hotline':'হটলাইন','Get new drops first':'নতুন কালেকশন সবার আগে',
       'Join':'যোগ দিন','Secure':'নিরাপদ','Your phone number':'আপনার মোবাইল নম্বর','Skip to content':'মূল অংশে যান','Page not found':'পেজ পাওয়া যায়নি','Go to home':'হোমে যান' },
  en:{ 'heroSub':'Hoodies, sweatshirts and jackets. 39 new styles, built for Bangladeshi winters.', 'announce':'Free delivery over ৳{freeOver} · Cash on Delivery all over Bangladesh' }
};
function t(k){ var d = T[ST.lang] || {}; if(d[k]) return d[k]; if(T.en[k]) return T.en[k]; return k; }
/* R15 wave 1 (nothing hardcoded): the announcement bar's free-delivery amount
   is the owner's setting, with the same comma fillRule() gives (৳1,500), and
   in Bengali digits on the Bengali bar */
function announceFill(str){
  var v = SET('delivery','freeOver'), n = (typeof v==='number' && v>=1000 && v%1===0) ? String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : String(v==null?'':v);
  var bn = n.replace(/[0-9]/g, function(c){ return String.fromCharCode(0x09E6 + Number(c)); });
  return String(str).replace('{freeOver}', n).replace('{freeOverBn}', bn);
}

/* ---------- icons ---------- */
function ico(name, size, extra){
  size = size||20; var s = 'width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'+(extra?' '+extra:'');
  var p = {
    menu:'<path d="M3 7h18M3 12h18M3 17h12"/>', search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    bag:'<path d="M5.6 8.2h12.8l-.9 10.4a2 2 0 01-2 1.8H8.5a2 2 0 01-2-1.8L5.6 8.2z"/><path d="M9.2 10.4V6.9a2.8 2.8 0 015.6 0v3.5"/>', user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    heart:'<path d="M12 19.6c-.3 0-.6-.1-.8-.3C7.4 16.2 4.4 13.4 4.4 10a4.1 4.1 0 017.6-2.2A4.1 4.1 0 0119.6 10c0 3.4-3 6.2-6.8 9.3-.2.2-.5.3-.8.3z"/>', back:'<path d="M15 19l-7-7 7-7"/>',
    share:'<path d="M12 15V4m0 0L8.2 7.8M12 4l3.8 3.8"/><path d="M5 13.5V18a2 2 0 002 2h10a2 2 0 002-2v-4.5"/>',
    facebook:'<path d="M14.2 8.5h2.1V5.8h-2.1c-1.9 0-3.4 1.5-3.4 3.4v1.5H8.6v2.7h2.2V20h2.8v-6.6h2.2l.4-2.7h-2.6V9.2c0-.4.3-.7.6-.7z"/>',
    whatsapp:'<path d="M4.5 19.5l1.1-3.8A7.4 7.4 0 1112 19.4a7.4 7.4 0 01-3.6-.9l-3.9 1z"/><path d="M9.3 8.4c.3 0 .5.5.7 1s.4.8.1 1.1c-.3.3-.5.4-.3.8a5 5 0 002.6 2.3c.4.1.6 0 .8-.3.2-.3.5-.6.9-.4l1.4.7c.3.2.2.8-.2 1.2-.5.5-1.4.8-2.4.5a7.3 7.3 0 01-4.6-4.6c-.3-1 0-1.9.5-2.3z"/>',
    instagram:'<rect x="4.3" y="4.3" width="15.4" height="15.4" rx="4.4"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.6" cy="7.4" r=".9"/>',
    mail:'<rect x="3.6" y="5.6" width="16.8" height="12.8" rx="2.2"/><path d="M4.4 7.2L12 12.6l7.6-5.4"/>', phone:'<path d="M6.2 3.8h3.1l1.6 3.9-2 1.3a11.4 11.4 0 005.1 5.1l1.3-2 3.9 1.6v3.1a1.6 1.6 0 01-1.7 1.6A14.9 14.9 0 014.6 5.5a1.6 1.6 0 011.6-1.7z"/>',
    close:'<path d="M6 6l12 12M18 6L6 18"/>', right:'<path d="M9 6l6 6-6 6"/>', down:'<path d="M6 9l6 6 6-6"/>', up:'<path d="M18 15l-6-6-6 6"/>',
    check:'<path d="M5 12l5 5 9-10"/>', truck:'<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    swap:'<path d="M4 9h13l-3-3M20 15H7l3 3"/>', lock:'<rect x="5" y="10" width="14" height="10" rx="1"/><path d="M8 10V7a4 4 0 018 0v3"/>',
    shield:'<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>', cash:'<rect x="3" y="6" width="18" height="12" rx="1"/><circle cx="12" cy="12" r="2.5"/>',
    chat:'<path d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-3.9-1z"/>', ruler:'<path d="M3 17l14-14 4 4L7 21H3z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>', camera:'<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>', plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
    gift:'<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S10 8 12 8zm0 0c2-4 6-4 6-1.5S14 8 12 8z"/>',
    spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>',
    grid:'<path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z"/>', home:'<path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z"/>',
    layers:'<rect x="3" y="7" width="10" height="13" rx="1"/><path d="M8 7V4h12v13h-7"/>', tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', link:'<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', play:'<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
    'star-o':'<path d="M12 3.4l2.6 5.6 6 .8-4.3 4.1 1 6-5.3-2.9-5.3 2.9 1-6L3.4 9.8l6-.8z" fill="none"/>',    star:'<path d="M12 2l3 6.5 7 .9-5 4.8 1.2 7L12 17.8 5.8 21.2 7 14.2 2 9.4l7-.9z"/>', box:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    doc:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>', bolt:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    wallet:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h2M3 10h18"/>', globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'
  }[name] || '';
  return '<svg '+s+'>'+p+'</svg>';
}
function starsHTML(r, size){ size=size||14; var h=''; for(var i=1;i<=5;i++){ h+='<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" aria-hidden="true" fill="'+(i<=Math.round(r)?'var(--brand)':'var(--line)')+'"><path d="M12 2l3 6.5 7 .9-5 4.8 1.2 7L12 17.8 5.8 21.2 7 14.2 2 9.4l7-.9z"/></svg>'; } return '<span class="row" style="gap:1px" aria-label="'+r+' out of 5">'+h+'</span>'; }

/* ---------- garment drawings (generic shapes) ---------- */
function garmentSVG(type, hex, view){
  var dark = mixHex(hex,'#000000',.28), light = isLight(hex), line = light ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.22)', det = light ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.30)';
  var back = view==='back', g = '';
  if(type==='polo' || type==='tee'){
    g += '<path d="M62 22 L82 12 Q100 28 118 12 L138 22 L178 46 L162 82 L146 74 L146 208 L54 208 L54 74 L38 82 L22 46 Z" fill="'+hex+'" stroke="'+line+'" stroke-width="1.5"/>';
    g += '<path d="M54 196 L146 196" stroke="'+det+'" stroke-width="1.2"/><path d="M38 82 L54 74 M162 82 L146 74" stroke="'+det+'" stroke-width="1.2"/>';
    if(type==='polo' && !back){
      g += '<path d="M82 12 L100 38 L118 12 L111 9 Q100 20 89 9 Z" fill="'+dark+'" opacity=".55"/>';
      g += '<path d="M82 12 L70 30 L94 30 Z M118 12 L130 30 L106 30 Z" fill="'+hex+'" stroke="'+line+'" stroke-width="1.2"/>';
      g += '<path d="M100 38 L100 72" stroke="'+det+'" stroke-width="1.4"/><circle cx="100" cy="50" r="2.2" fill="'+det+'"/><circle cx="100" cy="63" r="2.2" fill="'+det+'"/>';
    } else if(type==='tee'){ g += '<path d="M82 12 Q100 30 118 12" fill="none" stroke="'+det+'" stroke-width="3"/>'; }
    else { g += '<path d="M82 12 Q100 18 118 12" fill="none" stroke="'+det+'" stroke-width="5"/>'; }
  } else if(type==='shirt'){
    g += '<path d="M64 22 L84 12 L100 30 L116 12 L136 22 L174 50 L186 156 L168 160 L154 86 L150 210 L50 210 L46 86 L32 160 L14 156 L26 50 Z" fill="'+hex+'" stroke="'+line+'" stroke-width="1.5"/>';
    if(!back){ g += '<path d="M84 12 L100 30 L116 12 L108 8 L100 18 L92 8 Z" fill="'+mixHex(hex,'#ffffff',.25)+'" stroke="'+line+'" stroke-width="1"/><path d="M100 30 L100 206" stroke="'+det+'" stroke-width="1.4"/>';
      for(var i=0;i<6;i++) g += '<circle cx="103.5" cy="'+(48+i*26)+'" r="2" fill="'+det+'"/>';
      g += '<rect x="62" y="64" width="22" height="18" fill="none" stroke="'+det+'" stroke-width="1.1"/>'; }
    g += '<path d="M168 160 L186 156 M14 156 L32 160" stroke="'+det+'" stroke-width="2"/>';
  } else if(type==='panjabi'){
    g += '<path d="M68 20 L86 12 Q100 18 114 12 L132 20 L168 46 L180 156 L164 158 L152 80 L152 216 L48 216 L48 80 L36 158 L20 156 L32 46 Z" fill="'+hex+'" stroke="'+line+'" stroke-width="1.5"/>';
    if(!back){ g += '<path d="M88 11 Q100 17 112 11 L112 16 Q100 22 88 16 Z" fill="'+dark+'" opacity=".5"/><path d="M100 18 L100 86" stroke="'+det+'" stroke-width="1.4"/>';
      for(var j=0;j<4;j++) g += '<circle cx="100" cy="'+(30+j*15)+'" r="2" fill="'+det+'"/>'; }
    g += '<path d="M48 200 L60 216 M152 200 L140 216" stroke="'+det+'" stroke-width="1.2"/>';
  } else if(type==='hoodie'){
    g += '<path d="M62 30 L80 20 L120 20 L138 30 L174 54 L186 160 L168 164 L154 90 L152 206 L48 206 L46 90 L32 164 L14 160 L26 54 Z" fill="'+hex+'" stroke="'+line+'" stroke-width="1.5"/>';
    g += '<path d="M74 28 Q100 -8 126 28 L120 46 Q100 58 80 46 Z" fill="'+mixHex(hex,'#000000',.12)+'" stroke="'+line+'" stroke-width="1.2"/>';
    if(!back){ g += '<path d="M92 52 L90 84 M108 52 L110 84" stroke="'+det+'" stroke-width="1.6"/><path d="M68 140 L132 140 L142 186 L58 186 Z" fill="none" stroke="'+det+'" stroke-width="1.4"/>'; }
    g += '<path d="M48 194 L152 194 M168 164 L186 160 M14 160 L32 164" stroke="'+det+'" stroke-width="2"/>';
  } else if(type==='trouser'){
    g += '<path d="M58 10 L142 10 L152 212 L112 212 L100 74 L88 212 L48 212 Z" fill="'+hex+'" stroke="'+line+'" stroke-width="1.5"/>';
    g += '<path d="M58 24 L142 24" stroke="'+det+'" stroke-width="1.6"/><path d="M100 24 L100 74" stroke="'+det+'" stroke-width="1.2"/>';
    if(!back) g += '<path d="M62 26 Q72 50 86 30 M138 26 Q128 50 114 30" fill="none" stroke="'+det+'" stroke-width="1.2"/>';
    else g += '<rect x="66" y="40" width="22" height="22" fill="none" stroke="'+det+'" stroke-width="1.1"/><rect x="112" y="40" width="22" height="22" fill="none" stroke="'+det+'" stroke-width="1.1"/>';
  } else if(type==='socks'){
    var cs = ['#2C3E50','#8E8E8E','#C3A97E'];
    for(var k=0;k<3;k++){ var x = 40+k*44; g += '<path d="M'+x+' 30 L'+(x+30)+' 30 L'+(x+30)+' 150 Q'+(x+30)+' 190 '+(x-10)+' 190 Q'+(x-30)+' 190 '+(x-24)+' 172 Q'+(x-18)+' 158 '+x+' 150 Z" fill="'+cs[k]+'" stroke="rgba(0,0,0,.2)" stroke-width="1.2"/><path d="M'+x+' 44 L'+(x+30)+' 44" stroke="rgba(255,255,255,.4)" stroke-width="3"/>'; }
  } else if(type==='belt'){
    g += '<rect x="20" y="96" width="170" height="28" rx="4" fill="'+hex+'" stroke="rgba(0,0,0,.25)"/><rect x="24" y="90" width="38" height="40" rx="5" fill="none" stroke="#B8A27A" stroke-width="5"/><path d="M43 110 L66 110" stroke="#B8A27A" stroke-width="4"/>';
    for(var m=0;m<4;m++) g += '<circle cx="'+(110+m*18)+'" cy="110" r="2.5" fill="rgba(0,0,0,.35)"/>';
  }
  var tr = view==='detail' ? ' transform="translate(-100 -10) scale(2)"' : (view==='flat' ? ' transform="rotate(-4 100 110)"' : '');
  return '<svg class="garment" viewBox="0 0 200 222" aria-hidden="true"><g'+tr+'>'+g+'</g></svg>';
}
var VIEW_LABEL = {front:'front', back:'back', detail:'detail', model:'on model', flat:'true colour · daylight, no filter'};
function productImg(p, color, opts){
  opts = opts||{}; var c = COL(color || p.colors[0]); var cat = CAT(p.cat) || {garment:'tee'};
  var view = opts.view || 'front';
  var bg = view==='flat' ? '#ECEAE5' : mixHex(c.hex, '#EFEDE8', isLight(c.hex) ? .55 : .80);
  if(view==='model') bg = mixHex(c.hex,'#D9D5CE',.86);
  var cls = 'pimg '+(opts.ratio||'ratio-45')+(opts.cls?' '+opts.cls:'');
  /* backend wave 2: a real photo uploaded in the admin (p.photos[colour][view].src)
     shows instead of the drawing — on cards and product pages alike */
  var cid = color || p.colors[0], ph = p.photos && p.photos[cid] && p.photos[cid][view];
  if(ph && ph.src) return '<div class="'+cls+' has-photo" style="background:'+bg+(opts.style?';'+opts.style:'')+'"><img src="'+esc(ph.src)+'" alt="'+esc(p.name+(VIEW_LABEL[view] ? ' — '+VIEW_LABEL[view] : ''))+'" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">'+(opts.inner||'')+'</div>';
  return '<div class="'+cls+'" style="background:'+bg+(opts.style?';'+opts.style:'')+'">'+garmentSVG(p.garment||cat.garment, c.hex, view)+(opts.label===false?'':'<span class="pimg-label">'+esc(opts.labelText||('[ demo image · '+VIEW_LABEL[view]+' ]'))+'</span>')+(opts.inner||'')+'</div>';
}
function setImg(items, opts){
  opts = opts||{}; var parts = items.map(function(it){ var p = P(it.product||it), cat = CAT(p.cat); var hex = COL(it.color||p.colors[0]).hex; return '<div style="flex:1;align-self:stretch;display:flex;align-items:center;justify-content:center;background:'+mixHex(hex,'#EFEDE8',isLight(hex)?.55:.8)+'">'+garmentSVG(p.garment||cat.garment, hex, 'front')+'</div>'; });
  return '<div class="pimg '+(opts.ratio||'ratio-45')+'" style="display:flex;gap:2px;background:var(--surface)">'+parts.join('')+'<span class="pimg-label">[ demo set image · updates with your colours ]</span>'+(opts.inner||'')+'</div>';
}

/* ---------- shared UI bits ---------- */
function priceHTML(price, compareAt, big){
  var cls = big ? 'price" style="font-size:'+big+'px' : 'price';
  return '<span class="'+cls+'">'+fmt(price)+'</span>'+(compareAt?' <span class="strike small">'+fmt(compareAt)+'</span>':'');
}
function swatchRow(p, max){ max = max||4; var h = p.colors.slice(0,max).map(function(c){ return '<span class="swatch sm" style="background:'+COL(c).hex+'" title="'+esc(COL(c).name)+'"></span>'; }).join(''); if(p.colors.length>max) h += '<span class="xs muted">+'+(p.colors.length-max)+'</span>'; return '<span class="row" style="gap:4px">'+h+'</span>'; }
function mySize(){ var u = currentAccount(); return u ? u.mySize : ST.guestSize; }
function mySizeFor(p){ var ms = mySize(); var cat = CAT(p.cat); if(!ms || !cat) return null; return cat.group==='bottom' ? ms.bottom : (cat.group==='top' ? ms.top : null); }
function productCard(p, opts){
  opts = opts||{}; var color = opts.color || p.colors[0];
  var badge = p.compareAt ? '<span class="badge-img sale">−'+Math.round((1-p.price/p.compareAt)*100)+'%</span>' : (p.tag ? '<span class="badge-img">'+esc(p.tag)+'</span>' : '');
  var wished = ST.wishlist.indexOf(p.id)>=0;
  var ms = mySizeFor(p), hint = '';
  if(ms && p.sizes.indexOf(ms)>=0){ var any = p.colors.some(function(c){ return stockOf(p.id,c,ms)>0; }); hint = '<div class="xs brandc bold mt8">'+(any ? 'Your size '+ms+' in stock' : 'Your size '+ms+' sold out')+'</div>'; }
  /* Desktop A · D-024: the heart is no longer a button inside the card link
     (a link holding a button is read out wrongly and fires both). The card is
     now a plain box (.pcard, same styles) whose link is an empty full-card
     layer drawn FIRST (a.pcard-lnk, named for screen readers); the photo
     lets clicks fall through to it and the heart takes its own clicks.
     Nothing is drawn differently: the heart, badge, photo and text paint
     exactly as before (the phone gate checks it to the pixel). */
  var heart = '<button class="heart" data-act="wish" data-id="'+p.id+'" aria-label="'+(wished?'Remove from':'Save to')+' wishlist">'+(wished?'<svg width="18" height="18" viewBox="0 0 24 24" fill="var(--sale)" aria-hidden="true"><path d="M12 20s-7-4.6-7-9.5A3.8 3.8 0 0112 7a3.8 3.8 0 017 3.5c0 4.9-7 9.5-7 9.5z"/></svg>':ico('heart',18))+'</button>';
  var brand = typeof nm_brandLine==='function' ? nm_brandLine(p) : '';
  return '<div class="pcard-w" data-pid="'+p.id+'" data-c="'+esc(color)+'"><div class="pcard" data-testid="pcard-'+p.id+'"><a class="pcard-lnk" href="#/p/'+p.id+'" aria-label="'+esc((brand?brand+' ':'')+p.name+', '+fmt(p.price).replace(/\u2009/g,' '))+'"></a>'+productImg(p, color, {inner: badge+heart})+
    '<div class="pinfo">'+(brand?'<div class="pbrand">'+esc(brand)+'</div>':'')+'<div class="pname">'+esc(p.name)+'</div><div class="row" style="gap:7px;align-items:baseline">'+priceHTML(p.price, p.compareAt)+'</div>'+
    '<div class="row between mt8">'+swatchRow(p)+'<span class="tiny muted">'+esc(p.fit)+'</span></div>'+hint+'</div></div></div>';
}
/* rule line: short text + Details toggle; key must be unique on the page */
/* The short value the customer actually wants: "Free", "72 hours", "Size exchange only".
   It replaces the word "Details" on the compact row and stays clickable for the full rule. */
function ruleValue(ruleId, p){
  if(ruleId==='delivery'){
    if(p && p.freeDelivery) return {text:'Free', hot:true};
    var camp = SET('delivery','freeCampaign'); if(camp) return {text:'Free', hot:true};
    return {text:'৳\u2009'+SET('delivery','inside')+' / ৳\u2009'+SET('delivery','outside'), hot:false};
  }
  if(ruleId==='exchange') return {text:SET('exchange','windowHours')+' hours', hot:false};
  if(ruleId==='no-return') return {text:'Size swap only', hot:false};
  return {text:'Details', hot:false};
}
function ruleBlock(ruleId, opts){
  opts = opts||{}; var key = 'rule:'+ruleId+':'+(opts.key||''); var open = !!UI[key];
  var v = ruleValue(ruleId, opts.product);
  return '<div class="'+(opts.cls||'')+'">'+(opts.title?'<div class="h3" style="margin-bottom:3px">'+esc(opts.title)+'</div>':'')+
    '<div class="small text2">'+esc(ruleText(ruleId,'short'))+'</div>'+
    '<button class="link rule-v'+(v.hot?' hot':'')+'" data-act="rule-detail" data-key="'+esc(key)+'">'+(open?'Hide':esc(v.text))+'</button>'+
    (open?'<div class="soft p16 small mt8" style="white-space:pre-line;line-height:1.6">'+esc(ruleText(ruleId,'full'))+'</div>':'')+'</div>';
}
/* =====================================================================
   C3. THE ONE PLACE THE SHOP'S PHONE NUMBERS ARE SET.
   ---------------------------------------------------------------------
   Every WhatsApp link and every hotline link on the site goes through
   waNumber() / hotlineNumber() below. The two literals live in
   01-data.js (DB.whatsapp, DB.hotline) and are deliberately dummies
   in this demo — 8801XXXXXXXXX and 09XXX-XXXXXX.

   BACKEND HOOK: when the real numbers arrive, set them in ONE place —
   DB.whatsapp (digits only, country code first, no + and no spaces,
   e.g. '8801712345678') and DB.hotline (as printed, e.g. '09612-345678').
   Nothing else on the site has to change: no component holds a number
   of its own. Do NOT invent a number here.
   ===================================================================== */
/* The values are passed through untouched — the demo's placeholders
   (8801XXXXXXXXX, 09XXX-XXXXXX) have to stay readable as placeholders, so
   nothing here strips or reformats them. Only spaces are removed from the
   tel: href, which is all a dialler needs. */
/* R15 wave 2 (bug 1): touch gestures (edge swipe, pull-to-refresh) are decided
   by the INPUT, not the width — an iPad in landscape (1024–1366 px) is a
   touch screen. A primary coarse pointer, or touch with no hover. */
function isTouchUI(){
  try{ if(window.matchMedia){ if(matchMedia('(pointer:coarse)').matches) return true; if(matchMedia('(hover:none)').matches && (navigator.maxTouchPoints||0) > 0) return true; return false; } }catch(e){}
  return ('ontouchstart' in window) && (navigator.maxTouchPoints||0) > 0;
}
/* R15 wave 1: shop details (DB.site, owner edits in ST.siteOverride) */
function SITE(k){ var o = (ST && ST.siteOverride) || {}; if(o[k] !== undefined) return o[k]; return (DB.site || {})[k]; }
function SITE_SOCIAL(){
  var s = SITE('social') || {}, L = [['facebook','Facebook','facebook'],['instagram','Instagram','instagram'],['youtube','YouTube','play'],['tiktok','TikTok','spark']];
  return L.filter(function(x){ return /^https?:\/\//.test(String(s[x[0]]||'')); }).map(function(x){ return {id:x[0], label:x[1], icon:x[2], url:String(s[x[0]])}; });
}
function waNumber(){ return String(DB.whatsapp || ''); }
function hotlineNumber(){ return String(DB.hotline || ''); }
function waLink(text){ return 'https://wa.me/'+waNumber()+'?text='+encodeURIComponent(text||'Hi EXTAS'); }
function telLink(){ return 'tel:'+hotlineNumber().replace(/\s+/g, ''); }
function waButton(label, text, cls){ return '<a class="wa-btn '+(cls||'')+'" href="'+waLink(text)+'" target="_blank" rel="noopener">'+waGlyph(18)+esc(label||'Message us on WhatsApp')+'</a>'; }

/* ---------- account ---------- */
function currentAccount(){ return ST.user ? ST.accounts[ST.user] : null; }
function login(phone, pw){ var d = normPhone(phone); var a = ST.accounts[d]; if(a && (pw===a.password || normPhone(pw)===a.password)){ ST.user = d; saveState(); return true; } return false; }
function logout(){ ST.user = null; saveState(); }

/* ---------- phone & address ---------- */
/* R15 wave 1 (bug 8): Bengali digits ০–৯ count as 0–9 everywhere a phone is read */
function bnDigits(s){ return String(s==null?'':s).replace(/[০-৯]/g, function(c){ return String(c.charCodeAt(0) - 0x09E6); }); }
function normPhone(raw){ var d = bnDigits(raw).replace(/\D/g,''); if(d.indexOf('880')===0) d = d.slice(2); else if(d.indexOf('88')===0 && d.length===13) d = d.slice(2); if(d.length===10 && d[0]==='1') d = '0'+d; return d; }
function checkPhone(raw){
  var d = normPhone(raw);
  if(!d) return {state:'empty', digits:''};
  if(/^01[3-9]\d{8}$/.test(d)) return {state:'ok', digits:d, nice:d.slice(0,5)+'-'+d.slice(5)};
  /* K10 (owner, 20 Oct): one plain line everywhere a phone number is typed */
  if(d.indexOf('01')===0 && d.length>=3 && !/^01[3-9]/.test(d)) return {state:'warn', digits:d, msg:'Mobile numbers start with 013 to 019. Enter an 11-digit mobile number, like 01712345678.'};
  return {state:'warn', digits:d, msg:'Enter an 11-digit mobile number, like 01712345678.'};
}
var DHAKA_CITY = ['dhaka','mirpur','mirpur 1','mirpur 2','mirpur 6','mirpur 10','mirpur 11','mirpur 12','mirpur 13','mirpur 14','pallabi','kazipara','shewrapara','kafrul','ibrahimpur','dhanmondi','hazaribagh','new market','azimpur','lalbagh','chawkbazar','bakshibazar','kamrangirchar','uttara','uttara 3','uttara 4','uttara 7','uttara 10','uttara 11','uttara 12','uttara 13','sector 3','sector 4','sector 7','sector 10','sector 11','sector 13','azampur','jasimuddin','rajlakshmi','abdullahpur','dakshinkhan','uttarkhan','turag','khilkhet','nikunja','nikunja 1','nikunja 2','kuril','kuril bishwa road','bishwa road','joar sahara','baridhara','baridhara diplomatic','gulshan','gulshan 1','gulshan 2','banani','banani dohs','mohakhali','mohakhali dohs','niketan','tejgaon','nakhalpara','farmgate','kawran bazar','karwan bazar','panthapath','green road','shukrabad','kalabagan','sobhanbagh','jigatola','rayer bazar','mohammadpur','adabor','shyamoli','kallyanpur','gabtoli','darussalam','tajmahal road','ring road','bashundhara','bashundhara r/a','badda','north badda','south badda','middle badda','merul','merul badda','rampura','banasree','aftabnagar','khilgaon','taltola','goran','basabo','mugda','malibagh','shantinagar','paltan','purana paltan','motijheel','arambagh','fakirapool','segunbagicha','kakrail','bijoynagar','eskaton','moghbazar','siddheswari','ramna','shahbagh','elephant road','bangla motor','bangla bazar','sutrapur','wari','gandaria','tikatuli','jatrabari','shanir akhra','donia','demra','matuail','sarulia','shyampur','kadamtali','postogola','dholaikhal','islampur','nawabpur','gulistan','sadarghat','agargaon','sher-e-bangla','shyamoli ring','cantonment','manikdi','matikata','balughat','ecb chattar','kachukhet','vatara','satarkul','nurerchala','shahjadpur','notun bazar','jamuna future park','progoti sarani','malibag chowdhury para'];
var OUTSIDE = ['savar','ashulia','hemayetpur','gazipur','tongi','board bazar','chandra','kaliakoir','sreepur','narayanganj','fatullah','siddhirganj','rupganj','araihazar','sonargaon','keraniganj','zinzira','hasnabad','dohar','nawabganj','munshiganj','manikganj','narsingdi','chattogram','chittagong','sylhet','rajshahi','khulna','barishal','barisal','rangpur','mymensingh','cumilla','comilla','bogura','bogra','feni','noakhali','jashore','jessore','cox','dinajpur','pabna','tangail','faridpur','kushtia','jhenaidah','magura','satkhira','bagerhat','patuakhali','bhola','pirojpur','jamalpur','sherpur','netrokona','kishoreganj','brahmanbaria','chandpur','lakshmipur','rangamati','bandarban','khagrachhari','sirajganj','natore','naogaon','joypurhat','chapainawabganj','nilphamari','panchagarh','thakurgaon','lalmonirhat','kurigram','gaibandha','habiganj','moulvibazar','sunamganj','gopalganj','madaripur','shariatpur','rajbari','meherpur','chuadanga','narail','jhalokathi','barguna'];
/* Longest-match wins, so "Mirpur 12" beats "Mirpur" and "Uttara 11" beats "Uttara".
   An address we do not recognise is NOT silently called "outside" — it is returned unsure,
   and the checkout asks the customer one short question instead of guessing. */
function zoneOf(address){
  /* R15: the national list decides now (06-resolver.js). The old word list
     below is only a fallback if that file is missing. */
  if(typeof gzResolve === 'function') return gzResolve(address);
  var t = ' '+String(address||'').toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]+/g,' ')+' ';
  var best = null, bestLen = 0;
  var scan = function(list, zone){
    for(var i=0;i<list.length;i++){
      var k = list[i];
      if(t.indexOf(' '+k+' ')>=0 || t.indexOf(' '+k+',')>=0 || t.indexOf(k)>=0){
        if(k.length>bestLen){ bestLen = k.length; best = zone; }
      }
    }
  };
  scan(OUTSIDE,'out'); scan(DHAKA_CITY,'in');
  if(best) return {zone:best, sure:true, matched:bestLen};
  return {zone:null, sure:false, matched:0};
}
/* Owner-controlled visibility. Everything the owner can hide from the dashboard
   goes through SHOW(); default false here means "hidden in this preview". */
var SHOWN = { checkout:{ loginNudge:false, doorNote:true, helpStripDesktop:false },
  pdp:{ payLineWithFree:false, colourNote:true, trueColourLink:false, fitBar:false, unitToggle:false },
  /* R15 · 2.3/2.4. The floating icon column is retired by default: the heart
     sits after the product title, Share is switched off (kept, not deleted —
     tick it back on and the column returns with it), and WhatsApp lives in
     the header (header.whatsapp, pages in HDR_WA_PAGES). */
  pdpIcons:{ panel:false, wish:true, share:false, whatsapp:false },
  header:{ whatsapp:true },
  /* R15 · 3.1. The floating WhatsApp disc is off by default — the header icon
     replaced it on every page. Kept as a switch (nothing is deleted). */
  fab:{ whatsapp:false },
  /* 28+38. Each animated light sweep on the product page can be switched off on its own. */
  pdpSweep:{ freeDelivery:true, stock:true, allColours:true, colourLabel:true, sizeLabel:true, sizePills:true },
  /* 15+23. (the floating WhatsApp switch now lives above, off by default — R15 · 3.1) */
  /* round 12 switches */
  pdpPrice:{ discountAfterBar:true },
  account:{ offerBanner:true, invoices:true, photoUpload:true },
  category:{ breadcrumb:true },
  bag:{ waAboveTotal:false, waSendBag:false },
  thanks:{ nextSteps:false },
  upsell:{ bag:true, thanks:true, setLine:true, why:true } };
function SHOW(group, key){ var g = SHOWN[group]||{}; return g[key] !== false; }
/* The real WhatsApp mark: a filled bubble with the handset knocked out of it.
   `waGlyph()` is what every WhatsApp button and the floating button use — the
   line-art `chat` icon read as a generic speech bubble and nobody recognised it. */
function waGlyph(size, fill){
  size = size || 22;
  return '<svg class="wa-glyph" width="'+size+'" height="'+size+'" viewBox="0 0 32 32" aria-hidden="true" focusable="false">'+
    '<path fill="'+(fill||'currentColor')+'" d="M16.04 3.2c-7.08 0-12.83 5.74-12.83 12.82 0 2.26.59 4.47 1.72 6.42L3.1 29.1l6.84-1.79a12.8 12.8 0 006.1 1.55h.01c7.07 0 12.82-5.75 12.82-12.83 0-3.43-1.33-6.65-3.75-9.07a12.74 12.74 0 00-9.08-3.76zm0 23.5h-.01a10.65 10.65 0 01-5.43-1.49l-.39-.23-4.06 1.06 1.09-3.96-.26-.4a10.62 10.62 0 01-1.63-5.66c0-5.88 4.79-10.66 10.68-10.66 2.85 0 5.53 1.11 7.54 3.13a10.59 10.59 0 013.12 7.54c0 5.89-4.79 10.67-10.65 10.67z"/>'+
    '<path fill="'+(fill||'currentColor')+'" d="M21.88 18.9c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.71.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.89-1.78-2.21-.18-.32-.02-.5.14-.66.15-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.73-.98-2.36-.26-.62-.52-.54-.71-.55l-.61-.01c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65 0 1.57 1.14 3.08 1.3 3.29.16.21 2.25 3.43 5.45 4.81.76.33 1.35.52 1.82.67.76.24 1.46.21 2.01.13.61-.09 1.89-.77 2.16-1.52.27-.74.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37z"/>'+
  '</svg>';
}

/* ---------- one smooth slider engine for the whole site ----------
   The owner asked for every slider to glide instead of jumping from card to
   card. The track's children are cloned once, the scroll position advances a
   fraction of a pixel each frame, and at the halfway mark it jumps back by
   exactly half the width — seamless, because the second half is a copy of the
   first. Dragging still works; the drift pauses while a finger is down and
   picks up again a moment later. */
var SMOOTH = (function(){
  var tracks = {}, raf = null, last = 0;

  function prep(el){
    if(el.getAttribute('data-sm')) return true;
    if(el.scrollWidth <= el.clientWidth + 4) return false;
    el.setAttribute('data-sm','1');
    el._smHalf = el.scrollWidth;
    var kids = [].slice.call(el.children);
    for(var i=0;i<kids.length;i++){
      var c = kids[i].cloneNode(true);
      c.setAttribute('aria-hidden','true');
      [].slice.call(c.querySelectorAll('a,button,input,select,textarea')).forEach(function(n){ n.setAttribute('tabindex','-1'); });
      if(c.setAttribute) c.setAttribute('tabindex','-1');
      el.appendChild(c);
    }
    el._smN = kids.length;
    var lap = lapOf(el); if(lap > 0) el._smHalf = lap;
    el.style.scrollSnapType = 'none';
    el.style.scrollBehavior = 'auto';
    return true;
  }

  /* R15 note 23.12 (checklist L27). One lap = the distance from the first
     card to its first copy, measured — the old figure (scrollWidth before
     cloning) also counted the end padding, so the wrap jumped by that much. */
  function lapOf(el){
    var n = el._smN, a = el.children[0], b = n ? el.children[n] : null;
    if(!a || !b) return 0;
    return b.getBoundingClientRect().left - a.getBoundingClientRect().left;
  }
  /* where the cards sit: the first card's left edge when the row is at 0 */
  function edgeOf(el){ var cs = getComputedStyle(el); return el.getBoundingClientRect().left + (parseFloat(cs.paddingLeft)||0) + (parseFloat(cs.borderLeftWidth)||0); }
  /* the scrollLeft that puts the nearest card on the left edge */
  function cardEdges(el){
    var edge = edgeOf(el), out = [], kids = el.children, cur = el.scrollLeft;
    for(var i=0;i<kids.length;i++) out.push(cur + kids[i].getBoundingClientRect().left - edge);
    return out;
  }
  function nearestCard(el){
    var cur = el.scrollLeft, best = null;
    cardEdges(el).forEach(function(t){ if(best===null || Math.abs(t - cur) < Math.abs(best - cur)) best = t; });
    return best===null ? cur : best;
  }
  /* after a drag: the nearest card — but a clear swipe (40px+) never springs
     back to where it started; it goes on to the next card that way */
  function swipeCard(el, from){
    var cur = el.scrollLeft, to = nearestCard(el), dir = cur > from ? 1 : cur < from ? -1 : 0;
    if(dir && Math.abs(cur - from) >= 40 && (to - from) * dir <= 4){
      var pick = null;
      cardEdges(el).forEach(function(t){ if((t - from) * dir > 4 && (pick===null || Math.abs(t - from) < Math.abs(pick - from))) pick = t; });
      if(pick!==null) to = pick;
    }
    return to;
  }
  function easeOut(t){ return 1 - Math.pow(1 - t, 3); }
  /* glide to the nearest card after a hand drag. The drift is paused while
     this runs (the drag set the hold), so the two never write together; the
     drift then carries on from the card edge when the hold runs out. */
  function snap(el, st){
    st.user = false;
    var from = el.scrollLeft, to = swipeCard(el, st.dragFrom==null ? from : st.dragFrom), half = el._smHalf || (el.scrollWidth/2);
    var max = el.scrollWidth - el.clientWidth;
    to = Math.max(0, Math.min(max, to));
    if(Math.abs(to - from) < 1){ st.x = from; return; }
    var t0 = 0, dur = Math.min(320, 140 + Math.abs(to - from) * 0.9), tok = st.snapTok = (st.snapTok||0) + 1;
    st.snapping = true;
    function step(now){
      if(st.snapTok !== tok) return;                       /* a new touch took over */
      if(!t0) t0 = now;
      var k = Math.min(1, (now - t0) / dur), v = from + (to - from) * easeOut(k);
      el.scrollLeft = v; st.x = v;
      if(k < 1) requestAnimationFrame(step);
      else {
        st.snapping = false;
        /* same picture one lap back, so the drift always has room */
        if(half > 0 && to >= half){ el.scrollLeft = to - half; st.x = to - half; } else st.x = to;
        hold(st);                                          /* touch: the full pause starts from the snap. Mouse: no-op (T1) — hover alone pauses */
      }
    }
    requestAnimationFrame(step);
  }
  /* a drag has ended when the finger is up AND the row has stopped moving
     (a fling keeps scrolling after touchend). 'scrollend' where the browser
     has it, a short quiet period everywhere. */
  function settleLater(el, st, ms){
    clearTimeout(st.settleT);
    st.settleT = setTimeout(function(){
      if(st.down || !st.user) return;
      if(Math.abs(el.scrollLeft - st.dragFrom) < 3){ st.user = false; return; }   /* a tap or a page scroll, not a drag */
      snap(el, st);
    }, ms == null ? 140 : ms);
  }
  var SNAP_RESIZE = null;
  function onResize(){
    clearTimeout(SNAP_RESIZE);
    SNAP_RESIZE = setTimeout(function(){
      for(var k in tracks){
        var st = tracks[k], el = document.getElementById(k); if(!el) continue;
        var oldHalf = el._smHalf || 0, lap = lapOf(el);
        if(!(lap > 0)) continue;
        st.snapTok = (st.snapTok||0) + 1; st.snapping = false;   /* stop any glide */
        /* keep the same card in view: scale the position to the new lap, then
           settle on the nearest card edge — no jump back to the start */
        var x = oldHalf > 0 ? (st.x / oldHalf) * lap : st.x;
        el._smHalf = lap;
        if(x >= lap) x -= lap;
        el.scrollLeft = x; st.x = x;
        /* a row resting after a hand drag stays on a card edge; a drifting
           row just carries on from the same place (no snap = no jump) */
        if(Date.now() < st.pause && !st.hover){ var to = nearestCard(el); if(to >= lap) to -= lap; el.scrollLeft = Math.max(0, to); st.x = el.scrollLeft; }
      }
    }, 120);
  }
  window.addEventListener('resize', onResize);
  /* a mouse drag can end off the row (one listener for every track) */
  window.addEventListener('pointerup', function(){
    for(var k in tracks){ var st = tracks[k], el = document.getElementById(k); if(el && st.down){ st.down = false; if(st.user) settleLater(el, st); } }
  }, {passive:true});

  /* C2. HOW LONG A TOUCH STOPS THE CONVEYOR.
     The old hold was 2.6s, which is shorter than the time it takes to put a
     finger on a card, read the name and decide — so the thing under the finger
     still changed identity while it was being aimed at. 4 seconds is the
     owner's panjabi-page feel: it stops the moment you touch it and stays
     stopped long enough to tap. Every later touch restarts the 4 seconds. */
  var HOLD_MS = 4000;
  /* TA-2 (T1/T2): the 4-second hold is a TOUCH rule. Three separate pause
     flags, each with its own resume path:
       st.hover  mouse on the row      → cleared by pointerleave (moves at once)
       st.focus  keyboard focus inside → cleared on blur / when the mouse is used
       st.pause  touch hold (4 s)      → runs out by itself
     st.ptr remembers what the last hand was. After a mouse drag, a wheel or
     the snap glide the old code re-armed the 4 s hold, so the row stayed
     frozen 4 s after the mouse had left. A mouse never sets the hold now. */
  function hold(st){ if(st.ptr === 'mouse') return; st.pause = Date.now() + HOLD_MS; }

  /* T3 (TA-2): mouse drag for EVERY row. It used to live in 20-home.js only
     (hm_drag), so category, product and account rows started the browser's
     own link/picture "ghost" drag instead of moving. A phone keeps its native
     swipe: a touch pointer returns at once. */
  function wrapX(el, x){
    var half = el.getAttribute('data-sm') ? (el._smHalf || el.scrollWidth/2) : 0;
    if(!half) return Math.max(0, Math.min(x, el.scrollWidth - el.clientWidth));
    if(x >= half) x -= half;
    if(x < 0) x += half;
    return x;
  }
  function drag(el){
    if(!el || el.getAttribute('data-drag')) return;
    el.setAttribute('data-drag','1');
    var down = false, x0 = 0, from = 0, moved = false;
    /* the cards are links and pictures; the browser's own drag would eat the gesture */
    el.addEventListener('dragstart', function(ev){ ev.preventDefault(); });
    el.addEventListener('pointerdown', function(ev){
      if(ev.pointerType === 'touch' || ev.button !== 0) return;
      down = true; moved = false; x0 = ev.clientX; from = el.scrollLeft;
      /* mandatory snapping would yank every mid-drag pixel back to a card */
      el.style.scrollSnapType = 'none';
      el.style.scrollBehavior = 'auto'; el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', function(ev){
      if(!down) return;
      var d = ev.clientX - x0;
      if(Math.abs(d) > 5) moved = true;            /* a real drag, not a hand tremor on a click */
      el.scrollLeft = wrapX(el, from - d);
      ev.preventDefault();
    });
    function up(){
      if(!down) return;
      down = false; el.style.cursor = '';
      /* a conveyor never gets its snapping back — it would fight the drift */
      if(el.getAttribute('data-sm')){ el.style.scrollSnapType = 'none'; el.style.scrollBehavior = 'auto'; }
      else { el.style.scrollBehavior = ''; el.style.scrollSnapType = ''; }
    }
    ['pointerup','pointercancel','pointerleave'].forEach(function(e){ el.addEventListener(e, up); });
    /* a drag must not count as a click on the card underneath; a plain click still opens it */
    el.addEventListener('click', function(ev){
      if(moved){ ev.preventDefault(); ev.stopPropagation(); moved = false; }
    }, true);
  }

  function bind(el, st){
    if(el._smBound) return; el._smBound = true;
    /* pointerdown covers mouse and pen; touchstart is kept for the browsers
       that fire it first; touchmove/wheel keep the hold alive through a swipe.
       'scroll' is deliberately NOT in this list: the drift writes scrollLeft
       itself, so holding on scroll would freeze the row for good. */
    ['pointerdown','pointermove','touchstart','touchmove','wheel'].forEach(function(e){
      el.addEventListener(e, function(ev){
        if(e === 'pointermove' && ev && ev.buttons === 0) return;   /* a hover is not a drag */
        /* T2: an up-and-down wheel scrolls the PAGE, not this row — ignore it.
           A sideways wheel / trackpad swipe moves the row (a mouse-type hand). */
        if(e === 'wheel'){ if(!ev || Math.abs(ev.deltaX) <= Math.abs(ev.deltaY)) return; st.ptr = 'mouse'; }
        if(e === 'pointerdown' || e === 'pointermove') st.ptr = ev.pointerType || 'mouse';
        if(e === 'touchstart') st.ptr = 'touch';
        hold(st);
        /* L27: remember where a hand drag began, and stop any snap glide */
        if(!st.user){ st.user = true; st.dragFrom = el.scrollLeft; }
        st.snapTok = (st.snapTok||0) + 1; st.snapping = false;
        if(e === 'touchstart' || e === 'pointerdown') st.down = true;
        if(e === 'wheel') settleLater(el, st, 180);
      }, {passive:true});
    });
    ['touchend','touchcancel','pointerup','pointercancel'].forEach(function(e){
      el.addEventListener(e, function(){ st.down = false; hold(st); if(st.user) settleLater(el, st); }, {passive:true});
    });
    el.addEventListener('scrollend', function(){ if(st.user && !st.down) settleLater(el, st, 0); }, {passive:true});
    /* L27: hover is a MOUSE thing. A phone fires emulated mouseenter on a tap
       and never the matching mouseleave, which froze the row for good after
       one tap; a touch gets the 4-second hold above instead. */
    el.addEventListener('pointerenter', function(ev){ if(ev.pointerType === 'mouse') st.hover = true; });
    /* Owner 19 Oct 21:09: the cursor leaves → the row moves again AT ONCE
       (no 4-second wait, no scroll needed). Mouse only — touch keeps its hold.
       A mouse drag that is still settling finishes its snap first. */
    el.addEventListener('pointerleave', function(ev){ if(ev.pointerType === 'mouse'){ st.hover = false; if(!st.down){ st.pause = 0; st.x = el.scrollLeft; } } });
    /* a drag or a wheel moves the real scrollLeft; adopt it as the new truth */
    el.addEventListener('scroll', function(){
      if(st.hover || Date.now() < st.pause) st.x = el.scrollLeft;
      /* a fling still moving after the finger left: wait for it to stop.
         T1: once the mouse has left, the row's OWN drift writes scrollLeft —
         that is not a hand, so it must not re-arm anything. */
      if(st.user && !st.down && !st.snapping && (st.hover || st.ptr !== 'mouse')){ hold(st); settleLater(el, st); }
    }, {passive:true});
  }

  function frame(now){
    var dt = last ? Math.min(64, now - last) : 16; last = now;
    var any = false, k;
    for(k in tracks){
      var st = tracks[k], el = document.getElementById(k);
      if(!el){ delete tracks[k]; continue; }
      any = true;
      if(st.hover || st.focus || st.snapping || Date.now() < st.pause){ if(!st.snapping) st.x = el.scrollLeft; continue; }
      var half = el._smHalf || (el.scrollWidth/2);
      /* The browser stores scrollLeft as a whole pixel and ROUNDS on assignment,
         so `scrollLeft += 0.4` reads back unchanged and a slow drift never moves
         at all. The true position is kept here as a float and only handed over
         rounded. A finger scroll is picked back up through the scroll listener. */
      st.x += st.speed * (dt/1000) * st.dir;
      if(st.x >= half) st.x -= half;
      if(st.x < 0) st.x += half;
      el.scrollLeft = Math.round(st.x);
    }
    raf = any ? requestAnimationFrame(frame) : null;
    if(!any) last = 0;
  }

  return {
    /* dir: -1 drifts the cards to the LEFT (scroll moves right), +1 to the RIGHT.
       speed is pixels per second — 18-28 reads as a calm glide. */
    start: function(id, opts){
      opts = opts || {};
      var el = document.getElementById(id); if(!el) return;
      /* T3: every row that can scroll gets the mouse drag, even with reduced motion */
      if(el.scrollWidth > el.clientWidth + 4) drag(el);
      if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if(!prep(el)) return;
      /* C2. EVERY TRACK STARTS ON A CARD BOUNDARY.
         A re-render, a restored scroll position or a half-finished drift left
         the first card hanging off the left edge (measured: -39, -35, -30,
         -2049, -21, -23 px), so names were already cut before anyone touched
         the page. The start position is now set here, not inherited. */
      el.scrollLeft = 0;
      var st = {speed: opts.speed || 22, dir: opts.dir === 1 ? -1 : 1, pause: 0, hover: false, focus: false, ptr: '', x: 0};
      /* dir +1 in the caller's words means "cards drift right", which is a
         decreasing scrollLeft. The track has to start a full lap in, at
         exactly `half` — the second half is a pixel-for-pixel clone of the
         first, so that is the same picture as 0, still card-aligned, with a
         whole lap of room to travel into. */
      if(opts.dir === 1){ st.dir = -1; el.scrollLeft = el._smHalf; st.x = el._smHalf; }
      bind(el, st);
      tracks[id] = st;
      if(!raf) raf = requestAnimationFrame(frame);
    },
    drag: drag,                                         /* T3: the one mouse drag (20-home.js uses it too) */
    stop: function(id){ delete tracks[id]; },
    peek: function(id){ return tracks[id] || null; },   /* read-only look for tests */
    stopAll: function(){ tracks = {}; }
  };
})();

function deliveryCharge(zone, total){ var free = SET('delivery','freeOver'); if(total>=free) return 0; return zoneFee(zone); }
/* R15 · three bands (§60.5): the sub-area band has its own charge, or is
   folded into Dhaka city or into outside — the owner's setting subMode. */
function zoneEff(zone){ if(zone!=='sub') return zone; var m = SET('delivery','subMode'); return m==='city' ? 'in' : m==='outside' ? 'out' : 'sub'; }
function zoneFee(zone){ var z = zoneEff(zone); return z==='in' ? SET('delivery','inside') : z==='sub' ? SET('delivery','sub') : SET('delivery','outside'); }
function zoneDays(zone){ var z = zoneEff(zone); return z==='in' ? SET('delivery','insideDays') : z==='sub' ? SET('delivery','subDays') : SET('delivery','outsideDays'); }
/* R15 · 4.2/4.3. The delivery promise, in HOURS, per band — every number
   and the sentence itself are dashboard settings (rule 'delivery'). */
function zoneHours(zone){ var z = zoneEff(zone); return z==='in' ? SET('delivery','insideHours') : z==='sub' ? SET('delivery','subHours') : z==='out' ? SET('delivery','outsideHours') : ''; }
function deliveryPromise(zone){
  var h = zoneHours(zone);
  if(!h){ var a = SET('delivery','insideHours'), b = SET('delivery','outsideHours');
    var lo = String(a||'').split(/[–-]/)[0], hi = String(b||'').split(/[–-]/).pop();
    return String(SET('delivery','promiseAny')||'').replace('{hours}', lo && hi ? lo+'–'+hi : (b||a||'')); }
  return String(SET('delivery','promise')||'').replace('{hours}', h);
}
function zoneName(zone){ var z = zoneEff(zone); return z==='in' ? 'Inside Dhaka city' : z==='sub' ? 'Dhaka sub-area' : 'Outside Dhaka'; }

/* ---------- size advice (rule-based; works without AI) ---------- */
function recommendSize(chart, heightIn, weightKg){
  if(!chart) return null; var cm = heightIn*2.54; var keys = Object.keys(chart.rows);
  var need, idx = 0;
  if(chart.type==='bottom'){ need = (26 + 0.7*weightKg + 0.02*cm)/2.54 + chart.ease; }
  else { need = (52 + 0.55*weightKg + 0.035*cm)/2.54 + chart.ease; }
  for(var i=0;i<keys.length;i++){ if(chart.rows[keys[i]][0] >= need - 0.5){ idx = i; break; } idx = i; }
  return {size:keys[idx], need:Math.round(need*10)/10, next:keys[Math.min(keys.length-1, idx+1)]};
}
function inchToCm(v){ return Math.round(v*2.54); }
function fmtMeasure(v, cm){ return cm ? inchToCm(v)+' cm' : v+'"'; }

/* ---------- bag & pricing engine ---------- */
function bagCount(){ return ST.bag.reduce(function(s,l){ return s + (l.kind==='set' ? l.items.length*(l.qty||1) : l.qty); }, 0); }
/* A customer who taps "Add to Bag" three times in a row means it once.
   Repeats inside this window are ignored instead of silently becoming qty 3.
   R16 (combo fix 2): sets go through the same guard — two quick taps on
   "Add set to Bag" used to put two sets in the bag. */
var LAST_ADD = {k:'', t:0};
var BAG_REPEAT_MS = 1200;

/* ---------- R16 · stock across the WHOLE bag (sets + loose items) ----------
   A set used to be checked only against itself, so two Polo Duos in Navy L
   could put 4 × Navy L in the bag when 2 were left. Every add, the bag and
   the checkout now count what the whole bag already holds. */
function bagSku(pid, color, size){ return pid+'|'+color+'|'+size; }
function bagStockUse(skipId){
  var use = {};
  ST.bag.forEach(function(l){
    if(skipId && l.id===skipId) return;
    if(l.kind==='set') (l.items||[]).forEach(function(it){ var k = bagSku(it.product, it.color, it.size); use[k] = (use[k]||0) + (l.qty||1); });
    else { var k = bagSku(l.product, l.color, l.size); use[k] = (use[k]||0) + (l.qty||1); }
  });
  return use;
}
function bagStockMsg(x){
  var p = P(x.product), nm = COL(x.color).name+' · '+x.size;
  if(x.stock<=0) return (p ? p.name+' ' : '')+'in '+nm+' is sold out.';
  if(x.inBag) return 'Only '+x.stock+' left in '+nm+' — '+(x.inBag>=x.stock ? 'all '+x.stock+' are' : x.inBag+(x.inBag===1 ? ' is' : ' are'))+' already in your bag.';
  return 'Only '+x.stock+' left in '+nm+'.';
}
/* would these units, on top of what the bag already holds, go past stock? */
function bagStockClash(units, skipId){
  var use = bagStockUse(skipId), need = {}, out = [];
  (units||[]).forEach(function(u){ var k = bagSku(u.product, u.color, u.size); need[k] = (need[k]||0) + (u.qty||1); });
  Object.keys(need).forEach(function(k){
    var a = k.split('|'), st = stockOf(a[0], a[1], a[2]), had = use[k]||0;
    if(had + need[k] > st){ var x = {product:a[0], color:a[1], size:a[2], stock:st, inBag:had, want:need[k], left:Math.max(0, st-had)}; x.msg = bagStockMsg(x); out.push(x); }
  });
  return out;
}
/* everything in the bag right now that asks for more than we have */
function bagStockIssues(){
  var use = bagStockUse(), out = [];
  Object.keys(use).forEach(function(k){
    var a = k.split('|'), st = stockOf(a[0], a[1], a[2]);
    if(use[k] > st){
      var x = {product:a[0], color:a[1], size:a[2], stock:st, inBag:use[k], over:use[k]-st};
      x.msg = (st<=0 ? COL(x.color).name+' · '+x.size+' is sold out' : 'Only '+st+' left in '+COL(x.color).name+' · '+x.size)+' — your bag has '+use[k]+'. Remove '+x.over+' to continue.';
      x.lines = ST.bag.filter(function(l){ return l.kind==='set' ? (l.items||[]).some(function(it){ return bagSku(it.product, it.color, it.size)===k; }) : bagSku(l.product, l.color, l.size)===k; }).map(function(l){ return l.id; });
      out.push(x);
    }
  });
  return out;
}

function bagAdd(line, opts){
  opts = opts||{};
  var now = Date.now();
  if(line.kind==='set'){
    var skey = 'set|'+(line.refId||line.name)+'|'+(line.items||[]).map(function(it){ return bagSku(it.product, it.color, it.size); }).join(',');
    if(!opts.force && LAST_ADD.k===skey && (now-LAST_ADD.t) < BAG_REPEAT_MS) return {added:false, reason:'repeat'};
    var clash = bagStockClash(line.items, opts.replace);
    if(clash.length) return {added:false, reason:'stock', issues:clash, msg:clash[0].msg};
    LAST_ADD = {k:skey, t:now};
    line.id = uid(); line.qty = 1;
    if(opts.replace){
      for(var r=0;r<ST.bag.length;r++) if(ST.bag[r].id===opts.replace){ ST.bag.splice(r, 1, line); saveState(); return {added:true, replaced:true, id:line.id}; }
    }
    ST.bag.push(line); saveState(); return {added:true, id:line.id};
  }
  var key = line.product+'|'+line.color+'|'+line.size;
  if(!opts.force && LAST_ADD.k===key && (now-LAST_ADD.t) < BAG_REPEAT_MS){ return {added:false, reason:'repeat'}; }
  LAST_ADD = {k:key, t:now};
  var ex = ST.bag.filter(function(l){ return l.kind==='item' && l.product===line.product && l.color===line.color && l.size===line.size; })[0];
  if(ex && !opts.force){
    /* R15 note 23.13 (checklist P11): the owner's setting bag.duplicateAdd.
       'block' (default) — "already in your bag", as before. 'qty' — a second
       Add from the product page puts ONE more in, never past stock. Only a
       caller that asks (opts.dupQty) gets it; moves, swaps and add-ons don't. */
    if(opts.dupQty && typeof bagDupMode==='function' && bagDupMode()==='qty'){
      var cq = bagStockClash([{product:line.product, color:line.color, size:line.size, qty:1}]);
      if(cq.length){ saveState(); return {added:false, reason:'stock', issues:cq, msg:cq[0].msg, qty:ex.qty}; }
      ex.qty += 1; saveState(); return {added:true, qtyUp:true, qty:ex.qty};
    }
    saveState(); return {added:false, reason:'already', qty:ex.qty};
  }
  var ci = bagStockClash([{product:line.product, color:line.color, size:line.size, qty:line.qty||1}]);
  if(ci.length){ if(!opts.quiet && typeof toast==='function') toast(ci[0].msg); return {added:false, reason:'stock', issues:ci, msg:ci[0].msg}; }
  if(ex) ex.qty += (line.qty||1);
  /* R15 wave 2 (E04): the price the shopper saw when adding is kept, so a
     later price change is shown in the bag and at checkout, never silent */
  else { var pp = P(line.product); ST.bag.push({id:uid(), kind:'item', product:line.product, color:line.color, size:line.size, qty:line.qty||1, addedPrice:pp ? pp.price : undefined}); }
  saveState(); return {added:true};
}
function bagRemove(id){ ST.bag = ST.bag.filter(function(l){ return l.id!==id; }); saveState(); }
/* a loose item's quantity never goes past what is left after the rest of the bag */
function bagMaxQty(l){ if(!l || l.kind!=='item') return 1; var use = bagStockUse(l.id); return Math.max(0, stockOf(l.product, l.color, l.size) - (use[bagSku(l.product, l.color, l.size)]||0)); }
function bagSetQty(id, q){ ST.bag.forEach(function(l){ if(l.id===id){ var mx = bagMaxQty(l); l.qty = Math.max(1, Math.min(q, mx>0 ? mx : l.qty)); } }); saveState(); }

/* ---------- R16 · the price a set line is charged NOW ----------
   (4) The bag re-prices a set from the CURRENT combo price (or the current
       tier of a build-your-own group) — it used to keep the price frozen at
       the moment of adding, so an owner's price change never reached it.
   (5) A set is never charged above the regular total of its items. If the
       owner sets ৳1,800 on a ৳1,700 pair, the shopper pays ৳1,700 and no
       "set price" is claimed. */
function bagSetPrice(l){
  var reg = (l.items||[]).reduce(function(s, it){ var p = P(it.product); return s + (p ? p.price : 0); }, 0);
  var cur = Number(l.price)||reg;
  if(l.source==='combo' && l.refId && typeof COMBO==='function'){ var c = COMBO(l.refId); if(c && c.active && Number(c.price)>0) cur = Number(c.price); }
  else if(l.source==='custom' && l.refId && typeof bs_price==='function'){
    var r = setRules().filter(function(x){ return x.id===l.refId; })[0];
    if(r && r.active){ var bp = bs_price(r, l.items); if(bp && bp.price>0) cur = bp.price; }
  }
  else if(l.source==='auto' && typeof ca_listing==='function'){ var a = ca_listing(l.refId); if(a && a.rule && a.rule.active && Number(a.price)>0) cur = Number(a.price); } /* R15 auto pairs */
  var capped = cur > reg; if(capped) cur = reg;
  return {regular:reg, price:cur, capped:capped, changed: cur !== Number(l.price)};
}
/* "Tracksuit Set" must not become "Tracksuit Set set" */
function bagSetName(name){ name = String(name||''); return /\bset$/i.test(name.trim()) ? name : name+' set'; }
function bagTotals(){
  var lines = [], subtotal = 0, discount = 0, setDiscounts = [], units = [], groups = [];
  ST.bag.forEach(function(l){
    if(l.kind==='item'){ var p = P(l.product); var reg = p.price*l.qty; subtotal += reg; lines.push({line:l, regular:reg, price:reg}); for(var i=0;i<l.qty;i++) units.push({product:l.product, price:p.price}); }
    else {
      var q = l.qty||1, sp = bagSetPrice(l), regS = sp.regular*q, priceS = sp.price*q, save = regS - priceS;
      subtotal += regS; discount += save;
      var row = {line:l, regular:regS, price:priceS, setPrice:sp.price, addedPrice:Number(l.price), changed:sp.changed, capped:sp.capped};
      lines.push(row);
      if(save>0){ var d = {label:bagSetName(l.name)+' price', amount:save, line:l.id}; setDiscounts.push(d); groups.push({kind:'line', label:l.name, regular:regS, save:save, d:d, row:row}); }
    }
  });
  // auto-apply fixed combos the owner marked "auto-apply when bag matches"
  var pool = units.slice(), autoApplied = [];
  combos().filter(function(c){ return c.active && c.autoApply; }).forEach(function(c){
    while(true){
      var take = [], tmp = pool.slice(), ok = true;
      c.items.forEach(function(pid){ var ix = -1; for(var i=0;i<tmp.length;i++){ if(tmp[i].product===pid){ ix=i; break; } } if(ix<0) ok=false; else { take.push(tmp[ix]); tmp.splice(ix,1); } });
      if(!ok) break;
      var reg = take.reduce(function(s,u){return s+u.price;},0); if(reg<=c.price) break;
      pool = tmp; discount += reg - c.price;
      var ad = {label:bagSetName(c.name)+' price', amount:reg-c.price, auto:true, combo:c.id};
      setDiscounts.push(ad); autoApplied.push(c.id); groups.push({kind:'auto', label:c.name, combo:c.id, regular:reg, save:reg-c.price, d:ad});
    }
  });
  var free = SET('delivery','freeOver');
  var tot = {lines:lines, subtotal:subtotal, discount:discount, setDiscounts:setDiscounts, count:bagCount(), autoApplied:autoApplied, free:free,
    groups:groups, looseRegular:pool.reduce(function(s,u){ return s+u.price; }, 0), offer:null, offerPlan:null};
  /* (6) "Set prices are not combined with other offers" — 50-bag.js decides,
     set by set, whether the set price or the member offer saves more, and
     removes the one that loses. */
  if(typeof bag_offerPlan==='function') bag_offerPlan(tot);
  tot.total = tot.subtotal - tot.discount;
  tot.freeLeft = Math.max(0, free - tot.total);
  /* (7) The rows the bag and checkout list: a set is ONE row at what it
     costs, so the rows add up to this figure; auto-applied sets (loose items
     that make a combo) keep their own discount row underneath. */
  tot.rowsSubtotal = tot.subtotal - tot.setDiscounts.filter(function(d){ return d.line; }).reduce(function(s, d){ return s + d.amount; }, 0);
  return tot;
}
/* same product + same colour + neighbouring sizes */
function bracketPairs(){
  var out = [], items = ST.bag.filter(function(l){ return l.kind==='item'; }), seen = {};
  items.forEach(function(a){ items.forEach(function(b){
    if(a===b || a.product!==b.product || a.color!==b.color) return;
    var p = P(a.product), ia = p.sizes.indexOf(a.size), ib = p.sizes.indexOf(b.size);
    if(Math.abs(ia-ib)===1){ var key = a.product+'|'+a.color+'|'+[a.size,b.size].sort().join('+'); if(!seen[key]){ seen[key]=1; out.push({key:key, product:a.product, color:a.color, sizes:ia<ib?[a.size,b.size]:[b.size,a.size]}); } }
  }); });
  return out;
}

/* ---------- orders ---------- */
function placeOrder(form){
  var tot = bagTotals(); if(!tot.lines.length) return null;
  var ph = checkPhone(form.phone), phone = ph.digits || String(form.phone);
  var z = zoneOf(form.address), delivery = deliveryCharge(z.zone, tot.total);
  var id = 'EX-'+(ST.seq++), now = Date.now();
  var lines = [];
  ST.bag.forEach(function(l){
    if(l.kind==='item') lines.push({product:l.product, color:l.color, size:l.size, qty:l.qty, unitPrice:P(l.product).price});
    /* R16 (1)(8): a set's items are stored at their REAL prices, and the set
       saving is the one "<set> set price" line in setDiscounts — so the rows
       add up to the subtotal, and a size exchange inside a set compares real
       prices (same item → only the exchange delivery). It used to split the
       set price evenly (৳1,033 × 3), which matched nothing. */
    else l.items.forEach(function(it){ var ip = P(it.product); lines.push({product:it.product, color:it.color, size:it.size, qty:l.qty||1, unitPrice:ip ? ip.price : 0, setLabel:l.name, setId:l.id}); });
  });
  var flags = [];
  if(!z.sure) flags.push('Address check');
  if(ph.state!=='ok') flags.push('Phone check');
  bracketPairs().forEach(function(b){ flags.push(ST.bracketAck[b.key]==='other' ? '2 sizes — for someone else' : '2 sizes — check'); });
  var extra = form.extraDiscount||0;
  var order = {id:id, phone:phone, name:form.name, address:form.address, zone:z.zone, flags:flags, lines:lines, setDiscounts:tot.setDiscounts,
    subtotal:tot.subtotal, discount:tot.discount+extra, delivery:delivery, total:tot.total-extra+delivery, payment:form.payment||'cod', wallet:form.wallet||null,
    status:'confirmed', createdAt:now, deliveredAt:null, edits:0, courier:z.zone==='in'?'Steadfast':'Pathao', tracking:(z.zone==='in'?'SF-':'PT-')+Math.floor(100000+Math.random()*899999),
    timeline:[{s:'confirmed',at:now}], reviewed:{}, exchanges:[], offersOptIn:!!form.offers, note:form.note||'', source:form.source||'website', addOns:[]};
  /* R15 note 23.1: the two offer ticks are stored apart, on the order and on
     the customer (08-shop-opts.js); the old single flag stays in step */
  if(form.consent){ order.consent = {sms:!!form.consent.sms, wa:!!form.consent.wa, at:now, src:form.consent.src||order.source, order:id}; order.offersOptIn = order.consent.sms || order.consent.wa; }
  ST.orders[id] = order;
  var acc = ST.accounts[phone];
  if(!acc){ acc = ST.accounts[phone] = {name:form.name, phone:phone, password:phone, tier:'New', address:form.address, zone:z.zone, wallet:0, walletTx:[], mySize:ST.guestSize||null, offers:[], orders:[], reviews:[], referralCode:(String(form.name||'EXTAS').split(' ')[0].toUpperCase().replace(/[^A-Z]/g,'')||'EXTAS')+'100', fbShares:[], isNew:true}; }
  acc.orders.unshift(id); if(!acc.address) acc.address = form.address;
  if(order.consent && typeof setAcctConsent==='function') setAcctConsent(acc, order.consent);
  if(form.walletUsed){ acc.wallet -= form.walletUsed; acc.walletTx.unshift({label:'Used on #'+id, amount:-form.walletUsed, at:now}); }
  ST.user = phone; ST.bag = []; ST.bracketAck = {};
  saveState(); return id;
}
var STATUS_FLOW = ['confirmed','packed','shipped','delivered'];
var STATUS_LABEL = {confirmed:'Order confirmed', packed:'Packed', shipped:'With courier', delivered:'Delivered'};
function advanceOrder(id){ var o = ST.orders[id]; var i = STATUS_FLOW.indexOf(o.status); if(i<STATUS_FLOW.length-1){ o.status = STATUS_FLOW[i+1]; o.timeline.push({s:o.status, at:Date.now()}); if(o.status==='delivered') o.deliveredAt = Date.now(); saveState(); } }
function exchangeHoursLeft(o){ if(!o.deliveredAt) return null; var h = SET('exchange','windowHours'); return Math.max(0, Math.floor((o.deliveredAt + h*3600000 - Date.now())/3600000)); }

/* ---------- exchange options (owner's strict order) ---------- */
function exchangeOptions(order, lineIdx, neededSize, reason){
  var line = order.lines[lineIdx], p = P(line.product), cat = CAT(p.cat);
  var size = reason==='problem' ? line.size : neededSize;
  var chart = chartFor(p), ref = chart && chart.rows[size] ? chart.rows[size][0] : null;
  function avail(prod, color){ return stockOf(prod.id, color, size) > 0; }
  // 1) same item, same colour
  if(avail(p, line.color)) return {tier:1, size:size, groups:[{product:p.id, colors:[line.color]}], title:'Good news — size '+size+' is in stock', note:'Same item, same colour.'};
  // 2) same item, other colours
  var others = p.colors.filter(function(c){ return c!==line.color && avail(p,c); });
  if(others.length) return {tier:2, size:size, groups:[{product:p.id, colors:others}], title:'Size '+size+' in '+COL(line.color).name+' is out of stock', note:'You can pick the same item in another colour.'};
  // 3) same category, same measurements; same collection first
  var inCat = DB.products.filter(function(x){ return x.cat===p.cat && x.id!==p.id && x.sizes.indexOf(size)>=0; }).filter(function(x){
    var ch = chartFor(x); if(ref==null || !ch || !ch.rows[size]) return true; return Math.abs(ch.rows[size][0]-ref) <= 1.5; });
  inCat.sort(function(a,b){ return (b.collection===p.collection) - (a.collection===p.collection); });
  var g3 = inCat.map(function(x){ return {product:x.id, colors:x.colors.filter(function(c){ return avail(x,c); }), sameCollection:x.collection===p.collection}; }).filter(function(g){ return g.colors.length; });
  if(g3.length) return {tier:3, size:size, groups:g3, title:'This item has no size '+size+' in any colour', note:'Choose another '+cat.name.toLowerCase().replace(/s$/,'')+' in size '+size+' (same measurements).'};
  // 4) other categories (same body area first)
  var rest = DB.products.filter(function(x){ return x.cat!==p.cat && x.sizes.indexOf(size)>=0 && CAT(x.cat).group!=='acc'; });
  rest.sort(function(a,b){ return (CAT(b.cat).group===cat.group) - (CAT(a.cat).group===cat.group); });
  var g4 = rest.map(function(x){ return {product:x.id, colors:x.colors.filter(function(c){ return avail(x,c); })}; }).filter(function(g){ return g.colors.length; });
  if(g4.length) return {tier:4, size:size, groups:g4, title:'No '+cat.name.toLowerCase()+' left in size '+size, note:'You can choose from other categories in size '+size+'.'};
  return {tier:0, size:size, groups:[], title:'Size '+size+' is not in stock anywhere right now', note:'Message us on WhatsApp — we will tell you when it is back.'};
}

/* ---------- router ---------- */
var ROUTES = [
  [/^\/$/, 'home'], [/^\/c\/([\w-]+)$/, 'category'], [/^\/search$/, 'search'], [/^\/p\/([\w-]+)$/, 'product'],
  [/^\/combo\/([\w-]+)$/, 'combo'], [/^\/set$/, 'set'], [/^\/set\/([\w-]+)$/, 'set'], [/^\/bag$/, 'bag'], [/^\/checkout$/, 'checkout'],
  [/^\/thanks\/([\w-]+)$/, 'thanks'], [/^\/login$/, 'login'], [/^\/account$/, 'account'], [/^\/account\/([\w-]+)$/, 'account'],
  /* H5. The journal was a section of dead links. These two routes are what
     "Read article" and the footer's Journal link now point at. */
  [/^\/journal$/, 'journal'], [/^\/journal\/([\w-]+)$/, 'journal'],
  [/^\/page\/([\w-]+)$/, 'page'], [/^\/order\/([\w-]+)$/, 'order'], [/^\/exchange\/([\w-]+)$/, 'exchange'], [/^\/l\/([\w-]+)$/, 'landing'],
  [/^\/admin$/, 'admin-orders'], [/^\/admin\/orders$/, 'admin-orders'], [/^\/admin\/rules$/, 'admin-rules'], [/^\/admin\/size-charts$/, 'admin-sizecharts'],
  [/^\/admin\/ai$/, 'admin-ai'], [/^\/admin\/landing$/, 'admin-landing'], [/^\/admin\/landing\/new$/, 'admin-landing-new'], [/^\/admin\/combos$/, 'admin-combos'], [/^\/admin\/reviews$/, 'admin-reviews']
];
var CUR = {page:null, params:[], query:{}, path:'/'};
/* Integration (Bhandari, PR 590): renamed products — an old link or a slug
   resolves here (nm_resolve in 95-admin-naming.js). parseHashRaw is the plain
   route match it re-reads after forwarding; parseHash is what the shop calls. */
function parseHash(){
  var r = parseHashRaw();
  if(typeof nm_resolve==='function'){ try{ var x = nm_resolve(r, 0); if(x) return x; }catch(e){ console.error(e); } }
  return r;
}
function parseHashRaw(){
  var h = location.hash.replace(/^#/, '') || '/'; var qi = h.indexOf('?'), path = qi>=0 ? h.slice(0,qi) : h, qs = qi>=0 ? h.slice(qi+1) : '';
  /* R15 wave 1 (E08): a broken address (#/search?q=%) must not crash the page */
  var dec = function(x){ try{ return decodeURIComponent(x); }catch(e){ return x; } };
  var query = {}; qs.split('&').forEach(function(kv){ if(!kv) return; var a = kv.split('='); query[dec(a[0])] = dec(a[1]||''); });
  for(var i=0;i<ROUTES.length;i++){ var m = path.match(ROUTES[i][0]); if(m) return {page:ROUTES[i][1], params:m.slice(1), query:query, path:path}; }
  return {page:'notfound', params:[], query:query, path:path};
}
function go(hash){ if(location.hash===hash) render(); else location.hash = hash; }
function rerender(){ var y = window.scrollY; render(true); window.scrollTo(0, y); }
function render(keepScroll){
  if(typeof pg_sync === 'function') try{ pg_sync(); }catch(e){}   /* help text follows the settings */
  CUR = parseHash(); var pg = PAGES[CUR.page] || PAGES.notfound;
  var body; try{ body = pg.render(CUR.params, CUR.query); }catch(e){ console.error(e); body = '<div class="container empty"><div class="h2">Something went wrong on this demo page</div><p class="muted">'+esc(e.message)+'</p><a class="btn btn-primary mt16" href="#/">Go home</a></div>'; }
  var html = layout(body, pg.layout||'store', CUR);
  var app = document.getElementById('app'); app.innerHTML = html;
  document.title = (pg.title ? (typeof pg.title==='function' ? pg.title(CUR.params, CUR.query) : pg.title)+' · ' : '') + 'EXTAS';
  if(pg.after) try{ pg.after(CUR.params, CUR.query); }catch(e){ console.error(e); }
  if(!keepScroll) window.scrollTo(0,0);
}
/* R15 wave 1: one navigation model (99-boot.js navSync) handles every hash
   change and Back/Forward — it closes popups, renders and puts the scroll back */
window.addEventListener('hashchange', function(){ navSync(); });

/* ---------- events ---------- */
document.addEventListener('click', function(ev){
  var el = ev.target.closest('[data-act]'); if(!el) return;
  var name = el.getAttribute('data-act'); if(ACT[name]){ ev.preventDefault(); ACT[name](el, ev); }
});
document.addEventListener('input', function(ev){ var el = ev.target.closest('[data-input]'); if(el && INPUT[el.getAttribute('data-input')]) INPUT[el.getAttribute('data-input')](el, ev); });
document.addEventListener('change', function(ev){ var el = ev.target.closest('[data-change]'); if(el && CHANGE[el.getAttribute('data-change')]) CHANGE[el.getAttribute('data-change')](el, ev); });
document.addEventListener('submit', function(ev){ var f = ev.target.closest('[data-submit]'); if(f){ ev.preventDefault(); if(SUBMIT[f.getAttribute('data-submit')]) SUBMIT[f.getAttribute('data-submit')](f, ev); } });
document.addEventListener('keydown', function(ev){ if(ev.key==='Escape' && document.querySelector('.modal-back')) closeModal(); });

/* generic actions */
ACT['go'] = function(el){ go(el.getAttribute('data-href')); };
ACT['rule-detail'] = function(el){ var k = el.getAttribute('data-key'); var was = !!UI[k];
  Object.keys(UI).forEach(function(x){ if(x.indexOf('rule:')===0) UI[x] = false; });
  UI[k] = !was;
  if(document.querySelector('.modal-back')) refreshModal(); else rerender(); };
ACT['wish'] = function(el, ev){ ev.stopPropagation(); var id = el.getAttribute('data-id'); var i = ST.wishlist.indexOf(id); if(i>=0){ ST.wishlist.splice(i,1); toast('Removed from wishlist'); } else { ST.wishlist.push(id); toast('Saved to wishlist'); } saveState(); rerender(); };
ACT['lang'] = function(){ ST.lang = ST.lang==='en' ? 'bn' : 'en'; saveState(); rerender(); };
ACT['close-modal'] = function(){ closeModal(); };
ACT['open-search'] = function(){ openModal('<form data-submit="search"><label class="label" for="q">Search products</label><div class="row"><input id="q" name="q" class="input" placeholder="Try: polo, panjabi, hoodie" autofocus><button class="btn btn-primary">Search</button></div><div class="row wrap mt12">'+['polo','panjabi','hoodie','chino','oxford'].map(function(s){return '<button type="button" class="chip" data-act="go" data-href="#/search?q='+s+'">'+s+'</button>';}).join('')+'</div></form>', {title:'Search'}); setTimeout(function(){ var q=document.getElementById('q'); if(q) q.focus(); }, 30); };
SUBMIT['search'] = function(f){ var q = f.querySelector('[name=q]').value.trim(); closeModal(true); go('#/search?q='+encodeURIComponent(q)); };
ACT['open-menu'] = function(){
  var row = function(href, label, icon){
    return '<a class="mn-row" href="'+href+'">'+(icon?'<span class="mn-ic">'+ico(icon,18)+'</span>':'')+'<span class="grow">'+esc(label)+'</span>'+ico('right',16)+'</a>';
  };
  var cats = row('#/c/new','New in','sparkle')
    + DB.categories.filter(function(c){return !c.hidden;}).map(function(c){ return row('#/c/'+c.id, t(c.name)); }).join('')
    + row('#/set','Build your own set') + row('#/combo/polo-duo','Sets & combos');
  var quick = '<div class="mn-quick">'
    + '<button type="button" class="mn-q" data-act="open-search">'+ico('search',18)+'<span>Search</span></button>'
    + '<a class="mn-q" href="#/bag">'+ico('bag',18)+'<span>Bag</span></a>'
    + '<a class="mn-q" href="#/account/wishlist">'+ico('heart',18)+'<span>Wishlist</span></a>'
    + '<a class="mn-q" href="#/account">'+ico('user',18)+'<span>Account</span></a>'
    + '</div>';
  var help = '<div class="mn-h">Help</div>'
    + row('#/account','Track my order','truck') + row('#/page/delivery','Delivery','truck')
    + row('#/page/exchange','Exchange & returns','swap') + row('#/page/faq','Questions & answers','info')
    + row('#/page/contact','Contact us','chat');
  var foot = '<div class="mn-foot">'
    + '<a class="btn btn-primary btn-block" href="'+waLink('Hi EXTAS')+'" target="_blank" rel="noopener">'+ico('chat',17)+'Message us on WhatsApp</a>'
    + '<a class="btn btn-block mt8" href="tel:'+esc(DB.hotline)+'">'+ico('phone',16)+'Hotline '+esc(DB.hotline)+'</a>'
    + '<div class="row between mt12" style="align-items:center"><span class="xs muted">10 am – 10 pm, every day</span>'
    + langPill() + '</div></div>';   /* r14: the switch shows its state (03-layout.js) */
  openModal(quick+cats+help+foot, {title:'Menu', flush:true});
};

/* ---------- modal & toast ---------- */
var MODAL = null;
function openModal(html, opts){ opts = opts||{}; MODAL = {html:html, opts:opts}; drawModal(); }
function refreshModal(){ if(MODAL && MODAL.opts.rebuild){ MODAL.html = MODAL.opts.rebuild(); } drawModal(); }
function drawModal(){
  var old = document.querySelector('.modal-back'); if(old) old.remove(); if(!MODAL) return;
  var o = MODAL.opts, d = document.createElement('div'); d.className = 'modal-back';
  d.innerHTML = '<div class="modal'+(o.wide?' wide':'')+(o.cls?' '+o.cls:'')+'" role="dialog" aria-modal="true" aria-label="'+esc(o.title||'Dialog')+'"><div class="modal-hd"><div class="h3" style="font-size:17px">'+esc(o.title||'')+'</div><button class="iconbtn" data-act="close-modal" aria-label="Close">'+ico('close',18)+'</button></div><div class="'+(o.flush?'':'modal-bd')+'">'+MODAL.html+'</div></div>';
  d.addEventListener('click', function(e){ if(e.target===d) closeModal(); });
  document.body.appendChild(d); document.body.style.overflow = 'hidden';
}
function closeModal(silent){ var m = document.querySelector('.modal-back'); if(m) m.remove(); MODAL = null; document.body.style.overflow = ''; }
var toastTimer;
function toast(msg){ var t0 = document.querySelector('.toast'); if(t0) t0.remove(); var d = document.createElement('div'); d.className='toast'; d.setAttribute('role','status'); d.textContent = msg; document.body.appendChild(d); toastArm(d, 2600); }
/* T7 (TA-2): one timer for every toast. A toast with a link ("View bag",
   "Undo") holds while the mouse is on the link or the keyboard is on it
   (WCAG 2.2.1) and starts again when the mouse/focus leaves, with at least
   1.5 s left. A phone tap never hovers and is not :focus-visible, so phone
   timing is unchanged. Every toast helper calls toastArm(d, ms). */
function toastArm(d, ms){
  clearTimeout(toastTimer); d._tEnd = Date.now() + ms; d._tHeld = false;
  toastTimer = setTimeout(function(){ d.remove(); }, ms);
}
(function(){
  function hold(d){ if(d._tHeld || !d.isConnected) return; d._tHeld = true; clearTimeout(toastTimer); d._tLeft = Math.max(0, (d._tEnd || 0) - Date.now()); }
  function resume(d){
    if(!d._tHeld || !d.isConnected || d.matches(':hover') || d.contains(document.activeElement) && document.activeElement.matches(':focus-visible')) return;
    toastArm(d, Math.max(1500, d._tLeft || 0));
  }
  function box(t){ return t && t.closest ? t.closest('.toast') : null; }
  document.addEventListener('pointerover', function(ev){ if(ev.pointerType === 'touch') return; var d = box(ev.target); if(d && d.querySelector('a,button')) hold(d); });
  document.addEventListener('pointerout', function(ev){ if(ev.pointerType === 'touch') return; var d = box(ev.target); if(d && !d.contains(ev.relatedTarget)) setTimeout(function(){ resume(d); }, 0); });
  document.addEventListener('focusin', function(ev){ var d = box(ev.target); if(d && ev.target.matches && ev.target.matches(':focus-visible')) hold(d); });
  document.addEventListener('focusout', function(ev){ var d = box(ev.target); if(d && !d.contains(ev.relatedTarget)) setTimeout(function(){ resume(d); }, 0); });
})();

/* ---------- theme ---------- */
function applyTheme(){ document.documentElement.setAttribute('data-theme', ST.theme); document.documentElement.setAttribute('lang', ST.lang==='bn'?'bn':'en'); }
