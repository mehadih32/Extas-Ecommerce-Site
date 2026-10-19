/* ================= EXTAS demo — layout shells ================= */
var NAV = [['New in','#/c/new'],['Polos','#/c/polos'],['T-Shirts','#/c/tshirts'],['Shirts','#/c/shirts'],['Panjabi','#/c/panjabi'],['Trousers','#/c/trousers'],['Hoodies','#/c/hoodies'],['Sets','#/set']];

function announceText(){
  if(ST.festive) return esc(ruleText('festive','short'));
  return esc(announceFill(t('announce')));
}
function storeHeader(cur){
  var n = bagCount(), acc = currentAccount();
  /* R15 wave 1 (H10): the desktop nav also marks the section a product, set
     or combo page belongs to (its category; Sets for combos and the builder) */
  var sec = cur.path;
  if(cur.page==='product' && cur.params && typeof P==='function'){ var pp = P(cur.params[0]); if(pp) sec = '/c/'+pp.cat; }
  else if(cur.page==='combo' || cur.page==='set' || /^ca-/.test(cur.page||'')) sec = '/set';
  var nav = NAV.map(function(x){ var here = sec===x[1].slice(1); return '<a class="'+(here?'on':'')+'" href="'+x[1]+'"'+(here?' aria-current="page"':'')+'>'+esc(t(x[0]))+'</a>'; }).join('');
  return '<div class="announce">'+announceText()+'</div>'+
  '<header class="hdr"><div class="container hdr-in">'+
    '<div class="row" style="gap:2px">'+
      '<button class="iconbtn hide-d" data-act="open-menu" aria-label="Menu">'+ico('menu',22)+'</button>'+
      '<a class="logo hide-m" href="#/">EXTAS</a>'+
    '</div>'+
    '<a class="logo hide-d" href="#/">EXTAS</a>'+
    '<nav class="nav-d" aria-label="Main">'+nav+'</nav>'+
    '<div class="row hdr-r" style="gap:2px">'+hdrWa(cur)+
      '<button class="iconbtn" data-act="open-search" aria-label="Search">'+ico('search',21)+'</button>'+
      /* R15 · 3.4. The heart joins the phone header when there is room for it
         (HDR_WISH_PHONE; hdrFit() hides it on a phone too narrow to keep the
         logo clear). No account yet → the wishlist page shows what is saved on
         this phone and asks them to log in. */
      '<a class="iconbtn hdr-wish'+(HDR_WISH_PHONE?'':' hide-m')+'" href="#/account/wishlist" aria-label="Wishlist'+(ST.wishlist&&ST.wishlist.length?', '+ST.wishlist.length+' saved':'')+'">'+ico('heart',22)+(ST.wishlist&&ST.wishlist.length?'<span class="hdr-wish-dot" aria-hidden="true"></span>':'')+'</a>'+
      '<a class="iconbtn hide-m" href="'+(acc?'#/account':'#/login')+'" aria-label="Account">'+ico('user',21)+'</a>'+
      /* R15 · 3.5. The bag: a size up, a firmer line, and while it holds
         something its count glows in the brand colour every few seconds. */
      '<a class="iconbtn hdr-bag'+(n?' has':'')+'" href="#/bag" aria-label="Bag, '+n+' items">'+ico('bag',25,'stroke-width="1.9"')+(n?'<span class="count-dot">'+n+'</span>':'')+'</a>'+
    '</div>'+
  '</div></header>';
}

/* =====================================================================
   R15 · 2.4. WHATSAPP IN THE HEADER.
   The owner moved the product page's WhatsApp icon up into the header, first
   in the search / bag group (the bag keeps the corner every shopper reaches
   for). It is EXACTLY the product page's icon — waGlyph() in its pale-green
   disc — never another mark. Hover: it grows a little and a short line drops
   down under it. Press: it grows. Click / tap: WhatsApp opens, with the
   product named in the message when it is pressed on a product page.
   HDR_WA_PAGES decides which pages show it (a dashboard tick list later);
   the line under it is HDR_WA_TIP. Both are plain settings, nothing fixed.
   ===================================================================== */
/* R15 · 3.1. Every page now ('*'), except a page whose own header or the
   space right under it already carries WhatsApp — checkout, where the
   in-page "Need help?" button does that job until it scrolls away (3.2). */
var HDR_WA_PAGES = { '*':true };
var HDR_WA_TIP = 'Need help? Chat with us';
var HDR_WISH_PHONE = true;
function hdrWa(cur, mode){
  if(!SHOW('header','whatsapp')) return '';
  var page = (cur && cur.page) || '';
  var on = HDR_WA_PAGES.hasOwnProperty(page) ? HDR_WA_PAGES[page] : HDR_WA_PAGES['*'];
  if(!on && mode !== 'auto') return '';
  var msg = 'Hi EXTAS, I have a question';
  if(page === 'product' && cur.params && cur.params[0] && typeof P === 'function'){
    var p = P(cur.params[0]); if(p) msg = 'Hi EXTAS, I have a question about '+p.name+(typeof pdp_sku==='function' ? ' ('+pdp_sku(p)+')' : '');
  }
  return '<a class="hdr-wa'+(mode==='auto'?' hdr-wa-auto':'')+'" href="'+waLink(msg)+'" target="_blank" rel="noopener" aria-label="'+esc(HDR_WA_TIP)+' on WhatsApp" data-testid="hdr-wa">'+
    '<span class="hdr-wa-disc">'+waGlyph(22)+'</span><span class="hdr-wa-tip" role="tooltip">'+esc(HDR_WA_TIP)+'</span></a>';
}

/* 12. Garment icons for the footer category links. These are drawn from the
   same shapes as garmentSVG() but at icon scale, and they are picked by the
   category's own `garment` field — so a new row in DB.categories gets the
   right icon with no edit here. Kept local so 02-core.js stays untouched. */
