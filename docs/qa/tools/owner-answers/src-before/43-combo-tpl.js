/* =====================================================================
   EXTAS demo — COMBO IN THE BAG: templates B1–B5 (PR 574, wave 2)
   ---------------------------------------------------------------------
   How a set line (combo / build-your-own / auto colour pair) is drawn in
   the bag. The money never changes with the template: every row shows
   what bagTotals() charges (02-core.js), so bag total = sum of combo
   prices, and the checkout shows the same.

     current  the R16 look (bag_setLine in 50-bag.js) — kept as is
     B1  grouped card: one price, each piece with its own photo (read-only)
     B2  grouped card + size changed right in the bag (per-piece dropdown,
         stock re-checked at once) — COMBO-RESEARCH §8 "recommended"
     B3  B2 + "add 1 more → 3 pcs" inside the card (auto pairs with a
         3-piece rule)
     B4  split lines: each piece at its real price + one combo discount
         line = the set price (the order-record / invoice view)
     B5  compact one-line set once the bag holds 3+ sets (▸ opens B2);
         under 3 sets it draws B2

   Every template keeps: "Change size or colour" (opens the pair page with
   this line's choices and replaces the line), Move to wishlist + Undo,
   Remove + Undo, the stock warnings, the repriced / member-offer notes.

   Setting: ST.comboAuto.bagTpl (Admin → Combos → Shop default templates).
   Review:  #/bag?btpl=B1..B5 (or current).   Prefix: cbt_ / .cbt-
   ===================================================================== */
var CBT_LIST = {current:'Current look', B1:'Grouped card', B2:'Size in the bag', B3:'Add 1 more', B4:'Price split', B5:'Compact row'};
function cbt_tpl(){
  var q = (typeof CUR!=='undefined' && CUR && CUR.page==='bag' && CUR.query) || {};
  var t = q.btpl || (ST.comboAuto && ST.comboAuto.bagTpl) || 'B5'; /* R15 ranking winner; 'current' still selectable */
  return CBT_LIST[t] ? t : 'current';
}
function cbt_open(){ return ui('cbt:open', {}); }
function cbt_errs(){ return ui('cbt:err', {}); }

/* what every template needs to know about one set line */
function cbt_info(l, row){
  var q = l.qty||1; row = row || {regular:0, price:l.price*q};
  var cid = bag_setCid(l), L = l.source==='auto' && typeof ca_listing==='function' ? ca_listing(l.refId) : null;
  var pcs = (l.items||[]).map(function(it){ return {it:it, p:P(it.product)}; }).filter(function(x){ return !!x.p; });
  var title = L ? L.styleName+' combo' : bagSetName(l.name);
  var colours = l.items.map(function(it){ return COL(it.color).name; }).join(' + ');
  return {l:l, row:row, cid:cid, L:L, pcs:pcs, reg:row.regular, amt:row.price, save:Math.max(0, row.regular-row.price),
    title:title, colours:colours, sizes:l.items.map(function(it){ return it.size; }).join(' / '),
    href:bag_setOpenHref(l, cid), change:cid ? bag_setHref(l, cid, true) : null};
}
function cbt_thumb(x, cls){
  var l = x.l;
  return '<a class="bg-thumb'+(cls?' '+cls:'')+'" href="'+x.href+'" aria-label="'+esc(x.title)+'">'+
    (l.source==='auto' && typeof ca_setPhoto==='function' ? ca_setPhoto(ca_piecesOf(l.items), {layout:'thumb'}) : setImg(l.items, {ratio:'ratio-11'}))+'</a>';
}
function cbt_pieceArt(pc){
  var c = {p:pc.p, color:pc.it.color};
  return '<div class="ca-ph ca-ph-one" style="background:'+(typeof CA_HOUSE_BG!=='undefined' ? CA_HOUSE_BG : '#ECE9E3')+'"><div class="ca-art">'+(typeof ca_pieceArt==='function' ? ca_pieceArt(c) : garmentSVG('tee', COL(c.color).hex, 'front'))+'</div></div>';
}
function cbt_short(p){ return typeof ca_noun==='function' ? ca_noun(p) : (p.style || p.name); }
/* a name that steps down (full → short) instead of wrapping (cbt_fit) */
function cbt_fitTxt(full, short, tiny){ return (full===short && !tiny) ? esc(full) : '<span class="cbt-f">'+esc(full)+'</span><span class="cbt-s">'+esc(short)+'</span>'+(tiny ? '<span class="cbt-t">'+tiny+'</span>' : ''); }
/* "Only 2 left" — what is left after the rest of the bag */
function cbt_left(l, it){
  var use = bagStockUse(l.id), k = bagSku(it.product, it.color, it.size);
  return stockOf(it.product, it.color, it.size) - (use[k]||0);
}
/* the three actions stay on ONE line; on a narrow phone the words step
   down (Change size or colour → Change, Move to wishlist → Wishlist) */
