/* =====================================================================
   97z-adm2-rd3-orders.js — Orders designs
   A = V12.3 (97r list + call queue, unchanged) · B = mock-ups O1–O3 (clean
   list with one status + progress line, 4 views, filters in a drawer; the
   one-glance confirm screen with the risky-order advance variant) · C =
   command list (flow strip, dense table, live feed) and a decision-sheet
   confirm screen. Commands are the shared A2C ones; nothing is duplicated.
   ===================================================================== */
/* ---------- shared order facts ---------- */
function a3OStatus(o){
  var a = a2O(o), s = a.ost, f = function(en, bn, tone, step, last){ return {en:en, bn:bn, tone:tone, step:step, last:last}; };
  if(a.cancelPending) return f('Cancel waiting for courier', 'কুরিয়ারের বাতিল-নিশ্চয়তা বাকি', 'bad', 3, 'b');
  if(s === 'CANCELLED') return f('Cancelled', 'ক্যান্সেল', 'mute', 0);
  if(s === 'PLACED') return a.cancelReq ? f('Customer wants to cancel', 'কাস্টমার বাতিল চায়', 'bad', 1, 'b') : a.risk && a.risk.review && !a.risk.decided ? f('Check risk first', 'আগে ঝুঁকি দেখুন', 'warn', 1, 'w') : f('To confirm', 'কনফার্ম বাকি', 'warn', 1, 'w');
  if(s === 'AWAITING_ADVANCE') return f('Waiting for advance', 'অগ্রিমের অপেক্ষায়', 'warn', 1, 'w');
  if(s === 'ON_HOLD') return f('On hold', 'হোল্ডে', 'mute', 1, 'w');
  if(s === 'CONFIRMED' || s === 'PROCESSING') return f('To pack', 'প্যাক করতে হবে', 'g', 1);
  if(s === 'PACKED') return a2Booked(o) ? f('Waiting for pickup', 'পিকআপের অপেক্ষায়', 'g', 3) : f('Courier to book', 'কুরিয়ার বুক বাকি', 'g', 2);
  if(s === 'HANDED_OVER' || s === 'IN_TRANSIT'){ if(a.ship === 'ATTEMPT_FAILED' || a.ship === 'ADDRESS_PROBLEM') return f('Delivery problem', 'ডেলিভারিতে সমস্যা', 'bad', 3, 'b'); if(a.ship === 'RETURNING') return f('Coming back', 'ফেরত আসছে', 'bad', 4, 'b'); return f(a.ship === 'OUT_FOR_DELIVERY' ? 'Out for delivery' : 'With courier', a.ship === 'OUT_FOR_DELIVERY' ? 'ডেলিভারিতে বের হয়েছে' : 'কুরিয়ারে আছে', 'info', 3); }
  if(s === 'DELIVERED' || s === 'PARTIALLY_DELIVERED') return f(s === 'DELIVERED' ? 'Delivered' : 'Partly delivered', s === 'DELIVERED' ? 'ডেলিভারড' : 'আংশিক ডেলিভারড', 'ok', 4, 'ok');
  if(s === 'RETURNED') return f(a.ship === 'RETURNED' ? 'Returned' : 'Coming back', a.ship === 'RETURNED' ? 'ফেরত এসেছে' : 'ফেরত আসছে', 'bad', 4, 'b');
  return f(A2_OST[s] ? A2_OST[s][0] : s, A2_OST[s] ? A2_OST[s][1] : s, 'mute', 0);
}
function a3Prog(st){ var h = ''; for(var i = 1; i <= 4; i++){ var c = i < st.step ? (st.last === 'ok' ? 'ok' : 'f') : i === st.step ? (st.last || 'f') : ''; if(st.tone === 'mute' && st.step === 0) c = ''; h += '<i class="' + c + '"></i>'; } return '<span class="a3-prog" aria-hidden="true">' + h + '</span>'; }
function a3StatusCell(o){ var st = a3OStatus(o), r = a2RetState(o); return '<div class="a3-stc"><span class="a3-sdot ' + st.tone + '">' + Le(st.en, st.bn) + '</span>' + a3Prog(st) + (r ? '<span class="a3-xs">' + Le(A2_RET[r][0], A2_RET[r][1]) + '</span>' : '') + '</div>'; }
function a3PayLine(o){ var a = a2O(o), ps = a2PayState(o);
  if(a.ost === 'AWAITING_ADVANCE' && a.adv) return L('COD · ' + a2tk(a.adv.need) + ' advance asked', 'COD · ' + a2tk(a.adv.need) + ' অগ্রিম চাওয়া');
  if(o.payment === 'cod') return ps === 'COD_SETTLED' ? L('COD · money in', 'COD · জমা হয়েছে') : ps === 'COD_COLLECTED' ? L('COD · courier has it', 'COD · কুরিয়ারের কাছে') : ps === 'PARTLY_PAID' ? L('COD · part paid', 'COD · আংশিক দেওয়া') : 'COD';
  return a2PayM(o.payment) + (ps === 'PAID' ? L(' · paid', ' · পেইড') : ps === 'OWED_BACK' ? L(' · refund due', ' · রিফান্ড বাকি') : ''); }
function a3Src(o){ var s = String(o.source || 'website'); if(s.indexOf('landing:') === 0) return L('an ad page', 'বিজ্ঞাপন পেজ'); var m = {website:['website', 'ওয়েবসাইট'], phone:['phone', 'ফোন'], chat:['chat', 'চ্যাট'], 'walk-in':['the shop', 'শোরুম'], bulk:['bulk enquiry', 'বাল্ক']}[s]; return m ? L(m[0], m[1]) : s; }
function a3Area(o){ var p = String(o.address || '').split(',').map(function(x){ return x.trim(); }).filter(Boolean), t = p.length > 1 ? p.slice(-2) : p; if(t.join(', ').length > 24) t = t.slice(-1); var s = t.join(', ') || a2BandName(o.zone); return s.length > 26 ? s.slice(0, 25) + '…' : s; }
function a3Thumbs(o){ var ls = (o.lines || []).slice(0, 3); return '<span class="a3-stk">' + ls.map(function(l){ return a3Ph(l.product, l.color, {cls:'xs'}); }).join('') + '</span>'; }
function a3ItemsTxt(o){ var u = a2Units(o), p = P(o.lines[0].product); return u + L(u === 1 ? ' pc · ' : ' pcs · ', ' পিস · ') + esc(p ? p.name.replace(/^(Essential|Classic|Heavyweight|Stretch) /, '') : '') + (o.lines.length > 1 ? ' +' + (o.lines.length - 1) : ''); }
function a3Flags(o){ var a = a2O(o), f = []; if(a.voice) f.push(['mic', L('Voice address — please call', 'ভয়েস ঠিকানা — কল করুন')]); if(a.gift) f.push(['gift', L('Gift · different address', 'উপহার · অন্য ঠিকানা')]); if(a.replacesId || a.replacedById) f.push(['refresh', a.replacesId ? L('Replaces ', 'বদলে ') + a.replacesId : L('Replaced by ', 'বদলি ') + a.replacedById]); if((o.flags || []).some(function(x){ return /2 sizes/.test(x); })) f.push(['layers', L('Two sizes of the same item', 'একই পণ্য 2 সাইজে')]); if((o.flags || []).indexOf('Follow up') >= 0) f.push(['tag', L('Tagged: Follow up', 'ট্যাগ: Follow up')]);
  return f.map(function(x){ return '<span class="a3-flag" data-tip="' + esc(x[1]) + '" aria-label="' + esc(x[1]) + '">' + a2i(x[0], 14) + '</span>'; }).join(''); }
function a3CourCell(o){ var a = a2O(o); if(a.cour && a.ship !== 'NONE'){ var sub = a.ship === 'DELIVERED' ? L('delivered ', 'ডেলিভারি ') + (o.deliveredAt ? a2hm(o.deliveredAt) : '') : a.ship === 'RETURNING' || a.ship === 'ATTEMPT_FAILED' ? (a.exNote || L('not taken at the door', 'দরজায় নেয়নি')) : a.ship === 'PENDING_PICKUP' ? L('pickup due', 'পিকআপ বাকি') : L('on the way', 'পথে আছে'); return '<div class="a3-cell"><b>' + esc(a2CourName(a.cour)) + '</b><span class="' + (a.ship === 'RETURNING' || a.ship === 'ATTEMPT_FAILED' ? 'bad' : '') + '">' + esc(sub) + '</span></div>'; }
  if(a.replacedById) return '<div class="a3-cell"><b class="a3-faint">—</b><span>' + Le('replaced by new order ', 'বদলে নতুন অর্ডার ') + esc(a.replacedById) + '</span></div>';
  if(['CONFIRMED', 'PROCESSING', 'PACKED'].indexOf(a.ost) >= 0){ var s = a2Suggest(o); return '<div class="a3-cell"><b class="a3-faint">—</b><span>' + Le('suggested: ', 'পরামর্শ: ') + esc(s ? s.name : '—') + '</span></div>'; }
  return '<span class="a3-faint">—</span>'; }
function a3RowActs(o, compact){ var a = a2O(o); if(a.ost !== 'PLACED' && a.ost !== 'AWAITING_ADVANCE') return '';
  return '<span class="a3-ra"><a class="a3-btn ic sm" href="tel:' + esc(o.phone) + '" aria-label="' + Le('Call ', 'কল ') + esc(o.name) + '" title="' + Le('Call', 'কল') + '">' + a2i('phone', 15) + '</a><a class="a3-btn ic sm wa" href="' + a2WaHref(o) + '" target="_blank" rel="noopener" aria-label="WhatsApp ' + esc(o.name) + '" title="WhatsApp">' + a2i('wa', 15) + '</a>' +
    (a2Can('orders.confirm') ? (compact ? '<a class="a3-btn ic sm dk" href="#/admin/orders/confirm?id=' + o.id + '" aria-label="' + Le('Confirm ', 'কনফার্ম ') + esc(o.id) + '" title="' + Le('Confirm (C)', 'কনফার্ম (C)') + '">' + a2i('check', 15, 2.2) + '</a>' : '<a class="a3-btn sm dk" href="#/admin/orders/confirm?id=' + o.id + '" title="' + Le('Open the confirm screen (C)', 'কনফার্ম স্ক্রিন খুলুন (C)') + '"><span>' + Le('Confirm', 'কনফার্ম') + '</span><kbd>C</kbd></a>') : '') + '</span>'; }
/* ---------- filters (drawer, shared by both list designs) ---------- */
var A3_OF = [
  {id:'risk', en:'Risk', bn:'ঝুঁকি', opts:[['low', 'Low', 'ঝুঁকি কম'], ['medium', 'Be careful', 'সাবধান'], ['high', 'High', 'ঝুঁকি বেশি']], fn:function(o, v){ return ((a2O(o).risk || {}).band || 'low') === v; }},
  {id:'pay', en:'Payment', bn:'পেমেন্ট', opts:[['cod', 'COD', 'COD'], ['prepaid', 'Paid first', 'আগে পেইড'], ['part', 'Part paid', 'আংশিক পেইড'], ['adv', 'Advance due', 'অগ্রিম বাকি']], fn:function(o, v){ var ps = a2PayState(o); return v === 'cod' ? o.payment === 'cod' : v === 'prepaid' ? o.payment !== 'cod' : v === 'part' ? ps === 'PARTLY_PAID' : a2O(o).ost === 'AWAITING_ADVANCE'; }},
  {id:'cour', en:'Courier', bn:'কুরিয়ার', opts:function(){ return a2Couriers().map(function(c){ return [c.id, c.name, c.name]; }).concat([['none', 'Not booked yet', 'এখনো বুক হয়নি']]); }, fn:function(o, v){ return v === 'none' ? !a2Booked(o) : a2O(o).cour === v; }},
  {id:'src', en:'Came from', bn:'কোথা থেকে এসেছে', opts:[['website', 'Website', 'ওয়েবসাইট'], ['phone', 'Phone', 'ফোন'], ['chat', 'Chat', 'চ্যাট'], ['walk-in', 'Shop', 'শোরুম'], ['landing', 'Ad page', 'বিজ্ঞাপন পেজ']], fn:function(o, v){ var s = o.source || 'website'; return v === 'landing' ? s.indexOf('landing:') === 0 : s === v; }},
  {id:'sp', en:'Special', bn:'বিশেষ', opts:[['gift', 'Gift', 'উপহার'], ['voice', 'Voice address', 'ভয়েস ঠিকানা'], ['replace', 'Replacement order', 'রিপ্লেসমেন্ট অর্ডার'], ['two', 'Two sizes', '2 সাইজ নিয়েছে'], ['cancelreq', 'Wants to cancel', 'বাতিল চায়'], ['cancelpend', 'Cancel waiting for courier', 'কুরিয়ারের বাতিল বাকি'], ['failed', 'Delivery failed', 'ডেলিভারি ব্যর্থ'], ['partial', 'Partly delivered', 'আংশিক ডেলিভারি'], ['codunpaid', 'COD not in yet', 'COD আসেনি'], ['follow', 'Follow up', 'ফলো আপ']],
    fn:function(o, v){ var a = a2O(o); return {gift:!!a.gift, voice:!!a.voice, replace:!!(a.replacesId || a.replacedById), two:(o.flags || []).some(function(x){ return /2 sizes/.test(x); }), cancelreq:!!a.cancelReq && a.ost !== 'CANCELLED', cancelpend:!!a.cancelPending, failed:a.ost === 'RETURNED' || a.ship === 'ATTEMPT_FAILED' || a.ship === 'ADDRESS_PROBLEM', partial:a.ost === 'PARTIALLY_DELIVERED', codunpaid:['COD_TO_COLLECT', 'COD_COLLECTED'].indexOf(a2PayState(o)) >= 0, follow:(o.flags || []).indexOf('Follow up') >= 0}[v]; }}];