var CAT_ICON_PATHS = {
  /* polo — open collar flaps and a short 2-button placket */
  polo:'<path d="M8.6 3.4 5 5.1 3.3 9.2 6 10.1V20.6h12V10.1l2.7-.9L19 5.1l-3.6-1.7"/><path d="M8.6 3.4 12 7.4l3.4-4"/><path d="M12 7.4v4"/><circle cx="12" cy="8.9" r=".55" fill="currentColor" stroke="none"/><circle cx="12" cy="10.7" r=".55" fill="currentColor" stroke="none"/>',
  /* tee — plain round neck, nothing else */
  tee:'<path d="M8.6 3.4 5 5.1 3.3 9.2 6 10.1V20.6h12V10.1l2.7-.9L19 5.1l-3.6-1.7"/><path d="M8.6 3.4c1 2 2.1 3 3.4 3s2.4-1 3.4-3"/>',
  /* shirt — pointed collar and a full button line */
  shirt:'<path d="M9 3.3 5.1 5 3.3 12.3l2.4.7.5 7.6h11.6l.5-7.6 2.4-.7L18.9 5l-3.9-1.7"/><path d="M9 3.3 12 6.6l3-3.3"/><path d="M12 6.6v14"/>',
  /* panjabi — mandarin collar band and a long body */
  panjabi:'<path d="M9.3 3.2 5.7 4.8 4 11.4l2.2.6.4 9.8h10.8l.4-9.8 2.2-.6-1.7-6.6-3.6-1.6"/><path d="M10.1 3.3h3.8"/><path d="M12 4.6v6"/><circle cx="12" cy="6.3" r=".55" fill="currentColor" stroke="none"/><circle cx="12" cy="8.6" r=".55" fill="currentColor" stroke="none"/>',
  trouser:'<path d="M6.6 3.4h10.8l.9 17.2h-4.2L12 8.7l-2.1 11.9H5.7Z"/><path d="M6.6 6.2h10.8"/>',
  hoodie:'<path d="M8.7 4.4 5 6.1 3.4 12.8l2.4.6.5 7.2h11.4l.5-7.2 2.4-.6L19 6.1l-3.7-1.7"/><path d="M8.7 4.4c1.3-2 2.4-2.9 3.3-2.9s2 .9 3.3 2.9l-.8 2.7c-1.7.9-3.3.9-5 0Z"/><path d="M7.9 14.9h8.2"/>',
  socks:'<path d="M9 3.4h5v9.2c0 3.1-1.3 4.8-3.9 5.3-2.4.5-3.8-.3-4.1-2.3-.2-1.5.8-2.6 3-3.3Z"/><path d="M9 6.2h5"/>',
  belt:'<rect x="3" y="9.4" width="18" height="5.2" rx="1.2"/><rect x="5.2" y="8" width="5.4" height="8" rx="1.2"/><path d="M13.5 12h4.2"/>'
};
function catIcon(garment, size){
  size = size || 15;
  var p = CAT_ICON_PATHS[garment];
  if(!p) return ico('grid', size); /* unknown garment still gets a sane icon */
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
}

/* 14 + r12.10. Payment marks drawn by hand — no logo files, no network.
   The white slabs are gone: each mark now sits on a transparent tile tinted
   from the band's own colours, and the same light sweep that crosses the
   header mark and the primary buttons passes across the row (see r12-home.css).
   The grid is still 5 equal columns, so the row fills the width exactly. */
function ftrPayMarks(){
  /* Each tile carries its own class so r12-home.css can tint the glass behind
     it from that brand's colour and lift the mark to a shade that survives a
     dark band. Brand hexes stay inside the SVG; everything tuneable is CSS. */
  var wrap = function(cls, svg){ return '<span class="ftr-pay-t '+cls+'">'+svg+'</span>'; };
  var head = '<svg viewBox="0 0 64 22" preserveAspectRatio="xMidYMid meet" role="img" ';
  var h = '';
  /* bKash, Nagad and Visa are wordmarks, so they take the tile's colour and the
     tile is the thing that is tuned per theme. */
  h += wrap('pm-bkash', head+'aria-label="bKash"><text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="14" font-weight="800" fill="currentColor">bKash</text></svg>');
  h += wrap('pm-nagad', head+'aria-label="Nagad"><defs><linearGradient id="extas-ngd" x1="0" y1="0" x2="1" y2="0">'+
    '<stop offset="0" stop-color="#FFA33C"/><stop offset="1" stop-color="#FF5A4E"/></linearGradient></defs>'+
    '<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="14" font-weight="800" fill="url(#extas-ngd)">Nagad</text></svg>');
  h += wrap('pm-visa', head+'aria-label="Visa"><text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="15" font-weight="800" font-style="italic" letter-spacing="0.6" fill="currentColor">VISA</text></svg>');
  /* the two circles are the Mastercard mark itself, so they keep their hexes */
  h += wrap('pm-mc', head+'aria-label="Mastercard"><circle cx="24" cy="11" r="10.4" fill="#EB001B"/><circle cx="40" cy="11" r="10.4" fill="#F79E1B"/>'+
    '<path d="M32 4.3A10.4 10.4 0 0 1 32 17.7 10.4 10.4 0 0 1 32 4.3Z" fill="#FF5F00"/></svg>');
  /* COD is ours, not a brand, so it takes the band's own ink */
  h += wrap('pm-cod', head+'aria-label="Cash on Delivery"><rect x="3.5" y="5.5" width="19" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>'+
    '<circle cx="13" cy="11" r="2.8" fill="currentColor"/>'+
    '<text x="44" y="16" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="13" font-weight="800" fill="currentColor">COD</text></svg>');
  return '<div class="ftr-pay" aria-label="Payment methods we accept">'+h+'<i class="ftr-pay-sheen" aria-hidden="true"></i></div>';
}

/* r12.9. The Shop column is no longer "every category we have" — it is six
   links the owner picks, so all three footer columns stand the same height.
   THIS BECOMES A DASHBOARD SETTING: the owner reorders / swaps these six in
   Settings › Footer. An entry is either a category id (the label and the
   garment icon are read from DB.categories, so a renamed or re-iconed category
   follows automatically) or an explicit [href, label, icon] for a link that is
   not a category. */
