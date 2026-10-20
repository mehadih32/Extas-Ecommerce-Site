/* =====================================================================
   96e-admin-docs.js — Fulfilment & documents (owner fix D, 20 Oct)
   S20 PR 404–412 (invoice 407, template editor 409), S08 PR 179–182,
   S05 PR 140 · 144 · 147 · 154, S09 PR 199–200 · 205.
   ---------------------------------------------------------------------
   #/admin/fulfilment                 the print run: every order still with us
   #/admin/fulfilment?tab=stickers    courier stickers, packing order (B1.4)
   #/admin/fulfilment?tab=picking     consolidated picking list (B1.6, B1.7)
   #/admin/fulfilment?tab=invoices    7 customer-invoice designs + the setting
   #/admin/stock                      stock mirror · reserved · ERP push log
   ALSO
   · Invoice designs 2–7 beside the existing one (1 = "Classic", 52-thanks.js).
     The chosen design is used everywhere the invoice is drawn (shop + admin).
     Every word comes from INVOICE_TPL / ST.invoiceTpl (labels added below),
     every figure from the order, the shop settings and Smart Rules.
   · WhatsApp invoice = a full-page JPG with the logo (B2.1, §59 answer 45);
     PDF stays a setting. The JPG is drawn in the browser (SVG → canvas).
   · Order screen: Invoice · WhatsApp invoice · Sticker · Cancel (with a
     reason and a confirm) · internal note · "Sent to ERP" lines.
   · Orders and Couriers stay in step: a parcel picked up = "With courier",
     delivered = "Delivered", back + QC ok = "Returned".
   · An order placed on the shop holds its pieces: available stock =
     ERP stock − open orders − delivered (only orders placed in this
     browser; the sample orders were already in the ERP figures).
   DEMO ONLY — nothing is sent, printed or pushed. Prefix zx_.
   ===================================================================== */
zo_route(/^\/admin\/fulfilment$/, 'zx-ful');
zo_route(/^\/admin\/stock$/, 'zx-stock');
zo_link(['Fulfilment','#/admin/fulfilment','doc', null]);
zo_link(['Stock & ERP','#/admin/stock','layers', null]);

/* ---------- settings (ST.docs) ---------- */
var ZX_DESIGNS = [
  {n:1, en:'Classic', bn:'ক্লাসিক'},
  {n:2, en:'Minimal', bn:'মিনিমাল'},
  {n:3, en:'Bold brand header', bn:'বড় ব্র্যান্ড হেডার'},
  {n:4, en:'Receipt', bn:'রসিদ'},
  {n:5, en:'Two-column', bn:'দুই কলাম'},
  {n:6, en:'Dark accent', bn:'ডার্ক অ্যাকসেন্ট'},
  {n:7, en:'Modern cards', bn:'মডার্ন কার্ড'}
];
var ZX_STICKER_SIZES = [['100x150','100 × 150 mm (4 × 6 in)'],['100x100','100 × 100 mm'],['75x100','75 × 100 mm'],['a6','A6 · 105 × 148 mm']];
var ZX_DEF = {design:1, waFormat:'jpg', sticker:'100x150'};
function zx_cfg(){ if(!ST.docs) ST.docs = {}; var d = ST.docs; Object.keys(ZX_DEF).forEach(function(k){ if(d[k]==null) d[k] = ZX_DEF[k]; }); return d; }
function zx_design(){ var n = +zx_cfg().design; return n>=1 && n<=ZX_DESIGNS.length ? n : 1; }
function zx_dname(n){ var d = ZX_DESIGNS[n-1]; return d ? d.en : ''; }
/* two rows in Settings → Invoice wording (PR 409) */
(function(){
  try{
    if(typeof ZS_SETTINGS==='undefined' || zs_S('inv.design')) return;
    var at = 0; ZS_SETTINGS.forEach(function(s, i){ if(s.g==='invoice') at = i+1; });
    ZS_SETTINGS.splice(at, 0,
      {id:'inv.design', g:'invoice', en:'Invoice template', bn:'ইনভয়েসের ডিজাইন (১–৭)', type:'sel', where:'Invoice · download, print, WhatsApp', see:'#/admin/fulfilment?tab=invoices',
        opts:ZX_DESIGNS.map(function(d){ return [String(d.n), d.n+' · '+d.en]; }),
        get:function(){ return String(zx_design()); }, set:function(v){ zx_cfg().design = +v || 1; }, def:function(){ return String(ZX_DEF.design); }, reset:function(){ zx_cfg().design = ZX_DEF.design; }},
      {id:'inv.wa', g:'invoice', en:'WhatsApp invoice format', bn:'হোয়াটসঅ্যাপে ইনভয়েস — JPG ছবি না PDF', type:'sel', where:'WhatsApp message after the order is processed', see:'#/admin/fulfilment?tab=invoices',
        opts:[['jpg','Full-page JPG with logo'],['pdf','PDF file']],
        get:function(){ return zx_cfg().waFormat; }, set:function(v){ zx_cfg().waFormat = v==='pdf' ? 'pdf' : 'jpg'; }, def:function(){ return ZX_DEF.waFormat; }, reset:function(){ zx_cfg().waFormat = ZX_DEF.waFormat; }},
      {id:'doc.sticker', g:'invoice', en:'Courier sticker size', bn:'কুরিয়ার স্টিকারের মাপ — আপনার প্রিন্টার অনুযায়ী', type:'sel', where:'Fulfilment · stickers', see:'#/admin/fulfilment?tab=stickers',
        opts:ZX_STICKER_SIZES, get:function(){ return zx_cfg().sticker; }, set:function(v){ zx_cfg().sticker = v; }, def:function(){ return ZX_DEF.sticker; }, reset:function(){ zx_cfg().sticker = ZX_DEF.sticker; }}
    );
  }catch(e){ console.error(e); }
})();

/* ---------- invoice words the new designs use (editable like the rest) ---------- */
(function(){
  if(typeof INVOICE_TPL==='undefined') return;
  var add = {
    setSaving: 'Set saving', setTag: 'Set · {set}', was: 'was {price}', colour: 'Colour', size: 'Size',
    statusPaid: 'PAID', statusCod: 'CASH ON DELIVERY', statusCancelled: 'CANCELLED', statusPart: 'PART PAID',
    codLabel: 'Cash to collect', paidLabel: 'Paid', balance: 'Balance due',
    policy: 'Exchange within {exchangeHours} hours of delivery — for size or a fault only. No returns after receipt.',
    contact: 'WhatsApp {whatsapp} · Hotline {hotline}',
    thanks: 'Thank you for shopping with {shopName}', customer: 'Customer', orderInfo: 'Order', items: 'Items',
    discount: 'Discount', savedTotal: 'You saved {saved}'
  };
  Object.keys(add).forEach(function(k){ if(INVOICE_TPL.labels[k]==null) INVOICE_TPL.labels[k] = add[k]; });
})();

