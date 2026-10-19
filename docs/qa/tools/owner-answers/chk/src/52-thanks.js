/* ================= EXTAS demo — Thank you page (52-thanks.js) ================= */
bag_css('css-ty', [
  '.container.ty-hero{max-width:680px;text-align:center;padding-top:32px;padding-bottom:8px}',
  '@media(min-width:1024px){.container.ty-hero{padding-top:48px}}',
  '.ty-check{width:76px;height:76px;border-radius:50%;background:var(--brand);color:var(--brand-ink);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;box-shadow:0 0 0 8px var(--brand-tint)}',
  '.ty-sub{font-size:17px;margin:6px 0 16px;color:var(--text2)}',
  '.ty-ord{display:inline-flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:6px 6px 6px 16px;margin-bottom:12px}',
  '.ty-ord .price{font-size:18px}',
  '.ty-sms{margin:0;line-height:1.5}',
  '.ty-sms svg{display:inline-block;vertical-align:-3px;margin-right:6px}',
  '.ty-wrap{padding-top:20px;padding-bottom:48px}',
  '.ty-cols{display:flex;flex-direction:column;gap:16px}',
  '.ty-col{display:contents}',
  '@media(min-width:1024px){.ty-cols{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:32px;align-items:start}.ty-col{display:flex;flex-direction:column;gap:20px}}',
  '.ty-ic{width:38px;height:38px;border-radius:50%;background:var(--surface);border:1px solid var(--brand-line);color:var(--brand);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}',
  '.ty-pay{padding:16px;gap:12px}',
  '.ty-cred{border:1px solid var(--line);border-radius:var(--radius);background:var(--surface2)}',
  '.ty-credrow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;min-height:48px}',
  '.ty-credrow+.ty-credrow{border-top:1px solid var(--line2)}',
  '.ty-pw{font-family:var(--font-display);letter-spacing:.04em}',
  '.ty-chat{display:flex;flex-direction:column;gap:8px;background:var(--bg);border-radius:var(--radius);padding:14px;margin-top:12px}',
  '.ty-chat .bg-wa{max-width:88%}',
  '.ty-replies{gap:8px;margin-top:2px}',
  '.ty-look{display:flex;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line2)}',
  '.ty-look .co-th{width:60px}',
  '.ty-look .pimg-label{display:none}',
  '.ty-sw{width:22px;height:22px}',
  '.ty-newtot{display:flex;justify-content:space-between;align-items:baseline;background:var(--brand-tint);border:1px solid var(--brand-line);border-radius:var(--radius);padding:12px 14px;margin-top:4px}',
  '.ty-newtot .price{font-size:20px}',
  '.ty-it{display:flex;gap:12px;align-items:center;padding:8px 0}',
  '.ty-it .co-th{width:52px}',
  '.ty-it .pimg-label{display:none}',
  '.ty-r{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:3px 0}',
  '.ty-r.disc{color:var(--brand)}',
  ':root[data-theme="festive"] .ty-r.disc{color:var(--gold)}'
].join('\n'));

var TY_LOOK = ['slim-chino-trousers','leather-look-belt','cotton-socks-3'];

/* ---------- helpers ---------- */
function ty_first(name){ return String(name||'').trim().split(/\s+/)[0] || 'there'; }
function ty_paid(o){ return o.paid!=null ? o.paid : (o.payment==='cod' ? 0 : o.total); }
function ty_due(o){ return o.total - ty_paid(o); }
function ty_payName(o){ return o.payLabel || ({bkash:'bKash', nagad:'Nagad', card:'card', cod:'Cash on Delivery'})[o.payment] || o.payment; }
function ty_range(from, to){
  var a = new Date(from), b = new Date(to);
  if(a.toDateString()===b.toDateString()) return dateStr(from);
  if(a.getMonth()===b.getMonth()) return a.getDate()+'–'+b.getDate()+' '+b.toLocaleDateString('en-GB',{month:'short'});
  return dateStr(from)+' – '+dateStr(to);
}
/* R16. The delivery time is said in HOURS, from the owner's delivery rule
   (zoneHours / deliveryPromise in 02-core.js) — never "1–2 days" here. */
function ty_eta(o){
  var h = zoneHours(o.zone);
  if(!h){ var n0 = String(zoneDays(o.zone)).match(/\d+/g) || ['2'], D = 86400000;
    return ty_range(o.createdAt + Number(n0[0])*D, o.createdAt + Number(n0[n0.length-1])*D); }
  var n = String(h).match(/\d+/g) || ['48'], H = 3600000;
  return 'within '+h+' hours (by '+dateStr(o.createdAt + Number(n[n.length-1])*H)+')';
}

/* ---------- R16 · the shop's messages, in one place ----------
   The shop sends exactly TWO SMS — (1) when the order is placed, (2) when we
   confirm/pack it and book the courier — plus ONE WhatsApp at step (2). The
   courier sends its own tracking SMS. Every sentence the thank-you page says
   about messages lives here so the owner can reword it from the dashboard;
   ST.thanksMsg (if present) overrides any key.
     smsSent      — hero line under the order number. {phone} = customer's number
     smsNext      — the second half of that line (the one more SMS + WhatsApp)
     confirmTitle / confirmNote — timeline step 2 (we confirm and pack)
     courierTitle / courierNote — timeline step 3. {courier} = courier name
     deliveredTitle — timeline step 4 (its note is the delivery time in hours) */
var TY_MSG = {
  smsSent       : 'We\'ve sent your order details by SMS to {phone}.',
  smsNext       : 'You\'ll get one more SMS (and a WhatsApp) when we confirm and pack your order.',
  confirmTitle  : 'We confirm and pack it',
  confirmNote   : 'You get an SMS and a WhatsApp from us.',
  courierTitle  : 'Handed to the courier',
  courierNote   : '{courier} sends the tracking link by SMS.',
  deliveredTitle: 'Delivered'
};
function ty_msg(key, vars){
  var o = (typeof ST!=='undefined' && ST.thanksMsg) || {};
  var s = String(o[key]!=null ? o[key] : (TY_MSG[key]!=null ? TY_MSG[key] : ''));
  return s.replace(/\{(\w+)\}/g, function(m, k){ return vars && vars[k]!=null ? vars[k] : m; });
}
function ty_defSize(p){ var ms = mySizeFor(p); return ms && p.sizes.indexOf(ms)>=0 ? ms : (p.sizes.indexOf('32')>=0 ? '32' : p.sizes[0]); }
/* two-size pairs recorded at checkout (or worked out from the order lines) */
function ty_pairs(o){
  if(o.bracket) return o.bracket;
  var out = [], seen = {}, ls = o.lines.filter(function(l){ return !l.setLabel && !l.addOn; });
  ls.forEach(function(a){ ls.forEach(function(b){
    if(a===b || a.product!==b.product || a.color!==b.color) return;
    var p = P(a.product); if(!p) return; var ia = p.sizes.indexOf(a.size), ib = p.sizes.indexOf(b.size);
    if(Math.abs(ia-ib)===1){ var key = a.product+'|'+a.color+'|'+[a.size,b.size].sort().join('+'); if(!seen[key]){ seen[key] = 1; out.push({key:key, product:a.product, color:a.color, sizes:ia<ib?[a.size,b.size]:[b.size,a.size], ack:''}); } }
  }); });
  return out;
}
function ty_dropLine(o, pid, color, size){
  for(var i=0;i<o.lines.length;i++){
    var l = o.lines[i]; if(l.product!==pid || l.color!==color || l.size!==size || l.setLabel || l.addOn) continue;
    var price = l.unitPrice; if(l.qty>1) l.qty--; else o.lines.splice(i,1);
    o.subtotal -= price; o.total -= price;
    /* an automatic set price that needed this item no longer applies */
    var sd = o.setDiscounts||[];
    for(var j=0;j<sd.length;j++){ var cb = sd[j].auto && sd[j].combo ? COMBO(sd[j].combo) : null;
      if(cb && cb.items.indexOf(pid)>=0){ o.discount -= sd[j].amount; o.total += sd[j].amount; sd.splice(j,1); break; } }
    return price;
  }
  return 0;
}
function ty_blk(order, html){ return html ? '<div style="order:'+order+'">'+html+'</div>' : ''; }