var FOOTER_SHOP = [
  ['#/c/new','New in','spark'],
  'polos',
  'tshirts',
  'shirts',
  'panjabi',
  ['#/set','Sets','layers']
];
function ftrShopLinks(){
  return FOOTER_SHOP.map(function(x){
    if(typeof x !== 'string') return ftrLink(x[0], x[1], x[2]);
    var c = CAT(x); if(!c) return '';           /* a deleted category just drops out */
    /* the icon comes from the category's own `garment` field via catIcon() */
    return '<a href="#/c/'+c.id+'"><span class="ftr-ic">'+catIcon(c.garment,15)+'</span><span>'+esc(t(c.name))+'</span></a>';
  }).join('');
}
function storeFooter(){
  /* 9–13. The footer is built as five bands, each with its own colour mixed
     from the theme tokens, so it reads as one scheme instead of a black slab.
     Each band is its own full-width row (the colour reaches the screen edge)
     with a normal .container inside it. */
  var shop = ftrShopLinks();

  return '<footer class="ftr">'+
    /* 9. promise strip — its own tone */
    '<div class="ftr-s ftr-s1"><div class="container" style="padding:0"><div class="ftr-promise">'+
      '<div>'+ico('swap',20)+'<span>Size exchange<br class="hide-d"> in '+esc(SET('exchange','windowHours'))+' hours</span></div>'+
      '<div>'+ico('cash',20)+'<span>Cash on<br class="hide-d"> Delivery</span></div>'+
      '<div>'+ico('lock',20)+'<span>Secure<br class="hide-d"> payment</span></div>'+
      '<div>'+ico('shield',20)+'<span>100%<br class="hide-d"> original</span></div>'+
    '</div></div></div>'+
    /* 10. brand block — second tone, down to the border above the columns */
    '<div class="ftr-s ftr-s2"><div class="container"><div class="ftr-brand">'+
      '<div class="ftr-brand-top"><div class="logo">EXTAS</div><div class="xs ftr-brand-sub">Menswear · Made in Bangladesh</div></div>'+
      '<form data-submit="join" class="ftr-join"><label class="label" for="join">Get new drops first</label>'+
      /* H8. A phone field must raise the number pad, not the letter keyboard.
         type=tel also lets the browser offer the saved number. */
      '<div class="row ftr-joinrow" style="gap:8px"><input id="join" class="input" type="tel" inputmode="numeric" autocomplete="tel" pattern="[0-9+\\- ]*" placeholder="Your phone number" aria-label="Your phone number"><button class="btn ftr-joinbtn">Join'+ico('right',17)+'</button></div>'+
      '<div class="xs mt8 ftr-brand-note">Offers and new arrivals by SMS and WhatsApp. Stop anytime.</div></form>'+
    '</div></div></div>'+
    /* 11. link columns stay on the base footer colour — 4. every link carries
       its icon, and the Shop column is the owner's six (FOOTER_SHOP), each
       category icon still derived from its `garment` field. */
    '<div class="ftr-s ftr-s3"><div class="container"><div class="ftr-cols">'+
      '<div><span class="ftr-h">Shop</span>'+shop+'</div>'+
      /* r12.9. Six links in each column, so Shop / Help / EXTAS end level and
         there is no dead space under the two short ones. Every href is a route
         that exists today. */
      '<div><span class="ftr-h">Help</span>'+ftrLink('#/account/orders','Track my order','truck')+ftrLink('#/size-guide','Size guide','ruler').replace('<a href="#/size-guide"','<a href="#/size-guide" data-act="size-guide"')+
        ftrLink('#/page/delivery','Delivery','box')+ftrLink('#/page/exchange','Exchange & returns','swap')+
        ftrLink('#/page/payment','Ways to pay','cash')+ftrLink('#/page/faq','FAQ','info')+'</div>'+
      '<div><span class="ftr-h">EXTAS</span>'+ftrLink('#/page/story','Our story','doc')+ftrLink('#/page/contact','Contact','phone')+
        ftrLink('#/page/careers','Careers','user')+ftrJournalLink()+
        ftrLink('#/page/privacy','Privacy','lock')+ftrLink('#/page/terms','Terms','doc')+'</div>'+
    '</div></div></div>'+
    /* 13. WhatsApp / hotline / hours / social / payment — fourth tone */
    '<div class="ftr-s ftr-s4"><div class="container"><div class="ftr-contact">'+
      '<div class="ftr-reach">'+
        '<a class="btn btn-block ftr-wa" href="'+waLink('Hi EXTAS')+'" target="_blank" rel="noopener">'+waGlyph(22)+'<span>Text us on WhatsApp</span></a>'+
        /* C3. the number itself comes from the one place it is set — see
           waNumber() / hotlineNumber() in 02-core.js */
        '<a class="btn btn-block ftr-hot" href="'+telLink()+'">'+ico('phone',19)+'<span>Hotline '+esc(hotlineNumber())+'</span></a>'+
        '<div class="xs center ftr-hours">'+esc(SITE('hours')||'')+(SITE('supportEmail') ? ' · <a href="mailto:'+esc(SITE('supportEmail'))+'">'+esc(SITE('supportEmail'))+'</a>' : '')+'</div>'+
      '</div>'+
      /* R15 wave 1 (bug 6): the social links come from the shop settings
         (SITE('social')); one with no address is not shown, and with none set
         the whole row is left out — no link ever lands on Home. */
      (SITE_SOCIAL().length ? '<div class="ftr-soc">'+SITE_SOCIAL().map(function(x){
        return '<a href="'+esc(x.url)+'" target="_blank" rel="noopener" aria-label="EXTAS on '+esc(x.label)+'">'+ico(x.icon,16)+'<span>'+esc(x.label)+'</span></a>';
      }).join('')+'</div>' : '')+
      ftrPayMarks()+
    '</div></div></div>'+
    '<div class="ftr-s ftr-s5"><div class="container ftr-legalbar"><div class="row between">'+
      '<span class="ftr-legal">© 2026 EXTAS<span class="ftr-sep"> · </span>Demo with sample data'+
        (SITE('dbid') ? '<span class="ftr-sep"> · </span>DBID: '+esc(SITE('dbid')) : '')+
        (SITE('tradeLicence') ? '<span class="ftr-sep"> · </span>Trade licence: '+esc(SITE('tradeLicence')) : '')+'</span>'+
      langPill()+
    '</div></div></div>'+
  '</footer>';
}
/* =====================================================================
   14.2 THE LANGUAGE SWITCH NOW SHOWS WHICH LANGUAGE IS ON.
   ---------------------------------------------------------------------
   Root cause: the filled half was driven by `:root[lang="bn"]` in
   styles.css, and <html lang> is only written by applyTheme() — which ran
   at boot and never again. ACT['lang'] (02-core.js) flipped ST.lang and
   re-rendered, so the category names turned Bengali while <html> still said
   lang="en" and the switch kept showing EN as selected until a reload.
   Now the switch draws its own state from ST.lang (class `on` + aria), so it
   cannot disagree with the page, and the toggle also updates <html lang>.
   ST.lang is saved with the rest of the demo state, so the choice survives
   a page change and a reload. Used by the footer and the phone menu.
   ===================================================================== */
