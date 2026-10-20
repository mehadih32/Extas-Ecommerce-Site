/* =====================================================================
   96c-layout-builder.js — শিল্পী Shilpi A360-05 with সওদাগর Sawdagor A360-04
   PR 595 · Page layout builder (home + every category page)
   PR 596 · Side canvas — the empty left/right gutters on desktop
   ---------------------------------------------------------------------
   STOREFRONT
     ST.layout      = {v, home:{sections:[…]}, cat:{default:[…], byCat:{<catId>:[…]}}}
     ST.sideCanvas  = {enabled:false, pages:{home:{l:[zones], r:[zones]}, cat:{l:[], r:[]}}}
     · Built-in sections point at today's renderers by id (Batch A's
       HOME_SECTIONS / CAT_SECTIONS when they exist, else the hm_* functions
       of 20-home.js / the three blocks of the category page).
     · When what would be shown is exactly the built-ins in their own order,
       the page's ORIGINAL render is called untouched — byte-for-byte today's
       page. Only a real change (a section moved, off, dated, phone/desktop
       only, or a new section) composes the page from the list.
     · The side canvas is OFF by default; while off it adds nothing to the
       page (no element, no style, no listener work).
   ADMIN
     #/admin/layout          "পেজ সাজান"            (sections, drag/↑↓, on/off, dates, device, preview)
     #/admin/side-canvas     "দুই পাশের জায়গা"       (map, rulers, draw/drag zones, blend, master switch)
     #/preview/side-canvas   owner's approval view at 1440 / 1920, switch untouched
   HOOKS FROM BATCH A (read when present, harmless when absent)
     HOME_SECTIONS / CAT_SECTIONS : ordered [{id, render}] — render() returns
       one full-width block (its own .container).
     #lb-side-l / #lb-side-r : empty gutter boxes on home/category ≥ 1280 —
       only MEASURED here (band top / bottom / gutter width); nothing is
       written into them, the zones live in one absolute layer on <body>.
   v2 (owner 19:53 / 19:59, Note 37): never hide — scale from a 1440 standard size; float mode;
   full blend; per-zone page targeting; 19 motion templates incl. the signature walk-out; AI
   studio link + asset library (no paying twice); launch default + named snapshots (PR 597);
   speed first (idle loading, desktop+mouse only, transform/opacity, paused off-screen, weight
   budgets); admin words English by default, Bengali with ST.adminLang (LB_L / lbL).
   Prefix lb_ (JS), lb- (CSS, r12-zlb.css). No shared file is edited.
   ===================================================================== */

/* ---------- capture this page's own source for the preview frames ---------- */
var LB_SRC = '';
try{ if(!window.LB_INJECT) LB_SRC = '<!doctype html>' + document.documentElement.outerHTML; }catch(e){}

/* ---------- settings (nothing about sizes is typed anywhere else) ---------- */
var LB_CFG = {
  deskMin:1024,        /* the side canvas never shows below this width (phone, tablet) */
  safety:16,           /* a zone always keeps this much clear of the content */
  refGutter:132,       /* the standard: zones are designed at 1440 px, where each side gives 132 px */
  maxScale:1.6,        /* how far a zone may grow on very wide screens (owner can change) */
  minTextW:72,         /* narrower than this (actual px), a zone shows its picture only */
  floatRange:40, floatPeriod:900,   /* float: ± px of drift, and the scroll distance of one up-and-down */
  /* OWNER'S PLACEMENT (22:14 marking, set on his own 1797 × 879 screen): % of the visible window under
     the header (top / height), the gap to the content in px, and the width as % of the side's free space.
     Every other size auto-adjusts from these; any size can be fixed with its own values. */
  vpBase:{w:1797, h:879, top:14.4, height:79.9, gap:17, width:88},
  vpPresets:{owner:{top:14.4, height:79.9, gap:17, width:88}, centred:{top:12.5, height:75, gap:16, width:88}},
  vpSizes:[[1280,720],[1280,800],[1366,768],[1440,900],[1536,864],[1600,900],[1680,1050],[1797,879],[1920,1080],[2560,1440]],
  vpMinW:{figure:40, text:72},
  /* every shop page with side gutters (measured 19 Oct at 1280/1440/1920). Never checkout, thanks or ad landing pages. */
  never:['checkout','thanks','landing'],
  pageTypes:[['home','#/'],['cat','#/c/polos'],['login','#/login'],['bag','#/bag'],['product','#/p/essential-pique-polo'],['search','#/search?q=polo'],['combo','#/combo/polo-duo'],['ca-hub','#/combos'],['set','#/set'],
    ['journal','#/journal'],['page','#/page/delivery'],['size-guide','#/size-guide'],['account','#/account'],['order','#/order/EX-1038'],['exchange','#/exchange/EX-1038'],['notfound','#/not-a-page']],
  pagesOnDefault:{home:true, cat:true},
  mtMax:24,            /* frames in one motion sequence */
  budget:{image:150*1024, video:1.5*1024*1024, page:3*1024*1024, markup:400*1024},
  aiCost:{pose:9, video:95},        /* demo · simulated cost (৳) per pose image / per short clip */
  edge:8,              /* breathing room at the screen edge for 'outer' zones, when the gutter allows */
  stickyGap:16,        /* a sticky zone rests this far under the sticky header */
  imageMaxKB:700,      /* an uploaded side image is kept in this browser; keep it light */
  previewPhone:[390, 844], previewDesk:[1280, 820],
  mapWidths:[1280, 1366, 1440, 1536, 1920],
  approveWidths:[[1440, 900], [1920, 1080]]
};

/* ---------- routes + admin menu ---------- */
(function(){
  var add = function(re, name){ try{ if(!ROUTES.some(function(r){ return r[1]===name; })) ROUTES.push([re, name]); }catch(e){} };
  add(/^\/admin\/layout$/, 'lb-admin');
  add(/^\/admin\/side-canvas$/, 'lb-side');
  add(/^\/preview\/side-canvas$/, 'lb-approve');
  try{ if(typeof zo_link==='function'){ zo_link([{toString:function(){ return lbL('navLayout'); }},'#/admin/layout','grid']); zo_link([{toString:function(){ return lbL('navSide'); }},'#/admin/side-canvas','layers']); } }catch(e){}
})();

/* =====================================================================
   1. SMALL HELPERS
   ===================================================================== */