/* ---------- 50. parcel add-ons live in the order's OWN line items ----------
   They used to be kept in a side list (o.addOns) that only this page read, so
   the money moved but the product never showed up on #/order/:id, in My orders
   or on the invoice. An add-on is an order line like any other; it only carries
   `addOn:true` so we can still label it "Added after you ordered" and let the
   customer take it back off while the parcel is open. Appending keeps every
   existing index (reviews, exchanges) pointing at the same line. */
function ty_fixAdds(o){
  if(!o || !o.addOns || !o.addOns.length) return o;
  o.lines = o.lines || [];
  o.addOns.forEach(function(a){
    o.lines.push({product:a.product, color:a.color, size:a.size, qty:a.qty||1, unitPrice:a.unitPrice, addOn:true, addedAt:a.addedAt||Date.now()});
  });
  o.addOns = [];
  return o;
}
function ty_addLines(o){
  var out = [];
  (o.lines||[]).forEach(function(l, i){ if(l.addOn) out.push({l:l, i:i}); });
  return out;
}

/* ---------- blocks ---------- */
function ty_payBox(o){
  if(o.payment==='cod') return '<div class="tint ty-pay row top" data-testid="ty-pay"><span class="ty-ic">'+ico('cash',20)+'</span><div><div class="h3">Cash on Delivery · Total due '+fmt(o.total)+'</div><div class="small text2" style="margin-top:2px">Pay the delivery person when you receive your order.</div></div></div>';
  var due = ty_due(o);
  var extra = due>0 ? '<div class="small text2 mt8"><b>'+fmt(due)+' due on delivery</b> for the items you added.</div>'
            : (due<0 ? '<div class="small text2 mt8">We\'ll refund '+fmt(-due)+' to your '+esc(ty_payName(o))+' for the item you removed.</div>' : '');
  return '<div class="tint ty-pay row top" data-testid="ty-pay"><span class="ty-ic">'+ico('check',20)+'</span><div><div class="h3">Paid '+fmt(ty_paid(o))+' by '+esc(ty_payName(o))+'</div><div class="xs muted" style="margin-top:2px">Demo payment — no real money was taken.</div>'+extra+'</div></div>';
}
function ty_question(o){
  var hasFlag = (o.flags||[]).some(function(f){ return f.indexOf('2 sizes — check')===0; });
  var list = ty_pairs(o).map(function(b, i){ return {b:b, i:i}; }).filter(function(x){ return x.b.ack!=='other'; });
  if(!list.length || (!hasFlag && !list.some(function(x){ return x.b.resolved; }))) return '';
  var first = ty_first(o.name);
  var body = list.map(function(x){
    var b = x.b, p = P(b.product), a = b.sizes[0], c = b.sizes[1];
    var msg = 'Hi '+first+', quick check on order #'+o.id+': You ordered '+p.name+' in '+a+' and '+c+'. Keep both?';
    var h = '<div class="ty-chat"><div class="xs muted row ty-wamark" style="gap:6px">'+waGlyph(13)+'EXTAS · WhatsApp</div><div class="bg-wa">'+esc(msg)+'</div>';
    if(b.resolved){
      var drop = b.resolved===a ? c : a;
      h += '<div class="bg-wa me">'+esc(b.resolved==='both' ? 'Keep both' : 'Only '+b.resolved)+'</div>'+
           '<div class="bg-wa">'+esc(b.resolved==='both' ? 'Thanks! We\'ll pack both sizes.' : 'Done — we removed '+drop+'. Your new total is '+fmt(b.newTotal!=null?b.newTotal:o.total)+'.')+'</div>';
    } else {
      h += '<div class="row wrap ty-replies">'+[['both','Keep both'],[a,'Only '+a],[c,'Only '+c]].map(function(rp){
        return '<button class="btn btn-sm btn-secondary" data-act="ty-brk" data-id="'+esc(o.id)+'" data-i="'+x.i+'" data-v="'+esc(rp[0])+'">'+esc(rp[1])+'</button>'; }).join('')+'</div>';
    }
    return h+'</div>';
  }).join('');
  return '<section class="card p20" data-testid="ty-question"><div class="row" style="gap:10px"><span class="ty-ic ty-ic-wa">'+waGlyph(19)+'</span><div><div class="h3">Quick question on WhatsApp</div>'+
    '<div class="small muted">We sent you this message. Reply on WhatsApp or tap an answer here.</div></div></div>'+body+'</section>';
}
function ty_account(o, u){
  var acc = ST.accounts[o.phone]; if(!acc) return '';
  if(acc.password!==acc.phone) return '<section class="card p20"><div class="row" style="gap:10px"><span class="ty-ic">'+ico('user',19)+'</span><div class="h3">You\'re logged in</div></div>'+
    '<p class="small text2">Track and edit this order from My account.</p><a class="btn btn-secondary btn-block" href="#/account">Go to my account</a></section>';
  var pw = u.showPw ? esc(acc.phone) : new Array(acc.phone.length+1).join('•');
  /* 42. Half the height it was: the explanation is one line instead of three.
     47. And the account always carries an offer, so there is a reason to open it.
     Owner's alignment note: "Log in with", the password and the phone number
     all start on the same line of alignment, in that order, with the same gap
     between them. Nothing else on this page changes. */
  return '<section class="card p20 ty-acc" data-testid="ty-account">'+
    '<div class="row" style="gap:10px"><span class="ty-ic">'+ico('user',19)+'</span><div class="h3">Your account is ready</div></div>'+
    '<div class="ty-cred3 mt12" data-testid="ty-cred">'+
      '<div class="ty-cred3-hd">Log in with</div>'+
      '<div class="ty-crow"><span class="k">Password</span><span class="v"><b class="ty-pw" data-testid="ty-pw">'+pw+'</b>'+
        '<button class="link xs" data-act="ty-pw" data-id="'+esc(o.id)+'" aria-pressed="'+(!!u.showPw)+'">'+(u.showPw?'Hide':'Show')+'</button></span></div>'+
      '<div class="ty-crow"><span class="k">Phone number</span><span class="v"><b>'+esc(acc.phone)+'</b></span></div>'+
    '</div>'+
    '<p class="xs text2 ty-accnote">Your password is your phone number — change it anytime.</p>'+
    ty_offerBanner()+
    '<a class="btn btn-secondary btn-block mt12" href="#/account">Go to my account</a></section>';
}
/* 47+51. The offer-and-wallet strip the owner liked. It is never empty: when
   there is no wallet credit it falls back to the customer's own offer, and
   failing that to the standing member offer. One function, two sizes — the
   thank-you page gets the small inline strip, My account gets the big banner,
   so there is only ever one place to change the wording. */