function langPill(){
  var bn = ST.lang === 'bn';
  return '<button type="button" class="langpill" data-act="lang" data-lang="'+(bn?'bn':'en')+'" data-testid="lang-switch" '+
    'aria-label="'+(bn ? 'ভাষা: বাংলা। Switch to English' : 'Language: English. বাংলায় দেখুন')+'">'+
    '<span class="lp-a'+(bn?'':' on')+'" lang="en">EN</span><span class="lp-s" aria-hidden="true">|</span>'+
    '<span class="lp-b'+(bn?' on':'')+'" lang="bn">বাং</span></button>';
}
ACT['lang'] = function(){
  ST.lang = ST.lang === 'en' ? 'bn' : 'en';
  saveState(); applyTheme();               /* <html lang> follows at once */
  rerender();
  /* the phone menu is drawn once when opened; redraw it so its switch and
     its category names follow too */
  if(MODAL && MODAL.opts && MODAL.opts.title === 'Menu' && ACT['open-menu']){
    var sc = document.querySelector('.modal'), y = sc ? sc.scrollTop : 0;
    ACT['open-menu']();
    var sc2 = document.querySelector('.modal'); if(sc2) sc2.scrollTop = y;
  }
};
function bottomNav(cur){
  var n = bagCount(), acc = currentAccount();
  var items = [['Home','#/','home'],['Shop','#/c/new','grid'],['Sets','#/set','layers'],['Bag','#/bag','bag'],['Account',acc?'#/account':'#/login','user']];
  return '<nav class="bnav" aria-label="Bottom">'+items.map(function(x){ var on = (cur.path===x[1].slice(1)) || (x[0]==='Account' && cur.page==='account') ? ' on' : ''; var bag = x[0]==='Bag'; return '<a class="'+(on.trim()+(bag?' bn-bag'+(n?' has':''):'')).trim()+'" href="'+x[1]+'" style="position:relative">'+ico(x[2],bag?23:21,bag?'stroke-width="1.9"':'')+'<span>'+esc(t(x[0]))+'</span>'+(bag&&n?'<span class="count-dot" style="right:22%">'+n+'</span>':'')+'</a>'; }).join('')+'</nav>';
}
function ftrLink(href, label, icon){
  return '<a href="'+href+'"><span class="ftr-ic">'+ico(icon,15)+'</span><span>'+esc(t(label))+'</span></a>';
}
/* H5. The journal has real routes now (#/journal and #/journal/<slug>, see
   02-core.js ROUTES and 20-home.js), so the footer link goes to the index
   instead of firing a toast that said the feature did not exist. */
function ftrJournalLink(){
  return ftrLink('#/journal', 'Journal', 'doc');
}

/* ---------- C3. floating WhatsApp button ---------- */
/* Which pages get the button. The product page is out because it already has
   its own icon column; HOME is out because the owner asked for it to be gone
   from the home page entirely — the hero slider, the category tiles and the
   product cards all run to the right edge there and the disc was landing on
   top of them. This lookup becomes a dashboard setting — the owner ticks the
   pages he wants it on; a page set to false here is hidden. */
var FAB_PAGES = { product:false, home:false };
/* 3. The mark itself lives in 02-core.js (waGlyph) — a filled bubble with the
   handset knocked out, which people recognise. A second copy used to sit here
   and, being later in the bundle, silently won; it is gone. */
function waFab(cur){
  /* Owner switch. `fab` is not in SHOWN yet, so SHOW() returns true — add
     fab:{ whatsapp:true } to SHOWN in 02-core.js to make it switchable. */
  if(!SHOW('fab','whatsapp')) return '';
  var page = (cur && cur.page) || '';
  if(page === 'product') return '';              /* the PDP has its own icon column */
  if(FAB_PAGES[page] === false) return '';
  return '<a class="wa-fab" id="wa-fab" href="'+waLink('Hi EXTAS, I have a question about an item on your site')+'" target="_blank" rel="noopener" aria-label="Message EXTAS on WhatsApp">'+waGlyph(27)+'</a>';
}
/* C3. THE DRIFT IS GONE.
   The button used to be pinned to the middle of the right edge and pulled
   itself ~15px up or down on every scroll, then sprang back. Combined with a
   fixed position that was already inside the content column, that meant the
   thing it covered kept changing while the page moved. It is now a plain
   fixed disc in the bottom-right strip, above the bottom nav — it does not
   move at all, so what is under it can be checked once and stays checked.

   One thing still has to be dynamic: the footer's legal bar puts the
   language switch in the bottom-right corner, exactly where the disc is, so
   the disc steps aside while that bar is on screen. The test is a real
   rectangle overlap now, not a guess at half the viewport. */