function lb_today(){
  if(typeof bfToday==='function'){ try{ return bfToday(); }catch(e){} }
  try{ var s = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dhaka', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date()); if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; }catch(e){}
  var d = new Date(Date.now() + 6*3600000); return d.getUTCFullYear()+'-'+('0'+(d.getUTCMonth()+1)).slice(-2)+'-'+('0'+d.getUTCDate()).slice(-2);
}
function lb_dayAdd(day, n){ var d = new Date(day+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
/* whole Dhaka days: live from 00:00 on the start day to 23:59 on the end day */
function lb_dateOk(x, today){
  today = today || lb_today();
  if(x.start && today < x.start) return false;
  if(x.end && today > x.end) return false;
  return true;
}
function lb_isDesk(){ try{ return typeof deskOn==='function' ? deskOn() : window.matchMedia('(min-width:'+LB_CFG.deskMin+'px)').matches; }catch(e){ return false; } }
function lb_devOk(dev){ if(!dev || dev==='both') return true; return dev==='desktop' ? lb_isDesk() : !lb_isDesk(); }
function lb_clone(o){ return JSON.parse(JSON.stringify(o)); }
function lb_id(p){ return (p||'s')+'-'+Math.random().toString(36).slice(2,8); }
function lb_num(v, d){ var n = parseFloat(String(v).replace(/[^\d.\-]/g,'')); return isNaN(n) ? (d||0) : n; }
function lb_bnNum(n){ return String(n).replace(/\d/g, function(d){ return '০১২৩৪৫৬৭৮৯'[d]; }); }
function lb_bnDate(day){
  if(!day) return '';
  var m = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
  var p = day.split('-'); return lb_bnNum(parseInt(p[2],10))+' '+m[parseInt(p[1],10)-1];
}
function lb_reduced(){ try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } }
function lb_fineMouse(){ try{ return window.matchMedia('(hover:hover) and (pointer:fine)').matches; }catch(e){ return true; } }
function lb_visibleProducts(){ return DB.products.filter(function(p){ return !(CAT(p.cat)||{}).hidden; }); }

/* richText: only plain formatting survives — no scripts, no styles, no events, no frames */
var LB_SAFE_TAGS = {P:1, BR:1, B:1, STRONG:1, I:1, EM:1, U:1, UL:1, OL:1, LI:1, H3:1, H4:1, A:1, SPAN:1, SMALL:1, BLOCKQUOTE:1};
var LB_DROP_TAGS = {SCRIPT:1, STYLE:1, IFRAME:1, OBJECT:1, EMBED:1, LINK:1, META:1, TEMPLATE:1, SVG:1, MATH:1, FORM:1, INPUT:1, BUTTON:1, TEXTAREA:1, SELECT:1, NOSCRIPT:1, BASE:1};
function lb_safeHref(h){ h = String(h||'').trim(); return /^(#\/|https:\/\/|http:\/\/|mailto:|tel:)/i.test(h) ? h : ''; }
function lb_safeHTML(html){
  var out = '';
  try{
    var tpl = document.createElement('template'); tpl.innerHTML = String(html||'');
    var walk = function(node){
      var s = '';
      for(var c = node.firstChild; c; c = c.nextSibling){
        if(c.nodeType===3){ s += esc(c.textContent); continue; }
        if(c.nodeType!==1) continue;
        var tg = c.tagName.toUpperCase();
        if(LB_DROP_TAGS[tg]) continue;
        if(!LB_SAFE_TAGS[tg]){ s += walk(c); continue; }       /* unknown tag: keep its text only */
        var t = tg.toLowerCase();
        if(t==='a'){ var h = lb_safeHref(c.getAttribute('href')); s += h ? '<a href="'+esc(h)+'"'+(/^https?:/i.test(h)?' target="_blank" rel="noopener nofollow"':'')+'>'+walk(c)+'</a>' : walk(c); continue; }
        if(t==='br'){ s += '<br>'; continue; }
        s += '<'+t+'>'+walk(c)+'</'+t+'>';
      }
      return s;
    };
    out = walk(tpl.content);
  }catch(e){ out = esc(html); }
  return out;
}

/* ---------- admin words, in one place: English by default, Bengali with ST.adminLang = 'bn' (PR 503) ---------- */
var LB_L = {
  navLayout:['Page layout','পেজ সাজান'], navSide:['Side canvas','দুই পাশের জায়গা'],
  layoutEyebrow:['PR 595 · Shop pages','PR 595 · দোকানের পেজ'], layoutTitle:['Page layout','পেজ সাজান'],
  layoutLead:['Add, move, switch off or edit the sections of the home page and every category page. Each section has its own on/off, dates and phone/desktop choice. Changes show in the shop at once.',
    'হোম পেজ আর প্রতিটি ক্যাটাগরি পেজের অংশগুলো এখান থেকে যোগ করুন, সরান, বন্ধ করুন বা বদলান। প্রতিটি অংশের চালু/বন্ধ, তারিখ আর ফোন/ডেস্কটপ আলাদা। বদলালে সাথে সাথে দোকানে দেখা যায়।'],
  example:['Example: new offer above the reviews','উদাহরণ: রিভিউর উপরে নতুন অফার'],
  pageHome:['Home page','হোম পেজ'], pageAllCats:['All categories (default)','সব ক্যাটাগরি (ডিফল্ট)'], whichPage:['Which page','কোন পেজ'],
  sections:['Sections (top to bottom)','অংশগুলো (উপর থেকে নিচে)'], dragHint:['Drag, or use ↑ ↓','টেনে বা ↑↓ দিয়ে সাজান'],
  livePreview:['Live preview','লাইভ প্রিভিউ'], phone:['Phone','ফোন'], desktop:['Desktop','ডেস্কটপ'], both:['Both','দুটোই'],
  previewNote:['The preview is only for looking — clicking inside changes nothing.','প্রিভিউ শুধু দেখার জন্য — এখানে ক্লিক করলে কিছু বদলায় না।'],
  phonePv:['Phone preview','ফোনের প্রিভিউ'], deskPv:['Desktop preview','ডেস্কটপের প্রিভিউ'],
  catDefaultNow:['shows the default layout now','এখন ডিফল্ট সাজ দেখাচ্ছে'],
  catDefaultNote:['This page uses the layout set for all categories. To give only this category its own sections or boxes, press the button below.','সব ক্যাটাগরির জন্য যে সাজ ঠিক করা আছে, এই পেজও সেটাই দেখায়। শুধু এই ক্যাটাগরির জন্য আলাদা অংশ বা বক্স চাইলে নিচের বোতাম চাপুন।'],
  ownLayout:['Give this category its own layout','এই ক্যাটাগরি আলাদা করে সাজান'], backToDefault:['Back to the default layout','ডিফল্ট সাজে ফেরত যান'],
  confirmUnown:['Drop this category’s own layout and use the default? (its own sections stop showing)','এই ক্যাটাগরির আলাদা সাজ বাদ দিয়ে ডিফল্টে ফেরত যাবেন? (আলাদা অংশগুলো আর দেখাবে না)'],
  addSection:['Add a section','নতুন অংশ যোগ করুন'], listLabel:['Page sections, top to bottom','পেজের অংশগুলো, উপর থেকে নিচে'],
  hiddenSecs:['Removed sections','সরানো অংশ'], neverDeleted:['never deleted, can be brought back','কখনো মুছে যায় না, ফেরত আনা যায়'], restore:['Bring back','ফেরত আনুন'],
  moveUp:['Move up','উপরে নিন'], moveDown:['Move down','নিচে নিন'], dragTo:['Drag to move','টেনে সরান'],
  on:['On','চালু'], off:['Off','বন্ধ'], edit:['Edit','বদলান'], copy:['Copy','কপি'], remove:['Remove','সরান'], onceOnly:['This section appears once on the page','এই অংশ পেজে একবারই থাকে'],
  example1:['Example','উদাহরণ'], builtIn:['Built in','আগে থেকে আছে'], startsOn:['Starts','শুরু হবে'], endedOn:['Ended','শেষ হয়েছে'], today:['today','আজ'], keepsOn:['ongoing','চলবে'],
  devBoth:['Phone and desktop','ফোন ও ডেস্কটপ'], devPhone:['Phone only','শুধু ফোন'], devDesktop:['Desktop only','শুধু ডেস্কটপ'],
  movedUp:['moved up','উপরে সরানো হলো'], movedDown:['moved down','নিচে সরানো হলো'], removedToast:['removed — bring it back from "Removed sections"','সরানো হলো — নিচের "সরানো অংশ" থেকে ফেরত আনা যায়'],
  copied:['Copied','কপি করা হলো'], orderKept:['New order saved','নতুন ক্রম রাখা হলো'], copySuffix:['(copy)','(কপি)'],
  exampleToast:['"New offer" now sits right above the reviews, for 7 days from today','"নতুন অফার" এখন রিভিউর ঠিক উপরে, আজ থেকে ৭ দিন'],
  whatKind:['New section — what kind?','নতুন অংশ — কোন ধরনের?'], sectionType:['Section type','অংশের ধরন'], whereGoes:['Where it goes','কোথায় বসবে'],
  above:['— above this','— এর উপরে'], atEnd:['At the very end','সবার শেষে'], cancel:['Cancel','বাতিল'], addGo:['Add and set up','যোগ করে সাজান'],
  newSec:['New section','নতুন অংশ'], editing:['Edit','বদলান'], builtInNote:['This is one of the shop’s own sections — its content changes on its own page. Here you set on/off, dates and device.','এটি দোকানের আগের অংশ — ভেতরের জিনিস নিজের পেজ থেকে বদলায়। এখানে চালু/বন্ধ, তারিখ আর ডিভাইস ঠিক করা যায়।'],
  secName:['Section name (only for you)','অংশের নাম (শুধু আপনার জন্য)'], startDay:['Start day','শুরুর দিন'], endDay:['End day','শেষের দিন'],
  dayNote:['Whole days in Bangladesh time: from 12:00 am on the start day to 11:59 pm on the end day. Empty = always.','পুরো দিন ধরে, বাংলাদেশ সময়ে: শুরুর দিন রাত ১২টা থেকে শেষের দিন রাত ১১:৫৯ পর্যন্ত। ফাঁকা রাখলে সবসময়।'],
  whereShow:['Where it shows','কোথায় দেখাবে'], save:['Save','রাখুন'], savedLive:['Saved — showing in the shop','রাখা হলো — দোকানে দেখা যাচ্ছে'], endBeforeStart:['The end day cannot be before the start day','শেষের দিন শুরুর দিনের আগে হতে পারে না'],
  fEyebrow:['Small line above','ছোট উপরের লাইন'], fTitle:['Headline (keep it short — more than two lines gets cut)','শিরোনাম (ছোট রাখুন — দুই লাইনের বেশি হলে কাটা পড়ে)'], fSub:['Short description','ছোট বিবরণ'], fCta:['Button text','বোতামের লেখা'],
  fHref:['Where the button goes (e.g. #/c/polos)','বোতাম কোথায় নেবে (যেমন #/c/polos)'], fTone:['Colour','রং'], fProduct:['Picture product','ছবির প্রোডাক্ট'], fColor:['Picture colour','ছবির রং'], noPic:['No picture','ছবি ছাড়া'],
  fText:['Offer text (one line)','অফারের লেখা (এক লাইনে)'], fLink:['Link text','লিংকের লেখা'], fGo:['Where it goes','কোথায় নেবে'], fTitle2:['Title','শিরোনাম'], fFrom:['Products from','প্রোডাক্ট কোথা থেকে'],
  fCat:['Category','ক্যাটাগরি'], fTag:['Tag','ট্যাগ'], fPick:['Pick products','প্রোডাক্ট বাছাই'], fLimit:['How many','কয়টা দেখাবে'], fMore:['"See all" text (empty = none)','"সব দেখুন" লেখা (না চাইলে ফাঁকা)'], fMoreHref:['Where "See all" goes','"সব দেখুন" কোথায় নেবে'],
  srcCat:['From one category','একটি ক্যাটাগরি থেকে'], srcTag:['From a tag (bestseller / new / sale)','ট্যাগ থেকে (বেস্টসেলার / নতুন / সেল)'], srcManual:['Picked by hand','নিজে বাছাই করে'],
  tBest:['Bestseller','বেস্টসেলার'], tNew:['New','নতুন'], tSale:['On sale','সেলে আছে'],
  toneBrand:['Brand colour','ব্র্যান্ড রং'], toneDark:['Dark','গাঢ়'], toneLight:['Light','হালকা'], toneSale:['Sale (red)','সেল (লাল)'],
  fComboFrom:['Combos from','কম্বো কোথা থেকে'], comboFixed:['Ready sets (combos)','তৈরি সেট (কম্বো)'], comboAuto:['Auto combo rule','অটো কম্বো রুল'], fWhichSets:['Which sets (none picked = all live sets)','কোন সেটগুলো (কিছু না বাছলে সব চালু সেট)'],
  fRule:['Which rule','কোন রুল'], firstRule:['First live rule','প্রথম চালু রুল'], fCats:['Which categories (none picked = all)','কোন ক্যাটাগরি (কিছু না বাছলে সব)'], fReviews:['How many reviews','কয়টা রিভিউ'], fPosts:['How many posts','কয়টা লেখা'],
  fRtTitle:['Title (optional)','শিরোনাম (ঐচ্ছিক)'], fRt:['Text — bold, lists and links work; scripts and styles are removed','লেখা — বোল্ড, লিস্ট, লিংক চলবে; স্ক্রিপ্ট/স্টাইল বাদ যাবে'], fSpPhone:['Gap on phone (px)','ফোনে ফাঁক (px)'], fSpDesk:['Gap on desktop (px)','ডেস্কটপে ফাঁক (px)'],
  /* side canvas */
  sideEyebrow:['PR 596 · Both sides of the desktop page','PR 596 · ডেস্কটপের দুই পাশ'], sideTitle:['Side canvas','দুই পাশের জায়গা'],
  sideLead:['On big screens the page has empty space on the left and right (from under the top banner to the footer). Make zones of your own size there for banners, ads, popups, animations or pictures that melt into the page colour. Each zone has a standard size (designed at 1440 px) and scales up or down to the space every screen gives — it never hides and never covers the content. Phones and tablets never load it.',
    'বড় স্ক্রিনে পেজের বাঁ আর ডান পাশে যে খালি জায়গা থাকে (উপরের ব্যানারের নিচ থেকে ফুটার পর্যন্ত), সেখানে নিজের মাপে জোন বানিয়ে ব্যানার, বিজ্ঞাপন, পপআপ, অ্যানিমেশন বা পেজের রঙে মিশে যাওয়া ছবি বসান। প্রতিটা জোনের একটা স্ট্যান্ডার্ড মাপ (১৪৪০ px-এ বানানো) — প্রতিটা স্ক্রিনের জায়গা অনুযায়ী বড়-ছোট হয়, কখনো লুকায় না, কখনো কনটেন্টের উপর পড়ে না। ফোন আর ট্যাবে লোডই হয় না।'],
  masterTitle:['Side canvas on in the shop','দুই পাশের জায়গা দোকানে চালু'], masterNote:['Off = exactly today’s look. The owner approved it on 19 Oct; switch on when ready.','বন্ধ = হুবহু আজকের চেহারা। মালিক ১৯ অক্টোবর অনুমোদন দিয়েছেন; প্রস্তুত হলে চালু করুন।'],
  approvalPv:['Approval preview','মালিকের অনুমোদনের প্রিভিউ'], confirmOn:['Switch the side canvas on in the shop?','দুই পাশের জায়গা দোকানে চালু করবেন?'],
  turnedOn:['On — showing on big screens','চালু হলো — বড় স্ক্রিনে দেখা যাবে'], turnedOff:['Off — the shop looks as before','বন্ধ — দোকান আগের মতো'],
  previewPage:['Preview page','কোন পেজে দেখবেন'], screenWidth:['Screen width','স্ক্রিনের চওড়া'], thisScreen:['This screen','এই স্ক্রিন'], unit:['Unit','মাপের একক'], inch:['inch','ইঞ্চি'],
  tabZones:['Zones','জোন'], tabLibrary:['AI library','AI লাইব্রেরি'], measuring:['Measuring…','মাপ নেওয়া হচ্ছে…'],
  mapInfo:['On a {w} px screen each side has: left {l} px · right {r} px free. Scale at this width: {k}× (designed at 1440 px).','{w} px স্ক্রিনে প্রতিটি পাশে খালি: বাঁয়ে {l} px · ডানে {r} px। এই চওড়ায় মাপ: {k}× (১৪৪০ px-এ বানানো)।'],
  mapHelp:['Striped = the free sides. Drag in a free side to draw a zone, drag a zone to move it, drag its bottom or side edge to resize. Numbers are the standard size at 1440 px.','দাগ দেওয়া জায়গা = খালি পাশ। খালি পাশে টেনে জোন আঁকুন, জোন টেনে সরান, নিচের বা পাশের কিনারা টেনে মাপ বদলান। সংখ্যাগুলো ১৪৪০ px-এর স্ট্যান্ডার্ড মাপ।'],
  fullBand:['Full-width band — no zone sits here','পুরো চওড়া অংশ — এখানে জোন বসে না'],
  zones:['Zones','জোনগুলো'], left:['Left','বাঁয়ে'], right:['Right','ডানে'], leftSide:['left side','বাঁ পাশ'], rightSide:['right side','ডান পাশ'], L:['L','বাঁ'], R:['R','ডান'],
  noZones:['No zones yet — draw one in a free side on the map.','এখনো কোনো জোন নেই — ম্যাপে খালি পাশে টেনে আঁকুন।'], hiddenZones:['Removed zones','সরানো জোন'],
  zoneOn:['Zone on','জোন চালু'], zoneOff:['Zone off','জোন বন্ধ'], removeZone:['Remove zone','জোন সরান'], zoneName:['Name (only for you)','নাম (শুধু আপনার জন্য)'],
  fromTop:['From top (px)','উপর থেকে (px)'], width:['Width (px)','চওড়া (px)'], height:['Height (px)','উঁচু (px)'],
  scaleHere:['Scale at this width: {k}× → {w} × {h} px','এই চওড়ায় মাপ: {k}× → {w} × {h} px'], imageOnly:['too narrow for text here — shows the picture only','এখানে লেখার জায়গা নেই — শুধু ছবি দেখাবে'],
  movedNote:['moved down to stay clear','জায়গা রাখতে একটু নিচে সরানো'],
  inSide:['Where in the side','পাশের মধ্যে কোথায়'], alOuter:['At the screen edge','স্ক্রিনের ধারে'], alCenter:['Middle','মাঝে'], alInner:['Towards the content','কনটেন্টের দিকে'],
  onScroll:['While scrolling','স্ক্রল করলে'], mSticky:['Stays with you','সাথে সাথে থাকে'], mAnchored:['Stays in place','এক জায়গায় থাকে'], mFloat:['Stays + gentle float','সাথে থাকে + আস্তে ভাসে'],
  floatRange:['Float range (± px)','কতটা ভাসবে (± px)'],
  look:['Look','চেহারা'], sCard:['Card','কার্ড'], sFull:['Full blend (no frame, no edge)','পুরো মিশে যাওয়া (ফ্রেম/কিনারা নেই)'],
  pages:['Pages','কোন পেজে'], tHome:['Home','হোম'], catsAll:['All categories','সব ক্যাটাগরি'], catsSome:['Chosen categories','বাছাই করা ক্যাটাগরি'], catsNone:['No categories','কোনো ক্যাটাগরি নয়'], desktopOnly:['Desktop only — phones and tablets never load it.','শুধু ডেস্কটপ — ফোন আর ট্যাবে লোডই হয় না।'],
  holds:['What it holds','কী থাকবে'],
  zBanner:['Banner','ব্যানার'], zAd:['House ad','নিজের বিজ্ঞাপন'], zPopup:['Popup','পপআপ'], zMotion:['Animation template','অ্যানিমেশন টেমপ্লেট'], zFigure:['Model figure','মডেল ফিগার'], zImage:['Picture / GIF','ছবি / GIF'], zVideo:['Short video','ছোট ভিডিও'],
  adOf:['Ad for','কিসের বিজ্ঞাপন'], adProduct:['Product','প্রোডাক্ট'], adCombo:['Combo','কম্বো'], adCat:['Category','ক্যাটাগরি'], which:['Which one','কোনটা'], smallLabel:['Small label','ছোট লেবেল'],
  popTeaser:['Text in the zone','জোনে যা লেখা থাকবে'], popWhen:['When the popup opens','পপআপ কখন খুলবে'], popView:['When the zone is seen','জোন দেখা গেলে'], popTime:['After some time on the page','পেজে কিছুক্ষণ থাকলে'], popClick:['Only on click','শুধু ক্লিক করলে'],
  afterSec:['After how many seconds','কত সেকেন্ড পর'], howOften:['How often per shopper','একজনকে কতবার'], fSession:['Once per visit','প্রতি ভিজিটে একবার'], fDay:['Once a day','দিনে একবার'], fWeek:['Once a week','সপ্তাহে একবার'],
  popTitle:['Popup headline','পপআপের শিরোনাম'], popText:['Popup text','পপআপের লেখা'], popPic:['Popup picture','পপআপের ছবি'],
  cTop:['Top colour','উপরের রং'], cBottom:['Bottom colour','নিচের রং'], cShoes:['Shoe colour','জুতোর রং'], entrance:['Slow entrance animation','ধীরে বেরিয়ে আসার অ্যানিমেশন'],
  reducedNote:['Visitors who asked their phone/computer for less motion see a still picture.','যাঁরা "কম নড়াচড়া" চালু রেখেছেন, তাঁরা অ্যানিমেশন ছাড়া স্থির ছবি দেখবেন।'],
  imgUpload:['Picture or GIF (PNG, JPG, WebP, GIF — up to 150 KB)','ছবি বা GIF (PNG, JPG, WebP, GIF — ১৫০ KB পর্যন্ত)'], vidUpload:['Short loop (MP4 or WebM, muted — up to 1.5 MB)','ছোট লুপ (MP4 বা WebM, শব্দ ছাড়া — ১.৫ MB পর্যন্ত)'],
  posterUpload:['Poster picture shown first (up to 150 KB)','আগে দেখানোর পোস্টার ছবি (১৫০ KB পর্যন্ত)'], altText:['Describe the picture (for people who cannot see it)','ছবির বর্ণনা (যারা দেখতে পান না তাদের জন্য)'], clickTo:['Where a click goes (optional)','ক্লিক করলে কোথায় নেবে (ঐচ্ছিক)'],
  picSet:['Picture added','ছবি বসানো হলো'], vidSet:['Video added','ভিডিও বসানো হলো'], tooBig:['Too big — keep it within {n}','বড় হয়ে গেছে — {n}-এর মধ্যে রাখুন'],
  blend:['Melt into the page colour','পেজের রঙে মিশে যাওয়া'], blendColor:['Blend colour','মেশানোর রং'], auto:['Auto (page colour)','অটো (পেজের রং)'], ownColor:['Own colour','নিজের রং'],
  fadeTo:['Edges fade','কোন দিকে মিলিয়ে যাবে'], fNone:['No','না'], fLeft:['Left','বাঁ দিকে'], fRight:['Right','ডান দিকে'], fBoth:['Both','দুই দিকে'], strength:['How much','কতটা মিশবে'],
  realSize:['At real size, on the page colour','আসল মাপে দেখুন (পেজের রঙের উপর)'], backList:['Back to all zones','সব জোনের তালিকায় ফিরুন'],
  newZoneToast:['New zone — set its size and content on the right','নতুন জোন — ডানের ঘরে মাপ আর কী থাকবে ঠিক করুন'], zoneRemoved:['Zone removed — bring it back from the list','জোন সরানো হলো — তালিকার নিচ থেকে ফেরত আনা যায়'],
  stOk:['Showing','দেখা যাবে'], stOff:['Off','বন্ধ'], stDate:['Outside its dates','তারিখের বাইরে'], stPage:['Not on this page','এই পেজে নয়'], stBudget:['Over budget — blocked','ওজন বেশি — আটকানো'],
  weight:['Weight','ওজন'], withinBudget:['within budget','সীমার মধ্যে'], overBudget:['Over budget — this zone will not publish until it is lighter','ওজন বেশি — হালকা না করা পর্যন্ত এই জোন দোকানে যাবে না'],
  needPoster:['add a poster picture','পোস্টার ছবি দিন'],
  /* motion */
  template:['Template','টেমপ্লেট'], suggested:['Suggested','পরামর্শ'], products:['Products','প্রোডাক্ট'], pickProducts:['Pick products','প্রোডাক্ট বাছুন'],
  srcFrom:['Take products from','প্রোডাক্ট কোথা থেকে'], srcKCat:['A category','একটা ক্যাটাগরি'], srcKSub:['A sub-category','একটা সাব-ক্যাটাগরি'], srcKRule:['Every colour of…','সব রঙ…'], srcKManual:['Pick by hand','নিজে বাছাই'], srcKCombo:['Combos','কম্বো'],
  allColours:['Every colour of each','প্রতিটার সব রং'], firstColour:['First colour only','শুধু প্রথম রং'], speed:['Speed (seconds per frame)','গতি (প্রতি ছবিতে কত সেকেন্ড)'],
  order:['Order','ক্রম'], oAs:['As picked','যেভাবে বাছা'], oPrice:['Price, low to high','দাম, কম থেকে বেশি'], oShuffle:['Mixed','মিশিয়ে'],
  sequence:['Sequence: {n} frames','ক্রম: {n}টা ছবি'], useSuggested:['Use the suggested template','পরামর্শের টেমপ্লেট নিন'], autoSize:['Size for this template','এই টেমপ্লেটের মাপ নিন'],
  addPick:['Add','যোগ'], aiBtn:['Make poses / video with AI','AI দিয়ে পোজ/ভিডিও বানান'], aiGuide:['AI guidance','AI নির্দেশিকা'],
  /* AI studio + library */
  aiStudio:['AI studio — poses and short video','AI স্টুডিও — পোজ আর ছোট ভিডিও'], aiFor:['For these products','এই প্রোডাক্টগুলোর জন্য'], aiKind:['Make','কী বানাবেন'], aiPoses:['Pose set (S24 photoshoot)','পোজ সেট (S24 ফটোশুট)'], aiVideo:['Short video (S25)','ছোট ভিডিও (S25)'],
  aiReuse:['Use the earlier one — no token cost','আগেরটা ব্যবহার করুন — টোকেন খরচ লাগবে না'], aiFound:['A matching asset is already in the library (same template, products and colours).','লাইব্রেরিতে মিলে যাওয়া একটা আগেই আছে (একই টেমপ্লেট, প্রোডাক্ট আর রং)।'],
  aiNew:['Make a new one anyway','তবুও নতুন বানান'], aiMake:['Make it','বানান'], aiSim:['Demo · simulated — made from our drawings; the real studio renders real poses or a short clip.','ডেমো · সিমুলেটেড — আমাদের ড্রয়িং থেকে বানানো; আসল স্টুডিও আসল পোজ বা ছোট ক্লিপ বানাবে।'],
  aiConfirmNew:['Make a new one and pay again? A matching asset already exists.','আবার টাকা দিয়ে নতুন বানাবেন? মিলে যাওয়া একটা আগেই আছে।'], aiMade:['Made and saved in the AI library','বানানো হলো, AI লাইব্রেরিতে রাখা হলো'], aiReused:['Reused from the library — no cost','লাইব্রেরি থেকে নেওয়া হলো — খরচ নেই'],
  aiOpen:['Open the AI section','AI সেকশন খুলুন'], aiWorking:['Making… (simulated)','বানানো হচ্ছে… (সিমুলেটেড)'], estCost:['Estimated cost','আনুমানিক খরচ'],
  libTitle:['AI asset library','AI অ্যাসেট লাইব্রেরি'], libLead:['Every pose set and video made for a product, style, colour and template is kept here, so the same thing is never paid for twice.','প্রতিটা প্রোডাক্ট, স্টাইল, রং আর টেমপ্লেটের জন্য বানানো পোজ সেট আর ভিডিও এখানে থাকে — একই জিনিসের জন্য দুবার টাকা দিতে হয় না।'],
  libEmpty:['Nothing yet — make poses or a video from a zone.','এখনো কিছু নেই — কোনো জোন থেকে পোজ বা ভিডিও বানান।'], allTemplates:['All templates','সব টেমপ্লেট'], allProducts:['All products','সব প্রোডাক্ট'], allCats:['All categories','সব ক্যাটাগরি'],
  uses:['Uses','ব্যবহার'], cost:['Cost','খরচ'], saved:['Saved by reuse','আবার ব্যবহারে বাঁচানো'], size:['Size','আকার'], made:['Made','বানানো'], useInZone:['Use in the selected zone','বাছাই করা জোনে ব্যবহার করুন'], pickZoneFirst:['Pick a zone first (Zones tab)','আগে একটা জোন বাছুন (জোন ট্যাব)'],
  libTotal:['{n} assets · spent {c} · saved {s} by reuse','{n}টা অ্যাসেট · খরচ {c} · আবার ব্যবহারে বাঁচানো {s}'], mediaLib:['AI media library','AI মিডিয়া লাইব্রেরি'],
  guideTitle:['AI guidance — walk-out template','AI নির্দেশিকা — হেঁটে বেরিয়ে আসা'], guideFile:['Full skill file','পুরো নির্দেশিকা ফাইল'],
  /* speed */
  speedTitle:['Speed','গতি'], speedLead:['The side canvas loads only after the page is shown, only on desktops with a mouse, animates with transform/opacity, and pauses off-screen.','দুই পাশের জায়গা পেজ দেখানোর পরে, শুধু মাউসওয়ালা ডেস্কটপে লোড হয়; শুধু transform/opacity দিয়ে নড়ে; স্ক্রিনের বাইরে গেলে থেমে থাকে।'],
  pageWeight:['This page: {n} of {b}','এই পেজ: {b}-এর মধ্যে {n}'], measureNow:['Measure now (1440)','এখন মাপুন (১৪৪০)'], labTest:['Lab test (Playwright, 1440)','ল্যাব টেস্ট (Playwright, ১৪৪০)'],
  lcp:['LCP change','LCP পার্থক্য'], cls:['Layout shift (CLS)','লেআউট সরা (CLS)'], longTask:['Longest task from the canvas','ক্যানভাসের সবচেয়ে লম্বা কাজ'], slowFrames:['Slow frames while scrolling','স্ক্রলে ধীর ফ্রেম'], layoutMs:['Canvas layout time','ক্যানভাস বসাতে সময়'],
  pass:['pass','ঠিক আছে'], fail:['too slow','ধীর'], withoutCanvas:['page without the canvas:','ক্যানভাস ছাড়া পেজ:'],
  liveNote:['Measured now, on this computer, with the admin open (other previews running) — the shop’s own numbers are the lab test below.','এখনই, এই কম্পিউটারে, অ্যাডমিন খোলা রেখে মাপা (অন্য প্রিভিউও চলছে) — দোকানের আসল ফল নিচের ল্যাব টেস্টে।'],
  pageTask:['Longest task of the page itself','পেজের নিজের সবচেয়ে লম্বা কাজ'],
  /* approval */
  apEyebrow:['PR 596 · For the owner’s approval','PR 596 · মালিকের অনুমোদনের জন্য'], apTitle:['Side canvas — how it will look','দুই পাশের জায়গা — কেমন দেখাবে'],
  apLead:['The home page on two big screens with the side zones on. Scroll inside to see how they move. Looking here changes nothing in the shop — the shop is now','নিচে হোম পেজ বড় দুই স্ক্রিনে, দুই পাশের জোন চালু অবস্থায়। ভেতরে স্ক্রল করে দেখুন জোনগুলো কীভাবে চলে। এখানে দেখলে দোকানে কিছু বদলায় না — দোকানে এখন'],
  apNew:['New (with sides)','নতুন (দুই পাশসহ)'], apOld:['Today (as before)','এখনকার (আগের মতো)'], apBlend:['How much the pictures melt in','ছবি পেজে কতটা মিশবে'], low:['Less','কম'], asSaved:['As saved','যেমন রাখা আছে'], high:['More','বেশি'],
  apScreen:['{w} px wide screen','{w} px চওড়া স্ক্রিন'], apScreen1:['(usual big laptop/monitor)','(সাধারণ বড় ল্যাপটপ/মনিটর)'], apScreen2:['(full-HD monitor)','(ফুল-HD মনিটর)'],
  decision:['Decision','সিদ্ধান্ত'], apDecide:['If you like it press "Switch on" — big screens show it at once. Otherwise do nothing; the shop stays as it is.','ভালো লাগলে "চালু করুন" চাপুন — তখনই দোকানে বড় স্ক্রিনে দেখা যাবে। না চাইলে কিছু করতে হবে না, দোকান আগের মতোই থাকবে।'],
  editZones:['Edit zones','জোন বদলান'], switchOff:['Switch off','বন্ধ করুন'], approveOn:['Approved — switch on','অনুমোদন দিলাম — চালু করুন'],
  /* window placement (owner 22:14) + all sizes (22:17) */
  draftDirty:['Draft — changes not live yet. Check them, then publish.','খসড়া — বদলগুলো এখনো দোকানে যায়নি। দেখে নিয়ে প্রকাশ করুন।'], draftClean:['Everything here is live (no draft changes).','এখানে যা আছে সব দোকানে চালু (খসড়ায় কিছু বদলানো নেই)।'],
  publish:['Publish','প্রকাশ করুন'], discard:['Discard draft','খসড়া বাদ দিন'], undoPublish:['Undo last publish','শেষ প্রকাশ ফেরান'], published:['Published — the shop shows it now','প্রকাশ হলো — দোকানে এখন দেখা যাচ্ছে'],
  confirmDiscard:['Throw away the draft changes and go back to what is live?','খসড়ার বদলগুলো বাদ দিয়ে চালু অবস্থায় ফিরবেন?'], discarded:['Draft discarded','খসড়া বাদ দেওয়া হলো'],
  ownerScreen:['The owner’s own screen','মালিকের নিজের স্ক্রিন'], customBadge:['custom','নিজস্ব'], autoBadge:['auto','অটো'],
  mapView:['Map view','ম্যাপের ধরন'], viewWindow:['Window','স্ক্রিন যেমন দেখায়'], viewPage:['Whole page','পুরো পেজ'], checkAll:['Check all sizes','সব মাপে দেখুন'],
  mapHelpWin:['The browser window at this size, as a shopper sees it. Drag the red box: top edge, bottom edge, inner edge for width, or the middle to move. Values are saved as % of the visible height and of the free side, so every size follows.','এই মাপের ব্রাউজার জানালা — কাস্টমার যেমন দেখেন। লাল বক্স টানুন: উপরের কিনারা, নিচের কিনারা, ভেতরের কিনারা (চওড়া), বা মাঝখান ধরে সরান। মান রাখা হয় দেখা অংশের উচ্চতা আর খালি পাশের % হিসেবে, তাই সব মাপ নিজে থেকে মিলে যায়।'],
  winInfo:['Window {w} × {h} px · visible under the header {u} px · free side: left {l} px, right {r} px','জানালা {w} × {h} px · হেডারের নিচে দেখা অংশ {u} px · খালি পাশ: বাঁয়ে {l} px, ডানে {r} px'],
  headerLbl:['Header','হেডার'], visibleLbl:['Visible','দেখা অংশ'],
  vpLabel:['Visible {u}px → zone {h}px, above {a} · below {b} · width {w}px · {g}px from the content','দেখা অংশ {u}px → ছবি {h}px, উপরে {a} · নিচে {b} · চওড়া {w}px · কনটেন্ট থেকে {g}px'],
  placeAt:['Placement on {s}','{s}-এ জায়গা'], customNote:['This size has its own placement.','এই মাপের জন্য আলাদা করে ঠিক করা।'], autoNote:['Follows the base placement (set on the owner’s 1797 × 879 screen) and the sizes fixed near it.','মূল জায়গা (মালিকের ১৭৯৭ × ৮৭৯ স্ক্রিনে ঠিক করা) আর কাছের ঠিক করা মাপ থেকে নিজে মেলে।'],
  vpTop:['Top','উপরে'], vpHeight:['Height','উঁচু'], vpBottom:['Bottom gap','নিচের ফাঁক'], vpGap:['Gap to content','কনটেন্ট থেকে ফাঁক'], vpWidth:['Width of free side','খালি পাশের কতটা চওড়া'],
  resetAuto:['Reset to auto','অটোতে ফেরান'], fixSize:['Fix it for this size','এই মাপের জন্য আলাদা করুন'], presetOwner:['Owner’s marking (14 / 80 / 6)','মালিকের দাগ (১৪ / ৮০ / ৬)'], presetCentred:['Centred 75%','মাঝখানে ৭৫%'],
  fixedToast:['This size now has its own placement','এই মাপের এখন নিজস্ব জায়গা'], autoToast:['Back to auto for this size','এই মাপ আবার অটো'],
  placement:['Placement','জায়গা'], placeView:['In the window (fixed while scrolling)','স্ক্রিনের মধ্যে (স্ক্রলে স্থির)'], placeCustom:['Custom top on the page','পেজে নিজের ঠিক করা উচ্চতায়'],
  checkTitle:['All sizes at once','সব মাপ একসাথে'], checking:['Checking {n} of {t}…','{t}টার মধ্যে {n}টা দেখা হচ্ছে…'], checkLead:['Home and a category page at every size: the window, the header, the product rows and the zones (red).','প্রতিটা মাপে হোম আর একটা ক্যাটাগরি পেজ: জানালা, হেডার, প্রোডাক্টের সারি আর জোন (লাল)।'],
  cFits:['fits','জায়গা হয়'], cNoFit:['does not fit','জায়গা হয় না'], cOverlap:['touches content','কনটেন্ট ছুঁয়েছে'], cSmall:['small — picture only','ছোট — শুধু ছবি'], cPass:['OK','ঠিক আছে'], cWarn:['Check','দেখুন'],
  pg_home:['Home','হোম'], pg_cat:['Category pages','ক্যাটাগরি পেজ'], pg_login:['Log in','লগইন'], pg_bag:['Bag','ব্যাগ'], pg_product:['Product page','প্রোডাক্ট পেজ'], pg_search:['Search','সার্চ'],
  pg_combo:['Combo page','কম্বো পেজ'], 'pg_ca-hub':['All combos','সব কম্বো'], pg_set:['Build a set','সেট বানান'], pg_journal:['Journal','জার্নাল'], pg_page:['Info pages','তথ্যের পেজ'], 'pg_size-guide':['Size guide','সাইজ গাইড'],
  pg_account:['My account','আমার অ্যাকাউন্ট'], pg_order:['Order tracking','অর্ডার ট্র্যাকিং'], pg_exchange:['Exchange','এক্সচেঞ্জ'], pg_notfound:['Page not found','পেজ পাওয়া যায়নি'],
  pagesTitle:['Pages with side zones','কোন কোন পেজে দুই পাশ'], pagesNote:['Every shop page with empty sides can show zones. Never on checkout, the thank-you page or ad landing pages.','যে পেজে দুই পাশে খালি জায়গা আছে সেখানেই জোন দেখানো যায়। চেকআউট, ধন্যবাদ পেজ আর বিজ্ঞাপনের ল্যান্ডিং পেজে কখনো নয়।'],
  sameHome:['Same as home','হোমের মতোই'], ownPage:['Own placement for this page','এই পেজের আলাদা জায়গা'], otherPages:['Other pages','অন্য পেজ'], allOther:['All other pages','সব অন্য পেজ'], chosenOther:['Chosen pages','বাছাই করা পেজ'],
  /* snapshots (PR 597) */
  snapTitle:['Snapshots','স্ন্যাপশট'], snapLead:['Layouts, side canvas, house ads/popups and home/category banners — saved together.','পেজের সাজ, দুই পাশ, নিজের বিজ্ঞাপন/পপআপ আর হোম/ক্যাটাগরির ব্যানার — একসাথে রাখা হয়।'],
  launchDefault:['Launch default','লঞ্চের ডিফল্ট'], launchSaved:['saved {d}','রাখা হয়েছে {d}'], launchFactory:['factory settings (not saved yet)','ফ্যাক্টরি সেটিং (এখনো রাখা হয়নি)'],
  saveLaunch:['Save as launch default','লঞ্চের ডিফল্ট হিসেবে সেভ করুন'], backLaunch:['Back to launch default','লঞ্চের ডিফল্টে ফিরে যান'],
  confirmSaveLaunch:['Save everything as it is now as the launch default?','এখন যেমন আছে সব লঞ্চের ডিফল্ট হিসেবে রাখবেন?'],
  confirmBack:['Go back to the launch default? Test ads and experiments switch off and are kept as hidden copies — nothing is deleted. You can undo this.','লঞ্চের ডিফল্টে ফিরে যাবেন? টেস্ট বিজ্ঞাপন আর পরীক্ষাগুলো বন্ধ হয়ে লুকানো কপি হিসেবে থাকবে — কিছু মোছা হবে না। পরে ফেরানো যাবে।'],
  snapName:['Snapshot name (e.g. Eid 2027)','স্ন্যাপশটের নাম (যেমন ঈদ ২০২৭)'], saveSnap:['Save snapshot','স্ন্যাপশট রাখুন'], restoreSnap:['Restore','ফিরিয়ে আনুন'], rename:['Rename','নাম বদলান'],
  confirmRestore:['Restore "{n}"? Things added since then are kept as hidden copies. You can undo this.','"{n}" ফিরিয়ে আনবেন? এর পরে যোগ করা জিনিস লুকানো কপি হিসেবে থাকবে। পরে ফেরানো যাবে।'], newName:['New name','নতুন নাম'],
  restoreLog:['Restore log','ফেরানোর খাতা'], undoLast:['Undo last restore','শেষ ফেরানো বাতিল করুন'], nothingToUndo:['Nothing to undo','বাতিল করার কিছু নেই'],
  savedLaunch:['Saved as the launch default','লঞ্চের ডিফল্ট হিসেবে রাখা হলো'], backDone:['Back to the launch default — {n} test items kept as hidden copies','লঞ্চের ডিফল্টে ফেরা হলো — {n}টা টেস্ট জিনিস লুকানো কপি হিসেবে রাখা'],
  snapSaved:['Snapshot saved','স্ন্যাপশট রাখা হলো'], snapRestored:['Restored','ফিরিয়ে আনা হলো'], undone:['Undone — back to how it was','বাতিল — আগের মতো হলো'], logLaunch:['Back to launch default','লঞ্চের ডিফল্টে ফেরা'], logSnap:['Restored','ফিরিয়ে আনা'], logUndo:['Undo','বাতিল'], noSnaps:['No named snapshots yet.','এখনো কোনো নামের স্ন্যাপশট নেই।']
};
function lbLang(){ try{ return (ST && ST.adminLang==='bn') ? 'bn' : 'en'; }catch(e){ return 'en'; } }
function lbL(key, vars){
  var e = LB_L[key], s = e ? e[lbLang()==='bn' ? 1 : 0] : key;
  if(vars) s = s.replace(/\{(\w+)\}/g, function(m, k){ return vars[k]!=null ? (lbLang()==='bn' ? lb_bnNum(vars[k]) : vars[k]) : m; });
  return s;
}
function lbN(n){ return lbLang()==='bn' ? lb_bnNum(n) : String(n); }

/* =====================================================================
   2. SECTION TYPES (what the owner can add) — labels, defaults, renderers
   ===================================================================== */
var LB_BUILTIN_BN = {
  hero:'বড় ব্যানার (হিরো)', festive:'ঈদ ডেলিভারি নোটিশ', cats:'ক্যাটাগরি টাইল', newIn:'নতুন এসেছে', sets:'সেট ও কম্বো',
  finder:'সাইজ খুঁজুন', flash:'ফ্ল্যাশ সেল', look:'শপ দ্য লুক', reviews:'কাস্টমারদের রিভিউ', journal:'জার্নাল (ব্লগ)',
  catHead:'পেজের শিরোনাম', catMain:'প্রোডাক্ট গ্রিড ও ফিল্টার', catInfo:'বিবরণ ও প্রশ্নোত্তর',
  /* Batch A's hook ids */
  categories:'ক্যাটাগরি টাইল', 'new-in':'নতুন এসেছে', 'size-finder':'সাইজ খুঁজুন', 'flash-sale':'ফ্ল্যাশ সেল', 'shop-the-look':'শপ দ্য লুক',
  header:'পেজের শিরোনাম', grid:'প্রোডাক্ট গ্রিড ও ফিল্টার', 'after-grid':'গ্রিডের পরের জায়গা (খালি থাকলে কিছু দেখায় না)', info:'বিবরণ ও প্রশ্নোত্তর'
};
var LB_BUILTIN_EN = {
  hero:'Big banner (hero)', festive:'Eid delivery notice', cats:'Category tiles', newIn:'New in', sets:'Sets & combos', finder:'Find your size', flash:'Flash sale', look:'Shop the look',
  reviews:'Customer reviews', journal:'Journal (blog)', catHead:'Page heading', catMain:'Product grid & filters', catInfo:'Description & questions',
  categories:'Category tiles', 'new-in':'New in', 'size-finder':'Find your size', 'flash-sale':'Flash sale', 'shop-the-look':'Shop the look',
  header:'Page heading', grid:'Product grid & filters', 'after-grid':'Space after the grid (shows nothing when empty)', info:'Description & questions'
};
var LB_TYPES = {
  banner:{en:'Banner', bn:'ব্যানার', descEn:'A big offer or announcement — picture, text and a button', desc:'বড় অফার বা ঘোষণা — ছবি, লেখা আর বোতাম', icon:'bolt'},
  offerStrip:{en:'Offer strip', bn:'অফার স্ট্রিপ', descEn:'A slim one-line offer bar', desc:'এক লাইনের ছোট অফার পট্টি', icon:'tag'},
  productRow:{en:'Product row', bn:'প্রোডাক্ট সারি', descEn:'A sideways-scrolling row of products', desc:'পাশাপাশি সরানো যায় এমন প্রোডাক্টের সারি', icon:'right'},
  productGrid:{en:'Product grid', bn:'প্রোডাক্ট গ্রিড', descEn:'Products in a few rows', desc:'কয়েক লাইনে প্রোডাক্টের গ্রিড', icon:'grid'},
  comboRow:{en:'Combo row', bn:'কম্বো সারি', descEn:'Sets or combos (from a combo rule)', desc:'সেট বা কম্বোর সারি (কম্বো রুল থেকে)', icon:'layers'},
  categoryTiles:{en:'Category tiles', bn:'ক্যাটাগরি টাইল', descEn:'Picture tiles of chosen categories', desc:'বাছাই করা ক্যাটাগরির ছবি-টাইল', icon:'grid'},
  reviews:{en:'Reviews', bn:'রিভিউ', descEn:'Customer review cards', desc:'কাস্টমারদের রিভিউ কার্ড', icon:'star'},
  journal:{en:'Journal', bn:'জার্নাল', descEn:'Blog posts', desc:'ব্লগের লেখা', icon:'doc'},
  richText:{en:'Text (safe)', bn:'লেখা (নিরাপদ)', descEn:'Your own text — simple formatting only, never scripts', desc:'নিজের লেখা — শুধু সাধারণ ফরম্যাট, কোনো স্ক্রিপ্ট নয়', icon:'edit'},
  spacer:{en:'Spacer', bn:'ফাঁকা জায়গা', descEn:'A little gap between two sections', desc:'দুই অংশের মাঝে একটু ফাঁক', icon:'minus'}
};
var LB_DEV_BN = {both:'ফোন ও ডেস্কটপ', phone:'শুধু ফোন', desktop:'শুধু ডেস্কটপ'};
function lb_typeDefaults(type){
  var p0 = lb_visibleProducts()[0] || DB.products[0];
  var map = {
    banner:{eyebrow:'New offer', title:'Your offer headline', sub:'One short line about the offer.', cta:'Shop now', href:'#/c/new', tone:'brand', product:p0 ? p0.id : '', color:p0 ? p0.colors[0] : ''},
    offerStrip:{text:'Free delivery this week on every order', link:'Shop now', href:'#/c/new', tone:'brand'},
    productRow:{title:'Picked for you', sub:'', source:'tag', cat:(DB.categories[0]||{}).id||'', tag:'Bestseller', ids:[], limit:8, more:'', moreHref:''},
    productGrid:{title:'More to love', sub:'', source:'category', cat:(DB.categories[0]||{}).id||'', tag:'New', ids:[], limit:8, more:'', moreHref:''},
    comboRow:{title:'Sets that save', sub:'Buy together, pay less', source:'fixed', ids:[], rule:'', limit:8},
    categoryTiles:{title:'Shop by category', cats:[]},
    reviews:{title:'What customers say', limit:6},
    journal:{title:'From the journal', limit:4},
    richText:{title:'', html:'<p>Write your note here.</p>'},
    spacer:{phone:16, desktop:32}
  };
  return lb_clone(map[type] || {});
}

/* product lists from a source: category, tag (Bestseller / New / sale), or hand-picked */
function lb_products(d){
  var all = lb_visibleProducts(), list;
  if(d.source==='manual') list = (d.ids||[]).map(P).filter(Boolean);
  else if(d.source==='category') list = all.filter(function(p){ return p.cat===d.cat; });
  else if(d.tag==='sale') list = all.filter(function(p){ return p.compareAt > p.price; });
  else list = all.filter(function(p){ return (p.tag||'')===d.tag; });
  return list.slice(0, Math.max(1, lb_num(d.limit, 8)));
}
function lb_hd(title, sub, more, moreHref){
  if(!title && !sub) return '';
  return '<div class="sec-hd"><div>'+(title?'<h2 class="h2">'+esc(title)+'</h2>':'')+(sub?'<p class="small muted lb-sub">'+esc(sub)+'</p>':'')+'</div>'+
    (more && lb_safeHref(moreHref) ? '<a class="lb-more" href="'+esc(lb_safeHref(moreHref))+'">'+esc(more)+ico('right',14)+'</a>' : '')+'</div>';
}
function lb_comboItems(c){ return c.items.map(function(pid, i){ var p = P(pid); return p ? {product:pid, color:p.colors[i % p.colors.length]} : null; }).filter(Boolean); }
var LB_RENDER = {
  banner:function(d){
    var p = P(d.product), href = lb_safeHref(d.href);
    var img = p ? '<div class="lb-ban-img">'+productImg(p, (p.colors.indexOf(d.color)>=0 ? d.color : p.colors[0]), {ratio:'ratio-11', label:false})+'</div>' : '';
    return '<div class="lb-ban tone-'+esc(d.tone||'brand')+(img?' has-img':'')+'">'+
      '<div class="lb-ban-txt">'+(d.eyebrow?'<div class="eyebrow lb-ban-e">'+esc(d.eyebrow)+'</div>':'')+
        '<div class="lb-ban-t">'+esc(d.title||'')+'</div>'+(d.sub?'<p class="lb-ban-s">'+esc(d.sub)+'</p>':'')+
        (d.cta && href ? '<a class="btn lb-ban-cta" href="'+esc(href)+'">'+esc(d.cta)+ico('right',16)+'</a>' : '')+'</div>'+img+'</div>';
  },
  offerStrip:function(d){
    var href = lb_safeHref(d.href);
    var inner = '<span class="lb-strip-ic">'+ico('tag',16)+'</span><span class="lb-strip-t">'+esc(d.text||'')+'</span>'+(d.link && href ? '<span class="lb-strip-l">'+esc(d.link)+ico('right',14)+'</span>' : '');
    return href ? '<a class="lb-strip tone-'+esc(d.tone||'brand')+'" href="'+esc(href)+'">'+inner+'</a>' : '<div class="lb-strip tone-'+esc(d.tone||'brand')+'">'+inner+'</div>';
  },
  productRow:function(d){
    var list = lb_products(d); if(!list.length) return '';
    return lb_hd(d.title, d.sub, d.more, d.moreHref)+'<div class="lb-row">'+list.map(function(p){ return productCard(p); }).join('')+'</div>';
  },
  productGrid:function(d){
    var list = lb_products(d); if(!list.length) return '';
    return lb_hd(d.title, d.sub, d.more, d.moreHref)+'<div class="grid g4">'+list.map(function(p){ return productCard(p); }).join('')+'</div>';
  },
  comboRow:function(d){
    var cards = [], lim = Math.max(1, lb_num(d.limit, 8));
    if(d.source==='auto' && typeof ca_activeRules==='function' && typeof ca_generate==='function'){
      try{
        var r = ca_activeRules().filter(function(x){ return !d.rule || x.id===d.rule; })[0];
        if(r) ca_generate(r).visible.slice(0, lim).forEach(function(L){
          cards.push('<a class="lb-combo" href="#/combo-pair/'+esc(L.id)+'">'+setImg(L.pieces.map(function(pc){ return {product:pc.p.id, color:pc.color}; }), {ratio:'ratio-11'})+
            '<div class="lb-combo-i"><div class="lb-combo-t">'+esc(L.styleName)+' · '+L.n+' pcs</div><div class="small">'+priceHTML(L.price, L.save>0 ? L.price+L.save : 0)+'</div></div></a>');
        });
      }catch(e){}
    } else {
      var list = combos().filter(function(c){ return c.active && (!(d.ids||[]).length || d.ids.indexOf(c.id)>=0); }).slice(0, lim);
      list.forEach(function(c){
        var reg = c.items.reduce(function(s, pid){ var pp = P(pid); return s+(pp?pp.price:0); }, 0);
        cards.push('<a class="lb-combo" href="#/combo/'+esc(c.id)+'">'+setImg(lb_comboItems(c), {ratio:'ratio-11'})+
          '<div class="lb-combo-i"><div class="lb-combo-t">'+esc(c.name)+'</div><div class="small">'+priceHTML(c.price, reg>c.price?reg:0)+'</div></div></a>');
      });
    }
    if(!cards.length) return '';
    return lb_hd(d.title, d.sub)+'<div class="lb-row lb-row-combo">'+cards.join('')+'</div>';
  },
  categoryTiles:function(d){
    var cats = DB.categories.filter(function(c){ return !c.hidden && (!(d.cats||[]).length || d.cats.indexOf(c.id)>=0); });
    var tiles = cats.map(function(c){ var ps = productsIn(c.id), p = ps[0]; if(!p) return '';
      return '<a class="lb-cat" href="#/c/'+c.id+'">'+productImg(p, p.colors[0], {label:false, ratio:'ratio-34'})+'<div class="lb-cat-n">'+esc(t(c.name))+'</div></a>'; }).join('');
    if(!tiles) return '';
    return lb_hd(d.title)+'<div class="grid g6">'+tiles+'</div>';
  },
  reviews:function(d){
    var list = (DB.reviewsSample||[]).slice(0, Math.max(1, lb_num(d.limit, 6)));
    if(!list.length) return '';
    return lb_hd(d.title)+'<div class="lb-row lb-row-rev">'+list.map(function(r){
      return '<figure class="card lb-rev"><div class="row between">'+starsHTML(r.stars, 15)+(r.fit?'<span class="tag plain">'+esc(r.fit)+'</span>':'')+'</div>'+
        '<blockquote>\u201c'+esc(r.text)+'\u201d</blockquote><figcaption class="small"><b>'+esc(r.name)+'</b> <span class="muted">· Size '+esc(r.size)+'</span></figcaption></figure>'; }).join('')+'</div>';
  },
  journal:function(d){
    var arts = (DB.journal||[]).slice(-Math.max(1, lb_num(d.limit, 4))).reverse();
    var card = typeof hm_journalCard==='function' ? hm_journalCard : function(){ return ''; };
    var cards = arts.map(card).join(''); if(!cards) return '';
    return lb_hd(d.title, '', 'View all', '#/journal')+'<div class="lb-row lb-row-j">'+cards+'</div>';
  },
  richText:function(d){
    return (d.title?'<h2 class="h2">'+esc(d.title)+'</h2>':'')+'<div class="lb-rt">'+lb_safeHTML(d.html)+'</div>';
  },
  spacer:function(d){
    return '<div class="lb-spacer" style="--lb-sp-m:'+Math.max(0, lb_num(d.phone, 16))+'px;--lb-sp-d:'+Math.max(0, lb_num(d.desktop, 32))+'px" aria-hidden="true"></div>';
  }
};
/* a custom section as one full-width block, the same shape as the built-ins */
function lb_customHTML(sec, inside){
  var f = LB_RENDER[sec.type]; if(!f) return '';
  var inner = ''; try{ inner = f(sec.data || {}); }catch(e){ console.error(e); inner = ''; }
  if(!inner) return '';
  var tight = sec.type==='offerStrip' || sec.type==='spacer';
  /* inside: the page already wraps its sections in a .container (category) */
  return '<section class="'+(tight?'lb-sec lb-sec-tight':'section lb-sec')+' lb-t-'+sec.type+'" data-lb-id="'+esc(sec.id)+'">'+(inside ? inner : '<div class="container">'+inner+'</div>')+'</section>';
}

/* =====================================================================
   3. BUILT-INS — today's renderers, by id
   ===================================================================== */
var LB_HOME_FALLBACK = [['hero','hm_hero'],['festive','hm_festive'],['cats','hm_cats'],['newIn','hm_newIn'],['sets','hm_sets'],['finder','hm_finder'],['flash','hm_flash'],['look','hm_look'],['reviews','hm_reviews'],['journal','hm_journal']];
function lb_hookList(name){
  try{ var h = window[name]; if(Array.isArray(h) && h.length && h.every(function(x){ return x && x.id && typeof x.render==='function'; })) return h; }catch(e){}
  return null;
}
function lb_builtins(page){
  if(page==='home'){
    var h = lb_hookList('HOME_SECTIONS');
    if(h) return {hook:true, list:h.map(function(x){ return {id:String(x.id), render:x.render}; })};
    return {hook:false, list:LB_HOME_FALLBACK.filter(function(x){ return typeof window[x[1]]==='function'; }).map(function(x){ return {id:x[0], render:function(){ return window[x[1]](); }}; })};
  }
  var c = lb_hookList('CAT_SECTIONS');
  if(c) return {hook:true, list:c.map(function(x){ return {id:String(x.id), render:x.render}; })};
  return {hook:false, list:[{id:'catHead'}, {id:'catMain'}, {id:'catInfo'}]};
}
function lb_builtinSec(id){ return {id:'b-'+id, type:'builtin', ref:id, active:true, start:'', end:'', device:'both'}; }

/* keep a saved list in step with the built-ins that exist today: a built-in
   that no longer exists drops out, a new one joins after its neighbour */
function lb_reconcile(list, ids){
  var out = list.filter(function(s){ return s.type!=='builtin' || ids.indexOf(s.ref)>=0; });
  ids.forEach(function(id, i){
    if(out.some(function(s){ return s.type==='builtin' && s.ref===id; })) return;
    var at = 0;
    for(var k = i-1; k >= 0; k--){ var j = -1; out.forEach(function(s, n){ if(s.type==='builtin' && s.ref===ids[k]) j = n; }); if(j>=0){ at = j+1; break; } }
    out.splice(at, 0, lb_builtinSec(id));
  });
  if(out.length !== list.length || out.some(function(s, i){ return s !== list[i]; })){ list.length = 0; out.forEach(function(s){ list.push(s); }); }
  return list;
}

/* =====================================================================
   4. STATE + SEEDS
   ===================================================================== */
function lb_offerExample(){
  var r = (typeof setRules==='function' ? setRules() : []).filter(function(x){ return x.active && x.tiers; })[0];
  var title = 'Winter starter offer — this week only', sub = 'Pick any styles; the set price shows in the bag.', href = '#/set', prod = lb_visibleProducts()[0];
  if(r){
    var ks = Object.keys(r.tiers).sort(function(a,b){ return a-b; }), k = ks[ks.length-1];
    title = 'Any '+k+' for '+fmt(r.tiers[k]); sub = 'Mix styles and colours — the set price shows in the bag.'; href = '#/set/'+r.id;
    var c0 = r.categories && r.categories[0], pc = c0 ? productsIn(c0)[0] : null; if(pc) prod = pc;
  }
  var today = lb_today();
  return {id:'s-new-offer', type:'banner', name:'নতুন অফার', active:false, start:today, end:lb_dayAdd(today, 7), device:'both', example:true,
    data:{eyebrow:'New offer', title:title, sub:sub, cta:'Shop the offer', href:href, tone:'brand', product:prod ? prod.id : '', color:prod ? prod.colors[0] : ''}};
}
function lb_seedLayout(){
  var home = lb_builtins('home').list.map(function(b){ return lb_builtinSec(b.id); });
  var at = -1; home.forEach(function(s, i){ if(s.ref==='reviews') at = i; });
  home.splice(at>=0 ? at : home.length, 0, lb_offerExample());
  return {v:1, home:{sections:home}, cat:{default:lb_builtins('cat').list.map(function(b){ return lb_builtinSec(b.id); }), byCat:{}}};
}
function lb_layout(){
  if(!ST.layout || !ST.layout.home) ST.layout = lb_seedLayout();
  var L = ST.layout;
  if(!L.cat) L.cat = {default:[], byCat:{}};
  if(!L.cat.byCat) L.cat.byCat = {};
  lb_reconcile(L.home.sections, lb_builtins('home').list.map(function(b){ return b.id; }));
  var cid = lb_builtins('cat').list.map(function(b){ return b.id; });
  lb_reconcile(L.cat.default, cid);
  Object.keys(L.cat.byCat).forEach(function(k){ lb_reconcile(L.cat.byCat[k], cid); });
  return L;
}
function lb_list(page, catId){
  var L = lb_layout();
  if(page==='home') return L.home.sections;
  if(catId && L.cat.byCat[catId]) return L.cat.byCat[catId];
  return L.cat.default;
}

/* =====================================================================
   5. COMPOSE THE PAGE
   ===================================================================== */
function lb_secLive(s, today){ return !s.hidden && s.active!==false && lb_dateOk(s, today) && lb_devOk(s.device); }
function lb_plan(page, catId){
  var today = lb_today(), b = lb_builtins(page);
  var vis = lb_list(page, catId).filter(function(s){ return lb_secLive(s, today); });
  var ids = b.list.map(function(x){ return x.id; });
  var isDef = !(window.LB_INJECT && LB_INJECT.forceCompose) && vis.length===ids.length && vis.every(function(s, i){ return s.type==='builtin' && s.ref===ids[i]; });
  return {visible:vis, builtins:b, isDefault:isDef};
}
/* the ordered entries for this page: built-ins call today's renderer (with
   whatever arguments the page passes), new sections draw themselves; each
   carries an invisible <!--lb:id--> marker so a preview can scroll to it */
function lb_entries(plan, inside){
  var by = {}; plan.builtins.list.forEach(function(x){ by[x.id] = x; });
  return plan.visible.map(function(s){
    if(s.type==='builtin'){
      var b = by[s.ref];
      return {id:s.ref, render:function(){ var h = ''; try{ h = b ? (b.render.apply(this, arguments) || '') : ''; }catch(e){ console.error(e); } return '<!--lb:'+s.id+'-->'+h; }};
    }
    return {id:s.id, render:function(){ return '<!--lb:'+s.id+'-->'+lb_customHTML(s, inside); }};
  });
}
/* With Batch A's hook the page itself loops over HOME_SECTIONS / CAT_SECTIONS,
   so the composed list is handed to the page's own renderer for this one call
   (everything around the sections — side gutters, the category container and
   its context — stays exactly the page's own). */
function lb_withHook(name, entries, fn){
  var saved = window[name];
  window[name] = entries;
  try{ return fn(); } finally { window[name] = saved; }
}
function lb_renderHome(orig, self, args, force){
  var plan = lb_plan('home');
  if(plan.isDefault && !force) return orig.apply(self, args);
  if(plan.builtins.hook) return lb_withHook('HOME_SECTIONS', lb_entries(plan, false), function(){ return orig.apply(self, args); });
  return lb_entries(plan, false).map(function(e){ return e.render(); }).join('');
}
/* category without Batch A's hook: today's page is one container holding the
   heading, the grid with filters, and the description — split at those three */
function lb_catSplit(html){
  var A = '<div class="container">', iL = html.indexOf('<div class="cat-layout'), iI = html.lastIndexOf('<section class="cat-info"');
  if(html.indexOf(A)!==0 || iL<0 || iI<iL || html.slice(-6)!=='</div>') return null;
  return {catHead:html.slice(A.length, iL), catMain:html.slice(iL, iI), catInfo:html.slice(iI, html.length-6)};
}
function lb_renderCat(orig, self, args, force){
  var id = args[0] && args[0][0];
  if(!id || !(id==='new' || CAT(id))) return orig.apply(self, args);
  var plan = lb_plan('cat', id);
  if(plan.isDefault && !force) return orig.apply(self, args);
  if(plan.builtins.hook) return lb_withHook('CAT_SECTIONS', lb_entries(plan, true), function(){ return orig.apply(self, args); });
  var html = orig.apply(self, args), parts = lb_catSplit(html); if(!parts) return html;
  var out = '', open = false;
  plan.visible.forEach(function(s){
    if(s.type==='builtin'){ if(!open){ out += '<div class="container">'; open = true; } out += '<!--lb:'+s.id+'-->'+(parts[s.ref]||''); }
    else { if(open){ out += '</div>'; open = false; } out += '<!--lb:'+s.id+'-->'+lb_customHTML(s, false); }
  });
  if(open) out += '</div>';
  return out;
}
/* installed at boot (after every file has loaded), so whoever defines the
   page last is the one wrapped; idempotent */
function lb_wrapPages(){
  var H = PAGES.home;
  if(H && typeof H.render==='function' && !H.render._lb){
    var oh = H.render;
    var wh = function(){ var a = arguments; try{ return lb_renderHome(oh, this, a); }catch(e){ console.error(e); return oh.apply(this, a); } };
    wh._lb = true; wh._orig = oh; H.render = wh;
  }
  var C = PAGES.category;
  if(C && typeof C.render==='function' && !C.render._lb){
    var oc = C.render;
    var wc = function(){ var a = arguments; try{ return lb_renderCat(oc, this, a); }catch(e){ console.error(e); return oc.apply(this, a); } };
    wc._lb = true; wc._orig = oc; C.render = wc;
  }
}

/* =====================================================================
   6. SIDE CANVAS v2 — state, scaling, float, full blend, targeting
   ---------------------------------------------------------------------
   ST.sideCanvas = {v:2, enabled:false, ref:{gutter:132}, maxScale, zones:{l:[], r:[]}}
   zone = {id, name, top, width, height  ← the STANDARD size, designed at 1440 (gutter 132)
           align:'outer'|'center'|'inner', mode:'sticky'|'anchored'|'float', float:40,
           style:'card'|'full', type:'banner'|'ad'|'popup'|'figure'|'image'|'motion',
           content:{…}, motion:{tpl, src:{…}, speed, order, ai}, blend:{color, fade, strength},
           target:{home:true, cat:'all'|'some'|'none', cats:[]}, start, end, active, hidden}
   NEVER HIDE — SCALE: k = (gutter − safety) / (reference gutter − safety), so every zone
   keeps its proportions and always fits the space this screen gives; text clamps to a
   legible minimum and, below that, the zone shows its picture only.
   ===================================================================== */
function lb_seedCanvas(){
  var rl = P('rl-solid-polo') || lb_visibleProducts().filter(function(p){ return p.colors.length > 3; })[0] || lb_visibleProducts()[0];
  var pc = (lb_visibleProducts().filter(function(p){ return p.cat==='polos'; })[0]) || lb_visibleProducts()[0];
  var T = {home:true, cat:'all', cats:[]};
  return {v:2, enabled:false, maxScale:1.6,
    zones:{
      l:[{id:'z-model', name:'Model — pose cycle', example:true, top:48, height:440, width:112, align:'outer', mode:'float', float:40, style:'full', type:'motion', place:'view',
          motion:{tpl:'poseCycle', src:{kind:'manual', picks:[{p:pc ? pc.id : '', c:'white'}, {p:'slim-chino-trousers', c:'navy'}]}, speed:2.6, order:'as'},
          content:{polo:'#F4F1EA', denim:'#3D5878', boots:'#5B3A26', anim:true},
          blend:{color:'auto', fade:'both', strength:55}, target:lb_clone(T), start:'', end:'', active:true}],
      r:[{id:'z-offer', name:'Every colour — Solid Polo', example:true, top:48, height:320, width:112, align:'inner', mode:'sticky', float:40, style:'full', type:'motion', place:'view',
          motion:{tpl:'colourCycle', src:{kind:'rule', products:[rl ? rl.id : '']}, speed:2.2, order:'as'},
          content:{}, blend:{color:'auto', fade:'both', strength:45}, target:lb_clone(T), start:'', end:'', active:true},
         {id:'z-pop', name:'Popup — first order', example:true, top:420, height:150, width:112, align:'outer', mode:'sticky', float:40, style:'card', type:'popup',
          content:{teaser:'A gift for you', trigger:'view', value:3, freq:'session', title:'Free delivery on your first order', sub:'Order today — Cash on Delivery all over Bangladesh.', cta:'Shop new in', href:'#/c/new', product:pc ? pc.id : '', color:pc ? pc.colors[0] : ''},
          blend:{color:'auto', fade:'none', strength:30}, target:lb_clone(T), start:'', end:'', active:false, note:'right side is taken by the window-placed zone'}]
    }};
}
/* v1 (pages.home / pages.cat) → v2 (one list per side, each zone with its own pages) */
function lb_scMigrate(S){
  if(S.zones) return S;
  var z = {l:[], r:[]};
  ['home','cat'].forEach(function(k){
    var pg = (S.pages||{})[k] || {};
    ['l','r'].forEach(function(s){ (pg[s]||[]).forEach(function(x){ x.target = k==='home' ? {home:true, cat:'none', cats:[]} : {home:false, cat:'all', cats:[]}; z[s].push(x); }); });
  });
  return {v:2, enabled:!!S.enabled, maxScale:1.6, zones:z};
}
function lb_sc(){
  if(!ST.sideCanvas || !(ST.sideCanvas.zones || ST.sideCanvas.pages)) ST.sideCanvas = lb_seedCanvas();
  if(!ST.sideCanvas.zones) ST.sideCanvas = lb_scMigrate(ST.sideCanvas);
  var S = ST.sideCanvas;
  if(!S.zones.l) S.zones.l = []; if(!S.zones.r) S.zones.r = [];
  S.zones.l.concat(S.zones.r).forEach(function(z){ if(!z.target) z.target = {home:true, cat:'all', cats:[]}; if(!z.style) z.style = 'card'; });
  return S;
}

var LB_POP = {view:0, shown:false, timers:[], io:null, figIO:null, float:[], raf:0};
function lb_scOn(){
  if(window.LB_INJECT && LB_INJECT.forceCanvas) return true;
  return !!(ST && ST.sideCanvas && ST.sideCanvas.enabled);
}
function lb_scWanted(){ var pg = lb_scPage(); return !!(pg && lb_scOn() && (lb_pageOn(pg.key) || (window.LB_INJECT && LB_INJECT.forceCanvas)) && window.innerWidth >= LB_CFG.deskMin && (lb_fineMouse() || (window.LB_INJECT && LB_INJECT.forceCanvas))); }
function lb_scPage(){
  if(!CUR || !CUR.page) return null;
  var def = PAGES[CUR.page] || PAGES.notfound || {}, lay = def.layout || 'store';
  if(lay !== 'store' || LB_CFG.never.indexOf(CUR.page) >= 0) return null;     /* checkout stays distraction-free */
  if(CUR.page==='home') return {key:'home'};
  if(CUR.page==='category') return {key:'cat', cat:(CUR.params||[])[0]};
  return {key:CUR.page};
}
function lb_pagesOn(){ var S = lb_sc(); if(!S.pagesOn) S.pagesOn = lb_clone(LB_CFG.pagesOnDefault); return S.pagesOn; }
function lb_pageOn(key, S){ var on = (S || lb_sc()).pagesOn || LB_CFG.pagesOnDefault; return on[key] != null ? !!on[key] : !!LB_CFG.pagesOnDefault[key]; }
/* targeting: home, all categories, or chosen categories */
function lb_zTargets(z, pg){
  var t = z.target || {home:true, cat:'all'};
  if(pg.key==='home') return t.home !== false;
  if(pg.key==='cat'){
    if(t.cat==='all') return true;
    if(t.cat==='some') return (t.cats||[]).indexOf(pg.cat) >= 0;
    return false;
  }
  /* other pages (login, bag, product…): all by default; the page's own switch decides first */
  if(t.pages==null || t.pages==='all') return true;
  return Array.isArray(t.pages) && t.pages.indexOf(pg.key) >= 0;
}
function lb_bgColor(){
  try{ var c = getComputedStyle(document.body).backgroundColor; if(c && c!=='rgba(0, 0, 0, 0)' && c!=='transparent') return c; }catch(e){}
  try{ return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#F4F3F0'; }catch(e){ return '#F4F3F0'; }
}
function lb_hasBg(el){
  try{ var cs = getComputedStyle(el); return (cs.backgroundColor && cs.backgroundColor!=='rgba(0, 0, 0, 0)' && cs.backgroundColor!=='transparent') || (cs.backgroundImage && cs.backgroundImage!=='none'); }catch(e){ return false; }
}
function lb_hexOf(c){
  if(/^#[0-9a-f]{6}$/i.test(c)) return c;
  var m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); if(!m) return '#F4F3F0';
  return '#'+[m[1], m[2], m[3]].map(function(v){ return ('0'+parseInt(v,10).toString(16)).slice(-2); }).join('');
}
/* where the gutters are on this page right now (document px) */
function lb_scGeom(){
  var de = document.documentElement, vw = de.clientWidth, sy = window.pageYOffset || 0;
  var main = document.querySelector('main.page'); if(!main) return null;
  var hdr = document.querySelector('.hdr'), hdrH = 0;
  if(hdr){ var hs = getComputedStyle(hdr); if(hs.position==='sticky' || hs.position==='fixed') hdrH = hdr.getBoundingClientRect().height; }
  var mr = main.getBoundingClientRect(), mainTop = mr.top + sy, bandTop = mainTop;
  var obs = [];
  [].forEach.call(main.children, function(c){
    var r = c.getBoundingClientRect(); if(!r.height || r.width < vw - 1) return;
    if(lb_hasBg(c)) obs.push({top:r.top + sy, bottom:r.bottom + sy});
  });
  obs.sort(function(a, b){ return a.top - b.top; });
  /* "from under the header banner": a full-width band at the very top of the page is the banner */
  while(obs.length && obs[0].top <= bandTop + 1){ bandTop = Math.max(bandTop, obs[0].bottom); obs.shift(); }
  var ftr = document.querySelector('footer.ftr, footer'), bandBottom = ftr ? ftr.getBoundingClientRect().top + sy : mr.bottom + sy;
  /* where the content starts on each side: the padding edge of every .container inside the band */
  var gL = vw, gR = vw, seen = 0;
  [].forEach.call(main.querySelectorAll('.container'), function(c){
    var r = c.getBoundingClientRect(); if(!r.height || r.bottom + sy <= bandTop + 1 || r.top + sy >= bandBottom) return;
    var cs = getComputedStyle(c); seen++;
    gL = Math.min(gL, r.left + (parseFloat(cs.paddingLeft)||0)); gR = Math.min(gR, vw - (r.right - (parseFloat(cs.paddingRight)||0)));
  });
  if(!seen){
    [].forEach.call(main.querySelectorAll(':scope > *, :scope > * > *'), function(c){
      var r = c.getBoundingClientRect(); if(!r.height || r.width >= vw - 1 || r.bottom + sy <= bandTop + 1) return;
      var cs = getComputedStyle(c); if(cs.position==='absolute' || cs.position==='fixed') return; seen++;
      gL = Math.min(gL, r.left + (parseFloat(cs.paddingLeft)||0)); gR = Math.min(gR, vw - (r.right - (parseFloat(cs.paddingRight)||0)));
    });
  }
  if(!seen){ gL = 0; gR = 0; }
  /* Batch A's empty gutter boxes (#lb-side-l/-r) confirm where the band ends; the usable
     width is measured to where the content really starts (the container padding is empty too) */
  var hookL = document.getElementById('lb-side-l'), hooked = false;
  if(hookL){ var hl = hookL.getBoundingClientRect(); if(hl.height > 0){ hooked = true; bandBottom = Math.min(bandBottom, hl.bottom + sy); } }
  return {vw:vw, gL:Math.max(0, Math.floor(gL)), gR:Math.max(0, Math.floor(gR)), bandTop:Math.round(bandTop), bandBottom:Math.round(bandBottom),
    obstacles:obs.map(function(o){ return {top:Math.round(o.top - bandTop), bottom:Math.round(o.bottom - bandTop)}; }).filter(function(o){ return o.bottom > 0; }),
    hdrH:Math.round(hdrH), stickyTop:Math.round(hdrH + LB_CFG.stickyGap), pageH:de.scrollHeight, hooked:hooked,
    vh:(window.LB_INJECT && LB_INJECT.fullHeight) ? (LB_INJECT.viewH || 900) : window.innerHeight};
}
/* the scale this screen gives a side: 1 at the reference gutter */
function lb_scaleFor(G){
  var refU = LB_CFG.refGutter - LB_CFG.safety, u = Math.max(0, G - LB_CFG.safety);
  return Math.max(0.05, Math.min((lb_sc().maxScale || LB_CFG.maxScale), u / refU));
}
/* WINDOW-CENTRE placement (owner 22:14): the zone takes viewPct % of the visible window below the
   sticky header, centred with equal space above and below, and stays there while scrolling. The
   figure keeps its proportions: if that height needs more width than the side gives, it fits the
   width and stays centred. Default for the full-blend figure and the walk-out / pose templates. */
function lb_isFigureLike(z){ return z.type==='figure' || (z.type==='motion' && z.motion && /^(walkOut|poseCycle)$/.test(z.motion.tpl)); }
function lb_zPlace(z){ if(z.place==='view' || z.place==='custom') return z.place; return (z.style==='full' && lb_isFigureLike(z)) ? 'view' : 'custom'; }
function lb_zAspect(z){ return lb_isFigureLike(z) ? 164/560 : Math.max(0.05, lb_num(z.width, 1) / Math.max(1, lb_num(z.height, 1))); }
function lb_freeSegs(geom){
  var bandH = geom.bandBottom - geom.bandTop, y = 0, out = [];
  geom.obstacles.slice().sort(function(a, b){ return a.top - b.top; }).forEach(function(o){ if(o.top > y) out.push({a:y, b:Math.min(o.top, bandH)}); y = Math.max(y, o.bottom); });
  if(bandH > y) out.push({a:y, b:bandH});
  return out;
}
/* the placement values for a window size: an exact per-size override, else a smooth blend of the
   defined sizes (inverse-distance), else the base */
function lb_vpKey(w, h){ return Math.round(w)+'x'+Math.round(h); }
/* a page can have its own placement ("same as home" by default) */
function lb_vpSet(z, key){ return (key && key!=='home' && z.vpBy && z.vpBy[key]) ? z.vpBy[key] : z; }
function lb_vpAnchors(z){
  var b = z.vp || LB_CFG.vpBase, out = [{w:lb_num(b.w, LB_CFG.vpBase.w), h:lb_num(b.h, LB_CFG.vpBase.h), v:b, base:true}];
  Object.keys(z.vpSizes || {}).forEach(function(k){ var m = k.split('x'); out.push({w:+m[0], h:+m[1], v:z.vpSizes[k], key:k}); });
  return out;
}
function lb_vpFor(z, w, h, key){
  var A = lb_vpAnchors(lb_vpSet(z, key)), F = ['top','height','gap','width'];
  var ex = A.filter(function(a){ return a.w===Math.round(w) && a.h===Math.round(h); })[0];
  if(ex){ var o0 = {}; F.forEach(function(f){ o0[f] = lb_num(ex.v[f], LB_CFG.vpBase[f]); }); o0.custom = !ex.base; return o0; }
  if(A.length===1){ var o1 = {}; F.forEach(function(f){ o1[f] = lb_num(A[0].v[f], LB_CFG.vpBase[f]); }); return o1; }
  var ws = A.map(function(a){ var dw = (w - a.w) / 1000, dh = (h - a.h) / 600; return 1 / Math.max(1e-6, dw*dw + dh*dh); }), sw = ws.reduce(function(x, y){ return x + y; }, 0), o = {};
  F.forEach(function(f){ o[f] = Math.round(A.reduce(function(acc, a, i){ return acc + ws[i] * lb_num(a.v[f], LB_CFG.vpBase[f]); }, 0) / sw * 10) / 10; });
  return o;
}
function lb_viewBox(z, G, geom, pgKey){
  var gap = LB_CFG.stickyGap, fl = z.mode==='float' ? Math.round(lb_num(z.float, LB_CFG.floatRange)) : 0;
  var v = lb_vpFor(z, geom.vw, geom.vh, pgKey), U = Math.max(120, geom.vh - geom.hdrH);
  var cg = Math.max(LB_CFG.safety, Math.round(v.gap));                     /* never closer to the content than the safety gap */
  var top = Math.round(U * v.top / 100), H = Math.max(1, Math.round(U * v.height / 100));
  if(top + H > U) H = Math.max(1, U - top);
  var W = Math.max(1, Math.min(Math.round(G * v.width / 100), G - cg));
  var segs = lb_freeSegs(geom).map(function(sg){ var t = sg.a + gap + fl; return {top:t, h:(sg.b - gap - fl) - t}; });
  var fit = segs.filter(function(sg){ return sg.h >= H; });
  if(!fit.length && segs.length){ var big = segs.slice().sort(function(a, b){ return b.h - a.h; })[0]; if(big.h > 24){ H = Math.round(big.h); fit = [big]; } }
  return {W:W, H:H, U:U, x:Math.max(0, G - cg - W), gap:cg, v:v, fl:fl, segs:fit, stickyTop:geom.hdrH + top, above:top, below:U - top - H, custom:!!v.custom};
}
/* place one side's zones: every zone shows, scaled to fit; never over content, bands or footer */
function lb_scPlace(zones, G, geom, pg, opts){
  opts = opts || {};
  var today = lb_today(), bandH = geom.bandBottom - geom.bandTop, out = [], gap = LB_CFG.stickyGap;
  var k = lb_scaleFor(G), room = Math.max(0, G - LB_CFG.safety);
  var list = zones.filter(function(z){ return !z.hidden; }).slice().sort(function(a, b){ return lb_num(a.top) - lb_num(b.top); });
  var lastBottom = -1e9;
  var pre = function(z){ if(pg && !lb_zTargets(z, pg) && !opts.all) return 'page'; if(z.active===false && !opts.all) return 'off'; if(!lb_dateOk(z, today) && !opts.all) return 'date'; return 'ok'; };
  /* one window-centre zone per side; it owns that side while it shows */
  var viewZ = list.filter(function(z){ return lb_zPlace(z)==='view' && pre(z)==='ok' && !lb_zWeight(z).over.length; })[0] || null;
  list.forEach(function(z){
    var st = pre(z);
    if(st==='ok' && viewZ && z !== viewZ) st = 'side';
    var wt = lb_zWeight(z);
    if(st==='ok' && wt.over.length) st = 'budget';           /* over its own budget: blocked, red in the editor */
    else if(st==='ok' && opts.acc){ if(opts.acc.total + wt.total > LB_CFG.budget.page) st = 'budget'; else opts.acc.total += wt.total; }
    var rw = Math.max(1, lb_num(z.width, 1)), rh = Math.max(1, lb_num(z.height, 1));
    var kz = Math.min(k, room / rw);                         /* a zone wider than the reference room shrinks a little more */
    var w = Math.max(1, Math.round(rw * kz)), h = Math.max(1, Math.round(rh * kz));
    var fl = z.mode==='float' ? Math.round(lb_num(z.float, LB_CFG.floatRange)) : 0;
    var top = Math.round(lb_num(z.top) * kz), moved = false;
    if(st==='ok'){
      if(top < lastBottom + gap + fl){ top = lastBottom + gap + fl; moved = true; }
      for(var guard = 0; guard < 20; guard++){
        var hit = geom.obstacles.filter(function(o){ return top - fl < o.bottom + gap && top + h + fl > o.top - gap; })[0];
        if(!hit) break; top = hit.bottom + gap + fl; moved = true;
      }
      if(top + h + fl > bandH){                              /* the page ends first: shrink to the space left */
        var avail = bandH - fl - top;
        if(avail >= 24){ var s2 = avail / h; h = Math.round(h * s2); w = Math.max(1, Math.round(w * s2)); kz *= s2; }
        else { top = Math.max(0, bandH - h - fl); }
        moved = true;
      }
    }
    var edge = Math.max(0, Math.min(LB_CFG.edge, room - w));
    var x = z.align==='inner' ? room - w : (z.align==='center' ? edge + Math.round((room - edge - w)/2) : edge);
    var p = {z:z, st:st, top:top, h:h, w:w, x:Math.max(0, x), k:Math.round(kz*100)/100, fl:fl, moved:moved, imgOnly:(w < LB_CFG.minTextW), wt:wt};
    if(st==='ok' && z === viewZ){
      var vb = lb_viewBox(z, G, geom, pg && pg.key);
      p.view = vb; p.w = vb.W; p.h = vb.H; p.fl = vb.fl; p.k = Math.round(vb.W / Math.max(1, lb_num(z.width, 1)) * 100) / 100; p.imgOnly = vb.W < LB_CFG.minTextW;
      p.x = vb.x;   /* hugs the content side, a set gap away; mirrored on the right */
      p.top = vb.segs.length ? vb.segs[0].top : 0; p.moved = false;
      out.push(p); return;
    }
    out.push(p);
    if(st==='ok') lastBottom = top + h + fl;
  });
  var ok = out.filter(function(p){ return p.st==='ok' && !p.view; });
  ok.forEach(function(p, i){
    var limit = bandH;
    if(ok[i+1]) limit = Math.min(limit, ok[i+1].top - ok[i+1].fl - gap);
    geom.obstacles.forEach(function(o){ if(o.top >= p.top + p.h && o.top - gap < limit) limit = o.top - gap; });
    limit -= p.fl;
    p.trackH = (p.z.mode==='sticky' || p.z.mode==='float') ? Math.max(p.h, limit - p.top) : p.h;
  });
  return out;
}

/* ---------- blend: colour, edge fade, full blend (no card, no edge) ---------- */
function lb_blendCSS(z){
  var b = z.blend || {}, s = Math.max(0, Math.min(100, lb_num(b.strength, 50)));
  var col = (!b.color || b.color==='auto') ? lb_bgColor() : b.color;
  var fade = b.fade || (z.style==='full' ? 'both' : 'none');
  if(z.style==='full' && fade==='none') fade = 'both';      /* full blend always dissolves its edges */
  var f = Math.round(8 + s*0.38), v = Math.round(4 + s*0.22);
  var mask = '';
  if(fade==='left') mask = 'linear-gradient(to right, transparent 0, #000 '+f+'%)';
  else if(fade==='right') mask = 'linear-gradient(to left, transparent 0, #000 '+f+'%)';
  else if(fade==='both') mask = 'linear-gradient(to right, transparent 0, #000 '+f+'%, #000 '+(100-f)+'%, transparent 100%)';
  /* the top dissolves fully; the floor only softly, so feet and hems stay grounded */
  var vmask = fade!=='none' ? 'linear-gradient(to bottom, transparent 0, #000 '+v+'%, #000 '+(100-Math.max(3, Math.round(v/3)))+'%, transparent 100%)' : '';
  var css = '--lb-blend:'+col+';--lb-glow:'+(0.12 + s/400).toFixed(2)+';';
  if(mask){ var m = mask+', '+vmask; css += '-webkit-mask-image:'+m+';mask-image:'+m+';-webkit-mask-composite:source-in;mask-composite:intersect;'; }
  return css;
}
/* the illustrated figure: today's garment drawings (top over bottom) on a faceless dress-form,
   boots drawn in the same flat style. pose 0–3: standing · hand on hip · walking · hands in pockets */
var LB_POSES = [{la:0, ra:0, leg:0, hx:0}, {la:-26, ra:0, leg:0, hx:-3, hip:1}, {la:-14, ra:-14, leg:1, hx:3}, {la:4, ra:4, leg:0, hx:0, pocket:1}];
function lb_figureSVG(c, pose){
  c = c || {}; var P0 = LB_POSES[(pose||0) % LB_POSES.length];
  var top = c.polo || '#F4F1EA', bot = c.denim || '#3D5878', boots = c.boots || '#5B3A26', topType = c.topType || 'polo', botType = c.botType || 'trouser';
  var form = mixHex(lb_hexOf(lb_bgColor()), '#BFB2A3', .55), formD = mixHex(form, '#000000', .12), sole = mixHex(boots, '#000000', .45);
  var g = function(type, hex){ return garmentSVG(type, hex, 'front').replace('<svg class="garment" ', '<svg '); };
  var nest = function(svg, x, y, w, h){ return svg.replace('<svg ', '<svg x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" preserveAspectRatio="none" '); };
  var armL = P0.pocket ? 'M30 124 L44 150 L49 226 L38 230 L26 152 Z' : (P0.hip ? 'M30 124 L44 150 L40 188 L60 224 L52 232 L27 190 L26 152 Z' : 'M30 124 L44 150 L47 244 Q40 258 31 247 L25 150 Z');
  var armR = P0.pocket ? 'M170 124 L156 150 L151 226 L162 230 L174 152 Z' : 'M170 124 L156 150 L153 244 Q160 258 169 247 L175 150 Z';
  var legs = P0.leg ? ' transform="rotate(2.5 100 262)"' : '';
  return '<svg class="lb-fig-svg" viewBox="24 0 152 560" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">'+
    '<ellipse cx="100" cy="551" rx="74" ry="8" fill="#000" opacity=".14"/>'+
    '<ellipse cx="'+(100+P0.hx)+'" cy="44" rx="21" ry="26" fill="'+form+'"/><path d="M91 64 L109 64 L111 92 L89 92 Z" fill="'+formD+'"/>'+
    '<g transform="rotate('+P0.la+' 37 128)"><path d="'+armL+'" fill="'+form+'"/></g><g transform="rotate('+(-P0.ra)+' 163 128)"><path d="'+armR+'" fill="'+form+'"/></g>'+
    '<g'+legs+'>'+nest(g(botType, bot), 20, 250, 160, 286)+
    '<path d="M55 508 L93 508 L95 538 L103 548 L49 548 L51 528 Z" fill="'+boots+'"/><path d="M49 544 L103 544 L103 550 L49 550 Z" fill="'+sole+'"/>'+
    '<path d="M107 508 L145 508 L149 528 L151 548 L97 548 L105 538 Z" fill="'+boots+'"/><path d="M97 544 L151 544 L151 550 L97 550 Z" fill="'+sole+'"/></g>'+
    nest(g(topType, top), 10, 78, 180, 200)+
  '</svg>';
}
function lb_adTarget(c){
  if(c.kind==='combo'){ var cb = COMBO(c.ref); if(cb) return {href:'#/combo/'+cb.id, name:cb.name, price:cb.price, img:setImg(lb_comboItems(cb), {ratio:'ratio-11'})}; }
  if(c.kind==='category'){ var ct = CAT(c.ref), p0 = ct ? productsIn(ct.id)[0] : null; if(ct && p0) return {href:'#/c/'+ct.id, name:t(ct.name), price:0, img:productImg(p0, p0.colors[0], {ratio:'ratio-11', label:false})}; }
  var p = P(c.ref) || lb_visibleProducts()[0]; if(!p) return null;
  return {href:'#/p/'+p.id, name:p.name, price:p.price, img:productImg(p, p.colors[0], {ratio:'ratio-11', label:false})};
}
/* a transparent garment drawing (no tile, no shadow) — what full blend is made of */
function lb_gar(pid, color, view){
  var p = P(pid); if(!p) return '';
  var cat = CAT(p.cat) || {garment:'tee'}, hex = COL(color || p.colors[0]).hex;
  return garmentSVG(p.garment || cat.garment, hex, view || 'front').replace('<svg class="garment" ', '<svg class="lb-g" preserveAspectRatio="xMidYMid meet" ');
}
function lb_zoneInner(z, place){
  var c = z.content || {}, type = z.type, full = z.style==='full';
  if(type==='motion') return lb_mtHTML(z, place);
  if(type==='figure') return '<div class="lb-fig'+(c.anim!==false?' lb-anim':'')+'">'+lb_figureSVG(c, 0)+'</div>';
  if(type==='image'){
    var src = String(c.src||''); if(!/^(data:image\/|https:\/\/)/.test(src)) return '<div class="lb-img lb-img-empty"></div>';
    var img = '<img src="'+esc(src)+'" alt="'+esc(c.alt||'')+'" loading="lazy" decoding="async">';
    var h = lb_safeHref(c.href); return h ? '<a class="lb-img" href="'+esc(h)+'">'+img+'</a>' : '<div class="lb-img">'+img+'</div>';
  }
  if(type==='video'){
    /* a short muted loop; the poster shows first (and is all reduced-motion visitors see) */
    var vs = String(c.src||''), ps = String(c.poster||'');
    if(!/^(data:video\/|https:\/\/)/.test(vs)) return '<div class="lb-img lb-img-empty"></div>';
    var vd = '<video class="lb-vid" muted playsinline loop preload="none" disablepictureinpicture'+(/^(data:image\/|https:\/\/)/.test(ps)?' poster="'+esc(ps)+'"':'')+' aria-label="'+esc(c.alt||'')+'"><source src="'+esc(vs)+'"'+(c.mime?' type="'+esc(c.mime)+'"':'')+'></video>';
    var vh = lb_safeHref(c.href); return vh ? '<a class="lb-img" href="'+esc(vh)+'">'+vd+'</a>' : '<div class="lb-img">'+vd+'</div>';
  }
  if(type==='ad'){
    var a = lb_adTarget(c); if(!a) return '';
    if(full){ var pa = c.kind==='product' || !c.kind ? P(c.ref) : null;
      return '<a class="lb-zad lb-full" href="'+esc(a.href)+'"><span class="lb-zfg">'+(pa ? lb_gar(pa.id, pa.colors[0]) : a.img)+'</span><span class="lb-zad-n lb-txt">'+esc(a.name)+'</span>'+(a.price?'<span class="lb-zad-p price lb-txt">'+fmt(a.price)+'</span>':'')+'</a>'; }
    return '<a class="lb-zad" href="'+esc(a.href)+'"><span class="lb-zad-tag lb-txt">'+esc(c.label||'Ad')+'</span>'+a.img+'<span class="lb-zad-n lb-txt">'+esc(a.name)+'</span>'+(a.price?'<span class="lb-zad-p price lb-txt">'+fmt(a.price)+'</span>':'')+'</a>';
  }
  if(type==='popup'){
    return '<button type="button" class="lb-zpop'+(full?' lb-full':'')+'" data-act="lb-pop" data-zid="'+esc(z.id)+'" aria-label="'+esc(c.teaser||'Offer')+'">'+ico('gift',22)+'<span class="lb-zpop-t lb-txt">'+esc(c.teaser||'Offer')+'</span><span class="lb-zpop-o lb-txt">'+esc(c.open||'Open')+ico('right',13)+'</span></button>';
  }
  /* banner */
  var p = P(c.product), href = lb_safeHref(c.href), col = p ? (p.colors.indexOf(c.color)>=0 ? c.color : p.colors[0]) : '';
  var im = p ? '<span class="lb-zb-img">'+(full ? lb_gar(p.id, col) : productImg(p, col, {ratio:'ratio-34', label:false}))+'</span>' : '';
  var inner = im+'<span class="lb-zb-txt lb-txt">'+(c.eyebrow?'<span class="lb-zb-e">'+esc(c.eyebrow)+'</span>':'')+'<span class="lb-zb-t">'+esc(c.title||'')+'</span>'+(c.sub?'<span class="lb-zb-s">'+esc(c.sub)+'</span>':'')+
    (c.cta && href ? '<span class="lb-zb-c">'+esc(c.cta)+ico('right',13)+'</span>' : '')+'</span>';
  return href ? '<a class="lb-zb'+(full?' lb-full':'')+'" href="'+esc(href)+'" aria-label="'+esc(c.title||'')+'">'+inner+'</a>' : '<div class="lb-zb'+(full?' lb-full':'')+'">'+inner+'</div>';
}
/* ---------- weight budget: images ≤150 KB, video ≤1.5 MB (with a poster), page ≤3 MB ---------- */
function lb_dataBytes(u){ u = String(u||''); if(u.indexOf('data:')!==0) return 0; var i = u.indexOf(','); return Math.round((u.length - i - 1) * 3 / 4); }
var LB_WMEMO = {};
function lb_zWeight(z){
  var sig = ''; try{ sig = JSON.stringify([z.type, z.style, z.content, z.motion]); }catch(e){}
  if(sig && LB_WMEMO[sig]) return LB_WMEMO[sig];
  var w0 = lb_zWeight0(z); if(sig){ if(Object.keys(LB_WMEMO).length > 60) LB_WMEMO = {}; LB_WMEMO[sig] = w0; }
  return w0;
}
function lb_zWeight0(z){
  var c = z.content || {}, w = {img:0, vid:0, markup:0, over:[]};
  if(z.type==='image') w.img = lb_dataBytes(c.src) || lb_num(c.size);
  else if(z.type==='video'){ w.vid = lb_dataBytes(c.src) || lb_num(c.size); w.img = lb_dataBytes(c.poster) || lb_num(c.posterSize); if(!c.poster) w.over.push('poster'); }
  var mk = ''; try{ mk = lb_zoneInner(z, {k:1}) || ''; }catch(e){}
  try{ w.markup = new Blob([mk]).size; }catch(e){ w.markup = mk.length; }
  w.total = w.img + w.vid + w.markup;
  if(w.img > LB_CFG.budget.image) w.over.push('image');
  if(w.vid > LB_CFG.budget.video) w.over.push('video');
  if(w.markup > LB_CFG.budget.markup) w.over.push('markup');
  return w;
}
function lb_kb(b){ return b >= 1048576 ? (Math.round(b/104857.6)/10)+' MB' : Math.max(1, Math.round(b/1024))+' KB'; }
function lb_zoneHTML(z, w, h, place, extraCls, extraStyle){
  place = place || {k:1, imgOnly:false};
  var cls = 'lb-z lb-zt-'+esc(z.type)+(z.style==='full'?' lb-zfull':' lb-zcard')+(place.imgOnly?' lb-imgonly':'')+(extraCls?' '+extraCls:'');
  return '<div class="'+cls+'" data-zid="'+esc(z.id)+'" data-k="'+place.k+'" style="'+(extraStyle||'')+'width:'+w+'px;height:'+h+'px;--lb-k:'+place.k+';--lb-w:'+w+'px;'+lb_blendCSS(z)+'">'+lb_zoneInner(z, place)+'</div>';
}
function lb_scClear(){
  var old = document.getElementById('lb-sc'); if(old) old.remove();
  LB_POP.timers.forEach(clearTimeout); LB_POP.timers = [];
  if(LB_POP.io){ LB_POP.io.disconnect(); LB_POP.io = null; }
  if(LB_POP.figIO){ LB_POP.figIO.disconnect(); LB_POP.figIO = null; }
  if(LB_POP.vis){ LB_POP.vis.disconnect(); LB_POP.vis = null; }
  LB_POP.float = [];
  lb_mtSweep();
}
var LB_LAST = null;
function lb_scLayout(){
  var pg = lb_scPage();
  var allowed = pg && lb_scOn() && (lb_pageOn(pg.key) || (window.LB_INJECT && LB_INJECT.forceCanvas)) && (window.innerWidth >= LB_CFG.deskMin) && (lb_fineMouse() || (window.LB_INJECT && LB_INJECT.forceCanvas));
  if(!allowed){ if(document.getElementById('lb-sc')) lb_scClear(); LB_LAST = null; lb_report(null, null); return; }
  var geom = lb_scGeom(); if(!geom){ lb_scClear(); return; }
  var S = lb_sc();
  var strength = window.LB_INJECT && LB_INJECT.strength != null ? LB_INJECT.strength : null;
  var zonesOf = function(side){ return (S.zones[side]||[]).map(function(z){ if(strength==null) return z; var c = lb_clone(z); if(c.style==='full' || c.type==='figure' || c.type==='image'){ c.blend = c.blend || {}; c.blend.strength = strength; if(!c.blend.fade || c.blend.fade==='none') c.blend.fade = 'both'; } return c; }); };
  var acc = {total:0};
  var placed = {l:lb_scPlace(zonesOf('l'), geom.gL, geom, pg, {acc:acc}), r:lb_scPlace(zonesOf('r'), geom.gR, geom, pg, {acc:acc})};
  placed.total = acc.total;
  var full = window.LB_INJECT && LB_INJECT.fullHeight;
  var sig = JSON.stringify([geom.vw, geom.vh, geom.gL, geom.gR, geom.bandTop, geom.bandBottom, geom.obstacles, geom.stickyTop, ST.theme, S.zones, pg, strength, lb_reduced()]);
  if(sig === LB_LAST && document.getElementById('lb-sc')){ lb_report(geom, placed); return; }
  LB_LAST = sig; lb_scClear();
  var t0 = performance.now();
  var html = '';
  ['l','r'].forEach(function(side){
    placed[side].forEach(function(p){
      if(p.st!=='ok') return;
      var left = side==='l' ? p.x : geom.vw - p.x - p.w;
      if(p.view){
        /* one sticky copy per free stretch of the page (between full-width bands), centred in the window */
        (full ? p.view.segs.slice(0, 1) : p.view.segs).forEach(function(sg, si){
          html += '<div class="lb-track" style="top:'+(geom.bandTop + sg.top)+'px;left:'+Math.round(left)+'px;width:'+p.w+'px;height:'+(full ? p.h : sg.h)+'px">'+
            lb_zoneHTML(p.z, p.w, p.h, p, (full ? '' : 'lb-sticky')+(p.z.mode==='float' && !full ? ' lb-float' : '')+' lb-zview'+(si ? ' lb-zcopy' : ''), full ? '' : 'top:'+p.view.stickyTop+'px;')+'</div>';
        });
        return;
      }
      var travels = (p.z.mode==='sticky' || p.z.mode==='float') && !full;
      html += '<div class="lb-track" style="top:'+(geom.bandTop + p.top)+'px;left:'+Math.round(left)+'px;width:'+p.w+'px;height:'+(travels ? p.trackH : p.h)+'px">'+
        lb_zoneHTML(p.z, p.w, p.h, p, (travels ? 'lb-sticky' : '')+(p.z.mode==='float' && !full ? ' lb-float' : ''), travels ? 'top:'+geom.stickyTop+'px;' : '')+'</div>';
    });
  });
  if(!html){ lb_report(geom, placed); return; }
  var layer = document.createElement('div');
  layer.id = 'lb-sc'; layer.className = 'lb-sc'; layer.setAttribute('aria-label', 'Offers');
  layer.innerHTML = html;
  document.body.appendChild(layer);
  lb_scAfter(placed);
  LB_PERF.layoutMs = performance.now() - t0;
  lb_report(geom, placed);
}
/* entrance animation, motion templates, float, popup triggers */
function lb_scAfter(placed){
  var layer = document.getElementById('lb-sc');
  var figs = [].slice.call(document.querySelectorAll('#lb-sc .lb-anim'));
  if(figs.length){
    if(lb_reduced() || !window.IntersectionObserver) figs.forEach(function(f){ f.classList.add('lb-in', 'lb-static'); });
    else {
      LB_POP.figIO = new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('lb-in'); LB_POP.figIO.unobserve(e.target); } }); }, {threshold:.25});
      figs.forEach(function(f){ LB_POP.figIO.observe(f); });
    }
  }
  lb_mtStart(layer);
  /* pause everything that is off-screen (and every video while the tab is hidden) */
  if(window.IntersectionObserver){
    LB_POP.vis = new IntersectionObserver(function(es){ es.forEach(function(e){ e.target.classList.toggle('lb-paused', !e.isIntersecting); lb_vidSync(e.target, e.isIntersecting); }); }, {threshold:0});
    [].forEach.call(layer.querySelectorAll('.lb-z'), function(el){ LB_POP.vis.observe(el); });
  } else [].forEach.call(layer.querySelectorAll('.lb-z'), function(el){ lb_vidSync(el, true); });
  ['l','r'].forEach(function(s){ placed[s].forEach(function(p){ if(p.st==='ok' && p.z.mode==='float' && p.fl > 0){ [].forEach.call(layer.querySelectorAll('.lb-z[data-zid="'+p.z.id+'"]'), function(el){ LB_POP.float.push({el:el, range:p.fl, cur:0}); }); } }); });
  lb_floatTick(true);
  if(window.LB_INJECT && LB_INJECT.noPopups) return;
  var pops = []; ['l','r'].forEach(function(s){ placed[s].forEach(function(p){ if(p.st==='ok' && p.z.type==='popup') pops.push(p.z); }); });
  var my = LB_POP.view;
  pops.forEach(function(z){
    var c = z.content || {}, val = Math.max(0, lb_num(c.value, 3));
    if(c.trigger==='time') LB_POP.timers.push(setTimeout(function(){ if(LB_POP.view===my) lb_popAuto(z); }, val*1000));
    else if(c.trigger==='view' && window.IntersectionObserver){
      var el = document.querySelector('#lb-sc .lb-z[data-zid="'+z.id+'"]'); if(!el) return;
      if(!LB_POP.io) LB_POP.io = new IntersectionObserver(function(es){ es.forEach(function(e){ var zz = e.target.__lbz; if(!zz) return;
        if(e.isIntersecting){ if(!e.target.__lbt) e.target.__lbt = setTimeout(function(){ if(LB_POP.view===my) lb_popAuto(zz); }, Math.max(0, lb_num((zz.content||{}).value, 3))*1000); }
        else { clearTimeout(e.target.__lbt); e.target.__lbt = null; } }); }, {threshold:.6});
      el.__lbz = z; LB_POP.io.observe(el);
    }
  });
}
function lb_vidSync(zone, visible){
  [].forEach.call(zone.querySelectorAll('video'), function(v){
    if(visible && !document.hidden && !lb_reduced()){ if(v.preload==='none') v.preload = 'auto'; var pr = v.play(); if(pr && pr.catch) pr.catch(function(){}); }
    else { try{ v.pause(); }catch(e){} }
  });
}
document.addEventListener('visibilitychange', function(){ [].forEach.call(document.querySelectorAll('#lb-sc .lb-z'), function(z){ lb_vidSync(z, !document.hidden && !z.classList.contains('lb-paused')); }); });
/* FLOAT: the zone stays fixed while you scroll and drifts a few cm up and down, tied to the
   scroll position and eased; transform only (no layout shift); still under reduced motion */
