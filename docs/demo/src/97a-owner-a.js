/* =====================================================================
   97a-owner-a.js — OWNER FIX A (Note 51, 20 Oct): home, header, mega menu,
   footer. Small after-render helpers and the Site builder › Home tab.
   Desktop-only behaviour checks deskOn(); the phone never runs it.
   Styles: r12-zz-ownerA.css.
   ===================================================================== */

/* ---------- after every render ---------- */
(function(){
  var app = document.getElementById('app'); if(!app || !window.MutationObserver) return;
  new MutationObserver(function(){ try{ ownerAAfter(); }catch(e){ console.error(e); } }).observe(app, {childList:true});
  window.addEventListener('resize', function(){ if(typeof deskOn==='function' && deskOn()) requestAnimationFrame(hmDiyFit); else if(typeof hmDiyFitPhone==='function') requestAnimationFrame(hmDiyFitPhone); });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ try{ hmDiyFit(); if(typeof hmDiyFitPhone==='function') hmDiyFitPhone(); }catch(e){} });
})();
function ownerAAfter(){
  /* H9 · "Row edge fade" (Site builder › Home): off = the earlier plain box edges, on every page's glide rows */
  var fadeOff = typeof homeData==='function' && homeData().rowFade === false;
  document.documentElement.classList.toggle('hm-nofade', fadeOff);
  if(typeof deskOn==='function' && deskOn()) requestAnimationFrame(hmDiyFit);
  else if(typeof hmDiyFitPhone==='function') requestAnimationFrame(hmDiyFitPhone);   /* phone audit V12b (R1) */
}
/* H7 · the tall "Build your own set" tile is as high as the two rows of sets.
   AUTO ADJUST: every offer that fits is shown whole; the rest are counted in
   one line ("+ 3 more set offers") — an offer is never cut in half. */
function hmDiyFit(){
  var box = document.querySelector('.hm-sets-tall .hm-diy-rules'); if(!box) return;
  var rls = [].slice.call(box.querySelectorAll('.rl')), more = box.querySelector('.hm-diy-more');
  rls.forEach(function(r){ r.hidden = false; }); if(more) more.hidden = true;
  var over = function(){ return box.scrollHeight > box.clientHeight + 1; };
  var hid = 0;
  for(var k = rls.length - 1; k > 0 && over(); k--){
    rls[k].hidden = true; hid++;
    if(more){ more.hidden = false; more.textContent = '+ '+hid+' '+(hid === 1 ? t('more set offer') : t('more set offers')); }
  }
}

/* =====================================================================
   H5 · TEN TEXT-LOGO STYLES (Site builder › Header › Logo › "Logo style").
   The words are always the owner's logo text (never typed here); each style
   is CSS (r12-zz-ownerA.css, .lgs-1 … .lgs-10). 0 = the wordmark as it was.
   Used on the desktop header and the desktop footer only.
   ===================================================================== */
var LOGO_STYLES = [
  ['Current wordmark', 'এখনকার লোগো'],
  ['Wide and bold, with a bar', 'চওড়া আর মোটা, নিচে দাগ'],
  ['In a box', 'বক্সের ভেতরে'],
  ['Solid block', 'ভরাট ব্লক'],
  ['Classic serif', 'ক্লাসিক সেরিফ'],
  ['Heavy and light', 'মোটা আর হালকা'],
  ['Between two lines', 'দুই দাগের মাঝে'],
  ['Sport slant', 'স্পোর্ট বাঁকা'],
  ['Round badge and name', 'গোল ব্যাজ আর নাম'],
  ['Coloured middle letter', 'মাঝের অক্ষর রঙিন'],
  ['Outline letters', 'শুধু রেখার অক্ষর']
];
function logoStyled(text, n){
  n = Math.max(1, Math.min(10, n|0)); text = String(text || '');
  var chars = Array.from(text), half = Math.ceil(chars.length / 2), mid = Math.floor((chars.length - 1) / 2);
  var xi = chars.findIndex(function(c){ return /x/i.test(c); }); if(xi < 0) xi = mid;
  var inner;
  if(n === 5) inner = '<b>'+esc(chars.slice(0, Math.min(2, half)).join(''))+'</b><i>'+esc(chars.slice(Math.min(2, half)).join(''))+'</i>';
  else if(n === 8) inner = '<span class="lgs-badge" aria-hidden="true">'+esc(chars[0] || '')+'</span><span class="lgs-word">'+esc(text)+'</span>';
  else if(n === 9) inner = esc(chars.slice(0, xi).join(''))+'<em>'+esc(chars[xi] || '')+'</em>'+esc(chars.slice(xi + 1).join(''));
  else inner = esc(text);
  /* the whole word stays readable to a screen reader even when it is split into parts */
  return '<span class="lgs lgs-'+n+'"'+((n === 5 || n === 8 || n === 9) ? ' aria-label="'+esc(text)+'" role="img"' : '')+'>'+inner+'</span>';
}

