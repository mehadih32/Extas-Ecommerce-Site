/* ================= 70-landing.js — ad landing page  #/l/:slug  (layout 'landing') ================= */
(function(){
  if(document.getElementById('lp-css')) return;
  var s = document.createElement('style'); s.id = 'lp-css';
  s.textContent = [
    '.lp-wrap{padding:14px 0 8px}',
    '@media(min-width:1024px){.lp-wrap{padding:28px 0 24px}}',
    '.lp-grid{display:grid;grid-template-columns:minmax(0,1fr)}',
    '.lp-grid>.lp-s{grid-column:1;margin-bottom:34px;min-width:0;scroll-margin-top:76px}',
    '.lp-grid>.lp-formcol{margin-bottom:34px;scroll-margin-top:72px;min-width:0}',
    '@media(min-width:1024px){.lp-grid{grid-template-columns:minmax(0,1fr) 420px;column-gap:52px}.lp-grid>.lp-s{margin-bottom:52px;scroll-margin-top:92px}',
    '.lp-grid>.lp-formcol{grid-column:2;grid-row:1 / span 40;align-self:start;position:sticky;top:92px;margin-bottom:0}',
    '.lp-formcol .lp-form{box-shadow:0 14px 40px rgba(0,0,0,.07)}',
    '.lp-formcol .lp-packs{grid-template-columns:repeat(3,minmax(0,1fr))}',
    '.lp-formcol .lp-pack{flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:4px;padding:10px 10px 9px}',
    '.lp-formcol .lp-pack.on{padding:9px 9px 8px}',
    '.lp-formcol .lp-pack .lp-radio,.lp-formcol .lp-pack .sub{display:none}',
    '.lp-formcol .lp-pack .pr{text-align:left!important}',
    '.lp-two{grid-template-columns:1fr 1fr}}',
    '.lp-two{display:grid;gap:0 12px}',
    /* hero */
    '.lp-mosaic{display:grid;grid-template-columns:1fr;gap:6px}',
    '.lp-mosaic .lp-side{display:none}',
    '@media(min-width:1024px){.lp-mosaic{grid-template-columns:2fr 1fr}.lp-mosaic .lp-main{grid-row:1 / span 2}.lp-mosaic .lp-side{display:block}}',
    '.lp-tile{padding:0;border:0;background:none;cursor:pointer;display:block;width:100%;height:100%}',
    '.lp-fill{height:100%;min-height:120px}',
    '.lp-thumbs{display:flex;gap:8px;overflow-x:auto;padding:8px 0 2px}',
    '.lp-thumb{width:58px;flex-shrink:0;padding:0;border:1px solid var(--line);background:none;cursor:pointer;border-radius:var(--radius);overflow:hidden}',
    '.lp-thumb.on{outline:2px solid var(--brand);outline-offset:1px}',
    '.lp-thumb .pimg svg.garment{width:80%}',
    '.lp-thumb .pimg-label,.lp-tile .pimg-label,.lp-form .pimg-label,.lp-rev .pimg-label{display:none}',
    '@media(max-width:1023px){.lp-main .pimg{aspect-ratio:1/1}}',
    '.lp-title{font-size:30px;margin:6px 0 10px}',
    '@media(min-width:1024px){.lp-title{font-size:42px}}',
    '.lp-hero-copy{padding-top:18px}',
    /* offer & ladder */
    '.lp-offer{padding:20px}',
    '.lp-ticks{display:grid;gap:9px;margin-top:14px}',
    '.lp-ticks>div{display:flex;gap:10px;align-items:flex-start;font-size:14px}',
    '.lp-ticks svg{color:var(--brand);flex-shrink:0;margin-top:2px}',
    '.lp-ladder{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}',
    '@media(min-width:1024px){.lp-ladder{gap:14px}}',
    '.lp-rung{position:relative;border:1px solid var(--line);background:var(--surface);border-radius:var(--card-radius);padding:20px 8px 14px;text-align:center;cursor:pointer;color:var(--ink);font:inherit}',
    '.lp-rung.on{border:2px solid var(--brand);padding:19px 7px 13px;background:var(--brand-tint)}',
    '.lp-rung .lp-pop{position:absolute;top:-10px;left:50%;transform:translateX(-50%);white-space:nowrap}',
    '.lp-rung .n{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}',
    '.lp-rung .p{font-family:var(--font-display);font-weight:800;font-size:22px;margin:4px 0 2px}',
    '@media(min-width:1024px){.lp-rung .p{font-size:28px}}',
    /* benefits, colours, trust */
    '.lp-ben{display:grid;gap:10px}',
    '@media(min-width:768px){.lp-ben{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}}',
    '.lp-ben>div{display:flex;gap:12px;align-items:flex-start;padding:16px}',
    '@media(min-width:768px){.lp-ben>div{flex-direction:column;gap:10px;padding:20px}}',
    '.lp-ben .ic{width:40px;height:40px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.lp-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
    '@media(min-width:768px){.lp-cols{grid-template-columns:repeat(auto-fill,minmax(122px,1fr));gap:10px}}',
    '.lp-col{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);background:var(--surface);border-radius:var(--radius);cursor:pointer;font:inherit;color:var(--ink);text-align:left;min-height:52px}',
    '.lp-col.on{border:2px solid var(--brand);padding:9px 11px}',
    '.lp-col .swatch{width:28px;height:28px;cursor:pointer}',
    '.lp-trust{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--card-radius);overflow:hidden}',
    '@media(min-width:768px){.lp-trust{grid-template-columns:repeat(4,minmax(0,1fr))}}',
    '.lp-trust>div{background:var(--surface);padding:16px 10px;display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center;font-size:12.5px;font-weight:600}',
    '.lp-trust svg{color:var(--brand)}',
    /* size finder & reviews & faq */
    '.lp-find{padding:18px}',
    '.lp-find .fields{display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:8px}',
    '.lp-find select.input{padding:12px 8px}',
    '.lp-rec{margin-top:14px;padding:14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}',
    '.lp-rec .big{font-family:var(--font-display);font-weight:800;font-size:30px;line-height:1;min-width:52px;text-align:center}',
    '.lp-rev{display:flex;gap:12px;padding:16px 0;border-top:1px solid var(--line2)}',
    '.lp-rev:first-child{border-top:0;padding-top:4px}',
    '.lp-av{width:38px;height:38px;border-radius:50%;background:var(--brand-tint);color:var(--brand-dark);display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}',
    '.lp-faq{border-top:1px solid var(--line)}',
    '.lp-faq>div{border-bottom:1px solid var(--line)}',
    '.lp-faq button.q{display:flex;justify-content:space-between;align-items:center;width:100%;background:none;border:0;padding:15px 2px;font:inherit;font-weight:600;font-size:15px;cursor:pointer;text-align:left;color:var(--ink);min-height:48px}',
    '.lp-faq .a{padding:0 2px 16px}',
    /* form */
    '.lp-form{padding:18px}',
    '@media(min-width:1024px){.lp-form{padding:22px}}',
    '.lp-form .label{margin-bottom:6px}',
    '.lp-fld{margin-top:16px}',
    '.lp-packs{display:grid;gap:8px}',
    '.lp-pack{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;border:1px solid var(--input);border-radius:var(--radius);background:var(--surface);cursor:pointer;min-height:50px;font:inherit;color:var(--ink)}',
    '.lp-pack.on{border:2px solid var(--brand);background:var(--brand-tint);padding:9px 11px}',
    '.lp-radio{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--input);flex-shrink:0;display:inline-block;background:var(--surface)}',
    '.lp-pack.on .lp-radio,.lp-payb.on .lp-radio{border:5px solid var(--brand)}',
    '.lp-sizes{display:flex;flex-wrap:wrap;gap:8px}',
    '.lp-sizes .size-pill{min-width:52px}',
    '.lp-pay{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
    '.lp-payb{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border:1px solid var(--input);border-radius:var(--radius);background:var(--surface);cursor:pointer;font:inherit;font-size:13px;font-weight:600;color:var(--ink);min-height:56px}',
    '.lp-payb.on{border:2px solid var(--brand);background:var(--brand-tint);padding:9px 5px}',
    '.lp-del{display:flex;gap:8px;align-items:flex-start;font-size:13.5px;padding:10px 12px;margin-top:10px}',
    '.lp-del svg{flex-shrink:0;margin-top:2px;color:var(--brand)}',
    '.lp-sum{display:grid;gap:6px;margin-top:16px}',
    '.lp-cta{min-height:54px;font-size:16px;margin-top:14px}',
    '.lp-err{display:none;color:var(--sale);font-size:13px;font-weight:600;margin-top:10px}',
    '.lp-hint{font-size:12.5px;margin-top:6px;line-height:1.45}',
    /* sticky bar + footer */
    '.lp-mbar{display:flex;align-items:center;gap:12px;transition:transform .2s ease;box-shadow:0 -6px 18px rgba(0,0,0,.06)}',
    '.lp-mbar.away{transform:translateY(115%)}',
    '.lp-foot{border-top:1px solid var(--line);background:var(--surface);padding:22px 0 26px;text-align:center;font-size:13px}',
    '.lp-foot .links{display:flex;flex-wrap:wrap;justify-content:center;gap:2px 16px;margin-top:8px}',
    '.lp-foot .links button{background:none;border:0;padding:8px 2px;color:var(--text2);text-decoration:underline;cursor:pointer;font:inherit;font-size:12.5px}',
    '.lp-video{position:relative;display:block;border:0;padding:0;width:100%;cursor:pointer;overflow:hidden;border-radius:var(--card-radius);background:none}',
    '.lp-video .pimg{width:100%}',
    '.lp-video .play{top:50%;left:50%;transform:translate(-50%,-50%)}',
    '.lp-video .play{position:absolute;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.92);color:#171715;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.2)}'
  ].join('\n');
  document.head.appendChild(s);
})();

