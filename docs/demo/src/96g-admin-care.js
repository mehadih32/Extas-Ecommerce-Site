/* =====================================================================
   96g-admin-care.js — review, exchanges, support, coupons (owner fix E, 20 Oct)
   S06 PR 145 · 519–524 · 546 · 556–557 (duplicate & fraud review, merge)
   S08 PR 185–188 · 190 (exchange approval, QC, money box) · B1.9 returns
   S22 PR 425–436 · 538 (support inbox, tickets, context, AI draft)
   S13 PR 271–272 (coupons, basic)
   ---------------------------------------------------------------------
   #/admin/review      flagged orders and why · approve / decline / call ·
                       merge same-day orders into one parcel · never blocks
   #/admin/exchanges   exchange requests (approve with the charge rule),
                       return requests (decline with the policy, or turn
                       into an exchange), receive + QC (good / B / damaged)
   #/admin/support     every channel in one list · status, assignee, SLA ·
                       the order beside the chat · EXTAS AI drafts, a
                       person sends
   #/admin/coupons     codes from settings; the bag's "Have a code?" reads them
   Customer side: the order page gets "Request a return" and "Message us";
   My orders cards get Exchange · Return · Help. Everything feeds the admin.
   Uses the shared layer in 96f-admin-ops.js (zy_*). Prefix zq_.
   Store policy (Smart Rules): no returns after delivery; exchange within
   the window for size or a fault; exchange delivery charge unless our mistake.
   ===================================================================== */
zo_route(/^\/admin\/review$/, 'zq-review');
zo_route(/^\/admin\/exchanges$/, 'zq-exch');
zo_route(/^\/admin\/support$/, 'zq-sup');
zo_route(/^\/admin\/coupons$/, 'zq-cpn');
zo_link(['Review queue','#/admin/review','shield', null]);
zo_link(['Exchanges & returns','#/admin/exchanges','swap', null]);
zo_link(['Support inbox','#/admin/support','chat', null]);
zo_link(['Coupons','#/admin/coupons','tag', null]);
if(typeof ACC_XSTATUS!=='undefined'){ ACC_XSTATUS.declined = 'Not approved'; ACC_XSTATUS.approved = 'Approved — the rider is coming'; }

function zq_z(){ var z = zy_st(); if(!z.rev) z.rev = {}; if(!z.rets) z.rets = []; if(!z.coupons) z.coupons = []; if(!z.fraud) z.fraud = {days:3, on:{addr:true, transit:true, sameday:true, phone:true, refused:true, fake:true}}; if(!z.sup) z.sup = {convs:[], sla:15}; return z; }
function zq_pcs(n){ return n+' '+(n===1 ? zy_e('pc','পিস') : zy_e('pcs','পিস')); }
function zq_open(o){ return o.status==='confirmed' || o.status==='packed'; }
function zq_notOut(o){ var p = zk_parcelOf(o.id); return zq_open(o) && (!p || p.st==='booked'); }

/* =====================================================================
   1 · DUPLICATE & FRAUD REVIEW — nothing is ever blocked automatically
   ===================================================================== */
var ZQ_FLAG = 'Review: duplicate / fraud';
var ZQ_RULES = [
  ['addr','Same address, new phone','একই ঠিকানা, নতুন ফোন'],
  ['transit','Re-order while one is on the way','একটা পথে থাকতেই আবার অর্ডার'],
  ['sameday','Several orders today — ship together','আজ কয়েকটা অর্ডার — একসাথে পাঠান'],
  ['phone','Odd phone number','ফোন নম্বর ঠিক না'],
  ['refused','Refused a parcel before','আগে পার্সেল নেয়নি'],
  ['fake','Looks like a test or fake order','টেস্ট বা ভুয়া অর্ডারের মতো']
];
function zq_addr(a){ return String(a||'').toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g,' ').replace(/\b(house|road|flat|block|sector|lane|no|h|r)\b/g,' ').replace(/\s+/g,' ').trim(); }
function zq_digits(p){ return String(p||'').replace(/\D/g,'').slice(-10); }
function zq_signals(o){
  var z = zq_z(), on = z.fraud.on, days = (+z.fraud.days||3)*86400000, out = [];
  var others = ao_list().filter(function(x){ return x.id!==o.id && x.status!=='cancelled'; }), ph = zq_digits(o.phone), ad = zq_addr(o.address);
  var sku = function(x){ return (x.lines||[]).map(function(l){ return l.product+'|'+l.color; }); };
  if(on.addr && ad.length>=10){ var a = others.filter(function(x){ return zq_digits(x.phone)!==ph && Math.abs((x.createdAt||0)-(o.createdAt||0))<=days && zq_addr(x.address)===ad; });
    if(a.length) out.push({k:'addr', sev:'medium', why:zy('Same address as ','একই ঠিকানা: ')+a.map(function(x){ return x.id+' ('+ao_phone(x)+')'; }).join(', '), other:a.map(function(x){ return x.id; })}); }
  if(on.transit){ var t = others.filter(function(x){ var p = zk_parcelOf(x.id); return zq_digits(x.phone)===ph && (x.createdAt||0)<(o.createdAt||0) && (x.status==='shipped' || (p && ['picked','transit'].indexOf(p.st)>=0)) && x.status!=='delivered'; });
    if(t.length){ var mine = sku(o), sev = 'low'; t.forEach(function(x){ var s = sku(x); if(mine.some(function(k){ return s.indexOf(k)>=0; })) sev = 'high'; else if(sev!=='high' && (o.lines||[]).some(function(l){ return (x.lines||[]).some(function(m){ return m.product===l.product; }); })) sev = 'medium'; });
      out.push({k:'transit', sev:sev, why:zy('Order ','অর্ডার ')+t.map(function(x){ return x.id; }).join(', ')+zy(' is still on the way to this phone',' এখনো এই ফোনে পথে আছে')+(sev==='high'?zy(' — same item and colour',' — একই আইটেম, একই রঙ'):''), other:t.map(function(x){ return x.id; })}); } }
  if(on.sameday && zq_notOut(o)){ var d = others.filter(function(x){ return zq_digits(x.phone)===ph && zq_notOut(x) && zy_dk(x.createdAt)===zy_dk(o.createdAt); });
    if(d.length) out.push({k:'sameday', sev:'medium', why:zy('Also today from this phone: ','এই ফোন থেকে আজ আরও: ')+d.map(function(x){ return x.id; }).join(', ')+zy(' — merge to save a delivery charge',' — এক পার্সেলে দিলে ডেলিভারি চার্জ বাঁচে'), other:d.map(function(x){ return x.id; }), merge:true}); }
  if(on.phone && checkPhone(o.phone).state!=='ok') out.push({k:'phone', sev:'medium', why:zy('“'+o.phone+'” is not a valid Bangladeshi mobile number','“'+o.phone+'” ঠিক বাংলাদেশি মোবাইল নম্বর না')});
  if(on.refused){ var rf = others.filter(function(x){ var p = zk_parcelOf(x.id); return zq_digits(x.phone)===ph && p && ['refused','returned','restocked'].indexOf(p.st)>=0; });
    if(rf.length) out.push({k:'refused', sev:'medium', why:zy('Refused before: ','আগে নেয়নি: ')+rf.map(function(x){ return x.id; }).join(', ')+zy(' — ask for the delivery charge by bKash first',' — আগে বিকাশে ডেলিভারি চার্জ নিন'), other:rf.map(function(x){ return x.id; })}); }
  if(on.fake && (/\b(test|fake|asdf|qwer|xxx|demo)\b/i.test(o.name||'') || String(o.address||'').trim().length<12)) out.push({k:'fake', sev:'high', why:zy('The name or address looks made up — call before packing','নাম বা ঠিকানা বানানো মনে হচ্ছে — প্যাকের আগে ফোন করুন')});
  return out;
}
function zq_rev(o){ return zq_z().rev[o.id] || null; }
function zq_pending(o){ if(!zq_notOut(o)) return false; var r = zq_rev(o); if(r && (r.d==='approved' || r.d==='declined')) return false; return zq_signals(o).length>0; }
function zq_queue(){ return ao_list().filter(zq_pending); }
function zq_ruleName(k){ var r = ZQ_RULES.filter(function(x){ return x[0]===k; })[0]; return r ? zy(r[1], r[2]) : k; }
function zy_afterPlace(o){
  /* duplicate / fraud check at order time: a flag, never a block */
  if(zq_signals(o).length){ o.flags = o.flags || []; if(o.flags.indexOf(ZQ_FLAG)<0) o.flags.push(ZQ_FLAG); }
  /* a store coupon used at checkout counts one use */
  var code = o.offer && o.offer.code; if(code){ var c = zq_cpnFind(code); if(c){ c.uses = c.uses || []; c.uses.push({oid:o.id, phone:o.phone, at:Date.now(), amt:o.offer.amount||0}); o.coupon = c.code; } }
}
PAGES['zq-review'] = { layout:'admin', title:'Review queue', render:function(params, q){
  var z = zq_z(), tab = (q && q.tab) || 'queue', list = zq_queue();
  var decided = ao_list().filter(function(o){ var r = zq_rev(o); return r && r.d; });
  var head = zy_head('Admin · Orders '+zs_pr('145 · 519–524 · 546 · 556–557'), 'Duplicate & fraud review', 'ডুপ্লিকেট ও ফ্রড রিভিউ',
    'Orders that look like a duplicate or a risk, with the reason. A person decides: approve, decline with a reason, or call first. Same-day orders from one phone can be merged into one parcel. Nothing is ever blocked automatically.',
    'যে অর্ডার ডুপ্লিকেট বা ঝুঁকির মনে হয়, কারণসহ। মানুষ ঠিক করবে: ঠিক আছে, কারণসহ বাতিল, বা আগে ফোন। এক ফোনের আজকের অর্ডার এক পার্সেলে মেলানো যায়। কিছুই নিজে থেকে ব্লক হয় না।', zy_actorBar());
  if(!zy_can('review','view')) return '<div class="zs-page zy-page">'+head+zy_noAccess('review')+'</div>';
  var tabs = zo_tabs('#/admin/review', [['queue',zy('To review','রিভিউ বাকি'), list.length || ''],['done',zy('Decided','সিদ্ধান্ত হয়েছে'), decided.length || ''],['rules',zy('Rules','নিয়ম')]], tab);
  var body = tab==='done' ? zq_revDone(decided) : tab==='rules' ? zq_revRules() : zq_revQueue(list);
  return '<div class="zs-page zy-page">'+head+'<div class="zs-note mb16">'+ico('shield',16)+'<span>'+zy_e('Owner rule: nothing is ever blocked automatically. A genuine order is never trapped — the review only holds it back from the picking list until someone decides.','মালিকের নিয়ম: কিছুই নিজে থেকে ব্লক হয় না। আসল অর্ডার কখনো আটকে থাকে না — সিদ্ধান্ত না হওয়া পর্যন্ত শুধু পিকিং লিস্টের বাইরে থাকে।')+'</span></div>'+tabs+body+'</div>';
}};
function zq_sevPill(s){ return '<span class="zo-pill '+(s==='high'?'bad':s==='medium'?'warn':'info')+'">'+esc(s==='high'?zy('High','বেশি'):s==='medium'?zy('Medium','মাঝারি'):zy('Low','কম'))+'</span>'; }
function zq_revCard(o){
  var sg = zq_signals(o), r = zq_rev(o) || {}, merge = sg.filter(function(s){ return s.merge; })[0];
  return '<article class="zs-card zq-rc" data-testid="zq-rc-'+esc(o.id)+'"><div class="row between wrap" style="gap:8px"><div style="min-width:0"><div class="small bold"><button type="button" class="ao-idbtn" data-act="ao-open" data-id="'+esc(o.id)+'">'+esc(o.id)+'</button> · '+esc(o.name)+' · '+esc(ao_phone(o))+'</div><div class="zs-mini">'+esc(ao_when(o.createdAt))+' · '+esc(ao_zone(o))+' · '+zq_pcs(ao_items(o))+' · '+zy_m(o.total)+' '+esc(AO_PAY[o.payment]||o.payment)+'</div><div class="zs-mini">'+esc(o.address)+'</div></div>'+(r.calls && r.calls.length ? '<span class="zo-pill info">'+esc(zy('Called ','ফোন করা হয়েছে ')+r.calls.length+'×')+'</span>' : '')+'</div>'+
    '<div class="zq-sigs">'+sg.map(function(s){ return '<div class="zq-sig">'+zq_sevPill(s.sev)+'<div><b>'+esc(zq_ruleName(s.k))+'</b><div class="zs-mini">'+esc(s.why)+'</div></div></div>'; }).join('')+'</div>'+
    (r.calls && r.calls.length ? '<div class="zs-mini">'+r.calls.map(function(c){ return esc(dateTimeStr(c.at)+' · '+c.by+' · '+c.outcome+(c.note?' — '+c.note:'')); }).join('<br>')+'</div>' : '')+
    '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-primary" data-act="zq-rev" data-v="approve" data-id="'+esc(o.id)+'" data-testid="zq-approve">'+ico('check',14)+zy_e('Approve','ঠিক আছে')+'</button>'+
      '<button type="button" class="btn btn-sm btn-secondary" data-act="zq-rev" data-v="call" data-id="'+esc(o.id)+'">'+ico('phone',14)+zy_e('Call — log the answer','ফোন — উত্তর লিখুন')+'</button>'+
      (merge ? '<button type="button" class="btn btn-sm btn-secondary" data-act="zq-merge" data-id="'+esc(o.id)+'" data-testid="zq-merge">'+ico('layers',14)+zy_e('Merge into one parcel','এক পার্সেলে মেলান')+'</button>' : '')+
      '<button type="button" class="btn btn-sm zx-danger" data-act="zq-rev" data-v="decline" data-id="'+esc(o.id)+'">'+ico('close',14)+zy_e('Decline…','বাতিল…')+'</button></div></article>';
}
function zq_revQueue(list){
  return list.length ? '<div class="zq-rcs">'+list.map(zq_revCard).join('')+'</div>' : '<section class="zs-card"><div class="zs-mini">'+zy_e('Nothing to review. New orders are checked the moment they are placed.','রিভিউ করার কিছু নেই। নতুন অর্ডার আসার সাথে সাথে চেক হয়।')+'</div></section>';
}
function zq_revDone(list){
  return '<section class="zs-card">'+(list.length ? '<div class="zo-tw"><table class="zo-tbl"><thead><tr><th>'+zy_e('Order','অর্ডার')+'</th><th>'+zy_e('Decision','সিদ্ধান্ত')+'</th><th>'+zy_e('Reason','কারণ')+'</th><th>'+zy_e('By','কে')+'</th><th>'+zy_e('When','কখন')+'</th></tr></thead><tbody>'+
    list.map(function(o){ var r = zq_rev(o); return '<tr><td><button type="button" class="ao-idbtn" data-act="ao-open" data-id="'+esc(o.id)+'">'+esc(o.id)+'</button> · '+esc(o.name)+'</td><td><span class="zo-pill '+(r.d==='approved'?'ok':r.d==='merged'?'info':'bad')+'">'+esc(r.d==='approved'?zy('Approved','ঠিক আছে'):r.d==='merged'?zy('Merged','মেলানো হয়েছে'):zy('Declined','বাতিল'))+'</span></td><td>'+esc(r.reason||'')+'</td><td>'+esc(r.by||'')+'</td><td>'+esc(r.at?dateTimeStr(r.at):'')+'</td></tr>'; }).join('')+'</tbody></table></div>' : '<div class="zs-mini">'+zy_e('No decisions yet.','এখনো কোনো সিদ্ধান্ত নেই।')+'</div>')+'</section>';
}
function zq_revRules(){
  var z = zq_z();
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Checks run on every new order','প্রতিটা নতুন অর্ডারে যে চেক চলে')+'</h2>'+zs_pr('544')+'</div><div class="zs-sub">'+zy_e('Each check can be switched off. The action is always a flag for a person — there is no block action.','প্রতিটা চেক বন্ধ করা যায়। ফলাফল সবসময় মানুষের জন্য একটা ফ্ল্যাগ — ব্লক করার কোনো বোতাম নেই।')+'</div>'+
    ZQ_RULES.map(function(r){ var on = z.fraud.on[r[0]]!==false; return '<div class="zs-row"><div class="grow"><div class="small bold">'+esc(zy(r[1],r[2]))+'</div></div>'+zs_sw(on, 'zq-rule', zy(r[1],r[2]), 'data-k="'+r[0]+'"')+'</div>'; }).join('')+
    '<div class="zs-row"><div class="grow"><div class="small bold">'+zy_e('Look back this many days for duplicates','ডুপ্লিকেট খুঁজতে কত দিন পিছনে দেখবে')+'</div></div><input class="input zs-in zy-cin" type="number" min="1" max="30" value="'+esc(z.fraud.days)+'" data-change="zq-days" aria-label="'+zy_e('Days','দিন')+'"></div></section>';
}
ACT['zq-rule'] = function(el){ if(!zy_guard('review','change a review rule')) return; var k = el.getAttribute('data-k'), z = zq_z(), on = z.fraud.on[k]!==false;
  zy_ask({title:zy('Turn this check '+(on?'off':'on')+'?','এই চেক '+(on?'বন্ধ':'চালু')+' করবেন?'), html:'<p class="small">'+esc(zq_ruleName(k))+'</p>', fn:function(){ z.fraud.on[k] = !on; zy_log('review', 'Review check “'+k+'” '+(on?'off':'on')); }}); };
