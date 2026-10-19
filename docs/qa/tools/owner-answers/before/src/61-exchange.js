/* ================= EXTAS demo — size exchange flow (61-exchange.js) =================
   Owner policy (strict): exchange ONLY for size, or a free same-size replacement when the item is
   faulty / damaged / wrong. No colour-change reason, no "didn't like it", no returns or refunds. */
(function(){
  var css = `
.exc-page{padding-top:16px;padding-bottom:8px}
@media(min-width:1024px){.exc-page{padding-top:26px}}
.exc-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:14px}
.exc-strip{display:flex;align-items:center;justify-content:space-between;gap:10px 14px;flex-wrap:wrap;padding:12px 14px;margin:14px 0 16px}
@media(min-width:1024px){.exc-strip{padding:14px 20px;margin-bottom:22px}}
.exc-strip .iconbtn{margin-left:-6px}
.exc-steps{display:flex;flex-direction:column;gap:12px;min-width:0}
.exc-step{background:var(--surface);border:1px solid var(--line);border-radius:var(--card-radius)}
.exc-step.cur{border-color:var(--brand-line);box-shadow:0 2px 0 var(--brand-line)}
.exc-step.todo .exc-step-hd{opacity:.5}
.exc-step-hd{display:flex;align-items:center;gap:12px;padding:15px 16px}
@media(min-width:1024px){.exc-step-hd{padding:18px 22px}}
.exc-num{width:28px;height:28px;border-radius:50%;border:1.5px solid var(--input);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:var(--muted);flex-shrink:0;background:var(--surface)}
.exc-step.cur .exc-num{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.exc-step.done .exc-num{background:var(--brand-tint);border-color:var(--brand-line);color:var(--brand)}
.exc-step-sum{font-size:13px;color:var(--text2);margin-top:1px;overflow:hidden;text-overflow:ellipsis}
.exc-step-bd{padding:0 16px 18px}
@media(min-width:1024px){.exc-step-bd{padding:0 22px 22px 62px}}
.exc-fs{border:0;margin:0;padding:0;min-width:0}
.exc-opt{display:flex;align-items:center;gap:12px;padding:12px;border:1.5px solid var(--line);border-radius:var(--radius);cursor:pointer;background:var(--surface);min-height:56px}
.exc-opt+.exc-opt{margin-top:8px}
.exc-opt:hover{border-color:var(--input)}
.exc-opt.on{border-color:var(--brand);background:var(--brand-tint)}
.exc-opt.dis{opacity:.5;cursor:not-allowed}
.exc-opt input{width:18px;height:18px;accent-color:var(--brand);flex-shrink:0;margin:0}
.exc-ri{width:34px;height:34px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text2)}
.exc-opt.on .exc-ri{background:var(--surface);color:var(--brand)}
.exc-photo-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px}
.exc-photo{width:96px;height:96px;border:1.5px dashed var(--input);border-radius:var(--radius);background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:12px;font-weight:600;color:var(--text2);cursor:pointer;padding:0;flex-shrink:0}
.exc-photo.has{border:1.5px solid var(--brand);position:relative;overflow:hidden;cursor:default}
.exc-photo.has .pimg{width:100%;height:100%}
.exc-sizes{display:flex;flex-wrap:wrap;gap:8px}
.exc-sp{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:78px;padding:8px 12px;line-height:1.2}
.exc-sp .m{font-size:10.5px;font-weight:500;opacity:.8}
.exc-sp.cur{background:var(--bg);border-style:dashed;color:var(--muted);cursor:default}
.exc-opts{border-top:1px solid var(--line2);padding-top:18px}
.exc-opts-hd{display:flex;gap:12px;align-items:flex-start}
.exc-opts-i{width:36px;height:36px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.exc-opts-i.warn{background:var(--warn-bg);color:var(--warn)}
.exc-ogrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
@media(min-width:768px){.exc-ogrid.c3{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1024px){.exc-ogrid.c3{grid-template-columns:repeat(4,minmax(0,1fr))}}
.exc-ogrid.list{grid-template-columns:minmax(0,1fr)}
@media(min-width:768px){.exc-ogrid.list{grid-template-columns:repeat(2,minmax(0,1fr))}}
.exc-ocard{position:relative;display:flex;flex-direction:column;text-align:left;border:1.5px solid var(--line);border-radius:var(--radius);background:var(--surface);padding:0;cursor:pointer;overflow:hidden;font:inherit;color:var(--ink);min-width:0}
.exc-ocard:hover{border-color:var(--input)}
.exc-ocard.on{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand)}
.exc-ocard .pimg{border-radius:0}
.exc-oinfo{padding:10px 12px 12px;display:block;min-width:0}
.exc-prow{flex-direction:row;align-items:stretch}
.exc-prow .exc-oimg{width:92px;min-height:116px;flex-shrink:0;position:relative;overflow:hidden}
.exc-prow .exc-oimg .pimg{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto}
.exc-prow .exc-oinfo{flex:1;padding-right:36px}
.exc-prow .swatch{width:30px;height:30px}
.exc-radio{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:50%;background:var(--surface);border:1.5px solid var(--input);display:flex;align-items:center;justify-content:center;color:var(--brand-ink)}
.exc-ocard.on .exc-radio{background:var(--brand);border-color:var(--brand)}
.exc-diff{color:var(--text2)}
.exc-only{display:flex;gap:8px;align-items:flex-start;margin:18px 0 2px;font-weight:600;color:var(--ink)}
.exc-money{border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:var(--surface)}
.exc-mrow{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:10px 14px;font-size:14px}
.exc-mrow+.exc-mrow{border-top:1px solid var(--line2)}
.exc-mrow .v{font-weight:700;font-family:var(--font-display);white-space:nowrap}
.exc-mfinal{background:var(--brand-tint);font-weight:700;font-size:15px}
.exc-mfinal .sub{display:block;font-size:12px;font-weight:500;color:var(--text2)}
.exc-swap{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;align-items:center}
.exc-swap .exc-arrow{justify-self:center;transform:rotate(90deg);color:var(--muted)}
@media(min-width:768px){.exc-swap{grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);gap:8px}.exc-swap .exc-arrow{transform:none}}
.exc-mini{border:1px solid var(--line);border-radius:var(--radius);padding:10px;display:flex;gap:12px;align-items:center;background:var(--surface);min-width:0}
.exc-how{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
.exc-how li{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:var(--text2);line-height:1.45}
.exc-how .i{width:30px;height:30px;border-radius:50%;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.exc-dnav{display:none}
@media(min-width:1024px){.exc-dnav{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:22px;padding-top:18px;border-top:1px solid var(--line2)}}
.exc-hint{font-size:12.5px;color:var(--warn);font-weight:500}
.exc-side{display:none}
@media(min-width:1024px){.exc-side{display:block}}
.exc-sum-hd{padding:16px 20px;border-bottom:1px solid var(--line2)}
.exc-sum-item{display:flex;gap:12px;align-items:center;padding:16px 20px;border-bottom:1px solid var(--line2)}
.exc-dl{margin:0;padding:6px 20px}
.exc-dl>div{display:flex;justify-content:space-between;gap:12px;padding:8px 0;font-size:13.5px}
.exc-dl>div+div{border-top:1px solid var(--line2)}
.exc-dl dt{color:var(--muted)} .exc-dl dd{margin:0;text-align:right;font-weight:600}
.exc-sum-money{padding:4px 20px 14px}
.exc-sum-ft{padding:14px 20px;border-top:1px solid var(--line2);background:var(--surface2)}
.exc-mbar{margin:16px -16px 0;bottom:58px}
@media(min-width:1024px){.exc-mbar{bottom:0}}
.exc-mbar .btn{min-height:48px}
.exc-done{max-width:700px;margin:8px auto 0;padding:30px 18px;text-align:center}
@media(min-width:768px){.exc-done{padding:40px 44px}}
.exc-done-check{width:66px;height:66px;border-radius:50%;background:var(--brand);color:var(--brand-ink);display:inline-flex;align-items:center;justify-content:center}
.exc-dtl{list-style:none;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:0;margin:24px 0}
.exc-dtl li{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--muted);text-align:center}
.exc-dtl li::before{content:'';position:absolute;top:11px;left:-50%;right:50%;height:2px;background:var(--line)}
.exc-dtl li.ln::before{background:var(--brand)}
.exc-dtl li:first-child::before{display:none}
.exc-dtl .tl-dot{position:relative;z-index:1}
.exc-dtl li.done{color:var(--ink)}
`;
  var s = document.createElement('style'); s.setAttribute('data-mod', 'exchange'); s.textContent = css; document.head.appendChild(s);
})();

