/* ================= EXTAS demo — ready-made set page (#/combo/:id) =================
   Templates: C1 Stacked (one picker card per item) · C2 Step-by-step.
   Everything here is prefixed cb_ (functions) / cb- (actions, CSS classes). */

(function cb_injectCSS(){
  if(document.getElementById('cb-css')) return;
  var css = [
    '.cb-wrap{padding-top:12px}',
    '@media(min-width:1024px){.cb-wrap{padding-top:20px}}',
    '.cb-main{display:grid;gap:18px;margin-top:10px}',
    '@media(min-width:1024px){.cb-main{grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:52px;align-items:start;margin-top:16px}.cb-left{position:sticky;top:96px}}',
    '.cb-gal{display:grid;gap:10px;grid-template-columns:minmax(0,1fr);grid-template-areas:"stage" "tabs" "rail"}',
    '@media(min-width:1024px){.cb-gal{grid-template-columns:86px minmax(0,1fr);grid-template-areas:"tabs tabs" "rail stage";gap:12px}}',
    '.cb-stage{grid-area:stage;position:relative;margin:0 -16px}',
    '@media(min-width:768px){.cb-stage{margin:0}}',
    '.cb-stage>.pimg{border-radius:0}',
    '@media(min-width:768px){.cb-stage>.pimg{border-radius:var(--card-radius)}}',
    '.cb-tabs{grid-area:tabs;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;align-items:center}',
    '.cb-tabs .chip{min-height:38px;flex-shrink:0}',
    '.cb-tabs-lbl{font-size:12px;color:var(--muted);font-weight:600;flex-shrink:0;margin-right:2px}',
    '.cb-rail{grid-area:rail;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}',
    '@media(min-width:1024px){.cb-rail{grid-template-columns:minmax(0,1fr);align-content:start}}',
    '.cb-thumb{display:block;width:100%;padding:0;border:1px solid var(--line);background:var(--surface);border-radius:var(--radius);overflow:hidden;cursor:pointer;text-align:center}',
    '.cb-thumb.on{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand)}',
    '.cb-thumb .pimg{border-radius:0}',
    '.cb-thumb .pimg-label,.cb-setcard .pimg-label{display:none}',
    '.cb-stage .pimg>div,.cb-thumb .pimg>div,.cb-setcard .pimg>div,.cb-sum-img .pimg>div{align-self:stretch}',
    '.cb-cap{display:block;font-size:10.5px;font-weight:600;color:var(--text2);padding:4px 2px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.cb-thumb.on .cb-cap{color:var(--ink)}',
    '.cb-dot{display:inline-block;width:12px;height:12px;border-radius:50%;border:1px solid rgba(0,0,0,.22);flex-shrink:0}',
    '.cb-dots{display:inline-flex;align-items:center}',
    '.cb-dots .cb-dot{width:16px;height:16px;box-shadow:0 0 0 2px var(--bg)}',
    '.cb-dots .cb-dot+.cb-dot{margin-left:-4px}',
    '.cb-stagebtn{position:absolute;right:12px;bottom:12px;background:var(--surface);color:var(--ink);border:1px solid var(--line);min-height:38px;padding:7px 12px;font-size:13px;font-weight:600;border-radius:var(--btn-radius);cursor:pointer;display:inline-flex;align-items:center;gap:6px}',
    '.cb-pricebox{padding:16px 18px}',
    '@media(min-width:1024px){.cb-pricebox{padding:20px 22px}}',
    '.cb-big{font-size:34px;line-height:1.05;margin-top:4px}',
    '.cb-reg{border-top:1px solid var(--line2);margin-top:14px;padding-top:12px;display:grid;gap:6px}',
    '.cb-item{padding:16px}',
    '@media(min-width:1024px){.cb-item{padding:18px 20px}}',
    '.cb-item.err,.cb-panel.err{border-color:var(--sale);box-shadow:0 0 0 1px var(--sale)}',
    '.cb-mini{width:56px;flex-shrink:0}',
    '.cb-mini .pimg{border-radius:var(--radius)}',
    '.cb-pills{display:flex;flex-wrap:wrap;gap:8px}',
    '.cb-measure{display:flex;gap:9px;align-items:flex-start;font-size:12.5px;line-height:1.5;color:var(--text2);background:var(--surface2);border:1px solid var(--line2);border-radius:var(--radius);padding:9px 11px;margin-top:12px}',
    '.cb-measure svg{flex-shrink:0;margin-top:1px;color:var(--muted)}',
    '.cb-errtxt{color:var(--sale);font-size:13px;font-weight:600;margin-top:10px}',
    '.cb-warn{font-size:12.5px;margin-top:10px;padding:8px 11px}',
    '.cb-steps{list-style:none;margin:0;padding:0;display:flex}',
    '.cb-steps li{flex:1;position:relative;min-width:0}',
    '.cb-steps li+li::before{content:"";position:absolute;top:17px;left:calc(-50% + 24px);right:calc(50% + 24px);height:2px;background:var(--line)}',
    '.cb-steps li.ldone::before{background:var(--brand)}',
    '.cb-stepbtn{display:flex;flex-direction:column;align-items:center;gap:6px;width:100%;background:none;border:none;padding:0 2px;cursor:pointer;color:var(--ink);font-size:13px;min-height:44px}',
    '.cb-stepbtn[disabled]{cursor:default;color:var(--muted)}',
    '.cb-num{width:34px;height:34px;border-radius:50%;border:1.5px solid var(--input);background:var(--surface);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:var(--muted);flex-shrink:0}',
    '.cb-num.now{border:2px solid var(--brand);color:var(--brand)}',
    '.cb-num.done{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}',
    '.cb-num.sm{width:26px;height:26px;font-size:12px}',
    '.cb-slabel{display:flex;flex-direction:column;align-items:center;line-height:1.25;text-align:center}',
    '.cb-panel{border:1.5px solid var(--brand);padding:16px}',
    '@media(min-width:1024px){.cb-panel{padding:20px 22px}}',
    '.cb-row{display:flex;align-items:center;gap:12px;padding:12px 14px}',
    '.cb-row.todo{color:var(--muted);background:var(--surface2);border:1px dashed var(--input);border-radius:var(--card-radius)}',
    '.cb-sum-line{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line2)}',
    '.cb-sum-img{width:46px;flex-shrink:0}',
    '.cb-sum-img .pimg{border-radius:var(--radius)}',
    '.cb-review{border:1.5px solid var(--brand)}',
    '.cb-ctas{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.cb-ctas .btn{padding-left:10px;padding-right:10px}',
    '.cb-mbar{bottom:56px;box-shadow:0 -6px 18px rgba(0,0,0,.06)}',
    '@media(min-width:1024px){.cb-mbar{bottom:0}}',
    '.cb-donly{display:none}',
    '@media(min-width:1024px){.cb-donly{display:block}}',
    '.cb-toast{display:flex;align-items:center;gap:14px;bottom:170px;width:max-content;max-width:calc(100vw - 32px)}',
    '.chip.on .cb-dot{border-color:rgba(255,255,255,.75)}',
    '@media(max-width:1023px){body:has(.cb-mbar) .demo-fab{bottom:172px}body:has(.cb-mbar) .demo-panel{bottom:222px}}',
    /* A5. THE in/cm TOGGLE
       It was 27px tall — under the 44px touch minimum — pinned to the right
       edge of its heading row with no air under it, which is also the column
       the floating button travels down. 44px tall, and a real gap below the
       row so a mis-tap lands on nothing instead of on the heading. */
    '.cb-wrap .seg{padding:3px}',
    '.cb-wrap .seg button{min-height:38px;min-width:46px;padding:8px 14px;font-size:13.5px;position:relative}',
    '.cb-wrap .seg button::after{content:"";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:max(100%,46px);height:44px}',
    '.cb-wrap .cb-unitrow{align-items:center;gap:12px;margin-bottom:18px!important}',
    /* and it keeps clear of the floating button\u2019s column at the foot of the page */
    '@media(max-width:1023px){.cb-wrap .cb-unitrow{padding-right:0}}',
    /* A10. WHATSAPP GREEN
       White on #1FA855 measures 3.09:1. #13833F is the same hue two steps
       down and measures 4.83:1, so the label passes AA at this size. */
    '.cb-wrap .wa-btn.cb-wabtn,.cb-wrap .wa-btn.btn-block{background:#13833F;border-color:#0F6C33}',
    '.cb-wrap .wa-btn.cb-wabtn:hover,.cb-wrap .wa-btn.btn-block:hover{background:#0F6C33}',
    /* A6-family: the rule value links are 36px on this page too */
    '.cb-wrap .rule-v{position:relative}',
    '.cb-wrap .rule-v::before{content:"";position:absolute;left:-6px;right:-6px;top:50%;transform:translateY(-50%);height:44px}',
    /* the item title is a link too, and it was 22.5px tall */
    '.cb-wrap a.h3{position:relative;display:inline-block}',
    '.cb-wrap a.h3::after{content:"";position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:44px}',
    '@media(min-width:1024px){.cb-toast{bottom:28px}}',
    '.cb-toast a{color:var(--bg)!important;font-weight:700;text-decoration:underline;white-space:nowrap}',
    '.cb-off{padding:40px 20px;text-align:center}',
    '.cb-ico{width:56px;height:56px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:inline-flex;align-items:center;justify-content:center}',
    '.cb-setcard{border:1px solid var(--line)}',
    '.cb-build{display:flex;flex-direction:column;justify-content:space-between;padding:20px;height:100%;color:var(--ink)!important;background:var(--brand-tint);border:1px solid var(--brand-line);border-radius:var(--card-radius)}',
    '.cb-finder{display:flex;align-items:center;gap:12px;padding:13px 14px;color:var(--ink)!important;border:1px solid var(--line);background:var(--surface);border-radius:var(--card-radius)}',
    '.cb-finder:hover{border-color:var(--brand)}',
    '.cb-finder .ic{width:36px;height:36px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;flex-shrink:0}'
      /* ---- R14. AUTO-ADJUST on every phone (the fifteen-size gate) ----
       Popular pairs: as many columns as the names fit — three from ~396px,
       two below — instead of three squeezed columns that cut "White + …".
       The chips then share one type size (AUTO-FIT, group cbpair). */
    ,'.cb-wrap .cb-pairs{grid-template-columns:repeat(auto-fit,minmax(min(100%,116px),1fr))}',
    '.cb-wrap .cb-pairs .chip{font-size:12px}',
    '.cb-wrap .cb-pairs .cb-pairname{font-size:1em;overflow:hidden;text-overflow:clip}',
    '.cb-wrap .cb-pairs .chip.fit-x .cb-dots{display:none}',
    '@media(min-width:768px){.cb-wrap .cb-pairs{grid-template-columns:repeat(auto-fit,minmax(144px,1fr))}.cb-wrap .cb-pairs .chip{font-size:13px}}',
    /* Thumbnail captions: one size across the five, stepping down with the
       thumbnail; "True colour" becomes "Colour" only where even the floor
       size cannot hold it. */
    '.cb-wrap .cb-cap{white-space:nowrap;overflow:visible;text-overflow:clip}',
    '.cb-cap-l{display:block;overflow:hidden;white-space:nowrap}',
    '.cb-cap-s{display:none;overflow:hidden;white-space:nowrap}',
    '.cb-cap.fit-x .cb-cap-l{display:none}',
    '.cb-cap.fit-x .cb-cap-s{display:block}',
    /* Size pills: one column per size, so five sizes never break 4 + 1 */
    '.cb-wrap .cb-pills{grid-template-columns:repeat(var(--n,5),minmax(0,1fr))}',
    /* Set price box: at 320px the 36px price broke into "৳" / "1,500" and
       "Separately ৳1,700" into two lines beside the saving tag. Nothing in
       the row wraps now; the row is sized in em and steps down as one. */
    /* overflow-x:clip — until AUTO-FIT has run, a too-wide row must not
       widen the whole page (a phone grows its layout viewport to fit) */
    '.cb-wrap .cb-pricebox .cb-pbrow{font-size:13px;flex-wrap:nowrap;overflow-x:clip;overflow-y:visible}',
    '.cb-wrap .cb-pricebox .cb-pbrow>div{min-width:0}',
    /* the phone grid had an implicit auto column, so any nowrap line inside
       it could stretch the column past the screen; it is one 0-floored
       column now, and the price row does not count towards it */
    '@media(max-width:1023px){.cb-main{grid-template-columns:minmax(0,1fr)}}',
    '.cb-wrap .cb-pricebox .cb-pbrow{contain:inline-size}',
    '.cb-wrap .cb-pricebox .cb-pbrow .cb-big{font-size:2.77em;white-space:nowrap}',
    '.cb-wrap .cb-pricebox .cb-pbrow .small{font-size:1em;white-space:nowrap}',
    '.cb-wrap .cb-pricebox .cb-pbrow .tag.sale{font-size:1em!important;flex-shrink:0}',
    '.cb-wrap .cb-pills{font-size:var(--cb-pill-fs,15px)}',
    '.cb-wrap .cb-pills .size-pill{font-size:1em;white-space:nowrap;overflow:hidden}'
    ].join('\n');
  var s = document.createElement('style'); s.id = 'cb-css'; s.textContent = css; document.head.appendChild(s);
})();


