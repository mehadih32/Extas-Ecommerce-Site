/* ================= EXTAS demo — desktop Batch A behaviour (97-desk-a.js) =================
   Shilpi (A360-05) with Sawdagor (A360-04) · review/DESKTOP-REVIEW.md, findings D-001…D-026.
   Everything in this file is DESKTOP ONLY: it does nothing unless the screen is
   1024 px or wider, and the hover parts also need a real mouse
   ((hover:hover) and (pointer:fine) + pointerType 'mouse' — a phone tap fires
   mouseenter with no mouseleave, lessons/ALL.md). The phone never runs it.
     1. the page redraws when the screen crosses 1024 px (desktop-only markup)
     2. D-001 nav fit: categories that do not fit fold into "More" (measured)
     3. D-001 mega menu: hover intent 150 ms / 250 ms grace, click, keyboard
     4. D-013 product cards: back view on hover + quick add by size
     5. D-004 hero slider: only slides you can see take keyboard focus,
        focus pauses the glide
   Styles: r12-zzdesk-a.css.
   ================================================================================= */
var DESK_A = { megaEnter:150, megaLeave:250, quickAdd:true, altView:true };
var DESK_MQ = window.matchMedia ? window.matchMedia('(min-width:1024px)') : {matches:false};
var DESK_HOVER = window.matchMedia ? window.matchMedia('(hover:hover) and (pointer:fine)') : {matches:false};

/* ---------- 1. crossing 1024 px redraws (desktop-only markup is chosen at render) ---------- */
(function(){
  var on = function(){ try{ megaClose(true); if(typeof dsk_srchClose==='function') dsk_srchClose(false); }catch(e){} if(typeof rerender==='function' && typeof CUR!=='undefined' && CUR && CUR.page) rerender(); };
  if(DESK_MQ.addEventListener) DESK_MQ.addEventListener('change', on); else if(DESK_MQ.addListener) DESK_MQ.addListener(on);
})();

/* after every render (the router replaces #app's children) */
(function(){
  var app = document.getElementById('app');
  if(app && window.MutationObserver) new MutationObserver(function(){ try{ deskAfter(); }catch(e){ console.error(e); } }).observe(app, {childList:true});
  window.addEventListener('resize', function(){ if(DESK_MQ.matches) requestAnimationFrame(deskNavFit); });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if(DESK_MQ.matches) deskNavFit(); });
})();
function deskAfter(){
  MEGA.open = null; MEGA.panel = null; clearTimeout(MEGA.t);
  if(!DESK_MQ.matches) return;
  deskNavFit();
  deskHeroKeys();
  deskHeroFade();
  deskGutters();
}
/* owner 18:38 · the hero slider's edge: fade width and the optional panel wash.
   HERO_FADE is the setting; ?herofade=80|140 and ?herowash=1 preview the variants. */
var HERO_FADE = { width:140, wash:false };
function deskHeroFade(){
  var h = document.querySelector('.hm-hero'); if(!h) return;
  var q = (typeof CUR!=='undefined' && CUR.query) || {};
  var w = q.herofade || HERO_FADE.width, wash = q.herowash ? q.herowash === '1' : HERO_FADE.wash;
  h.setAttribute('data-fade', String(w)); if(wash) h.setAttribute('data-wash', '1'); else h.removeAttribute('data-wash');
}
/* PR 595/596 gutters: their height follows the page body (main) */
function deskGutters(){
  var g = document.querySelector('.lb-gutters'), m = document.getElementById('main'); if(!g || !m) return;
  /* --lb-h: page height · --lb-gutter: usable width of each side gutter (px) */
  var set = function(){ g.style.setProperty('--lb-h', m.offsetHeight + 'px'); var l = document.getElementById('lb-side-l'); g.style.setProperty('--lb-gutter', (l ? Math.round(l.getBoundingClientRect().width) : 0) + 'px'); };
  set(); if(window.ResizeObserver && !m._lbRO){ m._lbRO = new ResizeObserver(function(){ var g2 = document.querySelector('.lb-gutters'); if(g2) g2.style.setProperty('--lb-h', m.offsetHeight + 'px'); }); m._lbRO.observe(m); }
}

/* ---------- 2. D-001 · the nav row steps down: last categories fold into More ---------- */
function deskNavFit(){
  var nav = document.querySelector('.hdr .nav-d'); if(!nav || !nav.getClientRects().length) return;
  var inn = nav.parentElement, logo = inn.querySelector('.logo.hide-m'), right = inn.querySelector('.hdr-r'), more = nav.querySelector('.nav-more');
  /* H4: items the owner's arrangement keeps under More (data-fixfold) stay folded */
  /* Note 54 #16 (round 2): in "main categories + More" the first N always stay; the rest come back into
     the row while there is real room (with clear air), and fold into More again when there is not */
  var cm = nav.getAttribute('data-layout') === 'catsMore';
  var items = [].slice.call(nav.querySelectorAll(cm ? '.nav-i[data-fold]' : '.nav-i[data-fold]:not([data-fixfold])'));
  items.forEach(function(i){ i.classList.remove('nav-folded'); });
  if(cm){ var keep = nav.querySelectorAll('.nav-i[data-fold]:not([data-fixfold])').length; items = items.slice(keep); }
  var base = (typeof deskNavCats==='function' ? deskNavCats().more.length : 0) + (cm ? 0 : nav.querySelectorAll('.nav-i[data-fixfold]').length);
  if(more) more.hidden = !base;
  /* H4 'priority' (priority-plus): the row keeps clear air beside the logo and the icons */
  var air = nav.getAttribute('data-layout') === 'priority' ? 44 : (cm ? 28 : 14);
  var over = function(){
    var n = nav.getBoundingClientRect(), r = right ? right.getBoundingClientRect() : null, l = logo ? logo.getBoundingClientRect() : null, ib = inn.getBoundingClientRect();
    var pr = parseFloat(getComputedStyle(inn).paddingRight) || 0;
    return (r && n.right > r.left - air) || (l && n.left < l.right + air) || (r && r.right > ib.right - pr + 1) || nav.scrollWidth > nav.clientWidth + 1;
  };
  for(var k = items.length - 1; k >= 0 && over(); k--){ items[k].classList.add('nav-folded'); if(more) more.hidden = false; }
}

