/* Phone audit V12b: Bengali for the set-offer counter (phone tile + desktop hmDiyFit) */
try{ if(typeof T!=='undefined' && T.bn){ if(!T.bn['more set offers']) T.bn['more set offers'] = 'আরও সেট অফার'; if(!T.bn['more set offer']) T.bn['more set offer'] = 'আরও সেট অফার'; } }catch(e){}
/* ================= EXTAS demo — home page (20-home.js) ================= */
(function(){
  var css = [
  /* hero */
  '.hm-hero{background:var(--hero);color:var(--hero-ink);overflow:hidden}',
  '.hm-hero-in{display:flex;flex-direction:column}',
  '.hm-hero-txt{padding:40px 0 32px}',
  '.hm-hero .eyebrow{color:var(--hero-sub)}',
  '.hm-hero-title{font-size:46px;color:var(--hero-ink);margin:14px 0}',
  '.hm-hero-sub{color:var(--hero-sub);font-size:16px;line-height:1.55;max-width:440px;margin:0}',
  '.hm-hero-btns{display:flex;gap:10px;margin-top:26px}',
  '.hm-hero-btns .btn{flex:1 1 0;min-width:0;padding-left:12px;padding-right:12px}',
  /* H1. The two hero buttons were a solid white slab beside an outline, which
     read as two different controls. The owner asked for them to stay slightly
     different but much closer, and for the flat white fill to go translucent.
     Both are now the same box at the same size; "Shop now" carries a 16% fill
     and a strong edge, "Shop sets" carries no fill and a quiet edge. The fill
     is mixed from --hero-ink, so it follows every theme instead of being a
     hard white that only works on the green. */
  '.hm-btn-light{background:color-mix(in srgb, var(--hero-ink) 16%, transparent);'+
    'color:var(--hero-ink)!important;border-color:color-mix(in srgb, var(--hero-ink) 66%, transparent)}',
  '.hm-btn-light:hover{background:color-mix(in srgb, var(--hero-ink) 26%, transparent);border-color:var(--hero-ink)}',
  '.hm-btn-line{background:transparent;color:var(--hero-ink)!important;'+
    'border-color:color-mix(in srgb, var(--hero-ink) 34%, transparent)}',
  '.hm-btn-line:hover{border-color:color-mix(in srgb, var(--hero-ink) 66%, transparent)}',
  /* same size, not just a similar one: equal share of the row on a phone,
     equal minimum on a desktop where they are natural width */
  '.hm-hero-btns .btn{justify-content:center;text-align:center}',
  '.hm-hero-media{margin:0 -16px;display:flex}',
  '.hm-heroimg{aspect-ratio:1/1;border-radius:0!important;flex:1;width:100%}',
  '.pimg.hm-heroimg,.pimg.hm-lookimg,.hm-set>.pimg{align-items:stretch}',
  '@media(min-width:768px){.hm-hero-media{margin:0 -24px}}',
  '@media(min-width:1024px){',
  ' .hm-hero-in{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);gap:64px;align-items:stretch}',
  ' .hm-hero-txt{padding:80px 0;display:flex;flex-direction:column;justify-content:center}',
  ' .hm-hero-title{font-size:56px;margin:16px 0 18px}',
  ' .hm-hero-sub{font-size:17px}',
  ' .hm-hero-btns{margin-top:32px}',
  ' .hm-hero-btns .btn{flex:0 0 auto;padding:12px 28px;min-width:178px}',
  ' .hm-hero-media{margin:0 calc(-32px - max(0px, (100vw - 1240px) / 2)) 0 0}',
  ' .hm-heroimg{aspect-ratio:auto;min-height:580px;height:100%}',
  '}',
  /* shared */
  '.hm-more{display:inline-flex;align-items:center;gap:4px;font-size:13.5px;font-weight:600;color:var(--ink)!important;border-bottom:1px solid var(--ink);padding-bottom:1px;white-space:nowrap}',
  '.hm-sub{margin:5px 0 0}',
  '.hm-hscroll{display:flex;gap:12px;overflow-x:auto;margin:0 -16px;padding:0 16px 6px;scroll-snap-type:x mandatory;scrollbar-width:none}',
  '.hm-hscroll::-webkit-scrollbar{display:none}',
  '.hm-hscroll>*{flex:0 0 76%;scroll-snap-align:start;min-width:0}',
  '@media(min-width:768px){.hm-hscroll{margin:0 -24px;padding:0 24px 6px}.hm-hscroll>*{flex-basis:44%}}',
  '@media(min-width:1024px){.hm-hscroll{display:grid;grid-auto-flow:row;gap:20px;overflow:visible;margin:0;padding:0}.hm-hscroll.c3{grid-template-columns:repeat(3,minmax(0,1fr))}.hm-hscroll.c4{grid-template-columns:repeat(4,minmax(0,1fr))}}',
  /* festive */
  '.hm-festive{margin-top:16px;padding:14px 16px;display:flex;align-items:center;gap:14px;color:var(--ink)}',
  '.hm-festive>svg{color:var(--brand);flex-shrink:0}',
  ':root[data-theme="festive"] .hm-festive>svg{color:var(--gold)}',
  /* categories */
  '.hm-cat{display:block;color:var(--ink)!important;text-align:center}',
  '.hm-cat .pimg{transition:transform .25s}',
  '.hm-cat:hover .pimg{transform:scale(1.02)}',
  '.hm-cat-name{font-weight:600;font-size:13.5px;margin-top:9px;line-height:1.2}',
  '@media(min-width:1024px){.hm-cat-name{font-size:15px;margin-top:12px}}',
  /* sets band */
  '.hm-band{background:var(--brand);color:var(--brand-ink);margin-top:36px;padding:36px 0 32px}',
  '@media(min-width:1024px){.hm-band{margin-top:72px;padding:64px 0}}',
  '.hm-band .eyebrow{color:var(--brand-ink);opacity:.72}',
  '.hm-band-hd{display:flex;flex-direction:column;gap:10px;margin-bottom:22px}',
  '@media(min-width:1024px){.hm-band-hd{flex-direction:row;align-items:flex-end;justify-content:space-between;margin-bottom:36px}}',
  '.hm-band-title{color:var(--brand-ink);font-size:30px;margin-top:8px}',
  '@media(min-width:1024px){.hm-band-title{font-size:42px}}',
  '.hm-band-sub{opacity:.82;max-width:440px;margin:0;font-size:15px}',
  '.hm-set{display:flex;flex-direction:column;background:var(--surface);color:var(--ink)!important;border-radius:var(--card-radius);overflow:hidden;transition:transform .15s}',
  '.hm-set:hover{transform:translateY(-2px)}',
  '.hm-set .pimg{border-radius:0}',
  '.hm-set-info{padding:14px 14px 16px;display:flex;flex-direction:column;gap:4px;flex:1}',
  '@media(min-width:1024px){.hm-set-info{padding:16px 18px 20px}}',
  '.hm-set-diy{background:transparent;border:1px solid color-mix(in srgb, var(--brand-ink) 38%, transparent);color:var(--brand-ink)!important;padding:24px 22px;justify-content:space-between;gap:18px}',
  '.hm-set-diy .rl{font-size:13.5px;opacity:.88;padding:9px 0;border-top:1px solid color-mix(in srgb, var(--brand-ink) 22%, transparent)}',
  '.hm-btn-onbrand{background:var(--brand-ink);color:var(--brand)!important;border-color:var(--brand-ink)}',
  /* size finder strip */
  '.hm-finder{display:flex;flex-direction:column;gap:16px;align-items:flex-start;background:var(--surface);border:1px solid var(--line);border-radius:var(--card-radius);padding:22px 20px;color:var(--ink)!important}',
  ':root[data-theme="festive"] .hm-finder-ico{color:var(--gold)}',
  '.hm-finder-t{font-size:18px}',
  '.hm-finder .btn{width:100%}',
  '@media(min-width:1024px){.hm-finder{flex-direction:row;align-items:center;gap:24px;padding:28px 32px}.hm-finder-t{font-size:21px}.hm-finder .btn{width:auto}}',
  /* flash */
  '.hm-flash-hd{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:16px}',
  '@media(min-width:1024px){.hm-flash-hd{margin-bottom:22px}}',
  '.hm-cd-row{display:flex;align-items:center;gap:5px}',
  '.hm-cd{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-width:42px;padding:5px 6px 4px;background:var(--ink);color:var(--bg);border-radius:var(--radius);font-family:var(--font-display);font-weight:700;font-size:17px;line-height:1.05}',
  '.hm-cd-sep{font-weight:700;color:var(--muted)}',
  /* shop the look */
  '.hm-look{background:var(--surface);border:1px solid var(--line);border-radius:var(--card-radius);overflow:hidden;display:grid}',
  '@media(min-width:1024px){.hm-look{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}}',
  '.hm-lookimg{aspect-ratio:16/10;border-radius:0!important}',
  '@media(min-width:1024px){.hm-lookimg{aspect-ratio:auto;height:100%;min-height:440px}}',
  '.hm-look-info{padding:22px 20px 24px}',
  '@media(min-width:1024px){.hm-look-info{padding:40px 44px;display:flex;flex-direction:column;justify-content:center}}',
  '.hm-look-row{display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--line2);color:var(--ink)!important}',
  '.hm-look-thumb{width:60px;flex-shrink:0}',
  '.hm-look-thumb svg.garment{width:78%}',
  /* reviews */
  '.hm-rev{margin:0;padding:22px;display:flex;flex-direction:column;gap:14px}',
  '.hm-rev blockquote{margin:0;font-size:15.5px;line-height:1.55;color:var(--ink2)}',
  '.hm-rev figcaption{margin-top:auto;padding-top:14px;border-top:1px solid var(--line2)}',
  '@media(min-width:1024px){.hm-rev{padding:28px}.hm-rev blockquote{font-size:16.5px}}',
  /* journal */
  '.hm-art{display:block;color:var(--ink)!important}',
  '.hm-art-t{font-family:var(--font-display);font-weight:700;font-size:19px;line-height:1.25;margin:10px 0 6px}',
  '@media(min-width:1024px){.hm-art-t{font-size:23px}}',
  '.hm-art:hover .hm-art-t{text-decoration:underline;text-underline-offset:3px}'
  ].join('\n');
  var s = document.createElement('style'); s.id = 'hm-css'; s.textContent = css; document.head.appendChild(s);
})();

