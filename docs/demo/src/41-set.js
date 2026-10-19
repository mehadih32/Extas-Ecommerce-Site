/* ================= EXTAS demo — Build your own set (#/set, #/set/:ruleId) =================
   Uses ONLY the owner's active rules from setRules(). Prefix: bs_ (functions) / bs- (actions, CSS). */

(function bs_injectCSS(){
  if(document.getElementById('bs-css')) return;
  var css = [
    '.bs-wrap{padding-top:12px}',
    '@media(min-width:1024px){.bs-wrap{padding-top:20px}}',
    '.bs-hd{margin-top:12px}',
    '.bs-hd p{margin:8px 0 0;max-width:640px}',
    '.bs-tabs{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;margin-top:18px;padding:2px}',
    '.bs-tab{display:flex;flex-direction:column;gap:2px;padding:10px 16px;min-width:170px;min-height:44px;border:1px solid var(--line);border-radius:var(--card-radius);background:var(--surface);color:var(--ink)!important;flex-shrink:0}',
    '.bs-tab:hover{border-color:var(--brand-line)}',
    '.bs-tab.on{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand);background:var(--brand-tint)}',
    '.bs-tab b{font-size:14px;font-weight:700}',
    '.bs-tab span{font-size:12px;color:var(--muted)}',
    '.bs-rulecard{padding:18px}',
    '@media(min-width:1024px){.bs-rulecard{padding:22px 24px}}',
    '.bs-headline{font-family:var(--font-display);font-weight:700;font-size:21px;line-height:1.25;margin:4px 0 0}',
    '@media(min-width:1024px){.bs-headline{font-size:26px}}',
    '.bs-tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-top:16px}',
    '.bs-tier{border:1px solid var(--line);border-radius:var(--card-radius);background:var(--surface);padding:12px 14px;display:flex;flex-direction:column;gap:2px}',
    '.bs-tier.on{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand);background:var(--brand-tint)}',
    '.bs-tier.next{border-style:dashed;border-color:var(--brand)}',
    '.bs-tier.dim{opacity:.62}',
    '.bs-tier .tag{align-self:flex-start;margin-top:8px}',
    '.bs-slots{display:grid;grid-template-columns:repeat(var(--n,3),minmax(0,1fr));gap:8px}',
    '.bs-slot{position:relative;border:1px solid var(--line);background:var(--surface);border-radius:var(--radius);padding:6px 6px 8px;min-width:0;color:var(--ink);font-family:inherit;text-align:left}',
    '.bs-slot .pimg{border-radius:var(--radius)}',
    '.bs-slotname{font-size:12.5px;font-weight:600;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bs-slot.empty{border:1.5px dashed var(--input);background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--muted);font-size:12.5px;font-weight:600;cursor:pointer;min-height:120px;text-align:center}',
    '.bs-slot.empty:hover{border-color:var(--brand);color:var(--brand)}',
    '.bs-rm{position:absolute;top:2px;right:2px;width:32px;height:32px;border-radius:50%;border:1px solid var(--line);background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink);padding:0}',
    '.bs-rm:hover{border-color:var(--sale);color:var(--sale)}',
    '.bs-card{overflow:hidden;display:flex;flex-direction:column}',
    '.bs-card .pimg{border-radius:0}',
    '.bs-cinfo{padding:10px 10px 12px;display:flex;flex-direction:column;gap:8px;flex:1}',
    '@media(min-width:1024px){.bs-cinfo{padding:12px 12px 14px}}',
    '.bs-cname{font-size:13.5px;font-weight:600;color:var(--ink)!important;line-height:1.3}',
    /* A2. THE COLOUR DOTS NO LONGER SHARE HIT AREAS.
       Every .swatch gets a 44x44 box from styles.css (.swatch:not(.sm)::after).
       The dots were 30px on a 36px pitch, so each 44px box overlapped its
       neighbour by 8px and a tap in the overlap went to whichever button came
       first in the DOM — the customer tapped Black and got White. The pitch is
       exactly 44px now: 36px dot + 8px gap, horizontally AND on a wrapped row,
       so the 44px boxes meet edge to edge and never cross. */
    '.bs-sws{display:flex;flex-wrap:wrap;gap:8px;padding:0}',
    '.bs-card .bs-sws .bs-sw{width:36px!important;height:36px!important}',
    /* R14. ONE ROW OF COLOURS, ALWAYS. Three 36px dots on a 44px pitch need
       124px; a card at 320px has 122, so the third dot fell onto a second
       line (and five colours always did). Each colour now gets an equal cell
       of at most 44px; the dot is the cell less 8px (never more than 36px)
       and its finger box is exactly the cell, so neighbouring boxes still
       meet edge to edge and never cross — the A2 rule, kept at any width. */
    '.bs-card .bs-sws{display:grid;grid-template-columns:repeat(var(--n,3),minmax(0,44px));gap:0}',
    '.bs-card .bs-sws .bs-sw{width:calc(100% - 8px)!important;max-width:36px;height:auto!important;aspect-ratio:1/1;justify-self:start}',
    '.bs-card .bs-sws .bs-sw::after{width:calc(100% + 8px);height:44px}',
    /* A3. THE SIZE ROW FITS.
       styles.css B3 forced repeat(auto-fit,minmax(36px,1fr)), which on a 176px
       card is four columns — so five sizes always broke 4 + 1. One explicit
       column per size, and the type steps down as the count goes up, exactly
       the way the product page solves the same problem. */
    '.bs-card .bs-pills{display:grid;grid-template-columns:repeat(var(--k,5),minmax(0,1fr))!important;gap:3px!important}',
    '.bs-pill{min-width:0;min-height:44px;padding:0;font-size:13px;letter-spacing:-.01em}',
    /* R14. The type is no longer guessed from the number of sizes (12px for
       five, 11px for six…) — that still cut "XXL" on every phone under 400px,
       because a card is ~136px wide at 320 and ~156px at 360. The row now
       carries the size and every pill is 1em; AUTO-FIT (rule below) steps
       the row down until the widest label fits, and all the rows on the page
       share one size so the cards still match. */
    '.bs-card .bs-pills{font-size:13px}',
    '.bs-card .bs-pills .size-pill.bs-pill{font-size:1em!important;padding:0!important;letter-spacing:-.02em}',
    /* narrow cards give the pills the room: a little less side padding */
    '@media(max-width:374px){.bs-card .bs-cinfo{padding-left:7px;padding-right:7px}.bs-card .bs-pills{gap:2px!important}}',
    '.bs-card .btn{margin-top:auto;min-height:44px}',
    /* the remove cross keeps its 32px look and gains a 44px finger target */
    '.bs-rm::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}',
    /* A9. the disabled Add-set-to-Bag read 4.36:1 — under the 4.5 floor.
       Same grey family, two steps darker, measured at 4.77:1 on #E6E3DE. */
    '.bs-sum .btn[disabled],.bs-mbar .btn[disabled]{color:#686158!important}',
    /* the product-name link was a 16px-tall target duplicating the photo link
       above it; a 44px pad costs the card no height */
    '.bs-cname{position:relative;display:inline-block}',
    '.bs-cname::after{content:"";position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:44px}',
    /* A10. white on #1FA855 is 3.09:1; #13833F is 4.83:1 */
    '.bs-wrap .wa-btn.btn-block{background:#13833F;border-color:#0F6C33}',
    '.bs-wrap .wa-btn.btn-block:hover{background:#0F6C33}',
    '.bs-wrap .rule-v{min-height:44px;display:inline-flex;align-items:center}',
    '.bs-sum{padding:18px 18px 16px}',
    '.bs-mbar{bottom:56px;box-shadow:0 -6px 18px rgba(0,0,0,.06)}',
    '@media(min-width:1024px){.bs-mbar{bottom:0}}',
    '.bs-donly{display:none}',
    '@media(min-width:1024px){.bs-donly{display:block}}',
    '.bs-off{padding:40px 20px;text-align:center}',
    '.bs-ico{width:56px;height:56px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:inline-flex;align-items:center;justify-content:center}',
    '.bs-nudge{display:flex;gap:8px;align-items:center;padding:10px 12px;font-size:13px;font-weight:600;color:var(--brand-dark)}',
    ':root[data-theme="festive"] .bs-nudge{color:var(--gold)}',
    '.bs-toast{bottom:150px;width:max-content;max-width:calc(100vw - 32px)}',
    '@media(max-width:1023px){body:has(.bs-mbar) .demo-fab{bottom:150px}body:has(.bs-mbar) .demo-panel{bottom:200px}}',
    '@media(min-width:1024px){.bs-toast{bottom:28px}}'
  ].join('\n');
  var s = document.createElement('style'); s.id = 'bs-css'; s.textContent = css; document.head.appendChild(s);
})();