function ty_offerLines(acc, skipWallet){
  acc = acc || currentAccount();
  var out = [], w = acc && acc.wallet ? acc.wallet : 0;
  if(w > 0 && !skipWallet) out.push({icon:'wallet', title:fmt(w)+' in your wallet', note:'Comes off your total automatically at checkout.'});
  var offs = (acc && acc.offers) || [];
  offs.slice(0, 2).forEach(function(o){
    out.push({icon:o.pct ? 'tag' : 'gift', title:o.title, note:o.note || 'Applied automatically at checkout.', code:o.code || ''});
  });
  /* never empty */
  if(!out.length) out.push({icon:'gift', title:'Member price on your next order', note:'Your offers and saved sizes live in My account.'});
  return out;
}
function ty_offerBanner(opts){
  opts = opts || {};
  var lines = ty_offerLines(opts.acc), one = lines[0];
  if(!opts.big){
    return '<div class="ty-offer"><span class="ic">'+ico(one.icon,17)+'</span>'+
      '<span><b>'+esc(one.title)+'</b><span>'+esc(one.note)+'</span></span></div>';
  }
  /* big: the account-page banner — every offer plus the wallet, in one card */
  var acc = opts.acc || currentAccount(), w = (acc && acc.wallet) || 0;
  lines = ty_offerLines(acc, true);          /* the wallet has its own big figure above */
  return '<section class="acc-ob" data-testid="acc-offerbanner" aria-label="Your offers and wallet">'+
    '<div class="acc-ob-hd"><span class="acc-ob-eb">'+ico('spark',14)+'Members only</span>'+
      '<a class="acc-ob-all" href="#/account/foryou">See all'+ico('right',14)+'</a></div>'+
    '<div class="acc-ob-wal"><span class="k">Wallet balance</span><b class="v" data-testid="acc-ob-wallet">'+fmt(w)+'</b>'+
      '<span class="s">'+(w>0 ? 'Used automatically on your next order' : 'Credit lands here after a size exchange')+'</span></div>'+
    '<div class="acc-ob-list">'+lines.map(function(x){
      return '<div class="acc-ob-row"><span class="ic">'+ico(x.icon,17)+'</span><span class="tx"><b>'+esc(x.title)+'</b><span>'+esc(x.note)+'</span></span>'+
        (x.code ? '<span class="acc-ob-code">'+esc(x.code)+'</span>' : '')+'</div>';
    }).join('')+'</div>'+
    '<a class="btn acc-ob-cta" href="#/c/new">'+esc(t('Shop now'))+ico('right',16)+'</a>'+
  '</section>';
}
function ty_timeline(o){
  var idx = Math.max(0, STATUS_FLOW.indexOf(o.status));
  var ago = timeAgo(o.createdAt); ago = ago.charAt(0).toUpperCase()+ago.slice(1);
  var steps = [
    {t:'Order confirmed', d:ago+' · '+dateTimeStr(o.createdAt), done:true},
    {t:ty_msg('confirmTitle'), d:esc(ty_msg('confirmNote')), done:idx>=1},
    {t:ty_msg('courierTitle'), d:esc(ty_msg('courierNote', {courier:o.courier||'The courier'})), done:idx>=2},
    {t:ty_msg('deliveredTitle'), d:esc(ty_eta(o).charAt(0).toUpperCase()+ty_eta(o).slice(1)), done:idx>=3}
  ];
  var now = -1; steps.forEach(function(s, i){ if(now<0 && !s.done) now = i; });
  var h = steps.map(function(s, i){
    var last = i===steps.length-1;
    return '<div class="tl-step"><div style="display:flex;flex-direction:column;align-items:center"><div class="tl-dot'+(s.done?' done':(i===now?' now':''))+'">'+(s.done?ico('check',13):(i+1))+'</div>'+(last?'':'<div class="tl-line'+(s.done?' done':'')+'"></div>')+'</div>'+
      '<div style="padding-bottom:'+(last?0:16)+'px"><div class="h3">'+esc(s.t)+'</div><div class="small muted">'+s.d+'</div></div></div>';
  }).join('');
  if(!SHOW('thanks','nextSteps')) return '';
  return '<section class="card p20" data-testid="ty-timeline"><div class="h3" style="margin-bottom:14px">What happens next</div><div class="tl">'+h+'</div></section>';
}
function ty_items(o){
  var row = function(l){
    var p = P(l.product); if(!p) return '';
    return '<div class="ty-it"'+(l.addOn?' data-testid="ty-addline"':'')+'><div class="co-th">'+bag_img(p, l.color, {ratio:'ratio-11', label:false})+'</div><div class="grow" style="min-width:0"><div class="small bold">'+esc(p.name)+
      (l.addOn ? ' <span class="tag">'+ico('plus',12)+'Added</span>' : (l.setLabel ? ' <span class="tag plain">'+esc(l.setLabel)+'</span>' : ''))+'</div><div class="xs muted">'+esc(COL(l.color).name)+' · '+esc(l.size)+(l.qty>1?' · ×'+l.qty:'')+'</div></div>'+
      '<div class="small price">'+fmt(l.unitPrice*(l.qty||1))+'</div></div>';
  };
  var r = function(k, v, cls){ return '<div class="ty-r'+(cls?' '+cls:'')+'"><span>'+k+'</span><span>'+v+'</span></div>'; };
  var rows = r('Subtotal', fmt(o.subtotal)), known = 0;
  (o.setDiscounts||[]).forEach(function(d){ known += d.amount; rows += r(esc(d.label), fmt(-d.amount), 'disc'); });
  if(o.offer){ known += o.offer.amount; rows += r(esc(o.offer.label), fmt(-o.offer.amount), 'disc'); }
  if(o.walletUsed){ known += o.walletUsed; rows += r('Wallet', fmt(-o.walletUsed), 'disc'); }
  if((o.discount||0) - known > 0) rows += r('Discount', fmt(-(o.discount-known)), 'disc');
  /* 36. A free delivery is a badge, never a struck-out charge. */
  rows += r('Delivery', o.delivery ? fmt(o.delivery) : '<span class="bg-freeb">'+ico('check',13)+'FREE</span>');
  return '<section class="card p20" data-testid="ty-items"><div class="row between"><div class="h3">Your order</div><span class="xs muted">'+esc(o.address||'')+'</span></div><div class="mt8">'+
    o.lines.map(row).join('')+'</div>'+
    '<div style="border-top:1px solid var(--line2);margin-top:6px;padding-top:8px">'+rows+'</div>'+
    '<div class="ty-r ty-tot"><span>Total</span><span class="price">'+fmt(o.total)+'</span></div>'+
    /* 37. The return note, directly under the delivery line — the owner's
       ruling is that it belongs here and in My account, not on checkout. */
    bag_returnNote('ty-ret')+
    (SHOW('account','invoices') ? '<button type="button" class="btn btn-secondary btn-block mt12 inv-btn" data-act="inv-open" data-id="'+esc(o.id)+'">'+ico('doc',16)+'Invoice · print or download</button>' : '')+
    '</section>';
}
function ty_look(o, u){
  var open = o.status==='confirmed', adds = ty_addLines(o);
  if(!open && !adds.length) return '';
  var rows = TY_LOOK.map(P).filter(Boolean).map(function(p){
    /* an add-on is a real order line now, so "already in your order" has to
       ignore the lines that were added from this very block */
    var inOrder = o.lines.some(function(l){ return l.product===p.id && !l.addOn; });
    var added = adds.filter(function(x){ return x.l.product===p.id; }).map(function(x){ return {a:x.l, i:x.i}; });
    var multi = p.sizes.length>1, color = multi ? (u.chinoColor||p.colors[0]) : p.colors[0], size = multi ? (u.chinoSize||ty_defSize(p)) : p.sizes[0];
    var extra = '';
    if(added.length) extra = '<div class="xs muted">'+esc(COL(added[0].a.color).name)+' · '+esc(added[0].a.size)+'</div>';
    else if(multi && open && !inOrder){
      extra = '<div class="row wrap mt8" style="gap:8px">'+p.colors.map(function(cid){ return '<button class="swatch ty-sw'+(cid===color?' on':'')+'" style="background:'+COL(cid).hex+'" data-act="ty-chcol" data-id="'+esc(o.id)+'" data-c="'+cid+'" aria-label="'+esc(COL(cid).name)+'" aria-pressed="'+(cid===color)+'"></button>'; }).join('')+
        '<label class="sr" for="ty-waist">Waist size</label><select id="ty-waist" class="input" data-change="ty-waist" data-id="'+esc(o.id)+'" style="width:auto;padding:5px 8px;font-size:13px">'+p.sizes.map(function(s){ return '<option'+(s===size?' selected':'')+'>'+s+'</option>'; }).join('')+'</select></div>';
    }
    var act;
    if(added.length) act = '<div style="text-align:right"><span class="tag">'+ico('check',12)+'Added</span>'+(open?'<div><button class="link" data-act="ty-addrm" data-id="'+esc(o.id)+'" data-i="'+added[0].i+'">Remove</button></div>':'')+'</div>';
    else if(inOrder) act = '<span class="tag plain">In your order</span>';
    else if(open) act = '<button class="btn btn-secondary btn-sm" data-act="ty-add" data-id="'+esc(o.id)+'" data-p="'+p.id+'">'+ico('plus',15)+'Add</button>';
    else act = '';
    return '<div class="ty-look"><a class="co-th" href="#/p/'+p.id+'">'+bag_img(p, color, {ratio:'ratio-11', label:false})+'</a><div class="grow" style="min-width:0"><div class="small bold">'+esc(p.name)+'</div><div class="small price">'+fmt(p.price)+'</div>'+extra+'</div><div class="shrink0">'+act+'</div></div>';
  }).join('');
  var tot = '';
  if(adds.length){
    if(o.payment==='cod') tot = '<div class="ty-newtot" data-testid="ty-newtot"><span class="small bold">New total due</span><span class="price">'+fmt(o.total)+'</span></div>';
    else { var due = ty_due(o);
      tot = '<div class="ty-newtot" data-testid="ty-newtot"><span><span class="small bold">New order total</span><br><span class="xs muted">'+(due>0 ? fmt(due)+' due on delivery' : (due<0 ? 'Already paid — we\'ll refund '+fmt(-due) : 'Already paid'))+'</span></span><span class="price">'+fmt(o.total)+'</span></div>'; }
  }
  return '<section class="card p20" data-testid="ty-look"><div class="h3">Complete your look</div>'+
    '<div class="row wrap mt8" style="gap:6px"><span class="tag">'+ico('box',12)+'Same parcel · no extra delivery</span><span class="tag plain">'+ico('clock',12)+'Until we pack it</span></div>'+
    '<div class="mt12">'+rows+'</div>'+tot+'</section>';
}