function lb_floatTarget(range){ var y = window.pageYOffset || 0; return Math.round(range * Math.sin(y * 2 * Math.PI / LB_CFG.floatPeriod) * 100) / 100; }
function lb_floatTick(instant){
  if(!LB_POP.float.length) return;
  var t2 = performance.now(); try{ lb_floatTick0(instant); } finally { lb_perfNote(performance.now() - t2, 'float'); }
}
function lb_floatTick0(instant){
  if(lb_reduced()){ LB_POP.float.forEach(function(f){ f.cur = 0; f.el.style.transform = ''; }); return; }
  var busy = false;
  LB_POP.float.forEach(function(f){
    if(!f.el.isConnected) return;
    var tg = lb_floatTarget(f.range);
    f.cur = instant ? tg : f.cur + (tg - f.cur) * 0.12;
    if(Math.abs(tg - f.cur) < 0.15) f.cur = tg; else busy = true;
    f.cur = Math.max(-f.range, Math.min(f.range, f.cur));
    f.el.style.transform = f.cur ? 'translate3d(0,'+f.cur.toFixed(2)+'px,0)' : '';
  });
  if(busy && !LB_POP.raf) LB_POP.raf = requestAnimationFrame(function(){ LB_POP.raf = 0; lb_floatTick(false); });
}
window.addEventListener('scroll', function(){ if(LB_POP.float.length && !LB_POP.raf) LB_POP.raf = requestAnimationFrame(function(){ LB_POP.raf = 0; lb_floatTick(false); }); }, {passive:true});