/* =====================================================================
   R16 · COMBO FIX — settings the owner can change
   ---------------------------------------------------------------------
   COMBO_LAYOUT   which complete page layout the set page uses:
     'current'  the page as it was (bugs fixed): one card per item
     'L1'       One screen — photo, price, one compact row per item
     'L2'       Fast steps — item by item, moves on by itself when picked
     'L3'       Mix & match — tap colours from a grid, one size for all
     'L4'       Ready looks first — tap a look, then one size for all
   Preview any of them with #/combo/<id>?layout=L2 . Admin → Combos & sets
   has the same switch (saved as ST.comboLayout), which wins over this line.
   CB_PHONE_ORDER  for 'current' on phones only (audit finding 14):
     'A' pickers straight under the price · 'B' pickers above the photo ·
     'C' a shorter photo, then price, then pickers (default)
   CB_FINDER_SECS  the one number every "Find my size in N seconds" line
     uses (the product page's own finder card says 20 seconds).
   ===================================================================== */
var COMBO_LAYOUT = 'current';
var CB_PHONE_ORDER = 'C';
var CB_FINDER_SECS = 20;
var CB_LAYOUTS = {current:'Current (fixed)', L1:'One screen', L2:'Fast steps', L3:'Mix & match grid', L4:'Ready looks first'};
function cb_layout(query){
  var q = query && query.layout;
  if(q && CB_LAYOUTS[q]) return q;
  if(ST.comboLayout && CB_LAYOUTS[ST.comboLayout]) return ST.comboLayout;
  return CB_LAYOUTS[COMBO_LAYOUT] ? COMBO_LAYOUT : 'current';
}
function cb_phoneOrder(query){ var q = query && query.order; if(q && /^[ABC]$/.test(q)) return q; return ST.comboPhoneOrder || CB_PHONE_ORDER; }

/* ---------- data helpers ---------- */
var CB_POPULAR = [['navy','white'],['black','olive'],['white','black'],['navy','red'],['black','grey'],['sky','white'],['charcoal','ecru'],['white','olive'],['navy','grey'],['khaki','navy'],['black','white']];

function cb_regular(c){ return c.items.reduce(function(s, pid){ var p = P(pid); return s + (p ? p.price : 0); }, 0); }
/* R16 (5): the set is never sold above the regular total of its items */
function cb_price(c){ var reg = cb_regular(c), p = Number(c.price)||reg; return Math.min(p, reg); }
function cb_save(c){ return cb_regular(c) - cb_price(c); }
function cb_allSame(c){ return c.items.length>1 && c.items.every(function(pid){ return pid===c.items[0]; }); }
function cb_linkSrc(c, i){ for(var j=0;j<i;j++) if(c.items[j]===c.items[i]) return j; return -1; }
function cb_sizeOf(c, u, i){ var j = cb_linkSrc(c, i); if(j>=0 && u.same[i]) return cb_sizeOf(c, u, j); return u.sizes[i] || null; }
function cb_firstColor(p){ for(var i=0;i<p.colors.length;i++) if(totalStock(p.id, p.colors[i])>0) return p.colors[i]; return p.colors[0]; }
function cb_colorNames(u){ return u.colors.map(function(col){ return COL(col).name; }).join(' + '); }
function cb_valid(c){ return c && c.items && c.items.length && c.items.every(function(pid){ return !!P(pid); }); }
function cb_freeDel(c){
  if(SET('delivery','freeCampaign')) return {free:true, why:'Free delivery is running on every order right now.'};
  if(c.items.some(function(pid){ var p = P(pid); return p && p.freeDelivery; })) return {free:true, why:'This set ships free, anywhere in Bangladesh.'};
  if(cb_price(c) >= (Number(SET('delivery','freeOver'))||0)) return {free:true, why:'The set is over '+fmt(SET('delivery','freeOver'))+', so delivery is on us.'};
  return {free:false};
}
/* R16 (6): what the logged-in shopper's own offer does to this set */
function cb_offerNote(c){
  var acc = currentAccount(); if(!acc || !acc.offers) return '';
  var vip = acc.offers.filter(function(o){ return o.pct; })[0]; if(!vip) return '';
  var reg = cb_regular(c), vs = Math.round(reg*vip.pct/100), name = String(vip.title||'Your offer').split(' · ')[0]+' '+vip.pct+'% off';
  if(vs > cb_save(c)) return name+' saves you '+fmt(vs)+' on these items — more than the set price. Your bag uses the better one; the two are not combined.';
  return 'The set price is your best deal here. '+name+' is not added on top — set prices are not combined with other offers.';
}

/* scroll an element of this page into view (centre), after the re-render */
function cb_scrollTo(id, block){ setTimeout(function(){ var el = document.getElementById(id); if(el && el.scrollIntoView) el.scrollIntoView({block:block||'center', behavior:'smooth'}); }, 30); }
/* R16 (14): Add tapped too early → straight to the first thing missing,
   with the message right there instead of a toast */
function cb_focusErr(i){
  setTimeout(function(){
    var box = document.getElementById('cb-item-'+i) || document.querySelector('[data-slots~="'+i+'"]');
    if(!box) return;
    var tgt = box.querySelector('.zc-err') || box.querySelector('.cb-pills,.zc-sizes') || box;
    if(tgt.scrollIntoView) tgt.scrollIntoView({block:'center', behavior:'smooth'});
    box.classList.remove('zc-flash'); void box.offsetWidth; box.classList.add('zc-flash');
  }, 40);
}

/* popular colour pairs — only when every item is the same product */
function cb_pairs(c){
  if(!cb_allSame(c)) return [];
  var p = P(c.items[0]), n = c.items.length, out = [], seen = {};
  function ok(col){ return p.colors.indexOf(col)>=0 && totalStock(p.id, col)>0; }
  function push(arr){
    arr = arr.slice(0, n);
    p.colors.forEach(function(col){ if(arr.length<n && arr.indexOf(col)<0 && ok(col)) arr.push(col); });
    if(arr.length===n){ var k = arr.join('+'); if(!seen[k]){ seen[k] = 1; out.push(arr); } }
  }
  CB_POPULAR.forEach(function(pr){ if(pr.every(ok)) push(pr.slice()); });
  for(var a=0; a<p.colors.length && out.length<6; a++) for(var b=0; b<p.colors.length && out.length<6; b++){ if(a!==b && ok(p.colors[a]) && ok(p.colors[b])) push([p.colors[a], p.colors[b]]); }
  return out.slice(0, 6);
}
/* 26a. three to a row: 1, 2, 3 or 6 */
function cb_pairsRow(c){ var out = cb_pairs(c); if(out.length > 3 && out.length < 6) out = out.slice(0, 3); return out; }
/* ready-made looks for any set (L4): popular pairs, or one in-stock colour of each item, rotated */
function cb_looks(c, max){
  max = max||4;
  if(cb_allSame(c)) return cb_pairs(c).slice(0, max);
  var prods = c.items.map(P), out = [], seen = {};
  for(var k=0; k<8 && out.length<max; k++){
    var look = prods.map(function(p){ var cs = p.colors.filter(function(col){ return totalStock(p.id, col)>0; }); return cs.length ? cs[k % cs.length] : p.colors[0]; });
    var key = look.join('+'); if(!seen[key]){ seen[key] = 1; out.push(look); }
  }
  return out;
}
/* does a colour combination fit the sizes already picked? (17) */
function cb_pairFits(c, u, cols){
  for(var i=0;i<c.items.length;i++){ var s = cb_sizeOf(c, u, i); if(s && cols[i] && stockOf(c.items[i], cols[i], s)<=0) return {ok:false, size:s}; }
  return {ok:true};
}

/* short step names: Shirt, Chino, Polo … (numbered when repeated) */
/* R16: whole garment words only, and the LAST one in the name wins (the
   head noun: "Tracksuit Zip Top" → Top, "Crew-Neck Knit Sweater" → Sweater);
   "Sweatshirt" is never read as "Shirt". */