/* =====================================================================
   OWNER FIX A (Note 51, 20 Oct) · THE HOME PAGE TEXTS AND SWITCHES ARE
   SETTINGS. Site builder › Home edits them (96d-site-builder.js, area
   'home'); with nothing published every text below is exactly today's, so
   the phone page is unchanged. `desk` = a desktop-only wording; `bn` = the
   Bengali text shown when the shopper picks বাং (empty = the English one).
   ===================================================================== */
function homeDefault(){
  return {
    /* H1 · how far (px) the hero's coloured board reaches past the text column on a desktop (0 = as before) */
    hero:{shift:112,
      /* H2 · the two lines under the hero buttons ({windowHours} = the exchange hours from Smart Rules) */
      trust:[{id:'t1', icon:'cash', text:'Cash on Delivery all over Bangladesh', desk:'', bn:'', on:true},
             {id:'t2', icon:'swap', text:'{windowHours}-hour size exchange', desk:'{windowHours}-hour easy exchange for size or fault', bn:'', on:true}]},
    /* H7 / H10 · the sets band */
    sets:{eyebrow:'Sets & combos', title:'Buy together, save more', sub:'Ready-made sets at one price, or pick any styles yourself. Every set price is shown up front.',
      diyTitle:'Build your own set', diyText:'Mix colours and styles — the set price shows before you order.', diyBtn:'Start building', more:'See all combos',
      deskLayout:'tall', tierHi:true},
    /* H8 · the size-finder strip (its category tiles come from the categories that have a size chart: sg_cats()) */
    finder:{title:'Find your size once — height + weight, 10 seconds', text:'We remember it and show “your size in stock” on every product. Inches by default, cm if you like.',
      btn:'Find my size', btnSaved:'Update my size'},
    /* H9 · glide rows fade at both edges (off = the earlier plain box edges) */
    rowFade:true,
    /* H12 · the journal block on a desktop: this many newest posts, fixed (no slider) */
    journal:{deskCount:4}
  };
}
function homeData(){ return (typeof sbData==='function') ? sbData('home', homeDefault()) : homeDefault(); }
function homePart(k){ var d = homeData(), def = homeDefault()[k], o = d[k]; if(!o || typeof o !== 'object' || Array.isArray(o)) return def; var r = {}; for(var a in def) r[a] = def[a]; for(var b in o) if(o[b] !== undefined) r[b] = o[b]; return r; }
/* one home text: Bengali when the shop is in Bengali and one is set, else the desktop wording on a desktop, else the text */
function homeTxt(part, key){
  var o = homePart(part), bn = o[key+'Bn'];
  if(ST.lang==='bn' && bn) return bn;
  return String(o[key] == null ? homeDefault()[part][key] : o[key]);
}
function homeFill(s){ var v = {windowHours:SET('exchange','windowHours'), freeOver:SET('delivery','freeOver')}; return String(s).replace(/\{(\w+)\}/g, function(m, k){ return v.hasOwnProperty(k) && v[k] != null ? String(v[k]) : m; }); }

