/* =====================================================================
   97z-adm2-rd1-core.js — NEW EXTAS ADMIN · redesign layer (V12.4)
   1. Design registry: Dashboard, Orders and Products each have several
      designs (A = the V12.3 page kept as it was, B = the owner's mock-ups,
      C = the data-rich command center). A new design is one more
      a3Design(page, id, {…, views:{viewKey: render}}) call — nothing else.
      Picked per person (the page's "…" menu) or as the team default
      (Settings → Admin look). Default B. Every design reads the same data
      (a2M, a2Orders, x2Rows …) and runs the same commands (A2C, x2Publish).
   2. The new shell from the mock-ups: deep-green top bar, icon rail with
      labels on hover (expandable), the "To do" drawer behind the tasks
      button, "Ask AI", "View shop".
   3. Shared drawing kit: line / bar / stacked / spark / funnel / heat /
      waterfall charts as inline SVG with hover tooltips; product photos.
   Everything is scoped under .adm2 and every class is a3-*.
   ===================================================================== */
var A3X = {designs:{}, charts:{}, gid:0, keys:null};
(function(){
  var add = {gridv:'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', listv:'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', play:'M8 5.5v13l10.5-6.5z',
    grip:'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01', rail:'M4 4h16v16H4zM9.5 4v16', inbox:'M3.5 13.5h5l1.5 3h4l1.5-3h5M5.5 5h13l2 8.5V19h-17v-5.5z',
    undo:'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11', sort:'M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5', pulse:'M3 12h4l3-7 4 14 3-7h4',
    wa:'M20.5 11.5a8 8 0 0 1-11.7 7.1L3.5 20l1.4-4.9A8 8 0 1 1 20.5 11.5zM9 8.5c0 3.5 2.5 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2z',
    trend:'M3.5 17 9 11.5l4 4L20.5 8M15 8h5.5v5.5', target:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12h.01',
    palette:'M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.5.6.3 2.7-2.5 2.7zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01'};
  Object.keys(add).forEach(function(k){ if(!A2_IC[k]) A2_IC[k] = add[k]; });
  var d = {'look.dashboard':'B', 'look.orders':'B', 'look.products':'B', 'orders.advanceHours':2, 'orders.queueSort':'newest', 'products.view':'grid'};
  Object.keys(d).forEach(function(k){ if(A2_SET_DEF[k] === undefined) A2_SET_DEF[k] = d[k]; });
})();

/* ---------- 1. design registry ---------- */
var A3_PAGES = [['dashboard', 'Dashboard', 'ড্যাশবোর্ড', 'grid'], ['orders', 'Orders', 'অর্ডার', 'bag'], ['products', 'Products', 'প্রোডাক্ট', 'shirt']];
function a3Design(page, id, def){ def.id = id; def.views = def.views || {}; (A3X.designs[page] = A3X.designs[page] || {})[id] = def; return def; }
function a3Designs(page){ var o = A3X.designs[page] || {}; return Object.keys(o).sort().map(function(k){ return o[k]; }); }
function a3LookMe(){ var s = a2S(); if(!s.lookMe) s.lookMe = {}; if(!s.lookMe[s.role]) s.lookMe[s.role] = {}; return s.lookMe[s.role]; }
function a3Cur(page, q){
  var all = A3X.designs[page] || {}, pick = (q && q.design) || a3LookMe()[page] || a2Set('look.' + page) || 'B';
  return all[pick] ? pick : all.B ? 'B' : Object.keys(all)[0];
}
/* take over a route: the page that was there becomes design A of that page */
function a3Hook(path, page, view, meta){
  var old = A2.pages.filter(function(p){ return p.path === path; })[0];
  if(old && A3X.designs[page] && A3X.designs[page].A && !A3X.designs[page].A.views[view]) A3X.designs[page].A.views[view] = {render:old.render, after:old.after, skel:old.skel, empty:old.empty};
  var pick = function(ctx){ var d = a3Cur(page, ctx && ctx.q), D = A3X.designs[page][d]; return {id:d, v:D.views[view] || A3X.designs[page].B.views[view]}; };
  var def = Object.assign({}, old || {}, meta || {}, {path:path,
    render:function(p, q, ctx){ var k = pick(ctx), h = k.v.render(p, q, ctx); A3X.cur = {page:page, view:view, d:k.id, path:path}; return k.id === 'A' ? a3InjectMore(h, page) : h; },
    after:function(ctx){ var k = pick(ctx); if(k.v.after) k.v.after(ctx); },
    empty:function(ctx){ var k = pick(ctx); return k.v.empty ? k.v.empty(ctx) : a2State('empty', {t:L('Nothing here yet', 'এখানে এখনো কিছু নেই')}); }});
  Object.defineProperty(def, 'skel', {configurable:true, enumerable:true, get:function(){ var c = A2.ctx || {}; var k = pick(c); return k.v.skel || 'a3-' + page + '-' + k.id; }});
  a2Page(def);
}
/* design A keeps its page as it was; only the per-person switch is added to its header */
function a3InjectMore(h, page){ var btn = a3More(page, []); return h.indexOf('<div class="a2-phr">') >= 0 ? h.replace('<div class="a2-phr">', '<div class="a2-phr">' + btn) : '<div class="a3-afix">' + btn + '</div>' + h; }

/* the "…" menu on every redesigned page: the section's other pages, page actions, then the design switch */
function a3More(page, items, opt){
  opt = opt || {}; var open = UI.a2pop === 'a3m', cur = a3Cur(page, (A2.ctx || {}).q), mine = a3LookMe()[page];
  var mi = function(x){ if(x === '-') return '<div class="a2-hr" style="margin:6px 0"></div>'; if(x.h) return '<div class="a2-mh">' + Le(x.h, x.hb) + '</div>';
    var inner = (x.ic ? a2i(x.ic, 16) : '') + '<span>' + Le(x.en, x.bn) + '</span>' + (x.n ? '<em class="a3-mn">' + x.n + '</em>' : '');
    return x.href ? '<a class="a2-mi" role="menuitem" href="' + x.href + '">' + inner + '</a>' : '<button type="button" class="a2-mi" role="menuitem" data-act="' + x.act + '"' + (x.attrs || '') + '>' + inner + '</button>'; };
  var ds = a3Designs(page).map(function(D){ var on = D.id === cur; return '<button type="button" class="a2-mi a3-dmi' + (on ? ' on' : '') + '" role="menuitemradio" aria-checked="' + on + '" data-act="a3-design" data-pg="' + page + '" data-v="' + D.id + '"><span class="a3-dl">' + D.id + '</span><span>' + Le(D.en, D.bn) + '</span>' + (on ? a2i('check', 15) : '') + '</button>'; }).join('');
  var menu = '<div class="a2-menu a3-menu" role="menu">' + items.map(mi).join('') + (items.length ? '<div class="a2-hr" style="margin:6px 0"></div>' : '') +
    '<div class="a2-mh">' + Le('Page design (just for you)', 'পাতার ডিজাইন (শুধু আপনার জন্য)') + '</div>' + ds +
    (mine ? '<button type="button" class="a2-mi" data-act="a3-design" data-pg="' + page + '" data-v="">' + a2i('undo', 15) + '<span>' + Le('Use the team default', 'টিমের ডিফল্ট ব্যবহার করুন') + '</span></button>' : '') +
    (a2Can('settings.read') ? '<a class="a2-mi" href="#/admin/settings/look">' + a2i('palette', 15) + '<span>' + Le('All designs in Settings', 'সেটিংসে সব ডিজাইন') + '</span></a>' : '') + '</div>';
  return '<div class="a3-more' + (opt.cls ? ' ' + opt.cls : '') + '"><button type="button" class="a3-btn' + (opt.label ? '' : ' ic') + (opt.dark ? ' dk' : '') + '" data-act="a2-pop" data-p="a3m" aria-haspopup="menu" aria-expanded="' + open + '" aria-label="' + Le('More actions and page design', 'আরও কাজ আর পাতার ডিজাইন') + '" title="' + Le('More', 'আরও') + '">' + a2i('more', 18, 2.6) + (opt.label ? '<span>' + Le(opt.label[0], opt.label[1]) + '</span>' : '') + '</button>' +
    (open ? '<div class="a3-mpop" data-a2pop>' + menu + '</div>' : '') + '</div>';
}
/* the section's own pages as menu items (re-homed tabs) */
function a3SecItems(id, skip){ var s = a2Sec(id); if(!s) return []; var out = [{h:L(s.en, s.bn) + ' pages', hb:s.bn + 'র পাতা'}]; s.tabs.forEach(function(t){ if(skip && skip.indexOf(t.id) >= 0) return; if(!a2Can(t.perm) || (t.when && !t.when())) return; out.push({href:'#' + t.path, en:t.en, bn:t.bn, n:t.count ? t.count() : 0}); }); return out.length > 1 ? out : []; }
ACT['a3-design'] = function(el){ var pg = el.getAttribute('data-pg'), v = el.getAttribute('data-v'), me = a3LookMe(); if(v) me[pg] = v; else delete me[pg]; UI.a2pop = null; a2Log('Page design for ' + pg + ' → ' + (v || 'team default')); saveState();
  var D = v ? A3X.designs[pg][v] : null; if((A2.ctx || {}).q && A2.ctx.q.design){ go('#' + A2.ctx.path); } else rerender(); toast(D ? L('Design ' + v + ' · ' + D.en + ' — just for you', 'ডিজাইন ' + v + ' · ' + D.bn + ' — শুধু আপনার জন্য') : L('Back to the team default', 'টিমের ডিফল্টে ফেরানো হলো')); };