var CB_SHORT = [['sweatshirt','Sweatshirt'],['t-shirt','T-shirt'],['tracksuit','Tracksuit'],['trousers','Trousers'],['trouser','Trousers'],['panjabi','Panjabi'],['sweater','Sweater'],['jogger','Jogger'],['jacket','Jacket'],['puffer','Jacket'],['hoodie','Hoodie'],['shorts','Shorts'],['chino','Chino'],['shirt','Shirt'],['polo','Polo'],['tee','T-shirt'],['sock','Socks'],['belt','Belt'],['cap','Cap'],['top','Top']];
function cb_short(p){
  var n = p.name.toLowerCase(), best = null;
  CB_SHORT.forEach(function(w){
    var re = new RegExp('(^|[^a-z])('+w[0].replace('-','\\-')+')s?(?=[^a-z]|$)', 'g'), m;
    while((m = re.exec(n))){ var at = m.index + m[1].length + w[0].length; if(!best || at > best.at || (at===best.at && w[0].length > best.len)) best = {at:at, len:w[0].length, label:w[1]}; }
  });
  if(best) return best.label;
  var cat = CAT(p.cat); return cat ? cat.name.replace(/s$/,'') : 'Item';
}
function cb_stepLabels(c){
  var base = c.items.map(function(pid){ return cb_short(P(pid)); }), count = {}, seen = {};
  base.forEach(function(b){ count[b] = (count[b]||0) + 1; });
  return base.map(function(b){ if(count[b]>1){ seen[b] = (seen[b]||0) + 1; return b+' '+seen[b]; } return b; });
}
/* items that share one size list (shirt + polo: S–XXL; chino: waist) */
function cb_sizeGroups(c, byProduct){
  var groups = [], idx = {};
  c.items.forEach(function(pid, i){
    var p = P(pid), key = byProduct ? pid : p.sizes.join(',');
    if(idx[key]==null){ idx[key] = groups.length; groups.push({key:key, items:[], sizes:p.sizes, names:[]}); }
    var g = groups[idx[key]]; g.items.push(i); if(g.names.indexOf(cb_short(p))<0) g.names.push(cb_short(p));
  });
  groups.forEach(function(g){
    var waist = /^\d+$/.test(g.sizes[0]||'');
    g.label = (waist ? 'Waist' : 'Size')+' for '+(g.items.length>1 && g.names.length===1 ? 'both '+g.names[0].toLowerCase()+'s' : g.names.join(' + ').toLowerCase());
    if(g.items.length>2 && g.names.length===1) g.label = (waist ? 'Waist' : 'Size')+' for all '+g.items.length;
  });
  return groups;
}

/* ---------- page UI state ---------- */
function cb_defaults(c, query){
  var prods = c.items.map(P);
  var colors = prods.map(function(p){ return cb_firstColor(p); });
  if(cb_allSame(c)){ var pr = cb_pairs(c); if(pr.length) colors = pr[0].slice(); }
  if(query && query.colors){ String(query.colors).split(',').forEach(function(col, i){ if(prods[i] && prods[i].colors.indexOf(col)>=0) colors[i] = col; }); }
  var qs = query && query.sizes ? String(query.sizes).split(',') : null;
  var sizes = prods.map(function(p, i){
    if(qs && qs[i] && p.sizes.indexOf(qs[i])>=0) return qs[i];
    var ms = mySizeFor(p); return ms && stockOf(p.id, colors[i], ms)>0 ? ms : null;
  });
  var same = prods.map(function(p, i){ var j = cb_linkSrc(c, i); return j>=0 && (!qs || sizes[i]===sizes[j]); });
  return {colors:colors, sizes:sizes, same:same, step:0, done:prods.map(function(){ return false; }), gal:0, view:'set', cm:false, err:null, note:{}, own:false, gsame:{}, gq:{}, fStep:'ask', fH:0, fW:0};
}
function cb_state(c, query){
  query = query||{};
  var key = 'combo:'+c.id, u = UI[key];
  /* R16 (12): a link from the bag carries that set's own colours and sizes;
     ?from=<bag line> opens it in "change" mode */
  var sig = query.from ? 'from:'+query.from : ((query.colors||query.sizes) ? 'q:'+(query.colors||'')+'|'+(query.sizes||'') : '');
  if(!u || !u.colors || u.colors.length!==c.items.length || (sig && u.sig!==sig)){
    delete UI[key]; u = ui(key, cb_defaults(c, query)); u.sig = sig;
    u.edit = (query.from && ST.bag.some(function(l){ return l.id===query.from; })) ? query.from : null;
  }
  if(!query.from && u.edit) u.edit = null;
  if(u.edit && !ST.bag.some(function(l){ return l.id===u.edit; })) u.edit = null;
  if(u.step > c.items.length) u.step = c.items.length;
  if(u.gal >= c.items.length) u.gal = 0;
  cb_autofill(c, u);
  return u;
}
/* R16 (18): a size saved by Find my size (here or on a product page) fills
   every item that has no size yet, where that size is in stock */
function cb_autofill(c, u){
  c.items.forEach(function(pid, i){
    if(cb_sizeOf(c, u, i)) return;
    var p = P(pid), ms = mySizeFor(p);
    if(ms && p.sizes.indexOf(ms)>=0 && stockOf(pid, u.colors[i], ms)>0){ u.sizes[i] = ms; if(cb_linkSrc(c, i)>=0) u.same[i] = false; }
  });
}
/* drop a chosen size that is not in stock in the newly chosen colour (with a gentle note).
   R16 (16): items that follow it ("Same size as item 1") KEEP the size when
   their own colour has it — they used to lose it silently. */
function cb_fixSizes(c, u){
  c.items.forEach(function(pid, i){
    var linked = cb_linkSrc(c, i)>=0 && u.same[i], s = linked ? null : u.sizes[i];
    if(!s || stockOf(pid, u.colors[i], s)>0) return;
    var kept = [];
    c.items.forEach(function(pj, j){
      if(j>i && cb_linkSrc(c, j)===i && u.same[j]){
        u.same[j] = false;
        if(stockOf(pj, u.colors[j], s)>0){ u.sizes[j] = s; kept.push(j+1); }
        else { u.sizes[j] = null; u.note[j] = 'Size '+s+' is sold out in '+COL(u.colors[j]).name+' too. Please pick another size.'; }
      }
    });
    u.note[i] = 'Size '+s+' is sold out in '+COL(u.colors[i]).name+'. Please pick another size'+(kept.length ? ' — item '+kept.join(' and ')+' keeps size '+s+'.' : '.');
    u.sizes[i] = null;
  });
}

/* ---------- validation ---------- */
/* R16 (3)(20): counts what this set asks for PLUS what the bag already holds */
function cb_need(c, u, i){
  var p = P(c.items[i]), col = u.colors[i], size = cb_sizeOf(c, u, i), cnt = 0;
  if(!size) return null;
  for(var j=0;j<=i;j++){ if(c.items[j]===c.items[i] && u.colors[j]===col && cb_sizeOf(c, u, j)===size) cnt++; }
  var use = bagStockUse(u.edit), inBag = use[bagSku(p.id, col, size)]||0, st = stockOf(p.id, col, size);
  return {stock:st, cnt:cnt, inBag:inBag, over: cnt + inBag > st};
}
function cb_clashMsg(c, u, i, n){
  var p = P(c.items[i]), col = u.colors[i], size = cb_sizeOf(c, u, i), lbl = 'item '+(i+1);
  if(n.inBag) return 'Only '+n.stock+' left in '+COL(col).name+' · '+size+' and '+n.inBag+(n.inBag===1 ? ' is' : ' are')+' already in your bag. Choose another colour or size for '+lbl+'.';
  return 'Only '+n.stock+' left in '+COL(col).name+' · '+size+' — the set would need '+n.cnt+'. Choose another colour or size for '+lbl+'.';
}
function cb_checkItem(c, u, i){
  var p = P(c.items[i]), col = u.colors[i], size = cb_sizeOf(c, u, i), lbl = 'item '+(i+1)+' ('+p.name+')';
  if(!col) return {ok:false, i:i, msg:'Pick a colour for '+lbl+'.'};
  if(!size) return {ok:false, i:i, msg:'Pick a size for '+lbl+'.'};
  var st = stockOf(p.id, col, size);
  if(st<=0) return {ok:false, i:i, msg:'Size '+size+' is sold out in '+COL(col).name+'. Pick another size or colour for '+lbl+'.'};
  var n = cb_need(c, u, i);
  if(n && n.over) return {ok:false, i:i, msg:cb_clashMsg(c, u, i, n)};
  return {ok:true, i:i};
}
function cb_checkAll(c, u){ for(var i=0;i<c.items.length;i++){ var r = cb_checkItem(c, u, i); if(!r.ok) return r; } return {ok:true}; }
function cb_firstUndone(u, n){ for(var i=0;i<n;i++) if(!u.done[i]) return i; return n; }
function cb_nextAfter(u, i, n){ for(var j=i+1;j<n;j++) if(!u.done[j]) return j; for(var k=0;k<i;k++) if(!u.done[k]) return k; return n; }

/* toast with an optional link, placed above the phone action bar */
function cb_toast(msg, href, label){
  var t0 = document.querySelector('.toast'); if(t0) t0.remove();
  var d = document.createElement('div'); d.className = 'toast cb-toast'; d.setAttribute('role','status');
  d.innerHTML = '<span>'+esc(msg)+'</span>'+(href ? '<a href="'+esc(href)+'">'+esc(label||'View')+'</a>' : '');
  document.body.appendChild(d); toastArm(d, href ? 4500 : 3000);   /* T7: holds under the mouse / keyboard */
}

/* The core waButton still draws the line-art speech bubble that the owner
   could not recognise. Every WhatsApp control on the set / bag pages uses the
   real mark instead. Shared with 50-bag.js (this file loads first). */
function cb_waBtn(label, text, cls){
  return '<a class="wa-btn cb-wabtn '+(cls||'')+'" href="'+waLink(text)+'" target="_blank" rel="noopener">'+waGlyph(19)+'<span>'+esc(label)+'</span></a>';
}
/* R16 (22c): the WhatsApp question names the sizes too */
function cb_waText(c, u){
  return 'Hi EXTAS, I have a question about the '+bagSetName(c.name)+': '+c.items.map(function(pid, i){ var s = cb_sizeOf(c, u, i); return COL(u.colors[i]).name+' '+cb_short(P(pid)).toLowerCase()+(s ? ' (size '+s+')' : ' (size not picked yet)'); }).join(' + ')+'.';
}

/* ---------- pieces ---------- */
/* R16 (22a): "Sets" went to Build your own set. It now jumps to the list of
   sets at the foot of this page ("More sets"). */
/* D-040 (desktop): the section is called "Combos" everywhere on desktop (the
   nav item, the hub, the crumbs); the phone keeps "Sets" */
function cb_crumbs(c){
  return '<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">/</span>'+(c ? '<button type="button" class="link zc-crumb hide-d" data-act="cb-more">Sets</button><a class="hide-m" href="#/combos">Combos</a>' : '<a class="hide-d" href="#/set">Sets</a><a class="hide-m" href="#/combos">Combos</a>')+'<span aria-hidden="true">/</span><span>'+esc(c ? c.name : 'Set')+'</span></nav>';
}

