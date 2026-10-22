/* =====================================================================
   98d-hero.js — HERO & CAMPAIGNS (ROUND15 Note 54 #17, CN-012). Shilpi শিল্পী.
     Admin › Operations › "Hero & campaigns"  (#/admin/hero)
       · campaigns: name, dates, template, linked collection, status
       · presets: Winter · Puja · Eid · Summer · Hot deals
       · ten ready hero templates (layouts and colour moods)
       · "Design your own": headline, line, colours, picture, button → a new
         template, with a live preview
     Storefront: the home hero draws the live campaign's template and its
     products come from the campaign's collection.
     Demo controls (?demo=1 only): a switcher previews each campaign.
   Which campaign is live: every campaign that is switched on and whose dates
   include today; when two overlap, the shorter one wins (a festival beats a
   season). The default "Winter 2026" campaign is the hero exactly as it was.
   Everything is the owner's (ST.heroCamp) — nothing here is typed into pages.
   ===================================================================== */

/* ---------- templates ---------- */
var HC_TPL = [
  {id:'classic',   en:'Classic board and slider', bn:'ক্লাসিক বোর্ড আর স্লাইডার', mood:['Shop colour','শপের রং'], pal:null},
  {id:'editorial', en:'Editorial ivory',          bn:'এডিটোরিয়াল, আইভরি',       mood:['Ivory · serif','আইভরি · সেরিফ'],     pal:{bg:'#F3EEE5', ink:'#1E1C19', acc:'#8C6A43'}},
  {id:'night',     en:'Night and gold',           bn:'রাত আর সোনালি',            mood:['Black · gold','কালো · সোনালি'],      pal:{bg:'#111213', ink:'#F1ECE2', acc:'#C9A66B'}},
  {id:'statement', en:'Centred statement',        bn:'মাঝখানে বড় কথা',           mood:['Soft green','হালকা সবুজ'],          pal:{bg:'#E4EDE8', ink:'#17322B', acc:'#1F4E46'}},
  {id:'festive',   en:'Festive frame',            bn:'উৎসবের ফ্রেম',              mood:['Crimson · gold','লাল · সোনালি'],     pal:{bg:'#6B1424', ink:'#FBEFDC', acc:'#D8AE5C'}},
  {id:'crescent',  en:'Eid crescent',             bn:'ঈদের চাঁদ',                 mood:['Emerald · gold','পান্না সবুজ · সোনালি'], pal:{bg:'#0F3B32', ink:'#F5EFE2', acc:'#D7B46E'}},
  {id:'summer',    en:'Summer light',             bn:'গ্রীষ্মের আলো',             mood:['Sand · sky','বালু · আকাশি'],         pal:{bg:'#F2E8D7', ink:'#1F2B30', acc:'#D9724A'}},
  {id:'deals',     en:'Hot deals',                bn:'হট ডিল',                    mood:['Off-white · red','অফ-হোয়াইট · লাল'], pal:{bg:'#F7F3EC', ink:'#1B1A18', acc:'#C2362B'}},
  {id:'mono',      en:'Minimal mono',             bn:'মিনিমাল সাদা-কালো',          mood:['White · black','সাদা · কালো'],      pal:{bg:'#FFFFFF', ink:'#111111', acc:'#111111'}},
  {id:'mosaic',    en:'Lookbook mosaic',          bn:'লুকবুক মোজাইক',              mood:['Stone · ink','পাথুরে · কালো'],      pal:{bg:'#E9E5DE', ink:'#1C1B19', acc:'#3E5B52'}}
];
var HC_LAYOUTS = [['split', ['Text left, picture right','বামে লেখা, ডানে ছবি']], ['center', ['Text in the middle, products under it','মাঝে লেখা, নিচে পণ্য']], ['minimal', ['Big picture left, text right','বামে বড় ছবি, ডানে লেখা']]];

/* ---------- the owner's data ---------- */
function hcDefault(){
  return {
    campaigns:[
      {id:'winter', name:'Winter 2026', start:'2026-10-01', end:'2027-02-28', tpl:'classic', coll:'hero', on:true, base:true,
        eyebrow:'', title:'', sub:'', btn:'', link:'', btn2:'', link2:''},
      {id:'puja', name:'Puja festive', start:'2026-10-17', end:'2026-10-21', tpl:'festive', coll:'panjabi', on:false,
        eyebrow:'Puja collection', title:'Celebrate in colour', sub:'Panjabi, shirts and polos for every evening of Puja. Cash on Delivery all over Bangladesh.',
        btn:'Shop the Puja edit', link:'#/c/panjabi', btn2:'Shop sets', link2:'#/set'},
      {id:'eid', name:'Eid ul-Fitr 2027', start:'2027-03-01', end:'2027-03-10', tpl:'crescent', coll:'panjabi', on:true,
        eyebrow:'Eid collection', title:'Eid, dressed well', sub:'Soft cotton panjabi in deep, rich colours. Order early so it reaches you before Eid.',
        btn:'Shop Eid panjabi', link:'#/c/panjabi', btn2:'See all', link2:'#/c/new'},
      {id:'summer', name:'Summer 2027', start:'2027-04-01', end:'2027-06-30', tpl:'summer', coll:'tshirts', on:true,
        eyebrow:'Summer 2027', title:'Light, cool, easy', sub:'Breathable tees, polos and linen shirts for hot Dhaka days.',
        btn:'Shop summer', link:'#/c/tshirts', btn2:'Shop polos', link2:'#/c/polos'},
      {id:'deals', name:'Hot deals 11.11', start:'2026-11-11', end:'2026-11-13', tpl:'deals', coll:'sale', on:true,
        eyebrow:'11.11 hot deals', title:'Up to {maxOff}% off', sub:'Three days only, until {end}. Cash on Delivery all over Bangladesh.',
        btn:'Shop the deals', link:'#/c/new', btn2:'', link2:''}
    ],
    custom:[]
  };
}
function hc(){
  if(!ST.heroCamp || !Array.isArray(ST.heroCamp.campaigns)) return hcDefault();
  if(!Array.isArray(ST.heroCamp.custom)) ST.heroCamp.custom = [];
  return ST.heroCamp;
}
function hcEdit(){ if(!ST.heroCamp || !Array.isArray(ST.heroCamp.campaigns)) ST.heroCamp = hcDefault(); return ST.heroCamp; }
function hcCamp(id){ return hc().campaigns.filter(function(c){ return c.id === id; })[0] || null; }
function hcTpl(id){
  var t = HC_TPL.filter(function(x){ return x.id === id; })[0]; if(t) return t;
  var c = hc().custom.filter(function(x){ return x.id === id; })[0];
  return c ? {id:c.id, en:c.name || 'My template', bn:c.name || 'আমার টেমপ্লেট', mood:[c.layout, c.layout], pal:{bg:c.bg, ink:c.ink, acc:c.acc}, custom:c} : HC_TPL[0];
}
function hcTplList(){ return HC_TPL.concat(hc().custom.filter(function(c){ return !c.hidden; }).map(function(c){ return hcTpl(c.id); })); }