ACT['a3-design-team'] = function(el){ var pg = el.getAttribute('data-pg'), v = el.getAttribute('data-v'); a2SetV('look.' + pg, v); rerender(); toast(L('Team default for ' + pg + ' is now design ' + v, pg + '-এর টিম ডিফল্ট এখন ডিজাইন ' + v)); };

/* ---------- 2. shell ---------- */
function a3RailExp(){ return !!a2S().railExp; }
var A3_TODO_GROUP = {urgent:['Urgent', 'জরুরি'], confirm:['Orders', 'অর্ডার'], risk:['Orders', 'অর্ডার'], advance:['Orders', 'অর্ডার'], cancelreq:['Orders', 'অর্ডার'], voice:['Orders', 'অর্ডার'], cancelpend:['Orders', 'অর্ডার'], pack:['Orders', 'অর্ডার'],
  book:['Delivery', 'ডেলিভারি'], stuck:['Delivery', 'ডেলিভারি'], returns:['Stock & returns', 'স্টক আর রিটার্ন'], erpret:['Stock & returns', 'স্টক আর রিটার্ন'], erpfail:['Stock & returns', 'স্টক আর রিটার্ন'], qc:['Stock & returns', 'স্টক আর রিটার্ন'], low:['Stock & returns', 'স্টক আর রিটার্ন'],
  appr:['Money & approvals', 'টাকা আর অনুমোদন'], cod:['Money & approvals', 'টাকা আর অনুমোদন'], refund:['Money & approvals', 'টাকা আর অনুমোদন'], month:['Money & approvals', 'টাকা আর অনুমোদন'], msgs:['Messages', 'মেসেজ']};