function cbt_acts(x){
  return '<div class="cbt-acts cbt-fit">'+(x.change ? '<a class="link cbt-chg" href="'+x.change+'" data-testid="bag-set-change" aria-label="Change size or colour">'+ico('edit',14)+cbt_fitTxt('Change size or colour', 'Change')+'</a>' : '')+
    '<button type="button" class="link" data-act="bag-save" data-id="'+x.l.id+'" data-testid="bag-set-save" aria-label="Move to wishlist">'+ico('heart',15)+cbt_fitTxt('Move to wishlist', 'Wishlist')+'</button>'+
    '<button type="button" class="link" data-act="bag-remove" data-id="'+x.l.id+'">Remove</button></div>';
}
function cbt_price(x){
  return '<div class="cbt-pr"><div class="price" data-testid="bag-set-price">'+fmt(x.amt)+'</div>'+(x.reg>x.amt ? '<div class="strike xs">'+fmt(x.reg)+'</div>' : '')+'</div>';
}
function cbt_head(x, thumb){
  return '<div class="cbt-top"'+(thumb ? '' : ' style="grid-template-columns:minmax(0,1fr) auto"')+'>'+(thumb ? cbt_thumb(x) : '')+
    '<div class="cbt-hd"><a class="bg-name" href="'+x.href+'">'+esc(x.title)+'</a><div class="xs muted">'+plural(x.pcs.length,'piece')+(x.save ? ' · <span class="cbt-save">you save '+fmt(x.save)+'</span>' : '')+'</div></div>'+cbt_price(x)+'</div>';
}
/* one piece row; `edit` = size dropdown in the row (B2/B3) */
function cbt_piece(x, pc, i, edit){
  var it = pc.it, left = cbt_left(x.l, it), err = cbt_errs()[x.l.id];
  var low = left>0 && left<=2 ? '<span class="cbt-low" data-testid="bag-piece-low">Only '+left+' left</span>' : '';
  var right;
  if(edit){
    right = '<label class="sr" for="cbt-'+x.l.id+'-'+i+'">Size for '+esc(COL(it.color).name+' '+cbt_short(pc.p))+'</label><select id="cbt-'+x.l.id+'-'+i+'" class="cbt-sel" data-change="cbt-size" data-id="'+x.l.id+'" data-i="'+i+'" data-testid="bag-size-sel">'+
      pc.p.sizes.map(function(s){ var cand = {product:it.product, color:it.color, size:s}, ok = s===it.size || cbt_canSize(x.l, i, s);
        return '<option value="'+esc(s)+'"'+(s===it.size?' selected':'')+(ok?'':' disabled')+'>'+esc(s)+(ok?'':' — sold out')+'</option>'; }).join('')+'</select>';
  } else right = '<span class="cbt-pcr">'+esc(it.size)+'</span>';
  return '<li class="cbt-pc">'+cbt_pieceArt(pc)+'<div class="cbt-pcn cbt-fit"><b>'+cbt_fitTxt(pc.p.name, cbt_short(pc.p))+'</b><span>'+esc(COL(it.color).name)+(edit ? '' : ' · '+esc(it.size))+(low ? ' · ' : '')+low+'</span></div>'+right+'</li>'+
    (err && err.i===i ? '<li class="zc-note bad" role="alert" data-testid="bag-size-err">'+ico('info',13)+'<span>'+esc(err.msg)+'</span></li>' : '');
}
/* would piece i in size s still fit the stock, with the rest of the bag? */
function cbt_canSize(l, i, s){
  var items = l.items.map(function(it, k){ return {product:it.product, color:it.color, size:k===i ? s : it.size}; });
  return !bagStockClash(items, l.id).length;
}