var EXC_REASONS = [
  {id:'small', label:'Too small', sub:'I need a bigger size', icon:'up'},
  {id:'big', label:'Too big', sub:'I need a smaller size', icon:'down'},
  {id:'problem', label:'Faulty, damaged or wrong item', sub:'We replace it free — same size', icon:'shield'}
];
var EXC_CUR = {key:null, id:null};
function exc_u(){ return EXC_CUR.key ? UI[EXC_CUR.key] : null; }
function exc_o(){ return EXC_CUR.id ? ST.orders[EXC_CUR.id] : null; }
function exc_eligible(o){ var out = []; o.lines.forEach(function(l, i){ if(P(l.product) && acc_lineExchangeable(o, i)) out.push(i); }); return out; }
function exc_state(o, query){
  var key = 'exc:'+o.id+':'+(query.line!=null ? query.line : '');
  var u = ui(key, {step:1, line:null, reason:null, size:null, photo:false, pick:null, note:'', done:null, init:false});
  if(!u.init){
    u.init = true; var q = parseInt(query.line, 10), el = exc_eligible(o);
    if(!isNaN(q) && el.indexOf(q)>=0) u.line = q; else if(el.length===1) u.line = el[0];
  }
  EXC_CUR = {key:key, id:o.id};
  return u;
}
function exc_pickOk(pick, opts){
  if(!pick || !opts) return false;
  return opts.groups.some(function(g){ return g.product===pick.product && g.colors.indexOf(pick.color)>=0; });
}
/* R16 (1). The price an item is worth in an exchange. A set item counts at
   its REAL price — the set saving stays on the order — so swapping a size
   inside a set costs only the exchange delivery, as the set page promises
   ("Exchange one item or the whole set — the set price stays"). Older orders
   stored the set price split evenly (৳750 / ৳1,033 per item); those are read
   at the item's real price too. */