var A3_MINE = {owner:['urgent', 'appr', 'risk', 'refund', 'month', 'cod'], manager:['confirm', 'risk', 'book', 'stuck', 'returns', 'cancelpend'], packer:['pack', 'qc', 'book'], support:['confirm', 'voice', 'cancelreq', 'msgs', 'returns'], accounts:['cod', 'refund', 'month', 'erpfail']};
function a3Later(){ var s = a2S(); if(!s.later) s.later = {}; return s.later; }
function a3Todo(){ var lt = a3Later(), now = Date.now(); return a2Queues().filter(function(t){ return !(lt[t.id] && lt[t.id] > now); }); }
function a3Shell(body, ctx){
  var role = a2Role(), sec = ctx.sec, S = a2S(), unread = S.ntf.filter(function(n){ return !n.read; }).length, todo = a3Todo().length, exp = a3RailExp();
  var cur = A3X.cur && ctx.page && A3X.cur.path === ctx.page.path ? A3X.cur : {};
  var item = function(s){
    if(!a2SecVisible(s)) return '';
    var on = sec && sec.id === s.id, tabs = s.tabs.filter(function(t){ return a2Can(t.perm) && (!t.when || t.when()); });
    var sub = tabs.length > 1 ? '<div class="a3-rsub">' + tabs.map(function(t){ var ton = on && ctx.page && ctx.page.tab === t.id; return '<a href="#' + t.path + '" class="' + (ton ? 'on' : '') + '"' + (ton ? ' aria-current="page"' : '') + '>' + Le(t.en, t.bn) + '</a>'; }).join('') + '</div>' : '';
    var fly = '<div class="a3-fly" role="tooltip"><a class="a3-flyh" href="#' + (s.home || s.base) + '">' + Le(s.en, s.bn) + '</a>' + (tabs.length > 1 ? tabs.map(function(t){ return '<a href="#' + t.path + '">' + Le(t.en, t.bn) + '</a>'; }).join('') : '') + '</div>';
    return '<div class="a3-nw' + (on ? ' on' : '') + '"><a class="a3-ni' + (on ? ' on' : '') + '" href="#' + (s.home || s.base) + '"' + (on ? ' aria-current="page"' : '') + ' aria-label="' + esc(L(s.en, s.bn)) + '">' + a2i(s.icon, 19) + '<span class="a3-nl">' + Le(s.en, s.bn) + '</span></a>' + fly + (on ? sub : '') + '</div>';
  };
  var nav = A2_GROUPS.map(function(g){ var items = A2.sections.filter(function(s){ return s.group === g[0]; }).map(item).join(''); return items ? '<div class="a3-ng" aria-hidden="true"></div>' + items : ''; }).join('');
  var foot = A2.sections.filter(function(s){ return s.group === 'bottom'; }).map(item).join('');
  var rail = '<aside class="a3-rail' + (exp ? ' exp' : '') + (UI.a2sb ? ' open' : '') + '" aria-label="' + Le('Admin sections', 'অ্যাডমিন সেকশন') + '">' +
    (UI.a2sb ? '<div class="a3-rbrand"><span class="a3-logo">E</span><b>EXTAS</b><button type="button" class="a3-btn ic gh" data-act="a2-sb" aria-label="' + Le('Close the menu', 'মেনু বন্ধ') + '">' + a2i('x', 18) + '</button></div>' : '') +
    '<nav class="a3-nav">' + nav + '</nav><div class="a3-rfoot">' + foot + (UI.a2sb ? '<div class="a3-racc">' + a2MeMenu() + '</div>' : '') +
    '<button type="button" class="a3-ni a3-rtog" data-act="a3-rail" aria-pressed="' + exp + '" aria-label="' + (exp ? Le('Collapse the menu', 'মেনু ছোট করুন') : Le('Expand the menu', 'মেনু বড় করুন')) + '" title="' + (exp ? Le('Collapse the menu', 'মেনু ছোট করুন') : Le('Expand the menu', 'মেনু বড় করুন')) + '">' + a2i('rail', 19) + '<span class="a3-nl">' + (exp ? Le('Collapse', 'ছোট করুন') : Le('Expand', 'বড় করুন')) + '</span></button></div></aside>' +
    (UI.a2sb ? '<div class="a3-scrim" data-act="a2-sb" aria-hidden="true"></div>' : '');
  var todoOn = !!UI['a2d:todo'], askOn = !!UI['a2d:ask'];
  var tb = '<header class="a3-tb">' +
    '<button type="button" class="a3-tbi a3-mb" data-act="a2-sb" aria-label="' + Le('Open the menu', 'মেনু খুলুন') + '">' + a2i('menu', 20) + '</button>' +
    '<a class="a3-brand" href="#/admin?home=1" aria-label="EXTAS admin home"><span class="a3-logo">E</span><span class="a3-wm">EXTAS</span></a>' +
    '<span class="a3-store" title="' + Le('One store until more stores are added', 'আরও দোকান যোগ না হওয়া পর্যন্ত একটাই দোকান') + '">' + a2i('store', 15) + '<b>' + esc(a2StoreName()) + '</b></span>' +
    '<button type="button" class="a3-srch" data-act="a2-pal" aria-label="' + Le('Search orders, phones, products or pages', 'অর্ডার, ফোন, প্রোডাক্ট বা পাতা খুঁজুন') + '">' + a2i('search', 16) + '<span><span class="a3-srl">' + Le('Search orders, phones, products or pages…', 'অর্ডার নম্বর, ফোন, প্রোডাক্ট বা পেজ খুঁজুন…') + '</span><span class="a3-srs">' + Le('Search…', 'খুঁজুন…') + '</span></span><kbd>Ctrl K</kbd></button>' +
    '<div class="a3-tbr">' +
      '<button type="button" class="a3-ask' + (askOn ? ' on' : '') + '" data-act="a2-dopen" data-d="ask" aria-label="' + Le('Ask AI', 'AI-কে জিজ্ঞেস') + '">' + a2i('spark', 16) + '<span>' + Le('Ask AI', 'AI-কে জিজ্ঞেস') + '</span></button>' +
      '<a class="a3-shop" href="#/" title="' + Le('Open the shop as a customer sees it', 'কাস্টমার যেভাবে দেখে সেভাবে দোকান খুলুন') + '">' + a2i('ext', 15) + '<span>' + Le('View shop', 'দোকান দেখুন') + '</span></a>' +
      '<button type="button" class="a3-tbi' + (todoOn ? ' on' : '') + '" data-act="a2-dopen" data-d="todo" aria-label="' + Le('To do', 'করণীয়') + (todo ? ', ' + todo + L(' lists waiting', 'টা তালিকায় কাজ') : '') + '" title="' + Le('To do (T)', 'করণীয় (T)') + '">' + a2i('inbox', 19) + (todo ? '<i class="a3-dot" aria-hidden="true"></i>' : '') + '</button>' +
      '<button type="button" class="a3-tbi" data-act="a2-pop" data-p="ntf" aria-label="' + Le('Notifications', 'নোটিফিকেশন') + (unread ? ', ' + unread + ' unread' : '') + '">' + a2i('bell', 19) + (unread ? '<i class="a3-dot r" aria-hidden="true"></i>' : '') + '</button>' +
      '<div class="a3-lang" role="group" aria-label="Admin language · অ্যাডমিনের ভাষা"><button type="button" class="' + (a2bn() ? '' : 'on') + '" data-act="a2-lang" data-v="en" aria-pressed="' + !a2bn() + '">EN</button><button type="button" class="' + (a2bn() ? 'on' : '') + '" data-act="a2-lang" data-v="bn" aria-pressed="' + a2bn() + '" lang="bn">বাং</button></div>' +
      '<button type="button" class="a3-av" data-act="a2-pop" data-p="me2" aria-haspopup="menu" aria-expanded="' + (UI.a2pop === 'me2') + '" aria-label="' + Le('Account', 'অ্যাকাউন্ট') + ' · ' + esc(role.person) + '">' + role.ini + '</button>' +
    '</div>' + (UI.a2pop === 'me2' ? '<div class="a2-tbpop a3-tbpop" data-a2pop>' + a2MeMenu() + '</div>' : '') + '</header>';
  var bn = function(href, ic, en, bnl, on){ return '<a href="' + href + '" class="' + (on ? 'on' : '') + '">' + a2i(ic, 21) + '<span>' + Le(en, bnl) + '</span></a>'; };
  var oSec = a2Sec('orders'), pSec = a2Sec('products');
  var bnav = '<nav class="a2-bnav a3-bnav" aria-label="' + Le('Quick menu', 'দ্রুত মেনু') + '">' + bn('#/admin?home=1', 'home', 'Home', 'হোম', sec && sec.id === 'dashboard') +
    (oSec && a2SecVisible(oSec) ? bn('#' + (oSec.home || oSec.base), 'bag', 'Orders', 'অর্ডার', sec && sec.id === 'orders') : '') +
    (pSec && a2SecVisible(pSec) ? bn('#' + pSec.base, 'shirt', 'Products', 'প্রোডাক্ট', sec && sec.id === 'products') : '') +
    '<button type="button" data-act="a2-dopen" data-d="todo" class="' + (todoOn ? 'on' : '') + '">' + a2i('inbox', 21) + '<span>' + Le('To do', 'করণীয়') + '</span>' + (todo ? '<i class="a3-dot" aria-hidden="true"></i>' : '') + '</button>' +
    '<button type="button" data-act="a2-sb">' + a2i('menu', 21) + '<span>' + Le('More', 'আরও') + '</span></button></nav>';
  var ntf = UI.a2pop === 'ntf' ? a2NtfDrawer() : '';
  return '<div class="adm2 a3s" translate="no" data-role="' + S.role + '" data-design="' + esc(cur.d || '') + '" lang="' + (a2bn() ? 'bn' : 'en') + '">' + tb + '<div class="a3-body">' + rail + '<main class="a2-ct a3-ct" id="main" tabindex="-1">' + body + '</main></div>' + bnav + ntf + (A2.drawer || a2DrawerOf() || '') + '</div>';
}
a2Shell = a3Shell;
ACT['a3-rail'] = function(){ var s = a2S(); s.railExp = !s.railExp; saveState(); rerender(); };
/* the rail's hover label: placed next to the icon (the rail itself may scroll) */
document.addEventListener('mouseover', function(ev){
  var w = ev.target.closest && ev.target.closest('.a3-rail:not(.exp):not(.open) .a3-nw'); if(!w) return;
  var f = w.querySelector('.a3-fly'), r = w.getBoundingClientRect(); if(!f) return;
  f.style.top = Math.max(8, Math.min(r.top, innerHeight - (f.offsetHeight || 200) - 8)) + 'px'; f.style.left = (r.right + 4) + 'px';
});