/* ---------- 3. D-001 · the mega menu ---------- */
var MEGA = {open:null, panel:null, t:0, by:''};
function megaItems(){ return [].slice.call(document.querySelectorAll('.hdr .nav-d .nav-i')).filter(function(a){ return !a.hidden && !a.classList.contains('nav-folded'); }); }
function megaLink(href, label, extra, cls){ return '<a class="mega-a'+(cls?' '+cls:'')+'" href="'+href+'">'+'<span>'+esc(label)+'</span>'+(extra?'<span class="mega-n">'+extra+'</span>':'')+'</a>'; }
function megaFeatured(catId){
  if(!DESK_NAV.featured) return '';
  var tiles = typeof cat_fillTiles==='function' ? cat_fillTiles(catId || 'new', 1, []) : [];
  return tiles.length ? '<div class="mega-feat">'+tiles[0]+'</div>' : '';
}
function megaCatHTML(id){
  var c = CAT(id); if(!c) return '';
  var ps = productsIn(id), cols = [];
  /* 1 · shop: everything, then the sub-category tree (DB.subcats) */
  var subs = (DB.subcats||[]).filter(function(s){ return s.parent===id; }), tree = '';
  subs.forEach(function(s){
    var n = ps.filter(function(p){ return typeof ca_inPath==='function' && ca_inPath(p, s.id); }).length;
    tree += megaLink('#/c/'+id+'?sub='+encodeURIComponent(s.id), s.name, n || '');
    (DB.subcats||[]).filter(function(x){ return x.parent===s.id; }).forEach(function(x){
      var m = ps.filter(function(p){ return typeof ca_inPath==='function' && ca_inPath(p, x.id); }).length;
      tree += megaLink('#/c/'+id+'?sub='+encodeURIComponent(x.id), x.name, m || '', 'mega-sub2');
    });
  });
  cols.push('<div class="mega-col"><div class="mega-h">'+esc(t('Shop'))+' '+esc(t(c.name))+'</div>'+megaLink('#/c/'+id, t('All')+' '+t(c.name), ps.length, 'mega-all')+tree+'</div>');
  /* 2 · fit, read from the products (only when there is a choice) */
  var fits = []; ps.forEach(function(p){ if(p.fit && fits.indexOf(p.fit)<0) fits.push(p.fit); });
  if(fits.length > 1) cols.push('<div class="mega-col"><div class="mega-h">'+esc(t('Shop by fit'))+'</div>'+fits.map(function(f){
    return '<a class="mega-a" href="#/c/'+id+'" data-act="desk-fit" data-cat="'+esc(id)+'" data-v="'+esc(f)+'"><span>'+esc(f)+'</span><span class="mega-n">'+ps.filter(function(p){ return p.fit===f; }).length+'</span></a>'; }).join('')+'</div>');
  /* 3 · popular: the best-reviewed styles */
  var pop = ps.slice().sort(function(a, b){ return (b.reviews||0)-(a.reviews||0); }).slice(0, 4);
  cols.push('<div class="mega-col"><div class="mega-h">'+esc(t('Popular'))+'</div>'+pop.map(function(p){ return megaLink('#/p/'+p.id, p.name, fmt(p.price)); }).join('')+'</div>');
  return '<div class="mega-cols n'+cols.length+'">'+cols.join('')+'</div>'+megaFeatured(id);
}
function megaNewHTML(){
  var list = typeof cat_base==='function' ? cat_base('new') : DB.products.slice();
  var isNew = function(p){ return p.tag==='New' || p.tag==='Winter 2026'; };
  var cats = deskNavCats().live.map(function(c){ var n = list.filter(function(p){ return p.cat===c.id && isNew(p); }).length; return n ? megaLink('#/c/'+c.id, t(c.name), n) : ''; }).join('');
  var cols = ['<div class="mega-col"><div class="mega-h">'+esc(t('New in'))+'</div>'+megaLink('#/c/new', t('All new in'), list.length, 'mega-all')+cats+'</div>',
    '<div class="mega-col"><div class="mega-h">'+esc(t('Just landed'))+'</div>'+list.filter(isNew).slice(0, 5).map(function(p){ return megaLink('#/p/'+p.id, p.name, fmt(p.price)); }).join('')+'</div>'];
  return '<div class="mega-cols n2">'+cols.join('')+'</div>'+megaFeatured('new');
}
function megaCombosHTML(){
  var cols = [];
  var rules = typeof ca_activeRules==='function' ? ca_activeRules().filter(function(r){ try{ return ca_generate(r).visible.length; }catch(e){ return false; } }) : [];
  if(rules.length) cols.push('<div class="mega-col"><div class="mega-h">'+esc(t('Colour-pair combos'))+'</div>'+rules.map(function(r){ return megaLink('#/combos/'+r.id, r.name, r.pieces+' pcs'); }).join('')+'</div>');
  var sets = combos().filter(function(c){ return c.active; });
  if(sets.length) cols.push('<div class="mega-col"><div class="mega-h">'+esc(t('Ready-made sets'))+'</div>'+sets.slice(0, 8).map(function(c){ return megaLink('#/combo/'+c.id, c.name, fmt(c.price)); }).join('')+'</div>');
  var sr = setRules().filter(function(r){ return r.active; });
  cols.push('<div class="mega-col"><div class="mega-h">'+esc(t('Build your own set'))+'</div>'+megaLink('#/set', t('Build your own set'), '', 'mega-all')+sr.map(function(r){ return megaLink('#/set/'+r.id, r.name, ''); }).join('')+
    megaLink('#/combos', t('All combos'), '', 'mega-all')+'</div>');
  return '<div class="mega-cols n'+cols.length+'">'+cols.join('')+'</div>'+megaFeatured('new');
}
function megaMoreIds(){
  var nav = document.querySelector('.hdr .nav-d');
  var folded = nav ? [].slice.call(nav.querySelectorAll('.nav-i.nav-folded')).map(function(a){ return a.getAttribute('data-nav'); }) : [];
  return folded.concat(deskNavCats().more.map(function(c){ return c.id; }));
}
/* H4 'shop' arrangement: the categories behind the one "Shop" item */
function megaShopIds(item){ var x = (deskNavItems()||[]).filter(function(y){ return y.id==='shop'; })[0]; return x ? (x.shopCats||[]) : []; }
function megaMoreHTML(list){
  var ids = list || megaMoreIds();
  var tiles = ids.map(function(id){ var c = CAT(id); if(!c) return ''; var ps = productsIn(id), p = ps[0];
    return '<a class="mega-tile" href="#/c/'+id+'">'+(p ? productImg(p, p.colors[0], {label:false, ratio:'ratio-11'}) : '')+'<span class="mega-tile-n">'+esc(t(c.name))+'</span><span class="mega-n">'+plural(ps.length, 'style')+'</span></a>'; }).join('');
  return '<div class="mega-tiles">'+tiles+'</div>';
}
/* =====================================================================
   H6 (owner 20 Oct: "the mega menu covers the whole screen") · THE COMPACT
   DROPDOWN. Default style 'drop' (Site builder › Menus › "Desktop menu
   style"; 'panel' = the old full-width panel, ?mega=panel previews it).
   A small list opens right under the hovered item with its sub-categories;
   resting on a sub-category that has its own children opens them in a
   flyout to the side. References studied: Amazon's category flyout and its
   "menu aim" (the pointer may cross other rows on its way into an open
   flyout without switching it — Ben Kamens / Smashing Magazine "safe
   triangles"), and Baymard's drop-down menu benchmark (Marks & Spencer).
   Timing stays the panel's: open 150 ms after the mouse settles, close
   250 ms after it leaves item + list, switch at once between items, Esc
   closes and puts focus back on the item, keyboard ←/→ in and out of a
   flyout, ↑/↓ inside a list.
   ===================================================================== */