CHANGE['zq-days'] = function(el){ var z = zq_z(), v = zy_num(el.value), old = z.fraud.days; if(!(v>=1 && v<=30)){ el.value = old; toast(zy('1 to 30 days','১ থেকে ৩০ দিন')); return; } if(!zy_guard('review','change look-back days')){ el.value = old; return; }
  zy_ask({title:zy('Save?','সেভ করবেন?'), html:'<p class="small">'+old+' → '+v+'</p>', back:function(){ rerender(); }, fn:function(){ z.fraud.days = v; zy_log('review', 'Duplicate look-back '+old+' → '+v+' days'); }}); };
var ZQ_APPROVE = [['Customer confirmed on the phone','ফোনে কাস্টমার নিশ্চিত করেছেন'],['A genuine second order','সত্যিই দ্বিতীয় অর্ডার'],['For a family member','পরিবারের কারো জন্য'],['Checked — nothing wrong','দেখা হয়েছে — সমস্যা নেই']];
var ZQ_DECLINE = [['Duplicate of an earlier order','আগের অর্ডারের ডুপ্লিকেট'],['Customer asked to cancel','কাস্টমার বাতিল করতে বলেছেন'],['Fake / test order','ভুয়া / টেস্ট অর্ডার'],['Could not reach the customer','কাস্টমারকে পাওয়া যায়নি']];
var ZQ_CALL = [['Confirmed on the call → approve','ফোনে নিশ্চিত → ঠিক আছে'],['No answer — try again later','ধরেনি — পরে আবার'],['Asked to cancel → decline','বাতিল করতে বলেছেন → বাতিল']];
function zq_revForm(o, v){
  var opts = v==='approve' ? ZQ_APPROVE : v==='decline' ? ZQ_DECLINE : ZQ_CALL, u = UI.zqRev || {};
  return '<p class="small">'+esc(o.id+' · '+o.name+' · '+fmt(o.total))+'</p><label class="label" for="zq-r">'+esc(v==='call' ? zy('What did the customer say?','কাস্টমার কী বললেন?') : zy('Reason','কারণ'))+'</label><select id="zq-r" class="input" data-change="zq-rev-r"><option value="">'+zy_e('Choose…','বাছুন…')+'</option>'+opts.map(function(x, i){ return '<option value="'+i+'"'+(String(u.r)===String(i)?' selected':'')+'>'+esc(zy(x[0],x[1]))+'</option>'; }).join('')+'</select>'+
    '<label class="label mt12" for="zq-n">'+zy_e('Note (optional)','নোট (ইচ্ছা হলে)')+'</label><input id="zq-n" class="input" maxlength="120" data-input="zq-rev-n" value="'+esc(u.n||'')+'">'+
    (v==='decline' ? '<p class="zs-mini mt8">'+zy_e('The order is cancelled and its pieces go back to stock. Nobody is blocked.','অর্ডার বাতিল হবে, পিস স্টকে ফিরবে। কাউকে ব্লক করা হয় না।')+'</p>' : '')+
    '<div class="zs-actions mt16"><button type="button" class="btn '+(v==='decline'?'zx-danger':'btn-primary')+'" data-act="zq-rev-go" data-id="'+esc(o.id)+'" data-v="'+v+'"'+(u.r===''||u.r==null?' disabled':'')+' data-testid="zq-rev-go">'+esc(v==='approve'?zy('Yes, approve','হ্যাঁ, ঠিক আছে'):v==='decline'?zy('Yes, decline and cancel','হ্যাঁ, বাতিল করুন'):zy('Save the call','ফোনের তথ্য সেভ করুন'))+'</button><button type="button" class="btn btn-ghost" data-act="close-modal">'+zy_e('Cancel','বাতিল')+'</button></div>';
}
ACT['zq-rev'] = function(el){ var o = ST.orders[el.getAttribute('data-id')], v = el.getAttribute('data-v'); if(!o || !zy_guard('review', v+' a flagged order')) return; UI.zqRev = {id:o.id, v:v, r:'', n:''};
  openModal(zq_revForm(o, v), {title:v==='approve'?zy('Approve order '+o.id+'?','অর্ডার '+o.id+' ঠিক আছে?'):v==='decline'?zy('Decline order '+o.id+'?','অর্ডার '+o.id+' বাতিল করবেন?'):zy('Call about '+o.id,o.id+' নিয়ে ফোন'), rebuild:function(){ return zq_revForm(o, v); }}); };
CHANGE['zq-rev-r'] = function(el){ if(UI.zqRev){ UI.zqRev.r = el.value; refreshModal(); } };
INPUT['zq-rev-n'] = function(el){ if(UI.zqRev) UI.zqRev.n = String(el.value).trim(); };
function zq_cancel(o, reason){
  o.erpSent = o.status!=='confirmed'; o.cancel = {at:Date.now(), reason:reason, by:zy_actor().en};
  if(typeof zx_setStatus==='function') zx_setStatus(o, 'cancelled'); else o.status = 'cancelled';
  var p = zk_parcelOf(o.id); if(p && p.st==='booked') delete zk_st().parcels[o.id];
  o.flags = (o.flags||[]).filter(function(f){ return f!==ZQ_FLAG; });
}
ACT['zq-rev-go'] = function(el){
  var u = UI.zqRev || {}, o = ST.orders[el.getAttribute('data-id')], v = el.getAttribute('data-v'); if(!o || u.r==='' || u.r==null) return;
  var z = zq_z(), r = z.rev[o.id] = z.rev[o.id] || {}, a = zy_actor(), opts = v==='approve' ? ZQ_APPROVE : v==='decline' ? ZQ_DECLINE : ZQ_CALL, why = opts[+u.r][0] + (u.n ? ' — '+u.n : '');
  if(v==='call'){ r.calls = (r.calls||[]).concat([{at:Date.now(), by:a.en, outcome:opts[+u.r][0], note:u.n||''}]); zy_log('review', 'Called about '+o.id+': '+why, o.id);
    if(+u.r===0) v = 'approve'; else if(+u.r===2) v = 'decline'; else { saveState(); closeModal(); rerender(); toast(zy('Call logged — still in the queue','ফোনের তথ্য লেখা হলো — তালিকায় থাকল')); return; } }
  r.d = v==='approve' ? 'approved' : 'declined'; r.reason = why; r.by = a.en; r.at = Date.now();
  if(v==='approve'){ o.flags = (o.flags||[]).filter(function(f){ return f!==ZQ_FLAG; }); zy_log('review', 'Approved flagged order '+o.id+': '+why, o.id); toast(zy(o.id+' approved — it can go to packing', o.id+' ঠিক আছে — প্যাকিংয়ে যেতে পারে')); }
  else { zq_cancel(o, 'Declined in review: '+why); zy_log('review', 'Declined and cancelled '+o.id+': '+why, o.id); toast(zy(o.id+' declined and cancelled — pieces back in stock', o.id+' বাতিল — পিস স্টকে ফিরেছে')); }
  saveState(); closeModal(); rerender();
};
function zq_mergeGroup(o){ var ph = zq_digits(o.phone); return ao_list().filter(function(x){ return x.status!=='cancelled' && zq_digits(x.phone)===ph && zq_notOut(x) && zy_dk(x.createdAt)===zy_dk(o.createdAt); }).sort(function(a,b){ return (a.createdAt||0)-(b.createdAt||0); }); }
ACT['zq-merge'] = function(el){
  var o = ST.orders[el.getAttribute('data-id')]; if(!o || !zy_guard('review','merge orders')) return;
  var g = zq_mergeGroup(o); if(g.length<2){ toast(zy('Nothing to merge','মেলানোর কিছু নেই')); return; }
  var t = g[0], rest = g.slice(1), items = g.reduce(function(s,x){ return s + (x.subtotal||0) - (x.discount||0); }, 0), dl = deliveryCharge(t.zone, items), was = g.reduce(function(s,x){ return s + (x.delivery||0); }, 0);
  zy_ask({title:zy('Merge '+g.length+' orders into one parcel?', g.length+'টা অর্ডার এক পার্সেলে মেলাবেন?'), yes:zy('Yes, merge','হ্যাঁ, মেলান'),
    html:'<p class="small">'+esc(zy('Everything goes into ','সব যাবে ')+t.id+zy('; ',' অর্ডারে; ')+rest.map(function(x){ return x.id; }).join(', ')+zy(' are cancelled as “merged”.',' “merged” হিসেবে বাতিল হবে।'))+'</p><div class="zo-kv"><span>'+zy_e('Pieces','পিস')+'</span><span>'+g.reduce(function(s,x){ return s + ao_items(x); }, 0)+'</span><span>'+zy_e('Delivery charges before','আগে ডেলিভারি চার্জ')+'</span><span>'+zy_m(was)+'</span><span>'+zy_e('Delivery charge after','পরে ডেলিভারি চার্জ')+'</span><span>'+zy_m(dl)+'</span><span>'+zy_e('New total','নতুন মোট')+'</span><span>'+zy_m(items+dl)+'</span></div><p class="zs-mini mt8">'+zy_e('The customer saves the extra delivery charge. Call or message them to say it comes as one parcel.','কাস্টমারের বাড়তি ডেলিভারি চার্জ বাঁচে। জানিয়ে দিন এক পার্সেলে যাবে।')+'</p>',
    fn:function(){
      rest.forEach(function(x){ (x.lines||[]).forEach(function(l){ t.lines.push(JSON.parse(JSON.stringify(l))); }); t.setDiscounts = (t.setDiscounts||[]).concat(x.setDiscounts||[]); t.discount = (t.discount||0) + (x.discount||0); if(x.payment!=='cod') t.paid = (t.paid!=null ? t.paid : (t.payment==='cod'?0:t.total)) + ty_paid(x); });
      var tp = t.paid; t.subtotal = t.lines.reduce(function(s,l){ return s + (l.unitPrice||0)*(l.qty||1); }, 0); t.delivery = dl; t.total = t.subtotal - t.discount + dl; if(tp!=null) t.paid = tp; if(t.payment!=='cod' && t.paid==null) t.paid = t.total;
      t.stockTaken = t.stockTaken || rest.some(function(x){ return x.stockTaken; }); t.merged = (t.merged||[]).concat(rest.map(function(x){ return x.id; }));
      var p = zk_parcelOf(t.id); if(p && p.st==='booked') p.cod = zk_cod(t);
      rest.forEach(function(x){ zq_cancel(x, 'Merged into '+t.id); x.mergedInto = t.id; zq_z().rev[x.id] = {d:'merged', reason:'Merged into '+t.id, by:zy_actor().en, at:Date.now()}; });
      zq_z().rev[t.id] = {d:'approved', reason:'Merged '+rest.map(function(x){ return x.id; }).join(', ')+' into this order', by:zy_actor().en, at:Date.now()};
      t.flags = (t.flags||[]).filter(function(f){ return f!==ZQ_FLAG; });
      zy_log('review', 'Merged '+rest.map(function(x){ return x.id; }).join(', ')+' into '+t.id+' — one parcel, delivery '+fmt(was)+' → '+fmt(dl), t.id);
      toast(zy('Merged into '+t.id+' — one parcel','মেলানো হলো '+t.id+' — এক পার্সেল'));
    }});
};
/* the order screen shows the review and the customer's requests */
function zq_orderBlock(o){
  var h = '', sg = zq_signals(o), r = zq_rev(o);
  if(sg.length || r) h += '<div class="ao-sec mt16">'+zy_e('Duplicate / fraud review','ডুপ্লিকেট / ফ্রড রিভিউ')+'</div><div class="zq-ob">'+(r && r.d ? '<span class="zo-pill '+(r.d==='approved'?'ok':'bad')+'">'+esc(r.d)+'</span> <span class="zs-mini">'+esc(r.reason+' · '+r.by)+'</span>' : sg.map(function(s){ return '<div>'+zq_sevPill(s.sev)+' <b>'+esc(zq_ruleName(s.k))+'</b> <span class="zs-mini">'+esc(s.why)+'</span></div>'; }).join('')+'<a class="btn btn-sm btn-ghost mt8" href="#/admin/review" data-act="close-modal-go">'+zy_e('Open the review queue','রিভিউ তালিকা খুলুন')+'</a>')+'</div>';
  var ex = o.exchanges || [], rt = zq_z().rets.filter(function(x){ return x.orderId===o.id; }), cv = zq_z().sup.convs.filter(function(c){ return c.orderId===o.id; });
  if(ex.length || rt.length || cv.length) h += '<div class="ao-sec mt16">'+zy_e('Customer requests','কাস্টমারের অনুরোধ')+'</div><div class="zq-ob">'+
    ex.map(function(x){ return '<div><span class="zo-pill '+(x.status==='completed'?'ok':x.status==='declined'?'bad':'warn')+'">'+esc(x.status)+'</span> '+zy_e('Exchange','এক্সচেঞ্জ')+' '+esc(x.id)+'</div>'; }).join('')+
    rt.map(function(x){ return '<div><span class="zo-pill '+(x.status==='requested'?'warn':'info')+'">'+esc(x.status)+'</span> '+zy_e('Return request','রিটার্নের অনুরোধ')+' '+esc(x.id)+'</div>'; }).join('')+
    cv.map(function(c){ return '<div><span class="zo-pill">'+esc(ZQ_CH[c.ch][0])+'</span> <a class="zs-link" href="#/admin/support?t='+esc(c.id)+'" data-act="close-modal-go">'+esc(c.id)+' · '+esc(c.status)+'</a></div>'; }).join('')+
    ((ex.length || rt.length) ? '<a class="btn btn-sm btn-ghost mt8" href="#/admin/exchanges" data-act="close-modal-go">'+zy_e('Exchanges & returns','এক্সচেঞ্জ ও রিটার্ন')+'</a>' : '')+'</div>';
  return h;
}
ACT['close-modal-go'] = function(el){ closeModal(); go(el.getAttribute('href')); };
(function(){
  if(typeof ao_flagBlock!=='function' || ao_flagBlock._zq) return; var of = ao_flagBlock;
  var nf = function(o, f){ if(f!==ZQ_FLAG) return of.apply(this, arguments);
    return '<div class="ao-flag"><div class="row bold small" style="gap:7px;color:#8A5A1E">'+ico('shield',17)+esc(zy('Duplicate / fraud check','ডুপ্লিকেট / ফ্রড চেক'))+'</div>'+zq_signals(o).map(function(s){ return '<div class="small mt8">'+zq_sevPill(s.sev)+' <b>'+esc(zq_ruleName(s.k))+'</b> — '+esc(s.why)+'</div>'; }).join('')+
      '<div class="row wrap mt12" style="gap:8px"><a class="btn btn-sm btn-primary" href="#/admin/review" data-act="close-modal-go">'+zy_e('Decide in the review queue','রিভিউ তালিকায় সিদ্ধান্ত নিন')+'</a></div></div>'; };
  nf._zq = true; window.ao_flagBlock = nf;
})();