var LP_VIEW_NAME = {set:'Your set', front:'Front', back:'Back', detail:'Close-up', model:'On model', flat:'True colour'};
var lp_obs = null;

function lp_find(slug){ return (ST.landingPages||[]).filter(function(l){ return l.slug===slug; })[0] || null; }

/* packs the customer can order on this page: 1 piece · combo duo (or set-rule 2) · set-rule 3 */
function lp_packs(p){
  var cat = CAT(p.cat) || {name:'items'};
  var out = [{id:'one', n:1, price:p.price, name:p.name, label:'1 piece'}];
  var duo = combos().filter(function(c){ return c.active && c.items.length===2 && c.items[0]===p.id && c.items[1]===p.id; })[0];
  var rule = setRules().filter(function(r){ return r.active && (r.mode==='category' ? r.categories.indexOf(p.cat)>=0 : r.skus.indexOf(p.id)>=0); })[0];
  if(duo) out.push({id:'duo', n:2, price:duo.price, name:duo.name, source:'combo', refId:duo.id, label:duo.name});
  else if(rule && rule.tiers[2]) out.push({id:'two', n:2, price:rule.tiers[2], name:'Any 2 '+cat.name, source:'custom', refId:rule.id, label:'2-pack'});
  if(rule && rule.tiers[3]) out.push({id:'three', n:3, price:rule.tiers[3], name:'Any 3 '+cat.name, source:'custom', refId:rule.id, label:'3-pack'});
  return out;
}
function lp_pack(p, u){ var ps = lp_packs(p); return ps.filter(function(x){ return x.id===u.pack; })[0] || ps[0]; }

function lp_state(lp, p){
  var packs = lp_packs(p);
  var u = ui('lp:'+lp.slug, {view:null, color:null, size:null, pack:null, qty:1, picks:[], name:'', phone:'', address:'', pay:'cod', unit:'in', ft:5, inch:8, kg:'', rec:null, faq:0, prefilled:false});
  if(!u.pack){ u.pack = (lp.template==='combo-push' && packs.length>1) ? packs[1].id : 'one'; }
  if(!u.color){ u.color = p.colors.filter(function(c){ return totalStock(p.id,c)>0; })[0] || p.colors[0]; }
  if(!u.picks.length){ u.picks = [p.colors[0], p.colors[1]||p.colors[0], p.colors[2]||p.colors[0]]; }
  if(!u.view){ u.view = (lp.template==='combo-push' && packs.length>1) ? 'set' : 'front'; }
  if(!u.prefilled){
    u.prefilled = true; var acc = currentAccount();
    if(acc){ u.name = u.name || acc.name || ''; u.phone = u.phone || acc.phone || ''; u.address = u.address || acc.address || ''; }
    var ms = mySizeFor(p); if(ms && p.sizes.indexOf(ms)>=0 && !u.size) u.size = ms;
    /* R15 note 23.1: the two offer ticks start like checkout's */
    var cs = typeof consentStart==='function' ? consentStart(acc) : {sms:true, wa:false}; u.optSms = cs.sms; u.optWa = cs.wa;
    var my = mySize(); if(my && my.heightIn){ u.ft = Math.floor(my.heightIn/12); u.inch = my.heightIn%12; u.kg = my.weightKg||''; }
  }
  /* size must still be in stock for the chosen colour(s) */
  if(u.size && !lp_sizeOk(p, u, u.size)) u.size = null;
  return u;
}
function lp_colorsChosen(p, u){ var pk = lp_pack(p,u); return pk.n===1 ? [u.color] : u.picks.slice(0, pk.n); }
function lp_sizeOk(p, u, size){
  var need = {}; lp_colorsChosen(p,u).forEach(function(c){ need[c] = (need[c]||0)+1; });
  for(var c in need){ if(stockOf(p.id, c, size) < need[c]) return false; }
  return true;
}
function lp_lines(p, u, pk){
  if(pk.n===1) return [{kind:'item', product:p.id, color:u.color, size:u.size, qty:u.qty}];
  return [{kind:'set', source:pk.source, refId:pk.refId, name:pk.name, items:u.picks.slice(0,pk.n).map(function(c){ return {product:p.id, color:c, size:u.size}; }), price:pk.price}];
}
function lp_totals(lines){
  var prev = ST.bag;
  ST.bag = lines.map(function(l, i){ var c = JSON.parse(JSON.stringify(l)); c.id = 'lp'+i; if(c.kind==='set') c.qty = 1; return c; });
  var t; try{ t = bagTotals(); } finally { ST.bag = prev; }
  return t;
}
function lp_calc(p, u){
  var pk = lp_pack(p,u), lines = lp_lines(p,u,pk), tot = lp_totals(lines);
  var addr = String(u.address||'').trim(), known = addr.length >= 4, z = known ? zoneOf(addr) : null;
  var free = tot.total >= SET('delivery','freeOver');
  var del = known ? deliveryCharge(z.zone, tot.total) : (free ? 0 : null);
  return {pack:pk, lines:lines, tot:tot, known:known, zone:z, free:free, delivery:del, grand:tot.total + (del||0)};
}