/* ---------- helpers ---------- */
function hm_secHd(title, href, label, sub){
  return '<div class="sec-hd"><div><h2 class="h2">'+esc(title)+'</h2>'+(sub?'<p class="small muted hm-sub">'+sub+'</p>':'')+'</div>'+
    (href?'<a class="hm-more" href="'+href+'">'+esc(label||'View all')+ico('right',14)+'</a>':'')+'</div>';
}
/* items for a combo: repeated products get different colours */
function hm_comboItems(c, pref){
  var used = {};
  return c.items.map(function(pid){
    var p = P(pid); if(!p) return null;
    var n = used[pid]||0; used[pid] = n+1;
    var col = (pref && pref[pid] && n===0 && p.colors.indexOf(pref[pid])>=0) ? pref[pid] : p.colors[n % p.colors.length];
    return {product:pid, color:col};
  }).filter(Boolean);
}
function hm_comboRegular(c){ return c.items.reduce(function(s,pid){ var p = P(pid); return s+(p?p.price:0); }, 0); }
function hm_tierText(r){
  return Object.keys(r.tiers).sort(function(a,b){return a-b;}).map(function(k){ return 'Any '+k+' for '+fmt(r.tiers[k]); }).join(' · ');
}

/* ---------- sections ---------- */
/* ---------- the page's sliders ----------
   r12: the old HM_SLIDE jumped one card every few seconds. The owner wants
   every row to glide, so the drift now comes from SMOOTH (02-core.js) — one
   continuous conveyor per track. This file only adds the mouse drag and the
   hero's two arrows on top of it. */

/* a SMOOTH track is a loop: the second half is a copy of the first, so any
   position past the halfway mark is the same picture as near the start. */
function hm_wrap(tr, x){
  var half = tr.getAttribute('data-sm') ? (tr._smHalf || tr.scrollWidth/2) : 0;
  if(!half) return Math.max(0, Math.min(x, tr.scrollWidth - tr.clientWidth));
  if(x >= half) x -= half;
  if(x < 0) x += half;
  return x;
}
/* distance between two cards, gap included */
function hm_step(tr){
  var a = tr.firstElementChild; if(!a) return tr.clientWidth;
  var b = a.nextElementSibling;
  return b ? (b.offsetLeft - a.offsetLeft) : a.offsetWidth;
}
/* --- sub-pixel shim for the conveyor tracks ---------------------------------
   Chrome quantises Element.scrollLeft to whole CSS pixels and ROUNDS on the
   way in, so SMOOTH's read-modify-write (scrollLeft += 0.4 at 24 px/s) reads
   back the number it started with and the row never moves at all. Measured:
   scrollLeft = 100 + 0.4 reads back 100; anything under 30 px/s is frozen —
   which is exactly the 18-28 px/s the owner asked for.
   So each track keeps its own fractional position and hands the browser the
   rounded pixel. SMOOTH, the drag and the arrows all go through it unchanged
   and the row advances one pixel at a time, which at this speed is a glide.
   NOTE FOR CORE: this belongs inside SMOOTH (02-core.js) so every page that
   uses it gets the same fix; it is here because this file may not edit core. */
var HM_SL_DESC = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
function hm_subpixel(tr){
  if(tr._smSub || !HM_SL_DESC || !HM_SL_DESC.set) return;
  tr._smSub = true;
  tr._smX = HM_SL_DESC.get.call(tr);
  Object.defineProperty(tr, 'scrollLeft', {
    configurable:true,
    get:function(){ return this._smX; },
    set:function(v){ this._smX = v; HM_SL_DESC.set.call(this, Math.round(v)); }
  });
  /* a finger-scroll or a wheel moves the real scroller behind our back */
  tr.addEventListener('scroll', function(){
    var real = HM_SL_DESC.get.call(tr);
    if(Math.abs(real - Math.round(tr._smX)) > 1) tr._smX = real;
  }, {passive:true});
}

/* mouse drag; a phone already scrolls the track natively.
   TA-2 (T3): the drag now lives in the shared SMOOTH engine (02-core.js) so
   every row on every page gets the same one; this name is kept for callers. */
function hm_drag(tr){ SMOOTH.drag(tr); }
/* 2. Every row on this page glides. One call per track so a direction or a
   speed is a one-line change; 18-28 px/s reads as a calm glide. */
function hm_glide(){
  SMOOTH.stopAll();                        /* every render replaces the DOM */
  ['hm-sltrack','hm-settrack','hm-flash1','hm-flash2','hm-revtrack','hm-jtrack'].forEach(function(id){
    var tr = document.getElementById(id); if(!tr || tr.classList.contains('hm-jfixed')) return;
    hm_subpixel(tr);                       /* before SMOOTH.start, which sets scrollLeft */
    hm_drag(tr);
  });
  SMOOTH.start('hm-sltrack',  {dir:-1, speed:20});
  SMOOTH.start('hm-settrack', {dir:-1, speed:18});  /* the owner said EVERY slider */
  /* 4. the two flash rows pass each other: top drifts left, bottom right */
  SMOOTH.start('hm-flash1',   {dir:-1, speed:24});
  SMOOTH.start('hm-flash2',   {dir: 1, speed:24});
  SMOOTH.start('hm-revtrack', {dir:-1, speed:19});  /* 5. reviews drift on their own */
  /* 6. journal, same glide — H12: not on a desktop, where the four newest posts stand still */
  var jt = document.getElementById('hm-jtrack');
  if(!(jt && jt.classList.contains('hm-jfixed'))) SMOOTH.start('hm-jtrack',   {dir:-1, speed:20});
}
/* Arrow buttons on the hero: data-tr names the track, data-d the direction.
   One card per tap, eased by hand — a native smooth scroll would be cancelled
   by the conveyor writing scrollLeft on the same frame. */
ACT['hm-slide'] = function(el){
  var id = el.getAttribute('data-tr'), tr = document.getElementById(id);
  if(!tr) return;
  var d = Number(el.getAttribute('data-d') || 1);
  var from = tr.scrollLeft, dist = hm_step(tr) * d, t0 = 0;
  tr.style.scrollBehavior = 'auto';
  function run(now){
    if(!t0) t0 = now;
    var k = Math.min(1, (now - t0) / 380);
    tr.scrollLeft = hm_wrap(tr, from + dist * (1 - Math.pow(1 - k, 3)));
    if(k < 1) requestAnimationFrame(run);
  }
  requestAnimationFrame(run);
};

/* 1. The winter banner is a slider, not two fixed panels.
   The owner adds as many pictures as they like to HERO_SLIDES; three show at
   once on a desktop and two on a phone, it advances on its own and can be
   dragged. The track sits behind the "Winter 2026" panel, so a slide passes
   under it, never over it. */