/* =====================================================================
   2 · EXCHANGES & RETURNS (B1.8, B1.9) + RECEIVE & QC
   ===================================================================== */
/* older sample requests carry only the size: fill in the same item in the new size and its money box */
function zq_normEx(o, x){
  if(x.newItem && x.id) return; var l = (o.lines||[])[x.lineIdx||0] || (o.lines||[])[0]; if(!l) return;
  if(!x.newItem){ var sz = x.size || x.newSize || l.size; if(sz && typeof sz==='object') sz = sz.size || l.size; x.newItem = {product:l.product, color:l.color, size:sz}; }
  if(x.codDue==null && typeof exc_money==='function'){ var mo = exc_money(o, l, x.reason==='problem', x.newItem); x.diff = mo.diff; x.charge = mo.charge; x.codDue = mo.codDue; x.walletCredit = mo.walletCredit; }
  if(!x.id) x.id = 'EXC-'+(1000 + zs_hash(o.id+(x.lineIdx||0))%9000); if(!x.tier) x.tier = 1; if(x.lineIdx==null) x.lineIdx = 0;
}
function zq_allEx(){ var out = []; zy_orders().forEach(function(o){ (o.exchanges||[]).forEach(function(x){ zq_normEx(o, x); out.push({o:o, x:x}); }); }); return out.sort(function(a,b){ return (b.x.at||0)-(a.x.at||0); }); }
function zq_line(o, i){ return (o.lines||[])[i] || {}; }
function zq_item(pid, color, size){ var p = P(pid); return esc((p?p.name:pid)+' · '+((COL(color)||{}).name||color)+' · '+size); }
function zq_reasonTxt(r){ return r==='small' ? zy('Too small','ছোট হয়েছে') : r==='big' ? zy('Too big','বড় হয়েছে') : r==='problem' ? zy('Faulty, damaged or wrong item (our mistake)','ত্রুটি, নষ্ট বা ভুল মাল (আমাদের ভুল)') : r; }
function zq_inWindow(o, at){ var h = SET('exchange','windowHours'); return o.deliveredAt && at <= o.deliveredAt + h*3600000; }
PAGES['zq-exch'] = { layout:'admin', title:'Exchanges & returns', render:function(params, q){
  var z = zq_z(), tab = (q && q.tab) || 'req', ex = zq_allEx();
  var req = ex.filter(function(e){ return e.x.status==='requested'; }), recv = zq_toReceive(), rets = z.rets.filter(function(r){ return r.status==='requested'; });
  var head = zy_head('Admin · Exchanges '+zs_pr('185–188 · 190 · B1.8 · B1.9'), 'Exchanges & returns', 'এক্সচেঞ্জ ও রিটার্ন',
    'Requests customers send from their account. Exchange for size or a fault within the window; the exchange delivery charge applies unless the mistake is ours. No returns after delivery — a return request is answered with the policy, or turned into an exchange.',
    'কাস্টমার অ্যাকাউন্ট থেকে যে অনুরোধ পাঠায়। সময়ের মধ্যে সাইজ বা ত্রুটির জন্য এক্সচেঞ্জ; আমাদের ভুল না হলে এক্সচেঞ্জ ডেলিভারি চার্জ লাগে। ডেলিভারির পরে রিটার্ন নেই — রিটার্নের অনুরোধে নিয়মটা জানানো হয়, বা এক্সচেঞ্জ করা হয়।', zy_actorBar());
  if(!zy_can('exchange','view')) return '<div class="zs-page zy-page">'+head+zy_noAccess('exchange')+'</div>';
  var tabs = zo_tabs('#/admin/exchanges', [['req',zy('Exchange requests','এক্সচেঞ্জের অনুরোধ'), req.length || ''],['ret',zy('Return requests','রিটার্নের অনুরোধ'), rets.length || ''],['recv',zy('Receive & QC','ফেরত মাল ও QC'), recv.length || ''],['done',zy('Done','শেষ')]], tab);
  var rule = '<div class="zs-note mb16">'+ico('swap',16)+'<span>'+esc(ruleText('exchange','short'))+' · '+esc(ruleText('no-return','short'))+' <a class="zs-link" href="#/admin/rules">'+zy_e('Smart Rules','স্মার্ট রুলস')+'</a></span></div>';
  var body = tab==='ret' ? zq_retTab(z.rets) : tab==='recv' ? zq_recvTab(recv) : tab==='done' ? zq_doneTab(ex) : zq_reqTab(ex.filter(function(e){ return e.x.status==='requested' || e.x.status==='approved'; }));
  return '<div class="zs-page zy-page">'+head+rule+tabs+body+'</div>';
}};
function zq_money(o, x){
  var faulty = x.reason==='problem';
  return '<div class="zo-kv zq-mb"><span>'+zy_e('Price difference','দামের পার্থক্য')+'</span><span>'+(x.diff>0?'+':'')+zy_m(x.diff||0)+'</span><span>'+zy_e('Exchange delivery','এক্সচেঞ্জ ডেলিভারি')+'</span><span>'+(faulty ? zy_e('৳0 — our mistake (after the check)','৳০ — আমাদের ভুল (চেকের পরে)') : zy_m(x.charge||0)+' · '+esc(ao_zone(o)))+'</span>'+
    '<span>'+zy_e('Rider collects (COD)','রাইডার নেবে (COD)')+'</span><span><b>'+zy_m(x.codDue||0)+'</b></span>'+(x.walletCredit ? '<span>'+zy_e('Wallet credit after the check','চেকের পরে ওয়ালেটে')+'</span><span>'+zy_m(x.walletCredit)+'</span>' : '')+'</div>';
}
function zq_exCard(e){
  var o = e.o, x = e.x, l = zq_line(o, x.lineIdx), st = stockOf(x.newItem.product, x.newItem.color, x.newItem.size), inWin = zq_inWindow(o, x.at||Date.now());
  return '<article class="zs-card zq-ex" data-testid="zq-ex-'+esc(x.id)+'"><div class="row between wrap" style="gap:8px"><div style="min-width:0"><div class="small bold">'+esc(x.id)+' · <button type="button" class="ao-idbtn" data-act="ao-open" data-id="'+esc(o.id)+'">'+esc(o.id)+'</button> · '+esc(o.name)+'</div><div class="zs-mini">'+esc(zq_reasonTxt(x.reason))+' · '+esc(dateTimeStr(x.at))+(x.photo?' · '+zy_e('photo attached','ছবি আছে'):'')+(x.note?' · “'+esc(x.note)+'”':'')+'</div></div>'+
    '<span class="zo-pill '+(x.status==='approved'?'info':'warn')+'">'+esc(x.status==='approved'?zy('Approved · swap booked','অনুমোদিত · বুক হয়েছে'):zy('Waiting for you','আপনার অপেক্ষায়'))+'</span></div>'+
    '<div class="zq-swap"><div><div class="zs-mini">'+zy_e('Comes back','ফেরত আসবে')+'</div><b>'+zq_item(l.product, l.color, l.size)+'</b></div>'+ico('right',16)+'<div><div class="zs-mini">'+zy_e('Goes out','যাবে')+' · '+esc(zy('tier ','ধাপ ')+(x.tier||1))+'</div><b>'+zq_item(x.newItem.product, x.newItem.color, x.newItem.size)+'</b><div class="zs-mini '+(st>0?'':'bad')+'">'+esc(st>0 ? zy(st+' in stock', 'স্টকে '+st+'টা') : zy('Out of stock now','এখন স্টকে নেই'))+'</div></div></div>'+zq_money(o, x)+
    (!inWin ? '<div class="zs-note warn mt8">'+ico('info',16)+'<span>'+zy_e('Asked after the exchange window — approve only if the owner agrees.','এক্সচেঞ্জের সময় পেরিয়ে চাওয়া — মালিক রাজি হলে তবেই।')+'</span></div>' : '')+
    (x.status==='approved' ? '<div class="zs-mini mt8">'+esc(zy('Swap booked with ','বুক হয়েছে: ')+((zk_c(x.swap.courier)||{}).name||'')+' '+x.swap.cid+' · '+zy('costs us ','আমাদের খরচ ')+fmt(x.swap.charge))+'</div><div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-primary" data-act="zq-recv-ex" data-id="'+esc(o.id)+'" data-x="'+esc(x.id)+'" data-testid="zq-recv">'+ico('box',14)+zy_e('Old item received — QC','পুরনো মাল এসেছে — QC')+'</button></div>'
      : '<div class="zs-actions mt12"><button type="button" class="btn btn-sm btn-primary" data-act="zq-ex-ok" data-id="'+esc(o.id)+'" data-x="'+esc(x.id)+'"'+(st>0?'':' disabled')+' data-testid="zq-ex-ok">'+ico('check',14)+zy_e('Approve & book the swap','অনুমোদন ও বুক')+'</button><button type="button" class="btn btn-sm zx-danger" data-act="zq-ex-no" data-id="'+esc(o.id)+'" data-x="'+esc(x.id)+'">'+ico('close',14)+zy_e('Decline…','বাতিল…')+'</button></div>')+'</article>';
}
function zq_reqTab(list){ return list.length ? '<div class="zq-rcs">'+list.map(zq_exCard).join('')+'</div>' : '<section class="zs-card"><div class="zs-mini">'+zy_e('No exchange request waiting. Customers ask from My account → order → Exchange size.','কোনো এক্সচেঞ্জের অনুরোধ নেই। কাস্টমার চায় My account → অর্ডার → Exchange size থেকে।')+'</div></section>'; }
function zq_findEx(oid, xid){ var o = ST.orders[oid]; if(!o) return null; var x = (o.exchanges||[]).filter(function(y){ return y.id===xid; })[0]; return x ? {o:o, x:x} : null; }
ACT['zq-ex-ok'] = function(el){
  var e = zq_findEx(el.getAttribute('data-id'), el.getAttribute('data-x')); if(!e || !zy_guard('exchange','approve an exchange')) return; var o = e.o, x = e.x;
  if(stockOf(x.newItem.product, x.newItem.color, x.newItem.size)<=0){ toast(zy('The new item is out of stock — offer the next option or decline','নতুন মাল স্টকে নেই — পরের অপশন দিন বা বাতিল করুন')); return; }
  var b = zk_band(o.zone), c = zk_pick(b);
  zy_ask({title:zy('Approve exchange '+x.id+'?','এক্সচেঞ্জ '+x.id+' অনুমোদন করবেন?'), yes:zy('Yes, approve and book','হ্যাঁ, অনুমোদন ও বুক'), html:zq_money(o, x)+'<p class="zs-mini mt8">'+esc(zy('The new item is held from stock now. The rider brings it and collects the old one in one trip (','নতুন মাল এখনই স্টক থেকে আলাদা হবে। রাইডার এক যাত্রায় নতুনটা দিয়ে পুরনোটা নেবে (')+(c?c.name+' · '+fmt(c.rates[b]):'')+'). '+zy('The wallet credit, if any, waits for the check of the old item.','ওয়ালেট ক্রেডিট থাকলে পুরনো মাল চেকের পরে যাবে।'))+'</p>',
    fn:function(){ x.status = 'approved'; x.zy = true; x.approvedAt = Date.now(); x.approvedBy = zy_actor().en;
      x.swap = {courier:c ? c.id : '', cid:(c ? ({steadfast:'SF',pathao:'PT',redx:'RX'}[c.id]||'PF') : 'XX')+'-X'+(100000+zs_hash(x.id)%899999), charge:c ? c.rates[b] : 0, at:Date.now()};
      zy_move(x.newItem.product, x.newItem.color, x.newItem.size, -1, 'Exchange '+x.id+' — new item out', x.id);
      zy_log('exchange', 'Approved exchange '+x.id+' on '+o.id+': '+(P(x.newItem.product)||{}).name+' '+x.newItem.size+' out, COD '+fmt(x.codDue||0)+', swap '+x.swap.cid, o.id);
      toast(zy('Approved — swap booked, new item held','অনুমোদিত — বুক হয়েছে, নতুন মাল আলাদা')); }});
};
var ZQ_EXNO = [['Asked after the exchange window','এক্সচেঞ্জের সময় পেরিয়ে গেছে'],['Item used, washed or tags removed','ব্যবহার করা, ধোয়া বা ট্যাগ নেই'],['Reason is not size or a fault (policy)','কারণ সাইজ বা ত্রুটি না (নিয়ম)'],['Already exchanged once','আগে একবার এক্সচেঞ্জ হয়েছে']];
ACT['zq-ex-no'] = function(el){
  var e = zq_findEx(el.getAttribute('data-id'), el.getAttribute('data-x')); if(!e || !zy_guard('exchange','decline an exchange')) return; UI.zqNo = '';
  zy_ask({title:zy('Decline exchange '+e.x.id+'?','এক্সচেঞ্জ '+e.x.id+' বাতিল করবেন?'), danger:true, yes:zy('Yes, decline','হ্যাঁ, বাতিল'), html:'<label class="label" for="zq-no">'+zy_e('Reason (the customer sees it)','কারণ (কাস্টমার দেখবেন)')+'</label><select id="zq-no" class="input" data-change="zq-no"><option value="">'+zy_e('Choose…','বাছুন…')+'</option>'+ZQ_EXNO.map(function(r, i){ return '<option value="'+i+'">'+esc(zy(r[0],r[1]))+'</option>'; }).join('')+'</select><p class="zs-mini mt8">'+zy_e('A reply goes into the customer\'s support chat (website).','কাস্টমারের সাপোর্ট চ্যাটে (ওয়েবসাইট) উত্তর যাবে।')+'</p>',
    fn:function(){ var why = UI.zqNo!=='' && UI.zqNo!=null ? ZQ_EXNO[+UI.zqNo][0] : 'Not within the exchange policy'; e.x.status = 'declined'; e.x.zy = true; e.x.declined = {reason:why, by:zy_actor().en, at:Date.now()};
      zq_reply(e.o, 'Your exchange request '+e.x.id+' could not be approved: '+why+'. '+ruleText('exchange','short')+'.', 'Exchange '+e.x.id);
      zy_log('exchange', 'Declined exchange '+e.x.id+' on '+e.o.id+': '+why, e.o.id); toast(zy('Declined — the customer was told in the chat','বাতিল — কাস্টমারকে চ্যাটে জানানো হলো')); }});
};
CHANGE['zq-no'] = function(el){ UI.zqNo = el.value; };
/* what is coming back to the shop: exchange old items + refused parcels */
function zq_toReceive(){
  var out = [];
  zq_allEx().forEach(function(e){ if(e.x.status==='approved') out.push({kind:'ex', o:e.o, x:e.x, at:e.x.approvedAt||e.x.at}); });
  zy_orders().forEach(function(o){ var p = zk_parcelOf(o.id); if(p && (p.st==='refused' || p.st==='returned')) out.push({kind:'parcel', o:o, p:p, at:p.at}); });
  return out.sort(function(a,b){ return b.at - a.at; });
}
var ZQ_QC = [['good','Good — back to stock','ভালো — স্টকে ফেরত'],['b','B-grade — sell as second, not as new','বি-গ্রেড — নতুন হিসেবে না, সেকেন্ড হিসেবে'],['damaged','Damaged — write off','নষ্ট — বাদ']];
function zq_recvTab(list){
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Coming back to the shop','দোকানে ফেরত আসছে')+'</h2>'+zs_pr('096 · 188 · 190')+'</div><div class="zs-sub">'+zy_e('Check every piece when it arrives. Good goes back to stock; B-grade is kept apart; damaged is written off. Stock and the P&L change at once.','মাল এলে প্রতিটা পিস চেক করুন। ভালো স্টকে ফেরে; বি-গ্রেড আলাদা থাকে; নষ্ট বাদ যায়। স্টক আর P&L সাথে সাথে বদলায়।')+'</div>'+
    (list.length ? '<div class="zs-list">'+list.map(function(r){ var o = r.o;
      if(r.kind==='ex'){ var l = zq_line(o, r.x.lineIdx); return '<div class="zs-li"><div style="min-width:0"><div class="t">'+zy_e('Exchange','এক্সচেঞ্জ')+' '+esc(r.x.id)+' · '+esc(o.id)+' · '+esc(o.name)+'</div><div class="m">'+zq_item(l.product, l.color, l.size)+' · '+esc((zk_c(r.x.swap.courier)||{}).name||'')+' '+esc(r.x.swap.cid)+'</div></div><div class="r"><button type="button" class="btn btn-sm btn-primary" data-act="zq-recv-ex" data-id="'+esc(o.id)+'" data-x="'+esc(r.x.id)+'">'+zy_e('Received — QC','এসেছে — QC')+'</button></div></div>'; }
      return '<div class="zs-li"><div style="min-width:0"><div class="t">'+zy_e('Refused parcel','না নেওয়া পার্সেল')+' · '+esc(o.id)+' · '+esc(o.name)+'</div><div class="m">'+zq_pcs(ao_items(o))+' · '+esc((zk_c(r.p.courier)||{}).name||'')+' '+esc(r.p.cid)+(r.p.reason?' · '+esc(r.p.reason):'')+'</div></div><div class="r">'+(r.p.st==='refused' ? '<button type="button" class="btn btn-sm btn-secondary" data-act="zk-back" data-id="'+esc(o.id)+'">'+zy_e('Parcel is back','পার্সেল ফিরেছে')+'</button>' : '<button type="button" class="btn btn-sm btn-primary" data-act="zq-recv-p" data-id="'+esc(o.id)+'">'+zy_e('QC the pieces','পিস QC করুন')+'</button>')+'</div></div>'; }).join('')+'</div>'
      : '<div class="zs-mini">'+zy_e('Nothing is on its way back.','কিছু ফেরত আসছে না।')+'</div>')+'</section>'+zq_bstock();
}
function zq_bstock(){
  var m = zy_st().moves.filter(function(x){ return x.sellable===false; }); if(!m.length) return '';
  return '<section class="zs-card zo-mt"><h2>'+zy_e('Kept apart (not sold as new)','আলাদা রাখা (নতুন হিসেবে বিক্রি না)')+'</h2><div class="zo-tw mt8"><table class="zo-tbl"><thead><tr><th>'+zy_e('Item','মাল')+'</th><th>'+zy_e('Why','কেন')+'</th><th>'+zy_e('When','কখন')+'</th></tr></thead><tbody>'+m.map(function(x){ return '<tr><td>'+zq_item(x.pid, x.color, x.size)+'</td><td>'+esc(x.why)+'</td><td>'+esc(dateTimeStr(x.at))+'</td></tr>'; }).join('')+'</tbody></table></div></section>';
}
function zq_qcForm(title){
  var u = UI.zqQc || {};
  return '<p class="small">'+esc(title)+'</p><div class="zq-qc" role="radiogroup" aria-label="'+zy_e('QC result','QC ফলাফল')+'">'+ZQ_QC.map(function(q){ return '<button type="button" class="chip'+(u.g===q[0]?' on':'')+'" role="radio" aria-checked="'+(u.g===q[0])+'" data-act="zq-qc-g" data-g="'+q[0]+'" data-testid="zq-qc-'+q[0]+'">'+esc(zy(q[1],q[2]))+'</button>'; }).join('')+'</div>'+
    '<label class="label mt12" for="zq-qcn">'+zy_e('Note (optional)','নোট (ইচ্ছা হলে)')+'</label><input id="zq-qcn" class="input" maxlength="120" data-input="zq-qc-n" value="'+esc(u.n||'')+'">'+
    '<div class="zs-actions mt16"><button type="button" class="btn btn-primary" data-act="zq-qc-go"'+(u.g?'':' disabled')+' data-testid="zq-qc-go">'+zy_e('Save the check','চেক সেভ করুন')+'</button><button type="button" class="btn btn-ghost" data-act="close-modal">'+zy_e('Cancel','বাতিল')+'</button></div>';
}
ACT['zq-qc-g'] = function(el){ if(UI.zqQc){ UI.zqQc.g = el.getAttribute('data-g'); refreshModal(); } };
INPUT['zq-qc-n'] = function(el){ if(UI.zqQc) UI.zqQc.n = String(el.value).trim(); };
ACT['zq-recv-ex'] = function(el){ var e = zq_findEx(el.getAttribute('data-id'), el.getAttribute('data-x')); if(!e || !zy_guard('exchange','check a returned item')) return; var l = zq_line(e.o, e.x.lineIdx);
  UI.zqQc = {kind:'ex', oid:e.o.id, xid:e.x.id, g:'', n:''}; var t = zy('Exchange ','এক্সচেঞ্জ ')+e.x.id+' · '+(P(l.product)||{}).name+' · '+l.size;
  openModal(zq_qcForm(t), {title:zy('Check the item that came back','ফেরত মাল চেক করুন'), rebuild:function(){ return zq_qcForm(t); }}); };