function a3OF(){ return ui('a3of', {f:{}, area:'all', place:'', d:'all', sort:'new'}); }
function a3OFCount(){ var u = a3OF(), n = 0; Object.keys(u.f).forEach(function(k){ n += (u.f[k] || []).length; }); if(u.area !== 'all') n++; if(u.place) n++; return n; }
function a3OFApply(rows, skipTime){ var u = a3OF(), now = Date.now(), d0 = a2day0(now);
  rows = rows.filter(function(o){ return A3_OF.every(function(g){ var v = u.f[g.id]; return !v || !v.length || v.some(function(x){ return g.fn(o, x); }); }); });
  if(u.area !== 'all') rows = rows.filter(function(o){ var b = a2Band(o.zone); return u.area === 'in' ? b === 'in' : b !== 'in'; });
  if(u.place){ var pl = u.place.toLowerCase(); rows = rows.filter(function(o){ return String(o.address || '').toLowerCase().indexOf(pl) >= 0; }); }
  if(!skipTime && u.d !== 'all') rows = rows.filter(function(o){ return u.d === 'today' ? o.createdAt >= d0 : u.d === 'yday' ? o.createdAt >= d0 - A2.D && o.createdAt < d0 : o.createdAt >= now - (+u.d) * A2.D; });
  if(u.sort === 'old') rows = rows.slice().reverse();
  return rows; }
A2.drawers.a3of = function(){
  var u = a3OF(), base = a2Orders(), n = a3OFApply(base).length;
  var chip = function(g, v, en, bn){ var on = (u.f[g] || []).indexOf(v) >= 0; return '<button type="button" class="a3-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="a3-of" data-g="' + g + '" data-v="' + esc(v) + '">' + (on ? a2i('check', 13, 2.2) : '') + Le(en, bn) + '</button>'; };
  var body = A3_OF.map(function(g){ var opts = typeof g.opts === 'function' ? g.opts() : g.opts; return '<fieldset class="a3-fg"><legend>' + Le(g.en, g.bn) + '</legend><div class="a3-chips">' + opts.map(function(o){ return chip(g.id, o[0], o[1], o[2]); }).join('') + '</div></fieldset>'; }).join('') +
    '<fieldset class="a3-fg"><legend>' + Le('Area', 'এলাকা') + '</legend>' + a3Seg('a3-ofa', u.area, [['all', 'All', 'সব'], ['out', 'Outside Dhaka', 'ঢাকার বাইরে'], ['in', 'Inside Dhaka', 'ঢাকার ভেতরে']], L('Area', 'এলাকা'), '') + '<label class="a3-inpi" style="margin-top:10px">' + a2i('flag', 15) + '<span class="a2-sr">' + Le('District or thana', 'জেলা বা থানা') + '</span><input id="a3-ofp" class="a2-inp" value="' + esc(u.place) + '" placeholder="' + esc(L('Type a district or thana', 'জেলা বা থানা লিখুন')) + '" data-input="a3-ofp" autocomplete="off"></label></fieldset>' +
    '<fieldset class="a3-fg"><legend>' + Le('Order time', 'অর্ডারের সময়') + '</legend><div class="a3-chips">' + [['today', 'Today', 'আজ'], ['yday', 'Yesterday', 'গতকাল'], ['7', 'Last 7 days', 'শেষ 7 দিন'], ['30', 'Last 30 days', 'শেষ 30 দিন'], ['all', 'Any time', 'যেকোনো সময়']].map(function(x){ var on = u.d === x[0]; return '<button type="button" class="a3-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="a3-ofd" data-v="' + x[0] + '">' + (on ? a2i('check', 13, 2.2) : '') + Le(x[1], x[2]) + '</button>'; }).join('') + '</div></fieldset>';
  return a2Drawer({title:L('More filters', 'আরও ফিল্টার'), sub:Le(a3OFCount() ? a3OFCount() + ' filters on' : 'No filters on', a3OFCount() ? a3OFCount() + 'টা ফিল্টার চালু' : 'কোনো ফিল্টার চালু নেই'), body:body, close:'a2-drw-x', closeData:' data-k="a2d:a3of"',
    foot:'<button type="button" class="a3-btn gh" data-act="a3-ofclr">' + Le('Clear all', 'সব মুছুন') + '</button><span style="flex:1"></span><button type="button" class="a3-btn" data-act="a3-ofsave">' + a2i('plus', 15) + '<span>' + Le('Save view', 'ভিউ সেভ') + '</span></button><button type="button" class="a3-btn pri" data-act="a2-drw-x" data-k="a2d:a3of">' + Le('Show ' + n + ' orders', n + 'টা অর্ডার দেখান') + '</button>'});
};
ACT['a3-of'] = function(el){ var u = a3OF(), g = el.getAttribute('data-g'), v = el.getAttribute('data-v'), a = u.f[g] = u.f[g] || [], i = a.indexOf(v); if(i >= 0) a.splice(i, 1); else a.push(v); rerender(); };
ACT['a3-ofa'] = function(el){ a3OF().area = el.getAttribute('data-v'); rerender(); };
ACT['a3-ofd'] = function(el){ a3OF().d = el.getAttribute('data-v'); rerender(); };
INPUT['a3-ofp'] = function(el){ a3OF().place = el.value; clearTimeout(A3X.ofp); A2.focus = {id:el.id, s:el.selectionStart}; A3X.ofp = setTimeout(rerender, 260); };
ACT['a3-ofclr'] = function(){ var u = a3OF(); u.f = {}; u.area = 'all'; u.place = ''; u.d = 'all'; rerender(); };
ACT['a3-ofsave'] = function(){ var lu = a3LU(), u = a3OF();
  a2Confirm({title:'Save this view', bn:'এই ভিউ সেভ করুন', body:'<label class="a2-lbl" for="a3vn">' + Le('Name', 'নাম') + '</label><input id="a3vn" class="a2-inp" data-f="name" value="' + esc(L('My view', 'আমার ভিউ')) + '">', ok:'Save view', okBn:'সেভ',
    fn:function(r, v){ var id = 'cv' + Date.now(); a2S().views.push({id:id, list:'a3orders', name:v.name || 'My view', q:lu.q || '', f:{}, f3:JSON.parse(JSON.stringify(u)), base:lu.v && !/^cv/.test(lu.v) ? lu.v : 'all'}); lu.v = id; lu._a3 = id; UI['a2d:a3of'] = null; saveState(); rerender(); toast(L('View saved — it is next to the other views', 'ভিউ সেভ হয়েছে — অন্য ভিউগুলোর পাশে আছে')); }}); };
ACT['a3-ofd2'] = function(el){ a3OF().d = el.value || el.getAttribute('data-v'); rerender(); };
CHANGE['a3-ofd2'] = function(el){ a3OF().d = el.value; rerender(); };
ACT['a3-osort'] = function(){ var u = a3OF(); u.sort = u.sort === 'old' ? 'new' : 'old'; rerender(); toast(u.sort === 'old' ? L('Oldest first', 'পুরনোটা আগে') : L('Newest first', 'নতুনটা আগে')); };

/* ---------- the list (one config, two looks) ---------- */
function a3LU(){ return ui('a2l:a3orders', {v:'all', q:'', f:{}, sel:{}, peek:null, n:25}); }
function a3OrderViews(){ var old = a2OrderViews().filter(function(v){ return ['all', 'courier', 'new'].indexOf(v.id) < 0; }).map(function(v){ return Object.assign({}, v, {hide:true}); });
  return [{id:'confirm', en:'To confirm', bn:'কনফার্ম বাকি', fn:function(o){ var s = a2O(o).ost; return s === 'PLACED' || s === 'AWAITING_ADVANCE'; }},
    {id:'pack', en:'Pack & book', bn:'প্যাক ও বুক', fn:function(o){ return ['CONFIRMED', 'PROCESSING', 'ON_HOLD', 'PACKED'].indexOf(a2O(o).ost) >= 0; }},
    {id:'courier', en:'At courier', bn:'কুরিয়ারে', fn:function(o){ return ['HANDED_OVER', 'IN_TRANSIT'].indexOf(a2O(o).ost) >= 0; }},
    {id:'all', en:'All orders', bn:'সব অর্ডার'}].concat(old); }