function cb_gallery(c, u){
  var items = c.items.map(function(pid, i){ return {product:pid, color:u.colors[i]}; });
  var gi = Math.min(u.gal||0, c.items.length-1), gp = P(c.items[gi]), gcol = u.colors[gi];
  var reg = cb_regular(c), save = cb_save(c), pct = save>0 ? Math.round(save/reg*100) : 0;
  /* [view, caption, short caption] — the short one is what a 50px thumbnail
     shows when the full caption cannot fit even at the floor size (AUTO-FIT) */
  var VIEWS = [['set','Set'],['front','Front'],['back','Back'],['detail','Detail'],['flat','True colour','Colour']];
  var stage;
  if(u.view==='set') stage = setImg(items, {ratio:'ratio-45', inner: pct ? '<span class="badge-img sale">Save '+pct+'%</span>' : ''});
  else {
    var vl = VIEWS.filter(function(v){ return v[0]===u.view; })[0];
    stage = productImg(gp, gcol, {view:u.view, ratio:'ratio-45', inner:'<span class="badge-img">Item '+(gi+1)+' · '+esc(COL(gcol).name)+' · '+esc(vl ? vl[1] : '')+'</span><button type="button" class="cb-stagebtn" data-act="cb-view" data-id="'+c.id+'" data-v="set">'+ico('layers',15)+'See the set</button>'});
  }
  var tabs = '<span class="cb-tabs-lbl hide-m">See each item</span>'+c.items.map(function(pid, i){
    var col = COL(u.colors[i]), on = i===gi && u.view!=='set';
    return '<button type="button" class="chip'+(on?' on':'')+'" role="tab" aria-selected="'+on+'" data-act="cb-gal" data-id="'+c.id+'" data-i="'+i+'"><span class="cb-dot" style="background:'+col.hex+'"></span>Item '+(i+1)+' · '+esc(col.name)+'</button>';
  }).join('');
  var rail = VIEWS.map(function(v){
    var img = v[0]==='set' ? setImg(items, {ratio:'ratio-11'}) : productImg(gp, gcol, {view:v[0], ratio:'ratio-11', label:false});
    var on = u.view===v[0];
    return '<button type="button" class="cb-thumb'+(on?' on':'')+'" data-act="cb-view" data-id="'+c.id+'" data-v="'+v[0]+'" aria-pressed="'+on+'" aria-label="'+(v[0]==='set' ? 'Show the whole set' : 'Show item '+(gi+1)+' '+v[1])+'">'+img+'<span class="cb-cap"><span class="cb-cap-l">'+esc(v[1])+'</span>'+(v[2] ? '<span class="cb-cap-s" aria-hidden="true">'+esc(v[2])+'</span>' : '')+'</span></button>';
  }).join('');
  return '<div class="cb-gal" id="cb-gallery"><div class="cb-stage">'+stage+'</div><div class="cb-tabs" role="tablist" aria-label="Items in this set">'+tabs+'</div><div class="cb-rail">'+rail+'</div></div>';
}

function cb_titleBlock(c, u){
  var dots = u.colors.map(function(col){ return '<span class="cb-dot" style="background:'+COL(col).hex+'"></span>'; }).join('');
  return '<div>'+
    '<div class="eyebrow">Set of '+c.items.length+'</div>'+
    '<h1 class="h1" style="margin-top:6px">'+esc(c.name)+'</h1>'+
    '<div class="row mt8" style="gap:10px"><span class="cb-dots" aria-hidden="true">'+dots+'</span><span class="text2 bold" data-testid="cb-colors">'+esc(cb_colorNames(u))+'</span></div>'+
    (c.blurb ? '<p class="small muted" style="margin:8px 0 0">'+esc(c.blurb)+'</p>' : '')+
  '</div>';
}

function cb_priceBox(c){
  var reg = cb_regular(c), price = cb_price(c), save = reg - price, pct = reg ? Math.round(save/reg*100) : 0, note = cb_offerNote(c);
  var lines = c.items.map(function(pid, i){ var p = P(pid); return '<div class="row between small"><span class="text2">Item '+(i+1)+' · '+esc(p.name)+'</span><span class="'+(save>0 ? 'strike' : '')+'">'+fmt(p.price)+'</span></div>'; }).join('');
  return '<div class="card cb-pricebox" data-testid="cb-pricebox">'+
    '<div class="row between top cb-pbrow" style="align-items:flex-start;gap:12px">'+
      '<div><div class="eyebrow">'+(save>0 ? 'Set price' : 'Price for the set')+'</div><div class="price cb-big" data-testid="cb-price">'+fmt(price)+'</div>'+
      (save>0 ? '<div class="small mt8"><span class="muted">Separately</span> <span class="strike">'+fmt(reg)+'</span></div>' : '')+'</div>'+
      (save>0 ? '<span class="tag sale" style="font-size:12.5px;padding:6px 10px;white-space:nowrap">You save '+fmt(save)+' ('+pct+'%)</span>' : '')+
    '</div>'+
    '<div class="cb-reg zc-reglist"><div class="xs muted bold">Regular price of each item</div>'+lines+'</div>'+
    (c.autoApply && save>0 ? '<div class="xs muted mt12 row zc-auto" style="gap:6px">'+ico('check',14)+'Set price also applies automatically when these items are in your bag.</div>' : '')+
    (note ? '<div class="zc-offer mt12" data-testid="cb-offer-note">'+ico('tag',14)+'<span>'+esc(note)+'</span></div>' : '')+
  '</div>';
}

function cb_pairsBlock(c, u){
  var pairs = cb_pairsRow(c); if(!pairs.length) return '';
  var cur = u.colors.join('+'), anyOut = '';
  var chips = pairs.map(function(pr){
    var on = pr.join('+')===cur, nm = pr.map(function(col){ return COL(col).name; }).join(' + '), fit = cb_pairFits(c, u, pr);
    if(!fit.ok) anyOut = fit.size;
    return '<button type="button" class="chip'+(on?' on':'')+(fit.ok?'':' zc-out')+'" aria-pressed="'+on+'" title="'+esc(fit.ok ? nm : nm+' — not in size '+fit.size)+'" data-act="cb-pair" data-id="'+c.id+'" data-colors="'+pr.join(',')+'"'+(fit.ok?'':' disabled aria-disabled="true"')+'><span class="cb-dots" aria-hidden="true">'+pr.map(function(col){ return '<span class="cb-dot" style="background:'+COL(col).hex+'"></span>'; }).join('')+'</span><span class="cb-pairname">'+esc(nm)+'</span></button>';
  }).join('');
  return '<div class="zo-pairs"><div class="row between"><div class="label" style="margin:0">Popular pairs</div><span class="xs muted">Tap to set both colours</span></div>'+
    /* R15 wave 2 (L05): three-colour sets get wide chips (one per row on a
       phone) so "Black + Grey Melange + White" is never cut mid-word */
    '<div class="cb-pairs mt8'+(pairs[0] && pairs[0].length>=3 ? ' cb-pairs3' : '')+'">'+chips+'</div>'+
    (anyOut ? '<div class="xs muted mt8" data-testid="cb-pairs-note">Greyed pairs are not in size '+esc(anyOut)+'. Pick another size to see them.</div>' : '')+'</div>';
}

function cb_unitSeg(c, u){
  return '<div class="seg" role="group" aria-label="Measurement units"><button type="button" class="'+(u.cm?'':'on')+'" data-act="cb-unit" data-id="'+c.id+'" data-v="in" aria-pressed="'+!u.cm+'">in</button><button type="button" class="'+(u.cm?'on':'')+'" data-act="cb-unit" data-id="'+c.id+'" data-v="cm" aria-pressed="'+!!u.cm+'">cm</button></div>';
}

function cb_measure(p, size, cm){
  var ch = chartFor(p); if(!ch) return '';
  if(!size || !ch.rows[size]) return '<div class="cb-measure">'+ico('ruler',16)+'<span>Pick a size to see its measurements.</span></div>';
  var r = ch.rows[size];
  return '<div class="cb-measure">'+ico('ruler',16)+'<span><b>Size '+esc(size)+'</b> · '+ch.fields.map(function(f, ix){ return esc(f)+' '+fmtMeasure(r[ix], cm); }).join(' · ')+'</span></div>';
}

/* Picture or name of an item: shows it in the big photo ON THIS PAGE.
   (Owner: a picture tap must never leave the set page — it lost the sale.) */
function cb_lookBtn(c, i, inner, cls, label){
  return '<button type="button" class="zc-look '+(cls||'')+'" data-act="cb-look" data-id="'+c.id+'" data-i="'+i+'" aria-label="'+esc(label||'See item '+(i+1)+' in the big photo')+'">'+inner+'</button>';
}
function cb_itemHead(c, u, i, label){
  var p = P(c.items[i]);
  return '<div class="row" style="gap:12px">'+cb_lookBtn(c, i, '<div class="cb-mini">'+productImg(p, u.colors[i], {ratio:'ratio-11', label:false})+'</div>', 'zc-lookimg')+
    '<div class="grow"><div class="eyebrow">'+esc(label)+'</div>'+cb_lookBtn(c, i, esc(p.name), 'h3 zc-lookname', p.name+' — see it in the big photo')+
    '<div class="xs muted">'+esc(p.fit)+' · <span class="'+(cb_save(c)>0 ? 'strike' : '')+'">'+fmt(p.price)+'</span> on its own</div></div></div>';
}
/* every message an item can carry, in one place, shared by all layouts */
function cb_itemMsgs(c, u, i){
  var p = P(c.items[i]), col = u.colors[i], size = cb_sizeOf(c, u, i), linked = cb_linkSrc(c, i)>=0 && u.same[i], h = '';
  if(size){
    var st = stockOf(p.id, col, size), n = cb_need(c, u, i);
    if(st<=0) h += '<div class="warnbox cb-warn">Size '+esc(size)+' is sold out in '+esc(COL(col).name)+'. '+(linked ? 'Tap another size for this item, or pick another colour.' : 'Please pick another size.')+'</div>';
    else if(n && n.over && !(u.err && u.err.i===i)) h += '<div class="warnbox cb-warn" data-testid="cb-clash">'+esc(cb_clashMsg(c, u, i, n))+'</div>';
    else if(st<=2) h += '<div class="xs mt8" style="color:var(--warn);font-weight:600">Only '+st+' left in '+esc(COL(col).name)+' · '+esc(size)+'</div>';
  } else if(u.note && u.note[i]) h += '<div class="warnbox cb-warn">'+esc(u.note[i])+'</div>';
  if(u.err && u.err.i===i) h += '<div class="cb-errtxt zc-err" role="alert">'+esc(u.err.msg)+'</div>';
  return h;
}
function cb_swatches(c, u, i, cls){
  var p = P(c.items[i]), col = u.colors[i];
  return '<div class="row wrap '+(cls||'mt8')+'" style="gap:10px">'+p.colors.map(function(cc){
    var out = totalStock(p.id, cc)<=0, on = cc===col;
    return '<button type="button" class="swatch'+(on?' on':'')+'" style="background:'+COL(cc).hex+(out?';opacity:.35':'')+'" data-act="cb-color" data-id="'+c.id+'" data-i="'+i+'" data-c="'+cc+'" aria-label="'+esc(COL(cc).name)+(out?' (sold out)':'')+'" aria-pressed="'+on+'" title="'+esc(COL(cc).name)+'"'+(out?' disabled':'')+'></button>';
  }).join('')+'</div>';
}
function cb_sizePills(c, u, i, cls){
  var p = P(c.items[i]), col = u.colors[i], size = cb_sizeOf(c, u, i);
  return '<div class="cb-pills '+(cls||'mt8')+'" role="group" aria-label="Size for item '+(i+1)+'" style="--n:'+p.sizes.length+'">'+p.sizes.map(function(s){
    var st = stockOf(p.id, col, s), out = st<=0, on = size===s;
    return '<button type="button" class="size-pill'+(on?' on':'')+(out?' out':'')+'" data-act="cb-size" data-id="'+c.id+'" data-i="'+i+'" data-s="'+esc(s)+'" aria-pressed="'+on+'"'+(out?' disabled title="Sold out in '+esc(COL(col).name)+'"':'')+'>'+esc(s)+'</button>';
  }).join('')+'</div>';
}
function cb_pickerBody(c, u, i){
  var p = P(c.items[i]), col = u.colors[i], size = cb_sizeOf(c, u, i), ms = mySizeFor(p), src = cb_linkSrc(c, i);
  var h = '<div class="mt16"><div class="small"><span class="bold">Colour:</span> '+esc(COL(col).name)+'</div>'+cb_swatches(c, u, i);
  if(DB.colorNotes[col]) h += '<div class="xs muted mt8">'+esc(DB.colorNotes[col])+'</div>';
  h += '</div>';
  h += '<div class="mt16"><div class="row between"><div class="small"><span class="bold">Size:</span> '+(size ? esc(size) : '<span class="muted">choose one</span>')+'</div>'+(ms ? '<span class="xs muted">Your saved size: <b>'+esc(ms)+'</b></span>' : '')+'</div>';
  if(src>=0) h += '<label class="check mt8"><input type="checkbox" data-change="cb-same" data-id="'+c.id+'" data-i="'+i+'"'+(u.same[i]?' checked':'')+'> Same size as item '+(src+1)+'</label>';
  h += cb_sizePills(c, u, i);
  h += cb_measure(p, size, u.cm);
  h += cb_itemMsgs(c, u, i);
  return h+'</div>';
}