function exc_basePrice(line){
  if(line && line.setLabel){ var p = P(line.product); return Math.max(Number(line.unitPrice)||0, p ? p.price : 0); }
  return Number(line && line.unitPrice)||0;
}
function exc_paidLabel(line){ return line && line.setLabel ? 'item price in your '+esc(bagSetName(line.setLabel)) : 'what you paid'; }
function exc_money(o, line, faulty, pick){
  var oldP = exc_basePrice(line), np = P(pick.product).price, diff = np - oldP;
  var charge = faulty ? 0 : Number(o.zone==='in' ? SET('exchange','chargeInside') : SET('exchange','chargeOutside')) || 0;
  return {old:oldP, neu:np, diff:diff, charge:charge, codDue:Math.max(0, diff) + charge, walletCredit:Math.max(0, -diff)};
}
/* everything the steps need, computed from the UI state */
function exc_model(o, u){
  var elig = exc_eligible(o);
  var line = (u.line!=null && o.lines[u.line]) ? o.lines[u.line] : null, p = line ? P(line.product) : null;
  var faulty = u.reason==='problem', oneSize = !!(p && p.sizes.length<2), opts = null;
  if(line && u.reason && (faulty || (u.size && u.size!==line.size))) opts = exchangeOptions(o, u.line, faulty ? line.size : u.size, u.reason);
  if(opts && opts.tier===1 && !exc_pickOk(u.pick, opts)) u.pick = {product:opts.groups[0].product, color:opts.groups[0].colors[0]};
  if(u.pick && !exc_pickOk(u.pick, opts)) u.pick = null;
  var ok1 = !!line && elig.indexOf(u.line)>=0;
  var ok2 = ok1 && !!u.reason && (faulty ? !!u.photo : !oneSize);
  var ok3 = ok2 && !!opts && opts.tier>0 && !!u.pick;
  return {elig:elig, line:line, p:p, faulty:faulty, oneSize:oneSize, opts:opts, ok1:ok1, ok2:ok2, ok3:ok3, money:ok3 ? exc_money(o, line, faulty, u.pick) : null};
}
function exc_hint(u, m){
  if(u.step===1) return m.ok1 ? '' : 'Choose the item you want to exchange';
  if(u.step===2){ if(!u.reason) return 'Choose a reason'; if(m.faulty && !u.photo) return 'Add a photo of the problem to continue'; if(m.oneSize && !m.faulty) return 'One-size item — only faulty items can be replaced'; return ''; }
  if(u.step===3){ if(!m.faulty && !u.size) return 'Pick your new size'; if(m.opts && m.opts.tier===0) return 'Not in stock — message us on WhatsApp'; if(!u.pick) return 'Choose one option to continue'; }
  return '';
}
function exc_sizeOrder(p, cur, reason){
  var s = p.sizes, i = s.indexOf(cur), bigger = s.slice(i+1), smaller = s.slice(0, Math.max(0, i)).reverse();
  return reason==='big' ? smaller.concat([cur], bigger) : bigger.concat([cur], smaller);
}
function exc_diffText(newP, oldP){ var d = newP - oldP; if(d===0) return 'Same price as yours'; return d>0 ? 'Pay '+fmt(d)+' more' : fmt(-d)+' back to your wallet'; }
function exc_scrollToCur(){
  var el = document.querySelector('.exc-step.cur'); if(!el) return;
  var hdr = document.querySelector('.hdr'), off = (hdr ? hdr.offsetHeight : 60) + 12, r = el.getBoundingClientRect();
  if(r.top < off || r.top > window.innerHeight*0.45) window.scrollTo(0, Math.max(0, window.scrollY + r.top - off));
}

PAGES.exchange = {
  layout:'store',
  title:function(params){ return 'Exchange · Order #'+params[0]; },
  render:function(params, query){
    query = query || {};
    var id = params[0], o = ST.orders[id], acc = currentAccount();
    var crumbs = acc_crumbs([['Home','#/'],[t('My account'),'#/account'],['Order #'+id, '#/order/'+id],['Exchange']]);
    if(!acc || !o || !acc_owns(acc, o)){
      var back = '#/exchange/'+id+(query.line!=null && query.line!=='' ? '?line='+query.line : '');
      return '<div class="container acc-page">'+crumbs+'<div class="mt16">'+acc_loginPrompt(
        !acc ? 'Log in to exchange a size' : 'This order is not in your account',
        !acc ? 'Exchanges are requested from your account, so we can find your order.' : 'Log in with the mobile number used for order #'+id+'.',
        '#/login?next='+encodeURIComponent(back))+'</div></div>';
    }
    var u = exc_state(o, query);
    if(u.done){
      var dx = (o.exchanges||[]).filter(function(x){ return x.id===u.done; })[0];
      if(dx) return '<div class="container exc-page">'+crumbs+exc_doneHTML(o, dx)+'</div>';
      u.done = null; u.step = 1;
    }
    var hours = exchangeHoursLeft(o);
    var top = '<div class="exc-top"><h1 class="h1">Exchange a size</h1><span class="small muted hide-m">Size exchange or a free replacement</span></div>'+exc_strip(o, hours);
    if(o.status!=='delivered' || !(hours>0)) return '<div class="container exc-page">'+crumbs+top+exc_closed(o)+'</div>';
    var m = exc_model(o, u);
    if(!m.elig.length){
      return '<div class="container exc-page">'+crumbs+top+'<section class="card p24"><h2 class="h2">Every item in this order already has an exchange</h2><p class="small text2">You can follow them on the order page.</p><div class="row wrap mt16"><a class="btn btn-primary" href="#/order/'+esc(o.id)+'">Back to order</a>'+waButton('Message us on WhatsApp', 'Hi EXTAS, about the exchange on order #'+o.id)+'</div></section></div>';
    }
    if(u.step>1 && !m.ok1) u.step = 1; else if(u.step>2 && !m.ok2) u.step = 2; else if(u.step>3 && !m.ok3) u.step = 3;
    return '<div class="container exc-page">'+crumbs+top+
      '<div class="split-side"><div class="exc-steps">'+exc_steps(o, u, m)+'</div><aside class="exc-side" aria-label="Exchange summary"><div class="sticky-d">'+exc_summary(o, u, m)+'</div></aside></div>'+
      exc_mbar(u, m)+'</div>';
  }
};

