/* ================= EXTAS demo — layout shells ================= */
var NAV = [['New in','#/c/new'],['Polos','#/c/polos'],['T-Shirts','#/c/tshirts'],['Shirts','#/c/shirts'],['Panjabi','#/c/panjabi'],['Trousers','#/c/trousers'],['Hoodies','#/c/hoodies'],['Sets','#/set'],['Journal','#/journal']];   /* Blog QA U3: Journal joins the desktop nav */
/* =====================================================================
   DESKTOP BATCH A · D-001. THE DESKTOP NAV IS BUILT FROM THE CATEGORY DATA.
   The hard-coded NAV above is kept (DESK_NAV.fromData:false brings it back),
   but by default the desktop row is: New in · every live category (from
   DB.categories, in the owner's order) · More (categories kept out of the
   main row — hidden/test ones — when showHidden is on) · Combos · Sets ·
   Journal. Every category item opens a mega panel (97-desk-a.js). When the
   row does not fit (1024 px), the last categories fold into "More"
   (deskNavFit, measured). The phone never shows this row (.nav-d is
   display:none under 1024) and its drawer is untouched.
   All switches are settings, nothing is deleted.
   ===================================================================== */
var DESK_NAV = { fromData:true, newIn:true, combos:true, sets:true, journal:true, showHidden:true, mega:true, featured:true };
function deskOn(){ try{ return !!(window.matchMedia && window.matchMedia('(min-width:1024px)').matches); }catch(e){ return false; } }
/* LAYOUT-BUILDER HOOK (PR 595/596): two empty side gutters on the home and
   category pages, desktop only (drawn at 1024+, shown at 1280+ by
   r12-zzdesk-a.css). They are absolutely positioned in the page's side
   margins and take no pointer events until something is put inside, so
   they never change the layout. The phone never gets them. */
function lbGutters(){
  if(!deskOn()) return '';
  return '<div class="lb-gutters"><div id="lb-side-l" class="lb-side" data-side="l"></div><div id="lb-side-r" class="lb-side" data-side="r"></div></div>';
}
/* PR 598 · THE MENU TREE. One ordered list drives the desktop nav row, the
   mega menu and the phone menu; each item has its own desktop / phone
   visibility. Kinds: new · cat (one per category, follows the category
   data) · more · combos · sets · setsPhone · journal · link (the owner's own,
   with an address). Any item can carry mega columns (cols, colsMode
   'add'|'replace') and a featured tile (feat). The phone menu also has its
   quick row and its Help list; the bottom bar is the `bottom` list. */
function menuDefault(){
  var items = [{id:'new', kind:'new', label:'New in', on:true, desk:true, phone:true}];
  (DB.categories||[]).forEach(function(c){ items.push({id:c.id, kind:'cat', cat:c.id, on:true, desk:true, phone:true}); });
  items.push({id:'more', kind:'more', label:'More', on:true, desk:true, phone:false});
  items.push({id:'combos', kind:'combos', label:'Combos', href:'#/combos', on:true, desk:true, phone:false});
  items.push({id:'sets', kind:'sets', label:'Sets', phoneLabel:'Build your own set', href:'#/set', on:true, desk:true, phone:true});
  items.push({id:'setsPhone', kind:'setsPhone', label:'Sets & combos', href:'#/combo/polo-duo', on:true, desk:false, phone:true});
  items.push({id:'journal', kind:'journal', label:'Journal', href:'#/journal', icon:'doc', on:true, desk:true, phone:true});
  return {
    items:items,
    quick:[{id:'search', on:true}, {id:'bag', on:true}, {id:'wish', on:true}, {id:'account', on:true}],
    help:[{id:'h1', label:'Track my order', href:'#/account', icon:'truck', on:true}, {id:'h2', label:'Delivery', href:'#/page/delivery', icon:'truck', on:true},
      {id:'h3', label:'Exchange & returns', href:'#/page/exchange', icon:'swap', on:true}, {id:'h4', label:'Questions & answers', href:'#/page/faq', icon:'info', on:true},
      {id:'h5', label:'Contact us', href:'#/page/contact', icon:'chat', on:true}],
    helpTitle:'Help',
    bottom:[{id:'home', label:'Home', href:'#/', icon:'home', on:true}, {id:'shop', label:'Shop', href:'#/c/new', icon:'grid', on:true}, {id:'sets', label:'Sets', href:'#/set', icon:'layers', on:true},
      {id:'bag', label:'Bag', href:'#/bag', icon:'bag', on:true}, {id:'account', label:'Account', href:'#/account', icon:'user', on:true}]
  };
}
function menuData(){ return sbData('menus', menuDefault()); }
/* the tree with every category in it: a category the list does not name yet
   (made after the menu was saved) joins after the last category item */
