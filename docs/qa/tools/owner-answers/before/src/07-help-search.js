/* ================= EXTAS demo — help & policy answers in search (07-help-search.js) =================
   The owner: "If I type 'delivery' in the search bar nothing shows. 'return policy' — nothing."
   Product search only looked at product names, so every help word came back as "No results".

   This file adds a HELP INDEX to search, in two places:
     1. live suggestions under the search box (the Search pop-up): a "Help" group, max 3,
        above the matching products;
     2. the #/search results page: a "Help & policies" block at the top. When only help
        matched, the page shows the answers instead of "No results".

   Nothing in another file is edited. It hooks in by wrapping three globals:
     ACT['open-search']   (02-core.js)     — adds the live-suggestion box to the pop-up
     PAGES.search         (21-category.js) — adds the help block to the results page
     INPUT['hs-suggest']                   — new, draws the suggestions while typing
   Product search itself (srch_run) is untouched: the same products, in the same order.
   The one addition: "polo delivery" used to find nothing because no product name has
   "delivery" in it. When the full query finds no product, the words that matched a help
   answer are taken out and the rest ("polo") is searched as before.

   ---------------------------------------------------------------------------------
   HOW TO ADD OR CHANGE A HELP ANSWER  (owner / developer)
   ---------------------------------------------------------------------------------
   Each row of HELP_INDEX is one answer:
     id        short unique name
     title     what the shopper sees in bold
     icon      one of the shop's icons (truck, swap, cash, ruler, phone, info, lock, doc, box, chat …)
     link      where a tap goes (#/page/delivery …)
     answer    WHERE the one-line answer comes from — never typed here, always read from
               the shop's own content, so it changes when the owner changes a setting:
                 {rule:'delivery'}                 the rule's short text (Rules screen), filled
                                                   with its live settings
                 {rule:'delivery', text:'… ৳{inside} …'}
                                                   a sentence built from the rule's live settings
                 {faq:'How do I know which size'}  the answer of that FAQ question (start of the
                                                   question is enough)
                 {page:'terms', section:'Payment'} the text under that heading of #/page/terms
                 {page:'contact', lede:true}       the grey intro line of a page
               extra options: pick:'tracking' keeps only the sentence with that word,
               sentences:1 keeps the first sentence, text:'Hotline {hotline} · {src}' wraps
               the source text ({src}); {hotline} is the live hotline number.
               A row whose rule is switched off (status not Active) is hidden.
     keywords  words and phrases that find it — English, Bengali, Banglish, common
               misspellings. Matching is whole word / whole phrase, any case, and small
               spelling slips are forgiven ("delivary", "retun", "exchnge", "polisy").
   HELP_WEAK lists words that are too general to decide on their own ("policy"):
   they still find answers, but a more specific word in the same search wins.
   ================================================================================= */