function exc_strip(o, hours){
  var chip = o.status==='delivered'
    ? (hours>0 ? '<span class="tag warn">'+ico('clock',12)+plural(hours,'hour')+' left to exchange</span>' : '<span class="tag plain">Exchange window closed</span>')
    : '<span class="tag plain">Not delivered yet</span>';
  var thumbs = o.lines.slice(0,4).map(function(l){ return acc_thumb(l.product, l.color, 34); }).join('');
  return '<section class="card exc-strip" aria-label="Order"><div class="row" style="gap:10px;min-width:0"><a class="iconbtn" href="#/order/'+esc(o.id)+'" aria-label="Back to order">'+ico('back',20)+'</a>'+
    '<div style="min-width:0"><div class="h3">Order #'+esc(o.id)+'</div><div class="small text2">'+(o.deliveredAt ? 'Delivered '+esc(dateStr(o.deliveredAt)) : esc(STATUS_LABEL[o.status] || ''))+' · '+plural(o.lines.length,'item')+'</div></div>'+
    '<div class="row hide-m" style="gap:6px;margin-left:12px">'+thumbs+'</div></div>'+chip+'</section>';
}
function exc_closed(o){
  var notDel = o.status!=='delivered';
  return '<section class="card p24" aria-labelledby="exc-closed-h"><div class="row top" style="gap:14px;align-items:flex-start"><span class="acc-prompt-i shrink0" style="margin:0">'+ico('clock',22)+'</span><div style="min-width:0">'+
    '<h2 class="h2" id="exc-closed-h">'+(notDel ? 'This order is not delivered yet' : 'The exchange window has closed')+'</h2>'+
    '<p class="small text2" style="margin:6px 0 0">'+(notDel ? 'You can ask for a size exchange after the order is delivered.' : 'Size exchanges can be requested for '+esc(SET('exchange','windowHours'))+' hours after delivery. This order was delivered on '+esc(dateStr(o.deliveredAt))+'.')+'</p>'+
    '<div class="soft p16 small mt12">'+esc(ruleText('exchange','short'))+'</div>'+
    '<div class="row wrap mt16" style="gap:10px"><a class="btn btn-secondary" href="#/order/'+esc(o.id)+'">Back to order</a>'+waButton('Message us on WhatsApp', 'Hi EXTAS, I have a question about order #'+o.id)+'</div></div></div></section>';
}

/* ---------- steps (accordion: done steps collapse with a "Change" link) ---------- */
function exc_card(n, title, state, summary, bodyFn){
  return '<section class="exc-step '+state+'" data-step="'+n+'"'+(state==='cur' ? ' aria-current="step"' : '')+' aria-labelledby="exc-s'+n+'">'+
    '<div class="exc-step-hd"><span class="exc-num" aria-hidden="true">'+(state==='done' ? ico('check',14) : n)+'</span><div class="grow"><h2 class="h3" id="exc-s'+n+'"><span class="sr">Step '+n+': </span>'+esc(title)+'</h2>'+
      (state==='done' && summary ? '<div class="exc-step-sum">'+summary+'</div>' : '')+'</div>'+
      (state==='done' ? '<button class="link" data-act="exc-goto" data-n="'+n+'" aria-label="Change '+esc(title)+'">Change</button>' : '')+'</div>'+
    (state==='cur' ? '<div class="exc-step-bd">'+bodyFn()+'</div>' : '')+'</section>';
}
function exc_steps(o, u, m){
  var st = function(n){ return n<u.step ? 'done' : (n===u.step ? 'cur' : 'todo'); };
  var l = m.line, p = m.p;
  var s1 = l ? esc(p.name)+' · '+esc(COL(l.color).name)+' · '+esc(l.size) : '';
  var s2 = u.reason ? esc(ACC_REASON[u.reason])+(m.faulty && u.photo ? ' · photo added' : '') : '';
  var s3 = u.pick ? (m.faulty ? 'Same size '+esc(l.size)+' · ' : 'Size '+esc(u.size)+' · ')+esc(P(u.pick.product).name)+', '+esc(COL(u.pick.color).name) : '';
  return exc_card(1, 'Item', st(1), s1, function(){ return exc_body1(o, u, m); })+
    exc_card(2, 'Reason', st(2), s2, function(){ return exc_body2(o, u, m); })+
    exc_card(3, m.faulty ? 'Replacement' : 'New size', st(3), s3, function(){ return exc_body3(o, u, m); })+
    exc_card(4, 'Review & confirm', st(4), '', function(){ return exc_body4(o, u, m); });
}
function exc_navOk(u, m){ return u.step===1 ? m.ok1 : (u.step===2 ? m.ok2 : (u.step===3 ? m.ok3 : true)); }
function exc_dnav(u, m){
  var ok = exc_navOk(u, m), hint = exc_hint(u, m);
  var back = u.step>1 ? '<button class="btn btn-ghost" data-act="exc-back">'+ico('back',16)+'Back</button>' : '<a class="btn btn-ghost" href="#/order/'+esc(EXC_CUR.id)+'">Cancel</a>';
  var fwd = u.step<4 ? '<button class="btn btn-primary" data-act="exc-next"'+(ok ? '' : ' disabled')+'>Next'+ico('right',16)+'</button>'
                     : '<button class="btn btn-primary" data-act="exc-confirm">'+ico('check',16)+'Confirm exchange</button>';
  return '<div class="exc-dnav">'+back+'<div class="row" style="gap:14px">'+(hint && !ok ? '<span class="exc-hint">'+esc(hint)+'</span>' : '')+fwd+'</div></div>';
}
function exc_mbar(u, m){
  var ok = exc_navOk(u, m), hint = exc_hint(u, m);
  var back = u.step>1 ? '<button class="btn btn-ghost" data-act="exc-back" style="padding:12px 16px">'+ico('back',16)+'Back</button>' : '<a class="btn btn-ghost" href="#/order/'+esc(EXC_CUR.id)+'" style="padding:12px 16px">Cancel</a>';
  var fwd = u.step<4 ? '<button class="btn btn-primary grow" data-act="exc-next"'+(ok ? '' : ' disabled')+'>Next'+ico('right',16)+'</button>'
                     : '<button class="btn btn-primary grow" data-act="exc-confirm">'+ico('check',16)+'Confirm exchange</button>';
  var money = (u.step===4 && m.money) ? '<div class="row between small" style="margin-bottom:8px"><span class="text2">'+(m.money.codDue>0 ? 'Pay on delivery' : (m.money.walletCredit>0 ? 'Added to your wallet' : 'Pay on delivery'))+'</span><b class="price">'+fmt(m.money.codDue>0 ? m.money.codDue : m.money.walletCredit)+'</b></div>' : '';
  return '<div class="mbar dm-hide exc-mbar">'+(hint && !ok ? '<div class="exc-hint" style="margin-bottom:8px">'+esc(hint)+'</div>' : money)+'<div class="row" style="gap:10px">'+back+fwd+'</div></div>';
}