function menuItems(){
  var items = (menuData().items||[]).slice(), have = {}, lastCat = -1;
  items.forEach(function(x, i){ if(x.kind==='cat'){ have[x.cat] = 1; lastCat = i; } });
  (DB.categories||[]).forEach(function(c){ if(!have[c.id]){ lastCat = lastCat < 0 ? 0 : lastCat + 1; items.splice(lastCat, 0, {id:c.id, kind:'cat', cat:c.id, on:true, desk:true, phone:true}); } });
  return items;
}
function menuItem(id){ var l = menuItems(); for(var i = 0; i < l.length; i++) if(l[i].id===id) return l[i]; return null; }
/* a category in a menu: its page is live, it is listed, and the owner has it in menus */
function menuCatOk(c){ return c && !c.unlisted && c.menu !== false; }
function deskNavCats(){
  var live = [], more = [], mi = menuItem('more'), moreOn = !mi || (mi.on !== false && mi.desk !== false);
  menuItems().forEach(function(x){
    if(x.kind!=='cat') return; var c = CAT(x.cat);
    if(!menuCatOk(c) || x.on===false || x.desk===false) return;
    if(!productsIn(c.id).length) return;                  /* an empty category has nothing to show */
    if(c.hidden){ if(DESK_NAV.showHidden && moreOn) more.push(c); } else live.push(c);
  });
  return {live:live, more:more};
}
function deskNavItems(){
  if(!DESK_NAV.fromData) return NAV.map(function(x){ return {id:x[1], label:x[0], href:x[1]}; });
  var cs = deskNavCats(), items = [], liveIds = {};
  cs.live.forEach(function(c){ liveIds[c.id] = 1; });
  var vis = function(x){ return x.on !== false && x.desk !== false; };
  menuItems().forEach(function(x){
    var own = !!(x.cols && x.cols.length) || !!(x.feat && x.feat.on);
    if(x.kind==='new'){ if(DESK_NAV.newIn && vis(x)) items.push({id:'new', label:x.label || 'New in', bn:x.bn, href:'#/c/new', sec:'/c/new', mega:'new'}); }
    else if(x.kind==='cat'){ var c = CAT(x.cat); if(c && liveIds[c.id]) items.push({id:c.id, label:x.label || c.name, bn:x.bn, href:'#/c/'+c.id, sec:'/c/'+c.id, mega:'cat', cat:c.id, fold:true}); }
    else if(x.kind==='more'){ items.push({id:'more', label:x.label || 'More', href:'#/c/new?all=1', mega:'more', more:cs.more.map(function(c){ return c.id; })}); }   /* its own address (all styles), not New in's */
    else if(x.kind==='combos'){ if(DESK_NAV.combos && vis(x)) items.push({id:'combos', label:x.label || 'Combos', bn:x.bn, href:x.href || '#/combos', sec:'/combos', mega:'combos'}); }
    else if(x.kind==='sets'){ if(DESK_NAV.sets && vis(x)) items.push({id:'sets', label:x.label || 'Sets', bn:x.bn, href:x.href || '#/set', sec:'/set', mega:own ? 'cat' : ''}); }
    else if(x.kind==='journal'){ if(DESK_NAV.journal && vis(x)) items.push({id:'journal', label:x.label || 'Journal', bn:x.bn, href:x.href || '#/journal', sec:'/journal', mega:own ? 'cat' : ''}); }
    else if(x.kind==='link' && vis(x) && x.href){ var h = String(x.href); items.push({id:x.id, label:x.label || '', bn:x.bn, href:h, sec:/^#\//.test(h) ? h.slice(1).split('?')[0] : '', mega:own ? 'cat' : '', fold:true}); }
  });
  return items;
}
function deskNavHTML(sec){
  var chev = '<svg class="nav-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  return deskNavItems().map(function(x){
    var here = x.sec ? sec===x.sec : (x.more||[]).some(function(id){ return sec==='/c/'+id; });
    var mega = DESK_NAV.mega && x.mega;
    var label = (ST.lang==='bn' && x.bn) ? x.bn : t(x.label);
    if(x.id==='more' && !(x.more||[]).length) return '<a class="nav-i nav-more" href="#/c/new?all=1" data-nav="more" data-mega="more" aria-haspopup="true" aria-expanded="false" hidden>'+esc(t(x.label || 'More'))+chev+'</a>';
    return '<a class="nav-i'+(here?' on':'')+(x.id==='more'?' nav-more':'')+'" href="'+esc(x.href)+'" data-nav="'+esc(x.id)+'"'+(x.fold?' data-fold="1"':'')+
      (mega?' data-mega="'+x.mega+'" aria-haspopup="true" aria-expanded="false" aria-controls="mega-panel"':'')+(here?' aria-current="page"':'')+'>'+
      esc(label)+(mega?chev:'')+'</a>';
  }).join('');
}
/* the mega panel for an item with the owner's own columns / featured tile.
   97-desk-a.js opens a panel by calling megaCatHTML(data-nav); the wrapper
   below (installed once every file has loaded) adds or swaps the owner's
   columns, swaps the featured tile, shows the menu label, and leaves out
   sub-categories that are not listed. Untouched items → the original panel. */
function menuMegaCols(x){
  return (x.cols||[]).map(function(col){
    return '<div class="mega-col">'+(col.title ? '<div class="mega-h">'+esc(sbLbl(col, '', true))+'</div>' : '')+(col.links||[]).filter(function(l){ return l && l.href && l.on !== false; }).map(function(l){
      return '<a class="mega-a" href="'+esc(l.href)+'"><span>'+esc(sbLbl(l, '', true))+'</span></a>'; }).join('')+'</div>';
  }).join('');
}
function menuMegaFeat(x){
  var f = x.feat || {}; if(!f.on) return null;
  var p = f.product && P(f.product), img = p ? productImg(p, (f.color && p.colors.indexOf(f.color)>=0) ? f.color : p.colors[0], {label:false, ratio:'ratio-34'}) : '';
  return '<div class="mega-feat"><a class="mega-ft sb-mft" href="'+esc(f.href || (p ? '#/p/'+p.id : '#/'))+'">'+img+'<span class="sb-mft-t">'+esc(sbLbl({label:f.title, bn:f.titleBn}, '', true))+'</span></a></div>';
}
function menuMegaWrap(orig){
  var w = function(id){
    var x = menuItem(id), c = CAT(id);
    var subs = DB.subcats, sw = null;
    if(subs && subs.some(function(s){ return s.unlisted; })) sw = subs.filter(function(s){ return !s.unlisted; });
    var html = '';
    if(c){
      var name0 = c.name, lab = x && ((ST.lang==='bn' && x.bn) || x.label);
      try{ if(sw) DB.subcats = sw; if(lab) c.name = lab; html = orig.apply(this, arguments); } finally { c.name = name0; if(sw) DB.subcats = subs; }
    }
    if(!x) return html;
    var own = menuMegaCols(x), feat = menuMegaFeat(x), n = (x.cols||[]).length;
    if(!own && feat===null && (x.feat||{}).on !== false) return html;
    var m = html.match(/^<div class="mega-cols n(\d+)">([\s\S]*?)<\/div>((?:<div class="mega-feat">[\s\S]*)?)$/);
    var cols = '', k = 0, ft = '';
    if(m && x.colsMode !== 'replace'){ cols = m[2]; k = +m[1]; }
    if(m) ft = m[3];
    if(feat !== null) ft = feat; else if((x.feat||{}).on === false) ft = '';
    cols += own; k += n;
    return '<div class="mega-cols n'+Math.max(1, Math.min(k, 4))+'">'+cols+'</div>'+ft;
  };
  w._sb = true; return w;
}

/* =====================================================================
   PR 598 · SITE BUILDER (Shilpi A360-05). THE HEADER, MENUS AND FOOTER ARE
   DRAWN FROM DATA. Each part reads its published data from the site builder
   (sbArea() in 96d-site-builder.js; draft data inside a preview frame) and
   falls back to the defaults below. The defaults are built from the same
   settings this file always used (NAV/DESK_NAV, FOOTER_SHOP, the help and
   EXTAS links, T.announce, SITE()), so with nothing published every page is
   byte-for-byte what it was (pixel gate 0). Published data is merged over
   the defaults, so a field added later still has a value.
   ===================================================================== */
function sbData(area, def){
  var d = (typeof sbArea==='function') ? sbArea(area) : null;
  if(!d) return def;
  var o = {}; for(var k in def) o[k] = def[k]; for(var j in d) if(d[j] !== undefined) o[j] = d[j];
  return o;
}
/* a label the owner typed (or the default English word), in the shop's language */
function sbLbl(x, dflt, raw){
  if(ST.lang==='bn' && x && x.bn) return x.bn;
  var l = (x && x.label) || dflt || '';
  return raw ? l : t(l);
}
/* the logo: the owner's text, or an uploaded image (JPG/PNG/SVG/WebP) with
   its own height for desktop and phone and an optional small phone version.
   where: 'phone' | 'desk' | 'footer'. Text logo = exactly the old markup. */
function sbLogo(where){
  var h = hdrData().logo || {};
  var src = (where==='phone' && h.imgPhone) ? h.imgPhone : h.img;
  if(!src) return esc(h.text || 'EXTAS');
  var ht = where==='phone' ? (+h.hPhone || 28) : (where==='footer' ? (+h.hFooter || 32) : (+h.hDesk || 36));
  return '<img class="sb-logo-img" src="'+esc(src)+'" alt="'+esc(h.alt || h.text || '')+'" style="--sb-lh:'+Math.max(16, Math.min(ht, where==='phone' ? 44 : 60))+'px">';
}
function sbBrand(){ var h = hdrData().logo || {}; return h.text || 'EXTAS'; }
/* the slogan: one text shared by header and footer, each place may override it */
function sbSlogan(place){
  var s = hdrData().slogan || {}, f = place==='footer' ? (ftrData().slogan || '') : '', fb = place==='footer' ? (ftrData().sloganBn || '') : '';
  var own = place==='header' ? {t:s.headerText, b:s.headerBn} : {t:f, b:fb};
  if(ST.lang==='bn' && (own.b || s.bn)) return own.b || s.bn;
  return own.t || s.text || '';
}
function sbSloganShort(){ var s = hdrData().slogan || {}; return (ST.lang==='bn' && s.shortBn) ? s.shortBn : (s.short || ''); }
/* header slogan (owner 22:14): under the logo, on by default. On a phone it
   never widens the logo box — hdrSlogFit() gives it the free width beside the
   wordmark and steps it down (full → short → hidden); on a desktop it sits
   under the logo in the flow, so the nav row's own fit (deskNavFit) counts it. */
function hdrSlogan(where){
  var s = hdrData().slogan || {}; if(s.on === false || s.header === false) return '';
  if(where==='phone' && s.phone === false) return ''; if(where==='desk' && s.desk === false) return '';
  var full = sbSlogan('header'); if(!full) return '';
  var sh = sbSloganShort();
  return '<span class="sb-slog sb-slog-'+where+'" data-l="0"><span class="sb-sf">'+esc(full)+'</span>'+(sh && sh !== full ? '<span class="sb-ss">'+esc(sh)+'</span>' : '')+'</span>';
}
/* the header's own data: announcement messages, icons and their order, logo */
function hdrDefault(){
  return {
    announce:{on:true, rotate:5, bg:'', fg:'', msgs:[{id:'a1', text:T.en.announce, bn:T.bn.announce, href:'', start:'', end:'', on:true}]},
    icons:[{id:'whatsapp', on:true}, {id:'search', on:true}, {id:'wish', on:true}, {id:'account', on:true}, {id:'bag', on:true}],
    logo:{text:'EXTAS', img:'', imgPhone:'', alt:'', hDesk:36, hPhone:28, hFooter:32},
    /* one slogan for header and footer; headerText / the footer's own field override it per place */
    slogan:{text:'Menswear · Made in Bangladesh', bn:'', short:'Made in Bangladesh', shortBn:'', on:true,    /* owner 22:14: slogan under the logo, ON by default (Site builder › Header to switch off) */
      header:true, phone:true, desk:true, headerText:'', headerBn:''}
  };
}
function hdrData(){ return sbData('header', hdrDefault()); }
/* the messages that are live today (on, inside their dates) */
function announceMsgs(){
  var a = hdrData().announce || {}; if(a.on === false) return [];
  var today = (typeof lb_today==='function') ? lb_today() : new Date().toISOString().slice(0,10);
  return (a.msgs||[]).filter(function(m){ return m && m.on !== false && (m.text || m.bn) && (!m.start || today >= m.start) && (!m.end || today <= m.end); });
}
function announceOne(m){
  var txt = esc(announceFill(ST.lang==='bn' ? (m.bn || m.text) : (m.text || m.bn)));
  return m.href ? '<a class="sb-ann-a" href="'+esc(m.href)+'">'+txt+'</a>' : txt;
}
function announceText(){
  if(ST.festive) return esc(ruleText('festive','short'));
  var ms = announceMsgs(); return ms.length ? announceOne(ms[0]) : '';
}
function announceBar(){
  var a = hdrData().announce || {}, ms = ST.festive ? [1] : announceMsgs();
  if(!ms.length) return '';
  var st = (a.bg ? 'background:'+esc(a.bg)+';' : '') + (a.fg ? 'color:'+esc(a.fg)+';' : '');
  var attr = st ? ' style="'+st+'"' : '';
  if(ST.festive || ms.length < 2) return '<div class="announce"'+attr+'>'+announceText()+'</div>';
  /* several messages: they take turns (96d-site-builder.js rotates them; reduced motion → no fade) */
  return '<div class="announce sb-ann"'+attr+' data-rot="'+(+a.rotate || 5)+'" aria-live="polite">'+ms.map(function(m, i){ return '<span class="sb-ann-i'+(i?'':' on')+'"'+(i?' aria-hidden="true"':'')+'>'+announceOne(m)+'</span>'; }).join('')+'</div>';
}
function storeHeader(cur){
  var n = bagCount(), acc = currentAccount();
  /* R15 wave 1 (H10): the desktop nav also marks the section a product, set
     or combo page belongs to (its category; Sets for combos and the builder) */
  var sec = cur.path;
  if(cur.page==='product' && cur.params && typeof P==='function'){ var pp = P(cur.params[0]); if(pp) sec = '/c/'+pp.cat; }
  else if(cur.page==='combo' || cur.page==='set' || /^ca-/.test(cur.page||'')) sec = '/set';
  else if(cur.page==='journal') sec = '/journal';   /* every journal page (and /bn/journal) marks Journal */
  /* Desktop A · D-001: combos (fixed sets and auto colour-pair pages) mark Combos, the builder marks Sets */
  if(DESK_NAV.fromData && DESK_NAV.combos && (cur.page==='combo' || /^ca-/.test(cur.page||''))) sec = '/combos';
  var nav = DESK_NAV.fromData ? deskNavHTML(sec) : NAV.map(function(x){ var here = sec===x[1].slice(1); return '<a class="'+(here?'on':'')+'" href="'+x[1]+'"'+(here?' aria-current="page"':'')+'>'+esc(t(x[0]))+'</a>'; }).join('');
  /* PR 598: the icons on the right come from the header data, in the owner's
     order; the bag cannot be switched off (it is how every order starts) */
  var icon = {
    whatsapp:function(){ return hdrWa(cur); },
    search:function(){ return '<button class="iconbtn" data-act="open-search" aria-label="Search" data-tip="'+esc(t('Search'))+'">'+ico('search',21)+'</button>'; },
    /* R15 · 3.4. The heart joins the phone header when there is room for it
       (HDR_WISH_PHONE; hdrFit() hides it on a phone too narrow to keep the
       logo clear). No account yet → the wishlist page shows what is saved on
       this phone and asks them to log in. */
    wish:function(){ return '<a class="iconbtn hdr-wish'+(HDR_WISH_PHONE?'':' hide-m')+'" href="#/account/wishlist" aria-label="Wishlist'+(ST.wishlist&&ST.wishlist.length?', '+ST.wishlist.length+' saved':'')+'" data-tip="'+esc(t('Wishlist'))+'">'+ico('heart',22)+(ST.wishlist&&ST.wishlist.length?'<span class="hdr-wish-dot" aria-hidden="true"></span>':'')+'</a>'; },
    account:function(){ return '<a class="iconbtn hide-m" href="'+(acc?'#/account':'#/login')+'" aria-label="Account" data-tip="'+esc(t(acc?'My account':'Log in'))+'">'+ico('user',21)+'</a>'; },
    /* R15 · 3.5. The bag: a size up, a firmer line, and while it holds
       something its count glows in the brand colour every few seconds. */
    bag:function(){ return '<a class="iconbtn hdr-bag'+(n?' has':'')+'" href="#/bag" aria-label="Bag, '+n+' items" data-tip="'+esc(t('Bag'))+'">'+ico('bag',25,'stroke-width="1.9"')+(n?'<span class="count-dot">'+n+'</span>':'')+'</a>'; }
  };
  var icons = '', seen = {};
  (hdrData().icons||[]).forEach(function(x){ if(!x || !icon[x.id] || seen[x.id]) return; seen[x.id] = 1; if(x.on !== false || x.id==='bag') icons += icon[x.id](); });
  if(!seen.bag) icons += icon.bag();
  var sD = hdrSlogan('desk'), sP = hdrSlogan('phone');
  return announceBar()+
  '<header class="hdr"><div class="container hdr-in">'+
    '<div class="row" style="gap:2px">'+
      '<button class="iconbtn hide-d" data-act="open-menu" aria-label="Menu">'+ico('menu',22)+'</button>'+
      '<a class="logo hide-m'+(sD?' sb-hasslog':'')+'" href="#/">'+sbLogo('desk')+sD+'</a>'+
    '</div>'+
    '<a class="logo hide-d'+(sP?' sb-hasslog':'')+'" href="#/">'+sbLogo('phone')+sP+'</a>'+
    '<nav class="nav-d" aria-label="Main">'+nav+'</nav>'+
    '<div class="row hdr-r" style="gap:2px">'+icons+
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
var HDR_WA_TIP = 'Need any help';   /* Desktop QA Q-009: the owner's exact words */
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
   The grid is still 5 equal columns, so the row fills the width exactly.
   PR 598: each mark is a switch in Site builder › Footer (all on = as before). */
/* PR 598 (owner 22:14): the payment marks are an ordered list the owner
   builds from a library (bKash, Nagad, Visa, Mastercard, COD, Rocket, AmEx,
   SSLCommerz, Upay, internet banking) or with an uploaded mark. The first five
   are the hand-drawn marks of r12.10, unchanged. */
var PAY_LIB = {
  bkash:{label:'bKash', svg:'<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="14" font-weight="800" fill="currentColor">bKash</text>'},
  nagad:{label:'Nagad', svg:'<defs><linearGradient id="extas-ngd" x1="0" y1="0" x2="1" y2="0">'+
    '<stop offset="0" stop-color="#FFA33C"/><stop offset="1" stop-color="#FF5A4E"/></linearGradient></defs>'+
    '<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="14" font-weight="800" fill="url(#extas-ngd)">Nagad</text>'},
  visa:{label:'Visa', svg:'<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="15" font-weight="800" font-style="italic" letter-spacing="0.6" fill="currentColor">VISA</text>'},
  /* the two circles are the Mastercard mark itself, so they keep their hexes */
  mc:{label:'Mastercard', svg:'<circle cx="24" cy="11" r="10.4" fill="#EB001B"/><circle cx="40" cy="11" r="10.4" fill="#F79E1B"/>'+
    '<path d="M32 4.3A10.4 10.4 0 0 1 32 17.7 10.4 10.4 0 0 1 32 4.3Z" fill="#FF5F00"/>'},
  /* COD is ours, not a brand, so it takes the band's own ink */
  cod:{label:'Cash on Delivery', svg:'<rect x="3.5" y="5.5" width="19" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>'+
    '<circle cx="13" cy="11" r="2.8" fill="currentColor"/>'+
    '<text x="44" y="16" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="13" font-weight="800" fill="currentColor">COD</text>'},
  rocket:{label:'Rocket', svg:'<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="14" font-weight="800" fill="currentColor">Rocket</text>'},
  amex:{label:'American Express', svg:'<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="13" font-weight="800" letter-spacing="0.5" fill="currentColor">AMEX</text>'},
  ssl:{label:'SSLCommerz', svg:'<text x="32" y="15.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="10.5" font-weight="800" fill="currentColor">SSLCOMMERZ</text>'},
  upay:{label:'Upay', svg:'<text x="32" y="16.5" text-anchor="middle" font-family="Archivo,Arial,sans-serif" font-size="14" font-weight="800" fill="currentColor">upay</text>'},
  bank:{label:'Internet banking', svg:'<path d="M20 9 32 3l12 6v2H20Z" fill="currentColor"/><path d="M22 12h3v6h-3Zm6 0h3v6h-3Zm6 0h3v6h-3Zm6 0h3v6h-3ZM20 19h24v2H20Z" fill="currentColor"/>'}
};
/* 14 + r12.10. Payment marks drawn by hand — no logo files, no network.
   The white slabs are gone: each mark now sits on a transparent tile tinted
   from the band's own colours, and the same light sweep that crosses the
   header mark and the primary buttons passes across the row (see r12-home.css).
   The grid is 5 equal columns for the default five, so the row fills the
   width exactly; another count gets its own column number (one or two rows). */
function ftrPayMarks(){
  /* Each tile carries its own class so r12-home.css can tint the glass behind
     it from that brand's colour and lift the mark to a shade that survives a
     dark band. Brand hexes stay inside the SVG; everything tuneable is CSS. */
  var wrap = function(cls, svg){ return '<span class="ftr-pay-t '+cls+'">'+svg+'</span>'; };
  var head = '<svg viewBox="0 0 64 22" preserveAspectRatio="xMidYMid meet" role="img" ';
  var list = (ftrData().pay || []).filter(function(x){ return x && x.on !== false && (PAY_LIB[x.id] || x.img); });
  if(!list.length) return '';
  var h = list.map(function(x){
    if(x.img) return wrap('pm-own', '<img src="'+esc(x.img)+'" alt="'+esc(x.label || '')+'">');
    var L = PAY_LIB[x.id]; return wrap('pm-'+x.id, head+'aria-label="'+esc(L.label)+'">'+L.svg+'</svg>');
  }).join('');
  var n = list.length, cols = n <= 5 ? n : Math.ceil(n / 2);
  return '<div class="ftr-pay'+(n !== 5 ? ' sb-pay-n' : '')+'"'+(n !== 5 ? ' style="--sb-pay:'+cols+'"' : '')+' aria-label="Payment methods we accept">'+h+'<i class="ftr-pay-sheen" aria-hidden="true"></i></div>';
}
/* social networks the owner can pick (or upload a custom icon) */
var SOC_SVG = function(p){ return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'; };
var SOC_LIB = {
  facebook:{label:'Facebook', icon:function(){ return ico('facebook',16); }},
  instagram:{label:'Instagram', icon:function(){ return ico('instagram',16); }},
  youtube:{label:'YouTube', icon:function(){ return ico('play',16); }},
  tiktok:{label:'TikTok', icon:function(){ return ico('spark',16); }},
  x:{label:'X', icon:function(){ return SOC_SVG('<path d="M4 4l16 16M20 4 4 20"/>'); }},
  linkedin:{label:'LinkedIn', icon:function(){ return SOC_SVG('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2.5 2.5 0 0 1 5 0v4M12 10v7"/>'); }},
  pinterest:{label:'Pinterest', icon:function(){ return SOC_SVG('<circle cx="12" cy="12" r="9"/><path d="M11 8.5c3-1 5 .8 4.6 3.2-.4 2.3-2.6 3.3-4 2.2M11.5 10 9 20"/>'); }},
  whatsapp:{label:'WhatsApp', icon:function(){ return waGlyph(16); }},
  messenger:{label:'Messenger', icon:function(){ return SOC_SVG('<path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.6c.9.3 1.8.4 2.7.4 5 0 9-3.7 9-8.3S17 3 12 3Z"/><path d="m7.5 13 3-3 2.5 2 3.5-3"/>'); }}
};
/* r12.9. The Shop column is no longer "every category we have" — it is six
   links the owner picks, so all three footer columns stand the same height.
   An entry is either a category id (the label and the garment icon are read
   from DB.categories, so a renamed or re-iconed category follows
   automatically) or an explicit [href, label, icon] for a link that is not a
   category. PR 598: this is now only the DEFAULT of Site builder › Footer,
   where the owner adds, renames and reorders columns and links. */
var FOOTER_SHOP = [
  ['#/c/new','New in','spark'],
  'polos',
  'tshirts',
  'shirts',
  'panjabi',
  ['#/set','Sets','layers']
];
/* =====================================================================
   DESKTOP BATCH A · D-020. THE DESKTOP FOOTER IS ITS OWN DESIGN (§58.2).
   At 1024 px and wider the brand / link / contact bands of the phone footer
   step aside and one clean band takes their place: the brand line on top,
   then four columns — Shop · Help · EXTAS · Join (newsletter, WhatsApp,
   Hotline, hours, payment marks). The promise strip above and the legal bar
   below are the same on both. FOOTER_DESK.on is the switch (off = the old
   stretched footer). Under 1024 px the band is display:none (hide-m), so the
   phone footer is exactly what it was.
   ===================================================================== */
var FOOTER_DESK = { on:true, combosLink:true };
/* PR 598 · the footer's data. Defaults = the footer as it was. */
function ftrDefault(){
  var shop = FOOTER_SHOP.map(function(x, i){ return typeof x === 'string' ? {id:'s'+i, cat:x, on:true} : {id:'s'+i, href:x[0], label:x[1], icon:x[2], on:true}; });
  shop.push({id:'combos', href:'#/combos', label:'Combos', icon:'tag', dev:'desk', on:true});
  var L = function(id, href, label, icon, act){ var o = {id:id, href:href, label:label, icon:icon, on:true}; if(act) o.act = act; return o; };
  return {
    promise:{on:true, items:[{id:'p1', icon:'swap', text:'Size exchange| in {windowHours} hours', on:true}, {id:'p2', icon:'cash', text:'Cash on| Delivery', on:true},
      {id:'p3', icon:'lock', text:'Secure| payment', on:true}, {id:'p4', icon:'shield', text:'100%| original', on:true}]},
    slogan:'', sloganBn:'',          /* empty = the shared slogan (Site builder › Header) */
    join:{on:true, label:'Get new drops first', ph:'Your phone number', btn:'Join', note:'Offers and new arrivals by SMS and WhatsApp. Stop anytime.', title:'Join'},
    cols:[
      {id:'shop', label:'Shop', on:true, links:shop},
      {id:'help', label:'Help', on:true, links:[L('h1','#/account/orders','Track my order','truck'), L('h2','#/size-guide','Size guide','ruler','size-guide'), L('h3','#/page/delivery','Delivery','box'),
        L('h4','#/page/exchange','Exchange & returns','swap'), L('h5','#/page/payment','Ways to pay','cash'), L('h6','#/page/faq','FAQ','info')]},
      {id:'extas', label:'EXTAS', on:true, links:[L('e1','#/page/story','Our story','doc'), L('e2','#/page/contact','Contact','phone'), L('e3','#/page/careers','Careers','user'),
        L('e4','#/journal','Journal','doc'), L('e5','#/page/privacy','Privacy','lock'), L('e6','#/page/terms','Terms','doc')]}
    ],
    contact:{wa:true, waLabel:'Text us on WhatsApp', hot:true, hotLabel:'Hotline', hours:true},
    /* ordered lists; an empty address uses the shop setting (Facebook … TikTok) or the shop's WhatsApp */
    social:[{id:'facebook', on:true, url:''}, {id:'instagram', on:true, url:''}, {id:'youtube', on:true, url:''}, {id:'tiktok', on:true, url:''}],
    pay:[{id:'bkash', on:true}, {id:'nagad', on:true}, {id:'visa', on:true}, {id:'mc', on:true}, {id:'cod', on:true}],
    copy:'© 2026 EXTAS', note:'Demo with sample data', ids:true
  };
}
function ftrData(){ return sbData('footer', ftrDefault()); }
/* social links: the owner's switch per network; an empty address uses the shop setting (SITE social) */
function ftrSocial(){
  var s = SITE('social') || {};
  return (ftrData().social || []).map(function(x){
    if(!x || x.on === false) return null;
    var L = SOC_LIB[x.id], url = String(x.url || s[x.id] || (x.id==='whatsapp' ? waLink('Hi EXTAS') : ''));
    if(!/^https?:\/\//.test(url)) return null;
    if(x.img) return {id:x.id, label:x.label || 'Link', url:url, html:'<img class="sb-socimg" src="'+esc(x.img)+'" alt="" width="16" height="16">'};
    if(!L) return null;
    return {id:x.id, label:x.label || L.label, url:url, html:L.icon()};
  }).filter(Boolean);
}
/* a text with the shop's numbers filled in ({windowHours}, {freeOver}); "|" is the phone-only line break */
function ftrFill(s){
  var v = {windowHours:SET('exchange','windowHours'), freeOver:SET('delivery','freeOver')};
  return esc(s).replace(/\|/g, '<br class="hide-d">').replace(/\{(\w+)\}/g, function(m, k){ return v.hasOwnProperty(k) ? esc(v[k]) : m; });
}
/* one footer link. desk: the desktop footer (its labels go through t()) */
function ftrItem(l, desk){
  if(!l || l.on === false) return '';
  if(l.dev === 'desk' && !desk) return ''; if(l.dev === 'phone' && desk) return '';
  if(l.id === 'combos' && desk && !(FOOTER_DESK.combosLink && DESK_NAV.combos)) return '';
  if(l.cat){
    var c = CAT(l.cat); if(!c || c.unlisted) return '';           /* a category that is gone or not listed just drops out */
    /* the icon comes from the category's own `garment` field via catIcon() */
    return '<a href="#/c/'+c.id+'"><span class="ftr-ic">'+catIcon(c.garment,15)+'</span><span>'+esc(sbLbl(l, c.name))+'</span></a>';
  }
  if(!l.href) return '';
  return '<a href="'+esc(l.href)+'"'+(l.act ? ' data-act="'+esc(l.act)+'"' : '')+'><span class="ftr-ic">'+ico(l.icon || 'right',15)+'</span><span>'+esc(sbLbl(l))+'</span></a>';
}
function ftrCols(desk){ return (ftrData().cols||[]).filter(function(c){ return c && c.on !== false && !(c.dev === 'desk' && !desk) && !(c.dev === 'phone' && desk); }); }
function ftrColLinks(col, desk){ return (col.links||[]).map(function(l){ return ftrItem(l, desk); }).join(''); }
function ftrColTitle(col, desk){ return (ST.lang==='bn' && col.bn) ? col.bn : (desk ? t(col.label || '') : (col.label || '')); }
/* kept for other files: the Shop / Help / EXTAS links (phone wording) */
function ftrShopLinks(){ var c = (ftrData().cols||[]).filter(function(x){ return x.id==='shop'; })[0]; return c ? ftrColLinks(c, false) : ''; }
function ftrHelpLinks(){ var c = (ftrData().cols||[]).filter(function(x){ return x.id==='help'; })[0]; return c ? ftrColLinks(c, false) : ''; }
function ftrExtasLinks(){ var c = (ftrData().cols||[]).filter(function(x){ return x.id==='extas'; })[0]; return c ? ftrColLinks(c, false) : ''; }
function ftrHoursLine(){ return esc(SITE('hours')||'')+(SITE('supportEmail') ? ' · <a href="mailto:'+esc(SITE('supportEmail'))+'">'+esc(SITE('supportEmail'))+'</a>' : ''); }
function ftrDesk(){
  if(!FOOTER_DESK.on) return '';
  var F = ftrData(), J = F.join || {}, K = F.contact || {}, cols = ftrCols(true);
  var soc = ftrSocial().length ? '<div class="ftr-d-soc">'+ftrSocial().map(function(x){
      return '<a href="'+esc(x.url)+'" target="_blank" rel="noopener" aria-label="'+esc(sbBrand())+' on '+esc(x.label)+'">'+x.html+'<span>'+esc(x.label)+'</span></a>'; }).join('')+'</div>' : '';
  var nCols = cols.length + (J.on !== false ? 1 : 0);
  return '<div class="ftr-s ftr-d hide-m" data-testid="ftr-desk"><div class="container">'+
    '<div class="ftr-d-top"><div class="ftr-d-brand"><div class="logo">'+sbLogo('footer')+'</div><div class="xs ftr-brand-sub">'+esc(sbSlogan('footer'))+'</div></div></div>'+
    '<div class="ftr-d-cols"'+(nCols !== 4 ? ' data-n="'+nCols+'"'+(J.on !== false ? ' data-join="1"' : '') : '')+'>'+
      cols.map(function(c){ return '<div class="ftr-d-col"><span class="ftr-h">'+esc(ftrColTitle(c, true))+'</span>'+ftrColLinks(c, true)+'</div>'; }).join('')+
      (J.on === false ? '' : '<div class="ftr-d-col ftr-d-join"><span class="ftr-h">'+esc(t(J.title || 'Join'))+'</span>'+
        '<form data-submit="join" class="ftr-d-form"><label class="ftr-d-lbl" for="join-d">'+esc(J.label||'')+'</label>'+
        '<div class="ftr-d-row"><input id="join-d" class="input" type="tel" inputmode="numeric" autocomplete="tel" pattern="[0-9+\\- ]*" placeholder="'+esc(J.ph||'')+'" aria-label="'+esc(J.ph||'')+'"><button class="btn ftr-joinbtn">'+esc(J.btn||'')+ico('right',17)+'</button></div>'+
        '<div class="xs ftr-d-note">'+esc(J.note||'')+'</div></form>'+
      '</div>')+
    '</div>'+
    /* owner 18:38: the contact block — left: social (top) + payment marks; right:
       WhatsApp (top) + Hotline, two equal buttons, one above the other */
    '<div class="ftr-d-contact">'+
      '<div class="ftr-d-cl">'+soc+ftrPayMarks().replace(/extas-ngd/g, 'extas-ngd-d')+'</div>'+
      '<div class="ftr-d-reach">'+
        (K.wa === false ? '' : '<a class="btn ftr-wa ftr-d-wa" href="'+waLink('Hi EXTAS')+'" target="_blank" rel="noopener">'+waGlyph(20)+'<span>'+esc(sbLbl({label:K.waLabel, bn:K.waBn}))+'</span></a>')+
        (K.hot === false ? '' : '<a class="btn ftr-hot ftr-d-hot" href="'+telLink()+'">'+ico('phone',18)+'<span>'+esc(sbLbl({label:K.hotLabel, bn:K.hotBn}))+' '+esc(hotlineNumber())+'</span></a>')+
        (K.hours === false ? '' : '<div class="xs ftr-d-hours">'+ftrHoursLine()+'</div>')+
      '</div>'+
    '</div>'+
    '</div></div>';
}
function storeFooter(){
  /* 9–13. The footer is built as five bands, each with its own colour mixed
     from the theme tokens, so it reads as one scheme instead of a black slab.
     Each band is its own full-width row (the colour reaches the screen edge)
     with a normal .container inside it. */
  var F = ftrData(), J = F.join || {}, K = F.contact || {}, cols = ftrCols(false);
  var pr = (F.promise && F.promise.on !== false) ? (F.promise.items||[]).filter(function(x){ return x && x.on !== false; }) : [];
  var soc = ftrSocial();
  return '<footer class="ftr'+(FOOTER_DESK.on?' ftr-hasd':'')+'">'+
    /* 9. promise strip — its own tone */
    (pr.length ? '<div class="ftr-s ftr-s1"><div class="container" style="padding:0"><div class="ftr-promise"'+(pr.length !== 4 ? ' style="--sb-pr:'+pr.length+'" data-n="'+pr.length+'"' : '')+'>'+
      pr.map(function(x){ return '<div>'+ico(x.icon || 'check',20)+'<span>'+ftrFill(sbLbl({label:x.text, bn:x.bn}, '', true))+'</span></div>'; }).join('')+
    '</div></div></div>' : '')+
    /* 10. brand block — second tone, down to the border above the columns */
    '<div class="ftr-s ftr-s2"><div class="container"><div class="ftr-brand">'+
      '<div class="ftr-brand-top"><div class="logo">'+sbLogo('footer')+'</div><div class="xs ftr-brand-sub">'+esc(sbSlogan('footer'))+'</div></div>'+
      (J.on === false ? '' : '<form data-submit="join" class="ftr-join"><label class="label" for="join">'+esc(J.label||'')+'</label>'+
      /* H8. A phone field must raise the number pad, not the letter keyboard.
         type=tel also lets the browser offer the saved number. */
      '<div class="row ftr-joinrow" style="gap:8px"><input id="join" class="input" type="tel" inputmode="numeric" autocomplete="tel" pattern="[0-9+\\- ]*" placeholder="'+esc(J.ph||'')+'" aria-label="'+esc(J.ph||'')+'"><button class="btn ftr-joinbtn">'+esc(J.btn||'')+ico('right',17)+'</button></div>'+
      '<div class="xs mt8 ftr-brand-note">'+esc(J.note||'')+'</div></form>')+
    '</div></div></div>'+
    /* 11. link columns stay on the base footer colour — 4. every link carries
       its icon; the columns and their links are the owner's (Site builder ›
       Footer), each category icon still derived from its `garment` field. */
    (cols.length ? '<div class="ftr-s ftr-s3"><div class="container"><div class="ftr-cols"'+(cols.length !== 3 ? ' data-n="'+cols.length+'"' : '')+'>'+
      cols.map(function(c){ return '<div><span class="ftr-h">'+esc(ftrColTitle(c, false))+'</span>'+ftrColLinks(c, false)+'</div>'; }).join('')+
    '</div></div></div>' : '')+
    /* 13. WhatsApp / hotline / hours / social / payment — fourth tone */
    '<div class="ftr-s ftr-s4"><div class="container"><div class="ftr-contact">'+
      '<div class="ftr-reach">'+
        (K.wa === false ? '' : '<a class="btn btn-block ftr-wa" href="'+waLink('Hi EXTAS')+'" target="_blank" rel="noopener">'+waGlyph(22)+'<span>'+esc(sbLbl({label:K.waLabel, bn:K.waBn}, '', true))+'</span></a>')+
        /* C3. the number itself comes from the one place it is set — see
           waNumber() / hotlineNumber() in 02-core.js */
        (K.hot === false ? '' : '<a class="btn btn-block ftr-hot" href="'+telLink()+'">'+ico('phone',19)+'<span>'+esc(sbLbl({label:K.hotLabel, bn:K.hotBn}, '', true))+' '+esc(hotlineNumber())+'</span></a>')+
        (K.hours === false ? '' : '<div class="xs center ftr-hours">'+ftrHoursLine()+'</div>')+
      '</div>'+
      /* R15 wave 1 (bug 6): the social links come from the shop settings
         (SITE('social')); one with no address is not shown, and with none set
         the whole row is left out — no link ever lands on Home. PR 598: each
         network also has the owner's on/off switch in Site builder › Footer. */
      (soc.length ? '<div class="ftr-soc">'+soc.map(function(x){
        return '<a href="'+esc(x.url)+'" target="_blank" rel="noopener" aria-label="'+esc(sbBrand())+' on '+esc(x.label)+'">'+x.html+'<span>'+esc(x.label)+'</span></a>';
      }).join('')+'</div>' : '')+
      ftrPayMarks()+
    '</div></div></div>'+
    ftrDesk()+
    '<div class="ftr-s ftr-s5"><div class="container ftr-legalbar"><div class="row between">'+
      '<span class="ftr-legal">'+esc(sbLbl({label:F.copy, bn:F.copyBn}, '', true))+(F.note ? '<span class="ftr-sep"> · </span>'+esc(sbLbl({label:F.note, bn:F.noteBn}, '', true)) : '')+
        (F.ids !== false && SITE('dbid') ? '<span class="ftr-sep"> · </span>DBID: '+esc(SITE('dbid')) : '')+
        (F.ids !== false && SITE('tradeLicence') ? '<span class="ftr-sep"> · </span>Trade licence: '+esc(SITE('tradeLicence')) : '')+'</span>'+
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
/* PR 598: the phone bottom bar is the owner's list (Site builder › Menus):
   items, order, icons, on/off. Account goes to Log in when nobody is logged in;
   the bag keeps its count. The builder allows 3–5 items (each ≥ 64 px wide on
   a 320 px phone, so every tap target stays well over 44 px). */
function bottomNav(cur){
  var n = bagCount(), acc = currentAccount();
  var items = (menuData().bottom||[]).filter(function(x){ return x && x.on !== false; });
  return '<nav class="bnav" aria-label="Bottom">'+items.map(function(x){
    var href = x.id==='account' ? (acc?'#/account':'#/login') : (x.href || '#/');
    var on = (cur.path===href.slice(1)) || (x.id==='account' && cur.page==='account') ? ' on' : ''; var bag = x.id==='bag';
    return '<a class="'+(on.trim()+(bag?' bn-bag'+(n?' has':''):'')).trim()+'" href="'+esc(href)+'" style="position:relative">'+ico(x.icon || 'grid',bag?23:21,bag?'stroke-width="1.9"':'')+'<span>'+esc(sbLbl(x))+'</span>'+(bag&&n?'<span class="count-dot" style="right:22%">'+n+'</span>':'')+'</a>';
  }).join('')+'</nav>';
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
/* PR 598 · THE PHONE MENU, from the same menu tree as the desktop nav (each
   item has its own phone switch), plus the quick row and the Help list.
   It replaces the menu 02-core.js drew (Blog QA U3's Journal row is now an
   item of the tree), with the same markup for the same items. */
function phoneMenuHTML(){
  var M = menuData();
  var row = function(href, label, icon, extra, cls){
    return '<a class="mn-row'+(cls?' '+cls:'')+'" href="'+esc(href)+'"'+(extra||'')+'>'+(icon?'<span class="mn-ic">'+ico(icon,18)+'</span>':'')+'<span class="grow">'+esc(label)+'</span>'+ico('right',16)+'</a>';
  };
  var raw = function(x, d){ return (ST.lang==='bn' && x.bn) ? x.bn : (x.label || d); };
  var subs = function(x){ return (x.cols||[]).map(function(c){ return (c.links||[]).filter(function(l){ return l && l.href && l.on !== false; }).map(function(l){ return row(l.href, raw(l, ''), '', '', 'mn-sub'); }).join(''); }).join(''); };
  var cats = '';
  menuItems().forEach(function(x){
    if(x.on === false || x.phone === false) return;
    if(x.kind==='new') cats += row('#/c/new', raw(x, 'New in'), 'sparkle');
    else if(x.kind==='cat'){ var c = CAT(x.cat); if(!c || c.hidden || !menuCatOk(c)) return; cats += row('#/c/'+c.id, (ST.lang==='bn' && x.bn) ? x.bn : t(x.label || c.name)); }
    else if(x.kind==='sets') cats += row(x.href || '#/set', (ST.lang==='bn' && x.bn) ? x.bn : (x.phoneLabel || x.label || 'Build your own set'));
    else if(x.kind==='setsPhone') cats += row(x.href || '#/combo/polo-duo', raw(x, 'Sets & combos'));
    else if(x.kind==='journal') cats += row(x.href || '#/journal', (ST.lang==='bn' && x.bn) ? x.bn : t(x.label || 'Journal'), x.icon || 'doc', ' data-testid="mn-journal"');
    else if(x.kind==='combos') cats += row(x.href || '#/combos', raw(x, 'Combos'), x.icon);
    else if(x.kind==='more') cats += row('#/c/new?all=1', raw(x, 'More'), x.icon);
    else if(x.kind==='link' && x.href) cats += row(x.href, raw(x, ''), x.icon);
    else return;
    cats += subs(x);
  });
  var Q = {
    search:'<button type="button" class="mn-q" data-act="open-search">'+ico('search',18)+'<span>Search</span></button>',
    bag:'<a class="mn-q" href="#/bag">'+ico('bag',18)+'<span>Bag</span></a>',
    wish:'<a class="mn-q" href="#/account/wishlist">'+ico('heart',18)+'<span>Wishlist</span></a>',
    account:'<a class="mn-q" href="#/account">'+ico('user',18)+'<span>Account</span></a>'
  };
  var qs = (M.quick||[]).filter(function(x){ return x && x.on !== false && Q[x.id]; }).map(function(x){ return Q[x.id]; }).join('');
  var quick = qs ? '<div class="mn-quick"'+((M.quick||[]).filter(function(x){ return x && x.on !== false && Q[x.id]; }).length !== 4 ? ' data-n="'+(M.quick||[]).filter(function(x){ return x && x.on !== false && Q[x.id]; }).length+'"' : '')+'>'+qs+'</div>' : '';
  var hl = (M.help||[]).filter(function(x){ return x && x.on !== false && x.href; });
  var help = hl.length ? '<div class="mn-h">'+esc((ST.lang==='bn' && M.helpTitleBn) ? M.helpTitleBn : (M.helpTitle || 'Help'))+'</div>' + hl.map(function(x){ return row(x.href, raw(x, ''), x.icon); }).join('') : '';
  var foot = '<div class="mn-foot">'
    + '<a class="btn btn-primary btn-block" href="'+waLink('Hi EXTAS')+'" target="_blank" rel="noopener">'+ico('chat',17)+'Message us on WhatsApp</a>'
    + '<a class="btn btn-block mt8" href="tel:'+esc(DB.hotline)+'">'+ico('phone',16)+'Hotline '+esc(DB.hotline)+'</a>'
    + '<div class="row between mt12" style="align-items:center"><span class="xs muted">10 am – 10 pm, every day</span>'
    + langPill() + '</div></div>';   /* r14: the switch shows its state (03-layout.js) */
  return quick+cats+help+foot;
}
ACT['open-menu'] = function(){ openModal(phoneMenuHTML(), {title:'Menu', flush:true}); };

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
  var el = document.querySelector('.demo-fab'); if(!el || window.innerWidth >= 1024 || el.classList.contains('demo-fab-tab') || el.classList.contains('demo-fab-adm') || el.style.top === 'auto') return;
  var hdr = document.querySelector('.hdr') || document.querySelector('.admin-top'); if(!hdr) return;
  var r = hdr.getBoundingClientRect(), size = el.offsetHeight || 42, top = Math.round(Math.max(6, r.top + (r.height - size) / 2));
  if(el.style.top !== top + 'px') el.style.top = top + 'px';
}
/* QA round (coordinator): on the ADMIN pages the demo gear sat on the "T" of
   the EXTAS mark (phone header) and on the last sidebar link (desktop). There
   it now tries a short list of places — beside the Admin tag, the sidebar's
   top corner, the window corners — and takes the first one with nothing
   tappable or written underneath (sampled with elementFromPoint, the gear
   hidden). It rides with the page (position:absolute), so it scrolls away
   with the header instead of covering what scrolls under it. Shop pages are
   untouched (the code below this branch is the same as before). */
function demoFabAdmin(el){
  var W = window.innerWidth, H = window.innerHeight, sz = 34, sy = window.scrollY || 0, cands = [];
  /* coordinator 19 Oct: on a phone the gear used to be placed by measuring
     the free gap once — a logo that widened later (web font arriving) could
     slide under it. The phone admin bar now keeps an empty 34 px slot in its
     own flow (.demo-slot, after the Admin tag), so nothing else can ever be
     laid out there; the gear sits exactly on the slot, re-read on every
     layout pass. Desktop keeps the search below (the slot is not shown). */
  var slot = W < 1024 ? document.querySelector('.admin-top .demo-slot') : null;
  if(slot && slot.getClientRects().length){
    var sr0 = slot.getBoundingClientRect(), sp = [sr0.left + (sr0.width - sz) / 2, sr0.top + (sr0.height - sz) / 2];
    el.classList.add('demo-fab-adm'); el.classList.remove('demo-fab-tab');
    el.style.setProperty('left', Math.round(sp[0]) + 'px', 'important'); el.style.setProperty('top', Math.round(sp[1] + sy) + 'px', 'important');
    el.style.setProperty('right', 'auto', 'important'); el.style.setProperty('bottom', 'auto', 'important'); el.style.setProperty('position', 'absolute', 'important');
    var pn = document.querySelector('.demo-panel');
    if(pn){ pn.style.setProperty('left', Math.round(Math.max(10, Math.min(sp[0], W - 330))) + 'px', 'important'); pn.style.setProperty('right', 'auto', 'important');
      pn.style.setProperty('top', Math.round(sp[1] + sz + 8) + 'px', 'important'); pn.style.setProperty('bottom', 'auto', 'important'); }
    return;
  }
  var at = document.querySelector('.admin-top');
  if(at && at.getClientRects().length){ var g = at.firstElementChild.getBoundingClientRect(), sh = at.lastElementChild.getBoundingClientRect(), ar = at.getBoundingClientRect();
    cands.push([g.right + 12, ar.top + (ar.height - sz) / 2]); cands.push([sh.left - sz - 12, ar.top + (ar.height - sz) / 2]); }
  var side = document.querySelector('.admin-side');
  if(side && side.getClientRects().length){ var sr = side.getBoundingClientRect(), hd = side.firstElementChild.getBoundingClientRect(); cands.push([sr.right - sz - 12, hd.top + (hd.height - sz) / 2]); }
  cands.push([W - sz - 14, 12], [W - sz - 14, H - sz - 14], [12, H - sz - 14]);
  var prev = el.style.display; el.style.display = 'none';
  var busy = function(x, y){
    for(var dx = 2; dx <= sz + 4; dx += 6) for(var dy = 2; dy <= sz; dy += 6){
      var e = document.elementFromPoint(x + dx, y + dy); if(!e) continue;
      if(e.closest('a,button,input,select,textarea,label,[data-act],.logo,.tag')) return true;
      for(var c = e.firstChild; c; c = c.nextSibling) if(c.nodeType === 3 && c.textContent.trim()) return true;
    }
    return false;
  };
  var pick = cands.filter(function(c){ return c[0] >= 4 && c[1] >= 4 && c[0] + sz <= W - 4 && !busy(c[0], c[1]); })[0] || cands[0];
  el.style.display = prev;
  el.classList.add('demo-fab-adm'); el.classList.remove('demo-fab-tab');
  ['left','top'].forEach(function(k, i){ el.style.setProperty(k, Math.round(pick[i] + (i ? sy : 0)) + 'px', 'important'); });
  el.style.setProperty('right', 'auto', 'important'); el.style.setProperty('bottom', 'auto', 'important'); el.style.setProperty('position', 'absolute', 'important');
  var panel = document.querySelector('.demo-panel');
  if(panel){ panel.style.setProperty('left', Math.round(Math.max(10, Math.min(pick[0], W - 330))) + 'px', 'important'); panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('top', Math.round(pick[1] < H / 2 ? pick[1] + sz + 8 : Math.max(10, pick[1] - 420)) + 'px', 'important'); panel.style.setProperty('bottom', 'auto', 'important'); }
}
function demoFabPark(){
  var el = document.querySelector('.demo-fab'); if(!el) return;
  if(document.querySelector('.admin')){ demoFabAdmin(el); return; }
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
/* PR 598 · owner 22:14. The header slogan under the phone wordmark. It is
   drawn out of the flow (it never widens the logo box), so this measures the
   free room beside the wordmark — from the menu button to the first icon,
   centred on the wordmark, 6 px clear each side — and steps down:
     level 0  the full slogan at its CSS size, easing down to 8 px
     level 1  the short slogan ("Made in Bangladesh"), the same way
     level 2  hidden (only when even the short one cannot fit)
   Nothing wraps, nothing overlaps the icons. Runs after hdrFit (the heart). */
function hdrSlogFit(){
  var sl = document.querySelector('.hdr .sb-slog-phone'); if(!sl) return;
  var a = sl.parentElement; if(!a || !a.getClientRects().length) return;
  var inn = a.parentElement, left = inn && inn.firstElementChild, right = inn && inn.querySelector('.hdr-r');
  var ar = a.getBoundingClientRect(), cx = (ar.left + ar.right) / 2;
  var lE = left && left !== a ? left.getBoundingClientRect().right : ar.left, rE = right ? right.getBoundingClientRect().left : ar.right;
  var room = Math.floor(2 * Math.min(cx - lE, rE - cx) - 12);
  sl.style.width = Math.max(0, room) + 'px'; sl.style.fontSize = ''; sl.setAttribute('data-l', '0');
  var max = parseFloat(getComputedStyle(sl).fontSize) || 9.5;
  var fits = function(){ var k = sl.querySelector(sl.getAttribute('data-l')==='1' ? '.sb-ss' : '.sb-sf'); return k && k.scrollWidth <= room + 0.5; };
  for(var lvl = 0; lvl < 2; lvl++){
    if(lvl === 1 && !sl.querySelector('.sb-ss')) break;
    sl.setAttribute('data-l', String(lvl));
    for(var f = max; f >= 8 - 0.001; f -= 0.25){ sl.style.fontSize = f.toFixed(2) + 'px'; if(fits()) return; }
    sl.style.fontSize = '';
  }
  sl.setAttribute('data-l', '2');
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
    try{ waFabFooter(); ckhWaTick(); if(f){ hdrFit(); hdrSlogFit(); ftrReachFit(); demoFabPark(); bottomBarPad(); } else demoFabTop(); }catch(e){ console.error(e); }
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
function layoutNow(){ try{ hdrFit(); hdrSlogFit(); ftrReachFit(); waFabFooter(); ckhWaTick(); demoFabPark(); bottomBarPad(); }catch(e){ console.error(e); } layoutTick(true); }
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
      '<span style="width:38px"></span><a class="logo" href="#/">'+sbLogo('phone')+'</a>'+
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
      '<a class="logo" href="#/">'+sbLogo('desk')+'</a></span>'+
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
    '<div style="min-width:0"><div class="admin-top"><span class="row"><span class="logo" style="color:#fff!important;font-size:16px">EXTAS</span><span class="tag" style="background:rgba(255,255,255,.12);color:#fff">Admin</span><span class="demo-slot" aria-hidden="true"></span></span><a href="#/" style="color:#fff;font-size:13px">Shop →</a></div>'+
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
    link('#/login?demo=1','Log in as a returning customer')+link('#/exchange/EX-1038','Exchange a delivered order')+
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

PAGES.notfound = {title:'Page not found', render:function(){ return '<div class="container empty"><h1 class="h1">'+esc(t('Page not found'))+'</h1><p class="muted mt12">This demo page does not exist.</p><a class="btn btn-primary mt16" href="#/">'+esc(t('Go to home'))+'</a>'+nf_desk()+'</div>'; }};
/* Desktop A · D-019: on a desktop the 404 helps the shopper recover — a search
   box, the categories, four bestsellers and the WhatsApp line. All of it is
   hide-m, so the phone 404 is exactly what it was. Counts and names are read
   from the data, nothing typed here. */
function nf_desk(){
  if(!deskOn()) return '';
  var cats = deskNavCats().live.map(function(c){ return '<a class="chip" href="#/c/'+c.id+'">'+esc(t(c.name))+'</a>'; }).join('') +
    (DESK_NAV.combos ? '<a class="chip" href="#/combos">'+esc(t('Combos'))+'</a>' : '');
  var best = DB.products.filter(function(p){ return !(CAT(p.cat)||{}).hidden; }).slice().sort(function(a,b){ return b.reviews-a.reviews; }).slice(0,4);
  return '<div class="nf-d hide-m">'+
    '<form class="nf-search" data-submit="search" role="search"><label class="sr" for="nf-q">Search products</label><input id="nf-q" name="q" class="input" placeholder="Search polos, panjabi, hoodies…" autocomplete="off"><button class="btn btn-primary">'+ico('search',17)+'<span>Search</span></button></form>'+
    '<div class="nf-cats">'+cats+'</div>'+
    '<div class="sec-hd nf-hd"><h2 class="h2">Popular right now</h2><a class="hm-more" href="#/c/new">Shop all'+ico('right',14)+'</a></div>'+
    '<div class="grid g4">'+best.map(function(p){ return productCard(p); }).join('')+'</div>'+
    '<p class="small text2 nf-wa">Looking for something specific? '+waButton('Ask us on WhatsApp', 'Hi EXTAS, I could not find a page on your site')+'</p>'+
  '</div>';
}
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
/* coordinator 19 Oct (sale badge race): a fitted box's verdict ("shrink",
   "collapse" — e.g. a card's −16% badge hidden by fit-x) was only re-checked
   on a re-render, a resize or a web font arriving. If the box the text sits
   in changed width after that (a late style, a row settling), the old verdict
   stayed — a badge could stay hidden on a card that had room for it. Now the
   box each fitted element measures against (its offsetParent, else its
   parent) is watched, and a real change of its width fits the page again.
   The width recorded after each pass guards against a loop: a pass that
   lands on the same sizes does not trigger another. */
var FIT_RO = (window.ResizeObserver ? new ResizeObserver(function(ents){
  for(var i = 0; i < ents.length; i++){ var e = ents[i].target, w = Math.round(ents[i].contentRect.width * 2) / 2;
    if(e._fitW !== undefined && Math.abs(e._fitW - w) > 0.5){ fitSoon(); return; } }
}) : null);
function fitWatch(items){
  if(!FIT_RO) return;
  items.forEach(function(it){ var b = it.el.offsetParent || it.el.parentElement; if(!b) return;
    var w = Math.round(b.getBoundingClientRect().width * 2) / 2; if(b._fitW === undefined){ b._fitW = w; FIT_RO.observe(b); } else b._fitW = w; });
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
  fitWatch(items);
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

/* PR 598: the mega panel follows the menu data (owner's columns, featured
   tile, menu label, unlisted sub-categories) — megaCatHTML lives in
   97-desk-a.js; every file is one script, so it is defined here already. */
(function(){ try{ if(typeof megaCatHTML==='function' && !megaCatHTML._sb) megaCatHTML = menuMegaWrap(megaCatHTML); }catch(e){} })();