/* C1 — one stacked picker card per item */
function cb_c1(c, u){
  return '<div class="stack" style="gap:12px">'+c.items.map(function(pid, i){
    return '<div class="card cb-item'+(u.err && u.err.i===i ? ' err' : '')+'" id="cb-item-'+i+'">'+cb_itemHead(c, u, i, 'Item '+(i+1)+' of '+c.items.length)+cb_pickerBody(c, u, i)+'</div>';
  }).join('')+'</div>';
}

/* C2 — step by step (kept as the owner's switch in Admin; off by default) */
function cb_c2(c, u){
  var n = c.items.length, labels = cb_stepLabels(c), first = cb_firstUndone(u, n);
  var head = '<ol class="cb-steps" aria-label="Steps">'+c.items.map(function(pid, i){
    var now = u.step===i, done = u.done[i] && !now, reach = u.done[i] || i===first || now;
    return '<li class="'+(i>0 && u.done[i-1] ? 'ldone' : '')+'"><button type="button" class="cb-stepbtn" data-act="cb-step" data-id="'+c.id+'" data-i="'+i+'"'+(reach?'':' disabled')+(now?' aria-current="step"':'')+'>'+
      '<span class="cb-num'+(done?' done':(now?' now':''))+'">'+(done ? ico('check',16) : (i+1))+'</span>'+
      '<span class="cb-slabel"><span class="xs muted">Step '+(i+1)+'</span><span class="bold">'+esc(labels[i])+'</span></span></button></li>';
  }).join('')+'</ol>';
  var rows = c.items.map(function(pid, i){
    var p = P(pid), col = u.colors[i], size = cb_sizeOf(c, u, i);
    if(i===u.step){
      var tmp = u.done.slice(); tmp[i] = true; var nx = cb_nextAfter({done:tmp}, i, n);
      var nextLbl = nx<n ? 'Next: '+labels[nx] : 'Review your set';
      return '<div class="card cb-panel'+(u.err && u.err.i===i ? ' err' : '')+'" id="cb-item-'+i+'">'+cb_itemHead(c, u, i, 'Step '+(i+1)+' of '+n+' · '+labels[i])+cb_pickerBody(c, u, i)+
        '<button type="button" class="btn btn-primary btn-block mt16" data-act="cb-next" data-id="'+c.id+'" data-i="'+i+'">'+esc(nextLbl)+ico('right',16)+'</button></div>';
    }
    if(u.done[i]){
      var ok = cb_checkItem(c, u, i).ok;
      return '<div class="card cb-row" id="cb-item-'+i+'"><span class="cb-num sm '+(ok?'done':'')+'">'+(ok ? ico('check',14) : (i+1))+'</span>'+
        '<div class="grow small"><span class="bold">'+esc(p.name)+'</span> — '+esc(COL(col).name)+', '+(size ? esc(size) : '')+(ok ? '' : ' <span class="sale bold">· needs a new size</span>')+'</div>'+
        '<button type="button" class="link" data-act="cb-step" data-id="'+c.id+'" data-i="'+i+'" aria-label="Edit step '+(i+1)+'">Edit</button></div>';
    }
    return '<div class="cb-row todo" id="cb-item-'+i+'"><span class="cb-num sm">'+(i+1)+'</span><div class="grow small">'+esc(p.name)+'</div><span class="xs">'+esc(labels[i])+'</span></div>';
  }).join('');
  return '<div class="stack" style="gap:14px">'+head+'<div class="stack" style="gap:10px">'+rows+'</div></div>';
}

function cb_summary(c, u, tpl){
  var n = c.items.length, reg = cb_regular(c), price = cb_price(c), complete = cb_checkAll(c, u).ok;
  var review = tpl==='C2' && u.step>=n;
  var title = tpl==='C2' ? (review && complete ? 'Your set is ready' : 'Your set') : 'Set summary';
  var lines = c.items.map(function(pid, i){
    var p = P(pid), col = u.colors[i], size = cb_sizeOf(c, u, i), ok = size && stockOf(p.id, col, size)>0;
    return '<div class="cb-sum-line">'+cb_lookBtn(c, i, '<div class="cb-sum-img">'+productImg(p, col, {ratio:'ratio-11', label:false})+'</div>', 'zc-lookimg')+
      '<div class="grow"><div class="small bold">'+esc(p.name)+'</div><div class="xs '+(ok?'muted':'sale bold')+'">'+esc(COL(col).name)+' · '+(size ? 'Size '+esc(size)+(ok?'':' (sold out)') : 'Size not picked yet')+'</div></div>'+
      '<span class="'+(price<reg ? 'strike ' : '')+'small">'+fmt(p.price)+'</span></div>';
  }).join('');
  return '<div class="card p16 zo-sum '+(review?'cb-review':'')+'" id="cb-summary">'+
    '<div class="row between"><div class="h3" style="font-size:16px">'+esc(title)+'</div><span class="xs muted">'+plural(n,'item')+'</span></div>'+lines+
    (price<reg ? '<div class="row between mt12 small"><span class="muted">Separately</span><span class="strike">'+fmt(reg)+'</span></div>' : '')+
    '<div class="row between mt8"><span class="bold">'+(price<reg ? 'Set price' : 'Total')+'</span><span class="price" style="font-size:21px">'+fmt(price)+'</span></div>'+
    (price<reg ? '<div class="row between mt8 small brandc bold"><span>You save</span><span>'+fmt(reg-price)+'</span></div>' : '')+
    (tpl==='C2' && !complete ? '<div class="xs muted mt12">Finish every step, then add the set to your bag.</div>' : '')+
  '</div>';
}

/* R16 (19): one language per screen. The set page is written in English, so
   both buttons are English (only "Order Now" used to switch to Bengali). */
function cb_ctas(c, u){
  /* The set page used green + black while the product page used the owner's
     chosen pair. Two schemes on two pages is the kind of thing he spots at a
     glance, so this follows PDP_CTA_STYLE — change the colour once and both
     pages move together. */
  var sty = (typeof PDP_CTA_STYLE === 'string') ? PDP_CTA_STYLE : '';
  if(u && u.edit) return '<div class="cb-ctas '+sty+'"><button type="button" class="btn btn-addbag" data-act="cb-add" data-id="'+c.id+'" data-testid="cb-update">'+ico('check',18)+'Update set in bag</button><a class="btn btn-ghost" href="#/bag">Back to bag</a></div>';
  return '<div class="cb-ctas '+sty+'"><button type="button" class="btn btn-addbag" data-act="cb-add" data-id="'+c.id+'">'+ico('bag',18)+'Add set to Bag</button><button type="button" class="btn btn-primary" data-act="cb-order" data-id="'+c.id+'">Order Now</button></div>';
}
function cb_editBanner(c, u){
  if(!u.edit) return '';
  return '<div class="zc-edit" data-testid="cb-edit-banner">'+ico('swap',16)+'<span><b>Changing the '+esc(c.name)+' in your bag.</b> Pick new colours or sizes, then tap <b>Update set in bag</b>.</span></div>';
}

/* R16 (18): the size finder opens HERE and fills every item's size */
function cb_finder(c){
  var many = c.items.some(function(pid){ return P(pid).cat!==P(c.items[0]).cat; });
  return '<button type="button" class="cb-finder zo-finder" data-act="cb-f-open" data-id="'+c.id+'" data-testid="cb-finder"><span class="ic">'+ico('ruler',18)+'</span><span class="grow small" style="text-align:left"><b>Not sure of your size?</b> Find it in '+CB_FINDER_SECS+' seconds'+(many ? ' — for every item' : '')+'</span>'+ico('right',16)+'</button>';
}
function cb_ftin(h){ return Math.floor(h/12)+'′ '+(h%12)+'″'; }
function cb_finderHTML(){
  var c = COMBO(CUR.params && CUR.params[0]); if(!c) return ''; var u = cb_state(c, CUR.query);
  if(!u.fH){ var m = mySize(); u.fH = (m && m.heightIn) || 67; u.fW = (m && m.weightKg) || 66; }
  var step = function(k, d, lbl){ return '<button type="button" class="zc-fstep" data-act="cb-f-step" data-id="'+c.id+'" data-k="'+k+'" data-d="'+d+'" aria-label="'+lbl+'">'+ico(d>0 ? 'plus' : 'minus',16)+'</button>'; };
  var ask = '<div class="small text2">Two quick questions — we match you to the size chart of every item in the set.</div>'+
    '<div class="zc-frow mt16"><span class="small bold">Height</span><span class="zc-fval">'+step('h',-1,'Shorter')+'<b data-testid="cb-f-h">'+cb_ftin(u.fH)+'</b>'+step('h',1,'Taller')+'</span></div>'+
    '<div class="zc-frow mt12"><span class="small bold">Weight</span><span class="zc-fval">'+step('w',-1,'Lighter')+'<b data-testid="cb-f-w">'+u.fW+' kg</b>'+step('w',1,'Heavier')+'</span></div>';
  var recs = c.items.map(function(pid, i){
    var p = P(pid), ch = chartFor(p), r = ch ? recommendSize(ch, u.fH, u.fW) : null;
    return {i:i, p:p, size:r ? r.size : null, ok: r ? stockOf(pid, u.colors[i], r.size)>0 : false};
  });
  var list = '<div class="zc-frecs mt16">'+recs.map(function(r){
    return '<div class="zc-frec"><span class="small"><b>Item '+(r.i+1)+'</b> · '+esc(r.p.name)+' <span class="muted">('+esc(COL(u.colors[r.i]).name)+')</span></span>'+
      (r.size ? '<span class="small bold'+(r.ok?'':' sale')+'">'+esc(r.size)+(r.ok?'':' · sold out in this colour')+'</span>' : '<span class="xs muted">No size chart</span>')+'</div>';
  }).join('')+'</div>';
  return ask+list+
    '<button type="button" class="btn btn-primary btn-block mt16" data-act="cb-f-use" data-id="'+c.id+'" data-testid="cb-f-use">Use these sizes</button>'+
    '<div class="xs muted center mt12">Only height and weight. Saved on this phone for next time.</div>';
}