/* ---------- rule helpers ---------- */
function bs_activeRules(){ return setRules().filter(function(r){ return r.active; }); }
function bs_tiers(r){
  return Object.keys(r.tiers||{}).map(Number).filter(function(k){ return k>0 && r.tiers[k]!=null; }).sort(function(a, b){ return a-b; })
    .map(function(k){ return {n:k, price:Number(r.tiers[k])}; });
}
function bs_products(r){
  if(r.mode==='sku') return (r.skus||[]).map(P).filter(Boolean);
  return DB.products.filter(function(p){ return (r.categories||[]).indexOf(p.cat)>=0; });
}
function bs_noun(r){
  if(r.mode==='category' && r.categories && r.categories.length===1){ var ct = CAT(r.categories[0]); if(ct) return ct.name==='T-Shirts' ? 'T-shirts' : ct.name.toLowerCase(); }
  return r.mode==='sku' ? 'styles' : 'items';
}
function bs_headline(r){ return bs_tiers(r).map(function(t, ix){ return 'Any '+t.n+(ix===0 ? ' '+bs_noun(r) : '')+' '+fmt(t.price); }).join(' · '); }
function bs_short(p){ var w = p.name.split(' '); return w.length>2 ? w.slice(0, -1).join(' ') : p.name; }

/* price for the current picks: tier price on the most expensive items, regular price for any extra */
function bs_price(r, items){
  var tiers = bs_tiers(r), n = items.length;
  var regs = items.map(function(it){ return P(it.product).price; }).sort(function(a, b){ return b-a; });
  var regular = regs.reduce(function(s, v){ return s+v; }, 0), applied = null, next = null;
  tiers.forEach(function(t){ if(t.n<=n) applied = t; else if(!next) next = t; });
  var price = regular;
  if(applied){ var rest = regs.slice(applied.n).reduce(function(s, v){ return s+v; }, 0); price = Math.min(regular, applied.price + rest); }
  return {n:n, regular:regular, price:price, save:regular-price, applied:applied, next:next, tiers:tiers,
    min: tiers.length ? tiers[0].n : 2, max: tiers.length ? tiers[tiers.length-1].n : 2};
}
function bs_status(pr){
  if(pr.n < pr.min) return {line:'Pick at least '+pr.min+' items', sub: pr.n ? 'Add '+(pr.min-pr.n)+' more to unlock '+fmt(pr.tiers[0].price) : 'Any '+pr.min+' for '+fmt(pr.tiers[0].price)};
  return {line: plural(pr.n,'item')+' · '+fmt(pr.price)+(pr.save>0 ? ' · Save '+fmt(pr.save) : ''),
    sub: pr.next ? 'Add '+(pr.next.n-pr.n)+' more → '+pr.next.n+' for '+fmt(pr.next.price) : 'Best set price unlocked'};
}