function a3OrderList(dz, q){
  var lu = a3LU();
  if(q.view){ var mv = q.view === 'new' ? 'confirm' : q.view; if(lu._qv !== q.view){ lu.v = mv; lu._qv = q.view; lu.sel = {}; } }
  var cust = (a2S().views || []).filter(function(v){ return v.list === 'a3orders' && v.id === lu.v; })[0];
  if(cust && lu._a3 !== cust.id){ if(cust.f3) UI.a3of = JSON.parse(JSON.stringify(cust.f3)); lu._a3 = cust.id; }
  var vs = a3OrderViews().filter(function(v){ return (!v.hide || v.id === lu.v) && (dz !== 'C' || ['confirm', 'pack', 'courier'].indexOf(v.id) < 0 || v.id === lu.v); }), rows = a3OFApply(a2Orders());
  var cols = dz === 'C' ? [
      {en:'Order', bn:'অর্ডার', k:'h', r:function(o){ return '<div class="a3-oc"><b>' + esc(o.id) + '</b><span>' + esc(o.name) + ' · ' + esc(a3Area(o)) + '</span></div>'; }},
      {en:'Items', bn:'পণ্য', cls:'a3-tdit', r:function(o){ return '<div class="a3-its">' + a3Thumbs(o) + '<span>' + a3ItemsTxt(o) + '</span></div>'; }},
      {en:'Total', bn:'মোট', cls:'r', r:function(o){ return '<div class="a3-cell r"><b class="a3-num">' + a2tk(o.total) + '</b><span>' + esc(a3PayLine(o)) + '</span></div>'; }},
      {en:'Status', bn:'অবস্থা', k:'w', r:a3StatusCell},
      {en:'Courier', bn:'কুরিয়ার', r:a3CourCell},
      {en:'Age', bn:'সময়', cls:'r', r:function(o){ return '<span class="a3-age">' + a2ago(o.createdAt) + '</span>'; }},
      {en:'', bn:'', k:'x', cls:'a3-tda', r:function(o){ return a3Flags(o) + a3RowActs(o, true); }}] : [
      {en:'Order', bn:'অর্ডার', k:'h', r:function(o){ return '<div class="a3-oc"><b>' + esc(o.id) + '</b><span>' + a2ago(o.createdAt) + L(' ago', ' আগে') + '</span></div>'; }},
      {en:'Customer', bn:'কাস্টমার', r:function(o){ return '<div class="a3-oc"><b class="n">' + esc(o.name) + '</b><span>' + esc(a3Area(o)) + '</span></div>'; }},
      {en:'Items', bn:'পণ্য', cls:'a3-tdit', r:function(o){ return '<div class="a3-its">' + a3Thumbs(o) + '<span>' + a3ItemsTxt(o) + '</span></div>'; }},
      {en:'Total', bn:'মোট', cls:'r', r:function(o){ var a = a2O(o); return '<div class="a3-cell r"><b class="a3-num' + (a.ost === 'CANCELLED' ? ' s' : '') + '">' + a2tk(o.total) + '</b><span>' + esc(a3PayLine(o)) + '</span></div>'; }},
      {en:'Status', bn:'অবস্থা', k:'w', r:a3StatusCell},
      {en:'Courier', bn:'কুরিয়ার', r:a3CourCell},
      {en:'', bn:'', k:'x', cls:'a3-tda', r:function(o){ return a3Flags(o) + a3RowActs(o); }}];
  var nf = a3OFCount(), u3 = a3OF();
  var tools = '<select class="a3-sel" data-change="a3-ofd2" aria-label="' + Le('Order time', 'অর্ডারের সময়') + '">' + [['all', 'Any time', 'যেকোনো সময়'], ['today', 'Today', 'আজ'], ['yday', 'Yesterday', 'গতকাল'], ['7', 'Last 7 days', 'শেষ 7 দিন'], ['30', 'Last 30 days', 'শেষ 30 দিন']].map(function(x){ return '<option value="' + x[0] + '"' + (u3.d === x[0] ? ' selected' : '') + '>' + Le(x[1], x[2]) + '</option>'; }).join('') + '</select>' +
    '<button type="button" class="a3-btn' + (nf ? ' on' : '') + '" data-act="a2-dopen" data-d="a3of">' + a2i('filter', 16) + '<span>' + Le('More filters', 'আরও ফিল্টার') + '</span>' + (nf ? '<em class="a3-cnt">' + nf + '</em>' : '') + '</button>' +
    '<button type="button" class="a3-btn ic" data-act="a3-osort" aria-label="' + (u3.sort === 'old' ? Le('Showing oldest first — show newest first', 'পুরনোটা আগে — নতুনটা আগে দেখান') : Le('Showing newest first — show oldest first', 'নতুনটা আগে — পুরনোটা আগে দেখান')) + '" title="' + (u3.sort === 'old' ? Le('Oldest first', 'পুরনোটা আগে') : Le('Newest first', 'নতুনটা আগে')) + '">' + a2i('sort', 17) + '</button>';
  var list = a2List({id:'a3orders', rows:rows, views:vs, view:'all', saveViews:false, pageSize:dz === 'C' ? 30 : 25,
    search:{en:'Number, phone, name or tracking', bn:'নম্বর, ফোন, নাম বা ট্র্যাকিং', fn:function(o, s){ var d = s.replace(/\D/g, ''); return o.id.toLowerCase().indexOf(s) >= 0 || String(o.name).toLowerCase().indexOf(s) >= 0 || (d.length >= 4 && String(o.phone).indexOf(d) >= 0) || String(a2O(o).cid || '').toLowerCase().indexOf(s) >= 0; }},
    tools:tools, cols:cols, peek:a2OrderPeek, bulk:a3OrderBulk(),
    foot:'<span class="a3-kh a2-hide-ph"><kbd>J</kbd><kbd>K</kbd>' + Le('up / down', 'উপর-নিচ') + '<kbd>Enter</kbd>' + Le('open', 'খুলুন') + '<kbd>C</kbd>' + Le('confirm', 'কনফার্ম') + '<kbd>X</kbd>' + Le('select', 'বাছাই') + '</span>',
    empty:{t:L('No orders match', 'কোনো অর্ডার মেলেনি'), s:L('Try another view, or clear the filters.', 'অন্য ভিউ দেখুন, বা ফিল্টার মুছে দিন।'), action:'<button type="button" class="a3-btn" data-act="a3-ofclr">' + Le('Clear filters', 'ফিল্টার মুছুন') + '</button>', icon:'search'}});
  /* the "+ Save view" chip sits right after the views */
  list = list.replace(/(<div class="a2-views"[^>]*>[\s\S]*?)(<\/div><div class="a2-fbar">)/, '$1<button type="button" class="a2-view a3-vsave" data-act="a3-ofsave">' + a2i('plus', 14) + Le('Save view', 'ভিউ সেভ') + '</button>$2');
  return list;
}
function a3OrderBulk(){ /* the same actions the V12.3 list has (book, print, tag, confirm, hold, export) */
  return [{id:'book', en:'Book courier', bn:'কুরিয়ার বুক করুন', tone:'pri', perm:'delivery.book', skip:function(o){ if(a2Booked(o)) return L('already booked', 'আগেই বুক'); var s = a2ReadyToBook().skipped.filter(function(x){ return x.o.id === o.id; })[0]; return s ? s.why : (a2Open(o) ? null : L('closed', 'শেষ')); }, run:function(rs){ rs.forEach(function(o){ var s = a2Suggest(o); A2C.book(o, a2O(o).courPick || (s && s.id)); }); }},
    {id:'print', en:'Print stickers', bn:'স্টিকার প্রিন্ট', perm:'orders.packing', skip:function(o){ return a2Open(o) ? null : L('closed', 'শেষ'); }, run:function(rs){ rs.forEach(function(o){ a2O(o).printed = (a2O(o).printed || 0) + 1; }); return L('sent to the printer (demo)', 'প্রিন্টারে পাঠানো (ডেমো)'); }},
    {id:'tag', en:'Tag', bn:'ট্যাগ', perm:'orders.read', run:function(rs){ rs.forEach(function(o){ o.flags = o.flags || []; if(o.flags.indexOf('Follow up') < 0) o.flags.push('Follow up'); }); return L('tagged “Follow up”', '“Follow up” ট্যাগ'); }},
    {id:'confirm', en:'Confirm', bn:'কনফার্ম', perm:'orders.confirm', skip:function(o){ var a = a2O(o); return a.ost === 'CANCELLED' ? L('cancelled', 'বাতিল') : a.cancelReq ? L('wants to cancel', 'বাতিল চায়') : a.risk && a.risk.review && !a.risk.decided ? L('risk not checked yet', 'ঝুঁকি দেখা হয়নি') : a.ost === 'AWAITING_ADVANCE' ? L('waiting for advance', 'অগ্রিম বাকি') : a.ost !== 'PLACED' ? L('already past confirm', 'আগেই কনফার্ম') : null; }, run:function(rs){ rs.forEach(function(o){ A2C.confirm(o); }); }},
    {id:'hold', en:'Hold', bn:'হোল্ড', perm:'orders.confirm', reason:true, confirm:function(rs){ return [rs.length + L(' orders go on hold; they keep their stock', 'টা অর্ডার হোল্ডে যাবে; স্টক ধরা থাকবে')]; }, skip:function(o){ return ['PLACED', 'CONFIRMED'].indexOf(a2O(o).ost) < 0 ? L('cannot be held now', 'এখন হোল্ড হয় না') : null; }, run:function(rs, why){ rs.forEach(function(o){ A2C.hold(o, why); }); }},
    {id:'export', en:'Export', bn:'এক্সপোর্ট', perm:'orders.read', run:function(rs){ a3OrdersCsv(rs); return L('CSV downloaded', 'CSV নামানো হয়েছে'); }}]; }
function a3OrdersCsv(rs){ if(typeof zy_download === 'function') zy_download('extas-orders.csv', zy_csv([['Order', 'Name', 'Phone', 'Total', 'Payment', 'Status', 'Courier', 'Tracking']].concat(rs.map(function(o){ var a = a2O(o); return [o.id, o.name, o.phone, o.total, o.payment, a3OStatus(o).en, a.cour ? a2CourName(a.cour) : '', a.cid || '']; })))); }
ACT['a3-oexp'] = function(){ a3OrdersCsv(a3OFApply(a2Orders())); toast(L('CSV downloaded — the orders you are looking at', 'CSV নামানো হয়েছে — যে অর্ডারগুলো দেখছেন')); };
function a3OrdersMore(){ return a3More('orders', a3SecItems('orders', ['all']).concat(['-', {act:'a3-oexp', en:'Export these orders (CSV)', bn:'এই অর্ডারগুলো নামান (CSV)', ic:'dl'}])); }
function a3OrdersHead(dz){
  var m = a2M(1), toC = a2Orders().filter(function(o){ var s = a2O(o).ost; return s === 'PLACED' || s === 'AWAITING_ADVANCE'; }).length;
  return '<div class="a3-ph2"><div><h1>' + Le('Orders', 'অর্ডার') + '</h1><p class="a3-sub">' + Le('Today ' + m.ordersN + ' orders · ' + a2tk(m.ordered) + ' · ' + toC + ' to confirm', 'আজ ' + m.ordersN + 'টা অর্ডার · ' + a2tk(m.ordered) + ' · ' + toC + 'টা কনফার্ম বাকি') + '</p></div><div class="a3-phr">' + a3Guide('orders') +
    a3Btn('a3-oexp', 'Export', 'এক্সপোর্ট', {ic:'dl'}) + (a2Can('orders.create') ? a3A('#/admin/orders/new', 'New order', 'নতুন অর্ডার', {cls:'pri', ic:'plus'}) : '') + a3OrdersMore() + '</div></div>';
}
function a3ListKeys(path){ A3X.keys = {page:path, fn:function(ev){
  var rows = [].slice.call(document.querySelectorAll('.a3-ol tbody tr[data-act="a2-lrow"]')); if(!rows.length) return false;
  var u = ui('a3ok', {i:0}), k = ev.key.toLowerCase();
  if(k === 'j' || k === 'k'){ u.used = true; u.i = Math.max(0, Math.min(rows.length - 1, u.i + (k === 'j' ? 1 : -1))); rows.forEach(function(r, i){ r.classList.toggle('kb', i === u.i); }); rows[u.i].scrollIntoView({block:'nearest'}); return true; }
  var r = rows[Math.min(u.i, rows.length - 1)]; if(!r) return false;
  if(k === 'enter'){ ACT['a2-lrow'](r, {target:r}); return true; }
  if(k === 'x'){ var c = r.querySelector('input[type=checkbox]'); if(c){ c.checked = !c.checked; c.dispatchEvent(new Event('change', {bubbles:true})); } return true; }
  if(k === 'c'){ var o = a2Order(r.getAttribute('data-k')); if(o && (a2O(o).ost === 'PLACED' || a2O(o).ost === 'AWAITING_ADVANCE') && a2Can('orders.confirm')){ go('#/admin/orders/confirm?id=' + o.id); return true; } }
  return false; }}; }
function a3ListAfter(){ var u = ui('a3ok', {i:0}), rows = document.querySelectorAll('.a3-ol tbody tr[data-act="a2-lrow"]'); if(u.used && rows[u.i]) rows[u.i].classList.add('kb'); }