function cb_rules(c){
  /* R16 (9): when delivery is free for this set, no charge is shown here */
  var fd = cb_freeDel(c);
  var del = fd.free
    ? '<div class="h3" style="margin-bottom:3px">Delivery</div><div class="small text2" data-testid="cb-free-del"><b class="brandc">Free home delivery</b> — anywhere in Bangladesh. '+esc(fd.why)+'</div>'
    : ruleBlock('delivery', {key:'combo', title:'Delivery'});
  return '<div class="card p16 stack zo-rules" style="gap:14px" data-testid="cb-rules">'+
    '<div class="row top" style="gap:12px"><span class="brandc" style="margin-top:2px">'+ico('swap',20)+'</span><div class="grow">'+ruleBlock('exchange', {key:'combo', title:'Size exchange'})+'<div class="small bold mt8">Exchange one item or the whole set — the set price stays.</div></div></div>'+
    '<div class="divider"></div>'+
    '<div class="row top" style="gap:12px"><span class="brandc" style="margin-top:2px">'+ico('truck',20)+'</span><div class="grow">'+del+'</div></div>'+
    '<div class="divider"></div>'+
    '<div class="row" style="gap:12px"><span class="brandc">'+ico('cash',20)+'</span><div class="small"><b>Cash on Delivery</b> all over Bangladesh · bKash · Nagad · Card</div></div>'+
  '</div>';
}
/* one-line trust strip for the compact layouts */
function cb_trust(c){
  var fd = cb_freeDel(c);
  return '<div class="zc-trust">'+(fd.free ? '<span>'+ico('truck',14)+'Free delivery</span>' : '')+'<span>'+ico('cash',14)+'Cash on Delivery</span><span>'+ico('swap',14)+SET('exchange','windowHours')+'h size exchange</span></div>';
}

/* cards used in "More sets" (also used by the Build-your-own-set page) */
function cb_ruleNoun(r){
  if(r.mode==='category' && r.categories && r.categories.length===1){ var ct = CAT(r.categories[0]); if(ct) return ct.name==='T-Shirts' ? 'T-shirts' : ct.name.toLowerCase(); }
  return r.mode==='sku' ? 'styles' : 'items';
}
function cb_ruleHeadline(r){
  var ks = Object.keys(r.tiers||{}).map(Number).filter(function(k){ return k>0; }).sort(function(a, b){ return a-b; });
  return ks.map(function(k, ix){ return 'Any '+k+(ix===0 ? ' '+cb_ruleNoun(r) : '')+' '+fmt(r.tiers[k]); }).join(' · ');
}
function cb_comboCard(x){
  var reg = cb_regular(x), price = cb_price(x), save = reg - price, defs = cb_defaults(x, {}).colors;
  var items = x.items.map(function(pid, i){ return {product:pid, color:defs[i]}; });
  return '<a class="pcard cb-setcard" href="#/combo/'+x.id+'" data-testid="combo-card-'+x.id+'">'+setImg(items, {ratio:'ratio-11', inner: save>0 ? '<span class="badge-img sale">Save '+fmt(save)+'</span>' : ''})+
    '<div class="pinfo"><div class="eyebrow">Set of '+x.items.length+'</div><div class="pname" style="margin-top:4px">'+esc(x.name)+'</div>'+
    (x.blurb ? '<div class="xs muted" style="margin-bottom:6px;line-height:1.4">'+esc(x.blurb)+'</div>' : '')+
    '<div class="row" style="gap:7px;align-items:baseline">'+priceHTML(price, save>0 ? reg : 0)+'</div></div></a>';
}
function cb_buildCard(rules){
  return '<a class="cb-build" href="#/set" data-testid="build-set-card"><div><span class="cb-ico" style="width:46px;height:46px">'+ico('layers',22)+'</span>'+
    '<div class="eyebrow mt16">Mix & match</div><div class="h2" style="margin-top:4px">Build your own set</div>'+
    '<div class="stack mt12" style="gap:6px">'+rules.map(function(r){ return '<div class="small text2"><b>'+esc(r.name)+':</b> '+esc(cb_ruleHeadline(r))+'</div>'; }).join('')+'</div></div>'+
    '<span class="btn btn-secondary btn-sm mt16" style="align-self:flex-start">Start building'+ico('right',15)+'</span></a>';
}
function cb_moreSets(exceptId, title){
  var list = combos().filter(function(x){ return x.active && x.id!==exceptId && cb_valid(x); });
  var rules = setRules().filter(function(r){ return r.active; });
  if(!list.length && !rules.length) return '';
  var cards = list.map(cb_comboCard).join('') + (rules.length ? cb_buildCard(rules) : '');
  return '<section class="section" id="cb-more"><div class="sec-hd"><h2 class="h2">'+esc(title||'More sets')+'</h2>'+(rules.length ? '<a class="link" href="#/set">Build your own</a>' : '')+'</div><div class="grid g3">'+cards+'</div></section>';
}

function cb_unavailable(c){
  var prods = [];
  if(c && c.items) c.items.forEach(function(pid){ var p = P(pid); if(p && prods.indexOf(p)<0) prods.push(p); });
  return '<div class="container cb-wrap">'+cb_crumbs(null)+
    '<div class="card cb-off mt16" data-testid="combo-unavailable"><span class="cb-ico">'+ico('layers',26)+'</span>'+
      '<h1 class="h1 mt16">'+(c ? 'This set isn\'t available right now' : 'We couldn\'t find this set')+'</h1>'+
      '<p class="text2" style="max-width:520px;margin:10px auto 0">'+(c ? 'The '+esc(c.name)+' offer is taking a break. You can still buy these styles on their own, or pick another set below.' : 'The link may be old. Have a look at the sets we have right now.')+'</p>'+
      '<div class="row wrap mt24" style="justify-content:center;gap:10px"><a class="btn btn-primary" href="#/set">Build your own set</a><a class="btn btn-ghost" href="#/">Back to the shop</a></div>'+
    '</div>'+
    (prods.length ? '<section class="section"><div class="sec-hd"><h2 class="h2">Buy them separately</h2></div><div class="grid g4">'+prods.map(function(p){ return productCard(p); }).join('')+'</div></section>' : '')+
    cb_moreSets(c ? c.id : null, 'Sets you can get now')+
  '</div>';
}

/* =====================================================================
   ALTERNATIVE LAYOUTS (L1–L4) — same data, same state, same bag/money rules
   ===================================================================== */
/* compact price line used by L1–L4 */
function cb_priceLine(c){
  var reg = cb_regular(c), price = cb_price(c), save = reg - price, note = cb_offerNote(c);
  return '<div class="zc-pline" data-testid="cb-pricebox"><span class="price zc-pbig" data-testid="cb-price">'+fmt(price)+'</span>'+
    (save>0 ? '<span class="strike small">'+fmt(reg)+'</span><span class="tag sale zc-ptag">Save '+fmt(save)+'</span>' : '')+'</div>'+
    (note ? '<div class="zc-offer mt8" data-testid="cb-offer-note">'+ico('tag',14)+'<span>'+esc(note)+'</span></div>' : '');
}
function cb_titleMini(c){ return '<div><div class="eyebrow">Set of '+c.items.length+(c.blurb ? ' · <span style="text-transform:none;letter-spacing:0;font-weight:500">'+esc(c.blurb)+'</span>' : '')+'</div><h1 class="h1 zc-h1">'+esc(c.name)+'</h1></div>'; }

/* L1 · ONE SCREEN — one compact row per item: picture, colour dots, size chips */
function cb_L1(c, u){
  var labels = cb_stepLabels(c);
  var rows = c.items.map(function(pid, i){
    var p = P(pid), size = cb_sizeOf(c, u, i);
    return '<div class="zc-row'+(u.err && u.err.i===i ? ' err' : '')+'" id="cb-item-'+i+'">'+
      cb_lookBtn(c, i, productImg(p, u.colors[i], {ratio:'ratio-11', label:false}), 'zc-rthumb')+
      '<div class="zc-rbody"><div class="zc-rhead"><b>'+esc(labels[i])+'</b><span class="muted"> · '+esc(COL(u.colors[i]).name)+(size ? ' · '+esc(size) : '')+'</span></div>'+
      cb_swatches(c, u, i, 'zc-rsw')+cb_sizePills(c, u, i, 'zc-rsz')+cb_itemMsgs(c, u, i)+'</div></div>';
  }).join('');
  return '<div class="stack zc-L1info" style="gap:12px">'+cb_titleMini(c)+cb_priceLine(c)+cb_editBanner(c, u)+'<div class="zc-rows">'+rows+'</div>'+cb_trust(c)+'</div>';
}

/* L2 · FAST STEPS — one item at a time; picking a size moves on by itself */
function cb_L2(c, u){
  var n = c.items.length, labels = cb_stepLabels(c), cur = Math.min(u.step, n);
  var dots = '<ol class="zc-dots" aria-label="Progress">'+c.items.map(function(pid, i){
    var ok = cb_checkItem(c, u, i).ok, on = i===cur;
    return '<li><button type="button" class="zc-dot'+(on?' on':'')+(ok?' ok':'')+'" data-act="cb-l2go" data-id="'+c.id+'" data-i="'+i+'" aria-label="Item '+(i+1)+(ok?' done':'')+'">'+(ok && !on ? ico('check',12) : (i+1))+'</button><span>'+esc(labels[i])+'</span></li>';
  }).join('')+'<li><button type="button" class="zc-dot'+(cur===n?' on':'')+'" data-act="cb-l2go" data-id="'+c.id+'" data-i="'+n+'" aria-label="Review">'+ico('bag',12)+'</button><span>Review</span></li></ol>';
  var body;
  if(cur<n){
    var i = cur, p = P(c.items[i]), ok = cb_checkItem(c, u, i).ok, size = cb_sizeOf(c, u, i);
    body = '<div class="card zc-l2card" id="cb-item-'+i+'"><div class="row" style="gap:10px">'+cb_lookBtn(c, i, '<div class="zc-l2thumb">'+productImg(p, u.colors[i], {ratio:'ratio-11', label:false})+'</div>', 'zc-lookimg')+
      '<div class="grow" style="min-width:0"><div class="xs muted bold">ITEM '+(i+1)+' OF '+n+'</div><div class="small bold zc-l2name">'+esc(p.name)+' · <span class="text2" style="font-weight:500">'+esc(COL(u.colors[i]).name)+'</span></div></div></div>'+
      cb_swatches(c, u, i, 'mt12')+
      '<div class="small mt12"><b>Size:</b> '+(size ? esc(size) : '<span class="muted">tap one — we move on by ourselves</span>')+'</div>'+cb_sizePills(c, u, i)+cb_itemMsgs(c, u, i)+
      (ok ? '<button type="button" class="btn btn-secondary btn-block mt16" data-act="cb-l2go" data-id="'+c.id+'" data-i="'+(i+1)+'">'+(i+1<n ? 'Looks good — next: '+esc(labels[i+1]) : 'Looks good — review')+ico('right',16)+'</button>' : '')+
    '</div>';
  } else {
    var all = cb_checkAll(c, u);
    body = '<div class="card zc-l2card" id="cb-summary"><div class="h3">Your '+esc(c.name)+'</div>'+c.items.map(function(pid, i){
      var p = P(pid), s = cb_sizeOf(c, u, i);
      return '<div class="cb-sum-line">'+cb_lookBtn(c, i, '<div class="cb-sum-img">'+productImg(p, u.colors[i], {ratio:'ratio-11', label:false})+'</div>', 'zc-lookimg')+
        '<div class="grow"><div class="small bold">'+esc(p.name)+'</div><div class="xs muted">'+esc(COL(u.colors[i]).name)+' · '+(s ? 'Size '+esc(s) : '<span class="sale bold">size not picked</span>')+'</div></div><button type="button" class="link" data-act="cb-l2go" data-id="'+c.id+'" data-i="'+i+'">Change</button></div>';
    }).join('')+
    '<div class="row between mt12"><span class="bold">Set price</span><span class="price" style="font-size:22px">'+fmt(cb_price(c))+'</span></div>'+
    (all.ok ? '<div class="mt12">'+cb_ctas(c, u)+'</div>' : '<div class="cb-errtxt zc-err">'+esc(all.msg)+'</div>')+'</div>';
  }
  return '<div class="stack" style="gap:14px">'+cb_titleMini(c)+cb_priceLine(c)+cb_editBanner(c, u)+dots+body+cb_trust(c)+'</div>';
}