/* ---------- UI state ---------- */
function bs_sel(rule){ var s = ui('set:sel', {rule:null, items:[]}); if(s.rule!==rule.id){ s.rule = rule.id; s.items = []; } return s; }
function bs_firstColor(p){ for(var i=0;i<p.colors.length;i++) if(totalStock(p.id, p.colors[i])>0) return p.colors[i]; return p.colors[0]; }
function bs_cardState(r, p){
  var col = bs_firstColor(p), ms = mySizeFor(p);
  return ui('set:card:'+r.id+':'+p.id, {color:col, size: ms && stockOf(p.id, col, ms)>0 ? ms : null, err:'', view:'front'});
}
function bs_toast(msg){
  var t0 = document.querySelector('.toast'); if(t0) t0.remove();
  var d = document.createElement('div'); d.className = 'toast bs-toast'; d.setAttribute('role','status'); d.textContent = msg;
  document.body.appendChild(d); toastArm(d, 2600);   /* T7: one toast timer (02-core) */
}

/* ---------- pieces ---------- */
/* D-040 (desktop): Home / Combos / Build your own set — the phone keeps its two steps */
function bs_crumbs(){ return '<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">/</span><a class="hide-m" href="#/combos">Combos</a><span class="hide-m" aria-hidden="true">/</span><span>Build your own set</span></nav>'; }