/* ---------- registry ---------- */
a3Design('orders', 'A', {en:'Classic list', bn:'ক্লাসিক তালিকা', desc:'The V12.3 orders: KPI strip, four status chips per order, the call queue with a call script.', descBn:'V12.3-এর অর্ডার: KPI, প্রতিটা অর্ডারে চারটা অবস্থা, কল স্ক্রিপ্টসহ কল-কিউ।'});
a3Design('orders', 'B', {en:'Clean list + one-glance confirm', bn:'পরিষ্কার তালিকা + এক নজরে কনফার্ম', desc:'One plain status and a thin progress line per order, four views, filters in a drawer. Confirm shows customer, stock, address, courier and money on one screen.', descBn:'প্রতিটা অর্ডারে একটা সহজ অবস্থা আর পাতলা অগ্রগতি লাইন, চারটা ভিউ, ফিল্টার ড্রয়ারে। কনফার্মে কাস্টমার, স্টক, ঠিকানা, কুরিয়ার আর টাকা এক স্ক্রিনে।', views:{}});
a3Design('orders', 'C', {en:'Command list', bn:'কমান্ড তালিকা', desc:'A flow strip from placed to delivered, a dense table and a live activity feed. Confirm becomes a decision sheet with the checks first.', descBn:'এসেছে থেকে ডেলিভারি পর্যন্ত ধাপের স্ট্রিপ, ঘন টেবিল আর লাইভ কার্যকলাপ। কনফার্মে আগে চেক, তারপর সিদ্ধান্ত।', views:{}});
A3X.designs.orders.B.views.list = {render:function(p, q, ctx){ a3ListKeys('/admin/orders'); return '<div class="a3-B a3-orders">' + a3OrdersHead('B') + '<div class="a3-ol">' + a3OrderList('B', q) + '</div></div>'; }, after:a3ListAfter};
A3X.designs.orders.C.views.list = {render:function(p, q, ctx){
  a3ListKeys('/admin/orders'); var st = a3Stages(), fn = a3Funnel5(7, 0), lu = a3LU();
  var step = function(v, en, bn, n, sub, pct, c){ var on = lu.v === v; return '<button type="button" class="a3-fstep' + (on ? ' on' : '') + '" data-act="a2-lv" data-l="a3orders" data-v="' + v + '"><span class="a3-fsl"><i style="background:' + c + '"></i>' + Le(en, bn) + '</span><b class="a3-num">' + n + '</b><span class="a3-fss">' + sub + '</span>' + (pct != null ? '<em class="a3-fsp">' + pct + '%</em>' : '') + '</button>'; };
  var strip = '<div class="a3-fstrip">' + step('confirm', 'To confirm', 'কনফার্ম বাকি', st.nw.length, st.nw.length ? Le('oldest ', 'পুরনো ') + a2ago(st.oldest) : Le('all done', 'সব শেষ'), null, '#C9A14A') +
    step('pack', 'Pack & book', 'প্যাক ও বুক', st.cf.length + st.pk.length, Le(st.toBook + ' to book', st.toBook + 'টা বুক বাকি'), fn[0] ? Math.round(fn[1] / fn[0] * 100) : null, '#6FA08D') +
    step('courier', 'At courier', 'কুরিয়ারে', st.cr.length, Object.keys(st.byC).map(function(k){ return esc(k) + ' ' + st.byC[k]; }).join(' · ') || '—', fn[1] ? Math.round(fn[3] / fn[1] * 100) : null, '#2F7A62') +
    step('delivered', 'Delivered today', 'আজ ডেলিভারড', st.dt.length, Le('yesterday by now ' + st.dy.length, 'গতকাল এই সময়ে ' + st.dy.length), fn[3] ? Math.round(fn[4] / fn[3] * 100) : null, '#1F5C4A') + '</div>';
  var act = a3Activity(9), ico = {new:'bag', ok:'check', bad:'alert', warn:'clock', info:'info', mute:'msg'};
  var side = '<aside class="a3-oside"><section class="a3-card a3-feed"><div class="a3-chd"><div><h2><span class="a3-pulse" aria-hidden="true"></span>' + Le('Live activity', 'লাইভ কার্যকলাপ') + '</h2><p>' + Le('order events and staff actions', 'অর্ডারের ঘটনা আর স্টাফের কাজ') + '</p></div></div><ol class="a3-fl">' + act.map(function(x){ return '<li><a href="' + x.href + '"><span class="a3-fi ' + (x.k || 'mute') + '">' + a2i(ico[x.k] || 'pulse', 13) + '</span><span class="a3-ft"><b>' + esc(x.t) + '</b><span>' + x.s + '</span></span><time>' + a2ago(x.at) + '</time></a></li>'; }).join('') + '</ol></section>' +
    a3Card({t:Le('Needs a decision', 'সিদ্ধান্ত লাগবে'), b:a3Todo().filter(function(t){ return A3_TODO_GROUP[t.id] && A3_TODO_GROUP[t.id][0] === 'Orders'; }).slice(0, 4).map(function(t){ return '<a class="a3-nx" href="#' + t.href + '"><span class="a3-tdi ' + t.tone + '">' + a2i(t.icon, 15) + '</span><span class="a3-nm"><b>' + Le(t.t, t.tb) + '</b><span>' + Le('waiting ', 'অপেক্ষা ') + a2ago(t.oldest) + '</span></span>' + a2i('cr', 15) + '</a>'; }).join('') || a3Empty(L('Nothing is waiting', 'কিছু বাকি নেই'))}) + '</aside>';
  return '<div class="a3-C a3-orders">' + a3OrdersHead('C') + strip + '<div class="a3-ogrid"><div class="a3-ol">' + a3OrderList('C', q) + '</div>' + side + '</div></div>';
}, after:a3ListAfter};