var WA_FAB = {bound:false};
function waFabFooter(){
  var el = document.getElementById('wa-fab'); if(!el) return;
  /* the WHOLE footer, not just the legal bar: the newsletter field, the Join
     button, eighteen links, two reach buttons, four social tiles and the
     language switch all live down there, and the disc was landing on them */
  var ftr = document.querySelector('.ftr');
  var hide = false;
  if(ftr){
    var f = el.getBoundingClientRect(), l = ftr.getBoundingClientRect();
    hide = !(l.bottom < f.top - 12 || l.top > f.bottom + 12);
  }
  el.className = hide ? 'wa-fab wa-off' : 'wa-fab';
  /* r14: the disc sat at a fixed 74px from the bottom, which is right for
     the bottom nav but lands ON the combo and build-your-own-set buy bars
     (taller, and fixed above the nav) — it covered the chosen colours line.
     It now rides 12px above whatever bar is pinned to the bottom. */
  var H = window.innerHeight, topOfBars = H;
  [].forEach.call(document.querySelectorAll('.bnav, .mbar, .cb-mbar, .bs-mbar, .pdp-bar, [data-bottom-bar]'), function(b){
    if(!b.getClientRects().length) return;
    var cs = getComputedStyle(b); if(cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return;
    var r = b.getBoundingClientRect(); if(r.bottom < H - 2 && r.bottom < H * 0.75) return;
    if(r.top < topOfBars) topOfBars = r.top;
  });
  var lift = Math.round(H - topOfBars + 12);
  if(lift > 12 && el.style.bottom !== lift + 'px') el.style.bottom = lift + 'px';
}
/* H9. THE DEMO GEAR.
   It was fixed at top:72px / right:10px with z-index 70, which on a 440px
   phone is inside the content column (it ends at x 424) — it sat squarely on
   the "On sale (4)" badge on every category page, and on a product card or
   the newsletter label everywhere else. There is no free corner on a phone:
   the page runs edge to edge and the bottom nav takes the bottom.
   The one strip that is never tappable is the empty part of the header,
   between the menu button (which ends at x 60) and the centred EXTAS mark
   (which starts around x 146). The gear goes there and rides with the
   header, which is sticky — so it is always reachable and always over
   nothing. Its vertical position is read from the header itself rather than
   guessed, because the announce strip above it scrolls away.
   This is a demo-only control; customers never see it. */
function demoFabTop(){
  var el = document.querySelector('.demo-fab'); if(!el || window.innerWidth >= 1024 || el.classList.contains('demo-fab-tab') || el.style.top === 'auto') return;
  var hdr = document.querySelector('.hdr') || document.querySelector('.admin-top'); if(!hdr) return;
  var r = hdr.getBoundingClientRect(), size = el.offsetHeight || 42, top = Math.round(Math.max(6, r.top + (r.height - size) / 2));
  if(el.style.top !== top + 'px') el.style.top = top + 'px';
}
function demoFabPark(){
  var el = document.querySelector('.demo-fab'); if(!el) return;
  el.style.bottom = ''; el.classList.remove('demo-fab-tab');
  if(window.innerWidth >= 1024){ el.style.top = ''; el.style.left = ''; return; }
  var hdr = document.querySelector('.hdr') || document.querySelector('.admin-top');
  var top = 9, size = el.offsetHeight || 42;
  if(hdr){
    var r = hdr.getBoundingClientRect();
    top = Math.max(6, r.top + (r.height - size) / 2);
  }
  el.style.top = Math.round(top) + 'px';
  /* the headers differ (shop, checkout, landing, admin), so the free gap is
     not always in the same place. Step right until nothing tappable is under
     the gear, instead of hard-coding one offset per header. */
  var w = el.offsetWidth || 42, left = 66;
  /* only the gap between the menu and the wordmark — never between the
     wordmark and the icons on the right */
  var lg = document.querySelector('.hdr .logo.hide-d'), lgL = (lg && lg.getClientRects().length) ? lg.getBoundingClientRect().left : 9999;
  var clash = true;
  for(var tryLeft = 66; tryLeft <= 240 && tryLeft + w + 4 <= lgL; tryLeft += 14){
    el.style.left = tryLeft + 'px';
    var prev = el.style.display; el.style.display = 'none';
    clash = false;
    /* (sampled to the gear's far edge plus 4px of air — the old 12px step
       stopped 6px short and let the gear sit on the E of the logo at 360px) */
    var xs = []; for(var sx = 2; sx < w + 4; sx += 6) xs.push(sx); xs.push(w + 4);
    for(var xi = 0; xi < xs.length; xi++){ var dx = xs[xi];
      for(var dy = 4; dy < size; dy += 12){
        var hit = document.elementFromPoint(tryLeft + dx, top + dy);
        if(hit && hit.closest('a,button,input,select,label,[data-act]')){ clash = true; break; }
      }
      if(clash) break;
    }
    el.style.display = prev;
    left = tryLeft;
    if(!clash) break;
  }
  var panel = document.querySelector('.demo-panel');
  if(clash){
    /* r14: on the narrowest phones (320px) the header has no free gap wide
       enough — the gear landed on the search button. It then floats low on
       the left, above the bottom nav, the mirror of the WhatsApp disc. */
    /* R15: the product page's buy bar counts too (the gear was landing on
       "Add to Bag" once the header WhatsApp took its old gap) */
    var nav = [].filter.call(document.querySelectorAll('.bnav, .cb-mbar, .bs-mbar, .pdp-mbar, .mbar.dm-hide'), function(b){
      if(!b.getClientRects().length) return false; var cs = getComputedStyle(b); return cs.display !== 'none' && cs.visibility !== 'hidden' && (cs.position === 'fixed' || cs.position === 'sticky');
    }).sort(function(a, b){ return a.getBoundingClientRect().top - b.getBoundingClientRect().top; })[0];
    var nb = nav ? Math.max(0, window.innerHeight - nav.getBoundingClientRect().top) : 0;
    /* R15: on the product page there is no free corner left (header full,
       buy bar below, content everywhere else), so the demo gear becomes a
       slim tab in the left page margin, where nothing is ever drawn. Demo
       only — the live shop has no gear at all. */
    if(document.querySelector('.pdp-page')){
      el.classList.add('demo-fab-tab');
      el.style.top = Math.round(window.innerHeight * 0.42) + 'px';
      el.style.left = '0px';
      if(panel) panel.style.top = '60px';
      return;
    }
    el.style.top = 'auto';
    el.style.setProperty('bottom', Math.round(nb + 12) + 'px', 'important');
    el.style.left = '10px';
    if(panel) panel.style.top = '60px';
    return;
  }
  el.classList.remove('demo-fab-tab');
  el.style.left = left + 'px';
  if(panel) panel.style.top = Math.round(top + size + 8) + 'px';
}
/* R15 · 1.4. WhatsApp + Hotline: side by side ONLY when both buttons fit at
   full size (full text, full icon). Otherwise one above the other. Nothing in
   them ever shrinks. Measured from the real words, so a longer hotline number
   or another language decides for itself — no width is written anywhere. */
function ftrReachFit(){
  var r = document.querySelector('.ftr-s4 .ftr-reach'); if(!r || !r.offsetWidth) return;
  var btns = r.querySelectorAll('.btn'); if(btns.length < 2) return;
  var gap = parseFloat(getComputedStyle(r).columnGap) || 8, col = (r.clientWidth - gap) / 2, need = 0;
  [].forEach.call(btns, function(b){
    var cs = getComputedStyle(b), w = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2, g = parseFloat(cs.columnGap) || 0;
    [].forEach.call(b.children, function(k, i){ w += (k.scrollWidth || k.getBoundingClientRect().width) + (i ? g : 0); });
    need = Math.max(need, w);
  });
  var two = need <= col;
  if(r.classList.contains('ftr-two') !== two) r.classList.toggle('ftr-two', two);
}
/* R15 · 3.2. Checkout: show the header WhatsApp only while no in-page
   WhatsApp button is on screen above the fold line of the header. */
function ckhWaTick(){
  var a = document.querySelector('.ckh .hdr-wa-auto'); if(!a) return;
  var hdr = document.querySelector('.ckh'), hb = hdr ? hdr.getBoundingClientRect().bottom : 60;
  var help = document.querySelector('main .co-help a, main a.co-wa, main .co-help');
  var show = !help || help.getBoundingClientRect().bottom < hb + 2;
  if(a.classList.contains('on') !== show) a.classList.toggle('on', show);
}
/* R15 · 3.4. The phone header keeps the wordmark clear: if the icons on the
   right would come within 10px of it, the heart steps out first. */
function hdrFit(){
  var w = document.querySelector('.hdr .hdr-wish'); if(!w || window.innerWidth >= 1024) { if(w) w.classList.remove('fit-off'); return; }
  var logo = document.querySelector('.hdr .logo.hide-d'), right = document.querySelector('.hdr .hdr-r');
  if(!logo || !right || !logo.getClientRects().length) return;
  w.classList.remove('fit-off');
  if(right.getBoundingClientRect().left - logo.getBoundingClientRect().right < 10) w.classList.add('fit-off');
}
/* R15 wave 1 (bug 20). No forever timer any more. The checks run on the
   events that can change their answer — scroll, resize, the page being
   redrawn (route change), anything changing size (ResizeObserver) and the
   web fonts arriving — at most once per frame, and only the cheap ones on
   scroll. (A 300 ms setInterval used to wake the phone all day.) */
var LAYOUT_TICK = {raf:0, full:false};
function layoutTick(full){
  if(full) LAYOUT_TICK.full = true;
  if(LAYOUT_TICK.raf) return;
  LAYOUT_TICK.raf = requestAnimationFrame(function(){
    LAYOUT_TICK.raf = 0; var f = LAYOUT_TICK.full; LAYOUT_TICK.full = false;
    /* on scroll only cheap reads; the demo gear's full placement search
       (elementFromPoint sweeps) runs on resize / route change only */
    try{ waFabFooter(); ckhWaTick(); if(f){ hdrFit(); ftrReachFit(); demoFabPark(); bottomBarPad(); } else demoFabTop(); }catch(e){ console.error(e); }
  });
}
/* R15 wave 1 (L15): the page's bottom room is the height of whatever bar is
   pinned to the bottom (bottom nav, product / combo / set / bag buy bar),
   measured — not a fixed 64/88/96 px — so the footer's last line is never
   under a bar. Published as --bar-pad (r12-zfix.css uses it). */
function bottomBarPad(){
  if(window.innerWidth >= 1024){ document.documentElement.style.removeProperty('--bar-pad'); return; }
  var H = 0;
  [].forEach.call(document.querySelectorAll('.bnav, .mbar, .cb-mbar, .bs-mbar, .pdp-mbar, .bg-mbar, .lp-mbar, [data-bottom-bar]'), function(b){
    if(!b.getClientRects().length) return; var cs = getComputedStyle(b);
    if(cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return;
    H = Math.max(H, b.offsetHeight);
  });
  var v = H ? (H + 12) + 'px' : '';
  if(document.documentElement.style.getPropertyValue('--bar-pad') !== v){ if(v) document.documentElement.style.setProperty('--bar-pad', v); else document.documentElement.style.removeProperty('--bar-pad'); }
}
function layoutNow(){ try{ hdrFit(); ftrReachFit(); waFabFooter(); ckhWaTick(); demoFabPark(); bottomBarPad(); }catch(e){ console.error(e); } layoutTick(true); }
function waFabInit(){
  var f = WA_FAB; if(f.bound) return; f.bound = true;
  window.addEventListener('scroll', function(){ layoutTick(false); }, {passive:true});
  window.addEventListener('resize', function(){ layoutTick(true); });
  window.addEventListener('orientationchange', function(){ layoutTick(true); });
  if(window.ResizeObserver){ try{ new ResizeObserver(function(){ layoutTick(true); }).observe(document.documentElement); }catch(e){} }
  if(document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function(){ layoutTick(true); });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ layoutTick(true); });
}
waFabInit();