/* ---------- page ---------- */
function ty_render(params){
  var id = params[0], o = ty_fixAdds(ST.orders[id]);
  if(!o) return '<div class="container co-wrap"><div class="card center co-empty"><h1 class="h1">Order not found</h1><p class="text2">We couldn\'t find order '+esc(id)+' in this demo.</p><a class="btn btn-primary mt16" href="#/">Go to home</a></div></div>';
  var u = ui('thanks:'+id, {showPw:false, chinoColor:'', chinoSize:''});
  var ph = checkPhone(o.phone), nice = ph.nice || o.phone;
  var hero = '<section class="container ty-hero"><div class="ty-check">'+ico('check',38)+'</div>'+
    '<h1 class="h1">Thank you, '+esc(ty_first(o.name))+'!</h1><p class="ty-sub">Your order is confirmed.</p>'+
    /* R16. The delivery time for THIS order's band, as a proper headline */
    '<div class="ty-eta" data-testid="ty-eta"><span class="ty-eta-ic">'+ico('truck',22)+'</span>'+
      '<span class="ty-eta-tx"><h2 class="ty-eta-t">'+esc(deliveryPromise(o.zone))+'</h2>'+
      '<span class="ty-eta-z">'+esc(zoneName(o.zone))+(o.courier ? ' · '+esc(o.courier) : '')+'</span></span></div>'+
    '<div class="ty-ordrow">'+
      '<div class="ty-ord"><span class="small muted">Order number</span><b class="price" data-testid="ty-id">#'+esc(o.id)+'</b>'+
        '<button class="btn btn-ghost btn-sm" data-act="ty-copy" data-id="'+esc(o.id)+'">Copy</button></div>'+
      '<a class="btn btn-primary ty-track" href="#/order/'+esc(o.id)+'?from=thanks">'+ico('truck',19)+'Track your order</a>'+
    '</div>'+
    '<p class="small muted ty-sms" data-testid="ty-sms">'+ico('chat',16)+'<span>'+
      esc(ty_msg('smsSent', {phone:'\u0000'})).replace('\u0000', '<b class="text2" style="white-space:nowrap">'+esc(nice)+'</b>')+' '+esc(ty_msg('smsNext'))+'</span></p>'+
  '</section>';
  var edit = '<div class="soft p16 small text2 row top" style="gap:10px"><span class="brandc">'+ico('edit',18)+'</span><div>Need to change something? Log in and edit your order from <a href="#/account/orders">My orders</a> until we start processing it — up to '+esc(SET('order-edit','maxEdits'))+' times.</div></div>';
  /* 46. The right column finishes on the WhatsApp line. "Keep shopping" and
     "Order details" belong under the left column, after the things we would
     rather the customer looked at first. */
  /* 49. Full width, like every other call to action on this page. */
  var acts = co_waBtn('Questions? Message us on WhatsApp', 'Hi EXTAS, about my order #'+o.id, 'btn-block ty-wa');
  var endBtns = '<div class="ty-endbtns">'+
    (SHOW('account','invoices') ? '<button type="button" class="btn btn-ghost btn-block" data-act="inv-open" data-id="'+esc(o.id)+'">'+ico('doc',16)+'Invoice</button>' : '<a class="btn btn-ghost btn-block" href="#/">Keep shopping</a>')+
    '<a class="btn btn-primary btn-block" href="#/order/'+esc(o.id)+'">Order details</a>'+
    (SHOW('account','invoices') ? '<a class="btn btn-ghost btn-block ty-keep" href="#/">Keep shopping</a>' : '')+'</div>';
  var ups = '<div class="ty-ups">'+upsellBlock('thanks')+'</div>';
  return hero+'<div class="container ty-wrap"><div class="ty-cols">'+
    '<div class="ty-col">'+ty_blk(1, ty_payBox(o))+ty_blk(2, ty_question(o))+ty_blk(5, ty_timeline(o))+
      ty_blk(6, ty_items(o))+ty_blk(7, edit)+ty_blk(9, ups)+ty_blk(10, endBtns)+'</div>'+
    '<div class="ty-col">'+ty_blk(3, ty_account(o, u))+ty_blk(4, ty_look(o, u))+ty_blk(8, acts)+'</div>'+
  '</div></div>';
}
/* Every sliding row on the site glides instead of jumping. The thank-you page
   has one: the "Add to this parcel" row from the shared upsell block, which
   carries no id of its own, so the page names it after render. */