/* ---------- B1 / B2 / B3 ---------- */
function cbt_B1(x, edit, nudge){
  return '<div class="cbt-card" data-line="'+x.l.id+'" data-testid="bag-set" data-btpl="'+(nudge ? 'B3' : edit ? 'B2' : 'B1')+'">'+cbt_head(x, false)+
    '<ul class="cbt-pcs">'+x.pcs.map(function(pc, i){ return cbt_piece(x, pc, i, edit); }).join('')+'</ul>'+
    (nudge ? cbt_nudge(x) : '')+bag_setNotes(x.l, x.row, x.issues)+cbt_acts(x)+'</div>';
}
/* B3 · "add 1 more" — only for an auto pair whose rule grows into 3 pcs */
function cbt_upsell(x){
  var L = x.L; if(!L || L.n!==2 || !L.same || typeof ca_upsellRule!=='function') return null;
  var r3 = ca_upsellRule(L.rule); if(!r3) return null;
  var size = x.l.items[0].size, same = x.l.items.every(function(it){ return it.size===size; });
  var p = L.pieces[0].p, cands = ca_coloursOf(r3, p).filter(function(c){ return L.colours.indexOf(c)<0; }).map(function(c){
    var T = ca_findBy(r3, L.pieces.concat([{p:p, color:c}])); return {c:c, T:T, ok:!!(T && T.availCount>0 && cbt_left({id:null}, {product:p.id, color:c, size:size})>0)}; }).filter(function(y){ return y.T; });
  if(!cands.some(function(y){ return y.ok; })) return null;
  return {r3:r3, size:size, same:same, cands:cands, T0:cands.filter(function(y){ return y.ok; })[0].T, p:p};
}
function cbt_nudge(x){
  var up = cbt_upsell(x); if(!up) return '';
  var T = up.T0, more = Math.max(0, T.save - x.save);
  return '<div class="cbt-nudge" data-testid="bag-nudge"><div class="grow"><b>Add 1 more → 3 for '+fmt(T.price)+'</b>'+fmt(T.each)+' each'+(more ? ' · save '+fmt(more)+' more' : '')+'</div>'+
    '<button type="button" class="btn btn-secondary btn-sm" data-act="cbt-more" data-id="'+x.l.id+'">'+ico('plus',15)+'Add 1</button></div>';
}

/* ---------- B4 · split lines (real piece prices + one discount line) ---------- */
function cbt_B4(x){
  var lines = x.pcs.map(function(pc){ var it = pc.it;
    return '<li><span>'+esc(cbt_short(pc.p))+' · '+esc(COL(it.color).name)+' · '+esc(it.size)+'</span><span>'+fmt(pc.p.price)+'</span></li>'; }).join('');
  var disc = x.reg - x.amt;
  return '<div class="cbt-card" data-line="'+x.l.id+'" data-testid="bag-set" data-btpl="B4">'+
    '<div class="cbt-top" style="grid-template-columns:72px minmax(0,1fr)">'+cbt_thumb(x)+'<div class="cbt-hd"><a class="bg-name" href="'+x.href+'">'+esc(x.title)+'</a><div class="xs muted">'+plural(x.pcs.length,'piece')+'</div></div></div>'+
    '<ul class="cbt-split" data-testid="bag-split">'+lines+
      (disc>0 ? '<li class="cbt-disc"><span>Combo discount</span><span>'+fmt(-disc)+'</span></li>' : '')+
      '<li class="cbt-sum"><span>You pay for this combo</span><span data-testid="bag-set-price">'+fmt(x.amt)+'</span></li></ul>'+
    bag_setNotes(x.l, x.row, x.issues)+cbt_acts(x)+'</div>';
}