function lb_store(kind){ try{ return kind==='s' ? window.sessionStorage : window.localStorage; }catch(e){ return null; } }
function lb_popCapOk(z){
  var f = (z.content||{}).freq || 'session', key = 'lb-pop-'+z.id;
  try{
    if(f==='session'){ var s = lb_store('s'); return !(s && s.getItem(key)); }
    var l = lb_store('l'), ms = f==='week' ? 7*86400000 : 86400000, at = Number(l && l.getItem(key)) || 0;
    return Date.now() - at > ms;
  }catch(e){ return true; }
}
function lb_popMark(z){
  var f = (z.content||{}).freq || 'session', key = 'lb-pop-'+z.id;
  try{ if(f==='session'){ var s = lb_store('s'); if(s) s.setItem(key, '1'); } else { var l = lb_store('l'); if(l) l.setItem(key, String(Date.now())); } }catch(e){}
}
/* automatic opening obeys the cap and opens at most once per page view, never over another popup */
function lb_popAuto(z){
  if(LB_POP.shown || document.querySelector('.modal-back, .zm') || !lb_popCapOk(z)) return;
  if(!document.querySelector('#lb-sc .lb-z[data-zid="'+z.id+'"]')) return;
  lb_popShow(z);
}
function lb_popShow(z){
  LB_POP.shown = true; lb_popMark(z);
  var c = z.content || {}, p = P(c.product), href = lb_safeHref(c.href) || '#/c/new';
  var img = p ? productImg(p, (p.colors.indexOf(c.color)>=0 ? c.color : p.colors[0]), {ratio:'ratio-wide', label:false}) : '';
  openModal('<div class="lb-popc" data-lb-pop="'+esc(z.id)+'">'+(img?'<a class="lb-pop-img" href="'+esc(href)+'" tabindex="-1" aria-hidden="true">'+img+'</a>':'')+
    '<div class="lb-pop-t">'+esc(c.title||'')+'</div>'+(c.sub?'<p class="lb-pop-s">'+esc(c.sub)+'</p>':'')+
    '<a class="btn btn-primary btn-block" href="'+esc(href)+'">'+esc(c.cta||'Shop now')+'</a>'+
    '<button type="button" class="btn btn-ghost btn-block lb-pop-no" data-act="close-modal">No thanks</button></div>', {title:c.popTitle||'Offer for you', cls:'lb-pop'});
}
ACT['lb-pop'] = function(el){
  var id = el.getAttribute('data-zid'), S = lb_sc(), z = S.zones.l.concat(S.zones.r).filter(function(x){ return x.id===id; })[0];
  if(z) lb_popShow(z);   /* a tap is the shopper asking: it always opens (and counts toward the cap) */
};
/* the window the shopper sees, measured: header, zones and content boxes in window px (editor + all-sizes check) */
function lb_viewReport(mode){
  var hdr = document.querySelector('.hdr'), vw = document.documentElement.clientWidth, vh = window.innerHeight, hb = hdr ? hdr.getBoundingClientRect().height : 0;
  if(mode==='rows'){
    var t = CUR.page==='category' ? document.querySelector('[data-testid="cat-grid"]') : (function(){ var g = lb_scGeom(); var hs = [].slice.call(document.querySelectorAll('main.page .sec-hd')); return hs.filter(function(h){ return h.getBoundingClientRect().top + scrollY > g.bandTop; })[0]; })();
    if(t){ var off = CUR.page==='category' ? Math.round((vh - hb) * 0.144) : 64; window.scrollTo(0, Math.max(0, t.getBoundingClientRect().top + scrollY - hb - off)); }
    LB_LAST = null; lb_scLayout();
  }
  hb = hdr ? hdr.getBoundingClientRect().bottom : 0;
  var rects = [];
  [].forEach.call(document.querySelectorAll('main.page .pcard-w, main.page .hm-cat, main.page .sec-hd h2, main.page .cat-hd h1, main.page .hm-set, main.page .cat-side, main.page .hm-finder'), function(e){
    var r = e.getBoundingClientRect(); if(r.bottom <= hb || r.top >= vh || !r.width) return;
    rects.push({x:Math.round(r.left), y:Math.round(Math.max(hb, r.top)), w:Math.round(r.width), h:Math.round(Math.min(vh, r.bottom) - Math.max(hb, r.top)), k:e.className.indexOf('pcard')>=0 || e.className.indexOf('hm-cat')>=0 ? 'card' : 'text'});
  });
  var zones = [].slice.call(document.querySelectorAll('#lb-sc .lb-z')).filter(function(e){ var r = e.getBoundingClientRect(); return r.bottom > hb && r.top < vh && r.width; }).map(function(e){ var r = e.getBoundingClientRect(); return {id:e.getAttribute('data-zid'), x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height), view:e.classList.contains('lb-zview'), img:e.classList.contains('lb-imgonly')}; });
  var g = lb_scGeom();
  return {vw:vw, vh:vh, hdr:Math.round(hb), gL:g ? g.gL : 0, gR:g ? g.gR : 0, rects:rects, zones:zones, page:CUR.page};
}
/* the preview frames report their geometry to the editor */
function lb_report(geom, placed){
  if(!(window.LB_INJECT && LB_INJECT.report) || window.parent===window) return;
  var pl = {};
  if(placed){ ['l','r'].forEach(function(s){ pl[s] = placed[s].map(function(p){ return {id:p.z.id, st:p.st, top:p.top, h:p.h, w:p.w, x:p.x, k:p.k, moved:p.moved, imgOnly:p.imgOnly, trackH:p.trackH||p.h, wt:p.wt, view:p.view ? {U:p.view.U, v:p.view.v, gap:p.view.gap, above:p.view.above, below:p.view.below, custom:p.view.custom, stickyTop:p.view.stickyTop} : null}; }); }); pl.total = placed.total || 0; }
  var vr = null; if(LB_INJECT.window && !LB_INJECT.fullHeight){ try{ if(!LB_INJECT.__scrolled){ LB_INJECT.__scrolled = 1; setTimeout(function(){ lb_viewReport('rows'); }, 0); } vr = lb_viewReport(); }catch(e){} }
  try{ window.parent.postMessage({lb:'geom', fid:LB_INJECT.fid, geom:geom, placed:pl, view:vr, h:document.documentElement.scrollHeight}, '*'); }catch(e){}
}
/* re-place after every render, resize, font load, and content growth */
(function(){
  var raf = 0, sched = function(){ if(raf) return; raf = requestAnimationFrame(function(){ raf = 0; var t = performance.now(); try{ lb_scLayout(); }catch(e){ console.error(e); } lb_perfNote(performance.now() - t, 'layout'); }); };
  /* SPEED FIRST: after a page is drawn, nothing happens for the side canvas until the browser
     is idle (and only on a desktop with a mouse) — phones and tablets never run it */
  /* wait for a quiet moment with real time to spare (≥ 12 ms), a few tries at most */
  var ric = function(f, tries){ if(!window.requestIdleCallback){ setTimeout(f, 300); return; }
    requestIdleCallback(function(dl){ if(dl.timeRemaining() >= 12 || dl.didTimeout || (tries||0) >= 3) f(); else ric(f, (tries||0) + 1); }, {timeout:1500}); };
  var idle = function(){ requestAnimationFrame(function(){ setTimeout(function(){ ric(sched); }, 0); }); };
  var app = document.getElementById('app');
  if(app && window.MutationObserver) new MutationObserver(function(){
    LB_POP.view++; LB_POP.shown = false; LB_LAST = null; lb_focusSoon();
    if(lb_scWanted()) idle(); else if(document.getElementById('lb-sc') || (window.LB_INJECT && LB_INJECT.report)) sched();
  }).observe(app, {childList:true});
  window.addEventListener('resize', function(){ if(lb_scWanted() || document.getElementById('lb-sc')) sched(); });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if(lb_scWanted()) idle(); });
  var lastH = 0;
  if(window.ResizeObserver && app){ try{ new ResizeObserver(function(es){ var h = Math.round(es[0].contentRect.height); if(h === lastH) return; lastH = h;
    /* zones already on the page follow at once; a first placement still waits for idle time */
    if(document.getElementById('lb-sc') || (window.LB_INJECT && LB_INJECT.report)) sched(); else if(lb_scWanted()) idle(); }).observe(app); }catch(e){} }
  try{ var mq = window.matchMedia('(prefers-reduced-motion: reduce)'); var f = function(){ LB_LAST = null; sched(); }; if(mq.addEventListener) mq.addEventListener('change', f); else if(mq.addListener) mq.addListener(f); }catch(e){}
  window.LB_SCHED = sched;
})();

/* =====================================================================
   6b. MOTION TEMPLATES (18) — built from the garment drawings, CSS/SVG + one small ticker
   ---------------------------------------------------------------------
   The owner picks a template and products; lb_mtItems() turns the product pick into an
   ordered sequence (frames). Every frame carries data-i; the ticker moves .is-on / .is-prev
   along. Continuous motion is CSS keyframes. Reduced motion: no ticker, no keyframes —
   the first frame stands still.
   ===================================================================== */
var LB_MTPL = [
  {id:'colourCycle',   en:'Colour cycle',          bn:'রং বদল',                 ref:[112, 320], desc:['One product through all its colours', 'একটা প্রোডাক্ট সব রঙে একে একে']},
  {id:'poseCycle',     en:'Pose cycle',            bn:'পোজ বদল',                ref:[112, 440], desc:['Dress-form figure in 4 poses wearing the pick', 'ফিগার ৪টা পোজে, বাছাই করা পোশাকে']},
  {id:'turnAround',    en:'Turn-around',           bn:'ঘুরে দেখানো',             ref:[112, 300], desc:['Front, side, back', 'সামনে, পাশে, পেছনে']},
  {id:'slideUp',       en:'Slide-up stack',        bn:'নিচ থেকে উঠে আসা',         ref:[112, 300], desc:['Cards rise one after another', 'কার্ড একটার পর একটা উঠে আসে']},
  {id:'flipDeck',      en:'Flip deck',             bn:'কার্ড উল্টানো',            ref:[112, 300], desc:['Each card flips to the next', 'কার্ড উল্টে পরেরটা']},
  {id:'ticker',        en:'Vertical ticker',       bn:'উপরে চলা তালিকা',          ref:[112, 420], desc:['A slow list of products rolling upward', 'প্রোডাক্টের তালিকা ধীরে উপরে চলে']},
  {id:'spotlight',     en:'Spotlight sweep',       bn:'আলো বুলিয়ে',              ref:[112, 300], desc:['A soft light passes over each piece', 'প্রতিটার উপর হালকা আলো সরে যায়']},
  {id:'fade',          en:'Fade carousel',         bn:'মিলিয়ে বদল',              ref:[112, 300], desc:['Calm cross-fade with name and price', 'নাম আর দামসহ শান্তভাবে বদলায়']},
  {id:'zoomPulse',     en:'Zoom pulse',            bn:'আস্তে বড়-ছোট',             ref:[112, 260], desc:['Gentle breathing zoom', 'আস্তে আস্তে বড়-ছোট হয়']},
  {id:'outfit',        en:'Outfit builder',        bn:'পুরো পোশাক সাজানো',         ref:[112, 440], desc:['Top, bottom and shoes assemble', 'উপর, নিচ আর জুতো এসে মেলে']},
  {id:'comboSwap',     en:'Combo pair swap',       bn:'কম্বো জোড়া বদল',          ref:[112, 300], desc:['Two pieces side by side, pairs swap', 'পাশাপাশি দুটো, জোড়া বদলায়']},
  {id:'priceTag',      en:'Price-tag reveal',      bn:'দামের ট্যাগ',              ref:[112, 300], desc:['A price tag swings in', 'দামের ট্যাগ দুলে আসে']},
  {id:'countdown',     en:'Countdown offer',       bn:'অফার শেষ হতে বাকি',        ref:[112, 320], desc:['Live countdown to the end of the offer', 'অফার শেষ হতে কত সময় বাকি']},
  {id:'newDrop',       en:'"New in" drop',         bn:'নতুন এসেছে',               ref:[112, 300], desc:['New pieces drop in with a bounce', 'নতুন পোশাক লাফিয়ে নামে']},
  {id:'wipe',          en:'Before/after colour wipe', bn:'রঙের তুলনা',           ref:[112, 300], desc:['One colour wipes into another', 'এক রং সরে আরেক রং আসে']},
  {id:'hanger',        en:'Floating hanger sway',  bn:'হ্যাঙ্গারে দোলা',           ref:[112, 320], desc:['The piece sways gently on a hanger', 'হ্যাঙ্গারে আস্তে দোলে']},
  {id:'tilt',          en:'3D tilt card',          bn:'৩ডি হেলানো কার্ড',          ref:[112, 300], desc:['A card that tilts in depth', 'গভীরতায় হেলে থাকা কার্ড']},
  {id:'lookbook',      en:'Mini lookbook',         bn:'ছোট লুকবুক',               ref:[112, 440], desc:['Four looks, each in turn', 'চারটা লুক, একে একে']},
  {id:'walkOut',       en:'Walk-out (signature)',  bn:'হেঁটে বেরিয়ে আসা (সিগনেচার)', ref:[112, 440], sig:true, desc:['A model walks out of the page towards you in 3D, wearing the pick', 'মডেল পেজের ভেতর থেকে হেঁটে আপনার দিকে বেরিয়ে আসে, বাছাই করা পোশাকে']}
];
function lb_mtDef(id){ for(var i = 0; i < LB_MTPL.length; i++) if(LB_MTPL[i].id===id) return LB_MTPL[i]; return LB_MTPL[0]; }
function lb_seed(str){ var h = 2166136261; for(var i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return function(){ h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }
/* the product pick → an ordered list of {p, c} (and groups for outfits/combos) */
function lb_mtItems(m, zid){
  m = m || {}; var src = m.src || {}, items = [], groups = [];
  var vis = lb_visibleProducts();
  var every = function(p){ p.colors.forEach(function(c){ items.push({p:p.id, c:c}); }); };
  var first = function(p){ items.push({p:p.id, c:p.colors[0]}); };
  if(src.kind==='rule') (src.products||[]).map(P).filter(Boolean).forEach(every);
  else if(src.kind==='cat') vis.filter(function(p){ return p.cat===src.cat; }).forEach(src.allColours ? every : first);
  else if(src.kind==='sub') vis.filter(function(p){ return src.sub && (typeof ca_inPath==='function' ? ca_inPath(p, src.sub) : String(p.sub||'').indexOf(src.sub)===0); }).forEach(src.allColours ? every : first);
  else if(src.kind==='combo'){
    combos().filter(function(c){ return c.active && (!(src.combos||[]).length || src.combos.indexOf(c.id)>=0); }).forEach(function(c){
      var g = lb_comboItems(c).map(function(x){ return {p:x.product, c:x.color}; }); groups.push({name:c.name, price:c.price, items:g, href:'#/combo/'+c.id}); g.forEach(function(x){ items.push(x); });
    });
  }
  else (src.picks||[]).forEach(function(x){ if(P(x.p)) items.push({p:x.p, c:(P(x.p).colors.indexOf(x.c)>=0 ? x.c : P(x.p).colors[0])}); });
  if(m.order==='price') items.sort(function(a, b){ return P(a.p).price - P(b.p).price; });
  else if(m.order==='shuffle'){ var r = lb_seed(String(zid||'z')); for(var i = items.length-1; i > 0; i--){ var j = Math.floor(r()*(i+1)); var t0 = items[i]; items[i] = items[j]; items[j] = t0; } }
  if(items.length > LB_CFG.mtMax) items = items.slice(0, LB_CFG.mtMax);
  return {items:items, groups:groups};
}
function lb_isGroup(pid, g){ var p = P(pid), c = p && CAT(p.cat); return !!(c && c.group===g); }
/* the clever part: a template that suits the pick */
function lb_mtSuggest(m){
  var r = lb_mtItems(m), it = r.items, src = (m||{}).src || {};
  if(src.kind==='combo' || r.groups.length) return 'comboSwap';
  var prods = {}; it.forEach(function(x){ prods[x.p] = 1; }); var np = Object.keys(prods).length;
  if(np===1 && it.length >= 3) return 'colourCycle';
  var tops = it.filter(function(x){ return lb_isGroup(x.p, 'top'); }), bots = it.filter(function(x){ return lb_isGroup(x.p, 'bottom'); });
  if(tops.length && bots.length) return np <= 3 ? 'walkOut' : 'outfit';
  if(it.length && it.every(function(x){ return (P(x.p).tag||'')==='New'; })) return 'newDrop';
  if(it.length && it.every(function(x){ var p = P(x.p); return p.compareAt > p.price; })) return 'priceTag';
  if(it.length >= 8) return 'ticker';
  return 'fade';
}
function lb_mtCap(x, extra){
  var p = P(x.p); if(!p) return '';
  return '<span class="lb-mt-cap lb-txt"><b>'+esc(extra || p.name)+'</b><span class="price">'+fmt(p.price)+'</span></span>';
}
function lb_shoes(hex){ var s = mixHex(hex, '#000000', .45); return '<svg class="lb-g" viewBox="0 0 200 70" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="M20 20 L78 20 L82 48 L96 58 L14 58 L16 40 Z" fill="'+hex+'"/><path d="M14 54 L96 54 L96 62 L14 62 Z" fill="'+s+'"/><path d="M118 20 L176 20 L184 40 L186 58 L104 58 L118 48 Z" fill="'+hex+'"/><path d="M104 54 L186 54 L186 62 L104 62 Z" fill="'+s+'"/></svg>'; }
function lb_hangerSVG(){ return '<svg class="lb-hook" viewBox="0 0 200 60" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><path d="M100 4 q10 0 10 9 q0 7 -10 11 L100 30 M36 54 L100 30 L164 54" fill="none" stroke="#8b8378" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
/* one frame */
function lb_fr(i, inner, href, cls){
  var tag = href ? 'a' : 'div';
  return '<'+tag+' class="lb-fr'+(i===0?' is-on':'')+(cls?' '+cls:'')+'" data-i="'+i+'"'+(href?' href="'+esc(href)+'"':'')+(i!==0?' tabindex="-1"':'')+'>'+inner+'</'+tag+'>';
}
var LB_MT_BUILD = {
  colourCycle:function(it){
    var p = P((it[0]||{}).p);
    var dots = '<span class="lb-mt-dots lb-txt">'+it.map(function(x, i){ return '<i data-i="'+i+'" class="'+(i===0?'is-on':'')+'" style="background:'+COL(x.c).hex+'"></i>'; }).join('')+'</span>';
    return it.map(function(x, i){ return lb_fr(i, '<span class="lb-mt-stage">'+lb_gar(x.p, x.c)+'</span>'+lb_mtCap(x, COL(x.c).name), '#/p/'+x.p+'?color='+x.c); }).join('')+(p ? dots : '');
  },
  poseCycle:function(it, z){
    var top = it.filter(function(x){ return lb_isGroup(x.p, 'top'); })[0], bot = it.filter(function(x){ return lb_isGroup(x.p, 'bottom'); })[0];
    var c = {polo:top ? COL(top.c).hex : (z.content||{}).polo, denim:bot ? COL(bot.c).hex : (z.content||{}).denim, boots:(z.content||{}).boots,
      topType:top ? (P(top.p).garment || CAT(P(top.p).cat).garment) : 'polo', botType:bot ? (P(bot.p).garment || CAT(P(bot.p).cat).garment) : 'trouser'};
    var href = top ? '#/p/'+top.p : (bot ? '#/p/'+bot.p : '#/c/new');
    var n = (z.motion && z.motion.ai && z.motion.ai.poses) || 4;
    var out = ''; for(var i = 0; i < n; i++) out += lb_fr(i, '<span class="lb-mt-fig">'+lb_figureSVG(c, i)+'</span>', href);
    return out;
  },
  turnAround:function(it){
    return it.map(function(x, i){ return lb_fr(i, '<span class="lb-mt-stage lb-turn"><span class="lb-turn-f">'+lb_gar(x.p, x.c, 'front')+'</span><span class="lb-turn-b">'+lb_gar(x.p, x.c, 'back')+'</span></span>'+lb_mtCap(x), '#/p/'+x.p+'?color='+x.c); }).join('');
  },
  ticker:function(it){
    var row = function(x){ var p = P(x.p); return '<a class="lb-tk-row" href="#/p/'+x.p+'?color='+x.c+'" tabindex="-1"><span class="lb-tk-img">'+lb_gar(x.p, x.c)+'</span><span class="lb-tk-t lb-txt"><b>'+esc(p.name)+'</b><span class="price">'+fmt(p.price)+'</span></span></a>'; };
    var list = it.map(row).join('');
    return '<div class="lb-tk" style="--lb-tkd:'+Math.max(6, it.length * 2.4)+'s"><div class="lb-tk-in">'+list+list+'</div></div>';
  },
  outfit:function(it, z){
    var tops = it.filter(function(x){ return lb_isGroup(x.p, 'top'); }), bots = it.filter(function(x){ return lb_isGroup(x.p, 'bottom'); });
    if(!tops.length) tops = it.slice(0, 1); if(!bots.length) bots = [{p:'slim-chino-trousers', c:'navy'}].filter(function(x){ return P(x.p); });
    var n = Math.min(LB_CFG.mtMax, Math.max(tops.length, bots.length)), shoeHex = (z.content||{}).boots || '#5B3A26', out = '';
    for(var i = 0; i < n; i++){ var a = tops[i % tops.length], b = bots[i % bots.length]; if(!a || !b) continue;
      out += lb_fr(i, '<span class="lb-of"><span class="lb-pc lb-pc1">'+lb_gar(a.p, a.c)+'</span><span class="lb-pc lb-pc2">'+lb_gar(b.p, b.c)+'</span><span class="lb-pc lb-pc3">'+lb_shoes(shoeHex)+'</span></span>'+
        '<span class="lb-mt-cap lb-txt"><b>'+esc(t('Look'))+' '+(i+1)+'</b><span class="price">'+fmt(P(a.p).price + P(b.p).price)+'</span></span>', '#/p/'+a.p+'?color='+a.c); }
    return out;
  },
  comboSwap:function(it, z, groups){
    if(!groups.length){ for(var k = 0; k + 1 < it.length; k += 2) groups.push({name:'', price:P(it[k].p).price + P(it[k+1].p).price, items:[it[k], it[k+1]], href:'#/p/'+it[k].p}); if(!groups.length && it.length) groups.push({items:[it[0], it[0]], price:P(it[0].p).price, href:'#/p/'+it[0].p}); }
    return groups.map(function(g, i){
      var reg = g.items.reduce(function(s, x){ return s + P(x.p).price; }, 0);
      return lb_fr(i, '<span class="lb-cs">'+g.items.slice(0, 2).map(function(x, j){ return '<span class="lb-cs-p lb-cs-'+j+'">'+lb_gar(x.p, x.c)+'</span>'; }).join('')+'</span>'+
        '<span class="lb-mt-cap lb-txt"><b>'+esc(g.name || 'Set of '+g.items.length)+'</b><span class="price">'+fmt(g.price || reg)+'</span>'+(reg > g.price ? '<span class="lb-save">Save '+fmt(reg - g.price)+'</span>' : '')+'</span>', g.href);
    }).join('');
  },
  priceTag:function(it){
    return it.map(function(x, i){ var p = P(x.p); return lb_fr(i, '<span class="lb-mt-stage">'+lb_gar(x.p, x.c)+'<span class="lb-tag lb-txt"><span class="price">'+fmt(p.price)+'</span>'+(p.compareAt > p.price ? '<s>'+fmt(p.compareAt)+'</s>' : '')+'</span></span>'+
      '<span class="lb-mt-cap lb-txt"><b>'+esc(p.name)+'</b></span>', '#/p/'+x.p+'?color='+x.c); }).join('');
  },
  countdown:function(it, z){
    var end = (z.motion && z.motion.endsAt) || (lb_dayAdd(lb_today(), 0)+'T23:59:59+06:00');
    return it.map(function(x, i){ return lb_fr(i, '<span class="lb-mt-stage">'+lb_gar(x.p, x.c)+'</span>'+lb_mtCap(x), '#/p/'+x.p+'?color='+x.c); }).join('')+
      '<span class="lb-cd lb-txt" data-end="'+esc(end)+'"><small>Ends in</small><b>--:--:--</b></span>';
  },
  newDrop:function(it){
    return it.map(function(x, i){ return lb_fr(i, '<span class="lb-mt-stage"><span class="lb-drop">'+lb_gar(x.p, x.c)+'</span><span class="lb-new lb-txt">NEW</span></span>'+lb_mtCap(x), '#/p/'+x.p+'?color='+x.c); }).join('');
  },
  wipe:function(it){
    var pairs = []; var byP = {}; it.forEach(function(x){ (byP[x.p] = byP[x.p] || []).push(x.c); });
    Object.keys(byP).forEach(function(pid){ var cs = byP[pid].length > 1 ? byP[pid] : P(pid).colors; for(var k = 0; k + 1 < cs.length; k++) pairs.push([pid, cs[k], cs[k+1]]); });
    pairs = pairs.slice(0, 8);
    return pairs.map(function(q, i){ return lb_fr(i, '<span class="lb-mt-stage lb-wipe"><span class="lb-w-a">'+lb_gar(q[0], q[1])+'</span><span class="lb-w-bw"><span class="lb-w-b">'+lb_gar(q[0], q[2])+'</span><i class="lb-w-line"></i></span></span>'+
      '<span class="lb-mt-cap lb-txt"><b>'+esc(COL(q[1]).name)+' → '+esc(COL(q[2]).name)+'</b></span>', '#/p/'+q[0]+'?color='+q[2]); }).join('');
  },
  hanger:function(it){
    return it.map(function(x, i){ return lb_fr(i, '<span class="lb-mt-stage lb-hang"><span class="lb-hang-in">'+lb_hangerSVG()+lb_gar(x.p, x.c)+'</span></span>'+lb_mtCap(x), '#/p/'+x.p+'?color='+x.c); }).join('');
  },
  lookbook:function(it){
    var tops = it.filter(function(x){ return lb_isGroup(x.p, 'top'); }), bots = it.filter(function(x){ return lb_isGroup(x.p, 'bottom'); });
    if(!tops.length) tops = it; if(!bots.length) bots = [{p:'slim-chino-trousers', c:'khaki'}, {p:'slim-chino-trousers', c:'navy'}].filter(function(x){ return P(x.p); });
    var n = Math.min(4, Math.max(1, tops.length)), cells = '';
    for(var i = 0; i < n; i++){ var a = tops[i % tops.length], b = bots[i % bots.length];
      cells += '<a class="lb-lk'+(i===0?' is-on':'')+'" data-i="'+i+'" href="#/p/'+a.p+'?color='+a.c+'" tabindex="-1"><span class="lb-lk-t">'+lb_gar(a.p, a.c)+'</span>'+(b ? '<span class="lb-lk-b">'+lb_gar(b.p, b.c)+'</span>' : '')+'</a>'; }
    return '<span class="lb-lkg">'+cells+'</span><span class="lb-mt-cap lb-txt lb-lk-cap">'+Array.apply(null, Array(n)).map(function(_, i){ return '<b data-i="'+i+'" class="'+(i===0?'is-on':'')+'">'+esc(t('Look'))+' '+(i+1)+' / '+n+'</b>'; }).join('')+'</span>';
  }
};
/* WALK-OUT (signature): the outfit walks from deep in the page towards you — scale + rise on a
   gentle perspective orbit, legs and arms on a walk cycle, a floor shadow that grows; one loop per
   outfit. All transform/opacity. Reduced motion: the near, still pose. */
LB_MT_BUILD.walkOut = function(it, z){
  var tops = it.filter(function(x){ return lb_isGroup(x.p, 'top'); }), bots = it.filter(function(x){ return lb_isGroup(x.p, 'bottom'); });
  if(!tops.length) tops = it.slice(0, 1); if(!bots.length) bots = [{p:'slim-chino-trousers', c:'navy'}].filter(function(x){ return P(x.p); });
  var n = Math.max(1, Math.min(LB_CFG.mtMax, Math.max(tops.length, bots.length))), boots = (z.content||{}).boots || '#5B3A26', out = '';
  for(var i = 0; i < n; i++){ var a = tops[i % tops.length], b = bots[i % bots.length]; if(!a) continue;
    out += lb_fr(i, '<span class="lb-wk-cam"><span class="lb-wk">'+lb_walkerSVG(a, b, boots)+'</span></span>', '#/p/'+a.p+'?color='+a.c); }
  return out;
};
function lb_walkerSVG(a, b, boots){
  var pa = P(a.p), top = COL(a.c).hex, topType = pa ? (pa.garment || CAT(pa.cat).garment) : 'polo';
  var den = b ? COL(b.c).hex : '#3D5878', denD = mixHex(den, '#000000', .22), seam = mixHex(den, '#ffffff', .25), sole = mixHex(boots, '#000000', .45);
  var form = mixHex(lb_hexOf(lb_bgColor()), '#BFB2A3', .55), formD = mixHex(form, '#000000', .12);
  var leg = function(cls, x){ return '<g class="'+cls+'"><path d="M'+x+' 262 L'+(x+38)+' 262 L'+(x+35)+' 510 L'+(x+5)+' 510 Z" fill="'+den+'"/><path d="M'+(x+19)+' 266 L'+(x+20)+' 506" stroke="'+seam+'" stroke-width="1.2" opacity=".55"/>'+
    '<path d="M'+(x-1)+' 506 L'+(x+37)+' 506 L'+(x+40)+' 532 L'+(x+48)+' 544 L'+(x-6)+' 544 L'+(x-4)+' 524 Z" fill="'+boots+'"/><path d="M'+(x-6)+' 540 L'+(x+48)+' 540 L'+(x+48)+' 547 L'+(x-6)+' 547 Z" fill="'+sole+'"/></g>'; };
  var arm = function(cls, d){ return '<g class="'+cls+'"><path d="'+d+'" fill="'+form+'"/></g>'; };
  var g = garmentSVG(topType, top, 'front').replace('<svg class="garment" ', '<svg x="10" y="78" width="180" height="200" preserveAspectRatio="none" ');
  return '<svg class="lb-wk-svg" viewBox="24 0 152 560" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">'+
    '<ellipse class="lb-wk-sh" cx="100" cy="550" rx="70" ry="9" fill="#000" opacity=".16"/>'+
    leg('lb-wk-ll', 62)+leg('lb-wk-lr', 100)+
    '<path d="M60 250 L140 250 L141 270 L59 270 Z" fill="'+denD+'"/>'+
    arm('lb-wk-al', 'M30 124 L44 150 L47 244 Q40 258 31 247 L25 150 Z')+arm('lb-wk-ar', 'M170 124 L156 150 L153 244 Q160 258 169 247 L175 150 Z')+
    '<ellipse cx="100" cy="44" rx="21" ry="26" fill="'+form+'"/><path d="M91 64 L109 64 L111 92 L89 92 Z" fill="'+formD+'"/>'+g+
  '</svg>';
}
['slideUp','flipDeck','spotlight','fade','zoomPulse','tilt'].forEach(function(id){
  LB_MT_BUILD[id] = function(it){ return it.map(function(x, i){ return lb_fr(i, '<span class="lb-mt-stage">'+lb_gar(x.p, x.c)+(id==='spotlight' ? '<i class="lb-sweep" aria-hidden="true"></i>' : '')+'</span>'+lb_mtCap(x), '#/p/'+x.p+'?color='+x.c); }).join(''); };
});
/* frames count for the ticker */
function lb_mtHTML(z, place){
  var m = z.motion || {}, def = lb_mtDef(m.tpl), r = lb_mtItems(m, z.id);
  if(!r.items.length) return '<div class="lb-mt lb-mt-empty"><span class="lb-txt">'+esc(lbL('pickProducts'))+'</span></div>';
  var html = ''; try{ html = LB_MT_BUILD[def.id](r.items, z, r.groups); }catch(e){ console.error(e); }
  var n = (html.match(/class="lb-fr[ "]/g) || []).length || (html.match(/class="lb-lk[ "]/g) || []).length;
  var spd = Math.max(0.8, lb_num(m.speed, def.id==='walkOut' ? 5.6 : 2.4));
  return '<div class="lb-mt lb-mt-'+def.id+'" data-n="'+n+'" data-spd="'+Math.round(spd*1000)+'" style="--lb-spd:'+spd+'s">'+html+'</div>';
}
/* the ticker: one interval per animated zone; nothing runs under reduced motion */
var LB_MT = [];
function lb_mtStart(root){
  if(!root) return;
  [].forEach.call(root.querySelectorAll('.lb-mt[data-n]'), function(el){
    if(el.__lbmt) return; el.__lbmt = 1;
    var n = +el.getAttribute('data-n'), spd = +el.getAttribute('data-spd') || 2400;
    if(n > 1 && !lb_reduced()){
      var cur = 0, owed = false, hz = el.closest('.lb-z') || el, rec = {el:el, id:0};
      /* TA-2 (T14): the slider rule here too — the mouse on the zone holds it;
         when the mouse leaves, a turn that came due meanwhile happens at once
         and the normal rhythm restarts from there. */
      /* QA V12b (SC-02b): the leave handler turns the zone in the same event
         (left === true skips the :hover test, which can still read true while
         the leave is being dispatched) instead of a setTimeout(0) that a busy
         page could push past the 150 ms budget. */
      var step = function(left){
        if(!el.isConnected){ clearInterval(rec.id); return; }
        if(document.hidden || el.closest('.lb-paused')) return;
        if(left !== true && hz.matches(':hover')){ owed = true; return; }
        owed = false;
        var t1 = performance.now();
        var prev = cur; cur = (cur + 1) % n;
        el.setAttribute('data-cur', cur);
        [].forEach.call(el.querySelectorAll('[data-i]'), function(f){
          var i = +f.getAttribute('data-i');
          f.classList.toggle('is-on', i===cur); f.classList.toggle('is-prev', i===prev);
          if(f.tagName==='A') f.setAttribute('tabindex', i===cur ? '0' : '-1');
        });
        lb_perfNote(performance.now() - t1, 'ticker');
      };
      rec.id = setInterval(step, spd);
      hz.addEventListener('pointerleave', function(ev){
        if(ev.pointerType !== 'mouse' || !owed) return;
        clearInterval(rec.id); rec.id = setInterval(step, spd);
        step(true);
      });
      LB_MT.push(rec);
    }
  });
  lb_cdStart();
}
function lb_mtSweep(){ LB_MT = LB_MT.filter(function(x){ if(!x.el.isConnected){ clearInterval(x.id); return false; } return true; }); }
/* countdown text (not motion: it keeps counting under reduced motion too) */
var LB_CD = 0;
function lb_cdStart(){
  if(LB_CD) return;
  var tick = function(){
    var els = document.querySelectorAll('.lb-cd[data-end]');
    if(!els.length){ clearInterval(LB_CD); LB_CD = 0; return; }
    [].forEach.call(els, function(e){
      var ms = Math.max(0, Date.parse(e.getAttribute('data-end')) - Date.now()), s = Math.floor(ms/1000);
      var b = e.querySelector('b'); if(b) b.textContent = ('0'+Math.floor(s/3600)).slice(-2)+':'+('0'+Math.floor(s%3600/60)).slice(-2)+':'+('0'+s%60).slice(-2);
    });
  };
  tick(); LB_CD = setInterval(tick, 1000);
}

/* =====================================================================
   7. PREVIEW FRAMES (the same shop, inside the admin, at a chosen width)
   ===================================================================== */
var LB_FRAMES = {};
function lb_frameState(extra){
  var s = {layout:lb_clone(lb_layout()), sideCanvas:lb_clone(lb_sc()), theme:ST.theme, lang:ST.lang, adminLang:ST.adminLang||'en'};
  for(var k in extra) s[k] = extra[k];
  return s;
}
function lb_frameBoot(el, w, h, state){
  if(!el || !LB_SRC) return;
  var fid = el.getAttribute('data-fid') || lb_id('f'); el.setAttribute('data-fid', fid);
  state.fid = fid; LB_FRAMES[fid] = {el:el, w:w, h:h, state:state};
  var head = '<base href="about:srcdoc"><script>window.LB_INJECT='+JSON.stringify(state).replace(/</g, '\\u003c')+';try{location.hash=LB_INJECT.hash||"#/";}catch(e){}<\/script>';
  var ifr = el.querySelector('iframe');
  ifr.style.width = w+'px'; ifr.style.height = h+'px';
  lb_frameScale(el);
  ifr.srcdoc = LB_SRC.replace(/<head([^>]*)>/i, function(m){ return m + head; });
}
function lb_frameScale(el){
  var ifr = el.querySelector('iframe'), f = LB_FRAMES[el.getAttribute('data-fid')]; if(!ifr || !f) return;
  var box = el.clientWidth || 300, s = Math.min(1, box / f.w);
  ifr.style.transform = 'scale('+s+')';
  el.style.height = Math.round((f.fullH || f.h) * s)+'px';
  el.setAttribute('data-scale', s);
  return s;
}
/* push new settings into a running frame (same page origin → direct; else reload it) */
function lb_framePush(el, extra){
  var f = el && LB_FRAMES[el.getAttribute('data-fid')]; if(!f) return;
  for(var k in extra) f.state[k] = extra[k];
  var ifr = el.querySelector('iframe');
  try{ if(ifr.contentWindow && typeof ifr.contentWindow.lb_inject==='function'){ ifr.contentWindow.lb_inject(JSON.parse(JSON.stringify(f.state))); return; } }catch(e){}
  lb_frameBoot(el, f.w, f.h, f.state);
}
window.addEventListener('message', function(ev){
  var d = ev.data; if(!d || d.lb!=='geom') return;
  var f = LB_FRAMES[d.fid]; if(!f) return;
  f.geom = d.geom; f.placed = d.placed; f.view = d.view || null;
  if(f.state.fullHeight && d.h && Math.abs((f.fullH||0) - d.h) > 2){ f.fullH = d.h; var ifr = f.el.querySelector('iframe'); if(ifr) ifr.style.height = d.h+'px'; lb_frameScale(f.el); }
  if(typeof f.onGeom==='function') try{ f.onGeom(d); }catch(e){ console.error(e); }
});
window.addEventListener('resize', function(){ Object.keys(LB_FRAMES).forEach(function(k){ var f = LB_FRAMES[k]; if(f.el && f.el.isConnected){ lb_frameScale(f.el); if(f.onGeom && f.geom) f.onGeom({geom:f.geom, placed:f.placed}); } else delete LB_FRAMES[k]; }); });

/* inside a preview frame: take the settings, never save, never greet */
function lb_inject(state){
  window.LB_INJECT = state;
  try{
    if(state.layout) ST.layout = state.layout;
    if(state.sideCanvas) ST.sideCanvas = state.sideCanvas;
    if(state.theme) ST.theme = state.theme;
    if(state.lang) ST.lang = state.lang;
    if(state.adminLang) ST.adminLang = state.adminLang;
    ST.seenIntro = true;
    document.documentElement.classList.add('lb-pvmode');
    if(typeof applyTheme==='function') applyTheme();
  }catch(e){}
  if(typeof render==='function' && typeof CUR!=='undefined' && CUR && CUR.page){ var y = window.pageYOffset; render(true); window.scrollTo(0, y); LB_LAST = null; lb_scLayout(); }
}
/* scroll a preview frame to the section being edited */
var LB_FOCUS_T = 0;
function lb_focusSoon(){
  if(!(window.LB_INJECT && LB_INJECT.focus)) return;
  clearTimeout(LB_FOCUS_T); var n = 0;
  /* again a little later: the boot puts the scroll back once more and late content settles */
  var run = function(){ lb_focusNow(); if(++n < 3) LB_FOCUS_T = setTimeout(run, n===1 ? 350 : 900); };
  LB_FOCUS_T = setTimeout(run, 60);
}
function lb_focusNow(){
  var id = window.LB_INJECT && LB_INJECT.focus; if(!id) return;
  var w = document.createTreeWalker(document.getElementById('app') || document.body, NodeFilter.SHOW_COMMENT, null), n;
  while((n = w.nextNode())){
    if(n.nodeValue==='lb:'+id){
      var el = n.nextSibling; while(el && el.nodeType!==1) el = el.nextSibling;
      if(el && el.getClientRects().length){ var hdr = document.querySelector('.hdr'), off = hdr ? hdr.getBoundingClientRect().height : 0; window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - off - 12)); }
      return;
    }
  }
}