var HERO_SLIDES = [
  /* No `label`: the pin carries the product's real name. The owner asked for the
     pin to widen for a long name, not for the name to be cut down. */
  {product:'heavyweight-hoodie',     color:'black'},
  {product:'classic-cotton-panjabi', color:'white'},
  {product:'slim-chino-trousers',    color:'khaki'},
  {product:'oxford-cotton-shirt',    color:'sky'},
  {product:'textured-knit-polo',     color:'bottle'},
  {product:'everyday-crew-tee',      color:'black'},
  {product:'relaxed-twill-trousers', color:'olive'},
  {product:'essential-pique-polo',   color:'navy'},
  {product:'linen-blend-shirt',      color:'sand'},
  {product:'heavy-cotton-tee',       color:'ecru'},
  {product:'classic-cotton-panjabi', color:'maroon'},
  {product:'heavyweight-hoodie',     color:'olive'},
  {product:'long-sleeve-polo',       color:'white'},
  {product:'pocket-tee',             color:'sky'}
];
/* the pin is one row: name | price (| old price). The name is the only part
   allowed to shrink, so the price never gets cut off or pushed onto line two. */
function hm_pin(name, price, compareAt){
  /* Long names step the type down instead of losing their last word. The
     owner asked for this to be automatic, so it is MEASURED, not guessed from
     the name's length: AUTO-FIT (03-layout.js) shrinks each pin until the
     whole name and the price sit on the slide, at any phone width. */
  return '<span class="hm-pin">'+
    '<b class="hm-pin-n">'+esc(name)+'</b>'+
    '<i class="hm-pin-bar" aria-hidden="true"></i>'+
    '<span class="hm-pin-p">'+fmt(price)+'</span>'+
    (compareAt && compareAt > price ? '<s class="hm-pin-o">'+fmt(compareAt)+'</s>' : '')+
  '</span>';
}
/* Desktop A · D-006: on a desktop the pin never goes under 11 px (D1.4); the
   phone floor stays 9 px. The desktop pin is two lines (name / price row,
   r12-zzdesk-a.css), so the sale price is never the part that drops out. */
fitRule('.hm-slider .hm-sl .hm-pin', {get min(){ return (typeof deskOn==='function' && deskOn()) ? 11 : 9; }, collapse:true});
function hm_heroSlider(){
  var slides = HERO_SLIDES.map(function(sl){
    var p = P(sl.product); if(!p) return '';
    var col = (p.colors.indexOf(sl.color)>=0) ? sl.color : p.colors[0];
    var hex = COL(col).hex, cat = CAT(p.cat)||{};
    return '<a class="hm-sl" href="#/p/'+p.id+'?color='+encodeURIComponent(col)+'" '+
      'style="background:'+mixHex(hex,'#EFEDE8',isLight(hex)?.55:.8)+'">'+
      garmentSVG(p.garment||cat.garment, hex, 'front')+
      hm_pin(sl.label||p.name, p.price, p.compareAt)+'</a>';
  }).filter(Boolean).join('');
  if(!slides) return '';
  return '<div class="hm-slider" data-hero-slider><div class="hm-sltrack" id="hm-sltrack">'+slides+'</div>'+
    '<button type="button" class="hm-slnav prev" data-act="hm-slide" data-tr="hm-sltrack" data-d="-1" aria-label="Previous">'+ico('back',18)+'</button>'+
    '<button type="button" class="hm-slnav next" data-act="hm-slide" data-tr="hm-sltrack" data-d="1" aria-label="Next">'+ico('right',18)+'</button></div>';
}
/* 14.1 — "Shop sets" background, FOUR OPTIONS FOR THE OWNER TO PICK FROM.
   "Shop now" carries a translucent fill; "Shop sets" carried none. Each
   option below stays a little different from "Shop now" but clearly its
   sibling — same box, same size, same type. All of them are mixed from the
   theme's own hero tokens, so they follow Classic / Noir / Ivory / Festive.
     'current' — today's look: no fill, quiet edge (the default until he picks)
     'v1'      — Soft glass:   half of Shop now's fill, a slightly firmer edge
     'v2'      — Deep shade:   the hero colour pressed darker, a solid fill
     'v3'      — Brand tint:   a wash of the hero's own mint (--hero-sub)
     'v4'      — Frosted:      a top-lit glass gradient with a hairline highlight
   To preview on a phone without editing anything: open  #/?setsbtn=v3
   BACKEND HOOK: Dashboard › Home › Hero buttons writes this one value. */
/* R15 · 1.1 — the owner marked row 4 of shopsets-compare.png in red = v3 "Brand tint". */
var HERO_SETS_BTN = 'v3';
function hm_setsBtnVariant(){
  var q = (typeof CUR !== 'undefined' && CUR.query && CUR.query.setsbtn) || '';
  var v = q || HERO_SETS_BTN;
  return /^v[1-4]$/.test(v) ? v : 'current';
}
/* =====================================================================
   R15 · 3.12. THE HERO BUTTONS ARE THE OWNER'S, NOT THE CODE'S.
   Each button is one row of settings, edited in the dashboard:
     on      show it or not
     label   the words ("Shop now", "Shop sets", "Top bottom set" ...) —
             Bengali can be added beside it (label_bn)
     href    where it goes (a category, a combo, a set, a landing page)
     style   'fill' (the translucent fill) or 'sets' (follows HERO_SETS_BTN,
             today v3 Brand tint) or 'line' (outline only)
   One, two or three buttons; they share the row evenly. Nothing else in the
   hero needs touching when the owner changes them.
   ===================================================================== */
var HERO_BTNS = [
  {on:true, label:'Shop now',  href:'#/c/hoodies',     style:'fill', id:'hero-shop'},
  {on:true, label:'Shop sets', href:'#/combo/polo-duo', style:'sets', id:'hero-sets'}
];
function hm_heroBtns(){
  var list = ((typeof ST!=='undefined' && ST.heroBtns) || HERO_BTNS).filter(function(b){ return b && b.on !== false && b.label; });
  if(!list.length) return '';
  var cls = {fill:'hm-btn-light', sets:'hm-btn-line hm-sets-'+hm_setsBtnVariant(), line:'hm-btn-line'};
  return '<div class="hm-hero-btns n'+list.length+'">'+list.map(function(b, i){
    var lab = (ST.lang==='bn' && b.label_bn) ? b.label_bn : t(b.label);
    return '<a class="btn '+(cls[b.style]||cls.line)+'" href="'+esc(b.href||'#/')+'" data-testid="'+esc(b.id||('hero-btn-'+i))+'">'+esc(lab)+'</a>';
  }).join('')+'</div>';
}
/* H2 · the promise lines under the buttons, from Site builder › Home (phone text = as before) */
function hm_heroTrust(){
  var desk = typeof deskOn==='function' && deskOn();
  var list = (homePart('hero').trust || []).filter(function(x){ return x && x.on !== false && (x.text || x.desk || x.bn); });
  if(!list.length) return '';
  return '<div class="hm-hero-trust'+(desk ? ' hm-trust-d n'+list.length : '')+'">'+list.map(function(x){
    var s = (ST.lang==='bn' && x.bn) ? x.bn : ((desk && x.desk) ? x.desk : (x.text || x.desk || ''));
    return '<span>'+ico(x.icon || 'check',15)+esc(homeFill(s))+'</span>';
  }).join('<i class="hm-trust-bar" aria-hidden="true"></i>')+'</div>';
}
function hm_hero(){
  var media = hm_heroSlider();
  /* H1 · desktop only: the coloured board reaches further right (the text keeps its place) */
  var sh = (typeof deskOn==='function' && deskOn()) ? Math.max(0, Math.min(240, +homePart('hero').shift || 0)) : 0;
  return '<section class="hm-hero" aria-label="New collection"'+(sh ? ' style="--hero-shift:'+sh+'px"' : '')+'><div class="container hm-hero-in">'+
    '<div class="hm-hero-txt">'+
      '<div class="eyebrow">'+esc(t('New collection'))+'</div>'+
      '<h1 class="display hm-hero-title">'+esc(t('Winter 2026'))+'</h1>'+
      /* H1 · desktop: one sentence per line, so the two lines read as two thoughts (phone text unchanged) */
      '<p class="hm-hero-sub">'+(sh ? String(t('heroSub')).split(/(?<=[.!?।])\s+/).map(function(s){ return '<span class="hm-sub-s">'+esc(s)+'</span>'; }).join(' ') : esc(t('heroSub')))+'</p>'+
      hm_heroBtns()+
      /* 1. One line, bar-separated, the FULL promise — "all over Bangladesh" is
         the part a Bangladeshi customer is actually checking for. The type is
         sized off the viewport in r12-home.css so the whole sentence reaches
         both edges of the column at 440px without ever wrapping. */
      hm_heroTrust()+
    '</div>'+
    '<div class="hm-hero-media">'+media+'</div>'+
  '</div></section>';
}