function bs_tierCards(pr){
  return '<div class="bs-tiers">'+pr.tiers.map(function(t){
    var on = pr.applied && pr.applied.n===t.n, isNext = pr.next && pr.next.n===t.n, more = t.n - pr.n;
    var cls = on ? ' on' : (isNext ? ' next' : (t.n<pr.n ? ' dim' : ''));
    /* with nothing picked yet "Add 2 more" read as if two were already in */
    var tag = on ? '<span class="tag">'+ico('check',12)+'Unlocked</span>'
      : (t.n>pr.n ? '<span class="tag '+(isNext?'gold':'plain')+'">'+(pr.n ? 'Add '+more+' more' : 'Pick any '+t.n)+'</span>' : '');
    return '<div class="bs-tier'+cls+'" data-testid="tier-'+t.n+'"><div class="xs muted bold" style="letter-spacing:.06em;text-transform:uppercase">Any '+t.n+'</div>'+
      '<div class="price" style="font-size:22px">'+fmt(t.price)+'</div><div class="xs text2">'+fmt(Math.round(t.price/t.n))+' per item</div>'+tag+'</div>';
  }).join('')+'</div>';
}

function bs_slots(sel, pr){
  var h = '';
  for(var i=0;i<pr.max;i++){
    var it = sel.items[i];
    if(it){
      var p = P(it.product);
      h += '<div class="bs-slot" data-testid="slot-filled">'+productImg(p, it.color, {ratio:'ratio-11', label:false})+
        /* bs_short lops off the last word, so "Essential Piqué Polo" read as the
           cut-off "Essential Piqué". The slot shows the whole name over two
           lines instead. */
        '<div class="bs-slotname" title="'+esc(p.name)+'">'+esc(p.name)+'</div><div class="xs muted">'+esc(COL(it.color).name)+' · '+esc(it.size)+'</div>'+
        '<button type="button" class="bs-rm" data-act="bs-rm" data-k="'+it.k+'" aria-label="Remove '+esc(p.name+' '+COL(it.color).name+' '+it.size)+'">'+ico('close',14)+'</button></div>';
    } else {
      h += '<button type="button" class="bs-slot empty" data-act="bs-pick">'+ico('plus',18)+'<span>Pick item</span><span class="tiny" style="font-weight:500">Item '+(i+1)+(i+1>pr.min ? ' · optional' : '')+'</span></button>';
    }
  }
  return '<div class="bs-slots" style="--n:'+Math.min(pr.max, 4)+'">'+h+'</div>';
}