/* ---------- pieces ---------- */
function lp_views(p, packs){ var v = []; if(packs.length>1) v.push('set'); v.push('front','back','detail'); if(p.hasModel) v.push('model'); v.push('flat'); return v; }
function lp_img(p, u, view, opts){
  opts = opts||{};
  if(view==='set'){ var pk = lp_pack(p,u), n = Math.max(2, pk.n); return setImg(u.picks.slice(0,n).map(function(c){ return {product:p.id, color:c}; }), {ratio:opts.ratio, inner:opts.inner}); }
  return productImg(p, u.color, {view:view, ratio:opts.ratio, label:opts.label, inner:opts.inner});
}
function lp_hero(lp, p, u, packs){
  var views = lp_views(p, packs); if(views.indexOf(u.view)<0) u.view = views[0];
  var others = views.filter(function(v){ return v!==u.view; }).slice(0,2);
  var badge = '';
  if(packs.length>1 && lp.template==='combo-push') badge = '<span class="badge-img">'+esc(packs[1].name)+' · '+fmt(packs[1].price)+'</span>';
  else if(p.compareAt) badge = '<span class="badge-img sale">Save '+fmt(p.compareAt-p.price)+'</span>';
  var mosaic = '<div class="lp-mosaic"><div class="lp-main">'+lp_img(p,u,u.view,{ratio:'ratio-45', inner:badge})+'</div>'+
    others.map(function(v){ return '<div class="lp-side"><button class="lp-tile" data-act="lp-view" data-slug="'+lp.slug+'" data-v="'+v+'" aria-label="Show '+LP_VIEW_NAME[v]+'">'+lp_img(p,u,v,{ratio:'lp-fill', label:false})+'</button></div>'; }).join('')+'</div>';
  var thumbs = '<div class="lp-thumbs" role="tablist" aria-label="Photos">'+views.map(function(v){ return '<button class="lp-thumb'+(v===u.view?' on':'')+'" data-act="lp-view" data-slug="'+lp.slug+'" data-v="'+v+'" aria-label="'+LP_VIEW_NAME[v]+'">'+lp_img(p,u,v,{ratio:'ratio-11', label:false})+'</button>'; }).join('')+'</div>';
  var cat = CAT(p.cat) || {name:''};
  var priceLine = (packs.length>1 && lp.template==='combo-push')
    ? '<div class="row wrap" style="gap:8px 14px;align-items:baseline"><span class="price" style="font-size:28px">'+fmt(packs[1].price)+'</span><span class="text2">for 2 · '+fmt(Math.round(packs[1].price/2))+' each</span><span class="strike small">'+fmt(p.price*2)+'</span></div>'
    : '<div class="row wrap" style="gap:8px 12px;align-items:baseline">'+priceHTML(p.price, p.compareAt, 28)+(p.compareAt?'<span class="tag sale">Save '+fmt(p.compareAt-p.price)+'</span>':'')+'</div>';
  return '<section class="lp-s lp-hero">'+mosaic+thumbs+
    '<div class="lp-hero-copy"><div class="eyebrow">'+esc(cat.name)+' · '+esc(p.fit)+'</div>'+
    '<h1 class="display lp-title">'+esc(lp.title)+'</h1>'+
    '<div class="row wrap small" style="gap:6px 8px">'+starsHTML(p.rating)+'<span class="bold">'+p.rating+'</span><span class="muted">· '+p.reviews+' reviews · '+esc(p.fitNote)+'</span></div>'+
    '<div class="mt12">'+priceLine+'</div>'+
    '<p class="text2 mt12" style="margin-bottom:0;max-width:560px">'+esc(p.desc)+'</p>'+
    '<div class="row wrap mt12 small bold" style="gap:6px 16px">'+
      '<span class="row" style="gap:6px">'+ico('cash',17)+'Cash on Delivery</span>'+
      '<span class="row" style="gap:6px">'+ico('swap',17)+'Size exchange in '+esc(SET('exchange','windowHours'))+' hours</span>'+
    '</div></div></section>';
}
function lp_offer(lp, p, u, packs){
  var cat = CAT(p.cat) || {name:'items'};
  if(lp.template==='combo-push' && packs.length>1){
    var rungs = packs.map(function(pk){
      var each = Math.round(pk.price/pk.n), save = p.price*pk.n - pk.price;
      var on = lp_pack(p,u).id===pk.id;
      return '<button class="lp-rung'+(on?' on':'')+'" data-act="lp-pack" data-slug="'+lp.slug+'" data-v="'+pk.id+'" aria-pressed="'+on+'">'+
        (pk.id==='duo'||pk.id==='two' ? '<span class="tag dark lp-pop">Most picked</span>' : (pk.n===3 ? '<span class="tag gold lp-pop">Best value</span>' : ''))+
        '<div class="n">'+(pk.n===1?'1 piece':pk.n+' pieces')+'</div><div class="p">'+fmt(pk.price)+'</div>'+
        '<div class="xs text2">'+(pk.n===1 ? 'Regular price' : esc(pk.id==='duo'?pk.name:pk.label)+' · '+fmt(each)+' each')+'</div>'+
        (save>0?'<div class="xs bold brandc mt8">You save '+fmt(save)+'</div>':'<div class="xs muted mt8">&nbsp;</div>')+'</button>';
    }).join('');
    return '<section class="lp-s"><div class="eyebrow">Buy more, save more</div><h2 class="h2 mt8">'+packs.map(function(pk){ return pk.n+' for '+fmt(pk.price); }).join(' · ')+'</h2>'+
      '<p class="small text2" style="margin:6px 0 0">Mix any colours. Tap a price to choose it in the order form.</p><div class="lp-ladder">'+rungs+'</div></section>';
  }
  var del = SET('delivery','freeOver');
  return '<section class="lp-s"><div class="card lp-offer"><div class="row between wrap" style="gap:10px"><div><div class="eyebrow">Today\'s offer</div>'+
    '<div class="row wrap mt8" style="gap:8px 12px;align-items:baseline">'+priceHTML(p.price, p.compareAt, 34)+(p.compareAt?'<span class="tag sale">−'+Math.round((1-p.price/p.compareAt)*100)+'%</span>':'')+'</div></div>'+
    '<button class="btn btn-primary hide-d" data-act="lp-goto" data-t="lp-form">'+esc(t('Order Now'))+'</button></div>'+
    '<div class="lp-ticks">'+
      '<div>'+ico('check',17)+'<span><b>Cash on Delivery</b> — pay when the parcel arrives</span></div>'+
      '<div>'+ico('check',17)+'<span>'+esc(ruleText('delivery','short'))+'</span></div>'+
      '<div>'+ico('check',17)+'<span>'+esc(ruleText('exchange','short'))+'</span></div>'+
    '</div>'+(p.price < del ? '<div class="xs muted mt12">Order 2 and delivery is free (over '+fmt(del)+').</div>' : '')+'</div></section>';
}
function lp_benefits(lp, p){
  return '<section class="lp-s"><h2 class="h2 mb16">Why people love it</h2><div class="lp-ben">'+
    '<div class="card"><span class="ic">'+ico('layers',20)+'</span><div><div class="h3">Fabric</div><div class="small text2 mt8" style="margin-top:3px">'+esc(p.fabric)+'</div></div></div>'+
    '<div class="card"><span class="ic">'+ico('ruler',20)+'</span><div><div class="h3">'+esc(p.fit)+'</div><div class="small text2" style="margin-top:3px">'+esc(p.fitNote)+' Find my size tells you yours in 10 seconds.</div></div></div>'+
    '<div class="card"><span class="ic">'+ico('cash',20)+'</span><div><div class="h3">Cash on Delivery</div><div class="small text2" style="margin-top:3px">Pay when the parcel arrives — all over Bangladesh. bKash and Nagad also work.</div></div></div>'+
  '</div></section>';
}
function lp_colors(lp, p, u){
  var note = DB.colorNotes[u.color];
  return '<section class="lp-s"><div class="row between mb16" style="align-items:baseline"><h2 class="h2">Pick your colour</h2><span class="small muted">'+p.colors.length+' colours</span></div>'+
    '<div class="lp-cols">'+p.colors.map(function(c){
      var st = totalStock(p.id, c), on = c===u.color;
      return '<button class="lp-col'+(on?' on':'')+'" data-act="lp-color" data-slug="'+lp.slug+'" data-c="'+c+'" aria-pressed="'+on+'"><span class="swatch" style="background:'+COL(c).hex+'"></span><span><span class="small bold" style="display:block">'+esc(COL(c).name)+'</span><span class="xs '+(st<=8?'sale':'muted')+'">'+(st===0?'Sold out':(st<=8?'Few left':'In stock'))+'</span></span></button>';
    }).join('')+'</div>'+
    (note?'<div class="row top small text2 mt12" style="gap:8px">'+ico('sun',17)+'<span>'+esc(note)+'</span></div>':'')+'</section>';
}
function lp_size(lp, p, u){
  var ch = chartFor(p); if(!ch) return '';
  var ft = [4,5,6].map(function(v){ return '<option value="'+v+'"'+(v==u.ft?' selected':'')+'>'+v+' ft</option>'; }).join('');
  var inch = []; for(var i=0;i<12;i++) inch.push('<option value="'+i+'"'+(i==u.inch?' selected':'')+'>'+i+' in</option>');
  var rec = '';
  if(u.rec){
    var ok = lp_sizeOk(p, u, u.rec.size);
    rec = '<div class="tint lp-rec"><div class="big">'+esc(u.rec.size)+'</div><div class="grow small"><div class="bold">Your size: '+esc(u.rec.size)+'</div><div class="text2">Fits a '+u.rec.need+'″ '+(ch.type==='bottom'?'waist':'chest')+' comfortably. Like it loose? Take '+esc(u.rec.next)+'.</div>'+
      (ok?'':'<div class="xs sale bold mt8">'+esc(u.rec.size)+' is sold out in this colour — try another colour.</div>')+'</div>'+
      '<button class="btn btn-primary btn-sm" data-act="lp-userec" data-slug="'+lp.slug+'"'+(ok?'':' disabled')+'>Use '+esc(u.rec.size)+'</button></div>';
  }
  var ms = mySizeFor(p);
  return '<section class="lp-s" id="lp-size"><div class="card lp-find"><div class="row" style="gap:10px">'+ico('ruler',22)+'<div><h2 class="h2">Find my size</h2><div class="small text2">Your height and weight — that\'s all. Works for most people.</div></div></div>'+
    '<div class="fields mt16"><div><label class="label" for="lp-ft">Height</label><select id="lp-ft" class="input" data-change="lp-hw" data-slug="'+lp.slug+'" data-k="ft">'+ft+'</select></div>'+
    '<div><label class="label" for="lp-in">&nbsp;</label><select id="lp-in" class="input" data-change="lp-hw" data-slug="'+lp.slug+'" data-k="inch" aria-label="Height inches">'+inch.join('')+'</select></div>'+
    '<div><label class="label" for="lp-kg">Weight (kg)</label><input id="lp-kg" class="input" type="number" inputmode="numeric" min="30" max="160" placeholder="e.g. 68" value="'+esc(u.kg)+'" data-input="lp-kg" data-slug="'+lp.slug+'"></div></div>'+
    '<button class="btn btn-secondary btn-block mt12" data-act="lp-find" data-slug="'+lp.slug+'">Show my size</button>'+rec+
    (ms && !u.rec?'<div class="xs muted mt12">Your saved size: <b>'+esc(ms)+'</b></div>':'')+'</div></section>';
}
function lp_chart(lp, p, u){
  var ch = chartFor(p); if(!ch) return '';
  var cm = u.unit==='cm';
  var rows = Object.keys(ch.rows).filter(function(s){ return p.sizes.indexOf(s)>=0; }).map(function(s){
    return '<tr class="'+(s===u.size?'sel':'')+'"><td class="bold">'+esc(s)+'</td>'+ch.rows[s].map(function(v){ return '<td>'+fmtMeasure(v, cm)+'</td>'; }).join('')+'</tr>';
  }).join('');
  return '<section class="lp-s"><div class="row between mb12" style="align-items:center"><h2 class="h2">Size chart</h2>'+
    '<div class="seg" role="group" aria-label="Units"><button class="'+(cm?'':'on')+'" data-act="lp-unit" data-slug="'+lp.slug+'" data-v="in">inch</button><button class="'+(cm?'on':'')+'" data-act="lp-unit" data-slug="'+lp.slug+'" data-v="cm">cm</button></div></div>'+
    '<div class="tbl-wrap" style="background:var(--surface)"><table class="tbl"><thead><tr><th>Size</th>'+ch.fields.map(function(f){ return '<th>'+esc(f)+'</th>'; }).join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div class="xs muted mt8">'+esc(ch.name)+' · garment measurements'+(u.size?' · your pick is highlighted':'')+'</div></section>';
}
function lp_reviews(lp, p){
  var list = DB.reviewsSample.map(function(r, i){
    return '<div class="lp-rev"><span class="lp-av" aria-hidden="true">'+esc(r.name.charAt(0))+'</span><div class="grow">'+
      '<div class="row between wrap" style="gap:4px 10px"><span class="bold small">'+esc(r.name)+' <span class="tag plain" style="margin-left:4px">Verified buyer</span></span>'+starsHTML(r.stars,13)+'</div>'+
      '<div class="xs muted" style="margin-top:3px">'+esc(r.h)+' · '+esc(r.w)+' · bought '+esc(r.size)+' · '+esc(r.fit)+'</div>'+
      '<p class="small" style="margin:7px 0 0">'+esc(r.text)+'</p>'+
      (r.photo?'<div style="width:72px;margin-top:10px">'+productImg(p, p.colors[i % p.colors.length], {view:'model', ratio:'ratio-11', label:false})+'</div>':'')+
    '</div></div>';
  }).join('');
  return '<section class="lp-s"><div class="row between mb12 wrap" style="align-items:baseline;gap:6px"><h2 class="h2">What buyers say</h2><span class="row small" style="gap:6px">'+starsHTML(p.rating)+'<b>'+p.rating+'</b><span class="muted">· '+p.reviews+' reviews</span></span></div>'+
    '<div class="card" style="padding:4px 18px">'+list+'</div></section>';
}
function lp_faq(lp, p, u){
  var items = [
    ['How much is delivery?', ruleText('delivery','short')],
    ['Can I exchange the size?', ruleText('exchange','short')],
    ['Can I return it?', ruleText('no-return','short')],
    ['How do I pay?', 'Cash on Delivery — pay the rider when the parcel arrives. bKash and Nagad also work.'],
    ['When will I get it?', 'Inside Dhaka within '+SET('delivery','insideHours')+' hours · outside Dhaka within '+SET('delivery','outsideHours')+' hours. We send an SMS when it ships.']
  ];
  return '<section class="lp-s"><h2 class="h2 mb12">Questions</h2><div class="lp-faq">'+items.map(function(it, i){
    var open = u.faq===i;
    return '<div><button class="q" data-act="lp-faq" data-slug="'+lp.slug+'" data-i="'+i+'" aria-expanded="'+open+'">'+esc(it[0])+ico(open?'up':'down',18)+'</button>'+(open?'<div class="a small text2">'+esc(it[1])+'</div>':'')+'</div>';
  }).join('')+'</div></section>';
}
function lp_trust(){
  return '<section class="lp-s"><div class="lp-trust">'+
    '<div>'+ico('cash',22)+'<span>Cash on Delivery</span></div>'+
    '<div>'+ico('swap',22)+'<span>Size exchange in '+esc(SET('exchange','windowHours'))+' hours</span></div>'+
    '<div>'+ico('truck',22)+'<span>Delivery all over Bangladesh</span></div>'+
    '<div>'+ico('shield',22)+'<span>100% original EXTAS</span></div>'+
  '</div></section>';
}
function lp_wa(lp, p){
  return '<section class="lp-s"><div class="soft p20 row between wrap" style="gap:12px"><div><div class="h3">Questions before you order?</div><div class="small text2">Message us — we reply 10 am to 10 pm.</div></div>'+
    waButton('Ask on WhatsApp', 'Hi EXTAS, I have a question about '+p.name+' (offer: '+lp.title+')')+'</div></section>';
}
function lp_story(lp, p, u){
  return '<section class="lp-s"><div class="eyebrow">Made for Bangladeshi weather</div><h2 class="h2 mt8 mb16">The fabric, up close</h2>'+
    '<button class="lp-video" data-act="lp-video" aria-label="Play video">'+productImg(p, u.color, {view:'model', ratio:'ratio-wide', labelText:'[ demo video · 20 sec ]'})+'<span class="play">'+ico('play',26)+'</span></button>'+
    '<div class="grid g2 mt12" style="gap:10px">'+productImg(p, u.color, {view:'detail', ratio:'ratio-11'})+productImg(p, u.color, {view:'flat', ratio:'ratio-11'})+'</div>'+
    '<div class="grid mt16" style="gap:10px"><div class="row top small" style="gap:10px">'+ico('layers',18)+'<span><b>'+esc(p.fabric)+'.</b> '+esc(p.desc)+'</span></div>'+
    '<div class="row top small" style="gap:10px">'+ico('sun',18)+'<span>'+esc(p.care)+'</span></div></div></section>';
}