/* ---------- the "To do" drawer (replaces the on-page task lists) ---------- */
A2.drawers.todo = function(st){
  var tab = st.tab || 'all', all = a2Queues(), lt = a3Later(), now = Date.now(), role = a2S().role;
  var later = all.filter(function(t){ return lt[t.id] && lt[t.id] > now; }), open = all.filter(function(t){ return !(lt[t.id] && lt[t.id] > now); });
  var mine = open.filter(function(t){ return (A3_MINE[role] || []).indexOf(t.id) >= 0; });
  var list = tab === 'mine' ? mine : tab === 'later' ? later : open;
  var groups = [], seen = {};
  list.forEach(function(t){ var g = A3_TODO_GROUP[t.id] || ['Other', 'অন্যান্য']; if(!seen[g[0]]){ seen[g[0]] = {g:g, items:[]}; groups.push(seen[g[0]]); } seen[g[0]].items.push(t); });
  var order = ['Urgent', 'Orders', 'Delivery', 'Stock & returns', 'Money & approvals', 'Messages', 'Other']; groups.sort(function(a, b){ return order.indexOf(a.g[0]) - order.indexOf(b.g[0]); });
  var first = null; groups.some(function(g){ if(g.g[0] !== 'Urgent' && g.items.length){ first = g.items[0].id; return true; } return false; });
  var row = function(t){ var hot = t.id === first && tab !== 'later';
    return '<div class="a3-td' + (hot ? ' hot' : '') + '"><span class="a3-tdi ' + t.tone + '">' + a2i(t.icon, 17) + '</span><a class="a3-tdt" href="#' + t.href + '" data-act="a3-todo-go"><b>' + Le(t.t, t.tb) + '</b><span>' + esc(L(t.sub, t.subBn)) + '</span></a>' +
      (hot ? '<a class="a3-btn pri sm" href="#' + t.href + '" data-act="a3-todo-go">' + Le('Start', 'শুরু করুন') + a2i('cr', 15) + '</a>' : '<span class="a3-tda">' + a2ago(t.oldest) + '</span>') +
      '<button type="button" class="a3-btn ic gh sm" data-act="a3-later" data-id="' + t.id + '" aria-label="' + (tab === 'later' ? Le('Bring back now', 'এখনই ফেরান') : Le('Look at it later (3 hours)', 'পরে দেখব (3 ঘণ্টা)')) + '" title="' + (tab === 'later' ? Le('Bring back now', 'এখনই ফেরান') : Le('Later (3 h)', 'পরে (3 ঘণ্টা)')) + '">' + a2i(tab === 'later' ? 'undo' : 'clock', 15) + '</button></div>'; };
  var tabs = '<div class="a3-seg" role="tablist">' + [['all', 'All', 'সব', open.length], ['mine', 'Mine', 'আমার', mine.length], ['later', 'Later', 'পরে দেখব', later.length]].map(function(x){ return '<button type="button" role="tab" aria-selected="' + (tab === x[0]) + '" class="' + (tab === x[0] ? 'on' : '') + '" data-act="a3-todo-tab" data-v="' + x[0] + '">' + Le(x[1], x[2]) + '<i>' + x[3] + '</i></button>'; }).join('') + '</div>';
  var body = tabs + (groups.length ? groups.map(function(g){ return '<div class="a3-tdg' + (g.g[0] === 'Urgent' ? ' bad' : '') + '">' + Le(g.g[0], g.g[1]) + '</div>' + g.items.map(row).join(''); }).join('') :
    '<div class="a3-empty">' + a2i('check', 22) + '<b>' + (tab === 'later' ? Le('Nothing put aside', 'পরে দেখার কিছু নেই') : Le('All clear', 'সব কাজ শেষ')) + '</b><span>' + (tab === 'later' ? Le('Use the clock on a task to look at it in 3 hours.', 'কোনো কাজের ঘড়ি চাপলে সেটা 3 ঘণ্টা পরে ফিরে আসে।') : Le('New work shows up here by itself, most urgent first.', 'নতুন কাজ নিজে থেকেই এখানে আসে, জরুরিটা আগে।')) + '</span></div>');
  return a2Drawer({title:L('What to do now', 'এখন যা করতে হবে'), sub:Le(open.length + ' lists · most urgent first · a task leaves by itself when it is done', open.length + 'টা কাজ · জরুরিটা সবার আগে · কাজ শেষ হলে নিজে থেকেই সরে যায়'), body:body, close:'a2-drw-x', closeData:' data-k="a2d:todo"',
    foot:'<span class="a3-kh"><kbd>T</kbd>' + Le('opens this from any page', 'চাপলে যেকোনো পেজ থেকে খোলে') + '</span>' + (a2Can('ai.read') ? '<a class="a3-lnk" href="#/admin/ai/agents/telegram">' + a2i('bell', 15) + Le('What gets sent to Telegram', 'Telegram-এ কী কী জানাবে') + '</a>' : '')});
};
ACT['a3-todo-tab'] = function(el){ UI['a2d:todo'].tab = el.getAttribute('data-v'); rerender(); };
ACT['a3-todo-go'] = function(el){ var h = el.getAttribute('href'); UI['a2d:todo'] = null; A2.drawerOpen = false; go(h); };
ACT['a3-later'] = function(el){ var id = el.getAttribute('data-id'), lt = a3Later(); if(lt[id] && lt[id] > Date.now()){ delete lt[id]; toast(L('Back in the list', 'আবার তালিকায়')); } else { lt[id] = Date.now() + 3 * A2.H; toast(L('Put aside for 3 hours', '3 ঘণ্টার জন্য সরিয়ে রাখা হলো')); } saveState(); rerender(); };

/* ---------- Ask AI ---------- */
A2.drawers.ask = function(st){
  var h = st.h || [], off = typeof a2bAIOff === 'function' ? a2bAIOff() : true;
  var ex = [['Why are sales down this week?', 'এই সপ্তাহে বিক্রি কম কেন?'], ['Which courier is failing most?', 'কোন কুরিয়ার সবচেয়ে বেশি ফেল করছে?'], ['What is waiting for me?', 'আমার জন্য কী বাকি আছে?']];
  var body = (off ? '<div class="a3-note">' + a2i('info', 15) + '<span>' + Le('AI is off, so answers come straight from your shop data. Turn AI on in AI Center for written explanations.', 'AI বন্ধ, তাই উত্তর আসে সরাসরি দোকানের ডেটা থেকে। লেখা ব্যাখ্যার জন্য AI Center-এ AI চালু করুন।') + '</span></div>' : '') +
    '<form class="a3-askf" data-submit="a3-ask"><label class="a2-sr" for="a3-askq">' + Le('Your question', 'আপনার প্রশ্ন') + '</label><input id="a3-askq" name="q" class="a2-inp" autocomplete="off" placeholder="' + esc(L('Ask about sales, couriers, stock, orders…', 'বিক্রি, কুরিয়ার, স্টক, অর্ডার নিয়ে জিজ্ঞেস করুন…')) + '"><button type="submit" class="a3-btn pri">' + a2i('send', 15) + Le('Ask', 'জিজ্ঞেস') + '</button></form>' +
    '<div class="a3-chips">' + ex.map(function(x){ return '<button type="button" class="a3-chip" data-act="a3-askx" data-q="' + esc(L(x[0], x[1])) + '">' + Le(x[0], x[1]) + '</button>'; }).join('') + '</div>' +
    (h.length ? h.map(function(x){ return '<div class="a3-aqa"><div class="a3-aq">' + esc(x.q) + '</div><div class="a3-aa">' + x.a.map(function(p){ return '<p>' + p + '</p>'; }).join('') + '</div></div>'; }).join('') : '<div class="a3-empty sm">' + a2i('spark', 20) + '<span>' + Le('Answers use the same numbers as your dashboard. Nothing is changed or sent from here.', 'উত্তর ড্যাশবোর্ডের একই সংখ্যা থেকে আসে। এখান থেকে কিছু বদলায় বা পাঠানো হয় না।') + '</span></div>');
  return a2Drawer({title:L('Ask AI', 'AI-কে জিজ্ঞেস'), sub:Le('Plain answers from your shop data', 'দোকানের ডেটা থেকে সহজ উত্তর'), body:body, close:'a2-drw-x', closeData:' data-k="a2d:ask"', foot:a2Can('ai.read') ? '<a class="a3-lnk" href="#/admin/ai/agents/chief">' + Le('Open the full chat in AI Center', 'AI Center-এ পুরো চ্যাট খুলুন') + a2i('cr', 14) + '</a>' : ''});
};
function a3AskRun(q){ q = String(q || '').trim(); if(!q) return; var st = UI['a2d:ask'] || (UI['a2d:ask'] = {v:1}); var a = typeof a2bAnswer === 'function' ? a2bAnswer(q) : [esc(L('Delivered sales this week: ', 'এই সপ্তাহের ডেলিভারি বিক্রি: ') + a2tk(a2M(7).sales))]; st.h = [{q:q, a:a}].concat(st.h || []).slice(0, 6); a2Log('Asked AI: ' + q); rerender(); }
SUBMIT['a3-ask'] = function(f){ a3AskRun(f.querySelector('[name=q]').value); };
ACT['a3-askx'] = function(el){ a3AskRun(el.getAttribute('data-q')); };