function bs_card(r, p, sel, pr){
  var cu = bs_cardState(r, p), col = cu.color, full = sel.items.length >= pr.max;
  var inSet = sel.items.filter(function(it){ return it.product===p.id; }).length;
  var soldOut = p.colors.every(function(c){ return totalStock(p.id, c)<=0; });
  var BSV = {front:'Front', back:'Back', detail:'Detail'}, view = BSV[cu.view] ? cu.view : 'front';
  var img = productImg(p, col, {view:view, ratio:'ratio-45', label:false, inner: (inSet ? '<span class="badge-img">In your set'+(inSet>1 ? ' ×'+inSet : '')+'</span>' : '')+(view!=='front' ? '<span class="badge-img" style="left:auto;right:8px">'+BSV[view]+'</span>' : '')});
  var sws = p.colors.map(function(c){
    var out = totalStock(p.id, c)<=0, on = c===col;
    return '<button type="button" class="swatch bs-sw'+(on?' on':'')+'" style="background:'+COL(c).hex+(out?';opacity:.35':'')+'" data-act="bs-color" data-rid="'+r.id+'" data-pid="'+p.id+'" data-c="'+c+'" aria-label="'+esc(COL(c).name)+(out?' (sold out)':'')+'" aria-pressed="'+on+'" title="'+esc(COL(c).name)+'"'+(out?' disabled':'')+'></button>';
  }).join('');
  var pills = p.sizes.map(function(s){
    var out = stockOf(p.id, col, s)<=0, on = cu.size===s;
    return '<button type="button" class="size-pill bs-pill'+(on?' on':'')+(out?' out':'')+'" data-act="bs-size" data-rid="'+r.id+'" data-pid="'+p.id+'" data-s="'+esc(s)+'" aria-pressed="'+on+'" aria-label="Size '+esc(s)+(out?' sold out':'')+'"'+(out?' disabled':'')+'>'+esc(s)+'</button>';
  }).join('');
  var btn = soldOut ? '<button type="button" class="btn btn-sm btn-block" disabled>Sold out</button>'
    : full ? '<button type="button" class="btn btn-sm btn-block" disabled>Set full</button>'
    : '<button type="button" class="btn btn-sm btn-secondary btn-block" data-act="bs-add" data-rid="'+r.id+'" data-pid="'+p.id+'">'+ico('plus',15)+'Add to set</button>';
  /* R16 · a picture tap must never leave the set page (the owner lost set
     sales to it). The picture now turns in place — front, back, detail —
     and the name is plain text; colour, size and "Add to set" sit right below. */
  return '<div class="card bs-card" data-testid="bs-card-'+p.id+'"><button type="button" class="bs-look" data-act="bs-view" data-rid="'+r.id+'" data-pid="'+p.id+'" aria-label="'+esc(p.name)+' — see the '+(view==='front' ? 'back' : view==='back' ? 'detail' : 'front')+'">'+img+'</button>'+
    '<div class="bs-cinfo"><div><span class="bs-cname bs-cname-t">'+esc(p.name)+'</span><div class="row" style="gap:6px;align-items:baseline;margin-top:3px">'+priceHTML(p.price, p.compareAt)+'</div></div>'+
    '<div><div class="xs muted" style="margin-bottom:5px">Colour: <b class="text2">'+esc(COL(col).name)+'</b></div><div class="bs-sws" style="--n:'+p.colors.length+'">'+sws+'</div></div>'+
    '<div><div class="xs muted" style="margin-bottom:5px">Size'+(cu.size ? ': <b class="text2">'+esc(cu.size)+'</b>' : '')+'</div><div class="bs-pills" role="group" aria-label="Size" data-k="'+p.sizes.length+'" style="--k:'+p.sizes.length+'">'+pills+'</div></div>'+
    (cu.err ? '<div class="xs sale bold" role="alert">'+esc(cu.err)+'</div>' : '')+btn+'</div></div>';
}