function slimHeader(kind, cur){
  if(kind!=='checkout'){
    return '<header class="hdr"><div class="container hdr-in">'+
      '<span style="width:38px"></span><a class="logo" href="#/">EXTAS</a>'+
      hdrWa({page:'landing'})+   /* R15: the one WhatsApp icon, same as every header */
    '</div></header>';
  }
  /* 30+37. Checkout gets its own header: the mark sits left beside the back
     arrow, the empty middle carries the three steps so the customer can see
     how far along they are, and the strip is tinted so it is not one more
     sheet of white. */
  var step = function(n, label, on, done){
    return '<span class="ckh-s'+(on?' on':'')+(done?' done':'')+'">'+
      '<span class="n">'+(done?ico('check',12):n)+'</span>'+esc(label)+'</span>';
  };
  var done = cur && cur.page==='thanks';
  return '<header class="hdr ckh"><div class="container hdr-in">'+
    '<span class="ckh-l">'+(done ? '<a class="iconbtn" href="#/" aria-label="Home">'+ico('home',21)+'</a>'
                                 : '<a class="iconbtn" href="#/bag" aria-label="Back to bag">'+ico('back',21)+'</a>')+
      '<a class="logo" href="#/">EXTAS</a></span>'+
    '<span class="ckh-steps dm-only">'+step(1,'Bag',false,true)+'<span class="ckh-d"></span>'+
      step(2,'Delivery & payment',!done,done)+'<span class="ckh-d"></span>'+step(3,'Done',done,false)+'</span>'+
    /* R15 · 3.2. Hidden at first — the "Need help?" button under the header
       does the job. Once that button scrolls up out of sight, the header's
       WhatsApp icon fades in to the left of the lock (ckhWaTick). */
    '<span class="row ckh-rr" style="gap:10px">'+hdrWa(cur || {page:'checkout'}, 'auto')+
    '<span class="row xs bold brandc ckh-r" style="gap:5px">'+ico('lock',15)+esc(t('Secure'))+'</span></span>'+
  '</div></header>';
}
function adminShell(body, cur){
  var links = [['Orders','#/admin/orders','box'],['Smart Rules','#/admin/rules','doc'],['Size charts','#/admin/size-charts','ruler'],['AI & agents','#/admin/ai','spark'],['Landing pages','#/admin/landing','bolt'],['Combos & sets','#/admin/combos','layers'],['Reviews','#/admin/reviews','star']];
  var soon = [];   /* backend wave 2: every former "in the full build" page now exists */
  var side = links.map(function(x){ var on = cur.path.indexOf(x[1].slice(1))===0 || (x[0]==='Orders' && cur.path==='/admin') ? ' on' : ''; return '<a class="'+on.trim()+'" href="'+x[1]+'">'+ico(x[2],18)+esc(x[0])+'</a>'; }).join('');
  var mtabs = links.map(function(x){ var on = cur.path.indexOf(x[1].slice(1))===0 || (x[0]==='Orders' && cur.path==='/admin'); return '<a class="chip'+(on?' on':'')+'" href="'+x[1]+'">'+esc(x[0])+'</a>'; }).join('');
  return '<div class="admin">'+
    '<aside class="admin-side"><div class="row" style="padding:4px 12px 18px"><span class="logo" style="color:#fff!important;font-size:18px">EXTAS</span><span class="tag" style="background:rgba(255,255,255,.12);color:#fff">Admin</span></div>'+side+
      (soon.length ? '<div class="xs" style="color:#9FBDB4;padding:16px 12px 6px">In the full build</div>' : '')+soon.map(function(x){return '<a class="soon">'+ico(x[1],18)+esc(x[0])+'</a>';}).join('')+
      '<a href="#/" style="margin-top:auto">'+ico('back',18)+'Back to the shop</a></aside>'+
    '<div style="min-width:0"><div class="admin-top"><span class="row"><span class="logo" style="color:#fff!important;font-size:16px">EXTAS</span><span class="tag" style="background:rgba(255,255,255,.12);color:#fff">Admin</span></span><a href="#/" style="color:#fff;font-size:13px">Shop →</a></div>'+
      /* R15 wave 2: the admin page body is a <main> landmark too (skip link target) */
      '<main class="admin-main" id="main" tabindex="-1"><div class="admin-tabs hide-d mb16">'+mtabs+'</div>'+body+'</main></div>'+
  '</div>';
}
function demoPanel(){
  if(!UI.demoOpen) return '<button class="demo-fab" data-act="demo-toggle" aria-label="Open demo controls">'+ico('settings',16)+'<span class="demo-fab-t">Demo controls</span></button>';
  var seg = function(act, val, opts){ return '<div class="seg">'+opts.map(function(o){ return '<button data-act="'+act+'" data-v="'+o[0]+'" class="'+(val===o[0]?'on':'')+'">'+o[1]+'</button>'; }).join('')+'</div>'; };
  var link = function(h,l){ return '<a href="'+h+'" style="display:block;padding:6px 0;color:#1F4E46;font-weight:600">'+l+'</a>'; };
  return '<button class="demo-fab" data-act="demo-toggle" aria-label="Close demo controls">'+ico('close',16)+'<span class="demo-fab-t">Close</span></button>'+
  '<div class="demo-panel" role="dialog" aria-label="Demo controls">'+
    '<div style="font-weight:800;font-size:15px;margin-bottom:4px">Demo controls</div><div style="color:#6E675E;font-size:12px;margin-bottom:12px">Only in this demo — customers never see this.</div>'+
    '<div style="font-weight:600;margin-bottom:6px">Theme (whole site)</div>'+seg('demo-theme', ST.theme, [['classic','Classic'],['noir','Noir'],['ivory','Ivory'],['festive','Festive']])+
    '<div style="font-weight:600;margin:12px 0 6px">Product page template</div>'+seg('demo-pdp', ST.pdpTemplate, [['auto','Per product'],['T1','T1'],['T2','T2'],['T3','T3']])+
    '<div style="font-weight:600;margin:12px 0 6px">Combo page template</div>'+seg('demo-combo', ST.comboTemplate, [['auto','Per combo'],['C1','C1 Stacked'],['C2','C2 Steps']])+
    '<div class="row between" style="margin:12px 0 4px"><span style="font-weight:600">Eid cutoff banner</span><button class="switch'+(ST.festive?' on':'')+'" data-act="demo-festive" aria-label="Eid cutoff banner"></button></div>'+
    '<div style="border-top:1px solid #E6E3DE;margin:12px 0 8px"></div><div style="font-weight:600">Customer journey</div>'+
    link('#/','Home')+link('#/p/essential-pique-polo','Product · Essential Piqué Polo')+link('#/combo/polo-duo','Combo · Polo Duo')+link('#/set','Build your own set')+link('#/bag','Bag')+link('#/l/polo-duo','Ad landing page (from Facebook ad)')+
    link('#/login','Log in as a returning customer')+link('#/exchange/EX-1038','Exchange a delivered order')+
    '<div style="color:#6E675E;font-size:12px;margin-top:4px">Returning customer: 01712345678 · password 01712345678</div>'+
    '<div style="border-top:1px solid #E6E3DE;margin:12px 0 8px"></div><div style="font-weight:600">Owner admin</div>'+
    link('#/admin/orders','Orders (with flags)')+link('#/admin/rules','Smart Rules')+link('#/admin/size-charts','Size charts')+link('#/admin/ai','AI & agents')+link('#/admin/landing','Landing pages')+link('#/admin/combos','Combos & customer sets')+
    link('#/admin/products','Products')+link('#/admin/customers','Customers & CRM')+link('#/admin/couriers','Couriers')+link('#/admin/ads','Ads & tracking')+link('#/admin/blog','Blog & SEO')+
    link('#/admin/settings','Settings')+link('#/admin/backup','Backup')+link('#/admin/audit','Site audit')+link('#/admin/health','Server health')+link('#/admin/agents','AI agents')+
    '<button class="btn btn-sm btn-ghost mt12" data-act="demo-reset" style="width:100%">Reset all demo data</button>'+
  '</div>';
}
ACT['demo-toggle'] = function(){ UI.demoOpen = !UI.demoOpen; rerender(); };
ACT['demo-theme'] = function(el){ ST.theme = el.getAttribute('data-v'); saveState(); applyTheme(); rerender(); };
ACT['demo-pdp'] = function(el){ ST.pdpTemplate = el.getAttribute('data-v'); saveState(); rerender(); };
ACT['demo-combo'] = function(el){ ST.comboTemplate = el.getAttribute('data-v'); saveState(); rerender(); };
ACT['demo-festive'] = function(){ ST.festive = !ST.festive; saveState(); rerender(); };
ACT['demo-reset'] = function(){ if(confirm('Reset all demo data (orders, bag, rules, settings)?')) resetState(); };
SUBMIT['join'] = function(f){ toast('Thanks — you will get new drops first'); f.reset(); };