var HELP_INDEX = [
  { id:'delivery', title:'Delivery charge and time', icon:'truck', link:'#/page/delivery',
    answer:{rule:'delivery', text:'Inside Dhaka ৳{inside}, {insideDays} days · Outside Dhaka ৳{outside}, {outsideDays} days · Free over ৳{freeOver}'},
    keywords:['delivery','delivery charge','delivery cost','delivery fee','delivery time','delivery policy','shipping','shipping charge','shipping cost','shipping policy',
      'ship','charge','cost','fee','time','days','how many days','how long','when will i get','free','free delivery','free shipping','courier','courier charge',
      'steadfast','pathao','home delivery','inside dhaka','outside dhaka','dhaka','parcel','delivery koto','delivery charge koto','koto din','koto taka','policy',
      'delivari','delevery','dilivery','delibery','deleviry',
      'ডেলিভারি','ডেলিভারী','ডেলিভারি চার্জ','ডেলিভারি খরচ','ডেলিভারি কত','ডেলিভারি কতদিন','চার্জ','খরচ','কুরিয়ার','কত দিন','কতদিন','কত টাকা','ফ্রি','ফ্রি ডেলিভারি',
      'হোম ডেলিভারি','ঢাকার ভিতরে','ঢাকার বাইরে','শিপিং','পার্সেল']},

  { id:'exchange', title:'Size exchange', icon:'swap', link:'#/page/exchange',
    answer:{rule:'exchange'},
    keywords:['exchange','exchange policy','size exchange','change size','size change','change','swap','replace','replacement','wrong size','size problem',
      'not fit','does not fit','exchange charge','exchange time','how many hours','return','policy','bodlano','bodli','change korbo','exchange korbo',
      'exchang','excange','exchenge','echange','exchnge',
      'এক্সচেঞ্জ','এক্সচেঞ্জ পলিসি','এক্সচেঞ্জ চার্জ','সাইজ পরিবর্তন','সাইজ চেঞ্জ','সাইজ বদল','বদল','বদলানো','পরিবর্তন','চেঞ্জ','পলিসি']},

  { id:'returns', title:'Returns and refunds', icon:'shield', link:'#/page/exchange',
    answer:{rule:'no-return'},
    keywords:['return','returns','return policy','refund','refund policy','refunds','money back','money return','get my money back','return product','return item',
      'exchange','policy','ferot','ferot dibo','taka ferot','retun','retrun','refand','refun','ritarn',
      'রিটার্ন','রিটার্ন পলিসি','রিফান্ড','ফেরত','টাকা ফেরত','ফেরত দিব','পলিসি']},

  { id:'pay', title:'Cash on delivery and ways to pay', icon:'cash', link:'#/page/terms',
    answer:{page:'terms', section:'Payment'},
    keywords:['payment','pay','payment method','payment methods','payment option','ways to pay','how to pay','cod','cash on delivery','cash','bkash','bikash','b kash',
      'nagad','nogod','card','visa','mastercard','debit card','credit card','online payment','mobile banking','paymnt','payement',
      'পেমেন্ট','পেমেন্ট মেথড','বিকাশ','নগদ','কার্ড','ক্যাশ','ক্যাশ অন ডেলিভারি','অনলাইন পেমেন্ট','টাকা কিভাবে দিব']},

  { id:'track', title:'Track my order', icon:'box', link:'#/account/orders',
    answer:{page:'delivery', section:'How it works', pick:'tracking'},
    keywords:['track','track order','track my order','order track','tracking','tracking number','tracking link','order status','where is my order','my order',
      'my orders','parcel status','order kothay','trak','traking',
      'ট্র্যাক','ট্র্যাকিং','অর্ডার ট্র্যাক','অর্ডার কোথায়','অর্ডার স্ট্যাটাস','আমার অর্ডার']},

  { id:'size', title:'Size guide · Find my size', icon:'ruler', link:'#/size-guide',
    answer:{faq:'How do I know which size'},
    keywords:['size','sizes','size chart','size guide','sizing','measurement','measurements','measure','find my size','my size','which size','what size','size help',
      'fit','chest','height weight','size koto','sise','saiz','sizechart',
      'সাইজ','সাইজ চার্ট','সাইজ গাইড','মাপ','কোন সাইজ','মেজারমেন্ট']},

  { id:'order-edit', title:'Change or edit an order', icon:'edit', link:'#/account/orders',
    answer:{rule:'order-edit'},
    keywords:['edit order','change order','order change','modify order','update order','change address','change phone','wrong address','change my order',
      'অর্ডার এডিট','অর্ডার পরিবর্তন','ঠিকানা পরিবর্তন']},

  { id:'refuse', title:'Refusing the parcel at the door', icon:'truck', link:'#/page/delivery',
    answer:{faq:'What if I refuse the parcel'},
    keywords:['refuse','refuse parcel','reject','reject parcel','return parcel','parcel return','not take parcel','dont want parcel','cancel at door',
      'পার্সেল ফেরত','পার্সেল নিব না']},

  { id:'contact', title:'Contact us · WhatsApp and hotline', icon:'phone', link:'#/page/contact',
    answer:{page:'contact', lede:true, sentences:1, text:'Hotline {hotline} · WhatsApp · {src}'},
    keywords:['contact','contact us','phone','phone number','call','hotline','helpline','whatsapp','whats app','email','mail','customer care','customer service',
      'support','number','mobile number','message','talk','contuct','watsapp','whatsap','hotlin',
      'যোগাযোগ','ফোন','হটলাইন','হোয়াটসঅ্যাপ','কল','নাম্বার','নম্বর','কাস্টমার কেয়ার']},

  { id:'faq', title:'Questions and answers', icon:'info', link:'#/page/faq',
    answer:{page:'faq', lede:true, sentences:1},
    keywords:['faq','faqs','question','questions','help','help center','প্রশ্ন','সাহায্য']},

  { id:'shop', title:'Is there a shop to visit?', icon:'home', link:'#/page/faq',
    answer:{faq:'Do you have a shop'},
    keywords:['shop','showroom','outlet','store','physical store','shop address','store address','visit','branch','location','দোকান','শোরুম','আউটলেট']},

  { id:'original', title:'Original branded stock', icon:'check', link:'#/page/faq',
    answer:{faq:'Is this original'},
    keywords:['original','genuine','authentic','fake','copy','original product','অরিজিনাল','আসল','নকল']},

  { id:'colour', title:'Are the colours accurate?', icon:'eye', link:'#/page/faq',
    answer:{faq:'Are the colours on screen'},
    keywords:['colour accurate','color accurate','true colour','true color','real colour','real color','colour same','color same','colour different',
      'color different','same colour','same color','কালার','রং']},

  { id:'hygiene', title:'Boxers and underwear', icon:'info', link:'#/page/exchange',
    answer:{rule:'hygiene'},
    keywords:['boxer exchange','underwear exchange','boxer return','underwear return','hygiene']},

  { id:'eid', title:'Eid delivery cutoff', icon:'clock', link:'#/page/delivery',
    answer:{rule:'festive'},
    keywords:['eid','eid delivery','before eid','ঈদ','ঈদের আগে']},

  { id:'referral', title:'Refer a friend', icon:'gift', link:'#/account',
    answer:{rule:'referral'},
    keywords:['referral','refer','refer friend','referral code','invite','রেফার']},

  { id:'privacy', title:'Privacy', icon:'lock', link:'#/page/privacy',
    answer:{page:'privacy', section:'What we do not do', sentences:1},
    keywords:['privacy','privacy policy','personal data','personal information','my data','delete my data','policy','প্রাইভেসি','গোপনীয়তা']},

  { id:'terms', title:'Terms', icon:'doc', link:'#/page/terms',
    answer:{page:'terms', section:'Orders', sentences:1},
    keywords:['terms','terms and conditions','terms conditions','conditions','tnc','rules','vat','policy','শর্ত','শর্তাবলী','নিয়ম']},

  { id:'story', title:'Our story', icon:'doc', link:'#/page/story',
    answer:{page:'story', lede:true},
    keywords:['about','about us','our story','story','who are you','company','made in bangladesh','আমাদের সম্পর্কে']}
];
var HELP_WEAK = ['policy','policies','rules','rule','charge','cost','fee','time','days','free','number','নিয়ম','পলিসি','চার্জ','খরচ','ফ্রি'];
var HELP_MAX_SUGGEST = 3;   /* help rows in the live suggestions */
var HELP_MAX_PAGE = 4;      /* help cards on the results page */
var HELP_MAX_PRODUCTS = 4;  /* product rows in the live suggestions */