/* =====================================================================
   SITE BUILDER (96d-site-builder.js) · the owner's new switches.
     · a new tab "Home page" (area 'home'): hero, sets band, size finder,
       row fade, journal — homeDefault() in 20-home.js
     · Menus: "Desktop menu arrangement" (H4) and "Desktop menu style" (H6)
     · Header: "Logo style" 0–10 with a live strip of all eleven (H5)
     · Footer: "Desktop footer design" + desktop names / place / highlight (H13)
   Same draft → preview → publish → undo as every other part.
   ===================================================================== */
(function(){
  if(typeof SB_AREAS === 'undefined' || typeof SB_ED === 'undefined') return;
  if(SB_AREAS.indexOf('home') < 0) SB_AREAS.push('home');
  if(!SB_TABS.some(function(t){ return t[0]==='home'; })) SB_TABS.splice(3, 0, ['home', ['Home page','হোম পেজ'], 'home']);
  var def0 = sbDefault; sbDefault = function(area){ return area === 'home' ? homeDefault() : def0(area); };
  SB_HOWTO.home = [['Change the words of the home sections; leave a Bengali box empty to show the English text.','হোম পেজের সেকশনের লেখা বদলান; বাংলার ঘর খালি রাখলে ইংরেজি লেখাই দেখাবে।'],
    ['Switches change the look on a desktop only, unless the note says phone too.','সুইচগুলো শুধু ডেস্কটপের চেহারা বদলায়, যদি না পাশে ফোনের কথা লেখা থাকে।'],
    ['Preview, then Publish.','প্রিভিউ দেখে প্রকাশ করুন।']];
  SB_STATUS.splice(8, 0, [['Home page words and switches','হোম পেজের লেখা আর সুইচ'], ['Hero lines, sets band, size finder, row edge fade, journal posts','হিরোর লাইন, সেটের অংশ, সাইজ ফাইন্ডার, সারির কিনারায় ফেড, জার্নালের লেখা'], '#/admin/site?tab=home']);
  SB_ED.home = sbHomeEd;
  var menus0 = SB_ED.menus; SB_ED.menus = function(){ return sbMenuArrangeCard() + menus0(); };
  var header0 = SB_ED.header; SB_ED.header = function(){ return sbLogoStyleCard() + header0(); };
  var footer0 = SB_ED.footer; SB_ED.footer = function(){ return sbFooterDeskCard() + footer0(); };
})();
/* a text with its Bengali box beside it */
function sbPairIn(path, label, help, o){ return '<div class="sb-grid2">'+sbIn(path, label, help, o)+sbIn(path+'Bn', [label[0]+' (Bengali)', label[1]+' (বাংলা)'], ['Empty = the English words.','খালি = ইংরেজি লেখা।'])+'</div>'; }
function sbHomeEd(){
  var H = 'home', tl = sbL('home/hero/trust');
  var hero = sbCard(['Hero (top of the home page)','হিরো (হোম পেজের উপরের অংশ)'],
    sbIn(H+'/hero/shift', ['Desktop: how far the coloured board reaches right of the text (px, 0–200)','ডেস্কটপ: লেখার ডানে রঙিন বোর্ড কতটা বাড়বে (px, ০–২০০)'], ['0 = as before. The text never moves; the slides start further right and keep their size.','০ = আগের মতো। লেখা নড়ে না; স্লাইড আরও ডানে শুরু হয়, মাপ একই থাকে।'], {type:'number', num:1, min:0, max:200, step:1})+
    '<div class="sb-list" data-sb-list="home/hero/trust">'+tl.map(function(x, i){ if(x.removed) return ''; var p = 'home/hero/trust/#'+x.id;
      return sbRow('<div class="sb-grid3">'+sbIn(p+'/text', ['Line under the buttons (phone and desktop)','বাটনের নিচের লাইন (ফোন আর ডেস্কটপ)'], ['{windowHours} = the exchange hours from Smart Rules.','{windowHours} = স্মার্ট রুলসের এক্সচেঞ্জের ঘণ্টা।'])+
        sbIn(p+'/desk', ['Longer words for desktop (optional)','ডেস্কটপের জন্য একটু লম্বা লেখা (ইচ্ছা হলে)'])+sbIn(p+'/bn', ['Bengali','বাংলা'])+'</div>'+
        '<div class="sb-sws">'+sbIconSel(p+'/icon', ['Icon','আইকন'])+sbSw(p+'/on', ['Shown','দেখাবে'])+'</div>', {key:x.id, mv:sbMv('home/hero/trust', i, tl.length)}); }).join('')+'</div>',
    {icon:'star', lead:['On a desktop each line sits under its own button.','ডেস্কটপে প্রতিটা লাইন নিজের বাটনের নিচে বসে।']});
  var S = H+'/sets';
  var sets = sbCard(['Sets band ("Buy together, save more")','সেটের অংশ ("একসাথে কিনুন, বেশি বাঁচান")'],
    sbPairIn(S+'/eyebrow', ['Small line on top','উপরের ছোট লাইন'])+sbPairIn(S+'/title', ['Title','শিরোনাম'])+sbPairIn(S+'/sub', ['Text beside the title','শিরোনামের পাশের লেখা'])+
    sbPairIn(S+'/diyTitle', ['Build card: title','নিজের সেট কার্ড: শিরোনাম'])+sbPairIn(S+'/diyText', ['Build card: text','নিজের সেট কার্ড: লেখা'])+sbPairIn(S+'/diyBtn', ['Build card: button','নিজের সেট কার্ড: বাটন'])+sbPairIn(S+'/more', ['Link under the sets (desktop)','সেটের নিচের লিংক (ডেস্কটপ)'])+
    '<div class="sb-grid2">'+sbSel(S+'/deskLayout', ['Desktop layout','ডেস্কটপের সাজ'], [['tall', ['3 + 3 sets, Build card tall on the right','৩ + ৩ সেট, ডানে লম্বা নিজের সেট কার্ড']], ['grid', ['Rows of 4 (earlier style)','৪টা করে সারি (আগের ধরন)']]])+'</div>'+
    '<div class="sb-sws">'+sbSw(S+'/tierHi', ['Desktop: set prices in the sale colour, bold','ডেস্কটপ: সেটের দাম সেল রঙে, মোটা'])+'</div>', {icon:'layers'});
  var F = H+'/finder';
  var finder = sbCard(['Size finder strip','সাইজ ফাইন্ডারের অংশ'],
    sbPairIn(F+'/title', ['Title','শিরোনাম'])+sbPairIn(F+'/text', ['Text','লেখা'])+sbPairIn(F+'/btn', ['Button','বাটন'])+sbPairIn(F+'/btnSaved', ['Button when a size is saved','সাইজ সেভ থাকলে বাটন'])+
    '<p class="xs muted">'+sbE(['The window it opens shows one tile for every category that has a size chart — a new category with a chart gets its tile by itself.','এটা যে উইন্ডো খোলে, সেখানে সাইজ চার্ট আছে এমন প্রতিটা ক্যাটাগরির একটা টাইল থাকে — চার্টসহ নতুন ক্যাটাগরি বানালে টাইল নিজেই আসে।'])+' <a href="#/admin/size-charts">'+sbE(['Size charts','সাইজ চার্ট'])+'</a></p>', {icon:'ruler'});
  var rows = sbCard(['Rows and journal','সারি আর জার্নাল'],
    '<div class="sb-sws">'+sbSw(H+'/rowFade', ['Row edge fade (sliding rows fade at both edges; off = the earlier plain box edges, phone and desktop)','সারির কিনারায় ফেড (চলন্ত সারির দুই কিনারা মিলিয়ে যায়; বন্ধ = আগের সোজা বক্স কিনারা, ফোন আর ডেস্কটপ)'])+'</div>'+
    sbIn(H+'/journal/deskCount', ['Desktop: newest journal posts shown, fixed (1–8)','ডেস্কটপ: জার্নালের নতুন কয়টা লেখা দেখাবে, স্থির (১–৮)'], ['A new post takes the first place; the oldest of them drops out. Posts come from the Blog.','নতুন লেখা প্রথমে বসে; সবচেয়ে পুরনোটা সরে যায়। লেখা আসে ব্লগ থেকে।'], {type:'number', num:1, min:1, max:8, step:1}),
    {icon:'grid'});
  return hero+sets+finder+rows;
}
var SB_NAV_LAYOUTS = [['all', ['Every category in the row (as now)','সারিতে সব ক্যাটাগরি (এখনকার মতো)']], ['catsMore', ['Main categories + "More"','প্রধান ক্যাটাগরি + "More"']], ['shop', ['One "Shop" menu + New in · Combos · Sets · Sale','একটা "Shop" মেনু + New in · Combos · Sets · Sale']], ['priority', ['Roomy row, what does not fit goes into "More"','খোলামেলা সারি, যা ধরে না তা "More"-তে']]];
function sbMenuArrangeCard(){
  var m = sbCur('menus'), L = m.deskLayout || 'all';
  return sbCard(['Desktop menu arrangement and style','ডেস্কটপ মেনুর সাজ আর ধরন'],
    '<div class="sb-grid2">'+sbSel('menus/deskLayout', ['Desktop menu arrangement','ডেস্কটপ মেনুর সাজ'], SB_NAV_LAYOUTS, ['How many words sit in the header row. Phones are not affected.','হেডারের সারিতে কয়টা শব্দ থাকবে। ফোনে কিছু বদলায় না।'])+
      sbSel('menus/megaStyle', ['Desktop menu style','ডেস্কটপ মেনুর ধরন'], [['drop', ['Small list under the item, side lists for sub-categories','আইটেমের নিচে ছোট তালিকা, সাব-ক্যাটাগরি পাশে']], ['panel', ['Full-width panel (earlier style)','পুরো চওড়া প্যানেল (আগের ধরন)']]])+'</div>'+
    (L === 'catsMore' ? sbIn('menus/deskMain', ['How many categories stay in the row','সারিতে কয়টা ক্যাটাগরি থাকবে'], ['The rest go under "More", in the menu order.','বাকিগুলো মেনুর ক্রমে "More"-এর নিচে যায়।'], {type:'number', num:1, min:1, max:12, step:1}) : '')+
    (L === 'shop' ? '<div class="sb-grid2">'+sbIn('menus/shopLabel', ['Name of the "Shop" menu','"Shop" মেনুর নাম'])+sbIn('menus/shopBn', ['Bengali','বাংলা'])+sbIn('menus/saleLabel', ['Name of the sale link (empty = no sale link)','সেল লিংকের নাম (খালি = সেল লিংক নেই)'])+sbIn('menus/saleBn', ['Bengali','বাংলা'])+'</div>' : ''),
    {icon:'menu', lead:['Journal is off in the desktop row by default (it is highlighted in the footer); switch "Desktop row" on below to bring it back.','জার্নাল ডিফল্টে ডেস্কটপ সারিতে বন্ধ (ফুটারে হাইলাইট করা আছে); নিচে "ডেস্কটপ সারি" চালু করলে ফিরবে।']});
}
function sbLogoStyleCard(){
  var h = sbCur('header'), lg = h.logo || {}, txt = lg.text || 'EXTAS', cur = +lg.style || 0;
  var strip = LOGO_STYLES.map(function(n, i){
    return '<div class="sb-lgs'+(i === cur ? ' on' : '')+'"><span class="sb-lgs-n">'+i+'</span><span class="sb-lgs-l logo">'+(i ? logoStyled(txt, i) : esc(txt))+'</span><span class="xs muted">'+sbE(n)+'</span></div>';
  }).join('');
  return sbCard(['Logo style','লোগোর ধরন'],
    '<div class="sb-grid2">'+sbSel('header/logo/style', ['Logo style','লোগোর ধরন'], LOGO_STYLES.map(function(n, i){ return [String(i), [i+' · '+n[0], i+' · '+n[1]]]; }), ['Desktop header and desktop footer. The phone keeps its logo. An uploaded logo picture always wins.','ডেস্কটপ হেডার আর ডেস্কটপ ফুটারে। ফোনের লোগো বদলায় না। লোগোর ছবি আপলোড করা থাকলে সেটাই দেখাবে।'])+'</div>'+
    '<div class="sb-lgs-grid">'+strip+'</div>', {icon:'star', lead:['Eleven ways to draw your logo text. Pick a number, preview, then Publish.','আপনার লোগোর লেখা আঁকার এগারোটা ধরন। নম্বর বাছুন, প্রিভিউ দেখুন, তারপর প্রকাশ করুন।']});
}
function sbFooterDeskCard(){
  var d = sbCur('footer'), cols = sbL('footer/cols');
  var rows = cols.map(function(c){
    if(c.removed || c.on === false || c.dev === 'phone') return '';
    var links = (c.links||[]).map(function(l){
      if(l.removed || l.on === false || l.dev === 'phone') return '';
      var lp = 'footer/cols/#'+c.id+'/links/#'+l.id;
      return '<div class="sb-fdrow"><b class="small sb-fdname">'+esc(sbFtrLinkName(l))+'</b>'+
        sbIn(lp+'/dlabel', ['Desktop name (optional)','ডেস্কটপের নাম (ইচ্ছা হলে)'], null, {ph:sbFtrLinkName(l)})+
        sbIn(lp+'/dpos', ['Place on desktop (number, optional)','ডেস্কটপে জায়গা (নম্বর, ইচ্ছা হলে)'], ['Links are ordered by this number; empty = the order of the list. 0.5 puts a link between the first and the second.','এই নম্বর দিয়ে লিংক সাজে; খালি = তালিকার ক্রম। ০.৫ দিলে প্রথম আর দ্বিতীয়টার মাঝে বসে।'], {type:'number', num:1, step:0.5})+
        sbSw(lp+'/hl', ['Highlight on desktop','ডেস্কটপে হাইলাইট'], {invert:true})+'</div>';
    }).join('');
    return '<div class="sb-sub"><b>'+esc(c.label || c.id)+'</b>'+links+'</div>';
  }).join('');
  return sbCard(['Desktop footer','ডেস্কটপ ফুটার'],
    '<div class="sb-grid2">'+sbSel('footer/deskStyle', ['Desktop footer design','ডেস্কটপ ফুটারের ডিজাইন'], [['ref', ['Owner\'s reference: brand and join · 3 link columns · contact, social, payment','মালিকের নমুনা: ব্র্যান্ড আর জয়েন · ৩টা লিংক কলাম · যোগাযোগ, সোশ্যাল, পেমেন্ট']], ['classic', ['Earlier desktop footer','আগের ডেস্কটপ ফুটার']]])+
      sbIn('footer/contact/waDesk', ['Desktop WhatsApp button words','ডেস্কটপের WhatsApp বাটনের লেখা'], ['The phone keeps the words in "Contact block" below.','ফোনে নিচের "যোগাযোগের অংশ"-এর লেখাই থাকে।'])+'</div>'+
    '<p class="xs muted">'+sbE(['Links set to "Phone only" below are not listed here. A social network without an address shows its name without a link until you add the address in Settings.','নিচে "শুধু ফোন" দেওয়া লিংক এখানে নেই। ঠিকানা ছাড়া সোশ্যাল নেটওয়ার্কের নাম লিংক ছাড়া দেখায়, সেটিংসে ঠিকানা দিলে লিংক হয়।'])+'</p>'+rows,
    {icon:'layers', lead:['The phone footer is not changed by anything in this box.','এই বক্সের কিছুই ফোনের ফুটার বদলায় না।']});
}