ACT['zq-recv-p'] = function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o || !zy_guard('exchange','check a returned parcel')) return;
  UI.zqQc = {kind:'parcel', oid:o.id, g:'', n:''}; var t = zy('Refused parcel ','না নেওয়া পার্সেল ')+o.id+' · '+ao_items(o)+zy(' pcs',' পিস');
  openModal(zq_qcForm(t), {title:zy('Check the parcel that came back','ফেরত পার্সেল চেক করুন'), rebuild:function(){ return zq_qcForm(t); }}); };
ACT['zq-qc-go'] = function(){
  var u = UI.zqQc; if(!u || !u.g) return; var z = zy_st(), F = z.fin, rec = u.g==='good' ? 1 : u.g==='b' ? (+F.bPct||0)/100 : 0, gName = (ZQ_QC.filter(function(q){ return q[0]===u.g; })[0]||[])[1];
  if(u.kind==='ex'){
    var e = zq_findEx(u.oid, u.xid); if(!e) return; var o = e.o, x = e.x, l = zq_line(o, x.lineIdx);
    x.qc = u.g; x.qcNote = u.n||''; x.status = 'completed'; x.doneAt = Date.now(); x.doneBy = zy_actor().en; x.codCollected = x.codDue||0;
    if(u.g==='good') zy_move(l.product, l.color, l.size, 1, 'Exchange '+x.id+' — back, QC good', x.id);
    else zy_move(l.product, l.color, l.size, 1, 'Exchange '+x.id+' — '+gName, x.id, false);
    var pass = u.g==='good' || x.reason==='problem';
    if(x.walletCredit>0){ var acc = ST.accounts[o.phone]; if(pass && acc){ acc.wallet = (acc.wallet||0) + x.walletCredit; acc.walletTx = acc.walletTx || []; acc.walletTx.unshift({label:'Exchange credit · #'+x.id, amount:x.walletCredit, at:Date.now()}); x.walletPosted = true; } else x.walletHeld = true; }
    zy_log('exchange', 'Exchange '+x.id+' done: old item QC '+gName+(x.walletPosted ? ', wallet +'+fmt(x.walletCredit) : x.walletHeld ? ', wallet credit held (failed check)' : '')+', COD '+fmt(x.codDue||0), o.id);
    toast(zy('Exchange complete — stock updated','এক্সচেঞ্জ শেষ — স্টক আপডেট'));
  } else {
    var o2 = ST.orders[u.oid]; if(!o2) return;
    if(typeof ACT['zk-restock']==='function') ACT['zk-restock']({getAttribute:function(k){ return k==='data-id' ? o2.id : null; }});
    if(u.g!=='good'){ var loss = 0; (o2.lines||[]).forEach(function(l){ var q = l.qty||1; zy_move(l.product, l.color, l.size, -q, 'Refused parcel '+o2.id+' — '+gName, o2.id); zy_move(l.product, l.color, l.size, q, 'Refused parcel '+o2.id+' — '+gName, o2.id, false); loss += Math.round(q*zy_cost(l.product, l.size)*(1-rec)); });
      z.qc.push({at:Date.now(), oid:o2.id, grade:u.g, loss:loss}); }
    o2.qc = u.g; zy_log('exchange', 'Refused parcel '+o2.id+' checked: '+gName, o2.id);
    toast(zy('Checked — stock updated','চেক হয়েছে — স্টক আপডেট'));
  }
  UI.zqQc = null; saveState(); closeModal(); rerender();
};
function zq_doneTab(ex){
  var done = ex.filter(function(e){ return e.x.status==='completed' || e.x.status==='declined'; }), rets = zq_z().rets.filter(function(r){ return r.status!=='requested'; });
  return '<section class="zs-card"><h2>'+zy_e('Finished','শেষ হয়েছে')+'</h2>'+(done.length || rets.length ? '<div class="zo-tw mt8"><table class="zo-tbl"><thead><tr><th>'+zy_e('Request','অনুরোধ')+'</th><th>'+zy_e('Result','ফলাফল')+'</th><th>'+zy_e('Money','টাকা')+'</th><th>'+zy_e('By','কে')+'</th></tr></thead><tbody>'+
    done.map(function(e){ var x = e.x; return '<tr><td>'+esc(x.id)+' · '+esc(e.o.id)+' · '+esc(e.o.name)+'</td><td>'+esc(x.status==='declined' ? zy('Declined: ','বাতিল: ')+x.declined.reason : zy('Done · QC ','শেষ · QC ')+(x.qc||'—'))+'</td><td>'+esc(zy('COD ','COD ')+fmt(x.codCollected||0)+(x.walletPosted?' · '+zy('wallet +','ওয়ালেট +')+fmt(x.walletCredit):'')+(x.walletHeld?' · '+zy('credit held','ক্রেডিট আটকে'):''))+'</td><td>'+esc(x.doneBy||(x.declined||{}).by||'')+'</td></tr>'; }).join('')+
    rets.map(function(r){ return '<tr><td>'+esc(r.id)+' · '+esc(r.orderId)+'</td><td>'+esc(r.status==='declined' ? zy('Return declined — policy sent','রিটার্ন বাতিল — নিয়ম জানানো হয়েছে') : zy('Turned into exchange ','এক্সচেঞ্জ করা হয়েছে ')+(r.exId||''))+'</td><td>—</td><td>'+esc((r.decision||{}).by||'')+'</td></tr>'; }).join('')+'</tbody></table></div>' : '<div class="zs-mini mt8">'+zy_e('Nothing finished yet.','এখনো কিছু শেষ হয়নি।')+'</div>')+'</section>';
}
var ZQ_RETR = {dislike:['Did not like it','পছন্দ হয়নি'], size:['Size does not fit','সাইজ মেলেনি'], fault:['Faulty, damaged or wrong item','ত্রুটি, নষ্ট বা ভুল মাল'], other:['Other','অন্য কারণ']};
function zq_retTab(all){
  var list = all.filter(function(r){ return r.status==='requested'; });
  return '<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Return requests','রিটার্নের অনুরোধ')+'</h2>'+zs_pr('B1.9')+'</div><div class="zs-sub">'+esc(ruleText('no-return','short'))+'. '+zy_e('Decline with the policy text, or — for size or a fault inside the window — turn it into an exchange.','নিয়মের লেখা দিয়ে বাতিল করুন, বা — সময়ের মধ্যে সাইজ বা ত্রুটি হলে — এক্সচেঞ্জ করুন।')+'</div>'+
    (list.length ? '<div class="zs-list">'+list.map(function(r){ var o = ST.orders[r.orderId]; if(!o) return ''; var l = zq_line(o, r.lineIdx), can = (r.reason==='size' || r.reason==='fault') && zq_inWindow(o, Date.now()) && (typeof acc_lineExchangeable!=='function' || acc_lineExchangeable(o, r.lineIdx));
      return '<div class="zs-li" data-testid="zq-ret-'+esc(r.id)+'"><div style="min-width:0"><div class="t">'+esc(r.id)+' · '+esc(o.id)+' · '+esc(o.name)+'</div><div class="m">'+zq_item(l.product, l.color, l.size)+' · '+esc(zy(ZQ_RETR[r.reason][0], ZQ_RETR[r.reason][1]))+(r.note?' · “'+esc(r.note)+'”':'')+' · '+esc(dateTimeStr(r.at))+'</div></div>'+
        '<div class="r"><button type="button" class="btn btn-sm btn-secondary" data-act="zq-ret-no" data-id="'+esc(r.id)+'" data-testid="zq-ret-no">'+zy_e('Decline with the policy','নিয়ম জানিয়ে বাতিল')+'</button>'+(can ? '<button type="button" class="btn btn-sm btn-primary" data-act="zq-ret-ex" data-id="'+esc(r.id)+'">'+ico('swap',14)+zy_e('Turn into exchange','এক্সচেঞ্জ করুন')+'</button>' : '<span class="zs-mini">'+esc(r.reason==='size'||r.reason==='fault' ? zy('Window closed — exchange not possible','সময় শেষ — এক্সচেঞ্জ হবে না') : zy('Not size or a fault — policy applies','সাইজ বা ত্রুটি না — নিয়ম খাটে'))+'</span>')+'</div></div>'; }).join('')+'</div>'
      : '<div class="zs-mini">'+zy_e('No return request waiting.','কোনো রিটার্নের অনুরোধ নেই।')+'</div>')+'</section>';
}
function zq_findRet(id){ return zq_z().rets.filter(function(r){ return r.id===id; })[0] || null; }
ACT['zq-ret-no'] = function(el){
  var r = zq_findRet(el.getAttribute('data-id')); if(!r || !zy_guard('exchange','decline a return')) return; var o = ST.orders[r.orderId]; if(!o) return;
  var txt = 'Sorry — '+ruleText('no-return','full').split('\n').join(' ');
  zy_ask({title:zy('Decline return '+r.id+'?','রিটার্ন '+r.id+' বাতিল করবেন?'), yes:zy('Decline and send the policy','বাতিল করে নিয়ম পাঠান'), html:'<p class="small">'+zy_e('This reply goes into the customer\'s support chat:','এই উত্তর কাস্টমারের সাপোর্ট চ্যাটে যাবে:')+'</p><div class="zy-msgt" translate="no">'+esc(txt)+'</div>',
    fn:function(){ r.status = 'declined'; r.decision = {at:Date.now(), by:zy_actor().en, text:txt}; zq_reply(o, txt, 'Return '+r.id); zy_log('exchange', 'Declined return '+r.id+' on '+o.id+' with the policy text', o.id); toast(zy('Declined — the policy was sent in the chat','বাতিল — নিয়ম চ্যাটে পাঠানো হলো')); }});
};
ACT['zq-ret-ex'] = function(el){
  var r = zq_findRet(el.getAttribute('data-id')); if(!r || !zy_guard('exchange','turn a return into an exchange')) return; var o = ST.orders[r.orderId]; if(!o) return; var l = zq_line(o, r.lineIdx), p = P(l.product);
  UI.zqRx = {id:r.id, size:r.reason==='fault' ? l.size : ''};
  var form = function(){ var u = UI.zqRx; return '<p class="small">'+zq_item(l.product, l.color, l.size)+'</p>'+(r.reason==='fault' ? '<p class="small">'+zy_e('Fault: replaced free in the same size after the check.','ত্রুটি: চেকের পরে একই সাইজে বিনা খরচে বদল।')+'</p>' :
    '<div class="label">'+zy_e('Size needed','কোন সাইজ লাগবে')+'</div><div class="zs-pages">'+p.sizes.filter(function(s){ return s!==l.size; }).map(function(s){ return '<button type="button" class="chip'+(u.size===s?' on':'')+'" data-act="zq-rx-s" data-s="'+esc(s)+'">'+esc(s)+'</button>'; }).join('')+'</div>')+
    '<div class="zs-actions mt16"><button type="button" class="btn btn-primary" data-act="zq-rx-go"'+(u.size?'':' disabled')+'>'+zy_e('Create the exchange','এক্সচেঞ্জ তৈরি করুন')+'</button><button type="button" class="btn btn-ghost" data-act="close-modal">'+zy_e('Cancel','বাতিল')+'</button></div>'; };
  openModal(form(), {title:zy('Turn '+r.id+' into an exchange',r.id+' এক্সচেঞ্জে বদলান'), rebuild:form});
};
ACT['zq-rx-s'] = function(el){ if(UI.zqRx){ UI.zqRx.size = el.getAttribute('data-s'); refreshModal(); } };
ACT['zq-rx-go'] = function(){
  var u = UI.zqRx, r = u && zq_findRet(u.id); if(!r) return; var o = ST.orders[r.orderId], l = zq_line(o, r.lineIdx), reason = r.reason==='fault' ? 'problem' : 'small';
  var opts = exchangeOptions(o, r.lineIdx, u.size, reason), g = opts.groups[0];
  if(!g){ toast(zy('Nothing in stock in that size — tell the customer','সেই সাইজে কিছু স্টকে নেই — কাস্টমারকে জানান')); return; }
  var pick = {product:g.product, color:g.colors[0]}, mo = exc_money(o, l, reason==='problem', pick);
  var id = 'EXC-'+(1000 + zs_hash(r.id+o.id)%9000);
  var x = {id:id, lineIdx:r.lineIdx, reason:reason, size:opts.size, newItem:{product:pick.product, color:pick.color, size:opts.size}, diff:mo.diff, charge:mo.charge, codDue:mo.codDue, walletCredit:mo.walletCredit, status:'requested', at:Date.now(), tier:opts.tier, photo:false, note:'From return request '+r.id, fromReturn:r.id};
  closeModal();
  zy_ask({title:zy('Create exchange '+id+'?','এক্সচেঞ্জ '+id+' তৈরি করবেন?'), html:'<p class="small">'+zq_item(l.product, l.color, l.size)+' → '+zq_item(pick.product, pick.color, opts.size)+'</p>'+zq_money(o, x)+'<p class="zs-mini mt8">'+zy_e('It goes to Exchange requests for approval.','এটা অনুমোদনের জন্য Exchange requests-এ যাবে।')+'</p>',
    fn:function(){ o.exchanges = o.exchanges || []; o.exchanges.push(x); r.status = 'converted'; r.exId = id; r.decision = {at:Date.now(), by:zy_actor().en}; zq_reply(o, 'We can\'t take returns after delivery, but we have set up an exchange for you: '+(P(pick.product)||{}).name+' size '+opts.size+'. Pay on delivery: '+fmt(x.codDue)+'.', 'Return '+r.id);
      zy_log('exchange', 'Return '+r.id+' turned into exchange '+id+' on '+o.id, o.id); toast(zy('Exchange '+id+' created','এক্সচেঞ্জ '+id+' তৈরি হয়েছে')); }});
};