/* boot: wrap the pages and apply preview settings once every file has loaded */
(function(){
  try{
    var oL = window.loadState;
    if(typeof oL==='function' && !oL._lb){
      var nl = function(){ var r = oL.apply(this, arguments); try{ lb_wrapPages(); lb_wrapAdmin(); if(window.LB_INJECT) lb_inject(LB_INJECT); }catch(e){ console.error(e); } return r; };
      nl._lb = true; window.loadState = nl;
    }
    var oS = window.saveState;
    if(typeof oS==='function' && !oS._lb){ var ns = function(){ if(window.LB_INJECT) return; return oS.apply(this, arguments); }; ns._lb = true; window.saveState = ns; }
    if(window.LB_INJECT){ var oI = window.maybeIntro; window.maybeIntro = function(){}; }
  }catch(e){}
})();

/* =====================================================================
   8. ADMIN · Page layout  (#/admin/layout)
   ===================================================================== */
function lb_secName(s){
  if(s.type==='builtin') return lbLang()==='bn' ? (LB_BUILTIN_BN[s.ref] || s.ref) : (LB_BUILTIN_EN[s.ref] || s.ref);
  return s.name || (LB_TYPES[s.type] ? (lbLang()==='bn' ? LB_TYPES[s.type].bn : LB_TYPES[s.type].en) : s.type);
}
function lb_typeName(k){ var T = LB_TYPES[k]; return T ? (lbLang()==='bn' ? T.bn : T.en) : k; }
function lb_typeDesc(k){ var T = LB_TYPES[k]; return T ? (lbLang()==='bn' ? T.desc : T.descEn) : ''; }
function lb_secType(s){ return s.type==='builtin' ? lbL('builtIn') : lb_typeName(s.type); }
function lb_dateTxt(day){ if(!day) return ''; if(lbLang()==='bn') return lb_bnDate(day); var d = new Date(day+'T00:00:00Z'); return d.toLocaleDateString('en-GB', {day:'numeric', month:'short', timeZone:'UTC'}); }
function lb_devName(d){ return lbL(d==='phone' ? 'devPhone' : (d==='desktop' ? 'devDesktop' : 'devBoth')); }
function lb_secStatus(s){
  var today = lb_today(), bits = [];
  if(s.active===false) bits.push('<span class="lb-st off">'+esc(lbL('off'))+'</span>');
  else if(!lb_dateOk(s, today)) bits.push('<span class="lb-st wait">'+esc(s.start && today < s.start ? lbL('startsOn')+' '+lb_dateTxt(s.start) : lbL('endedOn')+' '+lb_dateTxt(s.end))+'</span>');
  else bits.push('<span class="lb-st on">'+esc(lbL('on'))+'</span>');
  if(s.start || s.end) bits.push('<span>'+esc((s.start ? lb_dateTxt(s.start) : lbL('today'))+' – '+(s.end ? lb_dateTxt(s.end) : lbL('keepsOn')))+'</span>');
  bits.push('<span>'+esc(lb_devName(s.device))+'</span>');
  return bits.join('<i aria-hidden="true">·</i>');
}
function lb_admUI(){ return ui('lb-adm', {page:'home', view:'desk', focus:''}); }
function lb_admList(){
  var u = lb_admUI();
  if(u.page==='home') return lb_list('home');
  if(u.page==='cat:*') return lb_layout().cat.default;
  var cid = u.page.slice(4); var L = lb_layout();
  return L.cat.byCat[cid] || null;
}
function lb_admPageHash(){
  var u = lb_admUI();
  if(u.page==='home') return '#/';
  if(u.page==='cat:*'){ var c0 = DB.categories.filter(function(c){ return !c.hidden; })[0]; return '#/c/'+(c0 ? c0.id : 'new'); }
  return '#/c/'+u.page.slice(4);
}
function lb_catName(c){ return lbLang()==='bn' ? (c.bn || c.name) : c.name; }
function lb_swBtn(on, act, label, extra){
  return '<button type="button" class="lb-swbtn" role="switch" aria-checked="'+(on?'true':'false')+'" data-act="'+act+'" '+(extra||'')+'><span class="switch'+(on?' on':'')+'" aria-hidden="true"></span><span class="lb-swl">'+esc(label)+'</span></button>';
}
function lb_gripSVG(){ return '<svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="4" r="1.6"/><circle cx="10" cy="4" r="1.6"/><circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="4" cy="16" r="1.6"/><circle cx="10" cy="16" r="1.6"/></g></svg>'; }
function lb_rowHTML(s, i, n, no){
  var name = lb_secName(s), isB = s.type==='builtin';
  return '<li class="lb-srow'+(s.active===false?' is-off':'')+'" data-i="'+i+'" data-sid="'+esc(s.id)+'">'+
    '<button type="button" class="lb-handle" aria-label="'+esc(lbL('dragTo')+': '+name)+'" data-lb-drag="'+i+'">'+lb_gripSVG()+'</button>'+
    '<span class="lb-sno">'+lbN(no)+'</span>'+
    '<div class="lb-sinfo"><div class="lb-sname">'+esc(name)+(s.example?' <span class="tag gold">'+esc(lbL('example1'))+'</span>':'')+'</div>'+
      '<div class="lb-smeta"><span class="lb-stype">'+esc(lb_secType(s))+'</span><i aria-hidden="true">·</i>'+lb_secStatus(s)+'</div></div>'+
    '<div class="lb-sact">'+
      '<button type="button" class="lb-ib" data-act="lb-move" data-i="'+i+'" data-d="-1" aria-label="'+esc(lbL('moveUp'))+'"'+(no===1?' disabled':'')+'>'+ico('up',18)+'</button>'+
      '<button type="button" class="lb-ib" data-act="lb-move" data-i="'+i+'" data-d="1" aria-label="'+esc(lbL('moveDown'))+'"'+(no===n?' disabled':'')+'>'+ico('down',18)+'</button>'+
      lb_swBtn(s.active!==false, 'lb-tog', s.active!==false ? lbL('on') : lbL('off'), 'data-i="'+i+'"')+
      '<button type="button" class="lb-ib lb-ibt" data-act="lb-edit" data-i="'+i+'">'+ico('edit',16)+'<span>'+esc(lbL('edit'))+'</span></button>'+
      '<button type="button" class="lb-ib lb-ibt" data-act="lb-dup" data-i="'+i+'"'+(isB?' disabled title="'+esc(lbL('onceOnly'))+'"':'')+'>'+ico('layers',16)+'<span>'+esc(lbL('copy'))+'</span></button>'+
      '<button type="button" class="lb-ib lb-ibt" data-act="lb-hide" data-i="'+i+'">'+ico('eye',16)+'<span>'+esc(lbL('remove'))+'</span></button>'+
    '</div></li>';
}
function lb_listHTML(){
  var u = lb_admUI(), list = lb_admList();
  if(!list){
    var cid = u.page.slice(4), c = CAT(cid);
    return '<div class="lb-empty card p20"><div class="h3">'+esc(c ? lb_catName(c) : cid)+' — '+esc(lbL('catDefaultNow'))+'</div>'+
      '<p class="small text2 mt8">'+esc(lbL('catDefaultNote'))+'</p>'+
      '<button type="button" class="btn btn-primary mt12" data-act="lb-own" data-cat="'+esc(cid)+'">'+ico('plus',16)+esc(lbL('ownLayout'))+'</button></div>';
  }
  var shown = [], hidden = [];
  list.forEach(function(s, i){ (s.hidden ? hidden : shown).push({s:s, i:i}); });
  var rows = shown.map(function(x, k){ return lb_rowHTML(x.s, x.i, shown.length, k+1); }).join('');
  var own = u.page.indexOf('cat:')===0 && u.page!=='cat:*' ? '<button type="button" class="btn btn-ghost btn-sm" data-act="lb-unown" data-cat="'+esc(u.page.slice(4))+'">'+esc(lbL('backToDefault'))+'</button>' : '';
  return '<ol class="lb-slist" id="lb-slist" aria-label="'+esc(lbL('listLabel'))+'">'+rows+'</ol>'+
    '<div class="lb-addrow"><button type="button" class="btn btn-primary" data-act="lb-add">'+ico('plus',17)+esc(lbL('addSection'))+'</button>'+own+'</div>'+
    (hidden.length ? '<details class="lb-hidden"><summary>'+esc(lbL('hiddenSecs'))+' ('+lbN(hidden.length)+') — '+esc(lbL('neverDeleted'))+'</summary><ul>'+hidden.map(function(x){
      return '<li><span>'+esc(lb_secName(x.s))+'</span><button type="button" class="btn btn-sm btn-secondary" data-act="lb-unhide" data-i="'+x.i+'">'+esc(lbL('restore'))+'</button></li>'; }).join('')+'</ul></details>' : '');
}
function lb_pagePicker(){
  var u = lb_admUI(), L = lb_layout();
  var chip = function(v, label, extra){ return '<button type="button" class="chip'+(u.page===v?' on':'')+'" data-act="lb-page" data-v="'+esc(v)+'" aria-pressed="'+(u.page===v)+'">'+esc(label)+(extra||'')+'</button>'; };
  return '<div class="lb-pages" role="group" aria-label="'+esc(lbL('whichPage'))+'">'+chip('home', lbL('pageHome'))+chip('cat:*', lbL('pageAllCats'))+
    DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){ return chip('cat:'+c.id, lb_catName(c), L.cat.byCat[c.id] ? ' <span class="lb-dot"></span>' : ''); }).join('')+'</div>';
}
PAGES['lb-admin'] = {
  layout:'admin',
  title:function(){ return lbL('layoutTitle'); },
  render:function(){
    var u = lb_admUI();
    return '<div class="lb-adm">'+
      '<div class="lb-hd"><div><div class="eyebrow">'+esc(lbL('layoutEyebrow'))+'</div><h1 class="h1">'+esc(lbL('layoutTitle'))+'</h1>'+
      '<p class="text2 lb-lead">'+esc(lbL('layoutLead'))+'</p></div>'+
      '<div class="lb-hd-act"><button type="button" class="btn btn-secondary" data-act="lb-example">'+ico('spark',16)+esc(lbL('example'))+'</button></div></div>'+
      lb_pagePicker()+
      '<div class="lb-grid">'+
        '<div class="lb-col"><div class="lb-colhd"><span class="h3">'+esc(lbL('sections'))+'</span><span class="xs muted">'+esc(lbL('dragHint'))+'</span></div><div id="lb-listbox">'+lb_listHTML()+'</div></div>'+
        '<div class="lb-col lb-pvcol"><div class="lb-colhd"><span class="h3">'+esc(lbL('livePreview'))+'</span>'+
          '<div class="seg lb-seg" role="group" aria-label="'+esc(lbL('livePreview'))+'">'+[['phone','phone'],['desk','desktop'],['both','both']].map(function(v){ return '<button type="button" data-act="lb-view" data-v="'+v[0]+'" class="'+(u.view===v[0]?'on':'')+'">'+esc(lbL(v[1]))+'</button>'; }).join('')+'</div></div>'+
          '<div class="lb-pvs v-'+esc(u.view)+'">'+
            '<figure class="lb-pv lb-pv-phone"><figcaption>'+esc(lbL('phone'))+' · '+LB_CFG.previewPhone[0]+' px</figcaption><div class="lb-frame" id="lb-fr-phone"><iframe title="'+esc(lbL('phonePv'))+'" tabindex="-1"></iframe></div></figure>'+
            '<figure class="lb-pv lb-pv-desk"><figcaption>'+esc(lbL('desktop'))+' · '+LB_CFG.previewDesk[0]+' px</figcaption><div class="lb-frame" id="lb-fr-desk"><iframe title="'+esc(lbL('deskPv'))+'" tabindex="-1"></iframe></div></figure>'+
          '</div><p class="xs muted mt8">'+esc(lbL('previewNote'))+'</p></div>'+
      '</div>'+lb_snapPanel()+'</div>';
  },
  after:function(){ lb_admBootFrames(); lb_dragInit(); }
};
function lb_admBootFrames(){
  var u = lb_admUI(), hash = lb_admPageHash();
  var st = function(){ return lb_frameState({hash:hash, forceCompose:true, focus:u.focus||'', noPopups:true}); };
  var ph = document.getElementById('lb-fr-phone'), dk = document.getElementById('lb-fr-desk');
  if(ph) lb_frameBoot(ph, LB_CFG.previewPhone[0], LB_CFG.previewPhone[1], st());
  if(dk) lb_frameBoot(dk, LB_CFG.previewDesk[0], LB_CFG.previewDesk[1], st());
}
var LB_PUSH_T = 0;
function lb_admPush(draftList){
  clearTimeout(LB_PUSH_T);
  LB_PUSH_T = setTimeout(function(){
    var u = lb_admUI(), lay = lb_clone(lb_layout());
    if(draftList){ if(u.page==='home') lay.home.sections = draftList; else if(u.page==='cat:*') lay.cat.default = draftList; else lay.cat.byCat[u.page.slice(4)] = draftList; }
    var ex = {layout:lay, theme:ST.theme, hash:lb_admPageHash(), focus:u.focus||''};
    ['lb-fr-phone','lb-fr-desk'].forEach(function(id){ var el = document.getElementById(id); if(el) lb_framePush(el, ex); });
  }, 120);
}
function lb_admRefresh(){
  var box = document.getElementById('lb-listbox'); if(box) box.innerHTML = lb_listHTML();
  var pk = document.querySelector('.lb-adm .lb-pages[aria-label="'+lbL('whichPage')+'"]'); if(pk) pk.outerHTML = lb_pagePicker();
  lb_admPush();
}
function lb_admSave(focusId){ var u = lb_admUI(); if(focusId!==undefined) u.focus = focusId; saveState(); lb_admRefresh(); }

