/* =====================================================================
   89x-owner-b.js — owner's desktop review of V12, 20 Oct (ROUND15 Note 51)
   Category pages (C1–C6) and the product page (P1–P8).

   Everything the owner sees here is a shop option (OPT, 08-shop-opts.js)
   with a row in Admin › Settings (English + Bengali), so nothing is typed
   into the page code. Each option's "classic" value gives back the page as
   it was before this round. The fixes the owner asked for are switched on.

   THE PHONE IS SIGNED OFF. Every new block below is drawn with the class
   `hide-m` (or only styled inside @media (min-width:1024px) in
   r12-zz-ownerB.css), so a phone never shows it. The only phone changes are
   copy ("Wear it with") and demo data (01zz-demo-more.js, product videos).
   ===================================================================== */
(function(){
  if(typeof SHOP_OPT_DEF === 'undefined') return;
  var D = {
    /* ---- category ---- */
    'cat.setBoxCats'  : 'all',          /* C3 · 'all' = every category with a running "any N" set · 'polos,tshirts' = the old two */
    'cat.boxStyle'    : 'standard',     /* C4 · 'standard' (new) · 'classic' */
    'cat.infoSlot'    : 'mix',          /* C1 · mix · size · why · combo · off */
    'cat.sizeTitle'   : 'Not sure of your size?',
    'cat.sizeTitleBn' : 'সাইজ নিয়ে চিন্তা?',
    'cat.sizeLine'    : 'Tell us your height and weight. We suggest a size in about 20 seconds.',
    'cat.sizeLineBn'  : 'উচ্চতা আর ওজন দিন — ২০ সেকেন্ডে আপনার সাইজ বলে দেব।',
    'cat.sizeBtn'     : 'Find my size',
    'cat.sizeBtnBn'   : 'আমার সাইজ খুঁজুন',
    'cat.whyTitle'    : 'Why shop with EXTAS',
    'cat.whyTitleBn'  : 'কেন EXTAS থেকে কিনবেন',
    'cat.why1'        : 'Cash on Delivery all over Bangladesh',
    'cat.why1Bn'      : 'সারা দেশে ক্যাশ অন ডেলিভারি',
    'cat.why2'        : '{hours}-hour size exchange',
    'cat.why2Bn'      : '{hours} ঘণ্টার মধ্যে সাইজ বদল',
    'cat.why3'        : 'Try it on in front of the rider',
    'cat.why3Bn'      : 'রাইডারের সামনে পরে দেখুন',
    'cat.why4'        : 'Made in Bangladesh',
    'cat.why4Bn'      : 'বাংলাদেশে তৈরি',
    /* ---- product page (desktop) ---- */
    'pdp.galleryTrim' : 78,             /* P1 · px shorter than the 4:5 photo (0 = as before) */
    'pdp.thumbMax'    : 5,              /* P8 · thumbnails shown; the last one says "+N" when there are more */
    'pdp.careCard'    : true,           /* P2 */
    'pdp.careRead'    : 'Read',
    'pdp.careReadBn'  : 'পড়ুন',
    'pdp.revEqual'    : true,           /* P3 */
    'pdp.qaLeft'      : 'helper',       /* P4 · 'helper' (size helper) · 'example' (the old fixed question) */
    'pdp.rowsStyle'   : 'one',          /* P5 · 'one' = one slider + a grid of 4 · 'two' = two sliders (as before) */
    'pdp.pairTitle'   : 'Wear it with',
    'pdp.pairTitleBn' : 'এর সাথে পরুন',
    'pdp.recentSwapSec': 35,            /* P5 · the grid of 4 changes every N seconds (0 = never) */
    'pdp.recentTitle' : 'Recently viewed',
    'pdp.recentTitleBn': 'সম্প্রতি দেখেছেন',
    'pdp.recentMixTitle': 'Recently viewed and similar styles',
    'pdp.recentMixTitleBn': 'সম্প্রতি দেখা আর এরকম আরও',
    'pdp.recentFillTitle': 'More like this',
    'pdp.recentFillTitleBn': 'এরকম আরও',
    'pdp.barInfo'     : true,           /* P6 */
    'pdp.zoomSteps'   : '1.8,2.6,3.6',  /* P7 */
    'pdp.video'       : true            /* C6 · product videos in the gallery */
  };
  for(var k in D) if(SHOP_OPT_DEF[k] === undefined) SHOP_OPT_DEF[k] = D[k];
})();

var OWNB = {rv:null};
function ownb_on(k){ return typeof OPT==='function' && OPT(k) !== false && OPT(k) !== 'classic' && OPT(k) !== 'off' && OPT(k) !== 0 && OPT(k) !== '0'; }

/* ---------------------------------------------------------------------
   C3 · which categories show the "Build your own set" box. It used to be
   typed into the page as Polos and T-shirts only, so Panjabi, Shirts,
   Trousers and Hoodies had no box even when a set existed for them.
   --------------------------------------------------------------------- */