function ty_after(){
  if(typeof SMOOTH === 'undefined') return;
  SMOOTH.stopAll();                               /* every render rebuilds the DOM */
  var row = document.querySelector('.ty-ups .ups-row');
  if(row){ row.id = 'ty-upsrow'; SMOOTH.start('ty-upsrow', {dir:-1, speed:20}); }
}
PAGES.thanks = { layout:'checkout', title:function(params){ return ST.orders[params && params[0]] ? 'Order confirmed' : 'Order not found'; }, render:ty_render, after:ty_after };

/* ---------- actions ---------- */
ACT['ty-copy'] = function(el){
  var id = el.getAttribute('data-id');
  try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(id).catch(function(){}); }catch(e){}
  toast('Order number '+id+' copied');
};
ACT['ty-pw'] = function(el){ var u = ui('thanks:'+el.getAttribute('data-id'), {}); u.showPw = !u.showPw; rerender(); };
ACT['ty-brk'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')]; if(!o) return;
  if(!o.bracket) o.bracket = ty_pairs(o);
  var b = o.bracket[Number(el.getAttribute('data-i'))]; if(!b || b.resolved) return;
  var v = el.getAttribute('data-v'), drop = null;
  if(v!=='both'){ drop = b.sizes[0]===v ? b.sizes[1] : b.sizes[0]; ty_dropLine(o, b.product, b.color, drop); }
  b.resolved = v; b.newTotal = o.total;
  for(var i=0;i<o.flags.length;i++) if(o.flags[i].indexOf('2 sizes — check')===0){ o.flags.splice(i,1); break; }
  saveState(); rerender();
  toast(v==='both' ? 'Thanks — we\'ll pack both sizes' : 'Done — '+drop+' removed. New total '+fmt(o.total));
};
ACT['ty-chcol'] = function(el){ var u = ui('thanks:'+el.getAttribute('data-id'), {}); u.chinoColor = el.getAttribute('data-c'); rerender(); };
CHANGE['ty-waist'] = function(el){ var u = ui('thanks:'+el.getAttribute('data-id'), {}); u.chinoSize = el.value; };
/* 50. The add writes a real order LINE. That is the whole fix: every place the
   order is rendered — this page, #/order/:id, My orders, the invoice — reads
   o.lines, so the product now shows up in all of them, not just the total. */
ACT['ty-add'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')], p = P(el.getAttribute('data-p')); if(!o || !p) return;
  if(o.status!=='confirmed'){ toast('Already packed — add-ons are closed'); return; }
  ty_fixAdds(o);
  var u = ui('thanks:'+o.id, {}), multi = p.sizes.length>1;
  var color = multi ? (u.chinoColor||p.colors[0]) : p.colors[0], size = multi ? (u.chinoSize||ty_defSize(p)) : p.sizes[0];
  o.lines.push({product:p.id, color:color, size:size, qty:1, unitPrice:p.price, addOn:true, addedAt:Date.now()});
  o.subtotal += p.price; o.total += p.price; saveState(); rerender();
  toast(p.name+' added to order #'+o.id+' · '+(o.payment==='cod' ? 'New total due '+fmt(o.total) : 'New order total '+fmt(o.total)));
};
ACT['ty-addrm'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')]; if(!o) return;
  ty_fixAdds(o);
  var i = Number(el.getAttribute('data-i')), l = o.lines[i];
  if(!l || !l.addOn) return;                       /* never let this touch an original line */
  o.lines.splice(i, 1);
  o.subtotal -= l.unitPrice*(l.qty||1); o.total -= l.unitPrice*(l.qty||1);
  saveState(); rerender(); toast('Removed from your order');
};

/* ================= 53. INVOICE — generate, show, print, download =================
   Built from the order's REAL line items, so an item added to the parcel after
   checkout appears here too (that is the same fix as 50). No library and no
   server: the invoice is one self-contained HTML document (inv_doc), and the
   SAME markup is drawn straight into the page's sheet (inv_modalHTML) so the
   customer always SEES it. Behind SHOW('account','invoices').

   R16 · why "Get invoice" looked dead on a phone: the sheet only showed the
   invoice inside a nested srcdoc <iframe>, and both buttons then relied on
   things a phone / a shared (sandboxed) demo page silently refuses —
   iframe.print() is ignored without a word ("allow-modals" not set, or iOS
   not printing frames) and a.download is dropped, while the toast still said
   "downloaded". Now: the invoice is drawn inline in the sheet (no frame to go
   blank), the open is wrapped so a bad order can never leave the tap silent,
   the action bar is pinned to the bottom of the sheet, and if no print
   dialog actually appears the sheet says so and points at Download.

   ---------------------------------------------------------------------------
   INVOICE_TPL — every word and every block of the invoice. Nothing visible on
   the invoice is written anywhere else. The dashboard saves edits to
   ST.invoiceTpl, which overrides this object KEY BY KEY (inside labels / show /
   shop / methods too; arrays such as shopLines, notes and footer are replaced
   whole). Text is plain text (it is escaped); {placeholders} are filled in:
     {invoiceNo} {orderId} {date} {name} {phone} {address} {courier} {tracking}
     {units} {itemWord} {size} {colour} {total} {paid} {due} {refund} {method}
     {shopName} {tagline} {shopAddress} {shopPhone} {shopEmail} {whatsapp}
     {hotline} {bin} {tradeLicence} {binLabel} {tradeLabel} {exchangeHours}
     {noReturn}
   A line whose placeholders are ALL empty is skipped, so an empty shop field
   simply disappears instead of printing "BIN: ".

   shop      — the seller's own details. Sold to other shops, so nothing here
               is hard-wired: empty = not shown. whatsapp/hotline fall back to
               the store's contact settings (DB.whatsapp / DB.hotline).
               logoUrl: an image to use instead of the name as wordmark.
   labels    — every caption: title, column heads, totals, payment sentences.
   methods   — payment method names by code (cod, bkash, nagad, card …).
   shopLines — the small lines under the logo (tagline, contacts, address).
   notes     — extra lines shown in a box above the footer (empty by default).
   returnNote— the exchange/return sentence printed in the footer.
   footer    — the footer lines; '{returnNote}' on its own pulls in returnNote.
   show      — on/off for each block: logo, shopDetails, invoiceNo, orderNo,
               date, customer, address, courier, colNo, colQty, colUnit,
               colAmount, variant (colour · size under the item), pills
               (added / set tags), payment, notes, returnNote, footer.
   --------------------------------------------------------------------------- */