/* one size row for several items (L3, L4) */
function cb_groupSizes(c, u, idxs, label){
  var p0 = P(c.items[idxs[0]]), cur = cb_sizeOf(c, u, idxs[0]);
  var allSame = idxs.every(function(i){ return cb_sizeOf(c, u, i)===cur; });
  var pills = p0.sizes.map(function(s){
    var outFor = idxs.filter(function(i){ return stockOf(c.items[i], u.colors[i], s)<=0; });
    var out = outFor.length===idxs.length, part = outFor.length && !out, on = allSame && cur===s;
    var tip = out ? 'Sold out' : (part ? 'Not in '+outFor.map(function(i){ return COL(u.colors[i]).name; }).join(', ') : '');
    return '<button type="button" class="size-pill'+(on?' on':'')+(out||part?' out':'')+'" data-act="cb-gsize" data-id="'+c.id+'" data-idx="'+idxs.join(',')+'" data-s="'+esc(s)+'" aria-pressed="'+on+'"'+(out||part ? ' disabled title="'+esc(tip)+'"' : '')+'>'+esc(s)+'</button>';
  }).join('');
  var msgs = idxs.map(function(i){ return cb_itemMsgs(c, u, i); }).join('');
  return '<div class="zc-gsize" id="cb-item-'+idxs[0]+'" data-slots="'+idxs.join(' ')+'"><div class="row between"><div class="small bold">'+esc(label)+'</div>'+(allSame && cur ? '<span class="xs brandc bold">'+esc(cur)+' '+ico('check',12)+'</span>' : '')+'</div>'+
    '<div class="cb-pills zc-sizes mt8" style="--n:'+p0.sizes.length+'">'+pills+'</div>'+msgs+'</div>';
}

/* L3 · MIX & MATCH — tap colours from a grid; one size for all */
function cb_L3(c, u){
  var groups = cb_sizeGroups(c, true);
  var secs = groups.map(function(g){
    var p = P(g.key), k = g.items.length, cols = g.items.map(function(i){ return u.colors[i]; });
    var tiles = p.colors.map(function(col){
      var out = totalStock(p.id, col)<=0, n = cols.filter(function(x){ return x===col; }).length;
      return '<button type="button" class="zc-tile'+(n?' on':'')+'" data-act="cb-g3col" data-id="'+c.id+'" data-pid="'+p.id+'" data-c="'+col+'" aria-pressed="'+(n>0)+'" title="'+esc(COL(col).name)+'" aria-label="'+esc(COL(col).name)+(out?' (sold out)':'')+'"'+(out?' disabled':'')+'>'+
        productImg(p, col, {ratio:'ratio-11', label:false})+'<span class="zc-tname">'+esc(COL(col).name)+'</span>'+(n ? '<span class="zc-tbadge">'+(n>1 ? '×'+n : ico('check',12))+'</span>' : '')+'</button>';
    }).join('');
    var gs = u.gsame[g.key]!==false;
    var sizeBlock = (k===1 || gs) ? cb_groupSizes(c, u, g.items, k>1 ? 'One size for all '+k : 'Size')
      : g.items.map(function(i, ix){ return cb_groupSizes(c, u, [i], 'Size for the '+COL(u.colors[i]).name+' one'); }).join('');
    return '<section class="card zc-g3" data-slots="'+g.items.join(' ')+'">'+
      '<div class="row between"><div class="h3">'+(k>1 ? 'Tap '+k+' colours' : 'Tap a colour')+' · '+esc(cb_short(p))+'</div><span class="xs muted">'+esc(fmt(p.price))+' each</span></div>'+
      (k>1 ? '<div class="xs muted mt8">Your '+k+': <b class="text2">'+esc(cols.map(function(x){ return COL(x).name; }).join(' + '))+'</b> · tap one twice for two of it</div>' : '')+
      '<div class="zc-tiles mt12">'+tiles+'</div>'+
      (k>1 ? '<label class="check mt12"><input type="checkbox" data-change="cb-gsame" data-id="'+c.id+'" data-k="'+esc(g.key)+'"'+(gs?' checked':'')+'> Same size for all '+k+'</label>' : '')+
      '<div class="mt12">'+sizeBlock+'</div></section>';
  }).join('');
  return '<div class="stack" style="gap:14px">'+cb_titleMini(c)+cb_priceLine(c)+cb_editBanner(c, u)+secs+cb_trust(c)+'</div>';
}

/* L4 · READY LOOKS FIRST — tap a look, then one size row per size type */
function cb_L4(c, u){
  var looks = cb_looks(c, 4), cur = u.colors.join('+');
  var cards = looks.map(function(lk, ix){
    var on = lk.join('+')===cur, fit = cb_pairFits(c, u, lk), items = c.items.map(function(pid, i){ return {product:pid, color:lk[i]}; });
    return '<button type="button" class="zc-lookcard'+(on?' on':'')+(fit.ok?'':' zc-out')+'" data-act="cb-pair" data-id="'+c.id+'" data-colors="'+lk.join(',')+'" aria-pressed="'+on+'"'+(fit.ok?'':' disabled title="Not in size '+esc(fit.size)+'"')+'>'+
      setImg(items, {ratio:'ratio-wide', inner:(ix===0 ? '<span class="badge-img">Most picked</span>' : '')})+
      '<span class="zc-lookname2">'+esc(lk.map(function(col){ return COL(col).name; }).join(' + '))+'</span>'+(on ? '<span class="zc-lookok">'+ico('check',14)+'</span>' : '')+'</button>';
  }).join('');
  var groups = cb_sizeGroups(c, false);
  var sizes = groups.map(function(g){ return cb_groupSizes(c, u, g.items, g.label); }).join('');
  var own = u.own ? '<div class="mt12">'+cb_c1(c, u)+'</div>' : '';
  return '<div class="stack" style="gap:14px">'+cb_titleMini(c)+cb_priceLine(c)+cb_editBanner(c, u)+
    '<div><div class="label" style="margin:0 0 8px">1 · Pick a look</div><div class="zc-looks">'+cards+'</div></div>'+
    '<div class="card p16"><div class="label" style="margin:0 0 4px">2 · Your size</div>'+sizes+'</div>'+
    '<div><button type="button" class="link zc-ownbtn" data-act="cb-own" data-id="'+c.id+'" aria-expanded="'+!!u.own+'">'+(u.own ? 'Hide my own colours' : 'Make my own — choose each colour')+ico(u.own ? 'up' : 'down',14)+'</button>'+own+'</div>'+
    cb_trust(c)+'</div>';
}

/* ---------- page ---------- */
PAGES.combo = {
  layout:'store',
  title:function(params){ var c = COMBO(params[0]); return c ? c.name : 'Set not found'; },
  render:function(params, query){
    var c = COMBO(params[0]);
    if(!c || !c.active || !cb_valid(c)) return cb_unavailable(c);
    var u = cb_state(c, query), L = cb_layout(query), reg = cb_regular(c), price = cb_price(c);
    var wa = function(cls){ return cb_waBtn('Ask about this set on WhatsApp', cb_waText(c, u), 'btn-block '+(cls||'')); };
    var info, tpl = comboTemplateFor(c);
    if(L==='current'){
      var pickers = tpl==='C2'
        ? '<div class="zo-pick">'+cb_editBanner(c, u)+'<div class="row between mb12 cb-unitrow"><div class="h2">Build it step by step</div>'+cb_unitSeg(c, u)+'</div>'+cb_c2(c, u)+'</div>'
        : '<div class="zo-pick">'+cb_editBanner(c, u)+'<div class="row between mb12 cb-unitrow"><div class="h2">Choose colours & sizes</div>'+cb_unitSeg(c, u)+'</div>'+cb_c1(c, u)+'</div>';
      info = '<div class="stack zc-info" style="gap:20px" data-testid="combo-'+tpl+'">'+
        '<div class="zo-title">'+cb_titleBlock(c, u)+'</div>'+
        '<div class="zo-price">'+cb_priceBox(c)+'</div>'+
        cb_pairsBlock(c, u)+
        pickers+
        cb_finder(c)+
        cb_summary(c, u, tpl)+
        '<div class="cb-donly zo-ctas">'+cb_ctas(c, u)+'<div class="mt12">'+wa()+'</div></div>'+
        cb_rules(c)+
        '<div class="hide-d zo-wa">'+wa()+'</div>'+
      '</div>';
    } else {
      var body = L==='L1' ? cb_L1(c, u) : L==='L2' ? cb_L2(c, u) : L==='L3' ? cb_L3(c, u) : cb_L4(c, u);
      info = '<div class="stack zc-info" style="gap:18px" data-testid="combo-'+L+'">'+body+
        '<div class="cb-donly">'+cb_ctas(c, u)+'</div>'+
        cb_finder(c)+cb_rules(c)+'<div>'+wa()+'</div></div>';
    }
    var dots = u.colors.map(function(col){ return '<span class="cb-dot" style="background:'+COL(col).hex+'"></span>'; }).join('');
    /* R16 (21): the bar's price line never wraps; colour names go first when
       the screen is narrow (dots stay), so the bar keeps its normal height */
    var mbar = '<div class="mbar dm-hide cb-mbar zc-mbar">'+
      '<div class="zc-mrow"><span class="price zc-mprice">'+fmt(price)+'</span>'+(reg>price ? '<span class="strike xs">'+fmt(reg)+'</span><span class="xs brandc bold">Save '+fmt(reg-price)+'</span>' : '')+
      '<span class="zc-mcol"><span class="cb-dots" aria-hidden="true">'+dots+'</span><span class="zc-mnames xs muted">'+esc(cb_colorNames(u))+'</span></span></div>'+cb_ctas(c, u)+'</div>';
    var cls = 'zc-'+(L==='current' ? 'cur zc-ord-'+cb_phoneOrder(query) : L);
    return '<div class="container cb-wrap '+cls+'" data-layout="'+L+'">'+cb_crumbs(c)+
      '<div class="cb-main"><div class="cb-left zo-gal">'+cb_gallery(c, u)+'</div>'+info+'</div>'+
      cb_moreSets(c.id)+
    '</div>'+mbar;
  }
};