function hm_festive(){
  if(!ST.festive) return '';
  return '<div class="container"><div class="tint hm-festive">'+ico('clock',22)+
    '<div class="grow"><div class="small bold">Eid delivery</div><div class="small text2">'+esc(ruleText('festive','short'))+'</div></div>'+
    '<a class="hm-more hide-m" href="#/c/panjabi">Shop the Eid edit</a></div></div>';
}
function hm_cats(){
  var tiles = DB.categories.filter(function(c){ return !c.hidden; }).map(function(c){
    var ps = productsIn(c.id), p = ps[0]; if(!p) return '';
    return '<a class="hm-cat" href="#/c/'+c.id+'" data-testid="cat-tile-'+c.id+'">'+productImg(p, p.colors[0], {label:false, ratio:'ratio-34'})+
      '<div class="hm-cat-name">'+esc(t(c.name))+'</div><div class="xs muted">'+plural(ps.length,'style')+'</div></a>';
  }).join('');
  return '<section class="section"><div class="container">'+hm_secHd(t('Shop by category'), '#/c/new', 'Shop all')+'<div class="grid g6">'+tiles+'</div></div></section>';
}
function hm_newList(){
  var pick = ['textured-knit-polo','long-sleeve-polo','oxford-cotton-shirt','classic-cotton-panjabi','heavy-cotton-tee','slim-chino-trousers','jersey-zip-polo','pocket-tee'];
  var out = pick.map(P).filter(Boolean);
  DB.products.forEach(function(p){ if(out.length<8 && p.cat!=='extras' && out.indexOf(p)<0) out.push(p); });
  return out.slice(0,8);
}
function hm_newIn(){
  return '<section class="section"><div class="container">'+hm_secHd(t('New in'), '#/c/new', 'View all', 'Fresh styles this week')+
    '<div class="grid g4">'+hm_newList().map(function(p){ return productCard(p); }).join('')+'</div></div></section>';
}
function hm_sets(){
  var list = combos().filter(function(c){ return c.active; });
  var rules = setRules().filter(function(r){ return r.active; });
  if(!list.length && !rules.length) return '';
  /* Desktop A · D-007: the desktop grid has 4 columns and the Build card is
     the last tile, so it shows the most sets that fill whole rows (7 of 10 +
     Build = 2 rows). The rest carry hm-dhide, which only the desktop CSS
     reads; the phone row keeps every set. "See all combos" leads on. */
  var keep = Math.max(3, 4*Math.floor((list.length+1)/4)-1);
  /* H7 (owner 20 Oct) · desktop: 3 sets on top, 3 below, and the Build card as
     one tall tile on the right spanning both rows. 'grid' = the old 4-up rows. */
  var S = homePart('sets'), desk = typeof deskOn==='function' && deskOn(), tall = desk && S.deskLayout !== 'grid';
  if(tall) keep = Math.min(6, list.length);
  var tierHTML = function(r){
    /* H10 · desktop: each set price in the sale colour, bold (phone text unchanged) */
    /* Phone audit V12b: same words on the phone, but each "Any 2 for ৳1,500" stays on one line (a price never splits after the ৳) */
    /* Note 54 E (owner): the desktop price look is his pick (Admin › Settings › "Build your own set — price style");
       'none' = the original plain line, the default until he approves a style */
    var ps = typeof setPriceStyle==='function' ? setPriceStyle() : (S.tierHi !== false ? 'chip' : 'none');
    if(desk && ps !== 'none' && ps !== 'chip' && typeof setPriceTiers==='function') return setPriceTiers(r, ps);
    if(!(desk && ps === 'chip')) return Object.keys(r.tiers).sort(function(a,b){return a-b;}).map(function(k){ return '<span class="hm-tier-m">'+esc('Any '+k+' for '+fmt(r.tiers[k]))+'</span>'; }).join(' · ');
    return Object.keys(r.tiers).sort(function(a,b){return a-b;}).map(function(k){ return '<span class="hm-tier">'+esc(k+' for')+' <b class="hm-tier-p">'+esc(fmt(r.tiers[k]))+'</b></span>'; }).join(' ');
  };
  var cards = list.map(function(c, ci){
    var items = hm_comboItems(c), reg = hm_comboRegular(c), save = reg - c.price;
    return '<a class="hm-set'+(ci>=keep?' hm-dhide':'')+'" href="#/combo/'+c.id+'" data-testid="home-combo-'+c.id+'">'+setImg(items, {ratio:'ratio-11'})+
      '<div class="hm-set-info"><div class="row between" style="align-items:flex-start;gap:8px"><span class="h3" style="font-size:16px">'+esc(c.name)+'</span>'+(save>0?'<span class="tag sale shrink0">Save '+fmt(save)+'</span>':'')+'</div>'+
      '<div class="xs muted">'+esc(c.blurb)+'</div>'+
      '<div class="row mt8" style="gap:8px;align-items:baseline;margin-top:auto;padding-top:8px">'+priceHTML(c.price, save>0?reg:0, 18)+'</div></div></a>';
  }).join('');
  var diy = '<a class="hm-set hm-set-diy" href="#/set" data-testid="home-build-set"><div>'+ico('layers',30)+
    '<div class="h2 mt16" style="color:inherit">'+esc(homeTxt('sets','diyTitle'))+'</div><div class="small mt8" style="opacity:.85">'+esc(homeTxt('sets','diyText'))+'</div></div>'+
    '<div'+(tall ? ' class="hm-diy-rules"' : '')+'>'+rules.map(function(r){ return '<div class="rl"><b>'+esc(r.name)+'</b><br>'+tierHTML(r)+'</div>'; }).join('')+
      /* Phone audit V12b: on phone/tablet the tile is never taller than the set cards beside it; offers that do not
         fit are hidden from the end and counted here (hmDiyFitPhone, below) — no card is stretched with empty space */
      (!tall ? '<div class="hm-diy-more hm-diy-more-m" hidden></div>' : '')+
      /* H7 · the tall tile is as high as the two rows of sets; offers that do not fit are counted here (hmDiyFit, 97a-owner-a.js) */
      (tall ? '<div class="hm-diy-more" hidden></div>' : '')+'</div>'+
    '<span class="btn hm-btn-onbrand btn-block">'+esc(homeTxt('sets','diyBtn'))+ico('right',16)+'</span></a>';
  return '<section class="hm-band" aria-label="Sets and combos"><div class="container">'+
    '<div class="hm-band-hd"><div><div class="eyebrow">'+esc(homeTxt('sets','eyebrow'))+'</div><h2 class="display hm-band-title">'+esc(homeTxt('sets','title'))+'</h2></div>'+
    '<p class="hm-band-sub">'+esc(homeTxt('sets','sub'))+'</p></div>'+
    /* the sets row is a slider too, so it glides like the rest (hm_glide) */
    '<div class="hm-hscroll c4'+(tall ? ' hm-sets-tall' : '')+'" id="hm-settrack">'+cards+diy+'</div>'+
    ((typeof DESK_NAV!=='undefined' && DESK_NAV.combos) ? '<div class="hm-band-more hide-m"><a class="hm-more" href="#/combos">'+esc(homeTxt('sets','more'))+ico('right',14)+'</a></div>' : '')+
    '</div></section>';
}
function hm_finder(){
  var ms = mySize();
  var saved = ms ? '<div class="small brandc bold mt8">Saved: Top '+esc(ms.top||'\u2014')+' \u00b7 Waist '+esc(ms.bottom||'\u2014')+' \u2014 we use it as a hint, you always choose.</div>' : '';
  /* the ruler sits inline in front of "Find", so line two runs the full width */
  return '<section class="section"><div class="container"><a class="hm-finder" href="#/size-guide" data-act="size-guide" data-testid="home-finder">'+
    /* H8 \u00b7 the words are the owner's (Site builder \u203a Home); the window it opens lists every category with a size chart (sg_cats) */
    '<div class="grow hm-finder-body"><div class="h2 hm-finder-t"><span class="hm-finder-ico">'+ico('ruler',17)+'</span>'+esc(homeTxt('finder','title'))+'</div>'+
    '<div class="small text2 mt8">'+esc(homeTxt('finder','text'))+'</div>'+saved+'</div>'+
    '<span class="btn btn-primary">'+esc(homeTxt('finder', ms ? 'btnSaved' : 'btn'))+ico('right',16)+'</span></a></div></section>';
}
/* H3. ONLY REAL MARKDOWNS GO IN THE FLASH SALE.
   A flash sale is a discount by definition, so every card in these two rows
   has to show the old price struck through beside the new one. The old code
   topped the rows up from the full catalogue once the markdowns ran out, so
   6 of the 8 cards the owner saw carried a single price and no strike.
   Now the rows are built from the markdowns alone and repeat to fill the
   conveyor — the second row starts half a lap in so the two never show the
   same card side by side.
   BACKEND HOOK: a product is in the flash sale when it carries a compareAt
   greater than its price (01-data.js). To drive the sale from a campaign
   list instead, replace hm_flashList() with that list; nothing else changes. */