var INVOICE_TPL = {
  shop: {
    name: 'EXTAS', tagline: 'Menswear · Made in Bangladesh', logoUrl: '',
    address: '', phone: '', email: '', whatsapp: '', hotline: '',
    bin: '', tradeLicence: ''      /* empty = read from the shop settings (SITE) */
  },
  labels: {
    docTitle: 'Invoice {invoiceNo} · {shopName}',
    title: 'INVOICE', invoiceNo: '{invoiceNo}', orderNo: 'Order #{orderId}', date: '{date}',
    billTo: 'Billed to', address: 'Delivery address', courier: 'Courier', tracking: 'Tracking {tracking}',
    colNo: '#', colItem: 'Item', colQty: 'Qty', colUnit: 'Unit', colAmount: 'Amount',
    variant: '{colour} · Size {size}', addedPill: 'added to parcel',
    subtotal: 'Subtotal ({units} {itemWord})', itemOne: 'item', itemMany: 'items',
    offers: 'Offers & codes', wallet: 'Wallet credit', delivery: 'Delivery', free: 'Free', total: 'Total',
    payment: 'Payment · {method}',
    codPaid: 'Paid in cash on delivery.', codDue: 'Pay {total} in cash when the parcel reaches you.',
    paidOnline: 'Paid {paid} online', dueAdded: ' · {due} due on delivery for items added after checkout',
    refund: ' · {refund} to be refunded',
    binLabel: 'DBID', tradeLabel: 'Trade licence'
  },
  methods: { cod: 'Cash on Delivery', bkash: 'bKash', nagad: 'Nagad', card: 'Card' },
  shopLines: ['{tagline}', 'WhatsApp {whatsapp} · Hotline {hotline}', '{shopAddress}', '{shopPhone} · {shopEmail}'],
  notes: [],
  returnNote: 'Size exchange within {exchangeHours} hours of delivery, unworn and with the tags on. {noReturn}.',
  footer: [
    '{shopName} · {binLabel}: {bin} · {tradeLabel}: {tradeLicence}',
    '{returnNote}',
    'This is a demo store — no real money was taken. Computer-generated invoice, no signature needed.'
  ],
  show: {
    logo: true, shopDetails: true, invoiceNo: true, orderNo: true, date: true,
    customer: true, address: true, courier: true,
    colNo: true, colQty: true, colUnit: true, colAmount: true, variant: true, pills: true,
    payment: true, notes: true, returnNote: true, footer: true
  }
};
/* defaults + ST.invoiceTpl, merged key by key (one level into each group) */
function inv_tpl(){
  var over = (typeof ST!=='undefined' && ST.invoiceTpl) || {}, out = {};
  Object.keys(INVOICE_TPL).forEach(function(k){
    var d = INVOICE_TPL[k], v = over[k];
    if(d && typeof d==='object' && !Array.isArray(d)){
      out[k] = {}; Object.keys(d).forEach(function(x){ out[k][x] = d[x]; });
      if(v && typeof v==='object' && !Array.isArray(v)) Object.keys(v).forEach(function(x){ out[k][x] = v[x]; });
    } else out[k] = (v!==undefined ? v : d);
  });
  Object.keys(over).forEach(function(k){ if(!(k in out)) out[k] = over[k]; });
  return out;
}
/* fill {placeholders}. A line is read as parts split by " · "; a part whose
   placeholders are all empty is dropped (so "BIN: {bin}" vanishes when there
   is no BIN), and a line with nothing left returns null = not printed. */
function inv_fill(s, vars, keepEmpty){
  var parts = String(s==null ? '' : s).split(' · '), had = false;
  var out = parts.map(function(part){
    var any = false, filled = false;
    var r = part.replace(/\{(\w+)\}/g, function(m, k){
      any = true; var v = vars[k]; if(v!=null && v!=='') filled = true; return v==null ? '' : String(v); });
    if(any) had = true;
    return (any && !filled && !keepEmpty) ? null : r;
  }).filter(function(x){ return x!==null; });
  if(!out.length && had) return null;
  return out.join(' · ');
}
function inv_no(o){ return 'INV-'+String(o.id).replace(/^EX-/, ''); }
function inv_vars(o, T){
  var s = T.shop || {}, units = (o.lines||[]).reduce(function(n,l){ return n + (l.qty||1); }, 0);
  var paid = ty_paid(o), due = o.total - paid, L = T.labels;
  return {
    invoiceNo: inv_no(o), orderId: o.id, date: dateTimeStr(o.createdAt), name: o.name,
    phone: (typeof acc_nicePhone==='function' ? acc_nicePhone(o.phone) : o.phone), address: o.address || '—',
    courier: o.courier || '—', tracking: o.tracking || '—',
    units: units, itemWord: units===1 ? L.itemOne : L.itemMany,
    total: fmt(o.total), paid: fmt(paid), due: fmt(Math.max(0, due)), refund: fmt(Math.max(0, -due)),
    method: (T.methods && T.methods[o.payment]) || o.payLabel || o.payment || '',
    shopName: s.name, tagline: s.tagline, shopAddress: s.address, shopPhone: s.phone, shopEmail: s.email,
    whatsapp: s.whatsapp || DB.whatsapp || '', hotline: s.hotline || DB.hotline || '',
    bin: s.bin || SITE('dbid') || '', tradeLicence: s.tradeLicence || SITE('tradeLicence') || '',
    binLabel: (s.bin || SITE('dbid')) ? L.binLabel : '', tradeLabel: (s.tradeLicence || SITE('tradeLicence')) ? L.tradeLabel : '',
    exchangeHours: SET('exchange','windowHours'), noReturn: ruleText('no-return','short')
  };
}
/* The invoice's styles, written once. '@R' is the root (body in the file,
   .inv-doc in the sheet) and '@ ' prefixes every other rule, so the same look
   is used in the downloaded file and in the page without leaking either way. */