function ownb_catSetBox(id){
  var v = String(OPT('cat.setBoxCats') || 'all').trim();
  if(v === 'all' || v === '') return true;
  return v.split(/[\s,]+/).indexOf(id) >= 0;
}
/* the words under the tiers: the categories the set really mixes */
function ownb_setMix(r, id){
  var names = (r.categories || []).map(function(c){ var x = CAT(c); return x ? t(x.name).toLowerCase() : ''; }).filter(Boolean);
  if(names.length < 2) return 'Mix any '+(names[0] || cat_name(id).toLowerCase());
  return 'Mix '+names.slice(0, -1).join(', ')+' and '+names[names.length-1];
}
/* C4 · the tiers as chips (desktop). Drawn hidden on the phone. */
function ownb_tierChips(r){
  if(!ownb_on('cat.boxStyle')) return '';
  var ks = Object.keys(r.tiers || {}).sort(function(a, b){ return a - b; });
  return '<div class="cat-bn-tiers hide-m" data-testid="cat-bn-tiers">'+ks.map(function(k){
    return '<span class="cat-bn-tier"><b>Any '+esc(k)+'</b> for <span class="cat-nw">'+fmt(r.tiers[k])+'</span></span>'; }).join('')+'</div>';
}

/* ---------------------------------------------------------------------
   C1 · the empty side under "<Category> for men in Bangladesh". A card
   chosen by the owner: size helper, why EXTAS, a featured set, or both of
   the first two (default). Desktop only.
   --------------------------------------------------------------------- */
function ownb_catInfoSlot(id){
  var mode = String(OPT('cat.infoSlot') || 'mix');
  if(mode === 'off' || mode === 'classic') return '';
  var parts = [];
  var size = function(){
    var first = cat_base(id).filter(function(p){ return p.chart; })[0];
    if(!first) return '';
    return '<div class="ob-slot-size"><span class="ob-slot-ic" aria-hidden="true">'+ico('ruler', 22)+'</span>'+
      '<div class="ob-slot-txt"><div class="ob-slot-h">'+esc(OPTL('cat.sizeTitle'))+'</div><p>'+esc(OPTL('cat.sizeLine'))+'</p></div>'+
      '<a class="btn btn-primary ob-slot-btn" href="#/p/'+esc(first.id)+'?finder=1">'+esc(OPTL('cat.sizeBtn'))+ico('right', 16)+'</a></div>';
  };
  var why = function(){
    var hours = (typeof SET==='function' ? SET('exchange','windowHours') : 72) || 72;
    var rows = [['cash', OPTL('cat.why1')], ['swap', OPTL('cat.why2').replace('{hours}', hours)],
      (typeof trialOn!=='function' || trialOn()) ? ['check', OPTL('cat.why3')] : null, ['shield', OPTL('cat.why4')]]
      .filter(function(x){ return x && String(x[1]).trim(); });
    if(!rows.length) return '';
    return '<div class="ob-slot-why"><div class="ob-slot-h">'+esc(OPTL('cat.whyTitle'))+'</div><ul>'+rows.map(function(r){
      return '<li><span aria-hidden="true">'+ico(r[0], 17)+'</span>'+esc(r[1])+'</li>'; }).join('')+'</ul></div>';
  };
  var combo = function(){
    var r = cat_rule(id);
    if(r && r.tiers){
      var demo = productsIn(id).slice(0, 3);
      if(!demo.length) return '';
      return '<a class="ob-slot-combo" href="#/set/'+esc(r.id)+'">'+setImg(demo.map(function(p){ return {product:p.id, color:p.colors[0]}; }), {ratio:'ratio-11'})+
        '<span class="ob-slot-cb"><span class="eyebrow">'+esc(t('Build your own set'))+'</span><span class="ob-slot-h">'+esc(r.name)+'</span>'+
        '<span class="small text2">'+cat_nw(esc(cat_tierText(r)))+'</span></span>'+ico('right', 18)+'</a>';
    }
    var c = combos().filter(function(c){ return c.active && c.items.some(function(pid){ var p = P(pid); return p && p.cat === id; }); })[0];
    if(!c) return '';
    var reg = c.items.reduce(function(s, pid){ var pp = P(pid); return s + (pp ? pp.price : 0); }, 0);
    return '<a class="ob-slot-combo" href="#/combo/'+esc(c.id)+'">'+setImg(c.items.map(function(pid, i){ var pp = P(pid); return {product:pid, color:pp ? pp.colors[i % pp.colors.length] : null}; }).filter(function(x){ return P(x.product); }), {ratio:'ratio-11'})+
      '<span class="ob-slot-cb"><span class="eyebrow">'+esc(t('Complete the look'))+'</span><span class="ob-slot-h">'+esc(c.name)+'</span>'+
      '<span class="small text2">'+fmt(c.price)+(reg > c.price ? ' · <b class="brandc">Save '+fmt(reg - c.price)+'</b>' : '')+'</span></span>'+ico('right', 18)+'</a>';
  };
  if(mode === 'size') parts = [size()];
  else if(mode === 'why') parts = [why()];
  else if(mode === 'combo') parts = [combo() || size()];
  else parts = [size(), why()];
  var h = parts.join('');
  return h ? '<div class="ob-slot hide-m ob-slot-'+esc(mode)+'" data-testid="cat-info-slot">'+h+'</div>' : '';
}