/* =====================================================================
   3 · SUPPORT INBOX — every channel, one list (S22)
   ===================================================================== */
var ZQ_CH = {messenger:['Messenger','মেসেঞ্জার','facebook'], whatsapp:['WhatsApp','হোয়াটসঅ্যাপ','whatsapp'], web:['Website chat','ওয়েবসাইট চ্যাট','chat'], email:['Email','ইমেইল','mail'], sms:['SMS reply','SMS উত্তর','phone']};
var ZQ_STS = {open:['Open','খোলা'], pending:['Waiting for customer','কাস্টমারের অপেক্ষায়'], solved:['Solved','সমাধান হয়েছে']};
function zq_sup(){
  var z = zq_z(), s = z.sup;
  if(!s.seeded){ s.seeded = true; var now = Date.now(), M = 60000;   /* mock channels: three sample messages tied to the demo's own orders */
    var o1 = ST.orders['EX-1040'], o2 = ST.orders['EX-1039'];
    if(o1) zq_newConv('messenger', o1.name, o1.phone, o1.id, 'Bhai amar order '+o1.id+' kobe pabo? Ajke ki ashbe?', now-38*M, true);
    if(o2) zq_newConv('whatsapp', o2.name, o2.phone, o2.id, 'Shirt ta M e choto hoise, L lagbe. Exchange kivabe korbo?', now-21*M, true);
    zq_newConv('web', 'Website visitor', '', '', 'Hi, is the Heavyweight Hoodie in black XL in stock?', now-6*M, true);
  }
  return s;
}
function zq_newConv(ch, name, phone, oid, text, at, sample){
  var z = zq_z(), s = z.sup, id = 'T-'+(z.seq.tk++);
  var c = {id:id, ch:ch, name:name||'Customer', phone:phone||'', orderId:oid||'', status:'open', assignee:'', msgs:[{from:'cust', by:name||'Customer', text:text, at:at||Date.now()}], at:at||Date.now(), sample:!!sample};
  s.convs.unshift(c); return c;
}
function zq_conv(id){ return zq_sup().convs.filter(function(c){ return c.id===id; })[0] || null; }
function zq_phoneOf(c){ if(c.phone) return c.phone; for(var i=0;i<c.msgs.length;i++){ var m = /(?:\+?88)?0?1[3-9]\d{8}/.exec(String(c.msgs[i].text).replace(/[\s-]/g,'')); if(m){ var r = checkPhone(m[0]); if(r.state==='ok') return r.digits || m[0]; } } return ''; }
function zq_lastCust(c){ for(var i=c.msgs.length-1;i>=0;i--){ if(c.msgs[i].from==='cust') return c.msgs[i]; if(c.msgs[i].from==='staff') return null; } return null; }
function zq_mins(ms){ var m = Math.max(0, Math.round(ms/60000)); return m<60 ? m+' min' : Math.floor(m/60)+' h '+(m%60)+' min'; }
/* the customer side posts here too (website chat) */
function zq_custSay(o, text){
  var s = zq_sup(), c = s.convs.filter(function(x){ return x.orderId===o.id && x.ch==='web'; })[0];
  if(!c) c = zq_newConv('web', o.name, o.phone, o.id, text, Date.now());
  else { c.msgs.push({from:'cust', by:o.name, text:text, at:Date.now()}); c.status = 'open'; c.at = Date.now(); s.convs.splice(s.convs.indexOf(c), 1); s.convs.unshift(c); }
  return c;
}
/* a reply the shop sends without a typed message (exchange / return decisions) */
function zq_reply(o, text, about){
  var s = zq_sup(), c = s.convs.filter(function(x){ return x.orderId===o.id && x.ch==='web'; })[0];
  if(!c){ c = {id:'T-'+(zq_z().seq.tk++), ch:'web', name:o.name, phone:o.phone, orderId:o.id, status:'pending', assignee:'', msgs:[], at:Date.now()}; s.convs.unshift(c); }
  c.msgs.push({from:'staff', by:zy_actor().en, text:text, at:Date.now(), about:about||''}); if(!c.firstReplyAt) c.firstReplyAt = Date.now(); c.status = 'pending';
}
/* EXTAS AI's draft: rule-based (works with AI off), grounded in Smart Rules and the order — says it doesn't know rather than invent */
function zq_draft(c){
  var m = zq_lastCust(c) || c.msgs[c.msgs.length-1] || {text:''}, t = String(m.text).toLowerCase(), ph = zq_phoneOf(c);
  var o = c.orderId ? ST.orders[c.orderId] : (ph ? ao_list().filter(function(x){ return zq_digits(x.phone)===zq_digits(ph) && x.status!=='cancelled'; })[0] : null);
  var first = zy_first(c.name) && c.name!=='Website visitor' ? zy_first(c.name) : '', hi = 'Hi'+(first?' '+first:'')+', ';
  var h = SET('exchange','windowHours'), cin = SET('exchange','chargeInside'), cout = SET('exchange','chargeOutside');
  if(/exchange|choto|boro|size|bodl|change|small|big|fit/.test(t)){
    var left = o && typeof exchangeHoursLeft==='function' ? exchangeHoursLeft(o) : null;
    return hi+'you can exchange for another size within '+h+' hours of delivery: My account → Orders → '+(o?o.id+' → ':'')+'“Exchange size”. Exchange delivery is ৳'+cin+' inside Dhaka / ৳'+cout+' outside, free if the mistake is ours.'+(left!=null ? (left>0 ? ' You have '+left+' hours left for this order.' : ' The exchange window for this order has closed.') : '');
  }
  if(/return|ferot|refund|taka ferot|money back/.test(t)) return hi+ruleText('no-return','short')+'. If the size is wrong or the item is faulty, we can exchange it within '+h+' hours of delivery.';
  if(/kobe|where|kothay|parcel|status|track|order|ashbe|deliver/.test(t) && o){
    var p = zk_parcelOf(o.id), st = AO_STATUS[o.status] || o.status;
    return hi+'your order '+o.id+' is now: '+st+'.'+(p ? ' Courier: '+((zk_c(p.courier)||{}).name)+', tracking '+p.cid+'.' : ' We will book the courier soon and you will get the tracking number by SMS.')+(o.status!=='delivered' && zoneHours(o.zone) ? ' Delivery usually takes up to '+zoneHours(o.zone)+' hours ('+ao_zone(o)+').' : '');
  }
  if(/stock|ache|available|xl|xxl|size|colour|color|kalo|black/.test(t)){
    var hit = DB.products.filter(function(p){ return p.name.toLowerCase().split(/\s+/).some(function(w){ return w.length>4 && t.indexOf(w)>=0; }); })[0];
    if(hit){ var sz = (/\b(3xl|xxl|xl|l|m|s|\d\d)\b/i.exec(t)||[])[1], col = hit.colors.filter(function(cid){ return t.indexOf(String((COL(cid)||{}).name||cid).toLowerCase())>=0; })[0];
      if(sz && col){ sz = sz.toUpperCase(); var n = stockOf(hit.id, col, sz); return hi+hit.name+' in '+COL(col).name+' '+sz+': '+(n>0 ? 'yes, '+n+' in stock right now. Price '+fmt(hit.price)+'.' : 'sorry, out of stock right now. We can tell you when it is back.'); }
      return hi+hit.name+' is '+fmt(hit.price)+'. Which colour and size do you need? I will check the stock.'; }
  }
  return hi+'thank you for your message. I don\'t have the answer to this one yet — an employee will reply shortly.';
}
PAGES['zq-sup'] = { layout:'admin', title:'Support inbox', render:function(params, q){
  var s = zq_sup(), u = ui('zq-sup', {f:'all', ch:'all'}), cur = q && q.t ? zq_conv(q.t) : null;
  var head = zy_head('Admin · Support '+zs_pr('425–436 · 538'), 'Support inbox', 'সাপোর্ট ইনবক্স',
    'Messenger, WhatsApp, website chat, email and SMS replies in one list. Each conversation has a status, an owner and the customer\'s orders beside it. EXTAS AI drafts a reply; a person checks it and sends.',
    'মেসেঞ্জার, হোয়াটসঅ্যাপ, ওয়েবসাইট চ্যাট, ইমেইল আর SMS উত্তর এক তালিকায়। প্রতিটা কথোপকথনের অবস্থা, দায়িত্বে কে আর পাশে কাস্টমারের অর্ডার। EXTAS AI উত্তর লিখে দেয়; মানুষ দেখে পাঠায়।', zs_simTag(zy('Mock channels','ডেমো চ্যানেল'))+zy_actorBar());
  if(!zy_can('support','view')) return '<div class="zs-page zy-page">'+head+zy_noAccess('support')+'</div>';
  var sla = +zq_z().sup.sla || 15, now = Date.now();
  var waitingOver = s.convs.filter(function(c){ var m = zq_lastCust(c); return c.status!=='solved' && m && now - m.at > sla*60000; }).length;
  var fr = s.convs.filter(function(c){ return c.firstReplyAt; }), avg = fr.length ? fr.reduce(function(a,c){ return a + (c.firstReplyAt - c.at); }, 0)/fr.length : 0;
  var kp = '<div class="zs-kpis k4">'+zy_kpi(s.convs.filter(function(c){ return c.status==='open'; }).length, zy('Open','খোলা'))+zy_kpi(waitingOver, zy('Waiting over '+sla+' min',sla+' মিনিটের বেশি অপেক্ষা'), zy('first-reply target','প্রথম উত্তরের লক্ষ্য'), waitingOver?'bad':'')+
    zy_kpi(s.convs.filter(function(c){ return c.status==='solved' && c.solvedAt && ao_today(c.solvedAt); }).length, zy('Solved today','আজ সমাধান'), null, 'ok')+zy_kpi(fr.length ? zq_mins(avg) : '—', zy('Average first reply','গড় প্রথম উত্তর'))+'</div>';
  var mine = zy_actor().id;
  var list = s.convs.filter(function(c){ return (u.f==='all' || (u.f==='mine' ? c.assignee===mine : c.status===u.f)) && (u.ch==='all' || c.ch===u.ch); });
  var filters = '<div class="zs-pages zq-supf" role="group" aria-label="'+zy_e('Filter','ফিল্টার')+'">'+[['all',zy('All','সব')],['open',zy('Open','খোলা')],['pending',zy('Waiting','অপেক্ষায়')],['solved',zy('Solved','সমাধান')],['mine',zy('Mine','আমার')]].map(function(f){ return '<button type="button" class="chip'+(u.f===f[0]?' on':'')+'" data-act="zq-sup-f" data-v="'+f[0]+'" aria-pressed="'+(u.f===f[0])+'">'+esc(f[1])+'</button>'; }).join('')+
    '<select class="input zs-in" data-change="zq-sup-ch" aria-label="'+zy_e('Channel','চ্যানেল')+'"><option value="all">'+zy_e('All channels','সব চ্যানেল')+'</option>'+Object.keys(ZQ_CH).map(function(k){ return '<option value="'+k+'"'+(u.ch===k?' selected':'')+'>'+esc(zy(ZQ_CH[k][0],ZQ_CH[k][1]))+'</option>'; }).join('')+'</select></div>';
  var items = list.length ? list.map(function(c){ var m = c.msgs[c.msgs.length-1] || {}, lc = zq_lastCust(c), wait = lc ? now - lc.at : 0, emp = c.assignee ? zy_emp(c.assignee) : null;
    return '<a class="zq-ci'+(cur && cur.id===c.id?' on':'')+'" href="#/admin/support?t='+esc(c.id)+'" data-testid="zq-ci-'+esc(c.id)+'"><span class="zq-chi">'+ico(ZQ_CH[c.ch][2],16)+'</span><span class="zq-cib"><span class="zq-cit"><b>'+esc(c.name)+'</b><span class="zs-mini">'+esc(zy(ZQ_CH[c.ch][0],ZQ_CH[c.ch][1]))+'</span></span><span class="zq-cim" translate="no">'+esc(String(m.text||'').slice(0,80))+'</span>'+
      '<span class="zq-cis"><span class="zo-pill '+(c.status==='open'?'warn':c.status==='solved'?'ok':'')+'">'+esc(zy(ZQ_STS[c.status][0],ZQ_STS[c.status][1]))+'</span>'+(lc && c.status!=='solved' ? '<span class="zs-mini '+(wait>sla*60000?'bad':'')+'">'+esc(zy('waiting ','অপেক্ষা ')+zq_mins(wait))+'</span>' : '')+(emp?'<span class="zs-mini">'+esc(emp.name)+'</span>':'')+(c.orderId?'<span class="zs-mini">'+esc(c.orderId)+'</span>':'')+'</span></span></a>'; }).join('')
    : '<div class="zs-mini p16">'+zy_e('No conversation here.','এখানে কোনো কথোপকথন নেই।')+'</div>';
  var sim = '<details class="zq-sim"><summary>'+zy_e('Simulate an incoming message (demo)','একটা মেসেজ আসা দেখান (ডেমো)')+'</summary><form data-submit="zq-sim" class="zy-form"><select name="ch" class="input zs-in" aria-label="'+zy_e('Channel','চ্যানেল')+'">'+Object.keys(ZQ_CH).map(function(k){ return '<option value="'+k+'">'+esc(zy(ZQ_CH[k][0],ZQ_CH[k][1]))+'</option>'; }).join('')+'</select>'+
    '<select name="who" class="input zs-in" aria-label="'+zy_e('Customer','কাস্টমার')+'"><option value="">'+zy_e('A new person (no phone)','নতুন কেউ (ফোন নেই)')+'</option>'+ao_list().slice(0, 30).map(function(o){ return '<option value="'+esc(o.id)+'">'+esc(o.name+' · '+o.id)+'</option>'; }).join('')+'</select>'+
    '<input name="text" class="input zs-in" maxlength="300" placeholder="'+zy_e('What the customer writes','কাস্টমার কী লেখেন')+'" required aria-label="'+zy_e('Message','মেসেজ')+'"><button class="btn btn-sm btn-secondary">'+zy_e('Add message','মেসেজ যোগ করুন')+'</button></form></details>';
  var listCol = '<section class="zs-card zq-list'+(cur?' has-cur':'')+'"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Conversations','কথোপকথন')+'</h2><span class="zs-mini">'+s.convs.length+'</span></div>'+filters+'<div class="zq-cis-w">'+items+'</div>'+sim+'</section>';
  return '<div class="zs-page zy-page zq-suppage">'+head+kp+'<div class="zq-grid'+(cur?' cur':'')+'">'+listCol+(cur ? zq_thread(cur)+zq_ctx(cur) : '<section class="zs-card zq-empty hide-m"><div class="zs-mini">'+zy_e('Choose a conversation on the left.','বাঁ দিক থেকে একটা কথোপকথন বাছুন।')+'</div></section>')+'</div></div>';
}};
function zq_thread(c){
  var u = ui('zq-rep:'+c.id, {text:'', ai:false}), emps = zy_st().emp.filter(function(e){ return e.active; });
  var msgs = c.msgs.map(function(m){ var who = m.from==='cust' ? c.name : m.from==='note' ? zy('Internal note · ','ভেতরের নোট · ')+m.by : m.by+(m.ai ? zy(' (drafted by EXTAS AI)',' (EXTAS AI লিখেছে)') : '');
    return '<div class="zq-m '+m.from+'"><div class="zq-bub" translate="no">'+esc(m.text)+'</div><div class="zs-mini">'+esc(who+' · '+dateTimeStr(m.at))+(m.about?' · '+esc(m.about):'')+'</div></div>'; }).join('');
  return '<section class="zs-card zq-thread" data-testid="zq-thread"><div class="row between wrap" style="gap:8px"><div style="min-width:0"><a class="zs-link hide-d" href="#/admin/support">'+zy_e('← All conversations','← সব কথোপকথন')+'</a><h2>'+esc(c.name)+' <span class="zs-mini">'+esc(c.id+' · '+zy(ZQ_CH[c.ch][0],ZQ_CH[c.ch][1]))+(c.sample?' · '+zy_e('sample','নমুনা'):'')+'</span></h2></div>'+
    '<div class="zq-tctl"><select class="input zs-in" data-change="zq-st" data-id="'+esc(c.id)+'" aria-label="'+zy_e('Status','অবস্থা')+'">'+Object.keys(ZQ_STS).map(function(k){ return '<option value="'+k+'"'+(c.status===k?' selected':'')+'>'+esc(zy(ZQ_STS[k][0],ZQ_STS[k][1]))+'</option>'; }).join('')+'</select>'+
    '<select class="input zs-in" data-change="zq-as" data-id="'+esc(c.id)+'" aria-label="'+zy_e('Who handles it','দায়িত্বে কে')+'"><option value="">'+zy_e('Nobody yet','এখনো কেউ না')+'</option>'+emps.map(function(e){ return '<option value="'+e.id+'"'+(c.assignee===e.id?' selected':'')+'>'+esc(e.name)+'</option>'; }).join('')+'</select></div></div>'+
    '<div class="zq-msgs">'+msgs+'</div>'+
    '<div class="zq-comp"><label class="sr" for="zq-rep">'+zy_e('Reply','উত্তর')+'</label><textarea id="zq-rep" class="input" rows="3" maxlength="1000" data-input="zq-rep" data-id="'+esc(c.id)+'" placeholder="'+zy_e('Write a reply…','উত্তর লিখুন…')+'">'+esc(u.text)+'</textarea>'+
      (u.ai ? '<div class="zs-mini zq-aib">'+ico('spark',12)+zy_e('Drafted by EXTAS AI from Smart Rules and the order — check it; a person must send it.','EXTAS AI স্মার্ট রুলস আর অর্ডার দেখে লিখেছে — দেখে নিন; পাঠাবে মানুষ।')+'</div>' : '')+
      '<div class="zs-actions mt8"><button type="button" class="btn btn-sm btn-secondary" data-act="zq-ai" data-id="'+esc(c.id)+'" data-testid="zq-ai">'+ico('spark',14)+zy_e('Draft with EXTAS AI','EXTAS AI দিয়ে লেখান')+'</button>'+
      '<button type="button" class="btn btn-sm btn-primary" data-act="zq-send" data-id="'+esc(c.id)+'" data-testid="zq-send">'+ico('chat',14)+esc(zy('Send on ','পাঠান: ')+zy(ZQ_CH[c.ch][0],ZQ_CH[c.ch][1]))+'</button>'+
      '<button type="button" class="btn btn-sm btn-ghost" data-act="zq-note" data-id="'+esc(c.id)+'">'+zy_e('Add as internal note','ভেতরের নোট হিসেবে রাখুন')+'</button></div></div></section>';
}
function zq_ctx(c){
  var ph = zq_phoneOf(c), os = ph ? ao_list().filter(function(o){ return zq_digits(o.phone)===zq_digits(ph); }) : (c.orderId && ST.orders[c.orderId] ? [ST.orders[c.orderId]] : []);
  var del = os.filter(function(o){ return o.status==='delivered'; }).length, back = os.filter(function(o){ var p = zk_parcelOf(o.id); return o.status==='returned' || (p && ['refused','returned','restocked'].indexOf(p.st)>=0); }).length, canc = os.filter(function(o){ return o.status==='cancelled'; }).length;
  var live = os.filter(function(o){ return o.status!=='cancelled' && o.status!=='delivered' && o.status!=='returned'; });
  var sig = live.length ? zq_signals(live[0]) : [];
  return '<aside class="zs-card zq-ctx" data-testid="zq-ctx"><h2>'+zy_e('Customer','কাস্টমার')+'</h2>'+(ph ? '<div class="small"><b>'+esc(c.name)+'</b> · '+esc(checkPhone(ph).nice || ph)+'</div>' : '<div class="zs-mini">'+zy_e('No phone yet — when the customer types a number in the chat, the history appears here.','এখনো ফোন নেই — কাস্টমার চ্যাটে নম্বর লিখলে এখানে হিস্ট্রি আসবে।')+'</div>')+
    '<div class="zq-ctxk"><span>'+zy_e('Orders','অর্ডার')+' <b>'+os.length+'</b></span><span>'+zy_e('Delivered','ডেলিভারি')+' <b>'+del+'</b></span><span class="'+(back?'bad':'')+'">'+zy_e('Came back','ফেরত')+' <b>'+back+'</b></span><span>'+zy_e('Cancelled','বাতিল')+' <b>'+canc+'</b></span></div>'+
    (live.length ? '<div class="ao-sec mt12">'+zy_e('Open orders','চলমান অর্ডার')+'</div>'+live.map(function(o){ var p = zk_parcelOf(o.id); return '<div class="zq-ctxo"><button type="button" class="ao-idbtn" data-act="ao-open" data-id="'+esc(o.id)+'">'+esc(o.id)+'</button> · '+esc(AO_STATUS[o.status]||o.status)+'<div class="zs-mini">'+zy_m(o.total)+' · '+zq_pcs(ao_items(o))+(p?' · '+esc((zk_c(p.courier)||{}).name+' '+p.cid+' · '+(ZK_ST[p.st]||[p.st])[0]):'')+'</div></div>'; }).join('') : '')+
    (sig.length ? '<div class="ao-sec mt12">'+zy_e('Checks on the open order','চলমান অর্ডারের চেক')+'</div>'+sig.map(function(x){ return '<div class="small">'+zq_sevPill(x.sev)+' '+esc(zq_ruleName(x.k))+'</div>'; }).join('') : '')+
    (os.length ? '<div class="ao-sec mt12">'+zy_e('All orders','সব অর্ডার')+'</div><div class="zs-mini">'+os.map(function(o){ return esc(o.id+' · '+(AO_STATUS[o.status]||o.status)+' · '+fmt(o.total)); }).join('<br>')+'</div>' : '')+'</aside>';
}
ACT['zq-sup-f'] = function(el){ ui('zq-sup', {f:'all', ch:'all'}).f = el.getAttribute('data-v'); rerender(); };
CHANGE['zq-sup-ch'] = function(el){ ui('zq-sup', {f:'all', ch:'all'}).ch = el.value; rerender(); };
INPUT['zq-rep'] = function(el){ var u = ui('zq-rep:'+el.getAttribute('data-id'), {text:'', ai:false}); u.text = el.value; };
ACT['zq-ai'] = function(el){ var c = zq_conv(el.getAttribute('data-id')); if(!c) return; var u = ui('zq-rep:'+c.id, {text:'', ai:false}); u.text = zq_draft(c); u.ai = true; rerender(); var t = document.getElementById('zq-rep'); if(t) t.focus(); };
ACT['zq-send'] = function(el){
  var c = zq_conv(el.getAttribute('data-id')); if(!c) return; var u = ui('zq-rep:'+c.id, {text:'', ai:false}), text = String(u.text||'').trim();
  if(!text){ toast(zy('Write a reply first (or ask EXTAS AI for a draft)','আগে উত্তর লিখুন (বা EXTAS AI-কে বলুন)')); return; }
  if(!zy_guard('support','reply to a customer')) return;
  zy_ask({title:zy('Send this reply?','এই উত্তর পাঠাবেন?'), yes:zy('Send','পাঠান'), html:'<p class="small">'+esc(zy('To ','প্রাপক: ')+c.name+' · '+zy(ZQ_CH[c.ch][0],ZQ_CH[c.ch][1]))+'</p><div class="zy-msgt" translate="no">'+esc(text)+'</div><p class="zs-mini mt8">'+zy_e('Demo: nothing leaves this browser.','ডেমো: ব্রাউজার থেকে কিছু যায় না।')+'</p>',
    fn:function(){ var a = zy_actor(); c.msgs.push({from:'staff', by:a.en, text:text, at:Date.now(), ai:!!u.ai}); if(!c.firstReplyAt) c.firstReplyAt = Date.now(); if(c.status==='open') c.status = 'pending'; if(!c.assignee && a.id!=='owner') c.assignee = a.id;
      zy_log('support', 'Replied on '+c.id+' ('+ZQ_CH[c.ch][0]+')'+(u.ai ? ' — EXTAS AI draft, sent by '+a.en : ''), c.id); delete UI['zq-rep:'+c.id]; toast(zy('Reply sent (demo)','উত্তর গেছে (ডেমো)')); }});
};
ACT['zq-note'] = function(el){
  var c = zq_conv(el.getAttribute('data-id')); if(!c) return; var u = ui('zq-rep:'+c.id, {text:'', ai:false}), text = String(u.text||'').trim(); if(!text){ toast(zy('Write the note in the box first','আগে বক্সে নোট লিখুন')); return; }
  if(!zy_guard('support','add a note')) return;
  zy_ask({title:zy('Save as an internal note?','ভেতরের নোট হিসেবে রাখবেন?'), html:'<div class="zy-msgt" translate="no">'+esc(text)+'</div><p class="zs-mini mt8">'+zy_e('Only the team sees it — never the customer.','শুধু টিম দেখবে — কাস্টমার কখনো না।')+'</p>',
    fn:function(){ c.msgs.push({from:'note', by:zy_actor().en, text:text, at:Date.now()}); zy_log('support', 'Internal note on '+c.id, c.id); delete UI['zq-rep:'+c.id]; }});
};
CHANGE['zq-st'] = function(el){ var c = zq_conv(el.getAttribute('data-id')); if(!c) return; var v = el.value, old = c.status; if(!zy_guard('support','change status')){ el.value = old; return; }
  zy_ask({title:zy('Change the status?','অবস্থা বদলাবেন?'), html:'<p class="small">'+esc(c.id+': '+zy(ZQ_STS[old][0],ZQ_STS[old][1])+' → '+zy(ZQ_STS[v][0],ZQ_STS[v][1]))+'</p>', back:function(){ rerender(); }, fn:function(){ c.status = v; if(v==='solved') c.solvedAt = Date.now(); zy_log('support', c.id+' status '+old+' → '+v, c.id); }}); };