function layout(body, kind, cur){
  var demo = demoPanel();
  /* R15 wave 1 (bug 19): every page starts with a "Skip to content" link
     (hidden until it gets keyboard focus) that jumps past the header */
  var skip = '<a class="skip" href="#main" data-act="skip">'+esc(t('Skip to content'))+'</a>';
  var main = function(b){ return '<main class="page" id="main" tabindex="-1">'+b+'</main>'; };
  if(kind==='admin') return skip + adminShell(body, cur) + demo;
  if(kind==='checkout') return skip + slimHeader('checkout', cur) + main(body) + demo;
  if(kind==='landing') return skip + slimHeader('landing') + main(body) + demo;
  if(kind==='bare') return skip + main(body) + demo;
  return skip + '<div class="has-bnav">'+storeHeader(cur)+main(body)+storeFooter()+bottomNav(cur)+'</div>'+waFab(cur)+demo;
}

PAGES.notfound = {title:'Page not found', render:function(){ return '<div class="container empty"><h1 class="h1">'+esc(t('Page not found'))+'</h1><p class="muted mt12">This demo page does not exist.</p><a class="btn btn-primary mt16" href="#/">'+esc(t('Go to home'))+'</a></div>'; }};
/* the skip link moves focus to the page itself (the #main hash would be read
   as a route, so it is handled here) */
ACT['skip'] = function(){ var m = document.getElementById('main'); if(m){ try{ m.focus({preventScroll:true}); }catch(e){ m.focus(); } var r = m.getBoundingClientRect(), h = document.querySelector('.hdr'); window.scrollBy(0, r.top - (h ? h.getBoundingClientRect().bottom : 0)); } };

/* =====================================================================
   AUTO-FIT TYPE — the owner's rule, in one place.
   ---------------------------------------------------------------------
   "Nothing is fixed. Whatever the screen, everything adjusts itself and
   settles into place. If something truly cannot fit by adjusting, it hides
   or collapses — it never falls onto another line and never covers anything."

   A rule names a box. After every render, on every resize and when the web
   fonts arrive, each box starts at its own CSS size and, if any text inside
   it is cut, its font-size steps down — never below `min`. Everything inside
   the box is sized in em, so the whole box scales as one.
     group:    boxes with the same group end at the same size (a row of size
               pills, the three toolbar buttons) so they keep matching;
     box:      also count the box itself overflowing (a row of buttons that
               never shrink below their labels);
     collapse: (true, or 2 for a second step) if the box still does not fit
               at `min`, it gets the class
               `fit-x` and is fitted once more. CSS decides what `fit-x`
               hides (the price on a hero pin, the long caption, the fit
               label on a narrow card) — the "hides or collapses" step.
   The sizes are written in one batch per round (one reflow per round, at
   most a handful of rounds), so a long page does not stutter.
   ===================================================================== */