/* ---------- dates and status ---------- */
function hcToday(){ var d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function hcStatus(c){
  if(!c.on) return 'draft';
  var t = hcToday();
  if(c.start && t < c.start) return 'scheduled';
  if(c.end && t > c.end) return 'ended';
  return 'live';
}
var HC_ST = {live:['Live','চলছে'], scheduled:['Scheduled','সময় ঠিক করা'], ended:['Ended','শেষ'], draft:['Off','বন্ধ']};
function hcDays(c){ var a = Date.parse(c.start || '2000-01-01'), b = Date.parse(c.end || '2100-01-01'); return (b - a) / 864e5; }
function hcFmtDate(s){ if(!s) return ''; var d = new Date(s+'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}); }
function hcFmtShort(s){ if(!s) return ''; var d = new Date(s+'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-GB', {day:'numeric', month:'short'}); }
/* the campaign the shop shows now */
function hcRunning(){
  var live = hc().campaigns.filter(function(c){ return hcStatus(c) === 'live'; });
  live.sort(function(a, b){ return hcDays(a) - hcDays(b); });
  return live[0] || null;
}
function hcShown(){
  var pv = (typeof demoToolsOn === 'function' && demoToolsOn()) ? (ST.heroPreview || '') : '';
  if(pv){ var p = hcCamp(pv); if(p) return p; }
  return hcRunning();
}

/* ---------- a campaign's products and words ---------- */
var HC_COLL_FIXED = [['hero', ['Hero slides (as now)','হিরো স্লাইড (এখনকার মতো)']], ['new', ['New in','নতুন']], ['sale', ['On sale','সেলে আছে']]];
function hcCollList(){ return HC_COLL_FIXED.concat((DB.categories || []).filter(function(c){ return !c.unlisted && productsIn(c.id).length; }).map(function(c){ return [c.id, [c.name, c.name]]; })); }
function hcCollName(id){ var l = hcCollList().filter(function(x){ return x[0] === id; })[0]; return l ? l[1][0] : id; }
function hcProducts(c, n){
  var out = [];
  if(c.coll === 'hero' && typeof HERO_SLIDES !== 'undefined') out = HERO_SLIDES.map(function(s){ var p = P(s.product); return p ? {p:p, color:p.colors.indexOf(s.color) >= 0 ? s.color : p.colors[0]} : null; }).filter(Boolean);
  else {
    var list = c.coll === 'sale' ? DB.products.filter(function(p){ return p.compareAt > p.price; })
      : c.coll === 'new' ? (typeof hm_newList === 'function' ? hm_newList() : DB.products)
      : productsIn(c.coll);
    out = list.filter(function(p){ return p && !p.hidden && p.cat !== 'extras'; }).map(function(p, i){ return {p:p, color:p.colors[i % 2 && p.colors[1] ? 1 : 0]}; });
  }
  if(!out.length) out = DB.products.slice(0, 6).map(function(p){ return {p:p, color:p.colors[0]}; });
  return out.slice(0, n || 6);
}
function hcMaxOff(c){
  var m = 0; hcProducts(c, 40).forEach(function(x){ if(x.p.compareAt > x.p.price) m = Math.max(m, Math.round((1 - x.p.price / x.p.compareAt) * 100)); });
  return m || 10;
}
function hcFill(c, s){
  return String(s || '').replace(/\{(\w+)\}/g, function(m, k){
    if(k === 'maxOff') return String(hcMaxOff(c));
    if(k === 'end') return hcFmtShort(c.end);
    if(k === 'windowHours') return String(SET('exchange','windowHours'));
    return m;
  });
}
function hcTxt(c, k, tpl){
  var v = (ST.lang === 'bn' && c[k+'Bn']) ? c[k+'Bn'] : c[k];
  if((v == null || v === '') && tpl && tpl.custom){ var cu = tpl.custom; v = (ST.lang === 'bn' && cu[k+'Bn']) ? cu[k+'Bn'] : cu[k]; }
  if(v == null || v === ''){
    var d = {eyebrow:t('New collection'), title:c.name || '', sub:'', btn:t('Shop now'), link:c.coll && c.coll !== 'hero' && c.coll !== 'sale' && c.coll !== 'new' ? '#/c/'+c.coll : '#/c/new'};
    v = d[k] != null ? d[k] : '';
  }
  return hcFill(c, v);
}
function hcPal(c, tpl){
  var p = tpl.pal || {bg:'#1F4E46', ink:'#FFFFFF', acc:'#9FD3BF'}, o = c.colors || {};
  return {bg:o.bg || p.bg, ink:o.ink || p.ink, acc:o.acc || p.acc};
}
/* a garment drawn on its own soft tile (no photos in the demo; a real photo wins in the full build) */
function hcPic(x, cls, tile){
  var hex = COL(x.color).hex, cat = CAT(x.p.cat) || {};
  var bg = tile === false ? 'transparent' : (tile || mixHex(hex, '#EFEDE8', isLight(hex) ? .55 : .8));
  return '<a class="hc-pic '+(cls || '')+'" href="#/p/'+esc(x.p.id)+'?color='+encodeURIComponent(x.color)+'" style="background:'+bg+'" aria-label="'+esc(x.p.name)+'">'+garmentSVG(x.p.garment || cat.garment, hex, 'front')+'</a>';
}
function hcPrice(x){ return '<span class="hc-pr"><b>'+fmt(x.p.price)+'</b>'+(x.p.compareAt > x.p.price ? '<s>'+fmt(x.p.compareAt)+'</s>' : '')+'</span>'; }
function hcBtns(c, tpl, cls){
  var b1 = hcTxt(c, 'btn', tpl), l1 = hcTxt(c, 'link', tpl), b2 = (ST.lang === 'bn' && c.btn2Bn) ? c.btn2Bn : c.btn2, l2 = c.link2 || '#/c/new';
  return '<div class="hc-btns '+(cls || '')+'">'+(b1 ? '<a class="hc-btn" href="'+esc(l1)+'" data-testid="hc-btn">'+esc(b1)+'</a>' : '')+(b2 ? '<a class="hc-btn2" href="'+esc(l2)+'">'+esc(b2)+ico('right',15)+'</a>' : '')+'</div>';
}
function hcTrust(){ return typeof hm_heroTrust === 'function' ? hm_heroTrust() : ''; }

/* ---------- the ten ready templates + "design your own" ---------- */
var HC_R = {};
HC_R.editorial = function(c, T, P){
  /* the big picture is the first darker colour, so it never melts into the ivory */
  var k = P.findIndex(function(x){ return !isLight(COL(x.color).hex); }); if(k > 0){ P = P.slice(); var d = P.splice(k, 1)[0]; P.unshift(d); }
  return '<div class="container hc-in"><div class="hc-txt"><div class="hc-eye"><i></i>'+esc(hcTxt(c,'eyebrow',T))+'</div><h1 class="hc-h">'+esc(hcTxt(c,'title',T))+'</h1><p class="hc-sub">'+esc(hcTxt(c,'sub',T))+'</p>'+hcBtns(c, T)+'</div>'+
    '<div class="hc-media">'+hcPic(P[0], 'hc-big')+hcPic(P[1] || P[0], 'hc-small')+'<div class="hc-cap"><span>'+esc(P[0].p.name)+'</span>'+hcPrice(P[0])+'</div></div></div>';
};
HC_R.night = function(c, T, P){
  return '<div class="container hc-in"><div class="hc-txt"><div class="hc-eye">'+esc(hcTxt(c,'eyebrow',T))+'</div><h1 class="hc-h">'+esc(hcTxt(c,'title',T))+'</h1><i class="hc-rule"></i><p class="hc-sub">'+esc(hcTxt(c,'sub',T))+'</p>'+hcBtns(c, T)+'</div>'+
    '<div class="hc-media"><div class="hc-spot">'+hcPic(P[0], 'hc-big', false)+'</div><div class="hc-thumbs">'+P.slice(1, 4).map(function(x){ return '<div class="hc-th">'+hcPic(x, '', 'rgba(255,255,255,.06)')+'<span>'+esc(x.p.name)+'</span>'+hcPrice(x)+'</div>'; }).join('')+'</div></div></div>';
};
HC_R.statement = function(c, T, P){
  return '<div class="container hc-in"><div class="hc-txt"><div class="hc-eye">'+esc(hcTxt(c,'eyebrow',T))+'</div><h1 class="hc-h">'+esc(hcTxt(c,'title',T))+'</h1><p class="hc-sub">'+esc(hcTxt(c,'sub',T))+'</p>'+hcBtns(c, T)+'</div>'+
    '<div class="hc-row">'+P.slice(0, 4).map(function(x){ return '<div class="hc-card">'+hcPic(x)+'<div class="hc-cn"><span>'+esc(x.p.name)+'</span>'+hcPrice(x)+'</div></div>'; }).join('')+'</div></div>';
};
HC_R.festive = function(c, T, P){
  return '<div class="hc-frame-o" aria-hidden="true"></div><div class="container hc-in"><div class="hc-txt"><div class="hc-eye">'+esc(hcTxt(c,'eyebrow',T))+'</div><h1 class="hc-h">'+esc(hcTxt(c,'title',T))+'</h1>'+
    '<div class="hc-orn" aria-hidden="true"><i></i><b></b><i></i></div><p class="hc-sub">'+esc(hcTxt(c,'sub',T))+'</p>'+hcBtns(c, T)+'</div>'+
    '<div class="hc-media">'+P.slice(0, 2).map(function(x, i){ return '<div class="hc-arch'+(i ? ' two' : '')+'">'+hcPic(x)+'<span class="hc-acap"><span>'+esc(x.p.name)+'</span><b>'+fmt(x.p.price)+'</b></span></div>'; }).join('')+'</div></div>';
};
HC_R.crescent = function(c, T, P){
  return '<div class="hc-moon" aria-hidden="true"></div><div class="hc-arcs" aria-hidden="true"></div><div class="container hc-in"><div class="hc-txt"><div class="hc-eye">'+esc(hcTxt(c,'eyebrow',T))+'</div><h1 class="hc-h">'+esc(hcTxt(c,'title',T))+'</h1><p class="hc-sub">'+esc(hcTxt(c,'sub',T))+'</p>'+hcBtns(c, T)+'</div>'+
    '<div class="hc-media"><div class="hc-arch">'+hcPic(P[0])+'</div><div class="hc-cap"><span>'+esc(P[0].p.name)+'</span>'+hcPrice(P[0])+'</div></div></div>';
};
HC_R.summer = function(c, T, P){
  return '<div class="container hc-in"><div class="hc-txt"><div class="hc-eye">'+esc(hcTxt(c,'eyebrow',T))+'</div><h1 class="hc-h">'+esc(hcTxt(c,'title',T))+'</h1><p class="hc-sub">'+esc(hcTxt(c,'sub',T))+'</p>'+hcBtns(c, T)+'</div>'+
    '<div class="hc-grid">'+P.slice(0, 4).map(function(x){ return '<div class="hc-tile">'+hcPic(x)+'<span>'+esc(x.p.name)+'</span></div>'; }).join('')+'</div></div>';
};
HC_R.deals = function(c, T, P){
  var title = hcTxt(c,'title',T), m = /^(.*?)(\d+%)(.*)$/.exec(title);
  var h = m ? esc(m[1])+'<b class="hc-big-n">'+esc(m[2])+'</b>'+esc(m[3]) : esc(title);
  return '<div class="container hc-in"><div class="hc-txt"><div class="hc-eye"><span class="hc-tag">'+ico('bolt',14)+esc(hcTxt(c,'eyebrow',T))+'</span>'+(c.end ? '<span class="hc-ends">'+ico('clock',14)+esc((ST.lang === 'bn' ? 'শেষ ' : 'Ends ')+hcFmtShort(c.end))+'</span>' : '')+'</div><h1 class="hc-h">'+h+'</h1><p class="hc-sub">'+esc(hcTxt(c,'sub',T))+'</p>'+hcBtns(c, T)+'</div>'+
    '<div class="hc-row">'+P.slice(0, 3).map(function(x){ var off = x.p.compareAt > x.p.price ? Math.round((1 - x.p.price / x.p.compareAt) * 100) : 0;
      return '<div class="hc-card">'+(off ? '<span class="hc-off">−'+off+'%</span>' : '')+hcPic(x)+'<div class="hc-cn"><span>'+esc(x.p.name)+'</span>'+hcPrice(x)+'</div></div>'; }).join('')+'</div></div>';
};
HC_R.mono = function(c, T, P){
  return '<div class="container hc-in"><div class="hc-media">'+hcPic(P[0], 'hc-big', '#F1F0EE')+'</div><div class="hc-txt"><div class="hc-eye">'+esc(hcTxt(c,'eyebrow',T))+'</div><h1 class="hc-h">'+esc(hcTxt(c,'title',T))+'</h1><p class="hc-sub">'+esc(hcTxt(c,'sub',T))+'</p>'+hcBtns(c, T)+
    '<div class="hc-list">'+P.slice(1, 4).map(function(x){ return '<a href="#/p/'+esc(x.p.id)+'"><span>'+esc(x.p.name)+'</span>'+hcPrice(x)+'</a>'; }).join('')+'</div></div></div>';
};
HC_R.mosaic = function(c, T, P){
  return '<div class="container hc-in"><div class="hc-txt"><div class="hc-eye">'+esc(hcTxt(c,'eyebrow',T))+'</div><h1 class="hc-h">'+esc(hcTxt(c,'title',T))+'</h1><p class="hc-sub">'+esc(hcTxt(c,'sub',T))+'</p>'+hcBtns(c, T)+'</div>'+
    '<div class="hc-mos">'+hcPic(P[0], 'm1')+hcPic(P[1] || P[0], 'm2')+hcPic(P[2] || P[0], 'm3')+'</div></div>';
};
/* the owner's own template: one of three layouts, his colours, picture and words */
HC_R.custom = function(c, T, P){
  var cu = T.custom || {}, L = cu.layout || 'split';
  var pic = cu.img ? '<div class="hc-pic hc-big hc-photo"><img src="'+esc(cu.img)+'" alt=""></div>' : hcPic(cu.product ? {p:P0(cu.product) || P[0].p, color:cu.color || (P0(cu.product) || P[0].p).colors[0]} : P[0], 'hc-big');
  var txt = '<div class="hc-txt"><div class="hc-eye">'+esc(hcTxt(c,'eyebrow',T))+'</div><h1 class="hc-h">'+esc(hcTxt(c,'title',T))+'</h1><p class="hc-sub">'+esc(hcTxt(c,'sub',T))+'</p>'+hcBtns(c, T)+'</div>';
  if(L === 'center') return '<div class="container hc-in">'+txt+'<div class="hc-row">'+P.slice(0, 4).map(function(x){ return '<div class="hc-card">'+hcPic(x)+'<div class="hc-cn"><span>'+esc(x.p.name)+'</span>'+hcPrice(x)+'</div></div>'; }).join('')+'</div></div>';
  if(L === 'minimal') return '<div class="container hc-in"><div class="hc-media">'+pic+'</div>'+txt+'</div>';
  return '<div class="container hc-in">'+txt+'<div class="hc-media">'+pic+'</div></div>';
};
function P0(id){ return typeof P === 'function' ? P(id) : null; }
/* one hero, any template (also used for the admin previews) */
function hcRender(c, opt){
  opt = opt || {};
  var T = hcTpl(c.tpl), pal = hcPal(c, T), prods = hcProducts(c, 6);
  if(c.tpl === 'classic') return hcClassic(c);
  var r = T.custom ? HC_R.custom : (HC_R[T.id] || HC_R.editorial);
  var cls = T.custom ? 'hc-custom hc-l-'+(T.custom.layout || 'split') : 'hc-'+T.id;
  return '<section class="hc-hero '+cls+'" data-testid="hc-hero" data-camp="'+esc(c.id)+'" data-tpl="'+esc(c.tpl)+'" aria-label="'+esc(c.name || 'Campaign')+'" style="--hc-bg:'+esc(pal.bg)+';--hc-ink:'+esc(pal.ink)+';--hc-acc:'+esc(pal.acc)+'">'+r(c, T, prods)+'</section>';
}
/* classic = the hero as it was; a campaign only swaps its products and words */
var hm_hero0 = typeof hm_hero === 'function' ? hm_hero : null;
function hcClassic(c){
  if(!hm_hero0) return '';
  var plain = c.coll === 'hero' && !c.eyebrow && !c.title && !c.sub && !c.btn && !c.eyebrowBn && !c.titleBn && !c.subBn;
  if(plain) return hm_hero0();
  var keep = HERO_SLIDES, html;
  try{ if(c.coll !== 'hero') HERO_SLIDES = hcProducts(c, 14).map(function(x){ return {product:x.p.id, color:x.color}; }); html = hm_hero0(); } finally { HERO_SLIDES = keep; }
  var T = hcTpl('classic');
  var swap = function(a, b){ if(b) html = html.replace(a, b); };
  if(c.eyebrow || c.eyebrowBn) swap('<div class="eyebrow">'+esc(t('New collection'))+'</div>', '<div class="eyebrow">'+esc(hcTxt(c,'eyebrow',T))+'</div>');
  if(c.title || c.titleBn) swap(/<h1 class="display hm-hero-title">[\s\S]*?<\/h1>/, '<h1 class="display hm-hero-title">'+esc(hcTxt(c,'title',T))+'</h1>');
  if(c.sub || c.subBn) swap(/<p class="hm-hero-sub">[\s\S]*?<\/p>/, '<p class="hm-hero-sub">'+esc(hcTxt(c,'sub',T))+'</p>');
  if(c.btn) swap(/<div class="hm-hero-btns[\s\S]*?<\/a><\/div>/, '<div class="hm-hero-btns n'+(c.btn2 ? 2 : 1)+'"><a class="btn hm-btn-light" href="'+esc(hcTxt(c,'link',T))+'" data-testid="hero-shop">'+esc(hcTxt(c,'btn',T))+'</a>'+(c.btn2 ? '<a class="btn hm-btn-line hm-sets-'+hm_setsBtnVariant()+'" href="'+esc(c.link2 || '#/c/new')+'">'+esc(c.btn2)+'</a>' : '')+'</div>');
  return html.replace('<section class="hm-hero"', '<section class="hm-hero" data-camp="'+esc(c.id)+'"');
}
/* the storefront hero */
if(hm_hero0){
  hm_hero = function(){
    var c = hcShown(); if(!c) return hm_hero0();
    return hcRender(c);
  };
}

/* ---------- demo controls: preview any campaign (?demo=1 only) ---------- */
function hcDemoSeg(seg){
  var list = hc().campaigns;
  return '<div style="font-weight:600;margin:12px 0 6px">Hero campaign</div>'+
    '<div class="seg hc-dseg">'+[['', 'Auto']].concat(list.map(function(c){ return [c.id, c.name.replace(/\s+20\d\d$/, '')]; })).map(function(o){
      return '<button data-act="demo-hero" data-v="'+esc(o[0])+'" class="'+((ST.heroPreview || '') === o[0] ? 'on' : '')+'">'+esc(o[1])+'</button>'; }).join('')+'</div>';
}
ACT['demo-hero'] = function(el){ ST.heroPreview = el.getAttribute('data-v') || ''; saveState(); rerender(); };

/* =====================================================================
   ADMIN · #/admin/hero
   ===================================================================== */
if(typeof zo_route === 'function'){ zo_route(/^\/admin\/hero$/, 'admin-hero'); zo_link(['Hero & campaigns', '#/admin/hero', 'star', null]); }
function hcE(en, bn){ return ST.adminLang === 'bn' && bn ? bn : en; }
function hcFrame(c, zoom){
  return '<div class="hc-prev" style="--z:'+(zoom || .5)+'"><div class="hc-prev-in" aria-hidden="true" inert>'+hcRender(c)+'</div></div>';
}
/* every preview is the 1366 px desktop hero, scaled to the box it sits in */
function hcZoomFit(){
  [].forEach.call(document.querySelectorAll('.hc-prev'), function(f){ var w = f.clientWidth; if(w) f.style.setProperty('--z', (w / 1366).toFixed(4)); });
}
(function(){
  if(typeof MutationObserver === 'undefined') return;
  var tick = 0;
  new MutationObserver(function(){ if(tick) return; tick = requestAnimationFrame(function(){ tick = 0; if(document.querySelector('.hc-prev')) hcZoomFit(); }); }).observe(document.body, {childList:true, subtree:true});
  window.addEventListener('resize', function(){ if(document.querySelector('.hc-prev')) hcZoomFit(); });
})();
function hcStatusPill(c){ var s = hcStatus(c), shown = hcRunning(); return '<span class="hc-st hc-st-'+s+'">'+esc(HC_ST[s][0])+(shown && shown.id === c.id ? ' · on the site' : '')+'</span>'; }
PAGES['admin-hero'] = { layout:'admin', title:'Hero & campaigns', render:function(){
  var D = hc(), now = hcRunning();
  var head = (typeof zs_head === 'function') ? zs_head('Shop · home page', 'Hero & campaigns', 'হিরো আর ক্যাম্পেইন',
    'Plan the big picture at the top of the home page: a campaign (Winter, Puja, Eid, Summer, Hot deals or any offer) with its dates, a ready template and the collection whose products it shows. When two campaigns run on the same day, the shorter one shows — a festival beats a season.',
    '<button class="btn btn-primary" data-act="hc-new" data-v="">'+ico('plus',16)+'New campaign</button><button class="btn btn-secondary" data-act="hc-design">'+ico('edit',16)+'Design your own template</button>') : '<h1 class="h1">Hero & campaigns</h1>';
  var live = '<section class="zs-card hc-now"><div class="row between wrap" style="gap:10px"><div><div class="eyebrow">On the site now</div><h2 class="h3" style="margin:4px 0 2px">'+(now ? esc(now.name) : 'No campaign running — the standard hero shows')+'</h2>'+
      (now ? '<div class="small text2">'+esc(hcTpl(now.tpl).en)+' · '+esc(hcCollName(now.coll))+' · '+esc(hcFmtDate(now.start))+' – '+esc(hcFmtDate(now.end))+'</div>' : '')+'</div>'+
      '<div class="row" style="gap:8px"><a class="btn btn-ghost btn-sm" href="#/">'+ico('eye',15)+'Open the shop</a>'+(now ? '<button class="btn btn-ghost btn-sm" data-act="hc-edit" data-id="'+esc(now.id)+'">'+ico('edit',15)+'Edit</button>' : '')+'</div></div>'+
      (now ? hcFrame(now, .62) : '')+'</section>';
  var presets = '<div class="hc-presets"><span class="small text2">Start from a preset:</span>'+hcDefault().campaigns.map(function(c){ return '<button class="chip" data-act="hc-new" data-v="'+esc(c.id)+'">'+ico('plus',13)+esc(c.name.replace(/\s+20\d\d$/, '').replace(/ 11\.11$/, ''))+'</button>'; }).join('')+'</div>';
  var rows = D.campaigns.map(function(c){
    return '<tr data-testid="hc-row"><td><b>'+esc(c.name)+'</b></td><td class="nowrap">'+esc(hcFmtDate(c.start))+' – '+esc(hcFmtDate(c.end))+'</td><td>'+esc(hcTpl(c.tpl).en)+'</td><td>'+esc(hcCollName(c.coll))+'</td><td>'+hcStatusPill(c)+'</td>'+
      '<td class="hc-acts">'+(typeof zs_sw === 'function' ? zs_sw(c.on, 'hc-on', 'Switch '+c.name+' on or off', 'data-id="'+esc(c.id)+'"') : '')+
      '<button class="btn btn-ghost btn-sm" data-act="hc-edit" data-id="'+esc(c.id)+'">Edit</button><a class="btn btn-ghost btn-sm" href="#/?demo=1" data-act="hc-preview" data-id="'+esc(c.id)+'">Preview</a></td></tr>';
  }).join('');
  var table = '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="h3">Campaigns</h2>'+presets+'</div>'+
    '<div class="tbl-wrap mt12"><table class="tbl hc-tbl"><thead><tr><th>Name</th><th>Dates</th><th>Template</th><th>Collection</th><th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<p class="xs muted mt8">Off = saved but never shown. Scheduled = switches itself on at the start date and off after the end date.</p></section>';
  var demoC = now || D.campaigns[0];
  var tpls = '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2 class="h3">Templates</h2><button class="btn btn-secondary btn-sm" data-act="hc-design">'+ico('plus',15)+'Design your own</button></div>'+
    '<p class="small text2" style="margin:4px 0 12px">Ten ready designs and the ones you make. Each one takes the campaign\'s words and products.</p><div class="hc-tgrid">'+
    hcTplList().map(function(T){ var c = {id:'pv-'+T.id, name:demoC.name, tpl:T.id, coll:T.id === 'classic' ? 'hero' : (T.id === 'deals' ? 'sale' : (demoC.coll === 'hero' ? 'hoodies' : demoC.coll)),
        eyebrow:T.id === 'classic' ? '' : (demoC.eyebrow || 'New collection'), title:T.id === 'classic' ? '' : (T.id === 'deals' ? 'Up to {maxOff}% off' : (demoC.title || demoC.name)), sub:T.id === 'classic' ? '' : (demoC.sub || 'Hoodies, sweatshirts and jackets for Bangladeshi winters.'), btn:T.id === 'classic' ? '' : (demoC.btn || 'Shop now'), link:'#/c/new', btn2:'', end:'2026-11-13', on:true};
      return '<div class="hc-tcard" data-testid="hc-tpl">'+hcFrame(c, .24)+'<div class="hc-tmeta"><b>'+esc(T.en)+'</b><span class="xs muted">'+esc(T.mood ? T.mood[0] : '')+'</span>'+
        (T.custom ? '<button class="link xs" data-act="hc-design" data-id="'+esc(T.id)+'">Edit</button>' : '')+'</div></div>'; }).join('')+'</div></section>';
  return '<div class="hc-admin">'+head+live+table+tpls+'</div>';
}};

/* ---------- campaign editor (modal, live preview) ---------- */
var HC_ED = null;
function hcEdForm(){
  var c = HC_ED.c, f = function(k, lab, ph, type){ return '<label class="hc-f"><span class="label">'+esc(lab)+'</span><input class="input" data-input="hc-f" data-k="'+k+'" type="'+(type || 'text')+'" value="'+esc(c[k] || '')+'"'+(ph ? ' placeholder="'+esc(ph)+'"' : '')+'></label>'; };
  var tplPick = '<div class="hc-pick">'+hcTplList().map(function(T){ return '<button type="button" class="hc-pk'+(c.tpl === T.id ? ' on' : '')+'" data-act="hc-tpl" data-v="'+esc(T.id)+'" aria-pressed="'+(c.tpl === T.id)+'"><span class="hc-sw" style="background:'+esc(T.pal ? T.pal.bg : 'var(--hero)')+'"><i style="background:'+esc(T.pal ? T.pal.acc : 'var(--hero-sub)')+'"></i></span>'+esc(T.en)+'</button>'; }).join('')+'</div>';
  var coll = '<label class="hc-f"><span class="label">Collection (its products show in the hero)</span><select class="input" data-change="hc-coll">'+hcCollList().map(function(o){ return '<option value="'+esc(o[0])+'"'+(c.coll === o[0] ? ' selected' : '')+'>'+esc(o[1][0])+'</option>'; }).join('')+'</select></label>';
  var col = c.colors || {}, T = hcTpl(c.tpl), pal = hcPal(c, T);
  var colours = c.tpl === 'classic' ? '<p class="xs muted">The classic template uses the shop\'s own theme colours.</p>' :
    '<div class="hc-cols">'+[['bg','Background'],['ink','Text'],['acc','Accent']].map(function(x){ return '<label class="hc-col"><input type="color" data-input="hc-col" data-k="'+x[0]+'" value="'+esc(pal[x[0]])+'"><span class="xs">'+x[1]+'</span></label>'; }).join('')+
    '<button type="button" class="link xs" data-act="hc-colreset">Template colours</button></div>';
  return '<div class="hc-ed"><div class="hc-edl stack s12">'+
    f('name', 'Campaign name', 'e.g. Puja festive')+'<div class="sb-grid2">'+f('start', 'Starts', '', 'date')+f('end', 'Ends', '', 'date')+'</div>'+
    '<div><span class="label">Template</span>'+tplPick+'</div>'+coll+
    f('eyebrow', 'Small line on top', c.tpl === 'classic' ? t('New collection') : '')+f('title', 'Headline', c.tpl === 'classic' ? t('Winter 2026') : '{maxOff} = biggest saving in the collection')+f('sub', 'Line under the headline', c.tpl === 'classic' ? t('heroSub') : '{end} = the end date')+
    '<div class="sb-grid2">'+f('btn', 'Button words', 'Shop now')+f('link', 'Button goes to', '#/c/panjabi')+'</div>'+
    '<div class="sb-grid2">'+f('btn2', 'Second link (optional)', '')+f('link2', 'Second link goes to', '#/set')+'</div>'+
    '<div class="sb-grid2">'+f('titleBn', 'Headline in Bengali (optional)', '')+f('subBn', 'Line in Bengali (optional)', '')+'</div>'+
    '<div><span class="label">Colours</span>'+colours+'</div>'+
    '<label class="check"><input type="checkbox" data-change="hc-onck"'+(c.on ? ' checked' : '')+'><span>Switched on (shows between the dates)</span></label>'+
    '<div class="row" style="gap:8px"><button class="btn btn-primary" data-act="hc-save">'+ico('check',16)+'Save campaign</button><button class="btn btn-ghost" data-act="close-modal">Cancel</button></div>'+
  '</div><div class="hc-edr"><div class="eyebrow">Live preview</div><div id="hc-live">'+hcFrame(c, .44)+'</div><p class="xs muted">Phone and computer both follow this design.</p></div></div>';
}
function hcLive(){ var el = document.getElementById('hc-live'); if(el && HC_ED) el.innerHTML = hcFrame(HC_ED.c, .44); }
function hcOpen(c, isNew){
  HC_ED = {c:JSON.parse(JSON.stringify(c)), isNew:isNew};
  openModal(hcEdForm(), {title:isNew ? 'New campaign' : 'Edit campaign', wide:true, rebuild:hcEdForm});
}
ACT['hc-new'] = function(el){
  var v = el.getAttribute('data-v'), pre = hcDefault().campaigns.filter(function(c){ return c.id === v; })[0];
  var c = pre ? JSON.parse(JSON.stringify(pre)) : {name:'New campaign', start:hcToday(), end:hcToday(), tpl:'editorial', coll:'new', on:false, eyebrow:'', title:'', sub:'', btn:'Shop now', link:'#/c/new', btn2:'', link2:''};
  delete c.base; c.id = (v || 'camp')+'-'+Date.now().toString(36);
  if(pre){ c.name = pre.name; c.on = false; }
  hcOpen(c, true);
};
ACT['hc-edit'] = function(el){ var c = hcCamp(el.getAttribute('data-id')); if(c) hcOpen(c, false); };
INPUT['hc-f'] = function(el){ if(!HC_ED) return; HC_ED.c[el.getAttribute('data-k')] = el.value; hcLive(); };
INPUT['hc-col'] = function(el){ if(!HC_ED) return; HC_ED.c.colors = HC_ED.c.colors || {}; HC_ED.c.colors[el.getAttribute('data-k')] = el.value; hcLive(); };
ACT['hc-colreset'] = function(){ if(!HC_ED) return; delete HC_ED.c.colors; refreshModal(); };
ACT['hc-tpl'] = function(el){ if(!HC_ED) return; HC_ED.c.tpl = el.getAttribute('data-v'); delete HC_ED.c.colors; refreshModal(); };
CHANGE['hc-coll'] = function(el){ if(!HC_ED) return; HC_ED.c.coll = el.value; hcLive(); };
CHANGE['hc-onck'] = function(el){ if(HC_ED) HC_ED.c.on = el.checked; };
ACT['hc-save'] = function(){
  if(!HC_ED) return; var c = HC_ED.c;
  if(!String(c.name || '').trim()){ toast('Give the campaign a name'); return; }
  if(c.start && c.end && c.end < c.start){ toast('The end date is before the start date'); return; }
  var D = hcEdit(), i = D.campaigns.findIndex(function(x){ return x.id === c.id; });
  if(i >= 0) D.campaigns[i] = c; else D.campaigns.push(c);
  saveState(); HC_ED = null; closeModal(); rerender(); toast('Campaign saved — '+HC_ST[hcStatus(c)][0].toLowerCase());
};
ACT['hc-on'] = function(el){ var D = hcEdit(), c = D.campaigns.filter(function(x){ return x.id === el.getAttribute('data-id'); })[0]; if(!c) return; c.on = !c.on; saveState(); rerender(); };
ACT['hc-preview'] = function(el, ev){ if(ev) ev.preventDefault(); ST.heroPreview = el.getAttribute('data-id'); saveState(); try{ localStorage.setItem(DEMO_TOOLS_KEY, '1'); }catch(e){} go('#/'); toast('Preview of this campaign — Demo controls › Hero campaign › Auto goes back'); };

/* ---------- "design your own" template ---------- */
var HC_DS = null;
function hcDsForm(){
  var d = HC_DS.d, f = function(k, lab, ph){ return '<label class="hc-f"><span class="label">'+esc(lab)+'</span><input class="input" data-input="hc-ds" data-k="'+k+'" value="'+esc(d[k] || '')+'"'+(ph ? ' placeholder="'+esc(ph)+'"' : '')+'></label>'; };
  var prods = DB.products.filter(function(p){ return !p.hidden && p.cat !== 'extras'; });
  var c = hcDsCamp();
  return '<div class="hc-ed"><div class="hc-edl stack s12">'+f('name', 'Template name', 'e.g. Boishakh red')+
    '<div><span class="label">Layout</span><div class="hc-pick">'+HC_LAYOUTS.map(function(L){ return '<button type="button" class="hc-pk'+(d.layout === L[0] ? ' on' : '')+'" data-act="hc-dsl" data-v="'+L[0]+'">'+esc(L[1][0])+'</button>'; }).join('')+'</div></div>'+
    f('eyebrow', 'Small line on top', 'New collection')+f('title', 'Headline', 'Your headline')+f('sub', 'Line under it', 'One short sentence')+
    '<div class="sb-grid2">'+f('btn', 'Button words', 'Shop now')+f('link', 'Button goes to', '#/c/new')+'</div>'+
    '<div><span class="label">Colours</span><div class="hc-cols">'+[['bg','Background'],['ink','Text'],['acc','Button']].map(function(x){ return '<label class="hc-col"><input type="color" data-input="hc-dsc" data-k="'+x[0]+'" value="'+esc(d[x[0]])+'"><span class="xs">'+x[1]+'</span></label>'; }).join('')+'</div></div>'+
    '<div class="sb-grid2"><label class="hc-f"><span class="label">Picture: a product</span><select class="input" data-change="hc-dsp"><option value="">— first product of the campaign —</option>'+prods.map(function(p){ return '<option value="'+esc(p.id)+'"'+(d.product === p.id ? ' selected' : '')+'>'+esc(p.name)+'</option>'; }).join('')+'</select></label>'+
    '<label class="hc-f"><span class="label">…or upload a photo</span><input class="input" type="file" accept="image/*" data-change="hc-dsimg"></label></div>'+
    (d.img ? '<button type="button" class="link xs" data-act="hc-dsimgx">Remove the photo</button>' : '')+
    '<div class="row" style="gap:8px"><button class="btn btn-primary" data-act="hc-dssave">'+ico('check',16)+'Save as a template</button><button class="btn btn-ghost" data-act="close-modal">Cancel</button></div></div>'+
    '<div class="hc-edr"><div class="eyebrow">Live preview</div><div id="hc-dslive">'+hcFrame(c, .44)+'</div><p class="xs muted">Saved templates appear in every campaign\'s template list.</p></div></div>';
}
function hcDsCamp(){ var d = HC_DS.d; return {id:'ds', name:d.name || 'My template', tpl:'__ds', coll:'new', on:true, eyebrow:'', title:'', sub:'', btn:'', link:'', btn2:''}; }
/* the template being drawn is put in the list for the preview only */
function hcDsPreview(){
  var el = document.getElementById('hc-dslive'); if(!el || !HC_DS) return;
  var D = hcEdit(), keep = D.custom.slice(); D.custom = D.custom.filter(function(x){ return x.id !== '__ds'; }).concat([Object.assign({}, HC_DS.d, {id:'__ds'})]);
  try{ el.innerHTML = hcFrame(hcDsCamp(), .44); } finally { D.custom = keep; }
}
ACT['hc-design'] = function(el){
  var id = el.getAttribute('data-id'), cu = id ? hc().custom.filter(function(x){ return x.id === id; })[0] : null;
  HC_DS = {d:cu ? JSON.parse(JSON.stringify(cu)) : {id:'', name:'', layout:'split', eyebrow:'New collection', title:'Your headline here', sub:'One short line about the collection.', btn:'Shop now', link:'#/c/new', bg:'#1F2A44', ink:'#F5F1EA', acc:'#E8B04B', product:'', img:''}};
  openModal(hcDsForm(), {title:'Design your own hero', wide:true, rebuild:hcDsForm});
  setTimeout(hcDsPreview, 0);
};
INPUT['hc-ds'] = function(el){ if(!HC_DS) return; HC_DS.d[el.getAttribute('data-k')] = el.value; hcDsPreview(); };
INPUT['hc-dsc'] = function(el){ if(!HC_DS) return; HC_DS.d[el.getAttribute('data-k')] = el.value; hcDsPreview(); };
ACT['hc-dsl'] = function(el){ if(!HC_DS) return; HC_DS.d.layout = el.getAttribute('data-v'); refreshModal(); setTimeout(hcDsPreview, 0); };
CHANGE['hc-dsp'] = function(el){ if(!HC_DS) return; HC_DS.d.product = el.value; hcDsPreview(); };
CHANGE['hc-dsimg'] = function(el){
  var f = el.files && el.files[0]; if(!f || !HC_DS) return;
  if(f.size > 1.5e6){ toast('Please pick a photo under 1.5 MB'); return; }
  var r = new FileReader(); r.onload = function(){ HC_DS.d.img = String(r.result); refreshModal(); setTimeout(hcDsPreview, 0); }; r.readAsDataURL(f);
};
ACT['hc-dsimgx'] = function(){ if(!HC_DS) return; HC_DS.d.img = ''; refreshModal(); setTimeout(hcDsPreview, 0); };
ACT['hc-dssave'] = function(){
  if(!HC_DS) return; var d = HC_DS.d;
  if(!String(d.name || '').trim()){ toast('Give the template a name'); return; }
  var D = hcEdit(); if(!d.id) d.id = 'my-'+Date.now().toString(36);
  var i = D.custom.findIndex(function(x){ return x.id === d.id; }); if(i >= 0) D.custom[i] = d; else D.custom.push(d);
  saveState(); HC_DS = null; closeModal(); rerender(); toast('Template saved — pick it in any campaign');
};