/* keyboard: T opens the to-do drawer anywhere; pages may add their own keys (A3X.keys) */
document.addEventListener('keydown', function(ev){
  if(!CUR || CUR.page !== 'adm2' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  var t = ev.target || {}, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || t.isContentEditable;
  if(typing || document.querySelector('.a2-ov') || document.querySelector('.modal-back')) return;
  if(A3X.keys && A3X.keys.page === (A2.ctx || {}).path && !A2.drawerOpen && !UI.a2pop){ if(A3X.keys.fn(ev) === true){ ev.preventDefault(); return; } }
  if((ev.key === 't' || ev.key === 'T') && !UI['a2d:todo']){ ev.preventDefault(); a2CloseDrawers(); UI['a2d:todo'] = {v:1}; rerender(); }
});

/* ---------- 3. drawing kit ---------- */
function a3Tip(){ var t = document.getElementById('a3-tip'); if(!t){ t = document.createElement('div'); t.id = 'a3-tip'; t.className = 'a3-tip'; t.setAttribute('role', 'status'); document.body.appendChild(t); } return t; }
function a3TipAt(html, x, y){ var t = a3Tip(); t.innerHTML = html; t.style.display = 'block'; var w = t.offsetWidth, h = t.offsetHeight, l = x + 14, tp = y - h - 12; if(l + w > innerWidth - 8) l = x - w - 14; if(tp < 8) tp = y + 16; t.style.left = Math.max(8, l) + 'px'; t.style.top = tp + 'px'; }
function a3TipOff(){ var t = document.getElementById('a3-tip'); if(t) t.style.display = 'none'; }
document.addEventListener('mousemove', function(ev){
  var p = ev.target.closest && ev.target.closest('[data-a3c]');
  if(p){ var c = A3X.charts[p.getAttribute('data-a3c')]; if(!c) return; var r = p.getBoundingClientRect(), n = c.labels.length, i = c.bars ? Math.floor((ev.clientX - r.left) / r.width * n) : Math.round((ev.clientX - r.left) / r.width * (n - 1)); i = Math.max(0, Math.min(n - 1, i));
    var g = p.querySelector('.a3-cg'); if(g){ g.style.display = 'block'; g.style.left = (c.bars ? (i + .5) / n * 100 : n > 1 ? i / (n - 1) * 100 : 50) + '%'; }
    var d = p.querySelector('.a3-cd'); if(d && c.dot){ var v = c.dot[i]; d.style.display = 'block'; d.style.left = (n > 1 ? i / (n - 1) * 100 : 50) + '%'; d.style.top = (100 - v / c.max * 100) + '%'; }
    a3TipAt('<b>' + esc(c.labels[i]) + '</b>' + c.series.map(function(s){ return '<span><i style="background:' + s.c + '"></i>' + esc(s.name) + '<em>' + (s.fmt || c.fmt)(s.v[i]) + '</em></span>'; }).join('') + (c.foot ? '<small>' + c.foot(i) + '</small>' : ''), ev.clientX, ev.clientY); return; }
  var q = ev.target.closest && ev.target.closest('[data-tip]');
  if(q && q.closest('.adm2')){ a3TipAt(q.getAttribute('data-tip'), ev.clientX, ev.clientY); return; }
  if(document.getElementById('a3-tip') && document.getElementById('a3-tip').style.display === 'block'){ a3TipOff(); document.querySelectorAll('.a3-cg,.a3-cd').forEach(function(e){ e.style.display = 'none'; }); }
});
window.addEventListener('scroll', a3TipOff, true);
window.addEventListener('hashchange', a3TipOff);
function a3Nice(max, n){ if(!(max > 0)) return {max:1, step:1}; var raw = max / (n || 4), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, s = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; return {max:Math.ceil(max / s) * s, step:s}; }
function a3K(v){ v = +v || 0; var a = Math.abs(v); return a >= 100000 ? '৳' + (v / 100000).toFixed(a >= 1000000 ? 0 : 1).replace(/\.0$/, '') + L('L', 'লা') : a >= 1000 ? '৳' + Math.round(v / 1000) + 'k' : '৳' + Math.round(v); }
function a3XLabels(labels, every){ var n = labels.length, out = ''; every = every || Math.max(1, Math.ceil(n / 6)); for(var i = 0; i < n; i += every){ out += '<span style="left:' + (n > 1 ? i / (n - 1) * 100 : 50) + '%">' + esc(labels[i]) + '</span>'; } if((n - 1) % every && n > 1) out += '<span class="e" style="left:100%">' + esc(labels[n - 1]) + '</span>'; return out; }
/* line / area chart: o = {labels, series:[{v, c, name, area, dash, w}], fmt, h, yfmt, ticks, foot(i)} */
function a3Line(o){
  var id = 'c' + (++A3X.gid), H = 100, n = o.labels.length, all = []; o.series.forEach(function(s){ all = all.concat(s.v); });
  var sc = a3Nice(Math.max.apply(null, all.concat([1])) * 1.05, o.ticks || 3), max = sc.max;
  var x = function(i){ return n > 1 ? i / (n - 1) * 1000 : 500; }, y = function(v){ return H - (v / max) * H; };
  var paths = o.series.map(function(s, k){ var pts = s.v.map(function(v, i){ return [x(i), y(v || 0)]; }), d = a2Smooth(pts);
    return (s.area ? '<path d="' + d + ' L1000,' + H + ' L0,' + H + ' Z" fill="url(#' + id + 'g' + k + ')"/>' : '') + '<path d="' + d + '" fill="none" stroke="' + s.c + '" stroke-width="' + (s.w || 2) + '"' + (s.dash ? ' stroke-dasharray="5 5"' : '') + ' stroke-linecap="round" vector-effect="non-scaling-stroke"/>'; }).join('');
  var grads = o.series.map(function(s, k){ return s.area ? '<linearGradient id="' + id + 'g' + k + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + s.c + '" stop-opacity=".16"/><stop offset="1" stop-color="' + s.c + '" stop-opacity="0"/></linearGradient>' : ''; }).join('');
  var grid = '', yl = ''; for(var v = 0; v <= max + 1e-9; v += sc.step){ grid += '<line x1="0" x2="1000" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + (v ? '#EEEAE1' : '#DCD6CA') + '" vector-effect="non-scaling-stroke"' + (v ? ' stroke-dasharray="2 4"' : '') + '/>'; yl += '<span style="top:' + (y(v) / H * 100) + '%">' + (o.yfmt || a3K)(v) + '</span>'; }
  var last = o.series[o.series.length - 1], lv = last.v[n - 1] || 0;
  A3X.charts[id] = {labels:o.labels, series:o.series, fmt:o.fmt || a2tk, dot:o.series[o.dotS || o.series.length - 1].v, max:max, foot:o.foot};
  return '<div class="a3-chart" style="height:' + (o.h || 220) + 'px" role="img" aria-label="' + esc(o.label || '') + '"><div class="a3-cy" aria-hidden="true">' + yl + '</div><div class="a3-cp" data-a3c="' + id + '"><svg viewBox="0 0 1000 ' + H + '" preserveAspectRatio="none" aria-hidden="true"><defs>' + grads + '</defs>' + grid + paths + '</svg>' +
    (o.endDot !== false ? '<i class="a3-ce" style="left:100%;top:' + (y(lv) / H * 100) + '%;border-color:' + last.c + '"></i>' : '') + '<i class="a3-cg"></i><i class="a3-cd" style="border-color:' + (o.series[o.dotS || o.series.length - 1].c) + '"></i></div><div class="a3-cx" aria-hidden="true">' + a3XLabels(o.xl || o.labels, o.every) + '</div></div>';
}
/* bars (stacked when several series): o = {labels, series:[{v, c, name}], fmt, h, line:{v, c, name}} */
function a3Bars(o){
  var id = 'c' + (++A3X.gid), n = o.labels.length, H = 100, tot = o.labels.map(function(l, i){ return o.series.reduce(function(s, x){ return s + (x.v[i] || 0); }, 0); });
  var sc = a3Nice(Math.max.apply(null, tot.concat([1])) * 1.05, o.ticks || 3), max = sc.max, bw = 1000 / n, gap = Math.min(bw * .34, 14);
  var rects = ''; for(var i = 0; i < n; i++){ var acc = 0; o.series.forEach(function(s, k){ var v = s.v[i] || 0; if(!v) return; var h = v / max * H; rects += '<rect x="' + (i * bw + gap / 2).toFixed(2) + '" y="' + (H - acc - h).toFixed(2) + '" width="' + (bw - gap).toFixed(2) + '" height="' + h.toFixed(2) + '" fill="' + s.c + '"' + (k === o.series.length - 1 || o.series.length === 1 ? ' rx="0"' : '') + '/>'; acc += h; }); }
  var line = ''; if(o.line){ var lm = Math.max.apply(null, o.line.v.concat([1])) * 1.1; line = '<path d="' + a2Smooth(o.line.v.map(function(v, i){ return [(i + .5) * bw, H - v / lm * H]; })) + '" fill="none" stroke="' + o.line.c + '" stroke-width="2" vector-effect="non-scaling-stroke"/>'; }
  var grid = '', yl = ''; for(var v = 0; v <= max + 1e-9; v += sc.step){ var yy = H - v / max * H; grid += '<line x1="0" x2="1000" y1="' + yy + '" y2="' + yy + '" stroke="' + (v ? '#EEEAE1' : '#DCD6CA') + '" vector-effect="non-scaling-stroke"' + (v ? ' stroke-dasharray="2 4"' : '') + '/>'; yl += '<span style="top:' + (yy / H * 100) + '%">' + (o.yfmt || a3K)(v) + '</span>'; }
  var ser = o.series.slice(); if(o.line) ser.push({v:o.line.v, c:o.line.c, name:o.line.name, fmt:o.line.fmt});
  A3X.charts[id] = {labels:o.labels, series:ser, fmt:o.fmt || a2tk, bars:true, foot:o.foot};
  var xl = ''; var every = o.every || Math.max(1, Math.ceil(n / 6)); for(var j = 0; j < n; j += every) xl += '<span style="left:' + ((j + .5) / n * 100) + '%">' + esc((o.xl || o.labels)[j]) + '</span>';
  return '<div class="a3-chart" style="height:' + (o.h || 200) + 'px" role="img" aria-label="' + esc(o.label || '') + '"><div class="a3-cy" aria-hidden="true">' + yl + '</div><div class="a3-cp" data-a3c="' + id + '"><svg viewBox="0 0 1000 ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + grid + rects + line + '</svg><i class="a3-cg bar" style="width:' + (100 / n) + '%"></i></div><div class="a3-cx" aria-hidden="true">' + xl + '</div></div>';
}
function a3Spark(vals, c, w, h, area){
  vals = (vals || []).map(function(v){ return +v || 0; }); if(vals.length < 2) vals = [0, 0]; w = w || 120; h = h || 36; c = c || '#2F6550';
  var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals), rg = mx - mn || 1, pts = vals.map(function(v, i){ return [i / (vals.length - 1) * (w - 4) + 2, h - 3 - (v - mn) / rg * (h - 8)]; }), d = a2Smooth(pts), g = 'sp' + (++A3X.gid), lp = pts[pts.length - 1];
  return '<svg class="a3-spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' + (area !== false ? '<defs><linearGradient id="' + g + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + c + '" stop-opacity=".18"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></linearGradient></defs><path d="' + d + ' L' + (w - 2) + ',' + h + ' L2,' + h + ' Z" fill="url(#' + g + ')"/>' : '') + '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linecap="round"/><circle cx="' + lp[0].toFixed(1) + '" cy="' + lp[1].toFixed(1) + '" r="2.6" fill="' + c + '"/></svg>';
}
function a3Delta(x, o){ o = o || {}; if(x == null || !isFinite(x)) return '<span class="a3-dl0">—</span>'; var up = x >= 0, good = o.good === 'down' ? !up : up; var txt = o.pts ? Math.abs(x * 100).toFixed(1) + L(' pts', ' পয়েন্ট') : o.raw ? o.raw : Math.abs(x * 100).toFixed(1) + '%'; return '<span class="a3-dlt ' + (good ? 'g' : 'b') + '">' + (up ? '▲' : '▼') + ' ' + txt + '</span>'; }
function a3Bar(p, tone){ return '<span class="a3-bar' + (tone ? ' ' + tone : '') + '"><i style="width:' + Math.max(1.5, Math.min(100, p * 100)).toFixed(1) + '%"></i></span>'; }
/* product photo (the shop's own garment drawing on a tinted ground; a real uploaded photo wins) */
function a3Ph(pid, color, o){
  o = o || {}; var p = P(pid) || (typeof x2Prod === 'function' && x2Prod(pid) ? x2Prod(pid).p : null); if(!p) return '<span class="a3-ph" style="background:#ECE8E0"></span>';
  var c = COL(color || (p.colors || [])[0] || 'navy'), cat = CAT(p.cat) || {garment:'tee'}, bg = mixHex(c.hex, '#EFEDE8', isLight(c.hex) ? .55 : .82);
  var ph = p.photos && p.photos[color || p.colors[0]] && p.photos[color || p.colors[0]][o.view || 'front'];
  return '<span class="a3-ph' + (o.cls ? ' ' + o.cls : '') + '" style="background:' + bg + '">' + (ph && ph.src ? '<img src="' + esc(ph.src) + '" alt="" loading="lazy">' : garmentSVG(p.garment || cat.garment, c.hex, o.view || 'front')) + (o.inner || '') + '</span>';
}
function a3Funnel(steps){ var top = steps[0] ? steps[0].n || 1 : 1;
  return '<div class="a3-fun">' + steps.map(function(s, i){ var p = s.n / top, prev = i ? steps[i - 1].n : null; return '<a class="a3-fs" href="' + (s.href || '#') + '"' + (s.href ? '' : ' tabindex="-1"') + '><div class="a3-fh"><span>' + esc(s.l) + '</span><b class="a3-num">' + a2n(s.n) + '</b></div><div class="a3-fb"><i style="width:' + Math.max(2, p * 100).toFixed(1) + '%;background:' + (s.c || '#2F6550') + '"></i></div><div class="a3-fn">' + (prev ? (prev ? Math.round(s.n / prev * 100) : 0) + L('% of the step before', '% আগের ধাপের') : L('placed in this period', 'এই সময়ে এসেছে')) + (s.note ? ' · ' + s.note : '') + '</div></a>'; }).join('') + '</div>'; }
function a3Heat(rows, cols, o){ o = o || {}; var mx = 0; rows.forEach(function(r){ r.v.forEach(function(v){ mx = Math.max(mx, v); }); }); mx = mx || 1;
  return '<div class="a3-heat" style="grid-template-columns:' + (o.lw || 44) + 'px repeat(' + cols.length + ',minmax(0,1fr))"><span></span>' + cols.map(function(c, i){ return '<span class="a3-hx">' + (i % (o.every || 1) ? '' : esc(c)) + '</span>'; }).join('') +
    rows.map(function(r){ return '<span class="a3-hy">' + esc(r.l) + '</span>' + r.v.map(function(v, i){ var a = v / mx; return '<i style="background:' + (v ? 'rgba(31,107,84,' + (.1 + a * .85).toFixed(2) + ')' : '#F1EEE7') + '" data-tip="' + esc('<b>' + r.l + ' · ' + cols[i] + '</b><span>' + (o.fmt ? o.fmt(v) : v) + '</span>') + '"></i>'; }).join(''); }).join('') + '</div>'; }
function a3Skel(kind){
  var b = function(w, h, r){ return '<i class="a2-skel" style="display:block;width:' + w + ';height:' + h + 'px' + (r ? ';border-radius:' + r + 'px' : '') + '"></i>'; };
  var card = function(inner, cls){ return '<div class="a3-card a3-sk' + (cls ? ' ' + cls : '') + '">' + inner + '</div>'; };
  var head = '<div class="a3-ph2">' + '<div>' + b('220px', 28, 8) + '<div style="height:8px"></div>' + b('320px', 14) + '</div></div>';
  var tiles = function(n){ var s = ''; for(var i = 0; i < n; i++) s += card(b('46%', 12) + '<div style="height:12px"></div>' + b('62%', 28) + '<div style="height:12px"></div>' + b('80%', 10)); return '<div class="a3-skrow" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))">' + s + '</div>'; };
  var rows = ''; for(var i = 0; i < 8; i++) rows += '<div class="a3-skr">' + b('18px', 18, 5) + b('14%', 13) + b('18%', 13) + b('24%', 13) + b('10%', 13) + b('14%', 13) + '</div>';
  if(/dashboard/.test(kind)) return '<div aria-busy="true" aria-label="' + Le('Loading', 'লোড হচ্ছে') + '">' + head + (/-C$/.test(kind) ? tiles(6) : '') + '<div class="a3-skrow" style="grid-template-columns:2fr 1fr">' + card(b('30%', 14) + '<div style="height:14px"></div>' + b('100%', 220, 10)) + card(b('50%', 14) + '<div style="height:14px"></div>' + b('100%', 60) + '<div style="height:10px"></div>' + b('100%', 60) + '<div style="height:10px"></div>' + b('100%', 60)) + '</div>' + tiles(4) + '</div>';
  if(/products/.test(kind)){ var g = ''; for(var j = 0; j < 8; j++) g += card(b('100%', 180, 10) + '<div style="height:12px"></div>' + b('70%', 14) + '<div style="height:8px"></div>' + b('40%', 12), 'p'); return '<div aria-busy="true">' + head + '<div class="a3-skrow" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">' + g + '</div></div>'; }
  return '<div aria-busy="true" aria-label="' + Le('Loading', 'লোড হচ্ছে') + '">' + head + '<div class="a3-skbar">' + b('380px', 36, 10) + b('220px', 36, 10) + '</div>' + card(rows, 'flush') + '</div>';
}
(function(){ var s0 = a2Skeleton; a2Skeleton = function(kind){ return /^a3-/.test(String(kind || '')) ? a3Skel(kind) : s0(kind); }; })();
/* small shared bits */
function a3Btn(act, en, bn, o){ o = o || {}; return '<button type="button" class="a3-btn' + (o.cls ? ' ' + o.cls : '') + '" data-act="' + act + '"' + (o.attrs || '') + (o.dis ? ' disabled' : '') + (o.tip ? ' title="' + esc(o.tip) + '"' : '') + '>' + (o.ic ? a2i(o.ic, o.is || 16) : '') + (en ? '<span>' + Le(en, bn) + '</span>' : '') + (o.kbd ? '<kbd>' + o.kbd + '</kbd>' : '') + '</button>'; }
function a3A(href, en, bn, o){ o = o || {}; return '<a class="a3-btn' + (o.cls ? ' ' + o.cls : '') + '" href="' + href + '"' + (o.attrs || '') + '>' + (o.ic ? a2i(o.ic, o.is || 16) : '') + '<span>' + Le(en, bn) + '</span></a>'; }
function a3Seg(act, cur, opts, label, attrs){ return '<div class="a3-seg" role="group" aria-label="' + esc(label || '') + '">' + opts.map(function(o){ var on = String(cur) === String(o[0]); return '<button type="button" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '" data-act="' + act + '" data-v="' + esc(o[0]) + '"' + (attrs || '') + '>' + (o[3] ? a2i(o[3], 15) : '') + (o[1] ? '<span>' + Le(o[1], o[2]) + '</span>' : '') + (o[4] != null ? '<i>' + o[4] + '</i>' : '') + '</button>'; }).join('') + '</div>'; }
function a3Fresh(){ return '<span class="a3-live">' + Le('Courier data up to ', 'কুরিয়ার ডেটা ') + a2hm(Date.now() - 11 * 60000) + Le(' · ERP up to ', ' আর ERP ') + a2hm(Date.now() - 4 * 60000) + Le('', ' পর্যন্ত') + '</span>'; }
function a3Init(name){ return String(name || '?').split(/\s+/).map(function(w){ return w[0]; }).slice(0, 2).join('').toUpperCase(); }
function a3Card(o){ return '<section class="a3-card' + (o.cls ? ' ' + o.cls : '') + '"' + (o.id ? ' id="' + o.id + '"' : '') + '>' + (o.t ? '<div class="a3-chd"><div><h2>' + o.t + '</h2>' + (o.s ? '<p>' + o.s + '</p>' : '') + '</div>' + (o.r || '') + '</div>' : '') + '<div class="a3-cb">' + o.b + '</div></section>'; }
function a3Guide(sec){ return '<button type="button" class="a2-guide a3-guide" data-act="a2-guide" data-s="' + sec + '" lang="bn" title="এই সেকশনে কী করা যায়">' + a2i('book', 16) + '<span>এই সেকশনে কী করা যায়</span></button>'; }
function a3Lnk(href, en, bn){ return '<a class="a3-lnk" href="' + href + '">' + Le(en, bn) + a2i('cr', 14) + '</a>'; }

/* ---------- Settings → Admin look ---------- */
(function(){
  var s = a2Sec('settings'); if(s && !s.tabs.some(function(t){ return t.id === 'look'; })){ var i = s.tabs.map(function(t){ return t.id; }).indexOf('keys'); s.tabs.splice(i >= 0 ? i + 1 : s.tabs.length, 0, {id:'look', en:'Admin look', bn:'অ্যাডমিনের চেহারা', path:'/admin/settings/look', perm:'settings.read'}); }
  if(typeof a2RegSetting === 'function') a2RegSetting('admin-look', 'Admin look · page designs', 'অ্যাডমিনের চেহারা · পাতার ডিজাইন', '/admin/settings/look', 'Settings › Admin look', 'design layout theme dashboard orders products look style switch');
})();
function a3Thumb(page, id){
  var B = {A:{bg:'#F6F4EF', side:'#12302A', top:null, ink:'#1F4E46', acc:'#C9A14A'}, B:{bg:'#F7F5F0', side:'#F1EEE6', top:'#1D3B2F', ink:'#2F6550', acc:'#B8913F'}, C:{bg:'#F4F5F2', side:'#F1EEE6', top:'#1D3B2F', ink:'#1F6B54', acc:'#4C6A92'}}[id] || {bg:'#F6F4EF', side:'#E8E3D8', top:'#1D3B2F', ink:'#2F6550', acc:'#B8913F'};
  var r = function(x, y, w, h, f, rx){ return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx == null ? 3 : rx) + '" fill="' + f + '"/>'; };
  var g = r(0, 0, 240, 150, B.bg, 0) + (B.top ? r(0, 0, 240, 14, B.top, 0) + r(0, 14, 18, 136, B.side, 0) : r(0, 0, 40, 150, B.side, 0)), x0 = B.top ? 26 : 48, y0 = B.top ? 22 : 10, W = 240 - x0 - 8;
  if(page === 'dashboard'){
    if(id === 'A'){ for(var i = 0; i < 4; i++) g += r(x0 + i * (W / 4), y0, W / 4 - 5, 22, '#fff'); g += r(x0, y0 + 28, W * .64, 58, '#fff') + '<path d="M' + (x0 + 6) + ' ' + (y0 + 72) + ' q20 -18 40 -6 t40 -10 t40 4" fill="none" stroke="' + B.ink + '" stroke-width="2"/>' + r(x0 + W * .66, y0 + 28, W * .34 - 5, 58, '#fff'); for(var j = 0; j < 3; j++) g += r(x0 + j * (W / 3), y0 + 92, W / 3 - 5, 38, '#fff'); }
    else if(id === 'B'){ g += r(x0, y0, W * .7, 64, '#fff', 5) + '<path d="M' + (x0 + 8) + ' ' + (y0 + 50) + ' q22 -14 44 -4 t44 -8 t44 -10" fill="none" stroke="' + B.ink + '" stroke-width="2.2"/>' + r(x0 + 8, y0 + 8, 46, 9, B.ink, 2); for(var k = 0; k < 3; k++) g += r(x0 + W * .72, y0 + k * 22, W * .28 - 2, 19, '#fff', 4); g += r(x0, y0 + 70, W, 20, '#fff', 4); for(var m = 0; m < 4; m++) g += r(x0 + m * (W / 4), y0 + 96, W / 4 - 4, 30, '#fff', 4); }
    else { for(var t = 0; t < 6; t++) g += r(x0 + t * (W / 6), y0, W / 6 - 3, 18, '#fff', 3) + '<path d="M' + (x0 + t * (W / 6) + 4) + ' ' + (y0 + 14) + ' l6 -4 l6 2 l8 -6" fill="none" stroke="' + B.ink + '" stroke-width="1.2"/>'; g += r(x0, y0 + 24, W * .66, 56, '#fff', 3); for(var b2 = 0; b2 < 14; b2++){ var hh = 10 + (b2 * 7 % 26); g += r(x0 + 6 + b2 * 10, y0 + 74 - hh, 6, hh, b2 % 3 ? B.ink : B.acc, 1); } g += r(x0 + W * .68, y0 + 24, W * .32 - 2, 102, '#fff', 3); for(var f = 0; f < 6; f++) g += r(x0 + W * .7, y0 + 32 + f * 15, W * .26, 4, '#E3E0D8', 2); g += r(x0, y0 + 86, W * .32, 40, '#fff', 3) + r(x0 + W * .34, y0 + 86, W * .32, 40, '#fff', 3); }
  } else if(page === 'orders'){
    if(id === 'C'){ for(var s1 = 0; s1 < 5; s1++) g += r(x0 + s1 * (W * .7 / 5), y0, W * .7 / 5 - 3, 20, '#fff', 3) + r(x0 + s1 * (W * .7 / 5) + 4, y0 + 14, (W * .7 / 5 - 12) * (1 - s1 * .15), 3, B.ink, 1); g += r(x0 + W * .72, y0, W * .28 - 2, 120, '#fff', 3); for(var q2 = 0; q2 < 9; q2++) g += r(x0, y0 + 26 + q2 * 10.5, W * .7, 9, q2 % 2 ? '#fff' : '#FBFAF7', 1) + r(x0 + 4, y0 + 29 + q2 * 10.5, 22, 3, '#C9C4B9', 1) + r(x0 + W * .45, y0 + 29 + q2 * 10.5, 18, 3, q2 % 3 ? B.ink : B.acc, 1); }
    else { g += r(x0, y0, 60, 10, id === 'B' ? '#fff' : '#E8E3D8', 3) + r(x0 + 64, y0, 40, 10, '#ECE8DF', 3); for(var q = 0; q < 8; q++) g += r(x0, y0 + 16 + q * 14, W, 12, '#fff', id === 'B' ? 2 : 1) + r(x0 + 6, y0 + 20 + q * 14, 24, 4, '#9AA09C', 1) + r(x0 + W * .55, y0 + 20 + q * 14, 26, 4, q % 3 ? B.ink : '#D9A23D', 1) + (id === 'B' ? r(x0 + W * .55, y0 + 25 + q * 14, 26, 1.5, '#E1DCD2', 1) : r(x0 + W * .72, y0 + 20 + q * 14, 16, 4, '#C9C4B9', 2) + r(x0 + W * .8, y0 + 20 + q * 14, 16, 4, '#C9C4B9', 2)); }
  } else {
    if(id === 'B'){ for(var c1 = 0; c1 < 5; c1++) for(var r1 = 0; r1 < 2; r1++){ var cx = x0 + c1 * (W / 5), cy = y0 + r1 * 62; g += r(cx, cy, W / 5 - 5, 56, '#fff', 4) + r(cx, cy, W / 5 - 5, 34, ['#E1E6EE', '#E9EFE9', '#EEE9E2', '#E6E2EA', '#E9E6DE'][c1], 4) + '<path d="M' + (cx + 10) + ' ' + (cy + 10) + ' l6 -3 h6 l6 3 l-2 5 h-2 v12 h-14 v-12 h-2z" fill="' + ['#2C3E5C', '#3E6B4F', '#7A5A3A', '#5C4A6E', '#2F2F2F'][c1] + '"/>' + r(cx + 4, cy + 40, 26, 4, '#9AA09C', 1) + r(cx + 4, cy + 47, 14, 4, B.ink, 1); } }
    else if(id === 'C'){ for(var k1 = 0; k1 < 4; k1++) g += r(x0 + k1 * (W / 4), y0, W / 4 - 4, 18, '#fff', 3); for(var r2 = 0; r2 < 8; r2++){ g += r(x0, y0 + 24 + r2 * 13, W, 11, r2 % 2 ? '#fff' : '#FBFAF7', 1) + r(x0 + 4, y0 + 26 + r2 * 13, 8, 7, '#C9D3CE', 1) + '<path d="M' + (x0 + W * .4) + ' ' + (y0 + 32 + r2 * 13) + ' l5 -3 l5 1 l6 -4 l6 2" fill="none" stroke="' + B.ink + '" stroke-width="1"/>'; for(var hz = 0; hz < 5; hz++) g += r(x0 + W * .62 + hz * 9, y0 + 26 + r2 * 13, 7, 7, 'rgba(31,107,84,' + (.15 + ((hz + r2) * 37 % 80) / 100) + ')', 1); } }
    else { for(var r3 = 0; r3 < 9; r3++) g += r(x0, y0 + r3 * 13, W, 11, '#fff', 1) + r(x0 + 4, y0 + 2 + r3 * 13, 7, 7, '#C9D3CE', 1) + r(x0 + 16, y0 + 4 + r3 * 13, 40, 3, '#9AA09C', 1) + r(x0 + W * .6, y0 + 3 + r3 * 13, 18, 5, r3 % 4 ? '#DDEDE3' : '#FBEAD0', 2); }
  }
  return '<svg class="a3-thumb" viewBox="0 0 240 150" aria-hidden="true">' + g + '</svg>';
}
a2Page({path:'/admin/settings/look', section:'settings', tab:'look', en:'Admin look', bn:'অ্যাডমিনের চেহারা', perm:'settings.read', syn:'design layout look theme switch dashboard orders products', render:function(p, q, ctx){
  var me = a3LookMe(), team = a2Can('settings.team');
  var sec = A3_PAGES.map(function(pg){
    var cur = a3Cur(pg[0]), def = a2Set('look.' + pg[0]);
    var cards = a3Designs(pg[0]).map(function(D){ var on = D.id === cur;
      return '<article class="a3-look' + (on ? ' on' : '') + '">' + a3Thumb(pg[0], D.id) + '<div class="a3-lookb"><div class="a3-lookt"><span class="a3-dl">' + D.id + '</span><b>' + Le(D.en, D.bn) + '</b>' + (on ? '<span class="a2-pill ok">' + Le('In use', 'চালু আছে') + '</span>' : '') + (def === D.id ? '<span class="a2-pill line">' + Le('Team default', 'টিমের ডিফল্ট') + '</span>' : '') + '</div><p>' + Le(D.desc, D.descBn) + '</p>' +
        '<div class="a3-lookf">' + (on ? '<span class="a3-ok">' + a2i('check', 15) + Le('You are using this', 'আপনি এটা ব্যবহার করছেন') + '</span>' : a3Btn('a3-design', 'Use this design', 'এই ডিজাইন ব্যবহার করুন', {cls:'pri sm', attrs:' data-pg="' + pg[0] + '" data-v="' + D.id + '"'})) +
        '<a class="a3-btn sm gh" href="#' + (pg[0] === 'dashboard' ? '/admin?home=1&design=' : pg[0] === 'orders' ? '/admin/orders?design=' : '/admin/products?design=') + D.id + '">' + a2i('eye', 15) + '<span>' + Le('Preview', 'দেখুন') + '</span></a>' +
        (team && def !== D.id ? '<button type="button" class="a3-lnk sm" data-act="a3-design-team" data-pg="' + pg[0] + '" data-v="' + D.id + '">' + Le('Make team default', 'টিমের ডিফল্ট করুন') + '</button>' : '') + '</div></div></article>'; }).join('');
    return '<section class="a3-lookg"><div class="a3-lookh">' + a2i(pg[3], 18) + '<h2>' + Le(pg[1], pg[2]) + '</h2><span>' + (me[pg[0]] ? Le('Your own choice', 'আপনার নিজের বাছাই') : Le('Following the team default', 'টিমের ডিফল্ট মেনে')) + '</span></div><div class="a3-lookr">' + cards + '</div></section>';
  }).join('');
  return a2Head(ctx, {sub:Le('Pick how Dashboard, Orders and Products look for you. Every design shows the same numbers and runs the same actions — only the layout changes. You can also switch from the “…” menu on each page.', 'ড্যাশবোর্ড, অর্ডার আর প্রোডাক্ট পাতা আপনার কাছে কেমন দেখাবে বেছে নিন। সব ডিজাইনে একই সংখ্যা আর একই কাজ — শুধু সাজানো আলাদা। প্রতিটা পাতার “…” মেনু থেকেও বদলানো যায়।')}) + a2Tabs(ctx) + '<div class="a3-lookw">' + sec + '</div>';
}});