/* ---------------------------------------------------------------------
   C6 · product video. A product field: p.video = YouTube link or id, or
   {url, poster, title, len}. The page shows the product's own picture with
   a play button; the YouTube player is only loaded when the customer
   presses play (nothing is fetched from YouTube before that — speed).
   --------------------------------------------------------------------- */
function ownb_ytId(v){
  if(!v) return '';
  var s = String(typeof v === 'object' ? (v.url || v.id || '') : v).trim();
  if(/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  var m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}
function ownb_video(p){
  if(!p || !p.video || !ownb_on('pdp.video')) return null;
  var id = ownb_ytId(p.video); if(!id) return null;
  var o = typeof p.video === 'object' ? p.video : {};
  return {id:id, title:o.title || (p.name+' — video'), len:o.len || '', poster:o.poster || ''};
}
function ownb_vposter(p, u, v, ratio, small){
  var inner = '<span class="pdp-vplay" aria-hidden="true">'+ico('play', small ? 16 : 30)+'</span>'+
    (small ? '' : '<span class="pdp-vlbl">'+ico('play', 13)+esc(t('Video'))+(v.len ? ' · '+esc(v.len) : '')+'</span>');
  if(v.poster) return '<div class="pimg '+ratio+' pdp-vposter" style="background:#1a1a18"><img src="'+esc(v.poster)+'" alt="" loading="lazy" decoding="async">'+inner+'</div>';
  return productImg(p, u.color, {view:'model', ratio:ratio, label:false, cls:'pdp-vposter', inner:inner});
}
function ownb_videoTile(p, u, ratio){
  var v = ownb_video(p); if(!v) return '';
  var on = !!u.vidOn;
  return '<div class="pdp-tile pdp-vtile" data-v="video" data-testid="pdp-video">'+
    (on ? '<div class="pimg '+ratio+' pdp-vbox"><iframe src="https://www.youtube-nocookie.com/embed/'+esc(v.id)+'?autoplay=1&rel=0&playsinline=1&modestbranding=1" title="'+esc(v.title)+'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>'
        : '<button type="button" class="pdp-vbtn" data-act="pdp-video" aria-label="'+esc(t('Play video')+': '+v.title)+'">'+ownb_vposter(p, u, v, ratio, false)+'</button>')+
  '</div>';
}
function ownb_videoThumb(p, u, ratio){
  var v = ownb_video(p); if(!v) return '';
  var on = u.view === 'video';
  return '<button type="button" class="pdp-thumb pdp-vthumb'+(on ? ' on' : '')+'" data-act="pdp-view" data-v="video" aria-label="'+esc(t('Video'))+'" aria-pressed="'+on+'">'+
    ownb_vposter(p, u, v, ratio, true)+'</button>';
}
ACT['pdp-video'] = function(){
  var c = pdp_cur(); if(!c) return;
  c.u.vidOn = true; c.u.view = 'video';
  var tile = document.querySelector('.pdp-page .pdp-vtile');
  if(tile){ var v = ownb_video(c.p), r = tile.querySelector('.pimg'); var ratio = r && /ratio-34/.test(r.className) ? 'ratio-34' : 'ratio-45';
    tile.innerHTML = '<div class="pimg '+ratio+' pdp-vbox"><iframe src="https://www.youtube-nocookie.com/embed/'+esc(v.id)+'?autoplay=1&rel=0&playsinline=1&modestbranding=1" title="'+esc(v.title)+'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
    var f = tile.querySelector('iframe'); if(f) try{ f.focus(); }catch(e){} }
};

/* ---------------------------------------------------------------------
   P2 · "How to care for this" as an article card (desktop)
   --------------------------------------------------------------------- */
function ownb_careCard(p){
  if(!ownb_on('pdp.careCard') || typeof bfCareFor !== 'function') return '';
  var c = bfCareFor(p); if(!c) return '';
  var mins = c.mins ? (typeof bfL==='function' ? bfL('minRead', {n:c.mins}) : c.mins+' min read') : '';
  return '<a class="ob-care hide-m" href="'+esc(c.href)+'" data-testid="care-card">'+
    '<span class="ob-care-i" aria-hidden="true">'+ico('doc', 22)+'</span>'+
    '<span class="ob-care-b"><span class="ob-care-l">'+esc(c.label)+'</span><span class="ob-care-t">'+esc(c.title)+'</span>'+
      (mins ? '<span class="ob-care-m">'+ico('clock', 13)+esc(mins)+'</span>' : '')+'</span>'+
    '<span class="ob-care-go">'+esc(OPTL('pdp.careRead'))+ico('right', 15)+'</span></a>';
}

/* ---------------------------------------------------------------------
   P4 · the Q&A left panel: a small size helper instead of one fixed
   "I'm 5'8" and 72 kg" question. It uses the same size finder maths
   (recommendSize) and the product's own chart.
   --------------------------------------------------------------------- */
function ownb_qaHelper(p){
  if(String(OPT('pdp.qaLeft')) !== 'helper') return '';
  var ch = chartFor(p); if(!ch || pdp_isOne(p)) return '';
  var u = pdp_state(p, CUR.query), ms = (typeof mySize==='function' && mySize()) || null;
  var h = u.qh || (ms && ms.h) || 67, w = u.qw || (ms && ms.w) || 68;
  var hOpts = '', wOpts = '';
  for(var i = 58; i <= 78; i++) hOpts += '<option value="'+i+'"'+(i===+h?' selected':'')+'>'+pdp_ftin(i)+'</option>';
  for(var k = 45; k <= 120; k += 1) wOpts += '<option value="'+k+'"'+(k===+w?' selected':'')+'>'+k+' kg</option>';
  var fs = pdp_fitStats(p);
  return '<div class="pdp-box p20 ob-qh hide-m" data-testid="qa-helper">'+
    '<div class="ob-qh-hd"><span class="ob-qh-ic" aria-hidden="true">'+ico('ruler', 20)+'</span><div><div class="h3">'+esc(t('Quick size check'))+'</div>'+
      '<div class="xs text2">'+esc(t('Pick your height and weight — we show your size in this'))+' '+esc(String(p.fit || '').toLowerCase())+'.</div></div></div>'+
    '<div class="ob-qh-row"><label class="ob-qh-f"><span class="xs bold">'+esc(t('Height'))+'</span><select class="input" data-change="ob-qh" data-k="h" data-testid="qh-h">'+hOpts+'</select></label>'+
      '<label class="ob-qh-f"><span class="xs bold">'+esc(t('Weight'))+'</span><select class="input" data-change="ob-qh" data-k="w" data-testid="qh-w">'+wOpts+'</select></label>'+
      '<div class="ob-qh-res" aria-live="polite" data-testid="qh-res">'+ownb_qhResult(p, +h, +w)+'</div></div>'+
    '<div class="ob-qh-note xs text2">'+ico('check', 13)+esc(fs.t+'% '+t('of buyers say this style is true to size'))+'</div>'+
    '<div class="pdp-qa-wa ob-qh-wa"><p class="xs muted" style="margin:0 0 10px">'+esc(t('Not answered here? We reply 10 am – 10 pm.'))+'</p>'+waButton('Ask on WhatsApp', 'Hi EXTAS, I have a question about '+p.name+' ('+pdp_sku(p)+')')+'</div>'+
  '</div>';
}
function ownb_qhResult(p, h, w){
  var ch = chartFor(p), r = recommendSize(ch, h, w); if(!r) return '';
  var u = pdp_state(p, CUR.query), ok = stockOf(p.id, u.color, r.size) > 0;
  var meas = ch.fields && ch.rows[r.size] ? ch.fields[0].toLowerCase()+' '+ch.rows[r.size][0]+'"' : '';
  return '<div class="ob-qh-size"><span class="xs text2">'+esc(t('Your size'))+'</span><b>'+esc(r.size)+'</b></div>'+
    '<div class="ob-qh-why"><div class="xs text2">'+(meas ? esc(meas)+(r.next !== r.size ? ' · ' : '') : '')+(r.next !== r.size ? esc(t('Loose fit?'))+' '+esc(r.next) : '')+'</div>'+
      (ok ? '<button type="button" class="btn btn-sm btn-primary" data-act="ob-qh-use" data-s="'+esc(r.size)+'" data-testid="qh-use">'+esc(t('Choose'))+' '+esc(r.size)+'</button>'
          : '<div class="xs" style="color:var(--sale)">'+esc(t('Sold out in'))+' '+esc(COL(u.color).name)+'</div>')+
    '</div>';
}
CHANGE['ob-qh'] = function(el){
  var c = pdp_cur(); if(!c) return;
  if(el.getAttribute('data-k') === 'h') c.u.qh = +el.value; else c.u.qw = +el.value;
  var box = document.querySelector('.pdp-page .ob-qh-res'); if(!box) return;
  var hs = document.querySelector('.pdp-page [data-testid="qh-h"]'), ws = document.querySelector('.pdp-page [data-testid="qh-w"]');
  box.innerHTML = ownb_qhResult(c.p, +(hs ? hs.value : 67), +(ws ? ws.value : 68));
};
ACT['ob-qh-use'] = function(el){
  var c = pdp_cur(); if(!c) return;
  c.u.size = el.getAttribute('data-s'); c.u.err = false; rerender();
  var s = document.getElementById('pdp-sizes'); if(s) s.scrollIntoView({block:'center', behavior:'smooth'});
};

/* ---------------------------------------------------------------------
   P5 · bottom of the product page (desktop): ONE slider ("Wear it with")
   and a fixed grid of 4 that changes every N seconds. The grid is never
   empty: recently viewed first, then similar styles.
   --------------------------------------------------------------------- */
function ownb_rowsOne(){ return String(OPT('pdp.rowsStyle') || 'one') === 'one'; }
function ownb_pairsDesk(p, rows){
  var seen = {}, items = [], lists = rows.map(function(r){ return r.items.slice(); });
  for(var i = 0; items.length < 10 && lists.some(function(l){ return l.length; }); i++){
    var l = lists[i % lists.length], x = l.shift();
    if(x && !seen[x.id] && x.id !== p.id){ seen[x.id] = 1; items.push(x); }
  }
  if(items.length < 5) pdp_pairs(p).forEach(function(x){ if(items.length < 8 && !seen[x.id] && x.id !== p.id){ seen[x.id] = 1; items.push(x); } });
  if(!items.length) return '';
  var link = rows[0] ? '<a class="link" href="#/c/'+rows[0].cid+'">See all</a>' : '';
  return pdp_row(OPTL('pdp.pairTitle') || 'Wear it with', link, items, 'pairs-row-d1', 'hide-m dkb-row ob-pairs');
}
function ownb_rvPool(p){
  var recent = (ST.recent || []).filter(function(id){ return id !== p.id && P(id) && !P(id).hidden; }).map(P).slice(0, 8);
  var seen = {}; seen[p.id] = 1; recent.forEach(function(x){ seen[x.id] = 1; });
  /* not the ones already in "Wear it with" */
  var pairEl = []; try{ var cats = pdp_rowCats(p); cats.forEach(function(cid){ productsIn(cid).slice(0, 6).forEach(function(x){ pairEl.push(x.id); }); }); }catch(e){}
  var fill = productsIn(p.cat).concat(pdp_pairs(p), DB.products).filter(function(x){
    if(!x || seen[x.id] || x.hidden || (CAT(x.cat)||{}).hidden || pairEl.indexOf(x.id) >= 0) return false; seen[x.id] = 1; return true; });
  var pool = recent.concat(fill);
  var need = Math.max(4, Math.ceil(Math.min(pool.length, 12) / 4) * 4);
  return {recent:recent.length, list:pool.slice(0, Math.min(need, pool.length))};
}
function ownb_recentDesk(p){
  if(!ownb_rowsOne()) return '';
  var pool = ownb_rvPool(p); if(!pool.list.length) return '';
  var title = pool.recent >= 4 ? OPTL('pdp.recentTitle') : (pool.recent ? OPTL('pdp.recentMixTitle') : OPTL('pdp.recentFillTitle'));
  var pages = Math.ceil(pool.list.length / 4);
  var dots = pages > 1 ? '<span class="ob-rv-dots" aria-hidden="true">'+Array.apply(null, Array(pages)).map(function(_, i){ return '<i'+(i===0?' class="on"':'')+'></i>'; }).join('')+'</span>' : '';
  return '<section class="section hide-m ob-rv" data-testid="recent-grid" data-pages="'+pages+'"><div class="container"><div class="sec-hd"><h2 class="h2">'+esc(title)+'</h2>'+dots+'</div>'+
    '<div class="grid g4 ob-rv-grid" id="ob-rv-grid" aria-live="off">'+pool.list.slice(0, 4).map(function(x){ return productCard(x); }).join('')+'</div></div></section>';
}
/* the swap timer: one per page. Three separate pause flags (mouse hover,
   keyboard focus, a 4-second touch hold) — each cleared only by its own
   event — plus a hidden browser tab. Time only counts while none is set. */
function ownb_rvStop(){ var r = OWNB.rv; if(!r) return; clearInterval(r.iv); clearTimeout(r.touchT); r.dead = true; OWNB.rv = null; }
function ownb_rvStart(p){
  ownb_rvStop();
  var grid = document.getElementById('ob-rv-grid'); if(!grid || !deskOn()) return;
  var pool = ownb_rvPool(p).list, pages = Math.ceil(pool.length / 4), sec = +OPT('pdp.recentSwapSec') || 0;
  if(pages < 2 || sec <= 0) return;
  var r = OWNB.rv = {page:0, acc:0, hover:false, focus:false, touch:false, iv:null, touchT:null, dead:false, last:Date.now(), pid:p.id, hash:location.hash};
  grid.addEventListener('pointerenter', function(e){ if(e.pointerType === 'mouse') r.hover = true; });
  grid.addEventListener('pointerleave', function(e){ if(e.pointerType === 'mouse') r.hover = false; });
  grid.addEventListener('focusin', function(){ r.focus = true; });
  grid.addEventListener('focusout', function(e){ if(!e.relatedTarget || !grid.contains(e.relatedTarget)) r.focus = false; });
  grid.addEventListener('touchstart', function(){ r.touch = true; clearTimeout(r.touchT); }, {passive:true});
  grid.addEventListener('touchend', function(){ clearTimeout(r.touchT); r.touchT = setTimeout(function(){ r.touch = false; }, 4000); }, {passive:true});
  r.paused = function(){ return r.hover || r.focus || r.touch || document.hidden; };
  r.iv = setInterval(function(){
    if(r.dead || !document.body.contains(grid)){ ownb_rvStop(); return; }
    var now = Date.now(), dt = now - r.last; r.last = now;
    if(r.paused()) return;
    r.acc += dt;
    if(r.acc >= sec * 1000){ r.acc = 0; ownb_rvSwap(grid, pool, (r.page = (r.page + 1) % pages)); }
  }, 100);
}
function ownb_rvSwap(grid, pool, page){
  var draw = function(){
    grid.innerHTML = pool.slice(page * 4, page * 4 + 4).map(function(x){ return productCard(x); }).join('');
    var dots = grid.parentNode.querySelectorAll('.ob-rv-dots i'); [].forEach.call(dots, function(d, i){ d.classList.toggle('on', i === page); });
    grid.setAttribute('data-page', page);
  };
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(still){ draw(); return; }
  grid.classList.add('ob-fade');
  setTimeout(function(){ if(!document.body.contains(grid)) return; draw(); requestAnimationFrame(function(){ grid.classList.remove('ob-fade'); }); }, 220);
}
/* a route change stops it — unless the new page already started its own (the router draws before this runs) */
window.addEventListener('hashchange', function(){ if(OWNB.rv && OWNB.rv.hash !== location.hash) ownb_rvStop(); });

/* ---------------------------------------------------------------------
   P6 · the sticky add-to-bag bar: rating, delivery promise and saving in
   the empty middle (desktop bar only — the phone has its own bar).
   --------------------------------------------------------------------- */
function ownb_barMid(p){
  if(!ownb_on('pdp.barInfo')) return '';
  var rt = pdp_rating(p), f = freeDeliveryFor(p), out = [];
  if(rt && rt.n) out.push('<span class="ob-bm-i ob-bm-r">'+starsHTML(rt.avg, 13)+'<b>'+Number(rt.avg).toFixed(1)+'</b><span class="text2">('+rt.n+')</span></span>');
  var dv = (f && f.on) ? '<b>'+esc(t('Free home delivery'))+'</b>'
    : '<b>'+esc(t('Dhaka'))+' '+esc(SET('delivery','insideDays'))+' '+esc(t('days'))+'</b><span class="text2"> · '+esc(t('outside'))+' '+esc(SET('delivery','outsideDays'))+'</span>';
  out.push('<span class="ob-bm-i ob-bm-d">'+ico('truck', 15)+dv+'</span>');
  out.push('<span class="ob-bm-i ob-bm-c">'+ico('cash', 15)+'<span>'+esc(t('Cash on Delivery'))+'</span></span>');
  return '<div class="ob-bm" data-testid="dkb-mid">'+out.join('')+'</div>';
}
function ownb_barSave(p){
  if(!ownb_on('pdp.barInfo') || !(p.compareAt > p.price)) return '';
  return '<span class="ob-bm-save">'+esc(t('Save'))+' '+fmt(p.compareAt - p.price)+'</span>';
}

/* ---------------------------------------------------------------------
   P1 / P8 · desktop gallery: shorter photo (a CSS variable) and the
   thumbnail column limited to what fits, the last one saying "+N".
   --------------------------------------------------------------------- */
function ownb_galPrep(){
  var de = document.documentElement, trim = +OPT('pdp.galleryTrim') || 0;
  de.classList.toggle('ob-gal', trim > 0);
  de.classList.toggle('ob-req', OPT('pdp.revEqual') !== false);
  de.style.setProperty('--ob-gtrim', Math.max(0, Math.min(200, trim)) + 'px');
}
function ownb_thumbFit(){
  var strip = document.querySelector('.pdp-page .pdp-galT1 .pdp-thumbs'); if(!strip) return;
  var th = [].slice.call(strip.querySelectorAll('.pdp-thumb'));
  th.forEach(function(b){ b.classList.remove('ob-hid', 'ob-more'); b.removeAttribute('data-more'); });
  if(!deskOn()) return;
  var max = Math.max(2, +OPT('pdp.thumbMax') || th.length);
  var main = document.querySelector('.pdp-page .pdp-galT1 .pdp-main');
  if(main && strip.closest('.vert') && th[0]){
    var h0 = th[0].getBoundingClientRect().height || 90, gap = 8, fitN = Math.max(2, Math.floor((main.getBoundingClientRect().height + gap) / (h0 + gap)));
    max = Math.min(max, fitN);
  }
  if(th.length <= max) return;
  var extra = th.length - max + 1;
  th.forEach(function(b, i){ if(i >= max) b.classList.add('ob-hid'); });
  var last = th[max - 1]; last.classList.add('ob-more'); last.setAttribute('data-more', '+' + extra);
  last.setAttribute('aria-label', (last.getAttribute('aria-label') || '') + ' · ' + extra + ' ' + t('more photos'));
}
/* called at the end of PAGES.product.after */
function ownb_pdpAfter(p){
  ownb_galPrep();
  ownb_thumbFit(); setTimeout(ownb_thumbFit, 200);
  ownb_rvStart(p);
}
window.addEventListener('resize', function(){ if(document.querySelector('.pdp-page')) ownb_thumbFit(); });
try{ ownb_galPrep(); }catch(e){}

/* ---------------------------------------------------------------------
   Admin › Settings rows (English + Bengali)
   --------------------------------------------------------------------- */
(function(){
  if(typeof ZS_SETTINGS === 'undefined' || typeof ZS_GROUPS === 'undefined') return;
  var row = function(id, g, en, bn, type, where, see, extra){
    var s = {id:'opt.'+id, g:g, en:en, bn:bn, type:type, where:where, see:see || '',
      get:function(){ return OPT(id); }, set:function(v){ optSet(id, type==='sw' ? !!v : (type==='num' ? +v : v)); },
      def:function(){ return SHOP_OPT_DEF[id]; }, reset:function(){ optReset(id); }};
    if(extra) for(var k in extra) s[k] = extra[k];
    return s;
  };
  var C = '#/c/polos', PP = '#/p/essential-pique-polo';
  var rows = [
    row('cat.setBoxCats', 'ownbcat', 'Categories that show the "Build your own set" box ("all", or category ids like polos,tshirts)', 'কোন কোন ক্যাটাগরিতে "নিজের সেট বানান" বক্স দেখাবে — "all" মানে যেখানে সেট চালু আছে সব জায়গায়', 'text', 'Category pages', C),
    row('cat.boxStyle', 'ownbcat', 'Set box look (computer)', 'সেট বক্সের ডিজাইন (কম্পিউটার)', 'sel', 'Category pages, desktop', C,
      {opts:[['standard','Standard — price chips, even spacing (new)'], ['classic','Classic — as before']]}),
    row('cat.infoSlot', 'ownbcat', 'Card beside the category questions (computer)', 'ক্যাটাগরির প্রশ্নগুলোর পাশের খালি জায়গায় কোন কার্ড', 'sel', 'Category pages, under the description, desktop', C,
      {opts:[['mix','Size help + why EXTAS'], ['size','Size help only'], ['why','Why EXTAS only'], ['combo','A set or combo of this category'], ['off','Nothing (as before)']]}),
    row('cat.sizeTitle', 'ownbcat', 'Size help — title (English)', 'সাইজ সাহায্য — শিরোনাম (ইংরেজি)', 'text', 'Category page card', C),
    row('cat.sizeTitleBn', 'ownbcat', 'Size help — title (Bengali)', 'সাইজ সাহায্য — শিরোনাম (বাংলা)', 'text', 'Category page card in বাং', C),
    row('cat.sizeLine', 'ownbcat', 'Size help — line (English)', 'সাইজ সাহায্য — লাইন (ইংরেজি)', 'text', 'Category page card', C),
    row('cat.sizeLineBn', 'ownbcat', 'Size help — line (Bengali)', 'সাইজ সাহায্য — লাইন (বাংলা)', 'text', 'Category page card in বাং', C),
    row('cat.whyTitle', 'ownbcat', 'Why EXTAS — title (English)', 'কেন EXTAS — শিরোনাম (ইংরেজি)', 'text', 'Category page card', C),
    row('cat.why1', 'ownbcat', 'Why EXTAS — point 1', 'কেন EXTAS — ১ নম্বর কথা', 'text', 'Category page card', C),
    row('cat.why2', 'ownbcat', 'Why EXTAS — point 2 ({hours} = exchange hours)', 'কেন EXTAS — ২ নম্বর কথা ({hours} = বদলের ঘণ্টা)', 'text', 'Category page card', C),
    row('cat.why3', 'ownbcat', 'Why EXTAS — point 3 (only when trial at the door is on)', 'কেন EXTAS — ৩ নম্বর কথা (দরজায় ট্রায়াল চালু থাকলে)', 'text', 'Category page card', C),
    row('cat.why4', 'ownbcat', 'Why EXTAS — point 4', 'কেন EXTAS — ৪ নম্বর কথা', 'text', 'Category page card', C),
    row('pdp.galleryTrim', 'ownbpdp', 'Main photo — how many px shorter than 4:5 (computer, 0 = as before)', 'বড় ছবি ৪:৫ থেকে কত px ছোট হবে (কম্পিউটার, ০ = আগের মতো)', 'num', 'Product page, desktop', PP),
    row('pdp.thumbMax', 'ownbpdp', 'Thumbnails shown beside the photo (the last one shows "+N")', 'ছবির পাশে কয়টা ছোট ছবি দেখাবে (শেষটায় "+N")', 'num', 'Product page, desktop', PP),
    row('pdp.careCard', 'ownbpdp', '"How to care for this" as an article card', '"How to care for this" আর্টিকেল কার্ড হিসেবে দেখাবে', 'sw', 'Product page, desktop', PP),
    row('pdp.revEqual', 'ownbpdp', 'Review cards the same height', 'রিভিউ কার্ডগুলো সমান উচ্চতা', 'sw', 'Product page, desktop', PP),
    row('pdp.qaLeft', 'ownbpdp', 'Left box in Questions & answers', '"Questions & answers"-এর বাম দিকের বক্স', 'sel', 'Product page, desktop', PP,
      {opts:[['helper','Quick size check (new)'], ['example','One fixed example question (as before)']]}),
    row('pdp.rowsStyle', 'ownbpdp', 'Rows at the bottom of the product page', 'প্রোডাক্ট পেজের নিচের সারিগুলো', 'sel', 'Product page, desktop', PP,
      {opts:[['one','One slider + a grid of 4 (new)'], ['two','Two sliders (as before)']]}),
    row('pdp.pairTitle', 'ownbpdp', 'Slider title (English)', 'স্লাইডারের শিরোনাম (ইংরেজি)', 'text', 'Product page (phone: first row)', PP),
    row('pdp.pairTitleBn', 'ownbpdp', 'Slider title (Bengali)', 'স্লাইডারের শিরোনাম (বাংলা)', 'text', 'Product page in বাং', PP),
    row('pdp.recentSwapSec', 'ownbpdp', 'Grid of 4 changes every … seconds (0 = never; stops while the mouse or keyboard is on it)', 'চারটার গ্রিড কত সেকেন্ড পর পর বদলাবে (০ = বদলাবে না; মাউস বা কিবোর্ড থাকলে থামে)', 'num', 'Product page, desktop', PP),
    row('pdp.recentTitle', 'ownbpdp', 'Grid title — recently viewed', 'গ্রিডের শিরোনাম — সম্প্রতি দেখা', 'text', 'Product page, desktop', PP),
    row('pdp.recentFillTitle', 'ownbpdp', 'Grid title — when nothing was viewed yet', 'গ্রিডের শিরোনাম — আগে কিছু দেখা না থাকলে', 'text', 'Product page, desktop', PP),
    row('pdp.barInfo', 'ownbpdp', 'Sticky buy bar shows rating, delivery and saving', 'উপরের স্টিকি বারে রেটিং, ডেলিভারি আর সেভিং দেখাবে', 'sw', 'Product page, desktop, after scrolling', PP),
    row('pdp.zoomSteps', 'ownbpdp', 'Photo viewer zoom steps (e.g. 1.8, 2.6, 3.6)', 'ছবি বড় করার ধাপ (যেমন 1.8, 2.6, 3.6)', 'text', 'Product photo viewer, desktop', PP),
    row('pdp.video', 'ownbpdp', 'Show product videos (YouTube link in the product)', 'প্রোডাক্টের ভিডিও দেখাবে (প্রোডাক্টে YouTube লিংক থাকলে)', 'sw', 'Product page gallery, phone and desktop', '#/p/textured-knit-polo')
  ];
  rows.forEach(function(r){ if(!zs_S(r.id)) ZS_SETTINGS.push(r); });
  var groups = [
    ['ownbcat', 'Category page — set box and side card', 'ক্যাটাগরি পেজ — সেট বক্স আর পাশের কার্ড', 'Note 51 · C1–C4'],
    ['ownbpdp', 'Product page — computer layout', 'প্রোডাক্ট পেজ — কম্পিউটারের লেআউট', 'Note 51 · P1–P8, C6']
  ];
  var at = -1; ZS_GROUPS.forEach(function(g, i){ if(g[0]==='install') at = i; });
  groups.forEach(function(g){
    if(ZS_GROUPS.some(function(x){ return x[0]===g[0]; })) return;
    if(at >= 0){ ZS_GROUPS.splice(at, 0, g); at++; } else ZS_GROUPS.push(g);
  });
})();