/* ---------------------------------------------------------------------------
   text helpers
   --------------------------------------------------------------------------- */
function hs_norm(s){
  return String(s||'').toLowerCase()
    .replace(/ড়/g,'ড়').replace(/ঢ়/g,'ঢ়').replace(/য়/g,'য়')   /* ড়/ঢ়/য় typed two ways */
    .replace(/[‌‍]/g,'').replace(/['’`\-]/g,'')                                                  /* t-shirt = tshirt, don't = dont */
    .replace(/[^a-z0-9ঀ-৿\s]/g,' ').replace(/\s+/g,' ').trim();
}
function hs_toks(s){ var n = hs_norm(s); return n ? n.split(' ') : []; }
function hs_len(s){ return Array.from(s).length; }
/* edit distance with swapped neighbours counted as one slip */
function hs_dist(a, b, cap){
  a = Array.from(a); b = Array.from(b);
  if(Math.abs(a.length-b.length) > cap) return cap+1;
  var d = [], i, j;
  for(i=0;i<=a.length;i++){ d[i] = [i]; }
  for(j=0;j<=b.length;j++){ d[0][j] = j; }
  for(i=1;i<=a.length;i++){
    for(j=1;j<=b.length;j++){
      var c = a[i-1]===b[j-1] ? 0 : 1;
      d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+c);
      if(i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1]) d[i][j] = Math.min(d[i][j], d[i-2][j-2]+1);
    }
  }
  return d[a.length][b.length];
}
function hs_decode(s){ return String(s).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' '); }
function hs_strip(html){
  return hs_decode(String(html||'').replace(/<\/li>\s*<li>/g,' · ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
function hs_sentences(s){ return String(s||'').split(/(?<=[.!?])\s+/).filter(Boolean); }
function hs_num(v){ return (typeof v==='number' && Math.abs(v)>=1000) ? v.toLocaleString('en-US') : v; }

/* ---------------------------------------------------------------------------
   answers — read from the shop's own content every time (so they follow the settings)
   --------------------------------------------------------------------------- */
function hs_ruleLive(id){ try{ return typeof RULE==='function' ? RULE(id) : null; }catch(e){ return null; } }
function hs_faqFind(start){
  if(typeof PG==='undefined' || !PG.faq || !PG.faq.qa) return null;
  var k = hs_norm(start);
  for(var i=0;i<PG.faq.qa.length;i++) if(hs_norm(PG.faq.qa[i][0]).indexOf(k)===0) return {i:i, q:PG.faq.qa[i][0], a:PG.faq.qa[i][1]};
  return null;
}
function hs_pageLede(slug){
  if(slug==='contact'){
    try{ var m = String(pg_contact()).match(/class="pg-lede">([^<]*)</); return m ? hs_decode(m[1]) : ''; }catch(e){ return ''; }
  }
  return (typeof PG!=='undefined' && PG[slug]) ? String(PG[slug].lede||'') : '';
}
function hs_pageSection(slug, head){
  if(typeof PG==='undefined' || !PG[slug] || !PG[slug].body) return '';
  var body = PG[slug].body, h = '<h2>'+head+'</h2>', i = body.indexOf(h); if(i<0) return '';
  var rest = body.slice(i+h.length), j = rest.indexOf('<h2>');
  return hs_strip(j>=0 ? rest.slice(0,j) : rest);
}
function hs_answer(e){
  var a = e.answer || {}, src = '', r = a.rule ? hs_ruleLive(a.rule) : null;
  if(a.rule && !a.text) src = r ? fillRule(r.short, r) : '';
  else if(a.faq){ var f = hs_faqFind(a.faq); src = f ? f.a : ''; }
  else if(a.page && a.section) src = hs_pageSection(a.page, a.section);
  else if(a.page && a.lede) src = hs_pageLede(a.page);
  if(src && a.pick){ var re = new RegExp(a.pick, 'i'), ss = hs_sentences(src).filter(function(x){ return re.test(x); }); if(ss.length) src = ss.join(' '); }
  if(src && a.sentences) src = hs_sentences(src).slice(0, a.sentences).join(' ');
  if(!a.text) return src;
  return String(a.text).replace(/\{(\w+)\}/g, function(m, k){
    if(k==='src') return src;
    if(k==='hotline') return (typeof hotlineNumber==='function' ? hotlineNumber() : DB.hotline) || m;
    if(r && r.settings && r.settings[k]!==undefined && r.settings[k]!=='') return hs_num(r.settings[k]);
    return m;
  });
}
function hs_live(e){ if(!e.answer || !e.answer.rule) return true; var r = hs_ruleLive(e.answer.rule); return !!r && (!r.status || r.status==='Active'); }

/* ---------------------------------------------------------------------------
   matching
   --------------------------------------------------------------------------- */
var HS_PVOCAB = null, HS_PVOCAB_N = -1;
function hs_productVocab(){
  /* words that are real product words ("polo", "navy") are matched exactly, never "corrected" */
  var n = (DB.products||[]).length; if(HS_PVOCAB && HS_PVOCAB_N===n) return HS_PVOCAB;
  var v = {};
  (DB.products||[]).forEach(function(p){ try{ hs_toks(srch_hay(p)).forEach(function(w){ v[w] = 1; }); }catch(e){} });
  HS_PVOCAB = v; HS_PVOCAB_N = n; return v;
}
function hs_index(){
  var vocab = {}, weak = {};
  HELP_WEAK.forEach(function(w){ hs_toks(w).forEach(function(x){ weak[x] = 1; }); });
  var rows = HELP_INDEX.filter(hs_live).map(function(e){
    var kws = (e.keywords||[]).map(hs_toks).filter(function(k){ return k.length; });
    kws.forEach(function(k){ k.forEach(function(w){ vocab[w] = 1; }); });
    return {e:e, kws:kws};
  });
  return {rows:rows, vocab:vocab, weak:weak};
}
/* 2 = same word, 1 = small slip (or the start of the last word while typing), 0 = no */
function hs_tokEq(q, k, isLast, ix, pv){
  if(q===k) return 2;
  if(ix.vocab[q] || pv[q]) return 0;                 /* a real word of something else */
  var lq = hs_len(q), lk = hs_len(k);
  if(isLast && lq>=4 && lk>lq && k.indexOf(q)===0) return 1;
  if(lq<4 || lk<4 || Math.max(lq,lk)<5) return 0;
  var cap = Math.max(lq,lk)>=8 ? 2 : 1;
  return hs_dist(q, k, cap)<=cap ? 1 : 0;
}
function helpMatch(q){
  var T = hs_toks(q); if(!T.length) return {items:[], used:{}, toks:T};
  var ix = hs_index(), pv = hs_productVocab(), out = [];
  ix.rows.forEach(function(row){
    var best = 0, sum = 0, used = {};
    row.kws.forEach(function(K){
      for(var i=0;i+K.length<=T.length;i++){
        var s = 0, ok = true;
        for(var j=0;j<K.length;j++){
          var v = hs_tokEq(T[i+j], K[j], i+j===T.length-1, ix, pv);
          if(!v){ ok = false; break; }
          s += ix.weak[K[j]] ? v/4 : v;
        }
        if(!ok) continue;
        s += K.length-1;
        for(var u=0;u<K.length;u++) used[i+u] = 1;
        sum += s; if(s>best) best = s;
      }
    });
    if(best>0) out.push({e:row.e, score:best + (sum-best)/10, used:used});
  });
  if(!out.length) return {items:[], used:{}, toks:T};
  out.sort(function(a,b){ return b.score-a.score; });   /* stable: equal scores keep table order */
  var top = out[0].score;
  out = out.filter(function(x){ return x.score >= top*0.5; });
  var used = {}; out.forEach(function(x){ for(var k in x.used) used[k] = 1; });
  return {items:out.map(function(x){ return {e:x.e, answer:hs_answer(x.e)}; }), used:used, toks:T};
}
/* products: exactly the old search; only if that finds nothing, search again without the help words */
function hs_products(q, hm){
  var res = srch_run(q), rest = '';
  if(!res.length && hm && hm.items.length){
    rest = hm.toks.filter(function(w, i){ return !hm.used[i]; }).join(' ');
    if(rest) res = srch_run(rest);
  }
  return {list:res, rest:res.length && rest ? rest : ''};
}

/* ---------------------------------------------------------------------------
   drawing
   --------------------------------------------------------------------------- */
function hs_faqIndexFor(e){ return (e.answer && e.answer.faq && e.link==='#/page/faq') ? hs_faqFind(e.answer.faq) : null; }
function hs_itemHTML(it, cls){
  var e = it.e, f = hs_faqIndexFor(e);
  return '<a class="hs-item'+(cls?' '+cls:'')+'" href="'+esc(e.link)+'" data-act="hs-open" data-href="'+esc(e.link)+'"'+(f?' data-faq="'+f.i+'"':'')+' data-testid="help-'+esc(e.id)+'">'+
    '<span class="hs-ic">'+ico(e.icon||'info',18)+'</span>'+
    '<span class="hs-tx"><b>'+esc(e.title)+'</b>'+(it.answer?'<span class="hs-ans">'+esc(it.answer)+'</span>':'')+'</span>'+
    '<span class="hs-go" aria-hidden="true">'+ico('right',16)+'</span></a>';
}
function hs_suggestHTML(q){
  q = String(q||'').trim(); if(!q) return '';
  var hm = helpMatch(q), pr = hs_products(q, hm), help = hm.items.slice(0, HELP_MAX_SUGGEST), prods = pr.list.slice(0, HELP_MAX_PRODUCTS);
  if(!help.length && !prods.length) return '';
  var h = '';
  if(help.length) h += '<div class="hs-gh">'+esc(t('Help'))+'</div><div class="hs-list" data-testid="suggest-help">'+help.map(function(it){ return hs_itemHTML(it); }).join('')+'</div>';
  if(prods.length){
    var toks = srch_norm(pr.rest || q).split(/\s+/).filter(Boolean);
    h += '<div class="hs-gh">'+esc(t('Products'))+(pr.rest?' <span class="hs-for">for “'+esc(pr.rest)+'”</span>':'')+'</div><div class="hs-list" data-testid="suggest-products">'+prods.map(function(p){
      var col = p.colors.filter(function(c){ var n = srch_norm(COL(c).name); return toks.some(function(tk){ return n.indexOf(tk)>=0; }); })[0] || p.colors[0];
      return '<a class="hs-item hs-prod" href="#/p/'+esc(p.id)+'"><span class="hs-thumb">'+productImg(p, col, {label:false, ratio:'hs-r'})+'</span>'+
        '<span class="hs-tx"><b>'+esc(p.name)+'</b><span class="hs-ans">'+priceHTML(p.price, p.compareAt)+'</span></span><span class="hs-go" aria-hidden="true">'+ico('right',16)+'</span></a>';
    }).join('')+'</div>';
  }
  h += '<button type="submit" class="hs-all">'+ico('search',15)+'<span>See all results for “'+esc(q)+'”</span></button>';
  return h;
}
function hs_blockHTML(items){
  return '<section class="hs-block mt24" data-testid="search-help" aria-labelledby="hs-h"><div class="sec-hd"><h2 class="h2" id="hs-h">Help &amp; policies</h2></div>'+
    '<div class="hs-cards">'+items.map(function(it){ return hs_itemHTML(it, 'hs-card'); }).join('')+'</div></section>';
}

/* ---------------------------------------------------------------------------
   hooks
   --------------------------------------------------------------------------- */
/* run a wrapper on whatever function / object is (or later gets) assigned to obj[key] */
function hs_hook(obj, key, wrap){
  var cur = obj[key], wrapped = cur ? wrap(cur) : cur;
  try{
    Object.defineProperty(obj, key, { configurable:true, enumerable:true,
      get:function(){ return wrapped; },
      set:function(v){ cur = v; wrapped = v ? wrap(v) : v; } });
  }catch(e){ if(cur) obj[key] = wrapped; }
}

/* 1. the Search pop-up: same form, plus a live suggestion box under the input */
var HS_BOX = '<div class="hs-sugg" data-testid="search-suggest" aria-live="polite" hidden></div>';
function hs_addBox(html){
  if(html.indexOf('hs-sugg')>=0 || html.indexOf('data-submit="search"')<0) return html;
  html = html.replace(/<input id="q"/, '<input id="q" data-input="hs-suggest" autocomplete="off" enterkeyhint="search"');
  var i = html.indexOf('<div class="row wrap mt12">');      /* the popular-search chips */
  return i>=0 ? html.slice(0,i)+HS_BOX+html.slice(i) : html.replace(/<\/form>/, HS_BOX+'</form>');
}
hs_hook(ACT, 'open-search', function(orig){
  var f = function(){
    var r = orig.apply(this, arguments);
    try{ if(MODAL && typeof MODAL.html==='string'){ var nh = hs_addBox(MODAL.html); if(nh!==MODAL.html){ MODAL.html = nh; drawModal(); } } }catch(e){ console.warn(e); }
    return r;
  };
  f.hsWrapped = true; return f;
});

/* typing in either search box */
INPUT['hs-suggest'] = function(el){
  var form = el.closest('form'); if(!form) return;
  var box = form.querySelector('.hs-sugg') || (form.nextElementSibling && form.nextElementSibling.classList.contains('hs-sugg') ? form.nextElementSibling : null);
  if(!box) return;
  var q = el.value.trim(), same = el.id==='srch-q' && CUR && CUR.query && (CUR.query.q||'').trim()===q;
  var h = same ? '' : hs_suggestHTML(q);
  box.innerHTML = h; box.hidden = !h;
  form.classList.toggle('hs-on', !!h);
};
/* the search-page box sits outside its form, so its "See all" button submits that form */
document.addEventListener('click', function(ev){
  var b = ev.target.closest && ev.target.closest('.hs-sugg .hs-all'); if(!b) return;
  var box = b.closest('.hs-sugg'), form = box.closest('form') || (box.previousElementSibling && box.previousElementSibling.tagName==='FORM' ? box.previousElementSibling : null);
  if(form && !box.closest('form')){ ev.preventDefault(); if(form.requestSubmit) form.requestSubmit(); else SUBMIT.search(form); }
});

ACT['hs-open'] = function(el){
  var href = el.getAttribute('data-href'), fi = el.getAttribute('data-faq');
  if(fi!==null && fi!==''){ Object.keys(UI).forEach(function(k){ if(k.indexOf('faq:')===0) UI[k] = false; }); UI['faq:'+fi] = true; }
  closeModal(true); go(href);
};

/* 2. the results page */
function hs_searchRender(origRender){
  return function(params, query){
    var html = origRender.apply(this, arguments);
    try{
      var q = String((query && query.q) || '').trim();
      /* the search-page box also gets live suggestions */
      html = html.replace(/<input id="srch-q"/, '<input id="srch-q" data-input="hs-suggest" enterkeyhint="search"');
      html = html.replace(/(<form class="srch-form"[\s\S]*?<\/form>)/, '$1'+HS_BOX);
      if(!q) return html;
      var hm = helpMatch(q); if(!hm.items.length) return html;
      var help = hs_blockHTML(hm.items.slice(0, HELP_MAX_PAGE)), nHelp = Math.min(hm.items.length, HELP_MAX_PAGE);
      var grid = html.indexOf('<div class="grid g4 mt24" data-testid="search-grid">');
      if(grid>=0){
        /* products found by the normal search: help on top, products below, unchanged */
        var n = srch_run(q).length;
        html = html.replace(/<p class="text2">[^<]*found<\/p>/, '<p class="text2">'+plural(nHelp,'help answer')+' · '+plural(n,'product')+' found</p>');
        grid = html.indexOf('<div class="grid g4 mt24" data-testid="search-grid">');
        return html.slice(0,grid)+help+'<div class="sec-hd mt24"><h2 class="h2">Products</h2></div>'+html.slice(grid).replace('class="grid g4 mt24"', 'class="grid g4"');
      }
      /* no product had all the words: show the answers, never "No results" */
      var pr = hs_products(q, hm), empty = html.indexOf('<div class="srch-empty');
      if(empty<0) return html;
      var head = html.slice(0, empty).replace(/<p class="text2">[^<]*found<\/p>/, '<p class="text2">'+plural(nHelp,'help answer')+(pr.list.length?' · '+plural(pr.list.length,'product')+' for “'+esc(pr.rest)+'”':'')+'</p>');
      var tail = '';
      if(pr.list.length){
        var toks = srch_norm(pr.rest).split(/\s+/).filter(Boolean);
        tail = '<div class="sec-hd mt24"><h2 class="h2">Products for “'+esc(pr.rest)+'”</h2></div><div class="grid g4" data-testid="search-grid">'+pr.list.map(function(p){
          var col = p.colors.filter(function(c){ var nn = srch_norm(COL(c).name); return toks.some(function(tk){ return nn.indexOf(tk)>=0; }); })[0];
          return productCard(p, col?{color:col}:{}); }).join('')+'</div>';
      } else {
        var sec = html.indexOf('<section class="section">', empty);
        if(sec>=0) tail = html.slice(sec, html.lastIndexOf('</div>'));
      }
      return head+help+tail+'</div>';
    }catch(e){ console.warn('help search', e); return html; }
  };
}
hs_hook(PAGES, 'search', function(pg){
  if(!pg || typeof pg.render!=='function' || pg.hsWrapped) return pg;
  var w = Object.assign({}, pg); w.render = hs_searchRender(pg.render); w.hsWrapped = true; return w;
});
