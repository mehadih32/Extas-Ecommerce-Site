/* ================= EXTAS demo — shared upsell block (72-upsell.js) =================
   Used on the bag and on the thank-you page. Every part is owner-switchable. */
bag_css('css-ups', [
  '.ups{padding:22px 0 8px}',
  '@media(min-width:1024px){.ups{padding:34px 0 8px}}',
  '.ups-hd{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}',
  '.ups-hd h2{font-family:var(--font-display);font-size:19px;font-weight:700;margin:0}',
  '@media(min-width:1024px){.ups-hd h2{font-size:24px}}',
  '.ups-sub{font-size:13px;color:var(--text2);margin:-6px 0 12px}',
  '.ups-row{display:flex;gap:12px;overflow-x:auto;margin:0 -16px;padding:0 16px 8px;'
    +'scroll-snap-type:x proximity;scrollbar-width:none;overscroll-behavior-x:contain}',
  '.ups-row::-webkit-scrollbar{display:none}',
  '.ups-row>*{flex:0 0 46%;scroll-snap-align:start}',
  '@media(min-width:768px){.ups-row>*{flex:0 0 30%}}',
  '@media(min-width:1024px){.ups-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:visible;margin:0;padding:0}.ups-row>*{flex:none}}',
  '.ups-set{display:flex;align-items:center;gap:12px;padding:14px;border:1.5px solid var(--brand);'
    +'background:var(--brand-tint);border-radius:var(--card-radius)}',
  '.ups-set .ic{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;'
    +'background:var(--surface);color:var(--brand);flex-shrink:0}',
  '.ups-set b{display:block;font-size:14.5px}',
  '.ups-set span{font-size:12.5px;color:var(--text2)}',
  '.ups-why{display:grid;gap:10px;margin-top:14px}',
  '@media(min-width:620px){.ups-why{grid-template-columns:repeat(3,minmax(0,1fr))}}',
  '.ups-w{display:flex;align-items:flex-start;gap:10px;padding:12px 13px;background:var(--surface);'
    +'border:1px solid var(--line);border-radius:var(--radius)}',
  '.ups-w svg{color:var(--brand);flex-shrink:0;margin-top:1px}',
  '.ups-w b{display:block;font-size:13.5px}',
  '.ups-w span{font-size:12.5px;color:var(--text2);line-height:1.45}'
].join('\n'));

/* which products to suggest: same category first, then the rest, never what is already in the bag */
function ups_picks(n){
  n = n || 8;
  var inBag = {};
  ST.bag.forEach(function(l){ if(l.kind==='item') inBag[l.product] = 1; });
  var seedCat = null;
  for(var i=0;i<ST.bag.length;i++){ var l = ST.bag[i]; if(l.kind==='item'){ var pp = P(l.product); if(pp){ seedCat = pp.cat; break; } } }
  var all = DB.products.filter(function(p){ return !inBag[p.id] && !p.hidden; });
  var same = all.filter(function(p){ return p.cat===seedCat; });
  var rest = all.filter(function(p){ return p.cat!==seedCat; });
  return same.concat(rest).slice(0, n);
}

/* the set / combo nudge, only when one actually applies */
function ups_setLine(){
  var cs = (typeof combos==='function' ? combos() : []).filter(function(c){ return c.active; });
  if(!cs.length) return '';
  var c = cs[0];
  var reg = c.items.reduce(function(s,id){ var x = P(id); return s + (x?x.price:0); }, 0);
  var save = reg - c.price;
  return '<a class="ups-set" href="#/combo/'+esc(c.id)+'"><span class="ic">'+ico('layers',20)+'</span>'+
    '<span class="grow"><b>'+esc(c.name)+'</b><span>Take both for '+fmt(c.price)+(save>0?' · save '+fmt(save):'')+'</span></span>'+
    ico('right',18)+'</a>';
}

/* the reassurance row — the three things that actually close a Bangladeshi sale */
function ups_why(){
  return '<div class="ups-why">'+
    '<div class="ups-w">'+ico('cash',18)+'<span><b>Cash on Delivery</b><span>Pay the rider when it reaches you, anywhere in Bangladesh.</span></span></div>'+
    '<div class="ups-w">'+ico('swap',18)+'<span><b>'+esc(SET('exchange','windowHours'))+'-hour size swap</b><span>Wrong size? Exchange it, unworn, with the tags on.</span></span></div>'+
    '<div class="ups-w">'+ico('shield',18)+'<span><b>100% original</b><span>Genuine stock, and we say plainly which brand each item is.</span></span></div>'+
  '</div>';
}

/* where: 'bag' or 'thanks' — the copy changes, the shape does not */
function upsellBlock(where){
  if(!SHOW('upsell', where)) return '';
  var picks = ups_picks(where==='thanks' ? 4 : 6);
  if(!picks.length) return '';
  var title = where==='thanks' ? 'Add to this parcel' : 'Goes well with your bag';
  var sub = where==='thanks'
    ? 'Anything you add in the next few minutes ships with the same order — no second delivery charge.'
    : 'Picked from the same category as what you already have.';
  return '<section class="ups"><div class="container">'+
    '<div class="ups-hd"><h2>'+esc(title)+'</h2><a class="link" href="#/c/new">See all</a></div>'+
    '<p class="ups-sub">'+esc(sub)+'</p>'+
    (SHOW('upsell','setLine') ? ups_setLine() : '')+
    '<div class="ups-row mt12">'+picks.map(function(p){ return productCard(p); }).join('')+'</div>'+
    (SHOW('upsell','why') ? ups_why() : '')+
  '</div></section>';
}