var FIT_RULES = [];
function fitRule(sel, opts){ opts = opts || {}; opts.sel = sel; FIT_RULES.push(opts); }
/* how much of the widest cut text would fit (1 = nothing is cut). Only
   elements that hold text themselves are measured: a swatch's 44px finger
   box sticking out of a 16px dot is not text being cut. */
function fitHasText(e){
  for(var c=e.firstChild; c; c=c.nextSibling) if(c.nodeType===3 && c.textContent.trim()) return true;
  return false;
}
function fitRatio(box, whole){
  var r = 1, els = [box].concat([].slice.call(box.querySelectorAll('*')));
  if(whole){
    /* children running past the box's CONTENT edge (into its padding counts) */
    var bs = getComputedStyle(box), br = box.getBoundingClientRect();
    var inner = br.left + box.clientLeft + box.clientWidth - (parseFloat(bs.paddingRight)||0);
    var left = br.left + box.clientLeft + (parseFloat(bs.paddingLeft)||0), far = inner;
    for(var c=box.firstElementChild; c; c=c.nextElementSibling){ var cr = c.getBoundingClientRect(); if(cr.width && cr.right > far) far = cr.right; }
    if(far > inner + 0.5) r = Math.max(0.05, (inner - left) / (far - left));
  }
  for(var i=0;i<els.length;i++){
    var e = els[i];
    /* `box:true` rules also count the box itself running out of room, for a
       row whose children refuse to shrink below their own labels */
    var cw = e.clientWidth, sw = e.scrollWidth;
    if(!cw || sw <= cw + 0.5) continue;
    /* text running out of its own box, or anything cut by a box that clips */
    if(!(whole && e === box) && !fitHasText(e)){
      var ox = getComputedStyle(e).overflowX;
      if(ox !== 'hidden' && ox !== 'clip') continue;
    }
    var cs = getComputedStyle(e), pad = (parseFloat(cs.paddingLeft)||0) + (parseFloat(cs.paddingRight)||0);
    var k = Math.max(0.05, (cw - pad) / Math.max(1, sw - pad));
    if(k < r) r = k;
  }
  return r;
}
function fitAll(){
  var items = [];
  FIT_RULES.forEach(function(rule){
    [].forEach.call(document.querySelectorAll(rule.sel), function(el){
      if(!el.getClientRects().length) return;         /* hidden: nothing to fit */
      el.style.fontSize = ''; el.classList.remove('fit-x'); el.classList.remove('fit-xx');
      items.push({el:el, rule:rule});
    });
  });
  if(!items.length) return;
  /* Read every start size in one pass, then a batched binary search: every
     round writes all the sizes, then reads all of them once. Eight rounds
     place each box within a twentieth of a pixel of the largest size that
     fits, whatever the page holds. */
  items.forEach(function(it){ it.max = parseFloat(getComputedStyle(it.el).fontSize) || 14; it.fs = it.max; });
  function setFs(it, v){ it.fs = v; it.el.style.fontSize = v.toFixed(2) + 'px'; }
  function search(list){
    /* 1. at the CSS size: most boxes already fit and are left alone */
    var ok = list.map(function(it){ return fitRatio(it.el, it.rule.box) >= 1; });
    list = list.filter(function(it, i){ if(!ok[i]){ it.el.style.fontSize = ''; } return !ok[i]; });
    if(!list.length) return;
    /* 2. at the floor: what does not fit even there is "stuck" */
    list.forEach(function(it){ it.lo = Math.min(it.rule.min || 9, it.max); it.hi = it.max; setFs(it, it.lo); });
    var atMin = list.map(function(it){ return fitRatio(it.el, it.rule.box) >= 1; });
    list = list.filter(function(it, i){ if(!atMin[i]) it.stuck = true; return atMin[i]; });
    /* 3. halve the gap between "fits" and "does not" */
    for(var n=0; n<7 && list.length; n++){
      list.forEach(function(it){ setFs(it, (it.lo + it.hi) / 2); });
      var fits = list.map(function(it){ return fitRatio(it.el, it.rule.box) >= 1; });
      list.forEach(function(it, i){ if(fits[i]) it.lo = it.fs; else it.hi = it.fs; });
    }
    list.forEach(function(it){ setFs(it, it.lo); });
  }
  search(items);
  /* collapse what still does not fit, and fit it again from the top.
     collapse:true is one step (.fit-x); collapse:2 adds a second (.fit-xx)
     for a box that needs a last resort after that. */
  for(var lvl=1; lvl<=2; lvl++){
    var again = items.filter(function(it){ var c = it.rule.collapse; return it.stuck && c && (c === true ? 1 : c) >= lvl; });
    if(!again.length) break;
    again.forEach(function(it){ it.stuck = false; it.el.classList.add(lvl === 1 ? 'fit-x' : 'fit-xx'); it.el.style.fontSize = ''; });
    again.forEach(function(it){ it.fs = it.max = parseFloat(getComputedStyle(it.el).fontSize) || it.max; });
    search(again);
  }
  /* a group ends at its smallest member, so a row never stops matching */
  var groups = {};
  items.forEach(function(it){ var g = it.rule.group; if(!g) return; (groups[g] = groups[g] || []).push(it); });
  Object.keys(groups).forEach(function(g){
    var lo = Math.min.apply(null, groups[g].map(function(it){ return it.fs; }));
    groups[g].forEach(function(it){ if(it.fs > lo + 0.01){ it.fs = lo; it.el.style.fontSize = lo.toFixed(2) + 'px'; } });
  });
}
/* after every render (the router replaces #app's children), on resize, and
   once the web fonts have arrived — a late font changes every width */
var FIT_PENDING = false;
function fitSoon(){ if(FIT_PENDING) return; FIT_PENDING = true;
  requestAnimationFrame(function(){ FIT_PENDING = false; try{ fitAll(); }catch(e){ console.error(e); } }); }
(function(){
  var app = document.getElementById('app');
  if(app && window.MutationObserver){
    /* a microtask: runs after the page's own after() hook, before paint */
    /* R15 wave 1 (bug 10): the header fit (wishlist heart on narrow phones)
       is decided here too, in the same microtask as the render — before the
       first paint — so nothing in the header moves after a page change */
    new MutationObserver(function(){ try{ layoutNow(); fitAll(); }catch(e){ console.error(e); } }).observe(app, {childList:true});
  }
  window.addEventListener('resize', fitSoon);
  window.addEventListener('orientationchange', fitSoon);
  if(document.fonts){
    if(document.fonts.ready) document.fonts.ready.then(fitSoon);
    if(document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', fitSoon);
  }
})();

/* R15 wave 1 (L05 · no word cut mid-way): the saved-for-later names and the
   duo colour chips in the bag step their type down to fit instead of being
   cut with "…" (a name longer than even the floor allows still ends in "…"). */
fitRule('.zc-savednm', {min:12});
fitRule('.bg-page .bg-duoc .bg-duon', {min:9.5, group:'bgduon'});