/* ---------- confirm screen: shared parts ---------- */
function a3CQ(){ return ui('a3cq', {chip:'all', id:null, done:[], next:true}); }
var A3_CQ_CHIPS = [['all', 'Everything', 'সব'], ['call', 'Not reached yet', 'এখনো কথা হয়নি'], ['self', 'WhatsApp replies', 'WhatsApp উত্তর'], ['newc', 'New customers', 'নতুন কাস্টমার'], ['voice', 'Voice addresses', 'ভয়েস ঠিকানা'], ['risky', 'Risky', 'ঝুঁকির'], ['advance', 'Waiting for advance', 'অগ্রিম বাকি'], ['cancel', 'Want to cancel', 'বাতিল চায়']];
function a3Risky(o){ var a = a2O(o), r = a.risk || {}; return a.ost === 'AWAITING_ADVANCE' || (r.review && !r.decided) || ((r.band === 'high' || r.band === 'medium') && !r.decided); }
function a3CQList(){
  var u = a3CQ(), sort = a2Set('orders.queueSort');
  var all = a2Orders().filter(function(o){ var a = a2O(o); return (a.ost === 'PLACED' || a.ost === 'AWAITING_ADVANCE') || u.done.indexOf(o.id) >= 0; });
  var f = {all:function(){ return true; }, call:function(o){ var a = a2O(o); return !(a.calls || []).some(function(c){ return c.r === 'reached'; }) && !(a.sc && a.sc.state === 'replied'); }, self:function(o){ return !!a2O(o).sc; }, newc:function(o){ return a2PhoneHist(o.phone, o.id).orders === 0; }, voice:function(o){ return !!a2O(o).voice; }, risky:a3Risky, advance:function(o){ return a2O(o).ost === 'AWAITING_ADVANCE'; }, cancel:function(o){ return !!a2O(o).cancelReq; }}[u.chip] || function(){ return true; };
  var l = all.filter(function(o){ return u.done.indexOf(o.id) >= 0 || f(o); }); l = a3OFApply(l, true);
  return sort === 'oldest' ? l.slice().reverse() : l;
}
function a3Hint(o, done){
  if(done) return ['check', 'ok', L('Confirmed · just now', 'কনফার্ম হয়েছে · এখনই')];
  var a = a2O(o), h = a2PhoneHist(o.phone, o.id);
  if(a.cancelReq) return ['uturn', 'bad', L('Wants to cancel', 'বাতিল চায়')];
  if(a.ost === 'AWAITING_ADVANCE') return ['wallet', 'warn', L('Advance asked · ' + a2tk(a.adv ? a.adv.need : 0), 'অগ্রিম চাওয়া · ' + a2tk(a.adv ? a.adv.need : 0))];
  if(a3Risky(o)) return ['shield', 'warn', h.refused ? L('Caution: refused ' + h.refused + (h.refused === 1 ? ' parcel' : ' parcels') + ' before', 'সাবধান: আগে ' + h.refused + ' বার ফেরত') : L('Caution: check the risk', 'সাবধান: ঝুঁকি দেখুন')];
  if(a.sc && a.sc.state === 'replied') return ['wa', 'ok', L('Said yes on WhatsApp', 'WhatsApp-এ হ্যাঁ বলেছেন')];
  if(a.voice) return ['mic', 'mute', L('Address said by voice', 'ঠিকানা ভয়েসে বলা')];
  if((a.calls || []).some(function(c){ return c.r === 'no-answer'; })) return ['phone', 'warn', L('No answer · call again', 'উত্তর আসেনি · কল করুন')];
  if(o.payment !== 'cod') return ['wallet', 'mute', L(a2PayM(o.payment) + ' paid', a2PayM(o.payment) + '-এ পেইড')];
  if((o.flags || []).some(function(x){ return /2 sizes/.test(x); })) return ['layers', 'mute', L('Same item in 2 sizes', 'একই পণ্য 2 সাইজে')];
  if(a.gift) return ['gift', 'mute', L('Gift · other address', 'উপহার · অন্য ঠিকানায়')];
  if(a.sc) return ['wa', 'mute', L('WhatsApp sent · no reply yet', 'WhatsApp গেছে · উত্তর আসেনি')];
  if(!h.orders) return ['users', 'mute', L('New customer', 'নতুন কাস্টমার')];
  return h.delivered ? ['check', 'ok', L('Took ' + h.delivered + (h.delivered === 1 ? ' parcel' : ' parcels') + ' before', 'আগে ' + h.delivered + 'টা পার্সেল নিয়েছেন')] : ['clock', 'mute', L(h.orders + (h.orders === 1 ? ' earlier order' : ' earlier orders') + ', none delivered yet', 'আগে ' + h.orders + 'টা অর্ডার, এখনো ডেলিভারি হয়নি')];
}
function a3Checks(o){
  var a = a2O(o), r = a.risk || {}, h = a2PhoneHist(o.phone, o.id), out = [];
  var said = a.sc && a.sc.state === 'replied' ? ['ok', L('Said yes on WhatsApp', 'WhatsApp-এ হ্যাঁ'), L('Replied ' + (a.sc.reply || 'yes'), 'উত্তর দিয়েছেন')] : (a.calls || []).some(function(c){ return c.r === 'reached'; }) ? ['ok', L('Talked on the phone', 'ফোনে কথা হয়েছে'), L('Call logged', 'কল লেখা আছে')] : o.payment !== 'cod' && a2Paid(o) >= o.total ? ['ok', L('Paid in advance', 'আগেই পেইড'), a2PayM(o.payment)] : ['warn', L('Not reached yet', 'এখনো কথা হয়নি'), a.sc ? L('WhatsApp sent, no reply', 'WhatsApp গেছে, উত্তর নেই') : L('Call or WhatsApp first', 'আগে কল বা WhatsApp করুন')];
  out.push({k:'said', t:said[0], en:said[1], s:said[2]});
  var low = (o.lines || []).map(function(l){ return {l:l, n:stockOf(l.product, l.color, l.size)}; }).filter(function(x){ return x.n < (x.l.qty || 1); });
  out.push(low.length ? {k:'stock', t:'bad', en:L('Not enough stock', 'স্টক কম'), s:esc(a2PName(low[0].l.product)) + ' ' + esc(low[0].l.size) + L(': ' + low[0].n + ' left', ': ' + low[0].n + 'টা আছে')} : {k:'stock', t:'ok', en:L('All items in stock', 'সব পণ্য স্টকে'), s:L('checked with the ERP', 'ERP থেকে দেখা')});
  var addrOk = String(o.address || '').length >= 12 && (!a.voice || a.voice.conf >= .8);
  out.push(addrOk ? {k:'addr', t:'ok', en:L('Address matched', 'ঠিকানা মিলেছে'), s:esc(a2BandName(o.zone))} : {k:'addr', t:'warn', en:L('Check the address', 'ঠিকানা দেখে নিন'), s:a.voice ? L('voice ' + Math.round(a.voice.conf * 100) + '% clear', 'ভয়েস ' + Math.round(a.voice.conf * 100) + '% পরিষ্কার') : L('too short to place', 'খুব ছোট')});
  out.push(r.band === 'high' ? {k:'risk', t:'bad', en:L('High risk', 'ঝুঁকি বেশি'), s:L('ask for the full amount first', 'আগে পুরো টাকা চান')} : r.band === 'medium' ? {k:'risk', t:'warn', en:L('Be careful', 'সাবধান'), s:L('an advance is safer', 'অগ্রিম নেওয়া ভালো')} : {k:'risk', t:'ok', en:L('Risk low', 'ঝুঁকি কম'), s:h.orders ? L('took ' + h.delivered + ' of ' + h.orders + ' parcels', h.orders + 'টার মধ্যে ' + h.delivered + 'টা নিয়েছেন') : L('first order', 'প্রথম অর্ডার')});
  return out;
}
function a3RiskWords(o){
  var a = a2O(o), r = a.risk || {}, h = a2PhoneHist(o.phone, o.id), RD = a2S().risk.rules, out = [];
  if(h.refused) out.push(L('This number did not take ' + h.refused + (h.refused === 1 ? ' parcel' : ' parcels') + ' at the door before', 'এই নম্বরে আগের ' + h.refused + 'টা পার্সেল দরজায় নেয়নি'));
  (r.rules || []).forEach(function(x){ if(x.id === 'refusals' && h.refused) return; var d = RD.filter(function(z){ return z.id === x.id; })[0]; if(d) out.push(x.na ? L(d.en + ' — not checked', d.bn + ' — দেখা যায়নি') : L(d.en, d.bn)); });
  if(h.noAnswer && !(r.rules || []).some(function(x){ return x.id === 'noanswer'; })) out.push(L('Did not pick up ' + h.noAnswer + ' calls before', 'আগে ' + h.noAnswer + ' বার ফোন ধরেনি'));
  return out.slice(0, 4);
}
function a3RiskBox(o){
  var a = a2O(o), r = a.risk || {}, h = a2PhoneHist(o.phone, o.id), first = a2PhoneOrders(o.phone).reduce(function(m, x){ return Math.min(m, x.createdAt || m); }, o.createdAt);
  if(r.band === 'high' || r.band === 'medium'){ var w = a3RiskWords(o); return '<div class="a3-risk ' + (r.band === 'high' ? 'bad' : 'warn') + '">' + a2i('shield', 18) + '<div><b>' + (r.band === 'high' ? Le('Risk: high', 'ঝুঁকি বেশি') : Le('Risk: be careful', 'ঝুঁকি: সাবধান')) + '</b><span>' + esc(w[0] || L('A risk rule matched this order', 'একটা ঝুঁকির নিয়মে মিলেছে')) + '</span></div></div>'; }
  return '<div class="a3-risk ok">' + a2i('shield', 18) + '<div><b>' + Le('Risk: low', 'ঝুঁকি কম') + '</b><span>' + (h.orders ? Le('Took ' + (h.refused ? h.delivered + ' of ' + h.orders : 'every') + ' past parcel' + (h.orders > 1 ? 's' : '') + ', number checked. First order ' + new Date(first).toLocaleDateString('en-GB', {month:'long', year:'numeric'}) + '.', 'আগের ' + (h.refused ? h.orders + 'টার মধ্যে ' + h.delivered + 'টা' : 'সব') + ' পার্সেল নিয়েছেন, নম্বর যাচাই করা। প্রথম অর্ডার ' + new Date(first).toLocaleDateString('en-GB', {month:'long', year:'numeric'}) + '।') : Le('First order from this number. Nothing bad on record.', 'এই নম্বরে প্রথম অর্ডার। খারাপ কিছু জানা নেই।')) + '</span></div></div>';
}
function a3ItemsCard(o, dense){
  var a = a2O(o), ls = o.lines || [];
  var rows = ls.map(function(l){ var n = stockOf(l.product, l.color, l.size), pill = n < (l.qty || 1) ? '<span class="a3-pill bad">' + Le('Out of stock', 'স্টক নেই') + '</span>' : n <= 3 ? '<span class="a3-pill gold">' + Le('Only ' + n + ' left', 'স্টকে মাত্র ' + n + 'টা') + '</span>' : '<span class="a3-pill ok">' + Le(n + ' in stock', 'স্টকে ' + n + 'টা') + '</span>';
    return '<div class="a3-it">' + a3Ph(l.product, l.color, {cls:dense ? 'sm' : 'md'}) + '<div class="a3-nm"><b>' + esc(a2PName(l.product)) + '</b><span>' + esc(COL(l.color).name) + Le(' · size ', ' · সাইজ ') + esc(l.size) + ' · ' + (l.qty || 1) + L(' pc', ' পিস') + '</span><small>SKU ' + esc(x2Sku(l.product, l.color, l.size)) + '</small></div><div class="a3-its2">' + pill + '<small>' + (n <= 3 && n >= (l.qty || 1) ? Le('held for this order', 'ধরে রাখা হয়েছে') : 'ERP · ' + a2hm(Date.now() - 4 * 60000)) + '</small></div><b class="a3-num a3-itp">' + a2tk((l.unitPrice || 0) * (l.qty || 1)) + '</b></div>'; }).join('');
  var paid = a2Paid(o), due = a2Due(o), lvl = a.adv ? a.adv.level : null;
  var tot = '<div class="a3-tot"><div><span>' + Le('Goods', 'পণ্যের দাম') + '</span><span class="a3-num">' + a2tk(o.subtotal) + '</span></div>' + (o.discount ? '<div><span>' + Le('Discount', 'ছাড়') + (o.setDiscounts && o.setDiscounts[0] ? ' · ' + esc(o.setDiscounts[0].label) : '') + '</span><span class="a3-num">−' + a2tk(o.discount).slice(1) + '</span></div>' : '') +
    '<div><span>' + Le('Delivery charge · ', 'ডেলিভারি চার্জ · ') + esc(a2BandName(o.zone)) + '</span><span class="a3-num">' + (o.delivery ? a2tk(o.delivery) : Le('Free', 'ফ্রি')) + '</span></div><div><span>' + Le('Payment', 'পেমেন্ট') + '</span><span>' + (o.payment === 'cod' ? Le('Cash on delivery (COD)', 'ক্যাশ অন ডেলিভারি (COD)') : esc(a2PayM(o.payment))) + '</span></div>' +
    '<div><span>' + Le('Advance', 'অগ্রিম') + '</span><span>' + (a.adv ? Le('asked · ' + a2tk(a.adv.need) + ' (' + (lvl === 'hard' ? 'full' : 'delivery charge') + ')', 'চাওয়া হয়েছে · ' + a2tk(a.adv.need)) : (a.risk || {}).band === 'low' || !(a.risk || {}).band ? Le('Not needed · risk low', 'লাগবে না · ঝুঁকি কম') : Le('Not asked', 'চাওয়া হয়নি')) + '</span></div><div><span>' + Le('Paid already', 'আগে পেয়েছি') + '</span><span class="a3-num">' + a2tk(paid) + '</span></div>' +
    '<div class="b"><span>' + (o.payment === 'cod' ? Le('To collect on delivery', 'ডেলিভারিতে নিতে হবে') : Le('Still due', 'এখনো বাকি')) + '</span><span class="a3-num">' + a2tk(due) + '</span></div></div>';
  return a3Card({cls:'a3-itc', t:Le('Items & money · ' + a2Units(o) + (a2Units(o) === 1 ? ' pc' : ' pcs'), 'পণ্য ও টাকা · ' + a2Units(o) + ' পিস'), r:'<span class="a3-cap">' + Le('Stock live from the ERP', 'স্টক লাইভ, ERP থেকে') + '</span>', b:rows + tot});
}
function a3AddrCard(o){
  var a = a2O(o), cs = a2Couriers(), b = a2Band(o.zone), m30 = a2M(30), sg = a2Suggest(o), pick = a.courPick || (sg && sg.id);
  var addrOk = String(o.address || '').length >= 12 && (!a.voice || a.voice.conf >= .8);
  var voice = a.voice ? (function(){ var bars = ''; for(var i = 0; i < 42; i++){ var hgt = 6 + Math.round(Math.abs(Math.sin(i * 1.7) * 14 + Math.cos(i * .6) * 6)); bars += '<i style="height:' + Math.min(24, hgt) + 'px"></i>'; } return '<div class="a3-voice"><button type="button" class="a3-pl" data-act="a2-soon" data-t="Play recording" aria-label="' + Le('Play the recording', 'রেকর্ডিং শুনুন') + '">' + a2i('play', 14) + '</button><span class="a3-wave" aria-hidden="true">' + bars + '</span><span class="a3-vd">0:12</span><span class="a3-pill ' + (a.voice.conf >= .8 ? 'line' : 'gold') + '">' + a2i('mic', 12) + Le('Said by voice · ' + Math.round(a.voice.conf * 100) + '% clear', 'ভয়েসে বলা · ' + Math.round(a.voice.conf * 100) + '% পরিষ্কার') + '</span></div>' + (a.voice.text ? '<p class="a3-vt">“' + esc(a.voice.text) + '”</p>' : ''); })() : '';
  var creq = a.cancelReq ? '<div class="a3-alert bad">' + a2i('uturn', 17) + '<div><b>' + Le('The customer wants to cancel', 'কাস্টমার বাতিল করতে চান') + '</b><span>“' + esc(a.cancelReq.why) + '” · ' + a2ago(a.cancelReq.at) + L(' ago', ' আগে') + '</span><div class="a3-acts">' + a3Btn('a2c-creq', 'Approve cancel', 'বাতিল মেনে নিন', {cls:'sm bad', attrs:' data-id="' + o.id + '" data-v="ok"'}) + a3Btn('a2c-creq', 'Keep the order', 'অর্ডার থাকবে', {cls:'sm', attrs:' data-id="' + o.id + '" data-v="no"'}) + '</div></div></div>' : '';
  var cour = cs.map(function(c){ var on = c.id === pick, bc = m30.byCour[c.id], rate = bc && bc.rate != null ? Math.round(bc.rate * 100) : null, eta = b === 'in' ? L('next day', 'পরের দিন') : b === 'sub' ? L('1–2 days', '1–2 দিন') : L('2–3 days', '2–3 দিন');
    return '<button type="button" class="a3-cour2' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-act="a3-cpick" data-id="' + o.id + '" data-v="' + c.id + '"' + (a2Booked(o) ? ' disabled' : '') + '><span class="a3-radio' + (on ? ' on' : '') + '"></span><b>' + esc(c.name) + '</b><span class="a3-cs">' + (rate != null ? Le(rate + '% delivered', rate + '% সফল') + ' · ' : '') + esc(eta) + (sg && sg.id === c.id ? ' · <em>' + Le('suggested', 'পরামর্শ') + '</em>' : '') + '</span><b class="a3-num">' + a2tk(c.rates[b] || 0) + '</b></button>'; }).join('');
  return a3Card({cls:'a3-adc', t:Le('Address & courier', 'ঠিকানা ও কুরিয়ার'), b:creq + '<p class="a3-addr">' + esc(o.address) + '</p><p class="a3-addrok ' + (addrOk ? 'ok' : 'warn') + '">' + a2i(addrOk ? 'check' : 'alert', 15) + '<b>' + (addrOk ? Le('Address matched', 'ঠিকানা মিলেছে') : Le('Check the address with the customer', 'কাস্টমারের সাথে ঠিকানা মিলিয়ে নিন')) + '</b><span>' + esc(a3Area(o)) + ' · ' + esc(a2BandName(o.zone)) + '</span></p>' + voice +
    '<div class="a3-lab">' + (a2Booked(o) ? Le('Booked with ' + a2CourName(a.cour) + ' · ' + (a.cid || ''), a2CourName(a.cour) + '-এ বুক হয়েছে · ' + (a.cid || '')) : Le('Courier suggestion', 'কুরিয়ার পরামর্শ')) + '</div><div class="a3-cours" role="radiogroup" aria-label="' + Le('Courier', 'কুরিয়ার') + '">' + cour + '</div>'});
}
function a3CustCard(o){
  var h = a2PhoneHist(o.phone, o.id), all = a2PhoneHist(o.phone), a = a2O(o);
  return a3Card({cls:'a3-cuc', t:Le('Customer', 'কাস্টমার'), b:'<div class="a3-cust"><span class="a3-cav">' + esc(a3Init(o.name)) + '</span><div><b>' + esc(o.name) + '</b><span class="a3-num">' + esc(a2Phone(o.phone)) + '</span></div></div>' +
    '<div class="a3-cbtn"><a class="a3-btn" href="tel:' + esc(o.phone) + '">' + a2i('phone', 15) + '<span>' + Le('Call', 'কল করুন') + '</span></a><a class="a3-btn wa" href="' + a2WaHref(o) + '" target="_blank" rel="noopener">' + a2i('wa', 15) + '<span>WhatsApp</span></a></div>' +
    '<div class="a3-hist"><div><b class="a3-num">' + (h.orders + 1) + '</b><span>' + Le(h.orders ? 'orders' : 'order', 'অর্ডার') + '</span></div><div><b class="a3-num ok">' + h.delivered + '</b><span>' + Le('delivered', 'ডেলিভারড') + '</span></div><div><b class="a3-num' + (h.refused ? ' bad' : '') + '">' + h.refused + '</b><span>' + Le('returned', 'ফেরত') + '</span></div><div><b class="a3-num">' + a2tk(all.spend) + '</b><span>' + Le('spent', 'মোট কেনা') + '</span></div></div>' + a3RiskBox(o) +
    '<div class="a3-calls"><span>' + Le('Log a call', 'কল লিখুন') + '</span>' + [['reached', 'Reached', 'কথা হয়েছে'], ['no-answer', 'No answer', 'ধরেনি'], ['wrong', 'Wrong number', 'ভুল নম্বর']].map(function(x){ return '<button type="button" class="a3-chip sm" data-act="a2c-call" data-id="' + o.id + '" data-v="' + x[0] + '">' + Le(x[1], x[2]) + '</button>'; }).join('') + ((a.calls || []).length ? '<em>' + a.calls.length + L(a.calls.length === 1 ? ' call so far' : ' calls so far', ' বার কল') + '</em>' : '') + '</div>'});
}
function a3TLCard(o){
  var a = a2O(o), ev = (a.ev || []).slice().reverse().map(function(e){ return {t:e.t, s:a2hm(e.at) + (e.who ? ' · ' + e.who : ''), k:e.k}; });
  (o.notif || []).slice().reverse().forEach(function(n){ ev.push({t:L('Message sent: ', 'মেসেজ গেছে: ') + n.what, s:a2hm(n.at) + ' · ' + n.ch, k:''}); });
  ev.push({t:L('Order came in', 'অর্ডার এসেছে'), s:a2hm(o.createdAt) + ' · ' + esc(a3Src(o)), k:''});
  return a3Card({cls:'a3-tlc', t:Le('What happened', 'যা যা হয়েছে'), b:'<ol class="a3-tl">' + ev.slice(0, 7).map(function(e, i){ return '<li class="' + (i === 0 && e.k === 'ok' ? 'g' : e.k === 'bad' ? 'b' : '') + '"><b>' + esc(e.t) + '</b><span>' + e.s + '</span></li>'; }).join('') + '</ol>' +
    '<form class="a3-note2" data-submit="a3-note" data-id="' + o.id + '"><label class="a2-sr" for="a3-nt">' + Le('Write a note (only the team sees it)', 'নোট লিখুন (শুধু টিম দেখবে)') + '</label>' + a2i('edit', 15) + '<input id="a3-nt" name="t" class="a2-inp" autocomplete="off" placeholder="' + esc(L('Write a note… (only the team sees it)', 'নোট লিখুন… (শুধু টিম দেখবে)')) + '"></form>'});
}
SUBMIT['a3-note'] = function(f){ var o = a2Order(f.getAttribute('data-id')), t = f.querySelector('[name=t]').value.trim(); if(!o || !t) return; A2C.note(o, t); saveState(); rerender(); toast(L('Note saved', 'নোট সেভ হয়েছে')); };
ACT['a3-cpick'] = function(el){ var o = a2Order(el.getAttribute('data-id')); a2O(o).courPick = el.getAttribute('data-v'); a2Ev(o, L('Courier chosen: ', 'কুরিয়ার বাছাই: ') + a2CourName(a2O(o).courPick), 'mute'); saveState(); rerender(); };
function a3AdvCard(o){
  var a = a2O(o), r = a.risk || {}, lv = a2S().risk.levels, rec = (r.score || 0) >= lv.hard.min ? 'hard' : 'soft', u = ui('a3adv', {}), sel = a.adv ? a.adv.level : (u[o.id] || rec);
  var softAmt = o.delivery || a2Rate('steadfast', o.zone), opt = function(v, en, bn, amt, sub, subBn){ var on = sel === v; return '<button type="button" class="a3-advo' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-act="a3-advpick" data-id="' + o.id + '" data-v="' + v + '"' + (a.adv ? ' disabled' : '') + '><span class="a3-radio' + (on ? ' on' : '') + '"></span><span class="a3-advt"><b>' + Le(en, bn) + '</b><span>' + Le(sub, subBn) + ' · <b class="a3-num">' + a2tk(amt) + '</b></span></span>' + (a.adv && a.adv.level === v ? '<span class="a3-pill gold">' + Le('asked', 'চাওয়া হয়েছে') + '</span>' : v === rec && !a.adv ? '<span class="a3-pill line">' + Le('rule suggests', 'নিয়মের পরামর্শ') + '</span>' : '') + '</button>'; };
  var prog = '';
  if(a.adv){ var dl = a.adv.sent + (+a2Set('orders.advanceHours') || 2) * A2.H, paid = a2Paid(o) >= a.adv.need;
    prog = '<div class="a3-advp"><span class="ok">' + a2i('check', 13, 2.4) + Le('Payment link sent ', 'লিংক গেছে ') + '<time>' + a2hm(a.adv.sent) + '</time></span><i></i><span class="' + (a.adv.seen ? 'ok' : '') + '">' + a2i(a.adv.seen ? 'check' : 'eye', 13, 2.2) + (a.adv.seen ? Le('Message seen ', 'মেসেজ দেখেছেন ') + '<time>' + a2hm(a.adv.seen) + '</time>' : Le('Not seen yet', 'এখনো দেখেননি')) + '</span><i></i><span class="' + (paid ? 'ok' : 'w') + '">' + a2i(paid ? 'check' : 'clock', 13, 2.2) + (paid ? Le('Money in', 'টাকা এসেছে') : Le('Money not in yet', 'টাকা আসেনি')) + '</span></div>' +
      '<div class="a3-note">' + a2i('clock', 15) + '<span>' + Le('If it does not come by ' + a2hm(dl) + ', the order is cancelled with the reason “advance not paid”. When the money comes, the order goes back to the confirm list by itself.', a2hm(dl) + '-এর মধ্যে না এলে অর্ডার বাতিল হবে (কারণ: অগ্রিম দেয়নি)। টাকা এলে নিজে থেকেই কনফার্মের লাইনে ফিরবে।') + '</span>' + (a2Can('payments.record') ? '<button type="button" class="a3-lnk" data-act="a2o-pay" data-id="' + o.id + '">' + Le('Money came? Record it', 'টাকা এসেছে? লিখুন') + '</button>' : '') + '</div>'; }
  return a3Card({cls:'a3-advc', t:Le('Advance', 'অগ্রিম'), b:'<div class="a3-advg" role="radiogroup" aria-label="' + Le('Advance', 'অগ্রিম') + '">' + opt('soft', 'Small advance', 'অল্প অগ্রিম', softAmt, 'delivery charge only', 'শুধু ডেলিভারি চার্জ') + opt('hard', 'Full advance', 'পুরো অগ্রিম', o.total, 'the whole amount first', 'পুরো টাকা আগে') + '</div>' + prog});
}
ACT['a3-advpick'] = function(el){ ui('a3adv', {})[el.getAttribute('data-id')] = el.getAttribute('data-v'); rerender(); };
ACT['a3-advsend'] = function(el){ var o = a2Order(el.getAttribute('data-id')), lv = ui('a3adv', {})[o.id] || ((a2O(o).risk || {}).score >= a2S().risk.levels.hard.min ? 'hard' : 'soft');
  a2Confirm({title:'Ask for an advance', bn:'অগ্রিম চান', sub:esc(o.id + ' · ' + o.name), effects:[L('A payment link for ', '') + a2tk(lv === 'hard' ? o.total : (o.delivery || a2Rate('steadfast', o.zone))) + L(' goes by WhatsApp and SMS', '-এর পেমেন্ট লিংক WhatsApp আর SMS-এ যাবে'), L('The order waits until the money comes, then returns to this list', 'টাকা না আসা পর্যন্ত অর্ডার অপেক্ষা করবে, তারপর এই তালিকায় ফিরবে'), L('Not paid in ' + a2Set('orders.advanceHours') + ' h → cancelled with the reason, never silently', a2Set('orders.advanceHours') + ' ঘণ্টায় না দিলে কারণসহ বাতিল')], ok:'Send the request', okBn:'অনুরোধ পাঠান',
    fn:function(){ if(A2C.reqAdvance(o, lv)){ if(a2O(o).risk) a2O(o).risk.review = false; saveState(); toast(L('Advance requested', 'অগ্রিম চাওয়া হয়েছে')); } rerender(); }}); };
ACT['a3-remind'] = function(el){ var o = a2Order(el.getAttribute('data-id')), a = a2O(o); a2Ev(o, L('Reminder sent on WhatsApp', 'WhatsApp-এ মনে করিয়ে দেওয়া হয়েছে'), 'info'); saveState(); window.open(a2WaHref(o, L('Hi ' + String(o.name).split(' ')[0] + ', a reminder from EXTAS: please pay ' + a2tk(a.adv ? a.adv.need : 0) + ' advance for order ' + o.id + ' so we can send it today.', 'আসসালামু আলাইকুম, EXTAS থেকে মনে করিয়ে দিচ্ছি: অর্ডার ' + o.id + ' পাঠাতে ' + a2tk(a.adv ? a.adv.need : 0) + ' অগ্রিম দিন।')), '_blank', 'noopener'); rerender(); toast(L('Reminder opened in WhatsApp', 'WhatsApp-এ রিমাইন্ডার খোলা হলো')); };
ACT['a3-noadv'] = function(el){ var o = a2Order(el.getAttribute('data-id'));
  a2Confirm({title:'Confirm without an advance?', bn:'অগ্রিম ছাড়া কনফার্ম করবেন?', sub:esc(o.id + ' · ' + o.name), effects:[L('The risk check is marked as decided by you, with your reason', 'ঝুঁকি যাচাই আপনার সিদ্ধান্ত হিসেবে কারণসহ লেখা থাকবে'), L('The order is confirmed and goes to packing', 'অর্ডার কনফার্ম হয়ে প্যাকিংয়ে যাবে')], reason:true, ok:'Confirm', okBn:'কনফার্ম',
    fn:function(r){ var a = a2O(o); if(a.risk){ a.risk.decided = {by:a2Who(), what:L('Confirmed without advance: ', 'অগ্রিম ছাড়া কনফার্ম: ') + r, at:Date.now()}; a.risk.review = false; } if(a.ost === 'AWAITING_ADVANCE'){ a.ost = 'PLACED'; a2Sync(o); } a2Ev(o, L('Risk decided: confirmed without advance — ', 'ঝুঁকির সিদ্ধান্ত: অগ্রিম ছাড়া — ') + r, 'info'); a3DoConfirm(o); }}); };
function a3DoConfirm(o){ var u = a3CQ(); if(!A2C.confirm(o)) return rerender(); if(u.done.indexOf(o.id) < 0) u.done.push(o.id); A3X.undo = {id:o.id, at:Date.now()};
  if(u.next){ var l = a3CQList().filter(function(x){ return u.done.indexOf(x.id) < 0; }); u.id = l.length ? l[0].id : o.id; }
  saveState(); rerender(); clearTimeout(A3X.undoT); A3X.undoT = setTimeout(function(){ if(A3X.undo && Date.now() - A3X.undo.at >= 8000){ A3X.undo = null; if(document.querySelector('.a3-undo')) rerender(); } }, 8100); }
ACT['a3-conf'] = function(el){ var o = a2Order(el.getAttribute('data-id')); if(o) a3DoConfirm(o); };
ACT['a3-undo'] = function(){ var x = A3X.undo; if(!x) return; var o = a2Order(x.id), a = a2O(o); if(a.ost !== 'CONFIRMED') return toast(L('Too late — it has already moved on', 'দেরি হয়ে গেছে — অর্ডার এগিয়ে গেছে'));
  a.ost = 'PLACED'; a.confirmedAt = null; a2Sync(o); a2Ev(o, L('Confirm undone', 'কনফার্ম ফিরিয়ে নেওয়া হলো'), 'warn'); a2Log('Undid confirm ' + o.id, o.id); var u = a3CQ(); u.done = u.done.filter(function(i){ return i !== o.id; }); u.id = o.id; A3X.undo = null; saveState(); rerender(); toast(L('Back to “to confirm”', 'আবার “কনফার্ম বাকি”-তে')); };
ACT['a3-hold'] = function(el){ var o = a2Order(el.getAttribute('data-id')), rs = String(a2Set('orders.holdReasons') || '').split('·').map(function(s){ return s.trim(); }).filter(Boolean);
  a2Confirm({title:'Hold ' + o.id, bn:o.id + ' আটকে রাখুন', body:'<label class="a2-lbl" for="a3hr">' + Le('Why', 'কেন') + '</label><select id="a3hr" class="a2-sel" data-f="why">' + rs.map(function(x){ return '<option>' + esc(x) + '</option>'; }).join('') + '</select><div style="height:10px"></div>', effects:[L('The order keeps its stock and waits on hold', 'অর্ডার স্টক ধরে রেখে হোল্ডে থাকবে'), L('Release it from the order page any time', 'যেকোনো সময় অর্ডার পেজ থেকে ছাড়া যায়')], reason:'optional', ok:'Hold', okBn:'আটকে রাখুন',
    fn:function(r, v){ if(A2C.hold(o, v.why + (r ? ' — ' + r : ''))){ var u = a3CQ(); var l = a3CQList().filter(function(x){ return x.id !== o.id && u.done.indexOf(x.id) < 0; }); u.id = l.length ? l[0].id : null; saveState(); toast(L('On hold', 'হোল্ডে রাখা হলো')); } rerender(); }}); };
ACT['a3-cq'] = function(el){ var u = a3CQ(); u.id = el.getAttribute('data-id'); UI['a2d:a3q'] = null; A2.drawerOpen = false; rerender(); var m = document.getElementById('main'); if(m && innerWidth < 768) scrollTo(0, 0); };
ACT['a3-cqn'] = function(el){ var l = a3CQList(), u = a3CQ(), i = l.map(function(x){ return x.id; }).indexOf(u.id), d = +el.getAttribute('data-v'); var j = Math.max(0, Math.min(l.length - 1, i + d)); if(l[j]){ u.id = l[j].id; rerender(); } };
ACT['a3-cqnext'] = function(){ var u = a3CQ(); u.next = !u.next; rerender(); };
ACT['a3-cqchip'] = function(el){ var u = a3CQ(); u.chip = el.getAttribute('data-v'); u.id = null; rerender(); };
ACT['a3-cqsort'] = function(el){ a2SetV('orders.queueSort', el.getAttribute('data-v')); rerender(); };
A2.drawers.a3cqf = function(){ var u = a3CQ(), all = a2Orders().filter(function(o){ var s = a2O(o).ost; return s === 'PLACED' || s === 'AWAITING_ADVANCE'; });
  var cnt = function(id){ var save = u.chip; u.chip = id; var n = a3CQList().filter(function(o){ return u.done.indexOf(o.id) < 0; }).length; u.chip = save; return n; };
  var body = '<fieldset class="a3-fg"><legend>' + Le('Show', 'দেখান') + '</legend><div class="a3-chips">' + A3_CQ_CHIPS.map(function(c){ var on = u.chip === c[0]; return '<button type="button" class="a3-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="a3-cqchip" data-v="' + c[0] + '">' + (on ? a2i('check', 13, 2.2) : '') + Le(c[1], c[2]) + '<i>' + cnt(c[0]) + '</i></button>'; }).join('') + '</div></fieldset>' +
    '<fieldset class="a3-fg"><legend>' + Le('Order', 'ক্রম') + '</legend>' + a3Seg('a3-cqsort', a2Set('orders.queueSort'), [['newest', 'Newest first', 'নতুনটা আগে'], ['oldest', 'Oldest first', 'পুরনোটা আগে']], L('Order', 'ক্রম')) + '</fieldset>' +
    A3_OF.filter(function(g){ return g.id === 'risk' || g.id === 'pay' || g.id === 'src'; }).map(function(g){ var opts = typeof g.opts === 'function' ? g.opts() : g.opts, ff = a3OF().f; return '<fieldset class="a3-fg"><legend>' + Le(g.en, g.bn) + '</legend><div class="a3-chips">' + opts.map(function(o){ var on = (ff[g.id] || []).indexOf(o[0]) >= 0; return '<button type="button" class="a3-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="a3-of" data-g="' + g.id + '" data-v="' + esc(o[0]) + '">' + (on ? a2i('check', 13, 2.2) : '') + Le(o[1], o[2]) + '</button>'; }).join('') + '</div></fieldset>'; }).join('') +
    '<fieldset class="a3-fg"><legend>' + Le('Area', 'এলাকা') + '</legend>' + a3Seg('a3-ofa', a3OF().area, [['all', 'All', 'সব'], ['out', 'Outside Dhaka', 'ঢাকার বাইরে'], ['in', 'Inside Dhaka', 'ঢাকার ভেতরে']], L('Area', 'এলাকা')) + '</fieldset>';
  var n = a3CQList().filter(function(o){ return u.done.indexOf(o.id) < 0; }).length;
  return a2Drawer({title:L('Filter the confirm list', 'কনফার্ম তালিকা ফিল্টার'), sub:Le(all.length + ' waiting in all', 'মোট ' + all.length + 'টা অপেক্ষায়'), body:body, close:'a2-drw-x', closeData:' data-k="a2d:a3cqf"', foot:'<button type="button" class="a3-btn gh" data-act="a3-cqclr">' + Le('Clear all', 'সব মুছুন') + '</button><span style="flex:1"></span><button type="button" class="a3-btn pri" data-act="a2-drw-x" data-k="a2d:a3cqf">' + Le('Show ' + n + ' orders', n + 'টা অর্ডার দেখান') + '</button>'}); };
ACT['a3-cqclr'] = function(){ a3CQ().chip = 'all'; ACT['a3-ofclr'](); };
A2.drawers.a3q = function(){ return a2Drawer({title:L('To confirm', 'কনফার্ম বাকি'), body:a3QueueItems(), close:'a2-drw-x', closeData:' data-k="a2d:a3q"'}); };
A2.drawers.a3bc = function(){ var st = UI['a2d:a3bc'], l = a2Orders().filter(function(o){ var a = a2O(o); return a.ost === 'PLACED' && !a.cancelReq && !(a.risk && a.risk.review && !a.risk.decided); });
  if(!st.sel){ st.sel = {}; l.forEach(function(o){ st.sel[o.id] = a3Checks(o).every(function(c){ return c.t === 'ok'; }); }); }
  var n = l.filter(function(o){ return st.sel[o.id]; }).length;
  var body = '<p class="a3-p">' + Le('Orders whose four checks are all green are ticked. Untick any you want to look at first.', 'যেগুলোর চারটা চেকই সবুজ সেগুলো টিক দেওয়া। আগে দেখতে চাইলে টিক তুলে দিন।') + '</p>' + l.map(function(o){ var ck = a3Checks(o), ok = ck.filter(function(c){ return c.t === 'ok'; }).length; return '<label class="a3-bcr"><input type="checkbox" class="a2-chk" data-change="a3-bcs" data-id="' + o.id + '"' + (st.sel[o.id] ? ' checked' : '') + '><span class="a3-nm"><b>' + esc(o.id) + ' · ' + esc(o.name) + '</b><span>' + a2tk(o.total) + ' · ' + ck.map(function(c){ return '<i class="a3-ckd ' + c.t + '" title="' + esc(c.en) + '"></i>'; }).join('') + ' ' + ok + '/4</span></span></label>'; }).join('');
  return a2Drawer({title:L('Confirm several', 'একসাথে কনফার্ম'), sub:Le(l.length + ' can be confirmed', l.length + 'টা কনফার্ম করা যায়'), body:body, close:'a2-drw-x', closeData:' data-k="a2d:a3bc"', foot:'<span style="flex:1"></span><button type="button" class="a3-btn pri" data-act="a3-bcgo"' + (n ? '' : ' disabled') + '>' + a2i('check', 15) + '<span>' + Le('Confirm ' + n, n + 'টা কনফার্ম') + '</span></button>'}); };
CHANGE['a3-bcs'] = function(el){ UI['a2d:a3bc'].sel[el.getAttribute('data-id')] = el.checked; rerender(); };
ACT['a3-bcgo'] = function(){ var st = UI['a2d:a3bc'], n = 0, u = a3CQ(); Object.keys(st.sel).forEach(function(id){ if(st.sel[id] && A2C.confirm(ST.orders[id])){ n++; if(u.done.indexOf(id) < 0) u.done.push(id); } }); UI['a2d:a3bc'] = null; A2.drawerOpen = false; saveState(); rerender(); toast(L(n + ' confirmed', n + 'টা কনফার্ম হয়েছে')); };
function a3QueueItems(dense){
  var u = a3CQ(), l = a3CQList();
  return l.length ? l.map(function(o){ var done = u.done.indexOf(o.id) >= 0, h = a3Hint(o, done), on = o.id === u.id;
    return '<button type="button" class="a3-qi' + (on ? ' on' : '') + (done ? ' done' : '') + '" data-act="a3-cq" data-id="' + o.id + '"' + (on ? ' aria-current="true"' : '') + '><span class="a3-l1"><b>' + esc(o.id) + '</b><span class="a3-age">' + a2ago(o.createdAt) + '</span></span><span class="a3-l2"><span>' + esc(o.name) + '</span><b class="a3-num">' + a2tk(o.total) + '</b></span><span class="a3-hint ' + h[1] + '">' + a2i(h[0], 13) + '<span>' + esc(h[2]) + '</span></span></button>'; }).join('') :
    '<div class="a3-empty">' + a2i('check', 22) + '<b>' + Le('Nothing to confirm', 'কনফার্ম করার কিছু নেই') + '</b><span>' + Le('New orders show up here by themselves. Prepaid orders skip this list.', 'নতুন অর্ডার নিজে থেকেই এখানে আসে। আগে পেইড অর্ডার এই তালিকায় আসে না।') + '</span></div>';
}
function a3ConfMore(o){ var a = a2O(o), items = [{href:'#/admin/orders/' + o.id, en:'Open the full order', bn:'পুরো অর্ডার খুলুন', ic:'ext'}, {href:'#/admin/orders/' + o.id + '?edit=1', en:'Edit items or address', bn:'পণ্য বা ঠিকানা এডিট', ic:'edit'}];
  if(a.ost !== 'AWAITING_ADVANCE') items.push({act:'a2o-adv', attrs:' data-id="' + o.id + '"', en:'Ask for an advance', bn:'অগ্রিম চান', ic:'wallet'});
  items.push({act:'a3-hold', attrs:' data-id="' + o.id + '"', en:'Hold with a reason', bn:'কারণসহ আটকে রাখুন', ic:'clock'});
  if(a.risk && (a.risk.section === 'duplicate' || a.risk.section === 'reorder')) items.push({act:'a2r-merge', attrs:' data-id="' + o.id + '"', en:'Merge into one parcel', bn:'এক পার্সেলে জোড়া দিন', ic:'merge'});
  if(a2Can('risk.codOff.propose') || a2Can('orders.risk')) items.push({act:'a2-codoff', attrs:' data-id="' + o.id + '" data-ph="' + esc(o.phone) + '"', en:'Propose “COD off for this number”', bn:'“এই নম্বরে COD বন্ধ” প্রস্তাব', ic:'shield'});
  items.push({act:'a2o-cancel', attrs:' data-id="' + o.id + '"', en:'Cancel this order', bn:'অর্ডার বাতিল করুন', ic:'x'});
  items.push('-', {act:'a2-dopen', attrs:' data-d="a3bc"', en:'Confirm several at once', bn:'একসাথে কয়েকটা কনফার্ম', ic:'check'});
  if(a2Can('orders.risk')) items.push({href:'#/admin/orders/risk', en:'Risk review page', bn:'ঝুঁকি যাচাই পাতা', ic:'shield'});
  return a3More('orders', items, {label:['More actions', 'আরও কাজ']}); }
function a3ConfBar(o, dense){
  var a = a2O(o), u = a3CQ(), risky = a3Risky(o), ck = a3Checks(o), can = a2Can('orders.confirm');
  if(a.cancelReq) return '<div class="a3-abar"><span class="a3-abn">' + a2i('uturn', 15) + Le('Decide the cancel request above first', 'আগে ওপরের বাতিলের অনুরোধ ঠিক করুন') + '</span><span style="flex:1"></span>' + a3Btn('a3-cqn', 'Next', 'পরেরটা', {cls:'dk', attrs:' data-v="1"', kbd:'J', ic:'cr'}) + '</div>';
  if(risky) return '<div class="a3-abar"><span class="a3-abn">' + (a.ost === 'AWAITING_ADVANCE' ? Le('When the money comes, Confirm turns on by itself', 'টাকা এলে কনফার্ম বোতাম নিজে থেকেই চালু হবে') : Le('Choose the advance above, then send the request', 'ওপরে অগ্রিম বেছে অনুরোধ পাঠান')) + '</span><span style="flex:1"></span>' +
    (can ? a3Btn('a3-noadv', 'Confirm without advance…', 'অগ্রিম ছাড়া কনফার্ম…', {attrs:' data-id="' + o.id + '"'}) : '') +
    (a.ost === 'AWAITING_ADVANCE' ? '<button type="button" class="a3-btn" data-act="a3-remind" data-id="' + o.id + '">' + a2i('wa', 15) + '<span>' + Le('Remind', 'মনে করিয়ে দিন') + '</span></button>' : a3Btn('a3-advsend', 'Send advance request', 'অগ্রিমের অনুরোধ পাঠান', {cls:'gold', ic:'send', attrs:' data-id="' + o.id + '"'})) +
    a3Btn('a3-cqn', 'Next', 'পরেরটা', {cls:'dk', attrs:' data-v="1"', kbd:'J', ic:'cr'}) + '</div>';
  var ok = ck.filter(function(c){ return c.t === 'ok'; }).length;
  return '<div class="a3-abar"><div class="a3-okcs" aria-label="' + Le(ok + ' of 4 checks are fine', '4টার মধ্যে ' + ok + 'টা চেক ঠিক') + '">' + ck.map(function(c){ return '<span class="a3-okc ' + c.t + '" data-tip="' + esc('<b>' + c.en + '</b><span>' + c.s + '</span>') + '"><i>' + a2i(c.t === 'ok' ? 'check' : 'alert', 12, 2.4) + '</i>' + esc(c.en) + '</span>'; }).join('') + '<span class="a3-okn">' + ok + '/4</span></div><span style="flex:1"></span>' +
    (can ? a3Btn('a3-hold', 'Hold', 'আটকে রাখুন', {ic:'clock', attrs:' data-id="' + o.id + '"', kbd:'H'}) : '') +
    '<label class="a3-tog"><button type="button" class="a3-sw' + (u.next ? ' on' : '') + '" role="switch" aria-checked="' + u.next + '" data-act="a3-cqnext" aria-label="' + Le('Then open the next order', 'তারপর পরেরটা খুলুন') + '"></button><span>' + Le('Then open next', 'তারপর পরেরটা খুলুন') + '</span></label>' +
    (can ? '<button type="button" class="a3-btn pri lg" data-act="a3-conf" data-id="' + o.id + '"' + (a.ost !== 'PLACED' ? ' disabled' : '') + '>' + a2i('check', 17, 2.2) + '<span>' + Le('Confirm', 'কনফার্ম করুন') + '</span><kbd>Enter</kbd></button>' : '<span class="a3-abn">' + Le('Only staff who confirm orders can confirm', 'শুধু কনফার্মের অনুমতি যাদের আছে') + '</span>') + '</div>';
}
function a3Undo(){ var x = A3X.undo; if(!x || Date.now() - x.at > 8000) return ''; var l = a3CQList().filter(function(o){ return a3CQ().done.indexOf(o.id) < 0; });
  return '<div class="a3-undo" role="status"><span class="a3-uok">' + a2i('check', 15, 2.6) + '</span><span><b>' + esc(x.id) + Le(' confirmed', ' কনফার্ম হয়েছে') + '</b> · ' + Le('moved to packing', 'প্যাকিং তালিকায় গেছে') + (l.length ? ' · ' + Le('now the next one', 'এখন পরেরটা') : '') + '</span><button type="button" data-act="a3-undo">' + Le('Undo', 'ফিরিয়ে নিন') + '<kbd>Z</kbd></button></div>'; }
function a3ConfKeys(){ A3X.keys = {page:'/admin/orders/confirm', fn:function(ev){ var k = ev.key, u = a3CQ(), o = u.id ? a2Order(u.id) : null;
  if(k === 'j' || k === 'J'){ ACT['a3-cqn']({getAttribute:function(){ return '1'; }}); return true; }
  if(k === 'k' || k === 'K'){ ACT['a3-cqn']({getAttribute:function(){ return '-1'; }}); return true; }
  if((k === 'z' || k === 'Z') && A3X.undo){ ACT['a3-undo'](); return true; }
  if(!o || !a2Can('orders.confirm')) return false;
  if(k === 'Enter' && a2O(o).ost === 'PLACED' && !a3Risky(o) && !a2O(o).cancelReq && !ev.target.closest('button,a')){ a3DoConfirm(o); return true; }
  if((k === 'h' || k === 'H') && !a3Risky(o)){ ACT['a3-hold']({getAttribute:function(){ return o.id; }}); return true; }
  return false; }}; }
function a3ConfData(q){
  var u = a3CQ(); if(q.id && u._q !== q.id){ u.id = q.id; u._q = q.id; } if(q.chip && u._c !== q.chip){ u.chip = {call:'call', self:'self', newc:'newc', voice:'voice', cancel:'cancel'}[q.chip] || 'all'; u._c = q.chip; }
  var l = a3CQList(); if(!l.some(function(o){ return o.id === u.id; })){ var nd = l.filter(function(o){ return u.done.indexOf(o.id) < 0; }); u.id = nd.length ? nd[0].id : l.length ? l[0].id : null; }
  var o = u.id ? a2Order(u.id) : null, ids = l.map(function(x){ return x.id; });
  return {u:u, l:l, o:o, i:o ? ids.indexOf(o.id) : -1, waiting:l.filter(function(x){ return u.done.indexOf(x.id) < 0; }).length};
}
function a3ConfHead(o, d){ var a = a2O(o), st = a3OStatus(o);
  return '<div class="a3-dhd"><h1>' + esc(o.id) + '</h1><span class="a3-pill ' + (st.tone === 'warn' ? 'gold' : st.tone === 'bad' ? 'bad' : st.tone === 'ok' ? 'ok' : 'line') + '">' + Le(st.en, st.bn) + '</span><span class="a3-dsub">' + (a2day0(o.createdAt) === a2day0(Date.now()) ? Le('Today ', 'আজ ') : a2date(o.createdAt) + ' ') + a2hm(o.createdAt) + ' · ' + a2ago(o.createdAt) + L(' ago', ' আগে') + ' · ' + Le('from ', '') + esc(a3Src(o)) + Le('', ' থেকে') + '</span><span style="flex:1"></span>' +
    a3Guide('orders') + '<span class="a3-pos a3-num">' + (d.i + 1) + ' / ' + d.l.length + '</span><button type="button" class="a3-btn ic" data-act="a3-cqn" data-v="-1" aria-label="' + Le('Previous order (K)', 'আগেরটা (K)') + '"' + (d.i <= 0 ? ' disabled' : '') + '>' + a2i('cl', 17) + '</button><button type="button" class="a3-btn ic" data-act="a3-cqn" data-v="1" aria-label="' + Le('Next order (J)', 'পরেরটা (J)') + '"' + (d.i >= d.l.length - 1 ? ' disabled' : '') + '>' + a2i('cr', 17) + '</button>' + a3ConfMore(o) + '</div>'; }
function a3CautionCard(o){ var w = a3RiskWords(o), r = a2O(o).risk || {};
  return '<section class="a3-card a3-caution ' + (r.band === 'high' ? 'bad' : '') + '">' + a2i('shield', 20) + '<div><h2>' + (r.band === 'high' ? Le('High risk — ask for the full amount first', 'ঝুঁকি বেশি — আগে পুরো টাকা নিন') : Le('Careful — better to send it with an advance', 'সাবধান — অগ্রিম নিয়ে পাঠানো ভালো')) + '</h2><ul>' + (w.length ? w : [L('A risk rule matched this order', 'একটা ঝুঁকির নিয়মে মিলেছে')]).map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p>' + Le('Our own mistakes are not counted here. Nobody is blocked — you decide.', 'আমাদের ভুলে হওয়া ফেরত এখানে গোনা হয় না। কাউকে ব্লক করা হয় না — সিদ্ধান্ত আপনার।') + '</p></div></section>'; }
function a3ConfEmpty(dz){ return '<div class="a3-' + dz + ' a3-conf"><div class="a3-ph2"><div><h1>' + Le('To confirm', 'কনফার্ম বাকি') + '</h1><p class="a3-sub">' + Le('Nothing is waiting right now', 'এখন কিছু অপেক্ষায় নেই') + '</p></div><div class="a3-phr">' + a3OrdersMore() + '</div></div>' + a3Card({b:'<div class="a3-empty">' + a2i('check', 26) + '<b>' + Le('All confirmed', 'সব কনফার্ম হয়ে গেছে') + '</b><span>' + Le('New orders show up here by themselves. Prepaid orders skip this list.', 'নতুন অর্ডার নিজে থেকেই আসে। আগে পেইড অর্ডার এই তালিকায় আসে না।') + '</span><a class="a3-btn" href="#/admin/orders">' + Le('Open all orders', 'সব অর্ডার দেখুন') + '</a></div>'}) + '</div>'; }
function a3QueueCol(d){ var nf = a3OFCount() + (d.u.chip !== 'all' ? 1 : 0);
  return '<aside class="a3-q" aria-label="' + Le('Orders to confirm', 'কনফার্ম বাকি অর্ডার') + '"><div class="a3-qh"><div class="a3-qht"><h2>' + Le('To confirm', 'কনফার্ম বাকি') + ' <span class="a3-num">' + d.waiting + '</span></h2><button type="button" class="a3-btn sm' + (nf ? ' on' : '') + '" data-act="a2-dopen" data-d="a3cqf">' + a2i('filter', 15) + '<span>' + Le('Filter', 'ফিল্টার') + (nf ? ' · ' + nf : '') + '</span></button></div><p>' + (a2Set('orders.queueSort') === 'oldest' ? Le('Oldest first', 'পুরনোটা আগে') : Le('Newest first', 'নতুনটা আগে')) + Le(' · prepaid orders skip this list', ' · প্রিপেইড অর্ডার এখানে আসে না') + '</p></div><div class="a3-ql">' + a3QueueItems() + '</div><div class="a3-qf"><span><kbd>J</kbd><kbd>K</kbd>' + Le('up / down', 'উপর-নিচ') + '</span><span><kbd>Enter</kbd>' + Le('confirm', 'কনফার্ম') + '</span></div></aside>'; }
function a3PhoneQ(d){ return '<div class="a3-qph"><button type="button" class="a3-btn" data-act="a2-dopen" data-d="a3q">' + a2i('listv', 15) + '<span>' + Le('To confirm', 'কনফার্ম বাকি') + ' · ' + d.waiting + '</span></button><button type="button" class="a3-btn ic" data-act="a2-dopen" data-d="a3cqf" aria-label="' + Le('Filter', 'ফিল্টার') + '">' + a2i('filter', 16) + '</button></div>'; }

/* ---------- confirm · design B ---------- */
A3X.designs.orders.B.views.confirm = {render:function(p, q, ctx){
  a3ConfKeys(); var d = a3ConfData(q), o = d.o; if(!o) return a3ConfEmpty('B');
  var risky = a3Risky(o) && !a2O(o).cancelReq;
  var centre = risky ? a3CautionCard(o) + a3AdvCard(o) + a3ItemsCard(o, true) + a3AddrCard(o) : a3ItemsCard(o) + a3AddrCard(o);
  return '<div class="a3-B a3-conf">' + a3PhoneQ(d) + '<div class="a3-cgrid">' + a3QueueCol(d) + '<div class="a3-det">' + a3ConfHead(o, d) + '<div class="a3-dcols"><div class="a3-dmain">' + centre + '</div><div class="a3-dside">' + a3CustCard(o) + a3TLCard(o) + '</div></div>' + a3ConfBar(o) + '</div></div>' + a3Undo() + '</div>';
}};
/* ---------- confirm · design C: the decision sheet ---------- */
A3X.designs.orders.C.views.confirm = {render:function(p, q, ctx){
  a3ConfKeys(); var d = a3ConfData(q), o = d.o; if(!o) return a3ConfEmpty('C');
  var risky = a3Risky(o) && !a2O(o).cancelReq, ck = a3Checks(o), ok = ck.filter(function(c){ return c.t === 'ok'; }).length;
  var sheet = '<section class="a3-card a3-sheet"><div class="a3-sheeth"><div class="a3-ring" style="--p:' + (ok / 4 * 100) + '"><b class="a3-num">' + ok + '/4</b></div><div><h2>' + (risky ? Le('Decide how to send it', 'কীভাবে পাঠাবেন ঠিক করুন') : ok === 4 ? Le('Everything checks out — ready to confirm', 'সব ঠিক আছে — কনফার্ম করা যায়') : Le('Look at the open checks, then decide', 'বাকি চেকগুলো দেখে সিদ্ধান্ত নিন')) + '</h2><p>' + Le('Each check reads the same data as the order page', 'প্রতিটা চেক অর্ডার পেজের একই ডেটা পড়ে') + '</p></div></div><div class="a3-sheetg">' +
    ck.map(function(c){ return '<div class="a3-sc ' + c.t + '"><i>' + a2i(c.t === 'ok' ? 'check' : 'alert', 14, 2.4) + '</i><b>' + esc(c.en) + '</b><span>' + c.s + '</span></div>'; }).join('') + '</div></section>';
  var centre = (risky ? a3CautionCard(o) + a3AdvCard(o) : '') + '<div class="a3-two">' + a3ItemsCard(o, true) + a3AddrCard(o) + '</div>';
  var qtab = '<aside class="a3-q dense" aria-label="' + Le('Orders to confirm', 'কনফার্ম বাকি অর্ডার') + '"><div class="a3-qh"><div class="a3-qht"><h2>' + Le('Queue', 'লাইন') + ' <span class="a3-num">' + d.waiting + '</span></h2><button type="button" class="a3-btn ic sm" data-act="a2-dopen" data-d="a3cqf" aria-label="' + Le('Filter', 'ফিল্টার') + '">' + a2i('filter', 15) + '</button></div></div><div class="a3-ql">' + a3QueueItems(true) + '</div></aside>';
  return '<div class="a3-C a3-conf">' + a3PhoneQ(d) + '<div class="a3-cgrid">' + qtab + '<div class="a3-det">' + a3ConfHead(o, d) + sheet + '<div class="a3-dcols"><div class="a3-dmain">' + centre + '</div><div class="a3-dside">' + a3CustCard(o) + a3TLCard(o) + '</div></div>' + a3ConfBar(o) + '</div></div>' + a3Undo() + '</div>';
}};

a3Hook('/admin/orders', 'orders', 'list', {syn:'order list search phone tracking views filters'});
a3Hook('/admin/orders/confirm', 'orders', 'confirm', {syn:'confirm call queue one glance advance risky next'});