function hm_flashList(){
  return DB.products.filter(function(p){ return p.compareAt && p.compareAt > p.price; });
}
function hm_flashRows(){
  var sale = hm_flashList();
  if(!sale.length) return [[], []];
  /* a conveyor needs enough cards to fill the screen twice over, or SMOOTH's
     half-width wrap shows a gap; 8 is two and a bit screens at 76% per card */
  var N = Math.max(8, sale.length);
  var a = [], b = [];
  for(var i = 0; i < N; i++){
    a.push(sale[i % sale.length]);
    b.push(sale[(i + Math.ceil(sale.length / 2)) % sale.length]);
  }
  return [a, b];
}
function hm_flash(){
  var list = DB.products.filter(function(p){ return p.compareAt && p.compareAt > p.price; });
  if(!list.length) return '';
  var maxOff = Math.max.apply(null, list.map(function(p){ return Math.round((1-p.price/p.compareAt)*100); }));
  var rows = hm_flashRows();
  var cd = function(v){ return '<span class="hm-cd">'+v+'</span>'; };
  var row = function(id, items){
    return '<div class="hm-hrow hm-flashrow" id="'+id+'">'+items.map(function(p){ return productCard(p); }).join('')+'</div>';
  };
  return '<section class="section"><div class="container">'+
    '<div class="hm-flash-hd"><div><div class="row" style="gap:10px"><h2 class="h2">'+esc(t('Flash sale'))+'</h2><span class="tag sale">Up to '+maxOff+'% off</span></div><p class="small muted hm-sub">Limited stock at these prices</p></div>'+
    '<div class="hm-cd-wrap"><span class="xs muted bold hm-cd-lbl">Ends in</span><div class="hm-cd-row" aria-label="Ends in 4 hours 12 minutes">'+cd('04')+'<span class="hm-cd-sep">:</span>'+cd('12')+'<span class="hm-cd-sep">:</span>'+cd('38')+'</div></div></div>'+
    row('hm-flash1', rows[0])+row('hm-flash2', rows[1])+
    '</div></section>';
}
function hm_look(){
  var c = COMBO('office-trio'); if(!c) return '';
  var items = hm_comboItems(c, {'oxford-cotton-shirt':'sky','slim-chino-trousers':'navy','textured-knit-polo':'ecru'});
  var reg = hm_comboRegular(c);
  var rows = items.map(function(it){ var p = P(it.product);
    return '<a class="hm-look-row" href="#/p/'+p.id+'?color='+it.color+'">'+productImg(p, it.color, {ratio:'ratio-11', label:false, cls:'hm-look-thumb'})+
      /* H11 (owner 20 Oct, phone too): bolder names, bigger prices, a bigger "Together", the old price in red, "You save" highlighted — r12-zz-ownerA.css */
      '<div class="grow"><div class="small bold hm-look-n">'+esc(p.name)+'</div><div class="xs muted">'+esc(COL(it.color).name)+' · '+esc(p.fit)+'</div></div><span class="price small hm-look-p">'+fmt(p.price)+'</span></a>'; }).join('');
  var foot = c.active
    ? '<div class="row between mt16 hm-look-tot" style="align-items:baseline"><span class="small text2 hm-look-tg">Together</span><span class="row" style="gap:8px;align-items:baseline">'+priceHTML(c.price, reg>c.price?reg:0, 22)+'</span></div>'+
      (reg>c.price?'<div class="hm-look-savew"><span class="xs brandc bold hm-look-save">You save '+fmt(reg-c.price)+'</span></div>':'')+
      '<a class="btn btn-primary btn-block mt16" href="#/combo/'+c.id+'">Shop the look'+ico('right',16)+'</a>'
    : '<div class="row between mt16"><span class="small text2">Total</span><span class="price">'+fmt(reg)+'</span></div>';
  return '<section class="section"><div class="container">'+hm_secHd('Shop the look', null, null, 'Put together by our team')+
    '<div class="hm-look">'+setImg(items, {ratio:'hm-lookimg'})+
    '<div class="hm-look-info"><div class="eyebrow">Office · Weekdays</div><h3 class="h1 mt8" style="font-size:28px">'+esc(c.name)+'</h3>'+
    '<p class="small text2" style="margin:8px 0 10px">'+esc(c.blurb)+'. Smart enough for meetings, easy enough for the commute.</p>'+rows+foot+'</div></div></div></section>';
}
function hm_reviews(){
  var tot = 0, sum = 0; DB.products.forEach(function(p){ tot += p.reviews; sum += p.rating*p.reviews; });
  var avg = tot ? sum/tot : 0;
  /* 3. Ten, not three — one or two quotes reads like a staged page. */
  var cards = DB.reviewsSample.slice(0,10).map(function(r){
    return '<figure class="card hm-rev"><div class="row between">'+starsHTML(r.stars, 15)+(r.fit?'<span class="tag plain">'+esc(r.fit)+'</span>':'')+'</div>'+
      '<blockquote>“'+esc(r.text)+'”</blockquote>'+
      '<figcaption><div class="small"><b>'+esc(r.name)+'</b> <span class="muted">· '+esc(r.h)+' · '+esc(r.w)+' · Size '+esc(r.size)+'</span></div>'+
      '<div class="row xs brandc bold mt8" style="gap:4px">'+ico('check',13)+'Verified buyer</div></figcaption></figure>';
  }).join('');
  var hd = '<div class="sec-hd"><div><h2 class="h2">'+esc(t('What customers say'))+'</h2><p class="small muted hm-sub">Real height, weight and size — so you can compare</p></div>'+
    '<div class="row hide-m" style="gap:8px">'+starsHTML(avg, 16)+'<span class="small"><b>'+avg.toFixed(1)+'</b> <span class="muted">· '+tot.toLocaleString('en-US')+' reviews</span></span></div></div>';
  /* Desktop A · D-008: the desktop grid shows 9 (3 full rows, CSS) and offers the top-rated styles */
  return '<section class="section"><div class="container">'+hd+'<div class="hm-hscroll c3 hm-revs" id="hm-revtrack">'+cards+'</div>'+
    '<div class="hm-revs-more hide-m"><a class="hm-more" href="#/c/new" data-act="desk-toprated">Shop our top-rated styles'+ico('right',14)+'</a></div>'+
    '<div class="row hide-d mt12" style="gap:8px">'+starsHTML(avg, 14)+'<span class="small"><b>'+avg.toFixed(1)+'</b> <span class="muted">· '+tot.toLocaleString('en-US')+' reviews</span></span></div></div></section>';
}
/* H5. THE JOURNAL IS WIRED UP.
   Every card, every "Read article" and the footer's Journal link used to be
   href="#/" with a toast on top — twelve dead links in the most-scrolled part
   of the page. Each article now has a real address built from its title, the
   section has a "View all" to the index, and both routes render below. */