/* ---------- actions ---------- */
function cb_ctx(el){ var c = COMBO(el.getAttribute('data-id')); if(!c || !cb_valid(c)) return null; return {c:c, u:cb_state(c, CUR.query), i:+el.getAttribute('data-i')||0}; }

ACT['cb-color'] = function(el){ var x = cb_ctx(el); if(!x) return; x.u.colors[x.i] = el.getAttribute('data-c'); x.u.note = {}; cb_fixSizes(x.c, x.u); x.u.gal = x.i; x.u.err = null; rerender(); };
ACT['cb-size'] = function(el){
  var x = cb_ctx(el); if(!x) return;
  x.u.sizes[x.i] = el.getAttribute('data-s');
  if(cb_linkSrc(x.c, x.i)>=0 && x.u.same[x.i]) x.u.same[x.i] = false;
  if(x.u.note) delete x.u.note[x.i];
  x.u.err = null;
  /* L2: a valid pick moves to the next item by itself */
  if(cb_layout(CUR.query)==='L2' && cb_checkItem(x.c, x.u, x.i).ok){
    rerender();
    var n = x.c.items.length, nx = x.i+1;
    setTimeout(function(){ x.u.step = nx; x.u.gal = Math.min(nx, n-1); if(nx<n) x.u.view = 'set'; rerender(); cb_scrollTo(nx<n ? 'cb-item-'+nx : 'cb-summary'); }, 280);
    return;
  }
  rerender();
};
CHANGE['cb-same'] = function(el){
  var x = cb_ctx(el); if(!x) return; var src = cb_linkSrc(x.c, x.i);
  if(el.checked){ x.u.same[x.i] = true; }
  else { var s = cb_sizeOf(x.c, x.u, src); x.u.same[x.i] = false; x.u.sizes[x.i] = s && stockOf(x.c.items[x.i], x.u.colors[x.i], s)>0 ? s : null; }
  x.u.err = null; rerender();
};
ACT['cb-pair'] = function(el){
  var x = cb_ctx(el); if(!x) return;
  var cols = el.getAttribute('data-colors').split(',');
  cols.forEach(function(col, i){ if(i<x.u.colors.length) x.u.colors[i] = col; });
  x.u.note = {}; cb_fixSizes(x.c, x.u); x.u.err = null; x.u.view = 'set'; rerender();
};
ACT['cb-gal'] = function(el){ var x = cb_ctx(el); if(!x) return; x.u.gal = x.i; if(x.u.view==='set') x.u.view = 'front'; rerender(); };
ACT['cb-view'] = function(el){ var x = cb_ctx(el); if(!x) return; x.u.view = el.getAttribute('data-v'); rerender(); };
ACT['cb-unit'] = function(el){ var x = cb_ctx(el); if(!x) return; x.u.cm = el.getAttribute('data-v')==='cm'; rerender(); };
/* a picture / name tap: the item in the big photo, on this page */
ACT['cb-look'] = function(el){
  var x = cb_ctx(el); if(!x) return; x.u.gal = x.i; x.u.view = 'front'; rerender();
  setTimeout(function(){ var g = document.getElementById('cb-gallery'); if(!g) return; var r = g.getBoundingClientRect(); if(r.top < 0 || r.top > window.innerHeight*0.5) window.scrollTo({top:Math.max(0, window.scrollY + r.top - 70), behavior:'smooth'}); }, 30);
};
ACT['cb-more'] = function(){ cb_scrollTo('cb-more', 'start'); };
ACT['cb-step'] = function(el){ var x = cb_ctx(el); if(!x) return; x.u.step = x.i; x.u.gal = x.i; x.u.err = null; rerender(); cb_scrollTo('cb-item-'+x.i); };
ACT['cb-next'] = function(el){
  var x = cb_ctx(el); if(!x) return; var n = x.c.items.length, chk = cb_checkItem(x.c, x.u, x.i);
  if(!chk.ok){ x.u.err = {i:x.i, msg:chk.msg}; rerender(); cb_focusErr(x.i); return; }
  x.u.done[x.i] = true; x.u.err = null;
  var nx = cb_nextAfter(x.u, x.i, n); x.u.step = nx; if(nx<n) x.u.gal = nx;
  rerender(); cb_scrollTo(nx<n ? 'cb-item-'+nx : 'cb-summary');
};
ACT['cb-l2go'] = function(el){ var x = cb_ctx(el); if(!x) return; var n = x.c.items.length; x.u.step = Math.max(0, Math.min(n, x.i)); x.u.err = null; rerender(); cb_scrollTo(x.u.step<n ? 'cb-item-'+x.u.step : 'cb-summary'); };
ACT['cb-gsize'] = function(el){
  var x = cb_ctx(el); if(!x) return; var s = el.getAttribute('data-s');
  el.getAttribute('data-idx').split(',').map(Number).forEach(function(i){ x.u.sizes[i] = s; x.u.same[i] = false; if(x.u.note) delete x.u.note[i]; });
  x.u.err = null; rerender();
};
CHANGE['cb-gsame'] = function(el){ var x = cb_ctx(el); if(!x) return; x.u.gsame[el.getAttribute('data-k')] = !!el.checked; rerender(); };
/* L3: the last k colours tapped fill the k slots (tap one twice for two of it) */
ACT['cb-g3col'] = function(el){
  var x = cb_ctx(el); if(!x) return; var pid = el.getAttribute('data-pid'), col = el.getAttribute('data-c');
  var slots = []; x.c.items.forEach(function(p, i){ if(p===pid) slots.push(i); });
  var q = (x.u.gq[pid] || slots.map(function(i){ return x.u.colors[i]; })).slice();
  q.push(col); while(q.length>slots.length) q.shift();
  x.u.gq[pid] = q; slots.forEach(function(i, ix){ x.u.colors[i] = q[ix]; });
  x.u.note = {}; cb_fixSizes(x.c, x.u); x.u.err = null; x.u.view = 'set'; rerender();
};
ACT['cb-own'] = function(el){ var x = cb_ctx(el); if(!x) return; x.u.own = !x.u.own; rerender(); };

/* finder (in place) */
ACT['cb-f-open'] = function(el){ var x = cb_ctx(el); if(!x) return; openModal(cb_finderHTML(), {title:'Find my size', rebuild:cb_finderHTML, cls:'pdp-sheet'}); };
ACT['cb-f-step'] = function(el){
  var x = cb_ctx(el); if(!x) return; var d = Number(el.getAttribute('data-d'));
  if(el.getAttribute('data-k')==='h') x.u.fH = Math.max(54, Math.min(84, x.u.fH + d)); else x.u.fW = Math.max(35, Math.min(150, x.u.fW + d));
  refreshModal();
};
ACT['cb-f-use'] = function(el){
  var x = cb_ctx(el); if(!x) return; var c = x.c, u = x.u, acc = currentAccount(), cur = (acc ? acc.mySize : ST.guestSize) || {};
  var ms = {top:cur.top||null, bottom:cur.bottom||null, heightIn:u.fH, weightKg:u.fW}, filled = 0, out = [];
  c.items.forEach(function(pid, i){
    var p = P(pid), ch = chartFor(p); if(!ch) return; var r = recommendSize(ch, u.fH, u.fW); if(!r) return;
    var grp = (CAT(p.cat)||{}).group; if(grp==='top') ms.top = r.size; else if(grp==='bottom') ms.bottom = r.size;
    if(stockOf(pid, u.colors[i], r.size)>0){ u.sizes[i] = r.size; u.same[i] = false; filled++; if(u.note) delete u.note[i]; }
    else { u.sizes[i] = null; u.same[i] = false; u.note[i] = 'Your size '+r.size+' is sold out in '+COL(u.colors[i]).name+'. Pick another colour, or another size.'; out.push(i+1); }
  });
  if(acc) acc.mySize = ms; else ST.guestSize = ms;
  saveState(); closeModal(); u.err = null; rerender();
  toast(out.length ? 'Sizes filled — item '+out.join(', ')+' needs another colour' : 'Sizes filled for all '+filled+' items · saved as your size');
};

function cb_addSet(c, u, checkout){
  var chk = cb_checkAll(c, u), L = cb_layout(CUR.query);
  if(!chk.ok){
    u.err = {i:chk.i, msg:chk.msg}; u.gal = chk.i;
    if(L==='current' && comboTemplateFor(c)==='C2') u.step = chk.i;
    if(L==='L2') u.step = chk.i;
    if(L==='L4' && !/size/i.test(chk.msg)) u.own = true;
    rerender(); cb_focusErr(chk.i); return false;
  }
  var items = c.items.map(function(pid, i){ return {product:pid, color:u.colors[i], size:cb_sizeOf(c, u, i)}; });
  var editing = u.edit;
  var res = bagAdd({kind:'set', source:'combo', refId:c.id, name:c.name, items:items, price:cb_price(c)}, {replace:editing||null});
  if(!res.added){
    if(res.reason==='repeat'){ if(checkout) go('#/checkout'); return true; }
    if(res.reason==='stock'){
      var bad = res.issues[0], bi = 0; items.forEach(function(it, i){ if(it.product===bad.product && it.color===bad.color && it.size===bad.size) bi = i; });
      u.err = {i:bi, msg:bad.msg+' Choose another colour or size for item '+(bi+1)+'.'}; if(L==='L2') u.step = bi;
      rerender(); cb_focusErr(bi);
    }
    return false;
  }
  u.err = null;
  if(editing){ u.edit = null; u.sig = ''; go(checkout ? '#/checkout' : '#/bag'); toast(c.name+' updated in your bag'); return true; }
  if(checkout){ go('#/checkout'); return true; }
  rerender();
  /* D-028: desktop confirms in the right-side drawer; the phone keeps its toast */
  if(res.id && typeof dkb_desk==='function' && dkb_desk() && typeof bag_drawerOpen==='function'){ bag_drawerOpen(res.id); return true; }
  cb_toast(c.name+' ('+cb_colorNames(u)+') added to your bag', '#/bag', 'View bag');
  return true;
}
ACT['cb-add'] = function(el){ var x = cb_ctx(el); if(x) cb_addSet(x.c, x.u, false); };
ACT['cb-order'] = function(el){ var x = cb_ctx(el); if(x) cb_addSet(x.c, x.u, true); };

/* AUTO-FIT rules for this page (03-layout.js) */
fitRule('.cb-wrap .cb-pairs .chip', {min:11, group:'cbpair', collapse:true});
fitRule('.cb-wrap .cb-rail .cb-cap', {min:10.5, group:'cbcap', collapse:true});
fitRule('.cb-wrap .cb-pills', {min:11, group:'cbpills'});
fitRule('.cb-wrap .cb-pricebox .cb-pbrow', {min:9.5, box:true});