function exc_body1(o, u, m){
  var rows = m.elig.map(function(i){
    var l = o.lines[i], p = P(l.product), on = u.line===i;
    return '<label class="exc-opt'+(on ? ' on' : '')+'"><input type="radio" name="exc-line" value="'+i+'" data-change="exc-line"'+(on ? ' checked' : '')+'>'+acc_thumb(p.id, l.color, 48)+
      '<span class="grow" style="min-width:0"><span class="bold small" style="display:block">'+esc(p.name)+'</span><span class="xs text2" style="display:block">'+esc(COL(l.color).name)+' · Size '+esc(l.size)+(l.setLabel ? ' · '+esc(bagSetName(l.setLabel)) : '')+'</span></span>'+
      '<span class="small bold shrink0">'+fmt(exc_basePrice(l))+'</span></label>';
  }).join('');
  var taken = o.lines.length - m.elig.length;
  return '<p class="small text2" style="margin:0 0 12px">Which item do you want to exchange?</p><fieldset class="exc-fs"><legend class="sr">Item to exchange</legend>'+rows+'</fieldset>'+
    (taken ? '<div class="xs muted mt8">'+plural(taken,'item')+' in this order already '+(taken===1 ? 'has' : 'have')+' an exchange.</div>' : '')+exc_dnav(u, m);
}
function exc_body2(o, u, m){
  var rs = EXC_REASONS.map(function(r){
    var dis = m.oneSize && r.id!=='problem', on = u.reason===r.id;
    return '<label class="exc-opt'+(on ? ' on' : '')+(dis ? ' dis' : '')+'"><input type="radio" name="exc-reason" value="'+r.id+'" data-change="exc-reason"'+(on ? ' checked' : '')+(dis ? ' disabled' : '')+'>'+
      '<span class="exc-ri">'+ico(r.icon,18)+'</span><span class="grow"><span class="bold small" style="display:block">'+esc(r.label)+'</span><span class="xs text2">'+esc(dis ? 'This item is one size' : r.sub)+'</span></span></label>';
  }).join('');
  var extra = '';
  if(m.faulty){
    var photo = u.photo
      ? '<div class="exc-photo has">'+productImg(m.p, m.line.color, {ratio:'ratio-11', label:false, view:'detail'})+'<button type="button" class="ord-photo-x" data-act="exc-photo" aria-label="Remove photo">'+ico('close',14)+'</button></div><span class="small brandc bold row" style="gap:6px">'+ico('check',15)+'Photo added</span>'
      : '<button type="button" class="exc-photo" data-act="exc-photo">'+ico('camera',22)+'<span>Add photo</span><span class="xs muted" style="font-weight:500">Required</span></button><span class="xs text2" style="max-width:260px">A clear photo of the problem — or of the wrong item — helps us approve it fast.</span>';
    extra = '<div class="tint p16 mt12"><div class="row top" style="gap:10px;align-items:flex-start">'+ico('shield',18,'style="flex-shrink:0;margin-top:2px;color:var(--brand)"')+
      '<div><div class="bold small">We replace it free — same size.</div><div class="xs text2" style="margin-top:2px">No exchange delivery charge, because the mistake is ours.</div></div></div>'+
      '<div class="exc-photo-row">'+photo+'</div>'+
      '<label class="label mt12" for="exc-note">What\'s wrong? <span class="muted" style="font-weight:400">(optional)</span></label><textarea id="exc-note" class="input" rows="2" data-input="exc-note" placeholder="e.g. Seam open on the left sleeve">'+esc(u.note)+'</textarea></div>';
  }
  return '<p class="small text2" style="margin:0 0 12px">What\'s the problem with your '+esc(m.p.name)+' (size '+esc(m.line.size)+')?</p><fieldset class="exc-fs"><legend class="sr">Reason for the exchange</legend>'+rs+'</fieldset>'+extra+
    '<div class="xs muted mt12 row top" style="gap:6px;align-items:flex-start">'+ico('info',14,'style="flex-shrink:0;margin-top:2px"')+'<span>'+esc(ruleText('no-return','short'))+'. Colour changes and “didn\'t like it” are not exchangeable.</span></div>'+exc_dnav(u, m);
}
function exc_body3(o, u, m){
  var h = '';
  if(!m.faulty){
    var p = m.p, l = m.line, chart = chartFor(p), saved = mySizeFor(p);
    h += '<p class="small text2" style="margin:0 0 2px">Pick your new size for the '+esc(p.name)+'.</p>'+
      '<div class="xs muted" style="margin-bottom:12px">'+(u.reason==='big' ? 'Too big — smaller sizes are shown first.' : 'Too small — bigger sizes are shown first.')+(saved && saved!==l.size ? ' Your saved size: <b>'+esc(saved)+'</b>.' : '')+'</div>'+
      '<div class="exc-sizes" role="group" aria-label="New size">'+exc_sizeOrder(p, l.size, u.reason).map(function(s){
        if(s===l.size) return '<button type="button" class="size-pill exc-sp cur" disabled aria-label="'+esc(s)+', your current size"><span>'+esc(s)+'</span><span class="m">your size</span></button>';
        var meas = chart && chart.rows[s] ? esc(chart.fields[0])+' '+esc(fmtMeasure(chart.rows[s][0])) : '';
        return '<button type="button" class="size-pill exc-sp'+(u.size===s ? ' on' : '')+'" data-act="exc-size" data-s="'+esc(s)+'" aria-pressed="'+(u.size===s)+'"><span>'+esc(s)+'</span>'+(meas ? '<span class="m">'+meas+'</span>' : '')+'</button>';
      }).join('')+'</div>';
  }
  if(m.opts) h += '<div'+(m.faulty ? '' : ' class="mt24"')+'>'+exc_options(o, u, m)+'</div>';
  return h + exc_dnav(u, m);
}
function exc_options(o, u, m){
  var opts = m.opts, line = m.line, h = '<div class="exc-opts" data-tier="'+opts.tier+'"'+(m.faulty ? ' style="border-top:0;padding-top:0"' : '')+'>';
  h += '<div class="exc-opts-hd"><span class="exc-opts-i'+(opts.tier===1 ? '' : ' warn')+'">'+ico(opts.tier===1 ? 'check' : (opts.tier===0 ? 'info' : 'swap'), 18)+'</span><div><div class="h3">'+esc(opts.title)+'</div><div class="small text2" style="margin-top:2px">'+esc(opts.note)+'</div></div></div>';
  if(opts.tier===0){
    h += '<div class="mt16">'+waButton('Message us on WhatsApp', 'Hi EXTAS, I want to exchange my '+P(line.product).name+' ('+COL(line.color).name+', '+line.size+') from order #'+o.id+' for size '+opts.size+'. It is out of stock — please tell me when it is back.')+'</div>';
  } else if(opts.tier<=2){
    var g = opts.groups[0];
    h += '<div class="exc-ogrid c3" role="radiogroup" aria-label="Choose your new item">'+g.colors.map(function(c){ return exc_colorCard(g.product, c, opts.size, u, line); }).join('')+'</div>';
  } else if(opts.tier===4){
    var byCat = {}, order = [];
    opts.groups.forEach(function(gr){ var c = P(gr.product).cat; if(!byCat[c]){ byCat[c] = []; order.push(c); } byCat[c].push(gr); });
    h += order.map(function(c){ return '<div class="eyebrow" style="margin-top:18px">'+esc(CAT(c).name)+'</div><div class="exc-ogrid list" style="margin-top:8px">'+byCat[c].map(function(gr){ return exc_prodCard(gr, opts, u, line); }).join('')+'</div>'; }).join('');
  } else {
    h += '<div class="exc-ogrid list">'+opts.groups.map(function(gr){ return exc_prodCard(gr, opts, u, line); }).join('')+'</div>';
  }
  h += '<p class="small exc-only">'+ico('info',16,'style="flex-shrink:0;margin-top:2px"')+'<span>These are the only options available for your exchange under our rules.</span></p>'+ruleBlock('exchange-order', {key:'exc'});
  return h+'</div>';
}
function exc_colorCard(pid, c, size, u, line){
  var p = P(pid), on = !!(u.pick && u.pick.product===pid && u.pick.color===c), same = pid===line.product && c===line.color;
  return '<button type="button" class="exc-ocard'+(on ? ' on' : '')+'" role="radio" aria-checked="'+on+'" data-act="exc-pick" data-p="'+esc(pid)+'" data-c="'+esc(c)+'" data-testid="opt-'+esc(pid)+'-'+esc(c)+'">'+
    productImg(p, c, {ratio:'ratio-11', label:false})+'<span class="exc-radio" aria-hidden="true">'+(on ? ico('check',13) : '')+'</span>'+
    '<span class="exc-oinfo"><span class="bold small" style="display:block">'+esc(COL(c).name)+(same ? ' · same colour' : '')+'</span><span class="xs text2" style="display:block">'+esc(p.name)+' · Size '+esc(size)+'</span><span class="xs exc-diff" style="display:block;margin-top:3px">'+exc_diffText(p.price, exc_basePrice(line))+'</span></span></button>';
}
function exc_prodCard(g, opts, u, line){
  var p = P(g.product), picked = !!(u.pick && u.pick.product===g.product), color = picked ? u.pick.color : g.colors[0];
  var sw = g.colors.map(function(c){
    var on = picked && u.pick.color===c;
    return '<button type="button" class="swatch'+(on ? ' on' : '')+'" style="background:'+COL(c).hex+'" data-act="exc-pick" data-p="'+esc(g.product)+'" data-c="'+esc(c)+'" aria-label="'+esc(p.name)+', '+esc(COL(c).name)+'" aria-pressed="'+on+'" title="'+esc(COL(c).name)+'"></button>';
  }).join('');
  return '<div class="exc-ocard exc-prow'+(picked ? ' on' : '')+'" data-act="exc-pick" data-p="'+esc(g.product)+'" data-c="'+esc(color)+'" data-testid="opt-'+esc(g.product)+'">'+
    '<div class="exc-oimg">'+productImg(p, color, {ratio:'ratio-45', label:false})+'</div>'+
    '<div class="exc-oinfo"><div class="row between top" style="gap:8px"><span class="bold small">'+esc(p.name)+'</span><span class="price small shrink0">'+fmt(p.price)+'</span></div>'+
      '<div class="xs text2" style="margin-top:2px">Size '+esc(opts.size)+' · '+esc(p.fit)+(g.sameCollection ? ' · <span class="brandc bold">Same collection</span>' : '')+'</div>'+
      '<div class="row wrap mt8" style="gap:8px" role="group" aria-label="Colours in size '+esc(opts.size)+'">'+sw+'</div>'+
      '<div class="xs mt8">'+(picked ? '<b>'+esc(COL(color).name)+'</b> selected' : esc(plural(g.colors.length,'colour'))+' in size '+esc(opts.size))+' · <span class="exc-diff">'+exc_diffText(p.price, exc_basePrice(line))+'</span></div>'+
    '</div><span class="exc-radio" aria-hidden="true">'+(picked ? ico('check',13) : '')+'</span></div>';
}
function exc_swapHTML(l, item, size){
  var op = P(l.product), np = P(item.product);
  return '<div class="exc-swap">'+
    '<div class="exc-mini">'+acc_thumb(l.product, l.color, 48)+'<div class="xs" style="min-width:0"><div class="muted">You send back</div><div class="bold small">'+esc(op.name)+'</div><div class="text2">'+esc(COL(l.color).name)+' · '+esc(l.size)+'</div></div></div>'+
    '<span class="exc-arrow" aria-hidden="true">'+ico('swap',20)+'</span>'+
    '<div class="exc-mini">'+acc_thumb(item.product, item.color, 48)+'<div class="xs" style="min-width:0"><div class="muted">You get</div><div class="bold small">'+esc(np.name)+'</div><div class="text2">'+esc(COL(item.color).name)+' · '+esc(size)+'</div></div></div></div>';
}
function exc_moneyHTML(o, mo, faulty, line){
  var r = function(k, v, cls){ return '<div class="exc-mrow'+(cls ? ' '+cls : '')+'"><span>'+k+'</span><span class="v">'+v+'</span></div>'; };
  var diff = mo.diff===0 ? fmt(0) : (mo.diff>0 ? '+'+fmt(mo.diff) : fmt(mo.diff));
  var h = '<div class="exc-money" aria-label="Money for this exchange">'+
    r('Old item <span class="xs muted">('+exc_paidLabel(line)+')</span>', fmt(mo.old))+
    r('New item price', fmt(mo.neu))+
    r('Difference', diff)+
    r('Exchange delivery <span class="xs muted">('+(faulty ? 'free — our mistake' : (o.zone==='in' ? 'Inside Dhaka' : 'Outside Dhaka'))+')</span>', mo.charge ? fmt(mo.charge) : fmt(0));
  if(mo.codDue>0) h += r('Pay on delivery<span class="sub">Cash to the courier when the new item arrives</span>', fmt(mo.codDue), 'exc-mfinal');
  if(mo.walletCredit>0) h += r('Added to your wallet<span class="sub">After we receive the old item</span>', fmt(mo.walletCredit), 'exc-mfinal');
  if(!mo.codDue && !mo.walletCredit) h += r('Pay on delivery<span class="sub">Nothing to pay</span>', fmt(0), 'exc-mfinal');
  return h+'</div>';
}
function exc_body4(o, u, m){
  var l = m.line, size = m.faulty ? l.size : u.size;
  return exc_swapHTML(l, u.pick, size)+
    '<div class="mt16">'+exc_moneyHTML(o, m.money, m.faulty, l)+'</div>'+
    '<div class="mt24"><div class="h3">How it works</div><ul class="exc-how">'+
      '<li><span class="i">'+ico('truck',16)+'</span><span>Our courier brings your new item and takes the old one back in the same trip.</span></li>'+
      '<li><span class="i">'+ico('box',16)+'</span><span>'+(m.faulty ? 'Keep the item with its tags and packaging so we can check the problem.' : 'Keep the old item unworn and unwashed, with tags on. The courier checks it at the door.')+'</span></li>'+
      '<li><span class="i">'+ico('wallet',16)+'</span><span>Wallet credit (if any) is added after the old item passes our check.</span></li>'+
      '<li><span class="i">'+ico('chat',16)+'</span><span>We send you updates on WhatsApp at every step.</span></li>'+
    '</ul></div>'+
    '<div class="mt16">'+ruleBlock('exchange', {key:'exc2', title:'Exchange rules'})+'</div>'+exc_dnav(u, m);
}
function exc_summary(o, u, m){
  var l = m.line;
  var h = '<section class="card"><div class="exc-sum-hd"><div class="eyebrow">Your exchange</div></div>';
  if(!l) return h+'<div class="p20 small muted">Choose an item to start.</div></section>';
  var dash = '<span class="muted" style="font-weight:400">—</span>';
  h += '<div class="exc-sum-item">'+acc_thumb(l.product, l.color, 54)+'<div class="small" style="min-width:0"><div class="bold">'+esc(m.p.name)+'</div><div class="text2">'+esc(COL(l.color).name)+' · '+esc(l.size)+'</div><div class="xs muted">'+(l.setLabel ? 'Item price '+fmt(exc_basePrice(l))+' · '+esc(bagSetName(l.setLabel)) : 'You paid '+fmt(l.unitPrice))+'</div></div></div>'+
    '<dl class="exc-dl">'+
      '<div><dt>Reason</dt><dd>'+(u.reason ? esc(ACC_REASON[u.reason]) : dash)+'</dd></div>'+
      '<div><dt>'+(m.faulty ? 'Size' : 'New size')+'</dt><dd>'+(m.faulty ? esc(l.size)+' (same)' : (u.size ? esc(u.size) : dash))+'</dd></div>'+
      '<div><dt>New item</dt><dd>'+(u.pick ? esc(P(u.pick.product).name)+', '+esc(COL(u.pick.color).name) : dash)+'</dd></div>'+
    '</dl>';
  if(m.money){
    var mo = m.money;
    h += '<div class="exc-sum-money"><div class="exc-money">'+
      '<div class="exc-mrow"><span>Difference</span><span class="v">'+(mo.diff>0 ? '+' : '')+fmt(mo.diff)+'</span></div>'+
      '<div class="exc-mrow"><span>Exchange delivery</span><span class="v">'+fmt(mo.charge)+'</span></div>'+
      (mo.codDue>0 || !mo.walletCredit ? '<div class="exc-mrow exc-mfinal"><span>Pay on delivery</span><span class="v">'+fmt(mo.codDue)+'</span></div>' : '')+
      (mo.walletCredit>0 ? '<div class="exc-mrow exc-mfinal"><span>Added to your wallet</span><span class="v">'+fmt(mo.walletCredit)+'</span></div>' : '')+
    '</div></div>';
  }
  return h+'<div class="exc-sum-ft xs text2">'+esc(ruleText('exchange','short'))+'</div></section>';
}
function exc_doneHTML(o, x){
  var l = o.lines[x.lineIdx], completed = x.status==='completed';
  var steps = ['Requested','Approved','Courier swap','Done'];
  var tl = '<ol class="exc-dtl" aria-label="Exchange progress">'+steps.map(function(s, i){
    var done = i===0 || completed, ln = i>0 && completed, now = !completed && i===1;
    return '<li class="'+(done ? 'done' : '')+(ln ? ' ln' : '')+'"><span class="tl-dot'+(done ? ' done' : (now ? ' now' : ''))+'">'+(done ? ico('check',13) : (i+1))+'</span><span>'+s+'</span></li>';
  }).join('')+'</ol>';
  var mo = {old:exc_basePrice(l), neu:P(x.newItem.product).price, diff:x.diff, charge:x.charge, codDue:x.codDue, walletCredit:x.walletCredit};
  return '<section class="card exc-done" aria-labelledby="exd-h"><span class="exc-done-check">'+ico('check',32)+'</span>'+
    '<h1 class="h1 mt16" id="exd-h">Exchange requested</h1><div class="text2 mt8">Request <b data-testid="exc-id">'+esc(x.id)+'</b> · Order #'+esc(o.id)+'</div>'+tl+
    '<div style="text-align:left">'+exc_swapHTML(l, x.newItem, x.newItem.size)+'<div class="mt16">'+exc_moneyHTML(o, mo, x.reason==='problem', l)+'</div></div>'+
    '<p class="small text2" style="margin:18px 0 0">We\'ll message you on WhatsApp when it\'s approved and when the courier is on the way.</p>'+
    '<div class="row wrap mt16" style="justify-content:center;gap:10px"><a class="btn btn-primary" href="#/order/'+esc(o.id)+'">Back to order</a>'+
      waButton('Message us on WhatsApp', 'Hi EXTAS, about my exchange '+x.id+' (order #'+o.id+')')+'</div></section>';
}