function bs_summary(r, sel, pr){
  var st = bs_status(pr), ok = pr.n>=pr.min;
  var totals = ok
    ? '<div class="row between small"><span class="muted">Regular price</span><span class="strike">'+fmt(pr.regular)+'</span></div>'+
      '<div class="row between mt8"><span class="bold">Set price</span><span class="price" style="font-size:24px" data-testid="bs-price">'+fmt(pr.price)+'</span></div>'+
      (pr.save>0 ? '<div class="row between mt8 small brandc bold"><span>You save</span><span>'+fmt(pr.save)+'</span></div>' : '')
    : '<div class="h3" style="font-size:16px">'+esc(st.line)+'</div><div class="small muted mt8">Your set price shows here as you pick.</div>';
  return '<div class="card bs-sum">'+
    '<div class="row between"><div class="h2">Your set</div><span class="xs muted">'+pr.n+' of '+pr.max+' picked</span></div>'+
    '<div class="bar-progress mt12" aria-hidden="true"><div style="width:'+Math.round(pr.n/pr.max*100)+'%"></div></div>'+
    '<div class="mt16">'+bs_slots(sel, pr)+'</div>'+
    '<div class="mt16" style="border-top:1px solid var(--line2);padding-top:14px">'+totals+'</div>'+
    '<div class="tint bs-nudge mt12">'+ico('spark',16)+'<span>'+esc(st.sub)+'</span></div>'+
    '<button type="button" class="btn btn-primary btn-block mt16" data-act="bs-bag" data-rid="'+r.id+'"'+(ok?'':' disabled')+'>'+ico('bag',18)+'Add set to Bag</button>'+
    '<p class="xs muted" style="margin:12px 0 0">Set price applies automatically. Not combined with other offers.</p>'+
  '</div>';
}

function bs_empty(){
  var cs = combos().filter(function(c){ return c.active; });
  var cards = cs.map(function(c){ return typeof cb_comboCard==='function' ? cb_comboCard(c) : '<a class="card p16" href="#/combo/'+c.id+'">'+esc(c.name)+'</a>'; }).join('');
  return '<div class="container bs-wrap">'+bs_crumbs()+
    '<div class="card bs-off mt16" data-testid="set-empty"><span class="bs-ico">'+ico('layers',26)+'</span>'+
      '<h1 class="h1 mt16">Build-your-own sets are taking a break</h1>'+
      '<p class="text2" style="max-width:520px;margin:10px auto 0">Right now there are no mix-and-match offers. '+(cs.length ? 'Our ready-made sets still have a set price — have a look below.' : 'Check back soon for new set prices.')+'</p>'+
      '<div class="row wrap mt24" style="justify-content:center;gap:10px"><a class="btn btn-primary" href="#/">Back to the shop</a></div>'+
    '</div>'+
    (cs.length ? '<section class="section"><div class="sec-hd"><h2 class="h2">Ready-made sets</h2></div><div class="grid g3">'+cards+'</div></section>' : '')+
  '</div>';
}