ACT['lb-page'] = function(el){ var u = lb_admUI(); u.page = el.getAttribute('data-v'); u.focus = ''; rerender(); };
ACT['lb-view'] = function(el){
  var u = lb_admUI(); u.view = el.getAttribute('data-v');
  var box = document.querySelector('.lb-pvs'); if(box){ box.className = 'lb-pvs v-'+u.view; }
  [].forEach.call(document.querySelectorAll('.lb-seg [data-act="lb-view"]'), function(b){ b.classList.toggle('on', b.getAttribute('data-v')===u.view); });
  Object.keys(LB_FRAMES).forEach(function(k){ var f = LB_FRAMES[k]; if(f.el && f.el.isConnected) lb_frameScale(f.el); });
};
ACT['lb-move'] = function(el){
  var list = lb_admList(); if(!list) return;
  var i = +el.getAttribute('data-i'), d = +el.getAttribute('data-d');
  var j = i + d; while(j >= 0 && j < list.length && list[j].hidden) j += d;
  if(j < 0 || j >= list.length) return;
  var s = list.splice(i, 1)[0]; list.splice(j, 0, s);
  lb_admSave(s.id);
  setTimeout(function(){ var b = document.querySelector('.lb-srow[data-sid="'+s.id+'"] [data-act="lb-move"][data-d="'+d+'"]'); if(b && !b.disabled) b.focus(); else { var r = document.querySelector('.lb-srow[data-sid="'+s.id+'"] .lb-handle'); if(r) r.focus(); } }, 0);
  toast(lb_secName(s)+' — '+lbL(d<0 ? 'movedUp' : 'movedDown'));
};
ACT['lb-tog'] = function(el){ var list = lb_admList(), s = list && list[+el.getAttribute('data-i')]; if(!s) return; s.active = s.active===false; lb_admSave(s.id); };
ACT['lb-hide'] = function(el){ var list = lb_admList(), s = list && list[+el.getAttribute('data-i')]; if(!s) return; s.hidden = true; lb_admSave(''); toast(lb_secName(s)+' '+lbL('removedToast')); };
ACT['lb-unhide'] = function(el){ var list = lb_admList(), s = list && list[+el.getAttribute('data-i')]; if(!s) return; s.hidden = false; lb_admSave(s.id); };
ACT['lb-dup'] = function(el){
  var list = lb_admList(), i = +el.getAttribute('data-i'), s = list && list[i]; if(!s || s.type==='builtin') return;
  var c = lb_clone(s); c.id = lb_id('s'); c.name = lb_secName(s)+' '+lbL('copySuffix'); delete c.example;
  list.splice(i+1, 0, c); lb_admSave(c.id); toast(lbL('copied'));
};
ACT['lb-own'] = function(el){ var cid = el.getAttribute('data-cat'), L = lb_layout(); L.cat.byCat[cid] = lb_clone(L.cat.default); lb_admSave(''); };
ACT['lb-unown'] = function(el){ if(!confirm(lbL('confirmUnown'))) return; var L = lb_layout(); delete L.cat.byCat[el.getAttribute('data-cat')]; lb_admSave(''); };
ACT['lb-example'] = function(){
  var u = lb_admUI(); u.page = 'home';
  var list = lb_list('home'), ex = list.filter(function(s){ return s.id==='s-new-offer'; })[0];
  if(!ex){ ex = lb_offerExample(); list.push(ex); }
  var i = list.indexOf(ex); list.splice(i, 1);
  var r = -1; list.forEach(function(s, k){ if(s.type==='builtin' && s.ref==='reviews') r = k; });
  list.splice(r>=0 ? r : list.length, 0, ex);
  ex.active = true; ex.hidden = false; var today = lb_today(); ex.start = today; if(!ex.end || ex.end < today) ex.end = lb_dayAdd(today, 7);
  u.focus = ex.id; saveState(); rerender(); toast(lbL('exampleToast'));
};
/* ---- drag to reorder (mouse, pen and touch — one pointer path) ---- */
function lb_dragInit(){
  var box = document.getElementById('lb-listbox'); if(!box || box.__lbd) return; box.__lbd = 1;
  box.addEventListener('pointerdown', function(ev){
    var h = ev.target.closest('[data-lb-drag]'); if(!h || ev.button > 0) return;
    var row = h.closest('.lb-srow'), ol = row && row.parentElement; if(!row) return;
    ev.preventDefault();
    var rect = row.getBoundingClientRect(), y0 = ev.clientY, moved = false;
    var ph = document.createElement('li'); ph.className = 'lb-ph'; ph.style.height = rect.height+'px';
    var start = function(){
      moved = true; row.parentElement.insertBefore(ph, row.nextSibling);
      row.classList.add('lb-dragging'); row.style.width = rect.width+'px'; row.style.top = rect.top+'px'; row.style.left = rect.left+'px';
    };
    var mv = function(e){
      var dy = e.clientY - y0; if(!moved && Math.abs(dy) < 5) return; if(!moved) start();
      row.style.transform = 'translateY('+dy+'px)';
      var mid = e.clientY, sibs = [].slice.call(ol.querySelectorAll('.lb-srow:not(.lb-dragging)'));
      var before = null; for(var k = 0; k < sibs.length; k++){ var r = sibs[k].getBoundingClientRect(); if(mid < r.top + r.height/2){ before = sibs[k]; break; } }
      if(before) ol.insertBefore(ph, before); else ol.appendChild(ph);
      if(e.clientY < 70) window.scrollBy(0, -12); else if(e.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
    };
    var up = function(){
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      if(!moved) return;
      ol.insertBefore(row, ph); ph.remove(); row.classList.remove('lb-dragging'); row.style.transform = row.style.width = row.style.top = row.style.left = '';
      var list = lb_admList(), order = [].slice.call(ol.querySelectorAll('.lb-srow')).map(function(r){ return r.getAttribute('data-sid'); });
      var vis = list.filter(function(s){ return !s.hidden; }), hid = list.filter(function(s){ return s.hidden; });
      var by = {}; vis.forEach(function(s){ by[s.id] = s; });
      var next = order.map(function(id){ return by[id]; }).filter(Boolean).concat(hid);
      list.length = 0; next.forEach(function(s){ list.push(s); });
      lb_admSave(row.getAttribute('data-sid'));
      toast(lbL('orderKept'));
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
}
/* ---- add a section: type picker + where it goes ---- */
ACT['lb-add'] = function(){
  var list = lb_admList(); if(!list) return;
  var u = lb_admUI(), vis = list.filter(function(s){ return !s.hidden; });
  var defBefore = '';
  vis.forEach(function(s){ if(s.type==='builtin' && s.ref==='reviews') defBefore = s.id; });
  if(!defBefore && u.page!=='home'){ vis.forEach(function(s){ if(!defBefore && s.type==='builtin' && (s.ref==='catMain' || s.ref==='grid')) defBefore = s.id; }); }
  var D = ui('lb-addd', {}); D.type = D.type || 'banner'; D.before = defBefore;
  var build = function(){
    return '<div class="lb-tpick" role="radiogroup" aria-label="'+esc(lbL('sectionType'))+'">'+Object.keys(LB_TYPES).map(function(k){ var T = LB_TYPES[k];
      return '<button type="button" role="radio" aria-checked="'+(D.type===k)+'" class="lb-tp'+(D.type===k?' on':'')+'" data-act="lb-addtype" data-v="'+k+'">'+ico(T.icon,20)+'<span class="lb-tp-n">'+esc(lb_typeName(k))+'</span><span class="lb-tp-d">'+esc(lb_typeDesc(k))+'</span></button>'; }).join('')+'</div>'+
      '<label class="label mt16" for="lb-before">'+esc(lbL('whereGoes'))+'</label><select class="input" id="lb-before" data-change="lb-addbefore">'+
        vis.map(function(s){ return '<option value="'+esc(s.id)+'"'+(D.before===s.id?' selected':'')+'>'+esc(lb_secName(s)+' '+lbL('above'))+'</option>'; }).join('')+
        '<option value=""'+(!D.before?' selected':'')+'>'+esc(lbL('atEnd'))+'</option></select>'+
      '<div class="lb-mfoot"><button type="button" class="btn btn-ghost" data-act="close-modal">'+esc(lbL('cancel'))+'</button><button type="button" class="btn btn-primary" data-act="lb-addgo">'+esc(lbL('addGo'))+ico('right',16)+'</button></div>';
  };
  openModal(build(), {title:lbL('whatKind'), wide:true, rebuild:build, cls:'lb-modal'});
};
ACT['lb-addtype'] = function(el){ ui('lb-addd', {}).type = el.getAttribute('data-v'); refreshModal(); };
CHANGE['lb-addbefore'] = function(el){ ui('lb-addd', {}).before = el.value; };
ACT['lb-addgo'] = function(){
  var D = ui('lb-addd', {}), list = lb_admList(); if(!list) return;
  var today = lb_today();
  var s = {id:lb_id('s'), type:D.type, name:lb_typeName(D.type), active:true, start:today, end:'', device:'both', data:lb_typeDefaults(D.type)};
  var at = list.length; list.forEach(function(x, k){ if(x.id===D.before) at = k; });
  list.splice(at, 0, s); saveState(); closeModal();
  lb_admSave(s.id);
  lb_openEditor(s.id, true);
};
/* ---- the section editor ---- */
function lb_fieldsFor(type){
  var src = [['category',lbL('srcCat')],['tag',lbL('srcTag')],['manual',lbL('srcManual')]];
  var tones = [['brand',lbL('toneBrand')],['dark',lbL('toneDark')],['light',lbL('toneLight')],['sale',lbL('toneSale')]];
  var F = {
    banner:[['eyebrow',lbL('fEyebrow'),'text'],['title',lbL('fTitle'),'text'],['sub',lbL('fSub'),'text'],['cta',lbL('fCta'),'text'],['href',lbL('fHref'),'link'],['tone',lbL('fTone'),'seg',tones],['product',lbL('fProduct'),'product'],['color',lbL('fColor'),'color']],
    offerStrip:[['text',lbL('fText'),'text'],['link',lbL('fLink'),'text'],['href',lbL('fGo'),'link'],['tone',lbL('fTone'),'seg',tones]],
    productRow:[['title',lbL('fTitle2'),'text'],['sub',lbL('fSub'),'text'],['source',lbL('fFrom'),'select',src],['cat',lbL('fCat'),'cat',null,function(d){ return d.source==='category'; }],['tag',lbL('fTag'),'select',[['Bestseller',lbL('tBest')],['New',lbL('tNew')],['sale',lbL('tSale')]],function(d){ return d.source==='tag'; }],['ids',lbL('fPick'),'products',null,function(d){ return d.source==='manual'; }],['limit',lbL('fLimit'),'number'],['more',lbL('fMore'),'text'],['moreHref',lbL('fMoreHref'),'link']],
    comboRow:[['title',lbL('fTitle2'),'text'],['sub',lbL('fSub'),'text'],['source',lbL('fComboFrom'),'select',[['fixed',lbL('comboFixed')],['auto',lbL('comboAuto')]]],['ids',lbL('fWhichSets'),'combos',null,function(d){ return d.source!=='auto'; }],['rule',lbL('fRule'),'rule',null,function(d){ return d.source==='auto'; }],['limit',lbL('fLimit'),'number']],
    categoryTiles:[['title',lbL('fTitle2'),'text'],['cats',lbL('fCats'),'cats']],
    reviews:[['title',lbL('fTitle2'),'text'],['limit',lbL('fReviews'),'number']],
    journal:[['title',lbL('fTitle2'),'text'],['limit',lbL('fPosts'),'number']],
    richText:[['title',lbL('fRtTitle'),'text'],['html',lbL('fRt'),'textarea']],
    spacer:[['phone',lbL('fSpPhone'),'number'],['desktop',lbL('fSpDesk'),'number']]
  };
  F.productGrid = F.productRow;
  return F[type] || [];
}
function lb_fieldHTML(f, d){
  var k = f[0], label = f[1], kind = f[2], opts = f[3], id = 'lbf-'+k, v = d[k];
  var wrap = function(inner, forId){ return '<div class="lb-f"><label class="label"'+(forId?' for="'+forId+'"':'')+'>'+esc(label)+'</label>'+inner+'</div>'; };
  if(kind==='text' || kind==='link') return wrap('<input class="input" id="'+id+'" data-input="lb-ed" data-k="'+k+'" value="'+esc(v==null?'':v)+'"'+(kind==='link'?' placeholder="#/c/new"':'')+'>', id);
  if(kind==='number') return wrap('<input class="input" type="number" inputmode="numeric" min="0" id="'+id+'" data-input="lb-ed" data-k="'+k+'" data-num="1" value="'+esc(v==null?'':v)+'">', id);
  if(kind==='textarea') return wrap('<textarea class="input lb-ta" id="'+id+'" data-input="lb-ed" data-k="'+k+'" rows="5">'+esc(v||'')+'</textarea>', id);
  if(kind==='select') return wrap('<select class="input" id="'+id+'" data-change="lb-edsel" data-k="'+k+'">'+opts.map(function(o){ return '<option value="'+esc(o[0])+'"'+(v===o[0]?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>', id);
  if(kind==='seg') return wrap('<div class="lb-segs" role="group">'+opts.map(function(o){ return '<button type="button" class="chip'+(v===o[0]?' on':'')+'" aria-pressed="'+(v===o[0])+'" data-act="lb-edset" data-k="'+k+'" data-v="'+esc(o[0])+'">'+esc(o[1])+'</button>'; }).join('')+'</div>');
  if(kind==='cat') return wrap('<select class="input" id="'+id+'" data-change="lb-edsel" data-k="'+k+'">'+DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){ return '<option value="'+c.id+'"'+(v===c.id?' selected':'')+'>'+esc(lb_catName(c))+'</option>'; }).join('')+'</select>', id);
  if(kind==='product') return wrap('<select class="input" id="'+id+'" data-change="lb-edsel" data-k="'+k+'"><option value="">'+esc(lbL('noPic'))+'</option>'+lb_visibleProducts().map(function(p){ return '<option value="'+p.id+'"'+(v===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select>', id);
  if(kind==='color'){ var p = P(d.product); if(!p) return ''; return wrap('<div class="lb-segs">'+p.colors.map(function(c){ return '<button type="button" class="lb-sw'+(v===c?' on':'')+'" style="--c:'+COL(c).hex+'" aria-pressed="'+(v===c)+'" aria-label="'+esc(COL(c).name)+'" data-act="lb-edset" data-k="color" data-v="'+c+'"></button>'; }).join('')+'</div>'); }
  var multi = function(items, key){ var arr = Array.isArray(v) ? v : []; return wrap('<div class="lb-multi">'+items.map(function(x){ var on = arr.indexOf(x[0])>=0;
      return '<button type="button" class="chip'+(on?' on':'')+'" aria-pressed="'+on+'" data-act="lb-edmulti" data-k="'+key+'" data-v="'+esc(x[0])+'">'+(on?ico('check',13):'')+esc(x[1])+'</button>'; }).join('')+'</div>'); };
  if(kind==='products') return multi(lb_visibleProducts().map(function(p){ return [p.id, p.name]; }), k);
  if(kind==='combos') return multi(combos().filter(function(c){ return c.active; }).map(function(c){ return [c.id, c.name]; }), k);
  if(kind==='cats') return multi(DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){ return [c.id, lb_catName(c)]; }), k);
  if(kind==='rule'){ var rs = typeof ca_activeRules==='function' ? ca_activeRules() : []; return wrap('<select class="input" id="'+id+'" data-change="lb-edsel" data-k="'+k+'"><option value="">'+esc(lbL('firstRule'))+'</option>'+rs.map(function(r){ return '<option value="'+esc(r.id)+'"'+(v===r.id?' selected':'')+'>'+esc(r.name||r.id)+'</option>'; }).join('')+'</select>', id); }
  return '';
}
function lb_openEditor(sid, isNew){
  var list = lb_admList(), s = list && list.filter(function(x){ return x.id===sid; })[0]; if(!s) return;
  var E = UI['lb-ed'] = {sid:sid, draft:lb_clone(s), isNew:!!isNew};
  var build = function(){
    var d = E.draft, dd = d.data || {}, isB = d.type==='builtin';
    var fields = isB ? '<p class="small text2">'+esc(lbL('builtInNote'))+'</p>'
      : '<div class="lb-f"><label class="label" for="lbf-name">'+esc(lbL('secName'))+'</label><input class="input" id="lbf-name" data-input="lb-edc" data-k="name" value="'+esc(d.name||'')+'"></div>'+
        lb_fieldsFor(d.type).filter(function(f){ return !f[4] || f[4](dd); }).map(function(f){ return lb_fieldHTML(f, dd); }).join('');
    return '<div class="lb-ed">'+fields+
      '<div class="lb-common"><div class="lb-f lb-f-row">'+lb_swBtn(d.active!==false, 'lb-edact', d.active!==false ? lbL('on') : lbL('off'))+'</div>'+
      '<div class="lb-f2"><div class="lb-f"><label class="label" for="lbf-start">'+esc(lbL('startDay'))+'</label><input class="input" type="date" id="lbf-start" data-input="lb-edc" data-k="start" value="'+esc(d.start||'')+'"></div>'+
      '<div class="lb-f"><label class="label" for="lbf-end">'+esc(lbL('endDay'))+'</label><input class="input" type="date" id="lbf-end" data-input="lb-edc" data-k="end" value="'+esc(d.end||'')+'"></div></div>'+
      '<p class="xs muted">'+esc(lbL('dayNote'))+'</p>'+
      '<div class="lb-f"><span class="label">'+esc(lbL('whereShow'))+'</span><div class="lb-segs" role="group">'+['both','phone','desktop'].map(function(v){ var on = (d.device||'both')===v;
        return '<button type="button" class="chip'+(on?' on':'')+'" aria-pressed="'+on+'" data-act="lb-eddev" data-v="'+v+'">'+esc(lb_devName(v))+'</button>'; }).join('')+'</div></div></div>'+
      '<div class="lb-mfoot"><button type="button" class="btn btn-ghost" data-act="lb-edcancel">'+esc(lbL('cancel'))+'</button><button type="button" class="btn btn-primary" data-act="lb-edsave">'+esc(lbL('save'))+'</button></div></div>';
  };
  E.build = build;
  openModal(build(), {title:(isNew ? lbL('newSec') : lbL('editing'))+' · '+lb_secName(s), wide:true, rebuild:build, cls:'lb-modal'});
  var u = lb_admUI(); u.focus = sid; lb_edPreview();
}
function lb_edPreview(){
  var E = UI['lb-ed']; if(!E) return;
  var list = lb_admList(); if(!list) return;
  var draft = lb_clone(list).map(function(x){ return x.id===E.sid ? lb_clone(E.draft) : x; });
  lb_admPush(draft);
}
ACT['lb-edit'] = function(el){ var list = lb_admList(), s = list && list[+el.getAttribute('data-i')]; if(s) lb_openEditor(s.id); };
INPUT['lb-ed'] = function(el){ var E = UI['lb-ed']; if(!E) return; var k = el.getAttribute('data-k'); E.draft.data = E.draft.data || {}; E.draft.data[k] = el.getAttribute('data-num') ? lb_num(el.value) : el.value; lb_edPreview(); };
INPUT['lb-edc'] = function(el){ var E = UI['lb-ed']; if(!E) return; E.draft[el.getAttribute('data-k')] = el.value; lb_edPreview(); };
CHANGE['lb-edsel'] = function(el){ var E = UI['lb-ed']; if(!E) return; var k = el.getAttribute('data-k'); E.draft.data[k] = el.value;
  if(k==='product'){ var p = P(el.value); E.draft.data.color = p ? p.colors[0] : ''; }
  refreshModal(); lb_edPreview(); };
ACT['lb-edset'] = function(el){ var E = UI['lb-ed']; if(!E) return; E.draft.data[el.getAttribute('data-k')] = el.getAttribute('data-v'); refreshModal(); lb_edPreview(); };
ACT['lb-edmulti'] = function(el){ var E = UI['lb-ed']; if(!E) return; var k = el.getAttribute('data-k'), v = el.getAttribute('data-v'), a = Array.isArray(E.draft.data[k]) ? E.draft.data[k] : (E.draft.data[k] = []);
  var i = a.indexOf(v); if(i>=0) a.splice(i,1); else a.push(v); refreshModal(); lb_edPreview(); };
ACT['lb-edact'] = function(){ var E = UI['lb-ed']; if(!E) return; E.draft.active = E.draft.active===false; refreshModal(); lb_edPreview(); };
ACT['lb-eddev'] = function(el){ var E = UI['lb-ed']; if(!E) return; E.draft.device = el.getAttribute('data-v'); refreshModal(); lb_edPreview(); };
ACT['lb-edcancel'] = function(){ UI['lb-ed'] = null; closeModal(); lb_admPush(); };
ACT['lb-edsave'] = function(){
  var E = UI['lb-ed']; if(!E) return;
  if(E.draft.start && E.draft.end && E.draft.end < E.draft.start){ toast(lbL('endBeforeStart')); return; }
  var list = lb_admList(), i = -1; list.forEach(function(x, k){ if(x.id===E.sid) i = k; });
  if(i>=0) list[i] = E.draft;
  UI['lb-ed'] = null; closeModal(); lb_admSave(E.draft.id); toast(lbL('savedLive'));
};

/* =====================================================================
   9. ADMIN · Side canvas  (#/admin/side-canvas) — v2
   ===================================================================== */
var LB_ZT = ['motion','banner','ad','popup','figure','image','video'];
var LB_ZT_KEY = {banner:'zBanner', ad:'zAd', popup:'zPopup', motion:'zMotion', figure:'zFigure', image:'zImage', video:'zVideo'};
var LB_ST_KEY = {ok:'stOk', off:'stOff', date:'stDate', page:'stPage', budget:'stBudget'};
function lb_scUI(){ return ui('lb-sc', {page:'home', size:'1797x879', mapMode:'window', sel:'', ruler:'px', tab:'zones', lib:{tpl:'', p:'', cat:''}}); }
/* DRAFT → PREVIEW → PUBLISH: the editor changes a draft; the shop shows the published side canvas */
function lb_scEdit(){
  if(!ST.scDraft || !(ST.scDraft.zones || ST.scDraft.pages)) ST.scDraft = lb_clone(lb_sc());
  if(!ST.scDraft.zones) ST.scDraft = lb_scMigrate(ST.scDraft);
  return ST.scDraft;
}
function lb_scDirty(){ if(!ST.scDraft) return false; var a = lb_clone(ST.scDraft), b = lb_clone(lb_sc()); delete a.enabled; delete b.enabled; return JSON.stringify(a)!==JSON.stringify(b); }
function lb_scZones(){ return lb_scEdit().zones; }
function lb_draftBar(){
  var dirty = lb_scDirty(), log = ST.scPubLog || [];
  return '<div class="lb-draft card'+(dirty?' dirty':'')+'" id="lb-draftbar"><div class="lb-draft-t">'+ico(dirty?'edit':'check',16)+'<span>'+esc(lbL(dirty ? 'draftDirty' : 'draftClean'))+'</span></div>'+
    '<div class="row wrap" style="gap:8px"><button type="button" class="btn btn-sm btn-primary" data-act="lb-publish"'+(dirty?'':' disabled')+'>'+esc(lbL('publish'))+'</button>'+
    '<button type="button" class="btn btn-sm btn-ghost" data-act="lb-discard"'+(dirty?'':' disabled')+'>'+esc(lbL('discard'))+'</button>'+
    '<button type="button" class="btn btn-sm btn-ghost" data-act="lb-unpublish"'+(log.length?'':' disabled')+'>'+esc(lbL('undoPublish'))+'</button></div></div>';
}
function lb_draftSync(){ var b = document.getElementById('lb-draftbar'); if(b) b.outerHTML = lb_draftBar(); }
ACT['lb-publish'] = function(){
  var pub = lb_sc(); ST.scPubLog = (ST.scPubLog || []).concat([{at:Date.now(), data:lb_clone(pub)}]).slice(-10);
  var d = lb_clone(lb_scEdit()); d.enabled = pub.enabled; ST.sideCanvas = d; LB_LAST = null; saveState(); rerender(); toast(lbL('published'));
};
ACT['lb-discard'] = function(){ if(!confirm(lbL('confirmDiscard'))) return; delete ST.scDraft; saveState(); rerender(); toast(lbL('discarded')); };
ACT['lb-unpublish'] = function(){
  var L = ST.scPubLog || [], e = L.pop(); if(!e){ toast(lbL('nothingToUndo')); return; }
  var en = lb_sc().enabled; ST.sideCanvas = e.data; ST.sideCanvas.enabled = en; ST.scDraft = lb_clone(ST.sideCanvas); LB_LAST = null; saveState(); rerender(); toast(lbL('undone'));
};
function lb_scFind(id){ var z = lb_scZones(), out = null; ['l','r'].forEach(function(s){ z[s].forEach(function(x, i){ if(x.id===id) out = {z:x, side:s, i:i, list:z[s]}; }); }); return out; }
function lb_zName(z){ return z.name || lbL(LB_ZT_KEY[z.type] || 'zBanner'); }
function lb_scPageHash(){
  var u = lb_scUI(); if(u.page==='home') return '#/'; if(u.page.indexOf('cat:')===0) return '#/c/'+u.page.slice(4);
  var k = u.page.slice(3), t = LB_CFG.pageTypes.filter(function(x){ return x[0]===k; })[0]; return t ? t[1] : '#/';
}
function lb_scPreviewKey(){ var u = lb_scUI(); return u.page==='home' ? 'home' : (u.page.indexOf('cat:')===0 ? 'cat' : u.page.slice(3)); }
function lb_pgName(k){ return lbL('pg_'+k); }
function lb_sizeStrip(){
  var u = lb_scUI(), Fs = lb_scFind(u.sel), vz = Fs && lb_zPlace(Fs.z)==='view' ? lb_vpSet(Fs.z, lb_scPreviewKey()) : null;
  return '<div class="lb-pages" id="lb-sizes" role="group" aria-label="'+esc(lbL('screenWidth'))+'">'+LB_CFG.vpSizes.map(function(wh){ var k = lb_vpKey(wh[0], wh[1]), on = u.size===k, own = vz && vz.vpSizes && vz.vpSizes[k];
      return '<button type="button" class="chip lb-szchip'+(on?' on':'')+'" aria-pressed="'+on+'" data-act="lb-scw" data-v="'+k+'">'+lbN(wh[0])+'×'+lbN(wh[1])+(k===lb_vpKey(LB_CFG.vpBase.w, LB_CFG.vpBase.h)?' <span class="lb-ownr" title="'+esc(lbL('ownerScreen'))+'">★</span>':'')+(own?' <span class="lb-cust">'+esc(lbL('customBadge'))+'</span>':'')+'</button>'; }).join('')+
    '<button type="button" class="chip'+(u.size==='me'?' on':'')+'" data-act="lb-scw" data-v="me">'+esc(lbL('thisScreen'))+' ('+lbN(window.innerWidth)+'×'+lbN(window.innerHeight)+')</button></div>';
}
function lb_sizeStripSync(){ var e = document.getElementById('lb-sizes'); if(e) e.outerHTML = lb_sizeStrip(); }
function lb_pagesCard(){
  var S = lb_scEdit();
  return '<details class="lb-pgcard card"'+(lb_scUI().pgOpen?' open':'')+'><summary><span class="h3">'+esc(lbL('pagesTitle'))+'</span> <span class="xs muted">'+lbN(LB_CFG.pageTypes.filter(function(t){ return lb_pageOn(t[0], S); }).length)+' / '+lbN(LB_CFG.pageTypes.length)+'</span></summary>'+
    '<p class="xs muted">'+esc(lbL('pagesNote'))+'</p><div class="lb-pglist">'+LB_CFG.pageTypes.map(function(t){ return '<div class="lb-pgrow"><span>'+esc(lb_pgName(t[0]))+'</span>'+lb_swBtn(lb_pageOn(t[0], S), 'lb-pgtog', lb_pageOn(t[0], S) ? lbL('on') : lbL('off'), 'data-k="'+t[0]+'"')+'</div>'; }).join('')+'</div></details>';
}
ACT['lb-pgtog'] = function(el){ var k = el.getAttribute('data-k'), D = lb_scEdit(), was = lb_pageOn(k, D); D.pagesOn = lb_clone(D.pagesOn || LB_CFG.pagesOnDefault); D.pagesOn[k] = !was; lb_scUI().pgOpen = true; saveState(); rerender(); };

function lb_seg(k, items, cur, act, extra){ return '<div class="lb-segs" role="group">'+items.map(function(it){ var on = cur===it[0]; return '<button type="button" class="chip'+(on?' on':'')+'" aria-pressed="'+on+'" data-act="'+act+'" data-k="'+k+'" data-v="'+esc(it[0])+'"'+(extra||'')+'>'+esc(it[1])+'</button>'; }).join('')+'</div>'; }
PAGES['lb-side'] = {
  layout:'admin',
  title:function(){ return lbL('sideTitle'); },
  render:function(){
    var u = lb_scUI(), S = lb_sc();
    var pages = '<button type="button" class="chip'+(u.page==='home'?' on':'')+'" aria-pressed="'+(u.page==='home')+'" data-act="lb-scpage" data-v="home">'+esc(lbL('pageHome'))+'</button>'+
      DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){ var v = 'cat:'+c.id; return '<button type="button" class="chip'+(u.page===v?' on':'')+'" aria-pressed="'+(u.page===v)+'" data-act="lb-scpage" data-v="'+v+'">'+esc(lb_catName(c))+'</button>'; }).join('')+
      LB_CFG.pageTypes.filter(function(t){ return t[0]!=='home' && t[0]!=='cat'; }).map(function(t){ var v = 'pg:'+t[0]; return '<button type="button" class="chip'+(u.page===v?' on':'')+(lb_pageOn(t[0], lb_scEdit())?'':' lb-pgoff')+'" aria-pressed="'+(u.page===v)+'" data-act="lb-scpage" data-v="'+v+'">'+esc(lb_pgName(t[0]))+'</button>'; }).join('');
    var tabs = '<div class="lb-tabs" role="tablist">'+[['zones','tabZones'],['library','tabLibrary']].map(function(t){ return '<button type="button" role="tab" aria-selected="'+(u.tab===t[0])+'" class="chip'+(u.tab===t[0]?' on':'')+'" data-act="lb-sctab" data-v="'+t[0]+'">'+esc(lbL(t[1]))+(t[0]==='library' ? ' <span class="lb-cnt">'+lbN(lb_assets().length)+'</span>' : '')+'</button>'; }).join('')+'</div>';
    var body = u.tab==='library' ? '<div id="lb-libbox">'+lb_libHTML('side')+'</div>' :
      '<div class="lb-sctools"><div class="lb-pages" role="group" aria-label="'+esc(lbL('previewPage'))+'">'+pages+'</div>'+
        lb_sizeStrip()+
        '<div class="seg" role="group" aria-label="'+esc(lbL('mapView'))+'"><button type="button" data-act="lb-scmode" data-v="window" class="'+(u.mapMode!=='page'?'on':'')+'">'+esc(lbL('viewWindow'))+'</button><button type="button" data-act="lb-scmode" data-v="page" class="'+(u.mapMode==='page'?'on':'')+'">'+esc(lbL('viewPage'))+'</button></div>'+
        '<div class="seg" role="group" aria-label="'+esc(lbL('unit'))+'"><button type="button" data-act="lb-scruler" data-v="px" class="'+(u.ruler!=='in'?'on':'')+'">px</button><button type="button" data-act="lb-scruler" data-v="in" class="'+(u.ruler==='in'?'on':'')+'">'+esc(lbL('inch'))+'</button></div>'+
        '<button type="button" class="btn btn-sm btn-secondary" data-act="lb-checkall">'+ico('grid',15)+esc(lbL('checkAll'))+'</button></div>'+
      '<div class="lb-scgrid">'+
        '<div class="lb-mapcol"><div class="lb-mapinfo" id="lb-mapinfo">'+esc(lbL('measuring'))+'</div>'+
          '<div class="lb-map" id="lb-map"><div class="lb-frame lb-mapframe" id="lb-fr-map"><iframe title="'+esc(lbL('sideTitle'))+'" tabindex="-1"></iframe></div><div class="lb-ov" id="lb-ov"></div></div>'+
          '<p class="xs muted mt8">'+esc(lbL(u.mapMode==='page' ? 'mapHelp' : 'mapHelpWin'))+'</p><div id="lb-checkbox"></div></div>'+
        '<div class="lb-zcol"><div id="lb-zpanel">'+lb_zPanel()+'</div><div id="lb-speed">'+lb_speedPanel()+'</div></div>'+
      '</div>';
    return '<div class="lb-adm lb-scadm">'+
      '<div class="lb-hd"><div><div class="eyebrow">'+esc(lbL('sideEyebrow'))+'</div><h1 class="h1">'+esc(lbL('sideTitle'))+'</h1>'+
      '<p class="text2 lb-lead">'+esc(lbL('sideLead'))+'</p></div></div>'+
      '<div class="lb-master card'+(S.enabled?' on':'')+'"><div class="lb-master-t"><div class="h3">'+esc(lbL('masterTitle'))+'</div><div class="small lb-master-n">'+ico('info',14)+' '+esc(lbL('masterNote'))+'</div></div>'+
        lb_swBtn(!!S.enabled, 'lb-scmaster', S.enabled ? lbL('on') : lbL('off'))+
        '<a class="btn btn-secondary" href="#/preview/side-canvas">'+ico('eye',16)+esc(lbL('approvalPv'))+'</a></div>'+
      lb_draftBar()+lb_pagesCard()+tabs+body+lb_snapPanel()+'</div>';
  },
  after:function(){ if(lb_scUI().tab!=='library'){ lb_scBootMap(); lb_mapDragInit(); lb_mtStart(document.getElementById('lb-zpanel')); lb_speedBoot(); } }
};
function lb_scMapWH(){ var u = lb_scUI(); if(u.size==='me') return [Math.max(LB_CFG.deskMin, window.innerWidth), Math.max(500, window.innerHeight)]; var m = String(u.size||'1797x879').split('x'); return [+m[0] || 1797, +m[1] || 879]; }
function lb_scMapW(){ return lb_scMapWH()[0]; }
function lb_scBootMap(){
  var el = document.getElementById('lb-fr-map'); if(!el) return;
  var u = lb_scUI(), wh = lb_scMapWH(), win = u.mapMode!=='page';
  lb_frameBoot(el, wh[0], win ? wh[1] : 1600, lb_frameState({hash:lb_scPageHash(), sideCanvas:lb_clone(lb_scEdit()), forceCanvas:true, fullHeight:!win, window:win, viewH:wh[1], report:true, noPopups:true}));
  var f = LB_FRAMES[el.getAttribute('data-fid')]; if(f) f.onGeom = lb_ovDraw;
}
function lb_scPushMap(){ var el = document.getElementById('lb-fr-map'); if(el) lb_framePush(el, {sideCanvas:lb_clone(lb_scEdit()), theme:ST.theme}); lb_draftSync(); }
function lb_mapFrame(){ var el = document.getElementById('lb-fr-map'); return el && LB_FRAMES[el.getAttribute('data-fid')]; }
function lb_placedOf(id){ var f = lb_mapFrame(); if(!f || !f.placed) return null; var out = null; ['l','r'].forEach(function(s){ (f.placed[s]||[]).forEach(function(p){ if(p.id===id) out = p; }); }); return out; }
/* the drawing over the map: gutters, rulers, every zone where the shop puts it, at this width's scale */
function lb_ovDraw(){
  var el = document.getElementById('lb-fr-map'), ov = document.getElementById('lb-ov'); if(!el || !ov) return;
  var f = LB_FRAMES[el.getAttribute('data-fid')]; if(!f || !f.geom) return;
  if(f.state && f.state.window && f.view) return lb_ovDrawWindow(f, el, ov);
  var g = f.geom, s = +el.getAttribute('data-scale') || 1, u = lb_scUI(), Z = lb_scZones();
  var kL = lb_scaleFor(g.gL), kR = lb_scaleFor(g.gR);
  var info = document.getElementById('lb-mapinfo');
  if(info) info.innerHTML = esc(lbL('mapInfo', {w:g.vw, l:g.gL, r:g.gR, k:(Math.round(Math.min(kL, kR)*100)/100)}));
  var bandH = g.bandBottom - g.bandTop, H = '';
  H += '<div class="lb-gut l" style="left:0;top:'+(g.bandTop*s)+'px;width:'+(g.gL*s)+'px;height:'+(bandH*s)+'px" data-side="l"></div>';
  H += '<div class="lb-gut r" style="left:'+((g.vw-g.gR)*s)+'px;top:'+(g.bandTop*s)+'px;width:'+(g.gR*s)+'px;height:'+(bandH*s)+'px" data-side="r"></div>';
  g.obstacles.forEach(function(o){ H += '<div class="lb-obs" style="top:'+((g.bandTop+o.top)*s)+'px;height:'+((o.bottom-o.top)*s)+'px"><span>'+esc(lbL('fullBand'))+'</span></div>'; });
  var unit = u.ruler==='in' ? 96 : 100, lab = function(v){ return u.ruler==='in' ? lbN(Math.round(v/96))+'"' : lbN(v); };
  for(var y = 0; y <= bandH; y += unit/2){
    var major = Math.round(y) % unit === 0;
    H += '<div class="lb-tick'+(major?' mj':'')+'" style="top:'+((g.bandTop+y)*s)+'px"></div>';
    if(major && y % (unit*(s<.5?2:1))===0) H += '<div class="lb-tlab" style="top:'+((g.bandTop+y)*s)+'px">'+lab(Math.round(y))+'</div>';
  }
  [['l', 0, g.gL], ['r', g.vw - g.gR, g.gR]].forEach(function(a){
    for(var x = 0; x <= a[2]; x += 25){ var mj = x % 50 === 0; var px = a[0]==='l' ? a[1] + x : a[1] + a[2] - x;
      H += '<div class="lb-htick'+(mj?' mj':'')+'" style="left:'+(px*s)+'px;top:'+(g.bandTop*s - (mj?9:5))+'px"></div>'; }
    H += '<div class="lb-hlab" style="left:'+(a[1]*s)+'px;top:'+(g.bandTop*s - 24)+'px;width:'+(a[2]*s)+'px">'+lbN(a[2])+' px</div>';
  });
  ['l','r'].forEach(function(side){
    var pl = {}; (f.placed && f.placed[side] || []).forEach(function(p){ pl[p.id] = p; });
    Z[side].forEach(function(z){
      if(z.hidden) return; var p = pl[z.id]; if(!p) return;
      var x = side==='l' ? p.x : g.vw - p.x - p.w;
      var bad = p.st==='budget', dim = p.st!=='ok' && !bad;
      H += '<div class="lb-oz st-'+p.st+(u.sel===z.id?' sel':'')+(dim?' dim':'')+'" data-zid="'+esc(z.id)+'" data-k="'+p.k+'" tabindex="0" role="button" aria-label="'+esc(lb_zName(z)+' — '+lbL(LB_ST_KEY[p.st]||'stOk'))+'" style="left:'+(x*s)+'px;top:'+((g.bandTop+p.top)*s)+'px;width:'+(p.w*s)+'px;height:'+(p.h*s)+'px">'+
        '<span class="lb-oz-n">'+esc(lb_zName(z))+'</span><span class="lb-oz-m">'+lbN(p.k)+'×</span>'+(p.st!=='ok'?'<span class="lb-oz-s">'+esc(lbL(LB_ST_KEY[p.st]))+'</span>':'')+
        '<span class="lb-oz-h" data-h="s" aria-hidden="true"></span><span class="lb-oz-h w" data-h="w" aria-hidden="true"></span></div>';
    });
  });
  ov.style.height = el.style.height; ov.innerHTML = H;
  var pn = document.getElementById('lb-zpstat'); if(pn) pn.innerHTML = lb_zStatus();
  var sp = document.getElementById('lb-pgw'); if(sp) sp.outerHTML = lb_pageWeightHTML();
}
/* the window as the shopper sees it: header, content, and each window-placed zone in red, with its numbers */
function lb_vpLabel(z, vb, view){ return lbL('vpLabel', {u:view.U, h:vb.h, a:view.above, b:view.below, w:vb.w, g:view.gap}); }
function lb_ovDrawWindow(f, el, ov){
  var s = +el.getAttribute('data-scale') || 1, V = f.view, u = lb_scUI(), H = '';
  var info = document.getElementById('lb-mapinfo');
  if(info) info.innerHTML = esc(lbL('winInfo', {w:V.vw, h:V.vh, u:V.vh - V.hdr, l:V.gL, r:V.gR}));
  H += '<div class="lb-whdr" style="left:0;top:0;width:'+(V.vw*s)+'px;height:'+(V.hdr*s)+'px"><span>'+esc(lbL('headerLbl'))+' '+lbN(V.hdr)+' px</span></div>';
  H += '<div class="lb-wvis" style="left:0;top:'+(V.hdr*s)+'px;width:'+(V.vw*s)+'px;height:'+((V.vh-V.hdr)*s)+'px"><span>'+esc(lbL('visibleLbl'))+' '+lbN(V.vh - V.hdr)+' px</span></div>';
  var byId = {}; ['l','r'].forEach(function(sd){ (f.placed && f.placed[sd] || []).forEach(function(p){ byId[p.id] = p; }); });
  V.zones.forEach(function(r){
    var z = (lb_scFind(r.id) || {}).z, p = byId[r.id]; if(!z) return;
    var view = p && p.view, sel = u.sel===r.id;
    H += '<div class="lb-wz'+(view?' view':'')+(sel?' sel':'')+'" data-zid="'+esc(r.id)+'" tabindex="0" role="button" aria-label="'+esc(lb_zName(z))+'" style="left:'+(r.x*s)+'px;top:'+(r.y*s)+'px;width:'+(r.w*s)+'px;height:'+(r.h*s)+'px">'+
      (view ? '<span class="lb-wz-h t" data-h="t"></span><span class="lb-wz-h b" data-h="b"></span><span class="lb-wz-h '+(r.x < V.vw/2 ? 'r' : 'l')+'" data-h="w"></span>' : '')+'</div>';
    if(view){
      var lx = r.x < V.vw/2 ? (r.x + r.w + 6) : Math.max(0, r.x - 230);
      H += '<div class="lb-wlab" style="left:'+(lx*s)+'px;top:'+((r.y + r.h/2)*s - 30)+'px">'+esc(lb_vpLabel(z, r, view))+(view.custom ? ' · '+esc(lbL('customBadge')) : '')+'</div>';
      H += '<div class="lb-wgap" style="left:'+((r.x + r.w/2)*s)+'px;top:'+(V.hdr*s)+'px;height:'+((r.y - V.hdr)*s)+'px"><span>'+lbN(view.above)+'</span></div>';
      H += '<div class="lb-wgap" style="left:'+((r.x + r.w/2)*s)+'px;top:'+((r.y + r.h)*s)+'px;height:'+((V.vh - r.y - r.h)*s)+'px"><span>'+lbN(view.below)+'</span></div>';
    }
  });
  ov.style.height = el.style.height; ov.innerHTML = H;
  var pn = document.getElementById('lb-zpstat'); if(pn) pn.innerHTML = lb_zStatus();
  var pv = document.getElementById('lb-vpbox'); var F = lb_scFind(u.sel);
  if(pv && F){ if(pv.contains(document.activeElement)){ var nw = pv.querySelector('.lb-vpnow'), pp = lb_placedOf(F.z.id); if(nw && pp && pp.view) nw.textContent = lb_vpLabel(F.z, pp, pp.view); } else pv.outerHTML = lb_vpPanel(F.z); }
  var sp = document.getElementById('lb-pgw'); if(sp) sp.outerHTML = lb_pageWeightHTML();
}
/* placement block in the zone panel: the rule for the size on screen, fix-for-this-size, presets */
function lb_vpTarget(z, key){ var S0 = lb_vpSet(z, lb_scPreviewKey()); if(S0.vpSizes && S0.vpSizes[key]) return S0.vpSizes[key]; if(!S0.vp) S0.vp = lb_clone(LB_CFG.vpBase); return S0.vp; }
function lb_vpPanel(z){
  var pk = lb_scPreviewKey(), set = lb_vpSet(z, pk), wh = lb_scMapWH(), key = lb_vpKey(wh[0], wh[1]), v = lb_vpFor(z, wh[0], wh[1], pk), own = !!(set.vpSizes && set.vpSizes[key]), p = lb_placedOf(z.id), view = p && p.view;
  var pageSeg = pk==='home' ? '' : '<div class="lb-f"><span class="label">'+esc(lb_pgName(pk))+'</span>'+lb_seg('own', [['home',lbL('sameHome')],['own',lbL('ownPage')]], set===z ? 'home' : 'own', 'lb-vpown')+'</div>';
  var n = function(k, label, unit, val){ return '<div class="lb-f"><label class="label" for="lbv-'+k+'">'+esc(lbL(label))+' ('+unit+')</label><input class="input" type="number" step="0.1" id="lbv-'+k+'" data-input="lb-vp" data-k="'+k+'" value="'+esc(val)+'"></div>'; };
  return '<div class="lb-vpbox" id="lb-vpbox"><div class="lb-colhd"><span class="h3">'+esc(lbL('placeAt', {s:wh[0]+'×'+wh[1]}))+'</span><span class="lb-st '+(own?'wait':'on')+'">'+esc(lbL(own ? 'customBadge' : 'autoBadge'))+'</span></div>'+pageSeg+
    '<p class="xs muted">'+esc(lbL(own ? 'customNote' : 'autoNote'))+'</p>'+
    '<div class="lb-f3">'+n('top','vpTop','%', v.top)+n('height','vpHeight','%', v.height)+n('bottom','vpBottom','%', Math.round((100 - v.top - v.height)*10)/10)+'</div>'+
    '<div class="lb-f2">'+n('gap','vpGap','px', Math.round(v.gap))+n('width','vpWidth','%', v.width)+'</div>'+
    (view ? '<div class="lb-vpnow">'+esc(lb_vpLabel(z, p, view))+'</div>' : '')+
    '<div class="row wrap" style="gap:8px">'+(own ? '<button type="button" class="btn btn-sm btn-secondary" data-act="lb-vpreset">'+esc(lbL('resetAuto'))+'</button>' : '<button type="button" class="btn btn-sm btn-secondary" data-act="lb-vpfix">'+esc(lbL('fixSize'))+'</button>')+
    '<button type="button" class="btn btn-sm btn-ghost" data-act="lb-vppreset" data-v="owner">'+esc(lbL('presetOwner'))+'</button><button type="button" class="btn btn-sm btn-ghost" data-act="lb-vppreset" data-v="centred">'+esc(lbL('presetCentred'))+'</button></div></div>';
}
INPUT['lb-vp'] = function(el){
  var F = lb_scFind(lb_scUI().sel); if(!F) return; var wh = lb_scMapWH(), t = lb_vpTarget(F.z, lb_vpKey(wh[0], wh[1])), k = el.getAttribute('data-k'), v = lb_num(el.value);
  if(!t.w){ var cur = lb_vpFor(F.z, wh[0], wh[1], lb_scPreviewKey()); ['top','height','gap','width'].forEach(function(f){ if(t[f]==null) t[f] = cur[f]; }); }
  if(k==='bottom') t.height = Math.max(5, Math.round((100 - lb_num(t.top) - v)*10)/10);
  else if(k==='gap') t.gap = Math.max(LB_CFG.safety, Math.round(v));
  else t[k] = Math.max(1, Math.min(k==='width' ? 100 : 95, v));
  if(lb_num(t.top) + lb_num(t.height) > 100) t.height = Math.max(5, 100 - lb_num(t.top));
  clearTimeout(LB_PUSH_T); saveState(); LB_PUSH_T = setTimeout(lb_scPushMap, 200); lb_draftSync();
};
ACT['lb-vpfix'] = function(){ var F = lb_scFind(lb_scUI().sel); if(!F) return; var pk = lb_scPreviewKey(), set = lb_vpSet(F.z, pk), wh = lb_scMapWH(), key = lb_vpKey(wh[0], wh[1]); var cur = lb_vpFor(F.z, wh[0], wh[1], pk); delete cur.custom;
  set.vpSizes = set.vpSizes || {}; cur.w = wh[0]; cur.h = wh[1]; set.vpSizes[key] = cur;
  if(key===lb_vpKey(lb_num((set.vp||{}).w, LB_CFG.vpBase.w), lb_num((set.vp||{}).h, LB_CFG.vpBase.h))){ delete set.vpSizes[key]; }
  lb_zRefresh(true); lb_sizeStripSync(); toast(lbL('fixedToast')); };
ACT['lb-vpreset'] = function(){ var F = lb_scFind(lb_scUI().sel); if(!F) return; var set = lb_vpSet(F.z, lb_scPreviewKey()), wh = lb_scMapWH(); if(set.vpSizes) delete set.vpSizes[lb_vpKey(wh[0], wh[1])]; lb_zRefresh(true); lb_sizeStripSync(); toast(lbL('autoToast')); };
ACT['lb-vpown'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; var pk = lb_scPreviewKey(); if(pk==='home') return;
  if(el.getAttribute('data-v')==='own'){ F.z.vpBy = F.z.vpBy || {}; F.z.vpBy[pk] = {vp:lb_clone(F.z.vp || LB_CFG.vpBase), vpSizes:lb_clone(F.z.vpSizes || {})}; }
  else if(F.z.vpBy) delete F.z.vpBy[pk];
  lb_zRefresh(true); lb_sizeStripSync(); };
ACT['lb-vppreset'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; var wh = lb_scMapWH(), t = lb_vpTarget(F.z, lb_vpKey(wh[0], wh[1])), P0 = LB_CFG.vpPresets[el.getAttribute('data-v')]; Object.keys(P0).forEach(function(k){ t[k] = P0[k]; }); lb_zRefresh(true); };
ACT['lb-zplace'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; F.z.place = el.getAttribute('data-v'); if(F.z.place==='view' && !F.z.vp) F.z.vp = lb_clone(LB_CFG.vpBase); lb_zRefresh(true); };
function lb_zStatus(){
  var u = lb_scUI(), F = lb_scFind(u.sel), p = F && lb_placedOf(F.z.id); if(!p) return '';
  if(p.view) return '<span class="lb-st on">'+esc(lbL('stOk'))+'</span> <span class="xs muted lb-scale">'+esc(lb_vpLabel(F.z, p, p.view))+'</span>';
  return '<span class="lb-st '+(p.st==='ok'?'on':'off')+'">'+esc(lbL(LB_ST_KEY[p.st]||'stOk'))+'</span> <span class="xs muted lb-scale">'+esc(lbL('scaleHere', {k:p.k, w:p.w, h:p.h}))+
    (p.imgOnly ? ' · '+esc(lbL('imageOnly')) : '')+(p.moved ? ' · '+esc(lbL('movedNote')) : '')+'</span>';
}
function lb_weightLine(z){
  var w = lb_zWeight(z), over = w.over.length;
  var parts = [lbL('weight')+': '+lb_kb(w.total)];
  if(w.img) parts.push('img '+lb_kb(w.img)+' / '+lb_kb(LB_CFG.budget.image));
  if(w.vid) parts.push('video '+lb_kb(w.vid)+' / '+lb_kb(LB_CFG.budget.video));
  if(w.over.indexOf('poster')>=0) parts.push(lbL('needPoster'));
  return '<div class="lb-wline'+(over?' bad':'')+'" id="lb-wline">'+(over ? ico('info',14) : ico('check',14))+'<span>'+esc(parts.join(' · '))+' — '+esc(over ? lbL('overBudget') : lbL('withinBudget'))+'</span></div>';
}
function lb_pageWeightHTML(){
  var f = lb_mapFrame(), tot = f && f.placed ? (f.placed.total||0) : 0, over = tot > LB_CFG.budget.page;
  return '<div id="lb-pgw" class="lb-wline'+(over?' bad':'')+'">'+ico(over?'info':'check',14)+'<span>'+esc(lbL('pageWeight', {n:lb_kb(tot), b:lb_kb(LB_CFG.budget.page)}))+'</span></div>';
}
/* the panel for the selected zone (or the list when none is chosen) */
function lb_targetTxt(z){ var t = z.target || {}; var a = []; if(t.home!==false) a.push(lbL('tHome')); if(t.cat==='all') a.push(lbL('catsAll')); else if(t.cat==='some') a.push((t.cats||[]).map(function(id){ var c = CAT(id); return c ? lb_catName(c) : id; }).join(', ')); return a.join(' · ') || '—'; }
function lb_zPanel(){
  var u = lb_scUI(), Z = lb_scZones(), F = lb_scFind(u.sel);
  var listRow = function(z, side){ return '<li><button type="button" class="lb-zli'+(u.sel===z.id?' on':'')+'" data-act="lb-zsel" data-zid="'+esc(z.id)+'"><span class="lb-zli-s">'+esc(lbL(side==='l'?'L':'R'))+'</span><span class="grow"><span class="lb-zli-n">'+esc(lb_zName(z))+'</span><span class="xs muted lb-zli-m">'+lbN(lb_num(z.width))+'×'+lbN(lb_num(z.height))+' · '+esc(lb_targetTxt(z))+'</span></span>'+(z.active===false?'<span class="lb-st off">'+esc(lbL('off'))+'</span>':'')+'</button></li>'; };
  var all = Z.l.filter(function(z){ return !z.hidden; }).map(function(z){ return listRow(z, 'l'); }).concat(Z.r.filter(function(z){ return !z.hidden; }).map(function(z){ return listRow(z, 'r'); })).join('');
  var hid = Z.l.concat(Z.r).filter(function(z){ return z.hidden; });
  var head = '<div class="lb-colhd"><span class="h3">'+esc(lbL('zones'))+'</span><span class="row" style="gap:6px"><button type="button" class="btn btn-sm btn-secondary" data-act="lb-znew" data-side="l">'+ico('plus',14)+esc(lbL('left'))+'</button><button type="button" class="btn btn-sm btn-secondary" data-act="lb-znew" data-side="r">'+ico('plus',14)+esc(lbL('right'))+'</button></span></div>'+
    '<ul class="lb-zlist">'+(all || '<li class="small muted p16">'+esc(lbL('noZones'))+'</li>')+'</ul>'+
    (hid.length ? '<details class="lb-hidden"><summary>'+esc(lbL('hiddenZones'))+' ('+lbN(hid.length)+')</summary><ul>'+hid.map(function(z){ return '<li><span>'+esc(lb_zName(z))+'</span><button type="button" class="btn btn-sm btn-secondary" data-act="lb-zunhide" data-zid="'+esc(z.id)+'">'+esc(lbL('restore'))+'</button></li>'; }).join('')+'</ul></details>' : '');
  if(!F) return head;
  var z = F.z, c = z.content || {}, b = z.blend || {}, tg = z.target || {home:true, cat:'all', cats:[]};
  var num = function(k, label){ return '<div class="lb-f"><label class="label" for="lbz-'+k+'">'+esc(lbL(label))+'</label><input class="input" type="number" inputmode="numeric" min="0" id="lbz-'+k+'" data-input="lb-zn" data-k="'+k+'" value="'+esc(lb_num(z[k]))+'"></div>'; };
  var txt = function(k, label, ph){ return '<div class="lb-f"><label class="label" for="lbzc-'+k+'">'+esc(lbL(label))+'</label><input class="input" id="lbzc-'+k+'" data-input="lb-zc" data-k="'+k+'" value="'+esc(c[k]==null?'':c[k])+'"'+(ph?' placeholder="'+esc(ph)+'"':'')+'></div>'; };
  var prodSel = function(k, label){ return '<div class="lb-f"><label class="label" for="lbzc-'+k+'">'+esc(lbL(label))+'</label><select class="input" id="lbzc-'+k+'" data-change="lb-zcsel" data-k="'+k+'"><option value="">'+esc(lbL('noPic'))+'</option>'+lb_visibleProducts().map(function(p){ return '<option value="'+p.id+'"'+(c[k]===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></div>'; };
  var colorIn = function(k, label, def){ return '<div class="lb-f lb-fcol"><label class="label" for="lbzc-'+k+'">'+esc(lbL(label))+'</label><input type="color" class="lb-color" id="lbzc-'+k+'" data-input="lb-zc" data-k="'+k+'" value="'+esc(c[k]||def||'#888888')+'"></div>'; };
  var content = '';
  if(z.type==='motion') content = lb_motionPanel(z);
  else if(z.type==='banner') content = txt('eyebrow','fEyebrow')+txt('title','fTitle2')+txt('sub','fSub')+txt('cta','fCta')+txt('href','fGo','#/c/new')+prodSel('product','fProduct');
  else if(z.type==='ad'){
    var refs = c.kind==='combo' ? combos().filter(function(x){ return x.active; }).map(function(x){ return [x.id, x.name]; }) : (c.kind==='category' ? DB.categories.filter(function(x){ return !x.hidden; }).map(function(x){ return [x.id, lb_catName(x)]; }) : lb_visibleProducts().map(function(p){ return [p.id, p.name]; }));
    content = '<div class="lb-f"><span class="label">'+esc(lbL('adOf'))+'</span>'+lb_seg('kind', [['product',lbL('adProduct')],['combo',lbL('adCombo')],['category',lbL('adCat')]], c.kind||'product', 'lb-zcset')+'</div>'+
      '<div class="lb-f"><label class="label" for="lbzc-ref">'+esc(lbL('which'))+'</label><select class="input" id="lbzc-ref" data-change="lb-zcsel" data-k="ref">'+refs.map(function(r){ return '<option value="'+esc(r[0])+'"'+(c.ref===r[0]?' selected':'')+'>'+esc(r[1])+'</option>'; }).join('')+'</select></div>'+txt('label','smallLabel','Ad');
  }
  else if(z.type==='popup') content = txt('teaser','popTeaser')+'<div class="lb-f"><span class="label">'+esc(lbL('popWhen'))+'</span>'+lb_seg('trigger', [['view',lbL('popView')],['time',lbL('popTime')],['click',lbL('popClick')]], c.trigger||'view', 'lb-zcset')+'</div>'+
      (c.trigger!=='click' ? '<div class="lb-f"><label class="label" for="lbzc-value">'+esc(lbL('afterSec'))+'</label><input class="input" type="number" min="0" id="lbzc-value" data-input="lb-zc" data-k="value" data-num="1" value="'+esc(lb_num(c.value,3))+'"></div>' : '')+
      '<div class="lb-f"><span class="label">'+esc(lbL('howOften'))+'</span>'+lb_seg('freq', [['session',lbL('fSession')],['day',lbL('fDay')],['week',lbL('fWeek')]], c.freq||'session', 'lb-zcset')+'</div>'+
      txt('title','popTitle')+txt('sub','popText')+txt('cta','fCta')+txt('href','fGo','#/c/new')+prodSel('product','popPic');
  else if(z.type==='figure') content = '<div class="lb-f3">'+colorIn('polo','cTop','#F4F1EA')+colorIn('denim','cBottom','#3D5878')+colorIn('boots','cShoes','#5B3A26')+'</div>'+
      '<div class="lb-f lb-f-row">'+lb_swBtn(c.anim!==false, 'lb-zanim', lbL('entrance'))+'</div><p class="xs muted">'+esc(lbL('reducedNote'))+'</p>';
  else if(z.type==='image') content = '<div class="lb-f"><label class="label" for="lbzc-file">'+esc(lbL('imgUpload'))+'</label><input class="input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="lbzc-file" data-change="lb-zfile" data-k="src" data-max="image"></div>'+
      txt('alt','altText')+txt('href','clickTo','#/c/new');
  else if(z.type==='video') content = '<div class="lb-f"><label class="label" for="lbzc-vfile">'+esc(lbL('vidUpload'))+'</label><input class="input" type="file" accept="video/mp4,video/webm" id="lbzc-vfile" data-change="lb-zfile" data-k="src" data-max="video"></div>'+
      '<div class="lb-f"><label class="label" for="lbzc-pfile">'+esc(lbL('posterUpload'))+'</label><input class="input" type="file" accept="image/png,image/jpeg,image/webp" id="lbzc-pfile" data-change="lb-zfile" data-k="poster" data-max="image"></div>'+txt('alt','altText')+txt('href','clickTo','#/c/new')+
      '<p class="xs muted">'+esc(lbL('reducedNote'))+'</p>';
  var targets = '<div class="lb-f"><span class="label">'+esc(lbL('pages'))+'</span><div class="lb-segs">'+
      '<button type="button" class="chip'+(tg.home!==false?' on':'')+'" aria-pressed="'+(tg.home!==false)+'" data-act="lb-ztg" data-k="home">'+(tg.home!==false?ico('check',13):'')+esc(lbL('tHome'))+'</button></div>'+
      lb_seg('cat', [['all',lbL('catsAll')],['some',lbL('catsSome')],['none',lbL('catsNone')]], tg.cat||'all', 'lb-ztg')+
      (tg.cat==='some' ? '<div class="lb-multi mt8">'+DB.categories.filter(function(x){ return !x.hidden; }).map(function(x){ var on = (tg.cats||[]).indexOf(x.id)>=0; return '<button type="button" class="chip'+(on?' on':'')+'" aria-pressed="'+on+'" data-act="lb-ztgc" data-v="'+x.id+'">'+(on?ico('check',13):'')+esc(lb_catName(x))+'</button>'; }).join('')+'</div>' : '')+
      '<div class="mt8"><span class="label">'+esc(lbL('otherPages'))+'</span>'+lb_seg('pages', [['all',lbL('allOther')],['some',lbL('chosenOther')]], Array.isArray(tg.pages) ? 'some' : 'all', 'lb-ztgp')+
      (Array.isArray(tg.pages) ? '<div class="lb-multi mt8">'+LB_CFG.pageTypes.filter(function(t){ return t[0]!=='home' && t[0]!=='cat'; }).map(function(t){ var on = tg.pages.indexOf(t[0])>=0; return '<button type="button" class="chip'+(on?' on':'')+'" aria-pressed="'+on+'" data-act="lb-ztgpc" data-v="'+t[0]+'">'+(on?ico('check',13):'')+esc(lb_pgName(t[0]))+'</button>'; }).join('')+'</div>' : '')+'</div>'+
      '<p class="xs muted">'+esc(lbL('desktopOnly'))+'</p></div>';
  return head+'<div class="lb-zed card">'+
    '<div class="lb-colhd"><span class="h3">'+esc(lb_zName(z))+' <span class="xs muted">· '+esc(lbL(F.side==='l'?'leftSide':'rightSide'))+'</span></span></div><div class="lb-zpstat" id="lb-zpstat">'+lb_zStatus()+'</div>'+
    '<div class="lb-f lb-f-row">'+lb_swBtn(z.active!==false, 'lb-zact', z.active!==false ? lbL('zoneOn') : lbL('zoneOff'))+'<button type="button" class="btn btn-sm btn-ghost" data-act="lb-zhide">'+ico('eye',14)+esc(lbL('removeZone'))+'</button></div>'+
    '<div class="lb-f"><label class="label" for="lbz-name">'+esc(lbL('zoneName'))+'</label><input class="input" id="lbz-name" data-input="lb-zname" value="'+esc(z.name||'')+'"></div>'+
    '<div class="lb-f"><span class="label">'+esc(lbL('placement'))+'</span>'+lb_seg('place', [['view',lbL('placeView')],['custom',lbL('placeCustom')]], lb_zPlace(z), 'lb-zplace')+'</div>'+
    (lb_zPlace(z)==='view' ? lb_vpPanel(z) :
    '<div class="lb-f3">'+num('top','fromTop')+num('width','width')+num('height','height')+'</div>'+
    '<div class="lb-f"><span class="label">'+esc(lbL('inSide'))+'</span>'+lb_seg('align', [['outer',lbL('alOuter')],['center',lbL('alCenter')],['inner',lbL('alInner')]], z.align||'outer', 'lb-zset')+'</div>')+
    '<div class="lb-f"><span class="label">'+esc(lbL('onScroll'))+'</span>'+lb_seg('mode', [['sticky',lbL('mSticky')],['float',lbL('mFloat')],['anchored',lbL('mAnchored')]], z.mode||'sticky', 'lb-zset')+'</div>'+
    (z.mode==='float' ? '<div class="lb-f"><label class="label" for="lbz-float">'+esc(lbL('floatRange'))+'</label><input class="input" type="number" min="0" max="200" id="lbz-float" data-input="lb-zn" data-k="float" value="'+esc(lb_num(z.float, LB_CFG.floatRange))+'"></div>' : '')+
    '<div class="lb-f"><span class="label">'+esc(lbL('look'))+'</span>'+lb_seg('style', [['card',lbL('sCard')],['full',lbL('sFull')]], z.style||'card', 'lb-zset')+'</div>'+
    targets+
    '<div class="lb-f"><span class="label">'+esc(lbL('holds'))+'</span>'+lb_seg('type', LB_ZT.map(function(k){ return [k, lbL(LB_ZT_KEY[k])]; }), z.type, 'lb-zset')+'</div>'+content+
    '<div class="lb-blendbox"><div class="h3">'+esc(lbL('blend'))+'</div>'+
      '<div class="lb-f"><span class="label">'+esc(lbL('blendColor'))+'</span><div class="lb-segs"><button type="button" class="chip'+(!b.color||b.color==='auto'?' on':'')+'" data-act="lb-zbauto">'+esc(lbL('auto'))+'</button><input type="color" class="lb-color" aria-label="'+esc(lbL('ownColor'))+'" data-input="lb-zbcol" value="'+esc(b.color && b.color!=='auto' ? b.color : lb_hexOf(lb_bgColor()))+'"></div></div>'+
      '<div class="lb-f"><span class="label">'+esc(lbL('fadeTo'))+'</span>'+lb_seg('fade', [['none',lbL('fNone')],['left',lbL('fLeft')],['right',lbL('fRight')],['both',lbL('fBoth')]], b.fade||(z.style==='full'?'both':'none'), 'lb-zbset')+'</div>'+
      '<div class="lb-f"><label class="label" for="lbz-str">'+esc(lbL('strength'))+': <b id="lb-strv">'+lbN(lb_num(b.strength,50))+'</b>%</label><input type="range" min="0" max="100" step="5" id="lbz-str" class="lb-range" data-input="lb-zbstr" value="'+esc(lb_num(b.strength,50))+'"></div>'+
      '<div class="lb-bpv-wrap"><div class="xs muted">'+esc(lbL('realSize'))+'</div><div class="lb-bpv" id="lb-bpv">'+lb_bpv(z)+'</div></div></div>'+
    lb_weightLine(z)+
    '<div class="lb-f2"><div class="lb-f"><label class="label" for="lbz-start">'+esc(lbL('startDay'))+'</label><input class="input" type="date" id="lbz-start" data-input="lb-zd" data-k="start" value="'+esc(z.start||'')+'"></div><div class="lb-f"><label class="label" for="lbz-end">'+esc(lbL('endDay'))+'</label><input class="input" type="date" id="lbz-end" data-input="lb-zd" data-k="end" value="'+esc(z.end||'')+'"></div></div>'+
    '<button type="button" class="btn btn-ghost btn-block mt8" data-act="lb-zsel" data-zid="">'+esc(lbL('backList'))+'</button></div>';
}
/* ---- motion: template grid + product picker + speed/order + AI ---- */
function lb_mtName(d){ return lbLang()==='bn' ? d.bn : d.en; }
function lb_motionPanel(z){
  var m = z.motion || (z.motion = {tpl:'fade', src:{kind:'cat', cat:(DB.categories[0]||{}).id}, speed:2.4, order:'as'});
  var src = m.src || (m.src = {kind:'cat'}), sug = lb_mtSuggest(m), r = lb_mtItems(m, z.id);
  var grid = '<div class="lb-mtgrid" role="radiogroup" aria-label="'+esc(lbL('template'))+'">'+LB_MTPL.map(function(d, i){ var on = m.tpl===d.id;
    return '<button type="button" role="radio" aria-checked="'+on+'" class="lb-mtt'+(on?' on':'')+(d.sig?' sig':'')+'" data-act="lb-mtpl" data-v="'+d.id+'"><span class="lb-mtt-n">'+lbN(i+1)+'. '+esc(lb_mtName(d))+'</span>'+(d.id===sug?'<span class="lb-sug">'+esc(lbL('suggested'))+'</span>':'')+'</button>'; }).join('')+'</div>';
  var kinds = [['cat',lbL('srcKCat')],['sub',lbL('srcKSub')],['rule',lbL('srcKRule')],['manual',lbL('srcKManual')],['combo',lbL('srcKCombo')]];
  var ctl = '';
  if(src.kind==='cat') ctl = '<select class="input" id="lbm-cat" aria-label="'+esc(lbL('fCat'))+'" data-change="lb-msrc" data-k="cat">'+DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){ return '<option value="'+c.id+'"'+(src.cat===c.id?' selected':'')+'>'+esc(lb_catName(c))+'</option>'; }).join('')+'</select>';
  else if(src.kind==='sub') ctl = '<select class="input" id="lbm-sub" aria-label="'+esc(lbL('srcKSub'))+'" data-change="lb-msrc" data-k="sub"><option value="">—</option>'+(DB.subcats||[]).map(function(s){ return '<option value="'+esc(s.id)+'"'+(src.sub===s.id?' selected':'')+'>'+esc(s.id.split('/').map(function(x){ return x.replace(/-/g,' '); }).join(' › '))+'</option>'; }).join('')+'</select>';
  else if(src.kind==='rule') ctl = '<div class="lb-multi">'+lb_visibleProducts().filter(function(p){ return p.colors.length > 1; }).map(function(p){ var on = (src.products||[]).indexOf(p.id)>=0; return '<button type="button" class="chip'+(on?' on':'')+'" aria-pressed="'+on+'" data-act="lb-mrule" data-v="'+p.id+'">'+(on?ico('check',13):'')+esc(p.name)+' <span class="xs muted">'+lbN(p.colors.length)+'</span></button>'; }).join('')+'</div>';
  else if(src.kind==='combo') ctl = '<div class="lb-multi">'+combos().filter(function(c){ return c.active; }).map(function(c){ var on = (src.combos||[]).indexOf(c.id)>=0; return '<button type="button" class="chip'+(on?' on':'')+'" aria-pressed="'+on+'" data-act="lb-mcombo" data-v="'+c.id+'">'+(on?ico('check',13):'')+esc(c.name)+'</button>'; }).join('')+'</div>';
  else {
    var MP = ui('lb-mpick', {p:(lb_visibleProducts()[0]||{}).id, c:''}), pp = P(MP.p);
    ctl = '<div class="lb-f2"><select class="input" aria-label="'+esc(lbL('adProduct'))+'" data-change="lb-mpk" data-k="p">'+lb_visibleProducts().map(function(p){ return '<option value="'+p.id+'"'+(MP.p===p.id?' selected':'')+'>'+esc(p.name)+'</option>'; }).join('')+'</select>'+
      '<select class="input" aria-label="'+esc(lbL('fColor'))+'" data-change="lb-mpk" data-k="c">'+(pp ? pp.colors : []).map(function(c){ return '<option value="'+c+'"'+(MP.c===c?' selected':'')+'>'+esc(COL(c).name)+'</option>'; }).join('')+'</select></div>'+
      '<button type="button" class="btn btn-sm btn-secondary mt8" data-act="lb-mpadd">'+ico('plus',14)+esc(lbL('addPick'))+'</button>'+
      '<div class="lb-multi mt8">'+(src.picks||[]).map(function(x, i){ var p = P(x.p); return p ? '<button type="button" class="chip on" data-act="lb-mpdel" data-i="'+i+'" aria-label="'+esc(lbL('remove')+' '+p.name)+'"><i class="lb-dotc" style="background:'+COL(x.c).hex+'"></i>'+esc(p.name)+ico('close',12)+'</button>' : ''; }).join('')+'</div>';
  }
  var seq = '<div class="lb-seq"><span class="xs bold">'+esc(lbL('sequence', {n:r.items.length}))+'</span><span class="lb-seqd">'+r.items.slice(0, 24).map(function(x){ return '<i title="'+esc(P(x.p).name+' · '+COL(x.c).name)+'" style="background:'+COL(x.c).hex+'"></i>'; }).join('')+'</span></div>';
  var d = lb_mtDef(m.tpl);
  return '<div class="lb-f"><span class="label">'+esc(lbL('template'))+'</span>'+grid+'<p class="xs muted mt8">'+esc(lbLang()==='bn' ? d.desc[1] : d.desc[0])+'</p>'+
      '<div class="row wrap" style="gap:8px">'+(sug!==m.tpl ? '<button type="button" class="btn btn-sm btn-secondary" data-act="lb-msug">'+ico('spark',14)+esc(lbL('useSuggested'))+': '+esc(lb_mtName(lb_mtDef(sug)))+'</button>' : '')+
      '<button type="button" class="btn btn-sm btn-ghost" data-act="lb-msize">'+esc(lbL('autoSize'))+' ('+lbN(d.ref[0])+'×'+lbN(d.ref[1])+')</button></div></div>'+
    '<div class="lb-f"><span class="label">'+esc(lbL('srcFrom'))+'</span>'+lb_seg('kind', kinds, src.kind||'cat', 'lb-mkind')+'<div class="mt8">'+ctl+'</div>'+
      ((src.kind==='cat' || src.kind==='sub') ? '<div class="mt8">'+lb_seg('allColours', [['1',lbL('allColours')],['0',lbL('firstColour')]], src.allColours ? '1' : '0', 'lb-mall')+'</div>' : '')+seq+'</div>'+
    '<div class="lb-f"><label class="label" for="lbm-spd">'+esc(lbL('speed'))+': <b id="lb-spdv">'+lbN(lb_num(m.speed, 2.4))+'</b></label><input type="range" min="1" max="8" step="0.2" id="lbm-spd" class="lb-range" data-input="lb-mspd" value="'+esc(lb_num(m.speed, 2.4))+'"></div>'+
    '<div class="lb-f"><span class="label">'+esc(lbL('order'))+'</span>'+lb_seg('order', [['as',lbL('oAs')],['price',lbL('oPrice')],['shuffle',lbL('oShuffle')]], m.order||'as', 'lb-mord')+'</div>'+
    '<div class="row wrap" style="gap:8px"><button type="button" class="btn btn-secondary" data-act="lb-ai">'+ico('spark',16)+esc(lbL('aiBtn'))+'</button>'+
      (d.id==='walkOut' ? '<button type="button" class="btn btn-ghost" data-act="lb-guide">'+ico('doc',16)+esc(lbL('aiGuide'))+'</button>' : '')+'</div>'+
    (m.ai ? '<p class="xs muted mt8">'+ico('spark',12)+' '+esc(lbL('aiSim'))+'</p>' : '');
}
function lb_bpv(z){
  var w = Math.max(20, lb_num(z.width)), h = Math.max(20, Math.min(560, lb_num(z.height)));
  return '<div class="lb-bpv-in" style="width:'+w+'px;height:'+h+'px">'+lb_zoneHTML(z, w, h, {k:1, imgOnly:w < LB_CFG.minTextW})+'</div>';
}
function lb_zRefresh(full){
  saveState();
  if(full){ var p = document.getElementById('lb-zpanel'); if(p){ p.innerHTML = lb_zPanel(); lb_mtStart(p); } }
  else { var F = lb_scFind(lb_scUI().sel), b = document.getElementById('lb-bpv'); if(F && b){ b.innerHTML = lb_bpv(F.z); lb_mtStart(b); } var wl = document.getElementById('lb-wline'); if(F && wl) wl.outerHTML = lb_weightLine(F.z); }
  lb_ovDraw();
  clearTimeout(LB_PUSH_T); LB_PUSH_T = setTimeout(lb_scPushMap, 150);
}
ACT['lb-scmaster'] = function(){
  var S = lb_sc();
  if(!S.enabled && !confirm(lbL('confirmOn'))) return;
  S.enabled = !S.enabled; if(ST.scDraft) ST.scDraft.enabled = S.enabled; saveState(); rerender(); toast(lbL(S.enabled ? 'turnedOn' : 'turnedOff'));
};
ACT['lb-scpage'] = function(el){ var u = lb_scUI(); u.page = el.getAttribute('data-v'); rerender(); };
ACT['lb-sctab'] = function(el){ lb_scUI().tab = el.getAttribute('data-v'); rerender(); };
ACT['lb-scw'] = function(el){ var u = lb_scUI(); u.size = el.getAttribute('data-v'); rerender(); };
ACT['lb-scmode'] = function(el){ lb_scUI().mapMode = el.getAttribute('data-v'); rerender(); };
ACT['lb-scruler'] = function(el){ lb_scUI().ruler = el.getAttribute('data-v'); [].forEach.call(document.querySelectorAll('[data-act="lb-scruler"]'), function(b){ b.classList.toggle('on', b===el); }); lb_ovDraw(); };
ACT['lb-zsel'] = function(el){ lb_scUI().sel = el.getAttribute('data-zid') || ''; var p = document.getElementById('lb-zpanel'); if(p){ p.innerHTML = lb_zPanel(); lb_mtStart(p); } lb_ovDraw(); lb_sizeStripSync(); };
function lb_zDefaults(type){
  var p = lb_visibleProducts()[0];
  var C = {banner:{eyebrow:'Offer', title:'New in', sub:'Fresh styles this week', cta:'Shop', href:'#/c/new', product:p?p.id:'', color:p?p.colors[0]:''},
    ad:{kind:'product', ref:p?p.id:'', label:'Ad'}, popup:{teaser:'A gift for you', trigger:'view', value:3, freq:'session', title:'Free delivery on your first order', sub:'Cash on Delivery all over Bangladesh.', cta:'Shop now', href:'#/c/new', product:p?p.id:''},
    figure:{polo:'#F4F1EA', denim:'#3D5878', boots:'#5B3A26', anim:true}, image:{src:'', alt:'', href:''}, video:{src:'', poster:'', alt:'', href:''}, motion:{}};
  return lb_clone(C[type] || {});
}
function lb_zNew(side, top, height){
  return {id:lb_id('z'), name:'', top:Math.max(0, Math.round(top||40)), height:Math.max(40, Math.round(height||300)), width:Math.max(40, LB_CFG.refGutter - LB_CFG.safety - LB_CFG.edge), align:'outer', mode:'sticky', float:LB_CFG.floatRange, style:'card', type:'banner', content:lb_zDefaults('banner'),
    blend:{color:'auto', fade:'none', strength:40}, target:{home:true, cat:'all', cats:[]}, start:'', end:'', active:true};
}
ACT['lb-znew'] = function(el){
  var side = el.getAttribute('data-side'), Z = lb_scZones(), last = Z[side].filter(function(z){ return !z.hidden; }).sort(function(a, b){ return b.top + b.height - a.top - a.height; })[0];
  var z = lb_zNew(side, last ? last.top + last.height + 40 : 40, 300); Z[side].push(z); lb_scUI().sel = z.id; lb_zRefresh(true);
};
ACT['lb-zhide'] = function(){ var F = lb_scFind(lb_scUI().sel); if(!F) return; F.z.hidden = true; lb_scUI().sel = ''; lb_zRefresh(true); toast(lbL('zoneRemoved')); };
ACT['lb-zunhide'] = function(el){ var F = lb_scFind(el.getAttribute('data-zid')); if(!F) return; F.z.hidden = false; lb_scUI().sel = F.z.id; lb_zRefresh(true); };
ACT['lb-zact'] = function(){ var F = lb_scFind(lb_scUI().sel); if(!F) return; F.z.active = F.z.active===false; lb_zRefresh(true); };
ACT['lb-zanim'] = function(){ var F = lb_scFind(lb_scUI().sel); if(!F) return; F.z.content.anim = F.z.content.anim===false; lb_zRefresh(true); };
ACT['lb-zset'] = function(el){
  var F = lb_scFind(lb_scUI().sel); if(!F) return; var k = el.getAttribute('data-k'), v = el.getAttribute('data-v'), z = F.z;
  if(k==='type' && z.type!==v){
    z.type = v; z.content = lb_zDefaults(v);
    if(v==='motion'){ z.motion = z.motion || {tpl:'fade', src:{kind:'cat', cat:(DB.categories[0]||{}).id}, speed:2.4, order:'as'}; z.motion.tpl = lb_mtSuggest(z.motion); }
    if(v==='figure' || v==='image' || v==='video'){ z.blend = z.blend || {}; if(!z.blend.fade || z.blend.fade==='none') z.blend.fade = 'both'; z.blend.strength = z.blend.strength || 60; }
  } else z[k] = v;
  lb_zRefresh(true);
};
ACT['lb-ztg'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; var t = F.z.target = F.z.target || {home:true, cat:'all', cats:[]}, k = el.getAttribute('data-k');
  if(k==='home') t.home = t.home===false; else { t.cat = el.getAttribute('data-v'); if(!t.cats) t.cats = []; }
  lb_zRefresh(true); };
ACT['lb-ztgp'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; var t = F.z.target = F.z.target || {home:true, cat:'all', cats:[]}; t.pages = el.getAttribute('data-v')==='all' ? 'all' : (Array.isArray(t.pages) ? t.pages : []); lb_zRefresh(true); };
ACT['lb-ztgpc'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; var t = F.z.target, v = el.getAttribute('data-v'); if(!Array.isArray(t.pages)) t.pages = []; var i = t.pages.indexOf(v); if(i>=0) t.pages.splice(i, 1); else t.pages.push(v); lb_zRefresh(true); };
ACT['lb-ztgc'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; var t = F.z.target, v = el.getAttribute('data-v'), i = (t.cats = t.cats || []).indexOf(v); if(i>=0) t.cats.splice(i, 1); else t.cats.push(v); lb_zRefresh(true); };
ACT['lb-zcset'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; var k = el.getAttribute('data-k'), v = el.getAttribute('data-v'); F.z.content[k] = v;
  if(k==='kind'){ F.z.content.ref = v==='combo' ? ((combos().filter(function(x){ return x.active; })[0]||{}).id||'') : (v==='category' ? ((DB.categories.filter(function(x){ return !x.hidden; })[0]||{}).id||'') : ((lb_visibleProducts()[0]||{}).id||'')); }
  lb_zRefresh(true); };
ACT['lb-zbset'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; F.z.blend = F.z.blend || {}; F.z.blend.fade = el.getAttribute('data-v'); lb_zRefresh(true); };
ACT['lb-zbauto'] = function(){ var F = lb_scFind(lb_scUI().sel); if(!F) return; F.z.blend = F.z.blend || {}; F.z.blend.color = 'auto'; lb_zRefresh(true); };
INPUT['lb-zn'] = function(el){
  var F = lb_scFind(lb_scUI().sel); if(!F) return; var k = el.getAttribute('data-k'), v = Math.max(0, Math.round(lb_num(el.value)));
  if(k==='width' || k==='height') v = Math.max(20, v);
  F.z[k] = v; lb_zRefresh(false);
};
INPUT['lb-zname'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; F.z.name = el.value; saveState(); lb_ovDraw(); };
INPUT['lb-zc'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; F.z.content[el.getAttribute('data-k')] = el.getAttribute('data-num') ? lb_num(el.value) : el.value; lb_zRefresh(false); };
CHANGE['lb-zcsel'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; var k = el.getAttribute('data-k'); F.z.content[k] = el.value; if(k==='product'){ var p = P(el.value); F.z.content.color = p ? p.colors[0] : ''; } lb_zRefresh(false); };
INPUT['lb-zd'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; F.z[el.getAttribute('data-k')] = el.value; lb_zRefresh(false); };
INPUT['lb-zbcol'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; F.z.blend = F.z.blend || {}; F.z.blend.color = el.value; [].forEach.call(document.querySelectorAll('[data-act="lb-zbauto"]'), function(b){ b.classList.remove('on'); }); lb_zRefresh(false); };
INPUT['lb-zbstr'] = function(el){ var F = lb_scFind(lb_scUI().sel); if(!F) return; F.z.blend = F.z.blend || {}; F.z.blend.strength = lb_num(el.value); var o = document.getElementById('lb-strv'); if(o) o.textContent = lbN(F.z.blend.strength); lb_zRefresh(false); };
/* uploads: kept in this browser; the budget decides (a file over it is refused here and blocked in the shop) */
CHANGE['lb-zfile'] = function(el){
  var F = lb_scFind(lb_scUI().sel), file = el.files && el.files[0]; if(!F || !file) return;
  var max = el.getAttribute('data-max')==='video' ? LB_CFG.budget.video : LB_CFG.budget.image, k = el.getAttribute('data-k');
  if(file.size > max){ toast(lbL('tooBig', {n:lb_kb(max)})); el.value = ''; return; }
  var r = new FileReader(); r.onload = function(){ F.z.content[k] = String(r.result); if(k==='src' && F.z.type==='video') F.z.content.mime = file.type; lb_zRefresh(false); toast(lbL(F.z.type==='video' && k==='src' ? 'vidSet' : 'picSet')); }; r.readAsDataURL(file);
};
/* motion actions */
function lb_mF(){ var F = lb_scFind(lb_scUI().sel); if(!F) return null; F.z.motion = F.z.motion || {tpl:'fade', src:{kind:'cat'}, speed:2.4, order:'as'}; F.z.motion.src = F.z.motion.src || {kind:'cat'}; return F; }
ACT['lb-mtpl'] = function(el){ var F = lb_mF(); if(!F) return; F.z.motion.tpl = el.getAttribute('data-v'); lb_zRefresh(true); };
ACT['lb-msug'] = function(){ var F = lb_mF(); if(!F) return; F.z.motion.tpl = lb_mtSuggest(F.z.motion); lb_zRefresh(true); };
ACT['lb-msize'] = function(){ var F = lb_mF(); if(!F) return; var d = lb_mtDef(F.z.motion.tpl); F.z.width = d.ref[0]; F.z.height = d.ref[1]; lb_zRefresh(true); };
ACT['lb-mkind'] = function(el){ var F = lb_mF(); if(!F) return; var s = F.z.motion.src, v = el.getAttribute('data-v'); s.kind = v;
  if(v==='cat' && !s.cat) s.cat = (DB.categories[0]||{}).id; if(v==='sub' && !s.sub) s.sub = ((DB.subcats||[]).filter(function(x){ return x.id.split('/').length===3; })[0]||{}).id||'';
  if(v==='rule' && !(s.products||[]).length) s.products = [(lb_visibleProducts().filter(function(p){ return p.colors.length > 2; })[0]||{}).id];
  if(v==='manual' && !s.picks) s.picks = []; if(v==='combo' && !s.combos) s.combos = [];
  F.z.motion.tpl = lb_mtSuggest(F.z.motion); lb_zRefresh(true); };
CHANGE['lb-msrc'] = function(el){ var F = lb_mF(); if(!F) return; F.z.motion.src[el.getAttribute('data-k')] = el.value; F.z.motion.tpl = lb_mtSuggest(F.z.motion); lb_zRefresh(true); };
ACT['lb-mall'] = function(el){ var F = lb_mF(); if(!F) return; F.z.motion.src.allColours = el.getAttribute('data-v')==='1'; F.z.motion.tpl = lb_mtSuggest(F.z.motion); lb_zRefresh(true); };
ACT['lb-mrule'] = function(el){ var F = lb_mF(); if(!F) return; var a = F.z.motion.src.products = F.z.motion.src.products || [], v = el.getAttribute('data-v'), i = a.indexOf(v); if(i>=0) a.splice(i, 1); else a.push(v); F.z.motion.tpl = lb_mtSuggest(F.z.motion); lb_zRefresh(true); };
ACT['lb-mcombo'] = function(el){ var F = lb_mF(); if(!F) return; var a = F.z.motion.src.combos = F.z.motion.src.combos || [], v = el.getAttribute('data-v'), i = a.indexOf(v); if(i>=0) a.splice(i, 1); else a.push(v); lb_zRefresh(true); };
CHANGE['lb-mpk'] = function(el){ var MP = ui('lb-mpick', {}); MP[el.getAttribute('data-k')] = el.value; if(el.getAttribute('data-k')==='p'){ var p = P(el.value); MP.c = p ? p.colors[0] : ''; } lb_zRefresh(true); };
ACT['lb-mpadd'] = function(){ var F = lb_mF(); if(!F) return; var MP = ui('lb-mpick', {}), p = P(MP.p); if(!p) return; (F.z.motion.src.picks = F.z.motion.src.picks || []).push({p:p.id, c:MP.c || p.colors[0]}); F.z.motion.tpl = lb_mtSuggest(F.z.motion); lb_zRefresh(true); };
ACT['lb-mpdel'] = function(el){ var F = lb_mF(); if(!F) return; F.z.motion.src.picks.splice(+el.getAttribute('data-i'), 1); lb_zRefresh(true); };
INPUT['lb-mspd'] = function(el){ var F = lb_mF(); if(!F) return; F.z.motion.speed = lb_num(el.value); var o = document.getElementById('lb-spdv'); if(o) o.textContent = lbN(F.z.motion.speed); lb_zRefresh(false); };
ACT['lb-mord'] = function(el){ var F = lb_mF(); if(!F) return; F.z.motion.order = el.getAttribute('data-v'); lb_zRefresh(true); };
ACT['lb-guide'] = function(){
  var pts = lbLang()==='bn'
    ? ['মডেল পেজের গভীর থেকে ৩–৪ পা হেঁটে সামনে আসে (প্রায় ৩০% থেকে ৯০% উচ্চতা), থামে, ¾ ঘোরে, শুরুতে ফিরে যায় — লুপ বোঝা যায় না।','ক্যামেরা স্থির, বুকের একটু নিচে চোখের লেভেলে; ধীরে ঘোরা ≤ ৮°।','পোশাক হুবহু আমাদের প্রোডাক্টের মতো (রং, ফিট, কলার, প্ল্যাকেট, ডেনিম ওয়াশ, জুতো)।','ব্যাকগ্রাউন্ড ঠিক পেজের রং, কিনারা ≥ ৪০ px মিলিয়ে যায় — কোনো বক্স বা কিনারা নয়।','৪–৬ সেকেন্ড, MP4 + WebM, শব্দ ছাড়া, ≤ ১.৫ MB, পোস্টার ≤ ১৫০ KB।','আসল মানুষের চেহারা অনুমতি ছাড়া কখনো নয়; আগে লাইব্রেরিতে মিলে যাওয়া খুঁজুন — থাকলে আবার টাকা দিতে হয় না।']
    : ['The model walks 3–4 steps from deep in the page (≈30% height) to near (≈90%), stops, turns ¾ and returns — the loop point is invisible.','Fixed camera at eye level slightly below chest; slow orbit ≤ 8°.','Garments match our products exactly (colour, fit, collar, placket, denim wash, shoes).','Background is exactly the page colour, edges feather ≥ 40 px — no box, no edge.','4–6 s, MP4 + WebM, muted, ≤ 1.5 MB, poster ≤ 150 KB.','Never a real person’s likeness without consent; look in the library first — a match costs nothing.'];
  openModal('<div class="lb-guide"><ul>'+pts.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul><p class="xs muted">'+esc(lbL('guideFile'))+': <code>agents/skills/gyani/studio/WALKOUT-TEMPLATE.md</code></p></div>', {title:lbL('guideTitle'), cls:'lb-modal'});
};

/* ---- AI studio (simulated) + asset library: never pay twice ---- */
function lb_assets(){ if(!Array.isArray(ST.aiAssets)) ST.aiAssets = []; return ST.aiAssets; }
function lb_assetKey(kind, tpl, items){ var ps = {}, cs = {}; items.forEach(function(x){ ps[x.p] = 1; cs[x.p+':'+x.c] = 1; }); return kind+'|'+tpl+'|'+Object.keys(ps).sort().join(',')+'|'+Object.keys(cs).sort().join(','); }
function lb_assetFind(kind, tpl, items){ var k = lb_assetKey(kind, tpl, items); return lb_assets().filter(function(a){ return !a.hidden && a.key===k; })[0] || null; }
function lb_aiCost(kind, n){ return kind==='video' ? LB_CFG.aiCost.video : LB_CFG.aiCost.pose * Math.max(1, n); }
ACT['lb-ai'] = function(){
  var F = lb_mF(); if(!F) return;
  var A = UI['lb-ai'] = {kind:F.z.motion.tpl==='walkOut' ? 'video' : 'poses', busy:false};
  var build = function(){
    var r = lb_mtItems(F.z.motion, F.z.id), tpl = A.kind==='video' ? 'walkOut' : 'poseCycle', hit = lb_assetFind(A.kind, tpl, r.items);
    var list = r.items.slice(0, 12).map(function(x){ var p = P(x.p); return '<li><i class="lb-dotc" style="background:'+COL(x.c).hex+'"></i>'+esc(p.name)+' · '+esc(COL(x.c).name)+'</li>'; }).join('');
    return '<div class="lb-aist"><div class="lb-f"><span class="label">'+esc(lbL('aiFor'))+'</span><ul class="lb-ailist">'+list+(r.items.length > 12 ? '<li>+'+lbN(r.items.length-12)+'</li>' : '')+'</ul></div>'+
      '<div class="lb-f"><span class="label">'+esc(lbL('aiKind'))+'</span>'+lb_seg('kind', [['poses',lbL('aiPoses')],['video',lbL('aiVideo')]], A.kind, 'lb-aikind')+'</div>'+
      '<p class="small text2">'+esc(lbL('estCost'))+': <b>'+fmt(lb_aiCost(A.kind, 4))+'</b></p>'+
      (hit ? '<div class="lb-aihit card">'+ico('check',16)+'<div><b>'+esc(lbL('aiFound'))+'</b><div class="xs muted">'+esc(lbL('made'))+' '+esc(dateStr(hit.created))+' · '+esc(lbL('uses'))+' '+lbN(hit.uses)+' · '+esc(lbL('cost'))+' '+fmt(hit.cost)+'</div></div></div>' : '')+
      '<p class="xs muted">'+esc(lbL('aiSim'))+'</p>'+
      '<div class="lb-mfoot"><a class="btn btn-ghost" href="#/admin/ai?tab=media" data-act="close-modal-go">'+esc(lbL('aiOpen'))+'</a>'+
        (hit ? '<button type="button" class="btn btn-secondary" data-act="lb-aigen" data-force="1"'+(A.busy?' disabled':'')+'>'+esc(lbL('aiNew'))+'</button><button type="button" class="btn btn-primary" data-act="lb-aireuse" data-id="'+esc(hit.id)+'">'+esc(lbL('aiReuse'))+'</button>'
          : '<button type="button" class="btn btn-primary" data-act="lb-aigen"'+(A.busy?' disabled':'')+'>'+esc(A.busy ? lbL('aiWorking') : lbL('aiMake'))+'</button>')+'</div></div>';
  };
  openModal(build(), {title:lbL('aiStudio'), wide:true, rebuild:build, cls:'lb-modal'});
};
ACT['close-modal-go'] = function(el){ closeModal(); go(el.getAttribute('href')); };
ACT['lb-aikind'] = function(el){ var A = UI['lb-ai']; if(!A) return; A.kind = el.getAttribute('data-v'); refreshModal(); };
function lb_aiAttach(F, a){
  F.z.motion.ai = {assetId:a.id, kind:a.kind, poses:a.kind==='poses' ? 4 : 0, simulated:true};
  F.z.motion.tpl = a.template;
  if(a.template==='walkOut' || a.template==='poseCycle'){ var d = lb_mtDef(a.template); if(lb_num(F.z.height) < d.ref[1] * .8){ F.z.width = d.ref[0]; F.z.height = d.ref[1]; } }
}
ACT['lb-aireuse'] = function(el){
  var F = lb_mF(), a = lb_assets().filter(function(x){ return x.id===el.getAttribute('data-id'); })[0]; if(!F || !a) return;
  a.uses = (a.uses||0) + 1; a.saved = (a.saved||0) + a.cost; lb_aiAttach(F, a);
  closeModal(); lb_zRefresh(true); toast(lbL('aiReused'));
};
ACT['lb-aigen'] = function(el){
  var F = lb_mF(), A = UI['lb-ai']; if(!F || !A || A.busy) return;
  if(el.getAttribute('data-force') && !confirm(lbL('aiConfirmNew'))) return;
  A.busy = true; refreshModal();
  setTimeout(function(){
    var r = lb_mtItems(F.z.motion, F.z.id), tpl = A.kind==='video' ? 'walkOut' : 'poseCycle';
    var a = {id:lb_id('ai'), key:lb_assetKey(A.kind, tpl, r.items), kind:A.kind==='video' ? 'video' : 'poses', template:tpl,
      productIds:Object.keys(r.items.reduce(function(o, x){ o[x.p] = 1; return o; }, {})), colours:r.items.map(function(x){ return x.p+':'+x.c; }),
      created:Date.now(), cost:lb_aiCost(A.kind, 4), size:A.kind==='video' ? 1180000 : 4 * 96000, uses:1, saved:0, simulated:true};
    lb_assets().push(a); lb_aiAttach(F, a); A.busy = false;
    closeModal(); lb_zRefresh(true); toast(lbL('aiMade'));
  }, 700);
};
function lb_libHTML(where){
  var u = lb_scUI(), Lf = u.lib || (u.lib = {tpl:'', p:'', cat:''});
  var all = lb_assets().filter(function(a){ return !a.hidden; });
  var list = all.filter(function(a){ return (!Lf.tpl || a.template===Lf.tpl) && (!Lf.p || a.productIds.indexOf(Lf.p)>=0) && (!Lf.cat || a.productIds.some(function(pid){ var p = P(pid); return p && p.cat===Lf.cat; })); });
  var spent = all.reduce(function(s, a){ return s + (a.cost||0); }, 0), saved = all.reduce(function(s, a){ return s + (a.saved||0); }, 0);
  var opt = function(v, label, cur){ return '<option value="'+esc(v)+'"'+(cur===v?' selected':'')+'>'+esc(label)+'</option>'; };
  var filters = '<div class="lb-libf"><select class="input" aria-label="'+esc(lbL('template'))+'" data-change="lb-libf" data-k="tpl">'+opt('', lbL('allTemplates'), Lf.tpl)+LB_MTPL.map(function(d){ return opt(d.id, lb_mtName(d), Lf.tpl); }).join('')+'</select>'+
    '<select class="input" aria-label="'+esc(lbL('products'))+'" data-change="lb-libf" data-k="p">'+opt('', lbL('allProducts'), Lf.p)+lb_visibleProducts().map(function(p){ return opt(p.id, p.name, Lf.p); }).join('')+'</select>'+
    '<select class="input" aria-label="'+esc(lbL('fCat'))+'" data-change="lb-libf" data-k="cat">'+opt('', lbL('allCats'), Lf.cat)+DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){ return opt(c.id, lb_catName(c), Lf.cat); }).join('')+'</select></div>';
  var cards = list.map(function(a){
    var thumbs = a.colours.slice(0, 8).map(function(pc){ var q = pc.split(':'); return '<i style="background:'+COL(q[1]).hex+'" title="'+esc((P(q[0])||{}).name+' · '+COL(q[1]).name)+'"></i>'; }).join('');
    return '<div class="lb-asset card"><div class="lb-asset-h"><b>'+esc(a.kind==='video' ? lbL('aiVideo') : lbL('aiPoses'))+'</b><span class="tag">'+esc(lb_mtName(lb_mtDef(a.template)))+'</span>'+(a.simulated?'<span class="tag plain">Demo · simulated</span>':'')+'</div>'+
      '<div class="small">'+esc(a.productIds.map(function(id){ return (P(id)||{}).name || id; }).join(', '))+'</div><div class="lb-seqd">'+thumbs+'</div>'+
      '<div class="xs muted">'+esc(lbL('made'))+' '+esc(dateStr(a.created))+' · '+esc(lbL('size'))+' '+lb_kb(a.size)+' · '+esc(lbL('cost'))+' '+fmt(a.cost)+' · '+esc(lbL('uses'))+' '+lbN(a.uses)+' · '+esc(lbL('saved'))+' '+fmt(a.saved||0)+'</div>'+
      (where==='side' ? '<button type="button" class="btn btn-sm btn-secondary mt8" data-act="lb-libuse" data-id="'+esc(a.id)+'">'+esc(lbL('useInZone'))+'</button>' : '')+'</div>';
  }).join('');
  return '<section class="lb-lib"><div class="h2">'+esc(lbL('libTitle'))+'</div><p class="small text2">'+esc(lbL('libLead'))+'</p>'+
    '<div class="lb-libsum">'+esc(lbL('libTotal', {n:all.length, c:fmt(spent), s:fmt(saved)}))+'</div>'+filters+
    '<div class="lb-assets">'+(cards || '<p class="small muted">'+esc(lbL('libEmpty'))+'</p>')+'</div></section>';
}
CHANGE['lb-libf'] = function(el){ var u = lb_scUI(); u.lib[el.getAttribute('data-k')] = el.value; var b = document.getElementById('lb-libbox') || document.getElementById('lb-libbox-ai'); if(b) b.innerHTML = lb_libHTML(b.id==='lb-libbox' ? 'side' : 'ai'); };
ACT['lb-libuse'] = function(el){
  var u = lb_scUI(), F = lb_scFind(u.sel), a = lb_assets().filter(function(x){ return x.id===el.getAttribute('data-id'); })[0];
  if(!F || !a){ toast(lbL('pickZoneFirst')); return; }
  if(F.z.type!=='motion'){ F.z.type = 'motion'; F.z.motion = {src:{kind:'rule', products:a.productIds.slice()}, speed:2.4, order:'as'}; }
  a.uses = (a.uses||0) + 1; a.saved = (a.saved||0) + a.cost; lb_aiAttach(F, a); saveState(); u.tab = 'zones'; rerender(); toast(lbL('aiReused'));
};

/* ---- speed: weights + a live measurement + the lab numbers ---- */
/* the last lab run (tools/lb-perf.js, Playwright, home at 1440, canvas off vs on, motion allowed,, 9 runs each, median) */
var LB_PERF_LAB = {date:'19 Oct 2026', lcpDelta:28, cls:0, longTask:19, slowPct:2.3, slowOff:1.7, layoutMs:10.5};
function lb_speedPanel(){
  var lab = LB_PERF_LAB, row = function(k, v, ok){ return '<div class="lb-sprow"><span>'+esc(lbL(k))+'</span><b class="'+(ok?'ok':'bad')+'">'+esc(v)+'</b></div>'; };
  return '<section class="lb-speed card"><div class="lb-colhd"><span class="h3">'+esc(lbL('speedTitle'))+' / Speed</span><button type="button" class="btn btn-sm btn-secondary" data-act="lb-measure">'+esc(lbL('measureNow'))+'</button></div>'+
    '<p class="xs muted">'+esc(lbL('speedLead'))+'</p>'+lb_pageWeightHTML()+
    '<div id="lb-splive"></div>'+
    (lab ? '<div class="lb-splab"><div class="xs bold mt8">'+esc(lbL('labTest'))+' · '+esc(lab.date)+'</div>'+
      row('lcp', (lab.lcpDelta>=0?'+':'')+lab.lcpDelta+' ms', lab.lcpDelta <= 100)+row('cls', String(lab.cls), lab.cls===0)+
      row('longTask', lab.longTask+' ms', lab.longTask <= 50)+row('slowFrames', lab.slowPct+'%'+(lab.slowOff!=null ? ' ('+lbL('withoutCanvas')+' '+lab.slowOff+'%)' : ''), lab.slowPct <= 5 || (lab.slowOff!=null && lab.slowPct - lab.slowOff <= 2))+row('layoutMs', lab.layoutMs+' ms', lab.layoutMs <= 16)+'</div>' : '')+
    '<div class="lb-frame lb-spframe" id="lb-fr-speed" hidden><iframe title="speed test" tabindex="-1"></iframe></div></section>';
}
function lb_speedBoot(){}
ACT['lb-measure'] = function(){
  var el = document.getElementById('lb-fr-speed'), out = document.getElementById('lb-splive'); if(!el || !out) return;
  el.hidden = false; out.innerHTML = '<p class="xs muted">'+esc(lbL('measuring'))+'</p>';
  lb_frameBoot(el, 1440, 900, lb_frameState({hash:'#/', forceCanvas:true, noPopups:true}));
  var ifr = el.querySelector('iframe');
  var wait = function(n){
    var w = null; try{ w = ifr.contentWindow; }catch(e){}
    if(!w || typeof w.lb_perfRun!=='function' || !w.document.getElementById('lb-sc')){ if(n < 60) return setTimeout(function(){ wait(n+1); }, 150); out.innerHTML = '<p class="xs muted">—</p>'; return; }
    w.lb_perfRun(2000).then(function(r){
      var row = function(k, v, ok){ return '<div class="lb-sprow"><span>'+esc(lbL(k))+'</span><b class="'+(ok?'ok':'bad')+'">'+esc(v)+'</b></div>'; };
      out.innerHTML = '<div class="xs muted mt8">'+esc(lbL('liveNote'))+'</div>'+row('longTask', r.longTask+' ms', r.longTask <= 50)+row('layoutMs', r.layoutMs+' ms', r.layoutMs <= 16)+
        '<div class="lb-sprow"><span>'+esc(lbL('slowFrames'))+'</span><b>'+esc(r.slowPct+'%')+'</b></div><div class="lb-sprow"><span>'+esc(lbL('pageTask'))+'</span><b>'+esc(r.pageTask+' ms')+'</b></div>';
      el.hidden = true;
    });
  };
  wait(0);
};
/* inside a frame (or the page): scroll for a while and watch the frames */
var LB_PERF = {layoutMs:0, maxTask:0, calls:0};
function lb_perfNote(ms, kind){ LB_PERF.calls++; if(ms > LB_PERF.maxTask){ LB_PERF.maxTask = ms; LB_PERF.maxKind = kind; } }
function lb_perfRun(ms){
  return new Promise(function(res){
    var deltas = [], last = 0, t0 = performance.now(), lt = 0, po = null; LB_PERF.maxTask = 0;
    try{ po = new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){ lt = Math.max(lt, e.duration); }); }); po.observe({type:'longtask', buffered:false}); }catch(e){}
    var maxY = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    var step = function(now){
      if(last) deltas.push(now - last); last = now;
      var k = (now - t0) / ms; window.scrollTo(0, Math.round(maxY * Math.min(1, k) * 0.6));
      if(now - t0 < ms) requestAnimationFrame(step);
      else { try{ po && po.disconnect(); }catch(e){} var slow = deltas.filter(function(d){ return d > 20; }).length;
        window.scrollTo(0, 0); res({frames:deltas.length, slowPct:Math.round(slow / Math.max(1, deltas.length) * 1000) / 10, pageTask:Math.round(lt), longTask:Math.round(LB_PERF.maxTask * 10) / 10, layoutMs:Math.round(LB_PERF.layoutMs * 10) / 10}); }
    };
    requestAnimationFrame(step);
  });
}

/* ---- drawing and dragging on the map (one pointer path for mouse, pen and touch) ---- */
function lb_mapDragInit(){
  var ov = document.getElementById('lb-ov'); if(!ov || ov.__lbd) return; ov.__lbd = 1;
  var info = function(){ var el = document.getElementById('lb-fr-map'), f = el && LB_FRAMES[el.getAttribute('data-fid')]; return f && f.geom ? {g:f.geom, s:+el.getAttribute('data-scale')||1} : null; };
  ov.addEventListener('keydown', function(e){
    var wk = e.target.closest && e.target.closest('.lb-wz');
    if(wk && (e.key==='Enter' || e.key===' ')){ e.preventDefault(); lb_scUI().sel = wk.getAttribute('data-zid'); var p0 = document.getElementById('lb-zpanel'); if(p0){ p0.innerHTML = lb_zPanel(); lb_mtStart(p0); } lb_ovDraw(); return; }
    var oz = e.target.closest && e.target.closest('.lb-oz'); if(!oz) return;
    if(e.key==='Enter' || e.key===' '){ e.preventDefault(); lb_scUI().sel = oz.getAttribute('data-zid'); var p = document.getElementById('lb-zpanel'); if(p){ p.innerHTML = lb_zPanel(); lb_mtStart(p); } lb_ovDraw(); return; }
    if(e.key==='ArrowUp' || e.key==='ArrowDown'){ var F = lb_scFind(oz.getAttribute('data-zid')); if(!F) return; e.preventDefault(); F.z.top = Math.max(0, lb_num(F.z.top) + (e.key==='ArrowUp' ? -1 : 1) * (e.shiftKey ? 50 : 10)); lb_scUI().sel = F.z.id; lb_zRefresh(true);
      setTimeout(function(){ var n = document.querySelector('.lb-oz[data-zid="'+F.z.id+'"]'); if(n) n.focus(); }, 0); }
  });
  ov.addEventListener('pointerdown', function(ev){
    var I = info(); if(!I || ev.button > 0) return;
    var g = I.g, s = I.s, orect = ov.getBoundingClientRect();
    var wz = ev.target.closest('.lb-wz');
    if(wz){ lb_wzDrag(ev, wz); return; }
    var oz = ev.target.closest('.lb-oz'), gut = ev.target.closest('.lb-gut');
    if(!oz && !gut) return;
    ev.preventDefault();
    var y0 = ev.clientY, x0 = ev.clientX, mode, F, z0, ghost = null, side = null, k = 1;
    if(oz){
      F = lb_scFind(oz.getAttribute('data-zid')); if(!F) return; z0 = lb_clone(F.z); k = +oz.getAttribute('data-k') || 1;
      mode = ev.target.getAttribute('data-h')==='s' ? 'h' : (ev.target.getAttribute('data-h')==='w' ? 'w' : 'move');
      if(lb_scUI().sel !== F.z.id){ lb_scUI().sel = F.z.id; var pp = document.getElementById('lb-zpanel'); if(pp){ pp.innerHTML = lb_zPanel(); lb_mtStart(pp); } }
    } else {
      mode = 'draw'; side = gut.getAttribute('data-side'); k = lb_scaleFor(side==='l' ? g.gL : g.gR);
      ghost = document.createElement('div'); ghost.className = 'lb-oz lb-ghost'; ov.appendChild(ghost);
    }
    var mv = function(e){
      var dy = (e.clientY - y0) / s / k, dx = (e.clientX - x0) / s / k;   /* screen px → standard (1440) px */
      if(mode==='move'){ F.z.top = Math.max(0, Math.round(z0.top + dy)); }
      else if(mode==='h'){ F.z.height = Math.max(20, Math.round(z0.height + dy)); }
      else if(mode==='w'){ F.z.width = Math.max(20, Math.round(z0.width + (F.side==='l' ? dx : -dx))); }
      else if(mode==='draw'){
        var ya = Math.min(y0, e.clientY) - orect.top, yb = Math.max(y0, e.clientY) - orect.top;
        var G = side==='l' ? g.gL : g.gR, gx = side==='l' ? 0 : (g.vw - G) * s;
        ghost.style.cssText = 'left:'+gx+'px;top:'+ya+'px;width:'+(G*s)+'px;height:'+Math.max(2, yb-ya)+'px';
        return;
      }
      var n = document.querySelector('.lb-oz[data-zid="'+F.z.id+'"]');
      if(n){ var pk = lb_placedOf(F.z.id); var dyPx = (F.z.top - z0.top) * k; if(pk){ n.style.top = ((g.bandTop + pk.top + dyPx) * s)+'px'; n.style.height = (F.z.height * k * s)+'px'; n.style.width = (F.z.width * k * s)+'px'; } }
      ['top','width','height'].forEach(function(kk){ var i = document.getElementById('lbz-'+kk); if(i) i.value = F.z[kk]; });
    };
    var up = function(e){
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      if(mode==='draw'){
        var ya = ((Math.min(y0, e.clientY) - orect.top) / s - g.bandTop) / k, yb = ((Math.max(y0, e.clientY) - orect.top) / s - g.bandTop) / k;
        if(ghost) ghost.remove();
        var h = yb - ya < 30 ? 300 : yb - ya;
        var z = lb_zNew(side, ya, h); lb_scZones()[side].push(z); lb_scUI().sel = z.id; lb_zRefresh(true); toast(lbL('newZoneToast')); return;
      }
      lb_zRefresh(true);
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });
}

/* dragging the red box in the window view: top edge, bottom edge, inner edge (width) or the middle */
function lb_wzDrag(ev, wz){
  var f = lb_mapFrame(), el = document.getElementById('lb-fr-map'); if(!f || !f.view) return;
  var F = lb_scFind(wz.getAttribute('data-zid')); if(!F) return;
  ev.preventDefault();
  if(lb_scUI().sel !== F.z.id){ lb_scUI().sel = F.z.id; var pp = document.getElementById('lb-zpanel'); if(pp){ pp.innerHTML = lb_zPanel(); lb_mtStart(pp); } }
  var p = lb_placedOf(F.z.id); if(!p || !p.view) return;
  var V = f.view, s = +el.getAttribute('data-scale') || 1, U = V.vh - V.hdr, G = F.side==='l' ? V.gL : V.gR, wh = lb_scMapWH(), key = lb_vpKey(wh[0], wh[1]);
  var h = ev.target.getAttribute('data-h') || 'm', v0 = lb_vpFor(F.z, wh[0], wh[1], lb_scPreviewKey()), y0 = ev.clientY, x0 = ev.clientX, r0 = {top:wz.offsetTop, h:wz.offsetHeight, left:wz.offsetLeft, w:wz.offsetWidth};
  var t = lb_vpTarget(F.z, key), nv = {};
  var mv = function(e){
    var dy = (e.clientY - y0) / s, dx = (e.clientX - x0) / s, dTop = dy / U * 100;
    nv = {top:v0.top, height:v0.height, width:v0.width};
    if(h==='m') nv.top = Math.max(0, Math.min(100 - v0.height, v0.top + dTop));
    else if(h==='t'){ nv.top = Math.max(0, Math.min(v0.top + v0.height - 5, v0.top + dTop)); nv.height = v0.height - (nv.top - v0.top); }
    else if(h==='b') nv.height = Math.max(5, Math.min(100 - v0.top, v0.height + dTop));
    else if(h==='w'){ var dw = F.side==='l' ? -dx : dx; nv.width = Math.max(5, Math.min(100, v0.width + dw / Math.max(1, G) * 100)); }
    ['top','height','width'].forEach(function(k){ nv[k] = Math.round(nv[k] * 10) / 10; });
    /* live outline */
    wz.style.top = ((V.hdr + U * nv.top / 100) * s)+'px'; wz.style.height = (U * nv.height / 100 * s)+'px';
    if(h==='w'){ var nw = Math.min(G * nv.width / 100, G - (p.view.gap||16)); wz.style.width = (nw * s)+'px'; if(F.side==='l') wz.style.left = ((G - (p.view.gap||16) - nw) * s)+'px'; }
    ['top','height','width'].forEach(function(k){ var i = document.getElementById('lbv-'+k); if(i) i.value = nv[k]; }); var b = document.getElementById('lbv-bottom'); if(b) b.value = Math.round((100 - nv.top - nv.height)*10)/10;
  };
  var up = function(){
    document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
    if(nv.top==null) return;
    if(!t.w){ ['gap'].forEach(function(k){ if(t[k]==null) t[k] = v0[k]; }); }
    t.top = nv.top; t.height = nv.height; t.width = nv.width; if(t.gap==null) t.gap = v0.gap;
    lb_zRefresh(true);
  };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
}
/* CHECK ALL SIZES: one measuring window, resized to every size, home and a category page; each card drawn to
   scale from what the shop really lays out, with pass / check badges */
var LB_CHECK = {res:[], busy:false};
function lb_checkCats(){ var c = DB.categories.filter(function(x){ return !x.hidden; })[0]; return c ? c.id : 'new'; }
ACT['lb-checkall'] = function(){
  var box = document.getElementById('lb-checkbox'); if(!box || LB_CHECK.busy) return;
  var sizes = LB_CFG.vpSizes.slice(), pk = lb_scPreviewKey(), pages = pk==='home' ? ['#/', '#/c/'+lb_checkCats()] : [lb_scPageHash()], jobs = [];
  sizes.forEach(function(wh){ pages.forEach(function(h){ jobs.push({w:wh[0], h:wh[1], hash:h}); }); });
  LB_CHECK = {res:[], busy:true, total:jobs.length};
  box.innerHTML = '<section class="lb-check card"><div class="lb-colhd"><span class="h3">'+esc(lbL('checkTitle'))+'</span><span class="xs muted" id="lb-chkprog">'+esc(lbL('checking', {n:0, t:jobs.length}))+'</span></div><p class="xs muted">'+esc(lbL('checkLead'))+'</p><div class="lb-chkgrid" id="lb-chkgrid"></div>'+
    '<div class="lb-frame lb-chkframe" id="lb-fr-chk"><iframe title="check" tabindex="-1"></iframe></div></section>';
  var el = document.getElementById('lb-fr-chk');
  lb_frameBoot(el, jobs[0].w, jobs[0].h, lb_frameState({hash:jobs[0].hash, sideCanvas:lb_clone(lb_scEdit()), forceCanvas:true, noPopups:true}));
  var ifr = el.querySelector('iframe'), i = 0;
  var next = function(){
    if(i >= jobs.length){ LB_CHECK.busy = false; el.remove(); var pr = document.getElementById('lb-chkprog'); if(pr) pr.textContent = ''; return; }
    var j = jobs[i], w = null; try{ w = ifr.contentWindow; }catch(e){}
    if(!w || typeof w.lb_viewReport!=='function'){ return setTimeout(next, 200); }
    ifr.style.width = j.w+'px'; ifr.style.height = j.h+'px'; lb_frameScale(el);
    if(w.location.hash !== j.hash) w.location.hash = j.hash;
    setTimeout(function(){
      var r = null; try{ r = w.lb_viewReport('rows'); }catch(e){}
      if(r){ r.size = j.w+'x'+j.h; r.hash = j.hash; LB_CHECK.res.push(r); var g = document.getElementById('lb-chkgrid'); if(g) g.insertAdjacentHTML('beforeend', lb_checkCard(r)); }
      var pr = document.getElementById('lb-chkprog'); if(pr) pr.textContent = lbL('checking', {n:i+1, t:jobs.length});
      i++; next();
    }, 500);
  };
  setTimeout(next, 600);
};
function lb_checkEval(r){
  var Z = lb_scEdit().zones, out = [];
  r.zones.filter(function(z){ return z.view; }).forEach(function(z){
    var zz = (lb_scFind(z.id) || {}).z || {}, left = z.x < r.vw / 2, G = left ? r.gL : r.gR;
    var gapToContent = left ? G - (z.x + z.w) : (z.x - (r.vw - G));
    var fits = z.x >= 0 && z.x + z.w <= r.vw && z.y >= r.hdr - 1 && z.y + z.h <= r.vh + 1 && gapToContent >= LB_CFG.safety - 1;
    var hits = r.rects.some(function(c){ return z.x < c.x + c.w && z.x + z.w > c.x && z.y < c.y + c.h && z.y + z.h > c.y; });
    var minW = lb_isFigureLike(zz) ? LB_CFG.vpMinW.figure : LB_CFG.vpMinW.text;
    var setz = lb_vpSet(zz, r.page==='category' ? 'cat' : r.page); out.push({id:z.id, fits:fits, hits:hits, small:z.w < minW, w:z.w, h:z.h, custom:!!(setz.vpSizes && setz.vpSizes[r.size])});
  });
  return out;
}
function lb_checkCard(r){
  var ev = lb_checkEval(r), ok = ev.length && ev.every(function(e){ return e.fits && !e.hits && !e.small; });
  var W = 300, sc = W / r.vw, Hh = Math.round(r.vh * sc);
  var svg = '<svg class="lb-chksvg" viewBox="0 0 '+r.vw+' '+r.vh+'" width="'+W+'" height="'+Hh+'" role="img" aria-label="'+esc(r.size)+'">'+
    '<rect x="0" y="0" width="'+r.vw+'" height="'+r.vh+'" fill="#F4F3F0"/><rect x="0" y="0" width="'+r.vw+'" height="'+r.hdr+'" fill="#fff" stroke="#ddd"/>'+
    r.rects.map(function(c){ return '<rect x="'+c.x+'" y="'+c.y+'" width="'+c.w+'" height="'+c.h+'" fill="'+(c.k==='card' ? '#d9d5ce' : '#9a948b')+'"'+(c.k==='card' ? ' rx="6"' : '')+'/>'; }).join('')+
    '<line x1="'+r.gL+'" y1="'+r.hdr+'" x2="'+r.gL+'" y2="'+r.vh+'" stroke="#1F4E46" stroke-dasharray="8 8" stroke-width="2"/><line x1="'+(r.vw - r.gR)+'" y1="'+r.hdr+'" x2="'+(r.vw - r.gR)+'" y2="'+r.vh+'" stroke="#1F4E46" stroke-dasharray="8 8" stroke-width="2"/>'+
    r.zones.map(function(z){ return '<rect x="'+z.x+'" y="'+z.y+'" width="'+z.w+'" height="'+z.h+'" fill="none" stroke="'+(z.view ? '#E00000' : '#2B6CB0')+'" stroke-width="'+Math.max(3, 2/sc)+'"/>'; }).join('')+'</svg>';
  var badges = ev.map(function(e){ return '<span class="lb-chkb '+((e.fits && !e.hits && !e.small) ? 'ok' : 'warn')+'">'+esc(lbL(e.fits ? 'cFits' : 'cNoFit'))+(e.hits ? ' · '+esc(lbL('cOverlap')) : '')+(e.small ? ' · '+esc(lbL('cSmall')) : '')+' · '+lbN(e.w)+'×'+lbN(e.h)+(e.custom ? ' · '+esc(lbL('customBadge')) : '')+'</span>'; }).join('');
  var m = r.size.split('x');
  return '<button type="button" class="lb-chkcard'+(ok?' ok':' warn')+'" data-act="lb-scw" data-v="'+esc(r.size)+'" aria-label="'+esc(r.size)+'"><span class="lb-chkh"><b>'+lbN(m[0])+' × '+lbN(m[1])+'</b> <span class="xs muted">'+esc(lb_pgName(r.page==='category' ? 'cat' : r.page))+'</span><span class="lb-chkst '+(ok?'ok':'warn')+'">'+esc(lbL(ok ? 'cPass' : 'cWarn'))+'</span></span>'+svg+'<span class="lb-chkbs">'+badges+'</span></button>';
}

/* =====================================================================
   10. OWNER APPROVAL PREVIEW  (#/preview/side-canvas)
   ===================================================================== */
function lb_apUI(){ return ui('lb-ap', {strength:'saved', look:'new'}); }
PAGES['lb-approve'] = {
  layout:'admin',
  title:function(){ return lbL('apTitle'); },
  render:function(){
    var u = lb_apUI(), S = lb_sc();
    var seg = function(act, cur, opts){ return '<div class="seg lb-seg" role="group">'+opts.map(function(o){ return '<button type="button" data-act="'+act+'" data-v="'+o[0]+'" class="'+(cur===o[0]?'on':'')+'" aria-pressed="'+(cur===o[0])+'">'+esc(o[1])+'</button>'; }).join('')+'</div>'; };
    return '<div class="lb-adm lb-apv">'+
      '<div class="lb-hd"><div><div class="eyebrow">'+esc(lbL('apEyebrow'))+'</div><h1 class="h1">'+esc(lbL('apTitle'))+'</h1>'+
      '<p class="text2 lb-lead">'+esc(lbL('apLead'))+' <b>'+esc(S.enabled ? lbL('on') : lbL('off'))+'</b>.</p></div></div>'+
      '<div class="lb-aptools"><div><span class="label">'+esc(lbL('look'))+'</span>'+seg('lb-aplook', u.look, [['new',lbL('apNew')],['old',lbL('apOld')]])+'</div>'+
        '<div><span class="label">'+esc(lbL('apBlend'))+'</span>'+seg('lb-apstr', u.strength, [['low',lbL('low')],['saved',lbL('asSaved')],['high',lbL('high')]])+'</div></div>'+
      LB_CFG.approveWidths.map(function(wh, i){ return '<figure class="lb-apfig"><figcaption><b>'+esc(lbL('apScreen', {w:wh[0]}))+'</b> '+esc(lbL(i===0 ? 'apScreen1' : 'apScreen2'))+'</figcaption><div class="lb-frame lb-apframe" id="lb-fr-ap'+i+'"><iframe title="'+wh[0]+' px"></iframe></div></figure>'; }).join('')+
      '<div class="lb-apfoot card"><div><div class="h3">'+esc(lbL('decision'))+'</div><p class="small text2">'+esc(lbL('apDecide'))+'</p></div>'+
        '<div class="row wrap" style="gap:10px"><a class="btn btn-secondary" href="#/admin/side-canvas">'+ico('edit',16)+esc(lbL('editZones'))+'</a>'+(S.enabled ? '<button type="button" class="btn btn-ghost" data-act="lb-apoff">'+esc(lbL('switchOff'))+'</button>' : '<button type="button" class="btn btn-primary" data-act="lb-apon">'+ico('check',16)+esc(lbL('approveOn'))+'</button>')+'</div></div>'+
    '</div>';
  },
  after:function(){ lb_apBoot(); }
};
function lb_apStrength(){ var u = lb_apUI(); return u.strength==='low' ? 20 : (u.strength==='high' ? 90 : null); }
function lb_apBoot(){
  var u = lb_apUI();
  LB_CFG.approveWidths.forEach(function(wh, i){
    var el = document.getElementById('lb-fr-ap'+i); if(!el) return;
    lb_frameBoot(el, wh[0], wh[1], lb_frameState({hash:'#/', sideCanvas:lb_clone(lb_scEdit()), forceCanvas:u.look==='new', strength:lb_apStrength()}));
  });
}
ACT['lb-apstr'] = function(el){ lb_apUI().strength = el.getAttribute('data-v'); [].forEach.call(document.querySelectorAll('[data-act="lb-apstr"]'), function(b){ b.classList.toggle('on', b===el); b.setAttribute('aria-pressed', b===el); });
  LB_CFG.approveWidths.forEach(function(wh, i){ var f = document.getElementById('lb-fr-ap'+i); if(f) lb_framePush(f, {strength:lb_apStrength()}); }); };
ACT['lb-aplook'] = function(el){ lb_apUI().look = el.getAttribute('data-v'); [].forEach.call(document.querySelectorAll('[data-act="lb-aplook"]'), function(b){ b.classList.toggle('on', b===el); b.setAttribute('aria-pressed', b===el); });
  LB_CFG.approveWidths.forEach(function(wh, i){ var f = document.getElementById('lb-fr-ap'+i); if(f) lb_framePush(f, {forceCanvas:lb_apUI().look==='new'}); }); };
ACT['lb-apon'] = function(){ if(!confirm(lbL('confirmOn'))) return; lb_sc().enabled = true; saveState(); rerender(); toast(lbL('turnedOn')); };
ACT['lb-apoff'] = function(){ lb_sc().enabled = false; saveState(); rerender(); toast(lbL('turnedOff')); };

/* =====================================================================
   11. LAUNCH DEFAULT + NAMED SNAPSHOTS (PR 597)
   ---------------------------------------------------------------------
   Covers: ST.layout (595), ST.sideCanvas (596), ST.blogAds + ST.blogAdSettings (592 house
   ads/popups), ST.heroBtns (home banner buttons). Restoring keeps everything added since
   as hidden, switched-off copies — nothing is ever deleted — and every restore can be undone.
   ===================================================================== */
var LB_SNAP_KEYS = ['layout', 'sideCanvas', 'blogAds', 'blogAdSettings', 'heroBtns'];
function lb_snaps(){ if(!ST.lbSnaps) ST.lbSnaps = {launch:null, named:[], log:[]}; return ST.lbSnaps; }
function lb_snapTake(){ lb_layout(); lb_sc(); var d = {}; LB_SNAP_KEYS.forEach(function(k){ d[k] = ST[k]==null ? null : lb_clone(ST[k]); }); return d; }
function lb_snapFactory(){ return {layout:lb_seedLayout(), sideCanvas:lb_seedCanvas(), blogAds:null, blogAdSettings:null, heroBtns:null}; }
function lb_snapLaunch(){ var S = lb_snaps(); return S.launch ? lb_clone(S.launch.data) : lb_snapFactory(); }
/* put a saved state back; things that exist now but not in it stay as hidden, switched-off copies */
function lb_snapApply(target, keep){
  var cur = lb_snapTake(), kept = 0, t = lb_clone(target);
  if(keep){
    var keepList = function(now, into){ var ids = {}; into.forEach(function(x){ ids[x.id] = 1; }); now.forEach(function(x){ if(x && x.id && !ids[x.id]){ var c = lb_clone(x); c.hidden = true; c.active = false; c.keptCopy = true; into.push(c); kept++; } }); };
    if(t.layout && cur.layout){
      keepList(cur.layout.home.sections, t.layout.home.sections);
      keepList(cur.layout.cat.default, t.layout.cat.default);
      t.layout.cat.byCat = t.layout.cat.byCat || {}; t.layout.cat.keptByCat = t.layout.cat.keptByCat || {};
      Object.keys(cur.layout.cat.byCat||{}).forEach(function(k){ if(t.layout.cat.byCat[k]) keepList(cur.layout.cat.byCat[k], t.layout.cat.byCat[k]); else { t.layout.cat.keptByCat[k] = cur.layout.cat.byCat[k]; kept++; } });
    }
    if(t.sideCanvas && cur.sideCanvas){ var ts = lb_scMigrate(t.sideCanvas); t.sideCanvas = ts; ['l','r'].forEach(function(s){ keepList(cur.sideCanvas.zones[s]||[], ts.zones[s]); }); }
    var curAds = Array.isArray(cur.blogAds) ? cur.blogAds : null;
    if(curAds){
      if(!Array.isArray(t.blogAds)) t.blogAds = typeof BLOG_ADS_SEED!=='undefined' ? lb_clone(BLOG_ADS_SEED) : [];
      keepList(curAds, t.blogAds);
    }
  }
  LB_SNAP_KEYS.forEach(function(k){ if(t[k]==null) delete ST[k]; else ST[k] = t[k]; });
  delete ST.scDraft;
  lb_layout(); lb_sc(); LB_LAST = null;
  return kept;
}
/* the state without the kept copies — what "identical to the launch default" is checked on */
function lb_snapStrip(d){
  d = lb_clone(d);
  var f = function(a){ return Array.isArray(a) ? a.filter(function(x){ return !(x && x.keptCopy); }) : a; };
  if(d.layout){ d.layout.home.sections = f(d.layout.home.sections); d.layout.cat.default = f(d.layout.cat.default); Object.keys(d.layout.cat.byCat||{}).forEach(function(k){ d.layout.cat.byCat[k] = f(d.layout.cat.byCat[k]); }); delete d.layout.cat.keptByCat; }
  if(d.sideCanvas && d.sideCanvas.zones){ d.sideCanvas.zones.l = f(d.sideCanvas.zones.l); d.sideCanvas.zones.r = f(d.sideCanvas.zones.r); }
  if(Array.isArray(d.blogAds)) d.blogAds = f(d.blogAds);
  return d;
}
function lb_snapLog(label){ var S = lb_snaps(); S.log.push({id:lb_id('r'), at:Date.now(), label:label, before:lb_snapTake()}); if(S.log.length > 30) S.log.splice(0, S.log.length - 30); }
function lb_snapDone(msg){ saveState(); rerender(); toast(msg); }
function lb_snapPanel(){
  var S = lb_snaps();
  var log = S.log.slice(-4).reverse().map(function(e){ return '<li><span>'+esc(dateTimeStr(e.at))+'</span><span>'+esc(e.label)+'</span></li>'; }).join('');
  return '<section class="lb-snap card" aria-label="'+esc(lbL('snapTitle'))+'"><div class="lb-colhd"><span class="h3">'+ico('layers',16)+' '+esc(lbL('snapTitle'))+' <span class="xs muted">PR 597</span></span></div>'+
    '<p class="xs muted">'+esc(lbL('snapLead'))+'</p>'+
    '<div class="lb-snaprow"><div><b>'+esc(lbL('launchDefault'))+'</b> <span class="xs muted">'+esc(S.launch ? lbL('launchSaved', {d:dateTimeStr(S.launch.at)}) : lbL('launchFactory'))+'</span></div>'+
      '<div class="row wrap" style="gap:8px"><button type="button" class="btn btn-sm btn-secondary" data-act="lb-snaplaunch">'+esc(lbL('saveLaunch'))+'</button><button type="button" class="btn btn-sm btn-primary" data-act="lb-snapback">'+esc(lbL('backLaunch'))+'</button></div></div>'+
    '<div class="lb-snaprow"><label class="sr" for="lb-snapname">'+esc(lbL('snapName'))+'</label><input class="input" id="lb-snapname" placeholder="'+esc(lbL('snapName'))+'"><button type="button" class="btn btn-sm btn-secondary" data-act="lb-snapsave">'+esc(lbL('saveSnap'))+'</button></div>'+
    (S.named.length ? '<ul class="lb-snaplist">'+S.named.map(function(n){ return '<li><span class="grow"><b>'+esc(n.name)+'</b> <span class="xs muted">'+esc(dateTimeStr(n.at))+'</span></span><button type="button" class="btn btn-sm btn-ghost" data-act="lb-snaprename" data-id="'+esc(n.id)+'">'+esc(lbL('rename'))+'</button><button type="button" class="btn btn-sm btn-secondary" data-act="lb-snaprestore" data-id="'+esc(n.id)+'">'+esc(lbL('restoreSnap'))+'</button></li>'; }).join('')+'</ul>' : '<p class="xs muted">'+esc(lbL('noSnaps'))+'</p>')+
    '<div class="lb-snaprow"><div class="xs bold">'+esc(lbL('restoreLog'))+'</div><button type="button" class="btn btn-sm btn-ghost" data-act="lb-snapundo"'+(S.log.length?'':' disabled')+'>'+esc(lbL('undoLast'))+'</button></div>'+
    (log ? '<ul class="lb-snaplog">'+log+'</ul>' : '')+'</section>';
}
ACT['lb-snaplaunch'] = function(){ if(!confirm(lbL('confirmSaveLaunch'))) return; lb_snaps().launch = {at:Date.now(), data:lb_snapStrip(lb_snapTake())}; lb_snapDone(lbL('savedLaunch')); };
ACT['lb-snapback'] = function(){ if(!confirm(lbL('confirmBack'))) return; lb_snapLog(lbL('logLaunch')); var n = lb_snapApply(lb_snapLaunch(), true); lb_snapDone(lbL('backDone', {n:n})); };
ACT['lb-snapsave'] = function(){ var i = document.getElementById('lb-snapname'), name = (i && i.value.trim()) || ('Snapshot '+(lb_snaps().named.length+1)); lb_snaps().named.push({id:lb_id('n'), name:name, at:Date.now(), data:lb_snapTake()}); lb_snapDone(lbL('snapSaved')); };
ACT['lb-snaprestore'] = function(el){ var n = lb_snaps().named.filter(function(x){ return x.id===el.getAttribute('data-id'); })[0]; if(!n || !confirm(lbL('confirmRestore', {n:n.name}))) return; lb_snapLog(lbL('logSnap')+': '+n.name); lb_snapApply(n.data, true); lb_snapDone(lbL('snapRestored')); };
ACT['lb-snaprename'] = function(el){ var n = lb_snaps().named.filter(function(x){ return x.id===el.getAttribute('data-id'); })[0]; if(!n) return; var v = prompt(lbL('newName'), n.name); if(v && v.trim()){ n.name = v.trim(); lb_snapDone(lbL('saved')); } };
ACT['lb-snapundo'] = function(){
  var S = lb_snaps(), e = S.log[S.log.length-1]; if(!e){ toast(lbL('nothingToUndo')); return; }
  var now = lb_snapTake(); lb_snapApply(e.before, false); S.log.pop(); S.log.push({id:lb_id('r'), at:Date.now(), label:lbL('logUndo')+': '+e.label, before:now, undo:true});
  lb_snapDone(lbL('undone'));
};

/* =====================================================================
   12. HOOKS INTO OTHER ADMIN PAGES (wrappers — no shared file edited)
     · Admin → Settings: the Snapshots panel above the setting groups
     · AI & agents: an "AI media library" tab (#/admin/ai?tab=media)
   ===================================================================== */
function lb_wrapAdmin(){
  var A = PAGES['admin-settings'];
  if(A && typeof A.render==='function' && !A.render._lb){
    var oa = A.render;
    var wa = function(){ var h = oa.apply(this, arguments); try{ var mark = '<div class="zs-sgrid">'; if(h.indexOf(mark)>=0) h = h.replace(mark, '<div class="lb-adm lb-inset">'+lb_snapPanel()+'</div>'+mark); }catch(e){} return h; };
    wa._lb = true; A.render = wa;
  }
  if(typeof window.za_aiTabs==='function' && !window.za_aiTabs._lb){
    var ot = window.za_aiTabs;
    var nt = function(tab){ var h = ot.apply(this, arguments); return h.replace(/<\/div>\s*$/, '<a class="chip'+(tab==='media'?' on':'')+'" role="tab" aria-selected="'+(tab==='media')+'" href="#/admin/ai?tab=media">'+ico('spark',13)+' '+esc(lbL('mediaLib'))+'</a></div>'); };
    nt._lb = true; window.za_aiTabs = nt;
  }
  if(typeof window.za_aiTab==='function' && !window.za_aiTab._lb){
    var oi = window.za_aiTab;
    var ni = function(tab){ if(tab==='media') return '<div class="lb-adm lb-inset" id="lb-libbox-ai">'+lb_libHTML('ai')+'</div>'; return oi.apply(this, arguments); };
    ni._lb = true; window.za_aiTab = ni;
  }
}