/* ---------- order helpers ---------- */
function zx_parcel(o){ return (typeof zk_parcelOf==='function') ? zk_parcelOf(o.id) : null; }
function zx_open(o){ return o.status!=='cancelled' && o.status!=='returned'; }
function zx_units(o){ return (o.lines||[]).reduce(function(s,l){ return s + (l.qty||1); }, 0); }
function zx_brandHex(){ try{ var v = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(); if(/^#|rgb/.test(v)) return v; }catch(e){} return '#1F4E46'; }
function zx_logoSrc(T){ var s = (T && T.shop) || {}; if(s.logoUrl) return s.logoUrl; try{ var h = hdrData().logo || {}; return h.img || ''; }catch(e){ return ''; } }
function zx_shopName(T){ var s = (T && T.shop) || {}; if(s.name) return s.name; try{ return sbBrand(); }catch(e){ return ''; } }

/* everything an invoice design prints, read from the order + settings */
function zx_invData(o){
  var T = inv_tpl(), L = T.labels, V = inv_vars(o, T);
  var F = function(s, extra){ var v = V; if(extra){ v = {}; Object.keys(V).forEach(function(k){ v[k] = V[k]; }); Object.keys(extra).forEach(function(k){ v[k] = extra[k]; }); } var r = inv_fill(s, v); return r==null ? '' : r; };
  var groups = [], byKey = {}, sets = o.setDiscounts || [], used = {};
  (o.lines||[]).forEach(function(l){
    var p = P(l.product), c = COL(l.color) || {}, q = l.qty || 1;
    var it = {name:p ? p.name : l.product, colour:c.name || l.color, hex:c.hex || '#999', size:l.size, qty:q, unit:l.unitPrice, amount:l.unitPrice*q,
      was:(p && p.compareAt > l.unitPrice && !l.setLabel) ? p.compareAt : 0, added:!!l.addOn, cat:p ? ((CAT(p.cat)||{}).name || p.cat) : ''};
    var key = l.setLabel ? 'set:'+(l.setId || l.setLabel) : '';
    if(key){ if(!byKey[key]){ byKey[key] = {set:l.setLabel, items:[], saving:0}; groups.push(byKey[key]); } byKey[key].items.push(it); }
    else { var g = groups.length && !groups[groups.length-1].set ? groups[groups.length-1] : null; if(!g){ g = {set:null, items:[]}; groups.push(g); } g.items.push(it); }
  });
  /* each set saving sits under its own set */
  groups.forEach(function(g){ if(!g.set) return; sets.forEach(function(d, i){ if(used[i]) return; if(String(d.label||'').indexOf(g.set)===0 || (d.combo && g.set && d.label && d.label.toLowerCase().indexOf(g.set.toLowerCase())>=0)){ g.saving += d.amount; g.label = d.label; used[i] = 1; } }); });
  var setSum = sets.reduce(function(s,d){ return s + (d.amount||0); }, 0);
  var looseSets = sets.filter(function(d, i){ return !used[i]; });
  var other = Math.max(0, (o.discount||0) - setSum);
  var paid = ty_paid(o), due = Math.max(0, o.total - paid), cancelled = o.status==='cancelled';
  var status, statusCls, payLine;
  if(cancelled){ status = F(L.statusCancelled); statusCls = 'x'; payLine = ''; }
  else if(o.payment==='cod'){
    if(o.status==='delivered'){ status = F(L.statusPaid); statusCls = 'ok'; payLine = F(L.codPaid); }
    else { status = F(L.statusCod); statusCls = 'due'; payLine = F(L.codDue); }
  } else { status = due>0 ? F(L.statusPart) : F(L.statusPaid); statusCls = due>0 ? 'due' : 'ok'; payLine = F(L.paidOnline)+(due>0 ? F(L.dueAdded) : ''); }
  var codDue = cancelled ? 0 : (o.payment==='cod' ? (o.status==='delivered' ? 0 : o.total) : due);
  var saved = setSum + other + groups.reduce(function(s,g){ return s + g.items.reduce(function(a,it){ return a + (it.was ? (it.was-it.unit)*it.qty : 0); }, 0); }, 0);
  var shopLines = (T.shopLines||[]).map(function(s){ return F(s); }).filter(function(s){ return s; }).filter(function(s){ return s!==V.tagline; });
  return {T:T, L:L, V:V, F:F, o:o, logo:zx_logoSrc(T), shop:zx_shopName(T), tagline:V.tagline || '', shopLines:shopLines,
    invNo:V.invoiceNo, orderNo:F(L.orderNo), date:V.date, name:o.name, phone:V.phone, address:V.address,
    courier:(zx_parcel(o) ? (zk_c(zx_parcel(o).courier)||{}).name : '') || '', tracking:(zx_parcel(o)||{}).cid || '',
    groups:groups, units:V.units, subtotal:o.subtotal, setSum:setSum, looseSets:looseSets, other:other, wallet:o.walletUsed||0,
    delivery:o.delivery, total:o.total, paid:paid, codDue:codDue, method:V.method, status:status, statusCls:statusCls, payLine:payLine,
    policy:F(L.policy), contact:F(L.contact), thanks:F(L.thanks), saved:saved,
    footer:(T.footer||[]).map(function(s){ return String(s).trim()==='{returnNote}' ? '' : F(s); }).filter(function(s){ return s; })};
}
function zx_pcs(n){ return n+(n===1?' pc':' pcs'); }
function zx_m(n){ return esc(fmt(n)); }

/* ---------- the designs ---------- */
var ZX_BASE = '.ivd,.ivd *{box-sizing:border-box}.ivd{color:#171715;font:14px/1.5 "Instrument Sans",system-ui,-apple-system,"Segoe UI",Arial,sans-serif;text-align:left;background:#fff;margin:0 auto}'+
  '.ivd table{width:100%;border-collapse:collapse;background:none}.ivd td,.ivd th{background:none;color:inherit}.ivd .r{text-align:right;white-space:nowrap}.ivd .c{text-align:center}'+
  '.ivd .mut{color:#5E5850}.ivd .xs{font-size:11.5px}.ivd .b{font-weight:700}.ivd .wm{font:800 26px/1 Archivo,"Arial Black",system-ui,sans-serif;letter-spacing:.14em}.ivd .wm img{display:block;max-height:46px;max-width:210px}'+
  '.ivd .dot{display:inline-block;width:10px;height:10px;border-radius:50%;border:1px solid rgba(0,0,0,.25);vertical-align:-1px;margin-right:5px}'+
  '.ivd .was{text-decoration:line-through;color:#7A736A;font-size:11.5px;margin-left:4px}'+
  '.ivd .st{display:inline-block;font:800 11px/1 Archivo,Arial,sans-serif;letter-spacing:.12em;padding:6px 9px;border:2px solid currentColor;border-radius:3px}'+
  '.ivd .st.ok{color:#1F5B3A}.ivd .st.due{color:#8A4B12}.ivd .st.x{color:#8E1F1F}'+
  '.ivd .pol{font-size:12px;line-height:1.55}.ivd .lbl{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6E675E;margin-bottom:3px}'+
  '@media print{.ivd{max-width:none!important;border:0!important;box-shadow:none!important}}'+
  '@media(max-width:600px){.t2{padding:22px 16px}.t2 .meta{flex-direction:column;gap:4px}.t3 .band,.t3 .bd,.t6 .hd,.t6 .bd{padding-left:16px;padding-right:16px}'+
  '.t3 .due,.t6 .sum{flex:1 1 100%}.t3 .band h1,.t3 .band .mm,.t6 .hd h1,.t6 .hd .mm{text-align:left}.t5{flex-direction:column;min-height:0}.t5 .side{flex:none;border-right:0;border-bottom:1px solid #E1DDD6}'+
  '.t2 .sum,.t3 .sum,.t5 .sum{width:100%}.t7{padding:10px}.t5 .main{padding:18px 14px}}';
function zx_logoHTML(D, light){ return D.logo ? '<img src="'+esc(D.logo)+'" alt="'+esc(D.shop)+'">' : esc(D.shop); }
function zx_itemRows(D, cols, opt){
  opt = opt || {}; var L = D.L, n = 0;
  return D.groups.map(function(g){
    var head = g.set ? '<tr class="sg"><td colspan="'+cols+'"><b>'+esc(D.F(L.setTag, {set:g.set}))+'</b></td></tr>' : '';
    var rows = g.items.map(function(it){
      n++;
      var desc = (opt.dot ? '<span class="dot" style="background:'+esc(it.hex)+'"></span>' : '')+esc(it.colour)+' · '+esc(D.F(L.size))+' '+esc(it.size);
      return '<tr class="it'+(g.set?' in':'')+'">'+(opt.no ? '<td class="c mut">'+n+'</td>' : '')+'<td><div class="b">'+esc(it.name)+(it.added ? ' <span class="xs mut">('+esc(D.F(L.addedPill))+')</span>' : '')+'</div><div class="xs mut">'+desc+'</div></td>'+
        '<td class="c">'+it.qty+'</td>'+(opt.unit!==false ? '<td class="r">'+zx_m(it.unit)+(it.was ? '<span class="was">'+zx_m(it.was)+'</span>' : '')+'</td>' : '')+'<td class="r b">'+zx_m(it.amount)+'</td></tr>';
    }).join('');
    var save = g.set && g.saving ? '<tr class="ss"><td colspan="'+(cols-1)+'">'+esc(g.label || D.F(L.setSaving))+'</td><td class="r b">−'+zx_m(g.saving)+'</td></tr>' : '';
    return head+rows+save;
  }).join('');
}
function zx_totRows(D, opt){
  opt = opt || {}; var L = D.L, tr = function(k, v, cls){ return '<tr'+(cls?' class="'+cls+'"':'')+'><td>'+k+'</td><td class="r">'+v+'</td></tr>'; };
  var h = tr(esc(D.F(L.subtotal)), zx_m(D.subtotal));
  if(D.setSum) h += tr(esc(D.F(L.setSaving)), '−'+zx_m(D.setSum));
  if(D.other) h += tr(esc(D.F(L.discount)), '−'+zx_m(D.other));
  if(D.wallet) h += tr(esc(D.F(L.wallet)), '−'+zx_m(D.wallet));
  h += tr(esc(D.F(L.delivery)), D.delivery ? zx_m(D.delivery) : esc(D.F(L.free)));
  h += tr(esc(D.F(L.total)), zx_m(D.total), 'tot');
  if(!opt.noPay){
    if(D.paid) h += tr(esc(D.F(L.paidLabel))+' · '+esc(D.method), '−'+zx_m(D.paid), 'pd');
    h += tr('<b>'+esc(D.F(L.codLabel))+'</b>', '<b>'+zx_m(D.codDue)+'</b>', 'cod');
  }
  return h;
}
function zx_meta(D, sep){ return [esc(D.invNo), esc(D.orderNo), esc(D.date)].join(sep||'<br>'); }
function zx_saveLine(D){ return D.saved > 0 ? '<div class="sv">'+esc(D.F(D.L.savedTotal, {saved:fmt(D.saved)}))+'</div>' : ''; }

var ZX_TPL = {};
/* 2 · Minimal */
ZX_TPL[2] = {w:760, css:'.t2{max-width:760px;padding:44px 48px;border:1px solid #E6E3DE}.t2 .hd{text-align:center;padding-bottom:22px}.t2 .wm{display:inline-block}.t2 .wm img{margin:0 auto}'+
  '.t2 .tg{font-size:12px;color:#6E675E;margin-top:8px;letter-spacing:.04em}.t2 .ttl{font:600 12px/1 Archivo,Arial,sans-serif;letter-spacing:.32em;margin-top:22px;color:#6E675E}'+
  '.t2 .meta{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #171715;border-bottom:1px solid #E6E3DE;padding:14px 0;font-size:12.5px}'+
  '.t2 .cust{display:flex;gap:28px;flex-wrap:wrap;padding:18px 0}.t2 .cust>div{flex:1 1 200px}'+
  '.t2 table.li th{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#6E675E;font-weight:600;padding:8px 0;border-bottom:1px solid #171715;text-align:left}.t2 table.li th.r{text-align:right}.t2 table.li th.c{text-align:center}'+
  '.t2 table.li td{padding:11px 0;border-bottom:1px solid #EFEDE8;vertical-align:top}.t2 tr.sg td{padding:14px 0 2px;border:0;font-size:12px;letter-spacing:.06em;text-transform:uppercase}.t2 tr.in td:first-child{padding-left:12px}'+
  '.t2 tr.ss td{font-size:12.5px;color:#1F5B3A;border-bottom:1px solid #E6E3DE}.t2 .sum{width:300px;margin:16px 0 0 auto}.t2 .sum td{padding:4px 0;font-size:13.5px}'+
  '.t2 .sum tr.tot td{border-top:1px solid #171715;padding-top:10px;font:700 17px/1.2 Archivo,Arial,sans-serif}.t2 .sum tr.cod td{font-size:15px;padding-top:6px}'+
  '.t2 .ft{margin-top:26px;border-top:1px solid #E6E3DE;padding-top:14px;text-align:center}.t2 .ft .st{margin-bottom:10px}.t2 .sv{font-size:12.5px;color:#1F5B3A;text-align:right;margin-top:6px}',
  html:function(D){ var L = D.L;
    return '<div class="ivd t2"><div class="hd"><div class="wm">'+zx_logoHTML(D)+'</div>'+(D.tagline?'<div class="tg">'+esc(D.tagline)+'</div>':'')+'<div class="ttl">'+esc(D.F(L.title))+'</div></div>'+
      '<div class="meta"><span>'+esc(D.invNo)+'</span><span>'+esc(D.orderNo)+'</span><span>'+esc(D.date)+'</span></div>'+
      '<div class="cust"><div><div class="lbl">'+esc(D.F(L.billTo))+'</div><b>'+esc(D.name)+'</b><div class="mut">'+esc(D.phone)+'</div></div><div><div class="lbl">'+esc(D.F(L.address))+'</div>'+esc(D.address)+'</div></div>'+
      '<table class="li"><thead><tr><th>'+esc(D.F(L.colItem))+'</th><th class="c">'+esc(D.F(L.colQty))+'</th><th class="r">'+esc(D.F(L.colUnit))+'</th><th class="r">'+esc(D.F(L.colAmount))+'</th></tr></thead><tbody>'+zx_itemRows(D, 4)+'</tbody></table>'+
      '<table class="sum">'+zx_totRows(D)+'</table>'+zx_saveLine(D)+
      '<div class="ft"><span class="st '+D.statusCls+'">'+esc(D.status)+'</span><div class="pol">'+esc(D.payLine)+'</div><div class="pol mut" style="margin-top:6px">'+esc(D.policy)+'</div><div class="xs mut" style="margin-top:6px">'+esc(D.contact)+'</div></div></div>'; }};
/* 3 · Bold brand header */
ZX_TPL[3] = {w:760, css:'.t3{max-width:760px;border:1px solid #DAD6CF}.t3 .band{background:var(--zx-b);color:#fff;padding:26px 30px;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}'+
  '.t3 .band .wm{color:#fff;font-size:30px}.t3 .band .tg{font-size:12px;opacity:.9;margin-top:6px}.t3 .band h1{font:800 34px/1 Archivo,"Arial Black",sans-serif;margin:0;letter-spacing:.06em;color:#fff;text-align:right}'+
  '.t3 .band .mm{font-size:12.5px;text-align:right;margin-top:6px;opacity:.95}.t3 .bd{padding:24px 30px 28px}.t3 .row2{display:flex;gap:18px;flex-wrap:wrap;align-items:stretch}'+
  '.t3 .box{flex:1 1 220px;border:1px solid #E6E3DE;border-radius:6px;padding:12px 14px}.t3 .due{flex:0 0 210px;border:3px solid #171715;border-radius:6px;padding:12px 14px;text-align:center}'+
  '.t3 .due .v{font:800 28px/1.1 Archivo,Arial,sans-serif;margin:4px 0}.t3 table.li{margin-top:18px}.t3 table.li th{background:#F2F1EE;font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:9px 10px;text-align:left;color:#3C3832}.t3 table.li th.r{text-align:right}.t3 table.li th.c{text-align:center}'+
  '.t3 table.li td{padding:10px;border-bottom:1px solid #EFEDE8;vertical-align:top}.t3 tr.sg td{background:#FAF8F4;border-left:4px solid var(--zx-b);font-size:12.5px}.t3 tr.in td:first-child{border-left:4px solid var(--zx-b)}'+
  '.t3 tr.ss td{font-size:12.5px;color:#1F5B3A}.t3 tr.ss td:first-child{border-left:4px solid var(--zx-b)}.t3 .sum{width:320px;margin:14px 0 0 auto}.t3 .sum td{padding:4px 10px;font-size:13.5px}.t3 .sum tr.tot td{background:#171715;color:#fff;font:800 17px/1.2 Archivo,Arial,sans-serif;padding:10px}.t3 .sum tr.cod td{font-size:15px;padding-top:8px}'+
  '.t3 .ft{margin-top:20px;padding-top:14px;border-top:2px solid #171715;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}.t3 .sv{text-align:right;font-size:12.5px;color:#1F5B3A;margin-top:6px}',
  html:function(D){ var L = D.L;
    return '<div class="ivd t3"><div class="band"><div><div class="wm">'+zx_logoHTML(D, true)+'</div>'+(D.tagline?'<div class="tg">'+esc(D.tagline)+'</div>':'')+'</div><div><h1>'+esc(D.F(L.title))+'</h1><div class="mm">'+zx_meta(D, ' · ')+'</div></div></div>'+
      '<div class="bd"><div class="row2"><div class="box"><div class="lbl">'+esc(D.F(L.billTo))+'</div><b>'+esc(D.name)+'</b><div>'+esc(D.phone)+'</div><div class="mut" style="margin-top:4px">'+esc(D.address)+'</div></div>'+
      '<div class="due"><div class="lbl">'+esc(D.F(L.codLabel))+'</div><div class="v">'+zx_m(D.codDue)+'</div><span class="st '+D.statusCls+'">'+esc(D.status)+'</span></div></div>'+
      '<table class="li"><thead><tr><th>'+esc(D.F(L.colItem))+'</th><th class="c">'+esc(D.F(L.colQty))+'</th><th class="r">'+esc(D.F(L.colUnit))+'</th><th class="r">'+esc(D.F(L.colAmount))+'</th></tr></thead><tbody>'+zx_itemRows(D, 4)+'</tbody></table>'+
      '<table class="sum">'+zx_totRows(D)+'</table>'+zx_saveLine(D)+
      '<div class="ft"><div class="pol" style="flex:1 1 300px"><b>'+esc(D.payLine)+'</b><br>'+esc(D.policy)+'</div><div class="pol r">'+esc(D.contact)+'</div></div></div></div>'; }};
/* 4 · Receipt (thermal style) */
ZX_TPL[4] = {w:400, css:'.t4{max-width:400px;padding:22px 20px;font-family:"Courier New",ui-monospace,Menlo,monospace;font-size:13px;border:1px solid #DAD6CF}.t4 .c0{text-align:center}'+
  '.t4 .wm{font-family:Archivo,"Arial Black",sans-serif;font-size:24px}.t4 .wm img{margin:0 auto}.t4 hr{border:0;border-top:1px dashed #171715;margin:10px 0}.t4 .ttl{letter-spacing:.3em;font-weight:700;margin-top:8px}'+
  '.t4 table td{padding:3px 0;vertical-align:top}.t4 tr.it td{padding-top:6px}.t4 tr.sg td{padding-top:8px;font-weight:700}.t4 tr.ss td{color:#1F5B3A}.t4 .sum tr.tot td{border-top:1px dashed #171715;border-bottom:1px dashed #171715;font-size:16px;font-weight:700;padding:6px 0}'+
  '.t4 .sum tr.cod td{font-size:15px;padding-top:6px}.t4 .st{font-family:Archivo,Arial,sans-serif;margin:6px 0}.t4 .sv{text-align:center;margin-top:6px}',
  html:function(D){ var L = D.L, n = 0;
    var rows = D.groups.map(function(g){
      return (g.set ? '<tr class="sg"><td colspan="2">** '+esc(D.F(L.setTag, {set:g.set}))+'</td></tr>' : '')+
        g.items.map(function(it){ return '<tr class="it"><td colspan="2">'+esc(it.name)+'</td></tr><tr><td>'+esc(it.colour)+' / '+esc(it.size)+' &nbsp;'+it.qty+' × '+zx_m(it.unit)+(it.was?' <span class="was">'+zx_m(it.was)+'</span>':'')+'</td><td class="r">'+zx_m(it.amount)+'</td></tr>'; }).join('')+
        (g.set && g.saving ? '<tr class="ss"><td>'+esc(g.label || D.F(L.setSaving))+'</td><td class="r">−'+zx_m(g.saving)+'</td></tr>' : '');
    }).join('');
    return '<div class="ivd t4"><div class="c0"><div class="wm">'+zx_logoHTML(D)+'</div>'+(D.tagline?'<div class="xs">'+esc(D.tagline)+'</div>':'')+'<div class="xs">'+esc(D.contact)+'</div><div class="ttl">'+esc(D.F(L.title))+'</div></div><hr>'+
      '<div>'+esc(D.invNo)+'<br>'+esc(D.orderNo)+'<br>'+esc(D.date)+'</div><hr><div><b>'+esc(D.name)+'</b><br>'+esc(D.phone)+'<br>'+esc(D.address)+'</div><hr>'+
      '<table>'+rows+'</table><hr><table class="sum">'+zx_totRows(D)+'</table>'+zx_saveLine(D)+'<hr>'+
      '<div class="c0"><span class="st '+D.statusCls+'">'+esc(D.status)+'</span><div class="xs">'+esc(D.payLine)+'</div></div><hr><div class="xs c0">'+esc(D.policy)+'</div><div class="xs c0" style="margin-top:8px">'+esc(D.thanks)+'</div></div>'; }};
/* 5 · Two-column */
ZX_TPL[5] = {w:800, css:'.t5{max-width:800px;display:flex;border:1px solid #DAD6CF;min-height:560px}.t5 .side{flex:0 0 240px;background:var(--zx-t);padding:26px 22px;border-right:1px solid #E1DDD6}'+
  '.t5 .side .wm{font-size:24px}.t5 .side .tg{font-size:11.5px;color:#4A463F;margin-top:6px}.t5 .side .blk{margin-top:22px;font-size:13px}.t5 .side .due{margin-top:22px;background:#fff;border:2px solid #171715;border-radius:6px;padding:12px;text-align:center}'+
  '.t5 .side .due .v{font:800 24px/1.1 Archivo,Arial,sans-serif;margin:4px 0}.t5 .main{flex:1;padding:26px 26px 22px;min-width:0}.t5 .main h1{font:800 22px/1 Archivo,Arial,sans-serif;margin:0 0 4px;letter-spacing:.08em}'+
  '.t5 table.li{margin-top:16px}.t5 table.li th{font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;color:#6E675E;padding:0 6px 8px;border-bottom:2px solid #171715;text-align:left}.t5 table.li th.r{text-align:right}.t5 table.li th.c{text-align:center}'+
  '.t5 table.li td{padding:9px 6px;border-bottom:1px solid #EFEDE8;vertical-align:top}.t5 tr.sg td{font-size:12px;padding-top:12px;color:var(--zx-b)}.t5 tr.in td:first-child{padding-left:14px}.t5 tr.ss td{font-size:12.5px;color:#1F5B3A}'+
  '.t5 .sum{width:290px;margin:14px 0 0 auto}.t5 .sum td{padding:4px 6px;font-size:13.5px}.t5 .sum tr.tot td{border-top:2px solid #171715;font:800 17px/1.2 Archivo,Arial,sans-serif;padding-top:9px}.t5 .sum tr.cod td{font-size:14.5px}'+
  '.t5 .pol{margin-top:18px;border-top:1px solid #E6E3DE;padding-top:10px}.t5 .sv{text-align:right;font-size:12.5px;color:#1F5B3A;margin-top:6px}',
  html:function(D){ var L = D.L;
    return '<div class="ivd t5"><div class="side"><div class="wm">'+zx_logoHTML(D)+'</div>'+(D.tagline?'<div class="tg">'+esc(D.tagline)+'</div>':'')+
      '<div class="blk"><div class="lbl">'+esc(D.F(L.billTo))+'</div><b>'+esc(D.name)+'</b><br>'+esc(D.phone)+'</div>'+
      '<div class="blk"><div class="lbl">'+esc(D.F(L.address))+'</div>'+esc(D.address)+'</div>'+
      '<div class="due"><div class="lbl">'+esc(D.F(L.codLabel))+'</div><div class="v">'+zx_m(D.codDue)+'</div><span class="st '+D.statusCls+'">'+esc(D.status)+'</span></div>'+
      '<div class="blk xs">'+esc(D.contact)+'</div></div>'+
      '<div class="main"><h1>'+esc(D.F(L.title))+'</h1><div class="xs mut">'+zx_meta(D, ' · ')+'</div>'+
      '<table class="li"><thead><tr><th>'+esc(D.F(L.colItem))+'</th><th class="c">'+esc(D.F(L.colQty))+'</th><th class="r">'+esc(D.F(L.colUnit))+'</th><th class="r">'+esc(D.F(L.colAmount))+'</th></tr></thead><tbody>'+zx_itemRows(D, 4, {dot:true})+'</tbody></table>'+
      '<table class="sum">'+zx_totRows(D)+'</table>'+zx_saveLine(D)+'<div class="pol"><b>'+esc(D.payLine)+'</b><br>'+esc(D.policy)+'</div></div></div>'; }};
/* 6 · Dark accent */
ZX_TPL[6] = {w:760, css:'.t6{max-width:760px;border:1px solid #2A2B2F}.t6 .hd{background:#1E1F22;color:#fff;padding:26px 30px 22px;border-bottom:4px solid #C08A3E;display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap}'+
  '.t6 .hd .wm{color:#fff}.t6 .hd .tg{font-size:12px;color:#D9D3C7;margin-top:6px}.t6 .hd h1{font:700 15px/1 Archivo,Arial,sans-serif;letter-spacing:.34em;color:#E5C48F;margin:0 0 8px;text-align:right}.t6 .hd .mm{font-size:12.5px;color:#EDE8DF;text-align:right}'+
  '.t6 .bd{padding:22px 30px 26px}.t6 .cust{display:flex;gap:24px;flex-wrap:wrap}.t6 .cust>div{flex:1 1 200px}.t6 table.li{margin-top:18px}'+
  '.t6 table.li th{font-size:10.5px;text-transform:uppercase;letter-spacing:.12em;color:#1E1F22;padding:8px 8px;border-top:2px solid #1E1F22;border-bottom:1px solid #1E1F22;text-align:left}.t6 table.li th.r{text-align:right}.t6 table.li th.c{text-align:center}'+
  '.t6 table.li td{padding:10px 8px;border-bottom:1px solid #ECE9E3;vertical-align:top}.t6 tr.sg td{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7A5A22;padding-top:14px}.t6 tr.in td:first-child{padding-left:16px}.t6 tr.ss td{font-size:12.5px;color:#7A5A22}'+
  '.t6 .low{display:flex;gap:18px;margin-top:16px;flex-wrap:wrap;align-items:flex-start}.t6 .low .pay{flex:1 1 260px}.t6 .sum{flex:0 0 300px}.t6 .sum td{padding:4px 8px;font-size:13.5px}'+
  '.t6 .sum tr.tot td{background:#1E1F22;color:#fff;font:800 17px/1.2 Archivo,Arial,sans-serif;padding:10px 8px}.t6 .sum tr.tot td.r{color:#E5C48F}.t6 .sum tr.cod td{font-size:15px;padding-top:8px;border-bottom:2px solid #C08A3E}'+
  '.t6 .ft{margin-top:20px;font-size:11.5px;color:#5E5850;border-top:1px solid #ECE9E3;padding-top:10px}.t6 .sv{font-size:12.5px;color:#7A5A22;margin-top:8px}',
  html:function(D){ var L = D.L;
    return '<div class="ivd t6"><div class="hd"><div><div class="wm">'+zx_logoHTML(D, true)+'</div>'+(D.tagline?'<div class="tg">'+esc(D.tagline)+'</div>':'')+'</div><div><h1>'+esc(D.F(L.title))+'</h1><div class="mm">'+zx_meta(D)+'</div></div></div>'+
      '<div class="bd"><div class="cust"><div><div class="lbl">'+esc(D.F(L.billTo))+'</div><b>'+esc(D.name)+'</b><div>'+esc(D.phone)+'</div></div><div><div class="lbl">'+esc(D.F(L.address))+'</div>'+esc(D.address)+'</div></div>'+
      '<table class="li"><thead><tr><th class="c">'+esc(D.F(L.colNo))+'</th><th>'+esc(D.F(L.colItem))+'</th><th class="c">'+esc(D.F(L.colQty))+'</th><th class="r">'+esc(D.F(L.colUnit))+'</th><th class="r">'+esc(D.F(L.colAmount))+'</th></tr></thead><tbody>'+zx_itemRows(D, 5, {no:true})+'</tbody></table>'+
      '<div class="low"><div class="pay"><span class="st '+D.statusCls+'">'+esc(D.status)+'</span><div class="pol" style="margin-top:8px">'+esc(D.payLine)+'</div>'+zx_saveLine(D)+'</div><table class="sum">'+zx_totRows(D)+'</table></div>'+
      '<div class="ft">'+esc(D.policy)+'<br>'+esc(D.contact)+'</div></div></div>'; }};
/* 7 · Modern cards */
ZX_TPL[7] = {w:760, css:'.t7{max-width:760px;background:#F4F3F0;padding:22px;border-radius:10px}.t7 .cd{background:#fff;border:1px solid #E6E3DE;border-radius:10px;padding:16px 18px}.t7 .cd+.cd{margin-top:12px}'+
  '.t7 .top{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}.t7 .top .wm{color:var(--zx-b)}.t7 .top .tg{font-size:12px;color:#6E675E;margin-top:5px}.t7 .pill{display:inline-block;background:var(--zx-t);color:#171715;border-radius:99px;padding:4px 10px;font-size:12px;font-weight:600;margin:2px 0 2px 4px}'+
  '.t7 .g2{display:flex;gap:12px;flex-wrap:wrap}.t7 .g2>.cd{flex:1 1 220px;margin-top:12px}.t7 .it{display:flex;gap:12px;align-items:center;padding:10px 0;border-top:1px solid #EFEDE8}.t7 .it:first-child{border-top:0}'+
  '.t7 .sw{flex:0 0 34px;height:34px;border-radius:8px;border:1px solid rgba(0,0,0,.15)}.t7 .it .nm{flex:1;min-width:0}.t7 .grp{border:1px dashed var(--zx-b);border-radius:8px;padding:2px 12px 8px;margin:8px 0}.t7 .grp .gh{display:flex;justify-content:space-between;font-size:12.5px;font-weight:700;padding:8px 0 2px}'+
  '.t7 .grp .gh span:last-child{color:#1F5B3A}.t7 .sum td{padding:4px 0;font-size:13.5px}.t7 .sum tr.tot td{border-top:1px solid #E6E3DE;font:800 18px/1.2 Archivo,Arial,sans-serif;padding-top:9px}.t7 .sum tr.cod td{font-size:15px}'+
  '.t7 .due{background:#171715;color:#fff;border-radius:10px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px;flex-wrap:wrap}.t7 .due .v{font:800 26px/1 Archivo,Arial,sans-serif}.t7 .due .st{color:#fff}'+
  '.t7 .sv{font-size:12.5px;color:#1F5B3A;margin-top:6px}',
  html:function(D){ var L = D.L;
    var it = function(x){ return '<div class="it"><span class="sw" style="background:'+esc(x.hex)+'"></span><div class="nm"><div class="b">'+esc(x.name)+'</div><div class="xs mut">'+esc(x.colour)+' · '+esc(D.F(L.size))+' '+esc(x.size)+' · '+esc(D.F(L.colQty))+' '+x.qty+'</div></div><div class="r"><div class="b">'+zx_m(x.amount)+'</div>'+(x.was?'<span class="was">'+zx_m(x.was*x.qty)+'</span>':'')+'</div></div>'; };
    var items = D.groups.map(function(g){ return g.set ? '<div class="grp"><div class="gh"><span>'+esc(D.F(L.setTag, {set:g.set}))+'</span>'+(g.saving?'<span>'+esc(D.F(L.setSaving))+' −'+zx_m(g.saving)+'</span>':'')+'</div>'+g.items.map(it).join('')+'</div>' : g.items.map(it).join(''); }).join('');
    var tot = zx_totRows(D, {noPay:true}) + (D.paid ? '<tr><td>'+esc(D.F(L.paidLabel))+' · '+esc(D.method)+'</td><td class="r">−'+zx_m(D.paid)+'</td></tr>' : '');
    return '<div class="ivd t7"><div class="cd top"><div><div class="wm">'+zx_logoHTML(D)+'</div>'+(D.tagline?'<div class="tg">'+esc(D.tagline)+'</div>':'')+'</div><div class="r"><b>'+esc(D.F(L.title))+'</b><br><span class="pill">'+esc(D.invNo)+'</span><span class="pill">'+esc(D.orderNo)+'</span><div class="xs mut" style="margin-top:4px">'+esc(D.date)+'</div></div></div>'+
      '<div class="g2"><div class="cd"><div class="lbl">'+esc(D.F(L.billTo))+'</div><b>'+esc(D.name)+'</b><div>'+esc(D.phone)+'</div></div><div class="cd"><div class="lbl">'+esc(D.F(L.address))+'</div>'+esc(D.address)+'</div></div>'+
      '<div class="cd"><div class="lbl">'+esc(D.F(L.items))+'</div>'+items+'</div>'+
      '<div class="cd"><table class="sum">'+tot+'</table>'+zx_saveLine(D)+'</div>'+
      '<div class="due"><div><div class="xs" style="opacity:.8;letter-spacing:.1em;text-transform:uppercase">'+esc(D.F(L.codLabel))+'</div><div class="v">'+zx_m(D.codDue)+'</div></div><span class="st">'+esc(D.status)+'</span></div>'+
      '<div class="cd pol">'+esc(D.payLine)+'<br>'+esc(D.policy)+'<br><span class="mut">'+esc(D.contact)+'</span></div></div>'; }};

/* one design → markup (styles inside, so it travels into the file, the print frame and the JPG) */
function zx_invHTML(o, n){
  var t = ZX_TPL[n]; if(!t) return null;
  var D = zx_invData(o), b = zx_brandHex();
  return '<style>'+ZX_BASE+t.css+'</style><div style="--zx-b:'+esc(b)+';--zx-t:color-mix(in srgb, '+esc(b)+' 12%, #fff)">'+t.html(D)+'</div>';
}
function zx_width(n){ return n===1 ? 760 : ((ZX_TPL[n]||{}).w || 760); }
/* design 1 is the existing sheet; 2–7 replace it wherever the invoice is drawn */
(function(){
  if(typeof inv_sheet!=='function' || inv_sheet._zx) return;
  var orig = inv_sheet;
  var w = function(o, T){ var n = zx_design(); if(n>1 && !w._force1){ try{ var h = zx_invHTML(o, n); if(h) return '<div class="zx-inv">'+h+'</div>'; }catch(e){ console.error(e); } } return orig.apply(this, arguments); };
  w._zx = true; w._orig = orig; window.inv_sheet = w;
  /* the classic frame's rules (td borders, .sheet padding) must not reach a different design */
  var oc = window.inv_css; if(typeof oc==='function' && !oc._zx){ var cw = function(root, pre){ if(zx_design()>1) return root+'{margin:0;padding:12px;background:#fff;text-align:left}@media print{'+root+'{padding:0}}'; return oc.apply(this, arguments); }; cw._zx = true; cw._orig = oc; window.inv_css = cw; }
})();
function zx_sheetFor(o, n){
  if(n===1){ var f = inv_sheet._orig || inv_sheet, c = inv_css._orig || inv_css; return '<style>'+c('.zx-c1', '.zx-c1 ')+'</style><div class="zx-c1">'+f(o)+'</div>'; }
  return zx_invHTML(o, n);
}

/* ---------- a sample order for the previews: a combo + 3 more pieces (real prices from the engine) ---------- */
function zx_sample(){
  var keepBag = ST.bag, keepAck = ST.bracketAck, o = null;
  try{
    var cmb = (typeof combos==='function' ? combos() : []).filter(function(c){ return c.active!==false && c.items && c.items.length>=2; })[0];
    var pick = function(cat, sale){ return DB.products.filter(function(p){ return p.cat===cat && (!sale || p.compareAt>p.price); })[0] || DB.products.filter(function(p){ return p.cat===cat; })[0]; };
    var bag = [];
    if(cmb){ var it = cmb.items.map(function(pid, i){ var p = P(pid); return {product:pid, color:p.colors[i % p.colors.length], size:p.sizes[Math.min(1, p.sizes.length-1)]}; });
      bag.push({id:'zx1', kind:'set', source:'combo', refId:cmb.id, name:cmb.name, items:it, price:cmb.price, qty:1}); }
    [['panjabi'],['trousers', true],['tshirts']].forEach(function(x, i){ var p = pick(x[0], x[1]); if(p) bag.push({id:'zx'+(i+2), kind:'item', product:p.id, color:p.colors[0], size:p.sizes[Math.min(2, p.sizes.length-1)], qty:1}); });
    ST.bag = bag; ST.bracketAck = {};
    var tot = bagTotals(), lines = [];
    bag.forEach(function(l){ if(l.kind==='item') lines.push({product:l.product, color:l.color, size:l.size, qty:l.qty, unitPrice:P(l.product).price});
      else l.items.forEach(function(it){ lines.push({product:it.product, color:it.color, size:it.size, qty:1, unitPrice:P(it.product).price, setLabel:l.name, setId:l.id}); }); });
    var delivery = deliveryCharge('out', tot.total);
    o = {id:'EX-2051', name:'Nusrat Jahan', phone:'01712345678', address:'House 12, Road 5, Sector 7, Uttara, Dhaka 1230', zone:'out', lines:lines, setDiscounts:tot.setDiscounts,
      subtotal:tot.subtotal, discount:tot.discount, delivery:delivery, total:tot.total+delivery, payment:'cod', status:'packed', createdAt:Date.now()-3*3600000, flags:[], sample:true};
  }catch(e){ console.error(e); }
  ST.bag = keepBag; ST.bracketAck = keepAck;
  return o;
}

/* ---------- WhatsApp invoice: a full-page JPG drawn in the browser ---------- */
function zx_jpg(o, n, cb){
  try{
    var w = zx_width(n), html = zx_sheetFor(o, n);
    var host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-12000px;top:0;';
    var page = document.createElement('div'); page.style.cssText = 'width:'+w+'px;background:#fff;padding:0;margin:0';
    page.innerHTML = html; host.appendChild(page); document.body.appendChild(host);
    var h = Math.ceil(page.getBoundingClientRect().height) + 2;
    var xml = new XMLSerializer().serializeToString(page);
    document.body.removeChild(host);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><foreignObject x="0" y="0" width="'+w+'" height="'+h+'">'+xml+'</foreignObject></svg>';
    var img = new Image();
    img.onload = function(){
      try{ var s = 2, c = document.createElement('canvas'); c.width = w*s; c.height = h*s; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.scale(s, s); x.drawImage(img, 0, 0);
        cb(c.toDataURL('image/jpeg', 0.9), w*s, h*s); }catch(e){ cb(null); }
    };
    img.onerror = function(){ cb(null); };
    img.src = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }catch(e){ console.error(e); cb(null); }
}
function zx_waModal(o){
  var n = zx_design(), u = UI['zx-wa'] || {}, fmtc = zx_cfg().waFormat;
  return '<div class="zx-wa"><p class="small text2" style="margin:0 0 10px">'+(fmtc==='jpg' ? 'Invoice <b>'+esc(inv_no(o))+'</b> as one full-page JPG with your logo — design '+n+' · '+esc(zx_dname(n))+'. The customer gets it on WhatsApp after the order is processed.' : 'Your setting is <b>PDF</b>. The customer gets the invoice as a PDF file. Switch to JPG in Settings → Invoice wording.')+'</p>'+
    (fmtc==='jpg' ? (u.src ? '<div class="zx-wa-img"><img src="'+u.src+'" alt="WhatsApp invoice '+esc(inv_no(o))+'"></div><div class="xs muted mt8">'+u.w+' × '+u.h+' px · JPG</div>' : (u.err ? '<div class="zs-note">'+ico('info',16)+'<span>This browser could not draw the picture. Use “Print / Save as PDF” on the invoice instead.</span></div>' : '<div class="zx-wa-wait">Drawing the picture…</div>')) : '')+
    '<div class="zs-actions mt16">'+(fmtc==='jpg' && u.src ? '<a class="btn btn-secondary" href="'+u.src+'" download="'+esc(inv_no(o))+'.jpg">'+ico('share',15)+'Download JPG</a>' : '')+
      '<button type="button" class="btn btn-primary" data-act="zx-wa-send" data-id="'+esc(o.id)+'"'+(fmtc==='jpg' && !u.src ? ' disabled' : '')+'>'+ico('chat',15)+'Send on WhatsApp (demo)</button></div>'+
    (o.waInvoice ? '<div class="xs muted mt8">Last sent '+esc(dateTimeStr(o.waInvoice.at))+' · '+esc(String(o.waInvoice.format).toUpperCase())+'</div>' : '')+'</div>';
}
ACT['zx-wa'] = function(el){
  var id = el.getAttribute('data-id'), o = ST.orders[id] || (id==='EX-2051' ? zx_sample() : null); if(!o) return;
  UI['zx-wa'] = {id:o.id};
  openModal(zx_waModal(o), {title:'WhatsApp invoice · '+o.id, wide:true, rebuild:function(){ return zx_waModal(o); }});
  if(zx_cfg().waFormat==='jpg') zx_jpg(o, zx_design(), function(src, w, h){ var u = UI['zx-wa']; if(!u || u.id!==o.id) return; if(src){ u.src = src; u.w = w; u.h = h; } else u.err = true; if(MODAL) refreshModal(); });
};
ACT['zx-wa-send'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')];
  if(o){ o.waInvoice = {at:Date.now(), format:zx_cfg().waFormat}; o.notif = o.notif || []; o.notif.push({ch:'WhatsApp', what:'Invoice ('+zx_cfg().waFormat.toUpperCase()+')', at:Date.now(), st:'sent (demo)'}); saveState(); }
  closeModal(); toast('WhatsApp invoice sent (demo) — nothing really leaves this browser');
};

/* =====================================================================
   PACKING ORDER — category with most pieces first, then style (B1.4, B1.6)
   ===================================================================== */
function zx_runOrders(){
  /* still with us: not cancelled / returned, not delivered, and the courier has not picked it up */
  return ao_list().filter(function(o){
    if(!zx_open(o) || o.status==='delivered' || o.status==='shipped') return false;
    var p = zx_parcel(o); return !p || p.st==='booked';
  });
}
var ZX_SOFT = ['2 sizes — for someone else','Exchange requested'];
function zx_problem(o){ return (o.flags||[]).filter(function(f){ return ZX_SOFT.indexOf(f)<0; }); }
function zx_rank(orders){
  var cat = {}, sty = {};
  orders.forEach(function(o){ (o.lines||[]).forEach(function(l){ var p = P(l.product); if(!p) return; var q = l.qty||1; cat[p.cat] = (cat[p.cat]||0)+q; sty[p.id] = (sty[p.id]||0)+q; }); });
  var cats = Object.keys(cat).sort(function(a,b){ return cat[b]-cat[a] || a.localeCompare(b); });
  var styl = Object.keys(sty).sort(function(a,b){ var pa = P(a), pb = P(b); return cats.indexOf(pa.cat)-cats.indexOf(pb.cat) || sty[b]-sty[a] || a.localeCompare(b); });
  return {cat:cat, sty:sty, cats:cats, styles:styl, key:function(l){ return styl.indexOf(l.product); }};
}
function zx_sortRun(orders){
  var R = zx_rank(orders);
  var items = function(o){ return (o.lines||[]).slice().sort(function(a,b){ return R.key(a)-R.key(b); }); };
  var top = function(o){ return Math.min.apply(null, (o.lines||[]).map(function(l){ var k = R.key(l); return k<0 ? 999 : k; }).concat([999])); };
  return {R:R, list:orders.slice().sort(function(a,b){ return top(a)-top(b) || (a.createdAt||0)-(b.createdAt||0); }).map(function(o){ return {o:o, lines:items(o), group:(P((items(o)[0]||{}).product)||{}).cat}; })};
}

/* ---------- courier sticker (one per order, the full item list on it) ---------- */
function zx_stickerHTML(o, lines, size){
  var p = zx_parcel(o), c = p ? zk_c(p.courier) : null, T = inv_tpl(), D = {shop:zx_shopName(T), logo:zx_logoSrc(T)};
  var cid = p ? p.cid : '';
  var bars = cid ? '<div class="zx-bars" aria-hidden="true">'+(cid+cid.split('').reverse().join('')).split('').map(function(ch, i){ var k = ch.charCodeAt(0) + i*7, h = ''; for(var j=0;j<3;j++) h += '<i style="width:'+(1+((k>>j)&1)*2)+'px"></i>'; return h; }).join('')+'</div>' : '';
  var cod = p ? p.cod : (o.payment==='cod' ? o.total : 0);
  return '<div class="zx-stk s'+esc(size)+'"><div class="zx-sh"><b class="zx-swm">'+zx_logoHTML(D)+'</b><span class="zx-scour">'+esc(c ? c.name : 'Not booked')+'</span></div>'+
    (cid ? bars+'<div class="zx-cid">'+esc(cid)+'</div><div class="zx-src">Barcode and number from '+esc(c ? c.name : 'the courier')+' (sample)</div>' : '<div class="zx-nb">Book the courier first — the consignment number and barcode come from the courier, never from us.</div>')+
    '<div class="zx-to"><div><span>To</span><b>'+esc(o.name)+'</b></div><div><span>Phone</span><b>'+esc(ao_phone(o))+'</b></div><div><span>Address</span>'+esc(o.address)+'</div><div><span>Order</span><b>'+esc(o.id)+'</b></div></div>'+
    '<div class="zx-sitems"><div class="zx-sih"><span>Items · '+zx_pcs(zx_units(o))+'</span><span>Qty</span></div>'+lines.map(function(l){ var pp = P(l.product); return '<div class="zx-sit"><span><b>'+esc(pp ? pp.name : l.product)+'</b> · '+esc((COL(l.color)||{}).name || l.color)+' · '+esc(l.size)+(l.setLabel?' <i>('+esc(l.setLabel)+')</i>':'')+'</span><b>'+(l.qty||1)+'</b></div>'; }).join('')+'</div>'+
    '<div class="zx-cod"><span>'+(cod ? 'COLLECT CASH' : 'PAID — collect nothing')+'</span><b>'+(cod ? esc(fmt(cod)) : '৳0')+'</b></div>'+
    (o.note ? '<div class="zx-snote">Note: '+esc(o.note)+'</div>' : '')+'</div>';
}
/* ---------- picking list (EXTAS letterhead, summary line, tick boxes) ---------- */
function zx_pickData(orders){
  var ok = orders.filter(function(o){ return !zx_problem(o).length; }), held = orders.filter(function(o){ return zx_problem(o).length; });
  var R = zx_rank(ok), byStyle = {};
  ok.forEach(function(o){ (o.lines||[]).forEach(function(l){ var s = byStyle[l.product] = byStyle[l.product] || {pcs:0, colors:{}}; var q = l.qty||1; s.pcs += q; var c = s.colors[l.color] = s.colors[l.color] || {pcs:0, sizes:{}}; c.pcs += q; c.sizes[l.size] = (c.sizes[l.size]||0) + q; }); });
  var short = [];
  var groups = R.cats.map(function(cat){
    return {cat:cat, name:(CAT(cat)||{}).name || cat, pcs:R.cat[cat], styles:R.styles.filter(function(id){ return P(id).cat===cat; }).map(function(id){
      var p = P(id), s = byStyle[id];
      return {id:id, name:p.name, pcs:s.pcs, colors:Object.keys(s.colors).sort(function(a,b){ return s.colors[b].pcs - s.colors[a].pcs; }).map(function(cid){
        var c = s.colors[cid], sizes = p.sizes.filter(function(z){ return c.sizes[z]; }).map(function(z){ var have = zx_onHand(id, cid, z); var sh = Math.max(0, c.sizes[z] - have); if(sh) short.push({name:p.name, color:(COL(cid)||{}).name, size:z, need:c.sizes[z], short:sh}); return {z:z, q:c.sizes[z], short:sh}; });
        return {id:cid, name:(COL(cid)||{}).name || cid, pcs:c.pcs, sizes:sizes};
      })};
    })};
  });
  var lineItems = ok.reduce(function(s,o){ return s + (o.lines||[]).length; }, 0);
  return {ok:ok, held:held, groups:groups, pcs:ok.reduce(function(s,o){ return s + zx_units(o); }, 0), lineItems:lineItems, short:short};
}
function zx_letterhead(title, sub){
  var T = inv_tpl(), V = {tagline:(T.shop||{}).tagline, whatsapp:(T.shop||{}).whatsapp || DB.whatsapp || '', hotline:(T.shop||{}).hotline || DB.hotline || ''};
  var lines = (T.shopLines||[]).map(function(s){ return inv_fill(s, V); }).filter(function(s){ return s; });
  return '<div class="zx-lh"><div><div class="zx-lwm">'+zx_logoHTML({shop:zx_shopName(T), logo:zx_logoSrc(T)})+'</div><div class="zx-lsub">'+lines.map(esc).join(' · ')+'</div></div><div class="zx-lt"><b>'+esc(title)+'</b><div>'+esc(sub)+'</div></div></div>';
}
function zx_summaryLine(d){
  return '<div class="zx-sum" data-testid="zx-summary"><span><b>'+d.ok.length+'</b> orders</span><span><b>'+d.pcs+'</b> pieces</span><span><b>'+d.lineItems+'</b> line items</span>'+
    '<span>Categories: '+(d.groups.length ? d.groups.map(function(g){ return esc(g.name)+' '+g.pcs; }).join(' → ') : '—')+'</span>'+
    '<span class="'+(d.short.length?'bad':'')+'">Short: <b>'+d.short.length+'</b></span><span class="'+(d.held.length?'warn':'')+'">Held / problem: <b>'+d.held.length+'</b> (not counted)</span></div>';
}
function zx_pickHTML(d){
  var rows = d.groups.map(function(g){
    return '<tbody><tr class="zx-pc"><th colspan="4">'+esc(g.name)+' — '+zx_pcs(g.pcs)+'</th></tr>'+g.styles.map(function(s){
      return '<tr class="zx-ps"><td colspan="3"><b>'+esc(s.name)+'</b> — '+zx_pcs(s.pcs)+'</td><td></td></tr>'+s.colors.map(function(c){
        return '<tr><td class="zx-pcol">'+esc(c.name)+' — '+zx_pcs(c.pcs)+'</td><td>'+c.sizes.map(function(z){ return '<span class="zx-z'+(z.short?' sh':'')+'">'+esc(z.z)+' — '+z.q+(z.short?' (short '+z.short+')':'')+'</span>'; }).join('')+'</td><td class="r">'+c.pcs+'</td><td class="zx-tick"><span aria-label="tick when picked"></span></td></tr>';
      }).join('');
    }).join('')+'</tbody>';
  }).join('');
  return '<div class="zx-doc zx-pick">'+zx_letterhead('Picking list', dateTimeStr(Date.now()))+zx_summaryLine(d)+
    (d.groups.length ? '<table class="zx-pt"><thead><tr><th>Style / colour</th><th>Sizes</th><th class="r">Pcs</th><th>Picked</th></tr></thead>'+rows+'</table>' : '<div class="zx-empty">Nothing to pick — every order has gone to the courier.</div>')+
    (d.held.length ? '<div class="zx-held"><b>Held / problem orders — not in the quantities above</b>'+d.held.map(function(o){ return '<div>'+esc(o.id)+' · '+esc(o.name)+' · '+zx_pcs(zx_units(o))+' · '+esc(zx_problem(o).join(', '))+'</div>'; }).join('')+'</div>' : '')+
    '<div class="zx-dfoot">Orders already picked up by the courier never appear here. Sorted: category with the most pieces first, then style, then colour.</div></div>';
}

/* =====================================================================
   FULFILMENT PAGE
   ===================================================================== */
PAGES['zx-ful'] = { layout:'admin', title:'Fulfilment', render:function(params, q){
  var tab = (q && q.tab) || 'run', run = zx_runOrders(), d = zx_pickData(run);
  var tabs = zo_tabs('#/admin/fulfilment', [['run','Print run', run.length || ''],['stickers','Courier stickers'],['picking','Picking list'],['invoices','Invoice designs']], tab);
  var body = tab==='stickers' ? zx_tabStickers(run) : tab==='picking' ? zx_tabPicking(d) : tab==='invoices' ? zx_tabInvoices(q) : zx_tabRun(run, d);
  return '<div class="zs-page zx-page">'+zo_head('Admin · Fulfilment '+zs_pr('179–182 · 404–412'), 'Fulfilment', 'প্যাকিং — কুরিয়ার বুকিং, স্টিকার, পিকিং লিস্ট আর ইনভয়েস এক জায়গায়',
    'Every order still with us — not yet picked up by the courier — however many days old. Book the courier, print the stickers in packing order, and hand the picking list to the store.', zs_simTag('Demo · nothing is printed or sent'))+tabs+body+'</div>';
}};
function zx_docCol(o){
  var p = zx_parcel(o), out = [];
  out.push('<span class="zo-pill ok">'+ico('check',11)+'Invoice</span>');
  out.push(p ? '<span class="zo-pill ok">'+ico('check',11)+esc((zk_c(p.courier)||{}).name)+' '+esc(p.cid)+'</span>' : '<span class="zo-pill">Not booked</span>');
  out.push(o.docs && o.docs.sticker ? '<span class="zo-pill ok">'+ico('check',11)+'Sticker</span>' : '<span class="zo-pill">No sticker yet</span>');
  return out.join(' ');
}
function zx_tabRun(run, d){
  var unbooked = run.filter(function(o){ return !zx_parcel(o) && !zx_problem(o).length; }).length;
  return zx_summaryLine(d)+
    '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2>Orders still with us</h2><div class="zs-actions">'+
      '<button type="button" class="btn btn-sm btn-secondary" data-act="zx-bookall"'+(unbooked?'':' disabled')+'>'+ico('truck',14)+'1 · Book courier'+(unbooked?' ('+unbooked+')':'')+'</button>'+
      '<a class="btn btn-sm btn-secondary" href="#/admin/fulfilment?tab=stickers">'+ico('doc',14)+'2 · Print stickers</a>'+
      '<a class="btn btn-sm btn-primary" href="#/admin/fulfilment?tab=picking">'+ico('doc',14)+'Picking list</a></div></div>'+
    '<div class="zs-sub">Packing slips are not used — the sticker carries the full item list. A reprint always uses the stored consignment, so it never makes a second parcel.</div>'+
    (run.length ? '<div class="zo-tw mt8"><table class="zo-tbl zx-rt"><thead><tr><th>Order</th><th>Customer</th><th class="r">Pcs</th><th class="r">COD</th><th>Documents</th><th>Check</th></tr></thead><tbody>'+
      run.map(function(o){ var pr = zx_problem(o); return '<tr><td><button type="button" class="ao-idbtn" data-act="ao-open" data-id="'+esc(o.id)+'">'+esc(o.id)+'</button><div class="zs-mini">'+esc(ao_when(o.createdAt))+'</div></td><td>'+esc(o.name)+'<div class="zs-mini">'+esc(ao_zone(o))+'</div></td><td class="r">'+zx_units(o)+'</td><td class="r">'+fmt(o.payment==='cod'?o.total:0)+'</td><td>'+zx_docCol(o)+'</td><td>'+(pr.length ? '<span class="zo-pill warn">'+esc(pr[0])+'</span>' : '<span class="zo-pill ok">Ready</span>')+'</td></tr>'; }).join('')+
      '</tbody></table></div>' : '<div class="zs-mini mt8">Nothing waiting — every order has gone to the courier.</div>')+'</section>';
}
function zx_tabStickers(run){
  var S = zx_sortRun(run.filter(function(o){ return !zx_problem(o).length; })), size = zx_cfg().sticker;
  var booked = S.list.filter(function(x){ return zx_parcel(x.o); });
  var groups = '', last = null;
  booked.forEach(function(x){ if(x.group!==last){ groups += '<div class="zx-sg">'+esc((CAT(x.group)||{}).name || x.group)+'</div>'; last = x.group; } groups += zx_stickerHTML(x.o, x.lines, size); });
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><div><h2>Courier stickers · packing order</h2><div class="zs-sub">Category with the most pieces first, then the style with the most pieces. An order with several categories prints once, in the group of its top item.</div></div>'+
      '<div class="zs-actions"><label class="small" for="zx-size">Size</label><select id="zx-size" class="input zs-in" data-change="zx-size" aria-label="Sticker size">'+ZX_STICKER_SIZES.map(function(s){ return '<option value="'+s[0]+'"'+(s[0]===size?' selected':'')+'>'+esc(s[1])+'</option>'; }).join('')+'</select>'+
      '<button type="button" class="btn btn-sm btn-primary" data-act="zx-print" data-doc="stickers"'+(booked.length?'':' disabled')+'>'+ico('doc',14)+'Print '+booked.length+' stickers</button></div></div>'+
    (S.list.length - booked.length ? '<div class="zs-note mt8">'+ico('info',16)+'<span>'+(S.list.length - booked.length)+' order(s) are not booked yet, so they have no sticker. <button type="button" class="zs-link" data-act="zx-bookall">Book them now</button></span></div>' : '')+
    '</section><div class="zx-stks" id="zx-doc-stickers">'+(groups || '<div class="zs-card zs-mini">No booked order is waiting for a sticker.</div>')+'</div>';
}
function zx_tabPicking(d){
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><div><h2>Picking list</h2><div class="zs-sub">One sheet for the whole run, black-and-white safe, a tick box on every row. Problem and held orders are listed apart and left out of the quantities.</div></div>'+
    '<div class="zs-actions"><button type="button" class="btn btn-sm btn-primary" data-act="zx-print" data-doc="picking">'+ico('doc',14)+'Print picking list</button></div></div></section>'+
    '<div class="zx-docwrap" id="zx-doc-picking">'+zx_pickHTML(d)+'</div>';
}
function zx_tabInvoices(q){
  var cur = zx_design(), o = (q && q.o && ST.orders[q.o]) || zx_sample();
  var cards = ZX_DESIGNS.map(function(dz){
    var w = zx_width(dz.n), sc = Math.min(1, 300 / w);
    return '<div class="zx-ic'+(dz.n===cur?' on':'')+'" data-testid="zx-design"><div class="zx-ich"><b>'+dz.n+' · '+esc(dz.en)+'</b>'+(dz.n===cur ? '<span class="zo-pill ok">'+ico('check',11)+'In use</span>' : '<button type="button" class="btn btn-sm btn-secondary" data-act="zx-use" data-n="'+dz.n+'">Use this design</button>')+'</div>'+
      '<button type="button" class="zx-ithumb" data-act="zx-prev" data-n="'+dz.n+'" aria-label="Open design '+dz.n+' full size"><div class="zx-iscale" style="width:'+w+'px;transform:scale('+sc+')">'+zx_sheetFor(o, dz.n)+'</div></button></div>';
  }).join('');
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><div><h2>Invoice designs</h2><div class="zs-sub">Seven looks for the same invoice. Every word comes from Settings → Invoice wording, every figure from the order. The one in use is printed, downloaded and sent on WhatsApp.</div></div>'+
    '<div class="zs-actions"><span class="small">WhatsApp: <b>'+(zx_cfg().waFormat==='jpg' ? 'full-page JPG' : 'PDF')+'</b></span><a class="btn btn-sm btn-ghost" href="#/admin/settings">Settings</a><button type="button" class="btn btn-sm btn-primary" data-act="zx-wa" data-id="'+esc(o.id)+'">'+ico('chat',14)+'Try the WhatsApp JPG</button></div></div>'+
    '<div class="zs-mini mt8">Sample: order '+esc(o.id)+' — '+zx_units(o)+' pieces with a combo, '+esc(fmt(o.total))+'.</div></section>'+
    '<div class="zx-igrid">'+cards+'</div>';
}
ACT['zx-use'] = function(el){ var n = +el.getAttribute('data-n'); var s = zs_S('inv.design'); if(s) zs_commit(s, String(n)); else zx_cfg().design = n; saveState(); rerender(); toast('Invoice design '+n+' · '+zx_dname(n)+' is now in use'); };
ACT['zx-prev'] = function(el){ var n = +el.getAttribute('data-n'), o = zx_sample(); openModal('<div class="zx-pv" style="max-width:'+zx_width(n)+'px">'+zx_sheetFor(o, n)+'</div>', {title:'Design '+n+' · '+zx_dname(n), wide:true}); };
CHANGE['zx-size'] = function(el){ var s = zs_S('doc.sticker'); if(s) zs_commit(s, el.value); else zx_cfg().sticker = el.value; saveState(); rerender(); toast('Sticker size: '+el.options[el.selectedIndex].text); };
ACT['zx-bookall'] = function(){
  var n = 0; zx_runOrders().forEach(function(o){ if(!zx_parcel(o) && !zx_problem(o).length && zk_doBook(o)){ zx_syncTracking(o); n++; } });
  saveState(); rerender(); toast(n ? n+' parcels booked — cheapest courier per band (demo)' : 'Nothing to book');
};
/* print: one frame with the document; marks the stickers as printed (a reprint uses the same consignment) */
ACT['zx-print'] = function(el){
  var doc = el.getAttribute('data-doc'), src = document.getElementById(el.getAttribute('data-src') || (doc==='stickers' ? 'zx-doc-stickers' : 'zx-doc-picking')); if(!src) return;
  var css = ''; try{ css = Array.prototype.map.call(document.querySelectorAll('style'), function(s){ return /zx-|ivd/.test(s.textContent) ? s.textContent : ''; }).join('\n'); }catch(e){}
  var f = document.createElement('iframe'); f.setAttribute('aria-hidden','true'); f.tabIndex = -1; f.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;height:1200px;border:0';
  f.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><title>'+(doc==='stickers'?'Courier stickers':'Picking list')+'</title><style>'+css+ZX_PRINT_CSS+'</style></head><body class="zx-printing">'+src.innerHTML+'</body></html>';
  f.onload = function(){ try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){} setTimeout(function(){ if(f.parentNode) f.parentNode.removeChild(f); }, 1500); };
  document.body.appendChild(f);
  var one = el.getAttribute('data-one');
  if(doc==='stickers'){ zx_runOrders().forEach(function(o){ if(zx_parcel(o) && (!one || o.id===one)){ o.docs = o.docs || {}; o.docs.sticker = Date.now(); } }); saveState(); setTimeout(function(){ rerender(); }, 50); }
  toast(doc==='stickers' ? 'Stickers sent to the printer (demo) — reprints use the same consignment' : 'Picking list sent to the printer (demo)');
};
var ZX_PRINT_CSS = 'body{margin:0;padding:8mm;font-family:Arial,sans-serif;color:#000;background:#fff}.zx-stk{page-break-after:always;margin:0 auto 6mm}.zx-sg{display:none}thead{display:table-header-group}tr{page-break-inside:avoid}';

/* =====================================================================
   STOCK & ERP PAGE (the mirror, what open orders hold, the push log)
   ===================================================================== */
function zx_held(pid, color, size){
  var n = 0;
  Object.keys(ST.orders||{}).forEach(function(k){ var o = ST.orders[k]; if(!o.stockTaken || !zx_open(o)) return; (o.lines||[]).forEach(function(l){ if(l.product===pid && l.color===color && l.size===size) n += (l.qty||1); }); });
  return n;
}
/* pieces on the shelf now = ERP stock − pieces delivered since the sync (open orders are still on the shelf) */
function zx_onHand(pid, color, size){
  var f = stockOf._erp || stockOf, n = f(pid, color, size);
  Object.keys(ST.orders||{}).forEach(function(k){ var o = ST.orders[k]; if(!o.stockTaken || o.status!=='delivered') return; (o.lines||[]).forEach(function(l){ if(l.product===pid && l.color===color && l.size===size) n -= (l.qty||1); }); });
  return Math.max(0, n);
}
function zx_heldSplit(pid){
  var open = 0, sold = 0;
  Object.keys(ST.orders||{}).forEach(function(k){ var o = ST.orders[k]; if(!o.stockTaken || !zx_open(o)) return; (o.lines||[]).forEach(function(l){ if(l.product!==pid) return; if(o.status==='delivered') sold += (l.qty||1); else open += (l.qty||1); }); });
  return {open:open, sold:sold};
}
/* an order placed on the shop holds its pieces (the ERP's StockBalance.reserved after the push) */
(function(){
  if(typeof placeOrder==='function' && !placeOrder._zx){ var op = placeOrder; var np = function(){ var id = op.apply(this, arguments); try{ if(id && ST.orders[id]){ ST.orders[id].stockTaken = true; ST.orders[id].tracking = ''; ST.orders[id].courier = ''; saveState(); } }catch(e){} return id; }; np._zx = true; window.placeOrder = np; }
  if(typeof stockOf==='function' && !stockOf._zx){ var os = stockOf; var ns = function(pid, color, size){ var b = os.apply(this, arguments); try{ return Math.max(0, b - zx_held(pid, color, size)); }catch(e){ return b; } }; ns._zx = true; ns._erp = os; window.stockOf = ns; }
})();
function zx_erpOnHand(pid){ var p = P(pid), f = stockOf._erp || stockOf, t = 0; if(!p) return 0; (p.colors||[]).forEach(function(c){ (p.sizes||[]).forEach(function(z){ t += f(pid, c, z); }); }); return t; }
/* what the shop sends the ERP for one order (mock adapter, one idempotency key per document) */
function zx_erpDocs(o){
  var out = [], p = zx_parcel(o), approved = o.status!=='confirmed' || (o.timeline||[]).length>1;
  var k = function(t){ return 'EXS-'+String(o.id).replace(/\W/g,'')+'-'+t; };
  if(o.status==='cancelled' && !o.erpSent) return [{doc:'SalesOrder', st:'not sent', note:'cancelled before it was confirmed', key:'—'}];
  out.push(approved || o.status==='cancelled' ? {doc:'SalesOrder', st:'sent', note:'channel WEBSITE · '+zx_pcs(zx_units(o))+' · '+fmt(o.total)+(o.status==='cancelled'?' · then cancelled':''), key:k('SO')} : {doc:'SalesOrder', st:'waiting', note:'sent when you confirm the order', key:k('SO')});
  if(p) out.push({doc:'Shipment', st:'sent', note:(zk_c(p.courier)||{}).name+' '+p.cid+' · '+((ZK_ST[p.st]||[p.st])[0]), key:k('SH')});
  var paid = o.payment!=='cod' ? (approved) : o.status==='delivered';
  out.push(paid ? {doc:'Payment', st:'sent', note:(o.payment==='cod' ? 'cash collected by the courier' : AO_PAY[o.payment]+' online')+' · '+fmt(o.payment==='cod'?o.total:ty_paid(o)), key:k('PY')} : {doc:'Payment', st:'waiting', note:o.payment==='cod' ? 'sent when the parcel is delivered' : 'sent when you confirm the order', key:k('PY')});
  if(o.status==='returned') out.push({doc:'SalesReturn', st:'sent', note:'QC ok · pieces back in stock', key:k('RT')});
  return out;
}
PAGES['zx-stock'] = { layout:'admin', title:'Stock & ERP', render:function(params, q){
  var tab = (q && q.tab) || 'stock';
  var tabs = zo_tabs('#/admin/stock', [['stock','Stock'],['erp','Sent to ERP']], tab);
  var body = tab==='erp' ? zx_erpTab() : zx_stockTab();
  return '<div class="zs-page zx-page">'+zo_head('Admin · Inventory '+zs_pr('194–207 · 497–499'), 'Stock & ERP', 'স্টক — ERP থেকে আসে, অর্ডার হলে আটকে যায়, ডেলিভারি হলে কমে',
    'The ERP is the master of stock. The shop keeps a mirror for fast pages: available = ERP stock − pieces held by open orders − pieces delivered since the last sync. Every confirmed order, parcel, payment and return goes to the ERP as a document.', zs_simTag('ERP on a mock — sample figures'))+tabs+body+'</div>';
}};
function zx_stockTab(){
  var rows = DB.products.map(function(p){ var h = zx_heldSplit(p.id), on = zx_erpOnHand(p.id), av = Math.max(0, on - h.open - h.sold);
    var low = []; (p.colors||[]).forEach(function(c){ (p.sizes||[]).forEach(function(z){ var a = stockOf(p.id, c, z); if(a>0 && a<=1) low.push(((COL(c)||{}).name||c)+' '+z); }); });
    return {p:p, on:on, open:h.open, sold:h.sold, av:av, low:low}; });
  var tot = rows.reduce(function(s,r){ s.on += r.on; s.open += r.open; s.sold += r.sold; s.av += r.av; return s; }, {on:0, open:0, sold:0, av:0});
  return '<div class="zs-kpis k4"><div class="zs-k"><div class="v">'+tot.on+'</div><div class="l">ERP stock</div><div class="s">last sync · sample</div></div>'+
    '<div class="zs-k '+(tot.open?'warn':'')+'"><div class="v">'+tot.open+'</div><div class="l">Held by open orders</div><div class="s">not delivered yet</div></div>'+
    '<div class="zs-k"><div class="v">'+tot.sold+'</div><div class="l">Delivered</div><div class="s">since the last sync</div></div>'+
    '<div class="zs-k ok"><div class="v">'+tot.av+'</div><div class="l">Available to sell</div><div class="s">what the shop shows</div></div></div>'+
    '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2>By product</h2>'+zs_pr('195 · 197 · 202')+'</div><div class="zs-sub">Orders placed in this demo hold their pieces at once; a cancelled order gives them back; a returned parcel (QC ok) goes back to stock.</div>'+
    '<div class="zo-tw mt8"><table class="zo-tbl"><thead><tr><th>Product</th><th class="r">ERP stock</th><th class="r">Held</th><th class="r">Delivered</th><th class="r">Available</th><th>Low (1 left)</th></tr></thead><tbody>'+
    rows.map(function(r){ return '<tr><td><b>'+esc(r.p.name)+'</b><div class="zs-mini">'+esc((CAT(r.p.cat)||{}).name||r.p.cat)+'</div></td><td class="r">'+r.on+'</td><td class="r">'+(r.open||'—')+'</td><td class="r">'+(r.sold||'—')+'</td><td class="r b">'+r.av+'</td><td class="zs-mini">'+(r.low.length ? esc(r.low.slice(0,4).join(', '))+(r.low.length>4?' +'+(r.low.length-4):'') : '—')+'</td></tr>'; }).join('')+
    '</tbody></table></div></section>';
}
function zx_erpTab(){
  var os = ao_list(), docs = [];
  os.forEach(function(o){ zx_erpDocs(o).forEach(function(d){ docs.push({o:o, d:d}); }); });
  var sent = docs.filter(function(x){ return x.d.st==='sent'; }).length, wait = docs.filter(function(x){ return x.d.st==='waiting'; }).length;
  return '<div class="zs-kpis k4"><div class="zs-k ok"><div class="v">'+sent+'</div><div class="l">Documents sent</div><div class="s">mock adapter</div></div><div class="zs-k '+(wait?'warn':'')+'"><div class="v">'+wait+'</div><div class="l">Waiting</div><div class="s">need a step first</div></div>'+
    '<div class="zs-k"><div class="v">0</div><div class="l">Failed</div><div class="s">retry is automatic</div></div><div class="zs-k"><div class="v">'+os.length+'</div><div class="l">Orders</div><div class="s">in this demo</div></div></div>'+
    '<section class="zs-card zo-mt"><div class="row between wrap" style="gap:8px"><h2>What went to the ERP</h2>'+zs_pr('199 · 200 · 205')+'</div><div class="zs-sub">Business documents only, never journal lines — the ERP writes its own books. Each document has one key, so sending it twice can never move stock twice.</div>'+
    '<div class="zo-tw mt8"><table class="zo-tbl"><thead><tr><th>Order</th><th>Document</th><th>Status</th><th>Details</th><th>Key</th></tr></thead><tbody>'+
    docs.map(function(x){ return '<tr><td>'+esc(x.o.id)+'</td><td>'+esc(x.d.doc)+'</td><td><span class="zo-pill '+(x.d.st==='sent'?'ok':x.d.st==='waiting'?'warn':'')+'">'+esc(x.d.st==='sent'?'Sent':x.d.st==='waiting'?'Waiting':'Not sent')+'</span></td><td class="zs-mini">'+esc(x.d.note)+'</td><td class="zs-mini mono">'+esc(x.d.key)+'</td></tr>'; }).join('')+
    '</tbody></table></div></section>';
}

/* =====================================================================
   ORDERS ↔ COURIERS IN STEP · CANCEL · NOTES · ORDER SCREEN BUTTONS
   ===================================================================== */
if(typeof STATUS_LABEL!=='undefined'){ STATUS_LABEL.cancelled = 'Cancelled'; STATUS_LABEL.returned = 'Returned to us'; }
if(typeof AO_STATUS!=='undefined'){ AO_STATUS.cancelled = 'Cancelled'; AO_STATUS.returned = 'Returned'; }
(function(){
  if(typeof advanceOrder==='function' && !advanceOrder._zx){ var oa = advanceOrder; var na = function(id){ var o = ST.orders[id]; if(!o || !zx_open(o)) return; return oa.apply(this, arguments); }; na._zx = true; window.advanceOrder = na; }
})();
function zx_syncTracking(o){ var p = zx_parcel(o); if(p){ o.courier = (zk_c(p.courier)||{}).name || o.courier; o.tracking = p.cid; } }
function zx_setStatus(o, s){ if(!o || o.status===s) return; o.status = s; o.timeline = o.timeline || []; o.timeline.push({s:s, at:Date.now()}); if(s==='delivered') o.deliveredAt = Date.now(); }
(function(){
  var wrap = function(name, after){ var f = ACT[name]; if(typeof f!=='function' || f._zx) return; var g = function(el){ var r = f.apply(this, arguments); try{ after(el); }catch(e){ console.error(e); } return r; }; g._zx = true; ACT[name] = g; };
  /* courier → order */
  wrap('zk-next', function(el){ var o = ST.orders[el.getAttribute('data-id')], p = o && zx_parcel(o); if(!p || !zx_open(o)) return;
    if(['picked','transit'].indexOf(p.st)>=0 && (o.status==='confirmed' || o.status==='packed')) zx_setStatus(o, 'shipped');
    if(p.st==='delivered' && o.status!=='delivered'){ if(o.status!=='shipped') zx_setStatus(o, 'shipped'); zx_setStatus(o, 'delivered'); }
    zx_syncTracking(o); saveState(); rerender(); });
  wrap('zk-confirm', function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(o){ zx_syncTracking(o); saveState(); } });
  wrap('zk-bookall', function(){ ao_list().forEach(zx_syncTracking); saveState(); });
  wrap('zk-refuse', function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; o.flags = o.flags || []; if(o.flags.indexOf('Refused at door')<0) o.flags.push('Refused at door'); saveState(); });
  wrap('zk-restock', function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; o.flags = (o.flags||[]).filter(function(f){ return f!=='Refused at door'; }); zx_setStatus(o, 'returned'); saveState(); rerender(); });
  /* order → courier */
  wrap('ao-next', function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; var p = zx_parcel(o);
    if(o.status==='shipped'){ if(!p) p = zk_doBook(o); if(p && ZK_FLOW.indexOf(p.st)<1){ p.st = 'picked'; p.hist.push({s:'picked', at:Date.now()}); } }
    if(o.status==='delivered' && p && p.st!=='delivered'){ p.st = 'delivered'; p.hist.push({s:'delivered', at:Date.now()}); }
    zx_syncTracking(o); saveState(); if(MODAL) refreshModal(); });
})();
/* orders list: search (PR 154) and the cancelled / returned chips */
(function(){
  if(typeof ao_match==='function' && !ao_match._zx){ var om = ao_match; var nm = function(o, f){ if(f==='cancelled') return o.status==='cancelled' || o.status==='returned'; if(f==='all' || f==='today' || f==='flagged' || f==='confirm') { if(!zx_open(o) && f!=='all') return false; } return om.apply(this, arguments); }; nm._zx = true; window.ao_match = nm; }
  if(typeof ao_list==='function' && !ao_list._zx){ var ol = ao_list; var nl = function(){ var r = ol.apply(this, arguments); var u = (typeof UI!=='undefined' && UI['admin-orders']) || {}; var s = String(u.q||'').trim().toLowerCase(); if(!s || !/^#\/admin(\/orders)?(\?|$)/.test(location.hash)) return r;
      var d = s.replace(/\D/g,''); return r.filter(function(o){ var p = zx_parcel(o); return String(o.id).toLowerCase().indexOf(s)>=0 || String(o.name||'').toLowerCase().indexOf(s)>=0 || (d.length>=3 && String(o.phone||'').replace(/\D/g,'').indexOf(d)>=0) || (p && String(p.cid).toLowerCase().indexOf(s)>=0); }); }; nl._zx = true; window.ao_list = nl; }
  var pg = PAGES['admin-orders']; if(!pg || pg._zx) return; var or = pg.render;
  pg.render = function(){
    var h = or.apply(this, arguments), u = ui('admin-orders', {filter:'all'});
    try{
      var all = Object.keys(ST.orders).map(function(k){ return ST.orders[k]; }), nc = all.filter(function(o){ return !zx_open(o); }).length;
      var chip = '<button class="chip'+(u.filter==='cancelled'?' on':'')+'" data-act="ao-filter" data-f="cancelled" aria-pressed="'+(u.filter==='cancelled')+'">Cancelled / returned <span style="opacity:.7">'+nc+'</span></button>';
      var search = '<div class="zx-osearch"><label class="sr" for="zx-oq">Search orders</label>'+ico('search',16)+'<input id="zx-oq" class="input" type="search" placeholder="Search order no., name, phone or tracking" value="'+esc(u.q||'')+'" data-input="zx-oq"><a class="btn btn-sm btn-ghost" href="#/admin/fulfilment">'+ico('doc',15)+'Fulfilment</a></div>';
      h = h.replace(/(<div class="row wrap mb16" style="gap:8px" role="group" aria-label="Filter orders">)([\s\S]*?)(<\/div>)/, function(m, a, b, c){ return search+a+b+chip+c; });
      if(u.q && h.indexOf('No orders here right now.')>=0) h = h.replace('No orders here right now.', 'No order matches “'+esc(u.q)+'”.');
    }catch(e){ console.error(e); }
    return h;
  };
  pg._zx = true;
})();
INPUT['zx-oq'] = function(el){ var u = ui('admin-orders', {filter:'all'}); u.q = el.value; clearTimeout(INPUT['zx-oq']._t); INPUT['zx-oq']._t = setTimeout(function(){ if(!/^#\/admin(\/orders)?(\?|$)/.test(location.hash)) return; var pos = el.selectionStart; rerender(); var n = document.getElementById('zx-oq'); if(n){ n.focus(); try{ n.setSelectionRange(pos, pos); }catch(e){} } }, 250); };

/* the order screen: documents, cancel, note, ERP */
(function(){
  if(typeof ao_modalHTML!=='function' || ao_modalHTML._zx) return;
  var om = ao_modalHTML;
  var nm = function(id){
    var h = om.apply(this, arguments), o = ST.orders[id]; if(!o) return h;
    try{
      var p = zx_parcel(o);
      /* the head line: a consignment number only once the courier gave one */
      var head = ' · '+esc(o.courier||'')+' '+esc(o.tracking||'')+'</span>';
      if(h.indexOf(head)>=0) h = h.replace(head, function(){ return ' · '+(p ? esc((zk_c(p.courier)||{}).name)+' '+esc(p.cid) : 'Courier not booked yet')+'</span>'; });
      if(o.status==='cancelled') h = h.replace(/<button class="btn btn-primary btn-sm" data-act="ao-next"[\s\S]*?<\/button>/, '<button class="btn btn-sm" disabled>Cancelled — nothing next</button>');
      if(o.status==='returned') h = h.replace(/<button class="btn btn-sm" disabled>Delivered — nothing next<\/button>/, '<button class="btn btn-sm" disabled>Returned to us</button>');
      var docs = '<button type="button" class="btn btn-sm btn-secondary" data-act="inv-open" data-id="'+esc(o.id)+'">'+ico('doc',15)+'Invoice</button>'+
        '<button type="button" class="btn btn-sm btn-secondary" data-act="zx-wa" data-id="'+esc(o.id)+'">'+ico('chat',15)+'WhatsApp invoice</button>'+
        (p ? '<button type="button" class="btn btn-sm btn-secondary" data-act="zk-sticker" data-id="'+esc(o.id)+'">'+ico('truck',15)+'Sticker</button>' : '')+
        (zx_open(o) && (o.status==='confirmed' || o.status==='packed') ? '<button type="button" class="btn btn-sm zx-danger" data-act="zx-cancel" data-id="'+esc(o.id)+'">'+ico('close',15)+'Cancel order…</button>' : '');
      var erp = '<div class="ao-sec mt16">Sent to ERP</div><div class="zx-erp">'+zx_erpDocs(o).map(function(d){ return '<div><span class="zo-pill '+(d.st==='sent'?'ok':d.st==='waiting'?'warn':'')+'">'+esc(d.st==='sent'?'Sent':d.st==='waiting'?'Waiting':'Not sent')+'</span> <b>'+esc(d.doc)+'</b> <span class="xs muted">'+esc(d.note)+'</span></div>'; }).join('')+'</div>';
      var note = '<div class="ao-sec mt16"><label for="zx-note-'+esc(o.id)+'">Internal note (only the team sees it)</label></div><textarea id="zx-note-'+esc(o.id)+'" class="input zx-note" rows="2" data-input="zx-note" data-id="'+esc(o.id)+'" placeholder="e.g. customer asked to deliver after 5 pm">'+esc(o.adminNote||'')+'</textarea>'+
        (o.cancel ? '<div class="zs-note mt8">'+ico('info',16)+'<span>Cancelled '+esc(dateTimeStr(o.cancel.at))+' — '+esc(o.cancel.reason)+'</span></div>' : '');
      h = h.replace('<div class="ao-actions">', function(){ return erp+note+'<div class="ao-actions">'; });
      h = h.replace(/(<div class="ao-actions">[\s\S]*)(<\/div>)$/, function(m, a, b){ return a+docs+b; });
    }catch(e){ console.error(e); }
    return h;
  };
  nm._zx = true; window.ao_modalHTML = nm;
})();
INPUT['zx-note'] = function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; o.adminNote = el.value; clearTimeout(INPUT['zx-note']._t); INPUT['zx-note']._t = setTimeout(saveState, 300); };
var ZX_CANCEL = ['Customer asked to cancel','Duplicate order','Could not reach the customer','Out of stock','Fake / test order'];
function zx_cancelHTML(o){
  var u = UI['zx-cancel'] || {};
  return '<p class="small" style="margin:0 0 10px">Cancel order <b>'+esc(o.id)+'</b> ('+esc(fmt(o.total))+')? Its pieces go back to stock'+(o.payment!=='cod' ? ' and the online payment is refunded to the customer\'s wallet by the owner' : '')+'. This cannot be undone.</p>'+
    '<label class="label" for="zx-cr">Reason</label><select id="zx-cr" class="input" data-change="zx-cr">'+'<option value="">Choose a reason…</option>'+ZX_CANCEL.map(function(r){ return '<option'+(u.reason===r?' selected':'')+'>'+esc(r)+'</option>'; }).join('')+'</select>'+
    '<div class="zs-actions mt16"><button type="button" class="btn zx-danger" data-act="zx-cancel-go" data-id="'+esc(o.id)+'"'+(u.reason?'':' disabled')+'>Yes, cancel this order</button><button type="button" class="btn btn-ghost" data-act="ao-open" data-id="'+esc(o.id)+'">Keep the order</button></div>';
}
ACT['zx-cancel'] = function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; UI['zx-cancel'] = {id:o.id, reason:''}; openModal(zx_cancelHTML(o), {title:'Cancel order '+o.id, rebuild:function(){ return zx_cancelHTML(o); }}); };
CHANGE['zx-cr'] = function(el){ var u = UI['zx-cancel']; if(!u) return; u.reason = el.value; refreshModal(); };
ACT['zx-cancel-go'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')], u = UI['zx-cancel'] || {}; if(!o || !u.reason) return;
  o.erpSent = o.status!=='confirmed'; o.cancel = {at:Date.now(), reason:u.reason, by:'admin'}; zx_setStatus(o, 'cancelled');
  var p = zx_parcel(o); if(p && p.st==='booked'){ delete zk_st().parcels[o.id]; }
  saveState(); closeModal(); rerender(); toast(o.id+' cancelled — pieces are back in stock');
};
/* the Couriers page's "Sticker" button shows the same full sticker (one design everywhere) */
ACT['zk-sticker'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')]; if(!o || !zx_parcel(o)) return;
  var lines = zx_sortRun([o]).list[0].lines;
  openModal('<div class="zx-stks" id="zx-doc-one" style="margin-top:0;justify-content:center">'+zx_stickerHTML(o, lines, zx_cfg().sticker)+'</div>'+
    '<div class="zs-actions mt16"><button type="button" class="btn btn-primary" data-act="zx-print1" data-id="'+esc(o.id)+'">'+ico('doc',15)+'Print sticker</button><span class="xs muted">A reprint uses the same consignment — it never books a second parcel.</span></div>', {title:'Courier sticker · '+o.id});
};
ACT['zx-print1'] = function(el){ var id = el.getAttribute('data-id'), o = ST.orders[id]; ACT['zx-print']({getAttribute:function(k){ return k==='data-doc' ? 'stickers' : k==='data-one' ? id : k==='data-src' ? 'zx-doc-one' : null; }}); if(o){ o.docs = o.docs || {}; o.docs.sticker = Date.now(); saveState(); } closeModal(); };