/* ---------- the order form ---------- */
function lp_delHTML(c){
  if(c.free) return ico('truck',16)+'<span><b>Free delivery</b> — anywhere in Bangladesh</span>';
  if(!c.known) return ico('truck',16)+'<span class="muted">Delivery charge shows after you type your address</span>';
  var lbl = c.zone.zone==='in' ? 'Inside Dhaka' : 'Outside Dhaka';
  return ico('truck',16)+'<span>'+lbl+' delivery <b>'+fmt(c.delivery)+'</b>'+(c.zone.sure?'':' <span class="muted">· we will confirm your area by phone</span>')+'</span>';
}
function lp_sumHTML(p, u, c){
  var pk = c.pack, h = '';
  var what = pk.n===1 ? u.qty+' × '+p.name : pk.name+' · '+pk.n+' pieces';
  h += '<div class="row between small"><span class="text2">'+esc(what)+'</span><span>'+fmt(c.tot.subtotal)+'</span></div>';
  if(c.tot.discount) h += '<div class="row between small"><span class="text2">'+esc((c.tot.setDiscounts[0]||{}).label||'Set saving')+'</span><span class="brandc bold">−'+fmt(c.tot.discount)+'</span></div>';
  h += '<div class="row between small"><span class="text2">Delivery</span><span>'+(c.delivery===null?'<span class="muted">after address</span>':(c.delivery===0?'<span class="brandc bold">Free</span>':fmt(c.delivery)))+'</span></div>';
  h += '<div class="row between" style="border-top:1px solid var(--line);padding-top:10px;margin-top:4px"><span class="bold">Total</span><span class="price" style="font-size:24px">'+fmt(c.grand)+'</span></div>';
  return h;
}
function lp_phoneHint(raw){
  var r = checkPhone(raw);
  if(r.state==='ok') return '<span class="brandc bold row" style="gap:5px">'+ico('check',14)+r.nice+'</span>';
  if(r.state==='warn') return '<span style="color:var(--warn)">'+esc(r.msg)+'</span> <span class="muted">You can still order — we will check it with you.</span>';
  return '<span class="muted">We send your order updates to this number.</span>';
}
function lp_form(lp, p, u, packs){
  var c = lp_calc(p, u), pk = c.pack, slug = lp.slug, cat = CAT(p.cat) || {name:'Item'};
  var single = cat.name.replace(/s$/,'');
  var packH = packs.length>1 ? '<div class="lp-fld"><div class="label">How many?</div><div class="lp-packs">'+packs.map(function(x){
      var on = x.id===pk.id, save = p.price*x.n - x.price;
      return '<button type="button" class="lp-pack'+(on?' on':'')+'" data-act="lp-pack" data-slug="'+slug+'" data-v="'+x.id+'" aria-pressed="'+on+'"><span class="row" style="gap:10px"><span class="lp-radio"></span><span><span class="bold small" style="display:block">'+esc(x.n===1?'1 piece':x.label)+'</span><span class="xs muted sub">'+(x.n===1?'Single '+single.toLowerCase():x.n+' '+esc(cat.name.toLowerCase())+', any colours')+'</span></span></span>'+
        '<span class="pr" style="text-align:right"><span class="price" style="display:block">'+fmt(x.price)+'</span>'+(save>0?'<span class="xs brandc bold">Save '+fmt(save)+'</span>':'<span class="xs muted">Regular</span>')+'</span></button>';
    }).join('')+'</div></div>' : '';
  var swatches = function(sel, act, extra){ return '<div class="row wrap" style="gap:10px">'+p.colors.map(function(cl){ var out = totalStock(p.id, cl)===0; return '<button type="button" class="swatch'+(cl===sel?' on':'')+'" style="background:'+COL(cl).hex+(out?';opacity:.35':'')+'" data-act="'+act+'" data-slug="'+slug+'" data-c="'+cl+'"'+(extra||'')+' aria-label="'+esc(COL(cl).name)+(cl===sel?' (selected)':'')+'" title="'+esc(COL(cl).name)+'"'+(out?' disabled':'')+'></button>'; }).join('')+'</div>'; };
  var colorH;
  if(pk.n===1) colorH = '<div class="lp-fld"><div class="label">Colour: <span class="muted" style="font-weight:500">'+esc(COL(u.color).name)+'</span></div>'+swatches(u.color, 'lp-color')+'</div>';
  else { colorH = '<div class="lp-fld"><div class="label">Colours <span class="muted" style="font-weight:500">· same or different</span></div><div class="stack s8">';
    for(var i=0;i<pk.n;i++) colorH += '<div class="row" style="gap:12px"><span class="xs bold" style="width:58px">'+esc(single)+' '+(i+1)+'</span>'+swatches(u.picks[i], 'lp-pick', ' data-i="'+i+'"')+'<span class="xs muted hide-m">'+esc(COL(u.picks[i]).name)+'</span></div>';
    colorH += '</div></div>'; }
  var ms = mySizeFor(p);
  var sizeH = '<div class="lp-fld"><div class="row between"><span class="label" style="margin:0">Size'+(pk.n>1?' <span class="muted" style="font-weight:500">· for all pieces</span>':'')+'</span><button type="button" class="link" data-act="lp-goto" data-t="lp-size">Find my size</button></div>'+
    '<div class="lp-sizes mt8" role="group" aria-label="Size">'+p.sizes.map(function(s){
      var ok = lp_sizeOk(p, u, s), on = s===u.size;
      return '<button type="button" class="size-pill'+(on?' on':'')+(ok?'':' out')+'" data-act="lp-size" data-slug="'+slug+'" data-s="'+esc(s)+'"'+(ok?'':' disabled aria-disabled="true"')+' aria-pressed="'+on+'">'+esc(s)+'</button>';
    }).join('')+'</div>';
  var hint = '';
  if(u.size){ var left = Math.min.apply(null, lp_colorsChosen(p,u).map(function(cl){ return stockOf(p.id, cl, u.size); })); if(left<=3) hint = '<span class="sale bold">Only '+left+' left in '+esc(u.size)+'</span>'; else hint = '<span class="muted">'+esc(u.size)+' in stock</span>'; }
  else if(ms && p.sizes.indexOf(ms)>=0) hint = '<span class="muted">Your saved size is <b>'+esc(ms)+'</b> — tap it to choose.</span>';
  else hint = '<span class="muted">Crossed-out sizes are sold out in this colour.</span>';
  sizeH += '<div class="lp-hint">'+hint+'</div></div>';
  var qtyH = '';
  if(pk.n===1){
    qtyH = '<div class="lp-fld row between"><span class="label" style="margin:0">Quantity</span><span class="qty"><button type="button" data-act="lp-qty" data-slug="'+slug+'" data-d="-1" aria-label="Less">−</button><span>'+u.qty+'</span><button type="button" data-act="lp-qty" data-slug="'+slug+'" data-d="1" aria-label="More">+</button></span></div>';
    if(u.qty>=2 && c.tot.discount) qtyH += '<div class="lp-hint brandc bold">'+esc((c.tot.setDiscounts[0]||{}).label||'Set price')+' applied — you save '+fmt(c.tot.discount)+'</div>';
  }
  var ph = checkPhone(u.phone);
  var payOpts = [['cod','Cash on Delivery','cash'],['bkash','bKash','wallet'],['nagad','Nagad','wallet']];
  var payNote = u.pay==='cod' ? 'Pay the rider when the parcel arrives. No advance needed.' : 'After you confirm, we send a '+(u.pay==='bkash'?'bKash':'Nagad')+' payment request by SMS. You can still pay cash instead.';
  return '<div class="lp-formcol" id="lp-form">'+
  '<form class="card lp-form" data-submit="lp-order" data-slug="'+slug+'" novalidate>'+
    '<div class="row between top"><div><div class="h2">Order now</div><div class="xs muted" style="margin-top:2px">Takes 30 seconds · no account needed</div></div><span class="tag">'+ico('cash',13)+'COD</span></div>'+
    '<div class="row mt12 hide-d" style="gap:12px;padding:10px;background:var(--surface2);border-radius:var(--radius)"><div style="width:52px;flex-shrink:0">'+lp_img(p, u, pk.n>1?'set':'front', {ratio:'ratio-11', label:false})+'</div><div class="grow"><div class="small bold">'+esc(p.name)+'</div><div class="xs text2">'+esc(p.fit)+' · '+esc(p.fabric.split(' · ')[0])+'</div></div></div>'+
    packH + colorH + sizeH + qtyH +
    '<div class="lp-two"><div class="lp-fld"><label class="label" for="lp-name">Your name</label><input id="lp-name" name="name" class="input" autocomplete="name" placeholder="Full name" value="'+esc(u.name)+'" data-input="lp-f" data-slug="'+slug+'"></div>'+
    '<div class="lp-fld"><label class="label" for="lp-phone">Mobile number</label><input id="lp-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" class="input'+(ph.state==='ok'?' ok':(ph.state==='warn'?' warn':''))+'" placeholder="01XXX-XXXXXX" value="'+esc(u.phone)+'" data-input="lp-f" data-slug="'+slug+'" aria-describedby="lp-phone-hint"></div></div>'+
      '<div class="lp-hint" id="lp-phone-hint" aria-live="polite">'+lp_phoneHint(u.phone)+'</div>'+
    '<div class="lp-fld"><label class="label" for="lp-addr">Full address</label><textarea id="lp-addr" name="address" class="input" rows="2" autocomplete="street-address" placeholder="House, road, area, thana, district" data-input="lp-f" data-slug="'+slug+'">'+esc(u.address)+'</textarea>'+
      '<div class="soft lp-del" id="lp-del" aria-live="polite">'+lp_delHTML(c)+'</div></div>'+
    '<div class="lp-fld"><div class="label">Payment</div><div class="lp-pay" role="group" aria-label="Payment">'+payOpts.map(function(o){ var on = u.pay===o[0]; return '<button type="button" class="lp-payb'+(on?' on':'')+'" data-act="lp-pay" data-slug="'+slug+'" data-v="'+o[0]+'" aria-pressed="'+on+'">'+ico(o[2],18)+'<span>'+o[1]+'</span></button>'; }).join('')+'</div>'+
      '<div class="lp-hint muted">'+esc(payNote)+'</div></div>'+
    '<div class="lp-sum" id="lp-sum">'+lp_sumHTML(p, u, c)+'</div>'+
    (typeof consentTicksHTML==='function' ? '<div class="stack s8 lp-cons" data-slug="'+slug+'">'+consentTicksHTML(u.optSms!==false, !!u.optWa, 'lp-consent', 'lp-consent').replace(/data-change="lp-consent"/g, 'data-change="lp-consent" data-slug="'+slug+'"')+'</div>' : '')+
    '<div class="lp-err" id="lp-err" role="alert"></div>'+
    '<button type="submit" class="btn btn-primary btn-block lp-cta" data-testid="lp-confirm">Confirm Order · <span id="lp-btn-total">'+fmt(c.grand)+'</span></button>'+
    '<div class="row xs muted mt12" style="gap:6px;justify-content:center;text-align:center">'+ico('lock',13)+'<span>We call or SMS to confirm · '+esc(ruleText('exchange','short').split(' · ')[0])+'</span></div>'+
  '</form></div>';
}