function megaStyle(){
  var q = (typeof CUR!=='undefined' && CUR.query && CUR.query.mega) || '';
  if(q === 'panel' || q === 'drop') return q;
  var m = (typeof menuData==='function') ? menuData() : {};
  return m.megaStyle === 'panel' ? 'panel' : 'drop';
}
var MD_CHEV = '<svg class="md-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
function mdRow(href, label, n, o){
  o = o || {};
  return '<a class="mega-a md-row'+(o.cls ? ' '+o.cls : '')+'" href="'+esc(href)+'"'+(o.fly != null ? ' data-fly="'+o.fly+'" aria-haspopup="true" aria-expanded="false"' : '')+(o.attrs || '')+'>'+
    '<span>'+esc(label)+'</span>'+(n !== '' && n != null ? '<span class="mega-n">'+n+'</span>' : '')+(o.fly != null ? MD_CHEV : '')+'</a>';
}
function mdSubs(parent){ return (DB.subcats||[]).filter(function(s){ return s.parent===parent && !s.unlisted; }); }
function mdCount(ps, sid){ return ps.filter(function(p){ return typeof ca_inPath==='function' && ca_inPath(p, sid); }).length; }
/* one category as a list: All · its sub-categories (a sub-category with children opens a flyout) · fits */
function mdCatList(id, flies, opts){
  opts = opts || {};
  var c = CAT(id); if(!c) return '';
  var x = typeof menuItem==='function' ? menuItem(id) : null, name = (x && ((ST.lang==='bn' && x.bn) || x.label)) || t(c.name);
  var ps = productsIn(id), out = '', replace = x && x.colsMode === 'replace' && (x.cols||[]).length;
  out += mdRow('#/c/'+id, t('All')+' '+name, ps.length, {cls:'mega-all'});
  if(!replace){
    mdSubs(id).forEach(function(s){
      var kids = mdSubs(s.id), k = null;
      if(kids.length && flies){
        k = flies.length;
        flies.push(mdRow('#/c/'+id+'?sub='+encodeURIComponent(s.id), t('All')+' '+s.name, mdCount(ps, s.id), {cls:'mega-all'})+
          kids.map(function(kd){ return mdRow('#/c/'+id+'?sub='+encodeURIComponent(kd.id), kd.name, mdCount(ps, kd.id) || ''); }).join(''));
      }
      out += mdRow('#/c/'+id+'?sub='+encodeURIComponent(s.id), s.name, mdCount(ps, s.id) || '', {fly:k});
      if(kids.length && !flies) kids.forEach(function(kd){ out += mdRow('#/c/'+id+'?sub='+encodeURIComponent(kd.id), kd.name, mdCount(ps, kd.id) || '', {cls:'mega-sub2'}); });
    });
    var fits = []; ps.forEach(function(p){ if(p.fit && fits.indexOf(p.fit)<0) fits.push(p.fit); });
    if(fits.length > 1 && opts.fits !== false) out += '<div class="md-sep" role="separator"></div><div class="md-h">'+esc(t('Shop by fit'))+'</div>'+fits.map(function(f){
      return mdRow('#/c/'+id, f, ps.filter(function(p){ return p.fit===f; }).length, {attrs:' data-act="desk-fit" data-cat="'+esc(id)+'" data-v="'+esc(f)+'"'}); }).join('');
  }
  /* the owner's own columns (Site builder › Menus › Columns) follow as small groups */
  if(x && (x.cols||[]).length) (x.cols||[]).forEach(function(col){
    var ls = (col.links||[]).filter(function(l){ return l && l.href && l.on !== false && !l.removed; }); if(!ls.length) return;
    out += '<div class="md-sep" role="separator"></div>'+(col.label ? '<div class="md-h">'+esc(sbLbl(col, '', true))+'</div>' : '')+ls.map(function(l){ return mdRow(l.href, sbLbl(l, '', true), ''); }).join('');
  });
  return out;
}
function megaDropHTML(kind, item, flies){
  var id = item.getAttribute('data-nav');
  if(kind === 'cat'){
    var c = CAT(id);
    if(c) return mdCatList(id, flies);
    var x = typeof menuItem==='function' ? menuItem(id) : null, own = '';     /* Sets / Journal / an own link with the owner's columns */
    if(x) (x.cols||[]).forEach(function(col){ var ls = (col.links||[]).filter(function(l){ return l && l.href && l.on !== false && !l.removed; }); if(!ls.length) return;
      own += (own ? '<div class="md-sep" role="separator"></div>' : '')+(col.label ? '<div class="md-h">'+esc(sbLbl(col, '', true))+'</div>' : '')+ls.map(function(l){ return mdRow(l.href, sbLbl(l, '', true), ''); }).join(''); });
    return mdRow(item.getAttribute('href') || '#/', item.textContent.trim(), '', {cls:'mega-all'})+own;
  }
  if(kind === 'new'){
    var list = typeof cat_base==='function' ? cat_base('new') : DB.products.slice();
    var isNew = function(p){ return p.tag==='New' || p.tag==='Winter 2026'; };
    return mdRow('#/c/new', t('All new in'), list.length, {cls:'mega-all'})+deskNavCats().live.map(function(c){
      var n = list.filter(function(p){ return p.cat===c.id && isNew(p); }).length; return n ? mdRow('#/c/'+c.id, t(c.name), n) : ''; }).join('');
  }
  if(kind === 'combos'){
    var out = '', rules = typeof ca_activeRules==='function' ? ca_activeRules().filter(function(r){ try{ return ca_generate(r).visible.length; }catch(e){ return false; } }) : [];
    var add = function(label, href, rows){ if(!rows) { out += mdRow(href, label, ''); return; } var k = flies.length; flies.push(rows); out += mdRow(href, label, '', {fly:k}); };
    if(rules.length) add(t('Colour-pair combos'), '#/combos', rules.map(function(r){ return mdRow('#/combos/'+r.id, r.name, r.pieces+' pcs'); }).join(''));
    var sets = combos().filter(function(c){ return c.active; });
    if(sets.length) add(t('Ready-made sets'), '#/combos', sets.slice(0, 10).map(function(c){ return mdRow('#/combo/'+c.id, c.name, fmt(c.price)); }).join(''));
    var sr = setRules().filter(function(r){ return r.active; });
    add(t('Build your own set'), '#/set', mdRow('#/set', t('Build your own set'), '', {cls:'mega-all'})+sr.map(function(r){ return mdRow('#/set/'+r.id, r.name, ''); }).join(''));
    return out+'<div class="md-sep" role="separator"></div>'+mdRow('#/combos', t('All combos'), '', {cls:'mega-all'});
  }
  /* more / shop: every category of the list, each opening its own list in a flyout */
  var ids = kind === 'shop' ? megaShopIds(item) : megaMoreIds();
  return ids.map(function(cid){
    var c = CAT(cid); if(!c) return '';
    /* a flyout only when it has something to choose (sub-categories or more than one fit) */
    var fits = {}; productsIn(cid).forEach(function(p){ if(p.fit) fits[p.fit] = 1; });
    var k = null; if(mdSubs(cid).length || Object.keys(fits).length > 1){ k = flies.length; flies.push(mdCatList(cid, null, {fits:true})); }
    return mdRow('#/c/'+cid, t(c.name), plural(productsIn(cid).length, 'style'), {fly:k});
  }).join('')+(kind === 'shop' ? '<div class="md-sep" role="separator"></div>'+mdRow('#/c/new?all=1', t('All styles'), '', {cls:'mega-all'}) : '');
}
function megaDropOpen(item, kind, p){
  var flies = [];
  p.innerHTML = '<div class="md-list" role="menu" aria-label="'+esc(item.textContent.trim())+'">'+megaDropHTML(kind, item, flies)+'</div><div class="md-fly" hidden></div>';
  p.classList.add('mega-drop');
  MEGA.flies = flies; MEGA.fly = null; MEGA.flyT = 0;
  /* under the item, kept inside the screen */
  var hdr = p.parentElement, hr = hdr.getBoundingClientRect(), ir = item.getBoundingClientRect();
  p.style.left = '0px';
  var w = p.offsetWidth || 260, left = ir.left - hr.left - 14;
  left = Math.max(12, Math.min(left, hr.width - w - 12));
  p.style.left = Math.round(left)+'px';
}
/* the flyout beside a row */
function mdFlyOpen(row){
  var p = document.getElementById('mega-panel'); if(!p || !row) return;
  var k = +row.getAttribute('data-fly'), fly = p.querySelector('.md-fly'); if(!fly || !MEGA.flies || MEGA.flies[k] == null) return;
  if(MEGA.fly === row) return;
  if(MEGA.fly) MEGA.fly.setAttribute('aria-expanded', 'false'), MEGA.fly.classList.remove('md-on');
  fly.innerHTML = MEGA.flies[k]; fly.hidden = false;
  fly.setAttribute('role', 'menu'); fly.setAttribute('aria-label', row.textContent.trim());
  var list = p.querySelector('.md-list');
  /* beside the row; on the left when there is no room on the right */
  fly.classList.remove('md-left');
  var top = row.offsetTop - 8; fly.style.top = Math.max(0, top)+'px';
  var pr = p.getBoundingClientRect();
  if(pr.right + fly.offsetWidth > window.innerWidth - 8) fly.classList.add('md-left');
  /* keep it on screen vertically */
  var fr = fly.getBoundingClientRect(), over = fr.bottom - (window.innerHeight - 8);
  if(over > 0) fly.style.top = Math.max(0, top - over)+'px';
  row.setAttribute('aria-expanded', 'true'); row.classList.add('md-on');
  MEGA.fly = row;
  void list;
}
function mdFlyClose(){
  var p = document.getElementById('mega-panel'), fly = p && p.querySelector('.md-fly');
  if(fly){ fly.hidden = true; fly.innerHTML = ''; }
  if(MEGA.fly){ MEGA.fly.setAttribute('aria-expanded', 'false'); MEGA.fly.classList.remove('md-on'); }
  MEGA.fly = null;
}
/* menu aim: is the pointer travelling from where it was toward the open flyout? */
var MD_AIM = {x:0, y:0, px:0, py:0};
function mdAiming(){
  var p = document.getElementById('mega-panel'), fly = p && p.querySelector('.md-fly');
  if(!fly || fly.hidden) return false;
  var r = fly.getBoundingClientRect(), left = fly.classList.contains('md-left');
  var ex = left ? r.right : r.left, a = {x:MD_AIM.px, y:MD_AIM.py}, b = {x:MD_AIM.x, y:MD_AIM.y};
  if(left ? b.x >= a.x : b.x <= a.x) return false;
  var slope = function(p1, p2){ return (p2.y - p1.y) / ((p2.x - p1.x) || 0.0001); };
  var up = {x:ex, y:r.top - 20}, dn = {x:ex, y:r.bottom + 20};
  var s1 = slope(b, up), s2 = slope(b, dn), p1 = slope(a, up), p2 = slope(a, dn);
  return left ? (s1 > p1 && s2 < p2) : (s1 < p1 && s2 > p2);
}
(function(){
  document.addEventListener('pointermove', function(ev){
    if(ev.pointerType !== 'mouse' || !MEGA.open) return;
    MD_AIM.px = MD_AIM.x; MD_AIM.py = MD_AIM.y; MD_AIM.x = ev.clientX; MD_AIM.y = ev.clientY;
  }, {passive:true});
  var decide = function(row){
    clearTimeout(MEGA.flyT);
    var go = function(){ if(!document.getElementById('mega-panel')) return; if(row && row.hasAttribute('data-fly')) mdFlyOpen(row); else mdFlyClose(); };
    if(MEGA.fly && mdAiming()){ MEGA.flyT = setTimeout(function(){ decide(row); }, 220); return; }   /* on the way into the flyout: wait, then look again */
    if(!MEGA.fly && row && row.hasAttribute('data-fly')){ MEGA.flyT = setTimeout(go, 90); return; }  /* a little intent before the first flyout */
    go();
  };
  document.addEventListener('pointerover', function(ev){
    if(ev.pointerType !== 'mouse' || !MEGA.open || !DESK_MQ.matches) return;
    var t0 = ev.target; if(!t0.closest) return;
    if(t0.closest('.md-fly')){ clearTimeout(MEGA.flyT); return; }
    var row = t0.closest('#mega-panel .md-list .md-row'); if(!row) return;
    if(row === MEGA.fly){ clearTimeout(MEGA.flyT); return; }
    decide(row);
  });
  /* keyboard: → opens a flyout and enters it, ← goes back to its row */
  document.addEventListener('keydown', function(ev){
    if(!MEGA.open || !DESK_MQ.matches) return;
    var a = document.activeElement; if(!a || !a.closest) return;
    if(ev.key === 'ArrowRight' && a.matches('#mega-panel .md-list .md-row[data-fly]')){
      ev.preventDefault(); ev.stopImmediatePropagation(); mdFlyOpen(a);
      var f = document.querySelector('#mega-panel .md-fly a'); if(f) f.focus(); return;
    }
    if(ev.key === 'ArrowLeft' && a.closest('#mega-panel .md-fly')){
      ev.preventDefault(); ev.stopImmediatePropagation(); var row = MEGA.fly; mdFlyClose(); if(row) row.focus(); return;
    }
    if((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && a.closest('#mega-panel .md-list') && MEGA.fly && !a.matches('.md-row[data-fly]')) mdFlyClose();
  }, true);
  /* keyboard focus on a row with children shows its flyout (a mouse does this by hovering) */
  document.addEventListener('focusin', function(ev){
    if(!MEGA.open) return; var a = ev.target;
    if(a.matches && a.matches('#mega-panel .md-list .md-row')){ if(a.hasAttribute('data-fly')) mdFlyOpen(a); else if(MEGA.fly) mdFlyClose(); }
  });
})();
function megaPanel(){
  var hdr = document.querySelector('.hdr'); if(!hdr) return null;
  var p = document.getElementById('mega-panel');
  if(!p){ p = document.createElement('div'); p.id = 'mega-panel'; p.className = 'mega'; p.setAttribute('role', 'region'); hdr.appendChild(p); }
  MEGA.panel = p; return p;
}
function megaOpen(item, how){
  if(!DESK_MQ.matches || !item) return;
  clearTimeout(MEGA.t);
  if(MEGA.open === item) return;
  if(typeof dsk_srchClose==='function') dsk_srchClose(false);
  var kind = item.getAttribute('data-mega'), p = megaPanel(); if(!p) return;
  if(megaStyle() === 'drop') megaDropOpen(item, kind, p);
  else {
    p.classList.remove('mega-drop'); p.style.left = ''; MEGA.fly = null;
    var html = kind==='cat' ? megaCatHTML(item.getAttribute('data-nav')) : kind==='combos' ? megaCombosHTML() : kind==='new' ? megaNewHTML() : kind==='shop' ? megaMoreHTML(megaShopIds(item)) : megaMoreHTML();
    p.innerHTML = '<div class="container mega-in mega-'+(kind==='shop' ? 'more' : kind)+'">'+html+'</div>';
  }
  p.setAttribute('aria-label', item.textContent.trim());
  if(MEGA.open) MEGA.open.setAttribute('aria-expanded', 'false');
  item.setAttribute('aria-expanded', 'true');
  MEGA.open = item; MEGA.by = how || '';
  p.classList.add('on');
  document.querySelectorAll('.hdr .nav-d .nav-i').forEach(function(a){ a.classList.toggle('mega-on', a === item); });
}
function megaClose(now, focusBack){
  clearTimeout(MEGA.t);
  var go = function(){
    var it = MEGA.open, p = document.getElementById('mega-panel');
    if(p){ p.classList.remove('on'); p.innerHTML = ''; }
    clearTimeout(MEGA.flyT); MEGA.fly = null;
    if(it){ it.setAttribute('aria-expanded', 'false'); it.classList.remove('mega-on'); if(focusBack) try{ it.focus({preventScroll:true}); }catch(e){} }
    MEGA.open = null;
  };
  if(now) go(); else MEGA.t = setTimeout(go, DESK_A.megaLeave);
}
function megaFocusables(){
  var p = document.getElementById('mega-panel'); if(!p) return [];
  /* H6 dropdown: ↑/↓ stay inside the list the focus is in (the main list or the open flyout) */
  if(p.classList.contains('mega-drop')){ var a = document.activeElement, box = (a && a.closest && a.closest('#mega-panel .md-fly')) || p.querySelector('.md-list'); return box ? [].slice.call(box.querySelectorAll('a[href],button')) : []; }
  return [].slice.call(p.querySelectorAll('a[href],button'));
}
(function(){
  var inZone = function(el){ return el && el.closest && (el.closest('.hdr .nav-d .nav-i[data-mega]') || el.closest('#mega-panel')); };
  /* hover intent: open 150 ms after the mouse settles on an item, close 250 ms after it leaves item + panel */
  document.addEventListener('pointerover', function(ev){
    if(ev.pointerType !== 'mouse' || !DESK_MQ.matches || !DESK_HOVER.matches) return;
    var it = ev.target.closest && ev.target.closest('.hdr .nav-d .nav-i');
    if(it){
      clearTimeout(MEGA.t);
      if(!it.hasAttribute('data-mega')){ if(MEGA.open) megaClose(); return; }
      if(MEGA.open && MEGA.open !== it){ megaOpen(it, 'hover'); return; }       /* already browsing: switch at once */
      MEGA.t = setTimeout(function(){ megaOpen(it, 'hover'); }, DESK_A.megaEnter);
      return;
    }
    if(ev.target.closest && ev.target.closest('#mega-panel')) clearTimeout(MEGA.t);
  });
  document.addEventListener('pointerout', function(ev){
    if(ev.pointerType !== 'mouse' || !DESK_MQ.matches) return;
    if(!inZone(ev.target) || inZone(ev.relatedTarget)) return;
    if(MEGA.open) megaClose(); else clearTimeout(MEGA.t);
  });
  /* click / tap / Enter (Claude's decision, QA round): a mouse click and Enter follow
     the link to the category page; Space or ↓ open the panel from the keyboard
     (keydown below). Only a touch tap (a 1024 px tablet, no hover) opens the
     panel first — the second tap follows the link. */
  document.addEventListener('click', function(ev){
    var it = ev.target.closest && ev.target.closest('.hdr .nav-d .nav-i[data-mega]');
    if(!it || !DESK_MQ.matches) return;
    if(ev.pointerType !== 'touch' && ev.pointerType !== 'pen') return;
    if(MEGA.open === it) return;
    ev.preventDefault(); ev.stopPropagation();
    megaOpen(it, 'click');
  }, true);
  document.addEventListener('mousedown', function(ev){ if(MEGA.open && !inZone(ev.target)) megaClose(true); });
  document.addEventListener('keydown', function(ev){
    if(!DESK_MQ.matches) return;
    var it = ev.target.closest && ev.target.closest('.hdr .nav-d .nav-i'), inPanel = ev.target.closest && ev.target.closest('#mega-panel');
    if(ev.key === 'Escape' && MEGA.open){ ev.preventDefault(); megaClose(true, true); return; }
    if(it){
      var list = megaItems(), i = list.indexOf(it);
      if((ev.key === ' ' || ev.key === 'Spacebar') && it.hasAttribute('data-mega')){ ev.preventDefault(); if(MEGA.open === it) megaClose(true); else megaOpen(it, 'key'); return; }
      if(ev.key === 'ArrowDown' && it.hasAttribute('data-mega')){ ev.preventDefault(); megaOpen(it, 'key'); var f = megaFocusables()[0]; if(f) f.focus(); return; }
      if(ev.key === 'ArrowRight' || ev.key === 'ArrowLeft'){
        ev.preventDefault();
        var nx = list[(i + (ev.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]; if(!nx) return;
        nx.focus();
        if(MEGA.open){ if(nx.hasAttribute('data-mega')) megaOpen(nx, 'key'); else megaClose(true); }
      }
      return;
    }
    if(inPanel && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')){
      ev.preventDefault();
      var fs = megaFocusables(), j = fs.indexOf(document.activeElement);
      if(ev.key === 'ArrowUp' && j <= 0){ if(MEGA.open) MEGA.open.focus(); return; }
      var to = fs[Math.min(fs.length - 1, Math.max(0, j + (ev.key === 'ArrowDown' ? 1 : -1)))]; if(to) to.focus();
    }
  });
  /* keyboard focus leaving the nav + panel closes it */
  document.addEventListener('focusout', function(ev){
    if(!MEGA.open) return;
    setTimeout(function(){ var a = document.activeElement; if(!(a && a.closest && (a.closest('.hdr .nav-d') || a.closest('#mega-panel'))) && MEGA.by !== 'hover') megaClose(true); }, 0);
  });
})();
ACT['desk-fit'] = function(el){ var id = el.getAttribute('data-cat'); var u = cat_ui(id); u.fits = [el.getAttribute('data-v')]; megaClose(true); go('#/c/'+id); };
ACT['desk-toprated'] = function(){ var u = cat_ui('new'); u.sort = 'top'; go('#/c/new'); };
/* H4 'shop' arrangement: "Sale" opens every style with the "On sale" filter on */
ACT['desk-sale'] = function(){ megaClose(true); var u = cat_ui('new'); u.sale = true; go('#/c/new'); };

/* ---------- 4. D-013 · product cards: back view on hover + quick add ---------- */
function deskCard(w){
  if(!w || w._dk || !DESK_MQ.matches) return;
  var p = P(w.getAttribute('data-pid')); if(!p) return;
  w._dk = true;
  var color = w.getAttribute('data-c') || p.colors[0], a = w.querySelector('.pcard'), img = a && a.querySelector('.pimg');
  if(!img) return;
  if(DESK_A.altView && !img.querySelector('.pcard-alt')){
    var alt = document.createElement('div'); alt.className = 'pcard-alt'; alt.setAttribute('aria-hidden', 'true');
    alt.innerHTML = productImg(p, color, {view:'back', label:false, ratio:'ratio-full'});
    img.insertBefore(alt, img.firstChild);          /* first: the badge (and the heart layer) stay on top */
  }
  if(DESK_A.quickAdd && !w.querySelector('.pcard-qa')){
    var sizes = p.sizes.filter(function(s){ return stockOf(p.id, color, s) > 0; });
    var qa = document.createElement('div'); qa.className = 'pcard-qa'; qa.setAttribute('role', 'group'); qa.setAttribute('aria-label', 'Quick add '+p.name+', choose a size');
    qa.innerHTML = sizes.length
      ? '<span class="pcard-qa-l">'+esc(t('Quick add'))+'</span><span class="pcard-qa-s">'+sizes.map(function(s){ return '<button type="button" data-act="desk-qa" data-pid="'+esc(p.id)+'" data-c="'+esc(color)+'" data-s="'+esc(s)+'" aria-label="Add size '+esc(s)+' to bag">'+esc(s)+'</button>'; }).join('')+'</span>'
      : '<span class="pcard-qa-l">'+esc(t('Sold out in this colour'))+'</span>';
    qa.style.setProperty('--qa-bottom', (img.offsetTop + img.offsetHeight)+'px');
    a.appendChild(qa);                               /* inside the card box (the card is no longer a link, D-024) */
    /* AUTO ADJUST: full (label + every size) → tight (no label, slimmer buttons)
       → the sizes that fit plus "+n" to the product page. Never two lines. */
    var row = qa.querySelector('.pcard-qa-s');
    if(row && (qa.scrollWidth > qa.clientWidth + 1 || row.scrollWidth > row.clientWidth + 1)){
      qa.classList.add('qa-tight');
      var btns = [].slice.call(row.querySelectorAll('button')), hidden = 0;
      while(btns.length - hidden > 1 && (qa.scrollWidth > qa.clientWidth + 1 || row.scrollWidth > row.clientWidth + 1)){
        hidden++; btns[btns.length - hidden].hidden = true;
        var more = row.querySelector('.pcard-qa-more');
        if(!more){ more = document.createElement('a'); more.className = 'pcard-qa-more'; more.href = '#/p/'+p.id+'?color='+encodeURIComponent(color); row.appendChild(more); }
        more.textContent = '+'+hidden; more.setAttribute('aria-label', hidden+' more sizes on the product page');
      }
    }
  }
}
(function(){
  document.addEventListener('pointerover', function(ev){
    if(ev.pointerType !== 'mouse' || !DESK_HOVER.matches || !DESK_MQ.matches) return;
    var w = ev.target.closest && ev.target.closest('.pcard-w'); if(w) deskCard(w);
  });
  document.addEventListener('focusin', function(ev){
    if(!DESK_MQ.matches) return;
    var w = ev.target.closest && ev.target.closest('.pcard-w'); if(w && !w.closest('[aria-hidden="true"]')) deskCard(w);
  });
})();
ACT['desk-qa'] = function(el){
  var pid = el.getAttribute('data-pid'), color = el.getAttribute('data-c'), size = el.getAttribute('data-s'), p = P(pid); if(!p) return;
  if(stockOf(pid, color, size) <= 0){ toast('Sorry — out of stock in this colour'); return; }
  var res = bagAdd({kind:'item', product:pid, color:color, size:size, qty:1}, {dupQty:true});
  if(!res.added){
    if(res.reason==='already') toast('Already in your bag — size '+size+'. Change the quantity in your bag.');
    else if(res.reason==='stock' && res.msg) toast(res.msg);
    return;
  }
  rerender();
  toast('Added to bag — '+p.name+' · '+COL(color).name+' · '+size+(res.qtyUp ? ' ('+res.qty+')' : ''));
  var tt = document.querySelector('.toast');
  if(tt){ var l = document.createElement('a'); l.href = '#/bag'; l.className = 'toast-link'; l.textContent = t('View bag'); tt.appendChild(document.createTextNode(' ')); tt.appendChild(l); }
};

/* ---------- 5. D-004 · hero slider and the keyboard ---------- */
function deskHeroKeys(){
  var tr = document.getElementById('hm-sltrack'), sl = tr && tr.closest('.hm-slider'); if(!tr || !sl || tr._dkKeys) return;
  tr._dkKeys = true;
  var raf = 0;
  var upd = function(){
    raf = 0; if(!DESK_MQ.matches) return;
    var r = sl.getBoundingClientRect();
    [].forEach.call(tr.children, function(a){
      if(a.getAttribute('aria-hidden') === 'true' || a === document.activeElement) return;
      var b = a.getBoundingClientRect(), vis = b.left >= r.left - 1 && b.right <= r.right + 1;
      if(a.tabIndex !== (vis ? 0 : -1)) a.tabIndex = vis ? 0 : -1;
    });
  };
  upd();
  tr.addEventListener('scroll', function(){ if(!raf) raf = requestAnimationFrame(upd); }, {passive:true});
  /* TA-2 (T4): keyboard focus has its OWN pause flag (st.focus); it used to
     borrow the mouse flag, so a mouse click on an arrow (which focuses it)
     followed by a quick flick off the slider left the hero stopped for good.
     Focus that a pointer press caused is not a keyboard pause. The focus pause
     ends on blur (1.5 s grace) or as soon as the mouse is used. */
  var peek = function(){ return SMOOTH.peek && SMOOTH.peek('hm-sltrack'); };
  var ptrDown = false;
  sl.addEventListener('pointerdown', function(){
    ptrDown = true; setTimeout(function(){ ptrDown = false; }, 0);
    var st = peek(); if(st) st.focus = false;
  }, true);
  sl.addEventListener('pointermove', function(ev){ if(ev.pointerType !== 'mouse') return; var st = peek(); if(st && st.focus) st.focus = false; });
  /* the arrows sit beside the track, not in it: the mouse on an arrow is still "on the slider" */
  [].forEach.call(sl.querySelectorAll('.hm-slnav'), function(b){
    b.addEventListener('pointerenter', function(ev){ if(ev.pointerType !== 'mouse') return; var st = peek(); if(st) st.hover = true; });
    b.addEventListener('pointerleave', function(ev){
      if(ev.pointerType !== 'mouse' || tr.contains(ev.relatedTarget)) return;
      var st = peek(); if(st){ st.hover = false; st.pause = 0; }
    });
  });
  sl.addEventListener('focusin', function(ev){
    var st = peek(); if(st && !ptrDown) st.focus = true;
    var s = ev.target.closest && ev.target.closest('.hm-sl'); if(s) try{ s.scrollIntoView({inline:'nearest', block:'nearest'}); }catch(e){}
  });
  sl.addEventListener('focusout', function(ev){
    if(sl.contains(ev.relatedTarget)) return;
    var st = peek(); if(st && st.focus){ st.focus = false; st.pause = Date.now() + 1500; }
    upd();
  });
}