/* ---------- B5 · compact row (3+ sets), ▸ opens the B2 card ---------- */
function cbt_B5(x){
  var open = cbt_open()[x.l.id];
  if(open) return cbt_B1(x, true, false).replace('data-btpl="B2"', 'data-btpl="B5"').replace('<div class="cbt-acts">', '<div class="cbt-acts"><button type="button" class="link" data-act="cbt-exp" data-id="'+x.l.id+'" aria-expanded="true">'+ico('up',14)+'Less</button>');
  var full = x.L ? x.L.styleName+' · '+x.colours : x.title+' · '+x.colours, short = x.colours;
  return '<div class="cbt-row" data-line="'+x.l.id+'" data-testid="bag-set" data-btpl="B5">'+cbt_thumb(x)+
    '<div class="cbt-rowt cbt-fit"><b>'+cbt_fitTxt(full, short, (typeof ca_dots==='function' ? ca_dots(x.l.items.map(function(it){ return it.color; })) : '')+' '+esc(plural(x.pcs.length,'piece')))+'</b><span>'+(x.save ? '<span class="cbt-f2">'+esc(x.sizes)+' · save '+fmt(x.save)+'</span><span class="cbt-s2">'+esc(x.sizes)+'</span>' : esc(x.sizes))+'</span></div>'+
    '<div class="cbt-rowp" data-testid="bag-set-price">'+fmt(x.amt)+'</div>'+
    '<button type="button" class="cbt-exp" data-act="cbt-exp" data-id="'+x.l.id+'" aria-expanded="false" aria-label="Show the pieces, change size or remove">'+ico('down',16)+'</button></div>'+
    ((x.issues||[]).length ? '<div class="zc-note bad" role="alert" data-testid="bag-stock-issue">'+ico('info',13)+'<span>'+esc(x.issues[0].msg)+'</span></div>' : '');
}

/* ---------- dispatch (called by bag_render in 50-bag.js) ---------- */
function cbt_line(l, row, issues){
  var t = cbt_tpl();
  if(t==='current') return bag_setLine(l, row, issues);
  var x = cbt_info(l, row); x.issues = issues || [];
  if(t==='B1') return cbt_B1(x, false, false);
  if(t==='B2') return cbt_B1(x, true, false);
  if(t==='B3') return cbt_B1(x, true, true);
  if(t==='B4') return cbt_B4(x);
  var sets = ST.bag.filter(function(b){ return b.kind==='set'; }).length;
  return sets >= 3 ? cbt_B5(x) : cbt_B1(x, true, false).replace('data-btpl="B2"', 'data-btpl="B5"');
}
/* demo review bar under the bag (only when the bag holds a set) */
function cbt_tplBar(){
  if(!ST.bag.some(function(l){ return l.kind==='set'; })) return '';
  var cur = cbt_tpl();
  return '<div class="ca-tplbar cbt-tpl" data-testid="cbt-tplbar"><div class="xs muted">Demo · how a combo shows in the bag</div><div class="ca-tplrow">'+
    Object.keys(CBT_LIST).map(function(t){ return '<a class="chip'+(t===cur?' on':'')+'" href="#/bag?btpl='+t+'" aria-current="'+(t===cur)+'">'+(t==='current' ? 'Current' : t+' · '+CBT_LIST[t])+'</a>'; }).join('')+
    '<button type="button" class="link xs" data-act="ca-tpldefault" data-k="bagTpl" data-v="'+cur+'">Make '+(cur==='current' ? 'Current' : cur)+' the default</button></div></div>';
}
/* AUTO ADJUST: names that would run past their box step down to the short form */
function cbt_over(el){ return [].some.call(el.children, function(k){ return k.scrollWidth > k.clientWidth + 1 || k.scrollWidth > el.clientWidth + 1; }) || el.scrollWidth > el.clientWidth + 1; }
function cbt_fit(){
  var all = [].slice.call(document.querySelectorAll('.cbt-fit'));
  /* steps: full → short words → colour dots (if offered) → let it wrap */
  all.forEach(function(el){ el.classList.remove('cbt-short', 'cbt-tiny', 'cbt-wrap'); });
  all.forEach(function(el){
    if(!cbt_over(el)) return; el.classList.add('cbt-short');
    if(cbt_over(el) && el.querySelector('.cbt-t')) el.classList.add('cbt-tiny');
    if(cbt_over(el)) el.classList.add('cbt-wrap');
  });
  /* piece names inside one card step down together, so the rows match */
  [].forEach.call(document.querySelectorAll('.cbt-card'), function(card){
    var names = card.querySelectorAll('.cbt-pcn.cbt-fit');
    if([].some.call(names, function(n){ return n.classList.contains('cbt-short'); })) [].forEach.call(names, function(n){ n.classList.add('cbt-short'); });
  });
}
window.addEventListener('resize', function(){ if(typeof CUR!=='undefined' && CUR && CUR.page==='bag') cbt_fit(); });