/* ---------- actions ---------- */
CHANGE['exc-line'] = function(el){ var u = exc_u(); if(!u) return; u.line = +el.value; u.size = null; u.pick = null; u.photo = false; rerender(); };
CHANGE['exc-reason'] = function(el){ var u = exc_u(); if(!u) return; u.reason = el.value; u.size = null; u.pick = null; rerender(); };
ACT['exc-photo'] = function(){ var u = exc_u(); if(!u) return; u.photo = !u.photo; if(u.photo) toast('Demo: photo added'); rerender(); };
INPUT['exc-note'] = function(el){ var u = exc_u(); if(u) u.note = el.value; };
ACT['exc-size'] = function(el){
  var u = exc_u(); if(!u) return; u.size = el.getAttribute('data-s'); u.pick = null; rerender();
  var box = document.querySelector('.exc-opts'), hdr = document.querySelector('.hdr'); if(!box) return;
  var r = box.getBoundingClientRect(), off = (hdr ? hdr.offsetHeight : 60) + 12;
  if(r.top > window.innerHeight*0.6) window.scrollTo(0, Math.max(0, window.scrollY + r.top - off - 120));
};
ACT['exc-pick'] = function(el){ var u = exc_u(); if(!u) return; u.pick = {product:el.getAttribute('data-p'), color:el.getAttribute('data-c')}; rerender(); };
ACT['exc-next'] = function(){
  var u = exc_u(), o = exc_o(); if(!u || !o) return;
  var m = exc_model(o, u);
  if(!exc_navOk(u, m)){ toast(exc_hint(u, m) || 'Please finish this step first'); return; }
  u.step = Math.min(4, u.step+1); rerender(); exc_scrollToCur();
};
ACT['exc-back'] = function(){ var u = exc_u(); if(!u) return; u.step = Math.max(1, u.step-1); rerender(); exc_scrollToCur(); };
ACT['exc-goto'] = function(el){ var u = exc_u(); if(!u) return; var n = +el.getAttribute('data-n'); if(n<u.step){ u.step = n; rerender(); exc_scrollToCur(); } };
ACT['exc-confirm'] = function(){
  var u = exc_u(), o = exc_o(); if(!u || !o) return;
  var m = exc_model(o, u);
  if(!m.ok3){ u.step = !m.ok1 ? 1 : (!m.ok2 ? 2 : 3); toast('Please finish the steps first'); rerender(); return; }
  if(!(exchangeHoursLeft(o)>0)){ toast('Sorry — the exchange window has just closed'); rerender(); return; }
  var used = {}; Object.keys(ST.orders).forEach(function(k){ (ST.orders[k].exchanges||[]).forEach(function(x){ used[x.id] = 1; }); });
  var id; do { id = 'EXC-'+(1000 + Math.floor(Math.random()*9000)); } while(used[id]);
  var size = m.faulty ? m.line.size : u.size, mo = m.money;
  var x = {id:id, lineIdx:u.line, reason:u.reason, size:size, newItem:{product:u.pick.product, color:u.pick.color, size:size},
    diff:mo.diff, charge:mo.charge, codDue:mo.codDue, walletCredit:mo.walletCredit, status:'requested', at:Date.now(), tier:m.opts.tier, photo:!!u.photo, note:u.note || ''};
  o.exchanges = o.exchanges || []; o.exchanges.push(x);
  saveState(); u.done = id;
  render(); window.scrollTo(0, 0);
};