function hm_journalSlug(a){
  if(a && a.slug) return a.slug;      /* backend wave 2: an article's own slug (Blog admin) wins */
  return String(a.t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}
function hm_journalBySlug(slug){
  var list = DB.journal || [];
  for(var i = 0; i < list.length; i++){ if(hm_journalSlug(list[i]) === slug) return list[i]; }
  return null;
}
function hm_journalCard(a){
  var p = P(a.p); if(!p) return '';
  var col = (p.colors.indexOf(a.c) >= 0) ? a.c : p.colors[0];
  return '<a class="hm-art" href="#/'+(a.lang==='bn' ? 'bn/' : '')+'journal/'+hm_journalSlug(a)+'"'+(a.lang==='bn' ? ' lang="bn"' : '')+'>'+productImg(p, col, {ratio:'ratio-wide', labelText:'[ journal photo ]'})+
    '<div class="eyebrow mt16">'+esc(a.e)+'</div><div class="hm-art-t">'+esc(a.t)+'</div><p class="small text2" style="margin:0 0 10px">'+esc(a.x)+'</p>'+
    '<span class="hm-more">Read article'+ico('right',14)+'</span></a>';
}
function hm_journal(){
  /* the newest ten, newest first. H12 (owner 20 Oct) · desktop: the newest four
     only, fixed — no slider, no arrows. DB.journal is the blog's published list
     (94-admin-blog.js zb_apply, newest last), so a new post takes the first
     place, the others move one step and the oldest of the four drops out. */
  var desk = typeof deskOn==='function' && deskOn(), n = Math.max(1, Math.min(8, +homePart('journal').deskCount || 4));
  /* QA V12b: a Bengali twin (same slug, lang 'bn') is the same article — the
     block showed both cards side by side, and the Bengali card opened the
     English page. One card per slug, in the shopper's language. */
  var want = (typeof ST!=='undefined' && ST && ST.lang==='bn') ? 'bn' : 'en', bySlug = {}, uniq = [];
  (DB.journal || []).slice().reverse().forEach(function(a){
    var k = hm_journalSlug(a), i = bySlug[k];
    if(i == null){ bySlug[k] = uniq.length; uniq.push(a); }
    else if((a.lang==='bn' ? 'bn' : 'en')===want && (uniq[i].lang==='bn' ? 'bn' : 'en')!==want) uniq[i] = a;
  });
  var arts = uniq.slice(0, desk ? n : 10);
  var cards = arts.map(hm_journalCard).join('');
  return '<section class="section"><div class="container">'+hm_secHd('From the journal', '#/journal', 'View all', 'Fit tips and style notes')+
    '<div class="hm-hrow hm-jrow'+(desk ? ' hm-jfixed' : '')+'" id="hm-jtrack"'+(desk ? ' style="--hm-jn:'+n+'"' : '')+'>'+cards+'</div></div></section>';
}

/* The journal index and the article page. The demo has the headline, the
   section and the standfirst for each piece — that is what DB.journal holds —
   so the article page shows those, the garment the piece is about, and the
   two neighbouring reads. The full body text arrives with the Blog & SEO
   module; until then the page is honest about it rather than a dead link. */
PAGES.journal = {
  layout:'store',
  title:function(params){
    var a = params[0] ? hm_journalBySlug(params[0]) : null;
    return a ? a.t : 'The EXTAS Journal';
  },
  render:function(params){
    var all = (DB.journal || []).slice().reverse();
    if(!params[0]){
      return '<div class="container"><div class="cat-hd">'+
        '<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">/</span><span aria-current="page">Journal</span></nav>'+
        '<h1 class="h1">The EXTAS Journal</h1><p class="text2">Fit tips, fabric notes and style guides — written for Bangladeshi weather and Bangladeshi sizes.</p></div>'+
        '<div class="grid g3 mt24">'+all.map(hm_journalCard).join('')+'</div></div>';
    }
    var a = hm_journalBySlug(params[0]);
    if(!a) return '<div class="container empty"><h1 class="h1">Article not found</h1><p class="muted mt12">This journal piece does not exist in the demo.</p><a class="btn btn-primary mt16" href="#/journal">All articles</a></div>';
    var p = P(a.p), col = p ? ((p.colors.indexOf(a.c) >= 0) ? a.c : p.colors[0]) : null;
    var i = all.indexOf(a);
    var near = [all[i-1], all[i+1]].filter(Boolean);
    return '<div class="container"><div class="cat-hd">'+
      '<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">/</span><a href="#/journal">Journal</a><span aria-hidden="true">/</span><span aria-current="page">'+esc(a.t)+'</span></nav>'+
      '<div class="eyebrow mt16">'+esc(a.e)+'</div><h1 class="h1">'+esc(a.t)+'</h1>'+
      '<p class="text2">'+esc(a.x)+'</p></div>'+
      (p ? productImg(p, col, {ratio:'ratio-wide', labelText:'[ journal photo ]'}) : '')+
      /* backend wave 2: the article body from the Blog admin (paragraphs split
         by a blank line); the placeholder only when there is no body yet */
      (a.body ? '<div class="pg-body mt24"'+(a.lang==='bn'?' lang="bn"':'')+'>'+String(a.body).split(/\n\s*\n/).map(function(par){ return '<p class="text2" style="line-height:1.7;margin:0 0 14px">'+esc(par.trim()).replace(/\n/g,'<br>')+'</p>'; }).join('')+'</div>'
        : '<div class="soft p20 mt24"><div class="h3">The rest of this article</div>'+
      '<p class="small text2 mt8" style="margin-bottom:0">Article bodies are written and published from the dashboard (Blog &amp; SEO) in the full build. The headline, section and standfirst above are the real ones from this shop\'s journal.</p></div>')+
      (p ? '<section class="section"><div class="sec-hd"><h2 class="h2">What this piece is about</h2></div>'+
        '<div class="grid g4">'+productCard(p, col ? {color:col} : {})+'</div></section>' : '')+
      (near.length ? '<section class="section"><div class="sec-hd"><h2 class="h2">Read next</h2><a class="hm-more" href="#/journal">All articles'+ico('right',14)+'</a></div>'+
        '<div class="grid g3">'+near.map(hm_journalCard).join('')+'</div></section>' : '')+
    '</div>';
  }
};

/* =====================================================================
   LAYOUT-BUILDER HOOK (PR 595/596). The home page is an ordered list of
   section renderers. The page builder may reorder, remove or splice in
   entries ({id, render:function(){ return html; }}); the default list and
   its output are exactly the page as it was. lbGutters() adds the two empty
   side gutters (#lb-side-l, #lb-side-r) on a desktop only.
   ===================================================================== */
var HOME_SECTIONS = [
  {id:'hero', render:function(){ return hm_hero(); }},
  {id:'festive', render:function(){ return hm_festive(); }},
  {id:'categories', render:function(){ return hm_cats(); }},
  {id:'new-in', render:function(){ return hm_newIn(); }},
  {id:'sets', render:function(){ return hm_sets(); }},
  {id:'size-finder', render:function(){ return hm_finder(); }},
  {id:'flash-sale', render:function(){ return hm_flash(); }},
  {id:'shop-the-look', render:function(){ return hm_look(); }},
  {id:'reviews', render:function(){ return hm_reviews(); }},
  {id:'journal', render:function(){ return hm_journal(); }}
];
PAGES.home = {
  layout:'store',
  title:function(){ return 'Premium menswear in Bangladesh'; },
  render:function(){
    return (typeof lbGutters==='function' ? lbGutters() : '') + HOME_SECTIONS.map(function(sec){ try{ return sec.render() || ''; }catch(e){ console.error('home section '+sec.id, e); return ''; } }).join('');
  },
  after:function(){ hm_glide(); }
};

/* AUTO-FIT (03-layout.js) for the flash heading and the footer link columns
   (the footer is on every store page; the rule lives here with the rest of
   the home/footer fitting). */
fitRule('.hm-flash-hd', {min:12, box:true, collapse:true});
fitRule('.ftr-s3 .ftr-cols', {min:11, collapse:true});
fitRule('.hm-art .eyebrow', {min:9.5, group:'hmart', collapse:true});

/* Phone audit V12b (R1): AUTO ADJUST for the phone/tablet sets row. The Build-your-own tile shows every offer
   that fits within the height of the tallest set card; the rest are counted ("+ 5 more set offers").
   At least two offers always show (the approved V12 tile listed three). Runs after every render, on resize and when the fonts arrive (97a-owner-a.js hooks). */
function hmDiyFitPhone(){
  var row = document.getElementById('hm-settrack'); if(!row || row.classList.contains('hm-sets-tall')) return;
  var ds = [].slice.call(row.querySelectorAll('.hm-set-diy')); if(!ds.length) return;
  ds.forEach(function(d){ [].forEach.call(d.querySelectorAll('.rl'), function(r){ r.hidden = false; }); var m = d.querySelector('.hm-diy-more-m'); if(m) m.hidden = true; d.style.display = 'none'; });
  var H = 0; [].forEach.call(row.children, function(c){ if(!c.classList.contains('hm-set-diy')) H = Math.max(H, c.getBoundingClientRect().height); });
  ds.forEach(function(d){ d.style.display = ''; });
  if(!H) return;
  /* the clones of the sliding row show exactly what the first tile shows */
  var setHid = function(d, hid){ var rls = [].slice.call(d.querySelectorAll('.rl')), more = d.querySelector('.hm-diy-more-m');
    rls.forEach(function(r, i){ r.hidden = i >= rls.length - hid; });
    if(more){ more.hidden = !hid; more.textContent = hid ? '+ '+hid+' '+(hid === 1 ? t('more set offer') : t('more set offers')) : ''; } };
  ds.forEach(function(d){ if(d !== ds[0]) d.style.display = 'none'; });
  var first = ds[0], n = first.querySelectorAll('.rl').length, hid = 0;
  while(n - hid > 2 && first.getBoundingClientRect().height > H + 0.5){ hid++; setHid(first, hid); }   /* at least 2 offers stay (V12 showed 3) */
  ds.forEach(function(d){ d.style.display = ''; if(d !== first) setHid(d, hid); });
}