/* ---------- actions ---------- */
/* B2/B3/B5: change one piece's size right in the bag (stock re-checked) */
CHANGE['cbt-size'] = function(el){
  var id = el.getAttribute('data-id'), i = +el.getAttribute('data-i'), l = bag_line(id); if(!l) return;
  var copy = JSON.parse(JSON.stringify(l)), was = copy.items[i].size; copy.items[i].size = el.value; delete copy.id;
  var res = bagAdd(copy, {replace:id, force:true}), er = cbt_errs();
  if(res.added){ delete er[id]; var op = cbt_open(); if(op[id]){ op[res.id] = true; delete op[id]; } rerender(); toast(COL(copy.items[i].color).name+' '+cbt_short(P(copy.items[i].product)).toLowerCase()+': size '+was+' → '+el.value); }
  else { er[id] = {i:i, msg:res.msg || 'That size is not available.'}; rerender(); }
};
ACT['cbt-exp'] = function(el){ var o = cbt_open(), id = el.getAttribute('data-id'); o[id] = !o[id]; rerender(); };
/* B3: "Add 1" opens a sheet with the other colours in the same size */
function cbt_moreHTML(){
  var st = UI['cbt:more']; if(!st) return ''; var l = bag_line(st.id); if(!l) return '';
  var x = cbt_info(l), up = cbt_upsell(x); if(!up) return '<p class="small">This combo can no longer grow to 3 pieces.</p>';
  return '<p class="small text2" style="margin:0 0 10px">Pick the 3rd colour — size '+esc(up.size)+(up.same ? ' (same as the others)' : '')+'. Your combo becomes <b>3 for '+fmt(up.T0.price)+'</b>.</p>'+
    '<div class="ca-upcols">'+up.cands.map(function(y){ return '<button type="button" class="ca-sw'+(y.ok?'':' out')+'" data-act="'+(y.ok?'cbt-more-pick':'ca-noop')+'" data-id="'+esc(l.id)+'" data-c="'+esc(y.c)+'"'+(y.ok?'':' aria-disabled="true"')+'><i style="background:'+COL(y.c).hex+'"></i><span>'+esc(COL(y.c).name)+'</span>'+(y.ok?'':'<em>'+esc(up.size)+' sold out</em>')+'</button>'; }).join('')+'</div>';
}
ACT['cbt-more'] = function(el){ UI['cbt:more'] = {id:el.getAttribute('data-id')}; openModal(cbt_moreHTML(), {title:'Add 1 more to this combo', rebuild:cbt_moreHTML}); };
ACT['cbt-more-pick'] = function(el){
  var l = bag_line(el.getAttribute('data-id')); if(!l) return; var x = cbt_info(l), up = cbt_upsell(x); if(!up) return;
  var c = el.getAttribute('data-c'), T = ca_findBy(up.r3, x.L.pieces.concat([{p:up.p, color:c}])); if(!T) return;
  var sizes = T.pieces.map(function(pc){ var it = l.items.filter(function(i2){ return i2.color===pc.color && i2.product===pc.p.id; })[0]; return it ? it.size : up.size; });
  var res = ca_bagAdd(T, sizes, {replace:l.id, force:true});
  if(res.added){ closeModal(); rerender(); toast('Now 3 pcs: '+T.title+' · '+fmt(T.price)); }
  else if(res.reason==='stock'){ closeModal(); cbt_errs()[l.id] = {i:0, msg:res.msg}; rerender(); }
};