var INV_CSS = [
  '@ *{box-sizing:border-box}',
  '@R{margin:0;padding:24px;background:#F4F3F0;color:#171715;text-align:left;'+
    "font:14px/1.5 'Instrument Sans',system-ui,-apple-system,'Segoe UI',sans-serif}",
  '@ .sheet{max-width:760px;margin:0 auto;background:#fff;border:1px solid #E6E3DE;padding:28px}',
  '@ .top{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;border-bottom:2px solid #171715;padding-bottom:16px}',
  '@ .brand{font:800 26px/1 Archivo,system-ui,sans-serif;letter-spacing:.14em;color:#171715}',
  '@ .brand img{display:block;max-height:44px;max-width:200px}',
  "@ .brand small{display:block;font-size:11.5px;font-weight:500;line-height:1.5;letter-spacing:.03em;font-family:'Instrument Sans',system-ui,sans-serif;color:#54504A;margin-top:8px}",
  '@ .tt{text-align:right}',
  '@ .tt h1{font:800 19px/1.2 Archivo,system-ui,sans-serif;margin:0 0 5px;letter-spacing:normal;color:#171715}',
  '@ .tt div{font-size:12.5px;color:#54504A}',
  '@ .cols{display:flex;gap:28px;flex-wrap:wrap;margin:18px 0 4px}',
  '@ .cols>div{flex:1 1 210px;min-width:0}',
  '@ .lbl{font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#6E675E;margin-bottom:4px}',
  '@ table{width:100%;border-collapse:collapse;margin-top:16px;background:none}',
  '@ th{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#6E675E;text-align:left;font-weight:700;border-bottom:1px solid #D8D4CD;padding:0 8px 7px;background:none}',
  '@ td{padding:10px 8px;border-bottom:1px solid #EFEDE8;vertical-align:top;color:#171715;background:none}',
  '@ td.n,@ th.n{text-align:center;width:34px}',
  '@ td.r,@ th.r{text-align:right;white-space:nowrap}',
  '@ .sub{font-size:12px;color:#54504A;margin-top:2px}',
  '@ .pill{display:inline-block;font-size:10.5px;font-weight:700;border:1px solid #D5E1DC;background:#EEF3F1;color:#1F4E46;border-radius:3px;padding:1px 6px;vertical-align:1px}',
  '@ .sum{margin-left:auto;margin-top:14px;width:290px;max-width:100%}',
  '@ .sum td{border:0;padding:4px 0;font-size:13.5px}',
  '@ .sum tr.tot td{border-top:2px solid #171715;padding-top:10px;font:800 18px/1.2 Archivo,system-ui,sans-serif}',
  '@ .pay{margin-top:18px;border:1px solid #E6E3DE;background:#FAFAF8;padding:12px 14px;font-size:13px}',
  '@ .notes{margin-top:14px;font-size:12.5px;color:#54504A}',
  '@ .foot{margin-top:22px;border-top:1px solid #E6E3DE;padding-top:12px;font-size:11.5px;color:#6E675E;line-height:1.6}',
  '@media(max-width:560px){@R{padding:10px}@ .sheet{padding:16px}'+
    '@ .brand{font-size:21px}@ .tt{text-align:left}@ .top{flex-direction:column;gap:10px}'+
    '@ .cols{gap:14px;margin-top:14px}@ .cols>div{flex:1 1 100%}'+
    '@ th,@ td{padding-left:0;padding-right:6px}@ td.r,@ th.r{padding-left:8px;padding-right:0}'+
    '@ td.n,@ th.n{width:22px}@ .sum{width:100%}}',
  '@media print{@R{background:#fff;padding:0}@ .sheet{border:0;max-width:none;padding:14mm}}'
].join('\n');
function inv_css(root, pre){ return INV_CSS.replace(/@R/g, root).replace(/@ /g, pre); }
/* the invoice sheet itself (no <html>, no styles) */
function inv_sheet(o, T){
  T = T || inv_tpl();
  var L = T.labels, S = T.show || {}, V = inv_vars(o, T), shop = T.shop || {};
  var F = function(s, extra, keep){ var v = V; if(extra){ v = {}; Object.keys(V).forEach(function(k){ v[k] = V[k]; }); Object.keys(extra).forEach(function(k){ v[k] = extra[k]; }); }
    var r = inv_fill(s, v, keep); return r==null ? '' : r; };
  var E = function(s, extra){ return esc(F(s, extra, true)); };
  var lines = function(arr, extra){ return (arr||[]).map(function(s){ return F(s, extra); }).filter(function(s){ return s!==''; }); };
  /* header */
  var brand = '';
  if(S.logo!==false) brand += shop.logoUrl ? '<img src="'+esc(shop.logoUrl)+'" alt="'+esc(shop.name||'')+'">' : esc(shop.name||'');
  if(S.shopDetails!==false){ var sl = lines(T.shopLines); if(sl.length) brand += '<small>'+sl.map(esc).join('<br>')+'</small>'; }
  var tt = '<h1>'+E(L.title)+'</h1>'+
    (S.invoiceNo!==false ? '<div>'+E(L.invoiceNo)+'</div>' : '')+
    (S.orderNo!==false ? '<div>'+E(L.orderNo)+'</div>' : '')+
    (S.date!==false ? '<div>'+E(L.date)+'</div>' : '');
  var cols = (S.customer!==false ? '<div><div class="lbl">'+E(L.billTo)+'</div><b>'+esc(o.name)+'</b><div class="sub">'+esc(V.phone)+'</div></div>' : '')+
    (S.address!==false ? '<div><div class="lbl">'+E(L.address)+'</div><div>'+esc(V.address)+'</div></div>' : '')+
    (S.courier!==false ? '<div><div class="lbl">'+E(L.courier)+'</div><div>'+esc(V.courier)+'</div><div class="sub">'+E(L.tracking)+'</div></div>' : '');
  /* items */
  var head = '<tr>'+(S.colNo!==false ? '<th class="n">'+E(L.colNo)+'</th>' : '')+'<th>'+E(L.colItem)+'</th>'+
    (S.colQty!==false ? '<th class="n">'+E(L.colQty)+'</th>' : '')+(S.colUnit!==false ? '<th class="r">'+E(L.colUnit)+'</th>' : '')+
    (S.colAmount!==false ? '<th class="r">'+E(L.colAmount)+'</th>' : '')+'</tr>';
  var rows = (o.lines||[]).map(function(l, i){
    var p = P(l.product), q = l.qty || 1, c = COL(l.color);
    var pill = S.pills===false ? '' : (l.addOn ? ' <span class="pill">'+E(L.addedPill)+'</span>' : (l.setLabel ? ' <span class="pill">'+esc(l.setLabel)+'</span>' : ''));
    return '<tr>'+(S.colNo!==false ? '<td class="n">'+(i+1)+'</td>' : '')+'<td><b>'+esc(p ? p.name : l.product)+'</b>'+pill+
      (S.variant!==false ? '<div class="sub">'+E(L.variant, {colour:c ? c.name : l.color, size:l.size})+'</div>' : '')+'</td>'+
      (S.colQty!==false ? '<td class="n">'+q+'</td>' : '')+(S.colUnit!==false ? '<td class="r">'+esc(fmt(l.unitPrice))+'</td>' : '')+
      (S.colAmount!==false ? '<td class="r"><b>'+esc(fmt(l.unitPrice*q))+'</b></td>' : '')+'</tr>';
  }).join('');
  /* totals */
  var setSum = (o.setDiscounts||[]).reduce(function(s,d){ return s + d.amount; }, 0);
  var other = Math.max(0, (o.discount||0) - setSum);
  var tr = function(k, v, cls){ return '<tr'+(cls?' class="'+cls+'"':'')+'><td>'+k+'</td><td class="r">'+v+'</td></tr>'; };
  var sum = tr(E(L.subtotal), esc(fmt(o.subtotal)));
  (o.setDiscounts||[]).forEach(function(d){ sum += tr(esc(d.label), '−'+esc(fmt(d.amount))); });
  if(other) sum += tr(E(L.offers), '−'+esc(fmt(other)));
  if(o.walletUsed) sum += tr(E(L.wallet), '−'+esc(fmt(o.walletUsed)));
  sum += tr(E(L.delivery), o.delivery ? esc(fmt(o.delivery)) : E(L.free));
  sum += tr(E(L.total), esc(fmt(o.total)), 'tot');
  /* payment */
  var paid = ty_paid(o), due = o.total - paid;
  var payTx = o.payment==='cod'
    ? (o.status==='delivered' ? E(L.codPaid) : E(L.codDue))
    : E(L.paidOnline)+(due>0 ? E(L.dueAdded) : (due<0 ? E(L.refund) : ''));
  /* notes + footer */
  var notes = S.notes!==false ? lines(T.notes) : [];
  var ret = S.returnNote!==false ? F(T.returnNote) : '';
  var foot = S.footer!==false ? (T.footer||[]).map(function(s){ return String(s).trim()==='{returnNote}' ? ret : F(s); }).filter(function(s){ return s!==''; }) : [];
  return '<div class="sheet">'+
    '<div class="top"><div class="brand">'+brand+'</div><div class="tt">'+tt+'</div></div>'+
    (cols ? '<div class="cols">'+cols+'</div>' : '')+
    '<table><thead>'+head+'</thead><tbody>'+rows+'</tbody></table>'+
    '<table class="sum">'+sum+'</table>'+
    (S.payment!==false ? '<div class="pay"><b>'+E(L.payment)+'</b><br>'+payTx+'</div>' : '')+
    (notes.length ? '<div class="notes">'+notes.map(esc).join('<br>')+'</div>' : '')+
    (foot.length ? '<div class="foot">'+foot.map(esc).join('<br>')+'</div>' : '')+
  '</div>';
}
/* the downloadable / printable file */
function inv_doc(o){
  var T = inv_tpl();
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>'+esc(inv_fill(T.labels.docTitle, inv_vars(o, T), true))+'</title><style>'+inv_css('body', '')+'</style></head><body>'+
    inv_sheet(o, T)+'</body></html>';
}
function inv_find(id){ var o = ST.orders[id]; return o ? ty_fixAdds(o) : null; }
ACT['inv-open'] = function(el){
  var id = el.getAttribute('data-id'), o = inv_find(id);
  if(!o){ toast('We could not find order '+id+' on this phone'); return; }
  UI['inv'] = {id:o.id, printNote:false};
  try{ openModal(inv_modalHTML(), {title:'Invoice '+inv_no(o), wide:true, cls:'inv-modal', rebuild:inv_modalHTML}); }
  catch(e){
    /* never a silent tap: show the sheet with what went wrong */
    openModal('<p class="small text2">The invoice for order #'+esc(o.id)+' could not be drawn. Please message us on WhatsApp and we\'ll send it.</p>', {title:'Invoice '+inv_no(o)});
  }
};
function inv_modalHTML(){
  var u = UI['inv'] || {}, o = inv_find(u.id); if(!o) return '';
  var units = (o.lines||[]).reduce(function(s,l){ return s + (l.qty||1); }, 0);
  return '<div class="inv-wrap" data-testid="inv-sheet">'+
    '<p class="small text2" style="margin:0 0 12px">Invoice <b>'+esc(inv_no(o))+'</b> for order #'+esc(o.id)+' · '+plural(units,'item')+' · '+esc(fmt(o.total))+'.</p>'+
    '<style>'+inv_css('.inv-doc', '.inv-doc ')+'</style>'+
    '<div class="inv-doc" id="inv-doc" role="document" aria-label="Invoice '+esc(inv_no(o))+'">'+inv_sheet(o)+'</div>'+
    '<div class="inv-acts" data-testid="inv-acts">'+
      (u.printNote ? '<p class="inv-note" role="status">'+ico('info',15)+'<span>No print window opened here. Use <b>Download invoice</b>, or take a screenshot of the invoice.</span></p>' : '')+
      '<div class="inv-btns">'+
        '<button type="button" class="btn btn-primary btn-block" data-act="inv-dl" data-id="'+esc(o.id)+'">'+ico('share',17)+'Download invoice</button>'+
        '<button type="button" class="btn btn-secondary btn-block" data-act="inv-print" data-id="'+esc(o.id)+'">'+ico('doc',17)+'Print / Save as PDF</button>'+
      '</div>'+
      '<p class="xs muted" style="margin:8px 0 0">On a phone, “Print” gives you “Save as PDF” — the file lands in your Downloads.</p>'+
    '</div>'+
  '</div>';
}
/* Print is the second step: a hidden frame with the same document. If the
   browser never opens a print dialog (sandboxed page, some phones), nothing
   throws — so we listen for it, and say so in the sheet when it does not come. */