CHANGE['zq-as'] = function(el){ var c = zq_conv(el.getAttribute('data-id')); if(!c) return; var v = el.value, old = c.assignee, e = zy_emp(v); if(!zy_guard('support','assign a conversation')){ el.value = old; return; }
  zy_ask({title:zy('Give this conversation to '+(e?e.name:'nobody')+'?','এই কথোপকথন '+(e?e.name:'কাউকে না')+' দেবেন?'), html:'', back:function(){ rerender(); }, fn:function(){ c.assignee = v; zy_log('support', c.id+' assigned to '+(e?e.name:'nobody'), c.id); }}); };
SUBMIT['zq-sim'] = function(f){
  var ch = f.querySelector('[name=ch]').value, who = f.querySelector('[name=who]').value, text = String(f.querySelector('[name=text]').value).trim(); if(!text) return;
  var o = who ? ST.orders[who] : null, s = zq_sup(), c = o ? s.convs.filter(function(x){ return x.ch===ch && zq_digits(x.phone)===zq_digits(o.phone); })[0] : null;
  if(c){ c.msgs.push({from:'cust', by:c.name, text:text, at:Date.now()}); c.status = 'open'; s.convs.splice(s.convs.indexOf(c), 1); s.convs.unshift(c); }
  else c = zq_newConv(ch, o ? o.name : zy('New visitor','নতুন ভিজিটর'), o ? o.phone : '', o ? o.id : '', text, Date.now());
  saveState(); go('#/admin/support?t='+c.id); toast(zy('Message added (demo)','মেসেজ যোগ হয়েছে (ডেমো)'));
};