/* ---------- page ---------- */
var LP_ORDER = {
  'offer-first': ['offer','form','benefits','colors','size','chart','reviews','faq','trust','wa'],
  'fit-first':   ['size','chart','reviews','offer','form','benefits','colors','faq','trust','wa'],
  'story':       ['story','benefits','colors','reviews','offer','size','chart','form','faq','trust','wa'],
  'combo-push':  ['offer','form','colors','benefits','size','chart','reviews','faq','trust','wa']
};
function lp_notFound(){
  return '<div class="container empty" style="padding-top:72px;padding-bottom:72px"><h1 class="h1" style="color:var(--ink)">This offer is not available</h1>'+
    '<p class="muted mt12">The link may be old or the offer has ended. Everything is still in the shop — with Cash on Delivery all over Bangladesh.</p>'+
    '<div class="row wrap mt24" style="justify-content:center"><a class="btn btn-primary" href="#/">See the shop</a>'+waButton('Ask on WhatsApp','Hi EXTAS, I clicked an offer link that did not open.')+'</div></div>';
}
PAGES.landing = {
  layout:'landing',
  title:function(params){ var lp = lp_find(params[0]); var p = lp && P(lp.product); return p ? p.name : 'Offer not available'; },
  render:function(params){
    var lp = lp_find(params[0]); var p = lp && P(lp.product);
    if(!lp || !p) return lp_notFound();
    var u = lp_state(lp, p), packs = lp_packs(p);
    var order = LP_ORDER[lp.template] || LP_ORDER['offer-first'];
    var parts = { offer:lp_offer(lp,p,u,packs), form:lp_form(lp,p,u,packs), benefits:lp_benefits(lp,p), colors:lp_colors(lp,p,u), size:lp_size(lp,p,u), chart:lp_chart(lp,p,u),
      reviews:lp_reviews(lp,p), faq:lp_faq(lp,p,u), trust:lp_trust(), wa:lp_wa(lp,p), story:lp_story(lp,p,u) };
    var c = lp_calc(p, u);
    var body = '<div class="lp-wrap"><div class="container"><div class="lp-grid">'+lp_hero(lp,p,u,packs)+order.map(function(k){ return parts[k]||''; }).join('')+'</div></div></div>'+
      '<footer class="lp-foot"><div class="container"><div class="bold">EXTAS · Cash on Delivery all over Bangladesh</div>'+
      '<div class="links">'+[['delivery','Delivery'],['exchange','Exchange'],['no-return','Returns'],['privacy','Privacy'],['terms','Terms']].map(function(x){ return '<button data-act="lp-policy" data-k="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'</div>'+
      '<div class="xs muted mt8">© 2026 EXTAS · Demo with sample data</div></div></footer>'+
      '<div class="mbar dm-hide lp-mbar" id="lp-mbar"><div class="grow"><div class="price" style="font-size:19px" id="lp-mbar-total">'+fmt(c.grand)+'</div><div class="xs muted">'+esc(c.pack.n===1?u.qty+' × '+p.name:c.pack.name)+' · Cash on Delivery</div></div>'+
      '<button class="btn btn-primary" data-act="lp-goto" data-t="lp-form" style="min-width:150px">'+esc(t('Order Now'))+'</button></div>';
    return body;
  },
  after:function(){
    lp_fitSticky();
    if(lp_obs){ lp_obs.disconnect(); lp_obs = null; }
    var f = document.getElementById('lp-form'), bar = document.getElementById('lp-mbar');
    if(!f || !bar || !('IntersectionObserver' in window)) return;
    lp_obs = new IntersectionObserver(function(es){ es.forEach(function(e){ bar.classList.toggle('away', e.isIntersecting); }); }, {threshold:0.12});
    lp_obs.observe(f);
  }
};

/* sticky order card: if it is taller than the screen, stick by its bottom so "Confirm Order" is always reachable */
function lp_fitSticky(){
  var col = document.getElementById('lp-form'); if(!col) return;
  if(window.innerWidth < 1024){ col.style.top = ''; return; }
  var h = col.offsetHeight, room = window.innerHeight - 92 - 16;
  col.style.top = (h > room ? (window.innerHeight - h - 16) : 92) + 'px';
}
window.addEventListener('resize', lp_fitSticky);

/* ---------- interactions ---------- */
function lp_ctx(el){ var slug = el.getAttribute('data-slug'); var lp = lp_find(slug); if(!lp) return null; var p = P(lp.product); return {slug:slug, lp:lp, p:p, u:lp_state(lp, p)}; }
function lp_patch(x){
  var c = lp_calc(x.p, x.u), set = function(id, h){ var e = document.getElementById(id); if(e) e.innerHTML = h; };
  set('lp-del', lp_delHTML(c)); set('lp-sum', lp_sumHTML(x.p, x.u, c)); set('lp-btn-total', fmt(c.grand)); set('lp-mbar-total', fmt(c.grand));
}
CHANGE['lp-consent'] = function(el){ var x = lp_ctx(el); if(!x) return; if(el.getAttribute('data-k')==='wa') x.u.optWa = el.checked; else x.u.optSms = el.checked; };
ACT['lp-view'] = function(el){ var x = lp_ctx(el); if(!x) return; x.u.view = el.getAttribute('data-v'); rerender(); };
ACT['lp-color'] = function(el){ var x = lp_ctx(el); if(!x) return; var c = el.getAttribute('data-c'); x.u.color = c; if(lp_pack(x.p,x.u).n>1) x.u.picks[0] = c; if(x.u.view==='set' && lp_pack(x.p,x.u).n===1) x.u.view = 'front'; rerender(); };
ACT['lp-pick'] = function(el){ var x = lp_ctx(el); if(!x) return; var i = +el.getAttribute('data-i'); x.u.picks[i] = el.getAttribute('data-c'); if(i===0) x.u.color = x.u.picks[0]; rerender(); };
ACT['lp-pack'] = function(el){ var x = lp_ctx(el); if(!x) return; x.u.pack = el.getAttribute('data-v'); var n = lp_pack(x.p,x.u).n; if(n>1){ x.u.picks[0] = x.u.color; x.u.view = 'set'; } else if(x.u.view==='set') x.u.view = 'front'; rerender(); };
ACT['lp-size'] = function(el){ var x = lp_ctx(el); if(!x) return; x.u.size = el.getAttribute('data-s'); var e = document.getElementById('lp-err'); if(e) e.style.display = 'none'; rerender(); };
ACT['lp-qty'] = function(el){ var x = lp_ctx(el); if(!x) return; var max = x.u.size ? Math.max(1, Math.min(5, stockOf(x.p.id, x.u.color, x.u.size))) : 5; var q = x.u.qty + (+el.getAttribute('data-d')); if(q>max){ toast('Only '+max+' available in this size'); q = max; } x.u.qty = Math.max(1, q); rerender(); };
ACT['lp-pay'] = function(el){ var x = lp_ctx(el); if(!x) return; x.u.pay = el.getAttribute('data-v'); rerender(); };
ACT['lp-unit'] = function(el){ var x = lp_ctx(el); if(!x) return; x.u.unit = el.getAttribute('data-v'); rerender(); };
ACT['lp-faq'] = function(el){ var x = lp_ctx(el); if(!x) return; var i = +el.getAttribute('data-i'); x.u.faq = x.u.faq===i ? -1 : i; rerender(); };
ACT['lp-goto'] = function(el){ var t0 = document.getElementById(el.getAttribute('data-t')); if(t0) t0.scrollIntoView({behavior:'smooth', block:'start'}); };
ACT['lp-video'] = function(){ toast('Demo: the 20-second product video plays here'); };
CHANGE['lp-hw'] = function(el){ var x = lp_ctx(el); if(!x) return; x.u[el.getAttribute('data-k')] = +el.value; };
INPUT['lp-kg'] = function(el){ var x = lp_ctx(el); if(!x) return; x.u.kg = el.value; };
ACT['lp-find'] = function(el){
  var x = lp_ctx(el); if(!x) return; var ch = chartFor(x.p); if(!ch) return;
  var ft = document.getElementById('lp-ft'), inch = document.getElementById('lp-in'), kg = document.getElementById('lp-kg');
  if(ft) x.u.ft = +ft.value; if(inch) x.u.inch = +inch.value; if(kg) x.u.kg = kg.value;
  var w = parseFloat(x.u.kg); if(!w || w<30 || w>180){ toast('Please type your weight in kg'); if(kg) kg.focus(); return; }
  x.u.rec = recommendSize(ch, x.u.ft*12 + x.u.inch, w); rerender();
};
ACT['lp-userec'] = function(el){
  var x = lp_ctx(el); if(!x || !x.u.rec) return; var size = x.u.rec.size;
  if(!lp_sizeOk(x.p, x.u, size)){ toast(size+' is sold out in this colour'); return; }
  x.u.size = size;
  var grp = (CAT(x.p.cat)||{}).group, prev = mySize() || {}, ms = {top:prev.top||null, bottom:prev.bottom||null, heightIn:x.u.ft*12+x.u.inch, weightKg:parseFloat(x.u.kg)};
  if(grp==='bottom') ms.bottom = size; else ms.top = size;
  if(currentAccount()) currentAccount().mySize = ms; else ST.guestSize = ms;
  saveState(); toast('Size '+size+' selected'); rerender();
};
INPUT['lp-f'] = function(el){
  var x = lp_ctx(el); if(!x) return; x.u[el.name] = el.value;
  var e = document.getElementById('lp-err'); if(e) e.style.display = 'none';
  if(el.name==='phone'){ var r = checkPhone(el.value); el.classList.toggle('ok', r.state==='ok'); el.classList.toggle('warn', r.state==='warn'); var h = document.getElementById('lp-phone-hint'); if(h) h.innerHTML = lp_phoneHint(el.value); }
  if(el.name==='address') lp_patch(x);
  lp_fitSticky();
};
ACT['lp-policy'] = function(el){
  var k = el.getAttribute('data-k'), title, body;
  if(k==='delivery'||k==='exchange'||k==='no-return'){ var r = RULE(k); title = r.title; body = ruleText(k,'full'); }
  else if(k==='privacy'){ title = 'Privacy'; body = 'We use your name, phone and address only to deliver your order and send order updates.\nWe never sell your details. Offers by SMS/WhatsApp only if you agree, and you can stop anytime.'; }
  else { title = 'Terms'; body = 'Prices are in Taka and include VAT.\nWe confirm every order by phone or SMS before sending it.\nPolicies for delivery, exchange and returns are shown on this page.'; }
  openModal('<div class="small" style="white-space:pre-line;line-height:1.7">'+esc(body)+'</div>', {title:title});
};
SUBMIT['lp-order'] = function(f){
  var x = lp_ctx(f); if(!x) return; var u = x.u;
  ['name','phone','address'].forEach(function(k){ var el = f.querySelector('[name='+k+']'); if(el) u[k] = el.value; });
  var err = '', focus = null;
  if(!u.size){ err = 'Please choose your size'; }
  else if(!String(u.name).trim()){ err = 'Please write your name'; focus = 'lp-name'; }
  else if(!checkPhone(u.phone).digits){ err = 'Please write your mobile number'; focus = 'lp-phone'; }
  else if(String(u.address).trim().length < 6){ err = 'Please write your full address'; focus = 'lp-addr'; }
  if(err){ var e = document.getElementById('lp-err'); if(e){ e.textContent = err; e.style.display = 'block'; } toast(err); if(focus){ var fe = document.getElementById(focus); if(fe) fe.focus(); } return; }
  var c = lp_calc(x.p, u);
  var prevBag = ST.bag, prevAck = ST.bracketAck;
  ST.bag = []; ST.bracketAck = {};
  c.lines.forEach(function(l){ bagAdd(JSON.parse(JSON.stringify(l))); });
  var id = null;
  try{ id = placeOrder({name:String(u.name).trim(), phone:u.phone, address:String(u.address).trim(), payment:u.pay, offers:!!(u.optSms!==false || u.optWa), consent:{sms:u.optSms!==false, wa:!!u.optWa, src:'ad landing'}, note:'', source:'landing:'+x.slug}); }
  finally { ST.bag = prevBag || []; ST.bracketAck = prevAck || {}; }
  x.lp.orders = (x.lp.orders||0) + 1;
  saveState();
  delete UI['lp:'+x.slug];
  if(id) go('#/thanks/'+id); else toast('Could not place the order — please try again');
};