ACT['inv-print'] = function(el){
  var o = inv_find(el.getAttribute('data-id')); if(!o) return;
  var old = document.getElementById('inv-print-frame'); if(old) old.parentNode.removeChild(old);
  var f = document.createElement('iframe');
  f.id = 'inv-print-frame'; f.setAttribute('aria-hidden','true'); f.tabIndex = -1;
  f.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:1000px;border:0';
  var shown = false;
  f.onload = function(){
    var w = f.contentWindow;
    try{ w.addEventListener('beforeprint', function(){ shown = true; }); w.addEventListener('afterprint', function(){ shown = true; }); }catch(e){}
    var t0 = Date.now();
    try{ w.focus(); w.print(); }catch(e){}
    /* a dialog that blocks counts as shown */
    if(Date.now() - t0 > 400) shown = true;
    setTimeout(function(){
      if(!shown && UI['inv'] && UI['inv'].id===o.id && MODAL){ UI['inv'].printNote = true; refreshModal(); }
      if(f.parentNode) f.parentNode.removeChild(f);
    }, 1200);
  };
  f.srcdoc = inv_doc(o);
  document.body.appendChild(f);
};
ACT['inv-dl'] = function(el){
  var o = inv_find(el.getAttribute('data-id')); if(!o) return;
  var name = inv_no(o)+'.html';
  try{
    var blob = new Blob([inv_doc(o)], {type:'text/html;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ if(a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 4000);
    toast('Saving '+name+' — look in your Downloads');
  }catch(e){ toast('Could not download — take a screenshot of the invoice instead'); }
};