/* =====================================================================
   4 · COUPONS — basic, from settings (S13 PR 271–272)
   ===================================================================== */
function zq_cpnFind(code){ code = String(code||'').trim().toUpperCase(); return zq_z().coupons.filter(function(c){ return c.code===code; })[0] || null; }
function zq_cpnState(c, acc){
  var now = Date.now(), uses = (c.uses||[]).length;
  if(!c.on) return 'off';
  if(c.start && now < new Date(c.start+'T00:00').getTime()) return 'soon';
  if(c.end && now > new Date(c.end+'T23:59:59').getTime()) return 'ended';
  if(c.limit && uses >= c.limit) return 'used';
  if(acc && c.per && (c.uses||[]).filter(function(u){ return zq_digits(u.phone)===zq_digits(acc.phone); }).length >= c.per) return 'peruser';
  return 'live';
}
/* the bag's "Have a code?" box reads the store coupons after the customer's own offers */
(function(){
  if(typeof bag_findCode!=='function' || bag_findCode._zq) return; var of = bag_findCode;
  var nf = function(code){ var r = of.apply(this, arguments); if(r) return r; try{ var c = zq_cpnFind(code); if(!c || zq_cpnState(c, typeof currentAccount==='function' ? currentAccount() : null)!=='live') return null;
    return {id:'cpn-'+c.code, code:c.code, title:c.title || (c.type==='pct' ? c.value+'% off' : fmt(c.value)+' off'), pct:c.type==='pct' ? c.value : 0, amount:c.type==='fixed' ? c.value : 0, min:c.min||0, ends:c.end||'', store:true}; }catch(e){ return null; } };
  nf._zq = true; window.bag_findCode = nf;
})();
PAGES['zq-cpn'] = { layout:'admin', title:'Coupons', render:function(){
  var z = zq_z();
  var head = zy_head('Admin · Marketing '+zs_pr('271 · 272'), 'Coupons & offers', 'কুপন ও অফার',
    'Discount codes the shop gives out. Every code, amount, minimum, date and limit is set here — nothing is written in the code. The bag\'s “Have a code?” box reads this list; set prices are never combined with a code (the better one wins).',
    'দোকানের দেওয়া ছাড়ের কোড। কোড, টাকা, কমপক্ষে কত, তারিখ আর সীমা সব এখান থেকে — কোডে কিছু লেখা নেই। ব্যাগের “Have a code?” এই তালিকা পড়ে; সেট দামের সাথে কোড একসাথে খাটে না (যেটায় বেশি বাঁচে সেটা)।', zy_actorBar());
  if(!zy_can('coupons','view')) return '<div class="zs-page zy-page">'+head+zy_noAccess('coupons')+'</div>';
  var ST_L = {live:['Live','চালু','ok'], off:['Off','বন্ধ',''], soon:['Starts later','পরে শুরু','info'], ended:['Ended','শেষ',''], used:['Limit reached','সীমা শেষ','warn']};
  return '<div class="zs-page zy-page">'+head+'<section class="zs-card"><div class="row between wrap" style="gap:8px"><h2>'+zy_e('Codes','কোড')+'</h2><button type="button" class="btn btn-sm btn-primary" data-act="zq-cpn-new" data-testid="zq-cpn-new">'+ico('plus',14)+zy_e('Add coupon','কুপন যোগ করুন')+'</button></div>'+
    (z.coupons.length ? '<div class="zo-tw mt8"><table class="zo-tbl" data-testid="zq-cpn"><thead><tr><th>'+zy_e('Code','কোড')+'</th><th>'+zy_e('Discount','ছাড়')+'</th><th>'+zy_e('Minimum order','কমপক্ষে অর্ডার')+'</th><th>'+zy_e('Dates','তারিখ')+'</th><th>'+zy_e('Used','ব্যবহার')+'</th><th>'+zy_e('Status','অবস্থা')+'</th><th></th></tr></thead><tbody>'+
      z.coupons.map(function(c){ var s = ST_L[zq_cpnState(c)] || ST_L.off, saved = (c.uses||[]).reduce(function(a,u){ return a + (u.amt||0); }, 0);
        return '<tr><td><b class="mono">'+esc(c.code)+'</b>'+(c.title?'<div class="zs-mini">'+esc(c.title)+'</div>':'')+'</td><td>'+esc(c.type==='pct' ? c.value+'%' : fmt(c.value))+'</td><td>'+(c.min?zy_m(c.min):'—')+'</td><td class="zs-mini">'+esc((c.start||'…')+' → '+(c.end||'…'))+'</td><td>'+(c.uses||[]).length+(c.limit?' / '+c.limit:'')+(c.per?'<div class="zs-mini">'+esc(zy(c.per+' per customer',' কাস্টমার প্রতি '+c.per))+'</div>':'')+(saved?'<div class="zs-mini">'+esc(zy('given ','দেওয়া ')+fmt(saved))+'</div>':'')+'</td><td><span class="zo-pill '+s[2]+'">'+esc(zy(s[0],s[1]))+'</span></td><td><button type="button" class="btn btn-sm btn-ghost" data-act="zq-cpn-edit" data-c="'+esc(c.code)+'">'+zy_e('Edit','বদলান')+'</button></td></tr>'; }).join('')+'</tbody></table></div>'
      : '<div class="zs-mini mt8">'+zy_e('No coupons yet.','এখনো কোনো কুপন নেই।')+'</div>')+
    '<div class="zs-mini mt8">'+zy_e('Free delivery, buy-X-get-Y and set-price unlock codes come with the full coupon engine (PR 271). A code is never deleted — switch it off.','ফ্রি ডেলিভারি, X কিনলে Y আর সেট-দাম খোলার কোড পুরো কুপন ইঞ্জিনে আসবে (PR 271)। কোড কখনো মোছা হয় না — বন্ধ করুন।')+'</div></section></div>';
}};
function zq_cpnForm(c){
  c = c || {code:'', title:'', type:'pct', value:'', min:'', start:zy_dk(Date.now()), end:'', limit:'', per:1, on:true};
  return '<form data-submit="zq-cpn" data-old="'+esc(c.code||'')+'" class="zy-form"><div class="zy-g2"><div><label class="label" for="zq-c-c">'+zy_e('Code (A–Z, 0–9)','কোড (A–Z, 0–9)')+'</label><input id="zq-c-c" name="code" class="input mono" maxlength="20" value="'+esc(c.code)+'" required style="text-transform:uppercase"></div>'+
    '<div><label class="label" for="zq-c-t">'+zy_e('Name the customer sees','কাস্টমার যে নাম দেখবেন')+'</label><input id="zq-c-t" name="title" class="input" maxlength="60" value="'+esc(c.title)+'"></div>'+
    '<div><label class="label" for="zq-c-y">'+zy_e('Type','ধরন')+'</label><select id="zq-c-y" name="type" class="input"><option value="pct"'+(c.type==='pct'?' selected':'')+'>'+zy_e('Percent off','শতাংশ ছাড়')+'</option><option value="fixed"'+(c.type==='fixed'?' selected':'')+'>'+zy_e('Taka off','টাকা ছাড়')+'</option></select></div>'+
    '<div><label class="label" for="zq-c-v">'+zy_e('Amount (% or ৳)','পরিমাণ (% বা ৳)')+'</label><input id="zq-c-v" name="value" class="input" type="number" min="1" max="100000" step="1" value="'+esc(c.value)+'" required></div>'+
    '<div><label class="label" for="zq-c-m">'+zy_e('Minimum order ৳ (optional)','কমপক্ষে অর্ডার ৳ (ইচ্ছা হলে)')+'</label><input id="zq-c-m" name="min" class="input" type="number" min="0" max="1000000" step="1" value="'+esc(c.min)+'"></div>'+
    '<div><label class="label" for="zq-c-l">'+zy_e('Total uses (empty = no limit)','মোট কতবার (খালি = সীমা নেই)')+'</label><input id="zq-c-l" name="limit" class="input" type="number" min="0" max="1000000" step="1" value="'+esc(c.limit)+'"></div>'+
    '<div><label class="label" for="zq-c-p">'+zy_e('Per customer','কাস্টমার প্রতি')+'</label><input id="zq-c-p" name="per" class="input" type="number" min="0" max="100" step="1" value="'+esc(c.per)+'"></div>'+
    '<div><label class="label" for="zq-c-o">'+zy_e('Status','অবস্থা')+'</label><select id="zq-c-o" name="on" class="input"><option value="1"'+(c.on?' selected':'')+'>'+zy_e('On','চালু')+'</option><option value="0"'+(!c.on?' selected':'')+'>'+zy_e('Off','বন্ধ')+'</option></select></div>'+
    '<div><label class="label" for="zq-c-s">'+zy_e('Starts','শুরু')+'</label><input id="zq-c-s" name="start" class="input" type="date" value="'+esc(c.start)+'"></div>'+
    '<div><label class="label" for="zq-c-e">'+zy_e('Ends (optional)','শেষ (ইচ্ছা হলে)')+'</label><input id="zq-c-e" name="end" class="input" type="date" value="'+esc(c.end)+'"></div></div>'+
    '<div class="zs-actions mt16"><button class="btn btn-primary" data-testid="zq-cpn-next">'+zy_e('Next','পরের ধাপ')+'</button></div></form>';
}
ACT['zq-cpn-new'] = function(){ if(!zy_guard('coupons','add a coupon')) return; openModal(zq_cpnForm(), {title:zy('Add coupon','কুপন যোগ করুন'), wide:true}); };
ACT['zq-cpn-edit'] = function(el){ if(!zy_guard('coupons','edit a coupon')) return; var c = zq_cpnFind(el.getAttribute('data-c')); if(c) openModal(zq_cpnForm(c), {title:zy('Edit coupon','কুপন বদলান'), wide:true}); };
SUBMIT['zq-cpn'] = function(f){
  var z = zq_z(), old = f.getAttribute('data-old'), g = function(n){ return f.querySelector('[name='+n+']').value; };
  var c = {code:String(g('code')).trim().toUpperCase(), title:String(g('title')).trim(), type:g('type'), value:zy_num(g('value')), min:g('min')==='' ? 0 : zy_num(g('min')), limit:g('limit')==='' ? 0 : zy_num(g('limit')), per:g('per')==='' ? 0 : zy_num(g('per')), start:g('start'), end:g('end'), on:g('on')==='1'};
  if(!/^[A-Z0-9]{3,20}$/.test(c.code)){ toast(zy('Code: 3–20 letters or numbers, no spaces','কোড: ৩–২০টা অক্ষর বা সংখ্যা, ফাঁকা নয়')); return; }
  if(c.code!==old && zq_cpnFind(c.code)){ toast(zy('This code already exists','এই কোড আগেই আছে')); return; }
  if(c.type==='pct' ? !(c.value>=1 && c.value<=90) : !(c.value>=1 && c.value<=100000)){ toast(c.type==='pct' ? zy('Percent must be 1 to 90','শতাংশ ১ থেকে ৯০') : zy('Taka off must be ৳1 to ৳1,00,000','৳১ থেকে ৳১,০০,০০০')); return; }   /* B7.2 rule 2 */
  if(!(c.min>=0) || !(c.limit>=0) || !(c.per>=0)){ toast(zy('Numbers cannot be negative','সংখ্যা মাইনাস হতে পারে না')); return; }
  if(c.end && c.start && c.end < c.start){ toast(zy('The end date is before the start','শেষের তারিখ শুরুর আগে')); return; }
  var form = f.outerHTML, prev = old ? zq_cpnFind(old) : null;
  zy_ask({title:prev ? zy('Save coupon '+c.code+'?','কুপন '+c.code+' সেভ করবেন?') : zy('Add coupon '+c.code+'?','কুপন '+c.code+' যোগ করবেন?'), back:function(){ openModal(form, {title:zy('Add coupon','কুপন যোগ করুন'), wide:true}); },
    html:'<div class="zo-kv"><span>'+zy_e('Code','কোড')+'</span><span class="mono">'+esc(c.code)+'</span><span>'+zy_e('Discount','ছাড়')+'</span><span>'+esc(c.type==='pct'?c.value+'%':fmt(c.value))+'</span><span>'+zy_e('Minimum','কমপক্ষে')+'</span><span>'+(c.min?zy_m(c.min):'—')+'</span><span>'+zy_e('Status','অবস্থা')+'</span><span>'+(c.on?zy_e('On','চালু'):zy_e('Off','বন্ধ'))+'</span></div>',
    fn:function(){ if(prev){ var keep = prev.uses||[]; Object.keys(c).forEach(function(k){ prev[k] = c[k]; }); prev.uses = keep; zy_log('coupons', 'Edited coupon '+c.code+' ('+(c.type==='pct'?c.value+'%':fmt(c.value))+', '+(c.on?'on':'off')+')'); }
      else { c.uses = []; c.at = Date.now(); c.by = zy_actor().en; z.coupons.push(c); zy_log('coupons', 'Added coupon '+c.code+' ('+(c.type==='pct'?c.value+'%':fmt(c.value))+(c.min?' over '+fmt(c.min):'')+')'); }
      toast(zy('Coupon saved — the bag accepts it now','কুপন সেভ হয়েছে — ব্যাগে এখন কাজ করবে')); }});
};