/* ---------- page ---------- */
PAGES.set = {
  layout:'store',
  title:function(){ return 'Build your own set'; },
  render:function(params){
    var rules = bs_activeRules();
    if(!rules.length) return bs_empty();
    var asked = params[0], rule = asked ? rules.filter(function(r){ return r.id===asked; })[0] : null, missing = asked && !rule;
    rule = rule || rules[0];
    var sel = bs_sel(rule), pr = bs_price(rule, sel.items), prods = bs_products(rule), st = bs_status(pr);
    var tabs = '<div class="bs-tabs" role="tablist" aria-label="Set groups">'+rules.map(function(r){
      var on = r.id===rule.id, tt = bs_tiers(r);
      return '<a class="bs-tab'+(on?' on':'')+'" role="tab" aria-selected="'+on+'" href="#/set/'+r.id+'" data-testid="bs-tab-'+r.id+'"><b>'+esc(r.name)+'</b><span>'+(tt.length ? tt[0].n+' for '+fmt(tt[0].price)+(tt.length>1 ? ' · '+tt[tt.length-1].n+' for '+fmt(tt[tt.length-1].price) : '') : '')+'</span></a>';
    }).join('')+'</div>';
    var ruleCard = '<div class="card bs-rulecard">'+
      '<div class="eyebrow">'+esc(rule.name)+'</div><h2 class="bs-headline" data-testid="bs-headline">'+esc(bs_headline(rule))+'</h2>'+
      '<div class="row top small text2 mt8" style="gap:8px"><span class="muted" style="margin-top:2px">'+ico('info',16)+'</span><span>Mix any styles, colours and sizes from this group. Items from other groups keep their regular price.</span></div>'+
      bs_tierCards(pr)+
    '</div>';
    var phoneSlots = '<div class="hide-d"><div class="row between mb8"><div class="h3" style="font-size:16px">Your set</div><span class="xs muted">'+pr.n+' of '+pr.max+' picked</span></div>'+bs_slots(sel, pr)+'</div>';
    var grid = '<div><div class="sec-hd" id="bs-grid" style="margin-bottom:12px"><h2 class="h2">Pick your '+esc(bs_noun(rule))+'</h2><span class="small muted">'+plural(prods.length,'style')+'</span></div>'+
      (prods.length ? '<div class="grid g4">'+prods.map(function(p){ return bs_card(rule, p, sel, pr); }).join('')+'</div>' : '<div class="card empty">No styles in this group right now.</div>')+'</div>';
    var foot = '<div class="card p16"><div class="row top" style="gap:12px"><span class="brandc" style="margin-top:2px">'+ico('swap',20)+'</span><div class="grow">'+ruleBlock('exchange', {key:'set', title:'Size exchange'})+'<div class="small bold mt8">Exchange one item or the whole set — the set price stays.</div></div></div></div>'+
      '<p class="xs muted hide-d" style="margin:0">Set price applies automatically. Not combined with other offers.</p>';
    var mbar = '<div class="mbar dm-hide bs-mbar"><div class="row between" style="gap:12px">'+
      '<div class="grow"><div class="small bold" data-testid="bs-mbar-line">'+esc(st.line)+'</div><div class="xs brandc bold" style="margin-top:2px">'+esc(st.sub)+'</div></div>'+
      '<button type="button" class="btn btn-primary" data-act="bs-bag" data-rid="'+rule.id+'"'+(pr.n>=pr.min ? '' : ' disabled')+'>Add set to Bag</button></div></div>';
    return '<div class="container bs-wrap">'+bs_crumbs()+
      '<header class="bs-hd"><div class="eyebrow">Mix & match</div><h1 class="h1" style="margin-top:6px">Build your own set</h1>'+
      '<p class="text2">Pick your own styles and colours. The set price applies automatically as soon as you reach it.</p></header>'+
      (missing ? '<div class="warnbox p16 small mt16" role="status">That set offer isn\'t available right now. Here are the sets you can build today.</div>' : '')+
      tabs+
      '<div class="split-side mt16"><div class="stack" style="gap:24px;min-width:0">'+ruleCard+phoneSlots+grid+foot+'</div>'+
      '<aside class="bs-donly sticky-d" aria-label="Your set">'+bs_summary(rule, sel, pr)+'</aside></div>'+
    '</div>'+mbar;
  }
};