/* =====================================================================
   5 · CUSTOMER SIDE — the order page and the My orders card
   ===================================================================== */
function zq_custCard(o){
  var z = zq_z(), rets = z.rets.filter(function(r){ return r.orderId===o.id; }), c = zq_sup().convs.filter(function(x){ return x.orderId===o.id && x.ch==='web'; })[0];
  var msgs = c ? c.msgs.filter(function(m){ return m.from!=='note'; }) : [];
  var RS = {requested:['Waiting for our reply','আমাদের উত্তরের অপেক্ষায়'], declined:['Not accepted — see our reply below','গ্রহণ হয়নি — নিচে উত্তর দেখুন'], converted:['Changed to an exchange','এক্সচেঞ্জ করা হয়েছে']};
  return '<section class="card p20 zq-help" id="zq-help" aria-labelledby="zq-help-h" data-testid="zq-help"><h2 class="h3" id="zq-help-h">Returns & help</h2>'+
    '<p class="small text2" style="margin:4px 0 12px">'+esc(ruleText('no-return','short'))+'. For a wrong size or a fault, “Exchange size” on the item is the fastest way.</p>'+
    (rets.length ? '<div class="stack s8 mb12">'+rets.map(function(r){ return '<div class="soft p12 small"><b>Return request '+esc(r.id)+'</b> · '+esc((RS[r.status]||[r.status])[0])+'</div>'; }).join('')+'</div>' : '')+
    (msgs.length ? '<div class="zq-cthread" aria-label="Your messages">'+msgs.map(function(m){ return '<div class="zq-cm '+(m.from==='cust'?'me':'us')+'"><div class="zq-cmb">'+esc(m.text)+'</div><div class="xs muted">'+esc((m.from==='cust' ? 'You' : 'EXTAS')+' · '+dateTimeStr(m.at))+'</div></div>'; }).join('')+'</div>' : '')+
    '<div class="row wrap" style="gap:8px">'+(o.status==='delivered' ? '<button type="button" class="btn btn-secondary" data-act="zq-c-ret" data-id="'+esc(o.id)+'" data-testid="zq-c-ret">'+ico('back',16)+'Request a return</button>' : '')+
    '<button type="button" class="btn btn-primary" data-act="zq-c-msg" data-id="'+esc(o.id)+'" data-testid="zq-c-msg">'+ico('chat',16)+(msgs.length ? 'Write to us' : 'Message us here')+'</button></div></section>';
}
(function(){
  var pg = PAGES.order; if(!pg || pg._zq) return; var or = pg.render, oa = pg.after;
  pg.render = function(params){ var h = or.apply(this, arguments); try{ var o = ST.orders[params && params[0]], acc = currentAccount();
    if(o && acc && typeof acc_owns==='function' && acc_owns(acc, o)){ var card = zq_custCard(o); if(h.indexOf('<section class="ord-demo"')>=0) h = h.replace('<section class="ord-demo"', function(){ return card+'<section class="ord-demo"'; }); else h = h.replace('</div><aside', function(){ return card+'</div><aside'; }); } }catch(e){ console.error(e); } return h; };
  pg.after = function(params, q){ if(oa) try{ oa.apply(this, arguments); }catch(e){} if(q && q.go==='help'){ var el = document.getElementById('zq-help'); if(el) setTimeout(function(){ el.scrollIntoView({block:'start'}); }, 30); } };
  pg._zq = true;
})();
(function(){
  if(typeof acc_orderCard!=='function' || acc_orderCard._zq) return; var oc = acc_orderCard;
  var nc = function(o){ var h = oc.apply(this, arguments); try{
    var win = o.status==='delivered' && exchangeHoursLeft(o)>0;
    var row = '<div class="zq-ohelp" data-testid="zq-ohelp-'+esc(o.id)+'">'+(win ? '<a href="#/order/'+esc(o.id)+'">'+ico('swap',14)+'Exchange</a>' : '')+(o.status==='delivered' ? '<a href="#/order/'+esc(o.id)+'?go=help">'+ico('back',14)+'Return</a>' : '')+'<a href="#/order/'+esc(o.id)+'?go=help">'+ico('chat',14)+'Help</a></div>';
    h = h.replace(/<\/article>$/, function(){ return row+'</article>'; }); }catch(e){} return h; };
  nc._zq = true; window.acc_orderCard = nc;
})();
function zq_cRetForm(o){
  var u = UI.zqCr || {};
  return '<div class="zs-note mb12">'+ico('info',16)+'<span>'+esc(ruleText('no-return','short'))+'. Your request goes to our team; we reply in your messages on this page. For size or a fault we can set up an exchange.</span></div>'+
    '<label class="label" for="zq-cr-l">Which item?</label><select id="zq-cr-l" class="input" data-change="zq-cr-l">'+o.lines.map(function(l, i){ var p = P(l.product); return '<option value="'+i+'"'+(+u.line===i?' selected':'')+'>'+esc((p?p.name:l.product)+' · '+COL(l.color).name+' · '+l.size)+'</option>'; }).join('')+'</select>'+
    '<div class="label mt12">Why?</div><div class="row wrap" style="gap:8px">'+Object.keys(ZQ_RETR).map(function(k){ return '<button type="button" class="chip'+(u.reason===k?' on':'')+'" data-act="zq-cr-r" data-v="'+k+'" aria-pressed="'+(u.reason===k)+'" style="min-height:44px">'+esc(ZQ_RETR[k][0])+'</button>'; }).join('')+'</div>'+
    '<label class="label mt12" for="zq-cr-n">Anything else? (optional)</label><textarea id="zq-cr-n" class="input" rows="2" maxlength="300" data-input="zq-cr-n">'+esc(u.note||'')+'</textarea>'+
    '<button type="button" class="btn btn-primary btn-block mt16" data-act="zq-cr-go" data-testid="zq-cr-go"'+(u.reason?'':' disabled')+'>Send the request</button>';
}
ACT['zq-c-ret'] = function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; UI.zqCr = {id:o.id, line:0, reason:'', note:''}; openModal(zq_cRetForm(o), {title:'Return request · #'+o.id, rebuild:function(){ return zq_cRetForm(o); }}); };
CHANGE['zq-cr-l'] = function(el){ if(UI.zqCr) UI.zqCr.line = +el.value; };
ACT['zq-cr-r'] = function(el){ if(UI.zqCr){ UI.zqCr.reason = el.getAttribute('data-v'); refreshModal(); } };
INPUT['zq-cr-n'] = function(el){ if(UI.zqCr) UI.zqCr.note = String(el.value).trim(); };
ACT['zq-cr-go'] = function(){ var u = UI.zqCr, o = u && ST.orders[u.id]; if(!o || !u.reason) return; var z = zq_z();
  var r = {id:'RT-'+(z.seq.ret++), orderId:o.id, lineIdx:+u.line||0, reason:u.reason, note:u.note||'', at:Date.now(), status:'requested'}; z.rets.push(r);
  zq_custSay(o, 'Return request '+r.id+': '+ZQ_RETR[r.reason][0]+(r.note?' — '+r.note:''));
  UI.zqCr = null; saveState(); closeModal(); rerender(); toast('Request sent — we will reply here'); };
function zq_cMsgForm(o){ return '<label class="label" for="zq-cm">Your message about order #'+esc(o.id)+'</label><textarea id="zq-cm" class="input" rows="4" maxlength="1000" data-input="zq-cm">'+esc(UI.zqCm||'')+'</textarea><div class="xs muted mt8">We reply here and on WhatsApp, 10 am – 10 pm.</div><button type="button" class="btn btn-primary btn-block mt16" data-act="zq-cm-go" data-id="'+esc(o.id)+'" data-testid="zq-cm-go">Send</button>'; }
ACT['zq-c-msg'] = function(el){ var o = ST.orders[el.getAttribute('data-id')]; if(!o) return; UI.zqCm = ''; openModal(zq_cMsgForm(o), {title:'Message us'}); setTimeout(function(){ var t = document.getElementById('zq-cm'); if(t) t.focus(); }, 30); };
INPUT['zq-cm'] = function(el){ UI.zqCm = el.value; };
ACT['zq-cm-go'] = function(el){ var o = ST.orders[el.getAttribute('data-id')], t = String(UI.zqCm||'').trim(); if(!o) return; if(!t){ toast('Please write your message'); return; } zq_custSay(o, t); UI.zqCm = ''; saveState(); closeModal(); rerender(); toast('Sent — we will reply here'); };