/* ---------- actions ---------- */
function bs_ruleById(id){ return bs_activeRules().filter(function(r){ return r.id===id; })[0] || null; }
ACT['bs-color'] = function(el){
  var r = bs_ruleById(el.getAttribute('data-rid')), p = P(el.getAttribute('data-pid')); if(!r || !p) return;
  var cu = bs_cardState(r, p); cu.color = el.getAttribute('data-c'); cu.err = '';
  if(cu.size && stockOf(p.id, cu.color, cu.size)<=0){ cu.err = 'Size '+cu.size+' is sold out in '+COL(cu.color).name+'. Pick another size.'; cu.size = null; }
  rerender();
};
ACT['bs-view'] = function(el){
  var r = bs_ruleById(el.getAttribute('data-rid')), p = P(el.getAttribute('data-pid')); if(!r || !p) return;
  var cu = bs_cardState(r, p), order = ['front','back','detail']; cu.view = order[(order.indexOf(cu.view||'front')+1) % order.length]; rerender();
};
ACT['bs-size'] = function(el){
  var r = bs_ruleById(el.getAttribute('data-rid')), p = P(el.getAttribute('data-pid')); if(!r || !p) return;
  var cu = bs_cardState(r, p); cu.size = el.getAttribute('data-s'); cu.err = ''; rerender();
};
ACT['bs-add'] = function(el){
  var r = bs_ruleById(el.getAttribute('data-rid')), p = P(el.getAttribute('data-pid')); if(!r || !p) return;
  var sel = bs_sel(r), pr = bs_price(r, sel.items), cu = bs_cardState(r, p);
  if(sel.items.length >= pr.max){ bs_toast('Your set is full — remove an item to swap it'); return; }
  if(!cu.size){ cu.err = 'Pick a size first'; rerender(); return; }
  var st = stockOf(p.id, cu.color, cu.size);
  /* R16 (3): what the bag already holds counts too */
  var taken = sel.items.filter(function(it){ return it.product===p.id && it.color===cu.color && it.size===cu.size; }).length + (bagStockUse()[bagSku(p.id, cu.color, cu.size)]||0);
  if(st<=0){ cu.err = 'Size '+cu.size+' is sold out in '+COL(cu.color).name+'.'; rerender(); return; }
  if(taken>=st){ cu.err = 'Only '+st+' left in '+COL(cu.color).name+' · '+cu.size+(taken>sel.items.filter(function(it){ return it.product===p.id && it.color===cu.color && it.size===cu.size; }).length ? ' (some are already in your bag)' : '')+'. Try another colour or size.'; rerender(); return; }
  sel.items.push({k:uid(), product:p.id, color:cu.color, size:cu.size}); cu.err = '';
  rerender();
  var np = bs_price(r, sel.items);
  bs_toast('Added '+p.name+' — '+COL(cu.color).name+' · '+cu.size+(np.next ? ' · '+bs_status(np).sub : (np.applied ? ' · Set price '+fmt(np.price) : '')));
};
ACT['bs-rm'] = function(el){ var s = UI['set:sel']; if(!s) return; var k = el.getAttribute('data-k'); s.items = s.items.filter(function(it){ return it.k!==k; }); rerender(); };
ACT['bs-pick'] = function(){ var g = document.getElementById('bs-grid'); if(g && g.scrollIntoView) g.scrollIntoView({block:'start', behavior:'smooth'}); };
ACT['bs-bag'] = function(el){
  var r = bs_ruleById(el.getAttribute('data-rid')); if(!r) return;
  var sel = bs_sel(r), pr = bs_price(r, sel.items), n = sel.items.length;
  if(n < pr.min){ bs_toast('Pick at least '+pr.min+' items for the set price'); return; }
  /* R16 (2)(3): one tap = one set, and the whole bag's stock is checked */
  var res = bagAdd({kind:'set', source:'custom', refId:r.id, name:'Your set ('+n+' items)', items:sel.items.map(function(it){ return {product:it.product, color:it.color, size:it.size}; }), price:pr.price});
  if(!res.added){ if(res.reason==='stock') bs_toast(res.msg+' Swap that item in your set.'); return; }
  sel.items = [];
  go('#/bag');
  toast('Your set ('+n+' items) is in the bag · '+fmt(pr.price));
};

/* AUTO-FIT (03-layout.js): every size row on the page ends at one size */
fitRule('.bs-card .bs-pills', {min:9.5, group:'bspills'});
